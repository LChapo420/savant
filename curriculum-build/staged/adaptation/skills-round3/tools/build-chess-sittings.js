// Build the data of patch 05 (chess sittings) into an app tree:
//   node build-chess-sittings.js <app root> [tables] [rook] [lines] [kpk] [bands]
// (no part names: all of them)
//   tables  content/chess-endgame-tables.data.json: KQK, KRK (distance to mate) from the staged,
//           independent retrograde builder (curriculum-build/staged/skills/lib/endgame-tables.js),
//           and KPK with the distance to a winning promotion (built here, every verdict checked
//           against that builder's own KPK table); brotli-packed with a SHA-256 each
//   rook    Lucena (White to move wins) and Philidor (Black to move holds) starts, each
//           verified by Stockfish 19 (2M nodes, one thread); a Philidor start is kept only
//           when at least one natural Black rook move off the third rank loses (+3 or more)
//   lines   calculation positions: Lichess puzzles (CC0) whose solution is 3-4 learner moves,
//           not in the app's puzzle import, every learner move Stockfish's best by 1.5 pawns or a
//           mate, every reply Stockfish's best reply
//   kpk     K+P v K play-out starts from the table: won (White to move) with at least one
//           White move that throws the win away; drawn (Black to move) with at least one
//           Black move that loses
//   bands   the bot opponents and their measured ratings, from
//           curriculum-build/skill-apps-bench/chess-bot-rating-results.json
// Writes content/skill-chess-sittings.data.json (merging the parts it was asked for).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const APP = path.resolve(process.argv[2]);
const LIVE = path.resolve(__dirname, '../../../../..');
const want = process.argv.slice(3);
const doPart = (p) => !want.length || want.includes(p);
const C = require(path.join(APP, 'content', 'chess-board'));
const OUT = path.join(APP, 'content', 'skill-chess-sittings.data.json');
const data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * K+P v K with the distance to a winning promotion (in White moves, the promotion
 * included), by retrograde levels like the KXK builder. Every win/draw verdict is then
 * checked against the staged builder's own KPK table (T.buildKPK), position by position.
 * value: -2 illegal, 0 draw, d >= 1 White wins (White to move: promotes, winning, on its
 * d-th move; Black to move: White needs d more moves).
 */
function kpkDistance(T, kqk, krk) {
  const { KING_STEPS, adjacent, file, rank } = T;
  const N = 64 * 64 * 64 * 2;
  const V = new Int8Array(N).fill(-1); // -1 unknown while building
  const idx = (wk, p, bk, stm) => ((wk * 64 + p) * 64 + bk) * 2 + stm;
  const pawnAttacks = (p) => [p + 7, p + 9].filter((t) => t < 64 && Math.abs(file(t) - file(p)) === 1);
  const legal = (wk, p, bk, stm) => {
    if (rank(p) < 1 || rank(p) > 6) return false;
    if (wk === p || wk === bk || p === bk || adjacent(wk, bk)) return false;
    if (stm === 0 && pawnAttacks(p).includes(bk)) return false;
    return true;
  };
  const blackMoves = (wk, p, bk) => {
    const res = []; let capture = false;
    for (const t of KING_STEPS[bk]) {
      if (t === wk || adjacent(t, wk)) continue;
      if (pawnAttacks(p).includes(t)) continue;
      if (t === p) { if (!adjacent(p, wk)) capture = true; continue; }
      res.push(t);
    }
    return { res, capture };
  };
  const promotes = (wk, to, bk) => kqk.value(wk, to, bk, 1) >= 0 || krk.value(wk, to, bk, 1) >= 0;
  const whiteMoves = (wk, p, bk) => {
    const out = [];
    for (const t of KING_STEPS[wk]) if (t !== p && t !== bk && !adjacent(t, bk)) out.push({ wk: t, p });
    const one = p + 8;
    if (one !== bk && one !== wk) {
      if (rank(one) === 7) out.push({ wk, p: one, promo: true });
      else {
        out.push({ wk, p: one });
        const two = p + 16;
        if (rank(p) === 1 && two !== bk && two !== wk) out.push({ wk, p: two });
      }
    }
    return out;
  };
  for (let wk = 0; wk < 64; wk++) for (let p = 0; p < 64; p++) for (let bk = 0; bk < 64; bk++) for (const stm of [0, 1]) {
    if (!legal(wk, p, bk, stm)) V[idx(wk, p, bk, stm)] = -2;
  }
  for (let d = 1; d < 100; d++) {
    let changed = false;
    for (let wk = 0; wk < 64; wk++) for (let p = 8; p < 56; p++) for (let bk = 0; bk < 64; bk++) {
      const i = idx(wk, p, bk, 0);
      if (V[i] !== -1) continue;
      for (const m of whiteMoves(wk, p, bk)) {
        const win = m.promo ? d === 1 && promotes(m.wk, m.p, bk) : d >= 2 && V[idx(m.wk, m.p, bk, 1)] === d - 1;
        if (win) { V[i] = d; changed = true; break; }
      }
    }
    for (let wk = 0; wk < 64; wk++) for (let p = 8; p < 56; p++) for (let bk = 0; bk < 64; bk++) {
      const i = idx(wk, p, bk, 1);
      if (V[i] !== -1) continue;
      const { res, capture } = blackMoves(wk, p, bk);
      if (capture || !res.length) continue;
      let worst = 0; let ok = true;
      for (const t of res) { const v = V[idx(wk, p, t, 0)]; if (v < 1 || v > d) { ok = false; break; } if (v > worst) worst = v; }
      if (ok && worst === d) { V[i] = d; changed = true; }
    }
    if (!changed) break;
  }
  for (let i = 0; i < N; i++) if (V[i] === -1) V[i] = 0;
  // The independent check: the staged builder's KPK verdicts, every legal position.
  const ref = T.buildKPK(kqk, krk);
  let diff = 0; let max = 0;
  for (let wk = 0; wk < 64; wk++) for (let p = 8; p < 56; p++) for (let bk = 0; bk < 64; bk++) for (const stm of [0, 1]) {
    const a = V[idx(wk, p, bk, stm)]; const b = ref.value(wk, p, bk, stm);
    if (a === -2 || b === -2) { if (a !== b) diff++; continue; }
    if ((a >= 1) !== (b === 1)) diff++;
    if (a > max) max = a;
  }
  if (diff) throw new Error(`KPK distance table disagrees with the staged builder in ${diff} positions`);
  console.log(`kpk: distance table agrees with the staged builder; longest win ${max} moves`);
  return { value: (wk, p, bk, stm) => V[idx(wk, p, bk, stm)] };
}

