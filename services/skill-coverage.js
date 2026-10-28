/**
 * Skill coverage: chess, piano and basketball in the same coverage model as
 * every other subject (services/coverage.js), per learner. Brought into the
 * app by the staged patch skills-round3/01-skill-record from
 * curriculum-build/staged/adaptation/skills/skill-coverage.js (the rules are
 * unchanged); the stages and batteries are content/skill-progressions/*.json,
 * copies of curriculum-build/staged/skills/<subject>/progression.json.
 * curriculum-build/ADAPTIVE-COVERAGE.md section 6; SKILL-CURRICULA.md.
 *
 * WHAT a stage must cover is fixed, in two parts:
 *   knowledge    the stage's grades' lesson objectives, exactly as for every
 *                other subject: coverage.modelFor(subject, grade), proven and
 *                kept by coverage.gate. Nothing new here.
 *   performance  the stage's exit battery (progression.json stages[].exit
 *                .performance): one metric per test, each with its own pass
 *                rule (counts, Beta posterior, rating with RD, play-outs)
 *                applied by the drill that runs the sitting. A stage that names
 *                a retention test ("again after 7+ days") also needs that.
 *
 * The per-learner skill record, per metric: every sitting of its test as
 * {at, pass, cold, source, confirmed}. The rules of SKILL-CURRICULA.md section 2,
 * as code:
 *   - Proof only: a metric is proven only by sittings of its test. Time spent,
 *     lessons done and self-ratings never prove it.
 *   - Cold only: a sitting counts when it is cold: the first sitting of that
 *     metric on its day, at least COLD_HOURS (20) after that metric was last
 *     practised or sat.
 *   - Two days: proven needs cold passes on two different days, and the latest
 *     cold sitting a pass.
 *   - Source honesty: exact sources (board, MIDI, on-screen keys, taps, screen
 *     answers, confirmed counts, recorded games, the engine) count. Estimates
 *     (microphone, camera) count only when confirmed (a second take, the
 *     verifier, a listener), so an estimate is never the only evidence.
 *     Self-report, film for a person to review, and imported ratings never
 *     prove; a metric whose only sources are those is `attest`: it is
 *     recorded and shown, never machine-proven, and the stage lists it.
 *   - Kept: a stage with a retention test needs a cold pass at least that many
 *     days after the proof. Two cold misses in a row after the proof lapse the
 *     metric: it must be proven again.
 *
 * The stage gate (stageGate) holds a stage complete, or skipped by placement,
 * until every knowledge objective is kept (coverage.gate) and every provable
 * metric is proven (and kept, where the stage names a retention test). The
 * same rule decides a skip: placement can only skip a stage by proving it.
 *
 * Pure: no database. services/skill-record.js keeps the record.
 */
'use strict';

const fs = require('fs');
const path = require('path');
// The learner's line for each metric (learner follow-ups 2026-10-24); test and threshold stay the build's.
const { plainFor } = require('../content/skill-learner-text');

const SKILLS_DIR = path.join(__dirname, '..', 'content', 'skill-progressions');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const SUBJECTS = ['chess', 'piano', 'basketball'];

function knobs() {
  const num = (name, fallback) => {
    const v = Number(process.env[name]);
    return process.env[name] !== undefined && process.env[name] !== '' && Number.isFinite(v) ? v : fallback;
  };
  return {
    COLD_HOURS: num('SKILL_COLD_HOURS', 20),
    PROOF_DAYS: num('SKILL_PROOF_DAYS', 2),
    LAPSE_MISSES: num('SKILL_LAPSE_MISSES', 2),
    PRIOR: num('SKILL_PRIOR', 0.5),
    PASS_IF_AT: num('SKILL_PASS_IF_AT', 0.85),
    LUCK: num('SKILL_LUCK', 0.15),
    PROVEN_AT: num('SKILL_PROVEN_AT', 0.95),
    // The battery must stand at exit: a metric whose last cold pass is older
    // than this needs a fresh cold sitting before the stage completes.
    STALE_DAYS: num('SKILL_STALE_DAYS', 7),
    DEFAULT_RETAIN_DAYS: num('SKILL_DEFAULT_RETAIN_DAYS', 0),
  };
}

// ── sources ────────────────────────────────────────────────────────────────

/** One source word's class. */
function sourceClass(word) {
  const w = String(word || '').toLowerCase().trim();
  if (!w) return null;
  if (/count/.test(w)) return 'exact'; // confirmed counts (a parent's count too)
  if (/^(board|midi|on-screen|tap|screen|items|games|engine)$/.test(w)) return 'exact';
  if (/verifier/.test(w)) return 'estimate';
  if (/mic|camera|audio|estimate/.test(w)) return 'estimate';
  if (/import|external/.test(w)) return 'external';
  if (/human|teacher|listener|film/.test(w)) return 'human';
  if (/self|log/.test(w)) return 'self';
  return 'unknown';
}

