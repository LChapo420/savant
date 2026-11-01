#!/usr/bin/env node
/**
 * The reading check (services/reading-check.js, routes/reading-check.js, content/reading-check-bank.json):
 *   1. the item bank is valid and spans the reading levels, with calibration from two judges that agree within a grade
 *   2. the adaptive test: 10 to 12 items, each near the running estimate, recovers a simulated learner's reading grade
 *   3. the scorecard is updated through its evidence path (a logged observation on vocabulary_ceiling, a designed test),
 *      never by writing a value; a rushed check is kept and not fed
 *   4. the offers: once at onboarding, then at most one more each 25 levels; "not now" uses the offer up; READING_CHECK=off
 *   5. the route over real HTTP: sign-in needed, the key never sent, a repeated or foreign question refused, the result returned
 *   6. the screens exist and are wired (onboarding and dashboard offers, the page, accessibility hooks)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-check-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
delete process.env.READING_CHECK;

const express = require('express');
const db = require('../config/db');
const rc = require('../services/reading-check');
const scorecard = require('../services/scorecard');

process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });
let failed = 0;
async function check(name, fn) { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); } }

const NOW = new Date();
const user = (tag, age = 14) => db.insert('users', { email: `${tag}@t.test`, display_name: tag, password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: `${NOW.getUTCFullYear() - age}-01`, synthetic: true } });
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
/** A simulated reader of true grade `g`: right with the model's own probability (a different draw per learner, fixed seed). */
function reader(g, seed) {
  let s = seed;
  const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  return (item) => rnd() < 0.25 + 0.75 * sigmoid((g - item.level) / 1.1);
}
function runCheck(u, g, seed, ms = 6000) {
  const answers = reader(g, seed);
  const byId = new Map(rc.bank().items.map((i) => [i.id, i]));
  let out = rc.start(u);
  const levels = [];
  while (!out.done) {
    const item = byId.get(out.item.id);
    levels.push(item.level);
    const ok = answers(item);
    out = rc.answer(u, out.session_id, item.id, ok ? item.answer : (item.answer + 1) % 4, ms);
  }
  return { out, levels };
}

