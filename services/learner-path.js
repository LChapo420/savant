/**
 * The gap-only path: which units of a grade a learner still has to work, and
 * where the path goes next (curriculum-build/GAP-PATHS-SPEC.md).
 *
 * A unit is the stretch of levels between two checkpoints, as the unit banks
 * define it (services/unit-placement.js). Each enrollment on a grade with a bank
 * can carry a `unit_plan` that says, per unit, whether the learner has proved
 * it (`known`), must work it (`learn`), has worked it on the path (`done`),
 * was placed past it without the evidence settling it (`unchecked`: worked
 * like `learn` until a check or test-out proves it), or has shown nothing
 * either way yet (`unseen`). The path steps over what is known or done, and
 * walks everything else. Every skip decision comes from one model, unitBelief.
 *
 * The one rule that shapes everything here: nothing is marked known without
 * evidence from that unit's own bank questions. A false skip — a gap the path
 * walks past — is the worst mistake this file can make, and one extra question
 * is cheap, so every doubtful case falls on the side of working the unit.
 *
 * An enrollment without a plan, or on a grade without a bank, is untouched:
 * every function answers what the linear path always did.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const unitPlacement = require('./unit-placement');

const VERSION = 2;
const STATUSES = ['known', 'learn', 'done', 'unseen', 'unchecked'];
const SOURCES = ['placement', 'quick_check', 'test_out', 'gap_scan', 'path', 'manual'];


// ── The evidence model (spec: "Evidence model v2") ─────────────────────────
/**
 * The model's knobs, read from the environment on every call so a simulation
 * can tune them without a restart:
 *   HOLE_PRIOR    chance a unit the learner was placed past is a hole anyway
 *   ISLAND_PRIOR  chance a unit at or after the placed one is already known
 *   SLIP          chance someone who knows the unit still misses its question
 *   LUCK          chance, on top of a blind guess, that someone who does not
 *                 know it answers right anyway (close options, partial skill)
 *   KNOWN_AT      belief at or above which the unit is known
 *   LEARN_AT      belief at or below which it is to learn
 */
function beliefKnobs() {
  const num = (name, fallback) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && process.env[name] !== '' && process.env[name] !== undefined ? v : fallback;
  };
  return {
    HOLE_PRIOR: num('HOLE_PRIOR', 0.15),
    ISLAND_PRIOR: num('ISLAND_PRIOR', 0.65),
    SLIP: num('SLIP', 0.15),
    LUCK: num('LUCK', 0.15),
    KNOWN_AT: num('KNOWN_AT', 0.965),
    LEARN_AT: num('LEARN_AT', 0.6),
  };
}

/** Answers from any of the shapes evidence comes in: a list, a unit entry's `asked`, or {right, wrong} counts. */
function answersOf(evidence) {
  if (Array.isArray(evidence)) return evidence;
  if (evidence && Array.isArray(evidence.asked)) return evidence.asked;
  if (evidence && (Number(evidence.right) || Number(evidence.wrong))) {
    return [
      ...Array.from({ length: Number(evidence.right) || 0 }, () => ({ correct: true })),
      ...Array.from({ length: Number(evidence.wrong) || 0 }, () => ({ correct: false })),
    ];
  }
  return [];
}

/**
 * What the answers in one unit say about whether the learner knows it.
 *
 * One model for every skip decision — placement, quick check, test-out and gap
 * scan — so a unit is never known on one rule and a gap on another. It starts
 * from a prior and folds in each answer to the unit's own bank questions by
 * Bayes: someone who knows the unit answers right 1 - SLIP of the time, someone
 * who does not answers right by a guess (1 / choices) plus LUCK. Every answer
 * counts, from every source, and a miss counts against the unit: no single
 * right answer makes a unit known unless the numbers say so.
 *
 * @param {Array|object} evidence [{correct, choices?}], a unit entry with `asked`, or {right, wrong}
 * @param {object} [opts]
 * @param {'past'|'island'|number} [opts.prior] 'past' (default) for a unit the
 *   learner was placed past or in a grade below the recommended one, 'island'
 *   for one at or after the placed unit, or a number
 * @param {number} [opts.choices] options per question when an answer does not say (4)
 * @returns {{p: number, decision: 'known'|'learn'|'undecided', right: number, wrong: number, answered: number, prior: number}}
 */
