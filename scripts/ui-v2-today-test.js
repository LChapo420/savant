/**
 * services/ui-v2-today.js: has the learner met today's chosen minutes? Temporary database. node scripts/ui-v2-today-test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-today-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
const db = require('../config/db');
const today = require('../services/ui-v2-today');

const now = Date.parse('2026-11-07T18:00:00Z');
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const u = db.insert('users', { email: 'today-test@example.com', display_name: 'T', daily_plan_minutes: 45, retention_tz: 'UTC' });
const sitting = (startAgo, endAgo, extra = {}) => db.insert('sessions', { user_id: u.id, started_at: iso(startAgo), ended_at: endAgo == null ? null : iso(endAgo), ...extra });
let n = 0;
const ok = (name, cond, got) => { assert(cond, `${name}: ${JSON.stringify(got)}`); n += 1; console.log(`  ok   ${name}`); };

let r = today.todayFor(u.id, now);
ok('nothing today: not done', r.spent === 0 && !r.done && r.goal === 45, r);
sitting(100, 80);
r = today.todayFor(u.id, now);
ok('a finished sitting counts', r.spent === 20 && !r.done, r);
sitting(70, null);
sitting(60, 40, { abandoned: true });
r = today.todayFor(u.id, now);
ok('an open or abandoned sitting does not', r.spent === 20, r);
sitting(60 * 30, 60 * 29);
r = today.todayFor(u.id, now);
ok('yesterday does not', r.spent === 20, r);
sitting(500, 300);
r = today.todayFor(u.id, now);
ok('a sitting left open is capped', r.spent === 20 + today.CAP_MIN && r.done, r);
const v = db.insert('users', { email: 'today-test2@example.com', display_name: 'V', daily_plan_minutes: 60, retention_tz: 'UTC' });
db.insert('study_sessions', { user_id: v.id, started_at: iso(90), active_ms: 40 * 60000 });
db.insert('sessions', { user_id: v.id, started_at: iso(85), ended_at: iso(55) });
r = today.todayFor(v.id, now);
ok('the timer and the sittings inside it are not counted twice', r.spent === 40 && !r.done, r);
db.insert('study_sessions', { user_id: v.id, started_at: iso(40), active_ms: 25 * 60000 });
r = today.todayFor(v.id, now);
ok('the chosen minutes met on the timer: done', r.spent === 65 && r.done, r);
const before = JSON.stringify(require('../services/daily-plan').planFor(v.id, { now }));
today.todayFor(v.id, now);
ok('what the plan selects is the same after asking', before === JSON.stringify(require('../services/daily-plan').planFor(v.id, { now })));
console.log(`ui-v2-today-test: ${n} passed`);
try { if (db.flush) db.flush(); } catch { /* temp */ }
process.exit(0);
