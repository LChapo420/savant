/**
 * Exact answers about short forced lines, for checking puzzles before a learner
 * sees them: which first moves force mate within n moves, and whether a line of
 * moves is legal from its position.
 *
 * Mate search is exhaustive (every defence is tried), so "the only move that mates
 * in two" means exactly that. Material wins are judged by the practice bot's full
 * search (public/engine/chess/bot.js analyse), which is a strong hint rather than
 * proof; puzzles say which kind of check they passed.
 */
const C = require('./chess-board');
const bot = require('../public/engine/chess/bot');

/** Checks first, then captures: mates are found sooner. */
function forcingFirst(pos, moves) {
  return moves.map((m) => {
    const after = C.makeMove(pos, m);
    return { m, k: (C.inCheck(after) ? 2 : 0) + (m.captured ? 1 : 0), after };
  }).sort((a, b) => b.k - a.k);
}

/** Can the side to move force checkmate within n of its own moves? */
function forcesMate(pos, n) {
  const moves = forcingFirst(pos, C.legalMoves(pos));
  for (const { after } of moves) if (C.isCheckmate(after)) return true;
  if (n <= 1) return false;
  for (const { after } of moves) {
    const replies = C.legalMoves(after);
    if (!replies.length) continue; // stalemate, or mate already counted above
    if (replies.every((r) => forcesMate(C.makeMove(after, r), n - 1))) return true;
  }
  return false;
}

/** Every first move that forces mate within n moves. */
function mateMoves(pos, n) {
  return C.legalMoves(pos).filter((m) => {
    const after = C.makeMove(pos, m);
    if (C.isCheckmate(after)) return true;
    if (n <= 1) return false;
    const replies = C.legalMoves(after);
    return replies.length > 0 && replies.every((r) => forcesMate(C.makeMove(after, r), n - 1));
  });
}

/** The fewest moves to a forced mate, up to `max`, or 0 when there is none that short. */
function mateDistance(pos, max = 3) {
  for (let n = 1; n <= max; n++) if (forcesMate(pos, n)) return n;
  return 0;
}

/**
 * The defence that holds out longest against a mate: the reply after which the
 * attacker needs the most moves to mate (ties go to the bot's choice).
 */
function longestDefence(pos, max = 3) {
  const replies = C.legalMoves(pos);
  if (!replies.length) return null;
  let best = null;
  for (const r of replies) {
    const d = mateDistance(C.makeMove(pos, r), max) || max + 1;
    if (!best || d > best.d) best = { m: r, d };
  }
  return best.m;
}

/** Replay a list of moves (algebraic or from-to) from a FEN; null at the first illegal one. */
function replay(fen, moves) {
  let pos = C.parseFen(fen);
  const out = [];
  for (const text of moves) {
    const m = C.moveFromText(pos, text);
    if (!m) return null;
    out.push({ move: m, san: C.san(pos, m), uci: C.uci(m), before: pos });
    pos = C.makeMove(pos, m);
  }
  return { steps: out, end: pos };
}

/** The bot's full-search scores for every move, best first. */
function scored(pos, depth = 4) {
  return bot.analyse(pos, { depth, maxNodes: 2500000 });
}

module.exports = { forcesMate, mateMoves, mateDistance, longestDefence, replay, scored };
