// Checks every song in content/piano-songs.js:
//   - it parses, its bars add up, each hand fits its grade (songProblems)
//   - the melody note sounding on each chord's first beat is a chord tone, or is
//     listed as a known passing note (an appoggiatura or a passing tone written on purpose)
//   - the left hand on each chord's first beat is a chord tone
// and prints each melody bar by bar in letter names, to read against the tune as known.
//
//   NODE_PATH=../node_modules node scripts/piano-songs-check.js [--quiet]
const P = require('../public/engine/piano/piano-core');
const { SONGS, songProblems } = require('../content/piano-songs');

const quiet = process.argv.includes('--quiet');
// Non-chord notes on a chord's first beat that are in the tune on purpose.
const KNOWN = {
  'jingle-bells': [5, 13], // bars 6 and 14: F over C on "is to ride", a 4-3 suspension in the tune
  'canon-in-d': [],
};

let failures = 0;
const names = (ms) => ms.map((m) => P.midiToName(m).replace(/-?\d+$/, '')).join('+');
for (const song of SONGS) {
  const problems = songProblems(song, null);
  const rh = P.parsePart(song.rh);
  const lh = P.parsePart(song.lh);
  const { chords } = P.parseChords(song.chords, song.beatsPerBar, song.pickup || 0);
  const clashes = [];
  chords.forEach((c) => {
    const tones = new Set(c.midis.map(P.pitchClass).concat([P.pitchClass(c.bass)]));
    const sounding = (part) => part.events.filter((e) => e.beat <= c.beat + 1e-6 && e.beat + e.beats > c.beat + 1e-6);
    const bar = song.pickup ? Math.floor((c.beat - song.pickup) / song.beatsPerBar) + 1 : Math.floor(c.beat / song.beatsPerBar);
    for (const [hand, part] of [['rh', rh], ['lh', lh]]) {
      for (const e of sounding(part)) {
        // Only notes that start on the chord's beat: a held note may become a passing note.
        if (Math.abs(e.beat - c.beat) > 1e-6) continue;
        const off = e.midis.filter((m) => !tones.has(P.pitchClass(m)));
        if (off.length && !(hand === 'rh' && (KNOWN[song.id] || []).includes(bar))) clashes.push(`${hand} bar ${bar + 1} beat ${c.beat}: ${names(off)} over ${c.symbol}`);
      }
    }
  });
  const bad = problems.length || clashes.length;
  if (bad) failures++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${song.id} (${song.grade}, ${rh.length} beats, ${rh.bars.length} bars)`);
  problems.forEach((p) => console.log(`       problem: ${p}`));
  clashes.forEach((p) => console.log(`       off the chord: ${p}`));
  if (!quiet) {
    const bars = [];
    rh.events.forEach((e) => { (bars[e.bar] = bars[e.bar] || []).push(names(e.midis) + (e.beats !== 1 ? `:${e.beats}` : '')); });
    console.log(`       ${bars.map((b) => (b || []).join(' ')).join(' | ')}`);
  }
}
console.log(failures ? `\n${failures} song(s) need a look` : `\nall ${SONGS.length} songs check out`);
process.exit(failures ? 1 : 0);
