/**
 * Chess stage checks that need the server to play: play-outs against perfect
 * defence, recorded games against the measured bots, star mazes, and two item
 * kinds (setting up the board, typing a whole line). Staged patch
 * skills-round3/05-chess-sittings; SKILL_CHESS_SITTINGS=on, on top of
 * SKILL_RECORD=on (01) and SKILL_STAGE_TESTS=on (02). The definitions are
 * content/skill-chess-sittings.js; services/skill-checks.js opens, grades and
 * records the sittings and hands the new kinds here.
 *
 * Why these can prove a skill: the server holds the board. Every move the
 * learner makes is checked with content/chess-board, the opponent's reply is
 * made here, and the verdict comes from a machine:
 *   K+Q v K, K+R v K, K+P v K   the endgame tables (content/chess-endgame-tables.js):
 *                               the defence is perfect (the longest mate, or a
 *                               drawing move), and "won" or "held" is the table's word;
 *   Lucena, Philidor            Stockfish on our server defends and judges
 *                               (a separate program, never sent to a browser);
 *   games                       the band's bot plays, the server keeps the clock,
 *                               and Stockfish analyses each game when it ends:
 *                               blunders (a move that loses 20% or more of the
 *                               winning chances, Lichess's formula), pieces left
 *                               hanging (a static exchange that loses 2 pawns or
 *                               more, which Stockfish confirms), accuracy;
 *   mazes                       the par is the fewest moves, by breadth-first search.
 *
 * Nothing leaves the device but moves: no camera, no microphone.
 */
'use strict';

const db = require('../config/db');
const record = require('./skill-record');
const C = require('../content/chess-board');
const TB = require('../content/chess-endgame-tables');
const { CHECKS, GAMES } = require('../content/skill-chess-sittings');

let DATA = null;
const data = () => { if (!DATA) DATA = require('../content/skill-chess-sittings.data.json'); return DATA; };

const HOWS = ['playout', 'games', 'maze'];
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** On when the stage checks are (patch 02's own rule); default on since 2026-10-24 (owner approved,
 * LIVE-CHANGES-2026-10-24.md), SKILL_CHESS_SITTINGS=off turns it off. */
function enabled() {
  if (String(process.env.SKILL_CHESS_SITTINGS || 'on').toLowerCase() !== 'on') return false;
  // eslint-disable-next-line global-require
  return require('./skill-checks').enabled();
}

// ── engines (replaceable in tests) ──────────────────────────────────────────

const real = {
  stockfish: () => {
    // eslint-disable-next-line global-require
    const E = require('./chess-engine');
    return E.available('stockfish') ? (fen, o) => E.analyse(fen, { engine: 'stockfish', slot: 'sittings', options: { Threads: 1, Hash: 32 }, ...o }) : null;
  },
  maia: () => {
    // eslint-disable-next-line global-require
    const M = require('./chess-maia');
    return M.available() ? M : null;
  },
};
let engines = { ...real };
/** Tests: replace the engines ({ stockfish: () => fn|null, maia: () => obj|null }); no argument restores them. */
function setEngines(e) { engines = e ? { ...real, ...e } : { ...real }; }
const stockfish = () => engines.stockfish();
const maiaEngine = () => engines.maia();

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (xs, rnd) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const posKey = (pos) => C.toFen(pos).split(' ').slice(0, 4).join(' ');

// ── opponents for recorded games ────────────────────────────────────────────

/** The measured opponents this server can field, lowest rating first. */
function opponents() {
  const list = (data().opponents && data().opponents.list) || [];
  const maia = !!maiaEngine();
  return list.filter((o) => o.engine === 'bot' || (o.engine === 'maia' && maia));
}

/** The opponents for a band: rated inside it, or the nearest within 100 points; [] when there are none. */
function bandOpponents(band) {
  const list = opponents();
  if (!list.length) return [];
  if (band === 'lowest') return [list[0]];
  const [lo, hi] = band;
  const inside = list.filter((o) => o.rating >= lo && o.rating <= hi);
  if (inside.length) return inside;
  const dist = (o) => (o.rating < lo ? lo - o.rating : o.rating - hi);
  const near = list.filter((o) => dist(o) <= 100).sort((a, b) => dist(a) - dist(b));
  return near.slice(0, 1);
}

/** Why a check cannot be sat on this server right now, or null. */
function unavailable(def) {
  if (def.how === 'playout' && def.build === 'rook' && !stockfish()) return 'Stockfish on the server (it defends and judges the rook endings)';
  if (def.how === 'games') {
    if (def.analyse && !stockfish()) return 'Stockfish on the server (it analyses each game)';
    if (!bandOpponents(def.band).length) return `a measured bot in the ${Array.isArray(def.band) ? `${def.band[0]}-${def.band[1]}` : def.band} band on this server${maiaEngine() ? '' : ' (Maia-2 is not installed here)'}`;
  }
  return null;
}

/** The definition patch 02 should use for a metric while the flag is on, or null. */
function checkFor(metricId) {
  if (!enabled()) return null;
  const def = CHECKS[metricId];
  if (!def) return null;
  const why = unavailable(def);
  return why ? { how: 'not_wired', needs: why, unavailable: true } : def;
}

// ── item kinds: set-up and whole lines ──────────────────────────────────────

const START_BOARD = START.split(' ')[0];

function buildSetup(def) {
  return Array.from({ length: def.count || 1 }, () => ({ kind: 'setup', prompt: 'Set up the starting position: place all 32 pieces. White is at the bottom.', key: { type: 'placement', board: START_BOARD } }));
}

