#!/usr/bin/env node
/**
 * The last 7 of the 14 behavioural footprints (docs/SCORECARD-90.md section 11.9): race_or_solo, link_prompt, feel_tap (one-tap choices),
 * skip_and_exit, ask_a_question, topic_pick, reward_panel (weekly reads of rows the app already keeps). Checks: values and gating, the sweep
 * feeding them, compact rows with no text, pruning at 180 days, and the export / deletion lists.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-fp-rest-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.env.SCORECARD_TRANSCRIPT_READ = 'off';
delete process.env.SCORECARD_FOOTPRINTS;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const db = require('../config/db');
const fp = require('../services/scorecard/footprints');
const defs = require('../services/scorecard/footprint-defs');
const ind = require('../services/scorecard/indicators');

let failed = 0;
function check(name, fn) { try { fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); } }
const NOW = Date.now();
const DAY = 86400000;
let seq = 0;
const user = (age = 20, extra = {}) => db.insert('users', {
  email: `r${++seq}@t.test`, display_name: `r${seq}`, password_hash: 'x', onboarded: true,
  age_check: { birth_ym: `${new Date().getUTCFullYear() - age}-01`, synthetic: true, ...(age < 13 ? { under_13: true, needs_parent: true } : {}) }, ...extra,
});
const rowsOf = (uid) => db.find('footprint_events', (r) => r.user_id === uid);
const session = (u) => ({ id: 1, user_id: u.id, kind: 'practice', track_id: 'math', grade_id: 'g1', preview: false, blocks: [{ index: 0, level: 2 }] });

check('all seven are live indicators of their own family, at the design kind\'s validity', () => {
  for (const k of ['fp.race', 'fp.link', 'fp.feel', 'fp.skip_rate', 'fp.ask_rate', 'fp.topic_match', 'fp.rewards_shown']) {
    const d = defs.LIVE.find((x) => x.key === k);
    assert.ok(d, k);
    assert.ok(ind.ALL_INDICATORS[k] && !ind.INDICATORS[k], `${k} stays out of the simulators`);
    assert.ok(d.v <= 0.5);
  }
});

check('the three one-taps: allowed values only, five faces map to -1..1, one row each, no text', () => {
  const u = user();
  const fed = fp.onChoices(u.id, { session: session(u), level: 2, choices: [
    { id: 'feel_tap', choice: 'f5' }, { id: 'feel_tap', choice: 'f1' }, { id: 'link_prompt', choice: 'linked' },
    { id: 'link_prompt', choice: 'my own text here' }, { id: 'race_or_solo', choice: 'solo' },
  ] });
  assert.deepStrictEqual(fed.map((r) => [r.ind, r.x]), [['fp.feel', 1], ['fp.link', 1], ['fp.race', 0]]);
  const rows = rowsOf(u.id);
  assert.strictEqual(rows.length, 3);
  for (const r of rows) assert.deepStrictEqual(Object.keys(r).sort(), ['at', 'created_at', 'fp', 'id', 'ind', 'level', 'n', 'user_id', 'x']);
  assert.strictEqual(fp.onChoices(u.id, { session: { ...session(u), preview: true }, level: 2, choices: [{ id: 'feel_tap', choice: 'f3' }] }), null);
});

check('an under-13 account without a parent gets none of the one-taps', () => {
  const kid = user(10);
  assert.strictEqual(fp.onChoices(kid.id, { session: session(kid), level: 2, choices: [{ id: 'feel_tap', choice: 'f3' }] }), null);
  assert.strictEqual(rowsOf(kid.id).length, 0);
});

check('skip rate: share of answered-or-skipped questions skipped; fewer than 5 is no read; retention and previews left out', () => {
  const u = user();
  const s = db.insert('sessions', { user_id: u.id, kind: 'practice', started_at: new Date(NOW - DAY).toISOString(), preview: false, blocks: [] });
  assert.strictEqual(fp.skipRow(u.id, [s]), null);
  for (let k = 0; k < 8; k++) db.insert('items', { user_id: u.id, session_id: s.id, role: 'practice', skipped: k < 2, user_answer: k < 2 ? null : 'a' });
  db.insert('items', { user_id: u.id, session_id: s.id, role: 'retention', skipped: true });
  const r = fp.skipRow(u.id, [s]);
  assert.deepStrictEqual([r.ind, r.x, r.n], ['fp.skip_rate', 0.25, 8]);
  assert.strictEqual(fp.skipRow(u.id, [{ ...s, preview: true }]), null);
});

check('ask rate: own questions count, replies to a tutor question do not, under 3 messages is no read', () => {
  const u = user();
  const at = new Date(NOW - DAY).toISOString();
  const entries = [
    { n: 1, at, learner: 'why does carrying work?', tutor: 'Because tens. Got it?' },
    { n: 2, at, learner: 'yes', tutor: 'Next one.' },
    { n: 3, at, learner: 'how do I do this', tutor: 'Try this.' },
    { n: 4, at, learner: 'ok thanks', tutor: 'Welcome.' },
  ];
  db.insert('tutor_archive', { user_id: u.id, entries: entries.slice(0, 2), next_seq: 3, rev: 0, removed: 0 });
  assert.strictEqual(fp.askRow(u.id, NOW - 7 * DAY), null);
  const row = db.findOne('tutor_archive', (r) => r.user_id === u.id);
  db.update('tutor_archive', row.id, { entries });
  const r = fp.askRow(u.id, NOW - 7 * DAY);
  assert.deepStrictEqual([r.ind, r.n], ['fp.ask_rate', 3]); // "yes" answered the tutor's question and is left out
  assert.ok(Math.abs(r.x - 2 / 3) < 1e-9);
});

check('topic pick: a subject matching a stated interest reads 1; none stated is no read; catch-up placements are not picks', () => {
  const en = [
    { track_id: 'chess', title: 'Chess basics', placed_at: new Date(NOW - DAY).toISOString() },
    { track_id: 'math', placed_at: new Date(NOW - DAY).toISOString() },
    { track_id: 'spanish', placed_by: 'catch_up', placed_at: new Date(NOW - DAY).toISOString() },
    { track_id: 'chess', placed_at: new Date(NOW - 20 * DAY).toISOString() },
  ];
  assert.strictEqual(fp.topicPickRow(en, [], NOW - 7 * DAY), null);
  const r = fp.topicPickRow(en, ['chess and drawing'], NOW - 7 * DAY);
  assert.deepStrictEqual([r.ind, r.x, r.n], ['fp.topic_match', 0.5, 2]);
});

check('reward panel: only where the learner set hide_stats themselves', () => {
  assert.strictEqual(fp.rewardsRow({}), null);
  assert.strictEqual(fp.rewardsRow({ hide_stats: true }).x, 0);
  assert.strictEqual(fp.rewardsRow({ hide_stats: false }).x, 1);
});

check('the weekly sweep feeds the new reads, keeps rows compact, and prunes at 180 days', () => {
  const u = user(20, { hide_stats: false });
  const s = db.insert('sessions', { user_id: u.id, kind: 'practice', enrollment_id: 1, started_at: new Date(NOW - DAY).toISOString(), ended_at: new Date(NOW - DAY + 600000).toISOString(), preview: false, blocks: [] });
  for (let k = 0; k < 6; k++) db.insert('items', { user_id: u.id, session_id: s.id, role: 'practice', skipped: k === 0, user_answer: k === 0 ? null : 'a' });
  const fed = fp.weeklySweep(u.id, { now: NOW });
  const inds = (fed || []).map((r) => r.ind);
  assert.ok(inds.includes('fp.skip_rate') && inds.includes('fp.rewards_shown'), inds.join(','));
  for (const r of rowsOf(u.id)) assert.ok(typeof r.x === 'number' && !('text' in r));
  db.insert('footprint_events', { user_id: u.id, fp: 'feel_tap', ind: 'fp.feel', x: 1, n: 1, level: null, at: new Date(NOW - 181 * DAY).toISOString() });
  assert.ok(fp.prune(NOW) >= 1);
  assert.ok(!rowsOf(u.id).some((r) => Date.parse(r.at) < NOW - 180 * DAY));
});

check('wiring: the page offers the three taps, and the export and deletion lists carry footprint_events', () => {
  const root = path.join(__dirname, '..');
  const page = fs.readFileSync(path.join(root, 'public/js/session.js'), 'utf8');
  for (const id of ['feel_tap', 'link_prompt', 'race_or_solo']) assert.ok(page.includes(`'${id}'`), id);
  for (const f of ['routes/consent.js', 'routes/profile.js']) assert.ok(fs.readFileSync(path.join(root, f), 'utf8').includes("'footprint_events'"), f);
});

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
