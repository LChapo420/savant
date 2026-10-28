/**
 * Checking what a model writes about chess, before it reaches a learner.
 *
 * A position must be a real one and a move must be legal in it, and the schema
 * check cannot see either: "8/8/8/8/8/8/8/8 w - - 0 1" is a well-formed string.
 * So every board check and every chess block passes through here with the same
 * rules code the board in the browser uses (public/engine/chess/chess-core.js).
 *
 * Prose is checked too, where a claim can be worked out from the squares it names:
 * "e4 to g6 (a knight's L-shape)", "a2, a3, a4 — four squares", "the rook must stop
 * on a2" when an enemy piece on a3 can simply be captured, "slides down from e4"
 * for a move that goes up the board. Each of these was written by the model in a
 * real lesson (grade 1, level 42); scripts/chess-items-test.js keeps them as tests.
 */
const C = require('../content/chess-board');

/** Why a FEN is not a usable position, or '' when it is. */
function fenProblem(fen) {
  let pos;
  try { pos = C.parseFen(String(fen || '')); } catch (e) { return 'the position could not be read'; }
  if (pos.board.length !== 64 || pos.board.some((p) => p && !/^[pnbrqkPNBRQK]$/.test(p))) return 'the position could not be read';
  // Every rank must account for exactly eight squares ("3RK2" is seven: a piece is missing or misplaced).
  const ranks = String(fen).trim().split(/\s+/)[0].split('/');
  if (ranks.length !== 8) return `the position has ${ranks.length} ranks, not 8`;
  const short = ranks.map((r, i) => ({ rank: 8 - i, n: [...r].reduce((n, ch) => n + (/\d/.test(ch) ? Number(ch) : 1), 0) })).find((r) => r.n !== 8);
  if (short) return `rank ${short.rank} of the FEN ("${ranks[8 - short.rank]}") covers ${short.n} squares, not 8`;
  const kings = (c) => pos.board.filter((p) => p === c).length;
  if (kings('K') !== 1 || kings('k') !== 1) return 'each side needs exactly one king';
  if (pos.board.some((p, s) => p && p.toLowerCase() === 'p' && ((s >> 3) === 0 || (s >> 3) === 7))) return 'a pawn stands on the first or last rank';
  if (C.inCheck(pos, C.other(pos.side))) return 'the side not to move is in check';
  return '';
}

/** Is no legal move of the same piece, in the same direction, longer than this one? */
function farthestOnItsLine(pos, move) {
  const step = (from, to) => [(to & 7) - (from & 7), (to >> 3) - (from >> 3)];
  const [df, dr] = step(move.from, move.to);
  const len = Math.max(Math.abs(df), Math.abs(dr));
  return !C.legalMoves(pos).some((m) => {
    if (m.from !== move.from) return false;
    const [f, r] = step(m.from, m.to);
    const sameWay = Math.sign(f) === Math.sign(df) && Math.sign(r) === Math.sign(dr) && f * dr === r * df;
    return sameWay && Math.max(Math.abs(f), Math.abs(r)) > len;
  });
}

/** Has the side not to move any piece or pawn besides its king? */
function enemyMaterial(pos) {
  const theirs = pos.side === 'w' ? /[pnbrq]/ : /[PNBRQ]/;
  return pos.board.some((pc) => pc && theirs.test(pc));
}

/** Has this side enough to checkmate with: a pawn, a rook or queen, or two minor pieces? */
function canMate(pos, side) {
  const mine = pos.board.filter((pc) => pc && (side === 'w' ? pc === pc.toUpperCase() : pc === pc.toLowerCase()));
  const kinds = mine.map((pc) => pc.toLowerCase());
  return kinds.some((k) => k === 'p' || k === 'r' || k === 'q') || kinds.filter((k) => k === 'n' || k === 'b').length >= 2;
}

/**
 * Does the key move do what the prompt asks for, where that can be seen from the
 * move itself? A prompt that asks for a capture, a check, a promotion or castling
 * is answered by a move that captures, checks, promotes or castles; "move without
 * capturing" and the like are left alone.
 */
function keyDoesWhatPromptAsks(prompt, pos, move, after) {
  return !keyMismatch(prompt, pos, move, after);
}

