/**
 * Onboarding v2, over HTTP on a throwaway copy of the store (docs/ONBOARDING-V2.md). Starts its own server twice: switch off, then on.
 *
 *   node scripts/onboarding-v2-test.js
 *
 * Checks: off means nothing new is reachable; a guest has no outside-AI, upload or boosters access; a walk, an enrollment and goals survive a
 * failed and then a good claim on the same row; a child gives no email and gets the consent request first; export and deletion cover the new
 * data; an existing account is not sent through the flow; the pre-written examples are complete.
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob2-'));
const dbFile = path.join(dir, 'db.json');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ok ${name}`); };

function client(base) {
  let cookie = '';
  return async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}

async function server(port, env) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DB_FILE: dbFile, NODE_ENV: 'test', CONSENT_SWEEP: 'off', SESSION_SECRET: 'x'.repeat(40), MAIL_TRANSPORT: 'console', ...env },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  for (let i = 0; i < 120; i += 1) {
    try { const r = await fetch(`http://localhost:${port}/api/health`); if (r.status < 500) return child; } catch { /* not up yet */ }
    await delay(500);
  }
  child.kill();
  throw new Error('server did not start');
}
const stop = (child) => new Promise((r) => { child.on('exit', r); child.kill(); });

function contentChecks() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/js/start-content.js'), 'utf8'), sandbox);
  const C = sandbox.window.ObContent;
  process.env.DB_FILE = dbFile;
  process.env.CONSENT_SWEEP = 'off';
  const keys = Object.keys(require('../services/onboarding-v2').INTERESTS).sort(); // eslint-disable-line global-require
  assert.deepEqual([...C.INTERESTS.map((i) => i.id)].sort(), keys, 'the page and the server list the same interests');
  for (const [name, idea] of Object.entries(C.IDEAS)) {
    for (const k of keys) assert.ok(idea.examples[k], `${name} has ${k}`);
    assert.equal(Object.keys(idea.examples).length, keys.length, `${name} has nothing extra`);
  }
  for (const k of keys) {
    const t = C.IDEAS.fractions.examples[k];
    assert.match(t, /\*\*4 /, `${k}: out of 4`);
    assert.match(t, /\*\*3\*\*/, `${k}: 3 of them`);
    assert.match(t, /\*\*3\/4\*\*/, `${k}: says 3/4`);
  }
  for (const k of keys) {
    const t = C.IDEAS.endings.examples[k];
    const [yo, tu] = [...t.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1].toLowerCase());
    assert.ok(yo.endsWith('o') && tu.endsWith('as') && yo.slice(0, -1) === tu.slice(0, -2), `${k}: regular -ar forms (${yo}, ${tu})`);
  }
  const all = JSON.stringify(C).toLowerCase();
  assert.ok(!all.includes('learning style'), 'no "learning styles"');
  ok('pre-written examples: every interest, every idea, the sums and the verb forms');
}

