#!/usr/bin/env node
/**
 * Claims of every stored shared level (clean text), once; used for bank coverage and sourcing. Read-only on the DB copy. Output: TMP/raw-100/claims.<model>.jsonl
 *   node scripts/fact-100/extract-claims.js [model=ds41_coral] [par=2]
 */
const C = require('./common');
const { L } = C;
const B = require('../../services/fact-bank');
const J = require('../fact-gate/judges');

const [, , MODEL = 'ds41_coral', PAR = '2'] = process.argv;
const OUT = L.path.join(C.RAW, `claims.${MODEL}.jsonl`);
const call = async (system, user, schema, schemaName, maxTokens) => { const r = await J.callModel(MODEL, { system, user, schema, schemaName, maxTokens }); return { data: r.data, cost: r.cost }; };
(async () => {
  const levels = L.loadLevels();
  const done = new Set(L.readJsonl(OUT).map((r) => r.level));
  let cost = 0; let ok = 0;
  await L.runPool(levels.filter((l) => !done.has(l.id)), Number(PAR), async (lv) => {
    for (let a = 0; a < 4; a++) {
      try {
        const r = await B.extractClaims({ context: L.contextOf(lv), blocks: lv.blocks, checks: lv.checks, call }); // eslint-disable-line no-await-in-loop
        L.appendJsonl(OUT, { level: lv.id, track: lv.track, grade: lv.grade, claims: r.claims, cost: r.cost });
        cost += r.cost; ok++;
        return;
      } catch (e) { if (a === 3) console.log('fail', lv.id, String(e.message).slice(0, 100)); await L.sleep(4000 * (a + 1)); } // eslint-disable-line no-await-in-loop
    }
  });
  console.log(`RESULT claims ${ok} levels, $${cost.toFixed(4)}`);
  process.exit(0);
})();
