/**
 * Coverage: what a grade must teach, written as explicit objectives, and a record
 * per objective per learner of whether it has been proven and then kept.
 * (curriculum-build/ADAPTIVE-COVERAGE.md)
 *
 * The owner's rule: however a level is adapted to one learner, they must still
 * learn everything the grade covers. So "what must be covered" lives here, apart
 * from "how it is taught" (services/adaptation.js), and nothing in adaptation may
 * change it.
 *
 * ## Objectives
 *
 * One objective per teaching lesson of a grade's sheet (a level of type
 * `Lesson`): its title, the `covers` sentence its author wrote (what the learner
 * must be able to do), its skill, and the levels that teach and practise it. A
 * grade whose sheet has no lessons (three late Spanish grades) uses its unit
 * goals ("Goal: I can ..."). `levelMap` says, for every level, whose evidence an
 * answer there is: one objective's own (its lesson, its activities), or several
 * at once (an entry check, a summary, a checkpoint, the grade review).
 *
 * ## The record
 *
 * Evidence is the learner's answered items in that grade, read from the items
 * table: nothing new is written while they learn. Each objective's answers are
 * folded in time order:
 *
 *   - Knowledge, by Bayesian knowledge tracing (Corbett & Anderson 1995): a
 *     belief L that the objective is learned, updated by each answer (right with
 *     1 - SLIP if learned, with the guessing rate if not) and raised by the
 *     chance of learning from the practice itself. An answer that speaks for k
 *     objectives at once counts 1/k. Rapid guesses are not evidence; an answer
 *     the coach walked them to counts a quarter.
 *   - Proven: L >= PROVEN_AT with enough unaided evidence behind it. Proven
 *     before any of its own teaching (an entry check, a test-out, a unit the
 *     placement proved) is prior knowledge, and is taken as kept.
 *   - Retained: proven, and then an unaided answer at least RETAIN_DAYS later
 *     came out right often enough (a second Bayes belief, R, over those delayed
 *     checks). A delayed check that fails it makes the objective `lapsed`: it
 *     must be proven again and checked again.
 *
 * ## The guarantee
 *
 * `gate()`: a grade is complete only when every objective is retained (or, with
 * COVERAGE_RULE=proven, proven). `atGraduation()` applies it where the
 * Graduation exam would graduate the learner. COVERAGE_GATE decides what that
 * does: `shadow` (the default) records what the gate would have said and changes
 * nothing anyone sees; `enforce` holds graduation until the gate is met; `off`
 * does nothing. Enforcing is the owner's call.
 */
const curriculum = require('../config/curriculum');

const VERSION = 1;
const DAY = 24 * 3600 * 1000;
const STATUSES = ['unproven', 'proven', 'retained', 'lapsed'];

// ── knobs ──────────────────────────────────────────────────────────────────
/**
 * Read on every call so a simulation can tune them (scripts/coverage-audit.js).
 *   OBJ_PRIOR        chance a new objective is already known before its lesson
 *   OBJ_LEARN        chance one practice answer teaches it (BKT transition)
 *   OBJ_SLIP         chance someone who knows it still misses
 *   OBJ_LUCK         chance above a blind guess that someone who does not know it is right
 *   OBJ_TYPED_GUESS  guessing rate of a typed answer
 *   OBJ_PROVEN_AT    belief at which it is proven
 *   OBJ_MIN_MASS     unaided evidence (in answers) a proof needs
 *   OBJ_MIN_RIGHT    unaided right answers a proof needs
 *   OBJ_MIN_ALIGNED  of those, right answers to questions written for this objective
 *                    (its lesson's checks, its games, a question tagged with it):
 *                    bank practice questions are written per skill, so on their
 *                    own they can prove the skill rather than the objective
 *   RETAIN_DAYS      how long after proof a check counts as a memory check
 *   RETAIN_SPAN_DAYS how long after proof the check that makes it retained must be
 *   RETAIN_PRIOR / RETAIN_AT / LAPSE_AT   the retention belief: start, kept, lost
 *   RETAIN_MIN_W     the least weight an answer needs to count as a memory check
 *   OBJ_RAPID_MS     an answer faster than this is a rapid guess, not evidence
 *   OBJ_COACH_W      weight of a right answer reached with the coach
 *   OBJ_ATTEST_W     weight of a grown-up's "I heard them say it" on a spoken
 *                    checkpoint (services/essays.js oralSubmit): a yes/no that
 *                    nothing checks, so light, and never direct evidence
 */
