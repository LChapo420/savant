/**
 * Catch-up for the subjects that have a unit bank (content/unit-placement/<track>.json):
 * math, english and reading. Spanish keeps its own adapter (services/spanish/catch-up.js);
 * both run on the shared state machine in services/catchup-engine.js.
 *
 * "Catch me up to grade N": the skills are the units of the grades below the target
 * (the lowest `lookback` grades under it, default 2, so a check is minutes, not hours;
 * pass a larger lookback for a deeper sweep). Each unit is probed with its own
 * bank questions, up to three, and decided by the shared belief. Each gap becomes
 * one block: that unit's levels (start..end) on the grade's enrollment, played in the
 * subject's normal lesson player. When a block is done its spaced reviews are dated
 * (REVIEW_DAYS, an expanding schedule; its mechanism id is mapped in docs/CATCHUP-PROOF.md, C4);
 * after the last block comes the mixed re-check.
 *
 * A subject is `ready` only if every grade below the target has a complete unit bank
 * with at least MIN_QUESTIONS per unit. Nothing else is claimed.
 *
 * One row per learner, track and target grade in `catchup_units`.
 */
const crypto = require('crypto');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const unitPlacement = require('./unit-placement');
const { createEngine, UNDECIDED } = require('./catchup-engine');

const COLL = 'catchup_units';
const VERSION = 1;
const TRACKS = ['math', 'english', 'reading'];
// A skill whose bank has TOLERANT_BANK or more questions gets the slip-tolerant check: a first miss never sends it to
// learn (a learner who knows a skill still slips, about 3% of answers in the sim), it is asked again, up to 5 questions
// for the check and 2 fresh ones for the re-check. A skill with a smaller bank (at least MIN_QUESTIONS) keeps the plain
// check: up to 3 questions, one miss decides. Banks are being extended to TOLERANT_BANK unit by unit
// (docs/CATCHUP-PROOF.md, scripts/content-gap-tools.js), so the tolerant share grows with the content, never ahead of it.
const MAX_PER_SKILL = 5;
const PLAIN_MAX_PER_SKILL = 3;
const MIN_ANSWERS_TO_LEARN = 2;
const TOLERANT_BANK = MAX_PER_SKILL + 2;
const MIN_QUESTIONS = PLAIN_MAX_PER_SKILL + 2;
const tolerant = (skill) => !!skill && questionsFor(skill).length >= TOLERANT_BANK;
const MASTERY = 0.75;
const RECHECK_PER_SKILL = 2;
const RECHECK_KNOWN_SAMPLE = 4;
const DEFAULT_LOOKBACK = 2;
/** Days after a block is done at which its skill comes back for a retrieval review. */
const REVIEW_DAYS = [1, 3, 7, 21];
const MIN_PER_LEVEL = 5;

const hashOf = (s) => crypto.createHash('sha256').update(String(s)).digest().readUInt32LE(0);
const ordered = (qid, choices) => [...choices].sort((a, b) => hashOf(`${qid}|${a}`) - hashOf(`${qid}|${b}`));

function gradeIds(trackId) { return ((curriculum.getTrack(trackId) || {}).grades || []).map((g) => g.id); }
function gradeNo(trackId, gradeId) { return gradeIds(trackId).indexOf(gradeId) + 1; }
function gradeLabel(trackId, gradeId) { const g = curriculum.getGrade(trackId, gradeId); return `Grade ${gradeNo(trackId, gradeId)}${g ? `: ${g.name}` : ''}`; }

/** The grades the catch-up looks at: the `lookback` grades just under the target, lowest first. */
function gradesBelow(trackId, targetGradeId, lookback = DEFAULT_LOOKBACK) {
  const ids = gradeIds(trackId);
  const at = ids.indexOf(targetGradeId);
  return at > 0 ? ids.slice(Math.max(0, at - lookback), at) : [];
}

