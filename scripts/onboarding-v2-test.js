/**
 * Onboarding v2, over HTTP on a throwaway copy of the store (docs/ONBOARDING-V2.md). Starts its own server twice: switch off, then on.
 *
 *   node scripts/onboarding-v2-test.js
 *
 * Checks: off means nothing new is reachable; a guest has no outside-AI, upload or boosters access; a walk, an enrollment and goals survive a
 * failed and then a good claim on the same row; a child gives no email and gets the consent request first; export and deletion cover the new
 * data; an existing account is not sent through the flow; the pre-written examples are complete; a level check with too little to go on starts a
 * teen or adult at their age, and real answers (and really young learners) keep the low level; the goal line is plain for every goal.
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob2-'));
const dbFile = path.join(dir, 'db.json');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ok ${name}`); };
const ob2Version = fs.readFileSync(path.join(ROOT, 'services/onboarding-v2.js'), 'utf8').match(/AGREEMENT_VERSION = '([^']+)'/)[1];

function client(base) {
  let cookie = '';
  return async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}

async function server(port, env) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DB_FILE: dbFile, NODE_ENV: 'test', CONSENT_SWEEP: 'off', SESSION_SECRET: 'x'.repeat(40), MAIL_TRANSPORT: 'console', ...env },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  for (let i = 0; i < 120; i += 1) {
    try { const r = await fetch(`http://localhost:${port}/api/health`); if (r.status < 500) return child; } catch { /* not up yet */ }
    await delay(500);
  }
  child.kill();
  throw new Error('server did not start');
}
const stop = (child) => new Promise((r) => { child.on('exit', r); child.kill(); });

function contentChecks() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/js/start-content.js'), 'utf8'), sandbox);
  const C = sandbox.window.ObContent;
  process.env.DB_FILE = dbFile;
  process.env.CONSENT_SWEEP = 'off';
  const keys = Object.keys(require('../services/onboarding-v2').INTERESTS).sort(); // eslint-disable-line global-require
  assert.deepEqual([...C.INTERESTS.map((i) => i.id)].sort(), keys, 'the page and the server list the same interests');
  for (const [name, idea] of Object.entries(C.IDEAS)) {
    for (const k of keys) assert.ok(idea.examples[k], `${name} has ${k}`);
    assert.equal(Object.keys(idea.examples).length, keys.length, `${name} has nothing extra`);
  }
  for (const k of keys) {
    const t = C.IDEAS.fractions.examples[k];
    assert.match(t, /\*\*4 /, `${k}: out of 4`);
    assert.match(t, /\*\*3\*\*/, `${k}: 3 of them`);
    assert.match(t, /\*\*3\/4\*\*/, `${k}: says 3/4`);
  }
  for (const k of keys) {
    const t = C.IDEAS.endings.examples[k];
    const [yo, tu] = [...t.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1].toLowerCase());
    assert.ok(yo.endsWith('o') && tu.endsWith('as') && yo.slice(0, -1) === tu.slice(0, -2), `${k}: regular -ar forms (${yo}, ${tu})`);
  }
  assert.equal(C.AGREEMENT.version, ob2Version, 'the words and the version move together');
  const all = JSON.stringify(C).toLowerCase();
  assert.ok(!all.includes('learning style'), 'no "learning styles"');
  ok('pre-written examples: every interest, every idea, the sums and the verb forms');
}

/** A birth month and year that make this age today, in any month of the year. */
function bornAged(age) {
  const now = new Date();
  return now.getUTCMonth() === 0
    ? { birth_month: 12, birth_year: now.getUTCFullYear() - age - 1 }
    : { birth_month: 1, birth_year: now.getUTCFullYear() - age };
}

/**
 * One learner through the real check over HTTP, as the page does it: age, agreement (or the parent's email), then the Quick walk.
 * `how` is 'right', 'wrong' or 'idk' ("I don't know" sends an empty answer), or a function of the answer's number. `stop` presses "Stop here" after that many.
 */
