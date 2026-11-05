#!/usr/bin/env node
/**
 * Coral benchmark (reproducible). Live calls: not part of npm test.
 *
 *   node scripts/coral-eval.js --bench [--n 10] [--only coral-fast,coral-standard,munito-v41,nvidia-v41] [--out FILE] [--budget 5]
 *   node scripts/coral-eval.js --lesson coral|free [--subject math] [--out FILE]
 *   node scripts/coral-eval.js --probe
 *
 * --bench, per target, STREAMING (SSE, stream_options.include_usage), calls one at a time (no concurrency, so latency is not queueing):
 *   - time to first token (first streamed content or reasoning delta) and total time, with output tokens/s = output tokens / (total - TTFT)
 *     (decode speed) and output tokens / total (end to end), on short (~40 tokens), medium (~400) and long (~2,000 token) generations, n each;
 *     p50 / p95; error, timeout and 429 rates over every call (a failed call is recorded as such, never dropped);
 *   - JSON-schema validity of a structured lesson-snippet answer (n=20, response_format json_object, validated with services/providers/structured-json);
 *   - blind multiple-choice accuracy on 40 of Savant's own verified bank items with known keys (choice order shuffled by a fixed seed);
 *   - cost per call at the ledger's list price from the usage the API reports (estimated at 4 characters per token when it reports none, and flagged).
 *   Targets: coral-fast, coral-standard (Coral ledger, services/coral-ledger.js), munito-v41 (Munito ledger, the same DeepSeek V4.1 Flash family),
 *   nvidia-v41 (NVIDIA's free tier; no cost). Everything graded is AI-model output scored against bank keys or a schema: not a real-learner result.
 *
 * --lesson: the time to write ONE full personalised lesson level end to end with the app's real block writer (services/block-levels.js write:
 *   layout call, then fill-out call; the fact gate and self-check are off so only the writer is timed) in a fresh temporary DB (the harness
 *   scripts/scorecard-modification-proof.js makes it), for a simulated learner. `coral`: only Coral slots exist in the process (every other provider's key removed), the call is foreground (a learner waiting), so the
 *   pool picks Coral Fast. `free`: the current free chain (NVIDIA / xKiro), no Coral and no Munito. Run each in its own process.
 *
 * Keys come from C:/coding/claudecommittdIq/folderThing/.env (never printed). CORAL_LEDGER_FILE / MUNITO_LEDGER_FILE default to the live ledgers so the
 * spend counts against the real caps. The run stops itself when its own Coral spend passes --budget USD (default 5).
 */
const fs = require('fs');
require('../services/run-cap').defaultCap(5); // hard per-process spend cap across every paid ledger; --run-cap N or RUN_CAP_USD overrides
const os = require('os');
const path = require('path');
const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { try { require('dotenv').config({ path: ENV }); } catch { /* rely on the environment */ } }
const LIVE_DIR = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
if (!process.env.CORAL_LEDGER_FILE) process.env.CORAL_LEDGER_FILE = `${LIVE_DIR}/coral-ledger.json`;
if (!process.env.MUNITO_LEDGER_FILE) process.env.MUNITO_LEDGER_FILE = `${LIVE_DIR}/munito-ledger.json`;
process.env.CORAL_PIPELINE = '1';
process.env.MUNITO_PIPELINE = '1';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const flag = (n) => argv.includes(`--${n}`);
const ROOT = path.join(__dirname, '..');
const OUTDIR = path.join(ROOT, 'curriculum-build', 'coral-eval');

// ── helpers ────────────────────────────────────────────────────────────────
const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const round = (v, d = 1) => (v == null ? null : Number(v.toFixed(d)));
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const LET = 'ABCD';

function targets() {
  const coral = require('../services/providers/coral');
  const cled = require('../services/coral-ledger');
  const { baseUrl: mBase } = require('../services/providers/munito');
  const mled = require('../services/munito-ledger');
  const all = {
    'coral-fast': { label: 'Coral deepseek-v4.1-flash-fast', model: 'deepseek-v4.1-flash-fast', base: coral.baseUrl(process.env.CORAL_BASE_URL), key: process.env.CORAL_API_KEY, ledger: cled, paid: true },
    'coral-standard': { label: 'Coral deepseek-v4.1-flash (Standard)', model: 'deepseek-v4.1-flash', base: coral.baseUrl(process.env.CORAL_BASE_URL), key: process.env.CORAL_API_KEY, ledger: cled, paid: true },
    'munito-v41': { label: 'Munito deepseek-ai/deepseek-v4.1-flash-1017', model: 'deepseek-ai/deepseek-v4.1-flash-1017', base: mBase(process.env.MUNITO_BASE_URL), key: process.env.MUNITO_API_KEY, ledger: mled, paid: true },
    'nvidia-v41': { label: 'NVIDIA free tier deepseek-ai/deepseek-v4.1-flash', model: 'deepseek-ai/deepseek-v4.1-flash', base: (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, ''), key: process.env.NVIDIA_API_KEY, ledger: null, paid: false },
  };
  return all;
}

