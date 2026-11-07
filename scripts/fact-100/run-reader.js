#!/usr/bin/env node
/**
 * A model reader (the fact gate's hunt prompt, unchanged) over the new set. Clean reads already paid for on 6 Nov are reused as they are: same prompt, same text.
 *   node scripts/fact-100/run-reader.js <judge> [par=3] [set=heldout]
 */
const C = require('./common');
const { L } = C;
const J = require('../fact-gate/judges');

const [, , JUDGE, PAR = '3', SET = 'heldout'] = process.argv;
(async () => {
  const out = C.rawFile(JUDGE, SET);
  const have = new Set(L.readJsonl(out).filter((r) => r.read).map((r) => r.id));
  const old = L.readJsonl(L.path.join(L.TMP, 'raw', `${JUDGE}.jsonl`)).filter((r) => r.read && r.id.startsWith('clean:') && !have.has(r.id));
  const want = new Set(C.fixtures(SET).map((x) => x.id));
  let reused = 0;
  for (const r of old) if (want.has(r.id)) { L.appendJsonl(out, { ...r, reused: true }); have.add(r.id); reused++; }
  console.log('reused clean reads', reused);
  await C.runChecker(JUDGE, SET, async (lv) => { const r = await J.read(JUDGE, lv); return { flags: r.flags, cost: r.cost, ms: r.ms }; }, { par: Number(PAR) });
  console.log(JSON.stringify(require('../../services/run-cap').summary()).slice(0, 160));
  process.exit(0);
})();
