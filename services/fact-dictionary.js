/**
 * Word-level facts against a real dictionary (brief fact-100, docs/FACT-100.md): offline Wiktionary through kiwix-serve, no model deciding, no network beyond 127.0.0.1. Behind FACT_DICTIONARY=on, default off.
 *
 *   lookup(word, language)   the entry's section for that language, as plain text, or null when the entry or section is missing
 *   checkPair({ word, meaning, language })   'supported' | 'missing_word' | 'meaning_not_found' | 'no_source'
 *   checkForm({ noun, article })             Spanish noun gender from the entry: el/la against what Wiktionary marks ('m', 'f')
 *
 * Meaning match is plain word overlap between the claimed meaning and the entry, so it can only say "the dictionary uses this word for that entry" (a fair positive) or "it does not" (a flag to rule on, since a
 * dictionary may gloss with a synonym). It cannot tell a right definition from a wrong one that shares its words.
 */
const http = require('http');

function isOn() { return String(process.env.FACT_DICTIONARY || '').toLowerCase() === 'on'; }
const KIWIX = () => (process.env.KIWIX_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const BOOK = () => process.env.KIWIX_WIKTIONARY || 'wiktionary_en_all_nopic';
const cache = new Map();

function get(url, redirects = 3) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 15000, headers: { Connection: 'close' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects) { res.resume(); resolve(get(new URL(res.headers.location, url).href, redirects - 1)); return; }
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

const strip = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();

/** The text of one language's section of a Wiktionary entry. */
async function lookup(word, language = 'Spanish') {
  const key = `${language}:${word}`;
  if (cache.has(key)) return cache.get(key);
  const html = await get(`${KIWIX()}/raw/${BOOK()}/content/${encodeURIComponent(word)}`);
  let text = null;
  if (html) {
    const re = new RegExp(`<h2[^>]*id="${language}"[^>]*>`, 'i');
    const m = re.exec(html);
    if (m) {
      const rest = html.slice(m.index + m[0].length);
      const next = rest.search(/<h2[\s>]/i);
      const section = next >= 0 ? rest.slice(0, next) : rest;
      // Definitions only (numbered lists), so an etymology or a translation note does not count as a meaning.
      const senses = [...section.matchAll(/<ol[\s>][\s\S]*?<\/ol>/gi)].map((x) => strip(x[0])).join(' ');
      text = senses || strip(section);
    }
  }
  cache.set(key, text);
  return text;
}

const STOP = new Set('a an the to of be is are was in on at for and or by with it its as one some any someone something'.split(' '));
const words = (t) => (String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
/** Tolerates plural and verb endings: table / tables, going / go. */
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');

async function checkPair({ word, meaning, language = 'Spanish' }) {
  const clean = String(word || '').trim().replace(/^[¿¡]+|[?!.,;:]+$/g, '').toLowerCase();
  if (!clean) return { status: 'no_source' };
  if (!(await isUp())) return { status: 'no_source' };
  let entry = await lookup(clean, language);
  if (!entry && clean.includes(' ')) { const parts = clean.split(/\s+/); const heads = await Promise.all(parts.map((p) => lookup(p, language))); if (heads.every(Boolean)) entry = heads.join(' '); else return { status: 'missing_word', word: clean }; }
  if (!entry) return { status: 'missing_word', word: clean };
  // An inflected form ("feminine singular of embarazado", "inflection of hablar") carries its meaning in the lemma's entry.
  const lemma = /\b(?:of|plural of|singular of)\s+([\p{L}]+)/u.exec(entry);
  if (lemma && entry.length < 400 && /\b(inflection|plural|singular|feminine|masculine|person|participle|gerund|form)\b/i.test(entry)) { const more = await lookup(lemma[1].toLowerCase(), language); if (more) entry = `${entry} ${more}`; }
  const body = new Set(words(entry).map(stem));
  const want = words(meaning).map(stem);
  if (!want.length) return { status: 'supported', entry: entry.slice(0, 300) };
  const hit = want.filter((w) => body.has(w));
  return { status: hit.length >= Math.ceil(want.length / 2) ? 'supported' : 'meaning_not_found', word: clean, want, entry: entry.slice(0, 400) };
}

/** Spanish noun gender, from how the entry marks it. */
async function checkForm({ noun, article }) {
  const entry = await lookup(String(noun || '').toLowerCase(), 'Spanish');
  if (!entry) return { status: 'missing_word' };
  const m = /\bnoun\b[^.]{0,200}?\b(m|f|masculine|feminine)\b/i.exec(entry) || /\b(masculine|feminine)\b/i.exec(entry);
  if (!m) return { status: 'no_source' };
  const g = m[1].toLowerCase()[0];
  const says = /^(el|los|un|unos)$/i.test(article) ? 'm' : 'f';
  return { status: g === says ? 'supported' : 'gender_differs', dictionary: g, entry: entry.slice(0, 200) };
}

/** Dictionary entries for the foreign words of a sentence, as passages: the words that have an entry in that language, longest first. */
async function passagesFor(sentence, language = 'Spanish', k = 3) {
  const ws = [...new Set(String(sentence || '').match(/\p{L}{3,}/gu) || [])].sort((a, b) => b.length - a.length).slice(0, 10);
  const out = [];
  for (const w of ws) {
    if (out.length >= k) break;
    const low = w.toLowerCase();
    let e = await lookup(low, language); // eslint-disable-line no-await-in-loop
    if (e && e.length < 400 && /of\s+\p{L}+/u.test(e)) { const m = /of\s+(\p{L}+)/u.exec(e); const more = await lookup(m[1].toLowerCase(), language); if (more) e = `${e} ${more}`; } // eslint-disable-line no-await-in-loop
    if (e) out.push({ source: 'wiktionary', title: `Wiktionary: ${low}`, text: `${low} (${language}): ${e.slice(0, 500)}`, score: 1 });
  }
  return out;
}

async function isUp() { const h = await get(`${KIWIX()}/catalog/v2/entries`); return !!h; }

module.exports = { isOn, lookup, checkPair, checkForm, passagesFor, isUp };
