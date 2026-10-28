# The learning scorecard: the evidence behind it

Round 6, 2026-10-23. What the scorecard (`services/scorecard/`) measures, every directive it can
issue, and the research and simulation evidence for each: what is supported, how strongly, what
is not supported, and what has not been shown at all. Every source was looked up and checked
(method below); the machine-readable list is `curriculum-build/scorecard-sources.json`. Simulation
rows refer to `curriculum-build/scorecard-sim/BASELINE.md`.

**Sources: 537 looked up; 509 verified, 28 not verified (listed, and used for nothing). Of the numbers quoted, 41 sources' figures were found in their abstracts by script and 3 were confirmed by web search (marked †).**

## Contents

1. How the sources were checked
2. The bottom line
3. What the evidence says the scorecard must not do
4. What every learner gets anyway (universal practices, not personalisation)
5. The one personalisation with replicated interaction evidence: expertise against the material
6. Construct by construct: measurement, research basis, code, simulation, limits
7. Why the gate is built the way it is (statistics and measurement)
8. From directives to a written level (language-model evidence)
9. The insertion contract
10. What the simulation shows, and what it cannot
11. Real-data checks that would confirm or refute each piece
12. Round 6 steps (BASELINE rows 35+)
13. Sources

## 1. How the sources were checked

- **Lookup.** Each source was searched by DOI (Crossref), else by title and first author with
  the year ±1 (Crossref bibliographic search), then OpenAlex, then the arXiv API for preprints.
- **Verified** means a record was found whose title matches (token overlap ≥ 0.75), whose
  author list contains the first author, and whose year is within one of the cited year. Records
  that matched only a reprint, a book review, a dataset stub or a different paper with a similar
  title were rejected and the source either corrected (by DOI) or dropped. A first pass accepted
  some wrong matches (a 2017 paper for Piech et al. 2015, a "revisited" paper for DerSimonian &
  Laird 1986); the matching rule was tightened and every source re-checked.
- **Numbers.** An effect size attributed to a source was checked against its abstract
  (OpenAlex, Semantic Scholar, Crossref) by script: "abstract-checked" in the JSON means every
  number quoted was found there. A few anchor numbers not in the abstract were confirmed by web
  search of the paper or of secondary sources ("web" in the JSON; marked † below). Numbers that
  could not be checked either way are not quoted; the claim is stated without them.
- **Unverified sources are listed at the end and support no claim in this report.**
- **Claim-to-source check (2026-10-25).** A second, independent pass read the abstract of the
  source behind each claim and compared the two (477 claim-source pairs). Where a claim went
  beyond its source the text above was corrected; the table, quotes and the list of rules with a
  weak basis are in `curriculum-build/SCORECARD-CLAIM-CHECK-2026-10-25.md`.
- What "verified" does not mean: that the paper is right. Meta-analyses in education
  over-state effects from small, published, experimenter-measured studies by about two times
  [cheung2016]; large trials are often uninformative [lortieforgues2019]; about a third of
  psychology findings replicated in one large attempt [osc2015]. Effect sizes below are what
  the papers report, and they are read with that discount.

## 2. The bottom line

1. **Tailoring by "learning style" is not supported, and the scorecard does not do it.** The
   meshing hypothesis (teach visual learners visually) has no support in the designs that can
   test it (a crossover test) [pashler2008; rogowsky2015; rogowsky2020; massa2006; cuevas2015],
   and correlational studies agree [kratzig2006; knoll2017; husmann2019]. The scorecard has no modality stat, and the questionnaire nudges scores but adds
   no evidence mass, so it can never produce a directive (index.js `observe`; BASELINE step 2).
2. **Most of what makes a level teach well is the same for everyone**: retrieval practice,
   spacing, interleaving once learned, specific feedback, coherent and short text, worked
   examples for novices (section 4). These belong in the default lesson, not in one learner's
   directives. The scorecard's experiment estimator encodes exactly this: if learners do not
   measurably differ on a teaching choice, everyone is held at the population answer (step 9).
3. **The personalisation with the strongest replicated learner-by-teaching evidence is
   expertise against the material** (expertise reversal: d 0.505 for support to novices, −0.428
   for support withheld from experts, 60 experiments [tetzlaff2025]), followed by adapting to the
   learner's level in general [major2021: 0.35 vs 0.18 overall; connor2007; muralidharan2019],
   and review timing by each learner's own memory record [lindsey2014; settles2016]. The scorecard
   measures the first two directly (prior knowledge, scaffolding fade / reach) and exports the
   third (the forgetting curve) for review scheduling.
4. **The other directives rest on behaviours with real, replicated meaning** (rapid guessing,
   help seeking, confidence, quitting after failure, reading pace, language load), but the
   evidence that *changing a lesson* in response to each one improves learning is thinner than
   the evidence that the behaviour exists. That is why every directive must pass a calibrated
   posterior gate (P ≥ 0.98 on the learner's side, top or bottom fifth, widened for
   behaviour ≠ trait), and why the actions they trigger are small and safe (a shorter text, more
   support items, a recap), never a skip.
5. **The simulation shows the machinery recovers known truths with ≤ 2% false directives at four
   seeds; it does not show that real learners learn more.** Synthetic learners obey the model the
   simulation was written with. Section 11 lists the real-data checks that would confirm each
   piece.

## 3. What the evidence says the scorecard must not do

| Practice | Evidence | What the code does instead |
| --- | --- | --- |
| Match teaching to a self-reported style (visual / auditory / kinaesthetic, verbaliser / visualiser) | No crossover interaction in the designs that could show one [pashler2008]; matched instruction did not help comprehension [rogowsky2015, rogowsky2020]; verbaliser–visualiser matching failed in multimedia [massa2006]; style predicts what learners *think* they learned, not what they learned [knoll2017]; students rarely study in their style and doing so does not predict grades [husmann2019]; reviews [cuevas2015; willingham2015; kirschner2017; aslaksen2018]. The belief is widespread among teachers and academics [dekker2012; macdonald2017; papadatou2021; howardjones2014; nancekivell2020; newton2017] | No modality stats. The questionnaire's 13 seeded stats move the shown score only, never confidence or a lesson (step 2) |
| Trust self-report about how one learns | Self-reports of study tactics are poorly calibrated to traced behaviour [winne2002; zhou2012], and links to traced learning strategies are significant but small [gasevic2017]; self-report and behavioural measures of the "same" construct correlate weakly [dang2020; eisenberg2019]; people often cannot report the causes of their own behaviour [nisbett1977]; metacognitive self-report questionnaires are a useful overview of two factors but relate poorly to metacognitive behaviour [craig2020; veenman2006] | Directives come only from measured behaviour (`MEASURED = ['beh','exp']` in index.js) |
| Let a model's impression of the learner steer lessons | Language models tend to agree with the framing they are given (sycophancy) [sharma2024; perez2023], judge with position and self-preference biases [zheng2023; wang2023fair]; anchoring and confirmation are general properties of judgement under uncertainty [tversky1974; nickerson1998] | The after-level read moves only the shown score, 1 point per read; never confidence or a lesson (step 2). Simulated self-confirming read: false directives 42% before, identical to "off" after |
| Tailor on "fast learner" | Learners differ greatly in starting knowledge but learn at very similar rates per practice opportunity: about 0.1 log odds per opportunity [koedinger2023]; learning curves follow a law of practice, though its form (power or exponential) is disputed [heathcote2000], and practice-based models of learning are standard in tutoring research [cen2006; pavlik2009]. Prior knowledge predicts where you end up (r .534) but, on average, little of how much you gain (−.059, with a very wide spread between studies) [simonsmeier2022] | mastery_velocity is measured (step 14) but needs 300 fresh answers and a population; in simulation its sampling error exceeds the true spread, so it issues no directive |
| Personalise to interests as the main lever | Context personalisation helps situational interest and sometimes performance [walkington2013; bernacki2018; cordova1996; hogheim2015; ku2002; anand1987; reber2018], but approaches that only linked to interests or gave personalised feedback, support or assessment had smaller effects than ones that adapted to level (0.35 vs 0.18 overall, in low- and middle-income countries) [major2021] | interest_transfer is an experiment stat, weighted toward in experiments (step 9); no directive without measured per-learner benefit, and never without stated interests (contract.js) |
| Build lessons around rewards, badges or competition | Expected tangible rewards undermine intrinsic motivation (d −0.40 to −0.28) [deci1999]; gamification effects are small and heterogeneous (g .49 / .36 / .25) [sailer2020] | Those stats (extrinsic reward sensitivity, competitive drive, gamification response) have no measured signal and can never produce a directive |
| Infer persistence or ability to cope from mindset or grit questionnaires | Mindset interventions d 0.05, n.s. after bias correction [macnamara2023; sisk2018: weak]; national RCT effects concentrated in lower achievers and supportive contexts [yeager2019]; grit is very strongly correlated with conscientiousness and only moderately predicts performance [crede2017; duckworth2007] | persistence is read from what the learner does after a run of misses (a rate), never from a questionnaire |

## 4. What every learner gets anyway

These are the practices with meta-analytic support that holds across learners. The scorecard does
not personalise them; the lesson writer and adaptation apply them by default. They matter here
because a directive that duplicates one of them adds nothing, and a directive that contradicts one
needs very strong evidence.

- **Retrieval practice.** Testing beats restudy (g ≈ 0.50† [rowland2014]; g ≈ 0.61† [adesope2017]),
  transfers (d = 0.40 [pan2018]), works in classrooms (g = 0.499 [yang2021]; 57% of 49 classroom
  effects medium or large [agarwal2021]; [mcdermott2014; mcdaniel2007; roediger2011; karpicke2011;
  karpicke2008; roediger2006; roediger2006power; butler2010]). Unsuccessful
  attempts help later learning [kornell2009; richland2009; pastotter2014]. Rated high utility
  [dunlosky2013]. Children benefit too [fazio2019]. Successive relearning [rawson2011].