function buildLine(def, rnd) {
  const pool = (data().calculation && data().calculation.items) || [];
  return shuffle(pool, rnd).slice(0, def.count).map((q) => {
    const pos = C.parseFen(q.fen);
    return {
      kind: 'line',
      fen: q.fen,
      prompt: `${C.describe(pos)}\nType the whole line: your ${q.learner_moves} moves and every reply in between, without moving the pieces.`,
      plies: q.uci.length,
      key: { type: 'line', uci: q.uci, line: q.line, mate_end: C.isCheckmate(q.uci.reduce((p, u) => C.makeMove(p, C.moveFromText(p, u)), C.parseFen(q.fen))) },
    };
  });
}

/** Squares a placement string gets right and wrong against the start. */
function comparePlacement(given, want) {
  const expand = (s) => {
    const rows = String(s || '').trim().split(/\s+/)[0].split('/');
    if (rows.length !== 8) return null;
    const out = [];
    for (const r of rows) {
      let n = 0;
      for (const ch of r) {
        if (/[1-8]/.test(ch)) { for (let k = 0; k < Number(ch); k++) out.push(null); n += Number(ch); } else if (/[prnbqkPRNBQK]/.test(ch)) { out.push(ch); n += 1; } else return null;
      }
      if (n !== 8) return null;
    }
    return out;
  };
  const g = expand(given); const w = expand(want);
  if (!g || !w) return { correct: false, right: 0, total: 32 };
  let right = 0; let wrong = 0;
  for (let i = 0; i < 64; i++) {
    if (w[i] && g[i] === w[i]) right++;
    else if (g[i] !== w[i]) wrong++;
  }
  return { correct: wrong === 0, right, wrong, total: 32 };
}

/** Grade a typed line: every ply must be the line's own, a different mate is fine as the last move. */
function gradeLine(item, answer) {
  const tokens = String(answer || '').replace(/\d+\s*\.+/g, ' ').split(/[\s,;]+/).filter(Boolean);
  const k = item.key;
  let pos = C.parseFen(item.fen);
  let right = 0;
  for (let i = 0; i < k.uci.length; i++) {
    const m = tokens[i] ? C.moveFromText(pos, tokens[i]) : null;
    if (!m) break;
    const next = C.makeMove(pos, m);
    const ok = C.uci(m) === k.uci[i] || (i === k.uci.length - 1 && i % 2 === 0 && k.mate_end && C.isCheckmate(next));
    if (!ok) break;
    right++;
    pos = next;
  }
  return { correct: right === k.uci.length && tokens.length === k.uci.length, plies_right: right, plies: k.uci.length };
}

function gradeItem(item, answer) {
  if (item.key.type === 'placement') return comparePlacement(typeof answer === 'string' ? answer : answer && answer.board, item.key.board);
  if (item.key.type === 'line') return gradeLine(item, answer);
  return null;
}

/** What the result review shows as the answer. */
function answerText(item) {
  if (item.key.type === 'placement') return 'the starting position';
  if (item.key.type === 'line') return item.key.line.join(' ');
  return null;
}

const BUILDERS = { chess_setup: buildSetup, chess_line: buildLine };

// ── star mazes ──────────────────────────────────────────────────────────────

