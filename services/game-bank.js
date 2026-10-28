/**
 * Learning games built from the verified question bank (BANK_GAMES, default on).
 *
 * The rules and their sources: curriculum-build/GAMES-PLACEMENT.md. In short:
 *
 *   WHERE  ordinary practice levels only, never a lesson (first exposure), a
 *          checkpoint, an essay, a tester, a retention level or a production task
 *          (timed, spoken, written, drawn, proved). Inside each lesson's activity
 *          ladder (Activity 1-9) the game takes the independent-practice slots 4
 *          and 6; a slot whose row is a production task hands its game to slot 5.
 *          So a lesson gets at most two game levels out of seven, never two in a
 *          row, and the guided rows (1-3) stay plain. Spanish keeps its authored
 *          "Game" and "Review Game" rows (not speaking, listening or performance
 *          rows). A grade with authored game assignments (English
 *          Proficient) keeps them; nothing is added there.
 *   WHO    preschool to undergraduate (K-16, the populations the meta-analyses
 *          cover); not graduate grades and beyond. The same base games for
 *          everyone, the owner included: nothing here is tailored.
 *   WHAT   the level's own skill (its layout row), with a share of earlier skills
 *          interleaved on the maths-like tracks; the objective items written for
 *          the lesson the level follows come first.
 *   HOW    only engines whose questions wait for the learner (no countdown, no
 *          aimed or moving answer targets, no wagering), and where a question
 *          gates every turn, so the play does not crowd out the practice. The
 *          youngest grades get the calm board games only. Real-time arcade
 *          engines stay available to authored assignments but are not used here.
 *
 * Every question is the bank's own item: its prompt, its key and its rationale
 * come from content/bank.js (or a kept objective item), never from a model. A
 * multiple-choice item keeps its own options. A numeric item that the bank asks
 * as type-in (or with three options) gets near-miss wrong options computed here
 * (key ± 1, ± 2, ± 10, reversed digits), and only when its prompt asks for one
 * exact number — never "which is greater", "an even number", "about" and the
 * like, where a computed option could also be right. Options are kept in
 * numerical order. The grade's difficulty range (config/grade-skills.js
 * fitEntry) is applied to every draw, and a grade's largest number is enforced
 * on the prompt and every option, so a Kindergarten game never shows 100+.
 *
 * Payloads are seeded by track/grade/level, so a level always has the same set
 * (the answer route finds the question it was served), are computed in a few
 * milliseconds, and are never stored or written by a model.
 *
 * BANK_GAMES=off: config/game-assignments.js resolves exactly as before (the
 * engine cycle with model-written questions) and nothing here is consulted.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const gradeSkills = require('../config/grade-skills');
const bank = require('../content/bank');

const ROOT = path.join(__dirname, '..');
const ENGINES_DIR = path.join(ROOT, 'public', 'games', 'engines');
const SCHEMAS_DIR = path.join(ROOT, 'public', 'games', 'schemas');
const REGISTRY = path.join(ROOT, 'game_registry.json');
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

function on() {
  return String(process.env.BANK_GAMES || 'on').toLowerCase() !== 'off';
}

/** The tracks the bank games cover. */
const TRACKS = new Set(['math', 'reading', 'english', 'spanish', 'iq', 'act', 'chess', 'piano', 'basketball']);

/** At most this many questions in a set (the engines' pool size), at least MIN_QUESTIONS. */
const MAX_QUESTIONS = 50;
const MIN_QUESTIONS = 24;
/** Draws tried per level before giving up on reaching MAX_QUESTIONS. */
const MAX_DRAWS = 900;

/** Graduate grades and beyond: no games (no evidence there, and the work is production). */
const BEYOND_K16 = /^(graduate_core|masters|doctoral|postdoctoral|senior_scholar|field_authority)/;

/**
 * Skill tracks: only knowledge skills get games. Board, keyboard and court work
 * is practised for real (the skill sittings), never replaced by a quiz game.
 */
const KNOWLEDGE_SKILLS = new Set([
  'chess_board', 'chess_history', 'chess_opening', 'chess_notation', 'chess_material', 'chess_practical',
  'chess_strategy', 'chess_professional', 'chess_engines',
  'piano_reading', 'piano_intervals', 'piano_chords', 'piano_keys', 'piano_keyboard', 'piano_terms',
  'piano_rhythm', 'piano_scales', 'piano_jazz',
  'bb_rules', 'bb_history', 'bb_health', 'bb_mental', 'bb_tactics', 'bb_court', 'bb_officiating', 'bb_stats',
  'bb_coaching', 'bb_frontier',
]);
const SKILL_TRACKS = new Set(['chess', 'piano', 'basketball']);

/** Tracks whose game interleaves earlier skills (rohrer2015; brunmair2019 cautions for words and texts). */
const INTERLEAVED = new Set(['math', 'iq', 'act']);

