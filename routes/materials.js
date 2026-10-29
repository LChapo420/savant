/**
 * Learn from your own material, slice (a) (services/materials.js).
 *
 *   GET    /api/materials          the learner's materials (no full text)
 *   POST   /api/materials?name=x   the file as the raw body (PDF, DOCX, TXT, MD), up to 20 MB
 *   POST   /api/materials/paste    { title?, text }
 *   GET    /api/materials/:id      one material with its full text
 *   DELETE /api/materials/:id      gone from the store and the disk copy, and its course with it
 *   POST   /api/materials/:id/course   start building the course (202; resumes a partial one)
 *   GET    /api/materials/:id/course   the course's status and skill list (no answers)
 *   GET    /api/materials/:id/study               the map: skills, status, what is due
 *   GET    /api/materials/:id/study/lesson/:skill  lesson and practice questions (no answers)
 *   POST   /api/materials/:id/study/practice       { skill, question, answer } checked at once, not counted
 *   GET    /api/materials/:id/study/placement      the next starting-check question (no answer), or the result
 *   POST   /api/materials/:id/study/placement      { question, answer } then the next question or the result
 *   POST   /api/materials/:id/study/quiz           { mode: mastery|review, skill? } one-shot quiz, no answers
 *   POST   /api/materials/:id/study/submit         { quiz_id, answers } graded on the server
 *
 * Child accounts cannot upload or paste (routes/consent.js CHILD_MEDIA_UPLOAD); they can still delete.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');
const materials = require('../services/materials');
const courses = require('../services/course-builder');
const study = require('../services/material-study');

const router = express.Router();

// Any content type that is not JSON is read as raw bytes; the type is decided from the bytes.
const rawBody = express.raw({ type: (req) => !/json/i.test(req.headers['content-type'] || ''), limit: materials.MAX_BYTES });
const pasteBody = express.json({ limit: '3mb', inflate: false });

const STATUS = { limit: 409, too_big: 413, too_long: 413, too_many_pages: 413 };
function refuse(res, out) {
  return res.status(STATUS[out.code] || 400).json({ error: out.error, code: out.code });
}

router.get('/', requireAuth, (req, res) => {
  res.json({
    materials: materials.list(req.user.id),
    limits: { max_mb: materials.MAX_BYTES / 1024 / 1024, max_pages: materials.MAX_PAGES, max_items: materials.MAX_ITEMS },
  });
});

// Home page: how many of the learner's own-material skills are due for review (before '/:id').
router.get('/review-due', requireAuth, (req, res) => res.json(study.dueSummary(req.user.id)));

router.post('/paste', requireAuth, limit('materials-paste', 20, 60 * 60 * 1000), pasteBody, (req, res) => {
  const b = req.body || {};
  const out = materials.addPaste(req.user.id, b.title, b.text);
  if (out.error) return refuse(res, out);
  res.status(201).json({ material: out.value, materials: materials.list(req.user.id) });
});

router.post('/', requireAuth, limit('materials-upload', 12, 60 * 60 * 1000), rawBody, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Choose a file to upload.', code: 'empty' });
  let out;
  try { out = await materials.addFile(req.user.id, req.body, String(req.query.name || '')); } catch (err) {
    console.error('materials upload:', err.message);
    return res.status(400).json({ error: 'That file could not be read.', code: 'unreadable' });
  }
  if (out.error) return refuse(res, out);
  res.status(201).json({ material: out.value, materials: materials.list(req.user.id) });
});

router.post('/:id/course', requireAuth, limit('materials-course', 6, 60 * 60 * 1000), (req, res) => {
  const m = materials.get(req.user.id, req.params.id, false);
  if (!m) return res.status(404).json({ error: 'No such material.' });
  const userId = req.user.id;
  const existing = courses.get(userId, m.id);
  if (existing && existing.status === 'ready' && existing.version === courses.VERSION) return res.json({ course: courses.summary(existing), cached: true });
  courses.build(userId, m.id, {}).then((out) => { if (out.error && out.code !== 'busy') console.warn(`course-builder: ${out.code}`); });
  res.status(202).json({ started: true });
});

router.get('/:id/course', requireAuth, (req, res) => {
  if (!materials.get(req.user.id, req.params.id, false)) return res.status(404).json({ error: 'No such material.' });
  res.json({ course: courses.summary(courses.get(req.user.id, req.params.id)) });
});

const STUDY_STATUS = { no_course: 404, not_found: 404, locked: 403, no_quiz: 409, already_placed: 409, nothing_due: 409, use_placement: 409 };
function studyReply(res, out, key) {
  if (out.error) return res.status(STUDY_STATUS[out.code] || 400).json({ error: out.error, code: out.code });
  return res.json(key ? { [key]: out[key] } : out);
}
const ownMaterial = (req, res, next) => (materials.get(req.user.id, req.params.id, false) ? next() : res.status(404).json({ error: 'No such material.' }));
const studyBody = express.json({ limit: '64kb' });

router.get('/:id/study', requireAuth, ownMaterial, (req, res) => studyReply(res, study.state(req.user.id, req.params.id)));
router.get('/:id/study/lesson/:skill', requireAuth, ownMaterial, (req, res) => studyReply(res, study.lesson(req.user.id, req.params.id, req.params.skill)));
router.get('/:id/study/placement', requireAuth, ownMaterial, (req, res) => studyReply(res, study.placementNext(req.user.id, req.params.id)));
router.post('/:id/study/placement', requireAuth, ownMaterial, limit('materials-placement', 300, 60 * 60 * 1000), studyBody, (req, res) => {
  const b = req.body || {};
  studyReply(res, study.placementAnswer(req.user.id, req.params.id, String(b.question || ''), b.answer));
});
router.post('/:id/study/practice', requireAuth, ownMaterial, limit('materials-practice', 300, 60 * 60 * 1000), studyBody, (req, res) => {
  const b = req.body || {};
  studyReply(res, study.practice(req.user.id, req.params.id, String(b.skill || ''), String(b.question || ''), b.answer));
});
router.post('/:id/study/quiz', requireAuth, ownMaterial, limit('materials-quiz', 60, 60 * 60 * 1000), studyBody, (req, res) => {
  const b = req.body || {};
  studyReply(res, study.startQuiz(req.user.id, req.params.id, String(b.mode || ''), String(b.skill || '')));
});
router.post('/:id/study/submit', requireAuth, ownMaterial, limit('materials-submit', 60, 60 * 60 * 1000), studyBody, (req, res) => {
  const b = req.body || {};
  studyReply(res, study.submit(req.user.id, req.params.id, b.quiz_id, b.answers));
});

router.get('/:id', requireAuth, (req, res) => {
  const m = materials.get(req.user.id, req.params.id, true);
  if (!m) return res.status(404).json({ error: 'No such material.' });
  res.json({ material: m });
});

router.delete('/:id', requireAuth, (req, res) => {
  if (!materials.remove(req.user.id, req.params.id)) return res.status(404).json({ error: 'No such material.' });
  res.json({ materials: materials.list(req.user.id) });
});

module.exports = router;
