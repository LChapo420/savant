// The puzzle trainer: the starter set re-verified, the Lichess import checked,
// Glicko-2 against Glickman's worked example, rated and rush play graded on the
// server; the move trainer's spaced repetition; opening names; the engine
// services (Stockfish/Leorik over UCI, Maia-2), with their live checks skipped
// when an engine is not installed. Runs on a throwaway database file, so it never
// touches a real one.
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `chess-trainer-test-${process.pid}.json`);
process.env.DB_FILE = tmp;
const C = require('../content/chess-board');
const S = require('../content/chess-solver');
const R = require('../content/chess-rating');
const STARTER = require('../content/chess-puzzles');
const trainer = require('../content/chess-trainer');
const PUZZLES = trainer.PUZZLES; // the starter set and the Lichess import
const db = require('../config/db');

let failures = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

console.log('Glicko-2');
const g = R.update({ rating: 1500, rd: 200, vol: 0.06 }, [{ rating: 1400, rd: 30, score: 1 }, { rating: 1550, rd: 100, score: 0 }, { rating: 1700, rd: 300, score: 0 }]);
ok(Math.abs(g.rating - 1464.06) < 0.05 && Math.abs(g.rd - 151.52) < 0.05 && Math.abs(g.vol - 0.05999) < 0.0001, `Glickman's example gives 1464.06 / 151.52 / 0.05999 (got ${g.rating.toFixed(2)} / ${g.rd.toFixed(2)} / ${g.vol.toFixed(5)})`);
ok(R.update(R.START, [{ rating: 1000, rd: 80, score: 1 }]).rating > 1000 && R.update(R.START, [{ rating: 1000, rd: 80, score: 0 }]).rating < 1000, 'a solve raises the rating and a miss lowers it');

console.log('the starter set');
ok(STARTER.length >= 40, `at least 40 puzzles (${STARTER.length})`);
ok(new Set(PUZZLES.map((p) => p.id)).size === PUZZLES.length, 'ids are unique across the starter set and the import');
let lines = 0;
let uniqueFirst = 0;
for (const p of STARTER) {
  const played = S.replay(p.fen, p.line);
  if (played) lines++;
  if (p.kind === 'mate') {
    const pos = C.parseFen(p.fen);
    const firsts = S.mateMoves(pos, p.moves).map((m) => C.uci(m));
    if (firsts.length === 1 && firsts[0] === p.line[0] && played && C.isCheckmate(played.end)) uniqueFirst++;
  } else uniqueFirst++; // material puzzles were checked by search when built (see "verified")
}
ok(lines === STARTER.length, 'every solution line is legal from its position');
ok(uniqueFirst === STARTER.length, 'every mate puzzle has exactly one first move that mates in time, and its line ends in mate');

console.log('the Lichess import (CC0)');
const LICHESS = PUZZLES.filter((p) => p.source === 'lichess');
ok(LICHESS.length >= 3000, `at least 3,000 imported puzzles (${LICHESS.length})`);
const bands = new Map();
for (const p of LICHESS) bands.set(Math.floor(p.rating / 100) * 100, (bands.get(Math.floor(p.rating / 100) * 100) || 0) + 1);
ok([...bands.keys()].every((b) => b >= 400 && b < 2400) && bands.size >= 18, `ratings spread over ${bands.size} hundred-point bands from 400 to 2399`);
const fams = new Set(LICHESS.flatMap((p) => p.themes));
ok(['mateIn1', 'mateIn2', 'fork', 'pin', 'skewer', 'discoveredAttack', 'hangingPiece', 'promotion'].every((t) => fams.has(t)), 'the main theme families are all there');
// Fast replay: each from-to move must be one of the legal moves.
const fastReplay = (fen, line) => {
  let pos = C.parseFen(fen);
  for (const u of line) {
    const m = C.legalMoves(pos).find((x) => C.uci(x) === u);
    if (!m) return null;
    pos = C.makeMove(pos, m);
  }
  return pos;
};
let lichessLegal = 0;
let lichessMates = 0;
let mateCount = 0;
for (const p of LICHESS) {
  const end = fastReplay(p.fen, p.line);
  if (end) lichessLegal++;
  if (p.kind === 'mate') { mateCount++; if (end && C.isCheckmate(end)) lichessMates++; }
}
ok(lichessLegal === LICHESS.length, 'every imported line replays legally');
ok(lichessMates === mateCount, `every imported mate line ends in checkmate (${mateCount})`);
ok(LICHESS.every((p) => /^Stockfish/.test(p.verified) && p.lichess && p.last), 'each records its Stockfish check, its Lichess id and the move that set it up');
const sampleMates = LICHESS.filter((p) => p.kind === 'mate' && p.moves <= 2).filter((_, i) => i % 25 === 0);
ok(sampleMates.every((p) => { const f = S.mateMoves(C.parseFen(p.fen), p.moves).map((m) => C.uci(m)); return f.length === 1 && f[0] === p.line[0]; }), `a sample of ${sampleMates.length} short mates is proved unique by exhaustive search`);

