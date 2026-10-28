# The learning scorecard

How the app learns how each person learns, and how that reaches the one prompt
that writes a level for them.

## In one paragraph

Every learner has a scorecard of 100 stats, each scored 0–100 with its own
confidence. The stats are measured from behaviour — how a learner reads, answers,
recovers from mistakes, and remembers — not from what they say about themselves.
The confident ones are turned into a short ranked list of plain instructions,
and that list goes into the details brief (`services/details.js`) the level
editor sends with the creator's page (`services/level-editor.js`), next to the
survey in the learner's own words and what they said about earlier levels. One
call rewrites the level for that learner, and the rewrite is checked before it
is served.

A note on "learning styles": matching teaching to what someone says they prefer
(visual, auditory and so on) does not hold up when tested. Every stat here is
something the app can observe and act on, and is scored from what the learner
does.

## Where the code is

| File | What it does |
| --- | --- |
| `services/scorecard/stats.js` | The 100 stats: name, what low and high mean, and the instruction each side produces |
| `services/scorecard/index.js` | Storage (`scorecards`) and the arithmetic that moves a score |
| `services/scorecard/signals.js` | Behaviour → evidence. The whole signal-to-stat map lives here |
| `services/scorecard/irt.js` | Item-calibrated ability (Elo / Rasch): what each answer was expected to be, so behaviour is read against it |
| `services/scorecard/forgetting.js` | The forgetting model (half-life regression fitted to everyone's memory tests) behind decay rate |
| `services/scorecard/translate.js` | Scores → a short ranked list of instructions, with conflicts resolved |
| `services/scorecard/hooks.js` | Where the learning loop hands evidence over; one `level_signals` row per level |
| `services/scorecard/contract.js` | The insertion contract: the one versioned object every lesson- or curriculum-changing consumer reads (round 6; see "The insertion contract") |
| `services/scorecard/summary.js` | The plain-language learning-style summary (profile and admin) |
| `services/personalize.js` | The scorecard section of the brief, holdout and experiments, the extra page checks, the model's read of a session |
| `services/details.js` | The brief the level editor sends — now including the scorecard |
| `services/level-editor.js` | The one prompt that writes a level for one learner |
| `routes/admin.js`, `public/js/admin.js` | The admin panel |

## The 100 stats

Ten categories of ten. Hover-level detail (what 0 and 100 mean for each) is in
`stats.js` and on the learner's profile page.

| Category | Stats |
| --- | --- |
| Intake and processing | intake baseline, working memory span, processing velocity, chunk granularity, abstraction tolerance\*, example density need, text density tolerance, vocabulary ceiling, jargon absorption, spatial anchoring |
| Reasoning architecture | deductive trajectory, inductive trajectory, cognitive flexibility, analogical transfer, causal chain depth, systems thinking, pattern detection, logical rigor, contradiction sensitivity, global framing need |
| Pacing and cycle architecture | cycle architecture, attention runway, warm-up latency, fatigue curve, momentum dependence, interleaving tolerance, rush tendency, deliberation depth, session rhythm, re-entry cost |
| Stimulus envelope and engagement | stimulus envelope, novelty hunger, humor receptivity, narrative pull, gamification response, challenge appetite, curiosity hook, interest transfer, relevance demand, tone formality |
| Memory and retention | retrieval strength\*, recognition–recall gap, decay rate\*, elaboration benefit, mnemonic receptivity, consolidation need, interference susceptibility, enactive encoding, generation effect, retention index\* |
| Failure response and resilience | failure response, error recovery speed, frustration threshold, hint dependency, help seeking, guessing propensity, perfectionism, productive struggle, confidence calibration, error-driven learning\* |
| Metacognition and self-regulation | self monitoring, strategy awareness, mastery orientation, autonomy preference, structure need, instruction adherence, reflection depth, question generation, self-efficacy, planning tendency |
| Communication and representation | step explicitness, worked example dependence\*, scaffolding fade, notation comfort\*, brevity preference, repetition tolerance, feedback granularity, feedback tone sensitivity, open-response performance, dialogic preference |
| Motivation and affect | intrinsic motivation, extrinsic reward sensitivity, competitive drive, praise sensitivity, evaluation anxiety, boredom susceptibility, persistence, social framing, identity alignment, emotional engagement |
| Transfer and mastery | near transfer\*, far transfer, application orientation, conceptual bias, prior knowledge\*, misconception persistence\*, integration tendency, depth–breadth, creative extension, mastery velocity\* |

\* Also tracked per subject: being advanced in maths says little about being
advanced in Spanish.

## How a score moves

Evidence arrives as observations: a stat, a value 0–100, and a weight 0–1 for
how strong that one piece of evidence is.

- **Two scores: shown and measured.** Every stat keeps the score the learner
  and admin see (`score`) and a **measured** score (`measured`). Everything
  moves the shown score. Only what the learner did — answers, levels, lesson
  pages, sessions, feedback taps, placement, experiments — moves the measured
  one; the questionnaire nudges it as a starting point but adds no evidence
  mass; the after-level model read never touches it. **Confidence comes only
  from measured evidence, and lessons are built only from the measured score.**
  A model that keeps suggesting the same thing can move what is shown, but can
  never make the app sure of it or change a lesson because of it. Evidence mass
  is also kept by source (`src`: behaviour, experiment, questionnaire, model
  read), and the profile view returns it. Cards from before this were migrated
  from their log: a stat moved only by the read or the questionnaire keeps its
  shown score but starts with no measured evidence.
- **Weights encode trust.** A self-report is 0.05–0.25 (the questionnaire seeds
  at 0.6, as a nudge with no mass). A clear pattern within a level is 0.2–0.3. A
  placement, a designed test of many items, counts as 4. Stats read by a model
  (rates, contrasts, shifts, taps, experiments, forgetting; below) get their
  evidence mass from their posterior uncertainty instead of a hand-set weight.
- **Precision update.** The score moves toward the new value in proportion to
  the new evidence against the evidence already held, so early evidence moves a
  score a lot and later evidence refines it. The starting value holds with a
  prior strength set by how much learners differ on the stat, once there is a
  population to say so (1 unit until then).
- **Capped steps.** No batch moves a stat more than 15 points
  (`SCORECARD_MAX_STEP`), and a batch's total weight is capped, so one unusual
  session cannot redefine anyone. A placement may move it up to 40.
- **Memory by time.** Evidence fades with a 90-day half-life
  (`SCORECARD_HALF_LIFE_DAYS`), whether or not anything new arrives (it was a
  ×0.97 decay per update, which made a stat touched by every answer forget in
  days and one touched rarely keep evidence for months). The mass is capped, so
  a learner who changes is followed rather than held to who they were.
- **Confidence** comes from the measured evidence mass, as of now: about 63% at
  three units, 93% at the cap.
- **Per-subject reads** blend the subject's own record with the overall one.
  Prior knowledge never borrows: a subject with no placement or evidence of its
  own reads as unknown, so a full maths record cannot make a first Spanish
  lesson look certain.
- **Item-calibrated ability (Elo).** `mastery.recordAttempt` asks
  `scorecard/irt.js` what each answer was expected to be before it updates the
  skill: P(right) = sigmoid(ability + skill offset − difficulty of the item's
  label − extra difficulty of a typed answer). The label and format difficulties
  are calibrated across all learners (one shared `content_cache` row); the
  learner's ability is on their scorecard row, the skill offset on the skill's
  state (`skill_states.elo`). Rapid guesses, coach-assisted answers and answers
  on a skill last practised a day or more ago (memory tests) are left out of the
  updates. Mastery, the review schedule, level-up and placement read none of it.
  Each answer's context (expected, the gap since the skill was last practised,
  whether the answer before was a miss, its time against the learner's own usual
  pace) is what the signals below read.
