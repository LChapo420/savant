#!/usr/bin/env node
/**
 * Every judge over the test bed; results append to a raw file per judge, so a stopped run resumes. Judges are told nothing about plants (judges.js).
 *   node scripts/fact-gate/run-judges.js <judge[:mode]> <dev|heldout|all> [par=4] [rep=0]
 * rep: a repeat read of the same text (the same-versus-same noise control).
 */
const L = require('./lib');
const J = require('./judges');

const [, , JUDGE, SPLIT = 'dev', PAR = '4', REP = '0'] = process.argv;
const tb = L.readJson(L.path.join(L.DOCS, 'testbed.json'));
const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const fileOf = (j, rep) => L.path.join(L.TMP, 'raw', `${j.replace(/[:/]/g, '_')}${rep !== '0' ? `-r${rep}` : ''}.jsonl`);
L.fs.mkdirSync(L.path.join(L.TMP, 'raw'), { recursive: true });
const OUT = fileOf(JUDGE, REP);
const done = new Set(L.readJsonl(OUT).filter((r) => r.read).map((r) => r.id));
const inSplit = (x) => SPLIT === 'all' || x.split === SPLIT;
// Shuffle so a stop part way leaves a fair mix.
const items = [
  ...tb.clean.filter(inSplit).map((c) => ({ id: `clean:${c.level}`, level: c.level, edits: [] })),
  ...tb.plants.filter(inSplit).map((p) => ({ id: p.id, level: p.level, edits: p.edits })),
].filter((x) => !done.has(x.id)).sort((a, b) => (L.hash(a.id) < L.hash(b.id) ? -1 : 1));

(async () => {
  const t0 = Date.now(); let cost = 0; let ok = 0; let bad = 0; let stop = false;
  await L.runPool(items, Number(PAR), async (it) => {
    if (stop) return;
    const lv = it.edits.length ? L.applyEdits(levels.get(it.level), it.edits) : levels.get(it.level);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await J.read(JUDGE, lv); // eslint-disable-line no-await-in-loop
        L.appendJsonl(OUT, { id: it.id, level: it.level, read: true, flags: r.flags, cost: r.cost, usage: r.usage, ms: r.ms, claimsRead: r.claimsRead, promptHash: r.promptHash });
        cost += r.cost || 0; ok++;
        return;
      } catch (e) {
        const msg = String(e.message || e).slice(0, 160);
        if (/LEDGER_STOP|run cap|402/i.test(msg) || e.status === 402) { stop = true; console.log('STOP', msg); return; }
        if (attempt === 2) { bad++; L.appendJsonl(OUT, { id: it.id, level: it.level, read: false, err: msg }); console.log('fail', it.id, msg); }
        await L.sleep(4000 * (attempt + 1)); // eslint-disable-line no-await-in-loop
      }
    }
  });
  let spend = null; try { spend = require('../../services/run-cap').summary(); } catch { /* none */ }
  console.log(`RESULT ${JUDGE} ${SPLIT}: read ${ok}, failed ${bad}, of ${items.length}, $${cost.toFixed(4)}, ${(Date.now() - t0) / 1000 | 0}s wall at ${PAR}; run ${JSON.stringify(spend).slice(0, 120)}`);
  process.exit(0);
})();
