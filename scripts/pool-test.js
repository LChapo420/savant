#!/usr/bin/env node
/**
 * The model pool (services/pool.js), against FAKE slots with different speeds, failures
 * and one that hangs. Nothing real is called or spent: ledgers are throwaway files and
 * the one paid provider that is exercised (Standard Compute) gets a stand-in `fetch`.
 *
 *   node scripts/pool-test.js            (prints the measured numbers too)
 *
 * What it proves:
 *   - work stealing evens out finish times (last-10% spread and wall time) against a
 *     static even split over the same slots;
 *   - tail hedging rescues a call that hangs (batch) and callHedged rescues one too;
 *   - a hard timeout bounds a call when every slot hangs;
 *   - paid slots stay idle when the free slots meet the deadline, and pull when they do not;
 *   - the Standard Compute and Anthropic ledgers stop at their caps;
 *   - learner data never reaches a pipeline-class slot, and a slot that is not listed as
 *     good enough for a task never serves it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-test-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
process.env.STANDARD_COMPUTE_LEDGER_FILE = path.join(tmp, 'sc-ledger.json');
process.env.ANTHROPIC_LEDGER_FILE = path.join(tmp, 'anthropic-ledger.json');
for (const k of ['XKIRO_PIPELINE', 'UNOROUTER_PIPELINE', 'STANDARD_COMPUTE_PIPELINE', 'STANDARD_COMPUTE_API_KEY', 'XKIRO_API_KEY']) delete process.env[k];

const pool = require('../services/pool');

let failed = 0;
const numbers = {};
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${String(err.stack).split('\n').slice(0, 4).join('\n     ')}`); }
}
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const abortable = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { aborted: true })); }, { once: true });
});
function rand(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A fake slot. o: ms (mean latency), jitter, conc, failRate, hangOn(k), invalidOn(k), price (USD per call, makes it paid), dataClass, hedgeable, canSpend. */
function fake(id, o = {}) {
  const rng = rand(o.seed || (id.length * 7919 + 13));
  let n = 0;
  const log = [];
  const slot = pool.makeSlot({
    id, provider: id, label: id, maxConcurrent: o.conc || 2, latencyHintMs: o.ms || 30, dataClass: o.dataClass || 'learner',
    priceIn: o.price ? 1 : 0, priceOut: o.price ? 1 : 0, hedgeable: o.hedgeable, canSpend: o.canSpend || null,
    estimateUsd: o.price ? () => o.price : null, costOf: o.price ? () => o.price : null,
    call: async (req, ctx) => {
      const k = ++n;
      log.push({ k, item: req.n, cls: req.dataClass || 'learner', user: req.userId || null, at: Date.now() });
      if (o.hangOn && o.hangOn(k)) {
        await new Promise((_, rej) => ctx.signal.addEventListener('abort', () => { slot.aborts = (slot.aborts || 0) + 1; rej(Object.assign(new Error('aborted'), { aborted: true })); }, { once: true }));
      }
      await abortable((o.ms || 30) * (1 + (rng() - 0.5) * 2 * (o.jitter == null ? 0.3 : o.jitter)), ctx.signal);
      if (o.failRate && rng() < o.failRate) throw Object.assign(new Error('503 busy'), { status: 503 });
      if (o.invalidOn && o.invalidOn(k)) return { data: { n: req.n, by: id, bad: true }, usage: { input_tokens: 50, output_tokens: 50 }, model: id };
      return { data: { n: req.n, by: id }, usage: { input_tokens: 50, output_tokens: 50 }, model: id };
    },
  });
  slot.log = log;
  return slot;
}

const items = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: i, req: { n: i, kind: 'structured', role: 'blocks', task: 'pool_batch_test', dataClass: 'pipeline', ...extra } }));
const p90 = (a, q) => a[Math.min(a.length - 1, Math.ceil(q * a.length) - 1)];

/** The same slots, items split evenly up front, each slot working its own share with its own concurrency. */
async function staticSplit(slots, its) {
  const t0 = Date.now();
  const mine = slots.map(() => []);
  its.forEach((it, i) => mine[i % slots.length].push(it));
  const done = [];
  await Promise.all(slots.map(async (s, si) => {
    const queue = [...mine[si]];
    await Promise.all(Array.from({ length: s.maxConcurrent }, async () => {
      while (queue.length) {
        const it = queue.shift();
        await s.call(it.req, { signal: null });
        done.push(Date.now() - t0);
      }
    }));
  }));
  done.sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(done.length * 0.1));
  return { wall: done[done.length - 1], spread: done[done.length - 1] - done[done.length - k], k };
}

