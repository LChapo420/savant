/**
 * /api/es/path — the main Spanish path played with the Duolingo-style
 * activities (services/spanish/path.js). Signed in only; every call is about
 * one of the learner's own enrollments.
 *
 *   GET  /level?enrollment=&level=   build a run for the level (current one by default);
 *                                    { fallback } when the ordinary session teaches it
 *   POST /finish { run, hits, total } close the run: evidence, review queue, XP, next level
 *   GET  /fit?enrollment=            the goal line, the levels put aside, the review queue
 */
const express = require('express');
const db = require('../../config/db');
const curriculum = require('../../config/curriculum');
const learnerPath = require('../../services/learner-path');
const esPath = require('../../services/spanish/path');
const catchUp = require('../../services/spanish/catch-up');
const voice = require('../../services/spanish/voice');
const { requireAuth, canSkip } = require('../../middleware/auth');
const { limit } = require('../../utils/rate-limit');

const router = express.Router();
router.use(requireAuth);

function ownEnrollment(req, id) {
  const e = db.byId('enrollments', Number(id));
  return e && e.user_id === req.user.id && e.track_id === 'spanish' ? e : null;
}

const classicUrl = (enrollment, level) => `/session?enrollment=${enrollment.id}${level !== enrollment.current_level ? `&level=${level}` : ''}&classic=1`;

router.get('/level', limit('es-path-level', 120, 60 * 60 * 1000), (req, res) => {
  let enrollment = ownEnrollment(req, req.query.enrollment);
  // Standing on a level the learner's goal puts aside: move on to the next one it keeps.
  if (enrollment && !req.query.level) enrollment = esPath.settleDeferred(enrollment);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  if (enrollment.status === 'placement_pending') return res.status(409).json({ error: 'Take the placement quiz for this subject first.', placement: `/placement?enrollment=${enrollment.id}` });
  if (enrollment.status === 'graduated') return res.status(409).json({ error: 'You have graduated this grade. Pick the next one.' });
  const grade = curriculum.getGrade('spanish', enrollment.grade_id);
  if (!grade) return res.status(400).json({ error: 'That grade is no longer available.' });
  const level = req.query.level ? Number(req.query.level) : enrollment.current_level;
  if (!Number.isInteger(level) || level < 1 || level > grade.pathLength) return res.status(400).json({ error: 'No such level.' });
  // The same rule as the ordinary session (routes/learn.js mayOpenLevel): behind
  // is the learner's own, a proved unit is open, ahead needs the skip permission.
  const known = (learnerPath.unitAt(enrollment, level, grade) || {}).status === 'known';
  // A level of a catch-up block is open: the block is the learner's route (services/spanish/catch-up.js).
  const inCatchUp = catchUp.allowsLevel(req.user.id, enrollment, level);
  if (!(level <= enrollment.current_level || canSkip(req.user) || known || inCatchUp)) return res.status(403).json({ error: 'That level is not open yet.' });
  if (!esPath.supports(enrollment.grade_id, level)) return res.json({ fallback: classicUrl(enrollment, level) });
  const built = esPath.startRun({ user: req.user, enrollment, level });
  if (!built) return res.json({ fallback: classicUrl(enrollment, level) });
  const row = grade.levels.find((l) => l.level === level);
  const fit = esPath.pathFit(enrollment);
  res.json({
    run: built.id,
    level: esPath.publicLevel(built),
    slot: built.slot,
    slot_label: esPath.SLOT_LABEL[built.slot] || row.type,
    row: { level, title: row.title, type: row.type, activity: row.activity, unit: row.unit, minutes: Number(row.minutes) || null },
    grade: { id: grade.id, name: grade.name, path_length: grade.pathLength },
    enrollment: { id: enrollment.id, current_level: enrollment.current_level },
    preview: level !== enrollment.current_level,
    catch_up: inCatchUp ? catchUp.labelFor(req.user.id, enrollment, level) : null,
    fit: fit ? { profile: fit.profile, label: fit.label, why: fit.why, deferred: !!fit.deferred[level] } : null,
    voice: { server: voice.ttsEnabled() || voice.gatewayFor(req.user.id), asr: voice.asrEnabled() || voice.gatewayFor(req.user.id) },
    classic: classicUrl(enrollment, level),
  });
});

router.post('/finish', limit('es-path-finish', 120, 60 * 60 * 1000), (req, res) => {
  const runId = String((req.body && req.body.run) || '');
  if (!esPath.isRunId(runId)) return res.status(400).json({ error: 'No such level run.' });
  const out = esPath.finishRun({ user: req.user, runId, client: { hits: req.body.hits, total: req.body.total } });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json(out);
});

router.get('/fit', (req, res) => {
  const enrollment = ownEnrollment(req, req.query.enrollment);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  res.json({ fit: esPath.pathFit(enrollment) });
});

module.exports = router;
