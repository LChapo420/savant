/**
 * Import a curated, themed, rated set of puzzles from the Lichess puzzle database
 * into content/chess-puzzles-lichess.js, each one re-checked before it is kept.
 *
 *   node scripts/chess-lichess-import.js            select + verify, print a report
 *   node scripts/chess-lichess-import.js --write    ... and write the content file
 *   options: --per-band=200  --nodes=800000  --workers=6  --db=<path to lichess_db_puzzle.csv.zst>
 *
 * Source and licence. https://database.lichess.org/ (lichess_db_puzzle.csv.zst):
 * "Database exports are released under the Creative Commons CC0 license." CC0
 * needs no attribution; we credit Lichess anyway (file header, and a link to each
 * puzzle shown after it is played). Only the data is used: no Lichess code (AGPL/GPL)
 * is copied. The file is not in the repo; by default it is read from
 * ../offline-sources/chess/lichess-puzzles/ next to the app folder.
 *
 * Selection (the plan in curriculum-build/chess/TOOLS-NOTES.md):
 *   - Popularity >= 85, NbPlays >= 500, RatingDeviation <= 80; no "veryLong" lines
 *     (at most three moves for the learner), no mate-in-5, no "equality" puzzles.
 *   - Twenty 100-point bands from 400 to 2399, the same number in each, taken in
 *     turn from theme families (mate in 1, 2, 3+, fork, pin, skewer, discovered
 *     attack, hanging piece, trapped piece, sacrifice/deflection, promotion,
 *     endgame, defence, other), most popular first within a family.
 *
 * Checks, for every puzzle kept:
 *   - chess-core: the FEN is sound; the first move in Moves is the opponent's and
 *     is applied first (as Lichess does); every move of the line is legal; a mate
 *     puzzle ends in checkmate.
 *   - Stockfish (run here on our machine; see services/chess-engine.js), MultiPV 2
 *     with a fixed node budget (800k by default), at every learner move:
 *       mate       the line's move mates in the moves left and no other move does
 *                  (on the last move any mate is accepted by the trainer, so a
 *                  second mate there is fine);
 *       advantage  the line's move is the engine's best and the next best gives
 *                  up at least 15 points of expected score (teach.winChance), and
 *                  the line ends at least +2.0 or mating.
 *   - Our exhaustive solver (content/chess-solver.js) proves mate-in-1 and mate-in-2
 *     puzzles have exactly one first move that mates in time.
 */
const fs = require('fs');
const path = require('path');
const C = require('../content/chess-board');
const S = require('../content/chess-solver');
const E = require('../services/chess-engine');
const T = require('../public/engine/chess/teach');
const { readLines } = require('./lib/zst-lines');

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};
const DB = arg('db', process.env.LICHESS_PUZZLES || path.join(__dirname, '..', '..', 'offline-sources', 'chess', 'lichess-puzzles', 'lichess_db_puzzle.csv.zst'));
const PER_BAND = Number(arg('per-band', 200));
const NODES = Number(arg('nodes', 800000));
const WORKERS = Number(arg('workers', 10));
const SEARCH = { engine: 'stockfish', nodes: NODES, options: { Threads: 1, Hash: 16 } };
// Every verdict is kept here, so a run that is stopped picks up where it was.
const CACHE = arg('cache', path.join(path.dirname(DB), `verified-${NODES}.jsonl`));
const BANDS = Array.from({ length: 20 }, (_, i) => 400 + 100 * i);
const OVERSAMPLE = 2.2;

