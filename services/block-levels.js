/**
 * Block levels: a lesson, a retention check or a checkpoint quiz, laid out and
 * written for one learner from the block library, in two calls.
 *
 *   1. LAYOUT   The learner (scorecard, survey, feedback, record), the level
 *               (subject, topic, its generalization, the lessons around it) and
 *               the library as one line per block. Back comes the plan: which
 *               blocks, in what order, what each one is for, and where the
 *               graded checks go. Small in, small out.
 *
 *   2. FILL     The same learner and level, the plan, and the schemas of only
 *               the blocks the plan chose. Back comes every block's data and
 *               every check question in one reply.
 *
 * That split is the token economy. One call per block would repeat the learner
 * and the level for every block; one call for a whole hand-written lesson would
 * write layout and markup the library already has. Here the learner and the
 * level are sent twice, the library's descriptions once, and only the chosen
 * schemas are ever shown.
 *
 * Nothing the model writes is trusted. Every block's data is checked against
 * the block's own schema (services/block-schema.js); the ones that fail are
 * sent back once in a single small repair call, and anything still failing is
 * dropped from the plan rather than shown broken. Check questions are graded on
 * the server: the page gets the question and never the answer.
 *
 * Model: the `blocks` role — GLM 5.3 Flash on OpenRouter, backed by MiMo V2.6
 * Pro (services/providers).
 *
 * Who gets what:
 *   - A tailored plan is written per learner, for an account on a plan that
 *     tailors levels (and the owner, so it can be tested).
 *   - Everyone else, and the 10% holdout, get the level's shared plan: written
 *     once per level with no learner in the prompt, and reused. The holdout is
 *     what lets tailoring be measured against something.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const subscriptions = require('../config/subscriptions');
const baseLessons = require('../config/base-lessons');
const gamePrompt = require('../scripts/lib/game-prompt');
const lessonPrompt = require('../scripts/lib/lesson-prompt');
const schemaCheck = require('./block-schema');
const chessChecks = require('./chess-checks');
const pianoChecks = require('./piano-checks');
const basketballChecks = require('./basketball-checks');
const factReader = require('./fact-check-anthropic');
const grading = require('./grading');

const ROOT = path.join(__dirname, '..');
const COLLECTION = 'block_plans';

/** How long a page request waits on a plan being written before saying "still writing". */
const WAIT_MS = Number(process.env.BLOCK_WAIT_MS || 8000);

// ── which levels are block levels ──────────────────────────────────────────
const CHECKPOINTS = new Set(['master', 'grand', 'graduation']);

/** A practice level whose job is retrieval: the sheet names them "(retention)". */
function isRetention(grade, level) {
  const entry = LAYOUT.entryFor(grade, level) || {};
  return /\(retention\)/i.test(String(entry.title || '')) || /^retention\b/i.test(String(entry.covers || ''));
}

/**
 * What kind of block level this is, or null when it is not one.
 *
 *   lesson      a taught level
 *   retention   a retrieval-practice level (the "(retention)" activities)
 *   checkpoint  a Master, Grand Master or Final quiz — tailored questions,
 *               delivered and graded by the ordinary session
 *
 * Game levels are their own pipeline (services/game-payloads.js), which uses
 * this file's learner context and the same two-call shape.
 */
function kindFor(grade, level) {
  if (!grade) return null;
  const kind = curriculum.levelKind(level, grade.pathLength, grade);
  if (kind === 'lesson') return 'lesson';
  if (curriculum.isEssayCheckpoint(grade, level)) return null;
  if (CHECKPOINTS.has(kind)) return 'checkpoint';
  if (kind === 'practice' && isRetention(grade, level)) return 'retention';
  return null;
}

// ── who sees them ──────────────────────────────────────────────────────────
// The one owner check (config/owner.js; OWNER_EMAIL overrides the address),
// re-exported here as blockLevels.isOwner / ownerEmail.
const { ownerEmail, isOwner } = require('../config/owner');

/**
 * May this account be served block levels?
 *
 * Every account by default: a standard learner reads the level's shared base
 * version, a learner on a tailoring plan reads their own. BLOCK_LEVELS=owner
 * narrows it back to the owner and BASE_LESSON_ACCOUNTS.
 */
function visibleTo(user) {
  if (!user) return false;
  if (String(process.env.BLOCK_LEVELS || '').toLowerCase() === 'owner') return baseLessons.canSeeBaseLessons(user);
  return true;
}

/**
 * Is this account's version written for them, rather than the level's shared one?
 *
 * Learners on a plan that tailors levels. The owner reads the shared base
 * versions — the ones standard learners see — unless BLOCK_TAILOR_OWNER=1.
 */
function tailorsFor(user) {
  if (!user) return false;
  if (isOwner(user)) return String(process.env.BLOCK_TAILOR_OWNER || '0') === '1';
  // eslint-disable-next-line global-require
  const learner = require('./learner');
  return subscriptions.canEditLevels(user, learner.getProfile(user.id));
}

/**
 * May a visit from this account cause a model to be called?
 *
 * A tailored learner's own levels are written for them, and the owner and the
 * BASE_LESSON_ACCOUNTS may have a missing base level written on the spot. A
 * standard learner is only ever served base levels that already exist — they are
 * written ahead by scripts/generate-base-levels.js — so no learner on the free
 * plan can run up model spend by walking the path. BLOCK_GENERATE=all lifts that.
 */
function mayGenerate(user) {
  if (!user) return false;
  if (String(process.env.BLOCK_GENERATE || '').toLowerCase() === 'all') return true;
  return tailorsFor(user) || isOwner(user) || baseLessons.canSeeBaseLessons(user);
}

function aiReady() {
  // eslint-disable-next-line global-require
  const providers = require('./providers');
  return !!providers.current('blocks');
}

// ── the library ────────────────────────────────────────────────────────────
const REGISTRIES = [
  { family: 'lessons', file: path.join(ROOT, 'public', 'engine', 'registry.json'), url: '/engine/' },
  { family: 'retention', file: path.join(ROOT, 'public', 'engine', 'retention', 'registry.json'), url: '/engine/retention/' },
];

/**
 * The server-graded checks. Written by hand (public/engine/checks/), not by
 * the block generator, because they are the one kind of block that must not
 * carry its own answer: the page asks the server whether an answer is right.
 */
const CHECK_BLOCKS = {
  Check_Choice: {
    tag: 'Check_Choice', name: 'Graded multiple choice', category: 'Check', family: 'checks',
    url: '/engine/checks/Check_Choice.js',
    schema: {
      type: 'object',
      required: ['id', 'prompt', 'choices'],
      properties: { id: { type: 'string' }, prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } } },
    },
  },
  Check_Typed: {
    tag: 'Check_Typed', name: 'Graded typed answer', category: 'Check', family: 'checks',
    url: '/engine/checks/Check_Typed.js',
    schema: { type: 'object', required: ['id', 'prompt'], properties: { id: { type: 'string' }, prompt: { type: 'string' } } },
  },
  // A move made on a chess board. The page sends the move; services/chess-checks.js
  // grades it in the check's position.
  Check_Board: {
    tag: 'Check_Board', name: 'Graded move on a chess board', category: 'Check', family: 'checks', tracks: ['chess'],
    url: '/engine/chess/chess-blocks.js',
    schema: { type: 'object', required: ['id', 'prompt', 'fen'], properties: { id: { type: 'string' }, prompt: { type: 'string' }, fen: { type: 'string' } } },
  },
  // Notes played on a keyboard (on screen, MIDI or microphone). services/piano-checks.js grades them.
  Check_Piano: {
    tag: 'Check_Piano', name: 'Graded notes played on a keyboard', category: 'Check', family: 'checks', tracks: ['piano'],
    url: '/engine/piano/piano-blocks.js',
    schema: { type: 'object', required: ['id', 'prompt', 'mode'], properties: { id: { type: 'string' }, prompt: { type: 'string' }, mode: { type: 'string' } } },
  },
  // A read made on an animated play. services/basketball-checks.js grades it.
  Check_Play: {
    tag: 'Check_Play', name: 'Graded read of a basketball play', category: 'Check', family: 'checks', tracks: ['basketball'],
    url: '/engine/basketball/basketball-blocks.js',
    schema: { type: 'object', required: ['id', 'prompt', 'frames', 'options'], properties: { id: { type: 'string' } } },
  },
};

/**
 * The chess blocks. Written by hand like the checks, because a position and its
 * moves must be legal, which services/chess-checks.js verifies after the schema
 * does. Offered only to chess levels (`tracks`).
 */
const SQUARE = '^[a-h][1-8]$';
const CHESS_BLOCKS = {
  Chess_Position: {
    tag: 'Chess_Position', name: 'Chess position', category: 'Foundational', family: 'lessons', tracks: ['chess'],
    interactive: true,
    description: 'A chessboard showing one position, with optional arrows and highlighted squares, a line of moves the learner steps through one at a time, and a short note.',
    bestFor: 'showing any position, pattern, plan or line of moves',
    url: '/engine/chess/chess-blocks.js',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fen', 'caption', 'note'],
      properties: {
        fen: { type: 'string', description: 'The position in FEN: legal, one king each, side to move given.' },
        caption: { type: 'string', description: 'A short title, e.g. "The Lucena position".' },
        orientation: { type: 'string', enum: ['white', 'black'], description: 'Which side is at the bottom; default the side to move.' },
        line: { type: 'array', maxItems: 16, items: { type: 'string' }, description: 'Moves in algebraic notation played from the position, each legal, e.g. ["Rf4", "Kd7"].' },
        highlights: { type: 'array', maxItems: 8, items: { type: 'string', pattern: SQUARE }, description: 'Squares to highlight, e.g. "f7".' },
        arrows: { type: 'array', maxItems: 4, items: { type: 'string', pattern: '^[a-h][1-8]-?[a-h][1-8]$' }, description: 'Arrows as from-to, e.g. "g1-f3".' },
        note: { type: 'string', description: 'One to three sentences on what to see and why it matters.' },
      },
    },
  },
  Chess_PlayOut: {
    tag: 'Chess_PlayOut', name: 'Play it out', category: 'Game', family: 'lessons', tracks: ['chess'],
    interactive: true,
    description: 'The learner plays a position to the finish against a practice bot of a set strength, with one goal: win, mate, capture, draw, promote or survive.',
    bestFor: 'applying the lesson in real play: converting, holding, attacking',
    url: '/engine/chess/chess-blocks.js',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fen', 'prompt', 'goal', 'strength'],
      properties: {
        fen: { type: 'string', description: 'The starting position in FEN; the learner plays the side to move.' },
        prompt: { type: 'string', description: 'One sentence setting the task, e.g. "Convert the extra rook."' },
        goal: { type: 'string', enum: ['win', 'mate', 'capture', 'draw', 'promote', 'survive'], description: 'win and mate both mean checkmating the bot within maxMoves; capture means taking every enemy piece and pawn except the king (for "collect the pawns" tasks); promote means making a queen or other piece; draw and survive mean not losing.' },
        strength: { type: 'integer', minimum: 1, maximum: 10, description: 'Bot strength: 1-3 beginner, 4-6 club, 7-10 strong.' },
        maxMoves: { type: 'integer', minimum: 1, maximum: 100, description: 'The learner\'s move limit.' },
        orientation: { type: 'string', enum: ['white', 'black'] },
      },
    },
  },
  Chess_Guided: {
    tag: 'Chess_Guided', name: 'Guided lesson on the board', category: 'Foundational', family: 'lessons', tracks: ['chess'],
    interactive: true,
    description: 'A lesson the learner plays move by move on one board: each step gives an instruction, the learner makes the move, the opponent replies automatically and a short explanation follows, with a hint ladder and a gentle reason for a wrong move.',
    bestFor: 'teaching a technique, plan or pattern by doing it: a worked example the learner plays themselves',
    url: '/engine/chess/chess-blocks.js',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'fen', 'steps'],
      properties: {
        title: { type: 'string', description: 'A short title, e.g. "The ladder mate".' },
        intro: { type: 'string', description: 'One or two sentences before the first move.' },
        fen: { type: 'string', description: 'The starting position in FEN; the learner plays the side to move in every step.' },
        orientation: { type: 'string', enum: ['white', 'black'] },
        steps: {
          type: 'array',
          minItems: 2,
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['instruction', 'moves', 'explain'],
            properties: {
              instruction: { type: 'string', description: 'What to do now, without naming the move, e.g. "Cut the king off on the seventh rank."' },
              moves: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' }, description: 'Every correct move in algebraic notation, the main one first, e.g. ["Ra7"]. Usually one.' },
              reply: { type: 'string', description: 'The opponent\'s answer, played automatically, e.g. "Kf8". Needed whenever another step follows; none after a mate.' },
              explain: { type: 'string', description: 'One or two sentences shown after the right move: why it works.' },
              hint: { type: 'string', description: 'A nudge in words for the first hint, without naming the move.' },
              fen: { type: 'string', description: 'Only to jump to a new position for this step; otherwise the step continues from the last.' },
            },
          },
        },
        outro: { type: 'string', description: 'One sentence to finish on.' },
      },
    },
  },
};

/**
 * The piano blocks: a keyboard to see and hear, a staff to read, a phrase to play
 * along with, and a phrase to play back by ear. Notes are written with their
 * octave ("C4" is middle C); services/piano-checks.js verifies them.
 */
const NOTE = '^[A-G](#|b|##|bb)?-?[0-8]$';
const PHRASE = {
  type: 'array', minItems: 1, maxItems: 24,
  items: {
    type: 'object', additionalProperties: false, required: ['note', 'beats'],
    properties: { note: { type: 'string', pattern: NOTE }, beats: { type: 'number', minimum: 0.25, maximum: 4 } },
  },
};
// A phrase to play may mark how loud each note is: graded loud against soft with a MIDI keyboard.
const PLAY_PHRASE = {
  type: 'array', minItems: 1, maxItems: 24,
  items: {
    type: 'object', additionalProperties: false, required: ['note', 'beats'],
    properties: {
      note: { type: 'string', pattern: NOTE },
      beats: { type: 'number', minimum: 0.25, maximum: 4 },
      dynamic: { type: 'string', enum: ['pp', 'p', 'mp', 'mf', 'f', 'ff'], description: 'How loud: only when the prompt asks for loud and soft (e.g. "loud like a lion, then quiet like a mouse"); mark every note then.' },
    },
  },
};
/**
 * The basketball blocks: an animated play to read, filming a set, a shot log and
 * a court session card. Plays are drawn from frames of positions in feet on a half
 * court (x 0-50 across, y 0-47 from the baseline, rim at 25, 5.25), checked by
 * services/basketball-checks.js. Drawn plays stand in for game video, which would
 * need licences.
 */
const FRAMES = {
  type: 'array', minItems: 2, maxItems: 8,
  description: 'Key moments of the play. Each: {"players": {"o1": [x, y], ..., "d1": [x, y], ...}, "ball": "o1"}. Offence ids start with o, defence with d; the same ids in every frame; x 0-50 across, y 0-47 from the baseline, rim at [25, 5.25].',
  items: {
    type: 'object', required: ['players'],
    properties: { players: { type: 'object' }, ball: { type: 'string' } },
  },
};
const OPTIONS = {
  type: 'array', minItems: 2, maxItems: 4,
  items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: { type: 'string' }, label: { type: 'string' } } },
};
const BASKETBALL_URL = '/engine/basketball/basketball-blocks.js';
const BASKETBALL_CAMERA_URL = '/engine/basketball/camera-blocks.js';
const BASKETBALL_BLOCKS = {
  Basketball_Play: {
    tag: 'Basketball_Play', name: 'Read the play', category: 'Game', family: 'lessons', tracks: ['basketball'], interactive: true,
    description: 'An animated play on a half court stops at the decision; the learner picks the read against a short clock, then sees why and how the play ends.',
    bestFor: 'decision-making: reads, help defence, pick-and-roll, shot selection',
    url: BASKETBALL_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['prompt', 'frames', 'options', 'answer', 'explanation'],
      properties: {
        prompt: { type: 'string' }, frames: FRAMES,
        pauseAt: { type: 'integer', minimum: 0, maximum: 7, description: 'Frame where the play stops for the decision; later frames show the outcome.' },
        options: OPTIONS, answer: { type: 'string', description: 'The id of the right option.' },
        explanation: { type: 'string', description: 'Why that read is right, naming the cue.' },
        seconds: { type: 'integer', minimum: 2, maximum: 30 },
      },
    },
  },
  Basketball_Film: {
    tag: 'Basketball_Film', name: 'Film it, rate it', category: 'Game', family: 'lessons', tracks: ['basketball'], interactive: true,
    description: 'The learner films a set of reps on their phone from a set camera spot, watches it back and rates it against a short rubric; the clip stays on the device.',
    bestFor: 'self-review of technique: shooting form, footwork, landing',
    url: BASKETBALL_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['prompt', 'protocol', 'seconds', 'cameraTip', 'rubric'],
      properties: {
        prompt: { type: 'string' },
        protocol: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' }, description: 'The set to film, step by step.' },
        seconds: { type: 'integer', minimum: 5, maximum: 120 },
        cameraTip: { type: 'string', description: 'Where to put the phone.' },
        rubric: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string' }, description: 'What to rate, in external-cue words.' },
      },
    },
  },
  Basketball_ShotLog: {
    tag: 'Basketball_ShotLog', name: 'Shot log', category: 'Game', family: 'lessons', tracks: ['basketball'], interactive: true,
    description: 'The learner taps where each shot was taken and whether it went in, and sees FG%, eFG% and where the points came from.',
    bestFor: 'shooting sets, shot selection, the learner\'s own numbers',
    url: BASKETBALL_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['prompt'],
      properties: { prompt: { type: 'string' }, shots: { type: 'integer', minimum: 5, maximum: 100 } },
    },
  },
  Basketball_Session: {
    tag: 'Basketball_Session', name: 'Court session', category: 'Game', family: 'lessons', tracks: ['basketball'], interactive: true,
    description: 'A court session card: a health check, the warm-up always first, timed drills with one cue each, then effort, pain and enjoyment, logged.',
    bestFor: 'every on-court practice in a lesson',
    url: BASKETBALL_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['title', 'drills'],
      properties: {
        title: { type: 'string' },
        warmup: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['name', 'seconds'], properties: { name: { type: 'string' }, seconds: { type: 'integer', minimum: 20, maximum: 300 } } } },
        drills: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['name', 'minutes', 'cue'], properties: { name: { type: 'string' }, minutes: { type: 'number', minimum: 1, maximum: 20 }, cue: { type: 'string' } } } },
      },
    },
  },
  // The camera tools: frames are read on the device and never uploaded; each has a no-camera way.
  Basketball_ShotTracker: {
    tag: 'Basketball_ShotTracker', name: 'Shot tracker (camera)', category: 'Game', family: 'lessons', tracks: ['basketball'], interactive: true,
    description: 'The phone, propped up, watches the rim: it counts makes and misses and places each shot from where the shooter stood, giving FG%, eFG% and zones marked estimated, which the learner corrects; without a camera the learner logs each shot by tapping the court.',
    bestFor: 'a shooting set of 10 or more shots on a real hoop, counted without stopping to log',
    url: BASKETBALL_CAMERA_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['prompt', 'shots'],
      properties: {
        prompt: { type: 'string', description: 'The set: which spots and how many shots. It records only made or missed and where.' },
        shots: { type: 'integer', minimum: 5, maximum: 100 },
        cameraTip: { type: 'string', description: 'Where to prop the phone, when the set needs a particular view.' },
      },
    },
  },
  Basketball_HandleDrill: {
    tag: 'Basketball_HandleDrill', name: 'Handle and react (camera)', category: 'Game', family: 'lessons', tracks: ['basketball'], interactive: true,
    description: 'A timed ball-handling reaction drill after a health check: targets light up and the player touches each with the free hand while dribbling, seen by the front camera or tapped on the screen, scored on hits and reaction time.',
    bestFor: 'ball handling with eyes up: dribbling while reacting to what they see',
    url: BASKETBALL_CAMERA_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['prompt'],
      properties: {
        prompt: { type: 'string' },
        rounds: { type: 'integer', minimum: 1, maximum: 5 },
        seconds: { type: 'integer', minimum: 15, maximum: 60, description: 'Length of each round.' },
        pace: { type: 'string', enum: ['steady', 'quick'], description: 'steady: each target waits 3 s; quick: 1.8 s.' },
        dribble: { type: 'string', enum: ['right', 'left', 'alternate', 'crossover'], description: 'Which hand dribbles.' },
        cue: { type: 'string', description: 'One external cue.' },
      },
    },
  },
};

