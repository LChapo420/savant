# Learning scorecard: accuracy and token-efficiency research

2026-10-22. Scope: `services/scorecard/*`, the places that use it (`personalize.js`, `details.js`,
`learner-record.js`, `level-editor.js`, `block-levels.js`, `mastery.js`), `docs/SCORECARD.md` and
`docs/PRODUCT-DECISIONS.md`. Nothing in the code was changed. The simulation numbers below come from a
standalone copy of the arithmetic in `services/scorecard/index.js` (the `applyTo` and `shift` functions,
copied exactly), run on synthetic data.

## Evidence labels used in this report

| Label | Meaning |
| --- | --- |
| **[Strong]** | Replicated, with meta-analyses behind it |
| **[Moderate]** | Several controlled studies, or a meta-analysis with large heterogeneity or some disputed moderators |
| **[Contested]** | Published evidence points both ways, or the main meta-analyses disagree |
| **[Weak]** | Little or no controlled evidence that matching instruction to this improves learning |
| **[Theory]** | A plausible mechanism with no direct test |
| **[Code]** | Read directly from this repository |
| **[Sim]** | Measured by simulating this repository's update rule |
| **[Estimate]** | My own arithmetic. The assumptions are stated next to it |

## Summary

1. **Most of the 100 stats cannot be identified from what the app collects.** 42 stats have no
   rule-based signal at all. They move only through the after-level LLM read **[Code]**. The docs
   say this is true of two. In simulation, a model that keeps suggesting the same direction pushes a
   stat past the directive threshold in 11 to 20 levels, with 50% confidence, without any behavioural
   evidence **[Sim]**.
2. **Several of the signals that do exist are biased by construction.** Some fire in only one
   direction: hint dependency, misconception persistence, consolidation need, mastery velocity. These
   stats climb toward a fixed value however rarely the event happens. A learner who used the coach 24
   times, ever, gets the "relies on hints heavily" directive **[Sim]**. Decay rate ignores the review
   interval, so the review schedule moves it more than the learner's memory does **[Sim]**. The
   within-learner experiments cannot reach the directive threshold even when the true effect is 20
   percentage points **[Sim]**.
3. **The evidence supports personalizing a few things.** These are knowledge level per skill
   (expertise reversal) **[Strong/Moderate]**, the review schedule from each learner's forgetting
   **[Strong]**, reading level, length and pace (operational constraints), interest-based contexts
   **[Moderate]**, and specific misconceptions. Most other stats are either techniques that help
   everyone (retrieval practice, self-explanation, worked examples for novices), which belong in the
   default lesson template, or unsupported "preferences". **Recommendation: about 12 measured
   constructs, with 6 or 7 of them able to produce lesson directives.**
4. **Accuracy comes from proper measurement models, not hand-set values and weights.** That means
   item-calibrated ability (Elo/IRT), a forgetting model (half-life regression or FSRS), rapid-guess
   detection by response-time norms, and hierarchical estimates of treatment effects. Confidence
   should be a posterior uncertainty, and evidence should decay with time, not with each update.
5. **Tokens.** The scorecard's direct cost per level is roughly 5,000 input tokens today, mostly the
   100-stat guide in every after-level read. It could be roughly 500–800 **[Estimate]**. The much
   larger lever is not rewriting a lesson when nothing confident says how it should differ. A
   tailored lesson costs a full page generation plus the fact-check pipeline, which the product doc
   puts at $0.47–1.86 per lesson. Sharing one verified lesson among learners with the same bands
   (cohort caching) is the same lever.

---

## 1. The current design: what it gets right, and where it is weakest

### 1.1 What it gets right

- **Behaviour over self-report, with learning styles explicitly rejected.** This matches the
  evidence. Pashler et al. (2008) found no adequate evidence for the "meshing" hypothesis and
  several well-designed tests that contradict it **[Strong]**.
- **Numbers never reach the writer.** `translate.js` turns scores into hand-written, concrete
  instructions and resolves known conflicts. That is the right shape: an LLM handed
  "deductive_trajectory: 73" has to guess what to do.
- **There is a holdout and there are experiments.** Ten percent of levels are served the shared page
  (`PERSONALIZE_HOLDOUT`), and the arms are assigned by hash. This is the only way to learn whether
  tailoring helps, and few products build it in.
- **Confidence gating, capped steps, logged sources.** The ideas are right: a single session cannot
  redefine anyone, and every move can be explained. Section 1.3 covers the arithmetic.
- **Delayed recall is treated as the cleanest outcome.** That matches the memory literature: spacing
  and retrieval effects are judged on delayed tests (Cepeda et al. 2006; Dunlosky et al. 2013)
  **[Strong]**.
- **Per-subject records for knowledge-like stats.** Being advanced in one subject says little about
  another.

### 1.2 Identifiability: which stats the app can actually measure

I counted every stat referenced in `signals.js` (behaviour), `personalize.js` (experiments) and
`index.js` (the questionnaire) **[Code]**:

| Evidence source | Stats | Examples |
| --- | --- | --- |
| Behavioural rule in `signals.js` | 41 | rush_tendency, decay_rate, failure_response, confidence_calibration |
| Experiment arm in `personalize.js` | 11 | inductive_trajectory, analogical_transfer, narrative_pull, brevity_preference |
| Questionnaire seed only, plus the LLM read | a few (e.g. chunk_granularity, spatial_anchoring, elaboration_benefit, generation_effect, productive_struggle) | |
| **LLM after-level read only** | **42** | working_memory_span, vocabulary_ceiling, cognitive_flexibility, logical_rigor, systems_thinking, notation_comfort, evaluation_anxiety, praise_sensitivity, near/far transfer, conceptual_bias, structure_need ... |

`docs/SCORECARD.md` says that "two (gamification response, extrinsic reward sensitivity) have no
direct signal yet". In the code it is 42.

Even among the 41 with a behavioural rule, the evidence often does not separate the trait from
something else:

| Stat | What the signal actually measures | Main confound |
| --- | --- | --- |
| failure_response, error_recovery_speed | Accuracy on the item right after a miss | Ability. A learner who misses is, on average, weaker on that skill now, and items on the same skill come in clusters. Raw post-error accuracy is lower for everyone. |
| fatigue_curve | First-half against second-half accuracy | Order of difficulty inside the level. If later items are harder (stretch after focus), everyone "fatigues". |
| warmup_latency, momentum_dependence | Opening items against the rest | Item order and ability, as above |
| intake_baseline | A long lesson whose checks held, or a short one whose checks failed | Prior knowledge and difficulty of the content |
| processing_velocity | Time against `expectedMs` (200 wpm + 4 s + 1.5 s × difficulty) | The constants are uncalibrated. Average adult silent reading of non-fiction is about 238 wpm, with a 175–300 range (Brysbaert 2019), and children read slower. Difficulty labels are hand-set. |
| interleaving_tolerance | Review against focus accuracy in the same level | Review items are older, more practised skills. The benefit of interleaving shows on later tests, and practice performance under interleaving is often worse (Dunlosky et al. 2013; Brunmair & Richter 2019). The signal measures the wrong thing. |
| reentry_cost | First block after 3+ days against the learner's usual session score | Forgetting (which is decay_rate) and the difficulty of the new material |
| decay_rate, retention_index, retrieval_strength | Whether a due review was right | **The interval.** Recall after 1 day and after 35 days differ hugely. In simulation, two learners with identical memory but different schedules end at 33 and 46, both at 90% confidence **[Sim]**. |
| confidence_calibration, self_monitoring | "Sure + right" scores 80; "sure + wrong" scores 15 | **Ability.** Calibration is the relationship between confidence and correctness across items (resolution). A strong learner who always taps "Sure" has zero resolution but scores high. |
| guessing_propensity | Tapping "Guessing" scores 70 | Honesty. A well-calibrated learner who admits a guess is labelled guess-prone. |
| mastery_velocity | 3+ levels in one sitting | Time on task, not rate of learning |
| open_response / recognition_recall_gap | Typed against multiple-choice accuracy in a level | Recall is harder than recognition for everyone, so the gap needs comparing with the population gap. |
| reflection_depth | Feedback longer than 60 characters | Typing habit, device |

### 1.3 The update rule: where it over- and under-reacts

`applyTo` in `index.js` moves a score toward a weighted value: prior mass `w + 1`, a step cap of 15,
mass decayed ×0.97 *on each update of that stat*, mass capped at 8, and confidence
`1 − exp(−mass/3)`. The simulations below copy that code exactly **[Sim]**.

**a. One-sided signals drift to a constant (over-reaction).** Many rules only ever emit one value.
For example, coach use gives hint_dependency 75, and nothing ever lowers it. Decay only happens when
that stat is updated, so the score walks to the emitted value whatever the event rate:

| Stat (only signal) | Events until the directive fires | After 60 events |
| --- | --- | --- |
| hint_dependency (coach used → 75, w 0.15) | 24 | 74, 75% sure |
| misconception_persistence (repeated tag → 78, w 0.25) | 10 | 77, 90% sure |
| mastery_velocity (3+ levels in a sitting → 75) | 24 | 74, 75% sure |
| consolidation_need (scroll-backs → 70) | never fires (sits at 69, just under the edge) | 69, 75% sure |

Other rules with a single direction: perfectionism (65 only), deliberation_depth (high only),
guessing_propensity (high only), frustration_threshold and persistence (low only),
instruction_adherence, text_density_tolerance, repetition_tolerance and depth_breadth (one value
each). Over months, these stats record "has this ever happened" rather than "how often".

