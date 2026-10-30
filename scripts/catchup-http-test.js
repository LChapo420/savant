#!/usr/bin/env node
/**
 * C2f: the catch-up routes (routes/catchup.js) driven over real HTTP on a throwaway data file:
 * sign-in is required, the check runs question by question, only the planted gaps become blocks,
 * a block level opens through /next, and a stranger's catch-up is never visible to another learner.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-http-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const cu = require('../services/catchup-units');

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
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
async function check(name, fn) { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.stack.split('\n').slice(0, 4).join('\n     ')}`); } }

const track = 'math';
const target = curriculum.getTrack(track).grades[5].id;
const answerOf = (q) => cu.questionsFor(cu.skillByKey(track, q.key)).find((x) => x.qid === q.qid).answer;
const wrongOf = (q) => q.choices.find((c) => c !== answerOf(q));
const base = `/api/catchup/${track}/${target}`;

(async () => {
  server = app.listen(0);
  const a = db.insert('users', { email: 'a@t.test', display_name: 'A', xp: 0, streak: 0 });
  const b = db.insert('users', { email: 'b@t.test', display_name: 'B', xp: 0, streak: 0 });
  const all = cu.readiness(track, target).grades.flatMap((g) => cu.skillsOfGrade(track, g));
  const gaps = new Set([all[0].key, all[all.length - 1].key]);

  await check('signed out: 401 on every route', async () => {
    assert.strictEqual((await call('GET', '/api/catchup/subjects', 0)).status, 401);
    assert.strictEqual((await call('GET', base, 0)).status, 401);
    assert.strictEqual((await call('POST', `${base}/start`, 0)).status, 401);
  });
  await check('subjects: math ready; an unknown subject is 404, never a guess', async () => {
    const r = await call('GET', '/api/catchup/subjects', a.id);
    assert.ok(r.json.subjects.find((s) => s.track_id === track).ready);
    assert.strictEqual((await call('GET', `/api/catchup/chess/x`, a.id)).status, 404);
  });
  await check('the check runs over HTTP and finds exactly the planted gaps', async () => {
    let v = (await call('POST', `${base}/start`, a.id)).json;
    assert.strictEqual(v.phase, 'check');
    for (let i = 0; i < 400 && v.phase === 'check'; i++) {
      const q = v.question;
      const r = await call('POST', `${base}/answer`, a.id, { key: q.key, qid: q.qid, answer: gaps.has(q.key) ? wrongOf(q) : answerOf(q) });
      assert.strictEqual(r.status, 200);
      v = r.json.view;
    }
    assert.strictEqual(v.phase, 'route');
    assert.deepStrictEqual(v.route.blocks.map((x) => x.key), all.filter((s) => gaps.has(s.key)).map((s) => s.key));
  });
  await check('a stale or wrong question id is refused with the current view', async () => {
    const r = await call('POST', `${base}/answer`, a.id, { key: all[0].key, qid: 'nope', answer: 'x' });
    assert.ok(r.status >= 400 && r.json.error);
  });
  await check('/next opens the first level of the first block', async () => {
    const r = await call('POST', `${base}/next`, a.id);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.level, cu.skillByKey(track, [...gaps][0]).levels[0]);
  });
  await check('another learner sees none of it', async () => {
    const v = (await call('GET', base, b.id)).json;
    assert.notStrictEqual(v.phase, 'route');
    assert.ok(!(v.route && v.route.blocks && v.route.blocks.length));
  });
  server.close();
  if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})();
