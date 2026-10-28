/**
 * Skill adaptation: HOW MUCH and WHEN a chess, piano or basketball
 * learner practises each exit-battery metric of their stage, never WHAT the
 * stage must prove. The same split as services/adaptation.js: the stage and
 * its metrics come from skill-coverage.js, and checkPlan() proves a plan
 * leaves every unproven metric in.
 *
 * Levers (SKILL-CURRICULA.md section 6, as code):
 *   dose        a session's practice minutes are shared among the stage's
 *               unproven metrics by how far each is from its target on the
 *               learner's own recent warm sets (more for the weak spots), and
 *               practice on a metric ENDS on its proof (proven metrics get only
 *               a short maintenance set every MAINT_DAYS days and their
 *               retention sitting when due). Every unproven metric gets at
 *               least one set a session: none is starved or dropped.
 *   stage test  a cold sitting (first of the day, 20+ hours after its last
 *               practice) is scheduled for an unproven metric when the
 *               learner's warm sets say it is likely to pass (READY of the
 *               last 3 at target), or every CHECK_DAYS days regardless, so a
 *               learner whose warm sets under-state them is not held.
 *   retention   the stage's retention sitting ("again after 7+ days") once due.
 *   knowledge   while the stage's knowledge gate (coverage.js) is open, a share
 *               of the session (the stage's own lesson share) goes to its
 *               lessons, taught by services/adaptation.js.
 *
 * Brought into the app by the staged patch skills-round3/04-practice-dose
 * from curriculum-build/staged/adaptation/skills/skill-adaptation.js (the same
 * code; round 3 added the maintenance share). services/skill-dose.js runs it
 * on the learner's skill record.
 *
 * Inputs are the learner's own record. Confident scorecard directives may
 * change session length (as for every subject); they cannot change the
 * metrics, the cold rule or the two-day rule.
 */
'use strict';

const sc = require('./skill-coverage');

function knobs() {
  const num = (name, fallback) => {
    const v = Number(process.env[name]);
    return process.env[name] !== undefined && process.env[name] !== '' && Number.isFinite(v) ? v : fallback;
  };
  return {
    READY: num('SKILL_READY', 3),           // warm sets at target, of the last 3, before a cold sitting
    CHECK_DAYS: num('SKILL_CHECK_DAYS', 5), // a cold sitting at least this often while unproven
    MAINT_DAYS: num('SKILL_MAINT_DAYS', 1), // a maintenance set on a proven metric (1: every session)
    SET_MIN: num('SKILL_SET_MIN', 4),       // minutes of one practice set
    SIT_MIN: num('SKILL_SIT_MIN', 4),       // minutes of one test sitting
    FILL: num('SKILL_FILL', 1),             // 1: spare session minutes consolidate proven metrics
    // Round 3: the maintenance share. While a stage still has unproven metrics,
    // proven metrics that have not yet had their over-learning dose (OVERLEARN
    // times the sets it took to prove them, at least OVERLEARN_MIN, practised
    // after the proof) keep a share of the session's practice sets: by default
    // ("even", -1) the share even practice would give them (proven-short /
    // provable), or a fixed fraction (0..1); each gets at least one set.
    // 0 gives round 2's plan (practice ends on proof; one maintenance set).
    MAINT_SHARE: process.env.SKILL_MAINT_SHARE === 'even' ? -1 : num('SKILL_MAINT_SHARE', -1),
    OVERLEARN: num('SKILL_OVERLEARN', 2),
    OVERLEARN_MIN: num('SKILL_OVERLEARN_MIN', 4),
    // Carry-over (round 3): once a stage is left, its metrics keep one
    // maintenance set every CARRY_DAYS in the later stages' sessions, at most
    // CARRY_MAX sets a session, longest-unpractised first. Off (0) by default:
    // the audit's truth model has no spacing benefit, and there sparse sets
    // cost minutes and kept less (round 3 README).
    CARRY_DAYS: num('SKILL_CARRY_DAYS', 0),
    CARRY_MAX: num('SKILL_CARRY_MAX', 2),
  };
}

/** Warm practice sets are kept on the record: {at, atTarget}. */
function practiseSet(rec, metricId, at, atTarget) {
  sc.practise(rec, metricId, at);
  const m = rec.metrics[metricId];
  const proven = m.status === 'proven' || m.status === 'retained';
  // Sets counted for the over-learning dose: how many it took to prove the
  // metric (fixed at its first set after the proof), and how many since.
  m.sets = (m.sets || 0) + 1;
  if (!proven) m.sets_at_proof = null;
  else if (m.sets_at_proof === null || m.sets_at_proof === undefined) m.sets_at_proof = m.sets - 1;
  m.warm = m.warm || [];
  m.warm.push({ at, atTarget: !!atTarget });
  if (m.warm.length > 12) m.warm.shift();
}

/** How close a metric looks on the learner's last three warm sets (0..1). */
function readiness(m) {
  const last = (m.warm || []).slice(-3);
  if (!last.length) return 0;
  return last.filter((x) => x.atTarget).length / last.length;
}

