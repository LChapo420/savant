/**
 * Chess items: the deterministic fallback for the chess track.
 *
 * The board skills are computed with the move generator in chess-board.js, so the
 * answer key is worked out rather than written: mate in one is checked to be mate,
 * a fork is checked to hit two pieces from a safe square, a hanging piece is
 * checked to be free. Positions are given as piece lists ("White: Kg1, Ra1"),
 * which is how text chess books set a position without a diagram.
 *
 * The idea skills (strategy, openings, practical play, history, the professional
 * domains, engines and theory) come from authored pools, kept to facts that are
 * settled; the AI-written levels carry the rest of each lesson.
 */
const C = require('./chess-board');
const { fromPool } = require('./pool');

const item = (o) => ({ source: 'bank', ...o });
const { FILES, NAMES, VALUES, sqName } = C;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const strip = (san) => san.replace(/[+#]$/, '');
const sanAccepts = (sans) => [...new Set(sans.flatMap((s) => [s, strip(s)]))];

/** A random empty square that is not in `used`. */
function freeSquare(rng, used, ok = () => true) {
  for (let i = 0; i < 200; i++) {
    const s = rng.int(0, 63);
    if (!used.has(s) && ok(s)) { used.add(s); return s; }
  }
  return -1;
}

const kingsApart = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3))) > 1;
const emptyPos = () => ({ board: Array(64).fill(null), side: 'w', castling: '', ep: -1 });

/** A position is usable when kings are apart and the side not to move is not in check. */
function legalSetup(pos) {
  const wk = C.kingSquare(pos, 'w');
  const bk = C.kingSquare(pos, 'b');
  if (wk < 0 || bk < 0 || !kingsApart(wk, bk)) return false;
  if (C.inCheck(pos, C.other(pos.side))) return false;
  return pos.board.every((p, s) => !p || p.toLowerCase() !== 'p' || ((s >> 3) > 0 && (s >> 3) < 7));
}

