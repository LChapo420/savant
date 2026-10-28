/**
 * The piano song library: short public-domain songs in our own simple arrangements,
 * for the song player (Piano_Song) and the song path.
 *
 * Copyright: every song here is traditional or by a composer who died long ago, and
 * every arrangement (the left hand, the rhythm simplifications, the chords) is our
 * own. Each song says why it is public domain in `publicDomain`. Nothing comes from
 * a modern arrangement, a film, a game or another app. Skipped on purpose: "Happy
 * Birthday" (public domain in the US since 2016, but not settled in every country),
 * and anything known mainly from a recording or a film.
 *
 * Notation (public/engine/piano/piano-core.js parsePart): tokens separated by spaces,
 * bars by "|"; "E4" is one beat, "D4:2" two beats, "C3+E3+G3" a chord, "r" a rest.
 * `beatsPerBar` counts the beats a bar holds (6/8 is written with the eighth as the
 * beat). `pickup` is the length of an opening part-bar. `chords` is the backing the
 * app plays when both hands are the learner's: one symbol per bar, or several to
 * share a bar evenly; "-" is a bar with no chord.
 *
 * Every note was checked against the melody as it is known (see TOOLS-NOTES.md) and
 * by scripts/piano-songs-check.js: bars add up, each hand fits the grade, and the
 * melody sits on the chord on strong beats.
 */
const P = require('../public/engine/piano/piano-core');

const TRAD = (detail) => ({ basis: 'traditional', detail });
const COMPOSER = (name, died, detail) => ({ basis: 'composer', name, died, detail });

