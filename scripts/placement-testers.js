/**
 * Simulated testers for the subject placement quiz.
 *
 *   node scripts/placement-testers.js judge english      locate every question (MiMo, cached)
 *   node scripts/placement-testers.js run english        walk the quiz with simulated testers
 *   node scripts/placement-testers.js run math --mode=quick --seeds=3
 *
 * The earlier calibration (english-placement-calibration.js) assumes every
 * question sits exactly at the grade it was written for, so it can only ever
 * agree with the writer. These testers do not take the writer's word for it.
 *
 * 1. A judge reads each question beside the curriculum outline and says, on its
 *    own, the first point in the curriculum (grade and unit) at which a learner
 *    who has worked through everything before it would reliably answer it, and
 *    whether the key is right. Questions are shuffled across grades before they
 *    are batched, so a batch never says which grade its questions were written for.
 * 2. A tester is a point in the curriculum: a grade and how far through it. It
 *    answers a question it has passed with a small chance of a slip, one near its
 *    frontier sometimes, and one beyond it only by guessing among the options.
 *    A question whose key the judge found wrong is marked wrong for a tester who
 *    knows the material, which is what would happen to a real one.
 * 3. The tester sits the quiz exactly as the walk runs it (the stop and skip
 *    rules from config/subject-placement.js), and the recommendation it gets is
 *    compared with the grade it is actually in. A pass is within one grade.
 *
 * The judge's verdicts are cached in curriculum-build/placement-judge/<track>.json,
 * keyed by the question text, so re-running after a change re-judges only the
 * questions that changed.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
const here = path.join(ROOT, '.env');
dotenv.config({ path: fs.existsSync(here) ? here : path.join(ROOT, '..', '.env') });

const curriculum = require('../config/curriculum');
const rules = require('../config/subject-placement');
const placement = require('../services/subject-placement');
const cascade = require('../services/fact-cascade');
const adaptive = require('../services/adaptive-placement');
const unitPlacement = require('../services/unit-placement');

const CACHE_DIR = path.join(ROOT, 'curriculum-build', 'placement-judge');
const BATCH = Number(process.env.JUDGE_BATCH || 10);
const PARALLEL = Number(process.env.JUDGE_PARALLEL || 3);

// ── the curriculum, as the judge sees it ───────────────────────────────────

/** Each grade's units in order, with their lesson titles. */
function unitsOf(trackId, gradeId) {
  const grade = curriculum.getGrade(trackId, gradeId);
  const units = [];
  let level = 1;
  while (level <= grade.pathLength) {
    const unit = cascade.unitOf(trackId, gradeId, level);
    // The grade's closing summary is review, not a unit with anything new in it.
    if (unit.lessons.some((l) => !/grade summary/i.test(l.title))) units.push(unit);
    level = unit.end + 1;
  }
  return units;
}

function outline(trackId, titlesPerUnit) {
  return rules.gradesFor(trackId).map((id, index) => {
    const grade = curriculum.getGrade(trackId, id);
    const units = unitsOf(trackId, id).map((u, i) => `U${i + 1} ${u.lessons.slice(0, titlesPerUnit).map((l) => l.title.slice(0, 48)).join(' / ')}`);
    return `G${index + 1} ${id} — ${grade.name}\n  ${units.join('; ')}`;
  }).join('\n');
}

// ── the judge ──────────────────────────────────────────────────────────────

// The options are sorted first: the order a learner sees them in is shuffled per
// grade, and changes when another question in the grade changes.
function keyOf(q) {
  return adaptive.questionKey(q);
}

/** The key before the options were sorted, for carrying old verdicts over. */
function oldKeyOf(q) {
  return crypto.createHash('sha1').update(`${q.prompt}\u0000${q.answer}\u0000${(q.choices || []).join('\u0001')}`).digest('hex').slice(0, 16);
}

