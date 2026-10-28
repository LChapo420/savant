/**
 * A human-like sparring partner: Maia-2 (CSSLab, MIT licence) predicts the move a
 * player of a given rating would make, and we play one of the likely moves.
 *
 * Maia-2 runs in a Python worker (tools/chess/maia2-worker.py) on our server, on
 * the GPU when there is one. It was trained without the first moves of games, so
 * the opening comes from the CC0 opening book (content/chess-openings.js) and the
 * model takes over once the game leaves it. Its ratings run in 100-point bands
 * from under 1100 to 2000 and over; below about 1000 the app's own bot with
 * beginner slips (public/engine/chess/bot.js) is the better partner, and it is
 * the fallback whenever this worker is not installed.
 *
 * Paths: MAIA2_PYTHON (a python with torch and maia2), MAIA2_MODELS (the folder
 * with rapid_model.pt), both defaulting to local-tools/chess-engines next to the
 * app folder. Not AGPL: Maia-3 is, and is deliberately not used.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR = process.env.CHESS_ENGINES_DIR || path.join(__dirname, '..', '..', 'local-tools', 'chess-engines');
const PY = process.env.MAIA2_PYTHON || path.join(DIR, 'maia2-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const MODELS = process.env.MAIA2_MODELS || path.join(DIR, 'maia2-models');
const WORKER = path.join(__dirname, '..', 'tools', 'chess', 'maia2-worker.py');

const available = () => fs.existsSync(PY) && fs.existsSync(path.join(MODELS, 'rapid_model.pt'));

let proc = null;
let ready = null;
let seq = 0;
const waiting = new Map();
let idle = null;

function start() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    const p = spawn(PY, ['-I', WORKER], {
      env: { ...process.env, MAIA2_MODELS: MODELS, PYTHONIOENCODING: 'utf-8' },
      stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
    });
    proc = p;
    let rest = '';
    const timer = setTimeout(() => reject(new Error('Maia-2 did not start in time')), 120000);
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      rest += chunk;
      let i;
      while ((i = rest.indexOf('\n')) >= 0) {
        const line = rest.slice(0, i).trim();
        rest = rest.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.ready) { clearTimeout(timer); resolve(msg); continue; }
        const w = waiting.get(msg.id);
        if (w) { waiting.delete(msg.id); if (msg.error) w.reject(new Error(msg.error)); else w.resolve(msg); }
      }
    });
    const dead = () => {
      clearTimeout(timer);
      if (proc === p) { proc = null; ready = null; }
      for (const w of waiting.values()) w.reject(new Error('Maia-2 stopped'));
      waiting.clear();
      reject(new Error('Maia-2 stopped'));
    };
    p.on('exit', dead);
    p.on('error', dead);
    p.stdin.on('error', () => {});
  });
  ready.catch(() => { ready = null; });
  return ready;
}

function stop() {
  clearTimeout(idle);
  if (proc) { try { proc.stdin.end(); proc.kill(); } catch { /* gone */ } }
  proc = null;
  ready = null;
}
process.on('exit', () => { if (proc) try { proc.kill(); } catch { /* gone */ } });

/**
 * Maia-2's move probabilities for a position.
 * @returns {Promise<{moves: Object<string, number>, win_prob: number, ms: number}>}
 */
async function predict(fen, { elo = 1500, oppElo, type = 'rapid' } = {}) {
  if (!available()) throw Object.assign(new Error('Maia-2 is not installed on this server.'), { code: 'NO_ENGINE' });
  await start();
  clearTimeout(idle);
  const id = ++seq;
  const out = await new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    proc.stdin.write(`${JSON.stringify({ id, fen, elo_self: elo, elo_oppo: oppElo || elo, type })}\n`);
    setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); reject(new Error('Maia-2 took too long')); } }, 30000).unref();
  });
  idle = setTimeout(stop, Number(process.env.MAIA2_IDLE_MS) || 10 * 60 * 1000);
  if (idle.unref) idle.unref();
  return out;
}

/**
 * Choose the sparring move: sampled from Maia-2's distribution (moves under 3%
 * left out, so it plays like the rating and not like a random mover), or the top
 * move when `sample` is false.
 */
function choose(moves, { sample = true, random = Math.random, floor = 0.03 } = {}) {
  const list = Object.entries(moves).sort((a, b) => b[1] - a[1]);
  if (!list.length) return null;
  if (!sample) return list[0][0];
  const kept = list.filter(([, p], i) => i === 0 || p >= floor);
  const total = kept.reduce((n, [, p]) => n + p, 0);
  let r = random() * total;
  for (const [m, p] of kept) { r -= p; if (r <= 0) return m; }
  return kept[0][0];
}

/** Start the worker and load the rapid model ahead of the first move (it takes 10-30 s). */
function warm() {
  if (!available()) return;
  predict('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', { elo: 1500 }).catch(() => {});
}

module.exports = { available, predict, choose, warm, stop, PY, MODELS };
