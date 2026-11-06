#!/usr/bin/env node
/**
 * Whole-level against part-by-part fact read, on real level fixtures with ONE planted error (6 Nov 2026, brief fact-queue). Live calls through
 * the pool in the waiting-learner lane (as the first lesson after placement), paid providers through their ledgers. Not part of npm test.
 *
 *   DB_FILE=copy.json node scripts/fact-parts-eval.js [planted=12] [clean=8] [mode=parts|whole] [par=3] [out=file.json]
 *
 * Fixtures: each case of docs/fact-verifier-set.json (a lesson block, or one graded check, with a model-planted error, or left clean) is put
 * back into the stored level it came from (matched in the DB copy); the level's other blocks and checks are untouched. Per level it reports
 * seconds, whether every part was read, caught (a failed claim on the planted block/check quoting the planted words, see the set's own
 * scorer) and a false alarm (a failed claim on the clean case's block/check; failures on the level's other parts are counted apart, as they
 * are the stored text's own). `par` levels are read at once. AI-planted, small sample: not real-learner proof.
 * Env switches under test: FACT_VERIFY_PARTS (set by this script from `mode`), POOL_FACT_HEDGE_MS, FACT_PARTS_*.
 */
const fs = require('fs');
const path = require('path');
const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
try { require('dotenv').config({ path: ENV }); } catch { /* env */ }
require('../services/run-cap').defaultCap(3);
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['CORAL', 'GONKA', 'GROKIFIED', 'LYCEUM', 'MUNITO', 'ZEROGPU']) if (!process.env[`${n}_LEDGER_FILE`]) process.env[`${n}_LEDGER_FILE`] = `${LIVE}/${n.toLowerCase()}-ledger.json`;
const [, , A_PL = '12', A_CL = '8', MODE = 'parts', A_PAR = '3', OUT = null] = process.argv;
// mode: parts | whole (the waiting-learner lane) or bgparts | bgwhole (the background lane, nobody waiting; bgparts = FACT_VERIFY_PARTS=background).
process.env.FACT_VERIFY_PARTS = MODE === 'parts' ? '1' : MODE === 'bgparts' ? 'background' : '';
const BG = MODE.startsWith('bg');
// mode basecheap / sonnet: the base-write path (no learner: userId null, pipeline class), the cheap pool gate (free tier: ZeroGPU, grok-4.3) against the owner's key (Sonnet read, FACT_PIPELINE=sonnet), same fixtures.
const BASE = MODE === 'basecheap' || MODE === 'sonnet';
if (MODE === 'sonnet') process.env.FACT_PIPELINE = 'sonnet';
for (const l of ['CORAL', 'MUNITO', 'GONKA', 'ZEROGPU', 'GROKIFIED']) process.env[`${l}_PIPELINE`] = '1';
if (!process.env.DB_FILE) throw new Error('DB_FILE=<copy of the database> is required (never the live one)');
const set = require('../docs/fact-verifier-set.json');
const bl = require('../services/block-levels');
const pool = require('../services/pool');
const keyAgreement = require('../services/key-agreement');
const dbCopy = JSON.parse(fs.readFileSync(process.env.DB_FILE, 'utf8'));
const plans = dbCopy.block_plans.filter((p) => (p.blocks || []).length && (p.checks || []).length);

const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
function distinctive(pl) { const orig = new Set(words(pl.original)); const w = words(pl.wrong).filter((t) => !orig.has(t)); return w.length ? w : words(pl.wrong); }
function caughtBy(failed, pl) {
  const dist = distinctive(pl); const orig = words(pl.original).filter((t) => !new Set(words(pl.wrong)).has(t));
  return failed.some((c) => { const claim = new Set(words(c.claim)); const truth = new Set(words(`${c.truth} ${c.evidence}`)); return dist.some((t) => claim.has(t)) || (orig.length && orig.some((t) => truth.has(t)) && dist.some((t) => claim.has(t) || truth.has(t))); });
}

