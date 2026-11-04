#!/usr/bin/env node
/**
 * Munito benchmark: reproducible, through services/providers/munito.js and its $100 ledger. Not part of npm test (live calls).
 *
 *   node scripts/munito-eval.js [--free-baseline] [--models a,b] [--conc 4] [--out file] [--budget 3]
 *
 * Per chat model: latency (short prompt n=10, ~3k-token prompt n=5; p50/p95; output tokens/s on the long prompt, which
 * includes prefill), reliability (error / timeout / empty rates over every call), structured-JSON validity (10 calls),
 * and blind multiple-choice accuracy on 40 of Savant's own verified bank items (no learner data), plus cost per call and
 * per 1,000 tasks at the ledger's list prices. Choice order is shuffled by a fixed seed. Everything is AI-model output
 * graded against bank keys: a measure of answering known-key questions, not of teaching a real learner.
 * --free-baseline runs the same tasks on NVIDIA's free GLM 5.3 Flash and DeepSeek V4.1 Flash (a model that 429s is skipped).
 * Needs MUNITO_API_KEY (+ NVIDIA key for the baseline) from C:/coding/claudecommittdIq/folderThing/.env, never printed.
 * MUNITO_LEDGER_FILE defaults to the live ledger so spend counts against the real cap. The run stops if it spends > --budget USD.
 */
const fs = require('fs');
const path = require('path');
const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { try { require('dotenv').config({ path: ENV }); } catch { /* rely on environment */ } }
if (!process.env.MUNITO_LEDGER_FILE) process.env.MUNITO_LEDGER_FILE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/munito-ledger.json';
process.env.MUNITO_PIPELINE = '1';

const ledger = require('../services/munito-ledger');
const { munito } = require('../services/providers/munito');

const MODELS = ['deepseek-ai/deepseek-v4.1-flash-1017', 'deepseek-ai/deepseek-v4-flash', 'zai-org/glm-5.3-flash', 'qwen/qwen3.8-27b', 'aleph-alpha/kolibri-1', 'blockbrain/cygnet', 'google/gemma-4-12b'];
const BASELINE = ['z-ai/glm-5.3-flash', 'deepseek-ai/deepseek-v4.1-flash'];
const BANKS = [['spanish', 'content/unit-placement/spanish.json'], ['english', 'content/unit-placement/english.json'], ['math', 'content/unit-placement/math.json'], ['reading', 'content/unit-placement/reading.json']];
const PER_BANK = 10, SHORT_N = 10, LONG_N = 5, STRUCT_N = 10, TIMEOUT = 120000;

const CONC = Number((process.argv[process.argv.indexOf("--conc") + 1]) || 4) || 4;
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const flag = (n) => process.argv.includes(n);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function shuffle(a, r) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const LET = 'ABCD';

function loadItems() {
  const r = rng(20261104), out = [], pools = [];
  for (const [bank, file] of BANKS) {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
    const all = [];
    for (const g of Object.values(j.grades || {})) for (const u of (g.units || [])) for (const q of (u.questions || [])) {
      if (q.prompt && Array.isArray(q.choices) && q.choices.length === 4 && q.choices.includes(q.answer)) all.push(q);
    }
    pools.push({ bank, file, n: all.length });
    for (const q of shuffle(all, r).slice(0, PER_BANK)) {
      const ch = shuffle(q.choices, r);
      out.push({ bank, file, prompt: q.prompt, choices: ch, key: LET[ch.indexOf(q.answer)] });
    }
  }
  return { items: out, pools };
}
function longPrompt(items) {
  const body = []; let i = 0;
  while (body.join('\n').length < 12000) { const q = items[i % items.length]; body.push(`Q${i + 1}. ${q.prompt}\n` + q.choices.map((c, k) => `  ${LET[k]}. ${c}`).join('\n')); i++; }
  return `Here is a set of quiz questions.\n\n${body.join('\n')}\n\nIn one sentence of at most 40 words, say which school subjects these questions cover.`;
}

