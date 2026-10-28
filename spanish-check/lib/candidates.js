'use strict';
/**
 * Candidate extraction from the frozen Tatoeba exports (see PROTOCOL.md section 2).
 * Pure and deterministic: same raw files in, same candidates out.
 */
const fs = require('fs');
const path = require('path');
const { normalize, tokensNorm, sha256, enContentWords } = require('./common');

const RAW = path.join(__dirname, '..', 'raw');
const RAW_FILES = ['spa_sentences.tsv', 'eng_sentences.tsv', 'spa-eng_links.tsv', 'spa_sentences_with_audio.tsv'];
const RAW_EXTRA = ['spa_sentences.tsv.bz2', 'eng_sentences.tsv.bz2', 'spa-eng_links.tsv.bz2', 'spa_sentences_with_audio.tsv.bz2'];

/** Frozen rule constants. Changing any of them changes the pool hash. */
const RULES = {
  minWords: 3,
  maxWords: 14,
  maxChars: 110,
  minWordCorpusCount: 3,        // every word must occur at least 3 times in the whole Spanish corpus (typo filter)
  nameLikeShare: 0.5,           // word is name-like if >= 50% of its non-initial occurrences are capitalised
  nameLikeMinNonInitial: 3,
  enMinWords: 2,
  enMaxWords: 20,
  enToEsWordRatio: [0.6, 1.5],  // translation-sanity filter
  strataCutoffs: { easyMaxRank: 250, mediumMaxRank: 1000 }, // easy <=250, medium 251..1000, hard 1001..hardMaxRank (rank of the 2nd-rarest word)
  hardMaxRank: 25000,           // beyond this the sentences are mostly proper-noun-like or odd words
  distractorFraction: 0.2,      // share of the reading pool reserved as distractor-only (never an item)
};

const ES_LETTERS = 'a-záéíóúüñ';
const BLOCK_ES = new Set(['puta', 'puto', 'putas', 'putos', 'mierda', 'joder', 'jodido', 'coño', 'polla', 'verga', 'pene', 'vagina', 'sexo', 'sexual',
  'sexuales', 'follar', 'culo', 'violar', 'violacion', 'violación', 'violador', 'cabron', 'cabrón', 'marica', 'maricon', 'maricón', 'pendejo',
  'pendeja', 'suicidio', 'suicidarse', 'suicidar', 'desnudo', 'desnuda', 'porno', 'pornografia', 'pornografía', 'zorra', 'negrata', 'mamada',
  'gilipollas', 'capullo', 'chinga', 'chingar', 'cojones', 'cojon', 'cojón', 'prostituta', 'prostitutas', 'orgasmo', 'erección', 'semen']);
const BLOCK_EN = new Set(['fuck', 'fucking', 'fucked', 'shit', 'cock', 'dick', 'pussy', 'rape', 'raped', 'rapist', 'sex', 'sexual', 'sexy', 'bitch', 'slut',
  'whore', 'nigger', 'fag', 'faggot', 'cunt', 'penis', 'vagina', 'porn', 'naked', 'suicide', 'asshole', 'bastard', 'prostitute', 'prostitutes',
  'orgasm', 'erection', 'semen', 'condom', 'masturbate', 'horny', 'damn', 'crap']);

function readTsv(file) {
  const text = fs.readFileSync(path.join(RAW, file), 'utf8');
  const lines = text.split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line) continue;
    const l = line.endsWith('\r') ? line.slice(0, -1) : line;
    rows.push(l.split('\t'));
  }
  return rows;
}

const lowerTokens = (s) => (s.normalize('NFC').toLowerCase().match(/\p{L}+/gu) || []);

function loadSpanish() {
  const rows = readTsv('spa_sentences.tsv');
  const out = [];
  for (const r of rows) {
    if (r.length < 3 || r[1] !== 'spa') continue;
    out.push({ id: Number(r[0]), text: r[2].normalize('NFC').trim() });
  }
  return out;
}

