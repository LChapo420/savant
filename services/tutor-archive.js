/**
 * Every tutor exchange a learner has ever had, kept and searchable, so the tutor can remember something from
 * hundreds of chats ago when the learner brings it up, without paying for it in tokens (owner, 30 Oct 2026: "make
 * sure the tutor memory works fully even recalling things from 100s of chats back if the user mentions it, but
 * figure out how to make that possible without absolutely draining tokens").
 *
 *   what it is    06-M11 (memory across sessions) extended: the running summary and the last few turns stay as the
 *                 always-on memory (services/tutor.js), the facts store stays the always-on summary of what is
 *                 durable (services/tutor-facts.js, T2), and THIS is the long tail underneath them: every
 *                 exchange (one learner message and the tutor's reply, with where it happened and when).
 *   the cost      retrieval is a local BM25 keyword index on this machine: no model call, no network, no tokens
 *                 to build or search. Only the few best snippets found are added to a reply, each clipped, inside
 *                 a fixed budget (below). A learner who never refers to the past and says nothing that matches an
 *                 old chat gets nothing added at all.
 *   how it finds  query = the learner's latest message. Terms are lower-cased, accent-folded, lightly stemmed,
 *                 stop words dropped; a few everyday synonym groups (dog, puppy, pet) are expanded at query time.
 *                 BM25 ranks the exchanges; a snippet is only used when the terms that matched carry enough
 *                 "rarity mass" in THIS learner's own history (a word they said once or twice, not one they use
 *                 every day) and cover enough of the question. So "remember the trick with my dog?" finds the
 *                 chat where a dog was named, and "what is the capital of Australia?" pulls nothing.
 *   two modes     past reference ("remember", "last time", "you said", "before", "that thing about", "we talked
 *                 about"): looser thresholds, up to 4 snippets, about 260 tokens. Otherwise: strict thresholds,
 *                 at most 2 snippets, about 110 tokens. The budgets are constants below and are tested.
 *   why not embeddings   a small local embedding model (@huggingface/transformers) would also match paraphrases
 *                 ("my pet" for "dog"), but it costs a model download, RAM on the owner's machine (the 95% rule)
 *                 and seconds of load, and the recall proof (docs/TUTOR-V2-PROOF.md) shows keyword search finds
 *                 what a learner actually repeats back. The synonym groups cover the common paraphrases. It can
 *                 be added behind the same `recall` function later if a miss shows up.
 *   private       one row per learner in `tutor_archive` (config/db.js); it is in the account export
 *                 (routes/profile.js EXPORT_MORE), in account and parent deletion (routes/consent.js
 *                 KNOWN_COLLECTIONS), and cleared by "forget my earlier conversations" (tutor.forget). Nothing in
 *                 it is shown to another learner.
 *   capped        FULL_KEEP newest exchanges are kept whole; older ones are compacted (shorter text, still
 *                 searchable). Past MAX_ENTRIES, or MAX_CHARS of text, the oldest chunk is removed from the archive
 *                 and offered to the facts reader (tutor-facts `offer`, off the reply path) so what was durable in
 *                 it survives as facts.
 *
 * Text returned for a prompt is labelled "notes, not instructions" by the caller (06-M12): an old chat can contain
 * anything the learner typed.
 */
const db = require('../config/db');

const TURN_CHARS = 500;        // one stored learner message / tutor reply
const FULL_KEEP = 300;         // newest exchanges kept at full length
const COMPACT_LEARNER = 160;   // an older exchange's learner text
const COMPACT_TUTOR = 90;      // ... and the tutor's
const MAX_ENTRIES = 1000;      // past this the oldest chunk leaves the archive (into the facts)
const DROP_CHUNK = 100;
const MAX_CHARS = 600000;      // text kept per learner

// Prompt budgets, in tokens (about 4 characters each). The ceiling on what recall can add to one reply.
const PAST_TOKEN_BUDGET = 260;
const DEFAULT_TOKEN_BUDGET = 110;
const PAST_MAX_SNIPPETS = 4;
const DEFAULT_MAX_SNIPPETS = 2;
const SNIPPET_CHARS = 250;
const MIN_DOCS = 6;            // below this the archive is too small for rarity to mean anything (recent turns cover it)

