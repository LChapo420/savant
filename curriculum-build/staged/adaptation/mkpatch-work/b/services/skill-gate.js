/**
 * The skill stage gate (staged patch skills-round3/03-stage-gate;
 * SKILL_STAGE_GATE, needs SKILL_RECORD=on and patch 01).
 *
 * Leaving a chess, piano or basketball stage (graduating its last grade) needs
 * every machine-provable exit metric proven: cold passes on two different
 * days, re-derived from the sittings, and kept where the stage names a
 * retention test; and a proof older than 7 days passed again cold, so the
 * battery stands when the stage is left (services/skill-coverage.js stageGate).
 *
 *   off      nothing.
 *   shadow   (the default) the Final graduates as before; what the gate would
 *            have said is written on the enrollment (skill_gate_shadow).
 *   on       a passed Final does not graduate while a provable metric is
 *            left; the path says so and the "what's left" page lists it.
 *
 * Only the performance side is decided here. The stage's knowledge (its
 * grades' lesson objectives) is the coverage gate's (COVERAGE_GATE), shown on
 * the page for the whole picture. Attested-only metrics (recitals, film
 * reviews, capstones) are listed and never hold a stage: whether a person's
 * sign-off should is the owner's decision (skills-round3 README, 10b), and so
 * is any margin above the bar at exit (10c).
 */
'use strict';

const db = require('../config/db');
const record = require('./skill-record');

function mode() {
  const m = String(process.env.SKILL_STAGE_GATE || 'shadow').toLowerCase();
  return ['on', 'shadow', 'off'].includes(m) ? m : 'shadow';
}

function active() {
  return record.enabled() && mode() !== 'off';
}

/** The stage's checks as patch 02 describes them, when it is applied. */
function checksPart() {
  try {
    // eslint-disable-next-line global-require
    return require('./skill-checks');
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

/**
 * What is left before this stage can be left: each provable metric not yet
 * proven, waiting on its retention test, or needing a fresh cold pass, with
 * when it can next be sat cold; the attested-only metrics; the knowledge side.
 */
function left(userId, enrollment, now = Date.now()) {
  const view = record.stageView(userId, enrollment, now);
  if (!view) return null;
  let wiredOf = () => null;
  let titleOf = (name) => String(name || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const checks = checksPart();
  if (checks) {
    // eslint-disable-next-line global-require
    const content = require('../content/skill-stage-checks');
    wiredOf = (id) => content.checkFor(id).how !== 'not_wired';
    titleOf = content.titleOf;
  }
  const by = (ids) => view.metrics.filter((m) => ids.includes(m.id)).map((m) => ({
    id: m.id,
    metric: m.metric,
    title: titleOf(m.metric),
    test: m.test,
    threshold: m.threshold,
    status: m.status,
    proof_days: m.proof_days,
    retention_due_at: m.retention_due_at,
    cold_now: m.cold_now,
    cold_at: m.cold_at,
    last: m.last,
    wired: wiredOf(m.id),
  }));
  const g = view.gate;
  const performance = !g.missing.length && !g.unkept.length && !(g.stale || []).length;
  const last = view.stage.grades[view.stage.grades.length - 1];
  return {
    mode: mode(),
    stage: view.stage,
    complete: performance,
    proven: g.proven,
    provable: g.provable,
    missing: by(g.missing),
    unkept: by(g.unkept),
    stale: by(g.stale || []),
    attest: view.metrics.filter((m) => !m.provable).map((m) => ({ id: m.id, metric: m.metric, title: titleOf(m.metric), test: m.test, threshold: m.threshold, source: m.source })),
    // eslint-disable-next-line global-require
    knowledge: view.knowledge.map((k) => ({ ...k, name: (require('../config/curriculum').getGrade(enrollment.track_id, k.id) || {}).name || k.id })),
    leaves_stage: enrollment.grade_id === last,
    held_at: enrollment.skill_held_at || null,
    checks_applied: !!checks,
  };
}

/**
 * Called by mastery.clearCheckpoint when a Final is passed. Never throws:
 * {block: true, summary} holds the graduation (mode on); otherwise null or
 * {block: false}. A grade that is not its stage's last does not leave the stage.
 */
function atGraduation(enrollment, now = Date.now()) {
  try {
    if (!active() || !record.isSkillTrack(enrollment.track_id)) return null;
    const out = left(enrollment.user_id, enrollment, now);
    if (!out || !out.leaves_stage) return null;
    const summary = { stage: out.stage.id, complete: out.complete, proven: out.proven, provable: out.provable, missing: out.missing.map((m) => m.id), unkept: out.unkept.map((m) => m.id), stale: out.stale.map((m) => m.id), at: new Date(now).toISOString() };
    if (mode() === 'shadow') {
      db.update('enrollments', enrollment.id, { skill_gate_shadow: summary });
      return { block: false, summary };
    }
    return { block: !out.complete, summary };
  } catch (err) {
    console.error(`[skill-gate] ${err.message}`);
    return null;
  }
}

/** Every proof on the stage re-derived from its sittings (for the page and the tests). */
function proofs(userId, enrollment) {
  const stage = record.stageFor(enrollment.track_id, enrollment.grade_id);
  return stage ? record.auditStage(userId, enrollment.track_id, stage.id) : null;
}

/** Has the learner reached the grade's Final? */
function atFinal(enrollment) {
  // eslint-disable-next-line global-require
  const grade = require('../config/curriculum').getGrade(enrollment.track_id, enrollment.grade_id);
  const final = grade && (grade.levels.find((l) => l.kind === 'graduation') || {}).level;
  return !!final && enrollment.current_level >= final;
}

/** The path's row: only when the gate is on and holds, or the learner is at the Final with something left. */
function pathNode(userId, enrollment) {
  if (!active() || mode() !== 'on' || enrollment.status === 'graduated') return null;
  const out = left(userId, enrollment);
  if (!out || !out.leaves_stage) return null;
  if (!enrollment.skill_held_at && !atFinal(enrollment)) return null;
  const n = out.missing.length + out.unkept.length + out.stale.length;
  const href = `/stage-left?enrollment=${enrollment.id}`;
  if (!n) return { kind: 'stage_left', badge: 'Leave', title: 'Ready to leave this stage', kind_label: 'Complete', detail: `All ${out.provable} measured skills proven.${enrollment.skill_held_at ? ' Graduate from the page.' : ''}`, href, action: enrollment.skill_held_at ? 'Graduate' : 'See the record', next: !!enrollment.skill_held_at, done: !enrollment.skill_held_at };
  return {
    kind: 'stage_left',
    badge: enrollment.skill_held_at ? 'Held' : 'Gate',
    title: enrollment.skill_held_at ? 'Graduation waits on this stage\'s skills' : 'Before you leave this stage',
    kind_label: `${n} left`,
    detail: `${out.proven} of ${out.provable} measured skills proven. ${n} still to prove on two cold days${out.unkept.length ? ', or to keep' : ''}.`,
    href,
    action: 'See what is left',
    next: true,
    held: !!enrollment.skill_held_at,
  };
}

module.exports = { mode, active, left, atGraduation, proofs, pathNode };
