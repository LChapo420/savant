/**
 * A rating for our practice bot (public/engine/chess/bot.js), from games against
 * calibrated anchors on this machine. Bench only: it changes nothing in the app and
 * writes only its own results.
 *
 *   node curriculum-build/skill-apps-bench/chess-bot-rating.js run [--lanes=5] [--plan=main|quick]
 *   node curriculum-build/skill-apps-bench/chess-bot-rating.js fit   (re-fit from the saved games)
 *
 * Players
 *   ours-sN     our bot at strength N, as the app runs it (live bot.js)
 *   cand-sN     bot-candidate-v1.js: a first version of the node-budget fix (bench only)
 *   fix-sN      bot-candidate.js: the fix as it went live in bot.js on 2026-10-24
 *   (ours-sN games were played before the fix went live: the old bot.js)
 *   sf-E        Stockfish 19 with UCI_LimitStrength and UCI_Elo E, 200 ms a move, 1 thread
 *               (its Elo is calibrated by the Stockfish team against CCRL 40/4 ratings)
 *   maia-E      Maia-2 rapid at rating E (Lichess rapid scale), sampled the way the app's
 *               sparring partner plays (services/chess-maia.js choose: moves under 3% left out)
 * Games start from 24 named opening lines (CC0 Lichess list, 6-8 plies, Stockfish within
 * +-0.8 pawns), each played twice with colours swapped. Draw: stalemate, too little
 * material, threefold, 50 moves without a capture or pawn move, or 300 plies. Resign
 * adjudication: full-strength Stockfish (depth 10), asked every 4th ply, has one side ahead
 * by 10 pawns or a mate three times in a row (the side behind loses). The games played
 * before 04:10 UTC on 2026-10-24 were asked every ply, 8 plies in a row.
 *
 * A game lost by "illegal-or-none" is a harness failure (a move that could not be got),
 * not a result: `run --replay-failed` drops such games and plays them again.
 *
 * Fit: Bradley-Terry on the Elo scale (draws count half), maximum likelihood with the
 * Stockfish levels fixed at their UCI_Elo; 95% intervals by bootstrap over games (2,000).
 * A second fit fixes the Maia-2 levels instead, for the Lichess-rapid view.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const ROOT = path.join(__dirname, '..', '..');
const BOT_LIVE = path.join(ROOT, 'public', 'engine', 'chess', 'bot.js');
const BOT_CAND = path.join(__dirname, 'bot-candidate-v1.js');
const BOT_FIX = path.join(__dirname, 'bot-candidate.js');
const CORE = path.join(ROOT, 'public', 'engine', 'chess', 'chess-core.js');

// ── worker: one bot search per message ───────────────────────────────────────
if (!isMainThread) {
  const C = require(CORE);
  const bots = { ours: require(BOT_LIVE), cand: require(BOT_CAND), fix: require(BOT_FIX) };
  parentPort.on('message', ({ id, kind, fen, strength, seed }) => {
    let a = seed >>> 0;
    const random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const t0 = Date.now();
    const r = bots[kind].chooseMove(C.parseFen(fen), { strength, random });
    parentPort.postMessage({ id, uci: r ? C.uci(r.move) : null, ms: Date.now() - t0 });
  });
  return;
}

const C = require(CORE);
const E = require(path.join(ROOT, 'services', 'chess-engine'));
const M = require(path.join(ROOT, 'services', 'chess-maia'));
const DATA = require(path.join(ROOT, 'content', 'chess-openings-data'));

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const LANES = Number(arg('lanes', 5));
const PLAN = arg('plan', 'main');
const TAG = PLAN === 'main' ? '' : `-${PLAN}`;
const OUT = path.join(__dirname, `chess-bot-rating-results${TAG}.json`);
const GAMES = path.join(__dirname, `chess-bot-rating-games${TAG}.jsonl`);

const seedOf = (text) => [...text].reduce((n, ch) => (Math.imul(n, 31) + ch.charCodeAt(0)) >>> 0, 7);
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── bot worker pool ──────────────────────────────────────────────────────────
const pool = [];
const idle = [];
const queue = [];
const pending = new Map();
let jobId = 0;
function startPool(n) {
  for (let i = 0; i < n; i++) {
    const w = new Worker(__filename);
    w.on('message', (msg) => { const p = pending.get(msg.id); pending.delete(msg.id); idle.push(w); pump(); p(msg); });
    pool.push(w);
    idle.push(w);
  }
}
function pump() { while (idle.length && queue.length) { const w = idle.pop(); const job = queue.shift(); pending.set(job.msg.id, job.resolve); w.postMessage(job.msg); } }
const botMove = (kind, fen, strength, seed) => new Promise((resolve) => { queue.push({ msg: { id: ++jobId, kind, fen, strength, seed }, resolve }); pump(); });

// ── players ──────────────────────────────────────────────────────────────────
function player(id, lane, gameSeed) {
  const [kind, lvl] = id.split('-');
  const n = Number(lvl.replace(/^s/, ''));
  if (kind === 'ours' || kind === 'cand' || kind === 'fix') {
    let ply = 0;
    return async (fen) => (await botMove(kind, fen, n, (gameSeed + 7919 * ++ply) >>> 0)).uci;
  }
  if (kind === 'sf') {
    return async (fen) => (await sfTry(fen, { engine: 'stockfish', movetime: 200, slot: `elo${n}-${lane}`, options: { Threads: 1, Hash: 16, UCI_LimitStrength: 'true', UCI_Elo: n } })).bestmove;
  }
  if (kind === 'maia') {
    const random = mulberry(gameSeed ^ 0x9e3779b9);
    // The Maia-2 worker can stop (it is restarted on the next call): try again before
    // counting a move as missing, so a crashed worker never loses a game.
    return async (fen) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const p = await M.predict(fen, { elo: n });
          const uci = M.choose(p.moves, { sample: true, random });
          if (uci) return uci;
        } catch (e) { if (attempt === 3) throw e; }
      }
      return null;
    };
  }
  throw new Error(`unknown player ${id}`);
}

/** Stockfish, tried again after a pause when a busy machine stops or stalls a process. */
async function sfTry(fen, o) {
  for (let attempt = 0; ; attempt++) {
    try { return await E.analyse(fen, o); } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
}

async function adjudicate(fen, lane) {
  const a = await sfTry(fen, { engine: 'stockfish', depth: 10, slot: `adj-${lane}`, options: { Threads: 1, Hash: 16 } });
  const top = a.lines[0];
  return top ? top.score : 0; // side to move
}

async function playGame(whiteId, blackId, open, lane, seed) {
  let pos = C.parseFen(open.fen);
  const white = player(whiteId, lane, seed);
  const black = player(blackId, lane, seed + 1);
  const seen = new Map();
  let quiet = 0;
  let lopsided = 0; // plies in a row with |eval| >= 1000, same side ahead
  let ahead = null;
  const moves = [];
  const result = (r, why) => ({ white: whiteId, black: blackId, opening: open.name, result: r, why, plies: moves.length, moves: moves.join(' ') });
  for (let ply = 0; ply < 300; ply++) {
    const st = C.status(pos);
    if (st === 'checkmate') return result(pos.side === 'w' ? 0 : 1, 'mate');
    if (st !== 'playing') return result(0.5, st);
    const k = C.toFen(pos).split(' ').slice(0, 4).join(' ');
    seen.set(k, (seen.get(k) || 0) + 1);
    if (seen.get(k) >= 3) return result(0.5, 'threefold');
    if (quiet >= 100) return result(0.5, 'fifty-move');
    const fen = C.toFen(pos);
    // Checked every 4th ply (2 checks in a row = the side ahead for 8 plies), to keep the load down.
    if (ply % 4 === 0) {
      const sc = await adjudicate(fen, lane);
      const whiteView = pos.side === 'w' ? sc : -sc;
      if (Math.abs(whiteView) >= 1000) {
        const side = whiteView > 0 ? 'w' : 'b';
        lopsided = side === ahead ? lopsided + 1 : 1;
        ahead = side;
        if (lopsided >= 3) return result(side === 'w' ? 1 : 0, 'adjudicated');
      } else { lopsided = 0; ahead = null; }
    }
    const mover = pos.side === 'w' ? white : black;
    let uci = null;
    try { uci = await mover(fen); } catch (e) { console.error(`  move error ${pos.side === 'w' ? whiteId : blackId}: ${e.message}`); }
    const m = uci && C.moveFromText(pos, uci);
    if (!m) return result(pos.side === 'w' ? 0 : 1, 'illegal-or-none');
    quiet = m.captured || m.piece.toLowerCase() === 'p' ? 0 : quiet + 1;
    moves.push(uci);
    pos = C.makeMove(pos, m);
  }
  return result(0.5, 'ply-limit');
}

// ── openings ─────────────────────────────────────────────────────────────────
async function openings() {
  const cache = path.join(__dirname, 'chess-data', 'rating-openings.json');
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const cands = DATA.filter(([, name, mv]) => { const n = mv.split(' ').length; return n >= 6 && n <= 8 && !/gambit|attack|countergambit|accepted/i.test(name); });
  const byFamily = new Map();
  for (const c of cands) { const fam = c[1].split(':')[0]; if (!byFamily.has(fam)) byFamily.set(fam, []); byFamily.get(fam).push(c); }
  const fams = [...byFamily.keys()].sort((a, b) => byFamily.get(b).length - byFamily.get(a).length);
  const out = [];
  for (const fam of fams) {
    if (out.length >= 24) break;
    for (const [eco, name, mv] of byFamily.get(fam)) {
      let pos = C.parseFen(START);
      for (const u of mv.split(' ')) pos = C.makeMove(pos, C.moveFromText(pos, u));
      const fen = C.toFen(pos);
      const a = await E.analyse(fen, { engine: 'stockfish', depth: 16, slot: 'open', newGame: true });
      if (Math.abs(a.lines[0].score) <= 80) { out.push({ eco, name, moves: mv, fen, cp: a.lines[0].score }); break; }
    }
  }
  fs.writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}

// ── the plan: [a, b, games] ──────────────────────────────────────────────────
const PLANS = {
  main: [
    ['ours-s10', 'maia-1100', 30], ['ours-s10', 'sf-1320', 30], ['ours-s10', 'maia-1300', 20], ['ours-s10', 'maia-1500', 10],
    ['ours-s10', 'ours-s5', 12], ['ours-s5', 'maia-1100', 16], ['ours-s1', 'ours-s5', 12], ['ours-s1', 'maia-1100', 8],
    ['cand-s10', 'maia-1100', 16], ['cand-s10', 'sf-1320', 16], ['cand-s10', 'maia-1500', 12], ['cand-s10', 'ours-s10', 12],
    ['maia-1100', 'sf-1320', 16], ['maia-1300', 'sf-1320', 16], ['maia-1500', 'sf-1320', 12], ['maia-1500', 'sf-1500', 12],
    ['maia-1300', 'sf-1500', 8], ['sf-1320', 'sf-1500', 12], ['maia-1100', 'maia-1300', 8],
    // the strengths in between, so every rating band the stage checks name has a measured bot
    ['ours-s3', 'maia-1100', 12], ['ours-s3', 'ours-s5', 10], ['ours-s3', 'ours-s1', 8],
    ['ours-s7', 'maia-1100', 12], ['ours-s7', 'ours-s10', 10], ['ours-s7', 'ours-s5', 8],
    // stronger anchors for the strengths that beat everything above (strength 7, the fixed candidate)
    ['ours-s7', 'sf-1500', 10], ['ours-s7', 'maia-1500', 8], ['cand-s10', 'sf-1800', 10], ['cand-s10', 'sf-1500', 8],
    ['sf-1500', 'sf-1800', 8], ['ours-s7', 'cand-s10', 8],
    // the fix as it went live (fix-*): strengths 7 and 10
    ['fix-s7', 'maia-1100', 10], ['fix-s7', 'maia-1300', 10], ['fix-s7', 'sf-1320', 10], ['fix-s7', 'sf-1500', 8],
    ['fix-s10', 'sf-1500', 10], ['fix-s10', 'sf-1800', 8], ['fix-s10', 'maia-1500', 8], ['fix-s10', 'cand-s10', 8], ['fix-s7', 'fix-s10', 8],
  ],
  quick: [['ours-s10', 'maia-1100', 2], ['ours-s1', 'sf-1320', 2]],
};

async function run() {
  const ops = await openings();
  console.log(`${ops.length} openings`);
  const done = new Set();
  if (fs.existsSync(GAMES) && process.argv.includes('--replay-failed')) {
    const kept = fs.readFileSync(GAMES, 'utf8').split('\n').filter(Boolean).filter((l) => JSON.parse(l).why !== 'illegal-or-none');
    fs.writeFileSync(GAMES, kept.length ? `${kept.join('\n')}\n` : '');
  }
  if (fs.existsSync(GAMES)) for (const l of fs.readFileSync(GAMES, 'utf8').split('\n').filter(Boolean)) done.add(JSON.parse(l).key);
  const jobs = [];
  for (const [a, b, n] of PLANS[PLAN]) {
    for (let g = 0; g < n; g++) {
      const open = ops[Math.floor(g / 2) % ops.length];
      const [w, bl] = g % 2 === 0 ? [a, b] : [b, a];
      const key = `${a}|${b}|${g}`;
      if (!done.has(key)) jobs.push({ key, w, bl, open, seed: seedOf(key) });
    }
  }
  // Interleave so a stop part-way still leaves every pairing sampled.
  jobs.sort((x, y) => Number(x.key.split('|')[2]) - Number(y.key.split('|')[2]) || x.key.localeCompare(y.key));
  console.log(`${jobs.length} games to play (${done.size} already saved), ${LANES} lanes`);
  startPool(LANES);
  let next = 0;
  let finished = 0;
  const t0 = Date.now();
  const lane = async (li) => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const t = Date.now();
      let r;
      try { r = await playGame(j.w, j.bl, j.open, li, j.seed); } catch (e) {
        // An engine that did not start in time (a busy machine): the game is not saved, so a re-run plays it.
        console.error(`  game ${j.key} not played: ${e.message}`);
        continue;
      }
      r.key = j.key;
      r.sec = Math.round((Date.now() - t) / 1000);
      fs.appendFileSync(GAMES, `${JSON.stringify(r)}\n`);
      finished++;
      console.log(`[${finished}/${jobs.length} ${Math.round((Date.now() - t0) / 60000)}m] ${r.white} - ${r.black}: ${r.result} (${r.why}, ${r.plies} plies, ${r.sec}s)`);
    }
  };
  await Promise.all(Array.from({ length: LANES }, (_, i) => lane(i)));
  for (const w of pool) w.terminate();
  E.closeAll();
  M.stop();
  fit();
}

