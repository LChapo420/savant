/**
 * The main Spanish path, played with the lab's Duolingo-style activities.
 *
 * A learner reaching a Spanish level from the dashboard or the path is sent
 * here (routes/learn.js POST /sessions answers `game.kind = 'spanish'`, the
 * same door game levels use). This file:
 *
 *   - maps the level's curriculum row (Level Type / Activity / Skill Focus) to
 *     a slot: vocabulary, grammar, listening, speaking, pronunciation, reading,
 *     writing, review, or one of the lab's own engines (unit intro, story,
 *     listening lab, dictation, conversation lab, fluency sprint);
 *   - builds the level in the lab's level format from the unit's written
 *     content (content/spanish-path/units-*.js), the learner's goal
 *     (services/spanish/goal-fit.js) and their item-level review queue, or
 *     takes a pre-written level from content/spanish-prewritten/ when one
 *     exists for that grade and level;
 *   - keeps the built level (with its answers) as a run, so the lab's routes
 *     (/api/es/check, /dictation/check, /conversation/*) grade it on the
 *     server exactly as they grade lab levels, and records each first answer;
 *   - on finish, turns the recorded answers into mastery evidence
 *     (mastery.recordAttempt), spaced-review updates, XP and the streak, and
 *     moves the enrollment on when the level is passed.
 *
 * Levels it cannot build (a unit with no written content yet, a writing lab,
 * the grade's Final, a quick game) are left to the ordinary session, so the
 * path never dead-ends.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../config/db');
const curriculum = require('../../config/curriculum');
const mastery = require('../mastery');
const fit = require('./goal-fit');

// Grades 3 and 4 (units-g3.js, units-g4.js) were written for the skill catch-up
// (services/spanish/catch-up.js, scripts/spanish-catchup-content.js); a grade whose
// file is not there yet simply has no units, and its levels go to the ordinary session.
const optionalUnits = (name) => { try { return require(`../../content/spanish-path/${name}`); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; return []; } };
const UNITS = [...require('../../content/spanish-path/units-g1'), ...require('../../content/spanish-path/units-g2'), ...optionalUnits('units-g3'), ...optionalUnits('units-g4')];
const GLOSS = require('../../content/spanish-path/gloss');
// Read only. SPANISH_PREWRITTEN_DIR points elsewhere (the test uses a temporary folder).
const PREWRITTEN_DIR = () => process.env.SPANISH_PREWRITTEN_DIR || path.join(__dirname, '..', '..', 'content', 'spanish-prewritten');

// eslint-disable-next-line global-require
const catchUp = () => require('./catch-up');

const unitKey = (gradeId, unit) => `${gradeId}|${unit}`;
const UNIT_BY_KEY = new Map(UNITS.map((u) => [unitKey(u.grade, u.unit), u]));
const PHRASES = new Map();
for (const u of UNITS) for (const p of u.phrases) PHRASES.set(p.id, { ...p, unit: u.unit, grade: u.grade });

// ── slots ──────────────────────────────────────────────────────────────────

/**
 * The slot a curriculum row plays as, or null when this player does not take
 * it (the ordinary session does).
 */
function slotOf(row) {
  if (!row) return null;
  const key = `${row.type}/${row.activity}`;
  const focus = String(row.skillFocus || '');
  switch (key) {
    case 'Preview/Unit Intro': return 'intro';
    case 'Story/Story': return 'story';
    case 'Story Episode/Input Session': return 'input';
    case 'Listening/Listening Lab': return 'listening_lab';
    case 'Dictation/Dictation': return 'dictation';
    case 'Speaking/Conversation Lab': return 'conversation';
    case 'Speaking Game/Fluency Sprint': return 'sprint';
    case 'Listening/Topic': return 'listening';
    case 'Speaking/Topic': return 'speaking';
    case 'Pronunciation/Topic': case 'Pronunciation/Sound Refresh': return 'pronunciation';
    case 'Reading/Topic': return 'reading';
    case 'Writing/Topic': case 'Translating/Topic': return 'writing';
    case 'Quiz/Unit Check': case 'Review Game/Topic': case 'Game/Topic': return 'review';
    case 'Test/Checkpoint': return 'checkpoint';
    case 'Lesson/Topic':
      if (/grammar/i.test(focus)) return 'grammar';
      if (/culture/i.test(focus)) return 'reading';
      return 'vocabulary';
    default: return null;
  }
}

/** What the learner is told the slot is, in one or two words. */
const SLOT_LABEL = {
  intro: 'Unit preview', story: 'Story', input: 'Story episode', listening_lab: 'Listening lab', dictation: 'Dictation',
  conversation: 'Conversation lab', sprint: 'Speaking game', listening: 'Listening', speaking: 'Speaking',
  pronunciation: 'Pronunciation', reading: 'Reading', writing: 'Writing', review: 'Unit review', checkpoint: 'Checkpoint',
  grammar: 'Lesson', vocabulary: 'Lesson',
};

function gradeOf(gradeId) { return curriculum.getGrade('spanish', gradeId); }
function rowAt(grade, level) { return grade && grade.levels ? grade.levels.find((l) => l.level === level) || null : null; }

/** Units a checkpoint covers ("Checkpoint: Units 1.1-1.3"). */
function checkpointUnits(row, gradeId) {
  const m = String(row.title || '').match(/Units?\s+(\d+)\.(\d+)\s*-\s*(\d+)\.(\d+)/i);
  if (!m) return [UNIT_BY_KEY.get(unitKey(gradeId, row.unit))].filter(Boolean);
  const out = [];
  for (let n = Number(m[2]); n <= Number(m[4]); n++) {
    const u = UNIT_BY_KEY.get(unitKey(gradeId, `Unit ${m[1]}.${n}`));
    if (u) out.push(u);
  }
  return out;
}

// ── pre-written levels (another session writes these; read only) ───────────