// JUDGE_TAG keeps a second, independent judging apart (to measure how far two
// readings of the same questions agree).
function cachePath(trackId) { return path.join(CACHE_DIR, `${trackId}${process.env.JUDGE_TAG || ""}.json`); }
function readCacheTag(trackId, tag) {
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${trackId}${tag}.json`), 'utf8')); } catch { return {}; }
}
function readCache(trackId) {
  try { return JSON.parse(fs.readFileSync(cachePath(trackId), 'utf8')); } catch { return {}; }
}
function writeCache(trackId, cache) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(trackId), JSON.stringify(cache, null, 1));
}

/** Every question of the subject, as the learner meets it, with where it was written for. */
function allQuestions(trackId) {
  const out = [];
  rules.gradesFor(trackId).forEach((gradeId, gradeIndex) => {
    const qs = placement.questionsFor(trackId, gradeId) || [];
    qs.forEach((q, i) => out.push({ ...q, grade_id: gradeId, grade_index: gradeIndex, index: i, key: keyOf(q) }));
  });
  return out;
}

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'grade', 'unit', 'key'],
        properties: {
          id: { type: 'string' },
          grade: { type: 'integer', description: 'G number from the outline' },
          unit: { type: 'integer', description: 'U number inside that grade' },
          key: { type: 'string', enum: ['correct', 'wrong', 'ambiguous'] },
          note: { type: 'string', description: 'Only when the key is wrong or ambiguous: why, and the right answer.' },
        },
      },
    },
  },
};

function judgeSystem(trackId, gradeCount) {
  return [
    `You are an experienced ${trackId} teacher and curriculum specialist. You are given the outline of one curriculum`,
    `(${gradeCount} grades in order, G1 first; each grade's units in order, U1 first, with lesson titles) and a few`,
    'placement questions taken from anywhere in it, in no particular order.',
    '',
    'For each question, say the FIRST point in this curriculum — grade G and unit U — by which a learner who has',
    'worked through everything up to and including that unit would reliably answer it (about 9 in 10 such learners',
    'right). Judge from what the question actually requires, not from how it looks or how long it is:',
    '- a question that only needs an earlier skill, or everyday knowledge, belongs at that earlier point;',
    '- a question that needs a skill this curriculum teaches late belongs where that skill is taught;',
    '- multiple choice is answered by recognising the right option, which is easier than producing it.',
    '',
    'Then check the answer key: "correct" if the keyed answer is right and the only right option, "wrong" if it is',
    'not right, "ambiguous" if another option is also defensible. Work the question yourself before deciding.',
    'Answer every question by its id.',
  ].join('\n');
}

function judgeUser(trackId, batch, titlesPerUnit) {
  const items = batch.map((q) => [
    `id: ${q.key}`,
    `question: ${q.prompt}`,
    q.choices ? `options: ${q.choices.map((c) => `[${c}]`).join(' ')}` : 'options: (type-in answer)',
    `keyed answer: ${q.answer}`,
  ].join('\n')).join('\n\n');
  return `CURRICULUM OUTLINE\n${outline(trackId, titlesPerUnit)}\n\nQUESTIONS\n${items}`;
}

async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

function shuffled(list, seed) {
  const out = list.slice();
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function judge(trackId) {
  // eslint-disable-next-line global-require
  const mimo = require('../services/providers/mimo');
  const gradeIds = rules.gradesFor(trackId);
  const titlesPerUnit = gradeIds.length > 20 ? 1 : 2;
  const cache = readCache(trackId);
  const todo = shuffled(allQuestions(trackId).filter((q) => !cache[q.key]), 0x5eed + (process.env.JUDGE_TAG || "").length * 7919);
  console.log(`${trackId}: ${todo.length} questions to judge (${Object.keys(cache).length} cached)`);
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  const usage = { input: 0, output: 0 };
  let done = 0;
  await pool(batches, PARALLEL, async (batch) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const reply = await mimo.structuredStream({
        role: 'placement',
        system: judgeSystem(trackId, gradeIds.length),
        user: judgeUser(trackId, batch, titlesPerUnit),
        schema: JUDGE_SCHEMA,
        schemaName: 'submit_locations',
        maxTokens: 20000,
      }).catch((err) => { console.log(`  batch failed: ${err.message}`); return null; });
      const rows = reply && reply.data && Array.isArray(reply.data.questions) ? reply.data.questions : [];
      if (reply && reply.usage) { usage.input += reply.usage.input_tokens || 0; usage.output += reply.usage.output_tokens || 0; }
      let got = 0;
      for (const row of rows) {
        const q = batch.find((b) => b.key === String(row.id).trim());
        const gi = Number(row.grade) - 1;
        if (!q || !(gi >= 0 && gi < gradeIds.length)) continue;
        const units = unitsOf(trackId, gradeIds[gi]).length;
        cache[q.key] = {
          written_for: q.grade_id,
          band: q.band,
          grade_id: gradeIds[gi],
          grade_index: gi,
          unit: Math.max(1, Math.min(units, Number(row.unit) || 1)),
          units,
          key: row.key,
          note: row.note || '',
          prompt: String(q.prompt).slice(0, 160),
        };
        got++;
      }
      done += got;
      console.log(`  batch: ${got}/${batch.length} judged in ${Math.round((Date.now() - started) / 1000)}s (${done}/${todo.length})`);
      writeCache(trackId, cache);
      if (got === batch.length) break;
      batch = batch.filter((q) => !cache[q.key]); // eslint-disable-line no-param-reassign
    }
  });
  console.log(`tokens: ${JSON.stringify(usage)}`);
  const missing = allQuestions(trackId).filter((q) => !cache[q.key]).length;
  if (missing) console.log(`${missing} questions still unjudged`);
  return cache;
}

