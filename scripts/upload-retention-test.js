// Spanish uploads are deleted after the retention window; newer files and other dirs are untouched.
const fs = require('fs');
const os = require('os');
const path = require('path');
const ret = require('../services/upload-retention');

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL: ' + name); } }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
const DAY = 24 * 60 * 60 * 1000;
const put = (name, ageDays) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, 'x');
  const t = new Date(Date.now() - ageDays * DAY);
  fs.utimesSync(f, t, t);
};
put('old.wav', 10); put('edge.mp3', 7.5); put('new.wav', 1);

delete process.env.UPLOAD_RETENTION_DAYS;
check('default window is 7 days', ret.retentionDays() === 7);
process.env.UPLOAD_RETENTION_DAYS = '3';
check('env sets the window', ret.retentionDays() === 3);
process.env.UPLOAD_RETENTION_DAYS = 'junk';
check('junk falls back to 7', ret.retentionDays() === 7);
delete process.env.UPLOAD_RETENTION_DAYS;

check('sweep removes the two old files', ret.sweep(dir) === 2);
check('old file gone', !fs.existsSync(path.join(dir, 'old.wav')));
check('7.5-day file gone', !fs.existsSync(path.join(dir, 'edge.mp3')));
check('1-day file kept', fs.existsSync(path.join(dir, 'new.wav')));
check('second sweep removes nothing', ret.sweep(dir) === 0);
check('window 0 removes everything', ret.sweep(dir, { days: 0 }) === 1 && fs.readdirSync(dir).length === 0);
check('missing dir is fine', ret.sweep(path.join(dir, 'nope')) === 0);
const policy = fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8');
check('policy states the 7-day upload deletion', /upload in the Spanish section[\s\S]{0,80}after 7 days/.test(policy));
check('route schedules the sweep', fs.readFileSync(path.join(__dirname, '..', 'routes', 'spanish', 'index.js'), 'utf8').includes('upload-retention'));
const mine = ret.nameFor(7, 'wav', 'abc');
check('upload name carries the owner', /^u7-\d+-abc\.wav$/.test(mine));
for (const n of [mine, ret.nameFor(70, 'wav', 'def'), ret.nameFor(8, 'mp3', 'ghi'), 'legacy.wav']) fs.writeFileSync(path.join(dir, n), 'x');
check('removeForUser removes only that learner (u7 is not u70)', ret.removeForUser(7, dir) === 1 && !fs.existsSync(path.join(dir, mine)) && fs.readdirSync(dir).length === 3);
check('removeForUser ignores junk ids and a missing dir', ret.removeForUser('x', dir) === 0 && ret.removeForUser(-1, dir) === 0 && ret.removeForUser(7, path.join(dir, 'nope')) === 0);
const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'spanish', 'index.js'), 'utf8');
check('upload route names files by owner', src.includes('uploadRetention.nameFor(uid(req)'));
check('account deletion removes uploads', fs.readFileSync(path.join(__dirname, '..', 'services', 'account-deletion.js'), 'utf8').includes('removeForUser'));
check('parent deletion of a child removes uploads', fs.readFileSync(path.join(__dirname, '..', 'routes', 'consent.js'), 'utf8').includes('removeForUser(childId)'));
const timer = ret.schedule(dir);
check('schedule returns an unref-able timer', !!timer);
clearInterval(timer);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`upload-retention-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