/** What the key fails to do that the prompt asks for, or ''. */
function keyMismatch(prompt, pos, move, after) {
  const p = prompt.toLowerCase();
  if (/\bas far (?:[\w-]+ ){0,4}?as\b|\b(all the way|farthest|furthest)\b/.test(p) && !farthestOnItsLine(pos, move)) return 'the prompt asks for as far as it can go, and the piece can go farther along that line (a capture at the end of the line counts)';
  const negated = (word) => new RegExp(`(without|not|never|avoid|don't|do not)\\s+(\\w+\\s+)?${word}`).test(p);
  if (/\b(captur\w*|gobble\w*|take (a|an|the|black's|white's|its|that)\b)/.test(p) && !negated('(captur|gobbl|tak)') && !move.captured) return 'the prompt asks for a capture, and the answer captures nothing';
  if (/\b(give|gives|giving|deliver) (a )?check\b|\bput\b.*\bin check\b|\bwith check\b|\bcheck the king\b/.test(p) && !negated('(giv|check)') && !C.inCheck(after)) return 'the prompt asks for a check, and the answer gives none';
  if (/\bpromot\w*/.test(p) && !negated('promot') && !move.promo) return 'the prompt asks for a promotion, and the answer does not promote';
  if (/\bcastl\w*/.test(p) && !negated('castl') && !move.castle) return 'the prompt asks for castling, and the answer does not castle';
  return '';
}

// ── prose ──────────────────────────────────────────────────────────────────
const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NAMES = C.NAMES;
const colourName = (c) => (c === 'w' ? 'white' : 'black');
const delta = (a, b) => [(C.sqIndex(b) & 7) - (C.sqIndex(a) & 7), (C.sqIndex(b) >> 3) - (C.sqIndex(a) >> 3)];

