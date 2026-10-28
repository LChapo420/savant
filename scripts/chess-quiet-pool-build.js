/**
 * Builds content/chess-quiet-pool.js: "nothing to find" positions for the CH2
 * and CH3 unannounced tactics sittings (evidence article 04, P12; the gap noted
 * in content/skill-stage-checks.js). Each is built to look like the tactics
 * pool's positions at the same difficulty, and kept only when Stockfish finds
 * that no move wins anything.
 *
 *   - The material is a real pool position's, piece for piece (so a quiet
 *     position cannot be told apart by how many pieces it has), placed at random:
 *     kings not touching, no pawn on the first or last rank, White to move and
 *     not in check, Black not in check.
 *   - White has at least one capture to consider (the pool's items are mostly
 *     "one capture wins material"), and at least one legal move that is not mate.
 *   - Stockfish 19 at 1M nodes (one thread, as scripts/chess-engine-verify.js),
 *     MultiPV 3: no mate for either side, and the best line ends no better for
 *     White than the material on the board plus 80 centipawns (nothing to win)
 *     and no worse than 150 below it (not a position where the point is a defence).
 *
 *   node scripts/chess-quiet-pool-build.js [--per=40] [--d=2,3,4,5,6] [--nodes=1000000]
 *
 * Needs Stockfish on this machine (services/chess-engine.js). Writes only
 * content/chess-quiet-pool.js.
 */
const fs = require('fs');
const path = require('path');
const C = require('../content/chess-board');
const E = require('../services/chess-engine');
const POOL = require('../content/chess-tactics-pool');

const arg = (name, fallback) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : fallback; };
const PER = Number(arg('per', 40));
const NODES = Number(arg('nodes', 1000000));
const DIFFS = String(arg('d', '2,3,4,5,6')).split(',').map(Number);
const OUT = path.join(__dirname, '..', 'content', 'chess-quiet-pool.js');
const VALUE = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 0 };
const UP_MAX = 80;
const DOWN_MAX = 150;

let seed = 20261025;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function material(pos) {
  let m = 0;
  pos.board.forEach((p) => { if (p) m += (p === p.toUpperCase() ? 1 : -1) * VALUE[p.toLowerCase()]; });
  return m;
}

/** The same pieces as a pool position, on random squares. */
function scatter(fen) {
  const pieces = C.parseFen(fen).board.filter(Boolean);
  for (let tries = 0; tries < 200; tries++) {
    const board = Array(64).fill(null);
    let ok = true;
    for (const p of pieces) {
      let s = -1;
      for (let k = 0; k < 64 && s < 0; k++) {
        const c = Math.floor(rnd() * 64);
        const rank = c >> 3;
        if (board[c]) continue;
        if (p.toLowerCase() === 'p' && (rank === 0 || rank === 7)) continue;
        s = c;
      }
      if (s < 0) { ok = false; break; }
      board[s] = p;
    }
    if (!ok) continue;
    const pos = { board, side: 'w', castling: '', ep: -1 };
    const wk = C.kingSquare(pos, 'w');
    const bk = C.kingSquare(pos, 'b');
    if (wk < 0 || bk < 0) continue;
    if (Math.abs((wk >> 3) - (bk >> 3)) <= 1 && Math.abs((wk & 7) - (bk & 7)) <= 1) continue;
    if (C.inCheck(pos, 'w') || C.inCheck(pos, 'b')) continue;
    const moves = C.legalMoves(pos);
    if (!moves.length || moves.every((m) => C.isCheckmate(C.makeMove(pos, m)))) continue;
    if (!moves.some((m) => pos.board[m.to])) continue; // a capture to consider
    return pos;
  }
  return null;
}

async function build(d) {
  const kept = [];
  const seen = new Set();
  const src = POOL[d] || [];
  let tried = 0;
  while (kept.length < PER && tried < PER * 40) {
    tried++;
    const pos = scatter(src[Math.floor(rnd() * src.length)].fen);
    if (!pos) continue;
    const fen = C.toFen(pos);
    if (seen.has(fen)) continue;
    seen.add(fen);
    const a = await E.analyse(fen, { engine: 'stockfish', nodes: NODES, newGame: true, multipv: 3, options: { Threads: 1, Hash: 64 } });
    // parseInfo gives mate 0 when there is none. The best of the lines counts (the engine's
    // bestmove is listed first, but a line a node limit left behind can score higher).
    if (!a.lines.length || a.lines.some((l) => l.mate)) continue;
    const top = a.lines.slice().sort((x, y) => y.cp - x.cp)[0];
    const mat = material(pos);
    const gain = top.cp - mat;
    if (gain > UP_MAX || gain < -DOWN_MAX) continue;
    kept.push({ fen, material_cp: mat, eval_cp: top.cp, best: top.uci, depth: a.depth, source: 'generated' });
    if (kept.length % 10 === 0) console.log(`  d${d}: ${kept.length} kept of ${tried} tried`);
  }
  console.log(`d${d}: kept ${kept.length} of ${tried} tried`);
  return kept;
}

async function main() {
  const out = {};
  for (const d of DIFFS) out[d] = await build(d);
  E.closeAll();
  const body = Object.entries(out).map(([d, list]) => `  ${d}: [\n${list.map((it) => `    ${JSON.stringify(it)},`).join('\n')}\n  ],`).join('\n');
  fs.writeFileSync(OUT, `/**
 * "Nothing to find" positions for the unannounced tactics sittings (CH2, CH3),
 * by the tactics pool's difficulty. Written by scripts/chess-quiet-pool-build.js
 * on ${new Date().toISOString().slice(0, 10)}: each has a real pool position's pieces on random
 * squares, White to move with a capture to consider, and was kept only when
 * Stockfish 19 (${NODES} nodes, one thread, MultiPV 3) found no mate and no move that
 * ends better for White than the material on the board plus ${UP_MAX} centipawns.
 * The right answer is "nothing wins". Do not edit by hand; re-run the build.
 *
 * ${Object.entries(out).map(([d, l]) => `d${d} ${l.length}`).join(', ')}
 */
module.exports = {
${body}
};
`);
  console.log(`wrote ${OUT}`);
}

main().catch((e) => { console.error(e); E.closeAll(); process.exit(1); });
