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

/**
 * The switch. Since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md) the
 * default is `on`, and `on` is per stage: a stage holds graduation only when every
 * one of its machine-provable metrics has a working check (patch 02's
 * content/skill-stage-checks: none `not_wired`). Any stage with a check still to
 * build stays in shadow, so no learner is held on a skill the app cannot test yet
 * (today: every chess stage; fully wired: PI0, PI1, BB0). The set grows by itself
 * as checks are wired. SKILL_STAGE_GATE=shadow puts every stage in shadow, =off
 * turns the gate off; SKILL_STAGE_GATE_SHADOW=CH0,PI1 keeps named stages in shadow.
 */
function mode() {
  const m = String(process.env.SKILL_STAGE_GATE || 'on').toLowerCase();
  return ['on', 'shadow', 'off'].includes(m) ? m : 'shadow';
}

/**
 * Stages kept in shadow by default although every check on them is wired (2026-10-24, LIVE-CHANGES-2026-10-24.md):
 *   CH2-CH5    their recorded-game checks need two blocks of 12 rapid games (an owner call), and CH4-CH5 lean on Maia-2;
 *   PI5-7      the repertoire check draws on 3 library pieces, all from the stage's first grade; tempo targets and CV cuts are [R];
 *   PI8-10     no library pieces at these grades (the piece to learn is generated); tempo and CV cuts are [R];
 *   BB1-BB7    their decision scenes have no measured reliability yet (the progression asks split-half >= 0.8 after
 *              100 learners before a clip set gates), and BB4-BB7's zone marks are [R];
 *   BB8-12     only the computations in its applied tasks are machine-checked; the scouting report and game plan need a person.
 * SKILL_STAGE_GATE_SHADOW=<list> replaces the list; SKILL_STAGE_GATE_SHADOW= (empty) clears it.
 *
 * Since 2026-10-25 (evidence article 04, P5) the scene-reliability hold is computed, not hand-kept:
 * with SCENE_RELIABILITY_GATE on (the default) BB1-BB3 leave the list, and any stage with
 * decision-scene sets stays in shadow until every set's split-half reliability (Spearman-Brown,
 * from real sittings, services/skill-scene-reliability.js) is >= 0.8 on 100+ learners. That keeps
 * BB1-BB7 in shadow today, and lets BB1-BB3 gate by themselves once the data shows it; BB4-5 and
 * BB6-7 stay listed for their [R] zone marks as well. SCENE_RELIABILITY_GATE=off restores the list.
 */
const HAND_SHADOW = 'CH2,CH3,CH4,CH5,PI5-7,PI8-10,BB1,BB2,BB3,BB4-5,BB6-7,BB8-12';
const COMPUTED_SHADOW = 'CH2,CH3,CH4,CH5,PI5-7,PI8-10,BB4-5,BB6-7,BB8-12';
function sceneRule() {
  // eslint-disable-next-line global-require
  try { return require('./skill-scene-reliability'); } catch (err) { if (err && err.code === 'MODULE_NOT_FOUND') return null; throw err; }
}
const defaultShadow = () => (sceneRule() && sceneRule().gateOn() ? COMPUTED_SHADOW : HAND_SHADOW);
const DEFAULT_SHADOW = HAND_SHADOW;

function forcedShadow(stageId) {
  const raw = process.env.SKILL_STAGE_GATE_SHADOW === undefined ? defaultShadow() : process.env.SKILL_STAGE_GATE_SHADOW;
  return String(raw).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).includes(String(stageId || '').toUpperCase());
}

/** The computed scene-reliability hold on a stage (null when it has no scene sets or the rule is off). */
function sceneHold(stageId) {
  const rule = sceneRule();
  return rule ? rule.stageHold(stageId) : null;
}

/**
 * The gate's mode for one stage: `on` only when the switch is on, the stage is not
 * named in SKILL_STAGE_GATE_SHADOW, its scene sets (if any) are reliable and every
 * provable metric on it is wired.
 */
function stageMode(stageId, fullyWired) {
  const m = mode();
  if (m !== 'on') return m;
  if (!fullyWired || forcedShadow(stageId)) return 'shadow';
  const hold = sceneHold(stageId);
  return hold && hold.hold ? 'shadow' : 'on';
}

/**
 * The owner's account: never held and no gate row, as with the coverage gate
 * (services/coverage.js exempt): its skips leave no proof. config/owner.js isOwner.
 */
function ownerExempt(userId) {
  // eslint-disable-next-line global-require
  const owner = require('../config/owner');
  return owner.isOwner(owner.userOf(userId));
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
    plain: m.plain || null,
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
  // Every provable metric on the stage has a working check (patch 02 applied, none not_wired).
  const unwired = view.metrics.filter((m) => m.provable && !(checks && wiredOf(m.id))).map((m) => m.id);
  const fullyWired = !!checks && !unwired.length;
  const hold = sceneHold(view.stage.id);
  return {
    mode: stageMode(view.stage.id, fullyWired),
    switch_mode: mode(),
    scene_reliability: hold ? hold.sets.map((x) => ({ metric: x.metric, learners: x.learners, reliability: x.reliability, reliable: x.reliable })) : null,
    fully_wired: fullyWired,
    unwired,
    stage: view.stage,
    complete: performance,
    proven: g.proven,
    provable: g.provable,
    missing: by(g.missing),
    unkept: by(g.unkept),
    stale: by(g.stale || []),
    attest: view.metrics.filter((m) => !m.provable).map((m) => ({ id: m.id, metric: m.metric, title: titleOf(m.metric), test: m.test, threshold: m.threshold, plain: m.plain || null, source: m.source })),
    // eslint-disable-next-line global-require
    knowledge: view.knowledge.map((k) => ({ ...k, name: (require('../config/curriculum').getGrade(enrollment.track_id, k.id) || {}).name || k.id })),
    leaves_stage: enrollment.grade_id === last,
    held_at: enrollment.skill_held_at || null,
    checks_applied: !!checks,
    // eslint-disable-next-line global-require
    two_day_rule: require('../content/skill-learner-text').twoDayRule(userId),
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
    // The owner's account is never held, as with the coverage gate: its jumps and
    // skips leave no proof. What the gate would say is still recorded, as in shadow.
    if (ownerExempt(enrollment.user_id)) out.mode = 'shadow';
    const summary = { stage: out.stage.id, mode: out.mode, owner_base: ownerExempt(enrollment.user_id) || undefined, fully_wired: out.fully_wired, complete: out.complete, proven: out.proven, provable: out.provable, missing: out.missing.map((m) => m.id), unkept: out.unkept.map((m) => m.id), stale: out.stale.map((m) => m.id), at: new Date(now).toISOString() };
    if (out.mode !== 'on') {
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
  if (!active() || mode() !== 'on' || enrollment.status === 'graduated' || ownerExempt(userId)) return null;
  const out = left(userId, enrollment);
  if (!out || !out.leaves_stage || out.mode !== 'on') return null;
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

module.exports = { mode, stageMode, active, left, atGraduation, proofs, pathNode, DEFAULT_SHADOW, HAND_SHADOW, COMPUTED_SHADOW, defaultShadow };
