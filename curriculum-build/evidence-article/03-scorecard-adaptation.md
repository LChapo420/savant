# 03. Scorecard and adaptation: the evidence for each mechanism

Part of the evidence article (curriculum-build/evidence-article/BRIEF.md). This section covers:
- the learner scorecard (`services/scorecard/*`) and its insertion contract (`contract.js`);
- how the scorecard drives teaching: `ADAPTIVE_TEACHING` and the directives (`services/adaptation.js`, `services/learner.js` sessionParams);
- the effort monitor (`ADAPT_EFFORT`, `services/effort-monitor.js`);
- the coach guards (`services/ai.js`, `services/assist.js`);
- the style quiz, the about-you survey and onboarding;
- owner base vs optimized (`config/owner.js`, `services/owner-skips.js`): product behaviour, no evidence needed;
- grading leniency (accents, number forms) and the grading injection check;
- objective items;
- the young-learner oral mode (`YOUNG_ORAL`);
- the lesson sandbox (`LESSON_SANDBOX`).

The forgetting curve, review timing and the daily review are section 02. Mechanisms 28 (typed recall) and 39 (the 1.2 s rule) overlap section 02's mechanisms 35 and 28; the verdicts agree.

**Totals.**
- **61 mechanisms.** 59 need evidence and all 59 have 3 or more distinct sources. The other 2 are owner product rules.
- Verdicts for the 59: **strong 9, moderate 25, mixed 7, design choice 18.**
- **157 distinct sources cited:**
  - 89 reused from `scorecard-sources.json`, 1 (eglington2020) from `retention-sources.json`, and 2 regulations (gdpr-art5-1c, coppa-312.2) from section 05's sources file;
  - **65 new**, all verified today (58 by DOI, 7 official standards), listed in `03-scorecard-adaptation-sources.json`.
- **The 10 weak rules:** each was researched again. Decisions are in the table below; 9 code or text proposals follow from them.

**How sources were handled.**
- **Reused sources** are already DOI-verified. Their quotes come from the claim check (`SCORECARD-CLAIM-CHECK-2026-10-25.md`), where the quote was found in the abstract.
- **Reused sources with a quote fetched today:** the claim check had none for these, so the abstract was fetched today and the quote checked against it:
  - chi2001, vanlehn2011, kulik2016, ma2014, graesser2004, nye2014, kass1995 (Crossref or Europe PMC);
  - dmello2012 (ERIC);
  - eglington2020 (Europe PMC).
- **New sources:**
  - each Crossref record was matched on title, first author and year;
  - abstracts came from Crossref, Europe PMC, OpenAlex or ERIC (Semantic Scholar was rate-limited all day);
  - a script checked that every quote is in the stored abstract and under 25 words.
- **Title-level only:** 11 new sources had no abstract any service could reach. They are marked, and no claim rests on one of them alone.

**Design choices, stated plainly.** No study sets any of these numbers:
- edge 20, MIN_CONF 30, GATE_Z 2, the MIN_EVIDENCE counts, SIDE_P 0.98, MEAN_Z 0.88, VALIDITY 0.9;
- the 6 and 8 directive caps;
- the knob sizes (+/-0.05 to 0.25), the 0.15 base shares and the 0.05 to 0.35 clamps, item counts 4 to 18;
- the 1.2 s rapid line, the 0.3 x expected-time line, 2 reserves, the 5% / 95% / 30-answer rush flag;
- coached weight 0.25, XP x 0.6, attestation weight 0.25;
- questionnaire weight 0.6, the 0.75 cap on observed weight;
- the split-half 0.6 cut-off.

## The 10 weak rules: what the new research says

| # | Rule (where) | New evidence | Decision |
|---|---|---|---|
| 1 | Typed answers for a rushing learner (`adaptation.js:103`, `contract.js:66`, `learner.js:300`) | greving2018 found short answer helped and multiple choice did not. smith2014 found no advantage, kang2007 found it depends on feedback, and little2012 shows good MC works. No study tests format against rushing. The effort monitor (mechanism 41, wise2006cbt, wise2019) already deals with rushers directly. | **Remove** the `typed: true` knob, or run it only as an experiment arm (P1) |
| 2 | At most 6 directives (`translate.js:29`; coach 8, `contract.js:73`) | he2024cello: LLMs "often ignore semantic constraints". liu2024lost, levy2024 and shi2023 show that length, position and irrelevant text cost accuracy. No paper tests a cap near 6. | **Keep** as a design choice. Make the coach cap match (6), or test both caps on the app's own writer (P9) |
| 3 | The 85% challenge target (challenge_appetite; `sessions.js:1484-1502`) | wilson2019 is a machine-learning result. The human studies point to high success: jansen2013 (children: a higher pre-set success rate meant more practice and bigger gains), eglington2020 (practice at 0.86-0.94 predicted recall beat 0.40 and 0.98), lomas2013 (easier was more engaging). None supports a harder extension for learners who say they like a challenge. | **Soften** the high side: stretch +0.1 to +0.05, stretch clamp 0.35 to 0.25 (P2). Cite the human studies, not wilson2019 alone |
| 4 | Brevity (`adaptation.js:97`, `contract.js:60`) | mayer1996: summaries alone did as well as or better than the full text. sundararajan2020 and harp1998: seductive details hurt. rey2019: segmenting helps. kirschner2013: learners do not know best, so a stated wish for "full detail" is weak grounds for longer text. | **Keep** the high side. **Soften** the low side: lengthen only for an objective that is new to this learner (P3) |
| 5a | Split-half r >= 0.6 (`SCORECARD-EVIDENCE-REPORT.md:545`) | koo2016: below 0.5 is poor and 0.5-0.75 moderate, judged on the 95% CI. cicchetti1994 and lance2006: cut-offs are rules of thumb, often misattributed. Spearman-Brown correction (brown1910, spearman1910 title-level; parsons2019) is needed for a split-half. | **Soften and specify**: Spearman-Brown corrected, averaged over random splits, point >= 0.6 **and** lower 95% bound >= 0.5 (P7) |
| 5b | Posterior >= 0.98 (`translate.js:59`) | newton2004 and efron2008: thresholding posterior probabilities defines the expected false-discovery share, so a calibrated P >= 0.98 means at most about 2% of issued directives are on the wrong side. kass1995: posterior odds (here 49:1). berry2006: Bayesian thresholds on accruing data. | **Keep**. The basis is now principled, not only the simulation. Its calibration still needs the section 11 real-data check |
| 6 | Logit counting variance (`index.js:529-541`) | The code is the Haldane-Anscombe empirical logit, log((k+0.5)/(n-k+0.5)), with its standard variance 1/(k+0.5)+1/(n-k+0.5): haldane1956, anscombe1956 (title-level), gart1967 (small-sample bias of these estimators), warton2011 (logit over arcsine). | **Keep**. Now **strong**. Fix the report: it is a textbook estimator, not just a simulation choice |
| 7 | Hint dependency / help seeking (`stats.js:218-223`) | aleven2016help: better help use did not raise learning. koedinger2007: the assistance dilemma is open. baker2004: heavy hint use is partly gaming. Up-front worked examples are better supported (renkl2014, salden2010). | **Soften** the hint_dependency text to a worked example plus a try-first prompt (P5). **Keep** help_seeking |
| 8 | Low self-efficacy (`stats.js:264-266`) | usher2008 and byarswinston2017 (k = 61): mastery experience is the strongest source. bandura1981: proximal subgoals raised mastery and self-efficacy. schunk1983: ability feedback on progress raised both. talsma2018: performance drives later self-efficacy, which supports "make step one achievable". | **Keep**, and strengthen the text (P6). The measure ("sure" taps on right answers) stays a proxy; validity 0.8 is already applied |
| 9 | Misconception persistence (`stats.js:351-353`) | The fix is strong: schroeder2023 (g = 0.41), tippett2010, kendeou2018. The premise is mixed: shtulman2012 says naive theories survive for years; payne1990 says mal-rules are "very unstable" within a student; smith1994. | **Keep**. Contrasting the error helps whoever gets it. Read the stat as "this tag recurs", not as a trait |
| 10 | Frustration, persistence, momentum | Frustration: dmello2012 (unresolved frustration leads to boredom); camachomorles2021 found frustration's link to performance near zero (rho = -0.02), anger -0.35. Persistence: bandura1981, botelho2019, ventura2013ce. Momentum: mace1988 and lee2005 are about compliance, not learning; aamodt1992 (easy-first ordering, d = .11). | Frustration: **keep** the gentle ramp (low risk), but the "rapid after a miss" proxy is unvalidated. Persistence: **keep**, moderate. Momentum: **keep off** (it never fires); design choice |

## Mechanisms at a glance

