/**
 * Study goals: what the learner wants out of a subject or an uploaded course, chosen next to the retention goal
 * (owner, 5 Nov 2026: "every single little bit can be changed, and put into that user's goals whether it be learn the
 * core parts fast ... and that understanding as deep as possible"). docs/MODIFICATION-AUDIT.md says what it reaches.
 *
 *   full   every level and skill, the whole explanation. Today's behaviour exactly (and what no goal set means).
 *   core   the core parts, fast: fewer levels (extra practice levels are set aside), shorter lessons (about 55% of
 *          the words, one example, no story or recap), the checks that prove understanding kept. What is set aside
 *          is listed to the learner, stays open, and can be brought back one level at a time or all at once.
 *   test   ready for a test: nothing set aside, the explanation trimmed to what a test asks, more retrieval checks.
 *
 * A goal sits on each enrollment (`enrollments.study_goal`) and each uploaded course (`materials.study_goal`):
 * { goal, set_on, restored: [level numbers or skill ids brought back] }. STUDY_GOAL=off ignores every goal.
 *
 * What counts as core is read from the course's own structure, never guessed:
 *   built-in grade   services/coverage.js gives one objective per teaching lesson and the levels that teach and practise
 *                    it. Kept for every objective: the lesson, its first practice level, every retention level, every
 *                    unit check, summary, checkpoint, review and the grade's last level. Set aside: the second and later
 *                    plain practice levels of an objective. (The coverage gate is untouched: an objective that is still
 *                    unproven when the grade ends is not graduated, and its levels are open to work.)
 *   uploaded course  services/course-builder.js gives skills with prerequisites. Kept: any skill another skill needs, the
 *                    last skill of each unit, and any skill that carries a heavy key point. Set aside: the rest.
 *
 * The spec side (services/learning-spec.js buildSpecFrom) calls applyToSpec so every writer (lessons, levels, notes,
 * podcast, pack) reads one change. Never throws; any failure is "full".
 */
const GOALS = {
  full: { label: 'Full depth', short: 'Full', blurb: 'Every level and every skill, with the whole explanation. Nothing is set aside.' },
  core: { label: 'Core parts, fast', short: 'Core', blurb: 'The core parts only: shorter lessons and fewer practice levels. What is set aside is listed and can be brought back.' },
  test: { label: 'Ready for a test', short: 'Test', blurb: 'Nothing is set aside. Explanations are trimmed to what a test asks and there are more recall checks.' },
};
const CHOICES = Object.keys(GOALS);
const DEFAULT_GOAL = 'full';
/** Share of the words a core lesson keeps (the gate asks for at least 25% fewer; the writer is held to this ceiling). */
const CORE_WORD_SHARE = 0.55;
const TABLES = { enrollment: 'enrollments', material: 'materials' };
const GATE_MIN = 3.4;
/** Plain practice levels kept per objective; the third and later are set aside. */
const KEEP_PRACTICE = 2;

const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require
const enabled = () => String(process.env.STUDY_GOAL || 'on').toLowerCase() !== 'off';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A stored goal, or an empty one, as { goal, restored[] }. A goal this build does not know is full. */
function effective(stored) {
  if (!enabled() || !stored || !GOALS[stored.goal]) return { goal: DEFAULT_GOAL, restored: [], set_on: null };
  return { goal: stored.goal, restored: Array.isArray(stored.restored) ? stored.restored.slice(0, 400) : [], set_on: stored.set_on || null };
}

function normalize(body, current) {
  const b = body || {};
  const cur = effective(current);
  const goal = b.goal === undefined ? cur.goal : String(b.goal);
  if (!GOALS[goal]) return { error: 'Choose full depth, core parts fast, or ready for a test.' };
  let restored = goal === cur.goal ? cur.restored.slice() : []; // a new goal starts with nothing brought back
  if (b.restore === 'all') restored = ['all'];
  else if (Array.isArray(b.restore)) restored = [...new Set([...restored, ...b.restore.map((x) => (typeof x === 'number' ? x : String(x).slice(0, 80)))])].slice(0, 400);
  if (Array.isArray(b.unrestore)) restored = restored.filter((x) => !b.unrestore.includes(x));
  return { goal: { goal, restored, set_on: new Date().toISOString().slice(0, 10) } };
}

// ── what the spec says ─────────────────────────────────────────────────────
/**
 * Change a spec's numbers for the goal. Only how much and how it is said changes, never what must be covered: the key-fact
 * check and the coverage contract stay on every prompt. Mutates and returns the spec; full leaves it as it is.
 */
