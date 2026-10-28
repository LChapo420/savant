// Generate content/basketball-grades.js from the basketball sheet.
//
// data/Basketball_Grades_Levels.csv is the layout (built by curriculum-build/basketball/build.js
// from the researched topic lists) and data/Basketball_Lesson_Tags.csv names each lesson's
// area. The tag, sharpened by the lesson's title, decides which bank skill its
// questions come from; a lesson's nine activities take its skill, and every other
// level draws on the whole grade.
const fs = require('fs');
const path = require('path');
const { readSheet, writeTrack, parseCsv } = require('./build-sheet-track');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'Basketball_Grades_Levels.csv');
const TAGS = path.join(ROOT, 'data', 'Basketball_Lesson_Tags.csv');
const OUT = path.join(ROOT, 'content', 'basketball-grades.js');

const TAG_SKILL = {
  Footwork: 'bb_skills', BallHandling: 'bb_skills', Passing: 'bb_skills', Shooting: 'bb_skills',
  Finishing: 'bb_skills', Rebounding: 'bb_skills', Defense: 'bb_tactics', TeamOffense: 'bb_tactics',
  TeamDefense: 'bb_tactics', Transition: 'bb_tactics', GameIQ: 'bb_tactics', Rules: 'bb_rules',
  Athletic: 'bb_health', Health: 'bb_health', Mental: 'bb_mental', Practice: 'bb_skills', Coaching: 'bb_coaching',
  Officiating: 'bb_officiating', Analytics: 'bb_stats', FrontOffice: 'bb_frontier', Business: 'bb_history',
  History: 'bb_history', Science: 'bb_frontier',
};

/** A lesson's skill: its title can name a narrower one than its tag. */
function skillOf(grade, tag, title) {
  if (/court|rim height|ball size|equipment|three-point line|free-throw line/i.test(title) && tag !== 'Shooting') return 'bb_court';
  if (tag === 'Analytics' && grade >= 13) return 'bb_frontier';
  if (tag === 'Mixed') return grade <= 4 ? 'bb_skills' : grade <= 10 ? 'bb_tactics' : grade <= 13 ? 'bb_coaching' : 'bb_frontier';
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
  ['Ball Explorer', 1, 'For a first-time player of any age: running, stopping, throwing, catching and bouncing through games.'],
  ['Mini Starter', 1, 'Stance, jump stops, pivots, dribbling with both hands and first shots at a low ring.'],
  ['Mini Player', 2, 'Dribbling on the move, lay-ups from both sides and 3v3 with spacing.'],
  ['Junior Club Player', 2, 'Triple threat, dribble moves, shooting form with range, boxing out and 5v5 man-to-man.'],
  ['Youth Team Player', 3, 'Catch-and-shoot and pull-ups, screens, help defence and transition.'],
  ['Youth Advanced', 3, 'Three-point range, post play, pick-and-roll reads, zones and presses.'],
  ['Varsity', 4, 'Position skills, set plays, time and score, scouting reports and a training plan.'],
  ['Elite Junior', 4, 'Speed and intensity with a full tactical vocabulary, and recruiting-level habits.'],
  ['Collegiate', 5, 'College-level craft and systems, plus first coaching, officiating and analytics.'],
  ['High-Major', 5, 'Every pick-and-roll coverage, the Four Factors, rule differences and assistant-coach work.'],
  ['Professional', 5, 'Professional habits, contracts, player development, referee licences and advanced metrics.'],
  ['Elite Professional', 5, 'Game-planning opponents, salary-cap mechanics, staff refereeing and team analytics.'],
  ['All-Star and Olympic', 5, 'What elite players, head coaches, crew chiefs and general managers know and do.'],
  ['Master', 5, 'The game across eras: how rules, tactics and roles changed and why.'],
  ['Frontier', 5, 'Tracking data, computer vision, new metrics and the open questions in basketball research.'],
];

const keepIds = {};
const meta = {};
grades.forEach((g, i) => {
  const [name, tier, blurb] = GRADE_META[i];
  const id = `basketball_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  keepIds[i] = id;
  meta[id] = { name, tier, blurb };
});

writeTrack({ grades, out: OUT, subject: 'Basketball', meta, keepIds, unknownTypes });
