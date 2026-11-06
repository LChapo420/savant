/**
 * The speed proof's learner API (services/speed-proof.js, docs/SPEED-PROOF.md).
 *
 *   GET  /api/speed-proof                 availability, the plain-language consent wording, the learner's own answer, their skills' ways
 *   POST /api/speed-proof/consent         { normal_arm: true|false }  the optional plain-way arm (a no is always fine and changes nothing)
 *   POST /api/speed-proof/switch          { skill_id }  move a plain-way skill to the Savant way, any time
 *   POST /api/speed-proof/check/start     the 30-second memory check (also offered inside the daily check)
 *   POST /api/speed-proof/check/answer    { check_id, answers }
 *
 * The owner's report is GET /api/admin/speed-proof (routes/admin.js), admin only.
 */
const express = require('express');
const speedProof = require('../services/speed-proof');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();
router.use(requireAuth);

const reply = (res, out) => (out && out.error ? res.status(out.code === 'not_allowed' ? 403 : out.code === 'not_found' || out.code === 'nothing_due' ? 404 : 400).json({ error: out.error, code: out.code }) : res.json(out));

router.get('/', (req, res) => res.json(speedProof.status(req.user)));
router.post('/consent', limit('speed-proof-c', 20, 60 * 1000), (req, res) => reply(res, speedProof.setConsent(req.user, !!(req.body && req.body.normal_arm))));
router.post('/switch', limit('speed-proof-s', 30, 60 * 1000), (req, res) => reply(res, speedProof.switchToSavant(req.user.id, String((req.body && req.body.skill_id) || ''), 'learner')));
router.post('/check/start', limit('speed-proof-k', 20, 60 * 1000), (req, res) => reply(res, speedProof.start(req.user)));
router.post('/check/answer', limit('speed-proof-k', 40, 60 * 1000), (req, res) => reply(res, speedProof.answer(req.user, req.body && req.body.check_id, req.body && req.body.answers)));

module.exports = router;
