/**
 * Learn from your own material, slice (a) (services/materials.js).
 *
 *   GET    /api/materials          the learner's materials (no full text)
 *   POST   /api/materials?name=x   the file as the raw body (PDF, DOCX, TXT, MD), up to 20 MB
 *   POST   /api/materials/paste    { title?, text }
 *   GET    /api/materials/:id      one material with its full text
 *   DELETE /api/materials/:id      gone from the store and the disk copy
 *
 * Child accounts cannot upload or paste (routes/consent.js CHILD_MEDIA_UPLOAD); they can still delete.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');
const materials = require('../services/materials');

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
