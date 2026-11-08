/**
 * The three learner-chosen modes (LEARNING_MODES, off by default). docs/FOUR-X.md.
 *
 *   Fastest   at least as much understanding and retention as normal studying, in as little time as we can reach (aim 4x)
 *   Balanced  2x faster and more understanding and retention
 *   Highest   the most understanding and retention
 *
 * Pure functions and constants only; no DB. Used by the app (services/material-study.js, material-path.js via planFor) and by
 * scripts/four-x-sim.js, so the simulated numbers are the app's numbers. Constants were chosen on the design seed; docs/FOUR-X.md has the result.
 */
'use strict';

// FSRS-6's forgetting curve. S is the number of days until recall falls to 0.9.
const DECAY = 0.1542;
const FACTOR = 0.9 ** (1 / -DECAY) - 1;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const on = () => /^(1|on|true)$/i.test(process.env.LEARNING_MODES || '');

/**
 * diagnose  'none' | 'one' (one right answer given as sure) | 'two' (two right answers)
 * page      'core' (only the essential statements) | 'lean' | 'full' (today's lesson)
 * firstQs   retrievals a part gets on the first pass; 'pair' = one question covers two neighbouring parts; 'criterion' = until 3 right (max 6)
 * explain   the answer shows why; transferQs application questions a part
 * worked    a worked example for learners who are new to the part
 * gapTarget predicted recall at the moment a review falls due (lower = further apart)
 * horizonFloor [[up to this many days, predicted recall on the last day of the goal], ...]: once it holds, reviews stop. A longer goal has a lower floor because normal study holds less there too.
 * pairReviews one question may check two neighbouring parts when memory of both is strong
 * shortFormat three answer options and a one-line why (Fastest only; 41 to 36 seconds an item, Schneid et al. 2014)
 */
const MODES = Object.freeze({
  fastest: Object.freeze({
    id: 'fastest', label: 'Fastest', blurb: 'The essentials, checked once and spaced just enough. Aims for 4x faster than normal study with at least the same understanding and memory.',
    diagnose: 'none', page: 'core', firstQs: 1, explain: true, transferQs: 0, worked: false, gapTarget: 0.6, horizonFloor: [[60, 0.55], [180, 0.5], [Infinity, 0.40]], pairReviews: false, shortFormat: false, shortFeedback: true,
  }),
  balanced: Object.freeze({
    id: 'balanced', label: 'Balanced', blurb: 'Lean lessons, two checks and an application question on each part. Aims for 2x faster than normal study with more understanding and memory.',
    diagnose: 'none', page: 'core', firstQs: 1, explain: true, transferQs: 0.5, worked: false, gapTarget: 0.62, horizonFloor: [[60, 0.6], [180, 0.55], [Infinity, 0.5]], pairReviews: false, shortFormat: false,
  }),
  highest: Object.freeze({
    id: 'highest', label: 'Highest', blurb: 'The full lessons, worked examples, practice until it is solid and more application questions. The most understanding and memory, and the most time.',
    diagnose: 'two', page: 'full', firstQs: 'criterion', explain: true, transferQs: 2, worked: true, gapTarget: 0.88, horizonFloor: [[Infinity, 0.93]], pairReviews: false, shortFormat: false,
  }),
});

/** Fastest with the two parts of its design that are not built in the app yet: one question covering two parts, and three-option questions (docs/FOUR-X.md). Simulated as a separate row only. */
const FASTEST_FULL_DESIGN = Object.freeze({ firstQs: 'pair', pairReviews: true, shortFormat: true });

/** A test on a known date: on the eve, any part predicted below this gets one last question (the normal student's cram is hard to beat otherwise). Added after the first held-out look, which showed dated tests losing 11 points; verified on a fresh held-out pair. */
const DATED_EVE_FLOOR = 0.9;

const DEFAULT = 'balanced';
const LIST = Object.freeze(['fastest', 'balanced', 'highest']);

function get(id) { return MODES[id] || null; }
function normalize(id) { return MODES[id] ? id : null; }

/** Recall predicted t days after the last look, for strength S (days to 0.9). */
function recall(S, t, decay = DECAY) {
  if (!(S > 0)) return 0;
  const f = 0.9 ** (1 / -decay) - 1;
  return (1 + (f * Math.max(0, t)) / S) ** -decay;
}

/** Days after a look until recall falls to target. */
function gapDays(S, target, decay = DECAY) {
  const f = 0.9 ** (1 / -decay) - 1;
  return (S * (target ** (1 / -decay) - 1)) / f;
}

function floorFor(mode, horizonDays) {
  const m = typeof mode === 'string' ? MODES[mode] : mode;
  const f = m.horizonFloor;
  if (typeof f === 'number') return f;
  const row = f.find(([d]) => horizonDays <= d) || f[f.length - 1];
  return row[1];
}

