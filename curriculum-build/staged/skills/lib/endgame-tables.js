/**
 * Small retrograde endgame tables, written from scratch for the staged skill
 * curricula (curriculum-build/staged/skills). They exist to CHECK facts and drill
 * positions independently of the app's own chess code: nothing here is imported
 * from content/chess-* or public/engine/chess/*.
 *
 *   KQK, KRK  white king + queen (or rook) against a lone black king:
 *             distance to mate (DTM) in white moves for every legal position.
 *   KPK       white king + pawn against a lone black king: win or draw, and the
 *             number of white moves to a won promotion is not needed, only the result.
 *
 * Squares are 0..63, a1 = 0, b1 = 1, ..., h8 = 63 (file = s & 7, rank = s >> 3).
 * Ply rules used: no 50-move rule (the tables give the true game-theoretic value),
 * a black king capturing the lone piece or pawn is a draw (K v K).
 */
'use strict';

const FILES = 'abcdefgh';
const sq = (name) => FILES.indexOf(name[0]) + 8 * (Number(name[1]) - 1);
const name = (s) => FILES[s & 7] + ((s >> 3) + 1);
const file = (s) => s & 7;
const rank = (s) => s >> 3;
const dist = (a, b) => Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)));
const adjacent = (a, b) => a !== b && dist(a, b) === 1;

const KING_STEPS = [];
for (let s = 0; s < 64; s++) {
  const out = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const f = file(s) + df; const r = rank(s) + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) out.push(f + 8 * r);
  }
  KING_STEPS.push(out);
}
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Squares a slider on `from` reaches, stopping at (and including) the first occupied square in `occ`. */
function slides(from, dirs, occ) {
  const out = [];
  for (const [df, dr] of dirs) {
    let f = file(from) + df; let r = rank(from) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const t = f + 8 * r;
      out.push(t);
      if (occ.has(t)) break;
      f += df; r += dr;
    }
  }
  return out;
}

function pieceDirs(piece) { return piece === 'Q' ? ROOK_DIRS.concat(BISHOP_DIRS) : ROOK_DIRS; }

/** Does a white slider on x attack t, with blockers occ (t itself may be occupied)? */
function sliderAttacks(piece, x, t, occ) { return slides(x, pieceDirs(piece), occ).includes(t); }

/**
 * KQK / KRK distance-to-mate table.
 * index = ((wk * 64 + wx) * 64 + bk) * 2 + stm, stm 0 = white to move, 1 = black.
 * value: -2 illegal, -1 draw (or not yet known = draw at the end), d >= 0:
 *   white to move: white mates in d moves; black to move: black is mated in d white moves (0 = mated now).
 */
function buildKXK(piece) {
  const N = 64 * 64 * 64 * 2;
  const T = new Int16Array(N).fill(-1);
  const idx = (wk, wx, bk, stm) => ((wk * 64 + wx) * 64 + bk) * 2 + stm;

  const blackMoves = (wk, wx, bk) => {
    // Squares the black king may go to, and whether it may capture the piece.
    const res = []; let capture = false;
    for (const t of KING_STEPS[bk]) {
      if (t === wk || adjacent(t, wk)) continue;
      if (t === wx) { if (!adjacent(wx, wk)) capture = true; continue; }
      const occ = new Set([wk]); // the black king has left bk
      if (sliderAttacks(piece, wx, t, occ)) continue;
      res.push(t);
    }
    return { res, capture };
  };
  const inCheck = (wk, wx, bk) => sliderAttacks(piece, wx, bk, new Set([wk]));
  const whiteMoves = (wk, wx, bk) => {
    const out = [];
    for (const t of KING_STEPS[wk]) if (t !== wx && t !== bk && !adjacent(t, bk)) out.push([t, wx]);
    for (const t of slides(wx, pieceDirs(piece), new Set([wk, bk]))) if (t !== wk && t !== bk) out.push([wk, t]);
    return out;
  };

  // Legality and terminal positions.
  for (let wk = 0; wk < 64; wk++) for (let wx = 0; wx < 64; wx++) for (let bk = 0; bk < 64; bk++) {
    if (wk === wx || wk === bk || wx === bk || adjacent(wk, bk)) { T[idx(wk, wx, bk, 0)] = -2; T[idx(wk, wx, bk, 1)] = -2; continue; }
    if (inCheck(wk, wx, bk)) T[idx(wk, wx, bk, 0)] = -2; // black in check with white to move: illegal
    const { res, capture } = blackMoves(wk, wx, bk);
    if (!res.length && !capture && inCheck(wk, wx, bk)) T[idx(wk, wx, bk, 1)] = 0; // mated
  }
  // Retrograde by plain iteration (small enough to sweep).
  for (let d = 1; d < 64; d++) {
    let changed = false;
    // White mates in d: some move reaches a black-to-move position mated in d-1.
    for (let wk = 0; wk < 64; wk++) for (let wx = 0; wx < 64; wx++) for (let bk = 0; bk < 64; bk++) {
      const i = idx(wk, wx, bk, 0);
      if (T[i] !== -1) continue;
      for (const [nk, nx] of whiteMoves(wk, wx, bk)) {
        if (T[idx(nk, nx, bk, 1)] === d - 1) { T[i] = d; changed = true; break; }
      }
    }
    // Black mated in d: every move leads to a white win in <= d, the longest exactly d, and no escape by capture.
    for (let wk = 0; wk < 64; wk++) for (let wx = 0; wx < 64; wx++) for (let bk = 0; bk < 64; bk++) {
      const i = idx(wk, wx, bk, 1);
      if (T[i] !== -1) continue;
      const { res, capture } = blackMoves(wk, wx, bk);
      if (capture || !res.length) continue; // capture draws; no moves and not mated = stalemate
      let worst = -1; let ok = true;
      for (const t of res) {
        const v = T[idx(wk, wx, t, 0)];
        if (v < 0 || v > d) { ok = false; break; }
        if (v > worst) worst = v;
      }
      if (ok && worst === d) { T[i] = d; changed = true; }
    }
    if (!changed) break;
  }
  return {
    piece,
    value(wk, wx, bk, stm) { return T[idx(wk, wx, bk, stm)]; },
    blackMoves, whiteMoves, inCheck,
    stats() {
      let maxW = -1; let at = null; let wins = 0; let draws = 0; let legal = 0;
      for (let wk = 0; wk < 64; wk++) for (let wx = 0; wx < 64; wx++) for (let bk = 0; bk < 64; bk++) {
        const v = T[idx(wk, wx, bk, 0)];
        if (v === -2) continue;
        legal++;
        if (v >= 0) { wins++; if (v > maxW) { maxW = v; at = [wk, wx, bk]; } } else draws++;
      }
      return { legalWhiteToMove: legal, wins, draws, maxDTM: maxW, longest: at && { wk: name(at[0]), [piece.toLowerCase()]: name(at[1]), bk: name(at[2]) } };
    },
  };
}

