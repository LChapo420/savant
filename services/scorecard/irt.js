/**
 * Item-calibrated ability: what this learner was EXPECTED to get right, so the
 * scorecard can read behaviour against it instead of against raw accuracy.
 *
 * An Elo-style Rasch model (Pelánek 2016, "Applications of the Elo rating
 * system in adaptive educational systems"):
 *
 *   P(right) = sigmoid(theta + d_skill - b_label - b_format)
 *
 *   theta     the learner's general ability          (scorecards row, field ability)
 *   d_skill   how far this skill is above/below it   (skill_states.elo, per skill)
 *   b_label   difficulty of an item with this label  (one content_cache row, key
 *             (1-10), learned across all learners      CALIBRATION_KEY, shared by all)
 *   b_format  extra difficulty of a typed answer      (the same row)
 *
 * Every parameter moves by K x (right - expected) after an answer, with K
 * shrinking as that parameter's evidence grows. Three kinds of answer teach the
 * model nothing about knowledge and are left out of the updates (their
 * expected value is still recorded): a rapid guess (under 30% of the time the
 * item deserves: Wise & Ma's normative-threshold idea, against the item's own
 * expected time); an answer reached with the coach; and an answer on a skill
 * last practised a day or more ago, which is a test of memory, not of
 * knowledge — the forgetting model (forgetting.js) reads those.
 *
 * Why it exists: almost every behavioural signal used to compare raw accuracy
 * across items or moments of different difficulty (research report 1.4).
 * "Right after a miss", "on a hard item", "when they tapped sure" all differ in
 * difficulty as well as in the trait. The residual (right - expected) takes the
 * difficulty and the learner's ability out.
 *
 * Level-up, review scheduling and placement do not read any of this: mastery.js
 * computes them exactly as before and only stores these numbers beside them.
 */
const db = require('../../config/db');
const { expectedMs } = require('./signals');
const scorecard = require('./index');

// Item calibration is shared content, so it lives in the shared content cache
// as one row (config/db has no collection of its own for it).
const CALIBRATION_KEY = 'scorecard:item_calibration';
const RECENT_KEEP = 40;            // answer contexts kept per learner, for the level and session reads
const DELAYED_DAYS = 1;            // a gap this long since the skill was last practised makes an answer a memory test
const RAPID = 0.3;                 // share of the item's expected time below which an answer is a rapid guess
const PREV_FRESH_MS = 15 * 60000;  // "the answer before" only counts if it was this recent

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const r4 = (v) => Number(v.toFixed(4));

// Learning rates: large while a parameter knows little, small once it knows a lot.
const kUser = (n) => Math.max(0.04, 0.4 / (1 + 0.05 * n));
const kSkill = (n) => Math.max(0.08, 0.5 / (1 + 0.1 * n));
const kItem = (n) => Math.max(0.01, 0.3 / (1 + 0.01 * n));

function labelKey(difficulty) {
  return `label:${clamp(Math.round(Number(difficulty) || 5), 0, 10)}`;
}
function formatKey(format) {
  // Multiple choice is the reference format; anything typed is one parameter.
  return format && format !== 'multiple_choice' ? 'format:typed' : null;
}
/** A starting value before anything is calibrated: half a logit per two labels, a typed answer a little harder. */
function defaultB(key) {
  if (key.startsWith('label:')) return (Number(key.slice(6)) - 5) * 0.25;
  if (key === 'format:typed') return 0.3;
  return 0;
}
function calibrationRow() {
  return db.findOne('content_cache', (r) => r.key === CALIBRATION_KEY);
}
function calibration(table, key) {
  if (!key) return { key: null, b: 0, n: 0 };
  const hit = table[key];
  return hit ? { key, b: hit.b, n: hit.n } : { key, b: defaultB(key), n: 0 };
}

