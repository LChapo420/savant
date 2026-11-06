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
const enabled = () => String(process.env.PART_MODIFY || DEFAULT_ON).toLowerCase() !== 'off';
// Default: see docs/MODIFICATION-AUDIT.md section 7 (on only where the gate passed).
const DEFAULT_ON = 'off';

const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require
const words = (t) => (String(t || '').match(/[A-Za-zÀ-ÿ0-9'-]+/g) || []);
const numbersOf = (t) => new Set((String(t || '').match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));
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
    r.push(fb.granularity === 'brief'
      ? 'Length: one or two sentences only: whether the answer is right or wrong and the single fix or key idea. No step-by-step.'
      : fb.granularity === 'detailed'
        ? 'Length: explain step by step why the answer is right or wrong, each step on its own line, three to six lines.'
        : 'Length: two to three sentences: the reason and the fix.');
    r.push('This text is shown after a right answer and after a wrong one, so never say whether their answer was right or wrong ("your answer", "you got it", "incorrect", "not quite"): explain the idea itself.');
    if (fb.nameTheError || tone.correction === 'gentle') r.push('Name the tempting wrong idea and exactly why it fails, kindly, then the right idea.');
  } else if (part === 'hint') {
    r.push(sc.hintSize === 'generous'
      ? 'Hint size: generous: name the idea to use and show the first step, but never the final answer.'
      : 'Hint size: small: one nudge or one question about where to look, never the step itself and never the answer.');
    r.push('Length: at most two sentences.');
  } else if (part === 'review') {
    r.push('Length: one sentence that says why recalling this now helps, in their terms; no facts beyond the question.');
    if (ctx.goal) { const g = goalClause(ctx.goal); if (g) r.push(`They want to keep this for ${g}: say, once, how this recall serves that.`); }
  }
  // Tone, for every part.
  const warm = tone.warmth >= 0.65 ? 'warm and encouraging' : tone.warmth <= 0.35 ? 'matter-of-fact, no cheering' : null;
  if (warm) r.push(`Tone: ${warm}.`);
  if (tone.correction === 'gentle') r.push('Gentle: frame it as "here is the idea", with encouraging, low-pressure wording; never blunt.');
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
  if (it.exampleDomains && it.exampleDomains.length && it.share >= 0.3 && part !== 'hint') r.push(`If it helps the idea land, one short comparison from ${it.exampleDomains.slice(0, 2).join(' or ')} is welcome; it states no fact of its own.`);
  if (it.exampleDomains && it.exampleDomains.length && part === 'hint' && it.share >= 0.5) r.push(`If it fits, point the nudge through ${it.exampleDomains[0]}; never a fact.`);
  if (it.avoidDomains && it.avoidDomains.length) r.push(`Never use anything about: ${it.avoidDomains.join(', ')}.`);
  return r;
}

const SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] };