function applyToSpec(spec, id) {
  if (!spec || !enabled() || !GOALS[id] || id === 'full') return spec;
  const l = spec.lesson; const p = spec.practice;
  if (id === 'core') {
    l.minutes = Math.max(3, Math.round(l.minutes * CORE_WORD_SHARE));
    l.wordBudget = Math.max(120, Math.round((l.wordBudget * CORE_WORD_SHARE) / 10) * 10);
    l.sections = Math.min(l.sections, 3);
    l.newIdeasPerChunk = Math.min(l.newIdeasPerChunk, 2);
    l.maxNewTerms = Math.min(l.maxNewTerms, 3);
    l.mistakes = Math.min(l.mistakes, 1);
    l.restate = 0; l.recapAtStart = false; l.recapAtEnd = false; l.hook = 'none'; l.storyFrame = false; l.bigPictureFirst = false;
    l.warmupItems = Math.min(l.warmupItems, 1);
    l.retrievalChecks = clamp(l.retrievalChecks, 3, 7); // the checks are what shows the core is understood: never fewer than three
    p.examplesPerIdea = 1; p.workedExamples = Math.min(p.workedExamples, 1); p.tryItems = Math.min(p.tryItems, 1);
    p.selfExplain = false; p.mistakeShown = false;
  } else if (id === 'test') {
    l.wordBudget = Math.max(150, Math.round((l.wordBudget * 0.75) / 10) * 10);
    l.minutes = Math.max(3, Math.round(l.minutes * 0.8));
    l.restate = 0; l.hook = 'none'; l.storyFrame = false; l.recapAtStart = false;
    l.retrievalChecks = clamp(l.retrievalChecks + 2, 4, 8);
    l.checkEveryChunks = 1; l.quickCheckEverySection = true; l.quickCheckEvery = 1;
    p.predictBeforeReveal = true; p.typedAnswers = Math.max(p.typedAnswers, 0.6);
    spec.difficulty.stretchShare = Math.max(spec.difficulty.stretchShare, 0.2);
  }
  spec.studyGoal = { id, label: GOALS[id].label };
  spec.isDefault = false;
  return spec;
}

const LINES = {
  core: [
    'STUDY GOAL (the learner chose it): the core parts, fast. Teach only what the objective needs and the learner must be able to do afterwards. Every point of the coverage below is still stated, in its shortest accurate form.',
    'Cut, in this order: the backstory, the second and third example, repeated restatements, recaps, asides, side facts. Keep every definition, rule, step and fact a check question depends on.',
    'One example per idea, the most typical one; no story frame, no hook paragraph. Keep the check questions: they are how the learner proves the core is understood.',
  ],
  test: [
    'STUDY GOAL (the learner chose it): ready for a test. State each point the way a test asks it, then test it straight away. No story, no recap of earlier lessons.',
    'After every short stretch of explanation put a recall check; make some of the checks ask for the answer in the learner\'s own words or numbers, and include one harder case at the end.',
  ],
};
/** The prompt lines a spec's study goal adds to a writer's block (empty without one). */
function linesFor(spec) { return spec && spec.studyGoal && LINES[spec.studyGoal.id] ? LINES[spec.studyGoal.id].slice() : []; }

// ── what is set aside ──────────────────────────────────────────────────────
/** Levels of a built-in grade the core goal sets aside: [{ level, title, objective }]. Empty if the grade has no coverage model. */
function coreSetAsideLevels(trackId, gradeId) {
  try {
    const model = lazy('./coverage').modelFor(trackId, gradeId);
    const grade = lazy('../config/curriculum').getGrade(trackId, gradeId);
    if (!model || !grade) return [];
    const byLevel = new Map((grade.levels || []).map((r) => [r.level, r]));
    const firstSeen = new Map();
    const out = [];
    for (let level = 1; level < model.pathLength; level++) {
      const e = model.levelMap[level];
      if (!e || e.kind !== 'activity' || e.retention || e.direct === undefined) continue;
      const seen = (firstSeen.get(e.direct) || 0) + 1; firstSeen.set(e.direct, seen);
      if (seen <= KEEP_PRACTICE) continue;
      const row = byLevel.get(level) || {};
      out.push({ level, title: row.title || `Level ${level}`, objective: e.direct });
    }
    return out;
  } catch { return []; }
}

/** Skills of an uploaded course the core goal sets aside, from its own structure: [{ id, title }]. */
function coreSetAsideSkills(course) {
  try {
    const skills = (course && course.skills) || [];
    if (skills.length < 4) return [];
    const needed = new Set(skills.flatMap((s) => s.prerequisites || []));
    const lastOfUnit = new Set();
    const byUnit = new Map();
    for (const s of skills) byUnit.set(s.unit_id || s.unit || '_', s);
    for (const s of byUnit.values()) lastOfUnit.add(s.id);
    const heavy = new Set((course.keypoint_gate_skills || []));
    return skills.filter((s) => !needed.has(s.id) && !lastOfUnit.has(s.id) && !heavy.has(s.id) && s.source !== 'remediation').map((s) => ({ id: s.id, title: s.title }));
  } catch { return []; }
}

const brought = (eff, key) => eff.restored.includes('all') || eff.restored.includes(key);