// ── the testers ────────────────────────────────────────────────────────────

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const SLIP = Number(process.env.TESTER_SLIP || 0.05);
const RAMP = Number(process.env.TESTER_RAMP || 0.35); // grades of "sometimes" below a question's point

/** The chance a tester at `at` (grade index + fraction through it) answers `q` right. */
function chance(q, verdict, at) {
  const guess = q.choices ? 1 / q.choices.length : 0.02;
  if (!verdict) return guess;
  const point = verdict.grade_index + (verdict.unit - 0.5) / verdict.units;
  const known = verdict.key === 'wrong' ? guess : verdict.key === 'ambiguous' ? 0.5 : 1 - SLIP;
  const d = at - point;
  if (d >= 0) return known;
  if (d <= -RAMP) return guess;
  return guess + (known - guess) * (1 + d / RAMP);
}

function scoreGrade(trackId, gradeId, verdicts, at, random) {
  const qs = placement.questionsFor(trackId, gradeId) || [];
  const bands = {};
  const answers = [];
  let correct = 0;
  qs.forEach((q) => {
    const right = random() < chance(q, verdicts[keyOf(q)], at);
    const band = bands[q.band] || (bands[q.band] = { asked: 0, correct: 0 });
    band.asked++;
    if (right) { band.correct++; correct++; }
    answers.push({ band: q.band, correct: right });
  });
  return { grade_id: gradeId, asked: qs.length, correct, bands, answers };
}

/** The walk as the app runs it today: every grade from the first, the stop rule, skips taken. */
function walkFull(trackId, verdicts, at, random) {
  const gradeIds = rules.gradesFor(trackId);
  const scores = [];
  const skipped = [];
  let position = 0;
  let asked = 0;
  while (position < gradeIds.length) {
    const score = scoreGrade(trackId, gradeIds[position], verdicts, at, random);
    asked += score.asked;
    scores.push(score);
    position++;
    if (rules.shouldStop(scores)) break;
    const offer = rules.skipOffer(scores, position, gradeIds.length);
    if (offer) { skipped.push(offer); position += offer.count; }
  }
  const p = { grade_ids: gradeIds, scores, skipped };
  const rec = trackId === 'english' ? placement.recommendEnglishFromShape(trackId, p) : placement.recommendFromShape(trackId, p);
  return { recommended: gradeIds.indexOf(rec.recommended_grade_id), asked, scores };
}

// ── the adaptive walk (Quick / Balanced / Accurate) ────────────────────────
//
// The app knows only where each question was written for: its grade and its band.
// The testers answer from where the judge says the question really sits. Keeping
// the two apart is what makes a mispitched question show up as a misplaced tester
// instead of being quietly agreed with.

/** Where in its grade a band was written for (0 = the start of the grade, 1 = the end). */
const BAND_AT = { easy: 0.15, medium: 0.45, hard: 0.75, capstone: 0.98 };
const STEP = 0.05;

/** What the walk assumes: right past the question's point, a guess well before it. */
function assumed(x, pos, guess) {
  return guess + (0.95 - guess) / (1 + Math.exp(-(x - pos) / 0.12));
}

