/**
 * Placement by skill (docs/SPEED-4X.md, round 2; SIMULATED effect): a short check of the skills left on this grade's path, so what is shown known never enters it.
 * Most advanced skill first, because a pass there can settle what it builds on.
 *
 *   SPEED_SKILL_PLACEMENT=on  offer the check on the path; levels whose skill is settled are stepped over (never a checkpoint, a unit check or the grade's last level).
 *   SPEED_IMPLIED=on          a skill shown known also settles what it builds on, unasked, and every SPEED_SAMPLE_EVERY'th (3) is asked to catch a wrong inference. A miss revokes
 *                             everything that came from the same pass. A later miss on an implied skill puts it back on the learner's list.
 *   SPEED_EDGE=on             each question is pitched where it tells most about this learner, from the bank's difficulty scale.
 *
 * The graph: a course's own stated prerequisites when it has them (grade.prerequisites: { skill: [skills] }). The built-in grades state none today, so there the previous skill in
 * the grade's order stands in for it: an inference, which is why sampling and revoking exist. Uploaded courses have a real graph and their own placement (services/material-path.js).
 *
 * The learner is told: the path lists what was settled, each with a way in, and nothing is removed from the course. State lives on the enrollment row (exported and deleted with the account).
 * Answers use kind 'placement', so they feed the scorecard no more than any placement does. The Spanish track is left out (its path has its own goal fit).
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const bank = require('../content/bank');
const speed = require('./speed-levers');

const enabledFor = (userId, lever) => require('./efficiency').forLearner(userId, () => { // eslint-disable-line global-require
  if (String(process.env.SPEED_ALL || '').toLowerCase() === 'off') return false;
  if (require('./efficiency').isSuspended()) return false; // eslint-disable-line global-require
  return String(process.env[lever] || 'off').toLowerCase() === 'on';
});
const on = (userId) => enabledFor(userId, 'SPEED_SKILL_PLACEMENT');

/** The skills still ahead on this grade's path, in the grade's order. */
function skillsAhead(enrollment, grade) {
  const seen = new Set();
  const out = [];
  for (let l = enrollment.current_level; l <= grade.pathLength; l++) {
    if (curriculum.isCheckpoint(curriculum.levelKind(l, grade.pathLength, grade))) continue;
    const { focus } = curriculum.levelPlan(grade, l);
    if (focus && !seen.has(focus)) { seen.add(focus); out.push({ skill: focus, level: l }); }
  }
  return out;
}
/** Index-based edges over the skills ahead. Stated prerequisites if the grade has them, else the previous skill in order. */
function prereqFn(grade, rows) {
  const at = new Map(rows.map((r, i) => [r.skill, i]));
  const stated = grade.prerequisites || null;
  return (i) => {
    if (stated) return (stated[rows[i].skill] || []).map((s) => at.get(s)).filter((x) => x !== undefined);
    return i > 0 ? [i - 1] : [];
  };
}
/** Bank difficulty for an item at the edge: b is where the assumed curve is centred on understanding; the scale is the bank's 1 to 10 around the level's own. */
function difficultyFor(base, item) { return item ? Math.max(1, Math.min(10, base + (item.b - 0.6) * 6)) : base; }

function stateOf(session) { return (session.speed_place || {}).rows || []; }
function hydrate(userId, rows) { return rows.map((r) => ({ ...r, tr: speed.trackerFor(userId, r.skill) })); }
function freeze(rows) { return rows.map(({ tr, ...r }) => r); } // eslint-disable-line no-unused-vars

function nextItem({ userId, session, enrollment, grade, rows }) {
  const hyd = hydrate(userId, rows);
  const i = speed.placementNext(hyd);
  if (i === null) return null;
  const row = rows[i];
  const plan = curriculum.levelPlan(grade, row.level);
  const item = enabledFor(userId, 'SPEED_EDGE') ? speed.bestItem(hyd[i].tr) : null;
  const entry = require('../config/grade-skills').fitEntry(grade, { skillId: row.skill, difficulty: difficultyFor(plan.difficulty, item), role: 'drill' }); // eslint-disable-line global-require
  const avoid = new Set(db.find('items', (x) => x.user_id === userId).slice(-600).map((x) => bank.itemKey(x)));
  const q = require('./sessions').generateWithPreference(entry, false, avoid); // eslint-disable-line global-require
  const count = db.find('items', (x) => x.session_id === session.id).length;
  return db.insert('items', { ...q, session_id: session.id, user_id: userId, skill_id: q.skill_id || row.skill, role: 'drill', level: row.level, block: 0, index: count, place_item: item || null, user_answer: null, correct: null, ms: null, coach_used: false });
}

