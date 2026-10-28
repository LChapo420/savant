/* The chess blocks: a graded move on a board, a position to study, and a
 * position to play out against the practice bot.
 *
 *   Check_Board    data { id, prompt, fen, orientation? }
 *                  The learner makes a move; the move (from-to) goes to the server,
 *                  which grades it in that position. No answer is on the page.
 *   Chess_Position data { fen, caption?, orientation?, line?: [SAN...], highlights?, arrows?, note? }
 *                  A board to look at, with step buttons through a line of moves.
 *   Chess_PlayOut  data { prompt, fen, goal?: 'win'|'mate'|'capture'|'draw'|'promote'|'survive',
 *                         strength?: 1-10, maxMoves?, orientation? }
 *                  The learner plays the side to move against the bot until the goal
 *                  is met, missed, or the move limit runs out; then a game review.
 *   Chess_Guided   data { title, fen, steps: [{ instruction, moves: [SAN...], reply?, explain, hint?, fen? }],
 *                         intro?, outro?, orientation? }
 *                  A lesson played move by move, with a hint ladder and gentle reasons.
 *
 * Needs chess-core.js, board.js, bot.js (for Chess_PlayOut), teach.js (for
 * Chess_Guided and the review) and, for Check_Board, checks-common.js.
 */
(function (global) {
  var C = global.PolymathChess;
  var TAG = 'polymath_chess';

  function blocks() {
    return global.LessonBlocks = global.LessonBlocks || {
      modules: {},
      register: function (tag, mod) { this.modules[tag] = mod; },
      get: function (tag) { return this.modules[tag]; },
      all: function () { var out = []; for (var k in this.modules) if (this.modules.hasOwnProperty(k)) out.push(this.modules[k]); return out; },
    };
  }

  function styles() {
    if (document.getElementById(TAG + '__styles')) return;
    var t = TAG;
    var st = document.createElement('style');
    st.id = t + '__styles';
    st.textContent = [
      '.' + t + '__card{background:#111827;border:1px solid #1f293d;border-radius:12px;padding:18px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f8fafc;}',
      '.' + t + '__kicker{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#38bdf8;margin:0 0 8px;}',
      '.' + t + '__prompt{margin:0 0 12px;font-size:16px;line-height:1.55;font-weight:600;white-space:pre-wrap;}',
      '.' + t + '__note{margin:12px 0 0;font-size:14px;line-height:1.55;color:#cbd5e1;white-space:pre-wrap;}',
      '.' + t + '__turn{margin:8px 0 0;font-size:13px;color:#94a3b8;text-align:center;}',
      '.' + t + '__row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px;}',
      '.' + t + '__btn{min-height:44px;padding:0 16px;border:1px solid #334155;border-radius:10px;background:#090d16;color:#f8fafc;font:inherit;font-weight:600;cursor:pointer;}',
      '.' + t + '__btn.is-primary{background:#38bdf8;color:#090d16;border-color:#38bdf8;}',
      '.' + t + '__btn:disabled{opacity:.5;cursor:default;}',
      '.' + t + '__btn:focus-visible,.' + t + '__input:focus-visible{outline:2px solid #38bdf8;outline-offset:2px;}',
      '.' + t + '__input{min-height:44px;width:120px;padding:0 10px;border:1px solid #334155;border-radius:10px;background:#090d16;color:#f8fafc;font:inherit;}',
      '.' + t + '__moves{margin:10px 0 0;font-size:14px;color:#cbd5e1;text-align:center;min-height:1.4em;}',
      '.' + t + '__result{margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid #1f293d;background:#090d16;font-size:14px;line-height:1.55;text-align:center;}',
      '.' + t + '__result.is-right{border-color:#34d399;}',
      '.' + t + '__result.is-wrong{border-color:#f87171;}',
      '.' + t + '__title{margin:0 0 6px;font-size:18px;font-weight:700;}',
      '.' + t + '__dots{display:flex;gap:8px;justify-content:center;margin:0 0 12px;padding:0;list-style:none;}',
      '.' + t + '__dot{width:12px;height:12px;border-radius:50%;border:2px solid #475569;background:transparent;}',
      '.' + t + '__dot.is-done{background:#34d399;border-color:#34d399;}',
      '.' + t + '__dot.is-helped{background:#fbbf24;border-color:#fbbf24;}',
      '.' + t + '__dot.is-now{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,.25);}',
      '.' + t + '__say{margin:12px 0 0;padding:12px 14px;border-radius:10px;border:1px solid #1f293d;background:#090d16;font-size:15px;line-height:1.55;}',
      '.' + t + '__say.is-right{border-color:#34d399;}',
      '.' + t + '__say.is-wrong{border-color:#fbbf24;}',
      '.' + t + '__review{margin-top:14px;padding-top:12px;border-top:1px solid #1f293d;}',
      '.' + t + '__evalbar{height:14px;border-radius:7px;background:#1e293b;border:1px solid #475569;overflow:hidden;}',
      '.' + t + '__evalfill{height:100%;width:50%;background:#f1f5f9;transition:width 250ms;}',
      '.' + t + '__evaltext{margin:6px 0 10px;font-size:13px;color:#cbd5e1;text-align:center;}',
      '.' + t + '__plies{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none;}',
      '.' + t + '__ply{display:flex;align-items:center;gap:4px;border:1px solid #334155;border-radius:8px;padding:2px 4px 2px 2px;}',
      '.' + t + '__ply.is-bot{opacity:.7;}',
      '.' + t + '__ply.is-now{border-color:#38bdf8;box-shadow:0 0 0 2px rgba(56,189,248,.3);}',
      '.' + t + '__plybtn{min-height:36px;min-width:44px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:#f8fafc;font:inherit;font-size:14px;cursor:pointer;}',
      '.' + t + '__plybtn:disabled{opacity:.5;cursor:default;}',
      '.' + t + '__badge{font-size:11px;font-weight:700;padding:2px 6px;border-radius:6px;color:#090d16;}',
      '.' + t + '__badge.is-best{background:#34d399;}',
      '.' + t + '__badge.is-good{background:#a3e635;}',
      '.' + t + '__badge.is-inaccuracy{background:#fbbf24;}',
      '.' + t + '__badge.is-mistake{background:#fb923c;}',
      '.' + t + '__badge.is-blunder{background:#f87171;}',
      '@media (prefers-reduced-motion:reduce){.' + t + '__evalfill{transition:none;}}',
    ].join('');
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls.split(' ').map(function (c) { return /^is-/.test(c) ? c : TAG + '__' + c; }).join(' ');
    if (text != null) e.textContent = String(text);
    return e;
  }

  function sideName(pos) { return pos.side === 'w' ? 'White' : 'Black'; }
  function orientationFor(d, pos) { return d.orientation === 'black' || d.orientation === 'white' ? d.orientation : (pos.side === 'b' ? 'black' : 'white'); }

  /** Numbered move text for a list of SAN moves starting from `pos`. */
  function moveText(pos, sans) {
    var out = [];
    var n = 1;
    var white = pos.side === 'w';
    sans.forEach(function (s, i) {
      if (white) out.push(n + '. ' + s);
      else out.push(i === 0 ? n + '... ' + s : s);
      if (!white) n++;
      white = !white;
    });
    return out.join(' ');
  }

  // ── Check_Board ────────────────────────────────────────────────────────────
  function renderCheck(container, data) {
    if (!container) return;
    var Kit = global.PolymathCheckKit;
    styles();
    if (Kit) Kit.styles();
    container.innerHTML = '';
    var d = data || {};
    var start;
    try { start = C.parseFen(d.fen); } catch (e) { start = null; }
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Check'));
    card.appendChild(el('p', 'prompt', d.prompt || 'Find the best move.'));
    if (!start) { card.appendChild(el('p', 'note', 'This position could not be shown.')); container.appendChild(card); return; }
    var host = el('div');
    card.appendChild(host);
    var turn = el('p', 'turn', sideName(start) + ' to move. Make your move on the board, or type it.');
    card.appendChild(turn);
    var chosen = null;
    var board = global.PolymathBoard.create(host, {
      fen: d.fen,
      orientation: orientationFor(d, start),
      onMove: function (m, san) {
        chosen = m;
        board.setInteractive(false);
        turn.textContent = 'Your move: ' + san;
        submit.disabled = false;
        undo.disabled = false;
      },
    });
    var row = el('div', 'row');
    var typed = el('input', 'input');
    typed.type = 'text';
    typed.placeholder = 'e.g. Nf3';
    typed.setAttribute('aria-label', 'Type your move');
    var undo = el('button', 'btn', 'Undo');
    undo.type = 'button';
    undo.disabled = true;
    var submit = el('button', 'btn is-primary', 'Check move');
    submit.type = 'button';
    submit.disabled = true;
    row.appendChild(typed);
    row.appendChild(undo);
    row.appendChild(submit);
    card.appendChild(row);
    container.appendChild(card);

    typed.addEventListener('input', function () {
      var m = C.moveFromText(start, typed.value);
      submit.disabled = !m && !chosen;
    });
    typed.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !submit.disabled) send(); });
    undo.addEventListener('click', function () {
      chosen = null;
      board.setPosition(d.fen);
      board.setInteractive(true);
      turn.textContent = sideName(start) + ' to move. Make your move on the board, or type it.';
      submit.disabled = true;
      undo.disabled = true;
    });

    function lock(result) {
      board.setInteractive(false);
      typed.disabled = true;
      undo.disabled = true;
      submit.disabled = true;
      var right = result.answer ? C.moveFromText(start, result.answer) : null;
      if (right) board.setArrows([[C.sqName(right.from), C.sqName(right.to)]]);
      if (Kit) Kit.verdict(card, result);
    }

    function send() {
      var m = chosen || C.moveFromText(start, typed.value);
      if (!m) { turn.textContent = 'That is not a legal move here. Try again.'; return; }
      if (!chosen) { board.play(C.uci(m)); chosen = m; }
      submit.disabled = true;
      undo.disabled = true;
      var api = Kit ? Kit.submit(d.id, 'uci:' + C.uci(m)) : Promise.reject(new Error('Checks are not connected on this page.'));
      api.then(lock).catch(function (err) {
        submit.disabled = false;
        undo.disabled = false;
        if (Kit) Kit.verdict(card, { correct: false, answer: '', rationale: err.message || 'That move could not be saved. Try again.' });
      });
    }
    submit.addEventListener('click', send);

    var before = Kit ? Kit.previous(d.id) : null;
    if (before) {
      var prev = before.choice ? C.moveFromText(start, before.choice) : null;
      if (prev) board.play(C.uci(prev));
      lock(before);
    }
  }

  // ── Chess_Position ─────────────────────────────────────────────────────────
  function renderPosition(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var start;
    try { start = C.parseFen(d.fen); } catch (e) { start = null; }
    var card = el('div', 'card');
    if (d.caption) card.appendChild(el('p', 'kicker', d.caption));
    if (!start) { card.appendChild(el('p', 'note', 'This position could not be shown.')); container.appendChild(card); return; }
    var host = el('div');
    card.appendChild(host);
    var board = global.PolymathBoard.create(host, {
      fen: d.fen, orientation: orientationFor(d, start), interactive: false,
      highlights: d.highlights || [], arrows: d.arrows || [],
    });

    // Keep only the moves of the line that are legal, so a slip in the data cannot break the page.
    var steps = [];
    var p = start;
    (Array.isArray(d.line) ? d.line : []).some(function (text) {
      var m = C.moveFromText(p, text);
      if (!m) return true;
      steps.push({ san: C.san(p, m), uci: C.uci(m), after: C.makeMove(p, m), from: C.sqName(m.from), to: C.sqName(m.to) });
      p = steps[steps.length - 1].after;
      return false;
    });
    var at = 0;
    var moves = el('p', 'moves', '');
    if (steps.length) {
      var row = el('div', 'row');
      var back = el('button', 'btn', 'Back');
      back.type = 'button';
      var next = el('button', 'btn is-primary', 'Next move');
      next.type = 'button';
      row.appendChild(back);
      row.appendChild(next);
      card.appendChild(row);
      card.appendChild(moves);
      var show = function () {
        var fen = at === 0 ? d.fen : C.toFen(steps[at - 1].after);
        board.setPosition(fen, at === 0 ? null : [steps[at - 1].from, steps[at - 1].to]);
        board.setArrows(at === 0 ? d.arrows || [] : []);
        board.setHighlights(at === 0 ? d.highlights || [] : []);
        moves.textContent = at === 0 ? 'Start position' : moveText(start, steps.slice(0, at).map(function (s) { return s.san; }));
        back.disabled = at === 0;
        next.disabled = at === steps.length;
      };
      back.addEventListener('click', function () { if (at > 0) { at--; show(); } });
      next.addEventListener('click', function () { if (at < steps.length) { at++; show(); } });
      show();
    }
    if (d.note) card.appendChild(el('p', 'note', d.note));
    container.appendChild(card);
  }

  // ── Chess_PlayOut ──────────────────────────────────────────────────────────
  var GOAL_TEXT = {
    win: 'Win the game.',
    mate: 'Deliver checkmate.',
    capture: 'Capture every enemy piece and pawn (not the king).',
    draw: 'Hold the draw: do not lose.',
    promote: 'Promote a pawn.',
    survive: 'Do not get checkmated.',
  };

  function renderPlayOut(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var d = data || {};
    var start;
    try { start = C.parseFen(d.fen); } catch (e) { start = null; }
    var goal = GOAL_TEXT[d.goal] ? d.goal : 'win';
    var strength = Math.max(1, Math.min(10, Number(d.strength) || 4));
    var limit = Math.max(1, Math.min(200, Number(d.maxMoves) || 40));
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Play it out'));
    card.appendChild(el('p', 'prompt', (d.prompt ? d.prompt + ' ' : '') + GOAL_TEXT[goal]));
    if (!start) { card.appendChild(el('p', 'note', 'This position could not be shown.')); container.appendChild(card); return; }
    var me = start.side;
    var host = el('div');
    card.appendChild(host);
    var turn = el('p', 'turn', '');
    var moves = el('p', 'moves', '');
    var row = el('div', 'row');
    var again = el('button', 'btn', 'Start again');
    again.type = 'button';
    var reviewBtn = el('button', 'btn is-primary', 'Review the game');
    reviewBtn.type = 'button';
    reviewBtn.hidden = true;
    row.appendChild(again);
    row.appendChild(reviewBtn);
    card.appendChild(turn);
    card.appendChild(moves);
    card.appendChild(row);
    var result = null;
    var review = null;
    container.appendChild(card);

    var played = [];
    var history = []; // every move of the game: { fen: the position before it, uci, san, mine }
    var mine = 0;
    var board = global.PolymathBoard.create(host, {
      fen: d.fen, orientation: orientationFor(d, start), movable: me,
      onMove: function (m, san, after, before) {
        played.push(san);
        history.push({ fen: C.toFen(before), uci: C.uci(m), san: san, mine: true });
        mine++;
        moves.textContent = moveText(start, played);
        if (m.promo && goal === 'promote') return finish(true, 'You promoted. Goal reached.');
        if (goal === 'capture' && !enemyLeft(after)) return finish(true, 'Every enemy piece captured. Goal reached.');
        if (judge(after)) return;
        board.setInteractive(false);
        turn.textContent = 'Thinking...';
        setTimeout(function () { reply(after); }, 30);
      },
    });

    // Has the bot's side anything left besides its king?
    function enemyLeft(pos) {
      var theirs = me === 'w' ? /[pnbrq]/ : /[PNBRQ]/;
      return pos.board.some(function (pc) { return pc && theirs.test(pc); });
    }

    function judge(pos) {
      var st = C.status(pos);
      var meToMove = pos.side === me;
      if (st === 'checkmate') {
        var iWon = !meToMove;
        if (goal === 'draw' || goal === 'survive') return finish(iWon, iWon ? 'Checkmate - even better than holding.' : 'Checkmated. Try again.');
        return finish(iWon, iWon ? 'Checkmate! Goal reached.' : 'Checkmated. Try again.');
      }
      if (st === 'stalemate' || st === 'insufficient') {
        var ok = goal === 'draw' || goal === 'survive';
        return finish(ok, st === 'stalemate' ? (ok ? 'Stalemate - the draw is held.' : 'Stalemate: a draw, not a win. Watch for it next time.') : (ok ? 'Draw by too little material - held.' : 'Too little material left to win.'));
      }
      if (meToMove && mine >= limit) {
        var held = goal === 'draw' || goal === 'survive';
        return finish(held, held ? 'You held out for ' + limit + ' moves. Goal reached.' : 'Out of moves before reaching the goal. Try again.');
      }
      return false;
    }

    function reply(pos) {
      var bot = global.PolymathChessBot.chooseMove(pos, { strength: strength });
      if (!bot) { judge(pos); return; }
      history.push({ fen: C.toFen(pos), uci: C.uci(bot.move), san: bot.san, mine: false });
      board.play(C.uci(bot.move));
      played.push(bot.san);
      moves.textContent = moveText(start, played);
      var now = board.position();
      if (judge(now)) return;
      board.setInteractive(true);
      turn.textContent = 'Your move (' + sideName(now) + ').';
    }

    function finish(won, text) {
      board.setInteractive(false);
      turn.textContent = '';
      if (result) result.remove();
      result = el('div', 'result ' + (won ? 'is-right' : 'is-wrong'), (won ? 'Win: ' : 'Lose: ') + text);
      result.setAttribute('role', 'status');
      card.insertBefore(result, row);
      reviewBtn.hidden = !history.some(function (h) { return h.mine; }) || !global.PolymathChessTeach;
      return true;
    }

    /** Play on from the position before move `at` of this game; the moves after it are taken back. */
    function resume(at) {
      var fen = at < history.length ? history[at].fen : d.fen;
      history = history.slice(0, at);
      played = played.slice(0, at);
      mine = history.filter(function (h) { return h.mine; }).length;
      if (result) { result.remove(); result = null; }
      if (review) { review.close(); review = null; }
      reviewBtn.hidden = true;
      board.setPosition(fen);
      board.setArrows([]);
      board.setInteractive(true);
      moves.textContent = played.length ? moveText(start, played) : '';
      turn.textContent = 'Your move (' + sideName(board.position()) + ').';
    }

    again.addEventListener('click', function () { resume(0); });
    reviewBtn.addEventListener('click', function () {
      reviewBtn.hidden = true;
      review = renderReview(card, board, history, function (at) { resume(at); });
    });
    turn.textContent = 'Your move (' + sideName(start) + ').';
  }

  // ── Game review (after Chess_PlayOut) ──────────────────────────────────────
  var CLASS_TEXT = { best: 'Best', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };
  var CLASS_ORDER = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];

  /**
   * Every move of the finished game judged by the bot's search in a Web Worker
   * (review-worker.js; on the page's own thread if a worker cannot start): an
   * evaluation bar, each of the learner's moves classed by how much it gave away,
   * "a better move was ...", and "retry from here".
   */
  function renderReview(card, board, history, retry) {
    var T = global.PolymathChessTeach;
    var box = el('div', 'review');
    box.appendChild(el('p', 'kicker', 'Game review'));
    var bar = el('div', 'evalbar');
    var fill = el('div', 'evalfill');
    bar.appendChild(fill);
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', 'Evaluation bar');
    var evalText = el('p', 'evaltext', '');
    box.appendChild(bar);
    box.appendChild(evalText);
    var list = el('ol', 'plies');
    list.setAttribute('aria-label', 'Moves of the game');
    box.appendChild(list);
    var detail = el('p', 'note', 'Working through the game...');
    detail.setAttribute('role', 'status');
    box.appendChild(detail);
    var actions = el('div', 'row');
    var retryBtn = el('button', 'btn', 'Retry from here');
    retryBtn.type = 'button';
    retryBtn.hidden = true;
    actions.appendChild(retryBtn);
    box.appendChild(actions);
    card.appendChild(box);
    var results = [];
    var chosen = -1;
    var items = history.map(function (h, i) {
      var li = el('li', 'ply' + (h.mine ? '' : ' is-bot'));
      var b = el('button', 'plybtn', h.san);
      b.type = 'button';
      b.disabled = true;
      li.appendChild(b);
      list.appendChild(li);
      b.addEventListener('click', function () { select(i); });
      return { li: li, b: b };
    });

    // The evaluation after move i, from White's side, in centipawns.
    function whiteEval(i) {
      var r = results[i];
      if (!r) return 0;
      var s = Math.max(-2000, Math.min(2000, r.played.score));
      return r.side === 'w' ? s : -s;
    }
    function paintBar(i) {
      var r = results[i];
      var cp = whiteEval(i);
      fill.style.width = T.winChance(cp).toFixed(1) + '%';
      var text = r && r.played.mate ? ((r.side === 'w') === (r.played.mate > 0) ? 'White' : 'Black') + ' mates in ' + Math.abs(r.played.mate)
        : (cp >= 0 ? '+' : '') + (cp / 100).toFixed(1) + (Math.abs(cp) < 50 ? ' (about level)' : cp > 0 ? ' (White is better)' : ' (Black is better)');
      evalText.textContent = 'After ' + history[i].san + ': ' + text;
      bar.setAttribute('aria-label', 'Evaluation bar: ' + text);
    }
    function select(i) {
      chosen = i;
      items.forEach(function (it, k) { it.li.classList.toggle('is-now', k === i); });
      var h = history[i];
      var r = results[i];
      var before = C.parseFen(h.fen);
      var m = C.moveFromText(before, h.uci);
      if (r && h.mine && r.class !== 'best') {
        // The position before the move, the move played marked, the better one drawn.
        board.setPosition(h.fen, [h.uci.slice(0, 2), h.uci.slice(2, 4)]);
        board.setArrows([[r.best.uci.slice(0, 2), r.best.uci.slice(2, 4)]]);
        detail.textContent = 'You played ' + h.san + ': ' + CLASS_TEXT[r.class].toLowerCase() + '. '
          + (r.missedMate ? 'There was checkmate in ' + r.missedMate + ', starting with ' + r.best.san + '.' : 'A better move was ' + r.best.san + ' (the arrow).');
      } else {
        board.setPosition(C.toFen(C.makeMove(before, m)), [h.uci.slice(0, 2), h.uci.slice(2, 4)]);
        board.setArrows([]);
        detail.textContent = h.mine ? 'You played ' + h.san + (r ? ': ' + CLASS_TEXT[r.class].toLowerCase() + '.' : '.') : 'The bot played ' + h.san + '.';
      }
      if (r) paintBar(i);
      retryBtn.hidden = !h.mine;
    }
    retryBtn.addEventListener('click', function () { if (chosen >= 0) retry(chosen); });

    function got(i, r) {
      results[i] = r;
      var it = items[i];
      it.b.disabled = false;
      if (r && history[i].mine) {
        it.li.appendChild(el('span', 'badge is-' + r.class, CLASS_TEXT[r.class]));
        it.b.setAttribute('aria-label', history[i].san + ', ' + CLASS_TEXT[r.class]);
      }
    }
    function done() {
      var mineR = results.filter(function (r, i) { return r && history[i].mine; });
      var count = function (c) { return mineR.filter(function (r) { return r.class === c; }).length; };
      var worst = -1;
      results.forEach(function (r, i) {
        if (r && history[i].mine && (worst < 0 || CLASS_ORDER.indexOf(r.class) > CLASS_ORDER.indexOf(results[worst].class))) worst = i;
      });
      if (worst >= 0 && CLASS_ORDER.indexOf(results[worst].class) >= 2) select(worst);
      else if (results.length) paintBar(results.length - 1);
      var n = function (c, one, many) { var k = count(c); return k + ' ' + (k === 1 ? one : many); };
      var summary = 'Your moves: ' + count('best') + ' best, ' + count('good') + ' good, ' + n('inaccuracy', 'inaccuracy', 'inaccuracies') + ', '
        + n('mistake', 'mistake', 'mistakes') + ', ' + n('blunder', 'blunder', 'blunders') + '.';
      detail.textContent = summary + ' ' + (worst >= 0 && CLASS_ORDER.indexOf(results[worst].class) >= 2 ? detail.textContent : 'Tap a move to see it.');
    }

    var plies = history.map(function (h) { return { fen: h.fen, uci: h.uci }; });
    var worker = null;
    var stopped = false;
    // Without a worker, one move per tick on the page's own thread.
    function onPage(from) {
      var i = from;
      (function next() {
        if (stopped) return;
        if (i >= plies.length) { done(); return; }
        if (!results[i]) got(i, T.reviewPly(plies[i].fen, plies[i].uci, { depth: 3 }));
        i++;
        setTimeout(next, 0);
      })();
    }
    function inWorker() {
      try {
        worker = new Worker('/engine/chess/review-worker.js');
        worker.onmessage = function (e) {
          if (e.data.type === 'ply') got(e.data.index, e.data.result);
          if (e.data.type === 'done') { done(); worker.terminate(); worker = null; }
        };
        worker.onerror = function () { if (worker) worker.terminate(); worker = null; onPage(0); };
        worker.postMessage({ plies: plies, depth: 3 });
      } catch (err) { worker = null; onPage(0); }
    }
    // Stockfish on our server first (much deeper, and nothing GPL reaches the
    // browser), a few moves per request so results arrive as it goes; without a
    // server engine (503), offline, or signed out, the bot reviews in a worker here.
    var CHUNK = 6;
    function onServer(from) {
      if (stopped) return;
      if (from >= plies.length) { done(); return; }
      if (typeof fetch !== 'function') { inWorker(); return; }
      fetch('/api/chess/review', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plies: plies.slice(from, from + CHUNK) }),
      }).then(function (res) {
        if (!res.ok) throw new Error('no server engine');
        return res.json();
      }).then(function (out) {
        if (stopped) return;
        (out.results || []).forEach(function (r, k) { got(from + k, r); });
        if (from === 0) detail.textContent = 'Reviewed by Stockfish on our server...';
        onServer(from + CHUNK);
      }).catch(function () {
        if (stopped) return;
        if (from === 0) inWorker(); else onPage(from);
      });
    }
    onServer(0);

    return {
      close: function () {
        stopped = true;
        if (worker) worker.terminate();
        if (box.parentNode) box.parentNode.removeChild(box);
      },
    };
  }

  // ── Chess_Guided ───────────────────────────────────────────────────────────
  /**
   * A lesson the learner plays through move by move. Each step: an instruction,
   * the learner's move (one of `moves`; any mate counts when every listed move
   * mates), the opponent's reply played for them, and why it worked. Hints climb
   * a ladder: the piece, then an arrow, then the move in words. A wrong move is
   * taken back with a gentle reason (teach.js).
   */
  function renderGuided(container, data) {
    if (!container) return;
    styles();
    container.innerHTML = '';
    var T = global.PolymathChessTeach;
    var d = data || {};
    var steps = Array.isArray(d.steps) ? d.steps : [];
    var start;
    try { start = C.parseFen(d.fen); } catch (e) { start = null; }
    var card = el('div', 'card');
    card.appendChild(el('p', 'kicker', 'Guided lesson'));
    if (d.title) card.appendChild(el('p', 'title', d.title));
    if (d.intro) card.appendChild(el('p', 'note', d.intro));
    if (!start || !steps.length) { card.appendChild(el('p', 'note', 'This lesson could not be shown.')); container.appendChild(card); return; }
    var dots = el('ol', 'dots');
    dots.setAttribute('aria-label', 'Steps');
    var dotEls = steps.map(function (s, i) {
      var li = el('li', 'dot');
      li.setAttribute('aria-label', 'Step ' + (i + 1) + ' of ' + steps.length);
      dots.appendChild(li);
      return li;
    });
    card.appendChild(dots);
    var host = el('div');
    card.appendChild(host);
    var say = el('p', 'prompt', '');
    var feedback = null;
    var row = el('div', 'row');
    var hintBtn = el('button', 'btn', 'Hint');
    hintBtn.type = 'button';
    var nextBtn = el('button', 'btn is-primary', 'Next step');
    nextBtn.type = 'button';
    var againBtn = el('button', 'btn', 'Start over');
    againBtn.type = 'button';
    row.appendChild(hintBtn);
    row.appendChild(nextBtn);
    row.appendChild(againBtn);
    card.appendChild(say);
    card.appendChild(row);
    container.appendChild(card);

    var at = 0;
    var pos = start;
    var hintLevel = 0;
    var status = steps.map(function () { return ''; });
    var board = global.PolymathBoard.create(host, { fen: d.fen, orientation: orientationFor(d, start), movable: start.side, onMove: onMove });

    function expected(p, step) {
      var out = [];
      (Array.isArray(step.moves) ? step.moves : []).forEach(function (text) {
        var m = C.moveFromText(p, text);
        if (m) out.push(m);
      });
      return out;
    }

    function tell(text, kind) {
      // A fresh element per verdict, so each one is counted once by the level's capture.
      if (feedback) feedback.remove();
      feedback = el('p', 'say' + (kind ? ' ' + kind : ''), text);
      feedback.setAttribute('role', 'status');
      card.insertBefore(feedback, row);
    }

    function paintDots() {
      dotEls.forEach(function (li, i) {
        li.className = TAG + '__dot' + (status[i] === 'done' ? ' is-done' : status[i] === 'helped' ? ' is-helped' : '') + (i === at && !status[i] ? ' is-now' : '');
      });
    }

    function showStep() {
      var step = steps[at];
      if (step.fen) {
        try { pos = C.parseFen(step.fen); board.setPosition(step.fen); } catch (e) { /* the server checked it */ }
      }
      hintLevel = 0;
      board.setHighlights([]);
      board.setArrows([]);
      board.setInteractive(true);
      say.textContent = step.instruction || 'Make the move.';
      if (feedback) { feedback.remove(); feedback = null; }
      hintBtn.textContent = 'Hint';
      hintBtn.disabled = false;
      nextBtn.hidden = true;
      paintDots();
    }

    function onMove(m, san, after, before) {
      var step = steps[at];
      var want = expected(before, step);
      var allMate = want.length && want.every(function (x) { return C.isCheckmate(C.makeMove(before, x)); });
      var right = want.some(function (x) { return C.uci(x) === C.uci(m); }) || (allMate && C.isCheckmate(after));
      if (!right) {
        board.setInteractive(false);
        tell(T ? T.wrongMoveReason(before, m, want) : 'Not this time. Try again.', 'is-wrong');
        setTimeout(function () {
          board.setPosition(C.toFen(before));
          board.setInteractive(true);
          if (hintLevel) giveHint(hintLevel, true);
        }, 700);
        return;
      }
      board.setInteractive(false);
      board.setHighlights([]);
      board.setArrows([]);
      status[at] = hintLevel >= 2 ? 'helped' : 'done';
      var listed = want.some(function (x) { return C.uci(x) === C.uci(m); });
      // Another mate than the lesson's: the step's words describe the lesson's move, so say so.
      tell(listed ? (step.explain || 'Right.') : 'Checkmate with ' + san + ' works too. (The lesson\'s move was ' + C.san(before, want[0]) + '.)', 'is-right');
      hintBtn.disabled = true;
      pos = after;
      var finishStep = function () {
        paintDots();
        nextBtn.textContent = at === steps.length - 1 ? 'Finish' : 'Next step';
        nextBtn.hidden = false;
        nextBtn.focus();
      };
      if (step.reply && C.status(after) === 'playing') {
        setTimeout(function () {
          var r = C.moveFromText(pos, step.reply);
          if (r) { board.play(C.uci(r)); pos = C.makeMove(pos, r); }
          finishStep();
        }, 600);
      } else finishStep();
    }

    function giveHint(level, quiet) {
      var want = expected(pos, steps[at]);
      if (!want.length) return;
      var m = want[0];
      var from = C.sqName(m.from);
      var to = C.sqName(m.to);
      if (level >= 1) board.setHighlights([from]);
      if (level >= 2) board.setArrows([[from, to]]);
      if (quiet) return;
      if (level === 1) tell((steps[at].hint ? steps[at].hint + ' ' : '') + 'Look at the highlighted ' + C.NAMES[m.piece.toLowerCase()] + '.', '');
      if (level === 2) tell('Move it along the arrow.', '');
      if (level === 3) tell('The move is ' + C.san(pos, m) + '. Make it on the board.', '');
      hintBtn.textContent = level === 1 ? 'More help' : 'Show the move';
      if (level >= 3) hintBtn.disabled = true;
    }

    hintBtn.addEventListener('click', function () {
      hintLevel = Math.min(3, hintLevel + 1);
      giveHint(hintLevel);
    });
    nextBtn.addEventListener('click', function () {
      if (at < steps.length - 1) { at++; showStep(); return; }
      nextBtn.hidden = true;
      hintBtn.disabled = true;
      var solo = status.filter(function (s) { return s === 'done'; }).length;
      tell((d.outro ? d.outro + ' ' : '') + 'Lesson complete: ' + solo + ' of ' + steps.length + ' steps without the full hint.', 'is-right');
      at = steps.length;
      paintDots();
    });
    againBtn.addEventListener('click', function () {
      at = 0;
      pos = start;
      status = steps.map(function () { return ''; });
      board.setPosition(d.fen);
      showStep();
    });
    showStep();
  }

  var reg = blocks();
  reg.register('Chess_Guided', { tag: 'Chess_Guided', render: renderGuided, renderBlock: renderGuided, schema: null });
  reg.register('Check_Board', { tag: 'Check_Board', render: renderCheck, renderBlock: renderCheck, schema: null });
  reg.register('Chess_Position', { tag: 'Chess_Position', render: renderPosition, renderBlock: renderPosition, schema: null });
  reg.register('Chess_PlayOut', { tag: 'Chess_PlayOut', render: renderPlayOut, renderBlock: renderPlayOut, schema: null });
})(typeof window !== 'undefined' ? window : globalThis);
