/**
 * Lines for the move trainer (content/chess-srs.js): every move the learner plays
 * in a line is its own spaced-repetition card, with the reason for the move.
 *
 *   decks   openings for White and for Black (principles first: each move says
 *           what it does), mating patterns, and endgame technique.
 *   line    { id, deck, title, side: 'w'|'b', fen?, moves: [SAN...], why: { ply: text } }
 *           `ply` counts from 0 at the line's first move. Every move of the side
 *           in `side` must have a why; the other side's moves are played for the
 *           learner. Opening titles are checked against the CC0 opening list
 *           (content/chess-openings.js) by scripts/chess-trainer-test.js, and every
 *           learner move was checked by Stockfish (scripts/chess-engine-verify.js).
 *
 * Written for this app; the moves are standard theory, the explanations our own.
 * The mating-pattern deck is made from the hand-set trainer puzzles
 * (content/chess-puzzles.js), so a pattern met in a puzzle comes back on schedule.
 */
const PUZZLES = require('./chess-puzzles');

const DECKS = [
  { id: 'open-white', title: 'Openings with White', blurb: '1.e4 lines that develop fast and castle: the Italian Game and simple answers to the main defences.', minRating: 900 },
  { id: 'open-black', title: 'Openings with Black', blurb: '1...e5 against 1.e4 and the Queen\'s Gambit Declined against 1.d4.', minRating: 900 },
  { id: 'mates', title: 'Mating patterns', blurb: 'The checkmates every player should see in a flash.', minRating: 0 },
  { id: 'endgames', title: 'Endgame technique', blurb: 'Winning and drawing methods you play the same way every time.', minRating: 700 },
];

const OPENINGS = [
  // ── White ────────────────────────────────────────────────────────────────
  {
    id: 'w-italian-giuoco', deck: 'open-white', side: 'w', title: 'Italian Game: Classical Variation, Giuoco Pianissimo',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'Re1'],
    why: {
      0: 'Take the centre with a pawn and open lines for the queen and the light-squared bishop.',
      2: 'Develop the knight with a threat: it attacks the pawn on e5.',
      4: 'The bishop aims at f7, the square next to Black\'s king that only the king guards.',
      6: 'Prepare d4 to build a big centre, and take the d4 square away from Black\'s knight.',
      8: 'Guard e4 calmly. White keeps a solid centre and finishes developing first.',
      10: 'Castle: the king goes to safety and the rook comes towards the centre.',
      12: 'The rook stands behind the e-pawn, guarding it and ready for the centre to open.',
    },
  },
  {
    id: 'w-italian-two-knights', deck: 'open-white', side: 'w', title: 'Italian Game: Two Knights Defense, Modern Bishop\'s Opening',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Be7', 'O-O', 'O-O', 'Re1', 'd6', 'c3'],
    why: {
      0: 'Take the centre with a pawn and open lines for the queen and the light-squared bishop.',
      2: 'Develop the knight with a threat: it attacks the pawn on e5.',
      4: 'The bishop aims at f7, the weakest square in Black\'s camp.',
      6: 'Black\'s knight attacks e4, so guard it with a pawn. Quiet, but nothing hangs.',
      8: 'Castle before anything else: the king is safe and the rook can join.',
      10: 'The rook backs up the e4 pawn and the e-file.',
      12: 'Give the bishop a retreat square on c2 and prepare d4 one day.',
    },
  },
  {
    id: 'w-sicilian-open', deck: 'open-white', side: 'w', title: 'Sicilian Defense: Najdorf Variation, Opocensky Variation',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2'],
    why: {
      0: 'Take the centre with a pawn and open lines for the queen and bishop.',
      2: 'Develop and get ready for d4.',
      4: 'Open the centre: White trades a centre pawn for Black\'s c-pawn and gets quick development.',
      6: 'Take back with the knight, which now stands strongly in the centre.',
      8: 'Black\'s knight attacked e4. Defend it by developing another piece.',
      10: 'Develop calmly and get ready to castle short.',
    },
  },
  {
    id: 'w-french-advance', deck: 'open-white', side: 'w', title: 'French Defense: Advance Variation, Paulsen Attack',
    moves: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3'],
    why: {
      0: 'Take the centre with a pawn.',
      2: 'Make it two pawns side by side in the centre.',
      4: 'Push past: the pawn on e5 takes f6 away from Black\'s knight and cramps Black.',
      6: 'Black attacks the base of the chain, d4. Support it with another pawn.',
      8: 'Develop and add a third defender of d4.',
    },
  },
  {
    id: 'w-caro-advance', deck: 'open-white', side: 'w', title: 'Caro-Kann Defense: Advance Variation, Short Variation',
    moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2'],
    why: {
      0: 'Take the centre with a pawn.',
      2: 'Make it two pawns in the centre.',
      4: 'Push past and gain space; Black\'s knight cannot use f6.',
      6: 'Develop the knight, which also guards d4 and the e5 pawn.',
      8: 'Develop the bishop modestly and get ready to castle.',
    },
  },
  {
    id: 'w-scandinavian', deck: 'open-white', side: 'w', title: 'Scandinavian Defense: Main Line, Mieses Variation',
    moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6', 'Nf3'],
    why: {
      0: 'Take the centre with a pawn.',
      2: 'Take the pawn: Black has to spend a move with the queen to win it back.',
      4: 'Develop with tempo: the knight attacks the queen, which must move again.',
      6: 'Take the centre while the queen is away from it.',
      8: 'Develop the second knight; both knights now point at the centre.',
    },
  },
  {
    id: 'w-petrov', deck: 'open-white', side: 'w', title: "Petrov's Defense: Classical Attack",
    moves: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4', 'd4', 'd5', 'Bd3'],
    why: {
      0: 'Take the centre with a pawn.',
      2: 'Develop with a threat to the e5 pawn.',
      4: 'Take the free pawn. (Black must not copy with ...Nxe4 at once, because Qe2 wins.)',
      6: 'Retreat the knight: it was attacked and is not needed on e5.',
      8: 'Take the centre; Black\'s knight on e4 will be pushed back.',
      10: 'Develop the bishop with an attack on the knight on e4.',
    },
  },
  // ── Black ────────────────────────────────────────────────────────────────
  {
    id: 'b-ruy-closed', deck: 'open-black', side: 'b', title: 'Ruy Lopez: Closed',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O'],
    why: {
      1: 'Claim the centre with a pawn of your own.',
      3: 'Develop and guard the e5 pawn.',
      5: 'Ask the bishop what it wants: keep it or swap it for the knight.',
      7: 'Develop with an attack on the e4 pawn.',
      9: 'Develop and get ready to castle.',
      11: 'White threatens Bxc6 and then Nxe5, winning the e5 pawn. Chase the bishop away first.',
      13: 'Guard e5 with a pawn and open the light-squared bishop\'s diagonal.',
      15: 'Castle: the king is safe and the rook joins the game.',
    },
  },
  {
    id: 'b-italian', deck: 'open-black', side: 'b', title: 'Italian Game: Classical Variation, Giuoco Pianissimo',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6'],
    why: {
      1: 'Claim the centre with a pawn of your own.',
      3: 'Develop and guard the e5 pawn.',
      5: 'Copy the idea: your bishop aims at White\'s f2.',
      7: 'Develop with an attack on e4.',
      9: 'Guard e5 and open the way for the other bishop.',
    },
  },
  {
    id: 'b-scotch', deck: 'open-black', side: 'b', title: 'Scotch Game: Classical Variation',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5'],
    why: {
      1: 'Claim the centre with a pawn of your own.',
      3: 'Develop and guard the e5 pawn.',
      5: 'Take: White attacked e5 twice, and the trade opens lines for your pieces.',
      7: 'Develop with a threat to the knight on d4.',
    },
  },
  {
    id: 'b-qgd', deck: 'open-black', side: 'b', title: 'Queen\'s Gambit Declined: Orthodox Defense',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'Nbd7'],
    why: {
      1: 'Claim the centre with a pawn of your own.',
      3: 'Keep the pawn on d5 guarded instead of taking on c4.',
      5: 'Develop the knight, adding a defender of d5.',
      7: 'Break the pin on the knight so the queen is not tied to it.',
      9: 'Castle: the king is safe before the centre opens.',
      11: 'Develop the last minor piece. From d7 the knight supports ...c5 or ...e5 later.',
    },
  },
  {
    id: 'b-london', deck: 'open-black', side: 'b', title: 'Queen\'s Pawn Game: Accelerated London System',
    moves: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5', 'c3', 'Nc6'],
    why: {
      1: 'Claim the centre with a pawn of your own.',
      3: 'Develop the knight towards the centre.',
      5: 'Strike at White\'s centre with the c-pawn.',
      7: 'Develop and add pressure to d4.',
    },
  },
];

