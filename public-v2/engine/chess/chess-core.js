/**
 * Chess rules for Polymath, shared by the server and the browser.
 *
 * One file so the board a learner moves on and the server that grades the move can
 * never disagree about what is legal. It knows every rule a legal game needs —
 * castling through and out of check, en passant, promotion — and is checked against
 * the standard perft counts in scripts/chess-items-test.js.
 *
 * Squares are 0-63, a1 = 0, h1 = 7, a8 = 56. Pieces are FEN letters: upper case
 * White, lower case Black. Loaded in the browser it sets window.PolymathChess; on
 * the server, content/chess-board.js re-exports it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PolymathChess = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FILES = 'abcdefgh';
  const sqName = (s) => FILES[s & 7] + ((s >> 3) + 1);
  const sqIndex = (name) => FILES.indexOf(name[0]) + (Number(name[1]) - 1) * 8;
  const colorOf = (p) => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
  const other = (c) => (c === 'w' ? 'b' : 'w');

  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

  function step(s, df, dr) {
    const f = (s & 7) + df;
    const r = (s >> 3) + dr;
    return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f;
  }

  function parseFen(fen) {
    const [placement, side = 'w', castling = '-', ep = '-'] = fen.trim().split(/\s+/);
    const board = Array(64).fill(null);
    placement.split('/').forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else { board[(7 - i) * 8 + f] = ch; f++; }
      }
    });
    return { board, side, castling: castling === '-' ? '' : castling, ep: ep === '-' ? -1 : sqIndex(ep) };
  }

  function toFen(pos) {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = '';
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = pos.board[r * 8 + f];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p;
      }
      rows.push(row + (empty || ''));
    }
    return `${rows.join('/')} ${pos.side} ${pos.castling || '-'} ${pos.ep < 0 ? '-' : sqName(pos.ep)} 0 1`;
  }

  /** Is square `s` attacked by any piece of colour `by`? */
  function attacked(pos, s, by) {
    const b = pos.board;
    const own = (p, t) => p && colorOf(p) === by && p.toLowerCase() === t;
    const pawnDr = by === 'w' ? -1 : 1;
    for (const df of [-1, 1]) {
      const t = step(s, df, pawnDr);
      if (t >= 0 && own(b[t], 'p')) return true;
    }
    for (const [df, dr] of KNIGHT) { const t = step(s, df, dr); if (t >= 0 && own(b[t], 'n')) return true; }
    for (const [df, dr] of KING) { const t = step(s, df, dr); if (t >= 0 && own(b[t], 'k')) return true; }
    const ray = (dirs, kinds) => dirs.some(([df, dr]) => {
      for (let t = step(s, df, dr); t >= 0; t = step(t, df, dr)) {
        if (b[t]) return colorOf(b[t]) === by && kinds.includes(b[t].toLowerCase());
      }
      return false;
    });
    return ray(ROOK_DIRS, 'rq') || ray(BISHOP_DIRS, 'bq');
  }

  /** The squares of every piece of colour `by` that attacks square `s`, cheapest first. */
  function attackers(pos, s, by) {
    const b = pos.board;
    const out = [];
    const mine = (t) => b[t] && colorOf(b[t]) === by;
    const pawnDr = by === 'w' ? -1 : 1;
    for (const df of [-1, 1]) {
      const t = step(s, df, pawnDr);
      if (t >= 0 && mine(t) && b[t].toLowerCase() === 'p') out.push(t);
    }
    for (const [df, dr] of KNIGHT) { const t = step(s, df, dr); if (t >= 0 && mine(t) && b[t].toLowerCase() === 'n') out.push(t); }
    for (const [dirs, kinds] of [[BISHOP_DIRS, 'bq'], [ROOK_DIRS, 'rq']]) {
      for (const [df, dr] of dirs) {
        for (let t = step(s, df, dr); t >= 0; t = step(t, df, dr)) {
          if (!b[t]) continue;
          if (mine(t) && kinds.includes(b[t].toLowerCase())) out.push(t);
          break;
        }
      }
    }
    for (const [df, dr] of KING) { const t = step(s, df, dr); if (t >= 0 && mine(t) && b[t].toLowerCase() === 'k') out.push(t); }
    const worth = (t) => (b[t].toLowerCase() === 'k' ? 100 : VALUES[b[t].toLowerCase()]);
    return out.sort((x, y) => worth(x) - worth(y));
  }

  function kingSquare(pos, color) {
    return pos.board.findIndex((p) => p === (color === 'w' ? 'K' : 'k'));
  }

  function inCheck(pos, color = pos.side) {
    const k = kingSquare(pos, color);
    return k >= 0 && attacked(pos, k, other(color));
  }

  /** Moves that obey how the pieces move, before the king-safety check. */
  function pseudoMoves(pos) {
    const { board: b, side } = pos;
    const moves = [];
    const add = (from, to, extra = {}) => moves.push({ from, to, piece: b[from], captured: b[to] || null, ...extra });
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p || colorOf(p) !== side) continue;
      const t = p.toLowerCase();
      if (t === 'p') {
        const dir = side === 'w' ? 1 : -1;
        const startRank = side === 'w' ? 1 : 6;
        const lastRank = side === 'w' ? 7 : 0;
        const push = (from, to, extra) => {
          if ((to >> 3) === lastRank) for (const promo of 'qrbn') add(from, to, { ...extra, promo });
          else add(from, to, extra);
        };
        const one = step(s, 0, dir);
        if (one >= 0 && !b[one]) {
          push(s, one);
          const two = step(s, 0, 2 * dir);
          if ((s >> 3) === startRank && !b[two]) add(s, two, { double: true });
        }
        for (const df of [-1, 1]) {
          const c = step(s, df, dir);
          if (c < 0) continue;
          if (b[c] && colorOf(b[c]) !== side) push(s, c);
          else if (c === pos.ep) add(s, c, { enPassant: true, captured: side === 'w' ? 'p' : 'P' });
        }
      } else if (t === 'n' || t === 'k') {
        for (const [df, dr] of t === 'n' ? KNIGHT : KING) {
          const to = step(s, df, dr);
          if (to >= 0 && colorOf(b[to]) !== side) add(s, to);
        }
        if (t === 'k') {
          const rank = side === 'w' ? 0 : 56;
          const enemy = other(side);
          const rights = side === 'w' ? { k: 'K', q: 'Q' } : { k: 'k', q: 'q' };
          if (s === rank + 4 && !attacked(pos, s, enemy)) {
            if (pos.castling.includes(rights.k) && !b[rank + 5] && !b[rank + 6]
              && b[rank + 7] === (side === 'w' ? 'R' : 'r')
              && !attacked(pos, rank + 5, enemy) && !attacked(pos, rank + 6, enemy)) add(s, rank + 6, { castle: 'k' });
            if (pos.castling.includes(rights.q) && !b[rank + 3] && !b[rank + 2] && !b[rank + 1]
              && b[rank] === (side === 'w' ? 'R' : 'r')
              && !attacked(pos, rank + 3, enemy) && !attacked(pos, rank + 2, enemy)) add(s, rank + 2, { castle: 'q' });
          }
        }
      } else {
        const dirs = t === 'r' ? ROOK_DIRS : t === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
        for (const [df, dr] of dirs) {
          for (let to = step(s, df, dr); to >= 0; to = step(to, df, dr)) {
            if (b[to]) { if (colorOf(b[to]) !== side) add(s, to); break; }
            add(s, to);
          }
        }
      }
    }
    return moves;
  }

  function makeMove(pos, m) {
    const b = pos.board.slice();
    const side = pos.side;
    b[m.to] = m.promo ? (side === 'w' ? m.promo.toUpperCase() : m.promo) : b[m.from];
    b[m.from] = null;
    if (m.enPassant) b[m.to + (side === 'w' ? -8 : 8)] = null;
    if (m.castle) {
      const rank = side === 'w' ? 0 : 56;
      const [rf, rt] = m.castle === 'k' ? [rank + 7, rank + 5] : [rank, rank + 3];
      b[rt] = b[rf];
      b[rf] = null;
    }
    let castling = pos.castling;
    const strip = (chars) => { for (const c of chars) castling = castling.replace(c, ''); };
    for (const s of [m.from, m.to]) {
      if (s === 4) strip('KQ');
      if (s === 60) strip('kq');
      if (s === 0) strip('Q');
      if (s === 7) strip('K');
      if (s === 56) strip('q');
      if (s === 63) strip('k');
    }
    return { board: b, side: other(side), castling, ep: m.double ? (m.from + m.to) / 2 : -1 };
  }

  function legalMoves(pos) {
    return pseudoMoves(pos).filter((m) => !inCheck(makeMove(pos, m), pos.side));
  }

  function isCheckmate(pos) { return inCheck(pos) && legalMoves(pos).length === 0; }
  function isStalemate(pos) { return !inCheck(pos) && legalMoves(pos).length === 0; }

  /** Standard algebraic notation for a legal move in `pos`. */
  function san(pos, m) {
    let s;
    if (m.castle) s = m.castle === 'k' ? 'O-O' : 'O-O-O';
    else {
      const t = m.piece.toLowerCase();
      const capture = !!m.captured;
      if (t === 'p') {
        s = (capture ? `${FILES[m.from & 7]}x` : '') + sqName(m.to) + (m.promo ? `=${m.promo.toUpperCase()}` : '');
      } else {
        const rivals = legalMoves(pos).filter((o) => o.to === m.to && o.from !== m.from && o.piece === m.piece);
        let dis = '';
        if (rivals.length) {
          if (!rivals.some((o) => (o.from & 7) === (m.from & 7))) dis = FILES[m.from & 7];
          else if (!rivals.some((o) => (o.from >> 3) === (m.from >> 3))) dis = String((m.from >> 3) + 1);
          else dis = sqName(m.from);
        }
        s = t.toUpperCase() + dis + (capture ? 'x' : '') + sqName(m.to);
      }
    }
    const after = makeMove(pos, m);
    if (inCheck(after)) s += legalMoves(after).length ? '+' : '#';
    return s;
  }

  function perft(pos, depth) {
    if (depth === 0) return 1;
    const moves = legalMoves(pos);
    if (depth === 1) return moves.length;
    return moves.reduce((n, m) => n + perft(makeMove(pos, m), depth - 1), 0);
  }

  /** Squares a lone piece of type `t` on `s` reaches on an otherwise empty board. */
  function reach(t, s) {
    const pos = { board: Array(64).fill(null), side: 'w', castling: '', ep: -1 };
    pos.board[s] = t.toUpperCase();
    return pseudoMoves(pos).filter((m) => m.from === s && (!m.promo || m.promo === 'q')).map((m) => m.to);
  }

  /** "White: Kg1, Ra1, pawns f2 g2 h2" style description of a position. */
  function describe(pos) {
    const side = (c) => {
      const pieces = [];
      const pawns = [];
      pos.board.forEach((p, s) => {
        if (!p || colorOf(p) !== c) return;
        if (p.toLowerCase() === 'p') pawns.push(sqName(s));
        else pieces.push(p.toUpperCase() + sqName(s));
      });
      const order = 'KQRBN';
      pieces.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
      return pieces.join(', ') + (pawns.length ? `${pieces.length ? ', ' : ''}pawns ${pawns.join(' ')}` : '');
    };
    return `White: ${side('w')}. Black: ${side('b')}. ${pos.side === 'w' ? 'White' : 'Black'} to move.`;
  }


  /** A move as from-to squares, e.g. "e2e4" or "e7e8q": what the board sends. */
  function uci(m) {
    return sqName(m.from) + sqName(m.to) + (m.promo || '');
  }

  /**
   * The legal move a piece of text names in `pos`, or null.
   *
   * Takes from-to notation ("e2e4", "e7e8q", "uci:e2e4") or algebraic notation,
   * forgiving check and mate marks, "x", "=", "0-0" for "O-O" and "!?" marks.
   * Case matters where it decides the move — "Bxc3" is a bishop and "bxc3" a pawn —
   * so the only slip forgiven is a lower-case knight, rook, queen or king letter
   * ("nf3"); a "b" is never guessed at, because it names a file as well as a bishop.
   */
  function moveFromText(pos, text) {
    const raw = String(text == null ? '' : text).trim().replace(/^uci:/i, '');
    const legal = legalMoves(pos);
    const u = raw.toLowerCase().match(/^([a-h][1-8])-?([a-h][1-8])=?([qrbn])?$/);
    if (u) {
      const hit = legal.find((m) => sqName(m.from) === u[1] && sqName(m.to) === u[2] && (m.promo || '') === (u[3] || (m.promo ? 'q' : '')));
      if (hit) return hit;
    }
    // Long algebraic with the piece named: "Rd4-d1", "Nb1xc3", "Qd1-h5+". The piece
    // letter must be upper case and must be the piece standing on the first square.
    const long = raw.replace(/[+#!?]/g, '').match(/^([KQRBN])([a-h][1-8])[-x:]?([a-h][1-8])$/);
    if (long) {
      const hit = legal.find((m) => sqName(m.from) === long[2] && sqName(m.to) === long[3] && m.piece.toUpperCase() === long[1]);
      if (hit) return hit;
    }
    const clean = (s) => s.replace(/[+#!?]/g, '').replace(/0/g, 'O').replace(/[x=:]/g, '').replace(/e\.p\.?$/i, '').trim();
    const want = clean(raw);
    if (!want) return null;
    const named = legal.map((m) => ({ m, s: clean(san(pos, m)) }));
    const find = (w) => { const hit = named.filter((n) => n.s === w); return hit.length === 1 ? hit[0].m : null; };
    return find(want) || (/^[nrqk]/.test(want) ? find(want[0].toUpperCase() + want.slice(1)) : null);
  }

  /** "checkmate", "stalemate", "insufficient" or "playing", for the side to move. */
  function status(pos) {
    const moves = legalMoves(pos);
    if (!moves.length) return inCheck(pos) ? 'checkmate' : 'stalemate';
    const pieces = pos.board.filter(Boolean).map((p) => p.toLowerCase()).filter((p) => p !== 'k');
    if (!pieces.length || (pieces.length === 1 && (pieces[0] === 'b' || pieces[0] === 'n'))) return 'insufficient';
    return 'playing';
  }

  return {
    FILES, VALUES, NAMES, sqName, sqIndex, colorOf, other, parseFen, toFen, attacked, attackers, inCheck,
    pseudoMoves, legalMoves, makeMove, isCheckmate, isStalemate, san, perft, reach, describe, kingSquare,
    moveFromText, uci, status,
  };
});