async function walkAs(base, { age, how, stop = null, track = 'math', retakeBy = null }) {
  const sp = require('../services/subject-placement'); // eslint-disable-line global-require
  const who = retakeBy || client(base);
  const route = retakeBy ? null : (await who('POST', '/api/consent/age', { ...bornAged(age), country: 'US' })).data.route;
  if (retakeBy) {
    // the same learner, starting the check again
  } else if (route === 'self') {
    assert.equal((await who('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version })).status, 201);
    await who('POST', '/api/ob2/begin', { answers: { tracks: [track] } });
  } else {
    assert.equal((await who('POST', '/api/ob2/begin', { nickname: 'Sam', parent_email: 'parent@example.test', answers: { tracks: [track] } })).status, 201);
  }
  const say = (grade, q, n) => {
    const kind = typeof how === 'function' ? how(n) : how;
    if (kind === 'idk') return '';
    const stored = sp.questionsFor(track, grade)[q.index];
    return kind === 'right' ? stored.answer : (q.choices || []).find((c) => c !== stored.answer) || 'not this';
  };
  const path = (rest) => `/api/subject-placement/${track}/${rest}`;
  let out = (await who('POST', path('start'), { mode: 'quick', restart: !!retakeBy })).data;
  let grade = out.grade_id;
  let n = 0;
  for (;;) {
    const given = [];
    for (const q of out.questions) {
      if (stop != null && n >= stop) return { who, asked: n, result: (await who('POST', path('quit'), { grade_id: grade, answers: given })).data };
      given.push({ index: q.index, answer: say(grade, q, n) });
      n += 1;
    }
    const handed = (await who('POST', path('grade'), { grade_id: grade, answers: given })).data;
    if (stop != null && n >= stop && handed.next_grade_id) return { who, asked: n, result: (await who('POST', path('quit'), { grade_id: handed.next_grade_id, answers: [] })).data };
    if (handed.stopped || !handed.next_grade_id) return { who, asked: n, result: (await who('POST', path('finish'), {})).data };
    out = handed;
    grade = handed.next_grade_id;
  }
}

async function startingLevelChecks(base) {
  const FIRST = 'sense_of_quantity'; // Math, Preschool, ages 3-4
  const ALGEBRA = 'algebra_1_part_a'; // Math, 9th Grade: where age alone starts an adult
  const check = async (what, opts, expected, fromAge) => {
    const out = await walkAs(base, opts);
    assert.equal(out.result.recommended_grade_id, expected, `${what}: placed at ${out.result.recommended_grade_name} after ${out.asked}`);
    assert.equal(out.result.from_age, fromAge, `${what}: says whether age placed them`);
    return out;
  };

  // The screenshot's path: an adult, a few answers, "Stop here and see my level".
  const stopped = await check('adult, 3 wrong, stop', { age: 36, how: 'wrong', stop: 3 }, ALGEBRA, true);
  assert.equal(stopped.result.walk_grade_id, FIRST, 'what the walk found stays on the record');
  const opened = await stopped.who('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: stopped.result.recommended_grade_id });
  assert.ok(!/preschool/i.test(opened.data.enrollment.grade_name), 'and the first lesson is not a preschool one');
  const harder = await stopped.who('POST', '/api/subject-placement/math/adjust', { said: 'too_hard' });
  assert.equal(harder.data.recommended_grade_id, 'transformations_pythagorean_theorem_and_data_models', '"too hard" still moves it');
  assert.equal(harder.data.from_age, false, 'and the learner\'s word replaces "based on your age"');
  await check('adult, one wrong, stop', { age: 36, how: 'wrong', stop: 1 }, ALGEBRA, true);
  await check('adult, "I don\'t know", stop', { age: 36, how: 'idk', stop: 2 }, ALGEBRA, true);
  await check('adult, "I don\'t know" until the walk ends', { age: 36, how: 'idk' }, ALGEBRA, true);
  await check('adult, one right, stop (was Senior Scholar)', { age: 36, how: 'right', stop: 1 }, ALGEBRA, true);
  await check('teen of 15, 2 wrong, stop', { age: 15, how: 'wrong', stop: 2 }, ALGEBRA, true);
  await check('teen of 13, 2 wrong, stop', { age: 13, how: 'wrong', stop: 2 }, 'exponents_linear_functions_and_systems', true);
  await check('adult in English, stop', { age: 36, how: 'wrong', stop: 2, track: 'english' }, 'proficient', true);
  ok('a teen or adult with little or no evidence starts at their age, on the same API the page uses');

  // Answers that really place someone low stand, whatever their age.
  await check('adult, wrong until the walk ends', { age: 36, how: 'wrong' }, FIRST, false);
  const someRight = await walkAs(base, { age: 36, how: (n) => (n < 4 ? 'right' : 'idk') });
  const ids = someRight.result.grades.map((g) => g.grade_id);
  assert.ok(ids.indexOf(someRight.result.recommended_grade_id) < ids.indexOf(ALGEBRA), `four right then "I don't know" stays low: ${someRight.result.recommended_grade_name}`);
  assert.equal(someRight.result.from_age, false);
  const strong = await walkAs(base, { age: 36, how: 'right' });
  assert.equal(strong.result.recommended_grade_id, 'senior_scholar', 'and all right to the end still reaches the top');
  assert.equal(strong.result.from_age, false);
  ok('real answers keep their result: an adult who gets them wrong stays low, one who gets them right goes to the top');

  // Really young learners keep the low level.
  await check('a 4-year-old, 3 wrong, stop', { age: 4, how: 'wrong', stop: 3 }, FIRST, false);
  await check('a 9-year-old, 2 wrong, stop', { age: 9, how: 'wrong', stop: 2 }, FIRST, false);
  await check('a 12-year-old, wrong to the end', { age: 12, how: 'wrong' }, FIRST, false);
  await check('an 8-year-old, one right, stop (was Senior Scholar)', { age: 8, how: 'right', stop: 1 }, 'multiplication_and_division', true);
  ok('under 13: a low result stays; one lucky answer no longer jumps past their age');

  // Subjects with no school years aren't tied to age: a beginner at any age starts at the start.
  await check('adult beginner in Spanish, stop', { age: 36, how: 'idk', stop: 2, track: 'spanish' }, 'entry', false);
  const ob = require('../services/onboarding-v2'); // eslint-disable-line global-require
  for (const t of ['iq', 'act', 'chess', 'piano', 'basketball', 'spanish']) assert.equal(ob.gradeForAge(t, 36), null, `${t} is not tied to age`);
  assert.equal(ob.gradeForAge('reading', 36), 'proficient_reader');
  assert.equal(ob.gradeForAge('math', 4), FIRST);
  // A retake with real answers takes "based on your age" away again.
  const retake = await walkAs(base, { how: 'wrong', retakeBy: stopped.who });
  assert.equal(retake.result.recommended_grade_id, FIRST);
  assert.equal(retake.result.from_age, false);
  // A learner's own pick is theirs.
  const own = await stopped.who('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: FIRST });
  assert.equal(own.data.enrollment.grade_id, FIRST);
  ok('Spanish beginners start at the start, and picking a grade by hand still works');
}

function goalWordingChecks() {
  const goals = require('../services/retention-goal'); // eslint-disable-line global-require
  const today = '2026-11-07';
  const line = (goal) => goals.plainGoal(goals.effective({ set_on: today, ...goal }, today));
  const lines = {
    months: line({ horizon: 'months' }),
    year: line({ horizon: 'year' }),
    years: line({ horizon: 'years' }),
    forever: line({ horizon: 'forever' }),
    date: line({ horizon: 'date', test_date: '2027-02-06' }),
    tomorrow: line({ horizon: 'date', test_date: '2026-11-08' }),
    today: line({ horizon: 'date', test_date: today }),
  };
  assert.equal(lines.year, 'Your reviews are timed to help you remember this for a year after you finish.');
  assert.equal(lines.months, 'Your reviews are timed to help you remember this for a few months after you finish.');
  assert.equal(lines.years, 'Your reviews are timed to help you remember this for about three years after you finish.');
  assert.equal(lines.forever, 'Your reviews keep coming back over time to help you remember this for good.');
  assert.equal(lines.date, 'Your reviews are planned around your test on February 6, 2027, with a last one the day before and a short one on the day.');
  for (const [name, text] of Object.entries(lines)) {
    assert.equal((text.match(/[.!?]/g) || []).length, 1, `${name}: one sentence: ${text}`);
    assert.ok(!/dropped|long-term|schedule\b.*helps|semi-weekly|bi-weekly|compressed/i.test(text), `${name}: no calendar talk: ${text}`);
  }
  // The same line reaches the settings page, where a goal drops nothing.
  assert.equal(goals.describe(goals.effective({ set_on: today, horizon: 'year' }, today)).text, lines.year);
  assert.deepEqual(goals.describe(goals.effective({ set_on: today, horizon: 'year' }, today)).dropped, []);
  ok('goal line: one plain sentence for every goal');
}

async function main() {
  if (fs.existsSync(path.join(ROOT, 'data', 'db.json'))) fs.copyFileSync(path.join(ROOT, 'data', 'db.json'), dbFile);
  contentChecks();
  goalWordingChecks();

  // ── off ──
  let child = await server(6891, { ONBOARDING_V2: '' });
  let base = 'http://localhost:6891';
  let c = client(base);
  assert.equal((await c('GET', '/api/ob2/state')).status, 404);
  assert.equal((await c('GET', '/register')).status, 200);
  const offStart = await c('GET', '/start');
  assert.ok(String(offStart.data).includes('<') && !String(offStart.data).includes('start.js'), 'off: /start is not the new page');
  ok('off: API 404, /register is today\'s page, /start is not the new page');
  await stop(child);

  // ── on ──
  child = await server(6892, { ONBOARDING_V2: 'on' });
  base = 'http://localhost:6892';
  c = client(base);
  const reg = await c('GET', '/register?ref=abcd1234&track=act');
  assert.equal(reg.status, 302);
  assert.equal(reg.headers.get('location'), '/start?ref=abcd1234&track=act');
  ok('on: /register goes to /start and keeps the query');

  assert.equal((await c('POST', '/api/ob2/begin', { answers: {} })).status, 400, 'no age answer, no guest');
  const adultAge = await c('POST', '/api/consent/age', { birth_month: 3, birth_year: 1990, country: 'US' });
  assert.equal(adultAge.data.route, 'self');
  const secondAnswer = await c('POST', '/api/consent/age', { birth_month: 3, birth_year: 2020, country: 'US' });
  assert.equal(secondAnswer.data.route, 'self');
  assert.equal(secondAnswer.data.locked, true);
  ok('age: same endpoint, first answer stands');

  // Nothing exists until they choose, and only agreeing goes on.
  assert.equal((await c('POST', '/api/ob2/begin', { answers: {} })).data.code, 'agreement_needed');
  assert.equal((await c('POST', '/api/ob2/agree', { decision: 'decline', version: ob2Version })).data.code, 'no_decision');
  assert.equal((await c('POST', '/api/ob2/agree', { version: ob2Version })).data.code, 'no_decision');
  assert.equal((await c('GET', '/api/auth/me')).data.user, null, 'declining makes no account');
  assert.equal((await c('POST', '/api/ob2/agree', { decision: 'agree', version: 'old' })).data.code, 'stale');
  const agreed = await c('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version });
  assert.equal(agreed.status, 201);
  assert.equal(agreed.data.user.guest, true);
  assert.equal(agreed.data.user.consent.state, 'full', 'an agreed guest counts as consenting');
  assert.equal(agreed.data.user.consent.ai_free_text, true);
  const begun = await c('POST', '/api/ob2/begin', { answers: { tracks: ['math', 'chess'], why: 'test', horizon: 'year', interest: 'other', interest_text: 'pottery' } });
  assert.equal(begun.status, 200);
  const early = await c('GET', '/api/profile');
  assert.ok(String(early.data.survey.interests).includes('pottery'), 'the interest reaches the lesson writers once they have agreed');
  await c('POST', '/api/ob2/answers', { interest: 'other', interest_text: 'pots and glazes' });
  const changed = await c('GET', '/api/profile');
  assert.ok(String(changed.data.survey.interests).includes('pots and glazes') && !String(changed.data.survey.interests).includes('pottery'), 'changing it replaces it');
  await c('POST', '/api/ob2/answers', { interest: 'other', interest_text: 'pottery' });
  ok('agreement: a real choice, nothing without it, and it opens tailoring for the guest');

  const started = await c('POST', '/api/subject-placement/math/start', { mode: 'quick' });
  assert.ok(started.data.questions.length > 0, 'the walk runs for a guest');
  const q = started.data.questions[0];
  await c('POST', '/api/subject-placement/math/answer', { grade_id: started.data.grade_id, index: q.index, answer: q.choices[0] });
  const quit = await c('POST', '/api/subject-placement/math/quit', { grade_id: started.data.grade_id, answers: [{ index: q.index, answer: q.choices[0] }] });
  assert.equal(quit.status, 200);
  const first = await c('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: quit.data.recommended_grade_id });
  assert.equal(first.status, 200);
  assert.ok(first.data.enrollment.href.includes(String(first.data.enrollment.id)));
  const again = await c('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: quit.data.recommended_grade_id });
  assert.equal(again.data.enrollment.id, first.data.enrollment.id, 'a double tap makes one enrollment');
  assert.equal(first.data.goal.horizon, 'year');
  assert.equal(first.data.goal.summary, 'Your reviews are timed to help you remember this for a year after you finish.');
  const state = await c('GET', '/api/ob2/state');
  assert.equal(state.data.enrollment.id, first.data.enrollment.id);
  assert.equal(state.data.answers.interest_text, 'pottery');
  ok('guest: walk, enrollment and goal are kept; a repeat is safe; state survives a reload');

  // A failed sign-up changes nothing.
  const bad = await c('POST', '/api/ob2/claim', { display_name: 'Ada', email: 'nope', password: 'longenough1' });
  assert.equal(bad.status, 400);
  const someone = client(base);
  const takenEmail = `taken-${Date.now()}@example.test`;
  await someone('POST', '/api/consent/age', { birth_month: 1, birth_year: 1980, country: 'US' });
  await someone('POST', '/api/auth/register', { email: takenEmail, password: 'longenough1', display_name: 'Someone' });
  const dup = await c('POST', '/api/ob2/claim', { display_name: 'Ada', email: takenEmail, password: 'longenough1' });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.code, 'email_taken');
  assert.equal((await c('GET', '/api/ob2/state')).data.enrollment.id, first.data.enrollment.id);
  ok('claim: bad email and taken email leave the guest and progress alone');

  const email = `ob2-${Date.now()}@example.test`;
  const claim = await c('POST', '/api/ob2/claim', { display_name: 'Ada', email, password: 'longenough1' });
  assert.equal(claim.status, 201);
  assert.ok(!claim.data.user.guest);
  assert.equal(claim.data.user.consent.state, 'full');
  const enrollments = await c('GET', '/api/enrollments');
  assert.equal(enrollments.data.enrollments.length, 1);
  assert.equal(enrollments.data.enrollments[0].id, first.data.enrollment.id);
  const profile = await c('GET', '/api/profile');
  assert.ok(String(profile.data.survey.interests).includes('pottery'), 'the interest reaches the survey once they have saved');
  const exported = await c('GET', '/api/account/export');
  assert.equal(exported.data.onboarding_answers.length, 1, 'export covers the answers');
  assert.equal(exported.data.learner_agreements.length, 1, 'export covers what was agreed');
  assert.equal(exported.data.learner_agreements[0].version, ob2Version);
  assert.ok(exported.data.learner_agreements[0].agreed_at, 'and when');
  assert.deepEqual(exported.data.learner_agreements[0].covers, ['beta_terms', 'privacy_policy', 'outside_ai']);
  assert.equal(exported.data.onboarding_answers[0].why, 'test');
  const home = await c('GET', '/api/ob2/state');
  assert.equal(home.data.account, true);
  assert.equal(home.data.go, '/dashboard');
  ok('claim: same row, progress and interest carried, exported, and the account is not sent through again');

  await c('POST', '/api/auth/logout', {});
  const back = await c('POST', '/api/auth/login', { email, password: 'longenough1' });
  assert.equal(back.status, 200);
  ok('saved account signs in with its new password');
  await c('POST', '/api/auth/logout', {});

  // A guest signing in to that account: the level check comes along if the account has none for the subject.
  const g = client(base);
  await g('POST', '/api/consent/age', { birth_month: 3, birth_year: 1991, country: 'US' });
  await g('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version });
  await g('POST', '/api/ob2/begin', { answers: { tracks: ['chess'] } });
  await g('POST', '/api/ob2/first-lesson', { track: 'chess', grade_id: 'board_explorer' }).catch(() => {});
  const grades = (await g('GET', '/api/catalog?view=grades')).data.tracks.find((t) => t.id === 'chess').grades;
  const made = await g('POST', '/api/ob2/first-lesson', { track: 'chess', grade_id: grades[0].id });
  assert.equal(made.status, 200);
  const signed = await g('POST', '/api/auth/login', { email, password: 'longenough1' });
  assert.equal(signed.status, 200);
  const list = (await g('GET', '/api/enrollments')).data.enrollments.map((e) => e.track.id).sort();
  assert.deepEqual(list, ['chess', 'math']);
  ok('guest signing in to an existing account brings the subject across');

  // ── a child ──
  const k = client(base);
  const kAge = await k('POST', '/api/consent/age', { birth_month: 6, birth_year: new Date().getFullYear() - 10, country: 'US' });
  assert.equal(kAge.data.route, 'parent');
  assert.equal((await k('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version })).data.code, 'parent_decides', 'a child cannot agree for themselves');
  const noParent = await k('POST', '/api/ob2/begin', { nickname: 'Sam', answers: {} });
  assert.equal(noParent.status, 400);
  assert.equal(noParent.data.field, 'parent_email');
  const kid = await k('POST', '/api/ob2/begin', { nickname: 'Sam', parent_email: 'parent@example.test', answers: { tracks: ['math'], interest: 'other', interest_text: 'my school name', notes: true } });
  assert.equal(kid.status, 201);
  assert.equal(kid.data.user.consent.state, 'pending');
  assert.equal(kid.data.user.consent.has_request, true, 'the parent was asked before anything else was stored');
  assert.equal(kid.data.user.email, null);
  const kState = await k('GET', '/api/ob2/state');
  assert.equal(kState.data.answers.interest_text, '', 'a child\'s typed words are not kept');
  assert.equal(kState.data.answers.notes, false, 'no uploads for a child');
  assert.equal((await k('POST', '/api/materials/paste', { text: 'x' })).data.code, 'child_upload_off');
  assert.equal((await k('POST', '/api/tutor/chat', { messages: [{ role: 'user', content: 'hi' }] })).data.code, 'parent_opt_in_required');
  const kClaim = await k('POST', '/api/ob2/claim', { username: `sam${Date.now() % 100000}`, password: 'longenough1', email: 'child@example.test' });
  assert.equal(kClaim.status, 201);
  assert.equal(kClaim.data.user.email, null, 'a child email is never kept');
  assert.equal(kClaim.data.user.consent.state, 'pending');
  ok('child: parent asked first, no email, no free text, gates hold before and after the login is made');

  await startingLevelChecks(base);

  await stop(child);

  // ── the sweep and deletion, in this process on the same file ──
  const db = require('../config/db'); // eslint-disable-line global-require
  const ob = require('../services/onboarding-v2'); // eslint-disable-line global-require
  const consent = require('../routes/consent'); // eslint-disable-line global-require
  assert.ok(consent.collectionNames().includes('onboarding_answers'), 'deletion knows the collection');
  assert.ok(consent.collectionNames().includes('learner_agreements'), 'deletion knows what was agreed');
  const limited = ob.createGuest({ country: 'US', needs_parent: false, under_13: false, birth_ym: '1990-01', checked_at: new Date().toISOString() });
  assert.equal(consent.access(limited).state, 'guest', 'a row with no agreement stays limited');
  assert.equal(consent.access(limited).ai_free_text, false);
  const yes = ob.recordAgreement(limited, 'p');
  assert.equal(consent.access(yes).state, 'full');
  assert.equal(require('../config/subscriptions').canEditLevels(yes, {}), true, 'an agreed guest is tailored'); // eslint-disable-line global-require
  assert.equal(db.find('learner_agreements', (r) => r.user_id === limited.id).length, 1);
  db.update('users', limited.id, { guest_expires_at: new Date(Date.now() - 1000).toISOString() });
  const old = ob.createGuest({ country: 'US', needs_parent: false, under_13: false, birth_ym: '1990-01', checked_at: new Date().toISOString() });
  ob.saveAnswers(old, { why: 'work' });
  db.update('users', old.id, { guest_expires_at: new Date(Date.now() - 1000).toISOString() });
  const swept = ob.sweep();
  assert.ok(swept.guests_deleted >= 1);
  assert.equal(db.byId('users', old.id), null);
  assert.equal(db.find('learner_agreements', (r) => r.user_id === limited.id).length, 0, 'what was agreed goes with the guest');
  assert.equal(ob.rowOf(old.id) || null, null, 'the answers go with the guest');
  ok('sweep: an idle guest and its answers are deleted');

  console.log(`onboarding-v2-test: ${passed} groups passed`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
