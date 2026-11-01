/**
 * What the tutor notices about a learner, kept as scorecard EVIDENCE: the hook for the scorecard's owner
 * (tutor-depth, 1 Nov 2026; the owner: "everything the user does or says, and how they do or say it, is accounted for").
 *
 * The tutor sees things no lesson sees: a learner asking to be told the answer, trying first and showing their working,
 * saying they are stuck or fed up, an explanation that clicked or did not, saying they are bad at something. This file
 * records each of those as one row in `tutor_observations`, with the scorecard measure it bears on and which way.
 *
 *   onTutorObservation(userId, obs)   THE HOOK. obs = { kind, skill_id?, where?, style?, outcome?, note? }. Validates the
 *                                     kind, maps it to its measure and direction (KINDS), stores it, then offers it to
 *                                     the scorecard (bridge, below). Never throws; returns the stored row or null.
 *   fromMessage(userId, text, ctx)    reads one learner message for the message-level kinds (asked_for_answer,
 *                                     attempted_first, said_stuck, said_frustrated, said_cannot) and records them.
 *   pending(userId, { since })        the stored rows, oldest first (for the owner's replay and the tests).
 *   proposedObservations(rows)        the rows in scorecard.observe's shape ({ stat, value, weight, note }), as a
 *                                     PROPOSAL: value 50 +/- 20 by direction, weight WEIGHT x strength (small: a chat
 *                                     line is weak evidence next to a lesson's answers).
 *
 * Bridge (services/scorecard/* is NOT edited here): the scorecard owner's hook, services/scorecard/hooks.js
 *   onTutorObservation(userId, [{ measure, direction, strength 0-3 }]) (main 174a3ae, docs/SCORECARD-EVERYTHING.md 8),
 *   takes the measures in indicators.LLM_STATS as llm.<measure> units at the owner's validity. Each stored row whose
 *   measure it takes is forwarded (strength x 3, rounded) and marked `bridged`; the others (hint_dependency, help_seeking,
 *   the explanation measures other than dialogic_preference) wait in `tutor_observations` (MAX_ROWS per learner) until
 *   the hook reads more. Each message also sends "looked, saw nothing" (direction 0) for the measures it was read for
 *   (LOOKED_FOR), as the hook asks. When the dock closes, `chatEnded` calls hooks.onTutorActivity so the scorecard reads
 *   the new chat text now. Documented in docs/TUTOR-DEPTH.md ("The scorecard hook").
 *
 * Who: only a learner allowed extra measurement channels (services/boosters.js `allowed`: an adult or teen who needs
 * no parent, or a child whose parent turned "measurement extras" on). An under-13 without that consent gets no row.
 * Stored per learner; exported and deleted with the account (routes/profile.js EXPORT_MORE, routes/consent.js
 * KNOWN_COLLECTIONS).
 */
const db = require('../config/db');

const MAX_ROWS = 400;
const WEIGHT = 0.15;

/** kind -> the measure it bears on and the direction (+1: toward the stat's "high" end). */
const KINDS = {
  asked_for_answer: { stat: 'hint_dependency', dir: 1, strength: 0.6 },
  attempted_first: { stat: 'productive_struggle', dir: 1, strength: 0.5 },
  said_stuck: { stat: 'help_seeking', dir: 1, strength: 0.4 },
  said_frustrated: { stat: 'frustration_threshold', dir: -1, strength: 0.6 },
  said_cannot: { stat: 'self_efficacy', dir: -1, strength: 0.6 },
  // A way of explaining that clicked (outcome worked) or did not (failed): which measure depends on the way.
  explanation_outcome: { stat: null, dir: 0, strength: 0.8 },
};
const STYLE_STAT = {
  analogy: ['analogical_transfer', 1],
  worked_example: ['worked_example_dependence', 1],
  step_questions: ['dialogic_preference', 1],
  visual: ['spatial_anchoring', 1],
  brief: ['brevity_preference', 1],
  detailed: ['brevity_preference', -1],
};

