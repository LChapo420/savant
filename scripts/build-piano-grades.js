// Generate content/piano-grades.js from the piano sheet.
//
// data/Piano_Grades_Levels.csv is the layout (built by curriculum-build/piano/build.js
// from the researched topic lists) and data/Piano_Lesson_Tags.csv names each lesson's
// area. The tag, sharpened by the lesson's title, decides which bank skill its
// questions come from; a lesson's nine activities take its skill, and every other
// level draws on the whole grade.
const fs = require('fs');
const path = require('path');
const { readSheet, writeTrack, parseCsv } = require('./build-sheet-track');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'Piano_Grades_Levels.csv');
const TAGS = path.join(ROOT, 'data', 'Piano_Lesson_Tags.csv');
const OUT = path.join(ROOT, 'content', 'piano-grades.js');

const TAG_SKILL = {
  Reading: 'piano_reading', SightReading: 'piano_reading', Rhythm: 'piano_rhythm', Technique: 'piano_technique',
  Repertoire: 'piano_repertoire', Knowledge: 'piano_repertoire', Ear: 'piano_intervals', Theory: 'piano_intervals',
  Chords: 'piano_chords', Improvisation: 'piano_chords', Composition: 'piano_chords', Jazz: 'piano_jazz',
  Practice: 'piano_practice', Wellbeing: 'piano_technique', Performance: 'piano_practice',
  Collaborative: 'piano_profession', Pedagogy: 'piano_profession', Technology: 'piano_profession',
  Science: 'piano_science',
};

/** A lesson's skill: its title can name a narrower one than its tag. */
function skillOf(grade, tag, title) {
  if (grade === 1) return /rhythm|beat|clap|tap|pulse|fast|slow/i.test(title) ? 'piano_rhythm' : 'piano_keyboard';
  if (/key signature|circle of fifths|relative (major|minor)/i.test(title)) return 'piano_keys';
  if (/\bscales?\b|\bmode/i.test(title) && grade <= 12) return 'piano_scales';
  if (/interval|\bsteps?\b|\bskips?\b/i.test(title) && grade <= 11) return 'piano_intervals';
  if (/chord|triad|cadence|inversion|seventh|harmon/i.test(title) && tag !== 'Repertoire' && grade <= 12) return 'piano_chords';
  if (/dynamic|tempo|italian|term|staccato|legato|articulation|sign/i.test(title) && grade <= 9) return 'piano_terms';
  if (/black keys?|white keys?|keyboard|high and low|finger number/i.test(title) && grade <= 4) return 'piano_keyboard';
  if (tag === 'Mixed') return grade <= 4 ? 'piano_reading' : grade <= 11 ? 'piano_chords' : grade <= 17 ? 'piano_profession' : 'piano_science';
  return TAG_SKILL[tag] || null;
}

const tagRows = parseCsv(fs.readFileSync(TAGS, 'utf8').replace(/^﻿/, '')).slice(1).filter((r) => r[0]);
const lessonSkill = new Map(tagRows.map(([g, title, tag]) => [`${g}|${title}`, skillOf(Number(g), tag, title)]));

let gradeNo = 0;
const { grades, unknownTypes } = readSheet(SRC, () => null);
for (const g of grades) {
  gradeNo++;
  let current = null;
  for (const l of g.levels) {
    if (l.type === 'Lesson') current = lessonSkill.get(`${gradeNo}|${l.title}`) || null;
    l.skill = l.type === 'Lesson' || l.type === 'Activity' ? current : null;
  }
}

// Tiers are the app's 1-5 difficulty bands for placement.
const GRADE_META = [
  ['Keyboard Explorer', 1, 'For a first-time player of any age: the keys, high and low, and playing by ear through voice-led games.'],
  ['Pre-Reader', 1, 'Steady pulse, finger numbers and letter names, first songs before the staff.'],
  ['First Reader', 1, 'The grand staff, five-finger positions and first pieces hands together.'],
  ['Elementary 1', 2, 'Grade 1 level: simple pieces, one-octave scales and primary chords.'],
  ['Elementary 2', 2, 'Grade 2 level: minor keys, first pedal and first sonatinas.'],
  ['Lower Intermediate', 3, 'Grade 3 level: more keys, compound time, Baroque dances and Romantic miniatures.'],
  ['Intermediate', 3, 'Grade 4 level: arpeggios, balance between hands and lead sheets.'],
  ['Upper Intermediate', 3, 'Grade 5 level: all keys, legato pedalling, complete sonatinas and chord symbols.'],
  ['Early Advanced', 4, 'Grade 6 level: Bach Inventions, easier Chopin and Schumann, figured bass basics.'],
  ['Advanced', 4, 'Grade 7 level: Classical sonata movements, scales in thirds and sixths, modulation.'],
  ['Pre-Professional', 4, 'Grade 8 level: complete sonatas, preludes and fugues, concert études begun.'],
  ['Diploma', 5, 'Diploma level: a memorised, stylish recital programme and keyboard skills.'],
  ['Licentiate', 5, 'Licentiate level: concerto, chamber music, accompanying and pedagogy.'],
  ['Fellowship', 5, 'Fellowship level: artistic programmes, several concertos and research-informed performance.'],
  ['Professional', 5, 'Professional level: multiple programmes, specialist credentials and a career toolkit.'],
  ['Concert Artist', 5, 'What international concert artists know and do: repertoire, competitions, commissions.'],
  ['Master', 5, 'Complete cycles, editions, recordings and teaching the next generation.'],
  ['Frontier: Foundations', 5, 'How performance science, cognition, acoustics, tuning and AI really work.'],
  ['Frontier: Research', 5, 'Reading, reproducing and contributing research, and the open questions.'],
];

const keepIds = {};
const meta = {};
grades.forEach((g, i) => {
  const [name, tier, blurb] = GRADE_META[i];
  const id = `piano_${name.replace(/:/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  keepIds[i] = id;
  meta[id] = { name, tier, blurb };
});

writeTrack({ grades, out: OUT, subject: 'Piano', meta, keepIds, unknownTypes });
