/**
 * The upload route, over HTTP: a slow reading carries on in the background with progress and ends as a material; a recording sent
 * to the document box is sent to the transcriber; an oversized body gets a plain JSON 413 from the error handler.
 *   node scripts/uploads-route-test.js
 */
const os = require('os'); const path = require('path'); const http = require('http');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-route-${process.pid}.json`);
// Windows reuses process ids: an old run's file under this name would add its rows to this run's.
try { require('fs').unlinkSync(process.env.DB_FILE); } catch { /* none there */ }
process.env.UPLOAD_SLOW_MS = '200';
const express = require('express');
const db = require('../config/db');
const parsers = require('../services/material-parsers');
const fx = require('./lib/upload-fixtures');
let failures = 0;
const check = (label, ok, detail) => { if (ok) console.log(`  ok   ${label}`); else { failures++; console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const router = require('../routes/materials');
  const audio = require('../services/material-audio');
  const u = db.insert('users', { email: 'r@example.test', display_name: 'R', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  const app = express();
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/materials', router);
  app.use((err, req, res, next) => { // same rule as server.js
    if (res.headersSent) return undefined;
    if (err && (err.type === 'entity.too.large' || err.status === 413)) return res.status(413).json({ error: 'too big', code: 'too_big' });
    return res.status(500).json({ error: 'x' });
  });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;
  const call = (method, url, body) => new Promise((ok, fail) => {
    const data = body || null;
    const req = http.request({ host: '127.0.0.1', agent: false, port, path: url, method, headers: { 'content-type': 'application/octet-stream', 'x-user': String(u.id), ...(data ? { 'content-length': data.length } : {}) } }, (res) => {
      let text = ''; res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json }); });
    });
    req.on('error', fail); if (data) req.write(data); req.end();
  });

  // a scan of two pages whose OCR is slow
  const scan = await fx.build('pdf-scan', fx.DOCS.tides);
  const PAGE = 'Tides are caused mainly by the moon gravity pulling on the oceans and the sun adds a smaller pull as well. '.repeat(3);
  parsers.setOcr(async () => { await sleep(500); return { text: PAGE }; });
  const r = await call('POST', '/api/materials?name=scan.pdf', scan);
  check('a slow reading answers 202 with a job', r.status === 202 && r.json.job && r.json.job.what === 'reading', r);
  let job = null;
  for (let i = 0; i < 40; i++) { await sleep(300); job = audio.listJobs(u.id).find((j) => j.what === 'reading'); if (job && (job.status === 'done' || job.status === 'failed')) break; }
  check('the job finishes done with a material and had progress', job && job.status === 'done' && job.material_id, job);
  check('the material is in the list', db.byId('materials', job && job.material_id), job);
  parsers.setOcr(null);

  // a recording sent to the document box
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(200)]);
  const a = await call('POST', '/api/materials?name=memo.wav', wav);
  check('audio sent to the document box goes to the transcriber (a job or a plain refusal about the recorder, never "unknown type")', (a.status === 202 && a.json.job) || (a.json && /transcri|Whisper|audio/i.test(a.json.error || '')), a);

  // oversized body
  const big = await call('POST', '/api/materials?name=big.bin', Buffer.alloc(21 * 1024 * 1024, 65));
  check('a body over the limit gets a JSON 413', big.status === 413 && big.json && big.json.code === 'too_big', big);
  server.close();
  console.log(failures ? `${failures} FAILED` : 'All checks passed.');
  process.exit(failures ? 1 : 0);
})();
