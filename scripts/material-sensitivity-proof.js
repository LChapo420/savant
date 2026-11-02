/**
 * Per-measure counterfactual sensitivity: does each scorecard measure change the material it should, in the right direction,
 * without losing a fact?
 *
 *   node scripts/material-sensitivity-proof.js --mock                          offline: the structural matrix (every measure x every
 *                                                                              surface, low against high) and the harness end to end
 *   node scripts/material-sensitivity-proof.js --live --phase pilot --kinds lesson,notes --tag pilot-v2 --cache FILE
 *   node scripts/material-sensitivity-proof.js --live --phase full  --kinds lesson,notes,podcast,test,pack,path --top 30
 *   node scripts/material-sensitivity-proof.js --live --phase joint --kinds lesson,notes
 *   node scripts/material-sensitivity-proof.js --live --phase speed --kinds lesson,notes
 *   add --depth off to run version 1 of the spec block (LEARNING_SPEC_DEPTH=off), for the before and after
 *
 * Method (single measures). A base learner (age 14, interests basketball and video games, nothing else known) is copied twice; one
 * copy has ONE measure set LOW (10) and the other HIGH (90), both at the confidence of a settled measure; everything else is equal.
 * The same base text is turned into the same kind of material for both, through the app's real generator. A blind judge sees the two
 * outputs in random order (A and B), the measure's own definition (what a low and a high learner are like, from stats.js) and the
 * base text, and says which version was written for the HIGH learner (or "same"). It also checks each version against the base text:
 * accuracy, and which of the topic's key points are missing. Plain code checks key-point coverage too (term overlap).
 *
 *   direction-correct rate   share of judge verdicts that name the high learner's version (a "same" counts as not correct)
 *   content intact           both versions keep every key point (judge and code) and the judge finds no false statement
 *
 * Joint profiles move four measures at once (mixed directions) against the mirror profile (all four flipped); the judge names the
 * high version for each of the four. The speed phase compares tailored with generic material for learner types who need less (or
 * more): words, estimated minutes, and a blind rubric (accuracy, every objective covered, fit).
 *
 * Models (free first; the learners are synthetic, so no learner data goes anywhere): writer MiniMax M3.1 Flash on xKiro (the
 * account's free token grant, pipeline use, reasoning low); judges Mistral Large 3 (xKiro free tier) and Gemini 3.5 Flash Lite (the
 * Gemini key's free tier): two families, neither the writer's. Every result is AI-judged on simulated learners, not real-learner proof.
 *
 * Flags: --phase pilot|full|joint|speed, --kinds a,b, --measures a,b (or --top N by impact), --judges mistral,gemini,
 * --concurrency N, --tag NAME, --cache FILE, --depth off, --out FILE.md, --json FILE.
 *
 * Added 2 Nov 2026 (depth-75): --plant swap (joint: the profile's and the mirror's texts are swapped, so every pair is planted the wrong way round; the
 * judges must name the other version, and the run prints how many they caught), --judges also takes command, qwen37, mistralm (xKiro) and nemotron,
 * mistral4, minimax (NVIDIA build, free); the four measures of a profile and the judges are asked at once. Control files next to the cache file:
 * SC_STOP (no Standard Compute writes), NO_JUDGE (no judging), XKIRO_DOWN (judges qwen and mistral answered by the NVIDIA ones). PROOF_DEBUG_JUDGE=FILE
 * appends every raw judge answer to FILE.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);
function arg(name, def = null) {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
}
const LIVE_FLAG = argv.includes('--live');
if (arg('depth') === 'off') process.env.LEARNING_SPEC_DEPTH = 'off';
if (LIVE_FLAG) {
  // xKiro: pipeline use only, our own usage record, a cap on the free tier under the plan's daily limit (other runs share it), and a
  // cap on the MiniMax grant this run may use.
  process.env.XKIRO_PIPELINE = '1';
  process.env.XKIRO_DAILY_TOKENS = process.env.XKIRO_DAILY_TOKENS || '600000';
  process.env.XKIRO_GRANTS = process.env.XKIRO_GRANTS || JSON.stringify({ 'minimax/minimax-m3.1-flash': 12000000 });
  // The free plan allows few requests at once: this run backs off itself (gated below) instead of resting a model for ten minutes.
  process.env.XKIRO_REST_MS = '0';
  process.env.XKIRO_RETRIES = '2';
}
// A second or third sample of the same cases (--rep N) must also rewrite the lessons, which the base proof caches by prompt.
if (Number(arg('rep', 1)) > 1) process.env.PROOF_REP = `r${Number(arg('rep'))}`;
const base = require('./scorecard-modification-proof');
const K = require('./lib/material-proof-kinds');

const { LIVE, MOCK, db, ls, providers, TOPICS, TOPIC_IDS, STATS, cache, sha, limited, spend } = base;
const depthLib = require('../services/learning-depth');
const { BY_ID } = require('../services/scorecard/stats');

const PHASE = arg('phase', MOCK ? 'mock' : 'pilot');
const TAG = arg('tag', `${PHASE}-${process.env.LEARNING_SPEC_DEPTH === 'off' ? 'v1' : 'v2'}`);
const DEPTH = process.env.LEARNING_SPEC_DEPTH === 'off' ? 'v1' : 'v2';
const CONCURRENCY = Number(arg('concurrency', 3));
const ROOT = path.join(__dirname, '..');
const OUT_JSON = arg('json', MOCK ? path.join(os.tmpdir(), `sensitivity-mock-${process.pid}.json`) : path.join(ROOT, 'docs', 'material-depth', `sensitivity-${TAG}.json`));
const LO = 10;
const HI = 90;

// ── which measures ──────────────────────────────────────────────────────────
// The pilot: the highest-impact measure of every group (two in intake), the kind of change each makes is different.
const PILOT = ['vocabulary_ceiling', 'working_memory_span', 'deductive_trajectory', 'attention_runway', 'interest_transfer', 'generation_effect',
  'productive_struggle', 'structure_need', 'worked_example_dependence', 'evaluation_anxiety', 'prior_knowledge'];
/** Every measure ranked by how much it changes teaching (stats.js impact), groups interleaved so the first N cover every group. */
function byImpact() {
  const groups = {};
  for (const s of STATS) (groups[s.category] = groups[s.category] || []).push(s);
  for (const g of Object.values(groups)) g.sort((a, b) => b.impact - a.impact || a.id.localeCompare(b.id));
  const out = [];
  for (let imp = 3; imp >= 0; imp--) {
    let added = true;
    while (added) {
      added = false;
      for (const g of Object.values(groups)) {
        const next = g.find((s) => s.impact === imp && !out.includes(s.id));
        if (next) { out.push(next.id); added = true; }
      }
    }
  }
  return out;
}
function chosenMeasures() {
  if (arg('measures')) return arg('measures').split(',').filter(Boolean);
  if (PHASE === 'pilot') return PILOT;
  const ranked = byImpact();
  const top = Number(arg('top', 30));
  // The pilot's measures stay in, then the rest by impact.
  return [...PILOT, ...ranked.filter((m) => !PILOT.includes(m))].slice(0, Math.max(top, 1));
}
const KINDS = arg('kinds', 'lesson,notes').split(',').filter(Boolean);
for (const k of KINDS) if (!K.KINDS.includes(k)) { console.error(`unknown kind ${k}`); process.exit(2); }
// A topic for each measure where the measure has something to act on; otherwise the topics in turn.
const TOPIC_FOR = { notation_comfort: 'two-step equations', logical_rigor: 'two-step equations', worked_example_dependence: 'two-step equations', productive_struggle: 'two-step equations', step_explicitness: 'two-step equations', structure_need: 'two-step equations', causal_chain_depth: 'causes of World War I', narrative_pull: 'causes of World War I', interference_susceptibility: 'Spanish greetings' };
const topicFor = (m, i) => TOPIC_FOR[m] || TOPIC_IDS[i % TOPIC_IDS.length];

// ── the learners ────────────────────────────────────────────────────────────
const BASE_LEARNER = { age: 14, survey: { interests: 'basketball, video games', hobbies: 'drawing comics' } };
const userCache = new Map();
function userFor(name, stats) {
  if (!userCache.has(name)) userCache.set(name, base.makeUser({ name, ...BASE_LEARNER, stats, blurb: name }));
  return userCache.get(name);
}

