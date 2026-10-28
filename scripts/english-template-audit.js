/**
 * Render every English question template and check what comes out.
 *
 *   node scripts/english-template-audit.js              audit; exits 1 on any flag
 *   node scripts/english-template-audit.js --show=3     also print 3 renderings per family
 *   node scripts/english-template-audit.js --skill=modifiers   one skill only
 *   node scripts/english-template-audit.js --examples=5 more examples per problem
 *
 * The families in english-families.js and english-shapes.js are templates: one
 * entry is hundreds of sentences, and nobody reads hundreds of sentences. So a
 * mismatch between a template and its word bank is systematic rather than rare —
 * "at the ${place}" with a place that already reads "under the counter" is wrong
 * in every rendering, and "${name} ${verb.base}" breaks agreement every time. QA
 * found one of those by eye ("Leila answer at the under the counter until
 * closing"); this finds the rest mechanically.
 *
 * Every family is rendered over all of its slot combinations when there are few
 * enough (2,500 or fewer), and over 1,500 seeded draws when there are not (400
 * for a reading passage, which is slow to build). The seed is fixed, so a run is
 * repeatable and a new flag means a new problem. Each rendering
 * is checked for:
 *
 *   - template debris (undefined, doubled words, stray spaces)
 *   - stacked prepositions and articles ("at the under", "the the", "a apple")
 *   - subject-verb agreement against the slot that was used, and verb forms that
 *     are not words ("finishs", "arriveed")
 *   - capital letters: proper nouns lower-cased, sentences starting lower-case,
 *     a capital stranded mid-sentence after a comma
 *   - a pronoun that does not match the people it refers to
 *   - multiple choice: the key among the choices, no duplicate choices, four of them
 *   - "which word" questions whose key is not in the sentence
 *   - a type-in the grader would mark right if the learner copied the prompt (the
 *     grader forgives case and commas, so a capital or comma question cannot be a
 *     type-in), or that accepts a different word than its key
 *   - the keyed answer, re-derived independently where the rule allows it
 *   - a verb used with the wrong kind of complement ("answered to the depot",
 *     "waited the parcel"), an article that does not fit a number ("a 87"), and
 *     arithmetic on slots that comes out as "1 points"
 *   - two slots from one bank that landed on the same value ("books, books")
 *   - for reading passages (passage-families.js): every phrase a question or its
 *     rationale quotes from the passage is actually in the passage
 *
 * It also runs over passage-families.js, the generated reading passages, since
 * they are built from slots the same way.
 *
 * Only the text a learner is meant to trust is held to every check: the prompt,
 * the keyed answer, the accepted answers, the rationale, and the sentence with the
 * key filled into its blank. Distractors are wrong on purpose, so they are only
 * checked for debris that no distractor means to contain.
 *
 * No model is called and nothing is written.
 */
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';

const V = require('../content/vocab');
const { makeRng } = require('../content/rng');
const { fillSlots } = require('../content/pool');
const { normalize } = require('../services/grading');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const SHOW = Number(arg('show', 0));
const ONLY = arg('skill', null);
const EXAMPLES = Number(arg('examples', 2));

/** Families with at most this many slot combinations are rendered exhaustively. */
const ENUMERATE_UP_TO = 2500;
/** Larger ones are sampled this many times, from a fixed seed. */
const SAMPLES = 1500;
const PASSAGE_SAMPLES = 400;

const SOURCES = ['english-families', 'english-shapes', 'passage-families'];

// ── what the word banks say about their own words ───────────────────────────
const uniq = (list) => [...new Set(list)];
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (list) => uniq(list).sort((a, b) => b.length - a.length).map(esc).join('|');

const VERB_LISTS = Object.entries(V)
  .filter(([, list]) => Array.isArray(list) && list.length && list[0] && typeof list[0] === 'object' && 'base' in list[0])
  .map(([, list]) => list);
