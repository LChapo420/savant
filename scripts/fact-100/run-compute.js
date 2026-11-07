#!/usr/bin/env node
/**
 * The compute layer over a set. Math levels only: nothing else has anything to recompute.
 *   node scripts/fact-100/run-compute.js <dev|heldout> [model=ds41_coral] [par=3] [limit]
 * Prints catch by kind, and the flags on clean levels (each one is a real error in the stored text or a transcription fault: read them).
 */
const C = require('./common');
const { L } = C;
const F = require('../../services/fact-compute');
const J = require('../fact-gate/judges');

const [, , SET = 'dev', MODEL = 'ds41_coral', PAR = '3', LIMIT = '100000'] = process.argv;
const name = `compute_${MODEL}`;
const call = async (system, user, schema, schemaName, maxTokens) => { const r = await J.callModel(MODEL, { system, user, schema, schemaName, maxTokens }); return { data: r.data, cost: r.cost }; };

(async () => {
  await C.runChecker(name, SET, async (lv) => {
    const r = await F.check({ context: L.contextOf(lv), blocks: lv.blocks, checks: lv.checks, call });
    return { flags: r.flags, cost: r.cost, statements: r.statements, tally: r.tally, blindTried: r.blindTried, ms: r.ms, falseStatements: r.falseStatements };
  }, { par: Number(PAR), filter: (x) => x.track === 'math', limit: Number(LIMIT) });
  const raw = C.readRaw(name, SET).filter((r) => r.read);
  const tb = C.loadSet(SET);
  const res = C.scorePlants(raw, SET);
  const math = tb.plants.filter((p) => p.track === 'math');
  console.log('math plants', L.fmtRate(math.filter((p) => res.get(p.id)).length, math.filter((p) => res.has(p.id)).length), 'of all plants', L.fmtRate(math.filter((p) => res.get(p.id)).length, tb.plants.length));
  const kinds = [...new Set(math.map((p) => p.kind))];
  for (const k of kinds) { const ps = math.filter((p) => p.kind === k && res.has(p.id)); console.log(' ', k.padEnd(28), ps.filter((p) => res.get(p.id)).length, '/', ps.length); }
  const cl = raw.filter((r) => r.id.startsWith('clean:'));
  const withFlag = cl.filter((r) => r.flags.length);
  const stm = raw.reduce((n, r) => n + (r.statements || 0), 0);
  const unk = raw.reduce((n, r) => n + ((r.tally && r.tally.unknown) || 0), 0);
  console.log(`clean levels ${cl.length}, with a flag ${withFlag.length}, flags ${cl.reduce((n, r) => n + r.flags.length, 0)}; statements a fixture ${(stm / raw.length).toFixed(1)}, unknown ${(100 * unk / Math.max(1, stm)).toFixed(0)}%; $ a level ${(raw.reduce((n, r) => n + (r.cost || 0), 0) / raw.length).toFixed(5)}, ms ${(raw.reduce((n, r) => n + (r.ms || 0), 0) / raw.length) | 0}`);
  for (const r of withFlag.slice(0, 40)) for (const f of r.flags.slice(0, 5)) console.log(`  ${r.level} ${f.where}: ${String(f.claim).slice(0, 70)} :: ${String(f.why).slice(0, 150)}`);
  process.exit(0);
})();
