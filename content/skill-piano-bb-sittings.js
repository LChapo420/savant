/**
 * The piano and basketball stage checks that patch 02 listed as "not wired"
 * (PI2-PI10, BB1-BB12), as sittings. SKILL_PIANO_BB_SITTINGS=on (default on
 * since 2026-10-24, LIVE-CHANGES-2026-10-24.md), on top of SKILL_RECORD and
 * SKILL_STAGE_TESTS. services/skill-piano-bb-sittings.js builds and scores them;
 * content/skill-stage-checks.js hands them out in place of "not wired".
 *
 *   take   piano: notes (and, for pedalling, CC64 pedal moves) from MIDI, the
 *          on-screen keys or the microphone, scored on the server by piano-core
 *          against the target: new excerpts read from notation drawn on the
 *          page (the sight-reading staircase), scales and arpeggios with
 *          evenness, a p/f passage by MIDI velocity, legato pedalling at chord
 *          changes, pieces with restarts from random bars played from memory,
 *          and a new piece learned from the score within 14 days.
 *   items  basketball: drawn decision scenes on the court (keys re-derived
 *          from the positions, content/basketball-scenes.js) and applied
 *          computations (box-score analytics, rules).
 *   count  basketball: makes and attempts by zone or from the line, judged by
 *          the Beta posterior; a camera count is an estimate and counts only
 *          when the learner confirms it.
 *
 * Numbers marked [R] are provisional, as in the progressions: tempo targets
 * (exam-board tables were not verified: SKILL-CURRICULA.md), evenness cuts,
 * zone thresholds by age band, decision-scene sets (reliability not yet
 * measured: a set used as a gate needs split-half >= 0.8 after 100 learners).
 */
'use strict';

const ZONES = [['lc', 'Left corner'], ['lw', 'Left wing'], ['top', 'Top'], ['rw', 'Right wing'], ['rc', 'Right corner']];
const zoneFields = (max) => ZONES.flatMap(([z, label]) => [[`${z}_makes`, `${label}: made`, 0, max], [`${z}_attempts`, `${label}: tried`, 1, max]]);
const RANGE = { name: 'range', label: 'Where you shot from', options: [['mid', 'Mid-range'], ['three', '3-point line']] };

const SCALE_RULE = { notes: 0.97, notes_mic: 0.95, on_beat: 0.9 };
const PIECE_RULE = { notes: 0.97, notes_mic: 0.95, on_beat: 0.9, no_stops: true };

