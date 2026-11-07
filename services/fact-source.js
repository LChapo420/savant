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

const sentencesOf = (t) => String(t).replace(/\[\[eg\]\][\s\S]*?\[\[\/eg\]\]/g, ' ').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 15 && /[a-z]{3}/i.test(x));
const RULE_SYSTEM = 'You compare a sentence from a rewritten lesson with the verified facts it must rest on. A personal example is fine as long as what it teaches follows from the facts. Answer ONLY from the facts given, not from memory. supported: what the sentence teaches follows from the facts. unsupported: it states something the facts do not say, or the opposite of what they say.';
const RULE_SCHEMA = { type: 'object', required: ['verdict'], properties: { verdict: { type: 'string', enum: ['supported', 'unsupported'] }, why: { type: 'string' } } };

/**
 * The check a rewrite passes before one learner sees it: errors added after the level was verified. Background or build time; it answers in seconds on a CPU, not instantly.
 *   text         the rewrite, personal examples between [[eg]] marks
 *   bank         verified facts and the verified lesson text, as strings
 *   interests    words of the learner's hobbies an example may use
 *   rule         optional (sentence, facts) => Promise<boolean unsupported>: a cheap ruling on what the local models flag
 *   stage1Fn     for tests; defaults to the local checkers
 * Returns { status: 'pass'|'fail'|'not_checked', problems }. If the local checkers cannot answer it is 'not_checked', never 'pass'.
 */
async function checkRewrite({ text, bank, track = '', interests = [], rule = null, stage1Fn = stage1, threshold = Number(process.env.FACT_REWRITE_THRESHOLD || 0.3) }) {
  const B = require('./fact-bank'); // eslint-disable-line global-require
  const allowed = B.allowedFrom(bank, track, interests);
  const problems = [];
  for (const m of B.mechanicalCheck(text, allowed, { track }).missing) problems.push({ kind: 'token', type: m.type, value: m.raw });
  for (const p of B.illustrationCheck(text, { allowedNames: interests, allowed })) problems.push({ kind: 'illustration', value: p.problem, span: p.span });
  const sents = sentencesOf(text);
  let scores;
  try { scores = await stage1Fn(sents.map((claim) => ({ doc: fromBank(claim, bank, 5).map((x) => x.text).join(' ') || 'none', claim }))); } catch { return { status: 'not_checked', problems }; }
  for (let i = 0; i < sents.length; i++) {
    const s = scores[i];
    if (!(s.factcg >= threshold && s.minicheck >= threshold)) {
      let keep = true;
      if (rule) { try { keep = await rule(sents[i], fromBank(sents[i], bank, 6).map((x) => x.text)); } catch { keep = true; } } // eslint-disable-line no-await-in-loop
      if (keep) problems.push({ kind: 'unsupported', value: sents[i] });
    }
  }
  return { status: problems.length ? 'fail' : 'pass', problems };
}

module.exports = { isOn, stage1, supported, strength, fromBank, fromOffline, sourceClaim, checkRewrite, sentencesOf, RULE_SYSTEM, RULE_SCHEMA, THRESHOLDS, post };