/**
 * When is this part next due, given its strength and the goal? Returns { dueInDays } or { done: true }.
 * A goal with no end date runs on with gaps up to 365 days. daysLeft: days from now to the end of the goal.
 */
function nextReview(S, mode, daysLeft = null, decay = DECAY) {
  const m = typeof mode === 'string' ? MODES[mode] : mode;
  if (daysLeft != null) {
    if (daysLeft <= 0) return { done: true };
    if (recall(S, daysLeft, decay) >= floorFor(m, daysLeft)) return { done: true };
    return { dueInDays: Math.max(1, Math.min(gapDays(S, m.gapTarget, decay), daysLeft)) };
  }
  return { dueInDays: Math.max(1, Math.min(gapDays(S, m.gapTarget, decay), 365)) };
}

/**
 * The app's knobs for a mode. `reviewTarget` and `reviewFloor` feed services/material-review-expand.js: a horizon or test reads them instead
 * of its defaults, so "fewer, better-timed checks" and "stop when the goal holds" come from one place.
 */
function planFor(modeId) {
  const m = MODES[modeId]; if (!m) return null;
  return {
    mode: m.id, page: m.page, reviewTarget: m.gapTarget, reviewFloorFor: (days) => floorFor(m, days), diagnose: m.diagnose,
    questionsPerPart: m.firstQs === 'criterion' ? 3 : m.firstQs === 'pair' ? 1 : m.firstQs, pairFirstPass: m.firstQs === 'pair', showWhy: m.explain, applicationQuestions: m.transferQs,
    workedExample: m.worked, oneQuestionPerLook: m.pairReviews || m.firstQs === 1,
  };
}

/**
 * Nothing may be dropped silently. Given the course's key points (what a test could ask) and the words of the page the mode shows for each
 * part, returns what the page leaves out and whether every testable point is still covered. A point counts as covered when the page's text
 * carries enough of its content words (or it is a part's own objective); anything not covered is listed and the path must teach it back.
 */
function omissionCheck(keyPoints, pages) {
  const STOP = new Set('a an the of to in on for and or but is are was were be been it its this that with as at by from into than then there their they we you your not no if when which who whom what how why so such can could will would should may might must do does did has have had'.split(' '));
  const words = (s) => (String(s || '').toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
  const pageWords = new Set(words((pages || []).join(' ')));
  const out = { total: 0, covered: 0, missing: [] };
  for (const kp of keyPoints || []) {
    const point = typeof kp === 'string' ? kp : (kp.text || kp.point || '');
    const w = words(point); if (!w.length) continue;
    out.total += 1;
    const hit = w.filter((x) => pageWords.has(x)).length / w.length;
    if (hit >= 0.6) out.covered += 1; else out.missing.push(point);
  }
  out.ok = out.missing.length === 0;
  return out;
}

/** The plain sentence a learner sees for what a path left out. */
function leftOutNote(mode, n, reason) {
  if (!n) return null;
  const why = reason === 'known' ? 'you showed you already know them' : 'they are extra detail, not something a test on this material would ask';
  return `${mode === 'fastest' ? 'Fastest' : 'This path'} leaves out ${n} ${n === 1 ? 'part' : 'parts'} because ${why}. Tap to read them.`;
}

/** The first sentence of an explanation, for Fastest's one-line why. The full text is always returned beside it. */
function oneLine(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(.{20,}?[.!?])(\s|$)/);
  return m ? m[1] : t;
}

/**
 * The page a mode shows. Fastest and Balanced show the key statements; the full text moves under "More from your material", one tap away.
 * A key statement must not hide something a question tests: each question's answer is checked against the statements, and any point not
 * covered is added to the page, so nothing testable is cut. Returns the lesson unchanged for Highest or no mode, or when the lesson has no key points.
 */
function lessonView(lesson, questions, modeId, correctTextOf = (q) => q.answer) {
  const m = MODES[modeId];
  if (!m || m.page === 'full' || !lesson || !Array.isArray(lesson.key_points) || !lesson.key_points.length) return lesson;
  const check = omissionCheck((questions || []).map((q) => { try { return correctTextOf(q); } catch { return ''; } }).filter(Boolean), lesson.key_points);
  const also = check.missing.slice(0, 6);
  const keys = [...lesson.key_points, ...also];
  return {
    ...lesson,
    paragraphs: [],
    key_points: keys,
    aside: [...(lesson.paragraphs || []), ...(lesson.aside || [])],
    core_only: true,
    core_note: 'This mode shows the key points only. The full text is one tap away under "More from your material", and every point a question asks is on the page.',
    omission: { questions: check.total, covered: check.covered, added: also.length },
  };
}

module.exports = { DATED_EVE_FLOOR, oneLine, lessonView, FASTEST_FULL_DESIGN, on, MODES, LIST, DEFAULT, get, normalize, planFor, recall, gapDays, nextReview, floorFor, omissionCheck, leftOutNote, DECAY, FACTOR, clamp };
