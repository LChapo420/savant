/**
 * Learner-confirmed card (docs/SCORE-MONTH.md part 2). For traits that are the person's own taste or self-view (the `preference` and `scale` classes in ceilings.js) the learner is the
 * best source: the card says what it thinks, the learner agrees or corrects, and the answer becomes evidence that outweighs inference. Pure functions over a plain state object, no I/O.
 *
 * state = { answers: { id: [{ value (points), day, shown (what the card showed), how: 'agree'|'correct'|'set' }] }, personal: { key: { value, day } } }
 *
 * Honest limits, repeated in the report: (1) a stated answer is the ground truth for a PREFERENCE only in the sense of "what the person endorses"; it is not shown to predict which lesson
 * works best for them (Pashler 2008, benefit class), so confirmed preferences set tone and framing, and the outcome-tested bandit (decision-bandit.js) decides what actually teaches. (2) Answers carry
 * noise (retest of surveys .67-.78, ceilings.js) and children answer on three steps, so one answer is weighed, never taken as exact; repeated answers average. (3) Under-13 without consent: no card.
 *
 * Asking budget: at most MAX_PER_DAY traits a day, a re-ask only after RE_ASK_DAYS and only for traits whose first two answers differ by more than 20 points.
 */
'use strict';
const { STATS } = require('./stats');
const { INDEX } = require('./ceilings');

const MAX_PER_DAY = 4;
const RE_ASK_DAYS = 12;
const BY_ID = Object.fromEntries(STATS.map((s) => [s.id, s]));
const CONFIRMABLE = Object.keys(INDEX).filter((id) => INDEX[id] === 'preference' || INDEX[id] === 'scale');

/** Answer steps -> points: 5 steps for teens/adults, 3 for children (17 / 50 / 83). */
const STEPS = { adult: [10, 30, 50, 70, 90], teen: [10, 30, 50, 70, 90], child: [17, 50, 83] };
const nearestStep = (points, band = 'adult') => (STEPS[band] || STEPS.adult).reduce((b, x) => (Math.abs(x - points) < Math.abs(b - points) ? x : b));

/** Typical answer noise (points, one answer) by age band, including step rounding for children. Our judgement from survey retest figures; replaced by retest data once testers answer twice. */
const ANSWER_SD = { adult: 8, teen: 10, child: 14 };

const newState = () => ({ answers: {}, personal: {} });

/** Plain-language question for one trait, built from its two sides (stats.js). */
function question(id, band = 'adult') {
  const s = BY_ID[id]; if (!s) return null;
  const steps = STEPS[band] || STEPS.adult;
  return { id, name: s.name, low: s.low, high: s.high, text: `Which fits you better: "${s.low}" or "${s.high}"?`, steps, labels: steps.length === 3 ? ['mostly the first', 'in between', 'mostly the second'] : ['the first', 'a bit the first', 'in between', 'a bit the second', 'the second'] };
}

const answersOf = (st, id) => (st && st.answers && st.answers[id]) || [];

/** Ask which traits next (up to `max`): never-asked first, ordered by impact then by how unsure the card is (sd), then contradicting ones due a re-ask. */
function nextQuestions(state, { day = 0, card = {}, band = 'adult', max = MAX_PER_DAY, consent = true } = {}) {
  if (!consent) return [];
  const asked = (id) => answersOf(state, id);
  const fresh = CONFIRMABLE.filter((id) => !asked(id).length);
  const due = CONFIRMABLE.filter((id) => { const a = asked(id); return a.length === 1 || (a.length === 2 && Math.abs(a[0].value - a[1].value) > 20); })
    .filter((id) => day - asked(id)[asked(id).length - 1].day >= RE_ASK_DAYS);
  // A trait with one answer is asked again after RE_ASK_DAYS (averaging helps noisy learners); re-asks rank below every never-asked trait.
  const score = (id) => (BY_ID[id].impact || 1) * 10 + ((card[id] && card[id].sd) || 17) / 17;
  const order = [...fresh.sort((a, b) => score(b) - score(a)), ...due.sort((a, b) => score(b) - score(a))];
  return order.slice(0, max).map((id) => ({ ...question(id, band), shown: (card[id] && card[id].est) != null ? card[id].est : null, reask: asked(id).length > 0 }));
}

