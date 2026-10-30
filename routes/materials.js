/**
 * Learn from your own material, slice (a) (services/materials.js).
 *
 *   GET    /api/materials          the learner's materials (no full text)
 *   POST   /api/materials?name=x   the file as the raw body (PDF, DOCX, PPTX, TXT, MD), up to 20 MB
 *   POST   /api/materials/paste    { title?, text }
 *   POST   /api/materials/link     { url, title? } a public web page, fetched by the server (SSRF-guarded), article text kept
 *   POST   /api/materials/youtube     { url, title? } captions of a YouTube video (never the video)
 *   POST   /api/materials/video       raw mp4/mov/webm/mkv body, ?name= audio is pulled out, the video is deleted, S8's job transcribes it
 *   POST   /api/materials/transcript  { title?, text, link? } a pasted video transcript (YouTube is never contacted)
 *   GET    /api/materials/:id      one material with its full text
 *   DELETE /api/materials/:id      gone from the store and the disk copy, and its course with it
 *   POST   /api/materials/:id/course   start building the course (202; resumes a partial one)
 *   GET    /api/materials/:id/course   the course's status and skill list (no answers)
 *   POST   /api/materials/:id/course/retry  try the parts that were left out again (202; the result shows in GET .../course as last_retry)
 *   POST   /api/materials/:id/course/more   more practice on the same skills (202; the outcome shows in GET .../course as last_extend)
 *   POST   /api/materials/:id/course/add    { material_id } join another of the learner's materials onto this path (202)
 *   GET    /api/materials/:id/study               the map: skills, status, what is due
 *   GET    /api/materials/:id/study/lesson/:skill  lesson and practice questions (no answers)
 *   POST   /api/materials/:id/study/practice       { skill, question, answer } checked at once, not counted
 *   GET    /api/materials/:id/study/placement      the next starting-check question (no answer), or the result
 *   POST   /api/materials/:id/study/placement      { question, answer } then the next question or the result
 *   POST   /api/materials/:id/study/quiz           { mode: mastery|review, skill? } one-shot quiz, no answers
 *   POST   /api/materials/:id/pack     start building the study pack (summary, flashcards, quiz, practice test; 202)
 *   GET    /api/materials/:id/pack     the pack's status and content (no answer keys); ?adapt=1 leaves out quiz/test items on skills you already know
 *   POST   /api/materials/:id/notes        start making whole-material notes (202); GET returns them with quotes and coverage
 *   GET    /api/materials/:id/podcast      the overview and weak-spots episodes (script only) and which weak spots there are
 *   POST   /api/materials/:id/podcast      { kind: overview|weak } start writing an episode script (202)
 *   POST   /api/materials/:id/pack/grade   { section: quiz|test, answers } marked on the server
 *   GET    /api/materials/:id/test         what a practice test can be made of (skills, lengths) and the last results
 *   POST   /api/materials/:id/test         { skills, length, timed, adapt } start a practice test (questions without keys); adapt: only what the learner does not know, is due or missed
 *   POST   /api/materials/:id/test/submit  { test_id, answers } graded on the server; feeds the learner model
 *   GET    /api/materials/:id/cards        the flashcard deck (pack cards, your misses, your own) with what is due
 *   GET    /api/materials/:id/cards/pick   the cards worth your time now (due ones, new ones except for skills you already know)
 *   GET    /api/materials/:id/cards/due    the cards due now
 *   POST   /api/materials/:id/cards        { front, back } write a card
 *   POST   /api/materials/:id/cards/review { card, rating: again|hard|good|easy }
 *   PATCH  /api/materials/:id/cards/:card  { front?, back? } edit a card
 *   DELETE /api/materials/:id/cards/:card
 *   POST   /api/materials/:id/study/submit         { quiz_id, answers } graded on the server
 *
 * Child accounts cannot upload or paste (routes/consent.js CHILD_MEDIA_UPLOAD); they can still delete.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');
const materials = require('../services/materials');
const courses = require('../services/course-builder');
const extend = require('../services/course-extend');
const study = require('../services/material-study');
const packs = require('../services/material-pack');
const practiceTest = require('../services/material-test');
const cards = require('../services/material-cards');
const podcast = require('../services/material-podcast');
const notes = require('../services/material-notes');

const router = express.Router();

// Any content type that is not JSON is read as raw bytes; the type is decided from the bytes.
const rawBody = express.raw({ type: (req) => !/json/i.test(req.headers['content-type'] || ''), limit: materials.MAX_BYTES });
const videoBody = express.raw({ type: (req) => !/json/i.test(req.headers['content-type'] || ''), limit: require('../services/material-video').MAX_VIDEO_BYTES });
const pasteBody = express.json({ limit: '3mb', inflate: false });

const STATUS = { limit: 409, too_big: 413, too_long: 413, too_many_pages: 413, no_transcriber: 503, no_ffmpeg: 503, busy: 409, no_captions: 422, unavailable: 422 };
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

router.post('/link', requireAuth, limit('materials-link', 10, 60 * 60 * 1000), pasteBody, async (req, res) => {
  const b = req.body || {};
  let out;
  try { out = await materials.addLink(req.user.id, b.url, b.title); } catch (err) {
    console.error('materials link:', err.message);
    return res.status(400).json({ error: 'That page could not be read.', code: 'unreadable' });
  }
  if (out.error) return refuse(res, out);
  res.status(201).json({ material: out.value, materials: materials.list(req.user.id) });
});

// A YouTube link: only its caption text is read; the video is never downloaded.
router.post('/youtube', requireAuth, limit('materials-youtube', 10, 60 * 60 * 1000), pasteBody, async (req, res) => {
  const b = req.body || {};
  let out;
  try { out = await materials.addYoutube(req.user.id, b.url, b.title); } catch (err) {
    console.error('materials youtube:', err.message);
    return res.status(400).json({ error: 'That video could not be read.', code: 'unreadable' });
  }
  if (out.error) return refuse(res, out);
  res.status(201).json({ material: out.value, materials: materials.list(req.user.id) });
});

// A video file: the audio is pulled out here, the video is deleted, and S8's background job transcribes it.
router.post('/video', requireAuth, limit('materials-video', 6, 60 * 60 * 1000), videoBody, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Choose a video to upload.', code: 'empty' });
  let out;
  try { out = await require('../services/material-video').submitVideo(req.user.id, req.body, String(req.query.name || '')); } catch (err) { // eslint-disable-line global-require
    console.error('materials video:', err.message);
    return res.status(400).json({ error: 'That video could not be read.', code: 'unreadable' });
  }
  if (out.error) return refuse(res, out);
  res.status(202).json({ job: out.job, jobs: require('../services/material-audio').listJobs(req.user.id) }); // eslint-disable-line global-require
});

router.post('/transcript', requireAuth, limit('materials-transcript', 20, 60 * 60 * 1000), pasteBody, (req, res) => {
  const b = req.body || {};
  const out = materials.addTranscript(req.user.id, b.title, b.text, b.link);
  if (out.error) return refuse(res, out);
  res.status(201).json({ material: out.value, materials: materials.list(req.user.id) });
});

// Audio recordings (S8): transcribed on this server with an open Whisper model, in the background.
const audio = require('../services/material-audio');
router.get('/audio', requireAuth, (req, res) => res.json({ available: audio.availability(), jobs: audio.listJobs(req.user.id) }));
router.post('/audio', requireAuth, limit('materials-audio', 6, 60 * 60 * 1000), rawBody, (req, res) => {
  const out = audio.submit(req.user.id, req.body, String(req.query.name || ''));
  if (out.error) return refuse(res, out);
  out.finished.catch(() => {});
  res.status(202).json({ job: out.job, jobs: audio.listJobs(req.user.id) });
});
router.delete('/audio/:id', requireAuth, (req, res) => {
  if (!audio.removeJob(req.user.id, req.params.id)) return res.status(404).json({ error: 'No such finished job.' });
  res.json({ jobs: audio.listJobs(req.user.id) });
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

// One build at a time per learner (services/build-gate.js): a second one waits and the page says "queued".
const gate = require('../services/build-gate');
const queueBuild = (userId, label, fn) => {
  if (gate.queuedFor(userId, label)) return false;
  gate.run(userId, label, fn).catch((err) => console.warn(`${label}: ${err.message}`));
  return true;
};
/** What the page shows besides the row: waiting for the learner's other build, or for a retry. */
const activityOf = (userId, label, extra = {}) => {
  const st = gate.state(userId);
  const queued = gate.queuedFor(userId, label);
  return { ...extra, ...(queued ? { queued: { behind: st.running || null, ahead: st.waiting.indexOf(label) } } : {}) };
};

