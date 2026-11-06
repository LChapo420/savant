/**
 * Speed levers (docs/SPEED-4X.md): spend fewer of the learner's minutes on what they already have, without losing material or retention.
 * Every lever is OFF unless its switch says on, and off is today's behaviour exactly. The decision rules live here so the app and the simulation
 * (scripts/faster-by-goal-sim.js --speed-arms=...) run the same code.
 *
 *   SPEED_TESTOUT=on       retrieval first: a lesson level opens on its check questions; a learner whose answers show the skill is known skips the page
 *                          and is TOLD so, with the page one tap away (never silent loss of material).
 *   SPEED_SHORT_LESSON=on  after a miss, only the part of the page that this miss calls for; the whole page stays one tap away, a second miss adds the next part.
 *   SPEED_MASTERY_STOP=on  a practice block ends once the tracker below is confident the skill is understood; the rest of its focus items are set aside, marked, unscored.
 *   SPEED_REVIEW_TARGET=on a level review is asked only when predicted recall (understanding x memory) falls under the learner's chosen target (plus a margin) on the days
 *                          the goal covers; overshoot is not reviewed. Reads the goal through services/retention-goal.js.
 *   SPEED_FAST_ITEM=on     less friction per item: a multiple choice answer is one tap, no optional confidence row, and a right answer moves on by itself after a tick. A miss still stops to explain.
 *   SPEED_COMPOSITE=on     an item that names `also_skills` counts as an attempt on each of them too, each on its own. The built-in banks have no such items today, so this does nothing until they exist.
 *   Placement by skill, implied mastery and the item at the edge: services/speed-placement.js.
 *   SPEED_ALL=off          every lever off.
 * (Prerequisite credit, an answer also reviewing what it builds on, is a simulation variant only: the built-in courses have no prerequisite graph to read it from.)
 *
 * The tracker is a small Bayes filter over a skill's understanding k: each answer is right with chance k + (1 - k) x guess, then k rises as the learning model says.
 * Its constants are ASSUMED (the audited v2 simulation's), not fitted to real learners. docs/SPEED-4X.md shows what happens when they are wrong.
 */

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const SWITCH = { testout: 'SPEED_TESTOUT', short: 'SPEED_SHORT_LESSON', stop: 'SPEED_MASTERY_STOP', target: 'SPEED_REVIEW_TARGET', fast: 'SPEED_FAST_ITEM', composite: 'SPEED_COMPOSITE' };
const DEFAULT = { testout: 'off', short: 'off', stop: 'off', target: 'off', fast: 'off', composite: 'off' };

/** Is this lever on? SPEED_ALL=off beats everything. A base-arm learner (efficiency.forLearner) reads every lever off, as the older levers do. */
function enabled(lever) {
  const efficiency = require('./efficiency'); // eslint-disable-line global-require
  if (efficiency.isSuspended && efficiency.isSuspended()) return false;
  if (String(process.env.SPEED_ALL || '').toLowerCase() === 'off') return false;
  return String(process.env[SWITCH[lever]] || DEFAULT[lever]).toLowerCase() === 'on';
}

const PARAMS = {
  understood: 0.85,   // k at or above this counts as understood (the same bar as the simulation's and docs/FASTER-BY-GOAL.md)
  conf: Number(process.env.SPEED_STOP_CONF || 0.9),   // chance that k >= understood, needed to stop asking or skip the page
  minAnswers: Number(process.env.SPEED_STOP_MIN || 2),
  maxAnswers: 25,
  guess: 0.25,
  gain: 0.2,          // share of the gap to full understanding closed by a right answer with feedback (v2 LM.a); half that after a wrong one
  pageGain: 0.5,      // share of the gap closed by a whole page read (v2 LM.page)
  safety: Number(process.env.SPEED_SAFETY || 1),      // the tracker's belief in how much is learned is scaled by this (under 1 stops later)
  chunk: Number(process.env.SPEED_CHUNK || 0.4),      // share of the page shown after a miss
  priorStrength: 3,
  priorMean: 0.35,
  reviewMargin: Number(process.env.SPEED_REVIEW_MARGIN || 0.15), // the review line above the learner's target: predicted recall is kept over target + this (chosen on the design seed: docs/SPEED-4X.md)
  endMargin: Number(process.env.SPEED_REVIEW_END_MARGIN || 0.05), // a skill predicted over target + this on the goal's last day is not reviewed again
  defaultTarget: 0.7,
};