- **Spacing.** Distributed beats massed practice (0.46 [donovan1999]; [cepeda2006; janiszewski2003;
  latimier2021; kim2022 for L2; carpenter2012; carpenter2022; kang2016]);
  the best gap grows with the retention interval (about 20–40% of a week's delay, 5–10% of a
  year's [cepeda2008]); classroom maths [emeny2021; hopkins2016; rohrer2006; barzagar2019 found an effect only at a six-week test];
  vocabulary [sobel2011; bahrick1993]; children [vlach2012; toppino2014].
- **Interleaving once categories are learned.** g = 0.42†, heterogeneous, better for similar
  categories, worse for expository text and words [brunmair2019]; maths d 0.42 / 0.79
  [rohrer2015], classroom RCT d = 0.83 [rohrer2020]; [rohrer2007; taylor2010; kornell2008;
  kornell2010; firth2021]. Adaptation interleaves only proven objectives.
- **Feedback that explains.** d = 0.48 overall with large heterogeneity [wisniewski2020]; d = .41
  but a third of interventions lowered performance [kluger1996]; in computer-based practice,
  elaborated feedback 0.49 against 0.05 for right/wrong alone [vanderkleij2015]; [hattie2007;
  shute2008; bangertdrowns1991fb; mertens2022; vanderkleij2012; attali2015]; delayed feedback can
  aid transfer [mullet2014], though classroom studies have usually found immediate feedback
  better [kulik1988]; confident errors are hypercorrected [butterfield2001;
  metcalfe2011] and feedback also secures low-confidence correct answers [butler2008].
- **Coherent, short, segmented text.** Seductive details hurt [rey2012; sundararajan2020;
  harp1998]; more material can mean less understanding [mayer2001; mayer2005coherence;
  mayer1996]; segmenting helps [rey2019]; overview of multimedia principles [noetel2022;
  mayer2003; ginns2005; ginns2006; adesope2012]; shorter videos keep attention [guo2014;
  brame2016].
- **Guidance for novices.** Worked examples beat unguided problem solving early on [sweller1985;
  sweller1988; atkinson2000; renkl2014; vangog2011; paas1994; barbieri2023]; minimal guidance
  fails [kirschner2006; mayer2004; alfieri2011]; guidance helps inquiry (d = 0.50
  [lazonder2016]); computer-based scaffolding g = 0.46 [belland2017]; [wood1976; vandepol2010;
  sweller2019; sweller2011; paas2003; vanmerrienboer2005]. Problem solving before instruction can
  help conceptual learning (g = 0.36) but not for young learners [sinha2021]; see also [kapur2016;
  loibl2017].
- **Generation and self-explanation.** [slamecka1978; bertsch2007; mccurdy2020; chi1989;
  bisra2018; fiorella2016; fiorella2023; brod2021; pressley1987]; rereading gives little
  [callender2009].
- **Mastery before moving on** [kulik1990; bloom1984; carroll1963] and a coverage gate that needs
  evidence, not a count (`coverage.js`).

## 5. Expertise against the material

The expertise reversal effect is the scorecard's best-supported personalisation: support that helps
a novice is redundant or harmful for someone who already knows the material [kalyuga2003;
kalyuga2007; kalyuga2010; chen2017; salden2010; mcnamara1996 for text cohesion;
oreilly2007]. The 2025 meta-analysis (60 experiments, 5,924 participants) finds d = 0.505 for
high assistance to low-prior-knowledge learners and d = −0.428 for high assistance to
high-prior-knowledge learners, asymmetric (helping novices matters more than withholding from
experts), with less clear evidence for younger students and for humanities and language learning [tetzlaff2025].
Rapid in-task assessment of expertise is feasible and useful [kalyuga2004; kalyuga2005].
Adapting to level beats adapting to interests [major2021], and individualising reading
instruction by assessed skill worked in cluster-randomised trials [connor2007; connor2013].

**Code.** Two stats carry it:
- `prior_knowledge`, per subject, from placement read as one test of about 10 points' error
  (index.js `TEST_VARIANCE`; steps 3, 21); it never borrows another subject's evidence.
- `scaffolding_fade`, from *reach*: irt.js keeps per subject a faded mean (about the last 100
  fresh, unaided, non-rapid answers) of the logit of what the ability model expected of each
  answer before it was seen, read as a standing among the subject's learners with the Elo's own
  tracking variance K/(2 − K·I) ≈ 0.02 in the noise (steps 27–28).

**Directives.** prior_knowledge low → assume no background; high → skip basics. scaffolding_fade
low → keep full support; high → fade support quickly. Both move adaptation's guidance knob
(worked examples / faded / problems first), and adaptation never takes worked examples away from
an objective the learner has shown nothing on, whatever the scorecard says (adaptation.js
`decide`).

**Simulation.** prior_knowledge r 0.86, 12–25 directives per 200 learners, none false;
scaffolding_fade r 0.79–0.80, 30–45 directives, one false in four seeds (a learner at 51). Valued
with the meta-analysis' effect sizes, the directives are worth 0.093 d per learner against an
oracle's 0.206 (step 28; step 34 code).

**Not shown.** That the course's own support levels map to "high/low assistance" as the
experiments defined them; that the effect holds for language and humanities content (the
meta-analysis says it is weaker there).

## 6. Construct by construct

Each entry: what is measured and where, the research basis, the directives, simulation results
(seed 20261022 unless stated; BASELINE rows), what is not supported, and limits. Recovery r is
correlation of card with truth at 100 levels, read off.

### 6.1 Reading and answer pace — `processing_velocity`

- **Measured.** irt.js keeps faded sums of log(answer time / the time the item deserves) over
  ordinary answers (not rapid, no coach, not a deliberate think over 2.5× own pace), read as a
  standing (step 17). Its old value path ("fast and right") let ability leak in and was removed
  from the standing.
- **Basis.** Response time carries information separable from accuracy and is modelled jointly
  with it in hierarchical speed–accuracy models [vanderlinden2007; maris2012; deboeck2019]; the
  Math Garden system scores speed and accuracy together at scale [klinkenberg2011; brinkhuis2018];
  time on task helps or hurts depending on task difficulty and skill [goldhammer2014]. Adult
  silent reading averages 238 wpm (non-fiction), with most adults 175–300 [brysbaert2019];
  speed-reading claims do not hold [rayner2016]; processing speed is a stable individual
  difference [kail1994; salthouse1996]; reading rate theory [carver1992].
- **Directives.** high → shorter teaching text, more items; low → fewer items, unhurried text.
- **Simulation.** r 0.97–0.98, recall 0.93–0.95, 68–80 directives per 200 learners, none false
  (steps 17, 34).
- **Limits.** Pace confounds care with speed (speed–accuracy trade-off [heitz2014]); the
  directive changes length, not difficulty.

### 6.2 Rapid guessing and rushing — `rush_tendency`, `guessing_propensity`

- **Measured.** rush: rapid answers not right after a miss, and skimmed pages, as a rate per
  chance; guessing: rapid answering on multiple choice beyond the learner's own rapid rate on typed
  answers (a contrast, so general haste cancels) (signals.js RATES / CONTRASTS; steps 1, 8).
- **Basis.** Response-time effort and rapid guessing are well-established markers of
  disengagement on low-stakes tests [wise2005; wise2006; wise2017; wise2017gao; wise2020;
  schnipke1997; kong2007; rios2017; lee2014rt]; in tutors, "gaming the system" is a recognised,
  detectable behaviour linked to lower learning [baker2004; baker2008; walonoski2006;
  baker2010gaming]. Effort monitoring with feedback raises engagement [wise2006cbt; wise2019].
- **Directive.** rush high → the most important sentence on its own line and one "slow down here"
  warning. guessing high → teach the quick check that tells a reasoned answer from a guess.
  Adaptation used to prefer typed answers for a rusher; that switch is removed
  (`SCORECARD_DROP_RUSH_TYPED`, 2026-10-25), because the basis was weak: recall-type tests often
  produce larger testing effects than recognition [rowland2014†; mcdaniel2007], but one study
  found little or no advantage over multiple choice [smith2014], another found the better format
  depended on whether feedback was given [kang2007], and good multiple choice also works
  [little2012; mcdermott2014]. No study tests format against rushing; the effort monitor
  (too fast to count, the slow-down note) handles rushers directly.
- **Simulation.** rush r 0.89, 12–24 directives per seed, none false. Guessing directives fired
  for 184/200 learners with 47% false before rates and contrasts (baseline) and are now rare and
  correct.
- **Not shown.** That typed answers reduce rushing for a rusher specifically (hence the switch's removal).

### 6.3 Coach reliance and help seeking — `hint_dependency`, `help_seeking`

- **Measured.** Coach use on items within the learner's reach (reliance) and coach use when stuck,
  read over the learner's own unstuck rate (help seeking); rapid answers when stuck are
  frustration's evidence, not help seeking (step 8).
- **Basis.** Help seeking in learning environments is often poorly calibrated: both abuse and
  avoidance [aleven2003; aleven2006; aleven2016help; aleven2000; ryan2001; karabenick2011];
  contingent help works best [wood1999]; metacognitive feedback on help use improved help-seeking
  behaviour [roll2011].
- **Directives.** hint dependency high → open with one fully worked example of exactly this step, then ask the learner to try the next step before any hint (`SCORECARD_WORKED_HINT_TEXT`, 2026-10-25; it was "build gentle hints into the explanation", the open assistance dilemma [koedinger2007]); help seeking low → anticipate the learner's questions and answer them in the text.
- **Simulation.** r 0.71–0.75; 11–19 directives per seed, one false at two seeds (within the 2%
  budget).
- **Not shown.** That building hints into the text for heavy coach users improves their learning
  (as opposed to their hint use).

### 6.4 Confidence and calibration — `confidence_calibration`, `self_monitoring`, `self_efficacy`

- **Measured.** A "how sure are you?" tap on about one question in three. Calibration and
  self-monitoring: the type-2 ROC area (chance a right answer got a more confident tap than a
  wrong one), unaffected by how often they tap "sure" or how often they are right (step 8);
  self-efficacy: of the taps on right answers, the share that were "sure" (step 34).
- **Basis.** Type-2 ROC / meta-d′ separate metacognitive sensitivity from bias and performance
  [fleming2014; maniscalco2012; galvin2003; fleming2017; fleming2024]; gamma is biased by
  performance level [nelson1984; masson2009]; ROC area and its error [hanley1982]. Confidence
  level (bias) is a stable individual trait [ais2016; kleitman2007], while metacognitive
  efficiency is only partly consistent across tasks [ais2016; mazancieux2020]; confidence is
  related to but separate from accuracy and metacognition, and adds a small amount to predicting
  test performance beyond accuracy [stankov2012; stankov2014]. Self-efficacy
  relates to performance [bandura1977; multon1991; richardson2012; honicke2016; talsma2018;
  valentine2004; pajares1996; zimmerman2000; schunk1991]. Learners are often over-confident and
  this costs them [kruger1999; dunning2004; dunlosky2012; foster2017; hacker2000; koriat1997;
  bjork2013]; predictions of learning are also swayed by irrelevant cues and study choices are
  often poor [rhodes2008; kornell2007; hartwig2012].
- **Directives.** self_efficacy low → make the first step clearly achievable and say explicitly that it was achieved; split the task into short sub-goals, and after the first say specifically what they did right (`SCORECARD_SUBGOAL_TEXT`, 2026-10-25).
  Calibration directives exist but none fires: r 0.53 (one tap in three is too little; every
  question raises it to 0.59, a product call, BASELINE round 4).
- **Simulation.** self_efficacy r 0.76–0.79, 8–23 directives per seed, none false (step 34).
- **Not used.** The round-5 report cited Zhan, Castanheira & Fleming 2026 (preliminary) for
  test-retest figures. This round could not find that record in Crossref; a related, unreviewed
  2026 PsyArXiv preprint on the reliability of metacognitive bias (O'Neill, Zhan & Fleming,
  doi:10.31234/osf.io/q7pwd_v1) exists but was not read, so neither supports a claim here.

### 6.5 Quitting after failure — `persistence`; and `failure_response`, `error_recovery_speed`

- **Measured.** persistence: of the moments with three or more misses in a row and questions
  left, the share where the learner stopped (the level left, or the next answer 30+ minutes
  later) (signals.js; steps 8, 15–16). failure_response / error recovery: the logit shift of
  answers right after a miss against the learner's other answers, each against expectation
  (step 8).
- **Basis.** "Wheel-spinning" (failing repeatedly without mastering) is common in adaptive
  practice [beck2013] and is a form of unproductive persistence [kai2018]; persistence measured
  from in-game behaviour is valid and differs from questionnaires [ventura2013]; game-based
  assessment has its own psychometric requirements [dicerbo2014]; disengagement
  patterns in online courses [kizilcec2013]; responses to failure differ between learners
  [diener1978; mueller1998]; productive vs unproductive struggle [kapur2016; sinha2021].
- **Directives.** persistence low → put the payoff early and keep sections short enough to finish (and adaptation: 20% fewer items per block);
  failure_response low → normalise mistakes, reassuring tone.
- **Simulation.** persistence r 0.66–0.68 (step 16; the app saw no quit at all until mid-level
  quits were recorded: r 0.03 → 0.68), few directives (about 13 chances per 100 levels).
- **Limits.** In the simulation a quit happens only after three misses; real quits have other
  causes (attention, time), which the rate reads as noise.

### 6.6 Frustration — `frustration_threshold`

- **Measured.** Rapid answering right after a miss beyond the learner's own rapid rate on other
  answers (a contrast, step 19).
- **Basis.** Frustration and boredom are distinct learning-relevant states, with boredom the more
  harmful; confusion can be productive [baker2010; dmello2012; dmello2013; dmello2014;
  pekrun2002; pekrun2006]; affect detected from interaction logs predicts outcomes
  [pardos2014; sanpedro2013; arroyo2009], but detectors must be validated on the population they
  are used on [ocumpaugh2014]. In a meta-analysis, frustration itself was barely related to
  performance (ρ = −0.02; anger −0.35) [camachomorles2021]. So the claim is that unresolved
  impasses hurt, not frustration as such; the gentle ramp is kept because it is low risk.
  Evaluation anxiety is real and harmful [hembree1988; vonderembse2018] but has no measured
  signal here.
- **Directives.** low → ramp difficulty gently, never leave a gap to bridge alone (adaptation: +0.1
  support, −0.05 stretch); with high challenge appetite, one combined instruction: a hard case in
  small signposted steps.
- **Simulation.** r 0.87, recall 0.52, 12–16 directives per seed, none false.

### 6.7 Target difficulty — `challenge_appetite`

- **Measured.** "Too easy / too hard / right" taps against the level's accuracy (a grid posterior:
  "too easy" at 95% and at 60% mean different things) (step 8).
- **Basis.** For people, the studies favour a high success rate. Children who practised at a
  higher pre-set success rate attempted more problems and improved more [jansen2013]. Practice
  scheduled at a predicted recall of about 0.86-0.94 beat 0.40 and 0.98 [eglington2020].
  [wilson2019] derives an optimal error rate for machine learners; it is not evidence about
  people. People allocate study to the region of proximal
  learning [metcalfe2005]; difficulty and choice in games [lomas2013; lomas2017; hamari2016]
  (note that the two large game experiments found players more engaged when the game was easier,
  and the most engaging versions produced the slowest learning [lomas2013], so engagement and
  learning can pull apart);
  curiosity and intermediate complexity [kidd2012; oudeyer2016]; bandit allocation of
  challenge [clement2015]; expectancy–value [eccles2002].
- **Directives.** high → the core at the usual level, then one optional harder "try this" case (adaptation: +0.05 stretch share, stretch capped at 0.25; `SCORECARD_SOFT_STRETCH`, 2026-10-25; it was a genuinely challenging worked example, +0.1 and a 0.35 cap); low → comfortable difficulty first (−0.05 stretch, +0.05 support).
- **Simulation.** r 0.83, recall 0.12 (16 taps per 100 levels). No bandit: per-learner arm
  effects too small for adaptive allocation to pay (step 9).

### 6.8 Language level — `vocabulary_ceiling`

- **Measured.** Within each level, the wordier half of the questions against the plainer half,
  each against expectation (a shift), as a standing (step 32).
- **Basis.** Linguistic complexity of maths items creates differential item functioning against
  English learners of the same ability [martiniello2008; abedi2001; abedi2006; abedi2004;
  haag2013; wolf2009]; accommodations [abedi2000; kieffer2009]; comprehension needs about
  95–98% of words known [nation2006; laufer2010; hu2000; schmitt2011]; text cohesion interacts
  with knowledge and skill [ozuru2009; mcnamara1996; oreilly2007]; text complexity
  [amendum2018; graesser2011; crossley2008]; vocabulary instruction [stahl1986].
- **Directive.** low → plain words, define terms.
- **Simulation.** r 0.72–0.80 with the assumed effect (0.36 logits per SD of wordiness for a
  learner at 20), 2–4 directives per seed, none false; r ≈ 0.5 at half the effect; r 0 and no
  directive with no effect (steps 31–32, 34). The direction is replicated; the size here is an
  assumption. A calibrated reading test reaches r 0.85–0.95 (a product call).

### 6.9 Length — `brevity_preference`

- **Measured.** Length taps on the feedback form plus a length experiment (two kinds combined,
  step 9).
- **Basis.** Coherence and segmenting (section 4); attention in long expositions [risko2012;
  szpunar2013]. Two reviews find little support for the popular claim that attention drops
  after 10 to 15 minutes [wilson2007; bradbury2016], so the case for brevity rests on coherence
  and segmenting, not on a fixed attention limit.
- **Directives.** high → as brief as possible; low → fuller explanation. Moves adaptation's
  length knob.
- **Simulation.** r 0.86–0.88, 46–66 directives per seed, one false at three seeds (an
  experiment-stat learner near the middle).

### 6.10 Misconceptions — `misconception_persistence`

- **Measured.** The same tagged mistake again, out of misses on a skill with a past tagged
  mistake (a rate; ability is out of it) (step 8).
- **Basis.** Misconceptions are structured and persistent [posner1982; vosniadou1992], though
  one review argues students' conceptions also play a productive part in learning [smith1994];
  procedural bugs are systematic [brown1978; vanlehn1990]; refutation texts help (meta-analyses
  [guzzetti1993; tippett2010; schroeder2023]); erroneous examples help with decimals
  [adams2019; mclaren2016]; continued influence of misinformation [lewandowsky2012]; learning from
  errors [metcalfe2017; ohlsson1996]. Whether persistence is a stable trait of the learner is
  mixed: naive theories survive for years alongside the scientific one [shtulman2012], but
  algebra mal-rules are very unstable within one student [payne1990]. So the stat is read as
  "this tagged error recurs", not as a trait; the refutation it triggers helps whoever gets it.
- **Directive.** high → contrast the right idea with the specific wrong one.
- **Simulation.** r 0.70, recall 0.10.

### 6.11 Recap need — `consolidation_need` (and `text_density_tolerance`)

- **Measured.** Scroll-backs over a recorded lesson page (a rate, step 12). Its inverted second
  reading (text density) steers nothing (step 22).
- **Basis.** Rereading has limited benefit [callender2009]; generation and retrieval at the end of
  a lesson help everyone (section 4); construction-integration [kintsch1988].
- **Directive.** high → one-line takeaways and a closing recap (adaptation recap flag).
- **Simulation.** r 0.62, about 6 directives per seed, one false at the main seed.

### 6.12 Perfectionism and deliberation — `perfectionism`, `deliberation_depth`

- **Measured.** Heavy revisions of typed answers; answers over 2.5× own usual time (rates).
- **Basis.** Perfectionism has adaptive and maladaptive strands [stoeber2006], is rising
  [curran2019], and relates to achievement mostly through its striving component [madigan2019];
  speed–accuracy trade-off [heitz2014].
- **Directive.** perfectionism high → say which parts matter now and which can wait.
- **Simulation.** perfectionism 10–14 directives per seed, none false.

### 6.13 Warm-up, fatigue, momentum, attention runway

- **Measured.** Shifts against expectation: first three answers vs the rest; first half vs second
  half of long levels; the rest of a level after two opening misses vs the same positions after
  another start (step 20). Never confident before a population.
- **Basis.** Item-position effects are real and differ between persons and countries
  [debeer2014; debeer2013; hartig2012; borgonovi2016; meyers2009]; fatigue over the day lowers
  scores 0.9% of an SD per hour, a break restores 1.7% [sievertsen2016]; longer tests raise felt
  fatigue but did not lower scores in one experiment [ackerman2009]; vigilance decrement [warm2008; ariga2011]; mind wandering [smallwood2015;
  risko2012]. The ego-depletion account failed a multilab replication [hagger2016]. Streak
  effects are biased by how streaks are selected [gilovich1985; miller2018], which is why momentum
  is read against the same positions after another start.
- **Simulation.** r 0.17–0.45; no directive (a 10-question level holds 3 opening answers).

### 6.14 Forgetting — `decay_rate`, `retention_index`, `retrieval_strength`

- **Measured.** Half-life regression on every memory test (a skill last practised a day or more
  ago): P = g + (expected − g)·2^(−days/half-life), log2 half-life = a + b·right + c·wrong +
  learner multiplier, fitted to all learners; multiplier shrunk to the population (forgetting.js;
  steps 10, 25, 29).
- **Basis.** Forgetting curves [ebbinghaus2013; murre2015; wixted1991; wixted2004; rubin1996;
  averell2011; anderson1991]; trainable spaced-repetition models [settles2016: −45% error, +12%
  engagement; pavlik2005; pavlik2008; mozer2009; walsh2018; zaidi2020; wozniak1995]; scheduling by
  predicted recall [lindsey2014: +16.5% over massed, +10.0% over generic spacing; tabibian2019;
  reddy2016; ye2022; su2023: −64% prediction error, −17% cost; mettler2016]; individual forgetting
  rates are stable over time but differ by material [sense2016] and relate to learning efficiency
  [zerr2018]; durable spacing [bahrick1993; smolen2016; kornell2009spacing; rawson2011].
- **Use.** The fitted curve is exported for review timing (`scorecard.forgettingCurve`; contract
  `memory`). Memory stats steer no lesson (step 22); step 35 re-measured that and kept it: letting them steer went over 2% false on a power-law memory (section 12).
- **Simulation.** decay r 0.46–0.54; the exported curve predicts 30-day recall with MAE 0.09 and r
  0.80 (default curve 0.11 / 0.76). Review scheduling by predicted recall: +42% to +49% 30-day
  recall on the default memory, +7% on FSRS-6's memory (a product call; BASELINE round 5).
- **Limits.** The shape of real forgetting decides the size of the scheduling gain; FSRS-style
  power-law memory is under-predicted by the exponential curve at long intervals.

### 6.15 Interest — `interest_transfer`

- **Measured.** Experiments only (lesson pages taught with interest-based examples on purpose,
  credited by the next level and by delayed reviews; step 9).
- **Basis.** Section 3 row 5; interest development [hidi2006; rotgans2011]; utility value
  [hulleman2009; hulleman2010; harackiewicz2016]; choice [patall2008]; personalisation design
  [walkington2014].
- **Simulation.** r 0.18; about 10 experiments per learner in 100 levels cannot separate a
  per-learner effect of the simulated size, so the estimator holds everyone at the population
  answer. No directive.

### 6.16 Learning rate — `mastery_velocity`

- See section 3 ("fast learner"). Measured as the slope of ability over practice on calibrated
  difficulties (step 14); r 0.5; no directive. Deliberate practice was proposed as the main
  source of skill differences [ericsson1993] but explains only part of them [macnamara2014].

### 6.17 Stats with no measured signal (40 of 100)

Working memory, logical rigour, evaluation anxiety, near and far transfer and the rest have no
rule in signals.js, no experiment and no questionnaire mass. They cannot produce a directive (no
measured evidence), in every simulation mode (target 2 met since step 2). Several name real
constructs (working memory, anxiety [hembree1988]), but nothing the app records measures them,
and the research does not show that tailoring lesson text to them helps.

## 7. Why the gate is built the way it is

- **A standing, not a score.** A directive says "this learner is unusual", so it asks where the
  learner stands among learners: each measurement with its own sampling noise, read against the
  population's centre and true spread estimated by the method of moments, i.e. empirical Bayes
  shrinkage [efron1975; efron1977; morris1983; casella1985; efron2010; raudenbush1985;
  dersimonian1986; higgins2002; gelman2006]. Rates use logit counting variance: a rate of k in n
  becomes log((k + 0.5)/(n − k + 0.5)) with variance 1/(k + 0.5) + 1/(n − k + 0.5). That is the
  Haldane-Anscombe empirical logit with its Gart-Zweifel variance, a textbook estimator
  [haldane1956; anscombe1956; gart1967], pooled the way meta-analysis pools log-odds
  [dersimonian1986]. gart1967 also shows these estimators are biased at small counts, which is
  why the minimum-evidence rule keeps 10 or more chances. Approximate intervals can beat exact
  ones [agresti1998; wilson1927], and the simple Wald interval covers badly at small counts
  [brown2001]. The exact binomial GLMM was measured and rejected (step 26). Institutional comparisons avoid flagging noise with
  funnel-plot limits that widen as counts shrink, a related idea [spiegelhalter2005].
- **Many stats, one learner.** With 100 stats per learner, unadjusted thresholds would fire false
  directives by chance; partial pooling is the Bayesian answer to multiple comparisons
  [gelman2012], with false-discovery control as the frequentist one [benjamini1995]. The 0.98
  side probability and the top/bottom-fifth rule are that, set on four seeds. The 0.98 also has a
  principled basis: if the posterior is calibrated, issuing only directives with P ≥ 0.98 keeps
  the expected share on the wrong side at about 2% or less, the posterior false-discovery rate
  [newton2004; efron2008]. That holds only if the posterior is calibrated, and on real learners
  that still needs the section 11 check.
- **Behaviour is not trait.** Reliable group effects make unreliable individual measures (the
  reliability paradox) [hedge2018; rouder2019; parsons2019; enkavi2019]; observed correlations
  are attenuated by measurement error [spearman1904; schmidt1996]; validity is an argument about
  interpretation, not a number on the measure [cronbach1955; messick1995; kane2013]. So the
  posterior is widened as if behaviour correlated 0.9 with the trait (0.8 for a standing read
  through a second model), which took false directives from 3% to 0.5% in round 3.
- **Evidence fades.** A 90-day half-life on evidence, applied on read, so a learner who changes is
  followed; concept drift and temporal dynamics are standard in adaptive systems [gama2014;
  koren2009].
- **Item-calibrated expectations.** Elo-style ability and item difficulty, as in adaptive
  practice systems [pelanek2016; pelanek2017elo; papousek2014; klinkenberg2011; glickman1999;
  wauters2010], read every behaviour against what the answer was expected to be, so ability does
  not leak into behaviour stats (step 8). Placement is a designed test [weiss1984].
- **Calibration of probabilities.** A posterior that says 98% must be right 98% of the time;
  proper scoring and calibration [brier1950; dawid1982; gneiting2007]; validating Bayesian
  software by simulation-based calibration [talts2018; cook2006]; bias reduction [firth1993].
- **Experiments.** Raw arm residuals, pooled then individual (step 9), the logic of controlled
  experiments [kohavi2009; deng2013 for variance reduction], adaptive designs and their limits
  [liu2014bandit; clement2015; murphy2003; collins2007]; large-platform experimentation in
  education [heffernan2014]. Interventions that work in a pilot often shrink or vanish at scale
  and differ across contexts [kizilcec2020; bryan2021], which is why the estimator assumes no
  per-learner effect until the data show a spread.

## 8. From directives to a written level

- **Few instructions.** Instruction following degrades as instructions accumulate: the best models
  reach 68% at 500 simultaneous instructions [jaroslawicz2025]; constraint following is tested with
  more constraints added step by step [jiang2024follow], and other instruction benchmarks point
  the same way [zhou2023ifeval; qin2024]; long inputs degrade reasoning
  [levy2024]; the middle of a long context is used least [liu2024lost]; irrelevant context
  distracts [shi2023]. None of these papers tests a cap of 6, so the number 6 is a design
  choice, not an evidence-based limit. The brief carries at most 6 directives, most important first, and nothing
  when nothing is confident (step 6, step 12).
- **No numbers to the writer.** Directives are fixed sentences; conflicting pairs are resolved in
  code into one written instruction (translate.js COMBINED), so the model never chooses.
- **What AI tutoring does.** AI-written help produced learning gains like human-authored hints
  [pardos2024: but it failed quality checks on 32% of problems before self-consistency]; trials of
  well-designed AI tutoring found gains against in-class active learning [kestin2025], from extra
  AI tutoring in Ghana (preliminary) [henkel2024], and from AI guidance given to human tutors
  [wang2024copilot]; unguarded access raised practice grades 48% and lowered later unassisted
  grades 17%, while a guarded tutor avoided the harm [bastani2025]; a related study asks when
  ChatGPT harms learning [lehmann2025];
  opportunities and risks [kasneci2023; jurenka2024]. The scorecard's directives shape *how* a
  level teaches; they never answer for the learner.

## 9. The insertion contract

`services/scorecard/contract.js` (`savant.scorecard.insertion` v1.0.0) is the one object any
lesson- or curriculum-changing consumer reads; full spec in `docs/SCORECARD.md`. It carries the
gated directives with their gate, posterior probability and evidence; the sides adaptation takes;
the writer's and the coach's prompt lines; the structure knobs; the forgetting curve; and a
privacy block. It never throws (a failure is the new-learner fallback), carries no learner
numbers in model-facing text, and has no field that could skip a unit. Privacy rules follow the
learning-analytics ethics literature [slade2013; drachsler2016; pardo2014; prinsloo2017;
ifenthaler2016]: data minimisation, purpose limitation, nothing stored that is not needed;
re-identification risk of rich behavioural data [sweeney2002; narayanan2008; dwork2014];
children's data [livingstone2019]; surveillance risks [zuboff2015]. Fairness of learner models
must be checked by subgroup before investors or a wide launch [baker2022; gardner2019;
kizilcec2022; doroudi2019fair; ocumpaugh2014]. `scripts/scorecard-contract-test.js` checks that
every consumer gets the same contract (146 checks), and the simulation reads every card through
it (0 mismatches; section 12).

## 10. What the simulation shows, and what it cannot

**Shows.** That the scorecard's code, run end to end on synthetic learners whose true values are
known, recovers those values (12 kept constructs: 8 at r ≥ 0.7) and issues directives that are on
the right side of the truth at least 98% of the time at 10, 30 and 100 levels, at four seeds, with
and without a population, under three model-read behaviours (since step 2 identical). That is a
software-validation result in the sense of simulation studies of statistical methods
[morris2019; burton2006; talts2018].

**Cannot show.**
- That real learners behave like the simulated ones. Each signal's truth model is an assumption
  (for example, quitting only after three misses; wordiness costing 0.36 logits for a learner at
  20). Simulated students are useful for checking machinery and risky as evidence of learning
  gains: about half of the studies using simulated learners give no evidence the model is valid
  [kaser2024], and methods that estimate a teaching method's effect from a student model can
  overestimate it [doroudi2017]. Policy learning has worked best when constrained by learning
  science and checked with offline analyses that do not rely on one model [doroudi2019; mandel2014];
  see [vanlehn1994; rafferty2016] for uses and tests of simulated and model-based learners.
- That following a directive improves learning. The simulation has no outcome model for tailoring
  beyond the experiment arms and the expertise-reversal valuation; tailored minus holdout
  next-level accuracy is 0.1 ± 1.4 points.
- Calibration on real data. The 0.98 is calibrated against the simulation's own truth.

## 11. Real-data checks that would confirm or refute each piece

| Piece | Check on real learners | Confirms if | Needs |
| --- | --- | --- | --- |
| Standings are stable traits | Split each learner's evidence into two halves by day, at random, 500 times (not only odd/even days); correlate the two standings across learners; average in Fisher-z; step up with Spearman-Brown, 2r/(1 + r) (`services/scorecard/reliability.js` `splitHalf`) | for any stat that issues directives, corrected split-half point ≥ 0.6 **and** lower 95% bound ≥ 0.5 (our own cut-offs: 0.5-0.75 is "moderate", judged on the interval [koo2016]; cut-offs are rules of thumb [cicchetti1994; lance2006]; Spearman-Brown [brown1910; spearman1910]; report split-half reliability [parsons2019]) | 20+ learners with 30+ levels |
| P(side) ≥ 0.98 is calibrated | For each directive, re-estimate the standing on the next 30 levels only | ≥ 95% still on the same side | a few hundred directives |
| Expertise directives help | Holdout pages vs tailored pages for learners with prior-knowledge / scaffolding directives, next-level residual | gain > 0 with CI excluding 0 | about 160–190 pages per arm to see 5 points (BASELINE round 4) |
| Forgetting curve shape | Fit exponential vs power law on real memory tests; compare log-likelihood and 30-day calibration [settles2016; su2023] | exponential within 0.02 of power-law log loss, or switch shape | 400+ memory tests over 20 learners |
| Language load | DIF of wordier items for low-standing learners [martiniello2008] | wordy-item residual gap ≥ 0.2 logits | 50+ learners, item text lengths |
| Pace is not ability | Correlate pace standing with ability within subject | |r| < 0.3 | population |
| Directives are not biased by group | Directive rates and false-direction rates by age band and language background [gardner2019; baker2022] | no subgroup with rate ratio > 2 without a measured reason | consented demographics |
| Contract consumers agree | Log contract version and sides with every adapted plan and written level | 100% identical per level | instrumentation |

## 12. Round 6 steps (BASELINE rows 35+)

Same rule as rounds 2–5: 200 learners, model read off, seeds 20261022, 7, 11 and 3; a change is
kept only if it improves a target with no regression and false directives stay at or under 2% at
10, 30 and 100 levels at every seed. Full rows in BASELINE.md (steps 35–37 and "Round 6").

| step | change | result | kept |
| --- | --- | --- | --- |
| 35 | Let memory-kind stats (decay, retention, retrieval) steer, re-measuring step 22 after step 25's bug fix (`SCORECARD_MEMORY_STEER=on`) | Default memory: +0 / +4 / +6 / +4 true directives per 200 learners, false unchanged. FSRS-6 (power-law) memory: false 0.7 → **2.7%** at 30 levels (seed 7) and 1.7 → **2.7%** at 100 levels (seed 3), where all three memory directives were false | **No.** The exponential curve's learner multipliers are over-confident when real forgetting is power-law [wixted1991; averell2011]. Check the curve's shape on real memory tests first (section 11) |
| 36 | Measurement: read every simulated card through the insertion contract | 0 mismatches with `translate.directives` in 33,928 reads per seed, at four seeds and on both memories | **Yes** (no score changed) |
| 36 | Measurement: a population of exactly 20, the app's threshold | false 0/2.0/1.0, 1.6/0/0, 2.0/0/1.1, 0/0.7/1.4%: at the limit, not over it | measurement only |
| 37 | Standings from 10 learners instead of 20 (`SCORECARD_POPULATION_MIN=10`), so the calibrated gate starts sooner | false **2.2 / 3.0%** at 10 / 30 levels at seed 11; fewer true directives at every seed (0.93 / 0.84 / 0.56 / 0.73 against 1.02 / 0.85 / 0.73 / 0.94 at 20) | **No** |

What the steps say together: the gate's two safety rules (memory stats do not steer; no standings
before 20 learners) each failed when relaxed, on a check the earlier rounds had not run (a second
memory model; a smaller population). Both stay. With 3 scorecards in the database today, testers
are served by the no-population gate (0% false at all four seeds in round 5).

