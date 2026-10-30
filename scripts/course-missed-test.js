/**
 * Never drop part of an upload silently (S2c): a part of the material whose outline call fails every time is
 * recorded, tried once more, reported to the learner with a retry, and counted in the coverage.
 *
 *   node scripts/course-missed-test.js
 *
 * Throwaway db; the model is a mock with the shape of ai.structuredDetail, so no real call is made.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `course-missed-test-${process.pid}.json`);

const db = require('../config/db');
const materials = require('../services/materials');
const cb = require('../services/course-builder');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// 30 paragraphs of about 1,300 characters: one passage each, three outline windows.
const N = 30;
const topic = (i) => `Topic number ${i + 1} explains the idea called concept${i + 1} in the study material.`;
const filler = 'The idea depends on the ones before it and each part has a job to do in the whole. ';
const para = (i) => `${topic(i)} ${filler.repeat(15)}`.slice(0, 1300);
const TEXT = Array.from({ length: N }, (_, i) => para(i)).join('\n\n');

/** Mock model. `state.broken` holds the first passage id of each window whose outline call never answers. */
function mockLlm(state) {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    if (args.task === 'material_outline') {
      const ids = [...args.user.matchAll(/^\[(p\d+)\]/gm)].map((m) => m[1]);
      const first = ids[0];
      if (state.broken.has(first)) return null;
      const win = first;
      return { model: 'mock', data: { skills: [{ id: `w${win}_${first}`, title: `Concept ${first}`, summary: 'A concept.', unit: `Unit ${win}`, prerequisites: [], passage_ids: [first] }] } };
    }
    if (args.task === 'material_lesson') {
      const pid = /\[(p\d+)\]/.exec(args.user)[1];
      const n = Number(pid.slice(1));
      const quote = topic(n - 1);
      const q = (i) => ({ type: 'multiple_choice', prompt: `Question ${i} about ${pid}?`, choices: ['one', 'two', 'three'], answer_index: 1, explanation: 'Because the passage says so.', passage_id: pid, quote });
      return { model: 'mock', data: { lesson: { paragraphs: ['Short lesson.'], key_points: ['Key.'] }, questions: [q(1), q(2), q(3), q(4)] } };
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
const outlineCalls = (llm) => llm.calls.filter((a) => a.task === 'material_outline');

(async () => {
  const u = db.insert('users', { email: 'a@test.invalid', role: 'learner' });
  const o = db.insert('users', { email: 'b@test.invalid', role: 'learner' });

  console.log('windows know their range');
  const ps = cb.chunk(TEXT);
  const wins = cb.outlineWindows(ps);
  check('the text is cut into three windows', wins.length === 3, wins.length);
  check('each window lists its passages and its character range', wins.every((w) => w.passage_ids.length && w.to > w.from) && wins[0].from === ps[0].start && wins[2].to === ps[ps.length - 1].end);
  check('windows do not overlap', wins.every((w, i) => i === 0 || w.from >= wins[i - 1].to));

  console.log('a healthy build misses nothing');
  const mOk = materials.addPaste(u.id, 'Healthy', TEXT).value;
  const okOut = await cb.build(u.id, mOk.id, { llm: mockLlm({ broken: new Set() }) });
  check('ready, nothing missed, full coverage', okOut.course.status === 'ready' && okOut.course.missed.length === 0 && cb.summary(okOut.course).coverage.covered === 100, okOut.course && okOut.course.missed);

  console.log('a window that fails every time');
  const state = { broken: new Set([wins[1].passage_ids[0]]) };
  const m = materials.addPaste(u.id, 'Broken middle', TEXT).value;
  const llm = mockLlm(state);
  const out = await cb.build(u.id, m.id, { llm });
  const realWins = cb.outlineWindows(cb.chunk(materials.get(u.id, m.id, true).text));
  const c = out.course;
  check('the course still builds from the other parts, as partial', c && c.status === 'partial' && out.partial === true, out.error || c.status);
  check('the failed window was tried six times in all: three, then three more', outlineCalls(llm).filter((a) => /part 2 of/.test(a.user)).length === 6, outlineCalls(llm).map((a) => /part (\d)/.exec(a.user)[1]).join());
  check('one missed part is recorded with its range', c.missed.length === 1 && c.missed[0].part === 2 && c.missed[0].of === 3 && c.missed[0].from === realWins[1].from && c.missed[0].to === realWins[1].to, [c.missed, realWins.map((w) => [w.from, w.to])]);
  check('its passages are listed', c.missed[0].passage_ids.join() === wins[1].passage_ids.join());
  check('the dropped counter still says one outline part', c.dropped.outline_parts === 1);
  const sum = cb.summary(c);
  check('the summary tells the learner in plain words and offers a retry', sum.missed.length === 1 && /could not be read into this course yet/i.test(sum.missed[0].note) && sum.missed[0].retryable === true, sum.missed);
  check('coverage counts the loss', sum.coverage.missed_chars === realWins[1].to - realWins[1].from && sum.coverage.covered < 100 && sum.coverage.covered > 50, sum.coverage);
  check('the note carries no quote, answer or text of the material', !/concept\d|Topic number|answer|quote/.test(JSON.stringify(sum.missed)));
  check('skills of the other parts were built', c.skills.length === 2 && c.skills.every((s) => s.questions.length >= 3));

  console.log('retry: the model still fails');
  const stillBroken = await cb.retryMissed(u.id, m.id, { llm: mockLlm(state) });
  check('refused with a plain reason, nothing added', stillBroken.code === 'still_missed' && stillBroken.added === 0 && stillBroken.remaining === 1, stillBroken);
  check('the course is unchanged and the part is still reported', cb.get(u.id, m.id).skills.length === 2 && cb.get(u.id, m.id).missed.length === 1);

  console.log('retry: the model recovers');
  const before = cb.get(u.id, m.id).skills.map((s) => ({ id: s.id, level: s.level, q: s.questions.map((q) => q.id).join() }));
  state.broken = new Set();
  const llm2 = mockLlm(state);
  const fixed = await cb.retryMissed(u.id, m.id, { llm: llm2 });
  check('a skill is added for the missed part', fixed.added === 1 && fixed.remaining === 0, fixed);
  const c2 = cb.get(u.id, m.id);
  check('the part is no longer missed and the course is ready', c2.missed.length === 0 && c2.status === 'ready', [c2.status, c2.missed]);
  check('coverage is back to 100', cb.summary(c2).coverage.covered === 100);
  check('existing skills keep their ids, levels and question ids', before.every((b) => { const s = c2.skills.find((x) => x.id === b.id); return s && s.level === b.level && s.questions.map((q) => q.id).join() === b.q; }));
  check('the new skill comes after them and cites the missed part', c2.skills.length === 3 && c2.skills[2].passage_ids.every((id) => wins[1].passage_ids.includes(id)));
  check('only the missed window was planned', outlineCalls(llm2).length === 1 && /part 1 of 1|Passages:/.test(outlineCalls(llm2)[0].user) && wins[1].passage_ids.every((id) => outlineCalls(llm2)[0].user.includes(`[${id}]`)) && !outlineCalls(llm2)[0].user.includes(`[${wins[0].passage_ids[0]}]`));
  check('calls are learner-class data for this learner', llm2.calls.every((a) => a.dataClass === 'learner' && a.userId === u.id));
  check('the retry is recorded for the page', c2.last_retry && c2.last_retry.ok && c2.last_retry.skills === 1);
  const none = await cb.retryMissed(u.id, m.id, { llm: mockLlm(state) });
  check('nothing left to retry', none.code === 'nothing_missed', none);

  console.log('a part past the passage cap');
  const big = Array.from({ length: 125 }, (_, i) => para(i % N)).join('\n\n');
  const mBig = materials.addPaste(u.id, 'Very long', big).value;
  const bigOut = await cb.build(u.id, mBig.id, { llm: mockLlm({ broken: new Set() }) });
  const tail = (bigOut.course.missed || []).find((x) => x.reason === 'too_long');
  check('the cut-off tail is recorded, not retryable, and counted', !!tail && cb.summary(bigOut.course).missed.find((x) => x.reason === 'too_long').retryable === false && cb.summary(bigOut.course).coverage.covered < 100, bigOut.course.missed);
  check('a tail alone does not stop the course being ready', bigOut.course.status === 'ready', bigOut.course.status);

  console.log('privacy and limits');
  check('another learner cannot retry this course', (await cb.retryMissed(o.id, m.id, { llm: mockLlm(state) })).code === 'not_found');
  const mStale = materials.addPaste(u.id, 'Stale', TEXT).value;
  state.broken = new Set([wins[2].passage_ids[0]]);
  await cb.build(u.id, mStale.id, { llm: mockLlm(state) });
  db.update('material_courses', cb.get(u.id, mStale.id).id, { text_hash: 'changed' });
  check('a changed source is not retried against old ranges', (await cb.retryMissed(u.id, mStale.id, { llm: mockLlm({ broken: new Set() }) })).code === 'stale');
  const budgetM = materials.addPaste(u.id, 'Tiny budget', TEXT).value;
  state.broken = new Set([wins[1].passage_ids[0]]);
  const tiny = await cb.build(u.id, budgetM.id, { llm: mockLlm(state), tokenBudget: 9000 });
  check('a budget stop is reported as a missed part, not hidden', !tiny.course || tiny.course.missed.every((x) => x.reason === 'budget' || x.reason === 'unreadable') || tiny.error, tiny.error || tiny.course.missed);

  console.log('wiring');
  const routes = read('routes/materials.js');
  const page = read('public/js/my-material.js');
  check('route: POST course/retry, auth, rate limited, 202', /router\.post\('\/:id\/course\/retry', requireAuth, limit\(/.test(routes) && /retryMissed\(req\.user\.id/.test(routes));
  check('the page shows the note and a retry button', /Try these parts again/.test(page) && /course\/retry/.test(page) && /\.missed/.test(page));
  check('the builder calls no provider itself', !/openrouter|anthropic|fetch\(/i.test(read('services/course-builder.js').replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '')));
  check('the sealed Spanish files are untouched', !/spanish-check/.test(read('services/course-builder.js') + routes + page));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* nothing */ }
  if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
  console.log('\nAll checks passed');
  process.exit(0);
})();
