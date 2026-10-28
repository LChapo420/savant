/**
 * The chess board: draws a position and lets the learner make legal moves.
 *
 *   var board = PolymathBoard.create(container, {
 *     fen, orientation: 'white' | 'black', interactive: true,
 *     movable: 'w' | 'b' | 'both',            // whose pieces may be moved (default: side to move)
 *     onMove: function (move, san, newPos) {}, // after a legal move is made on the board
 *     highlights: ['e4'], arrows: [['g1', 'f3']], lastMove: ['e2', 'e4'],
 *   });
 *   board.setPosition(fen); board.play('e2e4'); board.flip(); board.setInteractive(false);
 *
 * Moves are made by click-click or drag. Legal targets are shown as dots, a
 * promotion asks which piece, and every square is a labelled button, so the
 * board works from a keyboard and a screen reader. Pieces are text-style chess
 * symbols (never emoji). Needs chess-core.js.
 */
(function (global) {
  var C = global.PolymathChess;
  var TAG = 'polymath_board';
  var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  var NAME = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
  var TEXT = '︎';

  function styles() {
    if (document.getElementById(TAG + '__styles')) return;
    var t = TAG;
    var st = document.createElement('style');
    st.id = t + '__styles';
    st.textContent = [
      '.' + t + '{position:relative;width:100%;max-width:440px;margin:0 auto;user-select:none;-webkit-user-select:none;touch-action:none;}',
      '.' + t + '__grid{display:grid;grid-template-columns:repeat(8,1fr);aspect-ratio:1/1;border-radius:6px;overflow:hidden;box-shadow:0 0 0 1px #334155;}',
      '.' + t + '__sq{position:relative;border:0;padding:0;margin:0;font:inherit;display:flex;align-items:center;justify-content:center;cursor:default;aspect-ratio:1/1;}',
      '.' + t + '__sq.is-light{background:#eedbb8;}',
      '.' + t + '__sq.is-dark{background:#b5875f;}',
      '.' + t + '__sq.is-last{box-shadow:inset 0 0 0 999px rgba(250,204,21,.35);}',
      '.' + t + '__sq.is-hl{box-shadow:inset 0 0 0 999px rgba(56,189,248,.35);}',
      '.' + t + '__sq.is-sel{box-shadow:inset 0 0 0 999px rgba(52,211,153,.45);}',
      '.' + t + '__sq.is-check{box-shadow:inset 0 0 18px 4px rgba(239,68,68,.85);}',
      '.' + t + '__sq:focus-visible{outline:3px solid #38bdf8;outline-offset:-3px;z-index:2;}',
      '.' + t + '.is-live .' + t + '__sq{cursor:pointer;}',
      '.' + t + '__pc{font-size:min(9vw,44px);line-height:1;pointer-events:none;font-family:"Segoe UI Symbol","DejaVu Sans","Noto Sans Symbols 2",serif;}',
      '.' + t + '__pc.is-w{color:#fff;text-shadow:0 0 2px #000,0 0 1px #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;}',
      '.' + t + '__pc.is-b{color:#111827;text-shadow:0 0 1px #fff;}',
      '.' + t + '__dot{position:absolute;width:28%;height:28%;border-radius:50%;background:rgba(15,23,42,.35);pointer-events:none;}',
      '.' + t + '__ring{position:absolute;inset:6%;border-radius:50%;border:4px solid rgba(15,23,42,.35);pointer-events:none;}',
      '.' + t + '__coord{position:absolute;font-size:10px;font-weight:700;pointer-events:none;opacity:.8;}',
      '.' + t + '__coord.f{right:3px;bottom:1px;}',
      '.' + t + '__coord.r{left:3px;top:1px;}',
      '.' + t + '__sq.is-light .' + t + '__coord{color:#b5875f;}',
      '.' + t + '__sq.is-dark .' + t + '__coord{color:#eedbb8;}',
      '.' + t + '__arrows{position:absolute;inset:0;pointer-events:none;}',
      '.' + t + '__drag{position:fixed;pointer-events:none;z-index:50;transform:translate(-50%,-50%);}',
      '.' + t + '__promo{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(9,13,22,.8);z-index:5;border-radius:6px;}',
      '.' + t + '__promo button{width:22%;aspect-ratio:1/1;border-radius:10px;border:1px solid #334155;background:#eedbb8;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
      '.' + t + '__promo button:focus-visible{outline:3px solid #38bdf8;}',
      '@media (prefers-reduced-motion:reduce){.' + t + '__sq{transition:none;}}',
    ].join('');
    document.head.appendChild(st);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls.split(' ').map(function (c) { return TAG + '__' + c; }).join(' ');
    if (text != null) e.textContent = text;
    return e;
  }

  function create(container, opts) {
    styles();
    opts = opts || {};
    var pos = C.parseFen(opts.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    var orientation = opts.orientation === 'black' ? 'black' : 'white';
    var interactive = opts.interactive !== false;
    var movable = opts.movable || null;
    var highlights = (opts.highlights || []).slice();
    var arrows = (opts.arrows || []).slice();
    var lastMove = opts.lastMove || null;
    var selected = -1;
    var targets = [];
    var drag = null;

    var root = el('div', null);
    root.className = TAG;
    var grid = el('div', 'grid');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Chess board');
    root.appendChild(grid);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', TAG + '__arrows');
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('aria-hidden', 'true');
    root.appendChild(svg);
    container.appendChild(root);

    var squares = [];
    for (var i = 0; i < 64; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = TAG + '__sq';
      grid.appendChild(b);
      squares.push(b);
    }

    function squareAt(index) {
      // index is the visual position, 0 = top-left.
      var r = index >> 3;
      var f = index & 7;
      return orientation === 'white' ? (7 - r) * 8 + f : r * 8 + (7 - f);
    }
    function visualOf(sq) {
      for (var i = 0; i < 64; i++) if (squareAt(i) === sq) return i;
      return -1;
    }
    function mayMove(p) {
      if (!interactive || !p) return false;
      var side = movable || pos.side;
      return side === 'both' ? C.colorOf(p) === pos.side : C.colorOf(p) === side && side === pos.side;
    }

    function draw() {
      root.classList.toggle('is-live', interactive);
      var checkSq = C.inCheck(pos) ? C.kingSquare(pos, pos.side) : -1;
      for (var i = 0; i < 64; i++) {
        var s = squareAt(i);
        var b = squares[i];
        var p = pos.board[s];
        var light = ((s & 7) + (s >> 3)) % 2 === 1;
        b.className = TAG + '__sq ' + TAG + '__sq is-' + (light ? 'light' : 'dark');
        if (lastMove && (C.sqName(s) === lastMove[0] || C.sqName(s) === lastMove[1])) b.classList.add('is-last');
        if (highlights.indexOf(C.sqName(s)) >= 0) b.classList.add('is-hl');
        if (s === selected) b.classList.add('is-sel');
        if (s === checkSq) b.classList.add('is-check');
        b.innerHTML = '';
        if (p) {
          var g = el('span', 'pc is-' + C.colorOf(p), GLYPH[p.toLowerCase()] + TEXT);
          g.className = TAG + '__pc is-' + C.colorOf(p);
          b.appendChild(g);
        }
        var t = targets.filter(function (m) { return m.to === s; })[0];
        if (t) b.appendChild(el(p || t.enPassant ? 'span' : 'span', p || t.enPassant ? 'ring' : 'dot'));
        if ((i & 7) === 0) { var c1 = el('span', 'coord r', String((s >> 3) + 1)); b.appendChild(c1); }
        if (i >> 3 === 7) { var c2 = el('span', 'coord f', C.FILES[s & 7]); b.appendChild(c2); }
        b.setAttribute('aria-label', C.sqName(s) + (p ? ', ' + (C.colorOf(p) === 'w' ? 'white ' : 'black ') + NAME[p.toLowerCase()] : ', empty')
          + (t ? ', move here' : '') + (s === selected ? ', selected' : ''));
        b.tabIndex = interactive ? 0 : -1;
        b.disabled = false;
      }
      drawArrows();
    }

    function drawArrows() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      if (!arrows.length) return;
      var ns = 'http://www.w3.org/2000/svg';
      var defs = document.createElementNS(ns, 'defs');
      var marker = document.createElementNS(ns, 'marker');
      marker.setAttribute('id', TAG + '_head');
      marker.setAttribute('markerWidth', '4');
      marker.setAttribute('markerHeight', '4');
      marker.setAttribute('refX', '2');
      marker.setAttribute('refY', '2');
      marker.setAttribute('orient', 'auto');
      var tip = document.createElementNS(ns, 'path');
      tip.setAttribute('d', 'M0,0 L4,2 L0,4 z');
      tip.setAttribute('fill', 'rgba(22,163,74,.85)');
      marker.appendChild(tip);
      defs.appendChild(marker);
      svg.appendChild(defs);
      arrows.forEach(function (a) {
        var from = C.sqIndex(a[0]);
        var to = C.sqIndex(a[1]);
        var p1 = visualOf(from);
        var p2 = visualOf(to);
        var line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', (p1 & 7) + 0.5);
        line.setAttribute('y1', (p1 >> 3) + 0.5);
        line.setAttribute('x2', (p2 & 7) + 0.5);
        line.setAttribute('y2', (p2 >> 3) + 0.5);
        line.setAttribute('stroke', 'rgba(22,163,74,.75)');
        line.setAttribute('stroke-width', '0.18');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('marker-end', 'url(#' + TAG + '_head)');
        svg.appendChild(line);
      });
    }

    function select(s) {
      selected = s;
      targets = s >= 0 ? C.legalMoves(pos).filter(function (m) { return m.from === s; }) : [];
      draw();
    }

    function choosePromotion(options, done) {
      var box = el('div', 'promo');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', 'Promote to');
      ['q', 'r', 'b', 'n'].forEach(function (t) {
        var m = options.filter(function (o) { return o.promo === t; })[0];
        if (!m) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Promote to ' + NAME[t]);
        var g = el('span', 'pc is-' + pos.side, GLYPH[t] + TEXT);
        g.className = TAG + '__pc is-' + pos.side;
        btn.appendChild(g);
        btn.addEventListener('click', function () { root.removeChild(box); done(m); });
        box.appendChild(btn);
      });
      root.appendChild(box);
      var first = box.querySelector('button');
      if (first) first.focus();
    }

    function commit(m) {
      var before = pos;
      var san = C.san(before, m);
      pos = C.makeMove(before, m);
      lastMove = [C.sqName(m.from), C.sqName(m.to)];
      selected = -1;
      targets = [];
      draw();
      if (typeof opts.onMove === 'function') opts.onMove(m, san, pos, before);
    }

    function tryMove(to) {
      var options = targets.filter(function (m) { return m.to === to; });
      if (!options.length) return false;
      if (options.length > 1 && options[0].promo) choosePromotion(options, commit);
      else commit(options[0]);
      return true;
    }

    function onSquare(s) {
      if (!interactive) return;
      if (selected >= 0 && tryMove(s)) return;
      if (mayMove(pos.board[s])) select(s === selected ? -1 : s);
      else select(-1);
    }

    squares.forEach(function (b, i) {
      b.addEventListener('click', function () { if (!drag || !drag.moved) onSquare(squareAt(i)); });
      b.addEventListener('keydown', function (e) {
        var keys = { ArrowUp: -8, ArrowDown: 8, ArrowLeft: -1, ArrowRight: 1 };
        if (keys[e.key] !== undefined) {
          e.preventDefault();
          var n = i + keys[e.key];
          if (n >= 0 && n < 64 && !((e.key === 'ArrowLeft' && (i & 7) === 0) || (e.key === 'ArrowRight' && (i & 7) === 7))) squares[n].focus();
        }
      });
      b.addEventListener('pointerdown', function (e) {
        var s = squareAt(i);
        if (!interactive || !mayMove(pos.board[s]) || e.button !== 0) return;
        // A press only starts a possible drag; the click that follows a press without
        // movement does the selecting, so selecting here would be undone by it.
        var ghost = el('span', 'pc is-' + C.colorOf(pos.board[s]), GLYPH[pos.board[s].toLowerCase()] + TEXT);
        ghost.className = TAG + '__pc is-' + C.colorOf(pos.board[s]) + ' ' + TAG + '__drag';
        drag = { from: s, ghost: ghost, x: e.clientX, y: e.clientY, moved: false };
      });
    });

    function onPointerMove(e) {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      if (!drag.moved) { drag.moved = true; select(drag.from); document.body.appendChild(drag.ghost); }
      drag.ghost.style.left = e.clientX + 'px';
      drag.ghost.style.top = e.clientY + 'px';
    }
    function onPointerUp(e) {
      if (!drag) return;
      var d = drag;
      if (d.moved) {
        if (d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
        var rect = grid.getBoundingClientRect();
        var fx = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
        var fy = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
        if (fx >= 0 && fx < 8 && fy >= 0 && fy < 8 && !tryMove(squareAt(fy * 8 + fx))) select(-1);
        setTimeout(function () { drag = null; }, 0);
      } else drag = null;
    }
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);

    draw();

    return {
      position: function () { return pos; },
      fen: function () { return C.toFen(pos); },
      setPosition: function (fen, last) { pos = C.parseFen(fen); lastMove = last || null; select(-1); },
      /** Play a move given as from-to or algebraic notation; returns its SAN or null. */
      play: function (text) {
        var m = C.moveFromText(pos, text);
        if (!m) return null;
        var san = C.san(pos, m);
        pos = C.makeMove(pos, m);
        lastMove = [C.sqName(m.from), C.sqName(m.to)];
        select(-1);
        return san;
      },
      flip: function () { orientation = orientation === 'white' ? 'black' : 'white'; draw(); },
      setInteractive: function (on) { interactive = !!on; select(-1); },
      setHighlights: function (list) { highlights = (list || []).slice(); draw(); },
      setArrows: function (list) { arrows = (list || []).slice(); draw(); },
      destroy: function () {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  }

  global.PolymathBoard = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