/**
 * Record an answer. how: 'agree' (the learner says the card is right: stored as the card's number), 'correct'/'set' (the learner picked a step). Returns a new state; a correction is any answer
 * whose side of 40/60 differs from what the card showed, or that moves it 15+ points.
 */
function applyAnswer(state, id, { value, how = 'set', shown = null, day = 0 } = {}) {
  if (!BY_ID[id]) return state;
  const v = how === 'agree' && shown != null ? shown : value; if (!Number.isFinite(v)) return state;
  const rec = { value: Math.max(0, Math.min(100, v)), day, shown, how: how === 'agree' ? 'agree' : (shown != null && Math.abs(v - shown) >= 15 ? 'correct' : 'set') };
  return { ...state, answers: { ...state.answers, [id]: [...answersOf(state, id), rec] } };
}

/** The reading a learner's own answers give for one trait: mean of answers, sd = sqrt(answerSd^2 / n + floor^2) with a 4-point floor for persistent self-view error. */
function confirmedReading(state, id, { band = 'adult', sdScale = 1 } = {}) {
  const a = answersOf(state, id); if (!a.length) return null;
  const mean = a.reduce((s, x) => s + x.value, 0) / a.length;
  const sd = Math.sqrt((ANSWER_SD[band] * sdScale) ** 2 / a.length + 16);
  return { est: mean, sd, n: a.length, corrected: a.some((x) => x.how === 'correct') };
}

/** For the profile screen: each confirmable trait with the card's number, the learner's answer, and a status. */
function profileView(state, card = {}) {
  return CONFIRMABLE.map((id) => {
    const a = answersOf(state, id); const last = a[a.length - 1];
    return { id, name: BY_ID[id].name, card: card[id] ? card[id].est : null, answer: last ? last.value : null, status: !a.length ? 'unasked' : a.some((x) => x.how === 'correct') ? 'corrected' : 'confirmed', answers: a.length };
  });
}
/** Share of asked traits where the learner corrected the card, and the mean size of corrections: the card's own error as the learner sees it. */
function correctionStats(state) {
  const ids = Object.keys(state.answers || {}); let n = 0; let cor = 0; let size = 0;
  for (const id of ids) { const a = answersOf(state, id)[0]; if (a.shown == null) continue; n += 1; if (a.how === 'correct') cor += 1; size += Math.abs(a.value - a.shown); }
  return { asked: ids.length, withShown: n, correctedShare: n ? cor / n : null, meanShift: n ? size / n : null };
}

// ── what the learner states about themselves that is not a scorecard trait ───
/** Stated, so the stated value is the value. Used by the modification plan (decisions.js modificationPlan). */
const PERSONAL = {
  session_minutes: { ask: 'How long can you usually focus in one sitting?', unit: 'minutes', min: 5, max: 120 },
  best_daypart: { ask: 'When do you study best?', options: ['morning', 'afternoon', 'evening', 'night'] },
  days_per_week: { ask: 'How many days a week can you study?', unit: 'days', min: 1, max: 7 },
  goal: { ask: 'What are you aiming for?', options: ['pass a test', 'understand deeply', 'keep up with class', 'for fun'] },
  retention_days: { ask: 'How long do you need to remember this?', unit: 'days', min: 1, max: 3650 },
  device: { ask: 'What do you mostly use?', options: ['phone', 'tablet', 'laptop', 'desktop'] },
};
function setPersonal(state, key, value, day = 0) {
  const p = PERSONAL[key]; if (!p) return state;
  if (p.options && !p.options.includes(value)) return state;
  if (p.unit && !(Number.isFinite(value) && value >= p.min && value <= p.max)) return state;
  return { ...state, personal: { ...state.personal, [key]: { value, day } } };
}

module.exports = { MAX_PER_DAY, RE_ASK_DAYS, CONFIRMABLE, STEPS, ANSWER_SD, newState, question, nearestStep, nextQuestions, applyAnswer, confirmedReading, profileView, correctionStats, PERSONAL, setPersonal };
