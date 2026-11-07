/**
 * An upload's model calls and the tutor's daily limit (services/ai.js UPLOAD_OWN_BUDGET): with the switch on neither eats the other; off, as before. Also run by npm test.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.DB_FILE = path.join(os.tmpdir(), `upload-budget-test-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
fs.writeFileSync(process.env.DB_FILE, '{}');
const db = require('../config/db');
const ai = require('../services/ai');
let fail = 0; const check = (l, c, d) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${l}${c || d === undefined ? '' : ` ${JSON.stringify(d)}`}`); if (!c) fail += 1; };
const day = new Date().toISOString().slice(0, 10);
const u = db.insert('users', { email: 'b@example.test', display_name: 'b', password_hash: 'x' });
const row = db.insert('ai_usage', { user_id: u.id, day, cents: 0, calls: 120, upload_cents: 0, upload_calls: 0 });
process.env.UPLOAD_OWN_BUDGET = 'off';
check('off: the old limit stops an upload call too', !ai.withinBudget(u.id, 'material_lesson'));
process.env.UPLOAD_OWN_BUDGET = 'on';
check('on: the tutor at its limit does not stop an upload call', ai.withinBudget(u.id, 'material_lesson'));
check('on: and the tutor stays stopped', !ai.withinBudget(u.id, 'dock_help') && !ai.withinBudget(u.id));
db.update('ai_usage', row.id, { calls: 0, upload_calls: 1500 });
check('on: the upload ceiling stops upload calls', !ai.withinBudget(u.id, 'material_lesson'));
check('on: and leaves the tutor its day', ai.withinBudget(u.id, 'dock_help'));
db.update('ai_usage', row.id, { upload_calls: 0, upload_cents: 200 });
check('on: so does the upload money ceiling', !ai.withinBudget(u.id, 'material_part_change'));
check('background rewrites stop at half', (() => { db.update('ai_usage', row.id, { upload_cents: 100 }); return !ai.uploadShareLeft(u.id, 0.5); })());
db.flush(); try { fs.unlinkSync(process.env.DB_FILE); } catch { /* gone */ }
console.log(fail ? `FAILED ${fail}` : 'All upload budget checks passed.');
process.exit(fail ? 1 : 0);