/** The posterior over the learner's position, on a grid across the subject. */
function posterior(n, answered) {
  const grid = [];
  for (let x = 0; x <= n + 1e-9; x += STEP) grid.push(x);
  const logp = grid.map((x) => answered.reduce((sum, a) => {
    const p = assumed(x, a.pos, a.guess);
    return sum + Math.log(a.correct ? p : 1 - p);
  }, 0));
  const top = Math.max(...logp);
  const w = logp.map((l) => Math.exp(l - top));
  const total = w.reduce((a, b) => a + b, 0);
  return { grid, w: w.map((v) => v / total) };
}

function median({ grid, w }) {
  let acc = 0;
  for (let i = 0; i < grid.length; i++) { acc += w[i]; if (acc >= 0.5) return grid[i]; }
  return grid[grid.length - 1];
}

function massWithin(post, lo, hi) {
  return post.grid.reduce((sum, x, i) => (x >= lo && x <= hi ? sum + post.w[i] : sum), 0);
}

const MODES = {
  // Question caps assume about 25 seconds a question; the app also stops on the clock.
  quick: { max: 36, min: 12, sure: 0.90 },
  balanced: { max: 80, min: 20, sure: 0.97 },
  accurate: { max: 180, min: 40, sure: 0.995 },
};

function walkAdaptive(mode) {
  return (trackId, verdicts, at, random, { start = null } = {}) => {
    const gradeIds = rules.gradesFor(trackId);
    const n = gradeIds.length;
    // CALIB=<cache tag> calibrates the walk on one judge's points (e.g. "-claude")
    // so it can be tested against the other's: a held-out check.
    const calib = process.env.CALIB !== undefined ? readCacheTag(trackId, process.env.CALIB) : null;
    const sets = gradeIds.map((id) => (placement.questionsFor(trackId, id) || []).map((q) => {
      if (!calib) return q;
      const v = calib[keyOf(q)];
      return v ? { ...q, pos: v.grade_index + (v.unit - 0.5) / v.units } : q;
    }));
    const blocks = adaptive.blocksFor(sets);
    const answered = [];
    const asked = [];
    let post = adaptive.posterior(n, answered);
    let target = adaptive.firstTarget(n, start);
    while (!adaptive.done(mode, answered, post)) {
      const block = adaptive.nextBlock(blocks, asked, target);
      if (!block) break;
      asked.push(block);
      for (const i of block.idx) {
        const q = sets[block.grade][i];
        const correct = random() < chance(q, verdicts[keyOf(q)], at);
        answered.push({ pos: adaptive.positionOf(q, block.grade), guess: q.choices ? 1 / q.choices.length : 0.02, correct });
      }
      post = adaptive.posterior(n, answered);
      target = adaptive.nextTarget(answered, post);
    }
    const rec = adaptive.recommend(n, post);
    // How kind the walk was: questions written more than a grade past where the tester really is.
    const tooHard = answered.filter((a) => a.pos > at + 1).length;
    const firstFive = answered.slice(0, 5).filter((a) => a.pos > at + 1).length;
    return { recommended: rec.index, asked: answered.length, tooHard, firstFive, scores: [] };
  };
}

const WALKS = { full: walkFull, quick: walkAdaptive('quick'), balanced: walkAdaptive('balanced'), accurate: walkAdaptive('accurate') };

