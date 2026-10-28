/**
 * Builds chess/drills.json: the new drill items the staged progression needs for its
 * gates (play-outs against perfect defence, K+P v K judgement, the square rule,
 * unannounced mate-or-not). Positions are generated from a fixed seed and every
 * answer is computed: endgames by our own retrograde tables (lib/endgame-tables.js),
 * mates by the app's perft-tested rules (content/chess-board.js, read only).
 *
 *   node curriculum-build/staged/skills/chess/build-drills.js
 *
 * verify-skill-curricula.js re-checks the written file from scratch.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../lib/endgame-tables');
const C = require('../../../../content/chess-board');

let seed = 20261023;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (n) => Math.floor(rnd() * n);

function fenOf(pieces, stm) {
  // pieces: { sq: 'K'|'Q'|'R'|'P'|'k'|'p' ... }
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = ''; let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = pieces[f + 8 * r];
      if (p) { if (empty) { row += empty; empty = 0; } row += p; } else empty++;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${stm === 0 ? 'w' : 'b'} - - 0 1`;
}

function main() {
  console.log('building endgame tables (about a minute)...');
  const kqk = E.buildKXK('Q');
  const krk = E.buildKXK('R');
  const kpk = E.buildKPK(kqk, krk);
  const drills = [];

  // A. Play-outs against perfect defence: K+Q v K and K+R v K, white to move, black king central-ish.
  for (const [tb, piece, count, minD] of [[kqk, 'Q', 5, 7], [krk, 'R', 5, 12]]) {
    let made = 0; let guard = 0;
    while (made < count && guard++ < 100000) {
      const wk = pick(64); const wx = pick(64); const bk = pick(64);
      const v = tb.value(wk, wx, bk, 0);
      if (v < minD) continue; // long, instructive starts only
      const fen = fenOf({ [wk]: 'K', [wx]: piece, [bk]: 'k' }, 0);
      if (drills.some((d) => d.fen === fen)) continue;
      drills.push({
        id: `ch-${piece === 'Q' ? 'kqk' : 'krk'}-${made + 1}`, type: 'playout_mate', stage: piece === 'Q' ? 'CH1' : 'CH2',
        lessons: piece === 'Q' ? ['C02 Queen and King Box Mate'] : ['C03 King and Rook Box Mate'],
        fen, side: 'w', goal: 'checkmate against perfect defence', dtm: v,
        stars: { three: v + 2, two: v + 6, one: 'any mate before the 50-move rule; stalemate or a lost piece fails' },
        defence: 'the tables: black always plays a move that delays mate longest',
      });
      made++;
    }
  }

  // B. K+P v K judgement: win or draw with the side to move. Kings near the pawn so each is instructive.
  const want = { win: 10, draw: 10 };
  const got = { win: 0, draw: 0 };
  let guard = 0;
  while ((got.win < want.win || got.draw < want.draw) && guard++ < 500000) {
    const p = 8 + pick(48); const wk = pick(64); const bk = pick(64); const stm = pick(2);
    if (!kpk.legal(wk, p, bk, stm)) continue;
    if (E.dist(wk, p) > 2 || E.dist(bk, p) > 3) continue;
    if (E.rank(p) < 2) continue; // pawn from the 3rd rank up
    const v = kpk.value(wk, p, bk, stm);
    const key = v === 1 ? 'win' : 'draw';
    if (got[key] >= want[key]) continue;
    // Not trivially lost pawn: black to move must not be able to take it at once.
    if (stm === 1 && E.adjacent(bk, p) && !E.adjacent(wk, p)) continue;
    const fen = fenOf({ [wk]: 'K', [p]: 'P', [bk]: 'k' }, stm);
    if (drills.some((d) => d.fen === fen)) continue;
    got[key]++;
    drills.push({ id: `ch-kpk-judge-${got.win + got.draw}`, type: 'kpk_judgement', stage: 'CH3', lessons: ['C04 Direct Opposition Between Kings', 'C05 Key Squares'], fen, side: stm === 0 ? 'w' : 'b', question: 'With best play, does White win or is it a draw?', answer: key });
  }

  // C. K+P v K play-outs: 4 wins (white to move, win) and 2 holds (black to move, draw).
  let w = 0; let h = 0; guard = 0;
  while ((w < 4 || h < 2) && guard++ < 500000) {
    const p = 8 + 8 * (1 + pick(3)) + 1 + pick(6); // b-g files, ranks 2-4
    const wk = pick(64); const bk = pick(64);
    if (E.dist(wk, p) > 2 || E.dist(bk, p) > 3) continue;
    if (w < 4 && kpk.legal(wk, p, bk, 0) && kpk.value(wk, p, bk, 0) === 1 && E.dist(bk, p) <= 2) {
      const fen = fenOf({ [wk]: 'K', [p]: 'P', [bk]: 'k' }, 0);
      drills.push({ id: `ch-kpk-win-${++w}`, type: 'playout_promote', stage: 'CH3', lessons: ['C05 Key Squares'], fen, side: 'w', goal: 'promote and keep the new queen (win) against perfect defence' });
    } else if (h < 2 && kpk.legal(wk, p, bk, 1) && kpk.value(wk, p, bk, 1) === 0 && E.dist(bk, p) <= 2 && !(E.adjacent(bk, p) && !E.adjacent(wk, p))) {
      const fen = fenOf({ [wk]: 'K', [p]: 'P', [bk]: 'k' }, 1);
      drills.push({ id: `ch-kpk-hold-${++h}`, type: 'playout_hold', stage: 'CH3', lessons: ['C04 Direct Opposition Between Kings'], fen, side: 'b', goal: 'draw as Black against perfect play (stop the pawn or reach K v K / stalemate)' });
    }
  }

  // D. The square rule: lone pawn, white king far away (a corner on the other wing), black to move.
  let s = 0; guard = 0;
  while (s < 6 && guard++ < 200000) {
    const p = 8 * (2 + pick(4)) + pick(8); // pawn on ranks 3-6
    const bk = pick(64);
    const wk = E.file(p) < 4 ? 7 : 0; // h1 or a1, far from the pawn's wing
    if (!kpk.legal(wk, p, bk, 1) || E.dist(wk, p) < 5) continue;
    if (E.rank(bk) <= E.rank(p)) continue; // black king ahead or level is the usual setting
    const toPromote = 7 - E.rank(p);
    // Black to move: inside the square, or able to step into it on this move.
    const inSquare = Math.max(Math.abs(E.file(bk) - E.file(p)), 7 - E.rank(bk)) - 1 <= toPromote;
    const v = kpk.value(wk, p, bk, 1);
    const fen = fenOf({ [wk]: 'K', [p]: 'P', [bk]: 'k' }, 1);
    drills.push({ id: `ch-square-${++s}`, type: 'square_rule', stage: 'CH3', lessons: ['C04 The Square of the Pawn'], fen, side: 'b', question: 'Black to move: can the black king catch the pawn?', answer: v === 0 ? 'yes' : 'no', rule_says: inSquare ? 'yes' : 'no', rule: 'black to move: the king catches the pawn if it is inside the square or can step into it on this move' });
  }

  // E. Unannounced mate-or-not (CH1): 10 positions with exactly one mating move, 5 with checks but no mate.
  let m = 0; let n = 0; guard = 0;
  while ((m < 10 || n < 5) && guard++ < 400000) {
    const pieces = {};
    const used = new Set();
    const put = (ch, avoidBackRank) => { let q; do { q = pick(64); } while (used.has(q) || (avoidBackRank && (q < 8 || q > 55))); used.add(q); pieces[q] = ch; };
    put('K'); put('k'); put(rnd() < 0.5 ? 'Q' : 'R');
    if (rnd() < 0.6) put('R');
    for (let i = 0; i < 1 + pick(3); i++) put('p', true);
    if (rnd() < 0.5) put('P', true);
    const fen = fenOf(pieces, 0);
    let pos;
    try { pos = C.parseFen(fen); } catch { continue; }
    if (C.inCheck(pos, 'b') || C.inCheck(pos, 'w')) continue;
    const kings = Object.entries(pieces).filter(([, c]) => c === 'K' || c === 'k').map(([q]) => Number(q));
    if (E.adjacent(kings[0], kings[1])) continue;
    const moves = C.legalMoves(pos);
    if (!moves.length) continue;
    const mates = moves.filter((mv) => C.isCheckmate(C.makeMove(pos, mv))).map((mv) => C.san(pos, mv));
    const checks = moves.filter((mv) => C.inCheck(C.makeMove(pos, mv))).length;
    const blackReplies = C.legalMoves({ ...pos, side: 'b' }).length;
    if (blackReplies < 2) continue;
    if (mates.length === 1 && m < 10) {
      drills.push({ id: `ch-mate-or-not-${m + n + 1}`, type: 'mate_or_not', stage: 'CH1', lessons: ['C02 Find the Mate in One'], fen, side: 'w', question: 'Is there a checkmate in one move? Play it, or answer "no mate".', answer: mates[0] });
      m++;
    } else if (!mates.length && checks >= 2 && n < 5) {
      drills.push({ id: `ch-mate-or-not-${m + n + 1}`, type: 'mate_or_not', stage: 'CH1', lessons: ['C02 Find the Mate in One'], fen, side: 'w', question: 'Is there a checkmate in one move? Play it, or answer "no mate".', answer: 'no mate' });
      n++;
    }
  }

  const out = {
    subject: 'chess', version: 1, status: 'STAGED', generated_by: 'chess/build-drills.js (seed 20261023)',
    doc: 'New drill items for the staged chess progression gates. Every answer was computed (tables or the perft-tested rules) and is re-checked by verify-skill-curricula.js. Types: playout_mate (stars from the distance to mate), kpk_judgement, playout_promote, playout_hold, square_rule, mate_or_not (unannounced, includes positions with no mate).',
    specs: [
      { type: 'coordinates_race', stage: 'CH0-CH2', rule: 'Name or tap the square the coach calls; 30 s rounds; timer off by default for ages 4-7. Squares and colours computed (a1 dark, h1 light; colour = (file + rank) odd -> light).', gate: 'none (fluency practice)' },
      { type: 'visualisation_ladder', stage: 'CH2-CH7', rule: 'Square colour without a board -> knight path length between two squares -> pieces vanish after N seconds, answer the move -> follow a 2-6 ply notation line, answer about the final position. Each rung passes at 80% before the next opens.', gate: 'practice; rung reached is a scorecard signal, not a stage gate' },
      { type: 'blunder_check', stage: 'CH2-CH6', rule: 'Shown a candidate move, the learner names the opponent\'s best reply before committing; positions where the natural move loses material to a 1-2 move reply. Needs engine verification (Leorik/Stockfish server side): the natural move must lose >= 1.5 pawns and the safe alternative must not.', gate: 'part of the tactics_unannounced sets' },
      { type: 'unannounced_set', stage: 'CH2+', rule: 'Mixed motifs, no theme shown, ~1 in 5 positions with nothing to win (answer: a safe developing move accepted within 0.5 pawns of the engine best, or "nothing").', gate: 'tactics_unannounced' },
    ],
    drills,
  };
  fs.writeFileSync(path.join(__dirname, 'drills.json'), JSON.stringify(out, null, 1));
  console.log(`wrote ${drills.length} drills`, drills.reduce((a, d) => { a[d.type] = (a[d.type] || 0) + 1; return a; }, {}));
}

main();