// ── mastery velocity: the slope of ability over practice ──────────────────
// Every fresh answer the model learns from (not rapid, not with the coach, not
// a memory test) also goes into a bin of TREND_BIN answers: when it was (the
// learner's count of such answers), how many were right, and the mean and
// variance of the items' calibrated difficulty (label + format, never the
// skill's own Elo, which follows the learner). From the bins, one logistic fit
// per learner: P(right) = sigmoid(a + slope * t - b), t in hundreds of
// answers. The slope is how fast they improve against items of fixed
// difficulty; the course getting harder for everyone shows up as the
// population's typical slope, which the scorecard reads them against.
const TREND_BIN = 10;
const TREND_KEEP = 150;           // bins kept (the most recent 1,500 fresh answers)

function addToTrend(trend, t, y, b) {
  const tr = trend || { bins: [], cur: null };
  const cur = tr.cur || { t: 0, n: 0, y: 0, b: 0, bb: 0 };
  const next = { t: cur.t + t, n: cur.n + 1, y: cur.y + y, b: cur.b + b, bb: cur.bb + b * b };
  if (next.n < TREND_BIN) return { ...tr, cur: next, closed: false };
  const mb = next.b / next.n;
  const bin = [r4(next.t / next.n / 100), next.n, next.y, r4(mb), r4(Math.max(0, next.bb / next.n - mb * mb))];
  return { bins: [...tr.bins, bin].slice(-TREND_KEEP), cur: null, closed: true };
}

/**
 * The learner's slope from their bins: Newton's method on (a, slope), each bin
 * a binomial at the probit-corrected mean difficulty. Returns { slope, se,
 * answers } or null with too little spread in time to say.
 */
function fitTrend(bins) {
  if (!bins || bins.length < 4) return null;
  const tbar = bins.reduce((x, b) => x + b[0] * b[1], 0) / bins.reduce((x, b) => x + b[1], 0);
  let a = 0;
  let k = 0;
  let info = null;
  for (let iter = 0; iter < 30; iter++) {
    let g0 = 0; let g1 = 0; let h00 = 1e-6; let h01 = 0; let h11 = 1e-6;
    for (const [t, n, y, mb, vb] of bins) {
      const c = 1 / Math.sqrt(1 + (Math.PI * vb) / 8);
      const x = t - tbar;
      const p = sigmoid(c * (a + k * x - mb));
      const w = n * p * (1 - p) * c;
      g0 += c * (y - n * p);
      g1 += c * (y - n * p) * x;
      h00 += w * c;
      h01 += w * c * x;
      h11 += w * c * x * x;
    }
    const det = h00 * h11 - h01 * h01;
    if (!(det > 0)) return null;
    const da = (h11 * g0 - h01 * g1) / det;
    const dk = (h00 * g1 - h01 * g0) / det;
    a += clamp(da, -1, 1);
    k += clamp(dk, -1, 1);
    info = { h00, h11, det };
    if (Math.abs(da) < 1e-6 && Math.abs(dk) < 1e-6) break;
  }
  return { slope: r4(k), se: r4(Math.sqrt(info.h00 / info.det)), answers: bins.reduce((x, b) => x + b[1], 0) };
}

// ── processing velocity: answer pace ───────────────────────────────────────
// The log of (answer time / the time the item deserves) on ordinary answers:
// not rapid, not with the coach, and not a deliberate long think (over 2.5x
// their own usual pace: deliberation's evidence, not pace's). Kept as faded
// sums (the most recent ~PACE_KEEP answers weigh most).
const PACE_KEEP = 300;
const PACE_EVERY = 5;              // the scorecard re-reads pace every this many pace answers
// ── reach: how far ahead of the course the learner is, per subject (round 4) ─
// The expected value of every fresh answer (before it is seen) says how far
// within reach the items the course serves this learner are: the logit of the
// ability model's expectation, theta + skill offset - item difficulty. Its
// recent average, per subject, is where they stand against the course right now
// (ahead of what the level assumes, or behind it) - the expertise against which
// the expertise reversal effect says support should be given or faded. It does
// not depend on what the difficulty labels mean (relative to a level or along a
// whole path): it is reach on what this learner is actually served. Kept as
// sums faded by 1/REACH_WINDOW per answer (about the last 100 answers).
const REACH_WINDOW = Number(process.env.SCORECARD_REACH_WINDOW || 100);
const REACH_EVERY = 5;             // the scorecard re-reads reach every this many fresh answers

