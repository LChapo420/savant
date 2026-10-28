#!/usr/bin/env node
/**
 * The reviewer demo account: one learner with realistic progress, so someone
 * reviewing Savant (a YC partner, an investor) can sign in and see the product in
 * two minutes instead of starting from an empty account.
 *
 *   node scripts/seed-demo-account.js --data <db.json> [--dry-run] [--offline] [--new-password] [--login-file <path>]
 *
 * What it makes, through the same services a real learner's work goes through:
 *   - an adult learner ("Riley (demo account)") on the pro plan, About-you survey
 *     and style quiz filled in;
 *   - two subjects, Algebra 1 (part A) and ACT Prep (Building Toward the
 *     Benchmarks), each with its placement quiz taken and scored by the real
 *     placement scorer (services/placement.js);
 *   - two sittings in each subject, played through services/sessions.js and graded
 *     by the app's grader, and feedback on one level;
 *   - a short conversation with the tutor through services/tutor.js. With model
 *     keys in the environment the replies are the live tutor's; without them (or
 *     with --offline) they are the tutor's own offline reply, which says so.
 *
 * The account is flagged `is_demo: true`, `account_kind: 'demo'`, so the real-user
 * metrics never count it (services/real-user-metrics.js), and it carries
 * `beta_tester` so the invite-only login gate lets it in.
 *
 * Safety:
 *   - The data file is copied to <file>.before-demo-<UTC stamp>.bak first.
 *   - The login (email and a fresh random password) is written ONLY to the login
 *     file (default .demo-account.local.txt at the repo root, gitignored, mode
 *     0600). It is never printed and never committed.
 *   - Running it again changes nothing if the demo account exists (it is found by
 *     its `demo_key`); --new-password sets a new password and rewrites the login
 *     file, and a missing login file gets a new password the same way.
 *   - --dry-run writes nothing at all (no backup, no data, no login file) and makes
 *     no model calls; it reports what it would create.
 *   - Stop the app before running it: the server holds the data file in memory and
 *     would overwrite these writes on its next save. The script refuses to run
 *     while something answers on http://127.0.0.1:$PORT/api/health (--force skips
 *     that check, for a server running on a different data file).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DEMO_KEY = 'yc-reviewer';
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
function arg(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

const dataArg = arg('--data');
if (!dataArg) {
  console.error('usage: node scripts/seed-demo-account.js --data <db.json> [--dry-run] [--offline] [--new-password] [--login-file <path>] [--force]');
  process.exit(2);
}
const DATA = path.resolve(dataArg);
const DRY = flag('--dry-run');
const OFFLINE = DRY || flag('--offline');
const LOGIN_FILE = path.resolve(arg('--login-file') || path.join(ROOT, '.demo-account.local.txt'));

if (!fs.existsSync(DATA)) {
  console.error(`No data file at ${DATA}. Start the app once on it (it creates an empty store), stop it, then run this.`);
  process.exit(2);
}
try { JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (err) {
  console.error(`${DATA} is not readable JSON (${err.message}); nothing was changed.`);
  process.exit(2);
}

// Point the app's modules at this file before any of them loads.
process.env.DB_FILE = DATA;
if (DRY) process.env.DB_READONLY = '1';
else delete process.env.DB_READONLY;
require('dotenv').config();
if (OFFLINE) {
  // No model is called: every key-shaped variable is blanked before a provider reads it.
  for (const k of Object.keys(process.env)) if (/(_API_KEY|_KEY|_TOKEN)$/.test(k)) process.env[k] = '';
  process.env.OLLAMA_ENABLED = '0';
}

/** A small seeded random source, so the same run makes the same sample. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261102);

async function serverAnswering() {
  const port = Number(process.env.PORT || 6767);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? port : null;
  } catch {
    return null;
  }
}

function writeLogin(email, password) {
  const text = [
    '# Savant reviewer demo account. LOCAL ONLY: never commit, paste or screenshot this file.',
    `# Written ${new Date().toISOString()} by scripts/seed-demo-account.js for ${DATA}`,
    `email: ${email}`,
    `password: ${password}`,
    '# Sign in at <the app>/login. To make a new password: node scripts/seed-demo-account.js --data <file> --new-password',
    '',
  ].join('\n');
  fs.writeFileSync(LOGIN_FILE, text, { mode: 0o600 });
  try { fs.chmodSync(LOGIN_FILE, 0o600); } catch { /* Windows */ }
}

const newPassword = () => crypto.randomBytes(15).toString('base64url');

