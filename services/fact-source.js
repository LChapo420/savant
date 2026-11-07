/**
 * A source for every claim (brief fact-100, docs/FACT-100.md). Behind FACT_SOURCE=on, default off; nothing live calls this yet. Background only: never in a path a learner waits on.
 *
 * Each claim must link to a passage: the fact bank, the offline Wikipedia and Wiktionary (services/offline-facts.js, kiwix-serve), or the learner's upload. This is text comparison by the local
 * checkers (tools/fact-checkers/server.py), not any model's memory. No passage that supports it: the sentence is rewritten or dropped.
 *
 *   support(claim, docs)              { factcg, minicheck } for each doc, best first
 *   sourceClaim(claim, opts)          { status: 'sourced'|'unsourced'|'contradicted?', best: { source, title, quote, factcg, minicheck } }
 *
 * What "sourced" means: a passage exists that a local model read as supporting the sentence. It does not mean the passage is right, and it does not mean the sentence is not misleading.
 * Thresholds are in THRESHOLDS, set on the dev set only (docs/FACT-100.md) and not moved after the held-out read.
 */
const http = require('http');
const offline = require('./offline-facts');

function isOn() { return String(process.env.FACT_SOURCE || '').toLowerCase() === 'on'; }
const THRESHOLDS = { both: Number(process.env.FACT_SOURCE_BOTH || 0.5), either: Number(process.env.FACT_SOURCE_EITHER || 0.9) };
const CHECKERS = () => process.env.FACT_CHECKERS_URL || 'http://127.0.0.1:6790';

function post(url, body, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (res.statusCode >= 400) reject(new Error(j.error || `status ${res.statusCode}`)); else resolve(j); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('checker timeout')); });
    req.end(data);
  });
}

/** Local checkers over pairs, in batches. */
async function stage1(pairs) {
  if (!pairs.length) return [];
  const out = [];
  for (let i = 0; i < pairs.length; i += 32) {
    const r = await post(`${CHECKERS()}/stage1`, { pairs: pairs.slice(i, i + 32) }); // eslint-disable-line no-await-in-loop
    out.push(...r.results);
  }
  return out;
}

const supported = (s) => (s.factcg >= THRESHOLDS.both && s.minicheck >= THRESHOLDS.both) || s.factcg >= THRESHOLDS.either || s.minicheck >= THRESHOLDS.either;
const strength = (s) => Math.min(s.factcg, s.minicheck) + 0.001 * Math.max(s.factcg, s.minicheck);

/** Passages from the bank by plain word overlap, cheapest first: no network. */
function fromBank(claim, facts, k = 5) {
  const words = new Set(offline.keyWords(claim));
  return facts.map((f) => {
    const text = typeof f === 'string' ? f : f.text;
    const w = offline.keyWords(text);
    return { source: 'bank', title: (f && f.id) || 'bank', text, score: w.filter((x) => words.has(x)).length / Math.max(3, Math.sqrt(w.length * words.size)) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

async function fromOffline(claim, { topic = '', k = 3, only = null } = {}) {
  try {
    const r = await offline.retrieve(claim, { topic, k, articles: 3, only, embed: false });
    return r.map((x) => ({ source: x.book || 'offline', title: x.title, text: x.text, score: x.score }));
  } catch { return []; }
}

/**
 * One claim: the bank first (if given), then the offline sources.
 * Returns the best passage; the status rests on the local checkers' reading of real text.
 */
async function sourceClaim(claim, { facts = null, topic = '', useOffline = true, only = null } = {}) {
  const docs = [];
  if (facts) { const top = fromBank(claim, facts, 4); if (top.length) docs.push({ source: 'bank', title: 'bank', text: top.map((x) => x.text).join(' '), score: 1 }); }
  if (useOffline) docs.push(...await fromOffline(claim, { topic, only }));
  if (!docs.length) return { status: 'unsourced', best: null, tried: 0 };
  const scores = await stage1(docs.map((d) => ({ doc: d.text, claim })));
  let best = null;
  docs.forEach((d, i) => { const s = scores[i]; if (!best || strength(s) > strength(best)) best = { source: d.source, title: d.title, quote: d.text.slice(0, 400), factcg: s.factcg, minicheck: s.minicheck }; });
  return { status: supported(best) ? 'sourced' : 'unsourced', best, tried: docs.length };
}

module.exports = { isOn, stage1, supported, strength, fromBank, fromOffline, sourceClaim, THRESHOLDS, post };
