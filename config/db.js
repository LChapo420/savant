/**
 * The only file in the app that knows how data is stored.
 *
 * Right now that is a single JSON document held in memory and flushed to disk,
 * which is the right trade for a single-box MVP: no install, no migrations, and
 * a data file you can read with your eyes. Everything above this file talks in
 * terms of collections and plain objects, so Phase 5 replaces the guts here with
 * Postgres without touching a route or a service.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
// DB_FILE points a process at its own copy, so work running side by side (one
// subject's lessons per process) never overwrites another's writes.
const DB_PATH = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'db.json');
const TMP_PATH = DB_PATH + '.tmp';

const COLLECTIONS = [
  'users',
  'enrollments',     // one per user per (track, grade) they signed up for
  'skill_states',    // per user per skill: mastery, ease, review schedule
  'profiles',        // learner profile: style vector, pacing, format preferences
  'sessions',        // every placement, lesson, and checkpoint sitting
  'items',           // every question served, with the user's answer
  'events',          // append-only attempt log, the raw material of the learner model
  'content_cache',   // generated items, shared across all users
  'ai_usage',        // per user per day token spend, for the budget guard
  'reports',         // learner reports of a bad item
  'lessons',         // taught lessons, written per learner per level
  'remediations',    // a failed checkpoint: what went wrong, and the teaching for it
  'streaks',         // per enrollment: consecutive levels cleared at 90%+ in a row
  'essays',          // a written checkpoint: prompt, rubric, draft, and every attempt
  'level_feedback',  // what a learner said they liked and disliked about a level
  'level_edits',     // a learner's own tailored version of a level, written for them
  'scorecards',      // the 100-stat learning scorecard, one per user (services/scorecard)
  'level_signals',   // how each level went: reading time, accuracy, conclusion, experiment
  'learner_records', // what is known for sure, what is suspected, and open recommendations
  'level_debriefs',  // the after-level read of every level: queued, run, and what it changed
  'placement_question_sets', // one per subject: the model-written ladder shared by every learner
  'subject_placements',      // a learner's walk up a whole subject, and the percentages it produced
  'game_payloads',           // the questions for a game level: written once, validated, kept
  'block_plans',             // a block level's layout and content: per learner, or shared per level
  'assist_chats',            // chat assist on a block, a game question or a check: every turn the learner wrote
  'level_logs',              // what a learner did inside a level that has no questions of its own to record it
  'chess_ratings',           // chess puzzle trainer: one per learner, Glicko-2 rating and rush best (content/chess-trainer.js)
  'chess_puzzle_attempts',   // chess puzzle trainer: one per puzzle shown, graded move by move on the server
  'chess_rush_runs',         // chess puzzle trainer: one per 3-minute rush
  'chess_drill_cards',       // chess move trainer: one per learner per move card, its level and when it is due (content/chess-srs.js)
  'chess_drill_runs',        // chess move trainer: one per line played through, graded on the server
  'fact_pools',              // a unit's researched facts with their source sentences, shared by its levels (services/fact-cascade)
  'piano_song_results',      // piano song path: one per learner per song, best stars and recent takes, scored on the server
  'parents',                 // parent/guardian accounts: sign in to review, revoke and delete a linked child's account (routes/consent.js)
  'parental_consents',       // one per child account under its country's consent age: status, method, notice version, opt-ins, history (routes/consent.js)
  'skill_records',           // chess, piano, basketball: one per learner per exit-battery metric, every sitting (cold/warm, day, source, confirmed) and practice set (services/skill-record.js)
  'study_sessions',          // a learner's "Start session" to "End session" span: local day, active time, pauses (services/study-sessions.js)
  'learner_goals',           // what a learner wants from a subject or grade: choice + their words, per (track, grade) (services/goals.js)
  'tutor_modes',             // the tutor dock's voice/text choice per learner: the mode of their last message (services/tutor-mode.js)
  'tutor_memory',            // the one persistent tutor per learner: running summary + last turns (services/tutor.js)
  'enforcers',               // retention enforcers: end of session/day and scheduled ones, tier, window, questions, results (services/enforcers.js)
  'es_path_runs',            // main-path Spanish: one per level played with the Duolingo-style activities, its built level and first answers (services/spanish/path.js)
  'act_profiles',            // ACT prep: one per learner, test date and target score (services/act-scores.js)
  'act_scores',              // ACT prep: one per recorded practice or official test, section scores by date (services/act-scores.js)
  'act_study',               // ACT measurement study: one per participant, counterbalanced order, consent (services/act-study.js)
  'spanish_study',           // Savant vs Duolingo beginner-Spanish study: one per participant, arm drawn from drand (services/spanish-study.js)
  'spanish_study_checkins',  // Duolingo-arm daily self-reported minutes
  'spanish_study_tests',     // pre/post scores on the sealed external tests
  'material_courses',        // courses built from a learner's material (services/course-builder.js), private to them
  'material_progress',       // study progress on a built course: skill status, spaced-review due times, open quiz (services/material-study.js)
  'material_packs',          // study packs built from a learner's material: summary, flashcards, quiz, practice test (services/material-pack.js), private to them
  'material_podcasts',       // two-voice podcast scripts built from a learner's material, overview or weak spots (services/material-podcast.js), private to them
  'material_cards',          // flashcard deck per material: pack cards, the learner's misses and their own cards, with spaced-review due times (services/material-cards.js), private to them
  'material_audio_jobs',     // audio transcription jobs: progress and outcome, no audio kept (services/material-audio.js), private to them
  'materials',               // learn from your own material: the extracted text of a learner's upload or paste, private to them (services/materials.js)
  'es_review',               // main-path Spanish: the item-level review queue, one per learner per phrase: box, due time, right/wrong (services/spanish/path.js)
];

function emptyStore() {
  const store = { _counters: {} };
  for (const name of COLLECTIONS) {
    store[name] = [];
    store._counters[name] = 0;
  }
  return store;
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const fresh = emptyStore();
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    // A truncated file would otherwise take the whole app down on boot. Keep the
    // damaged copy for inspection rather than silently deleting someone's data.
    const backup = `${DB_PATH}.corrupt-${Date.now()}`;
    fs.renameSync(DB_PATH, backup);
    console.error(`db.json was unreadable (${err.message}); moved to ${backup} and started fresh`);
    parsed = emptyStore();
  }
  const store = emptyStore();
  for (const name of COLLECTIONS) {
    if (Array.isArray(parsed[name])) store[name] = parsed[name];
    if (parsed._counters && typeof parsed._counters[name] === 'number') {
      store._counters[name] = parsed._counters[name];
    } else {
      // A collection added after the first run still needs a counter above its
      // highest existing id, or the next insert would reuse an id.
      store._counters[name] = store[name].reduce((m, r) => Math.max(m, r.id || 0), 0);
    }
  }
  return store;
}

const store = load();

let dirty = false;
let flushTimer = null;

let flushFailures = 0;

function flush() {
  flushTimer = null;
  if (!dirty) return;
  dirty = false;
  // Write beside the target and rename, so a crash mid-write cannot leave a
  // half-written db.json behind.
  try {
    fs.writeFileSync(TMP_PATH, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(TMP_PATH, DB_PATH);
    if (flushFailures) console.warn(`db: saved after ${flushFailures} failed attempt(s)`);
    flushFailures = 0;
  } catch (err) {
    // On Windows the rename fails for a moment (EPERM, EBUSY, EACCES) while another
    // program holds db.json open: a backup, an antivirus scan, a script copying it.
    // Thrown from this timer it used to crash the server. The changes are still in
    // memory, so keep them dirty and try again shortly, backing off to 5 s.
    dirty = true;
    flushFailures++;
    if (flushFailures === 1 || flushFailures % 20 === 0) console.warn(`db: save failed (${err.code || err.message}); retrying`);
    if (!flushTimer) flushTimer = setTimeout(flush, Math.min(5000, 250 * 2 ** Math.min(flushFailures, 5)));
  }
}

// Scripts that only read set DB_READONLY=1: the store is a copy held in this
// process, and writing it back would overwrite whatever a running server has
// saved since this process loaded it.
const READONLY = process.env.DB_READONLY === '1';

function touch() {
  if (READONLY) return;
  dirty = true;
  if (!flushTimer) flushTimer = setTimeout(flush, 250);
}

for (const signal of ['exit', 'SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try { flush(); } catch { /* nothing useful to do while exiting */ }
    if (signal !== 'exit') process.exit(0);
  });
}