const SONGS = [
  // ── Grade 1: Keyboard Explorer (black keys, one finger, by ear) ───────────────
  {
    id: 'hot-cross-buns-black', title: 'Hot Cross Buns (black keys)', by: 'Traditional', grade: 'piano_keyboard_explorer',
    key: 'F# major, black keys only', beatsPerBar: 4, tempo: 72,
    publicDomain: TRAD('English street cry, printed by 1798.'),
    rh: 'A#4 G#4 F#4:2 | A#4 G#4 F#4:2 | F#4:0.5 F#4:0.5 F#4:0.5 F#4:0.5 G#4:0.5 G#4:0.5 G#4:0.5 G#4:0.5 | A#4 G#4 F#4:2',
    lh: 'F#3:4 | F#3:4 | F#3:2 C#3:2 | F#3:4',
    chords: 'F# | F# | F# C# | F#',
  },
  {
    id: 'mary-black', title: 'Mary Had a Little Lamb (black keys)', by: 'Traditional', grade: 'piano_keyboard_explorer',
    key: 'F# major, black keys only', beatsPerBar: 4, tempo: 84,
    publicDomain: TRAD('American nursery song: words by Sarah Josepha Hale (1830, died 1879), tune as set by Lowell Mason (died 1872).'),
    rh: 'A#4 G#4 F#4 G#4 | A#4 A#4 A#4:2 | G#4 G#4 G#4:2 | A#4 C#5 C#5:2 | A#4 G#4 F#4 G#4 | A#4 A#4 A#4 A#4 | G#4 G#4 A#4 G#4 | F#4:4',
    lh: 'F#3:4 | F#3:4 | C#3:4 | F#3:4 | F#3:4 | F#3:4 | C#3:4 | F#3:4',
    chords: 'F# | F# | C# | F# | F# | F# | C# | F#',
  },
  {
    id: 'old-macdonald-black', title: 'Old MacDonald (black keys)', by: 'Traditional', grade: 'piano_keyboard_explorer',
    key: 'F# major, black keys only', beatsPerBar: 4, tempo: 92,
    publicDomain: TRAD('Folk song; this form was printed in 1917, older versions go back to the 1700s.'),
    rh: 'F#4 F#4 F#4 C#4 | D#4 D#4 C#4:2 | A#4 A#4 G#4 G#4 | F#4:3 C#4 | F#4 F#4 F#4 C#4 | D#4 D#4 C#4:2 | A#4 A#4 G#4 G#4 | F#4:4',
    lh: 'F#3:4 | D#3:2 F#3:2 | F#3:2 C#3:2 | F#3:4 | F#3:4 | D#3:2 F#3:2 | F#3:2 C#3:2 | F#3:4',
    chords: 'F# | B F# | F# C# | F# | F# | B F# | F# C# | F#',
  },

  // ── Grade 2: Pre-Reader (five-finger C position, steady quarter notes) ─────────
  {
    id: 'hot-cross-buns', title: 'Hot Cross Buns', by: 'Traditional', grade: 'piano_pre_reader',
    key: 'C major', beatsPerBar: 4, tempo: 80,
    publicDomain: TRAD('English street cry, printed by 1798.'),
    rh: 'E4 D4 C4:2 | E4 D4 C4:2 | C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 | E4 D4 C4:2',
    lh: 'C3:4 | C3:4 | C3:2 G2:2 | C3:4',
    chords: 'C | C | C G | C',
  },
  {
    id: 'mary-had-a-little-lamb', title: 'Mary Had a Little Lamb', by: 'Traditional', grade: 'piano_pre_reader',
    key: 'C major', beatsPerBar: 4, tempo: 92,
    publicDomain: TRAD('American nursery song: words by Sarah Josepha Hale (1830, died 1879), tune as set by Lowell Mason (died 1872).'),
    rh: 'E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4',
    lh: 'C3:4 | C3:4 | G2:4 | C3:4 | C3:4 | C3:4 | G2:4 | C3:4',
    chords: 'C | C | G | C | C | C | G | C',
  },
  {
    id: 'ode-to-joy-first-steps', title: 'Ode to Joy (first steps)', by: 'Ludwig van Beethoven', grade: 'piano_pre_reader',
    key: 'C major', beatsPerBar: 4, tempo: 92,
    publicDomain: COMPOSER('Ludwig van Beethoven', 1827, 'Theme from the Ninth Symphony (1824), first half, in even quarter notes. Our own arrangement, not the European anthem arrangement.'),
    rh: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4 D4 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4 C4 C4:2',
    lh: 'C3:4 | G2:4 | C3:4 | C3:2 G2:2 | C3:4 | G2:4 | C3:4 | G2:2 C3:2',
    chords: 'C | G | C | C G | C | G | C | G C',
  },
  {
    id: 'lightly-row', title: 'Lightly Row', by: 'Traditional (German)', grade: 'piano_pre_reader',
    key: 'C major', beatsPerBar: 4, tempo: 96,
    publicDomain: TRAD('German folk song ("Hänschen klein"), 19th century.'),
    rh: 'G4 E4 E4:2 | F4 D4 D4:2 | C4 D4 E4 F4 | G4 G4 G4:2 | G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4 | D4 D4 D4 D4 | D4 E4 F4:2 | E4 E4 E4 E4 | E4 F4 G4:2 | G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4',
    lh: 'C3:4 | G2:4 | C3:4 | C3:4 | C3:4 | G2:4 | C3:4 | C3:4 | G2:4 | G2:4 | C3:4 | C3:4 | C3:4 | G2:4 | C3:4 | C3:4',
    chords: 'C | G7 | C | C | C | G7 | C | C | G7 | G7 | C | C | C | G7 | C | C',
  },

  // ── Grade 3: First Reader (five-finger positions, hands together simply) ───────
  {
    id: 'twinkle-twinkle', title: 'Twinkle, Twinkle, Little Star', by: 'Traditional (French)', grade: 'piano_first_reader',
    key: 'C major', beatsPerBar: 4, tempo: 96,
    publicDomain: TRAD('French melody "Ah! vous dirai-je, maman" (printed 1761); words by Jane Taylor (1806, died 1824).'),
    rh: 'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2',
    lh: 'C3:4 | F3:2 C3:2 | F3:2 C3:2 | G3:2 C3:2 | C3:2 G3:2 | C3:2 G3:2 | C3:2 G3:2 | C3:2 G3:2 | C3:4 | F3:2 C3:2 | F3:2 C3:2 | G3:2 C3:2',
    chords: 'C | F C | F C | G C | C G7 | C G | C G7 | C G | C | F C | F C | G C',
  },
  {
    id: 'london-bridge', title: 'London Bridge', by: 'Traditional', grade: 'piano_first_reader',
    key: 'C major', beatsPerBar: 4, tempo: 100,
    publicDomain: TRAD('English nursery rhyme, printed by 1744.'),
    rh: 'G4 A4 G4 F4 | E4 F4 G4:2 | D4 E4 F4:2 | E4 F4 G4:2 | G4 A4 G4 F4 | E4 F4 G4:2 | D4:2 G4:2 | E4 C4:3',
    lh: 'C3:4 | C3:4 | G3:4 | C3:4 | C3:4 | C3:4 | G3:4 | C3:4',
    chords: 'C | C | G | C | C | C | G | C',
  },
  {
    id: 'au-clair-de-la-lune', title: 'Au Clair de la Lune', by: 'Traditional (French)', grade: 'piano_first_reader',
    key: 'C major', beatsPerBar: 4, tempo: 92,
    publicDomain: TRAD('French folk song, 18th century.'),
    rh: 'C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4 | C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4 | D4 D4 D4 D4 | A3:2 A3:2 | D4 C4 B3 A3 | G3:4 | C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4',
    lh: 'C3:4 | C3:2 G2:2 | C3:2 G2:2 | C3:4 | C3:4 | C3:2 G2:2 | C3:2 G2:2 | C3:4 | G2:4 | D3:4 | G2:4 | G2:4 | C3:4 | C3:2 G2:2 | C3:2 G2:2 | C3:4',
    chords: 'C | C G | C G | C | C | C G | C G | C | G | Dm | G | G | C | C G | C G | C',
  },
  {
    id: 'this-old-man', title: 'This Old Man', by: 'Traditional', grade: 'piano_first_reader',
    key: 'C major', beatsPerBar: 4, tempo: 100,
    publicDomain: TRAD('English counting song, collected in 1906.'),
    rh: 'G4 E4 G4:2 | G4 E4 G4:2 | A4 G4 F4 E4 | D4 E4 F4:2 | E4:0.5 F4:0.5 G4 C4 C4:0.5 C4:0.5 | C4 C4:0.5 D4:0.5 E4:0.5 F4:0.5 G4 | G4 D4 D4 F4 | E4 D4 C4:2',
    lh: 'C3:4 | C3:4 | F3:4 | G3:4 | C3:4 | C3:4 | G3:4 | C3:4',
    chords: 'C | C | F | G7 | C | C | G7 | C',
  },
  {
    id: 'old-macdonald', title: 'Old MacDonald', by: 'Traditional', grade: 'piano_first_reader',
    key: 'C major', beatsPerBar: 4, tempo: 104,
    publicDomain: TRAD('Folk song; this form was printed in 1917, older versions go back to the 1700s.'),
    rh: 'C4 C4 C4 G3 | A3 A3 G3:2 | E4 E4 D4 D4 | C4:3 G3 | C4 C4 C4 G3 | A3 A3 G3:2 | E4 E4 D4 D4 | C4:4',
    lh: 'C3:4 | F2:2 C3:2 | C3:2 G2:2 | C3:4 | C3:4 | F2:2 C3:2 | C3:2 G2:2 | C3:4',
    chords: 'C | F C | C G | C | C | F C | C G | C',
  },
  {
    id: 'frere-jacques', title: 'Frère Jacques', by: 'Traditional (French)', grade: 'piano_first_reader',
    key: 'C major', beatsPerBar: 4, tempo: 100,
    publicDomain: TRAD('French round, 18th century.'),
    rh: 'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | C4 G3 C4:2 | C4 G3 C4:2',
    lh: 'C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:4',
    chords: 'C | C | C | C | C | C | C | C',
  },

  // ── Grade 4: Elementary 1 (dotted rhythms, 6/8, longer hands-together) ────────
  {
    id: 'ode-to-joy', title: 'Ode to Joy', by: 'Ludwig van Beethoven', grade: 'piano_elementary_1',
    key: 'C major', beatsPerBar: 4, tempo: 100,
    publicDomain: COMPOSER('Ludwig van Beethoven', 1827, 'Theme from the Ninth Symphony (1824). Our own arrangement, not the European anthem arrangement.'),
    rh: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2 | D4 D4 E4 C4 | D4 E4:0.5 F4:0.5 E4 C4 | D4 E4:0.5 F4:0.5 E4 D4 | C4 D4 G3:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2',
    lh: 'C3:2 G3:2 | G2:2 D3:2 | C3:2 G3:2 | C3:2 G2:2 | C3:2 G3:2 | G2:2 D3:2 | C3:2 G3:2 | G2:2 C3:2 | G2:2 C3:2 | G2:2 C3:2 | G2:4 | C3:2 G2:2 | C3:2 G3:2 | G2:2 D3:2 | C3:2 G3:2 | G2:2 C3:2',
    chords: 'C | G | C | C G | C | G | C | G C | G C | G C | G | C G | C | G | C | G C',
  },
  {
    id: 'row-row-row', title: 'Row, Row, Row Your Boat', by: 'Traditional', grade: 'piano_elementary_1',
    key: 'C major, 6/8', beatsPerBar: 6, tempo: 160,
    publicDomain: TRAD('American round, printed in 1852; tune credited to Eliphalet Oram Lyte (1881, died 1913).'),
    rh: 'C4:3 C4:3 | C4:2 D4 E4:3 | E4:2 D4 E4:2 F4 | G4:6 | C5 C5 C5 G4 G4 G4 | E4 E4 E4 C4 C4 C4 | G4:2 F4 E4:2 D4 | C4:6',
    lh: 'C3:6 | C3:6 | C3:6 | C3:6 | C3:6 | C3:6 | G2:6 | C3:6',
    chords: 'C | C | C | C | C | C | G | C',
  },
  {
    id: 'jingle-bells', title: 'Jingle Bells (chorus)', by: 'James Lord Pierpont', grade: 'piano_elementary_1',
    key: 'C major', beatsPerBar: 4, tempo: 108,
    publicDomain: COMPOSER('James Lord Pierpont', 1893, 'Published in 1857.'),
    rh: 'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | E4 D4 D4 E4 | D4:2 G4:2 | E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | G4 G4 F4 D4 | C4:4',
    lh: 'C3:4 | C3:4 | C3:4 | C3:4 | F3:4 | C3:4 | C3:2 G3:2 | G3:4 | C3:4 | C3:4 | C3:4 | C3:4 | F3:4 | C3:4 | G3:4 | C3:4',
    chords: 'C | C | C | C | F | C | C G7 | G7 | C | C | C | C | F | C | G7 | C',
  },

  // ── Grade 5: Elementary 2 ───────────────────────────────────────────────────────
  {
    id: 'minuet-in-g', title: 'Minuet in G', by: 'Christian Petzold', grade: 'piano_elementary_2',
    key: 'G major, 3/4', beatsPerBar: 3, tempo: 100,
    publicDomain: COMPOSER('Christian Petzold', 1733, 'BWV Anh. 114, from the 1725 Notebook for Anna Magdalena Bach. First 16 bars; the left hand is our own simplified part.'),
    rh: 'D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 | C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | F#4 G4:0.5 A4:0.5 B4:0.5 G4:0.5 | A4:3 | D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 | C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | A4 B4:0.5 A4:0.5 G4:0.5 F#4:0.5 | G4:3',
    lh: 'G3:3 | B2:3 | C3:3 | B2:3 | A2:3 | G2:3 | D3:3 | D3:3 | G3:3 | B2:3 | C3:3 | B2:3 | A2:3 | G2:3 | D3:3 | G2:3',
    chords: 'G | G | C | G | Am | G | D | D | G | G | C | G | Am | G | D7 | G',
  },
  {
    id: 'canon-in-d', title: 'Canon in D (theme)', by: 'Johann Pachelbel', grade: 'piano_elementary_2',
    key: 'D major', beatsPerBar: 4, tempo: 66,
    publicDomain: COMPOSER('Johann Pachelbel', 1706, 'The ground bass and the first violin line, in our own two-hand arrangement.'),
    rh: 'F#5 E5 D5 C#5 | B4 A4 B4 C#5 | D5 C#5 B4 A4 | G4 F#4 G4 E4 | F#4+A4+D5:4',
    lh: 'D3 A2 B2 F#2 | G2 D2 G2 A2 | D3 A2 B2 F#2 | G2 D2 G2 A2 | D3:4',
    chords: 'D A Bm F#m | G D G A | D A Bm F#m | G D G A | D',
  },

  // ── Grade 6: Lower Intermediate ─────────────────────────────────────────────────
  {
    id: 'greensleeves', title: 'Greensleeves', by: 'Traditional', grade: 'piano_lower_intermediate',
    key: 'A minor, 3/4', beatsPerBar: 3, pickup: 1, tempo: 92,
    publicDomain: TRAD('English song, registered in 1580.'),
    rh: 'A4 | C5:2 D5 | E5:1.5 F5:0.5 E5 | D5:2 B4 | G4:1.5 A4:0.5 B4 | C5:2 A4 | A4:1.5 G#4:0.5 A4 | B4:2 G#4 | E4:2 A4 | C5:2 D5 | E5:1.5 F5:0.5 E5 | D5:2 B4 | G4:1.5 A4:0.5 B4 | C5:1.5 B4:0.5 A4 | G#4:1.5 F#4:0.5 G#4 | A4:3',
    lh: 'r | A2:3 | C3:3 | G2:3 | E2:3 | A2:3 | A2:3 | E2:3 | A2:3 | A2:3 | C3:3 | G2:3 | E2:3 | A2:3 | E2:3 | A2:3',
    chords: '- | Am | C | G | Em | Am | Am | E | Am | Am | C | G | Em | Am | E | Am',
  },
  {
    id: 'fur-elise', title: 'Für Elise (opening)', by: 'Ludwig van Beethoven', grade: 'piano_lower_intermediate',
    key: 'A minor, 3/8', beatsPerBar: 3, pickup: 1, tempo: 120,
    publicDomain: COMPOSER('Ludwig van Beethoven', 1827, 'Bagatelle in A minor, WoO 59 (1810). The opening eight bars, with the eighth note as the beat.'),
    rh: 'E5:0.5 D#5:0.5 | E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 | A4 r:0.5 C4:0.5 E4:0.5 A4:0.5 | B4 r:0.5 E4:0.5 G#4:0.5 B4:0.5 | C5 r:0.5 E4:0.5 E5:0.5 D#5:0.5 | E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 | A4 r:0.5 C4:0.5 E4:0.5 A4:0.5 | B4 r:0.5 E4:0.5 C5:0.5 B4:0.5 | A4:2',
    lh: 'r | r:3 | A2:0.5 E3:0.5 A3:0.5 r:1.5 | E2:0.5 E3:0.5 G#3:0.5 r:1.5 | A2:0.5 E3:0.5 A3:0.5 r:1.5 | r:3 | A2:0.5 E3:0.5 A3:0.5 r:1.5 | E2:0.5 E3:0.5 G#3:0.5 r:1.5 | A2:0.5 E3:0.5 A3:1',
    chords: '- | - | Am | E | Am | - | Am | E | Am',
  },
  {
    id: 'prelude-in-c', title: 'Prelude in C (opening)', by: 'Johann Sebastian Bach', grade: 'piano_lower_intermediate',
    key: 'C major', beatsPerBar: 4, tempo: 60,
    publicDomain: COMPOSER('Johann Sebastian Bach', 1750, 'BWV 846, The Well-Tempered Clavier, Book 1 (1722). The first four bars as broken chords, the left hand simplified to two notes together, and our own closing chord.'),
    rh: [
      'r:0.5 G4:0.25 C5:0.25 E5:0.25 G4:0.25 C5:0.25 E5:0.25 r:0.5 G4:0.25 C5:0.25 E5:0.25 G4:0.25 C5:0.25 E5:0.25',
      'r:0.5 A4:0.25 D5:0.25 F5:0.25 A4:0.25 D5:0.25 F5:0.25 r:0.5 A4:0.25 D5:0.25 F5:0.25 A4:0.25 D5:0.25 F5:0.25',
      'r:0.5 G4:0.25 D5:0.25 F5:0.25 G4:0.25 D5:0.25 F5:0.25 r:0.5 G4:0.25 D5:0.25 F5:0.25 G4:0.25 D5:0.25 F5:0.25',
      'r:0.5 G4:0.25 C5:0.25 E5:0.25 G4:0.25 C5:0.25 E5:0.25 r:0.5 G4:0.25 C5:0.25 E5:0.25 G4:0.25 C5:0.25 E5:0.25',
      'G4+C5+E5:4',
    ].join(' | '),
    lh: 'C4+E4:2 C4+E4:2 | C4+D4:2 C4+D4:2 | B3+D4:2 B3+D4:2 | C4+E4:2 C4+E4:2 | C3+C4:4',
    chords: 'C | Dm7/C | G7/B | C | C',
  },
];

