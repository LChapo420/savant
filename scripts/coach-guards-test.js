/**
 * Tests for the coach and tutor guards in routes/learn.js (subjects audit, 2026-10-24):
 *
 *   - the streamed coach serves a primed opener instead of writing a second one;
 *   - /coach/prime spends a model call only for a learner who opens the coach
 *     (COACH_PRIME_RATE of the last COACH_PRIME_WINDOW answers), or with COACH_PRIME=all;
 *   - /items/:id/ask needs an answered item, and a held sitting (checkpoint, skip,
 *     placement) to be finished, so the answer key cannot be had by asking;
 *   - the coach routes refuse checkpoint, skip and placement items.
 *
 *   node scripts/coach-guards-test.js
 *
 * Own throwaway data file; every model key blanked; NVIDIA answered by a mock at the
 * HTTP layer (a "test" key, so no usage file is written). No network.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/KEY|TOKEN|SECRET_API|WORKSPACE/.test(k)) process.env[k] = '';
const tmp = path.join(os.tmpdir(), `coach-guards-test-${process.pid}.json`);
Object.assign(process.env, {
  DB_FILE: tmp, OLLAMA_ENABLED: '0', NVIDIA_API_KEY: 'test-coach-guards', NVIDIA_BASE_URL: 'http://mock.invalid/v1', NVIDIA_USAGE_FILE: 'off', AI_ANTHROPIC_FALLBACK: '0',
});
delete process.env.COACH_PRIME;

const express = require('express');
const db = require('../config/db');
const nvidia = require('../services/providers/nvidia');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

let modelCalls = 0;
nvidia._setFetch(async (url, opts) => {
  if (/\/models$/.test(url)) return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const body = JSON.parse(opts.body || '{}');
  // The tutor's after-the-reply note-taking (services/tutor-facts.js) is not a coach call.
  if (!/long-term notes on one learner/.test(JSON.stringify(body.messages || []))) modelCalls++;
  const content = 'What is the question asking you to find first?';
  if (body.stream) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({ start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }
  return new Response(JSON.stringify({ model: body.model, choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200, headers: { 'content-type': 'application/json' } });
});

function serve(router) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const call = (method, url, body, uid) => new Promise((done, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = null; } done({ status: res.statusCode, body: json, text }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

const settle = () => new Promise((r) => setTimeout(r, 150));

function learner(email) {
  // An adult account (the age screen answered), so outside AI is allowed for it.
  return db.insert('users', { email, name: email.split('@')[0], password_hash: 'x', streak: 0, xp: 0, onboarded: true, account_type: 'standard', age_check: { needs_parent: false, under_13: false, age_at_check: 30, consent_age: 13, country: 'US', checked_at: new Date().toISOString() } });
}
function sessionFor(user, kind, ended = false) {
  return db.insert('sessions', { user_id: user.id, enrollment_id: 1, track_id: 'math', grade_id: 'numbers_to_10', level: 20, kind, blocks: [{ index: 0, level: 20, kind, resolved: false }], started_at: new Date().toISOString(), ended_at: ended ? new Date().toISOString() : null });
}
function item(user, session, extra = {}) {
  return db.insert('items', {
    user_id: user.id, session_id: session.id, skill_id: 'add_sub', skill_name: 'Addition and subtraction', difficulty: 2, format: 'type_in',
    prompt: '3 + 4 =', answer: '7', rationale: 'Three and four more make seven.', role: 'focus', level: 20, block: 0, index: 0,
    user_answer: null, correct: null, ms: null, coach_used: false, ...extra,
  });
}

(async () => {
  const { call, close } = await serve(require('../routes/learn'));

  // ── the tutor and the answer key ───────────────────────────────────────────
  const a = learner('ask@example.test');
  const lesson = sessionFor(a, 'lesson');
  const open = item(a, lesson);
  let r = await call('POST', `/api/items/${open.id}/ask`, { question: 'What is the answer?' }, a.id);
  check('ask on an unanswered question is refused (409)', r.status === 409, r.body);
  check('and the refusal does not carry the key', !String(r.text).includes('"7"') && !/answer is 7/.test(r.text), r.text);
  const done = item(a, lesson, { user_answer: '6', correct: false, answered_at: new Date().toISOString() });
  r = await call('POST', `/api/items/${done.id}/ask`, { question: 'Why is it 7?' }, a.id);
  check('ask on an answered practice question is answered', r.status === 200 && r.body && r.body.reply, r.body);
  const master = sessionFor(a, 'master');
  const examAnswered = item(a, master, { role: 'exam', user_answer: '6', correct: false });
  r = await call('POST', `/api/items/${examAnswered.id}/ask`, { question: 'Why?' }, a.id);
  check('ask inside a running checkpoint is refused, even once answered', r.status === 409, r.body);
  db.update('sessions', master.id, { ended_at: new Date().toISOString() });
  r = await call('POST', `/api/items/${examAnswered.id}/ask`, { question: 'Why?' }, a.id);
  check('and allowed once the checkpoint is finished', r.status === 200, r.body);
  for (const kind of ['placement', 'skip', 'graduation']) {
    const s = sessionFor(a, kind);
    const it = item(a, s, { user_answer: '7', correct: true });
    r = await call('POST', `/api/items/${it.id}/ask`, { question: 'Why?' }, a.id);
    check(`ask inside a running ${kind} sitting is refused`, r.status === 409, r.body);
  }

  // ── the coach on held sittings ─────────────────────────────────────────────
  const c = learner('coach@example.test');
  const exam = sessionFor(c, 'master');
  const examItem = item(c, exam, { role: 'exam' });
  r = await call('POST', `/api/items/${examItem.id}/coach`, { messages: [] }, c.id);
  check('the coach refuses a checkpoint question', r.status === 409, r.body);
  r = await call('POST', `/api/items/${examItem.id}/coach/stream`, { messages: [] }, c.id);
  check('the streamed coach refuses a checkpoint question', r.status === 409, r.text);
  const before = modelCalls;
  r = await call('POST', `/api/items/${examItem.id}/coach/prime`, {}, c.id);
  await settle();
  check('priming a checkpoint question costs nothing', r.status === 200 && r.body.priming === false && modelCalls === before, { body: r.body, calls: modelCalls - before });

  // ── priming only for a learner who uses the coach ─────────────────────────
  const fresh = learner('fresh@example.test');
  const fl = sessionFor(fresh, 'lesson');
  const fItem = item(fresh, fl);
  let n0 = modelCalls;
  r = await call('POST', `/api/items/${fItem.id}/coach/prime`, {}, fresh.id);
  await settle();
  check('a learner with no history is not primed (no model call)', r.body && r.body.priming === false && modelCalls === n0, { body: r.body, calls: modelCalls - n0 });
  n0 = modelCalls;
  r = await call('POST', `/api/items/${fItem.id}/coach/stream`, { messages: [] }, fresh.id);
  check('their coach still opens, streamed (delta frames, not an empty stream) and written then', r.status === 200 && /"delta":"What is the question/.test(r.text) && modelCalls === n0 + 1, { text: r.text.slice(0, 200), calls: modelCalls - n0 });

  // 30 answered questions, the coach opened on 10 of them (33%): primed.
  const keen = learner('keen@example.test');
  const kl = sessionFor(keen, 'lesson', true);
  for (let i = 0; i < 30; i++) item(keen, kl, { user_answer: '7', correct: true, coach_used: i % 3 === 0, answered_at: new Date().toISOString() });
  const ks = sessionFor(keen, 'lesson');
  const kItem = item(keen, ks);
  n0 = modelCalls;
  r = await call('POST', `/api/items/${kItem.id}/coach/prime`, {}, keen.id);
  await settle();
  check('a learner who opens the coach often is primed (one model call)', r.body && r.body.priming === true && modelCalls === n0 + 1, { body: r.body, calls: modelCalls - n0 });
  check('the opener is stored on the item', !!(db.byId('items', kItem.id) || {}).coach_opener);
  n0 = modelCalls;
  r = await call('POST', `/api/items/${kItem.id}/coach/stream`, { messages: [] }, keen.id);
  check('the streamed coach serves the primed opener with no second call', r.status === 200 && /"primed":true/.test(r.text) && modelCalls === n0, { text: r.text.slice(0, 200), calls: modelCalls - n0 });
  check('and the item is marked as coached', db.byId('items', kItem.id).coach_used === true);
  n0 = modelCalls;
  r = await call('POST', `/api/items/${kItem.id}/coach/stream`, { messages: [{ role: 'assistant', content: 'x' }, { role: 'user', content: 'I add them?' }] }, keen.id);
  check('a follow-up turn is written by the model as before', r.status === 200 && modelCalls === n0 + 1, { calls: modelCalls - n0 });

  // 30 answered, coach on 3 (10%): not primed. COACH_PRIME=all overrides; off turns it off.
  const rare = learner('rare@example.test');
  const rl = sessionFor(rare, 'lesson', true);
  for (let i = 0; i < 30; i++) item(rare, rl, { user_answer: '7', correct: true, coach_used: i % 10 === 0, answered_at: new Date().toISOString() });
  const rs = sessionFor(rare, 'lesson');
  const rItem = item(rare, rs);
  n0 = modelCalls;
  r = await call('POST', `/api/items/${rItem.id}/coach/prime`, {}, rare.id);
  await settle();
  check('a learner who rarely opens the coach is not primed', r.body.priming === false && modelCalls === n0, { body: r.body, calls: modelCalls - n0 });
  process.env.COACH_PRIME = 'all';
  r = await call('POST', `/api/items/${rItem.id}/coach/prime`, {}, rare.id);
  await settle();
  check('COACH_PRIME=all primes everyone', r.body.priming === true && modelCalls === n0 + 1, { body: r.body, calls: modelCalls - n0 });
  process.env.COACH_PRIME = 'off';
  const kItem2 = item(keen, ks, { index: 1 });
  n0 = modelCalls;
  r = await call('POST', `/api/items/${kItem2.id}/coach/prime`, {}, keen.id);
  await settle();
  check('COACH_PRIME=off primes no one', r.body.priming === false && modelCalls === n0, { body: r.body, calls: modelCalls - n0 });
  delete process.env.COACH_PRIME;

  // The answer guard matches whole words (owner, 29 Oct 2026: on an item whose answer was "es", every reply
  // was replaced by the redirect because "es" is inside "yes", "rules" and "estar").
  const { leakGuard } = require('../services/ai');
  const esItem = { answer: 'es', choices: ['soy', 'es', 'eres', 'son'], prompt: 'Ella ___ alta.' };
  const coachOk = 'Yes! Think about the rules: which form of ser goes with ella, as in estar vs ser?';
  check('a reply with "yes", "rules" and "estar" is not taken for the answer "es"', leakGuard(coachOk, esItem, []) === coachOk);
  check('a reply that says "es" is still replaced', leakGuard('The answer is es.', esItem, []) !== 'The answer is es.');
  check('"yes" from the learner does not count as saying "es"', leakGuard('It is es.', esItem, [{ role: 'user', content: 'yes' }]) !== 'It is es.');
  check('a fraction is matched whole: 13/40 is not 3/4', leakGuard('Try 13/40 first.', { answer: '3/4', prompt: 'p' }, []) === 'Try 13/40 first.');

  close();
  try { fs.unlinkSync(tmp); } catch { /* not written */ }
  try { fs.unlinkSync(`${tmp}.tmp`); } catch { /* none */ }
  console.log(`\n${failures ? `${failures} failure(s)` : 'all checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