| # | Mechanism | Verdict | Sources |
|---|---|---|---|
| 1 | Score gate before a population: edge 20, confidence 30, 2 SE | moderate | 4 |
| 2 | Minimum evidence of each kind | design choice | 4 |
| 3 | Standing gate: P(side) >= 0.98 and |z| >= 0.88 | design choice | 5 |
| 4 | Behaviour is not trait: posterior widened at validity 0.9 | design choice | 4 |
| 5 | Memory-kind and secondary rates never steer | design choice | 3 |
| 6 | Empirical-Bayes standing among learners | strong | 4 |
| 7 | Logit counting variance for rates | strong | 5 |
| 8 | Split-half r >= 0.6 real-data check | design choice | 5 |
| 9 | Rank by impact x distance x certainty; cap 6 (coach 8) | design choice | 5 |
| 10 | Combined instructions for conflicting pairs | design choice | 3 |
| 11 | Hand-written directive text; no learner numbers in model text | moderate | 4 |
| 12 | One versioned contract; fails to the new-learner default; never a skip | design choice | 3 |
| 13 | Style quiz: 20 forced choices between concrete behaviours | moderate | 3 |
| 14 | The questionnaire is a weak prior with no measured weight | strong | 4 |
| 15 | Stated preferences blended into session settings, never fully overruled | mixed | 4 |
| 16 | About-you survey; interest examples only when interests are named | moderate | 3 |
| 17 | Guidance from the learner's record on the objective | strong | 4 |
| 18 | A scorecard reading cannot take worked examples away from an unseen objective | moderate | 3 |
| 19 | Length knob (brevity, pace, attention) | mixed | 5 |
| 20 | Items per block: multipliers, 4 to 18, compressed at most 6 | design choice | 3 |
| 21 | Stretch and support shares | mixed | 4 |
| 22 | challenge_appetite directive text | mixed | 4 |
| 23 | Frustration low: gentler ramp, more support | mixed | 4 |
| 24 | Frustration measured as rapid answers right after a miss | design choice | 4 |
| 25 | Persistence low: payoff early, short sections, 20% fewer items | moderate | 4 |
| 26 | Persistence measured as stopping after 3+ misses in a row | moderate | 4 |
| 27 | Momentum: an early easy win (never fires yet) | design choice | 4 |
| 28 | Rushing learner gets typed answers | mixed | 5 |
| 29 | Rush directive text: key sentence alone, one "slow down" warning | moderate | 3 |
| 30 | Hint dependency and help seeking directives | mixed | 5 |
| 31 | Low self-efficacy: an achievable first step, named as achieved | moderate | 5 |
| 32 | Misconception persistence: state, refute, replace | strong | 6 |
| 33 | Interest context knob | moderate | 4 |
| 34 | Recap knob (consolidation need) | strong | 4 |
| 35 | Practice ends on proof: compress or extend | strong | 4 |
| 36 | Blocked while new, interleaved once proven | moderate | 3 |
| 37 | Proof check with questions written for the objective | moderate | 3 |
| 38 | Session summary at 85% / 60%; difficulty_delta computed but unused | design choice | 3 |
| 39 | Answers under 1.2 s are not evidence | moderate | 4 |
| 40 | Relative rapid line: under 0.3 x expected time | design choice | 4 |
| 41 | "Too fast to count" on checkpoints and the Final | moderate | 4 |
| 42 | Rush flag and the one-line slow-down note | moderate | 4 |
| 43 | Coach never gives the answer first; leak guard | moderate | 4 |
| 44 | Coach turn rules: one question, smallest next step | moderate | 4 |
| 45 | Coach stays on the question on screen | design choice | 3 |
| 46 | Coached right answers weigh 0.25; XP x 0.6 | design choice | 4 |
| 47 | No assist on checkpoints and essays | moderate | 3 |
| 48 | Form leniency: case, accents, $, punctuation, "x =" | moderate | 4 |
| 49 | Number forms: 0.5 = 1/2, mixed numbers, strict thousands commas | moderate | 4 |
| 50 | Strict on exactly the form the prompt asks for | moderate | 4 |
| 51 | Spanish: optional subject pronoun, el/él and tu/tú kept apart | design choice | 3 |
| 52 | Grading injection check and fenced judge input | moderate | 4 |
| 53 | Objective-item code checks | strong | 5 |
| 54 | Two blind judges from different model families agree on the key | design choice | 3 |
| 55 | Objective items served first; aligned right answers needed for proof | moderate | 3 |
| 56 | Young oral mode: spoken checkpoints, tap check decides | moderate | 4 |
| 57 | A grown-up's "I heard it" weighs 0.25 and never proves alone | design choice | 3 |
| 58 | The recording stays on the device | moderate | 3 |
| 59 | Lessons in a sandboxed frame with a strict CSP | strong | 4 |
| 60 | Owner base vs optimized | product | none needed |
| 61 | Owner skips | product | none needed |

## Mechanisms

Source lines: `[id]` DOI or URL — "quote" — population. Quotes for reused sources come from the claim check unless marked *(fetched today)*.

### A. The scorecard gate and the insertion contract

#### 1. Score gate before a population exists — `services/scorecard/translate.js:25-33, 194-209`
- **What it does:** with no population yet, a stat steers only when all four hold:
  - its 0-100 score is at least 20 from 50;
  - its confidence is at least 30;
  - it is 2 standard errors from 50;
  - the trait reading still puts it on that side with P >= 0.98.
- **Evidence:**
  - [gelman2012] 10.1080/19345747.2011.618213 — "the problem of multiple comparisons can disappear entirely when viewed from a hierarchical Bayesian perspective" — education research methods.
  - [efron1975] 10.1080/01621459.1975.10479864 — "This estimator is reviewed briefly in an empirical Bayes context." — statistics.
  - [benjamini1995] 10.1111/j.2517-6161.1995.tb02031.x — "It calls for controlling the expected proportion of falsely rejected hypotheses — the false discovery rate." — statistics.
  - [parsons2019] 10.1177/2515245919879695 — "subpar reliability has severe implications for measures’ validity and interpretation" — cognitive measures.
- **Verdict:** moderate. The principle (shrink noisy readings, guard against many comparisons) is strong; the numbers are chosen.
- **Code vs evidence:** matches. The 2-SE rule is a frequentist stand-in, used only until the population gate (mechanism 3) takes over.

#### 2. Minimum evidence of each kind — `translate.js:34-49, 95-106`
- **What it does:** a stat needs enough data of its own kind before it may steer. Examples: 8 weighted updates, 30 rate chances (10 once calibrated), 15 contrast answers, 20 memory tests, 150 "reach" answers.
- **Evidence:**
  - [hedge2018] 10.3758/s13428-017-0935-1 — "Experimental effects become well established - and thus those tasks become popular - when between-subject variability is low." — cognitive tasks.
  - [rouder2019] 10.3758/s13423-018-1558-y — "correlations among tasks that seemingly have processes in common are often low" — cognitive tasks.
  - [parsons2019] (above).
  - [enkavi2019] 10.1073/pnas.1818430116 — "Accurate characterization of individual differences requires measuremen[t reliability]" — adults, self-regulation tasks.
- **Verdict:** design choice. The literature says thin behavioural data is unreliable for individuals; the counts come from the simulation.
- **Code vs evidence:** matches the direction.

#### 3. Standing gate: P(on that side) >= 0.98 and |z| >= 0.88 — `translate.js:50-60, 186-193` (weak rule 5b)
- **What it does:** once there is a population, a directive needs both:
  - a posterior probability of at least 0.98 that the learner is on that side of the typical learner;
  - a best estimate in about the top or bottom fifth.
- **Evidence:**
  - [newton2004] 10.1093/biostatistics/5.2.155 — "Gene-specific posterior probabilities of differential expression form the basis of statistical inference; they define short gene lists and false discovery rates" — many simultaneous decisions (genomics).
  - [efron2008] 10.1214/07-STS236 — "with particular attention focused on Benjamini and Hochberg’s False Discovery Rate method" — the empirical-Bayes two-groups model.
  - [kass1995] 10.1080/01621459.1995.10476572 — "the Bayes factor, which is the posterior odds of the null hypothesis when the prior probability on the null is one-half" *(fetched today)* — statistics.
  - [berry2006] 10.1038/nrd1927 — "Accumulating results can be assessed at any time, including continually, with the possibility of modifying the design of the trial" — Bayesian adaptive trials.
  - [gelman2012] (above).
- **Verdict:** design choice, now with a principled basis. Taking only decisions whose posterior is at least 0.98 bounds the expected share of wrong-side directives at about 2%, provided the posterior is calibrated (newton2004; efron2008). 0.98 is posterior odds of 49:1.
- **Code vs evidence:** matches. The open question is calibration on real learners: the section 11 check (95% of directives still on the same side 30 levels later) stays required.

#### 4. Behaviour is not trait: the posterior widened at validity 0.9 — `translate.js:61-71`
- **What it does:** reads the measured behaviour as if it correlated 0.9 with the trait behind it (0.8 for self-efficacy). This widens the posterior before the gate.
- **Evidence:**
  - [schmidt1996] 10.1037/1082-989x.1.2.199 — "This article examines 26 real-world case studies and explicates them on the basis of the principles of reliability theory" — measurement.
  - [messick1995] 10.1037/0003-066x.50.9.741 — "The new unified concept of validity interrelates these issues as fundamental aspects of a more comprehensive theory of construct validity" — measurement.
  - [kane2013] 10.1111/jedm.12000 — "To validate an interpretation or use of test scores is to evaluate the plausibility of the claims based on the scores." — measurement.
  - [hedge2018] (above).
- **Verdict:** design choice. The direction is right (attenuation; validity is about the use); the 0.9 is set on the simulation.
- **Code vs evidence:** matches.

#### 5. Memory-kind and secondary rates never steer — `translate.js:72-78, 171-179`
- **What it does:** two kinds of stat are shown but never acted on:
  - decay, retention and retrieval;
  - rates read inverted as a second stat.
- **Evidence:**
  - [kane2013] (above).
  - [messick1995] (above).
  - [parsons2019] (above).
- **Verdict:** design choice. A measure is acted on only once the use is validated; the simulation found these posteriors over-confident.
- **Code vs evidence:** matches. `SCORECARD_MEMORY_STEER=on` exists only for re-measuring.

#### 6. Empirical-Bayes standing among learners — `services/scorecard/index.js:180-215, 529-560`
- **What it does:** each learner's reading is shrunk toward the population, by its own noise against the population's true spread (method of moments).
- **Evidence:**
  - [efron1975] (above).
  - [morris1983] 10.1080/01621459.1983.10477920 — "reviews the state of multiparameter shrinkage estimators with emphasis on the empirical Bayes viewpoint" — statistics.
  - [raudenbush1985] 10.2307/1164836 — "This strategy enables the analyst to (a) estimate the variance of the effect size parameters" — education meta-analysis.
  - [dersimonian1986] 10.1016/0197-2456(86)90046-2 — "We discuss a random effects approach to combining evidence from a series of experiments comparing two treatments." — clinical trials.
- **Verdict:** strong.
- **Code vs evidence:** matches.

#### 7. Logit counting variance for rates — `index.js:529-541` (weak rule 6)
- **What it does:** a rate of k events in n chances becomes the logit of (k + 0.5)/(n + 1), with variance 1/(k + 0.5) + 1/(n - k + 0.5). That logit is exactly log((k+0.5)/(n-k+0.5)).
- **Evidence:**
  - [haldane1956] 10.1111/j.1469-1809.1955.tb01285.x — title-level only — the +0.5 correction to the log ratio of frequencies.
  - [anscombe1956] 10.1093/biomet/43.3-4.461 — title-level only — the same correction for binomial responses.
  - [gart1967] 10.1093/biomet/54.1-2.181 — "The bias of several logit estimators and their corresponding variance estimators is investigated in small samples." — statistics.
  - [warton2011] 10.1890/10-0340.1 — "The logit transformation is proposed as an alternative approach to address these issues." — analysis of proportions.
  - [dersimonian1986] (above): normal random-effects pooling of such log-odds estimates.
- **Verdict:** strong. This is the standard empirical logit and its standard variance estimate, pooled the way meta-analysis pools log-odds.
- **Code vs evidence:** matches. The report (section 7) says the choice "rests on the simulation"; it should say it is the Haldane-Anscombe estimator, with gart1967's small-sample bias caveat. That is why MIN_EVIDENCE keeps 10+ chances.

