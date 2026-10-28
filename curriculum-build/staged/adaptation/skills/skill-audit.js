/**
 * Skill audit (staged): chess, piano and basketball learners walk the first
 * stages of each subject under three policies, and the audit checks that no
 * stage is completed or skipped without its proof.
 * curriculum-build/ADAPTIVE-COVERAGE.md section 6.
 *
 *   node curriculum-build/staged/adaptation/skills/skill-audit.js [--learners=6] [--seed=20261023] [--json=out.json]
 *
 * Part 1 checks every stage of the three subjects (skill-coverage.validate):
 * each exit metric has a test, a pass rule and a source; each stage's grades
 * have knowledge objectives in services/coverage.js; and which metrics a
 * machine can prove at all (the rest are attested, never proven).
 *
 * Part 2 simulates the PERFORMANCE side: practice minutes, sittings and real
 * competence. The knowledge side (the stage's lesson objectives) is the
 * coverage model's and is audited by scripts/coverage-audit.js; here it is the
 * same fixed lesson time in every policy, and the gate needs it complete.
 *
 *   today     what the app does now: a stage lasts as many sessions as its
 *             lessons take; each session's practice is split evenly over the
 *             stage's metrics; then the next stage. No stage tests.
 *   gate      today, then the stage's exit battery as a gate (cold sittings,
 *             two different days, skill-coverage.sit / stageGate); even
 *             practice continues until every metric is proven.
 *   adaptive_r2  round 2's adaptive plan: practice on a metric ends on its proof.
 *   adaptive  the gate, plus skill-adaptation.planSession (with round 3's
 *             maintenance share for proven metrics short of their over-learning dose): a placement battery
 *             (cold, two days) that can skip a stage only by proving it; dose
 *             by distance from target; practice that ends on proof; cold tests
 *             when warm sets say they are ready; retention sittings.
 *
 * The truth model. Each learner has, per metric, a skill x on a scale where 1
 * is the gate's threshold. A 4-minute practice set closes 1 - e^(-4/tau) of
 * the gap to the learner's ceiling (a negative-exponential practice curve;
 * Heathcote, Brown & Mewhort 2000), tau longer for later stages and slower
 * learners. After a day without practice x sags by up to 0.15 (half of it in 25 days); a
 * cold sitting performs 0.06 below warm (warm-up decrement). A sitting passes
 * with probability logistic((x_cold - 1) / 0.035): about what the staged gates'
 * own simulations give (a learner 10 points below a make-rate threshold passes
 * by luck in about 5% of sittings, one 10 points above in about 95%).
 * Experienced learners start above threshold on their first stages; plateau
 * learners have a ceiling just above it; irregular ones practise 4 days a week.
 *
 * Round 3: `adaptive_r2` is round 2's plan for comparison; the summary prints
 * the 30-day measure both ways. SKILL_EXIT_DOSE=<multiple> (audit only, off)
 * measures owner decision 10c, a dose held at exit.
 *
 * Nothing touches the app or data/db.json: no database, no network, no model.
 */
'use strict';

