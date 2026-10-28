const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lab = require('../services/game-lab');
const games = require('../services/game-payloads');
const router = express.Router();
// Developer previews are public locally, admin-only on a production deployment.
router.use((req, res, next) => {
  if (!req.path.startsWith('/api/game-lab') && !req.path.startsWith('/game-lab/')) return next();
  if (process.env.NODE_ENV === 'production') return require('../middleware/auth').requireAdmin(req, res, next);
  return next();
});
router.get('/api/game-lab', (req, res) => res.json(lab.list()));
router.get('/api/game-lab/:id/payload', (req, res) => {
  const payload = lab.payload(req.params.id);
  if (!payload) return res.status(404).json({ error: 'No such game.' });
  return res.json(payload);
});
router.get('/game-lab/play/:id', (req, res) => {
  if (!games.schemaFor(req.params.id)) return res.status(404).send('No such game.');
  const id = req.params.id;
  // Moto X3M and Mario are full game pages (their engine blocks load the game
  // from /games/<id>/). Bake the shared topic questions into the injection
  // marker and serve the page directly, so the death gate reads GAME_DATA in the
  // token-saving fill format. No game code is model-filled.
  if (id === 'moto-x3m' || id === 'mario') {
    const payload = lab.payload(id);
    let html = games.inject(id, payload);
    // The injection is a single inline script (it carries the filled questions).
    // The strict CSP forbids inline script, so give just that one a per-response
    // nonce rather than opening 'unsafe-inline' for the whole page.
    const nonce = crypto.randomBytes(16).toString('base64');
    // The injection script may be one line or several; match it by its opening.
    html = html.replace(/<script>(\s*window\.GAME_ID)/, `<script nonce="${nonce}">$1`);
    // The shared shell supplies the question cursor + lab telemetry (absolute
    // path, unaffected by the engine's <base href>).
    html = html.replace('</body>', '<script src="/games/lab-shell.js"></script></body>');
    res.removeHeader('X-Frame-Options');
    // Phaser (Moto X3M) needs eval; the canvas Mario game does not.
    const evalPolicy = id === 'moto-x3m' ? " 'unsafe-eval'" : '';
    res.set('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'${evalPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'`);
    res.set('Cache-Control', 'no-store');
    return res.send(html);
  }
  const original = fs.readFileSync(path.join(__dirname, '..', 'public', 'games', 'engines', `${id}.html`), 'utf8');
  let body = original;
  if (id === 'tetris') {
    body = original.replace(/<script>[\s\S]*?<\/script>/, '<script src="/game-lab/tetris.js"></script>');
  } else {
    body = original.replace(/<script>[\s\S]*?<\/script>/, '<script src="/games/lab-entry.js"></script>');
  }
  res.removeHeader('X-Frame-Options');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  res.set('Cache-Control', 'no-store');
  return res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${id} test</title></head><body data-engine="${id}">${body}<script src="/games/lab-shell.js"></script></body></html>`);
});
router.get('/game-lab/tetris.js', (req, res) => {
  const html = games.engineHtml('tetris');
  res.type('application/javascript').set('Cache-Control', 'no-store').send(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
module.exports = router;