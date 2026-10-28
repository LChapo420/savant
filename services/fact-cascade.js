/**
 * The lesson verifier as a cascade: cheap and free checks on everything, the
 * strong model only on what they flag.
 *
 * Designed in the owner's "High accuracy system research" chat (2026-10-21) and
 * adapted to what was measured here on three real lessons: Claude Sonnet 5.5,
 * reading every claim, found 50 errors at $0.22-0.77 a lesson. Half of them were
 * not "is this sentence supported by a source?" errors but contradictions inside
 * the lesson (a flow chart against its own questions, a drawn play's geometry),
 * so a source checker alone cannot replace a reader.
 *
 * For one level (or the parts of it being re-checked after a repair):
 *   1. the unit's fact pool: researched once per unit (the levels between two
 *      checkpoints) by Claude with web search, every fact with the sentence from
 *      its source, and shared by every level in the unit;
 *   2. a cheap model lists every claim, block by block, and reads the whole level
 *      for contradictions, answer keys and opinions stated as fact;
 *   3. a blind test: the cheap model answers every multiple-choice and typed check
 *      without its key, and a different answer is a flag;
 *   4. the local checkers (tools/fact-checkers/server.py, free, on this machine)
 *      judge every factual claim against the pool's source sentences: FactCG and
 *      MiniCheck on all of them, Granite Guardian and HalluGuard on any they doubt;
 *   5. everything flagged goes to Claude Sonnet 5.5 with web search, which rules
 *      on each flag: a confirmed error, with the truth and a source, or a false
 *      alarm. Only confirmed errors come back to be repaired.
 * The code checks (a legal move, a chord's notes, a play that can be drawn) ran
 * before this and still do.
 *
 * The cheap model is the free NVIDIA lineup (config/model-lineup.json): each read
 * names its task (fact_claims, fact_read, blind_mc, fact_verify) and gets the model
 * the lineup eval measured best for it. Claude Haiku 5.5 on the fact-check key is
 * the fallback when NVIDIA cannot answer. MiMo is out of the lineup (owner,
 * 2026-10-22) and the free MiniMax window closed on 2026-10-22 12:00 UTC.
 * FACT_CHEAP_MODEL overrides: "nvidia:<model>[@effort]", "openrouter:<slug>" (free
 * routes only: the owner's OpenRouter balance must not be spent), "mimo:fast" or
 * "anthropic:<id>".
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const factReader = require('./fact-check-anthropic');

const CHECKERS = `http://127.0.0.1:${process.env.FACT_CHECKERS_PORT || 6790}`;
const POOLS = 'fact_pools';
const ESCALATION_MODEL = () => process.env.FACT_ESCALATION_MODEL || 'claude-sonnet-5-5';
const HAIKU_PRICE = { input: 0.1, output: 0.5 };

// ── the cheap model ─────────────────────────────────────────────────────────
function cheapModel() {
  const set = String(process.env.FACT_CHEAP_MODEL || '').trim();
  if (set) {
    const [provider, ...rest] = set.split(':');
    return { provider, model: rest.join(':') };
  }
  // eslint-disable-next-line global-require
  if (require('./providers/nvidia').isConfigured()) return { provider: 'nvidia', model: 'lineup' };
  return { provider: 'anthropic', model: 'claude-haiku-5-5' };
}

/** Claude Haiku on the fact-check key: the cheap read's paid fallback. */
async function haikuFallback({ system, user, schema, schemaName }) {
  if (!factReader.isReady()) return null;
  const fallback = await factReader.ask({ system, user, schema, schemaName, maxTokens: 16000, maxSearches: 0, effort: 'low', modelName: 'claude-haiku-5-5' }).catch(() => null);
  if (!fallback) return null;
  const u = fallback.usage || {};
  return { data: fallback.data, cost: ((u.input_tokens || 0) * HAIKU_PRICE.input + (u.output_tokens || 0) * HAIKU_PRICE.output) / 1e6, model: 'claude-haiku-5-5' };
}

/**
 * A local model (services/providers/ollama.js) when NVIDIA could not answer, before
 * the paid Haiku fallback. Only for tasks the local lineup serves
 * (config/local-lineup.json, measured by scripts/local-model-eval.js, or
 * OLLAMA_FALLBACK_ALL=1). Returns { data, cost: 0, model } or null.
 */
