#!/usr/bin/env node
/**
 * The speed proof's learner side (routes/speed-proof.js, services/speed-proof.js middleware), over real HTTP on a throwaway database.
 *   node scripts/speed-proof-http-test.js
 *   1. the question: offered once after placement, a clear no changes nothing, under 13 needs the parent's agreement, the switch
 *   2. a plain-way skill: no coach, no ask-the-tutor (standard explanation instead), no lesson assistant, shared standard page for block levels
 *   3. the screen script exists, uses the server's wording and has a no as big as the yes
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const express = require('express');

process.env.NODE_ENV = 'test';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-proof-http-'));
process.env.DB_FILE = path.join(dir, 'db.json');
for (const k of ['SPEED_PROOF', 'SPEED_PROOF_NORMAL_SHARE', 'OWNER_BASE', 'ADAPT_OWNER', 'OWNER_EMAIL']) delete process.env[k];
process.env.ADMIN_EMAILS = 'boss@school.org';

const db = require('../config/db');
const owner = require('../config/owner');
const sp = require('../services/speed-proof');
const blockLevels = require('../services/block-levels');

let n = 0;
async function check(name, fn) { await fn(); n++; console.log(`  ok   ${name}`); }

let seq = 0;
const mk = (extra = {}) => { seq++; return db.insert('users', { email: `l${seq}@school.org`, display_name: `L${seq}`, password_hash: 'x', in_beta: true, age_check: { age_at_check: 20, under_13: false, needs_parent: false, birth_ym: '2006-01', country: 'US' }, ...extra }); };

(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/speed-proof', require('../routes/speed-proof'));
  // the same mounts the real routers have, over stub handlers that report what the request saw
  const probe = express.Router();
  probe.use('/lessons/:track/:grade/:level', sp.lessonContext);
  probe.post('/lessons/:track/:grade/:level/assist', (req, res) => res.json({ reached: true }));
  probe.get('/lessons/:track/:grade/:level/page', (req, res) => res.json({ plain: sp.plainNowFor(req.user.id), tailors: blockLevels.tailorsFor(req.user), base: owner.ownerBase(req.user.id) }));
  probe.use('/items/:id', sp.itemContext);
  probe.post('/items/:id/ask', (req, res) => res.json({ reached: true }));
  probe.post('/items/:id/coach', (req, res) => res.json({ reached: true }));
  app.use('/api', probe);
  const server = app.listen(0);
  await new Promise((ok) => server.once('listening', ok));
  const call = (method, url, uid, body) => new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers: { 'x-user': String(uid || ''), 'content-type': 'application/json', connection: 'close' } }, (res) => {
      let t = ''; res.on('data', (d) => { t += d; });
      res.on('end', () => ok({ status: res.statusCode, json: (() => { try { return JSON.parse(t); } catch { return null; } })() }));
    });
    req.on('error', fail);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  console.log('1. the question');
  const a = mk();
  await check('signed out: 401', async () => { assert.strictEqual((await call('GET', '/api/speed-proof', 0)).status, 401); });
  await check('not offered before placement', async () => {
    db.insert('enrollments', { user_id: a.id, track_id: 'math', grade_id: 'algebra_1_part_a', current_level: 1, status: 'placement_pending' });
    const s = (await call('GET', '/api/speed-proof', a.id)).json;
    assert.strictEqual(s.available, true); assert.strictEqual(s.offer, false);
  });
  await check('offered after placement, with the plain wording', async () => {
    db.update('enrollments', db.find('enrollments', (e) => e.user_id === a.id)[0].id, { status: 'active' });
    const s = (await call('GET', '/api/speed-proof', a.id)).json;
    assert.strictEqual(s.offer, true);
    assert.ok(/optional/i.test(s.consent_text.body.join(' ')) && /plain way/.test(s.consent_text.body.join(' ')));
  });
  await check('a clear no changes nothing and the question never returns', async () => {
    const r = await call('POST', '/api/speed-proof/consent', a.id, { normal_arm: false });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await call('GET', '/api/speed-proof', a.id)).json.offer, false);
    sp.setRandom(() => 0); process.env.SPEED_PROOF_NORMAL_SHARE = '0.5';
    for (let i = 0; i < 12; i++) assert.strictEqual(sp.assign(a.id, `no${i}`, { trackId: 'math', gradeId: 'g' }).arm, 'savant');
    sp.setRandom(null); delete process.env.SPEED_PROOF_NORMAL_SHARE;
    assert.strictEqual(sp.normalFor(a.id, 'no0'), false);
  });
  await check('a yes is stored and the question is used up', async () => {
    const b = mk();
    db.insert('enrollments', { user_id: b.id, track_id: 'math', grade_id: 'g', current_level: 1, status: 'active' });
    assert.strictEqual((await call('POST', '/api/speed-proof/consent', b.id, { normal_arm: true })).status, 200);
    assert.strictEqual((await call('GET', '/api/speed-proof', b.id)).json.offer, false);
    assert.strictEqual(sp.consentedNormal(db.byId('users', b.id)), true);
  });
  await check('under 13: nothing without the parent; with the parent the card says so', async () => {
    const kid = mk({ age_check: { age_at_check: 11, under_13: true, needs_parent: true, birth_ym: '2015-01', country: 'US' } });
    db.insert('enrollments', { user_id: kid.id, track_id: 'math', grade_id: 'g', current_level: 1, status: 'active' });
    let s = (await call('GET', '/api/speed-proof', kid.id)).json;
    assert.strictEqual(s.available, false); assert.strictEqual(s.offer, false);
    assert.strictEqual((await call('POST', '/api/speed-proof/consent', kid.id, { normal_arm: true })).status, 403);
    const c = db.insert('parental_consents', { child_user_id: kid.id, status: 'active', scopes: { measurement_extras: { active: true } } });
    db.update('users', kid.id, { consent_id: c.id });
    s = (await call('GET', '/api/speed-proof', kid.id)).json;
    assert.strictEqual(s.offer, true); assert.strictEqual(s.needs_parent, true);
  });
  await check('not in the beta, the owner and admins: never offered', async () => {
    for (const x of [mk({ in_beta: false }), mk({ email: 'boss@school.org' })]) {
      db.insert('enrollments', { user_id: x.id, track_id: 'math', grade_id: 'g', current_level: 1, status: 'active' });
      assert.strictEqual((await call('GET', '/api/speed-proof', x.id)).json.offer, false);
    }
  });

  console.log('2. a plain-way skill');
  const grade = require('../config/curriculum').getGrade('math', 'algebra_1_part_a');
  const unit = sp.unitFor(grade, 1); const skill = unit.key; // the arm is drawn per lesson stretch since 6 Nov, not per coarse skill
  const p = mk();
  db.insert('enrollments', { user_id: p.id, track_id: 'math', grade_id: 'algebra_1_part_a', current_level: 1, status: 'active' });
  sp.setConsent(db.byId('users', p.id), true);
  process.env.SPEED_PROOF_NORMAL_SHARE = '0.5'; sp.setRandom(() => 0);
  const row = sp.assign(p.id, skill, { trackId: 'math', gradeId: 'algebra_1_part_a', unit });
  sp.setRandom(null); delete process.env.SPEED_PROOF_NORMAL_SHARE;
  assert.strictEqual(row.arm, 'normal');
  const plainSession = db.insert('sessions', { user_id: p.id, track_id: 'math', grade_id: 'algebra_1_part_a', level: 1, kind: 'lesson', blocks: [] });
  const plainItem = db.insert('items', { session_id: plainSession.id, level: 1, user_id: p.id, skill_id: unit.skill, prompt: 'q', answer: 'a', rationale: 'Because standard.', correct: false, user_answer: 'b' });
  const otherItem = db.insert('items', { session_id: plainSession.id, level: 1, user_id: p.id, skill_id: 'some_other_skill', prompt: 'q', answer: 'a', rationale: 'r', correct: false, user_answer: 'b' });
  await check('ask-the-tutor on a plain skill gets the standard explanation, not the tutor', async () => {
    const r = await call('POST', `/api/items/${plainItem.id}/ask`, p.id, { question: 'why?' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.source, 'plain_way'); assert.ok(/Because standard/.test(r.json.reply));
  });
  await check('the coach is off on a plain skill and the reason is given', async () => {
    const r = await call('POST', `/api/items/${plainItem.id}/coach`, p.id, {});
    assert.strictEqual(r.status, 409); assert.strictEqual(r.json.plain_way, true); assert.ok(/Savant way/.test(r.json.error));
  });
  await check('the same calls on another skill reach the real handler', async () => {
    assert.strictEqual((await call('POST', `/api/items/${otherItem.id}/ask`, p.id, {})).json.reached, true);
    assert.strictEqual((await call('POST', `/api/items/${otherItem.id}/coach`, p.id, {})).json.reached, true);
  });
  await check('the lesson assistant is off on a plain skill, and its page is the shared standard one', async () => {
    const r = await call('POST', '/api/lessons/math/algebra_1_part_a/1/assist', p.id, {});
    assert.strictEqual(r.status, 409); assert.strictEqual(r.json.plain_way, true);
    const page = (await call('GET', '/api/lessons/math/algebra_1_part_a/1/page', p.id)).json;
    assert.deepStrictEqual(page, { plain: true, tailors: false, base: true });
  });
  await check('another learner, and this learner after switching, get the ordinary behaviour', async () => {
    const other = mk();
    assert.strictEqual((await call('GET', '/api/lessons/math/algebra_1_part_a/1/page', other.id)).json.plain, false);
    assert.strictEqual((await call('POST', '/api/speed-proof/switch', p.id, { skill_id: skill })).status, 200);
    assert.strictEqual((await call('POST', '/api/lessons/math/algebra_1_part_a/1/assist', p.id, {})).json.reached, true);
    assert.strictEqual((await call('GET', '/api/lessons/math/algebra_1_part_a/1/page', p.id)).json.plain, false);
  });
  server.close();

  console.log('3. the screen');
  await check('the screen script uses the server wording and has a no as big as the yes, wired on the dashboard', async () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'speed-offer.js'), 'utf8');
    assert.ok(/consent_text/.test(js) && /data-sp="yes"/.test(js) && /data-sp="no"/.test(js) && /nothing changes/i.test(js));
    assert.ok(!/btn-ghost/.test(js), 'the no is not visually demoted');
    assert.ok(/speed-offer/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8')));
    assert.ok(/speed-offer\.js/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8')));
  });
  console.log(`speed-proof-http-test: ${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
