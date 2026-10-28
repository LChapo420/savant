/**
 * A unit's fact pool without paid web search: the free-first replacement for
 * services/block-levels.js researchFacts (Claude + up to 10 web searches a unit).
 *
 *   1. A free NVIDIA model (the lineup's hard tier, GLM 5.3) drafts the unit's facts
 *      from the coverage points, each with the encyclopedia article most likely to
 *      state it and a few search words. No web access, so this is only a draft.
 *   2. Each fact is looked up in the offline Wikipedia / Wiktionary
 *      (services/offline-facts.js, kiwix-serve on 127.0.0.1).
 *   3. The local checkers (tools/fact-checkers/server.py stage 1: FactCG + MiniCheck,
 *      on the GPU, free) judge whether the best passages state the fact. A fact both
 *      checkers support gets the passage's sentence as its source_quote and the
 *      article as its source_url, exactly the shape the cascade checks lessons against.
 *      When they split (one for, one against), stage 2 (Granite Guardian + HalluGuard)
 *      breaks the tie; both must say grounded. OFFLINE_POOL_STAGE2=0 skips it.
 *   4. A fact they do not support is kept but marked unsourced (no quote). The
 *      caller decides: drop it, or send ONLY those facts to the paid researcher
 *      (researchFacts with a few searches) instead of the whole unit.
 *
 * Returns the researchFacts shape plus `offline`:
 *   { facts: [{ fact, kind, source_url, source_quote, offline_source, support }],
 *     misconceptions, sources, searches: 0, cost: 0, usage, model,
 *     offline: { supported, unsourced, checkers } }
 * or null when the draft could not be written.
 *
 * Where Wikipedia is not the authority (a chess position, a chord's notes, an
 * arithmetic result) the code checkers (services/chess-checks.js, piano-checks.js,
 * basketball-checks.js) remain the ground truth; this pool covers the encyclopedic
 * facts: definitions, rules, names, dates, figures, vocabulary and grammar.
 */
const offline = require('./offline-facts');

const CHECKERS = () => `http://127.0.0.1:${process.env.FACT_CHECKERS_PORT || 6790}`;

const DRAFT_SYSTEM = `You draft the facts for one unit of lessons in an education app, before they are written. Every fact will be checked against an offline encyclopedia (Wikipedia, Wiktionary) before a writer may use it, so:
- Cover the unit's topic and every coverage point: the facts, rules, definitions, figures, dates and names a teacher needs to teach it correctly at this grade.
- Write each fact as one short plain sentence that an encyclopedia article would state in similar words. One fact per sentence; no hedging inside a fact.
- For each fact give the exact title of the Wikipedia (or, for a word, Wiktionary) article most likely to state it, and 2 to 4 search words.
- Mark each fact's kind: "established" (settled), "contested" (experts disagree or research is mixed), "opinion" (a matter of taste or style), "theoretical" (not yet established).
- List the common misconceptions about this topic, so the writer avoids them.`;

const DRAFT_SCHEMA = {
  type: 'object',
  required: ['facts', 'misconceptions'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fact', 'kind', 'article', 'keywords'],
        properties: {
          fact: { type: 'string' },
          kind: { type: 'string', enum: ['established', 'contested', 'opinion', 'theoretical'] },
          article: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    misconceptions: { type: 'array', items: { type: 'string' } },
  },
};

/**
 * POST JSON over node's http module: stage 2 runs on the CPU (10-90 s a claim, more
 * when the CPU is busy) and Node's fetch gives up after 300 s without headers.
 */
function postJson(url, data, timeoutMs = 30 * 60 * 1000) {
  // eslint-disable-next-line global-require
  const http = require('http');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode >= 400) { reject(new Error(`${url} ${res.statusCode}`)); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`${url} timed out`)));
    req.on('error', reject);
    req.end(body);
  });
}

async function stage1(pairs) {
  const out = [];
  for (let at = 0; at < pairs.length; at += 48) {
    // eslint-disable-next-line no-await-in-loop
    const r = await postJson(`${CHECKERS()}/stage1`, { pairs: pairs.slice(at, at + 48) });
    out.push(...((r && r.results) || []));
  }
  return out;
}

async function stage2(pairs) {
  const out = [];
  for (let at = 0; at < pairs.length; at += 2) {
    // eslint-disable-next-line no-await-in-loop
    const r = await postJson(`${CHECKERS()}/stage2`, { pairs: pairs.slice(at, at + 2) });
    out.push(...((r && r.results) || []));
  }
  return out;
}

async function checkersUp() {
  try {
    const res = await fetch(`${CHECKERS()}/health`);
    const body = await res.json();
    return !!(body.ok && body.models && body.models.factcg && body.models.minicheck);
  } catch { return false; }
}