const BY_ID = new Map(SONGS.map((s) => [s.id, s]));

/** A grade id's number on the piano path (1 = Keyboard Explorer). */
function gradeNumber(gradeId) {
  // eslint-disable-next-line global-require
  return require('../services/piano-checks').gradeNumber(gradeId);
}

/**
 * Why a song (from the library, or written into a block) cannot be played at a
 * grade: unreadable notes, bars that do not add up, a hand stretched past the grade,
 * notes too short for the grade, chords before a hand can play them.
 *
 * @param {object} song { beatsPerBar, pickup?, tempo, rh, lh?, chords? }
 * @param {number|null} grade the grade's number, or null for the song's own
 */
function songProblems(song, grade) {
  const problems = [];
  const g = grade || gradeNumber(song.grade) || 7;
  const per = Number(song.beatsPerBar);
  if (!(per >= 2 && per <= 6)) return ['beatsPerBar: from 2 to 6'];
  const pickup = Number(song.pickup || 0);
  // eslint-disable-next-line global-require
  const { handSpan } = require('../services/piano-checks');
  const parts = { rh: P.parsePart(song.rh), lh: song.lh ? P.parsePart(song.lh) : null };
  if (!parts.rh.events.length) problems.push('rh: no notes');
  for (const [hand, part] of Object.entries(parts)) {
    if (!part) continue;
    if (part.errors.length) { problems.push(`${hand}: ${part.errors[0]}`); continue; }
    part.bars.forEach((len, i) => {
      const last = i === part.bars.length - 1;
      const want = i === 0 && pickup ? pickup : per;
      if (Math.abs(len - want) > 1e-6 && !(last && len < per)) problems.push(`${hand}: bar ${i + 1} has ${len} beats, not ${want}`);
    });
    const midis = part.events.flatMap((e) => e.midis);
    if (midis.length) {
      const span = Math.max(...midis) - Math.min(...midis);
      if (span > handSpan(g)) problems.push(`${hand}: the part spans ${span} semitones, more than one hand reaches at this grade (${handSpan(g)})`);
    }
    for (const e of part.events) {
      if (Math.abs(e.beats * 4 - Math.round(e.beats * 4)) > 1e-6 || e.beats > per) { problems.push(`${hand}: a note of ${e.beats} beats (lengths are quarters of a beat, at most a bar)`); break; }
      if (g <= 2 && e.beats < 0.5) { problems.push(`${hand}: notes shorter than half a beat are too quick at this grade`); break; }
      if (g <= 3 && e.midis.length > 1) { problems.push(`${hand}: two notes at once in one hand is not taught yet at this grade`); break; }
      if (e.midis.length > 4 || (e.midis.length > 1 && Math.max(...e.midis) - Math.min(...e.midis) > 12)) { problems.push(`${hand}: a chord wider than an octave or of more than four notes`); break; }
    }
  }
  if (parts.lh && !parts.lh.errors.length && !parts.rh.errors.length) {
    if (Math.abs(parts.lh.length - parts.rh.length) > 1e-6) problems.push(`lh: ${parts.lh.length} beats long, but rh is ${parts.rh.length}`);
    const avg = (part) => { const m = part.events.flatMap((e) => e.midis); return m.reduce((s, x) => s + x, 0) / Math.max(1, m.length); };
    if (parts.lh.events.length && avg(parts.lh) >= avg(parts.rh)) problems.push('lh: the left hand sits above the right hand');
  }
  if (parts.rh.length > 96) problems.push(`rh: ${parts.rh.length} beats is too long for one song here (at most 96)`);
  if (song.chords) {
    const c = P.parseChords(song.chords, per, pickup);
    if (c.errors.length) problems.push(`chords: ${c.errors[0]}`);
  }
  const tempo = Number(song.tempo);
  if (!(tempo >= 40 && tempo <= 180)) problems.push('tempo: from 40 to 180');
  return problems;
}