/**
 * A metric's source string ("midi | mic", "count + camera estimate",
 * "film + self", "games + import") read as what can prove it.
 *   provable  some required part is exact and no required part needs a person
 *             or self-report;
 *   exact     an exact source exists;
 *   estimate  an estimate source exists (counts only when confirmed);
 *   attest    not machine-provable: recorded and listed, never proven here.
 */
function readSource(source) {
  const raw = String(source || '').replace(/\([^)]*\)/g, ' ');
  // "a + b": both parts take part; within a part "x | y" or "x / y" are
  // alternatives. An estimate or import part added to an exact one is
  // supplementary (never the only evidence, never required).
  const parts = raw.split('+').map((p) => p.split(/[|/]/).map((x) => sourceClass(x)).filter(Boolean)).filter((p) => p.length);
  const classes = new Set(parts.flat());
  const partClass = (alts) => (alts.includes('exact') ? 'exact' : alts.includes('estimate') ? 'estimate' : alts.includes('external') ? 'external' : alts.includes('human') ? 'human' : alts.includes('self') ? 'self' : 'unknown');
  const kinds = parts.map(partClass);
  const needsPerson = kinds.some((c) => c === 'human' || c === 'self');
  const exact = kinds.includes('exact');
  const provable = exact && !needsPerson;
  return { provable, exact, estimate: classes.has('estimate'), attest: !provable, kinds, raw: String(source || '') };
}

// ── stages ─────────────────────────────────────────────────────────────────

const cache = new Map();

/** The stages of one skill subject, from its staged progression. */
function stagesFor(subject) {
  if (cache.has(subject)) return cache.get(subject);
  const file = path.join(SKILLS_DIR, `${subject}.json`);
  const prog = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stages = prog.stages.map((st, index) => {
    const retentionText = (st.exit && st.exit.retention) || '';
    const m = /(\d+)\s*\+?\s*days/.exec(retentionText);
    const metrics = ((st.exit && st.exit.performance) || []).map((p) => ({
      id: `${st.id}:${p.metric}`,
      metric: p.metric,
      test: p.test || '',
      threshold: p.threshold || '',
      plain: plainFor(`${st.id}:${p.metric}`),
      source: readSource(p.source),
      tag: p.tag || '',
    }));
    return {
      subject,
      index,
      id: st.id,
      name: st.name,
      grades: st.grades || [],
      objectives: st.objectives || [],
      knowledge: (st.exit && st.exit.knowledge) || '',
      metrics,
      // A stage that names no retention test gets the default one (a cold
      // pass DEFAULT_RETAIN_DAYS after the proof), as every coverage objective
      // must be kept after it is proven. 0 turns the default off.
      retention_days: m ? Number(m[1]) : (knobs().DEFAULT_RETAIN_DAYS || null),
      retention_default: !m,
      retention_text: retentionText,
      session_minutes: (st.practice && st.practice.session_minutes) || null,
    };
  });
  cache.set(subject, stages);
  return stages;
}

/**
 * Machine checks of every stage: every metric has a test, a pass rule and a
 * source; the stage's grades exist in the app and have knowledge objectives
 * (coverage.modelFor); a stage with no provable metric is listed (it can only
 * be attested, so its performance part cannot gate). With `checks` (a metric id
 * -> its sitting, content/skill-stage-checks.js checkFor), every provable metric
 * is also asked whether a machine sitting exists for it: one that does not can
 * never be proven, so with the stage gate on its stage cannot be left.
 */
