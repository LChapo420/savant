/**
 * Frozen facts (brief fact-100, docs/FACT-100.md). Behind FACT_BANK=on, default off; nothing live calls this yet.
 *
 * A subject's facts are verified once, heavily, into a shared bank, each with its source. A writer, personalization included, may rephrase and change examples but must use only those facts.
 * The mechanical part here confirms that every number, year, name, formula and foreign-language word in the output appears in the allowed facts. It knows nothing about meaning:
 * swapping "cause" and "effect" uses the same words and passes. Meaning is services/fact-source.js (each sentence compared with the fact it rests on).
 *
 *   extractClaims({ context, blocks, checks, call })   a level split into atomic claims, each with where and type (a cheap model copies, it does not judge)
 *   tokensOf(text, track)                              [{ type: number|year|name|formula|foreign, value, raw }]
 *   allowedFrom(facts, track, extra)                   the set of allowed tokens
 *   mechanicalCheck(text, allowed, { track })          tokens that are not allowed, outside illustration marks
 *   illustrationCheck(text, { allowedNames })          what an illustration may not do: state a year, name a real entity, or make a general claim
 *
 * Illustrations: a personal example is written between [[eg]] and [[/eg]]. Its numbers may be new, because they are made up and any arithmetic in them is recomputed; it may not add a claim about the world.
 */
function isOn() { return String(process.env.FACT_BANK || '').toLowerCase() === 'on'; }

const CLAIM_TYPES = ['fact', 'rule', 'formula', 'definition', 'vocab', 'procedure', 'computation', 'illustration', 'key', 'pedagogy'];
const CLAIM_SYSTEM = `You split a lesson into its atomic claims. You do not judge them and you never correct them: if the lesson says something wrong, copy it as it stands.

For each claim give where ("block N" or "check N"), text (one self-contained sentence, with pronouns replaced by what they mean and the context stated, as close to the lesson's words as possible), and type:
- fact: a statement about the world (a date, a person, a place, how something is).
- rule: how something works in general in this subject (a grammar rule, a law of math, a rule of a game).
- formula: a rule written in symbols.
- definition: what a term means.
- vocab: what a foreign word or phrase means or how it is formed (one per word or form).
- procedure: the steps of a method.
- computation: a calculation with specific numbers, a worked step.
- illustration: a made-up scenario, a sample sentence, or a story detail (nothing about the world depends on it).
- key: the correct answer of a graded check, stated as a sentence: "The answer to [question in brief] is [marked answer]". One for each graded check and interactive item with a key.
- pedagogy: advice on how to study, encouragement, teaching remarks.

Do not list: wrong options, trap text, deliberately wrong examples (except what the lesson says about why they are wrong). Be complete: every rule and fact stated anywhere in the lesson, not a summary.`;
const CLAIM_SCHEMA = { type: 'object', required: ['claims'], properties: { claims: { type: 'array', items: { type: 'object', required: ['where', 'text', 'type'], properties: { where: { type: 'string' }, text: { type: 'string' }, type: { type: 'string', enum: CLAIM_TYPES } } } } } };

