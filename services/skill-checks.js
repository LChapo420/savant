/**
 * Stage checks for chess, piano and basketball (staged patch
 * skills-round3/02-stage-tests; SKILL_STAGE_TESTS=on, needs SKILL_RECORD=on and
 * patch 01). When a stage's exit battery is due, the path shows a "Stage
 * check" row; the check page sits each machine-provable metric the way
 * content/skill-stage-checks.js says, grades it here, and records the sitting
 * in the skill record (services/skill-record.js), which applies the rules:
 * cold only, two different days, the belief against lucky passes, confirmed
 * estimates only.
 *
 * When is a stage's battery due? Once the learner has reached the grade's
 * Final (its lessons are done), every metric that needs a sitting (unproven,
 * lapsed, its retention test due, or its last pass over 7 days old) and can be
 * sat cold today. With the practice plan on (patch 04) the plan can call a
 * metric's test earlier, when its warm sets say it is ready. A learner may sit
 * any check from the page at any time: a warm sitting is recorded and never
 * counts, and the belief keeps retakes from proving anything by luck.
 *
 * Honesty about sources: chess answers come from the board, piano notes from
 * MIDI, the on-screen keys or the microphone (an estimate, confirmed only by a
 * second passing take), basketball counts from the learner or the camera
 * tracker (an estimate, counted only when the learner confirms it). The camera
 * and microphone never leave the device: the page sends note events and
 * counts, never sound or pictures.
 */
'use strict';

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const record = require('./skill-record');
const sc = require('./skill-coverage');
const { checkFor, titleOf } = require('../content/skill-stage-checks');
const DATA = require('../content/skill-stage-checks.data.json');
const C = require('../content/chess-board');
const P = require('../public/engine/piano/piano-core');

// Patch 05 (chess sittings), when applied: play-outs, recorded games, star
// mazes and two item kinds. Its own flag decides whether checkFor hands them out.
let CS = null;
try {
  // eslint-disable-next-line global-require
  CS = require('./skill-chess-sittings');
} catch (err) {
  if (!(err && err.code === 'MODULE_NOT_FOUND' && /skill-chess-sittings/.test(err.message))) throw err;
}
const playedHere = (how) => !!(CS && CS.HOWS.includes(how));

// The later piano and basketball sittings (PI2-PI10, BB1-BB12): new take
// builds, scene and applied items, zone counts. Its own flag decides whether
// checkFor hands them out; the parts below are used only for its definitions.
let PB = null;
try {
  // eslint-disable-next-line global-require
  PB = require('./skill-piano-bb-sittings');
} catch (err) {
  if (!(err && err.code === 'MODULE_NOT_FOUND' && /skill-piano-bb-sittings/.test(err.message))) throw err;
}
let SR = null;
try {
  // eslint-disable-next-line global-require
  SR = require('../content/piano-sight-reading');
} catch (err) {
  if (!(err && err.code === 'MODULE_NOT_FOUND' && /piano-sight-reading/.test(err.message))) throw err;
}

const OPEN_HOURS = 3; // an open sitting older than this is closed as failed
const DAY = sc.DAY;

function enabled() {
  // Default on since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md); SKILL_STAGE_TESTS=off turns it off.
  return record.enabled() && String(process.env.SKILL_STAGE_TESTS || 'on').toLowerCase() === 'on';
}

