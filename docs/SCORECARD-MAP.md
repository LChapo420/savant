# Scorecard map: every metric, who reads it, and whether it changes anything

Written by `node scripts/scorecard-usage-audit.js` from the code (do not edit by hand). The test is mechanical: a metric is **dead** when nothing that writes, orders, tests or schedules a learner's material reads it. Definitions are `services/scorecard/stats.js`; the learning spec is `services/learning-spec.js`.

## Summary

| | Before the learning spec | After |
|---|---|---|
| Metrics | 100 | 100 |
| **Dead** (change nothing) | **10** | **0** |
| Live through a hand-written directive, a knob, the tutor plan, an experiment or a session read | 90 | 90 |
| Live through the learning spec (a prompt sentence or a field read in code) | 0 | 100 |
| With a documented rule in METRIC_RULES | 0 | 100 |

"Live before" is generous: it only means a path exists. A lesson directive fires only when the app is confident of the learner's side (a calibrated posterior of at least 0.98 and the top or bottom fifth), and at most six fire at once (`translate.js` MAX_DIRECTIVES), so on any one lesson most of the metrics marked live before did nothing. The spec reads every metric on every build, weighted by its confidence.

### Dead before (10)

- `text_density_tolerance` (Text density tolerance): secondary rate: never steers (03-M5)
- `session_rhythm` (Session rhythm consistency): use is empty: no writer is told; no directive text on either side
- `gamification_response` (Gamification responsiveness): use is empty: no writer is told; no directive text on either side
- `retrieval_strength` (Retrieval strength): memory-kind: never steers a lesson (03-M5)
- `decay_rate` (Decay rate): memory-kind: never steers a lesson (03-M5)
- `retention_index` (Long-term retention index): memory-kind: never steers a lesson (03-M5)
- `error_driven_learning` (Error-driven learning): secondary rate: never steers (03-M5)
- `reflection_depth` (Reflection depth): use is empty: no writer is told; no directive text on either side
- `open_response_performance` (Open-response performance): use is empty: no writer is told; no directive text on either side
- `extrinsic_reward_sensitivity` (Extrinsic reward sensitivity): use is empty: no writer is told; no directive text on either side

### Dead after (0)

None.

## Every metric