// ── fit ──────────────────────────────────────────────────────────────────────
function mle(games, anchors, players) {
  const R = Object.fromEntries(players.map((p) => [p, anchors[p] !== undefined ? anchors[p] : 1200]));
  const free = players.filter((p) => anchors[p] === undefined);
  const k = Math.log(10) / 400;
  for (let it = 0; it < 500; it++) {
    let moved = 0;
    for (const p of free) {
      let g = 0; let h = 0;
      for (const x of games) {
        if (x.white !== p && x.black !== p) continue;
        const o = x.white === p ? x.black : x.white;
        const s = x.white === p ? x.result : 1 - x.result;
        const e = 1 / (1 + Math.pow(10, (R[o] - R[p]) / 400));
        g += k * (s - e);
        h += k * k * e * (1 - e);
      }
      // a weak prior (N(1200, 800)) keeps a player who won or lost everything finite
      g += (1200 - R[p]) / (800 * 800);
      h += 1 / (800 * 800);
      const step = Math.max(-200, Math.min(200, g / h));
      R[p] += step;
      moved = Math.max(moved, Math.abs(step));
    }
    if (moved < 0.01) break;
  }
  return R;
}

function fitWith(games, anchors, label) {
  const players = [...new Set(games.flatMap((x) => [x.white, x.black]))].sort();
  const R = mle(games, anchors, players);
  const rnd = mulberry(20261024);
  const boot = Object.fromEntries(players.map((p) => [p, []]));
  for (let b = 0; b < 2000; b++) {
    const sample = games.map(() => games[Math.floor(rnd() * games.length)]);
    const Rb = mle(sample, anchors, players);
    for (const p of players) boot[p].push(Rb[p]);
  }
  const q = (arr, f) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
  const out = {};
  for (const p of players) {
    out[p] = { rating: Math.round(R[p]), anchor: anchors[p] !== undefined, ci95: anchors[p] !== undefined ? null : [Math.round(q(boot[p], 0.025)), Math.round(q(boot[p], 0.975))] };
  }
  return { label, anchors, ratings: out };
}

