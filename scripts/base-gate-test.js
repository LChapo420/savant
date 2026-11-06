/**
 * Offline test of the base write's pool gate (BASE_GATE=pool, 6 Nov 2026): the fact reads and repairs of a shared (no learner) write carry the pipeline
 * class, so the pool may use ZeroGPU and grok-4.3 for them (before, they carried none and found no slot once NVIDIA was rate limited); a learner's
 * write still carries the learner class; a base level on the pool gate is not sent to the Sonnet check unless BASE_GATE_SONNET=on.
 *   node scripts/base-gate-test.js      (also run by `npm test`)
 */
process.env.NODE_ENV = 'test';
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.DB_FILE = path.join(os.tmpdir(), `base-gate-test-${process.pid}.json`);
fs.writeFileSync(process.env.DB_FILE, JSON.stringify({}));
for (const n of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(n)) process.env[n] = '';
const ai = require('../services/ai');
const bl = require('../services/block-levels');
let failures = 0;
const check = (l, c, d) => { if (c) console.log(`  ok   ${l}`); else { failures += 1; console.log(`  FAIL ${l} ${JSON.stringify(d || '').slice(0, 200)}`); } };
(async () => {
  const seen = [];
  const real = ai.structuredDetail;
  ai.structuredDetail = async (a) => { seen.push({ task: a.task, dataClass: a.dataClass, userId: a.userId }); return { data: { claims: [] }, usage: null, model: 'stub' }; };
  const blocks = [{ index: 0, block: 'Text', data: { body: 'Two plus two is four.' } }];
  await bl.onTier('free', () => bl.verifyLevel({ context: { text: 'x', trackId: 'math' }, blocks, checks: [], userId: null, where: null }));
  check('a shared write\'s fact read carries the pipeline class', seen.length && seen.every((s) => s.dataClass === 'pipeline' && s.userId === null), seen);
  seen.length = 0;
  await bl.onTier('free', () => bl.verifyLevel({ context: { text: 'x', trackId: 'math' }, blocks, checks: [], userId: 4242, where: null }));
  check('a learner\'s write still carries the learner class', seen.length && seen.every((s) => s.dataClass === 'learner'), seen);
  ai.structuredDetail = real;
  const plan = { status: 'ready', user_id: null, check_tier: 'free', base_gate: 'pool' };
  process.env.BLOCK_FACT_GATE = '1';
  check('a base level on the pool gate is not pending a Sonnet check', !bl.sonnetPending(plan));
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* temp */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall base-gate checks passed');
  process.exit(failures ? 1 : 0);
})();
