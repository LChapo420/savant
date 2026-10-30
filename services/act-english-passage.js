/* ACT-format English passage sets: one passage with numbered underlined portions, and one question per portion
 * whose first choice is "NO CHANGE", the way the real test is laid out.
 *
 * A set is authored as data (content is written later by the owner's local pipeline):
 *   { id, title, text, items: [{ n, choices: ['NO CHANGE', ...], answer, skill, explanation }] }
 * `text` marks each underlined portion as {{n|the underlined words}}. `n` runs 1..items.length with no gaps, and
 * item n answers portion n. `validate` returns a list of problems (empty means usable); `toLearnerItems` returns
 * what the browser may see: no answer, no explanation. `check` grades an answer on the server.
 */

const NO_CHANGE = 'NO CHANGE';
const MARK = /\{\{(\d+)\|([^{}|]+)\}\}/g;
const MAX_ITEMS = 20;

/** The passage as an ordered list of { text } and { n, text } segments (underlined portions carry n). */
function segments(text) {
  const out = [];
  let last = 0;
  const source = String(text || '');
  for (const m of source.matchAll(MARK)) {
    if (m.index > last) out.push({ text: source.slice(last, m.index) });
    out.push({ n: Number(m[1]), text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ text: source.slice(last) });
  return out;
}

function validate(set) {
  const problems = [];
  const add = (message) => problems.push(message);
  if (!set || typeof set !== 'object') return ['the set is not an object'];
  if (!set.id || typeof set.id !== 'string') add('missing id');
  if (!set.title || typeof set.title !== 'string') add('missing title');
  if (typeof set.text !== 'string' || !set.text.trim()) { add('missing text'); return problems; }
  if (/\{\{|\}\}/.test(set.text.replace(MARK, ''))) add('a marker is malformed (use {{n|words}})');
  const found = segments(set.text).filter((s) => s.n).map((s) => s.n);
  const items = Array.isArray(set.items) ? set.items : [];
  if (!items.length) add('no items');
  if (items.length > MAX_ITEMS) add(`more than ${MAX_ITEMS} items`);
  found.forEach((n, i) => { if (n !== i + 1) add(`underlined portions must be numbered 1, 2, 3 in order (found ${n} at position ${i + 1})`); });
  if (found.length !== items.length) add(`${found.length} underlined portions but ${items.length} items`);
  items.forEach((item, i) => {
    const where = `item ${i + 1}`;
    if (item.n !== i + 1) add(`${where}: n must be ${i + 1}`);
    const choices = Array.isArray(item.choices) ? item.choices : [];
    if (choices.length !== 4) add(`${where}: needs exactly 4 choices`);
    if (choices.some((c) => typeof c !== 'string' || !c.trim())) add(`${where}: a choice is empty`);
    if (new Set(choices.map((c) => String(c).trim().toLowerCase())).size !== choices.length) add(`${where}: duplicate choices`);
    if (choices.length && choices.indexOf(NO_CHANGE) > 0) add(`${where}: ${NO_CHANGE} must be the first choice`);
    if (choices.filter((c) => c === NO_CHANGE).length > 1) add(`${where}: ${NO_CHANGE} appears twice`);
    if (!choices.includes(item.answer)) add(`${where}: answer is not one of the choices`);
    if (!item.skill || typeof item.skill !== 'string') add(`${where}: missing skill`);
    if (!item.explanation || typeof item.explanation !== 'string') add(`${where}: missing explanation`);
    const portion = segments(set.text).find((s) => s.n === i + 1);
    if (portion && choices.includes(portion.text)) add(`${where}: a choice repeats the underlined words; use ${NO_CHANGE} for that`);
  });
  return problems;
}

/** Items the player can draw: the whole passage with the portion in focus, and four choices. No answer key. */
function toLearnerItems(set) {
  const problems = validate(set);
  if (problems.length) throw new Error(`invalid passage set ${set && set.id}: ${problems[0]}`);
  const parts = segments(set.text);
  return set.items.map((item) => ({
    id: `${set.id}:${item.n}`,
    format: 'multiple_choice',
    skill: item.skill,
    passage_title: set.title,
    passage_segments: parts,
    focus: item.n,
    prompt: `Question ${item.n}: which choice is best for underlined portion ${item.n}?`,
    choices: item.choices.slice(),
  }));
}

/** Grade on the server: { correct, answer, explanation } for item id "setId:n". */
function check(set, itemId, answer) {
  const item = (set.items || []).find((it) => `${set.id}:${it.n}` === itemId);
  if (!item) return null;
  return { correct: answer === item.answer, answer: item.answer, explanation: item.explanation };
}

module.exports = { NO_CHANGE, MAX_ITEMS, segments, validate, toLearnerItems, check };
