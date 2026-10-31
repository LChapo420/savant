/**
 * Proof that the learning spec rebuilds the same lesson differently for different learners, and better.
 *
 *   node scripts/scorecard-modification-proof.js --mock                 offline; part of `npm test`
 *   node scripts/scorecard-modification-proof.js --live --tag run1      real models (see below); writes docs/SCORECARD-PROOF.md
 *
 * Sixteen synthetic learners (ages 8 to 60; second-language, dyslexia-like, short-attention, gifted-and-bored, test-anxious,
 * almost no prior knowledge and knows-most; sports, gaming, music, art, cars, cooking; dislikes of maths or reading; visual,
 * verbal, step-by-step; fast and slow; phone-only and long desk sessions) each get two of four topics (photosynthesis,
 * two-step equations, causes of World War I, Spanish greetings), every topic covered by eight learners. For every
 * learner and topic, three lessons are written by services/ai.js generateLesson, the writer the app uses:
 *
 *   spec      the learning spec's block in the prompt (services/learning-spec.js), the post-generation check and one revision
 *   legacy    what the app did before the spec: the scorecard's gated directives and the survey, no spec block
 *   generic   a learner we know nothing about (the shared version)
 *
 * and a DIFFERENT model family judges all three blind, against the learner's spec: fit to every spec field (a score and a
 * reason each), coverage of the topic's key facts (any missing are listed), accuracy, interests used, dislikes avoided and
 * age-appropriate reading level. Alongside the judge, plain code measures what it can (sentence length, long-word share,
 * sections, checks, avoided and used domains, key-fact terms), so no claim rests on a model's opinion alone.
 *
 *   --mock   a fake provider (ai.generateLesson still runs, with its revision and checks) that follows the block it is
 *            given, and a judge that is the code metrics. It proves the harness and the wiring, not the feature.
 *   --live   generation through the app's own path (services/pool.js, learner data class, the free NVIDIA lineup; paid
 *            slots are switched off), judges from AIHubMix's free models (OpenAI-compatible) or Standard Compute
 *            through services/standard-compute-ledger.js with ceilingUsd 26. The learners are synthetic: no real
 *            learner's words are sent anywhere. Real-model spend is capped at $4 (the harness stops at $3.50).
 *
 * Flags: --tag NAME, --out FILE (the markdown), --json FILE, --cache FILE (live generations and verdicts are cached by
 * prompt, so a re-run only spends on what changed), --limit N (first N learners), --concurrency N, --arms spec,legacy,generic,
 * --baseline FILE.json (a previous run, for the before/after table), --urgent (the fast writer, for a quick look).
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const LIVE = flag('live');
const MOCK = flag('mock') || !LIVE;
const TAG = opt('tag', MOCK ? 'mock' : 'run');
const LIMIT = Number(opt('limit', 16));
const CONCURRENCY = Number(opt('concurrency', LIVE ? 4 : 8));
const ARMS = String(opt('arms', 'spec,legacy,generic')).split(',').filter(Boolean);
const ROOT = path.join(__dirname, '..');
const OUT = opt('out', MOCK ? path.join(os.tmpdir(), `scorecard-proof-mock-${process.pid}.md`) : path.join(ROOT, 'docs', 'SCORECARD-PROOF.md'));
const JSON_OUT = opt('json', MOCK ? path.join(os.tmpdir(), `scorecard-proof-mock-${process.pid}.json`) : path.join(ROOT, 'docs', `scorecard-proof-${TAG}.json`));
const CACHE_FILE = opt('cache', LIVE ? path.join(os.tmpdir(), 'scorecard-proof-cache.json') : null);
const BUDGET_USD = 3.5;

if (LIVE) {
  // The app's own keys, from the owner's .env. Paid slots are switched off for the app path: the proof runs on the free lineup.
  require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
  for (const name of Object.keys(process.env)) {
    if (/^(ANTHROPIC|FACT_CHECK_ANTHROPIC|OPENROUTER|MODELFLARE|DEEPSEEK|MINIMAX|LLMGATEWAY|MIMO)_.*(KEY|WORKSPACE)/.test(name)) process.env[name] = '';
  }
  process.env.OLLAMA_ENABLED = '0';
  process.env.STANDARD_COMPUTE_LEDGER_FILE = process.env.STANDARD_COMPUTE_LEDGER_FILE || 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/standard-compute-ledger.json';
  process.env.ANTHROPIC_LEDGER_FILE = path.join(os.tmpdir(), `proof-anthropic-ledger-${process.pid}.json`);
} else {
  for (const name of Object.keys(process.env)) {
    if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|XKIRO|UNOROUTER)_.*KEY/.test(name)) process.env[name] = '';
  }
  process.env.OLLAMA_ENABLED = '0';
  process.env.AI_POOL = '0';
}
process.env.OWNER_EMAIL = `proof-owner-${process.pid}@example.test`;
const DB = path.join(os.tmpdir(), `scorecard-proof-${process.pid}.json`);
process.env.DB_FILE = DB;
process.on('exit', () => { for (const f of [DB, `${DB}.tmp`]) try { fs.unlinkSync(f); } catch { /* gone */ } });

const db = require('../config/db');
const learner = require('../services/learner');
const scorecard = require('../services/scorecard');
const { STATS } = require('../services/scorecard/stats');
const ls = require('../services/learning-spec');
const ai = require('../services/ai');
const providers = require('../services/providers');
const pool = require('../services/pool');

// ── the topics: what must survive any rebuild ─────────────────────────────
const TOPICS = {
  photosynthesis: {
    title: 'Photosynthesis', track: 'Science',
    keyFacts: [
      'Plants make glucose (sugar) from carbon dioxide and water',
      'The plant uses light energy, from the sun, to do this',
      'Chlorophyll in the chloroplasts of leaves absorbs the light',
      'Oxygen is released as a by-product',
      'Photosynthesis happens mainly in the leaves',
    ],
    exempt: ['photosynthesis', 'chlorophyll', 'chloroplasts', 'carbon', 'dioxide', 'glucose'],
  },
  'two-step equations': {
    title: 'Solving two-step equations', track: 'Math',
    keyFacts: [
      'Undo addition or subtraction first, by doing the opposite operation to both sides',
      'Then undo multiplication or division, by doing the opposite operation to both sides',
      'Whatever you do to one side of the equation you must do to the other side',
      'Check the answer by putting it back into the original equation',
      'Example form: 2x + 3 = 11 gives x = 4',
    ],
    exempt: ['equation', 'equations', 'inverse', 'operation', 'operations', 'addition', 'subtraction', 'multiplication', 'division'],
  },
  'causes of World War I': {
    title: 'The causes of World War I', track: 'History',
    keyFacts: [
      'Militarism: the great powers built up large armies and navies',
      'Alliances: Europe was divided into two blocs, so a local conflict could pull in many countries',
      'Imperialism and rivalry between empires for colonies and power',
      'Nationalism, especially in the Balkans and in Serbia',
      'The assassination of Archduke Franz Ferdinand in Sarajevo in 1914 was the spark',
    ],
    exempt: ['militarism', 'imperialism', 'nationalism', 'archduke', 'assassination', 'alliances', 'sarajevo', 'balkans'],
  },
  'Spanish greetings': {
    title: 'Spanish greetings', track: 'Spanish',
    keyFacts: [
      'Hola means hello',
      'Buenos días is good morning, buenas tardes is good afternoon, buenas noches is good evening or good night',
      'Adiós and hasta luego mean goodbye and see you later',
      'Cómo estás (informal) and cómo está usted (formal) ask how are you',
      'Mucho gusto means nice to meet you',
    ],
    exempt: ['hola', 'buenos', 'buenas', 'adiós', 'adios', 'luego', 'usted', 'estás', 'gusto', 'tardes', 'noches', 'días'],
  },
};
const TOPIC_IDS = Object.keys(TOPICS);

