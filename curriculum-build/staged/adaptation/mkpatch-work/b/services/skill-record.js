/**
 * The skill record store (staged patch skills-round3/01-skill-record;
 * SKILL_RECORD=on). Chess, piano and basketball: one row per learner per
 * exit-battery metric in `skill_records`, holding every sitting of that
 * metric's stage test and its warm practice sets, folded by the rules in
 * services/skill-coverage.js (SKILL-CURRICULA.md section 2):
 *
 *   - cold or warm: a sitting is cold when it is the metric's first of the
 *     day and 20+ hours after the metric was last practised or sat;
 *   - day: proof needs cold passes on two different days;
 *   - source and confirmation: board, MIDI, on-screen keys, taps, screen
 *     answers and counts are exact; a microphone or camera result is an
 *     estimate and counts only when confirmed; a source the metric does not
 *     list never counts;
 *   - a Bayes belief over the counting sittings, so retaking until two lucky
 *     passes come cannot prove a metric.
 *
 * Rows hold times as epoch milliseconds (the rule functions do arithmetic on
 * them) and each sitting also carries its ISO time and UTC day. Nothing here
 * decides a stage on its own: services that read the record (the stage
 * checks, the stage gate, the practice plan: patches 02-04) do.
 *
 * Camera and microphone stay on the learner's device: only a sitting's result
 * (pass or fail, a score, a count) and, for piano, the played note events
 * reach this store, never a picture, a clip or sound.
 */
'use strict';

const db = require('../config/db');
const sc = require('./skill-coverage');

const COLLECTION = 'skill_records';
const KINDS = ['stage_test', 'retention_test', 'stands_test', 'placement', 'check'];

function enabled() {
  return String(process.env.SKILL_RECORD || 'off').toLowerCase() === 'on';
}

function isSkillTrack(trackId) {
  return sc.SUBJECTS.includes(trackId);
}

/** The stage a grade belongs to, or null. */
function stageFor(subject, gradeId) {
  if (!isSkillTrack(subject)) return null;
  return sc.stagesFor(subject).find((st) => st.grades.includes(gradeId)) || null;
}

/** A metric and its stage, by id ("CH1:kqk_playout"). */
function metricDef(subject, metricId) {
  if (!isSkillTrack(subject)) return null;
  for (const st of sc.stagesFor(subject)) {
    const mt = st.metrics.find((x) => x.id === metricId);
    if (mt) return { stage: st, metric: mt };
  }
  return null;
}

// ── sources ────────────────────────────────────────────────────────────────

const WORDS = ['board', 'midi', 'mic', 'on-screen', 'tap', 'screen', 'items', 'games', 'engine', 'count', 'camera', 'audio', 'verifier', 'self', 'log', 'film', 'human', 'import'];

/** The source words a metric lists, parenthesised options included ("count (camera estimate optional)"). */
function listedWords(mt) {
  const raw = String((mt.source && mt.source.raw) || '').toLowerCase();
  return WORDS.filter((w) => new RegExp(`(^|[^a-z-])${w.replace('-', '\\-')}([^a-z-]|$)`).test(raw)
    || (w === 'mic' && /mic-verifier/.test(raw)) || (w === 'on-screen' && /on-screen/.test(raw)));
}

/**
 * How a sitting's source counts for this metric: {word, cls, accepted, why}.
 * The class is skill-coverage's (exact | estimate | self | human | external);
 * a word the metric does not list is recorded but never counts.
 */
function readSitSource(mt, word) {
  const w = String(word || '').toLowerCase().trim();
  const cls = sc.sourceClass(w === 'on-screen' || w === 'screen-keys' ? 'on-screen' : w) || 'unknown';
  const listed = listedWords(mt);
  const accepted = !!w && listed.includes(w) && (cls === 'exact' || cls === 'estimate') && mt.source.provable;
  let why = null;
  if (!mt.source.provable) why = 'this metric is attested only: a machine never proves it';
  else if (!listed.includes(w)) why = `"${w || 'unknown'}" is not a source this metric lists (${mt.source.raw})`;
  else if (!(cls === 'exact' || cls === 'estimate')) why = `${w} never proves a metric`;
  return { word: w, cls, accepted, why };
}

// ── rows ───────────────────────────────────────────────────────────────────

function blankRow(userId, subject, stage, mt) {
  return {
    user_id: userId,
    subject,
    stage_id: stage.id,
    metric_id: mt.id,
    metric: mt.metric,
    ...sc.blankMetric(),
    warm: [],
    sets: 0,
    sets_at_proof: null,
    open: null,
  };
}

function rowFor(userId, subject, metricId) {
  return db.findOne(COLLECTION, (r) => r.user_id === userId && r.subject === subject && r.metric_id === metricId);
}

