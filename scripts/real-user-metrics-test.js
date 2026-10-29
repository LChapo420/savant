/**
 * Real-user metrics (services/real-user-metrics.js, the admin #metrics view, the CSV
 * export and scripts/metrics-report.js).
 *
 *   node scripts/real-user-metrics-test.js
 *
 * The data file is a scratch file made by the app's own setup (config/db.js creates
 * an empty store when DB_FILE points at a missing file); data/db.json is never
 * opened. Test, demo and founder accounts in the fixture are deliberately the most
 * active ones, so any leak into the real-user numbers changes a number checked here.
 * The server part runs server.js on a copy with every model key blanked; no model
 * is called.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'savant-metrics-test-'));
const DB_FILE = path.join(SCRATCH, 'db.json');
const LEDGERS = path.join(SCRATCH, 'ledgers');
process.env.DB_FILE = DB_FILE;
process.env.OWNER_EMAIL = 'founder@gmail.com';
process.env.ADMIN_EMAILS = '';
process.env.FOUNDER_EMAILS = '';
process.env.TEAM_EMAIL_DOMAINS = 'savantedu.com';
process.env.METRICS_EXCLUDE_EMAILS = 'my-alt-account@gmail.com';
process.env.OLLAMA_ENABLED = '0';

let failed = 0;
let passed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600)}` : ''}`);
}

const DAY = 86400000;
// Pinned "now": 2026-10-28 12:00 UTC. Day 0 of the main cohort is ten days earlier.
const NOW = Date.parse('2026-10-28T12:00:00Z');
const d = (n, hh = '15:00') => new Date(Date.parse(`${new Date(NOW - 10 * DAY).toISOString().slice(0, 10)}T${hh}:00Z`) + n * DAY).toISOString();
const day = (n) => d(n).slice(0, 10);

// ── 1. the scratch file, made by the app's own setup ─────────────────────────
console.log('\nThe scratch data file');
const db = require('../config/db');
check('config/db.js created the scratch file on load', fs.existsSync(DB_FILE));
const fresh = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
check('it is an empty store with every collection', Array.isArray(fresh.users) && fresh.users.length === 0 && Array.isArray(fresh.ai_usage) && Array.isArray(fresh.study_sessions));

const metrics = require('../services/real-user-metrics');
const round1 = (n) => Number(n.toFixed(1));

// ── 2. the fixture ───────────────────────────────────────────────────────────
function user(doc) { return db.insert('users', { display_name: doc.email || doc.username, xp: 0, streak: 0, onboarded: true, account_type: 'standard', ...doc }); }
function act(u, n, minutes = 20) {
  const s = db.insert('sessions', { user_id: u.id, kind: 'lesson', track_id: 'math', started_at: d(n), ended_at: new Date(Date.parse(d(n)) + minutes * 60000).toISOString(), created_at: d(n) });
  db.insert('items', { user_id: u.id, session_id: s.id, correct: true, created_at: d(n), answered_at: d(n) });
  return s;
}

// Real users.
const alice = user({ email: 'alice@gmail.com', created_at: d(0, '09:00') });
act(alice, 0); act(alice, 1); act(alice, 7, 200); // the 200-minute sitting is capped at 90
db.insert('study_sessions', { user_id: alice.id, local_day: day(1), started_at: d(1), ended_at: d(1), active_ms: 25 * 60000, status: 'ended' });
const bob = user({ email: 'bob@outlook.com', created_at: d(0, '10:00') });
act(bob, 0);
const kid = user({ email: null, username: 'kiddo42', account_type: 'child', created_at: d(3) });
db.insert('parental_consents', { child_user_id: kid.id, parent_email: 'parent@yahoo.com', status: 'granted' });
db.insert('tutor_memory', { user_id: kid.id, summary: '', turns: [{ role: 'user', content: 'hi', at: d(4) }, { role: 'assistant', content: 'hello', at: d(5) }], turn_count: 1 });
const newbie = user({ email: 'new@proton.me', created_at: d(10, '08:00') }); // signed up "today"
act(newbie, 10);
db.insert('ai_usage', { user_id: alice.id, day: day(1), cents: 10, calls: 4, provider: 'anthropic' });
db.insert('ai_usage', { user_id: bob.id, day: day(0), cents: 4, calls: 2, provider: 'anthropic' });
db.insert('ai_usage', { user_id: newbie.id, day: day(10), cents: 0, calls: 9, provider: 'nvidia' });

// Excluded accounts, made far more active than the real ones.
const excluded = [
  ['founder', user({ email: 'Founder@Gmail.com ', created_at: d(-30) })],
  ['founder', user({ email: 'landon@savantedu.com', created_at: d(-20) })],
  ['test', user({ email: 'qa1@example.test', created_at: d(0) })],
  ['test', user({ email: 'someone@sub.domain.test', created_at: d(0) })],
  ['test', user({ email: 'qa@example.com', created_at: d(0) })],
  ['test', user({ email: 'x@mail.example.org', created_at: d(0) })],
  ['test', user({ email: 'real-looking@gmail.com', is_test: true, created_at: d(0) })],
  ['test', user({ email: 'my-alt-account@gmail.com', created_at: d(0) })],
  ['demo', user({ email: 'reviewer@gmail.com', is_demo: true, account_kind: 'demo', created_at: d(0) })],
  ['demo', user({ email: 'demo2@yahoo.com', account_kind: 'demo', created_at: d(0) })],
  ['test', user({ email: '=HYPERLINK("x")@example.test', display_name: '=cmd|calc', created_at: d(0) })],
];
const testKid = user({ email: null, username: 'testkid', account_type: 'child', created_at: d(0) });
db.insert('parental_consents', { child_user_id: testKid.id, parent_email: 'mom@example.test', status: 'granted' });
excluded.push(['test', testKid]);
for (const [, u] of excluded) {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) act(u, n, 45);
  db.insert('study_sessions', { user_id: u.id, local_day: day(1), started_at: d(1), active_ms: 600 * 60000 });
  db.insert('ai_usage', { user_id: u.id, day: day(1), cents: 500, calls: 300, provider: 'anthropic' });
}

// Spend ledgers: Anthropic-style (usd, refused entries), Jev-style (counted), and a
// truncated one whose log starts mid-month.
fs.mkdirSync(LEDGERS, { recursive: true });
const month = day(0).slice(0, 7);
fs.writeFileSync(path.join(LEDGERS, 'anthropic-ledger.json'), JSON.stringify({
  seed_usd: 11.2, settled_usd: 2.5, calls: 3,
  log: [
    { at: d(1), task: 'grade', usd: 0.5, outcome: 'settled' },
    { at: d(2), task: 'lesson', usd: 1.5, outcome: 'settled' },
    { at: d(2), task: 'lesson', usd: 9, outcome: 'refused: would reach $25 of the $24 stop' },
    { at: '2020-01-05T00:00:00Z', task: 'old', usd: 0.5, outcome: 'settled' },
  ],
}));
fs.writeFileSync(path.join(LEDGERS, 'jev-ledger.json'), JSON.stringify({
  counted_usd: 0.25, calls: 1, log: [{ at: d(3), task: 'grade', counted: 0.25 }, { at: d(3), task: 'grade', refused: true, estimate: 3 }],
}));
fs.writeFileSync(path.join(LEDGERS, 'standard-compute-ledger.json'), JSON.stringify({
  seed_usd: 0.5, settled_usd: 1, calls: 5000, log: [{ at: d(8), usd: 1, outcome: 'settled' }],
}));
fs.writeFileSync(path.join(LEDGERS, 'usage-notes.json'), JSON.stringify({ log: [{ at: d(1), usd: 999 }] }));
fs.writeFileSync(path.join(LEDGERS, 'broken-ledger.json'), '{ not json');

// ── 3. who counts ────────────────────────────────────────────────────────────
console.log('\nWho counts');
const rules = metrics.rules();
const cls = (u, parent) => metrics.classify(u, rules, parent);
check('a gmail address is a real user', cls({ email: 'alice@gmail.com' }).group === 'real');
check('an @example.test address is test', cls({ email: 'qa1@example.test' }).group === 'test');
check('any .test domain is test', cls({ email: 'a@b.c.test' }).group === 'test');
check('.example, .invalid and .localhost are test', ['a@x.example', 'a@x.invalid', 'a@localhost'].every((e) => cls({ email: e }).group === 'test'));
check('example.com / .net / .org and their subdomains are test', ['a@example.com', 'a@example.net', 'a@mail.example.org'].every((e) => cls({ email: e }).group === 'test'));
check('a look-alike domain is NOT test (myexample.com, test.com, gmail.com.test-ish)', ['a@myexample.com', 'a@test.com', 'a@testing.io'].every((e) => cls({ email: e }).group === 'real'));
check('is_test: true is test whatever the email', cls({ email: 'x@gmail.com', is_test: true }).group === 'test');
check('account_kind "test" is test', cls({ email: 'x@gmail.com', account_kind: 'test' }).group === 'test');
check('is_demo: true is demo', cls({ email: 'x@gmail.com', is_demo: true }).group === 'demo');
check('account_kind "demo" is demo, even on a founder address', cls({ email: 'founder@gmail.com', account_kind: 'demo' }).group === 'demo');
check('the owner address is founder (case and spaces ignored)', cls({ email: ' FOUNDER@gmail.com' }).group === 'founder');
check('a team-domain address is founder', cls({ email: 'landon@savantedu.com' }).group === 'founder');
check('METRICS_EXCLUDE_EMAILS is test', cls({ email: 'my-alt-account@gmail.com' }).group === 'test');
check('a child judged by a test parent address is test', cls({ email: null, username: 'k' }, 'mom@example.test').group === 'test');
check('a child with a real parent address is real', cls({ email: null, username: 'k' }, 'mom@gmail.com').group === 'real');
check('every rule hit names its rule', excluded.every(([, u]) => cls(u, u.id === testKid.id ? 'mom@example.test' : '').rule));
const withAdmins = metrics.rules({ ...process.env, ADMIN_EMAILS: 'Ops@Gmail.com', FOUNDER_EMAILS: 'cofounder@gmail.com', TEAM_EMAIL_DOMAINS: '' });
check('ADMIN_EMAILS and FOUNDER_EMAILS count as founder', metrics.classify({ email: 'ops@gmail.com' }, withAdmins).group === 'founder'
  && metrics.classify({ email: 'cofounder@gmail.com' }, withAdmins).group === 'founder');
check('TEAM_EMAIL_DOMAINS="" turns the team-domain rule off', metrics.classify({ email: 'landon@savantedu.com' }, withAdmins).group === 'real');

// ── 4. the numbers ───────────────────────────────────────────────────────────
console.log('\nThe numbers');
const m = metrics.compute(db, { now: NOW, days: 14, ledgerDir: LEDGERS });
check('4 real users; every fixture exclusion counted', m.accounts.real === 4 && m.accounts.excluded === excluded.length, m.accounts);
check('the exclusion count splits founder / test / demo', m.accounts.founder === 2 && m.accounts.demo === 2 && m.accounts.test === excluded.length - 4, m.accounts);
check('the excluded list carries every excluded account with its rule', m.excluded.length === excluded.length && m.excluded.every((e) => e.rule && e.group !== 'real'));
check('no real user is in the excluded list', ![alice, bob, kid, newbie].some((u) => m.excluded.find((e) => e.id === u.id)));
check('real users who did anything: 4', m.headline.ever_active === 4, m.headline);
check('active on 2+ distinct days: 1 (alice; bob, the child and the newcomer have one day each)', m.headline.active_2plus_days === 1, m.headline);
check('a tutor reply alone does not make a day active', !m.daily.find((x) => x.day === day(5)).active_learners);

const daily = Object.fromEntries(m.daily.map((x) => [x.day, x]));
check('the daily series is 14 days ending today', m.daily.length === 14 && m.daily[13].day === day(10));
check(`sign-ups on day 0: 2 real, ${excluded.filter(([, u]) => u.created_at.slice(0, 10) === day(0)).length} excluded`, daily[day(0)].signups === 2
  && daily[day(0)].signups_excluded === excluded.filter(([, u]) => u.created_at.slice(0, 10) === day(0)).length, daily[day(0)]);
check('active learners on day 1: 1 (test accounts active that day are not counted)', daily[day(1)].active_learners === 1, daily[day(1)]);
check('the founder shows as founder-active, not as a learner', daily[day(1)].founder_active === 2);
check('sign-ups today: 1', daily[day(10)].signups === 1);

const c0 = m.cohorts.find((c) => c.day === day(0));
check('day-0 cohort: 2 users, 1 back on day 1, 1 back on day 7', c0 && c0.size === 2 && c0.day1_returned === 1 && c0.day7_returned === 1 && c0.day1_rate === 0.5 && c0.day7_rate === 0.5, c0);
const c3 = m.cohorts.find((c) => c.day === day(3));
check('day-3 cohort (the child): back on day 1; day 7 not over yet so no rate', c3 && c3.day1_returned === 1 && c3.day1_rate === 1 && c3.day7_complete === false && c3.day7_rate === null, c3);
const cToday = m.cohorts.find((c) => c.day === day(10));
check('today\'s cohort is not counted toward day-1 yet', cToday && cToday.day1_complete === false && cToday.day1_rate === null, cToday);
check('pooled day-1 return: 2 of 3 eligible', m.headline.day1_return.returned === 2 && m.headline.day1_return.eligible_users === 3, m.headline.day1_return);
check('pooled day-7 return: 1 of 2 eligible', m.headline.day7_return.returned === 1 && m.headline.day7_return.eligible_users === 2, m.headline.day7_return);

const l30 = m.headline.last_30_days;
check('last 30 days: 4 active learners, 5 sittings', l30.active_learners === 4 && l30.sittings === 5, l30);
check('sittings per active learner 1.25', l30.sittings_per_active === 1.25, l30);
check('measured study minutes: 25 in all (only real users)', l30.study_minutes === 25, l30);
check('sitting minutes capped at 90 per sitting: 20+20+90+20+20 = 170', l30.sitting_minutes === 170, l30);
check('AI cost: $0.14 in all, $0.035 per active learner (estimate)', l30.ai_cost_usd_estimate === 0.14 && l30.ai_cost_per_active_usd_estimate === 0.035, l30);
check('AI calls counted for real users only: 15', l30.ai_calls === 15, l30);

const mon = m.months.find((x) => x.month === month);
const ledgerInMonth = [d(1), d(2), d(3), d(8)].filter((t) => t.slice(0, 7) === month);
check('the month row exists and matches the real users only', mon && mon.ai_cost_usd_estimate === 0.14, mon);
const expectLedger = [[d(1), 0.5], [d(2), 1.5], [d(3), 0.25], [d(8), 1]].filter(([t]) => t.slice(0, 7) === month).reduce((s, [, v]) => s + v, 0);
check(`ledger spend in ${month}: refused entries left out, files not named *ledger*.json ignored`, mon && Math.abs(mon.ledger_usd - expectLedger) < 1e-9, { mon, expectLedger, ledgerInMonth });
check('ledger ÷ active learners is an upper bound figure', mon && mon.active_learners > 0 && Math.abs(mon.ledger_usd_per_active_upper_bound - expectLedger / mon.active_learners) < 1e-4, mon);
check('a truncated ledger whose log starts inside the month marks it partial', mon && mon.ledger_partial === (d(8) > `${month}-01`), mon);
check('an unreadable ledger is reported, not thrown', m.ledgers.some((l) => l.file === 'broken-ledger.json' && l.error));
check('the old 2020 entry lands in its own month', m.months.some((x) => x.month === '2020-01' && x.ledger_usd === 0.5));
check('lifetime figures: anthropic seed + settled, jev counted', m.ledgers.find((l) => l.file === 'anthropic-ledger.json').lifetime_usd === 13.7
  && m.ledgers.find((l) => l.file === 'jev-ledger.json').lifetime_usd === 0.25);
check('the founder is reported apart with their own activity', m.founder.length === 2 && m.founder.every((f) => f.active_days === 11 && f.sittings === 11));
check('the month row reports the founder separately', mon && mon.founder.active === true && mon.founder.ai_cost_usd_estimate === 10, mon && mon.founder);
check('every note says which costs are estimates', m.notes.some((n) => /ESTIMATE/.test(n)) && m.notes.some((n) => /upper bound/.test(n)));

// ── 4b. the activation funnel ────────────────────────────────────────────────
console.log('\nThe activation funnel');
const fstep = (k) => m.funnel.steps.find((x) => x.key === k);
check('funnel: 4 signed up, 4 onboarded', fstep('signed_up').users === 4 && fstep('onboarded').users === 4, m.funnel.steps);
check('funnel: 3 answered a first question (the child only talked to the tutor)', fstep('first_lesson').users === 3 && fstep('first_lesson').of_signed_up === 0.75, fstep('first_lesson'));
check('funnel: 2 came back on a later day (alice and the child)', fstep('came_back').users === 2, fstep('came_back'));
check('funnel: next-day and week-1 steps match the pooled cohort figures', fstep('day1').users === m.headline.day1_return.returned && fstep('day1').of === m.headline.day1_return.eligible_users
  && fstep('week1').users === m.headline.week1_return.returned && fstep('week1').of === m.headline.week1_return.eligible_users, m.funnel.steps);
check('funnel: no excluded account leaks in', fstep('signed_up').users === m.accounts.real && fstep('came_back').users <= 4);
check('funnel: minutes per active day = minutes / active days', m.funnel.active_days_total === 6 && m.funnel.minutes_per_active_day.measured_study === round1(25 / 6) && m.funnel.minutes_per_active_day.sitting_upper === round1(170 / 6), m.funnel);
{
  // A stand-in store: placement only, onboarded with a lesson, never onboarded with an unanswered question.
  const rows = {
    users: [
      { id: 1, email: 'p@gmail.com', created_at: '2026-10-01T10:00:00Z', onboarded: true },
      { id: 2, email: 'l@gmail.com', created_at: '2026-10-01T10:00:00Z', onboarded: true },
      { id: 3, email: 'n@gmail.com', created_at: '2026-10-01T10:00:00Z', onboarded: false },
    ],
    sessions: [
      { id: 10, user_id: 1, kind: 'placement', started_at: '2026-10-01T11:00:00Z' },
      { id: 11, user_id: 2, kind: 'lesson', started_at: '2026-10-01T11:00:00Z' },
    ],
    items: [
      { user_id: 1, session_id: 10, created_at: '2026-10-01T11:00:00Z', answered_at: '2026-10-01T11:01:00Z' },
      { user_id: 2, session_id: 11, created_at: '2026-10-01T11:00:00Z', answered_at: '2026-10-01T11:01:00Z' },
      { user_id: 3, session_id: 12, created_at: '2026-10-01T11:00:00Z', answered_at: null },
    ],
  };
  const fm = metrics.compute({ all: (n) => rows[n] || [] }, { now: Date.parse('2026-10-20T12:00:00Z'), ledgerDir: LEDGERS });
  const f = Object.fromEntries(fm.funnel.steps.map((x) => [x.key, x]));
  check('a placement-only user is onboarded but has no first lesson; an unanswered question is not one either', f.onboarded.users === 2 && f.first_lesson.users === 1, fm.funnel.steps);
  check('nobody came back: 0 of 3, rates are 0 not null', f.came_back.users === 0 && f.day1.rate === 0 && f.day1.of === 3 && f.week1.of === 3, f);
  const empty = metrics.compute({ all: () => [] }, { now: NOW, ledgerDir: LEDGERS });
  check('with no users every rate is null, not NaN', empty.funnel.steps.every((x) => x.rate === null) && empty.funnel.minutes_per_active_day.measured_study === null);
}

// ── 5. the CSV ───────────────────────────────────────────────────────────────
console.log('\nCSV');
const csvDaily = metrics.toCsv(m, 'daily').trim().split('\n');
check('daily CSV: a header and one row per day', csvDaily[0] === 'day,signups_real,signups_excluded,active_real_learners,founder_active' && csvDaily.length === 15);
const csvCohorts = metrics.toCsv(m, 'cohorts');
check('cohorts CSV has the day-0 cohort with its rates', csvCohorts.includes(`${day(0)},2,1,0.5,1,0.5,`));
const csvMonthly = metrics.toCsv(m, 'monthly');
check('monthly CSV names estimate and upper-bound columns', /ai_cost_per_active_usd_estimate/.test(csvMonthly) && /ledger_usd_per_active_upper_bound/.test(csvMonthly));
const csvExcluded = metrics.toCsv(m, 'excluded');
check('excluded CSV: one row per excluded account', csvExcluded.trim().split('\n').length === excluded.length + 1);
check('a cell starting with = is defused in the CSV', csvExcluded.includes(`'=cmd|calc`) && !/(^|,)=cmd/m.test(csvExcluded));
check('funnel CSV: a header, six steps, two invite rows and two minutes rows', metrics.toCsv(m, 'funnel').trim().split('\n').length === 11 && metrics.toCsv(m, 'funnel').startsWith('step,label,users,out_of,rate,share_of_all_signups'));
let threw = false;
try { metrics.toCsv(m, 'nope'); } catch { threw = true; }
check('an unknown table is refused', threw);

// ── 6. the report CLI, read-only ─────────────────────────────────────────────
console.log('\nscripts/metrics-report.js');
db.flush();
const before = fs.readFileSync(DB_FILE);
const csvDir = path.join(SCRATCH, 'csv');
const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'metrics-report.js'), '--data', DB_FILE, '--ledgers', LEDGERS, '--csv-dir', csvDir],
  { env: { ...process.env, DB_FILE: '' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
check('it prints the real-user count and the exclusions', out.includes(`4 real; excluded ${excluded.length} (founder 2, test ${excluded.length - 4}, demo 2)`), out);
check('it prints the funnel', /activation funnel/.test(out) && /Signed up: 4 of 4/.test(out) && /minutes per active day/.test(out), out);
check('it writes every CSV file', metrics.TABLES.every((t) => fs.existsSync(path.join(csvDir, `metrics-${t}.csv`))));
check('the data file is byte-identical afterwards', Buffer.compare(before, fs.readFileSync(DB_FILE)) === 0);

// ── 7. the admin routes on a running server ──────────────────────────────────

function client(base) {
  let cookie = '';
  async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: { Origin: base, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* csv */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}

