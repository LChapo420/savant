/**
 * Re-verify the chess content with Stockfish (the bake-off's choice for checking;
 * see curriculum-build/skill-apps-bench/CHESS-ENGINE-BAKEOFF.md). Build-time only:
 * Stockfish runs on this machine as its own program and is never shipped.
 *
 *   node scripts/chess-engine-verify.js [--db=<copy of a db.json>]... [--lichess=all|sample|none] [--write]
 *                                       [--bank=60,40] [--only=bank]
 *
 * What it checks:
 *   bank      chess_mate, chess_tactics items over the audit's seeds: a mate in one
 *             mates; "one capture wins material" keys the best capture and no other
 *             capture comes close; "find the knight fork" keys the best knight move.
 *   puzzles   the hand-set trainer puzzles: every learner move is the engine's best,
 *             clearly (mate puzzles: mates in time, no other move does).
 *   lichess   the imported Lichess puzzles, again (they were checked when imported).
 *   drills    every learner move of the move-trainer lines: openings within 10 points
 *             of expected score of the best move; endgames and mates keep the win.
 *             With --write, the moves Stockfish rates as good as the line's move are
 *             written to content/chess-drills-alts.js, so the trainer can say
 *             "good move too" instead of "wrong".
 *   lessons   board checks, play-outs and guided lessons stored in chess block plans
 *             of the given DB copies (never the live data/db.json).
 * A report goes to curriculum-build/skill-apps-bench/chess-verify-report.json.
 */
const fs = require('fs');
const path = require('path');
const C = require('../content/chess-board');
const E = require('../services/chess-engine');
const T = require('../public/engine/chess/teach');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : dflt; };
const DBS = args.filter((a) => a.startsWith('--db=')).map((a) => a.slice(5));
const LICHESS = opt('lichess', 'sample');
const NODES = Number(opt('nodes', 1000000));
const WRITE = args.includes('--write');
const ONLY = opt('only', '');
const REPORT = path.join(__dirname, '..', 'curriculum-build', 'skill-apps-bench', `chess-verify-report${ONLY ? `-${ONLY}` : ''}.json`);

const win = (s) => T.winChance(Math.max(-2000, Math.min(2000, s)));
const report = { engine: 'Stockfish 19', nodes: NODES, date: new Date().toISOString(), sections: {} };
const section = (name) => (report.sections[name] = report.sections[name] || { checked: 0, ok: 0, flags: [] });
function flag(sec, what, detail) {
  sec.flags.push({ what, detail });
  console.log(`  FLAG ${what}: ${detail}`);
}

async function search(fen, o = {}) {
  return E.analyse(fen, { engine: 'stockfish', nodes: NODES, newGame: true, options: { Threads: 1, Hash: 64 }, ...o }); // one thread: the same answer every run
}

/** The engine's scores for a set of candidate moves, best first. */
async function scoresOf(fen, moves) {
  if (!moves.length) return [];
  const a = await search(fen, { searchmoves: moves, multipv: Math.min(moves.length, 6) });
  return a.lines;
}

/**
 * Check one bank item that keys a move: { ok } or { ok: false, what, detail };
 * null when the item is not a move question this check knows. Used here and by
 * scripts/chess-tactics-pool-build.js.
 */
async function checkItem(it, label) {
  if (!it.fen) return null;
  const pos = C.parseFen(it.fen);
  const key = C.moveFromText(pos, it.answer);
  if (!key) return null;
  const legal = C.legalMoves(pos);
  const where = `${label}: ${it.fen} key ${it.answer}`;
  if (/checkmate in one/.test(it.prompt)) {
    const a = await search(it.fen, { multipv: 1 });
    if (!C.isCheckmate(C.makeMove(pos, key)) || a.lines[0].mate !== 1) return { ok: false, what: 'mate', detail: where };
    return { ok: true };
  }
  let pool = null;
  let kind = '';
  if (/One capture wins material/.test(it.prompt)) { pool = legal.filter((m) => m.captured); kind = 'capture'; }
  if (/knight fork/.test(it.prompt)) { pool = legal.filter((m) => m.piece === 'N'); kind = 'knight move'; }
  if (!pool) return null;
  const lines = await scoresOf(it.fen, pool.map(C.uci));
  const top = lines[0];
  const mine = lines.find((l) => l.uci === C.uci(key));
  if (!top || top.uci !== C.uci(key)) return { ok: false, what: `not the best ${kind}`, detail: `${where}: Stockfish prefers ${top && top.uci} (${top && top.score}) to ${mine ? mine.score : '?'}` };
  const second = lines[1];
  // A second answer "comes close" when it is worth about as much: both mate, or
  // (neither mating) within 150 cp. Expected score is no use here, because these
  // positions are often won already whatever is captured.
  const close = second && ((top.mate > 0 && second.mate > 0) || (!top.mate && !second.mate && top.score - second.score < 150));
  if (close) return { ok: false, what: `second good ${kind}`, detail: `${where}: ${second.uci} ${second.score} vs ${top.score}` };
  return { ok: true };
}