function unitBelief(evidence, opts = {}) {
  const k = beliefKnobs();
  const prior = Number.isFinite(opts.prior) ? opts.prior : opts.prior === 'island' ? k.ISLAND_PRIOR : 1 - k.HOLE_PRIOR;
  let p = Math.max(1e-6, Math.min(1 - 1e-6, prior));
  let right = 0;
  let wrong = 0;
  for (const a of answersOf(evidence)) {
    if (!a) continue;
    const choices = Math.max(2, Number(a.choices) || Number(opts.choices) || 4);
    const rightIfKnown = 1 - k.SLIP;
    const rightIfNot = Math.min(0.99, 1 / choices + k.LUCK);
    const known = a.correct ? rightIfKnown : 1 - rightIfKnown;
    const not = a.correct ? rightIfNot : 1 - rightIfNot;
    p = (p * known) / (p * known + (1 - p) * not);
    if (a.correct) right++; else wrong++;
  }
  const decision = p >= k.KNOWN_AT ? 'known' : p <= k.LEARN_AT ? 'learn' : 'undecided';
  return { p, decision, right, wrong, answered: right + wrong, prior };
}

// ── Reading the plan ───────────────────────────────────────────────────────

/** The enrollment's unit plan, or null when it has none. */
function planFor(enrollment) {
  const plan = enrollment && enrollment.unit_plan;
  return plan && typeof plan === 'object' && plan.units && typeof plan.units === 'object' ? plan : null;
}

/** The grade's units from the bank, or null when the grade has none. */
function unitsOf(enrollment) {
  if (!enrollment) return null;
  return unitPlacement.unitsFor(enrollment.track_id, enrollment.grade_id);
}

function gradeOf(enrollment) {
  return curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
}

/** A unit nobody has recorded anything about is unseen: no evidence, so it is worked. */
function statusOf(plan, unit) {
  const entry = plan && unit && plan.units[unit.key];
  return entry && STATUSES.includes(entry.status) ? entry.status : 'unseen';
}

/** The index of the unit a level sits in, or -1 for a level outside every unit. */
function unitIndexAt(units, level) {
  return units.findIndex((u) => level >= u.start && level <= u.end);
}

function blankEntry() {
  return { status: 'unseen', source: 'manual', evidence: { right: 0, wrong: 0 }, at: null, asked: [], test_out: null };
}

/** An entry with every field present, so older or hand-written rows read the same. */
function entryOf(plan, key) {
  const e = plan.units[key] || {};
  const blank = blankEntry();
  return {
    ...blank,
    ...e,
    evidence: { right: Number((e.evidence || {}).right) || 0, wrong: Number((e.evidence || {}).wrong) || 0 },
    asked: Array.isArray(e.asked) ? e.asked.slice() : [],
  };
}

function clone(plan) {
  return JSON.parse(JSON.stringify(plan));
}

function blankPlan() {
  return { version: VERSION, units: {}, catch_up: [] };
}

// ── Writing the plan ───────────────────────────────────────────────────────

/**
 * The enrollment as it is stored now. Writers read it fresh, so a caller that
 * holds an old copy and calls setUnit in a loop does not have each call undo the
 * one before it.
 */
function live(enrollment) {
  return (enrollment && enrollment.id != null && db.byId('enrollments', enrollment.id)) || enrollment;
}

/** Store the plan, and keep the caller's copy in step with what was stored. */
function save(enrollment, plan) {
  if (enrollment && enrollment.id != null) db.update('enrollments', enrollment.id, { unit_plan: plan });
  if (enrollment) enrollment.unit_plan = plan;
  return plan;
}

// ── Evidence ───────────────────────────────────────────────────────────────

/** The bank slots of a unit nobody has asked this learner yet, in bank order. */
function unaskedSlots(unit, entry) {
  const used = new Set(entry.asked.map((a) => a.slot).filter((s) => Number.isInteger(s)));
  return unit.questions.map((_, s) => s).filter((s) => !used.has(s));
}

/**
 * Where a unit's belief starts. A unit the learner was placed past — before the
 * placed unit, or any unit of a plan with no placed unit (a catch-up grade below
 * the recommended one) — is probably known: 'past'. One after the placed unit
 * is probably not: 'island'.
 */
function priorFor(plan, n) {
  return plan.placed_unit && n > plan.placed_unit ? 'island' : 'past';
}

/** The unit's answers so far, each with how many options its question had. */
function answersIn(unit, entry) {
  return entry.asked.map((a) => ({
    correct: !!a.correct,
    choices: ((unit.questions[a.slot] || {}).choices || []).length || undefined,
  }));
}

function beliefIn(plan, unit, n, entry, extra = []) {
  return unitBelief([...answersIn(unit, entry), ...extra], { prior: priorFor(plan, n) });
}