/**
 * Problems with a Piano_Song block's data: a library song is named by id and must be
 * at or below the level's grade; a song written into the block must be playable there.
 */
function songBlockProblems(data, grade) {
  const problems = [];
  if (data.hands !== undefined && !['right', 'left', 'both'].includes(data.hands)) problems.push('hands: "right", "left" or "both"');
  if (data.mode !== undefined && !['learn', 'play'].includes(data.mode)) problems.push('mode: "learn" or "play"');
  if (data.song) {
    const song = BY_ID.get(String(data.song));
    if (!song) return problems.concat([`song: "${data.song}" is not in the song library; use one of its ids`]);
    if (data.rh || data.lh) problems.push('rh/lh: a library song brings its own notes; leave rh and lh out');
    const at = gradeNumber(song.grade);
    if (grade && at > grade) problems.push(`song: "${song.id}" is a grade ${at} song, harder than this level's grade (${grade}); choose one at or below it`);
    if (grade && grade <= 1 && data.hands === 'both') problems.push('hands: Keyboard Explorer learners play one hand at a time');
    return problems;
  }
  if (!data.rh) return problems.concat(['song: give a library song id, or write rh']);
  const written = { beatsPerBar: data.beatsPerBar || 4, tempo: data.tempo || 80, rh: data.rh, lh: data.lh };
  return problems.concat(songProblems(written, grade));
}

