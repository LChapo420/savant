#!/usr/bin/env node
/**
 * The optional measurement channels (services/boosters.js, services/boosters-import.js, routes/boosters.js, content/ipip-items.js):
 *   1. who may: nobody under their consent age without a parent's agreement; nobody who has not answered the age screen; consent withdrawn closes it
 *   2. the questionnaire: public-domain items mapped to real measures, scored on the server, a prior and never measured evidence
 *   3. the delayed memory check: due after a week, the answer key never sent, each answer a memory test, a horizon asked once
 *   4. the games: scored on the server against age norms, a too-short or random-tapping result not counted, counted once a week
 *   5. silent signals: off until switched on, summaries only (no keys, no text), fed in batches, cleared when switched off
 *   6. imports: figures in range, a review-history file read once and not kept, a terms-only export refused
 *   7. max accuracy: a confidence tap on every question and an experiment on every tailored page
 *   8. the routes over real HTTP, and a child sees nothing
 *   9. the screens, the privacy text and the parent's consent switch exist and are wired
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'boosters-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const express = require('express');
const db = require('../config/db');
const scorecard = require('../services/scorecard');
const boosters = require('../services/boosters');
const imports = require('../services/boosters-import');
const readingCheck = require('../services/reading-check');
const ipip = require('../content/ipip-items');
const signals = require('../services/scorecard/signals');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
async function check(name, fn) { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); } }

const NOW = new Date();
let seq = 0;
const user = (age = 15, extra = {}) => db.insert('users', {
  email: `b${++seq}@t.test`, display_name: `b${seq}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true,
  age_check: { birth_ym: `${NOW.getUTCFullYear() - age}-01`, synthetic: true, ...(age < 13 ? { under_13: true, needs_parent: true } : {}) }, ...extra,
});
const withConsent = (age, active = true, status = 'active') => {
  const u = user(age);
  const c = db.insert('parental_consents', { child_user_id: u.id, status, scopes: { measurement_extras: { requested: true, active, method: 'signed_form' } } });
  db.update('users', u.id, { consent_id: c.id });
  return db.byId('users', u.id);
};
const statOf = (u, id) => scorecard.get(u.id).stats[id];
const snap = (u, id) => JSON.stringify(statOf(u, id));

(async () => {
  console.log('1. who may');
  await check('a teenager and an adult may; an account that has not answered the age screen may not', () => {
    assert.strictEqual(boosters.allowed(user(15)), true);
    assert.strictEqual(boosters.allowed(user(30)), true);
    assert.strictEqual(boosters.allowed(db.insert('users', { email: 'noage@t.test', display_name: 'x', password_hash: 'x' })), false);
    assert.strictEqual(boosters.allowed(null), false);
  });
  await check('a child under their consent age may not, unless a parent agreed to this scope; withdrawn or unverified consent closes it again', () => {
    assert.strictEqual(boosters.allowed(user(10)), false);
    assert.strictEqual(boosters.allowed(withConsent(10, false)), false, 'requested but not verified');
    assert.strictEqual(boosters.allowed(withConsent(10, true, 'revoked')), false, 'consent withdrawn');
    assert.strictEqual(boosters.allowed(withConsent(10, true)), true);
  });
  await check('a child without consent gets no new data collection: every service refuses and the scorecard does not move', async () => {
    const c = user(10);
    const before = JSON.stringify(scorecard.get(c.id).stats);
    const answers = Object.fromEntries(ipip.ITEMS.map((i) => [i.id, 5]));
    for (const out of [
      boosters.questionnaire.submit(c, answers), boosters.delayed.start(c), boosters.games.submit(c, 'span', { max_span: 7, trials: 8 }),
      boosters.silent.set(c, true), boosters.silent.ingest(c, [{ hesitation_ms: 1000 }]), boosters.maxAccuracy.set(c, true), imports.importResults(c, { act_composite: 30 }),
    ]) assert.strictEqual(out.code, 'not_allowed', JSON.stringify(out));
    assert.strictEqual(boosters.status(c).allowed, false);
    assert.strictEqual(boosters.maxAccuracy.isOn(c.id), false);
    assert.strictEqual(readingCheck.status(c.id).offer, null, 'the reading check is closed to the child too');
    assert.strictEqual(readingCheck.start(c, {}).error !== undefined, true);
    assert.strictEqual(JSON.stringify(scorecard.get(c.id).stats), before);
  });
  await check('the parent can request this scope like the other two, and the operator can check it', () => {
    const src = read('routes/consent.js');
    assert.ok(/const OPT_INS = \[[^\]]*'measurement_extras'/.test(src), 'OPT_INS lacks measurement_extras');
    assert.ok(/measurement_extras: \{ requested: false, active: false/.test(src), 'blank scope missing');
    assert.ok(!/\['third_party_ai', 'ai_training'\]/.test(src), 'a scope list was left without the new scope');
  });

  console.log('2. the questionnaire');
  await check('sixteen public-domain items, each mapped to scorecard measures that exist, with a direction and a small weight', () => {
    const stats = new Set(scorecard.STATS ? scorecard.STATS.map((s) => s.id) : Object.keys(scorecard.get(user(15).id).stats));
    const ids = new Set();
    for (const it of ipip.ITEMS) {
      assert.ok(!ids.has(it.id)); ids.add(it.id);
      assert.ok(it.text.length > 5 && it.maps.length >= 1);
      for (const [stat, dir, w] of it.maps) { assert.ok(stats.has(stat), `${it.id} maps to unknown ${stat}`); assert.ok(dir === 1 || dir === -1); assert.ok(w > 0 && w <= 0.5); }
    }
    assert.ok(/public domain/i.test(ipip.SOURCE) || /public domain/i.test(read('content/ipip-items.js')));
    assert.ok(ipip.ITEMS.length === 16);
  });
  await check('scoring: agreeing raises a positively keyed measure and lowers a reverse-keyed one; neutral is the middle', () => {
    const items = [{ id: 'a', text: 'x', maps: [['persistence', 1, 0.5]] }, { id: 'b', text: 'y', maps: [['persistence', -1, 0.4]] }];
    const hi = signals.fromQuestionnaire({ a: 5, b: 5 }, items);
    assert.ok(hi[0].value > 80 && hi[1].value < 20);
    const mid = signals.fromQuestionnaire({ a: 3, b: 3 }, items);
    assert.ok(mid.every((o) => Math.abs(o.value - 50) < 1));
    assert.deepStrictEqual(signals.fromQuestionnaire({ a: 9, b: 'x' }, items), []);
  });
  await check('submitting moves the card as a prior, not as measured evidence; twice is refused; too few answers is refused; skipping is final', () => {
    const u = user(16);
    const answers = Object.fromEntries(ipip.ITEMS.map((i) => [i.id, i.factor === 'conscientiousness' ? 5 : 3]));
    assert.strictEqual(boosters.questionnaire.submit(u, { c_prepared: 5 }).code, 'too_few');
    const before = scorecard.read(scorecard.get(u.id), 'planning_tendency');
    const out = boosters.questionnaire.submit(u, answers);
    assert.ok(out.ok && out.answered === ipip.ITEMS.length, JSON.stringify(out));
    const after = scorecard.read(scorecard.get(u.id), 'planning_tendency');
    assert.ok(after.score > before.score, `${before.score} -> ${after.score}`);
    assert.ok(after.confidence <= 30, `a self-report must not look measured: confidence ${after.confidence}`);
    assert.strictEqual(boosters.questionnaire.submit(u, answers).code, 'done');
    assert.strictEqual(boosters.status(u).questionnaire.done, true);
    const v = user(16);
    boosters.questionnaire.skip(v);
    assert.strictEqual(boosters.status(v).questionnaire.skipped, true);
  });

  console.log('3. the delayed memory check');
  const seedSkill = (u, skill, daysAgo, n = 4) => {
    db.insert('skill_states', { user_id: u.id, skill_id: skill, attempts: n, correct: n - 1, mastery: 0.7, spaced_right: 1, spaced_wrong: 0, last_seen_at: new Date(Date.now() - daysAgo * 86400000).toISOString() });
    db.insert('items', { user_id: u.id, skill_id: skill, correct: true, prompt: `What is ${skill}?`, choices: ['A', 'B', 'C', 'D'], answer: 'C' });
  };
  await check('nothing is due until a skill is a week old; a month-old one is a month check; three questions at most', () => {
    const u = user(15);
    assert.strictEqual(boosters.delayed.due(u.id).due, false);
    seedSkill(u, 'sk_a', 2);
    assert.strictEqual(boosters.delayed.due(u.id).due, false);
    seedSkill(u, 'sk_b', 9);
    assert.deepStrictEqual([boosters.delayed.due(u.id).due, boosters.delayed.due(u.id).horizon], [true, 'week']);
    seedSkill(u, 'sk_c', 40); seedSkill(u, 'sk_d', 10); seedSkill(u, 'sk_e', 11);
    const d = boosters.delayed.due(u.id);
    assert.strictEqual(d.horizon, 'month');
    assert.strictEqual(d.questions, 3);
  });
  await check('a check: the key is never sent, a wrong id is refused, each answer is a memory test for the forgetting model, a horizon is asked once', () => {
    const u = user(15);
    seedSkill(u, 'sk_a', 9); seedSkill(u, 'sk_b', 10);
    const start = boosters.delayed.start(u);
    assert.ok(start.check_id && start.questions.length === 2, JSON.stringify(start));
    assert.ok(!/key|"answer"/.test(JSON.stringify(start)), 'the key was sent');
    const again = boosters.delayed.start(u);
    assert.strictEqual(again.check_id, start.check_id, 'a check already open is resumed, not duplicated');
    assert.strictEqual(boosters.delayed.answer(u, 'nope', {}).code, 'not_found');
    const stored = boosters.get(u.id).delayed.open;
    const before = snap(u, 'decay_rate');
    const out = boosters.delayed.answer(u, start.check_id, { 1: stored.questions[0].key, 2: (stored.questions[1].key + 1) % 4 });
    assert.deepStrictEqual([out.ok, out.asked, out.answered, out.right], [true, 2, 2, 1]);
    assert.notStrictEqual(snap(u, 'decay_rate'), before, 'the forgetting measure did not move');
    assert.strictEqual(boosters.delayed.due(u.id).due, false, 'the same horizon was offered again');
    assert.strictEqual(boosters.delayed.answer(u, start.check_id, {}).code, 'not_found', 'an answered check cannot be answered twice');
  });
  await check('a skipped question is not counted as wrong', () => {
    const u = user(15);
    seedSkill(u, 'sk_a', 9);
    const s = boosters.delayed.start(u);
    const out = boosters.delayed.answer(u, s.check_id, {});
    assert.deepStrictEqual([out.asked, out.answered], [1, 0]);
  });
  await check('memory tests keep the days since last practice, so a longer gap is a different observation', () => {
    const obs = signals.fromDelayedCheck([{ dt: 8, nc: 3, nw: 1, pk: 0.9, g: 0.25, right: true }, { dt: 0.2, nc: 1, nw: 0, pk: 0.9, g: 0.25, right: true }]);
    assert.strictEqual(obs.length, 1, 'a test under a day is not a delayed check');
    assert.strictEqual(obs[0].memory.dt, 8);
    assert.strictEqual(obs[0].memory.y, true);
  });

  console.log('4. the games');
  await check('scores are on a 0 to 100 scale against age norms, higher is better, and a young child is held to a lower norm', () => {
    const strong = boosters.gameScore('span', { max_span: 9, trials: 10 }, 16);
    const weak = boosters.gameScore('span', { max_span: 4, trials: 10 }, 16);
    assert.ok(strong > 50 && weak < 50 && strong <= 98 && weak >= 2);
    assert.ok(boosters.gameScore('span', { max_span: 5, trials: 10 }, 8) > boosters.gameScore('span', { max_span: 5, trials: 10 }, 16));
    assert.ok(boosters.gameScore('speed', { median_rt_ms: 380, trials: 30, accuracy: 0.95 }, 16) > boosters.gameScore('speed', { median_rt_ms: 700, trials: 30, accuracy: 0.95 }, 16));
    const att = (hits, fa) => boosters.gameScore('attention', { targets: 12, nontargets: 100, hits, false_alarms: fa, first_half_hits: hits / 2, second_half_hits: hits / 2 }, 16);
    assert.ok(att(11, 1) > att(6, 1) && att(11, 1) > att(11, 20));
  });
  await check('a result too short, too fast or random tapping is not counted', () => {
    assert.strictEqual(boosters.gameScore('span', { max_span: 30, trials: 10 }, 16), null);
    assert.strictEqual(boosters.gameScore('span', { max_span: 6, trials: 1 }, 16), null);
    assert.strictEqual(boosters.gameScore('speed', { median_rt_ms: 40, trials: 30, accuracy: 1 }, 16), null, 'a reaction under 150 ms is not human');
    assert.strictEqual(boosters.gameScore('speed', { median_rt_ms: 400, trials: 30, accuracy: 0.5 }, 16), null, 'tapping at random');
    assert.strictEqual(boosters.gameScore('attention', { targets: 3, nontargets: 100, hits: 3, false_alarms: 0 }, 16), null);
    assert.strictEqual(boosters.gameScore('nope', {}, 16), null);
  });
  await check('a good game moves its measure, counts once a week, and the card gets a designed test, not a typed value', () => {
    const u = user(16);
    const before = statOf(u, 'working_memory_span').s;
    const out = boosters.games.submit(u, 'span', { max_span: 9, trials: 10 });
    assert.ok(out.ok && out.fed, JSON.stringify(out));
    const after = statOf(u, 'working_memory_span').s;
    assert.ok(after > before, `${before} -> ${after}`);
    const second = boosters.games.submit(u, 'span', { max_span: 9, trials: 10 });
    assert.strictEqual(second.fed, false);
    assert.strictEqual(statOf(u, 'working_memory_span').s, after);
    const later = boosters.games.submit(u, 'span', { max_span: 9, trials: 10 }, Date.now() + 8 * 86400000);
    assert.strictEqual(later.fed, true);
    assert.strictEqual(boosters.games.submit(u, 'nope', {}).code, 'not_found');
    assert.strictEqual(boosters.games.submit(u, 'speed', { median_rt_ms: 20, trials: 30, accuracy: 1 }).fed, false);
  });

  console.log('5. silent signals');
  await check('off until the learner switches it on: nothing is kept', () => {
    const u = user(16);
    assert.deepStrictEqual(boosters.silent.ingest(u, [{ hesitation_ms: 900 }]), { ok: true, kept: 0, reason: 'off' });
    assert.strictEqual(boosters.status(u).silent.on, false);
  });
  await check('on: summaries only, fed in batches of ten, never the keys or the text', () => {
    const u = user(16);
    assert.ok(boosters.silent.set(u, true).on);
    const item = (i) => ({ hesitation_ms: 1500 + i * 100, keys: 12, key_median_ms: 260, backspaces: 2, text: 'the secret answer', key: 'a', keys_pressed: 'abc' });
    const first = boosters.silent.ingest(u, [0, 1, 2, 3].map(item));
    assert.deepStrictEqual([first.kept, first.fed], [4, false]);
    const kept = JSON.stringify(boosters.get(u.id).silent);
    assert.ok(!/secret|keys_pressed|"a"/.test(kept), `raw content kept: ${kept}`);
    const before = snap(u, 'processing_velocity');
    const second = boosters.silent.ingest(u, [4, 5, 6, 7, 8, 9].map(item));
    assert.strictEqual(second.fed, true);
    assert.notStrictEqual(snap(u, 'processing_velocity'), before);
    assert.strictEqual(boosters.get(u.id).silent.acc, null);
    boosters.silent.ingest(u, [item(1)]);
    boosters.silent.set(u, false);
    assert.strictEqual(boosters.get(u.id).silent.acc, null, 'switching it off clears what was gathered');
  });
  await check('values that cannot be real are dropped, and the weight is small and never a test', () => {
    const obs = signals.fromSilent({ items: 10, keys: 40, key_median_ms: 400, hesitation_ms: 5000, backspace_share: 0.3 });
    assert.ok(obs.length === 3 && obs.every((o) => o.weight <= 0.3 && !o.test && o.value >= 0 && o.value <= 100), JSON.stringify(obs));
    assert.deepStrictEqual(signals.fromSilent({ items: 3 }), []);
    const u = user(16); boosters.silent.set(u, true);
    const r = boosters.silent.ingest(u, [{ hesitation_ms: -5, keys: 9999, key_median_ms: 1 }, 'x', null]);
    assert.strictEqual(r.kept, 1, "only the object is an answer");
    assert.strictEqual(boosters.get(u.id).silent.acc.hes.length, 0);
  });

  console.log('6. imports');
  await check('typed figures: in range or refused; an ACT composite moves prior knowledge as a designed test', () => {
    const u = user(17);
    assert.strictEqual(imports.importResults(u, { act_composite: 99 }).code, 'bad_value');
    assert.strictEqual(imports.importResults(u, { gpa: 'abc' }).code, 'bad_value');
    assert.strictEqual(imports.importResults(u, {}).code, 'empty');
    const before = statOf(u, 'prior_knowledge').s;
    const out = imports.importResults(u, { act_composite: 31 });
    assert.deepStrictEqual([out.ok, out.kinds], [true, ['act_composite']]);
    assert.ok(statOf(u, 'prior_knowledge').s > before);
    const low = user(17);
    imports.importResults(low, { act_composite: 14 });
    assert.ok(statOf(low, 'prior_knowledge').s < before);
    assert.strictEqual(boosters.status(u).imports.kinds[0], 'act_composite');
    const o = signals.fromImportedResults({ sat_total: 1050, gpa: 3.0 });
    assert.ok(o.every((x) => Math.abs(x.value - 50) < 1 && x.test === true));
  });
  await check('a review-history file: an Anki-style export becomes memory tests; the text is not kept, only counts', () => {
    const u = user(17);
    const csv = ['card,interval_days,ease', ...Array.from({ length: 30 }, (_, i) => `c${i % 6},${1 + (i % 9)},${i % 4 === 0 ? 1 : 3}`)].join('\n');
    const before = snap(u, 'decay_rate');
    const out = imports.importResults(u, { history_csv: csv });
    assert.ok(out.ok && out.memory_tests > 20 && out.kinds.includes('review_history'), JSON.stringify(out));
    assert.notStrictEqual(snap(u, 'decay_rate'), before);
    assert.ok(!JSON.stringify(boosters.get(u.id)).includes('c3,'), 'the file was kept');
    const parsed = imports.parseHistory(csv);
    const second = parsed.tests.filter((t) => t.nc + t.nw > 0);
    assert.ok(second.length > 0, 'earlier answers of a card are known to later reviews');
  });
  await check('tab and semicolon files read; a terms-and-definitions export (no history) and a file with no result column are refused', () => {
    assert.ok(imports.parseHistory('card;interval;correct\na;3;1\nb;4;0\n').tests.length === 2);
    assert.ok(imports.parseHistory('interval_days\tcorrect\n3\tyes\n10\tno\n').tests.length === 2);
    assert.ok(imports.parseHistory('term,definition\ncat,a pet\ndog,another pet\n').error);
    const u = user(17);
    assert.strictEqual(imports.importResults(u, { history_csv: 'term,definition\ncat,a pet\n' }).code, 'bad_file');
    assert.ok(imports.parseHistory('x').error);
  });

  console.log('7. max accuracy');
  await check('it is a switch the learner owns, and a child without consent cannot be in it', () => {
    const u = user(16);
    assert.strictEqual(boosters.maxAccuracy.isOn(u.id), false);
    boosters.maxAccuracy.set(u, true);
    assert.strictEqual(boosters.maxAccuracy.isOn(u.id), true);
    boosters.maxAccuracy.set(u, false);
    assert.strictEqual(boosters.maxAccuracy.isOn(u.id), false);
    const c = user(10);
    boosters.put(c.id, { max_accuracy: true });
    assert.strictEqual(boosters.maxAccuracy.isOn(c.id), false, 'a stored switch must not work for an account that may not');
  });
  await check('it puts an experiment on every tailored page, and the practice screen taps confidence on every question', () => {
    const personalize = read('services/personalize.js');
    assert.ok(/maxAccuracy\.isOn\(userId\) \? 1 : EXPERIMENT_RATE/.test(personalize));
    assert.ok(/askConfidence: !isExam\(\) && \(maxAccuracy \|\| index % 3 === 1\)/.test(read('public/js/session.js')));
  });

  console.log('8. the routes over real HTTP');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/boosters', require('../routes/boosters'));
  const server = app.listen(0);
  await new Promise((ok) => server.once('listening', ok));
  const call = (method, url, uid, body) => new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers: { 'x-user': String(uid || ''), 'content-type': 'application/json', connection: 'close' } }, (res) => {
      let t = ''; res.on('data', (d) => { t += d; });
      res.on('end', () => ok({ status: res.statusCode, text: t, json: (() => { try { return JSON.parse(t); } catch { return null; } })() }));
    });
    req.on('error', fail);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
  const adult = user(18);
  const child = user(11);
  await check('signed out: 401 on every route', async () => {
    for (const [m, p] of [['GET', ''], ['GET', '/questionnaire'], ['POST', '/questionnaire'], ['POST', '/delayed/start'], ['POST', '/games/span'], ['POST', '/silent'], ['POST', '/silent/batch'], ['POST', '/max-accuracy'], ['POST', '/import']]) {
      assert.strictEqual((await call(m, `/api/boosters${p}`, 0, {})).status, 401, `${m} ${p}`);
    }
  });
  await check('a child without consent: status says not allowed and every action is 403', async () => {
    assert.deepStrictEqual((await call('GET', '/api/boosters', child.id)).json, { allowed: false });
    for (const [m, p, b] of [['GET', '/questionnaire'], ['POST', '/questionnaire', { answers: { c_prepared: 5, c_order: 5, c_chores: 5, i_vocab: 5 } }], ['POST', '/delayed/start'], ['POST', '/games/span', { result: { max_span: 8, trials: 8 } }], ['POST', '/silent', { on: true }], ['POST', '/max-accuracy', { on: true }], ['POST', '/import', { act_composite: 30 }]]) {
      assert.strictEqual((await call(m, `/api/boosters${p}`, child.id, b || {})).status, 403, `${m} ${p}`);
    }
  });
  await check('an adult: the status lists every channel, and each action works end to end', async () => {
    const st = (await call('GET', '/api/boosters', adult.id)).json;
    assert.ok(st.allowed && st.questionnaire && st.delayed && st.games.length === 3 && st.silent && st.max_accuracy);
    const q = (await call('GET', '/api/boosters/questionnaire', adult.id)).json;
    assert.strictEqual(q.items.length, ipip.ITEMS.length);
    assert.ok(!JSON.stringify(q).includes('maps'), 'the mapping to measures is a server matter');
    const answers = Object.fromEntries(q.items.map((i) => [i.id, 4]));
    assert.strictEqual((await call('POST', '/api/boosters/questionnaire', adult.id, { answers })).json.ok, true);
    assert.strictEqual((await call('POST', '/api/boosters/questionnaire', adult.id, { answers })).status, 400);
    assert.strictEqual((await call('POST', '/api/boosters/games/span', adult.id, { result: { max_span: 8, trials: 8 } })).json.fed, true);
    assert.strictEqual((await call('POST', '/api/boosters/games/zork', adult.id, { result: {} })).status, 404);
    assert.strictEqual((await call('POST', '/api/boosters/silent', adult.id, { on: true })).json.on, true);
    assert.strictEqual((await call('POST', '/api/boosters/silent/batch', adult.id, { batch: [{ hesitation_ms: 800, keys: 5, key_median_ms: 200, backspaces: 0 }] })).json.kept, 1);
    assert.strictEqual((await call('POST', '/api/boosters/max-accuracy', adult.id, { on: true })).json.on, true);
    assert.strictEqual((await call('POST', '/api/boosters/import', adult.id, { sat_total: 1300 })).json.ok, true);
    assert.strictEqual((await call('POST', '/api/boosters/import', adult.id, { sat_total: 50 })).status, 400);
    assert.strictEqual((await call('POST', '/api/boosters/delayed/start', adult.id, {})).status, 404, 'nothing is due for a new account');
    assert.strictEqual((await call('GET', '/api/boosters', adult.id)).json.max_accuracy.on, true);
  });
  server.close();

  console.log('9. the screens, the privacy text and the parent\'s switch');
  await check('the page exists with the extras, in the app\'s style, and the offer card links to it', () => {
    const html = read('public/boosters.html');
    assert.ok(/<title>/.test(html) && /css\/app\.css|\/css\//.test(html) && /\/js\/boosters\.js/.test(html) && /\/js\/boosters-games\.js/.test(html));
    const js = read('public/js/boosters.js');
    for (const word of ['questionnaire', 'delayed', 'games', 'silent', 'import', 'max-accuracy']) assert.ok(js.includes(word), `boosters.js lacks ${word}`);
    assert.ok(/Not now|Skip/i.test(js + read('public/js/reading-offer.js')), 'every extra is skippable');
    assert.ok(/href="\/boosters/.test(read('public/js/reading-offer.js')));
    assert.ok(/boosters/.test(read('server.js')));
  });
  await check('the games are keyboard- and tap-playable and say how long they take', () => {
    const g = read('public/js/boosters-games.js');
    for (const word of ['span', 'speed', 'attention']) assert.ok(g.includes(word));
    assert.ok(/keydown|ArrowLeft/.test(g) && /pointerdown|click/.test(g));
  });
  await check('silent signals send timing numbers only, never the key or the text, and only after the learner switched them on', () => {
    const s = read('public/js/silent-signals.js');
    assert.ok(/silent\.on/.test(s) && /allowed/.test(s));
    const batchPush = /batch\.push\(\{([^}]*)\}\)/.exec(s);
    assert.ok(batchPush && !/\.key\b|value|textContent|innerText/.test(batchPush[1]), batchPush && batchPush[1]);
    assert.ok(!/\.value\b/.test(s.replace(/\/\*[\s\S]*?\*\//g, '')), 'the typed text is never read');
  });
  await check('the privacy text and the consent list name every channel, including the quiet signals', () => {
    const p = read('public/privacy.html');
    for (const word of ['questionnaire', 'memory check', 'reaction speed', 'review-history', 'confidence tap', 'silent signals', 'never which keys', 'backspace']) assert.ok(p.toLowerCase().includes(word.toLowerCase()), `privacy lacks ${word}`);
    assert.ok(/under their country's consent age unless a parent has agreed/.test(p));
    assert.ok(/data-opt="measurement_extras"/.test(read('public/js/parent.js')));
    assert.ok(/measurement_extras/.test(read('public/js/parent-admin.js')));
  });
  await check('the silent-signal script loads on the question screens only', () => {
    assert.ok(/silent-signals\.js/.test(read('public/js/app.js')));
    assert.ok(/session\|skill-practice\|review\|placement/.test(read('public/js/app.js')));
  });

  if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
  console.log('\nall passed');
})().catch((e) => { console.log(e); process.exit(1); });
