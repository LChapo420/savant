/**
 * Does the lesson's code get written where the browser can load it, and does the
 * browser then run it and wire its controls?
 *
 * The whole point of the script route is that the content security policy will
 * only let a lesson's code run if it arrives as a same-origin file. This drives
 * the real router, checks the file lands under public/ where the static mount can
 * serve it, and then loads it the way the page does — as a <script src> — and
 * clicks the controls.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const db = require('../config/db');
const baseLessons = require('../config/base-lessons');
const router = require('../routes/base-lessons');

const [userIdRaw, track, grade, levelRaw] = process.argv.slice(2);
const level = Number(levelRaw);
const user = db.byId('users', Number(userIdRaw));

const html = baseLessons.get(track, grade, level);
if (!html) { console.error('no generated page for that level'); process.exit(1); }

const scripts = (html.html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [])
  .map((s) => s.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, ''));
console.log('scripts in the page:', scripts.length, '| total', 
  scripts.reduce((n, s) => n + s.length, 0), 'characters');

// The real router, with a session attached.
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { req.user = user; req.session = { userId: user.id }; next(); });
app.use(router);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

(async () => {
  const res = await fetch(`${base}/lessons/${track}/${grade}/${level}/script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scripts }),
  });
  const body = await res.json();
  console.log('POST script:', res.status, JSON.stringify(body).slice(0, 200));
  if (!body.files) { server.close(); process.exit(1); }

  // Is the file where the static mount will serve it?
  body.files.forEach((url) => {
    const clean = url.split('?')[0];
    const onDisk = path.join(ROOT, 'public', clean);
    console.log(`  ${url.split('?')[0]}`);
    console.log(`    on disk: ${fs.existsSync(onDisk)} (${fs.existsSync(onDisk) ? fs.statSync(onDisk).size : 0} bytes)`);
  });

  // Now load it the way the page does and see whether the controls work.
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>'
    + '<div id="base-lesson-host"></div></body></html>',
  { runScripts: 'dangerously', resources: 'usable' });
  const { window } = dom;

  const template = window.document.createElement('template');
  template.innerHTML = html.html;
  const frag = template.content;
  const styles = Array.from(frag.querySelectorAll('style'));
  Array.from(frag.querySelectorAll('script')).forEach((s) => s.remove());
  const host = window.document.getElementById('base-lesson-host');
  host.appendChild(frag);
  styles.forEach((s) => window.document.head.appendChild(s));

  for (const url of body.files) {
    await new Promise((resolve) => {
      const el = window.document.createElement('script');
      el.src = 'file://' + path.join(ROOT, 'public', url.split('?')[0]).replace(/\\/g, '/');
      el.onload = () => { window.document.dispatchEvent(new window.Event('DOMContentLoaded')); resolve(); };
      el.onerror = () => { console.log('  script failed to load'); resolve(); };
      window.document.body.appendChild(el);
    });
  }

  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const txt = (sel) => {
    const n = host.querySelector(sel);
    return n ? (n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) : '(absent)';
  };

  console.log('\nafter loading the code:');
  console.log('  .node built:', host.querySelectorAll('.node').length);
  console.log('  .frag built:', host.querySelectorAll('.frag').length);
  console.log('  gauge:', txt('#gaugeVal'), '| xp:', txt('#xpCounter'));

  const mode = host.querySelectorAll('[data-mode]');
  const before = txt('#inspector');
  if (mode[1]) click(mode[1]);
  console.log(`  mode click: inspector ${before === txt('#inspector') ? 'UNCHANGED' : 'CHANGED -> ' + txt('#inspector')}`);

  const hypo = host.querySelectorAll('.hypo');
  const cBefore = txt('#clearance');
  if (hypo[1]) click(hypo[1]);
  console.log(`  hypo click:  clearance ${cBefore === txt('#clearance') ? 'UNCHANGED' : 'CHANGED -> ' + txt('#clearance')}`);

  const det = host.querySelector('#detonateBtn');
  const dBefore = det ? det.textContent.trim() : '(absent)';
  if (det) click(det);
  console.log(`  detonate:    ${dBefore} -> ${det ? det.textContent.trim() : ''}`);

  const charge = host.querySelector('#chargeBtn');
  if (charge) { const g0 = txt('#gaugeVal'); click(charge); console.log(`  charge:      gauge ${g0} -> ${txt('#gaugeVal')} | xp ${txt('#xpCounter')}`); }

  server.close();
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