const FAMILIES = [
  ['mateIn1', ['mateIn1']],
  ['mateIn2', ['mateIn2']],
  ['mateIn3', ['mateIn3', 'mateIn4']],
  ['fork', ['fork']],
  ['pin', ['pin']],
  ['skewer', ['skewer']],
  ['discoveredAttack', ['discoveredAttack', 'discoveredCheck', 'doubleCheck']],
  ['hangingPiece', ['hangingPiece']],
  ['trappedPiece', ['trappedPiece']],
  ['sacrifice', ['sacrifice', 'deflection', 'attraction', 'clearance', 'interference', 'capturingDefender', 'xRayAttack']],
  ['promotion', ['promotion', 'advancedPawn', 'underPromotion']],
  ['endgame', ['pawnEndgame', 'rookEndgame', 'bishopEndgame', 'knightEndgame', 'queenEndgame', 'queenRookEndgame', 'zugzwang']],
  ['defence', ['defensiveMove', 'quietMove', 'intermezzo']],
  ['other', []],
];
const familyOf = (themes) => (FAMILIES.find(([, tags]) => !tags.length || tags.some((t) => themes.has(t))) || ['other'])[0];

// Themes worth showing a learner (Lichess's length and phase tags are left out).
const SHOWN = new Set(['mate', 'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck',
  'doubleCheck', 'hangingPiece', 'trappedPiece', 'sacrifice', 'deflection', 'attraction', 'clearance', 'interference', 'capturingDefender',
  'xRayAttack', 'promotion', 'advancedPawn', 'underPromotion', 'backRankMate', 'smotheredMate', 'anastasiaMate', 'arabianMate', 'bodenMate',
  'doubleBishopMate', 'dovetailMate', 'hookMate', 'killBoxMate', 'operaMate', 'pillsburysMate', 'triangleMate', 'vukovicMate', 'cornerMate',
  'balestraMate', 'blindSwineMate', 'epauletteMate', 'morphysMate', 'swallowstailMate', 'pawnEndgame', 'rookEndgame', 'bishopEndgame',
  'knightEndgame', 'queenEndgame', 'queenRookEndgame', 'zugzwang', 'defensiveMove', 'quietMove', 'intermezzo', 'exposedKing',
  'kingsideAttack', 'queensideAttack', 'attackingF2F7', 'enPassant', 'castling', 'opening', 'middlegame', 'endgame', 'crushing', 'advantage']);

// ── 1. select ───────────────────────────────────────────────────────────────
async function select() {
  if (!fs.existsSync(DB)) throw new Error(`Puzzle database not found: ${DB}`);
  const pools = new Map(); // band -> family -> [{score,...}]
  const cap = Math.ceil((PER_BAND * OVERSAMPLE) / 4);
  let rows = 0;
  let passed = 0;
  let header = null;
  await readLines(DB, (line) => {
    if (!header) { header = line.split(','); return; }
    rows++;
    const c = line.split(',');
    const [id, fen, moves, rating, rd, pop, plays, themes, url, opening] = c;
    const r = Number(rating);
    if (Number(pop) < 85 || Number(plays) < 500 || Number(rd) > 80) return;
    if (r < 400 || r >= 2400) return;
    const th = new Set(themes.split(' '));
    if (th.has('veryLong') || th.has('mateIn5') || th.has('equality')) return;
    const plies = moves.split(' ').length - 1;
    if (plies < 1 || plies > 6) return;
    passed++;
    const band = BANDS[Math.floor((r - 400) / 100)];
    const fam = familyOf(th);
    if (!pools.has(band)) pools.set(band, new Map());
    const byFam = pools.get(band);
    if (!byFam.has(fam)) byFam.set(fam, []);
    const list = byFam.get(fam);
    const score = Number(pop) * Math.log10(Number(plays));
    list.push({ id, fen, moves, rating: r, rd: Number(rd), pop: Number(pop), plays: Number(plays), themes, url, opening, score, fam });
    if (list.length > cap * 3) { list.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)); list.length = cap; }
  });
  // Round-robin over families inside each band, most popular first.
  const order = [];
  for (const band of BANDS) {
    const byFam = pools.get(band) || new Map();
    const lists = FAMILIES.map(([f]) => (byFam.get(f) || []).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)));
    const picked = [];
    for (let i = 0; picked.length < PER_BAND * OVERSAMPLE; i++) {
      let any = false;
      for (const l of lists) if (l[i]) { picked.push(l[i]); any = true; if (picked.length >= PER_BAND * OVERSAMPLE) break; }
      if (!any) break;
    }
    order.push({ band, candidates: picked });
  }
  return { rows, passed, order };
}

