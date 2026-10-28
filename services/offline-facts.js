/**
 * Offline fact sources: retrieval from a local Wikipedia and Wiktionary, instead of
 * a paid web search, for building fact pools and grounding claim checks.
 *
 *   kiwix-serve (Kiwix, GPL-3.0, run as a separate local server; not linked)
 *     serves the ZIM files on 127.0.0.1:8090 (tools/offline-sources/start-kiwix.*):
 *       wikipedia_en_all_nopic_2026-06.zim   (every English article, text only)
 *       wiktionary_en_all_nopic_2026-08.zim  (English Wiktionary: also Spanish words)
 *     Their text is CC BY-SA 4.0 (and GFDL): fine to read and check against; a
 *     passage shown to learners needs attribution and stays under CC BY-SA.
 *
 *   retrieve(claim, { topic, k })  -> [{ title, url, text, score, book }]
 *     1. full-text search (/search, Xapian BM25) for the claim's key words, plus the
 *        lesson topic, in each book;
 *     2. the top articles' text (/raw), split into passages of a few sentences;
 *     3. passages ranked by word overlap with the claim, then re-ranked by a local
 *        embedding model (qwen3-embedding:0.6b through Ollama) when it is up.
 *   documentFor(claim, opts) -> one string of the best passages, the shape the local
 *     fact checkers (tools/fact-checkers/server.py stage1/stage2) take as `doc`.
 *
 * Everything is cached in memory (articles and query results), so a unit's claims
 * share their fetches. No network beyond 127.0.0.1.
 *
 * Env: KIWIX_URL (http://127.0.0.1:8090), KIWIX_BOOKS (comma list of book names such
 * as wikipedia_en_all; default: every book served), OFFLINE_FACTS_EMBED=0 to skip
 * the embedding re-rank.
 */
const KIWIX = () => (process.env.KIWIX_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');

const STOP = new Set('a an the and or but if then than of to in on at by for with from into onto over under as is are was were be been being it its this that these those there here which who whom whose what when where why how not no yes do does did done can could should would may might must will shall has have had having i you he she we they them his her their our your my me us also very more most less least such only just so too each every any some all both either neither one two three first second last other another same own about above below between through during before after again further once out up down off while because until against among per via vs etc e g i e'.split(' '));

const words = (t) => (String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9#'+-]+/g) || []);
const keyWords = (t) => [...new Set(words(t).filter((w) => w.length > 2 && !STOP.has(w)))];

/**
 * GET over node's http module, not fetch: kiwix-serve answers with
 * "Connection: close", which trips an internal assertion in Node 24's fetch
 * (undici, `assert(!this.paused)`) under parallel requests.
 */
function get(url, timeoutMs = 15000, redirects = 3) {
  // eslint-disable-next-line global-require
  const http = require('http');
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      // Article redirects ("Rook (Chess)" -> "Rook (chess)") come back as 302.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(get(new URL(res.headers.location, url).toString(), timeoutMs, redirects - 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) reject(Object.assign(new Error(`kiwix ${res.statusCode} for ${url.replace(KIWIX(), '')}`), { status: res.statusCode }));
        else resolve(text);
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error(`kiwix: timed out after ${timeoutMs} ms`), { status: 0 })));
    req.on('error', reject);
  });
}

const decode = (s) => String(s || '')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

// ── the library ─────────────────────────────────────────────────────────────
let booksCache = null;
/** The served books: [{ id, name, content }] (content: the path prefix under /content/). */
async function books() {
  if (booksCache) return booksCache;
  const xml = await get(`${KIWIX()}/catalog/v2/entries?count=100`);
  const list = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = ((/<id>urn:uuid:([^<]+)<\/id>/.exec(m[1]) || [])[1] || '').trim();
    const name = ((/<name>([^<]+)<\/name>/.exec(m[1]) || [])[1] || '').trim();
    const content = ((/href="\/content\/([^"]+)"/.exec(m[1]) || [])[1] || '').trim();
    if (id && content) list.push({ id, name, content });
  }
  const only = String(process.env.KIWIX_BOOKS || '').split(',').map((s) => s.trim()).filter(Boolean);
  booksCache = only.length ? list.filter((b) => only.some((o) => b.name === o || b.content.endsWith(o))) : list;
  return booksCache;
}

async function isUp() {
  try { return (await books()).length > 0; } catch { return false; }
}

