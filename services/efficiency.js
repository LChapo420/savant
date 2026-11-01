/**
 * Speed and retention levers: how the app spends a learner's practice minutes so that more of what they practise
 * is still recalled a month later, per hour spent. All six are off by default. SR_STOP=on (its extra due reviews) carries the simulated gain
 * (docs/SPEED-RETENTION.md) and, since round 11 (section 7: the skip half off by default, two scorecard rules reading reviews as reviews), costs the
 * 200-learner accuracy gate nothing; it stays off only because the 30-learner quick gate check of npm test, cut from the old answer stream, trips on
 * ANY change of that stream (section 7.3), and the owner has said the baseline is not to be re-cut. The other five are built, tested and switchable, and off. One module, six levers, each with its own off switch, read by the
 * scheduler (services/mastery.js), the level planner (services/sessions.js) and the recovery simulation
 * (scripts/scorecard-recovery-sim.js) so the simulation exercises the code the app runs.
 *
 *   SR_PERSONAL_TIMING=off   review target set per learner (their own forgetting multiplier, how many spaced recalls the
 *                            skill has had), not one 0.85 for everyone
 *   SR_RELEARN=off           successive relearning: a skill leaves the active review set after SR_RELEARN_CRITERION
 *                            consecutive spaced correct recalls (it is still checked at a maintenance recall level)
 *   SR_INTERLEAVE=off        practice items on skills past first mastery are woven into the level, lowest recall first
 *   SR_STOP=off              up to SR_STOP_EXTRA_REVIEWS (6) more due reviews a level, on top of practice; with SR_STOP_SKIP=on
 *                            (OFF by default: it cost the scorecard its answers and bought no retention) items that buy least are not asked:
 *                            a skill already answered right twice in this sitting and known by the mastery record is not asked again
 *   SR_PRETEST=off           a short pretest before a lesson page; a learner who clearly knows the skill skips the page
 *                            and gets gap-only practice on it
 *   SR_DIFFICULTY=off        item difficulty shifted for the learner's pace (harder for faster, easier for slower)
 *   SR_ALL=off               every lever off (the old behaviour)
 *
 * Research basis (and what it does NOT show) is in docs/SPEED-RETENTION.md. The constants below are published-range
 * choices, not fitted to the simulation's truth, except the stop rule's two numbers and its six extra review slots, which
 * were chosen on 60-learner simulation runs (docs/SPEED-RETENTION.md, "Tuning, honestly"). All gains are simulated.
 */
// (config/db is required on first use, so the scorecard can ask enabled() without opening the database.)
let dbModule = null;
const db = new Proxy({}, { get: (_, k) => { dbModule = dbModule || require('../config/db'); return dbModule[k]; } }); // eslint-disable-line global-require

const SWITCH = {
  personal: 'SR_PERSONAL_TIMING',
  relearn: 'SR_RELEARN',
  interleave: 'SR_INTERLEAVE',
  stop: 'SR_STOP',
  pretest: 'SR_PRETEST',
  difficulty: 'SR_DIFFICULTY',
};
// Default for a lever when its env switch is unset. Set from the measured results (docs/SPEED-RETENTION.md).
const DEFAULT = { personal: 'off', relearn: 'off', interleave: 'off', stop: 'off', pretest: 'off', difficulty: 'off' };

/** Is this lever on? SR_ALL=off beats everything; SR_ALL=on forces all on; else the lever's own switch, else its default. */
function enabled(lever) {
  const all = String(process.env.SR_ALL || '').toLowerCase();
  if (all === 'off') return false;
  if (all === 'on') return String(process.env[SWITCH[lever]] || 'on').toLowerCase() !== 'off';
  return String(process.env[SWITCH[lever]] || DEFAULT[lever]).toLowerCase() !== 'off';
}

/**
 * Should a scorecard reading that exists for the stop rule's sake (docs/SPEED-RETENTION.md section 7) be on? Its own switch, when set to 'on' or
 * 'off', decides; otherwise it follows the stop rule: with SR_STOP off the scorecard reads exactly as it did before round 11.
 */
