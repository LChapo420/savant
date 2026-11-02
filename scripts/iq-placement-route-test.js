#!/usr/bin/env node
/**
 * A fresh account that picks IQ gets the in-tier placement and the gap-only path through the REAL routes
 * (routes/catalog.js enrollments, routes/placement.js start/answer/finish/quick-check, routes/catchup.js),
 * on a throwaway data file (never the live one):
 *
 *   - the IQ bank is complete (9 clusters per tier, >= 7 questions each) and IQ is catch-up ready;
 *   - enrolling in a tier starts a unit (adaptive) placement, not the old difficulty ladder;
 *   - a simulated learner who has finished the first four ninths of the tier and has one planted hole (cluster 1) is placed about
 *     about four ninths of the way in, within a time bound, with the hole reopened by the quick check and on the path;
 *   - a learner who knows nothing starts at cluster 1 and skips nothing;
 *   - the catch-up routes answer for IQ (subjects, view, start).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'iq-placement-route-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const express = require('express');
const db = require('../config/db');
const unitPlacement = require('../services/unit-placement');
const learnerPath = require('../services/learner-path');
const cu = require('../services/catchup-units');

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
app.use('/api', require('../routes/catalog').router);
app.use('/api/placement', require('../routes/placement'));
app.use('/api/catchup', require('../routes/catchup'));

let server;
const call = (method, url, uid, body) => new Promise((ok, fail) => {
  const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers: { 'x-user': String(uid || ''), 'content-type': 'application/json' } }, (res) => {
    let t = ''; res.on('data', (d) => { t += d; });
    res.on('end', () => ok({ status: res.statusCode, json: (() => { try { return JSON.parse(t); } catch { return null; } })() }));
  });
  req.on('error', fail);
  if (body) req.write(JSON.stringify(body));
  req.end();
});

let failed = 0;
const check = (name, ok, detail) => { if (ok) console.log(`ok   ${name}`); else { failed++; console.log(`FAIL ${name}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 300)}`}`); } };

const TIER = 'abstract_reasoning';
const rightAnswer = (itemId) => { const it = db.byId('items', itemId); return unitPlacement.unitsFor('iq', TIER)[it.unit - 1].questions[it.slot].answer; };
const wrongAnswer = (itemId) => { const it = db.byId('items', itemId); return it.choices.find((c) => c !== rightAnswer(itemId)); };

/** Sit the placement as a learner who has finished clusters 1..known (except `holes`) and nothing after. */
async function sit(uid, enrollmentId, known, holes = []) {
  const started = await call('POST', '/api/placement/start', uid, { enrollment_id: enrollmentId, mode: 'balanced' });
  check('placement starts as the adaptive unit walk', started.status === 201 && started.json.adaptive === true && started.json.mode === 'balanced', started.json);
  let item = started.json.items[0];
  let asked = 0;
  const log = [];
  for (let i = 0; i < 100 && item; i++) {
    const row = db.byId('items', item.id);
    const unit = row.unit;
    const right = unit <= known && !holes.includes(unit);
    const res = await call('POST', '/api/placement/answer', uid, { session_id: started.json.session_id, item_id: item.id, answer: right ? rightAnswer(item.id) : wrongAnswer(item.id), ms: 1000 });
    asked++;
    log.push({ unit, right });
    if (!res.json || !res.json.next_item) { item = null; break; }
    item = res.json.next_item;
  }
  const fin = await call('POST', '/api/placement/finish', uid, { session_id: started.json.session_id });
  return { started: started.json, fin, asked, log };
}

