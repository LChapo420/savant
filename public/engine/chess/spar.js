/* The sparring page (spar.html): the learner plays a whole game; each reply comes
 * from /api/chess/bot/move (opening book, then Maia-2 at the chosen rating), or
 * from the practice bot on this page when the server cannot answer. */
(function () {
  var C = window.PolymathChess;
  var $ = function (id) { return document.getElementById(id); };
  var START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var me = 'w';
  var moves = [];
  var thinking = false;

  function say(text) { $('say').textContent = text; }

  var board = null;
  function newBoard(side) {
    if (board) board.destroy();
    board = window.PolymathBoard.create($('board'), { fen: START, movable: side, orientation: side === 'b' ? 'black' : 'white', onMove: onMove });
  }
  newBoard('w');

  function post(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (res) { if (!res.ok) throw new Error('server'); return res.json(); });
  }

  function over(pos) {
    var st = C.status(pos);
    if (st === 'playing') return false;
    board.setInteractive(false);
    if (st === 'checkmate') say(pos.side === me ? 'Checkmated. Start a new game and try again.' : 'Checkmate! You won.');
    else say(st === 'stalemate' ? 'Stalemate: a draw.' : 'Draw: not enough pieces left to mate.');
    return true;
  }

  function opening() {
    if (moves.length > 30) return;
    fetch('/api/chess/opening?moves=' + encodeURIComponent(moves.join(' ')), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (out) { if (out && out.opening) $('opening').textContent = out.opening.eco + ' ' + out.opening.name; })
      .catch(function () {});
  }

  function reply() {
    var pos = board.position();
    if (over(pos)) return;
    thinking = true;
    board.setInteractive(false);
    say('Thinking...');
    var elo = Number($('elo').value);
    var local = function () {
      var B = window.PolymathChessBot;
      var b = B.chooseMove(pos, { strength: B.strengthForRating ? B.strengthForRating(elo) : Math.max(1, Math.min(10, Math.round((elo - 300) / 100))) });
      return { uci: C.uci(b.move), san: b.san, source: 'bot' };
    };
    post('/api/chess/bot/move', { fen: C.toFen(pos), elo: elo }).catch(local).then(function (out) {
      out = out && out.uci ? out : local();
      board.play(out.uci);
      moves.push(out.uci);
      thinking = false;
      opening();
      var now = board.position();
      if (over(now)) return;
      board.setInteractive(true);
      say('Opponent played ' + out.san + (out.source === 'book' ? ' (book move).' : '.') + ' Your move.');
    });
  }

  function onMove(m) {
    if (thinking) return;
    moves.push(C.uci(m));
    opening();
    setTimeout(reply, 50);
  }

  $('start').addEventListener('click', function () {
    me = $('side').value;
    moves = [];
    $('opening').textContent = '';
    newBoard(me);
    if (me === 'b') reply();
    else { board.setInteractive(true); say('Your move.'); }
  });
  // Wake the server's human-like model now, so the first reply is quick.
  fetch('/api/chess/engine?warm=1', { credentials: 'same-origin' }).catch(function () {});
  say('Choose a rating and press New game.');
  board.setInteractive(false);
})();