/**
 * Sets a proven metric still needs for its over-learning dose (0 when it has
 * had them, or is not proven). Over-learning beyond the bar is what keeps a
 * motor or board skill a month on (Driskell, Willis & Copper 1992); round 2's
 * plan stopped practice at proof and kept less at 30 days than even practice.
 */
function overlearnDeficit(m, k = knobs()) {
  if (!m || !(m.status === 'proven' || m.status === 'retained') || !k.OVERLEARN) return 0;
  const atProof = m.sets_at_proof === null || m.sets_at_proof === undefined ? (m.sets || 0) : m.sets_at_proof;
  const since = (m.sets || 0) - atProof;
  return Math.max(0, Math.ceil(k.OVERLEARN * Math.max(k.OVERLEARN_MIN, atProof)) - since);
}

/**
 * One session's plan for one learner on one stage.
 *
 * @param {object} a
 * @param {object} a.stage      skill-coverage stagesFor()[i]
 * @param {object} a.rec        the learner's skill record
 * @param {number} a.now        session start (ms)
 * @param {number} a.minutes    session length the learner has (after any confident length directive)
 * @param {boolean} a.knowledgeOpen  the stage's knowledge gate is not yet complete
 * @param {number} [a.lessonShare]   share of the session for lessons while knowledge is open
 * @returns {{sittings: object[], practice: object[], lesson_minutes: number, what: object, reasons: string[]}}
 */
function planSession({ stage, rec, now, minutes, knowledgeOpen = false, lessonShare = 0.3 }) {
  const k = knobs();
  const reasons = [];
  const sittings = [];
  const unproven = [];
  const attest = [];
  const maintenance = [];
  for (const mt of stage.metrics) {
    if (!mt.source.provable) { attest.push(mt.id); continue; }
    const m = rec.metrics[mt.id];
    const proven = m.status === 'proven' || m.status === 'retained';
    if (!proven) {
      unproven.push(mt.id);
      const cold = sc.isCold(m, now);
      const lastSit = m.sittings.length ? m.sittings[m.sittings.length - 1].at : null;
      const overdue = lastSit === null ? (m.warm || []).length >= 3 : now - lastSit >= k.CHECK_DAYS * sc.DAY;
      const ready = (m.warm || []).length >= 3 && (m.warm || []).slice(-3).filter((x) => x.atTarget).length >= k.READY;
      if (cold && (ready || overdue)) {
        sittings.push({ metric: mt.id, kind: 'stage_test' });
        reasons.push(`${mt.metric}: cold stage test — ${ready ? 'warm sets are at target' : `no cold test for ${k.CHECK_DAYS}+ days`}`);
      }
    } else {
      const staleAt = sc.knobs().STALE_DAYS * sc.DAY;
      if (m.status === 'proven' && stage.retention_days && now - m.proven_at >= stage.retention_days * sc.DAY && sc.isCold(m, now)) {
        sittings.push({ metric: mt.id, kind: 'retention_test' });
        reasons.push(`${mt.metric}: retention test — ${stage.retention_days}+ days since its proof`);
      } else if (m.status === 'retained' && now - sc.lastCountingPass(m) > staleAt && sc.isCold(m, now)) {
        sittings.push({ metric: mt.id, kind: 'stands_test' });
        reasons.push(`${mt.metric}: cold re-sit — its last pass is over ${sc.knobs().STALE_DAYS} days old; the battery must stand when the stage is left`);
      } else if (now - Math.max(m.last_practice_at || 0, m.last_sat_at || 0) >= k.MAINT_DAYS * sc.DAY) {
        maintenance.push(mt.id);
      }
    }
  }
  let left = minutes - sittings.length * k.SIT_MIN;
  const lessonMinutes = knowledgeOpen ? Math.max(0, Math.round(left * lessonShare)) : 0;
  left -= lessonMinutes;
  const practice = [];
  // The maintenance share (round 3): proven metrics short of their
  // over-learning dose share up to MAINT_SHARE of the practice sets, by how
  // many they still need, while unproven metrics remain. Every unproven
  // metric still keeps at least one set.
  const share = new Map();
  if (unproven.length && k.MAINT_SHARE !== 0) {
    const need = stage.metrics.filter((mt) => mt.source.provable).map((mt) => [mt.id, overlearnDeficit(rec.metrics[mt.id], k)]).filter((x) => x[1] > 0);
    const practiceSets = Math.floor(left / k.SET_MIN);
    const provable = stage.metrics.filter((mt) => mt.source.provable).length;
    const frac = k.MAINT_SHARE < 0 ? need.length / Math.max(1, provable) : k.MAINT_SHARE;
    // At least one set for each metric short of its dose, as even practice would give it.
    const budget = Math.min(need.reduce((a, x) => a + x[1], 0), Math.max(Math.round(frac * practiceSets), need.length));
    need.sort((a, b) => b[1] - a[1]);
    const total = need.reduce((a, x) => a + x[1], 0);
    for (const [id, d] of need) { const n = Math.min(d, Math.floor((budget * d) / total)); if (n > 0) share.set(id, n); }
    let spare = budget - [...share.values()].reduce((a, b) => a + b, 0);
    for (let j = 0; spare > 0 && j < need.length * 4; j++) { const [id, d] = need[j % need.length]; if ((share.get(id) || 0) < d) { share.set(id, (share.get(id) || 0) + 1); spare--; } }
    for (const [id, n] of share) { practice.push({ metric: id, sets: n, kind: 'overlearn' }); left -= n * k.SET_MIN; }
    if (share.size) reasons.push(`maintenance share: ${[...share.values()].reduce((a, b) => a + b, 0)} set(s) to ${share.size} proven metric(s) still short of their over-learning dose`);
  }
  // Maintenance: one short set per proven metric due one (MAINT_DAYS).
  for (const id of maintenance) {
    if (share.has(id)) continue;
    if (left < k.SET_MIN) break;
    practice.push({ metric: id, sets: 1, kind: 'maintenance' });
    left -= k.SET_MIN;
  }
  // Dose: unproven metrics share the rest by their distance from target; each
  // gets at least one set.
  if (unproven.length) {
    const weight = unproven.map((id) => 1 + 2 * (1 - readiness(rec.metrics[id])));
    const totalSets = Math.max(unproven.length, Math.floor(left / k.SET_MIN));
    const wsum = weight.reduce((a, b) => a + b, 0);
    const sets = weight.map((w) => Math.max(1, Math.floor((totalSets * w) / wsum)));
    let spare = totalSets - sets.reduce((a, b) => a + b, 0);
    const order = weight.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    for (let j = 0; spare > 0; j = (j + 1) % order.length, spare--) sets[order[j]] += 1;
    unproven.forEach((id, i) => practice.push({ metric: id, sets: sets[i], kind: 'practice', readiness: readiness(rec.metrics[id]) }));
    reasons.push(`dose: ${unproven.length} unproven metric(s) share ${totalSets} sets by distance from target; proven metrics get no practice beyond maintenance`);
  } else {
    if (!knowledgeOpen) reasons.push('every provable metric is proven: the stage waits only on retention tests and the knowledge gate');
    // FILL: the session's remaining minutes go to the proven metrics, evenly
    // (consolidation beyond the bar; over-practice helps motor retention,
    // Driskell, Willis & Copper 1992). 0 ends the session early instead.
    const proven = stage.metrics.filter((mt) => mt.source.provable).map((mt) => mt.id);
    if (k.FILL && proven.length && left >= k.SET_MIN) {
      const each = Math.floor(left / k.SET_MIN / proven.length);
      if (each > 0) {
        for (const id of proven) practice.push({ metric: id, sets: each, kind: 'consolidation' });
        reasons.push(`consolidation: the session's other ${each * proven.length} sets go to the proven metrics`);
      }
    }
  }
  return {
    stage: stage.id,
    sittings,
    practice,
    lesson_minutes: lessonMinutes,
    what: { stage: stage.id, unproven, attest, metrics: stage.metrics.map((x) => x.id) },
    reasons,
  };
}

