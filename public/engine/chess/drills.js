/* The move trainer page (drills.html). The server holds the line and grades each
 * move (content/chess-srs.js); this page shows the board, plays the moves the
 * server plays for the learner, and shows the reason for each move. */
(function () {
  var C = window.PolymathChess;
  var $ = function (id) { return document.getElementById(id); };
  var run = null; // the server's view of the current line
  var deck = null;
  var mode = 'review';
  var busy = false;

  function api(method, url, body) {
    return fetch(url, {
      method: method, credentials: 'same-origin',
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
  board._orientation = 'white';

  function say(text, kind) { var el = $('say'); el.textContent = text; el.className = 'say' + (kind ? ' ' + kind : ''); }
  function why(text) { var el = $('why'); el.textContent = text || ''; el.hidden = !text; }
  function signIn() { $('decks').innerHTML = '<p class="say">Sign in to use the move trainer: <a href="/login">sign in</a>.</p>'; }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function loadDecks() {
    $('play').hidden = true;
    $('decks').hidden = false;
    api('GET', '/api/chess/drills').then(function (out) {
      var box = $('decks');
      box.innerHTML = '';
      out.decks.forEach(function (d) {
        var card = el('div', 'deck');
        card.appendChild(el('h2', null, d.title));
        card.appendChild(el('p', null, d.blurb));
        var counts = el('p', 'counts');
        counts.innerHTML = '';
        counts.appendChild(document.createTextNode(d.learned + ' of ' + d.cards + ' moves learned · '));
        counts.appendChild(el('b', null, d.due + ' due'));
        card.appendChild(counts);
        var row = el('div', 'row');
        var r = el('button', 'primary', 'Review (' + d.due + ')');
        r.type = 'button';
        r.disabled = !d.due;
        r.addEventListener('click', function () { start(d.id, 'review'); });
        var l = el('button', null, 'Learn new moves');
        l.type = 'button';
        l.disabled = !d.new || out.new_today >= out.new_per_day;
        l.addEventListener('click', function () { start(d.id, 'learn'); });
        row.appendChild(r);
        row.appendChild(l);
        card.appendChild(row);
        box.appendChild(card);
      });
    }).catch(function (err) { if (err.message === 'signin') signIn(); else $('decks').textContent = err.message; });
  }

  function start(id, m) {
    deck = id;
    mode = m;
    api('POST', '/api/chess/drills/next', { deck: id, mode: m }).then(function (out) {
      if (out.none || out.limit) { $('decks').hidden = false; alertBox(out.message); return; }
      $('decks').hidden = true;
      $('play').hidden = false;
      $('again').hidden = true;
      var want = out.line.side === 'black' ? 'black' : 'white';
      if (board._orientation !== want) { board.flip(); board._orientation = want; }
      $('line-title').textContent = out.line.title;
      $('line-note').textContent = (mode === 'learn' ? 'Learn' : 'Review') + ': you play ' + out.line.side + '.';
      board.setPosition(out.line.start);
      why('');
      show(out, 0);
    }).catch(function (err) { if (err.message === 'signin') signIn(); else alertBox(err.message); });
  }

  function alertBox(text) { var p = el('p', 'say wrong', text); $('decks').insertBefore(p, $('decks').firstChild); }

  /** Play the moves the server played for the learner, then hand over the board. */
  function show(out, delay) {
    run = out;
    board.setInteractive(false);
    var i = 0;
    (function step() {
      if (i < out.auto.length) {
        var a = out.auto[i++];
        board.play(a.uci);
        setTimeout(step, 550);
        return;
      }
      board.setPosition(out.fen, null);
      if (out.done) {
        board.setPosition(out.fen);
        say('Line finished: ' + out.summary.right + ' right, ' + out.summary.wrong + ' to practise again.', out.summary.wrong ? 'wrong' : 'right');
        $('again').hidden = false;
        $('again').focus();
        return;
      }
      if (out.teach) {
        board.setArrows([[out.teach.uci.slice(0, 2), out.teach.uci.slice(2, 4)]]);
        say('New move: ' + out.teach.san + '. Play it on the board.', '');
        why(out.teach.why);
      } else {
        board.setArrows([]);
        say('Your move.', '');
      }
      board.setInteractive(true);
      busy = false;
    })();
    if (delay) busy = true;
  }

  function onMove(m, san, after, before) {
    if (!run || busy) return;
    busy = true;
    board.setInteractive(false);
    api('POST', '/api/chess/drills/' + run.run_id + '/move', { move: C.uci(m) }).then(function (out) {
      if (out.alsoGood) {
        say(out.message, 'wrong');
        board.setPosition(out.fen);
        board.setInteractive(true);
        busy = false;
        return;
      }
      if (!out.correct) {
        say(out.message + ' The move is ' + out.answer.san + '.', 'wrong');
        why(out.why);
        board.setPosition(out.fen);
        board.setArrows([[out.answer.uci.slice(0, 2), out.answer.uci.slice(2, 4)]]);
        run.retry = true;
        board.setInteractive(true);
        busy = false;
        return;
      }
      why(out.why);
      board.setArrows([]);
      var next = out.scored ? ' Next review in ' + whenText(out.scored.due) + '.' : '';
      say('Right: ' + out.played + '.' + next, 'right');
      setTimeout(function () { show(out, 0); }, 500);
    }).catch(function (err) {
      if (err.message === 'signin') return signIn();
      say(err.message, 'wrong');
      board.setPosition(C.toFen(before));
      board.setInteractive(true);
      busy = false;
    });
  }

  function whenText(iso) {
    var h = Math.round((Date.parse(iso) - Date.now()) / 3600000);
    if (h < 24) return h + ' hours';
    var d = Math.round(h / 24);
    return d < 30 ? d + (d === 1 ? ' day' : ' days') : Math.round(d / 30) + (d < 45 ? ' month' : ' months');
  }

  $('again').addEventListener('click', function () { start(deck, mode); });
  $('back').addEventListener('click', loadDecks);
  loadDecks();
})();