const DIRS = { R: [[1, 0], [-1, 0], [0, 1], [0, -1]], B: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
DIRS.Q = DIRS.R.concat(DIRS.B);
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

/** Where the maze piece on `from` can go: sliders stop before a wall; a knight cannot land on one. */
function mazeTargets(piece, from, walls) {
  const out = [];
  const f0 = from & 7; const r0 = from >> 3;
  if (piece === 'N') {
    for (const [df, dr] of KNIGHT) { const f = f0 + df; const r = r0 + dr; if (f >= 0 && f < 8 && r >= 0 && r < 8 && !walls.has(f + 8 * r)) out.push(f + 8 * r); }
    return out;
  }
  for (const [df, dr] of DIRS[piece]) {
    for (let f = f0 + df, r = r0 + dr; f >= 0 && f < 8 && r >= 0 && r < 8; f += df, r += dr) {
      if (walls.has(f + 8 * r)) break;
      out.push(f + 8 * r);
    }
  }
  return out;
}

/** The fewest moves that land on every star, or -1 when it cannot be done. */
function mazePar(piece, start, stars, walls) {
  const wallSet = new Set(walls);
  const full = (1 << stars.length) - 1;
  const seen = new Set([`${start}:0`]);
  let frontier = [[start, 0]];
  for (let d = 0; d <= 40 && frontier.length; d++) {
    const next = [];
    for (const [s, mask] of frontier) {
      if (mask === full) return d;
      for (const t of mazeTargets(piece, s, wallSet)) {
        const i = stars.indexOf(t);
        const m = i >= 0 ? mask | (1 << i) : mask;
        const k = `${t}:${m}`;
        if (!seen.has(k)) { seen.add(k); next.push([t, m]); }
      }
    }
    frontier = next;
  }
  return -1;
}

function buildMaze(piece, def, rnd) {
  for (let tries = 0; tries < 2000; tries++) {
    const start = Math.floor(rnd() * 64);
    const used = new Set([start]);
    const pick = (ok) => { for (let k = 0; k < 200; k++) { const s = Math.floor(rnd() * 64); if (!used.has(s) && ok(s)) { used.add(s); return s; } } return -1; };
    const colour = (s) => ((s & 7) + (s >> 3)) % 2;
    const nStars = def.stars[0] + Math.floor(rnd() * (def.stars[1] - def.stars[0] + 1));
    const nWalls = def.walls[0] + Math.floor(rnd() * (def.walls[1] - def.walls[0] + 1));
    const stars = [];
    for (let i = 0; i < nStars; i++) stars.push(pick((s) => piece !== 'B' || colour(s) === colour(start)));
    const walls = [];
    for (let i = 0; i < nWalls; i++) walls.push(pick(() => true));
    if (stars.includes(-1) || walls.includes(-1)) continue;
    const par = mazePar(piece, start, stars, walls);
    // A maze worth solving: 3 to 7 moves, and more than one star per move is not possible in one go.
    if (par >= Math.max(3, nStars) && par <= 7) return { piece, start: C.sqName(start), stars: stars.map(C.sqName), walls: walls.map(C.sqName), par };
  }
  throw new Error('no maze');
}

// ── play-outs ───────────────────────────────────────────────────────────────

function mirrorFen(fen) {
  const pos = C.parseFen(fen);
  const board = Array(64).fill(null);
  pos.board.forEach((p, s) => { if (p) board[(s >> 3) * 8 + (7 - (s & 7))] = p; });
  return C.toFen({ ...pos, board, castling: '', ep: -1 });
}

/** A random won K+X v K start, White to move, with a distance to mate inside [lo, hi]. */
function kxkStart(piece, [lo, hi], rnd) {
  const table = piece === 'Q' ? 'kqk' : 'krk';
  for (let tries = 0; tries < 100000; tries++) {
    const wk = Math.floor(rnd() * 64); const x = Math.floor(rnd() * 64); const bk = Math.floor(rnd() * 64);
    const v = TB.value(table, wk, x, bk, 0);
    if (v < lo || v > hi) continue;
    const pos = TB.positionOf(table, wk, x, bk, 'w');
    // The piece is not hanging to the black king at the start, and Black is not in check.
    if (C.inCheck(pos, 'b') || TB.value(table, wk, x, bk, 1) < 0) continue;
    return { fen: C.toFen(pos), dtm: v };
  }
  throw new Error('no start');
}

function playoutStarts(def, rnd) {
  if (def.build === 'kxk') {
    return Array.from({ length: def.count }, () => {
      const s = kxkStart(def.piece, def.dtm, rnd);
      return { kind: def.piece === 'Q' ? 'kqk' : 'krk', fen: s.fen, learner: 'w', dtm: s.dtm, limit: s.dtm + def.slack, goal: 'mate' };
    });
  }
  if (def.build === 'kpk') {
    const d = data().kpk_playout;
    const mir = (fen) => (rnd() < 0.5 ? mirrorFen(fen) : fen);
    const wins = shuffle(d.won_white_to_move, rnd).slice(0, def.win).map((x) => ({ kind: 'kpk_win', fen: mir(x.fen), learner: 'w', limit: def.moves, goal: 'promote' }));
    const draws = shuffle(d.drawn_black_to_move, rnd).slice(0, def.draw).map((x) => ({ kind: 'kpk_draw', fen: mir(x.fen), learner: 'b', limit: def.hold_moves || 25, goal: 'hold' }));
    return wins.concat(draws);
  }
  if (def.build === 'rook') {
    const d = data().rook_endgames;
    const l = shuffle(d.lucena, rnd).slice(0, def.lucena).map((x) => ({ kind: 'lucena', fen: x.fen, learner: 'w', limit: def.moves, goal: 'promote' }));
    const p = shuffle(d.philidor, rnd).slice(0, def.philidor).map((x) => ({ kind: 'philidor', fen: x.fen, learner: 'b', limit: def.hold_moves, goal: 'hold' }));
    return l.concat(p);
  }
  return [];
}

const TITLE = {
  kqk: 'Queen and king against king: checkmate', krk: 'Rook and king against king: checkmate',
  kpk_win: 'King and pawn against king: win it as White', kpk_draw: 'King and pawn against king: hold the draw as Black',
  lucena: 'The Lucena position: win it as White', philidor: 'The Philidor position: hold it as Black',
};

function newPlay(start) {
  const pos = C.parseFen(start.fen);
  return { fen: start.fen, moves: [], learner_moves: 0, quiet: 0, seen: { [posKey(pos)]: 1 }, strikes: 0, over: null };
}

/** The verdict of a play-out after a ply, or null to go on. `who` is the side that just moved. */
async function judgePlayout(start, play, pos, who, lastMove) {
  const learner = start.learner;
  const st = C.status(pos);
  const rep = (play.seen[posKey(pos)] || 0) >= 3;
  const hold = start.goal === 'hold';
  // Rules first.
  if (st === 'checkmate') return pos.side === learner ? { ok: false, why: 'checkmated' } : { ok: true, why: 'checkmate' };
  if (st === 'stalemate') return hold ? { ok: true, why: 'stalemate: a draw' } : { ok: false, why: 'stalemate: the win is gone' };
  if (st === 'insufficient') return hold ? { ok: true, why: 'no material left to win with' } : { ok: false, why: 'the last piece was lost' };
  if (rep) return hold ? { ok: true, why: 'the same position three times: a draw' } : { ok: false, why: 'the same position three times: a draw' };
  if (play.quiet >= 100) return hold ? { ok: true, why: 'the 50-move rule' } : { ok: false, why: 'the 50-move rule: a draw' };
  // Table positions: the table's word.
  if (['kqk', 'krk', 'kpk_win', 'kpk_draw'].includes(start.kind)) {
    if (start.kind === 'kpk_win' && lastMove && lastMove.promo && who === learner) {
      const v = TB.probe(pos);
      return v && v.result === 'win' ? { ok: true, why: `promoted to a ${C.NAMES[lastMove.promo]} that the table says wins` } : { ok: false, why: 'the promotion does not win' };
    }
    const v = TB.probe(pos);
    if (!v) return hold ? { ok: true, why: 'the pawn is gone' } : { ok: false, why: 'the position is no longer a win' };
    if (hold && v.result === 'win') return { ok: false, why: 'now White wins with best play' };
    if (!hold && v.result !== 'win') return { ok: false, why: 'the win is gone: it is a draw with best play' };
    if (who === learner && play.learner_moves >= start.limit) {
      return hold ? { ok: true, why: `held for ${start.limit} moves` } : { ok: false, why: `no mate within ${start.limit} moves (the fastest was ${start.dtm})` };
    }
    return null;
  }
  // Rook endings: Stockfish's word (asked by the caller, which passes the score in play.eval_white).
  if (start.kind === 'lucena') {
    const white = play.eval_white;
    const queen = pos.board.includes('Q');
    if (queen && (white.mate > 0 || white.cp >= 600)) return { ok: true, why: 'promoted, and Stockfish says White wins' };
    if (who === learner && (white.mate < 0 || white.cp <= 150)) { play.strikes += 1; if (play.strikes >= 2) return { ok: false, why: 'Stockfish says the win is gone' }; } else if (who === learner) play.strikes = 0;
    if (who === learner && play.learner_moves >= start.limit) return { ok: false, why: `not converted within ${start.limit} moves` };
    return null;
  }
  if (start.kind === 'philidor') {
    const white = play.eval_white;
    const whitePieces = pos.board.filter((p) => p && p === p.toUpperCase() && p !== 'K');
    if (!pos.board.includes('P') && !whitePieces.includes('Q') && Math.abs(white.cp) < 150 && !white.mate) return { ok: true, why: 'the pawn is gone: a draw' };
    if (who === learner && (white.mate > 0 || white.cp >= 400)) { play.strikes += 1; if (play.strikes >= 2) return { ok: false, why: 'Stockfish says White now wins' }; } else if (who === learner) play.strikes = 0;
    if (who === learner && play.learner_moves >= start.limit) return white.mate > 0 || white.cp >= 400 ? { ok: false, why: 'White is winning' } : { ok: true, why: `held for ${start.limit} moves` };
    return null;
  }
  return null;
}

/** The defender's (or, for a hold, the attacker's) reply, and Stockfish's score from White's side. */
async function playoutReply(start, pos, rnd) {
  if (['kqk', 'krk', 'kpk_win'].includes(start.kind)) return { move: TB.defend(pos, rnd) };
  if (start.kind === 'kpk_draw') return { move: TB.attack(pos, rnd) };
  const sf = stockfish();
  if (!sf) throw Object.assign(new Error('Stockfish is not available on this server.'), { status: 503 });
  const a = await sf(C.toFen(pos), { nodes: Number(process.env.SKILL_CHESS_NODES) || 400000 });
  const top = a.lines[0];
  const move = top && C.moveFromText(pos, top.uci);
  return { move, score: top ? { cp: pos.side === 'w' ? top.cp : -top.cp, mate: pos.side === 'w' ? top.mate : -top.mate } : { cp: 0, mate: 0 } };
}

/** Stockfish's score of a position from White's side (for a rook ending verdict). */
async function evalWhite(pos) {
  const sf = stockfish();
  if (!sf) throw Object.assign(new Error('Stockfish is not available on this server.'), { status: 503 });
  if (C.status(pos) !== 'playing') return { cp: 0, mate: 0 };
  const a = await sf(C.toFen(pos), { nodes: Number(process.env.SKILL_CHESS_NODES) || 400000 });
  const top = a.lines[0] || { cp: 0, mate: 0 };
  return { cp: pos.side === 'w' ? top.cp : -top.cp, mate: pos.side === 'w' ? top.mate : -top.mate };
}

function applyPly(play, pos, m) {
  const next = C.makeMove(pos, m);
  play.moves.push(C.uci(m));
  play.quiet = m.captured || m.piece.toLowerCase() === 'p' ? 0 : play.quiet + 1;
  const k = posKey(next);
  play.seen[k] = (play.seen[k] || 0) + 1;
  play.fen = C.toFen(next);
  return next;
}

async function playoutMove(open, text, rnd) {
  const start = open.starts[open.current];
  const play = open.play;
  if (!start || !play) return { status: 409, error: 'Every play-out is done.' };
  let pos = C.parseFen(play.fen);
  if (pos.side !== start.learner) return { status: 409, error: 'It is not your move.' };
  const m = C.moveFromText(pos, String(text || ''));
  if (!m) return { status: 400, error: 'That move is not legal here.', illegal: true };
  const mine = m;
  pos = applyPly(play, pos, m);
  play.learner_moves += 1;
  let reply = null;
  let verdict;
  if (start.kind === 'lucena' || start.kind === 'philidor') {
    if (C.status(pos) === 'playing') {
      const r = await playoutReply(start, pos, rnd);
      play.eval_white = r.score;
      verdict = await judgePlayout(start, play, pos, start.learner, mine);
      if (!verdict && r.move) { reply = { uci: C.uci(r.move), san: C.san(pos, r.move) }; pos = applyPly(play, pos, r.move); play.eval_white = await evalWhite(pos); verdict = await judgePlayout(start, play, pos, start.learner === 'w' ? 'b' : 'w', r.move); }
    } else { play.eval_white = { cp: 0, mate: 0 }; verdict = await judgePlayout(start, play, pos, start.learner, mine); }
  } else {
    verdict = await judgePlayout(start, play, pos, start.learner, mine);
    if (!verdict) {
      const r = await playoutReply(start, pos, rnd);
      if (r.move) { reply = { uci: C.uci(r.move), san: C.san(pos, r.move) }; pos = applyPly(play, pos, r.move); verdict = await judgePlayout(start, play, pos, start.learner === 'w' ? 'b' : 'w', r.move); }
    }
  }
  const out = { fen: play.fen, reply };
  if (verdict) {
    open.results.push({ kind: start.kind, ok: verdict.ok, why: verdict.why, moves: play.learner_moves, dtm: start.dtm || null, limit: start.limit, line: play.moves.join(' ') });
    open.current += 1;
    open.play = open.current < open.starts.length ? newPlay(open.starts[open.current]) : null;
    out.over = verdict;
    out.next = open.play ? startForPage(open.starts[open.current], open.current) : null;
  }
  return out;
}

function startForPage(start, index) {
  return { index, kind: start.kind, title: TITLE[start.kind], fen: start.fen, learner: start.learner, limit: start.limit, dtm: start.dtm || null, goal: start.goal };
}

// ── recorded games ──────────────────────────────────────────────────────────

/** Lichess's winning chances (0-1) for a score in centipawns from one side. */
const winChance = (cp) => 1 / (1 + Math.exp(-0.00368208 * cp));
const scoreCp = (l) => (l.mate ? (l.mate > 0 ? 10000 - l.mate * 10 : -10000 - l.mate * 10) : l.cp);
/** Lichess's accuracy of one move from the winning chances (in percent) before and after. */
const moveAccuracy = (before, after) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, before - after)) - 3.1669));

