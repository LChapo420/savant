/**
 * The checkers under test. Each judge sees ONLY: the system prompt below, the level's context line (subject, grade, level number), and the level's blocks and checks as JSON
 * with the planted edit already applied. Never the plant list, its kind, a planted/clean label, the planter's reason, the stored verification record or the model that wrote it.
 * Each read is a fresh call. The prompt hash of every read is logged in the raw results.
 */
const L = require('./lib');
const bl = require('../../services/block-levels');
const { hash } = L;

const prov = {
  zerogpu: () => require('../../services/providers/zerogpu').zerogpu,
  gonka: () => require('../../services/providers/gonka').gonka,
  coral: () => require('../../services/providers/coral').coral,
  munito: () => require('../../services/providers/munito').munito,
  grokified: () => require('../../services/providers/grokified').grokified,
  lyceum: () => require('../../services/providers/lyceum').lyceum,
  crouton: () => require('../../services/providers/crouton').crouton,
};

const HUNT_SYSTEM = `You check a lesson for errors before it reaches a learner. You get the subject, grade and level, then every block and graded check as JSON. Many lessons have no errors at all, and a false alarm costs real money. Report only what is actually wrong.

Go through it in this order, working things out yourself and never trusting the writer's explanation:
1. Numbers: redo every calculation, count, conversion and table value. Follow each worked example step by step to its end.
2. Formulas and procedures: is each stated rule, formula, sign, order of steps and conjugation pattern right?
3. Keys: for every graded check and every interactive item with a key (answer, correctIndex, correctId, correctOptionId, correctBucket and so on), work out the answer BEFORE reading the key, then compare. The key must be right, its explanation must argue for it, and it must agree with what the blocks of this lesson teach.
4. Facts: every date, person, place, term name, definition and word meaning, from what you know for certain.
5. Direction: cause and effect, which way a rule runs, which form goes with which case.
6. Misleading statements: a flat "always", "never" or "any" where the truth has an exception that a learner of this level would be misled by.
7. Agreement: two parts of the lesson that contradict each other.

Do not report: style, tone, teaching choices, simplifications that are fair at this level, debatable usage presented as debatable, made-up names and scenarios in examples, or text that is meant to be wrong (wrong options of a question, trap text, lines marked isError true, the false side of a true/false item) unless its marking or feedback is itself wrong.

For each error give: where ("block N" or "check N", numbered as given), quote (the exact wrong words), why (what is wrong, with the working), truth (what it should say). No errors: an empty list.`;

const HUNT_SCHEMA = {
  type: 'object',
  required: ['errors'],
  properties: {
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['where', 'quote', 'why', 'truth'],
        properties: { where: { type: 'string' }, quote: { type: 'string' }, why: { type: 'string' }, truth: { type: 'string' } },
      },
    },
  },
};

const LENS_SYSTEM = `You check a lesson for one kind of mistake only: statements a subject expert would object to. You get the subject, grade and level, then every block and graded check as JSON. Ignore the arithmetic and the answer keys; another checker does those. Most lessons have none of these errors.

Read every general statement in the lesson, one at a time, and ask:
1. Is this rule stated too broadly? Look hard at each rule and each "always", "never", "only", "any", "every", "whenever", "all", "must", and at rules with no such word that still drop a condition the original rule needs (positive numbers only, one grammatical case, one region or style guide). Would a learner who believes this sentence as written get a real case wrong?
2. Is each number about the real world about right (how many, how much, how common), and each place, person, region, country and source named the right one? Check each one against what you know. Which countries and regions use a form? Which guide says what?
3. Does each definition name the right term, and does it hold in the direction stated?

Do not report style, tone, teaching choices, or text meant to be wrong (wrong options, trap text, lines marked isError true). A rule the lesson qualifies elsewhere in the same block is fine. Do not report a simplification unless a learner would really be misled.

For each error give: where ("block N" or "check N", numbered as given), quote (the exact wrong words), why (what is wrong), truth (what it should say). None: an empty list.`;

const BLIND_SYSTEM = `You answer the graded checks of a lesson, as an expert who has read the lesson. You get the lesson's blocks, then each check's question and, for multiple choice, its options. Work each one out carefully and give the one right answer. For multiple choice give the option's number (1 is the first). For a typed answer give the shortest correct answer.`;
const BLIND_SCHEMA = {
  type: 'object',
  required: ['answers'],
  properties: { answers: { type: 'array', items: { type: 'object', required: ['check'], properties: { check: { type: 'integer' }, option: { type: 'integer' }, answer: { type: 'string' } } } } },
};

const render = (lv) => [
  L.contextOf(lv),
  '',
  ...lv.blocks.map((b) => `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`),
  ...lv.checks.map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify({ prompt: c.prompt, fen: c.fen, frames: c.frames, options: c.options, choices: c.choices, answer: c.answer, accepts: c.accepts, rationale: c.rationale, hint: c.hint })}`),
].join('\n');
const renderBlind = (lv) => [
  L.contextOf(lv),
  '',
  ...lv.blocks.map((b) => `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`),
  '',
  ...lv.checks.filter((c) => c.answer != null).map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify({ prompt: c.prompt, fen: c.fen, frames: c.frames, options: c.options, choices: c.choices })}`),
].join('\n');