**b. Per-update decay mixes up "how much" and "how often".** A stat fed only by weight-0.03
observations reaches an equilibrium mass of 1.0, which is 28% confidence. It can never cross the 30%
gate, however long the record. Rush tendency is one. A learner who never rushes sits at 30 with 28%
confidence. With a 20% fast-and-wrong rate, the score is 67, still under the 70 edge **[Sim]**. A stat
updated on every answer forgets its history within days, while one updated rarely keeps evidence for
months. Time-based decay would treat them alike.

**c. Experiments are close to powerless (under-reaction).** An experiment turns next-level accuracy
into the value `50 ± 120 × (acc − baseline)` at weight 0.45. Each arm sits only half the effect
away from the baseline, so the expected value for a true effect *e* is `50 + 60e`. To reach the
70 edge, a teaching choice would have to change next-level accuracy by about 33 points. Results
for an 8-item next level at p = 0.7 **[Sim]**:

| True effect on next-level accuracy | Experiments | Mean score | Directive fires |
| --- | --- | --- | --- |
| 0 | 30 | 50.1 | 0.0% |
| 5 pp | 30 | 52.8 | 0.0% |
| 10 pp | 30 | 55.6 | 0.0% |
| 20 pp | 10 | 59.8 | 1.9% |

False positives are well controlled, which is good, but a real effect is almost never acted on.
Each of the 11 experiment stats also gets only about 3% of levels (35% experiment rate ÷ 11 stats,
after the holdout), so 30 experiments on one stat takes about a thousand levels.
`delayedExperimentOutcome` adds one review item per credit, at ±20 points and weight 0.3: Bernoulli
noise that is far larger than any plausible effect.

**d. The LLM path is the most powerful path, and the least validated.** `shift` adds mass
`0.1 + |d|/25` per one-point move. A model that keeps suggesting the same direction moves a stat
like this **[Sim]**:

| Reads (levels) | Score | Confidence |
| --- | --- | --- |
| 10 small suggestions | 60 | 34% |
| 11 large (≥15) suggestions | 78 (the big-move rule fires) | 50% |
| 20 small suggestions | 70: the directive fires | 51% |

The "one point per read" rule slows the drift but does not validate it. Three things make the model's
suggestions correlated rather than independent:
- **Anchoring.** The prompt shows the current score and confidence for every stat
  (`statGuide`: "Now 63 (41% sure)").
- **A self-confirming loop.** The model reads the level *content*, which was written to follow the
  current directives. A short lesson that went fine reads as "brevity works", so brevity goes up,
  the next lesson is shorter, and so on. Without a counterfactual this is not evidence.
- **Trend protection.** `establishedDirection` turns a disagreement with the recent direction into a
  recommendation instead of a change, which locks in early drift.

Mass from opinions also counts toward confidence exactly like measured evidence.

**e. Priors and blending.**
- The population prior averages only learners who are ≥50% confident on a stat. These are the
  learners with frequent or extreme events, which is a selected sample.
- The prior gives a starting value but no uncertainty: the prior mass is always 1, whatever the
  spread in the population.
- For per-subject stats, `read()` reports `max(subject mass, overall mass)` as the confidence. A
  learner's first Spanish lesson can show 93% confidence in prior_knowledge because their maths
  record is full.
- The overall prior_knowledge record averages placements across subjects, which has no meaning.

**f. Self-report weights differ from the docs.** The docs say a self-report weighs 0.05–0.25. The
questionnaire seeds with weight 0.6 (`seedFromStyleQuiz`). One questionnaire answer also feeds
two stats that are really one dimension: explanation_depth feeds both step_explicitness and
brevity_preference, and example_order feeds both inductive and deductive trajectory. Self-reports
about *what teaches you best* deserve low trust: in Deslauriers et al. (2019), students who learned
more in active classes *felt* they learned less **[Moderate]**. Taps about length and pace, which
concern comfort rather than effectiveness, are a fairer use of self-report.

**g. Duplicate and conflicting channels into the writer.** `details.brief()` contains an older
"HOW THEY ARE BEST TAUGHT" section (stated and observed style vector) *as well as* the scorecard
directives. The level-editor task text also says "Every worked example ... should be about something
they said they care about ... do not skip it", unconditionally. That overrides the interest_transfer
stat's low side ("Do not force their interests into the lesson"). With up to 22 directives as well,
the writer gets several overlapping, partly conflicting instruction sources.

### 1.4 Content difficulty against learner trait: the central confound

Almost every accuracy-based signal compares raw accuracy across items, levels or halves of a level
whose difficulty differs. The fix is the same for all of them: **predict each response from a
calibrated item difficulty and the learner's current skill (an Elo/IRT model), and use the residual
as evidence** (observed minus expected). Fatigue is a negative residual trend within a session.
Failure response is the residual on the item after an error. Intake is the residual on checks after
long lessons. Pelánek (2016) shows that Elo-style estimation of student skill and item difficulty is
simple and robust enough for adaptive systems **[Moderate]**. `mastery.js` already records
`difficulty`, `latency_ms` and correctness per event in `events`, which is enough to calibrate it.

A second reason residuals matter is the "reliability paradox" (Hedge et al. 2018). Effects that are
robust at the group level, such as the testing, generation and spacing effects, are often *poor*
measures of individual differences, because people differ little in them **[Strong, for the
cognitive tasks studied]**. Whether it holds for this app's signals is unknown, and should be
measured (section 3.4) rather than assumed.

---

## 2. Which stats to keep, label, merge or drop

### 2.1 The principle

Personalization only pays when the *best* teaching choice differs between people: an interaction
between learner and treatment. Cronbach and Snow's review of aptitude–treatment interactions (1977)
concluded that such interactions are common, but few are well understood and none were then ready for
instructional use (Snow 1977) **[Contested/Weak in general]**. The clearest exception since then is
**prior knowledge**. The expertise-reversal effect is that guidance which helps novices (worked
examples, every step shown, integrated explanations) loses its benefit, or reverses, as task expertise
grows (Kalyuga 2007; Kalyuga, Rikers & Paas 2012) **[Strong/Moderate]**.

So each stat falls into one of five buckets:

- **KEEP**: a measurable difference that changes the best lesson.
- **BAKE**: a technique that helps nearly everyone. It goes into the default lesson template for all
  learners and costs no per-learner tokens.
- **MERGE**: redundant with another stat. It folds into one construct.
- **EXPERIMENT-ONLY**: a contested preference. No directive until the hierarchical experiment (3.3)
  shows real differences between learners.
- **DROP**, or profile-only: no evidence that matching helps, and no reliable signal.

### 2.2 Evidence for the techniques behind the stats

| Technique | Evidence | Personalize or bake? |
| --- | --- | --- |
| Retrieval practice (testing effect) | g ≈ 0.50 (Rowland 2014); g ≈ 0.61 (Adesope et al. 2017) **[Strong]** | Bake: helps nearly everyone |
| Spacing / distributed practice | Optimal gap grows with the retention interval (Cepeda et al. 2006); rated "high utility" (Dunlosky et al. 2013) **[Strong]** | Personalize the **schedule**: Lindsey et al. (2014) found that personalized review gave +16.5% retention against massed study and +10% against one-size-fits-all spacing **[Moderate–Strong]** |
| Self-explanation prompts | g = 0.55 (Bisra et al. 2018) **[Strong]** | Bake |
| Generation | d ≈ 0.40 (Bertsch et al. 2007) **[Strong]** | Bake ("predict the next step" for everyone above novice) |
| Worked examples | g ≈ 0.48 in maths (Barbieri et al. 2023, with large heterogeneity); reverses with expertise (Kalyuga 2007) **[Strong/Moderate]** | Personalize **by expertise band**, per skill |
| Concreteness fading | Concrete first, then fade to abstract (Fyfe et al. 2014) **[Moderate]** | Bake the order; the speed of fading follows the expertise band |
| Segmenting | Small-to-medium benefits on retention and transfer (Rey et al. 2019) **[Moderate–Strong]** | Bake. Segment length can follow the length budget |
| Interleaving | g = 0.42 overall, larger when categories are similar (Brunmair & Richter 2019) **[Moderate]** | Bake into review mixing, not lesson text |
| Seductive details (interesting but irrelevant stories, jokes) | g ≈ −0.33 (Sundararajan & Adesope 2020) **[Moderate]** | Bake a "no irrelevant decoration" rule. This argues *against* narrative, humour and emotional-stakes directives unless the story *is* the content |
| Interest-based contexts (structure kept, context swapped) | Gains in writing algebraic expressions, larger for low achievers, persisting after personalization was removed (Walkington 2013); triggered situational interest drove outcomes (Bernacki & Walkington 2018) **[Moderate]** | **Keep**, as an experiment-validated, relevant-context-only directive |
| Productive failure (problem before instruction) | Positive for conceptual knowledge when done with fidelity (Sinha & Kapur 2021) **[Contested]**. It interacts with prior knowledge, and some results conflict with worked-example findings | Experiment-only |
| Feedback detail | Feedback helps on average (d = .41), but over a third of interventions *lowered* performance (Kluger & DeNisi 1996) **[Strong that effects vary]** | Bake task-focused, specific feedback. No per-learner granularity stat |
| Gamification | g = .49 cognitive, .36 motivational (Sailer & Homner 2020), but the motivational and behavioural effects were less robust **[Moderate]**. No evidence for per-person matching | Product-level setting; drop the stats |
| Humour | Positive for climate; mixed for learning (Banas et al. 2011) **[Weak]** | Drop as a stat |
| Growth-mindset framing | Effects on achievement likely explained by design and reporting bias (Macnamara & Burgoyne 2023), disputed by Burnette et al. and Tipton et al. **[Contested]** | Do not build "self-efficacy" directives on it |
| Learning-style matching (VARK and similar) | No support for meshing (Pashler et al. 2008) **[Strong against]** | Already excluded. Keep it out, including through "spatial anchoring" phrased as a preference |

### 2.3 All 100 stats