const VAL = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 20000 };
/** Static exchange on `to` for the side to move: what it gains by capturing there and going on. */
function see(pos, to) {
  const caps = C.legalMoves(pos).filter((m) => m.to === to && m.captured);
  if (!caps.length) return 0;
  caps.sort((a, b) => VAL[a.piece.toLowerCase()] - VAL[b.piece.toLowerCase()]);
  const m = caps[0];
  const gain = VAL[m.captured.toLowerCase()] - see(C.makeMove(pos, m), to);
  return Math.max(0, gain);
}
/** The opponent's best gain from a hanging piece of `side` (knight or bigger) in this position, side to move = the opponent. */
function hangingGain(pos, side) {
  let best = 0; let at = null;
  pos.board.forEach((p, s) => {
    if (!p || C.colorOf(p) !== side || 'pkPK'.includes(p)) return;
    const g = see(pos, s);
    if (g > best) { best = g; at = s; }
  });
  return { gain: best, at };
}

function pickOpponent(def, gameIndex, rnd) {
  const list = bandOpponents(def.band);
  return list[Math.floor(rnd() * list.length)] || null;
}

/** The bot's move. Maia-2: the CC0 opening book first, as the sparring partner does. */
async function opponentMove(opp, pos, rnd) {
  const fen = C.toFen(pos);
  if (opp.engine === 'maia') {
    // eslint-disable-next-line global-require
    const openings = require('../content/chess-openings');
    const all = openings.bookMoves(fen);
    const book = all.filter((b) => b.lines >= 3 && b.lines >= 0.05 * all[0].lines);
    if (book.length) {
      const w = (b) => b.lines ** 1.5;
      let r = rnd() * book.reduce((n, b) => n + w(b), 0);
      const pick = book.find((b) => (r -= w(b)) <= 0) || book[0];
      const m = C.moveFromText(pos, pick.uci);
      if (m) return m;
    }
    const M = maiaEngine();
    // The worker can stop and restart (seen in the bench games): ask twice.
    for (let attempt = 0; M && attempt < 2; attempt++) {
      try {
        const p = await M.predict(fen, { elo: opp.elo });
        const uci = M.choose(p.moves, { random: rnd });
        const m = uci && C.moveFromText(pos, uci);
        if (m) return m;
      } catch { /* try again, then the measured bot nearest its rating */ }
    }
  }
  // eslint-disable-next-line global-require
  const bot = require('../public/engine/chess/bot');
  let strength = opp.strength;
  if (!strength) {
    const bots = ((data().opponents && data().opponents.list) || []).filter((o) => o.engine === 'bot');
    const near = bots.sort((a, b) => Math.abs(a.rating - opp.rating) - Math.abs(b.rating - opp.rating))[0];
    strength = near ? near.strength : 5;
  }
  const r = bot.chooseMove(pos, { strength, random: rnd });
  return r ? r.move : null;
}