// ── the engines ────────────────────────────────────────────────────────────
/**
 * Every engine the bank may choose, and what it shows. `numbers` is the largest
 * number its own board or score line shows in normal play (checked against the
 * grade's largest number); `words` means the engine plays the answer as a word.
 * Not listed, with the reason (GAMES-PLACEMENT.md, "Engines not used"):
 *   coin-flip, blackjack           wagering
 *   spot-it                        4.5-second countdown
 *   duck-hunt, ring-toss           the answer is given by aiming at a moving or thrown target
 *   whack-a-mole                   a timed tap after the answer
 *   simon-says                     a colour-memory task between questions (play off the skill)
 *   dino-runner, flappy-bird       a wrong answer ends the run
 *   war, trash, uno                a question only on a tie, a duplicate or a forced draw
 *   pinball, ping-pong, pong-breakout, air-hockey, snake, crossy-road, pac-man,
 *   mario, moto-x3m, tetris, hole-io, tiny-fishing, eight-ball-pool
 *                                  real-time play between rare questions
 */
const ENGINE_INFO = {
  'tic-tac-toe': { numbers: 0 },
  'connect-four': { numbers: 0 },
  'tug-of-war': { numbers: 0 },
  'capture-the-flag': { numbers: 0 },
  'snakes-and-ladders': { numbers: 50 },
  'hot-air-balloon': { numbers: 0 },
  'memory-match': { numbers: 0 },
  mancala: { numbers: 48 },
  bingo: { numbers: 75 },
  yahtzee: { numbers: 400 },
  bowling: { numbers: 300 },
  archery: { numbers: 500 },
  'free-throw': { numbers: 10 },
  'tower-defense': { numbers: 0 },
  hangman: { numbers: 0, words: true },
};

/**
 * Engines by skill family, best fit first (GAMES-PLACEMENT.md table). The early
 * band (school grade 2 and below, and the first two grades of the tracks with no
 * school grade) uses only the calm, turn-based boards.
 */
const POOLS = {
  early: {
    number: ['snakes-and-ladders', 'memory-match', 'tug-of-war', 'connect-four', 'hot-air-balloon', 'tic-tac-toe'],
    shapes: ['memory-match', 'connect-four', 'tic-tac-toe', 'capture-the-flag', 'tug-of-war'],
    literacy: ['memory-match', 'snakes-and-ladders', 'tug-of-war', 'connect-four', 'hot-air-balloon', 'tic-tac-toe'],
    general: ['tug-of-war', 'connect-four', 'memory-match', 'tic-tac-toe', 'hot-air-balloon', 'snakes-and-ladders'],
  },
  standard: {
    number: ['snakes-and-ladders', 'yahtzee', 'bingo', 'bowling', 'connect-four', 'tug-of-war', 'capture-the-flag'],
    symbolic: ['connect-four', 'capture-the-flag', 'mancala', 'archery', 'free-throw', 'tic-tac-toe'],
    shapes: ['memory-match', 'connect-four', 'capture-the-flag', 'tic-tac-toe', 'mancala'],
    literacy: ['memory-match', 'tug-of-war', 'connect-four', 'snakes-and-ladders', 'hot-air-balloon'],
    vocab: ['hangman', 'memory-match', 'tug-of-war', 'connect-four', 'hot-air-balloon'],
    language: ['tug-of-war', 'connect-four', 'capture-the-flag', 'tic-tac-toe', 'mancala', 'hot-air-balloon'],
    literary: ['capture-the-flag', 'mancala', 'connect-four', 'tower-defense', 'tug-of-war'],
    reasoning: ['mancala', 'connect-four', 'capture-the-flag', 'tower-defense', 'tic-tac-toe'],
    test: ['tug-of-war', 'capture-the-flag', 'connect-four', 'archery', 'free-throw', 'tower-defense'],
    music: ['memory-match', 'connect-four', 'tug-of-war', 'bowling', 'hot-air-balloon'],
    sport: ['free-throw', 'capture-the-flag', 'connect-four', 'tug-of-war'],
    board: ['mancala', 'capture-the-flag', 'connect-four', 'tic-tac-toe'],
    general: ['tug-of-war', 'connect-four', 'capture-the-flag', 'tic-tac-toe', 'mancala'],
  },
};

const FAMILY = {
  number: ['counting', 'place_value', 'facts_within_20', 'add_sub', 'measurement', 'word_problems', 'mul_div', 'fractions',
    'decimals', 'data_stats', 'percents', 'ratios', 'integers', 'order_ops', 'act_data', 'es_numbers'],
  symbolic: ['linear_eq', 'inequalities', 'slope_lines', 'systems', 'functions', 'quadratics', 'polynomials', 'sequences',
    'trig_basics', 'rational_expr', 'complex_nums', 'logs', 'calculus', 'linear_algebra', 'discrete_math', 'analysis',
    'abstract_algebra', 'topology', 'exponents', 'probability', 'geometry_area'],
  shapes: ['shapes', 'spatial_reason'],
  literacy: ['early_literacy', 'phonics'],
  vocab: ['es_vocab_core', 'es_gender', 'vocab_context'],
  literary: ['literary_analysis', 'author_purpose', 'main_idea', 'inference', 'detail_support', 'linguistics', 'es_literature',
    'early_comprehension'],
  reasoning: ['logic_deduction', 'odd_one_out', 'matrix_pattern', 'syllogism', 'verbal_analogy', 'numeric_reason',
    'letter_series', 'code_cipher'],
};
const FAMILY_OF = {};
for (const [family, skills] of Object.entries(FAMILY)) for (const s of skills) FAMILY_OF[s] = family;

