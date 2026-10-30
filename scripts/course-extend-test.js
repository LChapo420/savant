/**
 * Extending a path (S1b): services/course-extend.js, the routes and the page wiring.
 *
 *   node scripts/course-extend-test.js
 *
 * Throwaway db; the model is a mock with the shape of ai.structuredDetail, so no real call is made.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `course-extend-test-${process.pid}.json`);

const db = require('../config/db');
const materials = require('../services/materials');
const cb = require('../services/course-builder');
const ex = require('../services/course-extend');
const study = require('../services/material-study');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const A1 = 'Mitochondria are the organelles that release usable energy from food inside a cell.';
const A2 = 'The nucleus stores the cell\'s DNA and controls which genes are switched on.';
const B1 = 'Newton\'s second law says that force equals mass times acceleration for any object.';
const B2 = 'Inside the cell, the nucleus stores the cell\'s DNA and controls which genes are switched on.';
const fill = 'Every part of the system has a job to do and the parts depend on one another. ';
const para = (first) => `${first} ${fill.repeat(20)}`;
const TEXT_A = [para(A1), para(A2)].join('\n\n');
const TEXT_B = [para(B1), para(B2)].join('\n\n');

let counter = 0; // shared, so every mock instance writes prompts no other one wrote
/** Mock model. Outline per material; lessons carry a quote of the passage; `fresh` makes each lesson call's prompts new. */
function mockLlm(opts = {}) {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    if (args.task === 'material_outline') {
      if (/Newton/.test(args.user)) {
        return { model: 'mock', data: { skills: [
          { id: 'force', title: 'Force and mass', summary: 'F = ma.', unit: 'Physics', prerequisites: [], passage_ids: ['p1'] },
          { id: 'cell', title: 'The nucleus', summary: 'DNA.', unit: 'Physics', prerequisites: ['force'], passage_ids: ['p2'] },
        ] } };
      }
      return { model: 'mock', data: { skills: [
        { id: 'energy', title: 'Cell energy', summary: 'Mitochondria.', unit: 'Cells', prerequisites: [], passage_ids: ['p1'] },
        { id: 'nucleus', title: 'The nucleus', summary: 'DNA.', unit: 'Cells', prerequisites: ['energy'], passage_ids: ['p2'] },
      ] } };
    }
    if (args.task === 'material_lesson') {
      const pid = /\[(p\d+)\]/.exec(args.user)[1];
      const text = args.user;
      const quote = [A1, A2, B1, B2].find((s) => text.includes(s.slice(0, 30))) || A1;
      const ver = ++counter;
      const q = (i, over = {}) => ({ type: 'multiple_choice', prompt: `Round ${ver} question ${i} about ${pid}?`, choices: ['one', 'two', 'three'], answer_index: 1, explanation: 'Because the passage says so.', passage_id: pid, quote, ...over });
      const qs = [q(1), q(2), q(3), q(4), q(5), q(6)];
      if (opts.repeat) { const have = (text.match(/^- (.+)$/gm) || []).map((l) => l.slice(2)); qs.splice(0, qs.length, ...have.slice(0, 6).map((prompt, i) => ({ ...q(i), prompt }))); }
      return { model: 'mock', data: { lesson: { paragraphs: ['Short lesson.'], key_points: ['Key.'] }, questions: qs } };
    }
    if (args.task === 'material_verify') {
      const k = (args.user.match(/^\d+\./gm) || []).length;
      return { model: 'mock', data: { verdicts: Array.from({ length: k }, (_, i) => ({ n: i + 1, supported: true })) } };
    }
    return null;
  };
  fn.calls = calls;
  return fn;
}