const ALL_VERBS = VERB_LISTS.flat();
const BASE = uniq(ALL_VERBS.map((v) => v.base));
const SFORM = uniq(ALL_VERBS.map((v) => v.s));
const REAL_FORMS = new Set(ALL_VERBS.flatMap((v) => [v.base, v.s, v.past, v.ing, v.pp]));
/** What a template makes when it glues an ending onto a base: "finishs", "arriveed". */
const BOGUS_FORMS = new Set(ALL_VERBS.flatMap((v) => [`${v.base}s`, `${v.base}d`,
  `${v.base}ed`, `${v.base}ing`, `${v.base.replace(/e$/, '')}ing`]).filter((f) => !REAL_FORMS.has(f)
  && !['labels', 'files', 'tests', 'reports', 'calls', 'walks', 'answers', 'drafts', 'loads', 'signs',
    'packs', 'cleans', 'repairs', 'measures', 'practices', 'inspects', 'reviews', 'delivers',
    'waits', 'works', 'rests'].includes(f)));

const NAMES = uniq([...V.NAMES, ...V.NAME_PAIRS.flat(),
  ...Object.values(V).filter((x) => Array.isArray(x) && x.length && Array.isArray(x[0]?.pair))
    .flatMap((list) => list.flatMap((p) => p.pair))]);
const PROPER = uniq([...NAMES, ...V.CITIES, ...V.DAYS, ...V.MONTHS, 'Tuesday']);
const SING = uniq([...V.ROLES_SINGULAR, ...V.NOUNS_SINGULAR, ...V.NOUNS_COLLECTIVE, ...V.NOUNS_MASS]);
const PLUR = uniq([...V.ROLES_PLURAL, ...V.NOUNS_PLURAL]);

/** Audit-only knowledge: which names are which, so a pronoun can be checked. */
const FEMALE = new Set(['Ana', 'Priya', 'Leila', 'Nadia', 'Rosa', 'Amara', 'Ingrid', 'Clara', 'Bettina',
  'Fenella', 'Naomi', 'Sunita', 'Beatriz', 'Talia', 'Mei', 'Iris', 'Nora', 'Maya', 'Elena']);
const MALE = new Set(['Marcus', 'Tomas', 'Owen', 'Kenji', 'Felix', 'Hassan', 'Mateo', 'Yusuf', 'Oscar',
  'Dmitri', 'Caleb', 'Lars', 'Omar', 'Josip', 'Gideon', 'Dev', 'Luis', 'Haru']);

