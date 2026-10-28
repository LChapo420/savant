/**
 * What each chess, piano and basketball exit-battery metric asks, in the
 * learner's words (learner follow-ups, 2026-10-24).
 *
 * The progressions (content/skill-progressions/*.json) write each metric's
 * `test` and `threshold` for the build: "cold take noteAccuracy >= 0.9, no
 * stops", "P(rate >= 0.5) >= 0.9 for EACH hand", "stage cut, RD <= 80". Those
 * strings stay the source of truth for the code; the pages show this line
 * instead. Each line says what you do and what passes, with the same numbers.
 * Where a metric has a working stage check (content/skill-stage-checks.js),
 * the numbers are the ones that check grades by (its `rule`, `tempo`, `count`,
 * `cut`), and scripts/learner-followups-test.js checks that they match.
 *
 * "For now" marks a number the progression flags as provisional ([R]).
 * Keyed by `${stageId}:${metric}`, as everywhere else.
 */
'use strict';

const PLAIN = {
  // ── chess ──────────────────────────────────────────────────────────────
  'CH0:legal_move_accuracy': 'Show every square a piece can move to: 6 pieces, 3 positions each, 18 in all. To pass: 95% of the squares right.',
  'CH0:star_maze_par': 'Star mazes for the rook, bishop, queen and knight: collect every star in no more moves than the maze allows. To pass: 3 of the 4 pieces within that number, on a cold day.',
  'CH0:setup_from_memory': 'Set up all 32 pieces from memory. To pass: every piece in the right place, on two different days.',
  'CH1:check_mate_stalemate_id': '20 positions: is the side to move in check, checkmated, stalemated, or none of these? To pass: 18 of 20.',
  'CH1:mate_in_1_unannounced': '15 positions; 10 have a mate in one and 5 do not. Play the mate, or answer "no mate". To pass: 13 of 15.',
  'CH1:kqk_playout': 'Checkmate with king and queen against a king that defends perfectly, from 5 starting positions. To pass: mate every time, within 6 moves of the fastest mate, and never stalemate.',
  'CH1:legal_game': 'Play 2 full games against the easiest bot. To pass: any illegal move you try, you put right yourself, and both games are recorded.',
  'CH2:tactics_unannounced': '30 positions, without being told what kind of tactic to look for: find the move that wins, or say "nothing wins" when nothing does. To pass: 80% right.',
  'CH2:krk_playout': 'Checkmate with king and rook against a king that defends perfectly, from 5 starting positions. To pass: mate every time, within 8 moves of the fastest mate, with no stalemate and inside the 50-move rule.',
  'CH2:hung_pieces_per_game': '12 rapid games (15 minutes each plus 10 seconds a move) against bots rated about 600 to 800. To pass: no more than 1 piece left hanging in a typical game, and a score of 40% or more (a win counts 1, a draw a half).',
  'CH3:tactics_unannounced': '30 harder positions, without being told what kind of tactic to look for: find the move that wins, or say "nothing wins" when nothing does. To pass: 80% right.',
  'CH3:kpk_judgement': '20 positions with king and pawn against king: with best play, is it a win or a draw? To pass: 18 of 20.',
  'CH3:kpk_playout': 'King and pawn against king, against perfect defence: win 4 won positions, and hold 2 drawn positions as Black. To pass: all 6.',
  'CH3:games': '12 rapid games against bots rated about 900 to 1100. To pass: a score of 50% or more, with no more than 1 blunder in a typical game.',
  'CH4:tactics_rating': 'At least 10 rated puzzles in the puzzle trainer, without being told what to look for. To pass: a puzzle rating of 1590 or more once it has settled (for now; this mark may change).',
  'CH4:calculation': '10 positions where you enter the whole line: at least 3 of your moves and every reply. To pass: 7 of 10.',
  'CH4:games': '12 rapid games against bots rated about 1200 to 1400. To pass: a performance rating of 1250 or more, with no more than 1 blunder in a typical game.',
  'CH5:tactics_rating': 'At least 10 rated puzzles, defending positions included. To pass: a puzzle rating of 1790 or more once it has settled (for now; this mark may change).',
  'CH5:rook_endgame_playouts': 'Two classic rook endings against a perfect defender: win the Lucena position and hold the Philidor position. To pass: both, twice, on different days.',
  'CH5:games': '12 rapid games against bots rated about 1400 to 1600. To pass: a performance rating of 1450 or more.',
  'CH6:tactics_rating': 'Rated puzzles, without being told what to look for. To pass: a puzzle rating at this stage\'s mark once it has settled.',
  'CH6:repertoire_srs': 'Review cards for your own openings in the move trainer. To pass: 90% of the cards that come up right first time, over 2 weeks, and every card saying why the move is played.',
  'CH6:games': '12 rapid or classical games against bots rated about 1600 to 1800. To pass: a performance rating of 1650 or more.',
  'CH7:choose_a_move': 'A timed set of positions where you choose a move: a third tactics, a third positional, a third endgames. To pass: this stage\'s mark (for now; it may change). A move counts when it is within a third of a pawn of the best move and you give your reason.',
  'CH7:conversion_playouts': 'Against an engine: turn 5 clearly better positions into wins, and hold 3 worse positions. To pass: at least 4 of the 5 and 2 of the 3.',
  'CH7:games': '12 games against bots rated about 1800 to 2000. To pass: a performance rating of 1850 or more.',
  'CH8:choose_a_move': 'Positions at expert level where you choose a move. To pass: this stage\'s mark (for now; it may change).',
  'CH8:games': 'Games against the strongest engine level we have measured, or a FIDE, national or online rating you bring in. To pass: a performance of 2000 or more, or an outside rating of 2000 or more whose reliability is known.',
  'CH8:own_game_quality': 'An estimate of how good your moves are, from 20 or more of your own slow games checked by an engine. It is shown with its margin of error and never holds you back on its own.',
  'CH9-12:tasks': 'Capstone tasks: an opening preparation file, an annotated game, and winning a technical position. To pass: the rubric, checked against an engine\'s analysis.',
  'CH9-12:external': 'A FIDE or national rating you bring in. Shown, never required.',

  // ── piano ──────────────────────────────────────────────────────────────
  'PI0:find_keys': 'Find 10 named keys on your piano or the on-screen keys. To pass: 9 of 10.',
  'PI0:steady_beat': 'Tap or play along with the click at 80 beats a minute, for 16 beats. To pass: three taps in four on the beat.',
  'PI0:echo': 'Listen to 5 short patterns of 2 or 3 notes and play each one back. To pass: 4 of 5.',
  'PI0:rote_song': 'Play a black-key song from memory, all the way to the end. To pass: 85% of the notes right.',
  'PI1:five_finger': 'The C five-finger pattern up and down, right hand then left, at 70 beats a minute. To pass: every note right, and 80% of them on the beat.',
  'PI1:piece': 'Two pieces from this grade, played cold. To pass: 90% of the notes right, with no stops.',
  'PI1:ear_by_ear': 'Hear a 5-note tune and find it on the keys. To pass: right within 3 tries.',
  'PI2:c_scale': 'C major, one octave, each hand on its own, at 80 beats a minute. To pass: 95% of the notes right (93% on a microphone) and 85% on the beat (for now; this mark may change).',
  'PI2:pieces': 'Three pieces from this grade, played cold. To pass: 95% of the notes right (93% on a microphone), 85% on the beat, and no stops.',
  'PI2:sight_reading_level': 'Two short pieces you have never seen, at sight-reading level 2, shown as music: play each once. To pass: in both, 80% of the notes right and 80% on the beat.',
  'PI2:aural': 'Hear 10 chords: major or minor? To pass: 9 of 10.',
  'PI3:scales': 'Two of this grade\'s scales, picked at random, hands together (one hand at a time on a microphone), at 80 beats a minute. To pass: 97% of the notes right (95% on a microphone), 90% on the beat, and the notes evenly spaced (the gaps between them vary by no more than about 12%).',
  'PI3:pieces': 'Three pieces from this grade, played cold with both hands. To pass: 97% of the notes right (95% on a microphone), 90% on the beat, and no stops.',
  'PI3:sight_reading_level': 'Two short pieces you have never seen, at sight-reading level 3 (both hands taking turns), shown as music: play each once. To pass: in both, 80% of the notes right and 80% on the beat.',
  'PI3:recital': 'Record one piece and rate it yourself with the rubric. It is done when it is recorded and rated; your rating is set beside the app\'s score to help you judge your own playing, and it never holds you back.',
  'PI4:scales_arps': 'Two of this grade\'s scales or arpeggios, picked at random, hands together, at 90 beats a minute. To pass: 97% of the notes right (95% on a microphone), 90% on the beat, and the notes evenly spaced (gaps varying by no more than about 12%).',
  'PI4:cadence': 'Play the chords I, IV, V7 and I in C, G or F, picked at random. To pass: every chord right. On a microphone, a second take confirms it.',
  'PI4:pieces': 'Three pieces from this grade, played cold with both hands. To pass: 97% of the notes right (95% on a microphone), 90% on the beat, and no stops.',
  'PI4:sight_reading_level': 'Two short pieces you have never seen, at sight-reading level 4 (hands together), shown as music: play each once. To pass: in both, 80% of the notes right and 80% on the beat.',
  'PI5-7:technique': 'Two of this grade\'s scales or arpeggios picked at random, hands together, at 120 beats a minute (for now; a teacher will set the speeds). To pass: 97% of the notes (95% on a microphone, one hand), 90% on the beat, and very evenly spaced (gaps varying by no more than about 9%).',
  'PI5-7:repertoire': '3 pieces from this stage, then one of them from memory, started at 3 bars picked at random. To pass: in every part, 97% of the notes (95% on a microphone), 90% on the beat, and no stops.',
  'PI5-7:sight_reading_level': 'Two short pieces you have never seen, at your grade\'s sight-reading level (5, 6 or 7), shown as music: play each once. To pass: in both, 80% of the notes right and 80% on the beat.',
  'PI5-7:dynamics_midi': 'A new passage marked soft (p) and loud (f) in turn, played on a MIDI keyboard. To pass: 90% of the notes, and your loud notes clearly louder than your soft ones (by 15 or more on the keyboard\'s 0 to 127 scale). On other inputs this is shown only.',
  'PI5-7:recital': 'A recorded performance that you rate with the rubric; a teacher or another player may review it too. It is done when it is recorded; the app never marks musicality.',
  'PI8-10:technique': 'Two of this grade\'s technical requirements picked at random, hands together, at 160 beats a minute on a MIDI keyboard (for now; a teacher will set the speeds). To pass: 97% of the notes, 90% on the beat, and very evenly spaced (gaps varying by no more than about 6%).',
  'PI8-10:programme': 'A recorded performance of your programme, cold, and from memory where that is asked. Marked with the rubric; a teacher\'s review is strongly recommended.',
  'PI8-10:pedal_midi': 'Smooth pedalling through chord changes, on a MIDI keyboard. To pass: in 90% of the changes, the pedal comes up within 0.15 seconds of the change and goes down again after the new chord starts.',
  'PI8-10:independent_learning': 'A new piece made for you, shown as music: learn it on your own and play it cold within 2 weeks. To pass: 97% of the notes (95% on a microphone), 90% on the beat, and no stops.',
  'PI11-16:capstones': 'Recorded recitals and applied tasks: teach a lesson, prepare a competition programme, accompany someone. Marked with a rubric and a person\'s review; the app\'s measurements are shown for information.',

  // ── basketball ─────────────────────────────────────────────────────────
  'BB0:catch_and_bounce': '10 catches from a soft toss and 10 bounces with each hand. Your first count sets your own starting point; to pass after that, match it or beat it.',
  'BB0:low_target': 'Throw into a low ring or a bucket from one step away. To pass: log 10 throws or more; how many go in is recorded, not marked.',
  'BB0:safety_rule': 'What to do when something hurts: 4 questions. To pass: all 4 right.',
  'BB1:layup_both_hands': 'Lay-ups at a low ring, at least 10 with each hand. To pass: for each hand, enough makes to be 90% sure you make at least half your lay-ups.',
  'BB1:dribble_look_up': 'Dribble for 30 seconds with each hand while calling out a number someone holds up. To pass: your weaker hand makes at least 70% as many dribbles as your stronger hand.',
  'BB1:decisions_2v1': '10 game pictures, two attackers against one defender: pass, shoot or dribble? To pass: 8 of 10.',
  'BB1:rules_basics': '10 questions on travelling, double dribble and out of bounds. To pass: 8 of 10 (for now; this mark may change).',
  'BB2:form_shots_1m': 'One-hand form shots from 1 metre at your age\'s ring height, at least 20. To pass: enough makes to be 80% sure you make at least 60% of them.',
  'BB2:layups_both_hands_full_ring_or_age_ring': 'Lay-ups off a dribble, at least 20 with each hand. To pass: for each hand, enough makes to be 90% sure you make at least 60% of them.',
  'BB2:decision_clips': '15 short three-against-three plays: spot the open teammate, the cut, or the space to fill. To pass: 80% right.',
  'BB2:warmup_habit': 'Log a warm-up before each court session. Shown as a habit over 4 weeks (the aim is 90% of sessions); it never holds you back.',
  'BB3:free_throws': 'Free throws from your age\'s line and ring, with your routine before every shot, at least 20. To pass: enough makes to be 80% sure you make at least half.',
  'BB3:mikan_30s': 'The Mikan drill: lay-ups for 30 seconds. Your first count sets your starting point; to pass after that, 20% more than it.',
  'BB3:decision_clips': '18 four-against-four plays seen through a player\'s eyes: drive and kick, help defence, closing out. To pass: 80% right, answered in your usual time.',
  'BB3:film_it': 'Film a set and rate it against example clips for form and footwork. It is done when it is filmed and rated by you; a coach may confirm it.',
  'BB4-5:spot_shooting_by_zone': 'Catch-and-shoot from 5 spots, at least 17 shots at each spot a session (about 50 over 3 sessions), mid-range, then 3-point once you reach your age\'s line. To pass: enough makes to be 80% sure you reach each zone\'s mark (45% mid-range, 33% from three, for now; these marks may change).',
  'BB4-5:free_throws': 'Free throws from the full FIBA line (5.80 m from the inside of the end line), at least 50 a session, 100 over two days. To pass: enough makes to be 80% sure you make at least 65%.',
  'BB4-5:decision_clips': '24 plays: ball screens, help defence and the fast break. To pass: 80% right.',
  'BB4-5:game_showcase': 'Log a game and review your film with the rubric. It is done when it is logged and your reads are rated; a coach may confirm it.',
  'BB6-7:shooting_profile': 'Your game and practice shots by zone, at least 25 in each of 5 zones a session. Shown as estimated rates with their ranges. To pass: enough makes to be 80% sure you reach each varsity mark (50% mid-range, 36% from three, for now; these may change).',
  'BB6-7:decision_clips': '30 varsity-level plays. To pass: 80% right.',
  'BB6-7:film_review': 'Review your own game film against example clips, and name 5 reads with the curriculum\'s words. It is done when it is reviewed; a coach\'s check is recommended.',
  'BB8-12:applied_tasks': 'Applied tasks: a scouting report, a game plan, an officiating clip test and an analytics project. Marked with a rubric, and any numbers are checked.',
  'BB8-12:external_stats': 'Game stats you bring in, if you play. Shown, never required.',
};

