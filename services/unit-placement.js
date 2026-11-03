/**
 * Placement inside a grade, to within one unit, and the quick check of what it
 * skips.
 *
 * A unit is the stretch of lessons between two checkpoints. Each has three
 * questions in content/unit-placement/<track>.json (scripts/generate-unit-
 * placement.js), checked by the simulated testers (scripts/placement-testers.js
 * judge-units / run-units). The walk is the adaptive one the subject placement
 * uses (services/adaptive-placement.js), with a unit as the step: it keeps a
 * belief about how many units the learner has finished, asks one question from
 * the unit nearest the middle of it, and stops when the belief is narrow enough
 * for the mode, at the mode's cap, or on its clock.
 *
 * What it places is a unit: the learner starts at that unit's first lesson. The
 * units before it are skipped, and each gets a quick check — one question from
 * it, unless the placement already saw that unit answered right — so the skip is
 * confirmed rather than assumed. A unit whose check is missed twice is reopened,
 * and an enrollment without a unit plan starts back at the earliest one. An
 * enrollment with a plan (services/learner-path.js) is placed and checked by
 * the plan's own evidence model instead (learnerPath.unitBelief, quickChecks).
 *
 * Grades without a bank keep the older difficulty-ladder placement
 * (services/placement.js).
 */
const fs = require('fs');
const path = require('path');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const adaptive = require('./adaptive-placement');

const BANK_DIR = path.join(__dirname, '..', 'content', 'unit-placement');

/**
 * The modes inside a grade. Their clocks are what is left of each mode's whole
 * budget after the subject stage (services/adaptive-placement.js MODES): Quick
 * Quick 14 + 6 = 20 minutes (unchanged: a 5-minute Quick did not hold 90% within a grade), Balanced 14 + 6 = 20, Accurate 40 + 14 = 54, leaving 3 for
 * the earlier-grade gap scan (the owner's limits of 2026-11-02 for Balanced and Accurate). Balanced was 32 + 13 and Accurate 57 + 25 (+ 8 for the gap scan).
 */
const MODES = {
  quick: { max: 20, min: 6, sure: 0.85, confidence: 0.95, minutes: 8 },
  balanced: { max: 30, min: 10, sure: 0.95, confidence: 0.97, minutes: 8 },
  // Up to 80: with five questions a unit, simulated Accurate walks average about
  // 69 questions and place 926 of 928 testers within a unit (the clock still
  // bounds it).
  accurate: { max: 40, min: 14, sure: 0.995, confidence: 0.98, minutes: 14 },
};

/**
 * The walk's assumptions in units (services/adaptive-placement.js assumed): a
 * unit's slope is wider than a grade's in its own steps, since three questions
 * a unit say less than seven a grade. UNIT_WIDTH / UNIT_RELIABLE to experiment.
 */
const UNIT_SHAPE = {
  width: Number(process.env.UNIT_WIDTH || 0.2),
  reliable: Number(process.env.UNIT_RELIABLE || 0.3),
};

/** How far past the belief's middle the placement rounds (see placedUnit). UNIT_ROUND to experiment. */
const UNIT_ROUND = Number(process.env.UNIT_ROUND || 0.15);

/** Where a unit's question sits: most of the way through its unit. */
const UNIT_AT = 0.75;

const banks = new Map();
function bankFor(trackId) {
  const file = path.join(BANK_DIR, `${trackId}.json`);
  let stamp = 0;
  try { stamp = fs.statSync(file).mtimeMs; } catch { return null; }
  const hit = banks.get(trackId);
  if (hit && hit.stamp === stamp) return hit.data;
  let data = null;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = null; }
  banks.set(trackId, { stamp, data });
  return data;
}

/**
 * Where each unit question really sits, in units from the start of the grade
 * (content/unit-placement-calibration/<track>.json, written by
 * scripts/placement-second-judge.js calibrate-units from the judges' verdicts),
 * keyed by adaptive.questionKey. A question without one sits most of the way
 * through the unit it was written for.
 */