const PIANO_URL = '/engine/piano/piano-blocks.js';
const PIANO_BLOCKS = {
  Piano_Keys: {
    tag: 'Piano_Keys', name: 'Piano keys', category: 'Foundational', family: 'lessons', tracks: ['piano'], interactive: true,
    description: 'A piano keyboard with notes, a chord or a scale lit up, and a button to hear them.',
    bestFor: 'showing where notes, chords and scales lie on the keys',
    url: PIANO_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['caption', 'notes', 'together'],
      properties: {
        caption: { type: 'string', description: 'A short title, e.g. "The C major chord".' },
        notes: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'string', pattern: NOTE }, description: 'Notes with octave, e.g. ["C4","E4","G4"].' },
        together: { type: 'boolean', description: 'True for a chord (sounded together), false for notes one by one.' },
        note: { type: 'string', description: 'One to three sentences on what to notice.' },
      },
    },
  },
  Piano_Staff: {
    tag: 'Piano_Staff', name: 'Notes on a staff', category: 'Foundational', family: 'lessons', tracks: ['piano'], interactive: true,
    description: 'A short phrase written on a treble or bass staff, which the learner can hear.',
    bestFor: 'reading notes and rhythms',
    url: PIANO_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['caption', 'clef', 'notes'],
      properties: {
        caption: { type: 'string' },
        clef: { type: 'string', enum: ['treble', 'bass'] },
        notes: PHRASE,
        tempo: { type: 'integer', minimum: 40, maximum: 160 },
        note: { type: 'string' },
      },
    },
  },
  Piano_PlayAlong: {
    tag: 'Piano_PlayAlong', name: 'Play along', category: 'Game', family: 'lessons', tracks: ['piano'], interactive: true,
    description: 'The learner plays a phrase on the keys: in wait mode the next key lights and the app waits; in tempo mode a count-in starts a timed take. They rate the take, then see notes, timing and evenness.',
    bestFor: 'practising a phrase, scale or piece section at the keyboard',
    url: PIANO_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['prompt', 'notes', 'tempo', 'mode'],
      properties: {
        prompt: { type: 'string' },
        notes: PLAY_PHRASE,
        tempo: { type: 'integer', minimum: 40, maximum: 160 },
        mode: { type: 'string', enum: ['wait', 'tempo'], description: 'wait for a guided first try, tempo for an independent take.' },
        pedal: { type: 'string', enum: ['legato'], description: 'Only for a pedalling exercise: the sustain pedal is changed with each new note (lifted as it sounds, pressed just after); graded with a MIDI keyboard.' },
      },
    },
  },
  Piano_EarEcho: {
    tag: 'Piano_EarEcho', name: 'Play it back by ear', category: 'Game', family: 'lessons', tracks: ['piano'], interactive: true,
    description: 'The learner hears a short phrase and plays it back by ear; the note names are revealed after.',
    bestFor: 'ear training and playing by ear',
    url: PIANO_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['prompt', 'notes', 'tempo'],
      properties: { prompt: { type: 'string' }, notes: PHRASE, tempo: { type: 'integer', minimum: 40, maximum: 160 } },
    },
  },
  Piano_Jam: {
    tag: 'Piano_Jam', name: 'Jam with the band', category: 'Game', family: 'lessons', tracks: ['piano'], interactive: true,
    description: 'The app plays a backing band (bass, chords, soft drums) in which every black key, or every white key, fits; the learner plays any of those keys freely over it and sees how many were on that kind of key and with the beat, never "wrong notes".',
    bestFor: 'improvising, jamming, "play any keys you like" over a groove',
    url: PIANO_URL,
    schema: {
      type: 'object', additionalProperties: false, required: ['prompt', 'keys'],
      properties: {
        prompt: { type: 'string', description: 'What to do over the band, e.g. "Play any black keys you like, one finger at a time, while the band plays."' },
        keys: { type: 'string', enum: ['black', 'white'], description: 'black: every black key fits (the band plays in F sharp); white: every white key fits (the band plays in D Dorian).' },
        tempo: { type: 'integer', minimum: 60, maximum: 120 },
        bars: { type: 'integer', minimum: 4, maximum: 16, description: 'How long the band plays, in bars of four beats.' },
        note: { type: 'string', description: 'One or two sentences to read after the jam.' },
      },
    },
  },
  // A song from content/piano-songs.js by id (the model never writes a library song's
  // notes), or a short song written in; services/piano-checks.js checks either.
  Piano_Song: {
    tag: 'Piano_Song', name: 'Play a song', category: 'Game', family: 'lessons', tracks: ['piano'], interactive: true,
    description: 'A song player: notes fall onto the keyboard (or scroll on a staff); learn mode waits for each note, play mode runs at tempo after a count-in with the app playing the other hand, at full, medium or slow speed; right hand, left hand or both; 0-3 stars at the end, kept on the learner\'s song path.',
    bestFor: 'playing a real song or piece from the song library, hands separately then together',
    url: '/engine/piano/piano-song.js',
    schema: {
      type: 'object', additionalProperties: false, required: ['prompt', 'song', 'hands', 'mode'],
      properties: {
        prompt: { type: 'string', description: 'One or two sentences: what to listen for or work on in this song.' },
        song: { type: 'string', enum: require('../content/piano-songs').ids(), description: 'A song from the library, by id. Never write a library song\'s notes.' },
        hands: { type: 'string', enum: ['right', 'left', 'both'], description: 'Which hand the learner plays first; the app plays the other.' },
        mode: { type: 'string', enum: ['learn', 'play'], description: 'learn waits at each note (first meetings); play runs in time (once the notes are known).' },
        pedal: { type: 'string', enum: ['legato'], description: 'Only in a level on pedalling, for a song with chords: play mode also grades the sustain pedal changed at each chord (MIDI keyboard).' },
      },
    },
  },
};

let libraryCache = null;
let libraryStamp = '';

/** Every block, by tag: { tag, name, category, description, bestFor, schema, family, url }. */
function library() {
  const stamp = REGISTRIES.map((r) => {
    try { return fs.statSync(r.file).mtimeMs; } catch { return 0; }
  }).join(':');
  if (libraryCache && stamp === libraryStamp) return libraryCache;
  const out = {};
  for (const reg of REGISTRIES) {
    let entries = {};
    try { entries = JSON.parse(fs.readFileSync(reg.file, 'utf8')); } catch { entries = {}; }
    for (const [tag, b] of Object.entries(entries)) {
      if (!b || !b.schema || !b.file) continue;
      out[tag] = {
        tag,
        name: b.name || tag,
        category: b.category || 'Foundational',
        description: String(b.description || ''),
        bestFor: b.bestFor || '',
        interactive: !!b.interactive,
        schema: b.schema,
        family: reg.family,
        url: reg.url + String(b.file).replace(/^\.\//, ''),
      };
    }
  }
  libraryCache = { ...out, ...CHECK_BLOCKS, ...CHESS_BLOCKS, ...PIANO_BLOCKS, ...BASKETBALL_BLOCKS };
  libraryStamp = stamp;
  return libraryCache;
}

/** Utility blocks that carry content; the rest of that group is buttons and chrome. */
const CONTENT_UTILITIES = new Set(['Tool_GlossaryModal', 'Tool_CaseWorkbench', 'Tool_FormulaSheet']);

/**
 * The blocks a layout may choose from, for one kind of level. A block made for
 * one subject (a chessboard) is offered only on that subject's track, where it
 * also counts for retention: retrieving a position is done on the board.
 */
function catalogFor(kind, trackId) {
  const lib = library();
  const all = Object.values(lib).filter((b) => b.family !== 'checks' && (!b.tracks || b.tracks.includes(trackId)));
  if (kind === 'retention') {
    return all.filter((b) => b.family === 'retention' || b.category === 'Assessment' || b.tracks);
  }
  return all.filter((b) => b.family === 'lessons'
    && (['Foundational', 'Assessment', 'Game'].includes(b.category) || CONTENT_UTILITIES.has(b.tag)));
}

/** One short line per block: the whole library costs a couple of thousand tokens. */
function catalogLine(b) {
  let d = b.description.replace(/\s+/g, ' ').trim();
  const stop = d.search(/[.;:](\s|$)/);
  if (stop > 30) d = d.slice(0, stop);
  if (d.length > 120) d = `${d.slice(0, 117)}...`;
  return `${b.tag} [${b.category}] ${d}${b.bestFor ? ` (best for: ${b.bestFor})` : ''}`;
}

// ── the level, as text ─────────────────────────────────────────────────────
/** The lesson levels between the last checkpoint (or summary) before `level` and `level`, oldest first. */
function lessonsSinceCheckpoint(grade, level, { stopAtSummary = false } = {}) {
  const out = [];
  for (let at = level - 1; at >= 1; at--) {
    const kind = curriculum.levelKind(at, grade.pathLength, grade);
    const entry = LAYOUT.entryFor(grade, at) || {};
    if (curriculum.isCheckpoint(kind)) break;
    if (kind === 'lesson') {
      if (stopAtSummary && /summary/i.test(String(entry.type || ''))) break;
      if (!/summary/i.test(String(entry.type || ''))) out.unshift(at);
    }
  }
  return out;
}

/**
 * What a lesson level actually taught, in a line: the coverage list of its
 * shared plan when one has been written (the points the lesson was laid out to
 * cover), otherwise the sheet's own words. Retention levels and tests are built
 * on this, so they test what was taught rather than what the title suggests.
 */
function taughtLine(trackId, gradeId, grade, at) {
  const entry = LAYOUT.entryFor(grade, at) || {};
  const plan = findPlan({ userId: null, trackId, gradeId, level: at });
  const points = plan && Array.isArray(plan.coverage) && plan.coverage.length
    ? plan.coverage.join('; ')
    : (entry.covers || '');
  return `level ${at} "${entry.title || `Level ${at}`}": ${String(points).slice(0, 600)}`;
}

/**
 * Subject, grade and the learner's age, the topic and its generalization, the
 * lessons around it, and — for a summary, a retention level or a test — what
 * the lessons it draws on actually taught.
 */
function levelContext(trackId, gradeId, level) {
  const grade = curriculum.getGrade(trackId, gradeId);
  const entry = LAYOUT.entryFor(grade, level) || {};
  const kind = curriculum.levelKind(level, grade.pathLength, grade);
  const band = String(grade.name).split('—').slice(1).join('—').trim() || grade.name;
  let age = lessonPrompt.ageRangeForBand(band);
  // A grade named for a stage rather than a school year (chess, piano, basketball)
  // says who it is for in its heading: "Grade 1: Board Explorer — never seen a
  // chessboard; age 4 and up". That is the learner the model writes for.
  if (age.average === null && /—/.test(String(grade.heading || ''))) {
    age = { ...age, text: `who it is for: ${String(grade.heading).split('—').slice(1).join('—').trim()}` };
  }
  const before = gamePrompt.previousLessons(trackId, gradeId, grade, kind === 'lesson' ? level : level + 1).slice(0, 2);
  const after = gamePrompt.futureLessons(trackId, gradeId, grade, level + 1).slice(0, 2);
  const plan = curriculum.levelPlan(grade, level);
  const skills = [...new Set([plan.focus, ...(plan.introduced || []).slice(-3)])].filter(Boolean);
  const lines = [
    `SUBJECT: ${lessonPrompt.subjectName(trackId)}`,
    `GRADE: ${grade.name} (${age.text}${age.average !== null ? `, average age ${age.average}` : ''}) — write for that age: vocabulary, examples and sentence length that ${age.average !== null ? `a typical ${age.average}-year-old` : 'the youngest learner it is for'} at this grade reads comfortably, without talking down`,
    `LEVEL: ${level} of ${grade.pathLength}, a ${entry.type || kind} level, difficulty ${Math.round(plan.difficulty)} of 10`,
    `TOPIC: ${entry.title || curriculum.skillName(plan.focus)}`,
    `TOPIC GENERALIZATION: ${entry.covers || '(not stated)'}`,
    `SKILLS (id: name): ${skills.map((s) => `${s}: ${curriculum.skillName(s)}`).join('; ')}`,
  ];
  if (before.length) lines.push(`PREVIOUS TOPICS (newest first): ${before.map((l) => `${l.title} — ${String(l.summary || '').slice(0, 140)}`).join(' | ')}`);
  if (after.length) lines.push(`FUTURE TOPICS: ${after.map((l) => l.title).join(' | ')}`);

  // What the lessons this level draws on taught.
  let drawsOn = [];
  if (kind === 'lesson' && /summary/i.test(String(entry.type || ''))) {
    drawsOn = lessonsSinceCheckpoint(grade, level, { stopAtSummary: true });
    if (drawsOn.length) lines.push('THIS IS A SUMMARY LESSON. It consolidates these lessons, and must touch every one:');
  } else if (kind === 'practice' && isRetention(grade, level)) {
    const lessons = lessonsSinceCheckpoint(grade, level);
    drawsOn = /mixed/i.test(String(entry.title || '')) ? lessons.slice(-3) : lessons.slice(-1);
    if (drawsOn.length) lines.push('WHAT WAS TAUGHT (retrieve this; the last line is the lesson this level is mainly about):');
  } else if (curriculum.isCheckpoint(kind) || curriculum.isEssayCheckpoint(grade, level)) {
    drawsOn = lessonsSinceCheckpoint(grade, level);
    if (drawsOn.length) lines.push('WHAT WAS TAUGHT SINCE THE LAST CHECKPOINT (the test covers all of it, in proportion):');
  }
  for (const at of drawsOn.slice(-8)) lines.push(`- ${taughtLine(trackId, gradeId, grade, at)}`);

  return { text: lines.join('\n'), skills, topic: entry.title || '', kind, difficulty: plan.difficulty, age, drawsOn, trackId };
}

// What a chess level adds to the two calls: the board blocks, the board check,
// and the rules a position has to meet. services/chess-checks.js holds the model
// to them afterwards.
const CHESS_LAYOUT_NOTE = `

CHESS: this level is chess and the learner has a real board. Show every position on Chess_Position (never describe a position in prose alone), and use Chess_PlayOut so the learner applies the idea in play. When the topic is a technique, plan or pattern that unfolds over a few moves (a mating net, a fork then the capture, cutting off a king, a piece's route), teach it with Chess_Guided right after the idea is shown: the learner makes each move, the opponent replies, a sentence explains. Prefer "board" checks, where the learner makes a move on the board and the server checks it, for every "find the move" question; use the other formats only for ideas that are not a single move.`;

const CHESS_FILL_NOTE = `

CHESS:
- Every position is a legal FEN: one king each, the side to move named, the side not to move not in check, no pawn on the first or last rank. Set it up square by square and check it.
- A "board" check has "fen" (the solver is the side to move), "prompt" (the task, e.g. "White to move: find checkmate in one."), "answer" = the one correct move in algebraic notation (e.g. "Qh7#") and "choices" empty. There must be exactly one clearly best move; if two moves are equally good, choose another position. "accepts" may list the same move written differently.
- A board check's key does exactly what its prompt asks: "capture" is answered by a capture, "give check" by a check, "as far as it can" by the farthest legal square on that line (a capture at the end of the line counts). The key never gives a piece away: a rook that takes a pawn the king guards is a wrong lesson, so pick a position where the right move is also safe (mate and sacrifice puzzles aside).
- Chess_Position "line" holds only legal moves from its position, White and Black alternating, each in algebraic notation ("Rd1", "Rxd5"). Chess_PlayOut "fen" gives the side to move a task it can achieve against a bot of the strength set, and its goal matches its prompt: "win" and "mate" mean checkmate, so a "collect the pawns" task uses "capture". Checkmating with a lone rook or less is not a beginner's task in a short move limit. A beginner's play-out has no hidden race: no enemy pawn one or two moves from promoting, no early check on the learner's king.
- Chess_Guided: 2-6 steps from one "fen"; the learner plays the side to move there in every step, so every step but the last has a "reply" (the opponent's best answer), and no reply follows a mate. Each step's "moves" are legal in the position reached and are every move that does the job (usually one; any mate counts when the step asks for mate). The "instruction" says what to achieve without naming the move, "hint" nudges, "explain" says why the move works.
- Every claim about the board is true, and the server checks the ones it can: an enemy piece in the way is captured, not a wall (the rook stops ON it by taking it, or anywhere before it; only its own pieces block it); "e4 to g6" is a diagonal and "b1 to c3" a knight's L; a list of squares and the number you give it agree (a1 to a7 is six squares: a2-a7); "up" means towards the far side for the player at the bottom.
- Every piece the text names on a square stands on that square in the block's or check's own position; count the squares a move goes (d1 to d5 is four).
- A task the learner can finish in one move is not split into a detour of several. A choice the prompt offers ("take the pawn that will not cost you the rook") is a real choice on that board.
- For young learners use plain words they know, and mnemonics with real, correctly spelled words that say something true. A diagram's own labels never give away the answer it asks for.`;

// What a piano level adds: the keyboard blocks, the played check, and how notes are written.
const PIANO_LAYOUT_NOTE = `

PIANO: this level is piano and the learner can play on the keys (on screen, a MIDI keyboard or a microphone). Show notes, chords and scales on Piano_Keys and reading on Piano_Staff (Piano_Staff only from First Reader on: Keyboard Explorer and Pre-Reader learners do not read the staff yet). Make the learner play: Piano_PlayAlong for a set phrase (wait mode for a first guided try, tempo mode for an independent take), Piano_EarEcho to play a heard phrase back, and Piano_Jam whenever the learner plays freely ("any black keys", improvising) over a backing band; only Piano_Jam plays a band. The song library has ${require('../content/piano-songs').titlesText()}. When the level plays one of these, use Piano_Song: it brings the song's right notes, a backing part and stars, where a melody written from memory is often wrong. Prefer "keys" checks, where the learner plays the answer and the server checks it, for anything played that has one right answer: a named key, a chord, a scale, a short line the prompt spells out. A check plays no sound, so a free jam or something heard is never a check.`;

const PIANO_FILL_NOTE = `

PIANO:
- Write every note with its octave: "C4" is middle C, then D4, E4 ... B4, C5. Sharps and flats as "F#3" or "Bb4". Spell notes as the key requires (F# in G major, not Gb).
- A "keys" check has "prompt" (what to play, e.g. "Play the D major triad."), "answer" = the notes in order separated by spaces (e.g. "D4 F#4 A4"), and "choices" empty. A chord is graded in any order and octave, a scale or phrase in order and any octave. Name the chord or scale in the prompt when there is one: the answer is checked against it.
- A keys check has exactly one right answer (up to octave), and the prompt says exactly what to play: never "any key", "a key from the group" or "your own". If the prompt counts notes, the answer has that many; if it says black keys or white keys, every answer note is one.
- A line of notes is graded in its order, so the prompt says the order ("from left to right", "lowest first", or the notes named in turn); if order does not matter, say "in any order".
- A check plays no sound and is not timed (it hears which keys, not when): never "echo", "what you heard", "over the groove", "with the band" or "on each beat".
- The black keys come in a group of two (C#, D#) and a group of three (F#, G#, A#). The group of two just above middle C is C#4 D#4; the group of three just above middle C is F#4 G#4 A#4.
- Piano_PlayAlong and Piano_EarEcho score every note against their "notes", so their prompts ask for exactly those notes, never "play anything you like". Free play over a backing band ("play any black keys you like") is Piano_Jam, the only block that plays a band; no other block's text mentions a band or a groove.
- Phrases ("notes") are lists of {note, beats}, playable by one hand at this grade (within five fingers up to First Reader). A phrase to echo by ear has at most 4 notes in Keyboard Explorer, 5 in Pre-Reader, 6 in First Reader, 8 up to Lower Intermediate; a play-along at most 8 notes in Keyboard Explorer and 12 in Pre-Reader.
- Keyboard Explorer and Pre-Reader learners may be four years old and do not read yet: in what they read, use short sentences and name keys by where they are ("the middle key of the group of three"), not "G#4"; octave numbers belong only in "notes" and "answer".
- Black keys run the whole length of the keyboard in groups of two and three, not only in the middle. Never invent a statistic.
- Piano_Song names a song from the library by its "song" id and never writes its notes. Pick one at or below this level's grade (Keyboard Explorer is grade 1, Pre-Reader 2, First Reader 3, Elementary 1 grade 4, Elementary 2 grade 5, Lower Intermediate 6): ${require('../content/piano-songs').catalogText()}. Start with "hands": "right" and "mode": "learn" for a first meeting; "both" only from First Reader on. A song not in the library is not played in Piano_Song.`;

// What a basketball level adds: plays to read, filming, the shot log and the court session.
const BASKETBALL_LAYOUT_NOTE = `

BASKETBALL: this level is basketball and most of the learning happens on a court. Every lesson with physical practice includes one Basketball_Session (the warm-up is built in and always first). Use Basketball_Play for reads and decisions, Basketball_Film to film and rate technique, and Basketball_ShotLog for short shooting sets; Basketball_ShotTracker in its place for a set of 10 or more shots on a real hoop (the phone counts makes and misses; the learner can still log by hand), and Basketball_HandleDrill for ball handling with eyes up. Prefer "play" checks, where the learner reads an animated play and the server checks the read, for decisions; use the other formats for rules and knowledge.`;

const BASKETBALL_FILL_NOTE = `

BASKETBALL:
- Ages by grade: Ball Explorer 3-6 (or an adult beginner), Mini Starter 6-8, Mini Player 8-10, Junior Club Player 10-12, Youth Team Player 12-14, Youth Advanced 14-16, Varsity 16-18, Elite Junior 17-19, Collegiate and above adults. Write, and choose drills, for that age.
- Court coordinates are feet on a half court: x 0-50 across, y 0-47 out from the baseline, the rim at (25, 5.25), the free-throw line at y 19, the three-point line 23.75 ft from the rim (22 ft in the corners). Every player stays inside it in every frame. Left is low x and right is high x, as the attacker facing the basket sees it.
- Spots: corners (2, 3) and (48, 3) (a corner three needs x 0-3 or 47-50 and y 0-14: x 6 is inside the arc); wings (7, 23) and (43, 23); top (25, 31); elbows (17, 19) and (33, 19); blocks (18, 7) and (32, 7); short corners (11, 4) and (39, 4). Spaced shooters stand behind the arc. A defender guarding someone stands 2-4 ft from them, on the rim side.
- A play is 2-8 frames; each frame gives every player's position ("o1".."o5" offence, "d1".."d5" defence, the same ids in every frame) and who has the ball. Move players a realistic distance between frames (a few feet to 15 feet). The play stops at "pauseAt", the decision moment; later frames show the outcome of the right read: a pass answer's next frame gives that player the ball. At the pause the right read's player is visibly open and the other options' players are covered. "You are o1" means o1 has the ball at the pause. Weak side is the half of the floor away from the ball. Every place, side and spot the words name matches the drawing.
- A "play" check has "prompt", "frames", "pauseAt", "options" (2-4 {id, label} reads such as {"id":"corner","label":"Pass to the corner"}), "answer" = the right option's id, and a rationale naming the cue that decides it. Exactly one read is clearly best. A check's play is new: never one a block of this level already showed. No check repeats a block's question in other words. A "type_in" check asks only for a number (points, a percentage, seconds) or a one-word term.
- Rules: name the body when they differ (FIBA, NBA, NCAA, NFHS), as of 2026. The pivot foot may be lifted to pass or shoot; lifting it before the dribble starts, putting it back down before the release, or sliding or dragging it is a travel. Fouling out: 6 fouls NBA and WNBA, 5 FIBA, NCAA and NFHS. Shot clock 24 s (NBA, WNBA, FIBA), 30 s NCAA. 8 s to cross half-way (NBA, WNBA, FIBA). FIBA has no defensive three seconds. A shooter fouled on a missed three gets three free throws.
- Basketball_Session: leave "warmup" out to use the built-in warm-up, or give at least 5 minutes that include jump-and-land practice. Bodyweight and bands only: no maximal loads, training to failure or running as punishment.
- Cues are external ("swish it over the front rim", "push the floor away"). Never claim basketball makes anyone taller or promises a scholarship or career.
- Players are "they", or named by role ("the helper", "the corner shooter", "o3"): learners of every gender play, so never "he" or "his man".
- Basketball_ShotLog and Basketball_ShotTracker record only where each shot was taken and whether it went in; the prompt asks for nothing else, and "shots" is the number of shots it asks for.
- Basketball_HandleDrill: the prompt names the dribble (which hand, low or high); rounds x seconds is at most 5 minutes; it counts touches and reaction times only.`;

const SUBJECT_NOTES = {
  chess: { layout: CHESS_LAYOUT_NOTE, fill: CHESS_FILL_NOTE },
  piano: { layout: PIANO_LAYOUT_NOTE, fill: PIANO_FILL_NOTE },
  basketball: { layout: BASKETBALL_LAYOUT_NOTE, fill: BASKETBALL_FILL_NOTE },
};
/** The extra instructions a subject with its own tools adds to a call ('layout' or 'fill'). */
const subjectNote = (trackId, which) => ((SUBJECT_NOTES[trackId] || {})[which] || '');

/**
 * The learner, as text. Tailored plans get the whole brief the level editor
 * uses (scorecard directives, the record's solid facts and struggles with their
 * hints, survey, feedback, mastery); a shared plan gets none, by design.
 */
function learnerText(userId, where, { tailored, experiment }) {
  if (!tailored || !userId) {
    return 'LEARNER: none. This is the shared version of the level, written for a typical learner at this grade. Teach it clearly and plainly.';
  }
  // eslint-disable-next-line global-require
  const details = require('./details');
  let text = details.brief(userId, where);
  // The learner's own goal for this grade (services/goals.js; nothing for the owner).
  // eslint-disable-next-line global-require
  const goalLines = require('./goals').promptLines(userId, where.trackId, where.gradeId);
  if (goalLines.length) text = `${text}\n${goalLines.join('\n')}`;
  // How this level should teach this learner (services/adaptation.js), only with
  // ADAPTIVE_TEACHING=on. It restates the objective word for word and changes
  // none of what the level covers.
  // eslint-disable-next-line global-require
  const adaptation = require('./adaptation');
  if (adaptation.mode() === 'on') {
    const enrollment = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === where.trackId && e.grade_id === where.gradeId);
    const lines = adaptation.promptLines(enrollment ? adaptation.planForLevel({ userId, enrollment, level: where.level }) : null);
    if (lines.length) text = `${text}\n${lines.join('\n')}`;
  }
  return experiment ? `${text}\nFOR THIS LEVEL SPECIFICALLY: ${experiment.text}` : text;
}