/** The learner's line for a metric id ("PI1:piece"), or null. */
function plainFor(id) {
  return Object.prototype.hasOwnProperty.call(PLAIN, id) ? PLAIN[id] : null;
}

/**
 * A stage as a learner reads it: its name only, never the build's code
 * ("PI1"). Kept here so every page says it the same way.
 */
function stageLabel(stage) {
  return stage && stage.name ? String(stage.name) : '';
}

/**
 * Why a skill needs cold passes on two different days, in children's words
 * (evidence article 04, P9). The second day is a delayed test of what was kept;
 * it is not a promise that sleep improves the skill: whether sleep adds to a
 * motor skill is contested in adults (Walker 2002 against Rickard 2008), and
 * children aged 6-8 improved less across sleep than across waking (Wilhelm
 * 2008). A later test is the better guide to learning either way (Soderstrom &
 * Bjork 2015). scripts/skills-r3-gate-test.js checks that no learner-facing
 * skill text promises a sleep gain.
 */
const TWO_DAY_RULE = 'Why two days? A check on a later day, without warming up first, shows what you have really kept. It is a later test, not a promise that you get better overnight.';

/** The line for the pages: SKILL_TWO_DAY_TEXT=off (or the owner's base product) leaves it out. */
function twoDayRule(userOrId) {
  if (String(process.env.SKILL_TWO_DAY_TEXT || 'on').toLowerCase() === 'off') return null;
  // eslint-disable-next-line global-require
  if (userOrId !== undefined && require('../config/owner').ownerBase(userOrId)) return null;
  return TWO_DAY_RULE;
}

/** Wording that promises a sleep gain (P9): never in children's skill text (TWO_DAY_RULE itself says the opposite). */
const SLEEP_GAIN = /(sleep|overnight|a night)[^.]{0,60}(improv|better|boost|stronger|lock|gain)|(improv|better|boost|stronger|gain)[^.]{0,40}((after|while|during|in your)\s+(a night|sleep)|overnight)/i;

module.exports = { PLAIN, plainFor, stageLabel, TWO_DAY_RULE, twoDayRule, SLEEP_GAIN };