- **Rates, for things that only happen one way.** Coach use, a rapid answer, a
  long careful answer, a heavily revised answer, a repeated mistake, stopping
  after a run of misses and going back over a lesson are events; not doing them
  is not an event. Scored as values, such stats walked to the event's value
  however rarely it happened. They are counted as events out of chances
  (`RATES` in `signals.js`), faded with a 90-day half-life: coach reliance
  (coach use on items within the learner's reach, not just after a miss), help
  seeking (coach use when stuck, read over their own unstuck rate; a rapid answer
  when stuck is frustration's evidence, not a chance), deliberation (over 2.5×
  their own usual time), perfectionism, misconception persistence and
  error-driven learning (out of misses on a skill with a past tagged mistake, so
  ability is out of it), persistence (stopping out of every run of three misses
  with questions left: the rest of the level left unanswered, or the next
  answer only after a break of 30+ minutes; see "Quits" below), rush (rapid
  answers not right after a miss, and skimmed pages), consolidation need and
  text density tolerance (scroll-backs over a recorded lesson). The score compares the learner's rate with a norm (50 at the
  norm, 75 at three times it, 25 at a third of it), from a Beta posterior that
  starts at the norm as if 40 chances had been seen. Norms start as stated
  assumptions and are replaced by the population median once 20 learners have
  30+ chances.
- **Contrasts.** Guessing is rapid answering on multiple choice beyond the
  learner's rapid rate on typed answers (both sides centred on their pooled
  rate, so general haste cancels); frustration is rapid answering right after a
  miss beyond their own rapid rate on the other answers (round 3; it was a
  value, "rushed half the answers after misses", which a learner who rushes
  everything earned as easily). Each is read as a normal posterior around the population's
  median difference with the between-learner spread the population shows
  (method of moments), so a chance run of fast choices is held near the norm.
  Calibration and self-monitoring are the type-2 ROC area over the three taps
  (guess < think < sure): the chance a right answer got a more confident tap than
  a wrong one (Fleming & Lau 2014), unaffected by how often they tap "sure" and
  by how often they are right, shrunk the same way.