// ── storage ────────────────────────────────────────────────────────────────
/** The plan to serve: written, and, while the owner's key is set, verified (servable). */
function findPlan({ userId, trackId, gradeId, level, attempt = 1 }) {
  const plan = readyPlan({ userId, trackId, gradeId, level, attempt });
  return plan && servable(plan) ? plan : null;
}

/** A written plan, verified or not: one held for verification is found here and not by findPlan. */
function readyPlan({ userId, trackId, gradeId, level, attempt = 1 }) {
  return db.findOne(COLLECTION, (p) => (p.user_id || null) === (userId || null)
    && p.track_id === trackId && p.grade_id === gradeId && p.level === level
    && (p.attempt || 1) === attempt && p.status === 'ready') || null;
}

function anyRow({ userId, trackId, gradeId, level, attempt = 1 }) {
  return db.findOne(COLLECTION, (p) => (p.user_id || null) === (userId || null)
    && p.track_id === trackId && p.grade_id === gradeId && p.level === level
    && (p.attempt || 1) === attempt) || null;
}

// ── call 1: the layout ─────────────────────────────────────────────────────
const SHAPE = {
  lesson: { blocks: [4, 10], checks: [2, 5] },
  retention: { blocks: [3, 6], checks: [3, 6] },
};

const DEFAULT_LAYOUT = {
  lesson: ['Theory_RuleCard', 'Basic_TextBlock', 'Basic_Steps', 'Trap_CommonError', 'Memory_CheatSheet'],
  retention: ['Ret_UncuedReconstruct', 'Ret_MisconceptionTrap', 'Recall_FillTheBlank'],
};

const LAYOUT_SYSTEM = `You design the layout of one level of an adaptive tutoring app, for one learner, from a fixed library of interactive blocks. You choose blocks and their order; a second step writes their content.

Design for understanding and long-term retention, in this order of priority:
1. The level's topic is taught completely and correctly. The subject decides WHAT is taught; the learner decides HOW.
2. Use what the learner profile says: their ranked learning directives, solid facts from their record, the topics and question shapes they struggle with (plan a block that addresses each relevant struggle), their interests, and what they said about earlier levels. Strong directives outweigh weak ones. When the profile is empty, use a balanced, proven sequence.
3. Retention science: activate prior knowledge, teach in short chunks, make the learner retrieve and apply (not just read), confront the likely misconception, and end with a compact summary or memory anchor.
4. Spend the learner's time well: no block that repeats another's job.

For a LESSON: open with something that earns attention or connects to what they know, teach the core idea with at least one Foundational block, show it worked through, let them practise with at least one interactive block, then consolidate.
For a RETENTION level: it is retrieval practice on material already taught. Every block makes the learner produce or recognize from memory; nothing re-teaches at length. Target what the learner has struggled with.

Graded checks are separate from the blocks. Spread them across the coverage points, the most important and most commonly misunderstood first: they are questions the server grades, and their results drive the learner's progress and record. Place each one after the block it should follow ("after" is that block's 0-based index; -1 puts it before the first block). Choose its format and its focus.

Work in this order. First write "coverage": every point a learner must understand to have covered the WHOLE topic — read the TOPIC and the TOPIC GENERALIZATION closely and include each idea, rule, distinction, technique and common error they imply, at this grade (for a summary lesson, the key points of every listed lesson; for a retention level, the points to retrieve from what was taught). Then choose blocks so that every coverage point is taught (lesson) or retrieved (retention) by at least one block, and name the points each block handles in its purpose. Order the blocks for understanding first and retention second: prerequisite before dependent idea, concrete before abstract unless the learner profile says otherwise, practice right after the idea it practises, spaced retrieval of earlier points later in the level.

Only use block tags from the library list. A tag may appear at most twice. Reply only through the tool.`;

/** The check formats a track may use: a chess level can also ask for a move on the board. */
function checkFormats(trackId) {
  if (trackId === 'chess') return ['board', 'multiple_choice', 'type_in'];
  if (trackId === 'piano') return ['keys', 'multiple_choice', 'type_in'];
  if (trackId === 'basketball') return ['play', 'multiple_choice', 'type_in'];
  return ['multiple_choice', 'type_in'];
}

function layoutSchema(kind, tags, skills, formats = ['multiple_choice', 'type_in']) {
  const s = SHAPE[kind];
  return {
    type: 'object',
    additionalProperties: false,
    required: ['coverage', 'approach', 'blocks', 'checks'],
    properties: {
      coverage: {
        type: 'array',
        minItems: 3,
        maxItems: 12,
        items: { type: 'string' },
        description: 'Every point the whole topic requires, one short phrase each.',
      },
      approach: { type: 'string', description: 'Two sentences at most: why this layout suits this learner and this topic.' },
      blocks: {
        type: 'array',
        minItems: s.blocks[0],
        maxItems: s.blocks[1],
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['block', 'purpose'],
          properties: {
            block: { type: 'string', enum: tags },
            purpose: { type: 'string', description: 'One sentence: exactly what this block teaches or makes the learner do, for this topic and this learner.' },
          },
        },
      },
      checks: {
        type: 'array',
        minItems: s.checks[0],
        maxItems: s.checks[1],
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['skill_id', 'format', 'focus', 'after'],
          properties: {
            skill_id: { type: 'string', enum: skills },
            format: { type: 'string', enum: formats },
            focus: { type: 'string', description: 'What this question tests, in a phrase.' },
            after: { type: 'integer', description: 'Index of the block this check follows; -1 for before the first block.' },
          },
        },
      },
    },
  };
}

/** The layout, cleaned: unknown tags out, counts clamped, checks placed. */
function cleanLayout(raw, kind, catalog, skills, formats = ['multiple_choice', 'type_in']) {
  const allowed = new Set(catalog.map((b) => b.tag));
  const lib = library();
  const s = SHAPE[kind];
  const counts = {};
  const blocks = [];
  for (const entry of (raw && raw.blocks) || []) {
    const tag = String(entry && entry.block || '');
    if (!allowed.has(tag)) continue;
    counts[tag] = (counts[tag] || 0) + 1;
    if (counts[tag] > 2) continue;
    blocks.push({ block: tag, purpose: String(entry.purpose || '').trim().slice(0, 300) });
    if (blocks.length >= s.blocks[1]) break;
  }
  if (blocks.length < s.blocks[0]) return null;
  if (kind === 'lesson' && !blocks.some((b) => lib[b.block].category === 'Foundational')) return null;

  const checks = [];
  for (const c of (raw && raw.checks) || []) {
    const skill = skills.includes(c && c.skill_id) ? c.skill_id : skills[0];
    const format = c && formats.includes(c.format) ? c.format : 'multiple_choice';
    const after = Math.max(-1, Math.min(blocks.length - 1, Number.isInteger(c && c.after) ? c.after : blocks.length - 1));
    checks.push({ skill_id: skill, format, focus: String((c && c.focus) || '').trim().slice(0, 200), after });
    if (checks.length >= s.checks[1]) break;
  }
  while (checks.length < s.checks[0]) {
    checks.push({ skill_id: skills[checks.length % skills.length], format: 'multiple_choice', focus: 'the core idea of the level', after: blocks.length - 1 });
  }
  const coverage = ((raw && raw.coverage) || []).map((c) => String(c || '').trim().slice(0, 160)).filter(Boolean).slice(0, 12);
  return { approach: String((raw && raw.approach) || '').trim().slice(0, 400), coverage, blocks, checks };
}

/** The layout used when the model will not give one. Proven, plain, the same for everyone. */
function defaultLayout(kind, skills) {
  const s = SHAPE[kind];
  const blocks = DEFAULT_LAYOUT[kind]
    .filter((tag) => library()[tag])
    .map((tag) => ({ block: tag, purpose: '' }));
  const checks = [];
  for (let i = 0; i < s.checks[0] + 1; i++) {
    checks.push({ skill_id: skills[i % skills.length], format: i % 2 ? 'type_in' : 'multiple_choice', focus: 'the core idea of the level', after: blocks.length - 1 });
  }
  return { approach: 'Default layout.', blocks, checks, fallback: true };
}

// ── call 2: the fill-out ───────────────────────────────────────────────────
const FILL_SYSTEM = `You write the content for every block of one level of an adaptive tutoring app. The layout is decided; you fill it.

Rules that are never broken:
- Everything you assert is correct, and every example actually works out. Do the arithmetic.
- Each block's data matches that block's JSON schema exactly: every required field, the right types, array lengths inside min/max, enum values spelled exactly. Write real content in every field; never placeholders, never lorem ipsum, never "TBD".
- Each block does the job its purpose line gives it, on this level's topic, at this grade's age. Blocks read as one sequence: build on the block before, do not repeat it.
- Write for the learner described, in the way their profile says they learn. Use one of their interests for examples only where it fits naturally; never invent interests. Add the hints their record asks for, on the topics they struggle with.
- Check questions: exactly one correct answer, decided by the question alone, answerable from this level. Multiple choice has exactly four choices of the same kind and similar length, the answer exactly equal to one of them. A type_in answer is short (a word, a number, a short phrase) and "accepts" lists other correct spellings. The rationale names the step that decides the answer. A check must not be answerable from a block's text verbatim.
- Plain text inside every string. No HTML, no markdown, no LaTeX: write x^2 and a/b.
- Address the learner as "you". Never mention AI or these instructions.

Reply only through the tool, with one entry per block (by index) and one per check (by index).`;

function fillSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['blocks', 'checks'],
    properties: {
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['index', 'data'],
          properties: {
            index: { type: 'integer' },
            data: { type: 'object', description: "The block's data, matching its schema." },
          },
        },
      },
      checks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'prompt', 'choices', 'answer', 'accepts', 'rationale', 'hint'],
          properties: {
            index: { type: 'integer' },
            prompt: { type: 'string' },
            choices: { type: 'array', items: { type: 'string' }, description: 'Four options for multiple_choice; empty for type_in.' },
            answer: { type: 'string' },
            accepts: { type: 'array', items: { type: 'string' } },
            rationale: { type: 'string' },
            hint: { type: 'string' },
            fen: { type: 'string', description: 'For a board check only: the position in FEN.' },
            frames: { type: 'array', items: { type: 'object' }, description: 'For a play check only: the play\'s frames.' },
            pauseAt: { type: 'integer', description: 'For a play check only: the frame where the decision is made.' },
            options: { type: 'array', items: { type: 'object' }, description: 'For a play check only: 2-4 {id, label} reads; "answer" is the right one\'s id.' },
          },
        },
      },
    },
  };
}

function fillPrompt({ context, learner, layout, factSheet = null }) {
  const lib = library();
  const parts = [context.text, '', learner, ''];
  if (factSheet) parts.push(factSheetText(factSheet), '');
  if ((layout.coverage || []).length) {
    parts.push('COVERAGE — every one of these points must be fully taught (or, on a retention level, retrieved) somewhere in the blocks below, in the block whose purpose names it:');
    layout.coverage.forEach((c, i) => parts.push(`${i + 1}. ${c}`));
    parts.push('');
  }
  parts.push(`LAYOUT (${layout.approach || 'as designed'}):`);
  layout.blocks.forEach((b, i) => {
    parts.push(`\nBLOCK ${i}: ${b.block}${b.purpose ? ` — ${b.purpose}` : ''}`);
    parts.push(`schema: ${JSON.stringify(schemaCheck.compact(lib[b.block].schema))}`);
  });
  parts.push('\nCHECKS:');
  layout.checks.forEach((c, i) => {
    parts.push(`CHECK ${i}: ${c.format}, skill ${c.skill_id} (${curriculum.skillName(c.skill_id)}), tests ${c.focus || 'the core idea'}`);
  });
  parts.push('\nWrite every block and every check now.');
  return parts.join('\n');
}

