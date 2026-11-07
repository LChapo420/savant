#!/usr/bin/env node
/**
 * Part-by-part reads (the cold-write route reads one block at a time, with the earlier blocks as context) with the confirm step. Fast readers only, as a learner may be waiting. Held-out set; the prompts were not tuned on it.
 *   node scripts/fact-100/run-parts.js [readers=ds41_coral,glm_flash_munito] [par=3]
 * Clean controls: the first part and one seeded other part of each clean level. Plants: each plant whose edits sit in one block, read in that part.
 * Evidence for each flag: rulings by the other families (ds41_coral, glm_flash_munito, grok43), a passage comparison. Output: TMP/raw-100/parts.jsonl, docs/fact-100/parts.json.
 */
const C = require('./common');
const { L } = C;
const J = require('../fact-gate/judges');
const G = require('../../services/fact-gate');
const CF = require('../../services/fact-confirm');
const S = require('../../services/fact-source');
const T = require('../../services/fact-textbooks');
const D = require('../../services/fact-dictionary');

const [, , READERS = 'ds41_coral,glm_flash_munito', PAR = '3'] = process.argv;
const readers = READERS.split(',');
const RULERS = ['ds41_coral', 'glm_flash_munito', 'grok43'];
const OUT = L.path.join(C.RAW, 'parts.jsonl');
const HUNT = `${G.HUNT_SYSTEM}\n\nThis read covers one part of the lesson. Earlier parts are given as context under EARLIER; check only the part under THIS PART, and report as block N.`;
const SRC_SYSTEM = 'You compare a sentence from a lesson with passages from a reference. Answer ONLY from the passages, never from what you remember. supported: the passages say the same thing. contradicted: the passages clearly say otherwise. silent: the passages do not settle it (the most common answer). If supported or contradicted, quote the deciding words exactly.';
const SRC_SCHEMA = { type: 'object', required: ['verdict', 'quote'], properties: { verdict: { type: 'string', enum: ['supported', 'contradicted', 'silent'] }, quote: { type: 'string' } } };
const DECIDE_SCHEMA = { type: 'object', required: ['rulings'], properties: { rulings: { type: 'array', items: { type: 'object', required: ['flag', 'real', 'reason'], properties: { flag: { type: 'integer' }, real: { type: 'boolean' }, reason: { type: 'string' } } } } } };
const HUNT_SCHEMA = J.HUNT_SCHEMA;
const words = (s) => new Set((String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2));
const overlap = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, Math.min(a.size, b.size)); };

const renderPart = (lv, index) => {
  const earlier = lv.blocks.filter((b) => b.index < index).slice(-4);
  const b = lv.blocks.find((x) => x.index === index);
  return `${L.contextOf(lv)}\n\nEARLIER\n${earlier.map((x) => `BLOCK ${x.index} ${x.block}: ${JSON.stringify(x.data).slice(0, 1500)}`).join('\n') || '(none)'}\n\nTHIS PART\nBLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`;
};

