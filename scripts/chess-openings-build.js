/**
 * Build content/chess-openings.js from the lichess-org/chess-openings TSV files
 * (a.tsv ... e.tsv: ECO code, name, moves), which are CC0 ("As a collection of
 * facts, this data set is in the public domain"; COPYING.txt is CC0 1.0).
 *
 *   node scripts/chess-openings-build.js [--write] [--dir=<folder with a.tsv ... e.tsv>]
 *
 * Every line is replayed with chess-core and stored as from-to moves, so a wrong
 * or ambiguous move in the source is caught here rather than in the app. The
 * default folder is ../offline-sources/chess/lichess-openings next to the app.
 */
const fs = require('fs');
const path = require('path');
const C = require('../content/chess-board');

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};
const DIR = arg('dir', path.join(__dirname, '..', '..', 'offline-sources', 'chess', 'lichess-openings'));
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * The legal move a SAN token names, checked by writing that move's own SAN back:
 * only the moves to the named square are written out (chess-core's moveFromText
 * writes every legal move, which is too slow for 40,000 moves).
 */
function sanMove(pos, tok) {
  const want = tok.replace(/[+#!?]/g, '');
  const legal = C.legalMoves(pos);
  let cands;
  if (/^O-O(-O)?$/.test(want)) cands = legal.filter((m) => m.castle);
  else {
    const sq = want.replace(/=[QRBN]$/, '').slice(-2);
    cands = legal.filter((m) => C.sqName(m.to) === sq);
  }
  const hit = cands.filter((m) => C.san(pos, m).replace(/[+#]/g, '') === want);
  return hit.length === 1 ? hit[0] : null;
}

function main() {
  const out = [];
  const bad = [];
  for (const f of ['a', 'b', 'c', 'd', 'e']) {
    const text = fs.readFileSync(path.join(DIR, `${f}.tsv`), 'utf8');
    const rows = text.split(/\r?\n/).filter(Boolean);
    for (const row of rows.slice(1)) {
      const [eco, name, pgn] = row.split('\t');
      let pos = C.parseFen(START);
      const moves = [];
      let ok = true;
      for (const tok of pgn.split(/\s+/)) {
        if (!tok || /^\d+\.+$/.test(tok)) continue;
        const m = sanMove(pos, tok);
        if (!m) { ok = false; break; }
        moves.push(C.uci(m));
        pos = C.makeMove(pos, m);
      }
      if (ok && moves.length) out.push([eco, name, moves.join(' ')]);
      else bad.push(`${eco} ${name}: ${pgn}`);
    }
  }
  console.log(`${out.length} lines replayed, ${bad.length} refused`);
  bad.slice(0, 10).forEach((b) => console.log(`  refused ${b}`));
  if (process.argv.includes('--write')) {
    const file = path.join(__dirname, '..', 'content', 'chess-openings-data.js');
    fs.writeFileSync(file, `/**
 * Opening names by ECO code, from lichess-org/chess-openings (CC0 1.0: "As a
 * collection of facts, this data set is in the public domain"). Thank you, Lichess.
 * Written by scripts/chess-openings-build.js: [eco, name, from-to moves], every
 * line replayed with chess-core. Do not edit by hand; re-run the build.
 */
module.exports = [
${out.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
];
`);
    console.log(`wrote ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  }
}

main();