function tables() {
  const T = require(path.join(LIVE, 'curriculum-build', 'staged', 'skills', 'lib', 'endgame-tables.js'));
  const t0 = Date.now();
  const q = T.buildKXK('Q');
  const r = T.buildKXK('R');
  const p = kpkDistance(T, q, r);
  const pack = { built: new Date().toISOString().slice(0, 10), builder: 'curriculum-build/staged/skills/lib/endgame-tables.js', index: '((wk*64+x)*64+bk)*2+stm, a1=0, stm 0 = White to move', stats: { kqk: q.stats(), krk: r.stats() } };
  for (const [name, tb] of [['kqk', q], ['krk', r], ['kpk', p]]) {
    const a = new Int8Array(64 * 64 * 64 * 2);
    let i = 0;
    for (let wk = 0; wk < 64; wk++) for (let x = 0; x < 64; x++) for (let bk = 0; bk < 64; bk++) for (let s = 0; s < 2; s++) a[i++] = tb.value(wk, x, bk, s);
    const raw = Buffer.from(a.buffer);
    pack[name] = { sha256: crypto.createHash('sha256').update(raw).digest('hex'), data: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).toString('base64') };
  }
  fs.writeFileSync(path.join(APP, 'content', 'chess-endgame-tables.data.json'), JSON.stringify(pack));
  console.log(`tables: ${Math.round((Date.now() - t0) / 1000)} s, KQK max DTM ${pack.stats.kqk.maxDTM}, KRK ${pack.stats.krk.maxDTM}`);
}

function kpk() {
  delete require.cache[require.resolve(path.join(APP, 'content', 'chess-endgame-tables'))];
  const TB = require(path.join(APP, 'content', 'chess-endgame-tables'));
  TB.load();
  const rnd = rng(20261024);
  const win = []; const draw = [];
  for (let tries = 0; tries < 400000 && (win.length < 300 || draw.length < 300); tries++) {
    const wk = Math.floor(rnd() * 64); const p = 8 + Math.floor(rnd() * 40); const bk = Math.floor(rnd() * 64);
    // Only pawns on files a-d: the sitting mirrors at random, so e-h come from these.
    if ((p & 7) > 3 || (p >> 3) < 1 || (p >> 3) > 5) continue;
    const side = rnd() < 0.5 ? 'w' : 'b';
    const pos = TB.positionOf('kpk', wk, p, bk, side);
    const v = TB.probe(pos);
    if (!v || C.status(pos) !== 'playing' || C.inCheck(pos, side === 'w' ? 'b' : 'w')) continue;
    const moves = C.legalMoves(pos);
    if (side === 'w' && v.result === 'win' && win.length < 300) {
      const throws = moves.filter((m) => TB.after(pos, m).result !== 'win').length;
      const keeps = moves.length - throws;
      // A real test: some moves throw it away, and the king is not simply in front already with an easy run.
      if (throws >= 2 && keeps >= 1 && Math.abs((wk >> 3) - (bk >> 3)) <= 3) win.push({ fen: C.toFen(pos), keeps, throws });
    }
    if (side === 'b' && v.result === 'draw' && draw.length < 300) {
      const loses = moves.filter((m) => TB.after(pos, m).result === 'win').length;
      if (loses >= 1 && moves.length - loses >= 1 && Math.max(Math.abs((bk & 7) - (p & 7)), Math.abs((bk >> 3) - (p >> 3))) <= 3) draw.push({ fen: C.toFen(pos), loses, holds: moves.length - loses });
    }
  }
  data.kpk_playout = { won_white_to_move: win, drawn_black_to_move: draw };
  console.log(`kpk: ${win.length} won starts, ${draw.length} drawn starts`);
}

