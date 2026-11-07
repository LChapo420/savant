#!/usr/bin/env node
/**
 * Seconds per claim for the local checkers on CPU only, at 8 threads, standing in for the beta server (12 threads, no GPU). Point FACT_CHECKERS_URL at a server started with CUDA_VISIBLE_DEVICES="" FACT_CPU_THREADS=8.
 *   node scripts/fact-100/cpu-timing.js <stage1|stage2> [pairs]
 * Records machine load, because other agents share this PC.
 */
const C = require('./common');
const { L } = C;
const S = require('../../services/fact-source');
const os = require('os');

const [, , STAGE = 'stage1', N = '32'] = process.argv;
(async () => {
  const rows = L.readJsonl(L.path.join(C.RAW, 'pairs.bank.dev.jsonl')).slice(0, Number(N));
  const claims = new Map(L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl')).map((r) => [r.level, r]));
  const facts = [...claims.values()].flatMap((r) => r.claims.map((c) => c.text));
  const pairs = rows.map((r) => ({ doc: S.fromBank(r.bad, facts, 5).map((x) => x.text).join(' '), claim: r.bad }));
  const t0 = Date.now();
  if (STAGE === 'stage1') await S.stage1(pairs); else await S.post(`${process.env.FACT_CHECKERS_URL}/stage2`, { pairs });
  const s = (Date.now() - t0) / 1000;
  console.log(`${STAGE} ${pairs.length} pairs, ${s.toFixed(1)} s, ${(s / pairs.length).toFixed(2)} s a claim, load ${os.loadavg()[0]}, doc chars ${Math.round(pairs.reduce((a, p) => a + p.doc.length, 0) / pairs.length)}`);
  process.exit(0);
})();