- **Shifts against expectation.** Failure response and error recovery are the
  logit shift of answers right after a miss against the learner's other answers,
  each read as right − expected (one Newton step of a logistic shift), with the
  expectation leaving out the previous answer's own update (otherwise a miss
  lowers the expectation and the next answer looks like a recovery), and rapid,
  coached and memory-test answers left out. Normal posterior around the
  population's median, with its spread. Since round 3 warm-up (the first three
  answers of a level against the rest), fatigue (first half of a long level
  against the second) and momentum (the rest of a level after two opening
  misses, against the same positions after another start) are shifts the same
  way; they, and frustration, are never confident before there is a population,
  since a level's own order is in every learner's numbers.
- **Answer pace (round 3).** Processing velocity rests on the learner's typical
  log(answer time / the time the item deserves) over ordinary answers (not
  rapid, no coach, not a deliberate think over 2.5× their own pace), kept as
  faded sums in `irt.js` and read against the population's. Its older value
  path ("fast and right" 75, "slow and wrong" 30; reading speed; pace taps)
  still moves the score shown, but counted being right, so ability leaked in;
  the standing below rests on pace alone.
- **Mastery velocity (round 3).** The slope of ability over practice: every 10
  fresh, unaided, non-rapid answers go into a bin (when, how many right, the
  mean and variance of the items' calibrated label + format difficulty, never
  the skill's own Elo, which follows the learner), and one logistic fit per
  learner gives P(right) = sigmoid(a + slope · t − difficulty), t in hundreds of
  answers. The course getting harder is in everyone's slope, so the slope is
  read against the population's slopes and is never confident before there is
  one; a directive needs 300 fresh answers. In simulation its sampling error
  after 100 levels (0.096 logits per 100 answers) is still larger than the true
  spread between learners (0.056): r 0.5, no directive yet. (So the app does
  not tailor on "fast learner": across 27 datasets students differed greatly
  in what they knew at the start but learned at very similar rates per
  practice opportunity, Koedinger et al. 2023.)
- **Reach: where the learner stands against the course (round 4).** The one
  learner-by-teaching interaction with a replicated effect is expertise
  reversal: learners behind what the material assumes learn more with full
  support, learners ahead of it with support faded (meta-analysis of 60
  experiments: d 0.505 and 0.428, Tetzlaff et al. 2025). What matters is
  expertise against the material in front of them, now, which placement does
  not measure (it only picks the level). So `irt.js` keeps, per subject, a
  faded mean over about the last 100 fresh, unaided, non-rapid answers of the
  logit of what the ability model expected of each answer before it was seen:
  how far within reach the items the course serves this learner are, whatever
  the difficulty labels mean. Scaffolding fade is that, read as a standing
  among the subject's learners (the Elo's own tracking error, variance
  K / (2 − K·I) = 0.02 at its floor learning rate, is part of each learner's
  noise); never before there is a population, and a directive needs 150 fresh
  answers in the subject. A practice answer's subject is its sitting's. In
  simulation: r 0.79 at 100 levels, 34 directives per 200 learners (30–45 at
  three other seeds), one false in four seeds (a learner at 51).
- **Taps against the level.** Challenge appetite is the success rate the learner
  prefers, from "too easy / too hard / right" taps read against that level's
  accuracy (a grid posterior; "too easy" at 95% and at 60% say different
  things). A right answer on a stretch item no longer raises it: that was
  ability.
- **Experiments, pooled then individual.** A lesson taught one way on purpose
  is credited with its outcome's answers against expectation (the next level's
  main questions; an AI lesson's or a block lesson's own checks; delayed
  reviews on its skill), kept as raw residual sums per arm. The estimate is the
  difference between arms, shrunk toward the population's median difference by
  the spread between learners the population shows: if learners do not
  measurably differ, every learner is held at the population answer, which then
  belongs in the default lesson rather than in one learner's directives.
  Experiments go four times as often to the two kept lesson constructs
  (interest-based examples, length) as to each other choice
  (`PERSONALIZE_FOCUS_WEIGHT`).