function validate(subject, { coverage = null, checks = null } = {}) {
  const problems = [];
  const notes = [];
  let metrics = 0;
  let provable = 0;
  let wired = 0;
  let knowledgeObjectives = 0;
  for (const st of stagesFor(subject)) {
    if (!st.objectives.length) problems.push(`${st.id}: no objectives`);
    if (!st.metrics.length) problems.push(`${st.id}: no exit battery`);
    for (const mt of st.metrics) {
      metrics += 1;
      if (!mt.test) problems.push(`${mt.id}: no test`);
      if (!mt.threshold) problems.push(`${mt.id}: no pass rule`);
      if (!mt.source.raw) problems.push(`${mt.id}: no source`);
      if (mt.source.kinds.includes('unknown')) problems.push(`${mt.id}: unknown source "${mt.source.raw}"`);
      if (mt.source.provable) provable += 1;
    }
    if (checks) {
      const unwired = st.metrics.filter((x) => x.source.provable).filter((x) => { const d = checks(x.id); return !d || d.how === 'not_wired'; });
      wired += st.metrics.filter((x) => x.source.provable).length - unwired.length;
      if (unwired.length) notes.push(`${st.id}: provable but no machine sitting yet: ${unwired.map((x) => x.metric).join(', ')}`);
    }
    if (!st.metrics.some((x) => x.source.provable)) notes.push(`${st.id}: no machine-provable metric (${st.metrics.map((x) => `${x.metric}[${x.source.raw}]`).join(', ')}); its performance part is attested, not gated`);
    if (coverage) {
      for (const g of st.grades) {
        const model = coverage.modelFor(subject, g);
        if (!model) problems.push(`${st.id}: grade ${g} has no coverage model`);
        else knowledgeObjectives += model.objectives.length;
      }
    }
  }
  return { ok: !problems.length, problems, notes, stats: { stages: stagesFor(subject).length, metrics, provable, ...(checks ? { wired } : {}), knowledge_objectives: knowledgeObjectives } };
}

// ── the record ─────────────────────────────────────────────────────────────

function blankMetric() {
  return {
    status: 'unproven', // unproven | proven | retained | lapsed
    sittings: [],
    last_practice_at: null,
    last_sat_at: null,
    proof_days: [],
    proven_at: null,
    retained_at: null,
    cold_misses_after: 0,
    lapses: 0,
    B: knobs().PRIOR,
  };
}

function blankRecord(subject) {
  const rec = { subject, metrics: {} };
  for (const st of stagesFor(subject)) for (const mt of st.metrics) rec.metrics[mt.id] = blankMetric();
  return rec;
}

const dayOf = (t) => Math.floor(t / DAY);

/** Practice on a metric (warm work): only its time matters to coldness. */
function practise(rec, metricId, at) {
  const m = rec.metrics[metricId];
  if (m) m.last_practice_at = at;
}

/**
 * Is a sitting at `at` cold? The first sitting of the metric on its day, and
 * COLD_HOURS or more since it was last practised or sat.
 */
function isCold(m, at, k = knobs()) {
  const last = Math.max(m.last_practice_at === null ? -Infinity : m.last_practice_at, m.last_sat_at === null ? -Infinity : m.last_sat_at);
  if (m.sittings.some((s) => dayOf(s.at) === dayOf(at))) return false;
  return at - last >= k.COLD_HOURS * HOUR;
}

/**
 * Fold one sitting of a metric's test: {at, pass, source: 'exact'|'estimate'|
 * 'self'|'human'|'external', confirmed}. Returns the metric's state.
 */
function sit(rec, stage, metricId, sitting, k = knobs()) {
  const mt = stage.metrics.find((x) => x.id === metricId);
  const m = rec.metrics[metricId];
  if (!mt || !m) throw new Error(`unknown metric ${metricId}`);
  const cold = isCold(m, sitting.at, k);
  const counts = cold && mt.source.provable
    && (sitting.source === 'exact' || (sitting.source === 'estimate' && sitting.confirmed === true));
  m.sittings.push({ at: sitting.at, pass: !!sitting.pass, cold, source: sitting.source, confirmed: sitting.confirmed === true, counts });
  m.last_sat_at = sitting.at;
  if (!counts) return m;
  const d = dayOf(sitting.at);
  // The belief that the learner is at the gate's threshold, from every
  // counting sitting: a pass is PASS_IF_AT likely at the threshold and LUCK
  // likely below it (about the staged gates' own simulated error rates). Two
  // passes from the even prior prove a metric, as the two-day rule says; each
  // miss in between needs another pass, so retaking until two lucky passes
  // come cannot prove it (sequential testing).
  const yes = sitting.pass ? k.PASS_IF_AT : 1 - k.PASS_IF_AT;
  const no = sitting.pass ? k.LUCK : 1 - k.LUCK;
  m.B = (m.B * yes) / (m.B * yes + (1 - m.B) * no);
  if (m.status === 'unproven' || m.status === 'lapsed') {
    if (sitting.pass) {
      if (!m.proof_days.some((x) => x.day === d)) m.proof_days.push({ day: d, source: sitting.source });
      // An estimate counted only with its confirmation (a second take, the
      // verifier, a listener), so it is never the only evidence.
      if (m.proof_days.length >= k.PROOF_DAYS && m.B >= k.PROVEN_AT) {
        m.status = stage.retention_days ? 'proven' : 'retained';
        m.proven_at = sitting.at;
        m.retained_at = stage.retention_days ? null : sitting.at;
        m.cold_misses_after = 0;
      }
    }
    return m;
  }
  // Proven or retained: a retention check, or a lapse.
  if (sitting.pass) {
    m.cold_misses_after = 0;
    if (m.status === 'proven' && stage.retention_days && sitting.at - m.proven_at >= stage.retention_days * DAY) {
      m.status = 'retained';
      m.retained_at = sitting.at;
    }
  } else {
    m.cold_misses_after += 1;
    if (m.cold_misses_after >= k.LAPSE_MISSES || m.B < 0.5) {
      m.B = Math.min(m.B, k.PRIOR);
      m.status = 'lapsed';
      m.lapses += 1;
      m.proof_days = [];
      m.proven_at = null;
      m.retained_at = null;
      m.cold_misses_after = 0;
    }
  }
  return m;
}

