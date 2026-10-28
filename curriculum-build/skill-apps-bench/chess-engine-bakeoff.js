/**
 * Chess engine bake-off: our bot (public/engine/chess/bot.js) vs Leorik 3.2.1 (MIT)
 * vs Stockfish 19 (GPL-3, run as a separate program) vs Maia-2 (MIT, policy only),
 * on this machine. Read-only for the app: it writes only its own results.
 *
 *   node curriculum-build/skill-apps-bench/chess-engine-bakeoff.js prepare   build the test sets (CC0 data)
 *   node curriculum-build/skill-apps-bench/chess-engine-bakeoff.js run [--quick]
 *   node curriculum-build/skill-apps-bench/chess-engine-bakeoff.js match     short engine-vs-engine matches
 *
 * Test sets (curriculum-build/skill-apps-bench/chess-data/):
 *   tactics.json  held-out Lichess puzzles (CC0), never in the app's import (the import
 *                 takes RatingDeviation <= 80; these have 81-150): the position
 *                 after the opponent's move and the solution's first move.
 *   evals.json    positions from lichess_db_eval (CC0) with Lichess cloud evaluations
 *                 at depth >= 30: the best move and its score.
 *   human.json    the move a real player made that set up a Lichess puzzle (the
 *                 first move of "Moves"): a human move, usually a mistake.
 *
 * Measures: first-move accuracy on tactics and agreement/eval error against deep
 * evaluations at fixed time per position (analysis strength); top-1 match with the
 * human move (human-likeness); nodes per second and milliseconds per move (speed).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'content', 'chess-board'));
const bot = require(path.join(ROOT, 'public', 'engine', 'chess', 'bot'));
const E = require(path.join(ROOT, 'services', 'chess-engine'));
const M = require(path.join(ROOT, 'services', 'chess-maia'));
const { readLines } = require(path.join(ROOT, 'scripts', 'lib', 'zst-lines'));

const DATA = path.join(__dirname, 'chess-data');
const OFF = path.join(ROOT, '..', 'offline-sources', 'chess');
const OUT = path.join(__dirname, 'chess-bakeoff-results.json');
const QUICK = process.argv.includes('--quick');

// ── prepare ─────────────────────────────────────────────────────────────────
async function prepare() {
  fs.mkdirSync(DATA, { recursive: true });
  const bands = new Map();
  const human = [];
  // A fixed, spread-out sample: ids whose character codes give 0 mod 211.
  const pickId = (id) => [...id].reduce((n, ch) => n + ch.charCodeAt(0) * 31, 7) % 211 === 0;
  await readLines(path.join(OFF, 'lichess-puzzles', 'lichess_db_puzzle.csv.zst'), (line) => {
    const c = line.split(',');
    if (c[0] === 'PuzzleId' || !pickId(c[0])) return;
    const r = Number(c[3]);
    const rd = Number(c[4]);
    if (Number(c[5]) < 85 || Number(c[6]) < 1000 || r < 600 || r >= 2600 || rd <= 80 || rd > 150) return;
    const band = Math.floor(r / 200) * 200;
    const moves = c[2].split(' ');
    let pos = C.parseFen(c[1]);
    if (human.length < 400 && c[0].charCodeAt(1) % 2 === 0) human.push({ id: c[0], fen: c[1], human: moves[0], rating: r });
    const pre = C.moveFromText(pos, moves[0]);
    if (!pre) return;
    pos = C.makeMove(pos, pre);
    const list = bands.get(band) || [];
    if (list.length < 30) list.push({ id: c[0], fen: C.toFen(pos), best: moves[1], rating: r, themes: c[7] });
    bands.set(band, list);
  });
  const tactics = [...bands.values()].flat();
  const evals = [];
  // The eval sample is plain JSON lines (decompressed from the first 16 MB of lichess_db_eval).
  const text = fs.readFileSync(path.join(OFF, 'lichess-eval-sample', 'eval-sample.jsonl'), 'utf8').split('\n');
  for (let i = 0; i < text.length && evals.length < 300; i += 97) {
    if (!text[i]) continue;
    const row = JSON.parse(text[i]);
    const deep = row.evals.filter((e) => e.depth >= 30).sort((a, b) => b.depth - a.depth)[0];
    if (!deep || !deep.pvs[0] || !deep.pvs[0].line) continue;
    const pv = deep.pvs[0];
    const fen = `${row.fen} 0 1`;
    try { if (!C.legalMoves(C.parseFen(fen)).length) continue; } catch { continue; }
    evals.push({ fen, best: pv.line.split(' ')[0], cp: pv.cp !== undefined ? pv.cp : null, mate: pv.mate || null, depth: deep.depth });
  }
  fs.writeFileSync(path.join(DATA, 'tactics.json'), JSON.stringify(tactics));
  fs.writeFileSync(path.join(DATA, 'evals.json'), JSON.stringify(evals));
  fs.writeFileSync(path.join(DATA, 'human.json'), JSON.stringify(human.slice(0, 300)));
  console.log(`tactics ${tactics.length}, evals ${evals.length}, human ${Math.min(300, human.length)}`);
}

// ── engines under test ──────────────────────────────────────────────────────
/** Our bot with a time budget: iterative deepening over bot.analyse until the budget is spent. */
function ourBest(fen, ms) {
  const pos = C.parseFen(fen);
  const t0 = Date.now();
  let best = null;
  let nodes = 0;
  for (let d = 1; d <= 5; d++) {
    const a = bot.analyse(pos, { depth: d, maxNodes: 4000000 });
    nodes += a.nodes;
    if (!a.complete && best) break;
    best = { uci: C.uci(a.moves[0].move), score: a.moves[0].score, depth: d };
    if ((Date.now() - t0) * 6 > ms) break; // the next depth would blow the budget
  }
  return { ...best, ms: Date.now() - t0, nodes };
}

