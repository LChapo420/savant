#!/usr/bin/env node
/**
 * The daily check (services/daily-check.js, routes/daily-check.js, public/js/daily-offer.js):
 *   1. picks: the planner's items come from the short pool, weighted by how uncertain the card still is, with no reading passages or mini-lessons
 *   2. the cap: 10 minutes for the first 14 days of use, then 3; a day's used seconds are not offered twice; the 6.3 minute design average
 *   3. skip: one tap hides the offer until tomorrow and nothing is asked
 *   4. who may: an under-13 account without the parent's measurement_extras gets no offer, no start, no answer
 *   5. SCORECARD_DAILY=off: no offer and no start (today's behaviour)
 *   6. evidence goes through scorecard.observe only, and only the precision a run added is fed (a second run does not double count)
 *   7. deletion / download: no new collection (everything is in the profiles row, already on both lists) and the screens are wired
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const db = require('../config/db');
const scorecard = require('../services/scorecard');
const daily = require('../services/daily-check');
const boosters = require('../services/boosters');
const { byId } = require('../services/onboarding/pool');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); }
}

const NOW = new Date();
let seq = 0;
const user = (age = 15) => db.insert('users', {
  email: `d${++seq}@t.test`, display_name: `d${seq}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true,
  age_check: { birth_ym: `${NOW.getUTCFullYear() - age}-01`, synthetic: true, ...(age < 13 ? { under_13: true, needs_parent: true } : {}) },
});
const T0 = Date.parse('2026-11-04T10:00:00Z');
const DAY = 86400000;

/** Answer a run's steps with fixed plausible responses until it ends or `max` steps. */
function walk(u, now, max = 60) {
  let out = daily.start(u, now);
  let steps = 0;
  while (out && !out.done && !out.error && steps < max) {
    steps += 1;
    const s = out.step;
    let response = {};
    if (s.kind === 'ipip') response = { answers: Object.fromEntries(s.items.map((i) => [i.id, 4])) };
    else if (s.kind === 'delayed') response = { answers: {} };
    else if (s.kind === 'forced') response = { choice: 'high' };
    else if (s.kind === 'reason') response = { choice: 0, confidence: 3 };
    else if (s.kind === 'span') response = { maxSpan: 6 };
    else if (s.kind === 'speed') response = { correct: 25, wrong: 1, firstMs: 2000 };
    else if (s.kind === 'switch') response = { costMs: 150, errorRate: 0.05, repeat: { n: 8, ok: 8, ms: 8000 }, switch: { n: 8, ok: 7, ms: 9000 } };
    out = daily.answer(u, { session: out.session, id: s.id, response, ms: (byId[s.id] ? byId[s.id].sec : 10) * 1000 }, now);
  }
  return { out, steps };
}

check('picks: only short pool kinds, no passages or mini-lessons, never a key sent', () => {
  const u = user();
  const out = daily.start(u, T0);
  assert.ok(out.step && out.progress, 'a first step');
  assert.ok(['ipip', 'forced', 'reason', 'span', 'speed', 'switch', 'delayed'].includes(out.step.kind), out.step.kind);
  assert.ok(!JSON.stringify(out).match(/"key"|"keys"/), 'no answer key in the view');
  assert.ok(![...daily.KINDS].some((k) => ['read', 'minilesson', 'taste', 'survey'].includes(k)));
});

check('picks follow the card: a measure already well measured counts for less', () => {
  const u = user();
  const base = daily.importanceOf(u.id);
  scorecard.observe(u.id, Array.from({ length: 6 }, () => ({ stat: 'persistence', value: 70, weight: 2 })), { source: 'test' });
  const after = daily.importanceOf(u.id);
  assert.ok(after.persistence < base.persistence, 'a measured stat is weighted down');
  assert.ok(Math.abs(after.curiosity_hook - base.curiosity_hook) < 1e-9, 'an unmeasured stat is unchanged');
});

check('cap: 10 minutes the first 14 days, then 3; the day total stays inside the allowance', () => {
  assert.strictEqual(daily.allowanceFor(0), 600);
  assert.strictEqual(daily.allowanceFor(13), 600);
  assert.strictEqual(daily.allowanceFor(14), 180);
  const avg30 = (14 * 600 + 16 * 180) / 30 / 60;
  assert.ok(avg30 <= 6.5, `design average ${avg30}`);
  const u = user();
  const { out } = walk(u, T0);
  assert.ok(out.done, JSON.stringify(out).slice(0, 200));
  const rec = daily.getDaily(u.id).days['2026-11-04'];
  assert.ok(rec.sec > 0 && rec.sec <= 600 + 40, `used ${rec.sec}s`);
  const left = 600 - rec.sec;
  const o = daily.offer(u, T0 + 3600000);
  assert.strictEqual(o.offer, left >= 30, `offer ${JSON.stringify(o)} left ${left}`);
  const later = daily.offer(u, T0 + 20 * DAY);
  assert.ok(later.offer && later.minutes <= 3, JSON.stringify(later));
  walk(u, T0 + 20 * DAY);
  assert.ok(daily.getDaily(u.id).days['2026-11-24'].sec <= 180 + 40, 'a later day stays inside 3 minutes');
});

