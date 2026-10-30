/**
 * Placement accuracy simulation: learners from "knows nothing" to "knows everything".
 *
 *   node scripts/placement-sim.js                 print the table for every subject and mode
 *   node scripts/placement-sim.js --write         also write docs/PLACEMENT-ACCURACY.md
 *   node scripts/placement-sim.js --subject=math --mode=quick --seeds=20
 *
 * A simulated learner has a true ability in grades from the start of the subject
 * (below 0 knows nothing, at or past the last grade knows everything). It answers
 * by an item-response model: the chance of a right answer rises with ability
 * against the item's position, a multiple-choice item can be guessed at 1/choices,
 * and a known item is missed at a small slip rate. "Don't know" learners decline
 * items above their ability instead of guessing. The walk is the one the app runs
 * (services/adaptive-placement.js): the same belief, target, stop rule and
 * recommendation, so what is measured is what ships.
 *
 * The item positions are the calibrated points in content/placement-calibration/
 * <subject>.json (question text is not in source control for every subject; the
 * app attaches exactly these points to its questions). The learners' answers are
 * generated from a slope and slip that differ from the ones the walk assumes, so
 * the walk is not graded against its own model. Positions are taken as exact:
 * judge noise in the calibration is not simulated, so these numbers are a best
 * case for the item set, not a promise to a real learner.
 *
 * A subject with no calibrated points is listed as not simulated, never guessed.
 */
const fs = require('fs');
const path = require('path');

const adaptive = require('../services/adaptive-placement');

const ROOT = path.join(__dirname, '..');
const TRUE_WIDTH = 0.3; // the learner's own slope; the walk assumes 0.2
const TRUE_SLIP = 0.03; // the walk assumes 0.10
const IDK_RATE = 0.9; // chance a "don't know" learner declines an item above their ability
const SUBJECTS = ['math', 'english', 'reading', 'iq', 'act', 'spanish', 'chess', 'piano', 'basketball'];

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function spanOf(trackId) {
  // eslint-disable-next-line global-require
  return require('../config/subject-placement').gradesFor(trackId).length;
}

/** The subject's items as per-grade lists of {pos, band, choices}, or null when none are calibrated. */
function bankFor(trackId) {
  const file = path.join(ROOT, 'content', 'placement-calibration', `${trackId}.json`);
  let points;
  try { points = Object.values(JSON.parse(fs.readFileSync(file, 'utf8')).points || {}); } catch { return null; }
  if (!points.length) return null;
  const span = spanOf(trackId);
  const sets = Array.from({ length: span }, () => []);
  for (const pos of points.sort((a, b) => a - b)) {
    sets[Math.max(0, Math.min(span - 1, Math.floor(pos)))].push({ pos, choices: ['a', 'b', 'c', 'd'] });
  }
  return { span, sets, items: points.length };
}

/** The chance learner `ability` answers an item at `pos` right when it knows or guesses. */
function chanceRight(ability, pos, guess) {
  const known = 1 / (1 + Math.exp(-(ability - pos) / TRUE_WIDTH));
  return guess + (1 - TRUE_SLIP - guess) * known;
}

/** The grade a learner of this ability truly belongs in (index), clamped to the subject. */
function trueGrade(ability, span) {
  return Math.max(0, Math.min(span - 1, Math.floor(ability)));
}

/** One sitting. Returns {placed, asked}. `dontKnow` learners decline items above their ability. */
function sit(bank, mode, ability, random, { dontKnow = false } = {}) {
  const { span, sets } = bank;
  const blocks = adaptive.blocksFor(sets);
  const answered = [];
  const asked = [];
  let post = adaptive.posterior(span, answered);
  let block = adaptive.nextBlock(blocks, asked, adaptive.firstTarget(span, NaN));
  while (block) {
    for (const i of block.idx) {
      const q = sets[block.grade][i];
      const guess = 1 / q.choices.length;
      let correct;
      let idk = false;
      if (dontKnow && q.pos > ability && random() < IDK_RATE) { correct = false; idk = true; }
      else correct = random() < chanceRight(ability, q.pos, guess);
      answered.push({ pos: q.pos, guess, correct, ...(idk ? { idk: true } : {}) });
    }
    asked.push({ grade: block.grade, part: block.part });
    post = adaptive.posterior(span, answered);
    block = adaptive.done(mode, answered, post) ? null : adaptive.nextBlock(blocks, asked, adaptive.nextTarget(answered, post));
  }
  return { placed: adaptive.recommend(span, post).index, asked: answered.length };
}

/** Abilities from knows-nothing to knows-everything, as fractions of the subject plus both extremes. */
function abilities(span) {
  const out = [{ label: 'nothing', ability: -1 }];
  for (const f of [0.02, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.98]) out.push({ label: `${Math.round(f * 100)}%`, ability: f * span });
  out.push({ label: 'everything', ability: span + 1 });
  return out;
}