// ---------- the tracker ----------
const GRID = 41;
const gridK = Array.from({ length: GRID }, (_, i) => i / (GRID - 1));

/** A new tracker. priorMean: the expected understanding before any answer (priorFromHistory gives a learner's own). lr: the learner's learning-rate multiplier. */
function newTracker({ priorMean = PARAMS.priorMean, lr = 1, gainMult = 1 } = {}) {
  const m = clamp(priorMean, 0.03, 0.9); const a = m * PARAMS.priorStrength; const b = (1 - m) * PARAMS.priorStrength;
  const p = gridK.map((k) => (clamp(k, 0.005, 0.995) ** (a - 1)) * ((1 - clamp(k, 0.005, 0.995)) ** (b - 1)));
  const s = p.reduce((x, y) => x + y, 0);
  return { p: p.map((x) => x / s), lr, gainMult, n: 0, right: 0, misses: 0, streak: 0 };
}
/** Moves the belief as understanding rises by share `g` of its gap. */
function shift(tr, g) {
  const out = new Array(GRID).fill(0);
  for (let i = 0; i < GRID; i++) {
    const k = gridK[i]; const x = (k + (1 - k) * g) * (GRID - 1); const lo = Math.min(GRID - 1, Math.floor(x)); const hi = Math.min(GRID - 1, lo + 1); const w = x - lo;
    out[lo] += tr.p[i] * (1 - w); out[hi] += tr.p[i] * w;
  }
  tr.p = out;
}
/** Chance of a right answer. No item: the audited model. An item { b, a }: harder or easier than the skill's average, right mostly above b, with slope a (assumed; the --edge variant). */
function pRight(c, guess, item) {
  const s = item ? 1 / (1 + Math.exp(-item.a * (c - item.b))) : c;
  return s + (1 - s) * guess;
}
/** An answer. `recall`: the learner's predicted memory for it at this moment (1 during first learning). */
function observe(tr, right, { guess = PARAMS.guess, recall = 1, item = null } = {}) {
  let s = 0;
  for (let i = 0; i < GRID; i++) {
    const c = gridK[i] * recall; const pr = pRight(c, guess, item);
    tr.p[i] *= right ? pr : 1 - pr; s += tr.p[i];
  }
  if (s > 0) tr.p = tr.p.map((x) => x / s);
  tr.n++;
  if (right) { tr.right++; tr.streak++; } else { tr.misses++; tr.streak = 0; }
  shift(tr, clamp(PARAMS.gain * tr.lr * tr.gainMult * (right ? 1 : 0.5), 0, 0.95));
  return tr;
}
/** Part of the page was read (share f of it). */
function taught(tr, f) { shift(tr, clamp(PARAMS.pageGain * tr.lr * tr.gainMult * f, 0, 0.95)); return tr; }
const pKnown = (tr, at = PARAMS.understood) => tr.p.reduce((s, x, i) => s + (gridK[i] >= at - 1e-9 ? x : 0), 0);
const kMean = (tr) => tr.p.reduce((s, x, i) => s + x * gridK[i], 0);

/** Has the check shown enough? Used for both the skip and the practice stop. */
function shown(tr, { conf = PARAMS.conf, minAnswers = PARAMS.minAnswers } = {}) { return tr.n >= minAnswers && pKnown(tr) >= conf; }

/** A learner's own prior for the next skill, from how their first answers on earlier skills went (right share, net of guessing). */
function priorFromHistory(firstRight, firstN, guess = PARAMS.guess) {
  const shrunk = (firstRight + (PARAMS.priorMean + (1 - PARAMS.priorMean) * guess) * 6) / (firstN + 6);
  return clamp((shrunk - guess) / (1 - guess), 0.03, 0.9);
}

/** Replays a skill's answers, oldest first: [{ correct, guess?, recall? }]. */
function trackerFromAnswers(answers, opts = {}) {
  const tr = newTracker(opts);
  for (const a of answers) observe(tr, !!a.correct, { guess: a.guess === undefined ? PARAMS.guess : a.guess, recall: a.recall === undefined ? 1 : a.recall });
  return tr;
}

// ---------- first pass: what happens next on this skill ----------
/**
 * Retrieval first. state: { pageLeft: share of the page not yet shown }.
 * Returns 'stop' (shown), 'teach' (show the next part of the page: the last answer was a miss) or 'ask'.
 */