function ensureRow(userId, subject, metricId) {
  const def = metricDef(subject, metricId);
  if (!def) return null;
  return rowFor(userId, subject, metricId) || db.insert(COLLECTION, blankRow(userId, subject, def.stage, def.metric));
}

/** Save a row mutated in place (the rule functions write to it directly). */
function save(row) {
  const { id, ...rest } = row;
  return db.update(COLLECTION, id, rest);
}

/**
 * The learner's record for one subject, in the shape skill-coverage reads:
 * {subject, metrics: {metricId: row}}. Metrics never sat are blank (and not
 * stored).
 */
function recordFor(userId, subject) {
  const rec = { subject, metrics: {} };
  for (const st of sc.stagesFor(subject)) {
    for (const mt of st.metrics) rec.metrics[mt.id] = blankRow(userId, subject, st, mt);
  }
  for (const row of db.find(COLLECTION, (r) => r.user_id === userId && r.subject === subject)) {
    if (rec.metrics[row.metric_id]) rec.metrics[row.metric_id] = row;
  }
  return rec;
}

const dayIso = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * Record one sitting of a metric's stage test and fold it into the proof.
 *
 * @param {number} userId
 * @param {object} s {subject, metricId, pass, source (word), confirmed, kind, score, n, detail, at}
 * @returns {{row, sitting, counted: boolean, why: string|null, proved: boolean}|{error}}
 */
function sit(userId, s) {
  const def = metricDef(s.subject, s.metricId);
  if (!def) return { error: 'No such skill check.' };
  const { stage, metric: mt } = def;
  const at = Number.isFinite(s.at) ? s.at : Date.now();
  const src = readSitSource(mt, s.source);
  const row = ensureRow(userId, s.subject, s.metricId);
  const before = row.status;
  // A source the metric does not list is recorded with a class that cannot
  // count; skill-coverage.sit then marks it cold or warm as usual.
  const cls = src.accepted ? src.cls : 'unlisted';
  sc.sit({ metrics: { [mt.id]: row } }, stage, mt.id, { at, pass: !!s.pass, source: cls, confirmed: s.confirmed === true });
  const sitting = row.sittings[row.sittings.length - 1];
  Object.assign(sitting, {
    at_iso: new Date(at).toISOString(),
    day: dayIso(at),
    kind: KINDS.includes(s.kind) ? s.kind : 'stage_test',
    source_word: src.word,
    score: s.score === undefined ? null : s.score,
    n: s.n === undefined ? null : s.n,
    detail: s.detail || null,
  });
  if (!sitting.counts) {
    sitting.why_not = src.why
      || (!sitting.cold ? 'warm: not the first sitting of the day, or less than 20 hours after practising it' : null)
      || (src.cls === 'estimate' && s.confirmed !== true ? 'an estimate counts only when it is confirmed' : null);
  }
  if ((row.status === 'unproven' || row.status === 'lapsed') && before !== row.status) row.sets_at_proof = null;
  save(row);
  const proved = (before === 'unproven' || before === 'lapsed') && (row.status === 'proven' || row.status === 'retained');
  return { row, sitting, counted: !!sitting.counts, why: sitting.why_not || null, proved };
}

/**
 * One warm practice set on a metric: its time (it makes the next sitting warm
 * for 20 hours) and whether it was at the target. Counted for the practice
 * plan's over-learning dose (patch 04).
 */
function practise(userId, { subject, metricId, atTarget, at = Date.now() }) {
  const row = ensureRow(userId, subject, metricId);
  if (!row) return null;
  const proven = row.status === 'proven' || row.status === 'retained';
  row.last_practice_at = at;
  row.sets = (row.sets || 0) + 1;
  if (!proven) row.sets_at_proof = null;
  else if (row.sets_at_proof === null || row.sets_at_proof === undefined) row.sets_at_proof = row.sets - 1;
  row.warm = [...(row.warm || []), { at, atTarget: !!atTarget, day: dayIso(at) }].slice(-12);
  save(row);
  return row;
}

/** When the next sitting of a metric would be cold (ms), given `now`. */
function coldAt(row, now = Date.now(), k = sc.knobs()) {
  if (sc.isCold(row, now, k)) return now;
  const last = Math.max(row.last_practice_at || 0, row.last_sat_at || 0);
  const byHours = last + k.COLD_HOURS * sc.HOUR;
  const tomorrow = (Math.floor(now / sc.DAY) + 1) * sc.DAY;
  const satToday = (row.sittings || []).some((s) => Math.floor(s.at / sc.DAY) === Math.floor(now / sc.DAY));
  return Math.max(byHours, satToday ? tomorrow : 0, now);
}

/**
 * The knowledge side of a stage: each of its grades' coverage gate
 * (services/coverage.js) for this learner. A grade already graduated counts as
 * complete; a grade not enrolled does not.
 */
