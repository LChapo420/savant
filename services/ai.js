/**
 * The tutor's use of a language model. Nothing above this file knows which
 * vendor answers — services/providers/ handles that.
 *
 * Five roles, each with a strict schema or a tight system prompt, a validator,
 * and a fallback:
 *
 *   generateItems     writes new questions for (skill, difficulty)
 *   gradeFreeResponse judges a translation or short answer the bank cannot
 *   analyzeSession    reads a finished session and says what happened
 *   coachReply        walks a learner toward an answer without handing it over
 *   tutorReply        explains an item the learner has already answered
 *
 * Three rules hold everywhere in here:
 *
 *   1. Every function returns null instead of throwing. An outage, a malformed
 *      response, a rate limit, or an exhausted budget degrades the product to
 *      the deterministic bank; it never breaks a screen.
 *   2. Nothing reaches a learner unvalidated. Generated items pass the same
 *      structural checks the bank's own output passes.
 *   3. Generated items are cached and shared across users, so one authoring
 *      call can serve many learners.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const grading = require('./grading');
const providers = require('./providers');

const DAILY_CENTS = Number(process.env.AI_DAILY_CENTS_PER_USER || 25);
const DAILY_CALLS = Number(process.env.AI_DAILY_CALLS_PER_USER || 120);

/** The closed list of misconception labels. A closed list is what makes error
 *  tags aggregatable across learners; free-text labels would not be. */
const ERROR_TAGS = [
  'sign_error',
  'order_of_operations',
  'careless_arithmetic',
  'conceptual_gap',
  'incomplete_reasoning',
  'misread_prompt',
  'units_or_format',
  'vocabulary_gap',
  'grammar_rule',
  'conjugation_form',
  'agreement_error',
  'pattern_misread',
  'overgeneralization',
  'no_attempt',
];

const FORMATS = ['multiple_choice', 'type_in', 'short_answer'];

function provider(role = 'fast') {
  return providers.current(role);
}

function isEnabled() {
  const p = provider();
  return !!(p && p.isEnabled());
}

function providerName() {
  const p = provider();
  return p && p.isEnabled() ? p.name : null;
}

// ── budget ─────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}

function usageToday(userId) {
  return db.findOne('ai_usage', (u) => u.user_id === userId && u.day === today())
    || { cents: 0, calls: 0 };
}

function spentToday(userId) {
  return usageToday(userId).cents;
}

/**
 * Two ceilings, because two kinds of provider need two kinds of limit: a paid
 * API is bounded by money, a free tier by call count.
 */
function withinBudget(userId) {
  if (!userId) return true;
  const usage = usageToday(userId);
  return usage.cents < DAILY_CENTS && usage.calls < DAILY_CALLS;
}

/**
 * Claude, the last resort, is bounded by the key's TOTAL spend, not by a daily
 * ceiling (owner, 2026-10-23: never more than $25 in total, about $11.20 already
 * spent; stop at $24). services/anthropic-ledger.js holds that total on disk for every
 * process; services/providers/anthropic.js reserves each call there before sending it
 * and settles it at its real cost, and refuses past the stop. This replaces the old
 * AI_ANTHROPIC_DAILY_CENTS app-wide $1/day cap (that variable is no longer read).
 * The per-user ceilings above still apply.
 */
const ledger = require('./anthropic-ledger');
const pool = require('./pool');

/**
 * The model pool (services/pool.js) runs every call of a role through the chain's slots
 * with a hard per-call timeout (default 120 s, per task in config/model-lineup.json
 * "pool.tasks.<task>.timeout_ms") and a hedge: if the first slot has not answered by its
 * p90 (20 to 90 s) the next one starts too, the first valid answer wins and the rest are
 * cancelled. This replaces the old walk down the chain, where one call could wait through
 * four tries per model on four models (about 25 minutes). The preference order is still
 * the chain's. AI_POOL=0 restores the plain walk. Placement (Modelflare alone) is not
 * pooled.
 */
function poolOn(role) {
  return String(process.env.AI_POOL || '1') !== '0' && role !== 'placement';
}

function paidAllowed(p) {
  if (!p || p.name !== 'anthropic') return true;
  return ledger.canSpend(0.01);
}

/**
 * Whether this learner's words may go to a model OUTSIDE this machine (NVIDIA, the
 * free APIs, Jev, Claude). A child whose consent does not cover outside AI
 * (routes/consent.js access().ai_free_text) gets only the local models (Ollama on this
 * laptop) and the deterministic floors. No user (background work, scripts): yes.
 */
function outsideAllowed(userId) {
  // eslint-disable-next-line global-require
  return require('./typed-grading').outsideAllowed(userId);
}

function recordSpend(userId, model, usage, usedProvider) {
  // The provider that actually answered, which is not always the preferred one.
  const p = usedProvider || provider();
  const cents = p && usage ? p.costCents(model, usage) : 0;
  if (!userId) return;
  db.upsert('ai_usage', (u) => u.user_id === userId && u.day === today(), (existing) => ({
    user_id: userId,
    day: today(),
    provider: p ? p.name : null,
    cents: Number(((existing ? existing.cents : 0) + cents).toFixed(4)),
    calls: (existing ? existing.calls || 0 : 0) + 1,
  }));
}

/**
 * Run one call against the preferred provider, and if it fails outright, the
 * next one that can answer. A provider going down mid-request should cost a
 * retry, not the feature — the bank is the floor, not the first fallback.
 *
 * The chain (services/providers/index.js): NVIDIA, then the free fallbacks (local
 * models, Gemini free tier, OpenRouter `:free`), then Claude inside the key ledger.
 */
/**
 * The pooled call. `req` describes the call (kind, system, user | messages, schema, ...).
 * Data class: a call carrying a user id is learner data and may use only the chain's own
 * learner-class slots; a caller with no user and dataClass 'pipeline' (shared base lessons,
 * scripts) may also use the pipeline-class slots config/model-lineup.json lists for the task.
 */
async function viaPool(userId, req, role, task, outside) {
  const trace = {};
  const res = await pool.callHedged(
    { ...req, role, task, userId: userId || null, outside, dataClass: userId ? 'learner' : (req.dataClass || 'learner') },
    { timeoutMs: req.timeoutMs || undefined, validate: (r) => !!r, trace },
  );
  if (!res) {
    console.warn(`ai: no slot gave a valid ${role}${task ? `/${task}` : ''} answer in ${Math.round((trace.elapsedMs || 0) / 1000)}s: ${(trace.attempts || []).map((a) => `${a.slot} ${a.kind}`).join(', ') || 'no slot available'}`);
    return null;
  }
  if (res.pool.hedged) {
    console.log(`ai: ${role}${task ? `/${task}` : ''} answered by ${res.pool.slot} after ${Math.round(res.pool.elapsedMs / 1000)}s (${res.pool.attempts.length} attempt${res.pool.attempts.length === 1 ? '' : 's'})`);
  }
  recordSpend(userId, res.model, res.usage, providers.ALL[res.pool.provider]);
  return res;
}

async function withProviders(userId, attempt, role = 'fast', task = null, req = null) {
  if (!withinBudget(userId)) return null;
  const outside = outsideAllowed(userId);
  if (req && poolOn(role)) return viaPool(userId, req, role, task, outside);
  // The whole chain for this role, not just the preferred provider. A failure
  // that does not take a provider offline — a 429 from a shared free pool, a
  // dropped connection — used to end the call here, which meant the configured
  // backup never actually caught anything.
  const candidates = providers.chain(role, task).filter((p) => outside || !providers.isOutside(p));
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    if (!paidAllowed(p)) {
      console.warn(`ai: the paid fallback (${p.name}) has no room left in the key's total ledger `
        + `(services/anthropic-ledger.js, stop $${ledger.HARD_STOP_USD}); ${role} gets no answer from it`);
      continue;
    }
    try {
      const result = await attempt(p);
      if (!result) return null; // answered, but with nothing usable
      recordSpend(userId, result.model, result.usage, p);
      return result;
    } catch (err) {
      const next = candidates.slice(i + 1).find((c) => c.isEnabled(role, task));
      console.warn(`ai: ${p.describeError ? p.describeError(err) : err.message}`
        + `${next ? ` — ${role} falling back to ${next.name}` : ''}`);
    }
  }
  return null;
}

/**
 * `task` names the call site (config/model-lineup.json "tasks"): it picks the
 * measured NVIDIA model for that work, where the role alone would pick its tier's
 * default. Providers that do not know tasks ignore it.
 */
async function structured({ role = 'fast', task = null, system, user, schema, schemaName, maxTokens, effort, userId, lane, think, dataClass, timeoutMs, pipelineVariant }) {
  const result = await withProviders(userId, (p) =>
    p.structured({ role, task, system, user, schema, schemaName, maxTokens, effort, lane, think }), role, task,
  { kind: 'structured', system, user, schema, schemaName, maxTokens, effort, lane, think, dataClass, timeoutMs, pipelineVariant });
  return result ? result.data : null;
}

/**
 * The same structured call, reporting which model answered and what it cost in
 * tokens. Block levels store both beside every plan, so the admin view can show
 * what each layout and fill-out actually spent.
 *
 * @returns {Promise<{data: object, usage: object|null, model: string}|null>}
 */
async function structuredDetail({ role = 'fast', task = null, system, user, schema, schemaName, maxTokens, effort, userId, lane, think, dataClass, timeoutMs, pipelineVariant }) {
  const result = await withProviders(userId, (p) =>
    p.structured({ role, task, system, user, schema, schemaName, maxTokens, effort, lane, think }), role, task,
  { kind: 'structured', system, user, schema, schemaName, maxTokens, effort, lane, think, dataClass, timeoutMs, pipelineVariant });
  return result ? { data: result.data, usage: result.usage || null, model: result.model || null } : null;
}

/**
 * One plain-text call, guarded and accounted. Returns the text or null.
 *
 * `lane` is passed through to the provider for the calls that must not share the
 * chat queue — a long authoring call in the interactive lane would hold every
 * coach turn behind it for as long as it runs.
 */
async function talk(args) {
  const result = await talkDetail(args);
  return result ? result.text : null;
}

/**
 * The same call, reporting which model actually answered.
 *
 * `talk` above throws that away, which is right for a coach turn and wrong for
 * anything that records which model wrote a document: the provider that answered
 * is not always the preferred one, because the chain falls through when a vendor is
 * down or exhausted. A page attributed to a model that did not write it is a false
 * record, and the per-user level editor stores exactly that attribution beside
 * every page it writes.
 *
 * @returns {Promise<{text: string, model: string}|null>}
 */
