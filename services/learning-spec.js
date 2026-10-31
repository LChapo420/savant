/**
 * The learning spec: ONE description of how a particular learner should be taught,
 * computed from everything the app knows about them, and read by every generator
 * that writes, orders, tests or schedules anything for that learner.
 *
 *   const spec = learningSpec.buildSpec(userId, { skillIds, topic, trackId, gradeId });
 *   learningSpec.specToPrompt(spec, { surface: 'lesson' });   // the block a writer is given
 *
 * The founder's rule (31 Oct 2026): every metric of the scorecard, plus interests,
 * hobbies, dislikes and any other context, must shape how any material, curriculum,
 * lesson, level or test is rebuilt for the learner. It must still teach the SAME topic
 * and ideas; only how they are delivered changes, to give the best understanding and
 * retention in the least time for that learner.
 *
 * How it is computed (all of it declarative, in METRIC_RULES and CONTEXT_RULES):
 *
 *   1. Each of the 100 scorecard metrics has z = (measured - 50) / 50 in [-1, 1], from the
 *      MEASURED score (never the shown one: a model read does not steer, contract.js) and a
 *      weight c = confidence / 100. A metric the app is not sure of moves nothing.
 *   2. A rule maps a metric to one or more LEVERS: [lever, direction, weight]. A lever is a
 *      lean in [-1, 1] on one way of teaching (chunk size, pace, hint size, ...). The lean is
 *      tanh(K * sum of direction * weight * z * c), so it is monotonic in every metric (more
 *      of a metric never moves a lever against the rule's documented direction), bounded,
 *      and many weak metrics can add up while one cannot dominate.
 *   3. Context that is not on the scorecard (age, English as a second language, the topic's
 *      mastery, the learner's goal, an aversion to a subject, the device) adds to the same
 *      sums through CONTEXT_RULES, so the two never contradict each other: there is one
 *      lean per lever, not a scorecard answer and a separate context answer.
 *   4. The leans are turned into concrete fields (lesson length, sentence length, number of
 *      retrieval checks, hint size, worked-to-practice ratio, review spacing, ...) by derive().
 *   5. Interests and hobbies become example domains; dislikes become avoided domains, and an
 *      interest that is also disliked is dropped. A dislike of the SUBJECT itself (the topic
 *      cannot be avoided) becomes an aversion and moves tone, scaffolding and stakes instead.
 *
 * What it never does (the scorecard contract's promises still hold):
 *   - It never removes, adds or alters what must be covered. Every prompt block starts with the
 *     content contract and the post-generation check (checkFollowed) verifies key-fact coverage.
 *   - It never skips anything for a learner: a lean can shorten the explanation, never the objective.
 *   - It carries no learner number into model text: the prompt holds instructions, not scores.
 *   - The owner's account gets the default spec (config/owner.js ownerBase).
 *   - A learner with no scorecard and no stated context gets the default spec and an EMPTY prompt:
 *     their lessons are written exactly as before.
 *
 * Evidence ids are the mechanism numbers of curriculum-build/evidence-article/03-scorecard-adaptation.md
 * ("03-M17") and 02-retention-review.md ("02-M29"). A rule with no mechanism behind it says so
 * (ev null): it is a design choice that follows the metric's own definition in stats.js, not a finding.
 */
const crypto = require('crypto');
const { STATS } = require('./scorecard/stats');

const VERSION = 1;
const K = 1.3;               // gain on the summed pull before tanh
const SHOW_AT = 0.15;        // a lean smaller than this changes a number but writes no sentence
const MAX_PHRASES = 10;      // lever sentences in one prompt block (a longer list is followed less, 03-M9)
const DEFAULT_READING_GRADE = 9;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, n = 2) => Number(v.toFixed(n));
/** lean -1 -> lo, 0 -> d, +1 -> hi. */
const span = (lean, lo, d, hi) => (lean >= 0 ? d + (hi - d) * lean : d + (d - lo) * lean);

// ── levers ────────────────────────────────────────────────────────────────
/**
 * Every lever, with what a positive lean means. The default lean is 0 for all of them.
 * `imp` ranks the sentences when a block must be cut to MAX_PHRASES (3 = shapes the page most).
 */
const LEVERS = {
  chunk: { imp: 3, doc: '+ larger chunks, several ideas per section; - micro-steps, one idea per piece' },
  length: { imp: 3, doc: '+ a fuller lesson; - the shortest lesson that covers the topic' },
  pace: { imp: 2, doc: '+ brisk, say each thing once; - slow, give each idea room' },
  checks: { imp: 2, doc: '+ more retrieval checks; - fewer' },
  checkFreq: { imp: 2, doc: '+ a check after every small piece; - a long stretch before any check' },
  diffStart: { imp: 2, doc: '+ practice starts at or above the level; - starts below it' },
  diffRamp: { imp: 1, doc: '+ steep difficulty ramp; - very gradual' },
  scaffold: { imp: 3, doc: '+ plenty of support (prompts, partial steps); - little' },
  hintSize: { imp: 2, doc: '+ generous hints (idea and first step); - small nudges' },
  worked: { imp: 3, doc: '+ worked examples lead; - practice leads' },
  ruleFirst: { imp: 3, doc: '+ rule or principle first; - concrete cases first' },
  vocab: { imp: 3, doc: '+ advanced vocabulary; - plain everyday words' },
  sentence: { imp: 2, doc: '+ longer connected sentences; - short sentences' },
  defineTerms: { imp: 2, doc: '+ re-define terms whenever they return; - define once' },
  density: { imp: 2, doc: '+ dense prose is fine; - short paragraphs and lists' },
  interestUse: { imp: 3, doc: '+ examples built on the learner\'s interests; - neutral examples' },
  exampleCount: { imp: 2, doc: '+ several varied examples per idea; - one is enough' },
  reviewSpacing: { imp: 0, doc: '+ wider review intervals; - tighter (bounded: memory metrics never steer lessons, 03-M5)' },
  reviewIntensity: { imp: 0, doc: '+ review earlier ideas more (higher recall target, bigger review share); - less' },
  interleave: { imp: 1, doc: '+ mix earlier ideas into practice; - one idea at a time' },
  feedbackDetail: { imp: 2, doc: '+ detailed step-by-step feedback; - one line' },
  feedbackImmediacy: { imp: 1, doc: '+ feedback right after each answer; - after the set' },
  warmth: { imp: 2, doc: '+ warm and encouraging; - matter-of-fact' },
  formality: { imp: 1, doc: '+ formal register; - casual' },
  humor: { imp: 1, doc: '+ light humour; - none' },
  praise: { imp: 1, doc: '+ specific praise; - minimal' },
  gentleness: { imp: 2, doc: '+ gentle correction; - direct correction' },
  pressure: { imp: 2, doc: '+ timers and test framing are fine; - low stakes, no timers' },
  challenge: { imp: 2, doc: '+ stretch cases; - comfortable difficulty' },
  novelty: { imp: 1, doc: '+ varied formats and contexts; - predictable' },
  gamification: { imp: 1, doc: '+ game framing (score, streak); - none' },
  story: { imp: 1, doc: '+ story or scenario framing; - none' },
  sessionLen: { imp: 0, doc: '+ longer sessions; - shorter' },
  breaks: { imp: 0, doc: '+ more frequent breaks; - fewer' },
  autonomy: { imp: 1, doc: '+ offer choices; - guide step by step' },
  structure: { imp: 2, doc: '+ numbered steps and a stated next step; - open-ended tasks' },
  visual: { imp: 2, doc: '+ lay structure out spatially in plain text; - prose only' },
  dialogic: { imp: 2, doc: '+ short question-and-answer exchanges; - direct explanation' },
  elaboration: { imp: 1, doc: '+ ask for the idea in their own words; - not needed' },
  mnemonic: { imp: 1, doc: '+ a memorable hook for the key point; - none' },
  generation: { imp: 2, doc: '+ predict or produce before the reveal; - show first' },
  repetition: { imp: 1, doc: '+ restate the key point; - say it once' },
  transfer: { imp: 1, doc: '+ include a varied case in a new setting; - near variations only' },
  application: { imp: 2, doc: '+ lead with real use; - theory first' },
  conceptual: { imp: 2, doc: '+ why before how; - procedure first' },
  depth: { imp: 1, doc: '+ one deeper why or edge case; - stay broad' },
  bigPicture: { imp: 2, doc: '+ open with the big picture; - start in the details' },
  rigor: { imp: 1, doc: '+ precise, formal statements; - intuitive' },
  misconception: { imp: 2, doc: '+ name the common wrong idea, refute it, replace it; - not needed' },
  typed: { imp: 1, doc: '+ typed answers; - choices are fine' },
  reflection: { imp: 1, doc: '+ a short reflection prompt; - none' },
  social: { imp: 1, doc: '+ people and named characters in examples; - none' },
  competition: { imp: 1, doc: '+ beat-your-best framing; - cooperative or neutral' },
  identity: { imp: 1, doc: '+ link to who they say they are; - none' },
  emotion: { imp: 1, doc: '+ real human stakes; - none' },
  extrinsic: { imp: 0, doc: '+ visible milestones and rewards; - none' },
  warmup: { imp: 1, doc: '+ easy items first, a ramp-in; - start straight in' },
  recapStart: { imp: 1, doc: '+ a short recap of what came before; - none' },
  recapEnd: { imp: 2, doc: '+ end with a recap they answer from memory; - none' },
  curiosity: { imp: 1, doc: '+ open with a question or puzzle; - state the topic' },
  relevance: { imp: 2, doc: '+ say plainly why it matters early; - not needed' },
  analogy: { imp: 2, doc: '+ one clear analogy; - no analogies' },
  causal: { imp: 1, doc: '+ follow long because-chains; - one or two links' },
  systems: { imp: 1, doc: '+ show connections to related ideas; - the part alone' },
  integration: { imp: 1, doc: '+ link to earlier lessons; - stand alone' },
  creative: { imp: 1, doc: '+ an open creative extension; - defined tasks' },
  mistakes: { imp: 1, doc: '+ show a tempting wrong answer and why it fails; - avoid showing errors' },
  momentum: { imp: 1, doc: '+ the first item is an easy win; - no special first item' },
  fatigue: { imp: 0, doc: '+ hardest work early, finish easy; - even' },
  multiRep: { imp: 1, doc: '+ the same idea in two forms; - one form' },
  patternHints: { imp: 1, doc: '+ point the pattern out; - let them find it' },
  selfCheck: { imp: 1, doc: '+ rate sureness before the answer is shown; - none' },
  planning: { imp: 1, doc: '+ ask for a plan first; - dive in' },
  questionPrompts: { imp: 1, doc: '+ invite a what-if question; - none' },
  contradiction: { imp: 1, doc: '+ include an inconsistency to spot; - none' },
  contrast: { imp: 2, doc: '+ contrast look-alike ideas side by side; - treat apart' },
  instructions: { imp: 1, doc: '+ multi-part instructions are fine; - one short action each' },
  notation: { imp: 2, doc: '+ symbols and notation freely; - words first, symbols last' },
};
const LEVER_IDS = Object.keys(LEVERS);

// ── metric rules ──────────────────────────────────────────────────────────
/**
 * Every metric -> its levers. [metric, evidence, [[lever, direction, weight], ...], rule].
 * direction +1: a higher score pushes the lever up; -1: a higher score pushes it down.
 * weight: how much one unit of z * confidence moves the lean (before the gain K).
 * The text is the rule in words; scripts/learning-spec-test.js fails if a metric in stats.js
 * has no row here, if a row names an unknown lever, or if a rule does not move its lever.
 */
const R = (metric, ev, effects, rule) => ({ metric, ev, effects: effects.map(([lever, dir, w]) => ({ lever, dir, w })), rule });

