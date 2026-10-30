/* ACT-format Reading passage sets: one passage in numbered paragraphs and several questions about it.
 *
 * A set is authored as data (content is written later by the owner's local pipeline):
 *   { id, title, genre?, paragraphs: [string], items: [{ n, prompt, choices, answer, skill, explanation, paragraph? }] }
 * `paragraph` on an item is the 1-based paragraph the question points at (the player marks it). `validate` returns a
 * list of problems (empty means usable); `toLearnerItems` returns what the browser may see: no answer, no
 * explanation. `check` grades on the server.
 */

const MAX_ITEMS = 20;
const MAX_PARAGRAPHS = 40;
const GENRES = ['prose fiction', 'social science', 'humanities', 'natural science'];

function validate(set) {
  const problems = [];
  const add = (message) => problems.push(message);
  if (!set || typeof set !== 'object') return ['the set is not an object'];
  if (!set.id || typeof set.id !== 'string') add('missing id');
  if (!set.title || typeof set.title !== 'string') add('missing title');
  if (set.genre !== undefined && !GENRES.includes(set.genre)) add(`genre must be one of ${GENRES.join(', ')}`);
  const paras = Array.isArray(set.paragraphs) ? set.paragraphs : [];
  if (!paras.length) add('no paragraphs');
  if (paras.length > MAX_PARAGRAPHS) add(`more than ${MAX_PARAGRAPHS} paragraphs`);
  paras.forEach((p, i) => { if (typeof p !== 'string' || !p.trim()) add(`paragraph ${i + 1} is empty`); });
  const items = Array.isArray(set.items) ? set.items : [];
  if (!items.length) add('no items');
  if (items.length > MAX_ITEMS) add(`more than ${MAX_ITEMS} items`);
  items.forEach((item, i) => {
    const where = `item ${i + 1}`;
    if (!item || typeof item !== 'object') { add(`${where}: not an object`); return; }
    if (item.n !== i + 1) add(`${where}: n must be ${i + 1}`);
    if (!item.prompt || typeof item.prompt !== 'string') add(`${where}: missing prompt`);
    const choices = Array.isArray(item.choices) ? item.choices : [];
    if (choices.length !== 4) add(`${where}: needs exactly 4 choices`);
    if (choices.some((c) => typeof c !== 'string' || !c.trim())) add(`${where}: a choice is empty`);
    if (new Set(choices.map((c) => String(c).trim().toLowerCase())).size !== choices.length) add(`${where}: duplicate choices`);
    if (!choices.includes(item.answer)) add(`${where}: answer is not one of the choices`);
    if (!item.skill || typeof item.skill !== 'string') add(`${where}: missing skill`);
    if (!item.explanation || typeof item.explanation !== 'string') add(`${where}: missing explanation`);
    if (item.paragraph !== undefined && !(Number.isInteger(item.paragraph) && item.paragraph >= 1 && item.paragraph <= paras.length)) {
      add(`${where}: paragraph ${item.paragraph} does not exist`);
    }
  });
  return problems;
}

/** Items the player can draw: the numbered paragraphs, the paragraph in focus, four choices. No answer key. */
function toLearnerItems(set) {
  const problems = validate(set);
  if (problems.length) throw new Error(`invalid reading set ${set && set.id}: ${problems[0]}`);
  return set.items.map((item) => ({
    id: `${set.id}:${item.n}`,
    format: 'multiple_choice',
    skill: item.skill,
    passage_title: set.title,
    paragraphs: set.paragraphs.slice(),
    focus_paragraph: item.paragraph || null,
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

module.exports = { MAX_ITEMS, MAX_PARAGRAPHS, GENRES, validate, toLearnerItems, check };