// ── bank items ──────────────────────────────────────────────────────────────
async function bankItems() {
  const bank = require('../content/bank');
  const sec = section('bank');
  // Items per difficulty: --bank=<tactics>,<mate> (default 10,12, the audit's seeds; 60,40 gives 1,000 items).
  const [nt, nm] = String(opt('bank', '10,12')).split(',').map(Number);
  const SEEDS = { chess_mate: nm || 12, chess_tactics: nt || 10 };
  for (const [skill, n] of Object.entries(SEEDS)) {
    for (let d = 1; d <= 10; d++) {
      for (let i = 0; i < n; i++) {
        const it = bank.generate({ skillId: skill, difficulty: d, seed: `other-audit:${skill}:${d}:${i}` });
        const r = await checkItem(it, `${skill} d${d} #${i}`);
        if (r === null) continue; // not a move question
        sec.checked++;
        if (r.ok) sec.ok++; else flag(sec, r.what, r.detail);
      }
    }
  }
}

// ── puzzles ─────────────────────────────────────────────────────────────────
async function checkLine(sec, id, fen, line, kind) {
  const S = require('../content/chess-solver');
  const run = S.replay(fen, line);
  if (!run) return flag(sec, 'illegal line', id);
  sec.checked++;
  for (let i = 0; i < line.length; i += 2) {
    const before = run.steps[i].before;
    const left = Math.ceil((line.length - i) / 2);
    const a = await search(C.toFen(before), { multipv: 2 });
    const [top, second] = a.lines;
    if (C.isCheckmate(C.makeMove(before, run.steps[i].move))) continue;
    if (kind === 'mate') {
      if (top.uci !== line[i] || !(top.mate > 0 && top.mate <= left)) return flag(sec, 'mate line', `${id} step ${i / 2 + 1}: ${top.uci} mate ${top.mate}`);
      if (left > 1 && second && second.mate > 0 && second.mate <= left && left > 2) return flag(sec, 'second mate', `${id} step ${i / 2 + 1}: ${second.uci}`);
    } else {
      if (top.uci !== line[i]) return flag(sec, 'not best', `${id} step ${i / 2 + 1}: Stockfish ${top.uci} (${top.score}) over ${line[i]}`);
      if (second && win(top.score) - win(second.score) < 15 && (top.score - second.score < 200 || (top.mate > 0 && second.mate > 0))) return flag(sec, 'not clear', `${id} step ${i / 2 + 1}: ${second.uci} ${second.score} vs ${top.score}`);
    }
  }
  sec.ok++;
  return null;
}

async function puzzles() {
  const sec = section('puzzles (hand-set)');
  for (const p of require('../content/chess-puzzles')) await checkLine(sec, p.id, p.fen, p.line, p.kind);
  if (LICHESS === 'none') return;
  let list = [];
  try { list = require('../content/chess-puzzles-lichess'); } catch { return; }
  if (LICHESS !== 'all') list = list.filter((_, i) => i % 10 === 0);
  const sec2 = section(`puzzles (Lichess import, ${LICHESS === 'all' ? 'all' : 'every 10th'})`);
  for (const p of list) await checkLine(sec2, p.id, p.fen, p.line, p.kind);
}

// ── drills ──────────────────────────────────────────────────────────────────
async function drills() {
  const { EXPANDED } = require('../content/chess-srs');
  const sec = section('drills');
  const alts = {};
  for (const line of EXPANDED) {
    for (const p of line.plies) {
      if (!p.mine) continue;
      sec.checked++;
      const a = await search(p.fen, { multipv: 5 });
      const top = a.lines[0];
      let mine = a.lines.find((l) => l.uci === p.uci);
      if (!mine) mine = (await search(p.fen, { searchmoves: [p.uci] })).lines[0];
      const loss = win(top.score) - win(mine.score);
      const opening = /^open-/.test(line.deck);
      const bad = opening ? loss > 10 : !(mine.mate > 0 || mine.score >= 300);
      if (bad) { flag(sec, opening ? 'dubious opening move' : 'move does not keep the win', `${p.card} ${p.san}: ${mine.score} vs best ${top.uci} ${top.score}`); continue; }
      sec.ok++;
      const good = a.lines.filter((l) => l.uci !== p.uci && win(mine.score) - win(l.score) <= (opening ? 3 : 1)
        && (opening || l.mate > 0 || l.score >= 300)).map((l) => l.uci);
      if (good.length && !p.mates) alts[p.card] = good;
    }
  }
  report.sections.drills.alts = alts;
  if (WRITE) {
    const file = path.join(__dirname, '..', 'content', 'chess-drills-alts.js');
    fs.writeFileSync(file, `/**
 * Moves Stockfish rates as good as the line's move, per move-trainer card: the
 * trainer answers "a good move too, but this line plays something else" instead of
 * "wrong" (content/chess-srs.js). Written by scripts/chess-engine-verify.js --write
 * (Stockfish 19, ${NODES / 1000}k nodes, MultiPV 5); do not edit by hand.
 */
module.exports = ${JSON.stringify(alts, null, 1)};
`);
    console.log(`wrote ${file}`);
  }
}