function nextStep(tr, state, { conf = PARAMS.conf, minAnswers = PARAMS.minAnswers, lastRight = null, at = PARAMS.understood } = {}) {
  if (tr.n >= minAnswers && pKnown(tr, at) >= conf) return 'stop';
  if (tr.n >= PARAMS.maxAnswers) return 'stop';
  if (lastRight === false && state.pageLeft > 1e-9) return 'teach';
  return 'ask';
}

// ---------- placement by skill, implied mastery, the item at the learner's edge ----------
/** The most informative item difficulty for this belief: the candidate with the largest expected fall in entropy about "understood or not". */
function bestItem(tr, { a = 8, candidates = [0.3, 0.5, 0.7, 0.85], guess = PARAMS.guess } = {}) {
  const ent = (p) => (p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)));
  let best = null;
  for (const b of candidates) {
    const item = { a, b };
    let right = 0; let knownRight = 0; let known = 0;
    for (let i = 0; i < GRID; i++) {
      const pr = pRight(gridK[i], guess, item); const isKnown = gridK[i] >= PARAMS.understood - 1e-9;
      right += tr.p[i] * pr; if (isKnown) { known += tr.p[i]; knownRight += tr.p[i] * pr; }
    }
    const pkR = right > 0 ? knownRight / right : 0; const pkW = right < 1 ? (known - knownRight) / (1 - right) : 0;
    const gain = ent(known) - right * ent(pkR) - (1 - right) * ent(pkW);
    if (!best || gain > best.gain) best = { ...item, gain };
  }
  return { a: best.a, b: best.b };
}
const PLACE = {
  knownAt: PARAMS.conf,   // chance the skill is understood, to call it known
  notAt: Number(process.env.SPEED_PLACE_NOT_AT || 0.15), // under this, it goes on the path with no more questions
  maxPerSkill: 8,
  sampleEvery: Number(process.env.SPEED_SAMPLE_EVERY || 3), // one implied skill in this many is asked, to catch a wrong inference
};
/**
 * The next question of a placement by skill, or null when every skill is settled. skills: the course's order, basic first; prereqs(i): the skills i directly builds on. state[i]: { status: 'open'|'known'|'implied'|'path', asked, tr }.
 * Most advanced open skill first, because a pass there settles what lies under it. Implied skills are sampled.
 */
function placementNext(state, { sampleEvery = PLACE.sampleEvery } = {}) {
  for (let i = state.length - 1; i >= 0; i--) if (state[i].status === 'implied' && state[i].sample && !state[i].asked) return i;
  for (let i = state.length - 1; i >= 0; i--) if (state[i].status === 'open') return i;
  void sampleEvery;
  return null;
}
/** Takes one answer on skill i. Returns what changed: { known, implied: [], revoked: [] }. */
function placementAnswer(state, i, right, prereqs, { sampleEvery = PLACE.sampleEvery, useImplied = true, missEnds = true } = {}) {
  const row = state[i]; row.asked = (row.asked || 0) + 1;
  const out = { known: false, implied: [], revoked: [] };
  if (row.status === 'implied') {
    // the sampled confirmation: a miss revokes this one, what it implied below it, and whatever else came from the same pass
    row.sample = false;
    if (right) { row.status = 'known'; return out; }
    for (let j = 0; j < state.length; j++) if (state[j].status === 'implied' && state[j].by === row.by && !state[j].asked) { state[j].status = 'path'; out.revoked.push(j); }
    row.status = 'path'; out.revoked.push(i);
    return out;
  }
  if (row.tr.n >= PARAMS.minAnswers && pKnown(row.tr) >= PLACE.knownAt) {
    row.status = 'known'; out.known = true;
    if (useImplied) {
      const seen = new Set(); const stack = [...prereqs(i)]; let c = 0;
      while (stack.length) {
        const p = stack.pop(); if (seen.has(p) || state[p].status === 'known') continue; seen.add(p);
        if (state[p].status === 'open' || state[p].status === 'path') {
          if (state[p].asked) continue; // it has its own evidence
          state[p].status = 'implied'; state[p].by = i; c++; state[p].sample = c % sampleEvery === 0; out.implied.push(p);
        }
        for (const q of prereqs(p)) stack.push(q);
      }
    }
    return out;
  }
  if ((missEnds && !right) || pKnown(row.tr) < PLACE.notAt || row.asked >= PLACE.maxPerSkill) row.status = 'path'; // a plain item: one miss sends it to the path. An item at the edge may be missed by someone who knows it, so the belief decides
  return out;
}