/** Every string inside a value, with the key it sat under. */
function strings(value, key = '', out = []) {
  if (typeof value === 'string') out.push({ key, text: value });
  else if (Array.isArray(value)) value.forEach((v) => strings(v, key, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, k, out);
  return out;
}

/** Pieces a text puts on squares ("a white rook sits on a1", "the black knight on a3"): square -> {colour, type}. */
function placements(text) {
  const out = new Map();
  const re = /\b(white|black)\s+(king|queen|rook|bishop|knight|pawn)\s+(?:(?:is|sits|stands|starts|waits|rests|lives)\s+)?(?:on|at|in)\s+([a-h][1-8])\b/gi;
  let m;
  while ((m = re.exec(text))) {
    out.set(m[3].toLowerCase(), { colour: m[1].toLowerCase() === 'white' ? 'w' : 'b', type: Object.keys(NAMES).find((k) => NAMES[k] === m[2].toLowerCase()) });
  }
  return out;
}

/**
 * "X to Y (a diagonal)": the shape a text gives a move, checked against the squares.
 * Only a label right after the move counts (in brackets, or before the next comma).
 */
function shapeProblems(text) {
  const out = [];
  const re = /\b[KQRBN]?([a-h][1-8])\s*(?:to|-|x|–|→|->)\s*([a-h][1-8])\b/g;
  let m;
  while ((m = re.exec(text))) {
    const rest = text.slice(re.lastIndex);
    const label = (/^\s*\(([^)]{0,60})\)/.exec(rest) || /^([^,.;!?()]{0,40})/.exec(rest) || ['', ''])[1].toLowerCase();
    if (!label.trim() || /\b(not|never|isn'?t|no|nor|instead of)\b/.test(label)) continue;
    const [df, dr] = delta(m[1].toLowerCase(), m[2].toLowerCase());
    const [af, ar] = [Math.abs(df), Math.abs(dr)];
    const move = `${m[1]} to ${m[2]}`;
    if (/\bl[- ]?shaped?\b|\bknight(?:'s)? (?:move|jump|hop|l)\b|\blike a knight\b/.test(label) && !((af === 1 && ar === 2) || (af === 2 && ar === 1))) {
      out.push(`"${move}" is called a knight's L-shape, but it is ${af === ar ? 'a diagonal' : af === 0 || ar === 0 ? 'a straight line' : 'not a knight move'}`);
    } else if (/\bdiagonal|\bslant/.test(label) && !(af === ar && af > 0)) {
      out.push(`"${move}" is called a diagonal, but it is ${af === 0 || ar === 0 ? 'a straight line' : 'not a diagonal'}`);
    } else if (/\b(?:up|down|along) the (?:[a-h]-)?file\b/.test(label) && df !== 0) {
      out.push(`"${move}" is said to go along the file, but it changes file`);
    } else if (/\b(?:along|across) the (?:\w+ )?rank\b|\bsideways\b/.test(label) && dr !== 0) {
      out.push(`"${move}" is said to go along the rank, but it changes rank`);
    } else if (/\bstraight\b/.test(label) && df !== 0 && dr !== 0) {
      out.push(`"${move}" is called straight, but it is ${af === ar ? 'a diagonal' : 'not a straight line'}`);
    }
  }
  return out;
}

/** "a2, a3, a4 — four squares": a list of squares and the number given for it must agree. */
function countProblems(text) {
  const out = [];
  const re = /((?:[a-h][1-8]\s*(?:,|and|then|→)\s*){2,}(?:and\s+)?[a-h][1-8])\s*(?:[—–:,-]|\.\.\.)?\s*(?:that'?s\s+|making\s+|for\s+|=\s*)?(\w+)\s+squares?\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const listed = m[1].match(/[a-h][1-8]/gi).length;
    const said = NUMBERS[m[2].toLowerCase()] || (/^\d+$/.test(m[2]) ? Number(m[2]) : null);
    if (said !== null && said !== listed) out.push(`the text lists ${listed} squares (${m[1]}) and calls them ${m[2]} squares`);
  }
  return out;
}

/**
 * "The rook must stop on a2" when the piece just past a2 is an enemy: an enemy
 * piece in the way is captured, not a wall. Only placements the text itself makes
 * ("a white rook on a1", "a black knight on a3") are used, and a sentence that
 * also mentions the capture is left alone.
 */
function blockerProblems(texts) {
  const all = texts.map((t) => t.text).join('\n');
  const where = placements(all);
  if (where.size < 2) return [];
  const out = [];
  const claim = /\b(?:must|has to|have to|would have to|can only|only)\s+stop\s+(?:on|at)\s+([a-h][1-8])\b|\breach(?:es)?\s+([a-h][1-8])\s*,?\s+but\s+(?:nothing|no square|not any square|never)\s+(?:beyond|past|further|farther)/gi;
  for (const { text } of texts) {
    let m;
    while ((m = claim.exec(text))) {
      const stop = (m[1] || m[2]).toLowerCase();
      const sentence = text.slice(Math.max(0, text.lastIndexOf('.', m.index) + 1), text.indexOf('.', claim.lastIndex) === -1 ? text.length : text.indexOf('.', claim.lastIndex));
      for (const [sq, piece] of where) {
        if (!'rbq'.includes(piece.type)) continue;
        const [df, dr] = delta(sq, stop);
        const straight = df === 0 || dr === 0;
        const diagonal = Math.abs(df) === Math.abs(dr);
        if ((!straight && !diagonal) || (df === 0 && dr === 0)) continue;
        if ((piece.type === 'r' && !straight) || (piece.type === 'b' && !diagonal)) continue;
        const sf = Math.sign(df);
        const sr = Math.sign(dr);
        const len = Math.max(Math.abs(df), Math.abs(dr));
        let clear = true;
        for (let i = 1; i < len; i++) if (where.has(C.sqName(C.sqIndex(sq) + i * (sr * 8 + sf)))) clear = false;
        const nf = (C.sqIndex(stop) & 7) + sf;
        const nr = (C.sqIndex(stop) >> 3) + sr;
        if (!clear || nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
        const next = C.sqName(nr * 8 + nf);
        const blocker = where.get(next);
        if (!blocker || blocker.colour === piece.colour) continue;
        if (new RegExp(`captur|\\btakes?\\b|\\btaking\\b|x${next}`, 'i').test(sentence)) continue;
        out.push(`the text says the ${NAMES[piece.type]} on ${sq} must stop on ${stop}, but the ${colourName(blocker.colour)} ${NAMES[blocker.type]} on ${next} is an enemy piece: the ${NAMES[piece.type]} can capture it on ${next}. Only a piece of its own colour is a wall`);
      }
    }
  }
  return [...new Set(out)];
}

/**
 * "Rb7 (slide up-right to b7)" and "c5 sits on a diagonal" when the text places one
 * piece (a white one, seen from White's side as diagrams are): the direction and
 * the diagonal are worked out from that piece's square.
 */
function relativeProblems(texts) {
  const where = [...placements(texts.map((t) => t.text).join('\n'))];
  const sliders = where.filter(([, p]) => 'rbq'.includes(p.type));
  const origin = sliders.length === 1 ? sliders[0] : where.length === 1 ? where[0] : null;
  if (!origin || origin[1].colour !== 'w') return [];
  const from = origin[0];
  const out = [];
  for (const { text } of texts) {
    let m;
    const dir = /\b(up|down)[- ](left|right)\s+(?:to\s+|towards?\s+)?([a-h][1-8])\b/gi;
    while ((m = dir.exec(text))) {
      const [df, dr] = delta(from, m[3].toLowerCase());
      const up = m[1].toLowerCase() === 'up';
      const right = m[2].toLowerCase() === 'right';
      if (dr === 0 || df === 0 || (dr > 0) !== up || (df > 0) !== right) {
        out.push(`"${m[0]}": from ${from}, ${m[3]} is ${dr > 0 ? 'up' : dr < 0 ? 'down' : 'level'} and ${df > 0 ? 'right' : df < 0 ? 'left' : 'straight'}`);
      }
    }
    const diag = /\b([a-h][1-8])\b([^.;!?]{0,40}?)\b(?:is|sits|lies|stands)\s+(?:also\s+)?(?:(?:on|along)\s+(?:a|the|one)\s+(?:long\s+)?diagonal|(?:one square |two squares |a square )?diagonally|a (?:long |short )?diagonal (?:step|hop|move|trip))/gi;
    while ((m = diag.exec(text))) {
      if (/\b(not|never|isn'?t)\b/i.test(m[2])) continue;
      const sq = m[1].toLowerCase();
      if (sq === from) continue;
      const [df, dr] = delta(from, sq);
      if (Math.abs(df) !== Math.abs(dr)) out.push(`the text says ${sq} is on a diagonal from the ${NAMES[origin[1].type]} on ${from}, but it is not (${Math.abs(df)} across, ${Math.abs(dr)} up or down)`);
    }
  }
  return out;
}

/**
 * A move written with "+" or "#" in a board check's text must give check or mate in
 * the check's position, and a sentence naming the answer must not call it check
 * or mate when it is not.
 */
function markProblems(texts, pos, move) {
  const after = C.makeMove(pos, move);
  const key = C.san(pos, move).replace(/[+#]$/, '');
  const tokens = /(^|[^\w])([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?)([+#])/g;
  for (const text of texts) {
    const t = String(text || '');
    let m;
    while ((m = tokens.exec(t))) {
      const mv = C.moveFromText(pos, m[2]);
      if (!mv) continue;
      const real = C.san(pos, mv);
      const mark = /#$/.test(real) ? '#' : /\+$/.test(real) ? '+' : '';
      if (mark !== m[3]) return `the text writes ${m[2]}${m[3]}, but ${real.replace(/[+#]$/, '')} ${mark === '#' ? 'is checkmate' : mark === '+' ? 'is check, not mate' : 'gives no check'}`;
    }
    for (const sentence of t.split(/(?<=[.!?])\s+/)) {
      if (!new RegExp(`(^|[^\\w])${key.replace(/[+#=]/g, '\\$&')}(?![\\w])`).test(sentence)) continue;
      if (/\b(gives?|giving|with|also)\s+(a\s+)?check\b|\bchecks the (black |white )?king\b/i.test(sentence) && !/\bno check\b|\bnot (a )?check/i.test(sentence) && !C.inCheck(after)) {
        return `the text says ${key} gives check, but it does not`;
      }
      if (/\b(is|gives|delivers?)\s+(check)?mate\b|\bcheckmates?\b/i.test(sentence) && !/\bnot\b/i.test(sentence) && !C.isCheckmate(after)) {
        return `the text says ${key} is mate, but it is not`;
      }
    }
  }
  return '';
}

/**
 * "The pawn on f6" when no position the text goes with has a pawn on f6. `positions`
 * are every position the block or check shows (its start, and after each move of it).
 */
function presenceProblems(texts, positions) {
  const out = [];
  const re = /\b(?:(white|black)\s+)?(king|queen|rook|bishop|knight|pawn)\s+(?:(?:is|sits|stands|starts|waits|rests)\s+)?(?:on|at)\s+([a-h][1-8])\b/gi;
  for (const text of texts) {
    let m;
    while ((m = re.exec(String(text || '')))) {
      const type = Object.keys(NAMES).find((k) => NAMES[k] === m[2].toLowerCase());
      const colour = m[1] ? (m[1].toLowerCase() === 'white' ? 'w' : 'b') : null;
      const s = C.sqIndex(m[3].toLowerCase());
      const there = positions.some((p) => p.board[s] && p.board[s].toLowerCase() === type && (!colour || C.colorOf(p.board[s]) === colour));
      if (!there) {
        const now = positions[0].board[s];
        out.push(`the text names a ${m[1] ? `${m[1].toLowerCase()} ` : ''}${m[2].toLowerCase()} on ${m[3]}, but the position has ${now ? `a ${colourName(C.colorOf(now))} ${NAMES[now.toLowerCase()]}` : 'nothing'} there`);
      }
    }
    // Lists: "your own pawns on b4, g4 and d2".
    const many = /\b(?:(white|black|your own|your|enemy)\s+)?(pawns|rooks|knights|bishops|queens)\s+(?:(?:are|sit|stand)\s+)?(?:on|at)\s+([a-h][1-8](?:\s*(?:,\s*and|,|and)\s*[a-h][1-8])*)/gi;
    while ((m = many.exec(String(text || '')))) {
      const type = Object.keys(NAMES).find((k) => `${NAMES[k]}s` === m[2].toLowerCase());
      const who = (m[1] || '').toLowerCase();
      const colour = who === 'white' ? 'w' : who === 'black' ? 'b' : /your/.test(who) ? positions[0].side : who === 'enemy' ? C.other(positions[0].side) : null;
      for (const name of m[3].match(/[a-h][1-8]/g)) {
        const s = C.sqIndex(name);
        if (positions.some((p) => p.board[s] && p.board[s].toLowerCase() === type && (!colour || C.colorOf(p.board[s]) === colour))) continue;
        const now = positions[0].board[s];
        out.push(`the text names ${m[1] ? `${m[1].toLowerCase()} ` : ''}${m[2].toLowerCase()} on ${m[3]}, but ${name} has ${now ? `a ${colourName(C.colorOf(now))} ${NAMES[now.toLowerCase()]}` : 'nothing'}`);
        break;
      }
    }
  }
  return [...new Set(out)];
}

/** Moves a note writes in notation ("Rxd7", "Nf3") must be legal in one of the positions it goes with. */
function notationProblems(texts, positions) {
  const out = [];
  const re = /(^|[^\w])([KQRBN](?:[a-h]?[1-8]?)x?[a-h][1-8](?:-[a-h][1-8])?)[+#]?(?![\w])/g;
  for (const text of texts) {
    let m;
    while ((m = re.exec(String(text || '')))) {
      if (positions.some((p) => C.moveFromText(p, m[2]))) continue;
      const pos = positions[0];
      const piece = m[2][0];
      const where = pos.board.map((p, s) => (p && p.toUpperCase() === piece && C.colorOf(p) === pos.side ? C.sqName(s) : null)).filter(Boolean);
      out.push(`the text plays ${m[2]}, which is not a legal move on this board${where.length ? ` (the ${NAMES[piece.toLowerCase()]} is on ${where.join(', ')})` : ''}`);
    }
  }
  return [...new Set(out)];
}

/** "Five squares in one move" said of a move that goes four. Knights are left out (they jump). */
function distanceProblem(texts, move) {
  if (move.piece.toLowerCase() === 'n' || move.castle) return '';
  const go = Math.max(Math.abs((move.to & 7) - (move.from & 7)), Math.abs((move.to >> 3) - (move.from >> 3)));
  for (const text of texts) {
    for (const sentence of String(text || '').split(/(?<=[.!?])\s+/)) {
      if (!/\b(roll|rolled|rolls|slid|slides|slide|moved|moves|went|goes|travel\w*|zoom\w*|climb\w*|march\w*)\b/i.test(sentence)) continue;
      const m = /\b(one|two|three|four|five|six|seven|\d)\s+squares?\b/i.exec(sentence);
      if (!m) continue;
      const said = NUMBERS[m[1].toLowerCase()] || Number(m[1]);
      if (said && said !== go) return `the text says the move goes ${m[1]} square${said === 1 ? '' : 's'}, but ${C.sqName(move.from)} to ${C.sqName(move.to)} is ${go}`;
    }
  }
  return '';
}

/**
 * Claims in chess prose that the squares named prove wrong. `value` is a block's
 * data or a check's text fields. Text that names no chess piece is left alone, so
 * this never reads another subject's lesson.
 */
function textProblems(value, { distractorKeys = /^(choices|options|distractors|wrongAnswers)$/i } = {}) {
  const all = strings(value);
  const joined = all.map((s) => s.text).join('\n');
  if (!/\b(king|queen|rook|bishop|knight|pawn)s?\b/i.test(joined) || !/\b[a-h][1-8]\b/.test(joined)) return [];
  const out = [];
  for (const { text } of all) out.push(...shapeProblems(text), ...countProblems(text));
  // A wrong option is meant to be wrong, so it never counts as a claim about where a piece stops.
  out.push(...blockerProblems(all.filter((s) => !distractorKeys.test(s.key))));
  out.push(...relativeProblems(all));
  return [...new Set(out)];
}

/**
 * "Slides straight down from e4" for a move that goes up the board. Up is towards
 * the far side for the player at the bottom, who is the side to move unless the
 * check turns the board.
 */
function directionProblem(texts, pos, move, orientation) {
  const [, dr] = [(move.to & 7) - (move.from & 7), (move.to >> 3) - (move.from >> 3)];
  if (!dr) return '';
  const bottom = orientation === 'black' || orientation === 'white' ? orientation[0] : pos.side;
  const goesUp = bottom === 'w' ? dr > 0 : dr < 0;
  const from = C.sqName(move.from);
  const to = C.sqName(move.to);
  for (const text of texts) {
    for (const sentence of String(text || '').split(/(?<=[.!?])\s+/)) {
      if (!sentence.includes(from) && !sentence.includes(to)) continue;
      const said = /\b(?:slides?|rolls?|moves?|goes|go|travels?|zooms?|climbs?|runs?|marches?|straight|as far)\s+(?:straight\s+|all the way\s+)?(up|down)\b/i.exec(sentence);
      if (!said) continue;
      const up = said[1].toLowerCase() === 'up';
      if (up !== goesUp) return `the text says the move goes ${said[1].toLowerCase()}, but ${from} to ${to} goes ${goesUp ? 'up' : 'down'} the board as the learner sees it`;
    }
  }
  return '';
}

/**
 * The piece the key moves can be taken for less than it is worth (a rook that
 * captures a pawn the king guards). A right answer that gives away a piece teaches
 * the wrong habit, unless the prompt is about mate or a sacrifice.
 */
function hangsPiece(prompt, pos, move, after) {
  if (C.isCheckmate(after) || move.promo) return '';
  if (/\bmate\b|checkmate|sacrific|\bsac\b|give up|decoy|deflect|lure|stalemate|\bdraw\b/i.test(prompt)) return '';
  const me = pos.side;
  const worth = (p) => C.VALUES[p.toLowerCase()];
  const moved = worth(move.piece);
  const gained = move.captured ? worth(move.captured) : 0;
  let takers = C.attackers(after, move.to, C.other(me));
  const defended = C.attacked(after, move.to, me);
  if (defended) takers = takers.filter((s) => after.board[s].toLowerCase() !== 'k');
  if (!takers.length) return '';
  const cheapest = after.board[takers[0]];
  const lost = defended ? Math.max(0, moved - worth(cheapest)) : moved;
  if (lost - gained < 2) return '';
  return `the answer ${C.san(pos, move)} puts the ${NAMES[move.piece.toLowerCase()]} where the ${colourName(C.other(me))} ${NAMES[cheapest.toLowerCase()]} on ${C.sqName(takers[0])} can take it${defended ? ' for less than it is worth' : ' for free'}; choose a position where the right move is also a safe one`;
}

/**
 * Why a board check written by the model cannot be used, or '' when it can.
 * The reason is what the repair call is told, so it says exactly what to fix.
 */
function boardCheckProblem(raw) {
  if (!raw || typeof raw !== 'object') return 'not written';
  const fen = String(raw.fen || '').trim();
  const bad = fenProblem(fen);
  if (bad) return `fen: ${bad}`;
  const pos = C.parseFen(fen);
  if (!C.legalMoves(pos).length) return 'fen: the side to move has no legal move';
  const prompt = String(raw.prompt || '').trim();
  const rationale = String(raw.rationale || '').trim();
  if (prompt.length < 4) return 'no question';
  if (rationale.length < 10) return 'no rationale: write one or two sentences on why the move is right';
  const move = C.moveFromText(pos, raw.answer);
  if (!move) return `the answer "${raw.answer}" is not a legal move in that position`;
  const after = C.makeMove(pos, move);
  const san = C.san(pos, move);
  // "Mate in one" can be checked exactly, so it is; a longer plan cannot be, and is
  // trusted only as far as the move being legal.
  if (/mate in (one|1)\b|checkmate in (one|1)\b|deliver (check)?mate|give (check)?mate/i.test(prompt) && !C.isCheckmate(after)) return `the prompt asks for mate in one, and ${san} is not mate`;
  const mismatch = keyMismatch(prompt, pos, move, after);
  if (mismatch) return `${mismatch} (${san})`;
  const hangs = hangsPiece(prompt, pos, move, after);
  if (hangs) return hangs;
  const way = directionProblem([prompt, rationale, raw.hint], pos, move, raw.orientation);
  if (way) return way;
  const marks = markProblems([prompt, rationale, raw.hint], pos, move);
  if (marks) return marks;
  const missing = presenceProblems([prompt, rationale, raw.hint], [pos, after]);
  if (missing.length) return missing[0];
  const far = distanceProblem([rationale, raw.hint], move);
  if (far) return far;
  const prose = textProblems({ prompt, rationale, hint: raw.hint });
  if (prose.length) return prose[0];
  return '';
}

/**
 * A board check written by the model, made safe, or null.
 *
 * The answer must be a legal move in the position that does what the prompt asks,
 * without giving a piece away, and what the text says about it must be true;
 * otherwise the question and its key disagree and the check is dropped (after one
 * repair call that is told boardCheckProblem's reason). The answer is stored in
 * standard notation, and the from-to form is accepted too, which is what the board sends.
 */
function cleanBoardCheck(raw) {
  if (boardCheckProblem(raw)) return null;
  const pos = C.parseFen(String(raw.fen).trim());
  const move = C.moveFromText(pos, raw.answer);
  const san = C.san(pos, move);
  // Any other spelling the model offered must name the very same move.
  const accepts = [san, C.uci(move), `uci:${C.uci(move)}`];
  for (const a of Array.isArray(raw.accepts) ? raw.accepts : []) {
    const m = C.moveFromText(pos, a);
    if (m && C.uci(m) === C.uci(move)) accepts.push(String(a));
  }
  return {
    format: 'board',
    fen: C.toFen(pos),
    prompt: String(raw.prompt).trim().slice(0, 600),
    answer: san,
    accepts: [...new Set(accepts)],
    rationale: String(raw.rationale).trim().slice(0, 600),
    hint: String(raw.hint || '').trim().slice(0, 300),
  };
}

/** Why a chess multiple-choice or typed check states something false, or ''. Only its own claims are read, not its wrong options. */
function proseCheckProblem(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const found = textProblems({ prompt: raw.prompt, answer: raw.answer, rationale: raw.rationale, hint: raw.hint });
  return found.length ? found[0] : '';
}

/** Is a learner's answer to a board check the right move? */
function gradeBoard(check, answer) {
  let pos;
  try { pos = C.parseFen(check.fen); } catch (e) { return false; }
  const given = C.moveFromText(pos, answer);
  if (!given) return false;
  // Every accepted answer counts, not only the key: a mate in one can have two
  // mating moves, and the bank lists both. (A model-written check's accepts are
  // filtered to spellings of its one move, so this widens nothing there.)
  const accepted = [check.answer, ...(Array.isArray(check.accepts) ? check.accepts : [])];
  return accepted.some((a) => {
    const right = C.moveFromText(pos, a);
    return !!right && C.uci(given) === C.uci(right);
  });
}

/**
 * A guided lesson must play through: every correct move legal in its step's
 * position, every reply legal after every correct move, the learner always the
 * side to move when a step starts, and a step that continues from the last one
 * reachable from all of that step's correct moves.
 */
function guidedProblems(data) {
  const out = [];
  const steps = Array.isArray(data.steps) ? data.steps : [];
  if (!steps.length) return ['steps: a guided lesson needs at least one step'];
  let pos = C.parseFen(data.fen);
  const learner = pos.side;
  const sideName = (s) => (s === 'w' ? 'White' : 'Black');
  const starts = []; // the position at the start of each step, for the detour check below
  for (let i = 0; i < steps.length && out.length < 4; i++) {
    const step = steps[i] || {};
    const at = `steps[${i}]`;
    if (step.fen) {
      const bad = fenProblem(step.fen);
      if (bad) { out.push(`${at}.fen: ${bad}`); pos = null; continue; }
      pos = C.parseFen(step.fen);
    }
    if (!pos) { out.push(`${at}: the position before this step is not known; give it its own "fen"`); continue; }
    if (pos.side !== learner) { out.push(`${at}: ${sideName(pos.side)} is to move here, but the learner plays ${sideName(learner)}; add a "reply" to the step before, or give this step its own "fen"`); pos = null; continue; }
    if (C.status(pos) === 'checkmate' || C.status(pos) === 'stalemate') { out.push(`${at}: the game is already over in this position`); pos = null; continue; }
    const texts = Array.isArray(step.moves) ? step.moves : [];
    const moves = [];
    for (const text of texts) {
      const m = C.moveFromText(pos, text);
      if (m) moves.push(m);
      else out.push(`${at}.moves: "${text}" is not a legal move here (${C.describe(pos)})`);
    }
    if (!moves.length) { pos = null; continue; }
    const instruction = String(step.instruction || '');
    const main = moves[0];
    const mainAfter = C.makeMove(pos, main);
    // A capture the lesson works up to, that was already safe to make at an earlier step: a detour.
    if (main.captured) {
      for (let j = 0; j < starts.length; j++) {
        const early = C.legalMoves(starts[j]).find((m) => m.to === main.to && m.piece === main.piece && m.captured
          && !hangsPiece('', starts[j], m, C.makeMove(starts[j], m)));
        if (early) {
          out.push(`steps[${i}]: ${C.san(starts[j], early)} was already possible at steps[${j}], so the steps in between walk around a capture the learner could simply make; capture when it is possible, or start from a position where the path is really blocked`);
          break;
        }
      }
    }
    starts.push(pos);
    for (const m of moves) {
      const miss = keyMismatch(instruction, pos, m, C.makeMove(pos, m));
      if (miss) out.push(`${at}: ${miss} (${C.san(pos, m)})`);
    }
    const gives = hangsPiece(instruction, pos, main, mainAfter);
    if (gives) out.push(`${at}: ${gives}`);
    const far = distanceProblem([step.explain, step.instruction], main);
    if (far) out.push(`${at}: ${far}`);
    const missing = presenceProblems([step.instruction, step.explain, step.hint], [pos, mainAfter]);
    if (missing.length) out.push(`${at}: ${missing[0]}`);
    let nexts = moves.map((m) => C.makeMove(pos, m));
    if (step.reply) {
      if (nexts.some((p) => C.status(p) === 'checkmate' || C.status(p) === 'stalemate')) {
        out.push(`${at}.reply: the game is over after this move, so there is no reply; leave "reply" out`);
        nexts = nexts.map(() => null);
      } else {
        nexts = nexts.map((p, k) => {
          const r = C.moveFromText(p, step.reply);
          if (!r) out.push(`${at}.reply: "${step.reply}" is not legal after ${C.san(pos, moves[k])}`);
          return r ? C.makeMove(p, r) : null;
        });
      }
    }
    const next = steps[i + 1];
    if (next && !next.fen && new Set(nexts.filter(Boolean).map((p) => C.toFen(p))).size > 1) {
      out.push(`${at}.moves: the correct moves lead to different positions, so steps[${i + 1}] cannot follow all of them; keep one move, or give steps[${i + 1}] its own "fen"`);
    }
    pos = nexts[0] || null;
  }
  return out;
}

/** Problems with a chess block's data that its schema cannot see. */
function blockProblems(tag, data) {
  if (!data || typeof data !== 'object') return [];
  // What a block's text says about squares and pieces (any block on a chess level).
  const prose = textProblems(data);
  if (!/^Chess_/.test(tag)) return prose;
  const problem = fenProblem(data.fen);
  if (problem) return [`fen: ${problem}`, ...prose];
  const pos = C.parseFen(data.fen);
  const out = [];
  if (tag === 'Chess_PlayOut' && !C.legalMoves(pos).length) out.push('fen: the side to move has no legal move, so there is nothing to play');
  if (tag === 'Chess_PlayOut' && data.goal === 'capture' && !enemyMaterial(pos)) out.push('goal: "capture" needs enemy pieces or pawns to capture');
  if (tag === 'Chess_PlayOut' && data.goal === 'capture') {
    // A bot pawn two moves from queening turns "collect the pawns" into a race against a new queen.
    const racing = pos.board.map((pc, s) => (pc && pc.toLowerCase() === 'p' && C.colorOf(pc) !== pos.side
      && (pos.side === 'w' ? (s >> 3) <= 2 : (s >> 3) >= 5) ? C.sqName(s) : null)).filter(Boolean);
    if (racing.length) out.push(`fen: the bot's pawn${racing.length > 1 ? 's' : ''} on ${racing.join(', ')} ${racing.length > 1 ? 'are' : 'is'} two moves or less from promoting, so the capture task becomes a race against a new queen; start ${racing.length > 1 ? 'them' : 'it'} farther back`);
  }
  if (tag === 'Chess_PlayOut' && (data.goal === 'win' || data.goal === 'mate' || !data.goal)) {
    if (!canMate(pos, pos.side)) out.push(`goal: "${data.goal || 'win'}" means checkmate, and the side to move has too little to mate with; use "capture" for winning material`);
    else if (/\b(captur\w*|gobbl\w*|collect\w*|eat|grab)\b/i.test(String(data.prompt || '')) && !/\bmate\b|checkmate/i.test(String(data.prompt || ''))) out.push(`goal: the prompt asks to capture, but "${data.goal || 'win'}" means checkmate; use "capture"`);
  }
  if (tag === 'Chess_Guided') out.push(...guidedProblems(data));
  const shown = [pos];
  if (Array.isArray(data.line)) {
    let p = pos;
    data.line.forEach((text, i) => {
      if (out.length) return;
      const m = C.moveFromText(p, text);
      if (!m) out.push(`line[${i}]: "${text}" is not a legal move there; write moves in algebraic notation such as "Rd1" or "Rxd5", legal one after another (White and Black alternate)`);
      else { p = C.makeMove(p, m); shown.push(p); }
    });
  }
  // A Chess_Position's or play-out's words about which piece stands where must match its board.
  if (tag === 'Chess_Position' || tag === 'Chess_PlayOut') out.push(...presenceProblems([data.note, data.caption, data.prompt], shown));
  if (tag === 'Chess_Position') {
    out.push(...notationProblems([data.note, data.caption], shown));
    // An arrow shows a piece's move or line, so it starts on a piece.
    for (const a of Array.isArray(data.arrows) ? data.arrows : []) {
      const from = String(a).slice(0, 2);
      if (/^[a-h][1-8]$/.test(from) && !pos.board[C.sqIndex(from)]) out.push(`arrows: "${a}" starts on ${from}, where there is no piece in this position`);
    }
  }
  return out.concat(prose);
}

module.exports = {
  fenProblem, cleanBoardCheck, boardCheckProblem, proseCheckProblem, gradeBoard, blockProblems, guidedProblems, textProblems, hangsPiece, directionProblem,
};
