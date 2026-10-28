/**
 * The earlier-grade gap scan, and the catch-up it offers.
 *
 * The subject placement recommends a grade. A learner can belong in grade 6 and
 * still have a hole in grade 4: the walk's belief is about where the frontier
 * is, not about every unit below it. This scan looks for those holes, briefly,
 * and offers them as a catch-up the learner can take or turn down. It is never
 * a forced detour (docs/PRODUCT-DECISIONS.md: the subject placement "lightly
 * recommends earlier grades where the learner missed things").
 *
 * Where it looks:
 *   - every subject-placement question answered wrong whose calibrated point
 *     lies in a grade below the recommended one, mapped to the unit of that
 *     grade at the same fraction of the way through it;
 *   - every unit of the grade just below, as a short scan.
 *
 * How it decides (curriculum-build/GAP-PATHS-SPEC.md, "Evidence model v2"):
 * every candidate unit carries one belief, services/learner-path.js
 * unitBelief, the same model the placement, quick check and test-out use. A
 * unit below the recommended grade starts with the prior for units the learner
 * was placed past, and every answer about it moves it: the subject-placement
 * misses that mapped to it, and each of its own bank questions the scan asks.
 * The model says `known`, `learn`, or not yet; a unit is decided only once at
 * least one of its own bank questions has been answered (a mapped placement
 * question is near the unit, not of it). While a unit is undecided the scan
 * keeps asking it fresh questions, a round at a time: every candidate gets one
 * question, likeliest gaps first, before any gets a second, because a miss
 * decides a unit fastest and finding holes is what the scan is for. When the
 * questions or the clock run out, an undecided unit is `unchecked`: it is
 * never skipped on a guess.
 *
 * The clock: each mode has one budget for the whole placement (Quick 20
 * minutes, Balanced 45, Accurate 90: the subject stage's clock plus the in-grade
 * stage's, services/adaptive-placement.js and services/unit-placement.js MODES).
 * Those two stages' clocks already add up to the whole budget, so the scan gets
 * only what they leave unused: the budget, less the minutes the subject walk
 * actually took, less the in-grade stage (its real time if it has already run,
 * otherwise its whole clock, since it may use all of it). Neither stage's clock
 * is shrunk. A learner who wants more of an earlier grade checked can ask for
 * it: "keep checking <grade>" is the same walk outside the placement budget,
 * with no clock and a question cap (startExtended / answerExtended).
 *
 * The scan state lives on the learner's subject_placements row (`gap_scan`),
 * because the scan only means anything after that walk and belongs to it: a
 * retaken subject placement starts a fresh scan. The gaps are written onto the
 * recommended grade's enrollment as `unit_plan.catch_up` entries (the shape in
 * curriculum-build/GAP-PATHS-SPEC.md) once that enrollment exists. An offer
 * names only the confirmed gaps; accepting it puts them on the earlier grade's
 * path as `learn`, the units the scan proved as `known`, and every other unit
 * as `unchecked`, never `known`.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const rules = require('../config/subject-placement');
const adaptive = require('./adaptive-placement');
const unitPlacement = require('./unit-placement');
const subjectPlacement = require('./subject-placement');
const grading = require('./grading');
const LAYOUT = require('../config/level-layout');

const PLACEMENTS = 'subject_placements';

/**
 * How long one question takes, for deciding whether another fits the clock.
 * The stages' own clocks are sized at about this: Quick asks up to 32 subject
 * questions in 14 minutes and up to 14 unit questions in 6, both about 26
 * seconds a question.
 */
const SECONDS_PER_QUESTION = Number(process.env.GAP_SECONDS_PER_QUESTION || 26);

/**
 * Each mode's scan, inside whatever the clock leaves: at most this many
 * questions and minutes. Quick stays a glance; Accurate can look at a whole
 * grade's units and follow up what is undecided.
 */
const SCAN = {
  quick: { maxQuestions: 8, maxMinutes: 4 },
  balanced: { maxQuestions: 16, maxMinutes: 8 },
  accurate: { maxQuestions: 30, maxMinutes: 15 },
};

/**
 * "Keep checking <grade>": no clock, since the learner asked for it, but a cap,
 * so one sitting stays one sitting (about 26 minutes at the rate above). A
 * grade with more undecided units than this can be kept checking again: no
 * question is ever asked twice, so a second sitting carries on where this one
 * stopped.
 */
const EXTENDED_MAX_QUESTIONS = Number(process.env.GAP_EXTENDED_MAX_QUESTIONS || 60);

/**
 * Minutes a level takes, by what kind of level it is, for "about X minutes" on
 * the offer. NOTHING HERE IS MEASURED: the app records no level timings yet
 * (the few lesson sessions in the data are test runs). Each figure is the
 * nearest estimate the repo already makes, so the offer says "about":
 *   - lesson: the path page's own estimate for a session, 0.8 minutes a
 *     question (public/js/path.js), on the 12 questions a learner with the
 *     default profile gets (services/learner.js sessionParams: 6 + 3 + 3);
 *   - practice: the units' activities are short quizzes and games ("Activity 2
 *     of 9 (quiz/game)"), and the curriculum's own timed versions of those, the
 *     Spanish lab's quick games and unit checks (config/spanish/lab), are 3
 *     minutes each;
 *   - a summary page: the same 3;
 *   - a checkpoint (a written task, a Master or Grand quiz): the Spanish lab's
 *     checkpoint test, 10.
 * A unit in these banks is about 3 lessons, 27 activities, a summary and a
 * written checkpoint (math, English and reading alike), so about two hours.
 */
const LEVEL_MINUTES = {
  lesson: Number(process.env.GAP_LESSON_MINUTES || 10),
  practice: Number(process.env.GAP_PRACTICE_MINUTES || 3),
  summary: 3,
  checkpoint: 10,
};

/** At most this many candidate units are kept on a scan, so the row stays small. */
const MAX_CANDIDATES = 40;

/**
 * The catch-up quiz: the optional step after placement for a learner who
 * starts at the recommended grade and wants everything before it caught up
 * (startCatchUp). Its own clock, outside the placement budget, sized like the
 * mode: Quick about 10 minutes, Balanced 20, Accurate 40. At the 26 seconds a
 * question above that is 23, 46 and 92 questions. "Keep checking <grade>"
 * carries on past it.
 */
const CATCH_UP = {
  quick: { minutes: Number(process.env.GAP_CATCH_UP_QUICK_MINUTES || 10) },
  balanced: { minutes: Number(process.env.GAP_CATCH_UP_BALANCED_MINUTES || 20) },
  accurate: { minutes: Number(process.env.GAP_CATCH_UP_ACCURATE_MINUTES || 40) },
};

/** The catch-up quiz looks across every grade below, so it keeps more candidates than the scan (still bounded, for the row's size). */
const CATCH_UP_MAX_CANDIDATES = 160;

/** A candidate still being asked about. `unchecked` is one a scan ran out on; a later scan may take it up again. */
const UNDECIDED = ['pending', 'open', 'unchecked'];

/**
 * The learner path (services/learner-path.js). Loaded when used, so this file
 * can be required before that one exists.
 */
function learnerPath() {
  // eslint-disable-next-line global-require
  return require('./learner-path');
}

function modeOf(mode) {
  return SCAN[mode] ? mode : 'balanced';
}

/** About how long working one unit takes, in minutes (LEVEL_MINUTES). */
function unitMinutes(trackId, gradeId, unit) {
  const grade = curriculum.getGrade(trackId, gradeId);
  if (!grade) return (unit.end - unit.start + 1) * LEVEL_MINUTES.practice;
  let minutes = 0;
  for (let level = unit.start; level <= unit.end; level++) {
    const kind = curriculum.checkpointKind(grade, level);
    if (kind === 'lesson') {
      const e = LAYOUT.entryFor(grade, level) || {};
      minutes += /summary/i.test(String(e.type || '')) || /^summary:/i.test(String(e.title || '')) ? LEVEL_MINUTES.summary : LEVEL_MINUTES.lesson;
    } else if (kind === 'practice') {
      minutes += LEVEL_MINUTES.practice;
    } else {
      minutes += LEVEL_MINUTES.checkpoint;
    }
  }
  return minutes;
}

// ── the belief ─────────────────────────────────────────────────────────────

/**
 * The shared model's verdict on a unit below the recommended grade, from its
 * evidence ({correct, guess} rows: mapped placement misses, then its own bank
 * answers). `own` is how many of those are the unit's own bank questions: with
 * none, the unit is never decided, whatever the placement misses say.
 */
function beliefOf(evidence, own) {
  const b = learnerPath().unitBelief(evidence.map((e) => ({
    correct: !!e.correct,
    choices: e.guess ? Math.round(1 / e.guess) : undefined,
  })), { prior: 'past' });
  const decision = own > 0 && (b.decision === 'known' || b.decision === 'learn') ? b.decision : null;
  return { p: Math.round(b.p * 10000) / 10000, decision };
}

