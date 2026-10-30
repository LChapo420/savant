/**
 * Test-date plan (services/act-plan.js, GET /api/act/plan, public/js/act-scores.js):
 *
 *   node scripts/act-plan-test.js
 *
 * Pure checks on made-up learners with a fixed clock, plus the route and the page wiring.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
const tmp = path.join(os.tmpdir(), `act-plan-test-${process.pid}.json`);
process.env.DB_FILE = tmp;

const express = require('express');
const db = require('../config/db');
const plan = require('../services/act-plan');
const curriculum = require('../config/curriculum');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

const NOW = Date.parse('2026-10-30T12:00:00Z');
const scores = [{ english: 20, math: 22, reading: 25, science: 24 }];
const learnerOf = (p) => p.sessions.filter((s) => s.kind === 'learn');

// every ACT skill has a section; math is the default
const skills = plan.actSkills();
check('every ACT skill maps to one of the four sections', skills.every((s) => ['english', 'math', 'reading', 'science'].includes(plan.sectionOf(s))));
check('the English, Reading and Science skills are not left as Math', plan.sectionOf('comma_use') === 'english' && plan.sectionOf('inference') === 'reading' && plan.sectionOf('act_science') === 'science' && plan.sectionOf('quadratics') === 'math');

// no date, past date
check('no test date: no plan, with a reason', plan.build({ profile: {}, scores: [], states: {}, now: NOW }).status === 'no_date');
check('a date that has passed: no plan', plan.build({ profile: { test_date: '2026-10-01' }, scores: [], states: {}, now: NOW }).status === 'past');

// six weeks out
const six = plan.build({ profile: { test_date: '2026-12-11', target: 28 }, scores, states: {}, now: NOW });
check('six weeks out gives a plan', six.status === 'ok' && six.days_left === 42, six.days_left);
check('a fixed number of sessions that fits the weeks (about 4 a week)', six.session_count >= 20 && six.session_count <= 26, six.session_count);
check('sessions are in date order, none before today or after the test', six.sessions.every((s, i) => s.date >= '2026-10-30' && s.date <= '2026-12-11' && (i === 0 || s.date >= six.sessions[i - 1].date)));
check('ends with a rest day then the test', six.sessions.slice(-2).map((s) => s.kind).join() === 'rest,test' && six.sessions[six.sessions.length - 1].date === '2026-12-11');
check('the final seven days hold only review, rest and the test', six.sessions.filter((s) => s.date > '2026-12-04').every((s) => s.kind !== 'learn'));
check('no skill is taught twice', new Set(learnerOf(six).map((s) => s.skills[0].skill_id)).size === learnerOf(six).length);
const learned = new Set(learnerOf(six).map((s) => s.skills[0].skill_id));
check('a review only revisits a skill already taught', six.sessions.filter((s) => s.kind === 'review' && s.date >= '2026-11-01').every((s) => s.skills.every((k) => learned.has(k.skill_id))));
check('reviews of a skill come after it was taught', six.sessions.every((s, i) => s.kind !== 'review' || s.skills.every((k) => !learned.has(k.skill_id) || six.sessions.slice(0, i).some((t) => t.kind === 'learn' && t.skills[0].skill_id === k.skill_id))));

// weakest section first
check('the weakest section (English, 20) is worked first', plan.sectionOf(learnerOf(six)[0].skills[0].skill_id) === 'english', learnerOf(six)[0].skills);
const sec = {};
learnerOf(six).forEach((s) => { const k = plan.sectionOf(s.skills[0].skill_id); sec[k] = (sec[k] || 0) + 1; });
check('more teaching goes to English (gap 8) than to Reading (gap 3)', (sec.english || 0) > (sec.reading || 0), sec);
check('Science is weighted below an equal-gap section (UNVERIFIED composite)', plan.rankSkills({ target: 30 }, [{ english: 24, math: 24, reading: 24, science: 24 }], {}).find((r) => r.section === 'science').weight < plan.rankSkills({ target: 30 }, [{ english: 24, math: 24, reading: 24, science: 24 }], {}).find((r) => r.section === 'reading').weight);

// mastery changes the pick
const mastered = {};
for (const s of skills.filter((x) => plan.sectionOf(x) === 'english')) mastered[s] = { mastery: 0.95 };
const noEnglish = plan.build({ profile: { test_date: '2026-12-11', target: 28 }, scores, states: mastered, now: NOW });
check('mastered skills are not taught again', learnerOf(noEnglish).every((s) => plan.sectionOf(s.skills[0].skill_id) !== 'english'));

// short runway
const three = plan.build({ profile: { test_date: '2026-11-02' }, scores: [], states: {}, now: NOW });
check('3 days out: few sessions, still ends rest then test', three.sessions.length <= 4 && three.sessions.slice(-2).map((s) => s.kind).join() === 'rest,test', three.sessions.map((s) => s.kind));
const today = plan.build({ profile: { test_date: '2026-10-30' }, scores: [], states: {}, now: NOW });
check('test today: only the test', today.status === 'ok' && today.sessions.length === 1 && today.sessions[0].kind === 'test');
const far = plan.build({ profile: { test_date: '2027-10-30' }, scores: [], states: {}, now: NOW });
check('a year out stays under the cap', far.session_count <= plan.CONFIG.maxSessions, far.session_count);

// no scores, no target
const blank = plan.build({ profile: { test_date: '2026-12-11' }, scores: [], states: {}, now: NOW });
check('works with no scores and no target', blank.status === 'ok' && blank.learn_count > 0);
check('deterministic', JSON.stringify(blank) === JSON.stringify(plan.build({ profile: { test_date: '2026-12-11' }, scores: [], states: {}, now: NOW })));
check('every named skill exists in the curriculum', six.sessions.every((s) => s.skills.every((k) => curriculum.SKILLS[k.skill_id])));

// route
(async () => {
  const user = db.insert('users', { username: 'planner', role: 'student' });
  const other = db.insert('users', { username: 'other', role: 'student' });
  db.insert('act_profiles', { user_id: user.id, test_date: '2099-01-01', target: 30 });
  const routes = require('../routes/act');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/act', routes);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const get = (uid) => new Promise((ok, fail) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: '/api/act/plan', headers: { 'x-user': String(uid || '') } }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => ok({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    }).on('error', fail);
  });
  const mine = await get(user.id);
  check('route: a learner with a date gets a plan', mine.status === 200 && mine.body.status === 'ok' && mine.body.session_count > 0, mine.body && mine.body.status);
  const none = await get(other.id);
  check("route: another learner's date is not shared", none.status === 200 && none.body.status === 'no_date');
  const anon = await get(0);
  check('route: signed-out is refused', anon.status === 401 || anon.status === 403, anon.status);
  check('route: the plan names no practice link when the learner has no ACT enrollment', none.body.practice_href === null);
  server.close();

  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'act-scores.js'), 'utf8');
  check('page: learn and review rows link to practice', js.includes('practice_href') && js.includes('Practise'));
  check('page: the scores page fetches /api/act/plan and shows it', js.includes('/api/act/plan') && js.includes('Your plan'));

  try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
  console.log(failures ? `\n${failures} failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
