/* ACT-format Science passage sets: one passage with figures (tables and charts) and several questions about it.
 *
 * A set is authored as data (content is written later by the owner's local pipeline):
 *   { id, title, text, figures: [figure], items: [{ n, prompt, choices, answer, skill, explanation, figure? }] }
 * A figure is { id, type: 'table'|'bar'|'line', title, caption?, ... }:
 *   table: columns: [string], rows: [[cell]] (each row as long as columns)
 *   bar / line: x_label, y_label, series: [{ name, points: [{ x, y }] }]  (y is a number)
 * `figure` on an item names the figure in focus. `validate` returns a list of problems (empty means usable);
 * `toLearnerItems` returns what the browser may see: no answer, no explanation. `check` grades on the server.
 * Every chart is also drawn as a table of its values, so a screen reader and a 375 px screen both get the data.
 */

const MAX_ITEMS = 20;
const MAX_FIGURES = 6;
const MAX_CELLS = 200;
const TYPES = ['table', 'bar', 'line'];

function validateFigure(fig, where, add) {
  if (!fig || typeof fig !== 'object') { add(`${where}: not an object`); return; }
  if (!fig.id || typeof fig.id !== 'string') add(`${where}: missing id`);
  if (!fig.title || typeof fig.title !== 'string') add(`${where}: missing title`);
  if (!TYPES.includes(fig.type)) { add(`${where}: type must be one of ${TYPES.join(', ')}`); return; }
  if (fig.type === 'table') {
    const cols = Array.isArray(fig.columns) ? fig.columns : [];
    const rows = Array.isArray(fig.rows) ? fig.rows : [];
    if (!cols.length || cols.some((c) => typeof c !== 'string' || !c.trim())) add(`${where}: columns must be non-empty strings`);
    if (!rows.length) add(`${where}: no rows`);
    if (cols.length * rows.length > MAX_CELLS) add(`${where}: more than ${MAX_CELLS} cells`);
    rows.forEach((r, i) => {
      if (!Array.isArray(r) || r.length !== cols.length) add(`${where}: row ${i + 1} needs ${cols.length} cells`);
      else if (r.some((c) => c === null || c === undefined || String(c).trim() === '')) add(`${where}: row ${i + 1} has an empty cell`);
    });
    return;
  }
  if (!fig.x_label || !fig.y_label) add(`${where}: needs x_label and y_label`);
  const series = Array.isArray(fig.series) ? fig.series : [];
  if (!series.length) add(`${where}: no series`);
  series.forEach((s, i) => {
    if (!s || !s.name) add(`${where}: series ${i + 1} needs a name`);
    const pts = s && Array.isArray(s.points) ? s.points : [];
    if (!pts.length) add(`${where}: series ${i + 1} has no points`);
    if (pts.length * series.length > MAX_CELLS) add(`${where}: too many points`);
    pts.forEach((p, j) => {
      if (!p || p.x === undefined || p.x === null || String(p.x).trim() === '') add(`${where}: series ${i + 1} point ${j + 1} has no x`);
      if (!p || typeof p.y !== 'number' || !Number.isFinite(p.y)) add(`${where}: series ${i + 1} point ${j + 1} y must be a number`);
    });
  });
}

function validate(set) {
  const problems = [];
  const add = (message) => problems.push(message);
  if (!set || typeof set !== 'object') return ['the set is not an object'];
  if (!set.id || typeof set.id !== 'string') add('missing id');
  if (!set.title || typeof set.title !== 'string') add('missing title');
  if (typeof set.text !== 'string' || !set.text.trim()) add('missing text');
  const figures = Array.isArray(set.figures) ? set.figures : [];
  if (!figures.length) add('no figures');
  if (figures.length > MAX_FIGURES) add(`more than ${MAX_FIGURES} figures`);
  figures.forEach((f, i) => validateFigure(f, `figure ${i + 1}`, add));
  const ids = figures.map((f) => f && f.id);
  if (new Set(ids).size !== ids.length) add('duplicate figure ids');
  const items = Array.isArray(set.items) ? set.items : [];
  if (!items.length) add('no items');
  if (items.length > MAX_ITEMS) add(`more than ${MAX_ITEMS} items`);
  items.forEach((item, i) => {
    const where = `item ${i + 1}`;
    if (item.n !== i + 1) add(`${where}: n must be ${i + 1}`);
    if (!item.prompt || typeof item.prompt !== 'string') add(`${where}: missing prompt`);
    const choices = Array.isArray(item.choices) ? item.choices : [];
    if (choices.length !== 4) add(`${where}: needs exactly 4 choices`);
    if (choices.some((c) => typeof c !== 'string' || !c.trim())) add(`${where}: a choice is empty`);
    if (new Set(choices.map((c) => String(c).trim().toLowerCase())).size !== choices.length) add(`${where}: duplicate choices`);
    if (!choices.includes(item.answer)) add(`${where}: answer is not one of the choices`);
    if (!item.skill || typeof item.skill !== 'string') add(`${where}: missing skill`);
    if (!item.explanation || typeof item.explanation !== 'string') add(`${where}: missing explanation`);
    if (item.figure !== undefined && !ids.includes(item.figure)) add(`${where}: figure "${item.figure}" does not exist`);
  });
  return problems;
}

/** Items the player can draw: the passage and figures, the figure in focus, four choices. No answer key. */
function toLearnerItems(set) {
  const problems = validate(set);
  if (problems.length) throw new Error(`invalid science set ${set && set.id}: ${problems[0]}`);
  return set.items.map((item) => ({
    id: `${set.id}:${item.n}`,
    format: 'multiple_choice',
    skill: item.skill,
    passage_title: set.title,
    passage: set.text,
    figures: JSON.parse(JSON.stringify(set.figures)),
    focus_figure: item.figure || null,
    prompt: item.prompt,
    choices: item.choices.slice(),
  }));
}

/** Grade on the server: { correct, answer, explanation } for item id "setId:n". */
function check(set, itemId, answer) {
  const item = (set.items || []).find((it) => `${set.id}:${it.n}` === itemId);
  if (!item) return null;
  return { correct: answer === item.answer, answer: item.answer, explanation: item.explanation };
}

module.exports = { MAX_ITEMS, MAX_FIGURES, TYPES, validate, toLearnerItems, check };