async function talkDetail({ role = 'fast', task = null, system, messages, maxTokens, effort, userId, lane, dataClass, timeoutMs, pipelineVariant }) {
  const result = await withProviders(userId, (p) => p.chat({
    role, task, system, messages, maxTokens, effort, lane,
  }), role, task, { kind: 'chat', system, messages, maxTokens, effort, lane, dataClass, timeoutMs, pipelineVariant });
  return result ? { text: result.text, model: result.model } : null;
}

// ── item authoring ─────────────────────────────────────────────────────────
const ITEM_SYSTEM = `You write practice questions for an adaptive tutoring product.

Rules that are never broken:
- The answer must be objectively verifiable and exactly one answer must be correct.
- The rationale explains why the answer is right in two or three sentences, naming the rule or step that decides it. Never say "as shown above" or refer to the numbering.
- Multiple-choice items have exactly four choices. Distractors must be plausible and reflect real mistakes a learner makes, never filler. No "all of the above", no "none of the above".
- Nothing in the prompt may leak the answer, and no choice may be a restatement of another.
- Type-in answers must be a single short string with no alternate spelling needed. Put any acceptable variants in "accepts".
- Difficulty is on a 1-10 scale where 1 is a first lesson and 10 is the hardest material in the subject. Match the requested difficulty exactly.
- Write in plain text. No markdown, no LaTeX. Use x^2 for exponents and / for fractions.
- Every item must be answerable without a picture, a table you did not include, or outside context.`;

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: FORMATS },
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          accepts: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string' },
          hint: { type: 'string' },
        },
        required: ['format', 'prompt', 'choices', 'answer', 'accepts', 'rationale', 'hint'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/** Doubled spaces read as sloppiness in a product that is teaching. Same
 *  normalisation the bank applies on its way out. */
function tidy(text) {
  return String(text == null ? '' : text).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;:?!])/g, '$1').trim();
}

/** The same invariants content/bank.js enforces, applied to model output. */
function validateItem(raw, skillId, difficulty) {
  if (!raw || typeof raw !== 'object') return null;
  const prompt = tidy(raw.prompt);
  const answer = String(raw.answer == null ? '' : raw.answer).trim();
  const rationale = tidy(raw.rationale);
  if (prompt.length < 4 || !answer || rationale.length < 10) return null;
  if (!FORMATS.includes(raw.format)) return null;
  if (/\b(NaN|undefined|null)\b/.test(`${prompt} ${answer}`)) return null;

  const item = {
    skill_id: skillId,
    skill_name: curriculum.skillName(skillId),
    difficulty,
    format: raw.format,
    prompt,
    answer,
    rationale,
    source: 'ai',
  };
  const accepts = (raw.accepts || []).map((a) => String(a).trim()).filter(Boolean);
  // Models write "x = 8" where the bank writes "8". Grading sees past it either
  // way, but the key a learner is compared against should be the bare value, with
  // the written form kept as an accepted alternative rather than thrown away.
  if (item.format !== 'multiple_choice') {
    const bare = grading.stripAssignment(answer.toLowerCase());
    if (bare !== answer.toLowerCase()) {
      accepts.push(answer);
      item.answer = bare;
    }
  }
  if (accepts.length) item.accepts = [...new Set(accepts)].slice(0, 6);
  if (raw.hint) item.hint = String(raw.hint).trim();

  if (raw.format === 'multiple_choice') {
    const choices = [...new Set((raw.choices || []).map((c) => String(c).trim()).filter(Boolean))];
    if (choices.length !== 4) return null;
    if (!choices.includes(answer)) return null;
    // An answer that is also a substring of the prompt is usually a leak.
    if (prompt.toLowerCase().includes(answer.toLowerCase()) && answer.length > 6) return null;
    item.choices = choices;
  }
  return item;
}

function cacheKey(skillId, difficulty) {
  return `${skillId}:${Math.round(difficulty)}`;
}

/** Items this learner has already been served, so the cache does not repeat. */
function seenPrompts(userId, limit = 400) {
  const rows = db.find('items', (i) => i.user_id === userId);
  return new Set(rows.slice(-limit).map((i) => i.prompt));
}

async function authorForKey({ skillId, difficulty, count, userId }) {
  const skill = curriculum.skillName(skillId);
  const payload = await structured({
    role: 'deep',
    task: 'author_items',
    system: ITEM_SYSTEM,
    user: `Write ${count} practice items for the skill "${skill}" (internal id ${skillId}) at difficulty ${Math.round(difficulty)} of 10.

Vary the format across the items you write: use multiple_choice for judgment and recognition, type_in when a single short answer is the honest test, short_answer only when a learner must produce a phrase or sentence. Vary the surface of the questions too, so a learner doing several in a row does not see the same sentence pattern twice.`,
    schema: ITEM_SCHEMA,
    schemaName: 'submit_items',
    maxTokens: 12000,
    effort: 'medium',
    userId,
  });
  if (!payload || !Array.isArray(payload.items)) return [];

  const validated = [];
  for (const raw of payload.items) {
    const item = validateItem(raw, skillId, difficulty);
    if (item) validated.push(item);
  }
  if (validated.length) {
    db.insert('content_cache', {
      key: cacheKey(skillId, difficulty),
      skill_id: skillId,
      difficulty,
      payload: validated,
      uses: 0,
      provider: providerName(),
    });
  }
  return validated;
}

/** Keys currently being authored, so two sessions starting at once do not both
 *  pay for the same batch. */
const authoringNow = new Set();

/** Author in the background and let the cache absorb it. Nobody is waiting. */
function topUpCache({ skillId, difficulty, count, userId }) {
  const key = cacheKey(skillId, difficulty);
  if (authoringNow.has(key)) return;
  authoringNow.add(key);
  authorForKey({ skillId, difficulty, count, userId })
    .catch((err) => console.warn(`ai: background authoring for ${key} failed: ${err.message}`))
    .finally(() => authoringNow.delete(key));
}

/**
 * Items for a session plan, served from the shared cache only.
 *
 * Authoring is deliberately *not* awaited. Writing a batch of questions takes
 * seconds, and making a learner watch "building your session" while it happens
 * is the worst possible place to spend that time — especially when the bank can
 * fill the gap instantly and the model's work will be waiting in the cache for
 * the next session. So: return whatever the cache holds now, and top it up
 * behind the scenes.
 */
function generateItems({ entries, userId }) {
  if (!isEnabled() || !entries || !entries.length) return null;
  if (!withinBudget(userId)) return null;

  const seen = seenPrompts(userId);
  const byKey = {};
  for (const entry of entries) {
    const key = cacheKey(entry.skillId, entry.difficulty);
    (byKey[key] = byKey[key] || { skillId: entry.skillId, difficulty: entry.difficulty, need: 0 }).need++;
  }

  const pool = {};
  for (const [key, group] of Object.entries(byKey)) {
    const cached = db.find('content_cache', (c) => c.key === key)
      .flatMap((c) => {
        db.update('content_cache', c.id, { uses: (c.uses || 0) + 1 });
        return c.payload || [];
      })
      .filter((i) => !seen.has(i.prompt));
    pool[key] = cached;
    if (cached.length < group.need + 2) {
      // Author a surplus so the cache deepens with use rather than staying at
      // exactly what one session needs.
      topUpCache({
        skillId: group.skillId,
        difficulty: group.difficulty,
        count: Math.max(4, group.need - cached.length + 4),
        userId,
      });
    }
  }

  const used = new Set();
  return entries.map((entry) => {
    const key = cacheKey(entry.skillId, entry.difficulty);
    const candidate = (pool[key] || []).find((i) => !used.has(i.prompt));
    if (!candidate) return null;
    used.add(candidate.prompt);
    return { ...candidate, difficulty: entry.difficulty };
  });
}

// ── lessons ────────────────────────────────────────────────────────────────
const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    intro: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          body: { type: 'string' },
          example: { type: 'string' },
        },
        required: ['heading', 'body', 'example'],
        additionalProperties: false,
      },
    },
    worked_example: {
      type: 'object',
      properties: {
        problem: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' } },
        answer: { type: 'string' },
      },
      required: ['problem', 'steps', 'answer'],
      additionalProperties: false,
    },
    common_mistakes: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    check_questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['prompt', 'choices', 'answer', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'intro', 'sections', 'worked_example', 'common_mistakes', 'summary', 'check_questions'],
  additionalProperties: false,
};

/**
 * Turn the learner profile into instructions a writer can actually follow.
 * This is where the style questionnaire and the observed behavior stop being
 * numbers and start changing what the learner reads.
 */
function lessonStyleNotes(params, profile) {
  const notes = [];
  const depth = params.explanationDepth;
  notes.push(depth === 'brief'
    ? 'Keep it tight: two short sections, no more than three sentences each. This learner wants to get to the doing.'
    : depth === 'thorough'
      ? 'Be thorough: three or four sections, and explain the reasoning behind each rule rather than only stating it.'
      : 'Aim for three sections of moderate length.');

  const exampleFirst = learnerEffective(profile, 'example_order') > 0.55;
  notes.push(exampleFirst
    ? 'Lead each section with a concrete example and let the rule emerge from it.'
    : 'State the rule first, then show it working on an example.');

  if (learnerEffective(profile, 'visual_support') > 0.6) {
    notes.push('Use a small plain-text table or a step list where it makes a comparison clearer.');
  }
  if (params.nameTheError) {
    // Was: "name the wrong move and what it produces". Writers then computed what the
    // wrong move produces, and got it wrong in 31 stored lessons (2026-10-23 audit):
    // "adding 7 to both sides of x + 7 = 12 gives x = 19". Now the wrong work is quoted
    // as a learner writes it, labelled, and the correct step is shown beside it.
    notes.push('Make common_mistakes specific: quote the wrong work exactly as a learner writes it, say which step is wrong, and show the correct step. Not "be careful".');
  }
  if (params.verbalize) {
    notes.push('Make one check question ask the learner to explain in their own words why a step works.');
  }
  notes.push(params.preferTypeIn
    ? 'Most check questions should require typing an answer rather than picking one.'
    : 'Mix multiple choice and typed answers across the check questions.');
  return notes.map((n) => `- ${n}`).join('\n');
}