function measure(trackId, mode, { seeds = 15, seed = 20261030, dontKnow = false } = {}) {
  const bank = bankFor(trackId);
  if (!bank) return null;
  const rows = [];
  abilities(bank.span).forEach(({ label, ability }, a) => {
    const truth = trueGrade(ability, bank.span);
    const errors = [];
    let questions = 0;
    for (let s = 0; s < seeds; s++) {
      const r = sit(bank, mode, ability, rng(seed + a * 7919 + s * 104729 + trackId.length), { dontKnow });
      errors.push(r.placed - truth);
      questions += r.asked;
    }
    rows.push({
      label, ability, truth, seeds,
      within1: errors.filter((e) => Math.abs(e) <= 1).length / seeds,
      exact: errors.filter((e) => e === 0).length / seeds,
      meanError: errors.reduce((x, y) => x + y, 0) / seeds,
      meanAbs: errors.reduce((x, y) => x + Math.abs(y), 0) / seeds,
      worst: errors.reduce((w, e) => (Math.abs(e) > Math.abs(w) ? e : w), 0),
      questions: questions / seeds,
    });
  });
  return { span: bank.span, items: bank.items, rows };
}

const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const signed = (x) => (x > 0 ? `+${x}` : `${x}`);

function table(result) {
  const lines = ['| true level | true grade | placed within 1 | exact | mean error | worst | questions |', '|---|---|---|---|---|---|---|'];
  for (const r of result.rows) {
    lines.push(`| ${r.label} | ${r.truth + 1} | ${pct(r.within1)} | ${pct(r.exact)} | ${(r.meanError >= 0 ? '+' : '') + r.meanError.toFixed(2)} | ${signed(r.worst)} | ${r.questions.toFixed(1)} |`);
  }
  return lines.join('\n');
}

function report({ subjects = SUBJECTS, modes = ['quick', 'balanced', 'accurate'], seeds = 15 } = {}) {
  const out = [];
  for (const trackId of subjects) {
    const base = measure(trackId, 'quick', { seeds: 1 });
    if (!base) { out.push(`## ${trackId}\n\nNot simulated: no calibrated items in source control (content/placement-calibration/${trackId}.json has no points).\n`); continue; }
    out.push(`## ${trackId} (${base.span} grades, ${base.items} calibrated items)\n`);
    for (const mode of modes) {
      for (const dontKnow of [false, true]) {
        const res = measure(trackId, mode, { seeds, dontKnow });
        const worst = Math.min(...res.rows.map((r) => r.within1));
        const mean = res.rows.reduce((s, r) => s + r.questions, 0) / res.rows.length;
        out.push(`### ${mode}${dontKnow ? ", learners who press \"I don't know\"" : ''}: lowest share within 1 grade ${pct(worst)}, mean ${mean.toFixed(1)} questions\n\n${table(res)}\n`);
      }
    }
  }
  return out.join('\n');
}

module.exports = { bankFor, sit, measure, abilities, trueGrade, chanceRight, rng, report, SUBJECTS };

if (require.main === module) {
  const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=')[1] : d; };
  const subjects = arg('subject') ? [arg('subject')] : SUBJECTS;
  const modes = arg('mode') ? [arg('mode')] : ['quick', 'balanced', 'accurate'];
  const body = report({ subjects, modes, seeds: Number(arg('seeds', 15)) });
  if (process.argv.includes('--write')) {
    const head = `# Placement accuracy (baseline, before fixes)

Generated by \`node scripts/placement-sim.js --write\`. Fixed seed, so it reproduces.

**What was simulated.** Learners whose true ability runs from "knows nothing" (below the first grade) to
"knows everything" (past the last), each sitting the adaptive walk the app runs. Answers come from an
item-response model: the chance of a right answer rises with ability against the item's calibrated position
(slope ${TRUE_WIDTH} grades, ${TRUE_SLIP * 100}% slips), a multiple-choice item is guessed at 1 in 4, and the
"I don't know" learners decline ${IDK_RATE * 100}% of items above their ability (the app has no such button yet, so it
scores a decline as a wrong answer). The true grade is the grade the ability falls in; error is placed grade minus
true grade.

**Limits.** Item positions are the calibrated points in \`content/placement-calibration/\` taken as exact, so judge
noise in those points is not simulated and the numbers are a best case for the item sets. Items are 4-choice.
Subjects with no calibrated points are not simulated (listed below as such), not estimated.

`;
    fs.writeFileSync(path.join(ROOT, 'docs', 'PLACEMENT-ACCURACY.md'), `${head}${body}\n`);
    console.log('wrote docs/PLACEMENT-ACCURACY.md');
  } else console.log(body);
}
