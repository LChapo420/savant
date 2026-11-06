/**
 * An explanation must not point at an option by its place: "Option 0", "option D", "(3)", "the first option".
 *
 * Found on 6 Nov 2026 (stored re-check): 196 of 4,633 stored game explanations name a place, and 141 of them name one that is not the key's. The key is right; the label is stale:
 * the rewrite scripts move the correct option after the model has written (shuffleKey in scripts/english-game-rewrite.js and english-game-level-fix.js), and some writers number
 * from 0 ("(0) The library..."), even into the option text. A learner reads "Option 0" against options with no such label.
 *
 * cleanQuestion is exact text work with no guessing: the place word goes, the rest of the sentence stands, the key and the option order never change. An explanation that names two
 * different places (it is also talking about a wrong option) is reworded only for the part that means the key; `left` reports what still names a place, for a reader.
 * game-payloads runs it when a set is written and in inject(), the one way a stored set reaches a learner, so stored rows are served clean with nothing written to the data.
 */
const PLACE = '(?:\\(?(?:[0-9]|[A-Da-d])\\)?)';
const NTH = '(?:first|second|third|fourth|last)';

/** Literal numbering at the front of every option: "(0) ..." or "A) ...". Removed only when every option carries it, in order. */
function cleanChoices(choices) {
  if (!Array.isArray(choices) || choices.length < 2 || !choices.every((c) => typeof c === 'string')) return choices;
  const num = choices.map((c) => /^\s*\(?([0-9A-Da-d])\)\s+(.*)$/s.exec(c));
  if (num.every(Boolean)) return num.map((m) => m[2]);
  return choices.map((c) => { const m = /^\s*\(([0-9])\)\s+(.*)$/s.exec(c); return m ? m[2] : c; }); // "(0) The library" on some options only: a writer's number, never content
}

function cap(s) { return s.replace(/^(\s*["“‘']?)([a-z])/, (_, a, b) => a + b.toUpperCase()); }

const RULES = [
  // "The correct answer is the first option, 'X,' because" / "The correct choice is option 0, 'X'"
  [new RegExp(`\\b(the (?:correct|right) (?:answer|choice|option) is) (?:the )?(?:${NTH} )?(?:option|choice|answer)?\\s*${PLACE}?\\s*,\\s*(?=["“‘'])`, 'gi'), '$1 '],
  [new RegExp(`\\b(the (?:correct|right) (?:answer|choice|option) is) the ${NTH} (?:option|choice)\\b,?\\s*(?=["“‘'])`, 'gi'), '$1 '],
  // "The correct answer is option 2 The game was postponed": the option's own words follow
  [new RegExp(`\\b(the (?:correct|right) (?:answer|choice|option) is) (?:the )?(?:(?:option|choice|answer)\\s*${PLACE}|\\(?[0-9A-D]\\))\\s+`, 'gi'), (m, x, at, str) => (/[A-Z]/.test(str[at + m.length] || '') ? `${x}: ` : m)],
  // "The correct answer is (1) because" / "is option B because" -> "This answer is correct because"
  [new RegExp(`\\bthe (?:correct|right) (?:answer|choice|option) is (?:the )?(?:(?:option|choice|answer)\\s*${PLACE}|\\(?[0-9A-D]\\)|${NTH} (?:option|choice))(?=[\\s,.;:])`, 'gi'), 'This answer is correct'],
  // "The correct option, (3) it shifts focus" -> "The correct option, it shifts focus"
  [/\b(the (?:correct|right) (?:answer|choice|option),?)\s*\(?[0-9A-D]\)\s+/gi, '$1 '],
  // "Option 0, 'X,' correctly" / "Option (3) 'X' is" / "so option (3) 'A colon'" -> the quote stands alone
  [new RegExp(`\\b(?:option|choice)\\s*${PLACE}\\s*,?\\s*(?=["“‘'])`, 'gi'), ''],
  // "making option D correct" / "which is exactly what option B says"
  [new RegExp(`\\b(making|makes|make)\\s+(?:option|choice)\\s*${PLACE}\\b`, 'gi'), '$1 this option'],
  [new RegExp(`\\bwhat (?:option|choice)\\s*${PLACE}\\b`, 'gi'), 'what this option'],
  // "Option 0 keeps" -> "This option keeps"; "only option 2" -> "only this option"
  [new RegExp(`\\b(?:option|choice)\\s*${PLACE}(?=[\\s,.;:!)]|$)`, 'gi'), 'this option'],
  // "the first option", "only the last option"
  [new RegExp(`\\bthe ${NTH} (?:option|choice)\\b`, 'gi'), 'this option'],
];
const STILL = new RegExp(`\\b(?:option|choice)\\s*\\(?[0-9A-D]\\)?(?=[\\s,.;:!)]|$)|\\bthe ${NTH} (?:option|choice)\\b|(?:^|\\s)\\([0-4]\\)(?=\\s)`);

const NEGATIVE = new RegExp(`\\b(?:option|choice)\\s*\\(?[0-9A-Da-d]\\)?[^.;]{0,40}\\b(?:wrong|incorrect|fails?|lacks?|misses|not|no such)\\b|\\bthe ${NTH} (?:option|choice)\\b[^.;]{0,40}\\b(?:wrong|incorrect|fails?|lacks?|misses|not|no such)\\b`, 'i');

/** Two different places named: it also speaks of a wrong option. Only reword when one place is named. */
function placesNamed(text) {
  const out = new Set();
  const re = new RegExp(`\\b(?:option|choice)\\s*\\(?([0-9A-Da-d])\\)?(?=[\\s,.;:!)]|$)|\\bthe (${NTH}) (?:option|choice)\\b`, 'gi');
  let m;
  while ((m = re.exec(text))) out.add(String(m[1] || m[2]).toLowerCase());
  return out;
}

function cleanExplanation(text) {
  const before = String(text == null ? '' : text);
  if (placesNamed(before).size > 1) return { text: before, changed: false, left: true };
  // "Option 2 is wrong", "the first option has no such clause": it means a wrong option, so "this option" would turn it false.
  if (NEGATIVE.test(before)) return { text: before, changed: false, left: STILL.test(before) };
  let t = before;
  for (const [re, to] of RULES) t = t.replace(re, to);
  if (t === before) return { text: before, changed: false, left: STILL.test(before) };
  t = cap(t.replace(/\s{2,}/g, ' ').trim());
  return { text: t, changed: true, left: STILL.test(t) };
}

/** A question with its place words gone. Returns the same object when nothing changed; never touches answerIndex or the order of the options. */
function cleanQuestion(q) {
  if (!q || !Array.isArray(q.choices)) return q;
  const choices = cleanChoices(q.choices);
  const e = cleanExplanation(q.explanation);
  const sameChoices = choices === q.choices || choices.every((c, i) => c === q.choices[i]);
  if (sameChoices && !e.changed) return q;
  return { ...q, choices: sameChoices ? q.choices : choices, explanation: q.explanation == null ? q.explanation : e.text };
}

function cleanPayload(payload) {
  if (!payload || !Array.isArray(payload.questions)) return payload;
  let any = false;
  const questions = payload.questions.map((q) => { const c = cleanQuestion(q); if (c !== q) any = true; return c; });
  return any ? { ...payload, questions } : payload;
}

module.exports = { cleanChoices, cleanExplanation, cleanQuestion, cleanPayload, placesNamed };