/** A case put back into its stored level: { blocks, checks, target: { word, index } } or null. */
function fixture(c) {
  const pl = c.planted;
  for (const p of plans) {
    if (c.kind === 'block') {
      const orig = pl ? JSON.stringify(c.data).replace(pl.wrong, pl.original) : JSON.stringify(c.data);
      const i = p.blocks.findIndex((b) => b && b.block === c.block && JSON.stringify(b.data) === orig);
      if (i < 0) continue;
      const blocks = p.blocks.map((b, k) => ({ index: b.index ?? k, block: b.block, data: k === i ? c.data : b.data }));
      return { plan: p, blocks, checks: toChecks(p), target: { word: 'block', index: blocks[i].index } };
    }
    const i = p.checks.findIndex((x) => x && x.format === c.check.format && x.choices && JSON.stringify(x.choices) === JSON.stringify(c.check.choices) && (pl ? x.prompt !== c.check.prompt || x.rationale !== c.check.rationale : true) && (x.prompt === c.check.prompt || x.rationale === c.check.rationale));
    if (i < 0) continue;
    const checks = toChecks(p); checks[i] = { ...checks[i], prompt: c.check.prompt, rationale: c.check.rationale };
    return { plan: p, blocks: p.blocks.map((b, k) => ({ index: b.index ?? k, block: b.block, data: b.data })), checks, target: { word: 'check', index: i } };
  }
  return null;
}
const toChecks = (p) => p.checks.map((x, i) => ({ index: i, format: x.format, prompt: x.prompt, options: x.options, choices: x.choices, answer: x.answer, rationale: x.rationale }));
const placeOf = (where) => { const m = /(block|check)\s*(\d+)/i.exec(where || ''); return m ? { word: m[1].toLowerCase(), index: Number(m[2]) } : null; };

(async () => {
  const want = (planted) => set.fact.filter((c) => !!c.planted === planted);
  const cases = [];
  for (const c of [...want(true), ...want(false)]) { const f = fixture(c); if (f) cases.push({ c, f }); }
  const pick = [...cases.filter((x) => x.c.planted).slice(0, Number(A_PL)), ...cases.filter((x) => !x.c.planted).slice(0, Number(A_CL))];
  console.log(`mode ${MODE}, ${pick.length} levels (${pick.filter((x) => x.c.planted).length} planted, ${pick.filter((x) => !x.c.planted).length} clean) of ${cases.length} fixtures found, ${A_PAR} at once, hedge ${process.env.POOL_FACT_HEDGE_MS || 'default'}`);
  const rows = []; let next = 0; const t00 = Date.now();
  await Promise.all(Array.from({ length: Number(A_PAR) }, async () => {
    while (next < pick.length) {
      const { c, f } = pick[next++];
      const ctx = { text: `Subject: ${f.plan.track_id}, grade ${f.plan.grade_id}, level ${f.plan.level}.`, trackId: f.plan.track_id };
      const t = Date.now(); let v = null; let err = null;
      const runLane = (fn) => (BASE ? fn() : BG ? pool.runBackground(fn) : pool.runForeground(fn, { fast: true }));
      try { v = await runLane(() => bl.onTier(MODE === 'sonnet' ? 'sonnet' : 'free', () => bl.verifyLevel({ context: ctx, blocks: f.blocks, checks: f.checks, userId: BASE ? null : 90000000 + Math.floor(Math.random() * 9000000), where: null, excludeFamilies: ['deepseek'] }))); } catch (e) { err = String(e.message).slice(0, 80); }
      const failed = v ? v.failed : [];
      const onTarget = failed.filter((x) => { const p = placeOf(x.where); return p && p.word === f.target.word && p.index === f.target.index; });
      rows.push({ id: c.id, planted: !!c.planted, parts: f.blocks.length + Math.ceil(f.checks.length / 4), ms: Date.now() - t, read: !!v, caught: c.planted ? caughtBy(onTarget, c.planted) : null, falseAlarm: c.planted ? null : onTarget.length > 0, otherFailed: failed.length - onTarget.length, model: v && v.model, partMs: v && v.partMs, partModels: v && v.partModels, err });
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
  }));
  const pl = rows.filter((r) => r.planted); const cl = rows.filter((r) => !r.planted); const ms = rows.filter((r) => r.read).map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] : null);
  const sum = { mode: MODE, par: Number(A_PAR), hedge: process.env.POOL_FACT_HEDGE_MS || null, levels: rows.length, read: rows.filter((r) => r.read).length, planted: pl.length, caught: pl.filter((r) => r.caught).length, clean: cl.length, falseAlarms: cl.filter((r) => r.falseAlarm).length, p50: q(0.5), p90: q(0.9), max: ms[ms.length - 1] || null, wallS: Math.round((Date.now() - t00) / 1000) };
  try { sum.processSpend = require('../services/run-cap').summary(); } catch { /* none */ }
  console.log('SUMMARY', JSON.stringify(sum));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ sum, rows }, null, 1));
  process.exit(0);
})();