(async () => {
  if (!DRY && !flag('--force')) {
    const port = await serverAnswering();
    if (port) {
      console.error(`Something is answering on port ${port}. Stop the app first: it would overwrite these changes on its next save. (--force if that server uses a different data file.)`);
      process.exit(3);
    }
  }

  const bcrypt = require('bcryptjs');
  const db = require('../config/db');
  const curriculum = require('../config/curriculum');
  const sessions = require('../services/sessions');
  const placement = require('../services/placement');
  const grading = require('../services/grading');
  const learner = require('../services/learner');
  const scorecard = require('../services/scorecard');
  const hooks = require('../services/scorecard/hooks');
  const tutor = require('../services/tutor');
  const ai = require('../services/ai');
  const { evaluateAge } = require('../routes/consent');

  // ── already there? ─────────────────────────────────────────────────────────
  const existing = db.findOne('users', (u) => u.demo_key === DEMO_KEY);
  if (existing) {
    const counts = {
      subjects: db.find('enrollments', (e) => e.user_id === existing.id).length,
      sittings: db.find('sessions', (s) => s.user_id === existing.id).length,
    };
    const needLogin = flag('--new-password') || !fs.existsSync(LOGIN_FILE);
    console.log(`The demo account already exists (user #${existing.id}, ${counts.subjects} subjects, ${counts.sittings} sittings). Its progress is left as it is.`);
    if (!needLogin) {
      console.log(`Its login is in ${LOGIN_FILE}.`);
      return;
    }
    if (DRY) { console.log('Dry run: would set a new password and write the login file.'); return; }
    backup();
    const password = newPassword();
    db.update('users', existing.id, { password_hash: await bcrypt.hash(password, 10) });
    db.flush();
    writeLogin(existing.email, password);
    backup.done = true;
    console.log(`New password set. The login is in ${LOGIN_FILE} (not shown here).`);
    return;
  }

  if (!DRY) backup();

  // ── the account ────────────────────────────────────────────────────────────
  const email = `riley.${crypto.randomBytes(3).toString('hex')}@demo.savantedu.test`;
  const password = newPassword();
  const now = new Date();
  const age = evaluateAge({ birth_year: now.getUTCFullYear() - 18, birth_month: 1, country: 'US' }).check;
  const user = db.insert('users', {
    email,
    display_name: 'Riley (demo account)',
    password_hash: await bcrypt.hash(password, 10),
    xp: 0,
    streak: 0,
    last_active_day: null,
    onboarded: true,
    age_check: { ...age, asked_on: 'demo_seed' },
    account_type: 'standard',
    // Never a real user: services/real-user-metrics.js leaves flagged accounts out.
    is_demo: true,
    account_kind: 'demo',
    demo_key: DEMO_KEY,
    demo_note: 'Reviewer demo account made by scripts/seed-demo-account.js; sample learner, not a real person.',
    // The invite-only login gate (middleware/beta-gate.js) lets beta testers in.
    beta_tester: { invite_id: null, since: now.toISOString(), demo: true },
  });
  const style = { example_order: 0.8, explanation_depth: 0.4, session_pacing: 0.5, challenge_appetite: 0.7, retrieval_style: 0.6 };
  learner.saveProfile(user.id, {
    style_vector: style,
    took_style_quiz: true,
    style_quiz_at: now.toISOString(),
    survey: learner.cleanSurvey({
      interests: 'Basketball analytics, video editing, space launches',
      studying: 'Raising my ACT math score and getting solid at Algebra 1 before senior year',
      hobbies: 'Editing highlight videos, pickup basketball',
      sports: 'Basketball',
      notes: 'Show me one example first, then let me try. Timed practice makes me rush.',
    }),
    survey_at: now.toISOString(),
    subscription: 'pro',
  });
  scorecard.seedFromStyleQuiz(user.id, style);

  // ── two subjects, each placed by its placement quiz ────────────────────────
  const SUBJECTS = [
    { track: 'math', grade: 'algebra_1_part_a', skill: 0.8 },
    { track: 'act', grade: 'act_grade_5', skill: 0.7 },
  ];
  const placed = [];
  for (const spec of SUBJECTS) {
    const grade = curriculum.getGrade(spec.track, spec.grade);
    if (!grade) throw new Error(`this app has no ${spec.track}/${spec.grade}`);
    const enrollment = db.insert('enrollments', {
      user_id: user.id,
      track_id: spec.track,
      grade_id: spec.grade,
      target_level: grade.pathLength,
      current_level: 1,
      level_items: 0,
      levels_completed: 0,
      xp: 0,
      status: 'placement_pending',
      pending_checkpoint: null,
    });
    const session = db.insert('sessions', {
      user_id: user.id, enrollment_id: enrollment.id, track_id: spec.track, grade_id: spec.grade,
      level: 0, kind: 'placement', started_at: new Date().toISOString(), ended_at: null, score: null, analysis: null, xp_awarded: 0,
    });
    // The quiz as routes/placement.js serves it, answered the way a learner of this
    // strength would: harder questions are missed more often.
    const items = placement.buildItems(grade).map((item, index) => {
      const pRight = Math.max(0.15, Math.min(0.97, spec.skill + 0.25 - 0.08 * (Number(item.difficulty) || 5)));
      const right = rand() < pRight;
      const wrong = (item.choices || []).find((c) => c !== item.answer) || 'not sure';
      const answer = right ? item.answer : wrong;
      const verdict = grading.grade(item, answer);
      return db.insert('items', {
        ...item, session_id: session.id, user_id: user.id, role: 'placement', index,
        user_answer: String(answer), correct: verdict.correct, ms: Math.round(9000 + rand() * 30000),
      });
    });
    const result = placement.score(items, grade);
    placement.seedSkillStates(user.id, result);
    db.update('sessions', session.id, {
      ended_at: new Date().toISOString(),
      score: result.overall,
      analysis: {
        ...result,
        skills: result.skills.map((s) => ({ ...s, name: curriculum.skillName(s.skill_id) })),
        gaps: result.gaps.map((id) => ({ id, name: curriculum.skillName(id) })),
        strengths: result.strengths.map((id) => ({ id, name: curriculum.skillName(id) })),
        track_name: curriculum.getTrack(spec.track).name,
        grade_name: grade.name,
        path_length: grade.pathLength,
      },
    });
    db.update('enrollments', enrollment.id, {
      status: 'active', current_level: result.placedLevel, level_items: 0,
      placed_at: new Date().toISOString(), placement_session_id: session.id,
    });
    hooks.onPlacement(user.id, { trackId: spec.track, placedLevel: result.placedLevel, pathLength: grade.pathLength });
    placed.push({ spec, grade, enrollmentId: enrollment.id, level: result.placedLevel, overall: result.overall });
  }

  // ── sittings ───────────────────────────────────────────────────────────────
  async function playBlock(session, items, accuracy) {
    for (const [n, item] of items.entries()) {
      if (item.correct !== null && item.correct !== undefined) continue;
      const right = rand() < accuracy;
      let answer = right ? item.answer : 'not sure';
      if (!right && item.choices) answer = item.choices.find((c) => c !== item.answer) || answer;
      // eslint-disable-next-line no-await-in-loop
      await sessions.answer({
        userId: user.id, session, itemId: item.id, userAnswer: answer,
        ms: Math.round((7000 + (item.difficulty || 5) * 1500) * (0.7 + rand() * 0.6)),
        confidence: n % 3 === 1 ? (right ? 'sure' : 'think') : null,
        changes: 0,
      });
    }
  }
  async function sitting(p, accuracy) {
    const opened = await sessions.createSession({ userId: user.id, enrollment: db.byId('enrollments', p.enrollmentId), grade: p.grade });
    let session = opened.session;
    let items = opened.items || [];
    for (let block = 0; block < 2; block++) {
      await playBlock(session, items, accuracy);
      const fresh = db.byId('sessions', session.id);
      sessions.resolveBlock({ userId: user.id, session: fresh, enrollment: db.byId('enrollments', p.enrollmentId), grade: p.grade, blockIndex: (fresh.blocks || []).length - 1 });
      const after = db.byId('enrollments', p.enrollmentId);
      if (block === 1 || after.pending_checkpoint || curriculum.levelKind(after.current_level, p.grade.pathLength, p.grade) !== 'practice') break;
      const next = await sessions.addBlock({ userId: user.id, session: db.byId('sessions', session.id), enrollment: after, grade: p.grade });
      session = next.session;
      items = next.items || [];
    }
    await sessions.finish({ userId: user.id, session: db.byId('sessions', session.id) });
  }
  for (const p of placed) {
    // A lesson level has no questions to play, so start on the first practice level at or after the placement.
    let level = p.level;
    while (level < p.grade.pathLength - 2 && curriculum.levelKind(level, p.grade.pathLength, p.grade) !== 'practice') level++;
    db.update('enrollments', p.enrollmentId, { current_level: level });
    for (const accuracy of [0.72, 0.84]) await sitting(p, accuracy); // eslint-disable-line no-await-in-loop
  }

  // Feedback on one level, as the after-level form records it.
  const fb = placed[1];
  const fbLevel = Math.max(1, db.byId('enrollments', fb.enrollmentId).current_level - 1);
  const feedback = { pace: 'right', length: 'right', difficulty: 'hard', liked: 'The worked example before the timed set', disliked: 'The last two questions felt rushed' };
  db.insert('level_feedback', {
    user_id: user.id, track_id: fb.spec.track, grade_id: fb.spec.grade, level: fbLevel,
    kind: curriculum.levelKind(fbLevel, fb.grade.pathLength, fb.grade), ...feedback, submitted_at: new Date().toISOString(),
  });
  hooks.onFeedback(user.id, { trackId: fb.spec.track, gradeId: fb.spec.grade, level: fbLevel, ...feedback });

  // ── the tutor ──────────────────────────────────────────────────────────────
  const said = [
    'Hi! I have the ACT in December. What should I work on first?',
    'I keep running out of time on the math section. How should I practise that?',
  ];
  let tutorSource = 'none';
  const history = [];
  for (const line of said) {
    history.push({ role: 'user', content: line });
    let out;
    // eslint-disable-next-line no-await-in-loop
    try { out = await tutor.chat({ user: db.byId('users', user.id), messages: history, where: 'home' }); } catch {
      out = { reply: tutor.offlineReply(user.id), source: 'fallback' };
      tutor.note(user.id, { where: 'home', learnerSaid: line, tutorSaid: out.reply });
    }
    history.push({ role: 'assistant', content: out.reply });
    tutorSource = out.source;
  }

  // Background work a sitting starts (prefetching the next level) settles before the save.
  await new Promise((r) => setTimeout(r, 500));
  if (!DRY) {
    db.flush();
    writeLogin(email, password);
    backup.done = true;
  }

  const mine = (name) => db.find(name, (r) => r.user_id === user.id).length;
  console.log(`${DRY ? 'Dry run (nothing written): would create' : 'Created'} the reviewer demo account (user #${user.id}, flagged demo):`);
  for (const p of placed) {
    const e = db.byId('enrollments', p.enrollmentId);
    console.log(`  ${curriculum.getTrack(p.spec.track).name} · ${p.grade.name}: placement ${Math.round(p.overall * 100)}%, placed at level ${p.level}, now level ${e.current_level}`);
  }
  const answered = db.find('items', (i) => i.user_id === user.id && i.correct !== null && i.correct !== undefined).length;
  console.log(`  ${mine('sessions')} sittings (incl. 2 placements), ${answered} questions answered, ${mine('level_feedback')} level feedback`);
  console.log(`  tutor: ${history.length / 2} exchanges (${tutorSource === 'ai' ? 'live tutor replies' : 'the tutor\'s offline reply; run without --offline and with model keys for live replies'})`);
  console.log(`  model calls: ${OFFLINE ? 'none (offline)' : ai.isEnabled() ? 'allowed (keys present)' : 'none (no keys set)'}`);
  const ignoredHere = path.dirname(LOGIN_FILE) === ROOT && /^\.demo-account.*\.local\.txt$/.test(path.basename(LOGIN_FILE));
  if (!DRY) console.log(`The login is in ${LOGIN_FILE} (not shown here${ignoredHere ? '; gitignored' : ''}). Backup of the data file: ${backup.file}`);
})().then(() => process.exit(0)).catch((err) => {
  console.error('demo account seed failed:', err && err.stack ? err.stack : err);
  console.error(backup.file ? `The data file is put back from ${backup.file}; nothing was changed.` : 'Nothing was written.');
  process.exit(1);
});

/**
 * Copy the data file aside before the first write. Until the run finishes cleanly,
 * any exit (an error, Ctrl-C, a kill) puts the copy back: config/db.js saves the
 * store on exit, and this handler is registered after its own, so it runs last.
 */
function backup() {
  if (backup.file) return backup.file;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  backup.file = `${DATA}.before-demo-${stamp}.bak`;
  fs.copyFileSync(DATA, backup.file, fs.constants.COPYFILE_EXCL);
  process.on('exit', () => {
    if (!backup.done) fs.copyFileSync(backup.file, DATA);
  });
  return backup.file;
}