async function localAnswer({ system, user, schema, schemaName, task }) {
  // eslint-disable-next-line global-require
  const local = require('./providers/ollama');
  if (!local.isEnabled('check', task)) return null;
  const r = await local.structured({ role: 'check', task, system, user, schema, schemaName, maxTokens: 8000, lane: 'background' })
    .catch((err) => { console.warn(`facts: the local model could not answer ${task} (${err.message})`); return null; });
  return r && r.data ? { data: r.data, cost: 0, model: r.model } : null;
}

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** One structured answer from the cheap model, through a tool call. Returns { data, cost } or null. */
async function cheap({ system, user, schema, schemaName, task = 'fact_read' }) {
  const { provider, model } = cheapModel();
  if (provider === 'nvidia') {
    // eslint-disable-next-line global-require
    const nvidia = require('./providers/nvidia');
    const reply = await nvidia.structured({
      role: 'check', task, system, user, schema, schemaName, maxTokens: 16000, lane: 'background',
      models: model && model !== 'lineup' ? [model] : null,
    }).catch((err) => { console.warn(`facts: NVIDIA could not answer ${task} (${err.message})`); return null; });
    if (reply && reply.data) return { data: reply.data, cost: 0, model: reply.model };
    const local = await localAnswer({ system, user, schema, schemaName, task });
    if (local) return local;
    return haikuFallback({ system, user, schema, schemaName });
  }
  if (provider === 'mimo') {
    // eslint-disable-next-line global-require
    const reply = await require('./providers/mimo').structured({ role: model || 'fast', system, user, schema, schemaName, maxTokens: 16000, lane: 'parallel' }).catch(() => null);
    if (reply && reply.data) return { data: reply.data, cost: 0, model: reply.model };
    // The plan capped out: Haiku answers instead.
    if (!factReader.isReady()) return null;
    const fallback = await factReader.ask({ system, user, schema, schemaName, maxTokens: 16000, maxSearches: 0, effort: 'low', modelName: 'claude-haiku-5-5' }).catch(() => null);
    if (!fallback) return null;
    const u = fallback.usage || {};
    return { data: fallback.data, cost: ((u.input_tokens || 0) * HAIKU_PRICE.input + (u.output_tokens || 0) * HAIKU_PRICE.output) / 1e6, model: 'claude-haiku-5-5' };
  }
  if (provider === 'anthropic') {
    const reply = await factReader.ask({ system, user, schema, schemaName, maxTokens: 16000, maxSearches: 0, effort: 'low', modelName: model }).catch(() => null);
    if (!reply) return null;
    const u = reply.usage || {};
    return { data: reply.data, cost: ((u.input_tokens || 0) * HAIKU_PRICE.input + (u.output_tokens || 0) * HAIKU_PRICE.output) / 1e6, model };
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({
        model,
        max_tokens: 32000,
        reasoning: { effort: 'high' },
        messages: [{ role: 'system', content: `${system}\n\nGive your answer by calling the ${schemaName} tool once.` }, { role: 'user', content: user }],
        tools: [{ type: 'function', function: { name: schemaName, description: 'Submit the result. Call this exactly once.', parameters: schema } }],
        tool_choice: 'required',
      }),
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) { await wait(6000 * (attempt + 1)); continue; } // eslint-disable-line no-await-in-loop
    const body = await res.json().catch(() => ({})); // eslint-disable-line no-await-in-loop
    if (!res.ok) return null;
    const msg = body.choices && body.choices[0] && body.choices[0].message;
    const call = msg && (msg.tool_calls || [])[0];
    try {
      if (call) return { data: JSON.parse(call.function.arguments), cost: 0, model };
      if (msg && msg.content) return { data: JSON.parse(String(msg.content).replace(/^```(json)?|```$/g, '')), cost: 0, model };
    } catch { /* fall through */ }
    return null;
  }
  return null;
}

/** Run tasks a few at a time. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i); // eslint-disable-line no-await-in-loop
    }
  }));
  return out;
}

// ── the unit's fact pool ────────────────────────────────────────────────────
/** The unit a level is in: the levels between the checkpoints around it. */
function unitOf(trackId, gradeId, level) {
  const grade = curriculum.getGrade(trackId, gradeId);
  const checkpoint = (at) => curriculum.isCheckpoint(curriculum.levelKind(at, grade.pathLength, grade));
  let start = level;
  while (start > 1 && !checkpoint(start - 1)) start--;
  let end = level;
  while (end < grade.pathLength && !checkpoint(end)) end++;
  const lessons = [];
  for (let at = start; at <= end; at++) {
    if (curriculum.levelKind(at, grade.pathLength, grade) !== 'lesson') continue;
    const e = LAYOUT.entryFor(grade, at) || {};
    if (/summary/i.test(String(e.type || '')) || /^summary:/i.test(String(e.title || ''))) continue;
    lessons.push({ level: at, title: e.title || '', covers: e.covers || '' });
  }
  return { key: `${trackId}:${gradeId}:${start}`, start, end, lessons };
}