async function main() {
  fs.copyFileSync(path.join(ROOT, 'data', 'db.json'), dbFile);
  contentChecks();

  // ── off ──
  let child = await server(6891, { ONBOARDING_V2: '' });
  let base = 'http://localhost:6891';
  let c = client(base);
  assert.equal((await c('GET', '/api/ob2/state')).status, 404);
  assert.equal((await c('GET', '/register')).status, 200);
  const offStart = await c('GET', '/start');
  assert.ok(String(offStart.data).includes('<') && !String(offStart.data).includes('start.js'), 'off: /start is not the new page');
  ok('off: API 404, /register is today\'s page, /start is not the new page');
  await stop(child);

  // ── on ──
  child = await server(6892, { ONBOARDING_V2: 'on' });
  base = 'http://localhost:6892';
  c = client(base);
  const reg = await c('GET', '/register?ref=abcd1234&track=act');
  assert.equal(reg.status, 302);
  assert.equal(reg.headers.get('location'), '/start?ref=abcd1234&track=act');
  ok('on: /register goes to /start and keeps the query');

  assert.equal((await c('POST', '/api/ob2/begin', { answers: {} })).status, 400, 'no age answer, no guest');
  const adultAge = await c('POST', '/api/consent/age', { birth_month: 3, birth_year: 1990, country: 'US' });
  assert.equal(adultAge.data.route, 'self');
  const secondAnswer = await c('POST', '/api/consent/age', { birth_month: 3, birth_year: 2020, country: 'US' });
  assert.equal(secondAnswer.data.route, 'self');
  assert.equal(secondAnswer.data.locked, true);
  ok('age: same endpoint, first answer stands');

  const begun = await c('POST', '/api/ob2/begin', { answers: { tracks: ['math', 'chess'], why: 'test', horizon: 'year', interest: 'other', interest_text: 'pottery' } });
  assert.equal(begun.status, 201);
  assert.equal(begun.data.user.guest, true);
  assert.equal(begun.data.user.consent.ai_free_text, false);
  assert.equal(begun.data.user.consent.camera_mic, false);
  assert.equal(begun.data.user.consent.state, 'guest');

  // Nothing typed or uploaded reaches a model.
  assert.equal((await c('POST', '/api/tutor/chat', { messages: [{ role: 'user', content: 'hello' }] })).data.code, 'guest_save_first');
  assert.equal((await c('POST', '/api/profile/survey', { interests: 'pottery' })).data.code, 'guest_save_first');
  assert.equal((await c('POST', '/api/materials/paste', { text: 'notes' })).data.code, 'guest_save_first');
  ok('guest: chat, survey text and uploads are refused before saving');

  const started = await c('POST', '/api/subject-placement/math/start', { mode: 'quick' });
  assert.ok(started.data.questions.length > 0, 'the walk runs for a guest');
  const q = started.data.questions[0];
  await c('POST', '/api/subject-placement/math/answer', { grade_id: started.data.grade_id, index: q.index, answer: q.choices[0] });
  const quit = await c('POST', '/api/subject-placement/math/quit', { grade_id: started.data.grade_id, answers: [{ index: q.index, answer: q.choices[0] }] });
  assert.equal(quit.status, 200);
  const first = await c('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: quit.data.recommended_grade_id });
  assert.equal(first.status, 200);
  assert.ok(first.data.enrollment.href.includes(String(first.data.enrollment.id)));
  const again = await c('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: quit.data.recommended_grade_id });
  assert.equal(again.data.enrollment.id, first.data.enrollment.id, 'a double tap makes one enrollment');
  assert.equal(first.data.goal.horizon, 'year');
  const state = await c('GET', '/api/ob2/state');
  assert.equal(state.data.enrollment.id, first.data.enrollment.id);
  assert.equal(state.data.answers.interest_text, 'pottery');
  ok('guest: walk, enrollment and goal are kept; a repeat is safe; state survives a reload');

  // A failed sign-up changes nothing.
  const bad = await c('POST', '/api/ob2/claim', { display_name: 'Ada', email: 'nope', password: 'longenough1' });
  assert.equal(bad.status, 400);
  const taken = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8')).users.find((u) => u.email && u.id !== 6689);
  const dup = await c('POST', '/api/ob2/claim', { display_name: 'Ada', email: taken.email, password: 'longenough1' });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.code, 'email_taken');
  assert.equal((await c('GET', '/api/ob2/state')).data.enrollment.id, first.data.enrollment.id);
  ok('claim: bad email and taken email leave the guest and progress alone');

  const email = `ob2-${Date.now()}@example.test`;
  const claim = await c('POST', '/api/ob2/claim', { display_name: 'Ada', email, password: 'longenough1' });
  assert.equal(claim.status, 201);
  assert.ok(!claim.data.user.guest);
  assert.equal(claim.data.user.consent.state, 'full');
  const enrollments = await c('GET', '/api/enrollments');
  assert.equal(enrollments.data.enrollments.length, 1);
  assert.equal(enrollments.data.enrollments[0].id, first.data.enrollment.id);
  const profile = await c('GET', '/api/profile');
  assert.ok(String(profile.data.survey.interests).includes('pottery'), 'the interest reaches the survey once they have saved');
  const exported = await c('GET', '/api/account/export');
  assert.equal(exported.data.onboarding_answers.length, 1, 'export covers the answers');
  assert.equal(exported.data.onboarding_answers[0].why, 'test');
  const home = await c('GET', '/api/ob2/state');
  assert.equal(home.data.account, true);
  assert.equal(home.data.go, '/dashboard');
  ok('claim: same row, progress and interest carried, exported, and the account is not sent through again');

  await c('POST', '/api/auth/logout', {});
  const back = await c('POST', '/api/auth/login', { email, password: 'longenough1' });
  assert.equal(back.status, 200);
  ok('saved account signs in with its new password');
  await c('POST', '/api/auth/logout', {});

  // A guest signing in to that account: the level check comes along if the account has none for the subject.
  const g = client(base);
  await g('POST', '/api/consent/age', { birth_month: 3, birth_year: 1991, country: 'US' });
  await g('POST', '/api/ob2/begin', { answers: { tracks: ['chess'] } });
  await g('POST', '/api/ob2/first-lesson', { track: 'chess', grade_id: 'board_explorer' }).catch(() => {});
  const grades = (await g('GET', '/api/catalog?view=grades')).data.tracks.find((t) => t.id === 'chess').grades;
  const made = await g('POST', '/api/ob2/first-lesson', { track: 'chess', grade_id: grades[0].id });
  assert.equal(made.status, 200);
  const signed = await g('POST', '/api/auth/login', { email, password: 'longenough1' });
  assert.equal(signed.status, 200);
  const list = (await g('GET', '/api/enrollments')).data.enrollments.map((e) => e.track.id).sort();
  assert.deepEqual(list, ['chess', 'math']);
  ok('guest signing in to an existing account brings the subject across');

  // ── a child ──
  const k = client(base);
  const kAge = await k('POST', '/api/consent/age', { birth_month: 6, birth_year: new Date().getFullYear() - 10, country: 'US' });
  assert.equal(kAge.data.route, 'parent');
  const noParent = await k('POST', '/api/ob2/begin', { nickname: 'Sam', answers: {} });
  assert.equal(noParent.status, 400);
  assert.equal(noParent.data.field, 'parent_email');
  const kid = await k('POST', '/api/ob2/begin', { nickname: 'Sam', parent_email: 'parent@example.test', answers: { tracks: ['math'], interest: 'other', interest_text: 'my school name', notes: true } });
  assert.equal(kid.status, 201);
  assert.equal(kid.data.user.consent.state, 'pending');
  assert.equal(kid.data.user.consent.has_request, true, 'the parent was asked before anything else was stored');
  assert.equal(kid.data.user.email, null);
  const kState = await k('GET', '/api/ob2/state');
  assert.equal(kState.data.answers.interest_text, '', 'a child\'s typed words are not kept');
  assert.equal(kState.data.answers.notes, false, 'no uploads for a child');
  assert.equal((await k('POST', '/api/materials/paste', { text: 'x' })).data.code, 'child_upload_off');
  assert.equal((await k('POST', '/api/tutor/chat', { messages: [{ role: 'user', content: 'hi' }] })).data.code, 'parent_opt_in_required');
  const kClaim = await k('POST', '/api/ob2/claim', { username: `sam${Date.now() % 100000}`, password: 'longenough1', email: 'child@example.test' });
  assert.equal(kClaim.status, 201);
  assert.equal(kClaim.data.user.email, null, 'a child email is never kept');
  assert.equal(kClaim.data.user.consent.state, 'pending');
  ok('child: parent asked first, no email, no free text, gates hold before and after the login is made');

  await stop(child);

  // ── the sweep and deletion, in this process on the same file ──
  const db = require('../config/db'); // eslint-disable-line global-require
  const ob = require('../services/onboarding-v2'); // eslint-disable-line global-require
  const consent = require('../routes/consent'); // eslint-disable-line global-require
  assert.ok(consent.collectionNames().includes('onboarding_answers'), 'deletion knows the collection');
  const old = ob.createGuest({ country: 'US', needs_parent: false, under_13: false, birth_ym: '1990-01', checked_at: new Date().toISOString() });
  ob.saveAnswers(old, { why: 'work' });
  db.update('users', old.id, { guest_expires_at: new Date(Date.now() - 1000).toISOString() });
  const swept = ob.sweep();
  assert.ok(swept.guests_deleted >= 1);
  assert.equal(db.byId('users', old.id), null);
  assert.equal(ob.rowOf(old.id) || null, null, 'the answers go with the guest');
  ok('sweep: an idle guest and its answers are deleted');

  console.log(`onboarding-v2-test: ${passed} groups passed`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
