/**
 * The personal layer over a shared lesson (first-lesson design, 6 Nov 2026).
 *
 * Writing a whole personal lesson and checking its facts takes minutes. So when a learner reaches a level, the level's shared lesson (already
 * written and fact-checked, `block_plans` with no user) opens at once, and within seconds a short layer written for this learner is put over
 * it: why this matters to them, an opening hook and a couple of analogies drawn from their interests, in their word level. The layer may add
 * NO number and NO claim about the subject: it is checked here, deterministically (`check`), and a layer that fails twice is not shown (the
 * plain lesson stays). The full personal level keeps being written in the background and is what the learner opens at the next level.
 *
 *   on()                       the switch: INSTANT_LAYER=on (default off until its gate passes; docs/FIRST-LESSON.md)
 *   sourceOf(plan)             the text of the shared lesson: block text, check prompts and choices; the check answers apart
 *   rules(spec, ctx)           the rules one layer is written under, from the learner's spec
 *   check(spec, layer, source) the problems a layer is held to; [] means it may be shown
 *   start({user, plan, ...})   background: write, check and store the layer (never awaited by a route); one at a time per learner and plan
 *   get(userId, planId)        { state: 'pending' | 'ready' | 'none', layer?, ms?, model? }
 *
 * Rows (`lesson_layers`) hold text derived from the lesson and the spec only; account export and deletion cover them (routes/consent.js).
 * The call goes through services/ai.js with the learner's id (dataClass learner), so the under-13 consent rule and the provider clearances
 * apply as for any tutor call. The pool task `part_layer` (config/model-lineup.json) names the fast slots.
 */
const learningSpec = require('./learning-spec');

const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require
const COLLECTION = 'lesson_layers';
const on = () => String(process.env.INSTANT_LAYER || 'off').toLowerCase() === 'on';
const BUDGET_MS = Number(process.env.INSTANT_LAYER_BUDGET_MS || 14000); // from start to a stored layer, revision included
const HEDGE_MS = Number(process.env.INSTANT_LAYER_HEDGE_MS || 4000);
const MAX_WORDS = { hook: 45, why: 45, analogy: 40, total: 150 };