/** A check question, or null when it is not usable. Same bar as every other authored item. */
/**
 * A multiple-choice answer as the model wrote it, matched to the exact text of
 * one of its choices: "B", "b)", "B) the second one", or the choice with
 * different capitals, spacing or end punctuation. Unchanged if nothing matches.
 * A bare number is not read: "1" could mean the first choice or the second,
 * and a wrong answer key is worse than a dropped question.
 */
function alignAnswer(answer, choices) {
  const list = (choices || []).map((c) => String(c));
  const a = String(answer == null ? '' : answer).trim();
  if (!list.length || list.includes(a)) return a;
  const norm = (t) => String(t).toLowerCase().replace(/^[\s(]*[a-d][).:]\s+/i, '').replace(/[\s.!?;:'"“”‘’]+$/g, '').replace(/\s+/g, ' ').trim();
  const letter = a.match(/^\(?([a-d])\)?[).:]?$/i);
  if (letter) return list['abcd'.indexOf(letter[1].toLowerCase())] ?? a;
  const prefixed = a.match(/^\(?([a-d])[).:]\s+(.*)$/i);
  if (prefixed && list['abcd'.indexOf(prefixed[1].toLowerCase())]) {
    const byLetter = list['abcd'.indexOf(prefixed[1].toLowerCase())];
    if (norm(byLetter) === norm(prefixed[2])) return byLetter;
  }
  const same = list.filter((c) => norm(c) === norm(a));
  return same.length === 1 ? same[0] : a;
}

/** A choice written as an object, or as a JSON string of one, or null. */
function choiceObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* plain text that starts with a brace */ }
  }
  return null;
}

/** The words of a choice object: its text, label or value. */
function choiceText(o) {
  return String(o.text ?? o.label ?? o.value ?? o.answer ?? '').trim();
}

function cleanCheck(raw, spec, difficulty) {
  // eslint-disable-next-line global-require
  const ai = require('./ai');
  if (spec.format === 'board' || spec.format === 'keys' || spec.format === 'play') {
    // A move on a board, or notes to play: legal and consistent with the question,
    // or dropped (services/chess-checks.js, services/piano-checks.js).
    const fixed = raw && typeof raw === 'object' ? { ...raw, accepts: readList(raw.accepts) } : raw;
    const board = spec.format === 'board' ? chessChecks.cleanBoardCheck(fixed)
      : spec.format === 'keys' ? pianoChecks.cleanKeysCheck(fixed) : basketballChecks.cleanPlayCheck(fixed, spec.skill_id);
    if (!board) return null;
    return {
      ...board,
      skill_id: spec.skill_id,
      skill_name: curriculum.skillName(spec.skill_id),
      difficulty: Math.max(1, Math.min(10, Math.round(difficulty || 5))),
      source: 'ai',
    };
  }
  if (raw && typeof raw === 'object') {
    // Lists inside a check may arrive as JSON strings too.
    raw = { ...raw, choices: readList(raw.choices), accepts: readList(raw.accepts) };
    // Choices may come as objects ({id, text}), or as JSON strings of them, with
    // the answer naming one by id: a learner sees the text, never the object.
    const asObjects = raw.choices.map(choiceObject);
    if (asObjects.some(Boolean)) {
      const given = choiceObject(raw.answer) || { id: String(raw.answer == null ? '' : raw.answer).trim() };
      const byId = asObjects.find((o) => o && o.id != null && String(o.id) === String(given.id));
      raw.choices = raw.choices.map((c, i) => (asObjects[i] ? choiceText(asObjects[i]) : String(c)));
      raw.answer = byId ? choiceText(byId) : (choiceObject(raw.answer) ? choiceText(given) : raw.answer);
    }
    if (raw.choices.length) raw.answer = alignAnswer(raw.answer, raw.choices);
    // A multiple-choice slot written without choices is a typed question with a
    // short answer: kept as one rather than thrown away.
    if (spec.format === 'multiple_choice' && !raw.choices.length && String(raw.answer || '').length <= 40) {
      spec = { ...spec, format: 'type_in' };
    }
  }
  const item = ai.validateItem({ ...raw, format: spec.format }, spec.skill_id, Math.round(difficulty || 5));
  if (!item) return null;
  // A basketball question's words: players are "they", and no false rules claim.
  if (/^bb_/.test(String(spec.skill_id || '')) && basketballChecks.checkTextProblems(item, spec.skill_id).length) return null;
  // A chess question's own claims about squares and pieces must be true (services/chess-checks.js).
  if (/^chess_/.test(String(spec.skill_id || '')) && chessChecks.proseCheckProblem(item)) return null;
  return item;
}

/** Why a check was refused, in a few words, for the record of what was dropped. */
function whyRefused(raw, spec) {
  if (!raw || typeof raw !== 'object') return 'not written';
  const prompt = String(raw.prompt || '').trim();
  const answer = String(raw.answer || '').trim();
  const choices = readList(raw.choices).map((c) => String(c).trim()).filter(Boolean);
  if (prompt.length < 4) return 'no question';
  if (!answer) return 'no answer';
  if (String(raw.rationale || '').trim().length < 10) return 'no rationale';
  if (spec.format === 'board') return `board: ${chessChecks.boardCheckProblem(raw) || 'refused'}`;
  if (spec.format === 'keys') return `keys: ${pianoChecks.whyRefused(raw)}`;
  // Every problem with a play at once (the drawing, the options, the words), so one repair can fix them all.
  if (spec.format === 'play') return `play: ${basketballChecks.playCheckProblems(raw, spec.skill_id).join('; ') || 'refused'}`;
  // A basketball question's words: refused for a gendered pronoun or a false rules claim.
  const words = /^bb_/.test(String(spec.skill_id || '')) ? basketballChecks.checkTextProblems(raw, spec.skill_id) : [];
  if (words.length) return words.join('; ');
  const chessClaim = /^chess_/.test(String(spec.skill_id || '')) ? chessChecks.proseCheckProblem(raw) : '';
  if (chessClaim) return `chess: ${chessClaim}`;
  if (spec.format === 'multiple_choice') {
    if (new Set(choices).size !== 4) return `${new Set(choices).size} distinct choices, not 4`;
    if (!choices.includes(answer)) return 'answer is not one of the choices';
    if (prompt.toLowerCase().includes(answer.toLowerCase()) && answer.length > 6) return 'the answer is written in the question';
  }
  return 'refused by the item check';
}

/**
 * The model pool's data class for a level write (services/pool.js). A shared level
 * (no owner) is written from the course plan alone ("LEARNER: none", learnerText), so
 * it carries no learner data and may also use the pipeline-class slots that
 * config/model-lineup.json "pool.tasks" lists for the task (none run in the app server
 * unless the owner opts in with STANDARD_COMPUTE_PIPELINE=1 / XKIRO_PIPELINE=1). A
 * tailored level carries the learner's brief and stays on the app chain's learner-class
 * slots; there is no automatic stripping of a brief (the pool refuses instead).
 */
function poolClass(owner) {
  return owner ? 'learner' : 'pipeline';
}

/**
 * Write only a level's graded checks: for a fill-out that came back with its
 * blocks and without them. The same level and learner, and the same check plan.
 */
async function writeChecksOnly({ context, learner, layout, userId }) {
  // eslint-disable-next-line global-require
  const ai = require('./ai');
  const lines = layout.checks.map((c, i) => `CHECK ${i}: ${c.format}, skill ${c.skill_id} (${curriculum.skillName(c.skill_id)}), tests ${c.focus || 'the core idea'}`);
  const schema = fillSchema();
  return ai.structuredDetail({
    role: 'blocks',
    task: 'block_fill',
    system: FILL_SYSTEM.replace('You write the content for every block of one level', 'You write the graded check questions for one level') + subjectNote(context.trackId, 'fill'),
    user: [context.text, '', learner, '',
      (layout.coverage || []).length ? `COVERAGE OF THE LEVEL: ${layout.coverage.join('; ')}` : '',
      'CHECKS:', ...lines, '', 'Write every check now. Reply with "checks" only.'].join('\n'),
    schema: { type: 'object', required: ['checks'], properties: { checks: schema.properties.checks } },
    schemaName: 'submit_checks',
    maxTokens: 12000,
    userId,
    dataClass: poolClass(userId),
    lane: process.env.BLOCK_LANE || 'background',
  });
}

// ── repair ─────────────────────────────────────────────────────────────────
const REPAIR_SYSTEM = `You fix block data for one level of a tutoring app that failed its schema check. For each block you get its purpose in the level, its schema, the data that was written, and the exact problems. Return corrected data for every block listed, matching its schema exactly.

- Where data was written, keep its content and intent and fix only the problems.
- Where no usable data was written, write the block's content from scratch, for the level's TOPIC and the block's purpose, at the grade's age.
- The content is always about the level's topic. The schema's field descriptions mention example subjects (physics, rhetoric, algebra...) only to show the shape of a field: never use those subjects, examples or wording.
- Everything you assert is correct. Plain text only. Reply only through the tool.`;

/**
 * Who writes a repair: GLM by default, at the effort asked; or, with
 * writer "strong", Claude on the owner's key (the fact verifier's stubborn
 * cases: GLM's own repairs failed twice). Same answer shape either way.
 */
/**
 * One NVIDIA-only structured call through the model pool (services/pool.js): the same NVIDIA models as
 * nvidia.structured, but each is its own slot with a hard timeout (config "pool.tasks.<task>.timeout_ms") and a slow one is
 * hedged onto the next NVIDIA model, so a stuck call no longer sits through nvidia.js's four tries. Resolves like
 * nvidia.structured ({ data, usage, model }) or null; never Claude, never a non-NVIDIA slot (AI_POOL=0: the old call).
 */
async function nvidiaPooled(args) {
  // eslint-disable-next-line global-require
  const nvidia = require('./providers/nvidia');
  if (String(process.env.AI_POOL || '1') === '0') return nvidia.structured(args).catch(() => null);
  // eslint-disable-next-line global-require
  return require('./pool').callHedged({ kind: 'structured', ...args, outside: true }, { chain: [nvidia], extras: false, validate: (r) => !!(r && r.data) }).catch(() => null);
}

async function repairCall({ system, user, schema, schemaName, maxTokens, userId, effort = null, writer = 'glm' }) {
  if (writer === 'free' || writer === 'mimo') {
    // The free hard tier on NVIDIA build (GLM 5.3 / DeepSeek V4.1 Flash at max
    // reasoning, config/model-lineup.json task fact_repair), which replaced MiMo pro
    // (owner, 2026-10-22: they match it). When it cannot answer, Claude writes it.
    // eslint-disable-next-line global-require
    const nvidia = require('./providers/nvidia');
    const reply = nvidia.isConfigured()
      ? await nvidiaPooled({ role: 'blocks', task: 'fact_repair', system, user, schema, schemaName, maxTokens, effort, lane: 'background' })
      : null;
    if (reply && reply.data) return reply;
    if (keyReady()) writer = 'strong'; else return null;
  }
  if (writer === 'strong' && keyReady()) {
    const reply = await factReader.ask({ system, user, schema, schemaName, maxTokens, maxSearches: 0, effort: 'medium', modelName: process.env.FACT_REPAIR_MODEL || 'claude-sonnet-5-5' });
    return reply ? { data: reply.data, usage: reply.usage, cost: reply.cost, model: reply.model } : null;
  }
  // eslint-disable-next-line global-require
  const ai = require('./ai');
  return ai.structuredDetail({ role: 'blocks', task: 'fact_repair', system, user, schema, schemaName, maxTokens, userId, effort, lane: process.env.BLOCK_LANE || 'background' });
}

async function repairBlocks(broken, { userId, context = null, coverage = [], effort = null, writer = 'glm' }) {
  const lib = library();
  const head = [];
  if (context) head.push(context.text);
  if (coverage.length) head.push(`COVERAGE OF THE LEVEL: ${coverage.join('; ')}`);
  const user = [...head, ...broken.map((b) => [
    `BLOCK ${b.index}: ${b.block}${b.purpose ? ` — purpose: ${b.purpose}` : ''}`,
    `schema: ${JSON.stringify(schemaCheck.compact(lib[b.block].schema))}`,
    `data: ${b.data ? JSON.stringify(b.data).slice(0, 6000) : '(none usable was written: write it from scratch)'}`,
    `problems: ${b.problems.join('; ')}`,
  ].join('\n'))].join('\n\n');
  return repairCall({
    system: REPAIR_SYSTEM,
    user,
    schema: {
      type: 'object',
      required: ['blocks'],
      properties: { blocks: { type: 'array', items: { type: 'object', required: ['index', 'data'], properties: { index: { type: 'integer' }, data: { type: 'object' } } } } },
    },
    schemaName: 'submit_fixed_blocks',
    maxTokens: 16000,
    userId,
    effort,
    writer,
  });
}

const CHECK_REPAIR_SYSTEM = `You fix graded check questions for one level of a tutoring app that the server refused. For each check you get its format, what it tests, what was written, and why it was refused. Return a corrected check for every one listed.

- Keep the question's intent where it was sound and fix exactly what was refused; where nothing usable was written, write the check from scratch for the level's TOPIC.
- The answer key must be the one right answer to the prompt as written, and the rationale explains why in one or two sentences.
- Everything you assert is correct. Plain text only. Reply only through the tool.`;

/** One call that sends refused checks back with the reason for each. */
async function repairChecks(broken, { userId, context = null, coverage = [], effort = null, writer = 'glm' }) {
  const head = [];
  if (context) head.push(context.text);
  if (coverage.length) head.push(`COVERAGE OF THE LEVEL: ${coverage.join('; ')}`);
  const user = [...head, ...broken.map((c) => [
    `CHECK ${c.index}: ${c.spec.format}, skill ${c.spec.skill_id} (${curriculum.skillName(c.spec.skill_id)}), tests ${c.spec.focus || 'the core idea'}`,
    `written: ${c.raw ? JSON.stringify(c.raw).slice(0, 4000) : '(nothing usable: write it from scratch)'}`,
    `refused because: ${c.reason || whyRefused(c.raw, c.spec)}`,
  ].join('\n'))].join('\n\n');
  return repairCall({
    system: CHECK_REPAIR_SYSTEM + (context ? subjectNote(context.trackId, 'fill') : ''),
    user,
    schema: { type: 'object', required: ['checks'], properties: { checks: fillSchema().properties.checks } },
    schemaName: 'submit_fixed_checks',
    maxTokens: 12000,
    userId,
    effort,
    writer,
  });
}

// ── making a level factual ─────────────────────────────────────────────────
// The code checks above see what can be computed (a legal move, a chord's notes, a
// play that can be drawn). They cannot see a false sentence: "e4 to g6 bends",
// "the black keys live in the middle". So, with the owner's Anthropic key set:
//   1. before the writing, Claude researches the level's facts on the web, with
//      sources, and GLM writes from that sheet;
//   2. after the writing, Claude lists every claim in the level and verifies each
//      one, searching for anything specific, and cites what it relied on;
//   3. whatever is false, unsupported or an opinion stated as fact goes back to
//      GLM with the correction, and is verified again; what still fails is dropped;
//   4. a level is served only once it is verified (findPlan, gateOn).
// The owner's rule (docs/PRODUCT-DECISIONS.md): everything a learner reads is
// factual wherever facts exist; opinion, contested findings and theory are
// allowed only when the text says that is what they are.

const RESEARCH_SYSTEM = `You research the facts for one lesson of an education app, before it is written. The writer will use your fact sheet as the source of truth for every factual statement in the lesson, so it must be correct.

- Cover the lesson's topic and every coverage point listed: the facts, rules, definitions, figures, dates and names a teacher needs to teach it correctly at this grade.
- Search the web for anything specific (a figure, date, name, rule, record, statistic, or anything you are not certain of) and give the source you relied on. Prefer primary and authoritative sources: governing bodies' rulebooks, standards bodies, textbooks, encyclopedias, peer-reviewed or official pages. Settled basics you are certain of need no search.
- Mark each fact's kind: "established" (settled), "contested" (experts disagree or research is mixed), "opinion" (a matter of taste or style), "theoretical" (not yet established). The writer may only present an established fact as plain fact.
- List the common misconceptions about this topic, so the writer avoids them.
- Write each fact as one short plain sentence, and copy word for word the sentence from the source page that states it (source_quote): the lesson is checked against these quotes. A settled basic with no page needs no quote.`;

const RESEARCH_SCHEMA = {
  type: 'object',
  required: ['facts', 'misconceptions'],
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fact', 'kind'],
        properties: {
          fact: { type: 'string' },
          kind: { type: 'string', enum: ['established', 'contested', 'opinion', 'theoretical'] },
          source_url: { type: 'string', description: 'The page relied on; empty for a settled basic.' },
          source_quote: { type: 'string', description: 'The sentence from that page that states the fact, copied word for word.' },
        },
      },
    },
    misconceptions: { type: 'array', items: { type: 'string' } },
  },
};

const VERIFY_SYSTEM = `You are the fact verifier for an education app. Nothing reaches a learner until you pass it, so you catch every error. You get the level's subject, grade, the learner it is for and its topic, then every block and graded check as JSON.

Work claim by claim:
1. List EVERY claim the level makes, block by block and check by check, in order: each sentence that states something about the world or the subject, each example ("e4 to g6 is a diagonal"), each number, each "why", each answer key and its explanation, each wrong option's feedback. Skipping a claim is how an error reaches a child.
2. Give each its kind: "fact"; "opinion" (taste or style); "contested" (experts disagree, or research is mixed or thin); "theoretical" (not yet established); "instruction" (what the learner should do, such as a drill or a step).
3. Verify each one:
   - A fact you are certain of as settled basic knowledge: verify it from knowledge, working it out yourself (do the arithmetic, place the pieces, count the keys, read the rule). Never trust the writer's explanation.
   - A specific figure, date, name, rule, record, statistic, study, or anything you are less than certain of: search the web and cite the source you relied on. Prefer primary and authoritative sources.
   - An opinion, contested or theoretical claim passes only if the text says that is what it is ("many coaches prefer", "research is mixed", "one theory is"); stated as plain fact it is "unlabelled".
   - An instruction passes if it is safe and doable for this learner at this age.
   - A graded check passes only if its marked answer is the one right answer to the question as written, and every other option is wrong.
   - Parts of the level must agree with each other (a diagram's labels and its questions, a block and a check).
4. Verdict for each: "verified"; "false" (say what is true, with a source); "unsupported" (no reliable source and you are not certain: it must be removed or reworded); "unlabelled" (an opinion, contested point or theory stated as fact; give the honest wording).

Where: "block 3" or "check 1", numbered as given. Quote each claim exactly.`;

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['claims'],
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        required: ['where', 'claim', 'kind', 'verdict'],
        properties: {
          where: { type: 'string' },
          claim: { type: 'string' },
          kind: { type: 'string', enum: ['fact', 'opinion', 'contested', 'theoretical', 'instruction'] },
          verdict: { type: 'string', enum: ['verified', 'false', 'unsupported', 'unlabelled'] },
          evidence: { type: 'string', enum: ['knowledge', 'search', 'fact_sheet', 'computed'] },
          source_url: { type: 'string' },
          truth: { type: 'string', description: 'For any verdict but verified: what is true, or the honest wording.' },
        },
      },
    },
  },
};