const render = ({ context, blocks, checks }) => [
  typeof context === 'string' ? context : (context && context.text) || '',
  '',
  ...blocks.map((b) => `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`),
  ...checks.map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify({ prompt: c.prompt, options: c.options, choices: c.choices, answer: c.answer, accepts: c.accepts, rationale: c.rationale, hint: c.hint })}`),
].join('\n');

async function extractClaims({ context, blocks, checks, call }) {
  const r = await call(CLAIM_SYSTEM, render({ context, blocks, checks }), CLAIM_SCHEMA, 'submit_claims', 12000);
  return { claims: ((r.data && r.data.claims) || []).filter((c) => c && c.text), cost: r.cost || 0 };
}

const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1000000 };
// "one" and "two" are everywhere in English prose and rarely a stated quantity, so they are not tokens unless written as digits.
const WEAK_WORDS = new Set(['zero', 'one', 'two']);
const SENTENCE_STARTERS = new Set('the a an this that these those it its if when then so but and or for in on at to from with by as is are was were be do does did not no yes you your we our they their he she his her i my me what why how which who where while because after before use add for each every most some many all both try note remember think look read write ask see say make take give get let start first next last now here there one two three'.split(' '));

/** The words in a span marked as a foreign phrase in the track's own language: accents and inverted marks, or quoted runs in a Spanish lesson. */
const SPANISH_MARK = /[áéíóúñü¿¡]/i;

function tokensOf(rawText, track = '') {
  const text = String(rawText || '');
  const out = [];
  const seen = new Set();
  const add = (type, value, raw) => { const k = `${type}:${value}`; if (!seen.has(k)) { seen.add(k); out.push({ type, value, raw }); } };
  // Formulas first: an expression with an equals sign, an exponent or a symbol, spaces removed. Their numbers are not listed again.
  let rest = text;
  // Linear on purpose: split on spaces, grow a run of math-looking words around each relation sign. A nested regular expression here hung on long lessons.
  const parts = rest.split(/(\s+)/);
  const NOT_MATH = new Set('is as at in on of to or if so an it be by we no do and the for but are was has can per not'.split(' '));
  const mathy = (w) => /^[A-Za-z0-9.,()+\-*/^√|²³−×÷]+$/.test(w) && !NOT_MATH.has(w.toLowerCase().replace(/[.,]+$/, '')) && (w.length <= 2 || /[0-9()+*/^√²³−×÷]/.test(w));
  const used = new Set();
  parts.forEach((w, i) => {
    if (!/^(=|≈|≤|≥)$/.test(w) && !/[=≈≤≥]/.test(w)) return;
    if (used.has(i)) return;
    let lo = i; let hi = i;
    while (lo - 2 >= 0 && mathy(parts[lo - 2])) lo -= 2;
    while (hi + 2 < parts.length && (mathy(parts[hi + 2]) || /^(=|≈|≤|≥)$/.test(parts[hi + 2]))) hi += 2;
    const m = parts.slice(lo, hi + 1).join('');
    if (m.length < 3 || !/[0-9^²³+*/×÷√]/.test(m)) return;
    add('formula', m.replace(/\s+/g, '').replace(/−/g, '-').replace(/[.,;:]+$/, '').toLowerCase(), m.trim());
    for (let k = lo; k <= hi; k++) { used.add(k); parts[k] = ' '; }
  });
  rest = parts.join('');
  for (const m of rest.matchAll(/(?<![A-Za-z0-9.])-?\$?\d[\d,]*(?:\.\d+)?(?:\/\d+)?%?/g)) {
    const raw = m[0];
    const v = raw.replace(/[$,%]/g, '').replace(/\.0+$/, '');
    if (/^(1[0-9]{3}|20[0-9]{2})$/.test(v) && !raw.includes('$') && !raw.includes('%')) add('year', v, raw); else add('number', v, raw);
  }
  for (const m of rest.matchAll(/\b[A-Za-z]+\b/g)) {
    const w = m[0].toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, w) && !WEAK_WORDS.has(w)) add('number', String(NUMBER_WORDS[w]), m[0]);
  }
  // Names: capitalised, not at the start of a sentence, or a run of capitalised words anywhere.
  const sentences = rest.split(/(?<=[.!?:;—])\s+|\n+|["“”]/);
  for (const s of sentences) {
    const ws = s.trim().split(/\s+/);
    ws.forEach((w, i) => {
      const clean = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      if (!/^\p{Lu}\p{Ll}{2,}/u.test(clean)) return;
      if (i === 0 && SENTENCE_STARTERS.has(clean.toLowerCase())) return;
      if (i === 0) { const next = (ws[1] || '').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''); if (!/^\p{Lu}/u.test(next) && !(/\b(de|del|von|van)\b/.test(next))) return; }
      add('name', clean.toLowerCase(), clean);
    });
  }
  if (track === 'spanish') {
    for (const m of rest.matchAll(/\b[\p{L}]+\b/gu)) if (SPANISH_MARK.test(m[0])) add('foreign', m[0].toLowerCase(), m[0]);
  }
  return out;
}

const STRIP_EG = /\[\[eg\]\][\s\S]*?\[\[\/eg\]\]/g;
const egSpans = (text) => [...String(text || '').matchAll(/\[\[eg\]\]([\s\S]*?)\[\[\/eg\]\]/g)].map((m) => m[1]);
const keyOf = (t) => `${t.type}:${t.value}`;

/** The allowed set from facts (strings or { text }), plus any extra words the caller permits (a learner's hobby, the app's own UI words). */
function allowedFrom(facts, track = '', extra = []) {
  const allowed = new Set();
  const addText = (t) => { for (const w of String(t || '').toLowerCase().match(/\p{L}{3,}/gu) || []) allowed.add(`name:${w}`); /* a capitalised title word is not a name when the bank uses it as a word */ for (const tk of tokensOf(t, track)) { allowed.add(keyOf(tk)); if (tk.type === 'formula') for (const inner of tokensOf(tk.raw.replace(/[=≈≤≥]/g, ' = '), '')) if (inner.type === 'number') allowed.add(keyOf(inner)); if (tk.type === 'year') allowed.add(`number:${tk.value}`); } };
  for (const f of facts) addText(typeof f === 'string' ? f : f.text);
  for (const w of extra) { allowed.add(`name:${String(w).toLowerCase()}`); }
  return allowed;
}

/** Tokens of text that the allowed set does not hold, outside [[eg]] marks. A formula counts as allowed when the same formula, spaces aside, is in the bank. */
function mechanicalCheck(text, allowed, { track = '' } = {}) {
  const body = String(text || '').replace(STRIP_EG, ' ');
  const tokens = tokensOf(body, track);
  const missing = tokens.filter((t) => !allowed.has(keyOf(t)) && !(t.type === 'number' && allowed.has(`year:${t.value}`)));
  return { tokens: tokens.length, missing };
}

/** What an example between [[eg]] marks may not do. Its made-up numbers are fine; a year, a named real entity or a general claim is not. */
function illustrationCheck(text, { allowedNames = [], allowed = new Set() } = {}) {
  const names = new Set(allowedNames.map((n) => String(n).toLowerCase()));
  const problems = [];
  for (const span of egSpans(text)) {
    for (const t of tokensOf(span)) {
      if (t.type === 'year') problems.push({ span: span.slice(0, 120), problem: `a year (${t.raw}) in an illustration` });
      if (t.type === 'name' && !names.has(t.value) && !allowed.has(keyOf(t))) problems.push({ span: span.slice(0, 120), problem: `a name not in the bank or the learner's interests (${t.raw})` });
    }
    if (/\b(always|never|in fact|studies show|research|scientists|historically|the world's|invented|discovered)\b/i.test(span)) problems.push({ span: span.slice(0, 120), problem: 'a general claim in an illustration' });
  }
  return problems;
}

module.exports = { isOn, CLAIM_SYSTEM, CLAIM_SCHEMA, CLAIM_TYPES, extractClaims, tokensOf, allowedFrom, mechanicalCheck, illustrationCheck, egSpans, render };