function run(trackId, { mode = 'full', seeds = 2, fractions = [0.15, 0.5, 0.85, 0.99], verbose = false } = {}) {
  const verdicts = readCache(trackId);
  const gradeIds = rules.gradesFor(trackId);
  const all = allQuestions(trackId);
  const unjudged = all.filter((q) => !verdicts[q.key]).length;
  if (unjudged) console.log(`warning: ${unjudged} of ${all.length} questions are unjudged (treated as guess-only)`);
  const walk = WALKS[mode];
  const rows = [];
  for (let g = 0; g < gradeIds.length; g++) {
    for (const f of fractions) {
      for (let s = 1; s <= seeds; s++) {
        const random = rng(0xab1e + g * 7919 + Math.round(f * 1000) * 31 + s * 104729);
        const out = walk(trackId, verdicts, g + f, random);
        rows.push({ grade: g, f, seed: s, recommended: out.recommended, off: out.recommended - g, asked: out.asked, tooHard: out.tooHard || 0, firstFive: out.firstFive || 0, shape: verbose ? out.scores.map((x) => x.correct).join('') : '' });
      }
    }
  }
  const misses = rows.filter((r) => Math.abs(r.off) > 1);
  const askedMax = Math.max(...rows.map((r) => r.asked));
  const askedAvg = Math.round(rows.reduce((n, r) => n + r.asked, 0) / rows.length);
  console.log(`${trackId} / ${mode}: ${rows.length} testers, ${rows.length - misses.length} within one grade, `
    + `${rows.filter((r) => r.off === 0).length} exact; questions asked avg ${askedAvg}, max ${askedMax}; `
    + `too hard (over a grade past the tester) avg ${(rows.reduce((n, r) => n + r.tooHard, 0) / rows.length).toFixed(1)}, `
    + `in the first five ${(rows.reduce((n, r) => n + r.firstFive, 0) / rows.length).toFixed(2)}`);
  for (let g = 0; g < gradeIds.length; g++) {
    const mine = rows.filter((r) => r.grade === g);
    const offs = mine.map((r) => (r.off > 0 ? `+${r.off}` : String(r.off))).join(' ');
    const bad = mine.some((r) => Math.abs(r.off) > 1);
    console.log(`  ${bad ? 'MISS' : 'ok  '} G${g + 1} ${gradeIds[g].padEnd(30)} offsets ${offs}${verbose ? `  ${mine.map((r) => r.shape).join(' | ')}` : ''}`);
  }
  return { rows, misses };
}

function report(trackId) {
  const verdicts = readCache(trackId);
  const gradeIds = rules.gradesFor(trackId);
  const all = allQuestions(trackId);
  console.log(`${trackId}: where each grade's questions really sit (judge), by band`);
  for (const gradeId of gradeIds) {
    const gi = gradeIds.indexOf(gradeId);
    const qs = all.filter((q) => q.grade_id === gradeId);
    const cells = qs.map((q) => {
      const v = verdicts[q.key];
      if (!v) return '  ?  ';
      const d = v.grade_index - gi;
      return `${d > 0 ? '+' : ''}${d}${v.key === 'correct' ? '' : v.key === 'wrong' ? 'X' : '~'}`.padStart(4);
    });
    console.log(`  G${String(gi + 1).padEnd(3)}${gradeId.padEnd(30)}${cells.join(' ')}`);
  }
  const bad = all.map((q) => verdicts[q.key]).filter((v) => v && v.key !== 'correct');
  console.log(`\nkeys flagged: ${bad.length}`);
  for (const v of bad) console.log(`  [${v.written_for} ${v.band}] ${v.key}: ${v.prompt.slice(0, 100)} — ${v.note.slice(0, 200)}`);
}

// ── inside a grade: the unit bank ──────────────────────────────────────────
//
// content/unit-placement/<track>.json holds three questions per unit. The judge
// reads one grade at a time, its questions shuffled, and says for each the first
// unit by which it is reliably answered (0 = before the grade starts) and whether
// the key is right. Cached in curriculum-build/placement-judge/<track>-units.json.

function unitBank(trackId) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'unit-placement', `${trackId}.json`), 'utf8')); } catch { return null; }
}

const UNIT_JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'unit', 'key'],
        properties: {
          id: { type: 'string' },
          unit: { type: 'integer', description: 'U number; 0 if a learner answers it reliably before this grade starts' },
          key: { type: 'string', enum: ['correct', 'wrong', 'ambiguous', 'flawed'] },
          note: { type: 'string', description: 'Only when the key is not correct: what is wrong, and the fix.' },
        },
      },
    },
  },
};

function unitJudgeSystem(trackName) {
  return [
    `You are an experienced ${trackName} teacher. You are given one grade of a curriculum (its units in order, U1 first,`,
    'with what each lesson covers) and placement questions written for that grade, shuffled.',
    '',
    'For each question, say the FIRST unit U by which a learner who has worked through every unit up to and including',
    'U would reliably answer it (about 9 in 10 such learners right). Use 0 if a learner reliably answers it before the',
    'grade starts (earlier grades or everyday knowledge). Judge from what the question actually requires; multiple choice',
    'is answered by recognising the right option, which is easier than producing it.',
    '',
    'Then check it: "correct" if the keyed answer is right and the only right option; "wrong" if it is not right;',
    '"ambiguous" if another option is also defensible; "flawed" if the question itself is broken (refers to something',
    'it does not give, needs a picture, gives the answer away, or is not answerable as written). Work each question',
    'yourself before deciding. Answer every question by its id.',
  ].join('\n');
}

