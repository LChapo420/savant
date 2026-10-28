/**
 * Endgame tables for the chess stage checks' play-outs (staged patch
 * skills-round3/05-chess-sittings): K+Q v K and K+R v K with the distance to
 * mate of every position, and K+P v K win or draw, always with White as the
 * side with the extra piece.
 *
 * The tables were computed by retrograde analysis: KQK and KRK with the staged,
 * independent builder (curriculum-build/staged/skills/lib/endgame-tables.js, which
 * shares no code with the app's chess engine), KPK with distances by the build tool
 * and every win/draw checked against that builder's own KPK table; packed into
 * content/chess-endgame-tables.data.json by
 * curriculum-build/staged/adaptation/skills-round3/tools/build-chess-sittings.js.
 * The pack carries a SHA-256 of each table; it is checked when the tables load.
 *
 *   probe(pos)          { table, value, result: 'win'|'draw', dtm } for White, or null (not a table position)
 *   defend(pos, rnd)    perfect defence for Black: a drawing move if there is one, else the
 *                       longest way to lose (to mate, or to White's winning promotion)
 *   attack(pos, rnd)    White's trickiest move in a drawn KPK position: the one that leaves Black
 *                       the fewest drawing replies (all of White's moves draw there)
 *
 * Squares: a1 = 0 ... h8 = 63, as content/chess-board. Values: KXK -2 illegal, -1 draw,
 * d >= 0 mate in d White moves (Black to move: mated in d, 0 = mated now); KPK -2
 * illegal, 0 draw, d >= 1 White wins, promoting (to a piece that wins) on its d-th move.
 * For K+P v K the "dtm" below is that distance to a winning promotion.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const C = require('./chess-board');

const DATA_FILE = path.join(__dirname, 'chess-endgame-tables.data.json');
const SIZE = 64 * 64 * 64 * 2;
let T = null;

/** Load and check the packed tables (about 0.1 s). */
function load() {
  if (T) return T;
  const pack = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const out = {};
  for (const name of ['kqk', 'krk', 'kpk']) {
    const raw = zlib.brotliDecompressSync(Buffer.from(pack[name].data, 'base64'));
    if (raw.length !== SIZE) throw new Error(`${name}: wrong size`);
    const sha = crypto.createHash('sha256').update(raw).digest('hex');
    if (sha !== pack[name].sha256) throw new Error(`${name}: checksum does not match`);
    out[name] = new Int8Array(raw.buffer, raw.byteOffset, raw.length);
  }
  T = out;
  return T;
}

const idx = (wk, x, bk, stm) => ((wk * 64 + x) * 64 + bk) * 2 + stm;

/** The pieces on the board, or null when it is not K+Q/R/P v K with White strong. */
function material(pos) {
  let wk = -1; let bk = -1; let x = -1; let kind = null;
  for (let s = 0; s < 64; s++) {
    const p = pos.board[s];
    if (!p) continue;
    if (p === 'K') wk = s;
    else if (p === 'k') bk = s;
    else if ('QRP'.includes(p) && x < 0) { x = s; kind = p; } else return null;
  }
  if (wk < 0 || bk < 0 || x < 0) return null;
  return { wk, bk, x, table: kind === 'Q' ? 'kqk' : kind === 'R' ? 'krk' : 'kpk' };
}

/** The table's verdict for White in this position, or null. */
function probe(pos) {
  const m = material(pos);
  if (!m) return null;
  const t = load()[m.table];
  const v = t[idx(m.wk, m.x, m.bk, pos.side === 'w' ? 0 : 1)];
  if (v === -2) return null;
  if (m.table === 'kpk') return { table: 'kpk', value: v, result: v >= 1 ? 'win' : 'draw', dtm: v >= 1 ? v : null };
  return { table: m.table, value: v, result: v >= 0 ? 'win' : 'draw', dtm: v >= 0 ? v : null };
}

/**
 * A position's value after a move, from the table it lands in: a promotion goes
 * to K+Q (or K+R) v K, a capture of White's last piece is a draw (K v K).
 * Returns { result, dtm } for White, Black to move or White to move as the position says.
 */
function after(pos, move) {
  const next = C.makeMove(pos, move);
  const st = C.status(next);
  if (st === 'checkmate') return { result: next.side === 'b' ? 'win' : 'loss', dtm: 0, mate: true, next };
  if (st === 'stalemate' || st === 'insufficient') return { result: 'draw', dtm: null, stalemate: st === 'stalemate', next };
  const p = probe(next);
  if (!p) return { result: 'draw', dtm: null, next }; // an underpromotion to a minor piece: a draw
  return { result: p.result, dtm: p.dtm, next };
}

/** Perfect defence for Black. */
function defend(pos, rnd = Math.random) {
  const moves = C.legalMoves(pos);
  if (!moves.length) return null;
  const scored = moves.map((mv) => {
    const a = after(pos, mv);
    // A draw first (taking the piece or pawn, or a drawn KPK square), then the longest
    // mate, then (KPK lost) the pawn furthest from promotion and the king nearest it.
    let key;
    if (a.result === 'draw') key = 1e6;
    else if (a.dtm !== null) key = a.dtm * 100;
    else {
      const m = material(a.next);
      const promo = m ? 56 + (m.x & 7) : 0;
      const kd = m ? Math.max(Math.abs((m.bk & 7) - (promo & 7)), Math.abs((m.bk >> 3) - (promo >> 3))) : 0;
      key = (m ? (7 - (m.x >> 3)) * 10 : 0) - kd;
    }
    return { mv, key };
  });
  const best = Math.max(...scored.map((s) => s.key));
  const top = scored.filter((s) => s.key === best);
  return top[Math.floor(rnd() * top.length)].mv;
}

/** White's trickiest move in a drawn K+P v K position (every White move draws there). */
function attack(pos, rnd = Math.random) {
  const moves = C.legalMoves(pos);
  if (!moves.length) return null;
  const scored = moves.map((mv) => {
    const a = after(pos, mv);
    if (a.result === 'win') return { mv, key: 1e6 }; // never happens in a drawn start, but take a win
    if (a.mate) return { mv, key: 1e6 };
    if (a.stalemate || C.status(a.next) !== 'playing') return { mv, key: -1e6 };
    const replies = C.legalMoves(a.next);
    const drawing = replies.filter((r) => after(a.next, r).result === 'draw').length;
    const keepsPawn = material(a.next) && material(a.next).table === 'kpk';
    return { mv, key: (keepsPawn ? 0 : -1000) + (replies.length - drawing) * 10 - drawing };
  });
  const best = Math.max(...scored.map((s) => s.key));
  const top = scored.filter((s) => s.key === best);
  return top[Math.floor(rnd() * top.length)].mv;
}

/** A position from table squares, White strong, side to move `stm` ('w' or 'b'). */
function positionOf(table, wk, x, bk, side = 'w') {
  const board = Array(64).fill(null);
  board[wk] = 'K';
  board[x] = table === 'kqk' ? 'Q' : table === 'krk' ? 'R' : 'P';
  board[bk] = 'k';
  return { board, side, castling: '', ep: -1 };
}

/** Raw table value (for tests and the build). */
function value(table, wk, x, bk, stm) { return load()[table][idx(wk, x, bk, stm)]; }

module.exports = { load, probe, after, defend, attack, material, positionOf, value, DATA_FILE };
