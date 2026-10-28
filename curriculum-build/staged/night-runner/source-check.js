/**
 * The source check for a kept item's factual claim (2026-10-24 14:10, owner: "the same full
 * 100% accuracy"). Each blind judge names the fact about the world (or a word's meaning) the
 * key depends on, if any. Such a claim must be supported by an offline Wikipedia / Wiktionary
 * passage (kiwix, 127.0.0.1:8090), read by a model that is NOT the writer's family, whose
 * quote is then found verbatim in the passage by code. Anything else drops the item.
 * Arithmetic needs no passage: services/math-claims.js checks it in the code checks.
 */
const path = require('path');
const core = require('./core');

const offline = require(path.join(core.ROOT, 'services', 'offline-facts.js'));

const SYSTEM = `You check whether encyclopedia passages (offline Wikipedia / Wiktionary) support the answer key of a quiz question. Use ONLY the passages, not your own knowledge.
- verdict "supports_key": a passage states the fact that makes the given answer correct;
- "contradicts_key": a passage shows the given answer is wrong;
- "not_addressed": the passages do not settle it.
quote: the exact sentence from the passage that settles it, copied character for character ("" if not_addressed). article: that passage's title.`;
const SCHEMA = { type: 'object', properties: { verdict: { type: 'string', enum: ['supports_key', 'contradicts_key', 'not_addressed'] }, quote: { type: 'string' }, article: { type: 'string' } }, required: ['verdict', 'quote', 'article'] };
const loose = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, '');
const stats = { asked: 0, supported: 0, contradicted: 0, not_found: 0, no_reader: 0 };

/** The claims the judges named (empty / "none" ones dropped), de-duplicated. */
function claimsOf(...verdicts) {
  const out = [];
  for (const v of verdicts) {
    const c = String((v && v.fact_claim) || '').trim();
    if (c.length < 8 || /^(none|n\/a|no|-|no fact|no factual claim)\.?$/i.test(c)) continue;
    if (!out.some((x) => loose(x) === loose(c))) out.push(c);
  }
  return out;
}

/** One claim -> { ok, method, verdict, quote, article, url, reader }. */
async function check({ job, writerModel, claim, prompt, answer, topic }) {
  stats.asked++;
  let passages = [];
  try { passages = await offline.retrieve(claim.slice(0, 400), { topic, k: 4, embed: false }); } catch (err) { stats.not_found++; return { ok: false, method: `offline retrieval failed: ${String(err.message).slice(0, 80)}` }; }
  if (!passages.length) { stats.not_found++; return { ok: false, method: 'offline retrieval: nothing found' }; }
  const user = `Fact the answer depends on: ${claim}\nQuestion: ${prompt}\nGiven answer: ${answer}\n\nPassages:\n${passages.map((p, i) => `[${i}] ${p.title} (${p.book})\n${String(p.text).slice(0, 2500)}`).join('\n\n')}`;
  const r = await core.read({ job, writerModel, system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_source_check', maxTokens: 4000 });
  const v = r && r.data;
  if (!v) { stats.no_reader++; return { ok: false, method: 'no reader answered' }; }
  const hit = v.quote && loose(v.quote).length >= 20 ? passages.find((x) => loose(x.text).includes(loose(v.quote))) : null;
  const p = hit || passages.find((x) => x.title === v.article);
  const url = p ? `https://en.${/wiktionary/i.test(p.book || '') ? 'wiktionary' : 'wikipedia'}.org/wiki/${encodeURIComponent(String(p.title).replace(/\s+/g, '_'))}` : null;
  const ok = !!hit && v.verdict === 'supports_key';
  if (ok) stats.supported++; else if (v.verdict === 'contradicts_key') stats.contradicted++; else stats.not_found++;
  return { ok, method: 'offline Wikipedia/Wiktionary passage, read by a model of another family than the writer, quote verified verbatim by code', verdict: v.verdict, quote: v.quote, article: v.article, verbatim: !!hit, url, reader: r.model };
}

/** Every named claim must be supported. -> { ok, checks } */
async function checkAll({ job, writerModel, claims, prompt, answer, topic }) {
  const checks = [];
  for (const claim of claims) {
    // eslint-disable-next-line no-await-in-loop
    const c = await check({ job, writerModel, claim, prompt, answer, topic });
    checks.push({ claim, ...c });
    if (!c.ok) return { ok: false, checks };
  }
  return { ok: true, checks };
}

module.exports = { claimsOf, check, checkAll, stats };