const METRIC_RULES = [
  // Intake and processing
  R('intake_baseline', '03-M19', [['chunk', 1, 0.6], ['pace', 1, 0.3]], 'Takes in a lot per step: bigger chunks, brisker pace. Tiny doses: one idea per piece.'),
  R('working_memory_span', '03-M19', [['chunk', 1, 0.4], ['structure', -1, 0.35], ['scaffold', -1, 0.2]], 'Few ideas at once: small chunks, intermediate results written out, numbered steps.'),
  R('processing_velocity', '03-M19', [['pace', 1, 0.6], ['repetition', -1, 0.4], ['length', -1, 0.2]], 'Gets it first read: brisk, no restating. Slow to digest: room, one restatement.'),
  R('chunk_granularity', '03-M19', [['chunk', 1, 0.6]], 'Prefers big blocks: fuller sections. Needs micro-steps: many short sections.'),
  R('abstraction_tolerance', null, [['ruleFirst', 1, 0.6], ['application', -1, 0.1]], 'Comfortable with abstraction: principle first. Needs concrete first: a specific case before any general statement.'),
  R('example_density_need', null, [['exampleCount', 1, 0.7]], 'Needs many varied examples: two or three per idea. One is enough: one per idea.'),
  R('text_density_tolerance', null, [['density', 1, 0.7], ['chunk', 1, 0.2]], 'Loses focus in paragraphs: two or three short sentences, lists and line breaks.'),
  R('vocabulary_ceiling', null, [['vocab', 1, 0.7], ['sentence', 1, 0.3]], 'Needs plain language: everyday words, short sentences, plain definitions. Advanced: do not talk down.'),
  R('jargon_absorption', null, [['defineTerms', -1, 0.7]], 'Terms need repeating: define on first use and again briefly. Terms stick: define once.'),
  R('spatial_anchoring', null, [['visual', 1, 0.7]], 'Layouts help: a small aligned table, a step list, an indented tree, before/after pairs.'),
  // Reasoning architecture
  R('deductive_trajectory', null, [['ruleFirst', 1, 0.6]], 'Learns rule first, then cases.'),
  R('inductive_trajectory', null, [['ruleFirst', -1, 0.6]], 'Learns from cases, then the rule.'),
  R('cognitive_flexibility', null, [['multiRep', 1, 0.6]], 'Switches representations easily: show the same idea in two forms. Stuck on one: pick one form and stay with it.'),
  R('analogical_transfer', null, [['analogy', 1, 0.7]], 'Analogies unlock understanding: one clear analogy mapped back. Analogies confuse: none.'),
  R('causal_chain_depth', null, [['causal', 1, 0.7]], 'Follows long because-chains: give them in full. Short: one or two links at a time.'),
  R('systems_thinking', null, [['systems', 1, 0.7], ['integration', 1, 0.2]], 'Sees interconnections: show how the idea connects. Sees parts alone: keep the part self-contained.'),
  R('pattern_detection', null, [['patternHints', -1, 0.7]], 'Needs patterns pointed out: say the pattern. Spots them unprompted: let them find it.'),
  R('logical_rigor', null, [['rigor', 1, 0.7]], 'Wants formal precision: exact statements. Prefers intuition: explain intuitively first.'),
  R('contradiction_sensitivity', null, [['contradiction', 1, 0.5]], 'Catches inconsistencies: include one to spot. Misses them: state the contradiction when it appears.'),
  R('global_framing_need', null, [['bigPicture', 1, 0.8]], 'Needs the big picture first: where it fits and why, then details.'),
  // Pacing and cycle architecture
  R('cycle_architecture', null, [['checkFreq', -1, 0.7], ['chunk', 1, 0.2]], 'Prefers a long teach then a check: fewer interruptions. Needs short teach-then-check cycles: a check after each piece.'),
  R('attention_runway', '03-M19', [['sessionLen', 1, 0.7], ['length', 1, 0.4], ['breaks', -1, 0.5]], 'Sustains long focus: longer lesson and session. Focus drops fast: short lesson, short session, more breaks.'),
  R('warmup_latency', null, [['warmup', 1, 0.8]], 'Needs a ramp-in: easy items first. Engages instantly: start straight in.'),
  R('fatigue_curve', null, [['fatigue', 1, 0.6], ['sessionLen', -1, 0.3], ['breaks', 1, 0.5]], 'Drops sharply late: hardest work early, finish on an easy item, shorter sessions, more breaks.'),
  R('momentum_dependence', '03-M27', [['momentum', 1, 0.8], ['warmup', 1, 0.2], ['diffStart', -1, 0.3]], 'Needs quick wins: an easy first item, a lower start. (03-M27: design choice.)'),
  R('interleaving_tolerance', '03-M36', [['interleave', 1, 0.8]], 'Thrives on mixed practice: interleave earlier ideas. Needs one topic at a time: blocked practice.'),
  R('rush_tendency', '03-M29', [['structure', 1, 0.3], ['checks', 1, 0.3], ['reflection', 1, 0.2], ['pace', -1, 0.2]], 'Skims and answers too fast: numbered steps, a check that needs a read, a reflection prompt. No typed-answer switch (03 weak rule 1).'),
  R('deliberation_depth', null, [['pressure', 1, 0.3], ['pace', -1, 0.2]], 'Deliberates thoroughly: timers are fine, no hurry. Answers on instinct: add a pause prompt.'),
  R('session_rhythm', null, [['recapStart', -1, 0.4], ['sessionLen', -1, 0.2]], 'Erratic usage: open with a recap and keep sessions short enough to finish. Consistent routine: neither.'),
  R('reentry_cost', null, [['recapStart', 1, 0.9]], 'Needs a recap after any gap: open with two lines on what came before.'),
  // Stimulus envelope and engagement
  R('stimulus_envelope', null, [['novelty', 1, 0.4]], 'Wide tolerable range: more variety. Narrow band: steady intensity.'),
  R('novelty_hunger', null, [['novelty', 1, 0.8]], 'Needs constant variety: change format and context. Prefers familiar formats: keep them steady.'),
  R('humor_receptivity', null, [['humor', 1, 0.8]], 'Humour helps: a light touch. Humour distracts: none.'),
  R('narrative_pull', null, [['story', 1, 0.8]], 'Stories drive engagement: a short scenario frame. Stories are fluff: straight to content.'),
  R('gamification_response', null, [['gamification', 1, 0.8]], 'Motivated by points and streaks: game framing. Indifferent: none.'),
  R('challenge_appetite', '03-M22', [['challenge', 1, 0.7], ['diffRamp', 1, 0.4], ['diffStart', 1, 0.2]], 'Seeks hard problems: an optional harder case, steeper ramp (03-M22 softened: stretch clamp 0.25). Prefers comfortable: success likely.'),
  R('curiosity_hook', null, [['curiosity', 1, 0.8]], 'Mystery openers engage: open with a question or puzzle. They do not help: state the topic.'),
  R('interest_transfer', '03-M33', [['interestUse', 1, 0.9]], 'Interest framing helps a lot: build examples on their interests. It does not help: neutral examples.'),
  R('relevance_demand', null, [['relevance', 1, 0.8], ['application', 1, 0.3]], 'Disengages without a why: say early why it matters in real life.'),
  R('tone_formality', null, [['formality', 1, 0.9]], 'Formal and academic or casual and conversational.'),
  // Memory and retention (memory-kind metrics never gate a lesson directive, 03-M5: their pull here is small and bounded)
  R('retrieval_strength', '02-M16', [['checks', -1, 0.3], ['reviewSpacing', 1, 0.3]], 'Recalls unprompted: fewer checks, wider review. Needs cues: more checks.'),
  R('recognition_recall_gap', '02-M35', [['typed', 1, 0.7], ['generation', 1, 0.4]], 'Recognises but cannot produce: typed answers and produce-before-reveal (typed recall in review is mixed evidence, 02-M35).'),
  R('decay_rate', '02-M50', [['reviewSpacing', -1, 0.6], ['reviewIntensity', 1, 0.5]], 'Forgets fast: tighter review and a higher recall target. Retains long: wider (bounded, 03-M5).'),
  R('elaboration_benefit', null, [['elaboration', 1, 0.8]], 'Big gain from explaining in own words: ask for it.'),
  R('mnemonic_receptivity', null, [['mnemonic', 1, 0.8]], 'Mnemonics work: give a memorable hook. They do not stick: none.'),
  R('consolidation_need', '03-M34', [['recapEnd', 1, 0.8], ['reviewIntensity', 1, 0.2]], 'Needs recaps: end with a three-line recap they answer from memory.'),
  R('interference_susceptibility', null, [['contrast', 1, 0.6], ['misconception', 1, 0.4], ['interleave', -1, 0.3]], 'Confuses similar concepts: contrast look-alikes side by side and keep them apart in time.'),
  R('enactive_encoding', null, [['worked', -1, 0.4], ['generation', 1, 0.4], ['checks', 1, 0.2]], 'Learns mainly by doing: practice leads, they act before they read the answer.'),
  R('generation_effect', null, [['generation', 1, 0.7], ['typed', 1, 0.3]], 'Much better when producing: predict before each reveal.'),
  R('retention_index', '02-M50', [['reviewSpacing', 1, 0.4], ['reviewIntensity', -1, 0.3]], 'Excellent delayed recall: wider review, lower target. Poor: tighter (bounded, 03-M5).'),
  // Failure response and resilience
  R('failure_response', null, [['mistakes', 1, 0.6], ['gentleness', -1, 0.3]], 'Errors are fuel: show a tempting wrong answer and why it fails. Disengages after errors: gentler.'),
  R('error_recovery_speed', null, [['scaffold', -1, 0.3], ['hintSize', -1, 0.3], ['feedbackImmediacy', 1, 0.4]], 'Corrects immediately: smaller hints. Needs several attempts: more support, feedback right away.'),
  R('frustration_threshold', '03-M23', [['scaffold', -1, 0.4], ['challenge', 1, 0.2], ['hintSize', -1, 0.3], ['gentleness', -1, 0.3]], 'Frustrates quickly: gentler ramp, more support, bigger hints, gentler correction (03-M23).'),
  R('hint_dependency', '03-M30', [['worked', 1, 0.4], ['generation', 1, 0.3], ['hintSize', -1, 0.3]], 'Relies on hints: a worked example plus a try-first prompt, smaller hints (03-M30, softened).'),
  R('help_seeking', '03-M30', [['checkFreq', -1, 0.4], ['autonomy', 1, 0.2]], 'Struggles silently: check understanding often. Asks readily: fewer checks.'),
  R('guessing_propensity', null, [['selfCheck', 1, 0.5], ['feedbackDetail', 1, 0.2], ['checks', 1, 0.2]], 'Guesses freely: rate sureness first, explain why.'),
  R('perfectionism', null, [['pressure', -1, 0.5], ['warmth', 1, 0.3]], 'Needs everything perfect: low stakes, partial progress named as progress.'),
  R('productive_struggle', '03-M30', [['hintSize', -1, 0.6], ['scaffold', -1, 0.4], ['challenge', 1, 0.3]], 'Benefits from struggle: small hints, less support. Needs rescue early: bigger hints sooner.'),
  R('confidence_calibration', null, [['selfCheck', -1, 0.5]], 'Confidence predicts accuracy: no calibration prompts. Mismatched: ask for sureness.'),
  R('error_driven_learning', null, [['reviewIntensity', -1, 0.3], ['misconception', -1, 0.3]], 'Rarely repeats a corrected mistake: lighter review. Repeats mistakes: refute and revisit.'),
  // Metacognition and self-regulation
  R('self_monitoring', null, [['selfCheck', -1, 0.3], ['autonomy', 1, 0.3], ['reflection', -1, 0.2]], 'Accurate self-assessment: more choice, fewer prompts. Does not know what they do not know: ask for sureness.'),
  R('strategy_awareness', null, [['autonomy', 1, 0.3], ['planning', 1, 0.3]], 'Uses strategies deliberately: plan-first and choice. None: name a strategy.'),
  R('mastery_orientation', null, [['conceptual', 1, 0.4], ['depth', 1, 0.3], ['extrinsic', -1, 0.3]], 'Wants understanding: why before how, depth. Wants completion: visible milestones.'),
  R('autonomy_preference', null, [['autonomy', 1, 0.8]], 'Wants to choose: offer choices. Wants guiding: step by step.'),
  R('structure_need', null, [['structure', 1, 0.8]], 'Needs clear steps: numbered, next step stated.'),
  R('instruction_adherence', null, [['instructions', 1, 0.6]], 'Follows directions precisely: multi-part is fine. Skims: one short action each, key action first.'),
  R('reflection_depth', null, [['reflection', 1, 0.5]], 'Rich reflection: ask for it. Shallow: keep it to one sentence.'),
  R('question_generation', null, [['questionPrompts', 1, 0.7]], 'Constantly asks what-if: invite one. Never asks: pose a question for them.'),
  R('self_efficacy', '03-M31', [['momentum', -1, 0.4], ['warmth', -1, 0.3], ['scaffold', -1, 0.2], ['challenge', 1, 0.2]], 'Believes they are bad at this: an achievable first step named as achieved (03-M31). Confident: less reassurance.'),
  R('planning_tendency', null, [['planning', 1, 0.7]], 'Plans an approach first: ask for a plan. Dives in: start with a step.'),
  // Communication and representation
  R('step_explicitness', '03-M17', [['scaffold', 1, 0.4], ['structure', 1, 0.5], ['chunk', -1, 0.3], ['worked', 1, 0.2]], 'Every step must be shown: numbered, none skipped. Skipped steps are fine: compress.'),
  R('worked_example_dependence', '03-M17', [['worked', 1, 0.8]], 'Needs full worked examples: they lead. Learns from principles: practice leads (03-M17, 03-M18: never removed from an unseen objective).'),
  R('scaffolding_fade', '03-M17', [['scaffold', -1, 0.6], ['hintSize', -1, 0.3]], 'Supports can be removed quickly: little support. Slowly: keep it.'),
  R('notation_comfort', null, [['notation', 1, 0.7], ['vocab', 1, 0.1]], 'Comfortable with symbols: use them. Intimidated: words first, symbols last, read out.'),
  R('brevity_preference', '03-M19', [['length', -1, 0.8], ['feedbackDetail', -1, 0.3]], 'Wants the shortest version: cut everything not required (03-M19). Wants full detail: fuller only on new material.'),
  R('repetition_tolerance', null, [['repetition', 1, 0.7]], 'Benefits from restating: restate the key point. Bored by it: say it once.'),
  R('feedback_granularity', '02-M45', [['feedbackDetail', 1, 0.8]], 'Wants a detailed breakdown: step by step. Right or wrong is enough: one line.'),
  R('feedback_tone_sensitivity', '02-M45', [['gentleness', 1, 0.8], ['warmth', 1, 0.4]], 'Needs gentle framing: say what is right first. Handles blunt correction: direct.'),
  R('open_response_performance', null, [['typed', 1, 0.5], ['creative', 1, 0.2]], 'Strong on open-ended answers: typed and open tasks. Better on choices: choices.'),
  R('dialogic_preference', null, [['dialogic', 1, 0.8]], 'Prefers a Socratic back-and-forth: question-and-answer. Prefers being told: direct.'),
  // Motivation and affect
  R('intrinsic_motivation', null, [['extrinsic', -1, 0.4], ['relevance', -1, 0.2], ['autonomy', 1, 0.2]], 'Learns for its own sake: no reward framing. Needs outside reasons: milestones, a why.'),
  R('extrinsic_reward_sensitivity', null, [['extrinsic', 1, 0.8], ['gamification', 1, 0.3]], 'Rewards drive effort: visible milestones.'),
  R('competitive_drive', null, [['competition', 1, 0.8]], 'Motivated by beating benchmarks: beat-your-best framing.'),
  R('praise_sensitivity', null, [['praise', 1, 0.8], ['warmth', 1, 0.3]], 'Praise boosts effort: specific praise of the move. Has no effect: minimal.'),
  R('evaluation_anxiety', '02-M29', [['pressure', -1, 0.8], ['gentleness', 1, 0.4]], 'Drops when tested: no timers, no test language, low stakes (02-M29).'),
  R('boredom_susceptibility', null, [['novelty', 1, 0.6], ['pace', 1, 0.3], ['curiosity', 1, 0.3], ['length', -1, 0.3]], 'Disengages fast when bored: variety, brisk pace, a hook, short.'),
  R('persistence', '03-M25', [['length', 1, 0.3], ['momentum', -1, 0.3], ['sessionLen', 1, 0.2]], 'Pushes through: longer stretches. Quits on hard tasks: payoff early, short sections (03-M25).'),
  R('social_framing', null, [['social', 1, 0.8]], 'Characters engage: named people in examples. They do not matter: skip them.'),
  R('identity_alignment', null, [['identity', 1, 0.8]], 'Identity framing motivates: link to who they say they are.'),
  R('emotional_engagement', null, [['emotion', 1, 0.8]], 'Emotional stakes boost recall: real human stakes.'),
  // Transfer and mastery
  R('near_transfer', null, [['transfer', 1, 0.4], ['diffRamp', 1, 0.2]], 'Applies to variations easily: varied cases. Cannot: near variations first.'),
  R('far_transfer', null, [['transfer', 1, 0.5], ['integration', 1, 0.2]], 'Applies across domains: a case in a new setting. Knowledge stays in context: stay in context.'),
  R('application_orientation', null, [['application', 1, 0.8]], 'Wants practical use: lead with real use. Likes theory: theory first.'),
  R('conceptual_bias', null, [['conceptual', 1, 0.8]], 'Learns the why best: concept first. Learns the how best: procedure first.'),
  R('prior_knowledge', '03-M17', [['diffStart', 1, 0.5], ['scaffold', -1, 0.3], ['worked', -1, 0.4], ['length', -1, 0.3], ['vocab', 1, 0.2]], 'Strong background in this subject: skip the basics, start higher (03-M17, 03-M18). Little: assume nothing.'),
  R('misconception_persistence', '03-M32', [['misconception', 1, 0.8]], 'Wrong beliefs come back: state the wrong idea, refute it, replace it (03-M32).'),
  R('integration_tendency', null, [['integration', 1, 0.8]], 'Connects to past levels: link back. Treats each separately: stand-alone.'),
  R('depth_breadth', null, [['depth', 1, 0.8]], 'Wants deep dives: one deeper why. Wants an overview: stay broad.'),
  R('creative_extension', null, [['creative', 1, 0.8]], 'Loves open extensions: end with an open task. Wants defined tasks: defined.'),
  R('mastery_velocity', null, [['pace', 1, 0.3], ['diffRamp', 1, 0.5], ['reviewIntensity', -1, 0.2]], 'Improves rapidly across levels: steeper ramp. Slowly: gradual.'),
];

