/**
 * THE FIX (went live in public/engine/chess/bot.js on 2026-10-24; rated as fix-*): chooseMove's node-budget fix.
 *
 * A practice opponent for the chess board: alpha-beta search over material and
 * piece placement, with a strength from 1 to 10.
 *
 * Strength sets how deep it looks and how often it lets a weaker move through, so
 * a five-year-old's friendly bot leaves pieces hanging and a strong one punishes
 * them. It is a sparring partner for the "play it out" activities and the grade
 * tournaments, not an engine to analyse with: the evaluation is simple on purpose.
 *
 * Needs chess-core.js (window.PolymathChess, or require on the server for tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../public/engine/chess/chess-core'));
  else root.PolymathChessBotCandidate = factory(root.PolymathChess);
})(typeof self !== 'undefined' ? self : this, function (C) {
  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

  // Piece-square tables from White's side, a8 first (rank 8 down to rank 1), as usually printed.
  const PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    kEnd: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };

  /** Table index for square s (a1 = 0) from the given colour's side. */
  const tableIndex = (s, white) => (white ? (7 - (s >> 3)) * 8 + (s & 7) : (s >> 3) * 8 + (s & 7));

  /** Score from White's side, in centipawns. */
  function evaluate(pos) {
    let score = 0;
    let heavy = 0;
    for (const p of pos.board) if (p && 'qQ'.includes(p)) heavy++;
    const endgame = heavy === 0 || pos.board.filter(Boolean).length <= 10;
    pos.board.forEach((p, s) => {
      if (!p) return;
      const t = p.toLowerCase();
      const white = p === p.toUpperCase();
      const table = t === 'k' && endgame ? PST.kEnd : PST[t];
      const v = VALUE[t] + table[tableIndex(s, white)];
      score += white ? v : -v;
    });
    return score;
  }

  const MATE = 100000;

  function ordered(pos, moves) {
    // Captures first, most valuable victim by least valuable attacker; then promotions.
    return moves.map((m) => ({ m, k: (m.captured ? 10 * VALUE[m.captured.toLowerCase()] - VALUE[m.piece.toLowerCase()] + 1000 : 0) + (m.promo ? 800 : 0) }))
      .sort((a, b) => b.k - a.k).map((x) => x.m);
  }

  function search(pos, depth, alpha, beta, ply, budget) {
    if (budget.nodes++ > budget.max) budget.out = true;
    const moves = C.legalMoves(pos);
    if (!moves.length) return C.inCheck(pos) ? -MATE + ply : 0;
    if (depth <= 0) return quiesce(pos, alpha, beta, 4, budget);
    for (const m of ordered(pos, moves)) {
      const v = -search(C.makeMove(pos, m), depth - 1, -beta, -alpha, ply + 1, budget);
      if (budget.out) return alpha;
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  // Look at captures past the horizon so the bot does not stop counting in the middle of a trade.
  function quiesce(pos, alpha, beta, left, budget) {
    budget.nodes++;
    const stand = (pos.side === 'w' ? 1 : -1) * evaluate(pos);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (left <= 0) return alpha;
    for (const m of ordered(pos, C.legalMoves(pos).filter((x) => x.captured || x.promo))) {
      const v = -quiesce(C.makeMove(pos, m), -beta, -alpha, left - 1, budget);
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  /**
   * Choose a move.
   *
   * @param {object} pos position from PolymathChess.parseFen
   * @param {object} [opts]
   * @param {number} [opts.strength] 1 (makes beginner slips) to 10 (searches deepest)
   * @param {function} [opts.random] a 0-1 random source, so a game can be replayed
   * @returns {{move: object, san: string, score: number}|null}
   */
  function chooseMove(pos, opts = {}) {
    const strength = Math.max(1, Math.min(10, Number(opts.strength) || 5));
    const rnd = opts.random || Math.random;
    const moves = C.legalMoves(pos);
    if (!moves.length) return null;
    const depth = strength <= 2 ? 1 : strength <= 5 ? 2 : strength <= 8 ? 3 : 4;
    // Iterative deepening, each depth with the full node budget (40,000 x depth) and the
    // root moves in the usual order: when the full depth fits in the budget the result is
    // exactly the old one; when it does not, the deepest depth searched in full decides.
    // (Before, the root moves left after the budget ran out all scored +MATE, so the bot
    // played an arbitrary move in busy positions at strengths 6-10.)
    let scored = null;
    for (let d = 1; d <= depth; d++) {
      const budget = { nodes: 0, max: 40000 * depth, out: false };
      const next = [];
      for (const m of ordered(pos, moves)) {
        const v = -search(C.makeMove(pos, m), d - 1, -MATE, MATE, 1, budget);
        if (budget.out) break;
        next.push({ m, v });
      }
      if (budget.out) break;
      scored = next.sort((a, b) => b.v - a.v);
    }
    if (!scored) scored = ordered(pos, moves).map((m) => ({ m, v: 0 })); // not even depth 1 fitted: never seen
    // Weaker bots sometimes take a worse move, and the gap they will accept grows as strength falls.
    const slip = (10 - strength) * 0.07;
    const margin = (10 - strength) * 45;
    let pick = scored[0];
    if (rnd() < slip) {
      const near = scored.filter((x) => x.v >= scored[0].v - margin && x.v > -MATE / 2);
      if (near.length) pick = near[Math.floor(rnd() * near.length)];
    }
    return { move: pick.m, san: C.san(pos, pick.m), score: pick.v };
  }

  /**
   * Every legal move scored by a full search, best first: for reviewing a game and
   * checking a puzzle, not for playing. Each root move gets its own full window, so
   * its score is exact to the depth searched, not just "worse than the best".
   *
   * @param {object} pos
   * @param {object} [opts]
   * @param {number} [opts.depth] plies, 1-5 (default 3)
   * @param {number} [opts.maxNodes] node budget; past it the result says complete: false
   * @returns {{moves: Array<{move, san, score, mate}>, complete: boolean, nodes: number}}
   *          score in centipawns for the side to move; mate is moves to mate (+ we mate, - we are mated) or 0
   */
  function analyse(pos, opts = {}) {
    const depth = Math.max(1, Math.min(5, Number(opts.depth) || 3));
    const budget = { nodes: 0, max: Number(opts.maxNodes) || 400000, out: false };
    const moves = ordered(pos, C.legalMoves(pos)).map((m) => {
      const v = -search(C.makeMove(pos, m), depth - 1, -MATE, MATE, 1, budget);
      return { move: m, san: C.san(pos, m), score: v, mate: mateIn(v) };
    }).sort((a, b) => b.score - a.score);
    return { moves, complete: !budget.out, nodes: budget.nodes };
  }

  /** A search score as moves to mate: positive when the side to move mates, 0 when no mate is seen. */
  function mateIn(score) {
    if (Math.abs(score) < MATE / 2) return 0;
    const plies = MATE - Math.abs(score);
    return (score > 0 ? 1 : -1) * Math.ceil(plies / 2);
  }

  return { chooseMove, evaluate, analyse, mateIn, MATE };
});