let prewrittenCache = null;
function gradeIdOf(ref) {
  if (ref == null) return null;
  const n = Number(ref);
  const grades = (curriculum.getTrack('spanish') || {}).grades || [];
  if (Number.isInteger(n) && n >= 1 && n <= grades.length) return grades[n - 1].id;
  return grades.some((g) => g.id === String(ref)) ? String(ref) : null;
}
const KNOWN_ENGINES = new Set(['lesson', 'unit_intro', 'story', 'listening_lab', 'dictation', 'conversation_lab', 'fluency_sprint', 'sound_refresh', 'unit_check']);
function validLevel(l) {
  if (!l || typeof l !== 'object' || !KNOWN_ENGINES.has(l.engine)) return false;
  if (l.engine === 'lesson' || l.engine === 'unit_check') return Array.isArray(l.items) && l.items.length > 0 && l.items.every((i) => i && i.id && i.kind);
  return true;
}
/**
 * Pre-written levels by "gradeId|level". A file may hold one level or a list,
 * in the lab's level format (config/spanish/lab), each naming its place with
 * `grade` + `level` or `csv: { grade, level }` (grade as the 1-57 number or
 * the grade id). Anything that does not parse is skipped with a warning.
 */
function prewritten() {
  if (prewrittenCache) return prewrittenCache;
  const map = new Map();
  let files = [];
  try { files = fs.readdirSync(PREWRITTEN_DIR(), { withFileTypes: true }); } catch (e) { files = []; }
  const walk = (dir, entries) => {
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      // `src/` is authoring source (the pre-written block lessons build from it), not levels.
      if (ent.isDirectory()) { if (ent.name !== 'src') { try { walk(full, fs.readdirSync(full, { withFileTypes: true })); } catch (e) { /* unreadable */ } } continue; }
      if (!/\.(json|js)$/i.test(ent.name) || /^(index|blind-resolve)\.json$/i.test(ent.name)) continue;
      let data;
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        data = /\.json$/i.test(ent.name) ? JSON.parse(fs.readFileSync(full, 'utf8')) : require(full);
      } catch (err) { console.warn(`spanish path: skipped ${ent.name} (${err.message})`); continue; }
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.levels) ? data.levels : [data]);
      for (const l of list) {
        // The same folder holds the pre-written block lessons (block_plans rows: track_id + blocks,
        // imported by scripts/import-spanish-prewritten.js); they are not lab levels and are not warned about.
        if (l && typeof l === 'object' && (Array.isArray(l.blocks) || l.prewritten)) continue;
        const gradeRef = l && (l.grade != null ? l.grade : l.csv && l.csv.grade);
        const levelNo = Number(l && (l.level != null && typeof l.level !== 'object' ? l.level : l.csv && l.csv.level));
        const gid = gradeIdOf(gradeRef);
        if (!gid || !Number.isInteger(levelNo) || !validLevel(l)) { console.warn(`spanish path: skipped a level in ${ent.name} (no grade/level or not a playable lab level)`); continue; }
        map.set(`${gid}|${levelNo}`, { ...l, source: 'prewritten', file: path.relative(PREWRITTEN_DIR(), full) });
      }
    }
  };
  walk(PREWRITTEN_DIR(), files);
  prewrittenCache = map;
  return map;
}
function resetPrewritten() { prewrittenCache = null; }

/** Can this player take the level? */
function supports(gradeId, level) {
  const grade = gradeOf(gradeId);
  const row = rowAt(grade, level);
  if (!row) return false;
  if (prewritten().has(`${gradeId}|${level}`)) return true;
  const slot = slotOf(row);
  if (!slot) return false;
  if (slot === 'checkpoint') return checkpointUnits(row, gradeId).length > 0;
  return UNIT_BY_KEY.has(unitKey(gradeId, row.unit));
}

// ── the review queue (item level) ──────────────────────────────────────────

// Hours until a phrase is due again, by box. A miss goes to box 1 (ten minutes).
const BOX_HOURS = [0, 1 / 6, 4, 24, 72, 168, 384];

function reviewRows(userId) {
  return db.find('es_review', (r) => r.user_id === userId);
}

function noteReview(userId, pid, correct, now = Date.now()) {
  const p = PHRASES.get(pid);
  if (!p) return null;
  return db.upsert('es_review', (r) => r.user_id === userId && r.pid === pid, (prev) => {
    const box = correct ? Math.min(BOX_HOURS.length - 1, (prev ? prev.box : 0) + 1) : 1;
    return {
      user_id: userId,
      pid,
      unit: p.unit,
      grade_id: p.grade,
      box,
      seen: (prev ? prev.seen : 0) + 1,
      right: (prev ? prev.right : 0) + (correct ? 1 : 0),
      wrong: (prev ? prev.wrong : 0) + (correct ? 0 : 1),
      first_at: prev ? prev.first_at : new Date(now).toISOString(),
      last_at: new Date(now).toISOString(),
      due_at: new Date(now + BOX_HOURS[box] * 3600 * 1000).toISOString(),
    };
  });
}

/** The learner's queue: what is due now, weak spots, and how much is known. */
function queueFor(userId, now = Date.now()) {
  const rows = reviewRows(userId);
  const due = rows.filter((r) => Date.parse(r.due_at) <= now).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const weak = rows.filter((r) => r.wrong > 0 && r.wrong >= r.right);
  return {
    due: due.map((r) => r.pid),
    weak: weak.map((r) => r.pid),
    learned: rows.filter((r) => r.box >= 3).length,
    seen: rows.length,
    next_due_at: rows.length ? rows.map((r) => r.due_at).sort()[0] : null,
  };
}

// ── building a level ───────────────────────────────────────────────────────