const RULE_OF = new Map(METRIC_RULES.map((r) => [r.metric, r]));

// ── context rules (everything that is not on the scorecard) ───────────────
/**
 * Context that moves the same levers. Each: id, what it reads, evidence, and a function
 * (ctx) -> [[lever, pull], ...] where pull is added to the lever's sum (already in lean units).
 */
const CONTEXT_RULES = [
  { id: 'age_young', ev: null, reads: 'age <= 11', rule: 'Young learners: short sentences, plain words, small chunks, warm tone, short sessions.',
    pulls: (c) => (c.age !== null && c.age <= 11 ? [['vocab', -0.5], ['sentence', -0.5], ['chunk', -0.3], ['warmth', 0.3], ['sessionLen', -0.5], ['gamification', 0.2], ['formality', -0.4], ['pace', -0.15], ['density', -0.4]] : []) },
  { id: 'age_child_under_9', ev: null, reads: 'age <= 8', rule: 'Under 9: one idea per piece, concrete first, story or play framing.',
    pulls: (c) => (c.age !== null && c.age <= 8 ? [['chunk', -0.3], ['ruleFirst', -0.4], ['story', 0.4], ['sessionLen', -0.3], ['notation', -0.4]] : []) },
  { id: 'age_adult', ev: null, reads: 'age >= 22', rule: 'Adults: no talking down, a practical why, a more formal register.',
    pulls: (c) => (c.age !== null && c.age >= 22 ? [['formality', 0.3], ['application', 0.3], ['relevance', 0.2], ['story', -0.2], ['gamification', -0.2]] : []) },
  { id: 'age_older_adult', ev: null, reads: 'age >= 55', rule: 'Older adults: unhurried pace, larger structure cues, no jargon without a definition.',
    pulls: (c) => (c.age !== null && c.age >= 55 ? [['pace', -0.2], ['defineTerms', 0.3], ['structure', 0.2], ['novelty', -0.2]] : []) },
  { id: 'esl', ev: null, reads: 'English is not their first language', rule: 'Plain syntax, no idioms, uncommon words defined, short sentences, visual support, repeat the key term.',
    pulls: (c) => (c.esl ? [['vocab', -0.6], ['sentence', -0.6], ['defineTerms', 0.6], ['visual', 0.4], ['repetition', 0.3], ['density', -0.3], ['pace', -0.2], ['multiRep', 0.3]] : []) },
  { id: 'reading_support', ev: null, reads: 'the context says they need reading support', rule: 'Short lines, short sentences, spaced layout, no dense paragraphs, plain words.',
    pulls: (c) => (c.readingSupport ? [['density', -0.6], ['sentence', -0.4], ['vocab', -0.3], ['chunk', -0.3], ['visual', 0.3], ['repetition', 0.2]] : []) },
  { id: 'device_phone', ev: null, reads: 'phone-only, short sessions', rule: 'Short sessions, small chunks, no wide tables, an easy way to stop and resume.',
    pulls: (c) => (c.device === 'phone' ? [['sessionLen', -0.5], ['chunk', -0.3], ['length', -0.3], ['recapStart', 0.3], ['visual', -0.2]] : []) },
  { id: 'device_desk', ev: null, reads: 'long desk sessions', rule: 'Longer sessions are fine; tables and diagrams in plain text are fine.',
    pulls: (c) => (c.device === 'desk' ? [['sessionLen', 0.4], ['length', 0.15], ['breaks', 0.15]] : []) },
  { id: 'topic_mastery_low', ev: '03-M17', reads: 'mastery on the topic\'s skills < 0.35 after 3+ answers', rule: 'New or weak on this topic: worked examples, support, a lower start, smaller chunks.',
    pulls: (c) => (c.mastery !== null && c.attempts >= 3 && c.mastery < 0.35 ? [['worked', 0.5], ['scaffold', 0.4], ['diffStart', -0.4], ['chunk', -0.2], ['hintSize', 0.2]] : []) },
  { id: 'topic_mastery_high', ev: '03-M17', reads: 'mastery on the topic\'s skills >= 0.75 after 5+ answers', rule: 'Already strong here: problems first, less support, higher start, shorter explanation.',
    pulls: (c) => (c.mastery !== null && c.attempts >= 5 && c.mastery >= 0.75 ? [['worked', -0.5], ['scaffold', -0.4], ['diffStart', 0.4], ['length', -0.3], ['challenge', 0.2]] : []) },
  { id: 'goal_essentials', ev: null, reads: 'goal: just the essentials, fast', rule: 'Fewest activities that still cover the objective.',
    pulls: (c) => (c.goal === 'essentials' ? [['length', -0.5], ['depth', -0.4], ['checks', -0.2], ['pace', 0.3]] : []) },
  { id: 'goal_deep', ev: null, reads: 'goal: learn it as deeply as possible', rule: 'Explain why each rule holds, include a harder or edge case.',
    pulls: (c) => (c.goal === 'deep' ? [['depth', 0.6], ['conceptual', 0.4], ['length', 0.3], ['elaboration', 0.3], ['challenge', 0.2]] : []) },
  { id: 'goal_test', ev: null, reads: 'goal: prepare for a test', rule: 'Exam-style wording, quick recall of earlier points, name the traps.',
    pulls: (c) => (c.goal === 'test' ? [['checks', 0.4], ['typed', 0.3], ['misconception', 0.4], ['interleave', 0.3], ['reviewIntensity', 0.4], ['pressure', 0.2]] : []) },
  { id: 'goal_conversation', ev: null, reads: 'goal: everyday conversation', rule: 'Frequent words and set phrases, heard and used, over rare vocabulary and terminology.',
    pulls: (c) => (c.goal === 'conversation' ? [['application', 0.5], ['vocab', -0.2], ['generation', 0.3], ['depth', -0.3]] : []) },
  { id: 'aversion_math', ev: null, reads: 'dislikes maths and the topic is numeric', rule: 'Low stakes, smaller steps, a real-life hook, warm tone, and no quantity of symbols up front.',
    pulls: (c) => (c.aversions.includes('math') && c.topicDomain === 'math' ? [['pressure', -0.5], ['scaffold', 0.3], ['warmth', 0.4], ['gentleness', 0.3], ['relevance', 0.4], ['application', 0.3], ['chunk', -0.2], ['notation', -0.3], ['challenge', -0.2]] : []) },
  { id: 'aversion_reading', ev: null, reads: 'dislikes reading', rule: 'Less text: short paragraphs, plain words, spaced layout, a picture-in-text where it helps.',
    pulls: (c) => (c.aversions.includes('reading') ? [['density', -0.5], ['sentence', -0.3], ['length', -0.3], ['visual', 0.3], ['chunk', -0.2], ['dialogic', 0.2]] : []) },
  { id: 'aversion_writing', ev: null, reads: 'dislikes writing', rule: 'Choice answers where the objective allows; keep written answers short.',
    pulls: (c) => (c.aversions.includes('writing') ? [['typed', -0.3], ['creative', -0.2], ['warmth', 0.2]] : []) },
  { id: 'aversion_tests', ev: '02-M29', reads: 'dislikes tests, quizzes or being timed', rule: 'Low stakes: no test language, no timers, gentle correction.',
    pulls: (c) => (c.aversions.includes('tests') ? [['pressure', -0.6], ['gentleness', 0.4], ['warmth', 0.2]] : []) },
  { id: 'aversion_repetition', ev: null, reads: 'dislikes repetition, busywork or slow explanation', rule: 'Say it once and keep moving: brisk, no restating, shorter.',
    pulls: (c) => (c.aversions.includes('repetition') ? [['repetition', -0.5], ['pace', 0.35], ['length', -0.2], ['challenge', 0.15]] : []) },
];