/** name → model on a provider, with how it reads. */
const MODELS = {
  glm_flash_zgpu: { p: 'zerogpu', model: 'z-ai/glm-5.3-flash', family: 'glm' },
  glm_flash_gonka: { p: 'gonka', model: 'zai-org/GLM-5.3-Flash', family: 'glm' },
  ds_flash_gonka: { p: 'gonka', model: 'deepseek-ai/DeepSeek-V4-Flash-0731', family: 'deepseek' },
  ds41_coral: { p: 'coral', model: 'deepseek-v4.1-flash', family: 'deepseek' },
  ds41_munito: { p: 'munito', model: 'deepseek-ai/deepseek-v4.1-flash-1017', family: 'deepseek' },
  glm_flash_munito: { p: 'munito', model: 'zai-org/glm-5.3-flash', family: 'glm' },
  grok43: { p: 'grokified', model: 'grok-4.3', family: 'grok' },
  grok47: { p: 'grokified', model: 'grok-4.7', family: 'grok' },
  glm53: { p: 'lyceum', model: 'z-ai/glm-5.3', family: 'glm' },
  kimi31: { p: 'lyceum', model: 'moonshotai/kimi-k3.1-pro', family: 'kimi' },
  qwen27: { p: 'munito', model: 'qwen/qwen3.8-27b', family: 'qwen' },
  crouton: { p: 'crouton', model: 'stealth/crouton-alpha', family: 'crouton' },
  haiku: { claude: 'claude-haiku-5-5', family: 'claude' },
  sonnet: { claude: 'claude-sonnet-5-5', family: 'claude' },
};

async function callModel(m, { system, user, schema, schemaName, maxTokens, effort = null, task = 'fact_gate' }) {
  const spec = MODELS[m];
  if (spec.claude) {
    const fc = require('../../services/fact-check-anthropic');
    const r = await fc.ask({ system, user, schema, schemaName, maxTokens, maxSearches: 0, effort: effort || 'medium', modelName: spec.claude, task });
    if (!r || !r.data) throw new Error('claude: no reply');
    return { data: r.data, usage: r.usage, cost: r.cost, model: r.model };
  }
  const r = await prov[spec.p]().structured({ system, user, schema, schemaName, maxTokens, model: spec.model, effort, timeoutMs: 280000, task });
  return { data: r.data, usage: r.usage, cost: (r.usage && r.usage.cost_usd) || 0, model: r.model };
}

/** One read of one level. Returns { flags, cost, usage, ms, promptHash }. */
async function read(judge, lv) {
  const [m, mode = 'hunt'] = judge.split(':');
  const t = Date.now();
  if (mode === 'hunt') {
    const user = render(lv);
    const r = await callModel(m, { system: HUNT_SYSTEM, user, schema: HUNT_SCHEMA, schemaName: 'submit_errors', maxTokens: 12000 });
    const flags = (r.data.errors || []).map((e) => ({ where: String(e.where || ''), claim: String(e.quote || ''), why: String(e.why || ''), truth: String(e.truth || '') }));
    return { flags, cost: r.cost, usage: r.usage, ms: Date.now() - t, promptHash: hash(HUNT_SYSTEM + user) };
  }
  if (mode === 'lens') {
    const user = render(lv);
    const r = await callModel(m, { system: LENS_SYSTEM, user, schema: HUNT_SCHEMA, schemaName: 'submit_errors', maxTokens: 12000 });
    const flags = (r.data.errors || []).map((e) => ({ where: String(e.where || ''), claim: String(e.quote || ''), why: String(e.why || ''), truth: String(e.truth || '') }));
    return { flags, cost: r.cost, usage: r.usage, ms: Date.now() - t, promptHash: hash(LENS_SYSTEM + user) };
  }
  if (mode === 'claims') {
    // Today's gate: the production prompt and schema, whole level, every claim.
    const req = bl.verifyRequest({ context: { text: L.contextOf(lv), trackId: lv.track }, blocks: lv.blocks, checks: lv.checks });
    const r = await callModel(m, { system: req.system, user: req.user, schema: req.schema, schemaName: 'submit_verification', maxTokens: 16000 });
    const claims = (r.data.claims || []).filter((c) => c && c.verdict && c.verdict !== 'verified');
    const flags = claims.map((c) => ({ where: String(c.where || ''), claim: String(c.claim || ''), why: String(c.verdict || ''), truth: String(c.truth || '') }));
    return { flags, claimsRead: (r.data.claims || []).length, cost: r.cost, usage: r.usage, ms: Date.now() - t, promptHash: hash(req.system + req.user) };
  }
  if (mode === 'blind') {
    // The checks answered without key or rationale, the lesson in hand. A different answer is a flag.
    const user = renderBlind(lv);
    const r = await callModel(m, { system: BLIND_SYSTEM, user, schema: BLIND_SCHEMA, schemaName: 'submit_answers', maxTokens: 8000 });
    const flags = [];
    const same = (a, b) => { const n = (s) => String(s || '').toLowerCase().replace(/[\s.,;:!?'"‘’“”]+/g, ''); return n(a) === n(b); };
    for (const a of r.data.answers || []) {
      const c = lv.checks.find((x) => x.index === Number(a.check));
      if (!c || c.answer == null) continue;
      if (Array.isArray(c.choices) && c.choices.length && Number.isInteger(a.option)) {
        const pick = c.choices[a.option - 1];
        if (pick !== undefined && !same(pick, c.answer)) flags.push({ where: `check ${c.index}`, claim: String(c.answer), why: `blind answer: ${pick}`, truth: String(pick), blind: true });
      } else if (!Array.isArray(c.choices) || !c.choices.length) {
        const accepted = [c.answer, ...(c.accepts || [])];
        if (!accepted.some((x) => same(x, a.answer))) flags.push({ where: `check ${c.index}`, claim: String(c.answer), why: `blind answer: ${a.answer}`, truth: String(a.answer), blind: true, typed: true });
      }
    }
    return { flags, cost: r.cost, usage: r.usage, ms: Date.now() - t, promptHash: hash(BLIND_SYSTEM + user) };
  }
  throw new Error(`mode ${mode}`);
}

module.exports = { MODELS, read, callModel, render, HUNT_SYSTEM, HUNT_SCHEMA };