// ── Board, squares and moves ─────────────────────────────────────────────
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const G = {
  chess_board(rng, d) {
    const kind = rng.pick(d <= 3 ? ['color', 'start'] : ['color', 'start', 'between']);
    if (kind === 'color') {
      const s = rng.int(0, 63);
      const dark = ((s & 7) + (s >> 3)) % 2 === 0;
      return item({
        format: 'multiple_choice', prompt: `What colour is the square ${sqName(s)}?`, choices: ['Dark', 'Light'],
        answer: dark ? 'Dark' : 'Light',
        rationale: `a1 is dark, and colours alternate along every rank and file, so ${sqName(s)} is ${dark ? 'dark' : 'light'}. A light square is always in each player's bottom-right corner (h1 for White).`,
      });
    }
    if (kind === 'start') {
      const pos = C.parseFen(START);
      const filled = pos.board.map((p, s) => (p ? s : -1)).filter((s) => s >= 0 && (s >> 3) !== 1 && (s >> 3) !== 6);
      const s = rng.pick(filled);
      const p = pos.board[s];
      const answer = `${C.colorOf(p) === 'w' ? 'White' : 'Black'} ${NAMES[p.toLowerCase()]}`;
      // Shuffled: the bank keeps the order it is given, and the key must not always be first.
      const choices = rng.shuffle([answer, ...rng.sample(['White king', 'White queen', 'Black king', 'Black queen', 'White bishop', 'Black knight', 'White rook', 'Black bishop'].filter((x) => x !== answer), 3)]);
      return item({
        format: 'multiple_choice', prompt: `In the starting position, which piece stands on ${sqName(s)}?`, choices, answer,
        rationale: 'Rooks go in the corners, knights beside them, then bishops; the queen goes on her own colour (d1 for White, d8 for Black) and the king next to her.',
      });
    }
    const a = rng.int(0, 63);
    let b = rng.int(0, 63);
    while (b === a) b = rng.int(0, 63);
    const files = Math.abs((a & 7) - (b & 7));
    const ranks = Math.abs((a >> 3) - (b >> 3));
    const kingSteps = Math.max(files, ranks);
    return item({
      format: 'type_in', prompt: `How many moves does a king need to walk from ${sqName(a)} to ${sqName(b)} on an empty board?`,
      answer: String(kingSteps),
      rationale: `The king can move diagonally, so it needs as many moves as the larger of the file distance (${files}) and rank distance (${ranks}): ${kingSteps}.`,
    });
  },

  chess_moves(rng, d) {
    const t = rng.pick(d <= 3 ? ['r', 'b', 'n', 'k'] : ['r', 'b', 'n', 'q', 'k']);
    const s = rng.int(0, 63);
    const n = C.reach(t, s).length;
    if (d >= 5 && rng.next() < 0.5) {
      // Blockers: a piece of each colour on the board, and the question is which squares are reachable.
      const pos = emptyPos();
      pos.board[s] = t.toUpperCase();
      const used = new Set([s]);
      const own = freeSquare(rng, used);
      const foe = freeSquare(rng, used);
      pos.board[own] = 'P';
      pos.board[foe] = rng.pick(['n', 'b', 'r']);
      if ((own >> 3) === 0 || (own >> 3) === 7) pos.board[own] = 'N';
      // Legal moves, not just how the piece moves: a king may not step onto a square
      // the black piece attacks, so counting its pseudo-moves over-counted.
      const count = C.legalMoves(pos).filter((m) => m.from === s).length;
      return item({
        format: 'type_in',
        prompt: `A white ${NAMES[t]} stands on ${sqName(s)}. A white ${NAMES[pos.board[own].toLowerCase()]} is on ${sqName(own)} and a black ${NAMES[pos.board[foe]]} on ${sqName(foe)}. Nothing else is on the board. How many moves does the ${NAMES[t]} have?`,
        answer: String(count),
        rationale: t === 'k'
          ? `The king steps one square any way, but not onto its own piece and not onto a square the black ${NAMES[pos.board[foe]]} attacks (it may capture the ${NAMES[pos.board[foe]]} itself, since nothing defends it). That leaves ${count}.`
          : `Count each line the ${NAMES[t]} can travel: it stops before its own piece, and it may capture the enemy piece but go no further. That gives ${count}.`,
      });
    }
    return item({
      format: 'type_in', prompt: `On an empty board, how many squares can a ${NAMES[t]} on ${sqName(s)} move to?`,
      answer: String(n),
      rationale: `${cap(NAMES[t])}s reach fewer squares near the edge and corners. From ${sqName(s)} it reaches ${n}: ${C.reach(t, s).map(sqName).join(', ')}.`,
    });
  },

  chess_notation(rng, d) {
    for (let tries = 0; tries < 60; tries++) {
      const pos = randomMiddlegame(rng, d);
      if (!pos) continue;
      const moves = C.legalMoves(pos).filter((m) => m.piece.toLowerCase() !== 'k' || !m.castle);
      if (!moves.length) continue;
      const pref = moves.filter((m) => (d >= 5 ? m.captured || C.inCheck(C.makeMove(pos, m)) : true));
      const m = rng.pick(pref.length ? pref : moves);
      const after = C.makeMove(pos, m);
      const san = C.san(pos, m);
      // The grader forgives case, so a key like Bxc3 would also pass "bxc3", which is
      // a different move when a b-pawn can take on c3 too. Such positions are skipped.
      if (C.legalMoves(pos).some((o) => C.uci(o) !== C.uci(m) && C.san(pos, o).toLowerCase() === san.toLowerCase())) continue;
      const what = `The ${pos.side === 'w' ? 'white' : 'black'} ${NAMES[m.piece.toLowerCase()]} on ${sqName(m.from)} `
        + `${m.captured ? `captures the ${NAMES[m.captured.toLowerCase()]} on ${sqName(m.to)}` : `moves to ${sqName(m.to)}`}`
        + `${m.promo ? ` and promotes to a ${NAMES[m.promo]}` : ''}`
        + `${C.inCheck(after) ? (C.legalMoves(after).length ? ', giving check' : ', giving checkmate') : ''}.`;
      return item({
        format: 'type_in', prompt: `${C.describe(pos)}\n${what} Write the move in algebraic notation.`,
        answer: san,
        rationale: 'Piece letter (none for a pawn), an x for a capture (a pawn capture starts with its file), the arrival square, then + for check or # for mate. Add the starting file or rank only when two identical pieces could reach the square.',
      });
    }
    return G.chess_board(rng, d);
  },

  chess_material(rng, d) {
    const pick = () => rng.pick(['q', 'r', 'r', 'b', 'n', 'p', 'p', 'p']);
    const side = (n) => Array.from({ length: n }, pick);
    const a = side(rng.int(1, d <= 4 ? 2 : 4));
    const b = side(rng.int(1, d <= 4 ? 2 : 4));
    const sum = (xs) => xs.reduce((s, x) => s + VALUES[x], 0);
    // "a rook and two pawns", not "rook and pawn and pawn".
    const COUNT = ['', 'a', 'two', 'three', 'four'];
    const say = (xs) => {
      const parts = ['q', 'r', 'b', 'n', 'p'].filter((k) => xs.includes(k)).map((k) => {
        const n = xs.filter((x) => x === k).length;
        return `${COUNT[n]} ${NAMES[k]}${n > 1 ? 's' : ''}`;
      });
      return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    };
    const diff = sum(a) - sum(b);
    const answer = diff === 0 ? 'Equal' : diff > 0 ? 'White' : 'Black';
    return item({
      format: 'multiple_choice',
      prompt: `In a trade, White gives up ${say(b)}, and Black gives up ${say(a)}. Using the usual values (pawn 1, knight 3, bishop 3, rook 5, queen 9), who comes out ahead?`,
      choices: ['White', 'Black', 'Equal'], answer,
      rationale: `White wins ${sum(a)} point${sum(a) === 1 ? '' : 's'} and loses ${sum(b)}. ${diff === 0 ? 'The trade is even' : `${answer} gains ${Math.abs(diff)}`}. Values are a guide: position can matter more.`,
    });
  },

  chess_mate(rng, d) {
    for (let tries = 0; tries < 400; tries++) {
      const pos = mateSetup(rng, d);
      if (!pos || !legalSetup(pos) || C.inCheck(pos, 'w')) continue;
      const mates = C.legalMoves(pos).filter((m) => C.isCheckmate(C.makeMove(pos, m)));
      if (mates.length < 1 || mates.length > 2) continue;
      const sans = mates.map((m) => C.san(pos, m));
      return item({
        fen: C.toFen(pos), format: 'type_in', prompt: `${C.describe(pos)}\nFind checkmate in one move (algebraic notation).`,
        answer: sans[0], accepts: sanAccepts(sans),
        rationale: `${sans.join(' or ')} gives check, and the black king has no square to go to, no piece can block, and nothing can capture the checking piece.`,
      });
    }
    return G.chess_board(rng, d);
  },

  /**
   * Served from the pre-built, Stockfish-checked pool (content/chess-tactics-pool.js,
   * scripts/chess-tactics-pool-build.js): building one live takes about 0.5 s of
   * synchronous search, which would stall the server. Items this learner met
   * recently (ctx.seenShapes holds their item keys) or earlier in this draw
   * (ctx.avoid) are skipped; when nothing is left at this difficulty the item is
   * built live and the fallback is logged. CHESS_TACTICS_POOL=off forces live.
   */
  chess_tactics(rng, d, ctx = {}) {
    if (TACTICS_POOL && process.env.CHESS_TACTICS_POOL !== 'off') {
      const band = Math.max(1, Math.min(10, Math.round(d)));
      const seen = (it) => {
        const k = `${it.prompt.trim()}||${String(it.answer).trim()}`;
        return (ctx.avoid && ctx.avoid.has(k)) || (ctx.seenShapes && ctx.seenShapes.has(k));
      };
      const fresh = (TACTICS_POOL[band] || []).filter((it) => !seen(it));
      if (fresh.length) {
        POOL_STATS.served++;
        return JSON.parse(JSON.stringify(rng.pick(fresh)));
      }
      POOL_STATS.fallback++;
      console.warn(`[chess-tactics] pool exhausted at difficulty ${band} for this learner; building one live (about 0.5 s)`);
    }
    return liveTactics(rng, d);
  },

  chess_endgame(rng, d) {
    return d <= 5 || rng.next() < 0.5 ? squareRule(rng, d) : mateOrStalemate(rng, d);
  },
};

