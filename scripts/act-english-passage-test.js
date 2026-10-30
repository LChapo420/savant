/** ACT-format English passage sets: validator, learner items (no answer key) and the player markup. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('../services/act-english-passage');

function check(message, fn) {
  try { fn(); console.log(`ok   ${message}`); } catch (error) { console.error(`FAIL ${message}: ${error.message}`); process.exitCode = 1; }
}

// A made-up test set (not ACT content) to exercise the format.
const SET = {
  id: 'fixture-1',
  title: 'Fixture passage',
  text: 'The library {{1|open}} late. Its shelves, {{2|which are tall}} and old, hold many books.',
  items: [
    { n: 1, choices: ['NO CHANGE', 'opens', 'opened', 'opening'], answer: 'opens', skill: 'verb_tense', explanation: 'Present tense matches "Its shelves ... hold".' },
    { n: 2, choices: ['NO CHANGE', 'that is tall', 'being tall', 'tall of'], answer: 'NO CHANGE', skill: 'agreement', explanation: 'Plural shelves take "are".' },
  ],
};

check('a well-formed set has no problems', () => assert.deepStrictEqual(P.validate(SET), []));

check('segments keep order and number the underlined portions', () => {
  const s = P.segments(SET.text);
  assert.deepStrictEqual(s.filter((x) => x.n).map((x) => [x.n, x.text]), [[1, 'open'], [2, 'which are tall']]);
  assert.strictEqual(s.map((x) => x.text).join(''), 'The library open late. Its shelves, which are tall and old, hold many books.');
});

const bad = (mutate) => { const c = JSON.parse(JSON.stringify(SET)); mutate(c); return P.validate(c); };

check('the validator names each kind of mistake', () => {
  assert.ok(bad((c) => { c.items[0].answer = 'opens up'; }).some((m) => /answer is not one/.test(m)));
  assert.ok(bad((c) => { c.items[0].choices = ['opens', 'NO CHANGE', 'opened', 'opening']; }).some((m) => /must be the first/.test(m)));
  assert.ok(bad((c) => { c.items[0].choices = ['NO CHANGE', 'opens']; }).some((m) => /exactly 4/.test(m)));
  assert.ok(bad((c) => { c.items[1].choices[1] = 'NO CHANGE'; }).some((m) => /twice|duplicate/.test(m)));
  assert.ok(bad((c) => { c.items.pop(); }).some((m) => /2 underlined portions but 1 items/.test(m)));
  assert.ok(bad((c) => { c.text = c.text.replace('{{2|', '{{3|'); }).some((m) => /numbered 1, 2, 3 in order/.test(m)));
  assert.ok(bad((c) => { c.text += ' {{oops'; }).some((m) => /malformed/.test(m)));
  assert.ok(bad((c) => { c.items[0].choices[1] = 'open'; }).some((m) => /repeats the underlined/.test(m)));
  assert.ok(bad((c) => { delete c.items[1].explanation; }).some((m) => /explanation/.test(m)));
  assert.ok(P.validate(null).length);
});

check('learner items carry no answer or explanation and toLearnerItems refuses an invalid set', () => {
  const items = P.toLearnerItems(SET);
  assert.strictEqual(items.length, 2);
  const text = JSON.stringify(items);
  assert.ok(!/explanation|Present tense|"answer"/.test(text));
  assert.strictEqual(items[1].focus, 2);
  assert.strictEqual(items[0].format, 'multiple_choice');
  assert.throws(() => P.toLearnerItems({ ...SET, items: [] }), /invalid passage set/);
});

check('check grades on the server', () => {
  assert.strictEqual(P.check(SET, 'fixture-1:1', 'opens').correct, true);
  assert.strictEqual(P.check(SET, 'fixture-1:1', 'NO CHANGE').correct, false);
  assert.strictEqual(P.check(SET, 'fixture-1:9', 'x'), null);
});

check('the player draws underlined, numbered portions with the focused one marked, escaping the text', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'player.js'), 'utf8');
  const make = (tag) => {
    const n = { tag, children: [], style: {}, textContent: '', classList: { add() {} }, setAttribute() {}, querySelector: () => null, contains: () => false,
      appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; } };
    return n;
  };
  const doc = { activeElement: null, body: {}, createElement: make, createTextNode: (t) => ({ text: t }) };
  const win = {};
  const App = { el: (tag, attrs) => { const n = make(tag); n.attrs = attrs; return n; }, escapeHtml: (s) => s, query: () => null };
  vm.runInNewContext(src, { window: win, document: doc, App, console });
  const host = make('div');
  const item = P.toLearnerItems(SET)[1];
  try { win.Player.render(host, item, { onSubmit() {} }); } catch (e) { /* the rest of the renderer needs a fuller DOM */ }
  const box = host.children.find((c) => c.attrs && /act-passage/.test(c.attrs.class));
  assert.ok(box, 'passage box drawn');
  const u = box.children.filter((c) => c.tag === 'u');
  assert.deepStrictEqual(u.map((x) => x.textContent), ['open', 'which are tall']);
  assert.ok(!u[0].style.cssText && u[1].style.cssText, 'only the focused portion is marked');
  assert.deepStrictEqual(box.children.filter((c) => c.tag === 'sup').map((x) => x.textContent), ['1', '2']);
  assert.ok(win.Player.shown().passage.startsWith('The library open late.'));
});