// ── search and fetch ────────────────────────────────────────────────────────
const searchCache = new Map();
/** Full-text search in one book: [{ title, link }] (link: /content/... of the article). */
async function search(book, pattern, pageLength = 6) {
  const key = `${book.id}|${pattern}|${pageLength}`;
  if (searchCache.has(key)) return searchCache.get(key);
  const url = `${KIWIX()}/search?books.id=${encodeURIComponent(book.id)}&pattern=${encodeURIComponent(pattern)}&format=xml&pageLength=${pageLength}`;
  const xml = await get(url).catch(() => '');
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = decode((/<title>([\s\S]*?)<\/title>/.exec(m[1]) || [])[1] || '').trim();
    const link = decode((/<link>([\s\S]*?)<\/link>/.exec(m[1]) || [])[1] || '').trim();
    if (title && link.startsWith('/content/')) out.push({ title, link });
  }
  if (searchCache.size > 5000) searchCache.clear();
  searchCache.set(key, out);
  return out;
}

const suggestCache = new Map();
/** Article titles matching a term, from kiwix's title index: [{ title, path }]. */
async function suggest(book, term, count = 6) {
  const key = `${book.content}|${term}|${count}`;
  if (suggestCache.has(key)) return suggestCache.get(key);
  const text = await get(`${KIWIX()}/suggest?content=${encodeURIComponent(book.content)}&term=${encodeURIComponent(term)}&count=${count}`).catch(() => '[]');
  let list = [];
  try { list = JSON.parse(text); } catch { list = []; }
  const out = list.filter((x) => x && x.kind === 'path' && x.path).map((x) => ({ title: decode(x.value), path: decode(x.path).split('/').map(encodeURIComponent).join('/') }));
  if (suggestCache.size > 20000) suggestCache.clear();
  suggestCache.set(key, out);
  return out;
}

