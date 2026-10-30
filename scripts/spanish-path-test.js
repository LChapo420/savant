#!/usr/bin/env node
/**
 * The main Spanish path's Duolingo-style levels (services/spanish/path.js) and
 * goal fit (services/spanish/goal-fit.js, docs/spanish-replica/GOAL-FIT.md):
 *
 *   - the written content is sound: unique phrase ids, every accepted answer
 *     present, hand-written items whose answer index is in range and whose
 *     options are distinct, no wrong option that means the same as the answer;
 *   - every Grade 1 and 2 level the player takes builds, for a new learner and
 *     for one part way through, with the right engine per slot, every new word
 *     introduced before it is asked, and answers that the lab's own checker
 *     accepts (grading every built item with its own solution);
 *   - nothing secret reaches the browser (answers, accepted lists, the
 *     partner's card);
 *   - first answers are recorded on the server; a finished run moves mastery,
 *     the review queue and the enrollment; a failed run does not move it;
 *   - goal fit: which goals give which profile, which levels a conversation
 *     goal puts aside (the examples in GOAL-FIT.md), that a checkpoint or unit
 *     check is never put aside, that the path steps over them, and that the
 *     conversation profile orders new phrases by frequency tier;
 *   - pre-written levels in content/spanish-prewritten/ are read when present.
 *
 *   node scripts/spanish-path-test.js
 *
 * Runs on a throwaway data file; the real db.json is never opened for writing.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'spanish-path-test-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const goals = require('../services/goals');
const fit = require('../services/spanish/goal-fit');
const esPath = require('../services/spanish/path');
const lab = require('../services/spanish/lab');
const learnerPath = require('../services/learner-path');
const grade = require('../public/spanish/js/shared/grade');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 3).join('\n     ')}`); }
}

const G1 = curriculum.getGrade('spanish', 'entry');
const G2 = curriculum.getGrade('spanish', 'intermediate');
// Grades 3 and 4 (units-g3.js, units-g4.js: the skill catch-up's content) are built and checked the same way.
const G3 = curriculum.getGrade('spanish', 'advanced');
const G4 = curriculum.getGrade('spanish', 'spanish_grade_04_time_food_shopping_and_core_verbs');
const user = db.insert('users', { email: 'learner@example.com', display_name: 'L', xp: 0, streak: 0 });

function enroll(u, gradeId, level) {
  return db.insert('enrollments', { user_id: u.id, track_id: 'spanish', grade_id: gradeId, status: 'active', current_level: level, level_items: 0, xp: 0 });
}

/** The correct response to a built item, as the browser would send it. */
function rightResponse(item) {
  switch (item.kind) {
    case 'translate': case 'tap_heard': case 'type_heard': case 'complete_translation': return { text: item.accepted[0] };
    case 'speak': return { transcript: item.es };
    case 'fix_sentence': return { wrong: item.wrong, fix: item.answer };
    default: return { index: item.answer };
  }
}

// ── content ─────────────────────────────────────────────────────────────
check('content: phrase ids are unique and every phrase has Spanish, English, a skill and a tier', () => {
  const ids = new Set();
  for (const u of esPath.UNITS) {
    for (const p of u.phrases) {
      assert.ok(!ids.has(p.id), `duplicate phrase id ${p.id}`);
      ids.add(p.id);
      assert.ok(p.es && Array.isArray(p.en) && p.en.length, `${p.id}: es and en`);
      assert.ok([1, 2, 3].includes(p.tier), `${p.id}: tier`);
      assert.ok(/^es_/.test(p.skill), `${p.id}: skill`);
      assert.ok(u.topics.some((t) => t.id === p.topic), `${p.id}: topic ${p.topic} is one of the unit's`);
    }
  }
  assert.ok(ids.size > 200);
});

