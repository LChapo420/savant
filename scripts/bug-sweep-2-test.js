/**
 * Regressions from the second bug sweep (docs/BUG-SWEEP.md): pages that loaded fine and did the wrong thing. No model is called.
 *   node scripts/bug-sweep-2-test.js      (also run by `npm test`)
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `bug-sweep-2-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none there */ }
for (const name of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(name)) process.env[name] = '';
process.env.CONSENT_SWEEP = 'off';

const express = require('express');
const db = require('../config/db');
const ai = require('../services/ai');
const safety = require('../services/tutor-safety');

let failures = 0;
const check = (label, ok, detail) => { if (ok) console.log(`  ok   ${label}`); else { failures += 1; console.log(`  FAIL ${label}${detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 400)}`}`); } };

function phrases() {
  console.log('crisis wording');
  const s = (t, age) => safety.triage(t, { age });
  const fixed = (t, age) => { const r = s(t, age); return !!(r && r.reply); };
  const crisis = [
    'i don’t want to live anymore', 'I’m being abused', 'i can’t breathe', 'i do not want to live', 'I want to end it', 'i wanna end it', 'thinking about ending it', 'i\'m ending it all',
    'life isn\'t worth living', 'my life is not worth living', 'i want to disappear', 'i wish i could die', 'i wish i was never born', 'i can\'t go on', 'kms', 'i should just die', 'nobody would care if i died',
    'i took a bunch of pills', 'i took 30 pills', 'my brother is not breathing', 'my friend isn\'t breathing', 'she\'s unconscious', 'he passed out and won\'t wake up', 'i cant breath', 'he is having seizures', 'i drank bleach',
    'how to commit suicide', 'is suicide painless', 'i keep thinking about suicide', 'my dad is going to kill me', 'someone is going to kill me', 'please kill me',
    'a man online wants to meet me', 'a guy online keeps asking for pics', 'a stranger on snapchat wants me to send photos', 'i met a guy online', 'he told me not to tell my mom',
  ];
  const missed = crisis.filter((t) => !fixed(t));
  check('a real crisis gets the fixed reply, however a phone types it', !missed.length, missed);
  const ordinary = [
    'this test is going to kill me', 'finals are gonna kill me', 'my mom is going to kill me if i fail', 'my mom will kill me if she sees this grade', 'my dad would kill me', 'these problems are killing me', 'homework killing me lol', 'you\'re killing me', 'the suspense is killing me',
    'a person online explained it differently', 'someone online said the answer is 5', 'a guy on tiktok explained this better', 'i saw a guy online do it another way', 'don\'t tell my mom i got a B',
    'my teacher is passing out the tests', 'we are passing out flyers', 'the teacher was passing out quizzes',
    'i am learning about poison dart frogs', 'i don\'t understand poison ivy', 'i have to write about poison gas in ww1', 'help me understand the seizure of power in 1917', 'i am writing an essay about overdose deaths', 'i read a book about a poisoned king',
    'i want to end things with this chapter', 'how does the book end things', 'why did the author end it all that way', 'i want to die laughing', 'i wanna cut myself some slack',
    'what does suicide mean in this poem', 'hamlet considers suicide', 'why does juliet commit suicide', 'write about the theme of suicide in hamlet', 'define self-harm',
    'i don\'t want to be here, this class is boring',
  ];
  const fired = ordinary.filter((t) => fixed(t));
  check('everyday talk and study questions naming those words reach the tutor', !fired.length, fired.map((t) => [t, s(t).kind]));
  const child = ['my school is really hard', 'my school is so boring', 'my name is not important'];
  check('a child saying "my school is hard" is not told off for sharing it', child.every((t) => !fixed(t, 10)), child.filter((t) => fixed(t, 10)));
  const childShares = ['my school is Lincoln', 'my school is lincoln elementary', 'my school is called westside', 'my name is john smith', 'my address is 5 oak road', 'my phone number is 402-555-1212'];
  check('a child sharing their school, name or address is still asked not to', childShares.every((t) => s(t, 10) && s(t, 10).kind === 'personal_info'), childShares.filter((t) => !(s(t, 10) && s(t, 10).kind === 'personal_info')));
}

async function routes() {
  console.log('crisis replies on every chat route');
  let modelCalls = 0;
  const spy = () => { modelCalls += 1; return Promise.resolve('a hint from the model'); };
  ai.talk = spy; ai.coachReply = spy; ai.tutorReply = spy; ai.remediationTeachReply = spy;
  ai.coachReplyStream = async ({ onDelta }) => { modelCalls += 1; onDelta('a hint from the model'); return { text: 'a hint from the model' }; };
  const adult = db.insert('users', { email: 'a@example.test', display_name: 'Ada', password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { needs_parent: false, under_13: false, age_at_check: 30, consent_age: 13, country: 'US', birth_ym: '1996-01' } });
  const open = db.insert('items', { user_id: adult.id, prompt: 'What is 2 + 2?', answer: '4', format: 'typed', skill_id: 'x', correct: null, role: 'check', level: 1 });
  const done = db.insert('items', { user_id: adult.id, prompt: 'What is 2 + 3?', answer: '5', format: 'typed', skill_id: 'x', correct: true, user_answer: '5', rationale: 'Add them.', role: 'check', level: 1 });
  const rem = db.insert('remediations', { user_id: adult.id, level: 1, kind: 'quiz', status: 'open', areas: [{ skill_id: 'x', skill_name: 'x', messages: [] }] });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api', require('../routes/learn'));
  app.use('/api', require('../routes/base-lessons'));
  app.use('/api', require('../routes/remediation'));
  const server = await new Promise((r) => { const sv = app.listen(0, '127.0.0.1', () => r(sv)); });
  const port = server.address().port;
  const post = (url, body) => new Promise((ok, fail) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', agent: false, port, path: url, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-user': String(adult.id) } }, (res) => {
      let text = ''; res.on('data', (c) => { text += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json, text }); });
    });
    req.on('error', fail); req.write(data); req.end();
  });
  const say = 'i want to kill myself';
  const messages = [{ role: 'user', content: say }];
  const stream = await post(`/api/items/${open.id}/coach/stream`, { messages });
  check('the streamed coach (what the session page uses) gives the fixed reply', /988/.test(stream.text) && /"replace"/.test(stream.text) && !/a hint/.test(stream.text), stream.text);
  check('the crisis message is not kept on the question', !db.byId('items', open.id).coach_log && !db.byId('items', open.id).coach_used);
  const ask = await post(`/api/items/${done.id}/ask`, { question: say });
  check('asking after answering gives the fixed reply', /988/.test(ask.json.reply) && ask.json.source === 'safety', ask.json);
  check('and the message is not kept', !db.byId('items', done.id).ask_log);
  const block = await post('/api/lessons/math/calculus_i/10/assist', { target: { type: 'block', index: 0 }, messages });
  check('help under a lesson block gives the fixed reply', block.status === 200 && /988/.test(block.json.reply) && block.json.source === 'safety', block);
  const page = await post('/api/lessons/math/calculus_i/10/assist', { target: { type: 'page' }, messages });
  check('help on a lesson page gives the fixed reply', page.status === 200 && /988/.test(page.json.reply), page);
  const game = await post('/api/lessons/math/calculus_i/10/assist', { target: { type: 'game', question_index: 0 }, messages });
  check('help on a game question gives the fixed reply', game.status === 200 && /988/.test(game.json.reply), game);
  const teach = await post(`/api/remediation/${rem.id}/teach`, { area_index: 0, message: say });
  check('the teaching chat after a failed check gives the fixed reply', teach.status === 200 && /988/.test(teach.json.reply) && teach.json.source === 'safety', teach);
  check('none of them reached a model', modelCalls === 0, modelCalls);
  const hint = await post(`/api/items/${open.id}/coach/stream`, { messages: [{ role: 'user', content: 'what is a poison dart frog' }] });
  check('an ordinary message still reaches the coach', /a hint/.test(hint.text) && modelCalls === 1, hint.text);

  console.log('the layer does not depend on the writing models');
  const learner = require('../services/learner');
  const v = db.insert('users', { email: 'v@example.test', display_name: 'Val', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  learner.saveProfile(v.id, { survey: { interests: 'basketball' } });
  const grade = require('../config/curriculum').getGrade('math', 'calculus_i');
  const lessonLevel = [...Array(60).keys()].map((i) => i + 11).find((l) => require('../services/block-levels').kindFor(grade, l) === 'lesson');
  db.insert('block_plans', { track_id: 'math', grade_id: 'calculus_i', level: lessonLevel, attempt: 1, status: 'ready', kind: 'lesson', user_id: null, blocks: [], answers: {}, checks: [], check_tier: 'sonnet', verification: { status: 'verified', model: 'claude-test' } });
  const lesson = await new Promise((ok, fail) => {
    http.get({ host: '127.0.0.1', agent: false, port, path: `/api/lessons/math/calculus_i/${lessonLevel}`, headers: { 'x-user': String(v.id) } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => ok({ status: res.statusCode, json: JSON.parse(t) })); }).on('error', fail);
  });
  check('with no writing model free, a lesson with a shared version still opens with its layer slot', lesson.status === 200 && lesson.json.meta && lesson.json.meta.layer === true, { status: lesson.status, meta: lesson.json.meta });
  await new Promise((r) => server.close(r));
}

function planPin() {
  console.log('the instant lesson stays on the plan it opened on');
  const blockLevels = require('../services/block-levels');
  const layer = require('../services/lesson-layer');
  const u = db.insert('users', { email: 'p@example.test', display_name: 'Pat', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  const where = { track_id: 'math', grade_id: 'calculus_i', level: 10, attempt: 1, status: 'ready', kind: 'lesson', blocks: [], answers: {}, check_tier: 'sonnet', verification: { status: 'verified', model: 'claude-test' } };
  const checks = (q) => [{ id: 'c1', prompt: q, format: 'multiple_choice', choices: ['a', 'b'], answer: q === 'shared' ? 'a' : 'b', rationale: q, skill_id: 'x', difficulty: 1 }];
  const shared = db.insert('block_plans', { ...where, user_id: null, checks: checks('shared') });
  const find = () => blockLevels.findPlan({ userId: null, trackId: 'math', gradeId: 'calculus_i', level: 10 });
  if (!find()) { check('the shared plan is servable in this test', false, 'not servable'); return; }
  const own = db.insert('block_plans', { ...where, user_id: u.id, checks: checks('own') });
  check('with no instant open, a tailored learner is served their own plan', blockLevels.servedPlan(u, 'math', 'calculus_i', 10).id === own.id || !blockLevels.tailorsFor(u), blockLevels.servedPlan(u, 'math', 'calculus_i', 10).id);
  db.insert(layer.COLLECTION, { user_id: u.id, plan_id: shared.id, track_id: 'math', grade_id: 'calculus_i', level: 10, status: 'ready', layer: { hook: 'Imagine?' } });
  const served = blockLevels.servedPlan(u, 'math', 'calculus_i', 10);
  check('once opened on the shared plan, grading stays on it after their own plan is ready', served.id === shared.id, served.id);
  const verdict = blockLevels.answerCheck({ user: u, plan: served, checkId: 'c1', answer: 'a', ms: 3000 });
  check('the answer is marked against the question on screen, not the newer plan\'s c1', verdict.correct === true && verdict.rationale === 'shared', verdict);
  check('openedOnShared names that plan', (blockLevels.openedOnShared(u, 'math', 'calculus_i', 10) || {}).id === shared.id);
  const other = db.insert('users', { email: 'q@example.test', display_name: 'Quin', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  check('and another learner is not affected', blockLevels.openedOnShared(other, 'math', 'calculus_i', 10) === null);
}

async function childGate() {
  console.log('a child with no outside AI: a crisis message is answered, everything else stays refused');
  const consent = require('../routes/consent');
  const kid = db.insert('users', { email: null, username: 'kidgate', display_name: 'Kid', password_hash: 'x', account_type: 'child', xp: 0, streak: 0, age_check: { needs_parent: true, under_13: true, age_at_check: 10, consent_age: 13, country: 'US', birth_ym: `${new Date().getUTCFullYear() - 10}-01` } });
  const run = (path, body) => new Promise((ok) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { ok({ status: this.code, json: j, passed: false }); return this; } };
    consent.gate({ user: kid, method: 'POST', path, body }, res, () => ok({ passed: true }));
  });
  const crisis = await run('/tutor/chat', { messages: [{ role: 'user', content: 'i want to kill myself' }], where: 'home' });
  check('the home chat gives a child the fixed reply, for a child', crisis.status === 200 && /grown-up/.test(crisis.json.reply) && crisis.json.source === 'safety', crisis);
  const coach = await run('/items/5/coach/stream', { messages: [{ role: 'user', content: 'i dont want to be alive' }] });
  check('so does the question coach', coach.status === 200 && /grown-up/.test(coach.json.reply), coach);
  const ask = await run('/items/5/ask', { question: 'i want to kill myself' });
  check('and asking after answering', ask.status === 200 && /grown-up/.test(ask.json.reply), ask);
  const plain = await run('/tutor/chat', { messages: [{ role: 'user', content: 'what is counting' }], where: 'home' });
  check('an ordinary message is still refused, never passed on', plain.status === 403 && plain.json.code === 'parent_opt_in_required' && !plain.passed, plain);
  const earlier = await run('/tutor/chat', { messages: [{ role: 'user', content: 'i want to kill myself' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'ok what is counting' }] });
  check('only the latest message is read', earlier.status === 403, earlier);
  for (const route of ['/materials', '/materials/paste', '/materials/link', '/materials/transcript', '/materials/youtube', '/materials/video', '/materials/audio']) {
    const up = await run(route, { url: 'https://www.youtube.com/watch?v=x' });
    check(`a child cannot add material through ${route}`, up.status === 403 && up.json.code === 'child_upload_off', up);
  }
}

function buildGuard() {
  console.log('a model cooling down does not stop a build');
  const providers = require('../services/providers');
  const real = providers.ALL.nvidia;
  const wasEnabled = ai.isEnabled;
  ai.isEnabled = () => false;
  check('no model at all: a build may not start', ai.canBuild() === false);
  providers.ALL.nvidia = { ...real, isConfigured: () => true, status: () => ({ cooling: ['z-ai/glm-5.3-flash'] }), isEnabled: () => false };
  check('every NVIDIA model set aside for a minute: it may', ai.canBuild() === true);
  providers.ALL.nvidia = { ...real, isConfigured: () => true, status: () => ({ cooling: [] }), isEnabled: () => false };
  check('NVIDIA stood down for a bad key, nothing cooling: it may not', ai.canBuild() === false);
  providers.ALL.nvidia = real;
  ai.isEnabled = wasEnabled;
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'my-material.js'), 'utf8');
  check('the page re-enables its buttons when a build ended with nothing to show', /if \(!c\) \{ btn\.textContent = 'Learning path'; btn\.disabled = false; if \(pressed\)/.test(page) && /if \(!p\) \{ btn\.textContent = 'Study pack'; btn\.disabled = false; if \(pressed\)/.test(page));
}

function saveFailure() {
  console.log('a failed save is not marked wrong');
  const vm = require('vm');
  const node = (tag) => { const n = { tag, children: [], className: '', textContent: '', attrs: {}, classList: { items: [], add(c) { this.items.push(c); } }, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; }, querySelector() { return null; } }; return n; };
  const sandbox = { document: { createElement: node, getElementById: () => null }, window: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'engine', 'checks', 'checks-common.js'), 'utf8').replace('typeof window !== \'undefined\' ? window : globalThis', 'window'), sandbox);
  const Kit = sandbox.window.PolymathCheckKit;
  const text = (h) => JSON.stringify(h.children.map((b) => b.children.map((c) => c.textContent)));
  const failed = node('div'); Kit.verdict(failed, { correct: false, answer: '', rationale: 'No connection.' });
  check('a failed save says so, not "Not quite"', /Not saved/.test(text(failed)) && !/Not quite/.test(text(failed)) && !failed.children[0].classList.items.includes('is-wrong'), text(failed));
  const wrong = node('div'); Kit.verdict(wrong, { correct: false, answer: '9', rationale: 'Because.' });
  check('a wrong answer still says the answer', /Not quite\. The answer is: 9/.test(text(wrong)) && wrong.children[0].classList.items.includes('is-wrong'), text(wrong));
}

async function lateRows() {
  console.log('a reply that arrives after the account is deleted does not bring it back');
  const consent = require('../routes/consent');
  const deletion = require('../services/account-deletion');
  const u = db.insert('users', { email: 'late@example.test', display_name: 'Late', password_hash: 'x', account_type: 'standard', xp: 0, streak: 0 });
  deletion.deleteAccount(u);
  db.insert('assist_chats', { user_id: u.id, messages: [{ role: 'user', content: 'my own words' }] }); // the chat that was in flight
  const other = db.insert('assist_chats', { user_id: 424242, messages: [] });
  const out = await consent.sweep();
  check('the sweep removes the late row', out.late_rows === 1 && !db.find('assist_chats', (r) => r.user_id === u.id).length, out);
  check('and leaves everyone else alone', !!db.byId('assist_chats', other.id));
}

function accountData() {
  console.log('deleting an account reaches shared plans; the export covers every collection');
  const blockLevels = require('../services/block-levels');
  const deletion = require('../services/account-deletion');
  const u = db.insert('users', { email: 'del@example.test', display_name: 'Del', password_hash: 'x', account_type: 'standard', xp: 0, streak: 0 });
  const keep = 99999;
  const shared = db.insert('block_plans', { track_id: 'math', grade_id: 'x', level: 1, status: 'ready', user_id: null, answers: { [`${u.id}:c1`]: { correct: false, answer: 'SECRET typed answer' }, [`${keep}:c1`]: { correct: true, answer: 'other' } }, telemetry: { [u.id]: { blocks: [] }, [keep]: { blocks: [] } } });
  deletion.deleteAccount(u);
  const after = db.byId('block_plans', shared.id);
  check('what they typed on a shared plan goes with the account', !JSON.stringify(after).includes('SECRET'), after.answers);
  check('their telemetry goes too, another learner\'s stays', !after.telemetry[u.id] && !!after.telemetry[keep] && !!after.answers[`${keep}:c1`], after.telemetry);
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'profile.js'), 'utf8');
  const exported = new Set([...src.match(/const EXPORT_MORE = \[([\s\S]*?)\];/)[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
  ['enrollments', 'skill_states', 'sessions', 'items', 'events', 'level_feedback', 'scorecards', 'level_signals', 'profiles'].forEach((n) => exported.add(n));
  ['lessons', 'level_edits', 'block_plans', 'game_payloads'].forEach((n) => exported.add(n)); // pages written for the learner: left out on purpose (routes/profile.js)
  ['act_guests', 'recruit_counts'].forEach((n) => exported.add(n)); // no account behind them (routes/consent.js)
  const consent = require('../routes/consent');
  const known = [...fs.readFileSync(path.join(__dirname, '..', 'routes', 'consent.js'), 'utf8').match(/const KNOWN_COLLECTIONS = \[([\s\S]*?)\];/)[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  const missing = known.filter((n) => !consent.SHARED.has(n) && !exported.has(n));
  check('every learner collection is in the account export', !missing.length, missing);
}

(async () => {
  phrases();
  await childGate();
  buildGuard();
  saveFailure();
  accountData();
  await lateRows();
  await routes();
  planPin();
  console.log(failures ? `\n${failures} failed` : '\nAll ok');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
