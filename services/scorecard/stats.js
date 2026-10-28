/**
 * The learning scorecard: one hundred 0–100 stats that together describe how a
 * particular person learns best.
 *
 * These are behaviors the app can observe and act on, not "learning style"
 * types. Matching teaching to what someone says they prefer (visual, auditory,
 * and so on) does not survive testing; matching it to what they measurably do —
 * how much they take in at once, how fast they forget, how they react to being
 * wrong — does. Every stat here is scored from evidence, and each carries its own
 * confidence, so a guess made on day one never counts the same as fifty levels
 * of behavior.
 *
 * Each entry is data, not code:
 *
 *   id      stable key, stored on the scorecard
 *   name    what the learner sees on their profile
 *   low     what a score near 0 means
 *   high    what a score near 100 means
 *   impact  0–3, how much this stat changes a written lesson (ranks directives)
 *   dir     the instruction a lesson writer gets when the score is confidently
 *           low ([0]) or high ([1]); null on a side means "nothing to change"
 *   use     where the directive is used: L = lesson writing, C = the coach
 *   subject true when the stat is tracked per subject as well as overall,
 *           because someone can be advanced in history and a beginner in code
 *
 * Wording rule for directives: each one is a concrete thing to do on the page,
 * written so that two of them can be read together without contradicting.
 * Contradictions that do arise are resolved in translate.js, not left to the
 * model.
 */

const CATEGORIES = [
  { id: 'intake', name: 'Intake and processing' },
  { id: 'reasoning', name: 'Reasoning architecture' },
  { id: 'pacing', name: 'Pacing and cycle architecture' },
  { id: 'engagement', name: 'Stimulus envelope and engagement' },
  { id: 'memory', name: 'Memory and retention' },
  { id: 'resilience', name: 'Failure response and resilience' },
  { id: 'metacognition', name: 'Metacognition and self-regulation' },
  { id: 'representation', name: 'Communication and representation' },
  { id: 'motivation', name: 'Motivation and affect' },
  { id: 'transfer', name: 'Transfer and mastery' },
];

