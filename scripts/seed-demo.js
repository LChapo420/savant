/**
 * Demo learners, so the learning scorecard, the profile page and the admin panel
 * have something to show on a fresh install.
 *
 *   npm run demo:seed        (start-demo.bat / start-demo.sh run it for you)
 *
 * Creates three learners who behave very differently, and plays real sittings
 * for each through the same services the site uses — practice levels, confidence
 * taps, finishing the lesson page at level 105 of the proficient English grade,
 * and level feedback — so their scorecards are built the way a real learner's
 * would be. A few weeks of history are then added as clearly labelled "demo
 * history" evidence, so the profiles are confident enough to change how their
 * levels are written.
 *
 * Every demo account signs in with the password `demo-password`, and is on the
 * `pro` plan, so with an AI key set their levels are written for them.
 * Running it again does nothing if the demo learners already exist.
 *
 * Run it while the server is stopped: the data file is held in the server's
 * memory, and a server running alongside would overwrite what this writes.
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const sessions = require('../services/sessions');
const learner = require('../services/learner');
const scorecard = require('../services/scorecard');
const hooks = require('../services/scorecard/hooks');
const learnerRecord = require('../services/learner-record');

/**
 * What the after-level reads would have written for each demo learner, applied
 * through the same rules a real read is (one point per read, facts tentative
 * until three levels agree). Without an AI key there are no real reads, so these
 * stand in for them and are marked as demo.
 */
const READS = {
  'demo-maya@example.com': {
    facts: [
      { kind: 'preference', topic: 'examples', text: 'Learns fastest from one quick example, then wants to try it herself' },
      { kind: 'dislike', topic: 'reading', text: 'Loses interest when a level opens with a long block of text' },
      { kind: 'struggle', topic: 'Vocabulary in context', text: 'Picks the dictionary meaning instead of the meaning in the sentence',
        question_shape: 'what does the underlined word mean in this sentence', hint_idea: 'Cover the word and guess what would fit before reading the choices' },
    ],
    conclusion: 'Moves fast and gets impatient with long explanations; examples built on sneakers and music land well. Rushes vocabulary-in-context questions.',
    stats: [{ stat: 'brevity_preference', delta: 15 }, { stat: 'rush_tendency', delta: 10 }],
  },
  'demo-jordan@example.com': {
    facts: [
      { kind: 'emotion', topic: 'tests', text: 'Gets anxious when a level feels like a test, and slows right down' },
      { kind: 'preference', topic: 'steps', text: 'Needs every step written out before trying it' },
      { kind: 'struggle', topic: 'Commonly confused words', text: 'Confuses affect and effect, and its and it\'s, under time pressure',
        question_shape: 'choose the correctly spelled word in a sentence', hint_idea: 'Say the sentence with "it is" in place of the word; if it works, it needs the apostrophe' },
    ],
    conclusion: 'Careful and slow, loses confidence after a wrong answer; worked examples at the start help. Confused-word pairs are the main sticking point.',
    stats: [{ stat: 'step_explicitness', delta: 15 }, { stat: 'evaluation_anxiety', delta: 15 }],
  },
  'demo-sam@example.com': {
    facts: [
      { kind: 'preference', topic: 'proofs', text: 'Wants to know why a rule works before using it' },
      { kind: 'interest', topic: 'challenge', text: 'Asks for a harder problem at the end of every level' },
      { kind: 'struggle', topic: 'Linear equations', text: 'Drops the sign when moving a term across the equals sign',
        question_shape: 'solve for x with a negative term on the left', hint_idea: 'Write "+(-3)" before moving it, so the sign travels with the number' },
    ],
    conclusion: 'Strong reasoner who gets bored by easy practice; careless sign errors when moving terms.',
    stats: [{ stat: 'challenge_appetite', delta: 20 }, { stat: 'conceptual_bias', delta: 15 }],
  },
};

const PASSWORD = 'demo-password';