// ── the learners ──────────────────────────────────────────────────────────
// Archetype score maps are MEASURED scores (0 to 100) settled over many observations: the app is sure of them.
const A = {
  shortFocus: { attention_runway: 8, brevity_preference: 88, chunk_granularity: 10, cycle_architecture: 10, boredom_susceptibility: 88, persistence: 18, fatigue_curve: 85, warmup_latency: 70 },
  longFocus: { attention_runway: 92, persistence: 88, fatigue_curve: 15, brevity_preference: 25, cycle_architecture: 85 },
  visual: { spatial_anchoring: 92, text_density_tolerance: 20, analogical_transfer: 72, abstraction_tolerance: 25, cognitive_flexibility: 70 },
  verbal: { spatial_anchoring: 15, text_density_tolerance: 86, dialogic_preference: 80, vocabulary_ceiling: 80, narrative_pull: 78, notation_comfort: 30 },
  stepByStep: { step_explicitness: 94, worked_example_dependence: 90, structure_need: 92, scaffolding_fade: 12, chunk_granularity: 18, working_memory_span: 22, planning_tendency: 25 },
  fast: { processing_velocity: 92, intake_baseline: 88, brevity_preference: 82, repetition_tolerance: 12, mastery_velocity: 88, mastery_orientation: 60, jargon_absorption: 85 },
  slow: { processing_velocity: 8, intake_baseline: 12, repetition_tolerance: 88, jargon_absorption: 14, brevity_preference: 12, mastery_velocity: 20, reentry_cost: 82 },
  anxious: { evaluation_anxiety: 93, perfectionism: 82, feedback_tone_sensitivity: 88, self_efficacy: 24, frustration_threshold: 22, praise_sensitivity: 80, confidence_calibration: 30 },
  gifted: { challenge_appetite: 94, prior_knowledge: 88, boredom_susceptibility: 90, processing_velocity: 94, vocabulary_ceiling: 94, abstraction_tolerance: 88, scaffolding_fade: 94, depth_breadth: 88, curiosity_hook: 86, novelty_hunger: 86, brevity_preference: 84, repetition_tolerance: 8, logical_rigor: 80 },
  dyslexia: { text_density_tolerance: 8, vocabulary_ceiling: 18, notation_comfort: 14, spatial_anchoring: 92, repetition_tolerance: 82, jargon_absorption: 14, working_memory_span: 20, chunk_granularity: 14, brevity_preference: 78, feedback_tone_sensitivity: 75 },
  noPrior: { prior_knowledge: 6, worked_example_dependence: 88, scaffolding_fade: 12, abstraction_tolerance: 18, global_framing_need: 80, intake_baseline: 25 },
  knowsMost: { prior_knowledge: 94, scaffolding_fade: 92, worked_example_dependence: 14, brevity_preference: 85, challenge_appetite: 68, processing_velocity: 75 },
  esl: { vocabulary_ceiling: 18, jargon_absorption: 20, text_density_tolerance: 28, repetition_tolerance: 78, spatial_anchoring: 80 },
};
const mix = (...parts) => Object.assign({}, ...parts);
const LEARNERS = [
  { name: 'Maya', age: 8, blurb: 'age 8, short attention, loves Minecraft, dislikes reading', topics: ['photosynthesis', 'Spanish greetings'],
    stats: mix(A.shortFocus, A.visual, { interest_transfer: 90, gamification_response: 92, humor_receptivity: 88, narrative_pull: 80, vocabulary_ceiling: 10, tone_formality: 10 }),
    survey: { interests: 'Minecraft, drawing', hobbies: 'building things', notes: 'I hate long reading. Boring.' } },
  { name: 'Leo', age: 11, blurb: 'age 11, soccer, visual and step-by-step, dislikes maths', topics: ['two-step equations', 'causes of World War I'],
    stats: mix(A.stepByStep, A.visual, { interest_transfer: 88, competitive_drive: 85, self_efficacy: 30, humor_receptivity: 70 }),
    survey: { interests: 'soccer, FIFA', sports: 'plays striker', notes: 'I really dislike math. Math is the worst.' } },
  { name: 'Ava', age: 14, blurb: 'age 14, music, verbal, test-anxious', topics: ['causes of World War I', 'photosynthesis'],
    stats: mix(A.verbal, A.anxious, { interest_transfer: 85, narrative_pull: 85, emotional_engagement: 80 }),
    survey: { interests: 'piano, singing, songwriting', hobbies: 'writing songs', notes: 'I get really nervous when I feel tested.' } },
  { name: 'Noah', age: 17, blurb: 'age 17, cars, fast and gifted-and-bored', topics: ['two-step equations', 'causes of World War I'],
    stats: mix(A.gifted, A.fast, { interest_transfer: 80, tone_formality: 40 }),
    survey: { interests: 'cars, engines, Formula 1', hobbies: 'restoring a motorbike', notes: 'I hate when lessons repeat things. School is too slow for me.' } },
  { name: 'Grace', age: 25, blurb: 'age 25, English is a second language, cooking, step-by-step', topics: ['photosynthesis', 'Spanish greetings'], esl: true,
    stats: mix(A.stepByStep, A.esl, { interest_transfer: 86, application_orientation: 85, tone_formality: 60 }),
    survey: { interests: 'cooking, baking, food', hobbies: 'trying new recipes', notes: 'English is not my first language.' } },
  { name: 'Frank', age: 60, blurb: 'age 60, art, slow pace, little background', topics: ['two-step equations', 'Spanish greetings'],
    stats: mix(A.slow, A.noPrior, { interest_transfer: 82, tone_formality: 78, humor_receptivity: 30, notation_comfort: 20, gamification_response: 8, application_orientation: 80 }),
    survey: { interests: 'painting, museums, watercolor', hobbies: 'gardening', notes: 'I never liked math. Please explain gently.' } },
  { name: 'Sam', age: 14, blurb: 'age 14, dyslexia-like reading profile, art', topics: ['photosynthesis', 'two-step equations'],
    stats: mix(A.dyslexia, { interest_transfer: 84, spatial_anchoring: 94 }),
    survey: { interests: 'comics, drawing, skateboarding', notes: 'Reading is hard work for me and I dislike long paragraphs.' } },
  { name: 'Zoe', age: 11, blurb: 'age 11, attention difficulty, phone-only short sessions, gaming and dance', topics: ['causes of World War I', 'Spanish greetings'], device: 'phone',
    stats: mix(A.shortFocus, { attention_runway: 5, momentum_dependence: 90, novelty_hunger: 88, interest_transfer: 86, gamification_response: 88, reentry_cost: 85 }),
    survey: { interests: 'Roblox, dancing, TikTok dances', notes: 'I can only focus a few minutes at a time. I only use my phone.' } },
  { name: 'Ethan', age: 17, blurb: 'age 17, music, gifted-and-bored', topics: ['photosynthesis', 'causes of World War I'],
    stats: mix(A.gifted, { interest_transfer: 78, tone_formality: 62, logical_rigor: 86, creative_extension: 85 }),
    survey: { interests: 'guitar, music production, jazz theory', hobbies: 'composing', notes: 'I dislike busywork and baby-steps explanations.' } },
  { name: 'Priya', age: 25, blurb: 'age 25, test-anxious, cooking, dislikes maths', topics: ['two-step equations', 'Spanish greetings'],
    stats: mix(A.anxious, A.stepByStep, { interest_transfer: 84, praise_sensitivity: 88 }),
    survey: { interests: 'cooking, meal prep, baking bread', notes: 'I dislike math and I freeze on tests.' } },
  { name: 'Omar', age: 8, blurb: 'age 8, almost no prior knowledge, loves cars', topics: ['photosynthesis', 'two-step equations'],
    stats: mix(A.noPrior, A.shortFocus, { attention_runway: 22, interest_transfer: 92, narrative_pull: 82, humor_receptivity: 85, vocabulary_ceiling: 8 }),
    survey: { interests: 'cars, trucks, Hot Wheels', hobbies: 'racing toy cars' } },
  { name: 'Lena', age: 60, blurb: 'age 60, knows most of it, art and gardening, long desk sessions', topics: ['photosynthesis', 'causes of World War I'], device: 'desk',
    stats: mix(A.knowsMost, A.longFocus, A.verbal, { interest_transfer: 70, depth_breadth: 82, tone_formality: 80, logical_rigor: 70 }),
    survey: { interests: 'gardening, botany, ceramics', hobbies: 'pottery', notes: 'I already know a lot of this. Please do not over-explain.' } },
  { name: 'Diego', age: 14, blurb: 'age 14, English learner (Spanish speaker), sports, visual', topics: ['causes of World War I', 'two-step equations'], esl: true,
    stats: mix(A.esl, A.visual, { interest_transfer: 86, competitive_drive: 88, step_explicitness: 80 }),
    survey: { interests: 'basketball, NBA, sneakers', sports: 'point guard', notes: 'I am learning English; my first language is Spanish.' } },
  { name: 'Chloe', age: 17, blurb: 'age 17, verbal, music, dislikes maths', topics: ['causes of World War I', 'Spanish greetings'],
    stats: mix(A.verbal, { interest_transfer: 82, narrative_pull: 88, dialogic_preference: 85, tone_formality: 55, humor_receptivity: 72 }),
    survey: { interests: 'indie music, concerts, journaling', notes: 'I hate math and numbers.' } },
  { name: 'Ben', age: 11, blurb: 'age 11, fast, gaming, dislikes reading', topics: ['two-step equations', 'photosynthesis'],
    stats: mix(A.fast, { interest_transfer: 90, gamification_response: 90, competitive_drive: 86, challenge_appetite: 80, boredom_susceptibility: 80 }),
    survey: { interests: 'Fortnite, speedrunning, Pokemon', notes: 'I hate reading long stuff. Just get to the point.' } },
  { name: 'Ruth', age: 25, blurb: 'age 25, slow and careful, long desk sessions, cooking', topics: ['causes of World War I', 'photosynthesis'], device: 'desk',
    stats: mix(A.slow, A.stepByStep, A.longFocus, { interest_transfer: 80, repetition_tolerance: 90 }),
    survey: { interests: 'cooking, gardening, podcasts', hobbies: 'preserving food', notes: 'I like to take my time.' } },
];

// ── building the learners in a throwaway database ─────────────────────────
const NOW = new Date();
const ym = (age) => `${NOW.getUTCFullYear() - age}-01`;
function makeUser(l) {
  const user = db.insert('users', {
    email: `proof-${l.name.toLowerCase()}@example.test`, display_name: l.name, password_hash: 'x', xp: 0, streak: 0, onboarded: true,
    // Synthetic learners are cleared for outside AI: no real child's words exist in this run.
    age_check: { birth_ym: ym(l.age), needs_parent: false, under_13: false, synthetic: true },
  });
  learner.saveProfile(user.id, {
    survey: learner.cleanSurvey(l.survey || {}), subscription: 'pro',
    learning_context: { ...(l.esl ? { esl: true } : {}), ...(l.device ? { device: l.device } : {}) },
  });
  const card = scorecard.get(user.id);
  for (const [id, score] of Object.entries(l.stats)) {
    if (!STATS.some((s) => s.id === id)) throw new Error(`unknown metric ${id} for ${l.name}`);
    card.stats[id] = { ...card.stats[id], s: score, m: score, w: 8, mw: 8, n: 40, evv: 40, evx: 40, evk: 'value' };
  }
  db.update('scorecards', card.id, { stats: card.stats });
  return user;
}