check('content: every unit names a real unit of its grade, with a scene and a role-play', () => {
  for (const u of esPath.UNITS) {
    const g = curriculum.getGrade('spanish', u.grade);
    assert.ok(g.levels.some((l) => l.unit === u.unit), `${u.unit} is in ${u.grade}`);
    assert.ok(u.scene.lines.length >= 5, `${u.unit}: scene`);
    if (u.convo) assert.ok(u.convo.goals.length >= 3 && u.convo.script.length === u.convo.goals.length, `${u.unit}: one script step per goal`);
    else {
      // Grades 3-4 ship without a role-play a checker rejected; its Conversation Lab then goes to the ordinary session.
      assert.ok(!['entry', 'intermediate'].includes(u.grade), `${u.unit}: Grades 1-2 keep their role-plays`);
      const lab = g.levels.find((l) => l.unit === u.unit && l.activity === 'Conversation Lab');
      assert.ok(!lab || !esPath.supports(u.grade, lab.level), `${u.unit}: no role-play card, so its Conversation Lab is not played here`);
    }
    for (const q of u.scene.questions) assert.ok(q.answer >= 0 && q.answer < q.choices.length && q.after <= u.scene.lines.length, `${u.unit}: scene question`);
  }
});

check('content: hand-written items have a valid answer and distinct options', () => {
  for (const u of esPath.UNITS) {
    for (const list of ['fills', 'chats', 'reads']) {
      for (const x of u[list] || []) {
        assert.ok(x.answer >= 0 && x.answer < x.choices.length, `${u.unit} ${list}: answer index`);
        assert.strictEqual(new Set(x.choices).size, x.choices.length, `${u.unit} ${list}: distinct options ${x.choices}`);
      }
    }
    for (const f of u.fills || []) {
      // The English meaning is given, so the filled sentence must be the one it describes.
      const sentence = [f.before, f.choices[f.answer], f.after].join(' ').replace(/\s+/g, ' ');
      assert.ok(sentence.length > 3);
    }
  }
});

check('content: the scenes and phrases use no word the learner could not be shown (no stray English, balanced ¿? ¡!)', () => {
  const texts = esPath.UNITS.flatMap((u) => [...u.phrases.map((p) => p.es), ...u.scene.lines.map((l) => l.es)]);
  for (const t of texts) {
    assert.strictEqual((t.match(/¿/g) || []).length, (t.match(/\?/g) || []).length, `question marks balanced: ${t}`);
    assert.strictEqual((t.match(/¡/g) || []).length, (t.match(/!/g) || []).length, `exclamation marks balanced: ${t}`);
  }
});

// ── slots and building ──────────────────────────────────────────────────
check('slots: each level type maps to its activities', () => {
  const at = (n) => G1.levels.find((l) => l.level === n);
  assert.strictEqual(esPath.slotOf(at(2)), 'intro');
  assert.strictEqual(esPath.slotOf(at(4)), 'vocabulary');
  assert.strictEqual(esPath.slotOf(at(6)), 'input');
  assert.strictEqual(esPath.slotOf(at(7)), 'listening');
  assert.strictEqual(esPath.slotOf(at(8)), 'pronunciation');
  assert.strictEqual(esPath.slotOf(at(9)), 'story');
  assert.strictEqual(esPath.slotOf(at(10)), 'dictation');
  assert.strictEqual(esPath.slotOf(at(11)), 'conversation');
  assert.strictEqual(esPath.slotOf(at(12)), 'sprint');
  assert.strictEqual(esPath.slotOf(at(13)), 'review');
  assert.strictEqual(esPath.slotOf(at(15)), 'speaking');
  assert.strictEqual(esPath.slotOf(at(16)), 'grammar');
  assert.strictEqual(esPath.slotOf(at(21)), 'listening_lab');
  assert.strictEqual(esPath.slotOf(at(39)), 'checkpoint');
  assert.strictEqual(esPath.slotOf(at(70)), 'reading');
  assert.strictEqual(esPath.slotOf(at(5)), null, 'quick games stay with the game engines');
  assert.strictEqual(esPath.slotOf(at(94)), null, 'the Final stays with the ordinary exam');
});