// learner.js imports ai.js indirectly through sessions, so the profile helper is
// reached lazily to keep the module graph acyclic.
function learnerEffective(profile, dim) {
  // eslint-disable-next-line global-require
  return require('./learner').effective(profile, dim);
}

function learnerBrief(userId, context) {
  // eslint-disable-next-line global-require
  return require('./learner').teachingBrief(userId, context);
}

/**
 * Write the lesson for one level, for one learner.
 *
 * Lessons are the one place the product teaches rather than tests, so this is
 * the most profile-sensitive thing the model does: same level, same skill, two
 * learners, two different pages.
 */
async function generateLesson({ skillId, difficulty, level, trackName, gradeName, topic, topicPosition, topicBefore, topicAfter, profile, params, taught, urgent, userId, extraLines = [] }) {
  const skill = curriculum.skillName(skillId);
  // The topic is the lesson. A skill spans tens of levels and the same skill is
  // the focus on many of them, so writing to the skill alone is what produced
  // ten near-identical lessons on one rule. The syllabus says which part of the
  // skill this level is on, and the writer is held to it.
  //
  // The neighbours matter as much as the topic: a writer that knows the lesson
  // before this one and the one after cannot write this one as if it were the
  // only one there is, which is what makes a set of lessons read as a sequence
  // rather than a pile.
  const what = topic
    ? `The topic for this level is: "${topic}"`
      + (topicPosition ? ` (${topicPosition} in this skill's sequence)` : '') + '.\n'
      + (topicBefore ? `The lesson before it covered: ${topicBefore}.\n` : '')
      + (topicAfter ? `The lesson after it covers: ${topicAfter}.\n` : '')
      + `Teach this topic. Do not teach the whole skill, and do not substitute a neighbouring topic.\n`
    : `Teach "${skill}" as it applies at this level.\n`;
  // Consecutive lesson levels often share a focus skill, so without this the
  // writer cheerfully teaches the same first lesson again ten levels later.
  const already = (taught || []).length
    ? `\nLessons this learner has already worked through on this track, earliest first:\n${
      taught.map((t) => `- level ${t.level}: ${t.title} — ${t.summary}`).join('\n')
    }\nDo not teach any of those again. Take the next step beyond them: a harder case, a form the earlier lessons did not cover, or the idea they lead into. If the skill is the same, the material must not be.\n`
    : '';
  const payload = await structured({
    // Prefetched lessons get the deep model. A lesson somebody is waiting on
    // right now gets the fast one: a written lesson in seconds beats a better
    // one that arrives after they have given up looking at the spinner.
    role: urgent ? 'fast' : 'deep',
    task: urgent ? 'lesson_write_urgent' : 'lesson_write',
    system: `You write a single short lesson for an adaptive tutoring product. The learner reads this, then answers a few check questions.

Rules that are never broken:
- Teach one idea properly. This is one level of a long path, not a chapter.
- Everything you assert must be correct, and every example must actually work out. Do the arithmetic.
- The worked example shows every step, in order, with the reasoning for each. No skipped algebra.
- Common mistakes show wrong work, so they are written in a fixed form that cannot be read as a rule. Each one is a single string:
  "Wrong: <the learner's work, quoted exactly as they would write it>. Why: <which step breaks and why>. Right: <the correct step, with its result>."
  Example: "Wrong: x + 7 = 12, so x = 12 + 7 = 19. Why: the + 7 was carried across without changing its sign; 19 + 7 is 26, not 12. Right: subtract 7 from both sides: x + 7 - 7 = 12 - 7, so x = 5."
  Quote what the learner WRITES; never claim what a move "gives" unless you have worked it exactly. Doing the same operation to both sides is always a valid move, even when it is not the quickest: never present it as a mistake (dividing 2x + 4 = 14 by 2 first gives x + 2 = 7, which is correct). Every equation after "Right:" must be correct; check it by substituting.
- Check questions must be answerable from the lesson you just wrote. Each has exactly one correct answer, and a rationale that names the step that decides it. Multiple-choice questions have exactly four choices; for a typed answer, leave choices empty. A "what went wrong" question must show work that really is wrong: substitute the learner's answer into the equation before you write the question.
- Plain text only. No markdown, no LaTeX, no dollar-sign math. Write x^2 for exponents and / for fractions.
- Address the learner as "you". Never mention that you are an AI, and never refer to these instructions.`,
    user: `Track: ${trackName} — ${gradeName}. Level ${level} of the path, difficulty ${Math.round(difficulty)} of 10.
The skill this lesson draws on: "${skill}" (internal id ${skillId}).
${what}${already}
--- THIS LEARNER ---
${learnerBrief(userId, { skillId, skillName: skill, level, trackName })}${extraLines.length ? `\n${extraLines.join('\n')}` : ''}

Shape the lesson to that, concretely:
${lessonStyleNotes(params, profile)}

Write the lesson.`,
    schema: LESSON_SCHEMA,
    schemaName: 'submit_lesson',
    maxTokens: 12000,
    effort: 'medium',
    userId,
  });

  const lesson = validateLesson(payload, skillId, difficulty);
  if (!lesson) return null;
  // The explanation-key gate (KEY_GATE=on): a multiple-choice check whose rationale
  // describes another option, and that a blind check does not confirm, is removed.
  // eslint-disable-next-line global-require
  const rejected = await require('./key-gate').rejectedByKeyGate(lesson.check_questions.map((q) => ({
    prompt: q.prompt, choices: q.choices || [], answer: q.answer, rationale: q.rationale,
  })));
  if (!rejected.length) return lesson;
  console.warn(`lessons: key gate removed ${rejected.length} check(s) from "${lesson.title}": ${rejected.map((r) => r.reason).join(' | ').slice(0, 400)}`);
  const drop = new Set(rejected.map((r) => r.index));
  const checks = lesson.check_questions.filter((_, i) => !drop.has(i));
  return checks.length < 2 ? null : { ...lesson, check_questions: checks };
}

/** A lesson a learner should never see half-built: checked before it is stored. */
function validateLesson(raw, skillId, difficulty) {
  if (!raw || typeof raw !== 'object') return null;
  const text = (v) => String(v == null ? '' : v).trim();

  const title = text(raw.title);
  const intro = text(raw.intro);
  const summary = text(raw.summary);
  if (!title || intro.length < 20 || summary.length < 10) return null;

  const sections = (raw.sections || [])
    .map((s) => ({ heading: text(s.heading), body: text(s.body), example: text(s.example) }))
    .filter((s) => s.heading && s.body.length > 20)
    .slice(0, 5);
  if (!sections.length) return null;

  const we = raw.worked_example || {};
  const worked = {
    problem: text(we.problem),
    steps: (we.steps || []).map(text).filter(Boolean).slice(0, 10),
    answer: text(we.answer),
  };
  const workedOk = worked.problem && worked.steps.length >= 2 && worked.answer;

  const checks = [];
  for (const q of raw.check_questions || []) {
    const prompt = text(q.prompt);
    const answer = text(q.answer);
    const rationale = text(q.rationale) || 'Check it against the rule from the lesson.';
    if (!prompt || !answer) continue;
    const choices = [...new Set((q.choices || []).map(text).filter(Boolean))];
    const item = {
      skill_id: skillId,
      skill_name: curriculum.skillName(skillId),
      difficulty,
      prompt,
      answer,
      rationale,
      source: 'ai',
      role: 'check',
    };
    if (choices.length === 4 && choices.includes(answer)) {
      item.format = 'multiple_choice';
      item.choices = choices;
    } else if (choices.length && !choices.includes(answer)) {
      continue; // a multiple-choice question whose answer is not on the list
    } else {
      item.format = 'type_in';
    }
    checks.push(item);
    if (checks.length === 4) break;
  }
  if (checks.length < 2) return null;

  const lesson = {
    title,
    intro,
    sections,
    worked_example: workedOk ? worked : null,
    common_mistakes: (raw.common_mistakes || []).map(text).filter(Boolean).slice(0, 4),
    summary,
    check_questions: checks,
    source: 'ai',
  };
  return checkLessonMath(lesson);
}

/**
 * Reject-only gate (2026-10-23 content fact audit): algebra and arithmetic the
 * lesson states are worked again by services/math-claims.js. A common mistake or a
 * check question that states a false result is removed; a false claim in the
 * teaching itself (sections, worked example, summary) rejects the lesson, and the
 * caller serves the bank's lesson instead. Nothing is rewritten here. Measured on
 * the 125 stored lessons: 22 flags, all real errors (17 the audit confirmed, its
 * mis-keyed check question, 4 more of the same kind), none on the 95 lessons the
 * audit found clean; none on 4,101 stored items or 11,750 generated bank items.
 */
function checkLessonMath(lesson) {
  // eslint-disable-next-line global-require
  const mathClaims = require('./math-claims');
  let problems = [];
  // With the labelled prompt (above), a common mistake that does not show "Wrong:" and
  // "Right:" is removed like a false one: unlabelled wrong work reads as a rule.
  try { problems = mathClaims.lessonProblems(lesson, { requireLabels: true }); } catch { problems = []; }
  if (!problems.length) return lesson;
  const fatal = problems.filter((p) => !['mistake', 'check'].includes(p.where));
  console.warn(`lessons: math check found ${problems.length} false claim(s) in "${lesson.title}": ${problems.map((p) => `${p.where}[${p.index}] ${p.problem}`).join(' | ').slice(0, 600)}`);
  if (fatal.length) return null;
  const badMistakes = new Set(problems.filter((p) => p.where === 'mistake').map((p) => p.index));
  const badChecks = new Set(problems.filter((p) => p.where === 'check').map((p) => p.index));
  const out = {
    ...lesson,
    common_mistakes: lesson.common_mistakes.filter((_, i) => !badMistakes.has(i)),
    check_questions: lesson.check_questions.filter((_, i) => !badChecks.has(i)),
  };
  return out.check_questions.length < 2 ? null : out;
}

// ── free-response grading ──────────────────────────────────────────────────
/**
 * Judge an answer the deterministic comparison could not settle — a translation
 * with a different but valid word order, a short answer phrased another way.
 * Meaning decides it, not spelling; a real error of grammar or fact does not
 * pass just because it is close.
 *
 * Since 2026-10-23 this is the layered grader (services/typed-grading.js): the
 * deterministic checks, then free judges that accept only by consensus, then GLM 5.3
 * at max reasoning on disagreement, then the free fallbacks, Claude last inside the
 * key ledger. It never accepts on one model's word.
 *
 * Returns { correct, error_tag, feedback, status, by } where status is 'accepted',
 * 'rejected', 'unresolved' (closed as not accepted, flagged for review) or 'checking'
 * (not settled within the interactive budget: `settle` is the promise of the final
 * result, which the caller stores when it arrives). Null only when nothing could run.
 */