// ── subject words, for aversions and the topic's domain ───────────────────
const SUBJECT_WORDS = {
  math: /\b(math|maths|mathematics|algebra|arithmetic|geometry|calculus|equations?|fractions?|numbers?|word problems?)\b/i,
  reading: /\b(reading|read|books?|textbooks?|long texts?|long stuff|essays? reading)\b/i,
  writing: /\b(writing|essays?|handwriting|journaling)\b/i,
  science: /\b(science|biology|chemistry|physics)\b/i,
  history: /\b(history|dates)\b/i,
  grammar: /\b(grammar|spelling)\b/i,
  language: /\b(spanish|french|languages?|vocab(ulary)?)\b/i,
  // How they are taught, not what: never an example domain to avoid, always a change of delivery.
  tests: /\b(tests?|tested|testing|quiz(zes)?|timed|exams?|timers?|being graded)\b/i,
  repetition: /\b(repeat\w*|busywork|baby[- ]steps?|too slow|slow lessons?|hand[- ]holding|over[- ]?explain\w*)\b/i,
};
// Dislikes of a format or a way of teaching change the delivery. They are not example domains, so they are never "avoided".
const FORMAT_AVERSIONS = new Set(['reading', 'writing', 'grammar', 'tests', 'repetition']);
const AVERSION_NOTE = {
  math: 'They find maths off-putting: keep the first step small and the stakes low, and show a real use early.',
  reading: 'They dislike long reading: keep the text short, light and broken up, with the point in the first words of each part.',
  writing: 'They dislike writing: ask for short answers.',
  tests: 'They dislike being tested: no test language, no timers, frame every question as practice.',
  repetition: 'They dislike repetition and slow explanation: say each thing once and keep moving.',
  grammar: 'They find grammar off-putting: show it working before naming the rule.',
  science: 'They find science off-putting: start from something they can see or do.',
  history: 'They find history off-putting: start from a person and a decision, not a date.',
  language: 'They find language learning off-putting: keep it to a few useful phrases they can use today.',
};
const TOPIC_DOMAIN = [
  ['math', /\b(equation|algebra|arithmetic|fraction|decimal|number|geometry|calculus|solve|variable|math|multipl|divis|ratio|percent)\w*/i],
  ['language', /\b(spanish|french|greeting|vocabular|grammar|conjugat|translat|hola|verb)\w*/i],
  ['science', /\b(photosynthesis|cell|biology|chemistry|physics|energy|atom|ecosystem|gravity|science)\w*/i],
  ['history', /\b(war|history|revolution|empire|treaty|causes of|century|ancient|civilization)\w*/i],
];

/** 'math' | 'language' | 'science' | 'history' | 'other' from the topic text and track. */
function topicDomainOf(topic, trackId) {
  const text = `${topic || ''} ${trackId || ''}`;
  for (const [d, re] of TOPIC_DOMAIN) if (re.test(text)) return d;
  if (/^(math|iq)$/i.test(String(trackId || ''))) return 'math';
  if (/^spanish$/i.test(String(trackId || ''))) return 'language';
  return 'other';
}

// ── interests and dislikes from what the learner said ─────────────────────
const STOP_WORDS = new Set(['and', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'with', 'my', 'i', 'like', 'love', 'really', 'also', 'playing', 'watching', 'doing', 'stuff', 'things', 'lots', 'all', 'some', 'many', 'much', 'about', 'etc', 'or']);
const DISLIKE_RE = /\b(?:i\s+)?(?:really\s+)?(?:hate|hates|dislike|dislikes|can'?t stand|cannot stand|am bored by|get bored (?:by|with)|not a fan of|don'?t like|do not like|never liked|never enjoyed|detest|despise|avoid|dread|scared of|afraid of|nervous about)\s+([^.;\n!?]{2,60})/gi;

function cleanPhrase(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9' &/+-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(?:to |being |the |a |an |my )+/, '').replace(/( and| or| but| because)$/, '').trim();
}

/** Short domain phrases from a free-text list ("soccer, minecraft and drawing"). */
function splitDomains(text) {
  const out = [];
  for (const part of String(text || '').split(/[,;\n/]|\band\b|\bplus\b|&/i)) {
    const p = cleanPhrase(part).split(' ').filter((w) => !STOP_WORDS.has(w)).slice(0, 4).join(' ').trim();
    if (p.length >= 3 && p.length <= 40 && !out.includes(p)) out.push(p);
  }
  return out;
}

function dislikesFromText(text) {
  const out = [];
  let m;
  const re = new RegExp(DISLIKE_RE.source, DISLIKE_RE.flags);
  while ((m = re.exec(String(text || '')))) {
    for (const d of splitDomains(m[1])) if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** Singular-ish key so "math" matches "maths" and "puzzles" matches "puzzle". */
const keyOf = (w) => w.replace(/(ing|es|s)$/, '');
const wordsOf = (p) => cleanPhrase(p).split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w)).map(keyOf);

/** Do two domain phrases share a content word? */
function overlaps(a, b) {
  const wa = new Set(wordsOf(a));
  return wordsOf(b).some((w) => wa.has(w));
}

/** Subject aversions among the dislikes ('math', 'reading', ...), and the dislikes that are plain example domains. */
function splitDislikes(dislikes) {
  const aversions = [];
  const domains = [];
  for (const d of dislikes) {
    let format = false;
    for (const [subject, re] of Object.entries(SUBJECT_WORDS)) {
      if (re.test(d)) { if (!aversions.includes(subject)) aversions.push(subject); if (FORMAT_AVERSIONS.has(subject)) format = true; }
    }
    if (!format) domains.push(d);
  }
  return { aversions, domains };
}

// ── gathering the inputs for one learner ──────────────────────────────────
/**
 * Everything buildSpecFrom needs, read from the app's records. Pure data out; no model call.
 * Anything missing is a neutral value, so a brand-new learner reads as the default.
 */
function gather(userId, { skillIds = [], topic = null, trackId = null, gradeId = null, context = null } = {}) {
  const input = {
    metrics: {}, interests: [], dislikes: [], age: null, esl: false, readingSupport: false, device: null,
    mastery: null, attempts: 0, goal: null, topic, trackId, owner: false, hasScorecard: false,
  };
  if (!userId) return input;
  /* eslint-disable global-require */
  const db = require('../config/db');
  try { if (require('../config/owner').ownerBase(userId)) { input.owner = true; return input; } } catch { /* ordinary learner */ }
  try {
    const card = db.findOne('scorecards', (r) => r.user_id === userId);
    if (card) {
      const scorecard = require('./scorecard');
      input.hasScorecard = true;
      for (const s of STATS) {
        const r = scorecard.read(card, s.id, { trackId });
        input.metrics[s.id] = { measured: r.measured, confidence: r.confidence };
      }
    }
  } catch { /* neutral */ }
  try {
    const user = db.byId('users', userId);
    const learner = require('./learner');
    const profile = learner.getProfile(userId);
    const survey = profile.survey || {};
    const ym = user && user.age_check && /^(\d{4})-(\d{2})$/.exec(String(user.age_check.birth_ym || ''));
    if (ym) {
      const d = new Date();
      const y = d.getUTCFullYear() - Number(ym[1]);
      input.age = d.getUTCMonth() + 1 <= Number(ym[2]) ? y - 1 : y;
    }
    const said = ['interests', 'hobbies', 'sports'].map((k) => survey[k]).filter(Boolean).join(', ');
    input.interests.push(...splitDomains(said));
    input.dislikes.push(...dislikesFromText(`${survey.notes || ''}. ${survey.dislikes || ''}`), ...splitDomains(survey.dislikes));
    const lc = profile.learning_context || {};
    if (/\b(english is (?:not|my second)|second language|esl|ell)\b/i.test(`${survey.notes || ''}`)) input.esl = true;
    if (lc.esl) input.esl = true;
    if (lc.reading_support) input.readingSupport = true;
    if (lc.device) input.device = lc.device;
  } catch { /* neutral */ }
  try {
    for (const f of require('./tutor-facts').list(userId)) if (f.kind === 'interest') input.interests.push(...splitDomains(f.text));
  } catch { /* no facts */ }
  try {
    const rec = db.findOne('learner_records', (r) => r.user_id === userId);
    for (const f of (rec && rec.facts) || []) {
      if (f.status === 'superseded') continue;
      if (f.kind === 'dislike') input.dislikes.push(...splitDomains(f.text));
      if (f.kind === 'interest' && f.status === 'solid') input.interests.push(...splitDomains(f.text));
    }
  } catch { /* no record */ }
  try {
    if (trackId) {
      const goal = require('./goals').forGrade(userId, trackId, gradeId);
      if (goal) input.goal = goal.choice;
    }
  } catch { /* no goal */ }
  try {
    const ids = (skillIds || []).filter(Boolean).slice(0, 8);
    if (ids.length) {
      const mastery = require('./mastery');
      const states = ids.map((id) => mastery.stateFor(userId, id));
      const att = states.reduce((n, s) => n + (s.attempts || 0), 0);
      input.attempts = att;
      input.mastery = att > 0 ? states.reduce((n, s) => n + s.mastery, 0) / states.length : null;
    }
  } catch { /* no mastery */ }
  /* eslint-enable global-require */
  if (context && typeof context === 'object') Object.assign(input, context);
  return input;
}