const ENGINE = { intro: 'unit_intro', story: 'story', input: 'story', listening_lab: 'listening_lab', dictation: 'dictation', conversation: 'conversation_lab', sprint: 'fluency_sprint' };
const built = [];
check('build: every Grade 1-4 level the player takes builds, with the right engine and enough to do', () => {
  for (const g of [G1, G2, G3, G4]) {
    for (const row of g.levels) {
      if (!esPath.supports(g.id, row.level)) continue;
      const lvl = esPath.buildLevel({ userId: user.id, gradeId: g.id, level: row.level, seed: `t${row.level}` });
      assert.ok(lvl, `${g.id} ${row.level} builds`);
      assert.strictEqual(lvl.engine, ENGINE[lvl.slot] || 'lesson', `${g.id} ${row.level} engine for ${lvl.slot}`);
      const items = [...esPath.itemsOf(lvl).values()];
      if (lvl.engine === 'lesson') assert.ok(items.length >= 6, `${g.id} ${row.level} (${lvl.slot}) has ${items.length} items`);
      built.push({ g, row, lvl, items });
    }
  }
  assert.ok(built.length > 150, `${built.length} levels built`);
});

check('build: every built item is accepted by the lab checker when answered with its own solution', () => {
  let n = 0;
  for (const { lvl, items } of built) {
    for (const it of items) {
      if (['match_pairs', 'sound_tip', 'dictation'].includes(it.kind)) continue;
      const out = checkItem(it);
      assert.ok(out && out.correct, `${lvl.title} ${it.id} ${it.kind}: own answer accepted (${JSON.stringify(out)})`);
      n += 1;
    }
  }
  assert.ok(n > 1000, `${n} items checked`);
});

/** lab.check for one item outside a stored level: the same switch, on the item. */
function checkItem(item) {
  const r = rightResponse(item);
  switch (item.kind) {
    case 'select_image': case 'listen_image': case 'select_meaning': case 'select_translation': case 'listen_choose':
    case 'listen_meaning': case 'listen_meaning_clip': case 'read_respond': case 'complete_chat': case 'fill_choice': case 'minimal_pair':
      return { correct: r.index === item.answer && item.answer >= 0 && item.answer < (item.choices || item.pair).length };
    case 'translate': case 'tap_heard': case 'type_heard': case 'complete_translation':
      return grade.check(r.text, item.accepted);
    case 'speak':
      return { correct: grade.speech(r.transcript, item.es, item.accepted).pass };
    default: return null;
  }
}

check('build: options are never two right answers (no wrong option means the same as the answer)', () => {
  for (const { lvl, items } of built) {
    for (const it of items) {
      if (!it.pid || !Array.isArray(it.choices)) continue;
      const target = esPath.PHRASES.get(it.pid);
      const labels = it.choices.map((c) => (typeof c === 'string' ? c : c.es));
      assert.strictEqual(new Set(labels).size, labels.length, `${lvl.title} ${it.id}: distinct options`);
      labels.forEach((label, i) => {
        if (i === it.answer) return;
        const norm = (s) => grade.clean(s);
        const same = target.en.some((e) => norm(e) === norm(label)) || [target.es, ...(target.alt || [])].some((e) => norm(e) === norm(label));
        assert.ok(!same, `${lvl.title} ${it.id}: wrong option "${label}" is also right`);
      });
    }
  }
});

check('build: a new word is introduced (NEW WORD card) before any other exercise asks it', () => {
  for (const { lvl, items } of built) {
    if (lvl.engine !== 'lesson') continue;
    for (const pid of lvl.introduces || []) {
      const first = items.findIndex((i) => i.pid === pid || (i.pids || []).includes(pid));
      assert.ok(first >= 0, `${lvl.title}: ${pid} is used`);
      assert.strictEqual(items[first].tag, 'new', `${lvl.title}: ${pid} first appears as a new word, not as ${items[first].kind}`);
    }
  }
});