/**
 * Could this unit still be proved known, if every fresh question left were
 * answered right? A test-out that cannot end in a skip is not worth offering.
 */
function canProve(plan, unit, n, entry) {
  const left = unaskedSlots(unit, entry);
  if (!left.length) return false;
  const rights = left.map((s) => ({ correct: true, choices: unit.questions[s].choices.length }));
  return beliefIn(plan, unit, n, entry, rights).decision === 'known';
}

/** The status a unit's belief settles on, for a unit that is being checked. */
function settled(decision, fallback) {
  return decision === 'known' ? 'known' : decision === 'learn' ? 'learn' : fallback;
}

/**
 * Write the plan a finished in-grade placement supports — the first one, or a
 * retake (routes/placement.js `/start` with `retake: true`), which rebuilds the
 * plan from its new answers but keeps what the learner has already earned:
 * units worked on the path stay `done`, and units proved known by a test-out,
 * quick check, gap scan or by hand stay known unless the new answers in them
 * now show a hole. Answers from the earlier placement are replaced by the new
 * ones; every other answer (checks, test-outs, scans) is kept as evidence.
 *
 * - Before the placed unit: what its answers say (unitBelief, starting from the
 *   'past' prior). Known only when they prove it; learn when they show a hole;
 *   otherwise `unchecked` — worked like a unit to learn until a quick check or
 *   a test-out settles it. Skipping a unit the placement passed is not proof.
 * - The placed unit: learn, always.
 * - After it: unseen. Its answers are kept as evidence for a test-out, which is
 *   the only way it becomes known.
 *
 * Questions an earlier gap scan, check or test-out asked are kept with the unit
 * and count as evidence, so no later check repeats them. Catch-up offers already
 * on the enrollment are kept. Returns the plan, or null for a grade without a bank.
 */
function initFromPlacement(enrollment, scoreResult, answered) {
  const units = unitsOf(enrollment);
  if (!units || !scoreResult || !Number.isFinite(scoreResult.unit)) return null;
  const row = live(enrollment);
  const before = planFor(row);
  const placed = scoreResult.unit;
  const now = new Date().toISOString();
  const plan = { version: VERSION, placed_unit: placed, units: {}, catch_up: before && Array.isArray(before.catch_up) ? before.catch_up : [] };
  units.forEach((unit, i) => {
    const n = i + 1;
    const mine = (answered || []).filter((a) => a.unit === n);
    const was = before && before.units[unit.key] ? entryOf(before, unit.key) : null;
    const earlier = was ? was.asked.filter((a) => a && a.source !== 'placement') : [];
    const asked = [...earlier, ...mine.map((a) => ({ slot: a.slot, correct: !!a.correct, source: 'placement' }))];
    const right = asked.filter((a) => a.correct).length;
    const entry = { status: 'unseen', source: 'placement', evidence: { right, wrong: asked.length - right }, at: now, asked, test_out: was ? was.test_out : null };
    if (was && was.status === 'done') {
      // A retaken placement never un-finishes work: a unit worked on the path stays done.
      Object.assign(entry, { status: 'done', source: was.source, at: was.at || now });
    } else if (was && was.status === 'known' && keptProof(was.source)
      && !(mine.some((a) => !a.correct) && beliefIn(plan, unit, n, entry).decision === 'learn')) {
      // Nor does it throw away a proof the placement did not make (a test-out,
      // a quick check, the gap scan, an admin): the unit stays known unless the
      // new answers in it miss and, with everything else it has, now show a hole.
      Object.assign(entry, { status: 'known', source: was.source });
    } else if (n === placed) entry.status = 'learn';
    else if (n < placed) entry.status = settled(beliefIn(plan, unit, n, entry).decision, 'unchecked');
    if (entry.test_out === 'passed' && entry.status !== 'known') entry.test_out = null;
    plan.units[unit.key] = entry;
  });
  return save(enrollment, plan);
}

/** Proofs a retaken placement keeps: every source but the placement itself, which the new answers replace. */
function keptProof(source) {
  return ['test_out', 'quick_check', 'gap_scan', 'manual'].includes(source);
}

/** Every bank slot of each unit (1-based) already asked, from the plan: {unit: Set}. */
function askedSlots(enrollment) {
  const plan = planFor(enrollment);
  const units = plan ? unitsOf(enrollment) : null;
  const out = {};
  (units || []).forEach((u, i) => {
    out[i + 1] = new Set(entryOf(plan, u.key).asked.map((a) => a.slot).filter((s) => Number.isInteger(s)));
  });
  return out;
}