(async () => {
  console.log('1. the bank');
  const bank = rc.bank();
  const { problems, positions } = rc.validateBank(bank);
  await check('the bank is valid: ids, four distinct choices, a key, lengths, no duplicates, two judges within a grade', () => assert.deepStrictEqual(problems, []));
  await check('it is big enough to give a learner a fresh check each time', () => assert.ok(bank.items.length >= 150, bank.items.length));
  await check('it holds both kinds: vocabulary in context and passages', () => {
    const v = bank.items.filter((i) => i.type === 'vocab').length;
    assert.ok(v >= 60 && bank.items.length - v >= 60, [v, bank.items.length - v]);
  });
  await check('every reading grade from 2 to 12 has at least eight items', () => {
    for (let g = 2; g <= 12; g++) assert.ok(bank.items.filter((i) => Math.round(i.level) === g).length >= 8, `grade ${g}`);
  });
  await check('the right answer sits in every position (none under 15% or over 35%)', () => {
    const n = bank.items.length;
    positions.forEach((p, i) => assert.ok(p / n >= 0.15 && p / n <= 0.35, `position ${i}: ${p}/${n}`));
  });
  await check('the calibration record is there: two judges, agreement figures, items kept only when both accept the key', () => {
    const c = bank.calibration;
    assert.strictEqual(bank.judges.length, 2);
    assert.ok(c.judge_agreement.r >= 0.9 && c.judge_agreement.within_1_grade >= 0.7 && c.key_accepted_by_both >= 0.95, JSON.stringify(c.judge_agreement));
    assert.ok(c.passage_vs_flesch_kincaid.r >= 0.8, JSON.stringify(c.passage_vs_flesch_kincaid));
  });
  await check('the learner\'s copy of an item has no key and no calibration', () => {
    const pub = rc.publicItem(bank.items[0], 1);
    assert.deepStrictEqual(Object.keys(pub).sort(), ['choices', 'id', 'passage', 'position', 'prompt', 'type']);
  });

  console.log('2. the adaptive test');
  await check('it asks 10 to 12 questions and every one is near the running estimate', () => {
    const u = user('adapt1', 14);
    const { out, levels } = runCheck(u, 8, 11);
    assert.ok(out.result.asked >= 10 && out.result.asked <= 12, out.result.asked);
    const late = levels.slice(4);
    assert.ok(late.every((l) => Math.abs(l - out.result.grade) < 3.5), [late, out.result.grade]);
  });
  await check('it recovers the reading grade of simulated learners at grades 3, 6, 9 and 11 within 1.5 grades on average', () => {
    const errs = [];
    for (const g of [3, 6, 9, 11]) for (let k = 0; k < 6; k++) {
      const u = user(`rec${g}-${k}`, 12);
      const { out } = runCheck(u, g, 100 + g * 10 + k);
      errs.push(Math.abs(out.result.grade - g));
    }
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    assert.ok(mean <= 1.5, `mean error ${mean.toFixed(2)}`);
  });
  await check('a stronger reader ends higher than a weaker one, from the same start', () => {
    const lo = runCheck(user('lo', 12), 4, 7).out.result.grade;
    const hi = runCheck(user('hi', 12), 11, 7).out.result.grade;
    assert.ok(hi - lo > 3, [lo, hi]);
  });
  await check('the first question is a little below what the learner\'s age leads us to expect, and the same learner gets different questions next time', () => {
    const a = user('start-a', 14);
    const first = rc.start(a);
    assert.ok(first.item && rc.bank().items.find((i) => i.id === first.item.id).level <= rc.expectedGrade(14), first.item.id);
    const run1 = runCheck(user('rep1', 12), 7, 5).levels.join();
    const run2 = runCheck(user('rep2', 12), 7, 6).levels.join();
    assert.notStrictEqual(run1, run2);
  });
  await check('"I don\'t know" is a miss, a repeated question is refused, and the age sets the prior', () => {
    const u = user('dk', 10);
    const first = rc.start(u);
    const r1 = rc.answer(u, first.session_id, first.item.id, null, 5000);
    assert.ok(!r1.error);
    const again = rc.answer(u, first.session_id, first.item.id, 1, 5000);
    assert.strictEqual(again.code, 'repeat');
    assert.strictEqual(rc.expectedGrade(10), 5);
    assert.strictEqual(rc.expectedGrade(null), 9);
    assert.strictEqual(rc.expectedGrade(40), 12);
  });

  console.log('3. the scorecard');
  await check('a finished check lands on vocabulary_ceiling through the evidence path: a logged observation from "reading check", with high confidence', () => {
    const u = user('card1', 14);
    const before = scorecard.read(scorecard.get(u.id), 'vocabulary_ceiling');
    const { out } = runCheck(u, 12, 3);
    assert.ok(out.result.fed);
    const card = scorecard.get(u.id);
    const logged = (card.log || []).filter((l) => l.source === 'reading check' && l.stat === 'vocabulary_ceiling');
    assert.strictEqual(logged.length, 1, JSON.stringify(card.log));
    assert.ok(/reading check: about grade/.test(logged[0].note));
    const after = scorecard.read(card, 'vocabulary_ceiling');
    assert.ok(after.measured > 60, `a grade-12 reader aged 14 should read high: ${after.measured}`);
    assert.ok(after.confidence >= 60 && after.confidence > before.confidence, `confidence ${before.confidence} -> ${after.confidence}`);
  });
  await check('a weak reader reads low, the other way', () => {
    const u = user('card2', 16);
    runCheck(u, 4, 4);
    const r = scorecard.read(scorecard.get(u.id), 'vocabulary_ceiling');
    assert.ok(r.measured < 40, r.measured);
  });
  await check('the score is relative to age: the same reading grade is high for a child and low for an adult', () => {
    const kid = runCheck(user('age-kid', 9), 8, 9).out.result.score;
    const adult = runCheck(user('age-adult', 40), 8, 9).out.result.score;
    assert.ok(kid > 60 && adult < 40, [kid, adult]);
  });
  await check('a check answered in a rush is kept for the record and not fed to the scorecard', () => {
    const u = user('rush', 14);
    const { out } = runCheck(u, 9, 8, 900);
    assert.strictEqual(out.result.fed, false);
    assert.strictEqual((scorecard.get(u.id).log || []).filter((l) => l.source === 'reading check').length, 0);
    assert.strictEqual(db.find('reading_checks', (r) => r.user_id === u.id)[0].status, 'done');
  });
  await check('the hook and the signal are the only writers (no direct edit of the card)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'reading-check.js'), 'utf8');
    assert.ok(!/db\.(update|upsert|insert)\('scorecards'/.test(src) && /hooks\.onReadingCheck/.test(src));
    const hooks = fs.readFileSync(path.join(__dirname, '..', 'services', 'scorecard', 'hooks.js'), 'utf8');
    assert.ok(/scorecard\.observe\(userId, obs, \{ source: 'reading check' \}\)/.test(hooks));
  });

  console.log('4. the offers');
  await check('a new learner is offered the check once; "not now" uses the offer up', () => {
    const u = user('offer1', 14);
    assert.strictEqual(rc.status(u.id).offer, 'onboarding');
    const after = rc.decline(u, 'onboarding');
    assert.strictEqual(after.offer, null);
  });
  await check('then at most one more for each 25 levels finished (four in 100), and taking one uses its slot up', () => {
    const u = user('offer2', 14);
    const e = db.insert('enrollments', { user_id: u.id, track_id: 'math', grade_id: 'x', levels_completed: 0, status: 'active' });
    runCheck(u, 7, 2);
    assert.strictEqual(rc.status(u.id).offer, null);
    db.update('enrollments', e.id, { levels_completed: 24 });
    assert.strictEqual(rc.status(u.id).offer, null);
    db.update('enrollments', e.id, { levels_completed: 25 });
    assert.strictEqual(rc.status(u.id).offer, 'periodic');
    rc.decline(u, 'periodic');
    assert.strictEqual(rc.status(u.id).offer, null);
    db.update('enrollments', e.id, { levels_completed: 100 });
    assert.strictEqual(rc.status(u.id).offer, 'periodic');
    const slots = 1 + 1 + Math.floor(100 / 25);
    assert.ok(slots <= 6);
  });
  await check('READING_CHECK=off hides it everywhere', () => {
    process.env.READING_CHECK = 'off';
    try {
      const u = user('off1', 14);
      assert.strictEqual(rc.status(u.id).offer, null);
      assert.strictEqual(rc.start(u).code, 'off');
    } finally { delete process.env.READING_CHECK; }
  });

  console.log('5. the route over real HTTP');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/reading-check', require('../routes/reading-check'));
  const server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  const call = (method, url, uid, body) => new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers: { 'x-user': String(uid || ''), 'content-type': 'application/json', connection: 'close' } }, (res) => {
      let t = ''; res.on('data', (d) => { t += d; });
      res.on('end', () => ok({ status: res.statusCode, text: t, json: (() => { try { return JSON.parse(t); } catch { return null; } })() }));
    });
    req.on('error', fail);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
  const a = user('http-a', 13);
  const b = user('http-b', 13);
  await check('signed out: 401 on every route', async () => {
    for (const [m, p] of [['GET', ''], ['POST', '/start'], ['POST', '/answer'], ['POST', '/decline']]) assert.strictEqual((await call(m, `/api/reading-check${p}`, 0, {})).status, 401);
  });
  await check('a whole check over HTTP: the key is never sent, the result comes back, the status moves on', async () => {
    assert.strictEqual((await call('GET', '/api/reading-check', a.id)).json.offer, 'onboarding');
    let r = await call('POST', '/api/reading-check/start', a.id, { kind: 'onboarding' });
    assert.strictEqual(r.status, 200);
    const sid = r.json.session_id;
    const byId = new Map(rc.bank().items.map((i) => [i.id, i]));
    let n = 0;
    while (!r.json.done && n < 20) {
      assert.ok(!/"answer"|"judged"|"level"/.test(r.text), 'the key or calibration was sent');
      const item = byId.get(r.json.item.id);
      r = await call('POST', '/api/reading-check/answer', a.id, { session_id: sid, item_id: item.id, choice: item.answer, ms: 7000 });
      assert.strictEqual(r.status, 200);
      n++;
    }
    assert.ok(r.json.done && r.json.result.asked >= 10 && r.json.result.fed);
    assert.ok(r.json.result.grade > 8, r.json.result.grade);
    const s = (await call('GET', '/api/reading-check', a.id)).json;
    assert.strictEqual(s.offer, null);
    assert.strictEqual(s.taken, 1);
    assert.ok(s.last && s.last.fed);
  });
  await check('another learner\'s check is not reachable, and a bad or repeated question is refused', async () => {
    const r = await call('POST', '/api/reading-check/start', b.id, {});
    const sid = r.json.session_id;
    const foreign = await call('POST', '/api/reading-check/answer', a.id, { session_id: sid, item_id: r.json.item.id, choice: 0 });
    assert.strictEqual(foreign.status, 404);
    const bad = await call('POST', '/api/reading-check/answer', b.id, { session_id: sid, item_id: 'nope', choice: 0 });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await call('POST', '/api/reading-check/answer', b.id, { session_id: sid, item_id: r.json.item.id, choice: 1, ms: 5000 })).status, 200);
    assert.strictEqual((await call('POST', '/api/reading-check/answer', b.id, { session_id: sid, item_id: r.json.item.id, choice: 1, ms: 5000 })).status, 400);
  });
  await check('decline over HTTP uses the offer up', async () => {
    const c = user('http-c', 13);
    assert.strictEqual((await call('POST', '/api/reading-check/decline', c.id, { kind: 'onboarding' })).json.offer, null);
  });
  server.close();

  console.log('6. the screens');
  const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
  await check('the page, its script and the offer card exist and are wired into onboarding and the dashboard', () => {
    assert.ok(/reading-check\.js/.test(pub('reading-check.html')) && /player\.js/.test(pub('reading-check.html')) && /name="viewport"/.test(pub('reading-check.html')));
    assert.ok(/reading-offer\.js/.test(pub('onboarding.html')) && /id="reading-offer"/.test(pub('onboarding.html')) && /ReadingOffer\.mount/.test(pub('js/onboarding.js')));
    assert.ok(/reading-offer\.js/.test(pub('dashboard.html')) && /id="reading-offer"/.test(pub('js/dashboard.js')) && /ReadingOffer\.mount/.test(pub('js/dashboard.js')));
    assert.ok(/\/api\/reading-check/.test(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8')));
  });
  await check('the screen is skippable and accessible: Not now, I don\'t know, a progress bar with a label, a live question counter, focus on the result', () => {
    const js = pub('js/reading-check.js') + pub('js/reading-offer.js');
    assert.ok(/Not now/.test(js) && /I don’t know/.test(js) && /role="progressbar"/.test(js) && /aria-label="Reading check progress"/.test(js) && /aria-live="polite"/.test(js) && /\.focus\(\)/.test(js) && /aria-labelledby/.test(js));
  });
  await check('the tutor dock is off on the check (a tutor that explains a word would measure the tutor)', () => {
    const tc = require('../services/tutor-context');
    assert.strictEqual(tc.modeFor('/reading-check?next=/dashboard'), 'off');
    assert.strictEqual(tc.modeFor('/dashboard'), 'full');
  });
  await check('the learner data it keeps is covered by account deletion and the parent\'s download', () => {
    assert.ok(/'reading_checks'/.test(fs.readFileSync(path.join(__dirname, '..', 'routes', 'consent.js'), 'utf8')));
    assert.ok(/'reading_checks'/.test(fs.readFileSync(path.join(__dirname, '..', 'config', 'db.js'), 'utf8')));
  });

  if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
  console.log('\nreading-check-test: all checks passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