async function gradeFreeResponse({ item, userAnswer, userId, budgetMs = null }) {
  // eslint-disable-next-line global-require
  const typed = require('./typed-grading');
  const outside = outsideAllowed(userId);
  // Jev first, only where the lineup eval found it beats every free model and the
  // persistent budget allows (services/jev.js); off by default. Never for a learner
  // whose consent does not cover outside AI.
  // eslint-disable-next-line global-require
  const jev = require('./jev');
  if (outside && jev.enabledFor('grade_free_response')) {
    const decided = await jev.gradeTyped({ question: item.prompt, reference: item.answer, accepted: item.accepts || [], learner: userAnswer }).catch(() => null);
    // Jev alone may reject; an acceptance still needs the cascade's consensus.
    if (decided && decided.correct === false) return { correct: false, error_tag: null, feedback: null, by: 'jev', status: 'rejected' };
  }
  const r = await typed.gradeTyped({ item, userAnswer, userId, budgetMs, allowOutside: outside });
  if (!r) return null;
  if (r.status === 'checking') {
    return { correct: null, error_tag: null, feedback: null, by: 'pending', status: 'checking', settle: r.settle };
  }
  return {
    correct: r.correct === true,
    error_tag: r.correct === true ? null : r.error_tag || null,
    feedback: r.feedback || null,
    by: r.by,
    status: r.status,
    votes: r.votes,
  };
}

// ── the written checkpoint ─────────────────────────────────────────────────
/**
 * A topic and the rubric it is marked against.
 *
 * Each criterion names a skill from the level the learner is actually standing
 * on, and carries four descriptors — one per level of the mark. The skill is the
 * load-bearing part: it is what lets a criterion scoring badly become a
 * remediation area with drill questions against it, using machinery that already
 * exists, rather than a piece of prose feedback with nothing behind it.
 *
 * The pool is the whole grade rather than only what has been introduced, because
 * the introduction schedule is coarse: a five-skill grade meets its second skill
 * somewhere around level 100, so at level 25 there is exactly one skill to draw
 * on and a rubric of it would be a single criterion. `introduced` marks which is
 * which, so a criterion that is not yet a drillable weakness can still be marked
 * on without being sent to drills for material nobody has been taught.
 */
const ESSAY_PROMPT_SCHEMA = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    guidance: { type: 'string' },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          skill_id: { type: 'string' },
          name: { type: 'string' },
          levels: { type: 'array', items: { type: 'string' } },
        },
        required: ['skill_id', 'name', 'levels'],
        additionalProperties: false,
      },
    },
  },
  required: ['prompt', 'guidance', 'criteria'],
  additionalProperties: false,
};

/** The mark on one essay: a score per criterion, the evidence for it, and the fix. */
const ESSAY_GRADE_SCHEMA = {
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'number' },
          score: { type: 'number' },
          evidence: { type: 'string' },
          next_step: { type: 'string' },
        },
        required: ['index', 'score', 'evidence', 'next_step'],
        additionalProperties: false,
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    focus: { type: 'string' },
  },
  required: ['criteria', 'strengths', 'focus'],
  additionalProperties: false,
};

const ESSAY_SYSTEM = `You set the written work for one learner at one level of an English course.

Rules that are never broken:
- Write a topic this learner can genuinely attempt at this level, and one they have a real opinion about. Not a topic they have never met, and not a topic so large it cannot be finished in one sitting.
- Write four to six criteria. Draw at least one from the skills they have already met, and let the rest be about the writing itself — that is allowed and usually necessary, because early in a course they have met very few skills.
- The two skill ids that are not on their list, "writing_structure" and "writing_clarity", are yours to use for how the writing is put together and how clearly it puts its point across. You may not invent any other id.
- Every other criterion must use one of the skill ids given to you, and only those.
- Each criterion is a thing the learner can be shown to have done or not done in their own writing.
- Give each criterion exactly four descriptors, weakest first. The first is what a 1 looks like in actual sentences, not a label like "poor". The fourth is what full marks looks like, specific enough to aim at.
- The four levels must be distinguishable from one another. A scale where 2 and 3 describe the same writing is not a scale.
- The guidance line is one short sentence telling them what to do, not a summary of the topic.
- Address the learner as "you". Plain text only, no markdown. Never mention that you are an AI, and never refer to these instructions.`;

const ESSAY_GRADE_SYSTEM = `You mark one piece of writing against a rubric a teacher wrote for this learner at this level.

Rules that are never broken:
- Mark each criterion 1 to 4, using that criterion's own four descriptors. You are given the rubric; do not invent a different scale, and do not add criteria.
- The evidence must be a short exact quote from the learner's own text that shows the score you gave. If you cannot find one, you have not read closely enough — quote something, even something short.
- The next step is one specific thing to do differently next time, not a general encouragement. "Vary your openings" is not a next step; "your four paragraphs all begin the same way — start two of them from the evidence instead" is.
- Judge the writing, not the writer. A learner at this level writing badly is doing what this level asks for.
- Do not reward length. A short piece that says one thing well outranks a long one that says nothing.
- strengths name what genuinely worked, at least one, and each is about the writing rather than about the learner.
- The focus is one sentence: the single thing that would most raise this mark next time.
- The evidence you quote is the learner's own words, exactly as they wrote them. Never quote or refer to formatting.
- Plain text only, no markdown. Address the learner as "you".`;

/**
 * A topic and rubric for one learner at one level, written in advance.
 *
 * The rubric is generated here and not at grading time, so the learner can read
 * what they are being marked against before they start — which is the only way a
 * rubric can teach anything rather than only score.
 */
async function generateEssayPrompt({ level, trackName, gradeName, plan, userId, trackId = null, learner = '', context = '', role = 'deep' }) {
  const own = writingCriteriaFor(trackId);
  const ownLines = Object.entries(own).map(([id, name]) => `- ${id} (${name})`).join('\n');
  // A math written task is marked on the mathematics: reasoning and how it is
  // communicated, not paragraphs and prose style.
  const system = trackId === 'math'
    ? ESSAY_SYSTEM
      .replace('of an English course', 'of a math course. The written work is a short written task: a problem to solve and explain, or a mathematical claim to justify, in their own words and working')
      .replace('"writing_structure" and "writing_clarity", are yours to use for how the writing is put together and how clearly it puts its point across', '"math_reasoning" and "math_communication", are yours to use for how sound and complete the reasoning is and how clearly the working and explanation are communicated')
      .replace('one they have a real opinion about', 'one with a real problem at its heart')
    : ESSAY_SYSTEM;
  const payload = await structured({
    role,
    task: 'essay_prompt',
    system: `${system}
- When a learner profile is given, choose a topic that connects to what they care about where it can, and write the guidance the way they take instructions best. The rubric is the level's, not theirs: never lower it.
- When the level's context lists WHAT WAS TAUGHT, the task must make the learner use it: a topic where those lessons are the tools, and criteria that check them (one per major taught area where the rubric allows), so passing shows they learned what was taught and not only that they can write. Pitch the topic and the descriptors at the GRADE's average age.
- The prompt is written to the learner: never repeat the level's title or its internal description, and never call the work practice or not pass/fail — it is marked against this rubric and passes at 75%.`,
    user: `Course: ${trackName}, ${gradeName}.
Level ${level} of ${plan.pathLength}, difficulty ${plan.difficulty} of 10.

Skills this learner has already met by this level, and no others:
${plan.introduced.map((id) => `- ${id} (${curriculum.skillName(id)})`).join('\n')}

The rest of this course, which they will meet later and which you may also mark on:
${(plan.all || []).filter((id) => !plan.introduced.includes(id)).map((id) => `- ${id} (${curriculum.skillName(id)})`).join('\n') || '- none'}

Plus these two, which are about the ${trackId === 'math' ? 'working and explanation' : 'writing'} rather than any of the above:
${ownLines}
${context ? `\nTHE LEVEL\n${context}\n` : ''}${learner ? `\n${learner}\n` : ''}
Write the topic and the rubric.`,
    schema: ESSAY_PROMPT_SCHEMA,
    schemaName: 'submit_essay_prompt',
    maxTokens: 6000,
    effort: 'medium',
    lane: 'parallel',
    userId,
  });
  if (!payload) return null;
  return validateEssayPrompt(payload, new Set(plan.introduced), level, plan, trackId);
}

/**
 * The two criterion ids that are about the writing rather than a track skill.
 *
 * A rubric drawn only from the level's introduced skills cannot be built early in
 * a course — a five-skill grade has met exactly one of them by level 25 — and a
 * single-criterion rubric is not a rubric. These two are always available, and a
 * criterion on either is marked but never turned into a drill, because there is
 * no bank of drill questions for "is this paragraph in a sensible order".
 */
const MATH_CRITERIA = {
  math_reasoning: 'Reasoning and justification',
  math_communication: 'Clear mathematical communication',
};

/** The two criteria about the work itself, for a track: math marks the mathematics. */
function writingCriteriaFor(trackId) {
  return trackId === 'math' ? MATH_CRITERIA : WRITING_CRITERIA;
}

const WRITING_CRITERIA = {
  writing_structure: 'Structure and shape',
  writing_clarity: 'Clarity of expression',
};

/**
 * Check a rubric is usable before a learner is ever asked to write against it.
 *
 * Criteria naming an unknown id are dropped rather than repaired: a rubric
 * criterion is a promise that a weak mark on it leads somewhere, and one naming
 * something outside the pool cannot keep that. Fewer than three surviving is not
 * a rubric, so the whole thing is refused and the deterministic fallback is used
 * instead — the same call `normalizeDiagnosis` makes.
 */