/**
 * The stage gate. With `now`, a proven metric whose last cold pass is more
 * than STALE_DAYS old is `stale` and holds the stage until a fresh cold
 * sitting passes: the battery must stand when the stage is left. `knowledge` is {gradeId: {complete: boolean}} from
 * coverage.gate for each of the stage's grades (or a function of gradeId);
 * missing means not complete. Attest-only metrics are listed and never block
 * or prove (owner decision 6b in ADAPTIVE-COVERAGE.md: whether a person's
 * sign-off should be required for them).
 *
 * @returns {{complete, knowledge_ok, missing: string[], unkept: string[], attest: string[], knowledge_missing: string[]}}
 */
function stageGate(rec, stage, knowledge = {}, now = null, k = knobs()) {
  const missing = [];
  const unkept = [];
  const attest = [];
  const stale = [];
  for (const mt of stage.metrics) {
    if (!mt.source.provable) { attest.push(mt.id); continue; }
    const m = rec.metrics[mt.id];
    if (!m || m.status === 'unproven' || m.status === 'lapsed') missing.push(mt.id);
    else if (m.status === 'proven') unkept.push(mt.id);
    else if (now !== null && now - lastCountingPass(m) > k.STALE_DAYS * DAY) stale.push(mt.id);
  }
  const knowledgeMissing = stage.grades.filter((g) => {
    const v = typeof knowledge === 'function' ? knowledge(g) : knowledge[g];
    return !(v && v.complete);
  });
  const knowledgeOk = !knowledgeMissing.length;
  return { complete: knowledgeOk && !missing.length && !unkept.length && !stale.length, knowledge_ok: knowledgeOk, missing, unkept, stale, attest, knowledge_missing: knowledgeMissing };
}

/** When the metric last passed a counting (cold) sitting. */
function lastCountingPass(m) {
  for (let j = m.sittings.length - 1; j >= 0; j--) if (m.sittings[j].counts && m.sittings[j].pass) return m.sittings[j].at;
  return -Infinity;
}

/**
 * The proof behind a metric marked proven, re-derived from its sittings: at
 * least PROOF_DAYS distinct days with a counting cold pass, the last counting
 * sitting before the proof a pass, and an exact one among them when the
 * metric has an exact source. The audit runs this on every stage a learner
 * completed or skipped.
 */
function proofHolds(stage, m, metricId, k = knobs()) {
  const mt = stage.metrics.find((x) => x.id === metricId);
  if (!mt || !mt.source.provable) return { ok: false, why: 'not machine-provable' };
  if (m.status !== 'proven' && m.status !== 'retained') return { ok: false, why: `status ${m.status}` };
  const counting = m.sittings.filter((s) => s.counts && s.at <= m.proven_at);
  const passDays = new Set(counting.filter((s) => s.pass).map((s) => dayOf(s.at)));
  if (passDays.size < k.PROOF_DAYS) return { ok: false, why: `cold passes on ${passDays.size} day(s)` };
  if (!counting.length || !counting[counting.length - 1].pass) return { ok: false, why: 'last counting sitting before the proof was not a pass' };
  if (counting.some((s) => !(s.source === 'exact' || (s.source === 'estimate' && s.confirmed)))) return { ok: false, why: 'an unconfirmed estimate, self-report, person or import counted' };
  if (counting.some((s) => !s.cold)) return { ok: false, why: 'a warm sitting counted' };
  if (stage.retention_days && m.status === 'retained') {
    const later = m.sittings.filter((s) => s.counts && s.pass && s.at - m.proven_at >= stage.retention_days * DAY);
    if (!later.length) return { ok: false, why: 'retained without a retention sitting' };
  }
  return { ok: true };
}

module.exports = {
  SUBJECTS,
  DAY,
  HOUR,
  knobs,
  sourceClass,
  readSource,
  stagesFor,
  validate,
  blankRecord,
  blankMetric,
  practise,
  isCold,
  sit,
  stageGate,
  lastCountingPass,
  proofHolds,
};