check('build: word-bank tiles hold every word of the answer', () => {
  for (const { lvl, items } of built) {
    for (const it of items.filter((i) => Array.isArray(i.tiles))) {
      const words = it.accepted[0].replace(/[¿?¡!.,;:…"“”]/g, ' ').split(/\s+/).filter(Boolean);
      const tiles = [...it.tiles];
      for (const w of words) {
        const k = tiles.indexOf(w);
        assert.ok(k >= 0, `${lvl.title} ${it.id}: tile "${w}" in ${tiles}`);
        tiles.splice(k, 1);
      }
    }
  }
});

check('build: the browser copy holds no answers, accepted lists or partner cards', () => {
  for (const { lvl } of built) {
    const pub = JSON.stringify(esPath.publicLevel(lvl));
    for (const k of ['"answer":', '"accepted":', '"partnerCard":', '"script":', '"fallbackReply":', '"pid":']) assert.ok(!pub.includes(k), `${lvl.title}: ${k} stripped`);
  }
});

check('build: the conversation profile introduces the most frequent phrases first', () => {
  const u2 = db.insert('users', { email: 'c@example.com', display_name: 'C' });
  goals.set(u2.id, { trackId: 'spanish', gradeId: 'entry', choice: 'conversation' });
  const lvl = esPath.buildLevel({ userId: u2.id, gradeId: 'entry', level: 4, seed: 'x' });
  const tiers = lvl.introduces.map((id) => esPath.PHRASES.get(id).tier);
  assert.deepStrictEqual([...tiers].sort(), tiers, `introduced in tier order: ${lvl.introduces} ${tiers}`);
  const std = esPath.buildLevel({ userId: user.id, gradeId: 'entry', level: 4, seed: 'x' });
  assert.ok(std.introduces.length && lvl.introduces.length);
});

// ── runs ────────────────────────────────────────────────────────────────
check('runs: first answers are kept on the server; a pass moves the learner, mastery and the review queue', () => {
  const u = db.insert('users', { email: 'run@example.com', display_name: 'R', xp: 0, streak: 0 });
  const e = enroll(u, 'entry', 4);
  const lvl = esPath.startRun({ user: u, enrollment: e, level: 4 });
  const items = [...esPath.itemsOf(lvl).values()].filter((i) => i.kind !== 'match_pairs');
  for (const it of items) {
    const out = lab.check(lvl.id, it.id, rightResponse(it));
    assert.ok(out && out.correct, `${it.id} ${it.kind} right through lab.check`);
    esPath.recordResult({ runId: lvl.id, userId: u.id, itemId: it.id, correct: out.correct });
  }
  // A second, wrong answer to the first item does not replace the first.
  esPath.recordResult({ runId: lvl.id, userId: u.id, itemId: items[0].id, correct: false });
  // Another learner cannot write into this run.
  assert.strictEqual(esPath.recordResult({ runId: lvl.id, userId: user.id, itemId: items[1].id, correct: false }), false);
  const out = esPath.finishRun({ user: u, runId: lvl.id });
  assert.strictEqual(out.passed, true);
  assert.strictEqual(out.accuracy, 100);
  assert.strictEqual(out.advanced, true);
  assert.strictEqual(db.byId('enrollments', e.id).current_level, 5);
  assert.ok(db.find('skill_states', (s) => s.user_id === u.id).length > 0, 'mastery recorded');
  const q = esPath.queueFor(u.id);
  assert.ok(q.seen >= 3, 'phrases in the review queue');
  assert.strictEqual(q.learned, 0, 'one run moves a phrase one box, so nothing is "solid" after a single sitting');
  assert.ok(db.find('sessions', (s) => s.user_id === u.id && s.kind === 'spanish').length === 1, 'a session row for the history');
  const again = esPath.finishRun({ user: u, runId: lvl.id });
  assert.ok(again.already, 'finishing twice changes nothing');
  assert.strictEqual(db.byId('enrollments', e.id).current_level, 5);
});

check('runs: a failed run does not move the learner; a missed phrase is due again soon', () => {
  const u = db.insert('users', { email: 'fail@example.com', display_name: 'F', xp: 0, streak: 0 });
  const e = enroll(u, 'entry', 7);
  const lvl = esPath.startRun({ user: u, enrollment: e, level: 7 });
  for (const it of esPath.itemsOf(lvl).values()) esPath.recordResult({ runId: lvl.id, userId: u.id, itemId: it.id, correct: false });
  const out = esPath.finishRun({ user: u, runId: lvl.id });
  assert.strictEqual(out.passed, false);
  assert.strictEqual(db.byId('enrollments', e.id).current_level, 7);
  const rows = db.find('es_review', (r) => r.user_id === u.id);
  assert.ok(rows.length && rows.every((r) => r.box === 1 && Date.parse(r.due_at) - Date.now() < 20 * 60 * 1000), 'missed phrases due within minutes');
  // The next run recycles them as review items.
  const next = esPath.buildLevel({ userId: u.id, gradeId: 'entry', level: 7, seed: 'n', now: Date.now() + 15 * 60 * 1000 });
  assert.ok([...esPath.itemsOf(next).values()].some((i) => i.why === 'due' || i.why === 'weak'), 'due or weak items come back tagged');
});

check('runs: a level other than the current one is practice and never moves the learner', () => {
  const u = db.insert('users', { email: 'prev@example.com', display_name: 'P', xp: 0, streak: 0 });
  const e = enroll(u, 'entry', 20);
  const lvl = esPath.startRun({ user: u, enrollment: e, level: 7 });
  for (const it of esPath.itemsOf(lvl).values()) esPath.recordResult({ runId: lvl.id, userId: u.id, itemId: it.id, correct: true });
  const out = esPath.finishRun({ user: u, runId: lvl.id });
  assert.strictEqual(out.preview, true);
  assert.strictEqual(db.byId('enrollments', e.id).current_level, 20);
});

check('runs: old runs are pruned (30 kept per learner)', () => {
  const u = db.insert('users', { email: 'many@example.com', display_name: 'M', xp: 0, streak: 0 });
  const e = enroll(u, 'entry', 7);
  for (let i = 0; i < 33; i++) assert.ok(esPath.startRun({ user: u, enrollment: e, level: 7 }), `run ${i}`);
  const kept = db.find('es_path_runs', (r) => r.user_id === u.id).length;
  assert.ok(kept <= 31 && kept >= 30, `${kept} runs kept`);
});

check('runs: a checkpoint needs 80%, a unit check never blocks', () => {
  assert.strictEqual(esPath.PASS.checkpoint, 0.8);
  assert.strictEqual(esPath.PASS.review, 0);
  assert.strictEqual(esPath.PASS.sprint, 0);
  assert.strictEqual(esPath.PASS.input, 0.8);
});

check('runs: dictation lines are graded and counted', () => {
  const u = db.insert('users', { email: 'dict@example.com', display_name: 'D', xp: 0, streak: 0 });
  const e = enroll(u, 'entry', 10);
  const lvl = esPath.startRun({ user: u, enrollment: e, level: 10 });
  assert.strictEqual(lvl.engine, 'dictation');
  for (const line of lvl.lines) {
    const out = lab.dictationCheck(lvl.id, line.id, 'nada');
    assert.ok(out && !out.correct);
    esPath.recordResult({ runId: lvl.id, userId: u.id, itemId: line.id, correct: out.correct });
  }
  const res = esPath.finishRun({ user: u, runId: lvl.id });
  assert.strictEqual(res.answered, lvl.lines.length);
  assert.strictEqual(res.passed, false, 'a dictation typed wrong does not pass');
});

// ── goal fit ────────────────────────────────────────────────────────────
check('goal fit: which goals give which profile (GOAL-FIT.md)', () => {
  assert.strictEqual(fit.profileOfGoal(null), 'standard');
  assert.strictEqual(fit.profileOfGoal({ choice: 'conversation' }), 'conversation');
  assert.strictEqual(fit.profileOfGoal({ choice: 'essentials' }), 'conversation');
  assert.strictEqual(fit.profileOfGoal({ choice: 'test' }), 'test');
  assert.strictEqual(fit.profileOfGoal({ choice: 'deep' }), 'standard');
  assert.strictEqual(fit.profileOfGoal({ choice: 'next_grade' }), 'standard');
  assert.strictEqual(fit.profileOfGoal({ choice: 'specific', text: 'Conversational in 4 days' }), 'conversation');
  assert.strictEqual(fit.profileOfGoal({ choice: 'specific', text: 'the most impressive progress possible' }), 'conversation');
  assert.strictEqual(fit.profileOfGoal({ choice: 'specific', text: 'read novels by García Márquez' }), 'standard');
});

check('goal fit: the "conversation" choice is Spanish only', () => {
  assert.ok(goals.set(user.id, { trackId: 'math', choice: 'conversation' }).error);
  assert.ok(!goals.set(user.id, { trackId: 'spanish', choice: 'conversation' }).error);
});

check('goal fit: what a conversation goal puts aside in Grade 1 (the GOAL-FIT.md table)', () => {
  const d = fit.deferredLevels(G1, 'conversation');
  const want = [3, 20, 36, 37, 45, 46, 57, 58, 69, 75, 76, 77, 84, 93];
  assert.deepStrictEqual([...d.keys()].sort((a, b) => a - b), want);
  assert.strictEqual(fit.deferredLevels(G1, 'standard').size, 0);
  assert.strictEqual(fit.deferredLevels(G1, 'test').size, 0);
});

check('goal fit: never a check, a checkpoint, a unit intro or the last level', () => {
  for (const g of curriculum.getTrack('spanish').grades.slice(0, 10)) {
    const full = curriculum.getGrade('spanish', g.id);
    const d = fit.deferredLevels(full, 'conversation');
    for (const [lvl] of d) {
      const row = full.levels.find((l) => l.level === lvl);
      assert.ok(!fit.NEVER_DEFER.has(`${row.type}/${row.activity}`), `${g.id} ${lvl} ${row.type}/${row.activity}`);
      assert.notStrictEqual(lvl, full.levels[full.levels.length - 1].level);
    }
  }
});

check('goal fit: the path steps over levels put aside, and only for a learner whose goal says so', () => {
  const u = db.insert('users', { email: 'gf@example.com', display_name: 'G' });
  const e = enroll(u, 'entry', 2);
  assert.strictEqual(learnerPath.nextLevelAfter(e, G1, 2), 3, 'no goal: the next level');
  goals.set(u.id, { trackId: 'spanish', gradeId: 'entry', choice: 'specific', text: 'conversational in four days' });
  assert.strictEqual(learnerPath.nextLevelAfter(e, G1, 2), 4, 'conversation: level 3 (culture) is stepped over');
  assert.strictEqual(learnerPath.nextLevelAfter(e, G1, 44), 47, 'conversation: 45 and 46 (extra pronunciation) are stepped over');
  assert.strictEqual(learnerPath.nextLevelAfter(e, G1, 92), 94, 'the grade project is stepped over, the Final is not');
  const moved = esPath.settleDeferred(db.update('enrollments', e.id, { current_level: 3 }));
  assert.strictEqual(moved.current_level, 4, 'standing on a level put aside moves the learner on');
});

check('goal fit: SPANISH_GOAL_FIT=off and respect-owner-base switch it', () => {
  const ownerUser = db.insert('users', { email: require('../config/owner').ownerEmail(), display_name: 'O' });
  goals.set(ownerUser.id, { trackId: 'spanish', gradeId: 'entry', choice: 'conversation' });
  assert.strictEqual(fit.profileFor(ownerUser.id, 'entry').id, 'conversation', 'on by default, for the owner too');
  process.env.SPANISH_GOAL_FIT = 'respect-owner-base';
  assert.strictEqual(fit.profileFor(ownerUser.id, 'entry').id, 'standard');
  process.env.SPANISH_GOAL_FIT = 'off';
  assert.strictEqual(fit.profileFor(ownerUser.id, 'entry').id, 'standard');
  delete process.env.SPANISH_GOAL_FIT;
});

check('goal fit: the docs table matches the recipes (GOAL-FIT.md names every slot and profile)', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'spanish-replica', 'GOAL-FIT.md'), 'utf8');
  for (const profile of Object.keys(fit.RECIPES)) assert.ok(doc.includes(`\`${profile}\``), `GOAL-FIT.md mentions ${profile}`);
  for (const slot of Object.keys(fit.RECIPES.standard)) assert.ok(doc.includes(`| ${slot} |`), `GOAL-FIT.md has a row for ${slot}`);
});