console.log('rated play, graded on the server');
const byPuzzleId = new Map(PUZZLES.map((p) => [p.id, p]));
const puzzleOf = (shown) => byPuzzleId.get(db.byId('chess_puzzle_attempts', shown.attempt_id).puzzle_id);
// A move that is wrong in this puzzle: not the line's, not a mate, and not another mate in time.
const wrongMove = (p) => {
  const pos = C.parseFen(p.fen);
  return C.legalMoves(pos).find((m) => C.uci(m) !== p.line[0] && !C.isCheckmate(C.makeMove(pos, m))
    && !(p.kind === 'mate' && p.moves <= 2 && S.mateMoves(pos, p.moves).some((x) => C.uci(x) === C.uci(m))));
};
const user = 9001;
const first = trainer.nextRated(user);
ok(first.puzzle && first.puzzle.fen && !('line' in first.puzzle) && !JSON.stringify(first).includes(puzzleOf(first.puzzle).line[0]), 'a puzzle reaches the page without its solution');
ok(first.me.rating === 1000 && first.me.provisional, 'a new learner starts at 1000, provisional');
// Play the stored line: every learner move right, every reply played by the server.
const solve = (shown) => {
  const p = puzzleOf(shown);
  let out = null;
  for (let i = 0; i < p.line.length; i += 2) {
    out = trainer.move(user, shown.attempt_id, p.line[i]);
    if (!out.correct) return out;
    if (!out.done && out.reply.uci !== p.line[i + 1] && p.kind !== 'mate') return { correct: false, why: 'unexpected reply' };
    if (out.done) return out;
  }
  return out;
};
const won = solve(first.puzzle);
ok(won.correct && won.done && won.change && won.change.after > won.change.before, `solving the line raises the rating (${won.change && won.change.before} -> ${won.change && won.change.after})`);
const second = trainer.nextRated(user);
const p2 = puzzleOf(second.puzzle);
const pos2 = C.parseFen(p2.fen);
const wrong = wrongMove(p2);
const lost = trainer.move(user, second.puzzle.attempt_id, C.uci(wrong));
ok(!lost.correct && lost.done && lost.solution.length && lost.solution[0].uci === p2.line[0] && lost.change.after < lost.change.before, 'a wrong move ends the puzzle, shows the solution and lowers the rating');
ok(trainer.move(user, second.puzzle.attempt_id, p2.line[0]).error, 'a finished puzzle takes no more moves');
const retry = trainer.nextRated(user, { retry: second.puzzle.attempt_id });
ok(retry.puzzle.fen === p2.fen, 'a failed puzzle can be tried again');
const before = trainer.summary(user).rating;
solve(retry.puzzle);
ok(trainer.summary(user).rating === before, 'a retry is not rated');
ok(trainer.move(user + 1, retry.puzzle.attempt_id, p2.line[0]).error, 'no one else can play a learner\'s puzzle');
// Any mate counts on the last move: the Opera mate-in-two with the stored line.
const opera = PUZZLES.find((p) => p.id === 'legacy');
const att = db.insert('chess_puzzle_attempts', { user_id: user, puzzle_id: opera.id, mode: 'retry', rush_id: null, fen: opera.fen, step: 0, played: [], status: 'open', rated: false });
const m1 = trainer.move(user, att.id, 'Qg8+');
ok(m1.correct && !m1.done && m1.reply.san === 'Rxg8', 'a mate-in-two answers the sacrifice with the forced recapture');
ok(trainer.move(user, att.id, 'Nf7#').done, 'and the smothered mate finishes it');
// An unfinished rated puzzle counts as failed when the next one starts.
const left = trainer.nextRated(user);
const r1 = trainer.summary(user).rating;
trainer.nextRated(user);
ok(trainer.summary(user).rating < r1 && db.byId('chess_puzzle_attempts', left.puzzle.attempt_id).status === 'failed', 'leaving a rated puzzle unfinished counts as a miss');

