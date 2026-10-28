/* The testbed page's sample data and stand-in grader (see demo.html). */
// Stand-in for the page shell's PolymathChecks. On a real level this posts to the server.
var KEYS = { demo1: { fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', answer: 'Ra8#', rationale: 'The rook checks along the eighth rank and the king is boxed in by its own pawns: a back-rank mate.' } };
window.PolymathChecks = {
  answered: {},
  submit: function (id, answer) {
    var k = KEYS[id];
    var pos = PolymathChess.parseFen(k.fen);
    var a = PolymathChess.moveFromText(pos, answer);
    var b = PolymathChess.moveFromText(pos, k.answer);
    var correct = !!(a && b && PolymathChess.uci(a) === PolymathChess.uci(b));
    return Promise.resolve({ correct: correct, answer: k.answer, rationale: k.rationale });
  },
};
var B = window.LessonBlocks;
B.get('Check_Board').render(document.getElementById('check'), { id: 'demo1', prompt: 'White to move: find checkmate in one.', fen: KEYS.demo1.fen });
B.get('Chess_Position').render(document.getElementById('position'), {
  caption: 'The Italian Game', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], note: 'The bishop on c4 aims at f7, the weakest square near Black\'s king.',
});
B.get('Chess_PlayOut').render(document.getElementById('playout'), {
  prompt: 'King and queen against king.', fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1', goal: 'mate', strength: 6, maxMoves: 30,
});

// A bank question set on a position, through the session player (no coach, no server).
if (window.Player) {
  window.Player.render(document.getElementById('player'), {
    format: 'type_in', skill_name: 'Checkmate patterns', difficulty: 3,
    prompt: 'White: Kg1, Ra1. Black: Kg8, pawns f7 g7 h7. White to move. Find checkmate in one move (algebraic notation).',
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
  }, { coach: false, onSubmit: function (v) { document.getElementById('player').setAttribute('data-submitted', v); } });
}

// Chess_Guided: three short lessons, each checked by services/chess-checks.js (scripts/chess-items-test.js).
var GUIDED = [
  { title: 'The ladder mate', fen: '4k3/8/8/8/8/8/8/R3K2R w - - 0 1', intro: 'Two rooks can push a king to the edge and mate it there.', steps: [
    { instruction: 'Fence the black king in: put one rook on the rank in front of it.', moves: ['Ra7'], reply: 'Kf8', explain: 'The rook on a7 guards the whole seventh rank, so the king cannot step forward.', hint: 'The king is on the back rank. Which rank is in front of it?' },
    { instruction: 'Now check the king along the back rank with your other rook.', moves: ['Rh8#'], explain: 'Checkmate. One rook holds the seventh rank and the other checks on the eighth: that is the ladder mate.' },
  ], outro: 'Well done.' },
  { title: 'Fork, then collect', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', steps: [
    { instruction: 'Find a knight move that checks the king and attacks the rook at the same time.', moves: ['Nc7+'], reply: 'Kd7', explain: 'A fork: the king has to get out of check, so the rook on a8 cannot be saved.', hint: 'A knight attacks in an L. Look for one square that hits both e8 and a8.' },
    { instruction: 'Collect the rook.', moves: ['Nxa8'], explain: 'You won a whole rook. A fork works because your opponent can answer only one threat.' },
  ] },
  { title: 'King and queen: the last two moves', fen: 'k7/8/2K5/8/8/8/8/7Q w - - 0 1', steps: [
    { instruction: 'Bring your king one step closer, so it guards the squares in front of the black king.', moves: ['Kb6'], reply: 'Kb8', explain: 'Your king now covers a7, b7 and c7. The black king can only shuffle along the back rank.' },
    { instruction: 'Checkmate in one move.', moves: ['Qh8#'], explain: 'Checkmate. The queen checks along the back rank and your king guards every square in front.' },
  ] },
];
GUIDED.forEach(function (g, i) { B.get('Chess_Guided').render(document.getElementById('guided' + (i + 1)), g); });