// ── Endgame technique (lines checked move by move by Stockfish) ──────────────
const ENDGAMES = [
  {
    id: 'e-kq-box', deck: 'endgames', side: 'w', title: 'Queen and king: mate on the edge',
    fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',
    moves: ['Qg7#'],
    why: { 0: 'The king guards g7, so the queen can stand next to the enemy king: it covers g8, h7 and checks.' },
  },
  {
    id: 'e-kr-edge', deck: 'endgames', side: 'w', title: 'Rook and king: the edge mate',
    fen: '6k1/8/6K1/8/8/8/8/R7 w - - 0 1',
    moves: ['Ra8#'],
    why: { 0: 'Kings face each other with one square between: the rook checks along the edge and the king guards f7, g7 and h7.' },
  },
  {
    id: 'e-opposition', deck: 'endgames', side: 'w', title: 'King and pawn: take the opposition',
    fen: '4k3/8/8/8/8/4K3/4P3/8 w - - 0 1',
    moves: ['Kf4', 'Kf7', 'Ke5', 'Ke7', 'e4'],
    why: {
      0: 'Lead with the king, not the pawn: the king must reach the squares in front of its pawn.',
      2: 'Step in front of the pawn: from e5 the king controls d6, e6 and f6.',
      4: 'Now the pawn moves up. The king in front will escort it home.',
    },
  },
];

/** Mating patterns: the hand-set mate puzzles, White's version of each (the -b mirrors are skipped). */
const MATES = PUZZLES.filter((p) => p.kind === 'mate' && !/-b$/.test(p.id)).map((p) => ({
  id: `m-${p.id}`, deck: 'mates', side: p.fen.split(' ')[1], title: p.themes.filter((t) => !/^mateIn/.test(t)).join(', ') || 'mate', fen: p.fen,
  uci: p.line, // from-to moves; the trainer turns them into SAN when it builds the line
  why: Object.fromEntries(p.line.map((_, i) => [i, i % 2 === 0 ? (i === p.line.length - 1 ? `${p.hint} That is checkmate.` : p.hint) : null]).filter(([, v]) => v)),
}));

const LINES = [...OPENINGS, ...ENDGAMES, ...MATES];

module.exports = { DECKS, LINES };