const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
const ROOT = path.resolve(__dirname, '../../../..');
const coverage = require(path.join(ROOT, 'services/coverage'));
const sc = require('./skill-coverage');
const sa = require('./skill-adaptation');

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : fallback; };
const SEED = Number(opt('seed', 20261023));
const LEARNERS = Number(opt('learners', 6));
const JSON_OUT = opt('json', null);
// --checks=<app root>: an app tree with the staged round-3 patches applied; Part 1 then
// says which provable metrics have a machine sitting there (02's content/skill-stage-checks.js
// and, with patch 05, content/skill-chess-sittings.js). Content only: nothing is run.
const CHECKS_ROOT = opt('checks', null);
function sittingsFrom(root) {
  if (!root) return null;
  const table = {};
  const f02 = path.join(root, 'content', 'skill-stage-checks.js');
  const f05 = path.join(root, 'content', 'skill-chess-sittings.js');
  const f06 = path.join(root, 'content', 'skill-piano-bb-sittings.js'); // the later piano and basketball sittings (2026-10-24)
  if (fs.existsSync(f02)) {
    // Read the CHECKS table without its checkFor (which would load the app's services).
    const src = fs.readFileSync(f02, 'utf8');
    const body = src.slice(src.indexOf('const CHECKS = {'), src.indexOf('/** What each metric is called'));
    Object.assign(table, new Function(`const MOVE_PROMPT = ''; ${body}; return CHECKS;`)());
  }
  if (fs.existsSync(f05)) Object.assign(table, require(f05).CHECKS);
  if (fs.existsSync(f06)) Object.assign(table, require(f06).CHECKS);
  return (id) => table[id] || { how: 'not_wired' };
}
const STAGES = { chess: 6, piano: 5, basketball: 4 }; // CH0-CH5, PI0-PI4, BB0-BB3
const MAX_DAYS = Number(opt('max-days', 900));
const EXIT_DOSE = Number(process.env.SKILL_EXIT_DOSE || 0); // owner decision 10c, measured only
const POLICIES = ['today', 'gate', 'adaptive_r2', 'adaptive'];
// adaptive_r2 is round 2's plan (practice ends on proof: SKILL_MAINT_SHARE=0);
// adaptive is the current plan, with round 3's maintenance share.
const POLICY_ENV = { adaptive_r2: { SKILL_MAINT_SHARE: '0', SKILL_CARRY_DAYS: '0' } };
const DAY = sc.DAY;
const LESSON_MIN_PER_OBJECTIVE = 5; // today's lesson walk: minutes per knowledge objective
const LESSON_SHARE = 0.3;

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

const PROFILES = {
  beginner: { x0: 0.35, ceil: 1.25, tau: 1, days: 7 },
  child: { x0: 0.25, ceil: 1.25, tau: 1.3, days: 7 },
  talented: { x0: 0.45, ceil: 1.4, tau: 0.6, days: 7 },
  slow: { x0: 0.3, ceil: 1.2, tau: 1.8, days: 7 },
  irregular: { x0: 0.35, ceil: 1.25, tau: 1, days: 4 },
  plateau: { x0: 0.35, ceil: 1.07, tau: 1.2, days: 7 },
  experienced: { x0: 0.35, ceil: 1.35, tau: 0.8, days: 7, ahead: 3 },
  returning: { x0: 0.35, ceil: 1.3, tau: 0.9, days: 7, ahead: 1 },
};

function sessionMinutes(stage) {
  const m = /(\d+)\s*-\s*(\d+)/.exec(String(stage.session_minutes || ''));
  return m ? Math.round((Number(m[1]) + Number(m[2])) / 2) : 45;
}
function knowledgeObjectives(subject, stage) {
  let n = 0;
  for (const g of stage.grades) { const model = coverage.modelFor(subject, g); if (model) n += model.objectives.length; }
  return n;
}