// ── small helpers ───────────────────────────────────────────────────────────

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(xs, rnd) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const cleanSan = (s) => String(s || '').replace(/[+#!?]/g, '').trim();

/** P(true rate >= bar) under a uniform prior after `makes` of `n` (Beta(1+makes, 1+n-makes)). */
function rateAtLeast(makes, n, bar) {
  // For integer a, b: P(p >= t) = P(Binomial(a+b-1, t) <= a-1) with a = makes+1, b = n-makes+1.
  const N = n + 1;
  let logC = 0;
  let sum = 0;
  for (let k = 0; k <= makes; k++) {
    if (k > 0) logC += Math.log(N - k + 1) - Math.log(k);
    sum += Math.exp(logC + k * Math.log(bar) + (N - k) * Math.log(1 - bar));
  }
  return Math.min(1, Math.max(0, sum));
}

// ── chess item builders (answers computed with content/chess-board) ─────────

const PIECES = ['N', 'B', 'R', 'Q', 'K', 'P'];
const SQ = (i) => C.sqName(i);

/** A random legal-ish position: the named white piece, both kings, a few others. */
function reachItem(rnd, piece) {
  for (let tries = 0; tries < 500; tries++) {
    const board = Array(64).fill(null);
    const free = () => { let s; do { s = Math.floor(rnd() * 64); } while (board[s]); return s; };
    let from = free();
    if (piece === 'P') { const r = 1 + Math.floor(rnd() * 5); from = r * 8 + Math.floor(rnd() * 8); if (board[from]) continue; }
    board[from] = piece;
    if (piece !== 'K') board[free()] = 'K';
    board[free()] = 'k';
    const extras = 2 + Math.floor(rnd() * 3);
    for (let e = 0; e < extras; e++) {
      const s = free();
      const r = s >> 3;
      const p = ['p', 'n', 'b', 'r', 'P', 'N'][Math.floor(rnd() * 6)];
      if ((p === 'p' || p === 'P') && (r === 0 || r === 7)) continue;
      board[s] = p;
    }
    const pos = { board, side: 'w', castling: '', ep: -1 };
    if (C.inCheck(pos, 'b') || C.inCheck(pos, 'w')) continue;
    const targets = C.legalMoves(pos).filter((m) => m.from === from).map((m) => SQ(m.to));
    const set = [...new Set(targets)].sort();
    if (!set.length) continue;
    const name = C.NAMES[piece.toLowerCase()];
    return {
      kind: 'squares',
      fen: C.toFen(pos),
      prompt: `${C.describe(pos)}\nType every square the white ${name} on ${SQ(from)} can move to, separated by spaces.`,
      key: { type: 'squares', set },
    };
  }
  throw new Error('no reach position');
}

function buildChessReach(def, rnd) {
  const items = [];
  const pieces = ['N', 'B', 'R', 'Q', 'K', 'P'];
  for (let i = 0; i < def.count; i++) items.push(reachItem(rnd, pieces[i % pieces.length]));
  return shuffle(items, rnd);
}

/** Positions sorted into check, checkmate, stalemate and none, five of each, by rejection sampling. */
function buildChessStatus(def, rnd) {
  const want = { check: Math.ceil(def.count / 4), checkmate: Math.ceil(def.count / 4), stalemate: Math.floor(def.count / 4), none: def.count - 2 * Math.ceil(def.count / 4) - Math.floor(def.count / 4) };
  const got = { check: [], checkmate: [], stalemate: [], none: [] };
  const sets = [['Q'], ['R'], ['Q', 'P'], ['R', 'R'], ['Q', 'B']];
  for (let tries = 0; tries < 200000 && Object.keys(want).some((k) => got[k].length < want[k]); tries++) {
    const board = Array(64).fill(null);
    const free = () => { let s; do { s = Math.floor(rnd() * 64); } while (board[s]); return s; };
    // Black king near an edge makes mates and stalemates common enough to sample.
    const edge = [0, 7, 56, 63, 1, 6, 8, 15, 48, 55, 57, 62][Math.floor(rnd() * 12)];
    board[edge] = 'k';
    board[free()] = 'K';
    for (const p of sets[Math.floor(rnd() * sets.length)]) {
      const s = free();
      if (p === 'P' && ((s >> 3) === 0 || (s >> 3) === 7)) continue;
      board[s] = p;
    }
    const pos = { board, side: 'b', castling: '', ep: -1 };
    if (C.inCheck(pos, 'w')) continue; // white to have just moved: white not in check
    const ksW = board.indexOf('K'); const ksB = edge;
    if (Math.abs((ksW & 7) - (ksB & 7)) <= 1 && Math.abs((ksW >> 3) - (ksB >> 3)) <= 1) continue;
    const legal = C.legalMoves(pos).length;
    const check = C.inCheck(pos, 'b');
    const cls = check ? (legal ? 'check' : 'checkmate') : (legal ? 'none' : 'stalemate');
    if (got[cls].length >= want[cls]) continue;
    got[cls].push({
      kind: 'choice',
      fen: C.toFen(pos),
      prompt: `${C.describe(pos)}\nWhich is it for Black, the side to move?`,
      choices: ['Check', 'Checkmate', 'Stalemate', 'None of these'],
      key: { type: 'choice', answer: { check: 'Check', checkmate: 'Checkmate', stalemate: 'Stalemate', none: 'None of these' }[cls] },
    });
  }
  return shuffle([].concat(got.check, got.checkmate, got.stalemate, got.none), rnd);
}

/** Mate in one, unannounced: bank mates (any mating move is right) plus the staged "no mate" positions. */
function buildChessMateOrNot(def, rnd, seed) {
  // eslint-disable-next-line global-require
  const bank = require('../content/bank');
  const items = [];
  const avoid = new Set();
  for (let i = 0; items.length < def.mates && i < 60; i++) {
    const q = bank.generate({ skillId: 'chess_mate', difficulty: 1 + (i % 5), seed: `${seed}:mate:${i}`, avoid });
    avoid.add(bank.itemKey ? bank.itemKey(q) : q.prompt);
    if (!q.fen) continue;
    const pos = C.parseFen(q.fen);
    const mates = C.legalMoves(pos).filter((m) => C.isCheckmate(C.makeMove(pos, m)));
    if (!mates.length) continue;
    items.push({ kind: 'move', fen: q.fen, prompt: `${C.describe(pos)}\nIs there a checkmate in one move? Play it, or answer "no mate".`, allow_no_mate: true, key: { type: 'mate_or_none', mate: true } });
  }
  const none = DATA.chess.mate_or_not.filter((d) => d.answer === 'no mate');
  for (const d of shuffle(none, rnd).slice(0, def.count - items.length)) {
    const pos = C.parseFen(d.fen);
    items.push({ kind: 'move', fen: d.fen, prompt: `${C.describe(pos)}\nIs there a checkmate in one move? Play it, or answer "no mate".`, allow_no_mate: true, key: { type: 'mate_or_none', mate: false } });
  }
  return shuffle(items, rnd);
}

/**
 * "Nothing to find" positions (evidence article 04, P12; CHESS_NOTHING_TO_FIND,
 * default on): the Stockfish-checked quiet pool (scripts/chess-quiet-pool-build.js),
 * or none when it is not built or the switch is off.
 */
function quietPool() {
  if (String(process.env.CHESS_NOTHING_TO_FIND || 'on').toLowerCase() === 'off') return null;
  try {
    // eslint-disable-next-line global-require
    return require('../content/chess-quiet-pool');
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}
const NOTHING = /^nothing(\s+(wins|to\s+find))?\.?$/i;

/**
 * Tactics from the Stockfish-verified pool, the motif hint left off. With
 * `nothing_share`, that share of the set (5 of 30 for CH2, 6 of 30 for CH3) is
 * quiet positions where nothing wins, and every position offers "nothing wins",
 * so the learner must decide whether a tactic is there at all, as in a game.
 */
function buildChessTactics(def, rnd) {
  // eslint-disable-next-line global-require
  const POOL = require('../content/chess-tactics-pool');
  const QUIET = def.nothing_share ? quietPool() : null;
  const quietAll = QUIET ? def.difficulties.flatMap((d) => QUIET[d] || []) : [];
  const nQuiet = quietAll.length ? Math.min(quietAll.length, Math.round(def.count * def.nothing_share)) : 0;
  const withNone = nQuiet > 0;
  const promptOf = (pos) => `${C.describe(pos)}\n${withNone ? 'Find the move that wins, or answer "nothing wins".' : 'Find the best move.'}`;
  const items = [];
  const per = Math.ceil(def.count / def.difficulties.length);
  for (const d of def.difficulties) {
    for (const q of shuffle(POOL[d] || [], rnd).slice(0, per)) {
      const pos = C.parseFen(q.fen);
      items.push({ kind: 'move', fen: q.fen, prompt: promptOf(pos), ...(withNone ? { allow_none: 'Nothing wins' } : {}), key: { type: 'move', accepts: (q.accepts || [q.answer]).map(cleanSan) } });
    }
  }
  const tactics = shuffle(items, rnd).slice(0, def.count - nQuiet);
  const quiet = shuffle(quietAll, rnd).slice(0, nQuiet).map((q) => ({ kind: 'move', fen: q.fen, prompt: promptOf(C.parseFen(q.fen)), allow_none: 'Nothing wins', key: { type: 'move_or_none', none: true } }));
  return shuffle(tactics.concat(quiet), rnd);
}

/** Mirror a position left to right (a <-> h): a king-and-pawn result does not change. */
function mirrorFen(fen) {
  const pos = C.parseFen(fen);
  const board = Array(64).fill(null);
  pos.board.forEach((p, s) => { if (p) board[(s >> 3) * 8 + (7 - (s & 7))] = p; });
  return C.toFen({ ...pos, board, castling: '', ep: -1 });
}

function buildChessKpk(def, rnd) {
  return shuffle(DATA.chess.kpk_judgement, rnd).slice(0, def.count).map((d) => {
    const fen = rnd() < 0.5 ? mirrorFen(d.fen) : d.fen;
    const pos = C.parseFen(fen);
    return { kind: 'choice', fen, prompt: `${C.describe(pos)}\nWith best play from both sides, does White win or is it a draw?`, choices: ['White wins', 'Draw'], key: { type: 'choice', answer: d.answer === 'win' ? 'White wins' : 'Draw' } };
  });
}

// ── piano and basketball item builders ──────────────────────────────────────

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function buildPianoFind(def, rnd) {
  const items = [];
  for (let i = 0; i < def.count; i++) {
    const L = LETTERS[Math.floor(rnd() * 7)];
    const middle = L === 'C' && rnd() < 0.3;
    items.push({ kind: 'key', prompt: middle ? 'Find middle C.' : `Find a ${L}.`, key: middle ? { type: 'midi', midi: 60 } : { type: 'pc', pc: PC[L] } });
  }
  return items;
}

function buildPianoEcho(def, rnd) {
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const items = [];
  for (let i = 0; i < def.count; i++) {
    const n = def.length[0] + Math.floor(rnd() * (def.length[1] - def.length[0] + 1));
    let at = Math.floor(rnd() * 5);
    const notes = [scale[at]];
    while (notes.length < n) { at = Math.max(0, Math.min(scale.length - 1, at + [-2, -1, 1, 2][Math.floor(rnd() * 4)])); notes.push(scale[at]); }
    // The notes go to the page so it can play them: an echo is heard, then played back.
    items.push({ kind: 'echo', prompt: n >= 5 ? 'Listen to the tune, then find it on the keys.' : 'Listen, then play it back.', notes, tries: def.tries, key: { type: 'echo', notes } });
  }
  return items;
}

function buildChordEar(def, rnd) {
  const items = [];
  for (let i = 0; i < def.count; i++) {
    const root = 55 + Math.floor(rnd() * 12);
    const major = rnd() < 0.5;
    items.push({ kind: 'chord_ear', prompt: 'Listen to the chord. Major or minor?', notes: [root, root + (major ? 4 : 3), root + 7], choices: ['Major', 'Minor'], key: { type: 'choice', answer: major ? 'Major' : 'Minor' } });
  }
  return items;
}

const SAFETY = [
  { prompt: 'Your ankle hurts after a jump. What do you do?', choices: ['Stop and tell an adult', 'Keep playing so the team is not short', 'Run it off', 'Stretch it hard'], answer: 'Stop and tell an adult' },
  { prompt: 'You bump heads with someone and feel dizzy. What now?', choices: ['Stop playing and tell an adult straight away', 'Sit for a minute, then carry on', 'Drink water and carry on', 'Only stop if it bleeds'], answer: 'Stop playing and tell an adult straight away' },
  { prompt: 'Something hurts when you dribble. Which is right?', choices: ['Pain means stop', 'Pain means try harder', 'Pain goes away if you ignore it', 'Only grown-ups need to stop'], answer: 'Pain means stop' },
  { prompt: 'A friend falls and cannot get up. What do you do?', choices: ['Get an adult', 'Pull them up quickly', 'Keep playing around them', 'Tell them to walk it off'], answer: 'Get an adult' },
];
function buildSafety(def, rnd) {
  return shuffle(SAFETY, rnd).slice(0, def.count).map((q) => ({ kind: 'choice', prompt: q.prompt, choices: shuffle(q.choices, rnd), key: { type: 'choice', answer: q.answer } }));
}

function buildBank(def, rnd, seed) {
  // eslint-disable-next-line global-require
  const bank = require('../content/bank');
  const items = [];
  const avoid = new Set();
  for (let i = 0; items.length < def.count && i < def.count * 4; i++) {
    const q = bank.generate({ skillId: def.skill, difficulty: def.difficulty || 2, seed: `${seed}:${i}`, avoid });
    const k = bank.itemKey ? bank.itemKey(q) : q.prompt;
    if (avoid.has(k)) continue;
    avoid.add(k);
    if (Array.isArray(q.choices) && q.choices.length) items.push({ kind: 'choice', prompt: q.prompt, choices: q.choices, key: { type: 'choice', answer: q.answer } });
    else items.push({ kind: 'text', prompt: q.prompt, key: { type: 'text', accepts: [q.answer, ...(q.accepts || [])] } });
  }
  return items;
}

const BUILDERS = {
  chess_reach: buildChessReach,
  chess_status: buildChessStatus,
  chess_mate_or_not: buildChessMateOrNot,
  chess_tactics_pool: buildChessTactics,
  chess_kpk: buildChessKpk,
  piano_find: buildPianoFind,
  piano_echo: buildPianoEcho,
  piano_chord_ear: buildChordEar,
  bb_safety: buildSafety,
  bank: buildBank,
};
if (CS) Object.assign(BUILDERS, CS.BUILDERS);
if (PB) Object.assign(BUILDERS, PB.BUILDERS);

// ── grading items ───────────────────────────────────────────────────────────

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

/** Grade one answer against its key. Returns {correct, right?, wrong?} (squares count per square). */
function gradeItem(item, answer) {
  const k = item.key;
  if (k.type === 'choice') return { correct: norm(answer) === norm(k.answer) };
  if (k.type === 'text') return { correct: k.accepts.some((a) => norm(a) === norm(answer)) };
  if (k.type === 'squares') {
    const given = [...new Set(String(answer || '').toLowerCase().match(/[a-h][1-8]/g) || [])];
    const right = given.filter((s) => k.set.includes(s)).length;
    const wrong = given.length - right;
    return { correct: right === k.set.length && !wrong, right, wrong, total: k.set.length };
  }
  if (k.type === 'move_or_none') return { correct: NOTHING.test(String(answer || '').trim()) }; // a quiet position: any move claims a win that is not there
  if (k.type === 'move' || k.type === 'mate_or_none') {
    const a = String(answer || '').trim();
    if (k.type === 'mate_or_none' && /^no\s*mate$/i.test(a)) return { correct: !k.mate };
    if (k.type === 'move' && NOTHING.test(a)) return { correct: false };
    const pos = C.parseFen(item.fen);
    const m = C.moveFromText(pos, a);
    if (!m) return { correct: false };
    if (k.type === 'mate_or_none') return { correct: k.mate && C.isCheckmate(C.makeMove(pos, m)) };
    return { correct: k.accepts.includes(cleanSan(C.san(pos, m))) };
  }
  if (k.type === 'pc' || k.type === 'midi') {
    const midi = Number(answer && answer.midi);
    if (!Number.isInteger(midi)) return { correct: false };
    return { correct: k.type === 'midi' ? midi === k.midi : ((midi % 12) + 12) % 12 === k.pc };
  }
  if (k.type === 'echo') {
    const tries = Array.isArray(answer && answer.tries) ? answer.tries.slice(0, item.tries || 1) : [];
    const same = (played) => Array.isArray(played) && played.length === k.notes.length && played.every((m, i) => ((Number(m) - k.notes[i]) % 12 + 12) % 12 === 0);
    return { correct: tries.some(same) };
  }
  if (CS) { const g = CS.gradeItem(item, answer); if (g) return g; }
  if (PB) { const g = PB.gradeItem(item, answer); if (g) return g; }
  return { correct: false };
}

/** The sitting's pass from its graded items and the rule. */
function itemsResult(def, graded) {
  const n = graded.length;
  const right = graded.filter((g) => g.correct).length;
  let pass;
  let score = n ? right / n : 0;
  if (def.rule.squares_share !== undefined) {
    const r = graded.reduce((a, g) => a + (g.right || 0), 0);
    const total = graded.reduce((a, g) => a + (g.total || 0) + (g.wrong || 0), 0);
    score = total ? r / total : 0;
    pass = score >= def.rule.squares_share;
  } else if (def.rule.right !== undefined) pass = right >= Math.min(def.rule.right, n);
  else pass = score >= def.rule.share;
  return { pass, score: Number(score.toFixed(3)), right, n };
}

// ── piano takes (piano-core, score-informed) ────────────────────────────────

function noteMidi(name, octave) { return P.noteToMidi(`${name}${octave}`); }

/** Ascending then descending, one note per beat, from note names and a start octave. */
function runFrom(names, octave, octaves = 1) {
  const up = [];
  let oct = octave;
  let prev = -1;
  for (let o = 0; o < Math.max(1, octaves); o++) {
    for (const n of names) {
      let m = noteMidi(n, oct);
      while (m <= prev) { oct += 1; m = noteMidi(n, oct); }
      up.push(m);
      prev = m;
    }
  }
  const top = up[0] + 12 * Math.max(1, octaves);
  if (names.length >= 7 || /arpeggio/.test(names.kind || '')) up.push(top);
  const down = up.slice(0, -1).reverse();
  return up.concat(down);
}

/** A target as notes with beats; `hands`: right, left (an octave lower) or both. */
function targetOf(midis, hands) {
  const out = [];
  midis.forEach((m, i) => {
    if (hands === 'left' || hands === 'both') out.push({ midi: m - 12, beat: i });
    if (hands === 'right' || hands === 'both') out.push({ midi: m, beat: i });
  });
  return out;
}

function scaleMidis(item) {
  // Fixed 2026-10-24: arpeggios now reach the top tonic and chromatic items have notes (content/piano-sight-reading.js scaleRun).
  if (SR) return SR.scaleRun(item);
  if (Array.isArray(item.midi_ascending) && item.midi_ascending.length) {
    const up = item.midi_ascending.slice();
    return up.concat(up.slice(0, -1).reverse());
  }
  const arpeggio = /arpeggio/.test(item.kind);
  const names = arpeggio ? [item.notes[0], item.notes[2], item.notes[4]] : item.notes;
  const run = runFrom(names, 4, item.octaves || 1);
  return run;
}

/** The parts of a take sitting, each a target the learner plays once (twice on a microphone). */
function takeParts(def, rnd, userId, ctx) {
  if (PB) { const own = PB.takeParts(def, rnd, ctx || {}); if (own) return own; }
  if (def.build === 'beat') {
    return [{ label: `Tap along for ${def.beats} beats`, tempo: def.tempo, any_key: true, count_in: 4, target: Array.from({ length: def.beats }, (_, i) => ({ midi: 60, beat: i })) }];
  }
  if (def.build === 'pattern') {
    const up = [0, 2, 4, 5, 7].map((x) => 60 + x);
    const run = up.concat(up.slice(0, -1).reverse());
    return def.hands.map((h) => ({ label: `C five-finger pattern, ${h} hand`, tempo: def.tempo, hands: h, names: run.map((m) => P.midiToName(h === 'left' ? m - 12 : m)), target: targetOf(run, h) }));
  }
  if (def.build === 'scale') {
    const battery = DATA.piano.technique.find((b) => b.stage === def.battery);
    const pool = def.item ? battery.items.filter((x) => x.item === def.item) : battery.items;
    const chosen = shuffle(pool, rnd).slice(0, def.pick || 1);
    const parts = [];
    for (const item of chosen) {
      const run = scaleMidis(item);
      // Fixed 2026-10-25: names spelled from the scale (D harmonic minor shows Bb4, not A#4).
      const spelled = SR && SR.scaleNames ? SR.scaleNames(item, run) : [];
      const names = run.map((m, i) => spelled[i] || P.midiToName(m));
      for (const h of def.hands) parts.push({ label: `${item.item}${h === 'both' ? ', hands together' : `, ${h} hand`}`, tempo: def.tempo, hands: h, mic_hands: 'right', names, target: targetOf(run, h), evenness: true });
    }
    return parts;
  }
  if (def.build === 'cadence') {
    const key = def.keys[Math.floor(rnd() * def.keys.length)];
    const order = { C: ['C', 'F', 'G7', 'C'], G: ['G', 'C', 'D7', 'G'], F: ['F', 'Bb', 'C7', 'F'] }[key];
    const chords = order.map((sym) => P.chordMidis(sym).midis);
    return [{ label: `I-IV-V7-I in ${key} major`, tempo: 60, chords: order, target_chords: chords }];
  }
  if (def.build === 'song') {
    // eslint-disable-next-line global-require
    const songs = require('../content/piano-songs');
    const pool = songs.SONGS.filter((s) => s.grade === def.grade);
    const chosen = shuffle(pool, rnd).slice(0, def.pieces);
    return chosen.map((song) => {
      const hands = def.hands === 'both' && song.lh ? 'both' : 'right';
      const parts = P.songParts(song, hands);
      return { label: `${song.title}${hands === 'both' ? ', hands together' : ', right hand'}`, song: song.id, tempo: song.tempo, hands, target: parts.target, beats_per_bar: song.beatsPerBar };
    });
  }
  return [];
}

/** The played notes, cleaned: key numbers, times, sources; near-simultaneous notes in pitch order. */
function cleanPlayed(list) {
  if (!Array.isArray(list) || !list.length || list.length > 3000) return { error: 'No notes were sent.' };
  const notes = [];
  for (const x of list) {
    const midi = Number(x && x.midi);
    const time = Number(x && x.time);
    if (!Number.isInteger(midi) || midi < 0 || midi > 127 || !Number.isFinite(time)) return { error: 'A note was not a key number with a time.' };
    const source = ['midi', 'mic', 'screen', 'computer', 'tap'].includes(x.source) ? x.source : 'screen';
    notes.push({ midi, time, velocity: Number(x.velocity) || undefined, source, confidence: Number(x.confidence) || 0 });
  }
  notes.sort((a, b) => a.time - b.time);
  // A chord or two hands together arrive a few milliseconds apart in any order.
  for (let i = 0; i < notes.length;) {
    let j = i + 1;
    while (j < notes.length && notes[j].time - notes[i].time <= 60) j++;
    const group = notes.slice(i, j).sort((a, b) => a.midi - b.midi);
    notes.splice(i, j - i, ...group);
    i = j;
  }
  return { notes };
}

/** Which source word a take is: midi, mic or on-screen (the worst one in it). */
function takeSource(notes) {
  if (notes.some((n) => n.source === 'mic')) return 'mic';
  if (notes.every((n) => n.source === 'midi')) return 'midi';
  if (notes.every((n) => n.source === 'tap')) return 'tap';
  return 'on-screen';
}

/** Score one take of one part against the rule. */
function scoreTake(def, part, played, origin = null, extra = {}) {
  const clean = cleanPlayed(played);
  if (clean.error) return clean;
  let notes = clean.notes;
  const source = takeSource(notes);
  if (PB && part.pedal) return PB.scorePart(def, part, notes, { source }, extra || {});
  const mic = source === 'mic';
  const rule = def.rule;
  if (part.target_chords) {
    // Chords: onsets grouped, each group's pitch classes against the chord's.
    const groups = [];
    for (const n of notes) {
      const g = groups[groups.length - 1];
      if (g && n.time - g.time <= 250) g.midis.push(n.midi); else groups.push({ time: n.time, midis: [n.midi] });
    }
    const right = part.target_chords.filter((ch, i) => groups[i] && P.samePitchClasses(groups[i].midis, ch)).length;
    const share = right / part.target_chords.length;
    return { source, pass: share >= rule.chords && groups.length === part.target_chords.length, notes: Number(share.toFixed(2)), chords_right: right, chords: part.target_chords.length };
  }
  let target = part.target;
  if (mic && part.mic_hands && part.hands === 'both') target = part.target.filter((t, i, a) => i === a.length - 1 || t.beat !== a[i + 1].beat); // the upper (right-hand) line
  if (part.any_key) notes = notes.map((n) => ({ ...n, midi: 60 }));
  // A beat is timed from the click (the page sends when beat 0 sounded); a
  // piece or a scale from the first note, so a late start is not a wrong one.
  const timedFrom = part.any_key && Number.isFinite(Number(origin)) && origin !== null ? { origin: Number(origin) } : {};
  const r = P.scorePerformance(target, notes, { tempo: part.tempo, octaveFree: mic, ...timedFrom });
  const beatMs = 60000 / part.tempo;
  // A stop: a gap between consecutive matched notes over two beats more than the score asks.
  let stops = 0;
  const pairs = P.align(target, notes, { octaveFree: mic }).filter((x) => x.t !== null && x.p !== null);
  for (let k = 1; k < pairs.length; k++) {
    const want = (target[pairs[k].t].beat - target[pairs[k - 1].t].beat) * beatMs;
    const got = notes[pairs[k].p].time - notes[pairs[k - 1].p].time;
    if (got - want > 2 * beatMs) stops++;
  }
  const notesBar = mic && rule.notes_mic !== undefined ? rule.notes_mic : rule.notes;
  const onBeat = r.timing ? r.timing.onBeatShare : 0;
  const checks = [];
  if (notesBar !== undefined) checks.push(r.noteAccuracy >= notesBar - 1e-9);
  if (rule.on_beat !== undefined) checks.push(onBeat >= rule.on_beat);
  if (rule.cv !== undefined && part.evenness) checks.push(!!r.evenness && r.evenness.cv <= rule.cv);
  if (rule.no_stops) checks.push(stops === 0);
  if (rule.completes) checks.push(r.missed.length <= Math.floor(target.length * 0.15) && pairs.length && pairs[pairs.length - 1].t >= target.length - 2);
  const base = {
    source,
    pass: checks.every(Boolean),
    notes: r.noteAccuracy,
    on_beat: Number(onBeat.toFixed(2)),
    cv: r.evenness ? r.evenness.cv : null,
    stops,
    estimated: r.estimated,
  };
  if (PB && part.dynamics) return PB.scorePart(def, part, notes, base, extra || {});
  return base;
}

// ── the open sitting ────────────────────────────────────────────────────────

function itemsForPage(items) {
  return items.map((it, index) => {
    const { key, ...rest } = it;
    return { index, ...rest };
  });
}

/** What the page needs to run a sitting (never an answer key). */
function sittingForPage(open) {
  if (!open) return null;
  const base = { metric: open.metric_id, how: open.how, started_at: new Date(open.started_at).toISOString(), cold: open.cold, cold_at: open.cold_at || null };
  if (open.how === 'items') return { ...base, items: itemsForPage(open.items), answered: open.answers.map((a) => a !== null) };
  if (open.how === 'take') return { ...base, parts: takePartsForPage(open.parts), takes: open.takes };
  if (open.how === 'puzzles') return { ...base, cut: open.cut, rd: open.rd, min: open.min, done: open.done || 0 };
  if (playedHere(open.how)) return { ...base, ...CS.forPage(open) };
  return base;
}

/** A take's parts as the page sees them: a part played from memory sends no notes. */
function takePartsForPage(parts) {
  return parts.map((p, i) => ({
    index: i, label: p.label, tempo: p.tempo, hands: p.hands || null, names: p.memory ? null : p.names || null, song: p.memory ? null : p.song || null, chords: p.chords || null, any_key: !!p.any_key, count_in: p.count_in || 4,
    target: p.chords || p.memory ? null : (p.target || []).map((t) => ({ midi: t.midi, beat: t.beat })),
    score: p.score || null, pedal: !!p.pedal, memory: !!p.memory, dynamics: !!p.dynamics, level: p.level || null,
  }));
}

function closeStale(userId, row, now) {
  if (!row || !row.open) return null;
  const hours = (CS && CS.openHours(row.open)) || OPEN_HOURS; // recorded games stay open for days
  if (now - row.open.started_at < hours * 3600 * 1000) return null;
  // Left open: counted as a sitting that did not pass, at the time it began.
  const open = row.open;
  row.open = null;
  db.update(record.COLLECTION, row.id, { open: null });
  return record.sit(userId, { subject: row.subject, metricId: row.metric_id, pass: false, source: open.source || 'board', kind: open.kind, at: open.started_at, detail: { left_open: true } });
}

/** Which kind of test a sitting is, from the metric's state. */
function sittingKind(row, stage, now) {
  if (!row || row.status === 'unproven' || row.status === 'lapsed') return 'stage_test';
  if (row.status === 'proven' && stage.retention_days && now - row.proven_at >= stage.retention_days * DAY) return 'retention_test';
  return 'stands_test';
}

/** Open (or resume) a sitting of one metric's stage check. */
function start(userId, enrollment, metricId, now = Date.now()) {
  const def0 = record.metricDef(enrollment.track_id, metricId);
  const stage = record.stageFor(enrollment.track_id, enrollment.grade_id);
  if (!def0 || !stage || def0.stage.id !== stage.id) return { status: 404, error: 'That check is not part of this stage.' };
  if (!def0.metric.source.provable) return { status: 409, error: 'This one is attested, not machine-checked.' };
  const def = checkFor(metricId);
  if (def.how === 'not_wired') return { status: 409, error: `This check is not built yet: ${def.needs}.` };
  if (def.how === 'count') return { status: 400, error: 'Counts are logged in one step.' };
  let row = record.ensureRow(userId, enrollment.track_id, metricId);
  closeStale(userId, row, now);
  row = record.rowFor(userId, enrollment.track_id, metricId);
  if (row.open) return { sitting: sittingForPage(row.open), resumed: true };
  const seed = (userId * 7919 + now) >>> 0;
  const rnd = rngFrom(seed);
  const open = { metric_id: metricId, how: def.how, started_at: now, cold: sc.isCold(row, now), cold_at: new Date(record.coldAt(row, now)).toISOString(), kind: sittingKind(row, stage, now), source: def.source || null };
  if (def.how === 'items') {
    // The owner's base product has no "nothing to find" positions (P12; config/owner.js).
    // eslint-disable-next-line global-require
    const buildDef = def.nothing_share && require('../config/owner').ownerBase(userId) ? { ...def, nothing_share: 0 } : def;
    open.items = BUILDERS[def.build](buildDef, rnd, `${userId}:${metricId}:${now}`);
    open.answers = open.items.map(() => null);
  } else if (def.how === 'take') {
    if (PB && def.build === 'learn_piece') {
      // A new piece to learn first: kept on the record for its window, then sat cold.
      const a = PB.assignment(def, row, now, rnd);
      if (a.fresh) {
        db.update(record.COLLECTION, row.id, { assignment: a.assignment });
        return { learning: PB.assignmentForPage(a.assignment), resumed: false };
      }
      row.assignment = a.assignment;
    }
    open.parts = takeParts(def, rnd, userId, { gradeId: enrollment.grade_id, row, now });
    if (!open.parts.length) return { status: 409, error: 'There is nothing to play for this check yet.' };
    open.takes = open.parts.map(() => []);
    const levels = [...new Set(open.parts.map((p) => p.level).filter(Boolean))];
    if (levels.length) open.detail = { level: levels.join(',') };
    const fresh = open.parts.map((p) => p.excerpt).filter(Boolean);
    if (fresh.length) db.update(record.COLLECTION, row.id, { seen_excerpts: [...(row.seen_excerpts || []), ...fresh].slice(-300) });
  } else if (def.how === 'puzzles') {
    Object.assign(open, { cut: def.cut, rd: def.rd, min: def.min });
  } else if (playedHere(def.how)) {
    const extra = CS.open(def, rnd, userId, metricId, now);
    if (extra.error) return { status: 409, error: extra.error };
    Object.assign(open, extra);
  }
  db.update(record.COLLECTION, row.id, { open });
  return { sitting: sittingForPage(open), resumed: false };
}

function openRow(userId, enrollment, metricId) {
  const row = record.rowFor(userId, enrollment.track_id, metricId);
  return row && row.open && row.open.metric_id === metricId ? row : null;
}

/** One answer in an items sitting. No verdict before the end: it is a test. */
function answer(userId, enrollment, metricId, { index, answer: given, source, ms }) {
  const row = openRow(userId, enrollment, metricId);
  if (!row || row.open.how !== 'items') return { status: 404, error: 'No check is open.' };
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= row.open.items.length) return { status: 400, error: 'No such question.' };
  if (row.open.answers[i] !== null) return { status: 409, error: 'Already answered.' };
  const item = row.open.items[i];
  const graded = gradeItem(item, given);
  const time = Number(ms);
  const open = { ...row.open, answers: row.open.answers.map((a, k) => (k === i ? { given: typeof given === 'object' ? given : String(given).slice(0, 200), ...graded, source: source || null, ...(Number.isFinite(time) && time > 0 && time < 600000 ? { ms: Math.round(time) } : {}) } : a)) };
  db.update(record.COLLECTION, row.id, { open });
  return { answered: open.answers.filter((a) => a !== null).length, total: open.items.length };
}

/** One take of one part of a piano sitting. */
function take(userId, enrollment, metricId, { part, played, origin, pedal }) {
  const row = openRow(userId, enrollment, metricId);
  if (!row || row.open.how !== 'take') return { status: 404, error: 'No check is open.' };
  const i = Number(part);
  const p = row.open.parts[i];
  if (!p) return { status: 400, error: 'No such part.' };
  const def = checkFor(metricId);
  const scored = scoreTake(def, p, played, origin, { pedal });
  if (scored.error) return { status: 400, error: scored.error };
  const takes = row.open.takes.map((t, k) => (k === i ? [...t, scored].slice(0, 4) : t));
  db.update(record.COLLECTION, row.id, { open: { ...row.open, takes } });
  return { part: i, ...scored, takes: takes[i].length };
}

const moving = new Set(); // one move at a time per sitting: the engines answer asynchronously

/**
 * One move in a sitting played on the server (patch 05: play-outs, games,
 * mazes), or giving up the current one. The reply comes from the tables,
 * Stockfish or the band's bot.
 */
async function playMove(userId, enrollment, metricId, body, now = Date.now(), giveUp = false) {
  if (!CS || !CS.enabled()) return { status: 404, error: 'No check is open.' };
  const row = openRow(userId, enrollment, metricId);
  if (!row || !playedHere(row.open.how)) return { status: 404, error: 'No check is open.' };
  const def = CS.defFor(metricId);
  if (moving.has(row.id)) return { status: 409, error: 'One move at a time.' };
  moving.add(row.id);
  try {
    const open = JSON.parse(JSON.stringify(row.open));
    const out = giveUp ? await CS.resign(open, def, now) : await CS.move(open, def, body || {}, now);
    if (out && out.error && !out.illegal) return out;
    db.update(record.COLLECTION, row.id, { open }); // an illegal attempt is kept too (games count them)
    if (out.error) return out;
    return { ...out, done: CS.result(open, def).done };
  } finally {
    moving.delete(row.id);
  }
}
const resign = (userId, enrollment, metricId, now = Date.now()) => playMove(userId, enrollment, metricId, null, now, true);

/** The piano sitting's result: first take of every part passes; a microphone needs a second passing take of each. */
function takeResult(open) {
  const firsts = open.takes.map((t) => t[0]);
  const done = firsts.every(Boolean);
  const pass = done && firsts.every((t) => t.pass);
  const sources = firsts.filter(Boolean).map((t) => t.source);
  const worst = sources.includes('mic') ? 'mic' : sources.includes('on-screen') ? 'on-screen' : sources.includes('tap') ? 'tap' : 'midi';
  const confirmed = worst === 'mic' ? open.takes.every((t) => t.length >= 2 && t[0].pass && t[1].pass) : false;
  const score = firsts.filter(Boolean).reduce((a, t) => a + (t.notes || 0), 0) / Math.max(1, firsts.filter(Boolean).length);
  return { done, pass, source: worst, confirmed, score: Number(score.toFixed(3)), n: firsts.length, detail: open.detail || null };
}

/**
 * The source of an items sitting: the check's own (board, tap, items) or, for
 * keys found and echoes played, the worst input used: any microphone answer
 * makes it a microphone sitting (an estimate, not confirmed here), all MIDI is
 * MIDI, anything else the on-screen keys.
 */
function itemSource(open) {
  if (open.source) return open.source;
  const used = open.answers.filter(Boolean).map((a) => a.source);
  if (used.includes('mic')) return 'mic';
  if (used.length && used.every((x) => x === 'midi')) return 'midi';
  return 'on-screen';
}

/** Close a sitting: grade it and record it in the skill record. */
function finish(userId, enrollment, metricId, now = Date.now()) {
  const row = openRow(userId, enrollment, metricId);
  if (!row) return { status: 404, error: 'No check is open.' };
  const open = row.open;
  const def = checkFor(metricId);
  let res;
  if (open.how === 'items') {
    const graded = open.answers.map((a) => a || { correct: false });
    res = { ...itemsResult(def, graded), source: itemSource(open) };
    const times = open.answers.filter((a) => a && a.ms).map((a) => a.ms).sort((x, y) => x - y);
    if (def.rt && times.length) res.detail = { median_ms: times[Math.floor((times.length - 1) / 2)], answered_with_time: times.length };
    // Decision scenes keep each item's mark (1/0, in the order served) for their split-half
    // reliability (services/skill-scene-reliability.js, evidence article 04 P5).
    if (def.build === 'bb_scenes') res.detail = { ...(res.detail || {}), marks: graded.map((a) => (a.correct ? 1 : 0)) };
    res.review = open.items.map((it, i) => ({ prompt: it.prompt, given: open.answers[i] ? open.answers[i].given : null, correct: !!(open.answers[i] && open.answers[i].correct), answer: (CS && CS.answerText(it)) || (PB && PB.answerText(it)) || it.key.answer || (it.key.accepts && it.key.accepts[0]) || (it.key.set && it.key.set.join(' ')) || (it.key.type === 'mate_or_none' && !it.key.mate ? 'no mate' : null) || (it.key.type === 'move_or_none' ? 'nothing wins' : null) }));
  } else if (open.how === 'take') {
    res = takeResult(open);
    if (!res.done) return { status: 409, error: 'Play every part first.' };
  } else if (open.how === 'puzzles') {
    const started = new Date(open.started_at).toISOString();
    const done = db.find('chess_puzzle_attempts', (a) => a.user_id === userId && a.rated && a.status !== 'open' && String(a.started_at) >= started).length;
    if (done < open.min) return { status: 409, error: `${open.min - done} more rated puzzle${open.min - done === 1 ? '' : 's'} first.`, done };
    const r = db.findOne('chess_ratings', (x) => x.user_id === userId) || { rating: 0, rd: 999 };
    res = { pass: r.rating >= open.cut && r.rd <= open.rd, score: Math.round(r.rating), n: done, source: 'board', detail: { rating: Math.round(r.rating), rd: Math.round(r.rd), cut: open.cut } };
  } else if (playedHere(open.how)) {
    res = CS.result(open, CS.defFor(metricId));
    if (!res.done) return { status: 409, error: open.how === 'games' ? 'Play every game first.' : 'Finish every one first.' };
  }
  db.update(record.COLLECTION, row.id, { open: null });
  const out = record.sit(userId, { subject: enrollment.track_id, metricId, pass: res.pass, source: res.source, confirmed: res.confirmed === true, kind: open.kind, score: res.score, n: res.n, at: open.started_at, detail: res.detail || null });
  return { result: { pass: res.pass, score: res.score, n: res.n, right: res.right, source: res.source, confirmed: !!res.confirmed, counted: out.counted, why: out.why, proved: out.proved, status: out.row.status, review: res.review || null, detail: res.detail || null } };
}

/**
 * A count's result against the check's rule, without recording it: {pass,
 * score, n, note, baseline?} or {error}. `baseline` is the learner's own first
 * count for the rules that measure growth (null when there is none yet).
 */
function countResult(def, body, baseline) {
  if (PB) { const z = PB.countResult(def, body, rateAtLeast); if (z) return z; }
  const b = body || {};
  const num = (v, lo, hi) => { const x = Number(v); return Number.isInteger(x) && x >= lo && x <= hi ? x : null; };
  const read = (obj) => {
    const out = {};
    for (const [name, , lo, hi] of def.fields) { const v = num(obj && obj[name], lo, hi); if (v === null) return null; out[name] = v; }
    if (out.makes !== undefined && out.attempts !== undefined && out.makes > out.attempts) return null;
    return out;
  };
  const hands = def.hands ? { left: read(b.left), right: read(b.right) } : null;
  const one = def.hands ? null : read(b);
  if (def.hands ? !(hands.left && hands.right) : !one) return { error: 'Those numbers do not add up.' };
  const rule = def.rule;
  const values = hands || one;
  if (rule.rate !== undefined) {
    const sides = def.hands ? ['left', 'right'].map((h) => hands[h]) : [one];
    const short = sides.some((x) => x.attempts < (def.min_n || 1));
    const ps = sides.map((x) => rateAtLeast(x.makes, x.attempts, rule.rate));
    return { pass: !short && ps.every((p) => p >= rule.conf), score: Number(Math.min(...ps).toFixed(3)), n: sides.reduce((a, x) => a + x.attempts, 0), note: short ? `at least ${def.min_n}${def.hands ? ' each hand' : ''} for a sitting to pass` : null, values };
  }
  if (rule.ratio !== undefined) {
    const r = one.strong ? one.weak / one.strong : 0;
    return { pass: one.strong > 0 && r >= rule.ratio, score: Number(r.toFixed(3)), n: one.strong + one.weak, note: null, values };
  }
  if (rule.logged !== undefined) {
    return { pass: one.attempts >= rule.logged, score: one.attempts ? Number((one.makes / one.attempts).toFixed(3)) : 0, n: one.attempts, note: one.attempts < rule.logged ? `log ${rule.logged} or more` : null, values };
  }
  const value = one.done !== undefined ? one.done : one.makes;
  if (baseline === null || baseline === undefined) return { pass: null, baseline: null, value, n: value, values };
  const bar = baseline * (1 + (rule.growth || rule.baseline || 0));
  return { pass: value >= bar && value > 0, score: baseline ? Number((value / baseline).toFixed(3)) : null, n: value, note: `your baseline is ${baseline}${rule.growth ? `; ${Math.ceil(bar)} or more passes` : ''}`, values, baseline };
}

/** A basketball count, recorded in one step. */
function count(userId, enrollment, metricId, body, now = Date.now()) {
  const def0 = record.metricDef(enrollment.track_id, metricId);
  const stage = record.stageFor(enrollment.track_id, enrollment.grade_id);
  if (!def0 || !stage || def0.stage.id !== stage.id) return { status: 404, error: 'That check is not part of this stage.' };
  const def = checkFor(metricId);
  if (def.how !== 'count') return { status: 400, error: 'This check is not a count.' };
  // Youth load caps (evidence article 04 P7, SKILL_LOAD_CAPS): no court sitting on a
  // rest day or once the week's basketball hours are used. Not for the owner (onFor).
  try {
    // eslint-disable-next-line global-require
    const dose = require('./skill-dose');
    const blocked = dose.onFor(userId) && dose.loadBlock(userId, enrollment, metricId, now);
    if (blocked) return { status: 409, error: blocked.error };
  } catch (err) { if (!(err && err.code === 'MODULE_NOT_FOUND')) throw err; }
  const b = body || {};
  const row = record.ensureRow(userId, enrollment.track_id, metricId);
  const res = countResult(def, b, row.baseline);
  if (res.error) return { status: 400, error: res.error };
  if (res.pass === null) {
    db.update(record.COLLECTION, row.id, { baseline: res.value, baseline_at: new Date(now).toISOString() });
    return { result: { baseline: res.value, pass: null, counted: false, why: 'your first count sets your own baseline; it is not a sitting', status: row.status } };
  }
  const camera = b.source === 'camera';
  const source = camera ? 'camera' : 'count';
  const confirmed = camera && b.confirmed === true;
  const out = record.sit(userId, { subject: enrollment.track_id, metricId, pass: res.pass, source, confirmed, kind: sittingKind(row, stage, now), score: res.score, n: res.n, at: now, detail: { ...res.values, note: res.note } });
  return { result: { pass: res.pass, score: res.score, n: res.n, note: res.note, source, confirmed, counted: out.counted, why: out.why, proved: out.proved, status: out.row.status, zones: (res.values && res.values.zones) || null } };
}

// ── what the page and the path see ──────────────────────────────────────────

/** Has the learner reached the grade's Final, so the stage's lessons are done? */
function atFinal(enrollment) {
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return false;
  const final = (grade.levels.find((l) => l.kind === 'graduation') || {}).level;
  return enrollment.status === 'graduated' || (final && enrollment.current_level >= final);
}

/** Metrics the practice plan (patch 04) calls a cold test for today, when it is applied and on. */
function planned(userId, enrollment, now) {
  try {
    // eslint-disable-next-line global-require
    const dose = require('./skill-dose');
    return dose.enabled() ? dose.scheduledTests(userId, enrollment, now) : [];
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return [];
    throw err;
  }
}

/** The stage's checks: each metric with its sitting, whether it is due, and when it is cold next. */
function overview(userId, enrollment, now = Date.now()) {
  const view = record.stageView(userId, enrollment, now);
  if (!view) return null;
  const battery = atFinal(enrollment);
  const plan = new Set(planned(userId, enrollment, now));
  // Youth load caps (SKILL_LOAD_CAPS): on a rest day, or once the week's hours are
  // used, court work is refused (count() below). The page says so before the form,
  // as the practice page does, instead of after "Record it".
  let dose = null;
  try {
    // eslint-disable-next-line global-require
    dose = require('./skill-dose');
    if (!dose.onFor(userId)) dose = null;
  } catch { dose = null; }
  const blockOf = (id) => { try { return dose ? dose.loadBlock(userId, enrollment, id, now) : null; } catch { return null; } };
  let loadNote = null;
  const rows = view.metrics.map((m) => {
    const def = checkFor(m.id);
    const row = record.rowFor(userId, enrollment.track_id, m.id);
    const needs = m.provable && (m.status === 'unproven' || m.status === 'lapsed' || (m.status === 'proven' && m.retention_due_at && Date.parse(m.retention_due_at) <= now) || m.stale);
    const wired = m.provable && def.how !== 'not_wired';
    const blocked = wired && def.how === 'count' ? blockOf(m.id) : null;
    if (blocked && !loadNote) loadNote = { note: blocked.error, rest_day: !!(blocked.load && blocked.load.rest_day) };
    return {
      ...m,
      title: titleOf(m.metric),
      how: m.provable ? def.how : 'attest',
      wired,
      says: def.says || null,
      needs_build: def.how === 'not_wired' ? def.needs : null,
      gap: def.gap || null,
      minutes: def.minutes || null,
      fields: def.how === 'count' ? def.fields.map(([name, label, lo, hi]) => ({ name, label, min: lo, max: hi })) : null,
      choice: def.how === 'count' && def.choice ? { name: def.choice.name, label: def.choice.label, options: def.choice.options.map(([value, label]) => ({ value, label })) } : null,
      learn: def.build === 'learn_piece' && PB ? { piece: row && row.assignment && now - row.assignment.assigned_at < def.window_days * DAY ? PB.assignmentForPage(row.assignment) : null, window_days: def.window_days } : null,
      hands: def.how === 'count' ? !!def.hands : null,
      camera_ok: def.how === 'count' ? record.listedWords({ source: { raw: m.source } }).includes('camera') : false,
      baseline: row && row.baseline !== undefined ? row.baseline : null,
      needs_sitting: !!needs,
      // Not "ready now" while court work is refused today.
      due: !!(needs && wired && m.cold_now && (battery || plan.has(m.id)) && !blocked),
      planned: plan.has(m.id),
      open: row && row.open ? sittingForPage(row.open) : null,
      court_block: blocked ? { note: blocked.error, rest_day: !!(blocked.load && blocked.load.rest_day) } : null,
    };
  });
  // eslint-disable-next-line global-require
  const twoDay = require('../content/skill-learner-text').twoDayRule(userId);
  return { ...view, battery_open: battery, checks: rows, due: rows.filter((r) => r.due).map((r) => r.id), two_day_rule: twoDay, load: loadNote };
}

/** The path's "Stage check" row. */
function pathNode(userId, enrollment) {
  if (!enabled()) return null;
  const o = overview(userId, enrollment);
  if (!o) return null;
  const provable = o.checks.filter((c) => c.provable);
  const proven = provable.filter((c) => c.status === 'proven' || c.status === 'retained').length;
  const wired = provable.filter((c) => c.wired).length;
  const href = `/stage-check?enrollment=${enrollment.id}`;
  const waiting = o.checks.filter((c) => c.wired && c.needs_sitting && !c.cold_now).map((c) => Date.parse(c.cold_at));
  const next = waiting.length ? new Date(Math.min(...waiting)) : null;
  const tally = `${proven} of ${provable.length} measured skills proven${wired < provable.length ? `; ${provable.length - wired} not checkable here yet` : ''}`;
  if (o.due.length) {
    return { kind: 'stage_check', badge: 'Check', title: 'Stage check', kind_label: `${o.due.length} ready`, detail: `${o.due.length} check${o.due.length === 1 ? '' : 's'} ready now, cold. ${tally}.`, href, action: 'Sit the checks', next: true };
  }
  if (provable.length && proven === provable.length) {
    return { kind: 'stage_check', badge: 'Check', title: 'Stage check', kind_label: 'Proven', detail: `${tally}.`, href, action: 'See the record', done: true };
  }
  const when = next ? `Next check ready ${next.toISOString().slice(0, 16).replace('T', ' ')} UTC.` : o.battery_open ? '' : 'Opens at the Final; any check can be sat early.';
  return { kind: 'stage_check', badge: 'Check', title: 'Stage check', kind_label: o.battery_open ? 'Due' : 'Later', detail: `${tally}. ${when}`.trim(), href, action: 'See the checks' };
}

module.exports = {
  enabled,
  rateAtLeast,
  gradeItem,
  itemsResult,
  scoreTake,
  cleanPlayed,
  takeParts,
  takePartsForPage,
  BUILDERS,
  mirrorFen,
  start,
  answer,
  take,
  finish,
  move: playMove,
  resign,
  count,
  countResult,
  itemsForPage,
  overview,
  pathNode,
  atFinal,
  sittingForPage,
};