const calibrations = new Map();
function calibrationFor(trackId) {
  const file = path.join(__dirname, '..', 'content', 'unit-placement-calibration', `${trackId}.json`);
  let stamp = 0;
  try { stamp = fs.statSync(file).mtimeMs; } catch { return null; }
  const hit = calibrations.get(trackId);
  if (hit && hit.stamp === stamp) return hit.data;
  let data = null;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')).points || null; } catch { data = null; }
  calibrations.set(trackId, { stamp, data });
  return data;
}

/**
 * The grade's units with their questions, or null when the grade has no complete bank. Memoised against the bank file's and the
 * calibration file's modification times, so the same array comes back until either file changes (the walk caches on it).
 */
const unitsMemo = new Map();
function unitsFor(trackId, gradeId) {
  const bank = bankFor(trackId);
  const grade = bank && bank.grades && bank.grades[gradeId];
  if (!grade || !Array.isArray(grade.units) || !grade.units.length) return null;
  if (grade.units.some((u) => !Array.isArray(u.questions) || !u.questions.length)) return null;
  const calibration = calibrationFor(trackId);
  const hit = unitsMemo.get(`${trackId}|${gradeId}`);
  if (hit && hit.grade === grade && hit.calibration === calibration) return hit.units;
  const units = !calibration ? grade.units.slice() : grade.units.map((u) => ({
    ...u,
    questions: u.questions.map((q) => {
      const at = calibration[adaptive.questionKey(q)];
      return Number.isFinite(at) ? { ...q, at } : q;
    }),
  }));
  // A bank may carry the shape of its own walk (IQ: a cluster step is gentler than a unit's). Not enumerable, so the
  // array stays a plain list to every caller; beliefOf reads it.
  if (bank.shape && Number.isFinite(bank.shape.width) && Number.isFinite(bank.shape.reliable)) {
    Object.defineProperty(units, 'shape', { value: { width: bank.shape.width, reliable: bank.shape.reliable, ...(Number.isFinite(bank.shape.round) ? { round: bank.shape.round } : {}) } });
  }
  unitsMemo.set(`${trackId}|${gradeId}`, { grade, calibration, units });
  return units;
}

/** Where a question sits, in units from the start of the grade: calibrated, or by the unit it was written for. */
function pointOf(question, unitNumber) {
  return Number.isFinite(question && question.at) ? question.at : unitNumber - 1 + UNIT_AT;
}

function available(trackId, gradeId) {
  return !!unitsFor(trackId, gradeId);
}