const ASKS = /\b(just tell me|tell me the answer|give me the answer|what('?s| is) the answer|can you solve|solve it for me|just give it)\b/i;
const ATTEMPT = /(\d\s*[+\-x*/=]\s*\d|\b(i think it'?s|i got|my answer is|i tried|because|so it'?s|first i|then i)\b)/i;
const STUCK = /\b(stuck|no idea|(?:i'?m|i am) lost|don'?t (get|understand)|do not (get|understand)|makes no sense|confused)\b/i;
const FED_UP = /\b(ugh+|i give up|hate this|so annoying|frustrat\w*|this is stupid|fed up)\b/i;
const CANNOT = /\b((?:i'?m|i am) (so |really |just )?(bad|terrible|hopeless) at|i (?:can'?t|cannot) do (this|math|maths|it)|i'?ll never (get|understand)|(?:i'?m|i am) (just )?not (a )?(math|maths|smart))/i;

function allowed(userId) {
  try {
    const user = db.byId('users', userId);
    // eslint-disable-next-line global-require
    return !!user && require('./boosters').allowed(user);
  } catch { return false; }
}

/** The measures the scorecard's tutor hook takes (services/scorecard/indicators.js LLM_STATS); [] when it is not there. */
function hookStats() {
  try { return require('./scorecard/indicators').LLM_STATS || []; } catch { return []; } // eslint-disable-line global-require
}

/** One row as the scorecard hook's unit: { measure, direction -1|0|1, strength 0-3 }. */
const asUnit = (row) => ({ measure: row.stat, direction: Math.sign(row.direction || 0), strength: Math.max(0, Math.min(3, Math.round((row.strength || 0) * 3))) });

/**
 * The bridge: the scorecard owner's hook (services/scorecard/hooks.js onTutorObservation, on main since 174a3ae) takes
 * the rows whose measure it reads; the others stay stored here (bridged false) for when it reads more.
 */
function bridge(userId, row) {
  try {
    if (!hookStats().includes(row.stat)) return false;
    // eslint-disable-next-line global-require
    const hooks = require('./scorecard/hooks');
    if (typeof hooks.onTutorObservation !== 'function') return false;
    hooks.onTutorObservation(userId, [asUnit(row)]);
    db.update('tutor_observations', row.id, { bridged: true });
    return true;
  } catch { return false; }
}

// Measures each learner message is read for: when none of the signs is in it, the scorecard is told "looked, saw
// nothing" (direction 0), as its hook asks, so a learner who gives no sign reads as typical rather than not at all.
const LOOKED_FOR = { said_frustrated: 'frustration_threshold', said_cannot: 'self_efficacy', attempted_first: 'productive_struggle' };

/** The tutor chat ended (the dock closed): the scorecard reads the new messages now (hooks.onTutorActivity). Never throws. */
function chatEnded(userId) {
  try {
    // eslint-disable-next-line global-require
    const hooks = require('./scorecard/hooks');
    return typeof hooks.onTutorActivity === 'function' ? hooks.onTutorActivity(userId) : null;
  } catch { return null; }
}

/** THE HOOK: one thing the tutor observed. Never throws. */
function onTutorObservation(userId, obs = {}, now = Date.now()) {
  try {
    if (!userId || !obs || !KINDS[obs.kind] || !allowed(userId)) return null;
    const k = KINDS[obs.kind];
    let stat = k.stat;
    let dir = k.dir;
    if (obs.kind === 'explanation_outcome') {
      const map = STYLE_STAT[obs.style];
      if (!map || !['worked', 'failed'].includes(obs.outcome)) return null;
      [stat] = map;
      dir = map[1] * (obs.outcome === 'worked' ? 1 : -1);
    }
    const row = db.insert('tutor_observations', {
      user_id: userId, kind: obs.kind, stat, direction: dir, strength: k.strength,
      skill_id: typeof obs.skill_id === 'string' ? obs.skill_id.slice(0, 80) : null,
      where: String(obs.where || '').slice(0, 60), style: obs.style || null, outcome: obs.outcome || null,
      note: String(obs.note || '').replace(/\s+/g, ' ').slice(0, 120), at: new Date(now).toISOString(), bridged: false,
    });
    const mine = db.find('tutor_observations', (r) => r.user_id === userId);
    if (mine.length > MAX_ROWS) {
      const drop = new Set(mine.slice(0, mine.length - MAX_ROWS).map((r) => r.id));
      db.remove('tutor_observations', (r) => drop.has(r.id));
    }
    bridge(userId, row);
    return row;
  } catch { return null; }
}

/**
 * One learner message, read for the message-level kinds. `ctx.priorReplies` is how many tutor replies this chat had
 * before it (asking for the answer straight away is the signal; after four hints it is not), `ctx.skillId` and
 * `ctx.where` are stored with each row. Returns the kinds recorded.
 */
function fromMessage(userId, text, { skillId = null, where = '', priorReplies = 0, now = Date.now() } = {}) {
  const t = String(text || '');
  if (!t.trim()) return [];
  const kinds = [];
  if (ASKS.test(t) && priorReplies <= 1) kinds.push('asked_for_answer');
  else if (ATTEMPT.test(t) && !STUCK.test(t)) kinds.push('attempted_first');
  if (STUCK.test(t)) kinds.push('said_stuck');
  if (FED_UP.test(t)) kinds.push('said_frustrated');
  if (CANNOT.test(t)) kinds.push('said_cannot');
  const kept = kinds.filter((kind) => onTutorObservation(userId, { kind, skill_id: skillId, where, note: t.slice(0, 120) }, now));
  // "Looked, saw nothing" for the measures this message was read for and showed no sign of (the hook gates the account).
  const zeros = Object.entries(LOOKED_FOR).filter(([kind, stat]) => !kinds.includes(kind) && hookStats().includes(stat)).map(([, stat]) => ({ measure: stat, direction: 0, strength: 0 }));
  if (zeros.length && allowed(userId)) {
    try { require('./scorecard/hooks').onTutorObservation(userId, zeros); } catch { /* the scorecard learning nothing never breaks the chat */ } // eslint-disable-line global-require
  }
  return kept;
}

function pending(userId, { since = null } = {}) {
  return db.find('tutor_observations', (r) => r.user_id === userId && (!since || r.at >= since));
}

/** The proposed scorecard.observe form of stored rows (the owner's starting point; not applied here). */
function proposedObservations(rows) {
  return (rows || []).filter((r) => r && r.stat).map((r) => ({
    stat: r.stat, value: 50 + 20 * Math.sign(r.direction || 0), weight: Number((WEIGHT * (r.strength || 0.5)).toFixed(3)),
    note: `tutor: ${r.kind}${r.style ? ` (${r.style}, ${r.outcome})` : ''}`,
  }));
}

function forgetAll(userId) {
  return db.remove('tutor_observations', (r) => r.user_id === userId);
}

module.exports = { KINDS, STYLE_STAT, MAX_ROWS, WEIGHT, LOOKED_FOR, onTutorObservation, fromMessage, chatEnded, pending, proposedObservations, forgetAll, allowed, asUnit };