// ── lesson text and the code's own metrics ────────────────────────────────
const lessonText = (l) => ai.lessonText(l);
const wordsOf = (t) => String(t || '').toLowerCase().match(/[a-zà-ÿ][a-zà-ÿ'-]*/g) || [];
const sentencesOf = (t) => String(t || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.split(' ').length >= 2);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function measure(lesson, spec, topicId, lrn) {
  const topic = TOPICS[topicId];
  const text = lessonText(lesson);
  const sents = sentencesOf(text);
  const lens = sents.map((s) => s.split(' ').length);
  const sorted = [...lens].sort((a, b) => a - b);
  const ws = wordsOf(text);
  const own = new Set(topic.exempt.map((w) => w.toLowerCase()));
  const long = ws.filter((w) => w.length >= 11 && !own.has(w)).length;
  const secs = (lesson.sections || []);
  const secSentences = secs.map((s) => sentencesOf(`${s.body} ${s.example || ''}`).length);
  const doms = (spec && spec.interests.exampleDomains) || [];
  const avoid = (spec && spec.interests.avoidDomains) || [];
  const interestHits = doms.filter((d) => ls.mentions(text, d));
  const avoidHits = avoid.filter((d) => ls.mentions(text, d));
  const cov = ls.checkFollowed(text, null, { keyFacts: topic.keyFacts }).stats;
  return {
    words: ws.length,
    sentences: sents.length,
    meanSentenceWords: Number(mean(lens).toFixed(1)),
    p90SentenceWords: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : 0,
    longWordShare: Number((ws.length ? long / ws.length : 0).toFixed(3)),
    sections: secs.length,
    meanSectionSentences: Number(mean(secSentences).toFixed(1)),
    checks: (lesson.check_questions || []).length,
    typedChecks: (lesson.check_questions || []).filter((q) => q.format === 'type_in').length,
    interestsUsed: interestHits.length,
    interestsAvailable: doms.length,
    avoidHits,
    keyFactsMissing: cov ? cov.keyFactsMissing : null,
    keyFacts: topic.keyFacts.length,
    revised: !!(lesson.spec_check && lesson.spec_check.revised),
    openProblems: (lesson.spec_check && lesson.spec_check.open) || [],
    lineBullets: (text.match(/(^|\n)\s*(\d+[.)]|[-•])\s/g) || []).length,
  };
}

// ── the dimensions the judge scores (every spec field group) ──────────────
function dimensions(spec) {
  const s = spec;
  const listAvoid = s.interests.avoidDomains.length ? s.interests.avoidDomains.join(', ') : 'none';
  const listInterests = s.interests.exampleDomains.length ? s.interests.exampleDomains.join(', ') : 'none stated';
  return [
    ['length_chunking', `Lesson length and chunk size: about ${s.lesson.sections} sections whose body is at most ${s.lesson.chunkSentences} sentences, ${s.lesson.newIdeasPerChunk === 1 ? 'one new idea' : `at most ${s.lesson.newIdeasPerChunk} new ideas`} per section, about ${s.lesson.wordBudget} words in all, at most ${s.lesson.mistakes} common mistake${s.lesson.mistakes === 1 ? '' : 's'}`],
    ['pacing', `Pacing: ${s.lesson.pace}${s.lesson.restate ? ', restating the key point once' : ''}${s.lesson.recapAtStart ? ', opening with a recap' : ''}${s.lesson.recapAtEnd ? ', ending with a recap they answer from memory' : ''}`],
    ['retrieval_checks', `Retrieval checks: ${s.lesson.retrievalChecks} check questions${s.lesson.quickCheckEvery ? `, plus a "Quick check: question, Answer: answer" line at the end of ${s.lesson.quickCheckEvery === 1 ? 'every section' : 'every second section'}` : ', none inside the lesson body (teach a full stretch first)'}`],
    ['difficulty', `Difficulty: the check questions start ${s.difficulty.startOffset <= -0.5 ? 'clearly below' : s.difficulty.startOffset >= 0.5 ? 'at or above' : 'at'} the lesson level and ramp ${s.difficulty.rampLabel}`],
    ['scaffolding_hints', `Scaffolding and hints: ${s.scaffolding.level >= 0.7 ? 'plenty of support' : s.scaffolding.level <= 0.3 ? 'little support' : 'moderate support'}; ${s.scaffolding.hintInChecks ? `each check question carries a one-line hint (${s.scaffolding.hintSize === 'nudge' ? 'a nudge' : s.scaffolding.hintSize === 'partial' ? 'the idea to use' : 'the first step'}, never the answer)` : 'no hints in the check questions'}`],
    ['worked_vs_practice', `Worked examples to practice: ${s.practice.workedExamples} worked example${s.practice.workedExamples === 1 ? '' : 's'}, then ${s.practice.tryItems} try-it item${s.practice.tryItems === 1 ? '' : 's'} inside the lesson (ratio about ${s.practice.workedToPractice}; ${s.practice.workedToPractice >= 0.9 ? 'worked examples lead' : s.practice.workedToPractice <= 0.3 ? 'practice leads' : 'balanced'})${s.practice.predictBeforeReveal ? '; asks the learner to predict before a reveal' : ''}`],
    ['explanation_modes', `Explanation modes, ranked: ${s.explain.modes.join(' > ') || 'balanced default'}; order ${s.explain.order}; analogy ${s.explain.analogy}`],
    ['vocabulary', `Vocabulary at about reading grade ${s.language.vocabularyGrade}; terms defined ${s.language.defineTerms}${s.learner.esl ? '; English is not their first language' : ''}`],
    ['sentence_length', `Sentences up to about ${s.language.maxSentenceWords} words`],
    ['examples_interests', `Examples drawn from their interests (${listInterests}): ${s.interests.share >= 0.7 ? 'the worked example and nearly every example' : s.interests.share >= 0.4 ? 'the worked example and about half the examples' : s.interests.share >= 0.3 ? 'at least one example' : 'none (neutral examples)'}`],
    ['avoided_domains', `No examples, comparisons or settings from what they dislike (${listAvoid})`],
    ['tone_feedback', `Tone: warmth ${s.feedback.tone.warmth}, formality ${s.feedback.tone.formality}, humour ${s.feedback.tone.humor}, praise ${s.feedback.tone.praise}, correction ${s.feedback.tone.correction}${s.feedback.lowStakes ? ', low stakes with no test language or timers' : ''}; feedback ${s.feedback.granularity}`],
    ['structure_format', `Structure and format: text density ${s.explain.textDensity}, paragraphs of up to ${s.explain.paragraphSentences} sentences${s.explain.numberedSteps ? ', numbered steps' : ''}${s.explain.visual ? ', structure laid out in plain-text tables, lists or trees' : ''}; notation ${s.explain.notation}`],
    ['engagement_challenge', `Engagement: challenge ${s.engagement.challenge}, novelty ${s.engagement.novelty}${s.engagement.gamification ? ', light game framing' : ''}${s.lesson.storyFrame ? ', story framing' : ''}${s.lesson.hook === 'question' ? ', opens with a question' : ''}${s.transfer.variedCases ? ', a varied case in a new setting' : ''}`],
  ];
}
const DIM_IDS = ['length_chunking', 'pacing', 'retrieval_checks', 'difficulty', 'scaffolding_hints', 'worked_vs_practice', 'explanation_modes', 'vocabulary', 'sentence_length', 'examples_interests', 'avoided_domains', 'tone_feedback', 'structure_format', 'engagement_challenge'];

// ── the mock provider: follows the block it is given ──────────────────────
const SENT_BANK = {
  photosynthesis: [
    ['Plants make glucose, a sugar, from carbon dioxide and water.', 'Plants make glucose from carbon dioxide and water.', 'Through photosynthesis, plants build glucose, a sugar, out of carbon dioxide taken from the air and water taken up by the roots.'],
    ['They use light energy from the sun.', 'The plant uses light energy from the sun to power this.', 'The plant captures light energy from the sun and uses it to drive the chemical reaction.'],
    ['Chlorophyll in the chloroplasts of the leaves absorbs the light.', 'Chlorophyll inside the chloroplasts of the leaf absorbs the light.', 'Chlorophyll, the green pigment in the chloroplasts of leaf cells, absorbs the incoming light energy.'],
    ['Oxygen is released as a by-product.', 'Oxygen is released as a by-product.', 'Oxygen is released into the air as a by-product of the reaction.'],
    ['It happens mainly in the leaves.', 'Photosynthesis happens mainly in the leaves.', 'This process takes place mainly in the leaves, where most chloroplasts are found.'],
  ],
  'two-step equations': [
    ['First, undo addition or subtraction: do the opposite operation to both sides.', 'First undo addition or subtraction by doing the opposite operation to both sides.', 'First undo the addition or subtraction by performing the opposite operation on both sides of the equation.'],
    ['Then undo multiplication or division: do the opposite operation to both sides.', 'Then undo multiplication or division by doing the opposite operation to both sides.', 'Then undo the multiplication or division by performing the opposite operation on both sides.'],
    ['Whatever you do to one side of the equation, do to the other side.', 'Whatever you do to one side of the equation you must do to the other side.', 'Whatever operation you perform on one side of the equation you must also perform on the other side to keep it balanced.'],
    ['Check the answer by putting it back into the original equation.', 'Check the answer by putting it back into the original equation.', 'Verify the solution by substituting it back into the original equation.'],
    ['For example, 2x + 3 = 11 gives x = 4.', 'For example, 2x + 3 = 11 gives x = 4.', 'For example, 2x + 3 = 11: subtract 3 to get 2x = 8, then divide by 2 to get x = 4.'],
  ],
  'causes of World War I': [
    ['Militarism: the great powers built up large armies and navies.', 'Militarism: the great powers built up large armies and navies.', 'Militarism: the great powers competed to build ever larger armies and navies, which made war seem a ready option.'],
    ['Alliances split Europe into two blocs, so a local conflict could pull in many countries.', 'Alliances divided Europe into two blocs, so a local conflict could pull in many countries.', 'Alliances divided Europe into two armed blocs, so a local conflict could draw in many countries.'],
    ['Imperialism: rivalry between empires for colonies and power.', 'Imperialism: rivalry between empires for colonies and power.', 'Imperialism: intense rivalry between the empires for colonies, markets and power.'],
    ['Nationalism was strong, especially in the Balkans and in Serbia.', 'Nationalism was strong, especially in the Balkans and in Serbia.', 'Nationalism was a powerful force, especially in the Balkans and in Serbia.'],
    ['The spark was the assassination of Archduke Franz Ferdinand in Sarajevo in 1914.', 'The spark was the assassination of Archduke Franz Ferdinand in Sarajevo in 1914.', 'The immediate spark was the assassination of Archduke Franz Ferdinand in Sarajevo in 1914.'],
  ],
  'Spanish greetings': [
    ['Hola means hello.', 'Hola means hello.', 'Hola is the everyday Spanish word for hello.'],
    ['Buenos días is good morning, buenas tardes is good afternoon, buenas noches is good night.', 'Buenos días is good morning, buenas tardes is good afternoon, and buenas noches is good evening or good night.', 'Buenos días means good morning, buenas tardes means good afternoon, and buenas noches means good evening or good night.'],
    ['Adiós and hasta luego mean goodbye and see you later.', 'Adiós and hasta luego mean goodbye and see you later.', 'Adiós and hasta luego mean goodbye and see you later.'],
    ['Cómo estás and cómo está usted ask how are you.', 'Cómo estás (informal) and cómo está usted (formal) ask how are you.', 'Cómo estás is the informal way and cómo está usted the formal way to ask how are you.'],
    ['Mucho gusto means nice to meet you.', 'Mucho gusto means nice to meet you.', 'Mucho gusto means nice to meet you.'],
  ],
};
const DEFAULT_EXAMPLES = { photosynthesis: 'a math puzzle with many numbers', 'two-step equations': 'a football game with a score', 'causes of World War I': 'a math class where the scores are added up', 'Spanish greetings': 'a math quiz at school' };

function mockWriter(req) {
  const user = String(req.user || '');
  const topicId = TOPIC_IDS.find((t) => user.includes(`"${t}"`)) || TOPIC_IDS[0];
  const bank = SENT_BANK[topicId];
  const hasBlock = user.includes('HOW TO BUILD THIS FOR THIS LEARNER');
  const maxW = Number((/most sentences (\d+) words or fewer/.exec(user) || [])[1]) || 20;
  const level = maxW <= 10 ? 0 : maxW <= 16 ? 1 : 2;
  const nSections = Number((/about (\d+) short sections/.exec(user) || [])[1]) || 3;
  const perSec = Number((/at most (\d+) sentences \(count/.exec(user) || [])[1]) || 4;
  const nChecks = Number((/(\d+) check questions? in all/.exec(user) || [])[1]) || 4;
  const domains = ((/draw them from ([^\n]*?) wherever/.exec(user) || [])[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const avoid = ((/Never use examples, comparisons or settings from: ([^\n]*?)\./.exec(user) || [])[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const note = /broke these requirements/.test(user);
  const facts = bank.map((b) => b[level]);
  // Without the block the generic writer drops in a stock example; the block-following one uses the learner's domains.
  const example = hasBlock && domains.length ? `Think of ${domains[0]}. It works the same way here.` : hasBlock ? 'Think of an everyday example. It works the same way here.' : `Think of ${DEFAULT_EXAMPLES[topicId]}. It works the same way here.`;
  const examples = avoid.length && hasBlock ? example : (note ? example : example);
  const sections = [];
  // The shape is a target, not a cap on content: more sections are added rather than a point dropped.
  const total = Math.max(2, Math.min(8, Math.max(nSections, Math.ceil(facts.length / Math.max(1, perSec - (hasBlock && domains.length ? 1 : 0))))));
  for (let i = 0; i < total; i++) {
    const own = facts.filter((_, k) => k % total === i);
    const body = [...own, i === 0 ? examples : ''].filter(Boolean).slice(0, perSec).join(' ');
    sections.push({ heading: `Part ${i + 1}`, body: body || facts[i % facts.length], example: i === 0 ? '' : '' });
  }
  const checks = Array.from({ length: Math.max(2, Math.min(6, nChecks)) }, (_, i) => ({
    prompt: `Check ${i + 1}: which of these is part of ${topicId}?`, choices: ['the right idea', 'a wrong idea', 'another wrong idea', 'a third wrong idea'], answer: 'the right idea', rationale: 'It matches the lesson.',
  }));
  return {
    title: TOPICS[topicId].title, intro: `${facts[0]} ${hasBlock ? 'Let us go step by step.' : 'This lesson explains it.'}`,
    sections, worked_example: { problem: `Use the idea: ${topicId}.`, steps: [facts[0], facts[1]], answer: 'Done.' },
    common_mistakes: [], summary: facts.slice(0, 2).join(' '), check_questions: checks,
  };
}

function installMockProvider() {
  const fake = { name: 'mock', isEnabled: () => true, costCents: () => 0, structured: async (req) => ({ data: mockWriter(req), model: 'mock-writer', usage: null }) };
  providers.chain = () => [fake];
  providers.isOutside = () => false;
}

// ── live: model names, spend, the judges ──────────────────────────────────
const als = new AsyncLocalStorage();
const spend = { appUsd: 0, calls: 0, models: {}, judgeCalls: 0, judgeModels: {}, scUsd: 0 };
function installPoolTap() {
  const real = pool.callHedged;
  pool.callHedged = async (req, opts = {}) => {
    if (spend.appUsd >= BUDGET_USD) throw new Error(`app-path spend reached $${spend.appUsd.toFixed(2)}; stopping`);
    const trace = opts.trace || {};
    const res = await real(req, { ...opts, trace });
    spend.calls += 1;
    spend.appUsd += trace.costUsd || 0;
    if (res && res.model) {
      spend.models[res.model] = (spend.models[res.model] || 0) + 1;
      const ctx = als.getStore();
      if (ctx) ctx.models.push(res.model);
    }
    return res;
  };
}

const familyOf = (m) => {
  const s = String(m || '').toLowerCase();
  if (/deepseek/.test(s)) return 'deepseek';
  if (/glm|z-ai|zhipu/.test(s)) return 'zhipu';
  if (/nemotron|nvidia/.test(s)) return 'nvidia';
  if (/gemma|gemini|google/.test(s)) return 'google';
  if (/kimi|moonshot/.test(s)) return 'moonshot';
  if (/mimo|xiaomi/.test(s)) return 'xiaomi';
  if (/minimax/.test(s)) return 'minimax';
  if (/qwen/.test(s)) return 'alibaba';
  if (/claude/.test(s)) return 'anthropic';
  if (/gpt|openai/.test(s)) return 'openai';
  if (/mistral/.test(s)) return 'mistral';
  return s || 'unknown';
};

// Judges, in order. Standard Compute carries models of many families, priced by the ledger at a deliberately high rate and held to
// ceilingUsd 26; AIHubMix's free models are only tried with --aihubmix (their free quota is ten tries per account, then refused).
const JUDGES = [
  { id: 'google/gemini-3.8-flash', family: 'google', via: 'standard_compute' },
  { id: 'qwen/qwen3.8-flash', family: 'alibaba', via: 'standard_compute' },
  { id: 'z-ai/glm-5.3-flash', family: 'zhipu', via: 'standard_compute' },
  { id: 'moonshotai/kimi-k3', family: 'moonshot', via: 'standard_compute' },
  { id: 'deepseek/deepseek-v4.1-flash-1017', family: 'deepseek', via: 'standard_compute' },
  ...(flag('aihubmix') ? [
    { id: 'gemma-4-31b-it-free', family: 'google', via: 'aihubmix' },
    { id: 'coding-kimi-k3-free', family: 'moonshot', via: 'aihubmix' },
  ] : []),
];

async function postJson(url, key, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text };
  } finally { clearTimeout(timer); }
}

async function chatAihubmix(model, system, user) {
  const base = String(process.env.AIHUBMIX_BASE_URL || 'https://aihubmix.com/v1').replace(/\/$/, '');
  const r = await postJson(`${base}/chat/completions`, process.env.AIHUBMIX_API_KEY, { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0, max_tokens: 6000 }, 240000);
  if (r.status !== 200 || !r.json || !r.json.choices) throw new Error(`aihubmix ${model} ${r.status}: ${String(r.text).slice(0, 150)}`);
  return r.json.choices[0].message.content || '';
}

async function chatStandardCompute(model, system, user) {
  const ledger = require('../services/standard-compute-ledger'); // eslint-disable-line global-require
  const key = String(process.env.STANDARD_COMPUTE_API_KEY || '').trim();
  if (!key) throw new Error('no Standard Compute key');
  const base = (/^https?:\/\//.test(String(process.env.STANDARD_COMPUTE_BASE_URL || '')) ? process.env.STANDARD_COMPUTE_BASE_URL : 'https://api.stdcmpt.com/v1').replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
  const est = ledger.estimate({ model, inputChars: system.length + user.length, maxTokens: 6000 });
  const id = ledger.reserve({ usd: est, task: 'scorecard_proof_judge', model, ceilingUsd: 26 }); // every call through the ledger, held to $26
  let settled = false;
  const settleOnce = (a) => { if (!settled) { settled = true; ledger.settle(id, a); } };
  try {
    const mk = (json) => ({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0, max_tokens: 6000, ...(json ? { response_format: { type: 'json_object' } } : {}) });
    let r = await postJson(`${base}/chat/completions`, key, mk(true), 300000);
    if ((r.status === 400 || r.status === 422) && !(r.json && r.json.choices)) r = await postJson(`${base}/chat/completions`, key, mk(false), 300000); // some models refuse json mode
    if (r.status !== 200 || !r.json || !r.json.choices) { settleOnce({ outcome: 'not_billed' }); throw new Error(`standard_compute ${model} ${r.status}: ${String(r.text).slice(0, 120)}`); }
    const u = r.json.usage || {};
    const usage = { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 };
    const usd = ledger.costOf(model, usage);
    spend.scUsd += usd;
    settleOnce({ usd, outcome: 'ok', usage });
    return r.json.choices[0].message.content || '';
  } catch (e) { settleOnce({ outcome: 'unknown' }); throw e; }
}

/**
 * The writer, when the free NVIDIA lineup is not answering: Standard Compute's DeepSeek V4.1 Flash, through the ledger
 * (ceilingUsd 26), shaped like a provider so services/ai.js generateLesson runs unchanged (prompt, spec, check, revision,
 * validation). Only the transport differs from the app's path. The learners are synthetic, so nothing real is sent.
 */
function makeScWriter() {
  const sj = require('../services/providers/structured-json'); // eslint-disable-line global-require
  const model = String(process.env.STANDARD_COMPUTE_MODEL || 'deepseek/deepseek-v4.1-flash-1017');
  return {
    name: 'standard_compute_proof', outside: true, isEnabled: () => true, costCents: () => 0,
    // One retry on an unusable reply (the gateway does not enforce the schema; the app's own providers retry the same way).
    async structured(args) {
      try { return await this.structuredOnce(args); } catch (e) { if (!/unusable structured reply/.test(e.message)) throw e; return this.structuredOnce(args); }
    },
    async structuredOnce({ system, user, schema, schemaName = 'submit', maxTokens = 2048, effort = null }) {
      const sys = `${system || ''}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema (${schemaName}):\n${JSON.stringify(schema)}`.trim();
      const ledger = require('../services/standard-compute-ledger'); // eslint-disable-line global-require
      const key = String(process.env.STANDARD_COMPUTE_API_KEY || '').trim();
      if (!key) throw new Error('no Standard Compute key');
      const base = (/^https?:\/\//.test(String(process.env.STANDARD_COMPUTE_BASE_URL || '')) ? process.env.STANDARD_COMPUTE_BASE_URL : 'https://api.stdcmpt.com/v1').replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
      const body = { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: String(user || '') }], max_tokens: Math.max(512, Number(maxTokens) || 1024) + 1024, temperature: 0, response_format: { type: 'json_object' }, ...(effort === 'medium' || effort === 'high' ? { reasoning_effort: effort } : {}) };
      const est = ledger.estimate({ model, inputChars: sys.length + String(user || '').length, maxTokens: body.max_tokens });
      const id = ledger.reserve({ usd: est, task: 'scorecard_proof_writer', model, ceilingUsd: 26 });
      let settled = false;
      const settleOnce = (a) => { if (!settled) { settled = true; ledger.settle(id, a); } };
      try {
        const r = await postJson(`${base}/chat/completions`, key, body, 360000);
        if (r.status !== 200 || !r.json || !r.json.choices) { settleOnce({ outcome: 'not_billed' }); throw new Error(`standard_compute ${r.status}`); }
        const u = r.json.usage || {};
        const usage = { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 };
        const usd = ledger.costOf(model, usage);
        spend.scUsd += usd; spend.calls += 1; spend.models[model] = (spend.models[model] || 0) + 1;
        settleOnce({ usd, outcome: 'ok', usage });
        const ctx = als.getStore();
        if (ctx) ctx.models.push(model);
        const parsed = sj.parseStructured(r.json.choices[0].message, schemaName);
        const checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
        if (checked && !checked.errors.length) return { data: checked.value, usage: { ...usage, cost_usd: usd }, model };
        if (process.env.PROOF_DEBUG) console.error('unusable reply:', parsed.error || (checked && checked.errors.slice(0, 5).join('; ')), String(parsed.raw || '').slice(0, 300), 'finish:', r.json.choices[0].finish_reason);
        throw new Error(`unusable structured reply (${parsed.error || (checked && checked.errors[0]) || 'no data'}; finish ${r.json.choices[0].finish_reason})`);
      } catch (e) { settleOnce({ outcome: 'unknown' }); throw e; }
    },
  };
}

/** Is the app's own path (pool, learner class, free NVIDIA lineup) answering? One tiny call, 60 s. */
async function appPathHealthy() {
  try {
    const probe = ai.structured({ role: 'deep', task: 'lesson_write', system: 'Reply with the JSON object requested.', user: 'Return {"ok": true}.', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, schemaName: 'probe', maxTokens: 64, userId: GENERIC.id });
    const res = await Promise.race([probe, new Promise((resolve) => { setTimeout(() => resolve('timeout'), 60000); })]);
    return !!res && res !== 'timeout';
  } catch { return false; }
}

function parseJsonLoose(text) {
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  const body = fence ? fence[1] : t;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(body.slice(a, b + 1)); } catch { return null; }
}

const JUDGE_SYSTEM = `You are a strict, fair evaluator of teaching material. You are shown one learner's profile, the requirements that were set for how a lesson should be written for that learner (the spec), the topic's key facts, and one lesson. Score the lesson only on the evidence in its text. Use the whole 0 to 10 range: 10 is exact, 5 is half-followed, 0 is the opposite or absent. Do not reward length. Do not guess who or what wrote it. Reply with one JSON object only, no prose.`;

function judgePrompt(lrn, topicId, spec, lesson) {
  const topic = TOPICS[topicId];
  const dims = dimensions(spec);
  const checks = (lesson.check_questions || []).map((q, i) => `${i + 1}. ${q.prompt}${q.choices && q.choices.length ? ` [choices: ${q.choices.join(' | ')}]` : ' [typed answer]'} -> ${q.answer}`).join('\n');
  const we = lesson.worked_example;
  const text = [
    `TITLE: ${lesson.title}`, `INTRO: ${lesson.intro}`,
    ...(lesson.sections || []).map((s, i) => `SECTION ${i + 1} - ${s.heading}\n${s.body}${s.example ? `\nEXAMPLE: ${s.example}` : ''}`),
    we ? `WORKED EXAMPLE: ${we.problem}\n${we.steps.map((x, i) => `  ${i + 1}. ${x}`).join('\n')}\n  ANSWER: ${we.answer}` : '',
    (lesson.common_mistakes || []).length ? `COMMON MISTAKES:\n${lesson.common_mistakes.join('\n')}` : '',
    `SUMMARY: ${lesson.summary}`, `CHECK QUESTIONS:\n${checks}`,
  ].filter(Boolean).join('\n\n');
  return `LEARNER: ${lrn.blurb}. Age ${lrn.age}. Interests and what they said: ${JSON.stringify(lrn.survey || {})}${lrn.esl ? '. English is not their first language' : ''}${lrn.device === 'phone' ? '. Uses a phone only, short sessions' : ''}${lrn.device === 'desk' ? '. Long desk sessions' : ''}.

TOPIC: ${topic.title}
KEY FACTS THAT MUST BE TAUGHT (each should be present, correct and clear):
${topic.keyFacts.map((k, i) => `${i + 1}. ${k}`).join('\n')}

THE SPEC (what the lesson should be like for this learner), one line per dimension:
${dims.map(([id, d]) => `- ${id}: ${d}`).join('\n')}

LESSON TO SCORE:
${text}

Return this JSON (every key present):
{
 "fit": { ${DIM_IDS.map((d) => `"${d}": {"score": 0-10, "reason": "one short sentence citing the text"}`).join(', ')} },
 "coverage": {"score": 0-10, "covered": [numbers of the key facts clearly taught], "missing": ["each key fact that is missing or wrong, in a few words"]},
 "accuracy": {"score": 0-10, "errors": ["each factual or arithmetic error, or empty"]},
 "interests_used": {"score": 0-10, "used": ["the learner's interests that shaped an example; score 10 if they are woven in naturally, 0 if none, and 5 if there are no stated interests to use"]},
 "dislikes_avoided": {"score": 0-10, "violations": ["anything the learner dislikes that appears; 10 if none"]},
 "reading_level": {"score": 0-10, "estimated_grade": number, "reason": "is the language right for this learner's age and reading needs"}
}`;
}

function validVerdict(v) {
  if (!v || typeof v !== 'object' || !v.fit) return null;
  const n = (x) => (Number.isFinite(Number(x?.score)) ? Math.max(0, Math.min(10, Number(x.score))) : null);
  const fit = {};
  for (const d of DIM_IDS) { const s = n(v.fit[d]); if (s === null) return null; fit[d] = { score: s, reason: String((v.fit[d] || {}).reason || '').slice(0, 200) }; }
  const parts = ['coverage', 'accuracy', 'interests_used', 'dislikes_avoided', 'reading_level'];
  const out = { fit };
  for (const p of parts) { const s = n(v[p]); if (s === null) return null; out[p] = { ...v[p], score: s }; }
  out.coverage.missing = Array.isArray(v.coverage.missing) ? v.coverage.missing.map(String).slice(0, 8) : [];
  out.accuracy.errors = Array.isArray(v.accuracy.errors) ? v.accuracy.errors.map(String).slice(0, 8) : [];
  out.dislikes_avoided.violations = Array.isArray(v.dislikes_avoided.violations) ? v.dislikes_avoided.violations.map(String).slice(0, 8) : [];
  return out;
}

async function liveJudge(lrn, topicId, spec, lesson, avoidFamilies) {
  const candidates = JUDGES.filter((j) => !avoidFamilies.has(j.family));
  const prompt = judgePrompt(lrn, topicId, spec, lesson);
  let lastErr = null;
  for (const j of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = j.via === 'aihubmix' ? await chatAihubmix(j.id, JUDGE_SYSTEM, prompt) : await chatStandardCompute(j.id, JUDGE_SYSTEM, prompt);
        const verdict = validVerdict(parseJsonLoose(text));
        spend.judgeCalls += 1;
        spend.judgeModels[j.id] = (spend.judgeModels[j.id] || 0) + 1;
        if (verdict) return { ...verdict, judge: j.id, judge_family: j.family };
        lastErr = new Error(`${j.id}: unusable verdict`);
        if (process.env.PROOF_DEBUG) console.error(`judge ${j.id}: unusable verdict; raw: ${String(text).slice(0, 400).replace(/s+/g, ' ')}`);
      } catch (e) { lastErr = e; if (process.env.PROOF_DEBUG) console.error(`judge ${j.id}: ${e.message}`); }
    }
  }
  throw lastErr || new Error('no judge available');
}

// The mock judge is the code: it scores each dimension from the measured text against the spec. Deterministic.
function heuristicJudge(lrn, topicId, spec, lesson) {
  const m = measure(lesson, spec, topicId, lrn);
  const near = (actual, want, tol) => Math.max(0, Math.min(10, 10 - (Math.abs(actual - want) / Math.max(tol, 1e-9)) * 5));
  const fit = {
    length_chunking: near(m.sections, spec.lesson.sections, 2) * 0.5 + near(m.meanSectionSentences, spec.lesson.chunkSentences, 3) * 0.5,
    pacing: near(m.words, spec.lesson.minutes * 35, 120),
    retrieval_checks: near(m.checks, spec.lesson.retrievalChecks, 2),
    difficulty: 7,
    scaffolding_hints: 7,
    worked_vs_practice: 7,
    explanation_modes: 7,
    vocabulary: Math.max(0, Math.min(10, 10 - Math.max(0, m.longWordShare - (0.025 + 0.012 * Math.max(0, spec.language.vocabularyGrade - 3))) * 120)),
    sentence_length: near(m.meanSentenceWords, Math.min(spec.language.maxSentenceWords, 12), 8),
    examples_interests: spec.interests.exampleDomains.length ? (m.interestsUsed ? 9 : 2) : 7,
    avoided_domains: m.avoidHits.length ? 1 : 10,
    tone_feedback: 7,
    structure_format: 7,
    engagement_challenge: 7,
  };
  const o = { fit: Object.fromEntries(DIM_IDS.map((d) => [d, { score: Number(fit[d].toFixed(1)), reason: 'measured by code' }])) };
  o.coverage = { score: Number((10 * (1 - (m.keyFactsMissing || 0) / m.keyFacts)).toFixed(1)), missing: [] };
  o.accuracy = { score: 9, errors: [] };
  o.interests_used = { score: spec.interests.exampleDomains.length ? (m.interestsUsed ? 9 : 1) : 5, used: [] };
  o.dislikes_avoided = { score: m.avoidHits.length ? 0 : 10, violations: m.avoidHits };
  o.reading_level = { score: Number(near(m.meanSentenceWords, spec.language.maxSentenceWords, 10).toFixed(1)), estimated_grade: null, reason: 'measured by code' };
  return { ...o, judge: 'code', judge_family: 'code' };
}

// ── running one cell ──────────────────────────────────────────────────────
const cache = (() => {
  if (!CACHE_FILE) return { get: () => null, set: () => {} };
  let data = {};
  try { data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { /* new */ }
  let dirty = null;
  return {
    get: (k) => data[k] || null,
    set: (k, v) => { data[k] = v; if (!dirty) dirty = setTimeout(() => { dirty = null; try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data)); } catch { /* best effort */ } }, 500); },
    flush: () => { try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data)); } catch { /* best effort */ } },
  };
})();
const sha = (s) => require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 16); // eslint-disable-line global-require