const CHECKS = {
  // ── piano ──────────────────────────────────────────────────────────────
  'PI2:sight_reading_level': { how: 'take', build: 'sight_reading', level: 'SR2', excerpts: 2, rule: { notes: 0.8, on_beat: 0.8 }, minutes: 6,
    says: 'Two pieces you have never seen, at sight-reading level 2 (C or G major, 4/4 or 3/4, one hand), shown in notation: play each once at ♩ = 60. 80% of the notes and 80% on the beat, in both.' },
  'PI3:sight_reading_level': { how: 'take', build: 'sight_reading', level: 'SR3', excerpts: 2, rule: { notes: 0.8, on_beat: 0.8 }, minutes: 8,
    says: 'Two new pieces at sight-reading level 3 (C, G or F major, grand staff, hands taking turns, 8 bars): play each once. 80% of the notes and 80% on the beat, in both.' },
  'PI4:sight_reading_level': { how: 'take', build: 'sight_reading', level: 'SR4', excerpts: 2, rule: { notes: 0.8, on_beat: 0.8 }, minutes: 8,
    says: 'Two new pieces at sight-reading level 4 (up to one sharp or flat, major or minor, hands together with long left-hand notes, 8 bars): play each once. 80% of the notes and 80% on the beat, in both.' },
  'PI5-7:sight_reading_level': { how: 'take', build: 'sight_reading', level_by_grade: { piano_lower_intermediate: 'SR5', piano_intermediate: 'SR6', piano_upper_intermediate: 'SR7' }, level: 'SR7', excerpts: 2, rule: { notes: 0.8, on_beat: 0.8 }, minutes: 10,
    says: 'Two new pieces at your grade\'s sight-reading level (level 5, 6 or 7: hands together, position shifts, then ties, chords, 6/8, syncopation and triplets): play each once. 80% of the notes and 80% on the beat, in both.' },
  'PI5-7:technique': { how: 'take', build: 'technique', battery_by_grade: { piano_lower_intermediate: ['PI5'], piano_intermediate: ['PI6'], piano_upper_intermediate: ['PI7'] }, pick: 2, hands: ['both'], tempo: 120, rule: { ...SCALE_RULE, cv: 0.09 }, minutes: 6,
    says: 'Two of your grade\'s scales or arpeggios at random, hands together, at 120 notes a minute [R] (a microphone hears one hand). 97% of the notes, 90% on the beat, evenness CV 0.09 or less.' },
  'PI5-7:repertoire': { how: 'take', build: 'repertoire', grades: ['piano_lower_intermediate', 'piano_intermediate', 'piano_upper_intermediate'], pieces: 3, restarts: 3, restart_bars: 2, rule: PIECE_RULE, minutes: 15,
    says: 'Three pieces from this stage, cold, then one of them from memory, started at 3 bars picked at random (2 bars from each). 97% of the notes (95% on a microphone), 90% on the beat, no stops, in every part.' },
  'PI5-7:dynamics_midi': { how: 'take', build: 'dynamics', level: 'SR2', bars: 8, rule: { notes: 0.9, dynamics: 15 }, minutes: 3,
    says: 'A new 8-bar passage marked soft (p) and loud (f) in turn, on a MIDI keyboard: the median loudness of your f notes at least 15 above your p notes (0-127), and 90% of the notes.' },
  'PI8-10:technique': { how: 'take', build: 'technique', battery_by_grade: { piano_early_advanced: ['PI8'], piano_advanced: ['PI8'], piano_pre_professional: ['PI8', 'PI10'] }, pick: 2, hands: ['both'], tempo: 160, rule: { notes: 0.97, on_beat: 0.9, cv: 0.06 }, minutes: 6,
    says: 'Two of your grade\'s technical requirements at random, hands together, at 160 notes a minute [R], on MIDI. 97% of the notes, 90% on the beat, evenness CV 0.06 or less.' },
  'PI8-10:pedal_midi': { how: 'take', build: 'pedal', bars: 8, lift_ms: 150, before_ms: 30, rule: { pedal: 0.9, chords: 0.8 }, minutes: 4,
    says: 'Eight chords, one a bar, with legato pedalling on a MIDI keyboard: at 90% of the chord changes the pedal comes up within 0.15 s of the new chord and goes down again after it. 80% of the chords right.' },
  'PI8-10:independent_learning': { how: 'take', build: 'learn_piece', level: 'SR7', bars: 16, window_days: 14, rule: PIECE_RULE, minutes: 5,
    says: 'A new 16-bar piece, made for you and shown in notation: learn it on your own, then play it cold within 14 days. 97% of the notes (95% on a microphone), 90% on the beat, no stops.' },

  // ── basketball ─────────────────────────────────────────────────────────
  'BB1:decisions_2v1': { how: 'items', build: 'bb_scenes', mix: [['2v1', 10]], rule: { right: 8 }, source: 'screen', minutes: 6,
    says: '10 drawn plays, two of you against one defender, paused at the moment to decide: pass, shoot or dribble. 8 of 10.' },
  'BB2:decision_clips': { how: 'items', build: 'bb_scenes', mix: [['3v3_ball', 8], ['3v3_off', 7]], rule: { right: 12 }, source: 'screen', minutes: 8,
    says: '15 drawn three-against-three plays: the open teammate, drive or hold with the ball; cut, fill or stay without it. 12 of 15 (80%).' },
  'BB3:decision_clips': { how: 'items', build: 'bb_scenes', mix: [['4v4', 9]], twice: true, rt: true, rule: { right: 15 }, source: 'screen', minutes: 10,
    gap: 'Drawn from above, not first-person as in Rösch 2021; response times are recorded and shown, not yet gated (the learner\'s band needs their own history).',
    says: '18 four-against-four plays (9 scenes, each shown twice in random order): the pass left or right, outside or inside, or the drive. 15 of 18 (80%); your answer times are recorded.' },
  'BB4-5:decision_clips': { how: 'items', build: 'bb_scenes', mix: [['ball_screen', 12], ['kick', 6], ['transition', 6]], rule: { right: 20 }, source: 'screen', minutes: 12,
    says: '24 drawn plays: ball-screen reads, drive-and-kick after help, and the fast break. 20 of 24 (80%).' },
  'BB6-7:decision_clips': { how: 'items', build: 'bb_scenes', mix: [['transition', 10], ['zone', 10], ['late_clock', 10]], rule: { right: 24 }, source: 'screen', minutes: 15,
    says: '30 drawn plays: transition numbers, which defence they are in, and late-clock choices. 24 of 30 (80%).' },
  'BB4-5:spot_shooting_by_zone': { how: 'count', fields: zoneFields(100), choice: RANGE, min_n: 17, rule: { zones: { mid: 0.45, three: 0.33 }, conf: 0.8 }, minutes: 45,
    says: 'Catch-and-shoot from 5 spots, at least 17 shots at each (about 50 over 3 sessions): in every zone, 80% sure your true rate reaches the mark, 45% mid-range or 33% from your age\'s 3-point line [R].' },
  'BB4-5:free_throws': { how: 'count', fields: [['makes', 'Made', 0, 200], ['attempts', 'Tried', 1, 200]], min_n: 50, rule: { rate: 0.65, conf: 0.8 }, minutes: 25,
    says: 'Free throws from the FIBA line (5.80 m from the inside of the end line), at least 50 (100 over two days): 80% sure your true rate is 65% or better.' },
  'BB6-7:shooting_profile': { how: 'count', fields: zoneFields(150), choice: RANGE, min_n: 25, rule: { zones: { mid: 0.5, three: 0.36 }, conf: 0.8, intervals: true }, minutes: 60,
    says: 'Your shots by zone from game and practice, at least 25 in each of the 5 zones: in every zone, 80% sure your true rate reaches the varsity mark, 50% mid-range or 36% from three [R]. Each zone\'s estimate is shown with its range.' },
  'BB8-12:applied_tasks': { how: 'items', build: 'bb_applied', parts: [{ skill: 'bb_stats', difficulties: [7, 8, 9, 10], count: 8 }, { skill: 'bb_rules', difficulty: 7, count: 2 }], rule: { right: 8 }, source: 'screen', minutes: 15,
    gap: 'Only the verifiable computations and rules calls are machine-checked; the scouting report and game plan need a rubric and a person.',
    says: '10 applied tasks: box-score computations (shooting percentages, eFG%, true shooting, possessions, ratings) and rules calls. 8 of 10.' },
};

module.exports = { CHECKS, ZONES, RANGE };
