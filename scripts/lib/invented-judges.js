/**
 * The invented-facts judges (pipeline-side only: no learner data, documents are the held-out handouts).
 *   free = the free-form prompt rounds 3 and 4 used, so its numbers can be compared
 *   sent = every sentence of the course text is numbered; for each one: supported by the source or not
 */
const spend = {};
const call = async (fam, a) => {
  const mt = a.maxTokens || 6000;
  let r;
  if (fam === 'N') r = await require('../../services/providers/nvidia').structured({ role: 'fast', task: 'uploads_proof', ...a, maxTokens: mt, timeoutMs: 240000 });
  else if (fam === 'C') r = await require('../../services/providers/coral').coral.structured({ ...a, maxTokens: mt, timeoutMs: 240000 });
  else if (fam === 'Q') r = await require('../../services/providers/zerogpu').zerogpu.structured({ ...a, maxTokens: mt, timeoutMs: 240000 });
  else if (fam === 'K') r = await require('../../services/providers/lyceum').lyceum.structured({ model: 'moonshotai/kimi-k3.1-pro', ...a, maxTokens: Math.max(mt, 8000), timeoutMs: 300000 });
  else if (fam === 'L') r = await require('../../services/providers/lyceum').lyceum.structured({ model: 'z-ai/glm-5.3', ...a, maxTokens: mt, timeoutMs: 240000 });
  else if (fam === 'Z') r = await require('../../services/providers/gonka').gonka.structured({ model: 'zai-org/GLM-5.3-Flash', ...a, maxTokens: mt, timeoutMs: 240000 });
  else if (fam === 'M') r = await require('../../services/providers/gonka').gonka.structured({ model: 'deepseek-ai/DeepSeek-V4-Flash-0731', ...a, maxTokens: mt, timeoutMs: 240000 });
  if (!r || !r.data) throw new Error('no data');
  const u = r.usage || {};
  const sp = spend[fam] = spend[fam] || { calls: 0, usd: 0, input: 0, output: 0 };
  sp.calls++; sp.usd += Number(u.cost_usd) || 0; sp.input += Number(u.input_tokens) || 0; sp.output += Number(u.output_tokens) || 0;
  return r.data;
};
const askJ = async (fam, a) => {
  for (let i = 0; i < 4; i++) {
    try { return await call(fam, a); } catch (e) { if (e.daily) return null; await new Promise((res) => setTimeout(res, 2500 * (i + 1))); }
  }
  return null;
};
const pool = async (items, n, fn) => { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); };
const stripMd = (t) => String(t).replace(/^\[\[[^\]]*\]\]\s*$/gm, '').replace(/^#+\s+/gm, '').replace(/\*\*|==|\*/g, '').replace(/^>\s?/gm, '').replace(/\n{3,}/g, '\n\n').trim();

const FREE_SYS = 'You are a strict reviewer. The SOURCE the learner uploaded and the COURSE built from it are given. List any specific factual claim in the COURSE that is not in the SOURCE (invented_facts; an analogy that borrows from an interest is fine if it makes no new claim about the subject). Be strict.';
const FREE_SCHEMA = { type: 'object', properties: { invented_facts: { type: 'array', items: { type: 'string' } } }, required: ['invented_facts'] };
const SENT_SYS = 'You are a strict fact checker. The SOURCE is a student\'s study material. Each numbered SENTENCE comes from a course built from it. For each sentence decide: supported = true only if everything the sentence states is said in the SOURCE or follows directly from it by plain reading (rewording, shortening, translating an abbreviation, or counting a list is fine). supported = false if any part of it adds a fact, a number, a name, a cause, a consequence or a reason the SOURCE does not state, or contradicts the SOURCE, even if it is true in the real world. A sentence with no factual content (a heading, a transition) is supported. For an unsupported sentence, give in `claim` the part that is not in the source.';
const SENT_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, supported: { type: 'boolean' }, claim: { type: 'string' } }, required: ['n', 'supported'] } } }, required: ['verdicts'] };

/** Sentences of a course text: splits at sentence ends, keeps abbreviations such as "e.g." and decimals together. */
const sentencesOf = (text) => String(text).split('\n').filter((l) => l.trim() && !l.startsWith('## ')).flatMap((l) => l.replace(/([.!?])\s+(?=["'“(]?[A-Z0-9β])/g, '$1\u0001').split('\u0001')).map((s) => s.trim()).filter(Boolean);

/** Flagged claims as strings, or null when the judge never answered. */
async function judge(fam, form, source, text) {
  if (form === 'free') {
    const j = await askJ(fam, { system: FREE_SYS, user: `SOURCE:\n${source.slice(0, 5000)}\n\nCOURSE:\n${text.slice(0, 14000)}`, schema: FREE_SCHEMA, schemaName: 'review' });
    return j && Array.isArray(j.invented_facts) ? j.invented_facts.map(String) : null;
  }
  const all = sentencesOf(text);
  const flagged = [];
  for (let at = 0; at < all.length; at += 30) {
    const batch = all.slice(at, at + 30);
    // eslint-disable-next-line no-await-in-loop
    const j = await askJ(fam, { system: SENT_SYS, user: `SOURCE:\n${source.slice(0, 8000)}\n\nSENTENCES:\n${batch.map((s, i) => `${i + 1}. ${s}`).join('\n')}`, schema: SENT_SCHEMA, schemaName: 'check' });
    if (!j || !Array.isArray(j.verdicts)) return null;
    for (const v of j.verdicts) if (v && v.supported === false && batch[v.n - 1]) flagged.push(`${batch[v.n - 1]}${v.claim ? ` [${v.claim}]` : ''}`);
  }
  return flagged;
}

module.exports = { spend, call, askJ, pool, stripMd, judge, sentencesOf, FREE_SYS, SENT_SYS, SENT_SCHEMA, FREE_SCHEMA };
