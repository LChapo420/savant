// Seed a click-through learner into the UI test DB copy (db.uitest.r3.json), on the
// round-3 scratch app (all patches applied). Run before the test server starts.
// node seed-ui.js <app> <db>
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const [, , APP, DBFILE] = process.argv;
process.env.DB_FILE = DBFILE;
for (const k of Object.keys(process.env)) if (/KEY|TOKEN|SECRET_API|WORKSPACE/.test(k)) process.env[k] = '';
const req = (m) => require(path.join(APP, m));
const db = req('config/db');
const curriculum = req('config/curriculum');
const coverage = req('services/coverage');
const bank = req('content/bank');
const bcrypt = req('node_modules/bcryptjs');
const DAY = coverage.DAY;

const EMAIL = 'r3-tester@example.test';
const pwFile = path.join(__dirname, 'r3-login.txt');
const password = fs.existsSync(pwFile) ? fs.readFileSync(pwFile, 'utf8').split('\n')[1].trim() : `r3-${crypto.randomBytes(9).toString('base64url')}`;
fs.writeFileSync(pwFile, `${EMAIL}\n${password}\n`);

let user = db.findOne('users', (u) => u.email === EMAIL);
if (user) {
  for (const e of db.find('enrollments', (x) => x.user_id === user.id)) {
    db.remove('items', (i) => i.user_id === user.id);
    db.remove('sessions', (s) => s.user_id === user.id);
    db.remove('remediations', (r) => r.user_id === user.id);
    db.remove('enrollments', (x) => x.id === e.id);
  }
} else {
  user = db.insert('users', { email: EMAIL, display_name: 'Rae Tester', password_hash: bcrypt.hashSync(password, 10), onboarded: true, streak: 0, xp: 0 });
}

// An adult test account: the age screen is answered on the record, not through the form.
db.update('users', user.id, { age_check: { needs_parent: false, at: new Date().toISOString(), source: 'round3 click-through seed' } });

function enroll(track, gradeId, level, extra = {}) {
  const grade = curriculum.getGrade(track, gradeId);
  const enrollment = db.insert('enrollments', {
    user_id: user.id, track_id: track, grade_id: gradeId, target_level: grade.pathLength, current_level: level,
    level_items: 0, levels_completed: level - 1, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date(Date.now() - 90 * DAY).toISOString(), ...extra,
  });
  const session = db.insert('sessions', {
    user_id: user.id, enrollment_id: enrollment.id, track_id: track, grade_id: gradeId, level: 1, kind: 'lesson',
    blocks: [{ index: 0, level: 1, kind: 'practice', resolved: true }], started_at: new Date(Date.now() - 90 * DAY).toISOString(), ended_at: new Date(Date.now() - 1 * DAY).toISOString(),
  });
  return { enrollment, session, model: coverage.modelFor(track, gradeId), grade };
}
function answer(w, i, daysAgo, correct = true, choices = null) {
  const o = w.model.objectives[i];
  db.insert('items', {
    user_id: user.id, session_id: w.session.id, skill_id: o.skill, difficulty: 3, format: choices ? 'multiple_choice' : 'short_answer',
    prompt: `seed ${o.id} ${daysAgo}`, answer: '1', choices, role: 'check', level: o.lesson_level, block: 0, index: 0,
    user_answer: correct ? '1' : '2', correct, ms: 8000, coach_used: false, answered_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
  });
}
const prove = (w, i, d) => { for (let k = 0; k < 5; k++) answer(w, i, d - k * 0.002); };
const keep = (w, i, p, c) => { prove(w, i, p); answer(w, i, c); };
const lapse = (w, i, p, c) => { prove(w, i, p); answer(w, i, c, false, ['1', '2', '3', '4']); };
const finalOf = (w) => w.grade.levels.find((l) => l.kind === 'graduation').level;