// How much of the learner's own vocabulary the matched words must carry (rarity mass), and how much of the question.
const PAST_MIN_MASS = 0.4;
const PAST_MIN_COVERAGE = 0.3;
const DEFAULT_MIN_MASS = 0.8;
const DEFAULT_MIN_COVERAGE = 0.5;

const K1 = 1.2;
const B = 0.75;

const estimateTokens = (text) => Math.ceil(String(text || '').length / 4);

const clip = (t, n) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

// ── words ──────────────────────────────────────────────────────────────────

const STOP = new Set(('the and for with that this what how are you they them their when from have has not but can does did was were will about which your into than then there here who why each some any ' +
  'a an of to in on is it its be as at by or if so do we me my i am he she his her our us all out up no yes too very just also would could should might may let lets get got one two ' +
  'tell told say said ask asked please thanks thank hey hi hello ok okay yeah really like know think want need make made going gonna ' +
  'el la los las un una de que en y es se lo por con para mi tu su').split(/\s+/));

// Words that say "something from before". They steer the mode; they are not searched for.
const PAST_CUES = /\b(remember|remembered|recall|last time|last week|last month|last year|yesterday|you said|you told|you mentioned|i told you|i said|i mentioned|we talked|we discussed|we went over|we did|talked about|told you|mentioned|earlier|before|previous(ly)?|a while ago|ages ago|long ago|back when|that (thing|trick|story|example|time|one|joke|tip)|the (trick|thing|story|example|tip|joke) (with|about|you|we)|again|used to|forgot|forget)\b/i;
const CUE_WORDS = new Set(['remember', 'remembered', 'recall', 'last', 'yesterday', 'mentioned', 'talked', 'discussed', 'earlier', 'before', 'previous', 'previously', 'again', 'ago', 'trick', 'thing', 'story', 'time', 'back', 'when', 'forgot', 'forget', 'used', 'went', 'over']);

const SYNONYMS = [
  ['dog', 'puppy', 'pup', 'doggo', 'pooch'],
  ['cat', 'kitten', 'kitty'],
  ['mom', 'mum', 'mother', 'mama', 'mommy'],
  ['dad', 'father', 'papa', 'daddy'],
  ['teacher', 'tutor', 'instructor'],
  ['song', 'music', 'tune'],
  ['exam', 'test', 'quiz'],
  ['soccer', 'football'],
  ['car', 'truck', 'vehicle'],
  ['pet', 'dog', 'cat'],
];
const SYN = new Map();
for (const group of SYNONYMS) for (const w of group) SYN.set(w, [...new Set([...(SYN.get(w) || []), ...group.filter((g) => g !== w)])]);

function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ied')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.length > 4 && w.endsWith('ly')) return w.slice(0, -2);
  return w;
}