function classify(err) {
  const m = String((err && err.message) || err);
  if (err && (err.timeout || /timed out/.test(m))) return 'timeout';
  if (/no text|unusable/.test(m) || (err && err.unusable)) return 'empty_or_unusable';
  return `error_${(err && err.status) || 0}`;
}
function makeRunner(model, provider) {
  if (provider === 'munito') {
    return {
      chat: (system, user, maxTokens) => munito.chat({ task: 'munito_eval', model, system, messages: [{ role: 'user', content: user }], maxTokens, timeoutMs: TIMEOUT }),
      structured: (system, user, schema) => munito.structured({ task: 'munito_eval', model, system, user, schema, maxTokens: 400, timeoutMs: TIMEOUT }),
    };
  }
  const nv = require('../services/providers/nvidia');
  const chat = (system, user, maxTokens) => nv.chat({ task: 'munito_eval_baseline', model, effort: 'off', system, messages: [{ role: 'user', content: user }], maxTokens, timeoutMs: TIMEOUT, attempts: 1 });
  return {
    chat,
    async structured(system, user, schema) {
      const r = await chat(`${system}\n\nReply with one JSON object only matching this JSON schema:\n${JSON.stringify(schema)}`, user, 400);
      const m = r.text.match(/\{[\s\S]*\}/);
      let d = null;
      try { d = m ? JSON.parse(m[0]) : null; } catch { d = null; }
      if (!d || typeof d.answer !== 'number' || typeof d.reason !== 'string') throw Object.assign(new Error('unusable'), { unusable: true });
      return { data: d, usage: r.usage };
    },
  };
}
async function pool(n, tasks) {
  const res = new Array(tasks.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) { const k = i++; res[k] = await tasks[k](); } }));
  return res;
}
const costOf = (model, usage, provider) => (provider === 'munito' ? ledger.costOf(model, { input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 }) : 0);

async function timed(fn) {
  const t0 = Date.now();
  try { const r = await fn(); return { ok: true, ms: Date.now() - t0, r }; } catch (err) { return { ok: false, ms: Date.now() - t0, kind: classify(err), status: err && err.status, msg: String((err && err.message) || err).slice(0, 120) }; }
}

async function benchModel(model, provider, items, long, budget) {
  const run = makeRunner(model, provider);
  const calls = { total: 0, ok: 0, timeout: 0, empty_or_unusable: 0, other_error: 0, rate_limited: 0 };
  const errs = [];
  const usd = (x) => (x.ok ? costOf(model, x.r.usage || {}, provider) : 0);
  const note = (x) => { calls.total++; if (x.ok) { calls.ok++; budget.own += usd(x); } else { if (x.status === 429) calls.rate_limited++; else if (x.kind === 'timeout') calls.timeout++; else if (x.kind === 'empty_or_unusable') calls.empty_or_unusable++; else calls.other_error++; if (errs.length < 5) errs.push(x.msg); } return x; };
    const overBudget = () => provider === 'munito' && budget.own > budget.max;
  const guard = (fn) => async () => { if (overBudget()) return { ok: false, ms: 0, kind: 'budget_stop', msg: 'budget stop' }; return note(await timed(fn)); };
  const row = { model, provider };

  const shortT = await pool(CONC, Array.from({ length: SHORT_N }, () => guard(() => run.chat('Answer in one short sentence.', 'Why is the sky blue?', 400))));
  const sok = shortT.filter((x) => x.ok);
  row.short = { n: SHORT_N, ok: sok.length, p50_ms: pct(sok.map((x) => x.ms), 0.5), p95_ms: pct(sok.map((x) => x.ms), 0.95), cost_usd: shortT.reduce((s, x) => s + usd(x), 0) };

  const longT = await pool(CONC, Array.from({ length: LONG_N }, () => guard(() => run.chat('', long, 400))));
  const lok = longT.filter((x) => x.ok);
  row.long = { n: LONG_N, ok: lok.length, input_tokens_avg: lok.length ? Math.round(lok.reduce((s, x) => s + (x.r.usage.input_tokens || 0), 0) / lok.length) : null,
    p50_ms: pct(lok.map((x) => x.ms), 0.5), p95_ms: pct(lok.map((x) => x.ms), 0.95),
    out_tok_per_s: lok.length && lok.every((x) => x.r.usage.output_tokens) ? +(lok.reduce((s, x) => s + x.r.usage.output_tokens / (x.ms / 1000), 0) / lok.length).toFixed(1) : null,
    cost_usd: longT.reduce((s, x) => s + usd(x), 0) };

  const schema = { type: 'object', properties: { answer: { type: 'number' }, reason: { type: 'string' } }, required: ['answer', 'reason'], additionalProperties: false };
  const stT = await pool(CONC, Array.from({ length: STRUCT_N }, (_, i) => {
    const a = 12 + i * 7, b = 3 + i;
    return async () => { const x = await guard(() => run.structured('Solve the arithmetic problem.', `What is ${a} * ${b}?`, schema))(); x.correct = x.ok && Number(x.r.data.answer) === a * b; return x; };
  }));
  row.structured = { n: STRUCT_N, valid: stT.filter((x) => x.ok).length, correct: stT.filter((x) => x.correct).length, cost_usd: stT.reduce((s, x) => s + usd(x), 0) };

  const sys = 'Answer the multiple-choice question. Reply with only the letter of the correct choice (A, B, C or D).';
  const mcT = await pool(CONC, items.map((q) => async () => {
    const x = await guard(() => run.chat(sys, `${q.prompt}\n${q.choices.map((c, k) => `${LET[k]}. ${c}`).join('\n')}`, 1500))();
    if (x.ok) { const m = x.r.text.match(/\b([ABCD])\b/); x.pick = m ? m[1] : null; x.right = x.pick === q.key; }
    x.bank = q.bank; return x;
  }));
  const byBank = {};
  for (const [b] of BANKS) { const xs = mcT.filter((x) => x.bank === b); byBank[b] = { n: xs.length, right: xs.filter((x) => x.right).length }; }
  const mok = mcT.filter((x) => x.ok);
  row.mcq = { n: items.length, answered: mcT.filter((x) => x.ok && x.pick).length, right: mcT.filter((x) => x.right).length, accuracy: +(mcT.filter((x) => x.right).length / items.length).toFixed(3), by_bank: byBank, cost_usd: mcT.reduce((s, x) => s + usd(x), 0),
    p50_ms: pct(mok.map((x) => x.ms), 0.5), avg_out_tokens: mok.length ? Math.round(mok.reduce((s, x) => s + (x.r.usage.output_tokens || 0), 0) / mok.length) : null };

  row.reliability = { ...calls, error_rate: +((calls.total - calls.ok) / calls.total).toFixed(3), sample_errors: errs };
  const total = row.short.cost_usd + row.long.cost_usd + row.structured.cost_usd + row.mcq.cost_usd;
  row.cost = { counted_usd: +total.toFixed(6), per_mcq_call_usd: +(row.mcq.cost_usd / Math.max(1, mok.length)).toFixed(6), per_1000_mcq_tasks_usd: +(1000 * row.mcq.cost_usd / Math.max(1, mok.length)).toFixed(3), note: provider === 'munito' ? 'successful calls at list price; failed calls are not billed unless counted in the ledger delta' : 'free tier: $0' };
  if (calls.rate_limited > calls.total / 2) row.skipped = 'rate limited (429) on most calls';
  return row;
}