Owner-decision proposals, with numbers (unchanged from round 5, not done): review scheduling by
predicted recall (+42% to +49% 30-day recall on the default memory, +7% on FSRS-6 memory); a
calibrated reading test (language level r 0.85–0.95); a confidence tap on every question
(calibration r 0.50 → 0.59, false directives 1.9%: at the limit); experiments on every tailored
page (brevity recall 0.51 → 0.71, 30-day recall 17.3% → 16.9%).

## 13. Sources

### Learning styles and meshing (evidence against) (18)

- **[pashler2008]** Pashler, McDaniel et al. (2008). Learning Styles: Concepts and Evidence. Psychological Science in the Public Interest. <https://doi.org/10.1111/j.1539-6053.2009.01038.x>
- **[rogowsky2015]** Rogowsky, Calhoun & Tallal (2015). Matching learning style to instructional method: Effects on comprehension.. Journal of Educational Psychology. <https://doi.org/10.1037/a0037478>
- **[rogowsky2020]** Rogowsky, Calhoun & Tallal (2020). Providing Instruction Based on Students’ Learning Style Preferences Does Not Improve Learning. Frontiers in Psychology. <https://doi.org/10.3389/fpsyg.2020.00164>
- **[husmann2019]** Husmann & O'Loughlin (2018). Another Nail in the Coffin for Learning Styles? Disparities among Undergraduate Anatomy Students’ Study Strategies, Class Performance, and Reported VARK Learning Styles. Anatomical Sciences Education. <https://doi.org/10.1002/ase.1777>
- **[knoll2017]** Knoll, Otani et al. (2016). Learning style, judgements of learning, and learning of verbal and visual information. British Journal of Psychology. <https://doi.org/10.1111/bjop.12214>
- **[kirschner2017]** Kirschner (2017). Stop propagating the learning styles myth. Computers & Education. <https://doi.org/10.1016/j.compedu.2016.12.006>
- **[newton2017]** Newton & Miah (2017). Evidence-Based Higher Education – Is the Learning Styles ‘Myth’ Important?. Frontiers in Psychology. <https://doi.org/10.3389/fpsyg.2017.00444>
- **[cuevas2015]** Cuevas (2015). Is learning styles-based instruction effective? A comprehensive analysis of recent research on learning styles. Theory and Research in Education. <https://doi.org/10.1177/1477878515606621>
- **[massa2006]** Massa & Mayer (2006). Testing the ATI hypothesis: Should multimedia instruction accommodate verbalizer-visualizer cognitive style?. Learning and Individual Differences. <https://doi.org/10.1016/j.lindif.2006.10.001>
- **[willingham2015]** Willingham, Hughes & Dobolyi (2015). The Scientific Status of Learning Styles Theories. Teaching of Psychology. <https://doi.org/10.1177/0098628315589505>
- **[dekker2012]** Dekker, Lee et al. (2012). Neuromyths in Education: Prevalence and Predictors of Misconceptions among Teachers. Frontiers in Psychology. <https://doi.org/10.3389/fpsyg.2012.00429>
- **[howardjones2014]** Howard-Jones (2014). Neuroscience and education: myths and messages. Nature Reviews Neuroscience. <https://doi.org/10.1038/nrn3817>
- **[kratzig2006]** Krätzig & Arbuthnott (2006). Perceptual learning style and learning proficiency: A test of the hypothesis.. Journal of Educational Psychology. <https://doi.org/10.1037/0022-0663.98.1.238>
- **[cook2009]** Cook, Beckman et al. (2008). Adapting Web-based Instruction to Residents’ Knowledge Improves Learning Efficiency: A Randomized Controlled Trial. Journal of General Internal Medicine. <https://doi.org/10.1007/s11606-008-0541-0>
- **[papadatou2021]** Papadatou-Pastou, Touloumakos et al. (2020). The learning styles neuromyth: when the same term means different things to different teachers. European Journal of Psychology of Education. <https://doi.org/10.1007/s10212-020-00485-2>
- **[macdonald2017]** Macdonald, Germine et al. (2017). Dispelling the Myth: Training in Education or Neuroscience Decreases but Does Not Eliminate Beliefs in Neuromyths. Frontiers in Psychology. <https://doi.org/10.3389/fpsyg.2017.01314>
- **[nancekivell2020]** Nancekivell, Shah & Gelman (2020). Maybe they’re born with it, or maybe it’s experience: Toward a deeper understanding of the learning style myth.. Journal of Educational Psychology. <https://doi.org/10.1037/edu0000366>
- **[aslaksen2018]** Aslaksen & Lorås (2018). The Modality-Specific Learning Style Hypothesis: A Mini-Review. Frontiers in Psychology. <https://doi.org/10.3389/fpsyg.2018.01538>

### Aptitude-treatment interactions (4)

- **[cronbach1957]** Cronbach (1957). The two disciplines of scientific psychology.. American Psychologist. <https://doi.org/10.1037/h0043943>
- **[preacher2019]** Preacher & Sterba (2018). Aptitude-by-Treatment Interactions in Research on Educational Interventions. Exceptional Children. <https://doi.org/10.1177/0014402918802803>
- **[connor2007]** Connor, Morrison et al. (2007). Algorithm-Guided Individualized Reading Instruction. Science. <https://doi.org/10.1126/science.1134513>
- **[connor2013]** Connor, Morrison et al. (2013). A Longitudinal Cluster-Randomized Controlled Study on the Accumulating Effects of Individualized Literacy Instruction on Students’ Reading From First Through Third Grade. Psychological Science. <https://doi.org/10.1177/0956797612472204>

### Retrieval practice (24)

- **[roediger2006]** Roediger & Karpicke (2006). Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention. Psychological Science. <https://doi.org/10.1111/j.1467-9280.2006.01693.x>
- **[rowland2014]** Rowland (2014). The effect of testing versus restudy on retention: A meta-analytic review of the testing effect.. Psychological Bulletin. <https://doi.org/10.1037/a0037559>
- **[adesope2017]** Adesope, Trevisan & Sundararajan (2017). Rethinking the Use of Tests: A Meta-Analysis of Practice Testing. Review of Educational Research. <https://doi.org/10.3102/0034654316689306>
- **[karpicke2011]** Karpicke & Blunt (2011). Retrieval Practice Produces More Learning than Elaborative Studying with Concept Mapping. Science. <https://doi.org/10.1126/science.1199327>
- **[pan2018]** Pan & Rickard (2018). Transfer of test-enhanced learning: Meta-analytic review and synthesis.. Psychological Bulletin. <https://doi.org/10.1037/bul0000151>
- **[yang2021]** Yang, Luo et al. (2021). Testing (quizzing) boosts classroom learning: A systematic and meta-analytic review.. Psychological Bulletin. <https://doi.org/10.1037/bul0000309>
- **[agarwal2021]** Agarwal, Nunes & Blunt (2021). Retrieval Practice Consistently Benefits Student Learning: a Systematic Review of Applied Research in Schools and Classrooms. Educational Psychology Review. <https://doi.org/10.1007/s10648-021-09595-9>
- **[dunlosky2013]** Dunlosky, Rawson et al. (2013). Improving Students’ Learning With Effective Learning Techniques: Promising Directions From Cognitive and Educational Psychology. Psychological Science in the Public Interest. <https://doi.org/10.1177/1529100612453266>
- **[roediger2011]** Roediger & Butler (2011). The critical role of retrieval practice in long-term retention. Trends in Cognitive Sciences. <https://doi.org/10.1016/j.tics.2010.09.003>
- **[butler2010]** Butler (2010). Repeated testing produces superior transfer of learning relative to repeated studying.. Journal of Experimental Psychology: Learning, Memory, and Cognition. <https://doi.org/10.1037/a0019902>
- **[kornell2009]** Kornell, Hays & Bjork (2009). Unsuccessful retrieval attempts enhance subsequent learning.. Journal of Experimental Psychology: Learning, Memory, and Cognition. <https://doi.org/10.1037/a0015729>
- **[richland2009]** Richland, Kornell & Kao (2009). The pretesting effect: Do unsuccessful retrieval attempts enhance learning?. Journal of Experimental Psychology: Applied. <https://doi.org/10.1037/a0016496>
- **[bangertdrowns1991freq]** Bangert-Drowns, Kulik & Kulik (1991). Effects of Frequent Classroom Testing. The Journal of Educational Research. <https://doi.org/10.1080/00220671.1991.10702818>
- **[kang2007]** Kang, McDermott & Roediger (2007). Test format and corrective feedback modify the effect of testing on long-term retention. European Journal of Cognitive Psychology. <https://doi.org/10.1080/09541440601056620>
- **[mcdaniel2007]** McDaniel, Anderson et al. (2007). Testing the testing effect in the classroom. European Journal of Cognitive Psychology. <https://doi.org/10.1080/09541440701326154>
- **[smith2014]** Smith & Karpicke (2013). Retrieval practice with short-answer, multiple-choice, and hybrid tests. Memory. <https://doi.org/10.1080/09658211.2013.831454>
- **[little2012]** Little, Bjork et al. (2012). Multiple-Choice Tests Exonerated, at Least of Some Charges: Fostering Test-Induced Learning and Avoiding Test-Induced Forgetting. Psychological Science. <https://doi.org/10.1177/0956797612443370>
- **[pastotter2014]** Pastötter & Bäuml (2014). Retrieval practice enhances new learning: the forward effect of testing. Frontiers in Psychology. <https://doi.org/10.3389/fpsyg.2014.00286>
- **[karpicke2008]** Karpicke & Roediger (2008). The Critical Importance of Retrieval for Learning. Science. <https://doi.org/10.1126/science.1152408>
- **[carpenter2009]** Carpenter (2009). Cue strength as a moderator of the testing effect: The benefits of elaborative retrieval.. Journal of Experimental Psychology: Learning, Memory, and Cognition. <https://doi.org/10.1037/a0017021>
- **[mcdermott2014]** McDermott, Agarwal et al. (2014). Both multiple-choice and short-answer quizzes enhance later exam performance in middle and high school classes.. Journal of Experimental Psychology: Applied. <https://doi.org/10.1037/xap0000004>
- **[roediger2006power]** Roediger & Karpicke (2006). The Power of Testing Memory: Basic Research and Implications for Educational Practice. Perspectives on Psychological Science. <https://doi.org/10.1111/j.1745-6916.2006.00012.x>
- **[fazio2019]** Fazio & Marsh (2019). Retrieval-Based Learning in Children. Current Directions in Psychological Science. <https://doi.org/10.1177/0963721418806673>
- **[rawson2011]** Rawson & Dunlosky (2011). Optimizing schedules of retrieval practice for durable and efficient learning: How much is enough?. Journal of Experimental Psychology: General. <https://doi.org/10.1037/a0023956>

### Spacing, forgetting and review scheduling (44)

- **[cepeda2006]** Cepeda, Pashler et al. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis.. Psychological Bulletin. <https://doi.org/10.1037/0033-2909.132.3.354>
- **[cepeda2008]** Cepeda, Vul et al. (2008). Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention. Psychological Science. <https://doi.org/10.1111/j.1467-9280.2008.02209.x>
- **[donovan1999]** Donovan & Radosevich (1999). A meta-analytic review of the distribution of practice effect: Now you see it, now you don't.. Journal of Applied Psychology. <https://doi.org/10.1037/0021-9010.84.5.795>
- **[janiszewski2003]** Janiszewski, Noel & Sawyer (2003). A Meta-analysis of the Spacing Effect in Verbal Learning: Implications for Research on Advertising Repetition and Consumer Memory. Journal of Consumer Research. <https://doi.org/10.1086/374692>
- **[kang2016]** Kang (2016). Spaced Repetition Promotes Efficient and Effective Learning: Policy Implications for Instruction. Policy Insights from the Behavioral and Brain Sciences. <https://doi.org/10.1177/2372732215624708>
- **[latimier2021]** Latimier, Peyre & Ramus (2020). A Meta-Analytic Review of the Benefit of Spacing out Retrieval Practice Episodes on Retention. Educational Psychology Review. <https://doi.org/10.1007/s10648-020-09572-8>
- **[carpenter2012]** Carpenter, Cepeda et al. (2012). Using Spacing to Enhance Diverse Forms of Learning: Review of Recent Research and Implications for Instruction. Educational Psychology Review. <https://doi.org/10.1007/s10648-012-9205-z>
- **[murre2015]** Murre & Dros (2015). Replication and Analysis of Ebbinghaus’ Forgetting Curve. PLOS ONE. <https://doi.org/10.1371/journal.pone.0120644>
- **[ebbinghaus2013]** Ebbinghaus (2013). Memory: A Contribution to Experimental Psychology. Annals of Neurosciences. <https://doi.org/10.5214/ans.0972.7531.200408>
- **[wixted1991]** Wixted & Ebbesen (1991). On the Form of Forgetting. Psychological Science. <https://doi.org/10.1111/j.1467-9280.1991.tb00175.x>
- **[wixted2004]** Wixted (2004). The Psychology and Neuroscience of Forgetting. Annual Review of Psychology. <https://doi.org/10.1146/annurev.psych.55.090902.141555>
- **[rubin1996]** Rubin & Wenzel (1996). One hundred years of forgetting: A quantitative description of retention.. Psychological Review. <https://doi.org/10.1037/0033-295x.103.4.734>
- **[averell2011]** Averell & Heathcote (2011). The form of the forgetting curve and the fate of memories. Journal of Mathematical Psychology. <https://doi.org/10.1016/j.jmp.2010.08.009>
- **[lindsey2014]** Lindsey, Shroyer et al. (2014). Improving Students’ Long-Term Knowledge Retention Through Personalized Review. Psychological Science. <https://doi.org/10.1177/0956797613504302>
- **[settles2016]** Settles & Meeder (2016). A Trainable Spaced Repetition Model for Language Learning. Proceedings of the 54th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers). <https://doi.org/10.18653/v1/p16-1174>
- **[pavlik2005]** Pavlik & Anderson (2005). Practice and Forgetting Effects on Vocabulary Memory: An Activation‐Based Model of the Spacing Effect. Cognitive Science. <https://doi.org/10.1207/s15516709cog0000_14>
- **[pavlik2008]** Pavlik & Anderson (2008). Using a model to compute the optimal schedule of practice.. Journal of Experimental Psychology: Applied. <https://doi.org/10.1037/1076-898x.14.2.101>
- **[tabibian2019]** Tabibian, Upadhyay et al. (2019). Enhancing human learning via spaced repetition optimization. Proceedings of the National Academy of Sciences. <https://doi.org/10.1073/pnas.1815156116>
- **[reddy2016]** Reddy, Labutov et al. (2016). Unbounded Human Learning: Optimal Scheduling for Spaced Repetition. Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining. <https://doi.org/10.1145/2939672.2939850>
- **[ye2022]** Ye, Su & Cao (2022). A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling. Proceedings of the 28th ACM SIGKDD Conference on Knowledge Discovery and Data Mining. <https://doi.org/10.1145/3534678.3539081>
- **[su2023]** Su, Ye et al. (2023). Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory. IEEE Transactions on Knowledge and Data Engineering. <https://doi.org/10.1109/tkde.2023.3251721>
- **[kim2022]** Kim & Webb (2022). The Effects of Spaced Practice on Second Language Learning: A Meta‐Analysis. Language Learning. <https://doi.org/10.1111/lang.12479>
- **[smolen2016]** Smolen, Zhang & Byrne (2016). The right time to learn: mechanisms and optimization of spaced learning. Nature Reviews Neuroscience. <https://doi.org/10.1038/nrn.2015.18>
- **[mozer2009]** Mozer, Pashler et al. (2009). Predicting the optimal spacing of study: A multiscale context model: (520562012-290). PsycEXTRA Dataset. <https://doi.org/10.1037/e520562012-290>
- **[bahrick1993]** Bahrick, Bahrick et al. (1993). Maintenance of Foreign Language Vocabulary and the Spacing Effect. Psychological Science. <https://doi.org/10.1111/j.1467-9280.1993.tb00571.x>
- **[rohrer2006]** Rohrer & Taylor (2006). The effects of overlearning and distributed practise on the retention of mathematics knowledge. Applied Cognitive Psychology. <https://doi.org/10.1002/acp.1266>
- **[wozniak1995]** Woźniak & Gorzelańczyk (1994). Optimization of repetition spacing in the practice of learning. Acta Neurobiologiae Experimentalis. <https://doi.org/10.55782/ane-1994-1003>
- **[anderson1991]** Anderson & Schooler (1991). Reflections of the Environment in Memory. Psychological Science. <https://doi.org/10.1111/j.1467-9280.1991.tb00174.x>
- **[bjork2011]** Bjork & Bjork (2011). Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning.. <https://openalex.org/W2463230187>
- **[kornell2009spacing]** Kornell & Bjork (2008). Optimising self-regulated study: The benefits—and costs—of dropping flashcards. Memory. <https://doi.org/10.1080/09658210701763899>
- **[wiseheart2019]** Carolina E., Küpper-Tetzel et al. (2019). Enhancing the Quality of Student Learning Using Distributed Practice. The Cambridge Handbook of Cognition and Education. <https://doi.org/10.1017/9781108235631.023>
- **[walsh2018]** Walsh, Gluck et al. (2018). Mechanisms underlying the spacing effect in learning: A comparison of three computational models.. Journal of Experimental Psychology: General. <https://doi.org/10.1037/xge0000416>
- **[zaidi2020]** Zaidi, Caines et al. (2020). Adaptive Forgetting Curves for Spaced Repetition Language Learning. Lecture Notes in Computer Science. <https://doi.org/10.1007/978-3-030-52240-7_65>
- **[barzagar2019]** Nazari & Ebersbach (2019). Distributed practice in mathematics: Recommendable especially for students on a medium performance level?. Trends in Neuroscience and Education. <https://doi.org/10.1016/j.tine.2019.100122>
- **[emeny2021]** Emeny, Hartwig & Rohrer (2021). Spaced mathematics practice improves test scores and reduces overconfidence. Applied Cognitive Psychology. <https://doi.org/10.1002/acp.3814>
- **[hopkins2016]** Hopkins, Lyle et al. (2015). Spaced Retrieval Practice Increases College Students’ Short- and Long-Term Retention of Mathematics Knowledge. Educational Psychology Review. <https://doi.org/10.1007/s10648-015-9349-8>
- **[sobel2011]** Sobel, Cepeda & Kapler (2010). Spacing effects in real‐world classroom vocabulary learning. Applied Cognitive Psychology. <https://doi.org/10.1002/acp.1747>
- **[toppino2014]** Toppino, Fearnow-Kenney et al. (2009). The spacing effect in intentional and incidental free recall by children and adults: Limits on the automaticity hypothesis. Memory & Cognition. <https://doi.org/10.3758/mc.37.3.316>
- **[kornell2010]** Kornell, Castel et al. (2010). Spacing as the friend of both memory and induction in young and older adults.. Psychology and Aging. <https://doi.org/10.1037/a0017807>
- **[sense2016]** Sense, Behrens et al. (2016). An Individual's Rate of Forgetting Is Stable Over Time but Differs Across Materials. Topics in Cognitive Science. <https://doi.org/10.1111/tops.12183>
- **[zerr2018]** Zerr, Berg et al. (2018). Learning Efficiency: Identifying Individual Differences in Learning Rate and Retention in Healthy Adults. Psychological Science. <https://doi.org/10.1177/0956797618772540>
- **[mettler2016]** Mettler, Massey & Kellman (2016). A comparison of adaptive and fixed schedules of practice.. Journal of Experimental Psychology: General. <https://doi.org/10.1037/xge0000170>
- **[vlach2012]** Vlach & Sandhofer (2012). Distributing Learning Over Time: The Spacing Effect in Children’s Acquisition and Generalization of Science Concepts. Child Development. <https://doi.org/10.1111/j.1467-8624.2012.01781.x>
- **[carpenter2022]** Carpenter, Pan & Butler (2022). The science of effective learning with spacing and retrieval practice. Nature Reviews Psychology. <https://doi.org/10.1038/s44159-022-00089-1>