#### 8. Split-half r >= 0.6 real-data check — `curriculum-build/SCORECARD-EVIDENCE-REPORT.md:545` (weak rule 5a)
- **What it does:** this is a planned check, not code yet. Each learner's evidence is split by odd and even days, the two standings are correlated, and a stat that issues directives must reach r >= 0.6.
- **Evidence:**
  - [koo2016] 10.1016/j.jcm.2016.02.012 — "values less than 0.5, between 0.5 and 0.75, between 0.75 and 0.9, and greater than 0.90 are indicative of poor, moderate, good, and excellent" — reliability guideline (judged on the 95% CI).
  - [cicchetti1994] 10.1037/1040-3590.6.4.284 — "Criteria, guidelines, and simple rules of thumb are provided to assist the clinician faced with the challenge of choosing an appropriate test instrument" — assessment guideline.
  - [lance2006] 10.1177/1094428105284919 — "trace four widely cited and reported cutoff criteria to their (alleged) original sources" — methods review.
  - [parsons2019] (above).
  - [brown1910] 10.1111/j.2044-8295.1910.tb00207.x and [spearman1910] 10.1111/j.2044-8295.1910.tb00206.x — title-level only — the Spearman-Brown step-up for split halves.
- **Verdict:** design choice.
- **Code vs evidence:** as written, it leaves out two things:
  - the Spearman-Brown correction: a raw half-data r understates full-data reliability;
  - the uncertainty: koo2016 grades on the confidence interval, not the point estimate.

  0.6 corrected is "moderate", which is reasonable for low-stakes, reversible directives. See P7.

#### 9. Rank by impact x distance x certainty; cap at 6 (coach 8) — `translate.js:27-29, 214-260`; `contract.js:71-73, 206` (weak rule 2)
- **What it does:**
  - ranks the confident directives so the most important comes first;
  - sends at most 6 to the lesson writer and 8 to the coach;
  - adds a certainty note (`translate.js:269-288`).
- **Evidence:**
  - [liu2024lost] 10.1162/tacl_a_00638 — "significantly degrades when models must access relevant information in the middle of long contexts" — LLMs.
  - [levy2024] 10.18653/v1/2024.acl-long.818 — "a notable degradation in LLMs' reasoning performance at much shorter input lengths than their technical maximum" — LLMs.
  - [shi2023] 10.48550/arxiv.2302.00093 — "model performance is dramatically decreased when irrelevant information is included" — LLMs (preprint).
  - [he2024cello] 10.1609/aaai.v38i16.29777 — "LLMs often ignore semantic constraints from task descriptions, generate incorrect formats, violate length or sample count constraints" — LLM benchmark.
  - [jaroslawicz2025] (no DOI) — "even the best frontier models only achieve 68% accuracy at the max density of 500 instructions" — LLM benchmark (preprint).
- **Verdict:** design choice. Fewer, front-loaded instructions are the right direction; no study tests about 6.
- **Code vs evidence:** matches the direction. The coach's 8 has no stated reason to differ from 6 (P9).

#### 10. Combined instructions for pairs that pull apart — `translate.js:108-141, 233-256`
- **What it does:** 14 hand-written texts replace two directives that would conflict (for example, show every step + be brief). A combined text ranks with the stronger part's priority.
- **Evidence:**
  - [he2024cello] (above).
  - [jiang2024follow] 10.18653/v1/2024.acl-long.257 — "a Multi-level mechanism that incrementally adds a single constraint to the initial instruction at each increased level" — LLM benchmark (design only).
  - [qin2024] 10.18653/v1/2024.findings-acl.772 — "particularly in complex instruction-following" — LLM benchmark.
- **Verdict:** design choice. Multi-constraint prompts are where models fail; resolving a conflict before the model sees it removes one kind of complexity. No study tests this exact move.
- **Code vs evidence:** matches.

#### 11. Hand-written directive text; no learner numbers in model text — `services/scorecard/stats.js:24-28`; `contract.js:32-40, 75-82`
- **What it does:**
  - the model gets fixed sentences only, never scores, the evidence log, survey answers, the name or the email;
  - prompt lines go only to providers allowed learner data.
- **Evidence:**
  - [gdpr-art5-1c] https://gdpr-info.eu/art-5-gdpr/ — "adequate, relevant and limited to what is necessary in relation to the purposes for which they are processed" — EU regulation (from section 05).
  - [slade2013] 10.1177/0002764213479366 — "The field of learning analytics has the potential to enable higher education institutions to increase their understanding of their students’ learning needs" — ethics of learning analytics.
  - [drachsler2016] 10.1145/2883851.2883893 — "Privacy and analytics: it's a DELICATE issue a checklist for trusted learning analytics" — LA privacy checklist.
  - [dwork2014] 10.1561/9781601988195 — "the need increases for a robust, meaningful, and mathematically rigorous definition of privacy" — privacy theory.
- **Verdict:** moderate (data minimisation is a legal standard; the learning effect of fixed wording is untested).
- **Code vs evidence:** matches.

#### 12. One versioned contract; it fails to the new-learner default; never a skip — `contract.js:1-47, 180-232`
- **What it does:**
  - every consumer reads one object, so they cannot disagree;
  - on any error, the status is `fallback`: no directives and the default curve;
  - there is no field that could mark content as known: coverage stays on bank evidence.
- **Evidence:**
  - [saltzer1975] 10.1109/PROC.1975.9939 — "Section I describes desired functions, design principles, and examples of elementary protection and authentication mechanisms." — security design (fail-safe defaults is one of its principles).
  - [kulik1990] 10.2307/1170612 — "mastery learning programs have positive effects on the examination performance of students" — 108 evaluations.
  - [bloom1984] 10.2307/1175554 — "Mastery Learning. Students learn the subject matter in a class with about 30 students per teacher." — classroom studies.
- **Verdict:** design choice. Failing safe, and advancing only on demonstrated mastery, are both well founded; the contract applies them.
- **Code vs evidence:** matches. But `learner.effective()` reads the scorecard outside the contract (mechanism 15).

### B. Style quiz, survey and onboarding

#### 13. Style quiz: 20 forced choices between concrete behaviours — `public/js/style-quiz.js:1-3`; `services/scorecard/index.js:1408-1434`
- **What it does:** each item asks which of two concrete behaviours the learner does, instead of a 1-5 self-rating. Skipping is allowed.
- **Evidence:**
  - [brown2011fc] 10.1177/0013164410375112 — "Multidimensional forced-choice formats can significantly reduce the impact of numerous response biases typically associated with rating scales." — psychometrics.
  - [cao2019] 10.1037/apl0000414 — "FC scales were consistently found to be more faking-resistant when constructed with statements balanced in social desirability" — meta-analysis.
  - [nisbett1977] 10.1037/0033-295x.84.3.231 — "there may be little or no direct introspective access to higher order cognitive processes" — review.
- **Verdict:** moderate.
- **Code vs evidence:** mostly matches. brown2011fc also warns that forced choices scored classically "produce ipsative data". Here each choice is read as one dimension's 0-1 value, which is classical scoring. That is acceptable only because the quiz is a weak prior (mechanism 14), but see mechanism 15.

#### 14. The questionnaire is a weak prior with no measured weight — `index.js:1408-1434`; `contract.js:33-34`
- **What it does:** quiz answers nudge the shown score (weight 0.6) but add no measured mass, so on its own the quiz can never make a directive confident.
- **Evidence:**
  - [pashler2008] 10.1111/j.1539-6053.2009.01038.x — "the instructional method that proves most effective for students with one learning style is not the most effective method for students with a different learning style" (the test meshing fails) — review.
  - [rogowsky2015] 10.1037/a0037478 — "failed to statistically support the meshing hypothesis either for verbal comprehension aptitude or learning based on mode of instruction" — adults.
  - [kirschner2013] 10.1080/00461520.2013.804395 — "The three legends can be seen as variations on one central theme, namely, that it is the learner who knows best" — review.
  - [nisbett1977] (above).
- **Verdict:** strong.
- **Code vs evidence:** matches in the scorecard.

#### 15. Stated preferences blended into session settings, never fully overruled — `services/learner.js:233-257, 274-306`
- **What it does:** `effective()` sets these from the quiz's stated value, blended with observed behaviour:
  - item count, stretch and support shares;
  - typed-answer preference, feedback timing, explanation depth.

  The observed weight is capped at 0.75, so "a stated preference is never fully overruled". Then, at scorecard confidence >= 30, the measured score is blended in. That is outside the calibrated gate.
- **Evidence:**
  - [pashler2008] (above).
  - [rogowsky2015] (above).
  - [kirschner2013] (above).
  - [nisbett1977] (above).
- **Verdict:** mixed. The evidence says self-reported preference is a poor basis for tailoring. This code keeps at least 25% stated weight forever, and lets an ungated reading move structure.
- **Code vs evidence:** **gap**. The contract's rule ("nothing the questionnaire nudged steers") holds for directives, but not for these session parameters. See P4.

#### 16. About-you survey; interest examples only when interests are named — `services/learner.js:96-150`; `routes/profile.js:107-125`; `translate.js:213`; `contract.js:180-232` (`hasInterests`)
- **What it does:**
  - five free-text boxes (interests, studying, hobbies, sports, notes), all optional;
  - the interest directive is dropped when no interest was named;
  - the answers are never sent as numbers.
- **Evidence:**
  - [walkington2013] 10.1037/a0031882 — "students in the personalization condition solved problems faster and more accurately within the modified unit" — 145 algebra students.
  - [bernacki2018] 10.1037/edu0000250 — "High school students in the personalization condition reported greater triggered situational interest in experimental units" — high school maths.
  - [cordova1996] 10.1037/0022-0663.88.4.715 — "examined the effects on the learning process of 3 complementary strategies—contextualization, personalization, and provision of choices" — elementary pupils.
- **Verdict:** moderate.
- **Code vs evidence:** matches. Interests are asked, not inferred, and are used only when given.

### C. How the scorecard drives teaching (ADAPTIVE_TEACHING, default on)

`adaptation.js:47-51`: `on` applies, `shadow` computes and records, `off` computes nothing. The owner account is never adapted (mechanism 60).

#### 17. Guidance from the learner's own record on the objective — `services/adaptation.js:445-458`
- **What it does:**
  - **worked examples first:** no answers yet, belief under 0.5 (`ADAPT_NOVICE_BELOW`), or lapsed;
  - **faded examples:** belief in between;
  - **problems first:** proven or retained (and the teaching text is one step shorter).