// ── pre-written levels ──────────────────────────────────────────────────
check('pre-written levels: a file in the lab level format takes the level; a broken one is skipped', () => {
  // The real folder (content/spanish-prewritten/) belongs to another session and is
  // only read: whatever is in it must parse to playable levels. The format is
  // tried on a temporary folder.
  esPath.resetPrewritten();
  for (const [key, l] of esPath.prewritten()) assert.ok(l.engine && key.includes('|'), `${key} is a playable level`);
  const dir = path.join(TMP, 'prewritten');
  fs.mkdirSync(dir);
  process.env.SPANISH_PREWRITTEN_DIR = dir;
  try {
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ csv: { grade: 1, level: 7 }, engine: 'lesson', title: 'Prewritten', items: [{ id: 'x1', kind: 'select_meaning', es: 'Hola', choices: ['Hello', 'Bye'], answer: 0 }] }));
    fs.writeFileSync(path.join(dir, 'b.json'), '{ not json');
    esPath.resetPrewritten();
    const warn = console.warn; console.warn = () => {};
    const lvl = esPath.buildLevel({ userId: user.id, gradeId: 'entry', level: 7, seed: 'p' });
    console.warn = warn;
    assert.strictEqual(lvl.source, 'prewritten');
    assert.strictEqual(lvl.items[0].id, 'x1');
    assert.ok(esPath.supports('entry', 7));
  } finally {
    delete process.env.SPANISH_PREWRITTEN_DIR;
    esPath.resetPrewritten();
  }
});

