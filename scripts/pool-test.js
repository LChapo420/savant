/**
 * services/pool.js, with fake slots (different latencies, failures, one that hangs) and the
 * real Standard Compute ledger / provider on a mocked fetch. No network, no spend.
 *
 *   node scripts/pool-test.js [--report]     --report prints the measured figures as JSON
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-test-'));
process.env.STANDARD_COMPUTE_LEDGER_FILE = path.join(tmp, 'sc-ledger.json');
process.env.ANTHROPIC_LEDGER_FILE = path.join(tmp, 'anthropic-ledger.json');
process.env.MODEL_LINEUP_FILE = path.join(tmp, 'lineup.json');
process.env.STANDARD_COMPUTE_API_KEY = 'test-key-not-real';
process.env.STANDARD_COMPUTE_PIPELINE = '1';
delete process.env.STANDARD_COMPUTE_CAP_USD;

const pool = require('../services/pool');
const scLedger = require('../services/standard-compute-ledger');
const sc = require('../services/providers/standard-compute');

let failures = 0;
const figures = {};
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`);
  else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`); }
}

// a seeded generator, so the static split and the pool see the same latencies
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** A fake slot: latency = base * (0.7 + 0.6 * rand), honours the abort signal, can fail or hang. */
function fake(o) {
  const rand = rng(o.seed || 7);
  const seen = { calls: 0, aborted: 0, items: [], completed: 0 };
  const slot = pool.makeSlot({
    id: o.id, provider: o.provider || 'fake', maxConcurrent: o.conc || 2, dataClass: o.cls || 'learner', priceIn: o.price || 0, priceOut: o.price || 0,
    latencyHintMs: o.base, hedgeable: true, timeoutMs: o.timeoutMs || null, extra: !!o.extra, rpm: o.rpm || null,
    canSpend: o.canSpend || null, estimateUsd: o.price ? () => o.price / 1000 : null, costOf: o.price ? () => o.price / 1000 : null,
    call: async (req, ctx) => {
      seen.calls++;
      seen.items.push(req.n);
      const n = seen.calls;
      if (o.hangFirst && n <= o.hangFirst) {
        await new Promise((resolve, reject) => { ctx.signal.addEventListener('abort', () => { seen.aborted++; reject(Object.assign(new Error('aborted'), { aborted: true })); }, { once: true }); });
      }
      if (o.hangAlways) {
        await new Promise((resolve, reject) => { ctx.signal.addEventListener('abort', () => { seen.aborted++; reject(Object.assign(new Error('aborted'), { aborted: true })); }, { once: true }); });
      }
      const ms = o.base * (0.7 + 0.6 * rand());
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        ctx.signal.addEventListener('abort', () => { clearTimeout(t); seen.aborted++; reject(Object.assign(new Error('aborted'), { aborted: true })); }, { once: true });
      });
      if (o.failEvery && n % o.failEvery === 0) throw Object.assign(new Error('boom'), { status: 503 });
      if (o.invalidEvery && n % o.invalidEvery === 0) return { data: { bad: true }, model: o.id, usage: { input_tokens: 10, output_tokens: 10 } };
      seen.completed++;
      return { data: { ok: true, n: req.n, by: o.id }, model: o.id, usage: { input_tokens: 10, output_tokens: 10 } };
    },
  });
  slot.seen = seen;
  return slot;
}
const items = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: i, req: { n: i, role: 'fast', task: 'pool_test', kind: 'structured', ...extra } }));
const validOk = (r) => !!(r && r.data && r.data.ok === true);

/** Finish times of a static even split: item i goes to slot i % S; each slot runs its share with its own concurrency. */
function staticSplit(slots, n) {
  const times = [];
  slots.forEach((s, si) => {
    const rand = rng(s.seed);
    const free = Array(s.conc).fill(0);
    for (let i = si; i < n; i += slots.length) {
      free.sort((a, b) => a - b);
      const t = free[0] + s.base * (0.7 + 0.6 * rand());
      free[0] = t;
      times.push(t);
    }
  });
  times.sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(times.length * 0.1));
  const last = times.slice(-k);
  return { wall: times[times.length - 1], spread: last[last.length - 1] - last[0] };
}