- **Evidence:**
  - [kalyuga2003] 10.1207/s15326985ep3801_4 — "Instructional techniques that are highly effective with inexperienced learners can lose their effectiveness and even have negative consequences when used with more experienced learners." — review.
  - [tetzlaff2025] 10.1016/j.learninstruc.2025.102142 — "Low prior knowledge learners learn better from high-assistance instruction (d = 0.505)." — meta-analysis, 60 studies, 5,924 participants.
  - [renkl2014] 10.1111/cogs.12086 — "Learning from examples is a very effective means of initial cognitive skill acquisition." — review.
  - [salden2010] 10.1007/s11251-009-9107-8 — "Both experiments provide evidence of improved learning results from adaptive fading of worked examples" — tutored problem solving.
- **Verdict:** strong.
- **Code vs evidence:** matches. tetzlaff2025 says the evidence is less clear for younger students and languages: worth a holdout check there.

#### 18. A scorecard reading cannot take worked examples away from an unseen objective — `adaptation.js:95-96, 466-476`
- **What it does:** prior_knowledge and scaffolding_fade move guidance one step either way. A move toward less guidance is refused on an objective with no answers yet, unless the move comes from prior_knowledge itself.
- **Evidence:**
  - [tetzlaff2025] (above).
  - [kalyuga2007] 10.1007/s10648-007-9054-3 — "This paper reviews recent empirical findings associated with the expertise reversal effect, their interpretation within cognitive load theory, relations to ATI studies" — review.
  - [salden2010] (above).
- **Verdict:** moderate.
- **Code vs evidence:** matches. Expertise is specific to the task, so the objective's own record outranks a general trait.

#### 19. Length knob — `adaptation.js:97-98, 102, 477, 485-486, 582-586`; `contract.js:60` (weak rule 4)
- **What it does:**
  - **shorter teaching:** brevity high, fast pace, short attention runway, problems-first;
  - **fuller teaching:** brevity low ("wants full detail").
- **Evidence:**
  - [mayer1996] 10.1037/0022-0663.88.1.64 — "recalled these steps and solved transfer problems as well as or better than students who received the full text along with the summary or the full text alone" — college students, science lessons.
  - [sundararajan2020] 10.1007/s10648-020-09522-4 — "learners exposed to interesting and irrelevant information, known as seductive details, do not perform as much as those who learned without seductive details" — meta-analysis.
  - [harp1998] 10.1037/0022-0663.90.3.414 — "students who read expository passages with seductive details... recalled significantly fewer main ideas" — college students.
  - [rey2019] 10.1007/s10648-018-9456-4 — "reveals a significant segmenting effect with small to medium effects for retention and transfer performance" — meta-analysis.
  - [kirschner2013] (above).
- **Verdict:** mixed:
  - the high side (concise, nothing required dropped) is supported for learners in general;
  - the low side (longer because the learner asked) rests on a stated preference, which kirschner2013 and mechanism 14 say is weak grounds.
- **Code vs evidence:** partly. The low side can lengthen text for a learner who already knows the objective, which expertise reversal argues against. See P3.

#### 20. Items per block: multipliers, 4 to 18, compressed at most 6 — `adaptation.js:71-73, 98-102, 526-529`
- **What it does:** confident sides scale the item count:
  - pace high +20%, low -20%;
  - persistence low -20%;
  - attention runway low -25%, high +15%.

  The count is clamped to 4-18, and a proven objective gets at most `MIN_ITEMS + 2` = 6.
- **Evidence:**
  - [rey2019] (above).
  - [kulik1990] (above).
  - [bandura1981] 10.1037/0022-3514.41.3.586 — "Under proximal subgoals, children progressed rapidly in self-directed learning, achieved substantial mastery of mathematical operations" — children with arithmetic deficits.
- **Verdict:** design choice. Shorter units for those who stop early, and less practice once mastered, both follow the evidence; the percentages do not come from it.
- **Code vs evidence:** matches the direction.

#### 21. Stretch and support shares — `adaptation.js:99-100, 544-545`; `learner.js:284-299`; `sessions.js:143-160` (weak rule 3)
- **What it does:**
  - the base stretch share is 0.1 + 0.2 x the quiz's challenge appetite; support is 0.1 or 0.2;
  - challenge_appetite high adds 0.1 stretch; low moves 0.05 from stretch to support;
  - frustration low adds 0.1 support and takes 0.05 stretch;
  - stretch is clamped to 0.05-0.35 and support to 0-0.35;
  - stretch items run +1.5 difficulty, support items -1.5.
- **Evidence:**
  - [jansen2013] 10.1016/j.lindif.2012.12.014 — "the higher the pre-set success rate, the more problems were attempted, and the larger the improvement in math performance" — 207 children, grades 3-6, six weeks.
  - [eglington2020] 10.1038/s41539-020-00074-4 — "with up to 40% more items recalled in conditions where practice was scheduled optimally according to the model of practice" *(fetched today)* — adults, vocabulary; optimal predicted recall 0.86-0.94.
  - [lomas2013] 10.1145/2470654.2470668 — "subjects were more engaged and played longer when the game was easier, which seems to contradict the generality of the Inverted-U Hypothesis" — large online game experiments.
  - [wilson2019] 10.1038/s41467-019-12552-4 — "the optimal error rate for training is around 15.87% or, conversely, that the optimal training accuracy is about 85%" — machine learners, not people.
- **Verdict:** mixed. The human studies favour a high success rate. Extra stretch for a self-declared challenge seeker is not supported, and a stretch share of 0.35 at +1.5 difficulty pushes success down.
- **Code vs evidence:** partly. Support for low appetite and low frustration matches. The high-side +0.1 and the 0.35 ceiling go further than the evidence. See P2.

#### 22. challenge_appetite directive text — `services/scorecard/stats.js:158-160` (weak rule 3)
- **What it does:**
  - **high:** "a genuinely challenging worked example ... a harder 'try this' extension";
  - **low:** "comfortable difficulty ... build confidence before anything hard".
- **Evidence:**
  - [jansen2013] (above).
  - [lomas2013] (above).
  - [lomas2017] 10.1145/3025453.3025638 — "even moderate difficulty can reduce player engagement" — online game experiments.
  - [wilson2019] (above).
- **Verdict:** mixed. The low side is supported (jansen2013). The high side is a stated preference with no human evidence that it helps learning.
- **Code vs evidence:** partly. An *optional* extension at the end, after the core, is low-risk. Making the worked example itself hard is not supported. P2 softens the wording.

#### 23. Frustration low: a gentler ramp and more support — `stats.js:215-217`; `adaptation.js:100`; combined text `translate.js:129-130` (weak rule 10)
- **What it does:**
  - the text says: "ramp difficulty gently and never leave a gap the learner has to bridge alone";
  - the structure gets +0.1 support and -0.05 stretch;
  - with high challenge appetite, the combined text asks for a hard case in small signposted steps.
- **Evidence:**
  - [dmello2012] 10.1016/j.learninstruc.2011.10.001 — "failure to restore equilibrium as well as obstacles that block goals trigger frustration, which, if unresolved, will eventually lead to boredom" *(fetched today, ERIC)* — college students, 32-35 min computer tutoring.
  - [camachomorles2021] 10.1007/s10648-020-09585-3 — "For frustration, the relation with performance was near zero ([rho] = - 0.02)." — meta-analysis; frustration 9 samples, N = 1,418 (anger rho = -0.35).
  - [pekrun2006] 10.1007/s10648-006-9029-9 — "appraisals of control and values are central to the arousal of achievement emotions, including activity-related emotions such as enjoyment, frustration, and boredom" — theory review.
  - [loderer2020] 10.1016/j.learninstruc.2018.08.002 — title-level only (search snippet: 186 studies of emotions in technology-based learning) — meta-analysis.
- **Verdict:** mixed:
  - control-value theory and dmello2012 support restoring control when a learner is stuck;
  - camachomorles2021 finds frustration itself barely related to performance.
- **Code vs evidence:** acceptable. The action (more support items, smaller steps) is low risk and fits the support literature. Do not claim frustration harms learning; say unresolved impasses do.

#### 24. Frustration measured as rapid answers right after a miss — `services/scorecard/signals.js:62-63, 215, 266-270`
- **What it does:** a contrast: the learner's rapid-answer rate just after a miss, against their own rapid rate otherwise. It needs a population before it can steer.
- **Evidence:**
  - [wise2017] 10.1111/emip.12165 — "very short response time—termed rapid guessing—has been shown to indicate disengaged test taking" — low-stakes tests.
  - [baker2004] 10.1145/985692.985741 — "no other type of off-task behavior is associated nearly so strongly with reduced learning as "gaming the system"" — Cognitive Tutor classrooms.
  - [dmello2012] (above).
  - [ocumpaugh2014] 10.1111/bjet.12156 — "The automated detection of these constructs allows EDM researchers to develop intervention strategies" — detectors must be validated on their own population.
- **Verdict:** design choice. A rapid answer after a miss is a plausible marker of disengagement; nothing has validated it as frustration.
- **Code vs evidence:** matches the caution (contrast form, population gate). It still needs validation against self-report before it is called frustration.

#### 25. Persistence low: payoff early, short sections, 20% fewer items — `stats.js:321-323`; `adaptation.js:101` (weak rule 10)
- **What it does:** the text asks to "put the payoff early and keep each section short enough to finish easily", and the structure cuts items per block by 20%.
- **Evidence:**
  - [bandura1981] (above): proximal subgoals beat distal goals for mastery and self-efficacy.
  - [rey2019] (above).
  - [botelho2019] 10.1109/TLT.2019.2912162 — "high persistence is not always productive for students, where additional practice does not help the student move toward a state of mastery" — students on an online maths platform.
  - [kizilcec2013] 10.1145/2460296.2460330 — "identifies a small number of longitudinal engagement trajectories in MOOCs" — MOOC learners.
- **Verdict:** moderate.
- **Code vs evidence:** matches.

#### 26. Persistence measured as stopping after 3+ misses in a row — `signals.js:70, 714, 750-785`
- **What it does:** of the moments with three or more misses in a row and questions left, the share where the learner stopped (left the level, or no answer for 30 minutes).
- **Evidence:**
  - [botelho2019] (above): stopout and wheel-spinning as the low and unproductive-high ends of persistence.
  - [ventura2013ce] 10.1016/j.compedu.2012.07.003 — "Persistence was measured by recording the time spent on unsolved anagrams and riddles." — online performance task.
  - [beck2013] 10.1007/978-3-642-39112-5_44 — "rather than a fixed number of practices, students continue to practice a skill until they have mastered it. However, an implicit assumption" — adaptive practice (snippet).
  - [kai2018] 10.5281/zenodo.3344810 — "wheel-spinning, a type of unproductive persistence where students spend too much time struggling without achieving mastery of skills" — skill builders.