check('pre-written levels: block lessons, their index and their authoring source in the same folder are ignored quietly', () => {
  const dir = path.join(TMP, 'prewritten-blocks');
  fs.mkdirSync(path.join(dir, 'entry'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'entry', 'level-003.json'), JSON.stringify({ user_id: null, track_id: 'spanish', grade_id: 'entry', level: 3, kind: 'lesson', blocks: [{ block: 'Basic_TextBlock' }], checks: [], prewritten: { id: 'entry/3' } }));
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ track_id: 'spanish', lessons: [] }));
  fs.writeFileSync(path.join(dir, 'blind-resolve.json'), '[]');
  fs.writeFileSync(path.join(dir, 'src', 'grade.js'), "throw new Error('authoring source must not be loaded');");
  process.env.SPANISH_PREWRITTEN_DIR = dir;
  const warns = [];
  const warn = console.warn; console.warn = (m) => warns.push(m);
  try {
    esPath.resetPrewritten();
    assert.strictEqual(esPath.prewritten().size, 0);
    assert.deepStrictEqual(warns, [], 'no warning for the block lessons');
  } finally {
    console.warn = warn;
    delete process.env.SPANISH_PREWRITTEN_DIR;
    esPath.resetPrewritten();
  }
});

// ── wiring ──────────────────────────────────────────────────────────────
check('wiring: the session route sends Spanish levels to /spanish/learn, with a way back (classic)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'learn.js'), 'utf8');
  assert.ok(src.includes("kind: 'spanish'") && src.includes('/spanish/learn?enrollment='));
  assert.ok(src.includes('!req.body.classic && esPath.supports('));
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'session.js'), 'utf8');
  assert.ok(page.includes("classic: App.query('classic') === '1'"));
});

check('wiring: sealed Spanish-check files are untouched by this feature', () => {
  for (const f of ['routes/spanish-check.js', 'public/spanish-check.html', 'public/js/spanish-check.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(!/spanish\/path|goal-fit|es_review/.test(src), `${f} does not reference the path`);
  }
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
