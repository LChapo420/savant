/**
 * Two blind judges of different families for English game questions (free models only; question text only, never a key or a learner).
 *   A: NVIDIA Nemotron Ultra, called directly. services/key-gate.js nemotronJudge falls back to the whole app chain (local models,
 *      Claude on the ledger), which a free-only run must not reach, so this never does.
 *   B: Gemini free tier, or MiniMax M3.1 Flash through xKiro (pipeline only, question text only) where Gemini is rate-limited.
 *      ENGLISH_JUDGE_B = gemini | minimax | auto (default auto: Gemini twice, then MiniMax). Nemotron, MiniMax and Gemini are three
 *      different families, so judge A and judge B always differ. B(qs, {not:'minimax'}) never uses MiniMax (a MiniMax writer is never judged
 *      by MiniMax). The array B returns has .by = the judge that answered ('gemini' or 'minimax').
 * Each takes [{prompt, choices}] and returns one 0-based pick (or null) per question. Retries with backoff (429s); null only when it never answered.
 */
const nvidia = require('../../services/providers/nvidia');
const gemini = require('../../services/providers/gemini');

const SYSTEM = 'You answer multiple-choice questions for a school course. Work each one out yourself and give the 0-based index of the one option you believe is correct. If none or more than one is correct, still give your best pick. You are not told the answer key.';
const SCHEMA = { type: 'object', properties: { picks: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' } }, required: ['index', 'chosen_index'] } } }, required: ['picks'] };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function userFor(batch) {
  const body = batch.map((q, i) => `Question ${i}: ${q.prompt}\n${q.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}`).join('\n\n');
  return `${body}\n\nReturn one pick per question, with its index.`;
}
const picksOf = (r, batch) => {
  const by = new Map(((r && r.data && r.data.picks) || []).map((p) => [p.index, p.chosen_index]));
  return batch.map((_, i) => (Number.isInteger(by.get(i)) ? by.get(i) : null));
};

async function nemotronOnly(batch) {
  const models = [{ model: process.env.KEY_GATE_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }];
  return picksOf(await nvidia.structured({ role: 'check', system: SYSTEM, user: userFor(batch), schema: SCHEMA, schemaName: 'submit_picks', maxTokens: 3000, models, timeoutMs: 120000, attempts: 2 }), batch);
}

async function geminiJudge(batch) {
  return picksOf(await gemini.structured({ role: 'check', system: SYSTEM, user: userFor(batch), schema: SCHEMA, maxTokens: 3000 }), batch);
}

async function minimaxJudge(batch) {
  process.env.XKIRO_PIPELINE = '1';
  const { xkiro } = require('../../services/providers/xkiro'); // eslint-disable-line global-require
  return picksOf(await xkiro.structured({ system: SYSTEM, user: userFor(batch), schema: SCHEMA, schemaName: 'submit_picks', maxTokens: 6000, models: ['minimax/minimax-m3.1-flash'], timeoutMs: 240000, reasoningEffort: 'medium' }), batch);
}

async function retry(fn, batch, tries = 6) {
  for (let a = 0; a < tries; a++) {
    try { const p = await fn(batch); if (p.some((x) => x !== null)) return p; } catch { /* retry */ }
    await sleep(15000 * (a + 1));
  }
  return batch.map(() => null);
}

async function judgeB(batch, opt = {}) {
  const mode = opt.not === 'minimax' ? 'gemini' : (process.env.ENGLISH_JUDGE_B || 'auto');
  const done = (p, by) => { p.by = by; return p; };
  if (mode === 'minimax') return done(await retry(minimaxJudge, batch), 'minimax');
  if (mode === 'gemini') return done(await retry(geminiJudge, batch), 'gemini');
  const g = await retry(geminiJudge, batch, 2);
  if (g.every((x) => x !== null)) return done(g, 'gemini');
  return done(await retry(minimaxJudge, batch), 'minimax');
}

const strip = (qs) => qs.map((q) => ({ prompt: q.prompt, choices: q.choices }));
module.exports = {
  A: (qs) => retry(nemotronOnly, strip(qs)),
  B: (qs, opt) => judgeB(strip(qs), opt),
  M: (qs) => retry(minimaxJudge, strip(qs)),
};