/** A tactics item built live: a hanging piece, or (from difficulty 5) a knight fork. */
function liveTactics(rng, d) {
  return d <= 4 || rng.next() < 0.4 ? hangingPiece(rng, d) : knightFork(rng, d);
}

let TACTICS_POOL = null;
try { TACTICS_POOL = require('./chess-tactics-pool'); } catch { /* not built yet: items are built live */ }
const POOL_STATS = { served: 0, fallback: 0 };

// ── Position builders ────────────────────────────────────────────────────
function randomMiddlegame(rng, d) {
  const pos = emptyPos();
  const used = new Set();
  pos.board[freeSquare(rng, used, (s) => (s >> 3) <= 1)] = 'K';
  pos.board[freeSquare(rng, used, (s) => (s >> 3) >= 6)] = 'k';
  const count = d <= 4 ? 4 : 7;
  for (let i = 0; i < count; i++) {
    const p = rng.pick(['Q', 'R', 'B', 'N', 'P', 'P', 'q', 'r', 'b', 'n', 'p', 'p']);
    const s = freeSquare(rng, used, (x) => (p.toLowerCase() !== 'p') || ((x >> 3) > 0 && (x >> 3) < 7));
    if (s >= 0) pos.board[s] = p;
  }
  pos.side = rng.next() < 0.7 ? 'w' : 'b';
  return legalSetup(pos) && !C.inCheck(pos, pos.side) ? pos : null;
}

function mateSetup(rng, d) {
  const pos = emptyPos();
  const used = new Set();
  // Black king on the edge, usually with its own pawns in front.
  const corner = rng.next() < 0.5;
  const bk = corner ? rng.pick([56, 57, 62, 63]) : rng.int(57, 62);
  pos.board[bk] = 'k';
  used.add(bk);
  if (rng.next() < 0.7) {
    for (const df of [-1, 0, 1]) {
      const f = (bk & 7) + df;
      const s = 48 + f;
      if (f >= 0 && f <= 7 && rng.next() < 0.8 && !used.has(s)) { pos.board[s] = 'p'; used.add(s); }
    }
  }
  pos.board[freeSquare(rng, used)] = 'K';
  const attackers = d <= 3 ? [rng.pick(['Q', 'R'])] : d <= 6 ? rng.sample(['Q', 'R', 'R', 'B', 'N'], 2) : rng.sample(['Q', 'R', 'B', 'N', 'N', 'B'], 3);
  for (const p of attackers) pos.board[freeSquare(rng, used)] = p;
  if (d >= 6) for (const p of rng.sample(['r', 'b', 'n'], 1)) pos.board[freeSquare(rng, used, (s) => (s >> 3) >= 4)] = p;
  return pos;
}

// ── Material search ──────────────────────────────────────────────────────
// "Wins material" is a claim about every defence, not about the square the capture
// lands on: a capture of a loose piece can still walk into a mate or leave something
// bigger hanging, and a fork can be met by a check. So the claim is searched.
const balance = (pos, side) => pos.board.reduce((s, p) => (p ? s + (C.colorOf(p) === side ? 1 : -1) * VALUES[p.toLowerCase()] : s), 0);

