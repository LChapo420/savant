#!/usr/bin/env node
/**
 * Is one part of a lesson, read alone, checked as strongly as the whole level? (7 Nov 2026, brief cold-write.) Real paid reads through the ledgers, AI-planted errors,
 * clean controls and same-against-same repeats. Not part of npm test. Not real-learner proof.
 *
 *   DB_FILE=copy.json RUN_CAP_USD=5 node scripts/part-read-eval.js run <reader> <mode> [rep=1] [par=3] [out=file.json]
 *     reader  zerogpu | grok43 | coralStd | minimax | path (the shipped route: a waiting learner's lane, ZeroGPU then grok-4.3 by hedge, PATH_HEDGE_MS)
 *     mode    whole (the level as today) | part (the planted block or check alone) | ctx (it, with the blocks and checks before it as context only)
 *   DB_FILE=copy.json node scripts/part-read-eval.js build-cross [n=24] [out=docs/cold-write/cross-part-set.json]
 *     Plants an error a part CANNOT show alone: a later block made to disagree with something stated earlier in the same lesson (xKiro Mistral, a family none of the readers share).
 *
 * Sets: docs/fact-verifier-set.json put back in its stored levels (as scripts/fact-parts-eval.js), plus the cross set when present (reported apart). The reader gets the
 * production request (verifyRequest: same system prompt and schema), never told what is planted. Caught: a failed claim on the target quoting the planted words, the set's own scorer.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
require('../services/run-cap').defaultCap(5);
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['CORAL', 'GONKA', 'GROKIFIED', 'LYCEUM', 'MUNITO', 'ZEROGPU']) { process.env[`${n}_PIPELINE`] = '1'; if (!process.env[`${n}_LEDGER_FILE`]) process.env[`${n}_LEDGER_FILE`] = `${LIVE}/${n.toLowerCase()}-ledger.json`; }
process.env.XKIRO_PIPELINE = '1';
if (!process.env.DB_FILE) throw new Error('DB_FILE=<copy> is required');
const [, , CMD = 'run', A1, A2, A3 = '1', A4 = '3', A5 = null] = process.argv;
const set = require('../docs/fact-verifier-set.json');
const bl = require('../services/block-levels');

const dbCopy = JSON.parse(fs.readFileSync(process.env.DB_FILE, 'utf8'));
const plans = dbCopy.block_plans.filter((p) => (p.blocks || []).length && (p.checks || []).length);
const CROSS_FILE = path.join(__dirname, '..', 'docs', 'cold-write', 'cross-part-set.json');
const prov = (n) => require(`../services/providers/${n}`)[n]; // eslint-disable-line global-require, import/no-dynamic-require
const READERS = {
  zerogpu: (a) => prov('zerogpu').structured({ ...a, model: 'z-ai/glm-5.3-flash' }),
  grok43: (a) => prov('grokified').structured({ ...a, model: 'grok-4.3' }),
  coralStd: (a) => require('../services/providers/coral').coral.structured({ ...a, model: 'deepseek-v4.1-flash' }), // eslint-disable-line global-require
  minimax: (a) => prov('lyceum').structured({ ...a, model: 'minimax/minimax-m3' }),
};

const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
function distinctive(pl) { const orig = new Set(words(pl.original)); const w = words(pl.wrong).filter((t) => !orig.has(t)); return w.length ? w : words(pl.wrong); }
function caughtBy(failed, pl) {
  const dist = distinctive(pl); const orig = words(pl.original).filter((t) => !new Set(words(pl.wrong)).has(t));
  return failed.some((c) => { const claim = new Set(words(c.claim)); const truth = new Set(words(`${c.truth} ${c.evidence}`)); return dist.some((t) => claim.has(t)) || (orig.length && orig.some((t) => truth.has(t)) && dist.some((t) => claim.has(t) || truth.has(t))); });
}
const toChecks = (p) => p.checks.map((x, i) => ({ index: i, format: x.format, prompt: x.prompt, options: x.options, choices: x.choices, answer: x.answer, rationale: x.rationale, after: x.after }));
/** A case of the verifier set put back into its stored level, as scripts/fact-parts-eval.js does. */
function fixture(c) {
  const pl = c.planted;
  for (const p of plans) {
    if (c.kind === 'block') {
      const orig = pl ? JSON.stringify(c.data).replace(pl.wrong, pl.original) : JSON.stringify(c.data);
      const i = p.blocks.findIndex((b) => b && b.block === c.block && JSON.stringify(b.data) === orig);
      if (i >= 0) { const blocks = p.blocks.map((b, k) => ({ index: b.index ?? k, block: b.block, data: k === i ? c.data : b.data })); return { plan: p, blocks, checks: toChecks(p), target: { word: 'block', index: blocks[i].index } }; }
    } else {
      const i = p.checks.findIndex((x) => x && x.format === c.check.format && x.choices && JSON.stringify(x.choices) === JSON.stringify(c.check.choices) && (pl ? x.prompt !== c.check.prompt || x.rationale !== c.check.rationale : true) && (x.prompt === c.check.prompt || x.rationale === c.check.rationale));
      if (i >= 0) { const checks = toChecks(p); checks[i] = { ...checks[i], prompt: c.check.prompt, rationale: c.check.rationale }; return { plan: p, blocks: p.blocks.map((b, k) => ({ index: b.index ?? k, block: b.block, data: b.data })), checks, target: { word: 'check', index: i } }; }
    }
  }
  return null;
}
function crossFixture(c) {
  const p = plans.find((x) => x.id === c.plan_id); if (!p) return null;
  const blocks = p.blocks.map((b, k) => ({ index: b.index ?? k, block: b.block, data: b.data }));
  const i = blocks.findIndex((b) => b.index === c.block_index); if (i < 0) return null;
  const text = JSON.stringify(blocks[i].data); if (!text.includes(c.planted.original)) return null;
  try { blocks[i] = { ...blocks[i], data: JSON.parse(text.replace(c.planted.original, c.planted.wrong)) }; } catch { return null; }
  return { plan: p, blocks, checks: toChecks(p), target: { word: 'block', index: c.block_index } };
}
const placeOf = (where) => { const m = /(block|check)\s*(\d+)/i.exec(where || ''); return m ? { word: m[1].toLowerCase(), index: Number(m[2]) } : null; };