// [id, name, low, high, impact, dirLow, dirHigh, use, subject]
const ROWS = {
  intake: [
    ['intake_baseline', 'Intake baseline', 'needs tiny doses of new information', 'handles a lot of new information per step', 3,
      'Introduce at most one new idea per section and never two new terms in the same paragraph. Consolidate each idea before adding the next.',
      'You can introduce several related ideas per section; this learner absorbs new material quickly and is slowed down by excessive splitting.', 'LC'],
    ['working_memory_span', 'Working memory span', 'juggles one or two ideas at once', 'holds many moving parts at once', 3,
      'Never ask the learner to hold more than two things in mind at once. Write intermediate results down explicitly instead of carrying them in the reader\'s head.',
      'Multi-part reasoning is fine; you may keep several quantities or conditions in play at once.', 'LC'],
    ['processing_velocity', 'Processing velocity', 'needs time to digest', 'gets it on the first read', 2,
      'Give each idea room: restate it once in different words before moving on, and avoid stacking explanations back to back.',
      'Do not restate or pad. Say each thing once, clearly, and move on.', 'LC'],
    ['chunk_granularity', 'Chunk granularity', 'needs micro-steps', 'prefers big unified blocks', 2,
      'Break the material into many short sections (three to five sentences each), each ending on one clear takeaway.',
      'Use fewer, fuller sections that keep a whole idea together rather than chopping it into fragments.', 'L'],
    ['abstraction_tolerance', 'Abstraction tolerance', 'needs something concrete first', 'comfortable with pure abstraction', 3,
      'Anchor every abstract statement in a concrete, specific case before or immediately after stating it. Avoid symbols until the idea is concrete.',
      'You may state general principles directly and work at the abstract level; concrete cases are confirmation, not the main vehicle.', 'LC', true],
    ['example_density_need', 'Example density need', 'one example is enough', 'needs many varied examples', 2,
      'One well-chosen example per idea is enough; more slows this learner down.',
      'Give at least two or three varied examples per idea, deliberately different on the surface so the shared structure stands out.', 'L'],
    ['text_density_tolerance', 'Text density tolerance', 'loses focus in paragraphs', 'fine with dense prose', 2,
      'Keep paragraphs to two or three short sentences. Use line breaks and short lists rather than long paragraphs.',
      'Full paragraphs of connected prose are fine and preferred over fragmented lists.', 'L'],
    ['vocabulary_ceiling', 'Vocabulary ceiling', 'needs plain language', 'handles advanced vocabulary', 3,
      'Use plain, everyday words and short sentences. Any word a twelve-year-old might not know gets a plain definition the first time it appears.',
      'Advanced vocabulary is fine; do not over-simplify the language.', 'LC'],
    ['jargon_absorption', 'Jargon absorption rate', 'new terms need repeated definitions', 'terms stick after one exposure', 2,
      'Define each technical term when it first appears and again briefly the second time it is used. Introduce at most two new terms in the lesson.',
      'Define technical terms once and then use them freely.', 'L'],
    ['spatial_anchoring', 'Spatial anchoring benefit', 'layouts and diagrams do not help', 'layouts and diagrams help a lot', 2,
      null,
      'Where structure exists, lay it out spatially in plain text: a small aligned table, a step list, a tree drawn with indentation, or a before/after pair.', 'LC'],
  ],

  reasoning: [
    ['deductive_trajectory', 'Deductive trajectory', 'rule-first loses them', 'learns best rule first, then cases', 3,
      null,
      'State the rule or principle first, plainly, then show it working on cases.', 'LC'],
    ['inductive_trajectory', 'Inductive trajectory', 'examples-first confuses them', 'learns best from cases, then the rule', 3,
      null,
      'Open with two or three concrete cases and let the learner notice the pattern before you name the rule. Name the rule only after the cases.', 'LC'],
    ['cognitive_flexibility', 'Cognitive flexibility', 'stuck on one explanation', 'switches easily between representations', 2,
      'Stick to one representation of the idea throughout and do not switch between different framings of it.',
      'Show the same idea from two different angles (for example words and a worked calculation, or two different analogies).', 'LC'],
    ['analogical_transfer', 'Analogical transfer', 'analogies confuse them', 'analogies unlock understanding', 2,
      'Avoid analogies and metaphors; explain the thing itself, literally.',
      'Explain the core idea through one strong analogy to something familiar, then map the analogy back onto the real thing explicitly.', 'LC'],
    ['causal_chain_depth', 'Causal chain depth', 'follows one or two "because" links', 'follows long causal chains', 2,
      'Keep each explanation to one or two "because" steps. If a longer chain is needed, number the links and recap the chain.',
      'You may give the full chain of reasons behind a rule; this learner wants the why behind the why.', 'LC'],
    ['systems_thinking', 'Systems thinking', 'sees parts in isolation', 'naturally sees interconnections', 1,
      null,
      'Show how this idea connects to the ideas around it and to earlier lessons; this learner retains things better as part of a system.', 'L'],
    ['pattern_detection', 'Pattern detection speed', 'needs patterns pointed out', 'spots patterns unprompted', 2,
      'Point out every pattern explicitly; do not leave the learner to spot it.',
      'Leave room for the learner to spot patterns; ask "what do you notice?" before naming one.', 'LC'],
    ['logical_rigor', 'Logical rigor preference', 'prefers intuitive explanations', 'wants formal precision', 2,
      'Prefer intuitive, informal explanations over formal precision; precision can come later.',
      'Be precise: state conditions and exceptions exactly, and do not hand-wave a step.', 'LC'],
    ['contradiction_sensitivity', 'Contradiction sensitivity', 'misses inconsistencies', 'catches them immediately', 1,
      'Call out explicitly where two similar-looking cases differ, since this learner may not notice.',
      'Address edge cases and apparent exceptions head-on; this learner will notice and be bothered by any gap.', 'L'],
    ['global_framing_need', 'Global framing need', 'fine starting at details', 'needs the big picture first', 2,
      null,
      'Open with one or two sentences that say where this lesson fits in the bigger picture and what it unlocks, before any detail.', 'L'],
  ],

  pacing: [
    ['cycle_architecture', 'Pacing and cycle architecture', 'needs short teach-then-check cycles', 'prefers a long teach, then a check', 3,
      'Use short teach-then-check cycles: after each section, end with a quick self-check question the learner answers in their head before reading on.',
      'Teach the full idea in one continuous run; do not interrupt it with mini-checks.', 'L'],
    ['attention_runway', 'Attention runway', 'focus drops quickly', 'sustains long focus', 3,
      'Keep the whole lesson short — readable in about three minutes. Cut anything not essential to what the level teaches.',
      'A longer, deeper lesson is fine; this learner sustains attention well.', 'L'],
    ['warmup_latency', 'Warm-up latency', 'engages instantly', 'needs a ramp-in period', 1,
      null,
      'Start with an easy on-ramp: a familiar idea or a quick win before the new material.', 'L'],
    ['fatigue_curve', 'Fatigue curve', 'performance holds all session', 'drops sharply late in session', 1,
      null,
      'Put the most important idea first; this learner fades late, so the end of the lesson is for recap, not new material.', 'L'],
    ['momentum_dependence', 'Momentum dependence', 'unaffected by early wins', 'needs quick wins to keep going', 2,
      null,
      'Give an early, easy success in the first section so the learner builds momentum before the harder part.', 'LC'],
    ['interleaving_tolerance', 'Interleaving tolerance', 'needs one topic at a time', 'thrives on mixed practice', 1,
      'Keep this lesson on one idea; do not mix in other topics.',
      'Contrast this idea with a related one the learner already knows; mixing them sharpens both.', 'L'],
    ['rush_tendency', 'Rush tendency', 'careful reader', 'skims and answers too fast', 2,
      null,
      'Put the single most important sentence in its own short line so it cannot be skimmed past, and include one "slow down here" warning where a hasty reader goes wrong.', 'LC'],
    ['deliberation_depth', 'Deliberation depth', 'answers on instinct', 'deliberates thoroughly', 1,
      'Give a quick rule of thumb the learner can apply on instinct.',
      null, 'L'],
    ['session_rhythm', 'Session rhythm consistency', 'erratic usage', 'consistent routine', 0, null, null, ''],
    ['reentry_cost', 'Re-entry cost', 'resumes easily after breaks', 'needs a recap after any gap', 2,
      null,
      'Open with a two-sentence recap of what the learner already covered that this lesson builds on.', 'L'],
  ],

  engagement: [
    ['stimulus_envelope', 'Stimulus envelope', 'narrow band of novelty before overload or boredom', 'wide tolerable range of intensity', 1,
      'Keep the tone and format calm and predictable; avoid surprises, exclamation, and dramatic framing.',
      null, 'L'],
    ['novelty_hunger', 'Novelty hunger', 'prefers familiar formats', 'needs constant variety', 2,
      'Use a familiar, predictable lesson structure.',
      'Vary the format inside the lesson: mix a scenario, a quick puzzle, and a worked case rather than three sections that look the same.', 'L'],
    ['humor_receptivity', 'Humor receptivity', 'humor distracts', 'humor boosts engagement and recall', 1,
      'Keep the tone straightforward; no jokes.',
      'A touch of light humor is welcome where it makes an idea stick, never at the expense of accuracy.', 'LC'],
    ['narrative_pull', 'Narrative pull', 'stories are fluff to them', 'story framing drives engagement', 2,
      'Skip stories and scene-setting; go straight to the content.',
      'Frame the lesson around a short story or scenario with a character facing a problem the idea solves.', 'L'],
    ['gamification_response', 'Gamification responsiveness', 'points and streaks do nothing', 'strongly motivated by them', 0, null, null, ''],
    ['challenge_appetite', 'Challenge appetite', 'prefers comfortable difficulty', 'seeks hard problems', 2,
      'Keep the worked example at a comfortable difficulty and build confidence before anything hard.',
      'Make the worked example a genuinely challenging case, and end with a harder "try this" extension.', 'LC'],
    ['curiosity_hook', 'Curiosity hook sensitivity', 'mystery openers do not help', 'mystery and question openers strongly engage', 2,
      null,
      'Open with a puzzling question or surprising fact that the lesson then answers.', 'L'],
    ['interest_transfer', 'Interest transfer strength', 'wrapping content in their interests does not help', 'interest-based framing helps a lot', 3,
      'Do not force their interests into the lesson; use neutral examples.',
      'Build the examples and the worked example around the learner\'s interests listed below, so the idea lives inside something they care about.', 'LC'],
    ['relevance_demand', 'Relevance demand', 'learns without a "why"', 'disengages without real-world relevance', 2,
      null,
      'Say early and concretely where this is used in real life or what it lets the learner do.', 'L'],
    ['tone_formality', 'Tone formality preference', 'casual and conversational', 'formal and academic', 1,
      'Write casually and conversationally, like a friendly older student explaining it.',
      'Write in a clear, formal, textbook register.', 'LC'],
  ],

  memory: [
    ['retrieval_strength', 'Retrieval strength', 'needs cues to recall', 'recalls unprompted', 2,
      'Give the learner a memorable cue or label to hang the idea on, and repeat that cue in the summary.',
      null, 'L', true],
    ['recognition_recall_gap', 'Recognition–recall gap', 'recognizes and recalls equally', 'recognizes but cannot produce', 2,
      null,
      'Include one place where the learner has to produce the idea from memory (fill-the-gap or say-it-back) rather than just read it.', 'L'],
    ['decay_rate', 'Decay rate', 'retains long-term', 'forgets fast', 2,
      null,
      'Weave in a quick callback to earlier material and end with a compact summary designed to be recalled later.', 'L', true],
    ['elaboration_benefit', 'Elaboration benefit', 'explaining in own words does not help', 'big retention gain from explaining', 2,
      null,
      'Prompt the learner, inside the lesson, to explain a step to themselves in their own words before reading the answer.', 'LC'],
    ['mnemonic_receptivity', 'Mnemonic receptivity', 'mnemonics do not stick', 'mnemonics work well', 1,
      null,
      'Where the material has a list or an order to remember, give a short mnemonic.', 'L'],
    ['consolidation_need', 'Consolidation need', 'no recap needed', 'needs summaries and recaps', 2,
      'Keep the summary to one line.',
      'End each section with a one-line takeaway and finish with a short recap of all of them.', 'L'],
    ['interference_susceptibility', 'Interference susceptibility', 'keeps similar concepts separate', 'confuses similar concepts', 2,
      null,
      'Explicitly contrast this idea with the look-alike idea it is most often confused with, side by side.', 'LC'],
    ['enactive_encoding', 'Enactive encoding', 'learns fine passively', 'learns mainly by doing', 2,
      null,
      'Make the learner do something in every section: a quick calculation, a choice, or a sentence to complete in their head.', 'L'],
    ['generation_effect', 'Generation effect response', 'reading is as good as producing', 'much better when producing answers', 2,
      null,
      'Before revealing each step of the worked example, ask the learner to predict it.', 'LC'],
    ['retention_index', 'Long-term retention index', 'poor delayed recall', 'excellent delayed recall', 1,
      'Build in deliberate repetition of the key point at the start, middle, and end.',
      null, 'L', true],
  ],

  resilience: [
    ['failure_response', 'Failure response', 'disengages after errors', 'treats errors as fuel', 2,
      'Frame mistakes as normal and expected; when describing common mistakes, keep the tone reassuring.',
      'Present common mistakes as traps to beat; this learner is energized by finding where they went wrong.', 'LC'],
    ['error_recovery_speed', 'Error recovery speed', 'needs several attempts to correct', 'corrects immediately', 1,
      'For each common mistake, show the correction step by step, not just the right answer.',
      null, 'LC'],
    ['frustration_threshold', 'Frustration threshold', 'frustrates quickly', 'very patient', 2,
      'Avoid any step that feels like a wall: ramp difficulty gently and never leave a gap the learner has to bridge alone.',
      null, 'LC'],
    ['hint_dependency', 'Hint dependency', 'rarely needs hints', 'relies on hints heavily', 1,
      null,
      'Build gentle hints into the explanation so the learner gets the nudge from the lesson itself.', 'LC'],
    ['help_seeking', 'Help-seeking tendency', 'struggles silently', 'asks for help readily', 1,
      'Anticipate the learner\'s questions and answer them in the text, because they will not ask.',
      null, 'LC'],
    ['guessing_propensity', 'Guessing propensity', 'only answers when sure', 'guesses freely', 1,
      null,
      'Teach the quick check that tells a reasoned answer from a guess, so the learner verifies before committing.', 'LC'],
    ['perfectionism', 'Perfectionism index', 'fine with partial progress', 'needs everything perfect', 1,
      null,
      'Say clearly which parts matter now and which can wait, so the learner does not stall on details that come later.', 'LC'],
    ['productive_struggle', 'Productive struggle tolerance', 'needs rescue early', 'benefits from being left to struggle', 2,
      'Do not leave anything for the learner to figure out unaided in this lesson; guide every step.',
      'Leave one step of the worked example for the learner to work out before you show it.', 'LC'],
    ['confidence_calibration', 'Confidence calibration', 'confidence does not match accuracy', 'confidence predicts accuracy', 1,
      'Include a quick "how would you know you are right?" check so the learner can test their own confidence.',
      null, 'LC'],
    ['error_driven_learning', 'Error-driven learning', 'repeats the same mistakes', 'rarely repeats a corrected mistake', 2,
      'Name the specific recurring mistake listed below directly and show exactly why it fails.',
      null, 'LC', true],
  ],

  metacognition: [
    ['self_monitoring', 'Self-monitoring accuracy', 'does not know what they do not know', 'accurate self-assessment', 1,
      'Tell the learner exactly how to check whether they have understood (a specific test they can run).',
      null, 'LC'],
    ['strategy_awareness', 'Strategy awareness', 'no study strategy', 'deliberately uses strategies', 1,
      'Name the method explicitly as a reusable strategy ("when you see X, do Y").',
      null, 'L'],
    ['mastery_orientation', 'Mastery orientation', 'wants the score or completion', 'wants real understanding', 1,
      'Make it clear what the learner will be able to do after this lesson and keep the path to that short.',
      'Explain the underlying reason, not just the procedure; this learner wants to understand.', 'L'],
    ['autonomy_preference', 'Autonomy preference', 'wants to be guided', 'wants to choose their own path', 1,
      'Guide the learner step by step in a clear order.',
      'Offer the learner choices of how to approach the idea, and an optional deeper aside.', 'LC'],
    ['structure_need', 'Structure need', 'fine with open-ended tasks', 'needs clear steps and structure', 2,
      null,
      'Use clear, numbered steps and predictable headings.', 'LC'],
    ['instruction_adherence', 'Instruction adherence', 'skims directions', 'follows directions precisely', 1,
      'Keep any instruction to one short sentence and put it right where it is needed.',
      null, 'L'],
    ['reflection_depth', 'Reflection depth', 'shallow reflection', 'rich, specific reflection', 0, null, null, ''],
    ['question_generation', 'Question generation', 'never asks their own questions', 'constantly asks "what if"', 1,
      null,
      'Include one "what if" variation that answers the obvious follow-up question this learner will have.', 'LC'],
    ['self_efficacy', 'Self-efficacy', 'believes they are "bad at this"', 'confident they can learn it', 2,
      'Make the first step clearly achievable and point out explicitly that it was achieved; show that the hard part is learnable.',
      null, 'LC'],
    ['planning_tendency', 'Planning tendency', 'dives straight in', 'plans an approach first', 1,
      'Give a one-line "how to approach this" before the worked example.',
      null, 'L'],
  ],

  representation: [
    ['step_explicitness', 'Step explicitness need', 'skipped steps are fine', 'every step must be shown', 3,
      'You may skip routine steps; this learner fills them in easily.',
      'Show every single step of reasoning and calculation; never skip a step, however obvious.', 'LC'],
    ['worked_example_dependence', 'Worked example dependence', 'learns from principles', 'needs full worked examples', 3,
      'One short worked example is enough; the principle carries the lesson.',
      'Make the worked example the centerpiece, fully annotated, and add a second, slightly varied one.', 'L', true],
    ['scaffolding_fade', 'Scaffolding fade rate', 'supports must be removed slowly', 'supports can be removed quickly', 1,
      'Keep full support (reminders, hints) all the way through the lesson.',
      'Fade support quickly: give full guidance in the first example and much less in the second.', 'L'],
    ['notation_comfort', 'Symbolic notation comfort', 'formulas and symbols intimidate', 'comfortable with notation', 2,
      'Say everything in words first; introduce any formula or symbol only after the idea is clear in words, and read it out in words.',
      'Use notation freely where it is clearer than words.', 'LC', true],
    ['brevity_preference', 'Brevity preference', 'wants full detail', 'wants the shortest version', 3,
      'Give full detail and explanation; this learner wants the complete picture.',
      'Be as brief as possible without dropping any required point. Every sentence must earn its place.', 'LC'],
    ['repetition_tolerance', 'Repetition tolerance', 'bored by restating', 'benefits from restating', 1,
      'Never restate the same point twice in the same words.',
      'Restate the key idea at least twice in different words.', 'L'],
    ['feedback_granularity', 'Feedback granularity', '"right or wrong" is enough', 'wants a detailed breakdown', 1,
      'Keep explanations of mistakes short.',
      'In common mistakes, explain exactly which step went wrong and what it produced.', 'LC'],
    ['feedback_tone_sensitivity', 'Feedback tone sensitivity', 'handles blunt correction', 'needs gentle framing', 1,
      'Be direct and blunt about errors; no cushioning.',
      'Frame corrections gently and constructively.', 'LC'],
    ['open_response_performance', 'Open-response performance', 'much better on multiple choice', 'strong on open-ended answers', 1,
      null, null, ''],
    ['dialogic_preference', 'Dialogic preference', 'prefers being told', 'prefers a Socratic back-and-forth', 2,
      'Explain directly; do not pose questions the learner must answer before continuing.',
      'Write in a question-and-answer style: pose the question the learner would ask, then answer it.', 'LC'],
  ],

  motivation: [
    ['intrinsic_motivation', 'Intrinsic motivation', 'needs outside reasons', 'learns for its own sake', 1,
      'Say what the learner gains from this concretely (a test, a skill, a goal they listed).',
      'Lean into what is genuinely fascinating about the idea.', 'L'],
    ['extrinsic_reward_sensitivity', 'Extrinsic reward sensitivity', 'rewards do not matter', 'rewards strongly drive effort', 0, null, null, ''],
    ['competitive_drive', 'Competitive drive', 'indifferent to comparison', 'motivated by beating benchmarks', 1,
      null,
      'Frame the challenge as something to beat ("most people get this wrong — here is how not to").', 'L'],
    ['praise_sensitivity', 'Praise sensitivity', 'praise has no effect', 'praise noticeably boosts effort', 1,
      'No praise or encouragement filler.',
      'Acknowledge progress specifically (never generically) where the learner has achieved something.', 'LC'],
    ['evaluation_anxiety', 'Evaluation anxiety', 'calm on quizzes', 'performance drops when "tested"', 2,
      null,
      'Keep the tone low-stakes: present any questions and challenges as practice to see what stuck, not as a test.', 'LC'],
    ['boredom_susceptibility', 'Boredom susceptibility', 'tolerates dry content', 'disengages fast when bored', 2,
      null,
      'Keep it lively: vary sentence rhythm, open strong, and cut anything dry that is not essential.', 'L'],
    ['persistence', 'Persistence', 'quits on hard tasks', 'pushes through', 2,
      'Put the payoff early and keep each section short enough to finish easily, so there is no point where it is tempting to quit.',
      null, 'LC'],
    ['social_framing', 'Social framing receptivity', 'people in examples do not matter', 'characters strongly engage', 1,
      null,
      'Put people in the examples: named characters making decisions.', 'L'],
    ['identity_alignment', 'Identity alignment', '"people like you" framing does nothing', 'identity framing is strongly motivating', 1,
      null,
      'Connect the idea to the kind of person the learner is or wants to be (their goals listed below).', 'L'],
    ['emotional_engagement', 'Emotional engagement response', 'emotional stakes do not affect recall', 'emotional stakes boost recall', 1,
      null,
      'Give the examples real stakes — something that matters to someone if it goes wrong.', 'L'],
  ],

  transfer: [
    ['near_transfer', 'Near transfer', 'cannot apply to slightly different problems', 'applies easily to variations', 2,
      'Show the same method on a slightly different-looking problem, and point out what changed and what stayed the same.',
      null, 'L', true],
    ['far_transfer', 'Far transfer', 'knowledge stays in context', 'applies it across domains', 1,
      null,
      'Briefly show the same idea at work in a completely different field.', 'L'],
    ['application_orientation', 'Application orientation', 'likes theory', 'wants practical use', 2,
      'Theory-first is fine; this learner enjoys the idea for its own sake.',
      'Show the practical use of the idea early and make the worked example a realistic task.', 'L'],
    ['conceptual_bias', 'Conceptual–procedural bias', 'learns the "how" (procedures) best', 'learns the "why" (concepts) best', 2,
      'Lead with the procedure — a clear recipe — and add the reason after.',
      'Lead with why it works; the procedure should follow from the reason.', 'LC'],
    ['prior_knowledge', 'Prior knowledge density', 'little background in this subject', 'strong background in this subject', 3,
      'Assume no background: define every prerequisite briefly in passing.',
      'Assume solid background; skip basics and go straight to the new part.', 'LC', true],
    ['misconception_persistence', 'Misconception persistence', 'corrections stick', 'wrong beliefs keep coming back', 2,
      null,
      'Directly confront the learner\'s recorded misconception: state it, show a case where it fails, and give the correct idea.', 'LC', true],
    ['integration_tendency', 'Integration tendency', 'treats each level separately', 'connects to past levels', 1,
      'Explicitly connect this lesson to the earlier lessons listed below, since the learner will not do it on their own.',
      null, 'L'],
    ['depth_breadth', 'Depth–breadth preference', 'wants a wide overview', 'wants deep dives', 2,
      'Give a broad overview of the idea and its main uses rather than drilling into one case.',
      'Go deep on one case rather than skimming many.', 'L'],
    ['creative_extension', 'Creative extension', 'wants defined tasks', 'loves open, creative extensions', 1,
      null,
      'End with an optional open-ended challenge where the learner invents their own example.', 'L'],
    ['mastery_velocity', 'Mastery velocity', 'slow improvement across levels', 'rapid improvement across levels', 1,
      'Consolidate: spend more of the lesson making the core solid than on extensions.',
      'Move briskly; this learner climbs fast and is held back by over-consolidation.', 'L', true],
  ],
};