/** The options in an order of their own, the same every time the question is shown. */
function shuffled(question) {
  const text = `${question.prompt}\u0000${question.answer}`;
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) { seed ^= text.charCodeAt(i); seed = Math.imul(seed, 16777619) >>> 0; }
  const out = question.choices.slice();
  for (let i = out.length - 1; i > 0; i--) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const j = (seed >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One question as an item row: what the placement session stores and grades. */
function itemFor(trackId, gradeId, unit, slot) {
  const units = unitsFor(trackId, gradeId);
  const q = units[unit - 1].questions[slot];
  return {
    format: 'multiple_choice',
    prompt: q.prompt,
    choices: shuffled(q),
    answer: q.answer,
    accepts: [],
    skill_id: null,
    topic: q.skill || '',
    difficulty: null,
    unit,
    slot,
  };
}

/**
 * Holes. A learner who has moved past a unit has usually learned it, but not always: a unit skipped in school, forgotten, or
 * never taught is a hole, and every question in it is answered at the guess rate however far past it the learner is. A walk
 * that reads each answer on its own takes a miss on a hole for evidence the frontier is low, and a learner with holes was
 * placed early (simulated: 100% within one unit with no holes, 60-70% with three holes in ten). So the belief reads a unit's
 * answers together and allows that, with probability UNIT_HOLE times how likely the unit is to be below the frontier, they
 * were all guessed. The frontier is then what the units above the holes say. UNIT_HOLE=0 turns this off (the earlier walk).
 * 0.15 is an assumption about real learners, not a measurement: the simulator tests it at 0, 10, 20, 30 and 40% holes.
 */
const UNIT_HOLE = Number(process.env.UNIT_HOLE ?? 0.15);
/** The chance a hole's question is guessed right, over pure chance: a little slack for the odd question that can be eliminated. */
const HOLE_SLACK = 0.04;

const KNOWN = (x, pos, shape) => 1 / (1 + Math.exp(-(x - pos + shape.reliable) / shape.width));

/**
 * What never changes for a grade's units: the grid, and for each unit how likely it is to be below the frontier at each point
 * (the mean over its questions of the chance a learner at x knows them), which is what a hole's weight is scaled by. Cached on
 * the units array, which unitsFor memoises.
 */
const preps = new WeakMap();
function prepOf(units) {
  let p = preps.get(units);
  if (p) return p;
  const shape = units.shape || UNIT_SHAPE;
  const grid = [];
  for (let x = 0; x <= units.length + 1e-9; x += 0.05) grid.push(Math.round(x * 100) / 100);
  const below = units.map((u, i) => {
    const pos = u.questions.map((q) => pointOf(q, i + 1));
    return Float64Array.from(grid, (x) => pos.reduce((n, pp) => n + KNOWN(x, pp, shape), 0) / pos.length);
  });
  p = { grid, below, shape };
  preps.set(units, p);
  return p;
}

/** One answered question as the walk reads it. */
function termOf(units, a) {
  const q = units[a.unit - 1].questions[a.slot] || units[a.unit - 1].questions[0];
  return { pos: pointOf(q, a.unit), guess: 1 / Math.max(2, q.choices.length), correct: !!a.correct };
}

/** The log chance of one answer at every grid point, under "known to the frontier" (k) and "a hole, guessed" (h). */
function termLogs(prep, t) {
  const n = prep.grid.length;
  const k = new Float64Array(n);
  const h = new Float64Array(n);
  const q = Math.min(0.6, t.guess + HOLE_SLACK);
  const lh = Math.log(t.correct ? q : 1 - q);
  for (let g = 0; g < n; g++) {
    const p = adaptive.assumed(prep.grid[g], t.pos, t.guess, prep.shape);
    k[g] = Math.log(t.correct ? p : 1 - p);
    h[g] = lh;
  }
  return { k, h };
}

/** A unit's log belief from its summed per-answer logs: lk (all known), lh (all guessed), mixed by the hole weight. */
function mixLog(lk, lh, below, hole) {
  const n = lk.length;
  const out = new Float64Array(n);
  for (let g = 0; g < n; g++) {
    if (!hole) { out[g] = lk[g]; continue; }
    const pi = hole * below[g];
    const m = lk[g] > lh[g] ? lk[g] : lh[g];
    out[g] = m + Math.log((1 - pi) * Math.exp(lk[g] - m) + pi * Math.exp(lh[g] - m));
  }
  return out;
}

/** Per unit, the summed answer logs {lk, lh} (null for a unit with no answers). */
function sums(units, prep, answered) {
  const per = units.map(() => null);
  for (const a of answered) {
    const t = termLogs(prep, termOf(units, a));
    const cur = per[a.unit - 1] || (per[a.unit - 1] = { lk: new Float64Array(prep.grid.length), lh: new Float64Array(prep.grid.length) });
    for (let g = 0; g < t.k.length; g++) { cur.lk[g] += t.k[g]; cur.lh[g] += t.h[g]; }
  }
  return per;
}

function normalised(grid, logp) {
  let top = -Infinity;
  for (let g = 0; g < logp.length; g++) if (logp[g] > top) top = logp[g];
  const w = new Array(logp.length);
  let total = 0;
  for (let g = 0; g < logp.length; g++) { w[g] = Math.exp(logp[g] - top); total += w[g]; }
  for (let g = 0; g < w.length; g++) w[g] /= total;
  return { grid, w };
}

/** The belief from the answers so far: {unit, slot, correct} rows. */
function beliefOf(units, answered) {
  const prep = prepOf(units);
  const per = sums(units, prep, answered);
  const logp = new Float64Array(prep.grid.length);
  per.forEach((s, i) => {
    if (!s) return;
    const l = mixLog(s.lk, s.lh, prep.below[i], UNIT_HOLE);
    for (let g = 0; g < logp.length; g++) logp[g] += l[g];
  });
  return normalised(prep.grid, logp);
}

/**
 * The question that tells the walk most: of the unused questions near the middle of the belief, the one whose answer is
 * expected to leave the belief narrowest (smallest expected entropy), computed with the unit's other answers in view, so a
 * question in a unit that has just been missed is worth less than one in its neighbour. UNIT_PICK=nearest is the earlier rule
 * (the unused question that sits nearest the middle).
 */
const UNIT_PICK = process.env.UNIT_PICK || 'info';
const PICK_NEAR = Number(process.env.UNIT_PICK_NEAR || 24);

function pickByInformation(units, answered, post) {
  const prep = prepOf(units);
  const { grid } = prep;
  const n = grid.length;
  const per = sums(units, prep, answered);
  const logs = per.map((s, i) => (s ? mixLog(s.lk, s.lh, prep.below[i], UNIT_HOLE) : new Float64Array(n)));
  const base = new Float64Array(n);
  for (const l of logs) for (let g = 0; g < n; g++) base[g] += l[g];
  const m = adaptive.median(post);
  const used = new Set(answered.map((a) => `${a.unit}:${a.slot}`));
  const cands = [];
  units.forEach((u, i) => u.questions.forEach((q, slot) => {
    if (!used.has(`${i + 1}:${slot}`)) cands.push({ unit: i + 1, slot, pos: pointOf(q, i + 1), q });
  }));
  cands.sort((a, b) => Math.abs(a.pos - m) - Math.abs(b.pos - m));
  let best = null;
  const rest = new Float64Array(n);
  const lp = new Float64Array(n);
  const zero = new Float64Array(n);
  for (const c of cands.slice(0, PICK_NEAR)) {
    const i = c.unit - 1;
    for (let g = 0; g < n; g++) rest[g] = base[g] - logs[i][g];
    const s = per[i] || { lk: zero, lh: zero };
    const guess = 1 / Math.max(2, c.q.choices.length);
    const out = [];
    for (const correct of [true, false]) {
      const t = termLogs(prep, { pos: c.pos, guess, correct });
      const lk = new Float64Array(n);
      const lh = new Float64Array(n);
      for (let g = 0; g < n; g++) { lk[g] = s.lk[g] + t.k[g]; lh[g] = s.lh[g] + t.h[g]; }
      const l = mixLog(lk, lh, prep.below[i], UNIT_HOLE);
      let top = -Infinity;
      for (let g = 0; g < n; g++) { lp[g] = rest[g] + l[g]; if (lp[g] > top) top = lp[g]; }
      let z = 0;
      for (let g = 0; g < n; g++) { lp[g] = Math.exp(lp[g] - top); z += lp[g]; }
      let h = 0;
      for (let g = 0; g < n; g++) { const w = lp[g] / z; if (w > 1e-12) h -= w * Math.log(w); }
      out.push({ z: z * Math.exp(top), h });
    }
    const expected = (out[0].z * out[0].h + out[1].z * out[1].h) / (out[0].z + out[1].z);
    if (!best || expected < best.expected - 1e-9) best = { unit: c.unit, slot: c.slot, expected };
  }
  return best;
}

/**
 * The stop rule. A placement is within one unit of the truth when the learner's real first unfinished unit is the placed one or
 * either neighbour, that is when the frontier lies in [placed - 2, placed + 1). The walk stops once the belief puts at least the
 * mode's `confidence` of its weight there, so it stops on the very error the owner holds it to (about 90% within one unit),
 * not on a stand-in for it (the earlier rule asked for `sure` of the belief within one unit of its middle, a wider band than
 * the placement needs, and at 0.95 ran most walks to their cap). UNIT_STOP=legacy restores the earlier rule.
 */
const UNIT_STOP = process.env.UNIT_STOP || 'within1';

function withinOneMass(units, answered, post) {
  const placed = placedUnit(units, answered, post).unit;
  const shift = units.shape && Number.isFinite(units.shape.round) ? units.shape.round : UNIT_ROUND;
  return post.grid.reduce((n, x, i) => (x + shift >= placed - 2 && x + shift < placed + 1 ? n + post.w[i] : n), 0);
}

/**
 * The next question, or null when the walk is done. `answered` is every
 * {unit, slot, correct} so far; `deadline` is the mode's clock.
 */
function nextQuestion(trackId, gradeId, mode, answered, { deadline = null, startUnit = null } = {}) {
  const units = unitsFor(trackId, gradeId);
  if (!units) return null;
  const cfg = MODES[mode] || MODES.balanced;
  if (answered.length >= cfg.max) return null;
  if (deadline && Date.now() >= Date.parse(deadline)) return null;
  const post = beliefOf(units, answered);
  if (answered.length >= cfg.min) {
    if (UNIT_STOP === 'legacy') {
      const m = adaptive.median(post);
      if (adaptive.massWithin(post, m - 1, m + 1) >= cfg.sure) return null;
    } else if (withinOneMass(units, answered, post) >= cfg.confidence) return null;
  }
  const target = answered.length ? adaptive.median(post) : (Number.isFinite(startUnit) ? startUnit - 1 + UNIT_AT : units.length / 2);
  if (answered.length && UNIT_PICK === 'info') {
    const pick = pickByInformation(units, answered, post);
    if (pick) return { unit: pick.unit, slot: pick.slot };
  }
  const used = new Set(answered.map((a) => `${a.unit}:${a.slot}`));
  let best = null;
  // The unused question that sits nearest the middle of the belief, wherever it was written.
  units.forEach((u, i) => {
    u.questions.forEach((q, slot) => {
      if (used.has(`${i + 1}:${slot}`)) return;
      const d = Math.abs(pointOf(q, i + 1) - target);
      if (!best || d < best.d) best = { unit: i + 1, slot, d };
    });
  });
  return best ? { unit: best.unit, slot: best.slot } : null;
}

/**
 * Thin evidence. A walk that ends early (out of time, or stopped after a question
 * or two) leaves a wide belief whose middle is mostly the flat prior: one "I don't
 * know" on the first question (asked mid-grade) put its median at unit 6 of 20,
 * telling a learner who had shown nothing that they skip five units (polish audit,
 * 2026-10-24). So: with no right answer at all nothing is skipped (unit 1), and
 * after fewer than UNIT_THIN_ASKED answers (the Quick minimum) with the belief still
 * wide (less than UNIT_THIN_SURE of it within a unit of its middle) the start is its
 * low end, the UNIT_THIN_Q quantile, not its middle. Walks that reach the mode's
 * minimum place exactly as before (simulated testers, all three subjects and modes:
 * unchanged; applying the quantile at any length cost 4-20 Quick testers).
 */
const UNIT_THIN_SURE = Number(process.env.UNIT_THIN_SURE || 0.5);
const UNIT_THIN_Q = Number(process.env.UNIT_THIN_Q || 0.1);
const UNIT_THIN_ASKED = Number(process.env.UNIT_THIN_ASKED || 6);

/** The unit a learner starts at, from the answers. */
function placedUnit(units, answered, belief = null) {
  const post = belief || beliefOf(units, answered);
  const x = adaptive.median(post);
  const sure = adaptive.massWithin(post, x - 1, x + 1);
  if (!answered.some((a) => a.correct)) return { unit: 1, sure };
  if (sure < UNIT_THIN_SURE && answered.length < UNIT_THIN_ASKED) {
    return { unit: Math.max(1, Math.min(units.length, Math.floor(adaptive.quantile(post, UNIT_THIN_Q)) + 1)), sure };
  }
  // The belief sits about `reliable` units below the frontier by construction,
  // so rounding it straight down placed most learners who had just finished a
  // unit one unit early (redoing a unit they knew). How far to round up depends
  // on how much a learner knows of the unit after their frontier, which only
  // real data can settle: with none, 0.3 is best (exact 84-91% in simulation);
  // with the testers' one-unit ramp of partial knowledge, 0 is best (66%). 0.15
  // is the compromise (about 72% and 53%), and within one unit either way; a
  // late start is covered by the quick check of the unit it skips.
  return {
    unit: Math.max(1, Math.min(units.length, Math.floor(x + (units.shape && Number.isFinite(units.shape.round) ? units.shape.round : UNIT_ROUND)) + 1)),
    sure: adaptive.massWithin(post, x - 1, x + 1),
  };
}

/** The first lesson level of a unit: where a learner placed there starts. */
function startLevelOf(trackId, gradeId, unit) {
  const grade = curriculum.getGrade(trackId, gradeId);
  for (let level = unit.start; level <= unit.end; level++) {
    if (curriculum.levelKind(level, grade.pathLength, grade) !== 'lesson') continue;
    const e = LAYOUT.entryFor(grade, level) || {};
    if (/summary/i.test(String(e.type || '')) || /^summary:/i.test(String(e.title || ''))) continue;
    return level;
  }
  return unit.start;
}

/**
 * Score a finished in-grade placement: where to start, and the quick checks for
 * the units it skips.
 */
function score(trackId, gradeId, answered) {
  const units = unitsFor(trackId, gradeId);
  const placed = placedUnit(units, answered);
  const rightIn = new Set(answered.filter((a) => a.correct).map((a) => a.unit));
  const usedIn = new Map();
  for (const a of answered) {
    if (!usedIn.has(a.unit)) usedIn.set(a.unit, new Set());
    usedIn.get(a.unit).add(a.slot);
  }
  const checks = [];
  for (let u = 1; u < placed.unit; u++) {
    if (rightIn.has(u)) continue; // already seen answered right
    const slots = units[u - 1].questions.map((_, s) => s).filter((s) => !(usedIn.get(u) || new Set()).has(s));
    checks.push({ unit: u, key: units[u - 1].key, slots, status: 'pending', misses: 0 });
  }
  const unit = units[placed.unit - 1];
  return {
    unit: placed.unit,
    units: units.length,
    sure: placed.sure,
    title: (unit.titles || [])[0] || '',
    placedLevel: startLevelOf(trackId, gradeId, unit),
    skipped: placed.unit - 1,
    checks,
    asked: answered.length,
    correct: answered.filter((a) => a.correct).length,
  };
}

/**
 * Mark one quick-check answer. A miss asks the unit's other question; a second
 * miss reopens the unit. Returns the updated checks and, when a unit is
 * reopened, the earliest reopened unit's first lesson — where an enrollment
 * without a unit plan is moved back to (routes/placement.js). One with a plan
 * records the answer through learnerPath.recordCheck instead.
 */
function markCheck(trackId, gradeId, checks, unit, correct) {
  const units = unitsFor(trackId, gradeId);
  const next = checks.map((c) => ({ ...c, slots: c.slots.slice() }));
  const row = next.find((c) => c.unit === unit && c.status === 'pending');
  if (!row) return { checks: next, reopenLevel: null };
  row.slots.shift();
  if (correct) row.status = 'passed';
  else if (++row.misses >= 2 || !row.slots.length) row.status = 'reopened';
  const reopened = next.filter((c) => c.status === 'reopened').sort((a, b) => a.unit - b.unit)[0];
  return { checks: next, reopenLevel: reopened ? startLevelOf(trackId, gradeId, units[reopened.unit - 1]) : null };
}

/** The next quick-check question, or null when every check is settled. */
function nextCheck(checks) {
  const row = (checks || []).find((c) => c.status === 'pending' && c.slots.length);
  return row ? { unit: row.unit, slot: row.slots[0] } : null;
}

module.exports = { pointOf, calibrationFor, MODES, UNIT_AT, bankFor, unitsFor, available, itemFor, nextQuestion, placedUnit, score, markCheck, nextCheck, startLevelOf, beliefOf };
