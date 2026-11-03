#!/usr/bin/env node
/**
 * Phase 4 in the product (docs/SCORECARD-90.md section 11, "what is in the product"): the live behavioural footprints and the drift layer.
 *   1. the live list: every live footprint is in the design list, with the design's conservative validity and its own family (independent errors);
 *      the sim-visible INDICATORS / BY_STAT do not contain them (the default sim and the gate baseline are unchanged)
 *   2. who: an under-13 account without a parent's agreement gets no footprint (no rows, no evidence); an adult gets them; SCORECARD_FOOTPRINTS=off none
 *   3. the reads: coach opened first, switch cost on IQ levels, extra practice and own starts, daily goal kept, retries after a fail, the two in-lesson
 *      choices (only the allowed values, once each, never on a preview), a retention goal chosen; the weekly sweep runs once a week and keeps rows compact
 *   4. through the scorecard: a footprint moves its measure the right way, can never carry more than validity^2 / (1 - validity^2), and two
 *      footprints (two families) carry more than one
 *   5. drift: per-measure half-lives (state-like short, abilities long, a typical one near the old 90 days); SCORECARD_DRIFT=off restores
 *      today's fade exactly; with drift on a state-like measure's evidence fades faster than an ability's
 *   6. the wiring: the routes, the page, the deletion and export lists
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-footprints-live-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.env.SCORECARD_TRANSCRIPT_READ = 'off';
delete process.env.SCORECARD_FOOTPRINTS;
delete process.env.SCORECARD_DRIFT;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const db = require('../config/db');
const scorecard = require('../services/scorecard');
const hooks = require('../services/scorecard/hooks');
const ind = require('../services/scorecard/indicators');
const defs = require('../services/scorecard/footprint-defs');
const fp = require('../services/scorecard/footprints');
const drift = require('../services/scorecard/drift');
const { KINDS, FOOTPRINTS } = require('./lib/scorecard-footprints');

let failed = 0;
async function check(name, fn) { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); } }
const NOW = new Date();
const DAY = 86400000;
let seq = 0;
const user = (age = 16, extra = {}) => db.insert('users', {
  email: `f${++seq}@t.test`, display_name: `f${seq}`, password_hash: 'x', onboarded: true,
  age_check: { birth_ym: `${NOW.getUTCFullYear() - age}-01`, synthetic: true, ...(age < 13 ? { under_13: true, needs_parent: true } : {}) }, ...extra,
});
const rowsOf = (uid) => db.find('footprint_events', (r) => r.user_id === uid);
const iso = (ms) => new Date(ms).toISOString();

(async () => {
  console.log('1. the live list');
  await check('every live footprint is in the design list at the design validity, and each design footprint is its own family', () => {
    const design = new Map(FOOTPRINTS.map((f) => [f.id, f]));
    assert.ok(defs.LIVE_IDS.length >= 7, `live ${defs.LIVE_IDS.join(',')}`);
    for (const d of defs.LIVE) {
      const f = design.get(d.fp);
      assert.ok(f, `${d.fp} is not in the design list`);
      assert.strictEqual(d.kind, f.kind);
      assert.ok(Math.abs(d.v - Math.sqrt(KINDS[f.kind].rhoInf)) < 0.006, `${d.key} validity ${d.v}`);
      assert.ok(d.v <= 0.5, 'conservative: never above the day-0 mini-lesson ceiling of .55');
      assert.strictEqual(d.family, `fp.${d.fp}`);
      for (const m of d.maps) assert.ok(f.reads.includes(m.stat), `${d.key} reads ${m.stat}, which the design does not list for ${d.fp}`);
    }
    for (const id of defs.DESIGN_ONLY) assert.ok(design.has(id));
    assert.strictEqual(defs.LIVE_IDS.length + defs.DESIGN_ONLY.length, FOOTPRINTS.length);
    for (const must of ['extra_practice', 'retry_after_fail', 'plan_set_and_kept', 'rule_switch', 'hint_or_try']) assert.ok(defs.LIVE_IDS.includes(must), must);
    assert.strictEqual(defs.LIVE_IDS.filter((id) => ['why_or_steps', 'deeper_or_move_on'].includes(id)).length, 2, 'exactly the two new in-lesson choice points');
    for (const id of ['race_or_solo', 'link_prompt', 'feel_tap']) assert.ok(defs.DESIGN_ONLY.includes(id), `${id} stays design only`);
  });
  await check('the simulators walk INDICATORS and BY_STAT, which do not contain footprints; reading and storing evidence uses the full set', () => {
    for (const d of defs.LIVE) {
      assert.ok(!ind.INDICATORS[d.key] && ind.ALL_INDICATORS[d.key], d.key);
      for (const m of d.maps) {
        assert.ok(!(ind.BY_STAT[m.stat] || []).some((x) => x.key === d.key));
        assert.ok(ind.BY_STAT_ALL[m.stat].some((x) => x.key === d.key && x.sign === m.sign));
      }
    }
  });

  console.log('2. who');
  await check('an under-13 account without a parent gets no footprint: no rows, no evidence, from every entry point', () => {
    const kid = user(10);
    const session = { id: 1, user_id: kid.id, kind: 'practice', track_id: 'math', grade_id: 'g1', preview: false, blocks: [{ index: 0, level: 3 }] };
    assert.strictEqual(fp.choicesOffered(db.byId('users', kid.id)), false);
    assert.strictEqual(fp.onChoices(kid.id, { session, level: 3, choices: [{ id: 'deeper_or_move_on', choice: 'deeper' }] }), null);
    assert.strictEqual(fp.onBlock(kid.id, { session, level: 3, items: [{ coach_used: true, coach_started_at: iso(Date.now() - 20000), ms: 25000, correct: true, updated_at: iso(Date.now()) }] }), null);
    assert.strictEqual(fp.onRetentionGoal(kid.id, { horizon: 'months' }), null);
    assert.strictEqual(fp.weeklySweep(kid.id), null);
    assert.strictEqual(rowsOf(kid.id).length, 0);
    assert.ok(!scorecard.get(kid.id).ind || !Object.keys(scorecard.get(kid.id).ind).some((k) => k.startsWith('fp.')));
  });
  await check('with a parent\'s measurement agreement the child is measured like anyone else', () => {
    const kid = user(10);
    const consent = db.insert('parental_consents', { child_id: kid.id, status: 'active', scopes: { measurement_extras: { active: true } } });
    db.update('users', kid.id, { consent_id: consent.id });
    assert.strictEqual(fp.may(kid.id), true);
  });
  await check('SCORECARD_FOOTPRINTS=off: nothing is offered, logged or read', () => {
    const u = user(20);
    process.env.SCORECARD_FOOTPRINTS = 'off';
    try {
      assert.strictEqual(fp.choicesOffered(db.byId('users', u.id)), false);
      assert.strictEqual(fp.onRetentionGoal(u.id, { horizon: 'year' }), null);
      assert.strictEqual(rowsOf(u.id).length, 0);
      const l = ind.likelihood({ 'fp.deeper': { w: 50, s: 40, q: 40, ww: 50, b: 5 } }, 'depth_breadth', { 'fp.deeper': { mu: 0.3, tau: 0.2, within: 0.1 } });
      assert.strictEqual(l, null);
    } finally { delete process.env.SCORECARD_FOOTPRINTS; }
  });

  console.log('3. the reads');
  const adult = user(20);
  const session = { id: 900, user_id: adult.id, kind: 'practice', track_id: 'iq', grade_id: 'g1', preview: false, blocks: [{ index: 0, level: 4 }] };
  await check('the two in-lesson choices: only the allowed values, once each, one compact row, never on a preview', () => {
    assert.strictEqual(fp.choicesOffered(db.byId('users', adult.id)), true);
    const fed = fp.onChoices(adult.id, { session, level: 4, choices: [
      { id: 'why_or_steps', choice: 'why' }, { id: 'why_or_steps', choice: 'steps' }, { id: 'deeper_or_move_on', choice: 'deeper' },
      { id: 'deeper_or_move_on', choice: 'banana' }, { id: 'race_or_solo', choice: 'race' }, null,
    ] });
    assert.deepStrictEqual(fed.map((r) => [r.ind, r.x]), [['fp.why_first', 1], ['fp.deeper', 1]]);
    const rows = rowsOf(adult.id);
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(Object.keys(rows[0]).sort(), ['at', 'fp', 'id', 'ind', 'level', 'n', 'user_id', 'x', 'created_at'].sort(), 'a compact row: no text, no answers');
    assert.strictEqual(rows[0].level, 'iq/g1/4');
    const card = scorecard.get(adult.id);
    assert.ok(card.ind['fp.why_first'].w === 1 && card.ind['fp.deeper'].w === 1);
    assert.strictEqual(fp.onChoices(adult.id, { session: { ...session, preview: true }, level: 4, choices: [{ id: 'deeper_or_move_on', choice: 'move' }] }), null);
    assert.strictEqual(fp.onChoices(adult.id, { session: { ...session, kind: 'review' }, level: 4, choices: [{ id: 'deeper_or_move_on', choice: 'move' }] }), null);
    assert.strictEqual(rowsOf(adult.id).length, 2);
  });
  await check('coach opened first: within 8 s of the question appearing counts, after trying first does not; settled typed answers are left out', () => {
    const t = Date.now();
    const item = (openAfterMs, ms, extra = {}) => ({ coach_used: true, coach_started_at: iso(t - ms + openAfterMs), ms, correct: true, updated_at: iso(t), ...extra });
    const r = fp.hintFirstRow([item(2000, 30000), item(15000, 40000), item(5000, 20000), item(1000, 9000, { grading_settled_at: iso(t) }), { coach_used: false, ms: 5000, correct: true }]);
    assert.strictEqual(r.ind, 'fp.hint_first');
    assert.strictEqual(r.n, 3);
    assert.ok(Math.abs(r.x - 2 / 3) < 1e-9);
    assert.strictEqual(fp.hintFirstRow([]), null);
  });
  await check('switch cost: IQ levels only, needs two correct items after a change and two after the same skill; slower after a change reads positive', () => {
    const mk = (skills, ms) => skills.map((s, i) => ({ index: i, skill_id: s, ms: ms[i], correct: true }));
    const items = mk(['a', 'a', 'b', 'b', 'a', 'a', 'b', 'b', 'a'], [3000, 3000, 6000, 3000, 6500, 3000, 6000, 3000, 6200]);
    const r = fp.switchCostRow(items, 'iq');
    assert.ok(r && r.ind === 'fp.switch_cost' && r.x > 0.4 && r.n >= 2, JSON.stringify(r));
    assert.strictEqual(fp.switchCostRow(items, 'math'), null, 'only the IQ track');
    assert.strictEqual(fp.switchCostRow(mk(['a', 'b', 'a'], [3000, 5000, 5000]), 'iq'), null, 'too few to read');
  });
  await check('extra practice and own starts: replays and sittings after the day goal count; the first sitting of a day is own or scheduled', () => {
    const t0 = Date.parse('2026-10-05T14:00:00Z');
    const sit = (kind, startMin, minutes, extra = {}) => ({ id: startMin, kind, started_at: iso(t0 + startMin * 60000), ended_at: iso(t0 + (startMin + minutes) * 60000), start_level: 5, ...extra });
    const sessions = [sit('practice', 0, 40), sit('practice', 60, 30), sit('practice', 120, 20, { preview: true, at_level: 9, start_level: 3 }), sit('review', -30, 10), sit('placement', 200, 10), sit('practice', 240, 20, { preview: true, at_level: 2, start_level: 8 })];
    const rows = fp.extraPracticeRows(sessions, { goalMinutes: 45, tz: 'UTC' });
    const extra = rows.find((r) => r.ind === 'fp.extra_practice');
    // own sittings: practice 0 (day total 0, not extra), practice 60 (40 min spent < 45, not extra), the replay at 120 (extra); the look ahead is not a sitting of its own
    assert.strictEqual(extra.n, 3);
    assert.ok(Math.abs(extra.x - 1 / 3) < 1e-9, `${extra.x}`);
    const own = rows.find((r) => r.ind === 'fp.unprompted_start');
    assert.deepStrictEqual([own.x, own.n], [0, 1], 'the day began with a scheduled review');
    const over = fp.extraPracticeRows([sit('practice', 0, 50), sit('practice', 70, 10)], { goalMinutes: 45, tz: 'UTC' });
    assert.strictEqual(over.find((r) => r.ind === 'fp.extra_practice').x, 0.5, 'a sitting after the goal was met is extra');
    assert.strictEqual(over.find((r) => r.ind === 'fp.unprompted_start').x, 1);
  });
  await check('daily goal kept: active minutes against 80% of a goal the learner chose; no chosen goal, no read', () => {
    const u = user(20);
    const t = Date.now();
    for (const [day, ms] of [['2026-10-01', 40 * 60000], ['2026-10-02', 10 * 60000], ['2026-10-03', 36 * 60000]]) db.insert('study_sessions', { user_id: u.id, started_at: iso(t - DAY), local_day: day, active_ms: ms, status: 'ended' });
    const r = fp.planKeptRow(u.id, t - 3 * DAY, 45);
    assert.deepStrictEqual([r.ind, r.n], ['fp.plan_kept', 3]);
    assert.ok(Math.abs(r.x - 2 / 3) < 1e-9);
    assert.strictEqual(fp.planKeptRow(u.id, t - 3 * DAY, null), null);
  });
  await check('retry after a fail: soon is higher than late, a level never retried reads at the cap, a fresh fail is not yet read', () => {
    const u = user(20);
    const t = Date.parse('2026-10-20T12:00:00Z');
    const sessRows = [];
    const addItems = (sid, block, startMs, endMs) => { db.insert('items', { user_id: u.id, session_id: sid, block, created_at: iso(startMs), updated_at: iso(endMs), correct: false }); };
    // level 5 failed at t, retried 10 minutes later in the same sitting; level 6 failed at t, never retried (3 days ago or more); level 7 failed 20 hours before now (too fresh)
    const s1 = db.insert('sessions', { user_id: u.id, enrollment_id: 7, kind: 'practice', started_at: iso(t - 3600000), blocks: [{ index: 0, level: 5, resolved: true, level_complete: false }, { index: 1, level: 5, resolved: true, level_complete: true }, { index: 2, level: 6, resolved: true, level_complete: false }] });
    addItems(s1.id, 0, t - 1200000, t);
    addItems(s1.id, 1, t + 600000, t + 900000);
    addItems(s1.id, 2, t + 1000000, t + 1100000);
    const now = t + 4 * DAY;
    const s2 = db.insert('sessions', { user_id: u.id, enrollment_id: 7, kind: 'practice', started_at: iso(now - 21 * 3600000), blocks: [{ index: 0, level: 7, resolved: true, level_complete: false }] });
    addItems(s2.id, 0, now - 21 * 3600000, now - 20 * 3600000);
    sessRows.push(db.byId('sessions', s1.id), db.byId('sessions', s2.id));
    const r = fp.retryRow(u.id, sessRows, { from: t - DAY, to: now - 2 * DAY, now });
    // two read fails: level 5 (10 min later: -log1p(10)) and level 6 (never: -log1p(2880)); level 7 is outside (from, to]
    assert.strictEqual(r.n, 2);
    assert.ok(Math.abs(r.x - (-(Math.log1p(10) + Math.log1p(2880)) / 2)) < 0.05, `${r.x}`);
    const fast = fp.retryRow(u.id, sessRows, { from: t - DAY, to: t + 2000000, now: t + 1300000 });
    assert.ok(fast && fast.n === 1 && fast.x > r.x, 'one quickly retried fail reads higher than the mixed week');
  });
  await check('a retention goal chosen is one row: a test date or a bounded horizon is 1, forever is 0', () => {
    const u = user(20);
    fp.onRetentionGoal(u.id, { horizon: 'year' });
    fp.onRetentionGoal(u.id, { horizon: 'forever' });
    assert.deepStrictEqual(rowsOf(u.id).map((r) => [r.ind, r.x, r.n]), [['fp.retention_choice', 1, 1], ['fp.retention_choice', 0, 1]]);
  });
  await check('the weekly sweep runs once a week per learner, feeds the week and prunes old rows', () => {
    const u = user(20);
    const t = Date.now();
    db.insert('sessions', { user_id: u.id, enrollment_id: 3, kind: 'practice', started_at: iso(t - 2 * DAY), ended_at: iso(t - 2 * DAY + 20 * 60000), start_level: 2, blocks: [] });
    db.insert('sessions', { user_id: u.id, enrollment_id: 3, kind: 'practice', started_at: iso(t - DAY), ended_at: iso(t - DAY + 20 * 60000), start_level: 3, blocks: [] });
    db.insert('footprint_events', { user_id: u.id, fp: 'extra_practice', ind: 'fp.extra_practice', x: 0.5, n: 3, level: null, at: iso(t - (fp.KEEP_DAYS + 5) * DAY) });
    const fed = fp.weeklySweep(u.id, { now: t });
    assert.ok(fed.some((r) => r.ind === 'fp.extra_practice') && fed.some((r) => r.ind === 'fp.unprompted_start'));
    const rows = rowsOf(u.id);
    assert.ok(rows.length === 2 && rows.every((r) => r.at >= iso(t - DAY)), 'the old row was pruned');
    assert.strictEqual(fp.weeklySweep(u.id, { now: t + 3 * DAY }), null, 'not again within the week');
    assert.ok(scorecard.get(u.id).fp_at);
  });
  await check('hooks: a level closing and a finished sitting reach the footprints', () => {
    const src = read('services/scorecard/hooks.js');
    assert.ok(/footprints\.onBlock\(userId, \{ session, level, items: graded \}\)/.test(src));
    assert.ok(/footprints\.weeklySweep\(userId\)/.test(src));
    assert.ok(/onRetentionGoal/.test(read('services/retention-goal.js')));
  });

  console.log('4. through the scorecard');
  const pop = (key, mu = 0.3, tau = 0.2, within = 0) => ({ [key]: { mu, tau, within } });
  const mom = (mean, n = 200) => ({ w: n, s: n * mean, q: n * mean * mean, ww: n, b: 6, at: iso(Date.now()) });
  await check('a footprint moves its measure the right way and carries at most v^2 / (1 - v^2)', () => {
    const v = defs.LIVE.find((d) => d.key === 'fp.deeper').v;
    const l = ind.likelihood({ 'fp.deeper': mom(0.5) }, 'depth_breadth', pop('fp.deeper'));
    assert.ok(l.num / l.info > 0, 'those who go deeper read higher on depth');
    assert.ok(l.info <= (v * v) / (1 - v * v) + 1e-9, `${l.info}`);
    const hint = ind.likelihood({ 'fp.hint_first': mom(0.9) }, 'productive_struggle', pop('fp.hint_first', 0.4));
    assert.ok(hint.num / hint.info < 0, 'asking for help first reads as less productive struggle');
    const sw = ind.likelihood({ 'fp.switch_cost': mom(0.8) }, 'cognitive_flexibility', pop('fp.switch_cost', 0.4));
    assert.ok(sw.num / sw.info < 0, 'a big switch cost reads as less flexible');
  });
  await check('two footprints on one measure (two families, independent errors) carry more than either alone', () => {
    const a = ind.likelihood({ 'fp.retry_after_fail': mom(-3) }, 'productive_struggle', pop('fp.retry_after_fail', -4, 1));
    const both = ind.likelihood({ 'fp.retry_after_fail': mom(-3), 'fp.hint_first': mom(0.2) }, 'productive_struggle', { ...pop('fp.retry_after_fail', -4, 1), ...pop('fp.hint_first', 0.4) });
    assert.ok(both.info > a.info + 0.05, `${both.info} vs ${a.info}`);
    const sameFamily = ind.likelihood({ 'fp.extra_practice': mom(0.6), 'fp.unprompted_start': mom(0.8) }, 'intrinsic_motivation', { ...pop('fp.extra_practice'), ...pop('fp.unprompted_start', 0.5, 0.3) });
    const one = ind.likelihood({ 'fp.extra_practice': mom(0.6) }, 'intrinsic_motivation', pop('fp.extra_practice'));
    assert.ok(sameFamily.info < 2 * one.info + 1e-9, 'the two reads of one footprint share an error');
  });
  await check('with a population a learner\'s footprints move the read and narrow its interval; SCORECARD_FOOTPRINTS=off reads exactly the own evidence', () => {
    for (let i = 0; i < 24; i++) {
      const u = user(20);
      for (let b = 0; b < 4; b++) hooks.onIndicators(u.id, { 'fp.deeper': { mean: 0.1 + 0.8 * (i % 8) / 7 + (b % 2 ? 0.03 : -0.03), n: 4 } });
    }
    const hi = user(20);
    for (let b = 0; b < 4; b++) hooks.onIndicators(hi.id, { 'fp.deeper': { mean: 0.95, n: 4 } });
    scorecard.refreshPopulation();
    const card = scorecard.get(hi.id);
    const r = scorecard.read(card, 'depth_breadth');
    const own = scorecard.readOwn(card, 'depth_breadth');
    assert.ok(r.measured > own.measured && r.se < own.se, `${r.measured} vs ${own.measured}, se ${r.se} vs ${own.se}`);
    process.env.SCORECARD_FOOTPRINTS = 'off';
    try { assert.deepStrictEqual(scorecard.read(card, 'depth_breadth'), own); } finally { delete process.env.SCORECARD_FOOTPRINTS; }
  });

  console.log('5. drift');
  await check('half-lives: a state-like measure is short, an ability long, a typical one about the old 90 days', () => {
    const h = (id) => drift.halfLife(id, 90);
    assert.ok(h('emotional_engagement') < 35 && h('boredom_susceptibility') < 35 && h('intrinsic_motivation') < 35);
    assert.ok(h('working_memory_span') > 200 && h('vocabulary_ceiling') > 200);
    assert.ok(h('emotional_engagement') < h('conceptual_bias') && h('conceptual_bias') < h('working_memory_span'));
    assert.ok(Math.abs(drift.halfLifeFromStability(0.81) - 90) < 2, 'a stability of .81 is the old 90 days');
    for (const s of require('../services/scorecard/stats').STATS) assert.ok(h(s.id) >= drift.MIN_DAYS && h(s.id) <= drift.MAX_DAYS);
    assert.strictEqual(drift.halfLife('no_such_measure', 90), 90);
  });
  await check('SCORECARD_DRIFT=off: every half-life is the old constant, and the units fade exactly as before', () => {
    process.env.SCORECARD_DRIFT = 'off';
    try {
      assert.strictEqual(drift.halfLife('emotional_engagement', 90), 90);
      assert.strictEqual(drift.halfLifeOfMeasures(['emotional_engagement', 'working_memory_span'], 90), 90);
      const prev = { w: 10, s: 5, q: 3, ww: 10, b: 2, at: iso(Date.now() - 90 * DAY) };
      const a = ind.addUnits(prev, 0.5, 4, new Date().toISOString(), 'fp.deeper');
      const b = ind.addUnits(prev, 0.5, 4, new Date().toISOString());
      assert.deepStrictEqual(a, b);
      assert.ok(Math.abs(a.w - (5 + 4)) < 0.01, `${a.w}: 90 days is exactly one half-life`);
    } finally { delete process.env.SCORECARD_DRIFT; }
  });
  await check('through the card: with drift a state-like measure\'s evidence fades faster than an ability\'s; with drift off both fade at 90 days', () => {
    const u = user(20);
    scorecard.observe(u.id, [{ stat: 'emotional_engagement', value: 80, weight: 1 }, { stat: 'working_memory_span', value: 80, weight: 1 }, { stat: 'conceptual_bias', value: 80, weight: 1 }], { source: 'drift test' });
    const card = scorecard.get(u.id);
    const old = (id) => ({ ...card, stats: { ...card.stats, [id]: { ...card.stats[id], at: iso(Date.now() - 60 * DAY), mw: 4, w: 4 } } });
    const mass = (id) => scorecard.readOwn(old(id), id).confidence;
    const on = { eng: mass('emotional_engagement'), mem: mass('working_memory_span'), cb: mass('conceptual_bias') };
    assert.ok(on.eng < on.cb && on.cb < on.mem, JSON.stringify(on));
    process.env.SCORECARD_DRIFT = 'off';
    try {
      const off = { eng: mass('emotional_engagement'), mem: mass('working_memory_span'), cb: mass('conceptual_bias') };
      assert.ok(off.eng === off.mem && off.mem === off.cb, JSON.stringify(off));
      const expected = Math.round(100 * (1 - Math.exp(-(4 * 2 ** (-60 / 90)) / 3)));
      assert.strictEqual(off.eng, expected, 'exactly today\'s fade');
    } finally { delete process.env.SCORECARD_DRIFT; }
  });
  await check('the drift toy (SIMULATED): fading mass at the right rate without pulling the mean back keeps most of the Kalman fade\'s gain', () => {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'scorecard-drift-sim.js'), '--learners=600', '--stab=0.8'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const row = (name) => (r.stdout.split('\n').find((l) => l.startsWith(name)) || '').trim().split(/\s+/).slice(-4).map(Number);
    const never = row('never_forgets'); const full = row('kalman_right'); const massOnly = row('kalman_mass_only');
    assert.ok(massOnly[3] < never[3] - 0.5, `${massOnly[3]} vs ${never[3]}`);
    assert.ok(never[3] - massOnly[3] > 0.6 * (never[3] - full[3]), 'at least 60% of the full fade\'s gain');
  });

  console.log('6. the wiring');
  await check('the route, the page, the account export and deletion lists carry the footprints', () => {
    const learn = read('routes/learn.js');
    assert.ok(/router\.post\('\/sessions\/:id\/footprint'/.test(learn) && /footprint_choices: scorecardFootprints\.choicesOffered\(req\.user\)/.test(learn));
    const page = read('public/js/session.js');
    assert.ok(/sendFootprint\('why_or_steps'/.test(page) && /sendFootprint\('deeper_or_move_on'/.test(page) && /session\.footprint_choices/.test(page));
    assert.ok(/'footprint_events'/.test(read('routes/consent.js')) && /'footprint_events'/.test(read('routes/profile.js')) && /'footprint_events'/.test(read('config/db.js')));
    assert.ok(!/footprint_choices/.test(read('public/js/placement.js')), 'not on a placement');
  });

  if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
  console.log('\nscorecard footprints (live) and drift: all checks passed');
})();