/** One streamed chat call. Never throws: returns { ok, kind, status, ttftMs, totalMs, text, outTokens, inTokens, usageReported, costUsd }. */
async function streamCall(t, { system = null, user, maxTokens, temperature = 0, json = false, timeoutMs = 120000, task = 'coral_eval' }) {
  timeoutMs = Math.min(timeoutMs, Number(process.env.CORAL_EVAL_TIMEOUT_MS) || timeoutMs);
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }];
  const body = { model: t.model, messages, max_tokens: maxTokens, temperature, stream: true, stream_options: { include_usage: true }, ...(json ? { response_format: { type: 'json_object' } } : {}) };
  const inputChars = messages.reduce((n, m) => n + m.content.length, 0);
  let id = null;
  if (t.ledger) {
    try { id = t.ledger.reserve({ usd: t.ledger.estimate({ model: t.model, inputChars, maxTokens }), task, model: t.model }); } catch (e) { return { ok: false, kind: 'ledger_refused', status: 402, msg: e.message }; }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = process.hrtime.bigint();
  const since = () => Number(process.hrtime.bigint() - t0) / 1e6;
  let ttft = null; let text = ''; let usage = null; let status = 0; let settled = false;
  const settle = (a) => { if (id && !settled) { settled = true; t.ledger.settle(id, a); } };
  try {
    const res = await fetch(`${t.base}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${t.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    status = res.status;
    if (!res.ok) {
      const msg = (await res.text()).slice(0, 160).replace(new RegExp(String(t.key || '\u0000').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '<key>');
      settle({ outcome: 'not_billed' });
      return { ok: false, kind: res.status === 429 ? 'http_429' : `http_${res.status}`, status: res.status, totalMs: since(), msg };
    }
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.usage) usage = j.usage;
        const d = j.choices && j.choices[0] && j.choices[0].delta;
        if (d) {
          const piece = (d.content || '') + (d.reasoning_content || d.reasoning || '');
          if (piece && ttft == null) ttft = since();
          if (d.content) text += d.content;
        }
      }
    }
    const totalMs = since();
    const reported = !!(usage && usage.completion_tokens != null);
    const inTokens = reported ? usage.prompt_tokens || 0 : Math.ceil(inputChars / 4);
    const outTokens = reported ? usage.completion_tokens || 0 : Math.ceil(text.length / 4);
    const costUsd = t.ledger ? t.ledger.costOf(t.model, { input_tokens: inTokens, output_tokens: outTokens }) : 0;
    settle({ usd: costUsd, outcome: 'ok', usage: { input_tokens: inTokens, output_tokens: outTokens } });
    if (ttft == null) return { ok: false, kind: 'empty', status, totalMs, outTokens, inTokens, costUsd, usageReported: reported };
    return { ok: true, status, ttftMs: ttft, totalMs, text, outTokens, inTokens, usageReported: reported, costUsd };
  } catch (err) {
    settle({ outcome: 'unknown' });
    return { ok: false, kind: err.name === 'AbortError' ? 'timeout' : `network_${String(err.cause && err.cause.code || err.message).slice(0, 30)}`, status, totalMs: since() };
  } finally { clearTimeout(timer); }
}

function summarise(calls) {
  const ok = calls.filter((c) => c.ok);
  const kinds = {};
  for (const c of calls) if (!c.ok) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  const ttft = ok.map((c) => c.ttftMs); const total = ok.map((c) => c.totalMs);
  const dec = ok.filter((c) => c.outTokens > 1 && c.totalMs > c.ttftMs).map((c) => c.outTokens / ((c.totalMs - c.ttftMs) / 1000));
  const e2e = ok.map((c) => c.outTokens / (c.totalMs / 1000));
  return {
    n: calls.length, ok: ok.length, failures: kinds,
    ttft_ms: { p50: round(pct(ttft, 0.5), 0), p95: round(pct(ttft, 0.95), 0), mean: round(mean(ttft), 0) },
    total_ms: { p50: round(pct(total, 0.5), 0), p95: round(pct(total, 0.95), 0), mean: round(mean(total), 0) },
    decode_tok_s: { p50: round(pct(dec, 0.5)), p95: round(pct(dec, 0.95)), mean: round(mean(dec)) },
    end_to_end_tok_s: { p50: round(pct(e2e, 0.5)), mean: round(mean(e2e)) },
    out_tokens_mean: round(mean(ok.map((c) => c.outTokens)), 0),
    usage_reported_share: ok.length ? round(ok.filter((c) => c.usageReported).length / ok.length, 2) : null,
    cost_usd_total: Number(calls.reduce((s, c) => s + (c.costUsd || 0), 0).toFixed(6)),
    cost_usd_per_call: ok.length ? Number((calls.reduce((s, c) => s + (c.costUsd || 0), 0) / calls.length).toFixed(6)) : null,
  };
}

const SHORT = { user: 'Why is the sky blue? Answer in one or two sentences.', maxTokens: 120 };
const MEDIUM = { user: 'Explain how photosynthesis works to a 14-year-old in about 300 words, in plain paragraphs, no headings.', maxTokens: 900 };
const LONG = { user: 'Write a complete lesson on solving two-step linear equations for a 14-year-old, about 1,500 words: an introduction, four worked examples with every step shown, common mistakes, and ten practice problems with answers. Use plain text.', maxTokens: 4000 };
const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    points: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    question: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
    answer_index: { type: 'integer', minimum: 0, maximum: 3 },
  },
  required: ['title', 'points', 'question', 'choices', 'answer_index'],
};
const JSON_SYSTEM = `Reply with one JSON object only (no prose, no code fence) matching this JSON schema:\n${JSON.stringify(SCHEMA)}`;
const JSON_USER = (i) => `Write a mini lesson on topic number ${i + 1} from this list: fractions, photosynthesis, the water cycle, verbs, the French Revolution, speed and velocity, ratios, metaphors, the Pythagorean theorem, plate tectonics, percentages, the Roman Republic, simple machines, apostrophes, density, prime numbers, ecosystems, similes, area of a circle, the printing press. Give a title, exactly 3 key points, and one multiple-choice question with 4 choices and the index (0-3) of the right one.`;

async function benchTarget(name, t, items, N, budget) {
  const out = { target: name, label: t.label, model: t.model, base_host: new URL(t.base).host, streaming: true, calls: {} };
  const guard = () => { if (t.paid && budget.max != null && t.ledger === budget.ledger && budget.spent() > budget.max) throw new Error('budget reached'); };
  for (const [kind, spec] of [['short', SHORT], ['medium', MEDIUM], ['long', LONG]]) {
    const calls = [];
    for (let i = 0; i < N; i += 1) { guard(); calls.push(await streamCall(t, { ...spec, temperature: 0.7, timeoutMs: kind === 'long' ? 180000 : 90000, task: `coral_eval_${kind}` })); }
    out.calls[kind] = { ...summarise(calls), raw: calls.map((c) => ({ ok: c.ok, kind: c.kind || null, ttft_ms: c.ttftMs != null ? round(c.ttftMs, 0) : null, total_ms: c.totalMs != null ? round(c.totalMs, 0) : null, out_tokens: c.outTokens != null ? c.outTokens : null })) };
    process.stdout.write(`${name} ${kind}: ok ${out.calls[kind].ok}/${out.calls[kind].n} ttft p50 ${out.calls[kind].ttft_ms.p50} ms, decode p50 ${out.calls[kind].decode_tok_s.p50} tok/s\n`);
  }
  // JSON validity
  const sj = require('../services/providers/structured-json');
  const jcalls = []; let valid = 0; const reasons = {};
  for (let i = 0; i < 20; i += 1) {
    guard();
    const c = await streamCall(t, { system: JSON_SYSTEM, user: JSON_USER(i), maxTokens: 1200, json: true, task: 'coral_eval_json' });
    jcalls.push(c);
    if (!c.ok) continue;
    let data; try { data = sj.parseStructured({ content: c.text }, 'submit').data; } catch { data = undefined; }
    const chk = data !== undefined ? sj.validate(SCHEMA, data) : null;
    if (chk && !chk.errors.length) valid += 1; else reasons[data === undefined ? 'unparseable' : 'schema_violation'] = (reasons[data === undefined ? 'unparseable' : 'schema_violation'] || 0) + 1;
  }
  out.json_validity = { n: 20, valid, answered: jcalls.filter((c) => c.ok).length, invalid_reasons: reasons, ...summarise(jcalls) };
  // blind multiple choice
  let right = 0; let answered = 0; const mcCalls = []; const byBank = {};
  for (const q of items) {
    guard();
    const prompt = `${q.prompt}\n${q.choices.map((c, k) => `${LET[k]}. ${c}`).join('\n')}\n\nReply with the letter of the correct choice only.`;
    const c = await streamCall(t, { user: prompt, maxTokens: 400, task: 'coral_eval_mcq' });
    mcCalls.push(c);
    byBank[q.bank] = byBank[q.bank] || { n: 0, right: 0 }; byBank[q.bank].n += 1;
    if (!c.ok) continue;
    const m = require('../services/providers/structured-json').stripThinking(c.text).match(/\b([ABCD])\b/);
    if (!m) continue;
    answered += 1;
    if (m[1] === q.key) { right += 1; byBank[q.bank].right += 1; }
  }
  out.mcq = { n: items.length, answered, right, accuracy_of_answered: answered ? round(right / answered, 3) : null, accuracy_of_all: round(right / items.length, 3), by_bank: byBank, ...summarise(mcCalls) };
  process.stdout.write(`${name}: json ${valid}/20, mcq ${right}/${answered} answered of ${items.length}\n`);
  return out;
}

async function bench() {
  const N = Number(arg('n', 10)) || 10;
  const T = targets();
  const only = String(arg('only', 'coral-fast,coral-standard,munito-v41,nvidia-v41')).split(',').filter((k) => T[k]);
  const { loadItems } = require('./munito-eval');
  const { items, pools } = loadItems();
  const cled = require('../services/coral-ledger');
  const startSpent = cled.status().spent_usd;
  const budget = { max: Number(arg('budget', 5)), ledger: cled, spent: () => cled.status().spent_usd - startSpent };
  const result = {
    generated_at: new Date().toISOString(), what: 'streaming latency, JSON validity and bank multiple-choice accuracy; AI-model output graded by script against known keys or a schema, not real-learner results',
    client: { node: process.version, os: `${os.platform()} ${os.release()}`, calls: 'sequential, one at a time, HTTPS from the USA (Omaha, Nebraska), residential connection' },
    n_per_length: N, items: { n: items.length, pools }, coral_ledger_before: startSpent, targets: [],
  };
  for (const name of only) {
    const t = T[name];
    if (!t.key || !t.base) { result.targets.push({ target: name, skipped: 'not configured' }); continue; }
    try { result.targets.push(await benchTarget(name, t, items, N, budget)); } catch (e) { result.targets.push({ target: name, label: t.label, error: String(e.message).slice(0, 160) }); }
  }
  result.coral_ledger_after = cled.status().spent_usd;
  result.coral_spend_usd = Number((result.coral_ledger_after - startSpent).toFixed(6));
  const file = arg('out') && arg('out') !== true ? arg('out') : path.join(OUTDIR, 'coral-eval.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result, null, 1));
  console.log(`Coral spend this run $${result.coral_spend_usd}; wrote ${file}`);
}

// ── the lesson-level workload ──────────────────────────────────────────────
async function lesson() {
  const arm = String(arg('lesson'));
  if (arm !== 'coral' && arm !== 'free') throw new Error('--lesson coral|free');
  process.env.NODE_ENV = 'test';
  for (const [k, v] of Object.entries({ PERSONALIZE_HOLDOUT: '0', PERSONALIZE_EXPERIMENT_RATE: '0', LEVEL_SELF_CHECK: 'off', KEY_GATE: 'off', BLOCK_FACT_GATE: '0', BLOCK_LANE: 'foreground', BLOCK_ADAPT: 'on' })) process.env[k] = v;
  // scorecard-modification-proof scrubs provider keys on load (it is an offline harness): keep the real environment and restore it
  const snapshot = { ...process.env };
  process.argv.push('--live'); // the harness's live mode keeps the real keys (mock mode blanks them) and uses its own fresh temporary DB
  const base = require('./scorecard-modification-proof');
  const blockLevels = require('../services/block-levels');
  const subject = String(arg('subject', 'math'));
  const LEVELS = {
    math: { trackId: 'math', gradeId: 'algebra_1_part_a', level: 30 },
    english: { trackId: 'english', gradeId: 'proficient', level: 40 },
    iq: { trackId: 'iq', gradeId: 'abstract_reasoning', level: 20 },
  };
  const cfg = LEVELS[subject];
  const user = base.makeUser({ name: `lesson-${arm}`, age: 14, survey: { interests: 'basketball, video games', hobbies: 'drawing comics', dislikes: 'spiders' }, stats: { brevity_preference: 70, vocabulary_ceiling: 55, interest_transfer: 80 }, blurb: 'simulated learner' });
  for (const k of Object.keys(snapshot)) if (process.env[k] === undefined) process.env[k] = snapshot[k];
  const keep = (re) => Object.keys(process.env).filter((k) => re.test(k));
  if (arm === 'coral') {
    // only Coral exists: every other provider's key is removed in this process; learner use of Coral is on for the simulated learner only
    for (const k of keep(/^(NVIDIA|XKIRO|UNOROUTER|MUNITO|MODELFLARE|OPENROUTER|GEMINI|GOOGLE|ANTHROPIC|STANDARD_COMPUTE|AIHUBMIX|MIMO|MISTRAL|GROQ|CEREBRAS|SAMBANOVA|TOGETHER|LLMGATEWAY|OLLAMA|ZAI|DEEPSEEK)/)) delete process.env[k];
    process.env.CORAL_LEARNER = 'on';
  } else {
    for (const k of keep(/^(CORAL_(API|BASE|PIPE|MODEL)|MUNITO|STANDARD_COMPUTE|ANTHROPIC|MODELFLARE|OPENROUTER)/)) delete process.env[k];
    process.env.CORAL_LEARNER = 'off';
  }
  const cled = require('../services/coral-ledger');
  const before = cled.status().spent_usd;
  const t0 = Date.now();
  let plan = null; let error = null;
  try { plan = await blockLevels.write({ userId: user.id, trackId: cfg.trackId, gradeId: cfg.gradeId, level: cfg.level, tailored: true }); } catch (e) { error = String(e.message).slice(0, 200); }
  const ms = Date.now() - t0;
  const led = JSON.parse(fs.readFileSync(process.env.CORAL_LEDGER_FILE, 'utf8'));
  const res = {
    generated_at: new Date().toISOString(), arm, subject, level: cfg, simulated_learner: true, db: 'fresh temporary DB (never data/db.json)',
    writer: arm === 'coral' ? 'only Coral slots exist; foreground lane (a learner waiting) so the pool prefers Coral Fast, Standard behind it' : 'the app\'s current free chain (NVIDIA / xKiro free), no Coral, no Munito',
    gates: 'fact gate and self-check off; this times the writer (layout call + fill-out call + code checks) only',
    wall_ms: ms, wrote_level: !!(plan && plan.blocks), error,
    blocks: plan && plan.blocks ? plan.blocks.length : null, checks: plan && plan.checks ? plan.checks.length : null,
    model: plan && plan.model ? plan.model : null, tier: plan && plan.tier ? plan.tier : null,
    coral_spend_usd: Number((cled.status().spent_usd - before).toFixed(6)),
    coral_by_model_after: led.by_model || null,
  };
  const file = arg('out') && arg('out') !== true ? arg('out') : path.join(OUTDIR, `lesson-${arm}-${subject}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(res, null, 1));
  console.log(`${arm}: wrote level ${res.wrote_level} in ${(ms / 1000).toFixed(1)} s, ${res.blocks} blocks, ${res.checks} checks, Coral $${res.coral_spend_usd}; ${file}`);
  process.exit(0);
}

async function probe() {
  const T = targets();
  for (const k of ['coral-standard', 'coral-fast']) {
    const r = await streamCall(T[k], { user: 'Say hello in five words.', maxTokens: 40, task: 'coral_probe' });
    console.log(k, JSON.stringify({ ok: r.ok, kind: r.kind, status: r.status, ttft: r.ttftMs && Math.round(r.ttftMs), total: r.totalMs && Math.round(r.totalMs), out: r.outTokens, reported: r.usageReported, cost: r.costUsd, text: (r.text || '').slice(0, 60), msg: r.msg }));
  }
}

if (require.main === module) {
  (flag('probe') ? probe() : flag('bench') ? bench() : arg('lesson') ? lesson() : Promise.reject(new Error('use --probe, --bench or --lesson coral|free'))).catch((e) => { console.error(String(e.stack || e).slice(0, 600)); process.exit(1); });
}
module.exports = { streamCall, summarise };