/** Material negamax: `depth` plies of every move, then captures (every reply while in check). */
function materialSearch(pos, depth, alpha, beta, ply) {
  const moves = C.legalMoves(pos);
  if (!moves.length) return C.inCheck(pos) ? -1000 + ply : 0;
  const check = C.inCheck(pos);
  if (depth <= 0) {
    const stand = balance(pos, pos.side);
    if (depth < -6) return stand;
    if (!check) {
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
    }
  }
  const list = depth > 0 || check ? moves : moves.filter((m) => m.captured || m.promo);
  for (const m of list) {
    const v = -materialSearch(C.makeMove(pos, m), depth - 1, -beta, -alpha, ply + 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

/** Points the side to move wins with `m` against the best defence, `depth` plies deep (m included). */
function gainOf(pos, m, depth = 3) {
  return -materialSearch(C.makeMove(pos, m), depth - 1, -Infinity, Infinity, 1) - balance(pos, pos.side);
}

/** Does Black have a mate in one, or in two (a check White cannot meet without being mated), after `m`? */
function mateThreatAfter(pos, m) {
  const after = C.makeMove(pos, m);
  for (const r of C.legalMoves(after)) {
    const p2 = C.makeMove(after, r);
    if (C.isCheckmate(p2)) return true;
    // A checking reply after which every White answer allows mate in one.
    if (!C.inCheck(p2)) continue;
    const answers = C.legalMoves(p2);
    if (answers.every((a) => { const p3 = C.makeMove(p2, a); return C.legalMoves(p3).some((x) => C.isCheckmate(C.makeMove(p3, x))); })) return true;
  }
  return false;
}

function hangingPiece(rng, d) {
  for (let tries = 0; tries < 300; tries++) {
    const pos = randomMiddlegame(rng, d);
    if (!pos || pos.side !== 'w') continue;
    const captures = C.legalMoves(pos).filter((m) => m.captured);
    // A cheap first look: one piece worth 3 or more that is loose, or worth more than its taker.
    const looks = captures.filter((m) => VALUES[m.captured.toLowerCase()] >= 3
      && (!C.attacked(C.makeMove(pos, m), m.to, 'b') || VALUES[m.captured.toLowerCase()] > VALUES[m.piece.toLowerCase()]));
    if (looks.length !== 1) continue;
    // Then the search: that capture must win at least two points against every
    // defence, and no other capture may win anything, or the prompt's "one capture"
    // is false and a second right answer would be marked wrong.
    const winners = captures.filter((m) => gainOf(pos, m) >= 1);
    if (winners.length !== 1 || winners[0] !== looks[0] || gainOf(pos, looks[0]) < 2) continue;
    // The capture must change the game, and be the only good move (rules from the
    // Stockfish re-check, scripts/chess-engine-verify.js, which found lost
    // positions and positions so won that a second capture also mated):
    //   - not already far ahead (at most +4 before), and ahead after it (+2 or more);
    //   - Black has no mate in one after the capture and the best defence;
    //   - no other capture gives check, so no second forcing win hides behind it.
    const before = balance(pos, 'w');
    const won = gainOf(pos, looks[0]);
    if (before > 4 || before + won < 2) continue;
    if (captures.some((x) => x !== looks[0] && C.inCheck(C.makeMove(pos, x)))) continue;
    if (mateThreatAfter(pos, looks[0])) continue;
    const m = looks[0];
    const san = C.san(pos, m);
    const free = !C.attacked(C.makeMove(pos, m), m.to, 'b');
    return item({
      fen: C.toFen(pos), format: 'type_in', prompt: `${C.describe(pos)}\nOne capture wins material. Find it (algebraic notation).`,
      answer: san, accepts: sanAccepts([san]),
      rationale: free
        ? `${san} takes the ${NAMES[m.captured.toLowerCase()]} for free: nothing black can recapture on ${sqName(m.to)}. Before every move, check which enemy pieces are loose.`
        : `${san} trades your ${NAMES[m.piece.toLowerCase()]} (${VALUES[m.piece.toLowerCase()]}) for a ${NAMES[m.captured.toLowerCase()]} (${VALUES[m.captured.toLowerCase()]}), winning material even if Black recaptures.`,
    });
  }
  return G.chess_board(rng, d);
}

function knightFork(rng, d) {
  for (let tries = 0; tries < 2000; tries++) {
    const pos = emptyPos();
    const used = new Set();
    pos.board[freeSquare(rng, used, (s) => (s >> 3) <= 2)] = 'K';
    pos.board[freeSquare(rng, used)] = 'N';
    pos.board[freeSquare(rng, used, (s) => (s >> 3) >= 3)] = 'k';
    pos.board[freeSquare(rng, used, (s) => (s >> 3) >= 3)] = rng.pick(['q', 'r']);
    if (d >= 6) {
      // A second black piece, matched by one for White, so the fork still decides it.
      const extra = rng.pick(['r', 'b']);
      pos.board[freeSquare(rng, used, (s) => (s >> 3) >= 3)] = extra;
      pos.board[freeSquare(rng, used, (s) => (s >> 3) <= 1)] = extra.toUpperCase();
    }
    // Pawns on both sides, so the piece the fork wins decides the game. With bare
    // kings, king and knight against king is a draw and the fork changes nothing
    // (found by the Stockfish re-check).
    for (let k = 0; k < 3; k++) pos.board[freeSquare(rng, used, (s) => (s >> 3) === 1 || (s >> 3) === 2)] = 'P';
    for (let k = 0; k < 2; k++) pos.board[freeSquare(rng, used, (s) => (s >> 3) === 6)] = 'p';
    if (!legalSetup(pos)) continue;
    const targetsOf = (m) => {
      const after = C.makeMove(pos, m);
      return C.reach('n', m.to).map((s) => after.board[s]).filter((p) => p && 'kqr'.includes(p));
    };
    // Every knight move that hits two of king, queen and rook is a fork; the one the
    // learner is asked for must be the only one that wins material against every
    // defence (a fork can be met by a check, or by one piece guarding the other).
    const forks = C.legalMoves(pos).filter((m) => m.piece === 'N' && targetsOf(m).length >= 2);
    const winning = forks.filter((m) => gainOf(pos, m) >= 2);
    if (winning.length !== 1) continue;
    const fork = winning[0];
    if (fork.captured || C.attacked(C.makeMove(pos, fork), fork.to, 'b')) continue;
    // The fork must turn the game: White not ahead before it (+1 at most), ahead
    // by 3 or more after it, and no other move about as good (only the fork wins
    // material, checked above), and no mate for Black hiding behind it.
    const before = balance(pos, 'w');
    if (before > 1 || before + gainOf(pos, fork) < 3) continue;
    // Looked at two plies deeper, the material must stay won (Black can sometimes
    // take enough back that the fork no longer changes the game).
    const deep = gainOf(pos, fork, 5);
    if (deep < 2 || before + deep < 3) continue;
    if (mateThreatAfter(pos, fork)) continue;
    // No other knight move may win material too (Stockfish found second knight
    // moves about as good once the pieces were matched), so the key is the one answer.
    if (C.legalMoves(pos).some((m) => m.piece === 'N' && C.uci(m) !== C.uci(fork) && gainOf(pos, m) >= 1)) continue;
    const san = C.san(pos, fork);
    const hit = targetsOf(fork).map((p) => NAMES[p]);
    return item({
      fen: C.toFen(pos), format: 'type_in', prompt: `${C.describe(pos)}\nFind the knight fork (algebraic notation).`,
      answer: san, accepts: sanAccepts([san]),
      rationale: `${san} lands on a square no black piece guards and attacks the ${hit.slice(0, -1).join(', the ')} and the ${hit[hit.length - 1]} at once. Black cannot save both, so White wins material.`,
    });
  }
  return hangingPiece(rng, d);
}

/**
 * Does White's lone pawn promote and keep its new queen, the white king out of play?
 * Played out move by move: the pawn always advances, the black king tries every step
 * (never onto a square the pawn attacks), and a king next to the new queen takes it.
 */
function pawnRaceWins(pawn, bk, toMove, memo = new Map()) {
  const key = `${pawn}:${bk}:${toMove}`;
  if (memo.has(key)) return memo.get(key);
  let out;
  if (toMove === 'w') {
    const front = pawn + 8;
    if (front === bk) out = false; // blocked, and the king beside it takes it next
    else if ((front >> 3) === 7) out = Math.max(Math.abs((front & 7) - (bk & 7)), Math.abs((front >> 3) - (bk >> 3))) > 1;
    else out = pawnRaceWins(front, bk, 'b', memo);
  } else {
    const guarded = (s) => (s >> 3) === (pawn >> 3) + 1 && Math.abs((s & 7) - (pawn & 7)) === 1;
    const steps = C.reach('k', bk).filter((s) => !guarded(s));
    if (steps.includes(pawn)) out = false;
    else out = steps.length > 0 && steps.every((s) => pawnRaceWins(pawn, s, 'w', memo));
  }
  memo.set(key, out);
  return out;
}

function squareRule(rng, d) {
  for (let tries = 0; tries < 200; tries++) {
    const file = rng.int(0, 7);
    const rank = rng.int(2, 6); // 1-based rank minus one: pawn on ranks 3-7
    const pawn = rank * 8 + file;
    const promo = 56 + file;
    const toMove = rng.pick(['w', 'b']);
    // With White to move, the black king may not already stand in check from the pawn.
    const checked = (s) => toMove === 'w' && (s >> 3) === rank + 1 && Math.abs((s & 7) - file) === 1;
    let bk;
    do { bk = rng.int(16, 63); } while (bk === pawn || bk === promo || checked(bk));
    const steps = 7 - rank;
    const dist = Math.max(Math.abs((bk & 7) - file), Math.abs((bk >> 3) - 7));
    // The rule of the square. The king catches the pawn when it is at most as many
    // king moves from the promotion square as the pawn needs; with Black to move it
    // has one move more, since it goes first and a new queen next to it is taken.
    // (The old key used one move less on both sides, so it said "No" to kings that
    // were in time.)
    const limit = steps + (toMove === 'b' ? 1 : 0);
    const catches = dist <= limit;
    // The race played out must agree; where the pawn's own guard changes it, the
    // rule would mislead, so that position is not asked.
    if (pawnRaceWins(pawn, bk, toMove) === catches) continue;
    const s = (n) => (n === 1 ? '' : 's');
    return item({
      format: 'multiple_choice',
      prompt: `White: pawn ${sqName(pawn)} (the white king is far away and cannot help). Black: king ${sqName(bk)}. ${toMove === 'w' ? 'White' : 'Black'} to move. Can the black king catch the pawn?`,
      choices: ['Yes', 'No'], answer: catches ? 'Yes' : 'No',
      rationale: `The pawn needs ${steps} move${s(steps)} to promote on ${sqName(promo)}; the black king is ${dist} king move${s(dist)} from ${sqName(promo)}. `
        + (toMove === 'b'
          ? `With Black to move the king goes first, so it is in time from up to ${limit} moves away (one more than the pawn needs, because a new queen next to the king is simply taken).`
          : `With White to move the pawn goes first, so the king must be no more than ${limit} move${s(limit)} away.`)
        + ` ${catches ? 'Here it is in time and catches the pawn.' : `Here it is ${dist - limit} move${s(dist - limit)} too slow, and the pawn promotes.`} This is the rule of the square.`,
    });
  }
  return G.chess_board(rng, d);
}

function mateOrStalemate(rng, d) {
  const want = rng.pick(['Checkmate', 'Stalemate', 'Neither']);
  for (let tries = 0; tries < 600; tries++) {
    const pos = mateSetup(rng, d);
    if (!pos) continue;
    pos.side = 'b';
    const wk = C.kingSquare(pos, 'w');
    const bk = C.kingSquare(pos, 'b');
    if (wk < 0 || !kingsApart(wk, bk) || C.inCheck(pos, 'w')) continue;
    if (pos.board.some((p, s) => p && p.toLowerCase() === 'p' && ((s >> 3) === 0 || (s >> 3) === 7))) continue;
    const got = C.isCheckmate(pos) ? 'Checkmate' : C.isStalemate(pos) ? 'Stalemate' : 'Neither';
    if (got !== want) continue;
    return item({
      fen: C.toFen(pos), format: 'multiple_choice', prompt: `${C.describe(pos)}\nIs this checkmate, stalemate, or neither?`,
      choices: ['Checkmate', 'Stalemate', 'Neither'], answer: got,
      rationale: got === 'Checkmate' ? 'Black is in check and has no legal move: checkmate, and White wins.'
        : got === 'Stalemate' ? 'Black is not in check but has no legal move: stalemate, which is a draw.'
          : 'Black still has at least one legal move, so the game goes on.',
    });
  }
  return squareRule(rng, d);
}

// ── Authored pools ───────────────────────────────────────────────────────
const POOLS = {
  chess_strategy: [
    { d: 3, p: 'What is an outpost?', c: ['A square in enemy territory that an enemy pawn can no longer attack', 'Any square on the edge of the board', 'The square in front of a passed pawn', 'A square next to your own king'], a: 'A square in enemy territory that an enemy pawn can no longer attack', r: 'A piece on an outpost, usually a knight, cannot be chased away by pawns, so it stays strong for a long time.' },
    { d: 4, p: 'What makes a bishop "bad"?', c: ['Many of its own pawns are fixed on squares of its colour', 'It has been moved more than three times', 'It is on the edge of the board', 'The opponent has a bishop of the same colour'], a: 'Many of its own pawns are fixed on squares of its colour', r: 'Its own pawns block its diagonals and it cannot attack the enemy pawns on the other colour.' },
    { d: 4, p: 'An isolated pawn is a pawn that…', c: ['has no friendly pawns on the files next to it', 'has passed all enemy pawns', 'is doubled on one file', 'stands on its starting square'], a: 'has no friendly pawns on the files next to it', r: 'No pawn can defend it, and the square in front of it is a good spot for an enemy piece.' },
    { d: 5, p: 'Where does a rook usually belong in the middlegame?', c: ['On an open or half-open file', 'In the corner until the endgame', 'In front of its own pawns on the third rank', 'Next to the king'], a: 'On an open or half-open file', r: 'Rooks need open lines; on an open file a rook can reach the seventh rank and attack.' },
    { d: 5, p: 'What is prophylaxis?', c: ['A move that stops the opponent\'s plan before it starts', 'Trading queens early', 'Castling on the opposite side', 'Pushing a passed pawn'], a: 'A move that stops the opponent\'s plan before it starts', r: 'Nimzowitsch made the idea famous: ask what your opponent wants, then prevent it.' },
    { d: 6, p: 'The minority attack is typically used by White in which structure?', c: ['Queen\'s Gambit Declined Exchange (Carlsbad) structure', 'King\'s Indian with closed centre', 'Open Sicilian', 'Isolated queen\'s pawn'], a: 'Queen\'s Gambit Declined Exchange (Carlsbad) structure', r: 'White pushes the b-pawn (two queenside pawns against three) to create a weak pawn on c6 for Black.' },
    { d: 7, p: 'What is the principle of two weaknesses?', c: ['One weakness can often be defended, so the attacker creates a second one far away', 'Every position has exactly two weaknesses', 'Never allow two pawn islands', 'Trade two minor pieces for a rook'], a: 'One weakness can often be defended, so the attacker creates a second one far away', r: 'The defender cannot cover two distant weaknesses at once, so the attack switches between them until one falls.' },
    { d: 8, p: 'Why might a player give up a rook for a bishop or knight (an exchange sacrifice)?', c: ['For lasting positional gains such as a strong minor piece, broken pawns or an attack', 'Because a rook is worth less than a minor piece', 'To reach a drawn endgame by force', 'It is never correct'], a: 'For lasting positional gains such as a strong minor piece, broken pawns or an attack', r: 'Petrosian was famous for exchange sacrifices that gained control of key squares rather than material.' },
    { d: 6, p: 'A passed pawn is a pawn that…', c: ['has no enemy pawns in front of it on its own file or the files next to it', 'has moved two squares at once', 'has captured a piece', 'is defended by another pawn'], a: 'has no enemy pawns in front of it on its own file or the files next to it', r: 'Only pieces can stop it, so it often decides endgames. "Passed pawns must be pushed."' },
  ],
  chess_opening: [
    { d: 2, p: 'Which is a sound opening principle?', c: ['Develop knights and bishops early and castle', 'Move the queen out on move two', 'Move the same piece many times', 'Push edge pawns first'], a: 'Develop knights and bishops early and castle', r: 'Fast development, control of the centre and a safe king are the three opening goals.' },
    { d: 3, p: 'After 1.e4 e5 2.Nf3 Nc6 3.Bc4, which opening is this?', c: ['Italian Game', 'Ruy Lopez', 'Scotch Game', 'Sicilian Defence'], a: 'Italian Game', r: 'The bishop on c4 aims at f7, the weakest square near Black\'s king.' },
    { d: 3, p: 'After 1.e4 e5 2.Nf3 Nc6 3.Bb5, which opening is this?', c: ['Ruy Lopez (Spanish)', 'Italian Game', 'Petroff Defence', 'Vienna Game'], a: 'Ruy Lopez (Spanish)', r: 'The bishop puts pressure on the knight that defends e5.' },
    { d: 3, p: 'Which first move for Black defines the Sicilian Defence after 1.e4?', c: ['1...c5', '1...e6', '1...c6', '1...d5'], a: '1...c5', r: '1...e6 is the French, 1...c6 the Caro-Kann and 1...d5 the Scandinavian.' },
    { d: 4, p: 'What is the Queen\'s Gambit?', c: ['1.d4 d5 2.c4', '1.e4 e5 2.f4', '1.d4 Nf6 2.c4 g6', '1.c4 e5'], a: '1.d4 d5 2.c4', r: '1.e4 e5 2.f4 is the King\'s Gambit; 1.d4 Nf6 2.c4 g6 heads for the King\'s Indian or Grünfeld.' },
    { d: 2, p: 'Fool\'s Mate, the fastest possible checkmate, is 1.f3 e5 2.g4 and then…', c: ['2...Qh4#', '2...Bc5#', '2...Qf6#', '2...Nf6#'], a: '2...Qh4#', r: 'Weakening the e1-h4 diagonal with f3 and g4 lets the queen mate at once.' },
    { d: 6, p: 'In the ECO system, which letter covers the Sicilian, French and Caro-Kann (semi-open games)?', c: ['B (mostly), with the French in C', 'A', 'D', 'E'], a: 'B (mostly), with the French in C', r: 'A = flank openings, B = semi-open games except the French, C = open games and the French, D = closed games and the Queen\'s Gambit, E = Indian defences.' },
    { d: 5, p: 'What is a "gambit"?', c: ['An opening that gives up material, usually a pawn, for development or attack', 'An opening that avoids all trades', 'Any opening starting with a knight move', 'A trap that wins the queen'], a: 'An opening that gives up material, usually a pawn, for development or attack', r: 'The King\'s Gambit and Evans Gambit are classic examples.' },
  ],
  chess_practical: [
    { d: 2, p: 'Before making your move, what should you check first?', c: ['What your opponent\'s last move threatens, and whether any of your pieces are loose', 'How many pieces each side has', 'Which opening you are in', 'How long you have left'], a: 'What your opponent\'s last move threatens, and whether any of your pieces are loose', r: 'Most games below club level are decided by missed threats and loose pieces.' },
    { d: 3, p: 'Under the touch-move rule, if you deliberately touch one of your own pieces, you must…', c: ['move it, if it has a legal move', 'move any piece you like', 'resign', 'tell the arbiter'], a: 'move it, if it has a legal move', r: 'Say "I adjust" first if you only want to straighten a piece on its square.' },
    { d: 4, p: 'In "90 minutes + 30 seconds", what does the 30 seconds mean?', c: ['30 seconds are added to your clock after each move', 'You must move within 30 seconds', 'The game starts 30 seconds late', 'You lose 30 seconds for each illegal move'], a: '30 seconds are added to your clock after each move', r: 'This is an increment (Fischer time); it makes losing on time with seconds left much less likely.' },
    { d: 4, p: 'What is the best order when reviewing your own game?', c: ['Write down your own thoughts first, then check with an engine', 'Turn on the engine immediately', 'Only look at the opening', 'Skip games you won'], a: 'Write down your own thoughts first, then check with an engine', r: 'Your own analysis shows how you think; the engine then shows where the thinking went wrong.' },
    { d: 5, p: 'What is the correct way to offer a draw in a tournament game?', c: ['Make your move, offer the draw, then press your clock', 'Offer before making your move and wait for an answer', 'Stop the clocks first', 'Offer while your opponent is thinking, many times'], a: 'Make your move, offer the draw, then press your clock', r: 'This is the FIDE procedure; repeated offers can be treated as disturbing the opponent.' },
    { d: 6, p: 'You are in time trouble in a complicated position. What is usually the best practical approach?', c: ['Keep the position safe and simple, and make solid moves quickly', 'Start a long calculation of every line', 'Sacrifice material to confuse', 'Stop recording moves when the rules do not allow it'], a: 'Keep the position safe and simple, and make solid moves quickly', r: 'Under time pressure, error rates rise sharply; safe moves reduce the chance of a blunder.' },
  ],
  chess_history: [
    { d: 3, p: 'Who was the first official World Chess Champion (1886)?', c: ['Wilhelm Steinitz', 'Paul Morphy', 'Emanuel Lasker', 'José Raúl Capablanca'], a: 'Wilhelm Steinitz', r: 'Steinitz beat Johannes Zukertort in 1886 and also laid down many principles of positional play.' },
    { d: 4, p: 'Who held the world title longest, for 27 years (1894-1921)?', c: ['Emanuel Lasker', 'Garry Kasparov', 'Alexander Alekhine', 'Mikhail Botvinnik'], a: 'Emanuel Lasker', r: 'Lasker lost the title to Capablanca in 1921.' },
    { d: 3, p: 'In 1972 in Reykjavik, who became World Champion by beating Boris Spassky?', c: ['Bobby Fischer', 'Anatoly Karpov', 'Mikhail Tal', 'Tigran Petrosian'], a: 'Bobby Fischer', r: 'The match was a Cold War landmark; Fischer later forfeited the title to Karpov in 1975.' },
    { d: 4, p: 'In 1997, which computer beat Garry Kasparov in a six-game match?', c: ['IBM Deep Blue', 'AlphaZero', 'Stockfish', 'Deep Fritz'], a: 'IBM Deep Blue', r: 'It was the first match win by a computer against a reigning World Champion under standard time controls.' },
    { d: 5, p: 'Which school of thought, led by Nimzowitsch and Réti, argued the centre can be controlled from a distance with pieces?', c: ['The hypermodern school', 'The romantic school', 'The classical school', 'The Soviet school'], a: 'The hypermodern school', r: 'It challenged Tarrasch\'s classical view that the centre must be occupied with pawns.' },
    { d: 5, p: 'In what year and city was FIDE founded?', c: ['1924, Paris', '1886, London', '1948, Moscow', '1972, Reykjavik'], a: '1924, Paris', r: 'FIDE (Fédération Internationale des Échecs) was founded in Paris on 20 July 1924.' },
    { d: 6, p: 'Which World Champion died while still holding the title?', c: ['Alexander Alekhine', 'Max Euwe', 'Vasily Smyslov', 'Bobby Fischer'], a: 'Alexander Alekhine', r: 'Alekhine died in 1946 as champion; the title was then decided by the 1948 match tournament won by Botvinnik.' },
    { d: 4, p: 'Who is widely regarded as the strongest female player in history, reaching the world top 10?', c: ['Judit Polgar', 'Hou Yifan', 'Vera Menchik', 'Maia Chiburdanidze'], a: 'Judit Polgar', r: 'Polgar played in the open World Championship and beat several World Champions in individual games.' },
  ],
  chess_professional: [
    { d: 4, p: 'Under FIDE rules, a game is drawn automatically (without a claim) after…', c: ['75 moves by each side with no capture or pawn move', '50 moves by each side with no capture or pawn move', 'any threefold repetition', '100 moves in total'], a: '75 moves by each side with no capture or pawn move', r: 'At 50 moves a player may claim a draw; at 75 moves (or a fivefold repetition) the arbiter declares it.' },
    { d: 5, p: 'A player\'s flag falls, but the opponent has only a king left. What is the result?', c: ['Draw', 'Loss for the player whose flag fell', 'Win for the player whose flag fell', 'The game is replayed'], a: 'Draw', r: 'A player cannot win on time when no series of legal moves could lead to checkmate by them.' },
    { d: 5, p: 'In a chess problem, what is the "key"?', c: ['The first move of the solution', 'The final mating move', 'A move that fails', 'The black defence'], a: 'The first move of the solution', r: 'A good key is usually quiet and surprising, not a check or capture.' },
    { d: 6, p: 'In a helpmate, …', c: ['Black moves first and both sides cooperate so that Black is mated', 'White forces mate against any defence', 'White forces Black to mate White', 'Both sides try to stalemate'], a: 'Black moves first and both sides cooperate so that Black is mated', r: 'A selfmate is the one where White forces Black to give mate.' },
    { d: 6, p: 'In composition, what is a "cook"?', c: ['An unintended solution that ruins the problem', 'The intended key move', 'A problem with no solution', 'A study that ends in a draw'], a: 'An unintended solution that ruins the problem', r: 'Composers now check soundness with engines and tablebases to find cooks.' },
    { d: 7, p: 'What does the Buchholz tiebreak add up?', c: ['The scores of a player\'s opponents', 'The player\'s wins with Black', 'The player\'s rating gains', 'The number of games won'], a: 'The scores of a player\'s opponents', r: 'It rewards having met stronger-scoring opponents; variants cut the lowest scores.' },
    { d: 5, p: 'In a Swiss-system tournament, players are mostly paired with…', c: ['opponents on the same or a similar score', 'every other player once', 'opponents chosen at random each round', 'the same opponent twice'], a: 'opponents on the same or a similar score', r: 'Swiss pairing also balances colours and avoids repeat pairings.' },
    { d: 7, p: 'What is an endgame study, as opposed to a problem?', c: ['A composed position, usually "White to play and win (or draw)", with no fixed number of moves', 'A mate-in-two problem', 'A real game ending', 'A position from an engine match'], a: 'A composed position, usually "White to play and win (or draw)", with no fixed number of moves', r: 'Studies look like game positions; problems usually ask for mate in a set number of moves.' },
  ],
  chess_engines: [
    { d: 4, p: 'What does alpha-beta pruning do in a chess engine?', c: ['Skips branches that cannot change the result, giving the same answer as full minimax faster', 'Plays random moves to explore', 'Evaluates positions with a neural network', 'Stores endgame results'], a: 'Skips branches that cannot change the result, giving the same answer as full minimax faster', r: 'With good move ordering it lets an engine search far deeper in the same time.' },
    { d: 5, p: 'What does NNUE stand for in Stockfish?', c: ['Efficiently updatable neural network', 'Neural network universal evaluator', 'Non-negative unit estimator', 'Next node uniform expansion'], a: 'Efficiently updatable neural network', r: 'NNUE entered Stockfish in August 2020: a small network that is cheap to update after each move.' },
    { d: 5, p: 'How did AlphaZero (DeepMind, 2017) learn chess?', c: ['By playing against itself, starting from only the rules', 'From a database of master games', 'From hand-written evaluation rules', 'From endgame tablebases'], a: 'By playing against itself, starting from only the rules', r: 'It combined a neural network with Monte Carlo tree search; Leela Chess Zero is an open-source project on the same idea.' },
    { d: 5, p: 'What is an endgame tablebase?', c: ['A complete database of every position with a few pieces, giving the perfect result and moves', 'A list of opening moves', 'A collection of master endgames', 'An engine\'s evaluation function'], a: 'A complete database of every position with a few pieces, giving the perfect result and moves', r: 'All positions with up to seven pieces are solved; work on eight-piece tables is ongoing.' },
    { d: 6, p: 'Is chess solved?', c: ['No; it is not known whether perfect play is a win for White or a draw', 'Yes, it is a draw', 'Yes, it is a win for White', 'Yes, Deep Blue solved it in 1997'], a: 'No; it is not known whether perfect play is a win for White or a draw', r: 'Only positions with up to seven pieces are solved. Checkers (draughts) was solved as a draw in 2007.' },
    { d: 7, p: 'Zermelo\'s 1913 theorem says that in chess…', c: ['Either White can force a win, Black can force a win, or both can force at least a draw', 'White always wins with perfect play', 'The game always ends within 100 moves', 'Every position has a unique best move'], a: 'Either White can force a win, Black can force a win, or both can force at least a draw', r: 'It is an existence result: it says one of the three is true without saying which.' },
    { d: 7, p: 'What is the difference between DTM and DTZ in tablebases?', c: ['DTM counts moves to mate; DTZ counts moves to the next capture or pawn move (zeroing the 50-move count)', 'DTM is for draws and DTZ for wins', 'They are two names for the same metric', 'DTM is used only for pawn endings'], a: 'DTM counts moves to mate; DTZ counts moves to the next capture or pawn move (zeroing the 50-move count)', r: 'Syzygy tables use DTZ, which respects the 50-move rule and takes less space.' },
    { d: 6, p: 'Claude Shannon\'s 1950 paper estimated the game-tree complexity of chess at about…', c: ['10^120', '10^20', '10^50', '10^1000'], a: '10^120', r: 'This "Shannon number" is why brute force cannot solve chess.' },
  ],
};

for (const [skill, pool] of Object.entries(POOLS)) G[skill] = fromPool(pool, skill);

module.exports = { GENERATORS: G, POOLS, liveTactics, POOL_STATS, poolSize: () => (TACTICS_POOL ? Object.fromEntries(Object.entries(TACTICS_POOL).map(([k, v]) => [k, v.length])) : null) };