console.log('practice at the 0.75 expected score (CHESS_PRACTICE_TARGET, evidence article 04 P1)');
ok(Math.abs(trainer.eloOffset(0.75) - 190.85) < 0.1 && Math.abs(trainer.eloOffset(0.6) - 70.44) < 0.1, `the Elo expectation puts 0.75 at ${trainer.eloOffset(0.75).toFixed(1)} and 0.6 at ${trainer.eloOffset(0.6).toFixed(1)} points below (SKILL-CURRICULA: 191 and 70)`);
const pu = 9101;
trainer.summary(pu);
const setRating = (u, rt) => { const row = db.findOne('chess_ratings', (x) => x.user_id === u); db.update('chess_ratings', row.id, { rating: rt, rd: 60, vol: 0.06 }); };
const drawRatings = (u, n) => {
  const out = [];
  for (let i = 0; i < n; i++) { setRating(u, 1500); const s = trainer.nextRated(u); out.push(puzzleOf(s.puzzle).rating); }
  setRating(u, 1500);
  return out;
};
const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const tgt = trainer.practiceTarget(pu, 1500);
ok(Math.abs(tgt.target - 1309.15) < 0.1 && tgt.expected === 0.75, `a 1500 learner practises at ${tgt.target.toFixed(0)}, expected score 0.75`);
const practised = drawRatings(pu, 40);
const chance = meanOf(practised.map((pr) => 1 / (1 + 10 ** (-(1500 - pr) / 400))));
ok(Math.abs(meanOf(practised) - 1309) < 60 && chance > 0.7 && chance < 0.8, `practice puzzles average ${meanOf(practised).toFixed(0)} (Elo expected score ${chance.toFixed(2)})`);
// A stage check's rated-puzzle sitting keeps the nearest-rating rule (the measurement optimum).
const sittingRow = db.insert('skill_records', { user_id: pu, subject: 'chess', metric_id: 'CH4:tactics_rating', open: { how: 'puzzles', metric_id: 'CH4:tactics_rating', started_at: Date.now(), cut: 1590, rd: 80, min: 10 } });
ok(trainer.practiceTarget(pu, 1500).target === 1500, 'while a stage check\'s puzzle sitting is open the target is the learner\'s own rating');
const sat = drawRatings(pu, 30);
ok(Math.abs(meanOf(sat) - 1500) < 60, `sitting puzzles average ${meanOf(sat).toFixed(0)}, at the rating`);
db.update('skill_records', sittingRow.id, { open: null });
process.env.CHESS_PRACTICE_TARGET = 'off';
ok(trainer.practiceTarget(pu, 1500).target === 1500, 'CHESS_PRACTICE_TARGET=off serves at the rating again');
process.env.CHESS_PRACTICE_TARGET = '0.6';
ok(Math.abs(trainer.practiceTarget(pu, 1500).target - (1500 - 70.44)) < 0.1, 'CHESS_PRACTICE_TARGET=0.6 sets the calculation score (70 below)');
delete process.env.CHESS_PRACTICE_TARGET;
const ownerRow = db.insert('users', { email: require('../config/owner').ownerEmail(), display_name: 'Owner' });
ok(trainer.practiceTarget(ownerRow.id, 1500).target === 1500, 'the owner gets the base trainer (target at the rating)');

