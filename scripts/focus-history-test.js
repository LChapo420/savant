/**
 * Focus history (services/focus-history.js, GET /api/profile/focus, public/js/focus.js):
 * the owner's sample has every day at least an hour across the five sample subjects and is
 * the same on every load; real history sums each learner's own sessions per day and subject,
 * caps a session at 3 hours, and never shows another learner's time; nothing is written.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `focus-history-${process.pid}.json`);
process.env.DB_FILE = tmp;
const db = require('../config/db');
const focus = require('../services/focus-history');

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const s1 = focus.sample(4, new Date('2026-10-30T12:00:00Z'));
const s2 = focus.sample(4, new Date('2026-10-30T12:00:00Z'));
const totals = Object.values(s1.days).map((d) => Object.values(d).reduce((a, b) => a + b, 0));
check('the sample is labelled as a sample', s1.sample === true);
check('the sample covers about 13 months', Object.keys(s1.days).length === 401);
check('every sample day has at least an hour', Math.min(...totals) >= 60, Math.min(...totals));
check('the sample varies (some days of 5 hours or more)', totals.some((t) => t >= 300));
check('the sample uses English, Reading, Math, Piano and Spanish', s1.subjects.map((s) => s.id).join() === 'english,reading,math,piano,spanish');
check('the sample is the same on every load', JSON.stringify(s1) === JSON.stringify(s2));
check('subjects carry names and colours', s1.subjects.every((s) => s.name && /^#[0-9a-f]{6}$/i.test(s.color)));

const t0 = Date.parse('2026-10-20T15:00:00Z');
const at = (ms) => new Date(ms).toISOString();
db.insert('sessions', { user_id: 901, track_id: 'math', started_at: at(t0), ended_at: at(t0 + 45 * 60000) });
db.insert('sessions', { user_id: 901, track_id: 'math', started_at: at(t0 + 3600000), ended_at: at(t0 + 3600000 + 30 * 60000) });
db.insert('sessions', { user_id: 901, track_id: 'piano', started_at: at(t0), ended_at: at(t0 + 10 * 3600000) });
db.insert('sessions', { user_id: 902, track_id: 'math', started_at: at(t0), ended_at: at(t0 + 60 * 60000) });
const r = focus.real(901);
check('real history sums one learner\'s sessions per day and subject', r.days['2026-10-20'].math === 75, r.days);
check('a session counts at most 3 hours', r.days['2026-10-20'].piano === focus.SESSION_CAP_MIN, r.days);
check('real history is not a sample and has only this learner\'s time', r.sample === false && Object.keys(r.days).length === 1);
check('forUser gives a learner who is not the owner their real history', focus.forUser({ id: 901, email: 'someone@example.test' }).sample === false);
check('nothing was written for the sample', db.all('sessions').length === 4);

try { fs.unlinkSync(tmp); } catch { /* not written */ }
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
