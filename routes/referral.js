/**
 * Invite a friend: GET /api/referral gives the signed-in learner their code and
 * how many invited friends joined and started (services/referrals.js).
 */
const express = require('express');
const referrals = require('../services/referrals');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

router.get('/referral', requireAuth, limit('referral', 60, 60 * 60 * 1000), (req, res) => {
  if (!referrals.canShare(req.user)) return res.json({ enabled: false });
  const code = referrals.codeFor(req.user);
  res.json({ enabled: true, code, path: `/register?ref=${code}`, ...referrals.summary(req.user) });
});

module.exports = router;
