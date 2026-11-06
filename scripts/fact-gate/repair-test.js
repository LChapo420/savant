#!/usr/bin/env node
/**
 * Does a repair fix what was flagged without bringing a new error? For planted errors a flag caught (judges named), the production repair prompts rewrite the flagged block or
 * check with the flag as the reason. Then:
 *   restored   the text is back to the clean original (normalized);
 *   gone       the planted words are out, the text differs: a truth-aware reader (given the clean original) rules whether the new text is right and faithful;
 *   kept       the planted words are still there: not fixed.
 * Also repairs on false alarms (flags on clean levels the deciders ruled false) to see the damage they do.
 *   node scripts/fact-gate/repair-test.js <repair model> <reader model> <split> <n> judge1 judge2 ...
 */
const L = require('./lib');
const J = require('./judges');
const bl = require('../../services/block-levels');
const { catches, placeOf, words } = require('./scoring');

const [, , MODEL, READER, SPLIT = 'heldout', N = '40', ...JUDGES] = process.argv;
const tb = L.readJson(L.path.join(L.DOCS, 'testbed.json'));
const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const RAW = L.path.join(L.TMP, 'raw');
const OUT = L.path.join(RAW, `repair-${MODEL}.jsonl`);
const safe = (j) => j.replace(/[:/]/g, '_');
const raw = new Map(JUDGES.map((j) => [j, new Map(L.readJsonl(L.path.join(RAW, `${safe(j)}.jsonl`)).filter((r) => r.read).map((r) => [r.id, r]))]));
const done = new Set(L.readJsonl(OUT).map((r) => r.id));
const lib = () => require('../../config/lesson-blocks.json');

const BLOCK_SCHEMA = { type: 'object', required: ['blocks'], properties: { blocks: { type: 'array', items: { type: 'object', required: ['index', 'data'], properties: { index: { type: 'integer' }, data: { type: 'object' } } } } } };
const CHECK_SCHEMA = { type: 'object', required: ['checks'], properties: { checks: { type: 'array', items: { type: 'object', required: ['index', 'prompt', 'answer', 'rationale'], properties: { index: { type: 'integer' }, prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'string' }, rationale: { type: 'string' } } } } } };
const READER_SCHEMA = { type: 'object', required: ['error_fixed', 'new_error', 'meaning_kept', 'note'], properties: { error_fixed: { type: 'boolean' }, new_error: { type: 'boolean' }, meaning_kept: { type: 'boolean' }, note: { type: 'string' } } };
const READER_SYSTEM = 'A lesson part had an error put into it, and a repair tool rewrote it. You get the correct original, the version with the error, and the repaired version. Rule: error_fixed: is the error gone? new_error: does the repaired version state anything false that the correct original did not? (Different wording that is still correct is not an error.) meaning_kept: does it still teach and test the same thing? note: one sentence.';

const strip = (s) => words(s).join(' ');

async function repairOne(lv, word, index, reasons) {
  if (word === 'block') {
    const b = lv.blocks.find((x) => x.index === index);
    const user = `${L.contextOf(lv)}\n\nBLOCK ${b.index}: ${b.block}\ndata: ${JSON.stringify(b.data).slice(0, 8000)}\nproblems: ${reasons.join('; ')}`;
    const r = await J.callModel(MODEL, { system: bl.REPAIR_SYSTEM, user, schema: BLOCK_SCHEMA, schemaName: 'submit_fixed_blocks', maxTokens: 12000, effort: 'high', task: 'fact_gate_repair' });
    const fixed = (r.data.blocks || [])[0];
    return { data: fixed && fixed.data, cost: r.cost };
  }
  const c = lv.checks.find((x) => x.index === index);
  const user = `${L.contextOf(lv)}\n\nCHECK ${c.index}: ${c.format}\nwritten: ${JSON.stringify(c).slice(0, 4000)}\nrefused because: ${reasons.join('; ')}`;
  const r = await J.callModel(MODEL, { system: bl.CHECK_REPAIR_SYSTEM, user, schema: CHECK_SCHEMA, schemaName: 'submit_fixed_checks', maxTokens: 6000, effort: 'high', task: 'fact_gate_repair' });
  const fixed = (r.data.checks || [])[0];
  return { data: fixed, cost: r.cost };
}

(async () => {
  const items = [];
  for (const p of tb.plants.filter((x) => SPLIT === 'all' || x.split === SPLIT)) {
    if (done.has(p.id)) continue;
    const flags = [];
    for (const j of JUDGES) { const r = raw.get(j).get(p.id); if (r) flags.push(...r.flags.filter((f) => catches(f, p) && placeOf(f.where))); }
    if (flags.length) items.push({ p, flag: flags[0] });
  }
  items.sort((a, b) => (L.hash(a.p.id) < L.hash(b.p.id) ? -1 : 1));
  const pick = items.slice(0, Number(N));
  console.log(`${pick.length} plants to repair with ${MODEL}, ${items.length} available`);
  let cost = 0;
  await L.runPool(pick, 4, async ({ p, flag }) => {
    const lv = L.applyEdits(levels.get(p.level), p.edits);
    const at = placeOf(flag.where);
    const orig = levels.get(p.level);
    const before = L.partText(orig, at.word, at.index); const wrong = L.partText(lv, at.word, at.index);
    if (!before || !wrong) return;
    try {
      const reason = `false: "${flag.claim}" → ${flag.truth || flag.why}`;
      const fx = await repairOne(lv, at.word, at.index, [reason]);
      cost += fx.cost || 0;
      if (!fx.data) { L.appendJsonl(OUT, { id: p.id, kind: p.kind, result: 'no_repair' }); return; }
      const fixedText = JSON.stringify(fx.data);
      // Fields a check repair does not return are compared on what it returned.
      const fixedComparable = at.word === 'check' ? strip(`${fx.data.prompt} ${fx.data.answer}`) : strip(fixedText);
      const beforeComparable = at.word === 'check' ? (() => { const c = orig.checks.find((x) => x.index === at.index); return strip(`${c.prompt} ${c.answer}`); })() : strip(before);
      const restored = fixedComparable === beforeComparable;
      const rr = await J.callModel(READER, { system: READER_SYSTEM, user: `CORRECT ORIGINAL\n${before}\n\nWITH THE ERROR\n${wrong}\n\nREPAIRED\n${fixedText}`, schema: READER_SCHEMA, schemaName: 'submit_ruling', maxTokens: 6000, task: 'fact_gate_repair_read' });
      cost += rr.cost || 0;
      L.appendJsonl(OUT, { id: p.id, kind: p.kind, restored, ...rr.data, sameWords: restored, cost: fx.cost, fixed: fixedText.slice(0, 1500), onPart: p.edits.some((e) => e.word === at.word && Number(e.index) === at.index) });
    } catch (e) { console.log('fail', p.id, String(e.message).slice(0, 120)); }
  });
  const rows = L.readJsonl(OUT);
  const n = rows.length; const c = (f) => rows.filter(f).length;
  console.log(`RESULT ${MODEL}: ${n} repairs; restored ${c((r) => r.restored)}, error fixed ${L.fmtRate(c((r) => r.error_fixed), n)}, new error ${L.fmtRate(c((r) => r.new_error), n)}, meaning kept ${c((r) => r.meaning_kept)}; fixed with no new error ${L.fmtRate(c((r) => r.error_fixed && !r.new_error && r.meaning_kept), n)}; spent $${cost.toFixed(3)}`);
  process.exit(0);
})();