(async () => {
  const set = C.loadSet('heldout');
  const levels = C.levelMap();
  const jobs = [];
  for (const c of set.clean.filter((x) => x.split === 'heldout')) {
    const lv = levels.get(c.level); if (!lv || !lv.blocks.length) continue;
    const first = lv.blocks[0].index;
    const other = lv.blocks[1 + (parseInt(L.hash(c.level), 16) % Math.max(1, lv.blocks.length - 1))];
    jobs.push({ id: `clean:${c.level}#${first}`, level: c.level, index: first, edits: [] });
    if (other) jobs.push({ id: `clean:${c.level}#${other.index}`, level: c.level, index: other.index, edits: [] });
  }
  for (const p of set.plants.filter((x) => x.split === 'heldout')) {
    const bs = new Set(p.edits.filter((e) => e.word === 'block').map((e) => Number(e.index)));
    if (bs.size === 1 && p.edits.every((e) => e.word === 'block')) jobs.push({ id: `${p.id}#${[...bs][0]}`, plant: p.id, level: p.level, index: [...bs][0], edits: p.edits });
  }
  const done = new Set(L.readJsonl(OUT).map((r) => r.id));
  await L.runPool(jobs.filter((j) => !done.has(j.id)), Number(PAR), async (job) => {
    const base = levels.get(job.level);
    const lv = job.edits.length ? L.applyEdits(base, job.edits) : base;
    const user = renderPart(lv, job.index);
    let cost = 0; const t0 = Date.now();
    try {
      const flags = [];
      const reads = await Promise.all(readers.map(async (r) => { const x = await J.callModel(r, { system: HUNT, user, schema: HUNT_SCHEMA, schemaName: 'submit_errors', maxTokens: 4000 }); cost += x.cost || 0; return { r, errors: (x.data && x.data.errors) || [] }; }));
      for (const { r, errors } of reads) {
        for (const e of errors) {
          const q = words(e.quote);
          const hit = flags.find((f) => overlap(f.q, q) >= 0.5);
          const src = { r, where: e.where || `block ${job.index}`, claim: e.quote, why: e.why, truth: e.truth };
          if (hit) { if (!hit.raisers.includes(r)) hit.raisers.push(r); hit.sources.push(src); } else flags.push({ where: `block ${job.index}`, claim: String(e.quote || '').slice(0, 400), why: String(e.why || '').slice(0, 400), truth: String(e.truth || '').slice(0, 200), raisers: [r], q, sources: [src], rulings: {}, source: null, recompute: null });
        }
      }
      const readMs = Date.now() - t0; const t1 = Date.now();
      if (flags.length) {
        const list = flags.map((f, i) => `FLAG ${i} at ${f.where}: "${f.claim.slice(0, 300)}": ${f.why.slice(0, 300)} ${f.truth ? `(suggested truth: ${f.truth.slice(0, 200)})` : ''}`).join('\n');
        await Promise.all(RULERS.map(async (ruler) => {
          try {
            const r = await J.callModel(ruler, { system: G.DECIDE_SYSTEM, user: `${user}\n\nFLAGS\n${list}`, schema: DECIDE_SCHEMA, schemaName: 'submit_rulings', maxTokens: 3000 });
            cost += r.cost || 0;
            (r.data.rulings || []).forEach((x, i) => { const k = Number.isInteger(x.flag) ? x.flag : i; if (flags[k]) flags[k].rulings[ruler] = !!x.real; });
          } catch (e) { /* a ruler that cannot answer does not count either way */ }
        }));
        for (const f of flags) { // eslint-disable-line no-restricted-syntax
          const docs = [];
          if (lv.track === 'spanish') docs.push(...await D.passagesFor(f.claim, 'Spanish', 2)); // eslint-disable-line no-await-in-loop
          if (lv.track === 'math') docs.push(...T.search(f.claim, { track: 'math', k: 3 }));
          docs.push(...await S.fromOffline(f.claim, { topic: `${lv.track} ${lv.grade}`.replace(/_/g, ' '), k: 2 })); // eslint-disable-line no-await-in-loop
          if (docs.length) {
            const r = await J.callModel('ds41_coral', { system: SRC_SYSTEM, user: `LESSON SENTENCE: ${f.claim}\n\nPASSAGES\n${docs.map((d, i) => `[${i + 1}] ${d.title}: ${d.text}`).join('\n')}`, schema: SRC_SCHEMA, schemaName: 'submit_verdict', maxTokens: 600 }); // eslint-disable-line no-await-in-loop
            cost += r.cost || 0;
            let v = r.data.verdict; if (v !== 'silent' && !docs.some((d) => d.text.toLowerCase().includes(String(r.data.quote || '').toLowerCase().slice(0, 40)))) v = 'silent';
            f.source = v;
          }
        }
      }
      L.appendJsonl(OUT, { id: job.id, plant: job.plant || null, level: job.level, index: job.index, flags: flags.map((f) => ({ ...f, q: undefined })), cost, readMs, confirmMs: Date.now() - t1 });
    } catch (e) { console.log('fail', job.id, String(e.message).slice(0, 100)); }
  });
  const rows = L.readJsonl(OUT);
  const byPlant = new Map(set.plants.map((p) => [p.id, p]));
  const cleanRows = rows.filter((r) => !r.plant); const plantRows = rows.filter((r) => r.plant);
  const baseFor = (r) => new Set(rows.filter((x) => !x.plant && x.level === r.level && x.index === r.index).flatMap((x) => x.flags.flatMap((f) => f.sources.map(C.flagKey))));
  const out = { cleanParts: cleanRows.length, plants: plantRows.length, stacks: {} };
  for (const stack of [readers.join('+'), ...readers]) {
    const members = stack.split('+'); out.stacks[stack] = {};
    console.log(`\n${stack}: clean parts ${cleanRows.length}, plants ${plantRows.length}`);
    for (const policy of ['any', 'one_ruling', 'all_rulings', 'two_rulings', 'independent', 'hard_only', 'hard_or_independent', 'hard_or_two_rulings', 'independent_and_ruling']) {
      const survives = (f) => { const v = { ...f, raisers: f.raisers.filter((x) => members.includes(x)) }; return v.raisers.length > 0 && CF.decide(v, policy).act; };
      const caught = plantRows.filter((r) => { const base = baseFor(r); const p = byPlant.get(r.plant); return r.flags.some((f) => survives(f) && f.sources.some((s) => members.includes(s.r) && !base.has(C.flagKey(s)) && C.catches(s, p))); }).length;
      const fa = cleanRows.filter((r) => r.flags.some(survives)).length;
      out.stacks[stack][policy] = { caught, n: plantRows.length, falseParts: fa, cleanParts: cleanRows.length };
      console.log(policy.padEnd(24), `caught ${L.fmtRate(caught, plantRows.length).padEnd(22)} clean parts flagged ${L.fmtRate(fa, cleanRows.length)}`);
    }
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  out.readMs = Math.round(mean(rows.map((r) => r.readMs))); out.confirmMsWhenFlagged = Math.round(mean(rows.filter((r) => r.flags.length).map((r) => r.confirmMs))); out.costPerPart = +mean(rows.map((r) => r.cost)).toFixed(5);
  console.log(JSON.stringify({ readMs: out.readMs, confirmMsWhenFlagged: out.confirmMsWhenFlagged, costPerPart: out.costPerPart }));
  L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'parts.json'), out);
  process.exit(0);
})();
