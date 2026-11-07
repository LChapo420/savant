/**
 * Speed under load: many learners upload at once over the real route (no model involved). Time to the first useful thing (the material's key points are back), median and worst per type, event-loop lag and CPU.
 *   NODE_PATH=<playwright, tesseract.js> node scripts/uploads-load.js [learners=20]
 * MEASURED on this PC; say the CPU beside any number.
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
process.env.NODE_ENV = 'test';
process.env.UPLOAD_AUTOBUILD = 'off';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-load-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
const express = require('express');
const db = require('../config/db');
const R = require('./lib/real-files');

(async () => {
  const N = Number(process.argv[2] || 20);
  const app = express(); app.set('trust proxy', true);
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/materials', require('../routes/materials'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;
  const post = (buf, name, user) => new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', agent: false, port, path: `/api/materials?name=${name}`, method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-user': String(user), 'x-forwarded-for': `10.2.${user % 250}.1`, 'content-length': buf.length } }, (res) => {
      let t = ''; res.setEncoding('utf8'); res.on('data', (c) => { t += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { j = {}; } ok({ status: res.statusCode, json: j }); });
    });
    req.on('error', fail); req.write(buf); req.end();
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-'));
  const CH = await R.chromeFiles(dir);
  const docx = await R.docx(); const pptx = await R.pptx();
  const txt = Buffer.from(R.PLANTED.join(' ').repeat(20));
  const big = Buffer.from(`${R.PLANTED.join(' ')}\n\n`.repeat(1100));
  const kinds = { txt: [txt, 'a.txt'], pdf: [CH.textPdf, 'a.pdf'], docx: [docx, 'a.docx'], pptx: [pptx, 'a.pptx'], longpdf: [CH.pdf120, 'b.pdf'], big800kb: [big, 'big.txt'], png: [CH.png, 'a.png'], scan3: [CH.scannedPdf, 'scan.pdf'] };
  fs.rmSync(dir, { recursive: true, force: true });

  let lagMax = 0; let last = Date.now();
  const lagT = setInterval(() => { const now = Date.now(); lagMax = Math.max(lagMax, now - last - 50); last = now; }, 50);
  const cpu0 = process.cpuUsage(); const t0 = Date.now();
  const jobs = [];
  for (let i = 0; i < N; i++) {
    const u = db.insert('users', { email: `l${i}@example.test`, display_name: 'L', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
    const names = Object.keys(kinds);
    const k = names[i % names.length];
    jobs.push({ k, u: u.id });
  }
  const rows = await Promise.all(jobs.map(async ({ k, u }) => {
    const t = Date.now();
    const r = await post(kinds[k][0], kinds[k][1], u);
    let end = Date.now() - t; let how = r.status;
    if (r.status === 202) { // reading went on in the background: wait for the material
      while (Date.now() - t < 300000) {
        await new Promise((res) => setTimeout(res, 300));
        if (db.find('materials', (m) => m.user_id === u).length) { end = Date.now() - t; how = '202 then done'; break; }
      }
    }
    return { k, ms: end, first_ms: Date.now() - t, how };
  }));
  clearInterval(lagT);
  const wall = (Date.now() - t0) / 1000; const cpu = process.cpuUsage(cpu0);
  const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
  for (const k of Object.keys(kinds)) {
    const v = rows.filter((r) => r.k === k).map((r) => r.ms);
    if (v.length) console.log(`${k.padEnd(9)} n ${String(v.length).padStart(2)} median ${(q(v, 0.5) / 1000).toFixed(1)} s worst ${(Math.max(...v) / 1000).toFixed(1)} s  ${rows.find((r) => r.k === k).how}`);
  }
  const all = rows.map((r) => r.ms);
  console.log(`all n ${all.length}: median ${(q(all, 0.5) / 1000).toFixed(1)} s, worst ${(Math.max(...all) / 1000).toFixed(1)} s; wall ${wall.toFixed(0)} s; main process CPU ${(100 * (cpu.user + cpu.system) / 1e6 / wall / os.cpus().length).toFixed(0)}% of ${os.cpus().length} threads; event loop worst stall ${lagMax} ms; load average n/a on Windows`);
  server.close();
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