const SPEEDS = [0.5, 0.75, 1];
const MAX_EVENTS = 3000;

/**
 * Score a take on the server, from what the page sent: the presses in learn mode, the
 * timed notes (ms from beat 0) in play mode. The same piano-core functions the page
 * used, so the two cannot disagree; the page's own stars are never trusted.
 *
 * @returns {{stars, score, notes, timing, estimated, mode, hands, speed}|{error}}
 */
function scoreTake(song, body) {
  const b = body || {};
  const mode = b.mode === 'play' ? 'play' : b.mode === 'learn' ? 'learn' : null;
  if (!mode) return { error: 'mode must be "learn" or "play".' };
  const hands = ['right', 'left', 'both'].includes(b.hands) ? b.hands : null;
  if (!hands) return { error: 'hands must be "right", "left" or "both".' };
  if (hands !== 'right' && !song.lh) return { error: 'This song has no left-hand part.' };
  const speed = SPEEDS.includes(Number(b.speed)) ? Number(b.speed) : null;
  if (!speed) return { error: 'speed must be 0.5, 0.75 or 1.' };
  const list = Array.isArray(mode === 'learn' ? b.presses : b.played) ? (mode === 'learn' ? b.presses : b.played) : null;
  if (!list || !list.length) return { error: 'No notes were sent.' };
  if (list.length > MAX_EVENTS) return { error: 'Too many notes for one take.' };
  const notes = [];
  for (const x of list) {
    const midi = Number(x && x.midi);
    if (!Number.isInteger(midi) || midi < 0 || midi > 127) return { error: 'A note was not a key number.' };
    const time = Number(x.time);
    if (mode === 'play' && !Number.isFinite(time)) return { error: 'A note had no time.' };
    notes.push({ midi, time, source: ['midi', 'mic', 'screen', 'computer'].includes(x.source) ? x.source : 'screen', confidence: Number(x.confidence) || 0 });
  }
  const estimated = notes.some((n) => n.source === 'mic');
  const parts = P.songParts(song, hands);
  if (mode === 'learn') {
    const r = P.learnScore(parts.steps, notes, { octaveFree: estimated });
    return { ...P.songStars('learn', r, { speed }), mode, hands, speed, estimated, done: r.done, total: r.total, wrong: r.wrong };
  }
  const r = P.scoreSong(parts.target, notes, { tempo: song.tempo * speed, octaveFree: estimated });
  return { ...P.songStars('play', r, { speed }), mode, hands, speed, estimated, total: r.total, correct: r.correct, extra: r.extra.length };
}