router.post('/:id/course', requireAuth, limit('materials-course', 6, 60 * 60 * 1000), (req, res) => {
  const m = materials.get(req.user.id, req.params.id, false);
  if (!m) return res.status(404).json({ error: 'No such material.' });
  const userId = req.user.id;
  const existing = courses.get(userId, m.id);
  if (existing && existing.status === 'ready' && existing.version === courses.VERSION) return res.json({ course: courses.summary(existing), cached: true });
  if (courses.inflight.has(`${userId}:${m.id}`)) return res.status(202).json({ started: true, busy: true });
  queueBuild(userId, `course:${m.id}`, () => courses.build(userId, m.id, {}).then((out) => { if (out.error && out.code !== 'busy') console.warn(`course-builder: ${out.code}`); }));
  res.status(202).json({ started: true });
});

router.get('/:id/course', requireAuth, (req, res) => {
  if (!materials.get(req.user.id, req.params.id, false)) return res.status(404).json({ error: 'No such material.' });
  res.json({ course: courses.summary(courses.get(req.user.id, req.params.id)), activity: activityOf(req.user.id, `course:${Number(req.params.id)}`) });
});

router.post('/:id/course/retry', requireAuth, limit('materials-course-retry', 6, 60 * 60 * 1000), (req, res) => {
  const c = courses.get(req.user.id, req.params.id);
  if (!materials.get(req.user.id, req.params.id, false) || !c) return res.status(404).json({ error: 'No such course.' });
  if (!(c.missed || []).some((m) => m.reason !== 'too_long')) return res.status(409).json({ error: 'Nothing was left out of this course.', code: 'nothing_missed' });
  if (courses.inflight.has(`${req.user.id}:${c.material_id}`)) return res.status(409).json({ error: 'This course is being changed right now.', code: 'busy' });
  queueBuild(req.user.id, `course:${c.material_id}`, () => courses.retryMissed(req.user.id, c.material_id).catch((err) => console.warn(`course-builder: ${err.message}`)));
  res.status(202).json({ started: true });
});