// ── the pure computation ──────────────────────────────────────────────────
function baseReadingGrade(age) {
  if (age === null || age === undefined) return DEFAULT_READING_GRADE;
  return clamp(Math.round(age - 5), 1, 12);
}
function baseSentenceWords(grade) {
  if (grade <= 2) return 10;
  if (grade <= 5) return 13;
  if (grade <= 8) return 17;
  return 21;
}
function baseSessionMinutes(age) {
  if (age === null || age === undefined) return 20;
  if (age <= 8) return 10;
  if (age <= 11) return 15;
  if (age <= 14) return 20;
  return 25;
}

function tidyList(list, max) {
  const seen = [];
  for (const x of list) if (x && !seen.some((y) => y === x || overlaps(y, x))) seen.push(x);
  return seen.slice(0, max);
}

/** The context object the CONTEXT_RULES read, from gathered input. */
function contextOf(input) {
  const dislikes = tidyList((input.dislikes || []).map(cleanPhrase), 8);
  const { aversions } = splitDislikes(dislikes);
  const topicDomain = topicDomainOf(input.topic, input.trackId);
  return {
    age: Number.isFinite(input.age) ? input.age : null,
    esl: !!input.esl,
    readingSupport: !!input.readingSupport,
    device: input.device || null,
    mastery: Number.isFinite(input.mastery) ? input.mastery : null,
    attempts: Number(input.attempts) || 0,
    goal: input.goal || null,
    aversions,
    topicDomain,
    dislikes,
  };
}

/**
 * The raw pull on each lever before the gain: { lever: sum }, with who contributed.
 * Exposed for the tests and the audit; buildSpecFrom is what everything else calls.
 */
function pulls(input) {
  const sums = Object.fromEntries(LEVER_IDS.map((l) => [l, 0]));
  const who = Object.fromEntries(LEVER_IDS.map((l) => [l, []]));
  for (const rule of METRIC_RULES) {
    const m = (input.metrics || {})[rule.metric];
    if (!m) continue;
    const meas = m.measured === null || m.measured === undefined || !Number.isFinite(Number(m.measured)) ? 50 : Number(m.measured);
    const z = clamp((meas - 50) / 50, -1, 1);
    const c = clamp((Number(m.confidence) || 0) / 100, 0, 1);
    if (!z || !c) continue;
    for (const e of rule.effects) {
      const v = e.dir * e.w * z * c;
      if (!v) continue;
      sums[e.lever] += v;
      who[e.lever].push({ source: rule.metric, pull: round(v, 3) });
    }
  }
  const ctx = contextOf(input);
  for (const cr of CONTEXT_RULES) {
    for (const [lever, pull] of cr.pulls(ctx)) {
      sums[lever] += pull;
      who[lever].push({ source: `context:${cr.id}`, pull: round(pull, 3) });
    }
  }
  return { sums, who, ctx };
}

const WORKED_DEFAULT = 0.5; // worked examples per practice item at the default

/** Concrete fields from the leans. Every number is bounded; every field has a default at lean 0. */
function derive(L, ctx, input, interestsUsed, avoid) {
  const grade = baseReadingGrade(ctx.age);
  const vocabGrade = Math.round(clamp(grade + 3 * L.vocab, 2, 15));
  const sentenceWords = Math.round(clamp(baseSentenceWords(grade) + 5 * L.sentence, 7, 30));
  const interestShare = interestsUsed.length ? round(span(L.interestUse, 0.1, 0.5, 0.9)) : 0;
  const sessionMin = Math.round(clamp(baseSessionMinutes(ctx.age) * span(L.sessionLen, 0.5, 1, 1.6) * (ctx.device === 'phone' ? 0.6 : 1), 5, 45));
  const breakEvery = Math.round(clamp(span(-L.breaks, 6, 15, 30) * (sessionMin / 20), 4, 30));
  const spacing = round(span(L.reviewSpacing, 0.6, 1, 1.25));
  const modeScore = {
    'concrete-first': -L.ruleFirst + 0.3 * L.application,
    'rule-first': L.ruleFirst,
    'worked-examples': L.worked + 0.2 * L.exampleCount,
    'analogy': L.analogy + 0.3 * L.mnemonic,
    'visual-spatial': L.visual + 0.3 * L.multiRep,
    'step-by-step': L.structure + 0.3 * L.scaffold,
    'story': L.story + 0.3 * L.emotion,
    'dialogue': L.dialogic + 0.3 * L.generation,
    'why-first': L.conceptual + 0.3 * L.causal,
    'big-picture': L.bigPicture + 0.3 * L.systems,
    'compact': -L.length + 0.3 * -L.density,
  };
  const modes = Object.entries(modeScore).filter(([, v]) => v >= SHOW_AT).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 4);
  const checkBase = 3;
  const retrievalChecks = Math.round(clamp(checkBase + 2 * L.checks + 1.2 * L.checkFreq - 1 * (L.length < -0.5 ? 1 : 0), 1, 7));
  const stretch = round(clamp(span(L.challenge, 0.05, 0.12, 0.25), 0.05, 0.25));
  // Stretch and support together never take more than half the items: most of the practice is at the level.
  const support = round(clamp(Math.min(span(L.scaffold, 0.05, 0.15, 0.35) + (L.challenge < -SHOW_AT ? 0.05 : 0), 0.5 - stretch), 0, 0.35));
  const hintLevel = L.hintSize >= 0.4 ? 3 : L.hintSize <= -0.4 ? 1 : 2;
  const sectionCount = Math.round(clamp(3 + 1.5 * -L.chunk + 0.8 * L.length, 2, 6));
  return {
    isDefault: false,
    learner: { readingGrade: grade, ageBand: ctx.age === null ? 'unknown' : ctx.age <= 8 ? '6-8' : ctx.age <= 11 ? '9-11' : ctx.age <= 14 ? '12-14' : ctx.age <= 17 ? '15-17' : ctx.age <= 54 ? 'adult' : 'older-adult', esl: ctx.esl },
    lesson: {
      minutes: Math.round(clamp(span(L.length, 4, 8, 14) * span(L.pace, 1.15, 1, 0.85) * (ctx.device === 'phone' ? 0.8 : 1), 3, 18)),
      sections: sectionCount,
      chunkSentences: Math.round(clamp(span(L.chunk, 2, 4, 7) + (ctx.age !== null && ctx.age <= 8 ? -1 : 0), 2, 8)),
      mistakes: L.length <= -0.4 ? 1 : L.length < 0.3 ? 2 : (L.misconception >= 0.5 ? 4 : 3),
      quickCheckEverySection: L.checkFreq >= 0.4,
      quickCheckEvery: L.checkFreq >= 0.4 ? 1 : L.checkFreq >= SHOW_AT ? 2 : 0,
      // About what the learner reads in the lesson's time (not counting the check questions): a target, checked at one and a half times.
      // A ceiling, not a target: the words the learner has time to read (never more than a page, 1000), so a short lesson that teaches
      // everything is never faulted for being short.
      wordBudget: Math.min(1000, Math.round(clamp(span(L.length, 4, 8, 14) * span(L.pace, 1.15, 1, 0.85) * (ctx.device === 'phone' ? 0.8 : 1), 3, 18) * (ctx.age !== null && ctx.age <= 11 ? 70 : 110) / 10) * 10),
      newIdeasPerChunk: L.chunk >= 0.4 ? 3 : L.chunk <= -0.3 ? 1 : 2,
      maxNewTerms: Math.round(clamp(span(-L.defineTerms * 0.5 + L.chunk * 0.5, 1, 3, 5), 1, 5)),
      pace: L.pace >= 0.3 ? 'brisk' : L.pace <= -0.3 ? 'slow' : 'steady',
      restate: L.repetition >= 0.3 ? 1 : 0,
      retrievalChecks,
      checkEveryChunks: L.checkFreq >= 0.4 ? 1 : L.checkFreq <= -0.4 ? 3 : 2,
      warmupItems: Math.round(clamp(1 + 2 * L.warmup + 1 * L.momentum, 0, 3)),
      recapAtStart: L.recapStart >= 0.3,
      recapAtEnd: L.recapEnd >= 0.3,
      hook: L.curiosity >= 0.3 ? 'question' : L.story >= 0.4 ? 'scenario' : 'none',
      storyFrame: L.story >= 0.4,
      whyItMatters: L.relevance >= 0.3 || L.application >= 0.5,
      bigPictureFirst: L.bigPicture >= 0.3,
    },
    difficulty: {
      startOffset: round(clamp(1.0 * L.diffStart, -1.5, 1.0)),
      ramp: round(span(L.diffRamp, 0.05, 0.2, 0.4)),
      rampLabel: L.diffRamp >= 0.3 ? 'steep' : L.diffRamp <= -0.3 ? 'gradual' : 'steady',
      stretchShare: stretch,
      supportShare: support,
    },
    scaffolding: {
      level: round(clamp(0.5 + 0.5 * L.scaffold, 0, 1)),
      hintLevel,
      hintSize: ['nudge', 'partial', 'step'][hintLevel - 1],
      hintInChecks: L.scaffold >= 0.3 || L.hintSize >= 0.4,
      hintsBeforeReveal: Math.round(clamp(span(-L.hintSize, 1, 2, 4), 1, 4)),
      fade: L.scaffold <= -0.3 ? 'fast' : L.scaffold >= 0.3 ? 'slow' : 'steady',
    },
    practice: {
      workedToPractice: round(WORKED_DEFAULT * (4 ** clamp(L.worked, -1, 1))),
      workedExamples: Math.round(clamp(1 + 1.2 * L.worked + 0.8 * L.exampleCount, 1, 4)),
      // "Try it" items inside the lesson (a question, then its answer): the worked-to-practice ratio as counts the page can show.
      tryItems: Math.round(clamp(Math.round(clamp(1 + 1.2 * L.worked + 0.8 * L.exampleCount, 1, 4)) / (WORKED_DEFAULT * (4 ** clamp(L.worked, -1, 1))), 0, 3)),
      examplesPerIdea: Math.round(clamp(span(L.exampleCount, 1, 2, 3), 1, 3)),
      typedAnswers: round(clamp(0.5 + 0.5 * L.typed, 0, 1)),
      predictBeforeReveal: L.generation >= 0.3,
      selfExplain: L.elaboration >= 0.3,
      mistakeShown: L.mistakes >= 0.3,
      ratePrompt: L.selfCheck >= 0.3,
    },
    explain: {
      modes,
      order: L.ruleFirst >= 0.3 ? 'rule-first' : L.ruleFirst <= -0.3 ? 'cases-first' : 'balanced',
      analogy: L.analogy >= 0.3 ? 'prefer' : L.analogy <= -0.4 ? 'avoid' : 'ok',
      visual: L.visual >= 0.3,
      textDensity: L.density >= 0.3 ? 'dense' : L.density <= -0.3 ? 'sparse' : 'normal',
      paragraphSentences: Math.round(clamp(span(L.density, 2, 3, 6), 2, 6)),
      rigor: L.rigor >= 0.4 ? 'formal' : L.rigor <= -0.4 ? 'intuitive' : 'balanced',
      conceptFirst: L.conceptual >= 0.3 ? 'why-first' : L.conceptual <= -0.3 ? 'how-first' : 'balanced',
      misconception: L.misconception >= 0.3,
      contrastLookalikes: L.contrast >= 0.3,
      numberedSteps: L.structure >= 0.3,
      patternPointedOut: L.patternHints >= 0.3,
      notation: L.notation >= 0.3 ? 'symbols' : L.notation <= -0.3 ? 'words-first' : 'balanced',
    },
    language: {
      vocabularyGrade: vocabGrade,
      maxSentenceWords: sentenceWords,
      defineTerms: L.defineTerms >= 0.3 ? 'every-use' : L.defineTerms <= -0.3 ? 'once' : 'first-use',
      plainLanguage: vocabGrade <= grade - 1 || ctx.esl,
      avoidIdioms: ctx.esl || (ctx.age !== null && ctx.age <= 8),
      eslSupport: ctx.esl,
    },
    interests: {
      exampleDomains: interestsUsed.slice(0, 5),
      avoidDomains: avoid,
      share: interestShare,
      people: L.social >= 0.3,
      identity: L.identity >= 0.3,
    },
    review: {
      spacingScale: spacing,
      targetRecall: round(clamp(0.9 + 0.05 * L.reviewIntensity, 0.85, 0.95)),
      reviewShare: round(clamp(0.3 + 0.1 * L.reviewIntensity, 0.2, 0.4)),
      interleaving: round(clamp(0.3 + 0.3 * L.interleave, 0, 0.6)),
      firstReviewDays: spacing < 0.85 ? 1 : 2,
      typedRecall: L.typed >= 0.3,
    },
    feedback: {
      granularity: L.feedbackDetail >= 0.3 ? 'detailed' : L.feedbackDetail <= -0.3 ? 'brief' : 'standard',
      timing: L.feedbackImmediacy >= -0.3 ? 'immediate' : 'after-set',
      nameTheError: L.feedbackDetail >= 0 || L.misconception >= 0.3,
      tone: {
        warmth: round(clamp(0.5 + 0.5 * L.warmth, 0, 1)),
        formality: round(clamp(0.4 + 0.6 * L.formality, 0, 1)),
        humor: L.humor >= 0.3 ? 'light' : 'none',
        praise: L.praise >= 0.3 ? 'specific' : L.praise <= -0.3 ? 'minimal' : 'normal',
        correction: L.gentleness >= 0.3 ? 'gentle' : L.gentleness <= -0.3 ? 'direct' : 'normal',
      },
      lowStakes: L.pressure <= -0.3,
      timers: L.pressure <= -0.3 ? 'none' : L.pressure >= 0.4 ? 'ok' : 'optional',
    },
    session: {
      minutes: sessionMin,
      breakEveryMinutes: breakEvery,
      breakMinutes: breakEvery <= 10 ? 2 : 3,
      items: Math.round(clamp(8 * (sessionMin / 20), 4, 16)),
      hardestFirst: L.fatigue >= 0.3,
    },
    engagement: {
      challenge: round(clamp(0.5 + 0.5 * L.challenge, 0, 1)),
      novelty: round(clamp(0.5 + 0.5 * L.novelty, 0, 1)),
      gamification: L.gamification >= 0.3,
      competition: L.competition >= 0.3,
      milestones: L.extrinsic >= 0.3,
      choices: L.autonomy >= 0.3,
      emotionalStakes: L.emotion >= 0.3,
      dialogue: L.dialogic >= 0.3,
    },
    transfer: {
      variedCases: L.transfer >= 0.3,
      application: round(clamp(0.5 + 0.5 * L.application, 0, 1)),
      depth: L.depth >= 0.3 ? 'deep' : L.depth <= -0.3 ? 'broad' : 'balanced',
      creativeExtension: L.creative >= 0.3,
      linkEarlier: L.integration >= 0.3,
      connections: L.systems >= 0.3,
    },
    meta: {
      reflection: L.reflection >= 0.3,
      plan: L.planning >= 0.3,
      questionPrompt: L.questionPrompts >= 0.3,
      spotTheInconsistency: L.contradiction >= 0.3,
      oneShortAction: L.instructions <= -0.3,
    },
  };
}

