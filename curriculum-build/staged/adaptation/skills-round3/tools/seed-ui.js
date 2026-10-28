// Seed a click-through learner into the UI test DB copy (db.uitest.sk3.json) on the
// skills round 3 scratch app. Run before the test server starts.
//   node seed-ui.js <app> <db>
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const [, , APP, DBFILE] = process.argv;
process.env.DB_FILE = DBFILE;
for (const k of Object.keys(process.env)) if (/KEY|TOKEN|SECRET_API|WORKSPACE/.test(k)) process.env[k] = '';
process.env.SKILL_RECORD = 'on';
const req = (m) => require(path.join(APP, m));
const db = req('config/db');
const curriculum = req('config/curriculum');
const record = req('services/skill-record');
const bcrypt = req('node_modules/bcryptjs');
const DAY = 864e5;
const EMAIL = 'sk3-tester@example.test';
const pwFile = path.join(__dirname, '..', '..', 'sk3-login.txt');
const password = fs.existsSync(pwFile) ? fs.readFileSync(pwFile, 'utf8').match(/\/\s*(\S+)/)[1] : `sk3-${crypto.randomBytes(9).toString('base64url')}`;
fs.writeFileSync(pwFile, `sk3 test login: ${EMAIL} / ${password}\n`);
let user = db.findOne('users', (u) => u.email === EMAIL);
if (user) {
  db.remove('skill_records', (r) => r.user_id === user.id);
  db.remove('enrollments', (x) => x.user_id === user.id);
} else {
  user = db.insert('users', { email: EMAIL, display_name: 'Sam Tester', password_hash: bcrypt.hashSync(password, 10), onboarded: true, streak: 0, xp: 0 });
}
db.update('users', user.id, { age_check: { needs_parent: false, at: new Date().toISOString(), source: 'skills round 3 click-through seed' } });
function enroll(track, gradeId, level, extra = {}) {
  const grade = curriculum.getGrade(track, gradeId);
  const final = grade.levels.find((l) => l.kind === 'graduation').level;
  const lvl = level === 'final' ? final : level;
  return db.insert('enrollments', { user_id: user.id, track_id: track, grade_id: gradeId, target_level: grade.pathLength, current_level: lvl, level_items: 0, levels_completed: lvl - 1, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date(Date.now() - 60 * DAY).toISOString(), ...extra });
}
const sit = (subject, metricId, daysAgo, pass, source) => record.sit(user.id, { subject, metricId, pass, source, at: Date.now() - daysAgo * DAY });
const warm = (subject, metricId, daysAgo, atTarget) => record.practise(user.id, { subject, metricId, atTarget, at: Date.now() - daysAgo * DAY });

// 1. Chess Rules Learner at its Final: one check proven (waiting on retention), one with a pass yesterday.
const chess = enroll('chess', 'chess_rules_learner', 'final');
sit('chess', 'CH1:check_mate_stalemate_id', 4.1, true, 'board');
sit('chess', 'CH1:check_mate_stalemate_id', 3.1, true, 'board');
sit('chess', 'CH1:mate_in_1_unannounced', 1.2, true, 'board');
// 2. Piano Keyboard Explorer, mid-path: warm sets say finding keys is ready, so the plan calls its test early.
const piano = enroll('piano', 'piano_keyboard_explorer', 40);
for (const d of [3, 2.5, 2]) warm('piano', 'PI0:find_keys', d, true);
warm('piano', 'PI0:steady_beat', 2, false);
// 3. Basketball Mini Starter at its Final: lay-ups counted once, cold, yesterday.
const bb = enroll('basketball', 'basketball_mini_starter', 'final');
sit('basketball', 'BB1:layup_both_hands', 1.1, true, 'count');
// 4. Piano Pre-Reader: the Final passed, graduation held by the stage gate.
const held = enroll('piano', 'piano_pre_reader', 'final', { skill_held_at: new Date().toISOString() });
sit('piano', 'PI1:five_finger', 3.2, true, 'midi');
sit('piano', 'PI1:five_finger', 2.2, true, 'midi');
sit('piano', 'PI1:piece', 2.2, true, 'mic');
db.flush && db.flush();
console.log(JSON.stringify({ user: user.id, chess: chess.id, piano: piano.id, basketball: bb.id, held: held.id }));
setTimeout(() => process.exit(0), 2000);