/** The set-aside levels still set aside for one enrollment (restored ones removed). Empty unless the goal is core. */
function setAsideFor(enrollment) {
  if (!enrollment || !enabled()) return [];
  const eff = effective(enrollment.study_goal);
  if (eff.goal !== 'core') return [];
  return coreSetAsideLevels(enrollment.track_id, enrollment.grade_id).filter((x) => !brought(eff, x.level));
}

/** The path's step: from `next`, skip levels set aside. Never past the grade's last level. */
function stepOver(enrollment, grade, next) {
  try {
    const aside = new Set(setAsideFor(enrollment).map((x) => x.level));
    if (!aside.size) return next;
    let at = next;
    while (aside.has(at) && at < grade.pathLength) at += 1;
    return at;
  } catch { return next; }
}

/** The skills of an uploaded course set aside for this learner right now: [{ id, title }]. */
function setAsideSkills(userId, materialId, course) {
  if (!enabled()) return [];
  try {
    const m = lazy('../config/db').byId('materials', materialId);
    if (!m || m.user_id !== userId) return [];
    const eff = effective(m.study_goal);
    if (eff.goal !== 'core') return [];
    return coreSetAsideSkills(course).filter((x) => !brought(eff, x.id));
  } catch { return []; }
}

/** The goal for the spec: from a material, or from the learner's enrollment on the track and grade. 'full' when none. */
function goalFor(userId, { materialId = null, trackId = null, gradeId = null } = {}) {
  if (!enabled() || !userId) return DEFAULT_GOAL;
  try {
    const db = lazy('../config/db');
    if (materialId) {
      const m = db.byId('materials', materialId);
      return m && m.user_id === userId ? effective(m.study_goal).goal : DEFAULT_GOAL;
    }
    if (trackId) {
      const e = db.findOne('enrollments', (x) => x.user_id === userId && x.track_id === trackId && (!gradeId || x.grade_id === gradeId));
      return e ? effective(e.study_goal).goal : DEFAULT_GOAL;
    }
  } catch { /* full */ }
  return DEFAULT_GOAL;
}

// ── storage and the page ───────────────────────────────────────────────────
function describe(id, aside) {
  const g = GOALS[id];
  const n = aside.length;
  if (id === 'core') return `${g.label}: shorter lessons${n ? `, and ${n} practice level${n === 1 ? '' : 's'} set aside (listed here, still open)` : ''}.`;
  return `${g.label}: ${g.blurb}`;
}

function save(userId, kind, id, body) {
  if (!enabled()) return { error: 'Study goals are switched off.', status: 400 };
  const db = lazy('../config/db');
  const table = TABLES[kind];
  if (!table) return { error: 'Choose a subject or a course.', status: 400 };
  const row = db.byId(table, Number(id));
  if (!row || row.user_id !== userId) return { error: 'Not found.', status: 404 };
  const n = normalize(body, row.study_goal);
  if (n.error) return { error: n.error, status: 400 };
  db.update(table, row.id, { study_goal: n.goal });
  return { goal: n.goal, row: db.byId(table, row.id) };
}

/** Every enrollment's and course's study goal for one learner, ready for the page. */
function listFor(userId) {
  const db = lazy('../config/db');
  const curriculum = lazy('../config/curriculum');
  const enrollments = db.find('enrollments', (e) => e.user_id === userId).map((e) => {
    const eff = effective(e.study_goal);
    const track = curriculum.getTrack(e.track_id); const grade = curriculum.getGrade(e.track_id, e.grade_id);
    const aside = setAsideFor(e);
    const offered = eff.goal === 'core' ? coreSetAsideLevels(e.track_id, e.grade_id).length : null;
    return { kind: 'enrollment', id: e.id, title: `${track ? track.name : e.track_id}${grade ? `: ${grade.name}` : ''}`, goal: eff.goal, summary: describe(eff.goal, aside), set_aside: aside.slice(0, 200), set_aside_count: aside.length, brought_back: offered === null ? 0 : offered - aside.length };
  });
  const materials = db.find('materials', (m) => m.user_id === userId).map((m) => {
    const eff = effective(m.study_goal);
    let aside = [];
    if (eff.goal === 'core') { try { aside = setAsideSkills(userId, m.id, lazy('./material-study').internals.loadCourse(userId, m.id)); } catch { aside = []; } }
    return { kind: 'material', id: m.id, title: m.title || `Material ${m.id}`, goal: eff.goal, summary: describe(eff.goal, aside), set_aside: aside.slice(0, 200), set_aside_count: aside.length, brought_back: 0 };
  });
  return { choices: CHOICES.map((id) => ({ id, label: GOALS[id].label, blurb: GOALS[id].blurb })), enrollments, materials };
}

module.exports = {
  GOALS, CHOICES, DEFAULT_GOAL, CORE_WORD_SHARE, GATE_MIN, enabled, effective, normalize, applyToSpec, linesFor,
  coreSetAsideLevels, coreSetAsideSkills, setAsideFor, stepOver, setAsideSkills, goalFor, describe, save, listFor,
};
