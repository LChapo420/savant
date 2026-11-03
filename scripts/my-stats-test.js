#!/usr/bin/env node
/**
 * The owner's own learner numbers kept apart (services/my-stats.js, services/cost-tracker.js buckets; docs/MY-STATS.md).
 * A fresh data file and a hand-made event file with known numbers: the owner's learner account, a real learner, a team
 * account, a test account, shared work and a script that names the owner's account. Every number is exact.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mystats-'));
process.env.DB_FILE = path.join(dir, 'db.json');
process.env.COST_TRACKER_DIR = path.join(dir, 'track');
delete process.env.OWNER_LEARNER_EMAILS;
delete process.env.TEAM_EMAIL_DOMAINS;
fs.writeFileSync(process.env.DB_FILE, '{}');

const db = require('../config/db');
const tracker = require('../services/cost-tracker');
const myStats = require('../services/my-stats');

let failed = 0;
let passed = 0;
const check = (name, ok, got) => {
  if (ok) { passed++; return; }
  failed++;
  console.log(`  FAIL ${name}\n       ${JSON.stringify(got)}`);
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

const me = db.insert('users', { email: 'Landon@SavantEDU.com', display_name: 'Owner learner' });
const learner = db.insert('users', { email: 'someone@gmail.com' });
const team = db.insert('users', { email: 'helper@savantedu.com' });
const tester = db.insert('users', { email: 'smoke+1@example.com' });

const now = Date.parse('2026-11-03T20:00:00Z');
const at = (min, day = 0) => Date.parse('2026-11-03T12:00:00Z') - day * 86400000 + min * 60000;
const ai = (u, list, extra) => ({ t: 'ai', ts: at(1), u, child: 0, task: 'lesson_write', role: 'deep', prov: 'nvidia', model: 'm', in: 10, out: 5, ms: 100, ok: 1, tries: 1, hedged: 0, usd: list / 5, list, basis: 'metered', fg: 0, ...extra });
const req = (u, min, route = '/api/lessons/:track/:grade/:level', m = 'GET', day = 0) => ({ t: 'req', ts: at(min, day), u, child: 0, m, route, st: 200, ms: 5, sub: 'math' });
const events = [
  // the owner's learner account: 10 active minutes, one finished level, one AI call
  ...[0, 2, 4, 6, 8, 10].map((m) => req(me.id, m)),
  { ...req(me.id, 10, '/api/lessons/:track/:grade/:level/block-finish', 'POST') },
  ai(me.id, 0.05),
  { t: 'lv', ts: at(3), u: me.id, child: 0, ms: 400, waited: 0 }, { t: 'lv', ts: at(5), u: me.id, child: 0, ms: 3000, waited: 1 },
  // yesterday: only a tab refreshing itself — no session, no active time
  ...[0, 30, 60].map((m) => req(me.id, m, '/api/retention/state', 'GET', 1)),
  req(me.id, 90, '/api/auth/me', 'GET', 1),
  // a script that names the owner's account: totals only, never the account's own use
  ai(me.id, 1.0, { src: 'script' }),
  { ...req(me.id, 200), src: 'test' },
  // a real learner, 10 active minutes
  ...[0, 5, 10].map((m) => req(learner.id, m + 100)), ai(learner.id, 0.2),
  // a team account and a test account, each with 10 active minutes that must not price a tier
  ...[0, 5, 10].map((m) => req(team.id, m + 300)), ai(team.id, 0.3),
  ...[0, 5, 10].map((m) => req(tester.id, m + 400)), ai(tester.id, 0.7),
  // shared work: a base level for no one
  ai(null, 0.4),
];
fs.mkdirSync(process.env.COST_TRACKER_DIR, { recursive: true });
fs.writeFileSync(path.join(process.env.COST_TRACKER_DIR, 'events-2026-11-03.jsonl'), `${events.filter((e) => e.ts >= Date.parse('2026-11-03')).map((e) => JSON.stringify(e)).join('\n')}\n`);
fs.writeFileSync(path.join(process.env.COST_TRACKER_DIR, 'events-2026-11-02.jsonl'), `${events.filter((e) => e.ts < Date.parse('2026-11-03')).map((e) => JSON.stringify(e)).join('\n')}\n`);

// study side: 30 minutes on the timer, 3 lesson answers (2 right), 1 placement answer, 1 unanswered item; and other people's rows
db.insert('study_sessions', { user_id: me.id, started_at: new Date(at(0)).toISOString(), active_ms: 30 * 60000 });
db.insert('study_sessions', { user_id: learner.id, started_at: new Date(at(0)).toISOString(), active_ms: 99 * 60000 });
const place = db.insert('sessions', { user_id: me.id, kind: 'placement', started_at: new Date(at(0)).toISOString() });
const iso = (m) => new Date(at(m)).toISOString();
db.insert('items', { user_id: me.id, created_at: iso(1), correct: true, ms: 4000 });
db.insert('items', { user_id: me.id, created_at: iso(2), correct: true, ms: 6000 });
db.insert('items', { user_id: me.id, created_at: iso(3), correct: false, ms: 20000 });
db.insert('items', { user_id: me.id, created_at: iso(4), correct: false, session_id: place.id });
db.insert('items', { user_id: me.id, created_at: iso(5), correct: null });
db.insert('items', { user_id: learner.id, created_at: iso(5), correct: true });

console.log('1. Buckets in the cost tracker');
const all = tracker.summarize({ days: 7, now });
const B = Object.fromEntries(all.buckets.map((b) => [b.bucket, b]));
check('me: 1 call, $0.05 list (the script call naming the account is not in it)', B.me.ai_calls === 1 && near(B.me.list_usd, 0.05), B.me);
check('learners: the real learner only ($0.20)', B.learners.ai_calls === 1 && near(B.learners.list_usd, 0.2) && B.learners.accounts === 1, B.learners);
check('internal: the team and the test account ($1.00)', B.internal.ai_calls === 2 && near(B.internal.list_usd, 1.0) && B.internal.accounts === 2, B.internal);
check('shared: the base level for no one ($0.40)', B.shared.ai_calls === 1 && near(B.shared.list_usd, 0.4), B.shared);
check('scripts: the script call and the test request, even though they name the account', B.scripts.ai_calls === 1 && near(B.scripts.list_usd, 1.0) && B.scripts.requests === 1, B.scripts);
check('everything still adds up in the total ($2.65)', near(all.window.list_usd, 2.65), all.window);
check('the users table never shows the script call on the account', near(all.users.find((u) => u.id === me.id).list_usd, 0.05), all.users);

const mine = tracker.summarize({ days: 7, now, scope: 'me' });
check('scope me: only the account\'s own $0.05 and 1 session of 10 active minutes', near(mine.window.list_usd, 0.05) && mine.sessions.length === 1 && near(mine.sessions[0].active_min, 10), [mine.window, mine.sessions]);
check('a tab refreshing itself (sign-in check, study strip) is no session', !mine.sessions.some((s) => s.start.startsWith('2026-11-02')), mine.sessions);
check('the day row carries active minutes, levels and level opens', (() => { const r = mine.daily.find((x) => x.day === '2026-11-03'); return r.active_min === 10 && r.levels === 1 && r.level_opens === 2 && r.level_waits === 1 && r.sessions === 1; })(), mine.daily[0]);
const prod = tracker.summarize({ days: 7, now, scope: 'product' });
check('scope product: the account plus real learners ($0.25)', near(prod.window.list_usd, 0.25), prod.window);
check('the tier projection uses only product user-days (2), never the team or test account\'s', all.projection.basis_user_days === 2, all.projection);
check('an unknown scope is everything', tracker.summarize({ days: 7, now, scope: 'nope' }).scope === 'all');

console.log('2. My stats, day by day');
const s = myStats.compute({ days: 7, now });
check('finds the account by its address, any case', s.accounts.length === 1 && s.accounts[0].id === me.id, s.accounts);
const today = s.daily.find((r) => r.day === '2026-11-03');
check('study minutes from the timer: 30 (not the other learner\'s 99)', today.study_min === 30, today);
check('3 lesson questions, 2 right = 66.7%; the placement answer apart; the unanswered item not counted', today.questions === 3 && today.correct === 2 && today.accuracy_pct === 66.7 && today.placement_questions === 1, today);
check('median seconds per question: 6.0', today.median_sec_per_question === 6, today);
check('cost and app time from the tracker\'s me bucket', near(today.list_usd, 0.05) && near(today.actual_usd, 0.01) && today.app_active_min === 10 && today.levels === 1 && today.ai_calls === 1, today);
check('totals: 1 active day (the refresh-only day does not count)', s.totals.active_days === 1, s.totals);
check('averages: list $0.10 per study hour (by the timer), $0.05 per level, 50% of opens waited', near(s.averages.list_usd_per_hour, 0.1) && near(s.averages.list_usd_per_level, 0.05) && s.averages.waited_share_pct === 50 && s.averages.hours_basis === 'study timer', s.averages);
check('kept apart lists every other bucket for the same window', s.kept_apart.length === 5 && near(s.kept_apart.find((b) => b.bucket === 'scripts').list_usd, 1.0), s.kept_apart);
check('the newest day is first and the window has 7 days', s.daily.length === 7 && s.daily[0].day === '2026-11-03', s.daily.map((r) => r.day));

console.log('3. Marking where an event came from');
tracker.recordAi({ userId: me.id, model: 'm', usage: { input_tokens: 1, output_tokens: 1 }, provider: 'nvidia', role: 'fast', task: 'x' });
tracker.flushSync();
const last = fs.readFileSync(path.join(process.env.COST_TRACKER_DIR, `events-${new Date().toISOString().slice(0, 10)}.jsonl`), 'utf8').trim().split('\n').pop();
check('a call from a process that is not the app server is marked (src)', ['script', 'test'].includes(JSON.parse(last).src), last);

process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true })); // after the data store's last save, not under it
if (failed) { console.log(`FAILED: ${passed} checks passed, ${failed} failed`); process.exit(1); }
console.log(`my-stats ok: ${passed} checks passed`);
process.exit(0);