Key: **K** keep (core) · **M→x** merge into x · **B** bake into defaults · **E** experiment-only
(contested) · **D** drop or profile-only.

| Category | Stat → verdict |
| --- | --- |
| Intake | intake_baseline **M→length_budget** · working_memory_span **D** (no signal; capacity limits are handled by segmenting, which is baked) · processing_velocity **M→reading_speed** · chunk_granularity **M→length_budget** · abstraction_tolerance **M→expertise band** (concreteness fading) · example_density_need **M→expertise band** · text_density_tolerance **M→language_level** · vocabulary_ceiling **M→language_level** · jargon_absorption **M→language_level** · spatial_anchoring **B** (use tables/diagrams where the content has structure; not a preference) |
| Reasoning | deductive_trajectory and inductive_trajectory **M→example_order, E** (one bipolar dimension, contested) · cognitive_flexibility **D** · analogical_transfer **E** (analogies with explicit mapping help in general **[Theory/Moderate]**; no matching evidence) · causal_chain_depth **D** · systems_thinking **D** · pattern_detection **D** · logical_rigor **D** · contradiction_sensitivity **D** · global_framing_need **B** (a one-line orientation for everyone) |
| Pacing | cycle_architecture **B** (short teach-then-check for everyone: retrieval and segmenting) · attention_runway **M→length_budget** · warmup_latency **D** (confounded) · fatigue_curve **M→length_budget** (after residualizing) · momentum_dependence **M→target_difficulty** · interleaving_tolerance **D** (signal invalid; interleaving is baked into review) · rush_tendency **M→rapid_guess_rate** · deliberation_depth **M→rapid_guess_rate** · session_rhythm **D** (analytics only) · reentry_cost **M→forgetting_rate** |
| Engagement | stimulus_envelope **D** · novelty_hunger **D** · humor_receptivity **D** · narrative_pull **M→interest_context** (relevant scenarios only; seductive details argue against decoration) · gamification_response **D** · challenge_appetite **M→target_difficulty** · curiosity_hook **E** · interest_transfer **K → interest_context** · relevance_demand **M→interest_context** · tone_formality **D** as a stat (set by age band, as `PRODUCT-DECISIONS.md` already decides: "playful for kids, clean for adults") |
| Memory | retrieval_strength, decay_rate and retention_index **M→forgetting_rate (K)** · recognition_recall_gap **M→format_gap** · elaboration_benefit **B** (self-explanation) · mnemonic_receptivity **B** (mnemonics where there is a list to memorise) · consolidation_need **B** (end-of-lesson retrieval recap) · interference_susceptibility **M→misconceptions** (contrast the confusable pair when the record shows the confusion) · enactive_encoding **B** · generation_effect **B** |
| Resilience | failure_response, frustration_threshold and persistence **M→quit_risk (K)** · error_recovery_speed **M→misconceptions** · hint_dependency and help_seeking **M→coach_reliance (K, coach only)** · guessing_propensity **M→rapid_guess_rate** · perfectionism **D** · productive_struggle **E** (productive failure is contested) · confidence_calibration **K → calibration** · error_driven_learning **M→misconceptions** |
| Metacognition | self_monitoring **M→calibration** · strategy_awareness **D** · mastery_orientation **D** · autonomy_preference **D** · structure_need **D** · instruction_adherence **M→rapid_guess_rate** · reflection_depth **D** · question_generation **D** · self_efficacy **M→quit_risk** (or a short validated self-report; the behavioural proxy is weak) · planning_tendency **D** |
| Representation | step_explicitness, worked_example_dependence and scaffolding_fade **M→expertise band (K)** · notation_comfort **M→expertise band** (per subject) · brevity_preference **M→length_budget** · repetition_tolerance **D** · feedback_granularity **B** (specific, task-focused feedback) · feedback_tone_sensitivity **D** (age band) · open_response_performance **M→format_gap** · dialogic_preference **E** |
| Motivation | intrinsic_motivation **D** · extrinsic_reward_sensitivity **D** · competitive_drive **D** · praise_sensitivity **D** · evaluation_anxiety **D** as a behavioural stat (if it matters, use a short validated anxiety scale with consent) · boredom_susceptibility **M→length_budget** · persistence **M→quit_risk** · social_framing **M→interest_context** · identity_alignment **M→interest_context** (survey goals) · emotional_engagement **D** (seductive-details risk) |
| Transfer | near_transfer **B** (varied practice for everyone) · far_transfer **D** · application_orientation **M→interest_context** · conceptual_bias **E** (procedural against conceptual order: evidence mixed) · prior_knowledge **K → expertise (per skill)** · misconception_persistence **M→misconceptions (K)** · integration_tendency **B** (link to prior lessons for everyone) · depth_breadth **D** · creative_extension **D** · mastery_velocity **M→expertise** (it is the slope of skill over time) |

### 2.4 Recommended core set: 12 measured constructs

| # | Construct | Per | Feeds | Evidence for using it |
| --- | --- | --- | --- | --- |
| 1 | **expertise** (skill ability, θ) | skill / subject | lesson: guidance band | Expertise reversal **[Strong/Moderate]** |
| 2 | **forgetting_rate** (half-life multiplier) | subject | review schedule; a recap line only when high | Personalized spacing **[Moderate–Strong]** |
| 3 | **language_level** (target reading grade) | learner (subject for languages) | lesson | Comprehensibility constraint **[Theory/Moderate]**; for language subjects it is a knowledge level |
| 4 | **reading_speed** (wpm relative to norm) | learner | length budget, timing norms | Measurement covariate (Brysbaert 2019) |
| 5 | **length_budget** (words or minutes per lesson) | learner | lesson | Operational constraint, validated by A/B (completion and next-level accuracy). Not a learning-science trait |
| 6 | **interest_context** (benefit of interest-based examples, plus the chosen interest category) | learner | lesson | Context personalization **[Moderate]** |
| 7 | **misconceptions** (specific, per skill; a record, not a score) | skill | lesson, coach | Targeted error feedback **[Moderate]** |
| 8 | **target_difficulty** (success rate that keeps them working) | learner | level difficulty, stretch share | Practical. "Desirable difficulties" is well supported in general; the per-person optimum is **[Theory]** |
| 9 | **quit_risk** (chance of disengaging after errors) | learner | difficulty ramp, coach tone | **[Theory/Weak]** for matching; useful to measure |
| 10 | **rapid_guess_rate** (response-time effort) | learner | data hygiene (exclude rapid guesses), UI nudges | Response-time effort / normative thresholds in testing **[Moderate]** |
| 11 | **calibration** (confidence resolution and bias) | learner | coach, profile | Measurement of metacognition **[Moderate]**; matching evidence weak |
| 12 | **coach_reliance** (coach use relative to need) | learner | coach | Operational |

Experiment-only, behind a hierarchical test (section 3.3): example_order (rule-first against
cases-first), analogy, dialogic style, productive failure, conceptual-first, curiosity opener. Each
gets a directive only if the population analysis shows real variation between learners and the
learner's own estimate is clearly away from the population mean.

---

## 3. Measuring each kept construct accurately and cheaply

### 3.1 Replace "value + weight" with a model per construct

Each construct should have a likelihood: what it predicts about the data. Confidence should be a
posterior standard deviation, with population (hierarchical) priors. This removes one-sided drift
(a missing event counts as evidence too), makes "how many observations" a calculation rather than a
guess, and allows a prediction-based validation.

| Construct | Model | Signals already collected | Micro-experiment, if useful | Observations for a usable estimate **[Estimate]** |
| --- | --- | --- | --- | --- |
| expertise | Elo or Rasch per skill, with item difficulty calibrated across learners (Pelánek 2016) | every graded answer, placement | Kalyuga & Sweller's (2005) rapid "first step" check: show a problem and ask only for the next step. It takes seconds and was designed for adaptive e-learning | Rasch SE ≈ 1/√(Σp(1−p)). At p≈0.7 that is about 0.21 information per item: ~20 items for SE 0.5 logits, ~50 for SE 0.3. Placement supplies the prior |
| forgetting_rate | Half-life regression (Settles & Meeder 2016) or FSRS stability (Ye; open source), with a **learner-level multiplier** shrunk toward the population | due reviews, *with elapsed interval* and item difficulty | none needed: the schedule is the experiment | HLR cut recall-prediction error by 45%+ against baselines in Duolingo data. A per-learner multiplier needs a few dozen reviews spread over intervals; until then use the population value. Lindsey et al. (2014) show the payoff |
| reading_speed | log(words/ms) from lesson-page `read_ms`, trimmed for idle time; median of recent pages | `read_ms`, `words` | none | log-wpm varies a lot between pages; about 10 clean pages for ±10–15% (assumption: SD ≈ 0.3 log units per page) |
| language_level | Ability on passage items indexed by readability; for adults, start from age band and placement | passage items, Reading/English placement | one short calibrated passage plus 3 questions at onboarding | about 15–30 passage items |
| length_budget | Completion hazard against length, plus taps ("too long"/"too short", a fair use of self-report) | `read_ms`, early exits, feedback taps | within-learner A/B of short and full versions; outcomes: completion, next-level residual, delayed recall | Taps: 5–10. Learning effect: see power below |
| interest_context | Hierarchical treatment effect: population effect + learner deviation | existing experiment arms | same as today, but scored by a proper estimator | Population effect first (hundreds of learner-levels); per-learner deviations only if variation between learners (τ) is clearly above 0 |
| misconceptions | Facts in the learner record (tag, skill, last seen, corrected?), plus a model for the per-skill error rate | error_tag, repeated tags, *and corrected attempts* | a targeted refutation check item | event-based; resolves when 2 consecutive correct attempts carry the same distractor |
| target_difficulty | Success-rate band where quitting and "too hard"/"too easy" taps balance | accuracy, taps, quit events | small difficulty-step experiments | 10–20 levels |
| quit_risk | Logistic hazard of ending a session, with recent error run, time and difficulty as covariates | session ends, unanswered items | none | many sessions (rare event). Pool hierarchically |
| rapid_guess_rate | Normative threshold: an answer faster than 10% of the item's mean time across learners (NT10; Wise & Ma 2012) counts as a rapid guess. Response-time effort is the share that are not | `ms` per item, plus population norms per item | none | about 30 items for ±8 pp |
| calibration | Resolution (gamma or AUROC2) and bias from confidence taps; hierarchical meta-d′ if precision is needed (Fleming & Lau 2014) | confidence taps (about 1 item in 3) | none | No published fixed minimum; run a parameter-recovery simulation for the app's tap rate. Expect 50+ rated items for a rough per-learner estimate |
| coach_reliance | Coach use against model-predicted need (residualized by difficulty and ability) | coach_used | none | about 30 items |

