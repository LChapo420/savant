/**
 * The practice-dose plan for chess, piano and basketball (staged patch
 * skills-round3/04-practice-dose; SKILL_DOSE=on, needs SKILL_RECORD=on and
 * patch 01; its drills are patch 02's checks played warm, so it needs 02 for
 * anything but logged sets).
 *
 * Each day's practice comes from services/skill-adaptation.js planSession on
 * the learner's own skill record. It decides HOW MUCH and WHEN, never WHAT:
 *   - the session's sets go to the stage's unproven metrics by their distance
 *     from target on the learner's recent warm sets; every unproven metric
 *     gets at least one (checkPlan proves none is dropped);
 *   - the maintenance share (round 3): proven metrics that have not had their
 *     over-learning dose (twice the sets it took to prove them) keep the share
 *     even practice would give them, so a proven skill is not left to fade
 *     while the others catch up (round 2 kept less at 30 days without it);
 *   - a cold stage test is called when the last three warm sets were at the
 *     target, or every 5 days (patch 02 shows it on the stage check);
 *   - retention and re-sit tests when due.
 * Warm sets never prove anything: they make the next sitting warm for 20
 * hours and tell the plan when a cold test is worth sitting.
 *
 * A set is the metric's own check played warm with feedback: 5 questions, one
 * piano part, or one logged basketball set, judged against the same bar. A
 * metric whose check is not built yet (games, play-outs) is practised where
 * the app has it and logged by the learner: a self-report, so it only times
 * the next cold test.
 */
'use strict';

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const record = require('./skill-record');
const sa = require('./skill-adaptation');
const sc = require('./skill-coverage');

const ITEMS_PER_SET = 5;
const DAY = sc.DAY;

function enabled() {
  return record.enabled() && String(process.env.SKILL_DOSE || 'off').toLowerCase() === 'on';
}