### Interleaving (7)

- **[brunmair2019]** Brunmair & Richter (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators.. Psychological Bulletin. <https://doi.org/10.1037/bul0000209>
- **[rohrer2007]** Rohrer & Taylor (2007). The shuffling of mathematics problems improves learning. Instructional Science. <https://doi.org/10.1007/s11251-007-9015-8>
- **[rohrer2015]** Rohrer, Dedrick & Stershic (2015). Interleaved practice improves mathematics learning.. Journal of Educational Psychology. <https://doi.org/10.1037/edu0000001>
- **[rohrer2020]** Rohrer, Dedrick et al. (2020). A randomized controlled trial of interleaved mathematics practice.. Journal of Educational Psychology. <https://doi.org/10.1037/edu0000367>
- **[kornell2008]** Kornell & Bjork (2008). Learning Concepts and Categories: Is Spacing the “Enemy of Induction”?. Psychological Science. <https://doi.org/10.1111/j.1467-9280.2008.02127.x>
- **[firth2021]** Firth, Rivers & Boyle (2021). A systematic review of interleaving as a concept learning strategy. Review of Education. <https://doi.org/10.1002/rev3.3266>
- **[taylor2010]** Taylor & Rohrer (2009). The effects of interleaved practice. Applied Cognitive Psychology. <https://doi.org/10.1002/acp.1598>

### Guidance, worked examples, expertise reversal (34)

- **[sweller1985]** Sweller & Cooper (1985). The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra. Cognition and Instruction. <https://doi.org/10.1207/s1532690xci0201_3>
- **[sweller1988]** Sweller (1988). Cognitive Load During Problem Solving: Effects on Learning. Cognitive Science. <https://doi.org/10.1207/s15516709cog1202_4>
- **[sweller2019]** Sweller, van Merriënboer & Paas (2019). Cognitive Architecture and Instructional Design: 20 Years Later. Educational Psychology Review. <https://doi.org/10.1007/s10648-019-09465-5>
- **[kalyuga2003]** Kalyuga, Ayres et al. (2003). The Expertise Reversal Effect. Educational Psychologist. <https://doi.org/10.1207/s15326985ep3801_4>
- **[kalyuga2007]** Kalyuga (2007). Expertise Reversal Effect and Its Implications for Learner-Tailored Instruction. Educational Psychology Review. <https://doi.org/10.1007/s10648-007-9054-3>
- **[tetzlaff2025]** Tetzlaff, Simonsmeier et al. (2025). A cornerstone of adaptivity – A meta-analysis of the expertise reversal effect. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2025.102142>
- **[renkl2014]** Renkl (2013). Toward an Instructionally Oriented Theory of Example‐Based Learning. Cognitive Science. <https://doi.org/10.1111/cogs.12086>
- **[renkl2003]** Renkl & Atkinson (2003). Structuring the Transition From Example Study to Problem Solving in Cognitive Skill Acquisition: A Cognitive Load Perspective. Educational Psychologist. <https://doi.org/10.1207/s15326985ep3801_3>
- **[atkinson2000]** Atkinson, Derry et al. (2000). Learning from Examples: Instructional Principles from the Worked Examples Research. Review of Educational Research. <https://doi.org/10.2307/1170661>
- **[barbieri2023]** Barbieri, Miller-Cotto et al. (2023). A Meta-analysis of the Worked Examples Effect on Mathematics Performance. Educational Psychology Review. <https://doi.org/10.1007/s10648-023-09745-1>
- **[kirschner2006]** Kirschner, Sweller & Clark (2006). Why Minimal Guidance During Instruction Does Not Work: An Analysis of the Failure of Constructivist, Discovery, Problem-Based, Experiential, and Inquiry-Based Teaching. Educational Psychologist. <https://doi.org/10.1207/s15326985ep4102_1>
- **[alfieri2011]** Alfieri, Brooks et al. (2011). Does discovery-based instruction enhance learning?. Journal of Educational Psychology. <https://doi.org/10.1037/a0021017>
- **[belland2017]** Belland, Walker et al. (2016). Synthesizing Results From Empirical Research on Computer-Based Scaffolding in STEM Education: A Meta-Analysis. Review of Educational Research. <https://doi.org/10.3102/0034654316670999>
- **[vandepol2010]** van de Pol, Volman & Beishuizen (2010). Scaffolding in Teacher–Student Interaction: A Decade of Research. Educational Psychology Review. <https://doi.org/10.1007/s10648-010-9127-6>
- **[wood1976]** Wood, Bruner & Ross (1976). THE ROLE OF TUTORING IN PROBLEM SOLVING *. Journal of Child Psychology and Psychiatry. <https://doi.org/10.1111/j.1469-7610.1976.tb00381.x>
- **[kapur2016]** Kapur (2016). Examining Productive Failure, Productive Success, Unproductive Failure, and Unproductive Success in Learning. Educational Psychologist. <https://doi.org/10.1080/00461520.2016.1155457>
- **[sinha2021]** Sinha & Kapur (2021). When Problem Solving Followed by Instruction Works: Evidence for Productive Failure. Review of Educational Research. <https://doi.org/10.3102/00346543211019105>
- **[chen2017]** Chen, Kalyuga & Sweller (2016). The Expertise Reversal Effect is a Variant of the More General Element Interactivity Effect. Educational Psychology Review. <https://doi.org/10.1007/s10648-016-9359-1>
- **[kalyuga2010]** Kalyuga & Renkl (2009). Expertise reversal effect and its instructional implications: introduction to the special issue. Instructional Science. <https://doi.org/10.1007/s11251-009-9102-0>
- **[mcnamara1996]** McNamara, Kintsch et al. (1996). Are Good Texts Always Better? Interactions of Text Coherence, Background Knowledge, and Levels of Understanding in Learning From Text. Cognition and Instruction. <https://doi.org/10.1207/s1532690xci1401_1>
- **[salden2010]** Salden, Aleven et al. (2009). The expertise reversal effect and worked examples in tutored problem solving. Instructional Science. <https://doi.org/10.1007/s11251-009-9107-8>
- **[kalyuga2004]** Kalyuga & Sweller (2004). Measuring Knowledge to Optimize Cognitive Load Factors During Instruction.. Journal of Educational Psychology. <https://doi.org/10.1037/0022-0663.96.3.558>
- **[kalyuga2005]** Kalyuga & Sweller (2005). Rapid dynamic assessment of expertise to improve the efficiency of adaptive e-learning. Educational Technology Research and Development. <https://doi.org/10.1007/bf02504800>
- **[vangog2011]** van Gog & Rummel (2010). Example-Based Learning: Integrating Cognitive and Social-Cognitive Research Perspectives. Educational Psychology Review. <https://doi.org/10.1007/s10648-010-9134-7>
- **[paas1994]** Paas & Van Merriënboer (1994). Variability of worked examples and transfer of geometrical problem-solving skills: A cognitive-load approach.. Journal of Educational Psychology. <https://doi.org/10.1037/0022-0663.86.1.122>
- **[loibl2017]** Loibl, Roll & Rummel (2016). Towards a Theory of When and How Problem Solving Followed by Instruction Supports Learning. Educational Psychology Review. <https://doi.org/10.1007/s10648-016-9379-x>
- **[mayer2004]** Mayer (2004). Should There Be a Three-Strikes Rule Against Pure Discovery Learning?. American Psychologist. <https://doi.org/10.1037/0003-066x.59.1.14>
- **[lazonder2016]** Lazonder & Harmsen (2016). Meta-Analysis of Inquiry-Based Learning: Effects of Guidance. Review of Educational Research. <https://doi.org/10.3102/0034654315627366>
- **[tetzlaff2021]** Tetzlaff, Schmiedek & Brod (2020). Developing Personalized Education: A Dynamic Framework. Educational Psychology Review. <https://doi.org/10.1007/s10648-020-09570-w>
- **[plass2020]** Plass & Pawar (2020). Toward a taxonomy of adaptivity for learning. Journal of Research on Technology in Education. <https://doi.org/10.1080/15391523.2020.1719943>
- **[sweller2011]** Sweller (2012). Cognitive Load Theory. Encyclopedia of the Sciences of Learning. <https://doi.org/10.1007/978-1-4419-1428-6_446>
- **[paas2003]** Paas, Renkl & Sweller (2003). Cognitive Load Theory and Instructional Design: Recent Developments. Educational Psychologist. <https://doi.org/10.1207/s15326985ep3801_1>
- **[vanmerrienboer2005]** van Merriënboer & Sweller (2005). Cognitive Load Theory and Complex Learning: Recent Developments and Future Directions. Educational Psychology Review. <https://doi.org/10.1007/s10648-005-3951-0>
- **[leppink2013]** Leppink, Paas et al. (2013). Development of an instrument for measuring different types of cognitive load. Behavior Research Methods. <https://doi.org/10.3758/s13428-013-0334-1>

### Prior knowledge and learning rates (11)

- **[simonsmeier2022]** Simonsmeier, Flaig et al. (2021). Domain-specific prior knowledge and learning: A meta-analysis. Educational Psychologist. <https://doi.org/10.1080/00461520.2021.1939700>
- **[dochy1999]** Dochy, Segers & Buehl (1999). The Relation between Assessment Practices and Outcomes of Studies: The Case of Research on Prior Knowledge. Review of Educational Research. <https://doi.org/10.2307/1170673>
- **[hailikari2008]** Hailikari, Katajavuori & Lindblom-Ylanne (2008). The Relevance of Prior Knowledge in Learning and Instructional Design. American Journal of Pharmaceutical Education. <https://doi.org/10.1016/s0002-9459(24)00470-4>
- **[shing2016]** Shing & Brod (2016). Effects of Prior Knowledge on Memory: Implications for Education. Mind, Brain, and Education. <https://doi.org/10.1111/mbe.12110>
- **[koedinger2023]** Koedinger, Carvalho et al. (2023). An astonishing regularity in student learning rate. Proceedings of the National Academy of Sciences. <https://doi.org/10.1073/pnas.2221311120>
- **[heathcote2000]** Heathcote, Brown & Mewhort (2000). The power law repealed: The case for an exponential law of practice. Psychonomic Bulletin & Review. <https://doi.org/10.3758/bf03212979>
- **[cen2006]** Cen, Koedinger & Junker (2006). Learning Factors Analysis – A General Method for Cognitive Model Evaluation and Improvement. Lecture Notes in Computer Science. <https://doi.org/10.1007/11774303_17>
- **[pavlik2009]** Pavlik Philip I., Cen Hao & Koedinger Kenneth R. (2009). Performance Factors Analysis &ndash; A New Alternative to Knowledge Tracing. Frontiers in Artificial Intelligence and Applications. <https://doi.org/10.3233/978-1-60750-028-5-531>
- **[carroll1963]** Carroll (1963). A Model of School Learning. Teachers College Record: The Voice of Scholarship in Education. <https://doi.org/10.1177/016146816306400801>
- **[ericsson1993]** Ericsson, Krampe & Tesch-Römer (1993). The role of deliberate practice in the acquisition of expert performance.. Psychological Review. <https://doi.org/10.1037/0033-295x.100.3.363>
- **[macnamara2014]** MacNamara, Hambrick & Oswald (2013). Deliberate Practice and Performance in Music, Games, Sports, Professions, and Education: A Meta-Analysis: (633262013-474). PsycEXTRA Dataset. <https://doi.org/10.1037/e633262013-474>

### Adaptive and tutoring systems (43)

- **[kulik1990]** Kulik, Kulik & Bangert-Drowns (1990). Effectiveness of Mastery Learning Programs: A Meta-Analysis. Review of Educational Research. <https://doi.org/10.2307/1170612>
- **[bloom1984]** Bloom (1984). The 2 Sigma Problem: The Search for Methods of Group Instruction as Effective as One-to-One Tutoring. Educational Researcher. <https://doi.org/10.2307/1175554>
- **[vanlehn2011]** VanLEHN (2011). The Relative Effectiveness of Human Tutoring, Intelligent Tutoring Systems, and Other Tutoring Systems. Educational Psychologist. <https://doi.org/10.1080/00461520.2011.611369>
- **[ma2014]** Ma, Adesope et al. (2014). Intelligent tutoring systems and learning outcomes: A meta-analysis.. Journal of Educational Psychology. <https://doi.org/10.1037/a0037123>
- **[kulik2016]** Kulik & Fletcher (2016). Effectiveness of Intelligent Tutoring Systems: A Meta-Analytic Review. Review of Educational Research. <https://doi.org/10.3102/0034654315581420>
- **[steenbergenhu2013]** Steenbergen-Hu & Cooper (2013). A meta-analysis of the effectiveness of intelligent tutoring systems on K–12 students’ mathematical learning.. Journal of Educational Psychology. <https://doi.org/10.1037/a0032447>
- **[steenbergenhu2014]** Steenbergen-Hu & Cooper (2014). A meta-analysis of the effectiveness of intelligent tutoring systems on college students’ academic learning.. Journal of Educational Psychology. <https://doi.org/10.1037/a0034752>
- **[pane2014]** Pane, Griffin et al. (2014). Effectiveness of Cognitive Tutor Algebra I at Scale. Educational Evaluation and Policy Analysis. <https://doi.org/10.3102/0162373713507480>
- **[corbett1994]** Corbett & Anderson (1995). Knowledge tracing: Modeling the acquisition of procedural knowledge. User Modelling and User-Adapted Interaction. <https://doi.org/10.1007/bf01099821>
- **[pelanek2017bkt]** Pelánek (2017). Bayesian knowledge tracing, logistic models, and beyond: an overview of learner modeling techniques. User Modeling and User-Adapted Interaction. <https://doi.org/10.1007/s11257-017-9193-2>
- **[piech2015]** Piech, Jonathan et al. (2015). Deep Knowledge Tracing. arXiv (Cornell University). <https://doi.org/10.48550/arxiv.1506.05908>
- **[khajah2016]** Khajah, Lindsey & Mozer (2016). How deep is knowledge tracing?. arXiv. <https://arxiv.org/abs/1604.02416>
- **[roschelle2016]** Roschelle, Feng et al. (2016). Online Mathematics Homework Increases Student Achievement. AERA Open. <https://doi.org/10.1177/2332858416673968>
- **[escueta2020]** Escueta, Nickow et al. (2020). Upgrading Education with Technology: Insights from Experimental Research. Journal of Economic Literature. <https://doi.org/10.1257/jel.20191507>
- **[muralidharan2019]** Muralidharan, Singh & Ganimian (2019). Disrupting Education? Experimental Evidence on Technology-Aided Instruction in India. American Economic Review. <https://doi.org/10.1257/aer.20171112>
- **[banerjee2007]** Banerjee, Cole et al. (2007). Remedying Education: Evidence from Two Randomized Experiments in India. The Quarterly Journal of Economics. <https://doi.org/10.1162/qjec.122.3.1235>
- **[xie2019]** Xie, Chu et al. (2019). Trends and development in technology-enhanced adaptive/personalized learning: A systematic review of journal publications from 2007 to 2017. Computers & Education. <https://doi.org/10.1016/j.compedu.2019.103599>
- **[nickow2020]** Nickow, Oreopoulos & Quan (2020). The Impressive Effects of Tutoring on PreK-12 Learning: A Systematic Review and Meta-Analysis of the Experimental Evidence. National Bureau of Economic Research. <https://doi.org/10.3386/w27476>
- **[chi2001]** Chi, Siler et al. (2001). Learning from human tutoring. Cognitive Science. <https://doi.org/10.1207/s15516709cog2504_1>
- **[heffernan2014]** Heffernan & Heffernan (2014). The ASSISTments Ecosystem: Building a Platform that Brings Scientists and Teachers Together for Minimally Invasive Research on Human Learning and Teaching. International Journal of Artificial Intelligence in Education. <https://doi.org/10.1007/s40593-014-0024-x>
- **[yudelson2013]** Yudelson, Koedinger & Gordon (2013). Individualized Bayesian Knowledge Tracing Models. Lecture Notes in Computer Science. <https://doi.org/10.1007/978-3-642-39112-5_18>
- **[pardos2010]** Pardos & Heffernan (2010). Modeling Individualization in a Bayesian Networks Implementation of Knowledge Tracing. Lecture Notes in Computer Science. <https://doi.org/10.1007/978-3-642-13470-8_24>
- **[major2021]** Major, Francis & Tsapali (2021). The effectiveness of technology‐supported personalised learning in low‐ and middle‐income countries: A meta‐analysis. British Journal of Educational Technology. <https://doi.org/10.1111/bjet.13116>
- **[kulik1991cbi]** Kulik & Kulik (1991). Effectiveness of computer-based instruction: An updated analysis. Computers in Human Behavior. <https://doi.org/10.1016/0747-5632(91)90030-5>
- **[doroudi2019]** Doroudi, Aleven & Brunskill (2019). Where’s the Reward?. International Journal of Artificial Intelligence in Education. <https://doi.org/10.1007/s40593-019-00187-x>
- **[rafferty2016]** Rafferty, Brunskill et al. (2015). Faster Teaching via POMDP Planning. Cognitive Science. <https://doi.org/10.1111/cogs.12290>
- **[vanlehn1994]** VanLehn, Ohlsson & Nason (1994). Applications of simulated students: an exploration. <https://openalex.org/W1496771489>
- **[kaser2024]** Käser & Alexandron (2024). Simulated Learners in Educational Technology: A Systematic Literature Review and a Turing-like Test. International Journal of Artificial Intelligence in Education. <https://doi.org/10.1007/s40593-023-00337-2>
- **[mandel2014]** Mandel, Liu et al. (2014). Offline policy evaluation across representations with applications to educational games. International Joint Conference on Autonomous Agents and Multiagent Systems. <https://doi.org/10.65109/tnvs8310>
- **[doroudi2019fair]** Doroudi & Brunskill (2019). Fairer but Not Fair Enough On the Equitability of Knowledge Tracing. Proceedings of the 9th International Conference on Learning Analytics & Knowledge. <https://doi.org/10.1145/3303772.3303838>
- **[thai2011]** Thai-Nghe, Horváth & Schmidt-Thieme (2011). Factorization Models for Forecasting Student Performance. Educational Data Mining. <https://openalex.org/W13474624>
- **[anderson1995]** Anderson, Corbett et al. (1995). Cognitive Tutors: Lessons Learned. Journal of the Learning Sciences. <https://doi.org/10.1207/s15327809jls0402_2>
- **[koedinger2012]** Koedinger, Corbett & Perfetti (2012). The Knowledge‐Learning‐Instruction Framework: Bridging the Science‐Practice Chasm to Enhance Robust Student Learning. Cognitive Science. <https://doi.org/10.1111/j.1551-6709.2012.01245.x>
- **[koedinger2013]** Koedinger, Booth & Klahr (2013). Instructional Complexity and the Science to Constrain It. Science. <https://doi.org/10.1126/science.1238056>
- **[ritter2007]** Ritter, Anderson et al. (2007). Cognitive Tutor: Applied research in mathematics education. Psychonomic Bulletin & Review. <https://doi.org/10.3758/bf03194060>
- **[doroudi2017]** Doroudi, Aleven & Brunskill (2017). Robust Evaluation Matrix: Towards a More Principled Offline Exploration of Instructional Policies. Proceedings of the Fourth (2017) ACM Conference on Learning @ Scale. <https://doi.org/10.1145/3051457.3051463>
- **[liu2017closing]** Liu & Koedinger (2017). Closing the Loop: Automated Data-Driven Cognitive Model Discoveries Lead to Improved Instruction and Learning Gains. Journal of Educational Data Mining. <https://doi.org/10.5281/zenodo.3554625>
- **[shute2012]** Shute & Zapata-Rivera (2012). Adaptive Educational Systems. Adaptive Technologies for Training and Education. <https://doi.org/10.1017/cbo9781139049580.004>
- **[vandewaetere2011]** Vandewaetere, Desmet & Clarebout (2011). The contribution of learner characteristics in the development of computer-based adaptive learning environments. Computers in Human Behavior. <https://doi.org/10.1016/j.chb.2010.07.038>
- **[bernacki2021]** Bernacki, Greene & Lobczowski (2021). A Systematic Review of Research on Personalized Learning: Personalized by Whom, to What, How, and for What Purpose(s)?. Educational Psychology Review. <https://doi.org/10.1007/s10648-021-09615-8>
- **[zhang2020]** Zhang, Basham & Yang (2020). Understanding the implementation of personalized learning: A research synthesis. Educational Research Review. <https://doi.org/10.1016/j.edurev.2020.100339>
- **[schneider2017]** Schneider & Preckel (2017). Variables associated with achievement in higher education: A systematic review of meta-analyses.. Psychological Bulletin. <https://doi.org/10.1037/bul0000098>
- **[hattie1996]** Hattie, Biggs & Purdie (1996). Effects of Learning Skills Interventions on Student Learning: A Meta-Analysis. Review of Educational Research. <https://doi.org/10.2307/1170605>

### Item response, Elo and response times (18)

- **[pelanek2016]** Pelánek (2016). Applications of the Elo rating system in adaptive educational systems. Computers & Education. <https://doi.org/10.1016/j.compedu.2016.03.017>
- **[klinkenberg2011]** Klinkenberg, Straatemeier & van der Maas (2011). Computer adaptive practice of Maths ability using a new item response model for on the fly ability and difficulty estimation. Computers & Education. <https://doi.org/10.1016/j.compedu.2011.02.003>
- **[maris2012]** Maris & van der Maas (2012). Speed-Accuracy Response Models: Scoring Rules based on Response Time and Accuracy. Psychometrika. <https://doi.org/10.1007/s11336-012-9288-y>
- **[brinkhuis2018]** Brinkhuis, Savi et al. (2018). Learning As It Happens: A Decade of Analyzing and Shaping a Large-Scale Online Learning System. Journal of Learning Analytics. <https://doi.org/10.18608/jla.2018.52.3>
- **[glickman1999]** Glickman (1999). Parameter Estimation in Large Dynamic Paired Comparison Experiments. Journal of the Royal Statistical Society Series C: Applied Statistics. <https://doi.org/10.1111/1467-9876.00159>
- **[vanderlinden2007]** van der Linden (2007). A Hierarchical Framework for Modeling Speed and Accuracy on Test Items. Psychometrika. <https://doi.org/10.1007/s11336-006-1478-z>
- **[wauters2010]** Wauters, Desmet & Van den Noortgate (2010). Adaptive item‐based learning environments based on the item response theory: possibilities and challenges. Journal of Computer Assisted Learning. <https://doi.org/10.1111/j.1365-2729.2010.00368.x>
- **[goldhammer2014]** Goldhammer, Naumann et al. (2014). The time on task effect in reading and problem solving is moderated by task difficulty and skill: Insights from a computer-based large-scale assessment.. Journal of Educational Psychology. <https://doi.org/10.1037/a0034716>
- **[debeer2014]** Debeer, Buchholz et al. (2014). Student, School, and Country Differences in Sustained Test-Taking Effort in the 2009 PISA Reading Assessment. Journal of Educational and Behavioral Statistics. <https://doi.org/10.3102/1076998614558485>
- **[hartig2012]** Hartig & Buchholz (2012). A multilevel item response model for item position effects and individual persistence. Psychological test and assessment modeling. <https://openalex.org/W2117924135>
- **[borgonovi2016]** Borgonovi & Biecek (2016). An international comparison of students' ability to endure fatigue and maintain motivation during a low-stakes test. Learning and Individual Differences. <https://doi.org/10.1016/j.lindif.2016.06.001>
- **[ackerman2009]** Ackerman & Kanfer (2009). Test length and cognitive fatigue: An empirical examination of effects on performance and test-taker reactions.. Journal of Experimental Psychology: Applied. <https://doi.org/10.1037/a0015719>
- **[meyers2009]** Meyers, Miller & Way (2008). Item Position and Item Difficulty Change in an IRT-Based Common Item Equating Design. Applied Measurement in Education. <https://doi.org/10.1080/08957340802558342>
- **[weiss1984]** WEISS & KINGSBURY (1984). APPLICATION OF COMPUTERIZED ADAPTIVE TESTING TO EDUCATIONAL PROBLEMS. Journal of Educational Measurement. <https://doi.org/10.1111/j.1745-3984.1984.tb01040.x>
- **[debeer2013]** Debeer & Janssen (2013). Modeling Item‐Position Effects Within an IRT Framework. Journal of Educational Measurement. <https://doi.org/10.1111/jedm.12009>
- **[deboeck2019]** De Boeck & Jeon (2019). An Overview of Models for Response Times and Processes in Cognitive Tests. Frontiers in Psychology. <https://doi.org/10.3389/fpsyg.2019.00102>
- **[pelanek2017elo]** Pelánek, Papoušek et al. (2016). Elo-based learner modeling for the adaptive practice of facts. User Modeling and User-Adapted Interaction. <https://doi.org/10.1007/s11257-016-9185-7>
- **[papousek2014]** Pelánek, Papoušek & Stanislav (2014). Adaptive Practice of Facts in Domains with Varied Prior Knowledge. <https://openalex.org/W2579739383>

### Rapid guessing, effort, gaming (16)

- **[wise2005]** Wise & Kong (2005). Response Time Effort: A New Measure of Examinee Motivation in Computer-Based Tests. Applied Measurement in Education. <https://doi.org/10.1207/s15324818ame1802_2>
- **[wise2017]** Wise (2017). Rapid‐Guessing Behavior: Its Identification, Interpretation, and Implications. Educational Measurement: Issues and Practice. <https://doi.org/10.1111/emip.12165>
- **[wise2006]** Wise & DeMars (2006). An Application of Item Response Time: The Effort‐Moderated IRT Model. Journal of Educational Measurement. <https://doi.org/10.1111/j.1745-3984.2006.00002.x>
- **[schnipke1997]** Schnipke & Scrams (1997). Modeling Item Response Times With a Two‐State Mixture Model: A New Method of Measuring Speededness. Journal of Educational Measurement. <https://doi.org/10.1111/j.1745-3984.1997.tb00516.x>
- **[kong2007]** Kong, Wise & Bhola (2007). Setting the Response Time Threshold Parameter to Differentiate Solution Behavior From Rapid-Guessing Behavior. Educational and Psychological Measurement. <https://doi.org/10.1177/0013164406294779>
- **[wise2006cbt]** Wise, Bhola & Yang (2006). Taking the Time to Improve the Validity of Low‐Stakes Tests: The Effort‐Monitoring CBT. Educational Measurement: Issues and Practice. <https://doi.org/10.1111/j.1745-3992.2006.00054.x>
- **[wise2019]** Wise, Kuhfeld & Soland (2019). The Effects of Effort Monitoring With Proctor Notification on Test-Taking Engagement, Test Performance, and Validity. Applied Measurement in Education. <https://doi.org/10.1080/08957347.2019.1577248>
- **[baker2004]** Baker, Corbett et al. (2004). Off-task behavior in the cognitive tutor classroom: when students "game the system". Proceedings of the SIGCHI Conference on Human Factors in Computing Systems. <https://doi.org/10.1145/985692.985741>
- **[baker2008]** Baker, Walonoski et al. (2008). Why Students Engage in “Gaming the System” Behavior in Interactive Learning Environments. <https://openalex.org/W2115486496>
- **[walonoski2006]** Walonoski & Heffernan (2006). Detection and Analysis of Off-Task Gaming Behavior in Intelligent Tutoring Systems. Lecture Notes in Computer Science. <https://doi.org/10.1007/11774303_38>
- **[rios2017]** Rios, Guo et al. (2016). Evaluating the Impact of Careless Responding on Aggregated-Scores: To Filter Unmotivated Examinees or Not?. International Journal of Testing. <https://doi.org/10.1080/15305058.2016.1231193>
- **[wise2020]** Wise (2020). Six insights regarding test-taking disengagement. Educational Research and Evaluation. <https://doi.org/10.1080/13803611.2021.1963942>
- **[heitz2014]** Heitz (2014). The speed-accuracy tradeoff: history, physiology, methodology, and behavior. Frontiers in Neuroscience. <https://doi.org/10.3389/fnins.2014.00150>
- **[baker2010gaming]** Baker, Mitrović & Mathews (2010). Detecting Gaming the System in Constraint-Based Tutors. Lecture Notes in Computer Science. <https://doi.org/10.1007/978-3-642-13470-8_25>
- **[wise2017gao]** Wise & Gao (2017). A General Approach to Measuring Test-Taking Effort on Computer-Based Tests. Applied Measurement in Education. <https://doi.org/10.1080/08957347.2017.1353992>
- **[lee2014rt]** Lee & Jia (2014). Using response time to investigate students' test-taking behaviors in a NAEP computer-based study. Large-scale Assessments in Education. <https://doi.org/10.1186/s40536-014-0008-1>

### Help seeking and hints (8)

- **[aleven2003]** Aleven, Stahl et al. (2003). Help Seeking and Help Design in Interactive Learning Environments. Review of Educational Research. <https://doi.org/10.3102/00346543073003277>
- **[aleven2006]** Aleven, McLaren et al. (2006). Toward Meta-cognitive Tutoring: A Model of Help Seeking with a Cognitive Tutor. International Journal of Artificial Intelligence in Education. <https://doi.org/10.3233/irg-2006-16(2)02>
- **[roll2011]** Roll, Aleven et al. (2011). Improving students’ help-seeking skills using metacognitive feedback in an intelligent tutoring system. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2010.07.004>
- **[wood1999]** Wood & Wood (1999). Help seeking, learning and contingent tutoring. Computers & Education. <https://doi.org/10.1016/s0360-1315(99)00030-5>
- **[ryan2001]** Ryan, Pintrich & Midgley (2001). Avoiding Seeking Help in the Classroom: Who and Why?. Educational Psychology Review. <https://doi.org/10.1023/a:1009013420053>
- **[aleven2016help]** Aleven, Roll et al. (2016). Help Helps, But Only So Much: Research on Help Seeking with Intelligent Tutoring Systems. International Journal of Artificial Intelligence in Education. <https://doi.org/10.1007/s40593-015-0089-1>
- **[karabenick2011]** Karabenick (2011). Classroom and technology-supported help seeking: The need for converging research paradigms. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2010.07.007>
- **[aleven2000]** Aleven & Koedinger (2000). Limitations of Student Control: Do Students Know when They Need Help?. Lecture Notes in Computer Science. <https://doi.org/10.1007/3-540-45108-0_33>

### Metacognition, confidence and calibration (37)

- **[fleming2014]** Fleming & Lau (2014). How to measure metacognition. Frontiers in Human Neuroscience. <https://doi.org/10.3389/fnhum.2014.00443>
- **[maniscalco2012]** Maniscalco & Lau (2012). A signal detection theoretic approach for estimating metacognitive sensitivity from confidence ratings. Consciousness and Cognition. <https://doi.org/10.1016/j.concog.2011.09.021>
- **[stankov2012]** Stankov, Lee et al. (2012). Confidence: A better predictor of academic achievement than self-efficacy, self-concept and anxiety?. Learning and Individual Differences. <https://doi.org/10.1016/j.lindif.2012.05.013>
- **[kruger1999]** Kruger & Dunning (1999). Unskilled and unaware of it: How difficulties in recognizing one's own incompetence lead to inflated self-assessments.. Journal of Personality and Social Psychology. <https://doi.org/10.1037/0022-3514.77.6.1121>
- **[dunlosky2012]** Dunlosky & Rawson (2012). Overconfidence produces underachievement: Inaccurate self evaluations undermine students’ learning and retention. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2011.08.003>
- **[ais2016]** Ais, Zylberberg et al. (2016). Individual consistency in the accuracy and distribution of confidence judgments. Cognition. <https://doi.org/10.1016/j.cognition.2015.10.006>
- **[mazancieux2020]** Mazancieux, Fleming et al. (2020). Is there a G factor for metacognition? Correlations in retrospective metacognitive sensitivity across tasks.. Journal of Experimental Psychology: General. <https://doi.org/10.1037/xge0000746>
- **[schraw2009]** Schraw (2008). A conceptual analysis of five measures of metacognitive monitoring. Metacognition and Learning. <https://doi.org/10.1007/s11409-008-9031-3>
- **[butterfield2001]** Butterfield & Metcalfe (2001). Errors committed with high confidence are hypercorrected.. Journal of Experimental Psychology: Learning, Memory, and Cognition. <https://doi.org/10.1037/0278-7393.27.6.1491>
- **[metcalfe2017]** Metcalfe (2017). Learning from Errors. Annual Review of Psychology. <https://doi.org/10.1146/annurev-psych-010416-044022>
- **[koriat1997]** Koriat (1997). Monitoring one's own knowledge during study: A cue-utilization approach to judgments of learning.. Journal of Experimental Psychology: General. <https://doi.org/10.1037/0096-3445.126.4.349>
- **[bjork2013]** Bjork, Dunlosky & Kornell (2013). Self-Regulated Learning: Beliefs, Techniques, and Illusions. Annual Review of Psychology. <https://doi.org/10.1146/annurev-psych-113011-143823>
- **[foster2017]** Foster, Was et al. (2016). Even after thirteen class exams, students are still overconfident: the role of memory for past exam performance in student predictions. Metacognition and Learning. <https://doi.org/10.1007/s11409-016-9158-6>
- **[galvin2003]** Galvin, Podd et al. (2003). Type 2 tasks in the theory of signal detectability: Discrimination between correct and incorrect decisions. Psychonomic Bulletin & Review. <https://doi.org/10.3758/bf03196546>
- **[nelson1984]** Nelson (1984). A comparison of current measures of the accuracy of feeling-of-knowing predictions.. Psychological Bulletin. <https://doi.org/10.1037/0033-2909.95.1.109>
- **[masson2009]** Masson & Rotello (2009). Sources of bias in the Goodman–Kruskal gamma coefficient measure of association: Implications for studies of metacognitive processes.. Journal of Experimental Psychology: Learning, Memory, and Cognition. <https://doi.org/10.1037/a0014876>
- **[fleming2017]** Fleming (2017). HMeta-d: hierarchical Bayesian estimation of metacognitive efficiency from confidence ratings. Neuroscience of Consciousness. <https://doi.org/10.1093/nc/nix007>
- **[rouault2018]** Rouault, Seow et al. (2018). Psychiatric Symptom Dimensions Are Associated With Dissociable Shifts in Metacognition but Not Task Performance. Biological Psychiatry. <https://doi.org/10.1016/j.biopsych.2017.12.017>
- **[hanley1982]** Hanley & McNeil (1982). The meaning and use of the area under a receiver operating characteristic (ROC) curve.. Radiology. <https://doi.org/10.1148/radiology.143.1.7063747>
- **[stankov2014]** Stankov & Lee (2008). Confidence and cognitive test performance.. Journal of Educational Psychology. <https://doi.org/10.1037/a0012546>
- **[kleitman2007]** Kleitman & Stankov (2007). Self-confidence and metacognitive processes. Learning and Individual Differences. <https://doi.org/10.1016/j.lindif.2007.03.004>
- **[dunning2004]** Dunning, Heath & Suls (2004). Flawed Self-Assessment: Implications for Health, Education, and the Workplace. Psychological Science in the Public Interest. <https://doi.org/10.1111/j.1529-1006.2004.00018.x>
- **[dinsmore2008]** Dinsmore, Alexander & Loughlin (2008). Focusing the Conceptual Lens on Metacognition, Self-regulation, and Self-regulated Learning. Educational Psychology Review. <https://doi.org/10.1007/s10648-008-9083-6>
- **[winne2002]** Winne & Jamieson-Noel (2002). Exploring students’ calibration of self reports about study tactics and achievement. Contemporary Educational Psychology. <https://doi.org/10.1016/s0361-476x(02)00006-1>
- **[zhou2012]** Zhou & Winne (2012). Modeling academic achievement by self-reported versus traced goal orientation. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2012.03.004>
- **[gasevic2017]** Gašević, Jovanović et al. (2017). Detecting Learning Strategies with Analytics: Links with Self-reported Measures and Academic Performance. Journal of Learning Analytics. <https://doi.org/10.18608/jla.2017.42.10>
- **[rhodes2008]** Rhodes & Castel (2008). Memory predictions are influenced by perceptual information: Evidence for metacognitive illusions.. Journal of Experimental Psychology: General. <https://doi.org/10.1037/a0013684>
- **[hacker2000]** Hacker, Bol et al. (2000). Test prediction and performance in a classroom context.. Journal of Educational Psychology. <https://doi.org/10.1037/0022-0663.92.1.160>
- **[fleming2024]** Fleming (2023). Metacognition and confidence: A review and synthesis. Center for Open Science. <https://doi.org/10.31234/osf.io/ge7tz>
- **[rahnev2020]** Rahnev, Desender et al. (2020). The Confidence Database. Nature Human Behaviour. <https://doi.org/10.1038/s41562-019-0813-1>
- **[hartwig2012]** Hartwig & Dunlosky (2011). Study strategies of college students: Are self-testing and scheduling related to achievement?. Psychonomic Bulletin & Review. <https://doi.org/10.3758/s13423-011-0181-y>
- **[kornell2007]** Kornell & Bjork (2007). The promise and perils of self-regulated study. Psychonomic Bulletin & Review. <https://doi.org/10.3758/bf03194055>
- **[dent2016]** Dent & Koenka (2015). The Relation Between Self-Regulated Learning and Academic Achievement Across Childhood and Adolescence: A Meta-Analysis. Educational Psychology Review. <https://doi.org/10.1007/s10648-015-9320-8>
- **[dignath2008]** Dignath, Buettner & Langfeldt (2008). How can primary school students learn self-regulated learning strategies most effectively?. Educational Research Review. <https://doi.org/10.1016/j.edurev.2008.02.003>
- **[donker2014]** Donker, de Boer et al. (2014). Effectiveness of learning strategy instruction on academic performance: A meta-analysis. Educational Research Review. <https://doi.org/10.1016/j.edurev.2013.11.002>
- **[jansen2019]** Jansen, van Leeuwen et al. (2019). Self-regulated learning partially mediates the effect of self-regulated learning interventions on achievement in higher education: A meta-analysis. Educational Research Review. <https://doi.org/10.1016/j.edurev.2019.100292>
- **[wong2019]** Wong, Baars et al. (2018). Supporting Self-Regulated Learning in Online Learning Environments and MOOCs: A Systematic Review. International Journal of Human–Computer Interaction. <https://doi.org/10.1080/10447318.2018.1543084>

### Self-efficacy (9)

- **[bandura1977]** Bandura (1977). Self-efficacy: Toward a unifying theory of behavioral change.. Psychological Review. <https://doi.org/10.1037/0033-295x.84.2.191>
- **[multon1991]** Multon, Brown & Lent (1991). Relation of self-efficacy beliefs to academic outcomes: A meta-analytic investigation.. Journal of Counseling Psychology. <https://doi.org/10.1037/0022-0167.38.1.30>
- **[richardson2012]** Richardson, Abraham & Bond (2012). Psychological correlates of university students' academic performance: A systematic review and meta-analysis.. Psychological Bulletin. <https://doi.org/10.1037/a0026838>
- **[honicke2016]** Honicke & Broadbent (2016). The influence of academic self-efficacy on academic performance: A systematic review. Educational Research Review. <https://doi.org/10.1016/j.edurev.2015.11.002>
- **[talsma2018]** Talsma, Schüz et al. (2018). I believe, therefore I achieve (and vice versa): A meta-analytic cross-lagged panel analysis of self-efficacy and academic performance. Learning and Individual Differences. <https://doi.org/10.1016/j.lindif.2017.11.015>
- **[valentine2004]** Valentine, DuBois & Cooper (2004). The Relation Between Self-Beliefs and Academic Achievement: A Meta-Analytic Review. Educational Psychologist. <https://doi.org/10.1207/s15326985ep3902_3>
- **[pajares1996]** Pajares (1996). Self-Efficacy Beliefs in Academic Settings. Review of Educational Research. <https://doi.org/10.2307/1170653>
- **[zimmerman2000]** Zimmerman (2000). Self-Efficacy: An Essential Motive to Learn. Contemporary Educational Psychology. <https://doi.org/10.1006/ceps.1999.1016>
- **[schunk1991]** Schunk (1991). Self-Efficacy and Academic Motivation. Educational Psychologist. <https://doi.org/10.1207/s15326985ep2603&4_2>

### Feedback and praise (14)

- **[hattie2007]** Hattie & Timperley (2007). The Power of Feedback. Review of Educational Research. <https://doi.org/10.3102/003465430298487>
- **[kluger1996]** Kluger & DeNisi (1996). The effects of feedback interventions on performance: A historical review, a meta-analysis, and a preliminary feedback intervention theory.. Psychological Bulletin. <https://doi.org/10.1037/0033-2909.119.2.254>
- **[shute2008]** Shute (2008). Focus on Formative Feedback. Review of Educational Research. <https://doi.org/10.3102/0034654307313795>
- **[wisniewski2020]** Wisniewski, Zierer & Hattie (2020). The Power of Feedback Revisited: A Meta-Analysis of Educational Feedback Research. Frontiers in Psychology. <https://doi.org/10.3389/fpsyg.2019.03087>
- **[vanderkleij2015]** Van der Kleij, Feskens & Eggen (2015). Effects of Feedback in a Computer-Based Learning Environment on Students’ Learning Outcomes: A Meta-Analysis. Review of Educational Research. <https://doi.org/10.3102/0034654314564881>
- **[bangertdrowns1991fb]** Bangert-Drowns, Kulik et al. (1991). The Instructional Effect of Feedback in Test-like Events. Review of Educational Research. <https://doi.org/10.2307/1170535>
- **[mertens2022]** Mertens, Finn & Lindner (2022). Effects of computer-based feedback on lower- and higher-order learning outcomes: A network meta-analysis.. Journal of Educational Psychology. <https://doi.org/10.1037/edu0000764>
- **[butler2008]** Butler, Karpicke & Roediger (2008). Correcting a metacognitive error: Feedback increases retention of low-confidence correct responses.. Journal of Experimental Psychology: Learning, Memory, and Cognition. <https://doi.org/10.1037/0278-7393.34.4.918>
- **[henderlong2002]** Henderlong & Lepper (2002). The effects of praise on children's intrinsic motivation: A review and synthesis.. Psychological Bulletin. <https://doi.org/10.1037/0033-2909.128.5.774>
- **[mueller1998]** Mueller & Dweck (1998). Praise for intelligence can undermine children's motivation and performance.. Journal of Personality and Social Psychology. <https://doi.org/10.1037/0022-3514.75.1.33>
- **[vanderkleij2012]** van der Kleij, Eggen et al. (2012). Effects of feedback in a computer-based assessment for learning. Computers & Education. <https://doi.org/10.1016/j.compedu.2011.07.020>
- **[attali2015]** Attali (2015). Effects of multiple-try feedback and question type during mathematics problem solving on performance in similar problems. Computers & Education. <https://doi.org/10.1016/j.compedu.2015.08.011>
- **[mullet2014]** Mullet, Butler et al. (2014). Delaying feedback promotes transfer of knowledge despite student preferences to receive feedback immediately.. Journal of Applied Research in Memory and Cognition. <https://doi.org/10.1016/j.jarmac.2014.05.001>
- **[kulik1988]** Kulik & Kulik (1988). Timing of Feedback and Verbal Learning. Review of Educational Research. <https://doi.org/10.2307/1170349>

### Misconceptions and errors (13)

- **[posner1982]** Posner, Strike et al. (1982). Accommodation of a scientific conception: Toward a theory of conceptual change. Science Education. <https://doi.org/10.1002/sce.3730660207>
- **[smith1994]** Smith III, diSessa & Roschelle (1994). Misconceptions Reconceived: A Constructivist Analysis of Knowledge in Transition. Journal of the Learning Sciences. <https://doi.org/10.1207/s15327809jls0302_1>
- **[shtulman2012]** Shtulman & Valcarcel (2012). Scientific knowledge suppresses but does not supplant earlier intuitions. Cognition. <https://doi.org/10.1016/j.cognition.2012.04.005>
- **[payne1990]** Payne & Squibb (1990). Algebra Mal-Rules and Cognitive Accounts of Error. Cognitive Science. <https://doi.org/10.1207/s15516709cog1403_4>
- **[guzzetti1993]** Guzzetti, Snyder et al. (1993). Promoting Conceptual Change in Science: A Comparative Meta-Analysis of Instructional Interventions from Reading Education and Science Education. Reading Research Quarterly. <https://doi.org/10.2307/747886>
- **[tippett2010]** Tippett (2010). REFUTATION TEXT IN SCIENCE EDUCATION: A REVIEW OF TWO DECADES OF RESEARCH. International Journal of Science and Mathematics Education. <https://doi.org/10.1007/s10763-010-9203-x>
- **[lewandowsky2012]** Lewandowsky, Ecker et al. (2012). Misinformation and Its Correction: Continued Influence and Successful Debiasing. Psychological Science in the Public Interest. <https://doi.org/10.1177/1529100612451018>
- **[vosniadou1992]** Vosniadou & Brewer (1992). Mental models of the earth: A study of conceptual change in childhood. Cognitive Psychology. <https://doi.org/10.1016/0010-0285(92)90018-w>
- **[brown1978]** BROWN & BURTON (1978). Diagnostic models for procedural bugs in basic mathematical skills. Cognitive Science. <https://doi.org/10.1016/s0364-0213(78)80004-4>
- **[vanlehn1990]** VanLehn (1990). Mind Bugs: The Origins of Procedural Misconceptions. <https://openalex.org/W1564397683>
- **[schroeder2023]** Schroeder & Kucera (2022). Refutation Text Facilitates Learning: a Meta-Analysis of Between-Subjects Experiments. Educational Psychology Review. <https://doi.org/10.1007/s10648-021-09656-z>
- **[adams2019]** Adams, McLaren et al. (2014). Using erroneous examples to improve mathematics learning with a web-based tutoring system. Computers in Human Behavior. <https://doi.org/10.1016/j.chb.2014.03.053>
- **[mclaren2016]** McLaren, Adams & Mayer (2015). Delayed Learning Effects with Erroneous Examples: a Study of Learning Decimals with a Web-Based Tutor. International Journal of Artificial Intelligence in Education. <https://doi.org/10.1007/s40593-015-0064-x>
- **[ohlsson1996]** Ohlsson (1996). Learning from performance errors.. Psychological Review. <https://doi.org/10.1037/0033-295x.103.2.241>
- **[metcalfe2011]** Metcalfe & Finn (2011). People's hypercorrection of high-confidence errors: Did they know it all along?. Journal of Experimental Psychology: Learning, Memory, and Cognition. <https://doi.org/10.1037/a0021962>

### Persistence, mindset, grit (14)

- **[burnette2013]** Burnette, O'Boyle et al. (2013). Mind-sets matter: A meta-analytic review of implicit theories and self-regulation.. Psychological Bulletin. <https://doi.org/10.1037/a0029531>
- **[sisk2018]** Sisk, Burgoyne et al. (2018). To What Extent and Under Which Circumstances Are Growth Mind-Sets Important to Academic Achievement? Two Meta-Analyses. Psychological Science. <https://doi.org/10.1177/0956797617739704>
- **[yeager2019]** Yeager, Hanselman et al. (2019). A national experiment reveals where a growth mindset improves achievement. Nature. <https://doi.org/10.1038/s41586-019-1466-y>
- **[macnamara2023]** Macnamara & Burgoyne (2023). Do growth mindset interventions impact students’ academic achievement? A systematic review and meta-analysis with recommendations for best practices.. Psychological Bulletin. <https://doi.org/10.1037/bul0000352>
- **[crede2017]** Credé, Tynan & Harms (2017). Much ado about grit: A meta-analytic synthesis of the grit literature.. Journal of Personality and Social Psychology. <https://doi.org/10.1037/pspp0000102>
- **[duckworth2007]** Duckworth, Peterson et al. (2007). Grit: Perseverance and passion for long-term goals.. Journal of Personality and Social Psychology. <https://doi.org/10.1037/0022-3514.92.6.1087>
- **[ventura2013]** Ventura & Shute (2013). The validity of a game-based assessment of persistence. Computers in Human Behavior. <https://doi.org/10.1016/j.chb.2013.06.033>
- **[kizilcec2013]** Kizilcec, Piech & Schneider (2013). Deconstructing disengagement: analyzing learner subpopulations in massive open online courses. Proceedings of the Third International Conference on Learning Analytics and Knowledge. <https://doi.org/10.1145/2460296.2460330>
- **[dicerbo2014]** Mislevy, Corrigan et al. (2015). Psychometrics and Game-Based Assessment. Technology and Testing. <https://doi.org/10.4324/9781315871493-2>
- **[diener1978]** Diener & Dweck (1978). An analysis of learned helplessness: Continuous changes in performance, strategy, and achievement cognitions following failure.. Journal of Personality and Social Psychology. <https://doi.org/10.1037/0022-3514.36.5.451>
- **[bryan2021]** Bryan, Tipton & Yeager (2021). Behavioural science is unlikely to change the world without a heterogeneity revolution. Nature Human Behaviour. <https://doi.org/10.1038/s41562-021-01143-3>
- **[kizilcec2020]** Kizilcec, Reich et al. (2020). Scaling up behavioral science interventions in online education. Proceedings of the National Academy of Sciences. <https://doi.org/10.1073/pnas.1921417117>
- **[beck2013]** Beck & Gong (2013). Wheel-Spinning: Students Who Fail to Master a Skill. Lecture Notes in Computer Science. <https://doi.org/10.1007/978-3-642-39112-5_44>
- **[kai2018]** Kai, Almeda et al. (2018). Decision Tree Modeling of Wheel- Spinning and Productive Persistence in Skill Builders. Journal of Educational Data Mining. <https://doi.org/10.5281/zenodo.3344810>

### Affect and frustration (12)

- **[baker2010]** Baker, D'Mello et al. (2010). Better to be frustrated than bored: The incidence, persistence, and impact of learners’ cognitive–affective states during interactions with three different computer-based learning environments. International Journal of Human-Computer Studies. <https://doi.org/10.1016/j.ijhcs.2009.12.003>
- **[dmello2012]** D’Mello & Graesser (2011). Dynamics of affective states during complex learning. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2011.10.001>
- **[camachomorles2021]** Camacho-Morles et al. (2021). Activity Achievement Emotions and Academic Performance: A Meta-analysis. Educational Psychology Review. <https://doi.org/10.1007/s10648-020-09585-3>
- **[dmello2013]** D’Mello (2013). A selective meta-analysis on the relative incidence of discrete affective states during learning with technology.. Journal of Educational Psychology. <https://doi.org/10.1037/a0032674>
- **[dmello2014]** D’Mello, Lehman et al. (2014). Confusion can be beneficial for learning. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2012.05.003>
- **[pekrun2006]** Pekrun (2006). The Control-Value Theory of Achievement Emotions: Assumptions, Corollaries, and Implications for Educational Research and Practice. Educational Psychology Review. <https://doi.org/10.1007/s10648-006-9029-9>
- **[pekrun2002]** Pekrun, Goetz et al. (2002). Academic Emotions in Students' Self-Regulated Learning and Achievement: A Program of Qualitative and Quantitative Research. Educational Psychologist. <https://doi.org/10.1207/s15326985ep3702_4>
- **[pardos2014]** Pardos, Baker et al. (2014). Affective States and State Tests: Investigating How Affect and Engagement during the School Year Predict End-of-Year Learning Outcomes. Journal of Learning Analytics. <https://doi.org/10.18608/jla.2014.11.6>
- **[ocumpaugh2014]** Ocumpaugh, Baker et al. (2014). Population validity for educational data mining models: A case study in affect detection. British Journal of Educational Technology. <https://doi.org/10.1111/bjet.12156>
- **[arroyo2009]** Arroyo Ivon, Cooper David G. et al. (2009). Emotion Sensors Go To School. Frontiers in Artificial Intelligence and Applications. <https://doi.org/10.3233/978-1-60750-028-5-17>
- **[sanpedro2013]** Pedro, Baker et al. (2013). Predicting College Enrollment from Student Interaction with an Intelligent Tutoring System in Middle School.. Educational Data Mining. <https://openalex.org/W2394824715>
- **[hembree1988]** Hembree (1988). Correlates, Causes, Effects, and Treatment of Test Anxiety. Review of Educational Research. <https://doi.org/10.2307/1170348>
- **[vonderembse2018]** von der Embse, Jester et al. (2018). Test anxiety effects, predictors, and correlates: A 30-year meta-analytic review. Journal of Affective Disorders. <https://doi.org/10.1016/j.jad.2017.11.048>

### Reading and processing speed (5)

- **[brysbaert2019]** Brysbaert (2019). How many words do we read per minute? A review and meta-analysis of reading rate. Journal of Memory and Language. <https://doi.org/10.1016/j.jml.2019.104047>
- **[rayner2016]** Rayner, Schotter et al. (2016). So Much to Read, So Little Time: How Do We Read, and Can Speed Reading Help?. Psychological Science in the Public Interest. <https://doi.org/10.1177/1529100615623267>
- **[kail1994]** Kail & Salthouse (1994). Processing speed as a mental capacity. Acta Psychologica. <https://doi.org/10.1016/0001-6918(94)90003-5>
- **[salthouse1996]** Salthouse (1996). The processing-speed theory of adult age differences in cognition.. Psychological Review. <https://doi.org/10.1037/0033-295x.103.3.403>
- **[carver1992]** Carver (1992). Reading Rate: Theory, Research, and Practical Implications.. The Journal of Reading. <https://openalex.org/W1961625999>

### Language load and vocabulary (18)

- **[martiniello2008]** MARTINIELLO (2008). Language and the Performance of English-Language Learners in Math Word Problems. Harvard Educational Review. <https://doi.org/10.17763/haer.78.2.70783570r1111t32>
- **[abedi2001]** Abedi & Lord (2001). The Language Factor in Mathematics Tests. Applied Measurement in Education. <https://doi.org/10.1207/s15324818ame1403_2>
- **[haag2013]** Haag, Heppt et al. (2013). Second language learners' performance in mathematics: Disentangling the effects of academic language features. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2013.04.001>
- **[wolf2009]** Wolf & Leon (2009). An Investigation of the Language Demands in Content Assessments for English Language Learners. Educational Assessment. <https://doi.org/10.1080/10627190903425883>
- **[nation2006]** Nation (2006). How Large a Vocabulary is Needed For Reading and Listening?. The Canadian Modern Language Review. <https://doi.org/10.3138/cmlr.63.1.59>
- **[laufer2010]** Laufer & Ravenhorst-Kalovski (2010). Lexical threshold revisited: Lexical text coverage, learners’ vocabulary size and reading comprehension. Reading in a Foreign Language. <https://doi.org/10.64152/10125/66648>
- **[hu2000]** Hsueh-chao & Nation (2000). Unknown vocabulary density and reading comprehension. Reading in a Foreign Language. <https://doi.org/10.64152/10125/66973>
- **[schmitt2011]** SCHMITT, JIANG & GRABE (2011). The Percentage of Words Known in a Text and Reading Comprehension. The Modern Language Journal. <https://doi.org/10.1111/j.1540-4781.2011.01146.x>
- **[ozuru2009]** Ozuru, Dempsey & McNamara (2009). Prior knowledge, reading skill, and text cohesion in the comprehension of science texts. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2008.04.003>
- **[graesser2011]** Graesser, McNamara & Kulikowich (2011). Coh-Metrix: Providing Multilevel Analyses of Text Characteristics. Educational Researcher. <https://doi.org/10.3102/0013189x11413260>
- **[abedi2006]** Abedi (2006). Psychometric Issues in the ELL Assessment and Special Education Eligibility. Teachers College Record: The Voice of Scholarship in Education. <https://doi.org/10.1177/016146810610801107>
- **[abedi2004]** Abedi, Hofstetter & Lord (2004). Assessment Accommodations for English Language Learners: Implications for Policy-Based Empirical Research. Review of Educational Research. <https://doi.org/10.3102/00346543074001001>
- **[kieffer2009]** Kieffer, Lesaux et al. (2009). Accommodations for English Language Learners Taking Large-Scale Assessments: A Meta-Analysis on Effectiveness and Validity. Review of Educational Research. <https://doi.org/10.3102/0034654309332490>
- **[crossley2008]** CROSSLEY, GREENFIELD & McNAMARA (2008). Assessing Text Readability Using Cognitively Based Indices. TESOL Quarterly. <https://doi.org/10.1002/j.1545-7249.2008.tb00142.x>
- **[stahl1986]** Stahl & Fairbanks (1986). The Effects of Vocabulary Instruction: A Model-Based Meta-Analysis. Review of Educational Research. <https://doi.org/10.2307/1170287>
- **[abedi2000]** Abedi, Lord et al. (2000). Impact of Accommodation Strategies on English Language Learners' Test Performance. Educational Measurement: Issues and Practice. <https://doi.org/10.1111/j.1745-3992.2000.tb00034.x>
- **[amendum2018]** Amendum, Conradi & Hiebert (2017). Does Text Complexity Matter in the Elementary Grades? A Research Synthesis of Text Difficulty and Elementary Students’ Reading Fluency and Comprehension. Educational Psychology Review. <https://doi.org/10.1007/s10648-017-9398-2>
- **[oreilly2007]** O’Reilly & McNamara (2007). Reversing the Reverse Cohesion Effect: Good Texts Can Be Better for Strategic, High-Knowledge Readers. Discourse Processes. <https://doi.org/10.1080/01638530709336895>

### Lesson length and coherence (14)

- **[rey2012]** Rey (2012). A review of research and a meta-analysis of the seductive detail effect. Educational Research Review. <https://doi.org/10.1016/j.edurev.2012.05.003>
- **[sundararajan2020]** Sundararajan & Adesope (2020). Keep it Coherent: A Meta-Analysis of the Seductive Details Effect. Educational Psychology Review. <https://doi.org/10.1007/s10648-020-09522-4>
- **[mayer2001]** Mayer, Heiser & Lonn (2001). Cognitive constraints on multimedia learning: When presenting more material results in less understanding.. Journal of Educational Psychology. <https://doi.org/10.1037/0022-0663.93.1.187>
- **[rey2019]** Rey, Beege et al. (2019). A Meta-analysis of the Segmenting Effect. Educational Psychology Review. <https://doi.org/10.1007/s10648-018-9456-4>
- **[noetel2022]** Noetel, Griffith et al. (2021). Multimedia Design for Learning: An Overview of Reviews With Meta-Meta-Analysis. Review of Educational Research. <https://doi.org/10.3102/00346543211052329>
- **[guo2014]** Guo, Kim & Rubin (2014). How video production affects student engagement: an empirical study of MOOC videos. Proceedings of the first ACM conference on Learning @ scale conference. <https://doi.org/10.1145/2556325.2566239>
- **[brame2016]** Brame (2016). Effective Educational Videos: Principles and Guidelines for Maximizing Student Learning from Video Content. CBE—Life Sciences Education. <https://doi.org/10.1187/cbe.16-03-0125>
- **[mayer2003]** Mayer & Moreno (2003). Nine Ways to Reduce Cognitive Load in Multimedia Learning. Educational Psychologist. <https://doi.org/10.1207/s15326985ep3801_6>
- **[harp1998]** Harp & Mayer (1998). How seductive details do their damage: A theory of cognitive interest in science learning.. Journal of Educational Psychology. <https://doi.org/10.1037/0022-0663.90.3.414>
- **[mayer1996]** Mayer, Bove et al. (1996). When less is more: Meaningful learning from visual and verbal summaries of science textbook lessons.. Journal of Educational Psychology. <https://doi.org/10.1037/0022-0663.88.1.64>
- **[ginns2005]** Ginns (2005). Meta-analysis of the modality effect. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2005.07.001>
- **[ginns2006]** Ginns (2006). Integrating information: A meta-analysis of the spatial contiguity and temporal contiguity effects. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2006.10.001>
- **[adesope2012]** Adesope & Nesbit (2011). Verbal redundancy in multimedia learning environments: A meta-analysis.. Journal of Educational Psychology. <https://doi.org/10.1037/a0026147>
- **[mayer2005coherence]** Mayer & Jackson (2005). The Case for Coherence in Scientific Explanations: Quantitative Details Can Hurt Qualitative Understanding.. Journal of Experimental Psychology: Applied. <https://doi.org/10.1037/1076-898x.11.1.13>

### Interest, context personalization, rewards (16)

- **[walkington2013]** Walkington (2013). Using adaptive learning technologies to personalize instruction to student interests: The impact of relevant contexts on performance and learning outcomes.. Journal of Educational Psychology. <https://doi.org/10.1037/a0031882>
- **[bernacki2018]** Bernacki & Walkington (2018). The role of situational interest in personalized learning.. Journal of Educational Psychology. <https://doi.org/10.1037/edu0000250>
- **[cordova1996]** Cordova & Lepper (1996). Intrinsic motivation and the process of learning: Beneficial effects of contextualization, personalization, and choice.. Journal of Educational Psychology. <https://doi.org/10.1037/0022-0663.88.4.715>
- **[hidi2006]** Hidi & Renninger (2006). The Four-Phase Model of Interest Development. Educational Psychologist. <https://doi.org/10.1207/s15326985ep4102_4>
- **[hulleman2009]** Hulleman & Harackiewicz (2009). Promoting Interest and Performance in High School Science Classes. Science. <https://doi.org/10.1126/science.1177067>
- **[hulleman2010]** Hulleman, Godes et al. (2010). Enhancing interest and performance with a utility value intervention.. Journal of Educational Psychology. <https://doi.org/10.1037/a0019506>
- **[hogheim2015]** Høgheim & Reber (2015). Supporting interest of middle school students in mathematics through context personalization and example choice. Contemporary Educational Psychology. <https://doi.org/10.1016/j.cedpsych.2015.03.006>
- **[reber2018]** Reber, Canning & Harackiewicz (2018). Personalized Education to Increase Interest. Current Directions in Psychological Science. <https://doi.org/10.1177/0963721418793140>
- **[ku2002]** Ku & Sullivan (2002). Student performance and attitudes using personalized mathematics instruction. Educational Technology Research and Development. <https://doi.org/10.1007/bf02504959>
- **[anand1987]** Anand & Ross (1987). Using computer-assisted instruction to personalize arithmetic materials for elementary school children.. Journal of Educational Psychology. <https://doi.org/10.1037/0022-0663.79.1.72>
- **[harackiewicz2016]** Harackiewicz, Canning et al. (2016). Closing achievement gaps with a utility-value intervention: Disentangling race and social class.. Journal of Personality and Social Psychology. <https://doi.org/10.1037/pspp0000075>
- **[walkington2014]** Walkington & Bernacki (2017). Personalization of Instruction: Design Dimensions and Implications for Cognition. The Journal of Experimental Education. <https://doi.org/10.1080/00220973.2017.1380590>
- **[deci1999]** Deci, Koestner & Ryan (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation.. Psychological Bulletin. <https://doi.org/10.1037/0033-2909.125.6.627>
- **[sailer2020]** Sailer & Homner (2019). The Gamification of Learning: a Meta-analysis. Educational Psychology Review. <https://doi.org/10.1007/s10648-019-09498-w>
- **[patall2008]** Patall, Cooper & Robinson (2008). The effects of choice on intrinsic motivation and related outcomes: A meta-analysis of research findings.. Psychological Bulletin. <https://doi.org/10.1037/0033-2909.134.2.270>
- **[rotgans2011]** Rotgans & Schmidt (2011). Situational interest and academic achievement in the active-learning classroom. Learning and Instruction. <https://doi.org/10.1016/j.learninstruc.2009.11.001>

### Challenge and difficulty (9)

- **[wilson2019]** Wilson, Shenhav et al. (2019). The Eighty Five Percent Rule for optimal learning. Nature Communications. <https://doi.org/10.1038/s41467-019-12552-4>
- **[jansen2013]** Jansen et al. (2013). The influence of experiencing success in math on math anxiety, perceived math competence, and math performance. Learning and Individual Differences. <https://doi.org/10.1016/j.lindif.2012.12.014>
- **[eglington2020]** Eglington & Pavlik (2020). Optimizing practice scheduling requires quantitative tracking of individual item performance. npj Science of Learning. <https://doi.org/10.1038/s41539-020-00074-4>
- **[metcalfe2005]** Metcalfe & Kornell (2005). A Region of Proximal Learning model of study time allocation. Journal of Memory and Language. <https://doi.org/10.1016/j.jml.2004.12.001>
- **[lomas2013]** Lomas, Patel et al. (2013). Optimizing challenge in an educational game using large-scale design experiments. Proceedings of the SIGCHI Conference on Human Factors in Computing Systems. <https://doi.org/10.1145/2470654.2470668>
- **[lomas2017]** Lomas, Koedinger et al. (2017). Is Difficulty Overrated?: The Effects of Choice, Novelty and Suspense on Intrinsic Motivation in Educational Games. Proceedings of the 2017 CHI Conference on Human Factors in Computing Systems. <https://doi.org/10.1145/3025453.3025638>
- **[kidd2012]** Kidd, Piantadosi & Aslin (2012). The Goldilocks Effect: Human Infants Allocate Attention to Visual Sequences That Are Neither Too Simple Nor Too Complex. PLoS ONE. <https://doi.org/10.1371/journal.pone.0036399>
- **[oudeyer2016]** Oudeyer, Gottlieb & Lopes (2016). Intrinsic motivation, curiosity, and learning. Progress in Brain Research. <https://doi.org/10.1016/bs.pbr.2016.05.005>
- **[clement2015]** Benjamin, Roy et al. (2015). Multi-Armed Bandits for Intelligent Tutoring Systems. Journal of Educational Data Mining. <https://doi.org/10.5281/zenodo.3554667>
- **[eccles2002]** Eccles & Wigfield (2002). Motivational Beliefs, Values, and Goals. Annual Review of Psychology. <https://doi.org/10.1146/annurev.psych.53.100901.135153>
- **[hamari2016]** Hamari, Shernoff et al. (2016). Challenging games help students learn: An empirical study on engagement, flow and immersion in game-based learning. Computers in Human Behavior. <https://doi.org/10.1016/j.chb.2015.07.045>

### Attention, fatigue, position and streak effects (11)

- **[bradbury2016]** Bradbury (2016). Attention span during lectures: 8 seconds, 10 minutes, or more?. Advances in Physiology Education. <https://doi.org/10.1152/advan.00109.2016>
- **[wilson2007]** Wilson & Korn (2007). Attention during Lectures: Beyond Ten Minutes. Teaching of Psychology. <https://doi.org/10.1080/00986280701291291>
- **[risko2012]** Risko, Anderson et al. (2011). Everyday Attention: Variation in Mind Wandering and Memory in a Lecture. Applied Cognitive Psychology. <https://doi.org/10.1002/acp.1814>
- **[szpunar2013]** Szpunar, Khan & Schacter (2013). Interpolated memory tests reduce mind wandering and improve learning of online lectures. Proceedings of the National Academy of Sciences. <https://doi.org/10.1073/pnas.1221764110>
- **[warm2008]** Warm, Parasuraman & Matthews (2008). Vigilance Requires Hard Mental Work and Is Stressful. Human Factors: The Journal of the Human Factors and Ergonomics Society. <https://doi.org/10.1518/001872008x312152>
- **[sievertsen2016]** Sievertsen, Gino & Piovesan (2016). Cognitive fatigue influences students’ performance on standardized tests. Proceedings of the National Academy of Sciences. <https://doi.org/10.1073/pnas.1516947113>
- **[hagger2016]** Hagger, Chatzisarantis et al. (2016). A Multilab Preregistered Replication of the Ego-Depletion Effect. Perspectives on Psychological Science. <https://doi.org/10.1177/1745691616652873>
- **[gilovich1985]** Gilovich, Vallone & Tversky (1985). The hot hand in basketball: On the misperception of random sequences. Cognitive Psychology. <https://doi.org/10.1016/0010-0285(85)90010-6>
- **[miller2018]** Miller & Sanjurjo (2018). Surprised by the Hot Hand Fallacy? A Truth in the Law of Small Numbers. Econometrica. <https://doi.org/10.3982/ecta14943>
- **[ariga2011]** Ariga & Lleras (2011). Brief and rare mental “breaks” keep you focused: Deactivation and reactivation of task goals preempt vigilance decrements. Cognition. <https://doi.org/10.1016/j.cognition.2010.12.007>
- **[smallwood2015]** Smallwood & Schooler (2015). The Science of Mind Wandering: Empirically Navigating the Stream of Consciousness. Annual Review of Psychology. <https://doi.org/10.1146/annurev-psych-010814-015331>

### Recap, generation, self-explanation (12)

- **[slamecka1978]** Slamecka & Graf (1978). The generation effect: Delineation of a phenomenon.. Journal of Experimental Psychology: Human Learning and Memory. <https://doi.org/10.1037/0278-7393.4.6.592>
- **[bertsch2007]** Bertsch, Pesta et al. (2007). The generation effect: A meta-analytic review. Memory & Cognition. <https://doi.org/10.3758/bf03193441>
- **[mccurdy2020]** McCurdy, Viechtbauer et al. (2020). Theories of the generation effect and the impact of generation constraint: A meta-analytic review. Psychonomic Bulletin & Review. <https://doi.org/10.3758/s13423-020-01762-3>
- **[callender2009]** Callender & McDaniel (2009). The limited benefits of rereading educational texts. Contemporary Educational Psychology. <https://doi.org/10.1016/j.cedpsych.2008.07.001>
- **[pressley1987]** Pressley, Symons et al. (1988). Elaborative interrogation facilitates acquisition of confusing facts.. Journal of Educational Psychology. <https://doi.org/10.1037//0022-0663.80.3.268>
- **[fiorella2016]** Fiorella & Mayer (2015). Eight Ways to Promote Generative Learning. Educational Psychology Review. <https://doi.org/10.1007/s10648-015-9348-9>
- **[chi1989]** Chi (1989). Self-explanations: How students study and use examples in learning to solve problems. Cognitive Science. <https://doi.org/10.1016/0364-0213(89)90002-5>
- **[bisra2018]** Bisra, Liu et al. (2018). Inducing Self-Explanation: a Meta-Analysis. Educational Psychology Review. <https://doi.org/10.1007/s10648-018-9434-x>
- **[hartley1976]** Hartley, Bartlett & Branthwaite (1980). Underlining Can Make a Difference—Sometimes. The Journal of Educational Research. <https://doi.org/10.1080/00220671.1980.10885239>
- **[kintsch1988]** Kintsch (1988). The role of knowledge in discourse comprehension: A construction-integration model.. Psychological Review. <https://doi.org/10.1037/0033-295x.95.2.163>
- **[brod2021]** Brod (2020). Generative Learning: Which Strategies for What Age?. Educational Psychology Review. <https://doi.org/10.1007/s10648-020-09571-9>
- **[fiorella2023]** Fiorella (2023). Making Sense of Generative Learning. Educational Psychology Review. <https://doi.org/10.1007/s10648-023-09769-7>

### Perfectionism (3)

- **[stoeber2006]** Stoeber & Otto (2006). Positive Conceptions of Perfectionism: Approaches, Evidence, Challenges. Personality and Social Psychology Review. <https://doi.org/10.1207/s15327957pspr1004_2>
- **[curran2019]** Curran & Hill (2019). Perfectionism is increasing over time: A meta-analysis of birth cohort differences from 1989 to 2016.. Psychological Bulletin. <https://doi.org/10.1037/bul0000138>
- **[madigan2019]** Madigan (2019). A Meta-Analysis of Perfectionism and Academic Achievement. Educational Psychology Review. <https://doi.org/10.1007/s10648-019-09484-2>

### Statistics: shrinkage, intervals, experiments, replication, simulation (42)

- **[efron1975]** Efron & Morris (1975). Data Analysis Using Stein's Estimator and its Generalizations. Journal of the American Statistical Association. <https://doi.org/10.1080/01621459.1975.10479864>
- **[efron1977]** Efron & Morris (1977). Stein's Paradox in Statistics. Scientific American. <https://doi.org/10.1038/scientificamerican0577-119>
- **[morris1983]** Morris (1983). Parametric Empirical Bayes Inference: Theory and Applications. Journal of the American Statistical Association. <https://doi.org/10.1080/01621459.1983.10477920>
- **[gelman2006]** Gelman (2006). Prior distributions for variance parameters in hierarchical models (comment on article by Browne and Draper). Bayesian Analysis. <https://doi.org/10.1214/06-ba117a>
- **[dersimonian1986]** DerSimonian & Laird (1986). Meta-analysis in clinical trials. Controlled Clinical Trials. <https://doi.org/10.1016/0197-2456(86)90046-2>
- **[haldane1956]** Haldane (1956). The estimation and significance of the logarithm of a ratio of frequencies. Annals of Human Genetics. <https://doi.org/10.1111/j.1469-1809.1955.tb01285.x> (title-level only)
- **[anscombe1956]** Anscombe (1956). On estimating binomial response relations. Biometrika. <https://doi.org/10.1093/biomet/43.3-4.461> (title-level only)
- **[gart1967]** Gart & Zweifel (1967). On the bias of various estimators of the logit and its variance with application to quantal bioassay. Biometrika. <https://doi.org/10.1093/biomet/54.1-2.181>
- **[newton2004]** Newton et al. (2004). Detecting differential gene expression with a semiparametric hierarchical mixture method. Biostatistics. <https://doi.org/10.1093/biostatistics/5.2.155>
- **[efron2008]** Efron (2008). Microarrays, Empirical Bayes and the Two-Groups Model. Statistical Science. <https://doi.org/10.1214/07-STS236>
- **[casella1985]** Casella (1985). An Introduction to Empirical Bayes Data Analysis. The American Statistician. <https://doi.org/10.1080/00031305.1985.10479400>
- **[agresti1998]** Agresti & Coull (1998). Approximate Is Better than "Exact" for Interval Estimation of Binomial Proportions. The American Statistician. <https://doi.org/10.2307/2685469>
- **[wilson1927]** Wilson (1927). Probable Inference, the Law of Succession, and Statistical Inference. Journal of the American Statistical Association. <https://doi.org/10.1080/01621459.1927.10502953>
- **[brown2001]** Brown, Cai & DasGupta (2001). Interval Estimation for a Binomial Proportion. Statistical Science. <https://doi.org/10.1214/ss/1009213286>
- **[spiegelhalter2005]** Spiegelhalter (2004). Funnel plots for comparing institutional performance. Statistics in Medicine. <https://doi.org/10.1002/sim.1970>
- **[gelman2012]** Gelman, Hill & Yajima (2012). Why We (Usually) Don't Have to Worry About Multiple Comparisons. Journal of Research on Educational Effectiveness. <https://doi.org/10.1080/19345747.2011.618213>
- **[benjamini1995]** Benjamini & Hochberg (1995). Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing. Journal of the Royal Statistical Society Series B: Statistical Methodology. <https://doi.org/10.1111/j.2517-6161.1995.tb02031.x>
- **[ioannidis2005]** Ioannidis (2005). Why Most Published Research Findings Are False. PLoS Medicine. <https://doi.org/10.1371/journal.pmed.0020124>
- **[gneiting2007]** Gneiting & Raftery (2007). Strictly Proper Scoring Rules, Prediction, and Estimation. Journal of the American Statistical Association. <https://doi.org/10.1198/016214506000001437>
- **[brier1950]** BRIER (1950). VERIFICATION OF FORECASTS EXPRESSED IN TERMS OF PROBABILITY. Monthly Weather Review. <https://doi.org/10.1175/1520-0493(1950)078<0001:vofeit>2.0.co;2>
- **[dawid1982]** Dawid (1982). The Well-Calibrated Bayesian. Journal of the American Statistical Association. <https://doi.org/10.1080/01621459.1982.10477856>
- **[talts2018]** Talts, Betancourt et al. (2018). Validating Bayesian Inference Algorithms with Simulation-Based Calibration. arXiv (Cornell University). <https://doi.org/10.48550/arxiv.1804.06788>
- **[cook2006]** Cook, Gelman & Rubin (2006). Validation of Software for Bayesian Models Using Posterior Quantiles. Journal of Computational and Graphical Statistics. <https://doi.org/10.1198/106186006x136976>
- **[morris2019]** Morris, White & Crowther (2019). Using simulation studies to evaluate statistical methods. Statistics in Medicine. <https://doi.org/10.1002/sim.8086>
- **[burton2006]** Burton, Altman et al. (2006). The design of simulation studies in medical statistics. Statistics in Medicine. <https://doi.org/10.1002/sim.2673>
- **[gama2014]** Gama, Žliobaitė et al. (2014). A survey on concept drift adaptation. ACM Computing Surveys. <https://doi.org/10.1145/2523813>
- **[koren2009]** Koren (2009). Collaborative filtering with temporal dynamics. Proceedings of the 15th ACM SIGKDD international conference on Knowledge discovery and data mining. <https://doi.org/10.1145/1557019.1557072>
- **[higgins2002]** Higgins & Thompson (2002). Quantifying heterogeneity in a meta‐analysis. Statistics in Medicine. <https://doi.org/10.1002/sim.1186>
- **[raudenbush1985]** Raudenbush & Bryk (1985). Empirical Bayes Meta-Analysis. Journal of Educational Statistics. <https://doi.org/10.2307/1164836>
- **[kass1995]** Kass & Raftery (1995). Bayes Factors. Journal of the American Statistical Association. <https://doi.org/10.1080/01621459.1995.10476572>
- **[efron2010]** Efron (2010). Large-Scale Inference: Empirical Bayes Methods for Estimation, Testing, and Prediction. Cambridge University Press. <https://doi.org/10.1017/cbo9780511761362>
- **[firth1993]** FIRTH (1993). Bias reduction of maximum likelihood estimates. Biometrika. <https://doi.org/10.1093/biomet/80.1.27>
- **[murphy2003]** Murphy (2003). Optimal Dynamic Treatment Regimes. Journal of the Royal Statistical Society Series B: Statistical Methodology. <https://doi.org/10.1111/1467-9868.00389>
- **[collins2007]** Collins, Murphy & Strecher (2007). The Multiphase Optimization Strategy (MOST) and the Sequential Multiple Assignment Randomized Trial (SMART). American Journal of Preventive Medicine. <https://doi.org/10.1016/j.amepre.2007.01.022>
- **[deng2013]** Deng, Xu et al. (2013). Improving the sensitivity of online controlled experiments by utilizing pre-experiment data. Proceedings of the sixth ACM international conference on Web search and data mining. <https://doi.org/10.1145/2433396.2433413>
- **[kohavi2009]** Kohavi, Longbotham et al. (2008). Controlled experiments on the web: survey and practical guide. Data Mining and Knowledge Discovery. <https://doi.org/10.1007/s10618-008-0114-1>
- **[liu2014bandit]** Liu, Mandel et al. (2014). Trading Off Scientific Knowledge and User Learning with Multi-Armed Bandits. <https://openalex.org/W2549443287>
- **[hill2008]** Hill, Bloom et al. (2008). Empirical Benchmarks for Interpreting Effect Sizes in Research. Child Development Perspectives. <https://doi.org/10.1111/j.1750-8606.2008.00061.x>
- **[kraft2020]** Kraft (2020). Interpreting Effect Sizes of Education Interventions. Educational Researcher. <https://doi.org/10.3102/0013189x20912798>
- **[lortieforgues2019]** Lortie-Forgues & Inglis (2019). Rigorous Large-Scale Educational RCTs Are Often Uninformative: Should We Be Concerned?. Educational Researcher. <https://doi.org/10.3102/0013189x19832850>
- **[cheung2016]** Cheung & Slavin (2016). How Methodological Features Affect Effect Sizes in Education. Educational Researcher. <https://doi.org/10.3102/0013189x16656615>
- **[osc2015]** Open Science Collaboration (2015). Estimating the reproducibility of psychological science. Science. <https://doi.org/10.1126/science.aac4716>
- **[makel2014]** Makel & Plucker (2014). Facts Are More Important Than Novelty: Replication in the Education Sciences. Educational Researcher. <https://doi.org/10.3102/0013189x14545513>
- **[simmons2011]** Simmons, Nelson & Simonsohn (2011). False-Positive Psychology: Undisclosed Flexibility in Data Collection and Analysis Allows Presenting Anything as Significant. Psychological Science. <https://doi.org/10.1177/0956797611417632>
- **[button2013]** Button, Ioannidis et al. (2013). Power failure: why small sample size undermines the reliability of neuroscience. Nature Reviews Neuroscience. <https://doi.org/10.1038/nrn3475>
- **[sterne2001]** Sterne & Egger (2001). Funnel plots for detecting bias in meta-analysis. Journal of Clinical Epidemiology. <https://doi.org/10.1016/s0895-4356(01)00377-8>
- **[schein2002]** Schein, Popescul et al. (2002). Methods and metrics for cold-start recommendations. Proceedings of the 25th annual international ACM SIGIR conference on Research and development in information retrieval. <https://doi.org/10.1145/564376.564421>

### Measurement: validity and reliability (15)

- **[cronbach1955]** Cronbach & Meehl (1955). Construct validity in psychological tests.. Psychological Bulletin. <https://doi.org/10.1037/h0040957>
- **[messick1995]** Messick (1995). Validity of psychological assessment: Validation of inferences from persons' responses and performances as scientific inquiry into score meaning.. American Psychologist. <https://doi.org/10.1037/0003-066x.50.9.741>
- **[spearman1904]** Spearman (1904). The Proof and Measurement of Association between Two Things. The American Journal of Psychology. <https://doi.org/10.2307/1412159>
- **[koo2016]** Koo & Li (2016). A Guideline of Selecting and Reporting Intraclass Correlation Coefficients for Reliability Research. Journal of Chiropractic Medicine. <https://doi.org/10.1016/j.jcm.2016.02.012>
- **[cicchetti1994]** Cicchetti (1994). Guidelines, criteria, and rules of thumb for evaluating normed and standardized assessment instruments in psychology. Psychological Assessment. <https://doi.org/10.1037/1040-3590.6.4.284>
- **[lance2006]** Lance, Butts & Michels (2006). The Sources of Four Commonly Reported Cutoff Criteria. Organizational Research Methods. <https://doi.org/10.1177/1094428105284919>
- **[brown1910]** Brown (1910). Some experimental results in the correlation of mental abilities. British Journal of Psychology. <https://doi.org/10.1111/j.2044-8295.1910.tb00207.x> (title-level only)
- **[spearman1910]** Spearman (1910). Correlation calculated from faulty data. British Journal of Psychology. <https://doi.org/10.1111/j.2044-8295.1910.tb00206.x> (title-level only)
- **[hedge2018]** Hedge, Powell & Sumner (2017). The reliability paradox: Why robust cognitive tasks do not produce reliable individual differences. Behavior Research Methods. <https://doi.org/10.3758/s13428-017-0935-1>
- **[dang2020]** Dang, King & Inzlicht (2020). Why Are Self-Report and Behavioral Measures Weakly Correlated?. Trends in Cognitive Sciences. <https://doi.org/10.1016/j.tics.2020.01.007>
- **[enkavi2019]** Enkavi, Eisenberg et al. (2019). Large-scale analysis of test–retest reliabilities of self-regulation measures. Proceedings of the National Academy of Sciences. <https://doi.org/10.1073/pnas.1818430116>
- **[kane2013]** Kane (2013). Validating the Interpretations and Uses of Test Scores. Journal of Educational Measurement. <https://doi.org/10.1111/jedm.12000>
- **[rouder2019]** Rouder & Haaf (2019). A psychometrics of individual differences in experimental tasks. Psychonomic Bulletin & Review. <https://doi.org/10.3758/s13423-018-1558-y>
- **[parsons2019]** Parsons, Kruijt & Fox (2019). Psychological Science Needs a Standard Practice of Reporting the Reliability of Cognitive-Behavioral Measurements. Advances in Methods and Practices in Psychological Science. <https://doi.org/10.1177/2515245919879695>
- **[eisenberg2019]** Eisenberg, Bissett et al. (2019). Uncovering the structure of self-regulation through data-driven ontology discovery. Nature Communications. <https://doi.org/10.1038/s41467-019-10301-1>
- **[podsakoff2003]** Podsakoff, MacKenzie et al. (2003). Common method biases in behavioral research: A critical review of the literature and recommended remedies.. Journal of Applied Psychology. <https://doi.org/10.1037/0021-9010.88.5.879>
- **[nisbett1977]** Nisbett & Wilson (1977). Telling more than we can know: Verbal reports on mental processes.. Psychological Review. <https://doi.org/10.1037/0033-295x.84.3.231>
- **[schmidt1996]** Schmidt & Hunter (1996). Measurement error in psychological research: Lessons from 26 research scenarios.. Psychological Methods. <https://doi.org/10.1037/1082-989x.1.2.199>
- **[veenman2006]** Veenman, Van Hout-Wolters & Afflerbach (2006). Metacognition and learning: conceptual and methodological considerations. Metacognition and Learning. <https://doi.org/10.1007/s11409-006-6893-0>
- **[craig2020]** Craig, Hale et al. (2020). Evaluating metacognitive self-reports: systematic reviews of the value of self-report in metacognitive research. Metacognition and Learning. <https://doi.org/10.1007/s11409-020-09222-y>

### Language models: instruction following, judging, AI tutoring (21)

- **[liu2024lost]** Liu, Lin et al. (2024). Lost in the Middle: How Language Models Use Long Contexts. Transactions of the Association for Computational Linguistics. <https://doi.org/10.1162/tacl_a_00638>
- **[jiang2024follow]** Jiang, Wang et al. (2024). FollowBench: A Multi-level Fine-grained Constraints Following Benchmark for Large Language Models. Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers). <https://doi.org/10.18653/v1/2024.acl-long.257>
- **[levy2024]** Levy, Jacoby & Goldberg (2024). Same Task, More Tokens: the Impact of Input Length on the Reasoning Performance of Large Language Models. Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers). <https://doi.org/10.18653/v1/2024.acl-long.818>
- **[zhou2023ifeval]** Zhou, Lu et al. (2023). Instruction-Following Evaluation for Large Language Models. arXiv (Cornell University). <https://doi.org/10.48550/arxiv.2311.07911>
- **[qin2024]** Qin, Song et al. (2024). InFoBench: Evaluating Instruction Following Ability in Large Language Models. Findings of the Association for Computational Linguistics ACL 2024. <https://doi.org/10.18653/v1/2024.findings-acl.772>
- **[jaroslawicz2025]** Jaroslawicz, Whiting et al. (2025). How Many Instructions Can LLMs Follow at Once?. arXiv. <https://arxiv.org/abs/2507.11538>
- **[shi2023]** Shi, Chen et al. (2023). Large Language Models Can Be Easily Distracted by Irrelevant Context. arXiv (Cornell University). <https://doi.org/10.48550/arxiv.2302.00093>
- **[sharma2024]** Sharma, Tong et al. (2023). Towards Understanding Sycophancy in Language Models. arXiv. <https://arxiv.org/abs/2310.13548>
- **[zheng2023]** Zheng, Chiang et al. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. Advances in Neural Information Processing Systems 36. <https://doi.org/10.52202/075280-2020>
- **[perez2023]** Perez, Ringer et al. (2023). Discovering Language Model Behaviors with Model-Written Evaluations. Findings of the Association for Computational Linguistics: ACL 2023. <https://doi.org/10.18653/v1/2023.findings-acl.847>
- **[pardos2024]** Pardos & Bhandari (2024). ChatGPT-generated help produces learning gains equivalent to human tutor-authored help on mathematics skills. PLOS ONE. <https://doi.org/10.1371/journal.pone.0304013>
- **[kestin2025]** Kestin, Miller et al. (2025). AI tutoring outperforms in-class active learning: an RCT introducing a novel research-based design in an authentic educational setting. Scientific Reports. <https://doi.org/10.1038/s41598-025-97652-6>
- **[bastani2025]** Bastani, Bastani et al. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. Proceedings of the National Academy of Sciences. <https://doi.org/10.1073/pnas.2422633122>
- **[wang2024copilot]** Wang, Ribeiro et al. (2024). Tutor CoPilot: A Human-AI Approach for Scaling Real-Time Expertise. Springer Science and Business Media LLC. <https://doi.org/10.21203/rs.3.rs-5363154/v1>
- **[tversky1974]** Tversky & Kahneman (1974). Judgment under Uncertainty: Heuristics and Biases: Biases in judgments reveal some heuristics of thinking under uncertainty.. Science. <https://doi.org/10.1126/science.185.4157.1124>
- **[nickerson1998]** Nickerson (1998). Confirmation Bias: A Ubiquitous Phenomenon in Many Guises. Review of General Psychology. <https://doi.org/10.1037/1089-2680.2.2.175>
- **[wang2023fair]** Wang, Li et al. (2024). Large Language Models are not Fair Evaluators. Proceedings of the 62nd Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers). <https://doi.org/10.18653/v1/2024.acl-long.511>
- **[kasneci2023]** Kasneci, Sessler et al. (2023). ChatGPT for good? On opportunities and challenges of large language models for education. Learning and Individual Differences. <https://doi.org/10.1016/j.lindif.2023.102274>
- **[lehmann2025]** Lehmann, Cornelius & Sting (2024). AI Meets the Classroom: When Does ChatGPT Harm Learning?. Elsevier BV. <https://doi.org/10.2139/ssrn.4941259>
- **[henkel2024]** Henkel, Horne-Robinson et al. (2024). Effective and Scalable Math Support: Experimental Evidence on the Impact of an AI-Math Tutor in Ghana. Communications in Computer and Information Science. <https://doi.org/10.1007/978-3-031-64315-6_34>
- **[jurenka2024]** Jurenka, Kunesch et al. (2024). Towards Responsible Development of Generative AI for Education: An Evaluation-Driven Approach. arXiv (Cornell University). <https://doi.org/10.48550/arxiv.2407.12687>