function unitJudgeUser(trackId, gradeId, questions) {
  const grade = curriculum.getGrade(trackId, gradeId);
  const units = unitsOf(trackId, gradeId).map((u, i) => `U${i + 1}: ${u.lessons.map((l) => `${l.title}${l.covers ? ` — ${String(l.covers).slice(0, 200)}` : ''}`).join(' | ')}`).join('\n');
  const items = questions.map((q) => `id: ${q.key}\nquestion: ${q.prompt}\noptions: ${q.choices.map((c) => `[${c}]`).join(' ')}\nkeyed answer: ${q.answer}`).join('\n\n');
  return `GRADE: ${grade.name}\n\nUNITS\n${units}\n\nQUESTIONS\n${items}`;
}

function unitQuestions(trackId, gradeId) {
  const bank = unitBank(trackId);
  const g = bank && bank.grades[gradeId];
  if (!g) return [];
  return g.units.flatMap((u, i) => u.questions.map((q, j) => ({ ...q, unit: i + 1, units: g.units.length, slot: j, key: keyOf(q) })));
}

async function judgeUnits(trackId, onlyGrades) {
  // eslint-disable-next-line global-require
  const mimo = require('../services/providers/mimo');
  const cacheName = `${trackId}-units`;
  const cache = readCache(cacheName);
  const trackName = (curriculum.getTrack(trackId) || {}).name || trackId;
  const jobs = [];
  for (const gradeId of rules.gradesFor(trackId)) {
    if (onlyGrades && !onlyGrades.includes(gradeId)) continue;
    const todo = shuffled(unitQuestions(trackId, gradeId).filter((q) => !cache[q.key]), 0x5eed);
    for (let i = 0; i < todo.length; i += 24) jobs.push({ gradeId, batch: todo.slice(i, i + 24) });
  }
  console.log(`${trackId}: ${jobs.length} unit-judge calls`);
  const usage = { input: 0, output: 0 };
  await pool(jobs, PARALLEL, async (job) => {
    let { batch } = job;
    for (let attempt = 1; attempt <= 3 && batch.length; attempt++) {
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const reply = await mimo.structuredStream({
        role: 'placement',
        system: unitJudgeSystem(trackName),
        user: unitJudgeUser(trackId, job.gradeId, batch),
        schema: UNIT_JUDGE_SCHEMA,
        schemaName: 'submit_unit_locations',
        maxTokens: 24000,
      }).catch((err) => { console.log(`  ${job.gradeId}: ${err.message}`); return null; });
      if (reply && reply.usage) { usage.input += reply.usage.input_tokens || 0; usage.output += reply.usage.output_tokens || 0; }
      const rows = reply && reply.data && Array.isArray(reply.data.questions) ? reply.data.questions : [];
      let got = 0;
      for (const row of rows) {
        const q = batch.find((b) => b.key === String(row.id).trim());
        if (!q) continue;
        cache[q.key] = {
          grade_id: job.gradeId,
          written_for: q.unit,
          units: q.units,
          slot: q.slot,
          unit: Math.max(0, Math.min(q.units, Number(row.unit) || 0)),
          key: row.key,
          note: row.note || '',
          prompt: String(q.prompt).slice(0, 160),
        };
        got++;
      }
      writeCache(cacheName, cache);
      console.log(`  ${job.gradeId}: ${got}/${batch.length} judged in ${Math.round((Date.now() - started) / 1000)}s`);
      batch = batch.filter((q) => !cache[q.key]);
    }
  });
  console.log(`tokens: ${JSON.stringify(usage)}`);
}

/** The chance a tester at unit position `at` (0 = start of the grade, units = end) answers right. */
function unitChance(q, verdict, at) {
  const guess = 1 / q.choices.length;
  if (!verdict) return guess;
  if (verdict.key === 'wrong' || verdict.key === 'flawed') return guess;
  const known = verdict.key === 'ambiguous' ? 0.5 : 1 - SLIP;
  const point = verdict.unit - 1 + unitPlacement.UNIT_AT; // reliably answered most of the way through its unit
  const d = at - point;
  if (d >= 0) return known;
  if (d <= -1) return guess;
  return guess + (known - guess) * (1 + d);
}

