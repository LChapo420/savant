/**
 * Strong chess engines on our own machine, over UCI: Stockfish (GPL-3.0) and
 * Leorik (MIT). Used for game review on the server, for checking puzzles and
 * lesson positions at build time, and by the bench scripts.
 *
 * Licences, and why this is a separate process:
 *   - Stockfish is GPL-3.0. We only RUN it, as its own program, on our server or
 *     build machine. No copy goes to a browser and nothing here links its code,
 *     so there is no distribution and no source obligation (the gap that the AGPL
 *     closes; Stockfish is not AGPL). Never copy its binary or WASM into public/.
 *   - Leorik is MIT: it may go anywhere, with its licence text kept.
 * The binaries live outside the repository (local-tools/chess-engines next to the
 * app folder). Point elsewhere with STOCKFISH_PATH / LEORIK_PATH, or
 * CHESS_ENGINES_DIR for the folder.
 *
 * When no engine is installed, available() is false and callers fall back to the
 * in-browser bot (public/engine/chess/bot.js); nothing here throws at require time.
 *
 *   const E = require('./chess-engine');
 *   const a = await E.analyse(fen, { depth: 16, multipv: 3 });
 *   a.lines[0]  // { uci, cp, mate, score, pv: [...] } from the side to move
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR = process.env.CHESS_ENGINES_DIR || path.join(__dirname, '..', '..', 'local-tools', 'chess-engines');

const ENGINES = {
  stockfish: {
    env: 'STOCKFISH_PATH',
    candidates: [
      'stockfish/stockfish/stockfish-windows-x86-64-universal.exe',
      'stockfish/stockfish/stockfish-ubuntu-x86-64-avx2',
      'stockfish/stockfish/stockfish',
    ],
    licence: 'GPL-3.0 (run as a separate program on our machine; never shipped to browsers)',
    options: { Threads: 2, Hash: 64 },
  },
  leorik: {
    env: 'LEORIK_PATH',
    candidates: ['leorik/Leorik 3.2 Windows/Leorik-3.2.1.exe', 'leorik/Leorik-3.2.1'],
    licence: 'MIT',
    options: { Threads: 1, Hash: 64 },
  },
};

/** The path of an engine's program, or null when it is not installed. */
function locate(name) {
  const e = ENGINES[name];
  if (!e) return null;
  const fromEnv = process.env[e.env];
  if (fromEnv) return fs.existsSync(fromEnv) ? fromEnv : null;
  for (const rel of e.candidates) {
    const p = path.join(DIR, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const MATE = 100000;
/** One number per line, like bot.js: centipawns, or +/-(MATE - plies) for a mate. */
const toScore = (cp, mate) => (mate ? (mate > 0 ? MATE - (2 * mate - 1) : -MATE + 2 * -mate) : cp);

/** Read one "info" line into { depth, multipv, cp, mate, pv, nodes, nps, time }; null if it has no score. */
function parseInfo(line) {
  const t = line.split(/\s+/);
  if (t[0] !== 'info' || !t.includes('score') || t.includes('lowerbound') || t.includes('upperbound')) return null;
  const out = { multipv: 1, pv: [] };
  for (let i = 1; i < t.length; i++) {
    const k = t[i];
    if (k === 'depth') out.depth = Number(t[++i]);
    else if (k === 'seldepth') out.seldepth = Number(t[++i]);
    else if (k === 'multipv') out.multipv = Number(t[++i]);
    else if (k === 'nodes') out.nodes = Number(t[++i]);
    else if (k === 'nps') out.nps = Number(t[++i]);
    else if (k === 'time') out.time = Number(t[++i]);
    else if (k === 'score') {
      const kind = t[++i];
      const v = Number(t[++i]);
      if (kind === 'cp') { out.cp = v; out.mate = 0; } else { out.mate = v; out.cp = v > 0 ? 10000 : -10000; }
    } else if (k === 'pv') { out.pv = t.slice(i + 1); break; }
  }
  if (out.mate === 0 && out.cp === undefined) return null;
  return out;
}

/** One running engine: a queue of searches, one at a time. */
class Uci {
  constructor(name, exe, options) {
    this.name = name;
    this.exe = exe;
    this.options = { ...options };
    this.queue = Promise.resolve();
    this.listeners = [];
    this.idleTimer = null;
    this.proc = null;
    this.ready = null;
    this.multipv = 1;
  }

  start() {
    if (this.ready) return this.ready;
    const proc = spawn(this.exe, [], { cwd: path.dirname(this.exe), stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    this.proc = proc;
    let rest = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      rest += chunk;
      let i;
      while ((i = rest.indexOf('\n')) >= 0) {
        const line = rest.slice(0, i).trim();
        rest = rest.slice(i + 1);
        if (line) for (const f of this.listeners.slice()) f(line);
      }
    });
    const dead = () => { if (this.proc === proc) { this.proc = null; this.ready = null; } for (const f of this.listeners.slice()) f('__exit__'); };
    proc.on('exit', dead);
    proc.on('error', dead);
    proc.stdin.on('error', () => {});
    this.ready = (async () => {
      await this.until('uci', (l) => l === 'uciok', 15000);
      for (const [k, v] of Object.entries(this.options)) this.send(`setoption name ${k} value ${v}`);
      this.multipv = 1;
      await this.until('isready', (l) => l === 'readyok', 15000);
    })();
    return this.ready;
  }

  send(cmd) {
    if (this.proc) this.proc.stdin.write(`${cmd}\n`);
  }

  /** Send `cmd` and resolve with every line up to the one `done` accepts. */
  until(cmd, done, ms) {
    return new Promise((resolve, reject) => {
      const lines = [];
      const timer = setTimeout(() => { this.send('stop'); finish(new Error(`${this.name}: no answer to "${cmd}" in ${ms} ms`)); }, ms);
      const on = (line) => {
        if (line === '__exit__') return finish(new Error(`${this.name} stopped`));
        lines.push(line);
        if (done(line)) finish(null);
      };
      const finish = (err) => {
        clearTimeout(timer);
        this.listeners = this.listeners.filter((f) => f !== on);
        if (err) reject(err); else resolve(lines);
      };
      this.listeners.push(on);
      this.send(cmd);
    });
  }

  /** Run fn with the engine to ourselves; the engine quits after a quiet spell. */
  run(fn) {
    const job = this.queue.then(async () => {
      clearTimeout(this.idleTimer);
      await this.start();
      return fn();
    });
    this.queue = job.catch(() => {}).then(() => {
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.quit(), Number(process.env.CHESS_ENGINE_IDLE_MS) || 30000);
      if (this.idleTimer.unref) this.idleTimer.unref();
    });
    return job;
  }

  quit() {
    clearTimeout(this.idleTimer);
    if (this.proc) {
      try { this.send('quit'); } catch { /* gone */ }
      const p = this.proc;
      setTimeout(() => { try { p.kill(); } catch { /* gone */ } }, 500).unref();
    }
    this.proc = null;
    this.ready = null;
  }
}

const running = new Map();
/** The running engine `name`; `slot` gives a build script several of the same engine at once. */
function engine(name, slot = 0, options = null) {
  const key = `${name}#${slot}`;
  if (running.has(key)) return running.get(key);
  const exe = locate(name);
  if (!exe) return null;
  const e = new Uci(name, exe, { ...ENGINES[name].options, ...(options || {}) });
  running.set(key, e);
  return e;
}

/** Is this engine installed here? */
const available = (name = 'stockfish') => !!locate(name);

/** The engine the app prefers for each job (see curriculum-build/skill-apps-bench/CHESS-ENGINE-BAKEOFF.md). */
const PREFERRED = { analysis: ['stockfish', 'leorik'], verify: ['stockfish', 'leorik'] };
function pick(use = 'analysis') {
  return (PREFERRED[use] || PREFERRED.analysis).find(available) || null;
}

/**
 * Search one position.
 * @param {string} fen
 * @param {object} [o] depth | movetime (ms) | nodes; multipv (1-10); searchmoves [uci]; engine name;
 *                     newGame (clear the hash first, for a position unrelated to the last one);
 *                     slot (a separate process of the same engine) and options (UCI options for it)
 * @returns {Promise<{engine, depth, nodes, nps, timeMs, bestmove, lines: Array<{uci, cp, mate, score, pv}>}>}
 */
async function analyse(fen, o = {}) {
  const name = o.engine || pick('analysis');
  const e = name && engine(name, o.slot || 0, o.options);
  if (!e) throw Object.assign(new Error('No chess engine is installed on this server.'), { code: 'NO_ENGINE' });
  const multipv = Math.max(1, Math.min(10, Number(o.multipv) || 1));
  return e.run(async () => {
    if (e.multipv !== multipv) { e.send(`setoption name MultiPV value ${multipv}`); e.multipv = multipv; }
    if (o.newGame) { e.send('ucinewgame'); await e.until('isready', (l) => l === 'readyok', 15000); }
    e.send(`position fen ${fen}${o.moves && o.moves.length ? ` moves ${o.moves.join(' ')}` : ''}`);
    let go = 'go';
    if (o.depth) go += ` depth ${Number(o.depth)}`;
    if (o.nodes) go += ` nodes ${Number(o.nodes)}`;
    if (o.movetime) go += ` movetime ${Number(o.movetime)}`;
    if (go === 'go') go += ' depth 14';
    if (o.searchmoves && o.searchmoves.length) go += ` searchmoves ${o.searchmoves.join(' ')}`;
    const t0 = Date.now();
    const limit = (Number(o.movetime) || 0) + (Number(o.timeoutMs) || 60000);
    const lines = await e.until(go, (l) => l.startsWith('bestmove'), limit);
    const timeMs = Date.now() - t0;
    // The latest line reported for each move. A search stopped by a node or time
    // limit leaves some MultiPV slots one iteration behind, so slot numbers and
    // depths cannot be trusted to rank them; the engine's own bestmove goes first,
    // the rest by score. (Ranking by depth once put a losing move first.)
    let last = null;
    const byMove = new Map();
    for (const l of lines) {
      const info = parseInfo(l);
      if (!info) continue;
      last = info;
      if (info.pv.length) byMove.set(info.pv[0], info);
    }
    const bestmove = (lines[lines.length - 1].split(/\s+/)[1]) || null;
    const want = Math.max(1, Number(o.multipv) || 1);
    // Lines left over from early, shallow iterations are dropped.
    const deepest = Math.max(0, ...[...byMove.values()].map((x) => x.depth || 0));
    const out = [...byMove.values()]
      .filter((x) => x.pv[0] === bestmove || (x.depth || 0) >= deepest - 1)
      .map((x) => ({ uci: x.pv[0], cp: x.cp, mate: x.mate, score: toScore(x.cp, x.mate), pv: x.pv, depth: x.depth }))
      .sort((a, b) => (b.uci === bestmove) - (a.uci === bestmove) || b.score - a.score)
      .slice(0, Math.max(want, o.searchmoves ? o.searchmoves.length : 0));
    return {
      engine: name, depth: last ? last.depth : 0, nodes: last ? last.nodes : 0, nps: last ? last.nps : 0,
      timeMs, bestmove: bestmove === '(none)' ? null : bestmove, lines: out,
    };
  });
}

/** Stop every engine (scripts call this before they exit). */
function closeAll() {
  for (const e of running.values()) e.quit();
  running.clear();
}
process.on('exit', () => { for (const e of running.values()) if (e.proc) try { e.proc.kill(); } catch { /* gone */ } });

// ── review ───────────────────────────────────────────────────────────────────
let teach = null;
const C = require('../public/engine/chess/chess-core');

/**
 * One move of a game judged by the engine, in the shape teach.reviewPly returns,
 * so the review panel can show either.
 */
async function reviewPly(fen, uci, o = {}) {
  teach = teach || require('../public/engine/chess/teach');
  const pos = C.parseFen(fen);
  const move = C.moveFromText(pos, uci);
  if (!move) return null;
  const depth = o.depth || 14;
  const best = await analyse(fen, { depth, engine: o.engine });
  const top = best.lines[0];
  if (!top) return null;
  let played = top.uci === uci ? top : null;
  if (!played) {
    const only = await analyse(fen, { depth, engine: o.engine, searchmoves: [uci] });
    played = only.lines[0];
  }
  if (!played) return null;
  const bestMove = C.moveFromText(pos, top.uci);
  const same = top.uci === uci || played.score >= top.score;
  const ORDER = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];
  let cls = teach.classify(top.score, played.score, same);
  const mateOf = (l) => (l.mate > 0 ? l.mate : l.mate < 0 ? l.mate : 0);
  const missedMate = top.mate > 0 && !(played.mate > 0) ? top.mate : 0;
  if (missedMate) {
    const floor = missedMate === 1 ? 'mistake' : 'inaccuracy';
    if (ORDER.indexOf(cls) < ORDER.indexOf(floor)) cls = floor;
  }
  return {
    best: { uci: top.uci, san: C.san(pos, bestMove), score: top.score, mate: mateOf(top) },
    played: { uci, san: C.san(pos, move), score: played.score, mate: mateOf(played) },
    class: cls, missedMate, depth: best.depth, complete: true, side: pos.side, engine: best.engine,
  };
}

module.exports = { analyse, available, pick, locate, closeAll, reviewPly, parseInfo, toScore, MATE, ENGINES, DIR };
