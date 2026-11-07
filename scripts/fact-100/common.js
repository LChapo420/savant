/**
 * Shared by the fact-100 measurements. Fixtures come from a set file (docs/fact-gate/testbed.json as dev, docs/fact-100/heldout.json as the held-out set), raw reads go to TMP/raw-100.
 * Reads the DB copy only. Raw reads are the same shape as the fact gate's: { id, level, read, flags, cost, ms }.
 */
const L = require('../fact-gate/lib');
const { catches, placeOf, words } = require('../fact-gate/scoring');

const RAW = L.path.join(L.TMP, 'raw-100');
L.fs.mkdirSync(RAW, { recursive: true });
const SETS = { dev: L.path.join(L.DOCS, 'testbed.json'), heldout: L.path.join(L.DOCS, '..', 'fact-100', 'heldout.json') };
const loadSet = (name) => L.readJson(SETS[name]);
const levelMap = () => new Map(L.loadLevels().map((l) => [l.id, l]));
const flagKey = (f) => `${placeOf(f.where) ? `${placeOf(f.where).word}${placeOf(f.where).index}` : '?'}|${words(f.claim).slice(0, 8).join(' ')}`;
const rawFile = (checker, set) => L.path.join(RAW, `${checker}.${set}.jsonl`);

/** fixtures of a set: planted and clean, resumable against the raw file. */
function fixtures(set, { filter = null } = {}) {
  const tb = loadSet(set);
  const plants = tb.plants.map((p) => ({ id: p.id, level: p.level, edits: p.edits, kind: p.kind, track: p.track }));
  const levels = [...new Set([...tb.clean.map((c) => c.level), ...tb.plants.map((p) => p.level)])];
  const cleans = levels.map((level) => ({ id: `clean:${level}`, level, edits: [], track: level.split('/')[0], clean: tb.clean.some((c) => c.level === level) }));
  return [...cleans, ...plants].filter((x) => !filter || filter(x));
}

/** Runs a checker over fixtures, appending raw reads. `run(levelObject, fixture)` returns { flags, cost, ...extra }. */
async function runChecker(checker, set, run, { par = 3, filter = null, limit = 1e9 } = {}) {
  const OUT = rawFile(checker, set);
  const done = new Set(L.readJsonl(OUT).filter((r) => r.read).map((r) => r.id));
  const levels = levelMap();
  const items = fixtures(set, { filter }).filter((x) => !done.has(x.id)).sort((a, b) => (L.hash(a.id) < L.hash(b.id) ? -1 : 1)).slice(0, limit);
  const t0 = Date.now(); let cost = 0; let ok = 0; let bad = 0; let stop = false;
  await L.runPool(items, par, async (it) => {
    if (stop) return;
    const base = levels.get(it.level);
    if (!base) return;
    const lv = it.edits.length ? L.applyEdits(base, it.edits) : base;
    for (let a = 0; a < 3; a++) {
      try {
        const t = Date.now();
        const r = await run(lv, it); // eslint-disable-line no-await-in-loop
        L.appendJsonl(OUT, { id: it.id, level: it.level, read: true, ...r, ms: r.ms || Date.now() - t });
        cost += r.cost || 0; ok++;
        return;
      } catch (e) {
        const msg = String(e.message || e).slice(0, 160);
        if (/LEDGER_STOP|run cap|402/i.test(msg) || e.status === 402) { stop = true; console.log('STOP', msg); return; }
        if (a === 2) { bad++; L.appendJsonl(OUT, { id: it.id, level: it.level, read: false, err: msg }); console.log('fail', it.id, msg); }
        await L.sleep(3000 * (a + 1)); // eslint-disable-line no-await-in-loop
      }
    }
  });
  console.log(`RESULT ${checker} ${set}: read ${ok}, failed ${bad}, of ${items.length}, $${cost.toFixed(4)}, ${((Date.now() - t0) / 1000) | 0}s`);
}

/** A map id -> caught for planted fixtures of a set; flags already on the clean read of that level do not count. */
function scorePlants(raw, set) {
  const tb = loadSet(set);
  const m = new Map(raw.filter((r) => r.read).map((r) => [r.id, r]));
  const res = new Map();
  for (const p of tb.plants) {
    const r = m.get(p.id); if (!r) continue;
    const base = new Set(((m.get(`clean:${p.level}`) || { flags: [] }).flags || []).map(flagKey));
    res.set(p.id, (r.flags || []).filter((f) => !base.has(flagKey(f))).some((f) => catches(f, p)));
  }
  return res;
}
const readRaw = (checker, set) => L.readJsonl(rawFile(checker, set));

module.exports = { L, RAW, SETS, loadSet, levelMap, flagKey, rawFile, fixtures, runChecker, scorePlants, readRaw, catches, placeOf, words };