### Privacy, ethics and fairness (13)

- **[slade2013]** Slade & Prinsloo (2013). Learning Analytics: Ethical Issues and Dilemmas. American Behavioral Scientist. <https://doi.org/10.1177/0002764213479366>
- **[drachsler2016]** Drachsler & Greller (2016). Privacy and analytics: it's a DELICATE issue a checklist for trusted learning analytics. Proceedings of the Sixth International Conference on Learning Analytics & Knowledge - LAK '16. <https://doi.org/10.1145/2883851.2883893>
- **[pardo2014]** Pardo & Siemens (2014). Ethical and privacy principles for learning analytics. British Journal of Educational Technology. <https://doi.org/10.1111/bjet.12152>
- **[dwork2014]** Dwork & Roth (2013). The Algorithmic Foundations of Differential Privacy. now Publishers Inc. <https://doi.org/10.1561/9781601988195>
- **[baker2022]** Baker & Hawn (2022). Algorithmic Bias in Education. International Journal of Artificial Intelligence in Education. <https://doi.org/10.1007/s40593-021-00285-9>
- **[gardner2019]** Gardner, Brooks & Baker (2019). Evaluating the Fairness of Predictive Student Models Through Slicing Analysis. Proceedings of the 9th International Conference on Learning Analytics & Knowledge. <https://doi.org/10.1145/3303772.3303791>
- **[prinsloo2017]** Prinsloo & Slade (2017). An elephant in the learning analytics room: the obligation to act. Proceedings of the Seventh International Learning Analytics & Knowledge Conference. <https://doi.org/10.1145/3027385.3027406>
- **[kizilcec2022]** Kizilcec & Lee (2022). Algorithmic fairness in education. The Ethics of Artificial Intelligence in Education. <https://doi.org/10.4324/9780429329067-10>
- **[sweeney2002]** SWEENEY (2002). k-ANONYMITY: A MODEL FOR PROTECTING PRIVACY. International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems. <https://doi.org/10.1142/s0218488502001648>
- **[narayanan2008]** Narayanan & Shmatikov (2008). Robust De-anonymization of Large Sparse Datasets. 2008 IEEE Symposium on Security and Privacy (sp 2008). <https://doi.org/10.1109/sp.2008.33>
- **[zuboff2015]** Zuboff (2015). Big other: Surveillance Capitalism and the Prospects of an Information Civilization. Journal of Information Technology. <https://doi.org/10.1057/jit.2015.5>
- **[livingstone2019]** Livingstone, Stoilova & Nandagiri (2019). Children's data and privacy online: growing up in a digital age: an evidence review. London School of Economics and Political Science Research Online (London School of Economics and Political Science). <https://openalex.org/W2965426950>
- **[ifenthaler2016]** Ifenthaler & Schumacher (2016). Student perceptions of privacy principles for learning analytics. Educational Technology Research and Development. <https://doi.org/10.1007/s11423-016-9477-y>