async function rook() {
  const E = require(path.join(APP, 'services', 'chess-engine'));
  if (!E.available('stockfish')) throw new Error('Stockfish is needed for the rook endings');
  const sq = (f, r) => f + 8 * r;
  const sf = (fen, extra = {}) => E.analyse(fen, { engine: 'stockfish', nodes: 2000000, newGame: true, slot: 'build', options: { Threads: 1, Hash: 64 }, ...extra });
  const place = (pieces, side) => {
    const board = Array(64).fill(null);
    for (const [p, s] of pieces) { if (s < 0 || s > 63 || board[s]) return null; board[s] = p; }
    const pos = { board, side, castling: '', ep: -1 };
    if (C.inCheck(pos, side === 'w' ? 'b' : 'w')) return null;
    if (C.status(pos) !== 'playing') return null;
    return pos;
  };
  const lucena = []; const philidor = [];
  const seen = new Set();
  // Lucena: the pawn on the 7th, its king on the queening square, Black's king cut off by
  // one or two files on one side, Black's rook on the other side, White's rook on the cutting file.
  for (let f = 1; f <= 6; f++) {
    for (const dir of [1, -1]) {
      const cut = f + dir; const bkf = f + 2 * dir; const brf = f - dir;
      if (cut < 0 || cut > 7 || bkf < 0 || bkf > 7 || brf < 0 || brf > 7) continue;
      for (const bkr of [6, 5]) for (const wrr of [0, 1]) for (const brr of [0, 1, 2]) {
        const pos = place([['K', sq(f, 7)], ['P', sq(f, 6)], ['R', sq(cut, wrr)], ['k', sq(bkf, bkr)], ['r', sq(brf, brr)]], 'w');
        if (!pos) continue;
        const fen = C.toFen(pos);
        if (seen.has(fen)) continue; seen.add(fen);
        const a = await sf(fen);
        const top = a.lines[0];
        if (top && (top.mate > 0 || top.cp >= 500)) lucena.push({ fen, sf: top.mate ? `mate ${top.mate}` : top.cp, best: top.uci });
      }
    }
  }
  // Philidor: White's pawn on the 5th with its king beside or behind it, Black's king on the
  // queening square, Black's rook on its third rank (White's 6th), White's rook on the 7th or 1st; Black to move.
  for (let f = 1; f <= 6; f++) {
    for (const [dkf, dkr] of [[-1, 4], [1, 4], [0, 3]]) {
      for (const brf of [0, 7, f - 3, f + 3]) for (const wrr of [6, 0]) for (const wrf of [0, 7]) {
        if (brf < 0 || brf > 7 || Math.abs(brf - f) < 2) continue;
        const pos = place([['P', sq(f, 4)], ['K', sq(f + dkf, dkr)], ['R', sq(wrf, wrr)], ['k', sq(f, 7)], ['r', sq(brf, 5)]], 'b');
        if (!pos) continue;
        const fen = C.toFen(pos);
        if (seen.has(fen)) continue; seen.add(fen);
        const a = await sf(fen);
        const top = a.lines[0];
        if (!top || top.mate || Math.abs(top.cp) > 60) continue;
        // A natural mistake loses: the rook leaving the third rank (not with check).
        const offRank = C.legalMoves(pos).filter((m) => m.piece === 'r' && (m.to >> 3) !== 5 && !C.inCheck(C.makeMove(pos, m))).map((m) => C.uci(m)).slice(0, 10);
        if (!offRank.length) continue;
        const alt = await sf(fen, { searchmoves: offRank, multipv: offRank.length, nodes: 1000000 });
        const losing = alt.lines.filter((l) => l.mate < 0 || l.cp <= -300).map((l) => l.uci);
        if (losing.length) philidor.push({ fen, sf: top.cp, best: top.uci, losing });
      }
    }
  }
  E.closeAll();
  data.rook_endgames = { verified: 'Stockfish 19, 2M nodes, 1 thread', lucena, philidor };
  console.log(`rook: ${lucena.length} Lucena, ${philidor.length} Philidor`);
}