/** The request one mode sends: the production prompt over the whole level, the target part, or the target with what comes before it as context only. */
function request(f, mode) {
  const context = { text: `Subject: ${f.plan.track_id}, grade ${f.plan.grade_id}, level ${f.plan.level}.`, trackId: f.plan.track_id };
  if (mode === 'whole') return bl.verifyRequest({ context, blocks: f.blocks, checks: f.checks });
  const t = f.target;
  const blocks = t.word === 'block' ? f.blocks.filter((b) => b.index === t.index) : [];
  const checks = t.word === 'check' ? f.checks.filter((c) => c.index === t.index) : [];
  const r = bl.verifyRequest({ context, blocks, checks });
  if (mode === 'part') return r;
  // ctx: what the learner has already read. Same wording as the shipped part read (services/block-levels.js partContext).
  const at = t.word === 'block' ? f.blocks.findIndex((b) => b.index === t.index) : f.blocks.findIndex((b) => b.index > ((f.checks[t.index] || {}).after ?? -1));
  const earlierBlocks = f.blocks.slice(0, at < 0 ? f.blocks.length : at);
  return { ...r, user: bl.partContextPrompt(r.user, earlierBlocks) };
}

/** The shipped route: verifyLevel in the waiting lane for a cleared learner, whichever verifier answers. */
async function readPath(f, mode) {
  const db = require('../config/db'); const pool = require('../services/pool'); // eslint-disable-line global-require
  const user = db.insert('users', { email: `path-${Date.now()}-${Math.random()}@example.com`, birth_year: 1990, age_check: { needs_parent: false }, created_at: new Date().toISOString() });
  const context = { text: `Subject: ${f.plan.track_id}, grade ${f.plan.grade_id}, level ${f.plan.level}.`, trackId: f.plan.track_id };
  const t = f.target;
  const part = mode !== 'whole';
  const blockAt = f.blocks.findIndex((b) => b.index === t.index);
  // pair: the part and the block after it read together (the last block: with the one before), to see what a larger part costs in catches.
  const pair = mode === 'pair' && t.word === 'block' ? (blockAt + 1 < f.blocks.length ? [blockAt, blockAt + 1] : [blockAt - 1, blockAt]).filter((i) => i >= 0) : null;
  const blocks = pair ? pair.map((i) => f.blocks[i]) : part ? (t.word === 'block' ? f.blocks.filter((b) => b.index === t.index) : []) : f.blocks;
  const checks = part ? (t.word === 'check' ? f.checks.filter((c) => c.index === t.index) : []) : f.checks;
  const at = t.word === 'block' ? f.blocks.findIndex((b) => b.index === t.index) : f.blocks.findIndex((b) => b.index > ((f.checks[t.index] || {}).after ?? -1));
  const earlier = mode === 'ctx' || mode === 'pair' ? f.blocks.slice(0, pair ? pair[0] : (at < 0 ? f.blocks.length : at)) : null;
  const t0 = Date.now();
  const hedge = process.env.PATH_HEDGE_MS ? Number(process.env.PATH_HEDGE_MS) : null;
  try {
    const v = await pool.runForeground(() => bl.onTier('free', () => bl.verifyLevel({ context, blocks, checks, userId: user.id, where: null, excludeFamilies: ['deepseek'], earlier, hedgeAfterMs: hedge })), { fast: true });
    return v ? { v, ms: Date.now() - t0, attempts: 1, usage: v.usage, model: v.model } : { v: null, err: 'no reader' };
  } catch (e) { return { v: null, err: String(e.message).slice(0, 120) }; }
}