/** The sentence of a passage that best matches a fact (for the quote). */
function bestSentence(passage, fact) {
  const want = new Set(offline.keyWords(fact));
  const sentences = passage.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [passage];
  let best = passage;
  let bestScore = -1;
  for (const s of sentences) {
    const have = offline.keyWords(s);
    const score = have.filter((w) => want.has(w)).length / Math.max(1, want.size);
    if (score > bestScore) { bestScore = score; best = s.trim(); }
  }
  return best;
}

/**
 * The quote the cascade checks lessons against: the best-matching sentence with the
 * sentences around it (a lone sentence often lacks its subject, e.g. a usage example).
 */
function quoteFor(passage, fact) {
  const sentence = bestSentence(passage, fact);
  if (passage.length <= 600) return passage;
  const at = Math.max(0, passage.indexOf(sentence) - 200);
  return passage.slice(at, at + 600).trim();
}

/** The public URL of an offline article, for citation (the text is CC BY-SA). */
function publicUrl(p) {
  const m = /\/content\/[^/]+\/(.+)$/.exec(p.url || '');
  const title = m ? decodeURIComponent(m[1]) : String(p.title || '').replace(/\s+/g, '_');
  return /wiktionary/i.test(p.book || '') ? `https://en.wiktionary.org/wiki/${title}` : `https://en.wikipedia.org/wiki/${title}`;
}

/**
 * Build a unit's fact pool offline. `context.text` and `coverage` as researchFacts
 * takes them. Options: maxFacts (45), passages per fact (4), models (NVIDIA entries,
 * default the hard tier), threshold (both checkers >= 0.5).
 */