async function lines() {
  const E = require(path.join(APP, 'services', 'chess-engine'));
  if (!E.available('stockfish')) throw new Error('Stockfish is needed for the lines');
  const { readLines } = require(path.join(APP, 'scripts', 'lib', 'zst-lines'));
  const imported = new Set(require(path.join(APP, 'content', 'chess-puzzles-lichess')).map((p) => p.lichess || p.id));
  const cands = [];
  const bands = new Map();
  await readLines(path.join(LIVE, '..', 'offline-sources', 'chess', 'lichess-puzzles', 'lichess_db_puzzle.csv.zst'), (line) => {
    const c = line.split(',');
    if (c[0] === 'PuzzleId' || imported.has(c[0])) return undefined;
    const moves = c[2].split(' ');
    const r = Number(c[3]); const rd = Number(c[4]);
    if ((moves.length !== 6 && moves.length !== 8) || r < 1100 || r >= 1800 || rd > 80 || Number(c[5]) < 90 || Number(c[6]) < 2000) return undefined;
    if (/mateIn1\b|oneMove/.test(c[7])) return undefined;
    const band = Math.floor(r / 100);
    if ((bands.get(band) || 0) >= 25) return undefined;
    bands.set(band, (bands.get(band) || 0) + 1);
    cands.push({ id: c[0], fen: c[1], moves, rating: r, themes: c[7] });
    return cands.length >= 175 ? false : undefined;
  });
  const kept = [];
  for (const q of cands) {
    let pos = C.parseFen(q.fen);
    const first = C.moveFromText(pos, q.moves[0]);
    if (!first) continue;
    pos = C.makeMove(pos, first);
    const startFen = C.toFen(pos);
    const line = q.moves.slice(1);
    let ok = true;
    const sans = [];
    for (let i = 0; i < line.length && ok; i++) {
      const fen = C.toFen(pos);
      const m = C.moveFromText(pos, line[i]);
      if (!m) { ok = false; break; }
      const learner = i % 2 === 0;
      const after = C.makeMove(pos, m);
      const lastAndMate = i === line.length - 1 && C.isCheckmate(after);
      if (!lastAndMate) {
        const a = await E.analyse(fen, { engine: 'stockfish', nodes: 800000, multipv: 2, newGame: i === 0, slot: 'build', options: { Threads: 1, Hash: 64 } });
        const [b1, b2] = a.lines;
        if (!b1 || b1.uci !== line[i]) ok = false;
        else if (learner && b2 && !(b1.mate > 0 && !(b2.mate > 0)) && b1.score - b2.score < 150) ok = false;
        else if (!learner && b2 && b1.score - b2.score < 50) ok = false; // the reply must be the one clear best
      }
      sans.push(C.san(pos, m));
      pos = after;
    }
    if (ok) kept.push({ id: `lichess-${q.id}`, fen: startFen, line: sans, uci: line, rating: q.rating, themes: q.themes.split(' '), learner_moves: Math.ceil(line.length / 2) });
  }
  E.closeAll();
  data.calculation = { source: 'Lichess puzzle database (CC0), not in the app import; every move re-checked by Stockfish 19 (800k nodes)', items: kept };
  console.log(`lines: ${kept.length} of ${cands.length} kept`);
}

function bandsPart() {
  const file = path.join(LIVE, 'curriculum-build', 'skill-apps-bench', 'chess-bot-rating-results.json');
  const res = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fit = res.fit_maia_anchored.ratings;
  const opponents = [];
  for (const [id, r] of Object.entries(fit)) {
    if (id.startsWith('ours-')) opponents.push({ id, engine: 'bot', strength: Number(id.slice(6)), rating: r.rating, ci95: r.ci95 });
    else if (id.startsWith('maia-')) opponents.push({ id, engine: 'maia', elo: Number(id.slice(5)), rating: r.rating, ci95: null });
  }
  opponents.sort((a, b) => a.rating - b.rating);
  data.opponents = { scale: 'Lichess rapid (Maia-2 levels fixed at their own ratings)', measured: res.when, games: res.games, list: opponents };
  console.log(`bands: ${opponents.map((o) => `${o.id} ${o.rating}`).join(', ')}`);
}

(async () => {
  if (doPart('tables')) tables();
  if (doPart('kpk')) kpk();
  if (doPart('rook')) await rook();
  if (doPart('lines')) await lines();
  if (doPart('bands')) bandsPart();
  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 1)}\n`);
})().catch((e) => { console.error(e); process.exit(1); });
