/**
 * How each exit-battery metric of chess, piano and basketball is sat as a stage
 * check (staged patch skills-round3/02-stage-tests; services/skill-checks.js).
 * The metrics, their tests and pass rules are content/skill-progressions/*.json;
 * this file says which machine sitting measures each one and with what numbers.
 *
 *   items     a fixed-form set served and graded on the server, answers never
 *             sent to the page before the sitting is over. Chess positions are
 *             computed with content/chess-board (legal moves, check, mate,
 *             stalemate), taken from the Stockfish-verified tactics pool
 *             (content/chess-tactics-pool.js) or from the staged drills whose
 *             answers the KPK table proved (content/skill-stage-checks.data.json).
 *   puzzles   the chess puzzle trainer's Glicko-2 rating (content/chess-trainer.js):
 *             at least `min` rated puzzles after the sitting opens, then the
 *             rating against the stage cut with its deviation.
 *   take      piano: notes played on MIDI, the on-screen keys or the microphone,
 *             scored on the server by piano-core's scorePerformance against the
 *             target (score-informed). A microphone take is an estimate: it is
 *             confirmed only by a second passing take of the same target.
 *   count     basketball: makes and attempts (or a count) the learner logs, or
 *             the camera tracker's count, which is an estimate and counts only
 *             when the learner confirms it. The make-rate rule is the Beta
 *             posterior P(rate >= bar) >= confidence (SKILL-CURRICULA.md 5).
 *   not_wired a metric a machine can prove whose sitting is not built yet
 *             (play-outs against perfect defence, recorded games, mazes,
 *             set-up, sight-reading, decision clips). Listed with what it needs;
 *             it stays unproven, so with the stage gate on (patch 03) its stage
 *             cannot be left until it is wired.
 *
 * Numbers marked [R] are provisional, as in the progressions.
 */
'use strict';

const MOVE_PROMPT = 'Play the move on the board, or type it.';