const skillCache = new Map();
function skillsOfGrade(trackId, gradeId) {
  const ck = `${trackId}|${gradeId}`;
  if (skillCache.has(ck)) return skillCache.get(ck);
  const units = unitPlacement.unitsFor(trackId, gradeId) || [];
  const grade = curriculum.getGrade(trackId, gradeId);
  const out = units.map((u, i) => {
    const levels = [];
    for (let l = u.start; l <= u.end; l++) levels.push(l);
    const minutes = levels.reduce((n, l) => { const r = grade && grade.levels.find((x) => x.level === l); return n + (Number(r && r.minutes) || MIN_PER_LEVEL); }, 0);
    return { key: `${gradeId}|${i + 1}`, track_id: trackId, grade_id: gradeId, unit: i + 1, title: (u.titles && u.titles[0]) || `Unit ${i + 1}`, goal: (u.titles || []).join('; '), levels, minutes };
  });
  skillCache.set(ck, out);
  return out;
}

function skillByKey(trackId, key) {
  const gradeId = String(key).split('|')[0];
  return skillsOfGrade(trackId, gradeId).find((s) => s.key === key) || null;
}

const qCache = new Map();
function questionsFor(skill) {
  if (qCache.has(skill.key + skill.track_id)) return qCache.get(skill.key + skill.track_id);
  const unit = (unitPlacement.unitsFor(skill.track_id, skill.grade_id) || [])[skill.unit - 1];
  const out = ((unit && unit.questions) || [])
    .filter((q) => Array.isArray(q.choices) && q.choices.length >= 3 && q.choices.includes(q.answer))
    .map((q, i) => ({ qid: `u:${skill.key}:${i}`, key: skill.key, source: 'unit-bank', prompt: q.prompt, choices: ordered(`${skill.key}:${i}`, q.choices), answer: q.answer }));
  qCache.set(skill.key + skill.track_id, out);
  return out;
}

/** Is the subject ready to be caught up to this grade? What exactly is missing if not. */
function readiness(trackId, targetGradeId, lookback = DEFAULT_LOOKBACK) {
  if (!TRACKS.includes(trackId)) return { ready: false, missing: ['no unit bank for this subject (content/unit-placement)'] };
  const grades = gradesBelow(trackId, targetGradeId, lookback);
  if (!grades.length) return { ready: false, missing: ['no grade below the target'] };
  const missing = [];
  for (const g of grades) {
    const skills = skillsOfGrade(trackId, g);
    if (!skills.length) { missing.push(`${g}: no unit bank`); continue; }
    for (const s of skills) if (questionsFor(s).length < MIN_QUESTIONS) missing.push(`${s.key}: ${questionsFor(s).length} questions`);
  }
  return { ready: !missing.length, missing, grades, skills: grades.reduce((n, g) => n + skillsOfGrade(trackId, g).length, 0) };
}

/** Each track's overall readiness, for docs and the subject pages. */
function subjectsReport() {
  return curriculum.TRACKS.map((t) => {
    const id = t.id;
    const bank = TRACKS.includes(id) && unitPlacement.bankFor(id);
    const gs = gradeIds(id);
    const withBank = bank ? gs.filter((g) => unitPlacement.available(id, g)).length : 0;
    return { track_id: id, grades: gs.length, grades_with_unit_bank: withBank, engine: id === 'spanish' ? 'spanish adapter' : bank ? 'unit-bank adapter' : null, ready: id === 'spanish' || (withBank === gs.length && gs.length > 0) };
  });
}

// ── the engine on this adapter ─────────────────────────────────────────────

function engineFor(trackId) {
  return createEngine({
    gradeOrder: () => gradeIds(trackId),
    skillByKey: (k) => skillByKey(trackId, k),
    questionsFor,
    maxPerSkill: (skill) => (tolerant(skill) ? MAX_PER_SKILL : PLAIN_MAX_PER_SKILL),
    minAnswersToLearn: (skill) => (tolerant(skill) ? MIN_ANSWERS_TO_LEARN : 1),
    mastery: MASTERY,
    recheckPerSkill: RECHECK_PER_SKILL,
    recheckKnownSample: RECHECK_KNOWN_SAMPLE,
  });
}

function rowFor(userId, trackId, targetGradeId) {
  return db.findOne(COLL, (r) => r.user_id === userId && r.track_id === trackId && r.target_grade_id === targetGradeId && r.version === VERSION) || null;
}
const save = (state) => db.update(COLL, state.id, state);
const questionById = (trackId, key, qid) => { const s = skillByKey(trackId, key); return s ? questionsFor(s).find((q) => q.qid === qid) || null : null; };