// ── the clock ──────────────────────────────────────────────────────────────

/** The whole placement's budget for a mode, in minutes: the subject stage's clock plus the in-grade stage's. */
function totalMinutes(mode) {
  const m = modeOf(mode);
  return adaptive.WHOLE_MINUTES[m];
}

/**
 * Minutes the subject walk took. A walk still open counts up to now, but never
 * past its own clock (it stops itself there).
 */
function subjectMinutesUsed(placement, now) {
  if (!placement || !placement.started_at) return 0;
  const from = Date.parse(placement.started_at);
  let to = placement.finished_at ? Date.parse(placement.finished_at) : now;
  if (!placement.finished_at && placement.deadline_at) to = Math.min(to, Date.parse(placement.deadline_at));
  return Math.max(0, (to - from) / 60000);
}

/**
 * The in-grade stage's minutes: what its placement really took if it has run,
 * otherwise its whole clock, held back for it.
 */
function unitStageMinutes(enrollment, mode) {
  const reserve = unitPlacement.MODES[modeOf(mode)].minutes;
  if (!enrollment || !enrollment.placement_session_id) return { minutes: reserve, ran: false };
  const session = db.byId('sessions', enrollment.placement_session_id);
  if (!session || !session.started_at || !session.ended_at) return { minutes: reserve, ran: false };
  return { minutes: Math.max(0, (Date.parse(session.ended_at) - Date.parse(session.started_at)) / 60000), ran: true };
}

/**
 * The scan's own clock. A subject walk without a mode (the full climb) had no
 * budget to keep to, so the scan gets only its own cap.
 */
function budgetFor({ mode, placement, enrollment, now }) {
  const m = modeOf(mode);
  const cap = SCAN[m];
  const timed = !!(placement && adaptive.MODES[placement.mode]);
  const total = totalMinutes(m);
  const subjectUsed = timed ? subjectMinutesUsed(placement, now) : 0;
  const unit = unitStageMinutes(enrollment, m);
  const left = timed ? total - subjectUsed - unit.minutes : cap.maxMinutes;
  const minutes = Math.max(0, Math.min(cap.maxMinutes, left));
  return {
    mode: m,
    total_minutes: timed ? total : null,
    subject_minutes_used: Math.round(subjectUsed * 10) / 10,
    unit_minutes: Math.round(unit.minutes * 10) / 10,
    unit_stage_ran: unit.ran,
    minutes: Math.round(minutes * 100) / 100,
    max_questions: Math.min(cap.maxQuestions, Math.floor((minutes * 60) / SECONDS_PER_QUESTION)),
  };
}

// ── where to look ──────────────────────────────────────────────────────────

/** The unit of a grade at a fraction of the way through it, by level. */
function unitAt(units, fraction) {
  const first = units[0].start;
  const last = units[units.length - 1].end;
  const level = first + Math.max(0, Math.min(0.9999, fraction)) * (last - first + 1);
  const hit = units.findIndex((u) => level < u.end + 1);
  return (hit < 0 ? units.length - 1 : hit) + 1;
}

/**
 * Every answer the subject placement holds, as {pos, guess, correct}, pos in
 * grades from the start of the subject. An adaptive walk keeps exactly that.
 * The full climb keeps only per-grade answer lists, so each is found again in
 * its grade's questions for its calibrated point, or placed by its band.
 */
function placementEvidence(trackId, placement) {
  // The same reading the result's probabilities are worked out from.
  return subjectPlacement.evidenceOf(trackId, placement);
}