function fit() {
  const games = fs.readFileSync(GAMES, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const table = {};
  for (const x of games) {
    const [a, b] = x.key.split('|');
    const t = table[`${a} vs ${b}`] || (table[`${a} vs ${b}`] = { games: 0, score_for_first: 0, wins: 0, draws: 0, losses: 0, adjudicated: 0, illegal: 0 });
    const s = x.white === a ? x.result : 1 - x.result;
    t.games++; t.score_for_first += s;
    if (s === 1) t.wins++; else if (s === 0) t.losses++; else t.draws++;
    if (x.why === 'adjudicated') t.adjudicated++;
    if (x.why === 'illegal-or-none') t.illegal++;
  }
  const sfAnch = {}; const maiaAnch = {};
  for (const p of new Set(games.flatMap((x) => [x.white, x.black]))) {
    if (p.startsWith('sf-')) sfAnch[p] = Number(p.slice(3));
    if (p.startsWith('maia-')) maiaAnch[p] = Number(p.slice(5));
  }
  const res = {
    when: new Date().toISOString(), games: games.length, machine: `${os.cpus()[0].model}, ${os.cpus().length} threads`,
    pairings: table,
    fit_stockfish_anchored: fitWith(games, sfAnch, 'Stockfish UCI_Elo levels fixed (CCRL 40/4 scale)'),
    fit_maia_anchored: fitWith(games, maiaAnch, 'Maia-2 levels fixed (Lichess rapid scale)'),
  };
  fs.writeFileSync(OUT, JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
}

const cmd = process.argv[2] || 'run';
(cmd === 'fit' ? Promise.resolve(fit()) : run()).catch((e) => { console.error(e); E.closeAll(); M.stop(); process.exit(1); });