const DEMO = [
  {
    email: 'demo-maya@example.com',
    name: 'Maya (demo)',
    track: 'english',
    grade: 'proficient',
    start: 101,
    survey: {
      interests: 'Sneaker design, music production, streetwear brands',
      studying: 'English class, I want an A this semester',
      hobbies: 'Making beats, drawing shoe concepts',
      sports: 'Basketball, I play point guard',
      notes: 'Just show me an example and I get it. Long explanations lose me.',
    },
    style: { example_order: 1, explanation_depth: 0.2, session_pacing: 0.2, challenge_appetite: 0.7 },
    answers: { accuracy: 0.85, msFactor: 0.45, confidence: 'sure' },
    readMinutes: 3,
    feedback: { pace: 'slow', length: 'long', difficulty: 'easy', liked: 'The examples', disliked: 'Way too much reading before anything happens' },
    history: {
      inductive_trajectory: 90, brevity_preference: 88, processing_velocity: 82, attention_runway: 25,
      interest_transfer: 85, narrative_pull: 30, challenge_appetite: 78, rush_tendency: 70,
      worked_example_dependence: 30, novelty_hunger: 80, humor_receptivity: 75,
    },
  },
  {
    email: 'demo-jordan@example.com',
    name: 'Jordan (demo)',
    track: 'english',
    grade: 'proficient',
    start: 101,
    survey: {
      interests: 'Horses, baking, fantasy novels',
      studying: 'Writing essays that actually make sense',
      hobbies: 'Baking bread, reading Brandon Sanderson',
      sports: '',
      notes: 'I get nervous on tests. I need to see every step written out.',
    },
    style: { example_order: 0.2, explanation_depth: 1, challenge_appetite: 0.1, feedback_timing: 0.2 },
    answers: { accuracy: 0.5, msFactor: 2.2, confidence: 'guess' },
    readMinutes: 19,
    feedback: { pace: 'fast', length: 'right', difficulty: 'hard', liked: 'The worked example at the start', disliked: 'The steps went by too fast and I got lost on the second example' },
    history: {
      step_explicitness: 92, deductive_trajectory: 82, frustration_threshold: 18, evaluation_anxiety: 85,
      self_efficacy: 22, working_memory_span: 25, intake_baseline: 22, failure_response: 25,
      feedback_tone_sensitivity: 85, structure_need: 88, momentum_dependence: 80, consolidation_need: 85,
    },
  },
  {
    email: 'demo-sam@example.com',
    name: 'Sam (demo)',
    track: 'math',
    grade: 'algebra_1_part_a',
    start: null,
    survey: {
      interests: 'Chess, space, coding',
      studying: 'Getting into a competitive STEM program',
      hobbies: 'Writing little games in Python',
      sports: 'Following Formula 1',
      notes: 'I like knowing why something works, not just the steps. Give me hard problems.',
    },
    style: { example_order: 0.5, explanation_depth: 0.6, challenge_appetite: 1, retrieval_style: 1 },
    answers: { accuracy: 0.72, msFactor: 1.1, confidence: 'think' },
    readMinutes: 8,
    feedback: { pace: 'right', length: 'short', difficulty: 'easy', liked: 'The proof of why it works', disliked: 'Too easy, I want a harder puzzle at the end' },
    history: {
      abstraction_tolerance: 88, causal_chain_depth: 85, logical_rigor: 86, challenge_appetite: 92,
      productive_struggle: 85, conceptual_bias: 84, creative_extension: 80, systems_thinking: 82,
      question_generation: 78, analogical_transfer: 72, far_transfer: 75, decay_rate: 30,
    },
  },
];

/** The first practice level at or after `from` with a practice level after it too. */
function practiceLevel(grade, from) {
  for (let l = Math.max(2, from || 2); l < grade.pathLength - 2; l++) {
    if (curriculum.levelKind(l, grade.pathLength, grade) === 'practice') return l;
  }
  return 2;
}

async function playBlock(user, session, items, plan) {
  for (const [n, item] of items.entries()) {
    if (item.correct !== null && item.correct !== undefined) continue;
    const right = Math.random() < plan.accuracy;
    let answer = right ? item.answer : 'not sure';
    if (!right && item.choices) answer = item.choices.find((c) => c !== item.answer) || answer;
    const base = 6000 + (item.difficulty || 5) * 1500;
    // eslint-disable-next-line no-await-in-loop
    await sessions.answer({
      userId: user.id,
      session,
      itemId: item.id,
      userAnswer: answer,
      ms: Math.round(base * plan.msFactor * (0.7 + Math.random() * 0.6)),
      confidence: n % 3 === 1 ? plan.confidence : null,
      changes: plan.msFactor > 1.5 ? 2 : 0,
    });
  }
}

/** One sitting of up to two practice levels at the enrollment's current level. */
async function sitting(user, enrollmentId, grade, plan) {
  const enrollment = db.byId('enrollments', enrollmentId);
  const opened = await sessions.createSession({ userId: user.id, enrollment, grade });
  let session = opened.session;
  let items = opened.items || [];
  for (let block = 0; block < 2; block++) {
    await playBlock(user, session, items, plan);
    const fresh = db.byId('sessions', session.id);
    const index = (fresh.blocks || []).length - 1;
    sessions.resolveBlock({ userId: user.id, session: fresh, enrollment: db.byId('enrollments', enrollmentId), grade, blockIndex: index });
    const after = db.byId('enrollments', enrollmentId);
    if (curriculum.levelKind(after.current_level, grade.pathLength, grade) !== 'practice') break;
    if (block === 1) break;
    const next = await sessions.addBlock({ userId: user.id, session: db.byId('sessions', session.id), enrollment: after, grade });
    session = next.session;
    items = next.items || [];
  }
  await sessions.finish({ userId: user.id, session: db.byId('sessions', session.id) });
}