const ownMaterial = (req, res, next) => (materials.get(req.user.id, req.params.id, false) ? next() : res.status(404).json({ error: 'No such material.' }));

const EXTEND_STATUS = { no_course: 409, busy: 409, not_found: 404, already_added: 409, too_many: 409, too_long: 409, same_material: 400 };
function extendRoute(kind) {
  return (req, res) => {
    const userId = req.user.id;
    const c = courses.get(userId, req.params.id);
    if (!c || !['ready', 'partial'].includes(c.status) || !(c.skills || []).length) return res.status(409).json({ error: 'Build the learning path first.', code: 'no_course' });
    if (courses.inflight.has(`${userId}:${c.material_id}`)) return res.status(409).json({ error: 'This course is being changed right now.', code: 'busy' });
    const args = {};
    if (kind === 'add') {
      const sourceId = Number((req.body || {}).material_id);
      if (!Number.isInteger(sourceId) || sourceId === c.material_id) return res.status(400).json({ error: 'Pick a different material to add.', code: 'same_material' });
      if (!materials.get(userId, sourceId, false)) return res.status(404).json({ error: 'No such material.', code: 'not_found' });
      if ((c.added || []).some((a) => a.material_id === sourceId)) return res.status(EXTEND_STATUS.already_added).json({ error: 'That material is already on this path.', code: 'already_added' });
      args.sourceId = sourceId;
    } else if (Array.isArray((req.body || {}).skills)) args.skillIds = req.body.skills.slice(0, 60).map(String);
    queueBuild(userId, `course:${c.material_id}`, () => extend.start(kind, userId, c.material_id, args).catch((err) => console.warn(`course-extend: ${err.message}`)));
    return res.status(202).json({ started: true });
  };
}
router.post('/:id/course/more', requireAuth, ownMaterial, limit('materials-course-more', 6, 60 * 60 * 1000), express.json({ limit: '8kb' }), extendRoute('more'));
router.post('/:id/course/add', requireAuth, ownMaterial, limit('materials-course-add', 6, 60 * 60 * 1000), express.json({ limit: '8kb' }), extendRoute('add'));


