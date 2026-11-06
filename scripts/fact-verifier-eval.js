#!/usr/bin/env node
/**
 * Fact-gate verifier eval (4 Nov 2026, brief first-lesson): which model can read a lesson's facts, and answer a quiz blind, as well as
 * today's verifier, but faster? Live calls, paid providers through their ledgers (RUN_CAP_USD default 5), NOT part of npm test.
 *
 *   node scripts/fact-verifier-eval.js --build [--blocks 24 --clean 12 --checks 24]   write the labelled set (planted errors) to --set FILE
 *   node scripts/fact-verifier-eval.js --run  [--only a,b] [--set FILE] [--out FILE]    run every verifier over the set, print the table
 *
 * The set: real lesson blocks and checks from the app's own lesson plans (data/db.json block_plans), pipeline text only (no learner data).
 *   - fact cases: a block (or one graded check) with ONE planted factual error (xKiro Mistral Large, free, picks a phrase of the text and a
 *     plausible wrong replacement) or left clean (false alarms). The verifier gets exactly what production sends (block-levels
 *     verifyRequest, same system prompt and schema) and is never told which cases are planted. Caught = it marks a claim that quotes the
 *     planted wrong words (or whose "truth" quotes the original words) as not verified. A flag on another claim of the block is not a catch.
 *   - key cases: a multiple-choice check whose answer key is planted wrong, or left right. The blind judge sees prompt and choices only
 *     (key-gate's own prompt); a planted key is caught when the pick differs from it, a true key is "kept" when the pick matches it.
 * Baselines: the fact gate today is grok-4.3 (config fact_verify.allow); the blind check today is Nemotron Ultra (free, key-gate.js).
 * All AI-judged on model-planted errors: not a real-learner result.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { try { require('dotenv').config({ path: ENV }); } catch { /* rely on the environment */ } }
require('../services/run-cap').defaultCap(5);
const LIVE_DIR = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['CORAL', 'GONKA', 'GROKIFIED', 'LYCEUM', 'MUNITO', 'ZEROGPU']) {
  if (!process.env[`${n}_LEDGER_FILE`]) process.env[`${n}_LEDGER_FILE`] = `${LIVE_DIR}/${n.toLowerCase()}-ledger.json`;
  process.env[`${n}_PIPELINE`] = '1';
}
process.env.CROUTON_PIPELINE = '1';
// 5 Nov 2026 (evals-all): Standard Compute, Anthropic, NVIDIA candidates, all through their ledgers with the live files
process.env.STANDARD_COMPUTE_PIPELINE = '1';
if (!process.env.STANDARD_COMPUTE_LEDGER_FILE) process.env.STANDARD_COMPUTE_LEDGER_FILE = `${LIVE_DIR}/standard-compute-ledger.json`;
if (!process.env.ANTHROPIC_LEDGER_FILE) process.env.ANTHROPIC_LEDGER_FILE = `${LIVE_DIR}/anthropic-ledger.json`;
process.env.AI_MODEL_FAST = 'claude-haiku-5-5';
process.env.AI_MODEL_AUTHOR = 'claude-sonnet-5-5';
process.env.NVIDIA_PIPELINE = '1';
process.env.XKIRO_PIPELINE = '1';
process.env.XKIRO_GRANTS = process.env.XKIRO_GRANTS || JSON.stringify({ 'minimax/minimax-m3.1-flash': 6000000 });
if (!process.env.CROUTON_COUNTER_FILE) process.env.CROUTON_COUNTER_FILE = `${LIVE_DIR}/crouton-counter.json`;

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const SET = arg('set', path.join(__dirname, '..', 'docs', 'fact-verifier-set.json'));
const OUT = arg('out', path.join(__dirname, '..', 'docs', 'fact-verifier-eval.json'));

const bl = require('../services/block-levels');
const keyAgreement = require('../services/key-agreement');