function newGame(def, index, rnd, now) {
  const opp = pickOpponent(def, index, rnd);
  return {
    index, opponent: opp ? { id: opp.id, rating: opp.rating, engine: opp.engine } : null, opp_def: opp,
    learner: index % 2 === 0 ? 'w' : 'b', fen: START, moves: [], quiet: 0, seen: { [posKey(C.parseFen(START))]: 1 },
    clock: def.clock ? { left_ms: def.clock.base * 1000, inc_ms: def.clock.inc * 1000 } : null, turn_at: now, illegal: 0,
    result: null, why: null, analysis: null, started_at: now, last_move_at: now,
  };
}

/** The result of a game for the learner (1, 0.5, 0) when it is over by the rules, else null. */
function gameOver(game, pos) {
  const st = C.status(pos);
  if (st === 'checkmate') return { score: pos.side === game.learner ? 0 : 1, why: 'checkmate', full: true };
  if (st === 'stalemate') return { score: 0.5, why: 'stalemate', full: true };
  if (st === 'insufficient') return { score: 0.5, why: 'not enough material to mate', full: true };
  if ((game.seen[posKey(pos)] || 0) >= 3) return { score: 0.5, why: 'the same position three times', full: true };
  if (game.quiet >= 100) return { score: 0.5, why: 'the 50-move rule', full: true };
  return null;
}