function knobs() {
  const num = (name, fallback) => {
    const v = Number(process.env[name]);
    return process.env[name] !== undefined && process.env[name] !== '' && Number.isFinite(v) ? v : fallback;
  };
  return {
    PRIOR: num('OBJ_PRIOR', 0.2),
    LEARN: num('OBJ_LEARN', 0.15),
    SLIP: num('OBJ_SLIP', 0.1),
    LUCK: num('OBJ_LUCK', 0.1),
    TYPED_GUESS: num('OBJ_TYPED_GUESS', 0.05),
    PROVEN_AT: num('OBJ_PROVEN_AT', 0.95),
    MIN_MASS: num('OBJ_MIN_MASS', 3),
    MIN_RIGHT: num('OBJ_MIN_RIGHT', 3),
    MIN_ALIGNED: num('OBJ_MIN_ALIGNED', 2),
    RETAIN_DAYS: num('RETAIN_DAYS', 1),
    // 7 days (evidence article 01, P5; RETAIN_REAL_DELAY, default on since 2026-10-25):
    // "retained" is claimed only on an unaided check a week or more after the
    // proof, not the next day (cepeda2006, cepeda2008, latimier2021, rawson2013power).
    // The memory checks still start a day after (RETAIN_DAYS). RETAIN_REAL_DELAY=off
    // restores 1; RETAIN_SPAN_DAYS still overrides either.
    RETAIN_SPAN_DAYS: num('RETAIN_SPAN_DAYS', String(process.env.RETAIN_REAL_DELAY || 'on').toLowerCase() === 'off' ? 1 : 7),
    RETAIN_PRIOR: num('RETAIN_PRIOR', 0.7),
    RETAIN_AT: num('RETAIN_AT', 0.9),
    LAPSE_AT: num('LAPSE_AT', 0.4),
    RETAIN_MIN_W: num('RETAIN_MIN_W', 0.5),
    RAPID_MS: num('OBJ_RAPID_MS', 1200),
    COACH_W: num('OBJ_COACH_W', 0.25),
    ATTEST_W: num('OBJ_ATTEST_W', 0.25),
  };
}

function gateMode() {
  // Default enforce since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md); COVERAGE_GATE=shadow turns it back.
  const m = String(process.env.COVERAGE_GATE || 'enforce').toLowerCase();
  return ['shadow', 'enforce', 'off'].includes(m) ? m : 'enforce';
}

function gateRule() {
  return String(process.env.COVERAGE_RULE || 'retained').toLowerCase() === 'proven' ? 'proven' : 'retained';
}

/**
 * With objective items on (OBJECTIVE_ITEMS, default on; services/objective-items.js),
 * a tagged answer is aligned evidence only when the question was written for
 * the objective. Off: every tagged answer counts, as before.
 */
function writtenRule() {
  return String(process.env.OBJECTIVE_ITEMS || 'on').toLowerCase() !== 'off';
}

// ── objectives ─────────────────────────────────────────────────────────────

/** A lesson title without the sheet's "[Math] " style prefix. */
function cleanTitle(t) {
  return String(t || '').replace(/^\[[^\]]+\]\s*/, '').trim();
}