### 3.2 General rules for "how many observations"

- **Reliability grows with averaging** (Spearman–Brown). If one level's index correlates ρ₁ with the
  same index on another level, the mean of k levels has reliability kρ₁/(1+(k−1)ρ₁). With ρ₁ = 0.1,
  common for single-session behavioural indices, reaching 0.7 takes about 21 levels and 0.8 about
  36. **Measure ρ₁ for each construct from real data** (split-half across levels) before setting
  thresholds. Do not hard-code 30% confidence.
- **Confidence should mean posterior SD below a threshold that matters.** For example, fire a
  directive only when P(true value beyond the edge) > 0.8.

### 3.3 Within-learner experiments that can actually detect something

The power arithmetic for a binary next-item outcome at p ≈ 0.7 (two-sided α = 0.05, 80% power)
**[Estimate, standard formula]**:

| True difference | Items per arm | 8-item levels per arm |
| --- | --- | --- |
| 20 pp | ~80 | ~10 |
| 10 pp | ~350 | ~44 |
| 5 pp | ~1,400 | ~175 |

Realistic per-person instructional effects are probably 5–10 pp or less, so **per-learner A/B alone
cannot identify most preferences.** What works:

1. **Hierarchical estimation.** Estimate the population effect μ and the spread between learners τ,
   then give each learner a shrunk estimate μ + (shrunk deviation). With τ ≈ 0, everyone gets the
   population answer: bake it, or drop it. This is also how the app finds out whether a "preference"
   exists at all.
2. **Better outcomes.** Score the next level's residual against Elo-expected accuracy, not raw
   accuracy against a moving baseline. Add delayed recall on the *same* items as a second outcome.
   Then a few items carry more information.
3. **Adaptive allocation.** Thompson sampling or bandits move learners toward the better arm while
   still learning; Clement et al. (2015) show bandit sequencing in a tutor with 400 children.
4. **Log every active directive per level** (an exposure log), so that outcome models can attribute
   effects to directives instead of crediting whatever the LLM read believes.

### 3.4 Validating the whole scorecard against held-out outcomes

Build `scripts/scorecard-validate.js`, read-only like `scorecard:report`:

- **Predictive validity.** Train the models on data up to day T. Predict (a) next-item
  correctness, (b) delayed-recall correctness on due reviews and (c) session completion after T.
  Report log-loss, AUC and calibration curves against simpler baselines: population-only, the
  current SM-2-style schedule in `mastery.js`, and the current scorecard values as features. A
  construct that does not improve prediction of its own outcome is not measuring anything.
- **Test–retest.** Split each learner's levels into odd and even and correlate the construct
  estimates (ρ, then Spearman–Brown). The goal is ≥0.7 at the confidence the directive fires on.
- **Causal check (the holdout).** The current report compares mean next-level accuracy of tailored
  and holdout pages with no confidence interval and no adjustment for difficulty. Report the
  difference of *residuals*, with a bootstrap CI, per directive present, plus delayed recall.
  Investors are promised "retention vs. a non-tailored holdout" in `PRODUCT-DECISIONS.md`, so this
  number has to stand up.
- **Do not validate with self-reports or LLM reads of learning.** Perceived learning can run
  opposite to actual learning (Deslauriers et al. 2019).

---

## 4. Token efficiency

### 4.1 Where the tokens go now

Sizes measured from the code, converted at about 4 characters per token **[Estimate]**:

| Item | Size | When |
| --- | --- | --- |
| Directive text | 140 texts, average 91 characters (~22 tokens) | — |
| Scorecard section of the brief (mature learner) | header + certainty note + up to 22 directives + 5 recent-level lines ≈ **600–800 tokens** | every tailored write. In `block-levels.js` the brief goes to **both** the layout and the fill call |
| Older "HOW THEY ARE BEST TAUGHT" section | ~100–150 tokens, overlapping the directives | every tailored write |
| After-level read: `statGuide` (all 100 stats, with scores) | 12,674 characters ≈ **3,200 tokens** | **every level**, plus the system prompt and rules (~700 tokens) and the record |
| Level-editor base page | 71–92 KB of HTML ≈ 18–23k input tokens, and a full page as output | each tailored page rewrite |

The scorecard-attributable input per tailored level is about 2 × 700 (brief) + 3,900 (read) ≈ **5,300
tokens**. The page rewrite and the fact-check pipeline for tailored block lessons cost far more than
that.

### 4.2 Smallest effective instruction set

1. **Bake the universal techniques into a cached defaults block** (~250 tokens, in the system
   prompt, identical for all learners): retrieval check per segment, self-explanation prompt,
   concrete before abstract, no irrelevant decoration, contrast confusable pairs, specific
   task-focused feedback, a recap to recall. DeepSeek's API caches identical prompt prefixes
   automatically and reports `prompt_cache_hit_tokens`. Only an exact prefix match from token 0
   hits, so static text must come first.
2. **At most 6 learner directives, most important first.** Instruction-following degrades as
   instruction count rises (IFScale; Jaroslawicz et al. 2025), and models use information at the
   start and end of a long context better than the middle (Liu et al. 2024). With 6 or fewer, a
   conflicts table is barely needed.
3. **Parameters, not prose.** Bands map to fixed wording the writer has already seen in the cached
   defaults. Example (~70–110 tokens):

   ```
   LEARNER (measured; follow exactly, defaults cover everything else)
   - Skill level on this topic: novice -> 2 fully worked examples, second one faded; show every step.
   - Reading level: grade 7; define each new term once.
   - Length: <= 600 words of teaching text.
   - Examples set in: basketball (keep the maths structure unchanged).
   - Known misconception: treats "-x^2" as "(-x)^2"; refute it with one counter-example.
   ```
4. **Omit, don't hedge.** If no construct passes its confidence gate, send no learner block. Then
   do not rewrite at all: serve the shared, already-verified lesson. This is the biggest single
   saving, because it skips the page generation and its fact-check (the product doc puts that at
   $0.47–1.86 per lesson).
5. **Cohort caching.** Bands are discrete (3 expertise × 3 reading × 3 length × ~10 interest
   categories, at most a few hundred combinations per level, and in practice far fewer). Key
   tailored lessons by (level, band vector) and share one verified lesson across every learner with
   the same bands. This needs interests mapped to a fixed list of categories, as Walkington's study
   did with nine. Free-text interests can still personalize examples in a cheap final pass if
   wanted.