/** The adaptive walk inside a grade: probe the unit nearest the current estimate. */
const UNIT_MODES = {
  quick: { max: 15, min: 6, sure: 0.85 },
  balanced: { max: 30, min: 9, sure: 0.95 },
  accurate: { max: 60, min: 15, sure: 0.99 },
};

function walkUnits(mode, trackId, gradeId, verdicts, at, random) {
  const units = unitPlacement.unitsFor(trackId, gradeId);
  const answered = [];
  for (;;) {
    const next = unitPlacement.nextQuestion(trackId, gradeId, mode, answered);
    if (!next) break;
    const q = { ...units[next.unit - 1].questions[next.slot] };
    const correct = random() < unitChance(q, verdicts[keyOf(q)], at);
    answered.push({ ...next, correct });
  }
  return { placed: unitPlacement.placedUnit(units, answered).unit, asked: answered.length };
}

function runUnits(trackId, { mode = 'balanced', seeds = 2, fractions = [0.2, 0.8] } = {}) {
  const verdicts = readCache(`${trackId}-units`);
  let total = 0;
  let within = 0;
  let exact = 0;
  let asked = 0;
  let maxAsked = 0;
  const lines = [];
  for (const gradeId of rules.gradesFor(trackId)) {
    const qs = unitQuestions(trackId, gradeId);
    if (!qs.length || !unitPlacement.available(trackId, gradeId)) { lines.push(`  ---- ${gradeId}: no bank`); continue; }
    if (qs.some((q) => !verdicts[keyOf(q)])) { lines.push(`  ---- ${gradeId}: not fully judged yet`); continue; }
    const n = qs[0].units;
    const offs = [];
    for (let u = 1; u <= n; u++) {
      for (const f of fractions) {
        for (let s = 1; s <= seeds; s++) {
          const random = rng(0xc0de + u * 7919 + Math.round(f * 100) * 31 + s * 104729 + gradeId.length);
          const out = walkUnits(mode, trackId, gradeId, verdicts, u - 1 + f, random);
          const off = out.placed - u;
          offs.push(off);
          total++;
          asked += out.asked;
          maxAsked = Math.max(maxAsked, out.asked);
          if (Math.abs(off) <= 1) within++;
          if (!off) exact++;
        }
      }
    }
    const misses = offs.filter((o) => Math.abs(o) > 1).length;
    lines.push(`  ${misses ? 'MISS' : 'ok  '} ${gradeId.padEnd(30)} ${n} units, ${offs.length - misses}/${offs.length} within one unit`);
  }
  console.log(`${trackId} units / ${mode}: ${within}/${total} within one unit, ${exact} exact; asked avg ${Math.round(asked / Math.max(1, total))}, max ${maxAsked}`);
  lines.forEach((l) => console.log(l));
}

module.exports = { oldKeyOf, judgeUnits, runUnits, unitQuestions, unitChance, walkUnits, UNIT_MODES, chance, walkFull, walkAdaptive, posterior, MODES, BAND_AT, WALKS, run, judge, outline, unitsOf, allQuestions, keyOf, readCache, rng, scoreGrade };

if (require.main === module) {
  const [command, trackId] = process.argv.slice(2);
  const opt = (name, fallback) => {
    const a = process.argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.split('=')[1] : fallback;
  };
  (async () => {
    if (command === 'judge') await judge(trackId);
    else if (command === 'report') report(trackId);
    else if (command === 'judge-units') await judgeUnits(trackId, opt('grades', '') ? opt('grades', '').split(',') : null);
    else if (command === 'run-units') runUnits(trackId, { mode: opt('mode', 'balanced'), seeds: Number(opt('seeds', 2)) });
    else if (command === 'run') run(trackId, { mode: opt('mode', 'full'), seeds: Number(opt('seeds', 2)), verbose: process.argv.includes('--verbose') });
    else console.log('usage: node scripts/placement-testers.js judge|report|run <track> [--mode=full] [--seeds=2]');
  })().catch((err) => { console.error(err); process.exitCode = 1; });
}