function addPace(pace, x) {
  const p = pace || { n: 0, s: 0, q: 0, c: 0 };
  const f = p.n >= PACE_KEEP ? (PACE_KEEP - 1) / PACE_KEEP : 1;
  return { n: r4(p.n * f + 1), s: r4(p.s * f + x), q: r4(p.q * f + x * x), c: (p.c || 0) + 1 };
}

/** The learner's ability record, kept on their scorecard row. */
function abilityOf(card) {
  return (card && card.ability) || { theta: 0, n: 0, speed: { m: 0, n: 0 }, recent: [] };
}

// Contexts are stored compactly (a few dozen per learner on the scorecard row)
// and expanded on read.
const PACK = {
  item_id: 'i', skill_id: 's', at: 't', expected: 'e', expected_lpo: 'l', delayed: 'd', interval_days: 'iv',
  prior_attempts: 'pa', prior_correct: 'pc', prev_wrong: 'pw', rapid: 'r', rel_ratio: 'rr', coach: 'c', correct: 'y', guess: 'g', velocity: 'v', pace: 'pp',
  reach: 'rh', prior_spaced_right: 'sr', prior_spaced_wrong: 'sw',
};
// (Round 4: pace was packed as 'pc', the key of prior_correct, so every stored
// context lost its earlier-right count and the forgetting model read nc as the
// pace flag (0 or 1) and nw as nearly every earlier attempt. Each key must be
// its own.)
if (new Set(Object.values(PACK)).size !== Object.keys(PACK).length) throw new Error('irt: two context fields share a packed key');
const pack = (ctx) => Object.fromEntries(Object.entries(PACK).map(([k, v]) => [v, ctx[k]]));
const unpack = (row) => Object.fromEntries(Object.entries(PACK).map(([k, v]) => [k, row[v] === undefined ? null : row[v]]));

function itemRow(itemId) {
  if (itemId === null || itemId === undefined) return null;
  if (typeof itemId === 'number' || /^\d+$/.test(String(itemId))) return db.byId('items', Number(itemId));
  return null;
}

/**
 * Fold one answer into the model. Called by mastery.recordAttempt before it
 * updates the skill's state, with that state as it was.
 *
 * @returns {{ expected:number, skillElo:{d:number,n:number}, ctx:object }}
 */
