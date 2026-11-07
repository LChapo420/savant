/**
 * Onboarding v2, over HTTP on a throwaway copy of the store (docs/ONBOARDING-V2.md). Starts its own server twice: switch off, then on.
 *
 *   node scripts/onboarding-v2-test.js
 *
 * Checks: off means nothing new is reachable; a guest has no outside-AI, upload or boosters access; a walk, an enrollment and goals survive a
 * failed and then a good claim on the same row; a child gives no email and gets the consent request first; export and deletion cover the new
 * data; an existing account is not sent through the flow; a level check with too little to go on starts a teen or adult at their age, and real answers
 * (and really young learners) keep the low level; the goal line is plain for every goal; an agreed guest takes the short test and it stays on the saved
 * account, with no other measurement channel opened; holding the interests question to the end of the test leaves the picture as it was (measured below);
 * a child takes the style quiz instead; no goal asked means the default, forever, and the goal API still works.
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
  const clean = require('../services/onboarding-v2').cleanAnswers; // eslint-disable-line global-require
  assert.equal(clean({ how: 'own' }).how, 'own');
  assert.equal(clean({ how: 'both' }).how, 'both');
  assert.equal(clean({ how: 'curriculum' }).how, 'curriculum');
  assert.equal(clean({ how: 'nonsense' }).how, undefined, 'only the three answers');
  assert.equal(clean({ how: 'own' }, { child: true }).how, undefined, 'never for a child');
  const keys = Object.keys(require('../services/onboarding-v2').INTERESTS).sort(); // eslint-disable-line global-require
  assert.deepEqual([...C.INTERESTS.map((i) => i.id)].sort(), keys, 'the page and the server list the same interests');
  assert.equal(C.AGREEMENT.version, ob2Version, 'the words and the version move together');
  // Claims about the test: it isn't a learning-styles instrument, an IQ test or a diagnosis, and the page must not say so.
  const words = [JSON.stringify(C), fs.readFileSync(path.join(ROOT, 'public/js/start.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'public/js/start-test.js'), 'utf8')].join(' ').toLowerCase();
  for (const claim of ['learning style', 'how you learn best', 'never grades', 'your iq', 'measures your']) assert.ok(!words.includes(claim), `no "${claim}"`);
  ok('the page and the server list the same interests; agreement version; no claim the test can\'t back');
}

/** What a scripted learner does on a step. `seed` makes a mixed but repeatable person; 1 and 0 are the extremes. */
function respond(step, seed) {
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 1000; return h / 1000; };
  const high = seed === 1 || (seed !== 0 && hash(step.id + seed) < 0.5);
  if (step.kind === 'forced') return { choice: high ? 'high' : 'low' };
  if (step.kind === 'span') return { maxSpan: seed === 1 ? 9 : seed === 0 ? 3 : 4 + Math.round(hash(seed) * 4) };
  if (step.kind === 'speed') return { correct: seed === 1 ? 30 : seed === 0 ? 3 : 8 + Math.round(hash(seed) * 16), wrong: seed === 0 ? 8 : 1, firstMs: 1500 + hash(seed) * 3000 };
  if (step.kind === 'survey') return { text: 'soccer, music' };
  return {};
}

/** The test over HTTP, as the page takes it. Stops `stop` steps in; holds the interests question for the next screen and hands it in. */
async function takeTest(who, { stop = null, words = 'Soccer, Music', seed = 0.37 } = {}) {
  let out = (await who('POST', '/api/onboarding/start', { mode: 'quick', resume: true, interests_last: true })).data;
  assert.ok(out.step, `the test opens: ${JSON.stringify(out).slice(0, 120)}`);
  assert.notEqual(out.step.id, 'sv:interests', 'interests are not asked first');
  const { session } = out;
  const seen = [];
  while (!out.done && out.step.id !== 'sv:interests') {
    if (stop != null && seen.length >= stop) { out = (await who('POST', '/api/onboarding/stop', { interests_last: true })).data; break; }
    seen.push(out.step.id);
    out = (await who('POST', '/api/onboarding/answer', { session, id: out.step.id, response: respond(out.step, seed), ms: 6000 })).data;
    assert.ok(out.done || out.step, `the next step: ${JSON.stringify(out).slice(0, 160)}`);
  }
  assert.equal(out.step && out.step.id, 'sv:interests', 'the interests question comes last, even after stopping');
  const pending = (await who('GET', '/api/ob2/state')).data.test;
  assert.equal(pending.pending, true);
  assert.equal(pending.done, false);
  const done = (await who('POST', '/api/onboarding/answer', { session, id: 'sv:interests', response: { text: words }, ms: 9000 })).data;
  assert.equal(done.done, true);
  return { seen, summary: done.summary };
}