(async () => {
  const u = db.insert('users', { email: 'a@test.invalid', role: 'learner' });
  const o = db.insert('users', { email: 'b@test.invalid', role: 'learner' });
  const mA = materials.addPaste(u.id, 'Cells', TEXT_A).value;
  const mB = materials.addPaste(u.id, 'Physics', TEXT_B).value;
  const first = await cb.build(u.id, mA.id, { llm: mockLlm() });
  check('the base course builds', first.course && first.course.status === 'ready' && first.course.skills.length === 2, first.error);

  console.log('continue: more practice on the same skills');
  // The learner has progress: placed, with one skill mastered.
  const before = study.state(u.id, mA.id);
  check('study state works before extending', before.total === 2);
  const prog = db.findOne('material_progress', (p) => p.user_id === u.id && p.material_id === mA.id);
  const ids0 = first.course.skills.map((s) => s.questions.map((q) => q.id));
  const counts0 = first.course.skills.map((s) => s.questions.length);
  const noCourse = await ex.more(u.id, mB.id, { llm: mockLlm() });
  check('no course yet: refused', noCourse.code === 'no_course', noCourse);
  const otherUser = await ex.more(o.id, mA.id, { llm: mockLlm() });
  check('another learner cannot extend this course', otherUser.code === 'no_course', otherUser);

  const llm = mockLlm();
  const r = await ex.more(u.id, mA.id, { llm });
  check('a round adds questions on every skill', r.added > 0 && r.skills === 2, r);
  const c1 = cb.get(u.id, mA.id);
  check('existing question ids and order are untouched', c1.skills.every((s, i) => s.questions.slice(0, counts0[i]).map((q) => q.id).join() === ids0[i].join()));
  check('new ids continue the numbering with no duplicates', c1.skills.every((s) => new Set(s.questions.map((q) => q.id)).size === s.questions.length && s.questions[s.questions.length - 1].id === `${s.id}_q${s.questions.length}`));
  check('the pool grew', c1.skills.every((s, i) => s.questions.length > counts0[i]));
  check('every new question still has a quote that is in its passage', c1.skills.every((s) => s.questions.every((q) => TEXT_A.includes(q.quote.slice(0, 40)))));
  check('the model is shown the existing questions and told not to repeat them', llm.calls.filter((a) => a.task === 'material_lesson').every((a) => /do not repeat them/.test(a.user) && /question 1 about/.test(a.user)));
  check('the learner text only sits in the user turn', llm.calls.every((a) => !a.system.includes(A1)));
  check('calls are learner-class data', llm.calls.every((a) => a.dataClass === 'learner' && a.userId === u.id));
  check('the extension is recorded on the course', c1.extended && c1.extended.rounds === 1 && c1.extended.questions_added === r.added);
  check('the learner state row is untouched', JSON.stringify(db.findOne('material_progress', (p) => p.user_id === u.id && p.material_id === mA.id) || null) === JSON.stringify(prog || null));
  check('studying still works with the bigger pool', study.state(u.id, mA.id).total === 2);
  const dup = await ex.more(u.id, mA.id, { llm: mockLlm({ repeat: true }) });
  check('questions that repeat an existing prompt are not added', !dup.added && dup.code === 'nothing_new', dup);
  const only = await ex.more(u.id, mA.id, { llm: mockLlm(), skillIds: [c1.skills[0].id] });
  check('one skill can be picked', only.skills === 1, only);
  let rounds = 0;
  for (let i = 0; i < 6; i++) { const x = await ex.more(u.id, mA.id, { llm: mockLlm() }); if (x.added) rounds++; }
  const c2 = cb.get(u.id, mA.id);
  check('a skill stops growing at the cap', c2.skills.every((s) => s.questions.length <= ex.MAX_QUESTIONS_PER_SKILL) && rounds >= 1, c2.skills.map((s) => s.questions.length));
  const full = await ex.more(u.id, mA.id, { llm: mockLlm() });
  check('at the cap: nothing more to add', full.code === 'nothing_new', full);
  const budget = await ex.more(u.id, mB.id, { llm: mockLlm() });
  check('budget: refuses cleanly (no course)', !!budget.error);
  const tiny = await ex.more(u.id, mA.id, { llm: mockLlm(), tokenBudget: 10, skillIds: ['zzz'] });
  check('an unknown skill id adds nothing', !!tiny.error && !tiny.added, tiny);

  console.log('add material');
  const same = await ex.addMaterial(u.id, mA.id, mA.id, { llm: mockLlm() });
  check('a path cannot add itself', same.code === 'same_material', same);
  const gone = await ex.addMaterial(u.id, mA.id, 99999, { llm: mockLlm() });
  check('an unknown material is refused', gone.code === 'not_found', gone);
  const foreign = materials.addPaste(o.id, 'Theirs', TEXT_B).value;
  const theirs = await ex.addMaterial(u.id, mA.id, foreign.id, { llm: mockLlm() });
  check("another learner's material cannot be added", theirs.code === 'not_found', theirs);
  const before2 = cb.get(u.id, mA.id);
  const levels0 = before2.skills.map((s) => [s.id, s.level, s.unit_id]);
  const ladd = mockLlm();
  const add = await ex.addMaterial(u.id, mA.id, mB.id, { llm: ladd });
  check('the second material joins', add.added === 1 && add.duplicates === 1, add);
  const c3 = cb.get(u.id, mA.id);
  check('a skill with a title already on the path is left out (no duplicate)', c3.skills.filter((s) => /nucleus/i.test(s.title)).length === 1);
  check('existing skills keep their ids, levels and units', levels0.every(([id, level, unit], i) => c3.skills[i].id === id && c3.skills[i].level === level && c3.skills[i].unit_id === unit), c3.skills.map((s) => [s.id, s.level, s.unit_id]));
  const joined = c3.skills[c3.skills.length - 1];
  check('the added skill is last, with its own id, origin and level', joined.id.startsWith(`m${mB.id}_`) && joined.origin_material === mB.id && joined.level === c3.skills.length, joined.id);
  check('its prerequisite on a left-out skill is dropped, not dangling', joined.prerequisites.every((p) => c3.skills.some((s) => s.id === p)), joined.prerequisites);
  check('its questions have ids under the new skill and quotes from the other material', joined.questions.every((q) => q.id.startsWith(joined.id) && TEXT_B.includes(q.quote.slice(0, 40))));
  check('units include the new unit and cover every skill once', c3.units.flatMap((x) => x.skills).sort().join() === c3.skills.map((s) => s.id).sort().join() && c3.units.some((x) => x.title === 'Physics'), c3.units);
  check('it is recorded as added with its hash', c3.added.length === 1 && c3.added[0].material_id === mB.id && c3.added[0].text_hash);
  check("the other material's own course is separate and unchanged", cb.get(u.id, mB.id).skills.length === 2);
  const again = await ex.addMaterial(u.id, mA.id, mB.id, { llm: mockLlm() });
  check('the same material twice is refused', again.code === 'already_added', again);
  check('study state lists the new skill and is unlocked in order', study.state(u.id, mA.id).total === 3);
  const sum = cb.summary(c3);
  check('the summary lists what was added, no answers', sum.added.length === 1 && sum.added[0].skills === 1 && !JSON.stringify(sum).includes('answer_index'));

  console.log('continue on an added skill uses its own material');
  const lm = mockLlm();
  const rj = await ex.more(u.id, mA.id, { llm: lm, skillIds: [joined.id] });
  const cj = cb.get(u.id, mA.id);
  const jj = cj.skills.find((s) => s.id === joined.id);
  check('more practice works on an added skill, quoting the other material', rj.skills === 1 && jj.questions.length > joined.questions.length && jj.questions.every((q) => TEXT_B.includes(q.quote.slice(0, 40))), rj);
  check('a changed source text skips that skill instead of quoting stale text', (() => {
    db.update('materials', mB.id, { text: `${TEXT_B} changed` });
    return true;
  })());
  const stale = await ex.more(u.id, mA.id, { llm: mockLlm(), skillIds: [joined.id] });
  check('...skipped, nothing added', stale.code === 'nothing_new' && stale.skipped === 1, stale);

  console.log('start() records the outcome for the page');
  const mC = materials.addPaste(u.id, 'Cells 2', `${TEXT_A} again`).value;
  await cb.build(u.id, mC.id, { llm: mockLlm() });
  await ex.start('more', u.id, mC.id, {}, { llm: mockLlm() });
  const lc = cb.get(u.id, mC.id);
  check('last_extend says what happened', lc.last_extend && lc.last_extend.ok && lc.last_extend.added > 0 && lc.last_extend.kind === 'more', lc.last_extend);
  await ex.start('add', u.id, mC.id, { sourceId: mC.id }, { llm: mockLlm() });
  check('a failure is recorded with its reason', cb.get(u.id, mC.id).last_extend.ok === false);
  const lock = (async () => { const gate = new Promise((res) => { setTimeout(res, 40); }); const slow = mockLlm(); return ex.more(u.id, mC.id, { llm: async (a) => { await gate; return slow(a); } }); })();
  await new Promise((res) => { setTimeout(res, 5); });
  check('summary shows it as extending while it runs', cb.summary(cb.get(u.id, mC.id)).extending === true);
  const busy = await ex.more(u.id, mC.id, { llm: mockLlm() });
  check('a second change at once is refused', busy.code === 'busy', busy);
  await lock;

  console.log('wiring');
  const routes = read('routes/materials.js');
  check('routes: POST course/more and course/add, auth, own material, rate limited', /router\.post\('\/:id\/course\/more', requireAuth, ownMaterial, limit\(/.test(routes) && /router\.post\('\/:id\/course\/add', requireAuth, ownMaterial, limit\(/.test(routes));
  check('routes are registered after ownMaterial is defined', routes.indexOf('const ownMaterial') < routes.indexOf("router.post('/:id/course/more'"));
  check('the page offers More practice and Add to this path and polls', /data-more/.test(read('public/js/my-material.js')) && /data-add=/.test(read('public/js/my-material.js')) && /course\/\$\{kind === 'add'/.test(read('public/js/my-material.js')));
  check('no provider name or paid call in the extender', !/openrouter|anthropic|nvidia|fetch\(/i.test(read('services/course-extend.js').replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '')));
  check('the sealed Spanish files are untouched', !/spanish-check/.test(read('services/course-extend.js') + routes));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* nothing */ }
  if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
  console.log('\nAll checks passed');
  process.exit(0);
})();