function followsStop(envValue) {
  const v = String(envValue || '').toLowerCase();
  if (v === 'on' || v === 'off') return v === 'on';
  return enabled('stop');
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── 1. review timing for this learner ───────────────────────────────────────
// The flat target (mastery.REVIEW_TARGET, 0.85) assumes every learner forgets at the typical rate and every skill is
// equally fragile. Two published regularities move it:
//   - a learner who forgets faster loses more between reviews and pays more to relearn after a lapse, so reviews should
//     come a little earlier for them; a slow forgetter can wait longer (optimal spacing scales with the retention
//     interval and the learner's decay: Cepeda et al. 2008, Pavlik & Anderson 2008; FSRS lets desired retention differ by learner);
//   - each successful spaced recall makes the next one cheaper to wait for (expanding intervals work because the memory
//     is stronger: Landauer & Bjork 1978; Karpicke & Roediger 2007), so the target drops a little with every one.
// m is the learner's half-life multiplier in doublings from the app's forgetting model (scorecard.forgettingCurve).
const PERSONAL = {
  slope: Number(process.env.SR_PERSONAL_SLOPE || 0.06), // target change across m = -1.5 .. +1.5 doublings
  expand: Number(process.env.SR_EXPAND_STEP || 0.02),   // target change per consecutive spaced recall
  expandMax: 3,
  lo: 0.7,
  hi: 0.92,
};
function reviewTarget(base, { m = 0, spacedStreak = 0 } = {}) {
  if (!enabled('personal')) return base;
  const mm = clamp(Number(m) || 0, -1.5, 1.5);
  return clamp(base - PERSONAL.slope * (mm / 1.5) - PERSONAL.expand * Math.min(PERSONAL.expandMax, Math.max(0, spacedStreak)), PERSONAL.lo, PERSONAL.hi);
}

// ── 2. successive relearning ────────────────────────────────────────────────
// Rawson & Dunlosky (2011, 2013): recall each item correctly in several spaced sessions, and only then stop; items reviewed
// to a criterion of 3 to 4 correct recalls on separate days are retained far better a month later than items dropped after one.
// The converse is the saving: a skill that has met the criterion stops taking review slots every time its predicted recall
// crosses the flat target; it is checked again only when predicted recall has fallen to the maintenance level.
const RELEARN = {
  criterion: Number(process.env.SR_RELEARN_CRITERION || 3),
  maintenance: Number(process.env.SR_RELEARN_MAINTENANCE || 0.6),
};
function relearnDone(state) {
  return enabled('relearn') && (Number(state && state.spaced_streak) || 0) >= RELEARN.criterion;
}
/** The recall below which a skill is due: its personal target, or the maintenance level once the criterion is met. */
function dueBelow(base, state, m) {
  if (relearnDone(state)) return Math.min(base, RELEARN.maintenance);
  return reviewTarget(base, { m, spacedStreak: Number(state && state.spaced_streak) || 0 });
}

// ── 3. stopping when the next item buys least ───────────────────────────────
// Repeating a retrieval inside one sitting adds little to a month-later memory (massed practice: Donovan & Radosevich 1999,
// spacing d about 0.4-0.5; Cepeda et al. 2006), and a skill the learner demonstrably has (mastery record at SR_STOP_MASTERY or
// above) gains nothing in understanding either. Such items are not asked; the minutes go to due reviews (spaced retrieval).
// The skip half is OFF unless SR_STOP_SKIP=on (round 11, docs/SPEED-RETENTION.md section 7): skipping fresh items took the answers several scorecard
// measures are read from (help_seeking, fatigue_curve, repetition_tolerance...) and carried none of the gain (skip alone: 1.02 skills per hour against 1.19 live;
// extra reviews without it: 1.77, the same as with it).
const STOP = {
  sittingCap: Number(process.env.SR_STOP_CAP || 2),      // right answers on the skill already given this sitting
  masteryFloor: Number(process.env.SR_STOP_MASTERY || 0.7),
  minItems: 5,                                            // a level always asks at least this many
  extraReviews: Number(process.env.SR_STOP_EXTRA_REVIEWS || 6),
};
/** Is the skip half of the stop rule on? (SR_STOP on and SR_STOP_SKIP=on.) */
function skipOn() { return enabled('stop') && String(process.env.SR_STOP_SKIP || 'off').toLowerCase() === 'on'; }
/** Should another focus/support item on this skill be asked? */
function worthAsking({ role, correctInSitting = 0, mastery = 0, asked = 0 }) {
  if (!skipOn()) return true;
  if (role !== 'focus' && role !== 'support') return true; // reviews, mixed items and the stretch item are the point
  if (asked < STOP.minItems) return true;
  return !(correctInSitting >= STOP.sittingCap && mastery >= STOP.masteryFloor);
}
/**
 * How many of a level's reviews take the place of focus items: the usual limit's worth. The extra reviews the stop rule adds are
 * on top, so a skill being learned keeps its practice (the measured cost of letting them displace it: fewer skills fully learned).
 */
function displacedReviews(n, base = 3) {
  return enabled('stop') && process.env.SR_STOP_DISPLACE !== 'on' ? Math.min(n, base) : n;
}
/** How many due reviews a level takes: the usual limit, plus the minutes the stop rule frees when more are waiting. */
function reviewSlots(base, dueCount) {
  if (!enabled('stop')) return base;
  return Math.min(Math.max(base, Math.min(dueCount, base + STOP.extraReviews)), base + STOP.extraReviews);
}

// ── 4. interleaving, once each skill is past first mastery ──────────────────
// Interleaved practice beats blocked practice on delayed tests (Brunmair & Richter 2019, g about 0.4; Rohrer et al. 2015, 2020
// for mathematics), but novices learn a new idea better blocked (Kalyuga et al. 2003, the expertise-reversal effect; Rohrer &
// Taylor's interleaving followed blocked first exposure). So only skills past first mastery (mastery record at FIRST_MASTERY and
// a few answers) enter the pool, and the pool is ordered by predicted recall, lowest first, which also makes each such item a
// spaced retrieval rather than a repeat.
const INTERLEAVE = { firstMastery: 0.6, minAttempts: 3, recallBelow: 0.9 };
/** Skills eligible to be woven into this level, lowest predicted recall first. rows: mastery.recallByskill(). */
function interleavePool({ rows, focus, exclude = [] }) {
  if (!enabled('interleave')) return [];
  const skip = new Set([focus, ...exclude]);
  return rows
    .filter((x) => !skip.has(x.skill_id) && x.state.mastery >= INTERLEAVE.firstMastery && x.state.attempts >= INTERLEAVE.minAttempts)
    .filter((x) => x.recall < INTERLEAVE.recallBelow)
    .sort((a, b) => a.recall - b.recall)
    .map((x) => x.skill_id);
}
/** One focus item in `n` is replaced by a pooled skill: every third from the second practice level after a lesson, every second from the third. */
function interleaveEvery(since) {
  if (!enabled('interleave') || !(since >= 2)) return 0;
  return since >= 3 ? 2 : 3;
}

// ── 5. pretest, then skip what is known ─────────────────────────────────────
// Testing before teaching improves what is learned from the lesson (Richland, Kornell & Kao 2009; pretesting effect, small)
// and shows what the learner already has; instruction a learner does not need is worse than none (expertise reversal: Kalyuga
// 2003; Tetzlaff et al. 2025). Placement-style evidence (Bayes on a few items, the guessing floor counted) decides: with prior
// probability `prior` that the learner already knows the skill, and each pretest answer right with probability SLIP_KNOW if
// they know it and `guess` if they do not.
const PRETEST = {
  items: Number(process.env.SR_PRETEST_ITEMS || 3),
  skipAt: Number(process.env.SR_PRETEST_SKIP_AT || 0.93), // posterior that the skill is known, needed to skip the page
  know: 0.88,        // chance of a right answer when the skill is known (a slip is 12%)
  gapOnlyFocus: 2,   // focus items left on a skill whose page was skipped
  giveUpAfter: 4,    // pretests failed in a row before the app stops offering them to this learner
  prior: 0.3,
};
/** Posterior that the skill is known after the pretest answers: [{ correct, guess }]. Any miss means not known. */
function pretestPosterior(results, prior = PRETEST.prior) {
  let odds = prior / (1 - prior);
  for (const r of results) {
    const g = clamp(Number(r.guess) || 0.25, 0.01, 0.6);
    odds *= r.correct ? PRETEST.know / g : (1 - PRETEST.know) / (1 - g);
  }
  return odds / (1 + odds);
}
function pretestSkips(results, prior = PRETEST.prior) {
  if (!enabled('pretest') || results.length < PRETEST.items || !results.every((r) => r.correct)) return false;
  return pretestPosterior(results, prior) >= PRETEST.skipAt;
}
// A pretest's outcome is kept on the skill's own record (skill_states.pretest_passed, pretest_at), so it is deleted with the account and
// needs no new collection.
/** Is a pretest worth offering this learner now? Not after giveUpAfter failures in a row. */
function pretestOffered(userId) {
  if (!enabled('pretest')) return false;
  const rows = db.find('skill_states', (r) => r.user_id === userId && r.pretest_at)
    .sort((a, b) => Date.parse(a.pretest_at) - Date.parse(b.pretest_at)).slice(-PRETEST.giveUpAfter);
  return !(rows.length >= PRETEST.giveUpAfter && rows.every((r) => !r.pretest_passed));
}
function recordPretest(userId, skillId, passed) {
  return db.upsert('skill_states', (s) => s.user_id === userId && s.skill_id === skillId, (existing) => ({
    ...(existing || {
      user_id: userId, skill_id: skillId, mastery: 0, attempts: 0, correct: 0, streak: 0, ease: 2.5, error_tags: [], last_seen_at: null, next_due_at: null,
    }),
    pretest_passed: !!passed,
    pretest_at: new Date().toISOString(),
  }));
}
/** Did this learner skip this skill's page on a passed pretest? (Gap-only practice follows.) */
function pretestPassed(userId, skillId) {
  return enabled('pretest') && !!db.findOne('skill_states', (s) => s.user_id === userId && s.skill_id === skillId && s.pretest_passed);
}
/** Focus items for a level whose skill's page was skipped; `normal` otherwise. */
function focusCount(normal, skipped) {
  return skipped ? Math.min(normal, PRETEST.gapOnlyFocus) : normal;
}

// ── 6. harder for faster learners, easier for slower ────────────────────────
// Bjork's desirable difficulties and the success-rate sweet spot (Wilson et al. 2019 "85% rule", for fast-converging learning;
// Pyc & Rawson 2009 retrieval effort) say difficulty should follow the learner; the expertise-reversal literature says
// the same of support. zPace is the learner's measured pace as a standing in [-1, 1] (scorecard mastery_velocity, measured
// not shown); the shift is in difficulty bands (the bank's 1 to 10 scale), at most +/- SR_DIFFICULTY_BANDS.
const DIFFICULTY = { bands: Number(process.env.SR_DIFFICULTY_BANDS || 1) };
function difficultyShift(zPace, confidence = 1) {
  if (!enabled('difficulty')) return 0;
  return clamp(DIFFICULTY.bands * (Number(zPace) || 0) * clamp(confidence, 0, 1), -DIFFICULTY.bands, DIFFICULTY.bands);
}

module.exports = {
  SWITCH, DEFAULT, enabled,
  PERSONAL, RELEARN, STOP, INTERLEAVE, PRETEST, DIFFICULTY,
  reviewTarget, relearnDone, dueBelow,
  worthAsking, skipOn, followsStop, reviewSlots, displacedReviews,
  interleavePool, interleaveEvery,
  pretestPosterior, pretestSkips, pretestOffered, recordPretest, pretestPassed, focusCount,
  difficultyShift,
};