router.post('/:id/pack', requireAuth, limit('materials-pack', 6, 60 * 60 * 1000), (req, res) => {
  const m = materials.get(req.user.id, req.params.id, false);
  if (!m) return res.status(404).json({ error: 'No such material.' });
  const existing = packs.get(req.user.id, m.id);
  if (existing && existing.status === 'ready' && existing.version === packs.VERSION) return res.json({ pack: packs.view(existing), cached: true });
  const label = `pack:${m.id}`;
  if (!gate.queuedFor(req.user.id, label)) {
    // Each attempt takes its turn in the learner's line; the wait between attempts does not hold it.
    packs.buildWithRetry(req.user.id, m.id, { between: (fn) => gate.run(req.user.id, label, fn) })
      .then((out) => { if (out.error && out.code !== 'busy') console.warn(`material-pack: ${out.code}`); })
      .catch((err) => console.warn(`material-pack: ${err.message}`));
  }
  res.status(202).json({ started: true });
});

router.get('/:id/pack', requireAuth, (req, res) => {
  if (!materials.get(req.user.id, req.params.id, false)) return res.status(404).json({ error: 'No such material.' });
  if (req.query.adapt === '1') {
    const mine = packs.forLearner(req.user.id, req.params.id);
    return res.json(mine ? { pack: mine.pack, shown: mine.ids, skipped_known: mine.skipped_known } : { pack: null });
  }
  res.json({ pack: packs.view(packs.get(req.user.id, req.params.id)), activity: activityOf(req.user.id, `pack:${Number(req.params.id)}`, packs.activity(req.user.id, req.params.id)) });
});

router.post('/:id/pack/grade', requireAuth, ownMaterial, limit('materials-pack-grade', 120, 60 * 60 * 1000), express.json({ limit: '64kb' }), (req, res) => {
  const b = req.body || {};
  const out = packs.grade(req.user.id, req.params.id, String(b.section || ''), b.answers, Array.isArray(b.only) ? b.only.slice(0, 200).map(String) : undefined);
  if (out.error) return res.status(out.code === 'no_pack' ? 404 : 400).json({ error: out.error, code: out.code });
  res.json(out);
});

router.get('/:id/notes', requireAuth, ownMaterial, (req, res) => res.json({ notes: notes.view(notes.get(req.user.id, req.params.id)) }));
router.post('/:id/notes', requireAuth, ownMaterial, limit('materials-notes', 6, 60 * 60 * 1000), (req, res) => {
  const existing = notes.get(req.user.id, req.params.id);
  if (existing && existing.status === 'ready' && existing.version === notes.VERSION) return res.json({ notes: notes.view(existing), cached: true });
  notes.build(req.user.id, req.params.id, {}).then((out) => { if (out.error && out.code !== 'busy') console.warn(`material-notes: ${out.code}`); });
  res.status(202).json({ started: true });
});
router.get('/:id/podcast', requireAuth, ownMaterial, (req, res) => res.json({ ...podcast.options(req.user.id, req.params.id), activity: ['overview', 'weak'].reduce((a, k) => ({ ...a, ...activityOf(req.user.id, `podcast:${Number(req.params.id)}:${k}`) }), {}) }));
router.post('/:id/podcast', requireAuth, ownMaterial, limit('materials-podcast', 6, 60 * 60 * 1000), express.json({ limit: '4kb' }), (req, res) => {
  const kind = String((req.body || {}).kind || 'overview');
  if (!podcast.KINDS.includes(kind)) return res.status(400).json({ error: 'Choose an overview or a weak-spots episode.', code: 'bad_kind' });
  if (kind === 'weak' && !podcast.weakSkills(req.user.id, req.params.id).length) return res.status(409).json({ error: 'There are no weak spots to talk about yet. Study some of the learning path first, then come back.', code: 'no_weak_spots' });
  queueBuild(req.user.id, `podcast:${Number(req.params.id)}:${kind}`, () => podcast.build(req.user.id, req.params.id, { kind }).then((out) => { if (out.error && out.code !== 'busy') console.warn(`material-podcast: ${out.code}`); }));
  res.status(202).json({ started: true });
});