async function main() {
  const { items, pools } = loadItems();
  const long = longPrompt(items);
  const models = (arg('--models') ? arg('--models').split(',') : MODELS);
  const budget = { max: Number(arg('--budget') || 3), start: ledger.status().spent_usd, own: 0 };
  const out = { generated_at: new Date().toISOString(), label: 'AI-model answers graded against Savant bank keys; not real-learner results', ledger_file: ledger.FILE(), ledger_spent_before: budget.start, budget_usd: budget.max, item_sources: pools.map((p) => ({ bank: p.bank, file: p.file, drawn: PER_BANK, of: p.n })), seed: 20261104, models: [], baseline: [], not_chat: ['perplexity-ai/pplx-decider-v1.2 (answers 400 on chat; not a chat model)'] };
  if (flag('--free-baseline') && !arg('--models')) {
    out.baseline = await Promise.all(BASELINE.map((m) => benchModel(m, 'nvidia-free', items, long, budget).catch((e) => ({ model: m, provider: 'nvidia-free', skipped: String(e.message).slice(0, 120) }))));
  } else {
    out.models = await Promise.all(models.map((m) => benchModel(m, 'munito', items, long, budget)));
    if (flag('--free-baseline')) out.baseline = await Promise.all(BASELINE.map((m) => benchModel(m, 'nvidia-free', items, long, budget).catch((e) => ({ model: m, provider: 'nvidia-free', skipped: String(e.message).slice(0, 120) }))));
  }
  out.ledger_spent_after = ledger.status().spent_usd;
  out.own_counted_usd = +budget.own.toFixed(6);
  out.ledger_delta_note = "ledger delta also includes any other process spending on the same ledger meanwhile";
  out.ledger_delta_usd = +(out.ledger_spent_after - budget.start).toFixed(6);
  const file = arg('--out') || path.join(__dirname, '..', 'curriculum-build', 'munito-eval', out.models.length ? 'munito-eval.json' : 'baseline.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  for (const r of [...out.models, ...out.baseline]) console.log(`${r.model}: mcq ${r.mcq ? r.mcq.right + '/' + r.mcq.n : '-'} struct ${r.structured ? r.structured.valid + '/10' : '-'} short p50 ${r.short && r.short.p50_ms}ms err ${r.reliability && r.reliability.error_rate}${r.skipped ? ' SKIPPED ' + r.skipped : ''}`);
  console.log(`ledger delta $${out.ledger_delta_usd}; wrote ${file}`);
}
if (require.main === module) main().catch((e) => { console.error(String(e.stack || e).slice(0, 500)); process.exit(1); });
module.exports = { loadItems, longPrompt };