/**
 * The quick checks a plan calls for: one row per `unchecked` unit before the
 * placed one, in unit order, with the fresh questions left to ask it. The rows
 * keep the shape the quick check has always had (services/unit-placement.js).
 */
function quickChecks(enrollment) {
  const plan = planFor(enrollment);
  const units = plan ? unitsOf(enrollment) : null;
  if (!plan || !units || !plan.placed_unit) return [];
  const out = [];
  units.forEach((unit, i) => {
    const entry = entryOf(plan, unit.key);
    if (i + 1 >= plan.placed_unit || entry.status !== 'unchecked') return;
    const slots = unaskedSlots(unit, entry);
    out.push({ unit: i + 1, key: unit.key, slots, status: slots.length ? 'pending' : 'unchecked', misses: 0 });
  });
  return out;
}

/** How long one quick-check question takes, for deciding whether another fits the clock. */
function checkSeconds() {
  const v = Number(process.env.QUICK_CHECK_SECONDS);
  return Number.isFinite(v) && v > 0 ? v : 26;
}

/**
 * When the quick check has to stop: the mode's whole budget (Quick 20 minutes,
 * Balanced 45, Accurate 90 — the subject stage's clock plus the in-grade
 * stage's) less what this sitting has already spent on it — the in-grade
 * placement, and the subject walk and its gap scan when they were part of the
 * same sitting (finished within SITTING_HOURS before this placement started).
 * Whatever is undecided when the time is up stays `unchecked`, which is safe,
 * rather than running past the mode's promise. Null for a session with no mode.
 */
const SITTING_HOURS = 2;
function checkDeadline(enrollment, session, now = Date.now()) {
  // eslint-disable-next-line global-require
  const adaptive = require('./adaptive-placement');
  const mode = session && session.unit_mode;
  if (!unitPlacement.MODES[mode] || !adaptive.MODES[mode]) return null;
  const minutes = (from, to) => (Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, (to - from) / 60000) : 0);
  const start = Date.parse(session.started_at);
  let used = minutes(start, Date.parse(session.ended_at || new Date(now).toISOString()));
  const walk = db.findOne('subject_placements', (p) => p.user_id === enrollment.user_id && p.track_id === enrollment.track_id);
  const walkEnd = walk && Date.parse(walk.finished_at);
  if (walk && adaptive.MODES[walk.mode] && Number.isFinite(walkEnd) && Number.isFinite(start)
    && walkEnd <= start && start - walkEnd <= SITTING_HOURS * 3600 * 1000) {
    used += minutes(Date.parse(walk.started_at), walkEnd);
    const scan = walk.gap_scan;
    if (scan && scan.started_at) used += minutes(Date.parse(scan.started_at), Date.parse(scan.finished_at || scan.deadline_at || walk.finished_at));
  }
  const total = adaptive.WHOLE_MINUTES[mode];
  const left = Math.max(0, total - used);
  return new Date(now + left * 60000).toISOString();
}

/** Is there time for one more quick-check question before the deadline? */
function checkTimeLeft(deadline, now = Date.now()) {
  if (!deadline) return true;
  return Date.parse(deadline) - now >= checkSeconds() * 1000;
}

/**
 * Is this unit open to a test-out?
 * - An `unchecked` unit, at any time, wherever it is on the path: the learner
 *   may always try to prove it, as long as it could still be proved.
 * - An unseen unit after the placed one, not yet started, that the placement
 *   saw answered right and whose answers do not already show a hole — again
 *   only if it could still be proved with the fresh questions left.
 */
function testOutOpen(plan, unit, n, entry, currentLevel) {
  if (entry.test_out === 'failed' || entry.test_out === 'passed') return false;
  if (entry.status === 'unchecked') return canProve(plan, unit, n, entry);
  if (entry.status !== 'unseen') return false;
  if (!plan.placed_unit || n <= plan.placed_unit) return false;
  if (unit.start <= (currentLevel || 1)) return false;
  if (!entry.asked.some((a) => a.source === 'placement' && a.correct)) return false;
  if (beliefIn(plan, unit, n, entry).decision === 'learn') return false;
  return canProve(plan, unit, n, entry);
}

/** The units a test-out may still be offered on: [{unit, key, slots, title, start, end, status}]. */
function testOutCandidates(enrollment) {
  const plan = planFor(enrollment);
  const units = unitsOf(enrollment);
  if (!plan || !units) return [];
  const out = [];
  units.forEach((unit, i) => {
    const entry = entryOf(plan, unit.key);
    if (!testOutOpen(plan, unit, i + 1, entry, enrollment.current_level)) return;
    out.push({ unit: i + 1, key: unit.key, slots: unaskedSlots(unit, entry), title: (unit.titles || [])[0] || '', start: unit.start, end: unit.end, status: entry.status });
  });
  return out;
}

