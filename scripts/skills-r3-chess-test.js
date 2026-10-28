/**
 * Tests for the chess sittings (staged skills round 3, patch 05-chess-sittings):
 * services/skill-chess-sittings.js, content/skill-chess-sittings.js, the
 * endgame tables, and their wiring into patch 02 (content/skill-stage-checks.js,
 * services/skill-checks.js, routes/skill-checks.js, the stage check page).
 * Needs patches 01 and 02.
 *
 *   node scripts/skills-r3-chess-test.js
 *
 * Throwaway data file, keys blanked, no model call, no network. Stockfish and
 * Maia-2 are replaced by a small stand-in (the app's own bot at depth 1), so the
 * result does not depend on which engines this machine has; one extra check
 * runs real Stockfish on a Lucena position when it is installed.
 */
const F = require('./lib/skills-r3-fixture');
const fs = require('fs');
const path = require('path');

const { db, check, learner, serve, fresh, DAY, HOUR, at, later } = F;
const C = require('../content/chess-board');
const TB = require('../content/chess-endgame-tables');
const bot = require('../public/engine/chess/bot');

// A stand-in for Stockfish: the app's bot, one ply plus captures, scores from the side to move.
function fakeStockfish(fen, o = {}) {
  const pos = C.parseFen(fen);
  const a = bot.analyse(pos, { depth: 1 });
  let moves = a.moves;
  if (o.searchmoves) moves = moves.filter((m) => o.searchmoves.includes(C.uci(m.move)));
  const lines = moves.slice(0, Math.max(1, o.multipv || 1)).map((m) => ({ uci: C.uci(m.move), cp: m.mate ? (m.mate > 0 ? 10000 : -10000) : m.score, mate: m.mate, score: m.score }));
  return Promise.resolve({ engine: 'fake', lines, bestmove: lines[0] ? lines[0].uci : null });
}

/** The open sitting as the store keeps it (the page never sees the answers). */
const openOf = (uid, metric) => { const r = db.findOne('skill_records', (x) => x.user_id === uid && x.metric_id === metric); return r && r.open; };

/** A table-perfect attacking move: the fastest mate (KXK) or a move that keeps the win and makes progress (KPK). */
function bestAttack(pos) {
  const moves = C.legalMoves(pos);
  let best = null; let key = Infinity;
  for (const m of moves) {
    const a = TB.after(pos, m);
    if (a.mate) return m;
    if (m.promo && a.result === 'win') return m;
    let k;
    if (a.result !== 'win') continue;
    if (a.dtm !== null && a.dtm !== undefined) k = a.dtm;
    else {
      // KPK: promote, else push the pawn, else bring the king to the pawn's front.
      const mt = TB.material(a.next);
      if (!mt) { k = m.promo ? -100 : 1000; } else {
        const front = mt.x + 8;
        const kd = Math.max(Math.abs((mt.wk & 7) - (front & 7)), Math.abs((mt.wk >> 3) - (front >> 3)));
        k = (m.promo ? -100 : 0) + (m.piece === 'P' ? -10 : 0) - (mt.x >> 3) * 3 + kd;
      }
    }
    if (k < key) { key = k; best = m; }
  }
  return best;
}
/** A drawing defence for Black in K+P v K, from the table. */
function holdMove(pos) {
  return C.legalMoves(pos).find((m) => TB.after(pos, m).result === 'draw') || null;
}

/** The fewest-moves path through a maze (the test's own search, from the square names). */
function mazePath(maze, S) {
  const sq = (n) => C.sqIndex(n);
  const walls = new Set(maze.walls.map(sq));
  const stars = maze.stars.map(sq);
  const full = (1 << stars.length) - 1;
  const prev = new Map();
  const startKey = `${sq(maze.start)}:0`;
  prev.set(startKey, null);
  let frontier = [[sq(maze.start), 0]];
  while (frontier.length) {
    const next = [];
    for (const [s, mask] of frontier) {
      if (mask === full) {
        const path = [];
        let k = `${s}:${mask}`;
        while (prev.get(k)) { const [ps, pm, to] = prev.get(k); path.unshift(C.sqName(to)); k = `${ps}:${pm}`; }
        return path;
      }
      for (const t of S.mazeTargets(maze.piece, s, walls)) {
        const i = stars.indexOf(t);
        const m = i >= 0 ? mask | (1 << i) : mask;
        const k = `${t}:${m}`;
        if (!prev.has(k)) { prev.set(k, [s, mask, t]); next.push([t, m]); }
      }
    }
    frontier = next;
  }
  return null;
}