/** The placement misses that map to each unit below `gradeIndex`, by "gradeIndex:unit". */
function placementMisses(trackId, gradeIndex, evidence) {
  const gradeIds = rules.gradesFor(trackId);
  const out = new Map();
  for (const a of evidence) {
    const gi = Math.floor(a.pos);
    if (a.correct || gi < 0 || gi >= gradeIndex) continue;
    const units = unitPlacement.unitsFor(trackId, gradeIds[gi]);
    if (!units) continue;
    const key = `${gi}:${unitAt(units, a.pos - gi)}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ correct: false, guess: a.guess || 0.25 });
  }
  return out;
}

/**
 * The bank slots to ask for a unit, best first: questions the calibration puts
 * inside this unit, nearest where a finished unit's question sits, then the
 * rest. Slots the learner has already seen are left out.
 */
function slotsFor(unit, unitNumber, seen, gradeId) {
  const at = unitNumber - 1 + unitPlacement.UNIT_AT;
  return unit.questions
    .map((q, slot) => ({ slot, p: unitPlacement.pointOf(q, unitNumber) }))
    .filter((s) => !seen.has(`${gradeId}:${unitNumber}:${s.slot}`))
    .sort((a, b) => {
      const inA = a.p >= unitNumber - 1.5 && a.p <= unitNumber + 0.5 ? 0 : 1;
      const inB = b.p >= unitNumber - 1.5 && b.p <= unitNumber + 0.5 ? 0 : 1;
      return inA - inB || Math.abs(a.p - at) - Math.abs(b.p - at) || a.slot - b.slot;
    })
    .map((s) => s.slot);
}

/**
 * Every bank question this learner has already been asked in a grade of this
 * subject: earlier scans, quick checks and test-outs (kept on unit plans), and
 * the in-grade placement of that grade. A question asked twice measures memory
 * of the question, not the unit.
 */
function seenQuestions(userId, trackId, row) {
  const seen = new Set(row && Array.isArray(row.gap_seen) ? row.gap_seen : []);
  const enrollments = db.find('enrollments', (e) => e.user_id === userId && e.track_id === trackId);
  for (const e of enrollments) {
    const plan = e.unit_plan && e.unit_plan.units ? e.unit_plan : null;
    const units = plan ? unitPlacement.unitsFor(trackId, e.grade_id) || [] : [];
    units.forEach((u, i) => {
      const asked = plan.units[u.key] && plan.units[u.key].asked;
      for (const a of Array.isArray(asked) ? asked : []) {
        if (Number.isInteger(a.slot)) seen.add(`${e.grade_id}:${i + 1}:${a.slot}`);
      }
    });
    const sessions = db.find('sessions', (s) => s.user_id === userId && s.enrollment_id === e.id && s.kind === 'placement');
    const ids = new Set(sessions.map((s) => s.id));
    if (!ids.size) continue;
    for (const it of db.find('items', (i) => ids.has(i.session_id) && Number.isInteger(i.unit) && Number.isInteger(i.slot))) {
      seen.add(`${e.grade_id}:${it.unit}:${it.slot}`);
    }
  }
  return seen;
}

/** One candidate unit, with the placement misses that mapped to it as its first evidence. */
function candidate(trackId, gradeIndex, unitNumber, misses, seen) {
  const gradeId = rules.gradesFor(trackId)[gradeIndex];
  const unit = unitPlacement.unitsFor(trackId, gradeId)[unitNumber - 1];
  const prior = misses || [];
  return {
    grade_id: gradeId,
    grade_index: gradeIndex,
    unit: unitNumber,
    key: unit.key,
    title: (unit.titles || [])[0] || '',
    levels: unit.end - unit.start + 1,
    minutes: unitMinutes(trackId, gradeId, unit),
    source: prior.length ? 'placement_miss' : 'scan',
    placement: { wrong: prior.length },
    prior,
    answers: [],
    p: beliefOf(prior, 0).p,
    slots: slotsFor(unit, unitNumber, seen, gradeId),
    asked: 0,
    right: 0,
    wrong: 0,
    status: 'pending',
  };
}

/**
 * The scan's order: fewest of its own questions asked first (a round at a time),
 * then likeliest gap, then nearer the frontier. A catch-up quiz candidate is
 * ranked by `rank` (its belief read with what the subject walk saw around it,
 * walkPrior); a scan candidate by its decision belief `p`.
 *
 * GAP_CATCH_UP_ORDER=rank orders catch-up candidates by rank alone (a unit
 * answered right once can be asked again before a far-below unit gets its
 * first). On scripts/gap-path-sim.js --quick (below, deep, mixed, strong) it
 * found more gaps in the grade just below (80% against 73%) and the same share
 * further down, with 3 gap-scan false skips against 1; too close to call on
 * six seeds, so rounds stay the default.
 */
function byPriority(a, b) {
  const pa = Number.isFinite(a.rank) ? a.rank : a.p;
  const pb = Number.isFinite(b.rank) ? b.rank : b.p;
  if (process.env.GAP_CATCH_UP_ORDER === 'rank' && Number.isFinite(a.rank) && Number.isFinite(b.rank)) {
    return pa - pb || a.asked - b.asked || b.grade_index - a.grade_index || b.unit - a.unit;
  }
  return a.asked - b.asked || pa - pb || b.grade_index - a.grade_index || b.unit - a.unit;
}

/**
 * The candidate units below grade `gradeIndex`, likeliest gaps first. `evidence`
 * is the subject placement's answers ({pos, guess, correct}).
 */
function candidatesFor(trackId, gradeIndex, evidence, seen = new Set()) {
  const gradeIds = rules.gradesFor(trackId);
  const misses = placementMisses(trackId, gradeIndex, evidence);
  const keys = new Set(misses.keys());
  // The grade just below gets a look at every unit.
  if (gradeIndex >= 1) {
    const units = unitPlacement.unitsFor(trackId, gradeIds[gradeIndex - 1]);
    if (units) units.forEach((_, i) => keys.add(`${gradeIndex - 1}:${i + 1}`));
  }
  const out = [];
  for (const key of keys) {
    const [gi, unit] = key.split(':').map(Number);
    const c = candidate(trackId, gi, unit, misses.get(key), seen);
    if (c.slots.length) out.push(c); // nothing fresh to ask: it stays unchecked
  }
  out.sort(byPriority);
  return out.slice(0, MAX_CANDIDATES);
}

// ── the walk ───────────────────────────────────────────────────────────────

/**
 * The next candidate to ask about, or null when the walk is done: the
 * undecided unit with a fresh question left that comes first in byPriority,
 * while the cap and the clock (if there is one) leave room for a question.
 */
function nextCandidate(scan, now) {
  if (scan.asked.length >= scan.max_questions) return null;
  if (scan.deadline_at && Date.parse(scan.deadline_at) - now < SECONDS_PER_QUESTION * 1000) return null;
  const live = scan.candidates.filter((c) => UNDECIDED.includes(c.status) && c.slots.length);
  return live.sort(byPriority)[0] || null;
}

/** Why nextCandidate found nothing to ask: the same tests, in the same order. */
function stopReason(scan) {
  if (!scan.candidates.some((c) => UNDECIDED.includes(c.status) && c.slots.length)) return 'every candidate unit decided or out of questions';
  if (scan.asked.length >= scan.max_questions) return 'question cap reached';
  return 'the clock ran out';
}

function questionKeyOf(trackId, gradeId, unit, slot) {
  const units = unitPlacement.unitsFor(trackId, gradeId);
  const q = units && units[unit - 1] && units[unit - 1].questions[slot];
  return q ? adaptive.questionKey(q) : null;
}

/** What the browser sees of the question being asked: never the answer. */
function questionView(trackId, walk) {
  const c = walk.current;
  if (!c) return null;
  const item = unitPlacement.itemFor(trackId, c.grade_id, c.unit, c.slot);
  return {
    grade_id: c.grade_id,
    grade_name: rules.gradeName(trackId, c.grade_id),
    unit: c.unit,
    slot: c.slot,
    index: walk.asked.length,
    format: item.format,
    prompt: item.prompt,
    choices: item.choices,
  };
}

function clockView(walk, now) {
  const budget = walk.budget || {};
  return {
    deadline_at: walk.deadline_at || null,
    minutes: Number.isFinite(budget.minutes) ? budget.minutes : null,
    seconds_left: walk.deadline_at ? Math.max(0, Math.round((Date.parse(walk.deadline_at) - now) / 1000)) : null,
    asked: walk.asked.length,
    max_questions: walk.max_questions,
    total_minutes: budget.total_minutes ?? null,
    subject_minutes_used: budget.subject_minutes_used ?? null,
    unit_minutes: budget.unit_minutes ?? null,
  };
}

/** Set the next question on a walk (the scan, or a keep-checking one), or finish it. */
function advance(trackId, walk, now) {
  const next = nextCandidate(walk, now);
  if (next) {
    const slot = next.slots[0];
    walk.current = { grade_id: next.grade_id, unit: next.unit, slot, qkey: questionKeyOf(trackId, next.grade_id, next.unit, slot) };
    return walk;
  }
  walk.current = null;
  walk.stop_reason = stopReason(walk);
  // Whatever is still undecided is unchecked: worked on the path like a unit
  // to learn, never stepped over, and open to a test-out.
  for (const c of walk.candidates) {
    if (UNDECIDED.includes(c.status)) c.status = 'unchecked';
  }
  walk.finished_at = new Date(now).toISOString();
  return walk;
}

/** Mark one answer on a candidate and re-read its belief. */
function mark(cand, slot, correct, guess, now) {
  cand.slots = cand.slots.filter((s) => s !== slot);
  cand.asked++;
  if (correct) cand.right++; else cand.wrong++;
  cand.answers.push({ slot, correct, guess, at: new Date(now).toISOString() });
  const b = beliefOf([...cand.prior, ...cand.answers], cand.answers.length);
  cand.p = b.p;
  cand.status = b.decision || 'open';
  if (Number.isFinite(cand.rank_prior)) cand.rank = rankOf(cand);
}

/**
 * The gaps, a grade at a time, earliest grade first: what the catch-up offer
 * reads. Only units the model decided are gaps (`learn`) are named; the counts
 * say how much of the grade was proved known and how much is still unchecked.
 */
function gapsOf(trackId, scan) {
  const byGrade = new Map();
  for (const c of scan.candidates) {
    if (!byGrade.has(c.grade_id)) byGrade.set(c.grade_id, { index: c.grade_index, rows: [] });
    byGrade.get(c.grade_id).rows.push(c);
  }
  return [...byGrade.entries()]
    .filter(([, g]) => g.rows.some((c) => c.status === 'learn'))
    .sort((a, b) => a[1].index - b[1].index)
    .map(([gradeId, g]) => {
      const rows = g.rows.filter((c) => c.status === 'learn').sort((a, b) => a.unit - b.unit);
      const units = unitPlacement.unitsFor(trackId, gradeId) || [];
      const known = g.rows.filter((c) => c.status === 'known').length;
      const minutes = rows.reduce((n, c) => n + (Number.isFinite(c.minutes) ? c.minutes
        : units[c.unit - 1] ? unitMinutes(trackId, gradeId, units[c.unit - 1]) : c.levels * LEVEL_MINUTES.practice), 0);
      return {
        grade_id: gradeId,
        grade_name: rules.gradeName(trackId, gradeId),
        unit_keys: rows.map((c) => c.key),
        units: rows.map((c) => c.unit),
        titles: rows.map((c) => c.title),
        levels: rows.reduce((n, c) => n + c.levels, 0),
        minutes: Math.max(5, Math.round(minutes / 5) * 5),
        known_count: known,
        unchecked_count: Math.max(0, units.length - rows.length - known),
      };
    });
}

/** The reply for a walk: the question being asked, or the gaps when it is done. */
function view(trackId, walk, now, scan = walk) {
  const extended = walk !== scan || !!walk.extended_grade_id;
  const base = extended ? { extended: true, grade_id: walk.grade_id } : { kind: scan.kind || 'scan', grade_id: scan.grade_id };
  if (walk.finished_at) {
    return { ...base, done: true, gaps: scan.gaps || [], stop_reason: walk.stop_reason, clock: clockView(walk, now) };
  }
  return { ...base, done: false, question: questionView(trackId, walk), clock: clockView(walk, now) };
}

/**
 * The scan that belongs to the subject walk as it stands. A retaken subject
 * placement makes any earlier scan history: its questions stay asked, but it
 * is not the learner's current scan.
 */
function currentScan(row) {
  const scan = row && row.gap_scan;
  if (!scan) return null;
  return (scan.walk_started_at || null) === (row.started_at || null) ? scan : null;
}

/** The recommended grade's enrollment, if the learner has one. */
function mainEnrollment(userId, trackId, gradeId) {
  return db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === trackId && e.grade_id === gradeId) || null;
}

/**
 * Start the scan, or hand back the one already running for this walk.
 *
 * Errors come back as {error, status}. `now` is for tests.
 */
function start(userId, { trackId, mode, gradeId, subjectId = null, enrollmentId = null }, now = Date.now()) {
  const gradeIds = rules.gradesFor(trackId);
  if (!gradeIds.length) return { error: 'No such subject.', status: 404 };
  const gradeIndex = gradeIds.indexOf(String(gradeId || ''));
  if (gradeIndex < 0) return { error: 'That grade is not part of this subject.', status: 400 };

  const row = subjectId
    ? db.findOne(PLACEMENTS, (p) => p.id === Number(subjectId) && p.user_id === userId && p.track_id === trackId)
    : subjectPlacement.placementFor(userId, trackId);
  if (!row) return { error: 'Take the subject placement first.', status: 404 };
  if (!row.finished_at) return { error: 'Finish the subject placement first.', status: 409 };

  const m = modeOf(mode || row.mode);
  const old = row.gap_scan;
  // The same walk, grade and mode: resume it (or hand back its result). A
  // retaken subject placement, or a different grade, is a new scan.
  if (currentScan(row) && old.grade_id === gradeIds[gradeIndex] && (old.mode === m || old.kind === 'catch_up')) {
    // A catch-up quiz for this grade already covers everything this scan would
    // ask, and more: it is handed back rather than replaced.
    if (old.finished_at) attachForRow(userId, trackId, row);
    return { row, scan: old, resumed: true };
  }

  let enrollment = enrollmentId ? db.byId('enrollments', enrollmentId) : null;
  if (enrollment && (enrollment.user_id !== userId || enrollment.track_id !== trackId)) enrollment = null;
  if (!enrollment) enrollment = mainEnrollment(userId, trackId, gradeIds[gradeIndex]);

  // What an earlier scan asked stays asked.
  const carried = [...(row.gap_seen || []), ...askedKeys(old)];
  const seen = seenQuestions(userId, trackId, { gap_seen: carried });
  const budget = budgetFor({ mode: m, placement: row, enrollment, now });
  const scan = {
    version: 2,
    walk_started_at: row.started_at || null,
    grade_id: gradeIds[gradeIndex],
    grade_index: gradeIndex,
    mode: m,
    started_at: new Date(now).toISOString(),
    deadline_at: new Date(now + budget.minutes * 60000).toISOString(),
    budget,
    max_questions: budget.max_questions,
    candidates: candidatesFor(trackId, gradeIndex, placementEvidence(trackId, row), seen),
    asked: [],
    current: null,
    finished_at: null,
    stop_reason: null,
    gaps: null,
    extended: null,
  };
  advance(trackId, scan, now);
  if (scan.finished_at) scan.gaps = gapsOf(trackId, scan);
  const saved = db.update(PLACEMENTS, row.id, { gap_scan: scan, gap_seen: [...new Set(carried)] });
  if (scan.finished_at) attachForRow(userId, trackId, saved);
  return { row: saved, scan, resumed: false };
}

/** Every question a scan (and its keep-checking walks) asked, as "grade:unit:slot". */
function askedKeys(scan) {
  if (!scan) return [];
  const rows = [...(scan.asked || []), ...((scan.extended && scan.extended.asked) || [])];
  return rows.map((a) => `${a.grade_id}:${a.unit}:${a.slot}`);
}

/**
 * Mark the answer to the question a walk is asking. Shared by the scan and the
 * keep-checking walk. Returns {correct} or {error, status}.
 */
function markAnswer(trackId, walk, scan, given, now) {
  const c = walk.current;
  if (!c || c.grade_id !== String(given.grade_id) || c.unit !== Number(given.unit) || c.slot !== Number(given.slot)) {
    return { error: 'That is not the question being asked.', status: 409, stale: true };
  }
  // The bank can be rewritten under a running walk; a question that is no
  // longer the one that was shown is not marked, and the next one is asked.
  if (questionKeyOf(trackId, c.grade_id, c.unit, c.slot) !== c.qkey) {
    const cand = walk.candidates.find((x) => x.grade_id === c.grade_id && x.unit === c.unit);
    if (cand) cand.slots = cand.slots.filter((s) => s !== c.slot);
    advance(trackId, walk, now);
    return { error: 'That question has changed. Here is the next one.', status: 409 };
  }
  const item = unitPlacement.itemFor(trackId, c.grade_id, c.unit, c.slot);
  const correct = !!grading.grade(item, given.answer).correct;
  const cand = walk.candidates.find((x) => x.grade_id === c.grade_id && x.unit === c.unit);
  mark(cand, c.slot, correct, 1 / Math.max(2, (item.choices || []).length || 4), now);
  walk.asked.push({ grade_id: c.grade_id, unit: c.unit, slot: c.slot, correct, at: new Date(now).toISOString() });
  advance(trackId, walk, now);
  return { correct };
}

/**
 * Mark one answer and move on. `given` is {grade_id, unit, slot, answer}; the
 * question has to be the one being asked.
 */
function answer(userId, trackId, given, now = Date.now()) {
  const row = subjectPlacement.placementFor(userId, trackId);
  const scan = currentScan(row);
  if (!scan) return { error: 'No gap scan is running.', status: 404 };
  if (scan.finished_at) return { row, scan, already: true };
  const marked = markAnswer(trackId, scan, scan, given, now);
  // Not the question being asked: nothing changed, the page redraws.
  if (marked.stale) return { ...marked, row, scan };
  if (scan.finished_at) scan.gaps = gapsOf(trackId, scan);
  const saved = db.update(PLACEMENTS, row.id, {
    gap_scan: scan,
    gap_seen: [...new Set([...(row.gap_seen || []), ...askedKeys(scan)])],
  });
  if (scan.finished_at) attachForRow(userId, trackId, saved);
  return marked.error ? { ...marked, row: saved, scan } : { row: saved, scan };
}

// ── the catch-up quiz ──────────────────────────────────────────────────────
//
// The owner's "start at the recommended grade, and take a catch-up quiz": after
// the subject placement, a learner who starts at the most probable grade can
// have every grade below it checked for what they never learned or have
// forgotten, so that finishing the catch-up means they know everything before
// that grade. It is the scan above, widened: candidates from every grade below
// (not only the one just below), ranked by what the subject walk already saw
// around each unit, with its own clock (CATCH_UP) outside the placement budget.
// It decides units exactly as the scan does — the same shared model, the same
// knobs — and a unit it never gets to stays `unchecked`, never known. A gap scan
// already run for the same grade is carried in: its decisions stand, and its
// questions are never asked again.

/** The catch-up quiz's own clock for a mode: its minutes and the questions that fit in them. */
function catchUpBudget(mode) {
  const m = modeOf(mode);
  const minutes = CATCH_UP[m].minutes;
  return {
    mode: m,
    kind: 'catch_up',
    total_minutes: null,
    subject_minutes_used: null,
    unit_minutes: null,
    unit_stage_ran: null,
    minutes,
    max_questions: Math.floor((minutes * 60) / SECONDS_PER_QUESTION),
  };
}

/** Where a unit sits, in grades from the start of the subject: its grade plus how far through the grade its middle is. */
function unitPosition(units, gradeIndex, unitNumber) {
  const first = units[0].start;
  const last = units[units.length - 1].end;
  const u = units[unitNumber - 1];
  return gradeIndex + ((u.start + u.end) / 2 - first + 0.5) / (last - first + 1);
}

/**
 * What the subject walk says about the units below `gradeIndex`, for ranking
 * the catch-up quiz: the walk's belief about where the learner's frontier is,
 * and every walk answer, right or wrong, filed under the unit its calibrated
 * point falls in ("gradeIndex:unit").
 */
function walkReading(trackId, gradeIndex, evidence) {
  const gradeIds = rules.gradesFor(trackId);
  const post = evidence.length ? adaptive.posterior(gradeIds.length, evidence) : null;
  const mapped = new Map();
  for (const a of evidence) {
    const gi = Math.floor(a.pos);
    if (gi < 0 || gi >= gradeIndex) continue;
    const units = unitPlacement.unitsFor(trackId, gradeIds[gi]);
    if (!units) continue;
    const key = `${gi}:${unitAt(units, a.pos - gi)}`;
    if (!mapped.has(key)) mapped.set(key, []);
    mapped.get(key).push({ correct: !!a.correct, guess: a.guess || 0.25 });
  }
  return { post, mapped };
}

/** A catch-up candidate's rank: its chance of being known, from its walk prior, the walk answers near it and its own answers so far. */
function rankOf(cand) {
  const rows = [...(cand.mapped || []), ...(cand.answers || [])]
    .map((e) => ({ correct: !!e.correct, choices: e.guess ? Math.round(1 / e.guess) : undefined }));
  return Math.round(learnerPath().unitBelief(rows, { prior: cand.rank_prior }).p * 10000) / 10000;
}

/**
 * Rank a catch-up candidate by what the subject walk saw. Its starting chance
 * of being known is lowered by the walk's belief that the learner's frontier
 * lies below the unit (not taught yet) and by walk misses near it, and raised
 * by walk answers near it that were right. Units far below the frontier that
 * the walk saw answered right sort last; units near a miss, first.
 *
 * This only orders the questions. Whether a unit is a gap or known is decided
 * as the scan decides it (beliefOf: the 'past' prior, the walk misses mapped to
 * it, and at least one of its own bank answers), so a unit the walk merely saw
 * answered right is never known without its own questions.
 */
function walkPrior(trackId, cand, reading) {
  const units = unitPlacement.unitsFor(trackId, cand.grade_id);
  const pos = unitPosition(units, cand.grade_index, cand.unit);
  const beyond = reading.post ? adaptive.massWithin(reading.post, 0, pos) : 0;
  const hole = learnerPath().beliefKnobs().HOLE_PRIOR;
  cand.rank_prior = Math.max(0.01, Math.min(0.99, (1 - beyond) * (1 - hole)));
  cand.mapped = reading.mapped.get(`${cand.grade_index}:${cand.unit}`) || [];
  cand.rank = rankOf(cand);
  return cand;
}

/**
 * The catch-up quiz's candidates: every unit of every grade below
 * `gradeIndex` that has a bank, except units the learner's own enrollment in
 * that grade already has as known or done. A unit their own path has to learn
 * is a gap already (decided, nothing asked). A unit a gap scan of this walk
 * decided keeps its decision; one it left open keeps its answers. The open
 * ones are ranked (walkPrior) and the likeliest gaps kept, up to
 * CATCH_UP_MAX_CANDIDATES. A unit with no fresh question left is left out: it
 * stays unchecked.
 */
function catchUpCandidates(userId, trackId, gradeIndex, evidence, seen, carried = []) {
  const gradeIds = rules.gradesFor(trackId);
  const reading = walkReading(trackId, gradeIndex, evidence);
  const misses = placementMisses(trackId, gradeIndex, evidence);
  const decided = [];
  const open = [];
  for (let gi = 0; gi < gradeIndex; gi++) {
    const units = unitPlacement.unitsFor(trackId, gradeIds[gi]);
    if (!units) continue;
    const own = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === trackId && e.grade_id === gradeIds[gi]);
    const ownPlan = own ? learnerPath().planFor(own) : null;
    units.forEach((u, i) => {
      const n = i + 1;
      const settled = ownPlan && ownPlan.units[u.key] ? ownPlan.units[u.key].status : null;
      if (settled === 'known' || settled === 'done') return;
      const had = carried.find((c) => c.grade_id === gradeIds[gi] && c.unit === n);
      let c;
      if (had && (had.status === 'learn' || had.status === 'known')) {
        c = { ...had, prior: had.prior.slice(), answers: had.answers.slice(), slots: had.slots.slice() };
      } else if (had) {
        c = { ...had, prior: had.prior.slice(), answers: had.answers.slice(), status: had.answers.length ? 'open' : 'pending', slots: slotsFor(u, n, seen, gradeIds[gi]) };
      } else if (settled === 'learn') {
        c = { ...candidate(trackId, gi, n, misses.get(`${gi}:${n}`), seen), status: 'learn', source: 'enrollment' };
      } else {
        c = candidate(trackId, gi, n, misses.get(`${gi}:${n}`), seen);
      }
      walkPrior(trackId, c, reading);
      if (c.status === 'learn' || c.status === 'known') decided.push(c);
      else if (c.slots.length || c.answers.length) open.push(c);
    });
  }
  open.sort(byPriority);
  return [...decided, ...open.slice(0, CATCH_UP_MAX_CANDIDATES)].sort(byPriority);
}

/** The learner's finished subject placement and the grade a scan is for, or {error, status}. */
function scanRow(userId, trackId, gradeId, subjectId = null) {
  const gradeIds = rules.gradesFor(trackId);
  if (!gradeIds.length) return { error: 'No such subject.', status: 404 };
  const gradeIndex = gradeIds.indexOf(String(gradeId || ''));
  if (gradeIndex < 0) return { error: 'That grade is not part of this subject.', status: 400 };
  const row = subjectId
    ? db.findOne(PLACEMENTS, (p) => p.id === Number(subjectId) && p.user_id === userId && p.track_id === trackId)
    : subjectPlacement.placementFor(userId, trackId);
  if (!row) return { error: 'Take the subject placement first.', status: 404 };
  if (!row.finished_at) return { error: 'Finish the subject placement first.', status: 409 };
  return { row, gradeIds, gradeIndex };
}

/**
 * Start the catch-up quiz for grade `gradeId` (the recommended grade, as a
 * rule), or hand back the one already running or finished for this walk and
 * grade. Its clock is its own (catchUpBudget), not what the placement left.
 * The scan's routes answer it (`answer`), and keep-checking carries on past it.
 * Errors come back as {error, status}. `now` is for tests.
 */
function startCatchUp(userId, { trackId, mode, gradeId, subjectId = null }, now = Date.now()) {
  const found = scanRow(userId, trackId, gradeId, subjectId);
  if (found.error) return found;
  const { row, gradeIds, gradeIndex } = found;
  const m = modeOf(mode || row.mode);
  const old = currentScan(row);
  if (old && old.kind === 'catch_up' && old.grade_id === gradeIds[gradeIndex]) {
    if (old.finished_at) attachForRow(userId, trackId, row);
    return { row, scan: old, resumed: true };
  }
  if (gradeIndex < 1) return { error: 'There is no grade below this one to catch up on.', status: 400 };

  // A gap scan of this walk for the same grade: its decisions stand and its
  // answers count. Every question any scan asked stays asked.
  const carried = old && old.grade_id === gradeIds[gradeIndex] ? old.candidates || [] : [];
  const seenKeys = [...(row.gap_seen || []), ...askedKeys(old)];
  const seen = seenQuestions(userId, trackId, { gap_seen: seenKeys });
  const budget = catchUpBudget(m);
  const scan = {
    version: 2,
    kind: 'catch_up',
    walk_started_at: row.started_at || null,
    grade_id: gradeIds[gradeIndex],
    grade_index: gradeIndex,
    mode: m,
    started_at: new Date(now).toISOString(),
    deadline_at: new Date(now + budget.minutes * 60000).toISOString(),
    budget,
    max_questions: budget.max_questions,
    candidates: catchUpCandidates(userId, trackId, gradeIndex, placementEvidence(trackId, row), seen, carried),
    asked: [],
    current: null,
    finished_at: null,
    stop_reason: null,
    gaps: null,
    extended: null,
    after_scan: old ? { kind: old.kind || 'scan', grade_id: old.grade_id, asked: (old.asked || []).length, finished_at: old.finished_at || null } : null,
  };
  advance(trackId, scan, now);
  if (scan.finished_at) scan.gaps = gapsOf(trackId, scan);
  const saved = db.update(PLACEMENTS, row.id, {
    gap_scan: scan,
    gap_seen: [...new Set(seenKeys)],
    catch_up_choice: { status: 'taken', grade_id: scan.grade_id, at: new Date(now).toISOString() },
  });
  if (scan.finished_at) attachForRow(userId, trackId, saved);
  return { row: saved, scan, resumed: false };
}

/**
 * "Start at the recommended grade without the catch-up": remembered on the
 * walk, so the quiz is not offered again for it (a retaken subject placement
 * starts afresh). The quiz can still be started by hand later.
 */
function declineCatchUp(userId, trackId, gradeId, now = Date.now()) {
  const row = subjectPlacement.placementFor(userId, trackId);
  if (!row) return { error: 'Take the subject placement first.', status: 404 };
  const gid = String(gradeId || row.recommended_grade_id || '');
  if (!rules.gradesFor(trackId).includes(gid)) return { error: 'That grade is not part of this subject.', status: 400 };
  const saved = db.update(PLACEMENTS, row.id, { catch_up_choice: { status: 'declined', grade_id: gid, at: new Date(now).toISOString() } });
  return { row: saved, quiz: catchUpQuiz(trackId, saved) };
}

/**
 * Where the catch-up quiz stands for this walk, for the result page: whether
 * there is anything below the recommended grade to catch up on, its clock, and
 * `status`: not_started, running, done or declined.
 */
function catchUpQuiz(trackId, row) {
  if (!row || !row.finished_at || !row.recommended_grade_id) return null;
  const gradeIds = rules.gradesFor(trackId);
  const gi = gradeIds.indexOf(row.recommended_grade_id);
  const below = gradeIds.slice(0, Math.max(0, gi)).filter((id) => unitPlacement.available(trackId, id));
  const scan = currentScan(row);
  const quiz = scan && scan.kind === 'catch_up' ? scan : null;
  const choice = row.catch_up_choice || null;
  const budget = catchUpBudget(row.mode);
  let status = 'not_started';
  if (quiz) status = quiz.finished_at ? 'done' : 'running';
  else if (choice && choice.status === 'declined') status = 'declined';
  return {
    available: below.length > 0,
    grade_id: quiz ? quiz.grade_id : row.recommended_grade_id,
    grades_below: below.length,
    mode: budget.mode,
    minutes: budget.minutes,
    max_questions: budget.max_questions,
    status,
    declined_at: status === 'declined' ? choice.at : null,
  };
}

/** Unit numbers for unit keys of a grade, in key order. */
function unitNumbers(trackId, gradeId, keys) {
  const units = unitPlacement.unitsFor(trackId, gradeId) || [];
  return (keys || []).map((k) => units.findIndex((u) => u.key === k) + 1).filter((n) => n > 0);
}

/**
 * The catch-up as one ordered plan, lowest grade first: "Catch up: 3 units of
 * Grade 2, 2 units of Grade 3, then start Grade 4". `entries` are the main
 * enrollment's catch_up entries (or a finished scan's gaps, before there is an
 * enrollment to hold them). Declined grades are left out of the steps and
 * listed apart. `next` is where the learner goes now: the first step not done
 * (its enrollment once accepted), else the main grade.
 */
function routeOf(trackId, mainGradeId, entries, mainEnrollmentId = null) {
  const gradeIds = rules.gradesFor(trackId);
  const rows = (entries || []).filter((e) => e && (e.unit_keys || []).length)
    .slice().sort((a, b) => gradeIds.indexOf(a.grade_id) - gradeIds.indexOf(b.grade_id));
  const steps = rows.filter((e) => e.status !== 'declined').map((e) => {
    const units = Array.isArray(e.units) && e.units.length === e.unit_keys.length ? e.units : unitNumbers(trackId, e.grade_id, e.unit_keys);
    return {
      grade_id: e.grade_id,
      grade_name: e.grade_name || rules.gradeName(trackId, e.grade_id),
      status: e.status || 'offered',
      enrollment_id: e.enrollment_id || null,
      unit_keys: e.unit_keys.slice(),
      units,
      titles: (e.titles || []).slice(),
      unit_count: e.unit_keys.length,
      minutes: Number(e.minutes) || 0,
      unchecked_count: Number(e.unchecked_count) || 0,
    };
  });
  const open = steps.filter((s) => s.status !== 'done');
  const mainName = rules.gradeName(trackId, mainGradeId);
  const plural = (n) => `${n} unit${n === 1 ? '' : 's'}`;
  let headline = `Start ${mainName}`;
  if (open.length) headline = `Catch up: ${open.map((s) => `${plural(s.unit_count)} of ${s.grade_name}`).join(', ')}, then start ${mainName}`;
  else if (steps.length) headline = `Caught up on ${plural(steps.reduce((n, s) => n + s.unit_count, 0))}. Start ${mainName}`;
  let status = 'none';
  if (steps.length) {
    if (!open.length) status = 'done';
    else if (steps.some((s) => s.status === 'accepted' || s.status === 'done')) status = 'accepted';
    else status = 'offered';
  } else if (rows.length) status = 'declined';
  const first = open[0];
  return {
    grade_id: mainGradeId,
    grade_name: mainName,
    status,
    headline,
    steps,
    declined: rows.filter((e) => e.status === 'declined').map((e) => e.grade_id),
    total_units: open.reduce((n, s) => n + s.unit_count, 0),
    total_minutes: open.reduce((n, s) => n + s.minutes, 0),
    next: first
      ? { kind: 'catch_up', grade_id: first.grade_id, enrollment_id: first.enrollment_id, accepted: first.status === 'accepted' }
      : { kind: 'main', grade_id: mainGradeId, enrollment_id: mainEnrollmentId },
  };
}

/**
 * The catch-up route for an enrollment: its own catch_up entries, once the
 * finished scan's offers are on it (attachOffers) and finished catch-ups are
 * marked done (syncCatchUp).
 */
function routeForEnrollment(userId, enrollment) {
  if (!enrollment) return null;
  attachOffers(userId, enrollment);
  const plan = syncCatchUp(db.byId('enrollments', enrollment.id));
  return routeOf(enrollment.track_id, enrollment.grade_id, plan && plan.catch_up, enrollment.id);
}

/**
 * The route for the learner's current scan of a subject: through the
 * enrollment for the scan's grade when they have one, else from the scan's
 * gaps with the decisions they have made. Null without a finished scan.
 */
function routeFor(userId, trackId) {
  const row = subjectPlacement.placementFor(userId, trackId);
  const scan = currentScan(row);
  if (!scan || !scan.finished_at) return null;
  const enrollment = mainEnrollment(userId, trackId, scan.grade_id);
  if (enrollment) return routeForEnrollment(userId, enrollment);
  const decisions = (row && row.gap_decisions) || {};
  const entries = (scan.gaps || []).map((g) => ({
    ...g, status: decisions[g.grade_id] && decisions[g.grade_id].status === 'declined' ? 'declined' : 'offered', enrollment_id: null,
  }));
  return routeOf(trackId, scan.grade_id, entries, null);
}

/**
 * Take or turn down every catch-up still on offer at once, lowest grade first
 * (the "Start the catch-up" / "Skip the catch-up" buttons). Returns
 * {results:[{grade_id, ok, error, catch_up_enrollment_id}], route}.
 */
function decideAll(userId, enrollment, accept, now = Date.now()) {
  attachOffers(userId, enrollment);
  const plan = learnerPath().planFor(db.byId('enrollments', enrollment.id));
  const gradeIds = rules.gradesFor(enrollment.track_id);
  const offered = (plan && Array.isArray(plan.catch_up) ? plan.catch_up : [])
    .filter((e) => e.status === 'offered')
    .sort((a, b) => gradeIds.indexOf(a.grade_id) - gradeIds.indexOf(b.grade_id));
  const results = [];
  for (const e of offered) {
    const out = decide(userId, db.byId('enrollments', enrollment.id), e.grade_id, accept, now);
    results.push({
      grade_id: e.grade_id,
      ok: !out.error,
      error: out.error || null,
      catch_up_enrollment_id: out.catch_up_enrollment ? out.catch_up_enrollment.id : null,
    });
  }
  return { results, route: routeForEnrollment(userId, db.byId('enrollments', enrollment.id)) };
}

// ── keep checking ──────────────────────────────────────────────────────────

/**
 * "Keep checking <grade>": the same walk over every unit of one earlier grade
 * the scan has not decided, outside the placement budget. It needs the scan
 * finished (it is what the offer screen offers), and a grade below the one the
 * scan was for. What it decides goes straight back into the scan, so the offer
 * (and an accepted catch-up's path) is updated as it goes.
 */
function startExtended(userId, { trackId, gradeId }, now = Date.now()) {
  const gradeIds = rules.gradesFor(trackId);
  const row = subjectPlacement.placementFor(userId, trackId);
  const scan = currentScan(row);
  if (!scan) return { error: 'Run the gap scan first.', status: 404 };
  if (!scan.finished_at) return { error: 'Finish the gap scan first.', status: 409 };
  const gi = gradeIds.indexOf(String(gradeId || ''));
  if (gi < 0 || gi >= scan.grade_index) return { error: 'Only a grade below the recommended one can be checked.', status: 400 };
  const units = unitPlacement.unitsFor(trackId, gradeIds[gi]);
  if (!units) return { error: 'That grade has no unit questions to check with.', status: 400 };

  const ext = scan.extended;
  if (ext && ext.grade_id === gradeIds[gi] && !ext.finished_at) return { row, scan, walk: ext, resumed: true };

  const seen = seenQuestions(userId, trackId, { gap_seen: [...(row.gap_seen || []), ...askedKeys(scan)] });
  // A unit the learner's own enrollment in that grade has already settled is not asked about again.
  const own = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === trackId && e.grade_id === gradeIds[gi]);
  const ownPlan = own ? learnerPath().planFor(own) : null;
  const misses = placementMisses(trackId, scan.grade_index, placementEvidence(trackId, row));
  const candidates = [];
  units.forEach((u, i) => {
    const had = scan.candidates.find((c) => c.grade_id === gradeIds[gi] && c.unit === i + 1);
    if (had && (had.status === 'learn' || had.status === 'known')) return;
    const settled = ownPlan && ownPlan.units[u.key] && ['learn', 'known', 'done'].includes(ownPlan.units[u.key].status);
    if (settled) return;
    const c = had
      ? { ...had, prior: had.prior.slice(), answers: had.answers.slice(), status: had.answers.length ? 'open' : 'pending', slots: slotsFor(u, i + 1, seen, gradeIds[gi]) }
      : candidate(trackId, gi, i + 1, misses.get(`${gi}:${i + 1}`), seen);
    if (c.slots.length) candidates.push(c);
  });
  const walk = {
    extended_grade_id: gradeIds[gi],
    grade_id: gradeIds[gi],
    started_at: new Date(now).toISOString(),
    deadline_at: null,
    budget: null,
    max_questions: Math.min(EXTENDED_MAX_QUESTIONS, candidates.reduce((n, c) => n + c.slots.length, 0)),
    candidates: candidates.sort(byPriority),
    asked: [],
    current: null,
    finished_at: null,
    stop_reason: null,
  };
  advance(trackId, walk, now);
  const next = { ...scan, extended: walk };
  mergeInto(trackId, next, walk);
  const saved = db.update(PLACEMENTS, row.id, { gap_scan: next });
  refreshOffers(userId, trackId, saved);
  return { row: saved, scan: next, walk, resumed: false };
}

/** Copy a keep-checking walk's candidates back into the scan and recompute the gaps. */
function mergeInto(trackId, scan, walk) {
  for (const c of walk.candidates) {
    const i = scan.candidates.findIndex((x) => x.grade_id === c.grade_id && x.unit === c.unit);
    const copy = { ...c, prior: c.prior.slice(), answers: c.answers.slice(), slots: c.slots.slice() };
    if (i >= 0) scan.candidates[i] = copy; else scan.candidates.push(copy);
  }
  scan.gaps = gapsOf(trackId, scan);
}

/** One answer on the keep-checking walk. */
function answerExtended(userId, trackId, given, now = Date.now()) {
  const row = subjectPlacement.placementFor(userId, trackId);
  const scan = currentScan(row);
  const walk = scan && scan.extended;
  if (!walk) return { error: 'Nothing is being checked.', status: 404 };
  if (walk.finished_at) return { row, scan, walk, already: true };
  const marked = markAnswer(trackId, walk, scan, given, now);
  if (marked.stale) return { ...marked, row, scan, walk };
  mergeInto(trackId, scan, walk);
  const saved = db.update(PLACEMENTS, row.id, {
    gap_scan: scan,
    gap_seen: [...new Set([...(row.gap_seen || []), ...askedKeys(scan)])],
  });
  refreshOffers(userId, trackId, saved);
  return marked.error ? { ...marked, row: saved, scan, walk } : { row: saved, scan, walk };
}

// ── the offer ──────────────────────────────────────────────────────────────

/** Catch-up entries with their grade's name, for entries written before they carried one. */
function named(trackId, catchUp) {
  return (catchUp || []).map((e) => (e.grade_name ? e : { ...e, grade_name: rules.gradeName(trackId, e.grade_id) }));
}

/**
 * Write the learner's finished gap scan onto this enrollment as catch-up
 * offers, when the scan was for this enrollment's grade. Called wherever the
 * enrollment is read (the scan's own routes, and the path page, which is where
 * a learner who enrolled after the scan first lands). Safe to call again: an
 * entry already decided keeps its decision, a grade the learner turned down is
 * never offered again, from this scan or a later one, and an enrollment with
 * nothing to offer is left without a plan. An accepted catch-up takes up
 * whatever a keep-checking walk has decided since. Entries missing a grade name
 * get one. Returns the enrollment's plan, or null.
 */
function attachOffers(userId, enrollment) {
  const fresh = enrollment && db.byId('enrollments', enrollment.id);
  if (!fresh || fresh.user_id !== userId) return null;
  const row = subjectPlacement.placementFor(userId, fresh.track_id);
  const scan = currentScan(row);
  const mine = scan && scan.finished_at && scan.grade_id === fresh.grade_id;
  const gaps = mine ? scan.gaps || [] : [];
  const had = learnerPath().planFor(fresh);
  if (!had && !gaps.length) return null;
  const plan = had || { version: 1, units: {}, catch_up: [] };
  const before = Array.isArray(plan.catch_up) ? plan.catch_up : [];
  const catchUp = named(fresh.track_id, before.map((e) => ({ ...e })));
  let changed = catchUp.some((e, i) => e.grade_name !== before[i].grade_name);
  const decisions = (row && row.gap_decisions) || {};
  for (const gap of gaps) {
    const entry = catchUp.find((e) => e.grade_id === gap.grade_id);
    const fields = { unit_keys: gap.unit_keys, units: gap.units, titles: gap.titles, minutes: gap.minutes, unchecked_count: gap.unchecked_count };
    if (entry) {
      if (entry.status === 'declined' || entry.status === 'done') continue;
      if (entry.status === 'accepted') {
        // Gaps found since are added; none is ever taken off an accepted path.
        const keys = [...new Set([...entry.unit_keys, ...gap.unit_keys])];
        if (keys.length === entry.unit_keys.length) continue;
        Object.assign(entry, { unit_keys: keys, units: unitNumbers(fresh.track_id, entry.grade_id, keys), titles: [...new Set([...(entry.titles || []), ...gap.titles])] });
        changed = true;
        continue;
      }
      if (JSON.stringify(entry.unit_keys) === JSON.stringify(gap.unit_keys) && entry.minutes === gap.minutes && entry.unchecked_count === gap.unchecked_count) continue;
      Object.assign(entry, fields);
      changed = true;
      continue;
    }
    const decided = decisions[gap.grade_id];
    catchUp.push({
      grade_id: gap.grade_id,
      grade_name: gap.grade_name || rules.gradeName(fresh.track_id, gap.grade_id),
      status: decided && decided.status === 'declined' ? 'declined' : 'offered',
      enrollment_id: null,
      ...fields,
      at: new Date().toISOString(),
    });
    changed = true;
  }
  // One ordered catch-up, lowest grade first (routeOf reads it as "Catch up:
  // 3 units of Grade 2, 2 units of Grade 3, then start Grade 4"). The entries
  // are kept in that order and the order is written down beside them.
  const gradeIds = rules.gradesFor(fresh.track_id);
  catchUp.sort((a, b) => gradeIds.indexOf(a.grade_id) - gradeIds.indexOf(b.grade_id));
  const order = catchUp.filter((e) => e.status !== 'declined').map((e) => e.grade_id);
  if (JSON.stringify(order) !== JSON.stringify(plan.catch_up_order || [])) changed = true;
  if (!changed && catchUp.some((e, i) => before[i] && e.grade_id !== before[i].grade_id)) changed = true;
  let next = plan;
  if (changed) {
    next = { ...plan, catch_up: catchUp, catch_up_order: order };
    db.update('enrollments', fresh.id, { unit_plan: next });
    if (enrollment !== fresh) enrollment.unit_plan = next;
  }
  // An accepted catch-up's own path follows what has been decided since.
  if (mine) {
    for (const entry of catchUp) {
      if (entry.status !== 'accepted' || !entry.enrollment_id) continue;
      const earlier = db.byId('enrollments', entry.enrollment_id);
      if (earlier && earlier.user_id === userId) writeCatchUpPlan(fresh.track_id, entry.grade_id, earlier, scan);
    }
  }
  return next;
}

/** Attach a finished scan's offers to the enrollment for the grade it was run for, if there is one. */
function attachForRow(userId, trackId, row) {
  const scan = currentScan(row);
  if (!scan || !scan.finished_at) return null;
  const enrollment = mainEnrollment(userId, trackId, scan.grade_id);
  return enrollment ? attachOffers(userId, enrollment) : null;
}

function refreshOffers(userId, trackId, row) {
  return attachForRow(userId, trackId, row);
}

/**
 * The earlier grade's enrollment for a catch-up: the learner's own if they
 * have one, otherwise a new one, the way routes/catalog.js makes them. The scan
 * has placed it, so it starts active rather than waiting for a placement.
 */
function catchUpEnrollment(userId, trackId, gradeId, now) {
  const existing = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === trackId && e.grade_id === gradeId);
  if (existing) return { enrollment: existing, created: false };
  const grade = curriculum.getGrade(trackId, gradeId);
  const enrollment = db.insert('enrollments', {
    user_id: userId,
    track_id: trackId,
    grade_id: gradeId,
    target_level: grade.pathLength,
    current_level: 1,
    level_items: 0,
    levels_completed: 0,
    xp: 0,
    status: 'active',
    pending_checkpoint: null,
    placed_at: new Date(now).toISOString(),
    placed_by: 'gap_scan',
  });
  return { enrollment, created: true };
}

/**
 * Is the scan's latest answer on this unit newer than what the path last
 * recorded about it? A gap found after a unit was worked sends it back; the
 * same old gap read again after the learner worked it does not.
 */
function newerThan(cand, entry) {
  const last = (cand.answers || []).reduce((t, a) => Math.max(t, a.at ? Date.parse(a.at) : 0), 0);
  return !entry || !entry.at || last > Date.parse(entry.at);
}

/**
 * Write what the scan knows about a catch-up grade onto its enrollment's plan.
 * A unit the scan decided is a gap is `learn` (even one the path had as done,
 * when the misses came after it was worked). A unit the scan proved is `known`. Every other unit is
 * `unchecked`: no evidence either way, so it is worked unless the learner tests
 * out of it, and never skipped on a subject-level guess. On an enrollment the
 * learner already has, what its own placement or path settled (learn, done,
 * known, unchecked) is kept, except for a new gap. Safe to call again: only
 * what differs is written.
 */
function writeCatchUpPlan(trackId, gradeId, enrollment, scan) {
  const units = unitPlacement.unitsFor(trackId, gradeId) || [];
  const path = learnerPath();
  const before = path.planFor(db.byId('enrollments', enrollment.id));
  const byKey = new Map((scan ? scan.candidates : []).filter((c) => c.grade_id === gradeId).map((c) => [c.key, c]));
  for (const u of units) {
    const cand = byKey.get(u.key);
    const had = before && before.units[u.key] ? before.units[u.key].status : null;
    let want = null;
    if (cand && cand.status === 'learn') want = had === 'learn' || (had === 'done' && !newerThan(cand, before.units[u.key])) ? null : 'learn';
    else if (cand && cand.status === 'known') want = ['learn', 'done', 'known'].includes(had) ? null : 'known';
    else want = ['learn', 'done', 'known', 'unchecked'].includes(had) ? null : 'unchecked';
    if (want) path.setUnit(db.byId('enrollments', enrollment.id), u.key, want, 'gap_scan');
  }
  // The scan's own answers are the unit's evidence (setUnit records only the
  // status), and the questions it asked are kept with the unit so a later
  // quick check or test-out never asks them again.
  const after = db.byId('enrollments', enrollment.id);
  const written = path.planFor(after);
  if (!written) return null;
  const next = { ...written.units };
  let changed = false;
  for (const [key, cand] of byKey) {
    const entry = next[key];
    if (!entry || !cand.answers.length) continue;
    const asked = Array.isArray(entry.asked) ? entry.asked.slice() : [];
    for (const a of cand.answers) {
      if (asked.some((x) => x.slot === a.slot && x.source === 'gap_scan')) continue;
      asked.push({ slot: a.slot, correct: !!a.correct, source: 'gap_scan' });
      changed = true;
    }
    const evidence = entry.source === 'gap_scan' ? { right: cand.right, wrong: cand.wrong } : entry.evidence;
    if (JSON.stringify(evidence) !== JSON.stringify(entry.evidence)) changed = true;
    next[key] = { ...entry, evidence, asked };
  }
  if (changed) db.update('enrollments', after.id, { unit_plan: { ...written, units: next } });
  return path.planFor(db.byId('enrollments', after.id));
}

/**
 * Take or turn down the catch-up for one earlier grade. `enrollment` is the
 * recommended grade's (it carries the offer). Returns {plan, entry,
 * catch_up_enrollment} or {error, status}.
 */
function decide(userId, enrollment, gradeId, accept, now = Date.now()) {
  const trackId = enrollment.track_id;
  const row = subjectPlacement.placementFor(userId, trackId);
  attachOffers(userId, enrollment);
  const fresh = db.byId('enrollments', enrollment.id);
  const plan = learnerPath().planFor(fresh);
  const catchUp = plan && Array.isArray(plan.catch_up) ? plan.catch_up.map((e) => ({ ...e })) : [];
  const entry = catchUp.find((e) => e.grade_id === gradeId);
  if (!entry) return { error: 'No catch-up was offered for that grade.', status: 404 };

  const remember = (status) => {
    if (!row) return;
    db.update(PLACEMENTS, row.id, { gap_decisions: { ...(row.gap_decisions || {}), [gradeId]: { status, at: new Date(now).toISOString() } } });
  };

  if (!accept) {
    if (entry.status === 'accepted' || entry.status === 'done') return { error: 'That catch-up is already under way.', status: 409 };
    entry.status = 'declined';
    entry.decided_at = new Date(now).toISOString();
    db.update('enrollments', fresh.id, { unit_plan: { ...plan, catch_up: catchUp } });
    remember('declined');
    return { plan: learnerPath().planFor(db.byId('enrollments', fresh.id)), entry, catch_up_enrollment: null };
  }

  if (entry.status === 'accepted' || entry.status === 'done') {
    const existing = entry.enrollment_id ? db.byId('enrollments', entry.enrollment_id) : null;
    return { plan, entry, catch_up_enrollment: existing, already: true };
  }

  const gradeIds = rules.gradesFor(trackId);
  if (gradeIds.indexOf(gradeId) < 0 || gradeIds.indexOf(gradeId) >= gradeIds.indexOf(fresh.grade_id)) {
    return { error: 'A catch-up is only for an earlier grade.', status: 400 };
  }
  const grade = curriculum.getGrade(trackId, gradeId);
  const units = unitPlacement.unitsFor(trackId, gradeId);
  if (!grade || !units) return { error: 'That grade has no units to catch up on.', status: 400 };

  const { enrollment: earlier } = catchUpEnrollment(userId, trackId, gradeId, now);
  // The offer's gaps are on the path even if the scan has been retaken since.
  const scan = currentScan(row);
  const fromScan = scan && scan.candidates.some((c) => c.grade_id === gradeId) ? scan : null;
  const known = fromScan ? fromScan.candidates.filter((c) => c.grade_id === gradeId && !entry.unit_keys.includes(c.key)) : [];
  const gapsNow = entry.unit_keys.map((key) => (fromScan && fromScan.candidates.find((c) => c.grade_id === gradeId && c.key === key && c.status === 'learn'))
    || { grade_id: gradeId, key, status: 'learn', answers: [] });
  const using = { candidates: [...known, ...gapsNow] };
  const written = writeCatchUpPlan(trackId, gradeId, earlier, using);

  // The catch-up leads with the confirmed gaps: the learner stands on the
  // first lesson of the earliest one (or where they are, if inside it). The
  // unchecked units come after, open to a test-out.
  const placed = db.byId('enrollments', earlier.id);
  const firstGap = units.find((u) => written.units[u.key] && written.units[u.key].status === 'learn');
  const inside = firstGap && placed.current_level >= firstGap.start && placed.current_level <= firstGap.end;
  const level = firstGap && !inside ? unitPlacement.startLevelOf(trackId, gradeId, firstGap) : placed.current_level;
  const patch = { status: placed.status === 'placement_pending' ? 'active' : placed.status, placed_at: placed.placed_at || new Date(now).toISOString() };
  if (level !== placed.current_level) Object.assign(patch, { current_level: level, level_items: 0 });
  db.update('enrollments', placed.id, patch);

  entry.status = 'accepted';
  entry.enrollment_id = placed.id;
  entry.decided_at = new Date(now).toISOString();
  db.update('enrollments', fresh.id, { unit_plan: { ...plan, catch_up: catchUp } });
  remember('accepted');
  return { plan: learnerPath().planFor(db.byId('enrollments', fresh.id)), entry, catch_up_enrollment: db.byId('enrollments', placed.id) };
}

/**
 * Mark accepted catch-ups done once every gap unit on the earlier grade is
 * worked (or proved). Returns the enrollment's plan.
 */
function syncCatchUp(enrollment) {
  const plan = learnerPath().planFor(enrollment);
  if (!plan || !Array.isArray(plan.catch_up)) return plan;
  let changed = false;
  const catchUp = plan.catch_up.map((entry) => {
    if (entry.status !== 'accepted' || !entry.enrollment_id) return entry;
    const earlier = db.byId('enrollments', entry.enrollment_id);
    const theirs = earlier && learnerPath().planFor(earlier);
    if (!theirs) return entry;
    const finished = entry.unit_keys.every((k) => theirs.units[k] && ['done', 'known'].includes(theirs.units[k].status));
    if (!finished) return entry;
    changed = true;
    return { ...entry, status: 'done', done_at: new Date().toISOString() };
  });
  if (!changed) return plan;
  db.update('enrollments', enrollment.id, { unit_plan: { ...plan, catch_up: catchUp } });
  return { ...plan, catch_up: catchUp };
}

/** Where the learner stands with the scan for a subject, for a page that reloads. */
function stateFor(userId, trackId, now = Date.now()) {
  const row = subjectPlacement.placementFor(userId, trackId);
  // A scan from before the subject placement was retaken is not this walk's.
  const scan = currentScan(row);
  if (!scan) return { scan: null, extended: null, enrollment_id: null, offers: [], catch_up_quiz: catchUpQuiz(trackId, row), route: null };
  const enrollment = mainEnrollment(userId, trackId, scan.grade_id);
  if (enrollment) attachOffers(userId, enrollment);
  const plan = enrollment ? syncCatchUp(db.byId('enrollments', enrollment.id)) : null;
  return {
    scan: { grade_id: scan.grade_id, mode: scan.mode, ...view(trackId, scan, now) },
    extended: scan.extended ? view(trackId, scan.extended, now, scan) : null,
    // The grades a learner can ask to keep checking: every one below the scan's with a unit bank.
    can_keep_checking: rules.gradesFor(trackId).slice(0, scan.grade_index)
      .filter((id) => unitPlacement.available(trackId, id))
      .filter((id) => scan.candidates.some((c) => c.grade_id === id)),
    enrollment_id: enrollment ? enrollment.id : null,
    offers: named(trackId, plan && plan.catch_up),
    // The catch-up quiz on the result page, and the catch-up as one ordered plan.
    catch_up_quiz: catchUpQuiz(trackId, row),
    route: scan.finished_at ? routeFor(userId, trackId) : null,
  };
}

module.exports = {
  SCAN,
  CATCH_UP,
  catchUpBudget,
  catchUpCandidates,
  startCatchUp,
  declineCatchUp,
  catchUpQuiz,
  routeOf,
  routeFor,
  routeForEnrollment,
  decideAll,
  SECONDS_PER_QUESTION,
  EXTENDED_MAX_QUESTIONS,
  LEVEL_MINUTES,
  unitMinutes,
  totalMinutes,
  budgetFor,
  unitAt,
  placementEvidence,
  beliefOf,
  candidatesFor,
  nextCandidate,
  start,
  answer,
  startExtended,
  answerExtended,
  view,
  attachOffers,
  currentScan,
  decide,
  syncCatchUp,
  stateFor,
};
