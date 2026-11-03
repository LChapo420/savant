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

// --limits=quick:max:min:sure,balanced:max:min:sure tries other walk limits without editing the service (docs/ONBOARDING-MODES.md);
// --quick-scale=0 turns off ADAPTIVE_QUICK_SCALE (the span-based top-up Quick gets).
{
  const arg0 = (n) => { const h = process.argv.find((x) => x.startsWith('--' + n + '=')); return h ? h.slice(n.length + 3) : null; };
  const lim = arg0('limits');
  if (lim) for (const part of lim.split(',')) { const [m, max, min, sure] = part.split(':'); Object.assign(adaptive.MODES[m], { max: Number(max), min: Number(min), sure: Number(sure), confidence: Number(sure) }); }
  if (arg0('quick-scale') !== null) process.env.ADAPTIVE_QUICK_SCALE = arg0('quick-scale');
  // --quick=fast: the 5-minute Quick this branch tried and did not ship (a clock-bound walk that prefers short questions, minimum 10 answers, no lift); --quick-min=n its minimum.
  if (arg0('quick') === 'fast') Object.assign(adaptive.MODES.quick, { min: 10, noLift: true });
  if (arg0('quick-min')) adaptive.MODES.quick.min = Number(arg0('quick-min'));
}

const ROOT = path.join(__dirname, '..');
const TRUE_WIDTH = 0.3; // the learner's own slope; the walk assumes 0.2
const TRUE_SLIP = 0.03; // the walk assumes 0.10
const IDK_RATE = 0.9; // chance a "don't know" learner declines an item above their ability
const KEEP_MARK = '<!-- unit-sim:start -->';
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

/**
 * Like bankFor, but each item also carries `sec`, its estimated seconds (services/placement-seconds.js: from its words and answer
 * type, not timed on people), read from the stored question sets, so it needs the data file (DB_FILE=<a copy>). Only the
 * calibrated items, as bankFor. Null when the subject has no stored questions.
 */