console.log('rush');
const rush = trainer.startRush(user);
ok(rush.rush.ms_left > 170000 && rush.rush.strikes === 0 && rush.puzzle, 'a rush starts with three minutes, no strikes and a puzzle');
let cur = rush.puzzle;
let solved = 0;
for (let i = 0; i < 3; i++) {
  const out = solve(cur);
  if (out.correct) solved++;
  cur = out.rush && out.rush.next;
}
const runNow = trainer.rushStatus(user, rush.rush.id).rush;
ok(runNow.score === 3 && solved === 3, 'three solved puzzles score three');
const served = db.byId('chess_rush_runs', rush.rush.id).served.map((id) => PUZZLES.find((p) => p.id === id).rating);
ok(served.length === 4 && served[3] >= served[0], `rush puzzles get harder (${served.join(', ')})`);
let state = null;
for (let i = 0; i < 3; i++) {
  const p = puzzleOf(cur);
  const bad = wrongMove(p);
  const out = trainer.move(user, cur.attempt_id, C.uci(bad));
  state = out.rush;
  cur = state.next;
}
ok(state.status === 'over' && state.reason === 'strikes' && state.best === 3, 'three strikes end the rush and keep the best score');
ok(trainer.summary(user).rush_best === 3, 'the best rush score is stored with the rating');
// The server's clock decides: a move after time is up does not count.
const late = trainer.startRush(user);
db.update('chess_rush_runs', late.rush.id, { ends_at: new Date(Date.now() - 10000).toISOString() });
const pLate = puzzleOf(late.puzzle);
const tooLate = trainer.move(user, late.puzzle.attempt_id, pLate.line[0]);
ok(tooLate.timeUp && tooLate.rush.status === 'over' && tooLate.rush.reason === 'time' && tooLate.rush.score === 0, 'a move after the three minutes is refused and ends the rush');