function knowledgeFor(userId, subject) {
  // eslint-disable-next-line global-require
  const coverage = require('./coverage');
  return (gradeId) => {
    const e = db.findOne('enrollments', (x) => x.user_id === userId && x.track_id === subject && x.grade_id === gradeId);
    if (!e) return { complete: false, why: 'not enrolled' };
    if (e.status === 'graduated') return { complete: true, why: 'graduated' };
    try {
      const cover = coverage.forEnrollment(userId, e);
      if (!cover) return { complete: true, why: 'no objective record for this grade' };
      return { complete: !!cover.gate.complete, why: `${cover.gate.total - cover.gate.blocking.length} of ${cover.gate.total} objectives proven and kept`, total: cover.gate.total, blocking: cover.gate.blocking.length };
    } catch (err) {
      return { complete: false, why: `coverage unavailable: ${err.message}` };
    }
  };
}

/**
 * The learner's current stage on an enrollment, as the pages show it: each
 * metric's status, its sittings and when it can next be sat cold, and the
 * stage gate (skill-coverage.stageGate) with the knowledge side.
 */
function stageView(userId, enrollment, now = Date.now()) {
  const stage = stageFor(enrollment.track_id, enrollment.grade_id);
  if (!stage) return null;
  const k = sc.knobs();
  const rec = recordFor(userId, enrollment.track_id);
  const knowledge = knowledgeFor(userId, enrollment.track_id);
  const gate = sc.stageGate(rec, stage, (g) => knowledge(g), now, k);
  const metrics = stage.metrics.map((mt) => {
    const row = rec.metrics[mt.id];
    const last = row.sittings.length ? row.sittings[row.sittings.length - 1] : null;
    const lastPass = sc.lastCountingPass(row);
    const retentionDue = row.status === 'proven' && stage.retention_days ? row.proven_at + stage.retention_days * sc.DAY : null;
    const stale = row.status === 'retained' && now - lastPass > k.STALE_DAYS * sc.DAY;
    return {
      id: mt.id,
      metric: mt.metric,
      test: mt.test,
      threshold: mt.threshold,
      source: mt.source.raw,
      provable: mt.source.provable,
      estimate: mt.source.estimate,
      status: mt.source.provable ? row.status : 'attest',
      belief: Number((row.B || 0).toFixed(3)),
      proof_days: (row.proof_days || []).length,
      proven_at: row.proven_at ? new Date(row.proven_at).toISOString() : null,
      retained_at: row.retained_at ? new Date(row.retained_at).toISOString() : null,
      retention_due_at: retentionDue ? new Date(retentionDue).toISOString() : null,
      stale,
      sittings: row.sittings.length,
      counting: row.sittings.filter((s) => s.counts).length,
      last: last ? { at: last.at_iso || new Date(last.at).toISOString(), pass: last.pass, counts: last.counts, cold: last.cold, source: last.source_word || last.source, confirmed: last.confirmed, why_not: last.why_not || null, score: last.score === undefined ? null : last.score } : null,
      cold_now: sc.isCold(row, now, k),
      cold_at: new Date(coldAt(row, now, k)).toISOString(),
      warm_sets: (row.warm || []).length,
    };
  });
  const grades = stage.grades.map((g) => ({ id: g, ...knowledge(g) }));
  return {
    subject: enrollment.track_id,
    stage: { id: stage.id, name: stage.name, grades: stage.grades, retention_days: stage.retention_days, retention_text: stage.retention_text, session_minutes: stage.session_minutes, knowledge: stage.knowledge },
    metrics,
    knowledge: grades,
    gate: { ...gate, provable: stage.metrics.filter((m) => m.source.provable).length, proven: metrics.filter((m) => m.provable && (m.status === 'proven' || m.status === 'retained')).length },
  };
}

/** Re-derive every proof on a stage from its sittings (skill-coverage.proofHolds). */
function auditStage(userId, subject, stageId) {
  const stage = sc.stagesFor(subject).find((s) => s.id === stageId);
  if (!stage) return null;
  const rec = recordFor(userId, subject);
  return stage.metrics.filter((m) => m.source.provable).map((mt) => {
    const row = rec.metrics[mt.id];
    const proven = row.status === 'proven' || row.status === 'retained';
    return { id: mt.id, status: row.status, holds: proven ? sc.proofHolds(stage, row, mt.id) : null };
  });
}

module.exports = {
  COLLECTION,
  enabled,
  isSkillTrack,
  stageFor,
  metricDef,
  listedWords,
  readSitSource,
  rowFor,
  ensureRow,
  recordFor,
  sit,
  practise,
  coldAt,
  knowledgeFor,
  stageView,
  auditStage,
};