const CHECKS = {
  // ── chess ──────────────────────────────────────────────────────────────
  'CH0:legal_move_accuracy': { how: 'items', build: 'chess_reach', count: 18, rule: { squares_share: 0.95 }, source: 'board', minutes: 8,
    says: '18 positions (6 pieces, 3 positions each): type every square the named piece can move to. 95% of squares right.' },
  'CH0:star_maze_par': { how: 'not_wired', needs: 'a star-maze board sitting that counts moves against the par on the server' },
  'CH0:setup_from_memory': { how: 'not_wired', needs: 'a set-up board that reports where each of the 32 pieces was placed' },
  'CH1:check_mate_stalemate_id': { how: 'items', build: 'chess_status', count: 20, rule: { right: 18 }, source: 'board', minutes: 8,
    says: '20 positions: is the side to move in check, checkmated, stalemated, or none of these? 18 of 20.' },
  'CH1:mate_in_1_unannounced': { how: 'items', build: 'chess_mate_or_not', count: 15, mates: 10, rule: { right: 13 }, source: 'board', minutes: 10,
    says: '15 positions; 10 have a mate in one and 5 do not. Play the mate, or answer "no mate". 13 of 15.' },
  'CH1:kqk_playout': { how: 'not_wired', needs: 'play-outs against perfect defence from the KQK table (staged skills/lib/endgame-tables.js), graded on the server' },
  'CH1:legal_game': { how: 'not_wired', needs: 'a game against the lowest bot recorded and checked on the server (the sparring page keeps no record yet)' },
  // nothing_share (evidence article 04 P12, CHESS_NOTHING_TO_FIND): 5 of the 30 are Stockfish-checked
  // quiet positions (content/chess-quiet-pool.js) where the right answer is "nothing wins".
  'CH2:tactics_unannounced': { how: 'items', build: 'chess_tactics_pool', count: 30, difficulties: [2, 3, 4], nothing_share: 1 / 6, rule: { share: 0.8 }, source: 'board', minutes: 20,
    says: '30 positions from the Stockfish-checked pool, motifs not named: find the move that wins, or answer "nothing wins" (5 have nothing to find). 80%.' },
  'CH2:krk_playout': { how: 'not_wired', needs: 'play-outs against perfect defence from the KRK table, graded on the server' },
  'CH2:hung_pieces_per_game': { how: 'not_wired', needs: '12 recorded rapid games against the 600-800 bot band, each checked for pieces left en prise' },
  'CH3:tactics_unannounced': { how: 'items', build: 'chess_tactics_pool', count: 30, difficulties: [4, 5, 6], nothing_share: 0.2, rule: { share: 0.8 }, source: 'board', minutes: 25,
    says: '30 positions from the Stockfish-checked pool, motifs not named: find the move that wins, or answer "nothing wins" (6 have nothing to find). 80%.' },
  'CH3:kpk_judgement': { how: 'items', build: 'chess_kpk', count: 20, rule: { right: 18 }, source: 'board', minutes: 10,
    says: '20 king-and-pawn positions: with best play, a win or a draw? Answers proved by the KPK table. 18 of 20.' },
  'CH3:kpk_playout': { how: 'not_wired', needs: 'play-outs against perfect defence from the KPK table, graded on the server' },
  'CH3:games': { how: 'not_wired', needs: '12 recorded rapid games against the 900-1100 bot band with blunder counts' },
  'CH4:tactics_rating': { how: 'puzzles', cut: 1590, rd: 80, min: 10, source: 'board', minutes: 20,
    says: 'At least 10 rated puzzles in the puzzle trainer, then your puzzle rating: 1590 or more [R] (80% expected on a 1200-1500 set), with a deviation of 80 or less.' },
  'CH4:calculation': { how: 'not_wired', needs: 'positions where the whole line is entered and every reply checked on the server' },
  'CH4:games': { how: 'not_wired', needs: '12 recorded games against the 1200-1400 band with a performance rating' },
  'CH5:tactics_rating': { how: 'puzzles', cut: 1790, rd: 80, min: 10, source: 'board', minutes: 20,
    says: 'At least 10 rated puzzles, then your puzzle rating: 1790 or more [R] (80% expected on a 1400-1700 set), deviation 80 or less.' },
  'CH5:rook_endgame_playouts': { how: 'not_wired', needs: 'Lucena and Philidor play-outs against a tablebase, graded on the server' },
  'CH5:games': { how: 'not_wired', needs: '12 recorded games against the 1400-1600 band with a performance rating' },

  // ── piano ──────────────────────────────────────────────────────────────
  'PI0:find_keys': { how: 'items', build: 'piano_find', count: 10, rule: { right: 9 }, minutes: 4,
    says: 'Find 10 named keys on your piano or the on-screen keys. 9 of 10.' },
  'PI0:steady_beat': { how: 'take', build: 'beat', tempo: 80, beats: 16, rule: { on_beat: 0.75 }, minutes: 2,
    says: 'Tap or play along with the click for 16 beats. Three in four taps on the beat.' },
  'PI0:echo': { how: 'items', build: 'piano_echo', count: 5, length: [2, 3], tries: 1, rule: { right: 4 }, minutes: 4,
    says: 'Listen to 5 short patterns and play each one back. 4 of 5.' },
  'PI0:rote_song': { how: 'take', build: 'song', grade: 'piano_keyboard_explorer', pieces: 1, hands: 'right', rule: { notes: 0.85, completes: true }, minutes: 3,
    says: 'Play a black-key song from memory. 85% of the notes, to the end.' },
  'PI1:five_finger': { how: 'take', build: 'pattern', tempo: 70, hands: ['right', 'left'], tonic: 'C', rule: { notes: 1, on_beat: 0.8 }, minutes: 3,
    says: 'The C five-finger pattern up and down, right hand then left, at 70 a minute. Every note, 80% on the beat.' },
  'PI1:piece': { how: 'take', build: 'song', grade: 'piano_pre_reader', pieces: 2, hands: 'right', rule: { notes: 0.9, no_stops: true }, minutes: 6,
    says: 'Two pieces from this grade, cold. 90% of the notes and no stops.' },
  'PI1:ear_by_ear': { how: 'items', build: 'piano_echo', count: 1, length: [5, 5], tries: 3, rule: { right: 1 }, minutes: 3,
    says: 'Hear a 5-note tune and find it on the keys, within 3 tries.' },
  'PI2:c_scale': { how: 'take', build: 'scale', battery: 'PI2', item: 'C major', hands: ['right', 'left'], tempo: 80, rule: { notes: 0.95, notes_mic: 0.93, on_beat: 0.85 }, minutes: 3,
    says: 'C major, one octave, each hand. 95% of the notes (93% on a microphone) and 85% on the beat [R].' },
  'PI2:pieces': { how: 'take', build: 'song', grade: 'piano_first_reader', pieces: 3, hands: 'right', rule: { notes: 0.95, notes_mic: 0.93, on_beat: 0.85, no_stops: true }, minutes: 9,
    says: 'Three pieces from this grade, cold. 95% of the notes (93% on a microphone), 85% on the beat, no stops.' },
  'PI2:sight_reading_level': { how: 'not_wired', needs: 'the sight-reading staircase (SR1-SR10) with notation drawn on the page' },
  'PI2:aural': { how: 'items', build: 'piano_chord_ear', count: 10, rule: { right: 9 }, source: 'tap', minutes: 4,
    says: 'Hear 10 chords: major or minor? 9 of 10.' },
  'PI3:scales': { how: 'take', build: 'scale', battery: 'PI3', pick: 2, hands: ['both'], tempo: 80, rule: { notes: 0.97, notes_mic: 0.95, on_beat: 0.9, cv: 0.12 }, minutes: 5,
    says: "Two of this grade's scales, chosen at random, hands together (one hand at a time on a microphone). 97% of the notes, 90% on the beat, evenness CV 0.12 or less." },
  'PI3:pieces': { how: 'take', build: 'song', grade: 'piano_elementary_1', pieces: 3, hands: 'both', rule: { notes: 0.97, notes_mic: 0.95, on_beat: 0.9, no_stops: true }, minutes: 10,
    says: 'Three pieces from this grade, cold. 97% of the notes (95% on a microphone), 90% on the beat, no stops.' },
  'PI3:sight_reading_level': { how: 'not_wired', needs: 'the sight-reading staircase with notation drawn on the page' },
  'PI4:scales_arps': { how: 'take', build: 'scale', battery: 'PI4', pick: 2, hands: ['both'], tempo: 90, rule: { notes: 0.97, notes_mic: 0.95, on_beat: 0.9, cv: 0.12 }, minutes: 5,
    says: "Two of this grade's scales or arpeggios at random, hands together. As Elementary 1, at 90 a minute." },
  'PI4:cadence': { how: 'take', build: 'cadence', keys: ['C', 'G', 'F'], rule: { chords: 1 }, minutes: 3,
    says: 'I-IV-V7-I in C, G or F, chosen at random: every chord right. A microphone needs a second take to confirm.' },
  'PI4:pieces': { how: 'take', build: 'song', grade: 'piano_elementary_2', pieces: 3, hands: 'both', rule: { notes: 0.97, notes_mic: 0.95, on_beat: 0.9, no_stops: true }, minutes: 10,
    says: 'Three pieces from this grade (as many as the song library has), cold. As Elementary 1.' },
  'PI4:sight_reading_level': { how: 'not_wired', needs: 'the sight-reading staircase with notation drawn on the page' },

  // ── basketball ─────────────────────────────────────────────────────────
  'BB0:catch_and_bounce': { how: 'count', fields: [['done', 'Catches and bounces done', 0, 60]], out_of: 30, rule: { baseline: 0 }, minutes: 5,
    says: '10 catches and 10 bounces each hand: how many went right. Your first time sets your own baseline; after that, matching or beating it passes (shown, not a gate in the curriculum).' },
  'BB0:low_target': { how: 'count', fields: [['makes', 'Throws in', 0, 50], ['attempts', 'Throws', 1, 50]], rule: { logged: 10 }, minutes: 5,
    says: 'Throws into a low ring or bucket from one step. Logging 10 or more passes: the curriculum logs this, it never gates it.' },
  'BB0:safety_rule': { how: 'items', build: 'bb_safety', count: 4, rule: { right: 4 }, source: 'tap', minutes: 2,
    says: 'What to do when something hurts: 4 questions, all right.' },
  'BB1:layup_both_hands': { how: 'count', hands: true, fields: [['makes', 'Made', 0, 40], ['attempts', 'Tried', 1, 40]], min_n: 10, rule: { rate: 0.5, conf: 0.9 }, minutes: 10,
    says: 'Lay-ups at a low ring, at least 10 each hand. Each hand: the chance your true rate is 50% or better must be 90%.' },
  'BB1:dribble_look_up': { how: 'count', fields: [['strong', 'Strong hand, dribbles in 30 s', 0, 120], ['weak', 'Weak hand, dribbles in 30 s', 0, 120]], rule: { ratio: 0.7 }, minutes: 3,
    says: '30 seconds each hand while calling out a held-up number: the weak hand 70% of the strong hand or more.' },
  'BB1:decisions_2v1': { how: 'not_wired', needs: 'the 2v1 decision scenes (SVG until clips are licensed or filmed with consent)' },
  'BB1:rules_basics': { how: 'items', build: 'bank', skill: 'bb_rules', difficulty: 2, count: 10, rule: { right: 8 }, source: 'items', minutes: 4,
    says: '10 questions on travelling, double dribble and out of bounds. 8 of 10 [R].' },
  'BB2:form_shots_1m': { how: 'count', fields: [['makes', 'Made', 0, 60], ['attempts', 'Tried', 1, 60]], min_n: 20, rule: { rate: 0.6, conf: 0.8 }, minutes: 10,
    says: 'One-hand form shots from 1 m, at least 20: the chance your true rate is 60% or better must be 80%.' },
  'BB2:layups_both_hands_full_ring_or_age_ring': { how: 'count', hands: true, fields: [['makes', 'Made', 0, 40], ['attempts', 'Tried', 1, 40]], min_n: 20, rule: { rate: 0.6, conf: 0.9 }, minutes: 15,
    says: 'Lay-ups off a dribble, at least 20 each hand: for each hand, 90% sure your true rate is 60% or better.' },
  'BB2:decision_clips': { how: 'not_wired', needs: 'the 3v3 read scenes (SVG until clips are licensed or filmed with consent)' },
  'BB3:free_throws': { how: 'count', fields: [['makes', 'Made', 0, 100], ['attempts', 'Tried', 1, 100]], min_n: 20, rule: { rate: 0.5, conf: 0.8 }, minutes: 15,
    says: 'Free throws at your line and ring with your routine, at least 20: 80% sure your true rate is 50% or better.' },
  'BB3:mikan_30s': { how: 'count', fields: [['makes', 'Mikan makes in 30 s', 0, 60]], rule: { growth: 0.2 }, minutes: 3,
    says: 'Mikan drill, makes in 30 seconds. Your first time sets your baseline; 20% more than it passes.' },
  'BB3:decision_clips': { how: 'not_wired', needs: 'the 4v4 first-person read scenes (Rösch-style) with response times' },
};

