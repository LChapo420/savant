#!/usr/bin/env node
/**
 * A decider rules on flags. For each fixture (a level with or without a plant) it gets the level text and the fresh flags of the judges named, all in one call, and rules each one
 * real or false alarm, working it out itself. It is told nothing about plants.
 *   node scripts/fact-gate/run-decider.js <decider model> <dev|heldout|all|clean> [par=3] judge1 judge2 ...
 * Output raw/<decider>.decisions.jsonl, { key: fixture|flagKey, real, reason, cost }.
 */
const L = require('./lib');
const J = require('./judges');
const { placeOf, words } = require('./scoring');
const code = require('../../services/fact-code-checks');

const [, , DECIDER, SPLIT = 'dev', PAR = '3', ...JUDGES] = process.argv;
const tb = L.readJson(L.path.join(L.DOCS, 'testbed.json'));
const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const RAW = L.path.join(L.TMP, 'raw');
const safe = (j) => j.replace(/[:/]/g, '_');
const OUT = L.path.join(RAW, `${safe(DECIDER)}.decisions.jsonl`);
const done = new Set(L.readJsonl(OUT).map((r) => r.key));
const flagKey = (f) => `${placeOf(f.where) ? `${placeOf(f.where).word}${placeOf(f.where).index}` : '?'}|${words(f.claim).slice(0, 8).join(' ')}`;

const SYSTEM = `You rule on suspected errors in a lesson. Other checkers read this lesson and raised the flags listed; they raise many false alarms, and they also find real errors. You have no stake in either. For each flag, read the lesson text it points at and work the matter out yourself from scratch: do the arithmetic, read the rule, recall the fact.

Rule "real" only if the lesson's text as written is actually wrong or would actually mislead a learner at this level: a wrong number, step, formula, key, fact, or direction; a key that disagrees with its explanation or with what the lesson teaches; a flat statement with an exception that matters here; or two parts that contradict each other.

Rule "false" when the flag is mistaken, is only about style or teaching choices, misreads the text, objects to text that is meant to be wrong (a wrong option, a trap, a line marked isError true), objects to a fair simplification, or quotes words that are not there.

Give one ruling per flag, in order, with a one-sentence reason.`;
const SCHEMA = { type: 'object', required: ['rulings'], properties: { rulings: { type: 'array', items: { type: 'object', required: ['flag', 'real', 'reason'], properties: { flag: { type: 'integer' }, real: { type: 'boolean' }, reason: { type: 'string' } } } } } };

const rawOf = new Map();
const flagsOf = (j, id, level, edits) => {
  if (j === 'code' || j === 'codeall') {
    const lv = edits.length ? L.applyEdits(levels.get(level), edits) : levels.get(level);
    return code.checkLevel({ trackId: lv.track, gradeId: lv.grade, blocks: lv.blocks, checks: lv.checks }).filter((f) => j === 'codeall' || f.certain).map((f) => ({ ...f, why: f.rule }));
  }
  if (!rawOf.has(j)) { const m = new Map(); for (const r of L.readJsonl(L.path.join(RAW, `${safe(j)}.jsonl`))) if (r.read) m.set(r.id, r); rawOf.set(j, m); }
  const r = rawOf.get(j).get(id);
  return r ? r.flags : [];
};

const inSplit = (x) => SPLIT === 'all' || x.split === SPLIT;
const fixtures = SPLIT === 'clean'
  ? tb.clean.map((c) => ({ id: `clean:${c.level}`, level: c.level, edits: [] }))
  : SPLIT === 'audit' ? [...levels.values()].map((l) => ({ id: `clean:${l.id}`, level: l.id, edits: [] }))
  : [...tb.clean.filter(inSplit).map((c) => ({ id: `clean:${c.level}`, level: c.level, edits: [] })), ...tb.plants.filter(inSplit).map((p) => ({ id: p.id, level: p.level, edits: p.edits }))];

const work = [];
for (const fx of fixtures) {
  const seen = new Map();
  for (const j of JUDGES) {
    const base = fx.edits.length ? new Set(flagsOf(j, `clean:${fx.level}`, fx.level, []).map(flagKey)) : new Set();
    for (const f of flagsOf(j, fx.id, fx.level, fx.edits)) { const k = flagKey(f); if (!base.has(k) && !seen.has(k) && !done.has(`${fx.id}|${k}`)) seen.set(k, f); }
  }
  if (seen.size) work.push({ fx, flags: [...seen.entries()] });
}
const n = work.reduce((s, w) => s + w.flags.length, 0);
console.log(`${DECIDER}: ${n} flags on ${work.length} fixtures`);
(async () => {
  let cost = 0; let ok = 0; let stop = false;
  await L.runPool(work, Number(PAR), async ({ fx, flags }) => {
    if (stop) return;
    const lv = fx.edits.length ? L.applyEdits(levels.get(fx.level), fx.edits) : levels.get(fx.level);
    const list = flags.map(([, f], i) => `FLAG ${i} at ${f.where}: "${String(f.claim).slice(0, 300)}" — ${String(f.why || '').slice(0, 300)} ${f.truth ? `(suggested truth: ${String(f.truth).slice(0, 200)})` : ''}`).join('\n');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await J.callModel(DECIDER, { system: SYSTEM, user: `${J.render(lv)}\n\nFLAGS\n${list}`, schema: SCHEMA, schemaName: 'submit_rulings', maxTokens: 12000, task: 'fact_gate_decide' });
        cost += r.cost || 0;
        const rulings = r.data.rulings || [];
        flags.forEach(([k], i) => {
          const q = rulings.find((x) => Number(x.flag) === i) || rulings[i];
          if (q) { L.appendJsonl(OUT, { key: `${fx.id}|${k}`, real: !!q.real, reason: String(q.reason || '').slice(0, 300), cost: (r.cost || 0) / flags.length }); ok++; }
        });
        return;
      } catch (e) {
        const msg = String(e.message || e).slice(0, 140);
        if (/LEDGER_STOP|run cap/i.test(msg) || e.status === 402) { stop = true; console.log('STOP', msg); return; }
        if (attempt === 2) console.log('fail', fx.id, msg);
        await L.sleep(4000 * (attempt + 1)); // eslint-disable-line no-await-in-loop
      }
    }
  });
  console.log(`RESULT ${DECIDER}: ruled ${ok} of ${n}, $${cost.toFixed(4)}`);
  process.exit(0);
})();