async function seedOne(spec) {
  const grade = curriculum.getGrade(spec.track, spec.grade);
  if (!grade) throw new Error(`no grade ${spec.track}/${spec.grade}`);
  const user = db.insert('users', {
    email: spec.email,
    display_name: spec.name,
    password_hash: await bcrypt.hash(PASSWORD, 10),
    xp: 0,
    streak: 0,
    onboarded: true,
  });

  learner.saveProfile(user.id, {
    style_vector: spec.style,
    took_style_quiz: true,
    style_quiz_at: new Date().toISOString(),
    survey: learner.cleanSurvey(spec.survey),
    survey_at: new Date().toISOString(),
    subscription: 'pro',
  });
  scorecard.seedFromStyleQuiz(user.id, spec.style);

  const start = practiceLevel(grade, spec.start);
  const enrollment = db.insert('enrollments', {
    user_id: user.id,
    track_id: spec.track,
    grade_id: spec.grade,
    target_level: grade.pathLength,
    current_level: start,
    level_items: 0,
    levels_completed: 0,
    xp: 0,
    status: 'active',
    pending_checkpoint: null,
    placed_at: new Date().toISOString(),
  });
  hooks.onPlacement(user.id, { trackId: spec.track, placedLevel: start, pathLength: grade.pathLength });

  await sitting(user, enrollment.id, grade, spec.answers);

  // The lesson page: on the proficient grade, the creator's level 105.
  const lessonLevel = curriculum.nextLessonLevel(grade, db.byId('enrollments', enrollment.id).current_level)
    || db.byId('enrollments', enrollment.id).current_level;
  hooks.onBaseLessonFinished(user.id, {
    trackId: spec.track,
    gradeId: spec.grade,
    level: lessonLevel,
    skillId: curriculum.levelPlan(grade, lessonLevel).focus,
    readMs: spec.readMinutes * 60000,
    words: 3200,
    basis: 'base',
    arm: 'base',
  });
  db.insert('level_feedback', {
    user_id: user.id,
    track_id: spec.track,
    grade_id: spec.grade,
    level: lessonLevel,
    kind: curriculum.levelKind(lessonLevel, grade.pathLength, grade),
    ...spec.feedback,
    submitted_at: new Date().toISOString(),
  });
  hooks.onFeedback(user.id, { trackId: spec.track, gradeId: spec.grade, level: lessonLevel, ...spec.feedback });
  learner.saveProfile(user.id, {
    feedback_conclusions: [
      `Said of level ${lessonLevel}: "${spec.feedback.disliked}".`,
    ],
  });

  // Past the lesson, and one more sitting: its result is credited to the lesson.
  db.update('enrollments', enrollment.id, { current_level: practiceLevel(grade, lessonLevel + 1) });
  await sitting(user, enrollment.id, grade, spec.answers);

  // Three after-level reads, so the record has facts that are solid.
  const reads = READS[spec.email];
  for (let i = 0; i < 3; i++) {
    learnerRecord.applyDebrief(user.id, {
      conclusion: i === 2 ? `${reads.conclusion} (demo)` : '',
      emotions: [],
      stat_changes: reads.stats.map((x) => ({ ...x, reason: 'demo history' })),
      facts: reads.facts.map((f) => ({ question_shape: '', hint_idea: '', fact_id: '', reasoning: '', relation: 'new', ...f })),
      recommendation_votes: [],
    }, { trackId: spec.track, gradeId: spec.grade, level: 90 + i, mode: i === 2 ? 'feedback' : 'performance' });
  }

  // Weeks of history, compressed: the evidence a few dozen more sittings would
  // have produced, labelled so nobody mistakes it for a real session.
  for (let week = 0; week < 8; week++) {
    scorecard.observe(user.id, Object.entries(spec.history).map(([stat, value]) => ({
      stat, value: Math.max(0, Math.min(100, value + (Math.random() * 10 - 5))), weight: 0.6, note: 'demo history',
    })), { source: 'demo history', trackId: spec.track });
  }
  return user;
}

(async () => {
  if (DEMO.every((d) => db.findOne('users', (u) => u.email === d.email))) {
    console.log('Demo learners already exist. Sign in as demo-maya@example.com, demo-jordan@example.com '
      + 'or demo-sam@example.com with "demo-password".');
    return;
  }
  for (const spec of DEMO) {
    if (db.findOne('users', (u) => u.email === spec.email)) continue;
    process.stdout.write(`seeding ${spec.name}... `);
    // eslint-disable-next-line no-await-in-loop
    const user = await seedOne(spec);
    console.log(`done (scorecard ${scorecard.overallConfidence(scorecard.get(user.id))}% known)`);
  }
  // Let background work (the next level's prefetch) settle before writing.
  await new Promise((r) => setTimeout(r, 300));
  db.flush();
  console.log(`\nDemo learners ready. Each signs in with the password "${PASSWORD}":`);
  DEMO.forEach((d) => console.log(`  ${d.email}`));
})().then(() => process.exit(0)).catch((err) => {
  console.error('demo seed failed:', err);
  process.exit(1);
});