6. **Order for prefix caching.** Static system and defaults first, then the learner block (stable
   across a learner's levels), then the level content, then the volatile recent-level lines *last*.
   Today `details.brief()` puts the recent conclusions inside the scorecard section, so they change
   every level, and `briefHash` changes with them.
7. **Shrink the after-level read.**
   - Run it only when there is free text: feedback or coach messages. Performance-only reads repeat
     what the deterministic signals already measure.
   - Send construct definitions (static, so they move to the cached system prompt) *without* current
     scores, which removes the anchoring as well.
   - Ask for structured observations (e.g. `said_too_long: true`, `confusion: {skill, misconception}`),
     not stat deltas.

### 4.3 Before and after, per tailored level **[Estimate]**

| Component | Now | After | Notes |
| --- | --- | --- | --- |
| Learner block in writer prompts | ~700 × 2 calls = 1,400 | ~100 × 2 = 200 | +250 cached defaults, billed at the cache-hit rate |
| Overlapping style section | ~120 × 2 = 240 | 0 | merged into the learner block |
| After-level read: stat guide | ~3,200 every level | ~400 cached definitions, only on levels with free text | if free text appears on 1 level in 4, that averages ~100 uncached |
| After-level read: system and rules | ~700 every level | ~700 cached, same frequency | |
| **Scorecard-attributable input** | **≈ 5,500** | **≈ 400–800** | about 85–90% less |
| Rewrites avoided | — | levels with an empty block or a shared cohort | the dominant saving, in input, output and fact-checking |

The numbers move with prices and with how often learners leave feedback. Check them with the
existing `npm run scorecard:prompt` and the providers' cache-hit counters.

---

## 5. Implementation plan, in order

Impact and effort are judgements **[Estimate]**. S is under 1 day, M is 1 to 3 days, L is a week or
more.

| # | Change | Files | Impact | Effort |
| --- | --- | --- | --- | --- |
| 1 | **Synthetic-learner simulation harness** (5.1). It has to come first, so that every later change is measured | new `scripts/scorecard-sim.js`; an in-memory `config/db` stub | High: turns accuracy into a number | M |
| 2 | **Quarantine LLM-only evidence.** Store evidence mass by source (`w_beh`, `w_exp`, `w_llm`). A directive needs behavioural or experimental mass ≥ the gate. LLM mass never raises confidence. Remove current scores from `statGuide` | `services/scorecard/index.js` (`applyTo`, `shift`, `read`), `translate.js`, `learner-record.js` | High (accuracy) | S–M |
| 3 | **Fix one-sided signals.** Emit the complementary observation (e.g. "answered without the coach") or switch to rate models (Beta-Binomial). Start with hint_dependency, misconception_persistence, consolidation_need, mastery_velocity, perfectionism, guessing | `signals.js`, `index.js` | High | M |
| 4 | **Condition review evidence on the interval.** Pass `interval_days` and stability from `skill_states`. The observation becomes the recall residual against an HLR/FSRS prediction | `signals.js` (`fromAnswer` review branch), `mastery.js`, `hooks.js` | High | M |
| 5 | **Proper experiment estimator.** Store raw arm outcomes and estimate the arm difference with a Beta-Binomial (or a residual t-estimate), pooled hierarchically. Remove the `50 ± 120×Δ` pseudo-value | `signals.js`, `personalize.js`, `scripts/scorecard-report.js` | High (otherwise experiments never act) | M |
| 6 | **Time-based evidence decay** (e.g. 90-day half-life) instead of ×0.97 per update. Report confidence from the posterior SD. Give population priors a variance | `index.js` | Medium–High | S–M |
| 7 | **Token quick wins.** Max 6 lesson directives. Remove the duplicate style section. Reorder the brief for caching (volatile lines last). Move stat definitions into the cached system prompt. Run the LLM read only when there is free text | `translate.js` (`MAX_DIRECTIVES`), `details.js`, `personalize.js`, `learner-record.js` | Medium (tokens) | S |
| 8 | **Skip the rewrite when the learner block is empty** (and no interest experiment is due) | `level-editor.js` (`ensure`), `block-levels.js` (`write`) | High (cost) | S |
| 9 | **Elo/IRT item calibration and residualized signals.** Expected accuracy per response; fatigue, failure, intake and warm-up become residual-based | new `services/scorecard/irt.js`; `mastery.js`; `signals.js` | High | M–L |
| 10 | **Rapid-guess detection by NT10**, from per-item RT norms. Exclude rapid guesses from ability and other updates | new item-norm table; `signals.js`; `mastery.js` | Medium–High | M |
| 11 | **Collapse to the 12 core constructs.** `stats.js` v2 with `evidence` and `contested` fields; a migration map from the old ids so the profile and admin pages keep working; `summary.js` says "research is mixed" where it applies, as `PRODUCT-DECISIONS.md` requires | `stats.js`, `index.js`, `translate.js`, `summary.js`, `routes/profile.js`, `routes/admin.js`, `docs/SCORECARD.md` | High (accuracy and tokens) | L |
| 12 | **Validation script** (3.4): predictive log-loss and AUC, test–retest, holdout residual difference with a CI | new `scripts/scorecard-validate.js` | High (evidence for investors) | M |
| 13 | **Per-learner forgetting in the scheduler** (FSRS or HLR, replacing fixed `INTERVALS_DAYS`) | `mastery.js` | High (retention) | L |
| 14 | **Hierarchical bandit for experiments plus an exposure log** of active directives per level | `personalize.js`, `level_signals` rows | Medium–High | L |
| 15 | **Cohort caching of tailored lessons** by band vector and interest category | `block-levels.js` (plan keying), `level-editor.js`, `learner.js` (interest taxonomy) | High (cost) | L |
| 16 | **Correct `docs/SCORECARD.md`**: the number of LLM-only stats, the questionnaire weight 0.6, and confidence for per-subject reads | docs | Low; honesty | S |

### 5.1 The simulation (item 1)

**Synthetic learners.** Draw true traits from population distributions:
- skill θ per skill
- forgetting multiplier
- reading wpm
- rapid-guess rate
- quit hazard as a function of an error run
- coach-use propensity
- length tolerance
- an interest-context effect
- **zero-effect "preferences"** on the experiment-only dimensions (most learners), plus a few
  learners with real effects

**Behaviour generator.** For each simulated level:
- **Correctness:** Rasch, using the item's true difficulty (the hand labels are noisy versions of
  it), plus the teaching arm's effect.
- **Response times:** lognormal, with a rapid-guess component.
- **Reading:** read time from wpm and words.
- **Reviews:** recall probability = 2^(−Δt / half-life).
- **Confidence taps:** generated from true calibration.
- **Feedback taps:** from length tolerance, with noise.
- **LLM read:** a simulated read that is noisy, *biased toward the current score* (anchoring), and
  biased toward whatever the lesson content was written to do (the confirmation loop). This shows
  how much the read hurts or helps.

**Run** the real `signals.js`, `hooks.js`, `index.js` and `translate.js` against an in-memory DB, and
the proposed models, side by side.

**Metrics:**
- recovery correlation r and RMSE for each construct at 10, 30 and 100 levels
- directive precision and recall (does it fire if and only if the true trait is past the edge?)
- false-directive rate on zero-effect learners
- time to confidence
- the expected learning gain from following the directives, compared with defaults

**Regression tests** in `scripts/scorecard-test.js` (already in `npm test`):
- an LLM-only stat never produces a directive
- decay_rate is the same for one true forgetting rate under two schedules
- the experiment estimator is unbiased under the null and detects a 15 pp effect at the computed n
- `directives()` returns 6 or fewer, and returns nothing when no construct is confident
- `briefHash` does not change on a move that changes no band
- simulated recovery stays at r ≥ 0.7 for expertise, forgetting, reading speed and rapid-guess rate
  after 60 levels (thresholds to tune once the simulation exists)

---

## 6. Uncertainty and contested points

- **Per-person optima for preferences are largely unknown.** Some stats will show real differences
  between learners once the hierarchical experiments run. The proposal is not "these never matter".
  It is "do not act on them until the data shows they vary between people".
- **The expertise-reversal effect is well replicated in lab and classroom studies**, but how sharp
  the novice-to-expert boundary is varies by domain. The band thresholds should be learned from the
  app's own data.
- **Interest-based personalization** has good evidence in maths word problems and less elsewhere. It
  also conflicts with seductive-details findings when the interest is decoration rather than the
  structure of the problem. Keep it relevant, and test it.
- **Productive failure, growth-mindset framing and humour are contested** and should be labelled so
  in any learner-facing text, as `PRODUCT-DECISIONS.md` requires.
- **Effect sizes quoted here come from abstracts and summaries** in several cases (noted in Sources),
  and some secondary sources disagree on moderators (seductive details, worked-example moderators).
  Treat the headline g values as approximate.
- **Token figures use characters ÷ 4.** DeepSeek's tokenizer and current cache pricing should be
  checked with real `usage` fields.
- **The simulations reproduce this repository's arithmetic on synthetic inputs.** They show what the
  rules *can* do, not what real learners' cards look like. Running `scorecard:report` on real data
  would confirm how often each effect occurs.

---

## 7. Round 4 (2026-10-22): what makes a level teach best, and how to measure it

Rounds 1–3 asked whether the scorecard says true things about a learner. This round asks the
question the scorecard exists for: **does the level a learner gets teach them more, keep it
longer, in less time?** Sections 7.1–7.3 are the evidence (with labels as in the rest of this
report); 7.4 is what the simulation now measures; the steps and proposals are in
`scorecard-sim/BASELINE.md` (round 4).

### 7.1 What decides how much a level teaches, strongest evidence first