check('skip: one tap hides it until tomorrow, tomorrow it is back', () => {
  const u = user();
  assert.ok(daily.offer(u, T0).offer);
  assert.deepStrictEqual(daily.skip(u, T0), { ok: true });
  assert.strictEqual(daily.offer(u, T0 + 1000).offer, false);
  assert.ok(daily.offer(u, T0 + DAY).offer);
});

check('under 13 without measurement_extras: no offer, no start, no answer, nothing kept', () => {
  const kid = db.byId('users', user(11).id);
  assert.deepStrictEqual(daily.offer(kid, T0), { offer: false });
  assert.strictEqual(daily.start(kid, T0).code, 'not_allowed');
  assert.strictEqual(daily.answer(kid, { session: 'x', id: 'y' }, T0).code, 'not_allowed');
  assert.strictEqual(daily.skip(kid, T0).code, 'not_allowed');
  assert.ok(!boosters.get(kid.id).daily, 'nothing kept');
  const c = db.insert('parental_consents', { child_user_id: kid.id, status: 'active', scopes: { measurement_extras: { requested: true, active: true, method: 'signed_form' } } });
  db.update('users', kid.id, { consent_id: c.id });
  assert.ok(daily.offer(db.byId('users', kid.id), T0).offer, 'with the parent agreement it opens');
});

check('SCORECARD_DAILY=off: no offer, no start (the behaviour before this existed)', () => {
  const u = user();
  process.env.SCORECARD_DAILY = 'off';
  try {
    assert.deepStrictEqual(daily.offer(u, T0), { offer: false });
    assert.strictEqual(daily.start(u, T0).code, 'not_allowed');
    assert.ok(!boosters.get(u.id).daily);
  } finally { delete process.env.SCORECARD_DAILY; }
});

check('evidence: through scorecard.observe as designed tests, and only the precision added', () => {
  const u = user();
  const calls = [];
  const orig = scorecard.observe;
  scorecard.observe = (id, obs, meta) => { calls.push({ obs, meta }); return orig(id, obs, meta); };
  try {
    walk(u, T0);
    const first = calls.filter((c) => c.meta.source === 'daily check');
    assert.ok(first.length >= 1 && first.every((c) => c.obs.every((o) => o.test === true && o.weight > 0 && o.weight <= 4)));
    assert.ok(Object.keys(require('../services/learner').getProfile(u.id).onboarding.known.fed).length > 0, 'the precision fed is recorded');
    const run = daily.openRun(u.id, T0 + 5 * DAY);
    const res = daily.closeRun(u.id, run.planner, T0 + 5 * DAY);
    assert.ok(res.done);
    assert.strictEqual(calls.filter((c) => c.meta.source === 'daily check').length, first.length, 'a run that added nothing feeds nothing');
  } finally { scorecard.observe = orig; }
});

check('the questionnaire items are spread over days and not asked twice', () => {
  const u = user();
  const ids = new Set();
  for (let d = 0; d < 6; d += 1) {
    const o = daily.openRun(u.id, T0 + d * DAY);
    const pre = o && o.pre.find((p) => p.kind === 'ipip');
    if (!pre) break;
    assert.ok(pre.ids.length <= daily.IPIP_PER_DAY);
    pre.ids.forEach((id) => { assert.ok(!ids.has(id), `${id} asked twice`); ids.add(id); });
    walk(u, T0 + d * DAY, 3);
  }
  assert.ok(ids.size >= daily.IPIP_PER_DAY);
});

check('deletion and download: no new collection; the screens and routes are wired', () => {
  const profile = read('routes/profile.js');
  const consent = read('routes/consent.js');
  assert.ok(consent.includes("'profiles'"), 'the profiles row is on the deletion list');
  assert.ok(/daily check.*adds no collection/.test(profile) && /daily check.*adds no collection/.test(consent), 'registered in both');
  assert.ok(read('server.js').includes('/api/daily-check'));
  assert.ok(read('public/daily-check.html').includes('OB_DAILY'));
  for (const f of ['public/js/dashboard.js', 'public/js/session.js', 'public/js/base-lesson.js']) assert.ok(read(f).includes('DailyOffer.mount'), f);
  assert.ok(read('services/scorecard/hooks.js').includes('onDailyCheck'));
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\ndaily check: all ok');
