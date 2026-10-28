/**
 * Coaching words worked out from the position: why a move is not the one a guided
 * step wants, and how good each move of a finished game was.
 *
 *   wrongMoveReason(pos, move, expected)  a gentle sentence, with the reason when
 *                                         one can be computed ("that square is
 *                                         attacked by the black knight on f6")
 *   classify(loss)                        best | good | inaccuracy | mistake | blunder
 *   winChance(cp)                         0-100, the mover's expected score
 *
 * Shared by the browser (window.PolymathChessTeach) and node tests. Needs
 * chess-core.js, and bot.js for the "good move too" check.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chess-core'), require('./bot'));
  else root.PolymathChessTeach = factory(root.PolymathChess, root.PolymathChessBot);
})(typeof self !== 'undefined' ? self : this, function (C, bot) {
  const colourName = (c) => (c === 'w' ? 'white' : 'black');
  const sideName = (c) => (c === 'w' ? 'White' : 'Black');
  const worth = (p) => C.VALUES[p.toLowerCase()];

  /** "the black knight on f6" */
  function label(pos, s) {
    const p = pos.board[s];
    return `the ${colourName(C.colorOf(p))} ${C.NAMES[p.toLowerCase()]} on ${C.sqName(s)}`;
  }

  /** Can the piece on `s` be taken for less than it is worth? Returns the cheapest taker's square, or -1. */
  function loose(pos, s) {
    const p = pos.board[s];
    if (!p || p.toLowerCase() === 'k') return -1;
    const me = C.colorOf(p);
    let takers = C.attackers(pos, s, C.other(me));
    const defended = C.attacked(pos, s, me);
    if (defended) takers = takers.filter((t) => pos.board[t].toLowerCase() !== 'k');
    if (!takers.length) return -1;
    if (!defended) return takers[0];
    return worth(pos.board[takers[0]]) < worth(p) ? takers[0] : -1;
  }

  const mates = (pos, m) => C.isCheckmate(C.makeMove(pos, m));

  /**
   * A gentle sentence for a move that is not one of `expected` (legal moves in
   * `pos`), with the most useful reason that can be computed.
   */
  function wrongMoveReason(pos, move, expected, opts) {
    opts = opts || {};
    if (!move) return 'That is not a legal move here. Try again.';
    const me = pos.side;
    const after = C.makeMove(pos, move);
    const main = expected[0];
    if (main && expected.every((m) => mates(pos, m))) {
      if (C.inCheck(after)) return 'That gives check, but the king can still get away. Look for the check that leaves it no escape.';
      return 'There is a checkmate here. Look for a move that attacks the king and leaves it nowhere to go.';
    }
    // Something of ours is left to be taken: the piece just moved first.
    const taker = loose(after, move.to);
    if (taker >= 0 && !(move.captured && worth(move.captured) >= worth(move.piece))) {
      return `Careful: ${label(after, taker)} could take your ${C.NAMES[move.piece.toLowerCase()]} on ${C.sqName(move.to)}. Try again.`;
    }
    // A mate for the other side next move.
    const replies = C.legalMoves(after);
    const mate = replies.find((r) => C.isCheckmate(C.makeMove(after, r)));
    if (mate) return `After that, ${sideName(C.other(me))} could checkmate with ${C.san(after, mate)}. Try again.`;
    for (let s = 0; s < 64; s++) {
      const p = after.board[s];
      if (!p || C.colorOf(p) !== me || s === move.to || worth(p) < 3) continue;
      if (loose(after, s) >= 0 && loose(pos, s) < 0) return `That leaves your ${C.NAMES[p.toLowerCase()]} on ${C.sqName(s)} unprotected. Try again.`;
    }
    if (main) {
      const mainAfter = C.makeMove(pos, main);
      // What the moved piece hits afterwards: the king and anything worth 3 or more.
      const hits = (p, s) => C.pseudoMoves({ ...p, side: me, ep: -1 }).filter((m) => m.from === s && m.captured
        && (m.captured.toLowerCase() === 'k' || worth(m.captured) >= 3)).length;
      if (main.captured && !move.captured) return 'There is something you can capture here. Look again.';
      if (hits(mainAfter, main.to) >= 2 && hits(after, move.to) < 2) return 'Look for a move that attacks two things at once.';
      if (C.inCheck(mainAfter) && !C.inCheck(after)) return 'Look for a move that gives check.';
      if (main.promo && !move.promo) return 'One of your pawns can promote.';
      if (move.piece !== main.piece && opts.pieceHint !== false) return `Try moving a different piece: your ${C.NAMES[main.piece.toLowerCase()]}.`;
    }
    // As good as the lesson's move, by a short search: say so, kindly.
    if (main && bot && !opts.noSearch) {
      const scores = bot.analyse(pos, { depth: 2, maxNodes: 60000 });
      const of = (m) => (scores.moves.find((x) => C.uci(x.move) === C.uci(m)) || {}).score;
      const mine = of(move);
      const theirs = of(main);
      if (scores.complete && mine !== undefined && theirs !== undefined && mine >= theirs - 25) {
        return 'That is a good move too, but this lesson follows a different one. Try again.';
      }
    }
    return 'Not this time. Try again.';
  }

  /** Expected score 0-100 for the side whose evaluation `cp` is (logistic, 400 points = 10 to 1). */
  function winChance(cp) {
    const c = Math.max(-2000, Math.min(2000, cp));
    return 100 / (1 + Math.pow(10, -c / 400));
  }

  /**
   * How good a move was, from how much expected score it gave up compared with the
   * best move (both from the mover's side, 0-100). Thresholds are ours.
   */
  function classify(bestCp, playedCp, isBest) {
    if (isBest) return 'best';
    const loss = winChance(bestCp) - winChance(playedCp);
    if (loss < 4) return 'best';
    if (loss < 10) return 'good';
    if (loss < 20) return 'inaccuracy';
    if (loss < 35) return 'mistake';
    return 'blunder';
  }

  /**
   * One move of a finished game, judged by the bot's full search: the best move,
   * how the played move scored, and its class. A move that looks like a mistake
   * at the base depth is searched one ply deeper before it is called one, so a
   * short horizon does not brand a good move a blunder.
   *
   * @param {string} fen the position before the move
   * @param {string} uci the move played
   * @param {{depth?: number, maxNodes?: number}} [opts]
   */
  function reviewPly(fen, uci, opts) {
    opts = opts || {};
    const pos = C.parseFen(fen);
    const run = (depth, maxNodes) => bot.analyse(pos, { depth, maxNodes });
    let depth = opts.depth || 3;
    let a = run(depth, opts.maxNodes || 300000);
    const judge = (res) => {
      const best = res.moves[0];
      const played = res.moves.find((m) => C.uci(m.move) === uci);
      if (!best || !played) return null;
      const same = C.uci(best.move) === uci || played.score >= best.score;
      return { best, played, cls: classify(best.score, played.score, same) };
    };
    let j = judge(a);
    if (j && /mistake|blunder|inaccuracy/.test(j.cls) && depth < 4) {
      const deeper = run(depth + 1, (opts.maxNodes || 300000) * 3);
      const jd = deeper.complete ? judge(deeper) : null;
      if (jd) { a = deeper; j = jd; depth += 1; }
    }
    if (!j) return null;
    // A mate passed over is never "good", however big the lead that is left.
    const ORDER = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];
    let cls = j.cls;
    const missedMate = j.best.mate > 0 && !(j.played.mate > 0) ? j.best.mate : 0;
    if (missedMate) {
      const floor = missedMate === 1 ? 'mistake' : 'inaccuracy';
      if (ORDER.indexOf(cls) < ORDER.indexOf(floor)) cls = floor;
    }
    const out = (m) => ({ uci: C.uci(m.move), san: m.san, score: m.score, mate: m.mate });
    return { best: out(j.best), played: out(j.played), class: cls, missedMate, depth, complete: a.complete, side: pos.side };
  }

  return { wrongMoveReason, classify, winChance, label, loose, reviewPly };
});