async function readOnce(reader, req) {
  let lastErr = null;
  for (let a = 0; a < 3; a++) {
    const t = Date.now();
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await READERS[reader]({ task: 'fact_verify', system: req.system, user: req.user, schema: req.schema, schemaName: 'submit_verification', maxTokens: 16000, timeoutMs: 150000 });
      return { v: bl.readVerification(r.data), ms: Date.now() - t, attempts: a + 1, usage: r.usage };
    } catch (e) { lastErr = String(e.message).slice(0, 120); }
  }
  return { v: null, err: lastErr };
}

async function buildCross() {
  const planter = process.env.PLANTER === 'nvidia' ? require('../services/providers/nvidia') : require('../services/providers/xkiro').xkiro; // eslint-disable-line global-require
  const n = Number(A1 || 24); const out = A2 || CROSS_FILE;
  const SYSTEM = 'You plant one error into a lesson for testing a fact checker. The lesson is a list of blocks, in order. Pick one specific statement in a LATER block that restates, uses or continues something a specific EARLIER block states: a value, a result of a worked example, a definition, a rule, a name. Change a few words of the later block so that it now disagrees with what the earlier block says, in a way that reads plausibly on its own and that a reader of the later block alone could not spot (for example the later block says "the 12 we found above" and it becomes "the 15 we found above", or a term the earlier block defined is given a different meaning). The earlier block stays right. Reply with the exact JSON-string fragment to replace ("original", copied character for character from the later block\'s JSON, 2 to 12 words) and its replacement ("wrong"). If no statement fits, set later_block to -1.';
  const SCHEMA = { type: 'object', required: ['later_block', 'earlier_block', 'original', 'wrong', 'why'], properties: { later_block: { type: 'integer' }, earlier_block: { type: 'integer' }, original: { type: 'string' }, wrong: { type: 'string' }, why: { type: 'string' } } };
  const pool = plans.filter((p) => p.blocks.length >= 4 && !['chess', 'piano', 'basketball'].includes(p.track_id));
  // A held-out order: a fixed seed, one level a grade before a second from the same grade.
  const seen = new Map();
  const ordered = pool.map((p) => { const k = `${p.track_id}/${p.grade_id}`; const m = seen.get(k) || 0; seen.set(k, m + 1); return { p, m, r: require('crypto').createHash('sha1').update(`cold-cross-20261107-${p.id}`).digest('hex') }; }).sort((a, b) => a.m - b.m || (a.r < b.r ? -1 : 1)).map((x) => x.p); // eslint-disable-line global-require
  const cases = []; let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < ordered.length && cases.length < n) {
      const p = ordered[i++];
      const text = p.blocks.map((b, k) => `BLOCK ${b.index ?? k} ${b.block}: ${JSON.stringify(b.data)}`).join('\n');
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await planter.structured({ task: 'fact_claims', role: 'blocks', system: SYSTEM, user: text, schema: SCHEMA, schemaName: 'submit_plant', maxTokens: 1500, models: process.env.PLANTER_MODEL ? [process.env.PLANTER_MODEL] : undefined, lane: 'background' });
        const d = r && r.data;
        if (!d || d.later_block < 1 || !d.original || !d.wrong || d.earlier_block >= d.later_block) continue;
        const b = p.blocks.find((x, k) => (x.index ?? k) === d.later_block);
        if (!b || !JSON.stringify(b.data).includes(d.original) || d.original === d.wrong) continue;
        cases.push({ id: `x${cases.length}`, kind: 'cross', plan_id: p.id, track: p.track_id, block_index: d.later_block, earlier_block: d.earlier_block, planted: { original: d.original, wrong: d.wrong }, why: String(d.why).slice(0, 300) });
        console.log(JSON.stringify(cases[cases.length - 1]).slice(0, 260));
      } catch (e) { console.warn(String(e.message).slice(0, 100)); }
    }
  }));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ built: '2026-11-07', note: 'AI-planted (xKiro Mistral) cross-part errors: a later block made to disagree with an earlier one. Plan ids refer to the DB copy used; not real-learner proof.', cases: cases.slice(0, n) }, null, 1));
  console.log(`wrote ${cases.length} to ${out}`);
}