// seeded rng so the set is reproducible
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rand = rng(Number(arg('seed', 20261104)));
const shuffle = (a) => { const o = [...a]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the candidates ─────────────────────────────────────────────────────────────
const CANDS = {
  'grok-4.3': { prov: () => require('../services/providers/grokified').grokified, model: 'grok-4.3', family: 'grok', baseline: true },
  'gonka-glm-5.3-flash': { prov: () => require('../services/providers/gonka').gonka, model: 'zai-org/GLM-5.3-Flash', family: 'glm' },
  'coral-deepseek-v4.1-std': { prov: () => require('../services/providers/coral').coral, model: 'deepseek-v4.1-flash', family: 'deepseek' },
  'gonka-deepseek-v4-flash': { prov: () => require('../services/providers/gonka').gonka, model: 'deepseek-ai/DeepSeek-V4-Flash-0731', family: 'deepseek' },
  'lyceum-glm-5.3': { prov: () => require('../services/providers/lyceum').lyceum, model: 'z-ai/glm-5.3', family: 'glm' },
  'lyceum-kimi-k3': { prov: () => require('../services/providers/lyceum').lyceum, model: 'moonshotai/kimi-k3', family: 'kimi' },
  'lyceum-minimax-m3': { prov: () => require('../services/providers/lyceum').lyceum, model: 'minimax/minimax-m3', family: 'minimax' },
  // ZeroGPU ($250 credit, 5 Nov 2026): ledger services/zerogpu-ledger.js
  'zerogpu-glm-5.3-flash': { prov: () => require('../services/providers/zerogpu').zerogpu, model: 'z-ai/glm-5.3-flash', family: 'glm' },
  'zerogpu-gpt-oss-120b': { prov: () => require('../services/providers/zerogpu').zerogpu, model: 'openai/gpt-oss-120b', family: 'gpt-oss' },
  'zerogpu-qwen3-30b': { prov: () => require('../services/providers/zerogpu').zerogpu, model: 'qwen/qwen3-30b-a3b', family: 'qwen' },
  'zerogpu-gpt-6-luna': { prov: () => require('../services/providers/zerogpu').zerogpu, model: 'gpt-6-luna', family: 'luna' },
  'zerogpu-gpt-5.6-luna': { prov: () => require('../services/providers/zerogpu').zerogpu, model: 'gpt-5.6-luna', family: 'luna' },
  // xKiro's key no longer lists any MiniMax model (404 "does not exist" on 5 Nov), so the free catalogue is evaluated instead (mistral-large is the planter: not used as a judge)
  'xkiro-qwen3.8-max-free': { prov: () => require('../services/providers/xkiro').xkiro, model: 'qwen/qwen3.8-max:free', family: 'qwen', extra: (m) => ({ models: [m] }) },
  'xkiro-command-a-plus': { prov: () => require('../services/providers/xkiro').xkiro, model: 'cohere/command-a-plus', family: 'cohere', extra: (m) => ({ models: [m] }) },
  'nvidia-deepseek-v4.1-flash': { prov: () => require('../services/providers/nvidia'), model: 'deepseek-ai/deepseek-v4.1-flash', family: 'deepseek', extra: (m) => ({ models: [{ model: m, effort: 'medium' }], role: 'fast' }) },
  'nvidia-glm-5.3-flash': { prov: () => require('../services/providers/nvidia'), model: 'z-ai/glm-5.3-flash', family: 'glm', extra: (m) => ({ models: [{ model: m, effort: 'medium' }], role: 'fast' }) },
  'standard-compute-deepseek-v4.1-flash': { prov: () => require('../services/providers/standard-compute').standardCompute, model: 'deepseek/deepseek-v4.1-flash-1017', family: 'deepseek' },
  'anthropic-haiku-5.5': { prov: () => require('../services/providers/anthropic'), model: 'claude-haiku-5-5', family: 'claude', extra: () => ({ role: 'fast', effort: 'low' }) },
  'anthropic-sonnet-5.5': { prov: () => require('../services/providers/anthropic'), model: 'claude-sonnet-5-5', family: 'claude', extra: () => ({ role: 'author', effort: 'low' }) },
  'crouton-alpha': { prov: () => require('../services/providers/crouton').crouton, model: 'stealth/crouton-alpha', family: 'crouton' },
};

// ── building the set ───────────────────────────────────────────────────────────
const PLANT_SCHEMA = {
  type: 'object', required: ['original', 'wrong'],
  properties: { original: { type: 'string', description: 'An exact substring of the text (3 to 80 characters) that states a fact.' }, wrong: { type: 'string', description: 'What to put in its place: a plausible but FALSE statement.' } },
};
const PLANT_SYSTEM = 'You are building a test for a fact checker. You get one piece of lesson text as JSON. Pick ONE factual statement in it (a number, a name, a rule, a definition, a date, a cause) and replace it with a plausible but clearly FALSE one that a careful expert would catch (not a typo, not a joke, not an opinion). Return the exact substring you replaced and its wrong replacement. The substring must appear verbatim in the text, once. Do not touch answer-key positions, the wrong replacement must not repeat the original, and it must not contradict itself.';

async function plant(text) {
  const { xkiro } = require('../services/providers/xkiro');
  for (let a = 0; a < 3; a++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await xkiro.structured({ system: PLANT_SYSTEM, user: text, schema: PLANT_SCHEMA, schemaName: 'submit_plant', maxTokens: 800, models: [process.env.PLANTER_MODEL || 'mistralai/mistral-large-2512'], reasoningEffort: 'low', timeoutMs: 90000 });
      const d = r && r.data;
      if (!d || !d.original || !d.wrong || d.original === d.wrong) continue;
      const first = text.indexOf(d.original);
      if (first < 0 || text.indexOf(d.original, first + 1) >= 0) continue;
      if (/["\\]/.test(d.original + d.wrong)) continue; // keep the JSON valid after replacement
      return d;
    } catch (err) { await sleep(2000); }
  }
  return null;
}

function realPlans() {
  const dbf = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'db.json');
  const d = JSON.parse(fs.readFileSync(dbf, 'utf8'));
  return d.block_plans.filter((p) => p.status === 'ready' && ['math', 'english', 'spanish'].includes(p.track_id) && (p.blocks || []).length);
}

async function build() {
  const nBlocks = Number(arg('blocks', 24)); const nClean = Number(arg('clean', 12)); const nChecks = Number(arg('checks', 24));
  const plans = shuffle(realPlans());
  const fact = []; const keys = [];
  // blocks: one per plan, subjects mixed
  const blockPool = [];
  for (const p of plans) {
    const b = shuffle(p.blocks.filter((x) => x && x.data && JSON.stringify(x.data).length > 250 && JSON.stringify(x.data).length < 4000))[0];
    if (b) blockPool.push({ plan: p, block: b });
  }
  const need = nBlocks + nClean;
  const picked = blockPool.slice(0, need * 2);
  let planted = 0; let clean = 0;
  for (const { plan, block } of picked) {
    if (planted >= nBlocks && clean >= nClean) break;
    const text = JSON.stringify(block.data);
    const ctx = `Subject: ${plan.track_id}, grade ${plan.grade_id}, level ${plan.level}.`;
    if (planted < nBlocks && (clean >= nClean || fact.length % 3 !== 2)) {
      // eslint-disable-next-line no-await-in-loop
      const pl = await plant(text);
      if (!pl) continue;
      fact.push({ id: `b${fact.length}`, kind: 'block', track: plan.track_id, context: ctx, block: block.block, data: JSON.parse(text.replace(pl.original, pl.wrong)), planted: pl });
      planted++;
    } else if (clean < nClean) {
      fact.push({ id: `b${fact.length}`, kind: 'block', track: plan.track_id, context: ctx, block: block.block, data: block.data, planted: null });
      clean++;
    }
    process.stdout.write(`\rfact cases ${fact.length}`);
  }
  // checks: planted error in the rationale or prompt
  const checkPool = shuffle(plans.flatMap((p) => (p.checks || []).filter((c) => c && c.format === 'multiple_choice' && (c.choices || []).length >= 3 && c.rationale && keyAgreement.keyIndexOf(c) >= 0).map((c) => ({ plan: p, check: c }))));
  let cp = 0; let cc = 0;
  for (const { plan, check } of checkPool) {
    if (cp >= nChecks / 2 && cc >= nChecks / 2) break;
    const ctx = `Subject: ${plan.track_id}, grade ${plan.grade_id}, level ${plan.level}.`;
    const text = JSON.stringify({ prompt: check.prompt, rationale: check.rationale });
    if (cp < nChecks / 2) {
      // eslint-disable-next-line no-await-in-loop
      const pl = await plant(text);
      if (!pl) continue;
      const mod = JSON.parse(text.replace(pl.original, pl.wrong));
      fact.push({ id: `c${fact.length}`, kind: 'check', track: plan.track_id, context: ctx, check: { ...check, prompt: mod.prompt, rationale: mod.rationale }, planted: pl });
      cp++;
    } else if (cc < nChecks / 2) {
      fact.push({ id: `c${fact.length}`, kind: 'check', track: plan.track_id, context: ctx, check, planted: null });
      cc++;
    }
    process.stdout.write(`\rfact cases ${fact.length}`);
  }
  // keys: half planted wrong
  const keyPool = checkPool.slice(nChecks + 5, nChecks + 5 + 48);
  keyPool.forEach(({ plan, check }, i) => {
    const ki = keyAgreement.keyIndexOf(check);
    const wrong = shuffle(check.choices.map((_, j) => j).filter((j) => j !== ki))[0];
    keys.push({ id: `k${i}`, track: plan.track_id, prompt: check.prompt, choices: check.choices, true_index: ki, planted_index: i % 2 === 0 ? wrong : null });
  });
  fs.writeFileSync(SET, JSON.stringify({ built: new Date().toISOString(), note: 'planted by xKiro Mistral Large (a family none of the verifiers share); pipeline text only', fact, keys }, null, 1));
  console.log(`\nset: ${fact.filter((f) => f.planted).length} planted + ${fact.filter((f) => !f.planted).length} clean fact cases, ${keys.length} key cases -> ${SET}`);
}

// ── running ────────────────────────────────────────────────────────────────────
const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
function distinctive(pl) {
  const orig = new Set(words(pl.original));
  const w = words(pl.wrong).filter((t) => !orig.has(t));
  return w.length ? w : words(pl.wrong);
}
function caught(result, pl) {
  const dist = distinctive(pl);
  const orig = words(pl.original).filter((t) => !new Set(words(pl.wrong)).has(t));
  for (const c of result.failed) {
    const claim = new Set(words(c.claim));
    const truth = new Set(words(`${c.truth} ${c.evidence}`));
    if (dist.some((t) => claim.has(t))) return true;
    if (orig.length && orig.some((t) => truth.has(t)) && dist.some((t) => claim.has(t) || truth.has(t))) return true;
  }
  return false;
}

async function callOne(cand, args) {
  const t = Date.now();
  let lastErr = null;
  for (let a = 0; a < Number(process.env.EVAL_ATTEMPTS || 2); a++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await cand.prov().structured({ ...args, model: cand.model, ...(cand.extra ? cand.extra(cand.model) : {}), timeoutMs: Number(process.env.EVAL_TIMEOUT_MS || 240000) });
      if (r && r.data) return { data: r.data, ms: Date.now() - t, usage: r.usage };
    } catch (err) { lastErr = err; await sleep(1500); }
  }
  return { data: null, ms: Date.now() - t, error: lastErr ? String(lastErr.message).slice(0, 120) : 'empty' };
}