/** A value a model may have sent as a JSON string inside a tool call. */
function parsedIfString(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

function validateEssayPrompt(raw, known, level, plan, trackId = null) {
  const own = writingCriteriaFor(trackId);
  if (raw && typeof raw === 'object') {
    raw = { ...raw, criteria: parsedIfString(raw.criteria) };
    if (Array.isArray(raw.criteria)) raw.criteria = raw.criteria.map((c) => (c && typeof c === 'object' ? { ...c, levels: parsedIfString(c.levels) } : c));
  }
  if (!raw || typeof raw !== 'object') return null;
  const text = (v) => String(v == null ? '' : v).trim();
  const prompt = text(raw.prompt);
  if (prompt.length < 20) return null;
  // Everything drawable: the skills met so far, everything the grade covers, and
  // the two writing criteria.
  const pool = new Set([...(plan && plan.all || []), ...known, ...Object.keys(own)]);

  const criteria = [];
  const used = new Set();
  for (const entry of raw.criteria || []) {
    const skillId = text(entry.skill_id);
    if (!pool.has(skillId) || used.has(skillId)) continue;
    const levels = (entry.levels || []).map(text).filter(Boolean);
    if (levels.length !== 4) continue;
    used.add(skillId);
    criteria.push({
      skill_id: skillId,
      skill_name: own[skillId] || curriculum.skillName(skillId),
      name: text(entry.name) || own[skillId] || curriculum.skillName(skillId),
      // Whether a weak mark here can be drilled. The ones that cannot are still
      // marked and still shown — they just do not become a practice area.
      introduced: known.has(skillId),
      levels,
    });
    if (criteria.length === 6) break;
  }
  if (criteria.length < 3) return null;

  return {
    level,
    prompt,
    guidance: text(raw.guidance),
    criteria,
    source: 'ai',
  };
}

/**
 * Mark one attempt against the rubric it was written for.
 *
 * The overall is recomputed here from the per-criterion scores rather than taken
 * from the model, because it decides whether a learner passes a checkpoint and
 * one number in a response body is not worth trusting for that when the twelve
 * numbers it is derived from are right there. A model that reports 0.8 while
 * scoring 3,3,2,4 is describing a different essay, and the criterion breakdown
 * is the one the learner can act on.
 */
async function gradeEssay({ essay, text: submitted, userId }) {
  const rubric = (essay.criteria || []).map((c, i) =>
    `Criterion ${i + 1} — ${c.name} (${c.skill_id})
  1: ${c.levels[0]}
  2: ${c.levels[1]}
  3: ${c.levels[2]}
  4: ${c.levels[3]}`).join('\n\n');

  // The mark decides a checkpoint, so it is read by the deep model (MiMo pro)
  // rather than the chat lane.
  const payload = await structured({
    role: 'deep',
    task: 'essay_grade',
    system: `${ESSAY_GRADE_SYSTEM}\n\n--- THE RUBRIC ---\n${rubric}`,
    user: `--- WHAT THEY WERE ASKED ---\n${essay.prompt}${essay.guidance ? `\n${essay.guidance}` : ''}

--- WHAT THEY WROTE ---
${String(submitted || '').trim()}`,
    schema: ESSAY_GRADE_SCHEMA,
    schemaName: 'submit_essay_grade',
    maxTokens: 5000,
    effort: 'low',
    userId,
  });
  if (!payload) return null;
  return validateEssayGrade(payload, (essay.criteria || []).length);
}

/** The mark, rebuilt from the criteria. `null` when nothing usable came back. */
function validateEssayGrade(raw, criterionCount) {
  if (!raw || typeof raw !== 'object' || !criterionCount) return null;
  const text = (v) => String(v == null ? '' : v).trim();

  const byIndex = new Map();
  for (const entry of raw.criteria || []) {
    const index = Number(entry.index);
    if (!Number.isInteger(index) || index < 0 || index >= criterionCount) continue;
    // A 1-to-4 mark is the whole contract. Anything else is a model that has
    // drifted, and rounding it into range would be inventing a mark.
    const score = Math.round(Number(entry.score));
    if (!Number.isInteger(score) || score < 1 || score > 4) continue;
    if (byIndex.has(index)) continue;
    byIndex.set(index, {
      index,
      score,
      evidence: text(entry.evidence),
      next_step: text(entry.next_step),
    });
  }
  if (byIndex.size < 2) return null;

  const criteria = [...byIndex.values()].sort((a, b) => a.index - b.index);
  const total = criteria.reduce((sum, c) => sum + c.score, 0);
  return {
    criteria,
    // Over the criteria that were actually marked, so a rubric that lost a
    // criterion to validation is not marked against a level it never covered.
    overall: total / (criteria.length * 4),
    strengths: (raw.strengths || []).map(text).filter(Boolean).slice(0, 4),
    focus: text(raw.focus),
    source: 'ai',
  };
}

// ── session analysis ───────────────────────────────────────────────────────
const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    learned: { type: 'array', items: { type: 'string' } },
    fragile: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    traits: { type: 'array', items: { type: 'string' } },
    observed_signals: {
      type: 'object',
      properties: {
        challenge_appetite: { type: 'number' },
        practice_density: { type: 'number' },
        retrieval_style: { type: 'number' },
        explanation_depth: { type: 'number' },
        error_focus: { type: 'number' },
      },
      required: [],
      additionalProperties: false,
    },
    retention_questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          answer: { type: 'string' },
          skill_id: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['prompt', 'answer', 'skill_id', 'why'],
        additionalProperties: false,
      },
    },
    next_session: {
      type: 'object',
      properties: {
        difficulty_delta: { type: 'number' },
        review_skills: { type: 'array', items: { type: 'string' } },
        note: { type: 'string' },
      },
      required: ['difficulty_delta', 'review_skills', 'note'],
      additionalProperties: false,
    },
  },
  required: ['summary', 'learned', 'fragile', 'gaps', 'traits', 'observed_signals', 'retention_questions', 'next_session'],
  additionalProperties: false,
};

/**
 * The transcript sent to the analyst. A long sitting can run to forty items,
 * and every one of them costs input tokens and reasoning time on a model that
 * is already the slowest call in the app. The most informative items are the
 * ones that went wrong and the ones at the edges of the difficulty range, so a
 * long session is sampled rather than sent whole.
 */
const ANALYSIS_ITEM_CAP = 24;

function sampleForAnalysis(items) {
  if (items.length <= ANALYSIS_ITEM_CAP) return items;
  const missed = items.filter((i) => !i.correct);
  const correct = items.filter((i) => i.correct);
  const keep = new Set(missed.slice(0, ANALYSIS_ITEM_CAP));
  // Fill the remainder with correct answers spread across the session, so the
  // analyst still sees the arc rather than only the failures.
  const room = ANALYSIS_ITEM_CAP - keep.size;
  if (room > 0 && correct.length) {
    const step = Math.max(1, Math.floor(correct.length / room));
    for (let i = 0; i < correct.length && keep.size < ANALYSIS_ITEM_CAP; i += step) keep.add(correct[i]);
  }
  return items.filter((i) => keep.has(i));
}

function transcriptOf(items) {
  return items.map((i, n) => [
    `${n + 1}. [level ${i.level || '?'} | ${i.skill_name} | difficulty ${i.difficulty} | ${i.role}${i.coach_used ? ' | used the coach' : ''}]`,
    `   Q: ${String(i.prompt).replace(/\n/g, ' ').slice(0, 300)}`,
    `   learner answered: ${i.user_answer} (${i.correct ? 'correct' : 'wrong'}, ${Math.round((i.ms || 0) / 1000)}s)`,
    i.correct ? '' : `   correct answer: ${i.answer}`,
  ].filter(Boolean).join('\n')).join('\n');
}

/**
 * Read a finished session and say what happened.
 *
 * A session can span several levels, so the analysis is explicitly told the
 * range it is covering and asked to write retention questions across the whole
 * arc rather than only the last thing touched. That is the difference between
 * "you did level 130" and "here is what this hour was about".
 */
async function analyzeSession({ items, profile, session, levels, userId }) {
  if (!isEnabled() || !items || items.length < 3) return null;
  const span = levels && levels.length ? levels : [session.level];
  const range = span.length > 1 ? `levels ${span[0]} through ${span[span.length - 1]}` : `level ${span[0]}`;

  const payload = await structured({
    role: 'deep',
    task: 'analyze_session',
    system: `You analyze one study session for an adaptive tutor and write the learner-facing summary.

What matters:
- Be specific to this session. Name the actual skills and the actual pattern in the errors. Never write generic encouragement.
- The session may cover several levels. Cover the whole span, not only the last level, and say how the earlier part of the session held up by the end.
- Separate what is solid from what is fragile from what is missing. Fragile means right sometimes, or right but slow, or right only with the coach.
- Retention questions must span the whole session, target what wobbled, be answerable from what the session covered, and have one short verifiable answer. Two or three of them.
- observed_signals: only include a dimension when this session is real evidence for it. Values are 0 to 1. challenge_appetite high means harder material helped. practice_density high means many short items suited them. retrieval_style high means producing answers cold worked better than recognizing them. explanation_depth high means they needed fuller explanation. error_focus high means naming the specific mistake helped more than reteaching.
- difficulty_delta is between -1 and 1, in difficulty bands.
- Address the learner as "you". Plain text, no markdown.`,
    user: `Track: ${session.track_id} / ${session.grade_id}, covering ${range}, session type ${session.kind}.

--- WHAT IS ALREADY KNOWN ABOUT THIS LEARNER ---
${learnerBrief(userId, { level: session.level })}
Raw profile vector, for comparison against what this session shows: ${JSON.stringify({ style: profile.style_vector, observed: profile.observed })}

Two jobs, and the second one matters as much as the first:
1. Tell this learner what happened in their session.
2. Update what we know about HOW they learn. Where this session contradicts the profile above, say so through observed_signals and traits — that is how the tutor gets better at teaching this person. Write traits as short, specific, useful instructions to a future tutor ("needs the rule before the example", "goes faster when questions are typed"), never as praise.

The retention questions are not generic revision: pitch them in the format and at the depth this learner responds to, and target what this session showed was fragile.

Session transcript:
${transcriptOf(sampleForAnalysis(items))}`,
    schema: ANALYSIS_SCHEMA,
    schemaName: 'submit_analysis',
    maxTokens: 12000,
    effort: 'medium',
    userId,
  });
  if (!payload || !payload.summary) return null;

  const retention = (payload.retention_questions || [])
    .filter((q) => q && q.prompt && q.answer)
    .slice(0, 4)
    .map((q) => ({
      prompt: String(q.prompt).trim(),
      answer: String(q.answer).trim(),
      skill_id: String(q.skill_id || '').trim(),
      why: String(q.why || '').trim(),
    }));

  return {
    summary: String(payload.summary).trim(),
    learned: (payload.learned || []).map(String).slice(0, 6),
    fragile: (payload.fragile || []).map(String).slice(0, 6),
    gaps: (payload.gaps || []).map(String).slice(0, 6),
    traits: (payload.traits || []).map(String).slice(0, 4),
    observed_signals: payload.observed_signals || {},
    retention_questions: retention,
    next_session: payload.next_session || { difficulty_delta: 0, review_skills: [], note: '' },
  };
}