(async () => {
  if (CMD === 'build-cross') { await buildCross(); process.exit(0); }
  const reader = A1; const mode = A2;
  if (reader === 'path') process.env.COLD_FIRST_BLOCK = 'on';
  const cases = [];
  for (const c of set.fact) { const f = fixture(c); if (f) cases.push({ c, f, group: c.planted ? 'planted' : 'clean' }); }
  if (fs.existsSync(CROSS_FILE)) for (const c of JSON.parse(fs.readFileSync(CROSS_FILE, 'utf8')).cases) { const f = crossFixture(c); if (f) cases.push({ c, f, group: 'cross' }); }
  const counts = { planted: cases.filter((x) => x.group === 'planted').length, clean: cases.filter((x) => x.group === 'clean').length, cross: cases.filter((x) => x.group === 'cross').length };
  console.log(`reader ${reader} mode ${mode} rep ${A3}: ${JSON.stringify(counts)} of ${set.fact.length} set cases, ${A4} at once`);
  const rows = []; let next = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: Number(A4) }, async () => {
    while (next < cases.length) {
      const { c, f, group } = cases[next++];
      const req = request(f, mode);
      // eslint-disable-next-line no-await-in-loop
      const got = reader === 'path' ? await readPath(f, mode) : await readOnce(reader, req);
      const failed = got.v ? got.v.failed : [];
      const onTarget = failed.filter((x) => { const p = placeOf(x.where); return p && p.word === f.target.word && p.index === f.target.index; });
      // A read of one part names no other part: an unplaced failed claim counts on the target in part modes.
      const hit = mode === 'part' ? failed : onTarget;
      rows.push({ id: c.id, group, ms: got.ms || null, read: !!got.v, attempts: got.attempts || 0, caught: c.planted ? caughtBy(hit, c.planted) : null, falseAlarm: c.planted ? null : hit.length > 0, flagged: hit.length, otherFlagged: failed.length - hit.length, model: got.model, inTok: got.usage && got.usage.input_tokens, outTok: got.usage && got.usage.output_tokens, err: got.err });
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
  }));
  const of = (g) => rows.filter((r) => r.group === g);
  const ms = rows.filter((r) => r.read).map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => (ms.length ? Math.round(ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] / 100) / 10 : null);
  const sum = { reader, mode, rep: A3, read: rows.filter((r) => r.read).length, of: rows.length, planted: `${of('planted').filter((r) => r.caught).length}/${of('planted').length}`, cross: `${of('cross').filter((r) => r.caught).length}/${of('cross').length}`, falseAlarms: `${of('clean').filter((r) => r.falseAlarm).length}/${of('clean').length}`, p50: q(0.5), p90: q(0.9), max: q(1), wallS: Math.round((Date.now() - t0) / 1000) };
  try { sum.spend = require('../services/run-cap').summary(); } catch { /* none */ } // eslint-disable-line global-require
  console.log('SUMMARY', JSON.stringify(sum));
  if (A5) fs.writeFileSync(A5, JSON.stringify({ sum, rows }, null, 1));
  process.exit(0);
})();