// What a verifier must work out for itself in each subject with its own tools.
const FACT_NOTES = {
  chess: `

CHESS: set every position up square by square before judging it. An enemy piece in a rook's, bishop's or queen's path can be captured (the piece stops on it); only its own side's pieces block it. A move along one diagonal is a straight line, not a bend or a corner; a rook cannot reach a square that is not on its rank or file. Count squares moved as the squares after the start (a1 to a7 is six). A board check's key must be the one clearly best move and must not give a piece away. A play-out must be winnable by this learner against its bot.`,
  piano: `

PIANO: work out every note yourself. The black keys come in groups of two (C# D#) and three (F# G# A#), repeating across the whole keyboard, low to high. Middle C is C4. Finger numbers: thumb 1 to little finger 5, on both hands. A block's notes must be exactly the notes its words describe, and a named song's notes must be its real melody.`,
  basketball: `

BASKETBALL: place every player from the frames before judging a play: x 0-50 across, y out from the baseline, the rim at (25, 5.25). Judge rules against current FIBA and NBA rules: the pivot foot may be lifted to pass or shoot if the ball leaves the hands before that foot returns to the floor; sliding or dragging the pivot foot is a travel. Compute every statistic (FG% = made / attempted; eFG% = (made + 0.5 x threes made) / attempted). Players are "they".`,
};