async function serverTests() {
  console.log('\nThe admin routes (server.js on a copy)');
  const copy = path.join(SCRATCH, 'server-db.json');
  fs.copyFileSync(DB_FILE, copy);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_FILE: copy,
    MAIL_OUTBOX_DIR: path.join(SCRATCH, 'outbox'),
    CONSENT_SWEEP: 'off',
    ADMIN_EMAILS: 'metrics-admin@gmail.com',
    OWNER_EMAIL: 'founder@gmail.com',
    METRICS_LEDGER_DIR: LEDGERS,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
  };
  for (const k of ['NVIDIA_API_KEY', 'ANTHROPIC_API_KEY', 'FACT_CHECK_ANTHROPIC_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_DEEPSEEK_API_KEY',
    'OPENROUTER_GLM_API_KEY', 'OPENROUTER_GPT_SOL_API_KEY', 'MIMO_API_KEY', 'GEMINI_API_KEY', 'MODELFLARE_API_KEY', 'XKIRO_API_KEY',
    'UNOROUTER_API_KEY', 'STANDARD_COMPUTE_API_KEY', 'JEV_API_KEY']) env[k] = '';
  delete env.DB_READONLY;
  delete env.BETA_GATE;
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (b) => { log += b; });
  child.stderr.on('data', (b) => { log += b; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    try { up = (await fetch(`${base}/api/health`)).ok; } catch { /* not yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 250));
    if (child.exitCode !== null) break;
  }
  check('the server starts on the scratch copy', up, log.slice(-800));
  if (!up) { child.kill(); return; }
  try {
    const anon = client(base);
    check('signed out: /api/admin/metrics answers 401', (await anon.get('/api/admin/metrics')).status === 401);

    const learnerC = client(base);
    const reg = await learnerC.post('/api/auth/register', { email: 'new-learner@gmail.com', password: 'a-long-enough-pass-1', display_name: 'New Learner' });
    check('a learner can register', reg.status === 201, reg.text);
    check('a learner gets 404 for the metrics, not 403', (await learnerC.get('/api/admin/metrics')).status === 404);
    check('a learner gets 404 for the CSV', (await learnerC.get('/api/admin/metrics.csv')).status === 404);

    const admin = client(base);
    const regA = await admin.post('/api/auth/register', { email: 'metrics-admin@gmail.com', password: 'a-long-enough-pass-2', display_name: 'Admin' });
    check('the admin registers', regA.status === 201, regA.text);
    const res = await admin.get('/api/admin/metrics');
    check('the admin gets the metrics', res.status === 200 && res.json && res.json.accounts, res.text.slice(0, 300));
    if (res.json) {
      check('the new learner counts as real (4 + 1)', res.json.accounts.real === 5, res.json.accounts);
      check('the admin account counts as founder, not as a user', res.json.excluded.some((e) => e.email === 'metrics-admin@gmail.com' && e.group === 'founder'));
      check('the ledgers come from METRICS_LEDGER_DIR', res.json.ledgers.some((l) => l.file === 'anthropic-ledger.json'));
    }
    const csv = await admin.get('/api/admin/metrics.csv?table=cohorts');
    check('the CSV export is text/csv with a download name', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type'))
      && /attachment; filename="metrics-cohorts-/.test(csv.headers.get('content-disposition')) && csv.text.startsWith('signup_day,cohort_size'));
    check('an unknown table is a 400', (await admin.get('/api/admin/metrics.csv?table=../../etc')).status === 400);
    const page = await admin.get('/admin');
    check('the admin page still loads', page.status === 200);
    const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'admin.js'), 'utf8');
    check('the admin page has the metrics view and the CSV links', /renderMetrics/.test(js) && /metrics\.csv\?table=/.test(js) && /href="#metrics"/.test(js));
  } finally {
    child.kill();
  }
}

serverTests().catch((err) => { failed++; console.log(`  FAIL server tests threw: ${err.stack}`); }).finally(() => {
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch { /* best effort */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