/** Begin (or return) the learner's catch-up to a grade. */
function start(userId, trackId, targetGradeId, { lookback = DEFAULT_LOOKBACK, now = Date.now() } = {}) {
  const ready = readiness(trackId, targetGradeId, lookback);
  if (!ready.ready) return { error: `Catch-up is not ready for this subject: ${ready.missing[0]}`, status: 409, missing: ready.missing };
  const existing = rowFor(userId, trackId, targetGradeId);
  if (existing) return { state: existing };
  const eng = engineFor(trackId);
  const skills = ready.grades.flatMap((g) => skillsOfGrade(trackId, g)).map((s) => ({ key: s.key, grade_id: s.grade_id }));
  const state = eng.newState(skills, now, { user_id: userId, track_id: trackId, target_grade_id: targetGradeId, version: VERSION, lookback, blocks_reviews: [], created_at: new Date(now).toISOString() });
  const row = db.insert(COLL, state);
  eng.begin(row, now);
  save(row);
  return { state: row, created: true };
}

function answer(userId, trackId, targetGradeId, given, now = Date.now()) {
  const state = rowFor(userId, trackId, targetGradeId);
  if (!state) return { error: 'No catch-up is running.', status: 404 };
  const eng = engineFor(trackId);
  const ok = (q) => !!q && String(given.answer == null ? '' : given.answer).normalize('NFC').trim() === q.answer;
  if (state.phase === 'check') {
    const cur = state.check.current;
    if (!cur || cur.key !== given.key || cur.qid !== given.qid) return { error: 'That is not the question being asked.', status: 409, stale: true };
    const q = questionById(trackId, cur.key, cur.qid);
    const correct = ok(q);
    eng.recordCheck(state, cur, correct, q ? q.choices.length : 4, now);
    save(state);
    return { correct, state };
  }
  if (state.phase === 'recheck' && state.recheck) {
    const item = state.recheck.items[state.recheck.answers.length];
    if (!item || item.key !== given.key || item.qid !== given.qid) return { error: 'That is not the question being asked.', status: 409, stale: true };
    const correct = ok(questionById(trackId, item.key, item.qid));
    eng.recordRecheck(state, item, correct, now);
    save(state);
    return { correct, state };
  }
  return { error: 'Nothing is being asked now.', status: 409 };
}

/** The block under way, its enrollment on the skill's grade (made if needed) and the next level. */
function nextLevel(userId, trackId, targetGradeId, now = Date.now()) {
  const state = rowFor(userId, trackId, targetGradeId);
  if (!state || state.phase !== 'route') return { error: 'There is no catch-up block to play now.', status: 409 };
  const pos = engineFor(trackId).position(state);
  if (!pos.block) return { error: 'Every block is done.', status: 409 };
  const skill = skillByKey(trackId, pos.block.key);
  let e = db.findOne('enrollments', (x) => x.user_id === userId && x.track_id === trackId && x.grade_id === skill.grade_id);
  if (!e) {
    const g = curriculum.getGrade(trackId, skill.grade_id);
    e = db.insert('enrollments', { user_id: userId, track_id: trackId, grade_id: skill.grade_id, target_level: g.pathLength, current_level: 1, level_items: 0, levels_completed: 0, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date(now).toISOString(), placed_by: 'catch_up' });
  }
  if (!pos.block.started_at) pos.block.started_at = new Date(now).toISOString();
  pos.block.enrollment_id = e.id;
  save(state);
  return { enrollment_id: e.id, level: pos.level, k: pos.k, n: pos.n, skill: skill.title, grade: gradeLabel(trackId, skill.grade_id) };
}

/** May the learner open this level? Yes when it is in a catch-up block (math/english/reading) not yet done. */
function allowsLevel(userId, enrollment, level) {
  if (!enrollment || !TRACKS.includes(enrollment.track_id)) return false;
  return db.find(COLL, (r) => r.user_id === userId && r.track_id === enrollment.track_id && r.phase === 'route' && r.version === VERSION)
    .some((r) => r.blocks.some((b) => b.status !== 'done' && b.key.split('|')[0] === enrollment.grade_id && b.levels.includes(Number(level))));
}