/**
 * The next test-out question: the unit already under way first, so each is
 * finished before the next. `onlyUnit` keeps it to one unit (a test-out started
 * from that unit on the path).
 */
function nextTestOut(enrollment, onlyUnit = null) {
  const plan = planFor(enrollment);
  const candidates = testOutCandidates(enrollment).filter((c) => !onlyUnit || c.unit === Number(onlyUnit));
  if (!candidates.length) return null;
  const going = candidates.find((c) => entryOf(plan, c.key).test_out === 'pending');
  const pick = going || candidates[0];
  return { unit: pick.unit, slot: pick.slots[0], key: pick.key, title: pick.title };
}

/**
 * Record one quick-check or test-out answer on unit `unitNumber` (1-based), and
 * settle the unit by what all its answers now say (unitBelief):
 * - an `unchecked` unit — or an unseen one before the placed unit, from a plan
 *   written before `unchecked` existed — is being checked: known or learn when
 *   the answers decide it, otherwise unchecked until they do. With no fresh
 *   question left it stays unchecked: worked, never skipped.
 * - an unseen unit after the placed one is a test-out, open only as
 *   testOutOpen says: known when proved, learn when the answers show a hole.
 * - the placed unit is always learned: an answer there is kept as evidence and
 *   changes nothing.
 *
 * `opts.slot` is the bank question answered. A question already answered is not
 * counted twice, so a double submit cannot count one right answer twice.
 * `opts.source` is 'quick_check' or 'test_out'; by default a unit before the
 * placed one is a quick check and any other a test-out.
 *
 * Returns { plan, changed, decision, belief }, where `changed` says the unit's
 * status moved.
 */
function recordCheck(enrollment, unitNumber, correct, opts = {}) {
  const row = live(enrollment);
  const plan0 = planFor(row);
  const units = unitsOf(row);
  const unit = units && units[Number(unitNumber) - 1];
  if (!plan0 || !unit) return { plan: plan0, changed: false };
  const n = Number(unitNumber);
  const placed = plan0.placed_unit || 0;
  const entry = entryOf(plan0, unit.key);
  const slot = opts.slot === null || opts.slot === undefined || !Number.isInteger(Number(opts.slot)) ? null : Number(opts.slot);
  if (slot !== null && entry.asked.some((a) => a.slot === slot)) return { plan: plan0, changed: false };
  const source = ['quick_check', 'test_out'].includes(opts.source) ? opts.source : n < placed ? 'quick_check' : 'test_out';
  const checking = entry.status === 'unchecked' || (entry.status === 'unseen' && n < placed);
  const isPlaced = n === placed;
  // An answer on a unit that is not open to a check or a test-out is not
  // evidence of either, and is not recorded as one.
  if (!isPlaced && !checking && !testOutOpen(plan0, unit, n, entry, row.current_level)) return { plan: plan0, changed: false };

  const before = entry.status;
  entry.asked.push({ slot, correct: !!correct, source: isPlaced ? 'manual' : source });
  entry.evidence[correct ? 'right' : 'wrong'] += 1;
  entry.at = new Date().toISOString();
  const belief = beliefIn(plan0, unit, n, entry);
  if (!isPlaced) {
    const next = settled(belief.decision, checking && !unaskedSlots(unit, entry).length ? 'unchecked' : entry.status);
    if (next !== entry.status) Object.assign(entry, { status: next, source });
    if (source === 'test_out') {
      entry.test_out = entry.status === 'known' ? 'passed'
        : entry.status === 'learn' || !canProve(plan0, unit, n, entry) ? 'failed' : 'pending';
    }
  }

  const plan = clone(plan0);
  plan.units[unit.key] = entry;
  save(enrollment, plan);
  return { plan, changed: entry.status !== before, decision: belief.decision, belief: belief.p };
}

/**
 * Set one unit's status by hand: the gap scan's catch-up plans, an admin fix,
 * the path marking a unit done. Creates the plan if the enrollment has none.
 */
function setUnit(enrollment, unitKey, status, source) {
  if (!STATUSES.includes(status)) throw new Error(`unknown unit status: ${status}`);
  if (!SOURCES.includes(source)) throw new Error(`unknown unit source: ${source}`);
  const row = live(enrollment);
  const plan = clone(planFor(row) || blankPlan());
  const entry = entryOf(plan, unitKey);
  plan.units[unitKey] = { ...entry, status, source, at: new Date().toISOString() };
  return save(enrollment, plan);
}