function defaultSpec() {
  const spec = buildSpecFrom({ metrics: {} });
  return spec;
}

/**
 * The spec from gathered input (see gather). Pure, deterministic and fast (no I/O):
 * the same input is always the same spec.
 */
function buildSpecFrom(input) {
  const inp = input || { metrics: {} };
  const { sums, who, ctx } = pulls(inp);
  const L = {};
  for (const l of LEVER_IDS) L[l] = round(Math.tanh(K * sums[l]), 4);
  // Interests: used, minus anything disliked; dislikes: avoided, minus the subject itself.
  const dislikes = ctx.dislikes;
  const interestsAll = tidyList((inp.interests || []).map(cleanPhrase), 12);
  const interestsUsed = interestsAll.filter((i) => !dislikes.some((d) => overlaps(i, d)));
  const subjectOf = (d) => Object.entries(SUBJECT_WORDS).find(([, re]) => re.test(d));
  // A disliked subject that IS the topic cannot be avoided: it becomes an aversion (tone), not an avoided domain.
  const avoid = splitDislikes(dislikes).domains.filter((d) => {
    const s = subjectOf(d);
    return !(s && s[0] === ctx.topicDomain);
  }).slice(0, 8);
  const spec = derive(L, ctx, inp, interestsUsed, avoid);
  const moved = LEVER_IDS.some((l) => Math.abs(L[l]) >= 0.02);
  spec.isDefault = !moved && !interestsUsed.length && !avoid.length;
  spec.version = VERSION;
  spec.levers = L;
  spec.aversions = ctx.aversions;
  // A disliked subject only matters as an aversion when it is what is being taught; a disliked format or way of teaching always does.
  spec.aversionNotes = ctx.aversions.filter((a) => FORMAT_AVERSIONS.has(a) || a === ctx.topicDomain).map((a) => AVERSION_NOTE[a]).filter(Boolean);
  spec.ownerBase = !!inp.owner;
  spec.provenance = Object.fromEntries(LEVER_IDS.filter((l) => who[l].length).map((l) => [l, who[l].sort((a, b) => Math.abs(b.pull) - Math.abs(a.pull)).slice(0, 4)]));
  return spec;
}

/**
 * The spec for one learner: gather, then compute. `skillIds` and `topic` say what is being taught
 * (the topic's mastery and subject matter), `trackId`/`gradeId` find the learner's goal.
 * `context` overrides gathered values ({ age, esl, device, interests, dislikes, ... }) for tests and tools.
 * Never throws: any failure is the default spec.
 */
function buildSpec(userId, opts = {}) {
  try {
    return buildSpecFrom(gather(userId, opts));
  } catch (err) {
    const spec = defaultSpec();
    spec.error = String(err && err.message ? err.message : err).slice(0, 120);
    return spec;
  }
}

// ── the prompt ────────────────────────────────────────────────────────────
const PHRASES = {
  chunk: ['Break the material into many short pieces, each carrying exactly one new idea and ending on a one-line takeaway.', 'Use fuller sections that keep a whole idea together instead of chopping it into fragments.'],
  length: ['Keep the whole lesson short: the key idea, one example, then practice. Cut everything that is not required.', 'A fuller lesson is fine: give the reasoning behind each step.'],
  pace: ['Go slowly: give each idea room, and do not stack explanations back to back.', 'Move briskly: say each thing once, clearly, and move on.'],
  checks: ['Keep the checks few and light.', 'Add extra quick retrieval checks (one question each) through the lesson, not only at the end.'],
  checkFreq: ['Teach a full stretch before any check; do not interrupt with checks.', null],
  diffStart: ['Start the practice a step below the level so the first answers are easy wins.', 'Start the practice at the level, not below it.'],
  diffRamp: ['Raise the difficulty very gradually; stay at each step until it is comfortable.', 'Raise the difficulty steadily across the practice.'],
  scaffold: ['Give little support: no hints in the check questions; let them work it out and check the result.', 'Give plenty of support: partly completed steps in the examples, and a hint in every check question.'],
  hintSize: ['Make hints small: a nudge or a question, never the step itself.', 'Make hints generous: name the idea and show the first step.'],
  worked: ['Lead with practice; show a worked step only after an attempt.', 'Lead with fully worked examples, every step shown and explained; practice comes after.'],
  ruleFirst: ['Start from concrete cases and let the rule emerge before you name it.', 'State the rule or principle first, then apply it to cases.'],
  vocab: ['Use plain everyday words and short sentences; give any word they may not know a plain definition at first use.', 'Advanced vocabulary is fine; do not talk down.'],
  sentence: ['Use short sentences, one idea each.', 'Longer connected sentences are fine.'],
  defineTerms: ['Define each technical term once and then use it freely.', 'Define each technical term when it first appears and briefly again when it returns.'],
  density: ['Keep paragraphs to two or three short sentences; use short lists and line breaks.', 'Full paragraphs of connected prose are fine.'],
  interestUse: ['Use neutral examples, not the learner\'s interests.', 'Build the examples and practice around the learner\'s interests.'],
  exampleCount: ['One well-chosen example per idea is enough.', 'Give two or three varied examples per idea, different on the surface so the shared structure shows.'],
  interleave: ['Keep practice on this one idea; do not mix in other topics.', 'Mix in one retrieval question from an earlier idea.'],
  feedbackDetail: ['Feedback is one line: right or wrong, and the single fix.', 'After each answer explain why it is right or wrong, step by step.'],
  feedbackImmediacy: ['Let them finish a set before any feedback.', 'Give feedback right after each answer.'],
  warmth: ['Be matter-of-fact and brief; no cheerleading.', 'Be warm and encouraging.'],
  formality: ['Use a casual, conversational voice.', 'Use a formal, academic register.'],
  humor: ['No jokes.', 'A light touch of humour is welcome.'],
  praise: ['Keep praise minimal.', 'Name what they did well, specifically, not just "good job".'],
  gentleness: ['Direct correction is fine.', 'Correct gently: say what is right first and never call an answer plainly wrong.'],
  pressure: ['No timers, no countdowns, no "test" language: frame all practice as low stakes.', 'Timed practice is fine.'],
  challenge: ['Keep the difficulty comfortable and make success likely.', 'End with one optional harder case.'],
  novelty: ['Keep formats consistent and predictable.', 'Vary the format and the context from one item to the next.'],
  gamification: ['No game elements.', 'Use light game framing: a level, a streak, a small score to beat.'],
  story: ['No story frame; go straight to the content.', 'Frame the lesson as a short story or scenario the idea resolves.'],
  autonomy: ['Lead them step by step; no open choices.', 'Offer a choice in how to practise.'],
  structure: ['Open-ended tasks are fine.', 'Number the steps and say what comes next at every step.'],
  visual: ['Prose only; skip tables.', 'Lay structure out spatially in plain text: a small aligned table, a step list, an indented tree, a before/after pair.'],
  dialogic: ['Explain directly; do not quiz mid-explanation.', 'Write it as short question-and-answer exchanges, each followed by a quick self-check.'],
  elaboration: [null, 'Ask them to explain the idea in their own words at least once.'],
  mnemonic: [null, 'Give a memorable hook (a mnemonic or a vivid image) for the key point.'],
  generation: ['Show the answer, then let them apply it.', 'Before each step of the worked example, ask them to predict it.'],
  repetition: ['Say each thing once.', 'Restate the key point once in different words.'],
  transfer: ['Stay with near variations of the same case.', 'Include one varied case in a new setting.'],
  application: ['Theory first; keep applications brief.', 'Lead with a real use of the idea, then the idea.'],
  conceptual: ['Give the procedure first and explain why briefly after.', 'Explain why it works before showing how.'],
  depth: ['Stay broad: cover the main points and skip deep dives.', 'Add one deeper "why" or edge case.'],
  bigPicture: ['Start directly in the details.', 'Open with the big picture (where this fits and why it matters), then the details.'],
  rigor: ['Explain intuitively first; formal statements after.', 'Be precise: exact definitions and exact statements.'],
  misconception: [null, 'Name the common wrong idea, say exactly why it fails, then give the right one.'],
  typed: ['Multiple choice answers are fine.', 'Have them type answers rather than pick from choices.'],
  reflection: [null, 'End with one short reflection prompt: what was the key idea?'],
  social: ['Skip named characters.', 'Use named people in the examples.'],
  competition: [null, 'Frame practice as beating their own best.'],
  identity: [null, 'Link the idea to who they say they are or want to become.'],
  emotion: [null, 'Give the idea real human stakes: why it matters to a person.'],
  extrinsic: [null, 'Mark progress with visible milestones.'],
  warmup: ['Start straight in with the real work.', 'Open with two or three easy items before the real work.'],
  recapStart: [null, 'Open with a two-line orientation before any new idea: what this lesson is about and where it fits.'],
  recapEnd: [null, 'End with a three-line recap they answer from memory.'],
  curiosity: ['State the topic plainly; skip the mystery opener.', 'Open with a question or puzzle that the lesson then answers.'],
  relevance: [null, 'Say plainly and early why this matters in real life.'],
  analogy: ['No analogies or metaphors; explain the thing itself.', 'Use one clear analogy and map it back to the idea explicitly.'],
  causal: ['Keep each cause-and-effect link to one or two steps.', 'Follow the because-chains in full.'],
  systems: ['Keep the idea self-contained.', 'Show how this connects to related ideas.'],
  integration: ['Keep the lesson stand-alone.', 'Link back to something they have already learned.'],
  creative: ['Keep tasks defined, with a clear right answer.', 'End with an open task that lets them make or invent something with the idea.'],
  mistakes: ['Do not dwell on wrong answers.', 'Show one tempting wrong answer and exactly why it fails.'],
  momentum: [null, 'Make the first item an easy win.'],
  fatigue: [null, 'Put the hardest work early and finish on an easy item.'],
  multiRep: ['Pick one way of showing the idea and stay with it.', 'Show the same idea in two forms (words, a picture in text, symbols).'],
  patternHints: ['Let them spot the pattern themselves.', 'Point the pattern out explicitly.'],
  selfCheck: ['Skip sureness ratings.', 'Ask them to say how sure they are before the answer is shown.'],
  planning: [null, 'Ask them to say their plan before they start.'],
  questionPrompts: [null, 'Invite one "what if" question.'],
  contradiction: [null, 'Include one task that asks them to spot what is inconsistent.'],
  contrast: [null, 'Contrast the look-alike ideas side by side so the difference is the point.'],
  instructions: ['Give instructions as one short action each, key action first.', null],
  notation: ['Keep to words; introduce a symbol only at the end, read out in words.', 'Use symbols and notation freely.'],
};