(async () => {
  server = http.createServer(app).listen(0);
  // 1. the bank and catch-up readiness
  const bank = unitPlacement.bankFor('iq');
  const tiers = Object.keys(bank.grades);
  check('all 12 IQ tiers have a bank', tiers.length === 12 && tiers.every((g) => unitPlacement.available('iq', g)));
  check('every IQ cluster has at least 7 questions and its levels', tiers.every((g) => bank.grades[g].units.every((u) => u.questions.length >= 7 && u.end > u.start)));
  check('clusters tile the tier without gaps', tiers.every((g) => bank.grades[g].units.every((u, i, a) => i === 0 || u.start === a[i - 1].end + 1)));
  const rep = cu.readiness('iq', 'advanced_analytical_thinking');
  check('IQ is catch-up ready below a tier with a bank', rep.ready === true && rep.skills >= 9, rep);

  // 2. a learner who has finished the first third of the tier, one hole planted
  const u1 = db.insert('users', { email: 'iq-route-a@example.test', display_name: 'A', xp: 0, streak: 0 });
  const enrolled = await call('POST', '/api/enrollments', u1.id, { selections: [{ track_id: 'iq', grade_id: TIER }] });
  check('a fresh account enrolls in an IQ tier', enrolled.status === 201 && enrolled.json.created.length === 1, enrolled.json);
  const enrollmentId = enrolled.json.created[0].id;
  const nUnits = unitPlacement.unitsFor('iq', TIER).length;
  const known = 4;
  const HOLE = 1;
  const out = await sit(u1.id, enrollmentId, known, [HOLE]);
  check('the placement finishes', out.fin.status === 200 && out.fin.json.result, out.fin.json);
  const result = out.fin.json.result || {};
  const minutes = unitPlacement.MODES.balanced.minutes;
  check(`it asks a bounded number of questions (<= ${unitPlacement.MODES.balanced.max}, ${minutes} min clock)`, out.asked <= unitPlacement.MODES.balanced.max && out.asked >= unitPlacement.MODES.balanced.min, out.asked);
  check(`it places close to the learner's frontier (cluster ${known + 1} of ${nUnits}, within 1)`, Math.abs(result.unit - (known + 1)) <= 1, { placed: result.unit, log: out.log });
  const fresh = db.byId('enrollments', enrollmentId);
  check('the enrollment carries a unit plan (the gap-only path)', !!learnerPath.planFor(fresh));
  check('the start level is inside the tier and not level 1 for a learner who finished four ninths', fresh.current_level > 1 && fresh.current_level <= unitPlacement.unitsFor('iq', TIER)[nUnits - 1].end, fresh.current_level);
  // the quick checks: pass the clusters the learner knows, miss the planted hole
  let guard = 0;
  while (guard++ < 60) {
    const st = await call('GET', `/api/placement/quick-check/${enrollmentId}`, u1.id);
    const q = st.json && st.json.question;
    if (!q) break;
    const uid = q.unit;
    const row = unitPlacement.itemFor('iq', TIER, q.unit, q.slot);
    const right = uid <= known && uid !== HOLE;
    const ans = right ? row.answer : row.choices.find((c) => c !== row.answer);
    await call('POST', '/api/placement/quick-check', u1.id, { enrollment_id: enrollmentId, unit: q.unit, slot: q.slot, answer: ans });
  }
  const rows = learnerPath.unitRows(db.byId('enrollments', enrollmentId));
  const statusOf = (u) => (rows.find((r) => r.unit === u) || {}).status;
  check('the planted hole (cluster 1) is on the gap-only path (to learn, not skipped)', !['known', 'done'].includes(statusOf(HOLE)), { status: rows.map((r) => `${r.unit}:${r.status}`).join(' ') });
  check('known clusters below the placed point are not reopened', [2, 3].every((u) => u >= result.unit || statusOf(u) !== 'learn'), { status: rows.map((r) => `${r.unit}:${r.status}`).join(' ') });

  // 3. a learner who knows nothing starts at the beginning
  const u2 = db.insert('users', { email: 'iq-route-b@example.test', display_name: 'B', xp: 0, streak: 0 });
  const e2 = await call('POST', '/api/enrollments', u2.id, { selections: [{ track_id: 'iq', grade_id: TIER }] });
  const none = await sit(u2.id, e2.json.created[0].id, 0);
  check('a learner who shows nothing is placed at cluster 1 and skips nothing', none.fin.json.result && none.fin.json.result.unit === 1 && none.fin.json.result.skipped === 0, none.fin.json);

  // 4. the catch-up routes answer for IQ
  const subjects = await call('GET', '/api/catchup/subjects', u1.id);
  const iq = (subjects.json.subjects || []).find((s) => s.track_id === 'iq');
  check('/api/catchup/subjects lists IQ as ready, unit-bank adapter', iq && iq.ready === true && iq.engine === 'unit-bank adapter' && iq.grades_with_unit_bank === 12, iq);
  const started = await call('POST', '/api/catchup/iq/advanced_analytical_thinking/start', u1.id);
  check('a catch-up to an IQ tier starts over HTTP', started.status === 200 && started.json && started.json.phase === 'check' && started.json.question, started.json);

  server.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(e.stack); process.exit(1); });