// ── The path rule ──────────────────────────────────────────────────────────

/**
 * Does the path step over this unit? A known unit, yes: it was proved. A done
 * unit, yes: it was worked, and walking it again would be the restart this
 * replaces. Nothing else: a unit to learn, one not checked yet, and one with no
 * evidence at all are all worked, so the path can never skip a gap on a guess.
 */
function stepsOver(plan, unit) {
  const status = statusOf(plan, unit);
  return status === 'known' || status === 'done';
}

/**
 * Was this unit proved? Only then does a checkpoint between units that covers
 * it go unsat. A unit that was worked (`done`), or will be (any other status),
 * is one the learner sits that checkpoint for.
 */
function proved(plan, unit) {
  return statusOf(plan, unit) === 'known';
}

function kindAt(grade, level) {
  return curriculum.levelKind(level, grade.pathLength, grade);
}

/**
 * The units a checkpoint that sits between units covers (indexes into
 * `units`), or [] for a level that is not one.
 *
 * Some grades put a checkpoint just after a unit's end rather than on it —
 * math's Written Task Revision at 54 follows the Written Task at 53, which ends
 * unit 2, and unit 3 starts at 55. The rule:
 *
 * 1. Only a checkpoint (not the Graduation exam) that sits before the last
 *    unit's end counts. The stretch after the last unit — the grade review and
 *    the Graduation exam — is always walked.
 * 2. Walking back over the run of between-unit checkpoints in front of it, if
 *    the first level reached is a checkpoint of the same kind inside a unit, it
 *    is that checkpoint's follow-up and covers that one unit (54 covers unit 2).
 * 3. Otherwise it covers every unit that lies wholly between the previous
 *    checkpoint of its kind and itself.
 */
function betweenCovers(grade, units, level) {
  const kind = kindAt(grade, level);
  if (!curriculum.isCheckpoint(kind) || kind === 'graduation') return [];
  if (!units.length || level > units[units.length - 1].end || unitIndexAt(units, level) >= 0) return [];
  let back = level - 1;
  while (back >= 1 && unitIndexAt(units, back) < 0 && curriculum.isCheckpoint(kindAt(grade, back))) back--;
  const anchor = back >= 1 ? unitIndexAt(units, back) : -1;
  if (anchor >= 0 && kindAt(grade, back) === kind) return [anchor];
  let previous = level - 1;
  while (previous >= 1 && kindAt(grade, previous) !== kind) previous--;
  return units.map((u, i) => (u.start > previous && u.end < level ? i : -1)).filter((i) => i >= 0);
}

/**
 * Does the path step over this level between units? Only a checkpoint whose
 * covered units were all proved — or one already passed. Every other level
 * between units is walked.
 */
function stepsOverBetween(enrollment, plan, units, grade, level) {
  const covers = betweenCovers(grade, units, level);
  if (!covers.length) return false;
  if ((enrollment.checkpoints_cleared || {})[level]) return true;
  return covers.every((i) => proved(plan, units[i]));
}

/**
 * The order the path works the units in: every unit to learn first, in level
 * order — the confirmed gaps lead — and then every unit not proved or worked
 * yet (not checked, or with no evidence), in level order. Known and done units
 * are never worked. Returns unit indexes, `except` left out.
 */
const LEARN_FIRST = ['learn'];
const THEN = ['unchecked', 'unseen'];
function unitsToWork(plan, units, statuses, except = -1) {
  return units.map((_, i) => i).filter((i) => i !== except && statuses.includes(statusOf(plan, units[i])));
}

/**
 * The level the path should stand on after finishing `level`.
 *
 * 1. The rest of the unit under way: the next level in it, and then any
 *    checkpoint between units that follows it and is not stepped over.
 * 2. Then the next unit to work, in the path's order (unitsToWork): the
 *    earliest unit to learn, else the earliest one not proved yet — behind the
 *    learner as well as ahead, so a unit not checked is never left behind for
 *    good. Its first level.
 * 3. With no unit left to work, the levels after the units (the grade review
 *    and the Graduation exam), stepping over what was proved.
 *
 * Without a plan or a bank, the next level, as it always was.
 */
function nextLevelAfter(enrollment, grade, level) {
  const next = unitNextLevelAfter(enrollment, grade, level);
  return compressProven(enrollment, grade, next);
}