/**
 * The unit's fact pool, researched once and shared by every level in the unit.
 * Returns { pool, fresh } (fresh: researched by this call, so its cost is this
 * level's), or null when it could not be researched.
 */
async function unitPool({ trackId, gradeId, level, context }) {
  const unit = unitOf(trackId, gradeId, level);
  const stored = db.findOne(POOLS, (p) => p.key === unit.key && p.status === 'ready');
  if (stored) return { pool: stored, fresh: false };
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  const coverage = unit.lessons.map((l) => `${l.title}${l.covers ? `: ${String(l.covers).slice(0, 300)}` : ''}`);
  // FACT_POOL=offline: the offline pool first, the paid researcher only for the facts
  // it could not source (services/offline-pool.js). Off by default.
  // eslint-disable-next-line global-require
  const sheet = (await require('./offline-pool').offlineFirst({ context, coverage, maxFacts: 45, research: blockLevels.researchFacts }))
    || await blockLevels.researchFacts({ context, coverage, maxFacts: 45, maxSearches: 10 });
  if (!sheet) return null;
  const row = { key: unit.key, track_id: trackId, grade_id: gradeId, start: unit.start, end: unit.end, lessons: unit.lessons.map((l) => l.level), status: 'ready', ...sheet, created_at: new Date().toISOString() };
  const existing = db.findOne(POOLS, (p) => p.key === unit.key);
  return { pool: existing ? db.update(POOLS, existing.id, row) : db.insert(POOLS, row), fresh: true };
}

/**
 * The pool's facts most related to a claim, as the document the local checkers read.
 * With { offline: true } and FACT_POOL=offline, passages from the offline Wikipedia /
 * Wiktionary (services/offline-facts.js) are appended. Offline text is only ever
 * evidence FOR a claim: callers never raise a flag because it is missing.
 */
async function documentFor(claim, poolRow, limit = 6, { offline = false, topic = '' } = {}) {
  const fromPool = poolDocument(claim, poolRow, limit);
  if (!offline || !require('./offline-pool').offlineOn()) return fromPool; // eslint-disable-line global-require
  // eslint-disable-next-line global-require
  const off = await require('./offline-facts').documentFor(claim, { topic, k: 3 }).catch(() => ({ doc: '' }));
  return [fromPool, off.doc].filter(Boolean).join('\n');
}

