/**
 * The free ACT level check and the recruiting numbers (services/act-check.js, routes/act-check.js, public/act-check.html,
 * public/recruit.html):
 *
 *   node scripts/act-check-test.js
 *
 * Boots the real server (server.js) on a random port with its own COPY of the database (DB_FILE), then runs a full guest flow
 * through the real routes: the 13+ question, the walk, the result, the application, the line, a referral, the admin page and the
 * carry into an account. The walk is answered by a SIMULATED learner (right on every question written for the first
 * SIMULATED_KNOWS grades, wrong above), so the band it checks is simulated, not a real learner's.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC_DB = process.env.DB_FILE || path.join(ROOT, 'data', 'db.json');
const tmp = path.join(os.tmpdir(), `act-check-test-${process.pid}.json`);
fs.copyFileSync(SRC_DB, tmp);
// This process only reads the copy (question answers for the simulated learner); the server it starts writes its own.
process.env.DB_FILE = tmp;
process.env.DB_READONLY = '1';

const sp = require('../services/subject-placement');
const rules = require('../config/subject-placement');
const act = require('../services/act-check');
const areas = require('../services/act-areas');

const SIMULATED_KNOWS = 8; // grades 1-8 known, so a walk should place around grade 9 (composite about 25-27)
let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

console.log('static pieces');
const page = read('public/act-check.html');
check('page has title, description, viewport', /<title>[^<]+<\/title>/.test(page) && /name="description"/.test(page) && /width=device-width/.test(page));
check('page says not an official score and not affiliated with ACT, Inc.', /not an official ACT score/i.test(page) && /not affiliated with(, or endorsed by,)? ACT, Inc\./i.test(page.replace(/\s+/g, ' ')));
check('page loads no third-party script or style and no inline script', !/(src|href)="https?:/.test(page.replace(/href="https?:\/\/[^"]*"/g, '')) && !/<script(?![^>]*src=)/.test(page));
check('13+ question is on the first screen, before any walk', /I am 13 or older/.test(page) && /I am under 13/.test(page));
check('privacy page has the guest-check section', /id="act-check"/.test(read('public/privacy.html')) && /under 13, we do not start a check/.test(read('public/privacy.html')));
check('GRADE_BANDS cover the 16 ACT grades and match the grade headings', act.GRADE_BANDS.length === 16
  && require('../config/curriculum').getTrack('act').grades.every((g, i) => g.heading.includes(String(act.GRADE_BANDS[i][1])) && (i === 0 || i === 15 || g.heading.includes(String(act.GRADE_BANDS[i][0])))));
check('area tagger leaves strategy items untagged and tags math, english, reading', areas.areaOf({ topic: 'Planning Retention Between Test Dates', prompt: 'x' }) === null
  && areas.areaOf({ topic: 'Math: percent change', prompt: 'x' }) === 'number' && areas.areaOf({ topic: 'English: commas with nonessential information', prompt: 'x' }) === 'grammar'
  && areas.areaOf({ topic: '[Reading] Main Idea Versus Supporting Detail', prompt: 'x' }) === 'reading');
check('qualification needs all four parts', (() => {
  const g = { finished_at: 'x', age13: true };
  const ok = act.qualification(g, { agree_30_min: true, email: 'a@b.co' }).qualified;
  return ok && !act.qualification(g, { agree_30_min: false, email: 'a@b.co' }).qualified && !act.qualification(g, { agree_30_min: true, email: 'nope' }).qualified
    && !act.qualification({ ...g, finished_at: null }, { agree_30_min: true, email: 'a@b.co' }).qualified && !act.qualification({ ...g, age13: false }, { agree_30_min: true, email: 'a@b.co' }).qualified;
})());

const haveSet = !!sp.questionSet('act');
if (!haveSet) console.log('\nSKIP the live flow: this database has no ACT placement question set (the run is not green for it).');

async function main() {
  if (!haveSet) return;
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env, PORT: String(port), DB_FILE: tmp, DB_READONLY: '', NODE_ENV: 'test', ADMIN_EMAILS: 'admin-test@example.com',
    COST_TRACKER: 'off', BETA_REPORT_DAILY: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off',
  };
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  try {
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`${base}/api/health`)).status < 500) break; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }

    const call = async (method, url, body, { token, cookie } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (token) headers['x-guest-token'] = token;
      if (cookie) { headers.cookie = cookie; headers.origin = base; }
      const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text();
      let json = {};
      try { json = JSON.parse(text); } catch { /* not json */ }
      return { status: r.status, json, text, headers: r.headers };
    };

    console.log('\npages and the age question');
    const pageRes = await call('GET', '/act-check');
    check('/act-check is served with no sign-in', pageRes.status === 200 && /Free ACT level check/.test(pageRes.text));
    const recruitAnon = await call('GET', '/recruit');
    check('/recruit is not served to a visitor', recruitAnon.status === 404);
    check('/api/recruit/stats is admin only', (await call('GET', '/api/recruit/stats')).status === 404);
    const under = await call('POST', '/api/act-check/start', { age13: false, ref: 'tt-test' });
    check('under 13: no check starts and no token is made', under.status === 200 && under.json.under13 === true && !under.json.token);
    check('13+ must be answered before a check starts', (await call('POST', '/api/act-check/start', {})).status === 400);
    check('a made-up token is refused', (await call('GET', '/api/act-check/result', null, { token: 'gabcdef0123.abcdefghijklmnopqrstuv' })).status === 401);
    await call('POST', '/api/act-check/visit', { ref: 'tt-test', ch: 'tiktok' });
    await call('POST', '/api/act-check/visit', { ref: 'BAD REF!', ch: '' });

    // One simulated guest walk through the real routes.
    async function walk(ref, ch) {
      const first = await call('POST', '/api/act-check/start', { age13: true, ref, ch });
      if (first.status !== 200) return { error: first };
      const token = first.json.token;
      let state = first.json.state;
      let blocks = 0;
      let leaked = false;
      while (state.phase === 'walk' && blocks < 40) {
        const bank = sp.questionsFor('act', state.grade_id);
        const at = rules.gradesFor('act').indexOf(state.grade_id);
        const answers = state.questions.map((q) => {
          if (Object.keys(q).some((k) => /answer|rationale/i.test(k))) leaked = true;
          const real = bank[q.index];
          if (at < SIMULATED_KNOWS) return { index: q.index, answer: real.answer };
          const wrong = (q.choices || []).find((c) => c !== real.answer);
          return { index: q.index, answer: wrong || '' };
        });
        const saved = await call('POST', '/api/act-check/answer', { grade_id: state.grade_id, index: answers[0].index, answer: answers[0].answer }, { token });
        if (saved.status !== 200) return { error: saved };
        const res = await call('POST', '/api/act-check/submit', { answers }, { token });
        if (res.status !== 200) return { error: res };
        state = res.json.state;
        blocks++;
      }
      return { token, blocks, leaked, state, first };
    }

    console.log('\nguest A: the walk, result and application');
    const a = await walk('tt-test', 'tiktok');
    check('walk runs to its end through the routes', !a.error && a.state.phase === 'done', a.error && a.error.json);
    check('questions sent to the page never carry the answer or rationale', a.leaked === false);
    check('a quick walk is short (at most 32 questions)', a.blocks > 0 && a.blocks <= 32, a.blocks);
    const resA = await call('GET', '/api/act-check/result', null, { token: a.token });
    const r = resA.json.result || {};
    check('result is an estimate with a composite band', resA.status === 200 && r.kind === 'estimate' && r.composite_low <= r.composite_high && r.composite_low >= 5);
    check('SIMULATED learner who knows grades 1-8 lands in a 21-29 band', r.composite_low >= 21 && r.composite_high <= 29, [r.composite_low, r.composite_high, r.grade_id]);
    check('three weakest areas are named, each with counts', Array.isArray(r.weakest) && r.weakest.length === 3 && r.weakest.every((w) => w.name && w.asked >= 1), r.weakest);
    check('result page states it is not official and unvalidated', /not an official ACT score/i.test(page) && /not yet compared it with real ACT/i.test(page));
    check('before applying, the result has a share path and no position', resA.json.standing.applied === false && /^\/act-check\?ref=[a-z0-9]{8}$/.test(resA.json.standing.share_path || '') && resA.json.standing.position === undefined);
    const codeA = (resA.json.standing.share_path || '').split('=')[1];

    const bad1 = await call('POST', '/api/act-check/apply', { email: 'not-an-email', consent_email: true }, { token: a.token });
    const bad2 = await call('POST', '/api/act-check/apply', { email: 'a@example.com' }, { token: a.token });
    check('apply refuses a bad email and a missing email consent', bad1.status === 400 && bad1.json.field === 'email' && bad2.status === 400 && bad2.json.field === 'consent_email');
    const apA = await call('POST', '/api/act-check/apply', { email: 'Guest-A@Example.com', name: 'Ann', consent_email: true, agree_30_min: false }, { token: a.token });
    check('applying without the 30-minute agreement saves the application but is not qualified', apA.status === 201 && apA.json.standing.applied && apA.json.standing.qualified === false && apA.json.standing.qualified_parts.agreed_30_min === false, apA.json);
    const apA2 = await call('POST', '/api/act-check/apply', { email: 'guest-a@example.com', name: 'Ann', consent_email: true, agree_30_min: true }, { token: a.token });
    check('agreeing later qualifies the same application (no second row)', apA2.json.standing.qualified === true && apA2.json.standing.applicants === 1 && apA2.json.standing.position === 1, apA2.json);

    console.log('\nguests B and C: the line and a referral');
    const b = await walk('tt-test', 'tiktok');
    const apB = await call('POST', '/api/act-check/apply', { email: 'guest-b@example.com', consent_email: true, agree_30_min: true }, { token: b.token });
    check('B applies as qualified and stands second', apB.json.standing.qualified && apB.json.standing.position === 2, apB.json);
    const codeB = ((await call('GET', '/api/act-check/result', null, { token: b.token })).json.standing.share_path || '').split('=')[1];
    const c = await walk(codeB, '');
    const apC = await call('POST', '/api/act-check/apply', { email: 'guest-c@example.com', consent_email: true, agree_30_min: true }, { token: c.token });
    check('C applies through B\'s code and stands third', apC.json.standing.qualified && apC.json.standing.position === 3, apC.json);
    const standB = (await call('GET', '/api/act-check/result', null, { token: b.token })).json.standing;
    const standA = (await call('GET', '/api/act-check/result', null, { token: a.token })).json.standing;
    check('B moves up past A for one qualified referral', standB.position === 1 && standB.referrals === 1 && standA.position === 2, [standA, standB]);
    check('qualified count is shown (3)', standB.qualified_count === 3 && standB.applicants === 3);

    const d = await walk(codeB, '');
    const apD = await call('POST', '/api/act-check/apply', { email: 'guest-d@example.com', consent_email: true, agree_30_min: false }, { token: d.token });
    const standB2 = (await call('GET', '/api/act-check/result', null, { token: b.token })).json.standing;
    check('an unqualified referral does not move the referrer', apD.json.standing.qualified === false && standB2.referrals === 1);

    console.log('\nresuming a check');
    const e1 = await call('POST', '/api/act-check/start', { age13: true, ref: 'tt-test' });
    const resume = await call('POST', '/api/act-check/start', { ref: 'ignored' }, { token: e1.json.token });
    check('the same token resumes the same walk', resume.status === 200 && resume.json.token === e1.json.token && resume.json.state.phase === 'walk' && resume.json.state.grade_id === e1.json.state.grade_id);
    const openAt = rules.gradesFor('act').indexOf(e1.json.state.grade_id);
    check('the check opens mid-ladder, not on the lowest grade (the digit-6 place-value question)', openAt >= 5 && openAt <= 9, openAt);
    await new Promise((r) => setTimeout(r, 1500)); // the server writes its db on a 250 ms debounce
    check('the walk is a subject placement row kept under a guest id, not a user', (() => {
      const rows = JSON.parse(fs.readFileSync(tmp, 'utf8')).subject_placements.filter((p) => String(p.user_id).startsWith('guest:'));
      return rows.length >= 5;
    })());

    console.log('\nowner page (admin)');
    const reg = await call('POST', '/api/auth/register', { email: 'admin-test@example.com', password: 'Correct-horse-9!', display_name: 'Admin Test', birth_year: 1990, birth_month: 5, country: 'US' });
    const cookie = (reg.headers.getSetCookie ? reg.headers.getSetCookie() : []).map((x) => x.split(';')[0]).join('; ');
    check('admin test account made on the copy', reg.status === 201 && !!cookie, reg.json);
    const stats = await call('GET', '/api/recruit/stats', null, { cookie });
    const s = stats.json;
    check('admin sees stats', stats.status === 200 && s.goal === 1000 && s.goal_date === '2026-11-15');
    check('totals: started, finished, applied, qualified', s.totals && s.totals.started >= 5 && s.totals.finished === 4 && s.totals.applicants === 4 && s.totals.qualified === 3, s.totals);
    const row = (s.refs || []).find((x) => x.ref === 'tt-test' && x.channel === 'tiktok');
    check('per ref code and channel: visits, started, finished, applied, qualified', row && row.visit >= 1 && row.started >= 2 && row.finished >= 2 && row.applied >= 2 && row.qualified >= 2, row);
    const friendRow = (s.refs || []).find((x) => x.ref === codeB);
    check('a visitor\'s share code is its own row, channel friend, with its referrals', friendRow && friendRow.channel === 'friend' && friendRow.owner === 'visitor' && friendRow.referrals === 2, friendRow);
    check('malformed ref codes are dropped, not stored', !(s.refs || []).some((x) => /[^a-z0-9_-]/.test(x.ref)));
    check('daily totals with a running qualified count', Array.isArray(s.daily) && s.daily.length >= 1 && s.daily[s.daily.length - 1].cumulative_qualified === 3);
    check('pace line: days left and needed per day', Number.isFinite(s.days_left) && Number.isFinite(s.needed_per_day) && /Qualified =/.test(s.definition));
    const csv = await call('GET', '/api/recruit/applicants?format=csv', null, { cookie });
    check('applicants CSV for the owner, in line order', csv.status === 200 && /guest-b@example.com/.test(csv.text) && csv.text.indexOf('guest-b@example.com') < csv.text.indexOf('guest-a@example.com'));
    check('recruit page is served to the admin', (await call('GET', '/recruit', null, { cookie })).status === 200);

    console.log('\nthe result goes with the account');
    const joined = await call('POST', '/api/auth/register', { email: 'guest-a@example.com', password: 'Correct-horse-9!', display_name: 'Ann Applicant', birth_year: 2008, birth_month: 3, country: 'US' });
    const jcookie = (joined.headers.getSetCookie ? joined.headers.getSetCookie() : []).map((x) => x.split(';')[0]).join('; ');
    check('applicant signs up with the same email', joined.status === 201, joined.json);
    const mine = await call('GET', '/api/subject-placement/percent/mine', null, { cookie: jcookie });
    check('their ACT placement is already on the account', mine.status === 200 && mine.json.placement && mine.json.placement.act && mine.json.placement.act.recommended_grade_id === r.grade_id, mine.json);
    const stats2 = await call('GET', '/api/recruit/applicants', null, { cookie });
    check('the application is marked joined', (stats2.json.applicants || []).find((x) => x.email === 'guest-a@example.com').status === 'joined');
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 300));
    for (const f of [tmp, `${tmp}.tmp`]) try { fs.unlinkSync(f); } catch { /* gone */ }
    if (failures) console.log(`\nserver log tail:\n${log.slice(-1500)}`);
  }
}

main().then(() => {
  console.log(failures ? `\n${failures} FAILED` : '\nact-check-test: all passed');
  process.exit(failures ? 1 : 0);
}).catch((err) => { console.error(err); process.exit(1); });