function systemFor(part) {
  const what = { feedback: 'the explanation shown to a learner right after they answer a check question', hint: 'the hint shown to a learner who asks for help on a check question', review: 'the one line shown with a review question' }[part];
  return `You rewrite ${what} for one specific learner. Keep every fact, number and the correct answer exactly as in the original; add no new fact and no new number. Follow the rules given. Never mention the learner's profile, style, scores or these rules. ${part === 'hint' ? 'Never state the answer or a choice that is the answer. ' : ''}Plain text, no markdown. Return JSON {"text": "..."}.`;
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
  for (const n of numbersOf(t)) if (!known.has(n)) out.push(`the number ${n} is not in the original`);
  const orig = numbersOf(source.text);
  for (const n of orig) if (!numbersOf(t).has(n) && part === 'feedback') out.push(`the number ${n} from the original is missing`);
  if (part === 'feedback' && source.correct === undefined && /\b(your answer|you got it|you are (?:right|correct)|you(?:'re| are) wrong|incorrect|not quite|well done|good job|great job|nice work)\b/i.test(t)) out.push('it says whether their answer was right or wrong; the text is shown either way');
  const ans = norm(source.answer);
  if (part === 'hint' && ans && ans.length >= 2 && norm(t).includes(ans)) out.push('it states the answer');
  if (part === 'feedback' && ans && ans.length >= 3 && norm(source.text).includes(ans) && !norm(t).includes(ans)) out.push('it drops the correct answer');
  if (/\b(scorecard|your (?:learning )?(?:style|profile|score)|according to your|as a (?:slow|fast) learner)\b/i.test(t)) out.push('it talks about the learner profile');
  for (const d of (spec && spec.interests && spec.interests.avoidDomains) || []) if (lazy('./learning-spec').mentions(t, d)) out.push(`it uses ${d}, which the learner dislikes`);
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

/**
 * One rewrite and one revision. `llm({system, user, schema})` resolves { text } or null. Returns { text, source: 'ai'|'stored', problems }.
 * Never throws; a rewrite that still fails the check is not served (the stored text is).
 */
async function modify({ spec, part, source, llm, goal = null }) {
  const stored = { text: source.text || '', source: 'stored', problems: [] };
  const rules = rulesFor(spec, part, { goal });
  if (!rules.length || !source.text) return stored;
  const ask = async (problems) => {
    try { const r = await llm({ system: systemFor(part), user: userFor(part, source, rules, problems), schema: SCHEMA, schemaName: 'submit', maxTokens: 700 }); return r && typeof r.text === 'string' ? r.text.trim() : ''; } catch { return ''; }
  };
  let text = await ask(null);
  let problems = text ? check(spec, part, source, text) : ['empty'];
  if (problems.length) {
    const second = await ask(problems);
    const p2 = second ? check(spec, part, source, second) : ['empty'];
    if (!p2.length) { text = second; problems = []; } else problems = p2;
  }
  return problems.length ? { ...stored, problems } : { text, source: 'ai', problems: [] };
}

// ── serving: the stored text unless a rewrite for this learner is ready ──────
function rationaleOf(item) {
  if (item && enabled() && item.shaped && item.shaped.rationale) return item.shaped.rationale;
  return item ? item.rationale : item;
}
function hintOf(item) {
  if (item && enabled() && item.shaped && item.shaped.hint) return item.shaped.hint;
  return item ? item.hint : item;
}

const running = new Set();
const defaultLlm = (userId) => (a) => lazy('./ai').structured({ role: 'fast', task: 'part_modify', ...a, userId, dataClass: 'learner', effort: 'low' });

/** The retention goal (effective) for an item's enrollment, or null. */
function goalFor(userId, item) {
  try {
    const rg = lazy('./retention-goal');
    const db = lazy('../config/db');
    const e = db.findOne('enrollments', (x) => x.user_id === userId && x.track_id === item.track_id && x.grade_id === item.grade_id) || null;
    return e ? rg.forEnrollment(userId, e) : null;
  } catch { return null; }
}

/** Background: write `item.shaped` for this learner. Resolves when done; routes must not await it. */
async function prepareItem(userId, item, { llm = null, spec = null } = {}) {
  if (!enabled() || !userId || !item || !item.rationale) return null;
  const key = `${userId}:${item.id}`;
  if (running.has(key)) return null;
  running.add(key);
  try {
    const db = lazy('../config/db');
    const ls = lazy('./learning-spec');
    const sp = spec || lazy('./block-adapt').specFor(userId, { trackId: item.track_id, gradeId: item.grade_id, level: item.level }, { topic: item.skill_name, skills: [item.skill_id] });
    if (!sp || sp.isDefault) return null;
    const hash = ls.specHash(sp);
    if (item.shaped && item.shaped.hash === hash) return item.shaped;
    const call = llm || defaultLlm(userId);
    const base = { prompt: item.prompt, choices: item.choices, answer: item.answer };
    const goal = goalFor(userId, item);
    const [fb, hint] = await Promise.all([
      modify({ spec: sp, part: 'feedback', source: { ...base, text: item.rationale }, llm: call, goal }),
      item.hint ? modify({ spec: sp, part: 'hint', source: { ...base, text: item.hint }, llm: call }) : Promise.resolve(null),
    ]);
    const shaped = { hash, at: new Date().toISOString(), rationale: fb.source === 'ai' ? fb.text : null, hint: hint && hint.source === 'ai' ? hint.text : null };
    db.update('items', item.id, { shaped });
    return shaped;
  } catch { return null; } finally { running.delete(key); }
}

/** Fire and forget for a batch of items; never throws, never delays the caller. */
function prepareItems(userId, items) {
  if (!enabled() || !userId || !Array.isArray(items)) return;
  const todo = items.filter((i) => i && i.rationale && !(i.shaped && i.shaped.hash));
  if (!todo.length) return;
  setImmediate(() => { (async () => { for (const i of todo.slice(0, 12)) await prepareItem(userId, i); })().catch(() => {}); });
}

// ── uploaded course: rewrite the lesson text when the profile has moved ──────
const REFRESH_EVERY_MS = 24 * 3600 * 1000;
const refreshing = new Set();

/** Is the stored course lesson text out of date for this learner (spec drifted, at most once a day)? */
function courseStale(course, spec, now = Date.now()) {
  if (!enabled() || !course || course.status !== 'ready' || !spec || spec.isDefault) return false;
  const last = Date.parse(course.lessons_refreshed_at || '');
  if (Number.isFinite(last) && now - last < REFRESH_EVERY_MS) return false;
  const sig = lazy('./spec-sig');
  if (!course.lesson_sig) return false; // written before signatures: left alone until its next build records one
  return sig.driftedEnough(course.lesson_sig, sig.specSig(spec));
}

/** A rewrite of one skill's paragraphs that keeps every number and the key points; null if it cannot be held to that. */
async function rewriteLesson({ spec, skill, llm }) {
  const orig = (skill.lesson.paragraphs || []).join('\n\n');
  const keys = skill.lesson.key_points || [];
  const block = lazy('./learning-spec').specToLines(spec, { surface: 'material' }).join('\n');
  const ask = async (note) => {
    try {
      const r = await llm({
        system: 'You rewrite one lesson text for one specific learner. Keep every fact, number, definition and key point exactly as in the original; add no fact and no number. Only the delivery changes. Never mention the learner or their profile. Plain text paragraphs. Return JSON {"paragraphs": ["..."]}.',
        user: `Lesson: ${skill.title}\n\nOriginal paragraphs:\n${orig}\n\nKey points that must stay:\n${keys.map((k) => `- ${k}`).join('\n') || '- (none listed)'}\n\n${block}${note ? `\n\nYour last draft had problems; fix them:\n${note}` : ''}`,
        schema: { type: 'object', properties: { paragraphs: { type: 'array', items: { type: 'string' } } }, required: ['paragraphs'] }, schemaName: 'submit', maxTokens: 2500,
      });
      return r && Array.isArray(r.paragraphs) ? r.paragraphs.map((p) => String(p).trim()).filter(Boolean).slice(0, 10) : null;
    } catch { return null; }
  };
  const problemsOf = (paras) => {
    if (!paras || !paras.length) return ['empty'];
    const text = paras.join(' ');
    const out = [];
    const have = numbersOf(text);
    for (const n of numbersOf(orig)) if (!have.has(n)) out.push(`the number ${n} is missing`);
    for (const n of have) if (!numbersOf(`${orig} ${skill.title}`).has(n)) out.push(`the number ${n} is not in the original`);
    const c = lazy('./learning-spec').checkFollowed(text, spec, { keyFacts: keys, minShare: 0.3, own: true, interestNeed: 0 });
    for (const p of c.problems) if (['coverage', 'profile_leak', 'avoid_domain'].includes(p.id)) out.push(p.detail);
    return out;
  };
  let paras = await ask(null);
  let problems = problemsOf(paras);
  if (problems.length) { paras = await ask(problems.join('\n')); problems = problemsOf(paras); }
  return problems.length ? null : paras;
}

/**
 * Background: re-write the lesson paragraphs of a stored course for the learner's current profile. The questions are not touched. The old
 * paragraphs stay on the skill (`lesson.prev`) so nothing is lost. Resolves { refreshed, kept } or null.
 */
async function refreshCourseLessons(userId, materialId, { llm = null, force = false } = {}) {
  const key = `${userId}:${materialId}`;
  if (!enabled() || refreshing.has(key)) return null;
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
    let refreshed = 0; let kept = 0;
    const skills = [];
    for (const s of course.skills || []) {
      // eslint-disable-next-line no-await-in-loop
      const paras = s.lesson && (s.lesson.paragraphs || []).length ? await rewriteLesson({ spec, skill: s, llm: call }) : null;
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
  if (!enabled()) return;
  setImmediate(() => { refreshCourseLessons(userId, materialId).catch(() => {}); });
}

const hashOf = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

module.exports = {
  PARTS, enabled, rulesFor, check, modify, rationaleOf, hintOf, prepareItem, prepareItems, goalClause, courseStale, rewriteLesson, refreshCourseLessons, stampCourse, maybeRefreshCourse, hashOf,
};