const articleCache = new Map();
/** An article's plain text, as paragraphs. */
async function article(link) {
  if (articleCache.has(link)) return articleCache.get(link);
  const html = await get(`${KIWIX()}${link}`).catch(() => '');
  const body = html
    .replace(/<(script|style|table|figure|sup|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|li|h[1-6]|dd|dt|div|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const paras = decode(body).split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length > 40);
  if (articleCache.size > 2000) articleCache.clear();
  articleCache.set(link, paras);
  return paras;
}

/** Paragraphs into passages of about 2-4 sentences (at most ~700 characters). */
function passages(paras, max = 700) {
  const out = [];
  for (const p of paras) {
    const sentences = p.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [p];
    let cur = '';
    for (const s of sentences) {
      if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ''; }
      cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

function overlap(claimWords, text, weights = null) {
  const have = new Set(words(text));
  let hit = 0;
  let total = 0;
  for (const w of claimWords) {
    const wt = weights ? weights.get(w) || 1 : (w.length > 5 ? 1.5 : 1);
    total += wt;
    if (have.has(w)) hit += wt;
  }
  return hit / Math.max(1e-9, total);
}

const cosine = (a, b) => {
  let d = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
};

/**
 * The best passages for a claim. Returns [{ title, book, url, text, score }].
 * Empty when kiwix-serve is not running or nothing matched.
 */
async function retrieve(claim, { topic = '', k = 4, articles = 4, only = null, embed = process.env.OFFLINE_FACTS_EMBED !== '0' } = {}) {
  let list;
  try { list = await books(); } catch { return []; }
  if (only) list = list.filter((b) => only.test(b.name || b.content));
  if (!list.length) return [];
  const claimWords = keyWords(claim);
  if (!claimWords.length) return [];
  // 1. Titles: kiwix's title index (/suggest) for the topic, quoted terms, names and
  //    adjacent word pairs of the claim ("pivot foot" -> "Pivot foot", "rook" with topic
  //    chess -> "Rook (Chess)"). A title whose words the claim or topic share wins.
  // 2. Full text: kiwix ANDs every word, so the query is short: a topic word plus the
  //    claim's most specific words (quoted, names, numbers, then long words), relaxed.
  const topicAll = keyWords(topic).filter((w) => !claimWords.includes(w));
  const quoted = [...String(claim).matchAll(/["“‘']([^"”’']{1,40})["”’']/g)].map((m) => m[1].trim()).filter(Boolean);
  const names = [...String(claim).matchAll(/(?:^|[^.!?]\s)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g)].map((m) => m[1]).filter((n) => !STOP.has(n.toLowerCase()));
  const special = new Set(keyWords([...quoted, ...names].join(' ')));
  const topicSet = new Set(keyWords(topic));
  const ranked = [...claimWords].sort((a, b) => (topicSet.has(b) - topicSet.has(a)) || (special.has(b) - special.has(a)) || (/\d/.test(b) - /\d/.test(a)) || (b.length - a.length));
  const seq = words(claim).filter((w) => w.length > 2 && !STOP.has(w));
  const pairs = seq.slice(0, -1).map((w, i) => `${w} ${seq[i + 1]}`);
  const titleTerms = [...new Set([...quoted, ...names, ...(topic ? [topic.trim()] : []), ...pairs.slice(0, 4), ...ranked.slice(0, 2), ...topicAll.slice(0, 2)])].filter(Boolean).slice(0, 8);
  const context = new Set([...claimWords, ...topicSet]);
  const anchor = topicAll.slice(0, 1);
  const queryList = [[...anchor, ...ranked.slice(0, 2)], ranked.slice(0, 3), [...anchor, ...ranked.slice(0, 1)], ranked.slice(0, 2)]
    .map((q) => q.join(' ')).filter((q, i, all) => q && all.indexOf(q) === i);
  const hits = new Map();
  for (const book of list) {
    const sugg = new Map();
    await Promise.all(titleTerms.map(async (term) => {
      for (const t of await suggest(book, term)) {
        const tw = keyWords(t.title);
        if (!tw.length) continue;
        const share = tw.filter((w) => context.has(w)).length / tw.length;
        // Titles naming the lesson's topic first ("Chess rook" for topic "chess rook").
        const rank = 2 * tw.filter((w) => topicSet.has(w)).length + tw.filter((w) => claimWords.includes(w)).length;
        const prev = sugg.get(t.path);
        if (share >= 0.5 && (!prev || prev.rank < rank)) sugg.set(t.path, { ...t, share, rank });
      }
    }));
    const titled = [...sugg.values()].sort((a, b) => b.rank - a.rank || b.share - a.share || a.title.length - b.title.length).slice(0, 2);
    let found = 0;
    for (const t of titled) {
      const link = `/content/${book.content}/${t.path}`;
      if (!hits.has(link)) { hits.set(link, { title: t.title, link, book: book.name || book.content, exact: true }); found++; }
    }
    for (const q of queryList) {
      if (found >= articles) break;
      // eslint-disable-next-line no-await-in-loop
      for (const h of await search(book, q, articles)) {
        if (!hits.has(h.link)) { hits.set(h.link, { ...h, book: book.name || book.content }); found++; }
      }
    }
  }
  const weights = null;
  if (process.env.OFFLINE_FACTS_DEBUG) console.log('offline-facts', { titleTerms, queryList, hits: [...hits.values()].map((h) => `${h.book}:${h.title}`) });
  const cands = [];
  await Promise.all([...hits.values()].slice(0, articles * list.length * 2).map(async (h) => {
    const paras = await article(h.link);
    for (const text of passages(paras)) cands.push({ title: h.title, book: h.book, url: `${KIWIX()}${h.link}`, text, score: overlap(claimWords, `${h.title} ${text}`, weights) });
  }));
  cands.sort((a, b) => b.score - a.score);
  // Two titles can redirect to one article ("Chess rook", "Rook (Chess)"): one copy of each passage.
  const seenText = new Set();
  const unique = cands.filter((c) => (seenText.has(c.text) ? false : seenText.add(c.text)));
  let top = unique.slice(0, Math.max(k * 3, 10));
  if (embed && top.length > k) {
    try {
      // eslint-disable-next-line global-require
      const ollama = require('./providers/ollama');
      const vecs = await ollama.embed([claim, ...top.map((c) => `${c.title}: ${c.text}`)]);
      if (vecs.length === top.length + 1) {
        top = top.map((c, i) => ({ ...c, lexical: c.score, score: 0.65 * cosine(vecs[0], vecs[i + 1]) + 0.35 * Math.min(1, c.score) }));
        top.sort((a, b) => b.score - a.score);
      }
    } catch { /* embeddings unavailable: lexical order stands */ }
  }
  return top.slice(0, k).map((c) => ({ ...c, score: Number(c.score.toFixed(3)) }));
}

/** The retrieved passages as one document for the local checkers. */
async function documentFor(claim, opts = {}) {
  const found = await retrieve(claim, opts);
  return { doc: found.map((p) => `${p.title}: ${p.text}`).join('\n'), passages: found };
}

module.exports = { retrieve, documentFor, search, suggest, article, passages, books, isUp, keyWords };