(async () => {
  console.log('skills round 3, patch 05: chess sittings');
  process.env.SKILL_RECORD = 'on';
  process.env.SKILL_STAGE_TESTS = 'on';
  process.env.SKILL_CHESS_SITTINGS = 'off';
  const S = fresh('services/skill-chess-sittings');
  S.setEngines({ stockfish: () => fakeStockfish, maia: () => null });
  const routes = fresh('routes/skills');
  const app = await serve([routes]);

  // ── off: patch 02's "not wired" stands ──
  const ch1 = learner('chess', 'chess_rules_learner', 'final');
  let r = await app.get(`/api/skills/checks/${ch1.enrollment.id}`, ch1.user.id);
  check('flag off: CH1 play-out and game are still not wired', r.status === 200 && r.json.checks.checks.filter((c) => !c.wired).map((c) => c.metric).join(',') === 'kqk_playout,legal_game', r.json.checks && r.json.checks.checks.map((c) => `${c.metric}:${c.how}`));

  process.env.SKILL_CHESS_SITTINGS = 'on';
  r = await app.get(`/api/skills/checks/${ch1.enrollment.id}`, ch1.user.id);
  check('flag on: every CH1 check is wired (items, items, playout, games)', r.json.checks.checks.every((c) => c.wired) && r.json.checks.checks.map((c) => c.how).join(',') === 'items,items,playout,games', r.json.checks.checks.map((c) => c.how));
  const stagesWired = {};
  for (const [stage, grade] of [['CH0', 'chess_board_explorer'], ['CH1', 'chess_rules_learner'], ['CH2', 'chess_beginner_tactician'], ['CH3', 'chess_novice_club_player'], ['CH4', 'chess_club_player'], ['CH5', 'chess_intermediate']]) {
    const L = learner('chess', grade);
    const o = (await app.get(`/api/skills/checks/${L.enrollment.id}`, L.user.id)).json.checks;
    stagesWired[stage] = `${o.checks.filter((c) => c.provable && c.wired).length}/${o.checks.filter((c) => c.provable).length}`;
  }
  check('CH0-CH5: every machine-provable chess metric has a sitting (20 of 20)', Object.values(stagesWired).every((v) => v.split('/')[0] === v.split('/')[1]) && Object.values(stagesWired).reduce((a, v) => a + Number(v.split('/')[0]), 0) === 20, stagesWired);

  // ── the endgame tables, checked against the app's own rules ──
  TB.load();
  check('tables: the packed KQK, KRK and KPK load and match their checksums', true);
  let bad = 0; let tried = 0;
  let a = 1;
  const rnd = () => { a = (a * 48271) % 2147483647; return a / 2147483647; };
  for (const [table, piece] of [['kqk', 'Q'], ['krk', 'R']]) {
    for (let n = 0; n < 4000 && tried < (table === 'kqk' ? 250 : 500); n++) {
      const wk = Math.floor(rnd() * 64); const x = Math.floor(rnd() * 64); const bk = Math.floor(rnd() * 64);
      const vb = TB.value(table, wk, x, bk, 1);
      if (vb === -2) continue;
      const pos = TB.positionOf(table, wk, x, bk, 'b');
      if (C.inCheck(pos, 'w')) continue;
      tried++;
      const mated = C.isCheckmate(pos);
      if ((vb === 0) !== mated) { bad++; continue; }
      if (vb > 0) {
        const outs = C.legalMoves(pos).map((m) => { const nx = C.makeMove(pos, m); const mt = TB.material(nx); return mt ? TB.value(table, mt.wk, mt.x, mt.bk, 0) : -1; });
        if (outs.some((v) => v < 0) || Math.max(...outs) !== vb) bad++;
      }
      const vw = TB.value(table, wk, x, bk, 0);
      if (vw > 0) {
        const wpos = TB.positionOf(table, wk, x, bk, 'w');
        if (!C.inCheck(wpos, 'b')) {
          const outs = C.legalMoves(wpos).map((m) => { const nx = C.makeMove(wpos, m); const mt = TB.material(nx); return mt && C.status(nx) !== 'stalemate' ? TB.value(table, mt.wk, mt.x, mt.bk, 1) : -1; }).filter((v) => v >= 0);
          if (!outs.length || Math.min(...outs) !== vw - 1) bad++;
        }
      }
    }
  }
  check(`tables: ${tried} K+Q/K+R v K positions agree with chess-board (mate, the longest defence, the fastest mate)`, bad === 0 && tried >= 450, { bad, tried });
  bad = 0; tried = 0;
  for (let n = 0; n < 20000 && tried < 400; n++) {
    const wk = Math.floor(rnd() * 64); const p = 8 + Math.floor(rnd() * 48); const bk = Math.floor(rnd() * 64);
    const pos = TB.positionOf('kpk', wk, p, bk, 'w');
    const v = TB.probe(pos);
    if (!v || C.status(pos) !== 'playing' || C.inCheck(pos, 'b')) continue;
    tried++;
    const winning = C.legalMoves(pos).some((m) => TB.after(pos, m).result === 'win');
    if (winning !== (v.result === 'win')) bad++;
  }
  check(`tables: ${tried} K+P v K positions: a win exactly when some move keeps it a win`, bad === 0 && tried >= 300, { bad, tried });

  // ── KQK play-out through the API ──
  const kqk = 'CH1:kqk_playout';
  const base1 = `/api/skills/checks/${ch1.enrollment.id}`;
  at(Date.UTC(2026, 9, 5, 9));
  r = await app.post(`${base1}/${kqk}/start`, {}, ch1.user.id);
  check('KQK: a sitting opens with 5 positions and no answers in it', r.status === 201 && r.json.sitting.starts === 5 && r.json.sitting.start.goal === 'mate' && !JSON.stringify(r.json).includes('"limit":null'), r.json);
  let o = openOf(ch1.user.id, kqk);
  check('...each a won K+Q v K start with a distance to mate of 6-10, the limit 6 more', o.starts.every((s) => s.dtm >= 6 && s.dtm <= 10 && s.limit === s.dtm + 6 && TB.probe(C.parseFen(s.fen)).dtm === s.dtm), o.starts.map((s) => s.dtm));
  let perfect = true; let mates = 0; let illegalOk = false;
  for (let i = 0; i < 5; i++) {
    for (let ply = 0; ply < 40; ply++) {
      o = openOf(ch1.user.id, kqk);
      if (o.current !== i) break;
      const pos = C.parseFen(o.play.fen);
      if (!illegalOk) { const bad1 = await app.post(`${base1}/${kqk}/move`, { move: 'a1a1' }, ch1.user.id); illegalOk = bad1.status === 400; }
      const m = bestAttack(pos);
      r = await app.post(`${base1}/${kqk}/move`, { move: C.uci(m) }, ch1.user.id);
      if (r.json.reply) {
        // The defence must be a longest one.
        const afterMine = C.makeMove(pos, m);
        const best = Math.max(...C.legalMoves(afterMine).map((x) => { const t = TB.after(afterMine, x); return t.result === 'draw' ? 999 : t.dtm; }));
        const got = TB.after(afterMine, C.moveFromText(afterMine, r.json.reply.uci));
        if (got.dtm !== best) perfect = false;
      }
      if (r.json.over) { if (r.json.over.ok && r.json.over.why === 'checkmate') mates++; break; }
    }
  }
  check('...an illegal move is refused', illegalOk);
  check('...the defence always picks the longest mate (the table\'s perfect defence)', perfect);
  check('...the fastest mates win all 5', mates === 5, mates);
  r = await app.post(`${base1}/${kqk}/finish`, {}, ch1.user.id);
  check('...and the sitting passes, cold, and counts', r.status === 200 && r.json.result.pass && r.json.result.right === 5 && r.json.result.counted, r.json);

  // A second day: a queen left to the king is a draw, so the play-out fails.
  at(Date.UTC(2026, 9, 6, 10));
  r = await app.post(`${base1}/${kqk}/start`, {}, ch1.user.id);
  o = openOf(ch1.user.id, kqk);
  let hung = null;
  for (let tries = 0; tries < 5 && !hung; tries++) {
    const pos = C.parseFen(o.play.fen);
    const give = C.legalMoves(pos).find((m) => m.piece === 'Q' && TB.after(pos, m).result === 'draw' && !C.isCheckmate(C.makeMove(pos, m)));
    if (give) { hung = await app.post(`${base1}/${kqk}/move`, { move: C.uci(give) }, ch1.user.id); break; }
    const m = bestAttack(pos);
    await app.post(`${base1}/${kqk}/move`, { move: C.uci(m) }, ch1.user.id);
    o = openOf(ch1.user.id, kqk);
  }
  check('KQK: leaving the queen to the king ends the play-out, failed', hung && hung.json.over && !hung.json.over.ok && /win is gone/.test(hung.json.over.why), hung && hung.json);
  for (let i = 0; i < 4; i++) await app.post(`${base1}/${kqk}/resign`, {}, ch1.user.id);
  r = await app.post(`${base1}/${kqk}/finish`, {}, ch1.user.id);
  check('...giving up the rest: the sitting fails and counts as a cold miss', r.json.result && !r.json.result.pass && r.json.result.counted && r.json.result.right === 0, r.json);

  // ── KRK: the limit ──
  const ch2 = learner('chess', 'chess_beginner_tactician', 'final');
  const base2 = `/api/skills/checks/${ch2.enrollment.id}`;
  const krk = 'CH2:krk_playout';
  at(Date.UTC(2026, 9, 7, 9));
  await app.post(`${base2}/${krk}/start`, {}, ch2.user.id);
  o = openOf(ch2.user.id, krk);
  check('KRK: 5 starts, distance to mate 8-16, the limit 8 more', o.starts.length === 5 && o.starts.every((s) => s.dtm >= 8 && s.dtm <= 16 && s.limit === s.dtm + 8));
  // At the limit: a move that keeps the win but does not mate ends the play-out.
  const ko = JSON.parse(JSON.stringify(o));
  ko.play.learner_moves = ko.starts[0].limit - 1;
  const kpos = C.parseFen(ko.play.fen);
  const slow = C.legalMoves(kpos).find((m) => { const t = TB.after(kpos, m); return t.result === 'win' && !t.mate; });
  const limitOver = (await S.move(ko, S.defFor(krk), { move: C.uci(slow) })).over;
  check('...no mate within the limit fails the play-out', limitOver && !limitOver.ok && /no mate within/.test(limitOver.why), limitOver);

  // ── KPK: four wins as White, two holds as Black ──
  const ch3 = learner('chess', 'chess_novice_club_player', 'final');
  const base3 = `/api/skills/checks/${ch3.enrollment.id}`;
  const kpk = 'CH3:kpk_playout';
  at(Date.UTC(2026, 9, 8, 9));
  await app.post(`${base3}/${kpk}/start`, {}, ch3.user.id);
  o = openOf(ch3.user.id, kpk);
  check('KPK: 4 won starts as White and 2 drawn starts as Black, as the table says', o.starts.filter((s) => s.kind === 'kpk_win' && s.learner === 'w' && TB.probe(C.parseFen(s.fen)).result === 'win').length === 4
    && o.starts.filter((s) => s.kind === 'kpk_draw' && s.learner === 'b' && TB.probe(C.parseFen(s.fen)).result === 'draw').length === 2, o.starts.map((s) => s.kind));
  const kpkResults = [];
  for (let i = 0; i < 6; i++) {
    for (let ply = 0; ply < 60; ply++) {
      o = openOf(ch3.user.id, kpk);
      if (o.current !== i) break;
      const pos = C.parseFen(o.play.fen);
      const m = o.starts[i].learner === 'w' ? bestAttack(pos) : holdMove(pos);
      r = await app.post(`${base3}/${kpk}/move`, { move: C.uci(m) }, ch3.user.id);
      if (r.json.over) { kpkResults.push(r.json.over); break; }
    }
  }
  check('...table-best play converts all 4 and holds both', kpkResults.length === 6 && kpkResults.every((x) => x.ok), kpkResults);
  r = await app.post(`${base3}/${kpk}/finish`, {}, ch3.user.id);
  check('...and passes', r.json.result && r.json.result.pass, r.json);
  // A drawn start where a Black move loses: playing it ends the hold.
  const drawStart = require('../content/skill-chess-sittings.data.json').kpk_playout.drawn_black_to_move[0];
  const S2 = S;
  const holdOpen = { how: 'playout', starts: [{ kind: 'kpk_draw', fen: drawStart.fen, learner: 'b', limit: 25, goal: 'hold' }], current: 0, results: [] };
  holdOpen.play = { fen: drawStart.fen, moves: [], learner_moves: 0, quiet: 0, seen: {}, strikes: 0, over: null };
  const dpos = C.parseFen(drawStart.fen);
  const loser = C.legalMoves(dpos).find((m) => TB.after(dpos, m).result === 'win');
  const lostHold = await S2.move(holdOpen, S2.defFor(kpk), { move: C.uci(loser) });
  check('KPK hold: a move that lets White win ends it, failed', lostHold.over && !lostHold.over.ok && /White wins/.test(lostHold.over.why), lostHold);

  // ── rook endings (Lucena, Philidor) with the stand-in engine ──
  const ch5 = learner('chess', 'chess_intermediate', 'final');
  const base5 = `/api/skills/checks/${ch5.enrollment.id}`;
  const rook = 'CH5:rook_endgame_playouts';
  const rookData = require('../content/skill-chess-sittings.data.json').rook_endgames;
  check('rook endings: Stockfish-verified Lucena and Philidor starts are in the data', rookData && rookData.lucena.length >= 4 && rookData.philidor.length >= 4 && rookData.philidor.every((p) => p.losing.length >= 1), rookData && { l: rookData.lucena.length, p: rookData.philidor.length });
  at(Date.UTC(2026, 9, 9, 9));
  r = await app.post(`${base5}/${rook}/start`, {}, ch5.user.id);
  check('...a sitting: one Lucena as White, one Philidor as Black', r.status === 201 && r.json.sitting.starts === 2 && r.json.sitting.start.kind === 'lucena' && r.json.sitting.start.learner === 'w', r.json);
  o = openOf(ch5.user.id, rook);
  const lpos = C.parseFen(o.play.fen);
  const lmove = (await fakeStockfish(o.play.fen)).lines[0].uci;
  r = await app.post(`${base5}/${rook}/move`, { move: lmove }, ch5.user.id);
  check('...the engine answers with a legal defence', r.status === 200 && r.json.reply && !!C.moveFromText(C.makeMove(lpos, C.moveFromText(lpos, lmove)), r.json.reply.uci), r.json);
  S.setEngines({ stockfish: () => null, maia: () => null });
  r = await app.get(base5, ch5.user.id);
  const rookRow = r.json.checks.checks.find((c) => c.metric === 'rook_endgame_playouts');
  check('without Stockfish the rook endings are not checkable here, and say why', rookRow && !rookRow.wired && /Stockfish/.test(rookRow.needs_build), rookRow);
  const fenNow = openOf(ch5.user.id, rook).play.fen;
  const legalNow = C.uci(C.legalMoves(C.parseFen(fenNow))[0]);
  r = await app.post(`${base5}/${rook}/move`, { move: legalNow }, ch5.user.id);
  check('...and an open one cannot be played on (503, the position unchanged)', r.status === 503 && openOf(ch5.user.id, rook).play.fen === fenNow, r);
  S.setEngines({ stockfish: () => fakeStockfish, maia: () => null });

  // ── star mazes ──
  const ch0 = learner('chess', 'chess_board_explorer', 'final');
  const base0 = `/api/skills/checks/${ch0.enrollment.id}`;
  const maze = 'CH0:star_maze_par';
  at(Date.UTC(2026, 9, 10, 9));
  r = await app.post(`${base0}/${maze}/start`, {}, ch0.user.id);
  check('mazes: four, rook, bishop, queen, knight, each with a par of 3-7', r.status === 201 && r.json.sitting.mazes === 4 && openOf(ch0.user.id, maze).mazes.map((m) => m.piece).join('') === 'RBQN' && openOf(ch0.user.id, maze).mazes.every((m) => m.par >= 3 && m.par <= 7), r.json);
  o = openOf(ch0.user.id, maze);
  check('...the par is the fewest moves (the test\'s own search agrees)', o.mazes.every((m) => mazePath(m, S).length === m.par), o.mazes.map((m) => [m.par, mazePath(m, S).length]));
  const into = o.mazes[0].walls[0];
  r = await app.post(`${base0}/${maze}/move`, { to: into }, ch0.user.id);
  check('...a move onto a wall is refused', r.status === 400);
  const mazeOver = [];
  for (let i = 0; i < 4; i++) {
    const m = openOf(ch0.user.id, maze).mazes[i];
    const pathMoves = i === 3 ? [] : mazePath(m, S);
    if (i === 3) { r = await app.post(`${base0}/${maze}/resign`, {}, ch0.user.id); mazeOver.push(r.json.over); continue; }
    for (const to of pathMoves) { r = await app.post(`${base0}/${maze}/move`, { to }, ch0.user.id); if (r.json.over) mazeOver.push(r.json.over); }
  }
  check('...three solved at par and one given up', mazeOver.length === 4 && mazeOver.slice(0, 3).every((x) => x.at_par) && !mazeOver[3].at_par, mazeOver);
  r = await app.post(`${base0}/${maze}/finish`, {}, ch0.user.id);
  check('...3 of 4 at par passes', r.json.result && r.json.result.pass && r.json.result.right === 3, r.json);

  // ── set-up from memory ──
  const setup = 'CH0:setup_from_memory';
  r = await app.post(`${base0}/${setup}/start`, {}, ch0.user.id);
  check('set-up: one item, an empty board to fill, no answer sent', r.status === 201 && r.json.sitting.items.length === 1 && r.json.sitting.items[0].kind === 'setup' && !JSON.stringify(r.json).includes('RNBQKBNR'), r.json);
  await app.post(`${base0}/${setup}/answer`, { index: 0, answer: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR' }, ch0.user.id);
  r = await app.post(`${base0}/${setup}/finish`, {}, ch0.user.id);
  check('...king and queen swapped: wrong, warm (sat after the maze the same day), not counted', r.json.result && !r.json.result.pass && r.json.result.review[0].answer === 'the starting position', r.json.result);
  const S3 = S;
  const setItem = S3.BUILDERS.chess_setup({ count: 1 })[0];
  const right = S3.gradeItem(setItem, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  const two = S3.gradeItem(setItem, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR');
  const extra = S3.gradeItem(setItem, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR');
  check('...grading: all 32 right is right; a swap is 30 of 32; an extra piece is wrong', right.correct && right.right === 32 && !two.correct && two.right === 30 && !extra.correct && extra.right === 32, { right, two, extra });

  // ── whole lines ──
  const calc = require('../content/skill-chess-sittings.data.json').calculation;
  check('lines: Stockfish-checked positions of 3-4 learner moves are in the data, none from the app\'s puzzle import',
    calc && calc.items.length >= 20 && calc.items.every((q) => q.uci.length >= 5 && q.learner_moves >= 3) && !calc.items.some((q) => require('../content/chess-puzzles-lichess').some((p) => p.id === q.id)), calc && calc.items.length);
  const lineItem = S3.BUILDERS.chess_line({ count: 1 }, () => 0.3)[0];
  const sans = lineItem.key.line;
  const numbered = sans.map((s, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${s}` : s)).join(' ');
  const wrongReply = sans.slice(); wrongReply[1] = 'xx';
  check('...the whole line is right, with or without move numbers', S3.gradeItem(lineItem, sans.join(' ')).correct && S3.gradeItem(lineItem, numbered).correct);
  check('...a wrong reply, or the line cut short, is wrong', !S3.gradeItem(lineItem, wrongReply.join(' ')).correct && !S3.gradeItem(lineItem, sans.slice(0, -2).join(' ')).correct);
  const forPage = JSON.stringify(require('../services/skill-checks').itemsForPage([lineItem]));
  check('...the item the page gets has the position and its length, not the line', !forPage.includes('"key"') && forPage.includes('"plies"'), forPage);

  // ── recorded games ──
  const dataJson = require('../content/skill-chess-sittings.data.json');
  const measured = dataJson.opponents && dataJson.opponents.list;
  check('games: the bots carry ratings measured in games against Stockfish and Maia-2 anchors', measured && measured.length >= 3 && measured.filter((x) => x.engine === 'bot').every((x) => Number.isFinite(x.rating) && Array.isArray(x.ci95)), measured);
  const keep = dataJson.opponents;
  dataJson.opponents = { list: [{ id: 'ours-s1', engine: 'bot', strength: 1, rating: 500 }, { id: 'ours-s5', engine: 'bot', strength: 5, rating: 700 }, { id: 'maia-1100', engine: 'maia', elo: 1100, rating: 1000 }] };
  check('...a band takes the bots rated inside it; Maia-2 only where it is installed', S.bandOpponents([600, 800]).map((x) => x.id).join() === 'ours-s5' && S.bandOpponents([900, 1100]).length === 0 && S.bandOpponents('lowest')[0].id === 'ours-s1');
  r = await app.get(base3, ch3.user.id);
  const g3 = r.json.checks.checks.find((c) => c.metric === 'games');
  check('...no bot in the 900-1100 band here: CH3 games say what they need', g3 && !g3.wired && /900-1100/.test(g3.needs_build), g3);
  S.setEngines({ stockfish: () => fakeStockfish, maia: () => ({ available: () => true, predict: async () => ({ moves: {} }), choose: () => null }) });
  r = await app.get(base3, ch3.user.id);
  check('...with Maia-2 installed, the 1000 bot is near enough (within 100 of the band)', r.json.checks.checks.find((c) => c.metric === 'games').wired);
  S.setEngines({ stockfish: () => fakeStockfish, maia: () => null });

  const lg = 'CH1:legal_game';
  at(Date.UTC(2026, 9, 11, 9));
  r = await app.post(`${base1}/${lg}/start`, {}, ch1.user.id);
  check('legal game: the first game opens, you are White, against the gentlest bot', r.status === 201 && r.json.sitting.games.length === 1 && r.json.sitting.games[0].learner === 'w' && r.json.sitting.games[0].opponent.rating === 500, r.json);
  r = await app.post(`${base1}/${lg}/move`, { move: 'e2e5' }, ch1.user.id);
  check('...a typed illegal move is refused and counted', r.status === 400 && openOf(ch1.user.id, lg).games[0].illegal === 1, r);
  let overs = [];
  for (let ply = 0; ply < 400 && overs.length < 2; ply++) {
    o = openOf(ch1.user.id, lg);
    const g = o.games[o.games.length - 1];
    if (g.result !== null) break;
    const pos = C.parseFen(g.fen);
    const m = bot.chooseMove(pos, { strength: 4, random: () => 0.5 });
    later(20 * 1000);
    r = await app.post(`${base1}/${lg}/move`, { move: C.uci(m.move) }, ch1.user.id);
    if (r.status !== 200) { overs.push({ error: r.json }); break; }
    if (r.json.over) overs.push(r.json.over);
  }
  o = openOf(ch1.user.id, lg);
  check('...two games are played to their end on the server, the second as Black (the bot moved first)', overs.length === 2 && overs.every((x) => x.why) && o.games[1].learner === 'b' && o.games[1].moves.length > 0, overs);
  r = await app.post(`${base1}/${lg}/finish`, {}, ch1.user.id);
  check('...both full games: the legal-game check passes, from the source "games"', r.json.result && r.json.result.pass && r.json.result.source === 'games', r.json);

  // Clocks, abandonment and resignation in a rapid series.
  const hp = 'CH2:hung_pieces_per_game';
  at(Date.UTC(2026, 9, 12, 9));
  dataJson.opponents = { list: [{ id: 'ours-s5', engine: 'bot', strength: 5, rating: 700 }] };
  r = await app.post(`${base2}/${hp}/start`, {}, ch2.user.id);
  check('rapid games: 15+10 on the server\'s clock', r.status === 201 && r.json.sitting.games[0].clock_ms === 900000, r.json);
  later(901 * 1000);
  r = await app.post(`${base2}/${hp}/move`, { move: 'e2e4' }, ch2.user.id);
  check('...a move after 15 minutes loses on time, and the next game opens', r.json.over && r.json.over.score === 0 && r.json.over.why === 'out of time' && r.json.next, r.json);
  later(7 * HOUR);
  r = await app.post(`${base2}/${hp}/move`, { move: 'e7e5' }, ch2.user.id);
  check('...a game left for 6 hours is lost as abandoned', r.json.over && r.json.over.why === 'abandoned', r.json);
  r = await app.post(`${base2}/${hp}/resign`, {}, ch2.user.id);
  check('...resigning loses the game and opens the next', r.json.over && r.json.over.why === 'resigned' && r.json.next.index === 3, r.json);
  later(5 * HOUR);
  r = await app.get(base2, ch2.user.id);
  check('...the series is still open after 12 hours (games stay open for 21 days)', !!openOf(ch2.user.id, hp));
  r = await app.post(`${base2}/${hp}/finish`, {}, ch2.user.id);
  check('...and cannot be finished before its 12 games', r.status === 409);
  later(22 * DAY);
  r = await app.post(`${base2}/${hp}/start`, {}, ch2.user.id);
  const hpRow = (await app.get(base2, ch2.user.id)).json.checks.checks.find((c) => c.id === hp);
  check('...after 21 days a series left open is closed as failed, and a new one opens', r.status === 201 && hpRow.last && hpRow.last.pass === false, { status: r.status, last: hpRow.last });

  // The review: a hung queen is a blunder and a piece left hanging.
  const review = await S.analyseGame({ learner: 'w', moves: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7', 'g1f3', 'd7d6'] });
  check('game review: Qxf7+?? (the queen for a pawn) is a blunder and a piece left hanging', review.blunders >= 1 && review.hung >= 1 && review.marks.some((m) => m.move === 'h5f7' && m.hung), review);
  const quiet = await S.analyseGame({ learner: 'w', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'] });
  check('...a quiet opening has none', quiet.blunders === 0 && quiet.hung === 0, quiet);
  // The rules on finished series.
  const mk = (res, rating, b, h) => ({ result: res, opponent: { id: 'x', rating }, full: true, analysis: { blunders: b, hung: h, accuracy: 80 } });
  const series = (list) => ({ how: 'games', games: list });
  const ch3def = S.defFor('CH3:games'); const ch2def = S.defFor(hp); const ch4def = S.defFor('CH4:games');
  const twelve = (score, b, h, rating = 1000) => Array.from({ length: 12 }, (_, i) => mk(i < Math.floor(score) ? 1 : i === Math.floor(score) && score % 1 ? 0.5 : 0, rating, b, h));
  check('rules: CH3 games pass at 6/12 with median 1 blunder; fail at 5.5/12 or median 2', S.result(series(twelve(6, 1, 0)), ch3def).pass && !S.result(series(twelve(5.5, 1, 0)), ch3def).pass && !S.result(series(twelve(6, 2, 0)), ch3def).pass);
  check('...CH2 hanging pieces: 40% and a median of 1 pass; a median of 2 fails', S.result(series(twelve(5, 3, 1, 700)), ch2def).pass && !S.result(series(twelve(5, 0, 2, 700)), ch2def).pass);
  check('...performance rating: 6/12 against 1300s is 1300; CH4 needs 1250', S.performance(twelve(6, 0, 0, 1300)) === 1300 && S.result(series(twelve(6, 0, 0, 1300)), ch4def).pass && !S.result(series(twelve(3, 0, 0, 1300)), ch4def).pass, S.performance(twelve(6, 0, 0, 1300)));
  check('...a clean sweep is 400 above the field, a whitewash 400 below', S.performance(twelve(12, 0, 0, 1300)) === 1700 && S.performance(twelve(0, 0, 0, 1300)) === 900);
  dataJson.opponents = keep;

  // ── real Stockfish, when this machine has it ──
  const E = require('../services/chess-engine');
  if (E.available('stockfish')) {
    S.setEngines(null);
    const lu = rookData.lucena[0];
    const ra = await E.analyse(lu.fen, { engine: 'stockfish', nodes: 400000, slot: 'test' });
    check('real Stockfish: a stored Lucena start is still a win for White', ra.lines[0] && (ra.lines[0].mate > 0 || ra.lines[0].cp >= 400), ra.lines[0]);
    E.closeAll();
    S.setEngines({ stockfish: () => fakeStockfish, maia: () => null });
  } else console.log('  skip real Stockfish (not installed here)');

  // ── the page: moves only, to the checks API ──
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'chess-sittings.js'), 'utf8');
  check('the chess sittings page script has no fetch, upload, recorder, camera or microphone of its own', !/getUserMedia|MediaRecorder|mediaDevices|FormData|sendBeacon|XMLHttpRequest|fetch\(|https?:\/\//.test(page));
  check('...and the stage check page loads it', /chess-sittings\.js/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'stage-check.html'), 'utf8')));

  app.close();
  F.done();
})().catch((err) => { console.error(err); process.exit(1); });
