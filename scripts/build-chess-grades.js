// Generate content/chess-grades.js from the chess sheet.
//
// data/Chess_Grades_Levels.csv is the layout (built by curriculum-build/chess/build.js
// from the researched topic lists) and data/Chess_Lesson_Tags.csv names each lesson's
// area. The tag decides which bank skill a lesson's questions come from; a lesson's
// nine activities take its skill, and every other level draws on the whole grade.
const fs = require('fs');
const path = require('path');
const { readSheet, writeTrack, parseCsv } = require('./build-sheet-track');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'Chess_Grades_Levels.csv');
const TAGS = path.join(ROOT, 'data', 'Chess_Lesson_Tags.csv');
const OUT = path.join(ROOT, 'content', 'chess-grades.js');

const TAG_SKILL = {
  Rules: 'chess_moves', Mate: 'chess_mate', Tactics: 'chess_tactics', Calculation: 'chess_tactics',
  Thinking: 'chess_tactics', Mixed: 'chess_tactics', Endgame: 'chess_endgame', Strategy: 'chess_strategy',
  Middlegame: 'chess_strategy', Defense: 'chess_strategy', Opening: 'chess_opening', Practical: 'chess_practical',
  Study: 'chess_practical', Culture: 'chess_history', History: 'chess_history', Literature: 'chess_history',
  Broadcast: 'chess_history', Coaching: 'chess_professional', Arbiting: 'chess_professional',
  Problems: 'chess_professional', Studies: 'chess_professional', Engines: 'chess_engines',
  Tablebases: 'chess_engines', Theory: 'chess_engines',
};

/** A lesson's skill: its title can name a narrower one than its tag. */
function skillOf(grade, tag, title) {
  if (/notation|algebraic|writing moves|\bPGN\b|\bFEN\b|scoresheet/i.test(title)) return 'chess_notation';
  if (tag === 'Rules' && /square|board|set(ting)? up|starting position|letters and numbers|corner/i.test(title)) return 'chess_board';
  if (/piece values?|material|counting .*trade|worth/i.test(title) && grade <= 8) return 'chess_material';
  if (tag === 'Mixed' && grade >= 17) return 'chess_engines';
  if (tag === 'Mixed' && grade >= 14) return 'chess_professional';
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

const GRADE_META = [
  ['Board Explorer', 1, 'For a first-time player of any age: the board and every piece through voice-led mini-games.'],
  ['Rules Learner', 1, 'Check, checkmate, castling and every rule needed to play a full legal game.'],
  ['Beginner Tactician', 2, 'About 400-800: forks, pins, basic mates and winning loose pieces.'],
  ['Novice Club Player', 2, 'About 800-1100: opening principles, mating patterns and first endgames.'],
  ['Club Player', 3, 'About 1100-1400: combinations, king and pawn endings and a first repertoire.'],
  ['Intermediate', 3, 'About 1400-1600: rook endings, pawn structure and calculation.'],
  ['Strong Club Player', 4, 'About 1600-1800: planning, piece quality and deeper endgames.'],
  ['Advanced Club Player', 4, 'About 1800-2000: prophylaxis, fortresses and structure-based plans.'],
  ['Expert', 5, 'About 2000-2199: deep calculation, theoretical endings and a full repertoire.'],
  ['Master', 5, 'About 2200-2399: master-level strategy, endgame technique and preparation.'],
  ['International Master', 5, 'About 2400-2499: what International Masters know and do.'],
  ['Grandmaster', 5, 'About 2500-2649: what Grandmasters know and do.'],
  ['Elite and World-Class', 5, '2650 and up: how elite players prepare, decide and compete.'],
  ['Chess Professional: Foundations', 5, 'Coaching, arbiting, problems, studies and history at club level.'],
  ['Chess Professional: Practitioner', 5, 'Coaching, arbiting, composition and commentary at FIDE level.'],
  ['Chess Professional: Authority', 5, 'International-level coaching, arbiting, composition and scholarship.'],
  ['Chess Frontier: Literacy', 5, 'How engines, tablebases and the theory of chess actually work.'],
  ['Chess Frontier: Research', 5, 'Reading and reproducing chess-AI and tablebase research.'],
  ['Chess Frontier: Contribution', 5, 'The open problems of chess, and contributing original analysis.'],
];

// Grade ids are prefixed so they can never collide with another subject's grade of
// the same name ("Expert", "Master").
const keepIds = {};
const meta = {};
grades.forEach((g, i) => {
  const [name, tier, blurb] = GRADE_META[i];
  const id = `chess_${name.replace(/^Chess /, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  keepIds[i] = id;
  meta[id] = { name, tier, blurb };
});

writeTrack({ grades, out: OUT, subject: 'Chess', meta, keepIds, unknownTypes });