function legacyLines(userId) {
  // What the app wrote before the spec: the scorecard's gated directives (services/scorecard/contract.js forPrompt).
  const contract = require('../services/scorecard/contract'); // eslint-disable-line global-require
  return contract.forPrompt(contract.read(userId, { trackId: null, gradeId: null, memory: false }));
}

const inflight = new Map();
async function generate(arm, lrn, userId, topicId, spec) {
  const topic = TOPICS[topicId];
  const profile = learner.getProfile(userId);
  const params = learner.sessionParams(profile);
  const base = {
    skillId: topicId, difficulty: 5, level: 1, trackName: topic.track, gradeName: 'mixed ages', topic: topic.title,
    topicPosition: null, topicBefore: null, topicAfter: null, profile, params, taught: [], urgent: flag('urgent'), userId,
  };
  let call;
  if (arm === 'spec') call = { ...base, extraLines: [...legacyLines(userId), ...ls.specToLines(spec, { surface: 'lesson' })], spec, keyFacts: topic.keyFacts };
  else if (arm === 'legacy') call = { ...base, extraLines: legacyLines(userId), spec: null, keyFacts: [] };
  else call = { ...base, userId: GENERIC.id, profile: learner.getProfile(GENERIC.id), params: learner.sessionParams(learner.getProfile(GENERIC.id)), extraLines: [], spec: null, keyFacts: [] };
  const key = `gen:${arm}:${arm === 'generic' ? '' : lrn.name}:${topicId}:${sha(JSON.stringify([call.extraLines, call.topic, call.urgent, learner.teachingBrief(call.userId, { skillId: topicId, noSpec: true })]))}`;
  const hit = cache.get(key);
  if (hit && hit.lesson) return hit;
  // The generic lesson is one prompt per topic: cells of the same topic wait for the one in flight.
  if (inflight.has(key)) return inflight.get(key);
  const task = (async () => {
    const ctx = { models: [] };
    const lesson = await als.run(ctx, () => ai.generateLesson(call));
    if (!lesson) return { lesson: null, models: ctx.models, error: 'no lesson' };
    const out = { lesson, models: ctx.models };
    if (LIVE) cache.set(key, out);
    return out;
  })();
  inflight.set(key, task);
  return task;
}