// What each surface may carry. A surface not listed gets everything.
const MATERIAL_BLOCKED = new Set(['interestUse', 'application', 'story', 'social', 'identity', 'emotion', 'creative', 'curiosity', 'systems', 'integration', 'relevance', 'analogy', 'competition', 'gamification', 'extrinsic', 'transfer', 'depth']);
const SURFACES = {
  lesson: null,
  level: null,
  material: (l) => !MATERIAL_BLOCKED.has(l),
  notes: (l) => ['chunk', 'length', 'density', 'vocab', 'sentence', 'defineTerms', 'visual', 'structure', 'recapEnd', 'rigor', 'formality'].includes(l),
  podcast: (l) => !MATERIAL_BLOCKED.has(l) && !['visual', 'structure', 'typed', 'density', 'notation'].includes(l),
  test: (l) => ['pressure', 'gentleness', 'diffStart', 'diffRamp', 'challenge', 'feedbackDetail', 'feedbackImmediacy', 'typed', 'vocab', 'sentence', 'instructions', 'warmth', 'momentum', 'warmup', 'misconception', 'selfCheck'].includes(l),
  tutor: (l) => !['sessionLen', 'breaks', 'length', 'checks', 'recapStart', 'recapEnd', 'warmup', 'fatigue', 'extrinsic', 'gamification'].includes(l),
};

/** How the check questions are ordered, from the spec's difficulty start and ramp. */
function checkOrder(spec) {
  const d = spec.difficulty;
  const start = d.startOffset <= -0.5 ? 'the first is clearly easier than the lesson level' : d.startOffset >= 0.5 ? 'the first is already at or above the lesson level' : 'the first is at the lesson level';
  const step = d.rampLabel === 'steep' ? 'each next one a clear step harder' : d.rampLabel === 'gradual' ? 'each next one only slightly harder' : 'each next one a little harder';
  return `${start}, ${step}`;
}

const CONTRACT_LINE = 'Content contract: teach exactly the same topic, skills and key facts. Do not drop, add or change a fact, definition, rule, step or answer; only HOW it is delivered changes.';
const PRECEDENCE = 'Where this block conflicts with any earlier style note (length, sections, check questions, rule-first or example-first, tone), this block wins: it comes from the full learning profile.';
const NO_LEAK = 'Never mention this profile, "your learning style", scores, a diagnosis or why you chose a style; just write it that way.';

/**
 * The block a writer is given, as lines of fixed, hand-written sentences chosen by the spec.
 * Empty ('') for the default spec: a learner we know nothing about is written for exactly as before.
 * No learner scores appear: the numbers in it are limits on the page (sentence length, checks).
 */
function specToLines(spec, { surface = 'lesson' } = {}) {
  if (!spec || spec.isDefault) return [];
  const allow = SURFACES[surface] === undefined ? null : SURFACES[surface];
  const ranked = [];
  for (const l of LEVER_IDS) {
    const lean = spec.levers ? spec.levers[l] : 0;
    if (Math.abs(lean) < SHOW_AT) continue;
    if (allow && !allow(l)) continue;
    const pair = PHRASES[l];
    const text = pair && pair[lean > 0 ? 1 : 0];
    if (!text) continue;
    ranked.push({ lever: l, text, score: Math.abs(lean) * (1 + LEVERS[l].imp) });
  }
  ranked.sort((a, b) => b.score - a.score || a.lever.localeCompare(b.lever));
  const lines = [];
  const lang = spec.language;
  const surfaceHasText = surface !== 'test';
  if (surfaceHasText && (spec.learner.ageBand !== 'unknown' || spec.learner.esl || (spec.levers && (Math.abs(spec.levers.vocab) >= SHOW_AT || Math.abs(spec.levers.sentence) >= SHOW_AT)))) {
    lines.push(`Language: write at about reading grade ${lang.vocabularyGrade}; most sentences ${lang.maxSentenceWords} words or fewer, none over ${lang.maxSentenceWords + 6}.${lang.avoidIdioms ? ' No idioms or phrasal-verb slang.' : ''}${lang.eslSupport ? ' English is not their first language: simple sentence patterns, one meaning per word, define any uncommon word.' : ''}`);
  }
  if (surface === 'lesson' || surface === 'level') {
    const les = spec.lesson;
    lines.push(`Shape: about ${les.sections} short sections; the body of each section is at most ${les.chunkSentences} sentences (count them, and split a longer one into another section), ${les.newIdeasPerChunk === 1 ? 'one new idea' : `at most ${les.newIdeasPerChunk} new ideas`} per section, ${les.retrievalChecks} check question${les.retrievalChecks === 1 ? '' : 's'} in all (${checkOrder(spec)})${les.quickCheckEvery ? `, a line "Quick check: <question> Answer: <answer>" at the end of ${les.quickCheckEvery === 1 ? 'every section' : 'every second section'}` : ''}${spec.scaffolding.hintInChecks ? `, each with a one-line hint after the question (${spec.scaffolding.hintSize === 'nudge' ? 'a nudge' : spec.scaffolding.hintSize === 'partial' ? 'the idea to use' : 'the first step'}, never the answer)` : ''}, at most ${les.mistakes} common mistake${les.mistakes === 1 ? '' : 's'}. At most about ${les.wordBudget} words in all (not counting the check questions); a shorter lesson that teaches every point is better. ${spec.practice.workedExamples} worked example${spec.practice.workedExamples === 1 ? '' : 's'} (the worked example and the sections' example fields), then ${spec.practice.tryItems === 0 ? 'no extra try-it items' : `${spec.practice.tryItems} try-it line${spec.practice.tryItems === 1 ? '' : 's'} inside the sections, each written "Try it: <question> Answer: <answer>" and placed after the worked examples`}.${les.hook === 'question' ? ' Open with a question the lesson then answers.' : les.hook === 'scenario' ? ' Open with a one-line scenario.' : ''} This is the shape, not a cap on content: if the topic needs more, add sections or words; never drop a point to fit.`);
  }
  const own = ranked.filter((r) => !(surfaceHasText && r.lever === 'sentence'));
  for (const r of own.slice(0, MAX_PHRASES)) lines.push(r.text);
  const ex = spec.interests;
  if (surface === 'lesson' || surface === 'level' || surface === 'tutor') {
    if (ex.exampleDomains.length && ex.share >= 0.7) lines.push(`Examples: build the worked example and every other example on ${ex.exampleDomains.slice(0, 4).join(', ')}, at least three in all; the facts stay the topic's own.`);
    else if (ex.exampleDomains.length && ex.share >= 0.4) lines.push(`Examples: build the worked example and about half of the other examples on ${ex.exampleDomains.slice(0, 4).join(', ')}, at least two in all; the facts stay the topic's own.`);
    else if (ex.exampleDomains.length && ex.share >= 0.3) lines.push(`Examples: use ${ex.exampleDomains.slice(0, 4).join(', ')} for at least one example where it fits; the facts stay the topic's own.`);
    else if (ex.exampleDomains.length && ex.share < 0.3) lines.push('Examples: keep them neutral; do not build them on personal interests.');
  }
  if (ex.avoidDomains.length) lines.push(`Never use examples, comparisons or settings from: ${ex.avoidDomains.slice(0, 6).join(', ')}.`);
  if (surface !== 'notes') for (const note of (spec.aversionNotes || []).slice(0, 2)) lines.push(note);
  if (!lines.length) return [];
  const head = 'HOW TO BUILD THIS FOR THIS LEARNER (from their full learning profile; the topic and facts stay the same, the delivery is theirs)';
  const material = surface === 'material' || surface === 'notes' || surface === 'podcast'
    ? ['Use only what the material says; delivery changes wording, order of emphasis, density and pace, never the facts or the quotes.']
    : [];
  const precedence = surface === 'lesson' || surface === 'level' ? [PRECEDENCE] : [];
  return [head, CONTRACT_LINE, ...precedence, ...material, ...lines.map((t, i) => `${i + 1}. ${t}`), NO_LEAK];
}

/** The block for one learner, as lines: build, then write. [] when there is nothing to say. Never throws. */
function linesFor(userId, opts = {}, surface = 'lesson') {
  try { return specToLines(buildSpec(userId, opts), { surface }); } catch { return []; }
}

function specToPrompt(spec, opts = {}) {
  return specToLines(spec, opts).join('\n');
}

/** A stable short fingerprint of what the spec says (the prompt text of the full surface), for staleness checks. */
function specHash(spec) {
  const text = specToPrompt(spec, { surface: 'lesson' });
  return text ? crypto.createHash('sha1').update(text).digest('hex').slice(0, 12) : 'default';
}