function poolDocument(claim, poolRow, limit = 6) {
  const words = (t) => new Set(String(t).toLowerCase().match(/[a-z0-9#]+/g) || []);
  const want = words(claim);
  const scored = (poolRow.facts || []).map((f) => {
    const have = words(`${f.fact} ${f.source_quote || ''}`);
    let overlap = 0;
    for (const w of want) if (w.length > 2 && have.has(w)) overlap++;
    return { f, overlap };
  }).sort((a, b) => b.overlap - a.overlap).slice(0, limit).filter((x) => x.overlap > 0);
  return scored.map(({ f }) => [f.source_quote, f.fact].filter(Boolean).join(' ')).join('\n');
}

// ── the local checkers ──────────────────────────────────────────────────────
let checkersUp = null;
let checkersCheckedAt = 0;
async function checkersReady() {
  if (Date.now() - checkersCheckedAt < 60000 && checkersUp !== null) return checkersUp;
  checkersCheckedAt = Date.now();
  try {
    const res = await fetch(`${CHECKERS}/health`);
    const body = await res.json();
    checkersUp = !!(body.ok && body.models && body.models.factcg && body.models.minicheck);
  } catch { checkersUp = false; }
  return checkersUp;
}

/**
 * Send pairs to a local stage a few at a time: stage 2 takes 10-90 seconds a claim
 * on the CPU, and one long request is cut off by the HTTP client's own limit.
 */
async function checkers(stage, pairs) {
  const size = stage === 'stage1' ? 64 : 2;
  const out = [];
  for (let at = 0; at < pairs.length; at += size) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`${CHECKERS}/${stage}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairs: pairs.slice(at, at + size) }) });
    if (!res.ok) throw new Error(`fact checkers ${stage}: ${res.status}`);
    out.push(...(((await res.json()).results) || [])); // eslint-disable-line no-await-in-loop
  }
  return out;
}

/**
 * Claims the pool did not support, checked once more against offline passages only.
 * Both stage-1 checkers at 0.5 or above marks the claim supported; anything else
 * leaves its verdict exactly as it was. Returns how many were cleared.
 */
async function offlineSecondChance(factual, verdicts, { topic = '' } = {}) {
  // eslint-disable-next-line global-require
  const offline = require('./offline-facts');
  const todo = factual.map((c, i) => ({ c, i })).filter(({ i }) => verdicts.get(i) !== 'supported');
  if (!todo.length) return 0;
  const docs = [];
  for (const { c, i } of todo) {
    // eslint-disable-next-line no-await-in-loop
    const off = await offline.documentFor(c.claim, { topic, k: 3 }).catch(() => ({ doc: '' }));
    if (off.doc) docs.push({ i, doc: off.doc, claim: c.claim });
  }
  if (!docs.length) return 0;
  let cleared = 0;
  try {
    const s1 = await checkers('stage1', docs.map(({ doc, claim }) => ({ doc, claim })));
    s1.forEach((r, k) => {
      if (r && r.factcg >= 0.5 && r.minicheck >= 0.5) { verdicts.set(docs[k].i, 'supported'); cleared++; }
    });
  } catch (err) {
    console.warn(`facts: the offline second chance failed (${err.message}); verdicts unchanged`);
  }
  return cleared;
}

// ── the cheap reads ─────────────────────────────────────────────────────────
const CLAIMS_SYSTEM = `You list every claim in one part of a lesson for an education app, so each can be checked. A claim is any sentence or phrase that states something about the world or the subject: a fact, a rule, a definition, a number, an example ("e4 to g6 is a diagonal"), a "why", an answer key and its explanation, a wrong option's feedback. Quote each claim exactly, one per item. Give its kind: "fact"; "example" (a statement about the specific position, notes, play, sentence or numbers shown in this lesson); "opinion"; "contested"; "theoretical"; "instruction" (what the learner should do). Skip greetings and encouragement that state nothing.`;
const CLAIMS_SCHEMA = {
  type: 'object',
  required: ['claims'],
  properties: { claims: { type: 'array', items: { type: 'object', required: ['claim', 'kind'], properties: { claim: { type: 'string' }, kind: { type: 'string', enum: ['fact', 'example', 'opinion', 'contested', 'theoretical', 'instruction'] } } } } },
};

const READ_SYSTEM = `You review one lesson of an education app for errors a careful expert teacher would catch, reading it as a whole. Report every problem:
- parts that contradict each other (a diagram's labels and its questions, a block and a check, two blocks giving different numbers);
- an example that does not show what it claims (place the pieces, count the keys, read the coordinates, do the arithmetic);
- a graded check whose marked answer is not the one right answer, or that has two right answers;
- an opinion, contested point or theory stated as plain fact; a made-up figure or statistic;
- a wrong option's feedback that is itself false;
- an instruction that is unsafe or impossible for this learner.
Wrong options are meant to be wrong: report them only when their feedback or wording is false. For each problem: where ("block 3" or "check 1"), the words quoted exactly, what is wrong, and what is true. An empty list is right for a lesson with no problems.`;
const READ_SCHEMA = {
  type: 'object',
  required: ['problems'],
  properties: { problems: { type: 'array', items: { type: 'object', required: ['where', 'claim', 'problem'], properties: { where: { type: 'string' }, claim: { type: 'string' }, problem: { type: 'string' }, truth: { type: 'string' } } } } },
};

const BLIND_SYSTEM = 'You are a careful student taking a quiz. Answer each question. For a multiple-choice question, give the exact text of the one option you choose, and say whether more than one option could be right. For a typed question, give a short answer. Work each one out before answering.';
const BLIND_SCHEMA = {
  type: 'object',
  required: ['answers'],
  properties: { answers: { type: 'array', items: { type: 'object', required: ['index', 'answer'], properties: { index: { type: 'integer' }, answer: { type: 'string' }, more_than_one_right: { type: 'boolean' } } } } },
};

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The blind test: every multiple-choice and typed check answered without its key.
 * Jev answers non-math multiple choice first when the lineup enables it (only where
 * the eval found it beats every free model, and within its persistent budget,
 * services/jev.js): a confident Jev answer (>= 0.8) stands, anything else goes to
 * the cheap model with the rest. Returns { data: { answers }, cost } like cheap().
 */
async function blindAnswers({ askable, context, trackId }) {
  // eslint-disable-next-line global-require
  const jev = require('./jev');
  const answers = [];
  let cost = 0;
  let rest = askable;
  if (trackId !== 'math' && jev.enabledFor('blind_mc')) {
    rest = [];
    for (const c of askable) {
      const isMc = c.format === 'multiple_choice' && (c.choices || []).length >= 2;
      // eslint-disable-next-line no-await-in-loop
      const got = isMc ? await jev.chooseOption({ question: c.prompt, options: c.choices }).catch(() => null) : null;
      if (got && got.confidence >= 0.8) answers.push({ index: c.index, answer: got.answer, more_than_one_right: false });
      else rest.push(c);
    }
  }
  if (rest.length) {
    const quiz = rest.map((c) => `QUESTION ${c.index}: ${c.prompt}${(c.choices || []).length ? `\nOPTIONS:\n${c.choices.map((o) => `- ${o}`).join('\n')}` : ' (type a short answer)'}`).join('\n\n');
    const blind = await cheap({ system: BLIND_SYSTEM, user: `${context.text}\n\n${quiz}`, schema: BLIND_SCHEMA, schemaName: 'submit_answers', task: 'blind_mc' });
    if (blind) cost += blind.cost || 0;
    answers.push(...((blind && blind.data && blind.data.answers) || []));
  }
  return { data: { answers }, cost };
}

// ── escalation ──────────────────────────────────────────────────────────────
const RULE_SYSTEM = `You are the final judge of flags raised on a lesson of an education app by cheaper checkers. For each flag, decide whether it is a real error. Work it out yourself; search the web for anything specific you are not certain of, and cite the source you relied on. Cheaper checkers raise false alarms: a wrong quiz option that is meant to be wrong, a teaching analogy, a claim that is true but not in their sources. Confirm only real errors: a false fact; a wrong answer key or a second right answer; an example that does not show what it claims; parts that contradict each other; a made-up figure; an opinion, contested point or theory stated as plain fact; an unsafe instruction.`;
const RULE_SCHEMA = {
  type: 'object',
  required: ['rulings'],
  properties: {
    rulings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['flag', 'verdict'],
        properties: {
          flag: { type: 'integer' },
          verdict: { type: 'string', enum: ['error', 'false_alarm'] },
          kind: { type: 'string', enum: ['false', 'unsupported', 'unlabelled'] },
          truth: { type: 'string', description: 'For an error: what is true, or the honest wording.' },
          source_url: { type: 'string' },
        },
      },
    },
  },
};

/**
 * Verify some or all of a level through the cascade. Same shape as the full
 * Sonnet verification (services/block-levels.js verifyLevel): every claim with a
 * verdict, and the reasons against each block or check that failed. Returns null
 * when it could not run (no key, nothing answering).
 */
async function cascadeVerify({ context, blocks, checks, trackId, gradeId, level, factSheet = null }) {
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  if (!factReader.isReady()) return null;
  let cost = 0;
  let searches = 0;
  const sources = new Map();
  const stages = { claims: 0, read_problems: 0, blind_flags: 0, local_checked: 0, local_doubted: 0, escalated: 0, confirmed: 0 };

  // 1. The unit's fact pool (a fact sheet researched for this level counts as one).
  let poolRow = factSheet && (factSheet.facts || []).length ? factSheet : null;
  if (!poolRow) {
    const got = await unitPool({ trackId, gradeId, level, context });
    poolRow = got && got.pool;
    if (got && got.fresh) cost += got.pool.cost || 0;
  }
  const lessonText = blockLevels.verifyRequest({ context, blocks, checks }).user;

  // 2. Claims, block by block; and one read of the whole level.
  const parts = [...blocks.map((b) => ({ where: `block ${b.index}`, text: `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}` })),
    ...checks.map((c) => ({ where: `check ${c.index}`, text: `CHECK ${c.index} (${c.format}): ${JSON.stringify({ prompt: c.prompt, choices: c.choices, answer: c.answer, rationale: c.rationale })}` }))];
  const listed = await pool(parts, 4, async (part) => {
    const r = await cheap({ system: CLAIMS_SYSTEM, user: `${context.text}\n\n${part.text}\n\nList every claim in this part now.`, schema: CLAIMS_SCHEMA, schemaName: 'submit_claims', task: 'fact_claims' });
    if (r) cost += r.cost;
    return ((r && r.data && r.data.claims) || []).filter((c) => c && c.claim).map((c) => ({ where: part.where, claim: String(c.claim).slice(0, 400), kind: c.kind || 'fact' }));
  });
  const claims = listed.flat();
  stages.claims = claims.length;
  const read = await cheap({ system: READ_SYSTEM, user: `${lessonText}`, schema: READ_SCHEMA, schemaName: 'submit_problems', task: 'fact_read' });
  if (read) cost += read.cost;
  const flags = ((read && read.data && read.data.problems) || []).filter((p) => p && p.claim)
    .map((p) => ({ where: String(p.where || ''), claim: String(p.claim).slice(0, 400), why: `${p.problem || ''}${p.truth ? ` (true: ${p.truth})` : ''}`, by: 'read-through' }));
  stages.read_problems = flags.length;

  // 3. The blind test, for the checks a model can answer in words.
  const askable = checks.filter((c) => c.format === 'multiple_choice' || c.format === 'type_in');
  if (askable.length) {
    const blind = await blindAnswers({ askable, context, trackId });
    if (blind) cost += blind.cost;
    for (const a of (blind && blind.data && blind.data.answers) || []) {
      const c = askable.find((x) => x.index === Number(a.index));
      if (!c) continue;
      const keys = [c.answer, ...(c.accepts || [])].map(norm);
      if (!keys.includes(norm(a.answer)) || a.more_than_one_right) {
        flags.push({ where: `check ${c.index}`, claim: `${c.prompt} → key: ${c.answer}`, why: `a student answering without the key chose "${a.answer}"${a.more_than_one_right ? ' and thought more than one option could be right' : ''}`, by: 'blind test' });
        stages.blind_flags++;
      }
    }
  }

  // 4. The local checkers, on every factual claim and example, against the pool.
  const factual = claims.filter((c) => c.kind === 'fact' || c.kind === 'example');
  const verdicts = new Map();
  if (poolRow && await checkersReady()) {
    const pairs = await Promise.all(factual.map(async (c) => ({ doc: await documentFor(c.claim, poolRow), claim: c.claim })));
    const withDoc = pairs.map((p, i) => ({ ...p, i })).filter((p) => p.doc);
    try {
      const s1 = await checkers('stage1', withDoc.map(({ doc, claim }) => ({ doc, claim })));
      stages.local_checked = s1.length;
      const doubted = [];
      s1.forEach((r, k) => {
        const p = withDoc[k];
        if (r.factcg >= 0.5 && r.minicheck >= 0.5) verdicts.set(p.i, 'supported');
        // Both clearly against: the sources do not say it, so the judge decides
        // without the slow stage spending a minute agreeing.
        else if (r.factcg < 0.25 && r.minicheck < 0.25) verdicts.set(p.i, `local: not in the unit's sources (FactCG ${r.factcg}, MiniCheck ${r.minicheck})`);
        else doubted.push(p);
      });
      stages.local_doubted = doubted.length;
      const s2 = await checkers('stage2', doubted.map(({ doc, claim }) => ({ doc, claim })));
      s2.forEach((r, k) => {
        const p = doubted[k];
        verdicts.set(p.i, r.granite === 'grounded' && r.halluguard === 'GROUNDED' ? 'supported' : `local: Granite says ${r.granite}, HalluGuard says ${r.halluguard}${r.why ? ` (${r.why.slice(0, 200)})` : ''}`);
      });
    } catch (err) {
      console.warn(`facts: the local checkers failed (${err.message}); their claims go to the judge`);
    }
  }
  // FACT_POOL=offline: a second chance against the offline encyclopedia for what the
  // pool did not support. It can only clear a claim, never flag one (measured: claims
  // about a lesson's own examples are almost never in an encyclopedia, so "not found
  // offline" says nothing; curriculum-build/OPTIMAL-FREE-SYSTEM.md section 3).
  if (poolRow && require('./offline-pool').offlineOn() && await checkersReady()) { // eslint-disable-line global-require
    const cleared = await offlineSecondChance(factual, verdicts, { topic: (context && context.topic) || poolRow.topic || '' });
    stages.offline_cleared = cleared;
  }
  factual.forEach((c, i) => {
    const v = verdicts.get(i);
    // Not supported by the unit's sources, or not checked locally: the judge decides.
    if (v !== 'supported') flags.push({ where: c.where, claim: c.claim, why: v || 'not checked against a source', by: 'local checkers' });
  });

  // One flag per problem: the read-through and the local checkers often raise the same one.
  const placeKey = (w) => { const m = /(block|check)\s*#?\s*(\d+)/i.exec(w); return m ? `${m[1].toLowerCase()} ${m[2]}` : w.toLowerCase(); };
  const deduped = [];
  for (const f of flags) {
    const words = new Set(norm(f.claim).split(' ').filter((w) => w.length > 3));
    const twin = deduped.find((d) => placeKey(d.where) === placeKey(f.where)
      && [...words].filter((w) => norm(d.claim).includes(w)).length >= Math.min(4, Math.ceil(words.size * 0.6)));
    if (twin) twin.why = `${twin.why}; also ${f.by}: ${f.why}`.slice(0, 600); else deduped.push({ ...f });
  }
  flags.length = 0;
  flags.push(...deduped);

  // 5. The judge: Sonnet rules on every flag, with the lesson in front of it.
  const rulings = new Map();
  if (flags.length) {
    stages.escalated = flags.length;
    const list = flags.map((f, i) => `FLAG ${i} [${f.where}] (${f.by}) "${f.claim}" — ${f.why}`).join('\n');
    try {
      const reply = await factReader.ask({
        system: RULE_SYSTEM, user: `${lessonText}\n\nFLAGS:\n${list}\n\nRule on every flag now.`, schema: RULE_SCHEMA, schemaName: 'submit_rulings', maxTokens: 24000, maxSearches: 6, effort: 'medium', modelName: ESCALATION_MODEL(),
      });
      if (!reply) return null;
      cost += reply.cost || 0;
      searches += reply.searches || 0;
      for (const s of reply.sources || []) sources.set(s.url, s.title || '');
      for (const r of (reply.data && reply.data.rulings) || []) rulings.set(Number(r.flag), r);
    } catch (err) {
      console.warn(`facts: the judge call failed (${err.status || ''} ${String(err.message || err).slice(0, 160)})`);
      return null;
    }
  }

  // Every claim with its verdict; confirmed flags fail.
  const out = claims.map((c) => ({ where: c.where, claim: c.claim, kind: c.kind, verdict: 'verified', evidence: 'cascade', source_url: '', truth: '' }));
  flags.forEach((f, i) => {
    const r = rulings.get(i);
    if (!r || r.verdict !== 'error') return;
    stages.confirmed++;
    if (r.source_url) sources.set(r.source_url, sources.get(r.source_url) || '');
    const failed = { where: f.where, claim: f.claim, kind: 'fact', verdict: r.kind || 'false', evidence: `judge after ${f.by}`, source_url: String(r.source_url || ''), truth: String(r.truth || f.why).slice(0, 400) };
    const same = out.find((c) => c.where === f.where && c.claim === f.claim);
    if (same) Object.assign(same, failed); else out.push(failed);
  });
  const result = blockLevels.readVerification({ claims: out });
  return { ...result, usage: {}, cost: Number(cost.toFixed(5)), sources: [...sources].map(([url, title]) => ({ url, title })), searches, model: `cascade (${cheapModel().model} + local + ${ESCALATION_MODEL()})`, stages };
}

/**
 * The free checks, as hints for a full verifier ("thorough" mode in
 * services/block-levels.js): Sonnet still reads every claim, and is told what
 * these cheaper readers flagged so it rules on each one too. Measured on
 * 2026-10-21, MiniMax reading per block and the whole lesson found real errors
 * Sonnet had missed (a contrast block whose examples need two different boards).
 *
 *   - MiniMax (or Haiku after the free window) reads the whole lesson for
 *     contradictions, and verifies each block on its own, claim by claim;
 *   - the blind test answers every multiple-choice and typed check without its key;
 *   - the local checkers judge factual sentences against the unit's sources: a
 *     claim both stage-1 checkers doubt goes to stage 2 only when the sources
 *     clearly cover its subject (at most 12, since stage 2 takes up to a minute a
 *     claim), and is a hint only when stage 2 finds it contradicted or ungrounded.
 *
 * Returns { flags: [{ where, claim, why, by }], cost, stages }.
 */
async function hintFlags({ context, blocks, checks, trackId, gradeId, level, factSheet = null, localChecks = true }) {
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  let cost = 0;
  const stages = { read_problems: 0, block_flags: 0, blind_flags: 0, local_checked: 0, local_flags: 0 };
  const flags = [];
  const lessonText = blockLevels.verifyRequest({ context, blocks, checks }).user;

  // The whole lesson, read for contradictions.
  const read = await cheap({ system: READ_SYSTEM, user: lessonText, schema: READ_SCHEMA, schemaName: 'submit_problems', task: 'fact_read' });
  if (read) cost += read.cost;
  for (const p of ((read && read.data && read.data.problems) || []).filter((x) => x && x.claim)) {
    flags.push({ where: String(p.where || ''), claim: String(p.claim).slice(0, 400), why: `${p.problem || ''}${p.truth ? ` (true: ${p.truth})` : ''}`, by: 'read-through' });
    stages.read_problems++;
  }

  // Each block on its own, claim by claim, with the lesson around it as context.
  const verifyReq = blockLevels.verifyRequest({ context, blocks, checks });
  const perBlock = await pool(blocks, 4, async (b) => {
    const r = await cheap({
      system: verifyReq.system,
      user: `${verifyReq.user}\n\nThis time list and verify ONLY the claims in BLOCK ${b.index} (use the rest of the level only as context). Wrong quiz options are meant to be wrong: judge their feedback, not that they are wrong.`,
      schema: verifyReq.schema,
      schemaName: 'submit_verification',
      task: 'fact_verify',
    });
    if (r) cost += r.cost;
    return r && r.data ? blockLevels.readVerification(r.data).failed : [];
  });
  for (const c of perBlock.flat()) {
    flags.push({ where: c.where, claim: c.claim, why: `${c.verdict}: ${c.truth}`, by: 'block check' });
    stages.block_flags++;
  }

  // The blind test.
  const askable = checks.filter((c) => c.format === 'multiple_choice' || c.format === 'type_in');
  if (askable.length) {
    const blind = await blindAnswers({ askable, context, trackId });
    if (blind) cost += blind.cost;
    for (const a of (blind && blind.data && blind.data.answers) || []) {
      const c = askable.find((x) => x.index === Number(a.index));
      if (!c) continue;
      const keys = [c.answer, ...(c.accepts || [])].map(norm);
      if (!keys.includes(norm(a.answer)) || a.more_than_one_right) {
        flags.push({ where: `check ${c.index}`, claim: `${c.prompt} → key: ${c.answer}`, why: `a student answering without the key chose "${a.answer}"${a.more_than_one_right ? ' and thought more than one option could be right' : ''}`, by: 'blind test' });
        stages.blind_flags++;
      }
    }
  }

  // The local checkers, on the factual sentences of the lesson, against the unit's sources.
  let poolRow = factSheet && (factSheet.facts || []).length ? factSheet : null;
  if (!poolRow) {
    const got = await unitPool({ trackId, gradeId, level, context }).catch(() => null);
    poolRow = got && got.pool;
    if (got && got.fresh) cost += got.pool.cost || 0;
  }
  if (localChecks && poolRow && await checkersReady()) {
    const sentences = [];
    for (const b of blocks) {
      for (const text of JSON.stringify(b.data).match(/"([^"\\]|\\.){25,400}"/g) || []) {
        const s = text.slice(1, -1).replace(/\\"/g, '"');
        if (/[a-z]{3,}.*\s.*[a-z]{3,}/i.test(s) && !/^https?:/.test(s)) sentences.push({ where: `block ${b.index}`, claim: s });
      }
    }
    // Pool only here: these results can raise flags, and offline text must never do that.
    const overlap = async (claim) => {
      const doc = await documentFor(claim, poolRow, 3);
      const words = new Set(norm(claim).split(' ').filter((w) => w.length > 3));
      return { doc, shared: [...words].filter((w) => norm(doc).includes(w)).length };
    };
    const covered = (await Promise.all(sentences.map(async (s) => ({ ...s, ...(await overlap(s.claim)) })))).filter((s) => s.doc && s.shared >= 3);
    try {
      const s1 = await checkers('stage1', covered.map(({ doc, claim }) => ({ doc, claim })));
      stages.local_checked = s1.length;
      const doubted = covered.filter((_, k) => s1[k] && s1[k].factcg < 0.5 && s1[k].minicheck < 0.5)
        .sort((a, b) => b.shared - a.shared).slice(0, 12);
      const s2 = await checkers('stage2', doubted.map(({ doc, claim }) => ({ doc, claim })));
      s2.forEach((r, k) => {
        if (r.granite === 'ungrounded' || /INTRINSIC/.test(r.halluguard)) {
          flags.push({ where: doubted[k].where, claim: doubted[k].claim.slice(0, 400), why: `the unit's sources do not support it (Granite: ${r.granite}, HalluGuard: ${r.halluguard})${r.why ? `: ${r.why.slice(0, 200)}` : ''}`, by: 'local checkers' });
          stages.local_flags++;
        }
      });
    } catch (err) {
      console.warn(`facts: the local checkers failed (${err.message}); going on without them`);
    }
  }
  return { flags, cost: Number(cost.toFixed(5)), stages };
}

module.exports = { cascadeVerify, hintFlags, unitPool, unitOf, documentFor, cheapModel, checkersReady, offlineSecondChance, localAnswer, POOLS };