const STATS = [];
const BY_ID = {};
for (const cat of CATEGORIES) {
  for (const [id, name, low, high, impact, dirLow, dirHigh, use, subject] of ROWS[cat.id]) {
    const stat = {
      id,
      name,
      category: cat.id,
      low,
      high,
      impact,
      dir: [dirLow || null, dirHigh || null],
      use: String(use || ''),
      subject: !!subject,
    };
    STATS.push(stat);
    BY_ID[id] = stat;
  }
}

// Directive texts revised by the evidence article (curriculum-build/evidence-article/
// 03-scorecard-adaptation.md), each with its own off switch; off gives the text
// in ROWS above. Read when a directive is built, so a switch needs no reload.
//   P2 SCORECARD_SOFT_STRETCH: the challenge stays optional and at the end
//      (jansen2013, lomas2013, lomas2017); the worked example is not made hard.
//   P5 SCORECARD_WORKED_HINT_TEXT: a worked example of the exact step, then a
//      try-first prompt, in place of built-in hints (koedinger2007,
//      aleven2016help, renkl2014, salden2010, baker2004).
//   P6 SCORECARD_SUBGOAL_TEXT: short sub-goals and specific progress feedback
//      (schunk1983, bandura1981, usher2008, byarswinston2017); no generic praise.
const TEXT_V2 = [
  ['challenge_appetite', 1, 'SCORECARD_SOFT_STRETCH',
    'Teach the core at the usual level, then end with one optional harder "try this" case.'],
  ['hint_dependency', 1, 'SCORECARD_WORKED_HINT_TEXT',
    'Open with one fully worked example of exactly this step, then ask the learner to try the next step themselves before any hint.'],
  ['self_efficacy', 0, 'SCORECARD_SUBGOAL_TEXT',
    'Make the first step clearly achievable and point out explicitly that it was achieved; show that the hard part is learnable. Split the task into short sub-goals, and after the first one say specifically what they did right and that it shows they can do this kind of step.'],
];
for (const [id, side, flag, text] of TEXT_V2) {
  const stat = BY_ID[id];
  const before = stat.dir.slice();
  Object.defineProperty(stat, 'dir', {
    enumerable: true,
    get() {
      const on = String(process.env[flag] || 'on').toLowerCase() !== 'off';
      const out = before.slice();
      if (on) out[side] = text;
      return out;
    },
  });
}

if (STATS.length !== 100) {
  // A wrong count means a row was lost or duplicated in an edit. Fail at load,
  // not quietly in front of a learner.
  throw new Error(`scorecard: expected 100 stats, found ${STATS.length}`);
}
if (Object.keys(BY_ID).length !== STATS.length) {
  throw new Error('scorecard: duplicate stat id');
}

module.exports = { CATEGORIES, STATS, BY_ID, TEXT_V2 };
