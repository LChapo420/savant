/**
 * Tests for study goals (services/study-goal.js, routes/study-goals.js and their wiring into the learning spec, the learner
 * path and the uploaded-course path): full depth changes nothing, core parts fast shortens the spec and steps over extra
 * practice levels (never a lesson, retention, check or the last level), what is set aside is listed and comes back,
 * STUDY_GOAL=off restores today's behaviour, and nothing is changed for another learner.
 *
 *   node scripts/study-goal-test.js      (own throwaway data file, every model key blanked)
 */
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
process.env.DB_FILE = path.join(os.tmpdir(), `study-goal-test-${process.pid}.json`);

// Core is off by default (the gate has not passed); this test exercises it with the switch on, and checks the off state below.
process.env.STUDY_GOAL_CORE = 'on'; process.env.STUDY_GOAL_TEST = 'on';
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const coverage = require('../services/coverage');
const sg = require('../services/study-goal');
const ls = require('../services/learning-spec');
const lp = require('../services/learner-path');

let failed = 0;
const ok = (c, label, d) => {
  if (c) console.log(`  ok   ${label}`);
  else { failed += 1; console.log(`  FAIL ${label}${d === undefined ? '' : ` - ${JSON.stringify(d).slice(0, 300)}`}`); }
};

const TRACK = 'math';
const GRADE = 'counting_and_comparing';
const user = db.insert('users', { email: 'sg-a@example.test', name: 'a', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
const other = db.insert('users', { email: 'sg-b@example.test', name: 'b', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
const mk = (u) => db.insert('enrollments', { user_id: u.id, track_id: TRACK, grade_id: GRADE, target_level: 300, current_level: 1, level_items: 0, levels_completed: 0, xp: 0, status: 'active', placed_at: new Date().toISOString() });
const e = mk(user);
const eOther = mk(other);
const enr = () => db.byId('enrollments', e.id);
const spec = (u) => ls.buildSpec(u.id, { trackId: TRACK, gradeId: GRADE });

const base = spec(user);
ok(base.isDefault && !base.studyGoal, 'no goal: the default spec is untouched');

ok(sg.save(user.id, 'enrollment', e.id, { goal: 'nonsense' }).error, 'an unknown goal is refused');
ok(sg.save(other.id, 'enrollment', e.id, { goal: 'core' }).status === 404, 'another learner cannot change this enrollment');
ok(!sg.save(user.id, 'enrollment', e.id, { goal: 'core' }).error, 'core is saved');
const core = spec(user);
ok(core.studyGoal && core.studyGoal.id === 'core' && !core.isDefault, 'core: the spec carries the goal and is no longer default');
ok(core.lesson.wordBudget <= Math.round(base.lesson.wordBudget * 0.6) && core.lesson.wordBudget >= 120, 'core: the word ceiling falls by at least 40% (or to the floor)', [base.lesson.wordBudget, core.lesson.wordBudget]);
ok(core.practice.examplesPerIdea === 1 && core.lesson.recapAtEnd === false && core.lesson.retrievalChecks >= 3, 'core: one example, no recap, at least three checks kept');
ok(ls.specToLines(core, { surface: 'lesson' }).join(' ').includes('STUDY GOAL'), 'core: the lesson block states the goal');
ok(!ls.specToLines(core, { surface: 'test' }).join(' ').includes('STUDY GOAL'), 'core: question writing is not told to shorten facts');
ok(ls.specHash(core) !== ls.specHash(base), 'core: the spec hash changes, so a stale lesson is told apart');
const other0 = spec(other);
ok(other0.isDefault && !other0.studyGoal, 'another learner is unchanged');

const grade = curriculum.getGrade(TRACK, GRADE);
const aside = sg.setAsideFor(enr());
ok(aside.length > 0, 'core sets some practice levels aside', aside.length);
const model = coverage.modelFor(TRACK, GRADE);
ok(aside.every((a) => model.levelMap[a.level].kind === 'activity' && !model.levelMap[a.level].retention && a.level < grade.pathLength), 'only plain practice levels: never retention, a lesson, a check or the last level');
const idx = new Set(aside.map((a) => a.level));
const walkFor = (enrollment) => {
  let w = 1; let n = 0; let hit = false;
  for (let i = 0; i < grade.pathLength + 5 && w < grade.pathLength; i++) { w = lp.nextLevelAfter(enrollment, grade, w); n += 1; if (idx.has(w)) hit = true; }
  return { n, hit };
};
const mine = walkFor(enr());
const plain = walkFor(eOther);
ok(!mine.hit, 'the learner path steps over every set-aside level');
ok(mine.n < plain.n, 'core walks fewer levels than full depth', [mine.n, plain.n]);

sg.save(user.id, 'enrollment', e.id, { goal: 'core', restore: [aside[0].level] });
ok(sg.setAsideFor(enr()).length === aside.length - 1 && !sg.setAsideFor(enr()).some((x) => x.level === aside[0].level), 'one level can be brought back');
sg.save(user.id, 'enrollment', e.id, { goal: 'core', restore: 'all' });
ok(sg.setAsideFor(enr()).length === 0, 'all can be brought back');
const lst = sg.listFor(user.id).enrollments.find((x) => x.id === e.id);
ok(lst.goal === 'core' && lst.brought_back === aside.length, 'the page list says how many were brought back', lst.brought_back);
sg.save(user.id, 'enrollment', e.id, { goal: 'full' });
ok(sg.setAsideFor(enr()).length === 0 && spec(user).isDefault, 'back to full: exactly the old behaviour');

sg.save(user.id, 'enrollment', e.id, { goal: 'test' });
const t = spec(user);
ok(t.studyGoal && t.studyGoal.id === 'test' && t.lesson.retrievalChecks > base.lesson.retrievalChecks && sg.setAsideFor(enr()).length === 0, 'test: more recall checks, nothing set aside');

sg.save(user.id, 'enrollment', e.id, { goal: 'core' });
process.env.STUDY_GOAL = 'off';
ok(spec(user).isDefault && sg.setAsideFor(enr()).length === 0, 'STUDY_GOAL=off ignores a stored goal');
delete process.env.STUDY_GOAL;

const mat = db.insert('materials', { user_id: user.id, title: 'My chapter', kind: 'text', text: 'x'.repeat(300), chars: 300 });
const course = { skills: ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, title: `Skill ${id}`, unit_id: i < 3 ? 'u1' : 'u2', prerequisites: id === 'b' ? ['a'] : id === 'c' ? ['b'] : [] })) };
const skillsAside = sg.coreSetAsideSkills(course).map((s) => s.id);
ok(skillsAside.join() === 'd', 'course core keeps prerequisites and the last skill of each unit', skillsAside);
sg.save(user.id, 'material', mat.id, { goal: 'core' });
const ms = ls.buildSpec(user.id, { materialId: mat.id, topic: 'My chapter' });
ok(ms.studyGoal && ms.studyGoal.id === 'core', 'a course goal reaches the notes and pack spec');
ok(!ls.buildSpec(other.id, { materialId: mat.id }).studyGoal, "another learner's spec ignores it");
ok(eOther && sg.setAsideFor(db.byId('enrollments', eOther.id)).length === 0, "another learner's path is unchanged");

console.log(failed ? `\n${failed} FAILED` : '\nstudy-goal-test: all passed');
try { require('fs').unlinkSync(process.env.DB_FILE); } catch { /* none */ }
process.exit(failed ? 1 : 0);
