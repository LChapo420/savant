/* The piano testbed's sample data and stand-in grader (see demo.html). */
// Stand-in for the page shell's PolymathChecks. On a real level this posts to the server.
var KEYS = { demo1: { mode: 'chord', answer: 'D4 F#4 A4', rationale: 'A major triad is a major third (D to F#) plus a minor third (F# to A).' } };
window.PolymathChecks = {
  answered: {},
  submit: function (id, answer) {
    var k = KEYS[id];
    var P = window.PolymathPiano;
    var played = P.parseNotes(answer);
    var want = P.parseNotes(k.answer);
    var correct = P.samePitchClasses(played, want) && new Set(played.map(P.pitchClass)).size === want.length;
    return Promise.resolve({ correct: correct, answer: k.answer, rationale: k.rationale });
  },
};
var B = window.LessonBlocks;
B.get('Piano_Keys').render(document.getElementById('keys'), { caption: 'The C major chord', notes: ['C4', 'E4', 'G4'], together: true, note: 'Skip a white key, play one, skip one, play one.' });
B.get('Piano_Staff').render(document.getElementById('staff'), {
  caption: 'Ode to Joy, first phrase', clef: 'treble',
  notes: [{ note: 'E4', beats: 1 }, { note: 'E4', beats: 1 }, { note: 'F4', beats: 1 }, { note: 'G4', beats: 1 }, { note: 'G4', beats: 1 }, { note: 'F4', beats: 1 }, { note: 'E4', beats: 1 }, { note: 'D4', beats: 1 }],
  note: 'Steps up, then steps down: each note is the next line or space.',
});
B.get('Piano_PlayAlong').render(document.getElementById('along'), {
  prompt: 'Play C D E F G with your right hand, fingers 1 to 5.', mode: 'wait', tempo: 72,
  notes: [{ note: 'C4', beats: 1 }, { note: 'D4', beats: 1 }, { note: 'E4', beats: 1 }, { note: 'F4', beats: 1 }, { note: 'G4', beats: 1 }],
});
B.get('Piano_EarEcho').render(document.getElementById('ear'), { prompt: 'Listen to three notes, then play them back.', tempo: 80, notes: [{ note: 'E4', beats: 1 }, { note: 'D4', beats: 1 }, { note: 'C4', beats: 1 }] });
B.get('Piano_Jam').render(document.getElementById('jam'), { prompt: 'Play any black keys you like, one finger at a time, while the band plays.', keys: 'black', tempo: 80, bars: 4, note: 'Every black key fits this band: there are no wrong black keys here.' });
B.get('Check_Piano').render(document.getElementById('check'), { id: 'demo1', prompt: 'Play the D major triad.', mode: 'chord' });
