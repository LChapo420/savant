/**
 * Two blind judges of different families for English game questions (free models only; question text only, never a key or a learner).
 *   A: NVIDIA Nemotron Ultra, called directly. services/key-gate.js nemotronJudge falls back to the whole app chain (local models,
 *      Claude on the ledger), which a free-only run must not reach, so this never does.
 *   B: Gemini free tier
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

async function retry(fn, batch, tries = 6) {
  for (let a = 0; a < tries; a++) {
    try { const p = await fn(batch); if (p.some((x) => x !== null)) return p; } catch { /* retry */ }
    await sleep(15000 * (a + 1));
  }
  return batch.map(() => null);
}

const strip = (qs) => qs.map((q) => ({ prompt: q.prompt, choices: q.choices }));
module.exports = {
  A: (qs) => retry(nemotronOnly, strip(qs)),
  B: (qs) => retry(geminiJudge, strip(qs)),
};
