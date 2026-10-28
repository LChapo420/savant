/**
 * Build the puzzle trainer's starter set: content/chess-puzzles.js.
 *
 *   NODE_PATH=../node_modules node scripts/chess-puzzles-build.js [--write]
 *
 * Every puzzle below was set up by hand for this app (classic patterns, our own
 * positions), plus each one mirrored for the other colour. Nothing is copied from
 * a puzzle database. Each is checked with chess-core and the solver before it is
 * kept:
 *
 *   mate      the first move is the ONLY move that forces mate in n, and no
 *             shorter mate exists; the defence is the one that holds out longest.
 *   material  the bot's full search (depth 4) puts the first move at least 150
 *             centipawns above every other move, and the line ends ahead by at
 *             least two points of material.
 *
 * Ratings are our estimates on the Glicko scale (a beginner near 600, a club
 * player near 1500); they are not measured.
 *
 * Stockfish re-check (2026-10-22, scripts/chess-engine-verify.js): six material
 * puzzles were bare-king endings where the captured piece cannot win (king and
 * knight, or bishop, against a king is a draw), so every move drew and the key
 * did not stand out. Pawns were added (and a white rook in pawn-fork) so that
 * winning the material decides the game, and Stockfish now rates each key
 * clearly best. pin-win was removed: White was winning without the key, and with
 * pawns added to balance it the line came out about level.
 */
const fs = require('fs');
const path = require('path');
const C = require('../content/chess-board');
const S = require('../content/chess-solver');