Columns: **meaning** (a low score, then a high one); **channels before**; **spec** (the levers its rule pulls, the evidence id, and the concrete fields that move when the score goes from 2 to 98); **readers** (files that mention the id besides its definition and the spec; `[w]` marks the scorecard's own plumbing that measures it).

### Intake and processing

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `intake_baseline` | needs tiny doses of new information / handles a lot of new information per step | lesson text, coach text | +chunk +pace; 03-M19; lesson.sections, lesson.chunkSentences, lesson.wordBudget, lesson.newIdeasPerChunk, lesson.maxNewTerms, +7 | learning-depth.js:104; onboarding/pool.js:52; onboarding/tasks.js:139; scorecard/drift.js:36 |
| `working_memory_span` | juggles one or two ideas at once / holds many moving parts at once | lesson text, coach text | +chunk -structure -scaffold; 03-M19; lesson.sections, lesson.chunkSentences, lesson.newIdeasPerChunk, difficulty.supportShare, scaffolding.level, +8 | boosters.js:144; learning-depth.js:104; onboarding/pool.js:52; onboarding/tasks.js:139 |
| `processing_velocity` | needs time to digest / gets it on the first read | lesson text, coach text, structure, tutor plan | +pace -repetition -length; 03-M19; lesson.minutes, lesson.wordBudget, lesson.pace, lesson.restate, explain.modes, +7 | adaptation.js:105; boosters.js:145; learning-depth.js:104; onboarding/pool.js:53 |
| `chunk_granularity` | needs micro-steps / prefers big unified blocks | lesson text, tutor plan | +chunk; 03-M19; lesson.sections, lesson.chunkSentences, lesson.newIdeasPerChunk, lesson.maxNewTerms, depth.measures | learning-depth.js:315; onboarding/pool.js:52; onboarding/tasks.js:139; [w] scorecard/index.js:1596 |
| `abstraction_tolerance` | needs something concrete first / comfortable with pure abstraction | lesson text, coach text, tutor plan, experiment | +ruleFirst -application; no mechanism; explain.modes, explain.order, transfer.application, learning.order, depth.measures, +4 | learning-depth.js:105; onboarding/pool.js:55; onboarding/tasks.js:166; personalize.js:155 |
| `example_density_need` | one example is enough / needs many varied examples | lesson text, experiment | +exampleCount; no mechanism; practice.workedExamples, practice.tryItems, practice.examplesPerIdea, depth.measures | onboarding/pool.js:98; personalize.js:170; scorecard/indicators.js:63; scorecard/translate.js:120 |
| `text_density_tolerance` | loses focus in paragraphs / fine with dense prose | **dead** | +density +chunk; no mechanism; lesson.sections, lesson.chunkSentences, explain.modes, explain.textDensity, explain.paragraphSentences, +5 | learning-depth.js:105; onboarding/pool.js:54; onboarding/tasks.js:166; scorecard/indicators.js:42 |
| `vocabulary_ceiling` | needs plain language / handles advanced vocabulary | lesson text, coach text | +vocab +sentence; no mechanism; language.vocabularyGrade, language.maxSentenceWords, language.plainLanguage, depth.measures, depth.facts.measuredStrengths, +3 | learning-depth.js:104; onboarding/pool.js:54; onboarding/tasks.js:166; reading-check.js:3 |
| `jargon_absorption` | new terms need repeated definitions / terms stick after one exposure | lesson text, experiment | -defineTerms; no mechanism; lesson.maxNewTerms, language.defineTerms, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, +2 | learning-depth.js:104; onboarding/pool.js:54; onboarding/tasks.js:166; personalize.js:173 |
| `spatial_anchoring` | layouts and diagrams do not help / layouts and diagrams help a lot | lesson text, coach text, tutor plan | +visual; no mechanism; explain.modes, explain.visual, learning.dualCoding.on, learning.dualCoding.strength, depth.measures, +4 | learning-depth.js:111; onboarding/pool.js:99; [w] scorecard/index.js:1595; tutor-evidence.js:52 |

### Reasoning architecture

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `deductive_trajectory` | rule-first loses them / learns best rule first, then cases | lesson text, coach text | +ruleFirst; no mechanism; explain.modes, explain.order, learning.order, depth.measures | learning-depth.js:295; onboarding/pool.js:63; [w] scorecard/index.js:1594; scorecard/translate.js:5 |
| `inductive_trajectory` | examples-first confuses them / learns best from cases, then the rule | lesson text, coach text, experiment | -ruleFirst; no mechanism; explain.modes, explain.order, learning.order, depth.measures | learning-depth.js:282; onboarding/pool.js:64; personalize.js:128; [w] scorecard/index.js:1594 |
| `cognitive_flexibility` | stuck on one explanation / switches easily between representations | lesson text, coach text | +multiRep; no mechanism; explain.modes, learning.dualCoding.strength, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, +2 | learning-depth.js:106; onboarding/pool.js:58; onboarding/tasks.js:155; scorecard/footprint-defs.js:26 |
| `analogical_transfer` | analogies confuse them / analogies unlock understanding | lesson text, coach text, tutor plan, experiment | +analogy; no mechanism; explain.modes, explain.analogy, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, +2 | learning-depth.js:106; onboarding/pool.js:65; personalize.js:131; scorecard/indicators.js:56 |
| `causal_chain_depth` | follows one or two "because" links / follows long causal chains | lesson text, coach text | +causal; no mechanism; explain.modes, learning.dualCoding.forms, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, +2 | learning-depth.js:105; onboarding/pool.js:66; scorecard/indicators.js:39; scorecard/item-tags.js:26 |
| `systems_thinking` | sees parts in isolation / naturally sees interconnections | lesson text | +systems +integration; no mechanism; explain.modes, transfer.connections, learning.retrieval.cumulative, learning.spacing.earlierQuestion, depth.measures, +4 | learning-depth.js:106; onboarding/pool.js:66; scorecard/item-tags.js:27 |
| `pattern_detection` | needs patterns pointed out / spots patterns unprompted | lesson text, coach text | -patternHints; no mechanism; explain.patternPointedOut, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, depth.facts.measuredIds.strengths, +1 | learning-depth.js:105; onboarding/pool.js:64; scorecard/item-tags.js:24 |
| `logical_rigor` | prefers intuitive explanations / wants formal precision | lesson text, coach text | +rigor; no mechanism; explain.rigor, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, depth.facts.measuredIds.strengths, +1 | learning-depth.js:105; onboarding/pool.js:63; scorecard/item-tags.js:25 |
| `contradiction_sensitivity` | misses inconsistencies / catches them immediately | lesson text | +contradiction; no mechanism; meta.spotTheInconsistency, depth.measures | onboarding/pool.js:63; scorecard/item-tags.js:28 |
| `global_framing_need` | fine starting at details / needs the big picture first | lesson text, experiment | +bigPicture; no mechanism; lesson.bigPictureFirst, explain.modes, depth.measures | personalize.js:176; scorecard/indicators.js:65 |

### Pacing and cycle architecture

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `cycle_architecture` | needs short teach-then-check cycles / prefers a long teach, then a check | lesson text, tutor plan, experiment | -checkFreq +chunk; no mechanism; lesson.sections, lesson.chunkSentences, lesson.quickCheckEverySection, lesson.quickCheckEvery, lesson.retrievalChecks, +4 | learning-depth.js:278; personalize.js:152; [w] scorecard/index.js:1597; scorecard/translate.js:138 |
| `attention_runway` | focus drops quickly / sustains long focus | lesson text, structure, tutor plan | +sessionLen +length -breaks +chunk; 03-M19; lesson.minutes, lesson.sections, lesson.chunkSentences, lesson.mistakes, lesson.wordBudget, +13 | adaptation.js:109; boosters.js:146; learning-depth.js:106; scorecard/contract.js:75 |
| `warmup_latency` | engages instantly / needs a ramp-in period | lesson text | +warmup; no mechanism; lesson.warmupItems, depth.measures | onboarding/pool.js:53; onboarding/tasks.js:143; [w] scorecard/signals.js:114 |
| `fatigue_curve` | performance holds all session / drops sharply late in session | lesson text | +fatigue -sessionLen +breaks; no mechanism; session.minutes, session.breakEveryMinutes, session.breakMinutes, session.items, session.hardestFirst, +1 | efficiency.js:120; scorecard/drift.js:35; scorecard/indicators.js:73; [w] scorecard/signals.js:116 |
| `momentum_dependence` | unaffected by early wins / needs quick wins to keep going | lesson text, coach text | +momentum +warmup -diffStart; 03-M27; lesson.warmupItems, difficulty.startOffset, depth.measures | scorecard/footprint-defs.js:32; [w] scorecard/signals.js:128 |
| `interleaving_tolerance` | needs one topic at a time / thrives on mixed practice | lesson text | +interleave; 03-M36; review.interleaving, learning.retrieval.cumulative, learning.spacing.earlierQuestion, learning.spacing.lookalike, depth.measures | learning-depth.js:284; onboarding/pool.js:59; onboarding/tasks.js:155; [w] scorecard/signals.js:124 |
| `rush_tendency` | careful reader / skims and answers too fast | lesson text, coach text | +structure +checks +reflection -pace; 03-M29; lesson.wordBudget, lesson.retrievalChecks, explain.modes, explain.numberedSteps, learning.retrieval.questions, +6 | learning-depth.js:110; scorecard/contract.js:59; [w] scorecard/signals.js:66 |
| `deliberation_depth` | answers on instinct / deliberates thoroughly | lesson text | +pressure -pace; no mechanism; lesson.wordBudget, feedback.lowStakes, feedback.timers, learning.length.words, depth.measures | scorecard/indicators.js:67; [w] scorecard/signals.js:56 |
| `session_rhythm` | erratic usage / consistent routine | **dead** | -recapStart -sessionLen; no mechanism; lesson.recapAtStart, session.minutes, session.breakEveryMinutes, session.items, depth.measures | scorecard/indicators.js:78; [w] scorecard/signals.js:906; content/ipip-items.js:23 |
| `reentry_cost` | resumes easily after breaks / needs a recap after any gap | lesson text | +recapStart; no mechanism; lesson.recapAtStart, depth.measures | onboarding/pool.js:58; onboarding/tasks.js:155; [w] scorecard/signals.js:148 |

### Stimulus envelope and engagement

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `stimulus_envelope` | narrow band of novelty before overload or boredom / wide tolerable range of intensity | lesson text | +novelty; no mechanism; engagement.novelty, depth.measures | scorecard/indicators.js:48 |
| `novelty_hunger` | prefers familiar formats / needs constant variety | lesson text, experiment | +novelty; no mechanism; engagement.novelty, depth.measures | onboarding/pool.js:106; personalize.js:188; scorecard/indicators.js:53; tutor-learner-model.js:315 |
| `humor_receptivity` | humor distracts / humor boosts engagement and recall | lesson text, coach text, tutor plan, experiment | +humor; no mechanism; feedback.tone.humor, depth.measures | onboarding/pool.js:101; personalize.js:158; scorecard/indicators.js:46; tutor-learner-model.js:89 |
| `narrative_pull` | stories are fluff to them / story framing drives engagement | lesson text, experiment | +story; no mechanism; lesson.hook, lesson.storyFrame, explain.modes, depth.measures | onboarding/pool.js:101; personalize.js:134; scorecard/indicators.js:93; scorecard/translate.js:132 |
| `gamification_response` | points and streaks do nothing / strongly motivated by them | **dead** | +gamification; no mechanism; engagement.gamification, depth.measures | scorecard/indicators.js:47 |
| `challenge_appetite` | prefers comfortable difficulty / seeks hard problems | lesson text, coach text, structure | +challenge +diffRamp +diffStart; 03-M22; difficulty.startOffset, difficulty.ramp, difficulty.rampLabel, difficulty.stretchShare, difficulty.supportShare, +2 | adaptation.js:106; ai.js:1186; learner.js:32; scorecard/contract.js:63 |
| `curiosity_hook` | mystery openers do not help / mystery and question openers strongly engage | lesson text, experiment | +curiosity; no mechanism; lesson.hook, depth.measures | onboarding/pool.js:91; onboarding/tasks.js:202; personalize.js:146; scorecard/footprint-defs.js:34 |
| `interest_transfer` | wrapping content in their interests does not help / interest-based framing helps a lot | lesson text, coach text, structure, experiment | +interestUse; 03-M33; interests.share, depth.measures | adaptation.js:110; onboarding/pool.js:104; personalize.js:137; scorecard/contract.js:76 |
| `relevance_demand` | learns without a "why" / disengages without real-world relevance | lesson text, experiment | +relevance +application; no mechanism; lesson.whyItMatters, transfer.application, depth.measures | onboarding/pool.js:101; personalize.js:185; scorecard/indicators.js:57 |
| `tone_formality` | casual and conversational / formal and academic | lesson text, coach text, experiment | +formality; no mechanism; feedback.tone.formality, depth.measures | onboarding/pool.js:101; personalize.js:182; scorecard/indicators.js:45; tutor-learner-model.js:91 |

### Memory and retention

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `retrieval_strength` | needs cues to recall / recalls unprompted | **dead** | -checks +reviewSpacing; 02-M16; lesson.retrievalChecks, review.spacingScale, learning.retrieval.questions, learning.spacing.earlierQuestion, learning.spacing.tomorrowLine, +5 | learning-depth.js:106; [w] scorecard/forgetting.js:48; [w] scorecard/index.js:1409; [w] scorecard/signals.js:419 |
| `recognition_recall_gap` | recognizes and recalls equally / recognizes but cannot produce | lesson text | +typed +generation; 02-M35; practice.typedAnswers, practice.predictBeforeReveal, review.typedRecall, learning.retrieval.produce, depth.measures | learning-depth.js:278; [w] scorecard/signals.js:593 |
| `decay_rate` | retains long-term / forgets fast | **dead** | -reviewSpacing +reviewIntensity; 02-M50; review.spacingScale, review.targetRecall, review.reviewShare, review.firstReviewDays, learning.retrieval.cumulative, +7 | learning-depth.js:107; [w] scorecard/forgetting.js:48; [w] scorecard/index.js:1273; [w] scorecard/signals.js:409 |
| `elaboration_benefit` | explaining in own words does not help / big retention gain from explaining | lesson text, coach text | +elaboration; no mechanism; practice.selfExplain, depth.measures | [w] scorecard/index.js:1599; scorecard/indicators.js:37 |
| `mnemonic_receptivity` | mnemonics do not stick / mnemonics work well | lesson text, experiment | +mnemonic; no mechanism; explain.modes, depth.measures | personalize.js:179 |
| `consolidation_need` | no recap needed / needs summaries and recaps | lesson text, structure | +recapEnd +reviewIntensity; 03-M34; lesson.recapAtEnd, review.targetRecall, review.reviewShare, learning.retrieval.cumulative, learning.spacing.earlierQuestion, +2 | adaptation.js:111; learning-depth.js:277; scorecard/contract.js:77; scorecard/indicators.js:77 |
| `interference_susceptibility` | keeps similar concepts separate / confuses similar concepts | lesson text, coach text | +contrast +misconception -interleave; no mechanism; explain.misconception, explain.contrastLookalikes, review.interleaving, learning.retrieval.cumulative, learning.spacing.earlierQuestion, +6 | learning-depth.js:107; scorecard/footprint-defs.js:26 |
| `enactive_encoding` | learns fine passively / learns mainly by doing | lesson text | -worked +generation +checks; no mechanism; practice.workedToPractice, practice.workedExamples, practice.tryItems, practice.predictBeforeReveal, explain.modes, +3 | learning-depth.js:278 |
| `generation_effect` | reading is as good as producing / much better when producing answers | lesson text, coach text | +generation +typed; no mechanism; practice.typedAnswers, practice.predictBeforeReveal, explain.modes, review.typedRecall, learning.retrieval.produce, +1 | learning-depth.js:277; [w] scorecard/index.js:1601; scorecard/translate.js:140 |
| `retention_index` | poor delayed recall / excellent delayed recall | **dead** | +reviewSpacing -reviewIntensity; 02-M50; review.spacingScale, review.targetRecall, review.reviewShare, review.firstReviewDays, learning.retrieval.cumulative, +7 | learning-depth.js:107; [w] scorecard/forgetting.js:48; [w] scorecard/index.js:1408; [w] scorecard/signals.js:421 |

### Failure response and resilience

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `failure_response` | disengages after errors / treats errors as fuel | lesson text, coach text | +mistakes -gentleness; no mechanism; practice.mistakeShown, feedback.tone.correction, depth.measures | onboarding/pool.js:94; onboarding/tasks.js:208; [w] scorecard/signals.js:107 |
| `error_recovery_speed` | needs several attempts to correct / corrects immediately | lesson text, coach text | -scaffold -hintSize +feedbackImmediacy; no mechanism; difficulty.supportShare, scaffolding.level, scaffolding.hintInChecks, scaffolding.hintsBeforeReveal, scaffolding.fade, +6 | learning-depth.js:107; onboarding/pool.js:58; onboarding/tasks.js:155; [w] scorecard/signals.js:108 |
| `frustration_threshold` | frustrates quickly / very patient | lesson text, coach text, structure, tutor plan | -scaffold +challenge -hintSize -gentleness; 03-M23; difficulty.stretchShare, difficulty.supportShare, scaffolding.level, scaffolding.hintInChecks, scaffolding.hintsBeforeReveal, +8 | adaptation.js:107; learning-depth.js:107; scorecard/contract.js:73; scorecard/indicators.js:50 |
| `hint_dependency` | rarely needs hints / relies on hints heavily | lesson text, coach text, tutor plan | +worked +generation -hintSize; 03-M30; scaffolding.hintsBeforeReveal, practice.workedToPractice, practice.workedExamples, practice.tryItems, practice.predictBeforeReveal, +9 | learning-depth.js:110; onboarding/pool.js:87; onboarding/tasks.js:195; scorecard/footprint-defs.js:27 |
| `help_seeking` | struggles silently / asks for help readily | lesson text, coach text, tutor plan | -checkFreq +autonomy; 03-M30; lesson.quickCheckEverySection, lesson.quickCheckEvery, lesson.retrievalChecks, lesson.checkEveryChunks, learning.retrieval.questions, +2 | efficiency.js:120; onboarding/pool.js:87; onboarding/tasks.js:195; scorecard/indicators.js:38 |
| `guessing_propensity` | only answers when sure / guesses freely | lesson text, coach text | +selfCheck +feedbackDetail +checks; no mechanism; practice.ratePrompt, feedback.nameTheError, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, +2 | learning-depth.js:110; [w] scorecard/signals.js:254 |
| `perfectionism` | fine with partial progress / needs everything perfect | lesson text, coach text | -pressure +warmth; no mechanism; feedback.tone.warmth, feedback.lowStakes, feedback.timers, depth.measures, depth.facts.measuredStrengths, +3 | learning-depth.js:111; scorecard/indicators.js:71; [w] scorecard/signals.js:57; content/basketball-grades.js:7076 |
| `productive_struggle` | needs rescue early / benefits from being left to struggle | lesson text, coach text, tutor plan | -hintSize -scaffold +challenge +generation; 03-M30; difficulty.stretchShare, difficulty.supportShare, scaffolding.level, scaffolding.hintLevel, scaffolding.hintSize, +7 | learning-depth.js:294; onboarding/pool.js:87; onboarding/tasks.js:195; scorecard/footprint-defs.js:23 |
| `confidence_calibration` | confidence does not match accuracy / confidence predicts accuracy | lesson text, coach text | -selfCheck; no mechanism; practice.ratePrompt, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, depth.facts.measuredIds.strengths, +1 | learning-depth.js:111; onboarding/pool.js:79; [w] scorecard/signals.js:248 |
| `error_driven_learning` | repeats the same mistakes / rarely repeats a corrected mistake | **dead** | -reviewIntensity -misconception; no mechanism; explain.misconception, review.targetRecall, review.reviewShare, learning.retrieval.cumulative, learning.spacing.earlierQuestion, +2 | [w] scorecard/signals.js:62 |

### Metacognition and self-regulation

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `self_monitoring` | does not know what they do not know / accurate self-assessment | lesson text, coach text | -selfCheck +autonomy -reflection; no mechanism; practice.ratePrompt, engagement.choices, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, +2 | learning-depth.js:108; onboarding/pool.js:79; scorecard/indicators.js:55; [w] scorecard/signals.js:249 |
| `strategy_awareness` | no study strategy / deliberately uses strategies | lesson text | +autonomy +planning; no mechanism; engagement.choices, meta.plan, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, +2 | learning-depth.js:108; scorecard/footprint-defs.js:24; scorecard/indicators.js:55 |
| `mastery_orientation` | wants the score or completion / wants real understanding | lesson text | +conceptual +depth -extrinsic; no mechanism; explain.modes, explain.conceptFirst, engagement.milestones, transfer.depth, depth.measures | onboarding/pool.js:109; scorecard/footprint-defs.js:21; scorecard/indicators.js:54; [w] scorecard/signals.js:701 |
| `autonomy_preference` | wants to be guided / wants to choose their own path | lesson text, coach text | +autonomy; no mechanism; engagement.choices, depth.measures | onboarding/pool.js:91; onboarding/tasks.js:202; scorecard/indicators.js:60 |
| `structure_need` | fine with open-ended tasks / needs clear steps and structure | lesson text, coach text | +structure; no mechanism; explain.modes, explain.numberedSteps, depth.measures | onboarding/pool.js:91; onboarding/tasks.js:203; scorecard/indicators.js:58; content/ipip-items.js:23 |
| `instruction_adherence` | skims directions / follows directions precisely | lesson text | +instructions; no mechanism; meta.oneShortAction, depth.measures | onboarding/pool.js:108; scorecard/footprint-defs.js:24; [w] scorecard/signals.js:77 |
| `reflection_depth` | shallow reflection / rich, specific reflection | **dead** | +reflection; no mechanism; meta.reflection, depth.measures | onboarding/pool.js:94; onboarding/tasks.js:208; scorecard/indicators.js:37; [w] scorecard/signals.js:793 |
| `question_generation` | never asks their own questions / constantly asks "what if" | lesson text, coach text | +questionPrompts; no mechanism; meta.questionPrompt, depth.measures | scorecard/footprint-defs.js:33; scorecard/indicators.js:38 |
| `self_efficacy` | believes they are "bad at this" / confident they can learn it | lesson text, coach text, tutor plan | -momentum -warmth -scaffold +challenge; 03-M31; difficulty.stretchShare, difficulty.supportShare, scaffolding.level, feedback.tone.warmth, engagement.challenge, +5 | learning-depth.js:108; onboarding/pool.js:79; scorecard/indicators.js:40; [w] scorecard/signals.js:91 |
| `planning_tendency` | dives straight in / plans an approach first | lesson text | +planning; no mechanism; meta.plan, depth.measures | onboarding/pool.js:87; onboarding/tasks.js:196; scorecard/footprint-defs.js:24; scorecard/indicators.js:58 |

### Communication and representation

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `step_explicitness` | skipped steps are fine / every step must be shown | lesson text, coach text, tutor plan | +scaffold +structure -chunk +worked; 03-M17; lesson.sections, lesson.chunkSentences, lesson.newIdeasPerChunk, difficulty.supportShare, scaffolding.level, +7 | learning-depth.js:294; onboarding/pool.js:100; [w] scorecard/index.js:1593; scorecard/indicators.js:64 |
| `worked_example_dependence` | learns from principles / needs full worked examples | lesson text, tutor plan, experiment | +worked +workedChain; 03-M17; practice.workedToPractice, practice.workedExamples, practice.tryItems, explain.modes, learning.fading.mode, +1 | learning-depth.js:280; onboarding/pool.js:98; personalize.js:143; scorecard/indicators.js:63 |
| `scaffolding_fade` | supports must be removed slowly / supports can be removed quickly | lesson text, structure | -scaffold -hintSize; 03-M17; difficulty.supportShare, scaffolding.level, scaffolding.hintInChecks, scaffolding.hintsBeforeReveal, scaffolding.fade, +2 | adaptation.js:103; learning-depth.js:280; scorecard/contract.js:69; [w] scorecard/index.js:507 |
| `notation_comfort` | formulas and symbols intimidate / comfortable with notation | lesson text, coach text | +notation +vocab; no mechanism; explain.notation, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, depth.facts.measuredIds.strengths, +1 | learning-depth.js:109; onboarding/pool.js:99; scorecard/item-tags.js:31; scorecard/translate.js:136 |
| `brevity_preference` | wants full detail / wants the shortest version | lesson text, coach text, structure, tutor plan, experiment | -length -feedbackDetail -courseSize; 03-M19; lesson.minutes, lesson.mistakes, lesson.wordBudget, lesson.retrievalChecks, explain.modes, +9 | adaptation.js:104; course-builder.js:658; learning-depth.js:289; onboarding/pool.js:100 |
| `repetition_tolerance` | bored by restating / benefits from restating | lesson text | +repetition; no mechanism; lesson.restate, depth.measures | efficiency.js:120; onboarding/pool.js:100; [w] scorecard/signals.js:774 |
| `feedback_granularity` | "right or wrong" is enough / wants a detailed breakdown | lesson text, coach text | +feedbackDetail; 02-M45; feedback.granularity, feedback.nameTheError, depth.measures | [w] scorecard/index.js:1600 |
| `feedback_tone_sensitivity` | handles blunt correction / needs gentle framing | lesson text, coach text, tutor plan, experiment | +gentleness +warmth; 02-M45; feedback.tone.warmth, feedback.tone.correction, depth.measures | personalize.js:191; tutor-learner-model.js:90; tutor-plan.js:57 |
| `open_response_performance` | much better on multiple choice / strong on open-ended answers | **dead** | +typed +creative; no mechanism; practice.typedAnswers, review.typedRecall, learning.retrieval.produce, depth.measures, depth.facts.measuredStrengths, +3 | learning-depth.js:109; [w] scorecard/signals.js:592 |
| `dialogic_preference` | prefers being told / prefers a Socratic back-and-forth | lesson text, coach text, tutor plan, experiment | +dialogic; no mechanism; explain.modes, engagement.dialogue, depth.measures | personalize.js:149; scorecard/indicators.js:37; scorecard/translate.js:138; tutor-evidence.js:23 |

### Motivation and affect

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `intrinsic_motivation` | needs outside reasons / learns for its own sake | lesson text | -extrinsic -relevance +autonomy; no mechanism; engagement.milestones, depth.measures | onboarding/pool.js:91; onboarding/tasks.js:201; scorecard/drift.js:35; scorecard/footprint-defs.js:21 |
| `extrinsic_reward_sensitivity` | rewards do not matter / rewards strongly drive effort | **dead** | +extrinsic +gamification; no mechanism; engagement.gamification, engagement.milestones, depth.measures | onboarding/pool.js:109; scorecard/footprint-defs.js:35; scorecard/indicators.js:62 |
| `competitive_drive` | indifferent to comparison / motivated by beating benchmarks | lesson text | +competition; no mechanism; engagement.competition, depth.measures | onboarding/pool.js:91; onboarding/tasks.js:201; scorecard/footprint-defs.js:29; scorecard/indicators.js:61 |
| `praise_sensitivity` | praise has no effect / praise noticeably boosts effort | lesson text, coach text, tutor plan, experiment | +praise +warmth; no mechanism; feedback.tone.warmth, feedback.tone.praise, depth.measures | personalize.js:194; scorecard/footprint-defs.js:35; scorecard/indicators.js:93; tutor-learner-model.js:90 |
| `evaluation_anxiety` | calm on quizzes / performance drops when "tested" | lesson text, coach text | -pressure +gentleness -diffRamp +warmup; 02-M29; lesson.warmupItems, difficulty.ramp, difficulty.rampLabel, feedback.tone.correction, feedback.lowStakes, +6 | learning-depth.js:109; scorecard/drift.js:35; scorecard/indicators.js:40; tutor-learner-model.js:91 |
| `boredom_susceptibility` | tolerates dry content / disengages fast when bored | lesson text | +novelty +pace +curiosity -length; no mechanism; lesson.minutes, lesson.mistakes, lesson.wordBudget, lesson.pace, lesson.hook, +10 | learning-depth.js:110; scorecard/drift.js:35; scorecard/footprint-defs.js:32; scorecard/indicators.js:53 |
| `persistence` | quits on hard tasks / pushes through | lesson text, coach text, structure | +length -momentum +sessionLen; 03-M25; lesson.minutes, lesson.mistakes, lesson.wordBudget, explain.modes, session.minutes, +10 | adaptation.js:108; catchup-engine.js:8; learning-depth.js:108; onboarding/pool.js:94 |
| `social_framing` | people in examples do not matter / characters strongly engage | lesson text, experiment | +social; no mechanism; interests.people, depth.measures | onboarding/pool.js:107; personalize.js:197; scorecard/footprint-defs.js:29; scorecard/indicators.js:92 |
| `identity_alignment` | "people like you" framing does nothing / identity framing is strongly motivating | lesson text | +identity; no mechanism; interests.identity, depth.measures | onboarding/pool.js:94; onboarding/tasks.js:207; scorecard/footprint-defs.js:34; scorecard/indicators.js:57 |
| `emotional_engagement` | emotional stakes do not affect recall / emotional stakes boost recall | lesson text, experiment | +emotion; no mechanism; explain.modes, engagement.emotionalStakes, depth.measures | onboarding/pool.js:94; onboarding/tasks.js:207; personalize.js:200; scorecard/drift.js:35 |

### Transfer and mastery

| Metric | Meaning (low / high) | Before | Spec: levers, evidence, fields moved | Readers |
|---|---|---|---|---|
| `near_transfer` | cannot apply to slightly different problems / applies easily to variations | lesson text | +transfer +diffRamp; no mechanism; difficulty.ramp, transfer.variedCases, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, +2 | learning-depth.js:108; onboarding/pool.js:67; scorecard/item-tags.js:29 |
| `far_transfer` | knowledge stays in context / applies it across domains | lesson text | +transfer +integration; no mechanism; transfer.variedCases, learning.retrieval.cumulative, learning.spacing.earlierQuestion, depth.measures, depth.facts.measuredStrengths, +3 | learning-depth.js:108; onboarding/pool.js:65; scorecard/indicators.js:56; scorecard/item-tags.js:30 |
| `application_orientation` | likes theory / wants practical use | lesson text | +application; no mechanism; lesson.whyItMatters, explain.modes, transfer.application, depth.measures | onboarding/pool.js:105; scorecard/indicators.js:57 |
| `conceptual_bias` | learns the "how" (procedures) best / learns the "why" (concepts) best | lesson text, coach text | +conceptual; no mechanism; explain.modes, explain.conceptFirst, depth.measures | onboarding/pool.js:67; onboarding/tasks.js:195; scorecard/footprint-defs.js:28; scorecard/indicators.js:39 |
| `prior_knowledge` | little background in this subject / strong background in this subject | lesson text, coach text, structure | +diffStart -scaffold -worked -length +vocab; 03-M17; lesson.minutes, lesson.mistakes, lesson.wordBudget, difficulty.startOffset, difficulty.supportShare, +19 | adaptation.js:102; learning-depth.js:109; scorecard/contract.js:68; [w] scorecard/index.js:434 |
| `misconception_persistence` | corrections stick / wrong beliefs keep coming back | lesson text, coach text | +misconception; 03-M32; explain.misconception, depth.measures, depth.facts.measuredStrengths, depth.facts.measuredDifficulties, depth.facts.measuredIds.strengths, +1 | learning-depth.js:110; onboarding/pool.js:108; [w] scorecard/signals.js:61 |
| `integration_tendency` | treats each level separately / connects to past levels | lesson text | +integration; no mechanism; transfer.linkEarlier, learning.retrieval.cumulative, learning.spacing.earlierQuestion, depth.measures | learning-depth.js:284; onboarding/pool.js:66; onboarding/tasks.js:207; scorecard/footprint-defs.js:30 |
| `depth_breadth` | wants a wide overview / wants deep dives | lesson text | +depth; no mechanism; transfer.depth, depth.measures | onboarding/pool.js:91; onboarding/tasks.js:201; scorecard/footprint-defs.js:36; [w] scorecard/signals.js:760 |
| `creative_extension` | wants defined tasks / loves open, creative extensions | lesson text | +creative; no mechanism; transfer.creativeExtension, depth.measures | scorecard/footprint-defs.js:30; scorecard/indicators.js:59; content/ipip-items.js:37 |
| `mastery_velocity` | slow improvement across levels / rapid improvement across levels | lesson text | +pace +diffRamp -reviewIntensity; no mechanism; lesson.wordBudget, lesson.pace, difficulty.ramp, difficulty.rampLabel, review.targetRecall, +9 | efficiency.js:230; learning-depth.js:109; [w] scorecard/index.js:1274; [w] scorecard/signals.js:428 |

## What the spec fields are read by

Each spec group, its fields, and whether a generator reads the field in code (`code`) or only through the prompt sentence it selects (`prompt`). Prompt sentences are chosen in `specToPrompt` from the lever leans, so every lever with a phrase reaches every writer that adds the block.

| Field | Read in code by | Moved by metrics |
|---|---|---|
| `learner.readingGrade` | prompt only | 0 |
| `learner.ageBand` | prompt only | 0 |
| `learner.esl` | tutor-learner-model.js | 0 |
| `lesson.minutes` | block-adapt.js | 6 |
| `lesson.sections` | prompt only | 7 |
| `lesson.chunkSentences` | material-notes.js, material-pack.js, tutor-plan.js | 7 |
| `lesson.mistakes` | ai.js | 5 |
| `lesson.quickCheckEverySection` | prompt only | 2 |
| `lesson.quickCheckEvery` | prompt only | 2 |
| `lesson.wordBudget` | prompt only | 10 |
| `lesson.newIdeasPerChunk` | prompt only | 4 |
| `lesson.maxNewTerms` | prompt only | 3 |
| `lesson.pace` | learner-path.js, material-test.js, tutor-plan.js | 4 |
| `lesson.restate` | prompt only | 2 |
| `lesson.retrievalChecks` | ai.js, block-adapt.js, material-adapt.js, material-pack.js | 5 |
| `lesson.checkEveryChunks` | material-podcast.js | 2 |
| `lesson.warmupItems` | block-adapt.js, material-test.js | 3 |
| `lesson.recapAtStart` | prompt only | 2 |
| `lesson.recapAtEnd` | prompt only | 1 |
| `lesson.hook` | prompt only | 3 |
| `lesson.storyFrame` | prompt only | 1 |
| `lesson.whyItMatters` | prompt only | 2 |
| `lesson.bigPictureFirst` | prompt only | 1 |
| `difficulty.startOffset` | material-test.js | 3 |
| `difficulty.ramp` | prompt only | 4 |
| `difficulty.rampLabel` | prompt only | 3 |
| `difficulty.stretchShare` | adaptation.js | 4 |
| `difficulty.supportShare` | adaptation.js | 9 |
| `scaffolding.level` | block-adapt.js, material-path.js | 8 |
| `scaffolding.hintLevel` | tutor-plan.js | 1 |
| `scaffolding.hintSize` | prompt only | 1 |
| `scaffolding.hintInChecks` | block-adapt.js | 6 |
| `scaffolding.hintsBeforeReveal` | prompt only | 5 |
| `scaffolding.fade` | prompt only | 6 |
| `practice.workedToPractice` | prompt only | 5 |
| `practice.workedExamples` | block-adapt.js | 5 |
| `practice.tryItems` | prompt only | 5 |
| `practice.examplesPerIdea` | prompt only | 1 |
| `practice.typedAnswers` | adaptation.js, block-adapt.js | 3 |
| `practice.predictBeforeReveal` | prompt only | 5 |
| `practice.selfExplain` | prompt only | 1 |
| `practice.mistakeShown` | prompt only | 1 |
| `practice.ratePrompt` | prompt only | 3 |
| `explain.modes` | tutor-plan.js | 32 |
| `explain.order` | prompt only | 3 |
| `explain.analogy` | prompt only | 1 |
| `explain.visual` | prompt only | 1 |
| `explain.textDensity` | material-grounding.js | 1 |
| `explain.paragraphSentences` | prompt only | 1 |
| `explain.rigor` | prompt only | 1 |
| `explain.conceptFirst` | prompt only | 2 |
| `explain.misconception` | block-adapt.js | 3 |
| `explain.contrastLookalikes` | block-adapt.js | 1 |
| `explain.numberedSteps` | block-adapt.js | 4 |
| `explain.patternPointedOut` | prompt only | 1 |
| `explain.notation` | block-adapt.js | 1 |
| `language.vocabularyGrade` | tutor-learner-model.js, tutor-plan.js | 2 |
| `language.maxSentenceWords` | prompt only | 1 |
| `language.defineTerms` | prompt only | 1 |
| `language.plainLanguage` | tutor-learner-model.js, tutor-plan.js | 2 |
| `language.avoidIdioms` | block-adapt.js | 0 |
| `language.eslSupport` | block-adapt.js | 0 |
| `interests.exampleDomains` | block-adapt.js | 0 |
| `interests.avoidDomains` | prompt only | 0 |
| `interests.share` | block-adapt.js | 1 |
| `interests.people` | prompt only | 1 |
| `interests.identity` | prompt only | 1 |
| `review.spacingScale` | adaptation.js, material-path.js | 3 |
| `review.targetRecall` | adaptation.js, material-path.js | 5 |
| `review.reviewShare` | adaptation.js | 5 |
| `review.interleaving` | prompt only | 2 |
| `review.firstReviewDays` | prompt only | 2 |
| `review.typedRecall` | prompt only | 3 |
| `feedback.granularity` | prompt only | 2 |
| `feedback.timing` | prompt only | 1 |
| `feedback.nameTheError` | prompt only | 3 |
| `feedback.tone.warmth` | prompt only | 4 |
| `feedback.tone.formality` | prompt only | 1 |
| `feedback.tone.humor` | tutor-plan.js | 1 |
| `feedback.tone.praise` | prompt only | 1 |
| `feedback.tone.correction` | tutor-plan.js | 4 |
| `feedback.lowStakes` | tutor-plan.js | 3 |
| `feedback.timers` | material-test.js | 3 |
| `session.minutes` | adaptation.js | 4 |
| `session.breakEveryMinutes` | prompt only | 4 |
| `session.breakMinutes` | prompt only | 2 |
| `session.items` | adaptation.js, material-test.js | 4 |
| `session.hardestFirst` | prompt only | 1 |
| `course.skillShare` | course-builder.js | 1 |
| `course.testScale` | material-test.js | 1 |
| `engagement.challenge` | prompt only | 4 |
| `engagement.novelty` | prompt only | 3 |
| `engagement.gamification` | prompt only | 2 |
| `engagement.competition` | prompt only | 1 |
| `engagement.milestones` | prompt only | 3 |
| `engagement.choices` | prompt only | 3 |
| `engagement.emotionalStakes` | prompt only | 1 |
| `engagement.dialogue` | prompt only | 1 |
| `transfer.variedCases` | prompt only | 2 |
| `transfer.application` | prompt only | 3 |
| `transfer.depth` | prompt only | 2 |
| `transfer.creativeExtension` | prompt only | 1 |
| `transfer.linkEarlier` | prompt only | 1 |
| `transfer.connections` | prompt only | 1 |
| `meta.reflection` | prompt only | 1 |
| `meta.plan` | prompt only | 2 |
| `meta.questionPrompt` | prompt only | 1 |
| `meta.spotTheInconsistency` | prompt only | 1 |
| `meta.oneShortAction` | prompt only | 1 |
| `learning.retrieval.questions` | block-adapt.js | 5 |
| `learning.retrieval.spread` | prompt only | 2 |
| `learning.retrieval.fromMemory` | prompt only | 0 |
| `learning.retrieval.produce` | prompt only | 6 |
| `learning.retrieval.cumulative` | prompt only | 10 |
| `learning.fading.mode` | prompt only | 4 |
| `learning.order` | prompt only | 3 |
| `learning.spacing.earlierQuestion` | prompt only | 11 |
| `learning.spacing.lookalike` | prompt only | 2 |
| `learning.spacing.tomorrowLine` | prompt only | 5 |
| `learning.gapOnly.on` | prompt only | 1 |
| `learning.gapOnly.strong` | prompt only | 1 |
| `learning.dualCoding.on` | block-adapt.js | 1 |
| `learning.dualCoding.strength` | prompt only | 2 |
| `learning.dualCoding.forms` | prompt only | 2 |
| `learning.length.words` | prompt only | 10 |
| `learning.length.minutes` | prompt only | 6 |
| `learning.length.compact` | prompt only | 5 |
| `learning.measures.retrieval` | prompt only | 0 |
| `learning.measures.fading` | prompt only | 0 |
| `learning.measures.order` | prompt only | 0 |
| `learning.measures.spacing` | prompt only | 0 |
| `learning.measures.gapOnly` | prompt only | 0 |
| `learning.measures.dualCoding` | prompt only | 0 |
| `learning.measures.length` | prompt only | 0 |
| `depth.measures` | prompt only | 100 |
| `depth.facts.difficulties` | prompt only | 0 |
| `depth.facts.strengths` | prompt only | 0 |
| `depth.facts.worked` | prompt only | 0 |
| `depth.facts.goals` | prompt only | 0 |
| `depth.facts.studying` | prompt only | 0 |
| `depth.facts.measuredStrengths` | prompt only | 39 |
| `depth.facts.measuredDifficulties` | prompt only | 39 |
| `depth.facts.measuredIds.strengths` | prompt only | 39 |
| `depth.facts.measuredIds.difficulties` | prompt only | 39 |
| `depth.joint` | prompt only | 1 |
| `aversions` | prompt only | 0 |
| `aversionNotes` | prompt only | 0 |
| `ownerBase` | prompt only | 0 |

## Context that is not on the scorecard

| Rule | Reads | What it does |
|---|---|---|
| `age_young` | age <= 11 | Young learners: short sentences, plain words, small chunks, warm tone, short sessions. |
| `age_child_under_9` | age <= 8 | Under 9: one idea per piece, concrete first, story or play framing. |
| `age_adult` | age >= 22 | Adults: no talking down, a practical why, a more formal register. |
| `age_older_adult` | age >= 55 | Older adults: unhurried pace, larger structure cues, no jargon without a definition. |
| `esl` | English is not their first language | Plain syntax, no idioms, uncommon words defined, short sentences, visual support, repeat the key term. |
| `reading_support` | the context says they need reading support | Short lines, short sentences, spaced layout, no dense paragraphs, plain words. |
| `device_phone` | phone-only, short sessions | Short sessions, small chunks, no wide tables, an easy way to stop and resume. |
| `device_desk` | long desk sessions | Longer sessions are fine; tables and diagrams in plain text are fine. |
| `topic_mastery_low` | mastery on the topic's skills < 0.35 after 3+ answers | New or weak on this topic: worked examples, support, a lower start, smaller chunks. |
| `topic_mastery_high` | mastery on the topic's skills >= 0.75 after 5+ answers | Already strong here: problems first, less support, higher start, shorter explanation. |
| `goal_essentials` | goal: just the essentials, fast | Fewest activities that still cover the objective. |
| `goal_deep` | goal: learn it as deeply as possible | Explain why each rule holds, include a harder or edge case. |
| `goal_test` | goal: prepare for a test | Exam-style wording, quick recall of earlier points, name the traps. |
| `goal_conversation` | goal: everyday conversation | Frequent words and set phrases, heard and used, over rare vocabulary and terminology. |
| `aversion_math` | dislikes maths and the topic is numeric | Low stakes, smaller steps, a real-life hook, warm tone, and no quantity of symbols up front. |
| `aversion_reading` | dislikes reading | Less text: short paragraphs, plain words, spaced layout, a picture-in-text where it helps. |
| `aversion_writing` | dislikes writing | Choice answers where the objective allows; keep written answers short. |
| `aversion_tests` | dislikes tests, quizzes or being timed | Low stakes: no test language, no timers, gentle correction. |
| `aversion_repetition` | dislikes repetition, busywork or slow explanation | Say it once and keep moving: brisk, no restating, shorter. |

Interests and hobbies (the about-you survey, tutor facts, solid learner-record facts) become example domains; dislikes (the record, the survey notes, an explicit dislikes field) become avoided domains; a dislike of the subject itself becomes an aversion that lowers the stakes and shrinks the first step.