/** The public view of a song, for the player: everything but internal notes. */
function publicSong(song) {
  if (!song) return null;
  const { id, title, by, grade, key, beatsPerBar, pickup, tempo, rh, lh, chords, publicDomain } = song;
  return { id, title, by, grade, gradeNumber: gradeNumber(grade), key, beatsPerBar, pickup: pickup || 0, tempo, rh, lh, chords, publicDomain };
}

const get = (id) => BY_ID.get(String(id)) || null;
const ids = () => SONGS.map((s) => s.id);

/** One line per song for the model: id, title and grade, so it names a song rather than writing one. */
function catalogText() {
  return SONGS.map((s) => `${s.id} (grade ${gradeNumber(s.grade)}: ${s.title})`).join('; ');
}

/** The library's song titles in one line, for the layout call: "Hot Cross Buns, ... and Prelude in C". */
function titlesText() {
  const seen = [];
  SONGS.forEach((s) => {
    const t = s.title.replace(/\s*\(.*?\)/g, '');
    if (!seen.includes(t)) seen.push(t);
  });
  return `${seen.slice(0, -1).join(', ')} and ${seen[seen.length - 1]} (the first three also on the black keys)`;
}

module.exports = { SONGS, get, ids, songProblems, songBlockProblems, scoreTake, publicSong, catalogText, titlesText, gradeNumber };
