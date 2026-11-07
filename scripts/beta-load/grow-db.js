#!/usr/bin/env node
/**
 * Build a store as it would look after N learners have studied for D days, by cloning the rows real scripted learners left behind.
 *
 *   node scripts/beta-load/grow-db.js --run <folder of a load run> --learners 250 --days 30 --minutes-in-run 3 --out <file>
 *        [--minutes-a-day 30] [--plans-a-day 4] [--print-rates]
 *
 * Rates: rows per learner per active minute in each per-learner collection, from the run's own data. Writing tailored levels cannot be
 * measured with a stub (its levels fail the app's checks), so plans are added at --plans-a-day of real size (the store's average
 * finished block plan). Accounts are grown<i>@example.test with the template's password hash (load-test-password).
 */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./harness');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const RUN = flag('run');
const N = Number(flag('learners', 100));
const D = Number(flag('days', 30));
const IN_RUN = Number(flag('minutes-in-run', 3));
const PER_DAY = Number(flag('minutes-a-day', 30));
const PLANS = Number(flag('plans-a-day', 4));
const OUT = flag('out');

const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));
const run = JSON.parse(fs.readFileSync(path.join(RUN, 'db.json'), 'utf8'));
const maxUser = Math.max(...base.users.map((u) => u.id));
const learners = run.users.filter((u) => u.id > maxUser && u.email);
const ids = new Set(learners.map((u) => u.id));
const OWNED = Object.keys(run).filter((k) => Array.isArray(run[k]) && run[k].some((r) => r && ids.has(r.user_id)));
const rates = {};
for (const c of OWNED) {
  const rows = run[c].filter((r) => ids.has(r.user_id));
  const failed = c === 'block_plans' ? rows.filter((r) => r.status === 'failed').length : 0;
  rates[c] = { rows_per_learner_min: (rows.length - failed) / learners.length / IN_RUN, bytes_per_row: rows.length ? JSON.stringify(rows).length / rows.length : 0 };
}
const good = base.block_plans.filter((p) => p.status === 'ready' || (p.blocks && p.blocks.length));
const planBytes = good.length ? JSON.stringify(good).length / good.length : 15000;
const bytesPerDay = Object.values(rates).reduce((a, r) => a + r.rows_per_learner_min * r.bytes_per_row * PER_DAY, 0) + PLANS * planBytes;
const summary = { learners_in_run: learners.length, bytes_per_learner_day: Math.round(bytesPerDay), plan_bytes: Math.round(planBytes), top: Object.entries(rates).sort((a, b) => b[1].rows_per_learner_min * b[1].bytes_per_row - a[1].rows_per_learner_min * a[1].bytes_per_row).slice(0, 8).map(([k, v]) => `${k} ${(v.rows_per_learner_min * PER_DAY).toFixed(1)} rows/day ${Math.round(v.bytes_per_row)} B`) };
console.log(JSON.stringify(summary));
if (args.includes('--print-rates') || !OUT) process.exit(0);

// The template: the learner who did the most.
const score = (u) => run.items.filter((i) => i.user_id === u.id).length;
const tmpl = learners.map((u) => [score(u), u]).sort((a, b) => b[0] - a[0])[0][1];
const of = (c) => run[c].filter((r) => r.user_id === tmpl.id);
const counters = { ...base._counters };
const out = { ...base, _counters: counters };
const fresh = (c) => { counters[c] = (counters[c] || 0) + 1; return counters[c]; };
const mins = PER_DAY * D;
for (let n = 1; n <= N; n++) {
  const user = { ...tmpl, id: fresh('users'), email: `grown${n}@example.test`, display_name: `Grown ${n}`, created_at: new Date(Date.now() - D * 86400000).toISOString() };
  out.users.push(user);
  // Enrolments and sessions once per copy, so ids stay consistent inside a learner.
  const enrollMap = new Map();
  for (const e of of('enrollments')) { const id = fresh('enrollments'); enrollMap.set(e.id, id); out.enrollments.push({ ...e, id, user_id: user.id }); }
  const tmplSessions = of('sessions');
  const copies = Math.max(1, Math.ceil(rates.sessions ? rates.sessions.rows_per_learner_min * mins / Math.max(1, tmplSessions.length) : 1));
  for (let k = 0; k < copies; k++) {
    const sessMap = new Map();
    for (const s of tmplSessions) { const id = fresh('sessions'); sessMap.set(s.id, id); out.sessions.push({ ...s, id, user_id: user.id, enrollment_id: enrollMap.get(s.enrollment_id) || s.enrollment_id }); }
    for (const i of of('items')) out.items.push({ ...i, id: fresh('items'), user_id: user.id, session_id: sessMap.get(i.session_id) || i.session_id, enrollment_id: enrollMap.get(i.enrollment_id) || i.enrollment_id });
    for (const e of of('events')) out.events.push({ ...e, id: fresh('events'), user_id: user.id, session_id: sessMap.get(e.session_id) || e.session_id });
  }
  for (const c of OWNED) {
    if (['enrollments', 'sessions', 'items', 'events', 'block_plans'].includes(c)) continue;
    const rows = of(c);
    if (!rows.length) continue;
    const want = /^(scorecards|profiles|learner_records|tutor_memory|tutor_modes|chess_ratings|streaks)$/.test(c) ? rows.length : Math.max(rows.length, Math.round(rates[c].rows_per_learner_min * mins));
    for (let k = 0; k < want; k++) { const r = rows[k % rows.length]; out[c].push({ ...r, id: fresh(c), user_id: user.id, enrollment_id: r.enrollment_id ? (enrollMap.get(r.enrollment_id) || r.enrollment_id) : r.enrollment_id }); }
  }
  if (good.length) {
    const sample = good[n % good.length];
    for (let k = 0; k < PLANS * D; k++) out.block_plans.push({ ...sample, id: fresh('block_plans'), user_id: user.id, level: 1000 + k });
  }
}
// One line, as the store now saves. Written in pieces so a big store does not hit the string limit here.
const fd = fs.openSync(OUT, 'w');
fs.writeSync(fd, '{');
let first = true;
for (const k of Object.keys(out)) {
  if (!first) fs.writeSync(fd, ',');
  first = false;
  if (!Array.isArray(out[k])) { fs.writeSync(fd, `${JSON.stringify(k)}:${JSON.stringify(out[k])}`); continue; }
  fs.writeSync(fd, `${JSON.stringify(k)}:[`);
  for (let i = 0; i < out[k].length; i++) fs.writeSync(fd, (i ? ',' : '') + JSON.stringify(out[k][i]));
  fs.writeSync(fd, ']');
}
fs.writeSync(fd, '}');
fs.closeSync(fd);
const big = Object.keys(out).filter((k) => Array.isArray(out[k])).map((k) => [k, out[k].length]).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(JSON.stringify({ out: OUT, bytes: fs.statSync(OUT).size, learners: N, days: D, rows: big }));