function attempt({ userId, skillId, state, itemId, difficulty, latencyMs, correct, hintUsed }) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const item = itemRow(itemId);
  const format = item ? item.format : null;
  const card = scorecard.get(userId);
  const ab = abilityOf(card);
  const elo = (state && state.elo) || { d: 0, n: 0 };
  const calRow = calibrationRow();
  const table = { ...((calRow && calRow.table) || {}) };
  const lab = calibration(table, labelKey(difficulty));
  const fmt = calibration(table, formatKey(format));
  const logit = ab.theta + elo.d - lab.b - fmt.b;
  const expected = sigmoid(logit);

  // Leave the previous answer's own update out of the expectation that
  // residuals are read against: after a miss the model lowers its estimate,
  // and an answer read against that lowered estimate would look like a
  // recovery that is only the model correcting itself.
  let lpoLogit = logit;
  if (ab.last_du && now - Date.parse(ab.last_du.at) < PREV_FRESH_MS) {
    lpoLogit -= ab.last_du.user;
    if (ab.last_du.skill === skillId) lpoLogit -= ab.last_du.d;
  }

  const last = state && state.last_seen_at ? Date.parse(state.last_seen_at) : null;
  const intervalDays = last ? Math.max(0, (now - last) / 86400000) : null;
  const delayed = intervalDays !== null && intervalDays >= DELAYED_DAYS;
  const ms = Number(latencyMs) || 0;
  const ratio = item && ms > 0 ? ms / expectedMs(item) : null;
  const rapid = ratio !== null && ratio < RAPID;
  // This learner's own usual pace (mean log time ratio over ordinary answers),
  // so "took long" and "answered fast" can be read against them, not against
  // a reader of average speed.
  const speed = ab.speed || { m: 0, n: 0 };
  const relRatio = ratio !== null && speed.n >= 10 ? ratio / Math.exp(speed.m) : null;
  const prevWrong = !!(ab.prev && !ab.prev.correct && now - Date.parse(ab.prev.at) < PREV_FRESH_MS);
  // The chance of being right by guessing alone, for the forgetting model: one
  // over the options on a choice, close to nothing on a typed answer.
  const options = item && Array.isArray(item.choices) ? item.choices.length : 0;
  const guess = item ? (item.format === 'multiple_choice' && options ? 1 / options : item.format === 'multiple_choice' ? 0.25 : 0.02) : 0.1;

  const y = correct ? 1 : 0;
  const include = !rapid && !hintUsed && !delayed;
  let du = 0;
  let dd = 0;
  let skillElo = elo;
  if (include) {
    const err = y - expected;
    du = kUser(ab.n) * err;
    dd = kSkill(elo.n) * err;
    skillElo = { d: r4(clamp(elo.d + dd, -6, 6)), n: elo.n + 1 };
    for (const [row, delta] of [[lab, -kItem(lab.n) * err], [fmt, -kItem(fmt.n) * err]]) {
      if (row.key) table[row.key] = { b: r4(clamp(row.b + delta, -6, 6)), n: row.n + 1 };
    }
    if (calRow) db.update('content_cache', calRow.id, { table });
    else db.insert('content_cache', { key: CALIBRATION_KEY, kind: 'item_calibration', table, payload: [] });
  }

  const ctx = {
    item_id: itemId === undefined ? null : itemId,
    skill_id: skillId,
    at: nowIso,
    expected: r4(expected),
    expected_lpo: r4(sigmoid(lpoLogit)),
    delayed,
    interval_days: intervalDays === null ? null : r4(intervalDays),
    prior_attempts: (state && state.attempts) || 0,
    prior_correct: (state && state.correct) || 0,
    // Earlier answers on the skill that were themselves memory tests (round 5):
    // what lengthens a half-life is a successful retrieval after a gap.
    prior_spaced_right: ((ab.sp && ab.sp[skillId]) || [0, 0])[0],
    prior_spaced_wrong: ((ab.sp && ab.sp[skillId]) || [0, 0])[1],
    prev_wrong: prevWrong,
    rapid,
    rel_ratio: relRatio === null ? null : r4(relRatio),
    coach: !!hintUsed,
    correct: !!correct,
    guess: r4(guess),
  };
  // Answer pace (processing velocity): ordinary answers only.
  const paceOk = ratio !== null && ratio > 0 && !rapid && !hintUsed && ratio <= 6 && !(relRatio !== null && relRatio > 2.5);
  const pace = paceOk ? addPace(ab.pace, Math.log(ratio)) : (ab.pace || null);
  if (paceOk && pace.c % PACE_EVERY === 0) ctx.pace = true;
  // Reach (round 4): fresh, unaided, non-rapid answers on an item of a known subject.
  // Practice rows carry their sitting, not their subject: the subject is the sitting's.
  let trackOf = item && item.track_id ? String(item.track_id) : null;
  if (!trackOf && item && item.session_id !== undefined && item.session_id !== null) {
    const sitting = db.byId('sessions', item.session_id);
    if (sitting && sitting.track_id) trackOf = String(sitting.track_id);
  }
  let reach = ab.reach || null;
  if (include && trackOf) {
    const was = (reach && reach[trackOf]) || { s: 0, q: 0, n: 0, c: 0 };
    const f = 1 - 1 / REACH_WINDOW;
    const x = clamp(logit, -6, 6);
    reach = { ...(reach || {}), [trackOf]: { s: r4(was.s * f + x), q: r4(was.q * f + x * x), n: r4(was.n * f + 1), c: was.c + 1 } };
    if (reach[trackOf].c % REACH_EVERY === 0) ctx.reach = trackOf;
  }
  // Mastery velocity's bins: fresh, unaided, non-rapid answers only.
  const trend = include ? addToTrend(ab.trend, ab.n, y, lab.b + fmt.b) : (ab.trend || null);
  if (trend && trend.closed) {
    ctx.velocity = true;
    trend.fit = fitTrend(trend.bins);
  }
  if (trend) delete trend.closed;
  const nextSpeed = ratio !== null && !rapid && !hintUsed && ratio <= 6
    ? { m: r4((speed.m * Math.min(speed.n, 200) + Math.log(ratio)) / (Math.min(speed.n, 200) + 1)), n: speed.n + 1 }
    : speed;
  // Spaced answers per skill (memory tests: not rapid, no coach), for the forgetting model.
  let sp = ab.sp || null;
  if (delayed && !rapid && !hintUsed) {
    const was = (sp && sp[skillId]) || [0, 0];
    sp = { ...(sp || {}), [skillId]: correct ? [was[0] + 1, was[1]] : [was[0], was[1] + 1] };
  }
  const ability = {
    theta: r4(clamp(ab.theta + du, -8, 8)),
    n: ab.n + (include ? 1 : 0),
    speed: nextSpeed,
    prev: { correct: !!correct, at: nowIso },
    last_du: { user: r4(du), d: r4(dd), skill: skillId, at: nowIso },
    recent: [...(ab.recent || []), pack(ctx)].slice(-RECENT_KEEP),
    ...(trend ? { trend } : {}),
    ...(pace ? { pace } : {}),
    ...(reach ? { reach } : {}),
    ...(sp ? { sp } : {}),
  };
  db.update('scorecards', card.id, { ability });
  return { expected, skillElo, ctx };
}