function simulate(subject, profName, idx, policy) {
  const envSet = POLICY_ENV[policy] || {};
  const saved = {};
  for (const [k, v] of Object.entries(envSet)) { saved[k] = process.env[k]; process.env[k] = v; }
  try { return simulate1(subject, profName, idx, policy); } finally {
    for (const k of Object.keys(envSet)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

function simulate1(subject, profName, idx, policy) {
  const adaptive = policy === 'adaptive' || policy === 'adaptive_r2';
  const prof = PROFILES[profName];
  const truthRand = rngFrom(hashSeed(SEED, subject, profName, idx, 'truth'));
  const act = rngFrom(hashSeed(SEED, subject, profName, idx, policy === 'adaptive_r2' ? 'adaptive' : policy));
  const stages = sc.stagesFor(subject).slice(0, STAGES[subject]);
  const rec = sc.blankRecord(subject);
  const jit = () => Math.exp((truthRand() - 0.5) * 0.5);
  // The truth, the same under every policy.
  const truth = {};
  stages.forEach((st, si) => {
    for (const mt of st.metrics) {
      const ahead = prof.ahead && si < prof.ahead;
      truth[mt.id] = {
        x: ahead ? 1.08 + truthRand() * 0.2 : Math.max(0.05, prof.x0 * jit()),
        ceil: Math.max(1.02, prof.ceil * (0.97 + truthRand() * 0.06)),
        tau: 90 * prof.tau * (1 + 0.25 * si) * jit(),
        last: 0,
      };
    }
  });
  let day = 0;
  let minutes = 0;
  let sittings = 0;
  let planProblems = 0;
  const xNow = (id, t) => { const tr = truth[id]; return tr.x - 0.15 * (1 - 2 ** (-Math.max(0, (t - tr.last) / DAY - 1) / 25)); };
  const pCold = (id, t) => sigmoid((xNow(id, t) - 0.06 - 1) / 0.035);
  function practiseTruth(id, t, setMin) {
    const tr = truth[id];
    tr.x = xNow(id, t);
    tr.x += (tr.ceil - tr.x) * (1 - Math.exp(-setMin / tr.tau));
    tr.last = t;
    const atTarget = act() < sigmoid((tr.x - 1) / 0.035);
    return atTarget;
  }
  function sitTruth(stage, id, t) {
    const pass = act() < pCold(id, t);
    sittings += 1;
    minutes += sa.knobs().SIT_MIN;
    const before = rec.metrics[id].status;
    const p = pCold(id, t);
    sc.sit(rec, stage, id, { at: t, pass, source: 'exact' });
    const after = rec.metrics[id].status;
    const proofEvent = (before === 'unproven' || before === 'lapsed') && (after === 'proven' || after === 'retained');
    return { pass, proofEvent, p };
  }
  const studyDay = () => (prof.days >= 7 ? true : act() < prof.days / 7);
  const out = { kinds: {}, carry_minutes: 0, stages: [], false_proofs: 0, borderline_proofs: 0, proofs: 0, violations: [] };
  const exited = []; // stages left, for the 30-day "kept" measure (round 3)

  // Placement (adaptive only): the battery of stage s, cold, on two days; a
  // stage is skipped only when its gate is complete (its knowledge by a
  // test-out the experienced learner passes; 0.5 min a question, 2 a lesson).
  let start = 0;
  if (adaptive) {
    for (let si = 0; si < stages.length; si++) {
      const st = stages[si];
      const ids = st.metrics.filter((m) => m.source.provable).map((m) => m.id);
      for (let d = 0; d < 2; d++) {
        day += 1;
        const t = day * DAY;
        for (const id of ids) { const r = sitTruth(st, id, t); if (r.proofEvent) { out.proofs += 1; if (r.p < 0.5) out.borderline_proofs += 1; if (r.p < 0.2) out.false_proofs += 1; } }
      }
      const knowsIt = prof.ahead && si < prof.ahead;
      if (knowsIt) minutes += knowledgeObjectives(subject, st) * 1;
      const gate = sc.stageGate(rec, st, () => ({ complete: !!knowsIt }));
      if (!gate.complete) {
        // Retention-test stages: a proven-but-not-yet-kept skip waits for its
        // retention sitting, which a skip cannot have yet; such a stage is
        // taught (with its proven metrics compressed), not skipped.
        break;
      }
      out.stages.push(exitRow(st, 'skipped', day * DAY, gate));
      noteExit(st, day * DAY);
      start = si + 1;
    }
  }

  function exitRow(st, how, t, gate) {
    const ids = st.metrics.filter((m) => m.source.provable).map((m) => m.id);
    const ps = ids.map((id) => pCold(id, t));
    const ps30 = ids.map((id) => pCold(id, t + 30 * DAY));
    // The audit: a stage completed or skipped under a gate must have every
    // provable metric's proof re-derivable from its sittings.
    if (policy !== 'today') {
      for (const id of ids) {
        const chk = sc.proofHolds(st, rec.metrics[id], id);
        if (!chk.ok) out.violations.push(`${subject} ${st.id} ${id}: ${chk.why}`);
      }
      if (!gate || !gate.complete) out.violations.push(`${subject} ${st.id}: left with the gate incomplete`);
    }
    return {
      stage: st.id,
      how,
      day,
      minutes,
      unproven_left: ids.filter((id) => !['proven', 'retained'].includes(rec.metrics[id].status)).length,
      metrics: ids.length,
      competent: ps.filter((p) => p >= 0.5).length,
      mean_p: ps.reduce((a, b) => a + b, 0) / Math.max(1, ps.length),
      mean_p30: ps30.reduce((a, b) => a + b, 0) / Math.max(1, ps30.length),
    };
  }
  // Kept (round 3): each stage left is measured again 30 days after its exit,
  // after whatever practice the policy gave it meanwhile (adaptive: the plan's
  // carry-over maintenance sets in later stages' sessions; others: none).
  function noteExit(st, t) { exited.push({ stage: st, t, row: out.stages[out.stages.length - 1], ids: st.metrics.filter((m) => m.source.provable).map((m) => m.id) }); }
  function measureKept(t) {
    for (const e of exited) {
      if (e.kept !== undefined || t < e.t + 30 * DAY) continue;
      const ps = e.ids.map((id) => pCold(id, e.t + 30 * DAY));
      e.kept = ps.reduce((a, b) => a + b, 0) / Math.max(1, ps.length);
      e.row.mean_p30_kept = e.kept;
    }
  }
  function carry(t) {
    if (policy !== 'adaptive') return 0;
    const sets = sa.carryOver(exited.map((e) => ({ stage: e.stage, rec })), t);
    let tt = t + 30 * 60 * 1000;
    for (const c of sets) { const at = practiseTruth(c.metric, tt, sa.knobs().SET_MIN); sa.practiseSet(rec, c.metric, tt, at); minutes += sa.knobs().SET_MIN; out.carry_minutes += sa.knobs().SET_MIN; tt += 5 * 60 * 1000; }
    return sets.length;
  }

  for (let si = start; si < stages.length && day < MAX_DAYS; si++) {
    const st = stages[si];
    const sess = sessionMinutes(st);
    const ids = st.metrics.filter((m) => m.source.provable).map((m) => m.id);
    const lessonMinutes = knowledgeObjectives(subject, st) * LESSON_MIN_PER_OBJECTIVE;
    const lessonSessions = Math.ceil(lessonMinutes / (sess * LESSON_SHARE));
    let lessonsDone = 0;
    let sessionsInStage = 0;
    let complete = false;
    while (!complete && day < MAX_DAYS) {
      day += 1;
      if (!studyDay()) continue;
      const t0 = day * DAY;
      sessionsInStage += 1;
      measureKept(t0);
      carry(t0);
      const knowledgeOpen = lessonsDone < lessonSessions;
      if (adaptive) {
        const plan = sa.planSession({ stage: st, rec, now: t0, minutes: sess, knowledgeOpen, lessonShare: LESSON_SHARE });
        planProblems += sa.checkPlan(st, rec, plan).length;
        for (const s of plan.sittings) { const r = sitTruth(st, s.metric, t0); if (r.proofEvent) { out.proofs += 1; if (r.p < 0.5) out.borderline_proofs += 1; if (r.p < 0.2) out.false_proofs += 1; } }
        if (plan.lesson_minutes) { lessonsDone += 1; minutes += plan.lesson_minutes; }
        let tt = t0 + 3600 * 1000;
        for (const pr of plan.practice) {
          out.kinds[pr.kind] = (out.kinds[pr.kind] || 0) + pr.sets * sa.knobs().SET_MIN;
          for (let j = 0; j < pr.sets; j++) {
            const at = practiseTruth(pr.metric, tt, sa.knobs().SET_MIN);
            sa.practiseSet(rec, pr.metric, tt, at);
            minutes += sa.knobs().SET_MIN;
            tt += 5 * 60 * 1000;
          }
        }
      } else {
        // today / gate: lessons then even practice over the stage's metrics.
        const testing = policy === 'gate' && lessonsDone >= lessonSessions;
        if (testing) {
          for (const id of ids) {
            const m = rec.metrics[id];
            const due = m.status === 'unproven' || m.status === 'lapsed'
              || (m.status === 'proven' && st.retention_days && t0 - m.proven_at >= st.retention_days * DAY)
              || (m.status === 'retained' && t0 - sc.lastCountingPass(m) > sc.knobs().STALE_DAYS * DAY);
            if (due && sc.isCold(m, t0)) { const r = sitTruth(st, id, t0); if (r.proofEvent) { out.proofs += 1; if (r.p < 0.5) out.borderline_proofs += 1; if (r.p < 0.2) out.false_proofs += 1; } }
          }
        }
        let practiceMin = sess;
        if (lessonsDone < lessonSessions) { lessonsDone += 1; minutes += Math.round(sess * LESSON_SHARE); practiceMin -= Math.round(sess * LESSON_SHARE); }
        if (testing) practiceMin -= ids.length * 0; // sittings already counted
        const setsEach = Math.max(1, Math.floor(practiceMin / sa.knobs().SET_MIN / ids.length));
        let tt = t0 + 3600 * 1000;
        for (const id of ids) {
          for (let j = 0; j < setsEach; j++) { const at = practiseTruth(id, tt, sa.knobs().SET_MIN); sa.practiseSet(rec, id, tt, at); minutes += sa.knobs().SET_MIN; tt += 5 * 60 * 1000; }
        }
      }
      const knowledgeDone = lessonsDone >= lessonSessions;
      if (policy === 'today') {
        complete = knowledgeDone;
        if (complete) { out.stages.push(exitRow(st, 'walked', t0 + DAY - 1, null)); noteExit(st, t0 + DAY - 1); }
      } else {
        const gate = sc.stageGate(rec, st, () => ({ complete: knowledgeDone }), t0 + DAY - 1);
        // Owner decision 10c, measured only (SKILL_EXIT_DOSE=<multiple>, off by
        // default): the adaptive plan also holds the stage until each metric has
        // had that multiple of its proof's sets after the proof (at least 2).
        complete = gate.complete && !(policy === 'adaptive' && EXIT_DOSE > 0 && ids.some((id) => sa.overlearnDeficit(rec.metrics[id], { ...sa.knobs(), OVERLEARN: EXIT_DOSE, OVERLEARN_MIN: 2 }) > 0));
        if (complete) { out.stages.push(exitRow(st, 'proven', t0 + DAY - 1, gate)); noteExit(st, t0 + DAY - 1); }
      }
    }
  }
  // After the last simulated stage the learner goes on to the next one: the
  // carry-over sets continue on study days until every stage left is measured.
  const endDay = day;
  const endMinutes = minutes;
  while (exited.some((e) => e.kept === undefined)) {
    day += 1;
    measureKept(day * DAY);
    if (studyDay()) carry(day * DAY);
  }
  day = endDay;
  out.days = day;
  out.minutes = endMinutes;
  out.sittings = sittings;
  out.plan_problems = planProblems;
  out.completed_all = out.stages.length === stages.length;
  return out;
}

function main() {
  const started = Date.now();
  const result = { seed: SEED, learners_per_profile: LEARNERS, validation: {}, subjects: {} };
  console.log('PART 1. Stages of the skill subjects (skill-coverage.validate)');
  let problems = 0;
  const checks = sittingsFrom(CHECKS_ROOT);
  for (const s of sc.SUBJECTS) {
    const v = sc.validate(s, { coverage, checks });
    result.validation[s] = v;
    if (checks) {
      const audited = sc.stagesFor(s).slice(0, STAGES[s]);
      const prov = audited.flatMap((st) => st.metrics.filter((m) => m.source.provable));
      const wiredHere = prov.filter((m) => checks(m.id).how !== 'not_wired');
      const full = audited.filter((st) => st.metrics.filter((m) => m.source.provable).every((m) => checks(m.id).how !== 'not_wired')).map((st) => st.id);
      v.wired_audited = { stages: audited.map((st) => st.id), provable: prov.length, wired: wiredHere.length, fully_checkable: full };
      console.log(`  ${s.padEnd(10)} machine sittings (${CHECKS_ROOT}): ${wiredHere.length} of ${prov.length} provable metrics in ${audited[0].id}-${audited[audited.length - 1].id}; fully checkable stages: ${full.join(', ') || 'none'}`);
      const every = sc.stagesFor(s);
      const provAll = every.flatMap((st) => st.metrics.filter((m) => m.source.provable));
      const wiredAll = provAll.filter((m) => checks(m.id).how !== 'not_wired');
      const fullAll = every.filter((st) => st.metrics.filter((m) => m.source.provable).every((m) => checks(m.id).how !== 'not_wired')).map((st) => st.id);
      v.wired_all = { provable: provAll.length, wired: wiredAll.length, fully_checkable: fullAll };
      console.log(`  ${''.padEnd(10)} every stage: ${wiredAll.length} of ${provAll.length} provable metrics have a sitting; fully checkable: ${fullAll.join(', ') || 'none'}`);
    }
    problems += v.problems.length;
    console.log(`  ${s.padEnd(10)} stages ${v.stats.stages}, exit metrics ${v.stats.metrics} (${v.stats.provable} machine-provable, ${v.stats.metrics - v.stats.provable} attested only), knowledge objectives ${v.stats.knowledge_objectives}, problems ${v.problems.length}`);
    for (const p of v.problems.slice(0, 5)) console.log(`     FAIL ${p}`);
    for (const n of v.notes) console.log(`     note ${n}`);
  }
  console.log(`\nPART 2. Simulated learners: ${Object.keys(PROFILES).length} profiles x ${LEARNERS} x ${POLICIES.length} policies; stages: chess CH0-CH5, piano PI0-PI4, basketball BB0-BB3 (seed ${SEED})`);
  const failures = [];
  for (const s of sc.SUBJECTS) {
    result.subjects[s] = {};
    console.log(`\n${s}`);
    console.log('  policy     all stages done  days  minutes  min/stage  sittings  metrics left unproven at exit  truly at threshold at exit  mean pass p at exit  30 days later  false proofs  skipped stages');
    for (const pol of POLICIES) {
      const runs = [];
      for (const prof of Object.keys(PROFILES)) for (let i = 0; i < LEARNERS; i++) runs.push({ prof, ...simulate(s, prof, i, pol) });
      const rows = runs.flatMap((r) => r.stages);
      const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
      const metricsTotal = sum((r) => r.metrics);
      const done = runs.filter((r) => r.completed_all);
      const summary = {
        learners: runs.length,
        completed_share: done.length / runs.length,
        days: done.length ? done.reduce((a, r) => a + r.days, 0) / done.length : 0,
        minutes: done.length ? done.reduce((a, r) => a + r.minutes, 0) / done.length : 0,
        minutes_per_stage: rows.length ? runs.reduce((a, r) => a + r.minutes, 0) / rows.length : 0,
        sittings: done.length ? done.reduce((a, r) => a + r.sittings, 0) / done.length : 0,
        unproven_at_exit: metricsTotal ? sum((r) => r.unproven_left) / metricsTotal : 0,
        competent_at_exit: metricsTotal ? sum((r) => r.competent) / metricsTotal : 0,
        mean_p_exit: rows.length ? sum((r) => r.mean_p) / rows.length : 0,
        mean_p30: rows.length ? sum((r) => r.mean_p30) / rows.length : 0,
        mean_p30_kept: rows.length ? sum((r) => (r.mean_p30_kept === undefined ? r.mean_p30 : r.mean_p30_kept)) / rows.length : 0,
        carry_minutes: runs.reduce((a, r) => a + r.carry_minutes, 0) / runs.length,
        false_proof_rate: runs.reduce((a, r) => a + r.proofs, 0) ? runs.reduce((a, r) => a + r.false_proofs, 0) / runs.reduce((a, r) => a + r.proofs, 0) : 0,
        skipped_stages: rows.filter((r) => r.how === 'skipped').length,
        plan_problems: runs.reduce((a, r) => a + r.plan_problems, 0),
        violations: runs.flatMap((r) => r.violations),
        by_profile: {},
      };
      for (const prof of Object.keys(PROFILES)) {
        const pr = runs.filter((r) => r.prof === prof);
        const prows = pr.flatMap((r) => r.stages);
        const pm = prows.reduce((a, r) => a + r.metrics, 0);
        summary.by_profile[prof] = {
          completed_share: pr.filter((r) => r.completed_all).length / pr.length,
          minutes: pr.reduce((a, r) => a + r.minutes, 0) / pr.length,
          days: pr.reduce((a, r) => a + r.days, 0) / pr.length,
          competent_at_exit: pm ? prows.reduce((a, r) => a + r.competent, 0) / pm : 0,
          skipped: prows.filter((r) => r.how === 'skipped').length,
        };
      }
      summary.practice_minutes_by_kind = {};
      for (const r of runs) for (const [k, v] of Object.entries(r.kinds)) summary.practice_minutes_by_kind[k] = (summary.practice_minutes_by_kind[k] || 0) + v / runs.length;
      if (process.env.SKILL_AUDIT_DEBUG) console.log('   kinds', pol, JSON.stringify(Object.fromEntries(Object.entries(summary.practice_minutes_by_kind).map(([k, v]) => [k, Math.round(v)]))), 'x', rows.length);
      result.subjects[s][pol] = summary;
      const pct = (v) => `${(100 * v).toFixed(1)}%`;
      console.log(`  ${pol.padEnd(9)} ${pct(summary.completed_share).padStart(16)} ${summary.days.toFixed(0).padStart(5)} ${String(Math.round(summary.minutes)).padStart(8)} ${summary.minutes_per_stage.toFixed(0).padStart(10)} ${summary.sittings.toFixed(0).padStart(9)} ${pct(summary.unproven_at_exit).padStart(31)} ${pct(summary.competent_at_exit).padStart(27)} ${summary.mean_p_exit.toFixed(3).padStart(20)} ${summary.mean_p30.toFixed(3).padStart(14)} ${pct(summary.false_proof_rate).padStart(13)} ${String(summary.skipped_stages).padStart(15)}`);
      if (pol !== 'today') {
        for (const v of summary.violations) failures.push(`${pol} ${v}`);
        if (summary.plan_problems) failures.push(`${pol} ${s}: ${summary.plan_problems} plans dropped an unproven metric`);
        if (summary.unproven_at_exit > 0) failures.push(`${pol} ${s}: ${pct(summary.unproven_at_exit)} of metrics unproven when a stage was left`);
      }
    }
    const r2 = result.subjects[s].adaptive_r2;
    const r3 = result.subjects[s].adaptive;
    const gt = result.subjects[s].gate;
    console.log('  maintenance share (round 3), adaptive_r2 -> adaptive (gate):');
    console.log(`    30 days after exit, no practice meanwhile      ${r2.mean_p30.toFixed(3)} -> ${r3.mean_p30.toFixed(3)} (gate ${gt.mean_p30.toFixed(3)})`);
    if (r3.carry_minutes) console.log(`    30 days after exit, with the plan's carry-over ${r2.mean_p30_kept.toFixed(3)} -> ${r3.mean_p30_kept.toFixed(3)} (gate ${gt.mean_p30_kept.toFixed(3)}, no carry-over); carry-over minutes per learner ${Math.round(r3.carry_minutes)}`);
    console.log(`    practice minutes per stage                     ${r2.minutes_per_stage.toFixed(0)} -> ${r3.minutes_per_stage.toFixed(0)} (gate ${gt.minutes_per_stage.toFixed(0)})`);
    console.log(`    metrics truly at the bar at exit               ${(100 * r2.competent_at_exit).toFixed(1)}% -> ${(100 * r3.competent_at_exit).toFixed(1)}% (gate ${(100 * gt.competent_at_exit).toFixed(1)}%)`);
    const a = result.subjects[s].adaptive.by_profile;
    const g = result.subjects[s].gate.by_profile;
    console.log('  by profile (gate -> adaptive): minutes, stages skipped by placement');
    for (const prof of Object.keys(PROFILES)) console.log(`    ${prof.padEnd(12)} ${Math.round(g[prof].minutes)} -> ${Math.round(a[prof].minutes)} (x${(a[prof].minutes / g[prof].minutes).toFixed(2)}), skipped ${a[prof].skipped}, truly at threshold at exit ${(100 * g[prof].competent_at_exit).toFixed(0)}% -> ${(100 * a[prof].competent_at_exit).toFixed(0)}%`);
  }
  result.guarantee = { failures };
  console.log(`\nGUARANTEE (gate, adaptive): ${failures.length ? `${failures.length} FAILURES` : 'no stage was completed or skipped without every machine-provable metric proven on two cold days (re-derived from its sittings) and its knowledge gate complete; no plan dropped an unproven metric'}`);
  for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
  result.seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify(result, null, 1));
  const ok = !problems && !failures.length;
  console.log(`\n${ok ? 'PASS' : 'FAIL'} (${result.seconds}s)`);
  process.exitCode = ok ? 0 : 1;
}

main();