// ── the writer and the judges ───────────────────────────────────────────────
// --writer-model: another xKiro model when MiniMax is at capacity (1 Nov 2026 it answered 503 for hours); before and after must use the same one.
const WRITER_MODEL = arg('writer-model', 'minimax/minimax-m3.1-flash');
/** At most XKIRO_AT_ONCE xKiro calls in flight from this run (the account's own limit is small), each retried after a wait on a 429. */
const XKIRO_AT_ONCE = Number(process.env.XKIRO_AT_ONCE || 2);
let inFlight = 0;
const waiting = [];
async function gated(fn) {
  if (inFlight >= XKIRO_AT_ONCE) await new Promise((res) => { waiting.push(res); });
  inFlight += 1;
  try {
    for (let attempt = 0; ; attempt++) {
      try { return await fn(); } catch (e) { // eslint-disable-line no-await-in-loop
        const busy = e.status === 429 || e.status === 503 || /429|503|no model answered|Too many|at capacity/i.test(String(e.message));
        // An unusable reply (bad JSON for the schema) is tried once more at once, as the app's own providers do.
        const unusable = /unusable/i.test(String(e.message)) && attempt < 1;
        if ((!busy && !unusable) || attempt >= 5) throw e;
        if (busy) await new Promise((res) => { setTimeout(res, 15000 * (attempt + 1)); }); // eslint-disable-line no-await-in-loop
      }
    }
  } finally { inFlight -= 1; const next = waiting.shift(); if (next) next(); }
}
const usage = { writerCalls: 0, writerIn: 0, writerOut: 0, judgeCalls: { }, judgeTokens: {}, errors: {} };
// --writer sc: Standard Compute DeepSeek V4.1 Flash through the ledger (base.makeScWriter, ceilingUsd 38), stopped at --budget USD
// for this run. Used for the kinds that take many calls (a course build, a pack) when the free writer is too slow for them.
const WRITER = arg('writer', 'xkiro');
const BUDGET = Number(arg('budget', 2));
function installWriter() {
  if (WRITER === 'sc') {
    const w = base.makeScWriter();
    const raw = w.structured.bind(w);
    w.structured = async (a) => {
      if (spend.scUsd >= BUDGET) throw new Error(`budget $${BUDGET} reached`);
      // A file named SC_STOP next to the cache file stops every Standard Compute write of a run that starts after it appears (a way to halt a driver script without a kill).
      if (arg('cache') && fs.existsSync(path.join(path.dirname(arg('cache')), 'SC_STOP'))) throw new Error('Standard Compute writes stopped (SC_STOP)');
      const r = await raw(a);
      usage.writerCalls += 1; usage.writerIn += (r.usage && r.usage.input_tokens) || 0; usage.writerOut += (r.usage && r.usage.output_tokens) || 0;
      return r;
    };
    process.env.AI_POOL = '0';
    providers.chain = () => [w];
    providers.isOutside = () => false;
    return;
  }
  if (WRITER === 'nvidia') {
    // NVIDIA build, free: used on 1 Nov 2026 when xKiro's MiniMax was at capacity and its free quota was spent. Before and after use the same writer.
    const nv = require('../services/providers/nvidia'); // eslint-disable-line global-require
    const w = {
      name: 'nvidia_proof', outside: true, isEnabled: () => true, costCents: () => 0, describeError: (e) => e.message,
      async structured(a) {
        const r = await gated(() => nv.structured({ role: a.role, task: a.task, system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: a.maxTokens, models: [WRITER_MODEL], timeoutMs: 360000 }));
        usage.writerCalls += 1; usage.writerIn += (r.usage && r.usage.input_tokens) || 0; usage.writerOut += (r.usage && r.usage.output_tokens) || 0;
        const ctx = base.als.getStore(); if (ctx) ctx.models.push(WRITER_MODEL);
        return r;
      },
    };
    process.env.AI_POOL = '0';
    providers.chain = () => [w];
    providers.isOutside = () => false;
    return;
  }
  const { xkiro } = require('../services/providers/xkiro'); // eslint-disable-line global-require
  const w = {
    name: 'xkiro_minimax_proof', outside: true, isEnabled: () => true, costCents: () => 0,
    describeError: (e) => e.message,
    async structured(a) {
      const r = await gated(() => xkiro.structured({ ...a, models: [WRITER_MODEL], reasoningEffort: 'low', timeoutMs: 360000 }));
      usage.writerCalls += 1; usage.writerIn += (r.usage && r.usage.input_tokens) || 0; usage.writerOut += (r.usage && r.usage.output_tokens) || 0;
      const ctx = base.als.getStore(); if (ctx) ctx.models.push(WRITER_MODEL);
      return r;
    },
  };
  process.env.AI_POOL = '0';
  providers.chain = () => [w];
  providers.isOutside = () => false;
}
function installMockWriter() {
  const fake = { name: 'mock', isEnabled: () => true, costCents: () => 0, structured: async (req) => ({ data: base.mockWriter(req), model: 'mock-writer', usage: null }) };
  providers.chain = () => [fake];
  providers.isOutside = () => false;
}