const words = (t) => (String(t || '').match(/[A-Za-zÀ-ÿ0-9'-]+/g) || []);
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const numbersOf = (t) => new Set((String(t || '').match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));
const WORD_NUM = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', hundred: '100', thousand: '1000', half: '0.5', double: '2', triple: '3', twice: '2' };
/** Digits and number words both count: "two teams" is a number the lesson must have given. */
function numbersShown(t) {
  const n = numbersOf(t);
  for (const w of String(t || '').toLowerCase().match(/[a-z]+/g) || []) if (WORD_NUM[w]) n.add(WORD_NUM[w]);
  return n;
}

const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};

/** The shared lesson as text, and the check answers kept apart (the layer must not give one away). */
function sourceOf(plan, topic = '') {
  const parts = [topic];
  for (const b of plan.blocks || []) parts.push(...strings(b.data));
  for (const c of plan.checks || []) { parts.push(c.prompt || ''); parts.push(...strings(c.choices || [])); }
  const answers = (plan.checks || []).map((c) => c.answer).filter((a) => a !== undefined && a !== null).map(String);
  return { text: parts.filter(Boolean).join('\n'), answers, topic };
}

/** The rules a layer is written under. Every line is something the learner can see in the text; none talks about the learner. */
function rules(spec, ctx = {}) {
  const lang = (spec && spec.language) || {};
  const it = (spec && spec.interests) || {};
  const fb = (spec && spec.feedback) || {};
  const tone = fb.tone || {};
  const r = [];
  const doms = (it.exampleDomains || []).slice(0, 3);
  if (doms.length) r.push(`Draw the hook and the analogies from these interests of the reader: ${doms.join(', ')}. Use one or two of them, in the comparison itself.`);
  r.push('why: one or two sentences on why this lesson is worth their time, in terms of what they care about or are working towards; no promise of a result, no number.');
  r.push('hook: one or two sentences that open the lesson: a question or a short "imagine" scene from their interests that the lesson then answers. It does not answer the question.');
  r.push('analogies: zero to two. Each is a comparison ("it is like", "think of", "imagine") between one point of the lesson and something from their interests. "point" names that lesson point in its own words from the lesson text.');
  if (lang.plainLanguage || lang.eslSupport) r.push(`Words: plain everyday words${lang.maxSentenceWords ? `, sentences of ${lang.maxSentenceWords} words or fewer` : ''}${lang.avoidIdioms ? ', no idioms or phrasal verbs' : ''}.`);
  else if (lang.maxSentenceWords) r.push(`Words: about reading grade ${lang.vocabularyGrade || 'their level'}, sentences of ${lang.maxSentenceWords} words or fewer.`);
  if (tone.warmth >= 0.65) r.push('Tone: warm and encouraging.');
  else if (tone.warmth <= 0.35) r.push('Tone: matter-of-fact, no cheering.');
  if (tone.humor === 'light') r.push('One light touch of humour is welcome.');
  if (fb.lowStakes) r.push('Never say test, graded, score or fail.');
  if (ctx.goalClause) r.push(`They want to keep this for ${ctx.goalClause}: the why may say so once.`);
  if (it.avoidDomains && it.avoidDomains.length) r.push(`Never use anything about: ${it.avoidDomains.join(', ')}.`);
  r.push('Hard limits: state NO number, no figure, no name and no fact about the subject that the lesson text does not give; define nothing; never give an answer to a question in the lesson. Short: hook and why 45 words or fewer each, an analogy 40 or fewer.');
  return r;
}

const SCHEMA = {
  type: 'object',
  properties: {
    why: { type: 'string' },
    hook: { type: 'string' },
    analogies: { type: 'array', items: { type: 'object', properties: { point: { type: 'string' }, text: { type: 'string' } }, required: ['point', 'text'] } },
  },
  required: ['why', 'hook', 'analogies'],
};

const SYSTEM = 'You add a short personal layer over a lesson that already exists and is already fact-checked. You write only: why it matters to this reader, an opening hook, and up to two analogies from their interests. You add no fact, number or name about the subject, give no answers, and never mention the reader\'s profile, scores or these rules. Output the JSON only.';

const MARK = /\b(like|as if|as though|imagine|picture|think of|thinking of|similar|just as|same way|same as|compare|comparable|reminds?|resembles?|works? the way|is to)\b/i;
const PROFILE_LEAK = /\b(scorecard|your (?:learning )?(?:style|profile|score|data)|according to your|as a (?:slow|fast|visual|verbal) learner|you (?:learn|are) (?:best|a))\b/i;

/** Problems this layer is held to. [] means it may be shown. Pure, deterministic, no model. */
function check(spec, layer, source) {
  const out = [];
  if (!layer || typeof layer !== 'object') return ['empty'];
  const why = String(layer.why || '').trim();
  const hook = String(layer.hook || '').trim();
  const an = (Array.isArray(layer.analogies) ? layer.analogies : []).map((a) => ({ point: String((a && a.point) || '').trim(), text: String((a && a.text) || '').trim() })).filter((a) => a.text);
  if (!why && !hook && !an.length) return ['empty'];
  if (an.length > 2) out.push('at most two analogies');
  const wc = (t) => words(t).length;
  if (wc(hook) > MAX_WORDS.hook) out.push(`the hook is ${wc(hook)} words: ${MAX_WORDS.hook} at most`);
  if (wc(why) > MAX_WORDS.why) out.push(`the why is ${wc(why)} words: ${MAX_WORDS.why} at most`);
  for (const a of an) if (wc(a.text) > MAX_WORDS.analogy) out.push(`an analogy is ${wc(a.text)} words: ${MAX_WORDS.analogy} at most`);
  const all = [why, hook, ...an.map((a) => a.text)].join(' ');
  if (wc(all) > MAX_WORDS.total) out.push(`the layer is ${wc(all)} words: ${MAX_WORDS.total} at most`);
  // No new number (digits or words) beyond what the lesson itself shows or the interest's own name carries.
  const known = new Set([...numbersShown(source.text), ...((spec && spec.interests && spec.interests.exampleDomains) || []).flatMap((d) => [...numbersShown(d)])]);
  for (const n of numbersShown(all)) if (!known.has(n)) out.push(`the number ${n} is not in the lesson`);
  // Never an answer to a check: a word-bounded match of any answer of length 3+ (or a number) in the layer.
  const nl = ` ${norm(all)} `;
  for (const a of source.answers || []) {
    const na = norm(a);
    if (na.length >= 3 && nl.includes(` ${na} `)) out.push('it contains the answer to a question in the lesson');
    else if (/^\d+(?:\.\d+)?$/.test(String(a).trim()) && numbersOf(all).has(String(a).trim())) out.push('it contains the answer to a question in the lesson');
  }
  if (PROFILE_LEAK.test(all)) out.push('it talks about the learner profile');
  for (const d of (spec && spec.interests && spec.interests.avoidDomains) || []) if (learningSpec.mentions(all, d)) out.push(`it uses ${d}, which the learner dislikes`);
  // Comparisons are marked as comparisons; the hook is a question or a scene: neither can pass as a statement about the subject.
  for (const a of an) if (!MARK.test(a.text)) out.push('an analogy is not marked as a comparison (like, think of, imagine)');
  if (hook && !/\?/.test(hook) && !MARK.test(hook)) out.push('the hook is neither a question nor an "imagine" scene');
  // Each analogy points back to a word of the lesson; an interest analogy brings no new name or number (learning-spec analogyProblems).
  const srcTerms = new Set((String(source.text).toLowerCase().match(/[a-zà-ÿ]{4,}/g) || []).map((w) => w.slice(0, 5)));
  for (const a of an) {
    const pw = (a.point.toLowerCase().match(/[a-zà-ÿ]{4,}/g) || []);
    if (pw.length && !pw.some((w) => srcTerms.has(w.slice(0, 5)))) out.push(`"${a.point.slice(0, 40)}" is not a point of the lesson`);
  }
  try { for (const p of learningSpec.analogyProblems([hook, ...an.map((a) => a.text)].join(' '), spec, source.text)) out.push(p.detail); } catch { /* the lexical guard is extra */ }
  const doms = (spec && spec.interests && spec.interests.exampleDomains) || [];
  if (doms.length && spec.interests.share >= 0.3 && !doms.some((d) => learningSpec.mentions(`${hook} ${an.map((a) => a.text).join(' ')}`, d))) out.push('neither the hook nor an analogy uses one of the learner\'s interests');
  const lang = (spec && spec.language) || {};
  if (lang.maxSentenceWords) {
    const worst = all.split(/(?<=[.!?])\s+/).map((s) => words(s).length).reduce((a, b) => Math.max(a, b), 0);
    if (worst > lang.maxSentenceWords + 6) out.push(`a sentence has ${worst} words; keep them to ${lang.maxSentenceWords}`);
  }
  return out;
}

function userPrompt(spec, source, rl, problems, plan) {
  const heads = (plan.blocks || []).map((b) => strings(b.data).find((s) => s.length > 3 && s.length < 90)).filter(Boolean).slice(0, 8);
  return [
    `Lesson topic: ${source.topic || ''}`,
    heads.length ? `Its sections: ${heads.join(' | ')}` : '',
    `Lesson text (do not repeat it, and add nothing to it):\n${source.text.slice(0, 2600)}`,
    `Rules:\n${rl.map((x, i) => `${i + 1}. ${x}`).join('\n')}`,
    problems && problems.length ? `Your last draft had problems; fix them:\n${problems.map((p) => `- ${p}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

/**
 * One draft and, when the check finds problems, one revision, inside the time budget. `call({system, user, schema, ...})` resolves { data, model } or
 * null. Returns { got: { layer, model } | null, problems: [] when got may be shown, first: the problems of the first draft }. Also used by the
 * proof (scripts/lesson-layer-proof.js) with simulated learners.
 */
async function compose({ spec, source, plan, call, t0 = Date.now(), goalClause = null, budgetMs = BUDGET_MS }) {
  const rl = rules(spec, { goalClause });
  const ask = async (problems) => {
    const left = budgetMs - (Date.now() - t0);
    if (left < 2500) return null;
    try {
      const r = await call({ system: SYSTEM, user: userPrompt(spec, source, rl, problems, plan), schema: SCHEMA, schemaName: 'submit', maxTokens: 600, timeoutMs: Math.min(left, 10000), hedgeAfterMs: HEDGE_MS });
      return r && r.data ? { layer: r.data, model: r.model || null } : null;
    } catch { return null; }
  };
  let got = await ask(null);
  let problems = got ? check(spec, got.layer, source) : ['no answer'];
  const first = problems;
  if (problems.length && got) {
    const second = await ask(problems);
    if (second) { const p2 = check(spec, second.layer, source); if (!p2.length) { got = second; problems = []; } else problems = p2; }
  }
  return { got, problems, first };
}

const running = new Set();
const keyOf = (userId, planId) => `${userId}:${planId}`;

function get(userId, planId) {
  const db = lazy('../config/db');
  const row = db.findOne(COLLECTION, (r) => r.user_id === userId && r.plan_id === planId);
  if (!row) return { state: running.has(keyOf(userId, planId)) ? 'pending' : 'none' };
  if (row.status === 'ready') return { state: 'ready', layer: row.layer, ms: row.ms, model: row.model };
  if (row.status === 'writing') return { state: running.has(keyOf(userId, planId)) ? 'pending' : 'none' };
  return { state: 'none', problems: row.problems || [] };
}

/**
 * Background: the layer for this learner over this shared plan. Resolves the stored row (or null). `llm` is injectable for tests:
 * ({system, user, schema, ...}) => Promise<{data, model} | null>.
 */
async function start({ user, plan, topic = '', trackId, gradeId, level, llm = null, spec = null }) {
  if (!user || !plan) return null;
  const key = keyOf(user.id, plan.id);
  if (running.has(key)) return null;
  const db = lazy('../config/db');
  const have = db.findOne(COLLECTION, (r) => r.user_id === user.id && r.plan_id === plan.id);
  if (have && (have.status === 'ready' || have.status === 'failed')) return have;
  running.add(key);
  const t0 = Date.now();
  const row = have || db.insert(COLLECTION, { user_id: user.id, plan_id: plan.id, track_id: trackId || plan.track_id, grade_id: gradeId || plan.grade_id, level: level || plan.level, status: 'writing', created_at: new Date().toISOString() });
  try {
    const sp = spec || learningSpec.buildSpec(user.id, { topic, trackId: trackId || plan.track_id, gradeId: gradeId || plan.grade_id });
    if (!sp || sp.isDefault) { db.update(COLLECTION, row.id, { status: 'failed', problems: ['no profile to write for'], ms: Date.now() - t0 }); return null; }
    const source = sourceOf(plan, topic);
    let goalClause = null;
    try { goalClause = lazy('./part-modify').goalClause(lazy('./retention-goal').forEnrollment(user.id, db.findOne('enrollments', (e) => e.user_id === user.id && e.track_id === (trackId || plan.track_id) && e.grade_id === (gradeId || plan.grade_id)))); } catch { /* no goal */ }
    const call = llm || ((a) => lazy('./pool').runForeground(() => lazy('./ai').structuredDetail({ role: 'fast', task: 'part_layer', ...a, userId: user.id, dataClass: 'learner', effort: 'off' }), { fast: true }));
    const { got, problems, first } = await compose({ spec: sp, source, plan, call, t0, goalClause });
    const ms = Date.now() - t0;
    if (problems.length || !got) { db.update(COLLECTION, row.id, { status: 'failed', problems: problems.slice(0, 6), first_problems: first.slice(0, 6), ms, model: got && got.model }); return null; }
    const clean = {
      why: String(got.layer.why || '').trim(),
      hook: String(got.layer.hook || '').trim(),
      analogies: (got.layer.analogies || []).slice(0, 2).map((a) => ({ point: String(a.point || '').trim(), text: String(a.text || '').trim() })).filter((a) => a.text),
    };
    return db.update(COLLECTION, row.id, { status: 'ready', layer: clean, ms, model: got.model, revised: first.length > 0, finished_at: new Date().toISOString() });
  } catch (err) {
    try { db.update(COLLECTION, row.id, { status: 'failed', problems: [`error: ${String(err && err.message).slice(0, 80)}`], ms: Date.now() - t0 }); } catch { /* nothing */ }
    return null;
  } finally { running.delete(key); }
}

module.exports = { on, sourceOf, rules, check, compose, start, get, SCHEMA, numbersShown, COLLECTION };