// ── 2. verify ───────────────────────────────────────────────────────────────
const win = (score) => T.winChance(Math.max(-2000, Math.min(2000, score)));

async function verify(cand, slot) {
  let pos;
  try { pos = C.parseFen(cand.fen); } catch { return { error: 'bad FEN' }; }
  const all = cand.moves.split(' ');
  const pre = C.moveFromText(pos, all[0]);
  if (!pre || C.uci(pre) !== all[0]) return { error: 'first move not legal' };
  pos = C.makeMove(pos, pre);
  const fen = C.toFen(pos);
  const line = all.slice(1);
  const run = S.replay(fen, line);
  if (!run || run.steps.some((s, i) => s.uci !== line[i])) return { error: 'line not legal' };
  const themes = new Set(cand.themes.split(' '));
  const kind = themes.has('mate') ? 'mate' : 'advantage';
  const n = Math.ceil(line.length / 2);
  if (kind === 'mate' && !C.isCheckmate(run.end)) return { error: 'mate line does not end in mate' };
  if (kind === 'mate' && line.length % 2 === 0) return { error: 'mate line ends on a reply' };
  let smallestGap = Infinity;
  for (let i = 0; i < line.length; i += 2) {
    const before = run.steps[i].before;
    const left = Math.ceil((line.length - i) / 2);
    const a = await E.analyse(C.toFen(before), { ...SEARCH, multipv: 2, slot });
    const [top, second] = a.lines;
    if (!top) return { error: 'engine gave no line' };
    if (kind === 'mate') {
      const mateHere = C.isCheckmate(C.makeMove(before, run.steps[i].move));
      if (!mateHere && (top.uci !== line[i] || !(top.mate > 0 && top.mate <= left))) return { error: `step ${i / 2 + 1}: engine plays ${top.uci} (mate ${top.mate}) not ${line[i]}` };
      if (left > 1 && second && second.mate > 0 && second.mate <= left) return { error: `step ${i / 2 + 1}: ${second.uci} also mates in ${second.mate}` };
    } else {
      if (top.uci !== line[i]) return { error: `step ${i / 2 + 1}: engine prefers ${top.uci} (${top.score}) to ${line[i]}` };
      if (second) {
        const gap = win(top.score) - win(second.score);
        if (gap < 15) return { error: `step ${i / 2 + 1}: ${second.uci} is nearly as good (gap ${gap.toFixed(1)})` };
        smallestGap = Math.min(smallestGap, gap);
      }
    }
  }
  if (kind === 'advantage') {
    const endPos = run.end;
    if (C.status(endPos) === 'playing') {
      const a = await E.analyse(C.toFen(endPos), { ...SEARCH, slot });
      const s = a.lines[0] ? -a.lines[0].score : 0; // from the learner's side
      if (s < 200) return { error: `the line ends only ${s} cp ahead` };
    }
  }
  let proof = '';
  if (kind === 'mate' && n <= 2) {
    const firsts = S.mateMoves(pos, n).map(C.uci);
    if (firsts.length !== 1 || firsts[0] !== line[0]) return { error: `exhaustive search: moves that mate in ${n}: ${firsts.join(' ')}` };
    if (n > 1 && S.mateDistance(pos, n - 1)) return { error: 'a shorter mate exists' };
    proof = `; exhaustive search: the only move that mates in ${n}`;
  }
  const verified = kind === 'mate'
    ? `Stockfish 19, ${NODES / 1000}k nodes: the only move that mates in time at every step${proof}`
    : `Stockfish 19, ${NODES / 1000}k nodes: the best move at every step, ahead of the next best by ${Number.isFinite(smallestGap) ? Math.round(smallestGap) : 100}+ points of expected score`;
  return {
    puzzle: {
      id: `lichess-${cand.id}`,
      fen,
      line,
      rating: cand.rating,
      themes: [...themes].filter((t) => SHOWN.has(t)),
      kind,
      moves: n,
      last: all[0],
      source: 'lichess',
      lichess: cand.id,
      rd: cand.rd,
      plays: cand.plays,
      verified,
    },
  };
}