- **Verdict:** moderate. Behavioural measures of persistence are established. The 3-miss trigger and the 30-minute gap are chosen.
- **Code vs evidence:** matches. As the report notes, real quits have other causes.

#### 27. Momentum: an early easy win — `stats.js:126-128`; `signals.js:109, 461-462, 497` (weak rule 10)
- **What it does:**
  - the text asks for an easy success in the first section;
  - the measure compares the rest of a level after two opening misses with the same positions after a good start;
  - it needs a population, and it has never been confident.
- **Evidence:**
  - [mace1988] 10.1901/jaba.1988.21-123 — "Results showed the antecedent high‐probability command sequence increased compliance and decreased compliance latency and task duration." — five experiments on compliance, not learning.
  - [lee2005] 10.1207/s15327035ex1303_1 — "Overall, high-p request sequences were found to be an effective method to increase compliance." — meta-analysis of applied studies.
  - [aamodt1992] 10.1177/009102609202100203 — "Exams beginning with easier items and then moving to more difficult items are slightly easier than exams with randomly ordered items (d = .11)" — meta-analysis.
  - [miller2018] 10.3982/ecta14943 — "a subtle but substantial bias exists in a common measure of the conditional dependence of present outcomes on streaks of past outcomes" — streak measurement.
- **Verdict:** design choice. Behavioural momentum is real for compliance; easy-first ordering helps a little; no study ties a measured "momentum need" to learning.
- **Code vs evidence:** matches the caution. It cannot fire before a population, and miller2018 is why it is read against the same positions. Keep it off until a holdout test.

#### 28. A rushing learner gets typed answers — `adaptation.js:103, 481, 546`; `contract.js:66`; `learner.js:300` (weak rule 1)
- **What it does:** rush_tendency high sets `prefer_type_in`, so items are served as typed recall instead of multiple choice.
- **Evidence:**
  - [greving2018] 10.3389/fpsyg.2018.02412 — "The results indicated no testing effect for multiple-choice testing." — university lecture, N = 92 (short answer did help).
  - [rowland2014] 10.1037/a0037559 — "initial recall tests yielding larger testing benefits than recognition tests" — meta-analysis.
  - [smith2014] 10.1080/09658211.2013.831454 — "there were little or no advantages of answering short-answer or hybrid format questions over multiple-choice questions" — students, lab.
  - [kang2007] 10.1080/09541440601056620 — "having had an intervening MC test led to better performance than an intervening SA test, but... With feedback provided, having had an intervening SA test led to the best" — students, lab.
  - [little2012] 10.1177/0956797612443370 — "multiple-choice tests could trigger productive retrieval processes-provided the alternatives were made plausible enough" — students, lab.
- **Verdict:** mixed for typed recall in general. Not shown at all for rushers.
- **Code vs evidence:** does not match a tested claim. The effort monitor (mechanism 41), which has direct evidence, already handles rushing. See P1.

#### 29. Rush directive text: the key sentence alone, one "slow down" warning — `stats.js:132-134`
- **What it does:** asks the writer to put the most important sentence on its own line and add one "slow down here" warning where a hasty reader goes wrong.
- **Evidence:**
  - [wise2009] 10.1080/08957340902754650 — "items with more text or those occurring later in the test were related to increased rapid guessing" — low-stakes university tests.
  - [wise2006cbt] 10.1111/j.1745-3992.2006.00054.x — "an effort-monitoring CBT increased examinee effort and yielded more valid test scores than a conventional CBT" — university students.
  - [wise2019] 10.1080/08957347.2019.1577248 — "after a proctor notification was triggered, test-taking engagement" (rose) — K-12 test takers.
- **Verdict:** moderate. Less text to skim, plus a targeted warning, both follow from the rapid-guessing work; the exact layout is untested.
- **Code vs evidence:** matches.

#### 30. Hint dependency and help seeking directives — `stats.js:218-223`; measured at `signals.js:51-52, 311-325` (weak rule 7)
- **What it does:**
  - **hint_dependency high:** "Build gentle hints into the explanation";
  - **help_seeking low:** "Anticipate the learner's questions and answer them in the text";
  - rapid answers when stuck count as frustration, not help seeking.
- **Evidence:**
  - [aleven2016help] 10.1007/s40593-015-0089-1 — "feedback on help seeking helped students to use on-demand help more deliberately... but not to achieve better learning outcomes" — ITS studies.
  - [koedinger2007] 10.1007/s10648-007-9049-0 — "How should learning environments balance information or assistance "giving" and "withholding" to achieve optimal student learning?" — review of Cognitive Tutor experiments.
  - [aleven2003] 10.3102/00346543073003277 — "although effective help-seeking behavior in ILEs is related to better learning outcomes, learners are not using help facilities effectively" — review.
  - [ryan2001] 10.1023/a:1009013420053 — "Why do some students avoid seeking help in the classroom when they need it?" — review of help avoidance.
  - [baker2004] (above).
  - Also: [razzaq2010] 10.1007/978-3-642-13388-6_39 and [mclaren2016] 10.1016/j.chb.2015.08.038 — title-level only (proactive vs on-demand hints; worked examples vs tutored problems).
- **Verdict:** mixed:
  - giving help-avoiders the answers to likely questions fits the help-avoidance work;
  - "build hints in" for heavy hint users is the open assistance dilemma: heavy hint use is partly gaming, and better help use did not raise learning.
- **Code vs evidence:** partly. P5 replaces the hint text with what has better support: a worked example of the exact step, then a try-first prompt (renkl2014, salden2010).

#### 31. Low self-efficacy: an achievable first step, named as achieved — `stats.js:264-266`; measured at `signals.js:81, 297-304, 542, 692-697` (weak rule 8)
- **What it does:**
  - the text asks to "Make the first step clearly achievable and point out explicitly that it was achieved; show that the hard part is learnable";
  - the measure is the share of "sure" taps among right answers, at validity 0.8.
- **Evidence:**
  - [usher2008] 10.3102/0034654308321456 — "Although mastery experience is typically the most influential source of self-efficacy" — review, school settings.
  - [byarswinston2017] 10.1037/cou0000219 — "PA showed by far the strongest unique association with self-efficacy beliefs." — meta-analysis, k = 61, N = 8,965 (PA = performance accomplishments).
  - [bandura1981] (above).
  - [schunk1983] 10.1037/0022-0663.75.6.848 — "Children given only ability feedback demonstrated the highest subtraction skill and self-efficacy" — children deficient in subtraction.
  - [talsma2018] 10.1016/j.lindif.2017.11.015 — "Performance had a net positive effect on subsequent self-efficacy (β = 0.205...), significantly larger than the effect of self-efficacy on performance (β = 0.071" — meta-analysis.
  - Also: [vandinther2011] 10.1016/j.edurev.2010.10.003 — "educational programmes based on social cognitive theory proved to be particularly successful on this score" — review, higher education.
- **Verdict:** moderate for the action. The success-first mechanism is the best-supported source of self-efficacy, and the direction (performance to belief) supports it. The measure is a confidence proxy, not self-efficacy itself.
- **Code vs evidence:** matches. P6 adds what schunk1983 and bandura1981 show: specific feedback on progress and proximal subgoals.

#### 32. Misconception persistence: state, refute, replace — `stats.js:351-353`; measured at `signals.js:56-58, 531` (weak rule 9)
- **What it does:**
  - the measure is the same tagged mistake again, out of misses on a skill with a past tagged mistake (per subject);
  - the text says to confront the recorded misconception: state it, show a case where it fails, give the correct idea.
- **Evidence:**
  - [schroeder2023] 10.1007/s10648-021-09656-z — "refutation text is associated with a positive, moderate effect ( g = 0.41" — meta-analysis.
  - [tippett2010] 10.1007/s10763-010-9203-x — "These structures often contain misconceptions—inaccurate or incomplete information—that are highly resistant to change" — science education review.
  - [kendeou2018] 10.3758/s13421-018-0848-y — "the structure of the refutation texts facilitated the coactivation and integration of the explanation with the commonsense belief, resulting in knowledge revision" — readers, think-aloud and reading times.
  - [shtulman2012] 10.1016/j.cognition.2012.04.005 — "naïve theories survive the acquisition of a mutually incompatible scientific theory, coexisting with that theory for many years to follow" — adults with many years of science education.
  - [payne1990] 10.1207/s15516709cog1403_4 — "mal‐rules are very unstable, students typically use mal‐rules very irregularly" — algebra students, three schools.
  - [smith1994] 10.1207/s15327809jls0302_1 — counter-view: the "flawed ideas that are strongly held" picture "overemphasizes the discontinuity" — theory.
  - Also: [ecker2022] 10.1038/s44159-021-00006-y — title-level only.
- **Verdict:** strong for the action (refutation). Mixed for the premise that persistence is a stable learner trait (payne1990 vs shtulman2012).
- **Code vs evidence:** matches. Measuring recurrence of a *tagged* error per subject reads behaviour, not a global trait.

#### 33. Interest context knob — `adaptation.js:104, 482`; `translate.js:213`
- **What it does:** a confident interest_transfer high builds examples on the learner's stated interests, only when interests exist.
- **Evidence:**
  - [walkington2013] (above).
  - [bernacki2018] (above).
  - [cordova1996] (above).
  - [major2021] 10.1111/bjet.13116 — "more personalised approaches which adapt or adjust to learners' level led to significantly greater impact (an effect size of 0.35)" — low- and middle-income countries.
- **Verdict:** moderate.
- **Code vs evidence:** matches. major2021 found interest-linked personalisation had the smaller effect, so this stays a text change, not a structural one.

#### 34. Recap knob (consolidation need) — `adaptation.js:105, 483, 600`; `translate.js:127-128`
- **What it does:** the lesson ends with "a three-line recap they answer from memory".
- **Evidence:**
  - [rowland2014] (above).
  - [yang2021] 10.1037/bul0000309 — "overall testing (quizzing) raises student academic achievement to a medium extent (g = 0.499)" — classroom meta-analysis.
  - [adesope2017] 10.3102/0034654316689306 — "practice tests are more beneficial for learning than restudying and all other comparison conditions" — meta-analysis.
  - [bertsch2007] 10.3758/bf03193441 — "The size of the generation effect across the 86 studies was .40" — meta-analysis.
- **Verdict:** strong for retrieval at the end (it helps everyone). The trigger (scroll-backs) is a design choice.
- **Code vs evidence:** matches. The recap is retrieval, not rereading (callender2009).