async function limited(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const run = async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e.message }; } } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}

let GENERIC = null;

async function main() {
  const ledger = LIVE ? require('../services/standard-compute-ledger') : null; // eslint-disable-line global-require
  const ledgerBefore = ledger ? ledger.status() : null;
  GENERIC = db.insert('users', { email: 'proof-generic@example.test', display_name: 'Generic', password_hash: 'x', onboarded: true, age_check: { birth_ym: ym(30), needs_parent: false, under_13: false, synthetic: true } });
  let writerPath = 'mock';
  if (MOCK) installMockProvider();
  else {
    installPoolTap();
    const forced = opt('writer');
    const healthy = forced ? forced === 'app' : await appPathHealthy();
    writerPath = healthy ? 'app path (pool, learner class, free NVIDIA lineup)' : 'Standard Compute DeepSeek V4.1 Flash through the ledger (the free NVIDIA lineup was not answering)';
    if (!healthy) { process.env.AI_POOL = '0'; providers.chain = () => [makeScWriter()]; providers.isOutside = () => false; }
    console.log(`writer: ${writerPath}`);
  }

  const learners = LEARNERS.slice(0, LIMIT).map((l) => ({ ...l, user: makeUser(l) }));
  const cells = [];
  for (const l of learners) for (const t of l.topics) cells.push({ l, topicId: t });
  const topicCover = Object.fromEntries(TOPIC_IDS.map((t) => [t, learners.filter((l) => l.topics.includes(t)).length]));
  console.log(`${learners.length} learners, ${cells.length} learner-topic cells, arms ${ARMS.join('+')}, ${MOCK ? 'mock' : 'LIVE'}`);

  // Each cell: the three lessons, then one blind judge for all three (a family different from every writer's).
  const results = await limited(cells, CONCURRENCY, async ({ l, topicId }) => {
    const spec = ls.buildSpec(l.user.id, { topic: topicId, trackId: null });
    const gens = {};
    await Promise.all(ARMS.map(async (arm) => { gens[arm] = await generate(arm, l, l.user.id, topicId, spec); }));
    const writerFamilies = new Set(Object.values(gens).flatMap((g) => (g.models || []).map(familyOf)));
    if (MOCK && !writerFamilies.size) writerFamilies.add('mock');
    const cell = { learner: l.name, topic: topicId, spec: { hash: ls.specHash(spec), levers: spec.levers, isDefault: spec.isDefault, summary: summarizeSpec(spec), prompt: ls.specToPrompt(spec) }, arms: {} };
    for (const arm of ARMS) {
      const g = gens[arm];
      if (!g || !g.lesson) { cell.arms[arm] = { error: g && g.error ? g.error : 'no lesson' }; console.error(`
${l.name}/${topicId}/${arm}: no lesson`); continue; }
      const m = measure(g.lesson, spec, topicId, l);
      const jkey = `judge:${arm}:${arm === 'generic' ? '' : l.name}:${topicId}:${sha(JSON.stringify([g.lesson, dimensions(spec).map((d) => d[1])]))}`;
      let verdict = LIVE ? cache.get(jkey) : null;
      if (!verdict) {
        try {
          verdict = MOCK ? heuristicJudge(l, topicId, spec, g.lesson) : await liveJudge(l, topicId, spec, g.lesson, writerFamilies);
          if (LIVE) cache.set(jkey, verdict);
        } catch (e) { cell.arms[arm] = { measure: m, models: g.models, error: `judge: ${e.message}` }; console.error(`
${l.name}/${topicId}/${arm}: judge failed: ${e.message}`); continue; }
      }
      cell.arms[arm] = { measure: m, verdict, models: g.models, lesson: g.lesson };
    }
    process.stdout.write('.');
    return cell;
  });
  process.stdout.write('\n');
  if (cache.flush) cache.flush();

  const report = buildReport(learners, results.filter((r) => r && !r.error), topicCover, { ledgerBefore, ledgerAfter: ledger ? ledger.status() : null, writerPath });
  const baseline = opt('baseline') ? JSON.parse(fs.readFileSync(opt('baseline'), 'utf8')) : null;
  fs.writeFileSync(JSON_OUT, JSON.stringify(report.data, null, 1));
  fs.writeFileSync(OUT, renderMarkdown(report, baseline));
  console.log(`wrote ${OUT}`);
  console.log(report.summaryText);
  if (MOCK) assertMock(report, learners, cells);
}