async function main() {
  // ── 1. work stealing evens the finish times ──────────────────────────────────
  console.log('work stealing vs a static even split');
  {
    pool._reset();
    const spec = [{ id: 'fast', base: 80, conc: 4, seed: 11 }, { id: 'mid', base: 240, conc: 3, seed: 12 }, { id: 'slow', base: 900, conc: 2, seed: 13 }];
    const slots = spec.map(fake);
    const N = 90;
    const stat = staticSplit(spec, N);
    const { results, report } = await pool.runBatch(items(N), { slots, validate: validOk, hedge: true, hedgeFloorMs: 150 });
    check('all 90 items done', report.ok === N && results.every((r) => r.ok), report);
    check('the fast slot took the most', report.per_slot.fast.wins > report.per_slot.mid.wins && report.per_slot.mid.wins >= report.per_slot.slow.wins, report.per_slot);
    check('wall time beats the static split', report.wall_ms < stat.wall, { pool: report.wall_ms, static: stat.wall });
    check('the last 10% finish closer together than under the static split', report.finish.last_tenth_spread_ms < stat.spread, { pool: report.finish.last_tenth_spread_ms, static: stat.spread });
    figures.work_stealing = {
      items: N,
      pool: { wall_ms: report.wall_ms, last_tenth_spread_ms: report.finish.last_tenth_spread_ms, wins: Object.fromEntries(Object.entries(report.per_slot).map(([k, v]) => [k, v.wins])) },
      static_even_split: { wall_ms: Math.round(stat.wall), last_tenth_spread_ms: Math.round(stat.spread) },
    };
  }

  // ── 2. hedging rescues a hanging call ────────────────────────────────────────
  console.log('hedging a single call');
  {
    pool._reset();
    const hang = fake({ id: 'hang', base: 50, hangAlways: true });
    const good = fake({ id: 'good', base: 60 });
    const t0 = Date.now();
    const trace = {};
    const r = await pool.callHedged({ n: 1, role: 'fast', task: 'pool_test', kind: 'structured' }, { slots: [hang, good], validate: validOk, hedgeAfterMs: 150, timeoutMs: 3000, trace });
    const took = Date.now() - t0;
    check('the hedge answered', r && r.data.by === 'good', r && r.data);
    check('it answered at about hedgeAfter + one call, not at the timeout', took < 600, took);
    check('the hanging attempt was aborted', hang.seen.aborted === 1, hang.seen);
    check('the result says it was hedged', r && r.pool.hedged === true && r.pool.slot === 'good', r && r.pool);
    figures.hedge_rescue = { hedge_after_ms: 150, answered_ms: took, per_call_timeout_ms: 3000 };

    // an invalid answer is a failure and the call goes elsewhere
    const bad = fake({ id: 'bad', base: 20, invalidEvery: 1 });
    const good2 = fake({ id: 'good2', base: 20 });
    const r2 = await pool.callHedged({ n: 2, role: 'fast', task: 'pool_test', kind: 'structured' }, { slots: [bad, good2], validate: validOk, hedgeAfterMs: 5000, timeoutMs: 3000 });
    check('an invalid answer goes to the next slot', r2 && r2.pool.slot === 'good2' && bad.stats.invalid === 1, r2 && r2.pool);

    // the hard timeout: nothing hangs for minutes
    const hang2 = fake({ id: 'hang2', base: 50, hangAlways: true });
    const t1 = Date.now();
    const r3 = await pool.callHedged({ n: 3, role: 'fast', task: 'pool_test', kind: 'structured' }, { slots: [hang2], validate: validOk, hedgeAfterMs: 100, timeoutMs: 400, maxTotalMs: 900 });
    const took3 = Date.now() - t1;
    check('only a hanging slot: null at the timeout, not later', r3 === null && took3 < 800, { r3, took3 });
    check('its breaker counts the timeout', hang2.stats.failed >= 1, hang2.describe());
    figures.hard_timeout = { configured_ms: 400, returned_after_ms: took3 };
  }

  // ── 3. tail hedging inside a batch ───────────────────────────────────────────
  console.log('tail hedging in a batch');
  {
    pool._reset();
    // slot A hangs on its first call; B and C are fine. Without a hedge the batch would wait for A's timeout.
    const a = fake({ id: 'A', base: 60, conc: 2, hangFirst: 1, timeoutMs: 4000 });
    const b = fake({ id: 'B', base: 70, conc: 2, seed: 3 });
    const c = fake({ id: 'C', base: 90, conc: 2, seed: 5 });
    const t0 = Date.now();
    const { report } = await pool.runBatch(items(12), { slots: [a, b, c], validate: validOk, hedgeFloorMs: 200 });
    const took = Date.now() - t0;
    check('every item done well before the hung call\'s 4 s timeout', report.ok === 12 && took < 2500, { ok: report.ok, took });
    check('a hedge started and won', report.hedges.started >= 1 && report.hedges.won >= 1, report.hedges);
    check('the hung copy was aborted', a.seen.aborted >= 1, a.seen);
    check('no item got more than 2 extra copies', Object.values(report.per_slot).reduce((n, s) => n + (s.hedge_starts || 0), 0) <= 12 * pool.MAX_EXTRA_COPIES, report.per_slot);
    figures.tail_hedge = { wall_ms: took, hedges: report.hedges };
  }

  // ── 4. paid slots stay idle when the free ones meet the deadline ─────────────
  console.log('paid slots and the deadline');
  {
    pool._reset();
    const f1 = fake({ id: 'free1', base: 60, conc: 4, seed: 21 });
    const f2 = fake({ id: 'free2', base: 90, conc: 4, seed: 22 });
    const paid = fake({ id: 'paid', base: 40, conc: 4, price: 1, seed: 23, cls: 'learner' });
    const easy = await pool.runBatch(items(40), { slots: [f1, f2, paid], validate: validOk, deadlineMs: 20000 });
    check('deadline easily met by the free slots: the paid slot never pulled', paid.seen.calls === 0 && easy.report.cost_usd === 0, { paid_calls: paid.seen.calls, cost: easy.report.cost_usd });

    pool._reset();
    const g1 = fake({ id: 'free1', base: 400, conc: 2, seed: 31 });
    const g2 = fake({ id: 'free2', base: 600, conc: 2, seed: 32 });
    const gp = fake({ id: 'paid', base: 100, conc: 6, price: 1, seed: 33 });
    const tight = await pool.runBatch(items(60), { slots: [g1, g2, gp], validate: validOk, deadlineMs: 2500 });
    const noPaid = await (async () => {
      pool._reset();
      const h1 = fake({ id: 'free1', base: 400, conc: 2, seed: 31 });
      const h2 = fake({ id: 'free2', base: 600, conc: 2, seed: 32 });
      return pool.runBatch(items(60), { slots: [h1, h2], validate: validOk });
    })();
    check('a deadline the free slots cannot meet: the paid slot pulled', gp.seen.calls > 0 && tight.report.cost_usd > 0, { calls: gp.seen.calls, cost: tight.report.cost_usd });
    check('and the batch finished meaningfully sooner than free-only', tight.report.wall_ms < noPaid.report.wall_ms * 0.85, { with_paid: tight.report.wall_ms, free_only: noPaid.report.wall_ms });
    pool._reset();
    const k1 = fake({ id: 'free1', base: 400, conc: 2, seed: 31 });
    const kp = fake({ id: 'paid', base: 100, conc: 6, price: 1, seed: 33 });
    const capped = await pool.runBatch(items(40), { slots: [k1, kp], validate: validOk, deadlineMs: 1500, budgetUsd: 0.005 });
    check('a batch budget caps paid spend', capped.report.cost_usd <= 0.005 + 1e-9 && capped.report.ok === 40, { cost: capped.report.cost_usd, ok: capped.report.ok });
    pool._reset();
    const m1 = fake({ id: 'free1', base: 400, conc: 2, seed: 31 });
    const mp = fake({ id: 'paid', base: 100, conc: 6, price: 1, seed: 33 });
    const nodl = await pool.runBatch(items(12), { slots: [m1, mp], validate: validOk });
    check('no deadline given: free slots only', mp.seen.calls === 0 && nodl.report.ok === 12, { paid_calls: mp.seen.calls });
    figures.paid_idle = {
      deadline_met_by_free_only: { paid_calls: paid.seen.calls, cost_usd: easy.report.cost_usd, wall_ms: easy.report.wall_ms },
      deadline_too_tight: { paid_calls: gp.seen.calls, cost_usd: tight.report.cost_usd, wall_ms_with_paid: tight.report.wall_ms, wall_ms_free_only: noPaid.report.wall_ms, deadline_ms: 2500 },
    };
  }

  // ── 5. the Standard Compute ledger stops spend at the cap ────────────────────
  console.log('ledgers');
  {
    const st = scLedger.init();
    check('the ledger is created at $0.50 spent, cap $15', Math.abs(st.spent_usd - 0.5) < 1e-9 && st.cap_usd === 15, st);
    check('the cap cannot be raised by the environment', (() => { process.env.STANDARD_COMPUTE_CAP_USD = '99'; const c = scLedger.status().cap_usd; delete process.env.STANDARD_COMPUTE_CAP_USD; return c === 15; })());

    // a tiny cap through the real provider on a mocked fetch: spend stops, no request is sent past it
    process.env.STANDARD_COMPUTE_CAP_USD = '0.52'; // $0.02 of headroom over the $0.50 seed
    let sent = 0;
    sc._setFetch(async () => {
      sent++;
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }], usage: { prompt_tokens: 1000, output_tokens: 0, completion_tokens: 8000 } }) };
    });
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
    let refused = 0;
    let done = 0;
    for (let i = 0; i < 12; i++) {
      try { await sc.standardCompute.structured({ task: 'pool_test', system: 's', user: 'u', schema, maxTokens: 1000 }); done++; } catch (e) { if (e.code === 'LEDGER_STOP') refused++; else throw e; }
    }
    const after = scLedger.status();
    check('some calls ran, then the ledger refused the rest', done > 0 && refused > 0 && sent === done, { done, refused, sent });
    check('committed spend never passed the cap', after.committed_usd <= 0.52 + 1e-9, after);
    check('a refused call sent nothing (requests = settled calls)', sent === done, { sent, done });
    delete process.env.STANDARD_COMPUTE_CAP_USD;
    // an HTTP error answered by the API is not billed; a network failure counts the reservation
    const before = scLedger.status().spent_usd;
    sc._setFetch(async () => ({ ok: false, status: 500, statusText: 'x', text: async () => '{"error":{"message":"down"}}' }));
    await sc.standardCompute.structured({ task: 'pool_test', system: 's', user: 'u', schema, maxTokens: 1000 }).catch(() => {});
    check('an HTTP 500 is not billed', Math.abs(scLedger.status().spent_usd - before) < 1e-9, scLedger.status());
    sc._setFetch(async () => { throw new Error('socket hang up'); });
    await sc.standardCompute.structured({ task: 'pool_test', system: 's', user: 'u', schema, maxTokens: 1000 }).catch(() => {});
    check('a network failure is counted at its reservation', scLedger.status().spent_usd > before, scLedger.status());
    sc._setFetch(null);
    figures.ledger = { start: st.spent_usd, cap: st.cap_usd, tiny_cap_run: { done, refused, committed_usd: after.committed_usd } };
  }

  // ── 6. data classes: learner data never reaches a pipeline slot ──────────────
  console.log('data classes');
  {
    pool._reset();
    const learnerSlot = fake({ id: 'app-chain', base: 30, conc: 3, cls: 'learner' });
    const pipe = fake({ id: 'pipe', base: 20, conc: 8, cls: 'pipeline', extra: true, seed: 9 });
    // the quality gate would also need an allowlist for an extra slot; allow it for this task
    fs.writeFileSync(process.env.MODEL_LINEUP_FILE, JSON.stringify({ pool: { tasks: { pool_test: { allow: ['pipe'] } } } }));
    pool._reset();
    const mixed = [];
    for (let i = 0; i < 30; i++) {
      mixed.push({ id: `l${i}`, req: { n: i, role: 'fast', task: 'pool_test', kind: 'structured', dataClass: 'learner' } }); // explicit learner
      mixed.push({ id: `d${i}`, req: { n: 100 + i, role: 'fast', task: 'pool_test', kind: 'structured' } }); // no class given: learner
      mixed.push({ id: `u${i}`, req: { n: 200 + i, role: 'fast', task: 'pool_test', kind: 'structured', dataClass: 'pipeline', userId: 7 } }); // a user attached: learner
      mixed.push({ id: `p${i}`, req: { n: 300 + i, role: 'fast', task: 'pool_test', kind: 'structured', dataClass: 'pipeline' } }); // pipeline
    }
    const { report } = await pool.runBatch(mixed, { slots: [learnerSlot, pipe], validate: validOk });
    const pipeSaw = pipe.seen.items;
    check('every item done', report.ok === mixed.length, report);
    check('the pipeline slot saw only pipeline items (n >= 300)', pipeSaw.length > 0 && pipeSaw.every((n) => n >= 300), pipeSaw.filter((n) => n < 300));
    check('the pipeline slot took a share of the pipeline items', pipe.seen.completed > 0, pipe.seen);
    // a request that only a pipeline slot could serve, but is learner data: failed, not sent
    const lone = await pool.runBatch([{ id: 'x', req: { n: 5, role: 'fast', task: 'pool_test', kind: 'structured', userId: 3, dataClass: 'pipeline' } }], { slots: [pipe], validate: validOk });
    check('learner data with only a pipeline slot available is refused, not sent', lone.results[0].ok === false && pipe.seen.items.filter((n) => n === 5).length === 0, lone.results[0]);
    const single = await pool.callHedged({ n: 6, role: 'fast', task: 'pool_test', kind: 'structured' }, { slots: [pipe], validate: validOk });
    check('callHedged: a learner call on a pipeline-only list gets null and sends nothing', single === null && !pipe.seen.items.includes(6), pipe.seen.items.slice(-3));
    // the pipeline variant: the caller strips learner data and the pipeline slot sees the stripped request
    let sawUser = null;
    const pipe2 = pool.makeSlot({ id: 'pipe2', dataClass: 'pipeline', extra: true, maxConcurrent: 1, call: async (rq) => { sawUser = rq.user; return { data: { ok: true }, model: 'p2' }; } });
    const lr = pool.makeSlot({ id: 'lr', dataClass: 'learner', maxConcurrent: 1, call: async () => { throw Object.assign(new Error('down'), { status: 503 }); } });
    fs.writeFileSync(process.env.MODEL_LINEUP_FILE, JSON.stringify({ pool: { tasks: { pool_test: { allow: ['pipe*'] } } } }));
    pool._reset();
    const sv = await pool.callHedged({ n: 7, role: 'fast', task: 'pool_test', kind: 'structured', dataClass: 'pipeline', user: 'FULL TEXT with a name', pipelineVariant: { user: 'STRIPPED' } }, { slots: [lr, pipe2], validate: validOk, hedgeAfterMs: 5000 });
    check('pipelineVariant: a pipeline slot sees the stripped text', sv && sawUser === 'STRIPPED', { sawUser });
    figures.data_classes = { pipeline_slot_items_seen: pipeSaw.length, learner_items_seen_by_pipeline_slot: pipeSaw.filter((n) => n < 300).length };
  }

  // ── 7. the quality gate and the breaker ──────────────────────────────────────
  console.log('quality gate and breaker');
  {
    fs.writeFileSync(process.env.MODEL_LINEUP_FILE, JSON.stringify({ pool: { tasks: { allowed_task: { allow: ['xtra:*'] }, denied_task: { deny: ['weak*'], allow: ['xtra:*'] } } } }));
    pool._reset();
    const extra = pool.makeSlot({ id: 'xtra:model', dataClass: 'pipeline', extra: true, call: async () => ({}) });
    const weak = pool.makeSlot({ id: 'weak-one', dataClass: 'learner', call: async () => ({}) });
    const req = (task) => ({ role: 'fast', task, kind: 'structured', dataClass: 'pipeline' });
    check('an extra slot with no allowlist for the task is refused', pool.refusal(extra, req('other_task'), 'structured') !== null, pool.refusal(extra, req('other_task'), 'structured'));
    check('an extra slot listed for the task is allowed', pool.refusal(extra, req('allowed_task'), 'structured') === null);
    check('a denied slot is refused for that task only', pool.refusal(weak, req('denied_task'), 'structured') !== null && pool.refusal(weak, req('allowed_task'), 'structured') === null);
    check('a pipeline slot is refused for a learner request even if listed', pool.refusal(extra, { role: 'fast', task: 'allowed_task', kind: 'structured' }, 'structured') !== null);

    pool._reset();
    // breaker: three failures open it; after the open window one probe closes it
    process.env.POOL_BREAKER_OPEN_MS = '600';
    const flaky = fake({ id: 'flaky', base: 10, conc: 1, failEvery: 1 });
    for (let i = 0; i < 3; i++) await pool.callHedged({ n: i, role: 'fast', task: 'pool_test', kind: 'structured' }, { slots: [flaky], validate: validOk, hedgeAfterMs: 5000, timeoutMs: 500, maxTotalMs: 800 });
    check('three failures in a row open the breaker', flaky.breaker.state === 'open', flaky.breaker);
    const callsBefore = flaky.seen.calls;
    const healthy = fake({ id: 'healthy', base: 10, conc: 2 });
    const rb = await pool.runBatch(items(4), { slots: [flaky, healthy], validate: validOk, hedge: false });
    check('an open breaker is not pulled from, the healthy slot takes everything', flaky.seen.calls === callsBefore && rb.report.ok === 4, { callsBefore, after: flaky.seen.calls, ok: rb.report.ok });
    await sleep(700);
    check('after the window it is half-open (one probe)', !flaky.breakerOpen() && flaky.breaker.state === 'half-open', flaky.breaker);
    delete process.env.POOL_BREAKER_OPEN_MS;
    figures.breaker = { opened_after: 3 };
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  if (process.argv.includes('--report')) console.log(JSON.stringify(figures, null, 1));
  console.log(failures ? `\n${failures} FAILED` : '\nall pool checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