const RX = {
  debris: /undefined|NaN|\[object|\bnull\b|\$\{|\{\{/,
  spaces: / {2,}|^\s|\s$/,
  spaceBeforeMark: /[A-Za-z’'] [,.;:!?](?=\s|$|")/,
  doubled: /\b(\w+) \1\b/i,
  // An article followed by a preposition or another article is never English.
  articleStack: /\b(the|a|an) (the|a|an|at|in|on|under|behind|beside|near|above|inside|along|by|to|for|of)\b/i,
  // Two place prepositions in a row: "at under", "to on". "from behind" is fine.
  prepStack: /\b(at|in|on|to|for|by|of|with|under|behind|beside|near|above|inside|along) (at|on|under|behind|beside|near|above|inside|along|by)\b/i,
  aBeforeVowel: /\ba (?!one\b|uni|use|usu|eu)[aeiou]\w*/i,
  anBeforeConsonant: /\ban (?!hour|honest|h?onou?r)[b-df-hj-np-tv-z]\w*/i,
  // Numbers by how they are said: "an 87", "an 11", "a 64".
  aBeforeNumber: /\ba (8\d*|11|18)\b/i,
  anBeforeNumber: /\ban (?!8|11\b|18\b)\d+/i,
  theName: new RegExp(`\\bthe (${alt(NAMES)})\\b`),
  properLower: new RegExp(`\\b(${alt(PROPER.map((w) => w.toLowerCase()))})\\b`),
  midCap: /[,;] (The|A|An|It|They|We|He|She|Its|Their)\b/,
  sgBase: new RegExp(`\\b[Tt]he (${alt(SING)}) (${alt(BASE)})\\b`),
  nameBase: new RegExp(`(^|[^\\w’'])(${alt(NAMES)}) (${alt(BASE)})\\b`),
  plS: new RegExp(`\\b[Tt]he (${alt(PLUR)}) (${alt(SFORM)})\\b`),
  pairS: new RegExp(`\\b(${alt(NAMES)}) and (${alt(NAMES)}|two friends|\\w+ \\w+s) (${alt([...SFORM, 'is', 'was', 'has'])})\\b`),
  sgPlBe: new RegExp(`\\b[Tt]he (${alt(SING)}) (are|were|have)\\b`),
  nameBe: new RegExp(`(^|[^\\w’'])(${alt(NAMES)}) (are|were|have)\\b`),
  plSgBe: new RegExp(`\\b[Tt]he (${alt(PLUR)}) (is|was|has)\\b`),
  pronSg: /\b(I|we|you|they|We|You|They) (\w+)\b/,
  fewerMass: new RegExp(`\\bfewer (${alt(V.NOUNS_MASS)})\\b`),
  lessCount: new RegExp(`\\bless (${alt(PLUR)})\\b`),
  itsBeforeNoun: /\bit[’']s (own|\w+ness|momentum|paint|label|color|lid|handle)\b/,
  pronS: new RegExp(`\\b(I|we|you|they|We|You|They) (${alt(SFORM)})\\b`),
  anyName: new RegExp(`\\b(${alt(NAMES)})\\b`, 'g'),
  pluralIt: /\bthe (\w+s)\b[^.;]*?\b(sent|signed|filed|posted) it\b/,
  lowerAfterStop: /[a-z]\. [a-z]/,
  // A verb that is not a verb of motion does not take "to the": "answered to
  // the depot", "arrived to the depot" (it is "arrived at").
  // Forms that are also nouns in the banks ("moved the labels to the library")
  // are left out.
  verbToThe: new RegExp(`\\b(${alt(ALL_VERBS.filter((v) => !['walk'].includes(v.base))
    .flatMap((v) => [v.base, v.s, v.past, v.ing])
    .filter((f) => ![...SING, ...PLUR].includes(f)))}) to the\\b`),
  // A verb the banks list as taking no object, given one: "waited the parcel".
  intransitiveObject: new RegExp(`\\b(${alt((V.VERBS_INTRANSITIVE || []).flatMap((v) => [v.s, v.past, v.ing]))}) (the|a|an)\\b`),
};

/**
 * A noun right after one of these is inside a phrase, not the subject: "the list
 * of the teachers is", "the notebook belonging to the clerks is".
 */
const IN_PHRASE = /\b(of|to|for|from|with|by|about|nor|beside|near|at|in|on) $/;

/** Modals and auxiliaries that license a bare verb after the next word. */
const BARE_OK_BEFORE = /\b(did|does|do|will|would|should|could|can|may|might|must|let|and|to|Did|Does|Do|Will|Would|Should|Could|Can|May|Must|Let)\s*$/;

// ── rendering ───────────────────────────────────────────────────────────────
function render(entry, s) {
  const v = (f) => (typeof f === 'function' ? f(s) : f);
  return {
    p: String(v(entry.p)),
    c: entry.c ? v(entry.c).map(String) : null,
    a: String(v(entry.a)),
    r: String(v(entry.r)),
    x: entry.x ? [].concat(v(entry.x)).map(String) : [],
    pass: entry.pass ? String(v(entry.pass)) : '',
    format: entry.c ? 'multiple_choice' : (entry.format || 'type_in'),
  };
}

/** Every combination when that is affordable, a seeded sample when it is not. */
function* slotFills(entry, seedText) {
  const slots = entry.slots || {};
  const names = Object.keys(slots);
  const allArrays = names.every((n) => Array.isArray(slots[n]));
  const size = allArrays ? names.reduce((n, k) => n * slots[k].length, 1) : Infinity;
  if (size <= ENUMERATE_UP_TO) {
    const idx = names.map(() => 0);
    for (let i = 0; i < size; i++) {
      const s = {};
      names.forEach((n, j) => { s[n] = slots[n][idx[j]]; });
      yield s;
      for (let j = names.length - 1; j >= 0; j--) {
        idx[j]++;
        if (idx[j] < slots[names[j]].length) break;
        idx[j] = 0;
      }
    }
    return;
  }
  const rng = makeRng(`audit:${seedText}`);
  // A reading family rebuilds its whole passage for every field it renders, and
  // its slots only swap facts inside fixed prose, so fewer draws cover it.
  const n = entry.pass ? PASSAGE_SAMPLES : SAMPLES;
  for (let i = 0; i < n; i++) yield fillSlots(rng, slots);
}

const quoted = (text) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
/** The quoted sentence a question is about: the longest quotation in the prompt. */
const sentenceOf = (p) => quoted(p).sort((a, b) => b.length - a.length)[0] || '';
const words = (t) => t.split(/\s+/).filter(Boolean);
const sentenceLike = (t) => /^[A-Z"'‘“]/.test(t) && words(t).length >= 3 && /[.?!]["'’”]?$/.test(t);

/**
 * A prompt that shows a broken sentence on purpose. Its quotation is meant to be
 * wrong, so it is exempt from the grammar checks — but not from debris.
 */
const DELIBERATE = /^(Fix|Add|Remove|Move|Which fixes|Which choice best fixes|Repair)|run-on|comma splice|misplaced|What is wrong|out of place|breaks the pattern|fragment|needs a capital|missing capital/i;

// ── the checks ──────────────────────────────────────────────────────────────
/** Checks for text a learner should be able to trust. Returns [code, detail] pairs. */
function grammarFlags(text) {
  const out = [];
  const m = (rx) => text.match(rx);
  let hit;
  const inPhrase = (h) => IN_PHRASE.test(text.slice(0, h.index));
  if ((hit = m(RX.sgBase)) && !BARE_OK_BEFORE.test(text.slice(0, hit.index)) && !inPhrase(hit)) out.push(['agreement', hit[0]]);
  if ((hit = m(RX.nameBase))) {
    const before = text.slice(0, hit.index + hit[1].length);
    if (!BARE_OK_BEFORE.test(before)) out.push(['agreement', hit[0].trim()]);
  }
  if ((hit = m(RX.plS)) && !inPhrase(hit)) out.push(['agreement', hit[0]]);
  if ((hit = m(RX.pairS))) out.push(['agreement', hit[0]]);
  if ((hit = m(RX.sgPlBe)) && !inPhrase(hit)) out.push(['agreement', hit[0]]);
  if ((hit = m(RX.nameBe)) && !/\band $/.test(text.slice(0, hit.index + hit[1].length))) out.push(['agreement', hit[0].trim()]);
  if ((hit = m(RX.plSgBe)) && !inPhrase(hit)) out.push(['agreement', hit[0]]);
  const pr = text.match(RX.pronS);
  if (pr) out.push(['agreement', pr[0]]);
  if ((hit = m(RX.fewerMass)) || (hit = m(RX.lessCount))) out.push(['wrong-rule', hit[0]]);
  if ((hit = m(RX.itsBeforeNoun))) out.push(['wrong-rule', hit[0]]);
  if ((hit = m(RX.verbToThe)) || (V.VERBS_INTRANSITIVE && (hit = m(RX.intransitiveObject)))) out.push(['verb-object', hit[0]]);
  if ((hit = m(RX.midCap))) out.push(['capitals', hit[0]]);
  if ((hit = m(RX.properLower))) out.push(['capitals', `lower-case "${hit[0]}"`]);
  return out;
}

/** Checks for any text at all, distractors included. */
function debrisFlags(text) {
  const out = [];
  let hit;
  if ((hit = text.match(RX.debris))) out.push(['debris', hit[0]]);
  if (RX.spaces.test(text)) out.push(['debris', 'stray spaces']);
  if ((hit = text.match(RX.spaceBeforeMark))) out.push(['debris', `space before mark: "${hit[0]}"`]);
  if ((hit = text.match(RX.doubled)) && !/^(had had|that that)$/i.test(hit[0])) out.push(['doubled-word', hit[0]]);
  if ((hit = text.match(RX.articleStack))) out.push(['stacked', hit[0]]);
  if ((hit = text.match(RX.prepStack))) out.push(['stacked', hit[0]]);
  if ((hit = text.match(RX.aBeforeVowel)) || (hit = text.match(RX.anBeforeConsonant))
    || (hit = text.match(RX.aBeforeNumber)) || (hit = text.match(RX.anBeforeNumber))) out.push(['article', hit[0]]);
  if ((hit = text.match(RX.theName))) out.push(['stacked', hit[0]]);
  // "1 points", "-2 points": a number that came out of arithmetic on the slots.
  if ((hit = text.match(/(?<![\d.])1 (points|years|seasons|days|hours|weeks|months|kilometres|pairs)\b/))
    || (hit = text.match(/(^|\s)-\d+ (points|years|seasons|percent)\b/))) out.push(['number', hit[0].trim()]);
  for (const w of words(text.replace(/[^A-Za-z’' ]/g, ' '))) {
    if (BOGUS_FORMS.has(w.toLowerCase())) { out.push(['bogus-verb', w]); break; }
  }
  // A plural made by gluing an "s" onto a stem: "nurss", "coachs".
  const before = text.match(/\b(\w+s)___/);
  if (before && !PLUR.includes(before[1]) && !/’|'/.test(before[1])) out.push(['bogus-plural', before[1]]);
  // A pronoun that cannot be the people in the sentence.
  const named = uniq(text.match(RX.anyName) || []);
  if (named.length && named.every((n) => MALE.has(n)) && /\b(she|her|hers|herself)\b/i.test(text)) out.push(['pronoun', `"she" for ${named.join(' and ')}`]);
  if (named.length && named.every((n) => FEMALE.has(n)) && /\b(he|him|his|himself)\b/i.test(text)) out.push(['pronoun', `"he" for ${named.join(' and ')}`]);
  // "it" for a plural object: "I packed the samples I sent it".
  const pl = text.match(RX.pluralIt);
  if (pl && PLUR.concat(['samples', 'crates']).includes(pl[1])) out.push(['pronoun', pl[0]]);
  if ((hit = text.match(RX.lowerAfterStop))) out.push(['capitals', `lower-case after a full stop: "${hit[0]}"`]);
  return out;
}

/** Fill a prompt's blank with an answer: the sentence the learner would be making. */
function filled(p, answer) {
  // The blank is in a quotation ('Complete: "The ___ ..."') or after a colon
  // ('Choose the correct verb: The books ___ on the shelf.').
  const s = sentenceOf(p).includes('___') ? sentenceOf(p) : ((p.match(/:\s+([^:]*___.*)$/) || [])[1] || '');
  if (!s.includes('___')) return null;
  return s.replace(/___( \([^)]*\))?/, answer);
}

/**
 * Re-derive the key where the rule can be computed from the words in front of
 * the learner. Each returns null when it does not apply, or the expected answer.
 */
const ORACLES = [
  // fewer with a count noun, less with a mass noun.
  (it) => {
    const m = sentenceOf(it.p).match(/___ (\w+) than/);
    if (!m || !it.c || !it.c.includes('fewer')) return null;
    if (PLUR.includes(m[1])) return 'fewer';
    if (V.NOUNS_MASS.includes(m[1])) return 'less';
    return null;
  },
  // A question ends with a question mark; a statement with a full stop.
  (it) => {
    if (!/What mark (finishes|ends)|which mark ends/i.test(it.p)) return null;
    const s = sentenceOf(it.p);
    return /^(Did|Do|Does|Where|What|When|Why|How|Is|Are|Can|Will|Should|Has|Have)\b/.test(s) ? '?' : '.';
  },
  // The verb after a past time marker is past; after a future one, "will".
  (it) => {
    const m = it.p.match(/^Choose the correct form: (.+?) (\w+|the \w+) ___/);
    if (!m) return null;
    const when = m[1];
    if (V.TIME_PAST.includes(when)) return (it.c || []).find((c) => ALL_VERBS.some((v) => v.past === c)) || '(a past form)';
    if (V.TIME_FUTURE.includes(when)) return (it.c || []).find((c) => /^will \w+$/.test(c)) || '(will + verb)';
    return null;
  },
  // "Choose the correct form: the X___ Y (one X)" is apostrophe-s; plural is apostrophe.
  (it) => {
    if (!/^Choose the correct form: the /.test(it.p)) return null;
    if (/\(one /.test(it.p)) return '’s';
    if (/\(more than one\)/.test(it.p)) return '’';
    return null;
  },
  // A subject that names more than one thing.
  (it) => {
    if (!/^Which subject (is plural|needs a plural verb|takes a plural verb)/.test(it.p) || !it.c) return null;
    const plural = it.c.filter((c) => !/^(A|An|One|Each|Every|Either|Neither)\b/.test(c)
      && (words(c).some((w) => PLUR.includes(w)) && /^(Several|Both|All|Many|the|The)\b/.test(c)));
    return plural.length === 1 ? plural[0] : `(${plural.length} plural subjects among the choices)`;
  },
  // A modal takes the bare verb.
  (it) => (/should ___ \(go\)/.test(it.p) ? 'go' : null),
];

// ── the run ─────────────────────────────────────────────────────────────────
const report = new Map(); // family key -> { frame, rendered, flags: Map(code -> {n, examples}) }

function flag(fam, code, detail, item) {
  const f = fam.flags.get(code) || { n: 0, examples: [] };
  f.n++;
  if (f.examples.length < EXAMPLES) f.examples.push({ detail, prompt: item.p, answer: item.a, choices: item.c });
  fam.flags.set(code, f);
}

function auditItem(fam, entry, item, s, slotSources, used) {
  const deliberate = DELIBERATE.test(item.p);
  const capitalQuestion = /capital/i.test(item.p);
  // A question about capitals has a lower-cased word as its key on purpose.
  const trusted = [...(capitalQuestion ? [] : [item.a]), item.r, ...item.x];
  const promptText = deliberate ? item.p.replace(/"[^"]*"/g, '"…"') : item.p;
  if (!capitalQuestion) trusted.push(promptText);
  const fill = filled(item.p, item.a);
  if (fill && !deliberate) trusted.push(fill);

  const seen = new Set();
  const once = (code, detail) => {
    const key = `${code}:${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    flag(fam, code, detail, item);
  };

  for (const t of trusted) for (const [code, detail] of grammarFlags(t)) once(code, detail);
  for (const t of [item.p, item.a, item.r, ...item.x, ...(item.c || []), fill || '', item.pass]) {
    if (!t) continue;
    if (capitalQuestion && t === item.p) continue;
    for (const [code, detail] of debrisFlags(t)) {
      // A distractor may misuse its/it's or a/an on purpose, never debris.
      once(code, detail);
    }
  }

  // Sentences learners are told are right start with a capital and end with a mark.
  if (/^[a-z]/.test(item.a) && words(item.a).length >= 4 && /[.?!]$/.test(item.a)) once('capitals', `key starts lower-case: "${item.a}"`);
  if (!deliberate && !capitalQuestion) {
    // Only a quotation that is the question's whole sentence: one opening the
    // prompt or following "In" or a colon. A passage quoted mid-clause is fine.
    for (const m of item.p.matchAll(/(^|: |\bIn )"([^"]+)"/g)) {
      const q = m[2];
      if (words(q).length >= 4 && /^[a-z]/.test(q) && /[.?!,]$/.test(q)) once('capitals', `quoted sentence starts lower-case: "${q}"`);
    }
  }
  // Only a whole sentence: "the teacher’s book (one teacher)" is a phrase.
  if (fill && /^[a-z]/.test(fill) && /[.?!]$/.test(fill) && !deliberate) once('capitals', `filled sentence starts lower-case: "${fill}"`);
  if (fill && /\. [a-z]/.test(fill) && !deliberate) once('capitals', `lower-case after a full stop: "${fill}"`);
  if (/^[a-z]/.test(item.r)) once('capitals', 'rationale starts lower-case');

  if (item.format === 'multiple_choice') {
    const c = item.c;
    if (!c.includes(item.a)) once('key-not-a-choice', item.a);
    const dupes = c.filter((x, i) => c.indexOf(x) !== i);
    if (dupes.length) once('duplicate-choice', dupes.join(', '));
    if (new Set(c).size < 4) once('too-few-choices', `${new Set(c).size} distinct`);
    if (c.some((x) => !x.trim())) once('debris', 'empty choice');
    // A key that is a sentence and the only one missing its full stop gives itself away.
    if (sentenceLike(`${item.a}.`) && !/[.?!]$/.test(item.a) && c.filter((x) => /[.?!]$/.test(x)).length >= 2) {
      once('capitals', 'key lacks the end mark its siblings have');
    }
  } else {
    // The grader lower-cases, strips commas and the final mark, so a type-in
    // the learner can answer by copying the prompt is not testing anything.
    const accepted = [item.a, ...item.x].map(normalize);
    for (const q of quoted(item.p)) {
      if (words(q).length >= 3 && accepted.includes(normalize(q))) once('type-in-copyable', `"${q}"`);
    }
    if (words(item.a).length === 1) {
      const others = item.x.filter((x) => words(x).length === 1 && normalize(x) !== normalize(item.a));
      if (others.length) once('accepts-wrong-word', `key "${item.a}" also accepts ${others.map((o) => `"${o}"`).join(', ')}`);
    }
    if (entry.ai_graded) once('ungradable', 'ai_graded is not carried to the item; graded by exact match on the original word');
  }

  // "Which word ..." — the key, and each one-word choice, is in the sentence.
  // A reading question that quotes its passage — in the prompt or in the
  // rationale — has to be quoting words the passage actually contains.
  if (item.pass) {
    const flat = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const passage = flat(item.pass);
    // A vocabulary question quotes meanings, not the passage: the sense it asks
    // about, and the options it weighs. Those are not claims about the text.
    const meanings = new Set([...(item.c || []), item.a]);
    const fromPrompt = /used to mean/.test(item.p) ? [] : quoted(item.p);
    for (const q of [...fromPrompt, ...quoted(item.r)]) {
      if (meanings.has(q)) continue;
      if (words(q).length >= 3 && !passage.includes(flat(q))) once('quote-not-in-passage', `"${q}"`);
    }
  }

  if (/\b[Ww]hich (word|one|part|phrase|words)\b|receives the action|What does ".+" modify/.test(item.p)
    && !/\breplace\b/.test(item.p)) {
    const sentence = (/in the passage/.test(item.p) ? item.pass : sentenceOf(item.p)).toLowerCase();
    if (sentence && words(sentence).length >= 3) {
      const key = item.a.replace(/^the (verb|noun|object) /, '').replace(/"/g, '').toLowerCase();
      if (!sentence.includes(key)) once('key-not-in-sentence', `"${item.a}" not in "${sentenceOf(item.p)}"`);
      if (/\bWhich word\b/.test(item.p)) {
        for (const ch of item.c || []) {
          if (words(ch).length > 1) once('choice-not-a-word', `"${ch}"`);
          else if (!new RegExp(`\\b${esc(ch.toLowerCase())}\\b`).test(sentence)) once('choice-not-in-sentence', `"${ch}"`);
        }
      }
    }
  }

  for (const oracle of ORACLES) {
    const want = oracle(item);
    if (want != null && want !== item.a) once('wrong-key', `keyed "${item.a}", rule gives "${want}"`);
  }

  // Two slots drawn from the same bank that landed on the same word: "books,
  // books, and books". Only slots the rendering actually uses count.
  const names = Object.keys(s).filter((n) => used.has(n));
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      if (s[a] === s[b] && (slotSources[a] === slotSources[b] || typeof s[a] === 'object')) {
        once('same-word-twice', `${a} = ${b} = ${JSON.stringify(s[a]).slice(0, 80)}`);
      }
    }
  }
}

/**
 * The slots whose value changes what a learner sees. A slot a template never
 * reads is free to repeat its neighbour; one it does read is not.
 */
function usedSlots(entry) {
  const used = new Set();
  const slots = entry.slots || {};
  const rng = makeRng('audit:used');
  const base = fillSlots(rng, slots);
  const text = (s) => { try { return JSON.stringify(render(entry, s)); } catch { return ''; } };
  const ref = text(base);
  for (const [n, src] of Object.entries(slots)) {
    for (let k = 0; k < 8; k++) {
      const value = Array.isArray(src) ? src[k % src.length] : src(rng, base);
      if (value !== base[n] && text({ ...base, [n]: value }) !== ref) { used.add(n); break; }
    }
  }
  return used;
}

for (const source of SOURCES) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { FAMILIES } = require(`../content/${source}`);
  for (const [skill, list] of Object.entries(FAMILIES)) {
    if (ONLY && skill !== ONLY) continue;
    list.forEach((entry, i) => {
      if (typeof entry.p !== 'function') return;
      const key = `${source}/${skill}[${i}]`;
      const fam = { frame: entry.frame || '', rendered: 0, flags: new Map(), shown: [] };
      report.set(key, fam);
      const slotSources = {};
      for (const [n, src] of Object.entries(entry.slots || {})) slotSources[n] = Array.isArray(src) ? src : null;
      const used = usedSlots(entry);
      for (const s of slotFills(entry, key)) {
        let item;
        try {
          item = render(entry, s);
        } catch (err) {
          flag(fam, 'throws', err.message, { p: JSON.stringify(s), a: '', c: null });
          continue;
        }
        fam.rendered++;
        if (fam.shown.length < SHOW && fam.rendered % 7 === 1) fam.shown.push(item);
        auditItem(fam, entry, item, s, slotSources, used);
      }
    });
  }
}

// ── the report ──────────────────────────────────────────────────────────────
let families = 0;
let renderings = 0;
let problems = 0;
const bySkill = new Map();
for (const [key, fam] of report) {
  families++;
  renderings += fam.rendered;
  const skill = key.replace(/\[\d+\]$/, '');
  const row = bySkill.get(skill) || { families: 0, flagged: 0, flags: 0 };
  row.families++;
  const n = [...fam.flags.values()].reduce((t, f) => t + f.n, 0);
  if (n) row.flagged++;
  row.flags += n;
  bySkill.set(skill, row);
  problems += n;
  if (SHOW) {
    console.log(`\n${key}  (${fam.rendered} rendered)  ${fam.frame}`);
    for (const it of fam.shown) {
      console.log(`  Q: ${it.p}`);
      if (it.c) console.log(`     [${it.c.join(' | ')}]`);
      console.log(`     key: ${it.a}${it.x.length ? `  (also: ${it.x.join(' / ')})` : ''}`);
      console.log(`     why: ${it.r}`);
    }
  }
}

console.log('\nEnglish template audit');
console.log(`${families} families, ${renderings} renderings\n`);
console.log('skill'.padEnd(42) + 'families  flagged  flags');
for (const [skill, row] of bySkill) {
  console.log(`${skill.padEnd(42)}${String(row.families).padStart(8)}${String(row.flagged).padStart(9)}${String(row.flags).padStart(7)}`);
}

for (const [key, fam] of report) {
  if (!fam.flags.size) continue;
  console.log(`\n✗ ${key}  ${fam.frame}`);
  for (const [code, f] of fam.flags) {
    console.log(`    ${code} ×${f.n}`);
    for (const ex of f.examples) {
      console.log(`      - ${ex.detail}`);
      console.log(`        Q: ${ex.prompt}`);
      if (ex.choices) console.log(`        [${ex.choices.join(' | ')}]  key: ${ex.answer}`);
      else console.log(`        key: ${ex.answer}`);
    }
  }
}

if (problems) {
  console.log(`\n${problems} problem renderings in ${[...report.values()].filter((f) => f.flags.size).length} families.`);
  process.exit(1);
}
console.log('\nClean: every rendering passed.');
