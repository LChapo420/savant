/* Chess sittings played on the server (staged skills round 3, patch 05;
 * SKILL_CHESS_SITTINGS): play-outs against perfect defence, recorded games
 * against the measured bots, star mazes, setting up the board and typing a
 * whole line. The server holds every position and judges every move; this
 * page only draws the board and sends moves.
 *
 * Network: POST to /api/skills/checks only (through the page's own `post`).
 * No camera, no microphone.
 */
(function (global) {
  'use strict';

  const C = global.PolymathChess;
  const esc = (s) => global.App.escapeHtml(String(s == null ? '' : s));
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const TEXT = '︎';
  const NAME = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
  const SIDE = { w: 'White', b: 'Black' };

  function styles() {
    if (document.getElementById('chess-sittings-css')) return;
    const st = document.createElement('style');
    st.id = 'chess-sittings-css';
    st.textContent = [
      '.cs-grid{display:grid;grid-template-columns:repeat(8,1fr);aspect-ratio:1/1;max-width:360px;border-radius:6px;overflow:hidden;box-shadow:0 0 0 1px #334155;margin:0 0 12px;}',
      '.cs-sq{border:0;padding:0;margin:0;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;font:inherit;cursor:pointer;position:relative;}',
      '.cs-sq.is-light{background:#eedbb8;}.cs-sq.is-dark{background:#b5875f;}',
      '.cs-sq:focus-visible{outline:3px solid #38bdf8;outline-offset:-3px;z-index:2;}',
      '.cs-pc{font-size:min(8vw,36px);line-height:1;font-family:"Segoe UI Symbol","DejaVu Sans","Noto Sans Symbols 2",serif;pointer-events:none;}',
      '.cs-pc.is-w{color:#fff;text-shadow:0 0 2px #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;}.cs-pc.is-b{color:#111827;text-shadow:0 0 1px #fff;}',
      '.cs-star{font-size:min(6vw,26px);color:#b45309;pointer-events:none;}.cs-star.is-got{opacity:.25;}',
      '.cs-wall{position:absolute;inset:12%;background:#1f2937;border-radius:4px;pointer-events:none;}',
      '.cs-palette{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;max-width:360px;}',
      '.cs-palette button{min-width:44px;min-height:44px;border-radius:8px;border:1px solid var(--line-strong,#94a3b8);background:var(--page,#fff);cursor:pointer;}',
      '.cs-palette button[aria-pressed="true"]{box-shadow:0 0 0 3px #38bdf8;}',
      '.cs-status{margin:0 0 8px;}.cs-clock{font-variant-numeric:tabular-nums;font-weight:700;}',
    ].join('');
    document.head.appendChild(st);
  }

  /** An 8x8 grid of square buttons (White at the bottom); `cell(sq)` gives each square's inner HTML and label. */
  function grid(host, cell, onClick) {
    const g = document.createElement('div');
    g.className = 'cs-grid';
    g.setAttribute('role', 'grid');
    for (let i = 0; i < 64; i++) {
      const s = (7 - (i >> 3)) * 8 + (i & 7);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `cs-sq is-${((s & 7) + (s >> 3)) % 2 === 1 ? 'light' : 'dark'}`;
      b.dataset.sq = C.sqName(s);
      b.addEventListener('click', () => onClick(C.sqName(s)));
      g.appendChild(b);
    }
    host.appendChild(g);
    const draw = () => g.querySelectorAll('.cs-sq').forEach((b) => { const c = cell(b.dataset.sq); b.innerHTML = c.html; b.setAttribute('aria-label', `${b.dataset.sq}, ${c.label}`); });
    draw();
    return { draw, el: g };
  }

  const pieceHtml = (p) => `<span class="cs-pc is-${p === p.toUpperCase() ? 'w' : 'b'}">${GLYPH[p.toLowerCase()]}${TEXT}</span>`;
  const pieceLabel = (p) => `${p === p.toUpperCase() ? 'white' : 'black'} ${NAME[p.toLowerCase()]}`;

  // ── a board played against the server (play-outs and games) ──────────────
  function playBoard(host, o) {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="skill-board" data-b></div><form class="skill-answer"><label class="visually-hidden" for="cs-move">Your move</label><input id="cs-move" class="input" autocomplete="off" spellcheck="false" placeholder="Or type a move, e.g. Qb7"><button class="btn btn-primary" type="submit">Play</button><button class="btn" type="button" data-giveup></button></form>';
    host.appendChild(wrap);
    const field = wrap.querySelector('input');
    wrap.querySelector('[data-giveup]').textContent = o.giveUpLabel;
    let busy = false;
    let fen = o.fen;
    const board = global.PolymathBoard.create(wrap.querySelector('[data-b]'), {
      fen, orientation: o.learner === 'b' ? 'black' : 'white', movable: o.learner, interactive: C.parseFen(fen).side === o.learner,
      onMove: (m) => send(C.uci(m)),
    });
    async function send(text) {
      if (busy) return;
      busy = true;
      board.setInteractive(false);
      try {
        const r = await o.post({ move: text });
        fen = r.fen;
        if (r.reply) board.setPosition(fen, [r.reply.uci.slice(0, 2), r.reply.uci.slice(2, 4)]); else board.setPosition(fen);
        field.value = '';
        o.onReply(r);
        board.setInteractive(!r.over && C.parseFen(fen).side === o.learner);
      } catch (err) {
        global.App.toast(err.message, 'error');
        board.setPosition(fen);
        board.setInteractive(C.parseFen(fen).side === o.learner);
      } finally { busy = false; }
    }
    wrap.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); if (field.value.trim()) send(field.value.trim()); });
    wrap.querySelector('[data-giveup]').addEventListener('click', async () => {
      if (busy || !global.confirm(o.giveUpConfirm)) return;
      busy = true;
      try { o.onReply(await o.giveUp()); } catch (err) { global.App.toast(err.message, 'error'); } finally { busy = false; }
    });
    return { destroy() { board.destroy(); } };
  }

  // ── play-outs ─────────────────────────────────────────────────────────────
  function playouts(host, s, api, onDone) {
    let start = s.start;
    const results = (s.results || []).slice();
    function show(fen) {
      if (!start) { onDone(); return; }
      host.innerHTML = `<p class="skill-q-count"><span class="num">${start.index + 1}</span> / <span class="num">${s.starts}</span></p>
        <p class="skill-stem">${esc(start.title)}.</p>
        <p class="small muted cs-status">${start.goal === 'mate' ? `Checkmate within <span class="num">${start.limit}</span> moves (the fastest mate takes <span class="num">${start.dtm}</span>). Black defends perfectly.` : start.goal === 'hold' ? `Hold it for <span class="num">${start.limit}</span> moves. ${start.kind === 'philidor' ? 'Stockfish attacks.' : 'White plays its trickiest moves.'}` : `Promote to a piece that wins, within <span class="num">${start.limit}</span> moves. ${start.kind === 'lucena' ? 'Stockfish defends.' : 'Black defends perfectly.'}`} <span data-n></span></p>
        <div data-play></div><div data-verdict aria-live="polite"></div>`;
      const n = host.querySelector('[data-n]');
      let moves = 0;
      const pb = playBoard(host.querySelector('[data-play]'), {
        fen: fen || start.fen, learner: start.learner, giveUpLabel: 'Give up this one', giveUpConfirm: 'Give this one up? It counts as not done.',
        post: (body) => api('move', body), giveUp: () => api('resign', {}),
        onReply: (r) => {
          moves += 1;
          n.textContent = `Moves: ${moves}.`;
          if (!r.over) return;
          results.push(r.over);
          const v = host.querySelector('[data-verdict]');
          v.innerHTML = `<p class="skill-verdict ${r.over.ok ? 'is-right' : 'is-wrong'}">${global.mark(r.over.ok ? 'tick' : 'cross')}<span>${esc(r.over.why.charAt(0).toUpperCase() + r.over.why.slice(1))}.</span></p>
            <button class="btn btn-primary" type="button" data-next>${r.next ? 'Next position' : 'See the result'}</button>`;
          v.querySelector('[data-next]').addEventListener('click', () => { pb.destroy(); start = r.next; show(null); });
          v.querySelector('[data-next]').focus();
        },
      });
    }
    show(s.fen);
  }

  // ── recorded games ────────────────────────────────────────────────────────
  function games(host, s, api, onDone) {
    let game = s.games[s.games.length - 1];
    const target = s.target || s.games.length;
    let timer = null;
    function show() {
      clearInterval(timer);
      if (!game || game.result !== null) { onDone(); return; }
      const opp = game.opponent ? `a bot measured at about <span class="num">${game.opponent.rating}</span>` : 'the bot';
      host.innerHTML = `<p class="skill-q-count">Game <span class="num">${game.index + 1}</span> of <span class="num">${target}</span></p>
        <p class="skill-stem">You play ${SIDE[game.learner]} against ${opp}. The game is recorded here.</p>
        ${game.clock_ms != null ? '<p class="small cs-status">Your clock: <span class="cs-clock" data-clock></span></p>' : ''}
        <div data-play></div><div data-verdict aria-live="polite"></div>`;
      let left = game.clock_ms;
      let ticking = C.parseFen(game.fen).side === game.learner;
      let last = Date.now();
      const clock = host.querySelector('[data-clock]');
      const paint = () => { if (!clock) return; const t = Math.max(0, left); clock.textContent = `${Math.floor(t / 60000)}:${String(Math.floor((t % 60000) / 1000)).padStart(2, '0')}`; };
      if (clock) { paint(); timer = setInterval(() => { const now = Date.now(); if (ticking) left -= now - last; last = now; paint(); }, 250); }
      const pb = playBoard(host.querySelector('[data-play]'), {
        fen: game.fen, learner: game.learner, giveUpLabel: 'Resign', giveUpConfirm: 'Resign this game? It counts as a loss.',
        post: (body) => { ticking = false; return api('move', body); }, giveUp: () => api('resign', {}),
        onReply: (r) => {
          if (r.clock_ms != null) { left = r.clock_ms; last = Date.now(); }
          ticking = !r.over;
          if (!r.over) return;
          clearInterval(timer);
          const a = r.over.analysis;
          const res = r.over.score === 1 ? 'You won' : r.over.score === 0 ? 'You lost' : 'A draw';
          const v = host.querySelector('[data-verdict]');
          v.innerHTML = `<p class="skill-verdict">${global.mark(r.over.score === 1 ? 'tick' : 'dot')}<span>${res}: ${esc(r.over.why)}.</span></p>
            ${a && a.engine ? `<p class="small">Stockfish's review: <span class="num">${a.blunders}</span> blunder${a.blunders === 1 ? '' : 's'}, <span class="num">${a.hung}</span> piece${a.hung === 1 ? '' : 's'} left hanging, accuracy <span class="num">${a.accuracy}</span>%.</p>` : ''}
            <button class="btn btn-primary" type="button" data-next>${r.next ? 'Next game' : 'See the result'}</button>`;
          v.querySelector('[data-next]').addEventListener('click', () => { pb.destroy(); game = r.next || null; show(); });
          v.querySelector('[data-next]').focus();
        },
      });
    }
    show();
  }

  // ── star mazes ────────────────────────────────────────────────────────────
  function mazes(host, s, api, onDone) {
    let maze = s.maze;
    let at = s.at;
    let got = (s.got || []).slice();
    let moves = s.moves || 0;
    let index = s.current;
    function show() {
      if (!maze) { onDone(); return; }
      host.innerHTML = `<p class="skill-q-count"><span class="num">${index + 1}</span> / <span class="num">${s.mazes}</span></p>
        <p class="skill-stem">Collect every star with the ${NAME[maze.piece.toLowerCase()]}: land on each one. Dark squares are walls. Par: <span class="num">${maze.par}</span> moves.</p>
        <p class="small cs-status" aria-live="polite">Moves: <span class="num" data-moves>${moves}</span>. Stars: <span class="num" data-got>${got.length}</span> of <span class="num">${maze.stars.length}</span>.</p>
        <div data-grid></div>
        <div class="path-actions"><button class="btn" type="button" data-giveup>Give up this maze</button></div><div data-verdict aria-live="polite"></div>`;
      let busy = false;
      const g = grid(host.querySelector('[data-grid]'), (sq) => {
        if (sq === at) return { html: pieceHtml(maze.piece), label: `your ${NAME[maze.piece.toLowerCase()]}` };
        if (maze.walls.includes(sq)) return { html: '<span class="cs-wall"></span>', label: 'wall' };
        if (maze.stars.includes(sq)) return { html: `<span class="cs-star${got.includes(sq) ? ' is-got' : ''}">★</span>`, label: got.includes(sq) ? 'star, collected' : 'star' };
        return { html: '', label: 'empty' };
      }, async (sq) => {
        if (busy || sq === at) return;
        busy = true;
        try {
          const r = await api('move', { to: sq });
          at = r.at; got = r.got || []; moves = r.moves;
          g.draw();
          host.querySelector('[data-moves]').textContent = moves;
          host.querySelector('[data-got]').textContent = got.length;
          if (r.over) finishMaze(r);
        } catch (err) { global.App.toast(err.message, 'error'); } finally { busy = false; }
      });
      host.querySelector('[data-giveup]').addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        try { finishMaze(await api('resign', {})); } catch (err) { global.App.toast(err.message, 'error'); } finally { busy = false; }
      });
    }
    function finishMaze(r) {
      const v = host.querySelector('[data-verdict]');
      const ok = r.over.at_par;
      v.innerHTML = `<p class="skill-verdict ${ok ? 'is-right' : 'is-wrong'}">${global.mark(ok ? 'tick' : 'cross')}<span>${ok ? 'At par.' : r.over.done ? `Done in <span class="num">${r.over.moves}</span>; par was <span class="num">${r.over.par}</span>.` : 'Not finished.'}</span></p>
        <button class="btn btn-primary" type="button" data-next>${r.next ? 'Next maze' : 'See the result'}</button>`;
      host.querySelectorAll('.cs-sq, [data-giveup]').forEach((b) => { b.disabled = true; });
      v.querySelector('[data-next]').addEventListener('click', () => { maze = r.next; index += 1; at = maze ? maze.start : null; got = []; moves = 0; show(); });
      v.querySelector('[data-next]').focus();
    }
    show();
  }

  // ── items: set-up and whole lines ─────────────────────────────────────────
  function items(host, o) {
    const list = o.items;
    let index = (o.answered || []).findIndex((x) => !x);
    if (index < 0) index = o.answered && o.answered.length ? list.length : 0;
    async function submit(answer) {
      host.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
      try { await o.onAnswer(index, answer, 'board'); } catch (err) {
        global.App.toast(err.message, 'error');
        host.querySelectorAll('button, input').forEach((b) => { b.disabled = false; });
        return;
      }
      index += 1;
      show();
    }
    function show() {
      if (index >= list.length) { host.innerHTML = ''; o.onDone(); return; }
      const it = list[index];
      host.innerHTML = `<div class="skill-q"><p class="skill-q-count"><span class="num">${index + 1}</span> / <span class="num">${list.length}</span></p>
        <p class="skill-stem">${esc(it.prompt).replace(/\n/g, '<br>')}</p><div data-body></div></div>`;
      const body = host.querySelector('[data-body]');
      if (it.kind === 'setup') {
        const board = Array(64).fill(null);
        let hand = 'P';
        const pal = document.createElement('div');
        pal.className = 'cs-palette';
        pal.setAttribute('role', 'group');
        pal.setAttribute('aria-label', 'Pieces');
        pal.innerHTML = 'KQRBNPkqrbnp'.split('').map((p) => `<button type="button" data-p="${p}" aria-pressed="${p === hand}" aria-label="${pieceLabel(p)}">${pieceHtml(p)}</button>`).join('') + '<button type="button" data-p="" aria-pressed="false">Clear a square</button>';
        body.appendChild(pal);
        pal.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { hand = b.dataset.p; pal.querySelectorAll('[data-p]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
        const g = grid(body, (sq) => { const p = board[C.sqIndex(sq)]; return p ? { html: pieceHtml(p), label: pieceLabel(p) } : { html: '', label: 'empty' }; }, (sq) => {
          const i = C.sqIndex(sq);
          board[i] = hand && board[i] !== hand ? hand : null;
          g.draw();
        });
        const act = document.createElement('div');
        act.className = 'path-actions';
        act.innerHTML = '<button class="btn btn-primary" type="button" data-submit>That is the starting position</button>';
        body.appendChild(act);
        act.querySelector('[data-submit]').addEventListener('click', () => {
          const rows = [];
          for (let r = 7; r >= 0; r--) {
            let row = ''; let empty = 0;
            for (let f = 0; f < 8; f++) { const p = board[r * 8 + f]; if (!p) empty++; else { if (empty) row += empty; empty = 0; row += p; } }
            rows.push(row + (empty || ''));
          }
          submit(rows.join('/'));
        });
      } else if (it.kind === 'line') {
        const b = document.createElement('div');
        b.className = 'skill-board';
        body.appendChild(b);
        global.PolymathBoard.create(b, { fen: it.fen, interactive: false, orientation: C.parseFen(it.fen).side === 'b' ? 'black' : 'white' });
        const form = document.createElement('form');
        form.className = 'skill-answer';
        form.innerHTML = `<label class="visually-hidden" for="cs-line">The whole line</label><input id="cs-line" class="input" autocomplete="off" spellcheck="false" placeholder="All ${it.plies} moves, e.g. Rxf7+ Kxf7 Qh5+ ..."><button class="btn btn-primary" type="submit">Answer</button>`;
        body.appendChild(form);
        const field = form.querySelector('input');
        form.addEventListener('submit', (e) => { e.preventDefault(); if (field.value.trim()) submit(field.value.trim()); });
        field.focus();
      }
    }
    show();
  }

  /** Run a sitting of a kind played on the server. */
  function run(host, o) {
    styles();
    const api = (what, body) => o.post(what, body);
    if (o.sitting.how === 'playout') playouts(host, o.sitting, api, o.onDone);
    else if (o.sitting.how === 'games') games(host, o.sitting, api, o.onDone);
    else if (o.sitting.how === 'maze') mazes(host, o.sitting, api, o.onDone);
  }

  const KINDS = ['playout', 'games', 'maze'];
  const ITEM_KINDS = ['setup', 'line'];
  global.ChessSittings = { run, items: (host, o) => { styles(); items(host, o); }, KINDS, ITEM_KINDS };
})(typeof window !== 'undefined' ? window : globalThis);
