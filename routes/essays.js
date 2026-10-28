/**
 * The written checkpoint: read the brief, keep the draft, mark the attempt.
 *
 * Three routes and no more. The prompt and rubric come back from `GET`, the
 * draft is saved on its own so a closed tab costs nothing, and submitting is
 * the only expensive call here — it is the one that spends a model, so it is the
 * one with the tighter rate limit.
 *
 * Nothing in this file can move a level. Passing is decided in `services/
 * sessions.js#resolveEssayCheckpoint` when the sitting is finished, exactly as
 * it is for a quiz, which means a crafted submit cannot advance anyone.
 */
const express = require('express');
const db = require('../config/db');
const essays = require('../services/essays');
const ai = require('../services/ai');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

/**
 * A larger body limit, for this router only.
 *
 * A draft is now markup rather than prose, and the same words in tags run to
 * several times their length before JSON escaping. The global limit in server.js
 * stays where it is — raising it there would widen the surface for every route in
 * the app — and this one sits above what an editor can send. It is generous on
 * purpose: a draft is cut down to the ceiling in the service, so the work of
 * trimming it belongs after the parse rather than in front of it, where an
 * oversized body would be a 413 and the writer would lose the paragraph they were
 * in the middle of.
 */
// inflate: false, as for the app's own parser in server.js (GHSA-27r3-jxmh-p828).
router.use(express.json({ limit: '1mb', inflate: false }));

/** House rule: someone else's row is a 404, so ids do not confirm existence. */
function load(req) {
  const row = db.byId('essays', req.params.id);
  if (!row || row.user_id !== req.user.id) return null;
  return row;
}

/** The brief: what to write, what it is marked against, and the last mark. */
router.get('/essays/:id', requireAuth, (req, res) => {
  const row = load(req);
  if (!row) return res.status(404).json({ error: 'Essay not found.' });
  res.json({ essay: essays.sanitize(row), ai: ai.isEnabled() });
});

/**
 * Save a draft.
 *
 * The bucket is sized for autosave rather than for occasional calls. This fires
 * every couple of seconds while someone types, plus on blur, on hiding the tab
 * and on signing out — the old 600/hour was ten a minute against a four-second
 * debounce, which is a 429 waiting to happen and was being swallowed into a
 * cheerful "saved" either way.
 *
 * A rejected save is reported as rejected. The client keeps the words locally and
 * tries again; a draft is never lost to a rate limit, but the learner is also
 * never told it reached the server when it did not.
 */
router.post('/essays/:id/draft', requireAuth, limit('essay-draft', 1200, 60 * 60 * 1000), (req, res) => {
  const row = load(req);
  if (!row) return res.status(404).json({ error: 'Essay not found.' });
  const saved = essays.saveDraft(row.id, req.body.text);
  res.json({
    saved: true,
    words: essays.wordCount(saved.plain || saved.draft),
    saved_at: saved.saved_at,
    truncated: saved.draft.length >= essays.MAX_DRAFT_CHARS,
  });
});

/**
 * Mark the attempt.
 *
 * Below the pass mark this is not a failure, it is a first draft: the mark comes
 * back with everything the rubric found, and the same prompt stays open so they
 * can go again. The learner is never shown a way past the gate other than
 * through it.
 */
router.post('/essays/:id/submit', requireAuth, limit('essay-submit', 20, 60 * 60 * 1000), async (req, res) => {
  const row = load(req);
  if (!row) return res.status(404).json({ error: 'Essay not found.' });

  // A spoken checkpoint is handed in through /oral, never marked as prose.
  if (row.mode === 'oral') return res.status(409).json({ error: 'This checkpoint is said aloud, not written.' });
  const result = await essays.grade(row, req.body.text, req.user.id);
  if (result.error) return res.status(400).json({ error: result.error, words: result.words });

  res.json({
    ...result,
    provider: ai.isEnabled() ? ai.providerName() : null,
    essay: essays.sanitize(db.byId('essays', row.id)),
  });
});

/**
 * Hand in a spoken checkpoint (preschool and Kindergarten "Explain Aloud" and
 * "Oral Retell"; services/essays.js oralSubmit). The body is two yes/no answers,
 * `said` and `parent_confirmed`. No sound, picture or text from the learner is
 * sent or accepted here: the recording, if any, never leaves their device.
 * Like /submit, nothing here moves a level; the sitting's finish decides.
 */
router.post('/essays/:id/oral', requireAuth, limit('essay-oral', 60, 60 * 60 * 1000), (req, res) => {
  const row = load(req);
  if (!row) return res.status(404).json({ error: 'Essay not found.' });
  const result = essays.oralSubmit(row, { said: req.body.said === true, parentConfirmed: req.body.parent_confirmed === true });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ...result, essay: essays.sanitize(db.byId('essays', row.id)) });
});

module.exports = router;