#### 35. Practice ends on proof: compress or extend — `adaptation.js:488-506`; invariant check `adaptation.js:605-629`
- **What it does:**
  - **compress:** a proven objective skips its remaining practice levels, but keeps its spaced-recall level;
  - **extend:** an unproven one whose own practice is used up gets more practice;
  - `checkWhat` refuses any plan that changes what the level covers.
- **Evidence:**
  - [kulik1990] (above).
  - [bloom1984] (above).
  - [corbett1994] 10.1007/bf01099821 — title-level only (knowledge tracing to mastery).
  - [beck2013] (above).
- **Verdict:** strong (mastery learning).
- **Code vs evidence:** matches.

#### 36. Blocked while new, interleaved once proven — `adaptation.js:532`; `adaptation.js:413-421`
- **What it does:** practice is blocked on a new objective under worked-example guidance, and interleaved with other skills otherwise.
- **Evidence:**
  - [brunmair2019] 10.1037/bul0000209 — "interleaving can effectively foster inductive learning... should be used with caution in certain conditions, especially for expository texts and words" — meta-analysis.
  - [rohrer2015] 10.1037/edu0000001 — "Cohen’s ds 0.42 and 0.79, respectively" — 126 seventh graders.
  - [firth2021] 10.1002/rev3.3266 — "Memory... showed an interleaving benefit with effect sizes (Hedges’ g ) of up to 0.65" — review.
- **Verdict:** moderate.
- **Code vs evidence:** matches brunmair2019's caution for new material and words.

#### 37. Proof check with questions written for the objective — `adaptation.js:514-524`; `services/coverage.js:95`
- **What it does:** when belief is already above 0.95 but too few right answers came from questions written for this objective (needs 2), it asks a few of those instead of more practice.
- **Evidence:**
  - [cohen1987] 10.3102/0013189X016008016 — "When critical features of instructional stimuli match those of assessment, effect sizes routinely reach 1.2 to 3 sigma." — review of alignment studies.
  - [martone2009] 10.3102/0034654309341375 — "alignment research is critical for ensuring the standards-assessment-instruction cycle facilitates student learning" — review.
  - [kulik2016] 10.3102/0034654315581420 — "suggesting that alignment of test and instructional objectives is a critical determinant of evaluation results" *(fetched today)* — meta-analysis, 50 ITS evaluations.
- **Verdict:** moderate.
- **Code vs evidence:** matches.

#### 38. Session summary at 85% / 60%; difficulty_delta computed but unused — `services/sessions.js:1484-1502` (weak rule 3)
- **What it does:** the rule-based end-of-session analysis says:
  - 85% or more: "the next one steps up";
  - 60% or more: "a few soft spots";
  - below that: "stays here".

  It writes `difficulty_delta` of +0.5 (85% or more) or -0.5 (50% or less), but nothing reads that value (only `next_session.note` is shown).
- **Evidence:**
  - [wilson2019] (above).
  - [jansen2013] (above).
  - [eglington2020] (above).
- **Verdict:** design choice. 85% as "strong" fits the human studies, which favour high success.
- **Code vs evidence:** the summary matches. `difficulty_delta` is dead data: either wire it to the next session's difficulty or drop it, so no one later mistakes it for a live 85% target.

### D. The effort monitor (ADAPT_EFFORT, default on)

#### 39. Answers under 1.2 s are not evidence — `services/coverage.js:75, 102, 436-441`
- **What it does:** an answer under 1,200 ms is counted as rapid and never as evidence of knowing (`OBJ_RAPID_MS`).
- **Evidence:**
  - [kong2007] 10.1177/0013164406294779 — "compared four methods for setting item response time thresholds to differentiate rapid-guessing behavior from solution behavior" — low-stakes tests.
  - [wise2017] (above).
  - [soland2021] 10.1186/s40536-021-00100-w — "we help provide guidance to developers and administrators of large-scale assessments on the tradeoffs involved in using a given method" — 728,923 students in grades 3-8.
  - [wise2009] (above): items with more text draw more rapid guessing.
- **Verdict:** moderate. Response-time thresholds are well established; the fixed value is a choice.
- **Code vs evidence:** partly. A fixed 1.2 s is generous on a short item and lenient on a long one; kong2007 and soland2021 compare item-relative methods. See P8. Section 02 mechanism 28 agrees.

#### 40. Relative rapid line: under 0.3 x expected time — `signals.js:266, 411, 581-583, 635`
- **What it does:** the scorecard's rush evidence is an answer under 0.3 x the item's expected time, or a lesson page read in under 0.2-0.25 of its expected time.
- **Evidence:**
  - [kong2007] (above).
  - [soland2021] (above).
  - [wise2005] 10.1207/s15324818ame1802_2 — "unmotivated examinees will answer too quickly (i.e., before they have time to read and fully consider the item)" — low-stakes tests.
  - [lee2014rt] 10.1186/s40536-014-0008-1 — "A five-step procedure was proposed to identify rapid-guessing behavior" — NAEP study.
- **Verdict:** design choice. Item-relative thresholds are among the compared methods; 0.3 is chosen.
- **Code vs evidence:** matches the direction.

#### 41. "Too fast to count" on checkpoints and the Final — `services/effort-monitor.js:1-24, 109-131`; `adaptation.js:397-411`
- **What it does:**
  - an answer under 1.2 s on a scored sitting is set aside, unscored;
  - the learner is told why and gets a parallel question (same skill, difficulty and objective), at most 2 times;
  - the pass mark and the number of scored questions do not change;
  - retention items and the owner are exempt.
- **Evidence:**
  - [wise2006cbt] (above).
  - [wise2019] (above).
  - [wise2006] 10.1111/j.1745-3984.2006.00002.x — "rapid guessing (i.e., reflecting low examinee effort)" — the effort-moderated IRT model.
  - [rios2017] 10.1080/15305058.2016.1231193 — "the true mean was underestimated by around 0.20 SDs if the total amount of careless responses exceeded" — test takers.
- **Verdict:** moderate. Effort monitoring with warnings is directly tested; the swap for a parallel question is a reasoned extension.
- **Code vs evidence:** matches.

#### 42. Rush flag and the one-line slow-down note — `adaptation.js:65-69, 377-395`; `effort-monitor.js:133-147`
- **What it does:** outside scored sittings, a rapid answer from a learner whose record flags rushing gets "Read each question to the end". The flag needs a Beta posterior 95% sure that more than 5% of their answers are rapid, on at least 30 answers. No score changes.
- **Evidence:**
  - [wise2006cbt] (above).
  - [wise2019] (above).
  - [kluger1996] 10.1037/0033-2909.119.2.254 — "FIs improved performance on average (d =.41) but that over 1/3 of the FIs decreased performance" — meta-analysis.
  - [shute2008] 10.3102/0034654307313795 — "formative feedback should be nonevaluative, supportive, timely, and specific" — review.
- **Verdict:** moderate.
- **Code vs evidence:** matches. The note is non-evaluative and task-focused, which is what kluger1996 and shute2008 point to.

### E. Coach guards

#### 43. The coach never gives the answer first; leak guard — `services/ai.js:1202-1205, 1320, 1415-1430`
- **What it does:**
  - before the learner has answered, the coach must not state the answer or say which choice is correct, even when asked or told a teacher allowed it;
  - `leakGuard` replaces any reply that contains the normalised key (unless the learner said it first) with a redirecting question.
- **Evidence:**
  - [bastani2025] 10.1073/pnas.2422633122 — "48% improvement in grades for GPT Base... 17% reduction in grades for GPT Base" — high school maths; the guarded tutor avoided the harm.
  - [baker2004] (above).
  - [aleven2016help] (above).
  - [koedinger2007] (above).
- **Verdict:** moderate.
- **Code vs evidence:** partly. The guard checks for the key's *text* only. A reply such as "it's option 2" or "the second choice" is not caught; the system prompt forbids it, but nothing checks it. See P10.

#### 44. Coach turn rules: one question, the smallest next step — `ai.js:1207-1218`; `services/assist.js:47-60`
- **What it does:**
  - ends each turn with one question that moves the learner one step;
  - exposes a flaw by asking, not telling;
  - changes approach when going in circles;
  - two or three sentences per turn.
- **Evidence:**
  - [chi2001] 10.1207/s15516709cog2504_1 — "Surprisingly, students learned just as effectively even when tutors were suppressed from giving explanations and feedback." *(fetched today)* — one-to-one human tutoring.
  - [graesser2004] 10.3758/bf03195563 — "AutoTutor has produced learning gains of approximately .70 sigma for deep levels of comprehension." *(fetched today)* — college physics and computer literacy.
  - [nye2014] 10.1007/s40593-014-0029-5 — "Research on early versions of AutoTutor documented the impact on deep learning by co-constructed explanations, feedback, conversational scaffolding" *(fetched today)* — review.
  - [vanlehn2011] 10.1080/00461520.2011.611369 — "Instead, it found that the effect size of human tutoring was much lower: d = 0.79." *(fetched today)* — review; step-based ITS about as effective.
- **Verdict:** moderate.
- **Code vs evidence:** matches.

#### 45. The coach stays on the question on screen — `ai.js:1264-1298`
- **What it does:** the coach may never substitute a different problem, new numbers or an easier example; it asks about a part of this question instead.
- **Evidence:**
  - [cohen1987] (above).
  - [kulik2016] (above).
  - [vanlehn2011] (above).
- **Verdict:** design choice. Help aligned to the step being assessed is the better-supported design; the ban itself came from an observed failure (drift).
- **Code vs evidence:** matches.

#### 46. Coached right answers weigh 0.25; XP x 0.6 — `services/coverage.js:76, 103, 447`; `services/mastery.js:670-680`
- **What it does:**
  - a right answer reached with the coach counts 0.25 toward proof;
  - XP for it is 60% of the uncoached value: "enough to make working it out alone feel worth more, not enough to discourage asking for help".
- **Evidence:**
  - [koedinger2007] (above).
  - [aleven2016help] (above).
  - [feng2009] 10.1007/s11257-009-9063-7 — "we can do a reliably better job predicting student end-of-year exam scores by leveraging the interaction data" — ASSISTment system, middle-school math; the interaction data include the help a student needed.
  - [beck2008help] 10.1007/978-3-540-69132-7_42 — "help both promotes student long-term learning and provides additional scaffolding on the current problem" — Reading Tutor data; a helped answer partly reflects the help.