/** "block 3", "Block #3", "check 1 (option b)" → 3 or 1, for the word given; else null. */
function placeOf(where, word) {
  const m = new RegExp(`${word}\\s*#?\\s*(\\d+)`, 'i').exec(String(where || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Is the cascade the verifier? Only when FACT_PIPELINE=cascade. Measured on
 * 2026-10-21 on three lessons with 50 known errors, the first cascade confirmed
 * about 18 (Sonnet reading every claim: 50): most claims in a freely written
 * lesson are about its own examples, which no source sentence covers, so the
 * local checkers could settle few of them. Sonnet stays the default until the
 * cascade measures at least as well.
 */
function cascadeOn() {
  return keyReady() && String(process.env.FACT_PIPELINE || '').toLowerCase() === 'cascade';
}

/**
 * Is thorough mode on? The default with the owner's key working (FACT_PIPELINE=
 * sonnet is one full Sonnet read; =cascade the cheaper, weaker cascade). Sonnet
 * reads every claim with the free checks' flags as hints, and after the repairs
 * reads the whole level again from scratch, until a full read finds nothing (three
 * full reads at most). Measured on 2026-10-21 on the three original test lessons:
 * an independent Claude Opus 5.5 audit afterwards found 1, 0 and 0 problems left
 * (Sonnet alone had let through errors a second read caught), at $0.47-1.86 a lesson.
 */
function thoroughOn() {
  const pipeline = String(process.env.FACT_PIPELINE || '').toLowerCase();
  return keyReady() && pipeline !== 'sonnet' && pipeline !== 'cascade';
}

/**
 * Is the free-first layout on (FACT_PIPELINE=freefirst)? The owner's design
 * (2026-10-21): the free and flat-rate models do the work, Sonnet only confirms.
 *   fast checks   the free NVIDIA lineup (services/fact-cascade.js)
 *   full reads    the NVIDIA hard tier (task fact_verify), until one is clean
 *   repairs       the NVIDIA hard tier (task fact_repair) twice, then Sonnet
 *   final gate    one Sonnet full read; what it finds is repaired and the whole
 *                 level read by Sonnet again
 * (2026-10-22: MiMo, which did these reads before, is out of the lineup; GLM 5.3 /
 * DeepSeek V4.1 Flash at max reasoning replace it.) When the free tier cannot
 * answer, Sonnet takes over its reads.
 */
function freeFirstOn() {
  // eslint-disable-next-line global-require
  return thoroughOn() && require('./providers/nvidia').isConfigured() && String(process.env.FACT_PIPELINE || '').toLowerCase() === 'freefirst';
}

/** Is the owner's key set? Then a level is served only once it is verified. BLOCK_FACT_GATE=0 lifts that. */
function gateOn() {
  return factReader.isConfigured() && String(process.env.BLOCK_FACT_GATE || '') !== '0';
}

/**
 * The self-check (evidence article 01, P10; LEVEL_SELF_CHECK, default on since
 * 2026-10-25). With no verifier key at all, an AI level used to be served
 * unverified. Now it is served only once an independent self-check has passed:
 *   1. the claim-by-claim read on the app's own route (verifyAndRepair, no web
 *      search), with repairs, as BLOCK_FACT_CHECK=1 always did;
 *   2. a blind re-solve of every multiple-choice check by a judge of another
 *      model family that is never shown the key (services/key-gate.js
 *      blindResolve): a check it answers differently is dropped, and a check
 *      no judge could answer fails the self-check (no keep on no evidence).
 * A level that has not passed is not served: the learner gets the bank lesson
 * (the ordinary session) instead. Not asked when the key is set (the full gate
 * applies) or when BLOCK_FACT_GATE=0 lifts the gate on purpose.
 * LEVEL_SELF_CHECK=off restores the old behaviour (served unverified).
 * A safety rule, so it applies to the owner too (config/owner.js).
 */
function selfCheckOn() {
  return !factReader.isConfigured() && String(process.env.LEVEL_SELF_CHECK || 'on').toLowerCase() !== 'off';
}

/** Does a write run the self-check? With no key (selfCheckOn), and on the write-ahead's free tier with the key set. */
function selfCheckRun() {
  return selfCheckOn() || freeTier();
}

/**
 * The check a plan written (or re-checked) now carries: 'sonnet' under the key's
 * gate, 'free' on the free tier or with no key (the self-check). Older rows have
 * none, and are judged by the gate's rule as before.
 */
function checkTierNow() {
  if (freeTier()) return 'free';
  if (gateOn()) return 'sonnet';
  return selfCheckOn() ? 'free' : null;
}

/**
 * May this plan be served? Under the gate, only one that passed the key's check;
 * with no key, only a self-checked one. With the write-ahead on (WRITE_AHEAD), a
 * level that has passed the free check (the self-check below) is served under
 * the gate too, while its Sonnet check runs in the background (sonnetPending).
 * Nothing unchecked is ever served.
 */
function servable(plan) {
  if (gateOn()) {
    if (!plan) return false;
    if (sonnetChecked(plan)) return true;
    return writeAheadOn() && selfCheckPassed(plan);
  }
  if (selfCheckOn()) return !!(plan && (selfCheckPassed(plan) || verifiedByKey(plan)));
  return true;
}

/** Verified under the owner's key (Claude read every claim, with search): the strongest check, servable without the key too. */
function verifiedByKey(plan) {
  const v = plan && plan.verification;
  return !!(v && v.status === 'verified' && plan.check_tier !== 'free' && /claude|sonnet|opus|haiku/i.test(String(v.model || '')));
}

// ── check tiers (the write-ahead, WRITE_AHEAD; owner, 2026-10-25) ──────────
// With the owner's key set, a level is checked one of two ways:
//   sonnet  the key's full check (research, Sonnet reads every claim), as before;
//   free    the self-check below, run even though the key is set: the claim read
//           on the app's own route and the blind re-solve (key-gate.blindResolve).
//           Nothing is sent to the key. The plan is marked check_tier 'free' and
//           its Sonnet check runs later (upgrade), before or while it is opened.
// The tier is carried by an AsyncLocalStorage store around the write, so every
// step the write takes (verifyLevel, the repairs, the research) reads it.
const { AsyncLocalStorage } = require('async_hooks');

const tierStore = new AsyncLocalStorage();

/** Is the write-ahead on? WRITE_AHEAD=off restores the behaviour before it (prefetchAhead, Sonnet on every write). */
function writeAheadOn() {
  return String(process.env.WRITE_AHEAD || 'on').toLowerCase() !== 'off';
}

/** Is the work running now on the free tier (no call to the owner's key)? */
function freeTier() {
  const s = tierStore.getStore();
  return !!(s && s.tier === 'free');
}

/** Is the owner's key ready for this work: set, with the SDK, and not on the free tier? */
function keyReady() {
  return factReader.isReady() && !freeTier();
}

/** Run fn on a check tier ('free' or 'sonnet'). */
function onTier(tier, fn) {
  return tierStore.run({ tier }, fn);
}

/**
 * Can a Sonnet check be paid for now? The ledger (services/anthropic-ledger.js)
 * stops at $24: past that, or with too little headroom for one level's check,
 * the next level gets the free check too. Quality is kept; only speed suffers.
 */
function sonnetAffordable() {
  if (!factReader.isReady()) return false;
  try {
    // eslint-disable-next-line global-require
    return require('./anthropic-ledger').canSpend(Number(process.env.WRITE_AHEAD_SONNET_RESERVE_USD || 0.5));
  } catch {
    return false;
  }
}

function selfCheckPassed(plan) {
  return !!(plan && plan.self_check && plan.self_check.status === 'passed');
}

/** Has this plan passed the key's check (the gate's own rule, before the write-ahead)? A free-tier claim read does not count. */
function sonnetChecked(plan) {
  return !!(plan && plan.verification && plan.verification.status === 'verified' && plan.check_tier !== 'free');
}

/** Served on its free check under the gate, with the Sonnet check still to run. */
function sonnetPending(plan) {
  return !!(plan && plan.status === 'ready' && gateOn() && writeAheadOn() && !sonnetChecked(plan) && selfCheckPassed(plan));
}

/**
 * Is the verification step run when a level is written? With the owner's key,
 * always (unless BLOCK_FACT_GATE=0). Without the key it runs as part of the
 * self-check (selfCheckOn), on the app's own route and without web search; GLM
 * caught 2 of 13 known errors when measured, which is why the blind re-solve is
 * added to it. BLOCK_FACT_CHECK=1 runs it whatever the rest says (tests).
 */
function verifyOn() {
  return gateOn() || selfCheckOn() || String(process.env.BLOCK_FACT_CHECK || '') === '1';
}

/**
 * The blind re-solve half of the self-check, on a level's checks (changed in
 * place: a check the judge answers differently becomes null). Returns the record
 * kept on the plan, with `dropped` [{index, why}] for the plan's dropped checks.
 */
async function selfCheck({ items, verification }) {
  // eslint-disable-next-line global-require
  const keyGate = require('./key-gate');
  const mc = items.map((it, i) => ({ it, i })).filter((x) => x.it && x.it.format === 'multiple_choice' && Array.isArray(x.it.choices) && x.it.choices.length);
  const results = mc.length ? await keyGate.blindResolve(mc.map((x) => ({ prompt: x.it.prompt, choices: x.it.choices, answer: x.it.answer }))) : [];
  const dropped = [];
  let agreed = 0;
  let unjudged = 0;
  results.forEach((r, n) => {
    if (r.verdict === 'agreed') agreed++;
    else if (r.verdict === 'unjudged') unjudged++;
    else {
      const index = mc[n].i;
      items[index] = null;
      dropped.push({ index, why: `self-check: a blind re-solve picked option ${r.picked + 1}, not the key` });
    }
  });
  const read = verification && verification.status === 'verified';
  const left = items.filter(Boolean).length;
  return {
    status: read && !unjudged && left > 0 ? 'passed' : 'failed',
    method: 'claim read on the app route + blind re-solve of every multiple-choice check',
    claim_read: verification ? verification.status : 'not run',
    mc_checked: mc.length,
    mc_agreed: agreed,
    mc_dropped: dropped.length,
    mc_unjudged: unjudged,
    checked_at: new Date().toISOString(),
    dropped,
  };
}

/** The self-check as the plan keeps it (its dropped checks are listed with the plan's own). */
function selfCheckRecord(result) {
  const { dropped, ...record } = result;
  return record;
}

/** A fact sheet, as the text the writer is given. */
function factSheetText(sheet) {
  const lines = ['FACT SHEET — researched and sourced for this level. Every factual statement you write must agree with it; anything it does not cover must be settled basic knowledge you are certain of. Present only "established" facts as plain fact; say what a contested, opinion or theoretical point is ("research is mixed", "many players prefer").'];
  (sheet.facts || []).forEach((f, i) => lines.push(`${i + 1}. [${f.kind}] ${f.fact}${f.source_url ? ` (${f.source_url})` : ''}`));
  if ((sheet.misconceptions || []).length) {
    lines.push('Common misconceptions to avoid (never state them as true):');
    sheet.misconceptions.forEach((m) => lines.push(`- ${m}`));
  }
  return lines.join('\n');
}

let warnedFactFailure = false;
function warnFactFailure(what, err) {
  // A bad key or no credit: said once, never the key itself. Levels wait, unserved,
  // until verification works (the owner's rule: nothing unverified is shown).
  if (warnedFactFailure) return;
  warnedFactFailure = true;
  console.warn(`facts: the Anthropic ${what} call failed (${err.status || ''} ${String(err.message || err).slice(0, 200)}); new levels are held unverified, and not served, until it works. Check with: node scripts/check-fact-key.js`);
}

/** The level's facts, researched with sources before it is written; null when that could not be done. */
async function researchFacts({ context, coverage = [], maxFacts = 25, maxSearches = 6 }) {
  if (!keyReady()) return null;
  try {
    const reply = await factReader.ask({
      system: RESEARCH_SYSTEM + (FACT_NOTES[context.trackId] || ''),
      user: `${context.text}\n\n${coverage.length ? `COVERAGE POINTS:\n${coverage.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n` : ''}Research the facts for this lesson now: at most ${maxFacts} facts.`,
      schema: RESEARCH_SCHEMA,
      schemaName: 'submit_fact_sheet',
      maxTokens: 16000,
      maxSearches,
      effort: 'medium',
    });
    if (!reply || !reply.data) return null;
    const facts = readList(reply.data.facts).filter((f) => f && typeof f === 'object' && String(f.fact || '').trim())
      .slice(0, maxFacts).map((f) => ({ fact: String(f.fact).slice(0, 400), kind: f.kind || 'established', source_url: String(f.source_url || '').slice(0, 400), source_quote: String(f.source_quote || '').slice(0, 800) }));
    const misconceptions = readList(reply.data.misconceptions).map((m) => String(m).slice(0, 300)).filter(Boolean).slice(0, 12);
    return { facts, misconceptions, sources: reply.sources, searches: reply.searches, cost: reply.cost, usage: reply.usage, model: reply.model };
  } catch (err) {
    warnFactFailure('research', err);
    return null;
  }
}

/** The verify call's user text, for some or all of a level's blocks and checks. */
function verifyPrompt({ context, blocks, checks, factSheet }) {
  const body = [
    ...blocks.map((b) => `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`),
    ...checks.map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify({
      prompt: c.prompt, fen: c.fen, frames: c.frames, options: c.options, choices: c.choices, answer: c.answer, rationale: c.rationale,
    })}`),
  ].join('\n');
  return [context.text, '', factSheet ? `${factSheetText(factSheet)}\n` : '', body, '', 'Verify every claim now.'].join('\n');
}

/** A verification reply read: every claim, and the reasons against one block or check. */
function readVerification(data) {
  const claims = readList(data && data.claims).map((e) => (typeof e === 'string' ? readData(e) : e))
    .filter((e) => e && typeof e === 'object' && String(e.claim || '').trim())
    .map((e) => ({
      where: String(e.where || '').slice(0, 60),
      claim: String(e.claim).slice(0, 400),
      kind: String(e.kind || 'fact'),
      verdict: ['verified', 'false', 'unsupported', 'unlabelled'].includes(e.verdict) ? e.verdict : 'unsupported',
      evidence: String(e.evidence || ''),
      source_url: String(e.source_url || '').slice(0, 400),
      truth: String(e.truth || '').slice(0, 400),
    }));
  const failed = claims.filter((c) => c.verdict !== 'verified');
  const reasons = (word, i) => failed.filter((c) => placeOf(c.where, word) === i)
    .map((c) => `${c.verdict}: "${c.claim}" → ${c.truth || 'remove it or say honestly what is known'}${c.source_url ? ` (source: ${c.source_url})` : ''}`);
  return { claims, failed, blocks: (i) => reasons('block', i), checks: (i) => reasons('check', i) };
}

/**
 * One verification read of some of a level. With the owner's key: Claude, with web
 * search. Without it (BLOCK_FACT_CHECK=1, tests): the app's GLM route, no search.
 * Returns { claims, failed, blocks(i), checks(i), usage, cost, sources, model } or null.
 */
/** The verification request (system, user, schema), for the verifier and for measuring others. */
function verifyRequest({ context, blocks, checks, factSheet = null }) {
  return { system: VERIFY_SYSTEM + (FACT_NOTES[context.trackId] || ''), user: verifyPrompt({ context, blocks, checks, factSheet }), schema: VERIFY_SCHEMA };
}

async function verifyLevel({ context, blocks, checks, factSheet = null, userId = null, where = null, reader = null }) {
  // The cascade (services/fact-cascade.js): cheap and local checks on everything,
  // Sonnet only on what they flag. Opt-in (FACT_PIPELINE=cascade); see cascadeOn.
  if (where && cascadeOn()) {
    // eslint-disable-next-line global-require
    return require('./fact-cascade').cascadeVerify({ context, blocks, checks, factSheet, ...where });
  }
  const { system, user: plain } = verifyRequest({ context, blocks, checks, factSheet });
  let user = plain;
  // Thorough mode: the free checks run first, and Sonnet rules on what they flagged
  // as well as reading every claim itself (services/fact-cascade.js hintFlags).
  let hints = null;
  if (where && thoroughOn()) {
    // eslint-disable-next-line global-require
    hints = await require('./fact-cascade').hintFlags({ context, blocks, checks, factSheet, ...where }).catch((err) => { console.warn(`facts: the free checks failed (${err.message})`); return null; });
    if (hints && hints.flags.length) {
      const list = hints.flags.map((f, i) => `HINT ${i} [${f.where}] (${f.by}) "${f.claim}" — ${f.why}`).join('\n');
      user += `\n\nCHEAPER CHECKERS FLAGGED THESE (they raise false alarms too). List each one among your claims with your own verdict, and still check every other claim yourself:\n${list}`;
    }
  }
  if (reader === 'free' || reader === 'mimo') {
    // The free hard tier on NVIDIA build (task fact_verify): no web search, no
    // charge per call. Written for MiMo V2.6 Pro, which it replaced (2026-10-22):
    // It reads one block per request, with thinking: a whole level with thinking
    // outran the plan endpoint's ~8-minute cut-off, and without thinking it
    // flagged nothing (measured 2026-10-21: per block it caught 5 of chess's 13
    // known errors, with no false alarms).
    // eslint-disable-next-line global-require
    const nvidia = require('./providers/nvidia');
    const parts = [...blocks.map((b) => `BLOCK ${b.index}`), ...(checks.length ? ['the CHECKs'] : [])];
    const replies = [];
    let next = 0;
    let failedParts = 0;
    await Promise.all(Array.from({ length: Math.min(3, parts.length) }, async () => {
      while (next < parts.length) {
        const part = parts[next++];
        const one = `${user}

This time list and verify ONLY the claims in ${part} (use the rest of the level only as context). Wrong quiz options are meant to be wrong: judge their feedback, not that they are wrong.`;
        // An unreadable answer (cut off, or malformed) is asked for again, twice at most.
        let r = null;
        for (let attempt = 0; attempt < 3 && !(r && r.data); attempt++) {
          // eslint-disable-next-line no-await-in-loop
          r = await nvidiaPooled({ role: 'blocks', task: 'fact_verify', system, user: one, schema: VERIFY_SCHEMA, schemaName: 'submit_verification', maxTokens: 32000, lane: 'background' });
        }
        if (r && r.data) replies.push(r); else failedParts++;
      }
    }));
    // A part MiMo could not read (or the plan capped out): this read does not count.
    if (failedParts) { console.warn(`facts: MiMo could not read ${failedParts} of ${parts.length} parts`); return null; }
    const claims = replies.flatMap((r) => readVerification(r.data).claims);
    const usage = replies.reduce((u, r) => ({ input_tokens: u.input_tokens + ((r.usage && r.usage.input_tokens) || 0), output_tokens: u.output_tokens + ((r.usage && r.usage.output_tokens) || 0) }), { input_tokens: 0, output_tokens: 0 });
    return {
      ...readVerification({ claims }), usage, cost: (hints && hints.cost) || 0, sources: [], searches: 0,
      model: `${(replies[0] && replies[0].model) || 'free'}${hints ? ' + hints' : ''}`, stages: hints ? { hints: hints.flags.length, ...hints.stages } : undefined,
    };
  }
  if (keyReady()) {
    try {
      const reply = await factReader.ask({ system, user, schema: VERIFY_SCHEMA, schemaName: 'submit_verification', maxTokens: 32000, maxSearches: 10, effort: 'high' });
      if (!reply || !reply.data) return null;
      return {
        ...readVerification(reply.data), usage: reply.usage, cost: (reply.cost || 0) + ((hints && hints.cost) || 0), sources: reply.sources, searches: reply.searches,
        model: hints ? `${reply.model} + hints` : reply.model, stages: hints ? { hints: hints.flags.length, ...hints.stages } : undefined,
      };
    } catch (err) {
      warnFactFailure('verification', err);
      return null;
    }
  }
  // The key is set but its call cannot run: no read. On the free tier (the
  // write-ahead's free check) the claim read goes to the app's own route instead.
  if (factReader.isConfigured() && !freeTier()) return null;
  // eslint-disable-next-line global-require
  const ai = require('./ai');
  const reply = await ai.structuredDetail({
    role: 'blocks', task: 'fact_verify', system, user, schema: VERIFY_SCHEMA, schemaName: 'submit_verification', maxTokens: 16000, userId, lane: process.env.BLOCK_LANE || 'background',
  });
  if (!reply || !reply.data) return null;
  return { ...readVerification(reply.data), usage: reply.usage, cost: null, sources: [], searches: 0, model: reply.model || null };
}

/**
 * Verify a level and repair what fails, until it passes.
 *
 * blocks: the level's blocks ({ index, block, purpose, data, problems }); a block
 * with problems is already out. items: the checks by index (null = out); specs:
 * each check's layout spec. Both are changed in place: a repaired block or check
 * replaces the old one, one that cannot be made true is taken out (a block gets
 * problems, a check becomes null and its reason goes in dropReasons).
 *
 * Round 0 reads the whole level; each later round reads only what was repaired.
 * Two repair rounds at most; what is still flagged after them is dropped.
 */
async function verifyAndRepair({ context, blocks, items, specs, validateBlock, owner = null, factSheet = null, coverage = [], where = null }) {
  // Two repairs by GLM (at high effort: a careless repair brings new errors), then,
  // with the owner's key, a third by Claude for what GLM could not fix. Taking a
  // part out is the last resort: measured on 2026-10-21, a basketball level lost
  // 7 of its 9 blocks when GLM's repairs kept failing and nothing stronger stepped in.
  const STRONG_REPAIR = keyReady();
  const MAX_REPAIRS = STRONG_REPAIR ? 3 : 2;
  const usages = [];
  let cost = 0;
  let model = null;
  let searches = 0;
  const claims = [];
  const sources = new Map();
  const outcome = { blocks_fixed: [], blocks_dropped: [], checks_fixed: [], checks_dropped: [] };
  const dropReasons = new Map();
  const stageLog = [];
  let complete = true;
  let rounds = 0;
  const live = () => ({
    blocks: blocks.filter((b) => !b.problems.length),
    checks: items.map((c, i) => (c ? { ...c, index: i } : null)).filter(Boolean),
  });
  let toRead = live();
  // Thorough mode reads the whole level again after its repairs, until a full read
  // finds nothing: a repair can bring a new error, and a fresh read sees what the
  // first missed. Otherwise one full read, then only the repaired parts.
  // Who reads each full pass. Free-first: MiMo until a full read is clean (three at
  // most), then Sonnet confirms (two at most); a MiMo read that fails hands over to
  // Sonnet. Thorough: Sonnet, three at most. Otherwise one read by the default reader.
  const freeFirst = !!where && freeFirstOn();
  const readers = freeFirst ? ['free', 'free', 'free', 'sonnet', 'sonnet'] : where && thoroughOn() ? ['sonnet', 'sonnet', 'sonnet'] : [null];
  let roundNo = 0;
  for (let cycle = 0; cycle < readers.length; cycle++) {
    if (cycle > 0) toRead = live();
    const reader = readers[cycle];
    let fullReadClean = false;
    for (let repairRound = 0; repairRound <= MAX_REPAIRS; repairRound++) {
      const round = roundNo++;
      if (!toRead.blocks.length && !toRead.checks.length) break;
      // eslint-disable-next-line no-await-in-loop
      // The slow local checkers run on the first full read only; later reads have Sonnet and the cheap reads.
      const ask = (who) => verifyLevel({ context, blocks: toRead.blocks, checks: toRead.checks, factSheet, userId: owner, where: where && { ...where, localChecks: round === 0 }, reader: who })
        .catch((err) => { console.warn(`facts: verification failed (${err.message})`); return null; });
      // eslint-disable-next-line no-await-in-loop
      let v = await ask(reader);
      // MiMo could not answer (its plan capped out): Sonnet reads instead, and from here on.
      // eslint-disable-next-line no-await-in-loop
      if (!v && reader === 'free') { for (let k = cycle; k < readers.length; k++) if (readers[k] === 'free') readers[k] = 'sonnet'; v = await ask('sonnet'); }
      if (!v) { complete = false; break; }
      rounds++;
      if (v.stages) stageLog.push({ round, ...v.stages });
      usages.push(v.usage);
      if (typeof v.cost === 'number') cost += v.cost;
      model = v.model || model;
      searches += v.searches || 0;
      for (const s of v.sources || []) sources.set(s.url, s.title || '');
      for (const c of v.claims) { if (c.source_url) sources.set(c.source_url, sources.get(c.source_url) || ''); claims.push({ ...c, round }); }
      const flaggedBlocks = toRead.blocks.filter((b) => v.blocks(b.index).length).map((b) => ({ ...b, problems: v.blocks(b.index) }));
      const flaggedChecks = toRead.checks.filter((c) => v.checks(c.index).length)
        .map((c) => ({ index: c.index, spec: specs[c.index], raw: c, reason: v.checks(c.index).join('; ') }));
      if (!flaggedBlocks.length && !flaggedChecks.length) { if (repairRound === 0) fullReadClean = true; break; }
      const drop = (fb, fc) => {
        for (const f of fb) { blocks.find((b) => b.index === f.index).problems = f.problems; outcome.blocks_dropped.push(f.index); }
        for (const f of fc) { items[f.index] = null; dropReasons.set(f.index, f.reason); outcome.checks_dropped.push(f.index); }
      };
      if (repairRound === MAX_REPAIRS) { drop(flaggedBlocks, flaggedChecks); break; }
      // Blocks are repaired four to a call, side by side, as in write(): one call
      // asked to rewrite eight blocks runs out of room and every one is lost.
      const batches = [];
      for (let at = 0; at < flaggedBlocks.length; at += 4) batches.push(flaggedBlocks.slice(at, at + 4));
      // eslint-disable-next-line no-await-in-loop
      // FACT_REPAIR_WRITER=strong has Claude write every repair, from the first.
      const strongFirst = String(process.env.FACT_REPAIR_WRITER || '').toLowerCase() === 'strong';
      const first = freeFirst ? 'free' : 'glm';
      const writer = STRONG_REPAIR && (strongFirst || repairRound >= 2) ? 'strong' : first;
      const how = { userId: owner, context, coverage, effort: 'high', writer };
      const [blockReplies, fixedChecks] = await Promise.all([
        Promise.all(batches.map((batch) => repairBlocks(batch, how)
          .then((fixed) => ({ batch, fixed })).catch(() => ({ batch, fixed: null })))),
        flaggedChecks.length ? repairChecks(flaggedChecks, how).catch(() => null) : null,
      ]);
      usages.push(...blockReplies.map((r) => r.fixed && r.fixed.usage), fixedChecks && fixedChecks.usage);
      for (const r of [...blockReplies.map((x) => x.fixed), fixedChecks]) if (r && typeof r.cost === 'number') cost += r.cost;
      const fixedB = new Map();
      for (const { batch, fixed } of blockReplies) {
        readList(fixed && fixed.data && fixed.data.blocks).forEach((raw, position) => {
          const { index, data } = readEntry(raw, batch[position] ? batch[position].index : position);
          const b = batch.find((x) => x.index === index);
          if (b && data && !validateBlock(b.block, data).length) fixedB.set(index, schemaCheck.prune(library()[b.block].schema, data));
        });
      }
      const fixedC = new Map();
      readList(fixedChecks && fixedChecks.data && fixedChecks.data.checks).forEach((raw, position) => {
        const at = raw ? readIndex(raw.index) : null;
        const target = flaggedChecks.find((c) => c.index === at) || flaggedChecks[position];
        const item = target && cleanCheck(raw, target.spec, context.difficulty);
        if (item) fixedC.set(target.index, item);
      });
      drop(flaggedBlocks.filter((f) => !fixedB.has(f.index)), flaggedChecks.filter((f) => !fixedC.has(f.index)));
      for (const [index, data] of fixedB) {
        const b = blocks.find((x) => x.index === index);
        b.data = data;
        b.repaired = true;
        outcome.blocks_fixed.push(index);
      }
      for (const [index, item] of fixedC) { items[index] = { ...item, repaired: true }; outcome.checks_fixed.push(index); }
      toRead = {
        blocks: blocks.filter((b) => fixedB.has(b.index)),
        checks: [...fixedC].map(([index, item]) => ({ ...item, index })),
      };
    }
    if (!complete) break;
    if (fullReadClean) {
      // A clean MiMo read is not the end in free-first: Sonnet confirms it.
      if (reader === 'free') { const next = readers.indexOf('sonnet', cycle + 1); if (next === -1) break; cycle = next - 1; continue; }
      break;
    }
  }
  const verification = {
    status: complete ? 'verified' : 'unverified',
    model,
    rounds,
    searches,
    cost: Number(cost.toFixed(5)),
    checked_at: new Date().toISOString(),
    claims,
    sources: [...sources].map(([url, title]) => ({ url, title })).slice(0, 60),
    stages: stageLog,
    ...outcome,
  };
  return { verification, usage: usageSum(...usages), dropReasons };
}

/**
 * Did verification take out more than a third of a level's blocks? Then what is
 * left is no longer the lesson that was designed, and it is written again rather
 * than served thin.
 */
function tooMuchRemoved(verification, blockCount) {
  if (!verification || !blockCount) return false;
  return new Set(verification.blocks_dropped || []).size > blockCount / 3;
}

/**
 * Verify a level that is already written, repairing what fails (verifyAndRepair).
 *
 * For levels written before verification existed, and ones held while the
 * verifier was down. Returns the updated plan (verified, or still unverified when
 * the verifier could not run), or null when too little of it survived, in which
 * case the plan is marked failed and is written again.
 */
async function verifyStored(plan) {
  if (!plan || plan.status !== 'ready') return null;
  const { track_id: trackId, grade_id: gradeId } = plan;
  const context = levelContext(trackId, gradeId, plan.level);
  const lib = library();
  const validateBlock = (block, data) => schemaCheck.validate(lib[block].schema, data).concat(
    chessChecks.blockProblems(block, data),
    pianoChecks.blockProblems(block, data, { gradeId, topic: context.topic }),
    trackId === 'basketball' ? basketballChecks.blockProblems(block, data) : [],
  );
  const blocks = (plan.blocks || []).filter((b) => lib[b.block]).map((b) => ({ ...b, problems: [] }));
  const items = [];
  const specs = [];
  for (const c of plan.checks || []) {
    const i = Number(String(c.id || '').replace(/^c/, '')) - 1;
    if (!Number.isInteger(i) || i < 0) continue;
    items[i] = c;
    specs[i] = { format: c.format, skill_id: c.skill_id, focus: c.focus, after: c.after };
  }
  const { verification, usage, dropReasons } = await verifyAndRepair({
    context, blocks, items, specs, validateBlock, owner: plan.user_id || null, coverage: plan.coverage || [], factSheet: plan.fact_sheet || null,
    where: { trackId, gradeId, level: plan.level },
  });
  // The Sonnet check of a level served on its free check (the write-ahead's
  // upgrade) that could not finish (the key failed, or the ledger stopped it)
  // changes nothing: a repair Sonnet never read again is not kept. The level stays
  // on its free check, which passed.
  const upgrading = plan.check_tier === 'free' && !freeTier() && gateOn();
  if (upgrading && verification.status !== 'verified') {
    return db.update(COLLECTION, plan.id, { sonnet_check: { status: 'not finished', at: new Date().toISOString() } });
  }
  // With no verifier key, a stored level is self-checked instead (P10); on the
  // free tier it is self-checked whether or not the key is set.
  const selfChecked = selfCheckRun() ? await selfCheck({ items, verification }) : null;
  if (selfChecked) for (const d of selfChecked.dropped) dropReasons.set(d.index, d.why);
  const kept = blocks.filter((b) => !b.problems.length);
  const checks = [];
  items.forEach((item, i) => {
    if (item) checks.push({ ...item, id: `c${i + 1}`, after: specs[i].after, focus: specs[i].focus });
  });
  const patch = {
    verification,
    ...(selfChecked ? { self_check: selfCheckRecord(selfChecked) } : {}),
    check_tier: checkTierNow(),
    ...(upgrading ? { sonnet_check: { status: 'verified', at: new Date().toISOString(), free_verification: plan.verification || null } } : {}),
    dropped: [...(plan.dropped || []), ...blocks.filter((b) => b.problems.length).map((b) => ({ block: b.block, problems: b.problems.slice(0, 4) }))],
    dropped_checks: [...(plan.dropped_checks || []), ...[...dropReasons].map(([index, why]) => ({ index, why }))],
    usage: usageSum(plan.usage, usage),
  };
  const teaches = kept.some((b) => lib[b.block].category === 'Foundational' || lib[b.block].family === 'retention');
  if (!kept.length || !teaches || (plan.kind === 'lesson' && kept.length < 2) || !checks.length || tooMuchRemoved(verification, blocks.length)) {
    db.update(COLLECTION, plan.id, { ...patch, status: 'failed', reason: `too little survived verification (${kept.length} of ${blocks.length} blocks, ${checks.length} checks): it is written again` });
    return null;
  }
  return db.update(COLLECTION, plan.id, {
    ...patch,
    blocks: kept.map((b) => ({ block: b.block, purpose: b.purpose, data: b.data, repaired: !!b.repaired, index: b.index })),
    checks,
  });
}

/**
 * A block's data as the model sent it: some models send a nested object as a
 * JSON string inside the tool call, and an index as a string. Both are read
 * as what they mean rather than thrown away.
 */
function readData(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* not JSON: nothing usable */ }
  }
  return null;
}

/**
 * The top-level `{...}` objects of a JSON array that does not parse as a whole,
 * each parsed on its own. A model that drops one brace in a ten-block reply
 * loses that block, not all ten. An element that will not parse but holds a
 * parseable `"data": {...}` keeps that.
 */
function parsesAsObject(text) {
  try {
    const parsed = JSON.parse(text);
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch { return false; }
}

function salvageObjects(text) {
  const out = [];
  const str = String(text);
  const balanced = (from) => {
    let depth = 0;
    let inString = false;
    for (let i = from; i < str.length; i++) {
      const ch = str[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
  };
  let i = str.indexOf('{');
  while (i !== -1 && i < str.length) {
    const end = balanced(i);
    const chunk = end === -1 ? str.slice(i) : str.slice(i, end + 1);
    let parsed = null;
    try { parsed = JSON.parse(chunk); } catch { parsed = null; }
    if (!parsed) {
      const at = chunk.indexOf('"data"');
      const open = at === -1 ? -1 : chunk.indexOf('{', at);
      if (open !== -1) {
        const local = balanced(i + open);
        if (local !== -1) {
          try { parsed = { data: JSON.parse(str.slice(i + open, local + 1)) }; } catch { parsed = null; }
          // Continue after the data object: the rest of this broken element is
          // the start of the next one.
          if (parsed) { out.push(parsed); i = str.indexOf('{', local + 1); continue; }
        }
      }
    }
    if (parsed) out.push(parsed);
    if (end === -1) break;
    i = str.indexOf('{', end + 1);
  }
  return out;
}

/** A list of short points: an array, a JSON array in a string, or plain lines / numbered points. */
function readPoints(value) {
  const list = readList(value);
  if (list.length || typeof value !== 'string') return list;
  return value.split(/\n+|;\s+|\s(?=\d+[.)]\s)/).map((t) => t.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((t) => t.length > 2);
}

/** A list as the model sent it: an array, or an array sent as a JSON string. */
function readList(value) {
  // One JSON list cut into string pieces ("[{\"index\":0, ...", "{\"index\":1 ...}]"):
  // the pieces are joined and read as the one list they were. GLM sent a piano
  // fill-out this way and six of its nine blocks were lost before this.
  if (Array.isArray(value) && value.length > 1 && value.every((v) => typeof v === 'string')
    && /^\s*\[\s*\{/.test(value[0]) && !value.every(parsesAsObject)) {
    const joined = salvageObjects(value.join(', ').replace(/^\s*\[/, ''));
    if (joined.length) return joined;
  }
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return Object.values(parsed);
    } catch {
      if (value.trim().startsWith('[')) return salvageObjects(value.trim().slice(1));
    }
  }
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

/**
 * One block entry of a fill-out or repair reply, however the model shaped it:
 * `{index, data}` as asked, or the content under another name (content,
 * payload, props, fields), or the content itself with the index beside it, or
 * no index at all — then its place in the list is its index.
 */
function readEntry(entry, position) {
  if (typeof entry === 'string') entry = readData(entry);
  if (!entry || typeof entry !== 'object') return { index: position, data: null };
  const rawIndex = entry.index ?? entry.block_index ?? entry.blockIndex ?? entry.i;
  const index = rawIndex === undefined ? position : readIndex(rawIndex);
  let data = null;
  for (const key of ['data', 'content', 'payload', 'props', 'fields', 'value']) {
    if (entry[key] !== undefined) { data = readData(entry[key]); if (data) break; }
  }
  if (!data) {
    const rest = { ...entry };
    for (const key of ['index', 'block_index', 'blockIndex', 'i', 'block', 'tag', 'type', 'data', 'content', 'payload', 'props', 'fields', 'value']) delete rest[key];
    if (Object.keys(rest).length >= 1) data = rest;
  }
  return { index: index === null ? position : index, data, explicit: rawIndex !== undefined && index !== null };
}

/**
 * Whether a reply numbered its entries from 1 rather than 0: no 0 among them,
 * and the highest one is the count. Read as 0-based, every entry would land on
 * the slot after its own — a check on the wrong question, a block's data
 * against the next block's schema.
 */
function oneBased(indexes, count) {
  const nums = indexes.filter((i) => Number.isInteger(i));
  if (!nums.length) return false;
  return !nums.includes(0) && Math.max(...nums) === count && Math.min(...nums) >= 1;
}

function readIndex(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

// ── writing a plan ─────────────────────────────────────────────────────────
function usageSum(...usages) {
  const out = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  for (const u of usages) {
    if (!u) continue;
    out.input_tokens += u.input_tokens || 0;
    out.output_tokens += u.output_tokens || 0;
    out.cache_read_input_tokens += u.cache_read_input_tokens || 0;
  }
  return out;
}

const inFlight = new Map();

/**
 * Write the plan for one level, for one learner or for everyone.
 *
 * @returns {Promise<object|null>} the stored plan, or null when it could not be written
 */
async function write({ userId, trackId, gradeId, level, tailored }) {
  // eslint-disable-next-line global-require
  const ai = require('./ai');
  // eslint-disable-next-line global-require
  const personalize = require('./personalize');
  const grade = curriculum.getGrade(trackId, gradeId);
  const kind = kindFor(grade, level);
  if (kind !== 'lesson' && kind !== 'retention') return null;

  const where = { trackId, gradeId, level };
  const { arm, experiment } = tailored ? personalize.armFor(userId, where) : { arm: 'shared', experiment: null };
  // A holdout learner is served the shared plan; nothing is written for them.
  if (tailored && arm === 'holdout') return ensureShared({ trackId, gradeId, level });
  const owner = tailored ? userId : null;

  const context = levelContext(trackId, gradeId, level);
  const catalog = catalogFor(kind, trackId);
  const formats = checkFormats(trackId);
  const learner = learnerText(owner, where, { tailored, experiment });
  const started = Date.now();
  const row = anyRow({ userId: owner, trackId, gradeId, level })
    || db.insert(COLLECTION, { user_id: owner, track_id: trackId, grade_id: gradeId, level, attempt: 1, kind, status: 'writing' });
  // Each write holds a token on the row. A write that was timed out and then
  // replaced (ensure, BLOCK_WRITE_TIMEOUT_MS) finds another token there when it
  // finally ends, and leaves the row to the write that replaced it.
  const token = crypto.randomBytes(8).toString('hex');
  db.update(COLLECTION, row.id, { status: 'writing', kind, started_at: new Date().toISOString(), write_token: token, reason: null });
  const settle = (patch) => {
    const now = db.byId(COLLECTION, row.id);
    if (!now || now.write_token !== token) return null;
    return db.update(COLLECTION, row.id, patch);
  };

  // 1. layout
  const layoutReply = await ai.structuredDetail({
    role: 'blocks',
    task: 'block_layout',
    system: `${LAYOUT_SYSTEM}${subjectNote(trackId, 'layout')}\n\nLIBRARY (${kind === 'retention' ? 'retention and assessment blocks' : 'lesson blocks'}):\n${catalog.map(catalogLine).join('\n')}`,
    user: `${context.text}\n\n${learner}\n\nDesign the ${kind} layout now.`,
    schema: layoutSchema(kind, catalog.map((b) => b.tag), context.skills, formats),
    schemaName: 'submit_layout',
    // Room for a thinking model's reasoning as well as the layout itself.
    maxTokens: 16000,
    userId: owner,
    dataClass: poolClass(owner),
    lane: process.env.BLOCK_LANE || 'background',
  });
  const layoutData = layoutReply && layoutReply.data
    ? { ...layoutReply.data, blocks: readList(layoutReply.data.blocks), checks: readList(layoutReply.data.checks), coverage: readPoints(layoutReply.data.coverage) }
    : null;
  let layout = cleanLayout(layoutData, kind, catalog, context.skills, formats);
  // Base levels written ahead must have a real layout: a level whose layout call
  // failed is failed, to be written again, rather than given the default.
  if (!layout && process.env.BLOCK_REQUIRE_LAYOUT === '1') {
    settle({ status: 'failed', reason: 'the layout call returned nothing usable', finished_at: new Date().toISOString() });
    return null;
  }
  layout = layout || defaultLayout(kind, context.skills);

  // The facts first: researched with sources, so the writing starts from them.
  // Under the cascade the sheet is the unit's shared pool, researched once per unit.
  let factSheet = null;
  if (verifyOn() && cascadeOn()) {
    // eslint-disable-next-line global-require
    const got = await require('./fact-cascade').unitPool({ trackId, gradeId, level, context }).catch(() => null);
    factSheet = got && got.pool ? { facts: got.pool.facts, misconceptions: got.pool.misconceptions, sources: got.pool.sources, cost: got.fresh ? got.pool.cost : 0, model: got.pool.model, pool_key: got.pool.key } : null;
  } else if (verifyOn()) {
    // FACT_POOL=offline: offline sources first, the paid researcher only for what they
    // could not source (services/offline-pool.js). Off by default.
    // eslint-disable-next-line global-require
    factSheet = (await require('./offline-pool').offlineFirst({ context, coverage: layout.coverage || [], maxFacts: 25, research: researchFacts }))
      || await researchFacts({ context, coverage: layout.coverage || [] });
  }

  // 2. fill
  const fillReply = await ai.structuredDetail({
    role: 'blocks',
    task: 'block_fill',
    system: FILL_SYSTEM + subjectNote(trackId, 'fill'),
    user: fillPrompt({ context, learner, layout, factSheet }),
    schema: fillSchema(),
    schemaName: 'submit_block_content',
    maxTokens: Number(process.env.BLOCK_FILL_MAX_TOKENS || 32000),
    userId: owner,
    dataClass: poolClass(owner),
    lane: process.env.BLOCK_LANE || 'background',
  });
  if (!fillReply || !fillReply.data) {
    settle({ status: 'failed', reason: 'the fill-out call returned nothing', finished_at: new Date().toISOString() });
    return null;
  }

  const lib = library();
  const byIndex = new Map();
  const blockEntries = readList(fillReply.data.blocks).map((raw, position) => readEntry(raw, position));
  const blockShift = oneBased(blockEntries.map((e) => e.index), layout.blocks.length) ? 1 : 0;
  // Entries that say which block they are win; an entry placed only by its
  // position in the list fills a slot nothing else claimed.
  for (const pass of [true, false]) {
    for (const { index, data, explicit } of blockEntries) {
      if (explicit !== pass) continue;
      const at = explicit ? index - blockShift : index;
      if (!byIndex.has(at) || !byIndex.get(at)) byIndex.set(at, data);
    }
  }
  const blocks = layout.blocks.map((b, i) => {
    const data = byIndex.get(i);
    const schema = lib[b.block].schema;
    // A chess block's position and moves must also be legal, which no schema can say.
    const problems = data && typeof data === 'object'
      ? schemaCheck.validate(schema, data).concat(chessChecks.blockProblems(b.block, data), pianoChecks.blockProblems(b.block, data, { gradeId, topic: context.topic }), (trackId === 'basketball' ? basketballChecks.blockProblems(b.block, data) : []))
      : ['no data written'];
    return { ...b, index: i, data: data && typeof data === 'object' ? schemaCheck.prune(schema, data) : null, problems };
  });

  // One repair call for everything that failed, then drop what still fails.
  const broken = blocks.filter((b) => b.problems.length);
  // A fill-out none of whose blocks could be read is kept for inspection: it is
  // a reply shape this reader does not know yet.
  if (broken.length === blocks.length && process.env.BLOCK_DEBUG_DIR) {
    try {
      require('fs').writeFileSync(require('path').join(process.env.BLOCK_DEBUG_DIR, `fill-unread-${trackId}-${gradeId}-${level}-${Date.now()}.json`),
        JSON.stringify(fillReply.data).slice(0, 400000));
    } catch { /* inspection only */ }
  }
  let repairUsage = null;
  // Repairs go a few blocks per call, side by side: one call asked to rewrite ten
  // blocks from scratch runs out of room and returns the first six.
  const batches = [];
  for (let at = 0; at < broken.length; at += 4) batches.push(broken.slice(at, at + 4));
  const repaired = await Promise.all(batches.map((batch) => repairBlocks(batch, { userId: owner, context, coverage: layout.coverage || [] })
    .then((fixed) => ({ batch, fixed })).catch(() => ({ batch, fixed: null }))));
  repairUsage = usageSum(...repaired.map((r) => r.fixed && r.fixed.usage));
  for (const { batch, fixed } of repaired) {
    const fixedList = readList(fixed && fixed.data && fixed.data.blocks);
    for (const [position, raw] of fixedList.entries()) {
      // An entry with no index of its own stands for the broken block in its place.
      const { index, data } = readEntry(raw, batch[position] ? batch[position].index : position);
      const b = blocks.find((x) => x.index === index && x.problems.length);
      if (!b || !data) continue;
      const schema = lib[b.block].schema;
      const problems = schemaCheck.validate(schema, data).concat(chessChecks.blockProblems(b.block, data), pianoChecks.blockProblems(b.block, data, { gradeId, topic: context.topic }), (trackId === 'basketball' ? basketballChecks.blockProblems(b.block, data) : []));
      if (!problems.length) {
        b.data = schemaCheck.prune(schema, data);
        b.problems = [];
        b.repaired = true;
      }
    }
  }
  const checkByIndex = new Map();
  let checkList = readList(fillReply.data.checks);
  // Checks that landed among the blocks: entries shaped like a question.
  if (!checkList.length) {
    checkList = readList(fillReply.data.blocks).map((e) => (typeof e === 'string' ? readData(e) : e))
      .filter((e) => e && typeof e === 'object' && e.prompt && e.answer !== undefined && e.data === undefined);
  }
  // Still none: the reply left them out. One small call writes just the checks.
  let checksUsage = null;
  if (!checkList.length && layout.checks.length) {
    const only = await writeChecksOnly({ context, learner, layout, userId: owner });
    checksUsage = only && only.usage;
    checkList = readList(only && only.data && only.data.checks);
  }
  const checkIndexes = checkList.map((c, position) => {
    const i = c ? readIndex(c.index) : null;
    return i === null ? position : i;
  });
  const checkShift = oneBased(checkIndexes, layout.checks.length) ? 1 : 0;
  checkList.forEach((c, position) => {
    const index = checkIndexes[position] - checkShift;
    if (c && !checkByIndex.has(index)) checkByIndex.set(index, c);
  });
  const items = layout.checks.map((spec, i) => cleanCheck(checkByIndex.get(i), spec, context.difficulty));
  // One repair call for the checks that failed, each sent back with why.
  const brokenChecks = layout.checks.map((spec, i) => ({ index: i, spec, raw: checkByIndex.get(i) }))
    .filter((c) => !items[c.index]);
  let checkRepairUsage = null;
  const repairedChecks = new Set();
  if (brokenChecks.length) {
    const fixed = await repairChecks(brokenChecks, { userId: owner, context, coverage: layout.coverage || [] }).catch(() => null);
    checkRepairUsage = fixed && fixed.usage;
    readList(fixed && fixed.data && fixed.data.checks).forEach((raw, position) => {
      const at = raw ? readIndex(raw.index) : null;
      const target = brokenChecks.find((c) => c.index === at) || brokenChecks[position];
      if (!target || items[target.index]) return;
      const item = cleanCheck(raw, target.spec, context.difficulty);
      if (item) { items[target.index] = item; repairedChecks.add(target.index); } else target.raw = raw;
    });
  }

  // Make it factual: every claim verified (with sources), what fails repaired and
  // verified again, what still fails dropped. See "making a level factual" above.
  let verification = null;
  let verifyUsage = null;
  if (verifyOn()) {
    const validateBlock = (block, data) => schemaCheck.validate(lib[block].schema, data).concat(
      chessChecks.blockProblems(block, data),
      pianoChecks.blockProblems(block, data, { gradeId, topic: context.topic }),
      trackId === 'basketball' ? basketballChecks.blockProblems(block, data) : [],
    );
    const result = await verifyAndRepair({
      context, blocks, items, specs: layout.checks, validateBlock, owner, factSheet, coverage: layout.coverage || [], where: { trackId, gradeId, level },
    });
    verification = result.verification;
    verifyUsage = result.usage;
    for (const [index, reason] of result.dropReasons) brokenChecks.push({ index, spec: layout.checks[index], raw: null, reason });
    for (const i of verification.checks_fixed) repairedChecks.add(i);
  }
  // The explanation-key gate (KEY_GATE=on): a multiple-choice check whose rationale
  // describes another option, and that a blind check does not confirm, is dropped
  // with its reason (listed in the plan's dropped checks, never silently).
  {
    // eslint-disable-next-line global-require
    const keyGate = require('./key-gate');
    const mc = items.map((it, i) => ({ it, i })).filter((x) => x.it && x.it.format === 'multiple_choice' && Array.isArray(x.it.choices));
    const rejected = await keyGate.rejectedByKeyGate(mc.map((x) => ({ prompt: x.it.prompt, choices: x.it.choices, answer: x.it.answer, rationale: x.it.rationale })));
    for (const r of rejected) {
      const index = mc[r.index].i;
      items[index] = null;
      brokenChecks.push({ index, spec: layout.checks[index], raw: null, reason: `key gate: ${r.reason}` });
    }
  }
  // With no verifier key, or on the free tier: the blind re-solve half of the self-check (selfCheckOn, P10).
  let selfChecked = null;
  if (selfCheckRun()) {
    selfChecked = await selfCheck({ items, verification });
    for (const d of selfChecked.dropped) brokenChecks.push({ index: d.index, spec: layout.checks[d.index], raw: null, reason: d.why });
  }
  const kept = blocks.filter((b) => !b.problems.length);
  const dropped = blocks.filter((b) => b.problems.length).map((b) => ({ block: b.block, problems: b.problems.slice(0, 4) }));

  const checks = [];
  const droppedChecks = [];
  layout.checks.forEach((spec, i) => {
    const item = items[i];
    if (!item) {
      const last = [...brokenChecks].reverse().find((c) => c.index === i);
      droppedChecks.push({ index: i, why: (last && last.reason) || whyRefused(last ? last.raw : checkByIndex.get(i), spec) });
      return;
    }
    checks.push({
      ...item,
      id: `c${i + 1}`,
      after: spec.after,
      focus: spec.focus,
      ...(repairedChecks.has(i) ? { repaired: true } : {}),
    });
  });

  const teaches = kept.some((b) => lib[b.block].category === 'Foundational' || lib[b.block].family === 'retention');
  if (!kept.length || !teaches || (kind === 'lesson' && kept.length < 2) || !checks.length || tooMuchRemoved(verification, blocks.length)) {
    settle({
      status: 'failed',
      reason: `too little survived the checks (${kept.length} blocks, ${checks.length} checks)`,
      dropped,
      dropped_checks: droppedChecks,
      verification,
      checks_sample: JSON.stringify(fillReply.data.checks === undefined ? Object.keys(fillReply.data) : fillReply.data.checks).slice(0, 1500),
      finished_at: new Date().toISOString(),
    });
    return null;
  }

  const usage = usageSum(layoutReply && layoutReply.usage, fillReply.usage, repairUsage, checksUsage, checkRepairUsage, verifyUsage, factSheet && factSheet.usage);
  return settle({
    status: 'ready',
    kind,
    arm: tailored ? arm : 'shared',
    experiment: experiment || null,
    approach: layout.approach,
    coverage: layout.coverage || [],
    layout_fallback: !!layout.fallback,
    blocks: kept.map((b) => ({ block: b.block, purpose: b.purpose, data: b.data, repaired: !!b.repaired, index: b.index })),
    checks,
    dropped,
    dropped_checks: droppedChecks,
    verification,
    self_check: selfChecked ? selfCheckRecord(selfChecked) : null,
    check_tier: checkTierNow(),
    fact_sheet: factSheet ? { facts: factSheet.facts, misconceptions: factSheet.misconceptions, sources: factSheet.sources, cost: factSheet.cost, model: factSheet.model, pool_key: factSheet.pool_key || null } : null,
    model: fillReply.model || null,
    layout_model: layoutReply ? layoutReply.model : null,
    usage,
    seconds: Math.round((Date.now() - started) / 1000),
    brief_hash: tailored ? hash(learner) : null,
    finished_at: new Date().toISOString(),
    answers: {},
  });
}

function hash(text) {
  return crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 16);
}

/**
 * A write (or re-check) that has not ended after BLOCK_WRITE_TIMEOUT_MS (25
 * minutes) is let go: a provider call that never returns kept the level "being
 * written" for good, and every visit waited on it (math numbers_to_20 level 10,
 * 2026-10-25). The row is marked failed, so the next visit or write-ahead writes
 * it again; a late finish of the old write is ignored (its token is gone).
 * 25 minutes because a level write is several calls in a row (layout, fill-out,
 * checks, repairs). Since the model pool (services/pool.js, 2026-10-27) every
 * single call is bounded by its own hard timeout (120 s by default, 180 to 300 s
 * for the heavy tasks, config "pool.tasks") and hedged onto a second slot, so a
 * lone hung call can no longer burn this whole budget; it stays as the outer
 * guard for the write as a whole. The learner never waits on
 * it: the page goes to the standard session after a minute (block-level.js).
 * A row left at "writing" by a server that stopped is not in flight at all, and
 * is simply written again on the next read.
 */
function timedOut(promise, where) {
  const ms = Number(process.env.BLOCK_WRITE_TIMEOUT_MS || 25 * 60 * 1000);
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      if (where) {
        const row = anyRow({ userId: where.owner, trackId: where.trackId, gradeId: where.gradeId, level: where.level });
        if (row && row.status === 'writing') {
          db.update(COLLECTION, row.id, { status: 'failed', reason: `timed out: the write had not finished after ${Math.round(ms / 1000)} s`, write_token: null, finished_at: new Date().toISOString() });
        }
        console.warn(`blocks: writing ${where.trackId}/${where.gradeId}/${where.level} timed out; it is written again on the next visit`);
      }
      resolve(null);
    }, ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The in-flight key of one level's plan: its writing, its re-check and its Sonnet upgrade share it. */
function planKey(owner, trackId, gradeId, level) {
  return `${owner || 'shared'}:${trackId}:${gradeId}:${level}`;
}

/**
 * The check tier a write asked for runs on (the write-ahead, WRITE_AHEAD):
 *   'free'    the free check (levels 2 and 3 ahead);
 *   'sonnet'  the key's check (the next level), or the free one once the
 *             ledger cannot pay for it;
 *   'open'    a level being opened, or the one the learner stands on: the free
 *             check first, so it is served as soon as that passes, then its
 *             Sonnet check straight after (upgrade).
 * null when the write-ahead is off or the key's gate is not on: the write runs
 * as before (the key's check under the gate, the self-check with no key).
 */
function tierFor(asked) {
  if (!asked || !writeAheadOn() || !gateOn()) return null;
  if (asked === 'sonnet') return sonnetAffordable() ? 'sonnet' : 'free';
  return 'free';
}

/** Write it now, reusing one already in flight rather than starting a second. */
function ensure({ userId, trackId, gradeId, level, tailored, tier = null }) {
  const owner = tailored ? userId : null;
  const ready = findPlan({ userId: owner, trackId, gradeId, level });
  if (ready) {
    if (tier === 'open' && sonnetPending(ready)) upgrade(ready).catch(() => {});
    return Promise.resolve(ready);
  }
  // Written but not yet verified (before verification existed, or while the
  // verifier was down): verified now, which costs far less than writing it again.
  // With no key, a level written before the self-check (or one whose self-check
  // could not run) is self-checked now in the same way (selfCheckOn, P10).
  const held = gateOn() || selfCheckOn() ? readyPlan({ userId: owner, trackId, gradeId, level }) : null;
  if (!held && !aiReady()) return Promise.resolve(null);
  const key = planKey(owner, trackId, gradeId, level);
  if (inFlight.has(key)) return inFlight.get(key);
  const onTierNow = tierFor(tier);
  const run = async () => {
    // A level whose free check already failed is written again on the free tier
    // rather than read by the same free check a second time.
    if (held && !(onTierNow === 'free' && held.check_tier === 'free' && held.self_check && held.self_check.status === 'failed')) {
      const checked = await verifyStored(held);
      if (checked) return servable(checked) ? checked : null;
      // Too little of it was true to keep: it is written again below.
    }
    if (!aiReady()) return null;
    const written = await write({ userId, trackId, gradeId, level, tailored });
    return written && servable(written) ? written : null;
  };
  const task = timedOut((onTierNow ? onTier(onTierNow, run) : run()), { owner, trackId, gradeId, level })
    .catch((err) => {
      console.warn(`blocks: writing ${trackId}/${gradeId}/${level} failed: ${err.message}`);
      return null;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  if (tier === 'open') task.then((p) => { if (sonnetPending(p)) upgrade(p).catch(() => {}); }).catch(() => {});
  return task;
}

/**
 * The Sonnet check of a level served on its free check (sonnetPending), in the
 * background: run when it becomes the next level, and when it is opened. It
 * shares the level's in-flight slot, so it never runs beside a write of the same
 * level, and a request for the level meanwhile is served the free-checked plan
 * at once. Past the ledger's stop it does not run: the level stays on its free
 * check. Resolves to the plan as it then stands (null if Sonnet took too much
 * out and it is to be written again).
 */
function upgrade(plan) {
  const row = plan && plan.id ? db.byId(COLLECTION, plan.id) : null;
  if (!row || !sonnetPending(row)) return Promise.resolve(row && servable(row) ? row : null);
  if (!sonnetAffordable()) return Promise.resolve(row);
  const key = planKey(row.user_id, row.track_id, row.grade_id, row.level);
  if (inFlight.has(key)) return inFlight.get(key);
  const task = timedOut(onTier('sonnet', () => verifyStored(row)), null)
    .then((checked) => (checked && servable(checked) ? checked : null))
    .catch((err) => {
      console.warn(`blocks: the Sonnet check of ${row.track_id}/${row.grade_id}/${row.level} failed: ${err.message}`);
      const now = db.byId(COLLECTION, row.id);
      return now && servable(now) ? now : null;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

function ensureShared({ trackId, gradeId, level }) {
  return ensure({ userId: null, trackId, gradeId, level, tailored: false });
}

function isWriting({ userId, trackId, gradeId, level, tailored }) {
  return inFlight.has(`${tailored ? userId : 'shared'}:${trackId}:${gradeId}:${level}`);
}

/**
 * The plan to serve this account at this level, waiting a bounded time for it.
 *
 * @returns {Promise<{plan: object|null, writing: boolean}>}
 */
async function forLevel({ user, trackId, gradeId, level }) {
  const tailored = tailorsFor(user);
  const userId = user.id;
  const mine = tailored ? findPlan({ userId, trackId, gradeId, level }) : null;
  if (mine) {
    // Opened on its free check: its Sonnet check runs now, in the background (WRITE_AHEAD).
    if (sonnetPending(mine)) upgrade(mine).catch(() => {});
    return { plan: mine, writing: false };
  }
  if (!mayGenerate(user)) {
    // Only what already exists: the level's base version, written ahead.
    return { plan: findPlan({ userId: null, trackId, gradeId, level }), writing: false };
  }
  // A tailored learner in the holdout, or one whose plan failed, reads the shared plan.
  // With the write-ahead on under the key, a level opened cold is written on the
  // free check, served once that passes, and then Sonnet-checked (tier 'open').
  const task = ensure({ userId, trackId, gradeId, level, tailored, tier: 'open' });
  const timeout = new Promise((resolve) => { setTimeout(() => resolve(undefined), WAIT_MS); });
  const winner = await Promise.race([task, timeout]);
  if (winner) return { plan: winner, writing: false };
  if (winner === undefined) return { plan: null, writing: true };
  // Written and failed: fall back to the shared plan if there is one.
  const shared = findPlan({ userId: null, trackId, gradeId, level });
  if (shared) {
    if (sonnetPending(shared)) upgrade(shared).catch(() => {});
    return { plan: shared, writing: false };
  }
  if (tailored) {
    const sharedTask = ensure({ userId: null, trackId, gradeId, level, tailored: false, tier: 'open' });
    const got = await Promise.race([sharedTask, new Promise((r) => setTimeout(() => r(undefined), WAIT_MS))]);
    if (got) return { plan: got, writing: false };
    if (got === undefined) return { plan: null, writing: true };
  }
  return { plan: null, writing: false };
}

/**
 * The level the learner stands on and the next ones they will reach, `count`
 * in all. On a gap-only path those skip the units they proved
 * (services/learner-path.js), so nothing is written for a level the path steps
 * over; otherwise they are simply the next levels.
 */
function levelsAhead(enrollment, grade, from, count) {
  // eslint-disable-next-line global-require
  const learnerPath = require('./learner-path');
  const planned = !!learnerPath.planFor(enrollment);
  const out = [];
  for (let at = from; at <= grade.pathLength && out.length < count;) {
    out.push(at);
    const next = planned ? learnerPath.nextLevelAfter(enrollment, grade, at) : at + 1;
    // The path can go back for a unit left behind; a level already listed ends it.
    if (next === at || out.includes(next)) break;
    at = next;
  }
  return out;
}

/**
 * Start writing the next block level or two ahead, so the learner never waits.
 * Nobody awaits this.
 */
function prefetchAhead({ user, enrollment, grade }) {
  // The write-ahead (services/write-ahead.js, WRITE_AHEAD, on by default) takes
  // over: the next WRITE_AHEAD_LEVELS levels, checked by tier, queued with caps.
  // WRITE_AHEAD=off is the code below, as it was.
  if (writeAheadOn()) {
    // eslint-disable-next-line global-require
    require('./write-ahead').trigger({ user, enrollment, grade, reason: 'prefetch' });
    return;
  }
  if (!user || !enrollment || !grade || !aiReady() || !mayGenerate(user)) return;
  const from = enrollment.current_level || 1;
  const tailored = tailorsFor(user);
  for (const at of levelsAhead(enrollment, grade, from, 4)) {
    const kind = kindFor(grade, at);
    if (kind === 'lesson' || kind === 'retention') {
      if (!visibleTo(user)) continue;
      ensure({ userId: user.id, trackId: enrollment.track_id, gradeId: enrollment.grade_id, level: at, tailored })
        .catch(() => { /* logged in ensure */ });
    } else if (kind === 'checkpoint' && tailored) {
      // eslint-disable-next-line global-require
      require('./block-checkpoints').prefetch({ userId: user.id, enrollment, grade, level: at });
    }
  }
}

// ── what the page sees ─────────────────────────────────────────────────────
/**
 * The plan for the browser: block data, and checks as questions without
 * answers, placed where the layout put them. Plus the files to load.
 */
function publicPlan(plan, userId, itemIds = {}) {
  if (!plan) return null;
  const lib = library();
  const entries = [];
  const checksAfter = (i) => (plan.checks || []).filter((c) => c.after === i);
  const pushCheck = (c) => entries.push({
    block: c.format === 'board' ? 'Check_Board' : c.format === 'keys' ? 'Check_Piano' : c.format === 'play' ? 'Check_Play'
      : c.format === 'multiple_choice' ? 'Check_Choice' : 'Check_Typed',
    data: c.format === 'board' ? { id: c.id, prompt: c.prompt, fen: c.fen }
      : c.format === 'keys' ? { id: c.id, prompt: c.prompt, mode: c.mode }
      : c.format === 'play' ? { id: c.id, prompt: c.prompt, frames: c.frames, pauseAt: c.pauseAt, options: c.options, seconds: c.seconds }
      : c.format === 'multiple_choice' ? { id: c.id, prompt: c.prompt, choices: c.choices }
        : { id: c.id, prompt: c.prompt },
    // The item the coach works on, for this learner.
    item_id: itemIds[c.id] || null,
  });
  checksAfter(-1).forEach(pushCheck);
  (plan.blocks || []).forEach((b) => {
    entries.push({ block: b.block, data: b.data, ref: b.index });
    checksAfter(b.index).forEach(pushCheck);
  });
  // A check whose block was dropped still has to be asked.
  const placed = new Set(entries.filter((e) => e.block.startsWith('Check_')).map((e) => e.data.id));
  (plan.checks || []).filter((c) => !placed.has(c.id)).forEach(pushCheck);

  const files = [...new Set(entries.map((e) => lib[e.block] && lib[e.block].url).filter(Boolean))];
  // The checks share one helper, loaded before either of them.
  if (entries.some((e) => e.block.startsWith('Check_'))) files.unshift('/engine/checks/checks-common.js');
  // The chess blocks stand on the rules, the board and the bot, loaded first.
  if (entries.some((e) => e.block === 'Check_Board' || e.block.startsWith('Chess_'))) {
    files.unshift('/engine/chess/chess-core.js', '/engine/chess/board.js', '/engine/chess/bot.js', '/engine/chess/teach.js');
  }
  // So do the piano blocks on the note logic and the keyboard, microphone and MIDI inputs.
  if (entries.some((e) => e.block === 'Check_Piano' || e.block.startsWith('Piano_'))) {
    files.unshift('/engine/piano/piano-core.js', '/engine/piano/piano-io.js');
  }
  // And the basketball blocks on the court and its tracking maths; the camera
  // blocks load after the other basketball blocks, which they build on.
  if (entries.some((e) => e.block === 'Check_Play' || e.block.startsWith('Basketball_'))) {
    const cam = files.indexOf(BASKETBALL_CAMERA_URL);
    if (cam !== -1) {
      files.splice(cam, 1);
      if (!files.includes(BASKETBALL_URL)) files.push(BASKETBALL_URL);
      // Body tracking (MediaPipe, self-hosted) loads only when a camera block is on the page.
      files.push('/engine/basketball/pose.js', BASKETBALL_CAMERA_URL);
    }
    files.unshift('/engine/basketball/court.js', '/engine/basketball/tracking.js');
  }
  // A shared plan is read by many learners, so answers are kept per learner.
  const prefix = `${userId}:`;
  const answered = Object.fromEntries(Object.entries(plan.answers || {})
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, a]) => {
      const check = (plan.checks || []).find((c) => c.id === k.slice(prefix.length)) || {};
      return [k.slice(prefix.length), { correct: !!a.correct, choice: a.answer, answer: check.answer, rationale: check.rationale }];
    }));
  return {
    id: plan.id,
    kind: plan.kind,
    approach: plan.approach || '',
    tailored: !!plan.user_id,
    arm: plan.arm,
    entries,
    files,
    answered,
  };
}

/** The plan this learner was served at this level: their own, else the shared one. */
function servedPlan(user, trackId, gradeId, level) {
  return (tailorsFor(user) && findPlan({ userId: user.id, trackId, gradeId, level }))
    || findPlan({ userId: null, trackId, gradeId, level });
}

/**
 * Grade one check, record it, and say what the right answer was.
 *
 * The first answer to a check is the one that counts; asking again returns the
 * same verdict. Recorded as an item, so the after-level read and the mastery
 * gate see a block level's checks exactly as they see a session's questions.
 */
/**
 * Each check is an item of its own for each learner, made when the page is
 * served — so the question coach that sessions use (/api/items/:id/coach before
 * answering, /ask after) works on a lesson's checks too, and its use is recorded
 * on the item the answer lands on.
 *
 * @returns {Object<string, number>} check id → item id
 */
function checkItems(user, plan) {
  const out = {};
  const existing = db.find('items', (i) => i.user_id === user.id && i.plan_id === plan.id && i.check_id);
  for (const check of plan.checks || []) {
    let item = existing.find((i) => i.check_id === check.id);
    if (!item) {
      item = db.insert('items', {
        session_id: null,
        user_id: user.id,
        plan_id: plan.id,
        check_id: check.id,
        skill_id: check.skill_id,
        skill_name: check.skill_name,
        difficulty: check.difficulty,
        format: check.format,
        prompt: check.prompt,
        choices: check.choices || null,
        answer: check.answer,
        accepts: check.accepts || [],
        fen: check.fen || null,
        mode: check.mode || null,
        answer_id: check.answer_id || null,
        rationale: check.rationale,
        hint: '',
        role: 'check',
        level: plan.level,
        track_id: plan.track_id,
        grade_id: plan.grade_id,
        user_answer: null,
        correct: null,
        ms: null,
        coach_used: false,
        source: 'block-level',
      });
    }
    out[check.id] = item.id;
  }
  return out;
}

/**
 * Grade one check, record it, and say what the right answer was.
 *
 * The first answer to a check is the one that counts; asking again returns the
 * same verdict. Recorded on the check's item, so the after-level read and the
 * mastery gate see a block level's checks exactly as they see a session's
 * questions — and an answer reached with the coach's help counts for less.
 */
function answerCheck({ user, plan, checkId, answer, ms }) {
  // eslint-disable-next-line global-require
  const mastery = require('./mastery');
  // eslint-disable-next-line global-require
  const scorecardHooks = require('./scorecard/hooks');
  const check = (plan.checks || []).find((c) => c.id === String(checkId));
  if (!check) return { error: 'No such question.' };
  const answers = { ...(plan.answers || {}) };
  const key = `${user.id}:${check.id}`;
  const mine = answers[key];
  if (mine) return { correct: mine.correct, answer: check.answer, rationale: check.rationale, repeat: true };

  const itemId = checkItems(user, plan)[check.id];
  const pending = db.byId('items', itemId);
  const verdict = grading.grade(check, answer);
  const correct = !!verdict.correct;
  const grade = curriculum.getGrade(plan.track_id, plan.grade_id);
  const levelPlan = curriculum.levelPlan(grade, plan.level);
  mastery.recordAttempt({
    userId: user.id,
    skillId: check.skill_id,
    correct,
    difficulty: check.difficulty,
    levelDifficulty: levelPlan.difficulty,
    latencyMs: Number(ms) || 0,
    itemId: `block:${plan.id}:${check.id}`,
    hintUsed: !!(pending && pending.coach_used),
  });
  const item = db.update('items', itemId, {
    user_answer: String(answer == null ? '' : answer).slice(0, 500),
    correct,
    ms: Math.max(0, Math.min(3600000, Number(ms) || 0)),
    answered_at: new Date().toISOString(),
  });
  scorecardHooks.onAnswer(user.id, item, { trackId: plan.track_id });
  answers[key] = { correct, answer: item.user_answer, item_id: item.id, at: new Date().toISOString() };
  db.update(COLLECTION, plan.id, { answers });

  const enrollment = db.findOne('enrollments', (e) => e.user_id === user.id
    && e.track_id === plan.track_id && e.grade_id === plan.grade_id);
  if (enrollment) db.update('enrollments', enrollment.id, { level_items: (enrollment.level_items || 0) + 1 });
  return { correct, answer: check.answer, rationale: check.rationale };
}

/** This learner's answers on a plan, as item ids, for the after-level read. */
function itemIdsFor(user, plan) {
  return Object.entries(plan.answers || {})
    .filter(([k]) => k.startsWith(`${user.id}:`))
    .map(([, a]) => a.item_id)
    .filter(Boolean);
}

/** Per-block time and interaction, kept on the plan for the record and the admin view. */
function recordTelemetry(user, plan, telemetry, { finished = false } = {}) {
  // eslint-disable-next-line global-require
  const levelLogs = require('./level-logs');
  const rows = levelLogs.clean(telemetry);
  const all = { ...(plan.telemetry || {}) };
  all[user.id] = { at: new Date().toISOString(), blocks: rows.map(({ index, block, ms, interactions, right, wrong }) => ({ index, block, ms, interactions, right, wrong })) };
  db.update(COLLECTION, plan.id, { telemetry: all });
  // What they did inside each block — what they tapped and typed, and what the
  // block marked right or wrong — for the after-level read.
  levelLogs.save({
    userId: user.id, trackId: plan.track_id, gradeId: plan.grade_id, level: plan.level,
    source: 'blocks', rows, finished, planId: plan.id,
  });
  if (finished) scoreFinishedLevel(user, db.byId(COLLECTION, plan.id) || plan);
  return rows;
}

/**
 * A finished block level, for the learning scorecard: its checks go through
 * the same level read as a session's questions (patterns such as recovery
 * after a miss), a block retention level is the outcome of the lesson page
 * before it, and a block lesson's own checks are the first outcome of the way
 * it was taught when it was an experiment. Before this, a block level's arm
 * was stored on the plan and never credited. Once per learner per plan.
 */
function scoreFinishedLevel(user, plan) {
  if (!plan || ((plan.scored || {})[user.id])) return;
  // eslint-disable-next-line global-require
  const scorecardHooks = require('./scorecard/hooks');
  const items = itemIdsFor(user, plan).map((id) => db.byId('items', id)).filter(Boolean);
  db.update(COLLECTION, plan.id, { scored: { ...(plan.scored || {}), [user.id]: new Date().toISOString() } });
  if (!items.length) return;
  scorecardHooks.onBlockResolved(user.id, {
    session: { track_id: plan.track_id, grade_id: plan.grade_id },
    kind: plan.kind === 'lesson' ? 'block_lesson' : 'block_retention',
    level: plan.level,
    items: items.map((it, i) => ({ ...it, index: it.index === undefined ? i : it.index })),
    trackId: plan.track_id,
    experiment: plan.user_id === user.id ? plan.experiment || null : null,
  });
}

/**
 * The plan as text for the after-level read: what the level was made of and
 * how this learner moved through it.
 */
function contentText(plan, userId) {
  if (!plan) return null;
  const tel = ((plan.telemetry || {})[userId] || {}).blocks || [];
  const lines = [`Layout: ${plan.approach || '(default)'}`];
  for (const b of plan.blocks || []) {
    const t = tel.find((x) => x.index === b.index || x.block === b.block);
    const text = JSON.stringify(b.data).replace(/[{}"\[\]]/g, ' ').replace(/\s+/g, ' ').slice(0, 260);
    lines.push(`- ${b.block}${b.purpose ? ` (${b.purpose})` : ''}${t ? ` [${Math.round(t.ms / 1000)}s on screen, ${t.interactions} interactions${t.right || t.wrong ? `, the block marked ${t.right || 0} right and ${t.wrong || 0} wrong` : ''}]` : ''}: ${text}`);
  }
  return lines.join('\n');
}

module.exports = {
  kindFor,
  isRetention,
  visibleTo,
  tailorsFor,
  mayGenerate,
  isOwner,
  aiReady,
  library,
  catalogFor,
  catalogLine,
  levelContext,
  taughtLine,
  lessonsSinceCheckpoint,
  learnerText,
  layoutSchema,
  cleanLayout,
  defaultLayout,
  fillPrompt,
  write,
  ensure,
  ensureShared,
  isWriting,
  forLevel,
  prefetchAhead,
  levelsAhead,
  publicPlan,
  servedPlan,
  findPlan,
  readyPlan,
  answerCheck,
  checkItems,
  itemIdsFor,
  recordTelemetry,
  contentText,
  CHECK_BLOCKS,
  COLLECTION,
  // Reading a model's reply, exported for tests.
  readList,
  readEntry,
  salvageObjects,
  alignAnswer,
  cleanCheck,
  // Making a level factual.
  researchFacts,
  verifyLevel,
  verifyRequest,
  verifyAndRepair,
  verifyStored,
  tooMuchRemoved,
  readVerification,
  gateOn,
  selfCheckOn,
  selfCheck,
  verifyOn,
  cascadeOn,
  thoroughOn,
  freeFirstOn,
  servable,
  // The write-ahead's check tiers (WRITE_AHEAD).
  writeAheadOn,
  tierFor,
  onTier,
  freeTier,
  sonnetAffordable,
  sonnetChecked,
  sonnetPending,
  selfCheckPassed,
  upgrade,
  planKey,
  inFlight,
  placeOf,
  whyRefused,
  LAYOUT_SYSTEM,
  FILL_SYSTEM,
};