function familyFor(trackId, skillId) {
  if (trackId === 'act') return 'test';
  if (trackId === 'piano') return 'music';
  if (trackId === 'basketball') return 'sport';
  if (trackId === 'chess') return 'board';
  if (FAMILY_OF[skillId]) return FAMILY_OF[skillId];
  if (/^es_/.test(skillId) || trackId === 'english' || trackId === 'reading') return 'language';
  return 'general';
}

/** Spanish "Game" rows name their mechanic; the engine that plays it, when one does. */
const SPANISH_TITLES = [
  [/memory|pairs|match/i, 'memory-match'],
  [/race|tug/i, 'tug-of-war'],
  [/fix|error|mistake/i, 'connect-four'],
  [/build|builder|order/i, 'capture-the-flag'],
  [/bingo/i, 'bingo'],
  [/hangman|spell/i, 'hangman'],
];

let engineCache = null;
/** The engines that are installed, have a schema and are not marked broken. */
function installed() {
  if (engineCache) return engineCache;
  let registry = [];
  try { registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')).engines || []; } catch { /* no library */ }
  const ok = new Set(registry.filter((e) => e && SAFE_ID.test(String(e.id || '')) && e.status !== 'broken').map((e) => e.id));
  engineCache = new Set(Object.keys(ENGINE_INFO).filter((id) => ok.has(id)
    && fs.existsSync(path.join(ENGINES_DIR, `${id}.html`)) && fs.existsSync(path.join(SCHEMAS_DIR, `${id}.question-schema.json`))));
  return engineCache;
}

function schemaFor(engineId) {
  if (!SAFE_ID.test(String(engineId || ''))) return null;
  try { return JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, `${engineId}.question-schema.json`), 'utf8')); } catch { return null; }
}

// ── who and where ──────────────────────────────────────────────────────────
/** -1 preschool, 0 Kindergarten ... 12, or null (config/grade-skills.js schoolGrade). */
function schoolOf(grade) {
  return gradeSkills.schoolGrade(grade);
}

/** The early band: school grade 2 and below, or the first two grades of a track with no school grade. */
function bandOf(grade) {
  const school = schoolOf(grade);
  if (school !== null) return school <= 2 ? 'early' : 'standard';
  if (['iq', 'chess', 'piano', 'basketball'].includes(grade.trackId)) {
    const index = curriculum.getTrack(grade.trackId).grades.findIndex((g) => g.id === grade.id);
    return index >= 0 && index <= 1 ? 'early' : 'standard';
  }
  return 'standard';
}

/**
 * The largest number a game may show at this grade (prompt, options and the
 * engine's own board): preschool counts within 20 (ELOF; K.CC.5), Kindergarten
 * to 100 but never a three-digit number (K.CC.1), grade 1 to 120 (1.NBT.1),
 * grade 2 within 1,000 (2.NBT), grade 3 within 10,000. No cap above grade 3.
 */
function largestNumber(grade) {
  const school = schoolOf(grade);
  if (school === null) return bandOf(grade) === 'early' ? 99 : Infinity;
  if (school <= -1) return 20;
  if (school === 0) return 99;
  if (school === 1) return 120;
  if (school === 2) return 1000;
  if (school === 3) return 10000;
  return Infinity;
}

/** What one activity row asks the learner to produce, when it is not a recognition task. */
const PRODUCTION = /\b(timed|record|dictat|draft|write|writing|written|speak|speaking|say it|talk|tell|explain|discuss|essay|peer|annotate|draw|act it out|real objects|film|recital|tournament|prove|proof|derivation|sketch|construct|hands|tempo|play it out|play and|court|warm up|listen|sing|clap|perform|performance|portfolio|project|interview|presentation|debate)\b/i;
const LADDER = /^(?:Grade Review )?Activity (\d+) of (\d+) \(quiz\/game\):\s*(.*)$/i;

/** The activity's own name in a ladder row ("Sort and Compare"), or the whole title. */
function activityName(title) {
  const m = LADDER.exec(String(title || ''));
  if (!m) return String(title || '');
  return m[3].split(/\s+-\s+/)[0];
}

/** The ladder slot (1-9) of a row, or null when the row is not a ladder activity. */
function slotOf(entry) {
  const m = LADDER.exec(String((entry && entry.title) || ''));
  return m ? Number(m[1]) : null;
}

/**
 * The slots in one ladder that take a game: 4 and 6, with 5 standing in for a
 * slot whose row is a production task. Returns a Set of slot numbers.
 */
function gameSlots(grade, level, slot) {
  const rowAt = (n) => LAYOUT.entryFor(grade, level - slot + n) || {};
  const fits = (n) => {
    const e = rowAt(n);
    return slotOf(e) === n && !PRODUCTION.test(activityName(e.title));
  };
  const chosen = new Set();
  for (const n of [4, 6]) if (fits(n)) chosen.add(n);
  if (chosen.size < 2 && fits(5)) chosen.add(5);
  // Never two game levels side by side: 5 with 4 or with 6 keeps only one of them.
  if (chosen.has(5) && chosen.has(4)) chosen.delete(5);
  if (chosen.has(5) && chosen.has(6)) chosen.delete(5);
  return chosen;
}

