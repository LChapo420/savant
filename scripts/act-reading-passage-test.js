/** ACT-format Reading passage sets: validator, learner items (no answer key) and the player's numbered paragraphs. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('../services/act-reading-passage');

function check(message, fn) {
  try { fn(); console.log(`ok   ${message}`); } catch (error) { console.error(`FAIL ${message}: ${error.message}`); process.exitCode = 1; }
}

// A made-up test set (not ACT content) to exercise the format.
const SET = {
  id: 'read-fixture-1',
  title: 'Fixture: the lighthouse',
  genre: 'prose fiction',
  paragraphs: ['The keeper climbed the stairs each night.', 'One night the lamp failed, and he lit a fire on the rocks.', 'By morning every boat was home.'],
  items: [
    { n: 1, paragraph: 2, prompt: 'What did the keeper do when the lamp failed?', choices: ['Went to bed', 'Lit a fire', 'Rowed out', 'Called the town'], answer: 'Lit a fire', skill: 'key_details', explanation: 'Paragraph 2 says he lit a fire.' },
    { n: 2, prompt: 'What is the outcome of the night?', choices: ['A wreck', 'A rescue', 'All boats safe', 'A storm'], answer: 'All boats safe', skill: 'main_idea', explanation: 'The last paragraph.' },
  ],
};

check('a well-formed set has no problems', () => assert.deepStrictEqual(P.validate(SET), []));

const bad = (mutate) => { const c = JSON.parse(JSON.stringify(SET)); mutate(c); return P.validate(c); };

check('the validator names each kind of mistake', () => {
  assert.ok(bad((c) => { c.items[0].answer = 'Slept'; }).some((m) => /answer is not one/.test(m)));
  assert.ok(bad((c) => { c.items[0].choices = ['A', 'B']; }).some((m) => /exactly 4/.test(m)));
  assert.ok(bad((c) => { c.items[0].choices[1] = 'went to bed'; }).some((m) => /duplicate/.test(m)));
  assert.ok(bad((c) => { c.items[0].paragraph = 9; }).some((m) => /paragraph 9 does not exist/.test(m)));
  assert.ok(bad((c) => { c.paragraphs[1] = ' '; }).some((m) => /paragraph 2 is empty/.test(m)));
  assert.ok(bad((c) => { c.paragraphs = []; }).some((m) => /no paragraphs/.test(m)));
  assert.ok(bad((c) => { c.genre = 'poetry'; }).some((m) => /genre/.test(m)));
  assert.ok(bad((c) => { delete c.items[1].explanation; }).some((m) => /explanation/.test(m)));
  assert.ok(bad((c) => { c.items[1].n = 5; }).some((m) => /n must be 2/.test(m)));
  assert.ok(P.validate(null).length);
});

check('learner items carry no answer or explanation and toLearnerItems refuses an invalid set', () => {
  const items = P.toLearnerItems(SET);
  assert.strictEqual(items.length, 2);
  assert.ok(!/explanation|"answer"|Paragraph 2 says/.test(JSON.stringify(items)));
  assert.strictEqual(items[0].focus_paragraph, 2);
  assert.strictEqual(items[1].focus_paragraph, null);
  items[0].paragraphs[0] = 'changed';
  assert.strictEqual(SET.paragraphs[0], 'The keeper climbed the stairs each night.', 'paragraphs are copied, not shared');
  assert.throws(() => P.toLearnerItems({ ...SET, items: [] }), /invalid reading set/);
});

check('check grades on the server', () => {
  assert.strictEqual(P.check(SET, 'read-fixture-1:1', 'Lit a fire').correct, true);
  assert.strictEqual(P.check(SET, 'read-fixture-1:1', 'Rowed out').correct, false);
  assert.strictEqual(P.check(SET, 'read-fixture-1:9', 'x'), null);
});

check('the player numbers each paragraph and marks only the focused one', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'player.js'), 'utf8');
  const make = (tag) => ({ tag, children: [], style: {}, textContent: '', className: '', classList: { add() {} }, setAttribute() {}, querySelector: () => null, contains: () => false,
    appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; } });
  const doc = { activeElement: null, body: {}, createElement: make, createTextNode: (t) => ({ text: t }) };
  const win = {};
  const App = { el: (tag, attrs) => { const n = make(tag); n.attrs = attrs; return n; }, escapeHtml: (s) => s, query: () => null };
  vm.runInNewContext(src, { window: win, document: doc, App, console });
  const host = make('div');
  try { win.Player.render(host, P.toLearnerItems(SET)[0], { onSubmit() {} }); } catch (e) { /* the rest of the renderer needs a fuller DOM */ }
  const box = host.children.find((c) => c.className === 'passage act-reading');
  assert.ok(box, 'passage drawn');
  assert.deepStrictEqual(box.children.map((p) => p.textContent), ['1. The keeper climbed the stairs each night.', '2. One night the lamp failed, and he lit a fire on the rocks.', '3. By morning every boat was home.']);
  assert.ok(/background/.test(box.children[1].style.cssText || '') && !box.children[0].style.cssText && !box.children[2].style.cssText);
});