/** A checkpoint sitting with `n` bank questions; the first `answered` of them already answered (right). */
function sitting(w, kind, level, n, answered = 0, wrong = 0) {
  const s = db.insert('sessions', {
    user_id: user.id, enrollment_id: w.enrollment.id, track_id: w.enrollment.track_id, grade_id: w.enrollment.grade_id, level, start_level: level, end_level: level,
    levels: [level], kind, blocks: [{ index: 0, level, kind, resolved: false }], params: {}, started_at: new Date().toISOString(), ended_at: answered === n ? new Date().toISOString() : null,
    preview: false, score: null, analysis: null, xp_awarded: 0,
  });
  const avoid = new Set();
  const skills = w.grade.skills;
  for (let i = 0; i < n; i++) {
    const q = bank.generate({ skillId: skills[i % skills.length], difficulty: 3, seed: `ui${kind}${i}`, avoid });
    avoid.add(bank.itemKey(q));
    const done = i < answered;
    db.insert('items', {
      ...q, session_id: s.id, user_id: user.id, role: 'exam', level, block: 0, index: i,
      user_answer: done ? (i < wrong ? 'x' : q.answer) : null, correct: done ? i >= wrong : null, ms: done ? 7000 : null, coach_used: false,
      answered_at: done ? new Date().toISOString() : undefined,
    });
  }
  return s;
}

// 1. Numbers to 10, on a practice level: a daily review is due.
const e1 = enroll('math', 'numbers_to_10', 41);
[0, 1, 2].forEach((i) => keep(e1, i, 60, 58));
[3, 4].forEach((i) => prove(e1, i, 2));
lapse(e1, 5, 9, 3);
[6, 7].forEach((i) => keep(e1, i, 5, 3));

// 2. Counting and comparing, on the Final, recently kept: consolidation runs.
const e2 = enroll('math', 'counting_and_comparing', 0);
db.update('enrollments', e2.enrollment.id, { current_level: finalOf(e2), levels_completed: finalOf(e2) - 1 });
e2.model.objectives.forEach((o, i) => keep(e2, i, 4, 2));

// 3. Sense of quantity, a missed Final: record-based remediation.
const e3 = enroll('math', 'sense_of_quantity', 0);
db.update('enrollments', e3.enrollment.id, { current_level: finalOf(e3), levels_completed: finalOf(e3) - 1, checkpoint_attempts: 1 });
e3.model.objectives.forEach((o, i) => { if (i === 1) lapse(e3, i, 30, 20); else if (i === 2) { /* never proven */ } else keep(e3, i, 90, 85); });
const missed = sitting(e3, 'graduation', finalOf(e3), 12, 12, 3);
process.env.ADAPT_REMEDIATION = 'on';
req('services/remediation').open({ userId: user.id, session: missed, enrollment: db.byId('enrollments', e3.enrollment.id), kind: 'graduation', accuracy: 0.75, required: 0.9 });

// 4. Reading foundations, on the Final with an open sitting one answer from passing: held at graduation.
const e4 = enroll('reading', 'foundations', 0);
db.update('enrollments', e4.enrollment.id, { current_level: finalOf(e4), levels_completed: finalOf(e4) - 1 });
e4.model.objectives.forEach((o, i) => { if (i % 5 === 0) prove(e4, i, 0.3); else if (i % 7 === 0) { /* never proven */ } else keep(e4, i, 10, 6); });
sitting(e4, 'graduation', finalOf(e4), 10, 9, 0);

// 5. Reading early decoder, on a Master quiz with an open sitting: too fast to count.
const e5 = enroll('reading', 'early_decoder', 0);
const master = e5.grade.levels.find((l) => l.kind === 'master').level;
db.update('enrollments', e5.enrollment.id, { current_level: master, levels_completed: master - 1 });
sitting(e5, 'master', master, 8, 0, 0);

db.flush && db.flush();
console.log(JSON.stringify({ user: user.id, review: e1.enrollment.id, consolidation: e2.enrollment.id, remediation: e3.enrollment.id, held: e4.enrollment.id, toofast: e5.enrollment.id }));
setTimeout(() => process.exit(0), 3000);