// ── the report ────────────────────────────────────────────────────────────
function summarizeSpec(spec) {
  return {
    lesson: spec.lesson, difficulty: spec.difficulty, scaffolding: spec.scaffolding, practice: spec.practice, explain: { modes: spec.explain.modes, order: spec.explain.order, textDensity: spec.explain.textDensity },
    language: spec.language, interests: spec.interests, review: spec.review, feedback: spec.feedback, session: spec.session, aversions: spec.aversions,
  };
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f1 = (x) => (x === null || x === undefined || Number.isNaN(x) ? 'n/a' : Number(x).toFixed(1));

function dimScore(cell, arm, dim) {
  const a = cell.arms[arm];
  if (!a || !a.verdict) return null;
  if (dim === 'coverage' || dim === 'accuracy' || dim === 'interests_used' || dim === 'dislikes_avoided' || dim === 'reading_level') return a.verdict[dim].score;
  return a.verdict.fit[dim].score;
}
const ALL_DIMS = [...DIM_IDS, 'interests_used', 'dislikes_avoided', 'reading_level', 'coverage', 'accuracy'];
const fitMean = (cell, arm) => avg(DIM_IDS.map((d) => dimScore(cell, arm, d)).filter((x) => x !== null));

function buildReport(learners, cells, topicCover, ledgers) {
  const byArm = {};
  for (const arm of ARMS) {
    byArm[arm] = {};
    for (const d of ALL_DIMS) byArm[arm][d] = avg(cells.map((c) => dimScore(c, arm, d)).filter((x) => x !== null));
    byArm[arm].fit = avg(DIM_IDS.map((d) => byArm[arm][d]));
  }
  const perLearner = learners.map((l) => {
    const mine = cells.filter((c) => c.learner === l.name);
    const row = { name: l.name, blurb: l.blurb, topics: mine.map((c) => c.topic), arms: {} };
    for (const arm of ARMS) { row.arms[arm] = {}; for (const d of ALL_DIMS) row.arms[arm][d] = avg(mine.map((c) => dimScore(c, arm, d)).filter((x) => x !== null)); row.arms[arm].fit = avg(DIM_IDS.map((d) => row.arms[arm][d]).filter((x) => x !== null)); }
    return row;
  });
  const metrics = {};
  for (const arm of ARMS) {
    const ms = cells.map((c) => c.arms[arm] && c.arms[arm].measure).filter(Boolean);
    metrics[arm] = {
      n: ms.length,
      failed: cells.filter((c) => !c.arms[arm] || !c.arms[arm].verdict).length,
      meanSentenceWords: avg(ms.map((m) => m.meanSentenceWords)), longWordShare: avg(ms.map((m) => m.longWordShare)), sections: avg(ms.map((m) => m.sections)),
      sectionSentences: avg(ms.map((m) => m.meanSectionSentences)), checks: avg(ms.map((m) => m.checks)), words: avg(ms.map((m) => m.words)),
      avoidViolations: ms.filter((m) => m.avoidHits.length).length, keyFactsMissing: ms.reduce((n, m) => n + (m.keyFactsMissing || 0), 0), keyFacts: ms.reduce((n, m) => n + m.keyFacts, 0),
      interestCells: ms.filter((m) => m.interestsAvailable).length, interestUsed: ms.filter((m) => m.interestsAvailable && m.interestsUsed).length,
      revised: ms.filter((m) => m.revised).length, openProblems: ms.filter((m) => m.openProblems.length).length,
    };
  }
  // Does the spec arm follow its own numbers? Per-cell agreement of measured text with the spec.
  const followed = cells.filter((c) => c.arms.spec && c.arms.spec.measure).map((c) => {
    const m = c.arms.spec.measure;
    const sp = c.spec.summary;
    return {
      learner: c.learner, topic: c.topic,
      sentenceOk: m.meanSentenceWords <= sp.language.maxSentenceWords * 1.25,
      sectionsOk: Math.abs(m.sections - sp.lesson.sections) <= 2,
      checksOk: Math.abs(m.checks - Math.min(sp.lesson.retrievalChecks, 6)) <= 1,
      avoidOk: m.avoidHits.length === 0,
      interestOk: !sp.interests.exampleDomains.length || sp.interests.share < 0.5 || m.interestsUsed > 0,
    };
  });
  const wins = { spec_over_generic: 0, spec_over_legacy: 0, ties: 0, cells: 0 };
  const losses = [];
  for (const c of cells) {
    const s = fitMean(c, 'spec'); const g = ARMS.includes('generic') ? fitMean(c, 'generic') : null; const lg = ARMS.includes('legacy') ? fitMean(c, 'legacy') : null;
    if (s === null) continue;
    wins.cells += 1;
    if (g !== null && s > g + 0.25) wins.spec_over_generic += 1;
    if (lg !== null && s > lg + 0.25) wins.spec_over_legacy += 1;
    if (g !== null && s < g - 0.25) losses.push({ learner: c.learner, topic: c.topic, spec: s, generic: g });
  }
  const problems = {};
  for (const c of cells) for (const p of (c.arms.spec && c.arms.spec.measure ? c.arms.spec.measure.openProblems : [])) problems[p] = (problems[p] || 0) + 1;
  const missing = {};
  for (const c of cells) for (const arm of ARMS) { const a = c.arms[arm]; if (a && a.verdict) for (const mm of a.verdict.coverage.missing) { const k = `${arm}/${c.topic}: ${mm}`; missing[k] = (missing[k] || 0) + 1; } }
  const data = { tag: TAG, live: LIVE, writerPath: ledgers.writerPath, generated_at: new Date().toISOString(), learners: learners.length, cells: cells.length, byArm, perLearner, metrics, followed, wins, losses, problems, missing, topicCover, spend, ledgers,
    judges: [...new Set(cells.flatMap((c) => ARMS.map((a) => c.arms[a] && c.arms[a].verdict && c.arms[a].verdict.judge).filter(Boolean)))],
    writers: spend.models, raw: cells.map((c) => ({ learner: c.learner, topic: c.topic, spec: c.spec, arms: Object.fromEntries(Object.entries(c.arms).map(([k, v]) => [k, { measure: v.measure, verdict: v.verdict, models: v.models, error: v.error, title: v.lesson && v.lesson.title }])) })) };
  const s = byArm.spec; const g = byArm.generic;
  const summaryText = `spec fit ${f1(s && s.fit)}${g ? `, generic ${f1(g.fit)}` : ''}${byArm.legacy ? `, legacy ${f1(byArm.legacy.fit)}` : ''}; coverage spec ${f1(s && s.coverage)}${g ? ` / generic ${f1(g.coverage)}` : ''}; accuracy spec ${f1(s && s.accuracy)}; cells ${cells.length}`;
  return { data, summaryText, cells };
}

function table(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}
const DIM_LABEL = {
  length_chunking: 'Lesson and chunk length', pacing: 'Pacing', retrieval_checks: 'Retrieval checks', difficulty: 'Difficulty start and ramp', scaffolding_hints: 'Scaffolding and hint size',
  worked_vs_practice: 'Worked example to practice', explanation_modes: 'Explanation modes', vocabulary: 'Vocabulary level', sentence_length: 'Sentence length', examples_interests: 'Examples from interests',
  avoided_domains: 'Avoided domains', tone_feedback: 'Tone and feedback', structure_format: 'Structure and format', engagement_challenge: 'Challenge and novelty',
  interests_used: 'Interests used (judge)', dislikes_avoided: 'Dislikes avoided (judge)', reading_level: 'Age-appropriate reading level', coverage: 'Key-fact coverage', accuracy: 'Accuracy',
};

function renderMarkdown(report, baseline) {
  const d = report.data;
  if (!d.byArm.spec) return `Run ${d.tag}: arms ${ARMS.join(', ')} only (no spec arm), nothing to compare.
`;
  const L = [];
  L.push('# Scorecard modification proof');
  L.push('');
  L.push(`Run \`${d.tag}\`${d.live ? ' (live models)' : ' (mock: harness check only, not evidence)'} on ${d.generated_at.slice(0, 10)}. Written by \`node scripts/scorecard-modification-proof.js\`.`);
  L.push('');
  L.push(`Sixteen synthetic learners, two topics each (${d.cells} lessons per arm), every topic covered by ${Math.min(...Object.values(d.topicCover))} to ${Math.max(...Object.values(d.topicCover))} learners. Three arms: **spec** (the learning spec in the prompt, with its check and one revision), **legacy** (what the app did before: the scorecard's gated directives and the survey), **generic** (a learner we know nothing about: the shared version). Each lesson was judged blind by a model from a different family than any writer of it, against the learner's spec. Writer path: ${d.writerPath}. Judges used: ${d.judges.join(', ') || 'n/a'}. Writers: ${Object.entries(d.writers).map(([k, v]) => `${k} x${v}`).join(', ') || 'n/a'}.`);
  L.push('');
  L.push('## Averages: spec against generic and legacy');
  L.push('');
  const arms = ARMS;
  const rows = ALL_DIMS.map((dim) => {
    const cells = [DIM_LABEL[dim]];
    for (const a of arms) cells.push(f1(d.byArm[a][dim]));
    if (arms.includes('generic')) cells.push(f1(d.byArm.spec[dim] - d.byArm.generic[dim]));
    if (arms.includes('legacy')) cells.push(f1(d.byArm.spec[dim] - d.byArm.legacy[dim]));
    return cells;
  });
  rows.push(['**Mean fit to the spec (14 dimensions)**', ...arms.map((a) => `**${f1(d.byArm[a].fit)}**`), ...(arms.includes('generic') ? [`**${f1(d.byArm.spec.fit - d.byArm.generic.fit)}**`] : []), ...(arms.includes('legacy') ? [`**${f1(d.byArm.spec.fit - d.byArm.legacy.fit)}**`] : [])]);
  L.push(table(['Dimension (0 to 10)', ...arms, ...(arms.includes('generic') ? ['spec - generic'] : []), ...(arms.includes('legacy') ? ['spec - legacy'] : [])], rows));
  L.push('');
  L.push(`Cells where the spec lesson fits better than the generic one by more than 0.25: ${d.wins.spec_over_generic} of ${d.wins.cells}; better than legacy: ${d.wins.spec_over_legacy} of ${d.wins.cells}. Cells where it fits worse than generic: ${d.losses.length}${d.losses.length ? ` (${d.losses.map((x) => `${x.learner}/${x.topic} ${f1(x.spec)} vs ${f1(x.generic)}`).join('; ')})` : ''}.`);
  L.push('');
  L.push('## What the code measured in the text (no model)');
  L.push('');
  L.push(table(['Measure', ...arms], [
    ['Lessons written and judged', ...arms.map((a) => d.metrics[a].n)],
    ['Cells with no lesson or no verdict (the app would serve the bank lesson)', ...arms.map((a) => d.metrics[a].failed)],
    ['Mean sentence length (words)', ...arms.map((a) => f1(d.metrics[a].meanSentenceWords))],
    ['Share of long words (11+ letters, not the topic\'s own)', ...arms.map((a) => (d.metrics[a].longWordShare * 100).toFixed(1) + '%')],
    ['Sections', ...arms.map((a) => f1(d.metrics[a].sections))],
    ['Sentences per section', ...arms.map((a) => f1(d.metrics[a].sectionSentences))],
    ['Check questions', ...arms.map((a) => f1(d.metrics[a].checks))],
    ['Words in the lesson', ...arms.map((a) => Math.round(d.metrics[a].words))],
    ['Lessons that used a disliked domain', ...arms.map((a) => d.metrics[a].avoidViolations)],
    ['Lessons that used an interest (of those with interests)', ...arms.map((a) => `${d.metrics[a].interestUsed} of ${d.metrics[a].interestCells}`)],
    ['Key facts missing (term overlap, of all)', ...arms.map((a) => `${d.metrics[a].keyFactsMissing} of ${d.metrics[a].keyFacts}`)],
    ['Lessons revised once by the spec check', ...arms.map((a) => (a === 'spec' ? d.metrics[a].revised : 'n/a'))],
    ['Lessons that left a spec problem open after the revision', ...arms.map((a) => (a === 'spec' ? d.metrics[a].openProblems : 'n/a'))],
  ]));
  L.push('');
  const fol = d.followed;
  const pct = (k) => `${fol.filter((x) => x[k]).length} of ${fol.length}`;
  L.push(`Spec followed, by the code's count (spec arm): sentence length within 25% of the cap ${pct('sentenceOk')}; section count within 2 ${pct('sectionsOk')}; number of checks within 1 ${pct('checksOk')}; no disliked domain ${pct('avoidOk')}; interests used when the spec asks ${pct('interestOk')}.`);
  L.push('');
  L.push('## Per learner');
  L.push('');
  L.push('Averages over the learner\'s two topics, 0 to 10 (fit = mean of the 14 spec dimensions).');
  L.push('');
  for (const p of d.perLearner) {
    L.push(`### ${p.name}: ${p.blurb}`);
    L.push(`Topics: ${p.topics.join(', ')}.`);
    L.push('');
    L.push(table(['Dimension', ...arms], [...ALL_DIMS.map((dim) => [DIM_LABEL[dim], ...arms.map((a) => f1(p.arms[a][dim]))]), ['**Fit (mean)**', ...arms.map((a) => `**${f1(p.arms[a].fit)}**`)]]));
    L.push('');
  }
  L.push('## What the spec was for each learner');
  L.push('');
  L.push(table(['Learner / topic', 'Reading grade', 'Sentence cap', 'Sections x sentences', 'Checks', 'Worked : practice', 'Hints', 'Modes', 'Examples', 'Avoid'], d.raw.map((r) => {
    const sp = r.spec.summary;
    return [`${r.learner} / ${r.topic}`, sp.language.vocabularyGrade, sp.language.maxSentenceWords, `${sp.lesson.sections} x ${sp.lesson.chunkSentences}`, sp.lesson.retrievalChecks, sp.practice.workedToPractice, sp.scaffolding.hintSize, sp.explain.modes.join(', ') || 'default', sp.interests.exampleDomains.join(', ') || 'none', sp.interests.avoidDomains.join(', ') || 'none'];
  })));
  L.push('');
  L.push('## Systemic patterns');
  L.push('');
  const weakest = ALL_DIMS.map((dim) => ({ dim, spec: d.byArm.spec[dim], gen: d.byArm.generic ? d.byArm.generic[dim] : null })).filter((x) => x.spec !== null).sort((a, b) => a.spec - b.spec).slice(0, 5);
  L.push(`- Weakest dimensions for the spec arm: ${weakest.map((w) => `${DIM_LABEL[w.dim]} ${f1(w.spec)}${w.gen !== null ? ` (generic ${f1(w.gen)})` : ''}`).join('; ')}.`);
  const smallGain = ALL_DIMS.map((dim) => ({ dim, gain: d.byArm.generic ? d.byArm.spec[dim] - d.byArm.generic[dim] : null })).filter((x) => x.gain !== null).sort((a, b) => a.gain - b.gain).slice(0, 4);
  if (smallGain.length) L.push(`- Smallest gain over generic: ${smallGain.map((w) => `${DIM_LABEL[w.dim]} ${w.gain >= 0 ? '+' : ''}${f1(w.gain)}`).join('; ')}.`);
  const worstLearners = [...d.perLearner].filter((p) => p.arms.spec.fit !== null).sort((a, b) => a.arms.spec.fit - b.arms.spec.fit).slice(0, 3);
  L.push(`- Learners the spec fitted least well: ${worstLearners.map((p) => `${p.name} ${f1(p.arms.spec.fit)}`).join(', ')}.`);
  const probs = Object.entries(d.problems).sort((a, b) => b[1] - a[1]);
  L.push(`- Spec problems still open after the one revision: ${probs.length ? probs.map(([k, v]) => `${k} x${v}`).join(', ') : 'none'}.`);
  const miss = Object.entries(d.missing).sort((a, b) => b[1] - a[1]).slice(0, 8);
  L.push(`- Key facts the judge found missing: ${miss.length ? miss.map(([k, v]) => `${k}${v > 1 ? ` (x${v})` : ''}`).join('; ') : 'none reported'}.`);
  L.push('');
  if (baseline) {
    L.push('## Before and after hardening');
    L.push('');
    L.push(`Baseline run \`${baseline.tag}\` against this run \`${d.tag}\` (spec arm, mean over all lessons, 0 to 10).`);
    L.push('');
    L.push(table(['Dimension', `before (${baseline.tag})`, `after (${d.tag})`, 'change'], [...ALL_DIMS.map((dim) => [DIM_LABEL[dim], f1(baseline.byArm.spec[dim]), f1(d.byArm.spec[dim]), `${(d.byArm.spec[dim] - baseline.byArm.spec[dim]) >= 0 ? '+' : ''}${f1(d.byArm.spec[dim] - baseline.byArm.spec[dim])}`]), ['**Fit (mean)**', f1(baseline.byArm.spec.fit), f1(d.byArm.spec.fit), `${(d.byArm.spec.fit - baseline.byArm.spec.fit) >= 0 ? '+' : ''}${f1(d.byArm.spec.fit - baseline.byArm.spec.fit)}`]]));
    L.push('');
    L.push(`Generic arm for reference: before ${f1(baseline.byArm.generic && baseline.byArm.generic.fit)}, after ${f1(d.byArm.generic && d.byArm.generic.fit)}.`);
    L.push('');
  }
  L.push('## Cost');
  L.push('');
  const lb = d.ledgers.ledgerBefore; const la = d.ledgers.ledgerAfter;
  L.push(`- App-path generations: ${d.spend.calls} calls, $${d.spend.appUsd.toFixed(4)} by the pool's own accounting (free NVIDIA lineup; paid slots switched off).`);
  L.push(`- Judges: ${d.spend.judgeCalls} calls (${Object.entries(d.spend.judgeModels).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}); Standard Compute spend this run $${d.spend.scUsd.toFixed(4)} through the ledger with ceilingUsd 26.`);
  if (lb && la) L.push(`- Standard Compute ledger: before spent $${lb.spent_usd} (${lb.calls} calls, headroom $${lb.headroom_usd}); after spent $${la.spent_usd} (${la.calls} calls, headroom $${la.headroom_usd}).`);
  L.push('');
  return L.join('\n');
}

// ── the mock run's own assertions (part of npm test) ──────────────────────
function assertMock(report, learners, cells) {
  const d = report.data;
  const bad = [];
  const need = (c, m) => { if (!c) bad.push(m); };
  need(learners.length === 16, 'sixteen learners');
  need(cells.length === 32, 'thirty-two learner-topic cells');
  need(Object.values(d.topicCover).every((n) => n >= 6), `every topic is covered by several learners (${JSON.stringify(d.topicCover)})`);
  const ages = new Set(LEARNERS.map((l) => l.age));
  need([8, 11, 14, 17, 25, 60].every((a) => ages.has(a)), 'ages 8, 11, 14, 17, 25 and 60');
  need(LEARNERS.filter((l) => l.esl).length >= 2, 'second-language learners');
  need(d.cells === 32, `all 32 cells produced (${d.cells})`);
  for (const arm of ARMS) need(d.metrics[arm].n === 32, `${arm} has 32 lessons`);
  need(d.byArm.spec.fit > d.byArm.generic.fit, 'the spec arm fits better than the generic one in the mock');
  need(d.byArm.spec.avoided_domains >= 9 && d.metrics.spec.avoidViolations === 0, 'the spec arm never uses a disliked domain');
  need(d.metrics.generic.avoidViolations > 0, 'the generic arm does sometimes (the mock\'s stock example)');
  need(d.byArm.spec.coverage >= 9, `coverage holds under the spec (${d.byArm.spec.coverage})`);
  need(d.metrics.spec.keyFactsMissing <= 0.05 * d.metrics.spec.keyFacts, `under 5% of key facts are missing from the spec lessons by term overlap (${d.metrics.spec.keyFactsMissing} of ${d.metrics.spec.keyFacts}; the mock paraphrases, so this is the crude measure)`);
  const specs = new Set(d.raw.map((r) => r.spec.hash));
  need(specs.size >= 16, `the sixteen learners get sixteen different specs (${specs.size} distinct hashes across ${d.raw.length} cells)`);
  const prompts = new Set(d.raw.map((r) => r.spec.prompt));
  need(prompts.size >= 16, `and different prompts (${prompts.size})`);
  for (const r of d.raw) for (const arm of ARMS) need(r.arms[arm] && r.arms[arm].verdict && DIM_IDS.every((k) => r.arms[arm].verdict.fit[k] && r.arms[arm].verdict.fit[k].score >= 0 && r.arms[arm].verdict.fit[k].score <= 10), `${r.learner}/${r.topic}/${arm} has a full verdict`);
  const md = fs.readFileSync(OUT, 'utf8');
  need(/## Per learner/.test(md) && /## Systemic patterns/.test(md) && /## Averages/.test(md), 'the markdown has its sections');
  need((md.match(/^### /gm) || []).length >= 16, 'a table for each learner');
  if (bad.length) { console.error(`mock proof FAILED:\n- ${bad.join('\n- ')}`); process.exit(1); }
  console.log('scorecard-modification-proof --mock: all checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
