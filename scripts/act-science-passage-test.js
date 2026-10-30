/** ACT-format Science passage sets: validator, learner items (no answer key) and the player's figure tables. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('../services/act-science-passage');

function check(message, fn) {
  try { fn(); console.log(`ok   ${message}`); } catch (error) { console.error(`FAIL ${message}: ${error.message}`); process.exitCode = 1; }
}

// A made-up test set (not ACT content) to exercise the format.
const SET = {
  id: 'sci-fixture-1',
  title: 'Fixture: plant growth',
  text: 'Students grew bean plants under three light levels and measured height each week.',
  figures: [
    { id: 'f1', type: 'table', title: 'Table 1', columns: ['Light', 'Height (cm)'], rows: [['Low', 4], ['Medium', 9], ['High', 14]] },
    { id: 'f2', type: 'line', title: 'Figure 2', x_label: 'Week', y_label: 'Height (cm)', series: [
      { name: 'Low', points: [{ x: 1, y: 1 }, { x: 2, y: 4 }] },
      { name: 'High', points: [{ x: 1, y: 3 }, { x: 2, y: 14 }] },
    ] },
  ],
  items: [
    { n: 1, figure: 'f1', prompt: 'Which light level gave the tallest plants in Table 1?', choices: ['Low', 'Medium', 'High', 'None'], answer: 'High', skill: 'read_table', explanation: 'High has 14 cm.' },
    { n: 2, figure: 'f2', prompt: 'By week 2, how much taller was High than Low?', choices: ['3 cm', '10 cm', '11 cm', '14 cm'], answer: '10 cm', skill: 'read_graph', explanation: '14 - 4 = 10.' },
  ],
};

check('a well-formed set has no problems', () => assert.deepStrictEqual(P.validate(SET), []));

const bad = (mutate) => { const c = JSON.parse(JSON.stringify(SET)); mutate(c); return P.validate(c); };

check('the validator names each kind of mistake', () => {
  assert.ok(bad((c) => { c.items[0].answer = 'Tall'; }).some((m) => /answer is not one/.test(m)));
  assert.ok(bad((c) => { c.items[0].choices = ['A', 'B']; }).some((m) => /exactly 4/.test(m)));
  assert.ok(bad((c) => { c.items[0].choices[1] = 'low'; }).some((m) => /duplicate/.test(m)));
  assert.ok(bad((c) => { c.items[1].figure = 'f9'; }).some((m) => /does not exist/.test(m)));
  assert.ok(bad((c) => { c.figures[1].id = 'f1'; }).some((m) => /duplicate figure ids/.test(m)));
  assert.ok(bad((c) => { c.figures[0].rows[1] = ['Medium']; }).some((m) => /row 2 needs 2 cells/.test(m)));
  assert.ok(bad((c) => { c.figures[0].rows[0][1] = ''; }).some((m) => /empty cell/.test(m)));
  assert.ok(bad((c) => { c.figures[1].series[0].points[0].y = '3'; }).some((m) => /y must be a number/.test(m)));
  assert.ok(bad((c) => { delete c.figures[1].x_label; }).some((m) => /x_label/.test(m)));
  assert.ok(bad((c) => { c.figures[0].type = 'pie'; }).some((m) => /type must be/.test(m)));
  assert.ok(bad((c) => { c.figures = []; }).some((m) => /no figures/.test(m)));
  assert.ok(bad((c) => { delete c.items[1].explanation; }).some((m) => /explanation/.test(m)));
  assert.ok(bad((c) => { c.items[1].n = 5; }).some((m) => /n must be 2/.test(m)));
  assert.ok(P.validate(null).length);
});

check('learner items carry no answer or explanation and toLearnerItems refuses an invalid set', () => {
  const items = P.toLearnerItems(SET);
  assert.strictEqual(items.length, 2);
  assert.ok(!/explanation|14 cm\.|"answer"/.test(JSON.stringify(items)));
  assert.strictEqual(items[1].focus_figure, 'f2');
  assert.strictEqual(items[0].figures.length, 2);
  items[0].figures[0].rows[0][0] = 'changed';
  assert.strictEqual(SET.figures[0].rows[0][0], 'Low', 'figures are copied, not shared');
  assert.throws(() => P.toLearnerItems({ ...SET, items: [] }), /invalid science set/);
});

check('check grades on the server', () => {
  assert.strictEqual(P.check(SET, 'sci-fixture-1:2', '10 cm').correct, true);
  assert.strictEqual(P.check(SET, 'sci-fixture-1:2', '11 cm').correct, false);
  assert.strictEqual(P.check(SET, 'sci-fixture-1:9', 'x'), null);
});

check('the player draws each figure as a table of values, charts with one column per series', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'player.js'), 'utf8');
  const make = (tag) => ({ tag, children: [], style: {}, textContent: '', className: '', classList: { add() {} }, setAttribute() {}, querySelector: () => null, contains: () => false,
    appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; } });
  const doc = { activeElement: null, body: {}, createElement: make, createTextNode: (t) => ({ text: t }) };
  const win = {};
  const App = { el: (tag, attrs) => { const n = make(tag); n.attrs = attrs; return n; }, escapeHtml: (s) => s, query: () => null };
  vm.runInNewContext(src, { window: win, document: doc, App, console });
  const host = make('div');
  try { win.Player.render(host, P.toLearnerItems(SET)[1], { onSubmit() {} }); } catch (e) { /* the rest of the renderer needs a fuller DOM */ }
  const figs = host.children.filter((c) => c.tag === 'figure');
  assert.strictEqual(figs.length, 2);
  const cells = (fig) => fig.children.find((c) => c.tag === 'table').children.map((r) => r.children.map((d) => d.textContent));
  assert.deepStrictEqual(cells(figs[0]), [['Light', 'Height (cm)'], ['Low', '4'], ['Medium', '9'], ['High', '14']]);
  assert.deepStrictEqual(cells(figs[1]), [['Week', 'Low', 'High'], ['1', '1', '3'], ['2', '4', '14']]);
  assert.ok(/outline/.test(figs[1].style.cssText) && !/outline/.test(figs[0].style.cssText), 'only the focused figure is marked');
});