async function geminiChat(model, system, user) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('no Gemini key');
  for (let attempt = 0; attempt < 4; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(180000), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0, maxOutputTokens: 2500, responseMimeType: 'application/json' } }),
    });
    if (r.status === 429 || r.status === 503) { await new Promise((res) => { setTimeout(res, 20000 * (attempt + 1)); }); continue; } // eslint-disable-line no-await-in-loop
    const j = await r.json().catch(() => ({})); // eslint-disable-line no-await-in-loop
    if (r.status !== 200) throw new Error(`gemini ${r.status}: ${JSON.stringify(j.error || {}).slice(0, 120)}`);
    const u = j.usageMetadata || {};
    usage.judgeTokens[model] = (usage.judgeTokens[model] || 0) + (u.totalTokenCount || 0);
    return ((((j.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('');
  }
  throw new Error('gemini: rate limited');
}
// NVIDIA build (free, fast for the non-reasoning models): used as judges on 2 Nov 2026, when xKiro's daily free quota, Gemini's free quota and Sol's key were all spent.
async function nvidiaChat(model, system, user) {
  const nv = require('../services/providers/nvidia'); // eslint-disable-line global-require
  const r = await gated(() => nv.chat({ role: 'fast', system, messages: [{ role: 'user', content: user }], maxTokens: 2500, model, effort: 'off', timeoutMs: 180000 }));
  return r.text;
}
async function xkiroChat(model, system, user) {
  const { xkiro } = require('../services/providers/xkiro'); // eslint-disable-line global-require
  const r = await gated(() => xkiro.chat({ system, messages: [{ role: 'user', content: user }], models: [model], maxTokens: 2500, timeoutMs: 240000 }));
  return r.text;
}
// Modelflare Sol (gpt-6.1-sol): a judge of a third family, used when xKiro's free quota is spent. The key is read from the .env file here because the
// scorecard proof's setup blanks the Modelflare keys for the app path.
async function solChat(system, user) {
  const key = require('dotenv').parse(fs.readFileSync('C:/coding/claudecommittdIq/folderThing/.env')).MODELFLARE_LUNA_API_KEY; // eslint-disable-line global-require
  if (!key) throw new Error('no Modelflare key');
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${(process.env.MODELFLARE_BASE_URL || 'https://modelflare.dev/v1').replace(/\/$/, '')}/chat/completions`, { // eslint-disable-line no-await-in-loop
      method: 'POST', signal: AbortSignal.timeout(180000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-6.1-sol', temperature: 0, max_tokens: 2500, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (r.status === 429 || r.status === 503) { await new Promise((res) => { setTimeout(res, 15000 * (attempt + 1)); }); continue; } // eslint-disable-line no-await-in-loop
    const j = await r.json().catch(() => ({})); // eslint-disable-line no-await-in-loop
    if (r.status !== 200) throw new Error(`modelflare ${r.status}`);
    const u = j.usage || {}; usage.judgeTokens['gpt-6.1-sol'] = (usage.judgeTokens['gpt-6.1-sol'] || 0) + (u.total_tokens || 0);
    return (((j.choices || [])[0] || {}).message || {}).content || '';
  }
  throw new Error('modelflare: rate limited');
}
const ALL_JUDGES = {
  sol: { id: 'gpt-6.1-sol', family: 'openai', call: (s, u) => solChat(s, u) },
  mistral: { id: 'mistralai/mistral-large-2512', family: 'mistral', call: (s, u) => xkiroChat('mistralai/mistral-large-2512', s, u) },
  gemini: { id: 'gemini-3.5-flash-lite', family: 'google', call: (s, u) => geminiChat('gemini-3.5-flash-lite', s, u) },
  qwen: { id: 'qwen/qwen3.8-max:free', family: 'alibaba', call: (s, u) => xkiroChat('qwen/qwen3.8-max:free', s, u) },
  cohere: { id: 'cohere/command-a-plus', family: 'cohere', call: (s, u) => xkiroChat('cohere/command-a-plus', s, u) },
  // 2 Nov (depth-75): Sol's key answered 401 and Gemini's free quota ran out, so two more xKiro free judges of other families.
  command: { id: 'cohere/command-a', family: 'cohere', call: (s, u) => xkiroChat('cohere/command-a', s, u) },
  qwen37: { id: 'qwen/qwen3.7-max:free', family: 'alibaba', call: (s, u) => xkiroChat('qwen/qwen3.7-max:free', s, u) },
  mistralm: { id: 'mistralai/mistral-medium-3.5', family: 'mistral', call: (s, u) => xkiroChat('mistralai/mistral-medium-3.5', s, u) },
};
ALL_JUDGES.nemotron = { id: 'nvidia/nemotron-3-ultra-550b-a55b', family: 'nvidia', call: (s, u) => nvidiaChat('nvidia/nemotron-3-ultra-550b-a55b', s, u) };
ALL_JUDGES.minimax = { id: 'minimaxai/minimax-m3.1-flash', family: 'minimax', call: (s, u) => nvidiaChat('minimaxai/minimax-m3.1-flash', s, u) };
ALL_JUDGES.mistral4 = { id: 'mistralai/mistral-large-4-1t-a52b', family: 'mistral', call: (s, u) => nvidiaChat('mistralai/mistral-large-4-1t-a52b', s, u) };
// While a file named XKIRO_DOWN sits next to the cache file (or PROOF_XKIRO_DOWN names one), the xKiro judges qwen and mistral are answered by the NVIDIA ones
// instead (the records carry the real model ids).
const DOWN_FILE = process.env.PROOF_XKIRO_DOWN || (arg('cache') ? path.join(path.dirname(arg('cache')), 'XKIRO_DOWN') : null);
if (DOWN_FILE && fs.existsSync(DOWN_FILE)) { ALL_JUDGES.qwen = ALL_JUDGES.nemotron; ALL_JUDGES.mistral = ALL_JUDGES.mistral4; }
const JUDGES = arg('judges', 'mistral,gemini').split(',').map((j) => ALL_JUDGES[j]).filter(Boolean);
// Joint profiles: how the four measures are put to the judge. 'each' (default): one call per measure, the other three named as
// explanations and not judged; 'together': one call, told to judge each measure alone; 'old': the first wording (the recorded run).
const JOINT_JUDGE = arg('joint-judge', 'each');
// --rep N: a fresh writing of everything (the cache key carries it), for a second and third sample of the same profiles; 1 is the original key.
const REP = Number(arg('rep', 1)) === 1 ? 'r1' : `r${Number(arg('rep'))}`;
// --replay FILE: judge the texts recorded in an earlier joint run (its `texts`) instead of writing new ones, so a change of judge is
// measured on the same writing.
// --plant swap: the profile's text and the mirror's are swapped before judging, so every pair is a text planted the wrong way round. A judge that
// reads the texts must now name the other version (the harness counts that as "wrong" and the report calls it caught); a judge that is fooled names
// the planted one (counted correct), and one that cannot tell says same. Run on the same texts as the real run (--replay), it checks that the
// verdicts follow the writing and not the position, the length or the judge's habit.
const PLANT = arg('plant');
if (PLANT && PLANT !== 'swap') { console.error('--plant takes: swap'); process.exit(2); }
const REPLAY = arg('replay') ? Object.values(JSON.parse(fs.readFileSync(arg('replay'), 'utf8')).texts) : null;

// ── building one kind for one user ─────────────────────────────────────────
const materials = require('../services/materials');
const notesSvc = require('../services/material-notes');
const podcastSvc = require('../services/material-podcast');
const packSvc = require('../services/material-pack');
const courseSvc = require('../services/course-builder');
const testSvc = require('../services/material-test');
const llm = (a) => base.ai.structuredDetail(a);

/** The block(s) the kind's generator puts in its prompt for this user (what must differ between low and high). */
function blockFor(kind, userId, topicId) {
  const topic = TOPICS[topicId].title;
  if (kind === 'lesson') return [...base.legacyLines(userId), ...ls.specToLines(ls.buildSpec(userId, { topic: topicId, trackId: null }), { surface: 'lesson' })].join('\n');
  const spec = ls.buildSpec(userId, { topic });
  if (kind === 'notes') return ls.specToPrompt(spec, { surface: 'notes' });
  if (kind === 'podcast') return ls.specToPrompt(spec, { surface: 'podcast' });
  if (kind === 'test') return ls.specToLines(spec, { surface: 'test', bare: true }).join('\n');
  return `${ls.specToPrompt(spec, { surface: 'material' })}\n${ls.specToLines(spec, { surface: 'test', bare: true }).join('\n')}`; // pack, path
}

const matCache = new Map();
function matFor(user, topicId) {
  const k = `${user.id}|${topicId}`;
  if (!matCache.has(k)) {
    const r = materials.addPaste(user.id, TOPICS[topicId].title, K.BASE_TEXTS[topicId]);
    if (!r || !r.value) throw new Error(`could not add material: ${JSON.stringify(r).slice(0, 120)}`);
    matCache.set(k, r.value);
  }
  return matCache.get(k);
}
const courses = new Map();
function courseFor(user, topicId) {
  const k = `${user.id}|${topicId}`;
  if (!courses.has(k)) courses.set(k, (async () => { const r = await courseSvc.build(user.id, matFor(user, topicId).id, { llm, force: true }); return r.course ? r.course : { error: r.error || r.code }; })());
  return courses.get(k);
}
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

async function buildKind(kind, lrn, user, topicId) {
  try {
    if (kind === 'lesson') {
      const spec = ls.buildSpec(user.id, { topic: topicId, trackId: null });
      const g = await base.generate('spec', lrn, user.id, topicId, spec);
      if (!g || !g.lesson) return { error: (g && g.error) || 'no lesson' };
      return { text: base.lessonDisplay(g.lesson), measureText: base.lessonText(g.lesson), checks: (g.lesson.check_questions || []).length };
    }
    const mat = matFor(user, topicId);
    const spec = ls.buildSpec(user.id, { topic: TOPICS[topicId].title });
    if (kind === 'notes') {
      const r = await notesSvc.build(user.id, mat.id, { llm, force: true });
      return r.notes ? { text: K.renderNotes(r.notes) } : { error: r.error || r.code };
    }
    if (kind === 'podcast') {
      const r = await podcastSvc.build(user.id, mat.id, { kind: 'overview', llm, force: true });
      return r.episode ? { text: K.renderPodcast(r.episode, spec), measureText: r.episode.turns.map((t) => t.text).join(' ') } : { error: r.error || r.code };
    }
    if (kind === 'pack') {
      const r = await packSvc.build(user.id, mat.id, { llm, force: true });
      return r.pack ? { text: K.renderPack(r.pack) } : { error: r.error || r.code };
    }
    const course = await courseFor(user, topicId);
    if (course.error) return { error: course.error };
    if (kind === 'path') return { text: K.renderPath(course) };
    if (kind === 'test') {
      const opts = testSvc.options(user.id, mat.id);
      if (opts.error) return { error: opts.error };
      const t = testSvc.start(user.id, mat.id, { timed: false, random: rng(7) });
      if (t.error) return { error: t.error };
      const byQ = new Map(course.skills.flatMap((s) => s.questions.map((q) => [q.id, q])));
      const questions = t.questions.map((q) => { const full = byQ.get(q.id) || {}; return { ...full, id: q.id, tier: q.tier, type: q.type, prompt: q.prompt, choices: q.choices || full.choices }; });
      return { text: K.renderTest({ questions, timed_seconds: opts.seconds_per_question, suggest_timed: opts.suggest_timed }), measureText: questions.map((q) => `${q.prompt} ${q.explanation || ''}`).join(' ') };
    }
    return { error: `unknown kind ${kind}` };
  } catch (e) {
    return { error: `${kind}: ${e.message}` };
  }
}
const artifactsInFlight = new Map();
async function artifact(kind, lrn, user, topicId) {
  const block = blockFor(kind, user.id, topicId);
  const ck = `sens:${kind}:${topicId}:${sha(JSON.stringify([block, K.BASE_TEXTS[topicId], REP]))}`;
  const hit = LIVE ? cache.get(ck) : null;
  if (hit && hit.text) return { ...hit, cached: true };
  // The generic version of a topic is one build for every learner who shares it (two at once for the same material came back "busy").
  if (artifactsInFlight.has(ck)) return artifactsInFlight.get(ck);
  const task = (async () => {
    const a = await buildKind(kind, lrn, user, topicId);
    if (LIVE && a.text) cache.set(ck, a);
    return a;
  })();
  artifactsInFlight.set(ck, task);
  return task;
}

// ── the judge ──────────────────────────────────────────────────────────────
const JUDGE_SYSTEM = 'You are a careful, blind evaluator of teaching material. You compare two versions of the same material and decide which learner each was written for, using only the evidence in the text. You never guess who or what wrote them. Reply with one JSON object only, no prose.';
const measureLine = (id) => { const s = BY_ID[id]; return `"${s.name}". A learner LOW on it: ${s.low}. A learner HIGH on it: ${s.high}.`; };
function pairPrompt(kind, topicId, measures, A, B, others = null) {
  const topic = TOPICS[topicId];
  const one = measures.length === 1;
  const hasOthers = !!(others && others.length);
  // Judge v2: first the difference, then which learner each version suits (LOW, HIGH or EITHER), so a judge cannot describe a version
  // as suiting the low learner and then name it as the high one's (the pilot's commonest judge slip).
  // Joint judge (material-weak): the same question asked about each measure on its own ('each': one call per measure, the other
  // measures named as explanations; 'together': one call, told to judge each measure alone). A difference that another listed measure
  // explains is not evidence about this one, so a judge says EITHER rather than crediting hints or length to the wrong measure. It is
  // not easier: EITHER still counts as not correct, and a wrong pick is still wrong. JOINT_JUDGE=old is the earlier wording.
  const together = !one && JOINT_JUDGE === 'together';
  const ask = one
    ? `First, in one sentence, say how the two versions differ in ways this measure would explain. Then say which learner each version suits better: "LOW", "HIGH", or "EITHER" if the versions do not differ in a way this measure explains.${hasOthers ? ' The two learners ALSO differ on the other measures listed above, so a difference that one of THOSE explains (and this measure does not) is not evidence about this measure: answer "EITHER" if that is all you can see.' : ''}`
    : together
      ? `The two learners differ on all of these measures at once, so one visible difference (more hints, shorter pieces, more examples) may belong to a different measure than the one you are judging. For EACH measure, separately: point to what each version actually does that THIS measure's own LOW or HIGH description would produce (a few words from each version), then say which learner each version suits better on that measure alone: "LOW", "HIGH", or "EITHER" if the only differences you see are better explained by another listed measure, or there are none.`
      : `For EACH measure: first say in a few words how the versions differ on it, then which learner each version suits better on that measure: "LOW", "HIGH", or "EITHER" if you cannot tell. (The learners differ on all of these measures at once.)`;
  const shape = one
    ? '"evidence": "one sentence: the difference in the text", "A_suits": "LOW" | "HIGH" | "EITHER", "B_suits": "LOW" | "HIGH" | "EITHER", "certainty": 1-5'
    : `"measures": { ${measures.map((m) => `"${m}": {"evidence": "a few words${together ? ' from A and from B' : ''}", "A_suits": "LOW" | "HIGH" | "EITHER", "B_suits": "LOW" | "HIGH" | "EITHER"}`).join(', ')} }`;
  return `Two versions, A and B, of the same ${K.KIND_INFO[kind].label.toLowerCase()} (${K.KIND_INFO[kind].what}) were made from the same base text for two learners who ${hasOthers ? `differ on ${others.length + 1} learning measures at once; judge the ONE below` : `are the same in every way except ${one ? 'ONE learning measure: one learner is LOW on it and the other HIGH' : `these ${measures.length} learning measures`}`}.

${one ? 'THE MEASURE' : 'THE MEASURES'}${hasOthers ? ' TO JUDGE' : ''}:
${measures.map((m, i) => `${one ? '' : `${i + 1}. [${m}] `}${measureLine(m)}`).join('\n')}
${hasOthers ? `\nTHE OTHER MEASURES the two learners also differ on (do not judge these; they only explain differences that are not this measure's):\n${others.map((m) => `- ${measureLine(m)}`).join('\n')}\n` : ''}
BASE TEXT (the only source of facts):
<<<
${K.BASE_TEXTS[topicId]}
>>>

KEY POINTS every version must keep:
${topic.keyFacts.map((k, i) => `${i + 1}. ${k}`).join('\n')}

VERSION A:
<<<
${A}
>>>

VERSION B:
<<<
${B}
>>>

${ask}
Then check EACH version against the base text: its accuracy (10 = no false or distorted statement; list any false statement) and which key points (by number) are missing or wrong in it.

Return this JSON: { ${shape}, "A": {"accuracy": 0-10, "errors": ["..."], "missing": [numbers]}, "B": {"accuracy": 0-10, "errors": ["..."], "missing": [numbers]} }`;
}
function parseVerdict(text, measures) {
  const v = base.parseJsonLoose(text);
  if (!v || typeof v !== 'object') return null;
  // From the two "suits" answers to the version written for the HIGH learner: one HIGH and the other LOW or EITHER names it; one LOW
  // and the other EITHER names the other; both the same (or both EITHER) is "same" (cannot tell).
  const suit = (x) => { const s = String(x || '').trim().toUpperCase(); return s.startsWith('HIGH') ? 'H' : s.startsWith('LOW') ? 'L' : s.startsWith('EITHER') || s.startsWith('SAME') || s.startsWith('BOTH') || s.startsWith('NEITHER') ? 'E' : null; };
  const pick = (o) => {
    if (!o) return null;
    const a = suit(o.A_suits); const b = suit(o.B_suits);
    if (!a || !b) return null;
    if (a === b) return 'same';
    if (a === 'H') return 'A';
    if (b === 'H') return 'B';
    return a === 'L' ? 'B' : 'A';
  };
  const side = (o) => ({ accuracy: Number.isFinite(Number(o && o.accuracy)) ? Math.max(0, Math.min(10, Number(o.accuracy))) : null, errors: Array.isArray(o && o.errors) ? o.errors.map(String).filter(Boolean).slice(0, 6) : [], missing: Array.isArray(o && o.missing) ? o.missing.map(Number).filter((n) => n >= 1 && n <= 10) : [] });
  const out = { A: side(v.A), B: side(v.B) };
  if (measures.length === 1) {
    const p = pick(v);
    if (!p) return null;
    out.picks = { [measures[0]]: p };
    out.certainty = Number(v.certainty) || null;
    out.evidence = String(v.evidence || '').slice(0, 240);
  } else {
    if (!v.measures || typeof v.measures !== 'object') return null;
    out.picks = {};
    for (const m of measures) { const p = pick(v.measures[m]); if (!p) return null; out.picks[m] = p; }
    out.evidence = measures.map((m) => `${m}: ${String((v.measures[m] || {}).evidence || '').slice(0, 80)}`).join('; ');
  }
  if (out.A.accuracy === null || out.B.accuracy === null) return null;
  return out;
}
async function judgeOnce(judge, prompt, measures) {
  const k = `sensj2:${judge.id}:${sha(prompt)}`;
  const hit = LIVE ? cache.get(k) : null;
  if (hit) return hit;
  // A file named NO_JUDGE next to the cache file turns off judging for runs that start after it appears (texts are still written and cached; judge later).
  if (LIVE && arg('cache') && fs.existsSync(path.join(path.dirname(arg('cache')), 'NO_JUDGE'))) return { error: 'judging skipped (NO_JUDGE)' };
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await judge.call(JUDGE_SYSTEM, prompt); // eslint-disable-line no-await-in-loop
      usage.judgeCalls[judge.id] = (usage.judgeCalls[judge.id] || 0) + 1;
      if (process.env.PROOF_DEBUG_JUDGE) fs.appendFileSync(process.env.PROOF_DEBUG_JUDGE, `${JSON.stringify({ judge: judge.id, measures, prompt: prompt.slice(prompt.indexOf('VERSION A:') - 20, prompt.indexOf('VERSION A:')), raw: String(text).slice(0, 700) })}
`);
      const v = parseVerdict(text, measures);
      if (v) { if (LIVE) cache.set(k, v); return v; }
      last = new Error(`unusable verdict: ${String(text).slice(0, 160)}`);
    } catch (e) { last = e; }
  }
  usage.errors[judge.id] = (usage.errors[judge.id] || 0) + 1;
  return { error: String(last && last.message).slice(0, 200) };
}
/** The mock judge reads the code's view: the version with the higher share of the high learner's block sentences. Proves the harness only. */
function mockJudge(measures) {
  return { picks: Object.fromEntries(measures.map((m) => [m, 'same'])), A: { accuracy: 10, errors: [], missing: [] }, B: { accuracy: 10, errors: [], missing: [] }, evidence: 'mock' };
}

/** Joint profile, one call per measure (the other measures named as explanations); the four answers are merged into one verdict. */
async function judgeEach(judge, kind, topicId, measures, A, B) {
  // The four measures are asked at once (each its own call; the xKiro/NVIDIA gate limits how many are in flight): the judges' free queues were the slow part.
  const parts = await Promise.all(measures.map((m) => judgeOnce(judge, pairPrompt(kind, topicId, [m], A.text, B.text, measures.filter((x) => x !== m)), [m])));
  const bad = parts.find((p) => p.error);
  if (bad) return bad;
  const merge = (k) => ({ accuracy: Math.min(...parts.map((p) => p[k].accuracy)), errors: [...new Set(parts.flatMap((p) => p[k].errors))].slice(0, 6), missing: [...new Set(parts.flatMap((p) => p[k].missing))] });
  return { picks: Object.fromEntries(measures.map((m, i) => [m, parts[i].picks[m]])), A: merge('A'), B: merge('B'), evidence: measures.map((m, i) => `${m}: ${String(parts[i].evidence || '').slice(0, 80)}`).join('; ') };
}

/** Judge one pair: hiArt is the high learner's version; the order shown is shuffled by a seed from the pair. Returns per-judge verdicts. */
async function judgePair(kind, topicId, measures, hiOf, artX, artY) {
  // artX and artY are two artifacts; hiOf[m] says which of them ('X' or 'Y') is the HIGH learner's for measure m.
  const flip = parseInt(sha(`${kind}|${topicId}|${measures.join(',')}`).slice(0, 2), 16) % 2 === 1;
  const A = flip ? artY : artX; const B = flip ? artX : artY;
  const truth = Object.fromEntries(measures.map((m) => [m, (hiOf[m] === 'X') !== flip ? 'A' : 'B']));
  const prompt = pairPrompt(kind, topicId, measures, A.text, B.text);
  const perJudge = await Promise.all((MOCK ? [{ id: 'mock', family: 'code' }] : JUDGES).map(async (j) => {
    const v = MOCK ? mockJudge(measures) : (measures.length > 1 && JOINT_JUDGE === 'each' ? await judgeEach(j, kind, topicId, measures, A, B) : await judgeOnce(j, prompt, measures));
    if (v.error) return { judge: j.id, error: v.error };
    // Map A and B back to X and Y so the record does not depend on the shuffle.
    const back = (s) => (s === 'A' ? (flip ? 'Y' : 'X') : s === 'B' ? (flip ? 'X' : 'Y') : 'same');
    return {
      judge: j.id, family: j.family,
      picks: Object.fromEntries(measures.map((m) => [m, back(v.picks[m])])),
      correct: Object.fromEntries(measures.map((m) => [m, v.picks[m] === truth[m]])),
      same: Object.fromEntries(measures.map((m) => [m, v.picks[m] === 'same'])),
      X: flip ? v.B : v.A, Y: flip ? v.A : v.B, certainty: v.certainty || null, evidence: v.evidence,
    };
  }));
  return perJudge;
}

// ── plain code: coverage, words, minutes ────────────────────────────────────
function codeMeasure(art, topicId) {
  const text = art.measureText || art.text || '';
  const cov = ls.checkFollowed(text, null, { keyFacts: TOPICS[topicId].keyFacts }).stats;
  const words = K.words(text).length;
  return { words, keyFactsMissing: cov ? cov.keyFactsMissing : null, checks: art.checks || null };
}
/** Reading minutes from words alone (age and second language only, so the estimate is not built from the profile it tests). */
function minutesFor(words, age, esl, checks = 0) {
  const wpm = (age <= 8 ? 80 : age <= 11 ? 130 : age <= 14 ? 180 : age <= 17 ? 220 : age >= 55 ? 200 : 240) * (esl ? 0.7 : 1);
  return Number((words / wpm + 0.5 * (checks || 0)).toFixed(1));
}

// ── phases ──────────────────────────────────────────────────────────────────
async function runSingle(measures, kinds) {
  const recs = [];
  const tasks = [];
  measures.forEach((m, i) => {
    const topicId = topicFor(m, i);
    const lo = { name: `${m}-lo`, age: BASE_LEARNER.age, survey: BASE_LEARNER.survey };
    const hi = { name: `${m}-hi`, age: BASE_LEARNER.age, survey: BASE_LEARNER.survey };
    const uLo = userFor(lo.name, { [m]: LO });
    const uHi = userFor(hi.name, { [m]: HI });
    for (const kind of kinds) tasks.push({ m, i, topicId, kind, lo, hi, uLo, uHi });
  });
  let done = 0;
  await limited(tasks, CONCURRENCY, async (t) => {
    const bLo = blockFor(t.kind, t.uLo.id, t.topicId);
    const bHi = blockFor(t.kind, t.uHi.id, t.topicId);
    const rec = { measure: t.m, group: BY_ID[t.m].category, impact: BY_ID[t.m].impact, kind: t.kind, topic: t.topicId, promptDiffers: bLo !== bHi };
    if (!rec.promptDiffers) { rec.result = 'ignored: the block is the same for low and high'; recs.push(rec); done++; return; }
    const [aLo, aHi] = await Promise.all([artifact(t.kind, t.lo, t.uLo, t.topicId), artifact(t.kind, t.hi, t.uHi, t.topicId)]);
    if (aLo.error || aHi.error) { rec.result = `build failed: ${aLo.error || aHi.error}`; recs.push(rec); done++; return; }
    rec.code = { lo: codeMeasure(aLo, t.topicId), hi: codeMeasure(aHi, t.topicId) };
    rec.verdicts = await judgePair(t.kind, t.topicId, [t.m], { [t.m]: 'Y' }, aLo, aHi); // X = low, Y = high
    rec.texts = { lo: aLo.text, hi: aHi.text };
    recs.push(rec);
    done++;
    process.stdout.write(`\r${done}/${tasks.length} pairs`);
  });
  process.stdout.write('\n');
  return recs;
}

// Joint profiles: four measures at once, mixed directions; the mirror has all four flipped. 1 = high in the profile, 0 = low.
const JOINT = [
  { id: 'J1', set: { vocabulary_ceiling: 1, attention_runway: 0, evaluation_anxiety: 1, prior_knowledge: 1 } },
  { id: 'J2', set: { working_memory_span: 0, deductive_trajectory: 1, interest_transfer: 1, brevity_preference: 1 } },
  { id: 'J3', set: { worked_example_dependence: 1, challenge_appetite: 1, spatial_anchoring: 0, tone_formality: 1 } },
  { id: 'J4', set: { structure_need: 1, narrative_pull: 1, productive_struggle: 0, text_density_tolerance: 0 } },
];
async function runJoint(kinds) {
  const recs = [];
  const tasks = [];
  const only = arg('profiles') ? arg('profiles').split(',') : null; // --profiles J1,J4: just these (topics stay as they are)
  JOINT.forEach((p, i) => {
    if (only && !only.includes(p.id)) return;
    // --joint-topic J3=two-step equations: another topic for one profile (a measure the default topic cannot show, e.g. worked examples in history).
    const over = (arg('joint-topic') || '').split(';').map((x) => x.split('=')).find((x) => x[0] === p.id);
    const topicId = over && TOPICS[over[1]] ? over[1] : TOPIC_IDS[i % TOPIC_IDS.length];
    const stats = Object.fromEntries(Object.entries(p.set).map(([m, h]) => [m, h ? HI : LO]));
    const mirror = Object.fromEntries(Object.entries(p.set).map(([m, h]) => [m, h ? LO : HI]));
    const P = { name: `${p.id}-profile`, age: BASE_LEARNER.age, survey: BASE_LEARNER.survey };
    const M = { name: `${p.id}-mirror`, age: BASE_LEARNER.age, survey: BASE_LEARNER.survey };
    const uP = userFor(P.name, stats); const uM = userFor(M.name, mirror);
    for (const kind of kinds) tasks.push({ p, topicId, kind, P, M, uP, uM });
  });
  await limited(tasks, CONCURRENCY, async (t) => {
    const measures = Object.keys(t.p.set);
    const rec = { profile: t.p.id, set: t.p.set, kind: t.kind, topic: t.topicId };
    const rec0 = REPLAY ? REPLAY.find((x) => x.profile === t.p.id && x.kind === t.kind) : null;
    let [aP, aM] = rec0 ? [{ text: rec0.texts.profile }, { text: rec0.texts.mirror }] : await Promise.all([artifact(t.kind, t.P, t.uP, t.topicId), artifact(t.kind, t.M, t.uM, t.topicId)]);
    if (aP.error || aM.error) { rec.result = `build failed: ${aP.error || aM.error}`; recs.push(rec); return; }
    if (PLANT) { const keep = aP; aP = aM; aM = keep; rec.plant = PLANT; }
    // X = the profile, Y = the mirror: the high version of a measure is X where the profile has it high.
    const hiOf = Object.fromEntries(measures.map((m) => [m, t.p.set[m] ? 'X' : 'Y']));
    rec.code = { profile: codeMeasure(aP, t.topicId), mirror: codeMeasure(aM, t.topicId) };
    rec.verdicts = await judgePair(t.kind, t.topicId, measures, hiOf, aP, aM);
    rec.texts = { profile: aP.text, mirror: aM.text };
    recs.push(rec);
  });
  return recs;
}

// The speed phase: tailored against generic, for learner types who need less (and, for contrast, more).
const SPEED_LEARNERS = ['Lena', 'Noah', 'Ethan', 'Ben', 'Omar', 'Frank', 'Sam', 'Grace'];
const SPEED_SYSTEM = 'You are a strict, fair evaluator of teaching material. Score only on the evidence in the text. Do not reward length. Reply with one JSON object only.';
function speedPrompt(kind, topicId, lrn, A, B) {
  const topic = TOPICS[topicId];
  return `Two versions, A and B, of the same ${K.KIND_INFO[kind].label.toLowerCase()} (${K.KIND_INFO[kind].what}), made from the base text below.

THE LEARNER: ${lrn.blurb}. Age ${lrn.age}. What they said: ${JSON.stringify(lrn.survey || {})}.

BASE TEXT:
<<<
${K.BASE_TEXTS[topicId]}
>>>

THE LEVEL'S OBJECTIVES (each must be taught, correctly):
${topic.keyFacts.map((k, i) => `${i + 1}. ${k}`).join('\n')}

VERSION A:
<<<
${A}
>>>

VERSION B:
<<<
${B}
>>>

Score each version: accuracy 0-10 (10 = nothing false or distorted), which objectives (by number) it fully teaches, and fit 0-10 (how well it suits THIS learner: their age, what they know, how they take things in, what they said).
Return this JSON: { "A": {"accuracy": 0-10, "covered": [numbers], "fit": 0-10, "why": "one sentence"}, "B": {"accuracy": 0-10, "covered": [numbers], "fit": 0-10, "why": "one sentence"} }`;
}
async function runSpeed(kinds) {
  const recs = [];
  const tasks = [];
  // The generic learner: no birth date, no survey, no scorecard: the default spec (an empty block).
  const generic = db.insert('users', { email: 'speed-generic@example.test', display_name: 'Generic', password_hash: 'x', onboarded: true, age_check: { needs_parent: false, under_13: false, synthetic: true } });
  base.setGeneric(generic);
  for (const name of SPEED_LEARNERS) {
    const lrn = base.LEARNERS.find((l) => l.name === name);
    const user = userFor(`speed-${name}`, lrn.stats);
    // Their own survey and context, not the base learner's.
    base.learner.saveProfile(user.id, { survey: base.learner.cleanSurvey(lrn.survey || {}), subscription: 'pro', learning_context: { ...(lrn.esl ? { esl: true } : {}), ...(lrn.device ? { device: lrn.device } : {}) } });
    const ym = base.ym(lrn.age);
    db.update('users', user.id, { age_check: { birth_ym: ym, needs_parent: false, under_13: false, synthetic: true } });
    for (const kind of kinds) tasks.push({ lrn: { ...lrn, name: `speed-${name}` }, label: name, user, topicId: lrn.topics[0], kind });
  }
  await limited(tasks, CONCURRENCY, async (t) => {
    const rec = { learner: t.label, blurb: t.lrn.blurb, age: t.lrn.age, kind: t.kind, topic: t.topicId };
    const genLrn = { name: 'speed-generic', age: 30 };
    const [aT, aG] = await Promise.all([artifact(t.kind, t.lrn, t.user, t.topicId), artifact(t.kind, genLrn, generic, t.topicId)]);
    if (aT.error || aG.error) { rec.result = `build failed: ${aT.error || aG.error}`; recs.push(rec); return; }
    rec.code = { tailored: codeMeasure(aT, t.topicId), generic: codeMeasure(aG, t.topicId) };
    rec.minutes = { tailored: minutesFor(rec.code.tailored.words, t.lrn.age, t.lrn.esl, rec.code.tailored.checks), generic: minutesFor(rec.code.generic.words, t.lrn.age, t.lrn.esl, rec.code.generic.checks) };
    const flip = parseInt(sha(`${t.label}|${t.kind}`).slice(0, 2), 16) % 2 === 1;
    const A = flip ? aG : aT; const B = flip ? aT : aG;
    const prompt = speedPrompt(t.kind, t.topicId, t.lrn, A.text, B.text);
    rec.verdicts = [];
    for (const j of (MOCK ? [] : JUDGES)) {
      const k = `speedj:${j.id}:${sha(prompt)}`;
      let v = LIVE ? cache.get(k) : null;
      for (let attempt = 0; !v && attempt < 2; attempt++) {
        try {
          const raw = base.parseJsonLoose(await j.call(SPEED_SYSTEM, prompt)); // eslint-disable-line no-await-in-loop
          usage.judgeCalls[j.id] = (usage.judgeCalls[j.id] || 0) + 1;
          const side = (o) => (o && Number.isFinite(Number(o.accuracy)) && Number.isFinite(Number(o.fit)) ? { accuracy: Number(o.accuracy), fit: Number(o.fit), covered: Array.isArray(o.covered) ? o.covered.map(Number).filter((n) => n >= 1 && n <= 10) : [], why: String(o.why || '').slice(0, 200) } : null);
          if (raw && side(raw.A) && side(raw.B)) { v = { A: side(raw.A), B: side(raw.B) }; if (LIVE) cache.set(k, v); }
        } catch (e) { usage.errors[j.id] = (usage.errors[j.id] || 0) + 1; }
      }
      if (v) rec.verdicts.push({ judge: j.id, tailored: flip ? v.B : v.A, generic: flip ? v.A : v.B });
    }
    rec.texts = { tailored: aT.text, generic: aG.text };
    recs.push(rec);
  });
  return recs;
}

// ── the structural matrix: every measure x every surface, no model ─────────
const SURFACES = ['lesson', 'level', 'material', 'notes', 'podcast', 'test'];
function structuralMatrix() {
  const inp = (m, v) => ({ metrics: { [m]: { measured: v, confidence: 90 } }, age: BASE_LEARNER.age, interests: ['basketball', 'video games'], topic: 'photosynthesis' });
  const rows = [];
  for (const s of STATS) {
    const lo = ls.buildSpecFrom(inp(s.id, LO)); const hi = ls.buildSpecFrom(inp(s.id, HI));
    const row = { measure: s.id, group: s.category, impact: s.impact };
    for (const surf of SURFACES) row[surf] = ls.specToPrompt(lo, { surface: surf }) !== ls.specToPrompt(hi, { surface: surf });
    // Code that reads the spec rather than a prompt (review timing, session length, test timing): does the spec itself differ?
    row.code = JSON.stringify({ r: lo.review, s: lo.session, l: lo.lesson.pace }) !== JSON.stringify({ r: hi.review, s: hi.session, l: hi.lesson.pace });
    rows.push(row);
  }
  const count = (surf) => rows.filter((r) => r[surf]).length;
  return { rows, counts: Object.fromEntries([...SURFACES, 'code'].map((s) => [s, count(s)])), anySurface: rows.filter((r) => SURFACES.some((s) => r[s])).length };
}

// ── aggregation ─────────────────────────────────────────────────────────────
function aggregateSingle(recs) {
  const cells = recs.map((r) => {
    const v = (r.verdicts || []).filter((x) => !x.error);
    const correct = v.filter((x) => x.correct[r.measure]).length;
    const same = v.filter((x) => x.same[r.measure]).length;
    // A practice test is a sample of questions drawn from the course (services/material-test.js), so it is not expected to carry every key
    // point: for tests, "intact" is accuracy only; every other kind must keep every key point too.
    const sample = r.kind === 'test';
    const intactJudge = v.length ? v.every((x) => (sample || !(x.X.missing.length || x.Y.missing.length)) && x.X.accuracy >= 8 && x.Y.accuracy >= 8) : null;
    const intactCode = sample ? null : r.code ? (r.code.lo.keyFactsMissing || 0) === 0 && (r.code.hi.keyFactsMissing || 0) === 0 : null;
    return { measure: r.measure, group: r.group, impact: r.impact, kind: r.kind, topic: r.topic, promptDiffers: r.promptDiffers, result: r.result || null, verdicts: v.length, correct, same, wrong: v.length - correct - same, intactJudge, intactCode, words: r.code ? { lo: r.code.lo.words, hi: r.code.hi.words } : null, evidence: v.map((x) => `${x.judge.split('/').pop()}: ${x.picks[r.measure]} (${x.evidence || ''})`) };
  });
  const judged = cells.filter((c) => c.verdicts);
  const tot = (xs, k) => xs.reduce((n, c) => n + c[k], 0);
  const byKind = {};
  for (const k of new Set(cells.map((c) => c.kind))) {
    const xs = cells.filter((c) => c.kind === k); const js = xs.filter((c) => c.verdicts);
    byKind[k] = { pairs: xs.length, ignored: xs.filter((c) => !c.promptDiffers).length, failedBuilds: xs.filter((c) => c.result && c.result.startsWith('build failed')).length, verdicts: tot(js, 'verdicts'), correct: tot(js, 'correct'), same: tot(js, 'same'), wrong: tot(js, 'wrong'), intact: js.filter((c) => c.intactJudge && c.intactCode !== false).length, judged: js.length };
  }
  return { cells, byKind, all: { verdicts: tot(judged, 'verdicts'), correct: tot(judged, 'correct'), same: tot(judged, 'same'), wrong: tot(judged, 'wrong'), pairs: cells.length, judged: judged.length, ignored: cells.filter((c) => !c.promptDiffers).length, intact: judged.filter((c) => c.intactJudge && c.intactCode !== false).length } };
}
function aggregateJoint(recs) {
  const rows = [];
  for (const r of recs) {
    for (const m of Object.keys(r.set || {})) {
      const v = (r.verdicts || []).filter((x) => !x.error);
      rows.push({ profile: r.profile, kind: r.kind, measure: m, high: !!r.set[m], verdicts: v.length, correct: v.filter((x) => x.correct[m]).length, same: v.filter((x) => x.same[m]).length, result: r.result || null });
    }
  }
  const tot = (k) => rows.reduce((n, x) => n + x[k], 0);
  return { rows, verdicts: tot('verdicts'), correct: tot('correct'), same: tot('same') };
}

async function main() {
  const t0 = Date.now();
  const sc = LIVE ? require('../services/standard-compute-ledger') : null; // eslint-disable-line global-require
  const before = sc ? sc.status().spent_usd : null;
  const structural = structuralMatrix();
  let out = { tag: TAG, phase: PHASE, depth: DEPTH, generated_at: new Date().toISOString(), live: LIVE, writer: LIVE ? (WRITER === 'sc' ? 'deepseek/deepseek-v4.1-flash-1017 (Standard Compute)' : WRITER_MODEL) : 'mock', judges: MOCK ? ['mock'] : JUDGES.map((j) => j.id), lo: LO, hi: HI, base: BASE_LEARNER };
  out.structural = { counts: structural.counts, anySurface: structural.anySurface, rows: structural.rows };
  if (MOCK) {
    installMockWriter();
    base.setGeneric(db.insert('users', { email: 'mock-generic@example.test', display_name: 'Generic', password_hash: 'x', onboarded: true, age_check: { needs_parent: false, under_13: false, synthetic: true } }));
    const recs = await runSingle(['vocabulary_ceiling', 'brevity_preference', 'humor_receptivity'], ['lesson']);
    out.single = aggregateSingle(recs);
    const bad = [];
    const need = (c, m) => { if (!c) bad.push(m); };
    need(structural.rows.length === 100, 'the matrix has all 100 measures');
    need(structural.anySurface >= 95, `at least 95 of the 100 measures change some surface's block, low against high (${structural.anySurface})`);
    need(structural.counts.lesson >= 90, `at least 90 change the lesson block (${structural.counts.lesson})`);
    need(structural.counts.level === structural.counts.lesson, 'built-in base material (the level surface) changes exactly where the lesson does');
    need(out.single.cells.length === 3 && out.single.cells.every((c) => c.promptDiffers && c.verdicts === 1), 'the harness built and judged every mock pair');
    need(out.single.cells.every((c) => c.words && c.words.lo > 0 && c.words.hi > 0), 'and measured both versions');
    // Version 2 reaches more of the material than version 1 (the same matrix with the depth block off).
    process.env.LEARNING_SPEC_DEPTH = 'off';
    const v1 = structuralMatrix();
    delete process.env.LEARNING_SPEC_DEPTH;
    out.structural_v1 = { counts: v1.counts, anySurface: v1.anySurface };
    for (const s of ['notes', 'test', 'material', 'podcast', 'lesson']) need(structural.counts[s] >= v1.counts[s], `version 2 changes the ${s} block for no fewer measures than version 1 (${structural.counts[s]} vs ${v1.counts[s]})`);
    need(structural.counts.notes > v1.counts.notes && structural.counts.test > v1.counts.test, `and for more on notes and tests (${structural.counts.notes} vs ${v1.counts.notes}; ${structural.counts.test} vs ${v1.counts.test})`);
    fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1));
    if (bad.length) { console.error(`material-sensitivity-proof --mock FAILED:\n- ${bad.join('\n- ')}`); process.exit(1); }
    console.log(`structural (v2): any surface ${structural.anySurface}/100; ${Object.entries(structural.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(`structural (v1): any surface ${v1.anySurface}/100; ${Object.entries(v1.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log('material-sensitivity-proof --mock: all checks passed');
    return;
  }
  installWriter();
  if (PHASE === 'pilot' || PHASE === 'full') {
    const measures = chosenMeasures();
    console.log(`${PHASE} (${DEPTH}): ${measures.length} measures x ${KINDS.join('+')}; writer ${WRITER === 'sc' ? 'Standard Compute DeepSeek' : WRITER_MODEL}; judges ${JUDGES.map((j) => j.id).join(' + ')}`);
    const recs = await runSingle(measures, KINDS);
    out.single = aggregateSingle(recs);
    out.texts = recs.map((r) => ({ measure: r.measure, kind: r.kind, texts: r.texts }));
  } else if (PHASE === 'joint') {
    console.log(`joint (${DEPTH}): ${JOINT.length} profiles x ${KINDS.join('+')}`);
    const recs = await runJoint(KINDS);
    out.joint = aggregateJoint(recs); out.plant = PLANT || null;
    out.jointRecs = recs.map((r) => ({ ...r, texts: undefined }));
    out.texts = recs.map((r) => ({ profile: r.profile, kind: r.kind, texts: r.texts }));
  } else if (PHASE === 'speed') {
    console.log(`speed (${DEPTH}): ${SPEED_LEARNERS.length} learners x ${KINDS.join('+')}`);
    const recs = await runSpeed(KINDS);
    out.speed = recs.map((r) => ({ ...r, texts: undefined }));
    out.texts = recs.map((r) => ({ learner: r.learner, kind: r.kind, texts: r.texts }));
  }
  if (cache.flush) cache.flush();
  let xk = null;
  try { xk = require('../services/providers/xkiro').xkiro.status(); } catch { /* none */ } // eslint-disable-line global-require
  out.usage = { ...usage, seconds: Math.round((Date.now() - t0) / 1000), standardComputeUsd: sc ? Number((sc.status().spent_usd - before).toFixed(4)) : 0, xkiro: xk ? { free_tokens_today: xk.free_tokens_today, grants: xk.grants } : null };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1));
  console.log(`wrote ${OUT_JSON}`);
  if (out.single) { const a = out.single.all; console.log(`direction-correct ${a.correct}/${a.verdicts} verdicts (same ${a.same}, wrong ${a.wrong}); ignored ${a.ignored}/${a.pairs}; intact ${a.intact}/${a.judged}`); for (const [k, b] of Object.entries(out.single.byKind)) console.log(`  ${k}: ${b.correct}/${b.verdicts} correct, ${b.same} same, ${b.wrong} wrong; ignored ${b.ignored}; failed ${b.failedBuilds}; intact ${b.intact}/${b.judged}`); }
  if (out.joint) console.log(`joint: ${out.joint.correct}/${out.joint.verdicts} correct (same ${out.joint.same})`);
  if (out.joint && PLANT) console.log(`planted wrong way round (${PLANT}): caught ${out.joint.verdicts - out.joint.correct - out.joint.same}/${out.joint.verdicts}, fooled ${out.joint.correct}, could not tell ${out.joint.same}`);
  console.log(`writer calls ${usage.writerCalls} (${usage.writerIn} in, ${usage.writerOut} out tokens); judge calls ${JSON.stringify(usage.judgeCalls)}; errors ${JSON.stringify(usage.errors)}; ${out.usage.seconds}s`);
}

// ── the report: --render a.json,b.json --out FILE.md ───────────────────────
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
const tableMd = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
function render(files) {
  const runs = files.map((f) => ({ file: path.basename(f), ...JSON.parse(fs.readFileSync(f, 'utf8')) }));
  const md = [];
  const singles = runs.filter((r) => r.single);
  if (singles.length) {
    md.push('### Single measures: summary per run and kind', '');
    const rows = [];
    for (const r of singles) {
      for (const [k, b] of Object.entries(r.single.byKind)) {
        // Per measure: right when more of its verdicts name the high version than not, wrong when more name the low one.
        const cs = r.single.cells.filter((c) => c.kind === k && c.verdicts);
        const right = cs.filter((c) => c.correct > c.wrong + c.same).length;
        const wrongCells = cs.filter((c) => c.wrong > c.correct).length;
        rows.push([r.tag, r.depth, k, `${b.pairs}`, `${b.ignored}`, `${b.failedBuilds}`, `${b.correct}/${b.verdicts} (${pct(b.correct, b.verdicts)})`, `${b.same}`, `${b.wrong}`, `${right} / ${cs.length - right - wrongCells} / ${wrongCells}`, `${b.intact}/${b.judged}`]);
      }
    }
    md.push(tableMd(['run', 'spec', 'kind', 'pairs', 'block unchanged (ignored)', 'build failed', 'direction-correct verdicts', 'said "same"', 'wrong way', 'measures right / split / wrong', 'content intact (pairs)'], rows), '');
    // Per measure: one column per run-and-kind.
    const cols = [];
    for (const r of singles) for (const k of Object.keys(r.single.byKind)) cols.push({ r, k });
    const measures = [...new Set(singles.flatMap((r) => r.single.cells.map((c) => c.measure)))];
    md.push('### Single measures: per measure (correct verdicts of two judges; ign = the block did not change; fail = not built)', '');
    md.push(tableMd(['measure', 'group', 'impact', ...cols.map((c) => `${c.k} (${c.r.depth})`)], measures.map((m) => {
      const s = BY_ID[m];
      return [m, s.category, `${s.impact}`, ...cols.map(({ r, k }) => {
        const c = r.single.cells.find((x) => x.measure === m && x.kind === k);
        if (!c) return '';
        if (!c.promptDiffers) return 'ign';
        if (c.result && c.result.startsWith('build failed')) return 'fail';
        if (!c.verdicts) return 'n/j';
        return `${c.correct}/${c.verdicts}${c.wrong ? ` (${c.wrong} wrong)` : ''}${c.intactJudge === false || c.intactCode === false ? ' *' : ''}`;
      })];
    })), '', '`*` = a key point was missing or a statement inaccurate in at least one of the two versions (judge or code).', '');
  }
  for (const r of runs.filter((x) => x.joint)) {
    md.push(`### Joint profiles (${r.tag}, ${r.depth})`, '');
    md.push(tableMd(['profile', 'kind', 'measure', 'profile has it', 'correct verdicts'], r.joint.rows.map((x) => [x.profile, x.kind, x.measure, x.high ? 'high' : 'low', x.result ? 'fail' : `${x.correct}/${x.verdicts}`])), '');
    md.push(`All: ${r.joint.correct}/${r.joint.verdicts} verdicts direction-correct (${pct(r.joint.correct, r.joint.verdicts)}), ${r.joint.same} "same".`, '');
  }
  for (const r of runs.filter((x) => x.speed)) {
    md.push(`### Tailored against base material (${r.tag}, ${r.depth})`, '');
    const rows = r.speed.filter((x) => !x.result).map((x) => {
      const v = x.verdicts || [];
      const m = (side, k) => (v.length ? (v.reduce((n, j) => n + (k === 'covered' ? j[side].covered.length : j[side][k]), 0) / v.length).toFixed(1) : 'n/a');
      return [x.learner, x.blurb, x.kind, `${x.code.generic.words} -> ${x.code.tailored.words}`, `${x.minutes.generic} -> ${x.minutes.tailored}`, `${m('generic', 'covered')} -> ${m('tailored', 'covered')} of 5`, `${x.code.generic.keyFactsMissing} -> ${x.code.tailored.keyFactsMissing}`, `${m('generic', 'accuracy')} -> ${m('tailored', 'accuracy')}`, `${m('generic', 'fit')} -> ${m('tailored', 'fit')}`];
    });
    md.push(tableMd(['learner', 'type', 'kind', 'words (base -> tailored)', 'est. minutes', 'objectives taught (judges)', 'key points missing (code)', 'accuracy', 'fit'], rows), '');
  }
  return md.join('\n');
}

if (require.main !== module) {
  // Required by scripts/block-sensitivity-proof.js, which runs the same measures, writer, judges and cache on built-in block levels.
  module.exports = { arg, base, ls, usage, installWriter, judgeOnce, JUDGES, JUDGE_SYSTEM, JOINT, LO, HI, BASE_LEARNER, userFor, measureLine, PLANT, REPLAY, CONCURRENCY, REP, LIVE, MOCK, cache, sha, limited, BY_ID, WRITER_MODEL, WRITER, gated };
} else if (arg('render')) {
  const text = render(arg('render').split(',').filter(Boolean));
  if (arg('out')) fs.writeFileSync(arg('out'), `${text}\n`); else console.log(text);
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}