// ── post-generation check ─────────────────────────────────────────────────
const LEAK_RE = /\b(scorecard|your (?:learning )?(?:style|profile|score)|according to your|because you(?:'re| are) (?:slow|dyslexic|anxious|bored|young|old)|your (?:dyslexia|adhd|anxiety)|as a (?:\d+|slow|fast) (?:year[- ]old|learner))\b/i;

const sentencesOf = (t) => String(t || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter((s) => s.split(' ').length >= 2);
const wordList = (t) => (String(t || '').toLowerCase().match(/[a-z][a-z'-]*/g) || []);

/** Does the text mention a domain (any of its content words, or the whole phrase)? */
function mentions(text, domain) {
  const low = String(text || '').toLowerCase();
  if (low.includes(cleanPhrase(domain))) return true;
  const ws = wordsOf(domain).filter((w) => w.length >= 4);
  const have = new Set(wordList(low).map(keyOf));
  return ws.some((w) => have.has(w));
}

/** Content words of a key fact or covers sentence, for the coverage check. */
function keyTerms(fact) {
  const stop = new Set(['that', 'this', 'with', 'from', 'they', 'their', 'what', 'when', 'which', 'into', 'than', 'then', 'there', 'about', 'using', 'used', 'such', 'also', 'both', 'each', 'other', 'more', 'most', 'some', 'will', 'would', 'could', 'should', 'does', 'have', 'been', 'being', 'were', 'your', 'learn', 'students', 'understand', 'explain', 'describe']);
  return [...new Set(wordList(fact).filter((w) => w.length >= 4 && !stop.has(w)).map(keyOf))];
}

/**
 * Did the writer follow the spec, and keep every key fact? Pure, deterministic, no model.
 * `keyFacts`: strings (a fact each) that must still be taught; a fact counts as kept when half of its
 * content words appear. `exempt` lists words that are the topic's own and may exceed the vocabulary cap.
 * Returns { ok, problems: [{ id, detail }], stats }.
 */
function checkFollowed(text, spec, { keyFacts = [], exempt = [], structure = null } = {}) {
  const problems = [];
  const body = String(text || '');
  const stats = {};
  if (!body.trim()) return { ok: false, problems: [{ id: 'empty', detail: 'the text is empty' }], stats };
  // 1. Key facts kept (the content contract), whatever the spec says.
  const missing = [];
  for (const fact of keyFacts) {
    const terms = keyTerms(fact);
    if (!terms.length) continue;
    const have = new Set(wordList(body).map(keyOf));
    const hit = terms.filter((t) => have.has(t)).length;
    if (hit / terms.length < 0.5) missing.push(fact);
  }
  stats.keyFacts = keyFacts.length;
  stats.keyFactsMissing = missing.length;
  if (missing.length) problems.push({ id: 'coverage', detail: `these key points are missing or too thin: ${missing.slice(0, 6).map((m) => `"${String(m).slice(0, 80)}"`).join('; ')}` });
  // 2. The learner's profile never shows through.
  if (LEAK_RE.test(body)) problems.push({ id: 'profile_leak', detail: 'the text talks about the learner\'s profile or style; remove it' });
  if (!spec || spec.isDefault) return { ok: problems.length === 0, problems, stats };
  // 3. Avoided domains.
  const hits = (spec.interests.avoidDomains || []).filter((d) => mentions(body, d));
  stats.avoidedHits = hits.length;
  if (hits.length) problems.push({ id: 'avoid_domain', detail: `it uses ${hits.join(', ')}, which this learner dislikes; use other examples` });
  // 4. Interests used when they should be.
  const doms = spec.interests.exampleDomains || [];
  if (doms.length && spec.interests.share >= 0.5) {
    const used = doms.filter((d) => mentions(body, d));
    stats.interestsUsed = used.length;
    if (!used.length) problems.push({ id: 'interest_unused', detail: `no example uses their interests (${doms.slice(0, 3).join(', ')}); build at least two examples on them` });
    else {
      // How often: at least two uses at a share of half or more, three at seven tenths.
      const low = body.toLowerCase();
      const uses = doms.reduce((n, d) => n + wordsOf(d).filter((w) => w.length >= 4).reduce((m, w) => m + (low.split(w).length - 1), 0), 0);
      stats.interestUses = uses;
      const need = spec.interests.share >= 0.7 ? 3 : 2;
      if (uses < need) problems.push({ id: 'interest_unused', detail: `their interests (${doms.slice(0, 3).join(', ')}) appear only ${uses} time${uses === 1 ? '' : 's'}; build the worked example and at least ${need} examples in all on them` });
    }
  }
  // 5. Sentence length.
  const sents = sentencesOf(body);
  if (sents.length >= 3) {
    const lens = sents.map((s) => s.split(' ').length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sorted = [...lens].sort((a, b) => a - b);
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    stats.meanSentence = round(mean, 1);
    const cap = spec.language.maxSentenceWords;
    const longShare = lens.filter((n) => n > cap + 6).length / lens.length;
    stats.longSentenceShare = round(longShare, 2);
    if (mean > cap * 1.2 || longShare > 0.08) problems.push({ id: 'sentence_length', detail: `sentences are too long (average ${Math.round(mean)} words, ${Math.round(longShare * 100)}% over ${cap + 6}; keep most to ${cap} words or fewer and split any longer one)` });
  }
  // 5b. The shape: how long each section is, how many mistakes, hints, a quick check per section (only what the lesson's structure shows).
  // 5a. Not far over the time the learner has (the budget is a target; a lesson 50% over it is flagged, never at the cost of a key point).
  if (structure && Number.isFinite(structure.words) && spec.lesson.wordBudget) {
    stats.words = structure.words;
    if (structure.words > spec.lesson.wordBudget * 1.3) problems.push({ id: 'too_long', detail: `the lesson is ${structure.words} words; keep it to at most about ${spec.lesson.wordBudget}: cut repeats, extra examples and padding, but not any key point` });
  }
  if (structure && structure.intro !== undefined && spec.lesson.hook === 'question' && !/[?]/.test(String(structure.intro))) problems.push({ id: 'hook_missing', detail: 'open with a question that the lesson then answers' });
  if (structure && Array.isArray(structure.sections) && structure.sections.length) {
    const per = structure.sections.map((s) => s.sentences);
    const meanSec = per.reduce((a, b) => a + b, 0) / per.length;
    stats.meanSectionSentences = round(meanSec, 1);
    const want = spec.lesson.chunkSentences;
    if (meanSec > want + 1.5 || Math.max(...per) > want + 3) problems.push({ id: 'chunk_size', detail: `the sections are too long (${per.map((n) => `${n}`).join(', ')} sentences; keep each section's body to ${want} sentences by splitting it into more sections, and drop nothing)` });
    if (Number.isFinite(structure.mistakes) && structure.mistakes > spec.lesson.mistakes) problems.push({ id: 'mistakes_count', detail: `there are ${structure.mistakes} common mistakes; keep at most ${spec.lesson.mistakes}` });
    if (spec.scaffolding.hintInChecks && Array.isArray(structure.checks) && structure.checks.length) {
      const withHint = structure.checks.filter((c) => /hint\s*[:\-]|\(hint|think about|remember (that|the)|start (by|with)/i.test(c)).length;
      stats.checksWithHint = withHint;
      if (withHint < Math.ceil(structure.checks.length / 2)) problems.push({ id: 'hints_missing', detail: 'most check questions have no hint; add a one-line "Hint:" after each question (never the answer)' });
    }
    if (spec.practice.tryItems >= 1) {
      const tries = structure.sections.reduce((n, s) => n + (String(s.text).match(/try it/gi) || []).length, 0);
      stats.tryIts = tries;
      if (tries < spec.practice.tryItems) problems.push({ id: 'try_its_missing', detail: `add ${spec.practice.tryItems - tries} more line${spec.practice.tryItems - tries === 1 ? '' : 's'} written "Try it: <question> Answer: <answer>" inside the sections, after the worked examples` });
    }
    if (spec.lesson.quickCheckEvery && structure.sections.length >= 2) {
      const quick = structure.sections.filter((s) => /quick check/i.test(s.text)).length;
      stats.quickChecks = quick;
      const need = spec.lesson.quickCheckEvery === 1 ? structure.sections.length - 1 : Math.floor(structure.sections.length / 2);
      if (quick < need) problems.push({ id: 'quick_checks', detail: `end ${spec.lesson.quickCheckEvery === 1 ? 'every section' : 'every second section'} with a line "Quick check: <question> Answer: <answer>"` });
    }
  }
  // 6. Vocabulary: long words that are not the topic's own.
  const ws = wordList(body);
  if (ws.length >= 40) {
    const own = new Set([...exempt, ...keyFacts.flatMap(keyTerms)].map((w) => keyOf(String(w).toLowerCase())));
    const long = ws.filter((w) => w.length >= 11 && !own.has(keyOf(w))).length;
    const share = long / ws.length;
    stats.longWordShare = round(share, 3);
    const capShare = 0.025 + 0.012 * Math.max(0, spec.language.vocabularyGrade - 3);
    if (share > capShare + 0.03) problems.push({ id: 'vocabulary', detail: `too many long or advanced words for about reading grade ${spec.language.vocabularyGrade}; use plainer words and define the rest` });
  }
  return { ok: problems.length === 0, problems, stats };
}

/** The sentence added to a prompt on the single revision pass. */
function revisionNote(problems) {
  return `Your draft broke these requirements. Rewrite it fixing exactly these and keeping every fact, step and answer the same:\n${problems.map((p, i) => `${i + 1}. ${p.detail}`).join('\n')}`;
}

/**
 * Write once; if the check finds problems, ask once more with the problems named; keep the better draft
 * (never one with less coverage). `generate(note)` returns a text-bearing result or null; `textOf(result)` its text.
 */
async function reviseOnce({ generate, textOf, structureOf = null, spec, keyFacts = [], exempt = [] }) {
  const first = await generate(null);
  if (!first) return { result: first, revised: false, problems: [] };
  const check1 = checkFollowed(textOf(first), spec, { keyFacts, exempt, structure: structureOf ? structureOf(first) : null });
  if (check1.ok) return { result: first, revised: false, problems: [], stats: check1.stats };
  let second = null;
  try { second = await generate(revisionNote(check1.problems)); } catch { second = null; }
  if (!second) return { result: first, revised: false, problems: check1.problems, stats: check1.stats };
  const check2 = checkFollowed(textOf(second), spec, { keyFacts, exempt, structure: structureOf ? structureOf(second) : null });
  const cov1 = check1.problems.some((p) => p.id === 'coverage');
  const cov2 = check2.problems.some((p) => p.id === 'coverage');
  const better = (!cov2 || cov1) && check2.problems.length <= check1.problems.length;
  return better
    ? { result: second, revised: true, problems: check2.problems, before: check1.problems, stats: check2.stats }
    : { result: first, revised: false, problems: check1.problems, rejected: check2.problems, stats: check1.stats };
}

// ── what the spec means for code (not prompts) ────────────────────────────
/** The review settings for one learner ({ spacingScale, targetRecall } = 1 and 0.9 for a default spec). Never throws. */
function reviewFor(userId) {
  try {
    const spec = buildSpec(userId, {});
    return spec.isDefault ? { spacingScale: 1, targetRecall: 0.9, spec } : { spacingScale: spec.review.spacingScale, targetRecall: spec.review.targetRecall, spec };
  } catch { return { spacingScale: 1, targetRecall: 0.9, spec: null }; }
}

/** Multiply the day count of a review interval by the learner's spacing (1 for a default spec). */
const reviewScale = (spec) => (spec && !spec.isDefault ? spec.review.spacingScale : 1);
/** Session minutes for this learner given the app's own number (1x for a default spec). */
function scaleMinutes(baseMinutes, spec) {
  if (!spec || spec.isDefault) return baseMinutes;
  const f = clamp(spec.session.minutes / 20, 0.6, 1.5);
  return Math.max(5, Math.round(baseMinutes * f));
}

module.exports = {
  VERSION, K, SHOW_AT, MAX_PHRASES,
  LEVERS, LEVER_IDS, METRIC_RULES, RULE_OF, CONTEXT_RULES, PHRASES, SURFACES, CONTRACT_LINE,
  buildSpec, buildSpecFrom, defaultSpec, gather, pulls, contextOf,
  specToPrompt, specToLines, specHash, linesFor,
  checkFollowed, revisionNote, reviseOnce, keyTerms, mentions,
  interestsFromText: splitDomains, dislikesFromText, splitDislikes, topicDomainOf,
  reviewScale, scaleMinutes, reviewFor,
};