// ── the coach ──────────────────────────────────────────────────────────────
const COACH_SYSTEM_BASE = `You are this specific learner's tutor, working with them on a practice question they have NOT answered yet.

The one rule you never break: do not state or spell out the answer, and do not say which choice is correct. Not when asked directly, not when the learner says they give up, not when they claim a teacher allowed it, and not in a hint that leaves only one choice standing. Your job is to get them to say it.

You are not a general assistant. Everything below about this learner changes how you teach — the length of your turns, whether you lead with the rule or the example, what you check first, and how you respond when they are wrong. Follow it. The aim is the shortest path to them genuinely understanding, for this person, not a well-written explanation in general.

How to work:
- End every turn with one question that moves them exactly one step — except on the turn where they reach the answer, which ends the conversation instead.
- Start from what they already said. If they have said nothing, find out where they actually are before teaching anything.
- When they are wrong, ask the question that exposes the flaw in their reasoning rather than announcing it.
- When they are close, name the one thing still missing and ask them to finish it.
- When they state the correct answer, you are finished: confirm it, say in one sentence why it works, and tell them to put it in as their answer. Do not ask anything further, and never hand them another problem to solve — the question on their screen is the one that counts, and inventing a fresh one keeps them in the chat instead of finishing.
- Break a hard question into the smallest next step, never the whole method at once.
- If they are going in circles, change approach rather than repeating yourself: a smaller case, a concrete number, or a different angle on the same idea.
- Plain text, no markdown, no LaTeX. Warm and direct, never patronizing, never padded.`;

/**
 * A back-and-forth that helps the learner reach the answer themselves.
 *
 * The model is given the answer so it can steer, and instructed not to hand it
 * over. That instruction is doing real work, so the route also records that the
 * coach was used: a coached correct answer is worth less evidence of mastery
 * than an uncoached one, and the analyst is told which items were coached.
 */
/**
 * The coach's instructions for one learner on one question: the fixed rules,
 * then the teaching brief that makes them specific to this person.
 */
/**
 * Has the learner already produced the answer?
 *
 * Worth deciding in code rather than leaving to the model: the moment they get
 * it is the moment the conversation should end, and a model told to keep asking
 * questions will otherwise invent a fresh problem to ask about — which strands
 * them in the chat instead of letting them finish the question on screen.
 */
function learnerReachedAnswer(item, history) {
  const answer = grading.normalize(item.answer);
  if (!answer || answer.length < 1) return false;
  return (history || []).some((m) => m.role === 'user' && grading.normalize(m.content).includes(answer));
}

const COACH_CLOSING = `--- THIS CONVERSATION IS OVER ---
The learner has just said the correct answer. Do exactly this and nothing more:
confirm they are right, give one sentence on why it works, and tell them to
close this and enter it as their answer. Ask no further questions. Do not offer
another problem, a harder version, a check, or more practice — they have the
question on their screen to finish.`;

function coachSystemFor(userId, item, { resolved = false } = {}) {
  const brief = learnerBrief(userId, {
    skillId: item.skill_id,
    skillName: item.skill_name,
    level: item.level,
  });
  return [
    COACH_SYSTEM_BASE,
    `--- THIS QUESTION ---\n${coachQuestionContext(item)}`,
    `--- THIS LEARNER ---\n${brief}`,
    // The same tutor on every question: what it knows about the learner and remembers of
    // earlier conversations (services/tutor.js). It comes after the rules and the question,
    // so the rule above (never state the answer) is the one that governs it.
    tutorContext(userId, item),
    resolved ? COACH_CLOSING : '',
  ].filter(Boolean).join('\n\n');
}

/** The tutor's context pack and memory for a prompt; '' if it cannot be built. */
function tutorContext(userId, item) {
  try {
    // eslint-disable-next-line global-require
    const tutor = require('./tutor');
    return tutor.contextText(userId, { exceptWhere: item ? tutor.whereOfItem(item) : null });
  } catch (err) {
    console.warn(`ai: tutor context failed: ${err.message}`);
    return '';
  }
}

/** Keep a coach or explain exchange in the tutor's memory; never throws. */
function tutorNote(userId, item, history, reply) {
  try {
    // eslint-disable-next-line global-require
    require('./tutor').noteQuestion(userId, item, history, reply);
  } catch (err) {
    console.warn(`ai: tutor memory failed: ${err.message}`);
  }
}

/**
 * The question under discussion, as fixed context.
 *
 * This belongs in the system prompt, not in the conversation. It was previously
 * folded into the first user turn, which meant the coach's own opening question
 * — the first thing in the history — was relabelled as something the learner
 * had said. From there the model could read its own words as the learner posing
 * a new problem, and drift onto a question nobody had asked.
 */
function coachQuestionContext(item) {
  return [
    'THE QUESTION BEING WORKED ON — this one, and only this one:',
    `  ${item.prompt}`,
    item.passage ? `Passage it refers to:\n${item.passage}` : '',
    item.choices ? `Choices shown to the learner: ${item.choices.map((c, i) => `(${i + 1}) ${c}`).join('  ')}` : '',
    `Its correct answer, for your guidance only, never to be stated: ${item.answer}`,
    `The stored explanation, for your guidance only: ${item.rationale}`,
    `Skill: ${item.skill_name || item.skill_id}. Difficulty ${item.difficulty} of 10.`,
    '',
    'Never substitute a different problem. Do not invent new numbers, restate the',
    'question with different values, or move on to another exercise — not to give',
    'an easier example, not to check understanding, not for any reason. If the',
    'learner needs something simpler, ask about a part of THIS question.',
  ].filter(Boolean).join('\n');
}

/**
 * The conversation as the model should see it: the learner's turns as the
 * learner, the coach's turns as the coach.
 *
 * Providers expect an exchange that begins with the learner, but a coaching
 * conversation begins with the coach's opening question. A one-line opener
 * stands in for the click on "help me work it out" that actually started it.
 */
function coachConversation(item, messages) {
  const history = (messages || [])
    .filter((m) => m && m.content)
    .slice(-10)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 800) }));

  if (!history.length) {
    return {
      conversation: [{ role: 'user', content: 'I am stuck on this question and have not said anything yet. Open with one question that gets me started.' }],
      history,
    };
  }

  const conversation = history[0].role === 'assistant'
    ? [{ role: 'user', content: 'I asked for help with this question.' }, ...history]
    : [...history];

  return { conversation, history };
}

/** The line used when a reply would have given the answer away. */
const COACH_REDIRECT = 'Let me put that differently rather than hand it to you. What is the question actually asking you to produce, and which part of it can you already rule out?';

async function coachReply({ item, messages, userId }) {
  const { conversation, history } = coachConversation(item, messages);
  const resolved = learnerReachedAnswer(item, history);

  const reply = await talk({
    role: 'fast',
    task: 'coach_turn',
    system: coachSystemFor(userId, item, { resolved }),
    messages: conversation,
    maxTokens: 500,
    effort: 'low',
    userId,
  });
  if (!reply) return null;
  const guarded = leakGuard(reply, item, history);
  tutorNote(userId, item, history, guarded);
  return guarded;
}

/**
 * The coach, streamed fragment by fragment.
 *
 * Streaming and the leak guard pull against each other: text already on screen
 * cannot be taken back. So the emitter runs a fragment behind — it holds back a
 * tail as long as the answer itself, and checks the whole accumulated reply
 * before releasing anything. If the answer appears, the stream is abandoned and
 * the learner sees the redirect instead. The answer can never finish rendering.
 *
 * Returns { text, replaced } or null when no provider can stream, which is the
 * caller's signal to use the non-streaming path.
 */
async function coachReplyStream({ item, messages, userId, onDelta }) {
  if (!withinBudget(userId)) return null;
  const outside = outsideAllowed(userId);
  const streamers = providers.chain('fast', 'coach_turn').filter((p) => typeof p.chatStream === 'function' && (outside || !providers.isOutside(p)));
  if (!streamers.length) return null;

  const { conversation, history } = coachConversation(item, messages);
  const answer = grading.normalize(item.answer);
  const learnerSaidIt = history.some((m) => m.role === 'user' && grading.normalize(m.content).includes(answer));
  const wouldLeak = (text) => (answer.length >= 2 && !learnerSaidIt && grading.normalize(text).includes(answer))
    || choiceLeak(text, item, history);

  // Long enough to hold back "the second option" until the guard has seen it.
  const hold = Math.max(4, String(item.answer || '').length + 2, keyIndexOf(item) >= 0 && choiceLeakOn() ? 20 : 0);
  let emitted = 0;
  let latest = '';
  let leaked = false;

  // A provider that fails before emitting anything can be replaced by the next
  // one and the learner never knows. Once bytes are on the wire it cannot, so
  // that case gives up and the route retries unstreamed.
  let result = null;
  let used = null;
  for (const p of streamers) {
    if (!paidAllowed(p)) continue;
    try {
      result = await p.chatStream({
        role: 'fast',
        task: 'coach_turn',
        system: coachSystemFor(userId, item, { resolved: learnerSaidIt }),
        messages: conversation,
        maxTokens: 500,
        onDelta: (_fragment, full) => {
          if (leaked) return;
          latest = full;
          if (wouldLeak(full)) { leaked = true; return; }
          const safeEnd = Math.max(0, full.length - hold);
          if (safeEnd > emitted) {
            onDelta(full.slice(emitted, safeEnd));
            emitted = safeEnd;
          }
        },
      });
      used = p;
      break;
    } catch (err) {
      console.warn(`ai: ${p.describeError ? p.describeError(err) : err.message}`);
      if (emitted > 0) return null;
      latest = '';
      leaked = false;
    }
  }

  if (!result) return null;
  recordSpend(userId, result.model, result.usage, used);

  if (leaked || wouldLeak(result.text)) {
    tutorNote(userId, item, history, COACH_REDIRECT);
    return { text: COACH_REDIRECT, replaced: true };
  }
  // Release the tail that was held back for the check.
  if (latest.length > emitted) onDelta(latest.slice(emitted));
  tutorNote(userId, item, history, result.text);
  return { text: result.text, replaced: false };
}