// ---------- reviews ----------
/**
 * Does this skill need a review now? k: estimated understanding; recallNow / recallAtEnd: predicted memory now and on the goal's last day (null when no last day is known).
 * target: the learner's own target. mode 'through' keeps predicted recall at the target on every day of the goal; 'end' asks only in the final window before the last day.
 * A skill that holds the target to the last day is never asked (the overshoot removed), and after the last day nothing is asked.
 */
function reviewDue({ k, recallNow, recallAtEnd = null, daysToEnd = null, target = PARAMS.defaultTarget, margin = PARAMS.reviewMargin, mode = 'through', window = 5, endMargin = null }) {
  const floor = clamp(target + margin, 0, 0.98);
  const endFloor = clamp(target + (endMargin === null || endMargin === undefined ? margin : endMargin), 0, 0.98);
  if (daysToEnd !== null && daysToEnd < 0) return false;
  if (recallAtEnd !== null && k * recallAtEnd >= endFloor) return false;
  if (mode === 'end' && daysToEnd !== null) return daysToEnd <= window;
  return k * recallNow < floor;
}
/** Days the final window needs: two full passes at this learner's own pace, at least 3. */
function endWindow(skills, minutesPerAnswer, minutesPerDay) { return Math.max(3, Math.ceil((2 * skills * minutesPerAnswer) / Math.max(1, minutesPerDay)) + 1); }

// ---------- the app's side: reads the learner's own answers (no new collection: items, sessions and lessons rows are already the account's, exported and deleted with it) ----------
/* eslint-disable global-require */
const dbOf = () => require('../config/db');

/** A skill's answers so far, oldest first, and the learner's own first-answer record for the prior. A set-aside or skipped item has no answer and does not count. */
function trackerFor(userId, skillId, { lr = 0.8 } = {}) {
  const mine = dbOf().find('items', (i) => i.user_id === userId && i.correct !== null && i.correct !== undefined && !i.skipped && !i.reserved && !i.needs_review);
  mine.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  const seen = new Set(); let firstRight = 0; let firstN = 0;
  for (const i of mine) { if (i.skill_id === skillId || seen.has(i.skill_id)) continue; seen.add(i.skill_id); firstN++; if (i.correct) firstRight++; }
  // lr: the app does not yet read a per-learner rate here; 0.8 is the cautious side of the simulated 0.6 to 1.5 (docs/SPEED-4X.md: est-gain variants)
  const tr = newTracker({ priorMean: priorFromHistory(firstRight, firstN), lr, gainMult: PARAMS.safety });
  for (const i of mine) if (i.skill_id === skillId) observe(tr, !!i.correct);
  return tr;
}
/** Sets items aside, unscored and marked: not asked, not counted, and said so to the learner. */
function setAside(items, reason) {
  const db = dbOf(); const at = new Date().toISOString();
  for (const i of items) db.update('items', i.id, { skipped: true, reserved: true, set_aside: reason, skipped_at: at });
  return items.map((i) => i.id);
}
/** Which parts of a lesson a miss on this question calls for: the sections sharing most words with the question and its explanation, none shown before. */
const words = (t) => new Set(String(t || '').toLowerCase().match(/[a-z0-9]{4,}/g) || []);
function lessonParts(lesson) {
  const parts = (lesson.sections || []).map((s, i) => ({ id: `s${i}`, text: `${s.heading || ''} ${s.body || ''} ${s.example || ''}` }));
  if (lesson.worked_example) parts.push({ id: 'worked', text: `${lesson.worked_example.problem || ''} ${(lesson.worked_example.steps || []).join(' ')} ${lesson.worked_example.answer || ''}` });
  if ((lesson.common_mistakes || []).length) parts.push({ id: 'mistakes', text: lesson.common_mistakes.join(' ') });
  return parts;
}
function partsForMiss(lesson, item, shownIds = [], chunk = PARAMS.chunk) {
  const parts = lessonParts(lesson).filter((p) => !shownIds.includes(p.id));
  if (!parts.length) return [];
  const q = words(`${item.prompt || ''} ${item.rationale || ''} ${item.answer || ''}`);
  const score = (p) => { let n = 0; for (const w of words(p.text)) if (q.has(w)) n++; return n; };
  const all = lessonParts(lesson).length;
  const take = Math.max(1, Math.ceil(all * chunk));
  return parts.map((p, i) => ({ p, s: score(p), i })).sort((a, b) => (b.s - a.s) || (a.i - b.i)).slice(0, take).map((x) => x.p.id);
}
/** What the client should know up front. A preview of another level keeps today's flow. */
function clientFlags(userId, session) {
  const on = (lever) => require('./efficiency').forLearner(userId, () => enabled(lever));
  if (!session || session.preview) return { testout: false, short: false, fast: false };
  return { testout: on('testout'), short: on('short'), fast: on('fast') };
}
/**
 * After an answer. A lesson level's check, with retrieval first: a miss brings the part of the page it calls for (or all of it), answers that show the skill known end the
 * level with the page skipped, the learner told, and the page one tap away. A practice level: once the skill is shown understood, the rest of its items in this block are set aside.
 * Returns null when nothing changes (every lever off, or nothing decided).
 */