/** Corpus statistics over ALL Spanish sentences: counts, rank, name-likeness. */
function corpusStats(all) {
  const count = new Map(); const nonInit = new Map(); const nonInitCap = new Map();
  for (const s of all) {
    const raw = s.text.match(/\p{L}+/gu) || [];
    for (let i = 0; i < raw.length; i++) {
      const w = raw[i]; const lw = w.toLowerCase();
      count.set(lw, (count.get(lw) || 0) + 1);
      if (i > 0) {
        nonInit.set(lw, (nonInit.get(lw) || 0) + 1);
        if (w !== lw && w[0] !== lw[0]) nonInitCap.set(lw, (nonInitCap.get(lw) || 0) + 1);
      }
    }
  }
  const words = [...count.keys()].sort((a, b) => (count.get(b) - count.get(a)) || (a < b ? -1 : a > b ? 1 : 0));
  const rank = new Map(); words.forEach((w, i) => rank.set(w, i + 1));
  return { count, nonInit, nonInitCap, rank, vocab: words.length };
}

function nameLike(stats, lw) {
  const n = stats.nonInit.get(lw) || 0;
  if (n < RULES.nameLikeMinNonInitial) return false;
  return (stats.nonInitCap.get(lw) || 0) / n >= RULES.nameLikeShare;
}

/** Returns null if the Spanish sentence is acceptable, else a reason string. */
function spanishReject(text, stats) {
  if (text.length > RULES.maxChars) return 'too_long_chars';
  if (!new RegExp(`^[${ES_LETTERS}\\s.,;:?!¿¡]+$`, 'i').test(text)) return 'chars';
  if (!/[.?!]$/.test(text)) return 'no_terminal';
  const body = text.slice(0, -1);
  if (/[.?!]/.test(body)) return 'multi_sentence';
  if ((text.match(/¿/g) || []).length !== (text.match(/\?/g) || []).length) return 'question_marks';
  if ((text.match(/¡/g) || []).length !== (text.match(/!/g) || []).length) return 'exclam_marks';
  const raw = text.match(/\p{L}+/gu) || [];
  if (raw.length < RULES.minWords || raw.length > RULES.maxWords) return 'word_count';
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i]; const lw = w.toLowerCase();
    if (i > 0 && w !== lw && w[0] !== lw[0]) return 'capital_inside';
    if ((stats.count.get(lw) || 0) < RULES.minWordCorpusCount) return 'rare_word';
    if (nameLike(stats, lw)) return 'name_like';
    if (BLOCK_ES.has(lw)) return 'blocklist';
  }
  return null;
}