/**
 * The instruction not to give the answer away is doing real work, so it is
 * checked rather than trusted. If the reply contains the answer before the
 * learner has said it themselves, it is replaced with a nudge.
 *
 * Confirming an answer the learner has already produced is the one case where
 * saying it is correct, which is why the learner's own turns are searched too.
 */
function leakGuard(reply, item, history) {
  if (choiceLeak(reply, item, history)) return COACH_REDIRECT;
  const answer = grading.normalize(item.answer);
  if (!answer || answer.length < 2) return reply;

  const learnerSaidIt = history.some((m) => m.role === 'user' && grading.normalize(m.content).includes(answer));
  if (learnerSaidIt) return reply;
  if (!grading.normalize(reply).includes(answer)) return reply;

  return COACH_REDIRECT;
}

/**
 * P10 (evidence article 03, mechanism 43; COACH_LEAK_CHOICE, default on): on a
 * multiple-choice item the key can also be given away by its place: "(2)",
 * "option 2", "choice B", "the second one". The coach shows choices numbered
 * (1)-(4), so only the key's own number, letter and ordinal are checked, which
 * keeps an innocent mention of another option out of it. A learner who named
 * that choice first may have it confirmed, as with the key's text.
 * (bastani2025, baker2004, aleven2016help)
 */
function choiceLeakOn() {
  return String(process.env.COACH_LEAK_CHOICE || 'on').toLowerCase() !== 'off';
}

function keyIndexOf(item) {
  if (!item || !Array.isArray(item.choices) || item.choices.length < 2) return -1;
  const key = grading.normalize(item.answer);
  if (!key) return -1;
  return item.choices.findIndex((c) => grading.normalize(c) === key);
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

function choicePatterns(i, count) {
  const n = String(i + 1);
  const letter = 'ABCDEF'[i];
  const words = '(?:option|choice|answer|one|pick)';
  // "(2)" only as a label (start, or after a space or punctuation), never inside
  // arithmetic such as 3(2); a letter only in capitals after option/choice/answer,
  // so "answer a question" is not read as choice A.
  const pats = [
    new RegExp(`(?:^|[\\s:,;"“'‘])\\(\\s*${n}\\s*\\)`),
    new RegExp(`\\b(?:option|choice|answer)\\s*#?\\s*${n}\\b`, 'i'),
    new RegExp(`(?:^|\\s)#\\s*${n}\\b`),
    new RegExp(`\\b(?:[Oo]ption|[Cc]hoice|[Aa]nswer)\\s*\\(?\\s*${letter}\\b(?!['’])`),
    new RegExp(`(?:^|[\\s:,;"“'‘])\\(\\s*${letter}\\s*\\)`),
  ];
  if (ORDINALS[i]) pats.push(new RegExp(`\\b${ORDINALS[i]}\\s+(?:\\w+\\s+)?${words}\\b`, 'i'));
  if (i === count - 1) pats.push(new RegExp(`\\blast\\s+(?:\\w+\\s+)?${words}\\b`, 'i'));
  return pats;
}

/** Does `reply` name the key's choice by its place, before the learner did? */
function choiceLeak(reply, item, history = []) {
  if (!choiceLeakOn()) return false;
  const i = keyIndexOf(item);
  if (i < 0 || !reply) return false;
  const pats = choicePatterns(i, item.choices.length);
  const text = String(reply);
  if (!pats.some((p) => p.test(text))) return false;
  const bare = new RegExp(`(^|[^\\w.])${i + 1}([^\\w.]|$)`);
  const learnerNamedIt = (history || []).some((m) => m.role === 'user'
    && (pats.some((p) => p.test(String(m.content || ''))) || bare.test(String(m.content || ''))));
  return !learnerNamedIt;
}

/** A learner's question about an item they have already answered. Here the
 *  answer is known to them, so this one explains directly. */
async function tutorReply({ item, question, userId }) {
  const text = await tutorReplyText({ item, question, userId });
  if (text) tutorNote(userId, item, [{ role: 'user', content: question }], text);
  return text;
}

async function tutorReplyText({ item, question, userId }) {
  return talk({
    role: 'fast',
    task: 'tutor_explain',
    system: `You are this specific learner's tutor, answering their question about a practice question they just worked on. The answer is already on their screen, so explaining it is fine here — what they need is the step they were missing.

Answer in at most four sentences, pitched at this learner as described below rather than at a general reader. Teach the step, not the answer. If they ask something unrelated to learning this material, say briefly that you can only help with the lesson. Plain text, no markdown, no LaTeX.

--- THIS LEARNER ---
${learnerBrief(userId, { skillId: item.skill_id, skillName: item.skill_name, level: item.level })}

${tutorContext(userId, item)}`,
    messages: [{
      role: 'user',
      content: `Question they worked on: ${item.prompt}
Correct answer: ${item.answer}
Stored explanation: ${item.rationale}
${item.user_answer ? `Their answer was: ${item.user_answer}` : ''}

Their question: ${question}`,
    }],
    maxTokens: 1024,
    effort: 'low',
    userId,
  });
}

// ── failed checkpoint: regenerating the quiz ───────────────────────────────
/**
 * Remake a checkpoint's questions for a retry: same level, same skills, same
 * difficulties, questions the learner has not seen.
 *
 * This runs on the `regen` route — GLM 5.3 Flash, MiMo flash behind it — because it is bulk authoring
 * against a fixed spec rather than a judgment call, and because the learner is
 * waiting for it. Anything the model does not produce, or produces badly, comes
 * from the bank with the old prompts excluded, so a retry is never blocked on a
 * model being available.
 */
const REGEN_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slot: { type: 'integer' },
          format: { type: 'string', enum: FORMATS },
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          accepts: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string' },
          hint: { type: 'string' },
        },
        required: ['slot', 'format', 'prompt', 'choices', 'answer', 'accepts', 'rationale', 'hint'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/**
 * Slots per call. A Grand Master quiz is 25 questions and asking for all of them
 * in one call took 19 seconds and came back half usable — the model runs out of
 * room and starts cutting corners on the later items. Smaller batches in
 * parallel are both faster and better, and the learner is waiting.
 */
const REGEN_BATCH = 8;

async function regenerateItems({ entries, avoid = [], kindLabel = 'Master quiz', level, userId }) {
  if (!isEnabled() || !entries || !entries.length) return {};

  if (entries.length > REGEN_BATCH) {
    const batches = [];
    for (let at = 0; at < entries.length; at += REGEN_BATCH) {
      const slice = entries.slice(at, at + REGEN_BATCH);
      batches.push(regenerateItems({ entries: slice, avoid, kindLabel, level, userId })
        // Slot numbers are per call, so shift them back to the real positions.
        .then((map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [Number(k) + at, v])))
        .catch(() => ({})));
    }
    const maps = await Promise.all(batches);
    return Object.assign({}, ...maps);
  }

  const spec = entries.map((e, i) => `slot ${i}: skill "${curriculum.skillName(e.skillId)}" `
    + `(id ${e.skillId}) at difficulty ${Math.round(e.difficulty)} of 10`).join('\n');
  // Enough to stop the model rewriting the same questions, not so much that the
  // prompt is mostly old questions.
  const seen = avoid.slice(-40).map((p) => `- ${String(p).slice(0, 160)}`).join('\n');

  const payload = await structured({
    role: 'regen',
    task: 'regen_items',
    system: `${ITEM_SYSTEM}

You are rewriting a ${kindLabel} that a learner did not pass, so they can take it again. The retry must test the same thing at the same difficulty and must not reuse a question they have already seen — a learner who failed and then recognises the questions has not been retested, they have been given the answers.`,
    user: `Write one item for each slot below. Return them with their slot numbers.

${spec}

Level ${level || ''} of the path. Questions the learner has already been asked — do not reuse them, and do not simply change the numbers in them:
${seen || '(none recorded)'}`,
    schema: REGEN_SCHEMA,
    schemaName: 'submit_items',
    maxTokens: 12000,
    effort: 'low',
    userId,
  });
  if (!payload || !Array.isArray(payload.items)) return {};

  const seenPrompts = new Set(avoid.map((p) => String(p).trim().toLowerCase()));
  const bySlot = {};
  for (const raw of payload.items) {
    const slot = Number(raw.slot);
    const entry = entries[slot];
    if (!entry || bySlot[slot]) continue;
    const item = validateItem(raw, entry.skillId, entry.difficulty);
    if (!item) continue;
    if (seenPrompts.has(item.prompt.trim().toLowerCase())) continue;
    seenPrompts.add(item.prompt.trim().toLowerCase());
    bySlot[slot] = item;
  }
  return bySlot;
}

// ── failed checkpoint: help me learn ───────────────────────────────────────
/**
 * Read a failed checkpoint and say what actually went wrong, per weak area.
 *
 * This is the `deep` route — MiMo pro — because it is the same kind of work as
 * reading a session for a learner's style: the value is in the diagnosis, and
 * getting it wrong sends someone to practise the wrong thing. The rule-based
 * version below is the fallback and the shape both paths return.
 */
const REMEDIATION_SCHEMA = {
  type: 'object',
  properties: {
    areas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          skill_id: { type: 'string' },
          headline: { type: 'string' },
          diagnosis: { type: 'string' },
          misconception: { type: 'string' },
          teach: {
            type: 'object',
            properties: {
              explanation: { type: 'string' },
              steps: { type: 'array', items: { type: 'string' } },
              worked_problem: { type: 'string' },
              worked_answer: { type: 'string' },
              watch_for: { type: 'string' },
            },
            required: ['explanation', 'steps', 'worked_problem', 'worked_answer', 'watch_for'],
            additionalProperties: false,
          },
          opener: { type: 'string' },
        },
        required: ['skill_id', 'headline', 'diagnosis', 'misconception', 'teach', 'opener'],
        additionalProperties: false,
      },
    },
  },
  required: ['areas'],
  additionalProperties: false,
};

/**
 * The worst weak area only, answered fast.
 *
 * Splitting the first area out of the full diagnosis is what makes the help page
 * open on finished content. Asking MiMo pro about every weak area with thinking on
 * takes seventy to ninety seconds; asking it about one area with thinking off
 * takes about sixteen. The first area is the one the learner lands on, so it gets
 * the fast call and the rest follow in the background.
 *
 * Still the pro model, and still pinned to MiMo — the difference is the size of
 * the question, not the quality of the answer.
 */