/**
 * Carry-over maintenance (round 3): the metrics of stages already left, due a
 * maintenance set (CARRY_DAYS or more since last practised), longest first,
 * at most CARRY_MAX. `left` is [{stage, rec}] for the learner's earlier stages
 * of this subject (the record is per subject, so usually the same rec).
 * Practice only: it never sits a test and never changes a stage's status.
 */
function carryOver(left, now) {
  const k = knobs();
  if (!k.CARRY_DAYS || !k.CARRY_MAX) return [];
  const due = [];
  for (const { stage, rec } of left) {
    for (const mt of stage.metrics) {
      if (!mt.source.provable) continue;
      const m = rec.metrics[mt.id];
      if (!m) continue;
      const last = Math.max(m.last_practice_at || 0, m.last_sat_at || 0);
      if (now - last >= k.CARRY_DAYS * sc.DAY) due.push({ metric: mt.id, stage: stage.id, sets: 1, kind: 'carry', last });
    }
  }
  return due.sort((a, b) => a.last - b.last).slice(0, k.CARRY_MAX);
}

/**
 * The WHAT invariant for skill plans: the plan's stage and metric list are the
 * stage's own, every unproven provable metric is listed as unproven and gets
 * practice or a sitting, and nothing unproven is marked done.
 */
function checkPlan(stage, rec, plan) {
  const problems = [];
  if (plan.stage !== stage.id || plan.what.stage !== stage.id) problems.push('stage changed');
  if (JSON.stringify(plan.what.metrics) !== JSON.stringify(stage.metrics.map((x) => x.id))) problems.push('metric list changed');
  for (const mt of stage.metrics) {
    if (!mt.source.provable) continue;
    const m = rec.metrics[mt.id];
    const proven = m.status === 'proven' || m.status === 'retained';
    if (!proven && !plan.what.unproven.includes(mt.id)) problems.push(`${mt.id} unproven but not listed`);
    if (!proven && !plan.practice.some((p) => p.metric === mt.id) && !plan.sittings.some((s) => s.metric === mt.id)) problems.push(`${mt.id} unproven but given no practice or sitting`);
  }
  return problems;
}

module.exports = { knobs, practiseSet, readiness, overlearnDeficit, planSession, carryOver, checkPlan };