function checksPart() {
  try {
    // eslint-disable-next-line global-require
    return { checks: require('./skill-checks'), content: require('../content/skill-stage-checks') };
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

/** Minutes of a session: the stage's own range, its middle. */
function sessionMinutes(stage) {
  const m = /(\d+)\s*-\s*(\d+)/.exec(String(stage.session_minutes || ''));
  return m ? Math.round((Number(m[1]) + Number(m[2])) / 2) : 30;
}

function atFinal(enrollment) {
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const final = grade && (grade.levels.find((l) => l.kind === 'graduation') || {}).level;
  return !!final && enrollment.current_level >= final;
}

const dayOf = (t) => Math.floor(t / DAY);

/** Where a metric is practised and how a set is judged. */
function drillFor(metricId, part) {
  const def = part ? part.content.checkFor(metricId) : { how: 'not_wired' };
  if (def.how === 'items') return { how: 'items', says: def.says, set: `${ITEMS_PER_SET} questions with the answer after each` };
  if (def.how === 'take') return { how: 'take', says: def.says, set: 'one part, played warm' };
  if (def.how === 'count') return { how: 'count', says: def.says, set: 'one logged set, judged against the bar', fields: def.fields.map(([name, label, min, max]) => ({ name, label, min, max })), hands: !!def.hands };
  if (def.how === 'puzzles') return { how: 'log', says: def.says, set: 'rated puzzles in the trainer, then log the set', href: '/engine/chess/puzzles.html' };
  const chess = /^CH/.test(metricId);
  return { how: 'log', says: def.needs ? `Not checkable in the app yet (${def.needs}).` : null, set: 'practise it, then log the set', href: chess ? (/game|hung/.test(metricId) ? '/engine/chess/spar.html' : '/engine/chess/drills.html') : null };
}

/**
 * Today's plan for an enrollment's stage. Fixed for the day once made (kept on
 * the enrollment), so the sets done today count down against it.
 */
function planFor(userId, enrollment, now = Date.now()) {
  const stage = record.stageFor(enrollment.track_id, enrollment.grade_id);
  if (!stage) return null;
  const today = dayOf(now);
  let cached = enrollment.skill_practice_plan;
  if (!cached || cached.day !== today || cached.stage !== stage.id) {
    const rec = record.recordFor(userId, enrollment.track_id);
    const minutes = sessionMinutes(stage);
    const knowledgeOpen = !atFinal(enrollment);
    const plan = sa.planSession({ stage, rec, now, minutes, knowledgeOpen, lessonShare: 0.3 });
    const problems = sa.checkPlan(stage, rec, plan);
    cached = { day: today, stage: stage.id, made_at: new Date(now).toISOString(), minutes, knowledge_open: knowledgeOpen, plan, problems };
    db.update('enrollments', enrollment.id, { skill_practice_plan: cached });
  }
  const part = checksPart();
  const rows = db.find(record.COLLECTION, (r) => r.user_id === userId && r.subject === enrollment.track_id);
  const doneToday = (id) => {
    const r = rows.find((x) => x.metric_id === id);
    return r ? (r.warm || []).filter((w) => dayOf(w.at) === today).length : 0;
  };
  const metric = (id) => stage.metrics.find((m) => m.id === id);
  const title = (name) => (part && part.content.titleOf ? part.content.titleOf(name) : name.replace(/_/g, ' '));
  const practice = cached.plan.practice.map((p) => {
    const done = doneToday(p.metric);
    return { ...p, name: metric(p.metric).metric, title: title(metric(p.metric).metric), test: metric(p.metric).test, done: Math.min(done, p.sets), left: Math.max(0, p.sets - done), drill: drillFor(p.metric, part), open: !!((rows.find((x) => x.metric_id === p.metric) || {}).practice_open) };
  });
  return {
    stage: { id: stage.id, name: stage.name },
    minutes: cached.minutes,
    knowledge_open: cached.knowledge_open,
    lesson_minutes: cached.plan.lesson_minutes,
    set_minutes: sa.knobs().SET_MIN,
    sittings: cached.plan.sittings.map((s) => ({ ...s, name: metric(s.metric).metric, title: title(metric(s.metric).metric) })),
    practice,
    reasons: cached.plan.reasons,
    problems: cached.problems,
    sets: practice.reduce((a, p) => a + p.sets, 0),
    left: practice.reduce((a, p) => a + p.left, 0),
    checks_applied: !!part,
  };
}

/** The cold tests today's plan calls (read by patch 02 for the stage check). */
function scheduledTests(userId, enrollment, now = Date.now()) {
  const p = planFor(userId, db.byId('enrollments', enrollment.id) || enrollment, now);
  return p ? p.sittings.map((s) => s.metric) : [];
}

function planned(userId, enrollment, metricId, now) {
  const p = planFor(userId, enrollment, now);
  return p && p.practice.find((x) => x.metric === metricId);
}

/** Start a warm set of a metric's own check (items or one piano part). */
function startSet(userId, enrollment, metricId, now = Date.now()) {
  const part = checksPart();
  const entry = planned(userId, enrollment, metricId, now);
  if (!entry) return { status: 404, error: 'That is not in today\'s practice.' };
  if (!part) return { status: 409, error: 'The practice drills come with the stage checks (patch 02); log the set instead.' };
  const def = part.content.checkFor(metricId);
  const row = record.ensureRow(userId, enrollment.track_id, metricId);
  if (row.practice_open && now - row.practice_open.started_at < 3 * 3600 * 1000) return { set: forPage(row.practice_open), resumed: true };
  const seed = (userId * 104729 + now) >>> 0;
  let a = seed;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let open;
  if (def.how === 'items') {
    const small = { ...def, count: Math.min(ITEMS_PER_SET, def.count), mates: def.mates ? Math.min(3, def.mates) : def.mates };
    const items = part.checks.BUILDERS[def.build](small, rnd, `p:${userId}:${metricId}:${now}`).slice(0, ITEMS_PER_SET);
    open = { how: 'items', metric_id: metricId, started_at: now, items, answers: items.map(() => null) };
  } else if (def.how === 'take') {
    const parts = part.checks.takeParts(def, rnd, userId).slice(0, 1);
    if (!parts.length) return { status: 409, error: 'Nothing to play for this one yet.' };
    open = { how: 'take', metric_id: metricId, started_at: now, parts, takes: [[]] };
  } else {
    return { status: 400, error: 'This one is logged, not played here.' };
  }
  db.update(record.COLLECTION, row.id, { practice_open: open });
  return { set: forPage(open), resumed: false };
}

function forPage(open) {
  const part = checksPart();
  if (open.how === 'items') return { metric: open.metric_id, how: 'items', items: part.checks.itemsForPage(open.items), answered: open.answers.map((x) => x !== null) };
  return { metric: open.metric_id, how: 'take', parts: open.parts.map((p, i) => ({ index: i, label: p.label, tempo: p.tempo, hands: p.hands || null, names: p.names || null, chords: p.chords || null, any_key: !!p.any_key, count_in: p.count_in || 4, target: p.chords ? null : (p.target || []).map((t) => ({ midi: t.midi, beat: t.beat })) })) };
}

/** One answer in a warm items set: marked straight away, with the answer. */
function answerSet(userId, enrollment, metricId, { index, answer, source }) {
  const part = checksPart();
  const row = record.rowFor(userId, enrollment.track_id, metricId);
  if (!part || !row || !row.practice_open || row.practice_open.how !== 'items') return { status: 404, error: 'No practice set is open.' };
  const open = row.practice_open;
  const i = Number(index);
  if (!Number.isInteger(i) || !open.items[i]) return { status: 400, error: 'No such question.' };
  if (open.answers[i] !== null) return { status: 409, error: 'Already answered.' };
  const graded = part.checks.gradeItem(open.items[i], answer);
  const key = open.items[i].key;
  const shown = key.answer || (key.accepts && key.accepts[0]) || (key.set && key.set.join(' ')) || (key.type === 'mate_or_none' ? (key.mate ? 'a mate exists' : 'no mate') : null) || (key.notes ? key.notes.map((m) => require('../public/engine/piano/piano-core').midiToName(m)).join(' ') : null) || (key.type === 'midi' ? 'middle C' : key.type === 'pc' ? `any ${['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][key.pc]}` : null);
  const answers = open.answers.map((x, k) => (k === i ? { ...graded, source: source || null } : x));
  db.update(record.COLLECTION, row.id, { practice_open: { ...open, answers } });
  return { correct: graded.correct, answer: shown, key_midi: key.type === 'midi' ? key.midi : null, key_pc: key.type === 'pc' ? key.pc : null };
}

function takeSet(userId, enrollment, metricId, { part: idx, played, origin }) {
  const part = checksPart();
  const row = record.rowFor(userId, enrollment.track_id, metricId);
  if (!part || !row || !row.practice_open || row.practice_open.how !== 'take') return { status: 404, error: 'No practice set is open.' };
  const open = row.practice_open;
  const p = open.parts[Number(idx) || 0];
  const scored = part.checks.scoreTake(part.content.checkFor(metricId), p, played, origin === undefined ? null : origin);
  if (scored.error) return { status: 400, error: scored.error };
  db.update(record.COLLECTION, row.id, { practice_open: { ...open, takes: [[...open.takes[0], scored]] } });
  return scored;
}

/** Close a warm set: at the target or not, by the check's own bar; recorded as practice. */
function finishSet(userId, enrollment, metricId, now = Date.now()) {
  const part = checksPart();
  const row = record.rowFor(userId, enrollment.track_id, metricId);
  if (!part || !row || !row.practice_open) return { status: 404, error: 'No practice set is open.' };
  const open = row.practice_open;
  const def = part.content.checkFor(metricId);
  let atTarget;
  let score;
  if (open.how === 'items') {
    const graded = open.answers.map((x) => x || { correct: false });
    const r = part.checks.itemsResult({ ...def, rule: def.rule.right !== undefined ? { share: def.rule.right / def.count } : def.rule }, graded);
    atTarget = r.pass;
    score = r.score;
  } else {
    const t = open.takes[0][open.takes[0].length - 1];
    if (!t) return { status: 409, error: 'Play it first.' };
    atTarget = !!t.pass;
    score = t.notes;
  }
  db.update(record.COLLECTION, row.id, { practice_open: null });
  record.practise(userId, { subject: enrollment.track_id, metricId, atTarget, at: now });
  return { at_target: atTarget, score, plan: planFor(userId, db.byId('enrollments', enrollment.id), now) };
}

/**
 * A logged set: a basketball set judged by the check's rule, or, for a metric
 * not checkable in the app, the learner's own word (it only times the next
 * cold test; warm sets never prove).
 */
function logSet(userId, enrollment, metricId, body, now = Date.now()) {
  const entry = planned(userId, enrollment, metricId, now);
  if (!entry) return { status: 404, error: 'That is not in today\'s practice.' };
  const part = checksPart();
  const def = part ? part.content.checkFor(metricId) : { how: 'not_wired' };
  let atTarget;
  let note = null;
  if (def.how === 'count') {
    const row = record.ensureRow(userId, enrollment.track_id, metricId);
    const r = part.checks.countResult(def, body, row.baseline);
    if (r.error) return { status: 400, error: r.error };
    atTarget = r.pass === true;
    note = r.note || null;
  } else if (def.how === 'items' || def.how === 'take') {
    return { status: 400, error: 'This one is played here: start the set.' };
  } else {
    atTarget = !!(body && body.at_target === true);
    note = 'your own word: it only times the next cold test';
  }
  record.practise(userId, { subject: enrollment.track_id, metricId, atTarget, at: now });
  return { at_target: atTarget, note, plan: planFor(userId, db.byId('enrollments', enrollment.id), now) };
}

/** The path's "Today's practice" row. */
function pathNode(userId, enrollment) {
  if (!enabled() || enrollment.status !== 'active') return null;
  const p = planFor(userId, enrollment);
  if (!p) return null;
  const href = `/skill-practice?enrollment=${enrollment.id}`;
  if (!p.sets) return null;
  if (!p.left) return { kind: 'practice', badge: 'Today', title: "Today's practice is done", kind_label: 'Practice', detail: `${p.sets} set${p.sets === 1 ? '' : 's'} done.`, href, action: 'See it', done: true };
  const names = [...new Set(p.practice.filter((x) => x.left).map((x) => x.title || x.name.replace(/_/g, ' ')))];
  return { kind: 'practice', badge: 'Today', title: "Today's practice", kind_label: 'Practice', detail: `${p.left} set${p.left === 1 ? '' : 's'} of about ${p.set_minutes} min: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ', and more' : ''}.`, href, action: p.left < p.sets ? 'Carry on' : 'Practise', next: true };
}

module.exports = { enabled, sessionMinutes, planFor, scheduledTests, startSet, answerSet, takeSet, finishSet, logSet, pathNode, drillFor };