function collection(name) {
  const rows = store[name];
  if (!rows) throw new Error(`unknown collection: ${name}`);
  return rows;
}

const db = {
  all(name) {
    return collection(name);
  },

  insert(name, doc) {
    const id = ++store._counters[name];
    const row = { id, created_at: new Date().toISOString(), ...doc };
    collection(name).push(row);
    touch();
    return row;
  },

  insertMany(name, docs) {
    return docs.map((d) => db.insert(name, d));
  },

  find(name, predicate) {
    return collection(name).filter(predicate);
  },

  findOne(name, predicate) {
    return collection(name).find(predicate) || null;
  },

  byId(name, id) {
    const numeric = Number(id);
    return collection(name).find((r) => r.id === numeric) || null;
  },

  update(name, id, patch) {
    const row = db.byId(name, id);
    if (!row) return null;
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    touch();
    return row;
  },

  /** Update in place when found, insert otherwise. Used for per-skill state. */
  upsert(name, predicate, build) {
    const existing = db.findOne(name, predicate);
    if (existing) {
      Object.assign(existing, build(existing), { updated_at: new Date().toISOString() });
      touch();
      return existing;
    }
    return db.insert(name, build(null));
  },

  remove(name, predicate) {
    const rows = collection(name);
    let removed = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (predicate(rows[i])) { rows.splice(i, 1); removed++; }
    }
    if (removed) touch();
    return removed;
  },

  /** Force a synchronous write. Tests and scripts use this; requests do not. */
  flush,

  path: DB_PATH,
};

module.exports = db;