/**
 * Whether the placement rules put a game at this level (before asking whether
 * the bank can fill one). Returns { slot, title } or null.
 */
function placedAt(grade, level) {
  if (!grade || BEYOND_K16.test(grade.id)) return null;
  const kind = curriculum.levelKind(level, grade.pathLength, grade);
  if (kind !== 'practice') return null;
  if (curriculum.isEssayCheckpoint && curriculum.isEssayCheckpoint(grade, level)) return null;
  const entry = LAYOUT.entryFor(grade, level) || {};
  if (/\(retention\)/i.test(String(entry.title || '')) || /^retention\b/i.test(String(entry.covers || ''))) return null;
  if (grade.trackId === 'spanish') {
    // The authored game and review-game rows, and only those: a "Speaking Game"
    // is a timed speaking drill, and a review "Performance Task" is production.
    if (!/^(review )?game$/i.test(String(entry.type || '').trim())) return null;
    if (PRODUCTION.test(String(entry.title || ''))) return null;
    return { slot: null, entry };
  }
  const slot = slotOf(entry);
  if (!slot) return null; // testers, previews, master-quiz stand-ins, tournaments
  if (!gameSlots(grade, level, slot).has(slot)) return null;
  return { slot, entry };
}

// ── the questions ──────────────────────────────────────────────────────────
const NEEDS_MEDIA = /\b(picture|diagram|image|listen to|audio|hear|sound clip)\b|\b(the|this) (figure|graph|grid|model|chart|staff) (below|above|shown)\b|\b(shown|pictured) (below|above|here)\b|\bin the (figure|diagram)\b/i;
/** A prompt that does not ask for one exact number: a computed option could also be right. */
const OPEN = /\b(greater|greatest|less|least|more|most|fewer|fewest|larger|largest|smaller|smallest|bigger|biggest|higher|highest|lower|lowest|between|not|except|even|odd|prime|multiples?|factors?|divisible|any|example|estimate|about|round|rounded|nearest|closest|approximately|or|possible|could|might)\b/i;
const INTEGER = /^-?(0|[1-9]\d*)$/;
const TYPED = /\b(enter|type|write|spell|in mind|from memory|decimal|percent|percentage)\b|%/i;
/** Skills whose items only work with something hidden or typed (the digits must leave the screen). */
const SKIP_SKILLS = new Set(['working_memory']);

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