function afterAnswer({ userId, session, item, correct, block, lesson }) {
  return require('./efficiency').forLearner(userId, () => {
    if (session.preview) return null;
    const open = block.filter((i) => i.correct === null && !i.skipped && i.id !== item.id);
    if (item.role === 'check' && lesson && (enabled('testout') || enabled('short'))) {
      if (!enabled('testout')) return null; // the short page has no place until retrieval comes first
      const db = dbOf();
      const state = { parts: [], ...((session.speed_state || {})[item.block || 0] || {}) };
      const save = () => db.update('sessions', session.id, { speed_state: { ...(session.speed_state || {}), [item.block || 0]: state } });
      const missedAny = block.some((i) => i.correct === false) || !correct;
      if (!correct) {
        if (state.whole) return null;
        if (enabled('short')) {
          const parts = partsForMiss(lesson, item, state.parts);
          state.parts = [...state.parts, ...parts]; save();
          return parts.length ? { action: 'teach', parts } : null;
        }
        state.whole = true; save();
        return { action: 'teach', whole: true };
      }
      if (missedAny || !state || state.parts.length || state.whole) return null;
      const tr = trackerFor(userId, item.skill_id);
      const noMoreChecks = !open.length;
      const sure = shown(tr);
      if (!sure && !noMoreChecks) return null;
      // Every check right, or the tracker sure earlier: the page is skipped, and the learner is told. Noted on the lesson so the path can list it.
      const ids = setAside(open, 'test_out');
      db.update('lessons', lesson.id, { skipped_by_check_at: new Date().toISOString() });
      state.skipped = true; save();
      return { action: 'skip_page', set_aside: ids, message: 'You got these right, so we skipped this page to save you time. It is still here if you want it.' };
    }
    if (session.kind === 'lesson' && enabled('stop') && ['focus', 'stretch', 'support'].includes(item.role) && correct) {
      const rest = open.filter((i) => i.skill_id === item.skill_id && ['focus', 'stretch', 'support'].includes(i.role));
      if (!rest.length || !shown(trackerFor(userId, item.skill_id))) return null;
      return { action: 'stop_skill', set_aside: setAside(rest, 'mastered'), message: "You've shown you have this one, so we're moving on sooner." };
    }
    return null;
  });
}
/** Has the focus skill of a practice level been shown understood? (the mastery stop: the level is ready without its remaining items) */
function practiceShown(userId, skillId) {
  return require('./efficiency').forLearner(userId, () => enabled('stop') && shown(trackerFor(userId, skillId)));
}
/** The review rule for one skill as the scheduler sees it. end: { daysToEnd, recallAtEnd } when the goal has a known last day, else null. */
function reviewWanted(userId, skillId, recallNow, end) {
  const mode = String(process.env.SPEED_REVIEW_MODE || 'through') === 'end' ? 'end' : 'through';
  return reviewDue({
    k: kMean(trackerFor(userId, skillId)), recallNow, recallAtEnd: end ? end.recallAtEnd : null, daysToEnd: end ? end.daysToEnd : null,
    target: PARAMS.defaultTarget, margin: PARAMS.reviewMargin, endMargin: PARAMS.endMargin, mode, window: 10,
  });
}
/* eslint-enable global-require */

module.exports = {
  SWITCH, DEFAULT, PARAMS, enabled,
  newTracker, observe, taught, pKnown, kMean, shown, priorFromHistory, trackerFromAnswers, nextStep, pRight,
  PLACE, bestItem, placementNext, placementAnswer,
  reviewDue, endWindow,
  trackerFor, setAside, lessonParts, partsForMiss, clientFlags, afterAnswer, practiceShown, reviewWanted,
};