function bankWithSeconds(trackId) {
  const base = bankFor(trackId);
  if (!base) return null;
  // eslint-disable-next-line global-require
  const subjectPlacement = require('../services/subject-placement');
  // eslint-disable-next-line global-require
  const { questionSeconds } = require('../services/placement-seconds');
  // eslint-disable-next-line global-require
  const rules = require('../config/subject-placement');
  const sets = rules.gradesFor(trackId).map((gradeId) => (subjectPlacement.questionsFor(trackId, gradeId) || [])
    .filter((q) => Number.isFinite(q.pos))
    .map((q) => ({ pos: q.pos, choices: q.choices || ['a', 'b', 'c', 'd'], sec: questionSeconds(q, trackId) })));
  const items = sets.reduce((n, g) => n + g.length, 0);
  if (!items) return null;
  return { span: base.span, sets, items };
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
function sit(bank, mode, ability, random, { dontKnow = false, clock = null, fast = false } = {}) {
  const { span, sets } = bank;
  // clock = { seconds, pace }: a learner takes pace x an item's estimated seconds (+-20%); the walk ends once the clock has run out
  // and the mode's minimum has been answered (the same rule as services/subject-placement.js `late`), however many questions fit.
  let elapsed = 0;
  const pace = clock ? clock.pace : 1;
  const blocks = adaptive.blocksFor(sets);
  const answered = [];
  const asked = [];
  let post = adaptive.posterior(span, answered);
  let block = adaptive.nextBlock(blocks, asked, adaptive.firstTarget(span, NaN), { fast });
  const ctxOf = () => ({ topLeft: adaptive.topLeft(span, blocks, asked) });
  while (block) {
    for (const i of block.idx) {
      const q = sets[block.grade][i];
      const guess = 1 / q.choices.length;
      let correct;
      let idk = false;
      if (dontKnow && q.pos > ability && random() < IDK_RATE) { correct = false; idk = true; }
      else correct = random() < chanceRight(ability, q.pos, guess);
      answered.push({ pos: q.pos, guess, correct, ...(idk ? { idk: true } : {}) });
      if (clock && Number.isFinite(q.sec)) elapsed += q.sec * pace * (0.8 + 0.4 * random());
    }
    asked.push({ grade: block.grade, part: block.part });
    post = adaptive.posterior(span, answered);
    const late = clock && adaptive.clockEnded(mode, span, answered.length, elapsed * 1000, clock.seconds * 1000);
    block = adaptive.done(mode, answered, post, ctxOf()) || late ? null : adaptive.chooseBlock(blocks, asked, adaptive.nextTarget(answered, post, ctxOf()), post, answered.length, { fast });
  }
  return { placed: adaptive.recommend(span, post, answered).index, asked: answered.length, seconds: elapsed };
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

/**
 * Like measure, but each learner's ability is drawn uniformly inside the level's grade instead of sitting on its
 * boundary. A learner exactly on a grade boundary is half in each grade, so the in-grade draw is the fair test of
 * "placed within one grade"; the boundary case is what `measure` shows. Levels are the same grid as `abilities`.
 */
function measureSpread(trackId, mode, { seeds = 40, seed = 20261030, dontKnow = false, clockSeconds = null, fast = false, pace = null } = {}) {
  const bank = clockSeconds ? bankWithSeconds(trackId) : bankFor(trackId);
  if (!bank) return null;
  const seconds = [];
  const rows = abilities(bank.span).map(({ label, ability }, a) => {
    const edge = ability < 0 || ability >= bank.span;
    const errors = [];
    let questions = 0;
    for (let s = 0; s < seeds; s++) {
      const random = rng(seed + a * 7919 + s * 104729 + trackId.length);
      const own = edge ? ability : Math.floor(ability) + random();
      // A learner's pace: lognormal around the estimate (sd 0.28, as services/onboarding/model.js), or fixed by --pace.
      const gauss = Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random());
      const clock = clockSeconds ? { seconds: clockSeconds, pace: pace || Math.exp(0.28 * gauss) } : null;
      const r = sit(bank, mode, own, random, { dontKnow, clock, fast });
      errors.push(r.placed - trueGrade(own, bank.span));
      questions += r.asked;
      if (clockSeconds) seconds.push(r.seconds);
    }
    return {
      label, seeds,
      // The grade the level sits in (the spread draws inside it); the edges are the first and last grade.
      truth: trueGrade(edge ? ability : Math.floor(ability), bank.span),
      within1: errors.filter((e) => Math.abs(e) <= 1).length / seeds,
      exact: errors.filter((e) => e === 0).length / seeds,
      meanError: errors.reduce((x, y) => x + y, 0) / seeds,
      worst: errors.reduce((w, e) => (Math.abs(e) > Math.abs(w) ? e : w), 0),
      questions: questions / seeds,
    };
  });
  seconds.sort((a, b) => a - b);
  const at = (q) => (seconds.length ? seconds[Math.min(seconds.length - 1, Math.floor(q * seconds.length))] / 60 : null);
  return { span: bank.span, items: bank.items, rows, minutes: { median: at(0.5), p90: at(0.9) } };
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

module.exports = { bankFor, bankWithSeconds, sit, measure, measureSpread, abilities, trueGrade, chanceRight, rng, report, SUBJECTS };

if (require.main === module) {
  const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=')[1] : d; };
  const subjects = arg('subject') ? [arg('subject')] : SUBJECTS;
  const modes = arg('mode') ? [arg('mode')] : ['quick', 'balanced', 'accurate'];
  // --summary: one line per subject and mode across all abilities (the spread draws inside each grade), for docs/ONBOARDING-MODES.md.
  if (process.argv.includes('--summary')) {
    const seeds = Number(arg('seeds', 40));
    const seed = Number(arg('seed', 20261030));
    // --clock=<minutes>: end each sitting on that clock using each item's estimated seconds (needs DB_FILE=<a copy of the data file>);
    // --pace=<x> fixes every learner's pace (1 = the estimate; default a spread of paces); --fast prefers short questions in Quick.
    const clockSeconds = arg('clock', null) ? Number(arg('clock')) * 60 : null;
    const fastWalk = process.argv.includes('--fast');
    const lines = ['subject,mode,within1,exact,lowest_level_within1,mean_questions' + (clockSeconds ? ',median_min,p90_min' : '')];
    const tot = {};
    for (const trackId of subjects) {
      for (const mode of modes) {
        const res = measureSpread(trackId, mode, { seeds, seed, clockSeconds, fast: fastWalk && (mode === 'quick' || process.argv.includes('--fast-all')), pace: arg('pace', null) ? Number(arg('pace')) : null });
        if (!res) continue;
        const mean = (f) => res.rows.reduce((a, r) => a + f(r), 0) / res.rows.length;
        const row = { w1: mean((r) => r.within1), ex: mean((r) => r.exact), low: Math.min(...res.rows.map((r) => r.within1)), q: mean((r) => r.questions) };
        lines.push([trackId, mode, row.w1.toFixed(4), row.ex.toFixed(4), row.low.toFixed(3), row.q.toFixed(1), ...(clockSeconds ? [res.minutes.median.toFixed(2), res.minutes.p90.toFixed(2)] : [])].join(','));
        const t = tot[mode] || (tot[mode] = { w1: 0, ex: 0, q: 0, n: 0 });
        t.w1 += row.w1; t.ex += row.ex; t.q += row.q; t.n += 1;
      }
    }
    for (const [mode, t] of Object.entries(tot)) lines.push(['ALL', mode, (t.w1 / t.n).toFixed(4), (t.ex / t.n).toFixed(4), '', (t.q / t.n).toFixed(1)].join(','));
    console.log(lines.join('\n'));
    process.exit(0);
  }
  if (process.argv.includes('--after')) {
    const out = ['# Placement accuracy after the P4 fixes', '',
      'Generated by `node scripts/placement-sim.js --after`. 40 simulated learners per level, abilities spread across the level\'s grade',
      '(a learner on a grade boundary is half in each grade, so the boundary-only table in PLACEMENT-ACCURACY.md reads about a grade low).',
      'Same item-response model and limits as the baseline. Subjects with no calibrated items are not simulated.', ''];
    for (const trackId of subjects) {
      for (const mode of modes) {
        const res = measureSpread(trackId, mode, { seeds: 40 });
        if (!res) continue;
        const low = Math.min(...res.rows.map((r) => r.within1));
        out.push(`## ${trackId}, ${mode}: lowest share within 1 grade ${pct(low)}, mean ${(res.rows.reduce((s, r) => s + r.questions, 0) / res.rows.length).toFixed(1)} questions`, '', table(res), '');
      }
    }
    // Sections appended after the marker by other scripts (scripts/unit-placement-sim.js --write) are kept.
    const afterFile = path.join(ROOT, 'docs', 'PLACEMENT-ACCURACY-AFTER.md');
    const old = fs.existsSync(afterFile) ? fs.readFileSync(afterFile, 'utf8') : '';
    const kept = old.includes(KEEP_MARK) ? `\n${KEEP_MARK}${old.split(KEEP_MARK)[1]}` : '';
    fs.writeFileSync(afterFile, out.join('\n') + kept);
    console.log('wrote docs/PLACEMENT-ACCURACY-AFTER.md');
    process.exit(0);
  }
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