function englishAcceptable(text) {
  const t = text.normalize('NFC').trim();
  if (!/^[A-Za-z' ,.;:?!-]+$/.test(t)) return false;
  if (!/[.?!]$/.test(t)) return false;
  if (/[.?!]/.test(t.slice(0, -1))) return false;
  const raw = t.match(/[A-Za-z']+/g) || [];
  if (raw.length < RULES.enMinWords || raw.length > RULES.enMaxWords) return false;
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    if (i > 0 && /^[A-Z]/.test(w) && !/^I($|')/.test(w)) return false;
    if (BLOCK_EN.has(w.toLowerCase().replace(/'.*$/, ''))) return false;
  }
  return true;
}

/**
 * Build all candidates (before app-overlap exclusion and strata cutoffs).
 * Each candidate: one normalised-text key, with the lowest-id sentence that has audio
 * (if any) and the lowest-id acceptable English translation (if any).
 */
function buildCandidates() {
  const all = loadSpanish();
  const stats = corpusStats(all);
  const byId = new Map(all.map((s) => [s.id, s]));

  // audio: first row per sentence (lowest audio id), metadata kept for attribution
  const audioRows = readTsv('spa_sentences_with_audio.tsv');
  const audio = new Map();
  for (const r of audioRows) {
    const sid = Number(r[0]); const aid = Number(r[1]);
    if (!Number.isFinite(sid) || !Number.isFinite(aid)) continue;
    if (!r[2] || r[2] === '\\N' || !r[3] || r[3] === '\\N') continue; // attribution needs a username and a stated licence
    const cur = audio.get(sid);
    if (!cur || aid < cur.audio_id) {
      audio.set(sid, { audio_id: aid, user: r[2] && r[2] !== '\\N' ? r[2] : null, license: r[3] && r[3] !== '\\N' ? r[3] : null });
    }
  }

  // links
  const linkRows = readTsv('spa-eng_links.tsv');
  const links = new Map(); const needEng = new Set();
  for (const r of linkRows) {
    const s = Number(r[0]); const e = Number(r[1]);
    if (!links.has(s)) links.set(s, []);
    links.get(s).push(e); needEng.add(e);
  }
  // English text for the linked ids only
  const engText = new Map();
  {
    const text = fs.readFileSync(path.join(RAW, 'eng_sentences.tsv'), 'utf8');
    let pos = 0;
    while (pos < text.length) {
      let end = text.indexOf('\n', pos); if (end < 0) end = text.length;
      const line = text.slice(pos, end); pos = end + 1;
      const t1 = line.indexOf('\t'); if (t1 < 0) continue;
      const id = Number(line.slice(0, t1));
      if (!needEng.has(id)) continue;
      const t2 = line.indexOf('\t', t1 + 1);
      engText.set(id, line.slice(t2 + 1).replace(/\r$/, ''));
    }
  }

  const reasons = {};
  const bump = (k) => { reasons[k] = (reasons[k] || 0) + 1; };
  const byKey = new Map();
  const ordered = all.slice().sort((a, b) => a.id - b.id);
  for (const s of ordered) {
    const why = spanishReject(s.text, stats);
    if (why) { bump(why); continue; }
    const key = normalize(s.text);
    let c = byKey.get(key);
    if (!c) { c = { key, text: s.text, id: s.id, audio: null, audio_sentence_id: null, en: null }; byKey.set(key, c); }
    else bump('dup_key');
    const a = audio.get(s.id);
    if (a && !c.audio) { c.audio = a; c.audio_sentence_id = s.id; if (!c.text_audio) c.text_audio = s.text; }
    if (!c.en) {
      const eids = (links.get(s.id) || []).slice().sort((x, y) => x - y);
      for (const eid of eids) {
        const et = engText.get(eid);
        if (!et || !englishAcceptable(et)) continue;
        const sw = (s.text.match(/\p{L}+/gu) || []).length;
        const ew = (et.match(/[A-Za-z']+/g) || []).length;
        const ratio = ew / sw;
        if (ratio < RULES.enToEsWordRatio[0] || ratio > RULES.enToEsWordRatio[1]) { bump('en_ratio'); continue; }
        c.en = { id: eid, text: et.trim() };
        break;
      }
    }
  }
  const cands = [];
  for (const c of byKey.values()) {
    if (!c.audio && !c.en) { bump('no_audio_no_translation'); continue; }
    // the text shown/typed against must be the one whose audio is played
    const text = c.audio ? (c.text_audio || c.text) : c.text;
    const raw = text.match(/\p{L}+/gu) || [];
    const lows = raw.map((w) => w.toLowerCase());
    const ranks = [...new Set(lows)].map((w) => stats.rank.get(w)).sort((a, b) => b - a); // rarest first
    const difficulty = ranks.length >= 2 ? ranks[1] : ranks[0];
    cands.push({
      id: c.audio ? c.audio_sentence_id : c.id,
      key: c.key,
      text,
      words: raw.length,
      difficulty,
      audio: c.audio,
      en: c.en,
    });
  }
  cands.sort((a, b) => a.id - b.id);
  return { candidates: cands, stats, reasons, totalSpanish: all.length };
}

function stratumOf(difficulty) {
  const c = RULES.strataCutoffs;
  if (difficulty <= c.easyMaxRank) return 'easy';
  if (difficulty <= c.mediumMaxRank) return 'medium';
  if (difficulty <= RULES.hardMaxRank) return 'hard';
  return null;
}

function fileHashes() {
  const out = {};
  for (const f of [...RAW_FILES, ...RAW_EXTRA]) {
    const p = path.join(RAW, f);
    if (fs.existsSync(p)) out[f] = sha256(fs.readFileSync(p));
  }
  return out;
}

module.exports = { RULES, RAW, RAW_FILES, RAW_EXTRA, buildCandidates, stratumOf, fileHashes, readTsv, enContentWords, tokensNorm, loadSpanish, corpusStats };