/**
 * The context recorded for one answered item: by its id, or — where the caller
 * gave mastery a different id than the item row's (block levels) — the latest
 * context on the same skill from the last two minutes.
 */
function contextFor(userId, item) {
  const card = db.findOne('scorecards', (r) => r.user_id === userId);
  if (!card || !card.ability || !item) return null;
  const recent = (card.ability.recent || []).map(unpack);
  // A block level's check is recorded under "block:<plan>:<check>" (block-levels.js answerCheck).
  const ids = new Set([String(item.id)]);
  if (item.plan_id && item.check_id) ids.add(`block:${item.plan_id}:${item.check_id}`);
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].item_id !== null && recent[i].item_id !== undefined && ids.has(String(recent[i].item_id))) return recent[i];
  }
  const now = Date.now();
  for (let i = recent.length - 1; i >= 0; i--) {
    const c = recent[i];
    if (now - Date.parse(c.at) > 2 * 60000) break;
    if (c.skill_id === item.skill_id) return c;
  }
  return null;
}

/** Contexts for a set of items, by item id (missing where none was recorded). */
function contextsFor(userId, items) {
  const out = {};
  for (const it of items || []) {
    const c = contextFor(userId, it);
    if (c) out[it.id] = c;
  }
  return out;
}

/** The learner's current ability on a skill, in logits (theta + d), for reports. */
function abilityOn(userId, skillState) {
  const card = db.findOne('scorecards', (r) => r.user_id === userId);
  return ((card && card.ability && card.ability.theta) || 0) + ((skillState && skillState.elo && skillState.elo.d) || 0);
}

module.exports = {
  fitTrend,
  attempt, contextFor, contextsFor, abilityOn, labelKey, formatKey, DELAYED_DAYS, RAPID, CALIBRATION_KEY,
};
