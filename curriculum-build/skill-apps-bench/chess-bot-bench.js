// Run: node curriculum-build/skill-apps-bench/chess-bot-bench.js <absolute path to public/engine/chess>
// Scratch: speed of Savant's practice bot search (bot.js analyse/chooseMove) on node.
const dir = process.argv[2];
const C = require(dir + '/chess-core.js');
const B = require(dir + '/bot.js');
const fens = {
  italianMiddlegame: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7',
  kiwipete: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  endgameKRvK: '8/8/8/4k3/8/8/8/4K2R w K - 0 1',
};
for (const [name, fen] of Object.entries(fens)) {
  for (const depth of [2, 3, 4]) {
    const pos = C.parseFen(fen);
    const t = Date.now();
    const r = B.analyse(pos, { depth, maxNodes: 5e6 });
    const ms = Date.now() - t;
    console.log(name, 'depth', depth, 'nodes', r.nodes, 'ms', ms, 'nps', Math.round(r.nodes / Math.max(ms, 1) * 1000), 'best', r.moves[0].san, 'complete', r.complete);
  }
  const pos = C.parseFen(fen);
  const t = Date.now(); const m = B.chooseMove(pos, { strength: 10, random: () => 0.99 });
  console.log(name, 'chooseMove strength 10 ms', Date.now() - t, m.san);
}