// A Lichess puzzle: the stored line solves it, and its credit comes only at the end.
const lp = PUZZLES.find((p) => p.source === 'lichess' && p.moves >= 2);
if (lp) {
  const la = db.insert('chess_puzzle_attempts', { user_id: user, puzzle_id: lp.id, mode: 'retry', rush_id: null, fen: lp.fen, step: 0, played: [], status: 'open', rated: false });
  let out = null;
  for (let i = 0; i < lp.line.length; i += 2) {
    out = trainer.move(user, la.id, lp.line[i]);
    if (!out.correct || out.done) break;
    ok(!out.credit, 'no Lichess link while the puzzle is still open');
  }
  ok(out && out.correct && out.done && out.credit && /lichess\.org\/training\//.test(out.credit.url) && /CC0/.test(out.credit.text), `an imported puzzle (${lp.id}) is solved by its line and credits Lichess at the end`);
}

console.log('move trainer (per-move spaced repetition)');
const srs = require('../content/chess-srs');
const O = require('../content/chess-openings');
ok(srs.LEVEL_HOURS.join() === '4,24,72,168,336,720,2160,4320', 'eight levels: 4 h, 1 d, 3 d, 1 w, 2 w, 1 mo, 3 mo, 6 mo');
ok(srs.EXPANDED.every((l) => l.plies.filter((p) => p.mine).every((p) => p.why && p.why.length > 15)), 'every move the learner plays has its reason');
const openingLines = srs.EXPANDED.filter((l) => /^open-/.test(l.deck));
ok(openingLines.length >= 10 && openingLines.every((l) => { const n = O.nameOfGame(l.plies.map((p) => p.uci)); return n && n.name === l.title; }), `each opening line's title is its name in the CC0 opening list (${openingLines.length} lines)`);
ok(srs.DECKS.every((d) => srs.EXPANDED.some((l) => l.deck === d.id)), 'every deck has lines');
const learner = 9100;
const T0 = Date.parse('2026-01-01T00:00:00Z');
const HOUR = 3600000;
let view = srs.next(learner, { deck: 'open-white', mode: 'review' }, T0);
ok(view.none, 'nothing is due before anything is learned');
view = srs.next(learner, { deck: 'open-white', mode: 'learn' }, T0);
ok(view.teach && view.teach.why && view.fen && !view.done, 'learn mode shows the new move and its reason first');
const firstLine = srs.EXPANDED.find((l) => l.id === view.line.id);
const plyAt = (fen) => firstLine.plies.find((p) => p.fen === fen && p.mine);
let guard = 0;
while (!view.done && guard++ < 40) {
  view = srs.move(learner, view.run_id, view.teach ? view.teach.uci : plyAt(view.fen).uci, T0);
  if (!view.correct) break;
}
ok(view.done && view.summary.wrong === 0, `a whole line learned move by move (${view.summary && view.summary.right} moves)`);
const learnedCards = db.find('chess_drill_cards', (c) => c.user_id === learner);
ok(learnedCards.length === firstLine.plies.filter((p) => p.mine).length && learnedCards.every((c) => c.level === 1 && Date.parse(c.due_at) === T0 + 4 * HOUR), 'each learned move is its own card, due in 4 hours');
ok(srs.next(learner, { deck: 'open-white', mode: 'review' }, T0 + HOUR).none, 'not due after one hour');
const later = T0 + 5 * HOUR;
const card0 = learnedCards[0];
// One card not due yet: only due moves are asked, the rest are played for the learner.
db.update('chess_drill_cards', learnedCards[1].id, { due_at: new Date(later + HOUR).toISOString() });
view = srs.next(learner, { deck: 'open-white', mode: 'review' }, later);
ok(view.line.id === firstLine.id && !view.teach && !view.done, 'after 5 hours the line comes back for review, with no answer shown');
const asked = [];
guard = 0;
while (!view.done && guard++ < 40) {
  const ply = plyAt(view.fen);
  asked.push(ply.card);
  if (asked.length === 2) {
    const alts = srs.ALTS[ply.card] || [];
    const bad = C.legalMoves(C.parseFen(ply.fen)).find((m) => C.uci(m) !== ply.uci && !alts.includes(C.uci(m)));
    const miss = srs.move(learner, view.run_id, C.uci(bad), later);
    ok(!miss.correct && miss.answer.uci === ply.uci && miss.why === ply.why, 'a wrong move shows the right one and why');
    ok(miss.scored && miss.scored.level === 1 && Date.parse(miss.scored.due) === later + 4 * HOUR, 'a mistake drops the card (never below level 1) and brings it back in 4 hours');
    const again = srs.move(learner, view.run_id, ply.uci, later);
    ok(again.correct && !again.scored, 'playing the right move after a slip goes on but is not scored');
    view = again;
    continue;
  }
  view = srs.move(learner, view.run_id, ply.uci, later);
}
ok(!asked.includes(learnedCards[1].card_id), 'a move that is not due is played for the learner, not asked');
const up = db.byId('chess_drill_cards', card0.id);
ok(up.level === 2 && Date.parse(up.due_at) === later + 24 * HOUR, 'a right review moves the card up: level 2, due in a day');
const veryLate = later + 200 * 24 * HOUR;
srs.schedule(learner, card0.card_id, true, veryLate);
ok(db.byId('chess_drill_cards', card0.id).level === 3, 'a review 200 days late answered right still moves up (no reset to level 1)');
for (let k = 0; k < 10; k++) srs.schedule(learner, card0.card_id, true, veryLate);
const topCard = db.byId('chess_drill_cards', card0.id);
ok(topCard.level === 8 && Date.parse(topCard.due_at) === veryLate + 4320 * HOUR, 'the ladder tops out at level 8: six months');
srs.schedule(learner, card0.card_id, false, veryLate);
ok(db.byId('chess_drill_cards', card0.id).level === 6, 'a slip at level 8 drops two levels, to 6');
const capUser = 9200;
let learnedN = 0;
for (const [id, inf] of srs.CARDS) {
  if (learnedN >= srs.NEW_PER_DAY) break;
  if (inf.line.deck === 'mates') { srs.schedule(capUser, id, true, T0); learnedN++; }
}
ok(srs.next(capUser, { mode: 'learn' }, T0 + 1000).limit, `at most ${srs.NEW_PER_DAY} new moves a day`);
const mateLine = srs.EXPANDED.find((l) => l.deck === 'mates' && l.plies.length === 1);
ok(mateLine && mateLine.plies[0].mates, 'the mating-pattern cards come from the hand-set mate puzzles');
ok(srs.decks(learner, later).decks.find((d) => d.id === 'open-white').learned === learnedCards.length, 'the deck list counts learned moves');
ok(srs.move(learner + 1, view.run_id, 'e2e4').error, 'no one else can play a learner\'s line');

console.log('opening names (CC0 lichess-org/chess-openings)');
ok(O.count >= 3000, `${O.count} named lines`);
ok(O.nameOfGame(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']).name === 'Ruy Lopez', '1.e4 e5 2.Nf3 Nc6 3.Bb5 is the Ruy Lopez');
ok(O.nameOf('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2').name === 'Sicilian Defense', '1.e4 c5 is the Sicilian Defense (the en-passant square does not matter)');
ok(O.bookMoves(O.START)[0].uci === 'e2e4', 'the book knows the first moves');

console.log('engine services');
const E = require('../services/chess-engine');
const M = require('../services/chess-maia');
const info = E.parseInfo('info depth 12 seldepth 18 multipv 2 score mate -3 nodes 1234 nps 100000 time 12 pv e2e4 e7e5');
ok(info.depth === 12 && info.multipv === 2 && info.mate === -3 && info.pv.join() === 'e2e4,e7e5', 'UCI info lines are read');
ok(E.parseInfo('info depth 5 score cp 30 upperbound pv e2e4') === null, 'bound-only scores are ignored');
ok(E.toScore(0, 1) === E.MATE - 1 && E.toScore(0, -2) === -E.MATE + 4 && E.toScore(55, 0) === 55, 'mate scores use the bot\'s scale');
ok(!/[\\/]public[\\/]/.test(E.DIR) && !/[\\/]public[\\/]/.test(M.MODELS), 'the engines live outside public/ (Stockfish is never served to browsers)');
ok(M.choose({ e2e4: 0.6, d2d4: 0.38, a2a3: 0.02 }, { random: () => 0.999 }) === 'd2d4' && M.choose({ e2e4: 0.6, d2d4: 0.38, a2a3: 0.02 }, { sample: false }) === 'e2e4', 'Maia-2 moves are sampled from the likely ones (under 3% left out), or the top one');

async function live() {
  if (E.available('stockfish')) {
    const a = await E.analyse('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { depth: 8, multipv: 2 });
    ok(a.lines[0].uci === 'a1a8' && a.lines[0].mate === 1 && a.lines.length === 2, 'Stockfish finds the back-rank mate (MultiPV 2)');
    const r = await E.reviewPly('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a7', { depth: 8 });
    ok(r && r.class === 'mistake' && r.missedMate === 1 && r.best.san === 'Ra8#', 'a missed mate in one is reviewed as a mistake');
  } else console.log('  skip (Stockfish is not installed here)');
  if (E.available('leorik')) {
    const a = await E.analyse('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { depth: 6, engine: 'leorik' });
    ok(a.lines[0].uci === 'a1a8', 'Leorik finds the back-rank mate');
  } else console.log('  skip (Leorik is not installed here)');
  E.closeAll();
}

live().catch((e) => ok(false, `engine check threw: ${e.message}`)).then(() => {
  db.flush();
  try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  console.log(failures ? `\n${failures} failure(s)` : '\nall trainer checks pass');
  process.exit(failures ? 1 : 0);
});