function pick(a) {
  const top = a.lines[0] || {};
  return { uci: top.uci || a.bestmove, score: top.score, ms: a.timeMs, nodes: a.nodes, nps: a.nps, depth: a.depth };
}

async function uciBest(name, fen, ms, threads = 1) {
  const go = () => E.analyse(fen, { engine: name, movetime: ms, newGame: true, options: { Threads: threads, Hash: 64 }, slot: threads });
  return pick(await go().catch(go)); // a stopped engine is started again once
}

async function maiaBest(fen, elo) {
  const p = await M.predict(fen, { elo });
  const top = Object.entries(p.moves).sort((a, b) => b[1] - a[1])[0];
  return { uci: top[0], p: top[1], ms: p.ms };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (k, n) => (n ? Math.round((1000 * k) / n) / 10 : 0);

async function run() {
  const tactics = JSON.parse(fs.readFileSync(path.join(DATA, 'tactics.json')));
  const evals = JSON.parse(fs.readFileSync(path.join(DATA, 'evals.json')));
  const human = JSON.parse(fs.readFileSync(path.join(DATA, 'human.json')));
  const T = QUICK ? tactics.filter((_, i) => i % 5 === 0) : tactics;
  const V = QUICK ? evals.filter((_, i) => i % 5 === 0) : evals;
  const H = QUICK ? human.filter((_, i) => i % 3 === 0) : human;
  const results = { machine: 'Ryzen 9 6900HS (8 cores / 16 threads), RTX 3050 Laptop 4 GB, Windows 11; other jobs were running at the same time', date: new Date().toISOString(), sets: { tactics: T.length, evals: V.length, human: H.length } };
  const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const contenders = [
    ['ours', (fen, ms) => ourBest(fen, ms)],
    ['leorik', (fen, ms) => uciBest('leorik', fen, ms)],
    ['stockfish', (fen, ms) => uciBest('stockfish', fen, ms)],
  ];
  results.tactics = {};
  results.evals = {};
  for (const ms of [100, 1000]) {
    for (const [name, f] of contenders) {
      let right = 0; const times = []; const byBand = {}; const npsList = [];
      for (const t of T) {
        const r = await f(t.fen, ms);
        const pos = C.parseFen(t.fen);
        const mv = C.moveFromText(pos, r.uci);
        const ok = r.uci === t.best || (mv && C.isCheckmate(C.makeMove(pos, mv)));
        if (ok) right++;
        times.push(r.ms);
        if (r.nodes && r.ms) npsList.push((r.nodes / r.ms) * 1000);
        const b = Math.floor(t.rating / 400) * 400;
        byBand[b] = byBand[b] || [0, 0];
        byBand[b][0] += ok ? 1 : 0;
        byBand[b][1] += 1;
      }
      results.tactics[`${name}@${ms}ms`] = { solved_pct: pct(right, T.length), median_ms: median(times), nps: Math.round(median(npsList)), by_rating: Object.fromEntries(Object.entries(byBand).map(([k, [a, n]]) => [k, `${a}/${n}`])) };
      console.log(`tactics ${name}@${ms}ms: ${pct(right, T.length)}% (${right}/${T.length}), median ${median(times)} ms`);
      let agree = 0; const err = [];
      for (const v of V) {
        const r = await f(v.fen, ms);
        if (r.uci === v.best) agree++;
        if (v.cp !== null && r.score !== undefined && Math.abs(r.score) < 5000) err.push(Math.abs(Math.max(-1000, Math.min(1000, r.score)) - Math.max(-1000, Math.min(1000, v.cp))));
      }
      results.evals[`${name}@${ms}ms`] = { best_move_agree_pct: pct(agree, V.length), mean_abs_eval_error_cp: Math.round(mean(err)), median_abs_eval_error_cp: Math.round(median(err)) };
      save();
      console.log(`evals ${name}@${ms}ms: agree ${pct(agree, V.length)}%, eval error mean ${Math.round(mean(err))} cp`);
    }
  }
  // Stockfish with 4 threads at 1 s: the setting for deep checks.
  {
    let right = 0;
    for (const t of T) { const r = await uciBest('stockfish', t.fen, 1000, 4); if (r.uci === t.best) right++; }
    results.tactics['stockfish-4threads@1000ms'] = { solved_pct: pct(right, T.length) };
    save();
    console.log(`tactics stockfish 4 threads @1s: ${pct(right, T.length)}%`);
  }
  // Maia-2: policy only (no search), as a tactics solver and as a human model.
  if (M.available()) {
    for (const elo of [1100, 1500, 1900]) {
      let right = 0; const ms = [];
      for (const t of T) { const r = await maiaBest(t.fen, elo); if (r.uci === t.best) right++; ms.push(r.ms); }
      results.tactics[`maia2-${elo}`] = { solved_pct: pct(right, T.length), median_ms: median(ms) };
      save();
      console.log(`tactics maia2-${elo}: ${pct(right, T.length)}%, ${median(ms)} ms`);
    }
  }
  // Human-likeness: does the engine's choice equal the move a real player made?
  results.human = {};
  const humanRuns = [
    ['ours@1000ms', (fen) => ourBest(fen, 1000)],
    ['ours-strength3', (fen) => { const b = bot.chooseMove(C.parseFen(fen), { strength: 3, random: mulberry(fen) }); return { uci: C.uci(b.move) }; }],
    ['leorik@100ms', (fen) => uciBest('leorik', fen, 100)],
    ['stockfish@100ms', (fen) => uciBest('stockfish', fen, 100)],
  ];
  if (M.available()) for (const elo of [1100, 1500, 1900]) humanRuns.push([`maia2-${elo}`, (fen) => maiaBest(fen, elo)]);
  for (const [name, f] of humanRuns) {
    let hit = 0;
    for (const h of H) { const r = await f(h.fen); if (r.uci === h.human) hit++; }
    results.human[name] = { top1_match_pct: pct(hit, H.length) };
    save();
    console.log(`human ${name}: ${pct(hit, H.length)}%`);
  }
  // Maia-2 speed on GPU and CPU.
  if (M.available()) {
    results.maia_speed = {};
    for (const dev of ['cuda', 'cpu']) {
      M.stop();
      process.env.MAIA2_DEVICE = dev;
      const t0 = Date.now();
      await M.predict(H[0].fen, { elo: 1500 });
      const load = Date.now() - t0;
      const ms = [];
      for (const h of H.slice(0, 60)) ms.push((await M.predict(h.fen, { elo: 1500 })).ms);
      results.maia_speed[dev] = { first_call_ms_incl_load: load, median_ms: median(ms) };
      save();
      console.log(`maia2 on ${dev}: load ${load} ms, median ${median(ms)} ms`);
    }
    M.stop();
  }
  E.closeAll();
  save();
  console.log(`wrote ${OUT}`);
}

function mulberry(seedText) {
  let a = [...seedText].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 1);
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── matches ─────────────────────────────────────────────────────────────────
async function playGame(white, black, startFen, maxPlies = 200) {
  let pos = C.parseFen(startFen);
  const seen = new Map();
  for (let ply = 0; ply < maxPlies; ply++) {
    const st = C.status(pos);
    if (st === 'checkmate') return pos.side === 'w' ? 0 : 1;
    if (st !== 'playing') return 0.5;
    const k = C.toFen(pos).split(' ').slice(0, 4).join(' ');
    seen.set(k, (seen.get(k) || 0) + 1);
    if (seen.get(k) >= 3) return 0.5;
    const mover = pos.side === 'w' ? white : black;
    const uci = await mover(C.toFen(pos));
    const m = C.moveFromText(pos, uci);
    if (!m) return pos.side === 'w' ? 0 : 1; // an illegal move loses
    pos = C.makeMove(pos, m);
  }
  return 0.5; // a draw at the move limit
}

const OPENINGS = [
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2',
];

async function match() {
  const res = {};
  const sf = (ms) => async (fen) => (await E.analyse(fen, { engine: 'stockfish', movetime: ms, slot: 9, options: { Threads: 1, Hash: 32 } })).bestmove;
  const sfElo = (elo) => async (fen) => (await E.analyse(fen, { engine: 'stockfish', movetime: 100, slot: 8, options: { Threads: 1, Hash: 16, UCI_LimitStrength: 'true', UCI_Elo: elo } })).bestmove;
  const le = (ms) => async (fen) => (await E.analyse(fen, { engine: 'leorik', movetime: ms, slot: 7, options: { Threads: 1, Hash: 32 } })).bestmove;
  const ours = (strength) => async (fen) => C.uci(bot.chooseMove(C.parseFen(fen), { strength, random: mulberry(fen) }).move);
  const series = async (label, a, b, games) => {
    let score = 0;
    for (let g = 0; g < games; g++) {
      const fen = OPENINGS[Math.floor(g / 2) % OPENINGS.length];
      const r = g % 2 === 0 ? await playGame(a, b, fen) : 1 - await playGame(b, a, fen);
      score += r;
      console.log(`  ${label} game ${g + 1}: ${r}`);
    }
    res[label] = { games, score_for_first: score };
    console.log(`${label}: ${score}/${games}`);
  };
  await series('stockfish@100ms vs leorik@100ms', sf(100), le(100), QUICK ? 4 : 10);
  await series('ours-strength10 vs stockfish-UCI_Elo1320', ours(10), sfElo(1320), QUICK ? 2 : 4);
  E.closeAll();
  const all = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : {};
  all.matches = res;
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
}

const cmd = process.argv[2];
(cmd === 'prepare' ? prepare() : cmd === 'match' ? match() : run()).catch((e) => { console.error(e); E.closeAll(); M.stop(); process.exit(1); });
