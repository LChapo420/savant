#!/usr/bin/env node
/**
 * Every part of a level read on its own (each block, each check), with the earlier blocks as context, by a fast cheap reader. Same raw shape as any checker, so the other scripts score it.
 *   node scripts/fact-100/run-parts-full.js <heldout|real> [reader=glm_flash_munito] [par=4]
 * heldout: all parts of each level's clean text once; a planted fixture re-reads only the parts it edits and takes the clean flags for the rest. Only dev2 is excluded when SPLIT_ONLY=heldout.
 * real: the levels holding confirmed errors, for recall on real errors.
 * Raw: TMP/raw-100/parts_<reader>.<set>.jsonl. A part that cannot be read leaves the fixture unread, never clean.
 */
const C = require('./common');
const { L } = C;
const J = require('../fact-gate/judges');
const G = require('../../services/fact-gate');

const [, , SET = 'heldout', READER = 'glm_flash_munito', PAR = '4'] = process.argv;
const NAME = `parts_${READER}`;
const OUT = C.rawFile(NAME, SET);
const CACHE = L.path.join(C.RAW, `partcache_${READER}.jsonl`);
const HUNT = `${G.HUNT_SYSTEM}\n\nThis read covers one part of the lesson. The earlier parts are context, under EARLIER; check only what is under THIS PART, and name it as given.`;

const renderBlock = (lv, b) => { const earlier = lv.blocks.filter((x) => x.index < b.index).slice(-4); return `${L.contextOf(lv)}\n\nEARLIER\n${earlier.map((x) => `BLOCK ${x.index} ${x.block}: ${JSON.stringify(x.data).slice(0, 1500)}`).join('\n') || '(none)'}\n\nTHIS PART\nBLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`; };
const renderCheck = (lv, c) => `${L.contextOf(lv)}\n\nEARLIER\n${lv.blocks.map((x) => `BLOCK ${x.index} ${x.block}: ${JSON.stringify(x.data).slice(0, 900)}`).join('\n').slice(0, 9000)}\n\nTHIS PART\nCHECK ${c.index} (${c.format}): ${JSON.stringify({ prompt: c.prompt, options: c.options, choices: c.choices, answer: c.answer, accepts: c.accepts, rationale: c.rationale, hint: c.hint })}`;
const partsOf = (lv) => [...lv.blocks.map((b) => ({ key: `block ${b.index}`, user: renderBlock(lv, b) })), ...lv.checks.map((c) => ({ key: `check ${c.index}`, user: renderCheck(lv, c) }))];

const cache = new Map(L.readJsonl(CACHE).map((r) => [r.hash, r]));
async function readPart(user, key) {
  const hash = L.hash(`${READER}|${user}`);
  if (cache.has(hash)) return cache.get(hash);
  for (let a = 0; a < 3; a++) {
    try {
      const r = await J.callModel(READER, { system: HUNT, user, schema: J.HUNT_SCHEMA, schemaName: 'submit_errors', maxTokens: a === 0 ? 6000 : 12000 }); // eslint-disable-line no-await-in-loop
      const row = { hash, flags: (r.data.errors || []).map((e) => ({ where: key, claim: e.quote, why: e.why, truth: e.truth })), cost: r.cost || 0 };
      cache.set(hash, row); L.appendJsonl(CACHE, row);
      return row;
    } catch (e) { if (/LEDGER_STOP|run cap|402/i.test(String(e.message))) throw e; await L.sleep(2000 * (a + 1)); } // eslint-disable-line no-await-in-loop
  }
  return null;
}

(async () => {
  const set = C.loadSet(SET);
  const only = process.env.SPLIT_ONLY;
  const levels = C.levelMap();
  const fixtures = C.fixtures(SET).filter((x) => { if (!only) return true; const p = set.plants.find((q) => q.id === x.id); if (p) return p.split === only; const c = set.clean.find((q) => q.level === x.level); return !c || c.split === only || set.plants.some((q) => q.level === x.level && q.split === only); });
  const done = new Set(L.readJsonl(OUT).filter((r) => r.read).map((r) => r.id));
  const items = fixtures.filter((f) => !done.has(f.id)).sort((a, b) => (a.edits.length - b.edits.length));
  let cost = 0;
  // Clean reads first, part by part, at most PAR parts at once across all levels.
  await L.runPool(items, Number(PAR), async (it) => {
    const base = levels.get(it.level); if (!base) return;
    const lv = it.edits.length ? L.applyEdits(base, it.edits) : base;
    const flags = []; let c = 0; let failed = 0;
    for (const p of partsOf(lv)) { // eslint-disable-line no-restricted-syntax
      const r = await readPart(p.user, p.key); // eslint-disable-line no-await-in-loop
      if (!r) { failed++; continue; }
      flags.push(...r.flags); c += r.cost;
    }
    if (failed) { L.appendJsonl(OUT, { id: it.id, level: it.level, read: false, err: `${failed} parts unread` }); return; }
    L.appendJsonl(OUT, { id: it.id, level: it.level, read: true, flags, cost: c, parts: partsOf(lv).length });
    cost += c;
  });
  console.log(`RESULT ${NAME} ${SET}: $${cost.toFixed(3)} ${JSON.stringify(require('../../services/run-cap').summary()).slice(0, 140)}`);
  process.exit(0);
})();