async function pmap(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

const SYSTEM_BLIND = 'You answer multiple-choice questions for a school course. For each question, work it out yourself and give the index (0-based) of the one option you believe is correct. You are not told the answer key.';
const BLIND_SCHEMA = { type: 'object', properties: { picks: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' } }, required: ['index', 'chosen_index'] } } }, required: ['picks'] };

async function runFact(name, cand, set) {
  const res = await pmap(set.fact, 4, async (c) => {
    const context = { text: c.context, trackId: c.track };
    const blocks = c.kind === 'block' ? [{ index: 0, block: c.block, data: c.data }] : [];
    const checks = c.kind === 'check' ? [{ index: 0, format: c.check.format, prompt: c.check.prompt, options: c.check.options, choices: c.check.choices, answer: c.check.answer, rationale: c.check.rationale }] : [];
    const req = bl.verifyRequest({ context, blocks, checks });
    const r = await callOne(cand, { system: req.system, user: req.user, schema: bl.VERIFY_SCHEMA, schemaName: 'submit_verification', maxTokens: 12000 });
    if (!r.data) return { id: c.id, ok: false, ms: r.ms, error: r.error };
    const v = bl.readVerification(r.data);
    return { id: c.id, ok: true, ms: r.ms, flagged: v.failed.length > 0, caught: c.planted ? caught(v, c.planted) : null, claims: v.claims.length, usage: r.usage };
  });
  return res;
}

async function runKeys(name, cand, set) {
  return pmap(set.keys, 6, async (k) => {
    const user = `Question 0: ${k.prompt}\n${k.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}\n\nReturn one pick per question, with its index.`;
    const r = await callOne(cand, { system: SYSTEM_BLIND, user, schema: BLIND_SCHEMA, schemaName: 'submit_picks', maxTokens: 6000 });
    const pick = r.data && r.data.picks && r.data.picks[0] ? r.data.picks[0].chosen_index : null;
    return { id: k.id, ok: Number.isInteger(pick), ms: r.ms, pick };
  });
}

async function nemotronKeys(set) {
  const kg = require('../services/key-gate');
  return pmap(set.keys, 4, async (k) => {
    const t = Date.now();
    const picks = await kg.nemotronJudge([{ prompt: k.prompt, choices: k.choices }]).catch(() => [null]);
    return { id: k.id, ok: Number.isInteger(picks[0]), ms: Date.now() - t, pick: picks[0] };
  });
}

const pct = (a) => { const s = [...a].sort((x, y) => x - y); return (q) => s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };

function summarise(name, set, fact, keys) {
  const planted = set.fact.filter((c) => c.planted); const clean = set.fact.filter((c) => !c.planted);
  const fmap = new Map(fact.map((r) => [r.id, r]));
  const answered = fact.filter((r) => r.ok);
  const catchN = planted.filter((c) => fmap.get(c.id) && fmap.get(c.id).ok && fmap.get(c.id).caught).length;
  const catchBlocks = planted.filter((c) => c.kind === 'block' && fmap.get(c.id) && fmap.get(c.id).caught).length;
  const catchChecks = planted.filter((c) => c.kind === 'check' && fmap.get(c.id) && fmap.get(c.id).caught).length;
  const falseAlarms = clean.filter((c) => fmap.get(c.id) && fmap.get(c.id).ok && fmap.get(c.id).flagged).length;
  const ms = pct(answered.map((r) => r.ms));
  const kmap = new Map(keys.map((r) => [r.id, r]));
  const plantedKeys = set.keys.filter((k) => k.planted_index !== null); const trueKeys = set.keys.filter((k) => k.planted_index === null);
  const keyCaught = plantedKeys.filter((k) => { const r = kmap.get(k.id); return r && r.ok && r.pick !== k.planted_index; }).length;
  const keyKept = trueKeys.filter((k) => { const r = kmap.get(k.id); return r && r.ok && r.pick === k.true_index; }).length;
  const kms = pct(keys.filter((r) => r.ok).map((r) => r.ms));
  const errs = [...fact, ...keys].filter((r) => !r.ok && r.error).map((r) => r.error);
  return {
    errors: errs.length, errors_429: errs.filter((e) => /429|rate/i.test(e)).length, errors_5xx: errs.filter((e) => /5\d\d|overload|unavailable/i.test(e)).length, error_sample: errs[0] || null,
    name, planted: planted.length, caught: catchN, caught_blocks: catchBlocks, caught_checks: catchChecks, clean: clean.length, false_alarms: falseAlarms,
    answered: answered.length, of: fact.length, fact_p50_ms: ms(0.5), fact_p95_ms: ms(0.95),
    keys_planted: plantedKeys.length, keys_caught: keyCaught, keys_true: trueKeys.length, keys_kept: keyKept, keys_answered: keys.filter((r) => r.ok).length, key_p50_ms: kms(0.5), key_p95_ms: kms(0.95),
  };
}

async function run() {
  const set = JSON.parse(fs.readFileSync(SET, 'utf8'));
  // --facts N --keys M: a seeded, deterministic sub-sample (keeps the planted / clean mix) for the expensive candidates; recorded in the row
  const sub = (arr, n, keep) => { if (!n || n >= arr.length) return arr; const a = shuffle(arr.filter(keep)); const b = shuffle(arr.filter((x) => !keep(x))); const want = Math.round(n * a.length / arr.length); return [...a.slice(0, want), ...b.slice(0, n - want)]; };
  if (arg('facts')) set.fact = sub(set.fact, Number(arg('facts')), (c) => !!c.planted);
  if (arg('keys')) set.keys = sub(set.keys, Number(arg('keys')), (k) => k.planted_index !== null);
  const only = arg('only') ? String(arg('only')).split(',') : [...Object.keys(CANDS), 'nemotron-ultra'];
  const out = { at: new Date().toISOString(), set: path.basename(SET), rows: [] };
  await Promise.all(only.map(async (name) => {
    try {
      if (name === 'nemotron-ultra') {
        const keys = await nemotronKeys(set);
        out.rows.push(summarise(name, set, [], keys));
        return;
      }
      const cand = CANDS[name];
      if (!cand) return;
      const [fact, keys] = await Promise.all([runFact(name, cand, set), runKeys(name, cand, set)]);
      out.rows.push({ ...summarise(name, set, fact, keys), family: cand.family });
    } catch (err) { out.rows.push({ name, error: String(err.message).slice(0, 200) }); }
    console.log(`done ${name}`);
    // each finished candidate is merged into the out file at once (rows by name), so a slow one never holds the rest hostage
    let prev = { rows: [] }; try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* none yet */ }
    const merged = [...prev.rows.filter((r) => !out.rows.some((o) => o.name === r.name)), ...out.rows];
    fs.writeFileSync(OUT, JSON.stringify({ at: out.at, set: out.set, rows: merged }, null, 1));
  }));
  console.table(out.rows.map((r) => ({ name: r.name, caught: r.error ? r.error : `${r.caught}/${r.planted} (b${r.caught_blocks} c${r.caught_checks})`, falseAlarms: `${r.false_alarms}/${r.clean}`, answered: `${r.answered}/${r.of}`, p50s: r.fact_p50_ms && (r.fact_p50_ms / 1000).toFixed(1), p95s: r.fact_p95_ms && (r.fact_p95_ms / 1000).toFixed(1), keyCaught: `${r.keys_caught}/${r.keys_planted}`, keyKept: `${r.keys_kept}/${r.keys_true}`, keyP50s: r.key_p50_ms && (r.key_p50_ms / 1000).toFixed(1) })));
}

(async () => {
  if (argv.includes('--build')) await build();
  else if (argv.includes('--run')) await run();
  else console.log('use --build or --run');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