/**
 * KPK win/draw table. index = ((wk * 64 + p) * 64 + bk) * 2 + stm. Pawn on ranks 2-7.
 * value: -2 illegal, 0 draw, 1 white wins.
 */
function buildKPK(kqk, krk) {
  const N = 64 * 64 * 64 * 2;
  const T = new Int8Array(N).fill(0);
  const idx = (wk, p, bk, stm) => ((wk * 64 + p) * 64 + bk) * 2 + stm;
  const pawnAttacks = (p) => [p + 7, p + 9].filter((t) => t < 64 && Math.abs(file(t) - file(p)) === 1);
  const blackMoves = (wk, p, bk) => {
    const res = []; let capture = false;
    for (const t of KING_STEPS[bk]) {
      if (t === wk || adjacent(t, wk)) continue;
      if (pawnAttacks(p).includes(t)) continue;
      if (t === p) { if (!adjacent(p, wk)) capture = true; continue; }
      res.push(t);
    }
    return { res, capture };
  };
  const legal = (wk, p, bk, stm) => {
    if (rank(p) < 1 || rank(p) > 6) return false;
    if (wk === p || wk === bk || p === bk || adjacent(wk, bk)) return false;
    if (stm === 0 && pawnAttacks(p).includes(bk)) return false; // black in check, white to move
    return true;
  };
  // A white move that promotes wins if the resulting K+Q (or K+R) v K position, black to move, is a win for white.
  const promotes = (wk, to, bk) => {
    for (const tb of [kqk, krk]) { const v = tb.value(wk, to, bk, 1); if (v >= 0) return true; }
    return false;
  };
  const whiteMoves = (wk, p, bk) => {
    const out = [];
    for (const t of KING_STEPS[wk]) if (t !== p && t !== bk && !adjacent(t, bk)) out.push({ wk: t, p });
    const one = p + 8;
    if (one !== bk && one !== wk) {
      if (rank(one) === 7) out.push({ wk, p: one, promo: true });
      else {
        out.push({ wk, p: one });
        const two = p + 16;
        if (rank(p) === 1 && two !== bk && two !== wk) out.push({ wk, p: two });
      }
    }
    return out;
  };
  for (let wk = 0; wk < 64; wk++) for (let p = 8; p < 56; p++) for (let bk = 0; bk < 64; bk++) {
    for (const stm of [0, 1]) if (!legal(wk, p, bk, stm)) T[idx(wk, p, bk, stm)] = -2;
  }
  for (let pass = 0; pass < 200; pass++) {
    let changed = false;
    for (let wk = 0; wk < 64; wk++) for (let p = 8; p < 56; p++) for (let bk = 0; bk < 64; bk++) {
      const iw = idx(wk, p, bk, 0);
      if (T[iw] === 0) {
        for (const m of whiteMoves(wk, p, bk)) {
          const win = m.promo ? promotes(m.wk, m.p, bk) : T[idx(m.wk, m.p, bk, 1)] === 1;
          if (win) { T[iw] = 1; changed = true; break; }
        }
      }
      const ib = idx(wk, p, bk, 1);
      if (T[ib] === 0) {
        const { res, capture } = blackMoves(wk, p, bk);
        if (!capture && res.length && res.every((t) => T[idx(wk, p, t, 0)] === 1)) { T[ib] = 1; changed = true; }
      }
    }
    if (!changed) break;
  }
  return {
    value(wk, p, bk, stm) { return T[idx(wk, p, bk, stm)]; },
    legal, pawnAttacks,
  };
}

module.exports = { buildKXK, buildKPK, sq, name, file, rank, dist, adjacent, KING_STEPS };