/**
 * Practice ends on proof (services/adaptation.js, only with
 * ADAPTIVE_TEACHING=on): the path steps over the remaining practice levels of
 * an objective the learner has already proven (services/coverage.js). Its
 * retention levels are never stepped over, and nothing is marked cleared: the
 * coverage gate still holds graduation until every objective is proven and
 * kept. The owner's account follows the sheet (docs/PRODUCT-DECISIONS.md).
 */
function compressProven(enrollment, grade, next) {
  // eslint-disable-next-line global-require
  const adaptation = require('./adaptation');
  if (adaptation.mode() !== 'on' || !enrollment || !enrollment.user_id) return next;
  try {
    if (adaptation.ownerSkips(enrollment.user_id)) return next;
    // eslint-disable-next-line global-require
    const coverage = require('./coverage');
    const report = coverage.forEnrollment(enrollment.user_id, enrollment);
    if (!report) return next;
    let at = next;
    for (let guard = 0; guard < 60; guard++) {
      const e = report.model.levelMap[at];
      if (!e || e.kind !== 'activity' || e.retention) break;
      const s = report.states[e.direct];
      if (!(s.status === 'proven' || s.status === 'retained')) break;
      const after = unitNextLevelAfter(enrollment, grade, at);
      if (after <= at) break;
      at = after;
    }
    return at;
  } catch (err) {
    console.warn(`learner-path: compress failed: ${err.message}`);
    return next;
  }
}

function unitNextLevelAfter(enrollment, grade, level) {
  const end = grade.pathLength;
  const plan = planFor(enrollment);
  const units = plan ? unitsOf(enrollment) : null;
  let next = Number(level) + 1;
  const clamp = (l) => Math.max(1, Math.min(end, l));
  if (!plan || !units || !units.length) return clamp(next);
  const lastEnd = units[units.length - 1].end;

  const here = unitIndexAt(units, Number(level));
  if (here >= 0 && unitIndexAt(units, next) === here && !stepsOver(plan, units[here])) return clamp(next);
  while (next <= lastEnd && unitIndexAt(units, next) < 0) {
    if (!stepsOverBetween(enrollment, plan, units, grade, next)) return clamp(next);
    next += 1;
  }

  const pick = unitsToWork(plan, units, LEARN_FIRST, here)[0] ?? unitsToWork(plan, units, THEN, here)[0];
  if (pick !== undefined) return clamp(units[pick].start);

  next = Math.max(next, lastEnd + 1);
  while (next <= end) {
    const i = unitIndexAt(units, next);
    if (i >= 0 && stepsOver(plan, units[i])) next = units[i].end + 1;
    else if (i < 0 && stepsOverBetween(enrollment, plan, units, grade, next)) next += 1;
    else break;
  }
  return clamp(next);
}

/**
 * Where the learner should stand now, in the path's order (unitsToWork). The
 * earliest unit to learn — where they already are if they are partway through
 * it, else its first lesson. With nothing left to learn, a unit not proved yet:
 * the one they are partway through, else the earliest. With nothing left in
 * any unit, the first level from where they are that the path does not step
 * over. Without a plan, where they are.
 */
function firstLevel(enrollment, grade) {
  const current = enrollment.current_level || 1;
  const plan = planFor(enrollment);
  const units = plan ? unitsOf(enrollment) : null;
  if (!plan || !units) return current;
  const inside = (i) => current >= units[i].start && current <= units[i].end;
  const startOf = (i) => unitPlacement.startLevelOf(enrollment.track_id, enrollment.grade_id, units[i]);
  const learn = unitsToWork(plan, units, LEARN_FIRST);
  if (learn.length) return inside(learn[0]) ? current : startOf(learn[0]);
  const rest = unitsToWork(plan, units, THEN);
  if (rest.length) return rest.some(inside) ? current : startOf(rest[0]);
  return nextLevelAfter(enrollment, grade, current - 1);
}

/**
 * The learner has finished `level` on the path. If it was the last level of a
 * unit being worked, that unit is done. Returns the plan (unchanged when there
 * is nothing to mark).
 */
function finishLevel(enrollment, level) {
  const plan = planFor(enrollment);
  const units = plan ? unitsOf(enrollment) : null;
  if (!plan || !units) return plan;
  const i = unitIndexAt(units, level);
  if (i < 0 || units[i].end !== level) return plan;
  const status = statusOf(plan, units[i]);
  if (!['learn', 'unseen', 'unchecked'].includes(status)) return plan;
  return setUnit(enrollment, units[i].key, 'done', 'path');
}

/**
 * The units a checkpoint level stands for: its own unit, or for a checkpoint
 * between units the ones it covers (betweenCovers). [] for neither.
 */
function coveredBy(grade, units, level) {
  const i = unitIndexAt(units, level);
  return i >= 0 ? [i] : betweenCovers(grade, units, level);
}

