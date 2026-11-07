/**
 * Part modifier (mod-wiring, 6 Nov 2026): the learner-facing parts that were stored once and shown the same to everyone now follow the learner's
 * learning spec (services/learning-spec.js): the feedback after a check, the hint, the review prompt, and the lesson text of an uploaded course
 * when the profile has moved. docs/MODIFICATION-AUDIT.md section 7 has the table of what changes what and what is proven.
 *
 *   rulesFor(spec, part, ctx)        the rules for one part, as sentences, from the spec's own fields (feedback block, scaffolding, language,
 *                                    interests, review) and the retention goal. Pure.
 *   modify({spec, part, source, llm})  one rewrite of a stored text and one revision when a check finds a problem. Pure but for the llm call.
 *                                    Facts: every number and the answer are kept, no number is added, no profile talk, no avoided domain.
 *   check(spec, part, source, text)  the problems a rewrite is held to.
 *   prepareItem(userId, item)        background only (never awaited by a route): the rewrite of one item's explanation (and hint) for this
 *                                    learner, stored on the learner's own item row, `shaped`. Served by rationaleOf / hintOf the next time that
 *                                    item's feedback is shown; the stored text is shown when the rewrite is not ready (never blocks).
 *   refreshCourseLessons(userId, id) background: re-writes the lesson paragraphs of a stored uploaded course when the learner's profile has
 *                                    drifted (spec-sig.js); questions, quotes and facts are untouched; the old paragraphs are kept.
 *
 * Switch: PART_MODIFY=off removes all of it (the stored text is served, as before). Under-13 accounts follow the usual outside-AI consent rule
 * because the call goes through services/ai.js (dataClass learner). Rows hold only text derived from the item and the spec, so account export and
 * deletion (which cover items and material_courses) already cover them.
 */
const crypto = require('crypto');

const PARTS = ['feedback', 'hint', 'review'];
/** The fixed line a retention question carries when the writer gave no reason of its own (routes/learn.js): this is the review part. */
const REVIEW_DEFAULT = 'Recalling it now is what moves it into next week.';
/**
 * The switch. PART_MODIFY=off removes it for everyone (a kill switch). Otherwise an account's own setting wins (users.part_modify, 'on' or 'off': set from the admin
 * page, POST /api/admin/users/:id/part-modify, or scripts/part-modify-account.js), and then the default: PART_MODIFY=on, or off when it is not set. So the owner can try it on
 * one account while everyone else keeps the stored text. enabled() with no account answers for the default.
 */
function accountSetting(userId) {
  if (!userId) return null;
  try { const u = lazy('../config/db').byId('users', userId); return u && (u.part_modify === 'on' || u.part_modify === 'off') ? u.part_modify : null; } catch { return null; }
}
function enabled(userId = null) {
  const env = String(process.env.PART_MODIFY || '').toLowerCase();
  if (env === 'off') return false;
  const own = accountSetting(userId);
  if (own) return own === 'on';
  return String(env || DEFAULT_ON) !== 'off';
}
// Which parts run: PART_MODIFY_PARTS (comma list of feedback, hint, review, lesson, voice). Default: only the parts whose proof passed
// (docs/MODIFICATION-AUDIT-PARTS.md). PART_MODIFY=off turns everything off; with PART_MODIFY=on and no list, the proven parts run.
const DEFAULT_ON = 'off';
const DEFAULT_PARTS = 'feedback,review'; // lesson, voice and hint did not beat chance by both families (docs/MODIFICATION-MAP.md section 5): name them in PART_MODIFY_PARTS to try them
const partOn = (p) => new Set(String(process.env.PART_MODIFY_PARTS || DEFAULT_PARTS).split(',').map((x) => x.trim())).has(p);

