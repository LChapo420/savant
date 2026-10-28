/* The puzzle trainer page (puzzles.html). Moves go to /api/chess one at a time;
 * the server answers right or wrong, plays the reply, and keeps the rating. */
(function () {
  var C = window.PolymathChess;
  var $ = function (id) { return document.getElementById(id); };
  var mode = 'rated';
  var puzzle = null;   // what the server showed: { attempt_id, fen, side, moves, kind }
  var lastFailed = null;
  var rush = null;     // { id, ends_at, score, strikes, status }
  var tick = null;
  var busy = false;

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) throw new Error('signin');
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        return data;
      });
    });
  }

  var board = window.PolymathBoard.create($('board'), { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', interactive: false, onMove: onMove });

  function say(text, kind) {
    var el = $('say');
    el.textContent = text;
    el.className = 'say' + (kind ? ' ' + kind : '');
  }

  function stats(me) {
    if (!me) return;
    $('rating').textContent = me.rating + (me.provisional ? '?' : '');
    $('rating-note').textContent = me.provisional ? 'Puzzle rating (still settling)' : 'Puzzle rating';
    $('solved').textContent = me.solved + ' / ' + (me.solved + me.failed);
    $('best').textContent = me.rush_best;
  }

  function signIn() {
    say('', '');
    $('play').innerHTML = '<p class="say">Sign in to train with puzzles: <a href="/login">sign in</a>.</p>';
  }

  function show(p) {
    puzzle = p;
    board.setPosition(p.fen);
    board.setArrows([]);
    board.setInteractive(true);
    var who = p.side === 'white' ? 'White' : 'Black';
    say(who + ' to move: ' + (p.kind === 'mate' ? 'find the checkmate' + (p.moves > 1 ? ' in ' + p.moves : '') + '.' : 'find the best move.'), '');
    $('next').hidden = true;
    $('retry').hidden = true;
    $('giveup').hidden = mode !== 'rated';
    busy = false;
  }

  function flipFor(p) {
    // The side to move plays from the bottom.
    var want = p.side === 'black' ? 'black' : 'white';
    if (board._orientation !== want) { board.flip(); board._orientation = want; }
  }
  board._orientation = 'white';

  function onMove(m, san, after, before) {
    if (!puzzle || busy) return;
    busy = true;
    board.setInteractive(false);
    var id = puzzle.attempt_id;
    api('POST', '/api/chess/puzzles/' + id + '/move', { move: C.uci(m) }).then(function (out) {
      if (out.timeUp) { endRush(out.rush); return; }
      if (out.correct && !out.done) {
        say('Right. Keep going.', 'right');
        setTimeout(function () { board.play(out.reply.uci); board.setInteractive(true); busy = false; }, 450);
        return;
      }
      if (out.correct) {
        var change = out.change ? ' Rating ' + (out.change.change >= 0 ? '+' : '') + out.change.change + '.' : '';
        say('Solved!' + change + ' Puzzle rating ' + out.puzzle_rating + '.', 'right');
        stats(out.me);
        if (out.rush) return rushNext(out.rush, 400);
        $('next').textContent = 'Next puzzle';
        $('next').hidden = false;
        $('giveup').hidden = true;
        $('next').focus();
        return;
      }
      stats(out.me);
      lastFailed = id;
      var change2 = out.change ? ' Rating ' + out.change.change + '.' : '';
      say('Not this time: ' + out.played + ' was not it.' + change2 + ' The solution: ' + out.solution.map(function (s) { return s.san; }).join(' '), 'wrong');
      replay(before, out.solution, function () {
        if (out.rush) return rushNext(out.rush, 900);
        $('next').textContent = 'Next puzzle';
        $('next').hidden = false;
        $('retry').hidden = mode !== 'rated';
        $('giveup').hidden = true;
      });
    }).catch(function (err) {
      if (err.message === 'signin') return signIn();
      say(err.message, 'wrong');
      board.setPosition(C.toFen(before));
      board.setInteractive(true);
      busy = false;
    });
  }

  /** Show the right line from the position before the miss, a move at a time. */
  function replay(before, solution, done) {
    var fen = C.toFen(before);
    setTimeout(function () {
      board.setPosition(fen);
      var i = 0;
      var step = function () {
        if (i >= solution.length) { done(); return; }
        var s = solution[i++];
        board.setArrows(i === 1 ? [[s.uci.slice(0, 2), s.uci.slice(2, 4)]] : []);
        board.play(s.uci);
        setTimeout(step, 700);
      };
      setTimeout(step, 500);
    }, 600);
  }

  function nextRated(retry) {
    api('POST', '/api/chess/puzzles/next', retry ? { retry: retry } : {}).then(function (out) {
      stats(out.me);
      flipFor(out.puzzle);
      show(out.puzzle);
    }).catch(function (err) { if (err.message === 'signin') signIn(); else say(err.message, 'wrong'); });
  }

  // ── rush ──────────────────────────────────────────────────────────────────
  function paintRush() {
    $('score').textContent = rush.score;
    Array.prototype.forEach.call($('strikes').children, function (s, i) { s.className = i < rush.strikes ? 'hit' : ''; });
  }

  function clock() {
    var left = Math.max(0, Date.parse(rush.ends_at) - Date.now());
    var s = Math.ceil(left / 1000);
    $('clock').textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    $('clock').className = 'clock' + (s <= 20 ? ' low' : '');
    if (left <= 0) {
      clearInterval(tick);
      tick = null;
      board.setInteractive(false);
      api('GET', '/api/chess/rush/' + rush.id).then(function (out) { if (out.rush.status !== 'open') endRush(out.rush); });
    }
  }

  function startRush() {
    api('POST', '/api/chess/rush/start').then(function (out) {
      rush = out.rush;
      // The server's clock is the one that counts; this one is set from its time left.
      rush.ends_at = new Date(Date.now() + out.rush.ms_left).toISOString();
      $('rushbar').hidden = false;
      paintRush();
      if (tick) clearInterval(tick);
      tick = setInterval(clock, 250);
      clock();
      flipFor(out.puzzle);
      show(out.puzzle);
    }).catch(function (err) { if (err.message === 'signin') signIn(); else say(err.message, 'wrong'); });
  }

  function rushNext(state, delay) {
    rush.score = state.score;
    rush.strikes = state.strikes;
    paintRush();
    if (state.status !== 'open') { endRush(state); return; }
    setTimeout(function () { flipFor(state.next); show(state.next); }, delay);
  }

  function endRush(state) {
    if (tick) { clearInterval(tick); tick = null; }
    board.setInteractive(false);
    rush.score = state.score;
    rush.strikes = state.strikes;
    paintRush();
    var why = state.reason === 'strikes' ? 'Three strikes.' : 'Time is up.';
    say(why + ' Rush over: ' + state.score + ' solved' + (state.new_best ? ', a new best!' : '. Best: ' + state.best + '.'), state.new_best ? 'right' : '');
    $('best').textContent = state.best;
    $('next').textContent = 'Rush again';
    $('next').hidden = false;
    $('giveup').hidden = true;
    puzzle = null;
  }

  // ── controls ──────────────────────────────────────────────────────────────
  function setMode(m) {
    mode = m;
    $('mode-rated').setAttribute('aria-pressed', String(m === 'rated'));
    $('mode-rush').setAttribute('aria-pressed', String(m === 'rush'));
    $('rushbar').hidden = m !== 'rush';
    if (tick) { clearInterval(tick); tick = null; }
    board.setInteractive(false);
    puzzle = null;
    $('next').textContent = m === 'rush' ? 'Start the rush' : 'Start';
    $('next').hidden = false;
    $('retry').hidden = true;
    $('giveup').hidden = true;
    say(m === 'rush' ? 'Three minutes, three strikes. Ready?' : 'Rated puzzles adjust to how you do.', '');
  }

  $('mode-rated').addEventListener('click', function () { setMode('rated'); });
  $('mode-rush').addEventListener('click', function () { setMode('rush'); });
  $('next').addEventListener('click', function () { if (mode === 'rush') startRush(); else nextRated(); });
  $('retry').addEventListener('click', function () { if (lastFailed) nextRated(lastFailed); });
  $('giveup').addEventListener('click', function () {
    if (!puzzle) return;
    var before = board.position();
    board.setInteractive(false);
    api('POST', '/api/chess/puzzles/' + puzzle.attempt_id + '/resign').then(function (out) {
      stats(out.me);
      lastFailed = puzzle.attempt_id;
      say('The solution: ' + out.solution.map(function (s) { return s.san; }).join(' '), 'wrong');
      replay(before, out.solution, function () {
        $('next').textContent = 'Next puzzle';
        $('next').hidden = false;
        $('retry').hidden = false;
        $('giveup').hidden = true;
      });
    }).catch(function (err) { say(err.message, 'wrong'); });
  });

  api('GET', '/api/chess/puzzles/me').then(stats).catch(function (err) { if (err.message === 'signin') signIn(); });
  setMode('rated');
})();