(async () => {
  // ── 1. work stealing against a static even split ─────────────────────────────
  await check('work stealing: fast slots take more, and the last 10% finish together (vs a static split)', async () => {
    const mk = () => [fake('A', { ms: 20, seed: 1 }), fake('B', { ms: 40, seed: 2 }), fake('C', { ms: 80, seed: 3 }), fake('D', { ms: 160, seed: 4 })];
    const its = items(120);
    const st = await staticSplit(mk(), its);
    const slots = mk();
    const { results, report } = await pool.runBatch(its, { slots, hedgeFloorMs: 30, pollMs: 10, timeoutMs: 5000 });
    assert.strictEqual(report.ok, 120);
    assert.ok(results.every((r) => r.ok), 'every item done');
    const counts = Object.fromEntries(slots.map((s) => [s.id, report.per_slot[s.id].wins]));
    numbers.work_stealing = { items: 120, static: st, pool: { wall_ms: report.wall_ms, last_tenth_spread_ms: report.finish.last_tenth_spread_ms, last_tenth_n: report.finish.last_tenth_n }, wins_by_slot: counts, hedges: report.hedges };
    assert.ok(counts.A > counts.B && counts.B > counts.C && counts.C > counts.D, `faster slots took more: ${JSON.stringify(counts)}`);
    assert.ok(report.wall_ms < st.wall * 0.6, `wall ${report.wall_ms} ms vs static ${st.wall} ms`);
    assert.ok(report.finish.last_tenth_spread_ms < st.spread * 0.5, `last-10% spread ${report.finish.last_tenth_spread_ms} ms vs static ${st.spread} ms`);
    assert.strictEqual(report.cost_usd, 0);
  });

  // ── 2. tail hedging rescues a hanging call ───────────────────────────────────
  await check('hedging: an item stuck on a hung slot is re-issued, first valid result wins, the stuck copy is aborted', async () => {
    const mk = () => [fake('A', { ms: 30, seed: 5, hangOn: (k) => k === 4 }), fake('B', { ms: 45, seed: 6 }), fake('C', { ms: 60, seed: 7 })];
    const its = items(30);
    const hung = mk();
    const noHedge = await pool.runBatch(its, { slots: hung, hedge: false, timeoutMs: 1500, pollMs: 10 });
    const slots = mk();
    const withHedge = await pool.runBatch(its, { slots, hedgeFloorMs: 40, pollMs: 10, timeoutMs: 1500 });
    numbers.hedging = { no_hedge_wall_ms: noHedge.report.wall_ms, hedge_wall_ms: withHedge.report.wall_ms, hedges: withHedge.report.hedges, timeout_ms: 1500 };
    assert.ok(noHedge.report.wall_ms >= 1400, `without hedging the hung call waits out the timeout (${noHedge.report.wall_ms} ms)`);
    assert.strictEqual(withHedge.report.ok, 30);
    assert.ok(withHedge.report.wall_ms < 700, `with hedging the batch ends long before the timeout (${withHedge.report.wall_ms} ms)`);
    assert.ok(withHedge.report.hedges.won >= 1, 'a hedge won');
    assert.ok(slots[0].aborts >= 1, 'the hung copy was aborted (AbortController)');
    for (const r of withHedge.results) assert.ok(r.ok);
  });

  await check('hedging: at most 2 extra copies of one item', async () => {
    const slots = [fake('A', { ms: 20, seed: 8, hangOn: () => true, conc: 1 }), fake('B', { ms: 400, seed: 9, conc: 1 }), fake('C', { ms: 400, seed: 10, conc: 1 }), fake('D', { ms: 400, seed: 11, conc: 1 }), fake('E', { ms: 400, seed: 12, conc: 1 })];
    const { report } = await pool.runBatch(items(1), { slots, hedgeFloorMs: 20, pollMs: 5, timeoutMs: 3000 });
    const total = slots.reduce((n, s) => n + s.log.length, 0);
    assert.strictEqual(report.ok, 1);
    assert.ok(total <= 3, `one original + at most 2 extra copies, saw ${total}`);
  });

  // ── 3. callHedged ────────────────────────────────────────────────────────────
  await check('callHedged: a hung first slot is hedged after hedgeAfterMs and the second slot wins', async () => {
    const a = fake('A', { ms: 20, hangOn: () => true });
    const b = fake('B', { ms: 30 });
    const trace = {};
    const t0 = Date.now();
    const res = await pool.callHedged({ kind: 'structured', n: 1, dataClass: 'pipeline' }, { slots: [a, b], hedgeAfterMs: 80, timeoutMs: 2000, trace });
    const ms = Date.now() - t0;
    numbers.call_hedged = { hedged_ms: ms, timeout_ms: 2000 };
    assert.ok(res && res.pool.slot === 'B', 'B answered');
    assert.ok(ms < 400, `answered in ${ms} ms, not the 2000 ms timeout`);
    assert.strictEqual(res.pool.hedged, true);
    assert.ok(a.aborts >= 1, 'the hung attempt was cancelled');
  });

  await check('callHedged: every slot hangs: the hard timeout bounds the whole call', async () => {
    const t0 = Date.now();
    const res = await pool.callHedged({ kind: 'structured', n: 1 }, { slots: [fake('A', { hangOn: () => true }), fake('B', { hangOn: () => true })], hedgeAfterMs: 50, timeoutMs: 200 });
    const ms = Date.now() - t0;
    numbers.call_all_hang_ms = ms;
    assert.strictEqual(res, null);
    assert.ok(ms < 800, `gave up after ${ms} ms (timeout 200 ms, bound 2.5x)`);
  });

  await check('callHedged: an invalid answer is a failure, retried elsewhere', async () => {
    const a = fake('A', { ms: 10, invalidOn: () => true });
    const b = fake('B', { ms: 10 });
    const res = await pool.callHedged({ kind: 'structured', n: 2 }, { slots: [a, b], hedgeAfterMs: 5000, validate: (r) => !r.data.bad, timeoutMs: 1000 });
    assert.ok(res && res.pool.slot === 'B');
    assert.strictEqual(a.stats.invalid, 1);
  });

  await check('callHedged: the best free slot is tried first; a fast answer starts nothing else', async () => {
    const a = fake('A', { ms: 10 });
    const b = fake('B', { ms: 10 });
    const p = fake('P', { ms: 10, price: 0.01 });
    const res = await pool.callHedged({ kind: 'structured', n: 3 }, { slots: [a, b, p], hedgeAfterMs: 500, timeoutMs: 1000 });
    assert.strictEqual(res.pool.slot, 'A');
    assert.strictEqual(b.log.length + p.log.length, 0);
    assert.strictEqual(res.pool.costUsd, 0);
  });

  await check('callHedged: a paid slot is a hedge only when no free slot can be, and only within budget', async () => {
    const a = fake('A', { ms: 10, hangOn: () => true });
    const p = fake('P', { ms: 10, price: 0.01 });
    const ok = await pool.callHedged({ kind: 'structured', n: 4 }, { slots: [a, p], hedgeAfterMs: 50, timeoutMs: 400, budgetUsd: 0.02 });
    assert.ok(ok && ok.pool.slot === 'P' && ok.pool.costUsd > 0, 'paid hedge won');
    const none = await pool.callHedged({ kind: 'structured', n: 5 }, { slots: [fake('A2', { hangOn: () => true }), fake('P2', { price: 0.01 })], hedgeAfterMs: 50, timeoutMs: 300, budgetUsd: 0.001 });
    assert.strictEqual(none, null, 'budget too small: the paid slot never starts');
    const noPaid = await pool.callHedged({ kind: 'structured', n: 6 }, { slots: [fake('A3', { hangOn: () => true }), fake('P3', { price: 0.01 })], hedgeAfterMs: 50, timeoutMs: 300, allowPaid: false });
    assert.strictEqual(noPaid, null);
  });

  await check('callHedged: Claude (not hedgeable) is only the last resort, after every free slot failed', async () => {
    const free = fake('F', { ms: 5, failRate: 1 });
    const claude = fake('CLAUDE', { ms: 5, price: 0.02, hedgeable: false });
    const res = await pool.callHedged({ kind: 'structured', n: 7 }, { slots: [free, claude], hedgeAfterMs: 10, timeoutMs: 500 });
    assert.ok(res && res.pool.slot === 'CLAUDE');
    const slow = fake('S', { ms: 150 });
    const claude2 = fake('CLAUDE2', { ms: 5, price: 0.02, hedgeable: false });
    const res2 = await pool.callHedged({ kind: 'structured', n: 8 }, { slots: [slow, claude2], hedgeAfterMs: 30, timeoutMs: 1000 });
    assert.strictEqual(res2.pool.slot, 'S');
    assert.strictEqual(claude2.log.length, 0, 'Claude was not started as a hedge');
  });

  // ── 4. paid slots and the deadline ───────────────────────────────────────────
  await check('paid slots stay idle when the free slots meet the deadline; they pull when they do not', async () => {
    const mk = () => [fake('F1', { ms: 40, seed: 20 }), fake('F2', { ms: 40, seed: 21 }), fake('PAID', { ms: 20, seed: 22, conc: 6, price: 0.001 })];
    const its = items(60);
    const easy = await pool.runBatch(its, { slots: mk(), deadlineMs: 5000, pollMs: 10, hedge: false });
    const freeOnly = easy.report;
    assert.strictEqual(freeOnly.per_slot.PAID.pulled, 0, 'the paid slot pulled nothing');
    assert.strictEqual(freeOnly.cost_usd, 0);
    assert.strictEqual(freeOnly.met_deadline, true);
    const hard = await pool.runBatch(its, { slots: mk(), deadlineMs: 300, pollMs: 10, hedge: false });
    const noDeadline = await pool.runBatch(its, { slots: mk(), pollMs: 10, hedge: false });
    numbers.paid = { free_only_wall_ms: noDeadline.report.wall_ms, with_paid_wall_ms: hard.report.wall_ms, paid_pulls: hard.report.paid_pulls, cost_usd: hard.report.cost_usd, deadline_ms: 300, easy_deadline_wall_ms: freeOnly.wall_ms };
    assert.strictEqual(noDeadline.report.per_slot.PAID.pulled, 0, 'no deadline: free slots only');
    assert.ok(hard.report.paid_pulls > 0, 'the paid slot pulled work to meet a tight deadline');
    assert.ok(hard.report.wall_ms < noDeadline.report.wall_ms * 0.8, `finishes meaningfully sooner (${hard.report.wall_ms} vs ${noDeadline.report.wall_ms} ms)`);
    assert.ok(Math.abs(hard.report.cost_usd - 0.001 * hard.report.per_slot.PAID.ok) < 1e-9 + 0.001 * hard.report.per_slot.PAID.wasted, 'cost = paid calls x price');
  });

  await check('a batch budget caps paid spending', async () => {
    const slots = [fake('F1', { ms: 40, seed: 30 }), fake('PAID', { ms: 20, seed: 31, conc: 6, price: 0.01 })];
    const { report } = await pool.runBatch(items(60), { slots, deadlineMs: 100, budgetUsd: 0.05, pollMs: 10, hedge: false });
    assert.strictEqual(report.ok, 60);
    assert.ok(report.cost_usd <= 0.05 + 1e-9, `spent ${report.cost_usd}`);
    assert.ok(report.cost_usd > 0);
  });

  await check('a fallen-over free slot stops getting work (circuit breaker); it is probed again later', async () => {
    process.env.POOL_BREAKER_OPEN_MS = '60';
    const bad = fake('BAD', { ms: 5, failRate: 1, conc: 1 });
    const good = fake('GOOD', { ms: 15, conc: 2 });
    const { report } = await pool.runBatch(items(30), { slots: [bad, good], pollMs: 10, hedge: false });
    assert.strictEqual(report.ok, 30);
    assert.ok(bad.log.length <= 10, `the breaker kept the bad slot from taking many calls (${bad.log.length})`);
    assert.ok(bad.breaker.opens >= 1);
    delete process.env.POOL_BREAKER_OPEN_MS;
  });

  await check('daily token cap: a slot with no tokens left is not used', async () => {
    const s = fake('XK', { ms: 5 });
    s.dailyTokens = () => 10;
    const g = fake('G', { ms: 5 });
    const { report } = await pool.runBatch(items(10, { maxTokens: 1000 }), { slots: [s, g], pollMs: 10, hedge: false });
    assert.strictEqual(s.log.length, 0);
    assert.strictEqual(report.ok, 10);
  });

  await check('RPM: a slot never starts more than its rpm in a minute', async () => {
    const s = fake('R', { ms: 2, conc: 4 });
    s.rpm = 3; s.rpmGroup = 'rpm-test';
    const g = fake('G2', { ms: 25, conc: 1 });
    const { report } = await pool.runBatch(items(12), { slots: [s, g], pollMs: 10, hedge: false });
    assert.strictEqual(report.ok, 12);
    assert.ok(s.log.length <= 3, `rpm slot started ${s.log.length}`);
  });

  // ── 5. ledgers ───────────────────────────────────────────────────────────────
  await check('Standard Compute: the ledger starts at $0.50 spent, refuses past the cap, and no request is sent for a refused call', async () => {
    process.env.STANDARD_COMPUTE_CAP_USD = '0.52'; // can only lower the $20 cap
    process.env.STANDARD_COMPUTE_API_KEY = 'test-key-not-real';
    process.env.STANDARD_COMPUTE_PIPELINE = '1';
    const led = require('../services/standard-compute-ledger');
    const sc = require('../services/providers/standard-compute');
    let fetched = 0;
    sc._setFetch(async () => {
      fetched += 1;
      await sleep(5);
      const body = JSON.stringify({ choices: [{ message: { content: '{"n":1}' } }], usage: { prompt_tokens: 200, completion_tokens: 1500 } });
      return { ok: true, status: 200, statusText: 'OK', text: async () => body };
    });
    assert.strictEqual(led.status().spent_usd, 0.5, 'seeded at $0.50');
    assert.strictEqual(led.CAP_USD, 30); // $20, raised by $10 by the owner on 2026-10-31
    const schema = { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] };
    const slots = pool.extraSlots().filter((s) => s.id.startsWith('standard_compute:'));
    assert.strictEqual(slots.length, 1);
    const sl = slots[0];
    assert.ok(sl.paid && sl.dataClass === 'pipeline');
    const filler = fake('SLOW-FREE', { ms: 400, conc: 1, seed: 40, jitter: 0.1 });
    const its = Array.from({ length: 40 }, (_, i) => ({ id: i, req: { n: i, kind: 'structured', role: 'blocks', task: 'pool_batch_test', dataClass: 'pipeline', system: 's', user: 'u', schema, maxTokens: 500 } }));
    const { report } = await pool.runBatch(its, { slots: [filler, sl], deadlineMs: 100, pollMs: 10, hedge: false, timeoutMs: 2000 });
    const st = led.status();
    numbers.sc_ledger = { cap: 0.52, committed: st.committed_usd, calls: st.calls, refused: st.refused_calls, fetches: fetched, items_ok: report.ok };
    assert.strictEqual(report.ok, 40, 'the free slot finished the rest');
    assert.ok(st.committed_usd <= 0.52 + 1e-9, `committed ${st.committed_usd} stays at or under the cap`);
    assert.ok(report.per_slot[sl.id].pulled < 40, 'the pool stopped pulling for the paid slot once its ledger had no room');
    assert.strictEqual(fetched, st.calls, 'every request sent was settled in the ledger');
    assert.strictEqual(st.reserved_usd, 0, 'no reservation left open');
    assert.ok(st.spent_usd > 0.5);
    // the provider itself refuses past the cap, before anything is sent
    const before = fetched;
    await assert.rejects(() => sc.standardCompute.structured({ system: 's', user: 'u', schema, maxTokens: 5000 }), /refused|ledger/);
    assert.strictEqual(fetched, before, 'a refused call sends nothing');
    assert.ok(led.status().refused_calls >= 1);
    assert.ok(led.status().committed_usd <= 0.52 + 1e-9);
  });

  const scEnvCleanup = () => { require('../services/providers/standard-compute')._setFetch(null); for (const k of ['STANDARD_COMPUTE_CAP_USD', 'STANDARD_COMPUTE_API_KEY', 'STANDARD_COMPUTE_PIPELINE']) delete process.env[k]; };
  scEnvCleanup();
  await check('Standard Compute: without the pipeline opt-in nothing is sent (the app server never sets it)', async () => {
    const sc = require('../services/providers/standard-compute');
    let fetched = 0;
    sc._setFetch(async () => { fetched += 1; throw new Error('must not be called'); });
    process.env.STANDARD_COMPUTE_API_KEY = 'test-key-not-real';
    assert.strictEqual(sc.standardCompute.isEnabled(), false);
    await assert.rejects(() => sc.standardCompute.chat({ messages: [{ role: 'user', content: 'x' }] }), /pipeline use only/);
    assert.strictEqual(fetched, 0);
    sc._setFetch(null);
    delete process.env.STANDARD_COMPUTE_API_KEY;
  });

  await check('Anthropic: a slot whose ledger is out of room never starts (the $24 stop)', async () => {
    process.env.ANTHROPIC_LEDGER_STOP_USD = '11.2'; // the seed: no headroom left
    const prov = { name: 'anthropic', PRICES: { 'claude-test': { input: 3, output: 15 } }, modelFor: () => 'claude-test', isEnabled: () => true, structured: async () => ({ data: { n: 1 }, usage: { input_tokens: 1, output_tokens: 1 }, model: 'claude-test' }) };
    pool._reset();
    const claude = pool.expandProvider(prov, { role: 'fast' })[0];
    assert.ok(claude.paid && claude.hedgeable === false);
    const free = fake('F', { ms: 5, failRate: 1 });
    const res = await pool.callHedged({ kind: 'structured', n: 1, role: 'fast' }, { slots: [free, claude], hedgeAfterMs: 10, timeoutMs: 300 });
    assert.strictEqual(res, null, 'free failed and Claude had no room: null, nothing spent');
    assert.strictEqual(claude.stats.started, 0);
    delete process.env.ANTHROPIC_LEDGER_STOP_USD;
  });

  process.env.POOL_BREAKER_OPEN_MS = '20';
  await check('runBatch never uses Claude unless lastResort is set, and then only for an item every free slot failed', async () => {
    const free = fake('F', { ms: 5, failRate: 1, conc: 1 });
    const claude = fake('CL', { ms: 5, price: 0.01, hedgeable: false, conc: 2 });
    const a = await pool.runBatch(items(4), { slots: [free, claude], deadlineMs: 1, pollMs: 5, maxTries: 3, hedge: false });
    assert.strictEqual(claude.log.length, 0, 'Claude took nothing without lastResort');
    assert.strictEqual(a.report.ok, 0);
    const free2 = fake('F2', { ms: 5, failRate: 1, conc: 1 });
    const claude2 = fake('CL2', { ms: 5, price: 0.01, hedgeable: false, conc: 2 });
    const b = await pool.runBatch(items(4), { slots: [free2, claude2], lastResort: true, budgetUsd: 1, pollMs: 5, maxTries: 4, hedge: false });
    assert.strictEqual(b.report.ok, 4, 'with lastResort Claude finished what the free slot could not');
    assert.ok(free2.log.length >= 1 && claude2.log.length === 4);
  });

  delete process.env.POOL_BREAKER_OPEN_MS;

  // ── 6. data and quality gates ────────────────────────────────────────────────
  await check('learner data never reaches a pipeline-class slot (batch, mixed items)', async () => {
    const learner = fake('LEARNER-SLOT', { ms: 10, conc: 2 });
    const pipe = fake('PIPE-SLOT', { ms: 2, conc: 4, dataClass: 'pipeline' });
    const mixed = [];
    for (let i = 0; i < 30; i++) mixed.push({ id: `p${i}`, req: { n: i, kind: 'structured', dataClass: 'pipeline' } });
    for (let i = 0; i < 12; i++) mixed.push({ id: `u${i}`, req: { n: 100 + i, kind: 'structured', dataClass: 'pipeline', userId: 'user-7' } }); // a user id makes it learner data
    for (let i = 0; i < 6; i++) mixed.push({ id: `l${i}`, req: { n: 200 + i, kind: 'structured' } }); // no class: learner
    const { results, report } = await pool.runBatch(mixed, { slots: [learner, pipe], pollMs: 5, hedge: false });
    assert.strictEqual(report.ok, 48);
    const pipeSaw = pipe.log;
    assert.ok(pipeSaw.length > 0, 'the pipeline slot did work');
    assert.ok(pipeSaw.every((c) => c.cls === 'pipeline' && !c.user && c.item < 100), 'only user-less pipeline items reached it');
    assert.ok(results.filter((r) => String(r.id).startsWith('u') || String(r.id).startsWith('l')).every((r) => r.slot === 'LEARNER-SLOT'));
  });

  await check('a learner item with only pipeline slots available fails rather than leaking', async () => {
    const pipe = fake('PIPE-ONLY', { ms: 2, dataClass: 'pipeline' });
    const { results, report } = await pool.runBatch([{ id: 'x', req: { n: 1, kind: 'structured', userId: 'u1', dataClass: 'pipeline' } }], { slots: [pipe], pollMs: 5 });
    assert.strictEqual(report.failed, 1);
    assert.strictEqual(results[0].ok, false);
    assert.strictEqual(pipe.log.length, 0);
    const one = await pool.callHedged({ kind: 'structured', n: 1, userId: 'u1', dataClass: 'pipeline' }, { slots: [pipe], timeoutMs: 200 });
    assert.strictEqual(one, null);
    assert.strictEqual(pipe.log.length, 0);
  });

  await check('the real slot registry: learner requests see only the app chain; pipeline slots need the class and no user', async () => {
    pool._reset();
    const providers = require('../services/providers');
    const savedAll = { ...providers.ALL };
    const stub = (name) => ({ name, isEnabled: () => true, isConfigured: () => true, modelFor: () => 'm', costCents: () => 0, structured: async () => ({ data: {}, model: 'm' }), chat: async () => ({ text: 't', model: 'm' }) });
    providers.ALL.nvidia = stub('nvidia');
    try {
      const ids = (req, o) => pool.candidatesFor(req, o).map((s) => s.id);
      const chain = [providers.ALL.nvidia];
      const learnerIds = ids({ role: 'blocks', task: 'lesson_write', kind: 'structured', userId: 'u1' }, { chain });
      assert.ok(learnerIds.every((i) => !/^(xkiro|unorouter|standard_compute)/.test(i)), `learner: ${learnerIds}`);
      const pipelineWithUser = ids({ role: 'blocks', task: 'lesson_write', kind: 'structured', dataClass: 'pipeline', userId: 'u1' }, { chain });
      assert.ok(pipelineWithUser.every((i) => !/^(xkiro|unorouter|standard_compute)/.test(i)), 'a user id keeps it learner class');
      const noClass = ids({ role: 'blocks', task: 'lesson_write', kind: 'structured' }, { chain });
      assert.ok(noClass.every((i) => !/^(xkiro|unorouter|standard_compute)/.test(i)), 'the default class is learner');
      const pipe = ids({ role: 'blocks', task: 'lesson_write', kind: 'structured', dataClass: 'pipeline' }, { chain });
      assert.ok(pipe.some((i) => i.startsWith('standard_compute:')), `lesson_write lists Standard Compute: ${pipe}`);
      assert.ok(!pipe.some((i) => i.startsWith('xkiro:') || i.startsWith('unorouter:')), 'xKiro / UnoRouter are not listed as good enough for lesson_write');
      const coach = ids({ role: 'fast', task: 'coach_turn', kind: 'structured', dataClass: 'pipeline' }, { chain });
      assert.ok(coach.every((i) => !/^(xkiro|unorouter|standard_compute)/.test(i)), 'no extra slot is listed for the coach');
      const night = ids({ role: 'blocks', task: 'night_write', kind: 'structured', dataClass: 'pipeline' }, { chain });
      assert.ok(night.some((i) => i.startsWith('xkiro:minimax')) && night.some((i) => i.startsWith('standard_compute:')), `night_write: ${night}`);
      const outsideOff = ids({ role: 'blocks', task: 'night_write', kind: 'structured', dataClass: 'pipeline', outside: false }, { chain });
      assert.ok(outsideOff.every((i) => !/^(xkiro|unorouter|standard_compute)/.test(i)), 'a learner without outside consent gets no outside slot at all');
    } finally {
      Object.assign(providers.ALL, savedAll);
      pool._reset();
    }
  });

  await check('quality gate: a task can deny a chain slot (Lightning never serves grading / blind MC)', async () => {
    pool._reset();
    const providers = require('../services/providers');
    const nvidia = require('../services/providers/nvidia');
    const ids = pool.candidatesFor({ role: 'fast', task: 'grade_free_response', kind: 'structured' }, { chain: [nvidia] }).map((s) => s.id);
    assert.ok(ids.length > 0 && ids.every((i) => !i.includes('lightning')), `grade_free_response: ${ids}`);
    assert.ok(providers.chain, 'providers loaded');
    pool._reset();
  });

  console.log('\nmeasured numbers:');
  console.log(JSON.stringify(numbers, null, 1));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  if (failed) { console.log(`\n${failed} failure(s)`); process.exit(1); }
  console.log('\nall pool checks passed');
  process.exit(0);
})();