async function buildUnitPool({ context, coverage = [], maxFacts = 45, k = 4, models = null, threshold = 0.5, draft = null, tieBreak = process.env.OFFLINE_POOL_STAGE2 !== '0' }) {
  let data = draft;
  let usage = null;
  let model = 'given draft';
  if (!data) {
    // eslint-disable-next-line global-require
    const nvidia = require('./providers/nvidia');
    if (!nvidia.isConfigured()) return null;
    const reply = await nvidia.structured({
      role: 'deep', task: 'fact_research', lane: 'background', maxTokens: 12000,
      system: DRAFT_SYSTEM,
      user: `${context && context.text ? context.text : ''}\n\n${coverage.length ? `COVERAGE POINTS:\n${coverage.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n` : ''}Draft the facts for this unit now: at most ${maxFacts} facts.`,
      schema: DRAFT_SCHEMA, schemaName: 'submit_fact_draft',
      ...(models ? { models } : {}),
    }).catch((err) => { console.warn(`offline-pool: the draft failed (${err.message})`); return null; });
    if (!reply || !reply.data) return null;
    data = reply.data;
    usage = reply.usage;
    model = reply.model;
  }
  const drafted = (Array.isArray(data.facts) ? data.facts : []).filter((f) => f && String(f.fact || '').trim()).slice(0, maxFacts);
  const topic = `${(context && context.topic) || ''}`;
  const useCheckers = await checkersUp();

  // Retrieval for every fact: the drafted article title first, then the fact's own words.
  const found = [];
  for (const f of drafted) {
    const query = `${f.article ? `"${f.article}" ` : ''}${f.fact}`;
    // eslint-disable-next-line no-await-in-loop
    // A drafted article that is one lowercase word is a dictionary entry ("librería"):
    // look it up in the dictionary only. Measured: with Wikipedia too, "Librería means
    // library" was "sourced" from Venice's Libreria Sansoviniana (Italian), a false pass.
    const dictionaryOnly = /^[a-zà-ÿñ'-]+$/.test(String(f.article || '').trim());
    const ps = await offline.retrieve(query, { topic: `${topic} ${(f.keywords || []).join(' ')}`, k, only: dictionaryOnly ? /wiktionary/i : null }).catch(() => []);
    found.push(ps);
  }
  // One stage-1 batch for every (passage, fact) pair.
  const pairs = [];
  drafted.forEach((f, i) => found[i].forEach((p, j) => pairs.push({ i, j, doc: `${p.title}: ${p.text}`, claim: f.fact })));
  const scores = useCheckers && pairs.length ? await stage1(pairs.map(({ doc, claim }) => ({ doc, claim }))).catch(() => null) : null;

  const facts = [];
  const sources = new Map();
  let supported = 0;
  const bests = drafted.map((f, i) => {
    let best = null;
    pairs.forEach((p, n) => {
      if (p.i !== i || !scores) return;
      const s = scores[n] || {};
      const both = Math.min(s.factcg || 0, s.minicheck || 0);
      if (!best || both > best.both) best = { both, factcg: s.factcg, minicheck: s.minicheck, passage: found[i][p.j] };
    });
    return best;
  });
  // Split decisions (one stage-1 checker for, one against) go to stage 2 (Granite
  // Guardian + HalluGuard, on the CPU, 10-90 s each): sourced only if both say grounded.
  const split = tieBreak && scores ? bests.map((b, i) => (b && ((b.factcg >= threshold) !== (b.minicheck >= threshold)) ? i : -1)).filter((i) => i >= 0) : [];
  const tie = new Map();
  if (split.length) {
    const s2 = await stage2(split.map((i) => ({ doc: `${bests[i].passage.title}: ${bests[i].passage.text}`, claim: drafted[i].fact }))).catch((err) => { console.warn(`offline-pool: stage 2 failed (${err.message})`); return null; });
    if (s2) split.forEach((i, n) => tie.set(i, s2[n] || {}));
  }
  drafted.forEach((f, i) => {
    const best = bests[i];
    const t = tie.get(i);
    const ok = !!(best && ((best.factcg >= threshold && best.minicheck >= threshold) || (t && t.granite === 'grounded' && t.halluguard === 'GROUNDED')));
    if (best && t) best.stage2 = { granite: t.granite, halluguard: t.halluguard };
    const row = { fact: String(f.fact).slice(0, 400), kind: f.kind || 'established' };
    if (ok) {
      supported++;
      const url = publicUrl(best.passage);
      sources.set(url, best.passage.title);
      Object.assign(row, { source_url: url, source_quote: quoteFor(best.passage.text, f.fact), offline_source: best.passage.url, support: { factcg: best.factcg, minicheck: best.minicheck, ...(best.stage2 ? { stage2: best.stage2 } : {}) } });
    } else {
      Object.assign(row, { source_url: '', source_quote: '', unsourced: true, support: best ? { factcg: best.factcg, minicheck: best.minicheck, ...(best.stage2 ? { stage2: best.stage2 } : {}) } : null });
    }
    facts.push(row);
  });
  const misconceptions = (Array.isArray(data.misconceptions) ? data.misconceptions : []).map((m) => String(m).slice(0, 300)).filter(Boolean).slice(0, 12);
  return {
    facts,
    misconceptions,
    sources: [...sources].map(([url, title]) => ({ url, title })),
    searches: 0,
    cost: 0,
    usage,
    model: `offline pool (${model} draft + kiwix + ${useCheckers ? 'FactCG/MiniCheck' : 'no checkers'})`,
    offline: { supported, unsourced: facts.length - supported, checkers: useCheckers },
  };
}

module.exports = { buildUnitPool, DRAFT_SYSTEM, DRAFT_SCHEMA, publicUrl };

/** Is the offline-first fact pool on? Off unless FACT_POOL=offline. */
const offlineOn = () => String(process.env.FACT_POOL || '').trim().toLowerCase() === 'offline';

/**
 * The offline-first wrapper around a paid researcher (block-levels researchFacts):
 * the offline pool first, then the researcher for ONLY the facts the offline sources
 * could not source (a few searches), and unsourced facts are never handed to the
 * writer as facts. Returns a researchFacts-shaped sheet, or null (then the caller
 * researches as before). Off (null) unless FACT_POOL=offline.
 */
async function offlineFirst({ context, coverage = [], maxFacts = 45, research = null, maxSearches = 4 }) {
  if (!offlineOn()) return null;
  const pool = await module.exports.buildUnitPool({ context, coverage, maxFacts }).catch((err) => { console.warn(`offline-pool: ${err.message}`); return null; });
  if (!pool) return null;
  const sourced = pool.facts.filter((f) => !f.unsourced);
  const unsourced = pool.facts.filter((f) => f.unsourced);
  let rest = null;
  if (unsourced.length && research) {
    rest = await research({ context, coverage: unsourced.map((f) => f.fact), maxFacts: unsourced.length, maxSearches }).catch(() => null);
  }
  const facts = [...sourced, ...((rest && rest.facts) || [])];
  if (!facts.length) return null;
  return {
    ...pool,
    facts,
    misconceptions: [...new Set([...(pool.misconceptions || []), ...((rest && rest.misconceptions) || [])])].slice(0, 12),
    sources: [...(pool.sources || []), ...((rest && rest.sources) || [])],
    searches: (rest && rest.searches) || 0,
    cost: (rest && rest.cost) || 0,
    usage: (rest && rest.usage) || pool.usage,
    model: rest ? `${pool.model} + ${rest.model} on ${unsourced.length} unsourced` : pool.model,
    offline: { ...pool.offline, researched: rest ? unsourced.length : 0, dropped: rest ? 0 : unsourced.length },
  };
}

module.exports.offlineOn = offlineOn;
module.exports.offlineFirst = offlineFirst;