function terms(text) {
  const out = [];
  const folded = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const raw of folded.split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

// ── storage ────────────────────────────────────────────────────────────────

function rowOf(userId) {
  return db.findOne('tutor_archive', (r) => r.user_id === userId);
}

const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
const entryChars = (e) => (e.learner || '').length + (e.tutor || '').length;

/** Add one exchange. Returns the archive's size after. Never throws. */
function append(userId, { where = '', learnerSaid = '', tutorSaid = '', at = null } = {}) {
  try {
    if (!userId || (!String(learnerSaid).trim() && !String(tutorSaid).trim())) return 0;
    const stamp = at || new Date().toISOString();
    let row = rowOf(userId);
    if (!row) row = db.insert('tutor_archive', { user_id: userId, entries: [], next_seq: 1, rev: 0, removed: 0, updated_at: stamp });
    const entry = { n: row.next_seq, at: stamp, where: clip(where, 60), learner: clip(learnerSaid, TURN_CHARS), tutor: clip(tutorSaid, TURN_CHARS) };
    row.entries.push(entry);
    row.next_seq += 1;
    row.updated_at = stamp;
    enforceCaps(userId, row);
    db.update('tutor_archive', row.id, { entries: row.entries, next_seq: row.next_seq, rev: row.rev, removed: row.removed });
    return row.entries.length;
  } catch {
    return 0;
  }
}

/** Compact the older exchanges; past the caps, send the oldest chunk to the facts reader and drop it. */
function enforceCaps(userId, row) {
  const n = row.entries.length;
  if (n > FULL_KEEP) {
    // Only the exchange that just crossed the line needs compacting each time (the rest were done earlier).
    const cut = n - FULL_KEEP;
    for (let i = Math.max(0, cut - 1); i < cut; i++) {
      const e = row.entries[i];
      if (!e.compact) {
        e.learner = clip(e.learner, COMPACT_LEARNER);
        e.tutor = clip(e.tutor, COMPACT_TUTOR);
        e.compact = true;
      }
    }
  }
  let chars = row.entries.reduce((a, e) => a + entryChars(e), 0);
  if (row.entries.length > MAX_ENTRIES || chars > MAX_CHARS) {
    const dropped = [];
    while (row.entries.length > MAX_ENTRIES - DROP_CHUNK || (chars > MAX_CHARS && row.entries.length > FULL_KEEP)) {
      const e = row.entries.shift();
      chars -= entryChars(e);
      dropped.push(e);
      if (dropped.length >= DROP_CHUNK * 2) break;
    }
    if (dropped.length) {
      row.removed = (row.removed || 0) + dropped.length;
      // The first exchange changed: the index is rebuilt on the next search. (Compacting an older one does not need that.)
      row.rev = (row.rev || 0) + 1;
      intoFacts(userId, dropped);
    }
  }
}

/** What is durable in the oldest exchanges is read into the facts store, off the reply path, best effort. */
function intoFacts(userId, dropped) {
  try {
    const learnerSaid = dropped.map((e) => e.learner).filter(Boolean).join('\n').slice(-1600);
    const tutorSaid = dropped.map((e) => e.tutor).filter(Boolean).join('\n').slice(-1600);
    if (!learnerSaid) return;
    // eslint-disable-next-line global-require
    require('./tutor-facts').offer(userId, { learnerSaid, tutorSaid, before: '', where: 'older chats' }, { force: true }).catch(() => {});
  } catch { /* the entries are gone either way; facts are the bonus */ }
}

function count(userId) {
  const row = rowOf(userId);
  return row ? row.entries.length : 0;
}

/** For the learner's own view and the export: counts only (the entries themselves are in the export). */
function summary(userId) {
  const row = rowOf(userId);
  return { exchanges: row ? row.entries.length : 0, older_removed: row ? row.removed || 0 : 0 };
}

function forget(userId) {
  indexes.delete(userId);
  return db.remove('tutor_archive', (r) => r.user_id === userId);
}

// ── the index ──────────────────────────────────────────────────────────────

const indexes = new Map(); // userId -> { rowId, rev, first, last, docs, postings, df, totalLen }

function addDoc(ix, e) {
  const ts = terms(`${e.learner} ${e.tutor}`);
  const tf = new Map();
  for (const t of ts) tf.set(t, (tf.get(t) || 0) + 1);
  const i = ix.docs.length;
  ix.docs.push({ e, len: ts.length || 1, tf });
  ix.totalLen += ts.length || 1;
  for (const [t, c] of tf) {
    let p = ix.postings.get(t);
    if (!p) { p = []; ix.postings.set(t, p); }
    p.push([i, c]);
  }
}

function indexFor(userId) {
  const row = rowOf(userId);
  if (!row || !row.entries.length) { indexes.delete(userId); return null; }
  let ix = indexes.get(userId);
  const first = row.entries[0].n;
  const last = row.entries[row.entries.length - 1].n;
  if (ix && ix.rowId === row.id && ix.rev === (row.rev || 0) && ix.first === first && ix.last <= last) {
    // Only appended exchanges: index them, keep the rest.
    for (let i = ix.docs.length; i < row.entries.length; i++) addDoc(ix, row.entries[i]);
    ix.last = last;
    return ix;
  }
  ix = { rowId: row.id, rev: row.rev || 0, first, last, docs: [], postings: new Map(), totalLen: 0 };
  for (const e of row.entries) addDoc(ix, e);
  indexes.set(userId, ix);
  return ix;
}

// ── search ─────────────────────────────────────────────────────────────────

/**
 * Rank this learner's exchanges against `query`. Returns { hits, docs, terms }; each hit is
 * { entry, score, mass, coverage, matched }, best first.
 *
 * The question's words (cue words like "remember" aside) become GROUPS: a word and its everyday synonyms. A group
 * that the learner's history has never used cannot match and is left out. For one exchange:
 *   mass      the sum, over the groups it matches, of how rare the matched word is in THIS learner's history
 *             (idf / the largest idf possible, 0..1; a synonym counts 0.7 of that);
 *   coverage  the share of the searchable groups it matches;
 *   score     BM25 over every matched word, to rank the candidates.
 * Nothing is filtered by threshold here (recall does that, and the threshold depends on the mode).
 */
function search(userId, query, { exclude = null, limit = 8 } = {}) {
  const ix = indexFor(userId);
  if (!ix || ix.docs.length < MIN_DOCS) return { hits: [], docs: ix ? ix.docs.length : 0, terms: [] };
  const N = ix.docs.length;
  const avg = ix.totalLen / N;
  const maxIdf = Math.log(1 + (N - 0.5) / 1.5);
  const idf = (t) => { const p = ix.postings.get(t); const df = p ? p.length : 0; return df ? Math.log(1 + (N - df + 0.5) / (df + 0.5)) : 0; };
  const base = [...new Set(terms(query).filter((t) => !CUE_WORDS.has(t)))];
  const groups = base.map((t) => ({ t, variants: [[t, 1], ...(SYN.get(t) || []).map((s) => [stem(s), 0.7])].filter(([v]) => ix.postings.has(v)) })).filter((g) => g.variants.length);
  if (!groups.length) return { hits: [], docs: N, terms: [] };
  const cand = new Map(); // doc index -> { score, groupBest: number[], matched: Set }
  groups.forEach((g, gi) => {
    for (const [v, w] of g.variants) {
      const wi = idf(v);
      for (const [i, c] of ix.postings.get(v)) {
        const d = ix.docs[i];
        const s = w * wi * (c * (K1 + 1)) / (c + K1 * (1 - B + B * d.len / avg));
        let cur = cand.get(i);
        if (!cur) { cur = { score: 0, groupBest: new Array(groups.length).fill(0), matched: new Set() }; cand.set(i, cur); }
        cur.score += s;
        cur.groupBest[gi] = Math.max(cur.groupBest[gi], w * (wi / maxIdf));
        cur.matched.add(v);
      }
    }
  });
  const hits = [];
  for (const [i, v] of cand) {
    const d = ix.docs[i];
    if (exclude && exclude.has(norm(d.e.learner))) continue;
    const mass = v.groupBest.reduce((a, b) => a + b, 0);
    const coverage = v.groupBest.filter((x) => x > 0).length / groups.length;
    hits.push({ entry: d.e, score: v.score, mass, coverage, matched: [...v.matched] });
  }
  hits.sort((a, b) => b.score - a.score || b.entry.n - a.entry.n);
  return { hits: hits.slice(0, limit), docs: N, terms: groups.map((g) => g.t) };
}

// ── the reply-time call ────────────────────────────────────────────────────

/** Whether the learner is pointing at something earlier. */
const refersToPast = (text) => PAST_CUES.test(String(text || ''));

function ago(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'earlier';
  const mins = Math.max(0, (now - t) / 60000);
  if (mins < 60) return 'earlier today';
  const hours = mins / 60;
  if (hours < 24) return 'earlier today';
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 700) return `${Math.round(days / 30)} months ago`;
  return 'over a year ago';
}