/** The subject's player passed a level. Ticks it in the block it belongs to; a finished block dates its reviews. */
function onLevelPassed({ userId, trackId, gradeId, level, now = Date.now() }) {
  const rows = db.find(COLL, (r) => r.user_id === userId && r.track_id === trackId && r.phase === 'route' && r.version === VERSION);
  for (const state of rows) {
    const b = state.blocks.find((x) => x.status !== 'done' && x.key.split('|')[0] === gradeId && x.levels.includes(Number(level)));
    if (!b) continue;
    const eng = engineFor(trackId);
    const { blockDone } = eng.levelPassed(b, level, now);
    if (blockDone) b.reviews = REVIEW_DAYS.map((d) => ({ due_at: new Date(now + d * 86400000).toISOString(), done: false }));
    eng.afterBlock(state, now);
    save(state);
    return { block_done: blockDone, phase: state.phase, k: state.blocks.indexOf(b) + 1, n: state.blocks.length };
  }
  return null;
}

/** The catch-up for a page: target, what was found missing, progress, next review due. */
function view(userId, trackId, targetGradeId, now = Date.now()) {
  const ready = readiness(trackId, targetGradeId);
  const base = { track_id: trackId, target: { grade_id: targetGradeId, label: gradeLabel(trackId, targetGradeId) }, ready: ready.ready, missing: ready.missing || [] };
  const state = rowFor(userId, trackId, targetGradeId);
  if (!state) return { ...base, phase: 'not_started', estimate: { skills: ready.skills || 0, max_questions: (ready.skills || 0) * MAX_PER_SKILL } };
  const eng = engineFor(trackId);
  const pos = eng.position(state);
  const skills = state.skills.map((sk) => { const s = skillByKey(trackId, sk.key); return { key: sk.key, title: s.title, grade: gradeLabel(trackId, sk.grade_id), status: sk.status, unchecked: !!sk.unchecked }; });
  const due = state.blocks.flatMap((b) => (b.reviews || []).filter((r) => !r.done).map((r) => r.due_at)).sort();
  const q = (key, qid, index, total) => { const x = questionById(trackId, key, qid); return x ? { key, qid, prompt: x.prompt, choices: x.choices, skill: skillByKey(trackId, key).title, index, total } : null; };
  const out = {
    ...base,
    phase: state.phase,
    skills,
    counts: { skills: skills.length, known: skills.filter((s) => s.status === 'known').length, missing: skills.filter((s) => s.status === 'learn').length, open: skills.filter((s) => UNDECIDED.includes(s.status)).length, asked: state.check.asked.length },
    route: {
      k: pos.k, n: pos.n,
      blocks: state.blocks.map((b, i) => { const s = skillByKey(trackId, b.key); return { k: i + 1, key: b.key, title: s.title, minutes: s.minutes, status: b.status, levels: b.levels.length, levels_done: b.done.length }; }),
      minutes_left: eng.openBlocks(state).reduce((n, b) => n + skillByKey(trackId, b.key).minutes, 0),
    },
    next_review_due_at: due[0] || null,
    rechecks: (state.rechecks || []).map((r) => ({ round: r.round, ...r.result })),
  };
  if (state.phase === 'check' && state.check.current) out.question = q(state.check.current.key, state.check.current.qid, state.check.asked.length + 1, null);
  if (state.phase === 'recheck' && state.recheck) {
    const r = state.recheck; const item = r.items[r.answers.length];
    out.recheck = { round: r.round, total: r.items.length, answered: r.answers.length, question: item ? q(item.key, item.qid, r.answers.length + 1, r.items.length) : null };
  }
  return out;
}

module.exports = { TRACKS, VERSION, MAX_PER_SKILL, PLAIN_MAX_PER_SKILL, MIN_ANSWERS_TO_LEARN, TOLERANT_BANK, MIN_QUESTIONS, tolerant, MASTERY, REVIEW_DAYS, gradesBelow, skillsOfGrade, skillByKey, questionsFor, readiness, subjectsReport, allowsLevel, start, answer, nextLevel, onLevelPassed, view, engineFor };