| Lever | Evidence | What it means for the app |
| --- | --- | --- |
| **When each skill is reviewed** (retrieval practice, spaced by each learner's forgetting) | Personalised review scheduling beat a one-size spaced schedule by 10% and massed study by 16.5% on a cumulative exam a month after the course (Lindsey et al. 2014) **[Moderate–Strong]**. Half-life regression cut recall-prediction error by 45%+, and Duolingo reported +9.5% daily practice retention in its A/B test (Settles & Meeder 2016; company blog) **[Moderate]**. Optimal review timing is tied to the predicted recall probability itself (Tabibian et al. 2019, PNAS; a natural experiment, not an RCT) **[Moderate]**. One correct recall in each of three spaced sessions gave 68% one-week retention against 26% for three recalls in one session (Rawson et al. 2018; review: Rawson & Dunlosky 2022) **[Strong]** | The largest per-learner lever is the review scheduler, not lesson wording. The app measures each learner's forgetting (forgetting.js) but schedules reviews on fixed intervals (`mastery.js` INTERVALS_DAYS); in simulation, scheduling by predicted recall raises 30-day recall by about half with the same practice time (7.5) |
| **Guidance matched to what the learner already knows** (expertise reversal) | Meta-analysis of 60 experiments, 5,924 learners: low-prior-knowledge learners learn more from high-assistance instruction (d = 0.505), high-prior-knowledge learners from low assistance (d = −0.428); robust across contexts, weaker evidence for young learners and for humanities/language learning; giving novices help matters more than withholding it from experts (Tetzlaff, Simonsmeier, Peters & Brod 2025) **[Strong/Moderate]**. Adaptive fading of worked examples, by each student's understanding, beat fixed fading, which beat plain problem solving, on delayed transfer (Salden, Aleven, Schwonke & Renkl 2010) **[Moderate]** | The one learner-by-teaching interaction worth a directive. What matters is expertise **relative to the material in front of them**, now, not a placement score: placement already chooses the level. Round 4 adds that measurement (step 27) |
| **Starting knowledge differs; learning rate barely does** | Across 27 datasets, students differed greatly in initial knowledge but learned at remarkably similar rates per practice opportunity (Koedinger, Carvalho, Liu & McLaughlin 2023, PNAS); replicated on 15,000+ MATHia students (EDM 2024); a 2026 reanalysis argues the estimates are sensitive to sequence length **[Moderate, contested in degree]** | Matches the simulation: mastery velocity's sampling error exceeds the spread between learners after 100 levels (step 14). Do not tailor on "fast learner"; tailor on where they are |
| **Difficulty of practice** | For gradient learners on two-choice tasks the optimal error rate is ~15% (Wilson, Shenhav, Straccia & Cohen 2019); the authors warn against reading it as a target grade **[Theory]**. In Math Garden, children assigned a higher success rate attempted more problems and gained more (Jansen et al. 2013) **[Moderate]**; target difficulty changed willingness to keep practising in an adaptive system (Papoušek & Pelánek 2015) **[Moderate]** | A population target of roughly 75–85% success (the app plans ~70%) is better supported than a per-learner "challenge appetite"; per-learner optimum stays **[Theory]** |
| **Interest-based contexts** | Meta-analysis (34 publications): interest g = 0.55, retention g = 0.48, transfer g = 0.36 (Lin et al. 2024, Educational Psychology Review) **[Moderate]** | An average effect: it belongs in the default lesson (use the learner's stated interests when relevant), not in a per-learner directive. Per-learner differences remain undetectable at ~10 experiments per 100 levels (round 3) |
| **Not over-practising mastered skills** | Refitting knowledge-tracing parameters gave more practice on hard skills and less on easy ones, cutting instructional time with no loss of learning (Cen, Koedinger & Junker 2007) **[Moderate]**; the data used for the mastery decision and its threshold matter more than the learner model (Pelánek & Řihák 2017) **[Moderate]** | An efficiency lever outside the scorecard (`mastery.js` level-up); not changed here |

### 7.2 How reliably the remaining constructs can be measured

- **Calibration** (confidence taps): M-ratio needs about 400 trials for test–retest r ≈ 0.7, is
  r ≤ 0.6 below that, and asking for confidence *with* the answer (not after it) raised
  test–retest reliability from 0.51 to 0.83 (Guggenmos 2021, 6,912 participants). Across 17
  metacognition measures split-half reliability is high above 100 trials but test–retest is
  mostly poor (Rahnev 2025, Nature Communications) **[Strong]**. The app collects ~300 taps per
  100 levels, so the simulated r ≈ 0.5 is what the literature predicts; only more taps change it.
- **Reading level**: comprehension of unassisted text needs about 95–98% of running words to be
  known (Hu & Nation 2000; replication Kremmel et al.) **[Moderate]**. Per-word reading times
  track reader skill (Kuperman & Van Dyke 2011) but predict comprehension only at r ≈ 0.36–0.38,
  and quick vocabulary tests such as LexTALE correlate only low-to-moderately with proficiency in
  some groups (Puig-Mayenco et al. 2023) **[Moderate]**. So a reading-level channel needs
  calibrated passage items, not inference from timing.

### 7.3 How to measure whether a level teaches best

1. **Delayed recall and transfer, never immediate performance or self-report** (Deslauriers et
   al. 2019; Rawson & Dunlosky). The simulation now reports recall 7 and 30 days after each
   checkpoint from the learners' true memory, and retained skills per hour of practice.
2. **Value directives by the evidence behind them.** Only expertise-matched guidance has a
   replicated interaction effect; the simulation now values those directives in d (Tetzlaff et
   al. 2025) against an oracle that gives every learner past an edge the right one.
3. **The holdout needs power, and the ability model does not give it here.** Regression
   adjustment on pre-period data roughly halves variance in web experiments (CUPED; Deng, Xu,
   Kohavi & Walker 2013). In simulation, next-level accuracy against the ability model's
   expectation varies between pages about as much as raw accuracy (both ~16 points), because
   placement already pitches each learner's levels near 70%: detecting a 5-point gain needs about
   160 pages per arm either way, i.e. about 1,600 tailored pages at a 10% holdout. The residual
   comparison was built and measured, gained nothing, and was reverted.

### 7.4 What the simulation measures now, and what moved

The recovery simulation (`scripts/scorecard-recovery-sim.js`) now also reports, read only:

- **Learning outcomes from true memory**: the share of practised skills a learner would still
  recall 7 and 30 days after the checkpoint with no more practice, practice hours, review
  answers, and skills recalled at 30 days per practice hour.
- **What the directives are worth**: expertise-matched directives (prior knowledge, and since
  step 27 scaffolding fade) valued in d from Tetzlaff et al. (2025) — +0.505 for full support to a
  learner truly at the low edge, +0.428 for faded support to one at the high edge, the same
  amounts negative on the wrong side — against an oracle that gives every learner past an edge
  the right directive; experiment-stat directives by the sim's own arm model.
- **The holdout comparison's power** (7.3, point 3).
- **The standing's own recovery r** (what the directive gate reads) beside the shown score's.

Changes in round 4, all at 200 learners, seed 20261022, population 60, 100 levels
(`scorecard-sim/BASELINE.md`, round 4, has every row):

| step | change | result |
| --- | --- | --- |
| 23 | measurement: outcomes and directive value | baseline outcomes: 30-day recall 17.3% of practised skills, 7-day 37.4%, 10.2 practice hours, 169 review answers, 0.88 skills retained per hour; expertise directives worth 0.027 d per learner against an oracle of 0.092 |
| 24 | measurement: scaffolding fade gets a truth (standing against the course now) | it becomes measurable (LLM-only stats 42 → 41); no app change, no directive |
| 25 | **bug fix**: `irt.js` packed pace and earlier-right counts under one key since step 17, corrupting the forgetting model's inputs | decay rate r 0.49 → 0.54; nothing else moved |
| 26 | exact logit-normal (binomial GLMM) standings for rates, replacing the normal approximation | **rejected**: rush +5 and deliberation +3 directives but hint dependency −7; true directives 0.82 → 0.81; three times slower; reverted |
| 27 | **reach**: where the learner stands against the course, per subject, from the ability model's expectation of their recent fresh answers → scaffolding fade | scaffolding fade r — → 0.79, 28 directives, none false, recall 0.40; expertise directive value 0.027 → 0.084 d per learner (oracle 0.198); true directives per learner 0.82 → 0.91; learners with one 59.5% → 64%; false directives 0.0 / 0.0 / 0.4% at 10 / 30 / 100 levels; at seeds 7 / 11 / 3 at most 0.7% at 100 levels |
| 28 | reach's noise from the Elo's own tracking variance (K / (2 − K·I) = 0.02 at the floor learning rate) instead of a guessed 0.03; a practice answer's subject found through its sitting | scaffolding directives 28 → 34 (seeds 11 / 7 / 3: 30 → 45, 25 → 32, 27 → 30), same false ones; expertise directive value 0.084 → 0.094 d per learner; a 100-answer minimum (instead of 150) added a false directive at seed 11 and was not kept |

### 7.5 Product calls, with measured expected gains (not done: the owner decides)

Measured with the simulation's knobs on the step-27 code unless stated; learning outcomes at 100
levels against the same learners without the change.

| call | measured | expected gain | cost / risk |
| --- | --- | --- | --- |
| **Review scheduling by predicted recall** (FSRS-style; `--review-pick=model --review-target=0.85`: review a skill when the app's own forgetting model predicts recall below 85%, lowest first, at most three a level) | with the step-25 fix, code otherwise as step 25 | 30-day recall 17.3% → 24.6% of practised skills (+42%), 7-day 37.4% → 47.6%; 5% fewer review answers, same practice time; skills retained per practice hour 0.88 → 1.26 (+43%); decay rate r 0.54 → 0.53. Target 0.90: 24.7%, +3% reviews; target 0.70 (before the fix): 24.4% | review accuracy falls from 61% to 55% (reviews come when memory is weaker: a desirable difficulty, but learners see more misses); false directives 0.9% at 100 levels on the changed answer stream (still under 2%); changes `mastery.js`, which level-up also reads |
| **A reading-level channel** (`--reading-test=1` / `=4`: a calibrated passage/vocabulary test of ~10 points' error, once / four times per 100 levels) | code as step 25 | vocabulary ceiling (language level) r — → 0.85 / 0.95; kept constructs at r ≥ 0.7: 7 → 8 of 12; about 16 / 32 extra true directives per 200 learners, none false | needs calibrated passage items (Hu & Nation's coverage threshold argues for passages, not timing); a few minutes of a learner's time per test |
| **Confidence tap on every question** (`--tap-rate=1`) | step-27 code | calibration and self-monitoring r 0.50 → 0.59, 0 → 4 directives each (recall 0.24); true directives per learner 0.91 → 0.93; no change in recall or practice time. False directives rise to 1.9% at 100 levels on that answer stream (hint dependency, rush, brevity on learners within 5 of the middle): at the limit | three times the taps; Guggenmos (2021) says report confidence with the answer, not after it |
| **Experiments on every tailored page** (`PERSONALIZE_EXPERIMENT_RATE=1`) | step-27 code | 30 experiments per learner instead of 10; brevity (length) recall 0.51 → 0.71; interest-based examples r 0.19 → 0.19 (its standing 0.26), still no directive; true directives per learner 0.91 → 0.95; false 0.8%; 30-day recall 17.3% → 16.9% (more pages taught a non-default way) | three times as many pages taught a non-default way on purpose |

### 7.6 What to do next, in order of evidence times measured gain

1. **Schedule reviews by predicted recall** (owner's call; 7.5). The best-supported lever in the
   literature and the largest measured gain here (+43% skills retained per practice hour), and it
   also measures forgetting better. It would replace `mastery.js`'s fixed intervals with "review
   when the forgetting model predicts recall below ~85%"; FSRS's own optimiser is the mature
   version of the same idea.
2. **Keep expertise against the material as the main lesson directive** (done for scaffolding
   fade, step 27–28). Next, per skill rather than per subject: the expertise reversal effect is
   about the task in front of the learner (Kalyuga & Sweller's rapid first-step check is the
   cheapest per-skill probe). Block-level checks have no item row, so they do not feed reach yet.
3. **A calibrated reading check** (owner's call; 7.5) is the only way language level becomes
   measurable.
4. **Population-level defaults, not per-learner directives**, for what helps nearly everyone:
   interest-based contexts when interests are known (already in the level editor's task text),
   retrieval and a recall recap in every lesson, a success rate of about 75–85% on practice
   (product call, not measurable in the simulation: it has no model of how difficulty changes
   learning or motivation).
5. **Stop practising what is mastered** (`mastery.js` level-up and review choice): an
   efficiency lever with good evidence (Cen et al. 2007) that the scorecard does not touch.
6. **Validate on real learners** before trusting any of this beyond the simulation: the
   holdout needs about 160–190 pages per arm to see a 5-point gain on the level after a page;
   at a 10% holdout that is roughly 1,600–1,900 tailored pages. Delayed recall on the same skills
   is the outcome to add to it.

Caveats. Scaffolding fade's simulated truth is defined from the simulation's own model of
ability and course difficulty, so its r of 0.79 says the measurement works as designed, not that
real learners' reach maps onto expertise the same way. The d values are average effects from
the meta-analysis, applied per directive; they price the directive, they do not predict one
learner's gain. Retention figures come from the simulation's memory model (half-life with
hard-won recalls strengthening it most), which is a reasonable but assumed shape.

## 8. Round 5 (2026-10-23): the forgetting curve for scheduling, confidence, language level

Steps 29-34 are in `scorecard-sim/BASELINE.md`. Every change was measured at four seeds
(20261022, 7, 11, 3; 200 learners, population 60, 100 levels, model read off) and kept only
with no regression and false directives at or under 2% at 10 / 30 / 100 levels.

### 8.1 What the evidence says, and what was done with it

| Question | Evidence | Done |
| --- | --- | --- |
| Does the app's fitted forgetting curve predict recall well enough to schedule reviews by? | Half-life regression cut recall-prediction error 45%+ against fixed curves (Settles & Meeder 2016) **[Moderate]**; review timing tied to predicted recall (Tabibian et al. 2019) **[Moderate]** | Exported (`scorecard.forgettingCurve`, `forgetting.recallAt`) for adaptation.js. In simulation it predicts each learner's true 30-day recall with MAE 0.08-0.10 and r 0.77-0.82, against 0.11 / 0.76 for the default curve adaptation.js used |
| Should spaced successes count more than massed practice? | The stability gain from a review grows as recall at the review falls, and a same-day review barely changes stability (FSRS-6, fitted to Anki review logs) **[Moderate-Strong]**; ACT-R spacing model (Pavlik & Anderson 2005) **[Moderate]** | Measured as extra curve terms and rejected (step 30): better calibrated, but spaced successes are partly the learner's own memory, so they explain away the learner's multiplier (decay r down) and model-scheduled reviews retained LESS at three seeds. Memory rows now record spaced counts, so a later refit on real data can try again |
| Exponential or power-law forgetting? | Aggregated memory data follow a power law more often than an exponential (Wixted & Ebbesen 1991); FSRS moved to a power curve in v4 and fits its decay in v6 **[Moderate]** | Depends on the true memory, which the simulation has to assume. On its default exponential memory a likelihood-chosen power tail over-predicted at two seeds; on FSRS-6 memory (`--memory=fsrs`) the exponential curve under-predicts 30-day recall by 0.34-0.46 and a power tail with a joint refit cuts that to 0.06-0.11 (8.2). Kept off; the first thing to check on real data |
| Can calibration be measured with fewer ratings? | Resolution measures (ROC area, M-ratio) need hundreds of trials (Guggenmos 2021; Rahnev 2025) **[Strong]**; confidence BIAS is the more reliable individual difference (test-retest r .67 against .45 for efficiency: Zhan, Castanheira & Fleming 2026, preliminary), and confidence is a robust factor that predicts achievement beyond self-efficacy questionnaires (Stankov, Lee, Luo & Hogan 2012) **[Moderate]** | Taps aimed at harder questions (same count) gained nothing (step 33). Instead the same taps now also measure confidence as a trait: of the taps on right answers, the share "sure" (self-efficacy): r 0.21-0.32 -> 0.76-0.79, 8-23 directives per 200 learners, none false (step 34). Calibration (resolution) stays at r 0.5-0.65: only more taps move it |
| Reading level without a new item type? | Items with more non-mathematical lexical and syntactic complexity are harder for English learners than for others of the same ability (Martiniello 2008; Abedi & Lord 2001) **[Moderate, direction only]** | Language level read from the answers: each level's wordier half against its plainer half, against expectation (steps 31, 32, 34). In simulation, if the effect exists at the assumed size: r 0.72-0.80, 2-4 directives per 200 learners, none false; at half the size r ~0.5 and none; with no effect r 0 and none. The size in this app's items is unknown: the holdout and a reading check would tell |
| Expertise reversal | (section 7) | A shorter reach window (50 answers) lost directives (step 33, rejected); reach stays as in round 4 |

### 8.2 Review scheduling by predicted recall, refined (owner's call; not live)

`--review-pick=model --review-target=0.85`, current code, four seeds:

| true memory model | 30-day recall, app schedule -> by prediction | skills retained per practice hour | review answers | false directives (10 / 30 / 100, worst seed) |
| --- | --- | --- | --- | --- |
| simulation default (exponential, round 4) | 17.3 -> 24.6%, 16.4 -> 23.8%, 15.0 -> 22.3%, 14.5 -> 21.1% (+42 to +49%) | +43 to +48% | -5% | 1.7 / 1.8 / 1.1% |
| FSRS-6 published defaults (power-law, spacing-driven) | 54.1 -> 57.9%, 53.7 -> 57.3%, 53.1 -> 56.9%, 52.5 -> 56.4% (+7%) | +6 to +9% | -11% | 1.7 / 2.1 / 2.0% (at the limit) |
| FSRS-6, with a power-law curve and joint refit (step 30 (b)+(c)) | 58.6, 58.0, 57.4, 56.9% (another +0.5 to +0.7 points) | about +1% more | +7% | 1.9 / 2.1 / 1.2% |

The gain is real under both memory models, but its size depends on how real learners forget:
large if forgetting is close to exponential at the app's intervals, modest if it has a long
power-law tail (then fixed intervals already leave much remembered). The FSRS-6 rows also show the
exported exponential curve under-predicting long-interval recall, so on such learners it would
schedule reviews early: safe for memory, costly in time. Checking the curve's shape on the first
real memory tests (likelihood of `exp` against `fit`, both already in `forgetting.js`) is the
cheapest way to find out which row applies.

### 8.3 What to do next

1. **Owner's call: schedule reviews by predicted recall** (8.2). adaptation.js can now read the
   fitted curve; a live switch is the owner's.
2. **Check the curve's shape on real memory tests** once 20 learners have 400 between them
   (`SCORECARD_FORGET_SHAPE=fit SCORECARD_FORGET_JOINT=on` against the default, on held-out tests).
3. **Validate language level** on real items: the wordy-against-plain gap per learner, against a
   short calibrated reading check for a sample of learners.
4. **Confidence**: the trait (self-efficacy) is now measurable from the taps; calibration itself
   needs a tap on every question (round 4 call), asked with the answer (Guggenmos 2021).

---

## Sources

Learning science
- Pashler, McDaniel, Rohrer & Bjork (2008). Learning styles: Concepts and evidence. *PSPI* 9(3). https://digitalcommons.usf.edu/psy_facpub/1765/
- Kalyuga (2007). Expertise reversal effect and its implications for learner-tailored instruction. *Ed Psych Review* 19. https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf
- Kalyuga & Sweller (2005). Rapid dynamic assessment of expertise to improve the efficiency of adaptive e-learning. *ETR&D* 53. https://doi.org/10.1007/bf02504800
- Snow (1977), aptitude–treatment interaction conclusions (DTIC report). https://apps.dtic.mil/sti/pdfs/ADA034770.pdf
- Dunlosky et al. (2013). Improving students' learning with effective learning techniques. *PSPI* 14(1). Summary: https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html
- Cepeda, Pashler, Vul, Wixted & Rohrer (2006). Distributed practice in verbal recall tasks. *Psych Bulletin* 132(3). https://pubmed.ncbi.nlm.nih.gov/16719566/
- Lindsey, Shroyer, Pashler & Mozer (2014). Improving students' long-term knowledge retention through personalized review. *Psych Science* 25(3). https://home.cs.colorado.edu/~mozer/Research/Selected%20Publications/reprints/LindseyShroyerPashlerMozer2014.pdf
- Rowland (2014), testing-effect meta-analysis, *Psych Bulletin* 140(6) (doi 10.1037/a0037559); Adesope, Trevisan & Sundararajan (2017), *Review of Ed Research*. Summary of both: https://www.frontiersin.org/articles/10.3389/fpsyg.2018.02412/full ; https://education.wsu.edu/documents/2018/01/rethinking-use-tests.pdf/
- Bisra, Liu, Nesbit, Salimi & Winne (2018). Inducing self-explanation: a meta-analysis. https://summit.sfu.ca/item/34322
- Bertsch, Pesta, Wiscott & McDaniel (2007). The generation effect: a meta-analytic review. https://pubmed.ncbi.nlm.nih.gov/17645161/
- Barbieri, Miller-Cotto, Clerjuste & Chawla (2023). A meta-analysis of the worked examples effect on mathematics performance. *Ed Psych Review* 35. https://doi.org/10.1007/s10648-023-09745-1 (the g value differs between the abstract, 0.48, and an earlier poster, 0.43)
- Fyfe, McNeil, Son & Goldstone (2014). Concreteness fading in mathematics and science instruction. https://www.doi.org/10.1007/S10648-014-9249-3
- Rey et al. (2019). A meta-analysis of the segmenting effect. https://www.doi.org/10.1007/S10648-018-9456-4
- Brunmair & Richter (2019). Similarity matters: a meta-analysis of interleaved learning. https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf
- Sundararajan & Adesope (2020). Keep it coherent: a meta-analysis of the seductive details effect. https://rex.libraries.wsu.edu/esploro/outputs/journalArticle/Keep-it-Coherent-A-Meta-Analysis-of/99900601155501842 (moderator results differ between summaries)
- Walkington (2013), context personalization in algebra. Summary: https://edsurge.com/news/2013-11-08-can-interest-based-personalization-deliver-better-learning-outcomes ; Bernacki & Walkington (2018), *J Ed Psych*: https://oasis.library.unlv.edu/edpsych_fac_articles/190
- Sinha & Kapur (2021). When problem solving followed by instruction works: evidence for productive failure. *Review of Ed Research* (doi 10.3102/00346543211019105). Summary: https://www.timeshighereducation.com/campus/using-productive-failure-activate-deeper-learning
- Kluger & DeNisi (1996). The effects of feedback interventions on performance. https://cris.huji.ac.il/en/publications/the-effects-of-feedback-interventions-on-performance-a-historical/
- Sailer & Homner (2020). The gamification of learning: a meta-analysis. https://link.springer.com/article/10.1007/s10648-019-09498-w
- Banas, Dunbar, Rodriguez & Liu (2011). A review of humor in educational settings (doi 10.1080/03634523.2010.496867). Later review: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11814177/
- Macnamara & Burgoyne (2023). Do growth mindset interventions impact students' academic achievement? *Psych Bulletin*. https://doi.org/10.1037/bul0000352 (disputed by Burnette et al. 2023 and Tipton et al.)
- Deslauriers, McCarty, Miller, Callaghan & Kestin (2019). Measuring actual learning versus feeling of learning. *PNAS* 116(39). https://openlab.citytech.cuny.edu/gamelab/files/2023/01/Deslauriersa-et-al-2019.pdf
- Brysbaert (2019). How many words do we read per minute? *J Memory & Language* 109. Summary: https://www.bps.org.uk/research-digest/most-comprehensive-review-date-finds-average-persons-reading-speed-slower

Measurement and modelling
- Hedge, Powell & Sumner (2018). The reliability paradox. *Behavior Research Methods* 50. https://pmc.ncbi.nlm.nih.gov/articles/PMC5990556
- Pelánek (2016). Applications of the Elo rating system in adaptive educational systems. *Computers & Education*. https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- Settles & Meeder (2016). A trainable spaced repetition model for language learning (half-life regression). ACL. https://aclanthology.org/P16-1174
- FSRS (Ye et al.): overview https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm ; implementation notes https://borretti.me/article/implementing-fsrs-in-100-lines
- Wise & Ma (2012), normative-threshold method for rapid guessing (NCME), as applied in a 2023 *Frontiers in Education* study: https://doi.org/10.3389/feduc.2023.1127644 ; R implementation: https://search.r-project.org/CRAN/refmans/aberrance/html/detect_rg.html
- Fleming & Lau (2014). How to measure metacognition. *Frontiers in Human Neuroscience* (doi 10.3389/fnhum.2014.00443)
- Clement, Roy, Oudeyer & Lopes (2015). Multi-armed bandits for intelligent tutoring systems. *JEDM* 7(2). https://arxiv.org/abs/1310.3174

LLM prompting and cost
- Jaroslawicz et al. (2025). How many instructions can LLMs follow at once? (IFScale). https://arxiv.org/abs/2507.11538
- Liu et al. (2024). Lost in the middle: how language models use long contexts. *TACL* 12. https://aclanthology.org/2024.tacl-1.9/
- DeepSeek API, context caching (KV cache) guide. https://api-docs.deepseek.com/guides/kv_cache

Round 4 (section 7)
- Tetzlaff, Simonsmeier, Peters & Brod (2025). A cornerstone of adaptivity: a meta-analysis of the expertise reversal effect. *Learning and Instruction* 98, 102142. https://doi.org/10.1016/j.learninstruc.2025.102142 ; abstract: https://www.pedocs.de/frontdoor.php?source_opus=34113
- Salden, Aleven, Schwonke & Renkl (2010). The expertise reversal effect and worked examples in tutored problem solving. *Instructional Science* 38(3). https://researchportal.hw.ac.uk/en/publications/the-expertise-reversal-effect-and-worked-examples-in-tutored-prob/
- Koedinger, Carvalho, Liu & McLaughlin (2023). An astonishing regularity in student learning rate. *PNAS* 120(13). Replication: https://educationaldatamining.org/EDM2024/proceedings/2024.EDM-short-papers.40/index.html ; critique (2026 preprint): https://fugumt.com/fugumt/paper_check/2605.01690v1 ; summary: https://hechingerreport.org/proof-points-the-myth-of-the-quick-learner/
- Wilson, Shenhav, Straccia & Cohen (2019). The Eighty Five Percent Rule for optimal learning. *Nature Communications* 10. https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579
- Jansen, Louwerse, Straatemeier, Van der Ven, Klinkenberg & Van der Maas (2013). The influence of experiencing success in math on math anxiety, perceived math competence, and math performance. *Learning and Individual Differences* 24. Summary in https://pmc.ncbi.nlm.nih.gov/articles/PMC10299571
- Papoušek & Pelánek (2015). Impact of adaptive educational system behaviour on student motivation. AIED 2015. https://www.fi.muni.cz/~xpelanek/publications/aied15.pdf
- Lin et al. (2024). The personalized learning by interest effect on interest, cognitive load, retention, and transfer: a meta-analysis. *Educational Psychology Review* 36, 88. https://link.springer.com/article/10.1007/s10648-024-09933-7
- Cen, Koedinger & Junker (2007). Is over practice necessary? Improving learning efficiency with the Cognitive Tutor through educational data mining. AIED 2007. Case study: https://datashop.phzh.ch/about/casestudies.html
- Pelánek & Řihák (2017). Experimental analysis of mastery learning criteria. UMAP 2017. https://www.ics.muni.cz/en/research/publications/1392193
- Rawson & Dunlosky (2022). Successive relearning: an underexplored but potent technique. *Current Directions in Psychological Science* 31(4). https://journals.sagepub.com/doi/full/10.1177/09637214221100484 ; Rawson et al. (2018) figures via https://www.sec-ed.co.uk/content/best-practice/a-teacher-s-guide-to-retrieval-practice-successive-relearning
- Tabibian, Upadhyay, De, Zarezade, Schölkopf & Gomez-Rodriguez (2019). Enhancing human learning via spaced repetition optimization. *PNAS* 116. https://pmc.ncbi.nlm.nih.gov/articles/PMC6410796
- Duolingo's HLR A/B test (company blog): https://blog.duolingo.com/how-we-learn-how-you-learn
- Lindsey et al. (2014), as in section 3; the comparison condition was a generic spaced scheduler reviewing the least recently studied chapter.
- Guggenmos (2021). Measuring metacognitive performance: type 1 performance dependence and test-retest reliability. *Neuroscience of Consciousness*. https://pmc.ncbi.nlm.nih.gov/articles/PMC8633424/
- Rahnev (2025). A comprehensive assessment of current methods for measuring metacognition. *Nature Communications* 16. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11735976/
- Hu & Nation (2000), lexical coverage and comprehension; replication (Kremmel et al.): https://aila2021.dryfta.com/program/abstract-archive/abstract/public/416/unknown-vocabulary-density-reading-comprehension-and-the-98-coverage-figure-replicating-hu-nation-2000
- Kuperman & Van Dyke (2011) and later eye-movement work on reading skill (summary of findings via the studies listed at https://par.nsf.gov/biblio/10500898)
- Puig-Mayenco et al. (2023). The LexTALE as a measure of L2 global proficiency: a cautionary tale. *Linguistic Approaches to Bilingualism*. https://research.polyu.edu.hk/en/publications/the-lextale-as-a-measure-of-l2-global-proficiency-a-cautionary-ta/
- Deng, Xu, Kohavi & Walker (2013). Improving the sensitivity of online controlled experiments by utilizing pre-experiment data (CUPED). WSDM. https://exp-platform.com/cuped/
- Settles & Meeder (2016). A trainable spaced repetition model for language learning (half-life regression). ACL. https://aclanthology.org/P16-1174/
- Open Spaced Repetition, "The Algorithm" (FSRS-4.5 / 5 / 6 formulas and default parameters). https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
- Pavlik & Anderson (2005). Practice and forgetting effects on vocabulary memory: an activation-based model of the spacing effect. *Cognitive Science* 29(4).
- Wixted & Ebbesen (1991). On the form of forgetting. *Psychological Science* 2(6).
- Zhan, Castanheira & Fleming (2026, preliminary). Test-retest reliability of metacognitive bias, efficiency and control sensitivity. https://escholarship.org/uc/item/5133j4cs
- Stankov, Lee, Luo & Hogan (2012). Confidence: a better predictor of academic achievement than self-efficacy, self-concept and anxiety? *Learning and Individual Differences* 22. https://research.usq.edu.au/item/q4592/confidence-a-better-predictor-of-academic-achievement-than-self-efficacy-self-concept-and-anxiety
- Stankov, Kleitman & Jackson (2015). Measures of the trait of confidence. In Boyle, Saklofske & Matthews (eds), *Measures of Personality and Social Psychological Constructs*. https://research.usq.edu.au/item/q457z/measures-of-the-trait-of-confidence
- Martiniello (2008). Language and the performance of English-language learners in math word problems. *Harvard Educational Review* 78(2). https://people.ucsc.edu/~ktellez/martiniello.pdf
- Abedi & Lord (2001). The language factor in mathematics tests. *Applied Measurement in Education* 14(3).