function loadCache() {
  const done = new Map();
  if (fs.existsSync(CACHE)) {
    for (const line of fs.readFileSync(CACHE, 'utf8').split('\n')) {
      if (!line) continue;
      try { const r = JSON.parse(line); done.set(r.id, r.out); } catch { /* a torn last line */ }
    }
  }
  return done;
}

/** Verify with one retry: an engine that was stopped is started again. */
async function verifyKept(cand, slot, cache) {
  if (cache.has(cand.id)) return cache.get(cand.id);
  let out;
  try { out = await verify(cand, slot); } catch (e) {
    try { out = await verify(cand, slot); } catch (e2) { return { error: `engine: ${e2.message}`, transient: true }; }
  }
  cache.set(cand.id, out);
  fs.appendFileSync(CACHE, `${JSON.stringify({ id: cand.id, out })}\n`);
  return out;
}

async function main() {
  const t0 = Date.now();
  const cache = loadCache();
  console.log(`${cache.size} verdicts already cached in ${CACHE}`);
  const sel = await select();
  console.log(`read ${sel.rows} puzzles; ${sel.passed} pass the quality filter (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (!E.available('stockfish')) throw new Error('Stockfish is needed to verify the import (see services/chess-engine.js).');
  const kept = [];
  const drops = {};
  const famCount = {};
  let tried = 0;
  for (const { band, candidates } of sel.order) {
    const inBand = [];
    let next = 0;
    const work = async (slot) => {
      while (inBand.length < PER_BAND && next < candidates.length) {
        const cand = candidates[next++];
        tried++;
        const out = await verifyKept(cand, slot, cache);
        if (out.error) { const k = out.error.replace(/[^a-z ]/gi, '').split(' ').slice(0, 4).join(' '); drops[k] = (drops[k] || 0) + 1; continue; }
        if (inBand.length < PER_BAND) inBand.push({ ...out.puzzle, fam: cand.fam, order: candidates.indexOf(cand) });
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, (_, k) => work(k)));
    inBand.sort((a, b) => a.order - b.order);
    for (const p of inBand) famCount[p.fam] = (famCount[p.fam] || 0) + 1;
    kept.push(...inBand);
    console.log(`  band ${band}-${band + 99}: kept ${inBand.length} of ${Math.min(next, candidates.length)} checked (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  E.closeAll();
  console.log(`kept ${kept.length} of ${tried} checked`);
  console.log('families:', JSON.stringify(famCount));
  console.log('drops:', JSON.stringify(drops));
  if (process.argv.includes('--write')) {
    const body = kept.map((p) => {
      const { fam, order, ...rest } = p;
      return `  ${JSON.stringify(rest)},`;
    }).join('\n');
    const file = path.join(__dirname, '..', 'content', 'chess-puzzles-lichess.js');
    fs.writeFileSync(file, `/**
 * Puzzles from the Lichess puzzle database (https://database.lichess.org/,
 * released under Creative Commons CC0). Thank you, Lichess and its players.
 *
 * Written by scripts/chess-lichess-import.js on ${new Date().toISOString().slice(0, 10)}: ${kept.length} puzzles, ${PER_BAND} in each
 * 100-point band from 400 to 2399, spread over theme families. Each was checked
 * again before it was kept (see "verified"): its line replayed with chess-core,
 * every learner move confirmed by Stockfish (run on our own machine, never shipped),
 * and mate-in-1 and mate-in-2 proved unique by exhaustive search.
 *
 *   fen      the position the learner sees (the opponent's move "last" applied)
 *   line     from-to moves: the learner's, the reply, and so on
 *   rating   Lichess's own puzzle rating (Glicko-2, measured on its players)
 *   lichess  the Lichess puzzle id (https://lichess.org/training/<id>), shown as
 *            credit after the puzzle is over
 * Do not edit by hand; re-run the import.
 */
module.exports = [
${body}
];
`);
    console.log(`wrote ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  }
}

if (require.main === module) main().catch((e) => { console.error(e); E.closeAll(); process.exit(1); });
module.exports = { verify, familyOf, FAMILIES };