async function diagnoseArea({ kindLabel, level, accuracy, required, area, userId }) {
  if (!isEnabled() || !area) return null;
  const misses = area.missed.slice(0, 6).map((m) => `  - asked: ${m.prompt}\n    they answered: `
    + `${m.user_answer || '(blank)'}\n    correct: ${m.answer}`).join('\n');

  const payload = await structured({
    role: 'diagnose',
    task: 'diagnose',
    system: `You are this learner's tutor. They are failing a ${kindLabel} and have chosen to work on what they got wrong before retaking it.

Work out what actually went wrong in the skill below — the specific misunderstanding behind those wrong answers, not a restatement of the topic — and write the short teaching that fixes it.

- Diagnose from their actual answers. A wrong answer usually has its reason visible in it; name that reason.
- "teach" is what you would say at a whiteboard: the idea, the steps in order, one fully worked problem of the same kind, and the trap that caught them.
- "opener" starts the conversation: one question that checks whether they have the idea.
- Plain text, no markdown, no LaTeX. Be brief and concrete.

--- THIS LEARNER ---
${learnerBrief(userId, { skillId: area.skill_id, skillName: area.skill_name, level })}`,
    user: `${kindLabel} at level ${level}, scoring about ${Math.round(accuracy * 100)}% against ${Math.round(required * 100)}%.

Skill "${area.skill_name}" (id ${area.skill_id}) — ${area.correct} of ${area.asked} right.
${misses}`,
    // The same shape as one entry of the full diagnosis, minus skill_id: there is
    // only one skill in play and the caller already knows which. Asking the model
    // for it invites it to answer with the skill's name and fail validation.
    schema: (() => {
      const { skill_id: _ignored, ...properties } = REMEDIATION_SCHEMA.properties.areas.items.properties;
      return {
        type: 'object',
        properties,
        required: REMEDIATION_SCHEMA.properties.areas.items.required.filter((k) => k !== 'skill_id'),
        additionalProperties: false,
      };
    })(),
    schemaName: 'submit_diagnosis',
    maxTokens: 5000,
    // Latency is the whole point of this call.
    think: false,
    lane: 'parallel',
    userId,
  });
  if (!payload) return null;
  return normalizeDiagnosis([{ ...payload, skill_id: area.skill_id }], new Set([area.skill_id]))[0] || null;
}

/** Validate and tidy what the model returned. Shared by both diagnosis calls. */
function normalizeDiagnosis(raw, known) {
  const text = (v) => String(v == null ? '' : v).trim();
  const out = [];
  for (const entry of raw) {
    if (!known.has(entry.skill_id)) continue;
    const teach = entry.teach || {};
    const steps = (teach.steps || []).map(text).filter(Boolean).slice(0, 8);
    if (!text(teach.explanation) || steps.length < 2) continue;
    out.push({
      skill_id: entry.skill_id,
      headline: text(entry.headline) || curriculum.skillName(entry.skill_id),
      diagnosis: text(entry.diagnosis),
      misconception: text(entry.misconception),
      teach: {
        explanation: text(teach.explanation),
        steps,
        worked_problem: text(teach.worked_problem),
        worked_answer: text(teach.worked_answer),
        watch_for: text(teach.watch_for),
      },
      opener: text(entry.opener),
      source: 'ai',
    });
  }
  return out;
}

async function diagnoseCheckpoint({ kindLabel, level, accuracy, required, areas, profile, userId }) {
  if (!isEnabled() || !areas.length) return null;
  const detail = areas.map((a) => {
    const misses = a.missed.map((m) => `  - asked: ${m.prompt}\n    they answered: ${m.user_answer || '(blank)'}`
      + `\n    correct: ${m.answer}${m.error_tag ? `\n    tagged: ${m.error_tag}` : ''}`).join('\n');
    return `Skill "${a.skill_name}" (id ${a.skill_id}) — ${a.correct} of ${a.asked} right\n${misses}`;
  }).join('\n\n');

  const payload = await structured({
    // Pinned to MiMo pro by providers/index.js: no vendor fallback, because a
    // weaker diagnosis is worse than the rule-based floor.
    role: 'diagnose',
    task: 'diagnose',
    system: `You are this learner's tutor. They just scored ${Math.round(accuracy * 100)}% on a ${kindLabel} that needed ${Math.round(required * 100)}%, and they have chosen to work on what they got wrong before retaking it.

For each weak skill, work out what actually went wrong — the specific misunderstanding behind those wrong answers, not a restatement of the topic — and write the short teaching that fixes it.

Rules:
- Diagnose from their actual answers. A wrong answer usually has a reason visible in it; name that reason.
- "teach" is what you would say at a whiteboard: the idea, the steps in order, one fully worked problem of the same kind, and the trap that caught them.
- "opener" starts the conversation with them. One question that checks whether they have the idea, never the answer to anything they got wrong.
- Write for this learner as described below. Plain text, no markdown, no LaTeX.
- Order the areas worst first. Only include skills that are actually weak.

--- THIS LEARNER ---
${learnerBrief(userId, { level })}`,
    user: `${kindLabel} at level ${level}. Scored ${Math.round(accuracy * 100)}%, needed ${Math.round(required * 100)}%.

What they got wrong:

${detail}`,
    schema: REMEDIATION_SCHEMA,
    schemaName: 'submit_diagnosis',
    maxTokens: 12000,
    effort: 'high',
    // Off the shared background lane. A failed checkpoint also kicks off the
    // session analysis, and both are deep calls of about a minute; queued behind
    // it this one lands after two, by which time the learner has been reading the
    // rule-based version for a minute and a half.
    lane: 'parallel',
    userId,
  });
  if (!payload || !Array.isArray(payload.areas)) return null;
  const out = normalizeDiagnosis(payload.areas, new Set(areas.map((a) => a.skill_id)));
  return out.length ? out : null;
}

/**
 * One turn of the help-me-learn conversation.
 *
 * Chat route — the learner is sitting there. Unlike the per-item coach, this one
 * may explain fully: the quiz it is about is over and the retry will be written
 * from scratch, so there is no answer here to protect. What it must not do is
 * lecture; it teaches one step at a time and checks.
 */
async function remediationTeachReply({ area, level, messages, userId, kind = null }) {
  const history = (messages || []).slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));
  const conversation = history.length && history[0].role === 'assistant'
    ? [{ role: 'user', content: 'I want to work on this.' }, ...history]
    : history;

  return talk({
    role: 'fast',
    task: 'remediation_teach',
    system: kind === 'essay' ? `You are this learner's writing tutor. Their piece was marked under the pass mark, and they are about to revise the same piece and hand it in again. Help them fix it. This is a conversation, not a lecture.

How to run it:
- Work on one rubric criterion at a time. Quote the exact words from their writing that held the mark down, say what full marks looks like for that criterion, and ask them to rewrite that sentence or paragraph here.
- When they send a rewrite, say specifically what improved and what still falls short of full marks, then move to the next weak point.
- Do not write their essay for them. You may show one short model sentence of your own on a different example.
- They can hand the revision in at any moment. Never tell them to wait.
- Three or four sentences per turn, then one request or question. Plain text, no markdown.

--- WHAT HELD THE MARK DOWN ---
${area.headline}${area.diagnosis ? `\n${area.diagnosis}` : ''}
${(area.missed || []).slice(0, 4).map((m) => `Asked: "${String(m.prompt).slice(0, 400)}". Their words: "${m.user_answer || '(no quote)'}". ${m.answer}`).join('\n')}

--- THIS LEARNER ---
${learnerBrief(userId, { skillId: area.skill_id, skillName: area.skill_name, level })}` : `You are this learner's tutor, teaching them the one thing they got wrong on a quiz they are about to retake. This is a conversation, not a lecture.

How to run it:
- One idea per turn, three or four sentences at most, then one question that checks they have it.
- If they answer wrongly, do not correct and move on — find which step broke and go at that step.
- If they answer correctly twice in a row on the same idea, say plainly that they have it and that the retry is there when they want it.
- You may explain, work examples, and give answers here: this quiz is over and the retry will be written fresh. What you must not do is talk for a paragraph without asking them anything.
- They can retake the quiz at any moment. Never tell them to wait, and never imply they have to finish talking to you first.
- Plain text. No markdown, no LaTeX.

--- WHAT THEY GOT WRONG ---
${area.headline}${area.diagnosis ? `\n${area.diagnosis}` : ''}${area.misconception ? `\nThe misconception: ${area.misconception}` : ''}
${area.teach ? `The teaching you are working from: ${area.teach.explanation}\nSteps: ${(area.teach.steps || []).join(' | ')}${area.teach.watch_for ? `\nWatch for: ${area.teach.watch_for}` : ''}` : ''}
${(area.missed || []).slice(0, 4).map((m) => `They were asked "${m.prompt}", answered "${m.user_answer || '(blank)'}", correct was "${m.answer}".`).join('\n')}

--- THIS LEARNER ---
${learnerBrief(userId, { skillId: area.skill_id, skillName: area.skill_name, level })}`,
    messages: conversation.length ? conversation : [{ role: 'user', content: 'Teach me this. Start with whatever you think I am missing.' }],
    maxTokens: 600,
    effort: 'low',
    userId,
  });
}

module.exports = {
  structuredDetail,
  isEnabled,
  // The two primitives every call in this file is built on, exported because new
  // callers need them too — the per-user level editor and the conclusions drawn
  // from learner feedback both make their own call rather than reusing one of the
  // named roles below. They are not a second way in: they run through the same
  // `withProviders`, so budget, metering, the provider chain and the account
  // guard are identical to everything else here.
  talk,
  talkDetail,
  structured,
  regenerateItems,
  diagnoseCheckpoint,
  diagnoseArea,
  remediationTeachReply,
  providerName,
  generateItems,
  generateLesson,
  validateLesson,
  checkLessonMath,
  gradeFreeResponse,
  analyzeSession,
  coachReply,
  coachReplyStream,
  coachConversation,
  coachQuestionContext,
  learnerReachedAnswer,
  leakGuard,
  choiceLeak,
  tutorReply,
  validateItem,
  writingCriteriaFor,
  generateEssayPrompt,
  validateEssayPrompt,
  gradeEssay,
  validateEssayGrade,
  ERROR_TAGS,
  spentToday,
  usageToday,
  withinBudget,
};
