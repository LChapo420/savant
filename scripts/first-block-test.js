/**
 * Offline test of the cold first lesson written part by part (COLD_FIRST_BLOCK, services/first-block.js, services/block-levels.js writeInParts): the stream reader, the
 * derail watchdog, and the rule that matters: nothing reaches a learner before its own check has finished. No model calls.
 *   node scripts/first-block-test.js      (also run by `npm test`)
 */
process.env.NODE_ENV = 'test';
const fs = require('fs'); const os = require('os'); const path = require('path');

process.env.DB_FILE = path.join(os.tmpdir(), `first-block-test-${process.pid}.json`);
process.env.CORAL_LEDGER_FILE = path.join(os.tmpdir(), `first-block-coral-${process.pid}.json`);
fs.writeFileSync(process.env.DB_FILE, JSON.stringify({}));
for (const n of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(n)) process.env[n] = '';
process.env.NVIDIA_API_KEY = 'test-nvidia-key'; // a model counts as ready; every call below is stubbed
const fb = require('../services/first-block');
const db = require('../config/db');
const ai = require('../services/ai');
const bl = require('../services/block-levels');
const pool = require('../services/pool');
const keyGate = require('../services/key-gate');

let failures = 0;
const check = (l, c, d) => { if (c) console.log(`  ok   ${l}`); else { failures += 1; console.log(`  FAIL ${l} ${JSON.stringify(d === undefined ? '' : d).slice(0, 300)}`); } };
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => { setTimeout(r, 5); }); } return null; };

/** Minimal data that passes a block's schema. */
function fake(s, seed) {
  if (!s) return seed;
  if (s.enum) return s.enum[0];
  if (s.type === 'string') { const t = `${seed} plain text`; return s.minLength && t.length < s.minLength ? t.padEnd(s.minLength, ' x') : t; }
  if (s.type === 'integer' || s.type === 'number') return s.minimum != null ? s.minimum : 1;
  if (s.type === 'boolean') return true;
  if (s.type === 'array') return Array.from({ length: Math.max(1, s.minItems || 1) }, (_, i) => fake(s.items, `${seed} ${i}`));
  if (s.type === 'object' || s.properties) { const o = {}; for (const k of s.required || Object.keys(s.properties || {})) o[k] = fake((s.properties || {})[k], seed); return o; }
  return seed;
}