function norm(t) {
  return cleanTitle(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const CHECKPOINT_KINDS = new Set(['master', 'grand', 'essay', 'graduation']);

/**
 * Which lesson an activity row practises. The sheets name it: "Activity 3 of 9
 * (quiz/game): Sort and Compare - <lesson title>". Falls back to the lesson the
 * row follows when the name does not say.
 */
function activityLesson(row, byTitle, lastLesson) {
  const title = String(row.title || '');
  const dash = title.lastIndexOf(' - ');
  if (dash >= 0) {
    const named = byTitle.get(norm(title.slice(dash + 3)));
    if (named !== undefined) return named;
  }
  // A title that itself ends with a lesson's title (names with " - " inside them).
  for (const [t, i] of byTitle) if (t && norm(title).endsWith(` ${t}`)) return i;
  return lastLesson;
}

/** The lessons an entry check speaks for: "(A through B)" in its covers text, else its ninth. */
function testerSpan(row, objectives, byTitle, part, parts) {
  const m = /\(([^()]*?) through ([^()]*?)\)/.exec(String(row.covers || ''));
  if (m) {
    const a = byTitle.get(norm(m[1]));
    const b = byTitle.get(norm(m[2]));
    if (a !== undefined && b !== undefined && a <= b) return range(a, b);
  }
  if (!parts) return objectives.map((_, i) => i);
  const per = objectives.length / parts;
  return range(Math.floor((part - 1) * per), Math.max(Math.floor((part - 1) * per), Math.ceil(part * per) - 1));
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

const cache = new Map();

/**
 * Every objective of a grade, and for every level whose evidence an answer there
 * is. Cached per grade (the sheets are built files).
 *
 * @returns {{trackId, gradeId, objectives: object[], levelMap: object, source: string}|null}
 */
function modelFor(trackId, gradeId) {
  const key = `${trackId}/${gradeId}`;
  if (cache.has(key)) return cache.get(key);
  const grade = curriculum.getGrade(trackId, gradeId);
  const model = grade ? build(trackId, grade) : null;
  cache.set(key, model);
  return model;
}

function build(trackId, grade) {
  const rows = (grade.levels || []).slice().sort((a, b) => a.level - b.level);
  if (!rows.length) return null;
  let teach = rows.filter((r) => r.type === 'Lesson' && r.kind === 'lesson');
  let source = 'lessons';
  if (!teach.length) {
    // No teaching lessons in the sheet: the unit goals are what the grade promises.
    teach = rows.filter((r) => r.type === 'Preview' && /goal:/i.test(String(r.covers || '')));
    source = 'unit_goals';
  }
  const objectives = teach.map((r, i) => ({
    id: `${grade.id}:L${r.level}`,
    n: i + 1,
    track_id: trackId,
    grade_id: grade.id,
    title: cleanTitle(r.title),
    covers: String(r.covers || '').replace(/^goal:\s*/i, '').trim(),
    skill: r.skill || grade.skills[0] || null,
    // The sheet's own tag when grade-fit re-tagged the lesson (config/grade-skills.js),
    // so answers recorded before the re-tag still count as on this objective's skill.
    sheet_skill: r.sheet_skill || null,
    unit: r.unit || null,
    lesson_level: r.level,
    levels: [r.level],
    practice: [],
    retention: [],
  }));
  const byTitle = new Map();
  objectives.forEach((o, i) => { if (!byTitle.has(norm(o.title))) byTitle.set(norm(o.title), i); });
  const byLevel = new Map(objectives.map((o, i) => [o.lesson_level, i]));
  const byUnit = new Map();
  objectives.forEach((o, i) => { if (o.unit) byUnit.set(o.unit, [...(byUnit.get(o.unit) || []), i]); });

  const levelMap = {};
  let lastLesson = null;
  let sinceSummary = [];
  // Objectives taught since the last Grand Master quiz, and since the last
  // checkpoint of any kind; a checkpoint straight after another (a revision of
  // a written task) covers what the one before it covered.
  let sinceGrand = [];
  let sinceAnyCheckpoint = [];
  let lastSpan = null;
  const testers = rows.filter((r) => r.type === 'Tester');
  const all = objectives.map((_, i) => i);

  for (const r of rows) {
    const L = r.level;
    if (byLevel.has(L)) {
      const i = byLevel.get(L);
      levelMap[L] = { direct: i, kind: 'lesson' };
      lastLesson = i;
      sinceSummary.push(i);
      sinceAnyCheckpoint.push(i);
      sinceGrand.push(i);
      continue;
    }
    if (source === 'unit_goals' && r.unit && byUnit.has(r.unit)) {
      const [i] = byUnit.get(r.unit);
      levelMap[L] = { direct: i, kind: 'unit' };
      objectives[i].levels.push(L);
      if (r.kind === 'practice') objectives[i].practice.push(L);
      continue;
    }
    if (r.type === 'Tester') {
      const part = testers.indexOf(r) + 1;
      levelMap[L] = { shared: testerSpan(r, objectives, byTitle, part, testers.length), kind: 'tester' };
      continue;
    }
    if (r.type === 'Activity') {
      const i = activityLesson(r, byTitle, lastLesson);
      if (i === null || i === undefined) continue;
      levelMap[L] = { direct: i, kind: 'activity', retention: /\(retention\)/i.test(String(r.title || '')) };
      objectives[i].levels.push(L);
      objectives[i].practice.push(L);
      if (levelMap[L].retention) objectives[i].retention.push(L);
      continue;
    }
    if (r.type === 'Summary') {
      levelMap[L] = { shared: sinceSummary.length ? sinceSummary.slice() : (lastLesson === null ? [] : [lastLesson]), kind: 'summary' };
      sinceSummary = [];
      continue;
    }
    if (/grade review/i.test(r.type) || r.kind === 'graduation') {
      levelMap[L] = { shared: all, kind: r.kind === 'graduation' ? 'graduation' : 'review' };
      continue;
    }
    if (CHECKPOINT_KINDS.has(r.kind)) {
      const fresh = r.kind === 'grand' ? sinceGrand : sinceAnyCheckpoint;
      const span = fresh.length ? fresh.slice() : (lastSpan || all);
      levelMap[L] = { shared: span, kind: 'checkpoint' };
      lastSpan = span;
      if (r.kind === 'grand') sinceGrand = [];
      sinceAnyCheckpoint = [];
      continue;
    }
    // Spanish-style unit rows (stories, dictation, speaking, unit checks): the
    // unit's lessons together.
    if (r.unit && byUnit.has(r.unit)) {
      levelMap[L] = { shared: byUnit.get(r.unit), kind: 'unit' };
      continue;
    }
    // Anything else after a lesson with nothing in between (a stray practice
    // row): that lesson's.
    if (r.kind === 'practice' && lastLesson !== null) {
      levelMap[L] = { direct: lastLesson, kind: 'practice' };
      objectives[lastLesson].levels.push(L);
      objectives[lastLesson].practice.push(L);
    }
  }
  return { trackId, gradeId: grade.id, objectives, levelMap, source, pathLength: grade.pathLength, skills: grade.skills };
}

/** The objectives of a grade (public shape). */
function objectivesFor(trackId, gradeId) {
  const m = modelFor(trackId, gradeId);
  return m ? m.objectives : [];
}

/**
 * Machine checks on a grade's objectives: every objective states what it covers,
 * has a skill the grade teaches, is practised somewhere, and is assessed by some
 * checkpoint or the Graduation exam; every activity row belongs to an objective.
 * Returns {ok, problems[], warnings[], stats}.
 */
function validate(trackId, gradeId) {
  const grade = curriculum.getGrade(trackId, gradeId);
  const m = modelFor(trackId, gradeId);
  const problems = [];
  const warnings = [];
  if (!grade) return { ok: false, problems: ['no such grade'], warnings, stats: {} };
  if (!m || !m.objectives.length) return { ok: false, problems: ['grade has no objectives'], warnings, stats: {} };
  const ids = new Set();
  const assessed = new Set();
  const practisedShared = new Set();
  for (const entry of Object.values(m.levelMap)) {
    if (entry.shared && ['checkpoint', 'graduation', 'review', 'summary'].includes(entry.kind)) entry.shared.forEach((i) => assessed.add(i));
    if (entry.shared && entry.kind === 'unit') entry.shared.forEach((i) => practisedShared.add(i));
  }
  m.objectives.forEach((o, i) => {
    if (ids.has(o.id)) problems.push(`${o.id}: duplicate id`);
    ids.add(o.id);
    if (!o.title) problems.push(`${o.id}: no title`);
    if (String(o.covers).length < 15) problems.push(`${o.id}: covers text missing or too short`);
    if (!o.skill || !(grade.skills || []).includes(o.skill)) problems.push(`${o.id}: skill ${o.skill} is not one the grade teaches`);
    if (!o.practice.length && !practisedShared.has(i)) warnings.push(`${o.id}: no practice level of its own`);
    if (!assessed.has(i)) problems.push(`${o.id}: no checkpoint, review or Graduation exam assesses it`);
  });
  const titles = new Map();
  m.objectives.forEach((o) => titles.set(norm(o.title), (titles.get(norm(o.title)) || 0) + 1));
  for (const [t, n] of titles) if (n > 1) warnings.push(`title used by ${n} objectives: "${t}"`);
  const unattributed = (grade.levels || []).filter((r) => r.type === 'Activity' && !m.levelMap[r.level]).length;
  if (unattributed) problems.push(`${unattributed} activity levels belong to no objective`);
  const mapped = Object.keys(m.levelMap).length;
  return {
    ok: !problems.length,
    problems,
    warnings,
    stats: {
      objectives: m.objectives.length,
      source: m.source,
      levels: (grade.levels || []).length,
      mapped_levels: mapped,
      direct_levels: Object.values(m.levelMap).filter((e) => e.direct !== undefined).length,
      retention_levels: m.objectives.reduce((s, o) => s + o.retention.length, 0),
    },
  };
}

// ── evidence ───────────────────────────────────────────────────────────────

/** How likely a right answer is by guessing: options for a choice, a small rate typed. */
function guessOf(answer, k) {
  const n = Number(answer.choices) || 0;
  return n >= 2 ? Math.min(0.95, 1 / n + k.LUCK) : k.TYPED_GUESS + k.LUCK / 2;
}

/**
 * Whose evidence one answer is: [{i, w, direct}]. An answer tagged with an
 * objective (a targeted review) is that objective's. At an objective's own level
 * it is that objective's when it is a lesson check, a game question or on the
 * objective's skill; a question there on another skill (a review of earlier
 * work) speaks for the earlier objectives on that skill, together. A level
 * shared by several (entry check, summary, checkpoint, review) speaks for those
 * of them on the answer's skill, together.
 */
/** An answer is on an objective's skill: its current one, or the sheet tag it replaced. */
const onSkill = (o, skill) => o.skill === skill || (!!o.sheet_skill && o.sheet_skill === skill);

function attribute(model, answer) {
  if (answer.objective) {
    const i = model.objectives.findIndex((o) => o.id === answer.objective);
    if (i >= 0) return [{ i, w: 1, direct: true }];
  }
  const entry = model.levelMap[answer.level];
  const bySkill = (list) => {
    const same = list.filter((i) => onSkill(model.objectives[i], answer.skill));
    return same.length ? same : list;
  };
  const together = (list) => list.map((i) => ({ i, w: 1 / list.length, direct: false }));
  if (entry && entry.direct !== undefined) {
    const o = model.objectives[entry.direct];
    if (['check', 'game'].includes(answer.role) || !answer.skill || onSkill(o, answer.skill)) return [{ i: entry.direct, w: 1, direct: true }];
    const earlier = model.objectives.map((x, i) => i).filter((i) => onSkill(model.objectives[i], answer.skill)
      && model.objectives[i].lesson_level < (answer.level || 0));
    return earlier.length ? together(earlier) : [];
  }
  if (entry && entry.shared && entry.shared.length) return together(bySkill(entry.shared));
  return [];
}

// ── the record: one objective's state, folded answer by answer ────────────

function blankState(k = knobs(), prior = null) {
  return {
    status: 'unproven',
    L: prior === null ? k.PRIOR : prior,
    R: k.RETAIN_PRIOR,
    mass: 0,
    right: 0,
    aligned: 0,
    direct: 0,
    answers: 0,
    nc: 0,
    nw: 0,
    checks: 0,
    taught: false,
    first_at: null,
    last_at: null,
    proven_at: null,
    proven_by: null,
    retained_at: null,
    retained_by: null,
    lapses: 0,
    check_misses: 0,
    memory_ok: false,
    rapid: 0,
    ns: 0,
    nsw: 0,
  };
}

/**
 * Fold one answer into an objective's state. `share` is {w, direct} from
 * attribute(); the answer is {t, correct, choices, ms, coach}.
 */
function fold(state, answer, share, k = knobs()) {
  if (answer.ms && answer.ms > 0 && answer.ms < Math.max(k.RAPID_MS, Number(answer.rapidMs) || 0)) { // rapidMs: the item's own line (effort-monitor.itemLine, P8; 0 = none); Infinity on a set-aside answer
    // A rapid guess is not evidence. It is counted, so the learner's own
    // record can say whether they rush (adaptation.effort).
    state.rapid = (state.rapid || 0) + share.w;
    return state;
  }
  const s = state;
  // `weight` is set only on a grown-up's confirmation (answersFor): k.ATTEST_W.
  const w = share.w * (answer.coach && answer.correct ? k.COACH_W : 1) * (answer.attest ? k.ATTEST_W : 1);
  if (w <= 0) return s;
  const g = guessOf(answer, k);
  const t = Number(answer.t) || 0;

  // A memory check: an answer long enough after the proof, and after their last
  // answer on it, to say whether it was kept.
  const proven = s.status === 'proven' || s.status === 'retained';
  // It counts when the objective has not been answered for half that long, or
  // the answer just before was itself a memory check answered right (a second
  // question in the same check, before any re-teaching).
  const memory = proven && w >= k.RETAIN_MIN_W && s.proven_at !== null
    && t - s.proven_at >= k.RETAIN_DAYS * DAY && s.last_at !== null
    && (t - s.last_at >= k.RETAIN_DAYS * DAY * 0.5 || s.memory_ok);
  s.memory_ok = false;
  if (memory) {
    const kept = answer.correct ? (1 - k.SLIP) : k.SLIP;
    const lost = answer.correct ? g : 1 - g;
    const a = s.R * kept ** w;
    const b = (1 - s.R) * lost ** w;
    s.R = a / (a + b);
    s.checks += 1;
    if (!answer.correct) s.check_misses += 1;
    s.memory_ok = !!answer.correct;
    if (s.R >= k.RETAIN_AT && s.status === 'proven' && t - s.proven_at >= k.RETAIN_SPAN_DAYS * DAY) {
      s.status = 'retained';
      s.retained_at = t;
      s.retained_by = 'check';
    } else if (s.R <= k.LAPSE_AT) {
      // Forgotten: it has to be learned and proven again, then checked again.
      s.status = 'lapsed';
      s.lapses += 1;
      s.L = Math.min(s.L, 0.5);
      s.R = k.RETAIN_PRIOR;
      s.proven_at = null;
      s.retained_at = null;
      s.retained_by = null;
    }
  }

  // Knowledge tracing.
  const yes = answer.correct ? 1 - k.SLIP : k.SLIP;
  const no = answer.correct ? g : 1 - g;
  const a = s.L * yes ** w;
  const b = (1 - s.L) * no ** w;
  s.L = a / (a + b);
  s.L += (1 - s.L) * k.LEARN * w;
  s.L = Math.max(0.001, Math.min(0.995, s.L));

  s.mass += w;
  if (answer.correct) s.right += w;
  // Aligned: a question written for this objective. A tagged answer counts
  // unless it is known to be the bank's question on the skill (`written`
  // false, set by answersFor when objective items are on).
  if (answer.correct && share.direct
    && ((answer.objective && answer.written !== false) || answer.role === 'check' || answer.role === 'game')) s.aligned += w;
  // A question written to test the objective (a probe or test-out) is not
  // teaching it; everything else at its own levels is.
  if (share.direct) { s.direct += 1; if (!answer.objectiveTest) s.taught = true; }
  s.answers += 1;
  if (w >= 0.5) {
    if (answer.correct) s.nc += 1; else s.nw += 1;
    // Spaced answers (a day or more after the last one on it): the forgetting
    // curve's ns / nsw terms (scorecard/forgetting.js, round 5).
    if (s.last_at !== null && t - s.last_at >= DAY) { if (answer.correct) s.ns = (s.ns || 0) + 1; else s.nsw = (s.nsw || 0) + 1; }
  }
  if (s.first_at === null) s.first_at = t;
  s.last_at = t;

  if ((s.status === 'unproven' || s.status === 'lapsed') && s.L >= k.PROVEN_AT && s.right >= k.MIN_RIGHT && s.mass >= k.MIN_MASS
    && s.aligned >= k.MIN_ALIGNED) {
    s.status = 'proven';
    s.proven_at = t;
    s.R = k.RETAIN_PRIOR;
    // Proven before any of its own teaching: they brought it with them. That
    // is a test-out, and what someone already knew is taken as kept.
    if (!s.taught && !s.lapses) {
      s.proven_by = 'test_out';
      s.status = 'retained';
      s.retained_at = t;
      s.retained_by = 'prior';
    } else {
      s.proven_by = 'practice';
    }
  }
  return s;
}

/** A state already proven by something outside the answers (a unit the placement or a test-out proved). */
function provenState(source, at, k = knobs()) {
  const s = blankState(k, 0.97);
  s.status = 'retained';
  s.proven_at = at;
  s.proven_by = `unit:${source}`;
  s.retained_at = at;
  s.retained_by = 'prior';
  s.R = Math.max(k.RETAIN_AT, k.RETAIN_PRIOR);
  return s;
}

/**
 * Every objective's state from a list of answers. The core both the app and the
 * simulation run.
 *
 * @param {object} model           modelFor()
 * @param {object[]} answers       [{t, correct, level, role, skill, choices, ms, coach, objective?}], any order
 * @param {object} [opts]
 * @param {object} [opts.provenBy] {objectiveIndex: {source, at}} proofs from outside the answers
 * @returns {object[]} one state per objective, in objective order
 */
function assess(model, answers, opts = {}) {
  const k = knobs();
  const states = model.objectives.map((_, i) => {
    const p = opts.provenBy && opts.provenBy[i];
    return p ? provenState(p.source, p.at, k) : blankState(k);
  });
  const sorted = answers.slice().sort((a, b) => a.t - b.t);
  for (const ans of sorted) {
    for (const share of attribute(model, ans)) fold(states[share.i], ans, share, k);
  }
  return states;
}

/**
 * The guarantee: is every objective proven (and, by default, retained)?
 * @returns {{complete, rule, total, counts, missing: string[], unretained: string[]}}
 */
function gate(model, states, rule = gateRule()) {
  const counts = { unproven: 0, proven: 0, retained: 0, lapsed: 0 };
  const missing = [];
  const unretained = [];
  states.forEach((s, i) => {
    counts[s.status] = (counts[s.status] || 0) + 1;
    const id = model.objectives[i].id;
    if (s.status === 'unproven' || s.status === 'lapsed') missing.push(id);
    else if (s.status === 'proven') unretained.push(id);
  });
  const blocking = rule === 'proven' ? missing : [...missing, ...unretained];
  return { complete: blocking.length === 0, rule, total: states.length, counts, missing, unretained, blocking };
}

// ── the app's side: reading a learner's evidence from the database ─────────

/** The learner's answered items in one enrollment's grade, as answers for assess(). */
function answersFor(userId, enrollment) {
  // eslint-disable-next-line global-require
  const db = require('../config/db');
  const sessions = new Map(db.find('sessions', (s) => s.user_id === userId
    && s.track_id === enrollment.track_id && s.grade_id === enrollment.grade_id).map((s) => [s.id, s]));
  // An answer set aside as too fast to count on a scored sitting (round 3,
  // ADAPT_EFFORT: it is never graded) is still read, as a rapid answer: fold()
  // counts it toward the learner's effort record and takes nothing from it.
  const rows = db.find('items', (i) => i.user_id === userId
    && ((i.correct !== null && i.correct !== undefined) || (i.reserved && Number(i.ms) > 0))
    && (sessions.has(i.session_id) || (i.session_id == null && i.track_id === enrollment.track_id && i.grade_id === enrollment.grade_id)));
  const out = [];
  for (const i of rows) {
    const s = sessions.get(i.session_id);
    // Placement is pitched past the learner on purpose and has its own model
    // (the unit plan), and a Challenge Exam asks about levels ahead.
    if (s && (s.kind === 'placement' || s.kind === 'skip')) continue;
    // A retention enforcer's "one more try" straight after the feedback is not a
    // retrieval from memory (retention-enforcer-params.json record_updates).
    if (i.requeue_of) continue;
    const at = Date.parse(i.answered_at || i.updated_at || i.created_at);
    out.push({
      t: Number.isFinite(at) ? at : 0,
      correct: !!i.correct,
      level: Number(i.level) || (s && s.level) || null,
      role: i.role || null,
      skill: i.skill_id || null,
      choices: Array.isArray(i.choices) ? i.choices.length : 0,
      ms: Number(i.ms) || 0,
      rapidMs: i.reserved ? Infinity : (answersFor.em || (answersFor.em = require('./effort-monitor'))).itemLine(i), // eslint-disable-line global-require
      coach: !!i.coach_used,
      objective: i.objective_id || null,
      objectiveTest: !!i.objective_test,
      // Was the question written for that objective (an objective item,
      // services/objective-items.js), or the bank's question on its skill with
      // the objective's tag? Only the first is "aligned" evidence toward a
      // proof (fold). Left undefined with OBJECTIVE_ITEMS=off, which reads a
      // tagged answer exactly as before.
      ...(i.objective_id && writtenRule() ? { written: !!(i.written_for_objective || i.source === 'objective_item') } : {}),
    });
  }
  // A spoken checkpoint a grown-up confirmed hearing (preschool and Kindergarten
  // "Explain Aloud" / "Oral Retell", services/essays.js oralSubmit): one light
  // yes/no answer at the checkpoint's level, on its skill. Its tap-to-answer
  // questions are ordinary items above. What the learner said is never stored,
  // so the learner's own "I said it" is not evidence at all.
  for (const e of db.find('essays', (x) => x.user_id === userId && x.track_id === enrollment.track_id
    && x.grade_id === enrollment.grade_id && Array.isArray(x.oral))) {
    for (const o of e.oral) {
      if (!o.parent_confirmed) continue;
      const at = Date.parse(o.at);
      out.push({
        t: Number.isFinite(at) ? at : 0, correct: true, level: Number(o.level) || e.level, role: 'attest', skill: o.skill || null,
        choices: 2, ms: 0, coach: false, attest: true, objective: null, objectiveTest: false,
      });
    }
  }
  return out;
}

/** Proofs the unit plan already holds: every objective in a known unit (services/learner-path.js). */
function unitProofs(model, enrollment) {
  // eslint-disable-next-line global-require
  const learnerPath = require('./learner-path');
  // eslint-disable-next-line global-require
  const unitPlacement = require('./unit-placement');
  const plan = learnerPath.planFor(enrollment);
  const units = plan ? unitPlacement.unitsFor(enrollment.track_id, enrollment.grade_id) : null;
  if (!plan || !units) return {};
  const out = {};
  for (const u of units) {
    const entry = plan.units[u.key];
    if (!entry || entry.status !== 'known') continue;
    const at = Date.parse(entry.at) || 0;
    model.objectives.forEach((o, i) => {
      if (o.lesson_level >= u.start && o.lesson_level <= u.end) out[i] = { source: entry.source || 'placement', at };
    });
  }
  return out;
}

/**
 * One learner's coverage of one enrollment's grade: the objectives with their
 * records, and the gate.
 */
function forEnrollment(userId, enrollment, { rule = gateRule() } = {}) {
  const model = modelFor(enrollment.track_id, enrollment.grade_id);
  if (!model || !model.objectives.length) return null;
  const states = assess(model, answersFor(userId, enrollment), { provenBy: unitProofs(model, enrollment) });
  return {
    version: VERSION,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    objectives: model.objectives.map((o, i) => ({ id: o.id, title: o.title, covers: o.covers, skill: o.skill, ...publicState(states[i]) })),
    gate: gate(model, states, rule),
    states,
    model,
  };
}

function publicState(s) {
  const iso = (t) => (t ? new Date(t).toISOString() : null);
  return {
    status: s.status,
    belief: Number(s.L.toFixed(3)),
    retention_belief: Number(s.R.toFixed(3)),
    answers: s.answers,
    evidence: Number(s.mass.toFixed(2)),
    proven_at: iso(s.proven_at),
    proven_by: s.proven_by,
    retained_at: iso(s.retained_at),
    retained_by: s.retained_by,
    memory_checks: s.checks,
    lapses: s.lapses,
    last_at: iso(s.last_at),
  };
}

/** The account the owner tests with: its jumps and skips leave no evidence, so the gate never holds it. */
function exempt(userId) {
  // eslint-disable-next-line global-require
  const owner = require('../config/owner');
  return owner.isOwner(owner.userOf(userId));
}

/**
 * Called where the Graduation exam is passed (services/mastery.js
 * clearCheckpoint). Records what the gate says on the enrollment
 * (`coverage_graduation`) and says whether to hold graduation: only with
 * COVERAGE_GATE=enforce, only when the gate is not met, and never for the
 * owner's test account. Never throws: a failure here must not stop a pass.
 *
 * @returns {{mode, block: boolean, summary: object}|null}
 */
function atGraduation(userId, enrollment) {
  const mode = gateMode();
  if (mode === 'off') return null;
  try {
    // eslint-disable-next-line global-require
    const db = require('../config/db');
    const report = forEnrollment(userId, enrollment);
    if (!report) return null;
    const g = report.gate;
    const summary = {
      mode,
      rule: g.rule,
      at: new Date().toISOString(),
      complete: g.complete,
      total: g.total,
      counts: g.counts,
      blocking: g.blocking.slice(0, 60),
      blocking_count: g.blocking.length,
    };
    const block = mode === 'enforce' && !g.complete && !exempt(userId);
    db.update('enrollments', enrollment.id, { coverage_graduation: { ...summary, held: block } });
    return { mode, block, summary };
  } catch (err) {
    console.warn(`coverage: graduation check failed: ${err.message}`);
    return null;
  }
}

module.exports = {
  VERSION,
  STATUSES,
  knobs,
  gateMode,
  gateRule,
  modelFor,
  objectivesFor,
  validate,
  attribute,
  guessOf,
  blankState,
  fold,
  provenState,
  assess,
  gate,
  answersFor,
  unitProofs,
  forEnrollment,
  publicState,
  atGraduation,
  cleanTitle,
  DAY,
};