- **Verdict:** design choice. That assisted answers are weaker evidence is standard in tutoring assessment; 0.25 and 0.6 are chosen.
- **Code vs evidence:** matches the direction.

#### 47. No assist on checkpoints and essays — `services/assist.js:1-10`
- **What it does:** checkpoints and essays are the test, so no chat help is offered there.
- **Evidence:**
  - [haladyna2004] 10.1111/j.1745-3992.2004.tb00149.x — "One major threat is construct‐irrelevant variance (CIV)." — measurement review.
  - [messick1995] (above).
  - [kane2013] (above).
- **Verdict:** moderate.
- **Code vs evidence:** matches. Help during a test would mix what the tutor knows into the score.

### F. Grading leniency and the injection check

#### 48. Form leniency: case, accents, $, punctuation, "x =" — `services/grading.js:1-8, 23-35, 116-130`
- **What it does:**
  - the rules forgive capitals, accents, "$", trailing punctuation, unicode dashes and quotes;
  - one leading "x =" is forgiven both ways;
  - a wrong value is never forgiven.
- **Evidence:**
  - [haladyna2004] (above).
  - [messick1995] (above).
  - [downing2005] 10.1007/s10459-004-4019-5 — "flawed multiple-choice test items, which violate well established and evidence-based principles of effective item writing, disadvantage some medical students" — medical students.
  - [burrows2015] 10.1007/s40593-014-0026-8 — "Automatic short answer grading (ASAG) is the task of assessing short natural language responses to objective questions using computational methods." — review of 35 systems.
- **Verdict:** moderate. Scoring the construct and not the notation is the validity principle; the exact list is the app's.
- **Code vs evidence:** matches.

#### 49. Number forms: 0.5 = 1/2, mixed numbers, strict thousands commas — `grading.js:38-90, 278-288`
- **What it does:**
  - integers, decimals, fractions and mixed numbers are compared by value;
  - a comma is a thousands separator only in the exact 1,250 shape, so "12, 6, 4" is not read as 1264.
- **Evidence:**
  - [ccss-4nf-c6] https://www.thecorestandards.org/Math/Content/4/NF/ — "For example, rewrite 0.62 as 62/100; describe a length as 0.62 meters; locate 0.62 on a number line diagram." — US standard.
  - [ccss-4nf-a1] same URL — "Use this principle to recognize and generate equivalent fractions." — US standard.
  - [ccss-3nf-a3] https://www.thecorestandards.org/Math/Content/3/NF/ — "Express whole numbers as fractions, and recognize fractions that are equivalent to whole numbers." — US standard, grade 3 (a separate page from 4.NF).
  - [haladyna2004] (above).
- **Verdict:** moderate (the standards treat these forms as the same number).
- **Code vs evidence:** matches.

#### 50. Strict on exactly the form the prompt asks for — `grading.js:132-185, 254-277`
- **What it does:** when the prompt names a form (lowest terms, as a fraction or decimal, capitalisation, punctuation, accent), forgiveness is switched off in exactly that dimension. "24/32" for "lowest terms" is wrong.
- **Evidence:**
  - [kane2013] (above).
  - [messick1995] (above).
  - [haladyna2004] (above).
  - [ccss-4nf-a1] (above): generating an equivalent fraction is itself the skill.
- **Verdict:** moderate. When the form is the construct, forgiving it would itself be construct-irrelevant.
- **Code vs evidence:** matches.

#### 51. Spanish: optional subject pronoun, el/él and tu/tú kept apart — `grading.js:19-20, 92-115`
- **What it does:**
  - a leading subject pronoun may be included or left out;
  - an unaccented "el" or "tu" counts as the pronoun only when the other side spells it with its accent, so "el libro" never accepts "libro".
- **Evidence:**
  - [otheguy2007] 10.1353/lan.2008.0019 — "Subject personal pronouns are highly variable in Spanish but nearly obligatory in many contexts in English" — corpus of 142 speakers.
  - [rae-tilde] https://www.rae.es/dpd/tilde — "Se llama tilde diacrítica al acento gráfico que permite diferenciar en la escritura ciertas palabras de igual forma, pero distinto valor" — Spanish language academy; its table pairs él (pronoun) with el (article) and tú with tu.
  - [haladyna2004] (above).
- **Verdict:** design choice.
- **Code vs evidence:** matches. Accents are forgiven elsewhere (mechanism 48), so the accent-only distinction el/él needs this special case, and has it.

#### 52. Grading injection check and fenced judge input — `services/typed-grading.js:26-33, 137-204`
- **What it does:**
  - an answer is marked incorrect before any model sees it when it talks to the grader: instructions, "the answer is correct", fake system lines, chat tokens, JSON verdicts, role-play (English and Spanish), unless the item's own text says the same;
  - every answer a judge sees is cleaned (invisible characters, NFKC), put on one line, capped at 600 characters, and fenced between random markers;
  - `GRADING_INJECTION_CHECK=off` skips the pre-check only.
- **Evidence:**
  - [greshake2023] 10.1145/3605764.3623985 — "LLM-Integrated Applications blur the line between data and instructions" — deployed LLM applications.
  - [shi2024judge] 10.1145/3658644.3690291 — "JudgeDeceiver injects a carefully crafted sequence into an attacker-controlled candidate response" — LLM-as-a-judge.
  - [owasp-llm01] https://genai.owasp.org/llmrisk/llm01-prompt-injection/ — "Separate and clearly denote untrusted content to limit its influence on user prompts." — industry standard.
  - [zheng2023] 10.52202/075280-2020 — "position, verbosity, and self-enhancement biases" — LLM judges.
- **Verdict:** moderate.
- **Code vs evidence:** matches the standard (fencing). shi2024judge shows optimised injections beat simple detection. The stronger guard here is the consensus rule and "never accept on doubt" (typed-grading.js header), and the regex check is the first layer. Keep both.

### G. Objective items

#### 53. Objective-item code checks — `services/objective-items.js:43-97`
- **What it does:** an item is refused unless it has all of these:
  - exactly 4 distinct, non-empty options;
  - no "all/none of the above";
  - a key that is one of the options and is not written in the question;
  - no length cue;
  - a rationale that points to the key;
  - at most 80 words;
  - no reference to a missing picture or audio;
  - no duplicate for the objective;
  - for maths, the math-claims checks.
- **Evidence:**
  - [haladyna2002] 10.1207/s15324818ame1503_5 — "A taxonomy of 31 multiple-choice item-writing guidelines was validated through a logical process" — 27 textbooks, 27 studies.
  - [tarrant2008] 10.1111/j.1365-2923.2007.02957.x — "Fewer examinees passed the standard scale than the total scale" — nursing students, 10 high-stakes papers.
  - [downing2005] (above).
  - [gierl2017] 10.3102/0034654317726529 — "the task of creating distractors has received much less attention" — review.
  - [rodriguez2005] 10.1111/j.1745-3992.2005.00006.x — "More 3‐option items can be administered than 4‐ or 5‐option items per testing time while improving content coverage, without detrimental effects" — meta-analysis.
- **Verdict:** strong (item-writing guidelines, and the harm of flawed items).
- **Code vs evidence:** matches. One difference: the evidence allows 3 options (rodriguez2005; aamodt1992: 3-choice items take less time), and the code requires exactly 4. Not a defect (P11, optional).

#### 54. Two blind judges from different model families agree on the key — `objective-items.js:8-13, 82-83`; `services/key-agreement.js`
- **What it does:** only items kept by the content factory are served: code checks, plus two blind judges from different model families agreeing on the key and suitability. Here the rationale must also point to the key.
- **Evidence:**
  - [zheng2023] (above): self-enhancement bias is why the families differ.
  - [pardos2024] 10.1371/journal.pone.0304013 — "ChatGPT-generated help failed quality checks on 32% of problems" — maths help.
  - [gierl2017] (above).
- **Verdict:** design choice.
- **Code vs evidence:** matches.

#### 55. Objective items served first; aligned right answers needed for proof — `objective-items.js:1-20`; `coverage.js:66-67, 95`
- **What it does:** reviews and remediation ask questions written for one objective before bank questions, and a proof needs at least 2 right answers to such questions.
- **Evidence:**
  - [cohen1987] (above).
  - [martone2009] (above).
  - [kulik2016] (above).
- **Verdict:** moderate.
- **Code vs evidence:** matches.

### H. The young-learner oral mode (YOUNG_ORAL, default on)

#### 56. Spoken checkpoints for preschool and Kindergarten — `services/essays.js:50-95`
- **What it does:** the sheet's "Explain Aloud" and "Oral Retell" checkpoints are no longer an 80-word typed essay:
  - a tap-to-answer quick check, marked by the app, decides the pass;
  - the child then says it aloud to a grown-up;
  - no model is called.
- **Evidence:**
  - [ccss-wk2] https://www.thecorestandards.org/ELA-Literacy/W/K/ — "Use a combination of drawing, dictating, and writing to compose informative/explanatory texts" — US standard, Kindergarten.
  - [puranik2009] 10.1007/s11145-009-9220-8 — "Children appear to progress along a continuum from scribbling to conventional spelling" — 372 preschoolers.
  - [reed2011] 10.1080/10888438.2010.538780 — "Retell was moderately correlated with standardized measures of reading comprehension" — 54 studies, K-12.
  - [rittlejohnson2006] 10.1111/j.1467-8624.2006.00852.x — "self-explanation promoted transfer regardless of instructional condition" — children aged 8-11.
- **Verdict:** moderate.
- **Code vs evidence:** matches:
  - a typed 80-word essay asks for transcription that preschoolers do not have;
  - reed2011 also says retell "has not yet demonstrated adequacy as a progress monitoring instrument", which supports letting the tap check, not the retell, decide the pass.

  rittlejohnson2006 is about older children, so the benefit of explaining aloud at age 4-5 is extrapolated.

#### 57. A grown-up's "I heard it" weighs 0.25 and never proves alone — `coverage.js:77, 104, 447`; `essays.js:63-66`
- **What it does:** an adult's confirmation is a light, unverified answer, and it can never prove an objective on its own.
- **Evidence:**
  - [reed2011] (above).
  - [kane2013] (above).
  - [messick1995] (above).
- **Verdict:** design choice.
- **Code vs evidence:** matches.

#### 58. The recording stays on the device — `essays.js:58-62`; `public/js/say-aloud.js`
- **What it does:** the optional recording stays on the device: nothing is uploaded or kept.
- **Evidence:**
  - [coppa-312.2] https://www.ecfr.gov/current/title-16/part-312/section-312.2 — "A photograph, video, or audio file where such file contains a child 's image or voice" — US rule (from section 05).
  - [gdpr-art5-1c] (above).
  - [livingstone2019] (no DOI) — "The relation between privacy and data online is becoming highly complex" — children's privacy.
