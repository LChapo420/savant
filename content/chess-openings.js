/**
 * Opening names and book moves by position, from the CC0 lichess-org/chess-openings
 * list (content/chess-openings-data.js; thank you, Lichess).
 *
 *   nameOf(fen)              { eco, name } when this exact position is a named line, else null
 *   nameOfGame(ucis, [fen])  the last named position a game passed through, or null
 *   bookMoves(fen)           [{ uci, lines }] the moves the named lines play from here,
 *                            most-used first (the sparring bot's opening book)
 *
 * Positions are matched on placement, side to move and castling rights (not the
 * en-passant square, which other programs write differently). The index is built
 * on first use (about a second).
 */
const C = require('./chess-board');
const DATA = require('./chess-openings-data');

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const key = (fenOrPos) => {
  const fen = typeof fenOrPos === 'string' ? fenOrPos : C.toFen(fenOrPos);
  return fen.trim().split(/\s+/).slice(0, 3).join(' ');
};

let named = null; // key -> { eco, name, plies }
let next = null; // key -> Map(uci -> lines)

function build() {
  if (named) return;
  named = new Map();
  next = new Map();
  for (const [eco, name, moves] of DATA) {
    let pos = C.parseFen(START);
    const list = moves.split(' ');
    list.forEach((u, i) => {
      const k = key(pos);
      if (!next.has(k)) next.set(k, new Map());
      next.get(k).set(u, (next.get(k).get(u) || 0) + 1);
      // The lines were replayed as legal when the data was built.
      const m = C.pseudoMoves(pos).find((x) => C.uci(x) === u);
      pos = C.makeMove(pos, m);
      if (i === list.length - 1) {
        const at = key(pos);
        const had = named.get(at);
        // Transpositions: keep the shorter way in (usually the main name).
        if (!had || list.length < had.plies) named.set(at, { eco, name, plies: list.length });
      }
    });
  }
}

function nameOf(fen) {
  build();
  const hit = named.get(key(fen));
  return hit ? { eco: hit.eco, name: hit.name } : null;
}

function nameOfGame(ucis, fen = START) {
  build();
  let pos = C.parseFen(fen);
  let last = nameOf(pos);
  for (const u of ucis || []) {
    const m = C.moveFromText(pos, u);
    if (!m) break;
    pos = C.makeMove(pos, m);
    const n = named.get(key(pos));
    if (n) last = { eco: n.eco, name: n.name };
    else if (!next.has(key(pos))) break; // out of the book: the name stays the last one met
  }
  return last;
}

function bookMoves(fen) {
  build();
  const m = next.get(key(fen));
  if (!m) return [];
  return [...m.entries()].map(([uci, lines]) => ({ uci, lines })).sort((a, b) => b.lines - a.lines || a.uci.localeCompare(b.uci));
}

module.exports = { nameOf, nameOfGame, bookMoves, count: DATA.length, START };
