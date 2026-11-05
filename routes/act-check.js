/**
 * The free ACT level check (no account) and the owner's recruiting page. See services/act-check.js.
 *
 * Public, under /api/act-check: visit, start, answer, submit, result, apply. The guest's token travels in the
 * X-Guest-Token header (never a URL). Admin only, under /api/recruit: stats, applicants (JSON or CSV).
 */
const express = require('express');
const check = require('../services/act-check');
const { requireAdmin } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();
const recruit = express.Router();
const HOUR = 60 * 60 * 1000;

const tokenOf = (req) => String(req.get('x-guest-token') || '');
const guestOf = (req, res) => {
  const guest = check.guestFor(tokenOf(req));
  if (!guest) res.status(401).json({ error: 'This check was not found. Start a new one.', code: 'no_guest' });
  return guest;
};
const fail = (res, out) => res.status(out.status || 400).json({ error: out.error, field: out.field });

/** One page view of /act-check (counted once per browser tab by the page). */
router.post('/visit', limit('act-check-visit', 240, HOUR), (req, res) => {
  check.visit({ ref: req.body.ref, ch: req.body.ch });
  res.json({ ok: true });
});

/** The 13+ answer comes first. Under 13: nothing is created. */
router.post('/start', limit('act-check-start', 60, HOUR), (req, res) => {
  if (req.body.age13 === false) return res.json({ under13: true });
  if (req.body.age13 !== true && !check.guestFor(tokenOf(req))) return res.status(400).json({ error: 'Tell us whether you are 13 or older first.', field: 'age13' });
  const out = check.begin({ ref: req.body.ref, ch: req.body.ch, token: tokenOf(req) });
  if (out.error) return fail(res, out);
  res.json({ token: out.token, state: out.state, finished: !!out.guest.finished_at });
});

router.get('/state', limit('act-check-state', 600, HOUR), (req, res) => {
  const guest = guestOf(req, res);
  if (!guest) return;
  res.json({ state: check.stateOf(guest), finished: !!guest.finished_at });
});

router.post('/answer', limit('act-check-answer', 1500, HOUR), (req, res) => {
  const guest = guestOf(req, res);
  if (!guest) return;
  const out = check.answer(guest, req.body.grade_id, req.body.index, req.body.answer);
  if (out.error) return res.status(400).json({ error: out.error });
  res.json(out);
});

router.post('/submit', limit('act-check-submit', 300, HOUR), (req, res) => {
  const guest = guestOf(req, res);
  if (!guest) return;
  const out = check.submit(guest, req.body.answers);
  if (out.error) return fail(res, out);
  res.json({ state: out.state, finished: out.state.phase === 'done' });
});

/** The estimate, the three weakest areas, and the visitor's place in line once they have applied. */
router.get('/result', limit('act-check-result', 300, HOUR), (req, res) => {
  const guest = guestOf(req, res);
  if (!guest) return;
  if (!guest.finished_at) return res.status(409).json({ error: 'Finish the check to see your result.' });
  res.json({ result: guest.result, standing: check.standing(guest), agree_text: check.AGREE_TEXT, email_text: check.EMAIL_TEXT, definition: 'Qualified means: finished the check, 13 or older, agreed to about 30 minutes a day, and a valid email.' });
});

router.post('/apply', limit('act-check-apply', 12, HOUR), (req, res) => {
  const guest = guestOf(req, res);
  if (!guest) return;
  const out = check.apply(guest, req.body || {});
  if (out.error) return fail(res, out);
  res.status(201).json({ ok: true, standing: check.standing(check.guestFor(tokenOf(req))) });
});

recruit.use(requireAdmin);
recruit.get('/stats', (req, res) => res.json(check.stats()));
recruit.get('/applicants', (req, res) => {
  const rows = check.applicantList();
  if (req.query.format !== 'csv') return res.json({ applicants: rows });
  const cols = ['position', 'email', 'name', 'applied_at', 'qualified', 'ref', 'channel', 'qualified_referrals', 'composite', 'status'];
  const esc = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? `'${s}` : s; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => `"${esc(r[c]).replace(/"/g, '""')}"`).join(','))].join('\n');
  res.type('text/csv').send(csv);
});

module.exports = { router, recruit };
