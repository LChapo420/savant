/**
 * Tests for the objective items (services/objective-items.js,
 * scripts/build-objective-items.js) and where they are served: the daily
 * review (memory checks, fading and durability retrievals) and the recall round
 * of record-based remediation, plus how coverage counts them.
 *
 *   node scripts/objective-items-test.js
 *
 * Runs on its own throwaway data file with every model key blanked: no model
 * call, no network, nothing real touched. Reads content/objective-items/ (the
 * built files) and writes a small fixture folder under the OS temp dir.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
const tmp = path.join(os.tmpdir(), `${path.basename(__filename, '.js')}-${process.pid}.json`);
process.env.DB_FILE = tmp;
for (const k of ['OBJECTIVE_ITEMS', 'COVERAGE_RULE', 'ADMIN_EMAILS', 'OWNER_EMAIL', 'ADAPT_OWNER', 'ADAPT_REVIEW_MINUTES']) delete process.env[k];
Object.assign(process.env, { ADAPT_REVIEW_SESSION: 'on', ADAPT_REMEDIATION: 'on', ADAPT_EFFORT: 'off', ADAPTIVE_TEACHING: 'off', COVERAGE_GATE: 'shadow' });

const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const coverage = require('../services/coverage');
const bank = require('../content/bank');
const oi = require('../services/objective-items');
const build = require('./build-objective-items');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const DAY = coverage.DAY;
const TRACK = 'math';
const GRADE = 'sense_of_quantity';
const grade = curriculum.getGrade(TRACK, GRADE);
const model = coverage.modelFor(TRACK, GRADE);
const FINAL = grade.levels.find((l) => l.kind === 'graduation').level;

function learner(email, level) {
  const user = db.insert('users', { email, name: email.split('@')[0], password_hash: 'x', streak: 0, xp: 0, onboarded: true });
  const enrollment = db.insert('enrollments', {
    user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: grade.pathLength, current_level: level,
    level_items: 0, levels_completed: 0, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date().toISOString(),
  });
  const session = db.insert('sessions', {
    user_id: user.id, enrollment_id: enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson',
    blocks: [{ index: 0, level: 1, kind: 'practice', resolved: true }], started_at: new Date(Date.now() - 120 * DAY).toISOString(), ended_at: new Date().toISOString(),
  });
  return { user, enrollment, session };
}
function answer(who, i, daysAgo, correct = true, extra = {}) {
  const o = model.objectives[i];
  return db.insert('items', {
    user_id: who.user.id, session_id: who.session.id, skill_id: o.skill, difficulty: 3, format: 'short_answer',
    prompt: `q ${i} ${daysAgo} ${Math.random()}`, answer: '1', choices: null, role: 'check', level: o.lesson_level, block: 0, index: 0,
    user_answer: correct ? '1' : '2', correct, ms: 9000, coach_used: false, answered_at: new Date(Date.now() - daysAgo * DAY).toISOString(), ...extra,
  });
}
function prove(who, i, daysAgo) { for (let k = 0; k < 5; k++) answer(who, i, daysAgo - k * 0.002); }
function keep(who, i, provenDaysAgo, checkDaysAgo) { prove(who, i, provenDaysAgo); answer(who, i, checkDaysAgo); }

function serve(routers) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  for (const r of routers) app.use('/api', r);
  app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint.' }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const call = (method, url, body, uid) => new Promise((done, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = null; } done({ status: res.statusCode, body: json, text }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

const LEAK = /"(answer|rationale|verified|accepts|objective_item_id|written_for_objective)"\s*:/;

(async () => {
  const review = require('../services/review-session');
  const sessions = require('../services/sessions');
  const remediation = require('../services/remediation');
  const app = await serve([require('../routes/review'), require('../routes/remediation'), require('../routes/learn')]);

  console.log('the built files');
  const all = oi.summary();
  check('content/objective-items/ loads: some grades, objectives and items', all.grades > 0 && all.objectives > 0 && all.items > 0, all);
  const items = oi.forGrade(TRACK, GRADE);
  check(`${TRACK}/${GRADE} has items on every objective in the file`, items.size > 0, items.size);
  const file = JSON.parse(fs.readFileSync(path.join(oi.DIR, `${TRACK}.${GRADE}.json`), 'utf8'));
  check('every stored item is marked kept, with code checks and two judges recorded', file.items.every((it) => it.kept === true && it.verified && it.verified.code === true && it.verified.judge_a && it.verified.judge_b));
  check('every stored item passes the app checks again', file.items.every((it) => !oi.problems(it, { trackId: TRACK }).length));
  check('every stored item\'s objective is in the coverage model', file.items.every((it) => model.objectives.some((o) => o.id === it.objective_id)));
  // Stored under the skill the objective had when the item was written: the
  // objective's skill, or the sheet tag grade-fit replaced (config/grade-skills.js).
  check('every stored item is on its objective\'s skill', file.items.every((it) => {
    const o = model.objectives.find((x) => x.id === it.objective_id);
    return o.skill === it.skill_id || o.sheet_skill === it.skill_id;
  }));
  {
    let dup = 0;
    for (const f of fs.readdirSync(oi.DIR).filter((x) => /^[a-z0-9_]+\.[a-z0-9_]+\.json$/.test(x))) {
      const seen = new Set();
      for (const it of JSON.parse(fs.readFileSync(path.join(oi.DIR, f), 'utf8')).items) { const k = `${it.objective_id}|${oi.norm(it.prompt)}`; if (seen.has(k)) dup++; seen.add(k); }
    }
    check('no duplicate question for one objective in any file', dup === 0, dup);
  }
  const report = JSON.parse(fs.readFileSync(path.join(oi.DIR, '_build-report.json'), 'utf8'));
  check('the build report counts what the files hold', report.counts.kept === all.items && report.objectives_with_items === all.objectives, { report: report.counts, all });

  console.log('only kept and valid items are served');
  {
    const good = { objective_id: 'x:L1', track_id: 'math', grade_id: 'g', skill_id: 'add_sub', format: 'multiple_choice', prompt: 'Sam has 3 apples and gets 2 more. How many apples does Sam have?', choices: ['4', '5', '6', '7'], answer: '5', rationale: '3 + 2 = 5.', kept: true };
    const bad = [
      ['not kept', { ...good, prompt: `${good.prompt} (a)`, kept: false }],
      ['key not among the choices', { ...good, prompt: `${good.prompt} (b)`, answer: '9' }],
      ['two choices', { ...good, prompt: `${good.prompt} (c)`, choices: ['4', '5'] }],
      ['duplicate choices', { ...good, prompt: `${good.prompt} (d)`, choices: ['5', '5', '6', '7'] }],
      ['length cue', { ...good, prompt: `${good.prompt} (e)`, choices: ['4', '5 apples in all, because three and two make five', '6', '7'], answer: '5 apples in all, because three and two make five' }],
      ['wrong arithmetic in the rationale', { ...good, prompt: `${good.prompt} (f)`, rationale: '3 + 2 = 6, so 5.' }],
      ['needs a picture', { ...good, prompt: 'Look at the picture of the apples. How many apples are there?' }],
      ['all of the above', { ...good, prompt: `${good.prompt} (g)`, choices: ['4', '5', '6', 'all of the above'] }],
      ['no rationale', { ...good, prompt: `${good.prompt} (h)`, rationale: '' }],
      ['the key written in the question', { ...good, prompt: 'Which is five apples: three apples plus two apples equals five apples?', choices: ['four apples', 'five apples', 'six apples', 'two apples'], answer: 'five apples', rationale: 'Three and two make five apples.' }],
    ];
    check('a valid item passes', oi.problems(good, { trackId: 'math' }).length === 0, oi.problems(good, { trackId: 'math' }));
    for (const [label, it] of bad) check(`rejected: ${label}`, oi.problems(it, { trackId: 'math' }).length > 0);
    // Three options (evidence 03, P11; OBJ_ITEMS_3_OPTIONS, default on).
    const three = { ...good, prompt: `${good.prompt} (three)`, choices: ['4', '5', '6'] };
    check('a 3-option item passes (OBJ_ITEMS_3_OPTIONS on by default)', oi.threeOptionsOk() && oi.problems(three, { trackId: 'math' }).length === 0, oi.problems(three, { trackId: 'math' }));
    check('a 3-option item with a repeated option is still refused', oi.problems({ ...three, choices: ['5', '5', '6'] }, { trackId: 'math' }).length > 0);
    process.env.OBJ_ITEMS_3_OPTIONS = 'off';
    check('OBJ_ITEMS_3_OPTIONS=off: exactly 4 again', oi.problems(three, { trackId: 'math' }).includes('not exactly 4 choices'));
    delete process.env.OBJ_ITEMS_3_OPTIONS;
    check('the coverage model guesses 1 in 3 on a 3-option answer', Math.abs(require('../services/coverage').guessOf({ choices: 3 }, require('../services/coverage').knobs()) - require('../services/coverage').guessOf({ choices: 4 }, require('../services/coverage').knobs()) - (1 / 3 - 1 / 4)) < 1e-9);
    // A fixture grade file read through the loader: only the valid one comes out.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oi-fixture-'));
    const fx = { track_id: 'math', grade_id: 'fixture', items: [{ ...good, grade_id: 'fixture' }, { ...good, grade_id: 'fixture' }, ...bad.map(([, it]) => ({ ...it, grade_id: 'fixture' })), { ...good, grade_id: 'other', prompt: `${good.prompt} (z)` }] };
    fs.writeFileSync(path.join(dir, 'math.fixture.json'), JSON.stringify(fx));
    const prevDir = process.env.OBJECTIVE_ITEMS_DIR;
    process.env.OBJECTIVE_ITEMS_DIR = dir;
    oi.reset();
    const served = oi.forObjective('math', 'fixture', 'x:L1');
    check('the loader serves only the one valid item (duplicate, invalid and wrong-grade rows dropped)', served.length === 1 && served[0].prompt === good.prompt, served.map((s) => s.prompt));
    if (prevDir === undefined) delete process.env.OBJECTIVE_ITEMS_DIR; else process.env.OBJECTIVE_ITEMS_DIR = prevDir;
    oi.reset();
    fs.rmSync(dir, { recursive: true, force: true });
    // The build's verification rule.
    check('build: two judges from different families pass', build.verificationProblem({ verified: { code: true, judge_a: 'minimax/minimax-m3.1-flash (blind pass)', judge_b: 'nvidia/nemotron-3-ultra-550b-a55b' } }) === null);
    check('build: two judges of one family are refused', !!build.verificationProblem({ verified: { code: true, judge_a: 'minimax/minimax-m3.1-flash', judge_b: 'minimax-m3.1-flash:free' } }));
    check('build: an unknown judge is refused', !!build.verificationProblem({ verified: { code: true, judge_a: 'minimax/minimax-m3.1-flash', judge_b: 'mystery-model' } }));
    check('build: code checks not passed are refused', !!build.verificationProblem({ verified: { code: false, judge_a: 'nvidia/nemotron-3-ultra', judge_b: 'qwen/qwen3.8-max:free' } }));
    check('build: one judge is not enough', !!build.verificationProblem({ verified: { code: true, judge_a: 'nvidia/nemotron-3-ultra' } }));
    const src = path.join(os.tmpdir(), `oi-src-${process.pid}.jsonl`);
    fs.writeFileSync(src, `${JSON.stringify({ objective: 'x:L1', items: [good], rejected: [{ ...good, prompt: 'rejected one' }] })}\n${JSON.stringify({ objective: 'x:L2', error: 'failed', items: [{ ...good, prompt: 'errored row' }] })}\n{"half-written`);
    const rowsIn = build.keptItemsIn(src);
    fs.unlinkSync(src);
    check('build: only a source\'s kept list is read (never rejected, errored or half-written rows)', rowsIn.length === 1 && rowsIn[0].prompt === good.prompt, rowsIn.map((x) => x.prompt));
  }

  console.log('pick: no repeats, keys kept server-side, fallback');
  {
    const o = model.objectives.find((x) => oi.forObjective(TRACK, GRADE, x.id).length >= 2);
    const list = oi.forObjective(TRACK, GRADE, o.id);
    const avoid = new Set();
    const got = [];
    for (let k = 0; k < list.length + 1; k++) {
      const q = oi.pick({ trackId: TRACK, gradeId: GRADE, objectiveId: o.id, avoid, difficulty: 3 });
      if (!q) { got.push(null); break; }
      got.push(q);
      avoid.add(bank.itemKey(q));
    }
    check(`all ${list.length} items for ${o.id} are served once, then none`, got.length === list.length + 1 && got[list.length] === null && new Set(got.slice(0, -1).map((q) => bank.itemKey(q))).size === list.length);
    check('a served item is marked as written for its objective', got[0].source === 'objective_item' && got[0].written_for_objective === true && !!got[0].objective_item_id);
    check('a served item keeps its key among its (shuffled) choices', got.slice(0, -1).every((q) => q.choices.includes(q.answer) && q.choices.length === 4));
    check('the shuffle does not make an asked item look new (same key)', bank.itemKey({ ...got[0], choices: [...got[0].choices].reverse() }) === bank.itemKey(got[0]));
    check('the stored verification is not carried on the served item', got.every((q) => !q || q.verified === undefined));
    const shown = sessions.sanitize({ ...got[0], id: 1, index: 0 });
    check('sanitize() sends no key, rationale or verification', !LEAK.test(JSON.stringify(shown)) && shown.answer === undefined && shown.rationale === undefined, shown);
    check('an objective with no items gives null (the bank is used)', oi.pick({ trackId: 'math', gradeId: 'numbers_to_10', objectiveId: 'numbers_to_10:L1', avoid: new Set() }) === null);
    const row = { objective: o.id, skill: o.skill, lesson_level: o.lesson_level };
    const viaReview = review.questionFor(row, grade, new Set(avoid), TRACK);
    check('the review falls back to the bank once every item was asked', viaReview && viaReview.source !== 'objective_item' && !!viaReview.prompt, viaReview && viaReview.source);
    process.env.OBJECTIVE_ITEMS = 'off';
    check('OBJECTIVE_ITEMS=off: nothing is served', oi.pick({ trackId: TRACK, gradeId: GRADE, objectiveId: o.id, avoid: new Set() }) === null);
    const offQ = review.questionFor(row, grade, new Set(), TRACK);
    check('OBJECTIVE_ITEMS=off: the review asks the bank', offQ.source !== 'objective_item');
    delete process.env.OBJECTIVE_ITEMS;
  }

  console.log('the daily review serves them');
  // A learner with most of the grade proven and kept, some due for memory checks.
  const a = learner('oi-a@example.test', model.objectives[model.objectives.length - 1].practice[0] || FINAL - 1);
  const withItems = model.objectives.map((o, i) => [o, i]).filter(([o]) => oi.forObjective(TRACK, GRADE, o.id).length);
  for (const [, i] of withItems.slice(0, 6)) prove(a, i, 2); // memory checks due
  for (const [, i] of withItems.slice(6, 10)) keep(a, i, 60, 50); // faded
  let first;
  {
    const r = await app.call('POST', `/api/review/${a.enrollment.id}/start`, {}, a.user.id);
    first = r;
    check('a review sitting opens', r.status === 201 && r.body.items.length > 0, { status: r.status, body: r.body && r.body.error });
    check('the start payload carries no key, rationale or verification', !LEAK.test(r.text), r.text.slice(0, 300));
    const rows = sessions.itemsFor(r.body.session_id);
    const onItems = rows.filter((it) => oi.forObjective(TRACK, GRADE, it.objective_id).length);
    check('every question on an objective with items is an objective item', onItems.length > 0 && onItems.every((it) => it.source === 'objective_item' && it.written_for_objective === true), rows.map((it) => [it.objective_id, it.source]));
    check('each is one of that objective\'s own items', onItems.every((it) => oi.forObjective(TRACK, GRADE, it.objective_id).some((q) => q.id === it.objective_item_id && q.prompt === it.prompt && q.answer === it.answer)));
    check('each is served on its objective\'s current skill', onItems.every((it) => model.objectives.find((o) => o.id === it.objective_id).skill === it.skill_id), onItems.map((it) => [it.objective_id, it.skill_id]).slice(0, 4));
    check('reasons include memory checks', rows.some((it) => it.review_reason === 'memory_check'));
    check('no question repeats within the sitting', new Set(rows.map((it) => bank.itemKey(it))).size === rows.length);
    check('still tagged with the objective, as a test of it', rows.every((it) => it.objective_id && it.objective_test === true && it.role === 'review'));
    for (const it of rows) {
      const res = await app.call('POST', `/api/sessions/${r.body.session_id}/answer`, { item_id: it.id, answer: it.answer, ms: 5000 }, a.user.id);
      if (!(res.status === 200 && res.body.correct === true)) check(`answer ${it.id} graded right`, false, res.body);
    }
    check('answers are graded through the ordinary route', sessions.itemsFor(r.body.session_id).every((it) => it.correct === true));
    const fin = await app.call('POST', `/api/review/sessions/${r.body.session_id}/finish`, {}, a.user.id);
    check('finish scores it', fin.status === 200 && fin.body.right === rows.length, fin.body);
  }
  {
    // The next day: no question asked yesterday comes back.
    const askedYesterday = new Set(sessions.itemsFor(first.body.session_id).map((it) => bank.itemKey(it)));
    for (const it of sessions.itemsFor(first.body.session_id)) db.update('items', it.id, { answered_at: new Date(Date.now() - 1.2 * DAY).toISOString() });
    db.update('sessions', first.body.session_id, { ended_at: new Date(Date.now() - 1.2 * DAY).toISOString() });
    for (const [, i] of withItems.slice(10, 14)) prove(a, i, 2);
    const r = await app.call('POST', `/api/review/${a.enrollment.id}/start`, {}, a.user.id);
    if (r.status === 201) {
      const rows = sessions.itemsFor(r.body.session_id);
      check('a later sitting repeats nothing asked before', rows.every((it) => !askedYesterday.has(bank.itemKey(it))), rows.length);
      db.update('sessions', r.body.session_id, { ended_at: new Date().toISOString(), abandoned: true });
    } else {
      check('a later sitting opens', false, r.body);
    }
  }

  console.log('coverage counts them as written for the objective');
  {
    const b = learner('oi-b@example.test', 1);
    const o = withItems[0][0];
    const q = oi.pick({ trackId: TRACK, gradeId: GRADE, objectiveId: o.id, avoid: new Set() });
    const base = { user_id: b.user.id, session_id: b.session.id, level: o.lesson_level, role: 'review', objective_id: o.id, objective_test: true, correct: true, ms: 8000, coach_used: false, answered_at: new Date(Date.now() - DAY).toISOString() };
    db.insert('items', { ...q, ...base, user_answer: q.answer });
    const bq = bank.generate({ skillId: o.skill, difficulty: 3, seed: 'oi-bank' });
    db.insert('items', { ...bq, ...base, user_answer: bq.answer });
    const enr = db.byId('enrollments', b.enrollment.id);
    const ans = coverage.answersFor(b.user.id, enr).filter((x) => x.objective === o.id);
    check('answersFor marks the objective item written, the tagged bank question not', ans.length === 2 && ans.filter((x) => x.written === true).length === 1 && ans.filter((x) => x.written === false).length === 1, ans);
    const st = coverage.forEnrollment(b.user.id, enr).states[model.objectives.indexOf(o)];
    check('only the objective item counts as aligned evidence', st.aligned === 1 && st.direct === 2, { aligned: st.aligned, direct: st.direct });
    process.env.OBJECTIVE_ITEMS = 'off';
    const stOff = coverage.forEnrollment(b.user.id, enr).states[model.objectives.indexOf(o)];
    check('OBJECTIVE_ITEMS=off: tagged answers count as before (both aligned)', stOff.aligned === 2, stOff.aligned);
    delete process.env.OBJECTIVE_ITEMS;
    // Synthetic answers without the flag (the simulation) are read as before.
    const sim = coverage.assess(model, [{ t: 1, correct: true, level: o.lesson_level, role: 'review', skill: o.skill, choices: 4, ms: 8000, coach: false, objective: o.id }]);
    check('an answer with no written flag (the simulation) is read as before', sim[model.objectives.indexOf(o)].aligned === 1);
  }

  console.log('record-based remediation recall serves them');
  {
    const c = learner('oi-c@example.test', FINAL);
    for (let i = 0; i < model.objectives.length; i++) keep(c, i, 90, 85);
    const s = db.insert('sessions', {
      user_id: c.user.id, enrollment_id: c.enrollment.id, track_id: TRACK, grade_id: GRADE, level: FINAL, kind: 'graduation',
      blocks: [{ index: 0, level: FINAL, kind: 'graduation', resolved: false }], started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
    });
    const avoid = new Set();
    for (let i = 0; i < 10; i++) {
      const q = bank.generate({ skillId: model.objectives[0].skill, difficulty: 3, seed: `oif${i}`, avoid });
      avoid.add(bank.itemKey(q));
      db.insert('items', { ...q, session_id: s.id, user_id: c.user.id, role: 'exam', level: FINAL, block: 0, index: i, user_answer: i < 3 ? 'x' : q.answer, correct: i >= 3, ms: 6000, coach_used: false, answered_at: new Date().toISOString() });
    }
    const row = remediation.open({ userId: c.user.id, session: s, enrollment: db.byId('enrollments', c.enrollment.id), kind: 'graduation', accuracy: 0.7, required: 0.9 });
    const rec = db.byId('remediations', row.id).record;
    check('a missed Final has objectives to recall', rec && rec.retrieve.length > 0, rec && rec.retrieve.length);
    const r = await app.call('POST', `/api/remediation/${row.id}/recall`, {}, c.user.id);
    check('the recall round opens', r.status === 201 && r.body.items.length === rec.retrieve.length, { status: r.status, body: r.body && r.body.error });
    check('the recall payload carries no key, rationale or verification', !LEAK.test(r.text));
    const rows = sessions.itemsFor(r.body.session_id);
    const onItems = rows.filter((it) => oi.forObjective(TRACK, GRADE, it.objective_id).length);
    check('recall asks objective items where the objective has them', onItems.length > 0 && onItems.every((it) => it.source === 'objective_item'), rows.map((it) => [it.objective_id, it.source]));
    check('no recall question repeats within the round', new Set(rows.map((it) => bank.itemKey(it))).size === rows.length);
    const one = rows[0];
    const res = await app.call('POST', `/api/sessions/${r.body.session_id}/answer`, { item_id: one.id, answer: one.answer, ms: 5000 }, c.user.id);
    check('a recall answer is graded and the key revealed only after answering', res.status === 200 && res.body.correct === true, res.body);
  }

  app.close();
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  process.exit(1);
});
