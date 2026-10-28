#!/usr/bin/env node
/**
 * A small REAL batch through the model pool (owner, 2026-10-27): 20 short pipeline prompts
 * (general knowledge and arithmetic, no learner data) across the real free slots plus the one
 * cheap paid slot, Standard Compute, which pulls only because the deadline below is shorter than
 * the free slots can meet. Prints wall time, finish spread, per-slot counts and the real spend, and
 * the same prompts sent one after another on the old path (AI_POOL=0, the app's chain walk)
 * for the first few, scaled up.
 *
 *   node scripts/pool-real-batch.js [--n=20] [--deadline-s=25] [--baseline=4] [--budget=0.10]
 *
 * Keys are read by the night runner's loader (only the names listed here, never printed). Standard
 * Compute spend goes through data/standard-compute-ledger.json ($15 total). OpenRouter is used only
 * through its ":free" routes with a $0 price cap (services/providers/free-apis.js). The Anthropic key
 * is not loaded. A throwaway DB file is used: data/db.json is never opened.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? Number(a.slice(n.length + 3)) : d; };
const N = arg('n', 20);
const DEADLINE_S = arg('deadline-s', 25);
const BASELINE = arg('baseline', 4);
const BUDGET = arg('budget', 0.10);

process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pool-real-')), 'db.json');
require(path.join(ROOT, 'curriculum-build', 'staged', 'night-runner', 'env.js')).loadKeys([
  'NVIDIA_API_KEY', 'NVIDIA_BASE_URL', 'XKIRO_API_KEY', 'XKIRO_BASE_URL', 'UNOROUTER_API_KEY', 'UNOROUTER_BASE_URL',
  'STANDARD_COMPUTE_API_KEY', 'STANDARD_COMPUTE_BASE_URL', 'OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL',
]);
delete process.env.ANTHROPIC_API_KEY;
process.env.XKIRO_PIPELINE = '1';
process.env.UNOROUTER_PIPELINE = '1';
process.env.STANDARD_COMPUTE_PIPELINE = '1';

const pool = require('../services/pool');
const providers = require('../services/providers');
const ledger = require('../services/standard-compute-ledger');
const xk = require('../services/providers/xkiro');

const QA = [
  ['What is 17 x 23?', '391'], ['What is the capital of Australia?', 'canberra'], ['What is the chemical symbol for gold?', 'au'],
  ['How many sides does a hexagon have?', '6'], ['What is the square root of 144?', '12'], ['Which is the largest planet in our solar system?', 'jupiter'],
  ['What is 15 percent of 200?', '30'], ['Who wrote the play Hamlet?', 'shakespeare'], ['At what Celsius temperature does water boil at sea level?', '100'],
  ['What is the capital of Canada?', 'ottawa'], ['What is 9 factorial divided by 8 factorial?', '9'], ['What is the process by which plants make food from light called?', 'photosynthesis'],
  ['How many degrees are in a right angle?', '90'], ['What is 2 to the power of 10?', '1024'], ['What is the capital of Japan?', 'tokyo'],
  ['What is the smallest prime number?', '2'], ['How many continents are there?', '7'], ['What is the chemical formula of table salt?', 'nacl'],
  ['What is 144 divided by 12?', '12'], ['Which planet is known as the Red Planet?', 'mars'],
];
const SCHEMA = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false };
const SYSTEM = 'Answer the question. Reply with one JSON object {"answer": "<the short final answer only>"}.';
const valid = (qa) => (res) => {
  const a = String((res && res.data && res.data.answer) || '').toLowerCase().replace(/[\s,]/g, '');
  return a.includes(qa[1]) ? true : { ok: false, reason: `wrong or empty answer: ${a.slice(0, 40)}` };
};
const reqOf = (i) => ({ kind: 'structured', role: 'blocks', task: 'pool_batch_test', dataClass: 'pipeline', system: SYSTEM, user: QA[i % QA.length][0], schema: SCHEMA, schemaName: 'submit_answer', maxTokens: 300 });

(async () => {
  const sc0 = ledger.init();
  const xk0 = xk.freeTokensToday();
  const grant0 = xk.grantTokensUsed('minimax/minimax-m3.1-flash');
  const preview = pool.candidatesFor(reqOf(0));
  console.log('slots for this task (enabled?):');
  for (const s of preview) console.log(`  ${s.paid ? '$' : ' '} ${s.id}  conc ${s.maxConcurrent}  ${s.isEnabled() ? 'enabled' : 'DISABLED'}`);

  // ── the pooled batch ──
  const items = Array.from({ length: N }, (_, i) => ({ id: i, req: reqOf(i), validate: valid(QA[i % QA.length]) }));
  const t0 = Date.now();
  const { results, report } = await pool.runBatch(items, { deadlineMs: DEADLINE_S * 1000, budgetUsd: BUDGET, timeoutMs: 120000, pollMs: 250 });
  const wall = Date.now() - t0;

  // ── the old path, one after another (AI_POOL=0: the app's plain chain walk), for the first few prompts ──
  const ai = require('../services/ai');
  process.env.AI_POOL = '0';
  const seq = [];
  for (let i = 0; i < Math.min(BASELINE, N); i++) {
    const s0 = Date.now();
    let out = null;
    try { out = await ai.structured({ role: 'blocks', task: 'pool_batch_test', system: SYSTEM, user: QA[i][0], schema: SCHEMA, schemaName: 'submit_answer', maxTokens: 300, dataClass: 'pipeline' }); } catch (e) { out = null; }
    seq.push({ ms: Date.now() - s0, ok: out ? valid(QA[i])({ data: out }) === true : false });
  }
  const seqMean = seq.length ? seq.reduce((a, b) => a + b.ms, 0) / seq.length : null;

  const sc1 = ledger.status();
  console.log('\n=== pooled batch ===');
  console.log(JSON.stringify({
    items: N, ok: report.ok, failed: report.failed, wall_s: Number((wall / 1000).toFixed(1)), deadline_s: DEADLINE_S, met_deadline: report.met_deadline,
    finish_s: report.finish && { first: report.finish.first_ms / 1000, p50: report.finish.p50_ms / 1000, p90: report.finish.p90_ms / 1000, last: report.finish.last_ms / 1000, last_tenth_spread: report.finish.last_tenth_spread_ms / 1000, last_tenth_n: report.finish.last_tenth_n },
    hedges: report.hedges, cost_usd: report.cost_usd, paid_pulls: report.paid_pulls,
  }, null, 1));
  console.log('per slot:');
  for (const [id, r] of Object.entries(report.per_slot)) if (r.pulled) console.log(`  ${r.paid ? '$' : ' '} ${id}: wins ${r.wins}, pulled ${r.pulled}, failed ${r.failed}, invalid ${r.invalid}, aborted ${r.aborted}, p50 ${r.p50_ms ? (r.p50_ms / 1000).toFixed(1) : '-'}s, usd ${r.usd}`);
  console.log('wrong or failed items:', results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.error}`).join(' | ') || 'none');
  console.log('\n=== old path, one after another ===');
  console.log(JSON.stringify({ measured_items: seq.length, each_ms: seq.map((s) => s.ms), all_valid: seq.every((s) => s.ok), mean_s: seqMean && Number((seqMean / 1000).toFixed(1)), estimate_for_n_s: seqMean && Number(((seqMean * N) / 1000).toFixed(0)) }, null, 1));
  console.log('\n=== spend ===');
  console.log(JSON.stringify({
    standard_compute_ledger: { spent_before: sc0.spent_usd, spent_after: sc1.spent_usd, delta_usd: Number((sc1.spent_usd - sc0.spent_usd).toFixed(6)), cap: sc1.cap_usd, calls: sc1.calls, reserved_open: sc1.reserved_usd },
    xkiro_free_tokens_delta_24h: xk.freeTokensToday() - xk0, xkiro_minimax_grant_tokens_delta: xk.grantTokensUsed('minimax/minimax-m3.1-flash') - grant0,
    openrouter: 'only :free routes at a $0 price cap (providers/free-apis.js); anthropic key not loaded',
  }, null, 1));
  void providers;
  process.exit(0);
})().catch((e) => { console.error('real batch failed:', String(e && e.stack || e).slice(0, 600)); process.exit(1); });