/** Opens the check, or the one already open. { session, item }; { error } when it does not apply. */
function start(userId, enrollment, grade) {
  if (!on(userId)) return { error: 'Not available.', status: 404 };
  if (enrollment.track_id === 'spanish') return { error: 'Not available on this course.', status: 400 };
  if (enrollment.speed_placement && enrollment.speed_placement.finished_at) return { error: 'You have already done this check.', status: 409 };
  const open = db.findOne('sessions', (s) => s.user_id === userId && s.enrollment_id === enrollment.id && s.speed_place && !s.ended_at);
  if (open) {
    const item = db.find('items', (x) => x.session_id === open.id && x.correct === null && !x.skipped).sort((a, b) => a.index - b.index)[0];
    if (item) return { session: open, item };
  }
  const rows = skillsAhead(enrollment, grade).map((r) => ({ ...r, status: 'open', asked: 0 }));
  if (!rows.length) return { error: 'Nothing left to check here.', status: 400 };
  const session = db.insert('sessions', {
    user_id: userId, enrollment_id: enrollment.id, track_id: enrollment.track_id, grade_id: enrollment.grade_id, level: enrollment.current_level, start_level: enrollment.current_level, end_level: enrollment.current_level, levels: [enrollment.current_level],
    blocks: [{ index: 0, level: enrollment.current_level, kind: 'drill', resolved: false }], kind: 'placement', speed_place: { rows }, params: { itemCount: rows.length }, started_at: new Date().toISOString(), ended_at: null, score: null, analysis: null, xp_awarded: 0,
  });
  return { session, item: nextItem({ userId, session, enrollment, grade, rows }) };
}

/** Saves the outcome on the enrollment and moves the learner past settled levels. */
function finish({ userId, session, enrollment, grade, rows }) {
  const fresh = db.byId('enrollments', enrollment.id);
  const known = rows.filter((r) => r.status === 'known').map((r) => r.skill);
  const implied = rows.filter((r) => r.status === 'implied').map((r) => r.skill);
  db.update('enrollments', fresh.id, { speed_placement: { known, implied, revisit: [], finished_at: new Date().toISOString(), asked: rows.reduce((s, r) => s + (r.asked || 0), 0) } });
  db.update('sessions', session.id, { ended_at: new Date().toISOString(), speed_place: { rows } });
  const after = db.byId('enrollments', fresh.id);
  const to = stepOverSettled(after, grade, after.current_level);
  if (to !== after.current_level) require('./mastery').moveTo(after, grade, to); // eslint-disable-line global-require
  return { known, implied, next_level: db.byId('enrollments', fresh.id).current_level };
}

/** After an answer: settles what it can, then the next question or the outcome. */
function afterAnswer({ userId, session, enrollment, grade, item, correct }) {
  const rows = stateOf(session);
  const hyd = hydrate(userId, rows);
  const i = rows.findIndex((r) => r.skill === item.skill_id || r.level === item.level);
  if (i >= 0) {
    const useImplied = enabledFor(userId, 'SPEED_IMPLIED');
    speed.placementAnswer(hyd, i, correct, prereqFn(grade, rows), { useImplied, missEnds: !item.place_item });
  }
  const nextRows = freeze(hyd);
  db.update('sessions', session.id, { speed_place: { rows: nextRows } });
  const fresh = db.byId('sessions', session.id);
  const nextQ = nextItem({ userId, session: fresh, enrollment, grade, rows: nextRows });
  if (nextQ) return { next: nextQ };
  return { done: finish({ userId, session: fresh, enrollment, grade, rows: nextRows }) };
}

/**
 * Where the path goes from `next`: past levels whose skill is settled. Never a checkpoint, never the grade's last level.
 * Reads only enrollment.speed_placement, so a learner who never took the check is untouched whatever the switches say.
 */
function stepOverSettled(enrollment, grade, next) {
  const p = enrollment && enrollment.speed_placement;
  if (!p || !p.finished_at) return next;
  const settled = new Set([...(p.known || []), ...(p.implied || [])]);
  const again = new Set(p.revisit || []);
  let at = next;
  for (let guard = 0; guard < grade.pathLength && at < grade.pathLength; guard++) {
    const kind = curriculum.levelKind(at, grade.pathLength, grade);
    if (kind !== 'lesson' && kind !== 'practice') break;
    const { focus } = curriculum.levelPlan(grade, at);
    if (!settled.has(focus) || again.has(focus)) break;
    at++;
  }
  return at;
}

/** A later miss on an implied skill: not known after all. It goes on the learner's list to revisit, and the path stops stepping over it. */
function noteAnswer(userId, item, correct) {
  if (correct || !item || !item.skill_id) return false;
  const session = db.byId('sessions', item.session_id);
  if (!session || !session.enrollment_id || session.speed_place) return false;
  const e = db.byId('enrollments', session.enrollment_id);
  const p = e && e.speed_placement;
  if (!p || !(p.implied || []).includes(item.skill_id) || (p.revisit || []).includes(item.skill_id)) return false;
  db.update('enrollments', e.id, { speed_placement: { ...p, implied: p.implied.filter((s) => s !== item.skill_id), revisit: [...(p.revisit || []), item.skill_id] } });
  return true;
}

/** What the path shows. Empty with the switch off and no check taken. */
function pathView(userId, enrollment, grade) {
  const p = enrollment.speed_placement;
  const view = {};
  if (on(userId) && !(p && p.finished_at) && enrollment.track_id !== 'spanish') view.speed_skill_check = true;
  if (p && p.finished_at) {
    const levelOf = (skill) => { for (let l = 1; l <= grade.pathLength; l++) if (curriculum.levelPlan(grade, l).focus === skill) return l; return null; };
    const row = (skill) => ({ skill, name: curriculum.skillName(skill), level: levelOf(skill) });
    view.speed_settled = { known: (p.known || []).map(row), implied: (p.implied || []).map(row), revisit: (p.revisit || []).map(row) };
  }
  return view;
}

module.exports = { on, start, afterAnswer, finish, stepOverSettled, noteAnswer, pathView, skillsAhead, prereqFn, difficultyFor };