const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require
const words = (t) => (String(t || '').match(/[A-Za-zÀ-ÿ0-9'-]+/g) || []);
const numbersOf = (t) => new Set((String(t || '').match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));
// List markers and step labels ("1.", "Step 2") are layout, not facts: they are not counted as new numbers.
const WORD_NUM = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12' };
const stripLayout = (t) => String(t || '').replace(/(^|\n)\s*\d{1,2}[.)]\s/g, '$1').replace(/\b(?:step|part|point|rule)\s+\d{1,2}\b/gi, '');
const numbersShown = (t) => { const n = numbersOf(stripLayout(t)); for (const w of String(t || '').toLowerCase().match(/[a-z]+/g) || []) if (WORD_NUM[w]) n.add(WORD_NUM[w]); return n; };
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The retention goal in one clause for a tutor or review text: null for "forever" (nothing to say). */
function goalClause(goal) {
  if (!goal || !goal.status || goal.status === 'forever') return null;
  if (goal.status === 'date') return `a test on ${goal.test_date}${goal.days_left !== undefined ? ` (${goal.days_left} days away)` : ''}`;
  if (goal.horizon) return { months: 'the next few months', year: 'about a year', years: 'years' }[goal.horizon] || null;
  return null;
}

/**
 * The rules one part is held to, from the spec. `ctx.goal` is the retention goal (effective form) when the part is a review or feedback on a
 * reviewed item. Every line is something the learner can see in the text; none talks about the learner.
 */
function rulesFor(spec, part, ctx = {}) {
  if (!spec || spec.isDefault) return [];
  const fb = spec.feedback || {};
  const tone = fb.tone || {};
  const lang = spec.language || {};
  const sc = spec.scaffolding || {};
  const it = spec.interests || {};
  const r = [];
  const wordsPer = lang.maxSentenceWords ? `; sentences of ${lang.maxSentenceWords} words or fewer` : '';
  if (part === 'feedback') {
    // The old rules asked for three to six lines of a one-sentence explanation and for a clause on why a wrong choice fails, and that is where the added claims came from
    // (docs/MODIFICATION-MAP.md, the 16 of 40). Length now follows what the original has to say.
    r.push(fb.granularity === 'brief'
      ? 'Length: as short as the idea allows, one sentence if you can, and every point of the original stays.'
      : fb.granularity === 'detailed'
        ? 'Layout: give the original\'s own reasoning one step per line, in order. Only the steps it has; if it has one step, write one line. Never pad to a length.'
        : 'Length: about the length of the original.');
    r.push('Say only what the original says. No new idea, definition, rule, tip or example with facts of its own, and nothing about any other choice unless the original says it.');
    r.push('This text is shown after a right answer and after a wrong one, so never say whether their answer was right or wrong ("your answer", "you got it", "incorrect", "not quite"): explain the idea itself.');
  } else if (part === 'hint') {
    // spec.scaffolding.hintSize is 'nudge', 'partial' or 'step'. This compared it with 'generous', which it never is, so every learner got the small hint: that is
    // one reason hints sat at chance in the 6 Nov run.
    r.push(sc.hintSize === 'step'
      ? 'Hint size: large: name the idea to use and carry out the first step on the question\'s own numbers or words, but never the final answer.'
      : sc.hintSize === 'partial'
        ? 'Hint size: medium: name the idea or rule to use, and stop before doing any step; never the answer.'
        : 'Hint size: small: one nudge or one question about where to look, never the idea by name, never a step and never the answer.');
    r.push('Length: at most two sentences.');
  } else if (part === 'review') {
    r.push('Length: one sentence that says why recalling this now helps, in their terms; no facts beyond the question.');
    if (ctx.goal) { const g = goalClause(ctx.goal); if (g) r.push(`They want to keep this for ${g}: say, once, how this recall serves that.`); }
  }
  // Tone, for every part.
  const warm = tone.warmth >= 0.65 ? 'warm and encouraging' : tone.warmth <= 0.35 ? 'matter-of-fact, no cheering' : null;
  if (warm) r.push(`Tone: ${warm}.`);
  if (tone.correction === 'gentle') r.push('Gentle: calm, low-pressure wording that opens on what is true; never blunt. Do not open with a stock phrase.');
  else if (tone.correction === 'direct') r.push('Direct: plain and blunt, no cushioning or cheering.');
  if (tone.formality >= 0.65) r.push('Register: formal and precise.');
  else if (tone.formality <= 0.35) r.push('Register: casual and plain.');
  if (tone.humor === 'light') r.push('A single light touch of humour is welcome.');
  if (tone.praise === 'minimal') r.push('Praise: none; no "great job".');
  if (fb.lowStakes) r.push('Low stakes: never say test, graded, score or fail; a wrong answer only shows what to look at next.');
  // Language.
  if (lang.plainLanguage || lang.eslSupport) r.push(`Language: plain everyday words${wordsPer}${lang.avoidIdioms ? ', no idioms or phrasal verbs' : ''}; if a word they may not know is needed, define it in a few plain words.`);
  else if (lang.maxSentenceWords) r.push(`Language: about reading grade ${lang.vocabularyGrade || 'their level'}${wordsPer}.`);
  if (lang.eslSupport) r.push('Repeat the key term once, in the same words each time.');
  // Interests and dislikes.
  // A comparison only for a learner whose profile leans on interests, and only when it really maps (the 6 Nov hints and review lines were full of forced similes).
  if (it.exampleDomains && it.exampleDomains.length && it.share >= 0.5 && part !== 'review') r.push(`Only if it truly has the same structure as the idea, one short comparison from ${it.exampleDomains.slice(0, 2).join(' or ')}, given as a comparison and stating no fact of its own. If nothing maps, leave it out.`);
  if (it.avoidDomains && it.avoidDomains.length) r.push(`Never use anything about: ${it.avoidDomains.join(', ')}.`);
  return r;
}

// Words too common to say a rewrite "uses" a dislike ("told the answer right away" is not touched by the word answer, "food examples" not by the word example).
const AVOID_GENERIC = new Set(['example', 'time', 'idea', 'same', 'answer', 'word', 'problem', 'right', 'away', 'group', 'work', 'three', 'question', 'waste', 'without', 'picture', 'told', 'long', 'lot', 'many', 'much', 'very', 'thing', 'kind', 'way']);
const contentKeys = (t) => (String(t || '').toLowerCase().match(/[a-zà-ÿ][a-zà-ÿ'-]{2,}/g) || []).map((w) => w.replace(/(ing|es|s)$/, ''));
/**
 * The avoided domains a rewrite brings in: a word of the domain that is new (not in the original, the question or its choices) and says what the domain is about. A word the
 * original already uses cannot be the rewrite's doing ("How plants make food" against a dislike of food examples). What a word list cannot see ("like sharing a pizza") is for
 * the fact gate, which is given the list.
 */
function avoidedIn(spec, source, text) {
  const hits = [];
  const had = new Set(contentKeys([source.text, source.prompt, source.answer, source.title, (source.choices || []).join(' ')].join(' ')));
  const fresh = new Set(contentKeys(text).filter((w) => !had.has(w)));
  for (const d of (spec && spec.interests && spec.interests.avoidDomains) || []) {
    const keys = contentKeys(d).filter((w) => w.length >= 4 && !AVOID_GENERIC.has(w));
    if (keys.some((w) => fresh.has(w))) hits.push(d);
  }
  return hits;
}

/**
 * The review line, from templates: no model and no fact at risk. The stored line says one thing (recalling now keeps it for later), so what can follow the learner is how it says
 * that and what "later" is: their retention goal, their tone, their word level. The 6 Nov model rewrites of this one line added a forced simile from a hobby and, once, nonsense
 * ("Remember the beads now; the beads remember you"). Pure.
 */
function reviewLine(spec, goal = null) {
  const fb = (spec && spec.feedback) || {};
  const tone = fb.tone || {};
  const lang = (spec && spec.language) || {};
  const later = goal && goal.status === 'date' && goal.test_date
    ? (fb.lowStakes ? goal.test_date : `your test on ${goal.test_date}`)
    : goal && goal.horizon ? ({ months: 'the months ahead', year: 'next year', years: 'the years ahead' }[goal.horizon] || 'next week') : 'next week';
  if (lang.eslSupport || lang.plainLanguage) return `Think of it again now. This helps you keep it for ${later}.`;
  if (tone.correction === 'direct' || tone.praise === 'minimal') return `Recalling it now helps keep it for ${later}.`;
  if (fb.lowStakes) return `No pressure here: recalling it now helps keep it with you for ${later}.`;
  if (tone.correction === 'gentle' || tone.warmth >= 0.65) return `Taking a moment to recall it now helps keep it with you for ${later}.`;
  if (tone.formality >= 0.65) return `Recalling it now helps carry it forward to ${later}.`;
  return `Recalling it now is what moves it into ${later}.`;
}

/**
 * The review line for one learner when a retention question is written. On by default, on its own switch: its gate passed by two families on both arms (docs/MODIFICATION-MAP.md), it calls no
 * model and it states no fact of the subject. REVIEW_LINE=off gives the one fixed line back. Never throws.
 */
function reviewLineFor(userId, where) {
  try {
    if (String(process.env.REVIEW_LINE || 'on').toLowerCase() === 'off') return REVIEW_DEFAULT;
    const spec = lazy('./learning-spec').buildSpec(userId, { trackId: where.track_id, gradeId: where.grade_id });
    if (!spec || spec.isDefault) return REVIEW_DEFAULT;
    return reviewLine(spec, goalFor(userId, where));
  } catch { return REVIEW_DEFAULT; }
}

/**
 * The verdict line after every answer ("Right." / "Not quite."), the most-seen words in the app, one for everyone until now. From templates: no model, no fact. Part `voice`.
 * Its gate is in docs/MODIFICATION-MAP.md. Pure.
 */
function voiceOf(spec) {
  const fb = (spec && spec.feedback) || {};
  const tone = fb.tone || {};
  const lang = (spec && spec.language) || {};
  if (!spec || spec.isDefault) return null;
  if (tone.correction === 'direct' || tone.praise === 'minimal') return { right: 'Correct.', wrong: 'Incorrect.' };
  if (fb.lowStakes) return { right: 'Yes, that is it.', wrong: 'Not yet, and that is fine.' };
  if (lang.eslSupport || lang.plainLanguage) return { right: 'Yes. That is right.', wrong: 'No, not this time.' };
  if (tone.correction === 'gentle' || tone.warmth >= 0.65) return { right: 'Yes, that is right!', wrong: 'Not quite, and you are close to it.' };
  if (tone.formality >= 0.65) return { right: 'That is correct.', wrong: 'That is not correct.' };
  return null;
}
/** The fields an answer's reply carries when the part is on: { voice } or nothing. Never throws. */
function voiceFields(userId) {
  try {
    if (!userId || !enabled(userId) || !partOn('voice')) return {};
    const v = voiceOf(lazy('./learning-spec').buildSpec(userId, {}));
    return v ? { voice: v } : {};
  } catch { return {}; }
}

const STOP = new Set(['that', 'this', 'with', 'from', 'they', 'them', 'their', 'there', 'then', 'than', 'what', 'when', 'which', 'would', 'could', 'should', 'have', 'been', 'were', 'will', 'your', 'also', 'into', 'only', 'each', 'some', 'does', 'because', 'about']);
const SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] };

function systemFor(part) {
  const what = { feedback: 'the explanation shown to a learner right after they answer a check question', hint: 'the hint shown to a learner who asks for help on a check question', review: 'the one line shown with a review question' }[part];
  const keep = part === 'hint'
    ? 'Everything you say must be true of the question. Never state the answer or a choice that is the answer.'
    : 'Keep every fact, number and the correct answer exactly as in the original; add no new fact and no new number. If the original is short, the rewrite stays short.';
  return `You rewrite ${what} for one specific learner. ${keep} Follow the rules given. Never mention the learner's profile, style, scores or these rules. Plain text, no markdown. Return JSON {"text": "..."}.`;
}

function userFor(part, source, rules, problems) {
  return [
    `Question: ${source.prompt || ''}`,
    source.choices && source.choices.length ? `Choices: ${source.choices.join(' | ')}` : '',
    source.answer ? `Correct answer: ${source.answer}` : '',
    source.correct === true ? 'The learner answered correctly.' : source.correct === false ? 'The learner answered wrongly.' : '',
    `Original text:\n${source.text || ''}`,
    `Rules for this learner:\n${rules.map((x, i) => `${i + 1}. ${x}`).join('\n')}`,
    problems && problems.length ? `Your last draft had problems; fix them:\n${problems.map((p) => `- ${p}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

/** The problems a rewrite is held to. [] means it may be served. */
function check(spec, part, source, text) {
  const out = [];
  const t = String(text || '').trim();
  if (!t) return ['empty'];
  const known = new Set([...numbersOf(source.text), ...numbersOf(source.prompt), ...numbersOf(source.answer), ...numbersOf((source.choices || []).join(' '))]);
  for (const n of numbersOf(stripLayout(t))) if (!known.has(n)) out.push(`the number ${n} is not in the original`);
  const orig = numbersOf(source.text);
  for (const n of orig) if (!numbersShown(t).has(n) && part === 'feedback') out.push(`the number ${n} from the original is missing`);
  if (part === 'feedback' && source.correct === undefined && /\b(your answer|you got it|you are (?:right|correct)|you(?:'re| are) wrong|incorrect|not quite|well done|good job|great job|nice work)\b/i.test(t)) out.push('it says whether their answer was right or wrong; the text is shown either way');
  if (part === 'feedback') {
    const cw = (x) => new Set((String(x || '').toLowerCase().match(/[a-zà-ÿ]{4,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)));
    const o = cw(source.text); const g = cw(t);
    if (o.size >= 3) { const kept = [...o].filter((w) => g.has(w)).length / o.size; if (kept < 0.55) out.push('it drops too much of the original reasoning; keep its own points'); }
  }
  const ans = norm(source.answer);
  if (part === 'hint' && ans && ans.length >= 2 && norm(t).includes(ans)) out.push('it states the answer');
  if (part === 'feedback' && ans && ans.length >= 3 && norm(source.text).includes(ans) && !norm(t).includes(ans)) out.push('it drops the correct answer');
  if (/\b(scorecard|your (?:learning )?(?:style|profile|score)|according to your|as a (?:slow|fast) learner)\b/i.test(t)) out.push('it talks about the learner profile');
  for (const d of avoidedIn(spec, source, t)) out.push(`it uses ${d}, which the learner dislikes`);
  const fb = (spec && spec.feedback) || {};
  const n = words(t).length;
  const orig_n = words(source.text).length;
  if (part === 'feedback' && fb.granularity === 'brief' && n > Math.max(35, orig_n)) out.push('it is too long: one or two sentences');
  if (part === 'hint' && n > 45) out.push('it is too long: two sentences');
  if (part === 'review' && n > 40) out.push('it is too long: one sentence');
  if (fb.lowStakes && /\b(test|graded|grade|score|fail(?:ed)?)\b/i.test(t) && !/\b(test|graded|grade|score|fail)/i.test(`${source.prompt}`)) out.push('it uses test language');
  const lang = (spec && spec.language) || {};
  if (lang.maxSentenceWords) {
    const worst = t.split(/(?<=[.!?])\s+/).map((s) => words(s).length).reduce((a, b) => Math.max(a, b), 0);
    if (worst > lang.maxSentenceWords + 6) out.push(`a sentence has ${worst} words; keep them to ${lang.maxSentenceWords}`);
  }
  return out;
}

// ── the fact gate: claim by claim, by a model, after the mechanical check ────
const FACT_GATE_SYSTEM = 'You check a rewrite of a learner-facing text against its original. Only the delivery may change. List the problems:\n- "new": a claim about the subject in the REWRITE that the ORIGINAL does not state or directly imply. A statement about why another choice is wrong is new unless the ORIGINAL says it. A new definition, a new rule, a tip, or an example with facts of its own is new.\n- "dropped": a point the ORIGINAL makes that the REWRITE leaves out.\n- "changed": anything the REWRITE states differently from the ORIGINAL (a number, the answer, an order, which thing is which).\nThese are NOT problems: other words for the same thing, shorter sentences, a different order, one step per line, saying a term again, friendly words that claim nothing, naming a choice or topic from the question, and a comparison from another field given as a comparison ("like a ...") that claims nothing about the subject.\nReply with JSON only: {"new": ["..."], "dropped": ["..."], "changed": ["..."]}. Empty lists when there is nothing.';
const AVOID_CLAUSE = '\n- "avoided": anything in the REWRITE, not already in the ORIGINAL, that comes from the AVOID list (a comparison or example from that area counts, even in other words). Add "avoided": [...] to the JSON.';
function factGatePrompt(source, text, avoid = []) {
  const ctx = [source.prompt ? `QUESTION: ${source.prompt}` : '', source.choices && source.choices.length ? `CHOICES: ${source.choices.join(' | ')}` : '', source.answer ? `CORRECT ANSWER: ${source.answer}` : ''].filter(Boolean).join('\n');
  const list = avoid && avoid.length ? `AVOID: ${avoid.join('; ')}\n\n` : '';
  return { system: list ? FACT_GATE_SYSTEM.replace('\nThese are NOT problems', `${AVOID_CLAUSE}\nThese are NOT problems`) : FACT_GATE_SYSTEM, user: `${list}${ctx ? `${ctx}\n\n` : ''}ORIGINAL:\n${source.text}\n\nREWRITE:\n${text}` };
}
// A hint is meant to say less than the explanation, so "same facts" is the wrong question for it (10 of the 14 hint verdicts behind the old figure): it must not give the answer away and must not say anything false.
const HINT_GATE_SCHEMA = { type: 'object', properties: { gives_answer: { type: 'boolean' }, false_claims: { type: 'array', items: { type: 'string' } } }, required: ['gives_answer', 'false_claims'] };
function hintGatePrompt(source, text) {
  return {
    system: 'You check a hint for a question before a learner sees it. "gives_answer": true if a learner could read off the correct answer or the correct choice from the hint alone, without any thinking of their own. "false_claims": anything the hint states that is false about the question or would lead away from the correct answer. A comparison from another field given as a comparison is not a false claim unless it misleads. Reply with JSON only: {"gives_answer": false, "false_claims": []}.',
    user: `QUESTION: ${source.prompt || ''}\n${source.choices && source.choices.length ? `CHOICES: ${source.choices.join(' | ')}\n` : ''}CORRECT ANSWER: ${source.answer || ''}\n\nHINT:\n${text}`,
  };
}
function readHintGate(reply) {
  const j = firstJson(reply);
  if (!j || typeof j.gives_answer !== 'boolean' || !Array.isArray(j.false_claims)) return null;
  const problems = [...(j.gives_answer ? ['it gives the answer away'] : []), ...j.false_claims.filter(Boolean).map((x) => `false: ${String(x).slice(0, 200)}`)];
  return { ok: problems.length === 0, problems };
}
/** The first whole JSON object in a reply: some models say it, then say it again, or add a note after it. null when there is none. */
function firstJson(reply) {
  const t = String(reply || '');
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0; let quoted = false;
  for (let i = start; i < t.length; i += 1) {
    const c = t[i];
    if (quoted) { if (c === '\\') i += 1; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (!depth) { try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}
/** A judge's reply as { ok, problems } or null when it cannot be read (which is never a pass). */
function readFactGate(reply) {
  const j = firstJson(reply);
  if (!j || typeof j !== 'object' || !['new', 'dropped', 'changed'].some((k) => Array.isArray(j[k]))) return null;
  const problems = ['new', 'dropped', 'changed', 'avoided'].flatMap((k) => (Array.isArray(j[k]) ? j[k] : []).filter((x) => String(x || '').trim()).map((x) => `${k}: ${String(x).slice(0, 200)}`));
  return { ok: problems.length === 0, problems };
}

/**
 * One rewrite and one revision. `llm({system, user, schema})` resolves { text } or null. Returns { text, source: 'ai'|'stored', problems }.
 * Never throws; a rewrite that still fails the check is not served (the stored text is).
 */
async function modify({ spec, part, source, llm, goal = null, gate = null }) {
  const stored = { text: source.text || '', source: 'stored', problems: [] };
  const rules = rulesFor(spec, part, { goal });
  if (!rules.length || !source.text) return stored;
  const ask = async (problems) => {
    try { const r = await llm({ system: systemFor(part), user: userFor(part, source, rules, problems), schema: SCHEMA, schemaName: 'submit', maxTokens: 700, factSource: [source.prompt ? `Question: ${source.prompt}` : '', source.choices && source.choices.length ? `Choices: ${source.choices.join(' | ')}` : '', source.answer ? `Correct answer: ${source.answer}` : '', `Stored text: ${source.text}`].filter(Boolean).join('\n') }); return r && typeof r.text === 'string' ? r.text.trim() : ''; } catch { return ''; }
  };
  // The mechanical check, then the fact gate; two revisions at most, each told what was wrong; whatever still fails is refused and the stored text stays.
  let problems = null;
  let gated = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const text = await ask(problems);
    problems = text ? check(spec, part, source, text) : ['empty'];
    if (!problems.length && gate) {
      gated += 1;
      // eslint-disable-next-line no-await-in-loop
      const v = await gate(part, source, text, spec);
      // A verdict that cannot be read is not a pass: nothing is served on it.
      if (!v) problems = ['the fact check could not be read'];
      else if (!v.ok) problems = v.problems;
    }
    if (!problems.length) return { text, source: 'ai', problems: [], attempts: attempt + 1, gated };
  }
  return { ...stored, problems, gated };
}

// ── serving: the stored text unless a rewrite for this learner is ready ──────
/** A rewrite stored before the fact guard existed had rules only: with the guard on it is not served. */
function shapedChecked(item) { return !lazy('./fact-guard').on() || !!item.shaped.fact_checked; }

function rationaleOf(item) {
  if (!item) return item;
  // What the learner asked for themselves comes first (services/part-change.js); it has its own switch, and its own fact gate.
  if (item.changed && item.changed.rationale && lazy('./part-change').on()) return item.changed.rationale;
  if (enabled(item.user_id) && item.shaped && item.shaped.rationale && shapedChecked(item)) return item.shaped.rationale;
  return item.rationale;
}
function hintOf(item) {
  if (item && enabled(item.user_id) && partOn('hint') && item.shaped && item.shaped.hint && shapedChecked(item)) return item.shaped.hint;
  return item ? item.hint : item;
}

const running = new Set();
const defaultLlm = (userId) => (a) => lazy('./ai').structured({ role: 'fast', task: 'part_modify', ...a, userId, dataClass: 'learner', effort: 'low' });
const GATE_SCHEMA = { type: 'object', properties: { new: { type: 'array', items: { type: 'string' } }, dropped: { type: 'array', items: { type: 'string' } }, changed: { type: 'array', items: { type: 'string' } }, avoided: { type: 'array', items: { type: 'string' } } }, required: ['new', 'dropped', 'changed'] };
/**
 * The live fact gate: the prompt the calibration measured, through services/ai.js (consent rule included), read by two families (pool tasks part_gate_a, Grok first; part_gate_b,
 * DeepSeek first). One family alone let a dropped rule through ("Volume = 8 x 5 x 3" for "Volume is length x width x height": DeepSeek clean, Grok caught it). Both must pass; one that cannot be read is not a pass.
 */
const defaultGate = (userId) => async (part, source, text, spec) => {
  try {
    const q = part === 'hint' ? hintGatePrompt(source, text) : factGatePrompt(source, text, (spec && spec.interests && spec.interests.avoidDomains) || []);
    for (const task of ['part_gate_a', 'part_gate_b']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await lazy('./ai').structured({ role: 'fast', task, system: q.system, user: q.user, schema: part === 'hint' ? HINT_GATE_SCHEMA : GATE_SCHEMA, schemaName: 'submit', maxTokens: 600, userId, dataClass: 'learner', effort: 'low' });
      const v = part === 'hint' ? readHintGate(JSON.stringify(r || null)) : readFactGate(JSON.stringify(r || null));
      if (!v || !v.ok) return v;
    }
    return { ok: true, problems: [] };
  } catch { return null; }
};

/** Where an item sits: its own track and grade, else its session's. */
function placeOf(item) {
  if (item.track_id && item.grade_id) return { trackId: item.track_id, gradeId: item.grade_id };
  try {
    const s = lazy('../config/db').byId('sessions', item.session_id);
    return s ? { trackId: s.track_id, gradeId: s.grade_id } : { trackId: item.track_id || null, gradeId: item.grade_id || null };
  } catch { return { trackId: null, gradeId: null }; }
}

/** The retention goal (effective) for an item's enrollment, or null. */
function goalFor(userId, item) {
  try {
    const rg = lazy('./retention-goal');
    const db = lazy('../config/db');
    const at = placeOf(item);
    const e = db.findOne('enrollments', (x) => x.user_id === userId && x.track_id === at.trackId && x.grade_id === at.gradeId) || null;
    return e ? rg.forEnrollment(userId, e) : null;
  } catch { return null; }
}

/** Background: write `item.shaped` for this learner. Resolves when done; routes must not await it. */
async function prepareItem(userId, item, { llm = null, spec = null, gate = undefined } = {}) {
  if (!enabled(userId) || !userId || !item || !item.rationale) return null;
  // Each rewrite is a write and two gate readings on the learner's daily AI budget (120 calls): background rewrites stop at half of it, so they never cost the tutor its answers.
  if (!llm) { try { if (!lazy('./ai').budgetShareLeft(userId, 0.5)) return null; } catch { return null; } }
  const key = `${userId}:${item.id}`;
  if (running.has(key)) return null;
  running.add(key);
  try {
    const db = lazy('../config/db');
    const ls = lazy('./learning-spec');
    const sp = spec || (() => { const at = placeOf(item); return lazy('./block-adapt').specFor(userId, { trackId: at.trackId, gradeId: at.gradeId, level: item.level }, { topic: item.skill_name, skills: [item.skill_id] }); })();
    if (!sp || sp.isDefault) return null;
    const goal = goalFor(userId, item);
    const hash = `${ls.specHash(sp)}${goalClause(goal) ? `:${hashOf(goalClause(goal))}` : ''}`;
    if (item.shaped && item.shaped.hash === hash) return item.shaped;
    const call = llm || defaultLlm(userId);
    const verify = gate === undefined ? (llm ? null : defaultGate(userId)) : gate;
    const base = { prompt: item.prompt, choices: item.choices, answer: item.answer };
    const isReview = item.rationale === REVIEW_DEFAULT;
    const [fb, hint] = await Promise.all([
      isReview && partOn('review') ? Promise.resolve({ source: 'ai', text: reviewLine(sp, goal) }) : !isReview && partOn('feedback') ? modify({ spec: sp, part: 'feedback', source: { ...base, text: item.rationale }, llm: call, goal, gate: verify }) : Promise.resolve(null),
      item.hint && partOn('hint') ? modify({ spec: sp, part: 'hint', source: { ...base, text: item.hint }, llm: call, gate: verify }) : Promise.resolve(null),
    ]);
    const shaped = { hash, at: new Date().toISOString(), fact_checked: lazy('./fact-guard').on(), rationale: fb && fb.source === 'ai' ? fb.text : null, hint: hint && hint.source === 'ai' ? hint.text : null };
    db.update('items', item.id, { shaped });
    return shaped;
  } catch { return null; } finally { running.delete(key); }
}

/** Fire and forget for a batch of items; never throws, never delays the caller. */
function prepareItems(userId, items) {
  if (!userId || !enabled(userId) || !Array.isArray(items)) return;
  const todo = items.filter((i) => i && i.rationale && !(i.shaped && i.shaped.hash));
  if (!todo.length) return;
  setImmediate(() => { (async () => { for (const i of todo.slice(0, 12)) await prepareItem(userId, i); })().catch(() => {}); });
}

// ── uploaded course: rewrite the lesson text when the profile has moved ──────
const REFRESH_EVERY_MS = 24 * 3600 * 1000;
const refreshing = new Set();

/** Is the stored course lesson text out of date for this learner (spec drifted, at most once a day)? */
function courseStale(course, spec, now = Date.now()) {
  if (!enabled(course && course.user_id) || !course || course.status !== 'ready' || !spec || spec.isDefault) return false;
  const last = Date.parse(course.lessons_refreshed_at || '');
  if (Number.isFinite(last) && now - last < REFRESH_EVERY_MS) return false;
  const sig = lazy('./spec-sig');
  if (!course.lesson_sig) return false; // written before signatures: left alone until its next build records one
  return sig.driftedEnough(course.lesson_sig, sig.specSig(spec));
}

/** A rewrite of one skill's paragraphs that keeps every number and the key points; null if it cannot be held to that. */
async function rewriteLesson(args) { return (await rewriteLessonDetail(args)).paragraphs; }

/**
 * A free rewrite of a lesson added facts whatever it was told (7 Nov, held-out: 25 of 30 refused, "Many towns and farms were damaged", "So the mean is 5"), so the writer no longer writes a lesson. It
 * rewrites each sentence on its own, and code does the layout from the spec: how the text is cut into pieces and numbered. A sentence that loses a number goes back to the stored sentence, so a
 * rewrite can be partial. One comparison may be offered apart from the text, and is dropped first when the gate objects.
 */
const LESSON_SYSTEM = 'You rewrite a lesson for one specific learner, sentence by sentence. You are given numbered sentences. For each one, write what that sentence says and nothing else, in the delivery asked for; you may split it into shorter sentences. The reader should feel this was written for them: reword every sentence to fit the delivery notes (its words, length, register, how it addresses the reader), and copy a sentence unchanged only when it already fits them. Keep every fact, number, name and term it has. Add nothing: no opener, no summary, no "key idea", no question, no step label, no example, no definition, no cause or consequence, even if you know it to be true. Never mention the learner. Return JSON {"sentences": [["..."], ["...", "..."]], "comparison": ""}: "sentences" has exactly one list per numbered sentence, in order. "comparison" is one short comparison only if the delivery notes offer one and it truly has the same structure as the idea, written as a comparison ("It is like ...") with no fact of its own; otherwise "".';

// The levers a rewrite of a finished text can honestly follow. The full material block also asks for mistakes, a big picture, a hook, a recap and worked cases; a rewrite has nothing of its own
// to put there, so writers made them up, and that is what the fact gate caught (7 Nov pilot: "A common wrong idea...", "It fits into the larger picture...").
const DELIVERY = ['chunk', 'density', 'structure', 'warmth', 'formality', 'humor', 'praise', 'gentleness', 'pressure', 'ruleFirst', 'notation', 'instructions', 'length'];
function lessonDeliveryLines(spec) {
  const ls = lazy('./learning-spec');
  const lang = spec.language || {};
  const it = spec.interests || {};
  const ranked = DELIVERY.map((l) => ({ l, lean: (spec.levers || {})[l] || 0 })).filter((x) => Math.abs(x.lean) >= ls.SHOW_AT && ls.PHRASES[x.l]).sort((a, b) => Math.abs(b.lean) - Math.abs(a.lean));
  const tone = (spec.feedback && spec.feedback.tone) || {};
  const out = [`Language: reading grade ${lang.vocabularyGrade || 'of the original'}; most sentences ${lang.maxSentenceWords || 20} words or fewer${lang.eslSupport ? '; everyday words, no idioms or phrasal verbs' : ''}.`];
  if (tone.formality >= 0.65) out.push('Register: formal and precise; no contractions; never "you".');
  else if (tone.formality <= 0.35) out.push('Register: casual, as one person talking to another: contractions, and "you" where the sentence allows it.');
  if (tone.correction === 'gentle' || tone.warmth >= 0.65) out.push('Warm and unhurried wording, without any cheering or claim.');
  else if (tone.correction === 'direct' || tone.warmth <= 0.35) out.push('Blunt, stripped wording: the fewest words that keep each point.');
  for (const x of ranked) { const p = ls.PHRASES[x.l][x.lean > 0 ? 1 : 0]; if (p) out.push(p); }
  if (it.exampleDomains && it.exampleDomains.length && it.share >= 0.3) out.push(`Only where it truly has the same structure as the idea, a short comparison from ${it.exampleDomains.slice(0, 2).join(' or ')}, given as a comparison and stating no fact of its own.`);
  if (it.avoidDomains && it.avoidDomains.length) out.push(`Never use anything about: ${it.avoidDomains.join(', ')}.`);
  return out.map((x, i) => `${i + 1}. ${x}`);
}

const sentencesIn = (t) => String(t || '').split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(])/).map((x) => x.trim()).filter(Boolean);
/** The pieces a learner reads, from the spec: how many sentences to a paragraph, and numbered when they follow numbered steps. Pure. */
function layoutLesson(spec, groups, comparison) {
  const size = Math.max(1, Math.min(6, Number((spec.lesson || {}).chunkSentences) || 4));
  const flat = groups.flat();
  const paragraphs = [];
  for (let i = 0; i < flat.length; i += size) paragraphs.push(flat.slice(i, i + size).join(' '));
  const numbered = spec.explain && spec.explain.numberedSteps && paragraphs.length >= 2 ? paragraphs.map((p, i) => `${i + 1}. ${p}`) : paragraphs;
  return comparison ? [...numbered, comparison] : numbered;
}

/** The same, with the problems the last draft still had: { paragraphs: [..] | null, problems: [..], attempts, partial }. */
async function rewriteLessonDetail({ spec, skill, llm, gate = null }) {
  const stored = skill.lesson.paragraphs || [];
  const orig = stored.join('\n\n');
  const keys = skill.lesson.key_points || [];
  const units = stored.flatMap(sentencesIn);
  const source = { text: orig, title: skill.title, prompt: `Lesson: ${skill.title}` };
  const block = `How to deliver it for this learner:\n${lessonDeliveryLines(spec).join('\n')}`;
  const ask = async (note) => {
    try {
      const r = await llm({
        system: LESSON_SYSTEM,
        user: `Lesson: ${skill.title}\n\nSentences:\n${units.map((u, i) => `${i + 1}. ${u}`).join('\n')}\n\n${block}${note ? `\n\nYour last draft had problems; fix them:\n${note}` : ''}`,
        schema: { type: 'object', properties: { sentences: { type: 'array', items: { type: 'array', items: { type: 'string' } } }, comparison: { type: 'string' } }, required: ['sentences'] }, schemaName: 'submit', maxTokens: 7000, factSource: `Lesson: ${skill.title}\n\n${orig}`,
      });
      return r && Array.isArray(r.sentences) ? r : null;
    } catch { return null; }
  };
  const keptNumbers = (from, to) => { const have = numbersShown(to); const known = numbersOf(`${from} ${skill.title}`); return [...numbersOf(from)].every((n) => have.has(n)) && [...numbersOf(to)].every((n) => known.has(n)); };
  /** Sentence by sentence, against its own original: a sentence that fails goes back to the stored one. */
  const assemble = (r) => {
    let reverted = 0;
    const groups = units.map((u, i) => {
      const got = Array.isArray(r.sentences[i]) ? r.sentences[i].map((x) => String(x || '').trim()).filter(Boolean) : [];
      const joined = got.join(' ');
      const ok = got.length && keptNumbers(u, joined) && !avoidedIn(spec, { ...source, text: u }, joined).length && joined.split(/\s+/).length <= 3 * u.split(/\s+/).length + 8;
      if (!ok) reverted += 1;
      return ok ? got : [u];
    });
    return { groups, reverted, comparison: String(r.comparison || '').trim() };
  };
  const problemsOf = (paras) => {
    const body = paras.join(' ');
    const out = [];
    const c = lazy('./learning-spec').checkFollowed(body, spec, { keyFacts: keys, exempt: String(`${orig} ${skill.title}`).toLowerCase().match(/[a-zà-ÿ]{4,}/g) || [], minShare: 0.3, own: true, interestNeed: 0 });
    for (const p of c.problems) if (['coverage', 'profile_leak'].includes(p.id)) out.push(p.detail);
    for (const d of avoidedIn(spec, source, body)) out.push(`it uses ${d}, which this learner dislikes; use other examples`);
    return out;
  };
  const gateOf = async (paras) => {
    if (!gate) return [];
    const v = await gate('lesson', source, paras.join('\n\n'), spec);
    if (!v) return ['the fact check could not be read'];
    return v.ok ? [] : v.problems;
  };
  let problems = null;
  let attempts = 0;
  for (; attempts < 3; attempts += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await ask(problems ? problems.join('\n') : null);
    if (!r) { problems = ['empty']; continue; } // eslint-disable-line no-continue
    const { groups, reverted, comparison } = assemble(r);
    const offered = comparison && !numbersOf(comparison).size && !avoidedIn(spec, source, comparison).length ? comparison : '';
    let paras = layoutLesson(spec, groups, offered);
    problems = problemsOf(paras);
    // eslint-disable-next-line no-await-in-loop
    if (!problems.length) problems = await gateOf(paras);
    if (problems.length && offered) {
      // The comparison goes first: the text may still stand without it.
      paras = layoutLesson(spec, groups, '');
      const without = problemsOf(paras);
      // eslint-disable-next-line no-await-in-loop
      if (!without.length) { const g = await gateOf(paras); if (!g.length) problems = []; else problems = g; }
    }
    if (!problems.length && reverted >= units.length) problems = ['nothing could be rewritten'];
    if (!problems.length) return { paragraphs: paras, problems: [], attempts: attempts + 1, partial: reverted > 0 };
  }
  return { paragraphs: null, problems, attempts, partial: false };
}

/**
 * Background: re-write the lesson paragraphs of a stored course for the learner's current profile. The questions are not touched. The old
 * paragraphs stay on the skill (`lesson.prev`) so nothing is lost. Resolves { refreshed, kept } or null.
 */
async function refreshCourseLessons(userId, materialId, { llm = null, force = false, gate = undefined } = {}) {
  const key = `${userId}:${materialId}`;
  if (!enabled(userId) || !partOn('lesson') || refreshing.has(key)) return null;
  const builder = lazy('./course-builder');
  const db = lazy('../config/db');
  const course = builder.get(userId, materialId);
  if (!course) return null;
  const ls = lazy('./learning-spec');
  const spec = ls.buildSpec(userId, { topic: course.title });
  if (!force && !courseStale(course, spec)) return null;
  refreshing.add(key);
  try {
    db.update('material_courses', course.id, { lessons_refreshed_at: new Date().toISOString() });
    const call = llm || defaultLlm(userId);
    const verify = gate === undefined ? (llm ? null : defaultGate(userId)) : gate;
    let refreshed = 0; let kept = 0;
    const skills = [];
    for (const s of course.skills || []) {
      // eslint-disable-next-line no-await-in-loop
      const paras = s.lesson && (s.lesson.paragraphs || []).length ? await rewriteLesson({ spec, skill: s, llm: call, gate: verify }) : null;
      if (paras) { skills.push({ ...s, lesson: { ...s.lesson, paragraphs: paras, prev: s.lesson.prev || s.lesson.paragraphs } }); refreshed += 1; } else { skills.push(s); kept += 1; }
    }
    // The course may have changed while we wrote: only skills still equal to what we read are replaced.
    const now = builder.get(userId, materialId);
    if (!now) return null;
    const byId = new Map(skills.map((s) => [s.id, s]));
    const merged = (now.skills || []).map((s) => {
      const n = byId.get(s.id);
      return n && JSON.stringify(s.lesson.paragraphs) === JSON.stringify((course.skills.find((c) => c.id === s.id) || {}).lesson.paragraphs) ? { ...s, lesson: n.lesson } : s;
    });
    db.update('material_courses', now.id, { skills: merged, lesson_sig: lazy('./spec-sig').specSig(spec), lessons_refreshed_at: new Date().toISOString() });
    return { refreshed, kept };
  } catch { return null; } finally { refreshing.delete(key); }
}

/** Record the spec signature on a freshly built course (so a later drift can be told). Never throws. */
function stampCourse(userId, course) {
  try {
    if (!course || !userId) return;
    const spec = lazy('./learning-spec').buildSpec(userId, { topic: course.title });
    if (spec.isDefault) return;
    lazy('../config/db').update('material_courses', course.id, { lesson_sig: lazy('./spec-sig').specSig(spec) });
  } catch { /* nothing to stamp */ }
}

/** Fire and forget from a route that serves a course. */
function maybeRefreshCourse(userId, materialId) {
  // With the part layer following the learner (services/material-parts.js) this older rewrite, which writes over the stored lesson, must not run as well.
  try { if (lazy('./material-parts').followOn()) return; } catch { /* the older path stands */ }
  if (!enabled(userId) || !partOn('lesson')) return;
  setImmediate(() => { refreshCourseLessons(userId, materialId).catch(() => {}); });
}

const hashOf = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

module.exports = {
  PARTS, REVIEW_DEFAULT, factGatePrompt, readFactGate, hintGatePrompt, readHintGate, firstJson, lessonDeliveryLines, defaultGate, avoidedIn, reviewLine, reviewLineFor, voiceOf, voiceFields, accountSetting, enabled, partOn, rulesFor, check, modify, rationaleOf, hintOf, prepareItem, prepareItems, goalClause, courseStale, rewriteLesson, rewriteLessonDetail, refreshCourseLessons, stampCourse, maybeRefreshCourse, hashOf,
};