// ── guided lessons and play-outs: the stored plans, and the demo page ───────
async function guided(sec, where, d) {
  let pos = d.fen ? C.parseFen(d.fen) : null;
  for (const st of d.steps || []) {
    if (!pos) break;
    const m = C.moveFromText(pos, (st.moves || [])[0]);
    if (!m) break;
    sec.checked++;
    const fen = C.toFen(pos);
    const a = await search(fen, { multipv: 1 });
    const mine = (await search(fen, { searchmoves: [C.uci(m)] })).lines[0];
    if (win(a.lines[0].score) - win(mine.score) > 25 && a.lines[0].score - mine.score >= 150) flag(sec, 'guided move is a mistake', `${where} ${C.san(pos, m)}: ${mine.score} vs ${a.lines[0].uci} ${a.lines[0].score}`);
    else sec.ok++;
    pos = C.makeMove(pos, m);
    if (st.reply) { const r = C.moveFromText(pos, st.reply); if (!r) break; pos = C.makeMove(pos, r); }
  }
}

async function demoLessons() {
  const vm = require('vm');
  const sec = section('demo page lessons (public/engine/chess/demo.js)');
  const seen = { guided: [], playout: [] };
  const block = (tag) => ({ render: (el, data) => { if (tag === 'Chess_Guided') seen.guided.push(data); if (tag === 'Chess_PlayOut') seen.playout.push(data); } });
  const sandbox = { window: {}, document: { getElementById: () => ({ setAttribute() {} }) }, PolymathChess: C };
  sandbox.window.LessonBlocks = { get: block };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'engine', 'chess', 'demo.js'), 'utf8'), sandbox);
  for (const g of seen.guided) await guided(sec, g.title, g);
  for (const d of seen.playout) {
    sec.checked++;
    const a = await search(d.fen, { multipv: 1 });
    if (!(a.lines[0].mate > 0 || a.lines[0].score >= 300)) flag(sec, 'play-out goal out of reach', d.fen); else sec.ok++;
  }
}

// ── lessons in DB copies ────────────────────────────────────────────────────
async function lessons() {
  for (const file of DBS) {
    if (path.resolve(file) === path.resolve(path.join(__dirname, '..', 'data', 'db.json'))) throw new Error('Give a copy of the database, not data/db.json.');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sec = section(`lessons (${path.basename(file)})`);
    const plans = (data.block_plans || []).filter((b) => b.track_id === 'chess' || JSON.stringify(b.blocks || []).includes('"Chess_'));
    for (const plan of plans) {
      for (const c of plan.checks || []) {
        if (c.format !== 'board' || !c.fen) continue;
        const pos = C.parseFen(c.fen);
        const key = C.moveFromText(pos, c.answer);
        sec.checked++;
        if (!key) { flag(sec, 'board check key not legal', `plan ${plan.id} ${c.id}`); continue; }
        const a = await search(c.fen, { multipv: 1 });
        const mine = (await search(c.fen, { searchmoves: [C.uci(key)] })).lines[0];
        const loss = win(a.lines[0].score) - win(mine.score);
        if (loss > 25) flag(sec, 'board check key is a mistake', `plan ${plan.id} ${c.id} ${c.answer}: ${mine.score} vs ${a.lines[0].uci} ${a.lines[0].score} (${c.prompt.slice(0, 80)})`);
        else sec.ok++;
      }
      for (const b of plan.blocks || []) {
        const d = b.data || b;
        if (b.block === 'Chess_PlayOut' || b.tag === 'Chess_PlayOut') {
          if (!d.fen) continue;
          sec.checked++;
          const a = await search(d.fen, { multipv: 1 });
          const s = a.lines[0] ? a.lines[0].score : 0;
          const goal = d.goal || 'win';
          const ok = /draw|survive/.test(goal) ? s >= -150 : s >= 300 || a.lines[0].mate > 0;
          if (!ok) flag(sec, 'play-out goal out of reach', `plan ${plan.id} goal ${goal}: Stockfish ${s} for the learner (${d.fen})`);
          else sec.ok++;
        }
        if (b.block === 'Chess_Guided' || b.tag === 'Chess_Guided') await guided(sec, `plan ${plan.id}`, d);
      }
    }
  }
}

async function main() {
  if (!E.available('stockfish')) throw new Error('Stockfish is not installed (see services/chess-engine.js).');
  const t0 = Date.now();
  const run = (name) => !ONLY || ONLY === name;
  if (run('bank')) { console.log('bank items'); await bankItems(); }
  if (run('puzzles')) { console.log('puzzles'); await puzzles(); }
  if (run('drills')) { console.log('drills'); await drills(); }
  if (run('lessons')) { console.log('lessons'); await lessons(); console.log('demo lessons'); await demoLessons(); }
  E.closeAll();
  report.seconds = Math.round((Date.now() - t0) / 1000);
  for (const [k, s] of Object.entries(report.sections)) console.log(`${k}: ${s.ok}/${s.checked} ok, ${s.flags.length} flagged`);
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`wrote ${REPORT}`);
}

if (require.main === module) main().catch((e) => { console.error(e); E.closeAll(); process.exit(1); });
module.exports = { checkItem };
