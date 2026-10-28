// The piano track: the theory engine against known answers in every key, every
// piano bank skill producing well-formed items, and the generated track agreeing
// with its sheet.
const fs = require('fs');
const path = require('path');
const T = require('../content/piano-theory');
const bank = require('../content/bank');
const curriculum = require('../config/curriculum');
const { GENERATORS } = require('../content/piano-items');
const { parseCsv } = require('./build-sheet-track');

let failures = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failures++;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('theory');
ok(same(T.majorScale('E'), ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#']), 'E major is spelled with four sharps');
ok(same(T.majorScale('Cb'), ['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']), 'Cb major is spelled with seven flats');
ok(same(T.minorScale('G#', 'harmonic'), ['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F##']), 'G# harmonic minor raises F# to F##');
ok(same(T.minorScale('D', 'melodic'), ['D', 'E', 'F', 'G', 'A', 'B', 'C#']), 'D melodic minor ascending');
ok(T.intervalName('F#', 'C') === 'diminished 5th' && T.intervalName('F', 'B') === 'augmented 4th', 'a tritone is named by its spelling');
ok(T.intervalName('Bb', 'A') === 'major 7th' && T.intervalName('E', 'C') === 'minor 6th', 'sevenths and sixths');
ok(same(T.chord('B', 'half-diminished 7th'), ['B', 'D', 'F', 'A']), 'Bm7b5 is B D F A');
ok(same(T.chord('G#', 'diminished 7th'), ['G#', 'B', 'D', 'F']), 'G#dim7 is G# B D F');
ok(T.staffNote('treble', -2).letter === 'C' && T.staffNote('treble', -2).octave === 4, 'middle C is a ledger line below the treble staff');
ok(T.staffNote('bass', 10).letter === 'C' && T.staffNote('bass', 10).octave === 4, 'and a ledger line above the bass staff');
let sigs = true;
for (const [k, n] of Object.entries(T.MAJOR_KEYS)) {
  const accidentals = T.majorScale(k).filter((x) => x.length > 1);
  if (accidentals.length !== Math.abs(n) || !T.signature(n).every((x) => accidentals.includes(x))) sigs = false;
}
for (const [k, n] of Object.entries(T.MINOR_KEYS)) {
  const accidentals = T.minorScale(k).filter((x) => x.length > 1);
  if (accidentals.length !== Math.abs(n) || !T.signature(n).every((x) => accidentals.includes(x))) sigs = false;
}
ok(sigs, 'all 30 key signatures match their scales');
ok(T.relativeMinor('Eb') === 'C' && T.relativeMinor('A') === 'F#', 'relative minors');

console.log('bank items');
for (const skill of Object.keys(GENERATORS)) {
  let good = true;
  let why = '';
  for (let i = 0; i < 40; i++) {
    try {
      const it = bank.generate({ skillId: skill, difficulty: 1 + (i % 10), seed: `${skill}:${i}` });
      if (!it.prompt || !it.answer || !it.rationale) { good = false; why = 'empty field'; }
      if (it.format === 'multiple_choice' && !it.choices.includes(it.answer)) { good = false; why = 'answer not in choices'; }
      if (/undefined|null/.test(it.prompt + it.answer)) { good = false; why = `bad text: ${it.prompt}`; }
    } catch (e) { good = false; why = e.message; }
  }
  ok(good, `${skill} makes 40 well-formed items${why ? ` (${why})` : ''}`);
}

console.log('track');
const track = curriculum.TRACKS.find((t) => t.id === 'piano');
ok(!!track, 'the piano track is registered');
ok(track && track.grades.length === 19, 'it has nineteen grades');
ok(bank.missingSkills().filter((s) => s.startsWith('piano_')).length === 0, 'every piano skill a grade uses has a generator');
const rows = parseCsv(fs.readFileSync(path.join(process.env.SHEET_DIR || path.join(__dirname, '..', 'data'), 'Piano_Grades_Levels.csv'), 'utf8'));
const csvLevels = rows.slice(2).reduce((n, r) => n + r.filter((_, i) => i % 5 === 0 && /^\d+$/.test(String(r[i]).trim())).length, 0);
const trackLevels = track ? track.grades.reduce((n, g) => n + g.levels.length, 0) : 0;
ok(csvLevels === trackLevels, `every sheet row is a level (${csvLevels} rows, ${trackLevels} levels)`);
ok(track && track.grades.every((g) => g.levels.slice(0, 9).every((l) => l.type === 'Tester')), 'every grade opens with nine testers');
ok(track && track.grades.every((g) => g.levels[g.levels.length - 1].type === 'Final'), 'every grade ends on its Final');
ok(track && track.grades.slice(0, 17).every((g) => g.levels[g.levels.length - 2].type === 'Grade Recital'), 'grades 1-17 have a recital before the Final');
ok(track && track.grades.every((g) => g.levels.filter((l) => l.type === 'Lesson').every((l) => l.skill)), 'every lesson has a question skill');

console.log('playing: pitch, scoring and played checks');
const PC = require('../public/engine/piano/piano-core');
const pianoChecks = require('../services/piano-checks');
const grading = require('../services/grading');
const blockLevels = require('../services/block-levels');
// A piano-like tone: six harmonics, slightly stretched, as a real string sounds.
const tone = (m) => {
  const f = PC.midiToFreq(m);
  const b = new Float32Array(4096);
  for (let i = 0; i < b.length; i++) {
    let s = 0;
    for (let k = 1; k <= 6; k++) s += Math.sin(2 * Math.PI * f * k * Math.sqrt(1 + 0.0004 * k * k) * i / 44100) / k;
    b[i] = 0.3 * s;
  }
  return b;
};
let heard = 0;
for (let m = 36; m <= 96; m++) { const r = PC.detectPitch(tone(m), 44100); if (r && r.midi === m) heard++; }
ok(heard === 61, `the microphone detector names every note C2-C7 of a piano-like tone (${heard} of 61)`);
ok(PC.detectPitch(new Float32Array(4096), 44100) === null, 'silence is not a note');
const scale5 = [60, 62, 64, 65, 67].map((m, i) => ({ midi: m, beat: i }));
const slip = PC.scorePerformance(scale5, [{ midi: 60, time: 0 }, { midi: 62, time: 750 }, { midi: 63, time: 1500 }, { midi: 65, time: 2250 }, { midi: 67, time: 3400 }].map((x) => ({ ...x, source: 'mic', confidence: 0.9 })), { tempo: 80 });
ok(slip.wrong.join() === '2' && slip.timing.lateNotes.join() === '4', 'scoring finds the wrong note and the late one');
ok(slip.estimated && slip.notMeasured.includes('dynamics'), 'a microphone take is marked as an estimate, with loudness not measured');
ok(PC.scorePerformance(scale5, [60, 64, 65, 67].map((m, i) => ({ midi: m, time: i * 750 }))).missed.join() === '1', 'a skipped note is missed, not every note after it wrong');
// Written by GLM for piano grade 1 level 32: each has a key that is not the one right answer.
const why = 'Black keys come in groups of two and three.';
ok(!pianoChecks.cleanKeysCheck({ prompt: 'Play any black key near the middle of the keyboard.', answer: 'C#4', rationale: why }), 'an "any black key" check with one key accepted is dropped');
ok(!pianoChecks.cleanKeysCheck({ prompt: 'Play one black key from a 2-group, and then one black key from a 3-group.', answer: 'C#4 D#4 F#4', rationale: why }), 'a check asking for two keys whose key has three notes is dropped');
ok(!pianoChecks.cleanKeysCheck({ prompt: 'Echo back the two-note black-key phrase you just heard.', answer: 'F#4 C#4', rationale: why }), 'an echo check, which plays no sound, is dropped');
ok(!pianoChecks.cleanKeysCheck({ prompt: 'Play the black key just above middle C.', answer: 'D4', rationale: why }), 'a "black key" check keyed to a white key is dropped');
ok(!!pianoChecks.cleanKeysCheck({ prompt: 'Play the two black keys of the group just above middle C, low to high.', answer: 'C#4 D#4', rationale: why }), 'a check with one right answer that matches its prompt is kept');
ok(!!pianoChecks.cleanKeysCheck({ prompt: 'Play the C major chord, in any order.', answer: 'C4 E4 G4', rationale: 'Root, major third, fifth.' }), '"in any order" is not an open-ended prompt');
const alongProblems = pianoChecks.blockProblems('Piano_PlayAlong', { prompt: 'Play any black keys you like with the band.', notes: [{ note: 'C#4', beats: 1 }] });
ok(alongProblems.some((p) => /play what they like/.test(p)) && alongProblems.some((p) => /band/.test(p)), 'a play-along that says "play what you like" with a band is refused on both counts, since it scores each note and plays no band');
const triad = pianoChecks.cleanKeysCheck({ prompt: 'Play the D major triad.', answer: 'D4 F#4 A4', rationale: 'Major third plus minor third from D.' });
ok(triad && triad.mode === 'chord', 'a played chord check is kept');
ok(!pianoChecks.cleanKeysCheck({ prompt: 'Play the D major triad.', answer: 'D4 F4 A4', rationale: 'Major third plus minor third from D.' }), 'a chord check whose key spells the wrong chord is dropped');
ok(!pianoChecks.cleanKeysCheck({ prompt: 'Play the G major scale going up.', answer: 'G3 A3 B3 C4 D4 E4 F4 G4', rationale: 'One sharp, F sharp.' }), 'a scale check missing its sharp is dropped');
ok(grading.grade(triad, 'notes:57,62,66').correct && !grading.grade(triad, 'notes:62,65,69').correct, 'a chord is graded in any order and octave, and a wrong chord is wrong');
// Written by GLM for the same level on its second run (2026-10-21), after the first fixes.
const keep = (prompt, answer) => pianoChecks.inspectKeysCheck({ prompt, answer, rationale: why });
const groupOf3 = keep('Play the three black keys in the group of three just above middle C: the lowest one first, then the middle one, then the highest one.', 'C#4 D#4 F#4');
ok(!groupOf3.check && /group of three/.test(groupOf3.why), 'a "group of three" check keyed C# D# F# is dropped, and the reason names F# G# A#');
ok(!!keep('Play the three black keys in the group of three just above middle C: the lowest one first, then the middle one, then the highest one.', 'F#4 G#4 A#4').check, 'the same prompt keyed F# G# A# is kept');
ok(!keep('Play the jam phrase over the groove, staying centred: start at the bottom of the group of three, walk up to the top, back down to the bottom, then play the group of two below it, and finish back on the first note of the pair.', 'F#4 G#4 A#4 G#4 F#4 C#4 D#4 C#4').check, 'a check that asks for playing "over the groove", which a check never plays, is dropped');
const unordered = keep('Find the group of two black keys closest to middle C and press both notes, one after the other.', 'C#4 D#4').check;
ok(unordered && unordered.mode === 'set' && grading.grade(unordered, 'notes:63,61').correct, 'two different keys asked for with no order are graded in any order, so D# then C# is right too');
// Run 2 (2026-10-21): the fill and the check repair.
const groupNext = keep('Play the two-black-key group next to middle C.', 'C#4 D#4').check;
ok(groupNext && groupNext.mode === 'set', '"next to middle C" is a place, not an order: the group is graded in any order');
ok(!keep('Play the three-black-key group just above middle C, from left to right.', 'C#4 D#4 F#4').check, '"the three-black-key group" keyed C# D# F# is dropped');
const walk = keep('Walk up four black keys in a steady pulse, one key on each beat: start on the lowest key of the group of three just above middle C, then step right each beat — F sharp, G sharp, A sharp, then the next black key above them.', 'F#4 G#4 A#4 C#5');
ok(!walk.check && /not timed/.test(walk.why), 'a walk "one key on each beat" is dropped because a check is not timed, not because the group of three is its starting place');
ok(!!keep('Start on the lowest key of the group of three just above middle C and walk up to the right: F sharp, G sharp, A sharp, then the next black key above them.', 'F#4 G#4 A#4 C#5').check, 'the same walk without the beat is kept: the group of three is a landmark there');
ok(!!keep('Play the black key just above the group of two.', 'F#4').check, 'a key named by the group below it is not held to that group');
ok(pianoChecks.blockProblems('Piano_EarEcho', { prompt: 'Listen to the little black-key song, then copy it back by ear, one finger at a time.', notes: ['C#5', 'A#4', 'G#4', 'F#4', 'G#4', 'A#4', 'C#5', 'D#5'].map((note) => ({ note, beats: 1 })), tempo: 80 }, { gradeId: 'piano_keyboard_explorer' }).some((x) => /too long/.test(x)), 'an eight-note phrase to echo by ear is too long for Keyboard Explorer');
ok(!!keep('Now find the group of three black keys that sits just above that pair and press all three, moving left to right.', 'F#4 G#4 A#4').check, 'a check that says "left to right" is kept');
ok(!keep('Play one black key from a 2-group, and then one black key from a 3-group.', 'C#4 F#4').check, '"one black key from a group" has several right answers, so even a two-note key is dropped');
const anyOrder = keep('Play C, E and G in any order.', 'C4 E4 G4').check;
ok(anyOrder && anyOrder.mode === 'set' && grading.grade(anyOrder, 'notes:67,60,64').correct && !grading.grade(anyOrder, 'notes:60,62,64').correct, '"in any order" is graded in any order, and a wrong note is still wrong');
ok(pianoChecks.blockProblems('Piano_Staff', { caption: 'A black-key tune to follow along', clef: 'treble', notes: [{ note: 'F#4', beats: 1 }, { note: 'G#4', beats: 1 }] }, { gradeId: 'piano_keyboard_explorer' }).length === 1, 'a staff is refused for Keyboard Explorer learners, who do not read yet');
ok(pianoChecks.blockProblems('Piano_Staff', { caption: 'Middle C to G', clef: 'treble', notes: [{ note: 'C4', beats: 1 }, { note: 'G4', beats: 1 }] }, { gradeId: 'piano_first_reader' }).length === 0, 'and allowed from First Reader on');
ok(pianoChecks.blockProblems('Piano_Keys', { caption: 'The groups of two and three', notes: ['C#4', 'D#4', 'F#4', 'G#4', 'A#4'], together: false, note: 'Press each one and listen: every note you hear will sound good over the groove.' }).length === 1, 'a keyboard block that promises a groove it never plays is refused');
ok(pianoChecks.blockProblems('Piano_Jam', { prompt: 'Play any black keys you like, one finger at a time, while the band plays.', keys: 'black', tempo: 80, bars: 8 }).length === 0, 'a jam may say "any black keys you like": it scores the kind of key, not set notes');
ok(pianoChecks.blockProblems('Piano_Jam', { prompt: 'Play any white keys you like.', keys: 'black', tempo: 80, bars: 8 }).length === 1, 'a jam whose prompt and keys disagree is refused');
ok(!blockLevels.catalogFor('lesson', 'math').some((b) => /^Piano_/.test(b.tag)), 'other subjects are not offered piano blocks');
ok(['Piano_Keys', 'Piano_Staff', 'Piano_PlayAlong', 'Piano_EarEcho', 'Piano_Jam'].every((t) => blockLevels.catalogFor('lesson', 'piano').some((b) => b.tag === t)), 'piano lessons are offered the keyboard, staff, play-along, ear and jam blocks');
const servedPiano = blockLevels.publicPlan({ id: 1, checks: [{ id: 'c1', format: 'keys', mode: 'chord', prompt: 'p', answer: 'D4 F#4 A4', after: -1 }], blocks: [] }, 1, {});
ok(servedPiano.entries[0].block === 'Check_Piano' && !('answer' in servedPiano.entries[0].data), 'a played check reaches the page without its answer');
ok(servedPiano.files[0] === '/engine/piano/piano-core.js', 'the piano logic loads first');

// Run 4 (2026-10-21): the check repair's rewrite of a practised phrase, refused for a count it did not make.
ok(!!keep('Play the short black-key phrase you practised, in this order: the two black keys of the pair just above middle C (C#4, D#4), then the group of three above them (F#4, G#4, A#4), then back to the first key of that group of three (F#4).', 'C#4 D#4 F#4 G#4 A#4 F#4').check, '"the two black keys of the pair, then the group of three, then back" is one six-note line, not a count of two');
ok(!keep('Play the two black keys of the pair just above middle C.', 'C#4 D#4 F#4').check, 'but "the two black keys" keyed with three notes is still refused');
ok(!keep('Play back the little black-key tune you just heard, in the same order.', 'D#4 A#4 G#4 C#4 F#4 D#4').check, 'a check that asks for the tune "you just heard" is refused');
ok(pianoChecks.blockProblems('Piano_Jam', { prompt: 'Play any black keys you like, one finger at a time, gently on the beat, while the band plays its groove.', keys: 'black', bars: 8, note: 'Notice that nothing you played sounded wrong.' }).length === 0 && !blockLevels.library().Piano_Jam.schema.required.includes('tempo'), 'a jam written without a tempo (as the repair wrote one) is kept: the band has a default tempo');

// Run 5 (2026-10-21, level 308 "Mary Had a Little Lamb on Black Keys"): the model wrote the tune from memory, wrong.
const mary5 = keep('Play the first four notes of Mary Had a Little Lamb, starting on the lowest key of the group of three.', 'F#4 G#4 A#4 A#4');
ok(!mary5.check && /A#4 G#4 F#4 G#4/.test(mary5.why), 'a check keyed with the wrong opening of Mary Had a Little Lamb is refused, and the reason gives the tune');
ok(!keep('Play the first line of Mary Had a Little Lamb on the black keys, from left to right: three notes going up, the top note twice, then back down the same three notes.', 'F#4 G#4 A#4 A#4 G#4 G#4 F#4').check, 'and so is its wrong "first line"');
ok(!!keep('Play the first four notes of Mary Had a Little Lamb on the black keys, starting on the highest key of the group of three.', 'A#4 G#4 F#4 G#4').check, 'the right opening is kept');
ok(!!keep('Play the first three notes of Hot Cross Buns, from high to low.', 'E4 D4 C4').check && !!keep('Play the first three notes of Hot Cross Buns on the black keys, from high to low.', 'A#4 G#4 F#4').check, 'a named song is recognised in any key');
const mary5Along = { mode: 'wait', tempo: 50, prompt: 'First half of the song, slow and easy. Play F#4 (lowest of the three), G#4 (middle), A#4 (highest), A#4 again, then G#4, G#4, and hold F#4 for two beats.', notes: ['F#4', 'G#4', 'A#4', 'A#4', 'G#4', 'G#4', 'F#4'].map((note) => ({ note, beats: 1 })) };
ok(pianoChecks.blockProblems('Piano_PlayAlong', mary5Along, { gradeId: 'piano_keyboard_explorer', topic: 'Mary Had a Little Lamb on Black Keys' }).some((x) => /Piano_Song "mary-black"/.test(x)), 'a play-along of "the song" in a Mary Had a Little Lamb level must be the song; the refusal points to Piano_Song');
ok(pianoChecks.blockProblems('Piano_EarEcho', { prompt: 'Listen to the four-note bit, then play it back.', tempo: 60, notes: ['F#4', 'G#4', 'A#4', 'A#4'].map((note) => ({ note, beats: 1 })) }, { gradeId: 'piano_keyboard_explorer', topic: 'Mary Had a Little Lamb on Black Keys' }).length === 0, 'a phrase that does not claim to be the song is left alone');
ok(/Mary Had a Little Lamb/.test(blockLevels.LAYOUT_SYSTEM + require('../content/piano-songs').titlesText()), 'the layout call is told which songs the library has');

console.log('microphone: chords, note starts, and loud/soft and pedal from MIDI');
// A struck-string tone at 48 kHz: stretched partials, a decay and a short hammer click.
const SR48 = 48000;
let seedN = 5;
const rnd = () => ((seedN = (seedN * 1664525 + 1013904223) >>> 0) / 4294967296);
const strike = (m, len) => {
  const b = new Float32Array(len);
  const f = PC.midiToFreq(m);
  for (let k = 1; k <= 10; k++) {
    const fk = f * k * Math.sqrt(1 + 0.0004 * k * k);
    if (fk > 20000) break;
    const ph = rnd() * 6.28;
    for (let i = 0; i < len; i++) b[i] += (Math.exp(-i / SR48 / 1.5) * Math.min(1, i / 48) * Math.sin((2 * Math.PI * fk * i) / SR48 + ph)) / k;
  }
  // The felt hammer's knock: broadband, a few ms long.
  for (let i = 0; i < 200; i++) b[i] += (rnd() * 2 - 1) * (1 - i / 200);
  return b;
};
// [midi, start sample, optional release sample (the damper falls: 50 ms fade)]
const place = (parts, len) => {
  const b = new Float32Array(len);
  parts.forEach(([m, at, off]) => { const x = strike(m, len - at); for (let i = 0; i < x.length; i++) b[at + i] += 0.15 * x[i] * (off && at + i > off ? Math.exp(-(at + i - off) / 2400) : 1); });
  for (let i = 0; i < len; i++) b[i] += 0.002 * (rnd() * 2 - 1);
  return b;
};
const hear = (buf, expected) => {
  const tap = PC.createMicTap(SR48);
  const out = [];
  const L = PC.createNoteListener(SR48, { expected: expected ? () => expected : null, onNote: (n) => out.push(n) });
  for (let i = 0; i < buf.length; i += 128) tap.process(buf.subarray(i, i + 128), i).forEach((msg) => L.message(msg));
  return out;
};
const triadBuf = place([[60, 9600], [64, 9600], [67, 9600]], 48000);
const ghost = PC.detectPitch(triadBuf.subarray(12000, 16096), SR48, { minRms: 0.005 });
ok(ghost && ghost.midi === 36 && ghost.clarity >= 0.7, `the bug: YIN alone hears C4 E4 G4 as ${ghost && PC.midiToName(ghost.midi)} (a note nobody played) with clarity ${ghost && ghost.clarity.toFixed(2)}`);
ok(!PC.pitchIsReal(PC.spectrum(triadBuf.subarray(12000, 16096), SR48), ghost.hz), 'the ghost guard sees that C2 has no energy of its own and refuses it');
const blindTriad = hear(triadBuf, null);
ok(!blindTriad.some((n) => n.midi === 36), `with nothing expected the microphone no longer reports a phantom C2 for a chord (heard: ${blindTriad.map((n) => PC.midiToName(n.midi)).join(' ') || 'nothing'})`);
const heardTriad = hear(triadBuf, [60, 64, 67]);
ok([60, 64, 67].every((m) => heardTriad.some((n) => n.midi === m && n.chord)), 'told to expect C4 E4 G4, it hears all three notes of the chord');
ok(heardTriad.every((n) => Math.abs(n.sample - 9600) <= 96), `...each stamped with the chord's start to within 2 ms (${heardTriad.map((n) => ((n.sample - 9600) / 48).toFixed(1)).join(', ')} ms)`);
const slipBuf = place([[60, 9600], [63, 9600], [67, 9600]], 48000);
const heardSlip = hear(slipBuf, [60, 64, 67]);
ok(!heardSlip.some((n) => n.midi === 64), 'C4 Eb4 G4 played for C4 E4 G4: the E4 is not heard, so the slip is caught');
ok(!PC.hearNotes(place([[60, 0], [67, 0]], 8000).subarray(1440, 5536), SR48, [60, 64, 67]).ok, 'a chord with its third left out is not accepted');
// Legato: each key is let go as the next is played; and the same line with every note left ringing.
const lineAt = [0, 1, 2, 3].map((i) => 4800 + i * 18000);
const legato = place([60, 62, 64, 65].map((m, i) => [m, lineAt[i], lineAt[i + 1] ? lineAt[i + 1] + 1440 : 0]), 4800 + 72000 + 24000);
const ringing = place([60, 62, 64, 65].map((m, i) => [m, lineAt[i]]), 4800 + 72000 + 24000);
const lineErr = (buf) => { const h = hear(buf, null); return [60, 62, 64, 65].map((m, i) => { const n = h.find((x) => x.midi === m); return n ? Math.abs(n.sample - lineAt[i]) / 48 : 999; }); };
const errLegato = lineErr(legato);
const errRinging = lineErr(ringing);
ok(errLegato.every((e) => e <= 20), `a four-note legato line: every note heard, its start within 20 ms (${errLegato.map((e) => e.toFixed(1)).join(', ')} ms)`);
ok(errRinging.filter((e) => e <= 20).length >= 3, `the same line with every note left ringing (as with the pedal down): at least 3 of 4 heard on time, the new note picked out of the mixture (${errRinging.map((e) => (e === 999 ? 'missed' : e.toFixed(1))).join(', ')})`);
const dynTarget = [60, 62, 64, 65].map((m, i) => ({ midi: m, beat: i, dynamic: i < 2 ? 'p' : 'f' }));
const dynRight = PC.scorePerformance(dynTarget, dynTarget.map((t, i) => ({ midi: t.midi, time: i * 750, velocity: t.dynamic === 'f' ? 100 : 45, source: 'midi' })));
const dynFlat = PC.scorePerformance(dynTarget, dynTarget.map((t, i) => ({ midi: t.midi, time: i * 750, velocity: 72, source: 'midi' })));
ok(dynRight.dynamicsCheck.ok && !dynFlat.dynamicsCheck.ok && dynFlat.dynamicsCheck.flat[0].join() === 'p,f', 'MIDI: p notes softer than f notes pass; all the same loudness is caught');
ok(PC.scorePerformance(dynTarget, dynTarget.map((t, i) => ({ midi: t.midi, time: i * 750, source: 'mic', confidence: 0.9 }))).dynamicsCheck === null, 'the microphone does not grade loud and soft');
const pedalClean = PC.scorePedal([0, 1000, 2000], [{ time: 30, down: true }, { time: 1010, down: false }, { time: 1150, down: true }, { time: 1990, down: false }, { time: 2100, down: true }]);
const pedalBlur = PC.scorePedal([0, 1000, 2000], [{ time: 30, down: true }]);
ok(pedalClean.share === 1 && pedalBlur.blurred.join() === '1,2', 'legato pedal: lifted at each change and caught just after is clean; held down throughout blurs every change');
ok(pianoChecks.blockProblems('Piano_PlayAlong', { prompt: 'Play C loud like a lion, then G quiet like a mouse.', notes: [{ note: 'C4', beats: 1 }, { note: 'G4', beats: 1 }], tempo: 80, mode: 'wait' }).some((x) => /dynamic/.test(x))
  && pianoChecks.blockProblems('Piano_PlayAlong', { prompt: 'Play C loud like a lion, then G quiet like a mouse.', notes: [{ note: 'C4', beats: 1, dynamic: 'f' }, { note: 'G4', beats: 1, dynamic: 'p' }], tempo: 80, mode: 'wait' }).length === 0,
'a play-along that asks for loud and soft must mark each note, so a MIDI keyboard can grade it');
ok(blockLevels.library().Piano_PlayAlong.schema.properties.notes.items.properties.dynamic.enum.includes('f') && blockLevels.library().Piano_PlayAlong.schema.properties.pedal.enum[0] === 'legato', 'the play-along schema offers dynamics and legato pedal');
const pianoBlocksSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'engine', 'piano', 'piano-blocks.js'), 'utf8');
ok(/noMicChords: d\.mode === 'chord'/.test(pianoBlocksSrc), 'a graded chord check offers a MIDI keyboard or the on-screen keys, not the microphone');

console.log('songs: library, player logic and the song block');
const songLib = require('../content/piano-songs');
ok(songLib.SONGS.length >= 20 && songLib.SONGS.every((s) => s.publicDomain && s.publicDomain.detail && (s.publicDomain.basis === 'traditional' || s.publicDomain.died < 1956)), `${songLib.SONGS.length} songs, each saying why it is public domain (traditional, or a composer dead 70+ years)`);
ok(songLib.SONGS.every((s) => songLib.songProblems(s, null).length === 0), 'every library song parses, its bars add up and its hands fit its grade');
ok(songLib.SONGS.every((s) => s.lh && s.rh), 'every library song has a right-hand and a left-hand part');
ok(new Set(songLib.SONGS.map((s) => songLib.gradeNumber(s.grade))).size >= 5, 'songs span the first grades (Keyboard Explorer up to Lower Intermediate)');
ok(!songLib.SONGS.some((s) => /happy birthday/i.test(s.title)), '"Happy Birthday" is left out (its status differs by country)');
const maryParts = PC.songParts(songLib.get('mary-had-a-little-lamb'), 'right');
ok(PC.songParts(songLib.get('mary-had-a-little-lamb'), 'right').target.map((t) => PC.midiToName(t.midi)).slice(0, 7).join(' ') === 'E4 D4 C4 D4 E4 E4 E4', 'Mary Had a Little Lamb opens E D C D E E E');
const learnRun = PC.learnScore(maryParts.steps, [64, 61, 62, 60, 62, 64].map((midi) => ({ midi })));
ok(learnRun.right === 5 && learnRun.wrong === 1 && !learnRun.done, 'learn mode waits: a wrong key is a slip, and the song goes on only when the right key is played');
const odeBoth = PC.songParts(songLib.get('ode-to-joy'), 'both');
const chordsReversed = odeBoth.target.slice().reverse().map((t) => ({ midi: t.midi, time: t.beat * 600 + (t.midi % 3) * 7 }));
ok(PC.songStars('play', PC.scoreSong(odeBoth.target, chordsReversed, { tempo: 100 })).stars === 3, 'notes played together may come in any order');
ok(PC.songStars('learn', { total: 10, right: 10, wrong: 0 }).stars === 2 && PC.songStars('play', PC.scoreSong(maryParts.target, maryParts.target.map((t) => ({ midi: t.midi, time: t.beat * 1304 })), { tempo: 46 }), { speed: 0.5 }).stars === 2, 'learn mode and half speed earn at most 2 stars');
const late = maryParts.target.map((t, i) => ({ midi: t.midi, time: t.beat * (60000 / 92) + (i % 2 ? 260 : 0) }));
ok(PC.songStars('play', PC.scoreSong(maryParts.target, late, { tempo: 92 })).stars < 3, 'every other note a quarter-second late loses stars');
const take = songLib.scoreTake(songLib.get('mary-had-a-little-lamb'), { mode: 'play', hands: 'right', speed: 1, played: maryParts.target.map((t) => ({ midi: t.midi, time: t.beat * (60000 / 92), source: 'mic', confidence: 0.9 })) });
ok(take.stars === 3 && take.estimated, 'the server scores a take itself, and a microphone take is marked as an estimate');
ok(songLib.scoreTake(songLib.get('mary-had-a-little-lamb'), { mode: 'play', hands: 'right', speed: 2, played: [] }).error, 'a take at an unknown speed is refused');
ok(pianoChecks.blockProblems('Piano_Song', { prompt: 'Play it with your right hand.', song: 'mary-black', hands: 'right', mode: 'learn' }, { gradeId: 'piano_keyboard_explorer' }).length === 0, 'a song block naming a library song at the level\'s grade is kept');
ok(pianoChecks.blockProblems('Piano_Song', { prompt: 'Play it.', song: 'fur-elise', hands: 'right', mode: 'learn' }, { gradeId: 'piano_pre_reader' }).length === 1, 'a song harder than the level\'s grade is refused');
ok(pianoChecks.blockProblems('Piano_Song', { prompt: 'Play it.', song: 'let-it-go', hands: 'right', mode: 'learn' }, { gradeId: 'piano_pre_reader' }).length === 1, 'a song that is not in the library is refused');
ok(blockLevels.catalogFor('lesson', 'piano').some((b) => b.tag === 'Piano_Song') && blockLevels.library().Piano_Song.schema.properties.song.enum.length === songLib.SONGS.length, 'piano lessons are offered the song block, whose "song" lists only library ids');
const songPlan = blockLevels.publicPlan({ id: 1, checks: [], blocks: [{ block: 'Piano_Song', data: { prompt: 'p', song: 'mary-black', hands: 'right', mode: 'learn' }, index: 0 }] }, 1, {});
ok(songPlan.files.join() === '/engine/piano/piano-core.js,/engine/piano/piano-io.js,/engine/piano/piano-song.js', 'a lesson with only a song loads the piano logic, the inputs and the player');

console.log('the practice engine: tempo ladder, hotspot loop, bandwidth feedback (evidence article 04, P2 and P3)');
{
  // eslint-disable-next-line global-require
  const PCore = require('../public/engine/piano/piano-core');
  let st = PCore.tempoLadder(null);
  ok(st.pct === 0.65, 'the ladder starts at 65% of the target tempo (SKILL-CURRICULA: 60-70%)');
  st = PCore.tempoLadder(PCore.tempoLadder(st, true), true);
  ok(st.pct === 0.75 && st.clean === 0, 'two clean takes in a row step it up 10%');
  st = PCore.tempoLadder(PCore.tempoLadder(PCore.tempoLadder(st, true), false), true);
  ok(st.pct === 0.75, 'a miss between clean takes resets the count: no step');
  st = PCore.tempoLadder(PCore.tempoLadder(st, false), false);
  ok(st.pct === 0.65, 'two misses in a row step it back 10%');
  st = PCore.tempoLadder(PCore.tempoLadder({ pct: 0.6, clean: 0, fails: 0 }, false), false);
  ok(st.pct === 0.6, '...never below 60%');
  let top = { pct: 0.95, clean: 0, fails: 0 };
  for (let i = 0; i < 6; i++) top = PCore.tempoLadder(top, true);
  ok(top.pct === 1, '...and never above the target');
  // A 4-bar phrase (4 beats a bar), one note a beat; bar 3 played wrong twice and bar 4 once.
  const tgt = Array.from({ length: 16 }, (_, i) => ({ midi: 60 + (i % 5), beat: i }));
  const beatMs = 60000 / 80;
  const playedNotes = tgt.map((t, i) => ({ midi: [9, 10, 13].includes(i) ? t.midi + 1 : t.midi, time: t.beat * beatMs, source: 'midi' }));
  const sc = PCore.scorePerformance(tgt, playedNotes, { tempo: 80 });
  const bars = PCore.barErrors(tgt, sc, 4);
  ok(bars.length === 4 && bars[2].errors === 2 && bars[3].errors === 1 && bars[0].errors === 0, `errors by bar: ${bars.map((b) => b.errors).join(', ')}`);
  const hs = PCore.hotspot(tgt, sc, 4);
  ok(hs && hs.from === 2 && hs.to === 3, 'the hotspot is the worst bar with its worse neighbour (bars 3-4)');
  const loop = PCore.sliceBars(tgt, hs.from, hs.to, 4);
  ok(loop.length === 8 && loop[0].beat === 0 && loop[7].beat === 7 && loop[0].midi === tgt[8].midi, 'the loop is those bars\' notes, re-timed from beat 0');
  ok(PCore.hotspot(tgt, PCore.scorePerformance(tgt, tgt.map((t) => ({ midi: t.midi, time: t.beat * beatMs, source: 'midi' })), { tempo: 80 }), 4) === null, 'a clean take has no hotspot');
  const onlyOne = tgt.map((t, i) => ({ midi: i === 1 ? t.midi + 1 : t.midi, time: t.beat * beatMs, source: 'midi' }));
  const h1 = PCore.hotspot(tgt, PCore.scorePerformance(tgt, onlyOne, { tempo: 80 }), 4);
  ok(h1 && h1.from === 0 && h1.to === 0, 'one bad bar loops alone');
  const rule = { notes: 0.9, on_beat: 0.8, cv: 0.12, no_stops: true };
  ok(PCore.outsideBar({ notes: 0.95, on_beat: 0.85, cv: 0.1, stops: 0 }, rule).length === 0, 'bandwidth: a take inside the bar flags nothing');
  ok(PCore.outsideBar({ notes: 0.8, on_beat: 0.85, cv: 0.2, stops: 1 }, rule).join() === 'notes,cv,stops', 'bandwidth: only what is outside the bar is flagged (notes, evenness, a stop)');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall piano checks pass');
process.exit(failures ? 1 : 0);