function rng(seed) {
  let s = (crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const PUNCT = /[¿?¡!.,;:…"“”]/g;
const bareWords = (s) => String(s || '').replace(PUNCT, ' ').split(/\s+/).filter(Boolean);
const norm = (s) => bareWords(s).join(' ').toLowerCase();
const CAST = ['mara', 'tomas', 'rosa', 'diego'];

/** Do two phrases mean the same thing (so neither may be the other's wrong option)? */
function sameMeaning(a, b) {
  if (a.id === b.id || norm(a.es) === norm(b.es)) return true;
  const enA = new Set(a.en.map(norm));
  if (b.en.some((e) => enA.has(norm(e)))) return true;
  const esA = new Set([a.es, ...(a.alt || [])].map(norm));
  return [b.es, ...(b.alt || [])].some((e) => esA.has(norm(e)));
}

function distractors(target, pool, n, rand, { needArt = false } = {}) {
  const ok = pool.filter((p) => !sameMeaning(p, target) && (!needArt || p.art));
  // Prefer options from the same topic, then the same skill, and of a similar
  // shape (one word with one word, a sentence with a sentence).
  const words = bareWords(target.es).length;
  const shape = (p) => Math.abs(bareWords(p.es).length - words) <= 1;
  const tiers = [
    ok.filter((p) => p.topic === target.topic && p.unit === target.unit && shape(p)),
    ok.filter((p) => p.skill === target.skill && shape(p)),
    ok.filter(shape),
    ok,
  ];
  const picked = [];
  const seenEs = new Set([norm(target.es)]); const seenEn = new Set([norm(target.en[0])]); const seenArt = new Set([target.art]);
  for (const p of tiers.flatMap((t) => shuffle(t, rand))) {
    if (picked.length >= n) break;
    if (seenEs.has(norm(p.es)) || seenEn.has(norm(p.en[0])) || (needArt && seenArt.has(p.art))) continue;
    picked.push(p); seenEs.add(norm(p.es)); seenEn.add(norm(p.en[0])); seenArt.add(p.art);
  }
  return picked.length >= n ? picked : null;
}

function glossesFor(es) {
  const out = {};
  for (const w of bareWords(es)) {
    const g = GLOSS[w.toLowerCase()];
    if (g) out[w] = g;
  }
  return out;
}

function tilesFor(answer, others, rand, extra = 3, lowercase = true) {
  const words = bareWords(answer);
  const have = new Set(words.map((w) => w.toLowerCase()));
  const pool = [];
  for (const o of others) for (const w of bareWords(o)) {
    const lw = w.toLowerCase();
    if (!have.has(lw) && !pool.some((x) => x.toLowerCase() === lw)) pool.push(lowercase && w !== 'I' ? w.toLowerCase() : w);
  }
  return [...words, ...shuffle(pool, rand).slice(0, extra)];
}

/** A one-word gap in a multi-word phrase, keeping its punctuation outside the gap. */
function gapOf(es, rand) {
  const tokens = es.split(/\s+/);
  const STOP = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'a', 'y', 'en', 'al', 'del', 'es', 'por', 'me', 'se', 'te', 'le', 'lo', 'no', 'mi', 'tu']);
  const cands = tokens.map((t, i) => ({ t, i, core: t.replace(PUNCT, '') })).filter((x) => x.core.length >= 3 && !STOP.has(x.core.toLowerCase()));
  if (tokens.length < 2 || !cands.length) return null;
  const c = cands[Math.floor(rand() * cands.length)];
  const lead = (c.t.match(/^[¿¡"“]+/) || [''])[0];
  const trail = (c.t.match(/[?!.,;:…"”]+$/) || [''])[0];
  const before = [...tokens.slice(0, c.i), lead].filter(Boolean).join(' ').replace(/ ([¿¡])$/, ' $1');
  const after = [trail, ...tokens.slice(c.i + 1)].filter(Boolean).join(' ').replace(/^([?!.,;:…]) /, '$1 ');
  return { before: before.replace(/\s+([¿¡])$/, ' $1'), after, word: c.core };
}

/** The lab item kind a recipe step produces. */
function buildKind(k) {
  if (k === 'translate_es') return 'translatees';
  if (k === 'translate_en') return 'translateen';
  if (k === 'intro') return 'select_meaning';
  return k;
}

/** Build one item of a kind from a phrase. Null when the phrase cannot make it. */
function buildItem(kind, p, ctx) {
  const { rand, pool } = ctx;
  const speaker = CAST[Math.floor(rand() * CAST.length)];
  const base = { pid: p.id, skill: p.skill };
  switch (kind) {
    case 'intro': {
      if (p.art) {
        const ds = distractors(p, pool, 2, rand, { needArt: true });
        if (ds) {
          const choices = shuffle([p, ...ds], rand);
          return { ...base, kind: 'select_image', tag: 'new', en: p.en[0], choices: choices.map((c) => ({ es: c.es, art: c.art })), answer: choices.indexOf(p) };
        }
      }
      const ds = distractors(p, pool, 2, rand);
      if (!ds) return null;
      const choices = shuffle([p, ...ds], rand);
      return { ...base, kind: 'select_meaning', tag: 'new', speaker, es: p.es, choices: choices.map((c) => c.en[0]), answer: choices.indexOf(p) };
    }
    case 'select_meaning': case 'listen_meaning': {
      const ds = distractors(p, pool, 2, rand);
      if (!ds) return null;
      const choices = shuffle([p, ...ds], rand);
      return kind === 'select_meaning'
        ? { ...base, kind, speaker, es: p.es, choices: choices.map((c) => c.en[0]), answer: choices.indexOf(p) }
        : { ...base, kind, voice: speaker, es: p.es, choices: choices.map((c) => c.en[0]), answer: choices.indexOf(p) };
    }
    case 'select_translation': case 'listen_choose': {
      const ds = distractors(p, pool, 2, rand);
      if (!ds) return null;
      const choices = shuffle([p, ...ds], rand);
      return kind === 'select_translation'
        ? { ...base, kind, en: p.en[0], choices: choices.map((c) => c.es), answer: choices.indexOf(p) }
        : { ...base, kind, voice: speaker, es: p.es, choices: choices.map((c) => c.es), answer: choices.indexOf(p) };
    }
    case 'listen_image': {
      if (!p.art) return null;
      const ds = distractors(p, pool, 2, rand, { needArt: true });
      if (!ds) return null;
      const choices = shuffle([p, ...ds], rand);
      return { ...base, kind, voice: speaker, es: p.es, choices: choices.map((c) => ({ es: c.es, art: c.art })), answer: choices.indexOf(p) };
    }
    case 'translate_es': {
      const others = pool.filter((o) => !sameMeaning(o, p)).map((o) => o.en[0]);
      return { ...base, kind: 'translate', from: 'es', speaker, text: p.es, glosses: glossesFor(p.es), tiles: tilesFor(p.en[0], others, rand), accepted: p.en };
    }
    case 'translate_en': {
      const others = pool.filter((o) => !sameMeaning(o, p)).map((o) => o.es);
      return { ...base, kind: 'translate', from: 'en', text: p.en[0], tiles: tilesFor(p.es, others, rand, 3, false), accepted: [p.es, ...(p.alt || [])], ...(ctx.typeFirst ? { mode: 'type' } : {}) };
    }
    case 'tap_heard': {
      if (bareWords(p.es).length < 2) return null;
      const others = pool.filter((o) => !sameMeaning(o, p)).map((o) => o.es);
      return { ...base, kind, voice: speaker, es: p.es, tiles: tilesFor(p.es, others, rand, 2, false), accepted: [p.es] };
    }
    case 'type_heard':
      return { ...base, kind, voice: speaker, es: p.es, accepted: [p.es] };
    case 'speak':
      // Recognisers miss very short single words ("yo"); those are listened to instead.
      if (bareWords(p.es).length < 2 && p.es.replace(PUNCT, '').length < 5) return null;
      return { ...base, kind, speaker, es: p.es, en: p.en[0] };
    case 'complete_translation': {
      const gap = gapOf(p.es, rand);
      if (!gap) return null;
      return { ...base, kind, speaker: 'axo', en: p.en[0], before: gap.before, after: gap.after, accepted: [gap.word] };
    }
    default:
      return null;
  }
}

/** Hand-written unit items (fill the blank, complete the chat, read signs, sound tips, minimal pairs). */
// Words that may appear in a hand-written item before the learner has met them.
const FREE_WORDS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'a', 'y', 'en', 'al', 'del', 'es', 'no', 'sí', 'mi', 'yo', 'tú', 'que', 'qué', 'con', 'por', 'para', 'muy', 'bien', 'hola', 'gracias', 'mara', 'tomás', 'rosa', 'diego', 'ana', 'sara']);
/** Does a hand-written item only ask for Spanish the learner has met (or is meeting now)? */
function knownEnough(x, list, known) {
  const okWords = (s) => bareWords(s).every((w) => FREE_WORDS.has(w.toLowerCase()) || known.has(w.toLowerCase()));
  if (list === 'fills') return okWords(x.choices[x.answer]);
  if (list === 'chats') return okWords(x.choices[x.answer]);
  if (list === 'reads') return true; // signs and passages are read for gist, with cognates
  return true;
}

function unitItem(kind, units, ctx) {
  const take = (list) => {
    const all = units.flatMap((u) => (u[list] || []).map((x, i) => ({ x, key: `${u.unit}:${list}:${i}` })))
      .filter((a) => !ctx.known || knownEnough(a.x, list, ctx.known));
    const fresh = all.filter((a) => !ctx.usedUnit.has(a.key));
    if (!fresh.length) return null;
    const a = fresh[Math.floor(ctx.rand() * fresh.length)];
    ctx.usedUnit.add(a.key);
    return a.x;
  };
  switch (kind) {
    case 'fill_choice': {
      const f = take('fills'); if (!f) return null;
      const order = shuffle(f.choices.map((c, i) => i), ctx.rand);
      return { kind, before: f.before, after: f.after, en: f.en, choices: order.map((i) => f.choices[i]), answer: order.indexOf(f.answer), skill: 'es_vocab_core' };
    }
    case 'complete_chat': {
      const c = take('chats'); if (!c) return null;
      const order = shuffle(c.choices.map((x, i) => i), ctx.rand);
      return { kind, lines: c.lines, choices: order.map((i) => c.choices[i]), answer: order.indexOf(c.answer), skill: 'es_greetings' };
    }
    case 'read_respond': {
      const r = take('reads'); if (!r) return null;
      const order = shuffle(r.choices.map((x, i) => i), ctx.rand);
      return { kind, ...(r.sign ? { sign: r.sign } : {}), ...(r.passage ? { passage: r.passage } : {}), question: r.question, choices: order.map((i) => r.choices[i]), answer: order.indexOf(r.answer), skill: 'es_vocab_core' };
    }
    case 'sound_tip': {
      const tips = units.flatMap((u) => u.tips || []);
      const t = tips.find((x) => x.match.test(ctx.row.title) && !ctx.usedUnit.has(x.id)) || null;
      if (!t) return null;
      ctx.usedUnit.add(t.id);
      return { kind, title: t.title, body: t.body, examples: t.examples };
    }
    case 'minimal_pair': {
      const pairs = units.flatMap((u) => u.pairs || []);
      if (!pairs.length) return null;
      const pair = pairs[Math.floor(ctx.rand() * pairs.length)];
      return { kind, pair, answer: ctx.rand() < 0.5 ? 0 : 1, voice: CAST[Math.floor(ctx.rand() * CAST.length)], skill: 'es_vocab_core' };
    }
    default: return null;
  }
}

function matchPairs(phrases, rand) {
  const picked = [];
  for (const p of shuffle(phrases, rand)) {
    if (picked.length >= 5) break;
    if (picked.some((q) => sameMeaning(q, p) || norm(q.en[0]) === norm(p.en[0]))) continue;
    picked.push(p);
  }
  if (picked.length < 3) return null;
  return { kind: 'match_pairs', pairs: picked.map((p) => [p.es, p.en[0]]), pids: picked.map((p) => p.id) };
}

/**
 * Choose the phrases for a level: the new ones it introduces and the old ones
 * it recycles. New: the unit's phrases this learner has not met yet, those
 * matching the level's own topic first, ordered by the profile. Old: due
 * reviews first, then weak spots, then phrases met most recently.
 */
function choosePhrases({ userId, units, row, profileId, slot, now, mixIn = [] }) {
  const reviewed = new Map(reviewRows(userId).map((r) => [r.pid, r]));
  const unitPhrases = units.flatMap((u) => u.phrases.map((p) => PHRASES.get(p.id)));
  const topic = units.flatMap((u) => u.topics || []).find((t) => t.match.test(row.title));
  const unseen = unitPhrases.filter((p) => !reviewed.has(p.id));
  const onTopic = topic ? unseen.filter((p) => p.topic === topic.id) : [];
  const offTopic = unseen.filter((p) => !onTopic.includes(p));
  const ordered = [...fit.orderPhrases(onTopic, profileId), ...fit.orderPhrases(offTopic, profileId)];
  const nNew = ['review', 'checkpoint'].includes(slot) ? 0 : slot === 'listening' || slot === 'pronunciation' ? 3 : 4;
  let fresh = ordered.slice(0, nNew);
  // A unit whose phrases are all met already still needs something to work on.
  const q = queueFor(userId, now);
  const recent = [...reviewed.values()].sort((a, b) => Date.parse(b.last_at) - Date.parse(a.last_at)).map((r) => r.pid);
  const inGrade = (pid) => { const p = PHRASES.get(pid); return p && units.some((u) => u.grade === p.grade); };
  const oldIds = [...new Set([...q.due, ...q.weak, ...unitPhrases.filter((p) => reviewed.has(p.id)).map((p) => p.id), ...recent.filter(inGrade)])];
  // Phrases from skills the catch-up has already taught come first among the old ones (interleaving).
  let old = [...new Set([...mixIn, ...oldIds])].map((id) => PHRASES.get(id)).filter(Boolean).filter((p) => !fresh.includes(p));
  if (!fresh.length && !old.length) fresh = fit.orderPhrases(unitPhrases, profileId).slice(0, Math.max(nNew, 4));
  if (!old.length && ['review', 'checkpoint'].includes(slot)) old = fit.orderPhrases(unitPhrases, profileId);
  return { fresh, old: old.slice(0, 10), unitPhrases, due: new Set(q.due), weak: new Set(q.weak) };
}

function buildLessonItems({ userId, units, row, profileId, slot, seed, now, mixIn = [] }) {
  const rand = rng(seed);
  const { fresh, old, unitPhrases, due, weak } = choosePhrases({ userId, units, row, profileId, slot, now, mixIn });
  // Distractors come from this grade's units so far plus everything in this unit.
  const pool = [...new Map([...unitPhrases, ...old, ...fresh].map((p) => [p.id, p])).values()];
  const gradeUnits = UNITS.filter((u) => u.grade === units[0].grade);
  for (const u of gradeUnits) for (const p of u.phrases) if (pool.length < 40 && !pool.some((x) => x.id === p.id)) pool.push(PHRASES.get(p.id));
  const known = new Set([...fresh, ...old].flatMap((p) => bareWords(p.es).map((w) => w.toLowerCase())));
  const ctx = { rand, pool, usedUnit: new Set(), row, known, typeFirst: profileId === 'test' && slot === 'writing' };
  const items = [];
  const counters = { new: 0, old: 0, any: 0 };
  const nextOf = (which) => {
    const list = which === 'new' ? fresh : which === 'old' ? (old.length ? old : fresh) : [...fresh, ...old];
    if (!list.length) return null;
    const p = list[counters[which] % list.length];
    counters[which] += 1;
    return p;
  };
  const steps = fit.recipe(profileId, slot === 'checkpoint' ? 'review' : slot);
  const introduced = new Set();
  for (const step of steps) {
    const [kind, use] = step.split(':');
    let item = null;
    if (use === 'unit') item = unitItem(kind, units, ctx);
    else if (kind === 'match_pairs') item = matchPairs(use === 'old' && old.length >= 3 ? old : [...fresh, ...old], rand);
    else {
      // Try a few phrases from the pool this step draws on before giving up.
      for (let tries = 0; tries < 4 && !item; tries++) {
        const p = nextOf(use);
        if (!p) break;
        // A new word is introduced (picture card or meaning) before anything else asks it.
        const k = kind === 'intro' && introduced.has(p.id) ? 'select_meaning' : kind;
        // The same phrase in the same activity twice is a repeat, not practice.
        if (items.some((i) => i.pid === p.id && `${i.kind}${i.from || ''}` === buildKind(k))) continue;
        item = buildItem(k, p, ctx);
        if (item && kind === 'intro') introduced.add(p.id);
      }
    }
    if (item) items.push(item);
  }
  // Every new phrase is met as a new word before it is tested (Duolingo's NEW WORD).
  for (const p of fresh) {
    if (!items.some((i) => i.pid === p.id && i.tag === 'new')) {
      const intro = buildItem('intro', p, ctx);
      if (intro) items.unshift(intro);
    }
  }
  // Checkpoints run longer: two passes of the review recipe.
  if (slot === 'checkpoint') {
    for (const step of fit.recipe(profileId, 'review')) {
      const [kind, use] = step.split(':');
      const p = use === 'unit' ? null : nextOf('old');
      const item = use === 'unit' ? unitItem(kind, units, ctx) : kind === 'match_pairs' ? null : p && buildItem(kind, p, ctx);
      if (item) items.push(item);
    }
  }
  items.forEach((it, i) => {
    it.id = `i${i + 1}`;
    if (it.pid && due.has(it.pid) && it.tag !== 'new') it.why = 'due';
    else if (it.pid && weak.has(it.pid) && it.tag !== 'new') it.why = 'weak';
  });
  // Intros first (in the order the words were introduced), then the rest as built.
  return { items, fresh: fresh.map((p) => p.id), old: old.map((p) => p.id) };
}

// Lab-engine levels built from a unit's scene and role-play card.
function sceneQuestions(unit, offset = 0) {
  return (unit.scene.questions || []).map((q, i) => {
    const order = q.choices.map((c, k) => k);
    return { id: `q${offset + i + 1}`, kind: q.kind, ...(q.prompt ? { prompt: q.prompt } : {}), ...(q.question ? { question: q.question } : {}), choices: order.map((k) => q.choices[k]), answer: q.answer, skill: 'es_vocab_core' };
  });
}

function storyLevel(unit, row, slot) {
  const qs = sceneQuestions(unit);
  const lines = [];
  unit.scene.lines.forEach((l, i) => {
    lines.push(l);
    (unit.scene.questions || []).forEach((q, k) => { if (q.after === i + 1) lines.push({ q: qs[k] }); });
  });
  const speakers = unit.scene.lines.filter((l) => l.who !== 'narrator');
  const sayAloud = slot === 'story' ? speakers.slice(0, 2).map((l, i) => ({ id: `say${i + 1}`, kind: 'speak', speaker: l.who, es: l.es, skill: 'es_greetings' })) : undefined;
  return {
    engine: 'story', slow: true, ...(slot === 'input' ? { passPct: 80 } : {}),
    story: { title: unit.scene.title, art: unit.scene.art, lines, ...(sayAloud ? { sayAloud } : {}) },
  };
}

function listeningLabLevel(unit) {
  const lines = unit.scene.lines.filter((l) => l.who !== 'narrator');
  const half = Math.ceil(lines.length / 2);
  const qs = sceneQuestions(unit);
  const clips = [
    { art: unit.scene.art, lines: lines.slice(0, half), q: qs[0] ? { ...qs[0], kind: 'listen_meaning_clip', question: qs[0].question || qs[0].prompt } : null },
    { art: unit.scene.art, lines: lines.slice(half), q: qs[qs.length - 1] ? { ...qs[qs.length - 1], id: 'q9', kind: 'listen_meaning_clip', question: qs[qs.length - 1].question || qs[qs.length - 1].prompt } : null },
  ].filter((c) => c.lines.length && c.q && !c.q.choices.some((ch) => typeof ch !== 'string'));
  const repeat = lines.slice(0, 2).map((l, i) => ({ id: `rep${i + 1}`, kind: 'speak', speaker: l.who, es: l.es, skill: 'es_greetings' }));
  return { engine: 'listening_lab', slow: true, host: 'mara', showTitle: `Radio: ${unit.scene.title}`, clips, repeat };
}

function dictationLevel(unit, rand) {
  const lines = unit.scene.lines.filter((l) => l.who !== 'narrator' && bareWords(l.es).length <= 9);
  return { engine: 'dictation', lines: shuffle(lines, rand).slice(0, 4).map((l, i) => ({ id: `d${i + 1}`, kind: 'dictation', who: l.who, es: l.es, skill: 'es_vocab_core' })) };
}

function introLevel(unit, row, rand) {
  const keyPhrases = (String(row.covers).match(/Key phrases: (.*?)\. Hear/) || [])[1];
  const named = keyPhrases ? keyPhrases.split(' / ').map((s) => s.trim()) : [];
  // The unit's own phrases standing for the key phrases on the sheet (same text where they match).
  const match = (k) => unit.phrases.find((p) => norm(p.es) === norm(k) || norm(p.es).startsWith(norm(k).replace(/\s*\.\.\.$/, '')));
  const phrases = [];
  for (const k of named) { const p = match(k); if (p && !phrases.includes(p)) phrases.push(p); }
  for (const p of unit.phrases) { if (phrases.length >= 5) break; if (!phrases.includes(p) && p.tier === 1) phrases.push(p); }
  const pool = UNITS.filter((u) => u.grade === unit.grade).flatMap((u) => u.phrases);
  const guesses = phrases.slice(0, 3).map((p, i) => {
    const ds = distractors(p, pool, 2, rand);
    const choices = shuffle([p, ...(ds || [])], rand);
    return { id: `g${i + 1}`, kind: 'select_meaning', speaker: 'mara', es: p.es, choices: choices.map((c) => c.en[0]), answer: choices.indexOf(p), pid: p.id, skill: p.skill };
  }).filter((g) => g.choices.length === 3);
  return {
    engine: 'unit_intro', goal: unit.goal,
    phrases: phrases.slice(0, 5).map((p) => ({ es: p.es, en: p.en[0] })),
    clip: unit.scene.lines.filter((l) => l.who !== 'narrator').slice(0, 5).map((l) => ({ who: l.who, es: l.es })),
    guesses,
  };
}

function sprintLevel(unit, userId, profileId) {
  const phrases = fit.orderPhrases(unit.phrases, 'conversation').filter((p) => bareWords(p.es).length <= 5).slice(0, 9);
  const r1 = phrases.slice(0, 3).map((p, i) => ({ id: `f${i + 1}`, mode: 'repeat', es: p.es }));
  const r2 = phrases.slice(3, 6).map((p, i) => ({ id: `f${i + 4}`, mode: 'say', en: p.en[0], es: p.es, accepted: [p.es, ...(p.alt || [])] }));
  const r3 = phrases.slice(6, 9).map((p, i) => (p.art ? { id: `f${i + 7}`, mode: 'picture', art: p.art, es: p.es, accepted: [p.es, ...(p.alt || [])] } : { id: `f${i + 7}`, mode: 'say', en: p.en[0], es: p.es, accepted: [p.es, ...(p.alt || [])] }));
  return { engine: 'fluency_sprint', rounds: [{ seconds: 8, prompts: r1 }, { seconds: 6, prompts: r2 }, { seconds: profileId === 'conversation' ? 5 : 4, prompts: r3 }].filter((r) => r.prompts.length) };
}

function conversationLevel(unit) {
  return { engine: 'conversation_lab', cefr: 'Pre-A1', scenario: unit.convo };
}

/**
 * Build the level for this learner. Returns the full level (answers in it);
 * routes send publicLevel() of it.
 */
function buildLevel({ userId, gradeId, level, seed, now = Date.now(), mixIn = [] }) {
  const grade = gradeOf(gradeId);
  const row = rowAt(grade, level);
  if (!row) return null;
  const profile = fit.profileFor(userId, gradeId);
  const pre = prewritten().get(`${gradeId}|${level}`);
  const slot = slotOf(row) || 'vocabulary';
  const rand = rng(`${seed}|aux`);
  const head = {
    title: row.title,
    cefr: 'Pre-A1',
    csv: { grade: (curriculum.getTrack('spanish').grades.findIndex((g) => g.id === gradeId) + 1), level, unit: row.unit, type: row.type, activity: row.activity, skillFocus: row.skillFocus, minutes: Number(row.minutes) || 5, node: row.node, whatHappens: row.covers },
  };
  if (pre) return { ...pre, ...head, title: pre.title || head.title, slot, source: 'prewritten', profile: profile.id };
  const units = slot === 'checkpoint' ? checkpointUnits(row, gradeId) : [UNIT_BY_KEY.get(unitKey(gradeId, row.unit))].filter(Boolean);
  if (!units.length) return null;
  const unit = units[units.length - 1];
  let body;
  switch (slot) {
    case 'intro': body = introLevel(unit, row, rand); break;
    case 'story': case 'input': body = storyLevel(unit, row, slot); break;
    case 'listening_lab': body = listeningLabLevel(unit); break;
    case 'dictation': body = dictationLevel(unit, rand); break;
    case 'conversation': body = conversationLevel(unit); break;
    case 'sprint': body = sprintLevel(unit, userId, profile.id); break;
    default: {
      const built = buildLessonItems({ userId, units, row, profileId: profile.id, slot, seed, now, mixIn });
      const reviewish = slot === 'review' || slot === 'checkpoint';
      body = {
        engine: 'lesson',
        practice: reviewish,
        ...(slot === 'checkpoint' ? { passPct: 80 } : {}),
        items: built.items,
        introduces: built.fresh,
        recycles: built.old,
      };
    }
  }
  return { ...head, ...body, slot, source: 'built', profile: profile.id };
}

// ── runs ───────────────────────────────────────────────────────────────────

const RUN_PREFIX = 'path-';
const isRunId = (id) => typeof id === 'string' && id.startsWith(RUN_PREFIX);

function pruneRuns(userId) {
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const mine = db.find('es_path_runs', (r) => r.user_id === userId).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const drop = new Set(mine.filter((r, i) => i >= 30 || Date.parse(r.created_at) < cutoff).map((r) => r.id));
  if (drop.size) db.remove('es_path_runs', (r) => drop.has(r.id));
}

/**
 * Start a run at a level. `preview` is true when the level is not the one
 * the enrollment stands on (finishing it does not move the learner).
 */
function startRun({ user, enrollment, level }) {
  const attempt = db.find('es_path_runs', (r) => r.user_id === user.id && r.enrollment_id === enrollment.id && r.level === level).length + 1;
  const runId = `${RUN_PREFIX}${crypto.randomBytes(9).toString('hex')}`;
  // A catch-up block's lesson recycles phrases from the skills already caught up (services/spanish/catch-up.js).
  const mixIn = catchUp().mixInFor(user.id, enrollment.grade_id, level);
  const built = buildLevel({ userId: user.id, gradeId: enrollment.grade_id, level, seed: `${user.id}|${enrollment.grade_id}|${level}|${attempt}`, mixIn });
  if (!built) return null;
  const lvl = { ...built, id: runId };
  pruneRuns(user.id);
  db.insert('es_path_runs', {
    run_id: runId,
    user_id: user.id,
    enrollment_id: enrollment.id,
    grade_id: enrollment.grade_id,
    level,
    preview: level !== enrollment.current_level,
    attempt,
    level_data: lvl,
    results: {},
    created_at: new Date().toISOString(),
    finished_at: null,
  });
  return lvl;
}

function runRow(runId) {
  return isRunId(runId) ? db.findOne('es_path_runs', (r) => r.run_id === runId) : null;
}
/** The run's level with its answers, for the lab's checking routes. */
function runLevel(runId) {
  const r = runRow(runId);
  return r ? r.level_data : null;
}

/** Record one checked answer of a run (first answer per item counts). */
function recordResult({ runId, userId, itemId, correct, extra = {} }) {
  const r = runRow(runId);
  if (!r || r.user_id !== userId || r.finished_at) return false;
  const results = { ...(r.results || {}) };
  const prev = results[itemId];
  results[itemId] = prev ? { ...prev, tries: prev.tries + 1, lastCorrect: !!correct } : { first: !!correct, tries: 1, lastCorrect: !!correct, ...extra };
  db.update('es_path_runs', r.id, { results });
  return true;
}

/** Every gradable item of a level by id (walks stories, clips, etc.). */
function itemsOf(level) {
  const out = new Map();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.id && node.kind) out.set(node.id, node);
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
  };
  walk(level);
  return out;
}

// First-try share needed to pass, by slot. An input session needs 80% on its
// picture checks and a checkpoint 80% (the curriculum's marks); a unit check
// never blocks (the curriculum says so); a fluency sprint counts on completion, since a timed
// speaking game scored by a recogniser should not hold the path; a role-play
// needs half its goals.
const PASS = { checkpoint: 0.8, input: 0.8, review: 0, sprint: 0, conversation: 0.5, default: 0.6 };

/**
 * Close a run: mastery evidence, review queue, XP and streak, and the move to
 * the next level when it is passed. `client` carries what only the browser
 * knows (a fluency sprint's spoken chunks, a conversation's goals reached).
 */
function finishRun({ user, runId, client = {} }) {
  const r = runRow(runId);
  if (!r || r.user_id !== user.id) return { error: 'No such level run.', status: 404 };
  if (r.finished_at) return { ...(r.outcome || {}), already: true };
  const enrollment = db.byId('enrollments', r.enrollment_id);
  const grade = gradeOf(r.grade_id);
  const lvl = r.level_data;
  const items = itemsOf(lvl);
  const results = r.results || {};
  const graded = Object.entries(results).filter(([id]) => items.has(id));
  const right = graded.filter(([, v]) => v.first).length;
  let accuracy = graded.length ? right / graded.length : null;

  // Conversation: the share of the role-play's goals reached. Sprint: chunks said in time.
  if (lvl.engine === 'conversation_lab' && results.__convo) accuracy = results.__convo.ratio;
  if (lvl.engine === 'fluency_sprint' && client && Number(client.total) > 0) {
    const hits = Math.max(0, Math.min(Number(client.total), Number(client.hits) || 0));
    accuracy = hits / Number(client.total);
  }
  const pass = PASS[lvl.slot] !== undefined ? PASS[lvl.slot] : PASS.default;
  const passed = accuracy === null ? true : accuracy >= pass;

  // Evidence: each first answer to a server-checked item.
  const plan = grade ? curriculum.levelPlan(grade, r.level) : null;
  const levelDifficulty = plan ? plan.difficulty : 1;
  // The review queue moves one step per phrase per run, however many times the
  // run asked it: spacing comes from coming back later, not from repeats now.
  const byPhrase = new Map();
  for (const [id, v] of graded) {
    const item = items.get(id);
    const skill = item.skill || (plan && plan.focus) || 'es_vocab_core';
    mastery.recordAttempt({ userId: user.id, skillId: skill, correct: v.first, difficulty: levelDifficulty, levelDifficulty, latencyMs: 0 });
    if (item.pid) byPhrase.set(item.pid, (byPhrase.has(item.pid) ? byPhrase.get(item.pid) : true) && v.first);
  }
  for (const [pid, ok] of byPhrase) noteReview(user.id, pid, ok);
  // Phrases met in an activity without a server check (match pairs, the unit
  // preview's phrases) still enter the queue, as seen.
  for (const it of items.values()) {
    if (it.kind === 'match_pairs' && Array.isArray(it.pids)) for (const pid of it.pids) if (!byPhrase.has(pid) && !reviewRows(user.id).some((x) => x.pid === pid)) noteReview(user.id, pid, true);
  }

  const xp = (passed ? 10 : 5) + (accuracy !== null && accuracy >= 0.95 ? 5 : 0);
  const streakDays = require('../streak').record(user.id, { xp });

  let advanced = false; let nextLevel = enrollment ? enrollment.current_level : null;
  if (enrollment && grade && passed && !r.preview && enrollment.status === 'active' && enrollment.current_level === r.level) {
    const kind = curriculum.levelKind(r.level, grade.pathLength, grade);
    if (kind === 'lesson' || kind === 'practice') {
      nextLevel = mastery.advance(enrollment, grade);
      advanced = nextLevel !== r.level;
      mastery.recordLevelCleared({ userId: user.id, enrollmentId: enrollment.id, level: r.level, accuracy: accuracy === null ? 1 : accuracy, grade });
    }
  }
  if (enrollment) {
    const fresh = db.byId('enrollments', enrollment.id);
    db.update('enrollments', enrollment.id, { xp: (fresh.xp || 0) + xp, last_session_at: new Date().toISOString() });
  }

  // A sessions row, so the dashboard's recent sittings and the history list it.
  const startedAt = r.created_at;
  const session = db.insert('sessions', {
    user_id: user.id,
    enrollment_id: r.enrollment_id,
    track_id: 'spanish',
    grade_id: r.grade_id,
    kind: 'spanish',
    level: nextLevel || r.level,
    start_level: r.level,
    levels: [r.level],
    blocks: [{ index: 0, level: r.level, kind: lvl.slot, resolved: true }],
    preview: !!r.preview,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    score: accuracy,
    xp_awarded: xp,
    es_answered: graded.length,
    es_run: r.run_id,
    analysis: { summary: `${SLOT_LABEL[lvl.slot] || 'Spanish'}: level ${r.level}${accuracy !== null ? `, ${Math.round(accuracy * 100)}% first-try` : ''}.`, source: 'rules' },
  });

  const nextRow = grade && nextLevel ? rowAt(grade, nextLevel) : null;
  const outcome = {
    passed,
    pass_mark: pass,
    accuracy: accuracy === null ? null : Math.round(accuracy * 100),
    answered: graded.length,
    xp,
    streak: streakDays,
    advanced,
    preview: !!r.preview,
    level: r.level,
    next: nextRow ? { level: nextRow.level, title: nextRow.title, label: SLOT_LABEL[slotOf(nextRow)] || nextRow.type } : null,
    queue: queueFor(user.id),
    session_id: session.id,
  };
  // A level of a catch-up block: ticked off there, and the finish card says where the catch-up stands.
  try {
    const cu = catchUp().onRunFinished({ userId: user.id, gradeId: r.grade_id, level: r.level, passed });
    if (cu) outcome.catch_up = cu;
  } catch (err) { console.warn(`spanish path: catch-up update failed: ${err.message}`); }
  db.update('es_path_runs', r.id, { finished_at: new Date().toISOString(), outcome, client: { hits: client.hits, total: client.total } });
  return outcome;
}

// ── what the browser may see ───────────────────────────────────────────────

const SECRET = new Set(['answer', 'accepted', 'wrong', 'model', 'partnerCard', 'script', 'nudges', 'fallbackReply', 'closing', 'correctAsIs', 'pid', 'pids', 'skill', 'introduces', 'recycles', 'source', 'file']);
function strip(node) {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) if (!SECRET.has(k)) out[k] = strip(v);
  return out;
}
/** The level as the browser gets it: answers stripped (match pairs keep their pairs, which are the exercise). */
function publicLevel(level) {
  const copy = strip(JSON.parse(JSON.stringify(level)));
  // Match pairs are checked in the browser by design (instant feedback per pair).
  return copy;
}

/**
 * A learner standing on a level their goal puts aside (placement can land
 * there, or the goal changed) is moved to the next level the goal keeps. Only
 * forward, and never past a level the goal keeps. Returns the enrollment as it
 * now stands.
 */
function settleDeferred(enrollment) {
  if (!enrollment || enrollment.track_id !== 'spanish' || enrollment.status !== 'active') return enrollment;
  const grade = gradeOf(enrollment.grade_id);
  if (!grade) return enrollment;
  const to = fit.stepOverDeferred(enrollment, grade, enrollment.current_level);
  if (to === enrollment.current_level) return enrollment;
  db.update('enrollments', enrollment.id, { current_level: to, level_items: 0, goal_fit_moved: { from: enrollment.current_level, to, at: new Date().toISOString() } });
  return db.byId('enrollments', enrollment.id);
}

/** The goal line and the levels put aside, for the path page. */
function pathFit(enrollment) {
  if (!enrollment || enrollment.track_id !== 'spanish') return null;
  const grade = gradeOf(enrollment.grade_id);
  const profile = fit.profileFor(enrollment.user_id, enrollment.grade_id);
  const deferred = fit.deferredLevels(grade, profile.id);
  return {
    profile: profile.id,
    label: profile.label,
    why: profile.why,
    goal: profile.goal ? { choice: profile.goal.choice, text: profile.goal.text } : null,
    deferred: Object.fromEntries(deferred),
    activities: grade ? grade.levels.filter((l) => supports(enrollment.grade_id, l.level)).length : 0,
    queue: queueFor(enrollment.user_id),
  };
}

module.exports = {
  UNITS, PHRASES, SLOT_LABEL, BOX_HOURS, PASS,
  slotOf, supports, buildLevel, startRun, runLevel, runRow, recordResult, finishRun, publicLevel, itemsOf,
  queueFor, noteReview, pathFit, settleDeferred, prewritten, resetPrewritten, isRunId, sameMeaning, gapOf, checkpointUnits,
};