/** At the ply limit: Stockfish (or the material, without it) decides. */
async function adjudicate(game, pos) {
  let whiteCp;
  const sf = stockfish();
  if (sf) {
    const a = await sf(C.toFen(pos), { nodes: 400000 });
    const top = a.lines[0] || { cp: 0, mate: 0 };
    whiteCp = (pos.side === 'w' ? 1 : -1) * scoreCp(top);
  } else {
    whiteCp = pos.board.reduce((n, p) => (p && p.toLowerCase() !== 'k' ? n + (p === p.toUpperCase() ? 1 : -1) * VAL[p.toLowerCase()] : n), 0);
  }
  const mine = game.learner === 'w' ? whiteCp : -whiteCp;
  return { score: mine >= 500 ? 1 : mine <= -500 ? 0 : 0.5, why: `${GAMES.max_plies / 2} moves: adjudicated`, full: true };
}

/** Stockfish's review of the learner's moves: blunders, hanging pieces, accuracy. */
async function analyseGame(game) {
  const sf = stockfish();
  if (!sf) return { engine: null };
  const nodes = Number(process.env.SKILL_CHESS_REVIEW_NODES) || 150000;
  let pos = C.parseFen(START);
  const evals = []; // White's view, centipawns, of every position
  const positions = [pos];
  for (const u of game.moves) { pos = C.makeMove(pos, C.moveFromText(pos, u)); positions.push(pos); }
  for (const p of positions) {
    const st = C.status(p);
    if (st === 'checkmate') { evals.push(p.side === 'w' ? -10000 : 10000); continue; }
    if (st !== 'playing') { evals.push(0); continue; }
    const a = await sf(C.toFen(p), { nodes });
    const top = a.lines[0] || { cp: 0, mate: 0 };
    evals.push((p.side === 'w' ? 1 : -1) * scoreCp(top));
  }
  const sign = game.learner === 'w' ? 1 : -1;
  let blunders = 0; let hung = 0; const acc = []; const marks = [];
  let lastHungAt = null;
  for (let i = 0; i < game.moves.length; i++) {
    if (positions[i].side !== game.learner) continue;
    const before = winChance(sign * evals[i]);
    const after = winChance(sign * evals[i + 1]);
    acc.push(moveAccuracy(before * 100, after * 100));
    const blunder = before - after >= 0.2;
    if (blunder) blunders++;
    // Left hanging: after the move the opponent wins 2 pawns or more by a plain exchange
    // on a knight or bigger, and Stockfish agrees the move lost at least 1.5 pawns.
    const h = hangingGain(positions[i + 1], game.learner);
    const dropped = sign * (evals[i] - evals[i + 1]);
    const isHung = h.gain >= 200 && dropped >= 150 && h.at !== lastHungAt;
    if (isHung) hung++;
    lastHungAt = h.gain >= 200 ? h.at : null;
    if (blunder || isHung) marks.push({ ply: i, move: game.moves[i], blunder, hung: isHung, lost: Number((before - after).toFixed(2)) });
  }
  const accuracy = acc.length ? Number((acc.reduce((a, b) => a + b, 0) / acc.length).toFixed(1)) : null;
  return { engine: 'stockfish', nodes, blunders, hung, accuracy, learner_moves: acc.length, marks: marks.slice(0, 20) };
}

async function finishGame(def, open, game, over) {
  game.result = over.score;
  game.why = over.why;
  game.full = !!over.full;
  if (def.analyse && game.moves.length) game.analysis = await analyseGame(game);
}

/** The learner's move in the current game, and the bot's reply. */
async function gameMove(open, def, text, now, rnd) {
  const game = open.games[open.games.length - 1];
  if (!game || game.result !== null) return { status: 409, error: 'No game is in progress.' };
  let pos = C.parseFen(game.fen);
  if (pos.side !== game.learner) return { status: 409, error: 'It is not your move.' };
  if (game.clock) {
    game.clock.left_ms -= Math.max(0, now - game.turn_at);
    if (game.clock.left_ms <= 0) {
      await finishGame(def, open, game, { score: 0, why: 'out of time', full: true });
      return gameReply(open, def, game, null, now, rnd);
    }
  }
  const m = C.moveFromText(pos, String(text || ''));
  if (!m) { game.illegal += 1; return { status: 400, error: 'That move is not legal here: play another.', illegal: true, illegal_attempts: game.illegal }; }
  pos = applyPly(game, pos, m);
  game.last_move_at = now;
  if (game.clock) game.clock.left_ms += game.clock.inc_ms;
  let over = gameOver(game, pos);
  let reply = null;
  if (!over && game.moves.length >= GAMES.max_plies) over = await adjudicate(game, pos);
  if (!over) {
    const r = await opponentMove(game.opp_def, pos, rnd);
    if (r) { reply = { uci: C.uci(r), san: C.san(pos, r) }; pos = applyPly(game, pos, r); }
    over = gameOver(game, pos);
    if (!over && game.moves.length >= GAMES.max_plies) over = await adjudicate(game, pos);
  }
  game.turn_at = Date.now();
  if (over) await finishGame(def, open, game, over);
  return gameReply(open, def, game, reply, now, rnd);
}