/**
 * Holding the interests question to the end against asking it first, on the service itself: every learner answers the same way both times, with extreme and random
 * learners, each taking each item's usual time. What matters is the first picture on the scorecard. Printed, and held to a tolerance. Simulated: scripted answers, not real people.
 */
function sameFirstPicture() {
  const baseline = require('../services/onboarding'); // eslint-disable-line global-require
  const model = require('../services/onboarding/model'); // eslint-disable-line global-require
  const { STAT_IDS } = require('../services/onboarding/plan'); // eslint-disable-line global-require
  const { byId } = require('../services/onboarding/pool'); // eslint-disable-line global-require
  const db = require('../config/db'); // eslint-disable-line global-require
  const person = () => db.insert('users', { email: null, display_name: 'sim', age_check: { country: 'US', needs_parent: false, under_13: false, birth_ym: '1990-01' } });
  const finish = (user, seed, last) => {
    let out = baseline.start(user, 'quick', { interests_last: last });
    const seen = [];
    while (!out.done) {
      seen.push(out.step.id);
      out = baseline.answer(user, { session: baseline.get(user.id).active.id, id: out.step.id, response: respond(out.step, seed), ms: byId[out.step.id].sec * 1000 });
    }
    return { seen, est: model.estimates(baseline.get(user.id).known.state, STAT_IDS) };
  };
  const seeds = [1, 0, 0.11, 0.23, 0.37, 0.41, 0.53, 0.67, 0.71, 0.83, 0.97, 0.05];
  let sameTasks = 0; let sum = 0; let n = 0; let worst = 0; let worstFed = 0; const allDiffs = [];
  for (const seed of seeds) {
    const a = finish(person(), seed, false);
    const b = finish(person(), seed, true);
    if ([...a.seen].sort().join() === [...b.seen].sort().join()) sameTasks += 1;
    for (const id of STAT_IDS) {
      const x = a.est[id]; const y = b.est[id];
      const d = Math.abs(x.dataValue - y.dataValue);
      sum += d; n += 1; worst = Math.max(worst, d); allDiffs.push(d);
      worstFed = Math.max(worstFed, Math.abs(x.P - y.P));
    }
  }
  allDiffs.sort((p, q) => p - q);
  const p99 = allDiffs[Math.floor(allDiffs.length * 0.99)];
  console.log(`  first picture, interests first vs last, ${seeds.length} scripted learners (2 extreme, 10 mixed), ${STAT_IDS.length} measures, 0-100 scale: same items ${sameTasks}/${seeds.length}, mean difference ${(sum / n).toFixed(3)}, p99 ${p99.toFixed(3)}, worst ${worst.toFixed(3)}, worst weight difference ${worstFed.toFixed(4)}`);
  assert.ok(sum / n < 0.01, 'the same picture');
  assert.equal(sameTasks, seeds.length, 'the same items are asked');
  ok('holding the interests question to the end leaves the first picture as it was');
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

/** The private beta: accounts come from the application. The invite gate is the real way in; sign-in only allows no new account at all. */
async function betaChecks() {
  const invitesFile = path.join(dir, 'invites.json');
  process.env.BETA_INVITES_FILE = invitesFile;
  const invites = require('../services/beta-invites'); // eslint-disable-line global-require
  const { SIGNUP_AGREEMENT } = require('../services/onboarding-v2'); // eslint-disable-line global-require
  let child = await server(6894, { ONBOARDING_V2: 'on', BETA_GATE: 'invite', BETA_SIGNIN_ONLY: 'off', BETA_INVITES_FILE: invitesFile });
  const base = 'http://localhost:6894';
  const now = Date.now();
  const invited = (who) => `${who}-${now}@example.test`;
  const signUp = async (who, body, age) => {
    const c = client(base);
    if (age) await c('POST', '/api/consent/age', age);
    const email = invited(who);
    const { code } = invites.approve(email);
    const out = await c('POST', '/api/auth/register', { invite_code: code, password: 'longenough1', display_name: 'Tess', ...(body.parent ? { username: `u${who}${now % 100000}`, parent_email: email } : { email }), ...(body.agreement ? { agreement: body.agreement } : {}) });
    assert.equal(out.status, 201, `${who}: signed up: ${JSON.stringify(out.data).slice(0, 160)}`);
    return { c, email, user: out.data.user };
  };

  // Signed out: no guest, whatever the request tries.
  const out = client(base);
  const state0 = (await out('GET', '/api/ob2/state')).data;
  assert.equal(state0.signed_out, true);
  assert.equal(state0.go, '/login?next=/start');
  await out('POST', '/api/consent/age', { birth_month: 3, birth_year: 1990, country: 'US' });
  assert.equal((await out('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version })).status, 403, 'no agreeing your way to a guest');
  assert.equal((await out('POST', '/api/ob2/begin', { answers: {} })).status, 403, 'no guest row');
  assert.equal((await out('GET', '/api/auth/me')).data.user, null);
  const join = await out('GET', '/join?invite=ABCDE-12345');
  assert.equal(join.status, 303);
  assert.equal(join.headers.get('location'), '/register');
  const page = await out('GET', '/register');
  assert.equal(page.status, 200, 'the sign-up page is where an invited tester makes the account');
  assert.ok(String(page.data).includes(SIGNUP_AGREEMENT.text), 'the page shows the words the server records');
  assert.ok(String(page.data).includes(`data-version="${SIGNUP_AGREEMENT.version}"`), 'and their version');
  assert.ok(String(page.data).includes('href="/privacy"'), 'and the privacy link');
  ok('beta, signed out: no guest row can be made; /join and /register are the way in; the sign-up page carries the line');

  // An approved applicant: agreement recorded at sign-up, and /start is theirs.
  const adultAge = { birth_month: 3, birth_year: 1990, country: 'US' };
  const a = await signUp('beta-adult', { agreement: SIGNUP_AGREEMENT.version }, adultAge);
  assert.ok(!a.user.guest);
  assert.equal(a.user.consent.state, 'full');
  const signed = (await a.c('GET', '/api/account/export')).data.learner_agreements;
  assert.equal(signed.length, 1, 'the agreement is on record from sign-up');
  assert.equal(signed[0].version, SIGNUP_AGREEMENT.version);
  assert.equal(signed[0].text, SIGNUP_AGREEMENT.text);
  assert.equal(signed[0].via, 'sign_up');
  assert.deepEqual(signed[0].covers, ['beta_terms', 'privacy_policy', 'outside_ai']);
  assert.ok(signed[0].agreed_at);
  const s1 = (await a.c('GET', '/api/ob2/state')).data;
  assert.equal(s1.onboarding, true);
  assert.equal(s1.account, true);
  assert.equal(s1.guest, undefined, 'not a guest');
  assert.equal(s1.route, 'self', 'the age from sign-up is known');
  assert.equal(s1.agreed, true);
  assert.equal(s1.test.allowed, true);
  for (const door of ['/dashboard', '/onboarding']) {
    const r = await a.c('GET', door);
    assert.equal(r.status, 302, `${door} sends an account with no subject`);
    assert.equal(r.headers.get('location'), '/start');
  }
  assert.equal((await a.c('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version })).status, 403, 'no agreement step for an account');
  assert.equal((await a.c('POST', '/api/ob2/claim', { display_name: 'X Y', email: 'x@example.test', password: 'longenough1' })).status, 409, 'nothing to save');
  const t = await takeTest(a.c);
  assert.ok(t.summary.known > 0);
  assert.equal((await a.c('POST', '/api/ob2/answers', { interests: ['space'], tracks: ['math', 'chess'] })).status, 200);
  assert.ok((await a.c('GET', '/api/profile')).data.survey.interests.includes('space'), 'interests reach the lesson writers, with the agreement on record');
  const g0 = (await a.c('GET', '/api/catalog?view=grades')).data.tracks.find((x) => x.id === 'math').grades;
  const lesson = await a.c('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: g0[4].id });
  assert.equal(lesson.status, 200, JSON.stringify(lesson.data).slice(0, 200));
  assert.equal(lesson.data.goal.summary, 'Your reviews keep coming back over time to help you remember this for good.');
  const s2 = (await a.c('GET', '/api/ob2/state')).data;
  assert.equal(s2.onboarding, true, 'a reload on the last screen stays on it');
  assert.equal(s2.enrollment.id, lesson.data.enrollment.id);
  assert.equal((await a.c('GET', '/dashboard')).status, 200, 'and the dashboard is open now');
  assert.equal((await a.c('POST', '/api/ob2/lesson-opened', {})).status, 200);
  const s3 = (await a.c('GET', '/api/ob2/state')).data;
  assert.equal(s3.onboarding, undefined);
  assert.equal(s3.go, '/dashboard', 'an account with a subject goes home');
  assert.equal((await a.c('GET', '/api/account/export')).data.profile.onboarding.sessions.length, 1, 'with its test');
  ok('beta, approved adult: agreement recorded at sign-up with its words, no agreement screen, no guest, test and first lesson on the account, then the dashboard');

  // Without the line there is no row: an API client that never showed the words hasn't agreed to them. access() is not changed by any of this.
  const noLine = await signUp('beta-noline', {}, adultAge);
  assert.equal((await noLine.c('GET', '/api/account/export')).data.learner_agreements.length, 0);
  assert.equal(noLine.user.consent.state, 'full', 'access() reads the age, as before');
  ok('beta: a sign-up that never showed the line records nothing');

  // An under-13 with the parent's address on the invite.
  const kidAge = { ...bornAged(10), country: 'US' };
  const k = await signUp('beta-kid', { parent: true }, kidAge);
  assert.equal(k.user.email, null);
  assert.equal(k.user.consent.state, 'pending');
  const ks = (await k.c('GET', '/api/ob2/state')).data;
  assert.equal(ks.onboarding, true);
  assert.equal(ks.route, 'parent');
  assert.equal(ks.consent.has_request, true, 'the parent was emailed at sign-up');
  assert.equal(ks.test.allowed, false, 'the baseline stays closed until the parent agrees to measurement');
  assert.equal((await k.c('POST', '/api/onboarding/start', { mode: 'quick' })).data.code, 'not_allowed');
  assert.equal((await k.c('GET', '/api/account/export')).data.learner_agreements.length, 0, 'a child doesn\'t agree for themselves');
  assert.equal((await k.c('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version })).status, 403);
  await k.c('POST', '/api/ob2/answers', { interests: ['other'], interest_text: 'my school name', notes: true, how: 'own' });
  const ka = (await k.c('GET', '/api/ob2/state')).data.answers;
  assert.equal(ka.how, null, 'a child account has no "how do you want to learn": it can\'t upload');
  assert.equal(ka.interest_text, '', 'no typed words kept');
  assert.equal(ka.notes, false, 'no uploads');
  assert.equal((await k.c('POST', '/api/tutor/chat', { messages: [{ role: 'user', content: 'hi' }] })).data.code, 'parent_opt_in_required');
  assert.equal((await k.c('POST', '/api/materials/paste', { text: 'x' })).data.code, 'child_upload_off');
  const kg = (await k.c('GET', '/api/catalog?view=grades')).data.tracks.find((x) => x.id === 'math').grades;
  const kl = await k.c('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: kg[2].id });
  assert.equal(kl.status, 200);
  assert.equal(kl.data.enrollment.own, null, 'no lesson written by outside AI');
  ok('beta, under 13: parent emailed at sign-up, no agreement of their own, style quiz not baseline, no typed words, no uploads, no AI, and still a first lesson');

  // An account with no age on record: asked on /start, and it can turn out to be a child.
  const old = await signUp('beta-noage', {}, null);
  assert.equal(old.user.age_needed, true);
  const os0 = (await old.c('GET', '/api/ob2/state')).data;
  assert.equal(os0.onboarding, true);
  assert.equal(os0.route, null, 'the page asks');
  assert.equal(os0.test.allowed, false);
  assert.equal((await old.c('POST', '/api/consent/age', adultAge)).data.route, 'self');
  const os1 = (await old.c('GET', '/api/ob2/state')).data;
  assert.equal(os1.route, 'self');
  assert.equal(os1.test.allowed, true);
  const oldKid = await signUp('beta-noage-kid', {}, null);
  assert.equal((await oldKid.c('POST', '/api/consent/age', kidAge)).data.route, 'parent');
  const oks = (await oldKid.c('GET', '/api/ob2/state')).data;
  assert.equal(oks.route, 'parent');
  assert.equal(oks.consent.has_request, false, 'nobody has been told yet');
  assert.equal((await oldKid.c('POST', '/api/ob2/begin', { parent_email: 'nope' })).data.field, 'parent_email');
  const told = await oldKid.c('POST', '/api/ob2/begin', { parent_email: 'parent@example.test' });
  assert.equal(told.status, 200);
  assert.equal(told.data.consent_email_sent, true);
  assert.equal((await oldKid.c('GET', '/api/ob2/state')).data.consent.has_request, true);
  ok('beta, no age on record: asked on /start; an under-13 then gives a parent\'s email before anything else, and the usual limits apply');
  // A kill loses what hasn't been flushed: wait until the accounts are on disk.
  for (let i = 0; i < 100 && !fs.readFileSync(dbFile, 'utf8').includes(invited('beta-noage-kid')); i += 1) await delay(300);
  await delay(2500);
  await stop(child);

  // Sign-in only: no account can be made at all, and the same accounts carry on.
  child = await server(6895, { ONBOARDING_V2: 'on', BETA_SIGNIN_ONLY: 'on', BETA_INVITES_FILE: invitesFile });
  const b2 = 'http://localhost:6895';
  const s = client(b2);
  const st = await s('GET', '/start');
  assert.equal(st.status, 302);
  assert.match(st.headers.get('location'), /^\/login/);
  assert.equal((await s('GET', '/register')).status, 302);
  assert.equal((await s('POST', '/api/auth/register', { email: 'x@example.test', password: 'longenough1', display_name: 'Xx' })).status, 403);
  await s('POST', '/api/consent/age', adultAge);
  assert.equal((await s('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version })).status, 403);
  assert.equal((await s('POST', '/api/ob2/begin', {})).status, 403);
  const back = client(b2);
  assert.equal((await back('POST', '/api/auth/login', { email: invited('beta-noage'), password: 'longenough1' })).status, 200);
  assert.equal((await back('GET', '/api/ob2/state')).data.onboarding, true, 'an account with no subject comes through /start');
  assert.equal((await back('GET', '/dashboard')).headers.get('location'), '/start');
  const home = client(b2);
  assert.equal((await home('POST', '/api/auth/login', { email: invited('beta-adult'), password: 'longenough1' })).status, 200);
  assert.equal((await home('GET', '/api/ob2/state')).data.go, '/dashboard', 'one with a subject goes home');
  assert.equal((await home('GET', '/dashboard')).status, 200);
  ok('beta, sign-in only: /start needs sign-in; no sign-up, no guest; no subject comes through /start, a subject goes home');
  await stop(child);
}

/** Owner, 7 Nov: one named account goes through the flow once more on its next login, keeping what it has. */
async function redoChecks() {
  const invitesFile = path.join(dir, 'invites-redo.json');
  process.env.BETA_INVITES_FILE = invitesFile;
  const invites = require('../services/beta-invites'); // eslint-disable-line global-require
  const now = Date.now();
  const named = `redo-${now}@example.test`;
  const child = await server(6896, { ONBOARDING_V2: 'on', BETA_GATE: 'invite', BETA_SIGNIN_ONLY: 'off', BETA_INVITES_FILE: invitesFile, ONBOARDING_REDO_EMAILS: named });
  const base = 'http://localhost:6896';
  const make = async (email) => {
    const c = client(base);
    await c('POST', '/api/consent/age', { birth_month: 3, birth_year: 1990, country: 'US' });
    const { code } = invites.approve(email);
    const out = await c('POST', '/api/auth/register', { invite_code: code, email, password: 'longenough1', display_name: 'Tess' });
    assert.equal(out.status, 201, JSON.stringify(out.data).slice(0, 160));
    return c;
  };
  const cat = (await fetch(`${base}/api/catalog`).then((r) => r.json())).tracks;
  const gradeOf = (t) => cat.find((x) => x.id === t).grades[0].id;
  const had = await make(named);
  const other = await make(`other-${now}@example.test`);
  for (const c of [had, other]) {
    const e = await c('POST', '/api/enrollments', { selections: [{ track_id: 'english', grade_id: gradeOf('english') }] });
    assert.equal(e.status, 201, `enrolled: ${JSON.stringify(e.data).slice(0, 160)}`);
  }
  const home = async (c) => (await c('GET', '/dashboard')).headers.get('location');
  assert.equal(await home(other), null, 'anyone else with a subject keeps their dashboard');
  assert.match(await home(had), /^\/start/, 'the named account goes to the flow');
  const english = async () => { const d = (await had('GET', '/api/enrollments')).data; return (d.enrollments || d).find((e) => (e.track_id || (e.track && e.track.id)) === 'english'); };
  const before = await english();
  assert.ok(before, 'it has its subject');
  assert.ok((await had('POST', '/api/ob2/begin', { answers: { tracks: ['math'] } })).status < 300, 'it may answer');
  const first = await had('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: gradeOf('math') });
  assert.ok(first.status < 300, JSON.stringify(first.data).slice(0, 160));
  const after = await english();
  assert.equal(after.id, before.id, 'the subject it had is still there');
  assert.equal(after.current_level, before.current_level, 'at the same level');
  assert.equal(JSON.stringify(after.grade_id || after.grade), JSON.stringify(before.grade_id || before.grade), 'in the same grade');
  assert.equal(await home(had), null, 'once its first lesson is made, the dashboard opens');
  await had('POST', '/api/ob2/lesson-opened', {});
  assert.equal(await home(had), null, 'and it never comes back');
  await stop(child);
  ok('one named account onboards once, keeping its subjects; nobody else does');
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
  // The short test, for an agreed guest. Nothing else that measures opens.
  const stateAgreed = (await c('GET', '/api/ob2/state')).data.test;
  assert.equal(stateAgreed.allowed, true);
  assert.equal(stateAgreed.done, false);
  assert.equal((await c('GET', '/api/onboarding/modes')).data.allowed, true, 'an agreed guest may take the test');
  assert.equal((await c('GET', '/api/boosters')).data.allowed, false, 'and no other measurement channel');
  assert.equal((await c('GET', '/api/daily-check')).data.offer, false, 'no daily check either');
  const firstBlock = (await c('POST', '/api/onboarding/start', { mode: 'quick', resume: true, interests_last: true })).data;
  const resumed = (await c('POST', '/api/onboarding/start', { mode: 'quick', resume: true, interests_last: true })).data;
  assert.equal(resumed.session, firstBlock.session, 'a reload carries on the same session');
  assert.equal(resumed.resumed, true);
  assert.deepEqual(resumed.step, firstBlock.step, 'on the same step, drawn the same');
  const test = await takeTest(c);
  assert.ok(test.seen.includes('t:speed_q') && test.seen.includes('t:span_fwd'), `Quick has its two timed tasks: ${test.seen.join(' ')}`);
  assert.ok(test.seen.length >= 10, 'and its choices');
  assert.ok(test.summary.known > 0, 'and it reaches the scorecard');
  const afterTest = (await c('GET', '/api/ob2/state')).data.test;
  assert.equal(afterTest.done, true);
  assert.equal(afterTest.open, false);
  ok(`short test: an agreed guest takes Quick (${test.seen.length} steps, then interests), resumes after a reload, feeds ${test.summary.known} measures; boosters and the daily check stay closed`);

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
  assert.equal(exported.data.profile.onboarding.sessions.length, 1, 'the test is on the saved account');
  assert.equal(exported.data.profile.onboarding.sessions[0].mode, 'quick');
  assert.ok(exported.data.profile.onboarding.sessions[0].measures_fed > 0);
  assert.equal(exported.data.profile.took_style_quiz, true);
  assert.equal(exported.data.user.id, agreed.data.user.id, 'on the same row');
  assert.equal((await c('GET', '/api/onboarding/modes')).data.done, 1, 'and the saved account knows it was done');
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
  await takeTest(g, { stop: 2 });
  await g('POST', '/api/ob2/first-lesson', { track: 'chess', grade_id: 'board_explorer' }).catch(() => {});
  const grades = (await g('GET', '/api/catalog?view=grades')).data.tracks.find((t) => t.id === 'chess').grades;
  const made = await g('POST', '/api/ob2/first-lesson', { track: 'chess', grade_id: grades[0].id });
  assert.equal(made.status, 200);
  const signed = await g('POST', '/api/auth/login', { email, password: 'longenough1' });
  assert.equal(signed.status, 200);
  const list = (await g('GET', '/api/enrollments')).data.enrollments.map((e) => e.track.id).sort();
  assert.deepEqual(list, ['chess', 'math']);
  const kept = (await g('GET', '/api/account/export')).data.profile.onboarding.sessions;
  assert.equal(kept.length, 1, 'an account that already took the test keeps its own');
  ok('guest signing in to an existing account brings the subject across, and doesn\'t replace a test it already has');

  // ...and an account with no test of its own takes the guest's, and its scorecard hears about it.
  const plain = client(base);
  const plainEmail = `plain-${Date.now()}@example.test`;
  await plain('POST', '/api/consent/age', { birth_month: 1, birth_year: 1982, country: 'US' });
  await plain('POST', '/api/auth/register', { email: plainEmail, password: 'longenough1', display_name: 'Plain' });
  await plain('POST', '/api/auth/logout', {});
  const g2 = client(base);
  await g2('POST', '/api/consent/age', { birth_month: 3, birth_year: 1991, country: 'US' });
  await g2('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version });
  const moved = await takeTest(g2, { stop: 3 });
  assert.equal((await g2('POST', '/api/auth/login', { email: plainEmail, password: 'longenough1' })).status, 200);
  const plainNow = (await g2('GET', '/api/account/export')).data.profile;
  assert.equal(plainNow.onboarding.sessions.length, 1, 'the test comes across');
  assert.equal(plainNow.onboarding.sessions[0].items, moved.seen.length + 1);
  assert.ok(plainNow.took_style_quiz);
  ok('a guest signing in to an account with no test brings it across');

  // ── no goal asked: the default ──
  const d = client(base);
  await d('POST', '/api/consent/age', { birth_month: 3, birth_year: 1992, country: 'US' });
  await d('POST', '/api/ob2/agree', { decision: 'agree', version: ob2Version });
  assert.equal((await d('POST', '/api/ob2/answers', { interests: ['soccer', 'other', 'nonsense'], interest_text: 'rock climbing', test_skipped: true, tracks: ['math'] })).status, 200);
  const dState = (await d('GET', '/api/ob2/state')).data;
  assert.deepEqual(dState.answers.interests, ['soccer', 'other'], 'several interests, known ones only');
  assert.equal(dState.answers.interest, 'soccer', 'the first is the main one');
  assert.equal(dState.answers.test_skipped, true);
  assert.equal(dState.test.done, false, 'skipping isn\'t doing it');
  const dSurvey = (await d('GET', '/api/profile')).data.survey.interests;
  assert.ok(dSurvey.includes('soccer') && dSurvey.includes('rock climbing'), `both reach the lesson writers: ${dSurvey}`);
  await d('POST', '/api/ob2/answers', { interests: ['music'], interest_text: '' });
  const dSurvey2 = (await d('GET', '/api/profile')).data.survey.interests;
  assert.ok(dSurvey2.includes('music') && !dSurvey2.includes('soccer'), `changing them replaces them: ${dSurvey2}`);
  const mathGrades = (await d('GET', '/api/catalog?view=grades')).data.tracks.find((t) => t.id === 'math').grades;
  const dFirst = await d('POST', '/api/ob2/first-lesson', { track: 'math', grade_id: mathGrades[4].id });
  assert.equal(dFirst.status, 200);
  assert.equal(dFirst.data.goal.horizon, undefined, 'no goal is set for them');
  assert.equal(dFirst.data.goal.summary, 'Your reviews keep coming back over time to help you remember this for good.', 'and the line says what the default does');
  const dGoals = (await d('GET', '/api/retention-goals')).data;
  const dItem = dGoals.enrollments.find((i) => i.id === dFirst.data.enrollment.id);
  assert.equal(dItem.goal.status, 'forever');
  assert.equal(dItem.goal.is_default, true, 'forever, shown as the default');
  const setLater = await d('PUT', '/api/retention-goals', { kind: 'enrollment', id: dFirst.data.enrollment.id, horizon: 'year' });
  assert.equal(setLater.status, 200, 'the goal can still be set afterwards');
  assert.equal((await d('GET', '/api/retention-goals')).data.enrollments.find((i) => i.id === dFirst.data.enrollment.id).goal.status, 'horizon');
  ok('no goal asked: the default is forever, the line says so, and /api/retention-goals still sets one');

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
  assert.equal(kState.data.test.allowed, false, 'the baseline is closed to a child without the parent\'s measurement agreement');
  assert.equal((await k('GET', '/api/onboarding/modes')).data.allowed, false);
  assert.equal((await k('POST', '/api/onboarding/start', { mode: 'quick', interests_last: true })).data.code, 'not_allowed');
  const quiz = (await k('GET', '/api/style-quiz')).data;
  assert.equal(quiz.questions.length, 20);
  const quizSaved = await k('POST', '/api/profile/style-quiz', { answers: Object.fromEntries(quiz.questions.map((q) => [q.id, 0.67])) });
  assert.equal(quizSaved.status, 200, `the fallback quiz works for the limited child row: ${JSON.stringify(quizSaved.data).slice(0, 100)}`);
  assert.equal((await k('GET', '/api/ob2/state')).data.test.done, true);
  assert.equal(kState.data.answers.interest_text, '', 'a child\'s typed words are not kept');
  assert.equal(kState.data.answers.notes, false, 'no uploads for a child');
  assert.equal((await k('POST', '/api/materials/paste', { text: 'x' })).data.code, 'child_upload_off');
  assert.equal((await k('POST', '/api/tutor/chat', { messages: [{ role: 'user', content: 'hi' }] })).data.code, 'parent_opt_in_required');
  const kClaim = await k('POST', '/api/ob2/claim', { username: `sam${Date.now() % 100000}`, password: 'longenough1', email: 'child@example.test' });
  assert.equal(kClaim.status, 201);
  assert.equal(kClaim.data.user.email, null, 'a child email is never kept');
  assert.equal(kClaim.data.user.consent.state, 'pending');
  assert.equal((await k('GET', '/api/account/export')).data.profile.took_style_quiz, true, 'the quiz stays on the saved child account');
  ok('child: parent asked first, the style quiz in place of the baseline, no email, no free text, gates hold before and after the login is made');

  await startingLevelChecks(base);

  await stop(child);

  await betaChecks();
  await redoChecks();

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

  sameFirstPicture();

  console.log(`onboarding-v2-test: ${passed} groups passed`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