const CARD_STATUS = { not_found: 404, no_card: 404, full: 409 };
function cardReply(res, out) {
  if (out.error) return res.status(CARD_STATUS[out.code] || 400).json({ error: out.error, code: out.code });
  return res.json(out);
}
const cardBody = express.json({ limit: '16kb' });
router.get('/:id/cards', requireAuth, ownMaterial, (req, res) => cardReply(res, cards.deck(req.user.id, req.params.id)));
router.get('/:id/cards/pick', requireAuth, ownMaterial, (req, res) => cardReply(res, cards.pick(req.user.id, req.params.id, Number(req.query.limit) || 20)));
router.get('/:id/cards/due', requireAuth, ownMaterial, (req, res) => cardReply(res, cards.due(req.user.id, req.params.id, Number(req.query.limit) || 20)));
router.post('/:id/cards/review', requireAuth, ownMaterial, limit('materials-cards-review', 600, 60 * 60 * 1000), cardBody, (req, res) => {
  const b = req.body || {};
  cardReply(res, cards.review(req.user.id, req.params.id, String(b.card || ''), String(b.rating || '')));
});
router.post('/:id/cards', requireAuth, ownMaterial, limit('materials-cards-write', 120, 60 * 60 * 1000), cardBody, (req, res) => cardReply(res, cards.add(req.user.id, req.params.id, req.body)));
router.patch('/:id/cards/:card', requireAuth, ownMaterial, limit('materials-cards-write', 120, 60 * 60 * 1000), cardBody, (req, res) => cardReply(res, cards.edit(req.user.id, req.params.id, req.params.card, req.body)));
router.delete('/:id/cards/:card', requireAuth, ownMaterial, limit('materials-cards-write', 120, 60 * 60 * 1000), (req, res) => cardReply(res, cards.remove(req.user.id, req.params.id, req.params.card)));

const STUDY_STATUS = { no_course: 404, not_found: 404, locked: 403, no_quiz: 409, no_test: 409, empty: 400, already_placed: 409, nothing_due: 409, use_placement: 409, not_practice: 409 };
function studyReply(res, out, key) {
  if (out.error) return res.status(STUDY_STATUS[out.code] || 400).json({ error: out.error, code: out.code });
  return res.json(key ? { [key]: out[key] } : out);
}
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

router.get('/:id/test', requireAuth, ownMaterial, (req, res) => studyReply(res, practiceTest.options(req.user.id, req.params.id)));
router.post('/:id/test', requireAuth, ownMaterial, limit('materials-test', 30, 60 * 60 * 1000), studyBody, (req, res) => {
  const b = req.body || {};
  studyReply(res, practiceTest.start(req.user.id, req.params.id, { skills: b.skills, length: b.length, timed: b.timed === true, adapt: b.adapt === true }));
});
router.post('/:id/test/submit', requireAuth, ownMaterial, limit('materials-test-submit', 30, 60 * 60 * 1000), studyBody, async (req, res) => {
  const b = req.body || {};
  try { studyReply(res, await practiceTest.submit(req.user.id, req.params.id, b.test_id, b.answers)); } catch (err) { console.error('material-test:', err.message); res.status(500).json({ error: 'The test could not be marked.' }); }
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