### Tutoring and the coach (4)

- **[graesser2004]** Graesser, Lu et al. (2004). AutoTutor: A tutor with dialogue in natural language. Behavior Research Methods, Instruments, & Computers. <https://doi.org/10.3758/bf03195563>
- **[nye2014]** Nye, Graesser & Hu (2014). AutoTutor and Family: A Review of 17 Years of Natural Language Tutoring. International Journal of Artificial Intelligence in Education. <https://doi.org/10.1007/s40593-014-0029-5>
- **[lepper1993]** Lepper, Woolverton et al. (1993). Motivational techniques of expert human tutors: Lessons for the design of computer-based tutors.. <https://openalex.org/W1694248630>
- **[cohen1982]** Cohen, Kulik & Kulik (1982). Educational Outcomes of Tutoring: A Meta-analysis of Findings. American Educational Research Journal. <https://doi.org/10.3102/00028312019002237>

### Not verified, and not used for any claim (28)

- [delaney2010] Delaney (2010). Spacing and the testing effects: A deeply critical, lengthy, and at times discursive review of the literature. (mismatch)
- [sclar2024] Sclar (2023). Quantifying language models' sensitivity to spurious features in prompt design or: How I learned to start worrying about prompt formatting. (mismatch)
- [aleven2017] Aleven (2017). Instruction based on adaptive learning technologies. (other_year)
- [rawson2013] Rawson (2013). Retrieval practice and repeated testing: When is enough enough? The utility of successive relearning. (mismatch)
- [richey2015] Richey (2015). More confusion and frustration, better learning: The impact of erroneous examples. (other_year)
- [koedinger2009] Koedinger (2009). Exploring the assistance dilemma in experiments with cognitive tutors. (other_year)
- [chan2018] Chan (2018). The testing effect in the classroom? Low-stakes quizzing and retrieval practice in learning. (mismatch: dropped)
- [newell1981] Newell (1981). Mechanisms of skill acquisition and the law of practice. (verified: dropped)
- [bloom1968] Bloom (1968). Learning for mastery. (mismatch: dropped)
- [aleven2016] Aleven (2016). Instruction based on adaptive learning technologies. (verified: dropped)
- [koedinger1997] Koedinger (1997). Intelligent tutoring goes to school in the big city. (verified: dropped)
- [doebler2012] Doebler (2012). Shrinkage of the Elo rating? Not entirely, it seems. (mismatch: dropped)
- [mathews2008] Mathews (2008). Do students who see more concepts in an ITS learn more?. (mismatch: dropped)
- [hattie2009] Hattie (2009). Visible learning: A synthesis of over 800 meta-analyses relating to achievement. (verified: dropped)
- [chi2008] Chi (2008). Three types of conceptual change: Belief revision, mental model transformation, and categorical shift. (mismatch: dropped)
- [dweck2006] Dweck (2006). Mindset: The new psychology of success. (mismatch: dropped)
- [beck2002] Beck (2002). Bringing words to life: Robust vocabulary instruction. (verified: dropped)
- [lin2022] Lin (2022). The effects of context personalization on learning: A meta-analysis. (mismatch: dropped)
- [schiefele1992] Schiefele (1992). Interest as a predictor of academic achievement: A meta-analysis of research. (mismatch: dropped)
- [csikszentmihalyi1990] Csikszentmihalyi (1990). Flow: The psychology of optimal experience. (only a book review record found)
- [rawson2005] Rawson (2005). The benefits of rereading in skill and knowledge acquisition? Investigating the role of rereading in text comprehension. (mismatch: dropped)
- [williams2016] Williams (2016). The MOOClet framework: Improving online education through experimentation and personalization of modules. (verified: dropped)
- [kelley1927] Kelley (1927). Interpretation of educational measurements. (only a book review record found)
- [lord1968] Lord (1968). Statistical theories of mental test scores. (only a book review record found)
- [schmeiser2006] Brennan (2006). Educational measurement. (mismatch: dropped)
- [kraft2024] Kraft (2024). Scaling up high-dosage tutoring is harder than you might think. (mismatch: dropped)
- [hattan2023] Hattan (2023). Prior knowledge activation in design and in practice. (verified: dropped)
- [schuetze2014] Schuetze (2014). Distributed practice: Effects of an old and a new concept in mathematics education. (mismatch: dropped)