/** What each metric is called on the pages. */
const TITLES = {
  legal_move_accuracy: 'Where each piece can go', star_maze_par: 'Star mazes at par', setup_from_memory: 'Setting up the board from memory',
  check_mate_stalemate_id: 'Check, mate or stalemate', mate_in_1_unannounced: 'Mate in one, unannounced', kqk_playout: 'Queen and king mate against perfect defence',
  legal_game: 'Two legal games', tactics_unannounced: 'Tactics, unannounced', krk_playout: 'Rook and king mate against perfect defence',
  hung_pieces_per_game: 'Pieces left hanging per game', kpk_judgement: 'King and pawn: win or draw', kpk_playout: 'King and pawn play-outs',
  games: 'Rated games', tactics_rating: 'Puzzle rating', calculation: 'Calculating whole lines', rook_endgame_playouts: 'Lucena and Philidor',
  find_keys: 'Finding named keys', steady_beat: 'A steady beat', echo: 'Echo it back', rote_song: 'A song from memory', five_finger: 'C five-finger pattern',
  piece: 'Two pieces, cold', ear_by_ear: 'A tune by ear', c_scale: 'C major scale', pieces: 'Three pieces, cold', sight_reading_level: 'Sight-reading level',
  aural: 'Major or minor by ear', scales: 'Scales, at random', recital: 'Recital and self-assessment', scales_arps: 'Scales and arpeggios', cadence: 'I-IV-V7-I',
  catch_and_bounce: 'Catch and bounce', low_target: 'Throws at a low target', safety_rule: 'What to do when it hurts', layup_both_hands: 'Lay-ups, each hand',
  dribble_look_up: 'Dribbling, eyes up', decisions_2v1: '2v1 decisions', rules_basics: 'The basic rules', form_shots_1m: 'Form shots from 1 m',
  layups_both_hands_full_ring_or_age_ring: 'Lay-ups off the dribble, each hand', decision_clips: 'Reading the play', warmup_habit: 'Warm-up habit',
  free_throws: 'Free throws', mikan_30s: 'Mikan drill, 30 seconds', film_it: 'Filmed set',
  technique: 'Technique at the target', repertoire: 'Pieces, and one from memory', dynamics_midi: 'Soft and loud (MIDI)', pedal_midi: 'Legato pedalling (MIDI)',
  independent_learning: 'A new piece learned alone', programme: 'Programme performance', spot_shooting_by_zone: 'Spot shooting by zone',
  shooting_profile: 'Shooting profile by zone', applied_tasks: 'Applied tasks', game_showcase: 'Game showcase', film_review: 'Film review',
  external_stats: 'Imported game stats', capstones: 'Capstones',
};
const titleOf = (metric) => TITLES[metric] || String(metric || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * The chess sittings of patch 05 (services/skill-chess-sittings.js), when it is
 * applied and SKILL_CHESS_SITTINGS is on: play-outs, recorded games, star mazes,
 * set-up and whole lines in place of the "not wired" entries above.
 */
function chessSittings() {
  try {
    // eslint-disable-next-line global-require
    return require('../services/skill-chess-sittings');
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && /skill-chess-sittings/.test(err.message)) return null;
    throw err;
  }
}

/**
 * The later piano and basketball sittings (services/skill-piano-bb-sittings.js),
 * when SKILL_PIANO_BB_SITTINGS is on: sight-reading, technique, dynamics,
 * pedalling, repertoire, a piece learned alone, decision scenes, applied
 * tasks and zone counts in place of the "not wired" entries above.
 */
function pianoBbSittings() {
  try {
    // eslint-disable-next-line global-require
    return require('../services/skill-piano-bb-sittings');
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && /skill-piano-bb-sittings/.test(err.message)) return null;
    throw err;
  }
}

/** The sitting for a metric; a metric not listed is not wired. */
function checkFor(metricId) {
  const cs = chessSittings();
  const wired = cs && cs.checkFor(metricId);
  if (wired) return wired;
  const pb = pianoBbSittings();
  const later = pb && pb.checkFor(metricId);
  if (later) return later;
  return CHECKS[metricId] || { how: 'not_wired', needs: 'a stage check for this stage (later stages are not wired in round 3)' };
}

module.exports = { CHECKS, checkFor, titleOf, MOVE_PROMPT };