(async () => {
  // ── the reader ─────────────────────────────────────────────────────────
  const r = fb.blockReader();
  const text = '{"blocks":[{"index":0,"data":{"a":"x}]{\\"y"}},{"index":1,"data":{"b":[1,{"c":2}]}}],"checks":[{"index":0}]}';
  const got = [];
  for (let i = 1; i <= text.length; i += 7) got.push(...r.feed(text.slice(0, i)));
  got.push(...r.feed(text));
  check('the reader takes each complete block once, braces inside strings ignored', got.length === 2 && got[0].data.a === 'x}]{"y' && got[1].data.b[1].c === 2, got);
  check('the reader stops at the end of the blocks', r.finished());
  const open = fb.blockReader();
  open.feed('{"blocks":[{"index":0,"data":{"a":"');
  check('the reader knows how long the open block has run', open.current('{"blocks":[{"index":0,"data":{"a":"') > 0);

  // ── the watchdog ───────────────────────────────────────────────────────
  check('a reply repeating itself has derailed', !!fb.derailed(`{"blocks":[${'"do_not_use_this_key_'.repeat(30)}`));
  check('one enormous block has derailed', !!fb.derailed('x'.repeat(300), 20000));
  check('checks far too long have derailed', !!fb.derailed('x'.repeat(300).replace(/x/g, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))), 0, 20000));
  const tokens = Array.from({ length: 200 }, (_, i) => `{"text":"x_${i}","color":"#${(i * 4099).toString(16).padStart(6, '0')}"}`).join(',');
  check('a long list of different tokens has not derailed', !fb.derailed(`{"tokens":[${tokens}`), fb.derailed(`{"tokens":[${tokens}`));

  // ── the stream ─────────────────────────────────────────────────────────
  {
    process.env.CORAL_API_KEY = 'test'; process.env.CORAL_BASE_URL = 'http://coral.test'; process.env.CORAL_PIPELINE = '1';
    const { coral, _setFetch } = require('../services/providers/coral'); // eslint-disable-line global-require
    const sse = (parts) => ({ ok: true, status: 200, body: (async function* gen() { for (const p of parts) yield Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`); }()) });
    const loop = '"do_not_use_this_key_'.repeat(40);
    _setFetch(async () => sse(['{"blocks":[{"index":0,"data":{"a":1}},', loop, loop]));
    let seen = 0;
    const got2 = await coral.structured({ task: 'block_fill', system: 's', user: 'u', schema: { type: 'object' }, schemaName: 'x', maxTokens: 100, model: 'deepseek-v4.1-flash-fast', timeoutMs: 5000, onText: (t) => { seen += 1; return fb.derailed(t, 0, 0); } });
    check('a derailed stream ends as stopped, not as a failure the pool would move on from', got2.stopped === true && seen >= 1, got2);
    _setFetch(null);
  }

  // ── the flag ───────────────────────────────────────────────────────────
  delete process.env.COLD_FIRST_BLOCK;
  check('off by default', !fb.on());

  // ── the rule: nothing shown before its own check finishes ──────────────
  process.env.COLD_FIRST_BLOCK = 'on';
  const real = { structuredDetail: ai.structuredDetail, rejected: keyGate.rejectedByKeyGate, blind: keyGate.blindResolve };
  keyGate.rejectedByKeyGate = async () => [];
  keyGate.blindResolve = async (qs) => qs.map(() => ({ verdict: 'agreed' }));
  const user = db.insert('users', { email: 'fb@example.com', birth_year: 1990, created_at: new Date().toISOString() });
  const where = { trackId: 'math', gradeId: 'algebra_1_part_a', level: 10 };
  const lib = bl.library();
  const reads = []; // one per fact read: { text, release }
  const fills = [];
  let badText = null;
  ai.structuredDetail = async (a) => {
    if (a.task === 'block_layout') return null; // the default layout
    if (a.task === 'block_fill') {
      fills.push(a);
      const layout = bl.defaultLayout('lesson', bl.levelContext(where.trackId, where.gradeId, where.level).skills);
      const blocks = layout.blocks.map((b, i) => ({ index: i, data: fake(lib[b.block].schema, `block${i}`) }));
      const checks = layout.checks.map((c, i) => ({ index: i, prompt: `Question ${i} about the topic?`, choices: ['one', 'two', 'three', 'four'], answer: 'two', accepts: [], rationale: 'Because the step decides it.', hint: 'Think.' }));
      if (a.onText) a.onText(`{"blocks":[${JSON.stringify(blocks[0])},`, { model: 'deepseek-v4.1-flash-fast', call: 1 });
      await until(() => reads.length >= 1 || a.note, 200);
      return { data: { blocks, checks }, usage: null, model: 'deepseek-v4.1-flash-fast' };
    }
    if (a.task === 'fact_verify') {
      return new Promise((resolve) => {
        const row = { user: a.user, release: (claims = []) => resolve({ data: { claims }, usage: null, model: 'grok-4.3' }) };
        reads.push(row);
      });
    }
    if (a.task === 'fact_repair') return null; // a repair that fails: what was flagged goes out of the level
    return null;
  };
  void badText; badText = null;
  const rowOf = () => db.findOne(bl.COLLECTION, (p) => p.user_id === user.id && p.level === where.level);
  const task = pool.runForeground(() => bl.onTier('free', () => bl.ensure({ userId: user.id, ...where, tailored: true })), { fast: true });

  const firstRead = await until(() => reads[0]);
  check('the first block goes to its read before the fill has ended', !!firstRead && /block0/.test(firstRead.user) && !/BLOCK 1 /.test(firstRead.user.split('CONTEXT ONLY')[0]), firstRead && firstRead.user.slice(-200));
  const before = rowOf();
  check('while its read runs, nothing is published', !before.partial, before.partial);
  check('...and no partial plan can be served or graded', !bl.partialFor({ userId: user.id, ...where }));
  check('...and the level is not served as checked', !bl.findPlan({ userId: user.id, ...where }));
  firstRead.release([]);
  const shown = await until(() => bl.partialFor({ userId: user.id, ...where }));
  check('when the read passes, the first block is published alone', !!shown && shown.blocks.length === 1 && shown.blocks[0].index === 0, shown && shown.blocks);
  check('a published part is a plan the page can open', !!shown && bl.publicPlan(shown, user.id).entries.length === 1);
  check('the finish route can tell it is not whole', !!shown && shown.partial_view === true);

  // Later parts: read with what came before as context, and shown in order, not as they finish.
  const secondRead = await until(() => reads.find((x) => x !== firstRead && /BLOCK 1 /.test(x.user)));
  const thirdRead = await until(() => reads.find((x) => /BLOCK 2 /.test(x.user.split('CONTEXT ONLY')[0])));
  check('a later part is read with the earlier blocks as context only', !!secondRead && /EARLIER BLOCK 0 /.test(secondRead.user), secondRead && secondRead.user.slice(-200));
  if (thirdRead) {
    thirdRead.release([]);
    await new Promise((res) => { setTimeout(res, 40); });
    const mid = bl.partialFor({ userId: user.id, ...where });
    check('a part that passes out of turn waits for the one before it', mid.blocks.length === 1, mid.blocks.map((b) => b.index));
  }
  // A flagged block whose repair fails goes out, and is never shown.
  if (secondRead) secondRead.release([{ where: 'BLOCK 1', claim: 'block1 plain text', kind: 'fact', verdict: 'false', evidence: 'no', truth: 'something else' }]);
  // Release everything else as it comes.
  const pump = setInterval(() => { for (const x of reads) if (!x.done && x !== firstRead && x !== secondRead && x !== thirdRead) { x.done = true; x.release([]); } }, 5);
  const plan = await task;
  clearInterval(pump);
  check('the level ends written and servable', !!plan && plan.status === 'ready' && bl.servable(plan), plan && [plan.status, plan.reason]);
  if (plan) {
    check('a flagged block that could not be repaired is not in the level', !plan.blocks.some((b) => b.index === 1), plan.blocks.map((b) => b.index));
    check('the verification says it was read by parts, whole', plan.verification.status === 'verified' && plan.verification.method === 'parts');
    check('the self-check passed on every part', plan.self_check && plan.self_check.status === 'passed', plan.self_check);
    check('the partial is gone', !plan.partial);
    check('every fill asked for the stream', fills.every((f) => typeof f.onText === 'function'));
  }

  // A verifier that never answers: nothing is shown, and the level is not served.
  const u2 = db.insert('users', { email: 'fb2@example.com', birth_year: 1990, created_at: new Date().toISOString() });
  const verify = ai.structuredDetail;
  ai.structuredDetail = async (a) => (a.task === 'fact_verify' ? null : verify(a));
  const none = await pool.runForeground(() => bl.onTier('free', () => bl.ensure({ userId: u2.id, ...where, tailored: true })), { fast: true });
  const row2 = db.findOne(bl.COLLECTION, (p) => p.user_id === u2.id);
  check('no verifier: nothing is published', !(row2.partial && row2.partial.blocks.length), row2.partial);
  check('no verifier: the level is not served', !none && !bl.findPlan({ userId: u2.id, ...where }));

  ai.structuredDetail = real.structuredDetail; keyGate.rejectedByKeyGate = real.rejected; keyGate.blindResolve = real.blind;
  for (const f of [process.env.DB_FILE, process.env.CORAL_LEDGER_FILE]) { try { fs.unlinkSync(f); } catch { /* temp */ } }
  console.log(failures ? `\n${failures} FAILED` : '\nall first-block checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