function numbersIn(text) {
  return (String(text || '').replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

/** Does any number in the prompt or the options exceed the grade's largest number? */
function tooBig(texts, max) {
  if (!Number.isFinite(max)) return false;
  return texts.some((t) => numbersIn(t).some((n) => n > max));
}

/**
 * Near-miss wrong options for an integer key, in numerical order with the key at
 * the wanted slot where the numbers allow it. Typical counting and place-value
 * slips: one or two off, ten off, the digits reversed.
 */
function numericOptions(key, wantSlot, max, also = []) {
  const k = Number(key);
  const floor = k >= 0 ? 0 : -Infinity;
  const taken = new Set([k, ...also.map(Number)]);
  const below = [];
  const above = [];
  const add = (v, list) => {
    if (!Number.isInteger(v) || taken.has(v) || v < floor || v > max) return;
    taken.add(v);
    list.push(v);
  };
  // Nearest slips first, mixed with the place-value slip (ten off) and, for a
  // two-digit key, the reversed digits (a teen-number classic: 18 and 81).
  const reversed = Math.abs(k) >= 10 && Math.abs(k) < 100 ? Number(String(Math.abs(k)).split('').reverse().join('')) * Math.sign(k) : null;
  [k - 1, k - 10, k - 2, k - 3, k - 4].forEach((v) => add(v, below));
  [k + 1, k + 10, reversed, k + 2, k + 3, k + 4].forEach((v) => (v !== null && add(v, v < k ? below : above)));
  const fromBelow = Math.min(wantSlot, below.length);
  const fromAbove = 3 - fromBelow;
  if (above.length < fromAbove) {
    const extra = Math.min(below.length, 3 - above.length);
    if (extra + above.length < 3) return null;
    return [...below.slice(0, extra), ...above].concat([k]).sort((a, b) => a - b).map(String);
  }
  return [...below.slice(0, fromBelow), ...above.slice(0, fromAbove), k].sort((a, b) => a - b).map(String);
}

/**
 * The key may not stand out by its length: neither the objective-items rule nor
 * the stricter one the game checks use (services/subject-placement.js lengthCue,
 * via game-payloads inspectPayload) may flag it.
 */
function lengthCue(choices, ki) {
  const a = String(choices[ki] || '').trim().length;
  const others = choices.filter((_, j) => j !== ki).map((c) => String(c).trim().length);
  const mean = others.reduce((x, y) => x + y, 0) / others.length;
  const max = Math.max(...others);
  return (a >= 1.8 * mean && a - max >= 10) || (max >= 1.8 * a && max - a >= 10);
}

let checkers = null;
function checks() {
  if (!checkers) {
    // eslint-disable-next-line global-require
    const { keyAgreement } = require('./key-agreement');
    // eslint-disable-next-line global-require
    const mathClaims = require('./math-claims');
    checkers = { keyAgreement, mathClaims };
  }
  return checkers;
}

/**
 * One bank or objective item as a four-option game question, or null when it
 * cannot be played as one without changing what it asks. `slot` is where the
 * key should sit (0-3), so a set's keys spread across the options.
 */
function toQuestion(item, { slot, max, trackId }) {
  if (!item || item.passage || item.fen || SKIP_SKILLS.has(item.skill_id)) return null;
  // A type-in's answer-format line ("Give a whole number.") is dropped: the
  // options are on screen. Nothing else in a prompt is ever changed.
  const prompt = String(item.prompt || '').replace(/\s*Give (?:a|your answer as a) whole number\.\s*$/i, '').trim();
  // A prompt that still tells the learner to type, enter or write something, or
  // asks for a decimal or a percentage, is not played as a four-option question.
  if (TYPED.test(prompt)) return null;
  const answer = String(item.answer == null ? '' : item.answer).trim();
  const rationale = String(item.rationale || '').trim();
  if (!prompt || !answer || !rationale || prompt.length > 360) return null;
  if (NEEDS_MEDIA.test(prompt) || /[<>]/.test(prompt) || /[<>]/.test(answer)) return null;
  let choices = null;
  const given = item.format === 'multiple_choice' && Array.isArray(item.choices) ? item.choices.map((c) => String(c).trim()) : [];
  if (given.length >= 4) {
    const wrong = given.filter((c) => norm(c) !== norm(answer));
    if (wrong.length < 3 || given.filter((c) => norm(c) === norm(answer)).length !== 1) return null;
    // Three of the bank's own wrong options; a set whose key stands out by its
    // length tries the next three before the item is dropped.
    for (let start = 0; start < wrong.length && !choices; start++) {
      const pick = [0, 1, 2].map((j) => wrong[(start + j) % wrong.length]);
      if (new Set(pick.map(norm)).size < 3) continue;
      const set = pick.slice();
      set.splice(slot, 0, answer);
      if (!lengthCue(set, slot)) choices = set;
    }
    if (!choices) return null;
    // Numbers read in order (haladyna2002): an all-numeric set is sorted.
    if (choices.every((c) => INTEGER.test(c))) choices = choices.slice().sort((a, b) => Number(a) - Number(b));
  } else if (INTEGER.test(answer) && !OPEN.test(prompt)
    && (item.accepts || []).every((a) => !INTEGER.test(String(a).trim()) || Number(a) === Number(answer))) {
    // A question with one exact numeric answer: near-miss options around the key,
    // keeping any wrong options the bank already wrote.
    const bankWrong = given.filter((c) => norm(c) !== norm(answer));
    if (bankWrong.some((c) => !INTEGER.test(c))) return null;
    const options = numericOptions(answer, slot, max, bankWrong);
    if (!options) return null;
    if (bankWrong.length) {
      const extra = options.filter((o) => o !== answer && !bankWrong.includes(o));
      choices = [answer, ...bankWrong, ...extra].slice(0, 4).sort((a, b) => Number(a) - Number(b));
      if (choices.length < 4) return null;
    } else {
      choices = options;
    }
  } else {
    return null;
  }
  if (choices.length !== 4 || new Set(choices.map(norm)).size !== 4) return null;
  if (choices.some((c) => !c || /[<>]/.test(c) || /\b(all|none) of the above\b/i.test(c))) return null;
  const answerIndex = choices.findIndex((c) => norm(c) === norm(answer));
  if (answerIndex < 0) return null;
  if (tooBig([prompt, ...choices], max)) return null;
  if (lengthCue(choices, answerIndex)) return null;
  const { keyAgreement, mathClaims } = checks();
  if (keyAgreement({ choices, answerIndex, explanation: rationale }).flagged) return null;
  if (trackId === 'math' && mathClaims.questionProblems({ prompt, choices, answer: choices[answerIndex] }).length) return null;
  return {
    prompt,
    choices,
    answerIndex,
    explanation: rationale,
    difficulty: Math.max(1, Math.min(10, Math.round(Number(item.difficulty) || 5))),
    skill: String(item.skill_id || ''),
    key: answer,
  };
}

/** Tracks whose layout rows carry their own authored skill (the row, not the lesson, says what is practised). */
const ROW_SKILL_TRACKS = new Set(['spanish', 'act', 'chess', 'piano', 'basketball']);

/**
 * The skills a level's game draws from: what the lesson it follows taught first
 * (M57; on the tracks whose rows are authored, the row's own skill), then the
 * earlier skills the level reviews.
 */
function levelSkills(grade, level, entry) {
  const plan = curriculum.levelPlan(grade, level);
  const valid = (s) => (s && grade.skills.includes(s) ? s : null);
  let taught = null;
  if (!ROW_SKILL_TRACKS.has(grade.trackId)) {
    const lessonLevel = LAYOUT.previousLesson(grade, level);
    taught = lessonLevel ? valid((LAYOUT.entryFor(grade, lessonLevel) || {}).skill) : null;
  }
  const own = taught || valid(entry && entry.skill) || plan.focus;
  const earlier = (plan.introduced || []).filter((s) => s !== own);
  let skills = [own, ...earlier];
  if (SKILL_TRACKS.has(grade.trackId)) skills = skills.filter((s) => KNOWLEDGE_SKILLS.has(s));
  return { primary: skills[0] === own ? own : null, skills, difficulty: plan.difficulty };
}

/** Objective items written for the lesson this level practises (M57), as bank-shaped items. */
function objectiveItemsFor(trackId, gradeId, grade, level, allowedSkills) {
  try {
    // eslint-disable-next-line global-require
    const objectiveItems = require('./objective-items');
    if (!objectiveItems.enabled()) return [];
    const byObjective = objectiveItems.forGrade(trackId, gradeId);
    if (!byObjective.size) return [];
    // eslint-disable-next-line global-require
    const objectives = require('./coverage').objectivesFor(trackId, gradeId) || [];
    const out = [];
    for (const o of objectives) {
      if (!(o.levels || []).includes(level) && o.lesson_level !== LAYOUT.previousLesson(grade, level)) continue;
      const skill = o.skill && allowedSkills.includes(o.skill) ? o.skill : null;
      for (const q of byObjective.get(o.id) || []) {
        if ((q.choices || []).length < 4) continue;
        out.push({ ...q, skill_id: skill || q.skill_id, difficulty: 3, format: 'multiple_choice', objective_item_id: q.id });
      }
    }
    return out;
  } catch (err) {
    return [];
  }
}

function hash(text, n = 10) {
  return crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, n);
}

/**
 * The question set for one level: up to MAX_QUESTIONS distinct questions, the
 * objective items first, then bank draws across the level's skills and a spread
 * of difficulties held to the grade's range. Deterministic for the level.
 */
function buildQuestions(trackId, gradeId, level) {
  const grade = curriculum.getGrade(trackId, gradeId);
  if (!grade) return [];
  const entry = LAYOUT.entryFor(grade, level) || {};
  const { primary, skills, difficulty } = levelSkills(grade, level, entry);
  if (!skills.length) return [];
  // A skill-track row whose own skill is played (board, keyboard, court) gets no game.
  if (SKILL_TRACKS.has(trackId) && !primary) return [];
  const max = largestNumber(grade);
  const out = [];
  const seen = new Set();
  const take = (item, origin) => {
    const q = toQuestion(item, { slot: out.length % 4, max, trackId });
    if (!q) return false;
    const id = `${norm(q.prompt)}||${norm(q.key)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    q.origin = origin;
    out.push(q);
    return true;
  };
  for (const item of objectiveItemsFor(trackId, gradeId, grade, level, skills)) {
    if (out.length >= Math.floor(MAX_QUESTIONS / 2)) break;
    if (skills.includes(item.skill_id)) take(item, { source: 'objective_item', objective_item: item.objective_item_id });
  }
  // Interleaving on the maths-like tracks: one draw in four on an earlier skill.
  const interleave = INTERLEAVED.has(trackId) && skills.length > 1;
  // A spread around the level's difficulty, easier first (a high success rate for
  // the weaker learner; jansen2013): support, on-level and a little stretch.
  const offsets = [-1.5, -1, -0.5, 0, 0, 0.5, 0, 1];
  // Each draw stands alone (no shared avoid list), so any question can be drawn
  // again from its recorded origin and its key checked against the bank.
  const draw = (skillId, i, tag) => {
    const d = Math.max(1, Math.min(10, difficulty + offsets[i % offsets.length]));
    const fitted = gradeSkills.fitEntry(grade, { skillId, difficulty: d });
    const origin = { source: 'bank', skill: skillId, difficulty: fitted.difficulty, school: Number.isFinite(fitted.school) ? fitted.school : null, seed: `${tag}:${trackId}:${gradeId}:${level}:${i}` };
    let item;
    try {
      item = bank.generate({ skillId, difficulty: origin.difficulty, school: fitted.school, seed: origin.seed, stable: true });
    } catch (err) {
      return;
    }
    take(item, origin);
  };
  // A pool that has given almost nothing after 300 draws will not fill a set.
  const hopeless = (i, from) => i >= 300 && out.length - from < 8;
  for (let i = 0; i < MAX_DRAWS && out.length < MAX_QUESTIONS && !hopeless(i, 0); i++) {
    draw(interleave && i % 4 === 3 ? skills[1 + (Math.floor(i / 4) % (skills.length - 1))] : skills[0], i, 'bankgame');
  }
  // A primary skill too thin to fill the set: fill from the level's other skills.
  if (out.length < MAX_QUESTIONS && skills.length > 1) {
    const from = out.length;
    for (let i = 0; i < MAX_DRAWS && out.length < MAX_QUESTIONS && !hopeless(i, from); i++) draw(skills[1 + (i % (skills.length - 1))], i, 'bankgame-fill');
  }
  return out;
}

/**
 * The same item drawn again from a question's recorded origin (tests and audits):
 * the bank item, or the kept objective item, the question was made from.
 */
function redraw(trackId, gradeId, origin) {
  if (!origin) return null;
  if (origin.source === 'objective_item') {
    // eslint-disable-next-line global-require
    const objectiveItems = require('./objective-items');
    for (const list of objectiveItems.forGrade(trackId, gradeId).values()) {
      const found = list.find((q) => q.id === origin.objective_item);
      if (found) return found;
    }
    return null;
  }
  return bank.generate({ skillId: origin.skill, difficulty: origin.difficulty, school: origin.school === null ? undefined : origin.school, seed: origin.seed, stable: true });
}

// ── the engine for a level ────────────────────────────────────────────────
const gradeOrdinals = new Map();
/** level -> its position among the grade's game slots, so neighbouring games differ. */
function ordinalOf(grade, level) {
  const key = `${grade.trackId}/${grade.id}`;
  let map = gradeOrdinals.get(key);
  if (!map) {
    map = new Map();
    let n = 0;
    for (let l = 1; l <= grade.pathLength; l++) if (placedAt(grade, l)) map.set(l, n++);
    gradeOrdinals.set(key, map);
  }
  return map.has(level) ? map.get(level) : level;
}

function engineFor(grade, level, entry, questions) {
  const band = bandOf(grade);
  const { primary, skills } = levelSkills(grade, level, entry);
  const family = familyFor(grade.trackId, primary || skills[0]);
  const max = largestNumber(grade);
  const allWords = questions.length && questions.every((q) => /^[A-Za-z]{3,12}$/.test(q.choices[q.answerIndex]));
  const usable = (id) => installed().has(id) && (ENGINE_INFO[id].numbers || 0) <= max && (!ENGINE_INFO[id].words || allWords);
  if (grade.trackId === 'spanish') {
    const named = SPANISH_TITLES.find(([re]) => re.test(String(entry.title || '')));
    if (named && usable(named[1])) return named[1];
  }
  const pools = POOLS[band] || POOLS.standard;
  const pool = (pools[family] || pools.general).filter(usable);
  if (!pool.length) return null;
  return pool[ordinalOf(grade, level) % pool.length];
}

// ── the payload ────────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_MAX = 600;

function ageText(grade) {
  try {
    // eslint-disable-next-line global-require
    const lessonPrompt = require('../scripts/lib/lesson-prompt');
    const age = lessonPrompt.ageRangeForBand(grade.name.includes('—') ? grade.name.split('—')[1].trim() : grade.name);
    if (age && age.average !== null) return age.text;
  } catch { /* the band names no age */ }
  return 'All ages';
}

/**
 * Everything about one level's bank game, computed once: null when the rules
 * place no game here or the bank cannot fill one.
 *
 * @returns {{engineId: string, payload: object, family: string, slot: number|null}|null}
 */
function forLevel(trackId, gradeId, level) {
  const at = String(trackId);
  const of = String(gradeId);
  const on_ = Number(level);
  const key = `${at}/${of}/${on_}`;
  if (cache.has(key)) return cache.get(key);
  let result = null;
  const grade = TRACKS.has(at) ? curriculum.getGrade(at, of) : null;
  const placed = grade && Number.isInteger(on_) ? placedAt(grade, on_) : null;
  if (placed) {
    const questions = buildQuestions(at, of, on_);
    if (questions.length >= MIN_QUESTIONS) {
      const engineId = engineFor(grade, on_, placed.entry, questions);
      const schema = engineId ? schemaFor(engineId) : null;
      if (schema) result = { engineId, payload: envelope(grade, on_, placed.entry, engineId, questions), slot: placed.slot };
    }
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

function envelope(grade, level, entry, engineId, questions) {
  const track = curriculum.getTrack(grade.trackId);
  // Difficulty spread evenly through the set (game-payloads evenOrder), then the
  // keys rotated across the options in the order the set is played.
  // eslint-disable-next-line global-require
  const { evenOrder } = require('./game-payloads');
  const ordered = evenOrder(questions, `bank:${grade.trackId}:${grade.id}:${level}`);
  const levels = ordered.map((q) => q.difficulty);
  const topic = String(entry.title || '').replace(/^.*?:\s*/, '') || curriculum.skillName(ordered[0].skill);
  return {
    schemaVersion: 1,
    engineId,
    source: 'bank',
    meta: {
      subject: track ? track.name : grade.trackId,
      grade: grade.name,
      level,
      topic,
      title: activityName(entry.title) || topic,
      ageRange: ageText(grade),
    },
    settings: {
      questionCount: ordered.length,
      choicesPerTurn: 4,
      difficulty: { start: Math.min(...levels), end: Math.max(...levels), curve: 'flat' },
      timeLimitSec: null,
    },
    questions: ordered.map((q) => ({
      id: `b-${hash(`${q.prompt}\u0001${q.key}`)}`,
      prompt: q.prompt,
      choices: q.choices,
      answerIndex: q.answerIndex,
      explanation: q.explanation,
      difficulty: q.difficulty,
      skill: q.skill,
      topic: curriculum.skillName(q.skill) || q.skill,
      // Where the question came from, so its key can be checked against the bank.
      origin: q.origin,
    })),
    feedback: {
      correct: 'Correct.',
      incorrect: 'Not this time. Read why, then keep going.',
      win: 'You won the round!',
      lose: 'Round over. Play again to keep practising.',
      draw: 'Round finished.',
      outOfQuestions: 'You have seen every question; they come round again now.',
    },
  };
}

/**
 * The assignment config/game-assignments.js returns for this level, or null.
 * Only consulted while BANK_GAMES is on, for the tracks above.
 */
function assignment(trackId, gradeId, level) {
  if (!on() || !TRACKS.has(String(trackId))) return null;
  const found = forLevel(trackId, gradeId, level);
  return found ? { engineId: found.engineId, overrides: {}, source: 'bank' } : null;
}

/** Does the bank govern this track (so the engine cycle does not reach it)? */
function governs(trackId) {
  return on() && TRACKS.has(String(trackId));
}

/** The payload for a level whose assignment is a bank game, or null. */
function payloadFor(trackId, gradeId, level) {
  const found = on() ? forLevel(trackId, gradeId, level) : null;
  return found ? found.payload : null;
}

/**
 * Problems with a bank payload against its engine's contract, [] when it may be
 * played: the engine's question schema (public/games/schemas), the page's own
 * check (public/games/remade.js: four choices, an answer index 0-3), and the
 * shared game checks (game-payloads inspectPayload) on every question. One of
 * inspectPayload's rules is for model-written sets and is not applied: "no two
 * questions share an answer". It stops a model padding a set with one fact; a
 * computed number grade repeats its keys by nature (13 is the answer to several
 * different teen-number questions).
 */
function validate(payload) {
  const problems = [];
  if (!payload || typeof payload !== 'object') return ['no payload'];
  const schema = schemaFor(payload.engineId);
  if (!schema) return [`no schema for engine ${payload.engineId}`];
  if (!fs.existsSync(path.join(ENGINES_DIR, `${payload.engineId}.html`))) problems.push('the engine is not installed');
  const shape = schema.payloadShape || {};
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  if (payload.schemaVersion !== shape.schemaVersion) problems.push(`schemaVersion ${payload.schemaVersion}`);
  for (const k of shape.meta || []) if (payload.meta == null || payload.meta[k] === undefined || payload.meta[k] === '') problems.push(`meta.${k} missing`);
  for (const k of shape.feedback || []) if (!payload.feedback || !String(payload.feedback[k] || '').trim()) problems.push(`feedback.${k} missing`);
  const s = payload.settings || {};
  if (s.questionCount !== questions.length) problems.push(`settings.questionCount ${s.questionCount} for ${questions.length} questions`);
  if (questions.length < MIN_QUESTIONS || questions.length > schema.questionCount) problems.push(`${questions.length} questions (allowed ${MIN_QUESTIONS}-${schema.questionCount})`);
  if (s.choicesPerTurn !== (schema.choicesPerQuestion || 4)) problems.push(`choicesPerTurn ${s.choicesPerTurn}`);
  if (s.timeLimitSec !== null) problems.push('a time limit is set');
  const ids = new Set();
  questions.forEach((q, i) => {
    const n = `q${i + 1}`;
    if (!q || typeof q.id !== 'string' || !q.id || ids.has(q.id)) problems.push(`${n}: id missing or repeated`);
    else ids.add(q.id);
    // public/games/remade.js refuses the whole set unless every question has these.
    if (!q || typeof q.prompt !== 'string' || !Array.isArray(q.choices) || q.choices.length !== 4
      || !Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) problems.push(`${n}: not a four-choice question the page accepts`);
    for (const k of ['skill', 'topic', 'explanation']) if (!q || typeof q[k] !== 'string') problems.push(`${n}: ${k} missing`);
  });
  // The shared checks, one question at a time (so the cross-question rule above
  // cannot crowd out a real fault in inspectPayload's first twenty), then the
  // set's answer-slot balance, which is the one set-level rule kept.
  // eslint-disable-next-line global-require
  const { inspectPayload } = require('./game-payloads');
  questions.forEach((q, i) => {
    for (const p of inspectPayload({ questions: [q] }, { ...schema, questionCount: 1 })) problems.push(p.replace(/^q1:/, `q${i + 1}:`));
  });
  const slots = [0, 0, 0, 0];
  questions.forEach((q) => { if (q && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4) slots[q.answerIndex]++; });
  if (questions.length >= 6 && Math.max(...slots) / questions.length > 0.75) problems.push(`the answer sits in one slot ${Math.round((Math.max(...slots) / questions.length) * 100)}% of the time`);
  return problems;
}

/** Forget computed sets (tests, or after the bank changes in a running process). */
function reset() {
  cache.clear();
  gradeOrdinals.clear();
  engineCache = null;
}

module.exports = {
  on, governs, assignment, payloadFor, forLevel, placedAt, buildQuestions, toQuestion, numericOptions, redraw, validate,
  levelSkills, largestNumber, bandOf, familyFor, schemaFor, installed, reset, gameSlots, activityName,
  TRACKS, KNOWLEDGE_SKILLS, ENGINE_INFO, POOLS, MIN_QUESTIONS, MAX_QUESTIONS, PRODUCTION, OPEN,
};