/** After a move (or a resignation): the game's state, and the next game when this one ended. */
async function gameReply(open, def, game, reply, now, rnd) {
  const out = { fen: game.fen, reply, clock_ms: game.clock ? game.clock.left_ms : null };
  if (game.result !== null) {
    out.over = { score: game.result, why: game.why, analysis: game.analysis };
    if (open.games.length < def.games) {
      const g = newGame(def, open.games.length, rnd, Date.now());
      open.games.push(g);
      if (g.learner === 'b') {
        const pos = C.parseFen(g.fen);
        const r = await opponentMove(g.opp_def, pos, rnd);
        if (r) applyPly(g, pos, r);
        g.turn_at = Date.now();
      }
      out.next = gameForPage(g);
    }
  }
  return out;
}

function gameForPage(g) {
  return { index: g.index, opponent: g.opponent ? { rating: g.opponent.rating, engine: g.opponent.engine } : null, learner: g.learner, fen: g.fen, moves: g.moves, clock_ms: g.clock ? g.clock.left_ms - (g.result === null && C.parseFen(g.fen).side === g.learner ? Date.now() - g.turn_at : 0) : null, result: g.result, why: g.why, analysis: g.analysis, illegal: g.illegal };
}

/** A performance rating from the opponents' ratings and the scores (maximum likelihood; a clean sweep +-400 past the field). */
function performance(games) {
  const list = games.filter((g) => g.result !== null && g.opponent);
  if (!list.length) return null;
  const score = list.reduce((a, g) => a + g.result, 0);
  const rs = list.map((g) => g.opponent.rating);
  if (score === list.length) return Math.round(Math.max(...rs) + 400);
  if (score === 0) return Math.round(Math.min(...rs) - 400);
  let lo = Math.min(...rs) - 800; let hi = Math.max(...rs) + 800;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const e = rs.reduce((a, r) => a + 1 / (1 + 10 ** ((r - mid) / 400)), 0);
    if (e < score) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ── the sitting: open, move, resign, result ────────────────────────────────

/** The parts of a new sitting (merged into patch 02's `open`). */
function open(def, rnd, userId, metricId, now) {
  if (def.how === 'playout') {
    const starts = playoutStarts(def, rnd);
    if (!starts.length) return { error: 'There is nothing to play for this check yet.' };
    return { starts, current: 0, play: newPlay(starts[0]), results: [] };
  }
  if (def.how === 'maze') {
    const mazes = def.pieces.map((p) => buildMaze(p, def, rnd));
    return { mazes, current: 0, at: mazes[0].start, got: [], moves: 0, maze_results: [] };
  }
  if (def.how === 'games') {
    const g = newGame(def, 0, rnd, now);
    if (!g.opponent) return { error: 'There is no measured bot for this band on this server.' };
    return { games: [g] };
  }
  return { error: 'Unknown sitting.' };
}

/** How long a sitting may stay open before it is closed as failed (games take days). */
function openHours(o) { return o && o.how === 'games' ? GAMES.open_days * 24 : null; }

function forPage(o) {
  if (o.how === 'playout') {
    return { starts: o.starts.length, current: o.current, start: o.current < o.starts.length ? startForPage(o.starts[o.current], o.current) : null, fen: o.play ? o.play.fen : null, moves: o.play ? o.play.moves : [], results: o.results.map((r) => ({ kind: r.kind, ok: r.ok, why: r.why, moves: r.moves })) };
  }
  if (o.how === 'maze') {
    const m = o.mazes[o.current];
    return { mazes: o.mazes.length, current: o.current, maze: m ? { piece: m.piece, stars: m.stars, walls: m.walls, par: m.par, start: m.start } : null, at: o.at, got: o.got, moves: o.moves, results: o.maze_results };
  }
  if (o.how === 'games') {
    return { target: CHECKS[o.metric_id] ? CHECKS[o.metric_id].games : null, games: o.games.map(gameForPage) };
  }
  return {};
}

function mazeMove(o, to) {
  const m = o.mazes[o.current];
  if (!m) return { status: 409, error: 'Every maze is done.' };
  const toSq = C.sqIndex ? C.sqIndex(String(to || '')) : -1;
  const from = C.sqIndex(o.at);
  const walls = new Set(m.walls.map((s) => C.sqIndex(s)));
  if (!(toSq >= 0) || !mazeTargets(m.piece, from, walls).includes(toSq)) return { status: 400, error: 'The piece cannot go there.', illegal: true };
  o.at = C.sqName(toSq);
  o.moves += 1;
  if (m.stars.includes(o.at) && !o.got.includes(o.at)) o.got.push(o.at);
  const out = { at: o.at, got: o.got, moves: o.moves };
  const done = o.got.length === m.stars.length;
  if (done || o.moves >= m.par * 3) {
    const r = { piece: m.piece, par: m.par, moves: o.moves, done, at_par: done && o.moves <= m.par };
    o.maze_results.push(r);
    o.current += 1;
    const next = o.mazes[o.current];
    o.at = next ? next.start : null; o.got = []; o.moves = 0;
    out.over = r;
    out.next = next ? { piece: next.piece, stars: next.stars, walls: next.walls, par: next.par, start: next.start } : null;
  }
  return out;
}

/** One move in an open sitting of a new kind (async: the engines answer). */
async function move(o, def, body, now = Date.now()) {
  const rnd = rngFrom((now ^ (o.started_at || 0)) >>> 0);
  if (o.how === 'playout') return playoutMove(o, body && body.move, rnd);
  if (o.how === 'games') {
    const game = o.games[o.games.length - 1];
    if (game && game.result === null && now - game.last_move_at > GAMES.abandon_hours * 3600 * 1000) {
      await finishGame(def, o, game, { score: 0, why: 'abandoned', full: false });
      return gameReply(o, def, game, null, now, rnd);
    }
    return gameMove(o, def, body && body.move, now, rnd);
  }
  if (o.how === 'maze') return mazeMove(o, body && body.to);
  return { status: 400, error: 'Moves are not part of this check.' };
}

/** Give up the current play-out, maze or game (it counts as not done). */
async function resign(o, def, now = Date.now()) {
  const rnd = rngFrom((now ^ 0x5bd1e995) >>> 0);
  if (o.how === 'playout') {
    const start = o.starts[o.current];
    if (!start) return { status: 409, error: 'Every play-out is done.' };
    o.results.push({ kind: start.kind, ok: false, why: 'given up', moves: o.play.learner_moves, limit: start.limit, line: o.play.moves.join(' ') });
    o.current += 1;
    o.play = o.current < o.starts.length ? newPlay(o.starts[o.current]) : null;
    return { over: { ok: false, why: 'given up' }, next: o.play ? startForPage(o.starts[o.current], o.current) : null };
  }
  if (o.how === 'maze') {
    const m = o.mazes[o.current];
    if (!m) return { status: 409, error: 'Every maze is done.' };
    o.maze_results.push({ piece: m.piece, par: m.par, moves: o.moves, done: false, at_par: false });
    o.current += 1;
    const next = o.mazes[o.current];
    o.at = next ? next.start : null; o.got = []; o.moves = 0;
    return { over: { at_par: false }, next: next ? { piece: next.piece, stars: next.stars, walls: next.walls, par: next.par, start: next.start } : null };
  }
  if (o.how === 'games') {
    const game = o.games[o.games.length - 1];
    if (!game || game.result !== null) return { status: 409, error: 'No game is in progress.' };
    await finishGame(def, o, game, { score: 0, why: 'resigned', full: false });
    return gameReply(o, def, game, null, now, rnd);
  }
  return { status: 400, error: 'Nothing to give up.' };
}

/** The sitting's result against its rule: { done, pass, score, n, detail }. */
function result(o, def) {
  if (o.how === 'playout') {
    const done = o.results.length === o.starts.length;
    const ok = o.results.filter((r) => r.ok).length;
    return { done, pass: done && ok === o.starts.length, score: Number((ok / o.starts.length).toFixed(3)), n: o.starts.length, right: ok, source: 'board', detail: { playouts: o.results.map((r) => ({ kind: r.kind, ok: r.ok, why: r.why, moves: r.moves, fastest: r.dtm, limit: r.limit })) } };
  }
  if (o.how === 'maze') {
    const done = o.maze_results.length === o.mazes.length;
    const atPar = o.maze_results.filter((r) => r.at_par).length;
    return { done, pass: done && atPar >= def.rule.at_par, score: Number((atPar / o.mazes.length).toFixed(3)), n: o.mazes.length, right: atPar, source: 'board', detail: { mazes: o.maze_results } };
  }
  if (o.how === 'games') {
    const finished = o.games.filter((g) => g.result !== null);
    const done = finished.length >= def.games;
    const rule = def.rule;
    const score = finished.reduce((a, g) => a + g.result, 0);
    const share = finished.length ? score / finished.length : 0;
    const hung = finished.map((g) => (g.analysis && g.analysis.hung !== undefined ? g.analysis.hung : null)).filter((x) => x !== null);
    const blunders = finished.map((g) => (g.analysis && g.analysis.blunders !== undefined ? g.analysis.blunders : null)).filter((x) => x !== null);
    const perf = performance(finished);
    const checks = [];
    if (rule.completed !== undefined) checks.push(finished.filter((g) => g.full).length >= rule.completed);
    if (rule.score !== undefined) checks.push(share >= rule.score - 1e-9);
    if (rule.median_hung !== undefined) checks.push(hung.length === finished.length && median(hung) <= rule.median_hung);
    if (rule.median_blunders !== undefined) checks.push(blunders.length === finished.length && median(blunders) <= rule.median_blunders);
    if (rule.performance !== undefined) checks.push(perf !== null && perf >= rule.performance);
    const accs = finished.map((g) => g.analysis && g.analysis.accuracy).filter((x) => typeof x === 'number');
    return {
      done, pass: done && checks.every(Boolean), score: Number(share.toFixed(3)), n: finished.length, source: 'games',
      detail: { points: score, games: finished.length, performance: perf, median_hung: median(hung), median_blunders: median(blunders), accuracy: accs.length ? Number((accs.reduce((a, b) => a + b, 0) / accs.length).toFixed(1)) : null, full_games: finished.filter((g) => g.full).length, opponents: [...new Set(finished.map((g) => g.opponent && g.opponent.id))] },
    };
  }
  return { done: false, pass: false };
}

/** The definition of a metric's sitting (whether or not this server can run it now). */
const defFor = (metricId) => CHECKS[metricId] || null;

module.exports = {
  enabled, checkFor, defFor, unavailable, setEngines, opponents, bandOpponents, HOWS, BUILDERS, gradeItem, answerText,
  open, openHours, forPage, move, resign, result,
  // for tests
  mazePar, mazeTargets, buildMaze, comparePlacement, gradeLine, see, hangingGain, performance, winChance, moveAccuracy, playoutStarts, kxkStart, analyseGame, mirrorFen,
};