- **Verdict:** moderate.
- **Code vs evidence:** matches. A child's voice is personal information, so not collecting it is the minimal option.

### I. The lesson sandbox (LESSON_SANDBOX, default on)

#### 59. Lessons in a sandboxed frame with a strict CSP — `routes/base-lessons.js:180-207, 236-290`
- **What it does:**
  - lesson pages load in `<iframe sandbox="allow-scripts allow-forms">`, without allow-same-origin;
  - the response itself sends `Content-Security-Policy: sandbox ...`, so the page is opaque wherever it is opened;
  - scripts run only with a per-response nonce, or with hashed inline handlers;
  - `connect-src`, `form-action`, `frame-src` and `object-src` are `'none'`;
  - the page talks only by checked postMessage.
- **Evidence:**
  - [whatwg-iframe-sandbox] https://html.spec.whatwg.org/multipage/iframe-embed-object.html — "The sandbox attribute, when specified, enables a set of extra restrictions on any content hosted by the iframe element." — web standard. The same page warns that allow-scripts plus allow-same-origin together let a page break out.
  - [w3c-csp3] https://www.w3.org/TR/CSP3/ — "This document defines a mechanism by which web developers can control the resources which a particular page can fetch or execute" — web standard.
  - [weichselbaum2016] 10.1145/2976749.2978363 — "75.81% of distinct policies use script whitelists that allow attackers to bypass CSP" — 1,680,867 hosts.
  - [saltzer1975] (above): least privilege.
- **Verdict:** strong (standards plus measured CSP failures).
- **Code vs evidence:** matches:
  - nonces rather than host whitelists, as weichselbaum2016 recommends;
  - no allow-same-origin, as the WHATWG warning requires.

  The policy still lists `'self'` and the host in script-src. That is the one remaining whitelist entry, and safe only while the app serves no JSONP-style endpoint.

### J. Owner base vs optimized (product behaviour, no evidence needed)

#### 60. Owner base vs optimized — `config/owner.js:1-51`; `adaptation.js:652-658, 683-686`; `learner.js:239, 293`; `effort-monitor.js:38-45`
- **What it does:**
  - the owner's account gets the base product, unmodified: no adaptation plan, neutral session settings, no scorecard steering;
  - every other account gets every modification;
  - `OWNER_BASE=off` (or `ADAPT_OWNER=1`) makes the owner an ordinary learner;
  - safety and integrity rules never ask this.
- **Note:** a product rule from docs/PRODUCT-DECISIONS.md. One detail: `effort-monitor.js` exempts the owner through `isOwner` (skip rights), not `ownerBase`. So `OWNER_BASE=off` adapts the owner but still exempts them from "too fast to count". The owner.js comment, by contrast, says the too-fast rule never asks ownerBase. That is consistent, but worth knowing when testing as the owner.

#### 61. Owner skips — `services/owner-skips.js:1-16`
- **What it does:** the owner may skip a placement quiz, skip a whole grade, and stand on any level ahead or behind. A skipped grade graduates without the Final, the coverage gate, the skill gate or consolidation. Only `canSkip` routes reach it.
- **Note:** a product rule, no evidence needed.

## Proposals (not built; each backed by 3 or more sources)

| # | Change | Files and values | Sources | Expected effect | Risk |
|---|---|---|---|---|---|
| P1 | **BUILT (flag `SCORECARD_DROP_RUSH_TYPED`, 2026-10-25).** Drop the typed-answer switch for rushers, or run it as an experiment arm | `services/adaptation.js:103` remove `rush_tendency: { high: { typed: true } }`. The same in `services/scorecard/contract.js:66`. `services/learner.js:300` then never sees `s.typed` from rush. Update `scripts/scorecard-contract-test.js` (KNOBS equality) | smith2014, kang2007, little2012, greving2018, rowland2014; wise2006cbt and wise2019 for the effort monitor that remains | Removes an untested format switch. Rushers are still handled by mechanisms 41-42 | Low. If typed recall does help rushers, an experiment arm would show it |
| P2 | **BUILT (flag `SCORECARD_SOFT_STRETCH`; knob, clamp and text).** Soften the challenge high side | `adaptation.js:99` `challenge_appetite.high.stretch` +0.1 to **+0.05**; `contract.js` KNOBS the same. Stretch clamp 0.35 to **0.25** at `adaptation.js:544` and `learner.js:299`. `stats.js:158-160` high text to "Teach the core at the usual level, then end with one optional harder 'try this' case" | jansen2013, eglington2020, lomas2013, lomas2017 | Higher success rates and more practice attempted (jansen2013) | Strong learners may find levels easy. Problems-first on proven objectives (mechanism 17) still moves them on |
| P3 | **BUILT (flag `SCORECARD_LENGTHEN_NEW_ONLY`).** Lengthen only for new material | `adaptation.js:477`: apply `length: +1` from brevity_preference low only when `g === 2` (worked examples). Keep the -1 side as is | mayer1996, sundararajan2020, kalyuga2003, kirschner2013 | Shorter text for learners who already know the objective | Low |
| P4 | **BUILT (flag `SCORECARD_OBSERVED_PREFS` = on, shadow or off; live).** It was run in shadow on a copy of the live DB: 2 of 107 profiles change, both stretch 0.125 to 0.1. The recovery sim (`--quick`) gives the same numbers as before. That sim does not exercise `learner.effective`, so the evidence that nothing regressed comes from the scorecard tests and the shadow pass. Let measured behaviour fully replace stated preference, and gate the scorecard term | `learner.js:242`: cap `Math.min(0.75, ...)` to **1.0**, so after 7 analysed sessions the stated value has no weight. `learner.js:251-255`: replace the confidence >= 30 blend with `contract.forSession` sides only, or drop it | pashler2008, rogowsky2015, kirschner2013, nisbett1977 | Session structure follows behaviour, as the contract already promises | Medium. Changes session size and shares for existing learners; run in shadow first |
| P5 | **BUILT (flag `SCORECARD_WORKED_HINT_TEXT`).** A better-supported hint_dependency directive | `stats.js:218-220` high text to "Open with one fully worked example of exactly this step, then ask the learner to try the next step themselves before any hint" | koedinger2007, aleven2016help, renkl2014, salden2010, baker2004 | Help up front without bottom-out hinting | Low. Text only |
| P6 | **BUILT (flag `SCORECARD_SUBGOAL_TEXT`).** A stronger self_efficacy directive | `stats.js:264-266` low text: add "Split the task into short sub-goals, and after the first one say specifically what they did right and that it shows they can do this kind of step" | schunk1983, bandura1981, usher2008, byarswinston2017 | More mastery experience and specific progress feedback | Low. Avoid generic praise (mueller1998) |
| P7 | **BUILT (no flag: a check, not a behaviour).** `services/scorecard/reliability.js` `splitHalf`, plus the report wording in section 11. Running it on real learners needs data (20+ learners with 30+ levels). Specify the split-half check | `SCORECARD-EVIDENCE-REPORT.md:545`, and the check script when it is written: "Spearman-Brown-corrected split-half, averaged over 500 random splits (not only odd/even days), point >= 0.6 and lower 95% bound >= 0.5" | koo2016, parsons2019, brown1910, spearman1910 (title-level), cicchetti1994 | A check that matches reliability practice | None (documentation, then a script) |
| P8 | **BUILT (flag `RAPID_ITEM_RELATIVE`; knobs `OBJ_RAPID_REL` 0.10, `OBJ_RAPID_MIN_N` 30).** Applied in coverage, in set-asides on scored sittings, and in the slow-down note when the caller passes the item. A set-aside answer never counts as wrong. An item-relative rapid line on long items | `coverage.js:102, 439` and `adaptation.js:408-411` (sittingRule): rapid if `ms < max(1200, 0.10 x the item's typical time)` once an item has 30+ timed answers; 1.2 s until then | kong2007, soland2021, wise2009, wise2017 | Catches skimming on long items that 1.2 s misses | More answers set aside on long items; the cap of 2 reserves still holds |
| P9 | **SKIPPED: needs data.** No simulation in the repo can measure how well the writer and coach models follow 3, 6, 9 or 12 directives: the recovery sim stubs the model. Measuring it needs model runs and per-directive compliance scoring. COACH_MAX stays 8. Test, then match, the directive caps | Run the writer and coach models on 3 / 6 / 9 / 12 directives and score compliance per directive. Set `contract.js:73` COACH_MAX to whatever wins (6 unless the coach shows a reason) | liu2024lost, levy2024, he2024cello, jaroslawicz2025 | A measured cap instead of two unmeasured ones | Low. Evaluation cost only |
| P10 | **BUILT (flag `COACH_LEAK_CHOICE`; non-streamed and streamed coach).** Close the leak guard's choice-number gap | `ai.js:1421-1430`: also redirect when, before the learner names it, the reply names the key's choice number, letter or position ("(2)", "option B", "the second one") | bastani2025, baker2004, aleven2016help | The no-answer rule holds on multiple choice too | False redirects when an explanation mentions an option number innocently. Limit the check to the key's own index |
| P11 (optional). **BUILT (flag `OBJ_ITEMS_3_OPTIONS`, default on; 2026-10-25, implementer B):** `objective-items.problems` accepts 3 or 4 distinct options, and coverage already guesses 1/n. The build script's distractor drop is not done; today's files are all 4-option. Tests: `objective-items-test.js`. | Allow 3-option objective items | `objective-items.js:68`: accept 3 or 4 choices; the build script may then drop the weakest distractor | rodriguez2005, aamodt1992, gierl2017 | More items per minute at no loss in quality | Low. Existing files stay valid |

**Report corrections (no code). DONE 2026-10-25 in SCORECARD-EVIDENCE-REPORT.md** (sections 6.2, 6.3, 6.4, 6.6, 6.7, 6.10, 7 and 11; the new sources are added to section 13):
- SCORECARD-EVIDENCE-REPORT.md section 7: "Rates use logit counting variance ... rests on the simulation" should say it is the Haldane-Anscombe empirical logit with the Gart-Zweifel variance [haldane1956; anscombe1956; gart1967].
- The 0.98 has the posterior false-discovery justification [newton2004; efron2008].
- Section 6.7: list jansen2013 and eglington2020 next to wilson2019, and drop "about 85% for gradient-based learners" as a basis for people.
- Section 6.6: add camachomorles2021 (frustration rho -0.02).
- Section 6.10: add payne1990 and shtulman2012 on the persistence premise.