- **The forgetting model.** Every memory test goes to `forgetting.js`:
  P(right) = guess + (expected − guess) · 2^(−days / half-life), log2 half-life =
  a + b·(earlier right) + c·(earlier wrong) + this learner's multiplier. The
  curve (a, b, c) is fitted by maximum likelihood to every learner's last 200
  tests; the learner's multiplier is shrunk toward the population's median. The
  review interval is in the model, so the schedule no longer moves the stat, and
  ability is out of it (expected). Decay rate, retention index and retrieval
  strength all come from it. Until there is a population (20 learners) the stat
  is shown but never confident: an unfitted curve would push everyone the same
  way. (Round 4 fixed a bug that had corrupted it since round 3: each answer's
  stored context packed "earlier right answers" and the pace flag under the
  same key, so the curve saw 0 or 1 earlier right answers and nearly every
  attempt as wrong. Decay rate's simulated r went 0.49 -> 0.54.)
- **The fitted curve, for review scheduling** (round 5). `scorecard.forgettingCurve({ userId, trackId })`
  (`services/scorecard/index.js`) returns the curve `services/adaptation.js`
  `predictedRecall` should use instead of `DEFAULT_CURVE`:
  `{ curve: {a, b, c}, fitted, source: 'population'|'default', m, mSd, mSource: 'learner'|'population'|'none', norm, tau, tests, learners, learnerTests, cap }`.
  Read it with `forgetting.recallAt(result, { days, right, wrong, fresh = 0.95, guess = 0 })`
  (or `forgetting.predict(result.curve, [days, right, wrong, fresh, guess], result.m)`).
  Inputs: `userId` (optional) also fits that learner's half-life multiplier `m`
  from their own memory tests, shrunk toward the population's typical learner;
  `trackId` (optional) limits that to the subject's tests. Without `userId`, `m`
  is the population's median learner. **Count basis:** the curve was fitted with
  `right` / `wrong` = all earlier right / wrong answers on the skill (massed and
  spaced alike, capped at `cap` = 15) and `days` = days since the skill was last
  answered; an objective's `nc` / `nw` in `coverage.js` are that count, its
  `checks` are not (feeding spaced checks alone into the fitted curve
  under-states half-lives). **Fallback:** before there is a fitted curve (20
  learners with 400 memory tests between them) or on any error, it returns
  `DEFAULT_CURVE`, `m` 0, `fitted: false`: the same numbers adaptation uses
  today. The population figures are cached for ten minutes, so it is cheap to
  call per plan. `forgetting.recallCurve(pop, rows, today)` is the pure version.
  `recallAt` also takes `spacedRight` / `spacedWrong` (earlier right / wrong
  answers given a day or more after the skill was last practised); the default
  curve gives them no weight, so passing them is harmless. Measured in
  simulation (round 5): the fitted curve predicts a learner's true recall of a
  skill 30 days on with mean error 0.08-0.10 and r 0.77-0.82 (the default
  curve: 0.11 / 0.76), slightly low on average (it under-predicts by 0.03-0.09).
  Spaced-answer terms, a power-law shape and a joint refit are in the code
  behind `SCORECARD_FORGET_FEATURES=spaced`, `SCORECARD_FORGET_SHAPE=fit`,
  `SCORECARD_FORGET_JOINT=on`, off by default (BASELINE step 30).
- **Two kinds of evidence combine.** A stat with both single observations
  (length taps, say) and a model (an experiment) keeps both, weighted by their
  evidence; neither overwrites the other.
- **Starting point.** A new learner starts at the population average for each
  stat once 20+ learners are confidently measured, and at 50 before that —
  always with zero confidence.

Every move is logged with its source and a note, and the learner sees the
latest ones on their profile page.

## Where the evidence comes from

| Source | What it measures |
| --- | --- |
| Every answer | its expected value from the ability model, then: rapid answers by format (guessing contrast, rush rate), rapid answers right after a miss against otherwise (frustration contrast), time against the learner's own pace (deliberation), answer pace (processing velocity), the slope of ability over practice every 10 fresh answers (mastery velocity), the "how sure are you?" tap shown on about one question in three (calibration, self-monitoring; and, since round 5, how often a right answer was tapped "sure": confidence as a trait, self-efficacy, a rate), coach use when within reach and when stuck (rates), heavy revisions of a typed answer (a rate), and how far within reach it was expected to be (reach: scaffolding fade, per subject) |
| Memory tests | any answer on a skill last practised a day or more ago, against the forgetting curve with its real interval (decay rate, retention, retrieval strength); and the delayed outcome of an experiment on that skill |
| A closed level (sessions, and block levels since round 2) | answers after a miss against expectation (failure response, recovery), rushing or keeping pace after misses (frustration), first half against second half (fatigue), slow starts (warm-up), early stumbles (momentum), the wordier half of the questions against the plainer half (language level, since round 5: vocabulary ceiling), typed against chosen answers, the same tagged mistake again out of misses (a rate) |
| A session | stopping after a run of misses (persistence, a rate), focused minutes (breaks of a resumed sitting left out), leaving early, how a return after days away went, how regular study is |
| A sitting left unfinished | when opening another level closes the learner's open sitting on their own level (`routes/learn.js` → `hooks.onSessionAbandoned`), the sitting is read as left at its last answer: a level left after a run of misses is a quit (persistence). A preview being closed, and a privileged skip or jump, are not quits and are not passed |
| A lesson (creator page, AI lesson, block lesson) | time on the page against its length, and how often they scrolled back up over it (consolidation need, text density tolerance); then the practice level after it, credited back to the page |
| Experiments | one way of teaching tried on purpose, credited by the level after it and again by delayed review |
| The feedback form | the pace and length taps (low weight); difficulty taps against the level's accuracy (challenge appetite); the words feed the existing conclusions and the model's read |
| Placement | prior knowledge in that subject (a designed test: weight 4; about 10 points of error in its standing) |
| The questionnaire | a starting nudge on 13 stats: it moves the scores but adds no confidence |
| The after-level read | DeepSeek reads every level — with the feedback if they left any, otherwise their wrong answers, timings and coach messages. It suggests stat changes only on a level the learner wrote about, under the one-point rule below, and they move only the shown score, never confidence or a lesson |

## From scores to instructions

`translate.js` is the only place numbers become words.

1. **Filter.** A directive says "this learner is unusual on this", so once
   there is a population the question is asked of the learner's **standing**
   among learners (`scorecard.standing`, round 3): each kind of measurement —
   a rate as a logit with its counting variance, a contrast, a ROC area, a shift,
   the tap grid, answer pace, the slope of ability, and the value path of the
   two stats whose observations read one behaviour (brevity's length taps;
   prior knowledge's placement, one test of about 10 points' error) as a
   weighted mean with the population's pooled within-learner variance — is read
   against the population's centre and true spread (method of moments: the
   spread of learners' estimates with their sampling noise taken out). That
   gives a posterior for z, the learner's place in between-learner SDs. What is
   measured is a behaviour, not the trait, so the posterior is widened as if the
   behaviour correlated 0.9 with the trait (`SCORECARD_VALIDITY`; 0.8 for a
   standing read through a second model — forgetting, mastery velocity). A
   directive then needs P(the trait is on that side of the typical learner)
   ≥ 0.98 (`SCORECARD_SIDE_P`) and a best estimate at least 0.88 SD from the
   middle (`SCORECARD_MEAN_Z`: about the top or bottom fifth). The mixed value
   paths (attention runway, intake, and the like: observations of several
   behaviours averaged) are not read as standings; read that way they went
   false. Two kinds steer no lesson at all: the forgetting model's stats (decay,
   retention, retrieval: its posterior was found over-confident in simulation)
   and a rate read inverted as a second stat (text density tolerance,
   error-driven learning: the first stat's evidence). **With no population
   yet** (fewer than 20 learners with that kind of evidence) the old gate
   applies: the measured score at least 20 points from neutral
   (`SCORECARD_EDGE`), at least 30% confident (`SCORECARD_MIN_CONFIDENCE`), two
   standard errors from 50 (`SCORECARD_GATE_Z`; the standard error is 25 /
   √(1 + measured mass)), and the same trait rule reading 17 points as one SD.
   Either way the measurement must rest on enough evidence of its kind
   (`MIN_EVIDENCE`: 8 measured updates, or 30 chances for a rate — 10 with a
   standing, whose posterior carries the counting noise — 15 answers on the
   thinner side of a contrast, 10 for a shift, 6 per experiment arm, 8 taps, 20
   memory tests, 50 paced answers, 300 fresh answers for the slope, 150 fresh
   answers in the subject for reach) unless
   placement measured it. A stat nothing measures (most of them; see below)
   never produces one.
2. **Convert.** Each side of each stat has hand-written instruction text.
3. **Resolve.** Pairs that would pull against each other — "show every step"
   with "be as brief as possible" — are replaced by one instruction written for
   that combination.
4. **Rank and cap.** By impact × distance from neutral (the standing's percentile, once there is one) × confidence (the posterior's probability), at most 6
   (`SCORECARD_MAX_DIRECTIVES`; it was 22: instruction-following degrades as
   instructions pile up). Far-from-neutral ones are marked "(strong)".

## The insertion contract (round 6)

Anything that changes a lesson or a curriculum for one learner reads the
scorecard through **one versioned object**, `services/scorecard/contract.js`
(`savant.scorecard.insertion`, version `1.0.0`). It is computed on read, never
stored, never throws, and every consumer gets the same one, so a level's text,
its structure and its review timing cannot disagree about the learner.

```js
const contract = require('./services/scorecard/contract');
const c = contract.read(userId, { trackId, gradeId });   // optional: hasInterests, card, memory
contract.assertCompatible(c, 1);                          // a consumer pins the major version
```

**Inputs.** `userId` (or a `card` already read), `trackId` for per-subject
stats, `gradeId` (carried through), `hasInterests` (default: whether the
learner stated any; an interest directive needs them), `memory` (default true:
include the fitted forgetting curve).

**Output.**

| Field | What it is | Who reads it |
| --- | --- | --- |
| `contract`, `version`, `status` | name, semver, and `ok` / `empty` (nothing confident, or no learner) / `fallback` (an error: see below) | everyone |
| `lesson.directives[]` | every confident lesson directive, ranked: `stat`, `side` (`high`/`low`/`combined` with `parts` and `sides`), `text`, `strong`, `gate` (`standing`: the calibrated posterior; `score`: the pre-population gate; `test`: placement), `p` (posterior probability it is on that side; null on the score gate), `confidence`, `evidence` (`kind`, `count`), `priority` | adaptation, admin, diagnostics |
| `lesson.sides` | `{stat: 'high'\|'low'}`, combined instructions split back into their parts | adaptation `decide()` |
| `lesson.promptLines`, `lesson.promptText` | the writer's block: one heading, the certainty note and at most `MAX_DIRECTIVES` (6) numbered instructions, or nothing at all | details brief (level editor), block levels (layout and fill calls), `GET /api/scorecard/prompt-block`, any one-prompt generator |
| `coach.promptLines` | the coach's block (use `C`, at most 8) | `learner.teachingBrief` |
| `structure` | what the confident sides change in a plan: `guidance`, `length`, `items`, `stretch`, `support`, `typed`, `context`, `recap`, and `changes[]` (stat, side, change) from `contract.KNOBS` | adaptation, session building |
| `memory` | `scorecard.forgettingCurve()` (fitted curve, the learner's multiplier, its source), or `DEFAULT_CURVE` with `fitted: false`; `steers: false` always | adaptation review timing, path planning |
| `population.standing_used` | whether any directive came through the calibrated standing gate | diagnostics |
| `privacy` | the rules below, as data | everyone |

**Confidence.** Nothing reaches `lesson` or `coach` unless translate's gate
passed it: with a population, P(the trait is on that side of the typical
learner) ≥ 0.98 and a best estimate in the top or bottom fifth, on enough
evidence of its kind; before there is one, the stricter score gate. `p` is that
probability; `gate` says which gate it was. Only measured evidence counts (no
model read, no questionnaire mass), and memory-kind stats never steer.

**Fallbacks.** No learner: `status: 'empty'`. Any error (storage down, a
corrupt card): `status: 'fallback'` with an `error` note, no directives, no
structure change and the default curve, which is exactly what a brand-new
learner gets. Consumers need no error handling of their own.

**Privacy.** No learner numbers, scores, logs, survey answers, free text,
names or addresses go into model-facing text: prompt lines are fixed
sentences from `stats.js` (the test checks the shape). The choice of sentences
still describes the learner, so prompt lines are personal data in aggregate:
send them only to providers allowed learner data (never to build-pipeline-only
providers). Everything else in the contract (`directives`, `sides`,
`structure`, `memory`) is internal only. The contract is computed on read and
never stored.

**Never a skip.** No scorecard reading marks a unit known or removes an
objective; what a grade must cover is `coverage.js` and `learner-path.js`, on
bank evidence only. The contract has no field that could say otherwise, and
the test checks `learner-path.js` reads nothing from the scorecard.

**Adapters** (what each consumer reads today): `forAdaptation(c)` → `{sides,
curve, structure}`; `forPrompt(c)` → the lesson lines; `forCoach(c)` → the
coach block; `forSession(c)` → `{items, support, stretch, typed}`; `forPath(c)`
→ `{curve, skip: false}`.

**Checked** by `scripts/scorecard-contract-test.js` (in `npm test`): for
learners with no, lesson-only, structure-moving and interest directives, in a
subject and without one, the contract's lines equal
`personalize.scorecardSection`, are exactly what `details.brief` (the level
editor) and block levels' tailored `learnerText` carry (and the shared text
does not), begin the prompt-block route's text, and its top directives are
translate's ranked list; its sides equal `adaptation.confidentSides` of the
gated list; `contract.KNOBS` equals `adaptation.DIRECTIVE_KNOBS`; the coach's
brief carries its coach block; two reads are identical; nothing in it is a
score, a log or an address; and a forced failure gives the well-formed
fallback. The recovery simulation also reads every card through the contract
(round 6): 0 mismatches with `translate.directives` over every checkpoint read
at four seeds.

**Consumer changes still needed** (not made here: those files belong to
other work):

1. `services/adaptation.js` `planForLevel`: read `contract.forAdaptation(c)`
   instead of calling `translate.directives` itself, and drop its copy of
   `DIRECTIVE_KNOBS` for `contract.KNOBS`. Today it passes no `hasInterests`,
   so an interest directive for a learner who stated no interests would set
   `context: 'interests'` there while the prompt drops it (the test pins this
   as the only possible difference).
2. `services/learner.js` `sessionParams`: its `stat()` reads attention runway
   and frustration from the raw measured score at 40% confidence, outside the
   calibrated gate (the mixed value path behind attention runway went false
   when read as a standing, round 3). It should use `contract.forSession(c)`.
3. `services/personalize.js` `scorecardSection` and `learner.teachingBrief`:
   build their scorecard lines from `contract.forPrompt` / `forCoach` (the
   texts are already identical; this makes it one code path).

## The after-level read, and the learner record

`services/learner-record.js`. After every level — a practice block closing, a
quiz finished, a lesson page finished — one read of that level is queued. It
waits two minutes (`RECORD_FEEDBACK_WAIT_MS`) for the learner to say something,
then sends **one prompt**:

- **With feedback:** what they liked, what they did not, anything else they
  wrote, and the pace / length / difficulty taps — next to the **full content
  of the level** (the page they read, or the questions it asked), so their
  words are read against what they were looking at.
- **Without feedback:** the questions they got wrong (their answer and the
  right one), how long every answer took against a reasonable time, their
  confidence taps and revisions, and **everything they said to the AI coach**
  while stuck mid-question — next to the same content.

A read of a level the learner wrote about also carries what each of the 100
stats means (0 and 100) — but not where this learner stands on it: shown the
current scores, a model tends to confirm them. Without any learner's numbers,
the system prompt and the stat guide are the same text for every learner and
every level, a prefix of about 3,500 tokens the provider can serve from its
prompt cache. A read of a level they said nothing about carries no stat guide
and asks for no stat changes (about 2,700 tokens less): how they performed is
already measured by the rules, and a read never changes a lesson. Then the rules for
changing a stat, and the record as it stands. The read's stat suggestions move
only the shown score (see "Two scores" above): they never raise confidence or
change a lesson. A recommendation review, which weighs a claim against the
card, still sees where the learner stands. The reply is a conclusion, the
feelings the level showed, suggested stat changes, facts (struggles down to a
question shape and a topic, each with a hint idea; likes; dislikes; feelings)
and a vote on each open recommendation. It is applied by rules, never directly:

| Rule | |
| --- | --- |
| **One point per read** | A read may suggest up to ±25 on a stat; the stat moves by 1. |
| **Big moves need many levels** | When suggestions of 15+ in one direction have come from `SCORECARD_BIG_AFTER` (11) different levels, the stat moves by their average (at most 25). |
| **Facts must be confirmed** | A fact is tentative until 3 reads support it and at least 3 in 4 agree; then it is solid. A "new" fact that says what an existing one says counts as support. |
| **Conflicts change nothing** | A read that disagrees with a solid fact, with a stat the app is ≥60% sure of, or with the direction most recent reads pushed in, becomes a recommendation with its reasoning. |
| **Recommendations are reviewed** | Every read votes on the open ones. At 3 supporting reads (`RECORD_REVIEW_AT`) and more support than opposition, a second prompt weighs it against the whole record, the scorecard and recent conclusions, and applies, rejects, or waits. Only a review can change something solid. |

The conclusion goes on the record; from feedback, it also becomes the
conclusion the profile page shows.

**What reaches the next level.** The brief the level editor sends carries the
solid facts, every struggle seen on 2+ levels — with the question shape and the
hint idea, and an instruction to add a hint at exactly that point, written to
help them understand and remember it — and what recent levels concluded.
Tentative facts and recommendations never reach a page.

**Real lessons and fillers.** A level with a creator-made page is read as that
page; every other level is labelled in the prompt as an app-generated filler
made from the question bank.

The admin panel shows the record (solid and tentative facts, struggles and
hints), the recommendations with their reasoning and review, big moves building
up, and every read with what it changed. The learner's profile shows only what
is solid.

## How it reaches the prompt

The level editor's prompt is the creator's page plus the details brief. When
anything is confident, the brief has a section headed **HOW THEY LEARN BEST
(measured from their behavior by the learning scorecard)**: a one-line note on
how sure the app is and the ranked instructions; when nothing is, it says
nothing (the writer's default is already balanced and clear). It carries no
numbers and nothing random, so it only changes when what the scorecard says
changes. A small move in a score that changes no instruction does not change
it. The older **HOW THEY ARE BEST TAUGHT** section (the questionnaire's stated
style and the analyst's observed one) is gone from the brief: it was a second,
partly conflicting channel into the same writer.

The brief is ordered for the providers' prompt caches: the fixed lines, then
what stays the same from level to level (what they told us, the measured
instructions, what their record holds for sure, notes from earlier sessions),
and last what changes every level (their feedback, where they stand on the
course, how the last few levels went, what recent reads concluded).

On a level running an experiment, one more line goes in, after the brief: **FOR
THIS LEVEL SPECIFICALLY**, naming the one way of teaching being tried.

To see exactly what is sent:

```bash
npm run scorecard:prompt -- someone@example.com english/proficient/105
npm run scorecard:prompt -- someone@example.com english/proficient/105 --full   # with the whole page
```

The same section, on its own, is available to any one-prompt generator (lessons,
true/false, tic-tac-toe, connect four...) at `GET /api/scorecard/prompt-block`.

## What is checked before a rewrite is served

The existing page contract (`inspect` and `truncated` in
`scripts/generate-base-lesson.js`), plus two checks against the creator's page:

- every element id in the creator's page is still there — the page's script
  finds its controls by id, so a missing one is a control that silently stops
- every script still compiles

A rewrite that fails is kept for diagnosis and never served; the learner gets
the shared page.

## Is it working?

```bash
npm run scorecard:report
```

- **Holdout.** One level in ten (`PERSONALIZE_HOLDOUT`) for a learner on a plan
  that writes levels is served as the shared page on purpose. The report
  compares the level after a tailored page with the level after a holdout page.
  If tailored pages do not win, a stat or an instruction is wrong.
- **Experiments.** A third of the remaining levels
  (`PERSONALIZE_EXPERIMENT_RATE`) try one way of teaching on a stat the
  scorecard is not yet sure about. The arm is a hash of learner and level, so a
  level's arm never changes and never causes a rewrite on its own.
- **Coverage.** How confident the scorecards are, and which stats are best and
  least measured.

## Models

| Route | Model | Backup |
| --- | --- | --- |
| `personalize` (the level editor, the after-level read, recommendation reviews) | DeepSeek V4.1 Flash on OpenRouter, pinned to its upstream by its model profile | MiMo V2.6 Pro |

Nothing else is in the chain, for the same reason `rewrite` was pinned: a third
vendor's page is a page the contract throws away. `AI_PROVIDER_PERSONALIZE` and
`AI_PROVIDER_PERSONALIZE_FALLBACK` override the order.

## What it does not do yet

- **Practice questions and quizzes are not reworded.** They come from the
  verified bank, and rewording a graded question can change which answer is
  right. They are still shaped by the scorecard — number of questions, typed
  against multiple choice, stretch and support share — and so is the coach.
- **A lesson page's own games report nothing back.** The page is judged by its
  reading time and by the level after it, not by what happens inside it.
- **Most stats need time, and a population.** A stat steers a level only once
  the app is 98% sure which side of the typical learner they are on and they
  are well away from the middle. In simulation (200 learners, population of 60,
  100 levels) that is about 0.9 true directives per learner and about two
  learners in three with at least one; before there is a population the gate
  is stricter (about 0.15 per learner).
- **Forgetting is information-limited on the current schedule.** The model
  reads each review against its interval now, but the fixed review intervals
  put most reviews where recall is still high, which says little about how fast
  someone forgets. In simulation even a model that knew each review's true
  half-life structure recovers decay rate at r ≈ 0.65 after 100 levels. Reviews
  scheduled nearer each learner's half-life (FSRS-style, `mastery.js`) would
  both teach more and measure more; that changes what learners see and is the
  owner's call. Measured in simulation (round 4, `--review-pick=model`):
  reviewing a skill when the app's own forgetting model predicts its recall
  has fallen below 85%, lowest first, instead of on fixed intervals, raises
  recall 30 days after the 100th level from 17% to 25% of practised skills
  (7 days: 37% to 48%) with 5% fewer review answers and the same practice
  time: about 43% more skills retained per hour of practice. Round 5 re-measured
  it at four seeds (+42% to +49% 30-day recall, +43% to +48% per hour) and on a
  second assumed memory (FSRS-6's published model, power-law forgetting): there
  the gain is +7% 30-day recall with 11% fewer reviews, and the app's
  exponential curve under-predicts long-interval recall, so it would review
  early. Which applies depends on how real learners forget; the curve's shape
  can be checked on the first real memory tests
  (`curriculum-build/SCORECARD-RESEARCH-2026-10-22.md` 8.2).
- **Quits.** The client cannot finish a practice level halfway, so a learner
  who leaves mid-level leaves the sitting open; it is resumed next time, or
  closed as abandoned when they open another level. Since round 3 both are
  read: a break of 30+ minutes right after a run of misses inside a resumed
  sitting is a stop, and an abandoned sitting goes through
  `onSessionAbandoned`. A sitting left open and never touched again is not
  counted.
- **Per-learner experiment effects need far more experiments.** A learner sees
  about ten experiments in 100 levels. With effects of a few percentage points,
  one learner's difference between arms stays mostly noise (simulated recovery
  of interest-based examples r ≈ 0.2 at 100 levels). The population answer
  (does it help people in general, and do people differ?) arrives much sooner,
  and is what the estimator holds learners to until their own data says
  otherwise.
- **Language level has only an indirect signal.** Since round 5 the app reads
  it from the answers: within each level, the wordier half of the questions
  (prompt words, long words counted twice) against the plainer half, each
  against the ability model's expectation, as a standing among learners
  (`signals.js` SHIFTS `vocabulary_ceiling`; `SCORECARD_TEXT_LOAD=off` turns it
  off). It works only if wordy items really are harder for weak readers of the
  same ability, which is replicated in direction (Martiniello 2008; Abedi &
  Lord 2001) but of unknown size here. In simulation: with an effect of 0.36
  logits per SD of wordiness for a learner at 20, r 0.72-0.80 and 2-4
  directives per 200 learners (none false); at half that, r about 0.5 and no
  directive; with no effect, r 0 and no directive. Jargon absorption still has
  no signal. A calibrated reading test (round 4, `--reading-test`) remains the
  direct route: r 0.85 with one test, 0.95 with four.
- **Most stats have no measured signal at all.** 40 of the 100 (for example
  working memory span, logical rigor, evaluation anxiety,
  near and far transfer) have no rule in `signals.js`, no experiment and no
  questionnaire item: only the after-level read moves them. Seven more are
  moved only by the questionnaire and the read. None of these can produce a lesson
  instruction: they have no measured evidence. Measured against synthetic learners with known true values
  (`scripts/scorecard-recovery-sim.js`; results and the step-by-step progress
  table in `curriculum-build/scorecard-sim/BASELINE.md`).