/**
 * The checkpoints a move from `from` to `to` steps over that stand for known
 * units only, with the evidence that made those units known. These are recorded
 * as cleared, the way a jump records the checkpoints below it. One stepped over
 * because it was already passed keeps its own record.
 */
function skippedCheckpoints(enrollment, grade, from, to) {
  const plan = planFor(enrollment);
  const units = plan ? unitsOf(enrollment) : null;
  if (!plan || !units) return [];
  const out = [];
  for (let level = from + 1; level < to; level++) {
    if (!curriculum.isCheckpoint(kindAt(grade, level))) continue;
    const covers = coveredBy(grade, units, level);
    if (!covers.length || !covers.every((i) => statusOf(plan, units[i]) === 'known')) continue;
    const sources = [...new Set(covers.map((i) => entryOf(plan, units[i].key).source))];
    const last = covers[covers.length - 1];
    out.push({ level, unit: last + 1, key: units[last].key, source: sources.join(',') });
  }
  return out;
}

/**
 * The unit a level sits in, with its status, or null (no plan, no bank, or a
 * level outside every unit). With `grade`, a checkpoint between units answers
 * for the units it covers: `known` when they all are, else the status of the
 * first that is not, with `between: true`.
 */
function unitAt(enrollment, level, grade = null) {
  const plan = planFor(enrollment);
  const units = plan ? unitsOf(enrollment) : null;
  if (!plan || !units) return null;
  const i = unitIndexAt(units, level);
  const row = (k, extra) => ({ unit: k + 1, key: units[k].key, title: (units[k].titles || [])[0] || '', start: units[k].start, end: units[k].end, ...extra });
  if (i >= 0) return row(i, { status: statusOf(plan, units[i]) });
  const covers = grade ? betweenCovers(grade, units, level) : [];
  if (!covers.length) return null;
  const open = covers.find((k) => statusOf(plan, units[k]) !== 'known');
  const k = open === undefined ? covers[covers.length - 1] : open;
  return row(k, { status: open === undefined ? 'known' : statusOf(plan, units[k]), between: true });
}

/** Every unit of the plan with its status, for the path page: [] without a plan. */
function unitRows(enrollment) {
  const plan = planFor(enrollment);
  const units = plan ? unitsOf(enrollment) : null;
  if (!plan || !units) return [];
  return units.map((u, i) => {
    const entry = entryOf(plan, u.key);
    return {
      unit: i + 1,
      key: u.key,
      title: (u.titles || [])[0] || '',
      start: u.start,
      end: u.end,
      status: statusOf(plan, u),
      source: entry.source,
      test_out: entry.test_out,
      // Whether the learner may test out of it now (testOutOpen), so a unit
      // not checked yet can offer "test out?" right where it is drawn.
      can_test_out: testOutOpen(plan, u, i + 1, entry, enrollment.current_level),
    };
  });
}

/**
 * The plan in counts and titles, for the UI: each status as {count, units}, the
 * full list in `units`, the catch-up offers, and where the learner stands. The
 * same shape with every count at zero when there is no plan, so a page can draw
 * it without a branch.
 */
function summary(enrollment) {
  const plan = planFor(enrollment);
  const rows = unitRows(enrollment);
  const out = {
    planned: !!(plan && rows.length),
    placed_unit: plan ? plan.placed_unit || null : null,
    current_level: enrollment ? enrollment.current_level || null : null,
    first_level: null,
    units: rows,
    catch_up: plan && Array.isArray(plan.catch_up) ? plan.catch_up : [],
    test_out: plan ? testOutCandidates(enrollment).length : 0,
  };
  for (const status of STATUSES) {
    const mine = rows.filter((r) => r.status === status);
    out[status] = { count: mine.length, units: mine.map(({ unit, key, title, start, end, source }) => ({ unit, key, title, start, end, source })) };
  }
  const grade = enrollment && gradeOf(enrollment);
  if (out.planned && grade) out.first_level = firstLevel(enrollment, grade);
  return out;
}

module.exports = {
  unitBelief,
  beliefKnobs,
  VERSION,
  STATUSES,
  SOURCES,
  planFor,
  initFromPlacement,
  recordCheck,
  testOutCandidates,
  nextTestOut,
  nextLevelAfter,
  firstLevel,
  setUnit,
  summary,
  askedSlots,
  quickChecks,
  checkDeadline,
  checkTimeLeft,
  betweenCovers,
  finishLevel,
  skippedCheckpoints,
  unitAt,
  unitRows,
};
