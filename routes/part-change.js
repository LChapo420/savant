/**
 * The learner changes a part themselves (services/part-change.js). All of it is 404 with PART_CHANGE=off.
 *
 *   GET    /api/parts/prefs            { on, prefs }
 *   DELETE /api/parts/prefs[/:key]     forget one choice, or all of them
 *   POST   /api/parts/change           { change, topic?, item_id | material_id + skill_id | track + grade + level + ref }
 *   POST   /api/parts/revert           the same reference: the stored text back
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');
const parts = require('../services/part-change');

const router = express.Router();
const gated = (req, res, next) => (parts.on() ? next() : res.status(404).json({ error: 'No such endpoint.' }));

router.get('/parts/prefs', requireAuth, (req, res) => res.json({ on: parts.on(), prefs: parts.on() ? parts.prefsOf(req.user.id) : {} }));
router.delete('/parts/prefs', requireAuth, gated, (req, res) => res.json({ prefs: parts.clear(req.user.id) }));
router.delete('/parts/prefs/:key', requireAuth, gated, (req, res) => res.json({ prefs: parts.clear(req.user.id, String(req.params.key)) }));

function planOf(req) {
  const blockLevels = require('../services/block-levels'); // eslint-disable-line global-require
  return blockLevels.servedPlan(req.user, String(req.body.track), String(req.body.grade), Number(req.body.level));
}
const send = (res, out) => (out.error ? res.status(out.status || 400).json({ error: out.error }) : res.json(out));

router.post('/parts/change', requireAuth, gated, limit('part-change', 60, 60 * 60 * 1000), async (req, res) => {
  const b = req.body || {};
  const change = String(b.change || '');
  if (!parts.CHANGES.includes(change)) return res.status(400).json({ error: 'That change does not exist.' });
  const topic = change === 'topic' ? parts.cleanTopic(b.topic) : null;
  if (change === 'topic' && !topic) return res.status(400).json({ error: 'Say which topic you would like.' });
  if (b.item_id !== undefined) return send(res, await parts.changeItem(req.user.id, b.item_id, change, topic));
  if (b.material_id !== undefined) return send(res, await parts.changeLesson(req.user.id, b.material_id, b.skill_id, change, topic));
  if (b.ref !== undefined) return send(res, await parts.changeBlock(req.user.id, { plan: planOf(req), ref: b.ref }, change, topic));
  return res.status(400).json({ error: 'Say which part to change.' });
});
router.post('/parts/revert', requireAuth, gated, limit('part-change', 60, 60 * 60 * 1000), (req, res) => {
  const b = req.body || {};
  if (b.item_id !== undefined) return send(res, parts.revertItem(req.user.id, b.item_id));
  if (b.material_id !== undefined) return send(res, parts.revertLesson(req.user.id, b.material_id, b.skill_id));
  if (b.ref !== undefined) return send(res, parts.revertBlock(req.user.id, { plan: planOf(req), ref: b.ref }));
  return res.status(400).json({ error: 'Say which part to put back.' });
});

module.exports = router;