/** A window of `text` around the first of `words` it contains, `n` characters at most. */
function windowAround(text, words, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const lower = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let at = -1;
  for (const w of words) {
    const i = lower.indexOf(w.length > 4 ? w.slice(0, 4) : w);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return `${s.slice(0, n - 1)}…`;
  const start = Math.max(0, Math.min(at - Math.floor(n / 3), s.length - n));
  return `${start > 0 ? '…' : ''}${s.slice(start, start + n - (start > 0 ? 1 : 0))}${start + n < s.length ? '…' : ''}`;
}

function snippetOf(hit, now) {
  const e = hit.entry;
  const learnerHit = terms(e.learner).some((t) => hit.matched.includes(t));
  const tutorHit = terms(e.tutor).some((t) => hit.matched.includes(t));
  const label = `${ago(e.at, now)}${e.where ? `, ${e.where}` : ''}`;
  const parts = [];
  if (e.learner) parts.push(`they said "${windowAround(e.learner, hit.matched, tutorHit && !learnerHit ? 90 : 160)}"`);
  if (e.tutor && (tutorHit || !e.learner)) parts.push(`you said "${windowAround(e.tutor, hit.matched, 130)}"`);
  else if (e.tutor && !tutorHit) parts.push(`you replied "${windowAround(e.tutor, [], 70)}"`);
  return clip(`(${label}) ${parts.join('; ')}`, SNIPPET_CHARS);
}

/**
 * The few old exchanges worth adding to this reply, as prompt lines.
 *
 *   query    the learner's latest message
 *   history  the messages of the conversation in progress (they are in the prompt already, so they are skipped)
 *
 * Returns { lines, snippets, past, tokens, ms, candidates }. `lines` is empty when nothing clears the bar, which is
 * the normal case. Never throws.
 */
function recall(userId, query, { history = [], now = Date.now(), forcePast = null } = {}) {
  const started = process.hrtime.bigint();
  const empty = { lines: [], snippets: [], past: false, tokens: 0, ms: 0, candidates: 0 };
  try {
    const q = String(query || '').trim();
    if (!userId || q.length < 3) return empty;
    const past = forcePast === null ? refersToPast(q) : !!forcePast;
    const exclude = new Set((history || []).filter((m) => m && m.role === 'user').map((m) => norm(String(m.content || '').slice(0, TURN_CHARS))));
    exclude.add(norm(q.slice(0, TURN_CHARS)));
    const { hits } = search(userId, q, { exclude, limit: 12 });
    const minMass = past ? PAST_MIN_MASS : DEFAULT_MIN_MASS;
    const minCover = past ? PAST_MIN_COVERAGE : DEFAULT_MIN_COVERAGE;
    const maxSnips = past ? PAST_MAX_SNIPPETS : DEFAULT_MAX_SNIPPETS;
    const budgetChars = (past ? PAST_TOKEN_BUDGET : DEFAULT_TOKEN_BUDGET) * 4;
    const lines = [];
    const snippets = [];
    let used = 0;
    const best = hits.length ? hits[0].score : 0;
    for (const h of hits) {
      if (h.mass < minMass || h.coverage < minCover) continue;
      if (snippets.length && h.score < best * 0.35) continue; // far behind the best match: not worth the tokens
      let line = snippetOf(h, now);
      if (used + line.length + 3 > budgetChars) {
        const room = budgetChars - used - 3;
        if (room < 80 || snippets.length) continue;
        line = clip(line, room);
      }
      lines.push(line);
      snippets.push({ n: h.entry.n, at: h.entry.at, score: Number(h.score.toFixed(2)), mass: Number(h.mass.toFixed(2)), coverage: Number(h.coverage.toFixed(2)) });
      used += line.length + 3;
      if (snippets.length >= maxSnips) break;
    }
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    return { lines, snippets, past, tokens: estimateTokens(lines.join('\n')), ms: Number(ms.toFixed(2)), candidates: hits.length };
  } catch {
    return empty;
  }
}

module.exports = {
  TURN_CHARS, FULL_KEEP, MAX_ENTRIES, MAX_CHARS, PAST_TOKEN_BUDGET, DEFAULT_TOKEN_BUDGET, PAST_MAX_SNIPPETS, DEFAULT_MAX_SNIPPETS, SNIPPET_CHARS, MIN_DOCS,
  append, count, summary, forget, search, recall, refersToPast, terms, estimateTokens, ago,
};