// [id, fen, first move, kind ('mate' n | 'material' plies), rating, themes, hint]
const SOURCE = [
  ['back-rank-rook', '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'Rd8#', ['mate', 1], 450, ['mateIn1', 'backRank'], 'The king is boxed in by its own pawns.'],
  ['queen-corner', 'k7/8/1K6/8/8/8/7Q/8 w - - 0 1', 'Qh8#', ['mate', 1], 550, ['mateIn1', 'queen'], 'Your king already guards a7 and b7.'],
  ['rook-ladder', '6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1', 'Rb8#', ['mate', 1], 500, ['mateIn1', 'ladder'], 'One rook holds the seventh rank.'],
  ['smothered', '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 'Nf7#', ['mate', 1], 750, ['mateIn1', 'smothered'], 'The king is surrounded by its own pieces.'],
  ['weak-f7', 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1', 'Qxf7#', ['mate', 1], 600, ['mateIn1', 'opening'], 'f7 is guarded only by the king.'],
  ['arabian', '7k/R7/5N2/8/8/8/8/6K1 w - - 0 1', 'Rh7#', ['mate', 1], 800, ['mateIn1', 'rookKnight'], 'The knight guards g8 and h7.'],
  ['queen-king', '4k3/8/4K3/8/8/8/8/6Q1 w - - 0 1', 'Qg8#', ['mate', 1], 500, ['mateIn1', 'queen'], 'Your king covers the seventh rank squares.'],
  ['rook-king', 'k7/8/1K6/8/8/8/8/7R w - - 0 1', 'Rh8#', ['mate', 1], 450, ['mateIn1', 'rook'], 'Your king guards the escape squares.'],
  ['fianchetto-hole', '6k1/5p1p/6pQ/8/8/8/1B6/6K1 w - - 0 1', 'Qg7#', ['mate', 1], 700, ['mateIn1', 'queenBishop'], 'The bishop on b2 supports the queen.'],
  ['free-queen', '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', 'Rxd5', ['material', 1], 400, ['hangingPiece'], 'Look at what your rook can reach.'],
  ['free-rook', 'r3k3/6pp/1N6/8/8/8/PP6/4K3 w - - 0 1', 'Nxa8', ['material', 1], 450, ['hangingPiece'], 'Count the knight\'s jumps.'],
  ['pawn-takes', '4k3/6pp/8/3n4/4P3/8/PP6/4K3 w - - 0 1', 'exd5', ['material', 1], 400, ['hangingPiece'], 'Pawns capture on the diagonal.'],
  ['knight-fork-rook', 'r3k3/6pp/8/1N6/8/8/PP6/4K3 w - - 0 1', 'Nc7+', ['material', 3], 750, ['fork'], 'A check that attacks something else too.'],
  ['knight-fork-queen', 'q3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Nc7+', ['material', 3], 700, ['fork'], 'A check that attacks something else too.'],
  ['pawn-fork', '4k3/pp4pp/8/2n1n3/8/3P4/PP4PP/R3K3 w - - 0 1', 'd4', ['material', 3], 900, ['fork', 'pawn'], 'A pawn can attack two pieces at once.'],
  ['queen-fork', '4k3/4p3/8/1n6/8/8/8/3Q2K1 w - - 0 1', 'Qh5+', ['material', 3], 950, ['fork', 'queen'], 'Check the king and hit the knight in one move.'],
  ['royal-fork', '4k3/8/8/3q4/4N3/8/8/6K1 w - - 0 1', 'Nf6+', ['material', 3], 850, ['fork'], 'Which knight jump checks the king and hits the queen?'],
  ['bishop-fork', '4k3/6pp/8/8/r7/3B4/PP6/4K3 w - - 0 1', 'Bb5+', ['material', 3], 850, ['fork', 'bishop'], 'A bishop check can hit something on the same diagonal line.'],
  ['discovered', '4k3/3p4/8/4q3/4B3/8/8/4R1K1 w - - 0 1', 'Bg6+', ['material', 3], 1150, ['discoveredAttack'], 'Move the bishop out of the rook\'s way, with check.'],
  ['opera-finish', '1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 1', 'Rd8#', ['mate', 1], 800, ['mateIn1', 'historic'], 'The bishop on g5 guards d8 and e7.'],
  ['opera-queen', '4kb1r/p2n1ppp/4q3/1Q2p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 1', 'Qb8+', ['mate', 2], 1350, ['mateIn2', 'sacrifice', 'historic'], 'Give the queen to pull the knight away from d7.'],
  ['legal-mate', 'rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 1', 'Bxf7+', ['mate', 2], 1500, ['mateIn2', 'historic'], 'Your queen is gone, but your minor pieces can mate.'],
  ['weak-f2', 'r1b1k1nr/pppp1ppp/2n5/2b1p3/2B1P2q/2N5/PPPP1PPP/R1BQK1NR b KQkq - 0 1', 'Qxf2#', ['mate', 1], 650, ['mateIn1', 'opening'], 'f2 is guarded only by the king.'],
  ['queen-sac-back-rank', '2r3k1/5ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1', 'Qd8+', ['mate', 2], 1150, ['mateIn2', 'backRank', 'sacrifice'], 'Your rook stands behind your queen on the d-file.'],
  ['rook-skewer', '7R/8/8/2k5/8/8/7K/2q5 w - - 0 1', 'Rc8+', ['material', 3], 1000, ['skewer'], 'Attack the king; something stands behind it.'],
  ['legacy', '5r1k/6pp/7N/3Q4/8/8/8/6K1 w - - 0 1', 'Qg8+', ['mate', 2], 1400, ['mateIn2', 'smothered', 'sacrifice'], 'Give up the queen to smother the king.'],
  ['doubled-rooks', '3qr1k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1', 'Rxe8+', ['mate', 2], 1200, ['mateIn2', 'backRank'], 'Two rooks on one file beat one defender.'],
];

/** The same puzzle with the colours swapped: ranks mirrored, case swapped, other side to move. */
function mirror(fen) {
  const pos = C.parseFen(fen);
  const board = Array(64).fill(null);
  pos.board.forEach((p, s) => {
    if (!p) return;
    const t = ((7 - (s >> 3)) * 8) + (s & 7);
    board[t] = p === p.toUpperCase() ? p.toLowerCase() : p.toUpperCase();
  });
  const castling = pos.castling.split('').map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
  const ep = pos.ep < 0 ? -1 : ((7 - (pos.ep >> 3)) * 8) + (pos.ep & 7);
  return C.toFen({ board, side: C.other(pos.side), castling, ep });
}

function mirrorMove(fen, text) {
  const pos = C.parseFen(fen);
  const m = C.moveFromText(pos, text);
  if (!m) return 'none';
  const flip = (s) => ((7 - (s >> 3)) * 8) + (s & 7);
  return C.sqName(flip(m.from)) + C.sqName(flip(m.to)) + (m.promo || '');
}

const material = (pos, side) => pos.board.reduce((n, p) => (p && C.colorOf(p) === side ? n + C.VALUES[p.toLowerCase()] : n), 0);

/** Check one puzzle and work out its line, or say why it fails. */
function build([id, fen, first, [kind, n], rating, themes, hint]) {
  const pos = C.parseFen(fen);
  const m = C.moveFromText(pos, first);
  if (!m) return { id, error: `${first} is not legal` };
  const side = pos.side;
  const line = [C.uci(m)];
  let at = C.makeMove(pos, m);
  if (kind === 'mate') {
    const firsts = S.mateMoves(pos, n).map((x) => C.uci(x));
    if (firsts.length !== 1 || firsts[0] !== C.uci(m)) return { id, error: `mate in ${n}: moves that mate are [${firsts.join(', ')}]` };
    if (n > 1 && S.mateDistance(pos, n - 1)) return { id, error: `there is a shorter mate than ${n}` };
    for (let left = n - 1; left >= 1; left--) {
      const r = S.longestDefence(at, left);
      line.push(C.uci(r));
      at = C.makeMove(at, r);
      const next = S.mateMoves(at, left);
      if (!next.length) return { id, error: 'the line lost the mate' };
      line.push(C.uci(next[0]));
      at = C.makeMove(at, next[0]);
    }
    if (!C.isCheckmate(at)) return { id, error: 'the line does not end in mate' };
    return { id, fen, line, rating, themes, hint, kind, n, check: `the only move that mates in ${n}` };
  }
  // A material puzzle: the first move must stand out under a full search.
  const scores = S.scored(pos, 4);
  if (!scores.complete) return { id, error: 'search ran out of budget' };
  const [best, second] = scores.moves;
  if (C.uci(best.move) !== C.uci(m)) return { id, error: `the bot prefers ${best.san} (${best.score}) to ${first}` };
  const gap = second ? best.score - second.score : Infinity;
  if (gap < 150) return { id, error: `${first} is only ${gap} cp better than ${second.san}` };
  let plies = 1;
  while (plies < n) {
    const reply = S.scored(at, 3).moves[0];
    if (!reply) break;
    line.push(C.uci(reply.move));
    at = C.makeMove(at, reply.move);
    plies++;
    if (plies >= n) break;
    const next = S.scored(at, 3).moves;
    if (next.length > 1 && next[0].score - next[1].score < 150) return { id, error: `move ${plies + 1} is not unique (${next[0].san} vs ${next[1].san})` };
    line.push(C.uci(next[0].move));
    at = C.makeMove(at, next[0].move);
    plies++;
  }
  const gain = (material(at, side) - material(at, C.other(side))) - (material(pos, side) - material(pos, C.other(side)));
  if (gain < 2) return { id, error: `the line wins only ${gain} points` };
  return { id, fen, line, rating, themes, hint, kind, n: Math.ceil(n / 2), check: `bot depth 4: best by ${gap === Infinity ? 'the only move' : `${gap} cp`}, wins ${gain}` };
}

function main() {
  const sources = [];
  for (const s of SOURCE) {
    sources.push(s);
    const [id, fen, first, ...rest] = s;
    sources.push([`${id}-b`, mirror(fen), mirrorMove(fen, first), ...rest]);
  }
  const kept = [];
  for (const s of sources) {
    const out = build(s);
    if (out.error) console.log(`  drop ${out.id}: ${out.error}`);
    else {
      kept.push(out);
      console.log(`  keep ${out.id} (${out.rating}) ${out.line.join(' ')} — ${out.check}`);
    }
  }
  console.log(`${kept.length} of ${sources.length} kept`);
  if (process.argv.includes('--write')) {
    const body = kept.map((p) => `  ${JSON.stringify({ id: p.id, fen: p.fen, line: p.line, rating: p.rating, themes: p.themes, kind: p.kind, moves: p.n, hint: p.hint, verified: p.check })},`).join('\n');
    const file = path.join(__dirname, '..', 'content', 'chess-puzzles.js');
    fs.writeFileSync(file, `/**
 * The puzzle trainer's starter set, written by scripts/chess-puzzles-build.js:
 * positions set up for this app (and each mirrored for the other colour), every
 * line replayed with chess-core and every first move checked (see "verified").
 * "line" is from-to moves: the learner's, then the reply, and so on.
 * Ratings are estimates on the Glicko scale. Do not edit by hand; edit the source
 * list in the build script and run it with --write.
 */
module.exports = [
${body}
];
`);
    console.log(`wrote ${file}`);
  }
  return kept;
}

if (require.main === module) main();
module.exports = { build, mirror, SOURCE };
