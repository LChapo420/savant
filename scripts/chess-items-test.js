// The chess track: the move generator against the standard perft counts, every
// chess bank skill producing well-formed items whose board answers are right, and
// the generated track agreeing with its sheet.
const fs = require('fs');
const path = require('path');
const C = require('../content/chess-board');
const bank = require('../content/bank');
const curriculum = require('../config/curriculum');
const { GENERATORS } = require('../content/chess-items');
const { parseCsv } = require('./build-sheet-track');

let failures = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};

console.log('move generator (perft)');
const PERFT = [
  ['start position', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902]],
  ['Kiwipete (castling, pins, en passant)', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
  ['rook endgame with en passant', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
  ['promotions and checks', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['promotion with discovered check', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486]],
];
for (const [name, fen, counts] of PERFT) {
  counts.forEach((n, i) => ok(C.perft(C.parseFen(fen), i + 1) === n, `${name}, depth ${i + 1} = ${n}`));
}

console.log('notation');
const start = C.parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
ok(C.legalMoves(start).map((m) => C.san(start, m)).includes('Nf3'), 'Ng1-f3 is written Nf3');
const backRank = C.parseFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
ok(C.legalMoves(backRank).filter((m) => C.isCheckmate(C.makeMove(backRank, m))).map((m) => C.san(backRank, m)).join() === 'Ra8#', 'the back-rank mate is Ra8#');
const twoRooks = C.parseFen('7k/8/8/8/8/8/8/R4RK1 w - - 0 1');
ok(C.legalMoves(twoRooks).some((m) => C.san(twoRooks, m) === 'Rae1'), 'two rooks on one rank are told apart by file (Rae1)');

console.log('bank items');
const SKILLS = Object.keys(GENERATORS);
for (const skill of SKILLS) {
  let good = true;
  let why = '';
  for (let i = 0; i < 30; i++) {
    const d = 1 + (i % 10);
    try {
      const it = bank.generate({ skillId: skill, difficulty: d, seed: `${skill}:${i}` });
      if (!it.prompt || !it.answer || !it.rationale) { good = false; why = 'empty field'; }
      if (it.format === 'multiple_choice' && !it.choices.includes(it.answer)) { good = false; why = 'answer not in choices'; }
    } catch (e) { good = false; why = e.message; }
  }
  ok(good, `${skill} makes 30 well-formed items${why ? ` (${why})` : ''}`);
}

// A mate the bank gives is mate: replay the answer on the position it describes.
function positionFrom(prompt) {
  const pos = { board: Array(64).fill(null), side: /Black to move/.test(prompt) ? 'b' : 'w', castling: '', ep: -1 };
  for (const [colour, list] of [['w', /White: (.*?)\. Black:/.exec(prompt)[1]], ['b', /Black: (.*?)\. (White|Black) to move/.exec(prompt)[1]]]) {
    for (const part of list.split(', ')) {
      if (part.startsWith('pawns ')) part.slice(6).split(' ').forEach((s) => { pos.board[C.sqIndex(s)] = colour === 'w' ? 'P' : 'p'; });
      else pos.board[C.sqIndex(part.slice(1))] = colour === 'w' ? part[0] : part[0].toLowerCase();
    }
  }
  return pos;
}
let mates = 0;
for (let i = 0; i < 25; i++) {
  const it = bank.generate({ skillId: 'chess_mate', difficulty: 1 + (i % 10), seed: `mate:${i}` });
  if (!/checkmate in one/.test(it.prompt)) continue;
  const pos = positionFrom(it.prompt);
  const m = C.legalMoves(pos).find((x) => C.san(pos, x) === it.answer);
  if (m && C.isCheckmate(C.makeMove(pos, m))) mates++;
}
ok(mates >= 20, `mate-in-one answers replay as mate (${mates} of 25)`);

console.log('track');
const track = curriculum.TRACKS.find((t) => t.id === 'chess');
ok(!!track, 'the chess track is registered');
ok(track && track.grades.length === 19, 'it has nineteen grades');
ok(bank.missingSkills().filter((s) => s.startsWith('chess_')).length === 0, 'every chess skill a grade uses has a generator');
const rows = parseCsv(fs.readFileSync(path.join(__dirname, '..', 'data', 'Chess_Grades_Levels.csv'), 'utf8'));
const csvLevels = rows.slice(2).reduce((n, r) => n + r.filter((_, i) => i % 5 === 0 && /^\d+$/.test(String(r[i]).trim())).length, 0);
const trackLevels = track ? track.grades.reduce((n, g) => n + g.levels.length, 0) : 0;
ok(csvLevels === trackLevels, `every sheet row is a level (${csvLevels} rows, ${trackLevels} levels)`);
ok(track && track.grades.every((g) => g.levels.slice(0, 9).every((l) => l.type === 'Tester')), 'every grade opens with nine testers');
ok(track && track.grades.every((g) => g.levels[g.levels.length - 1].type === 'Final'), 'every grade ends on its Final');
ok(track && track.grades.every((g) => g.levels.filter((l) => l.type === 'Lesson').every((l) => l.skill)), 'every lesson has a question skill');

console.log('board, bot and board checks');
const chessChecks = require('../services/chess-checks');
const grading = require('../services/grading');
const blockLevels = require('../services/block-levels');
const bot = require('../public/engine/chess/bot');
const MATE_FEN = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
const board = chessChecks.cleanBoardCheck({ fen: MATE_FEN, prompt: 'White to move: find checkmate in one.', answer: 'Ra8', accepts: ['a1a8', 'Rh8'], rationale: 'The pawns seal the back rank.' });
ok(board && board.answer === 'Ra8#', 'a board check is stored with its move in standard notation');
ok(board && !board.accepts.includes('Rh8'), 'an "also accept" that names another move is thrown out');
ok(!chessChecks.cleanBoardCheck({ fen: MATE_FEN, prompt: 'White to move: find checkmate in one.', answer: 'Ra7', rationale: 'The pawns seal the back rank.' }), 'a "mate in one" whose answer does not mate is dropped');
ok(!chessChecks.cleanBoardCheck({ fen: '8/8/8/8/8/8/8/8 w - - 0 1', prompt: 'Find the move.', answer: 'e4', rationale: 'Some reason here.' }), 'a position without kings is dropped');
// Written by GLM for chess grade 1 level 42: no capture exists, and the key is a quiet move.
ok(!chessChecks.cleanBoardCheck({ fen: '7k/8/7p/1p6/8/8/8/R6K w - - 0 1', prompt: 'White to move: capture a black pawn with the rook in one straight roll.', answer: 'Ra6', rationale: 'The rook rolls up the file.' }), 'a "capture" check whose key captures nothing is dropped');
ok(!!chessChecks.cleanBoardCheck({ fen: '7k/8/8/8/8/8/p7/R6K w - - 0 1', prompt: 'Capture the pawn with the rook.', answer: 'Rxa2', rationale: 'The rook rolls up the file.' }), 'a "capture" check whose key captures is kept');
ok(!chessChecks.cleanBoardCheck({ fen: '7k/8/8/8/8/8/8/R5K1 w - - 0 1', prompt: 'Give check with the rook.', answer: 'Rb1', rationale: 'The rook reaches the back rank.' }), 'a "give check" key that gives no check is dropped');
// Also GLM's: Rxg4 goes farther up the file than the key.
ok(!chessChecks.cleanBoardCheck({ fen: '4k3/8/8/8/6p1/8/8/4K1R1 w - - 0 1', prompt: 'White to move: roll the rook up its column as far as it legally can.', answer: 'Rg3', rationale: 'The pawn blocks the file.' }), 'an "as far as it can" key that stops short is dropped');
ok(!!chessChecks.cleanBoardCheck({ fen: '4k3/8/8/8/6p1/8/8/4K1R1 w - - 0 1', prompt: 'White to move: roll the rook up its column as far as it legally can.', answer: 'Rxg4', rationale: 'The pawn can be captured.' }), 'the farthest square on the line is kept');
const collect = { fen: '4k3/8/8/2p2p2/3R2p1/8/1p6/6K1 w - - 0 1', prompt: 'Roll your rook in straight lines to gobble up the black pawns.', strength: 2 };
ok(chessChecks.blockProblems('Chess_PlayOut', { ...collect, goal: 'win' }).some((p) => /use "capture"/.test(p)), 'a play-out that asks to capture but sets "win" (checkmate) is refused');
const asCapture = chessChecks.blockProblems('Chess_PlayOut', { ...collect, goal: 'capture' });
ok(!asCapture.some((p) => /use "capture"/.test(p)), 'the same play-out with the "capture" goal has no goal mismatch');
ok(asCapture.length === 1 && /b2 is two moves or less from promoting/.test(asCapture[0]), '(its pawn on b2, one move from queening, is a race and is reported)');
ok(chessChecks.blockProblems('Chess_PlayOut', { fen: '4k3/8/8/8/8/8/3p4/2B1K3 w - - 0 1', prompt: 'Win the game.', goal: 'win', strength: 1 }).length === 1, 'a "win" with a lone bishop, which cannot mate, is refused');
ok(board && grading.grade(board, 'uci:a1a8').correct && grading.grade(board, 'Ra8#').correct && !grading.grade(board, 'Ra7').correct, 'a move is graded the same from the board or typed');
const pawnTake = { format: 'type_in', fen: '7k/8/8/8/8/2p5/1PB5/K7 w - - 0 1', answer: 'bxc3' };
ok(!grading.grade(pawnTake, 'Bxc3').correct && grading.grade(pawnTake, 'bxc3').correct, '"Bxc3" (a bishop) is not taken for "bxc3" (a pawn)');
ok(bot.chooseMove(C.parseFen(MATE_FEN), { strength: 10 }).san === 'Ra8#', 'the practice bot finds mate in one');
ok(bot.chooseMove(C.parseFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1'), { strength: 3 }).san === 'Rxd5', 'even a weak bot takes a hanging queen');
ok(!blockLevels.catalogFor('lesson').some((b) => /^Chess_/.test(b.tag)), 'other subjects are not offered chess blocks');
ok(blockLevels.catalogFor('lesson', 'chess').filter((b) => /^Chess_/.test(b.tag)).length === 3, 'chess lessons are offered the board, the play-out and the guided lesson');
const served = blockLevels.publicPlan({ id: 1, checks: [{ id: 'c1', format: 'board', prompt: 'p', fen: MATE_FEN, answer: 'Ra8#', after: -1 }], blocks: [] }, 1, {});
ok(served.entries[0].block === 'Check_Board' && !('answer' in served.entries[0].data), 'a board check reaches the page as a board, without its answer');
ok(served.files.indexOf('/engine/chess/chess-core.js') < served.files.indexOf('/engine/chess/chess-blocks.js'), 'the chess rules load before the chess blocks');

console.log('claims in chess prose (each written by GLM for grade 1 level 42)');
// Run 3, a multiple-choice check: the knight on a3 is Black's, so the rook can take it.
const knightMc = {
  prompt: 'A white rook is on a1 and a black knight is on a3, with the rest of the a-file empty. Can the rook reach a8 in one move? Pick the best answer.',
  answer: 'No — the rook must stop on a2 because the knight blocks the file',
  choices: ['No — the rook must stop on a2 because the knight blocks the file', 'Yes — the rook jumps over the knight and lands on a8', 'No — a8 is on a diagonal, so the rook can never go there', 'Yes — the knight moves away out of the way automatically'],
  rationale: 'A rook cannot jump. The knight on a3 blocks the a-file, so the rook can go no farther than a2.',
};
ok(/enemy piece: the rook can capture it on a3/.test(chessChecks.proseCheckProblem(knightMc)), 'a check that says the rook "must stop on a2" before an enemy knight is refused');
ok(!chessChecks.proseCheckProblem({ ...knightMc, prompt: knightMc.prompt.replace('black knight', 'white knight') }), 'the same claim with the rook\'s own knight on a3 is true, and kept');
ok(!chessChecks.proseCheckProblem({ ...knightMc, answer: 'No — the rook can stop on a2 or capture the knight on a3, but not pass it' }), 'an answer that says the rook can capture the knight is kept');
const cleaned = blockLevels.cleanCheck({ ...knightMc, accepts: [], hint: '' }, { format: 'multiple_choice', skill_id: 'chess_moves' }, 2);
ok(cleaned === null, 'the pipeline drops that multiple-choice check');
ok(/^chess: .*enemy piece/.test(blockLevels.whyRefused(knightMc, { format: 'multiple_choice', skill_id: 'chess_moves' })), 'and tells the repair call why');
// Run 3, the same error in a Trap_CommonError block.
const trap = {
  question: 'A white rook sits on a1 and a black knight sits on a3. Everything else on the a-file is empty. Can the rook reach a8 in one move?',
  choices: ['Yes — it just rolls straight up the a-file all the way to a8', 'No — the rook would have to jump over the knight', 'No — a8 is too far away for a rook', 'Yes — the rook can hop over the knight like the knight hops over pieces'],
  correctIndex: 1,
  correctReasoning: 'The rook has no jumping power. It slides along a clear path only, so a knight on a3 is a wall: the rook can reach a2 but nothing beyond it on that road.',
};
ok(chessChecks.blockProblems('Trap_CommonError', trap).some((p) => /can capture it on a3/.test(p)), 'a block that says the rook "can reach a2 but nothing beyond" an enemy knight is sent to repair');
// Run 4: a Chess_Position note that miscounts, and a caution card that calls a diagonal an L.
const slide = { caption: 'One move, square by square', fen: '8/8/8/6k1/8/8/8/R3K3 w - - 0 1', line: ['Ra7'], note: 'The rook rolls from a1 up the a-file to a7: a2, a3, a4, a5, a6, a7 — seven squares in one move, visiting each one like a ball rolling down a hallway.' };
ok(chessChecks.blockProblems('Chess_Position', slide).some((p) => /lists 6 squares/.test(p)), 'a note that lists six squares and calls them seven is sent to repair');
ok(chessChecks.blockProblems('Chess_Position', { ...slide, note: slide.note.replace('seven squares', 'six squares') }).length === 0, 'the same note counting six is kept');
const caution = { cautions: [
  { detail: 'A rook cannot slide along a slanted line.', kind: 'illegal_transfer', rightExample: 'd4 to d8 (up the file)', title: 'No diagonal slides', wrongExample: 'd4 to f6 (a diagonal)' },
  { detail: 'Only the knight jumps in an L-shape. A rook that starts on e4 can reach e6 or g4, but never g6 in one move.', kind: 'non_example', rightExample: 'e4 to e6 (a straight rook move)', title: 'It is not a knight', wrongExample: 'e4 to g6 (a knight\'s L-shape)' },
] };
const flagged = chessChecks.blockProblems('Concept_CautionFlag', caution);
ok(flagged.length === 1 && /"e4 to g6" is called a knight's L-shape, but it is a diagonal/.test(flagged[0]), 'a caution card that calls e4 to g6 an L-shape is sent to repair, and its true labels are not');
ok(chessChecks.textProblems({ text: 'The knight hops from g1 to f3 (a knight\'s L-shape) and the bishop from c1 to g5 (a diagonal).' }).length === 0, 'true move labels pass');
ok(chessChecks.textProblems({ text: 'Go from A1 to A7 in the spreadsheet: that is a straight column.' }).length === 0, 'text with no chess piece in it is never read');
// Run 4, a board check: the only capture hangs the rook to the king, and "down" is up.
const hangs = { fen: '4k3/4p3/8/8/4R3/8/8/7K w - - 0 1', prompt: 'White to move: capture the black pawn with the rook.', answer: 'Rxe7+', rationale: 'The pawn on e7 sits on the rook\'s own file, so the rook slides straight down from e4 and captures it in one move.', hint: 'Look up and down the rook\'s file for a target it can reach in a straight line.' };
ok(!chessChecks.cleanBoardCheck(hangs) && /black king on e8 can take it for free/.test(chessChecks.boardCheckProblem(hangs)), 'a board check whose key gives the rook away (Rxe7+ Kxe7) is refused, with the reason');
const C2 = C.parseFen(hangs.fen);
ok(/goes down, but e4 to e7 goes up/.test(chessChecks.directionProblem([hangs.rationale], C2, C.moveFromText(C2, 'Rxe7'))), '"slides straight down from e4" to e7 is caught as the wrong direction');
const safe = { ...hangs, fen: '7k/8/8/3p4/3R4/8/8/K7 w - - 0 1', answer: 'Rxd5', rationale: 'The rook on d4 slides straight up the d-file to capture the pawn on d5.' };
ok(!!chessChecks.cleanBoardCheck(safe), 'the repaired check from the same run (Rxd5, up the file, nothing guards d5) is kept');
ok(!!chessChecks.cleanBoardCheck({ fen: '5r1k/6pp/7N/3Q4/8/8/8/6K1 w - - 0 1', prompt: 'White to move: mate in two.', answer: 'Qg8+', rationale: 'The queen sacrifice forces the rook to g8 and Nf7 is smothered mate.' }), 'a sacrifice in a mate puzzle is not called a hung piece');
ok(/board: the answer Rxe7\+ puts the rook/.test(blockLevels.whyRefused(hangs, { format: 'board', skill_id: 'chess_moves' })), 'the repair call is told the exact reason a board check was refused');
// Run 4's play-out: two of the pawns to "gobble" were two moves from queening.
const race = { fen: '7k/8/8/3p4/8/1p3p2/8/4K1R1 w - - 0 1', goal: 'capture', maxMoves: 12, orientation: 'white', prompt: 'Use rook slides to gobble all three black pawns before 12 moves run out.', strength: 1 };
ok(chessChecks.blockProblems('Chess_PlayOut', race).some((p) => /b3, f3 are two moves or less from promoting/.test(p)), 'a capture play-out where bot pawns are about to queen is sent to repair');
ok(chessChecks.blockProblems('Chess_PlayOut', { ...race, fen: '7k/8/1p3p2/3p4/8/8/8/4K1R1 w - - 0 1' }).length === 0, 'the same task with the pawns farther back passes');
// Run 5: "as far DOWN as it can go" keyed Rh5 on an open file (Rh1 is farthest), and called it check.
const farDown = { fen: 'k7/7R/8/8/8/6P1/8/K7 w - - 0 1', prompt: 'White to move: slide the rook on h7 as far down as it can go in one move.', answer: 'Rh5', accepts: ['Rh5', 'h7h5', 'Rh5+'], rationale: 'The rook slides down the h-file, but it stops on h5 because its own pawn on g3 does not block it; actually the file is open to h5, where the move Rh5+ also gives check to the black king.', hint: 'The rook rolls down the h-file as far as it can go before something stops it.' };
ok(/can go farther along that line/.test(chessChecks.boardCheckProblem(farDown)), '"as far down as it can go" is held to the farthest square, like "as far as"');
ok(/writes Rh5\+, but Rh5 gives no check/.test(chessChecks.boardCheckProblem({ ...farDown, prompt: 'White to move: slide the rook on h7 down to h5.' })), 'a move written with "+" that gives no check is refused');
ok(!chessChecks.boardCheckProblem({ ...farDown, answer: 'Rh1', accepts: [], rationale: 'The h-file below the rook is empty, so it rolls all the way down to h1.' }), 'the right key, Rh1, with a true rationale is kept');
// Run 5's Trap_CommonError: b7 is up-LEFT of e4, and c5 is not on a diagonal from e4.
const trap5 = { choices: ['Ra4 (slide along the row to a4)', 'Rb7 (slide up-right to b7)', 'Rc5 (slide up-left to c5)', 'Rh7 (slide up-right to h7)'], context: 'A white rook stands on e4. The squares a4, b7, c5 and h7 are all empty.', correctIndex: 0, question: 'The rook stands on e4. Which of these is a LEGAL rook move?', trapReasons: { 1: 'b7 looks close and easy to reach, but the path e4-b7 slants like a bishop\'s move.', 2: 'c5 is only one step away, but it sits on a diagonal, so the rook cannot roll there.', 3: 'h7 seems to be straight up and across, but the path bends: that is a diagonal.' } };
const t5 = chessChecks.blockProblems('Trap_CommonError', trap5);
ok(t5.some((p) => /up-right to b7": from e4, b7 is up and left/.test(p)) && t5.some((p) => /c5 is on a diagonal from the rook on e4, but it is not/.test(p)) && t5.length === 2, 'a trap that calls b7 "up-right" of e4 and c5 "on a diagonal" is sent to repair, and its true labels are not flagged');
// Run 5's multiple-choice block, all true: nothing flagged.
ok(chessChecks.blockProblems('Interact_MultipleChoice', { prompt: 'A white rook stands on d4. Which square can it reach in ONE move?', feedback: { byOption: { a: 'c5 is one square diagonally from d4.', b: 'e5 is also a diagonal step.', c: 'f6 is a long diagonal hop.', d: 'd8 is straight up the d-column.' } } }).length === 0, 'true diagonal claims from the placed rook pass');
// Run 6: a board check whose text names a pawn on f6 that is not on the board.
const ghost = { fen: '7k/8/2p5/8/8/2R5/8/K7 w - - 0 1', prompt: 'White to move: capture a black pawn in one move. One pawn sits on the rook\'s column; the other sits on a diagonal the rook cannot use.', answer: 'Rxc6', rationale: 'The pawn on c6 stands on the rook\'s column, so the rook rolls straight up and captures it. The pawn on f6 is on a diagonal, which the rook cannot travel.', hint: 'One pawn shares the rook\'s column; the other sits on a slanted diagonal.' };
ok(/names a pawn on f6, but the position has nothing there/.test(chessChecks.boardCheckProblem(ghost)), 'a check that talks about a pawn on f6 when there is none is refused');
ok(!chessChecks.boardCheckProblem({ ...ghost, fen: '7k/8/2p2p2/8/8/2R5/8/K7 w - - 0 1' }), 'with the pawn really on f6 it is kept');
// Run 6's Chess_Guided (the model's first guided lesson): "five squares" for d1 to d5.
const run6Guided = { fen: '7k/8/8/7p/8/8/8/K6R w - - 0 1', title: 'Roll and gobble', orientation: 'white', steps: [
  { instruction: 'Slide the rook sideways to d1, a square near the middle of the bottom row.', moves: ['Rd1'], reply: 'Kg8', explain: 'The rook slid sideways along the first row.' },
  { instruction: 'Roll the rook straight up its column to d5, the middle of the board.', moves: ['Rd5'], reply: 'Kf7', explain: 'Now the rook rolled straight up its column, five squares in one move. Rows and columns are the rook\'s two roads.' },
  { instruction: 'Roll the rook sideways along the fifth row all the way to the pawn on h5 and grab it.', moves: ['Rxh5'], explain: 'The fifth row runs straight from d5 to h5, so the rook rolled right along it and captured the pawn.' },
] };
const g6 = chessChecks.blockProblems('Chess_Guided', run6Guided);
ok(g6.length === 2 && g6.some((p) => /steps\[1\]: the text says the move goes five squares, but d1 to d5 is 4/.test(p)) && g6.some((p) => /Rxh5\+ was already possible at steps\[0\]/.test(p)), 'its "five squares" for d1-d5, and its detour (Rxh5 was legal from the start), are both sent to repair');
ok(chessChecks.blockProblems('Chess_Guided', { ...run6Guided, fen: '7k/8/8/7p/8/8/7P/K6R w - - 0 1', steps: [run6Guided.steps[0], { ...run6Guided.steps[1], explain: 'Now the rook rolled straight up its column, four squares in one move.' }, run6Guided.steps[2]] }).length === 0, 'the same lesson counting four, with its own pawn on h2 blocking the short way, passes');
ok(chessChecks.blockProblems('Chess_Position', { fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1', caption: 'x', note: 'The rook on d4 can roll any distance; the black king on h8 is far away.', line: ['Rd1'] }).length === 0, 'a note that names pieces where they stand passes');
ok(chessChecks.blockProblems('Chess_Position', { fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1', caption: 'x', note: 'The rook on d5 can roll any distance.' }).some((p) => /rook on d5, but the position has nothing there/.test(p)), 'a note that puts the rook on the wrong square is sent to repair');
// Run 7's Chess_Guided walks the rook around the pawn (Ra5 Rc5 Rc6 Rd6 Rxd5) when Rxd5 was legal from a5.
const run7Guided = { fen: '7k/8/8/3p4/8/8/8/R5K1 w - - 0 1', title: 'Roll around the pawn and gobble it', steps: [
  { instruction: 'Roll the rook straight up its column, four squares, landing on the fifth row.', moves: ['Ra5'], reply: 'Kg8', explain: 'That was one move, one straight line.' },
  { instruction: 'Now roll sideways along the fifth row, two squares, stopping just before the pawn.', moves: ['Rc5'], reply: 'Kg7', explain: 'Sliding along the fifth rank is still one straight line.' },
  { instruction: 'Roll straight up one square, onto the sixth row.', moves: ['Rc6'], reply: 'Kh7', explain: 'A new move, a new direction.' },
  { instruction: 'Roll sideways one square, so your rook stands directly above the pawn.', moves: ['Rd6'], reply: 'Kg8', explain: 'From c6 you slid along the sixth rank to d6.' },
  { instruction: 'Roll straight down and capture the pawn.', moves: ['Rxd5'], explain: 'The path down the d-file was clear.' },
] };
ok(chessChecks.blockProblems('Chess_Guided', run7Guided).some((p) => /steps\[4\]: Rxd5 was already possible at steps\[1\]/.test(p)), 'a guided lesson that walks around a capture it could make at once is sent to repair');
ok(chessChecks.blockProblems('Chess_Guided', { title: 'x', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', steps: [{ instruction: 'Fork the king and the rook.', moves: ['Nc7+'], reply: 'Kd7', explain: 'A fork.' }, { instruction: 'Take the rook.', moves: ['Nxa8'], explain: 'Won.' }] }).length === 0, 'a lesson that captures as soon as it can (a fork, then the rook) passes');
// Run 7's play-out FEN "3RK2" covers seven squares on rank 1.
ok(/rank 1 of the FEN \("3RK2"\) covers 7 squares/.test(chessChecks.blockProblems('Chess_PlayOut', { fen: '8/2p4k/5p2/p7/8/8/8/3RK2 w - - 0 1', goal: 'capture', prompt: 'Gobble the pawns.', strength: 2 })[0] || ''), 'a FEN rank that does not add up to eight squares is refused');
// Run 8 (the final lesson): a Chess_Position whose rook stands on e4 while its note, arrow and Rxd7 assume d4.
const offBoard = { arrows: ['d4-d7'], caption: 'The rook stops at the first piece', fen: '7k/3p4/8/8/1P2R2P/8/3P4/K7 w - - 0 1', highlights: ['d7'], note: 'Look at the four lanes from d4. Your own pawns on b4, g4 and d2 block three lanes dead. Only the lane going up is open, and the first piece there is the black pawn on d7: the rook can stop before it or capture it with Rxd7.' };
const p8 = chessChecks.blockProblems('Chess_Position', offBoard);
ok(p8.some((p) => /your own pawns on b4, g4 and d2, but g4 has nothing/.test(p)) && p8.some((p) => /plays Rxd7, which is not a legal move on this board \(the rook is on e4\)/.test(p)) && p8.some((p) => /"d4-d7" starts on d4, where there is no piece/.test(p)), 'a position whose note, arrow and move name a rook on d4 when it stands on e4 is sent to repair, with all three reasons');
ok(chessChecks.blockProblems('Chess_Position', { ...offBoard, fen: '7k/3p4/8/8/1P1R2P1/8/3P4/K7 w - - 0 1' }).length === 0, 'the same block with the rook on d4 and the pawn on g4 passes');
// Run 4 also wrote a line move as "Rd4-d1" (long algebraic), which is now read.
ok(C.san(C.parseFen('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1'), C.moveFromText(C.parseFen('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1'), 'Rd4-d1')) === 'Rd1', 'a line move written "Rd4-d1" is read as Rd1');
ok(!C.moveFromText(C.parseFen('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1'), 'Nd4-d1'), 'long algebraic naming the wrong piece is not');

console.log('Chess_Guided');
const schemaCheck = require('../services/block-schema');
const guidedSchema = blockLevels.library().Chess_Guided.schema;
const fork = { title: 'Fork, then collect', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', steps: [
  { instruction: 'Find a knight move that checks the king and attacks the rook at the same time.', moves: ['Nc7+'], reply: 'Kd7', explain: 'A fork: the king must move, so the rook cannot be saved.', hint: 'Knights attack in an L.' },
  { instruction: 'Collect the rook.', moves: ['Nxa8'], explain: 'You won a whole rook.' },
] };
const guidedAll = (d) => schemaCheck.validate(guidedSchema, d).concat(chessChecks.blockProblems('Chess_Guided', d));
ok(guidedAll(fork).length === 0, 'a guided lesson whose moves and replies play through passes its schema and the board check');
ok(guidedAll({ ...fork, steps: [{ ...fork.steps[0], reply: undefined }, fork.steps[1]] }).some((p) => /Black is to move here/.test(p)), 'a step with no reply before another step is refused (the learner would play the other side)');
ok(guidedAll({ ...fork, steps: [{ ...fork.steps[0], moves: ['Nc7+', 'Nd6+'] }, fork.steps[1]] }).some((p) => /lead to different positions/.test(p)), 'two accepted moves that lead to different positions, with a step after, are refused');
ok(guidedAll({ ...fork, steps: [{ ...fork.steps[0], reply: 'Kxc7' }, fork.steps[1]] }).some((p) => /"Kxc7" is not legal/.test(p)), 'an illegal reply is refused');
ok(guidedAll({ ...fork, steps: [fork.steps[0], { ...fork.steps[1], moves: ['Nxa7'] }] }).some((p) => /"Nxa7" is not a legal move here/.test(p)), 'a move that is illegal in the position reached is refused');
ok(guidedAll({ ...fork, fen: 'r3k3/8/8/1N6/8/8/8/4K2k w - - 0 1' }).some((p) => /one king/.test(p)), 'an illegal starting position is refused');
ok(guidedAll({ title: 'Ladder', fen: '4k3/8/8/8/8/8/8/R3K2R w - - 0 1', steps: [{ instruction: 'Fence the king in.', moves: ['Ra7'], reply: 'Kf8', explain: 'The seventh rank is guarded.' }, { instruction: 'Mate.', moves: ['Rh8#'], reply: 'Kg7', explain: 'Mate.' }] }).some((p) => /game is over after this move/.test(p)), 'a reply after a mate is refused');
ok(guidedAll({ ...fork, steps: [{ ...fork.steps[0], instruction: 'Capture something with the knight.' }, fork.steps[1]] }).some((p) => /asks for a capture/.test(p)), 'a step whose move does not do what its instruction asks is refused');
ok(guidedAll({ ...fork, steps: [{ ...fork.steps[0], explain: 'The knight jumps from b5 to c7 (a diagonal).' }, fork.steps[1]] }).some((p) => /called a diagonal/.test(p)), 'its prose is checked like every chess block');
const Teach = require('../public/engine/chess/teach');
const reason = (fen, move, want) => { const p = C.parseFen(fen); return Teach.wrongMoveReason(p, C.moveFromText(p, move), want.map((w) => C.moveFromText(p, w))); };
ok(/black rook on a8 could take your knight on a7/.test(reason(fork.fen, 'Na7', ['Nc7+'])), 'a wrong move into an attacked square says which piece attacks it');
ok(/attacks two things at once/.test(reason(fork.fen, 'Nd6+', ['Nc7+'])), 'a check that misses the fork points to the double attack');
ok(/checkmate here/.test(reason('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'Rd7', ['Rd8#'])), 'missing a mate says there is one');
ok(/good move too/.test(reason('4k3/8/8/8/8/8/8/R3K2R w - - 0 1', 'Rh7', ['Ra7'])), 'an equally good move is called good, kindly');
ok(/Black could checkmate with Rb1#/.test(reason('1r4k1/R4ppp/8/8/8/8/5PPP/6K1 w - - 0 1', 'Ra6', ['h3'])), 'a move that allows mate names the mate');

console.log('game review');
const hang = Teach.reviewPly('4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1', 'd2d7');
ok(hang && hang.class === 'blunder' && hang.best.san !== 'Qd7+', `giving the queen away (Qd7+ Kxd7) is a blunder, and a better move is named (${hang && hang.best.san})`);
const mateFound = Teach.reviewPly('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8');
ok(mateFound && mateFound.class === 'best' && mateFound.played.mate === 1, 'the mate in one is the best move');
const mateMissed = Teach.reviewPly('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d7');
ok(mateMissed && mateMissed.class === 'mistake' && mateMissed.missedMate === 1 && mateMissed.best.san === 'Rd8#', 'passing over a mate in one is a mistake, however far ahead the rest leaves you');
const quiet = Teach.reviewPly('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'f1c4');
ok(quiet && (quiet.class === 'best' || quiet.class === 'good'), 'a normal developing move is best or good');
ok(Teach.classify(300, 300, false) === 'best' && Teach.classify(300, 0, false) === 'mistake' && Teach.classify(300, -600, false) === 'blunder', 'classes follow the expected score given away');
ok(Math.abs(Teach.winChance(0) - 50) < 1e-9 && Teach.winChance(400) > 90, 'the expected score is 50 at level, about 91 at four pawns up');

console.log('tactics pool (served instead of the 0.5 s live search)');
{
  const items = require('../content/chess-items');
  const sizes = items.poolSize();
  ok(sizes && Object.keys(sizes).length === 10 && Object.values(sizes).every((n) => n >= 150), `a pool at every difficulty, 150 or more each (${sizes ? Object.values(sizes).join('/') : 'none'})`);
  // Every pooled item is sound on its own position: the key is legal and does what the prompt says.
  const POOLED = require('../content/chess-tactics-pool');
  let sound = 0; let total = 0;
  for (const list of Object.values(POOLED)) {
    for (const it of list) {
      total++;
      const pos = C.parseFen(it.fen);
      const m = C.moveFromText(pos, it.answer);
      if (m && (/knight fork/.test(it.prompt) ? m.piece === 'N' : !!m.captured) && it.prompt.startsWith(C.describe(pos))) sound++;
    }
  }
  ok(sound === total, `every pooled item's key is legal and of the asked kind, on the position its prompt describes (${sound}/${total})`);
  const before = { ...items.POOL_STATS };
  const t0 = Date.now();
  const draw = bank.generateMany(Array.from({ length: 40 }, () => ({ skillId: 'chess_tactics', difficulty: 7 })));
  const ms = (Date.now() - t0) / 40;
  ok(new Set(draw.map((it) => bank.itemKey(it))).size === 40, 'a 40-question sitting at one difficulty has no repeat');
  ok(items.POOL_STATS.served - before.served === 40 && items.POOL_STATS.fallback === before.fallback, 'all 40 came from the pool');
  ok(ms < 25, `serving takes ${ms.toFixed(1)} ms an item (live: about 500)`);
  // A learner who has met every pooled item at a difficulty gets a live one, and it is logged.
  const allKeys = new Set(POOLED[3].map((it) => `${it.prompt.trim()}||${String(it.answer).trim()}`));
  const warn = console.warn; let logged = 0; console.warn = () => { logged++; };
  const live = bank.generate({ skillId: 'chess_tactics', difficulty: 3, seed: 'pool-fallback', seenShapes: allKeys });
  console.warn = warn;
  ok(live && !allKeys.has(bank.itemKey(live)) && logged === 1 && items.POOL_STATS.fallback === before.fallback + 1, 'when the pool is spent for a learner, one is built live and the fallback is logged');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall chess checks pass');
process.exit(failures ? 1 : 0);
