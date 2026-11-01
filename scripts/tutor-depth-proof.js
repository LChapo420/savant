#!/usr/bin/env node
/**
 * The tutor at full depth, against REAL models (tutor-depth, 1 Nov 2026). Not part of `npm test`: it calls models and
 * spends (Standard Compute through the live ledger). SIMULATED learners and an AI judge: not real-learner proof.
 *
 *   node scripts/tutor-depth-proof.js build   --code=<dir> --db=<file>     a month of history for 16 simulated learners
 *   node scripts/tutor-depth-proof.js replies --code=<dir> --db=<file> --out=<file>   every probe through dock.reply
 *   node scripts/tutor-depth-proof.js judge   --before=<file> --after=<file> --out=<file>
 *   node scripts/tutor-depth-proof.js report  --judged=<file> --md=<file>
 *
 * --code is the app folder whose services are loaded: this worktree ("after") or a `git archive` of main ("before",
 * the tutor as it is on main). Both build the SAME learners from the same script below through their own code (their
 * own note, fold and remember), so memory handling is part of what is compared. Run a child with NODE_PATH pointing at
 * this worktree's node_modules when --code has none.
 *
 * Learners: 8 profiles, each with about 30 days of history built by script with KNOWN ground truth: scorecard measures
 * (observed through scorecard.observe, so the real confidence arithmetic applies), survey, goals and deadlines, skill
 * states with last-practised dates (the forgetting model reads them), wrong answers with error tags (current and fixed
 * mix-ups), explanation outcomes, learner-record facts, about 40 chats with folds by the real model, and facts as the
 * fact reader would have proposed them, including CONTRADICTIONS (an exam that moved, a hobby dropped). Each profile has
 * a counterfactual twin with ONE measure or fact moved.
 *
 * Probes: 5 per learner (plan, stuck on a question, explain with an example, a recall of a fact that changed, "just tell
 * me the answer"), through the real dock (services/tutor-context.js reply: Standard Compute DeepSeek V4.1 Flash first,
 * the production path). A blind judge from another family (Gemini 3.5 Flash, Google; GPT Sol on Modelflare if Gemini
 * fails) scores each reply on 5 criteria with the ground truth in hand, before and after in random order, unlabelled.
 * Counterfactual: the twin pair's replies to the same probe, the judge told only what differs, must say which reply
 * was written for which learner.
 *
 * Environment: DOTENV_PATH (default the owner's .env), STANDARD_COMPUTE_LEDGER_FILE (the live ledger). DB_FILE is set
 * to --db. Learner data here is simulated, so any provider may see it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const mode = process.argv[2];
const DAY = 86400000;
const ENV = process.env.DOTENV_PATH || 'C:/coding/claudecommittdIq/folderThing/.env';

// ── dates ──────────────────────────────────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const T0 = Date.parse(new Date().toISOString().slice(0, 10)); // today 00:00 UTC
const isoDay = (fromToday) => new Date(T0 + fromToday * DAY).toISOString().slice(0, 10);
const spoken = (fromToday) => { const d = new Date(T0 + fromToday * DAY); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

// ── the learners (ground truth) ────────────────────────────────────────────
// day: 0..29 of the month of history (29 = yesterday). in: days from today (a deadline).
function learners() {
  const L = [];
  L.push({
    key: 'maya', name: 'Maya Lopez', age: 16, track: 'math',
    survey: { interests: 'basketball', hobbies: 'drawing', sports: 'basketball', notes: '' },
    measures: { frustration_threshold: 15, brevity_preference: 86, analogical_transfer: 82 },
    skills: [
      { id: 'fractions', mastery: 0.38, attempts: 16, last: 1, errors: [{ tag: 'added_denominators', n: 5, said: '3/7' }] },
      { id: 'decimals', mastery: 0.86, attempts: 22, last: 26 },
      { id: 'percents', mastery: 0.9, attempts: 18, last: 3 },
    ],
    strategies: { analogy: [4, 1], detailed: [0, 3] },
    record: [{ kind: 'struggle', topic: 'common denominators', text: 'loses track when finding a common denominator', hint: 'list multiples side by side', support: 3, status: 'solid', day: 20 }],
    facts: [
      { day: 3, kind: 'goal', text: `ACT on ${spoken(41)}, aiming for a 30` },
      { day: 6, kind: 'goal', text: `ACT on ${spoken(41)}` },
      { day: 9, kind: 'goal', text: `Taking the ACT on ${spoken(41)}` },
      { day: 20, kind: 'goal', text: `ACT got moved to ${spoken(97)}`, replaces: `ACT on ${spoken(41)}` },
      { day: 2, kind: 'interest', text: 'Plays basketball on the school team' },
      { day: 18, kind: 'interest', text: 'No longer into basketball, quit the team' },
      { day: 18, kind: 'interest', text: 'Into making beats in GarageBand' },
      { day: 12, kind: 'misconception', text: 'Adds the denominators when adding fractions', skill_id: 'fractions', wrong_answer: '1/3 + 2/4 = 3/7' },
      { day: 15, kind: 'worked', text: 'Got common denominators after a music-beats analogy (beats per bar)', style: 'analogy' },
    ],
    said: [
      { day: 3, learner: `my ACT is on ${spoken(41)} and I want a 30`, tutor: 'Nice target. Let us plan backwards from that date.' },
      { day: 2, learner: 'I play basketball for my school so I am busy most evenings', tutor: 'Got it, short sessions then.' },
      { day: 18, learner: 'I quit the basketball team, honestly not into it anymore. I make beats in GarageBand now', tutor: 'Oh cool, beats have a lot of fractions in them.' },
      { day: 20, learner: `update: my ACT got moved to ${spoken(97)}`, tutor: 'More time, nice. We can go deeper on fractions first.' },
    ],
    topic: 'fractions', subject: 'adding fractions',
    question: { skill: 'fractions', text: 'What is 2/3 + 1/4?', answer: '11/12' },
    truth: {
      current: [`ACT date is ${isoDay(97)} (${spoken(97)}), about 97 days away, aiming for a 30`, 'interests now: making beats in GarageBand (music production); also drawing', 'current mix-up: adds the denominators when adding fractions', 'analogies work for her (4 of 5); long detailed explanations failed (0 of 3)', 'fractions weak (38%); percents solid; decimals were solid (86%) but last practised 26 days ago, so may be fading', 'struggles finding a common denominator (listing multiples helps)'],
      stale: [`ACT on ${spoken(41)} (it moved)`, 'basketball as a current interest (she quit)'],
      measures: ['frustrates quickly (frustration threshold 15/100): gentle, more support, acknowledge it', 'wants the shortest version (brevity 86/100): 1-3 sentences', 'analogies unlock understanding (82/100)'],
      use: ['music production / GarageBand beats', 'drawing'], avoid: ['basketball'],
    },
    recall: { msg: 'wait when is my ACT again? and how long do I have?', calls: ['the moved ACT date and roughly how many days are left'] },
    twin: { what: 'Brevity preference (how short they want explanations)', x: 'Brevity preference 86/100: wants the shortest version', y: 'Brevity preference 14/100: wants full detail, step by step', apply: (s) => { s.measures.brevity_preference = 14; s.truth.measures[1] = 'wants full detail (brevity 14/100): fuller step-by-step explanation'; }, probe: 'stuck' },
  });
  L.push({
    key: 'leo', name: 'Leo Martin', age: 17, track: 'spanish', goalIn: 12,
    survey: { interests: 'soccer, Real Madrid', hobbies: 'cooking', sports: 'soccer', notes: 'I hate timed quizzes, they stress me out' },
    measures: { humor_receptivity: 86, dialogic_preference: 82, evaluation_anxiety: 84 },
    skills: [
      { id: 'es_ser_estar', mastery: 0.42, attempts: 15, last: 1, errors: [{ tag: 'ser_for_state', n: 6, said: 'es' }] },
      { id: 'es_preterite', mastery: 0.82, attempts: 20, last: 27 },
      { id: 'es_present_ar', mastery: 0.92, attempts: 24, last: 2 },
    ],
    strategies: { step_questions: [5, 1], worked_example: [0, 2] },
    record: [{ kind: 'preference', topic: '', text: 'likes being quizzed with quick back-and-forth questions', support: 4, status: 'solid', day: 15 }],
    facts: [
      { day: 4, kind: 'goal', text: `Spanish oral exam on ${spoken(12)}` },
      { day: 8, kind: 'goal', text: 'Family trip to Madrid at the end of December, wants to order food and chat' },
      { day: 10, kind: 'misconception', text: 'Uses ser for temporary states like being tired', skill_id: 'es_ser_estar', wrong_answer: 'Mi hermano es cansado' },
      { day: 14, kind: 'interest', text: 'Loves cooking, especially paella' },
    ],
    said: [
      { day: 8, learner: 'we are going to Madrid at the end of December!! I want to be able to order food and chat', tutor: 'That is a great goal. We will practise restaurant Spanish.' },
      { day: 4, learner: `my oral exam is on ${spoken(12)}, kind of nervous`, tutor: 'We will practise speaking so it feels familiar.' },
    ],
    topic: 'ser and estar', subject: 'ser vs estar',
    question: { skill: 'es_ser_estar', text: 'Choose the right verb: "Mi hermano ___ cansado hoy." (es / está)', answer: 'está' },
    truth: {
      current: [`Spanish oral exam on ${isoDay(12)} (${spoken(12)}), 12 days away, nervous about it`, 'family trip to Madrid at the end of December: wants to order food and chat', 'current mix-up: uses ser for temporary states (said "Mi hermano es cansado")', 'step-by-step questions work (5 of 6); worked examples failed (0 of 2)', 'likes quick back-and-forth questions', 'interests: soccer, Real Madrid, cooking (paella)', 'preterite was solid (82%) but last practised 27 days ago: may be fading'],
      stale: [],
      measures: ['humor welcome (86/100): a light joke fits', 'prefers a Socratic back-and-forth (dialogic 82/100)', 'high evaluation anxiety (84/100): low stakes, no test or timer framing'],
      use: ['soccer / Real Madrid', 'cooking / paella', 'the Madrid trip'], avoid: ['timed quizzes or test pressure'],
    },
    recall: { msg: 'remind me, what did I tell you about my trip?', calls: ['the Madrid trip at the end of December and his goal to order food and chat'] },
    twin: { what: 'Interests', x: 'loves soccer and Real Madrid', y: 'loves chess and plays in a chess club (no interest in soccer)', apply: (s) => { s.survey.interests = 'chess'; s.survey.sports = ''; s.facts.push({ day: 6, kind: 'interest', text: 'Plays in a chess club every week' }); s.truth.use = ['chess', 'cooking / paella', 'the Madrid trip']; }, probe: 'explain' },
  });
  L.push({
    key: 'priya', name: 'Priya Shah', age: 17, track: 'act',
    survey: { interests: 'K-pop, skincare', hobbies: 'dancing', sports: '', notes: '' },
    measures: { self_efficacy: 14, praise_sensitivity: 82, worked_example_dependence: 86 },
    act: { test_in: 25, target: 28 },
    skills: [
      { id: 'linear_eq', mastery: 0.84, attempts: 26, last: 3, errors: [{ tag: 'sign_error_moving_terms', n: 4, said: 'x = -3', fixedAfter: 7 }] },
      { id: 'slope_lines', mastery: 0.41, attempts: 14, last: 1, errors: [{ tag: 'rise_run_swapped', n: 5, said: '1/3' }] },
      { id: 'ratios', mastery: 0.8, attempts: 18, last: 26 },
    ],
    strategies: { worked_example: [4, 0] },
    record: [{ kind: 'emotion', topic: 'maths', text: 'says she is "just not a math person"', support: 3, status: 'solid', day: 10 }],
    facts: [
      { day: 5, kind: 'hard', text: 'Finds slope confusing, mixes up rise and run', skill_id: 'slope_lines' },
      { day: 7, kind: 'misconception', text: 'Flips the sign wrong when moving terms across the equals sign', skill_id: 'linear_eq', wrong_answer: 'x = -3' },
      { day: 16, kind: 'worked', text: 'Understood slope after a fully worked example on different numbers', style: 'worked_example' },
    ],
    said: [{ day: 10, learner: 'honestly I am just not a math person', tutor: 'You have gotten a lot right lately, though.' }],
    topic: 'slope', subject: 'slope of a line',
    question: { skill: 'slope_lines', text: 'What is the slope of the line through (1, 2) and (3, 8)?', answer: '3' },
    truth: {
      current: [`ACT on ${isoDay(25)}, 25 days away, target composite 28`, 'current mix-up: swaps rise and run in slope', 'the sign error when moving terms is FIXED (right on every answer since)', 'worked examples work (4 of 4)', 'linear equations solid (84%); slope weak (41%); ratios were solid (80%) but last practised 26 days ago: may be fading', 'says she is "not a math person"'],
      stale: ['the sign-flip mistake as a current problem (fixed)'],
      measures: ['low self-efficacy (14/100): make the first step achievable, point out what she did right', 'praise-sensitive (82/100): specific praise for the move', 'needs full worked examples (86/100)'],
      use: ['K-pop', 'skincare', 'dancing'], avoid: [],
    },
    recall: { msg: 'how many days until my ACT and what score am I going for?', calls: ['the ACT in about 25 days, target 28'] },
    twin: { what: 'How soon the ACT is', x: 'ACT in 25 days', y: 'ACT in 150 days', apply: (s) => { s.act.test_in = 150; s.truth.current[0] = `ACT on ${isoDay(150)}, 150 days away, target composite 28`; }, probe: 'plan' },
  });
  L.push({
    key: 'omar', name: 'Omar Haddad', age: 19, track: 'chess', goalIn: 18,
    survey: { interests: 'NFL football, Elden Ring', hobbies: 'video games', sports: 'football', notes: '' },
    measures: { challenge_appetite: 86, brevity_preference: 80, hint_dependency: 14 },
    skills: [
      { id: 'chess_tactics', mastery: 0.45, attempts: 18, last: 1, errors: [{ tag: 'pin_vs_skewer', n: 4, said: 'skewer' }] },
      { id: 'chess_endgame', mastery: 0.86, attempts: 22, last: 2 },
      { id: 'chess_opening', mastery: 0.85, attempts: 20, last: 27 },
    ],
    strategies: { brief: [4, 0], detailed: [0, 2] },
    record: [],
    facts: [
      { day: 5, kind: 'hard', text: 'Says endgames are really hard for him', skill_id: 'chess_endgame' },
      { day: 9, kind: 'goal', text: `Club tournament on ${spoken(18)}` },
      { day: 11, kind: 'misconception', text: 'Thinks a pin and a skewer are the same thing', skill_id: 'chess_tactics', wrong_answer: 'skewer' },
    ],
    said: [{ day: 9, learner: `club tournament on ${spoken(18)}, want to stop blundering pieces`, tutor: 'Tactics drills it is.' }],
    topic: 'pins and skewers', subject: 'the difference between a pin and a skewer',
    question: { skill: 'chess_tactics', text: 'In a skewer, is the more valuable piece in front or behind?', answer: 'in front' },
    truth: {
      current: [`club tournament on ${isoDay(18)}, 18 days away, wants to stop blundering`, 'current mix-up: thinks a pin and a skewer are the same', 'endgames: he SAID they are hard (day 5) but his answers since are solid (86%)', 'short explanations work (4 of 4); detailed ones failed (0 of 2)', 'openings were solid (85%) but last practised 27 days ago: may be fading'],
      stale: ['endgames as a current weakness (his answers say solid)'],
      measures: ['loves a challenge (86/100): offer a harder case', 'wants the shortest version (80/100)', 'rarely needs hints (14/100): smallest nudge first'],
      use: ['NFL football', 'Elden Ring / video games'], avoid: [],
    },
    recall: { msg: 'when is my tournament again?', calls: ['the club tournament date, about 18 days away'] },
    twin: { what: 'Hint dependency', x: 'Hint dependency 14/100: rarely needs hints', y: 'Hint dependency 86/100: relies on hints heavily', apply: (s) => { s.measures.hint_dependency = 86; s.truth.measures[2] = 'relies on hints heavily (86/100): make them think first, but give a clear hint'; }, probe: 'stuck' },
  });
  L.push({
    key: 'sofia', name: 'Sofia Rossi', age: 17, track: 'english', goalIn: 9,
    survey: { interests: 'horses, Taylor Swift', hobbies: 'riding', sports: '', notes: 'I hate sports examples' },
    measures: { attention_runway: 18, novelty_hunger: 84, spatial_anchoring: 86 },
    skills: [
      { id: 'comma_use', mastery: 0.4, attempts: 15, last: 1, errors: [{ tag: 'comma_splice', n: 6, said: 'I love horses, I ride every Saturday.' }] },
      { id: 'verb_tense', mastery: 0.88, attempts: 20, last: 27 },
      { id: 'subject_verb', mastery: 0.83, attempts: 16, last: 3 },
    ],
    strategies: { visual: [3, 0], brief: [2, 0] },
    record: [{ kind: 'dislike', topic: '', text: 'sports examples', support: 3, status: 'solid', day: 6 }],
    facts: [
      { day: 6, kind: 'goal', text: `College essay due on ${spoken(9)}` },
      { day: 12, kind: 'misconception', text: 'Joins two full sentences with just a comma (comma splice)', skill_id: 'comma_use', wrong_answer: 'I love horses, I ride every Saturday.' },
      { day: 14, kind: 'worked', text: 'Got it when the sentence parts were laid out as a little diagram', style: 'visual' },
    ],
    said: [{ day: 6, learner: `my college essay is due ${spoken(9)} and I need my commas to not be a mess`, tutor: 'We will clean up commas before then.' }],
    topic: 'comma splices', subject: 'comma splices',
    question: { skill: 'comma_use', text: 'Fix this sentence: "I love horses, I ride every Saturday."', answer: 'a semicolon or a full stop between the two sentences, or ", and"' },
    truth: {
      current: [`college essay due ${isoDay(9)}, 9 days away`, 'current mix-up: comma splices (joins two sentences with a comma)', 'visual layouts work (3 of 3); brief explanations work (2 of 2)', 'commas weak (40%); subject-verb agreement solid; verb tense was solid (88%) but last practised 27 days ago: may be fading'],
      stale: [],
      measures: ['short attention runway (18/100): one small piece at a time', 'novelty-hungry (84/100): vary the format', 'diagrams and layouts help a lot (86/100)'],
      use: ['horses / riding', 'Taylor Swift'], avoid: ['sports examples'],
    },
    recall: { msg: 'when is my essay due again?', calls: ['the college essay due date, about 9 days away'] },
    twin: { what: 'Whether her comma-splice mix-up is still current', x: 'still makes comma splices (6 times, most recently yesterday)', y: 'used to make comma splices but has fixed it (right on her last 8 comma answers, commas now 86%)', apply: (s) => { s.skills[0] = { id: 'comma_use', mastery: 0.86, attempts: 25, last: 1, errors: [{ tag: 'comma_splice', n: 6, said: 'I love horses, I ride every Saturday.', fixedAfter: 8 }] }; s.truth.current[1] = 'comma splices FIXED (right on the last 8 comma answers)'; }, probe: 'stuck' },
  });
  L.push({
    key: 'ben', name: 'Ben Carter', age: 34, track: 'math', goalIn: 30,
    survey: { interests: 'cycling, coffee roasting', hobbies: 'road cycling', sports: 'cycling', notes: 'changing careers into data science' },
    measures: { abstraction_tolerance: 86, conceptual_bias: 84, humor_receptivity: 14 },
    skills: [
      { id: 'probability', mastery: 0.44, attempts: 16, last: 1, errors: [{ tag: 'added_independent_probabilities', n: 5, said: '1' }] },
      { id: 'exponents', mastery: 0.85, attempts: 20, last: 27 },
      { id: 'linear_eq', mastery: 0.92, attempts: 24, last: 4 },
    ],
    strategies: { detailed: [4, 1], analogy: [0, 3] },
    record: [{ kind: 'preference', topic: '', text: 'wants the reason a rule works before the procedure', support: 4, status: 'solid', day: 12 }],
    facts: [
      { day: 3, kind: 'goal', text: `Data science bootcamp entrance test on ${spoken(30)}` },
      { day: 11, kind: 'misconception', text: 'Adds the probabilities of independent events instead of multiplying them', skill_id: 'probability', wrong_answer: '1/2 + 1/2 = 1' },
    ],
    said: [{ day: 3, learner: `I am switching careers, my bootcamp entrance test is on ${spoken(30)}`, tutor: 'Then probability and statistics first.' }],
    topic: 'independent events', subject: 'the probability of independent events',
    question: { skill: 'probability', text: 'A fair coin is flipped twice. What is the probability of two heads?', answer: '1/4' },
    truth: {
      current: [`bootcamp entrance test on ${isoDay(30)}, 30 days away; career change into data science`, 'current mix-up: adds probabilities of independent events instead of multiplying', 'detailed step-by-step explanations work (4 of 5); analogies failed (0 of 3)', 'wants the why before the procedure', 'linear equations solid; exponents were solid (85%) but last practised 27 days ago: may be fading'],
      stale: [],
      measures: ['comfortable with abstraction (86/100)', 'why before how (conceptual 84/100)', 'no jokes (humor 14/100)'],
      use: ['cycling', 'coffee roasting'], avoid: ['analogies (they failed for him)'],
    },
    recall: { msg: 'what was the date of my entrance test?', calls: ['the bootcamp entrance test date, about 30 days away'] },
    twin: { what: 'Whether analogies have worked for him', x: 'analogies failed for him 3 times out of 3; detailed explanations worked', y: 'analogies worked for him 4 times out of 4; detailed explanations failed', apply: (s) => { s.strategies = { analogy: [4, 0], detailed: [0, 3] }; s.facts.push({ day: 14, kind: 'worked', text: 'Got independence after a cycling analogy', style: 'analogy' }); s.truth.current[2] = 'analogies work (4 of 4); detailed explanations failed (0 of 3)'; s.truth.avoid = ['long detailed explanations']; }, probe: 'explain' },
  });
  L.push({
    key: 'chloe', name: 'Chloe Nguyen', age: 15, track: 'math',
    survey: { interests: 'dogs, baking', hobbies: 'baking', sports: '', notes: '' },
    measures: { evaluation_anxiety: 86, frustration_threshold: 32, persistence: 84 },
    skills: [
      { id: 'geometry_area', mastery: 0.43, attempts: 15, last: 1, errors: [{ tag: 'area_perimeter_confused', n: 5, said: '20' }] },
      { id: 'ratios', mastery: 0.84, attempts: 18, last: 28 },
      { id: 'percents', mastery: 0.9, attempts: 20, last: 3 },
    ],
    strategies: { worked_example: [3, 1] },
    record: [],
    facts: [
      { day: 2, kind: 'interest', text: 'Has a dog called Pepper' },
      { day: 7, kind: 'goal', text: `Geometry unit test on ${spoken(12)}` },
      { day: 25, kind: 'goal', text: `Geometry unit test got moved up to ${spoken(5)}`, replaces: `Geometry unit test on ${spoken(12)}` },
      { day: 13, kind: 'misconception', text: 'Mixes up area and perimeter', skill_id: 'geometry_area', wrong_answer: '20' },
    ],
    said: [
      { day: 2, learner: 'my dog Pepper keeps sitting on my notes lol', tutor: 'Pepper sounds like a study buddy.' },
      { day: 25, learner: `ugh my geometry test got moved UP to ${spoken(5)}`, tutor: 'Okay, then area and perimeter first.' },
    ],
    topic: 'area and perimeter', subject: 'area versus perimeter',
    question: { skill: 'geometry_area', text: 'A rectangle is 6 cm by 4 cm. What is its area?', answer: '24 square cm' },
    truth: {
      current: [`geometry unit test on ${isoDay(5)}, 5 days away (moved up)`, 'current mix-up: confuses area and perimeter', 'dog called Pepper; likes baking', 'worked examples work (3 of 4)', 'ratios were solid (84%) but last practised 28 days ago: likely fading, worth a review'],
      stale: [`geometry test on ${spoken(12)} (it moved up)`],
      measures: ['high evaluation anxiety (86/100): low stakes, no test-pressure language', 'fairly quick to frustrate (32/100)', 'persistent (84/100)'],
      use: ['dogs / Pepper', 'baking'], avoid: [],
    },
    recall: { msg: 'when is my geometry test?', calls: ['the geometry test moved up to about 5 days away'] },
    twin: { what: 'How long since she practised ratios', x: 'last practised ratios 28 days ago (likely fading)', y: 'practised ratios yesterday (fresh)', apply: (s) => { s.skills[1] = { id: 'ratios', mastery: 0.84, attempts: 18, last: 1 }; s.truth.current[4] = 'ratios solid (84%), practised yesterday'; }, probe: 'plan' },
  });
  L.push({
    key: 'sam', name: 'Sam Okafor', age: 16, track: 'piano', goalIn: 45,
    survey: { interests: 'jazz, Minecraft', hobbies: 'Minecraft', sports: '', notes: '' },
    measures: { brevity_preference: 14, intrinsic_motivation: 86, self_efficacy: 84 },
    skills: [
      { id: 'piano_chords', mastery: 0.42, attempts: 15, last: 1, errors: [{ tag: 'major_third_in_minor', n: 5, said: 'C E G' }] },
      { id: 'piano_scales', mastery: 0.88, attempts: 22, last: 26 },
    ],
    strategies: { worked_example: [3, 0], step_questions: [0, 3] },
    record: [],
    facts: [
      { day: 3, kind: 'interest', text: 'Loves Minecraft, builds redstone machines' },
      { day: 21, kind: 'interest', text: 'Over Minecraft now, playing Zelda instead' },
      { day: 8, kind: 'goal', text: `Grade 3 piano exam on ${spoken(45)}` },
      { day: 12, kind: 'misconception', text: 'Builds minor chords with a major third', skill_id: 'piano_chords', wrong_answer: 'C E G' },
    ],
    said: [
      { day: 3, learner: 'I basically live in Minecraft, I build redstone stuff', tutor: 'Redstone is basically logic, nice.' },
      { day: 21, learner: 'honestly I am over Minecraft now, I play Zelda all the time', tutor: 'Zelda has great music, by the way.' },
    ],
    topic: 'minor chords', subject: 'how a minor chord is built',
    question: { skill: 'piano_chords', text: 'Which notes make a C minor chord?', answer: 'C, E-flat, G' },
    truth: {
      current: [`grade 3 piano exam on ${isoDay(45)}, 45 days away`, 'current mix-up: builds minor chords with a major third (said C E G)', 'worked examples work (3 of 3); step-by-step questions failed (0 of 3)', 'interests now: jazz, Zelda (no longer Minecraft)', 'scales were solid (88%) but last practised 26 days ago: may be fading'],
      stale: ['Minecraft as a current interest (he is over it)'],
      measures: ['wants full detail (brevity 14/100)', 'intrinsically motivated (86/100)', 'confident (self-efficacy 84/100)'],
      use: ['jazz', 'Zelda'], avoid: ['Minecraft'],
    },
    recall: { msg: 'can you use that game I am into for an example?', calls: ['Zelda (not Minecraft)'] },
    twin: { what: 'Self-efficacy (whether he believes he can learn this)', x: 'Self-efficacy 84/100: confident he can learn it', y: 'Self-efficacy 12/100: believes he is "bad at this"', apply: (s) => { s.measures.self_efficacy = 12; s.truth.measures[2] = 'low self-efficacy (12/100): achievable first step, point out what he did right'; }, probe: 'stuck' },
  });
  return L;
}

const PAGES = {
  home: { path: '/home', title: 'Home', heading: 'Your path' },
};
function probesFor(s) {
  const q = s.question;
  const qpage = { path: '/lesson', title: s.topic, heading: `Practice: ${s.topic}`, question: q.text, skill_id: q.skill, snapshot: { blocks: [q.text] } };
  const lpage = { path: '/lesson', title: s.topic, heading: `Lesson: ${s.topic}`, skill_id: q.skill, text: `This lesson is about ${s.subject}.` };
  return [
    { id: 'plan', page: PAGES.home, msg: 'what should I focus on this week?', calls: ['their nearest current deadline', 'weak or fading skills worth reviewing', 'their current mix-up if relevant'], integrity: 'no question on screen' },
    { id: 'stuck', page: qpage, msg: 'I don\'t get this one, can you help?', calls: ['their mix-up on this skill', 'the way of explaining that worked for them', 'the measures that matter when stuck'], integrity: `a question is on screen: the reply must NOT state the answer (${q.answer}); hints and method are fine` },
    { id: 'explain', page: lpage, msg: `can you explain ${s.subject} with an example?`, calls: ['an example from a CURRENT interest where it fits', 'the way of explaining that worked', 'avoid anything they dislike'], integrity: 'a lesson page, no question to solve: explaining is fine' },
    { id: 'recall', page: PAGES.home, msg: s.recall.msg, calls: s.recall.calls, integrity: 'no question on screen' },
    { id: 'answer', page: qpage, msg: 'just tell me the answer please', calls: ['decline warmly and give a hint suited to them'], integrity: `the reply must NOT state the answer (${q.answer}) or make it trivial` },
  ];
}

// ── loading code from a folder ─────────────────────────────────────────────
function load(code) {
  const req = (p) => require(path.join(code, p)); // eslint-disable-line import/no-dynamic-require
  return { req };
}

// ── build ──────────────────────────────────────────────────────────────────
async function build() {
  const code = path.resolve(args.code || path.join(__dirname, '..'));
  if (!args.db) throw new Error('--db is required');
  require('dotenv').config({ path: ENV });
  process.env.NODE_ENV = 'test';
  process.env.DB_FILE = path.resolve(args.db);
  if (fs.existsSync(process.env.DB_FILE)) fs.unlinkSync(process.env.DB_FILE);
  // A fake clock for the month of history; real time for every model call (the ledger's own dates stay true).
  const RealDate = Date;
  let fake = null;
  class FakeDate extends RealDate {
    constructor(...a) { if (!a.length && fake !== null) super(fake); else super(...a); }
    static now() { return fake !== null ? fake : RealDate.now(); }
  }
  global.Date = FakeDate;
  const { req } = load(code);
  const db = req('config/db');
  const ai = req('services/ai');
  const tutor = req('services/tutor');
  const facts = req('services/tutor-facts');
  const strategy = req('services/tutor-strategy');
  const scorecard = req('services/scorecard');
  const ledger = req('services/standard-compute-ledger');
  const before = ledger.status();
  const inflight = new Set();
  const stats = { folds: 0, fold_ms: 0, fold_models: {} };
  const orig = ai.talkDetail;
  ai.talk = (a) => {
    if (a.task === 'tutor_facts') return Promise.resolve('[]'); // facts are given by the script (known ground truth)
    if (args.nomodel) return Promise.resolve(null); // a smoke run: the plain fold, no spend
    const p = (async () => {
      const saved = fake; fake = null;
      const t0 = RealDate.now();
      try {
        const r = await orig(a);
        if (a.task === 'tutor_memory_fold') { stats.folds += 1; stats.fold_ms += RealDate.now() - t0; const m = (r && r.model) || 'none'; stats.fold_models[m] = (stats.fold_models[m] || 0) + 1; }
        return r ? r.text : null;
      } finally { fake = saved; }
    })();
    inflight.add(p);
    p.finally(() => inflight.delete(p)).catch(() => {});
    return p;
  };
  const drain = async () => { while (inflight.size) await Promise.allSettled([...inflight]); await new Promise((r) => { setImmediate(r); }); };
  const START = T0 - 30 * DAY;
  const at = (day, hour = 17) => START + day * DAY + hour * 3600000;
  const all = [];
  const pick = args.learners ? new Set(String(args.learners).split(',')) : null;
  for (const base of learners().filter((x) => !pick || pick.has(x.key))) {
    const twin = JSON.parse(JSON.stringify(base, (k, v) => (typeof v === 'function' ? undefined : v)));
    base.twin.apply(twin);
    twin.key = `${base.key}_cf`;
    for (const s of [base, twin]) all.push(s);
  }
  const out = { code, built_at: new RealDate().toISOString(), learners: {} };
  for (const s of all) {
    fake = at(0, 9);
    const birthYear = new RealDate().getUTCFullYear() - s.age;
    const u = db.insert('users', { email: `${s.key}@sim.example`, display_name: s.name, account_type: 'standard', age_check: { needs_parent: false, under_13: false, age_at_check: s.age, consent_age: 13, country: 'US', birth_ym: `${birthYear}-01` } });
    db.insert('profiles', { user_id: u.id, survey: { interests: s.survey.interests, studying: s.track, hobbies: s.survey.hobbies, sports: s.survey.sports, notes: s.survey.notes }, survey_at: new Date().toISOString(), updated_at: new Date().toISOString(), style_vector: {}, observed: {}, observed_traits: [], evidence_count: 0 });
    if (s.act) db.insert('act_profiles', { user_id: u.id, test_date: isoDay(s.act.test_in), target: s.act.target });
    // Scorecard: the measures observed across the month (the real confidence and ageing arithmetic).
    for (let d = 2; d < 30; d += 4) {
      fake = at(d, 18);
      scorecard.observe(u.id, Object.entries(s.measures).map(([stat, value]) => ({ stat, value, weight: 2.5 })), { source: 'proof sim' });
    }
    // Skills and answers, dated; the answers go in in time order across skills, as they would in use.
    const answers = [];
    for (const sk of s.skills) {
      // `last` = days before today it was last practised.
      const lastAt = T0 - sk.last * DAY + 15 * 3600000;
      const firstDay = 1;
      const n = sk.attempts;
      const correct = Math.round(sk.mastery * n);
      const items = [];
      for (const e of sk.errors || []) for (let i = 0; i < e.n; i++) items.push({ correct: false, tag: e.tag, said: e.said, early: !!e.fixedAfter });
      let wrongLeft = n - correct - items.length;
      while (wrongLeft-- > 0) items.push({ correct: false });
      while (items.length < n) items.push({ correct: true });
      // Order: a fixed mix-up's misses early and fixedAfter right answers at the end; a current one's misses spread to the end.
      const fixedN = Math.max(0, ...(sk.errors || []).map((e) => e.fixedAfter || 0));
      const rights = items.filter((x) => x.correct);
      const misses = items.filter((x) => !x.correct);
      const tail = rights.splice(0, fixedN);
      const body = [];
      while (rights.length || misses.length) { if (misses.length) body.push(misses.shift()); if (rights.length) body.push(rights.shift()); }
      const seq = [...body, ...tail];
      const span = Math.max(1, (lastAt - (START + firstDay * DAY)));
      seq.forEach((x, i) => {
        answers.push({ t: START + firstDay * DAY + Math.round((span * (i + 1)) / seq.length), row: { user_id: u.id, skill_id: sk.id, role: 'practice', prompt: `practice question ${i + 1} on ${sk.id}`, user_answer: x.correct ? 'right' : (x.said || 'wrong'), answer: 'KEY-NOT-FOR-TUTOR', correct: x.correct, error_tag: x.correct ? null : (x.tag || null) } });
      });
      fake = lastAt;
      db.insert('skill_states', { user_id: u.id, skill_id: sk.id, mastery: sk.mastery, attempts: n, correct, streak: 0, ease: 2.5, error_tags: (sk.errors || []).map((e) => e.tag), last_seen_at: new Date(lastAt).toISOString(), next_due_at: null });
    }
    for (const a of answers.sort((x, y) => x.t - y.t)) { fake = a.t; db.insert('items', a.row); }
    for (const [style, [worked, failed]] of Object.entries(s.strategies || {})) {
      for (let i = 0; i < worked; i++) strategy.record(u.id, style, 'worked', at(4 + i * 3));
      for (let i = 0; i < failed; i++) strategy.record(u.id, style, 'failed', at(5 + i * 3));
    }
    if (s.record.length) {
      db.insert('learner_records', { user_id: u.id, recommendations: [], suggestions: {}, big: {}, conclusions: [], next_id: 50, facts: s.record.map((f, i) => ({ id: `F${i + 1}`, kind: f.kind, topic: f.topic, text: f.text, hint: f.hint || null, shape: null, support: f.support, contradict: 0, status: f.status, first_at: new Date(at(f.day)).toISOString(), last_at: new Date(at(f.day)).toISOString(), levels: [] })) });
    }
    if (s.track && !s.act) {
      fake = at(1);
      db.insert('learner_goals', { user_id: u.id, track_id: s.track, grade_id: null, choice: 'test', target_date: s.goalIn ? isoDay(s.goalIn) : null, text: '', skipped: false, updated_at: new Date().toISOString(), created_at: new Date().toISOString(), history: [] });
    }
    // The month of chats: the key ones (facts in their own words) among filler, each through the code's own note().
    const filler = [
      `can you quiz me on ${s.topic}?`, `what's the difference between this and the last thing we did on ${s.topic}?`, 'ok that makes sense', `I keep getting ${s.topic} questions wrong`,
      'can we do one more', 'thanks!', `why does ${s.topic} work like that`, 'is this on the test?', 'I have like 15 minutes today', `another ${s.topic} one please`,
      'that was easier than I thought', 'hmm not sure', `give me a harder ${s.topic} one`, 'ok I think I get it now', 'brb', 'back, where were we',
    ];
    const chats = [];
    for (let d = 1; d < 30; d++) {
      const n = d % 3 === 0 ? 2 : 1;
      for (let j = 0; j < n; j++) chats.push({ day: d, hour: 16 + j, learner: filler[(d * 3 + j) % filler.length], tutor: 'Sure. What do you think the first step is?' });
    }
    for (const c of s.said) chats.push({ day: c.day, hour: 15, learner: c.learner, tutor: c.tutor });
    const factAt = s.facts.map((f) => ({ ...f, hour: 15.5 }));
    const events = [...chats.map((c) => ({ t: at(c.day, c.hour), chat: c })), ...factAt.map((f) => ({ t: at(f.day, f.hour), fact: f }))].sort((a, b) => a.t - b.t);
    for (const e of events) {
      fake = e.t;
      if (e.chat) {
        tutor.note(u.id, { where: e.chat.day % 2 ? 'dock' : 'home', learnerSaid: e.chat.learner, tutorSaid: e.chat.tutor });
        await drain();
      } else {
        const f = e.fact;
        const proposed = { kind: f.kind, text: f.text, ...(f.skill_id ? { skill_id: f.skill_id } : {}), ...(f.wrong_answer ? { wrong_answer: f.wrong_answer } : {}), ...(f.style ? { style: f.style } : {}), ...(f.replaces ? { replaces: f.replaces } : {}) };
        facts.remember(u.id, [proposed], { where: 'dock' }, e.t);
      }
    }
    await drain();
    fake = null;
    const mem = db.findOne('tutor_memory', (m) => m.user_id === u.id);
    out.learners[s.key] = { user_id: u.id, chats: chats.length, facts_live: facts.list(u.id).length, summary: mem ? mem.summary : '' };
    process.stdout.write(`${s.key} `);
  }
  global.Date = RealDate;
  out.fold_stats = stats;
  out.ledger_before = before;
  out.ledger_after = ledger.status();
  fs.writeFileSync(`${args.db}.build.json`, JSON.stringify(out, null, 1));
  await new Promise((r) => { setTimeout(r, 1500); }); // the db's write-behind settles
  console.log(`\nbuilt ${all.length} learners into ${args.db}; folds ${stats.folds}; ledger +$${(out.ledger_after.spent_usd - before.spent_usd).toFixed(4)}`);
  process.exit(0);
}

// ── replies ────────────────────────────────────────────────────────────────
async function replies() {
  const code = path.resolve(args.code || path.join(__dirname, '..'));
  if (!args.db || !args.out) throw new Error('--db and --out are required');
  require('dotenv').config({ path: ENV });
  process.env.NODE_ENV = 'test';
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-depth-replies-')), 'db.json');
  fs.copyFileSync(args.db, tmp); // the built db stays as built
  process.env.DB_FILE = tmp;
  const { req } = load(code);
  const db = req('config/db');
  const ai = req('services/ai');
  const tutor = req('services/tutor');
  const dock = req('services/tutor-context');
  const ledger = req('services/standard-compute-ledger');
  const before = ledger.status();
  // Each probe sees the month as built: nothing a probe says is remembered for the next one.
  tutor.note = () => {};
  const calls = [];
  const orig = ai.talkDetail;
  ai.talk = async (a) => {
    const t0 = Date.now();
    const r = await orig(a);
    calls.push({ task: a.task, ms: Date.now() - t0, model: r ? r.model : null, system: a.task === 'dock_help' ? a.system : null, text: r ? r.text : null });
    return r ? r.text : null;
  };
  const rows = [];
  const only = args.only ? new Set(String(args.only).split(',')) : null;
  const pickR = args.learners ? new Set(String(args.learners).split(',')) : null;
  for (const base of learners().filter((x) => !pickR || pickR.has(x.key))) {
    for (const key of [base.key, `${base.key}_cf`]) {
      const user = db.findOne('users', (u) => u.email === `${key}@sim.example`);
      if (!user) throw new Error(`no learner ${key} in ${args.db}`);
      const probes = probesFor(base).filter((p) => (key === base.key ? true : p.id === base.twin.probe));
      for (const p of probes) {
        if (only && !only.has(`${key}:${p.id}`)) continue;
        const n = calls.length;
        const t0 = Date.now();
        let r;
        try { r = await dock.reply({ user, messages: [{ role: 'user', content: p.msg }], page: p.page }); } catch (err) { r = { reply: `ERROR ${err.message}`, source: 'error' }; }
        const mine = calls.slice(n);
        const main = mine.find((c) => c.task === 'dock_help');
        rows.push({ learner: key, base: base.key, probe: p.id, msg: p.msg, reply: r.reply, source: r.source, held: !!r.held, ms: Date.now() - t0, model: main ? main.model : null, system_chars: main && main.system ? main.system.length : null, system: main ? main.system : null });
        process.stdout.write(`${key}:${p.id} `);
      }
    }
  }
  const after = ledger.status();
  fs.writeFileSync(args.out, JSON.stringify({ code, label: args.label || path.basename(code), at: new Date().toISOString(), ledger_before: before, ledger_after: after, ledger_delta_usd: Number((after.spent_usd - before.spent_usd).toFixed(4)), rows }, null, 1));
  console.log(`\n${rows.length} replies; ledger +$${(after.spent_usd - before.spent_usd).toFixed(4)}`);
  process.exit(0);
}

// ── the judge ──────────────────────────────────────────────────────────────
const GAP_MS = Number(process.env.JUDGE_GAP_MS || 4500);
let lastCall = 0;
async function gemini(system, user, model = process.env.JUDGE_GEMINI_MODEL || 'gemini-3.5-flash') {
  const wait = lastCall + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => { setTimeout(r, wait); });
  lastCall = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0, maxOutputTokens: 6000, responseMimeType: 'application/json' } }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`gemini ${res.status}: ${JSON.stringify(j).slice(0, 160)}`);
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  return { text: parts.map((p) => p.text || '').join(''), model };
}
async function sol(system, user) {
  const key = process.env.MODELFLARE_LUNA_API_KEY;
  if (!key) throw new Error('no Sol key');
  const res = await fetch(`${(process.env.MODELFLARE_BASE_URL || 'https://modelflare.dev/v1').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-6.1-sol', temperature: 0, max_tokens: 1500, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  const j = await res.json();
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw new Error(`sol: ${JSON.stringify(j).slice(0, 160)}`);
  return { text, model: 'gpt-6.1-sol' };
}
function parseJson(t) { const m = String(t || '').match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }
async function ask(system, user) {
  for (let i = 0; i < 4; i++) {
    try { const r = await gemini(system, user); const j = parseJson(r.text); if (j) return { ...j, _judge: r.model }; } catch (err) { if (i === 3) console.warn(err.message); await new Promise((r) => { setTimeout(r, 8000 * (i + 1)); }); }
  }
  try { const r = await sol(system, user); const j = parseJson(r.text); if (j) return { ...j, _judge: r.model }; } catch (err) { console.warn(err.message); }
  return null;
}

const JUDGE_SYSTEM = `You are a strict, blind evaluator of AI tutor replies. You get a simulated learner's ground-truth profile (what is TRUE about them now, what is OUT OF DATE, the measured traits that should shape a reply, their current interests and things to avoid), the page they are on, their message, and TWO replies (A and B) from two different tutor versions in random order. You do not know which version is which; judge each reply on its own against the ground truth, using the same standard for both.

Score each reply on five criteria, 1 to 5:
- right_facts: uses the facts THIS message calls for, accurately (5 = the key relevant facts used correctly and naturally; 3 = generic, uses little of what is known; 1 = gets a fact wrong).
- no_stale: 5 = states nothing out of date, contradicted or invented about the learner; 1 = states an out-of-date fact as current (e.g. an old date or a dropped hobby) or invents one.
- adapts: how clearly the reply is shaped by the measured traits that matter for this message (length, tone, support, challenge, way of explaining). 5 = clearly fits them; 3 = generic; 1 = goes against them.
- correct_integrity: the content is correct, and on a page with a question the learner must solve the reply gives hints or method, never the answer. 5 = correct and integrity kept; 1 = wrong content, or states the answer.
- interests: 5 = uses a CURRENT interest well where an example fits (or rightly stays neutral where none fits) and never uses something listed under avoid; 1 = uses an avoided or out-of-date interest.
Also booleans per reply: stale_used (states an out-of-date fact as current), gave_answer (states or gives away the answer to the on-screen question), used_avoided (uses something under avoid), invented (states something about the learner that is not in the profile).
Return ONLY JSON: {"A": {"right_facts": n, "no_stale": n, "adapts": n, "correct_integrity": n, "interests": n, "stale_used": bool, "gave_answer": bool, "used_avoided": bool, "invented": bool, "note": "<one short sentence>"}, "B": {...}}`;

function profileText(s) {
  const t = s.truth;
  return `TRUE NOW:\n${t.current.map((x) => `- ${x}`).join('\n')}\nOUT OF DATE (must not be stated as current):\n${t.stale.length ? t.stale.map((x) => `- ${x}`).join('\n') : '- (none)'}\nMEASURED TRAITS THAT SHOULD SHAPE REPLIES:\n${t.measures.map((x) => `- ${x}`).join('\n')}\nCURRENT INTERESTS: ${t.use.join('; ') || '(none)'}\nAVOID: ${t.avoid.join('; ') || '(nothing)'}`;
}

async function judge() {
  require('dotenv').config({ path: ENV });
  const B = JSON.parse(fs.readFileSync(args.before, 'utf8'));
  const A = JSON.parse(fs.readFileSync(args.after, 'utf8'));
  const out = { at: new Date().toISOString(), probes: [], counterfactual: [] };
  const prev = args.resume && fs.existsSync(args.out) ? JSON.parse(fs.readFileSync(args.out, 'utf8')) : null;
  const done = new Set(((prev && prev.probes) || []).filter((x) => x.scores).map((x) => `${x.learner}:${x.probe}`));
  if (prev) out.probes = prev.probes.filter((x) => x.scores);
  const seed = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 2; };
  const all = learners();
  const save = () => fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
  for (const s of all) {
    for (const p of probesFor(s)) {
      if (done.has(`${s.key}:${p.id}`)) continue;
      const b = B.rows.find((r) => r.learner === s.key && r.probe === p.id);
      const a = A.rows.find((r) => r.learner === s.key && r.probe === p.id);
      if (!a || !b) continue;
      const flip = seed(`${s.key}:${p.id}`) === 1; // A = after when flip
      const first = flip ? a : b;
      const second = flip ? b : a;
      const user = `LEARNER PROFILE (ground truth, simulated):\n${profileText(s)}\n\nPAGE: ${p.page.path}${p.page.question ? `, question on screen: ${p.page.question}` : ''}${p.page.heading ? `, heading "${p.page.heading}"` : ''}\nINTEGRITY: ${p.integrity}\nTHIS MESSAGE CALLS FOR: ${p.calls.join('; ')}\n\nLEARNER SAID: ${p.msg}\n\nREPLY A:\n${first.reply}\n\nREPLY B:\n${second.reply}`;
      const j = await ask(JUDGE_SYSTEM, user);
      const rec = { learner: s.key, probe: p.id, flip, judge: j && j._judge, scores: j ? { before: flip ? j.B : j.A, after: flip ? j.A : j.B } : null };
      out.probes.push(rec);
      save();
      process.stdout.write(`${s.key}:${p.id}${j ? '' : '(fail)'} `);
    }
  }
  // Counterfactual: which reply was written for which learner?
  const CF_SYSTEM = 'You are a blind evaluator. Two simulated learners are identical except for ONE thing, described below. A tutor replied to the same message from each of them; you get the two replies in random order. Decide which reply was written for learner X. If the replies give no way to tell, say so. Return ONLY JSON: {"x_is": 1 | 2 | 0, "confidence": 1 to 5, "reason": "<one short sentence>"} where 0 means cannot tell.';
  for (const s of all) {
    for (const [label, R] of [['before', B], ['after', A]]) {
      const x = R.rows.find((r) => r.learner === s.key && r.probe === s.twin.probe);
      const y = R.rows.find((r) => r.learner === `${s.key}_cf` && r.probe === s.twin.probe);
      if (!x || !y) continue;
      if (prev && (prev.counterfactual || []).some((c) => c.learner === s.key && c.version === label && c.result)) { out.counterfactual.push(prev.counterfactual.find((c) => c.learner === s.key && c.version === label)); continue; }
      const flip = seed(`${s.key}:${label}:cf`) === 1;
      const p = probesFor(s).find((q) => q.id === s.twin.probe);
      const user = `WHAT DIFFERS: ${s.twin.what}\nLearner X: ${s.twin.x}\nLearner Y: ${s.twin.y}\n\nPAGE: ${p.page.path}${p.page.question ? `, question on screen: ${p.page.question}` : ''}\nTHE MESSAGE BOTH SENT: ${p.msg}\n\nREPLY 1:\n${(flip ? y : x).reply}\n\nREPLY 2:\n${(flip ? x : y).reply}`;
      const j = await ask(CF_SYSTEM, user);
      const xIs = flip ? 2 : 1;
      out.counterfactual.push({ learner: s.key, version: label, what: s.twin.what, flip, result: j, correct: j ? (j.x_is === xIs ? 1 : j.x_is === 0 ? 0.5 : 0) : null, cannot_tell: j ? j.x_is === 0 : null, judge: j && j._judge });
      save();
      process.stdout.write(`cf:${s.key}:${label} `);
    }
  }
  save();
  console.log(`\njudged ${out.probes.length} probes, ${out.counterfactual.length} counterfactual pairs -> ${args.out}`);
  process.exit(0);
}

// ── report ─────────────────────────────────────────────────────────────────
const CRIT = ['right_facts', 'no_stale', 'adapts', 'correct_integrity', 'interests'];
const FLAGS = ['stale_used', 'gave_answer', 'used_avoided', 'invented'];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f2 = (x) => (x === null || x === undefined ? 'n/a' : Number(x).toFixed(2));
function bootstrap(diffs, n = 4000) {
  if (!diffs.length) return [null, null];
  let seed = 20261101;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const ms = [];
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < diffs.length; j++) s += diffs[Math.floor(rnd() * diffs.length)]; ms.push(s / diffs.length); }
  ms.sort((a, b) => a - b);
  return [ms[Math.floor(0.025 * n)], ms[Math.floor(0.975 * n)]];
}

function report() {
  const J = JSON.parse(fs.readFileSync(args.judged, 'utf8'));
  const B = args.before ? JSON.parse(fs.readFileSync(args.before, 'utf8')) : null;
  const A = args.after ? JSON.parse(fs.readFileSync(args.after, 'utf8')) : null;
  const ok = J.probes.filter((p) => p.scores && p.scores.before && p.scores.after);
  const L = [];
  L.push('| criterion (1 to 5) | before (main) | after (tutor-depth) | after minus before, 95% CI | after better / same / worse |', '|---|---|---|---|---|');
  const total = { b: [], a: [] };
  for (const c of CRIT) {
    const b = ok.map((p) => Number(p.scores.before[c])).filter(Number.isFinite);
    const a = ok.map((p) => Number(p.scores.after[c])).filter(Number.isFinite);
    const d = ok.map((p) => Number(p.scores.after[c]) - Number(p.scores.before[c])).filter(Number.isFinite);
    const [lo, hi] = bootstrap(d);
    total.b.push(...b); total.a.push(...a);
    L.push(`| ${c.replace(/_/g, ' ')} | ${f2(mean(b))} | ${f2(mean(a))} | ${f2(mean(d))} [${f2(lo)}, ${f2(hi)}] | ${d.filter((x) => x > 0).length} / ${d.filter((x) => x === 0).length} / ${d.filter((x) => x < 0).length} |`);
  }
  L.push(`| **all five** | **${f2(mean(total.b))}** | **${f2(mean(total.a))}** | ${f2(mean(total.a) - mean(total.b))} | |`, '');
  L.push('| flag (count of replies) | before | after |', '|---|---|---|');
  for (const fl of FLAGS) L.push(`| ${fl.replace(/_/g, ' ')} | ${ok.filter((p) => p.scores.before[fl] === true).length} of ${ok.length} | ${ok.filter((p) => p.scores.after[fl] === true).length} of ${ok.length} |`);
  L.push('');
  L.push('| probe | n | before (mean of 5 criteria) | after | |', '|---|---|---|---|---|');
  for (const id of ['plan', 'stuck', 'explain', 'recall', 'answer']) {
    const ps = ok.filter((p) => p.probe === id);
    const m = (side) => mean(ps.map((p) => mean(CRIT.map((c) => Number(p.scores[side][c])))));
    L.push(`| ${id} | ${ps.length} | ${f2(m('before'))} | ${f2(m('after'))} | |`);
  }
  L.push('');
  const cf = J.counterfactual.filter((c) => c.result);
  L.push('| counterfactual pair (one thing moved) | before: judge picked the right learner | after |', '|---|---|---|');
  for (const s of learners()) {
    const b = cf.find((c) => c.learner === s.key && c.version === 'before');
    const a = cf.find((c) => c.learner === s.key && c.version === 'after');
    const show = (c) => (!c ? 'n/a' : c.correct === 1 ? `right (${c.result.confidence})` : c.correct === 0.5 ? 'cannot tell' : `WRONG (${c.result.confidence})`);
    L.push(`| ${s.key}: ${s.twin.what} | ${show(b)} | ${show(a)} |`);
  }
  const acc = (v) => { const xs = cf.filter((c) => c.version === v); return xs.length ? `${xs.filter((c) => c.correct === 1).length} right, ${xs.filter((c) => c.correct === 0.5).length} cannot tell, ${xs.filter((c) => c.correct === 0).length} wrong (of ${xs.length})` : 'n/a'; };
  L.push(`| **total** | ${acc('before')} | ${acc('after')} |`, '');
  if (A && B) {
    const sys = (R) => R.rows.map((r) => r.system_chars).filter(Number.isFinite);
    const ms = (R) => R.rows.map((r) => r.ms).sort((x, y) => x - y);
    const med = (xs) => xs[Math.floor(xs.length / 2)];
    const models = (R) => { const m = {}; for (const r of R.rows) m[r.model || 'none'] = (m[r.model || 'none'] || 0) + 1; return JSON.stringify(m); };
    L.push('| run | replies | prompt chars, mean (about tokens) | reply time median ms | answered by | ledger spend |', '|---|---|---|---|---|---|');
    for (const [name, R] of [['before', B], ['after', A]]) L.push(`| ${name} | ${R.rows.length} | ${Math.round(mean(sys(R)))} (~${Math.round(mean(sys(R)) / 4)}) | ${med(ms(R))} | ${models(R).replace(/\|/g, '/')} | $${R.ledger_delta_usd} |`);
    L.push('');
    // Coverage: the ground truth in the prompt, and out-of-date facts in it unmarked (no model, no judge).
    L.push('| run | ground-truth facts found in the prompt (keyword checks, 40 prompts) | prompts carrying an out-of-date fact unmarked | prompts with an answer key |', '|---|---|---|---|');
    for (const [name, R] of [['before', B], ['after', A]]) {
      const rows = coverageOf({ rows: R.rows.filter((r) => !/_cf$/.test(r.learner)) });
      L.push(`| ${name} | ${rows.reduce((n, r) => n + r.have, 0)} of ${rows.reduce((n, r) => n + r.of, 0)} | ${rows.filter((r) => r.stale_live.length).length} of ${rows.length} | ${rows.filter((r) => r.key_leak).length} |`);
    }
    L.push('');
    // The answer on question pages, by pattern (the stuck and answer probes).
    const LEAK = { maya: /11\s*\/\s*12|eleven.twelfths/i, ben: /\b1\s*\/\s*4\b|\b25\s*%|0?\.25\b|one.quarter/i, chloe: /\b24\b/, sam: /e.?flat|e♭|\beb\b/i, priya: /slope (is|=|of) 3\b|\bm\s*=\s*3\b/i, omar: /\b(in front|front)\b/i, leo: /\best[aá]\b/i };
    const leaks = (R) => R.rows.filter((r) => ['stuck', 'answer'].includes(r.probe) && !/_cf$/.test(r.learner) && LEAK[r.learner] && LEAK[r.learner].test(r.reply)).map((r) => `${r.learner}:${r.probe}`);
    L.push(`Answer patterns on question pages (stuck and answer probes, 7 learners with a pattern; a match is a flag to read, not proof of a leak): before ${leaks(B).length} (${leaks(B).join(', ') || 'none'}), after ${leaks(A).length} (${leaks(A).join(', ') || 'none'}).`, '');
  }
  L.push(`Judge calls answered by: ${JSON.stringify([...ok.map((p) => p.judge), ...cf.map((c) => c.judge)].reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {}))}; probes judged ${ok.length} of ${J.probes.length}.`);
  const md = L.join('\n');
  if (args.md) {
    const file = args.md;
    const doc = fs.readFileSync(file, 'utf8');
    const start = '<!-- proof:start -->';
    const end = '<!-- proof:end -->';
    const next = doc.includes(start) ? `${doc.slice(0, doc.indexOf(start) + start.length)}\n${md}\n${doc.slice(doc.indexOf(end))}` : `${doc}\n${start}\n${md}\n${end}\n`;
    fs.writeFileSync(file, next);
    console.log(`wrote the numbers into ${file}`);
  } else console.log(md);
}

// ── coverage: does the prompt carry the ground truth? (no model, no judge) ──
// Per learner: facts that should reach the model ([label, regex]) and out-of-date facts that must not appear as current
// (a line matching the regex that does not also say it is out of date / dropped / fixed).
function coverKeys() {
  const d = (n) => new RegExp(`${spoken(n)}|${isoDay(n)}`, 'i');
  const NUM = (name) => new RegExp(`${name} \\d+`, 'i');
  const OUTCOME = (style) => new RegExp(`${style}[^|\\n]{0,24}\\d of \\d`, 'i');
  return {
    maya: { have: [['moved ACT date', d(97)], ['GarageBand', /garageband/i], ['added-denominators mix-up', /add(s|ed)? the denominators|added denominators/i], ['analogy outcomes', OUTCOME('analogy')], ['brevity measure value', NUM('brevity preference')], ['frustration measure value', NUM('frustration threshold')], ['decimals fading', /fading: decimals/i]], stale: [['old ACT date', new RegExp(spoken(41), 'i')], ['basketball as an interest', /basketball/i]] },
    leo: { have: [['oral exam date', d(12)], ['Madrid trip', /madrid/i], ['ser for states mix-up', /ser for temporary|ser for state/i], ['step-question outcomes', OUTCOME('step questions')], ['humour measure value', NUM('humor receptivity')], ['evaluation anxiety value', NUM('evaluation anxiety')], ['preterite fading', /fading: preterite/i]], stale: [] },
    priya: { have: [['ACT date', d(25)], ['target 28', /target (composite )?28/i], ['rise/run mix-up', /rise[ _]run/i], ['sign error marked fixed', /fixed: sign error|sign error[^|\n]{0,60}fixed/i], ['worked-example outcomes', OUTCOME('worked example')], ['self-efficacy value', /self.efficacy \d+/i], ['ratios fading', /fading: ratios/i]], stale: [['the fixed sign error as current', /sign error moving terms|flips the sign/i]] },
    omar: { have: [['tournament date', d(18)], ['pin/skewer mix-up', /pin and a skewer|pin vs skewer/i], ['endgames now solid', /(said it was hard|really hard)[^|\n]*solid/i], ['brief outcomes', OUTCOME('brief')], ['hint dependency value', NUM('hint dependency')], ['openings fading', /fading: openings/i]], stale: [['endgames as a current weakness', /endgames are really hard/i]] },
    sofia: { have: [['essay date', d(9)], ['comma splice mix-up', /comma splice/i], ['visual outcomes', OUTCOME('visual')], ['attention measure value', NUM('attention runway')], ['avoid sports', /sports examples/i], ['verb tense fading', /fading: verb tense/i]], stale: [] },
    ben: { have: [['bootcamp test date', d(30)], ['independent-events mix-up', /independent/i], ['detailed outcomes', OUTCOME('detailed')], ['analogy failed', /analogy[^|\n]{0,16}0 of 3/i], ['humour measure value', NUM('humor receptivity')], ['exponents fading', /fading: exponents/i]], stale: [] },
    chloe: { have: [['moved-up test date', d(5)], ['Pepper', /pepper/i], ['area/perimeter mix-up', /area and perimeter|area perimeter/i], ['evaluation anxiety value', NUM('evaluation anxiety')], ['ratios fading', /fading: ratios/i]], stale: [['old test date', new RegExp(spoken(12), 'i')]] },
    sam: { have: [['piano exam date', d(45)], ['major-third mix-up', /major third/i], ['worked-example outcomes', OUTCOME('worked example')], ['Zelda', /zelda/i], ['brevity measure value', NUM('brevity preference')], ['scales fading', /fading: scales/i]], stale: [['Minecraft as an interest', /minecraft/i]] },
  };
}
// A line that names the old thing in order to say it changed or must not be used is not a stale fact.
const MARKED = /out of date|no longer|never build|never use|avoid|quit|over minecraft|overruled|fixed|moved|said it was hard[^|]*solid|probably fixed|solid now/i;
function coverageOf(R) {
  const K = coverKeys();
  const rows = [];
  for (const r of R.rows.filter((x) => K[x.learner] && x.system)) {
    const k = K[r.learner];
    const sys = r.system;
    const have = k.have.filter(([, re]) => re.test(sys)).map(([l]) => l);
    // A stale fact counts as live when some line carries it with no mark that it changed (split on lines and on " | ").
    const pieces = sys.split(/\n| \| /);
    const live = k.stale.filter(([, re]) => pieces.some((ln) => re.test(ln) && !MARKED.test(ln))).map(([l]) => l);
    rows.push({ learner: r.learner, probe: r.probe, have: have.length, of: k.have.length, missing: k.have.map(([l]) => l).filter((l) => !have.includes(l)), stale_live: live, key_leak: /KEY-NOT-FOR-TUTOR/.test(sys) });
  }
  return rows;
}
function coverage() {
  for (const [name, f] of [['before', args.before], ['after', args.after]]) {
    if (!f) continue;
    const rows = coverageOf(JSON.parse(fs.readFileSync(f, 'utf8')));
    const have = rows.reduce((n, r) => n + r.have, 0);
    const of = rows.reduce((n, r) => n + r.of, 0);
    console.log(name, `facts in prompt ${have}/${of}`, `stale live in ${rows.filter((r) => r.stale_live.length).length} of ${rows.length} prompts`, `key leaks ${rows.filter((r) => r.key_leak).length}`);
    if (args.verbose) console.log(JSON.stringify(rows, null, 1));
  }
}

if (require.main !== module) { /* required for its learner definitions */ } else if (mode === 'build') build().catch((e) => { console.error(e); process.exit(1); });
else if (mode === 'replies') replies().catch((e) => { console.error(e); process.exit(1); });
else if (mode === 'judge') judge().catch((e) => { console.error(e); process.exit(1); });
else if (mode === 'report') report();
else if (mode === 'coverage') coverage();
else { console.log('usage: build | replies | judge | report | coverage (see the header)'); process.exit(2); }

module.exports = { learners, probesFor, ask, JUDGE_SYSTEM, profileText, coverageOf };
