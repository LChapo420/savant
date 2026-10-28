# 02. Retention and review: the evidence for each mechanism

Part of the evidence article (curriculum-build/evidence-article/BRIEF.md). This section covers:
- the retention enforcers and their calendar;
- the daily review and skill-level spaced review;
- consolidation before the Final;
- retrieval inside lessons ("Check what stuck", the per-level and end-of-sitting retention questions);
- feedback timing;
- interleaving across sessions;
- sleep and day boundaries;
- the forgetting model that gives every recall estimate here.

**Totals.**
- **50 mechanisms**; 50 of 50 have 3 or more distinct sources.
- Verdicts: strong 5, moderate 25, mixed 5, design choice 15.
- **123 distinct sources** cited:
  - 96 reused from `retention-sources.json`;
  - 12 reused from `scorecard-sources.json`;
  - **15 new**, all verified today and listed in `02-retention-review-sources.json`.

**How sources were handled.**
- **Reused sources** are already DOI-verified in `retention-sources.json` (84 own, 66 shared) or `scorecard-sources.json`. Their quotes are taken from the verified abstracts stored there, or from the claim check (`SCORECARD-CLAIM-CHECK-2026-10-25.md`).
- **New sources** were looked up on Crossref by DOI, and title, first author and year were matched. The abstracts came from Crossref, Semantic Scholar or OpenAlex.
- **Re-verified for a new claim:**
  - eglington2020: the 0.70 / 0.86 / 0.94 / 0.98 comparisons and the selection rule were checked in the Europe PMC full text (PMC7567101).
  - tabibian2019 and pavlik2008: their new quotes were checked in the abstract.
- **Quote checks.** Every quote below was checked by script against the stored abstract text. Each is under 25 words. "Title-level only" marks the few with no retrievable abstract.

**Design choices, stated plainly.** No study sets any of these numbers. Each was chosen inside the direction the evidence gives, and each needs real-learner data:
- the 3/4/3/4 semi-weekly, weekly on day 7, bi-weekly on days 12, 26, 40, ..., and the monthly "pocket" day (owner rules);
- full under 10%, applied as 0.095;
- the scope shares (9.5 / 9.5 / 6 / 5 / 4 / 3%) and caps (8 / 10 / 12 / 15 / 15 / 20 min);
- the tier multipliers (0.35 / 0.65), the 20-minute daily cap, and the 0.5 weight for absorbed scopes;
- the score weights, the 0.35 value of a second try, the fragile and mature thresholds, and the lags;
- the 10-minute review, the 90% / 30-day / 21-day consolidation targets, and the 12-hour and 1-day gates.

## Mechanisms at a glance

| # | Mechanism | Verdict | Sources |
|---|---|---|---|
| 1 | End-of-session enforcer is retrieval with feedback, not review | strong | 6 |
| 2 | End-of-day enforcer, which also takes in the day's unchosen session enforcers | moderate | 4 |
| 3 | Tier menu (quick, medium, full, none) with a preselected default | moderate | 5 |
| 4 | Full tier capped at 9.5% of covered active time; quick and medium at 0.35 and 0.65 of full | design choice | 4 |
| 5 | Per-scope budget shares and caps | design choice | 4 |
| 6 | 20-minute daily cap across all enforcers | design choice | 3 |
| 7 | Active-time clock that sizes every budget | design choice | 4 |
| 8 | Semi-weekly enforcer on strict 3/4/3/4-day gaps from the anchor | design choice | 4 |
| 9 | Weekly enforcer every 7 days, absorbing that day's semi-weekly | design choice | 4 |
| 10 | Bi-weekly enforcer on days 12, 26, 40, ... | design choice | 3 |
| 11 | Monthly enforcer on a free "pocket" day within 3 days of day 30m | design choice | 3 |
| 12 | Absorption into one combined enforcer, with budget = largest part + 0.5 x the others | design choice | 4 |
| 13 | Cumulative windows, and questions only from the covered window | moderate | 5 |
| 14 | Retention calendar page (done, none, missed, due, nothing to cover) | moderate | 4 |
| 15 | Unchosen and unfinished enforcers are offered again; validity 24 h (session) and 48 h (day | design choice | 4 |
| 16 | Selection by predicted forgetting | strong | 5 |
| 17 | Desirable-difficulty window d(p_now) | moderate | 5 |
| 18 | Score flags | moderate | 5 |
| 19 | Defaults with no record | design choice | 3 |
| 20 | Soft eligibility | moderate | 4 |
| 21 | Greedy fill by value per planned second, with a cost model per format | moderate | 3 |
| 22 | Allocation | moderate | 6 |
| 23 | Drop-out retries | moderate | 4 |
| 24 | Interleave by skill inside the sitting | mixed | 4 |
| 25 | Session scope asks the oldest-exposed topics first | moderate | 3 |
| 26 | Close on a question the curve expects right (p_now >= 0.8) | design choice | 4 |
| 27 | A new question instance each time; a varied second try; never the learner's own check as " | moderate | 5 |
| 28 | A "kept" answer is first try, unaided, not rapid (< 1200 ms) and machine-graded; only answ | moderate | 5 |
| 29 | Low stakes | moderate | 4 |
| 30 | Daily review queue | moderate | 4 |
| 31 | Review target | moderate | 4 |
| 32 | Rested gate | moderate | 3 |
| 33 | Review budget | design choice | 3 |
| 34 | Daily review folded into the enforcers | design choice | 3 |
| 35 | Typed recall preferred in the review | mixed | 4 |
| 36 | Lapsed objectives are re-taught as a lesson, at most 3 per session, 6 minutes each | moderate | 4 |
| 37 | Skill-level spaced review (mastery.dueReviews) | mixed | 5 |
| 38 | Due reviews go first in a lesson, one difficulty step below the level | moderate | 4 |
| 39 | Interleaving across sessions | moderate | 4 |
| 40 | Final held for review-only days until 90% of objectives are durable at 30 days, for at mos | design choice | 5 |
| 41 | "Check what stuck" | strong | 5 |
| 42 | Per-level retention question after each level closes | moderate | 4 |
| 43 | End-of-sitting retention set | moderate | 4 |
| 44 | Feedback timing | mixed | 7 |
| 45 | Feedback content | strong | 5 |
| 46 | Day boundaries | moderate | 6 |
| 47 | Half-life regression with a population fit, a guessing floor and capped counts | moderate | 4 |
| 48 | Curve shape | mixed | 4 |
| 49 | Only spaced successes lengthen the half-life | strong | 5 |
| 50 | Personal forgetting multiplier from the learner's own memory checks | moderate | 4 |

## Mechanisms in detail

### A. Retention enforcers: what they are and what they cost

**1. End-of-session enforcer is retrieval with feedback, not review**
- *Where:* services/enforcers.js:701-729 (onSessionEnded), :562-612 (plan), :640 (immediateFeedback: true)
- *What it does:* When a study session ends, the app offers a short sitting of questions on what was worked in that session. Every question is answered unaided and gets feedback at once.
- *Evidence:*
  - **roediger2006**, https://doi.org/10.1111/j.1467-9280.2006.01693.x: "on the delayed tests, prior testing produced substantially greater retention than studying" (college students, prose passages, lab; retention-sources.json)
  - **karpicke2008**, https://doi.org/10.1126/science.1152408: "Repeated studying after learning had no effect on delayed recall, but repeated testing produced a large positive effect." (college students, foreign-vocabulary pairs, lab; retention-sources.json)
  - **rowland2014**, https://doi.org/10.1037/a0037559: "initial recall tests yielding larger testing benefits than recognition tests" (meta-analysis of testing vs restudy, mostly adult lab studies; retention-sources.json)
  - **adesope2017**, https://doi.org/10.3102/0034654316689306: "practice tests are more beneficial for learning than restudying and all other comparison conditions" (meta-analysis, school to adult learners; retention-sources.json)
  - **yang2021**, https://doi.org/10.1037/bul0000309: "overall testing (quizzing) raises student academic achievement to a medium extent (g = 0.499)" (meta-analysis of 222 classroom studies; retention-sources.json)
  - **lyle2011**, https://doi.org/10.1177/0098628311401587: "Exam scores were significantly and substantially higher in a section of the course taught with the PUREMEM procedure" (undergraduate course, end-of-lecture retrieval; retention-sources.json)
- *Verdict:* **strong**.
- *Code vs evidence:* Matches. Retrieval rather than rereading, with feedback, at the end of a learning episode.

**2. End-of-day enforcer, which also takes in the day's unchosen session enforcers**
- *Where:* services/enforcers.js:704-716; services/retention-params.js:50 (day: 9.5%, 10-min cap, horizon 3.5 d, min lag 30 min)
- *What it does:* "End day session" offers one enforcer for the whole day. Session enforcers still waiting that day are merged into it, so the learner gets one sitting, not several. A topic must be at least 30 minutes past its last exposure to be first in line.
- *Evidence:*
  - **karpicke2011spaced**, https://doi.org/10.1037/a0023436: "Repeated retrieval with long intervals between each test produced a 200% improvement in long-term retention" (college students, foreign-vocabulary pairs, lab; retention-sources.json)
  - **karpicke2007**, https://doi.org/10.1037/0278-7393.33.4.704: "Delaying the first test improved long-term retention, regardless of how the repeated tests were spaced." (college students, word pairs, lab; retention-sources.json)
  - **rawson2011**, https://doi.org/10.1037/a0023956: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals" (533 college students, key-term definitions; retention-sources.json)
  - **cepeda2009**, https://doi.org/10.1027/1618-3169.56.4.236: "confirm the importance of cumulative reviews to promote retention over meaningful time periods" (adults, verbal materials, gaps and tests up to months; retention-sources.json)
- *Verdict:* **moderate**. A second retrieval later the same day is spaced retrieval at a short lag. The evidence supports spacing between tests, and delaying the first test. No study tests "30 minutes" or "end of day" as such.
- *Code vs evidence:* Matches the direction. The 30-minute lag and the 3.5-day horizon are design choices.

**3. Tier menu (quick, medium, full, none) with a preselected default**
- *Where:* services/enforcers.js:386-425 (options, defaultTier); services/retention-params.js:67; public/js/enforcer.js:79
- *What it does:* The learner picks quick, medium, full or none. Medium is preselected. Full is preselected when 2 or more topics were last answered wrong, or when mean recall at the horizon is under 0.75. Quick is preselected for a session under 15 minutes, or after 3 quick choices in a row. "None" is always there.
- *Evidence:*
  - **jachimowicz2019**, https://doi.org/10.1017/bpp.2018.43: "a considerable influence of defaults ( d = 0.68, 95% confidence interval = 0.53-0.83)" (meta-analysis of default studies, many domains (not learning apps); retention-sources.json)
  - **johnson2003**, https://doi.org/10.1126/science.1091721: "finding large effects that significantly increase donation rates" (national organ-donor consent policies; retention-sources.json)
  - **patall2008**, https://doi.org/10.1037/0033-2909.134.2.270: "providing choice enhanced intrinsic motivation, effort, task performance, and perceived competence" (meta-analysis, children and adults; retention-sources.json)
  - **ryan2000**, https://doi.org/10.1037/0003-066X.55.1.68: "three innate psychological needs--competence, autonomy, and relatedness" (theory review; retention-sources.json)
  - **trumbo2016**, https://doi.org/10.1037/xap0000082: "students were much more likely to take advantage of quizzing if it was a required course component" (large, diverse college course; retention-sources.json)
- *Verdict:* **moderate**. Defaults and choice both have meta-analytic support, but in other domains. Optional quizzes are taken much less than required ones, which is why a default is needed. The thresholds (2 wrong, 0.75, 15 min, 3 in a row) are design choices.
- *Code vs evidence:* Matches. The thresholds are unvalidated, and the default-tier experiment in RETENTION-ENFORCER-EVIDENCE.md section 12.3 is the test.

**4. Full tier capped at 9.5% of covered active time; quick and medium at 0.35 and 0.65 of full**
- *Where:* services/retention-params.js:27 (FULL_CAP 0.095), :37 (multipliers), :190-196 (budgetMs); services/enforcers.js:370-386 (a tier that cannot fit one question is not offered)
- *What it does:* Budget = tier multiplier x min(scope share x covered active time, scope cap), never above 0.095 x covered time. The owner's rule is "full under 10%"; 0.095 leaves a margin for slow answers.
- *Evidence:*
  - **rohrer2007pashler**, https://doi.org/10.1111/j.1467-8721.2007.00500.x: "immediate further study of the same material is an inefficient use of time" (review of spacing and overlearning studies; retention-sources.json)
  - **rawson2011**, https://doi.org/10.1037/a0023956: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals" (533 college students, key-term definitions; retention-sources.json)
  - **rohrer2006**, https://doi.org/10.1002/acp.1266: "long-term retention was boosted by distributed practise and unaffected by overlearning" (college students, maths problems; retention-sources.json)
  - **lindsey2014**, https://doi.org/10.1177/0956797613504302: "personalized review yielded a 16.5% boost in course retention over current educational practice (massed study)" (middle-school Spanish course, time-matched; retention-sources.json)
- *Verdict:* **design choice**. The principle is supported: short spaced retrieval buys more retention per minute than extra study now, and relearning sessions cost few trials. No study sets 10%, 9.5%, 0.35 or 0.65.
- *Code vs evidence:* Matches the principle. The numbers are owner rules and assumptions.

**5. Per-scope budget shares and caps**
- *Where:* services/retention-params.js:48-55
- *What it does:* Full shares and caps are: session 9.5% / 8 min, day 9.5% / 10 min, semi-weekly 6% / 12 min, weekly 5% / 15 min, bi-weekly 4% / 15 min, monthly 3% / 20 min. Shares fall as the window grows, because a wider window holds more study time.
- *Evidence:*
  - **cepeda2009**, https://doi.org/10.1027/1618-3169.56.4.236: "confirm the importance of cumulative reviews to promote retention over meaningful time periods" (adults, verbal materials, gaps and tests up to months; retention-sources.json)
  - **rawson2011**, https://doi.org/10.1037/a0023956: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals" (533 college students, key-term definitions; retention-sources.json)
  - **lyle2020**, https://doi.org/10.1007/s10648-019-09489-x: "Across-semester retention benefited exclusively from increasing spacing." (college precalculus course; retention-sources.json)
  - **sievertsen2016**, https://doi.org/10.1073/pnas.1516947113: "for every hour later in the day, test performance decreases by 0.9% of an SD" (Danish national tests, children aged 8-15; retention-sources.json)
- *Verdict:* **design choice**. The evidence supports several cumulative spaced reviews, spacing over amount, and short sittings (fatigue builds over the day). It does not set any of these percentages or minute caps.
- *Code vs evidence:* No study to match. Tune them from telemetry, as RETENTION-ENFORCER-EVIDENCE.md section 12.1 describes.

**6. 20-minute daily cap across all enforcers**
- *Where:* services/retention-params.js:47; services/enforcers.js:352-367 (spentToday, budgetFor)
- *What it does:* Each day, enforcer time is capped at 20 minutes in total. A later enforcer gets only what is left of the cap.
- *Evidence:*
  - **sievertsen2016**, https://doi.org/10.1073/pnas.1516947113: "for every hour later in the day, test performance decreases by 0.9% of an SD" (Danish national tests, children aged 8-15; retention-sources.json)
  - **rohrer2007pashler**, https://doi.org/10.1111/j.1467-8721.2007.00500.x: "immediate further study of the same material is an inefficient use of time" (review of spacing and overlearning studies; retention-sources.json)
  - **lyle2020**, https://doi.org/10.1007/s10648-019-09489-x: "Across-semester retention benefited exclusively from increasing spacing." (college precalculus course; retention-sources.json)
- *Verdict:* **design choice**. The sources support the direction: fatigue, low returns from more same-day practice, spacing over amount. They do not support the number 20.
- *Code vs evidence:* Fine as a guard. Log how often the cap binds.

**7. Active-time clock that sizes every budget**
- *Where:* services/study-sessions.js:9-23 (rules), :33-37, :87 (idle_cap_ms 5 min), :111-117 (auto-end); services/retention-params.js:46
- *What it does:* Covered time is active time, not wall-clock time. It counts heartbeats every 30 seconds and every answer. A gap counts at most 5 minutes. A running session ends itself after 30 idle minutes; a paused one ends at the local day change or after 12 hours.
- *Evidence:*
  - **kovanovic2016**, https://doi.org/10.18608/jla.2015.23.6: "our findings indicate that time-on-task estimation methods play an important role in shaping the final study results" (two university course log datasets (online and blended); new, verified today)
  - **nguyen2020tot**, https://doi.org/10.1145/3375462.3375538: "what can be considered as outliers in time-on-task depends on the learning pattern of each student" (university course log data (LAK 2020, peer-reviewed proceedings); new, verified today)
  - **rotelli2022**, https://doi.org/10.1145/3506860.3506913: "data pre-processing decisions have an impact on the analysis’ outcomes and can lead to inaccurate predictions" (university LMS data (LAK 2022, peer-reviewed proceedings); new, verified today)
  - **goldhammer2014**, https://doi.org/10.1037/a0034716: "the relation may be negative if working more fluently, and thus faster, reflects higher skill level" (1,020 adults aged 16-65, PIAAC field test; scorecard-sources.json)
- *Verdict:* **design choice**. Learning-analytics studies show that how time-on-task is estimated, and how idle gaps are trimmed, changes results. They argue for per-student and per-task thresholds rather than one fixed cut-off. No study sets 5 or 30 minutes for this.
- *Code vs evidence:* Partly. One fixed 5-minute idle cap is the simple method those papers criticise; per-learner trimming is possible later. The risk is small, because budgets only scale with this time.


### B. The calendar

**8. Semi-weekly enforcer on strict 3/4/3/4-day gaps from the anchor**
- *Where:* services/retention-schedule.js:44 (isSemiweekly: day % 7 is 3 or 0), :11-12
- *What it does:* Semi-weekly enforcers fall on days 3, 7, 10, 14, 17, ... from the learner's first study day. Each covers the days since the last one.
- *Evidence:*
  - **cepeda2006**, https://doi.org/10.1037/0033-2909.132.3.354: "the ISI producing maximal retention increased as retention interval increased" (meta-analysis, 839 assessments of verbal recall; retention-sources.json)
  - **cepeda2008**, https://doi.org/10.1111/j.1467-9280.2008.02209.x: "the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10%" (over 1,350 adults online, facts, tests up to 1 year; retention-sources.json)
  - **kim2019bigdata**, https://doi.org/10.3758/s13428-018-1184-7: "the optimal amount of spacing between repeated retrieval events increased as the retention interval increased" (10,514 adults, naturally occurring workplace training data; retention-sources.json)
  - **cepeda2009**, https://doi.org/10.1027/1618-3169.56.4.236: "An optimal gap improved final recall by up to 150%." (adults, verbal materials, gaps and tests up to months; retention-sources.json)
- *Verdict:* **design choice**. The best gap grows with the retention interval: about 20-40% of a 1-week horizon. A 3-4-day gap is 43-57% of a week, a little long, which is the side the curve penalises least [cepeda2009]. The exact 3/4/3/4 pattern is the owner's rule.
- *Code vs evidence:* Roughly on the evidence ridge. No study picks 3/4/3/4.

**9. Weekly enforcer every 7 days, absorbing that day's semi-weekly**
- *Where:* services/retention-schedule.js:45, :98-109 (typesOn, absorbed)
- *What it does:* A weekly enforcer falls on days 7, 14, 21, ... On those days the weekly is the one enforcer, and it covers the week, the semi-week and the day.
- *Evidence:*
  - **cepeda2008**, https://doi.org/10.1111/j.1467-9280.2008.02209.x: "the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10%" (over 1,350 adults online, facts, tests up to 1 year; retention-sources.json)
  - **latimier2021**, https://doi.org/10.1007/s10648-020-09572-8: "a strong benefit of spaced retrieval practice in comparison with massed retrieval practice ( g = 0.74)" (meta-analysis of spaced retrieval studies; retention-sources.json)
  - **kang2014**, https://doi.org/10.3758/s13423-014-0636-z: "the expanding schedule yielded much higher average recallability over the whole training period" (adults, long-term retrieval practice; retention-sources.json)
  - **karpicke2011spaced**, https://doi.org/10.1037/a0023436: "Repeated retrieval with long intervals between each test produced a 200% improvement in long-term retention" (college students, foreign-vocabulary pairs, lab; retention-sources.json)
- *Verdict:* **design choice**. Spaced retrieval beats massed retrieval (g = 0.74), and long gaps between tests beat short ones. A 7-day gap is about 23% of a 1-month horizon, inside the ridge.
- *Code vs evidence:* Matches the direction. The 7-day period is an owner rule.

**10. Bi-weekly enforcer on days 12, 26, 40, ...**
- *Where:* services/retention-schedule.js:46 (d % 14 === 12), :16-18
- *What it does:* Bi-weekly enforcers fall every 14 days, offset so there is a free day between them and the nearest semi-weekly and weekly. Each covers the 14 days ending on its day.
- *Evidence:*
  - **cepeda2009**, https://doi.org/10.1027/1618-3169.56.4.236: "confirm the importance of cumulative reviews to promote retention over meaningful time periods" (adults, verbal materials, gaps and tests up to months; retention-sources.json)
  - **karpicke2011spaced**, https://doi.org/10.1037/a0023436: "there was no evidence that a particular relative spacing schedule (expanding, equal, or contracting) was inherently superior to another" (college students, foreign-vocabulary pairs, lab; retention-sources.json)
  - **latimier2021**, https://doi.org/10.1007/s10648-020-09572-8: "no significant difference between expanding and uniform spacing schedules of retrieval practice ( g = 0.034)" (meta-analysis of spaced retrieval studies; retention-sources.json)
- *Verdict:* **design choice**. What matters is absolute spacing and cumulative review. Expanding, equal or contracting relative schedules do not differ reliably. So the offset that puts it on day 12 rather than day 14 has no evidential cost, and no evidence for it either.
- *Code vs evidence:* Neutral. The offset is purely an owner rule.

**11. Monthly enforcer on a free "pocket" day within 3 days of day 30m**
- *Where:* services/retention-schedule.js:73-96 (monthlyDay, isMonthly), :19-26
- *What it does:* The monthly picks the day within +/-3 of each 30th day that has no other enforcer and whose nearest neighbour is the easiest one. It covers the days since the last monthly, 24 to 36 days.
- *Evidence:*
  - **cepeda2008**, https://doi.org/10.1111/j.1467-9280.2008.02209.x: "the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10%" (over 1,350 adults online, facts, tests up to 1 year; retention-sources.json)
  - **rawson2011**, https://doi.org/10.1037/a0023956: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals" (533 college students, key-term definitions; retention-sources.json)
  - **kim2019bigdata**, https://doi.org/10.3758/s13428-018-1184-7: "the optimal amount of spacing between repeated retrieval events increased as the retention interval increased" (10,514 adults, naturally occurring workplace training data; retention-sources.json)
- *Verdict:* **design choice**. A 30-day gap is about 8% of a 1-year horizon, inside the 5-10% band. Successive relearning recommends widely spaced relearning sessions. The pocket-day rule is the owner's.
- *Code vs evidence:* Matches the long-horizon ridge. The pocket-day rule is not evidence-based.

**12. Absorption into one combined enforcer, with budget = largest part + 0.5 x the others**
- *Where:* services/retention-schedule.js:28-33, :182-188 (combinedWindow); services/retention-params.js:205-218 (combinedBudgetMs), :78 (others_weight 0.5); services/enforcers.js:330-341
- *What it does:* When enforcers share a day, one plan covers the union of their windows, with no per-scope quota. Its full budget is the largest part's budget plus 0.5 x the rest, capped at the largest cap and at 9.5% of the union's time.
- *Evidence:*
  - **rawson2011**, https://doi.org/10.1037/a0023956: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals" (533 college students, key-term definitions; retention-sources.json)
  - **vaughn2016**, https://doi.org/10.3758/s13421-016-0606-y: "to a higher initial criterion during the first session do not persist across relearning sessions" (college students, word pairs, lab; retention-sources.json)
  - **rawson2013relearn**, https://doi.org/10.1037/a0030498: "The benefits of initial spacing were substantial prior to relearning but were significantly attenuated after relearning." (college students, lab; retention-sources.json)
  - **lyle2020**, https://doi.org/10.1007/s10648-019-09489-x: "Across-semester retention benefited exclusively from increasing spacing." (college precalculus course; retention-sources.json)
- *Verdict:* **design choice**. Evidence supports the direction: one correct retrieval per topic per relearning session is the efficient dose, and extra same-sitting tries fade once relearning follows. The weight 0.5 is an assumption.
- *Code vs evidence:* Matches the direction. The 0.5 is untested.

**13. Cumulative windows, and questions only from the covered window**
- *Where:* services/retention-schedule.js:168-180 (windowFor); services/enforcers.js:89-112 (windowItems)
- *What it does:* Each larger scope covers a larger cumulative window: since the last one of its kind, or 14 days for the bi-weekly. No question comes from outside that window; older work stays with the daily review.
- *Evidence:*
  - **mayfield2002**, https://doi.org/10.1901/jaba.2002.35-105: "the cumulative group outscored the other groups on application and problem-solving items" (college students, maths rules; retention-sources.json)
  - **khanna2013**, https://doi.org/10.1177/0098628313487458: "Students completing courses with cumulative finals retained more than students who took noncumulative finals." (college psychology courses; retention-sources.json)
  - **lawrence2013**, https://doi.org/10.1177/0098628312465858: "low-scoring students remembered more of the course material when they took cumulative exams throughout the semester" (introductory psychology course; retention-sources.json)
  - **szpunar2007**, https://doi.org/10.3758/BF03193473: "subjects benefited more from initial testing when they also knew they would need to remember the information" (college students, word lists, lab; retention-sources.json)
  - **cepeda2009**, https://doi.org/10.1027/1618-3169.56.4.236: "confirm the importance of cumulative reviews to promote retention over meaningful time periods" (adults, verbal materials, gaps and tests up to months; retention-sources.json)
- *Verdict:* **moderate**. Cumulative practice and cumulative exams improve retention, most for weaker students. Expecting a cumulative test raises what earlier testing does.
- *Code vs evidence:* Matches. The "only from the window" rule is the owner's. Coverage of older work depends on the daily review (mechanism 34).

**14. Retention calendar page (done, none, missed, due, nothing to cover)**
- *Where:* services/enforcers.js:1077-1135 (calendar); routes/retention.js:133; public/js/calendar.js
- *What it does:* A month view shows each day's scheduled enforcer, what it absorbs, and how it went.
- *Evidence:*
  - **harkin2016**, https://doi.org/10.1037/bul0000025: "promoted goal attainment (d+ = 0.40, 95% CI [0.32, 0.48])" (meta-analysis, 138 studies, N = 19,951, mostly health goals; new, verified today)
  - **wissman2012**, https://doi.org/10.1080/09658211.2012.687052: "do not typically implement or understand the benefits of practising with longer lags (timing of practice)" (college students, survey and lab; retention-sources.json)
  - **kornell2009cram**, https://doi.org/10.1002/acp.1537: "spacing was more effective than massing for 90% of the participants, yet after the first study session, 72% of the participants believed" (college students, vocabulary flashcards; retention-sources.json)
  - **bjork2013**, https://doi.org/10.1146/annurev-psych-113011-143823: "people often have a faulty mental model of how they learn and remember" (review; scorecard-sources.json)
- *Verdict:* **moderate**. Learners do not schedule long lags themselves, and believe massing works. Monitoring progress toward a goal raises attainment, d+ = 0.40, but mostly in health studies. Physically recording progress made the effect larger.
- *Code vs evidence:* Matches. It is a record, not a goal, so the harkin2016 effect is an analogy.

**15. Unchosen and unfinished enforcers are offered again; validity 24 h (session) and 48 h (day); "none" keeps items due**
- *Where:* services/enforcers.js:735-747 (expire), :808-822 (offers), :828 (reopen), :966-990 (decline, skip); services/retention-params.js:68
- *What it does:* An enforcer left unchosen or half done is offered once on return. Unanswered items are re-scored, and answered ones are never re-asked. Choosing "none" marks nothing as reviewed, so the items come back.
- *Evidence:*
  - **trumbo2016**, https://doi.org/10.1037/xap0000082: "students were much more likely to take advantage of quizzing if it was a required course component" (large, diverse college course; retention-sources.json)
  - **kornell2009spacing**, https://doi.org/10.1080/09658210701763899: "being allowed to drop flashcards had small but consistently negative effects on learning" (college students, flashcards; retention-sources.json)
  - **kornell2009son**, https://doi.org/10.1080/09658210902832915: "self-testing was motivated by a desire to diagnose learning rather than a desire to improve learning" (college students; retention-sources.json)
  - **jachimowicz2019**, https://doi.org/10.1017/bpp.2018.43: "a considerable influence of defaults ( d = 0.68, 95% confidence interval = 0.53-0.83)" (meta-analysis of default studies, many domains (not learning apps); retention-sources.json)
- *Verdict:* **design choice**. Optional practice is skipped. Letting learners drop items they feel they know hurt learning. Defaults steer choices. The validity windows are assumptions.
- *Code vs evidence:* Matches the direction.


### C. Which questions an enforcer asks

**16. Selection by predicted forgetting: need = 1 - p_H at the scope's horizon**
- *Where:* services/enforcers.js:246-300 (score), :264-266 (p_now, p_H from adaptation.predictedRecall); services/retention-params.js:48-55 (horizon_days 1 / 3.5 / 7 / 14 / 30 / 60)
- *What it does:* Each topic is scored by how much it is predicted to have faded at the scope's horizon. That is recall predicted 1 day out for a session enforcer, and up to 60 days out for a monthly one.
- *Evidence:*
  - **lindsey2014**, https://doi.org/10.1177/0956797613504302: "personalized review yielded a 16.5% boost in course retention over current educational practice (massed study)" (middle-school Spanish course, time-matched; retention-sources.json)
  - **tabibian2019**, https://doi.org/10.1073/pnas.1815156116: "subject to a cost on the reviewing frequency, the optimal reviewing schedule is given by the recall probability itself" (theory plus a natural experiment on Duolingo data; retention-sources.json)
  - **tabibian2019**, https://doi.org/10.1073/pnas.1815156116: "learners who follow a reviewing schedule determined by our algorithm memorize more effectively than learners who follow alternative schedules" (natural experiment on Duolingo data; retention-sources.json)
  - **mettler2016**, https://doi.org/10.1037/xge0000170: "adaptive scheduling outperformed fixed conditions at immediate and delayed tests of retention" (adults, lab; retention-sources.json)
  - **pavlik2008**, https://doi.org/10.1037/1076-898x.14.2.101: "The optimized condition showed significant benefits with large effect sizes for both improved recall and recall latency." (college students, Japanese-English vocabulary; retention-sources.json)
  - **ye2022**, https://doi.org/10.1145/3534678.3539081: "Experimental results have shown a 12.6% performance improvement over the state-of-the-art methods." (220 million review logs from a vocabulary app; retention-sources.json)
- *Verdict:* **strong**. Converging lab, classroom and app-scale studies favour model-based selection by predicted recall over fixed or generic schedules. Tabibian's optimal reviewing rate is driven by recall probability itself, which is what the need term does.
- *Code vs evidence:* Matches. The horizons are assumptions inside the evidence's direction.

**17. Desirable-difficulty window d(p_now)**
- *Where:* services/enforcers.js:276-279; services/retention-params.js:61 (window lo 0.5, hi 0.9, below 0.6, above 0.3, too_easy 0.95)
- *What it does:* The need is multiplied by d: 1 for 0.50 <= p_now <= 0.90; 0.65 for 0.90 < p_now <= 0.95; 0.6 below 0.50; 0.3 above 0.95.
- *Evidence:*
  - **eglington2020**, https://doi.org/10.1038/s41539-020-00074-4: "the OET 86 and 94 conditions having significantly higher recall performance than the OET 40" (adults on Mechanical Turk, Japanese-English pairs, 22-min practice, test 3 days later (full text PMC7567101); retention-sources.json)
  - **eglington2020**, https://doi.org/10.1038/s41539-020-00074-4: "There was not a significant difference between OETs 94, 86, and 70" (adults on Mechanical Turk (full text PMC7567101); retention-sources.json)
  - **pyc2009**, https://doi.org/10.1016/j.jml.2009.01.004: title-level only: "Does greater difficulty correctly recalling information lead to higher levels of memory?" (college students, lab; retention-sources.json)
  - **fazio2019**, https://doi.org/10.1177/0963721418806673: "the benefits are largest when the initial retrieval practice is effortful but successful" (review of retrieval studies in children; retention-sources.json)
  - **kornell2009**, https://doi.org/10.1037/a0015729: "Unsuccessful retrieval attempts enhanced learning with both types of materials." (college students, lab; retention-sources.json)
  - **wilson2019**, https://doi.org/10.1038/s41467-019-12552-4: "the optimal training accuracy is about 85%" (computational model and simulations, not learners; retention-sources.json)
- *Verdict:* **moderate**. With time costs counted, practising at a predicted recall of 0.86 or 0.94 beat 0.40 and 0.98; 0.70 did not differ from 0.86 or 0.94. Failed retrievals still teach when feedback follows. So down-weighting p < 0.5 and p > 0.95 is supported. Eglington is one within-session vocabulary study of adults, with a 3-day test.
- *Code vs evidence:* Gap. The 0.65 step for 0.90-0.95 penalises the region Eglington found efficient; see proposal P1. The params file does not list the 0.65 step at all.

**18. Score flags: last answer wrong +0.30, confident error +0.25, right but slow or unsure +0.20, no delayed retrieval yet +0.15**
- *Where:* services/enforcers.js:280-288; services/retention-params.js:62
- *What it does:* Topics the learner got wrong, got wrong while sure, got right only slowly or unsurely, or has never retrieved after a delay move up the queue.
- *Evidence:*
  - **pashler2005**, https://doi.org/10.1037/0278-7393.31.1.3: "Supplying the correct answer after an incorrect response not only improved performance during the initial learning session--it also increased final retention by 494%." (college students, foreign-word pairs, lab; retention-sources.json)
  - **butterfield2001**, https://doi.org/10.1037/0278-7393.27.6.1491: "highly confident errors were the most likely to be corrected in a subsequent retest" (adults, general-knowledge questions; retention-sources.json)
  - **metcalfe2017**, https://doi.org/10.1146/annurev-psych-010416-044022: "errorful learning followed by corrective feedback is beneficial to learning" (review; retention-sources.json)
  - **butler2008**, https://doi.org/10.1037/0278-7393.34.4.918: "feedback also doubled the retention of correct low-confidence responses, relative to providing no feedback" (college students, general-knowledge multiple choice; retention-sources.json)
  - **karpicke2007**, https://doi.org/10.1037/0278-7393.33.4.704: "Delaying the first test improved long-term retention, regardless of how the repeated tests were spaced." (college students, word pairs, lab; retention-sources.json)
- *Verdict:* **moderate**. Corrections matter most after errors. Confident errors are hypercorrected. Feedback doubles retention of low-confidence correct answers. A delayed first retrieval helps. The weights are assumptions.
- *Code vs evidence:* Matches the direction. Two flags in the params file, "left out last time" and "prerequisite", are not built (see P5). Neither is the "within 14 days" limit on last-wrong.

**19. Defaults with no record: p_now 0.5, p_H 0.4; skill-only units p_H = 0.85 x mastery**
- *Where:* services/enforcers.js:257-258, :271-275
- *What it does:* A topic with no objective record is treated as a coin-flip. A topic known only at skill level uses its mastery as p_now, and 0.85 of that at the horizon.
- *Evidence:*
  - **eglington2023**, https://doi.org/10.1007/s40593-022-00296-0: "learner models assuming equal learning rates for students will inevitably lead to systematic errors that result in suboptimal pedagogical decisions" (simulation plus six large educational datasets; new, verified today)
  - **zerr2018**, https://doi.org/10.1177/0956797618772540: "quicker learners were also more durable learners (i.e., exhibited better retention across a delay)" (adults, N = 281 and N = 92; scorecard-sources.json)
  - **sense2016**, https://doi.org/10.1111/tops.12183: "We demonstrate that they are stable over time but not across materials." (adults, repeated lab sessions; retention-sources.json)
- *Verdict:* **design choice**. Learners differ in learning rate and forgetting, and population or rule-of-thumb parameters cause systematic errors. That argues for replacing these defaults with the learner's own data quickly. It does not set 0.5, 0.4 or 0.85.
- *Code vs evidence:* Fallback only. Labelled as an assumption in RETENTION-ENFORCER-EVIDENCE.md section 11.

**20. Soft eligibility: minimum lag (5 min session, 30 min day, 1 day scheduled) and "kept in the last 20 hours" go last**
- *Where:* services/enforcers.js:226-233 (recentlyKept), :296-299; services/retention-params.js:49-54, :63
- *What it does:* A topic still inside its minimum lag, or answered right in another enforcer in the last 20 hours, is not dropped. It sorts after the eligible ones, so a short window still has questions.
- *Evidence:*
  - **karpicke2007**, https://doi.org/10.1037/0278-7393.33.4.704: "Delaying the first test improved long-term retention, regardless of how the repeated tests were spaced." (college students, word pairs, lab; retention-sources.json)
  - **karpicke2011spaced**, https://doi.org/10.1037/a0023436: "Repeated retrieval with long intervals between each test produced a 200% improvement in long-term retention" (college students, foreign-vocabulary pairs, lab; retention-sources.json)
  - **cepeda2009**, https://doi.org/10.1027/1618-3169.56.4.236: "An optimal gap improved final recall by up to 150%." (adults, verbal materials, gaps and tests up to months; retention-sources.json)
  - **pyc2007**, https://doi.org/10.3758/BF03192925: "the efficiency of the various schedules depended critically on the interval between presentations of an item" (college students, Swahili-English pairs, lab; retention-sources.json)
- *Verdict:* **moderate**. Delaying the first test, and leaving long intervals between repeated tests, improve retention. Gaps that are too short cost more than gaps a little too long. The lag values and the 20 hours are assumptions.
- *Code vs evidence:* Matches the direction.

**21. Greedy fill by value per planned second, with a cost model per format**
- *Where:* services/enforcers.js:132-163 (costModel, costOf), :312-341 (fillOrder, slots), :583-597; services/retention-params.js:38-45
- *What it does:* Slots are ranked by score per planned second and taken until the budget is spent. Planned time is the format time plus expected feedback, and the expected retry on medium and full. Format times are MC 20 s, cloze 25 s, typed 35 s and problem 60 s; feedback is 3 s right, 25 s wrong. After 20 answers in a format, the learner's own median replaces the default.
- *Evidence:*
  - **pavlik2008**, https://doi.org/10.1037/1076-898x.14.2.101: "the item is at the spacing interval where long-term gain per unit of practice time is maximal" (college students, Japanese-English vocabulary; retention-sources.json)
  - **eglington2020**, https://doi.org/10.1038/s41539-020-00074-4: "with up to 40% more items recalled in conditions where practice was scheduled optimally according to the model" (adults on Mechanical Turk, Japanese-English pairs, 22-min practice, test 3 days later; retention-sources.json)
  - **lindsey2014**, https://doi.org/10.1177/0956797613504302: "personalized review yielded a 16.5% boost in course retention over current educational practice (massed study)" (middle-school Spanish course, time-matched; retention-sources.json)
- *Verdict:* **moderate**. Optimal schedulers that count the time cost of failures beat conventional ones. The time constants are assumptions.
- *Code vs evidence:* Matches. Time per format is calibrated from the learner.

**22. Allocation: one first try per topic; a second, varied try only for fragile topics on medium and full, worth 0.35 of a first**
- *Where:* services/enforcers.js:290-295 (fragile, mature), :330-341 (slots); services/retention-params.js:72-79
- *What it does:* Fragile means the last answer was wrong, p_now is under 0.50, or a third or more of 2+ answers were wrong. Mature means 3+ delayed checks, p_now >= 0.90 and the last answer right; mature topics never get a second try. Session enforcers stay at one try per topic.
- *Evidence:*
  - **rawson2011**, https://doi.org/10.1037/a0023956: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals" (533 college students, key-term definitions; retention-sources.json)
  - **vaughn2016**, https://doi.org/10.3758/s13421-016-0606-y: "to a higher initial criterion during the first session do not persist across relearning sessions" (college students, word pairs, lab; retention-sources.json)
  - **pyc2007**, https://doi.org/10.3758/BF03192925: "it was particularly effective for learning initially incorrect items" (college students, Swahili-English pairs, lab; retention-sources.json)
  - **vaughn2013**, https://doi.org/10.3758/s13423-013-0434-z: "equating retrieval success during practice did not eliminate normative item difficulty differences" (college students, word pairs, lab; retention-sources.json)
  - **butler2017**, https://doi.org/10.1037/xap0000142: "variability during retrieval practice produced superior transfer of knowledge to new examples" (college students, four experiments; retention-sources.json)
  - **rawson2020end**, https://doi.org/10.1007/s10648-020-09528-y: "final test performance showed a significant but only small advantage of successive relearning over single-session learning" (college students, maths procedures; retention-sources.json)
- *Verdict:* **moderate**. One correct per relearning session is the efficient dose. Extra tries belong to items that missed. Hard items stay hard at equal recalls. A varied second try transfers better. For maths procedures, relearning beats one session by only d = 0.28. The 0.35 value, the cap of 2 and the thresholds are assumptions.
- *Code vs evidence:* Matches the direction.

**23. Drop-out retries: quick 1 attempt, medium 2, full until right (at most 3), on a different question at least 3 items later**
- *Where:* services/retention-params.js:57-58; services/enforcers.js:841-885 (afterAnswer)
- *What it does:* After a miss, while the tier allows and the budget holds, the topic comes back on a different question at least 3 questions later. It is never the skill bank's off-grade question.
- *Evidence:*
  - **pyc2007**, https://doi.org/10.3758/BF03192925: "it was particularly effective for learning initially incorrect items" (college students, Swahili-English pairs, lab; retention-sources.json)
  - **higham2022**, https://doi.org/10.1037/edu0000693: "Recall Of Course Material At The End Of The Semester Was Better For Relearning Compared With Restudying." (undergraduate psychology course; retention-sources.json)
  - **karpicke2011spaced**, https://doi.org/10.1037/a0023436: "Repeated retrieval with long intervals between each test produced a 200% improvement in long-term retention" (college students, foreign-vocabulary pairs, lab; retention-sources.json)
  - **pashler2005**, https://doi.org/10.1037/0278-7393.31.1.3: "Supplying the correct answer after an incorrect response not only improved performance during the initial learning session--it also increased final retention by 494%." (college students, foreign-word pairs, lab; retention-sources.json)
- *Verdict:* **moderate**. Drop-out schedules match fixed ones in fewer trials and help most with initially wrong items. Relearning to criterion beat restudy in a course. Spacing the repeats inside a sitting helps.
- *Code vs evidence:* Matches. "3 items later" is an assumption.

**24. Interleave by skill inside the sitting**
- *Where:* services/adaptation.js:414-421 (interleave: round-robin by skill); services/enforcers.js:606; services/review-session.js (via reviewQueue)
- *What it does:* Neighbouring questions differ in skill where possible, keeping the order within each skill.
- *Evidence:*
  - **rohrer2015**, https://doi.org/10.1037/edu0000001: "interleaved practice produced higher scores on both the immediate and delayed tests (Cohen’s ds 0.42 and 0.79" (grade-7 maths classes; retention-sources.json)
  - **rohrer2020**, https://doi.org/10.1037/edu0000367: "the interleaved group outscored the blocked group, 61% versus 38%, d = 0.83" (grade-7 maths classes, randomized trial; retention-sources.json)
  - **brunmair2019**, https://doi.org/10.1037/bul0000209: "A multilevel meta-analysis revealed a moderate overall interleaving effect (Hedges’ g = 0.42)." (meta-analysis of interleaving; retention-sources.json)
  - **brunmair2019**, https://doi.org/10.1037/bul0000209: "An advantage of blocking compared with interleaving was found for studies based on words ( g = -0.39)." (meta-analysis of interleaving; retention-sources.json)
  - **firth2021**, https://doi.org/10.1002/rev3.3266: "transfer (as tested by presenting novel items from a learned category) a benefit" (systematic review, concept learning; retention-sources.json)
- *Verdict:* **mixed**. Strong for maths and concepts (classroom RCT d = 0.83), but blocking beat interleaving for word materials (g = -0.39). Round-robin by skill does not deliberately pair look-alike words, which is the safe reading for vocabulary.
- *Code vs evidence:* Matches the safe reading. Confusable pairing for maths and concepts is not built.

**25. Session scope asks the oldest-exposed topics first**
- *Where:* services/enforcers.js:605
- *What it does:* In an end-of-session enforcer, first tries go oldest last-exposure first, so the start of the session gets the longest lag.
- *Evidence:*
  - **karpicke2007**, https://doi.org/10.1037/0278-7393.33.4.704: "Delaying the first test improved long-term retention, regardless of how the repeated tests were spaced." (college students, word pairs, lab; retention-sources.json)
  - **karpicke2011spaced**, https://doi.org/10.1037/a0023436: "Repeated retrieval with long intervals between each test produced a 200% improvement in long-term retention" (college students, foreign-vocabulary pairs, lab; retention-sources.json)
  - **pyc2007**, https://doi.org/10.3758/BF03192925: "the efficiency of the various schedules depended critically on the interval between presentations of an item" (college students, Swahili-English pairs, lab; retention-sources.json)
- *Verdict:* **moderate**. A longer delay before the first retrieval improves long-term retention, and an item's efficiency depends critically on the interval between its presentations.
- *Code vs evidence:* Matches.

**26. Close on a question the curve expects right (p_now >= 0.8)**
- *Where:* services/enforcers.js:610-611; services/retention-params.js:64 (close_easy_at 0.8)
- *What it does:* The last question of a sitting is one the learner is likely to get right.
- *Evidence:*
  - **finn2010**, https://doi.org/10.1037/a0020605: "An extremely effortful study episode extended by a more moderate interval was preferred to a shorter, unextended interval" (college students, effortful vocabulary study, lab; new, verified today)
  - **finn2016**, https://doi.org/10.1037/xlm0000150: "a challenging test episode extended by a more moderate interval was preferred to an unextended interval" (adults, difficult maths tests, five experiments; new, verified today)
  - **kahneman1993**, https://doi.org/10.1111/j.1467-9280.1993.tb00589.x: "such evaluations are often dominated by the discomfort at the worst and at the final moments of episodes" (adults, cold-pressor task; new, verified today)
  - **fredrickson1993**, https://doi.org/10.1037/0022-3514.65.1.45: "Retrospective evaluations appear to be determined by a weighted average of "snapshots" of the actual affective experience" (adults, film clips (32 and 96 participants); new, verified today)
- *Verdict:* **design choice**. An episode that ends on an easier stretch is remembered as less unpleasant and is chosen again, including effortful study and maths tests. This supports coming back, not retention itself. No study sets 0.8.
- *Code vs evidence:* Matches the purpose: willingness to take the next enforcer. It costs one slot of ordering, not extra time.

**27. A new question instance each time; a varied second try; never the learner's own check as "varied"**
- *Where:* services/enforcers.js:438-481 (ownCheck, questionFor)
- *What it does:* An enforcer uses a question written for the objective first, then the bank's question on the skill, then, as a last resort, the learner's own window check. A second try must be a new question on the same objective, or there is none.
- *Evidence:*
  - **butler2017**, https://doi.org/10.1037/xap0000142: "variability during retrieval practice produced superior transfer of knowledge to new examples" (college students, four experiments; retention-sources.json)
  - **pan2018**, https://doi.org/10.1037/bul0000151: "testing can yield transferrable learning as measured relative to a nontesting reexposure control condition (d = 0.40" (meta-analysis of transfer of testing; retention-sources.json)
  - **agarwal2019**, https://doi.org/10.1037/edu0000282: "higher order and mixed quizzes improved higher order test performance, but fact quizzes did not" (college students; retention-sources.json)
  - **yeo2019**, https://doi.org/10.1037/edu0000268: "repeated testing was as effective as repeated studying with nonidentical learning problems" (college students, maths procedure, 1-week test; retention-sources.json)
  - **pan2019clicker**, https://doi.org/10.1187/cbe.18-12-0248: "Benefits of jargon quizzing did not consistently generalize, however, to exam questions that assessed conceptual knowledge" (college biology course; retention-sources.json)
- *Verdict:* **moderate**. Varied retrieval transfers better, testing transfers (d = 0.40), and fact-only quizzes do not reach higher-order tests. Only multiple-choice objective items exist today, so "varied" is a new example, not a new format.
- *Code vs evidence:* Partly. Varied formats (explain, worked-example completion) are not built.


### D. What counts as kept, and stakes

**28. A "kept" answer is first try, unaided, not rapid (< 1200 ms) and machine-graded; only answers at a lag of 1 day or more are memory checks**
- *Where:* services/coverage.js:96 (RETAIN_DAYS 1), :102 (OBJ_RAPID_MS 1200), :439, :459-460; services/retention-params.js:49-54 (spaced flag per scope)
- *What it does:* Answers faster than 1.2 s are rapid guesses and are not evidence. Session and day enforcers feed in-sitting evidence. Only answers a day or more after the last practice count as memory checks.
- *Evidence:*
  - **wise2005**, https://doi.org/10.1207/s15324818ame1802_2: "unmotivated examinees will answer too quickly (i.e., before they have time to read and fully consider the item)" (low-stakes computer-based tests; scorecard-sources.json)
  - **wise2017**, https://doi.org/10.1111/emip.12165: "because rapid guesses do not contribute to measurement, it makes little sense to include them in scoring" (review of rapid guessing in computer-based tests; scorecard-sources.json)
  - **wise2006**, https://doi.org/10.1111/j.1745-3984.2006.00002.x: "rapid guessing (i.e., reflecting low examinee effort)" (low-stakes computer-based tests; scorecard-sources.json)
  - **dunlosky2012**, https://doi.org/10.1016/j.learninstruc.2011.08.003: title-level only: "Overconfidence produces underachievement: Inaccurate self evaluations undermine students’ learning and retention" (college students; retention-sources.json)
  - **karpicke2008**, https://doi.org/10.1126/science.1152408: "Repeated studying after learning had no effect on delayed recall, but repeated testing produced a large positive effect." (college students, foreign-vocabulary pairs, lab; retention-sources.json)
- *Verdict:* **moderate**. Rapid guesses reflect disengagement, not knowledge, and should not be scored. Self-assessment is overconfident, so nothing self-scored counts. Delayed tests are what show retention. The 1200 ms threshold is fixed, while the measurement literature often sets thresholds per item.
- *Code vs evidence:* Matches. A per-item rapid threshold would be more exact, but it is outside this section.

**29. Low stakes: enforcer and review sittings are previews that move no level; "none" is never penalised**
- *Where:* services/enforcers.js:634-637 (kind enforcer, preview: true); services/review-session.js:13-16, :201
- *What it does:* Nothing in an enforcer or daily review clears, advances or holds a level. There are no grades or penalties.
- *Evidence:*
  - **khanna2015**, https://doi.org/10.1177/0098628315573144: "Students taking ungraded pop quizzes outperformed students taking graded pop quizzes and students taking no quizzes on the final exam." (introductory psychology course; retention-sources.json)
  - **agarwal2014anx**, https://doi.org/10.1016/j.jarmac.2014.07.002: "72% reported that retrieval practice made them less nervous for unit tests and exams" (1,408 middle and high school students (self-report); retention-sources.json)
  - **smith2016stress**, https://doi.org/10.1126/science.aah5067: "those who learned by retrieval practice were immune to the deleterious effects of stress" (adults, lab stress induction; retention-sources.json)
  - **higham2022**, https://doi.org/10.1037/edu0000693: "Recall Of Course Material At The End Of The Semester Was Better For Relearning Compared With Restudying." (undergraduate psychology course; retention-sources.json)
- *Verdict:* **moderate**. Ungraded quizzes beat graded ones in a course, and students report less test anxiety with retrieval practice (self-report). Retrieval-practised memories hold up under stress.
- *Code vs evidence:* Matches.


### E. The daily review and spaced review

**30. Daily review queue: memory checks first, then fading objectives, then the least durable; lapsed objectives to re-teach**
- *Where:* services/adaptation.js:288-327 (reviewQueue), :724-780 (dailyReview); services/review-session.js:87-131 (planFor)
- *What it does:* Memory checks the gate is waiting on come first, then objectives with predicted recall under 0.90, then those predicted under 0.90 at 30 days. Each gets one question, interleaved by skill.
- *Evidence:*
  - **lindsey2014**, https://doi.org/10.1177/0956797613504302: "personalized review yielded a 16.5% boost in course retention over current educational practice (massed study)" (middle-school Spanish course, time-matched; retention-sources.json)
  - **mettler2016**, https://doi.org/10.1037/xge0000170: "In both experiments, adaptive scheduling outperformed fixed conditions at immediate and delayed tests of retention." (adults, lab; retention-sources.json)
  - **rawson2011**, https://doi.org/10.1037/a0023956: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals" (533 college students, key-term definitions; retention-sources.json)
  - **cepeda2009**, https://doi.org/10.1027/1618-3169.56.4.236: "confirm the importance of cumulative reviews to promote retention over meaningful time periods" (adults, verbal materials, gaps and tests up to months; retention-sources.json)
- *Verdict:* **moderate**. Personalised, model-based review beat massed and generic schedules. Successive relearning and cumulative reviews keep material. The ordering by reason is a design choice.
- *Code vs evidence:* Matches.

**31. Review target: predicted recall 0.90 now (ADAPT_REVIEW_AT) and 0.90 at 30 days (ADAPT_DURABLE_AT, ADAPT_DURABLE_DAYS)**
- *Where:* services/adaptation.js:60, :63-64, :226-239 (durability)
- *What it does:* An objective is reviewed when its predicted recall falls under 0.90. It counts as durable when its predicted recall 30 days on is at least 0.90 of fresh.
- *Evidence:*
  - **eglington2020**, https://doi.org/10.1038/s41539-020-00074-4: "the OET 86 and 94 conditions having significantly higher recall performance than the OET 40" (adults on Mechanical Turk, Japanese-English pairs, 22-min practice, test 3 days later (full text PMC7567101); retention-sources.json)
  - **eglington2020**, https://doi.org/10.1038/s41539-020-00074-4: "There was not a significant difference between OETs 94, 86, and 70" (adults on Mechanical Turk (full text PMC7567101); retention-sources.json)
  - **wozniak1995**, https://doi.org/10.55782/ane-1994-1003: "A universal formula for computing inter-repetition intervals in paired-associate learning has been determined for the knowledge retention level of 95%." (the authors’ own repetition data (abstract claim is the author’s own); scorecard-sources.json)
  - **wilson2019**, https://doi.org/10.1038/s41467-019-12552-4: "the optimal training accuracy is about 85%" (computational model and simulations, not learners; retention-sources.json)
  - **tabibian2019**, https://doi.org/10.1073/pnas.1815156116: "subject to a cost on the reviewing frequency, the optimal reviewing schedule is given by the recall probability itself" (theory plus a natural experiment on Duolingo data; retention-sources.json)
- *Verdict:* **moderate**. Practising at 0.86-0.94 predicted recall was most efficient, and 0.70 did not differ. SuperMemo-type schedules target 95% retention (the author's own claim). 85% is a model result. The exact 0.90 is a design choice that sits inside the efficient band.
- *Code vs evidence:* Matches. Keep 0.90 (see P1).

**32. Rested gate: a review waits at least 12 h after the last answer; a memory check comes at least 1 day after proof**
- *Where:* services/adaptation.js:306-310 (RETAIN_DAYS x 0.5); services/coverage.js:96, :459-460
- *What it does:* No objective is reviewed within 12 hours of its last answer. Proof becomes a memory check only after a day.
- *Evidence:*
  - **bell2014**, https://doi.org/10.1080/09658211.2013.778294: "a 12-hour spacing gap that includes sleep promotes long-term memory retention similar to the 24-hour gap" (adults, lab; retention-sources.json)
  - **karpicke2007**, https://doi.org/10.1037/0278-7393.33.4.704: "Delaying the first test improved long-term retention, regardless of how the repeated tests were spaced." (college students, word pairs, lab; retention-sources.json)
  - **cepeda2006**, https://doi.org/10.1037/0033-2909.132.3.354: "the ISI producing maximal retention increased as retention interval increased" (meta-analysis, 839 assessments of verbal recall; retention-sources.json)
- *Verdict:* **moderate**. A 12-hour gap that includes sleep retained as well as 24 hours, and delaying the first retrieval helps. The 12 h and 1 d values are design choices.
- *Code vs evidence:* Matches. The 12-hour gate is the overnight case only when the 12 h include sleep.

**33. Review budget: 10 minutes at 0.75 min per question, one question per objective**
- *Where:* services/adaptation.js:78-79 (REVIEW_MINUTES, ITEM_MINUTES); services/review-session.js:113-119
- *What it does:* The daily review holds as many single questions as fit in 10 minutes, at least one when any is due. The rest wait for the next day.
- *Evidence:*
  - **rawson2011**, https://doi.org/10.1037/a0023956: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals" (533 college students, key-term definitions; retention-sources.json)
  - **rohrer2007pashler**, https://doi.org/10.1111/j.1467-8721.2007.00500.x: "immediate further study of the same material is an inefficient use of time" (review of spacing and overlearning studies; retention-sources.json)
  - **lindsey2014**, https://doi.org/10.1177/0956797613504302: "personalized review yielded a 16.5% boost in course retention over current educational practice (massed study)" (middle-school Spanish course, time-matched; retention-sources.json)
- *Verdict:* **design choice**. One correct per relearning session, short spaced sittings, and time-matched gains support the shape. They do not support 10 minutes or 0.75 min.
- *Code vs evidence:* Matches the shape.

**34. Daily review folded into the enforcers: it keeps only older work no enforcer will reach, and skips objectives kept in an enforcer in the last 20 h**
- *Where:* services/review-session.js:68-131 (folded, planFor); services/enforcers.js:1151 (reachStart)
- *What it does:* While enforcers are on, the daily review asks only objectives last answered before the earliest window still to come. It also skips anything answered right in an enforcer in the last 20 hours. During consolidation it is the whole review.
- *Evidence:*
  - **cepeda2009**, https://doi.org/10.1027/1618-3169.56.4.236: "An optimal gap improved final recall by up to 150%." (adults, verbal materials, gaps and tests up to months; retention-sources.json)
  - **karpicke2011spaced**, https://doi.org/10.1037/a0023436: "Repeated retrieval with long intervals between each test produced a 200% improvement in long-term retention" (college students, foreign-vocabulary pairs, lab; retention-sources.json)
  - **rohrer2006**, https://doi.org/10.1002/acp.1266: "long-term retention was boosted by distributed practise and unaffected by overlearning" (college students, maths problems; retention-sources.json)
- *Verdict:* **design choice**. This avoids two retrievals of the same objective too close together, which spend time for little gain. The split itself is an owner rule.
- *Code vs evidence:* Matches.

**35. Typed recall preferred in the review: "one right typed recall is a whole memory check, a multiple-choice one is half"**
- *Where:* services/review-session.js:53-66 (questionFor -> generateWithPreference(entry, true))
- *What it does:* Where the skill has typed items, the review asks typed rather than multiple choice. Coverage weighs a typed right answer as a full check.
- *Evidence:*
  - **rowland2014**, https://doi.org/10.1037/a0037559: "initial recall tests yielding larger testing benefits than recognition tests" (meta-analysis of testing vs restudy, mostly adult lab studies; retention-sources.json)
  - **kang2007**, https://doi.org/10.1080/09541440601056620: "With feedback provided, having had an intervening SA test led to the best performance on the final test" (college students, lab; retention-sources.json)
  - **smith2014**, https://doi.org/10.1080/09658211.2013.831454: "Practising retrieval in all format conditions enhanced retention, relative to a study-only control condition" (college students, prose, lab; retention-sources.json)
  - **little2012**, https://doi.org/10.1177/0956797612443370: "properly constructed multiple-choice tests can indeed trigger productive retrieval processes" (college students, lab; retention-sources.json)
- *Verdict:* **mixed**. Recall tests give larger testing benefits than recognition, and short answer with feedback was best. But Smith and Karpicke found all formats enhanced retention, and well-built multiple choice triggers productive retrieval. As evidence, a typed answer is less guessable, which is the stronger reason for full weight.
- *Code vs evidence:* Matches on direction. The "half" weight is a design choice.

**36. Lapsed objectives are re-taught as a lesson, at most 3 per session, 6 minutes each**
- *Where:* services/adaptation.js:71 (RETEACH 3), :80 (RETEACH_MINUTES 6), :300-305
- *What it does:* An objective the record says is forgotten is not asked as a single question. It is taught again from its lesson, soon.
- *Evidence:*
  - **arnold2013**, https://doi.org/10.1037/a0029199: "unsuccessful retrieval attempts enhance the effectiveness of subsequent restudy, demonstrating that tests do potentiate subsequent learning" (college students, lab; new, verified today)
  - **kornell2009**, https://doi.org/10.1037/a0015729: "Unsuccessful retrieval attempts enhanced learning with both types of materials." (college students, lab; retention-sources.json)
  - **hays2013**, https://doi.org/10.1037/a0028468: "Failed tests followed by delayed feedback, by contrast, did not produce such a benefit" (college students, word pairs, lab; retention-sources.json)
  - **mazza2016**, https://doi.org/10.1177/0956797616659930: "interleaving sleep between learning sessions not only reduced the amount of practice needed by half" (adults, foreign-word pairs, 6-month follow-up; retention-sources.json)
- *Verdict:* **moderate**. A failed retrieval followed by restudy or feedback potentiates learning, and only when the restudy comes soon. Relearning is faster than first learning. The caps are assumptions.
- *Code vs evidence:* Matches.

**37. Skill-level spaced review (mastery.dueReviews): an SM-2-style ladder**
- *Where:* services/mastery.js:15-18 (ease 2.5 in 1.3-3.0; intervals 1, 3, 7, 16, 35, 70, 140 d), :94-103, :144-151 (dueReviews); services/sessions.js:135
- *What it does:* A right answer moves the skill one step up the ladder, scaled by ease (+0.05 right, -0.15 wrong); a coached answer halves the step; a miss is due in 0.5 d. Due skills, weakest then most overdue, fill up to 30% of a lesson.
- *Evidence:*
  - **kang2014**, https://doi.org/10.3758/s13423-014-0636-z: "the expanding schedule yielded much higher average recallability over the whole training period" (adults, long-term retrieval practice; retention-sources.json)
  - **latimier2021**, https://doi.org/10.1007/s10648-020-09572-8: "no significant difference between expanding and uniform spacing schedules of retrieval practice ( g = 0.034)" (meta-analysis of spaced retrieval studies; retention-sources.json)
  - **wozniak1995**, https://doi.org/10.55782/ane-1994-1003: "A universal formula for computing inter-repetition intervals in paired-associate learning has been determined for the knowledge retention level of 95%." (the authors’ own repetition data (abstract claim is the author’s own); scorecard-sources.json)
  - **mettler2016**, https://doi.org/10.1037/xge0000170: "adaptive scheduling outperformed fixed conditions at immediate and delayed tests of retention" (adults, lab; retention-sources.json)
  - **tabibian2019**, https://doi.org/10.1073/pnas.1815156116: "learners who follow a reviewing schedule determined by our algorithm memorize more effectively than learners who follow alternative schedules" (natural experiment on Duolingo data; retention-sources.json)
- *Verdict:* **mixed**. Expanding intervals are fine: no final-test difference from uniform, and higher recall along the way. But adaptive, model-based schedules beat fixed heuristic ladders. The app already has a better model (adaptation.predictedRecall) used everywhere else.
- *Code vs evidence:* Gap. Two schedulers: lessons use the fixed ladder, enforcers and the review use the fitted curve. See P4.

**38. Due reviews go first in a lesson, one difficulty step below the level**
- *Where:* services/sessions.js:135-141, :162-166 (planLesson)
- *What it does:* A lesson opens with its due review items at difficulty -1, then the new material.
- *Evidence:*
  - **pastotter2014**, https://doi.org/10.3389/fpsyg.2014.00286: "recall testing of previously studied information can enhance learning of subsequently presented new information" (review of lab and applied studies; scorecard-sources.json)
  - **chan2018**, https://doi.org/10.1037/bul0000166: "testing reliably potentiates the future learning of new materials by increasing correct recall or by reducing erroneous intrusions" (meta-analysis of test-potentiated new learning; new, verified today)
  - **yang2018fwd**, https://doi.org/10.1038/s41539-018-0024-y: "interim testing of studied information facilitates learning and retrieval of new information—the forward testing effect" (review; new, verified today)
  - **szpunar2008**, https://doi.org/10.1037/a0013082: "interpolating tests during the study sequence insulates against this negative influence" (college students, word lists, lab; retention-sources.json)
- *Verdict:* **moderate**. Retrieving studied material before new material improves learning of the new material (the forward testing effect, meta-analysed). The easier step serves "effortful but successful", and its size is a design choice.
- *Code vs evidence:* Matches.

**39. Interleaving across sessions: earlier skills come back inside lessons; the focus skill alternates with the next weakest every third item**
- *Where:* services/sessions.js:135, :155-160
- *What it does:* Past skills return as due reviews, and the body mixes the weakest introduced skill into every third focus slot.
- *Evidence:*
  - **rohrer2015**, https://doi.org/10.1037/edu0000001: "interleaved practice produced higher scores on both the immediate and delayed tests (Cohen’s ds 0.42 and 0.79" (grade-7 maths classes; retention-sources.json)
  - **rohrer2020**, https://doi.org/10.1037/edu0000367: "the interleaved group outscored the blocked group, 61% versus 38%, d = 0.83" (grade-7 maths classes, randomized trial; retention-sources.json)
  - **emeny2021**, https://doi.org/10.1002/acp.3814: "spaced practice produced higher test scores than did massed practice" (grade-7 maths classes; retention-sources.json)
  - **brunmair2019**, https://doi.org/10.1037/bul0000209: "A multilevel meta-analysis revealed a moderate overall interleaving effect (Hedges’ g = 0.42)." (meta-analysis of interleaving; retention-sources.json)
- *Verdict:* **moderate**. Interleaved maths assignments, which also space each skill across sessions, beat blocked ones in classrooms. Spaced maths practice beat massed.
- *Code vs evidence:* Partly. The body is two-thirds focus skill, mild interleaving, which suits a first exposure. Reviews are blocked at the start rather than mixed in.


### F. Consolidation before the Final

**40. Final held for review-only days until 90% of objectives are durable at 30 days, for at most 21 days (ADAPT_CONSOLIDATE)**
- *Where:* services/consolidation.js:1-23, :59-90; services/adaptation.js:81-82, :783-803
- *What it does:* On first reaching the Graduation exam, the Final waits. The learner does daily reviews of at most 10 minutes until 90% of the grade's objectives are predicted at least 0.90 recalled 30 days on, or 21 days pass. The next grade can be started meanwhile.
- *Evidence:*
  - **rawson2011**, https://doi.org/10.1037/a0023956: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals" (533 college students, key-term definitions; retention-sources.json)
  - **khanna2013**, https://doi.org/10.1177/0098628313487458: "Students completing courses with cumulative finals retained more than students who took noncumulative finals." (college psychology courses; retention-sources.json)
  - **cepeda2008**, https://doi.org/10.1111/j.1467-9280.2008.02209.x: "the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10%" (over 1,350 adults online, facts, tests up to 1 year; retention-sources.json)
  - **rohrer2006**, https://doi.org/10.1002/acp.1266: "long-term retention was boosted by distributed practise and unaffected by overlearning" (college students, maths problems; retention-sources.json)
  - **kapler2015**, https://doi.org/10.1016/j.learninstruc.2014.11.001: title-level only: "Spacing in a simulated undergraduate classroom: Long-term benefits for factual and higher-level learning" (simulated undergraduate classroom; retention-sources.json)
- *Verdict:* **design choice**. Relearning in spaced sessions before a test, cumulative finals, and gaps sized to the retention interval all support the shape. The 90%, 30 days and 21 days are design choices. The simulation ablation in the code comment (95.6% vs 80.0%) is the app's own model, not evidence.
- *Code vs evidence:* Matches the shape. It costs calendar days, not study time.


### G. Retrieval inside lessons and sittings

**41. "Check what stuck": read the lesson, then answer its checks**
- *Where:* public-v2/js/session.js:264-290 (lesson page, start-checks button); also public/js/session.js, public-redesign/js/session.js
- *What it does:* After the lesson text, worked example and common mistakes, one button starts that block's questions.
- *Evidence:*
  - **roediger2006**, https://doi.org/10.1111/j.1467-9280.2006.01693.x: "on the delayed tests, prior testing produced substantially greater retention than studying" (college students, prose passages, lab; retention-sources.json)
  - **karpicke2008**, https://doi.org/10.1126/science.1152408: "Repeated studying after learning had no effect on delayed recall, but repeated testing produced a large positive effect." (college students, foreign-vocabulary pairs, lab; retention-sources.json)
  - **smith2014**, https://doi.org/10.1080/09658211.2013.831454: "Practising retrieval in all format conditions enhanced retention, relative to a study-only control condition" (college students, prose, lab; retention-sources.json)
  - **agarwal2021**, https://doi.org/10.1007/s10648-021-09595-9: "the majority of which (57%) revealed medium or large benefits from retrieval practice" (classroom experiments, total n = 5,374, school and college; retention-sources.json)
  - **yang2021**, https://doi.org/10.1037/bul0000309: "overall testing (quizzing) raises student academic achievement to a medium extent (g = 0.499)" (meta-analysis of 222 classroom studies; retention-sources.json)
- *Verdict:* **strong**. Study followed by retrieval beats more study, in the lab and in classrooms.
- *Code vs evidence:* Matches.

**42. Per-level retention question after each level closes**
- *Where:* services/sessions.js:1096-1124 (blockRetentionItem), :1186; routes/learn.js:134 (retention items always reveal feedback)
- *What it does:* When a level is resolved, one recall question is added from what wobbled in it (a random miss, else a random item), half a step easier.
- *Evidence:*
  - **szpunar2008**, https://doi.org/10.1037/a0013082: "interpolating tests during the study sequence insulates against this negative influence" (college students, word lists, lab; retention-sources.json)
  - **szpunar2013**, https://doi.org/10.1073/pnas.1221764110: "interpolating online lectures with memory tests can help students sustain attention to lecture content" (college students, online lecture video; retention-sources.json)
  - **lyle2011**, https://doi.org/10.1177/0098628311401587: "Exam scores were significantly and substantially higher in a section of the course taught with the PUREMEM procedure" (undergraduate course, end-of-lecture retrieval; retention-sources.json)
  - **pashler2005**, https://doi.org/10.1037/0278-7393.31.1.3: "Supplying the correct answer after an incorrect response not only improved performance during the initial learning session--it also increased final retention by 494%." (college students, foreign-word pairs, lab; retention-sources.json)
- *Verdict:* **moderate**. Interpolated tests protect against interference and hold attention, and end-of-lesson retrieval raised exam scores. Feedback on a miss is what makes it teach.
- *Code vs evidence:* Matches. The pick is random within misses rather than scored.

**43. End-of-sitting retention set: at most 3 questions, one per level from its misses, oldest level first, half a step easier**
- *Where:* services/sessions.js:1510-1561 (retentionPlan), :1703; routes/learn.js:676-720
- *What it does:* When a sitting finishes, the analyst's own retention questions or bank items on the wobbly skills are added. They are excluded from accuracy, and feedback always shows.
- *Evidence:*
  - **lyle2011**, https://doi.org/10.1177/0098628311401587: "Exam scores were significantly and substantially higher in a section of the course taught with the PUREMEM procedure" (undergraduate course, end-of-lecture retrieval; retention-sources.json)
  - **karpicke2007**, https://doi.org/10.1037/0278-7393.33.4.704: "Delaying the first test improved long-term retention, regardless of how the repeated tests were spaced." (college students, word pairs, lab; retention-sources.json)
  - **rohrer2006**, https://doi.org/10.1002/acp.1266: "long-term retention was boosted by distributed practise and unaffected by overlearning" (college students, maths problems; retention-sources.json)
  - **vaughn2016**, https://doi.org/10.3758/s13421-016-0606-y: "to a higher initial criterion during the first session do not persist across relearning sessions" (college students, word pairs, lab; retention-sources.json)
- *Verdict:* **moderate**. End-of-lesson retrieval helps, but more practice right away adds little once spaced relearning follows. The first test does better when delayed.
- *Code vs evidence:* Gap. There is no lag rule, and when enforcers are on it duplicates what the session enforcer asks when the study session ends. See P3.


### H. Feedback

**44. Feedback timing: after each answer by default; held to the end of the level only when the learner's style answers ask for it; always immediate in enforcers, reviews and retention items**
- *Where:* services/learner.js:279, :308 (immediateFeedback: timing < 0.55); routes/learn.js:85-93 (holdsFeedbackByChoice), :134; services/enforcers.js:640; services/review-session.js:201
- *What it does:* The style quiz's feedback-timing dimension can switch a lesson to end-of-level feedback. Checkpoints hold feedback for their own reasons.
- *Evidence:*
  - **kulik1988**, https://doi.org/10.2307/1170349: "Applied studies using actual classroom quizzes and real learning materials have usually found immediate feedback to be more effective than delayed." (review of feedback-timing studies; retention-sources.json)
  - **hays2013**, https://doi.org/10.1037/a0028468: "Failed tests followed by delayed feedback, by contrast, did not produce such a benefit" (college students, word pairs, lab; retention-sources.json)
  - **butler2007**, https://doi.org/10.1037/1076-898X.13.4.273: "delayed feedback led to superior final test performance relative to immediate feedback" (college students, multiple-choice, lab; retention-sources.json)
  - **metcalfe2009**, https://doi.org/10.3758/MC.37.8.1077: "there was no difference between the delayed and immediate feedback conditions when the lag to test was controlled" (grade-6 children and college students, vocabulary; retention-sources.json)
  - **mullet2014**, https://doi.org/10.1016/j.jarmac.2014.05.001: "When students received delayed feedback, they performed better on subsequent course exams that contained new problems" (engineering course; retention-sources.json)
  - **corral2021**, https://doi.org/10.1177/1747021820977739: "no posttest differences were observed between the feedback conditions in Experiments 1 and 2" (adults, complex concept learning; retention-sources.json)
  - **pashler2008**, https://doi.org/10.1111/j.1539-6053.2009.01038.x: "we found virtually no evidence for the interaction pattern mentioned above" (review of learning-styles (meshing) evidence; retention-sources.json)
- *Verdict:* **mixed**. Applied studies favour immediate feedback, and after a failed retrieval delayed feedback lost the benefit. But lab multiple-choice and some course studies favour delayed feedback, and with the lag controlled there was no difference. Matching to a stated preference has no support in the learning-styles evidence.
- *Code vs evidence:* Partly. Retention sittings are immediate plus a delayed recap, the safe combination. Holding lesson feedback by preference rests on preference, not evidence. It is not proposed for change because the evidence on timing is mixed.

**45. Feedback content: the answer and why, plus "A second look" recap of misses at the end of an enforcer**
- *Where:* public/js/enforcer.js:246-257 (missed), :287; services/sessions.js:1085-1094 (answer, rationale, feedback)
- *What it does:* A wrong answer shows the correct answer and its rationale. At the end of the enforcer the misses are shown again, with "comes back in the next enforcers".
- *Evidence:*
  - **pashler2005**, https://doi.org/10.1037/0278-7393.31.1.3: "Supplying the correct answer after an incorrect response not only improved performance during the initial learning session--it also increased final retention by 494%." (college students, foreign-word pairs, lab; retention-sources.json)
  - **vanderkleij2015**, https://doi.org/10.3102/0034654314564881: "elaborated feedback (EF; e.g., providing an explanation) produced larger effect sizes (0.49) than feedback regarding the correctness of the answer (KR; 0.05)" (meta-analysis, computer-based learning; retention-sources.json)
  - **butler2013**, https://doi.org/10.1037/a0031026: "explanation feedback produced superior performance on the new inference questions" (college students, lab; retention-sources.json)
  - **butler2008mc**, https://doi.org/10.3758/MC.36.3.604: "both immediate and delayed feedback increased the proportion of correct responses and reduced the proportion of intrusions" (college students, multiple choice; retention-sources.json)
  - **smith2010kimball**, https://doi.org/10.1037/a0017407: "delaying feedback strengthens initially correct responses due to the spacing of encoding opportunities" (college students, lab; retention-sources.json)
- *Verdict:* **strong**. The answer after an error raised retention 494%. Elaborated feedback (0.49) beats right/wrong (0.05). Explanations help inference. Feedback cancels multiple choice's lure risk. A delayed second look adds spacing.
- *Code vs evidence:* Matches.


### I. Sleep and day boundaries

**46. Day boundaries: local calendar days; scheduled scopes need a 1-day lag; the day enforcer closes the day; no bedtime gate**
- *Where:* services/retention-schedule.js:190-226 (localDate, dayIndex); services/retention-params.js:51-54 (min_lag 24 h); services/study-sessions.js:111-117 (paused session ends at the day change)
- *What it does:* A "day" is the learner's local date from their anchor. Every scheduled enforcer counts only answers at least a day old as spaced, so at least one night lies between learning and the first scheduled retrieval.
- *Evidence:*
  - **berres2021**, https://doi.org/10.1037/bul0000350: "we found a moderate overall sleep benefit in episodic memory (g = 0.44)" (meta-analysis, 823 effect sizes; g = 0.28 after bias correction; retention-sources.json)
  - **gais2006**, https://doi.org/10.1101/lm.132106: "declarative memory is enhanced when sleep follows within a few hours of learning, independent of time of day" (lab, declarative (vocabulary) learning; retention-sources.json)
  - **mazza2016**, https://doi.org/10.1177/0956797616659930: "interleaving sleep between learning sessions not only reduced the amount of practice needed by half" (adults, foreign-word pairs, 6-month follow-up; retention-sources.json)
  - **bell2014**, https://doi.org/10.1080/09658211.2013.778294: "a 12-hour spacing gap that includes sleep promotes long-term memory retention similar to the 24-hour gap" (adults, lab; retention-sources.json)
  - **bauml2014**, https://doi.org/10.1037/xlm0000025: "sleep benefited recall of restudied items but left recall of retrieved items unaffected" (adults, lab; retention-sources.json)
  - **wilhelm2008**, https://doi.org/10.1101/lm.803708: "Beneficial effects of sleep on retention of declarative memories were comparable in children and adults." (children and adults, lab; retention-sources.json)
- *Verdict:* **moderate**. Sleep after learning helps, g = 0.44 (0.28 after bias correction), and children benefit like adults. Sleep between sessions halves the relearning needed. But sleep helps restudied items more than retrieved ones, so retrieval just before bed is not a special booster.
- *Code vs evidence:* Matches, with one gap in the docs. RETENTION-ENFORCER-EVIDENCE.md section 3.8 says "the app suggests doing the day enforcer in the evening", but no such suggestion exists in the code or UI. That line should read "not built". Given bauml2014 it is not proposed.


### J. The forgetting model and its recall estimates

**47. Half-life regression with a population fit, a guessing floor and capped counts**
- *Where:* services/scorecard/forgetting.js:1-35 (P = g + (pk - g) x 2^(-dt/h); log2 h = a + b nc + c nw + m), :88-105 (predict); DEFAULT_CURVE {a 1, b 0.3, c -0.1}; CAP 15
- *What it does:* Recall is predicted from the days since last practice, the counts of earlier right and wrong answers, the ability model's fresh expectation, and a guess floor. The curve is fitted to all learners, with a default until there is enough data.
- *Evidence:*
  - **settles2016**, https://doi.org/10.18653/v1/p16-1174: "reducing error by 45%+ compared to several baselines at predicting student recall rates" (Duolingo practice logs (error in predicting recall, not a learning gain); retention-sources.json)
  - **ye2022**, https://doi.org/10.1145/3534678.3539081: "Experimental results have shown a 12.6% performance improvement over the state-of-the-art methods." (220 million review logs from a vocabulary app; retention-sources.json)
  - **pavlik2005**, https://doi.org/10.1207/s15516709cog0000_14: "The relative benefit of spacing increased with increased practice and with longer retention intervals." (college students, Japanese-English vocabulary; new, verified today)
  - **lindsey2014**, https://doi.org/10.1177/0956797613504302: "personalized review yielded a 16.5% boost in course retention over current educational practice (massed study)" (middle-school Spanish course, time-matched; retention-sources.json)
- *Verdict:* **moderate**. Half-life regression predicts recall well at scale, and model-based schedulers outperform. An activation model with power-law decay explains spacing-by-practice interactions. The default parameters are assumptions until fitted.
- *Code vs evidence:* Matches. Its calibration on real memory tests is not yet known.

**48. Curve shape: exponential by default; a power-law tail available but off**
- *Where:* services/scorecard/forgetting.js:36-58 (FEATURES basic, SHAPE exp, SHAPES list)
- *What it does:* Forgetting is read as 2^(-dt/h). The power-law option (SCORECARD_FORGET_SHAPE=fit) is off, because on the simulation's own exponential memory it over-predicted.
- *Evidence:*
  - **wixted1991**, https://doi.org/10.1111/j.1467-9280.1991.tb00175.x: "the course of forgetting was best described by a simple power function of time" (adults (word recall, face recognition) and pigeons; scorecard-sources.json)
  - **rubin1996**, https://doi.org/10.1037/0033-295x.103.4.734: "The best fits were to the logarithmic function, the power function, the exponential in the square root of time" (210 published retention data sets; scorecard-sources.json)
  - **murre2015**, https://doi.org/10.1371/journal.pone.0120644: "the Ebbinghaus forgetting curve has indeed been replicated" (one adult, 70 hours of list learning (replication); scorecard-sources.json)
  - **averell2011**, https://doi.org/10.1016/j.jmp.2010.08.009: title-level only: "The form of the forgetting curve and the fate of memories" (re-analysis of forgetting data; scorecard-sources.json)
- *Verdict:* **mixed**. Pooled human forgetting data are fit better by power-like functions, and an exponential under-predicts long-interval recall. The simulation that rejected the power tail assumes exponential memory, so it cannot test this. Long-horizon p_H is probably pessimistic, which means more reviews: the safe direction.
- *Code vs evidence:* Gap. The choice was made on simulated data. See P2.

**49. Only spaced successes lengthen the half-life**
- *Where:* services/adaptation.js:196-209 (predictedRecall reads memory checks, not same-day answers)
- *What it does:* Without the fitted curve, the half-life grows only with right memory checks (plus the proof) and shrinks with missed ones. Same-day practice answers do not count, after they made a freshly drilled objective "look good for ten days".
- *Evidence:*
  - **cepeda2006**, https://doi.org/10.1037/0033-2909.132.3.354: "the ISI producing maximal retention increased as retention interval increased" (meta-analysis, 839 assessments of verbal recall; retention-sources.json)
  - **rohrer2006**, https://doi.org/10.1002/acp.1266: "long-term retention was boosted by distributed practise and unaffected by overlearning" (college students, maths problems; retention-sources.json)
  - **karpicke2011spaced**, https://doi.org/10.1037/a0023436: "Repeated retrieval with long intervals between each test produced a 200% improvement in long-term retention" (college students, foreign-vocabulary pairs, lab; retention-sources.json)
  - **donovan1999**, https://doi.org/10.1037/0021-9010.84.5.795: "an overall mean weighted effect size of 0.46, indicating that individuals in spaced practice conditions performed significantly" (meta-analysis, 63 studies of practice distribution; retention-sources.json)
  - **kornell2009cram**, https://doi.org/10.1002/acp.1537: "spacing was more effective than massing for 90% of the participants, yet after the first study session, 72% of the participants believed" (college students, vocabulary flashcards; retention-sources.json)
- *Verdict:* **strong**. Spaced practice beats massed practice across meta-analyses, and overlearning in one sitting adds little long-term.
- *Code vs evidence:* Matches. The fitted "basic" curve still counts all answers alike, and the spaced refit is a data step.

**50. Personal forgetting multiplier from the learner's own memory checks**
- *Where:* services/adaptation.js:239-279 (memoryAdjust: Beta posterior, >= 10 checks; -1 doubling if P(fail rate > 0.25) >= 0.95; +0.5 if >= 20 checks and P(fail rate < 0.05) >= 0.95)
- *What it does:* The curve is shortened for a learner who clearly forgets faster than expected, and lengthened (by less) for one who clearly keeps more. The bar is 95% posterior certainty.
- *Evidence:*
  - **sense2016**, https://doi.org/10.1111/tops.12183: "We demonstrate that they are stable over time but not across materials." (adults, repeated lab sessions; retention-sources.json)
  - **zerr2018**, https://doi.org/10.1177/0956797618772540: "quicker learners were also more durable learners (i.e., exhibited better retention across a delay)" (adults, N = 281 and N = 92; scorecard-sources.json)
  - **eglington2023**, https://doi.org/10.1007/s40593-022-00296-0: "learner models assuming equal learning rates for students will inevitably lead to systematic errors that result in suboptimal pedagogical decisions" (simulation plus six large educational datasets; new, verified today)
  - **lindsey2014**, https://doi.org/10.1177/0956797613504302: "personalized review yielded a 16.5% boost in course retention over current educational practice (massed study)" (middle-school Spanish course, time-matched; retention-sources.json)
- *Verdict:* **moderate**. Individual forgetting rates are stable over time and differ between people. Models that assume equal rates make systematic errors. Personalised review beat generic review. The asymmetric steps and the 10/20/0.95 bars are design choices; the asymmetry errs toward more review.
- *Code vs evidence:* Matches.


## The eglington2020 question: should the enforcer's selection weights shift?

**What the study found.** Eglington & Pavlik (2020): adults on Mechanical Turk practised Japanese-English word pairs for 22 minutes and were tested 3 days later.
- In each condition the scheduler practised "whichever item the model estimated was closest to (but less than) the recall probability threshold" (full text).
- Thresholds of 0.86 and 0.94 gave significantly better final recall than 0.40 and 0.98. That held with the time cost of failures counted: failed retrievals take longer, because of feedback.
- **0.70 did not differ significantly from 0.86 or 0.94.**
- 0.86 was numerically highest.

**What the code does now** (`services/enforcers.js:276-279`, `services/retention-params.js:61`):

| p_now | d now | Fits eglington2020? |
|---|---|---|
| < 0.50 | 0.6 | yes (0.40 was worse) |
| 0.50 to 0.90 | 1.0 | yes (0.70 and 0.86 equal-best) |
| **0.90 to 0.95** | **0.65** | **no: 0.94 was among the best** |
| > 0.95 | 0.3 | yes (0.98 was worse) |

The need term (1 - p_H) is not in question. The theory and the large natural experiment in tabibian2019 put the optimal reviewing rate on the recall probability itself.

**Verdict: shift one weight.** Do not re-centre the window.

### P1. Raise d(p_now) for 0.90 < p_now <= 0.95 from 0.65 to 1.0

**BUILT (flag `ENFORCER_DIFFICULTY_WINDOW_95`, on by default; 2026-10-25, implementer A).** Steps 1, 3 and 4 were done as written. Step 2 differs: the brief requires an off switch, so the step branch stays, but only behind the switch. It now lives in `retention-params.js` `difficultyWeight`, and `score` calls that. With the switch on, d is 1 from 0.50 to 0.95 and no step applies. `=off` restores 0.90 and the 0.65 step. Tests: `scripts/retention-enforcers-test.js`, section "P1". The scorecard-sim A/B suggested under "How to check it" was not run.

- **The exact change:**
  1. `services/retention-params.js:61`: set `window: { lo: 0.5, hi: 0.95, below: 0.6, above: 0.3, too_easy: 0.95 }` (hi 0.90 → 0.95).
  2. `services/enforcers.js:279`: `else if (pNow > dw.hi) d = (1 + dw.above) / 2;` can then never fire. Delete it, so the code says what it does.
  3. `curriculum-build/retention-enforcer-params.json` `selection.step_2_score.difficulty_window`: set it to "d(p_now) = 1.0 if 0.50 <= p_now <= 0.95; 0.6 if p_now < 0.50; 0.3 if p_now > 0.95". Add eglington2020 to its `basis`. (`fromResearch` does not read the window today, so this is documentation unless that is added too.)
  4. `curriculum-build/RETENTION-ENFORCER-EVIDENCE.md`: update section 5, step 2, and the section 11 line on the 0.65 step.
- **What stays the same, and why:**
  - **below = 0.6**: practice aimed at 0.40 was worse.
  - **above = 0.3 for p_now > 0.95**: 0.98 was worse, through overpractice and short spacing.
  - **need = 1 - p_H**: tabibian2019.
  - **ADAPT_REVIEW_AT = 0.90**: it sits inside 0.86-0.94.
  - **The 0.50-0.90 plateau**: 0.70 did not differ from 0.86 or 0.94. Peaking the weight at 0.86-0.94 would push down topics in 0.50-0.85. In an enforcer those topics have fallen *past* the efficient point, and Eglington's own rule practises items under the threshold first.
- **Not recommended yet: a closest-to-threshold rule.** This means replacing d with a rule like "closest under 0.90", Khajah's heuristic (b). Test it in `curriculum-build/scorecard-sim` before considering it, because it changes behaviour on backlogs. Eglington and Khajah tested it on fresh learning or in simulation, not on a cross-day backlog.
- **If the first-try accuracy band is ever built** (`global.target_first_try_accuracy.band`, not built today): use [0.70, 0.90] rather than [0.70, 0.85]. 0.70-0.94 was one efficient region, and 0.85 is only a model result [wilson2019].
- **Evidence:**
  - **eglington2020**, https://doi.org/10.1038/s41539-020-00074-4: "the OET 86 and 94 conditions having significantly higher recall performance than the OET 40" (adults on Mechanical Turk, Japanese-English pairs, 22-min practice, test 3 days later (full text PMC7567101); retention-sources.json)
  - **eglington2020**, https://doi.org/10.1038/s41539-020-00074-4: "There was not a significant difference between OETs 94, 86, and 70" (adults on Mechanical Turk (full text PMC7567101); retention-sources.json)
  - **eglington2020**, https://doi.org/10.1038/s41539-020-00074-4: "a simulated student practiced whichever item the model estimated was closest to (but less than) the recall probability threshold" (simulation and experiment design (full text PMC7567101); retention-sources.json)
  - **pavlik2008**, https://doi.org/10.1037/1076-898x.14.2.101: "the item is at the spacing interval where long-term gain per unit of practice time is maximal" (college students, Japanese-English vocabulary; retention-sources.json)
  - **khajah2014**, https://doi.org/10.1111/tops.12077: "review material whose predicted memory strength is closest to a particular threshold" (simulations with two memory models (ACT-R, MCM), semester-long review; new, verified today)
  - **tabibian2019**, https://doi.org/10.1073/pnas.1815156116: "subject to a cost on the reviewing frequency, the optimal reviewing schedule is given by the recall probability itself" (theory plus a natural experiment on Duolingo data; retention-sources.json)
  - **wilson2019**, https://doi.org/10.1038/s41467-019-12552-4: "the optimal training accuracy is about 85%" (computational model and simulations, not learners; retention-sources.json)
- **Expected effect: small.** A worked example at a weekly horizon:
  - Topic A, p_now 0.93 and p_H 0.70: its score rises from 0.30 × 0.65 = 0.195 to 0.30.
  - Topic B, p_now 0.80 and p_H 0.55: 0.45 before and after.
  - Flagged misses keep their +0.30 and stay on top.
  - The change mostly stops near-threshold topics, including freshly learned ones in session and day enforcers (the fallback curve tops out at 0.95), from losing to topics with the same need but a different p_now.
- **Risk: low.**
  - The evidence is one within-session study: adults, vocabulary, a 3-day test. Enforcers are cross-day and mix materials.
  - Near-threshold items are cheap (3 s feedback when right), so the budget cost is small.
- **How to check it:**
  - A scorecard-sim A/B (hi 0.90 vs 0.95, four seeds), with 30-day recall as the outcome.
  - Then live calibration: predicted p against the next memory check, as in RETENTION-ENFORCER-EVIDENCE.md section 12.2.

## Other proposals (3 or more sources each; status marked on each)

### P2. Choose the forgetting-curve shape on real memory tests, not on the simulation

**SKIPPED: needs data.** It needs real learners' memory tests, enough for MIN_FIT_TESTS, and we do not have them yet (2026-10-25).
- **What.** Once the population fit has enough memory tests (MIN_FIT_TESTS), fit both `SCORECARD_FORGET_SHAPE=exp` and `=fit` (the power-law tail) on real learners' memory tests. Compare held-out log-likelihood and 30-day calibration, and adopt the power tail only if it wins. The current rejection used the simulation's exponential memory, which cannot show a power tail.
- **Evidence:**
  - **wixted1991**, https://doi.org/10.1111/j.1467-9280.1991.tb00175.x: "the course of forgetting was best described by a simple power function of time" (adults (word recall, face recognition) and pigeons; scorecard-sources.json)
  - **rubin1996**, https://doi.org/10.1037/0033-295x.103.4.734: "The best fits were to the logarithmic function, the power function, the exponential in the square root of time" (210 published retention data sets; scorecard-sources.json)
  - **murre2015**, https://doi.org/10.1371/journal.pone.0120644: "the Ebbinghaus forgetting curve has indeed been replicated" (one adult, 70 hours of list learning (replication); scorecard-sources.json)
  - **averell2011**, https://doi.org/10.1016/j.jmp.2010.08.009: title-level only: "The form of the forgetting curve and the fate of memories" (re-analysis of forgetting data; scorecard-sources.json)
- **Expected effect.** Better long-horizon p_H, so bi-weekly and monthly enforcers spend less time on topics the exponential wrongly calls faded.
- **Risk.** A power tail that over-predicts recall means under-review, the unsafe direction. Keep the exponential when the likelihoods tie.
- **Files.** `services/scorecard/forgetting.js:56` (SHAPE default) and `fitCurve`; a new comparison script in `scripts/`. Nothing in the enforcers changes.

### P3. Stop the end-of-sitting retention set from duplicating the session enforcer

**BUILT (flag `ENFORCER_DEFER_SITTING_RETENTION`, on by default; 2026-10-25, implementer A).**
- **When it applies.** `enforcers.deferSittingRetention` is called from `routes/learn.js` (the finish route). It applies when enforcers are on, the account is not the owner's base version, the sitting is not an enforcer, and a study session is open (running or paused) that holds at least one of the sitting's answers. Then no end-of-sitting retention items are created, and the response carries `retention_deferred: true`. The per-level question is unchanged.
- **How the skills reach the enforcer.** The set's skills that were *missed* in the sitting are stored on the study session (`retention_deferred`). The session or day enforcer then gives those topics +0.20 (`flags.deferred_retention`; new params key `wobbled_in_deferred_sitting_set`), but only when neither "last answer wrong" nor "slow or unsure" already fired. The weight is an assumption: the same as "right but unsure".
- **Not changed:** `services/sessions.js` (`retentionPlan`) belongs to implementer B; nothing there was needed.
- **Tests:** `scripts/retention-enforcers-test.js`, section "P3".
- **Browser check:** on a test copy, the recap had no Retention check card, and the session enforcer flagged the missed skill's topic.
- **What.** When `RETENTION_ENFORCERS` is on and a study session is running, skip the at-most-3 end-of-sitting retention questions (`routes/learn.js:676-720`). Pass their skills to the session enforcer as flagged instead. That enforcer asks the same window's topics when the study session ends, with a 5-minute lag and oldest first. Keep the set when no study session is running, and keep the per-level question.
- **Evidence:**
  - **karpicke2007**, https://doi.org/10.1037/0278-7393.33.4.704: "Delaying the first test improved long-term retention, regardless of how the repeated tests were spaced." (college students, word pairs, lab; retention-sources.json)
  - **rohrer2006**, https://doi.org/10.1002/acp.1266: "long-term retention was boosted by distributed practise and unaffected by overlearning" (college students, maths problems; retention-sources.json)
  - **rohrer2005over**, https://doi.org/10.1002/acp.1083: "The overlearners recalled far more than the low learners at the 1-week test, but this difference decreased dramatically thereafter." (college students, facts, tests to 9 weeks; retention-sources.json)
  - **vaughn2016**, https://doi.org/10.3758/s13421-016-0606-y: "to a higher initial criterion during the first session do not persist across relearning sessions" (college students, word pairs, lab; retention-sources.json)
  - **rohrer2007pashler**, https://doi.org/10.1111/j.1467-8721.2007.00500.x: "immediate further study of the same material is an inefficient use of time" (review of spacing and overlearning studies; retention-sources.json)
- **Expected effect.** About 1-2 minutes saved per sitting with no expected loss of retention. One effortful delayed retrieval replaces two quick ones close together.
- **Risk.** The analyst's tailored retention questions are no longer shown in that case. Learners who skip the session enforcer lose this check, though the day and scheduled enforcers still cover it.
- **Files.** `routes/learn.js:676-720`, `services/sessions.js:1510-1561` (retentionPlan), `services/study-sessions.js` (is a session running), `services/enforcers.js:186-224` (unitsFrom, to take the flag).

### P4. Drive lesson reviews from the fitted curve, not the SM-2 ladder

**Left to implementer B.** It changes `planLesson` in `services/sessions.js`, which implementer B owns. Implementer A did not build it (2026-10-25).

**Status: BUILT (flag `CURVE_REVIEWS`, default on; 2026-10-25, implementer B).**
- Where the grade has an objective model, planLesson's review share (up to 30%) comes from `adaptation.reviewQueue`'s memory checks, fading and least durable objectives (`sessions.curveReviews`). These are mapped to introduced skills, at most two per skill.
- Each review item is tagged with its objective (`objective_id`, `review_reason`) and uses a question written for that objective when one is left, so the answer is that objective's memory check.
- With no model, `mastery.dueReviews` (SM-2) decides, as before. An empty queue means nothing is due.
- The owner keeps SM-2.
- About 1 ms per plan on the live data.
- Tests: `scripts/curriculum-evidence-test.js`.
- **What.** In `planLesson`, where an objective model exists, pick the due-review share (up to 30%) from `adaptation.reviewQueue`'s fading objectives, mapped to their skills. Keep `mastery.dueReviews` as the fallback, so one scheduler decides what is due everywhere.
- **Evidence:**
  - **mettler2016**, https://doi.org/10.1037/xge0000170: "adaptive scheduling outperformed fixed conditions at immediate and delayed tests of retention" (adults, lab; retention-sources.json)
  - **tabibian2019**, https://doi.org/10.1073/pnas.1815156116: "learners who follow a reviewing schedule determined by our algorithm memorize more effectively than learners who follow alternative schedules" (natural experiment on Duolingo data; retention-sources.json)
  - **lindsey2014**, https://doi.org/10.1177/0956797613504302: "personalized review yielded a 16.5% boost in course retention over current educational practice (massed study)" (middle-school Spanish course, time-matched; retention-sources.json)
  - **pavlik2008**, https://doi.org/10.1037/1076-898x.14.2.101: "The optimized condition showed significant benefits with large effect sizes for both improved recall and recall latency." (college students, Japanese-English vocabulary; retention-sources.json)
  - **ye2022**, https://doi.org/10.1145/3534678.3539081: "Experimental results have shown a 12.6% performance improvement over the state-of-the-art methods." (220 million review logs from a vocabulary app; retention-sources.json)
- **Expected effect.** Modest: no second schedule that ignores what enforcers just retrieved, and review aimed by predicted recall.
- **Risk.** Lesson composition changes. Objective-to-skill mapping is coarse. Test it on the simulator first.
- **Files.** `services/sessions.js:131-141`, `services/mastery.js:144-151`, `services/adaptation.js:288-327`.

### P5. Build the "left out last time" rotation flag (low priority)

**BUILT (flag `ENFORCER_LEFT_OUT_FLAG`, on by default; 2026-10-25, implementer A).**
- **Why it was built.** It meets the 3-source rule: anderson1994, murayama2014 and cepeda2009. chan2006 is counter-evidence, so the weight stays the params file's small +0.10. The risk is very small.
- **How it works.** `plan()` stores the eligible topics it did not ask on the enforcer row (`left_out`). `leftOutCounts` counts, for each topic, the run of the learner's latest planned enforcers that left it out; a plan that asked it ends the run. `score` adds 0.10 × min(1, times / 2). `fromResearch` now parses the params string. The owner's base version stores and reads nothing.
- **Tests:** `scripts/retention-enforcers-test.js`, section "P5".
- **What.** The params file defines +0.10 × min(1, times left out / 2), but neither `services/enforcers.js:280-288` nor `fromResearch` reads it. Store the eligible-but-not-chosen keys on each enforcer row in `plan()` and add the flag.
- **Evidence:**
  - **anderson1994**, https://doi.org/10.1037/0278-7393.20.5.1063: "Category-cued recall of unpracticed members of practiced categories was impaired on a delayed test." (college students, category-exemplar lists; retention-sources.json)
  - **murayama2014**, https://doi.org/10.1037/a0037505: "Retrieving a subset of items can cause the forgetting of other items" (meta-analysis of retrieval-induced forgetting; new, verified today)
  - **cepeda2009**, https://doi.org/10.1027/1618-3169.56.4.236: "confirm the importance of cumulative reviews to promote retention over meaningful time periods" (adults, verbal materials, gaps and tests up to months; retention-sources.json)
- **Counter-evidence:**
  - **chan2006**, https://doi.org/10.1037/0096-3445.135.4.553: "testing enhanced recall 24 hr later for the initially nontested material" (college students, prose; retention-sources.json)
  - Retrieval-induced forgetting is not universal, which is why this is low priority.
- **Expected effect.** Small: fewer topics left out twice in a row in tight budgets.
- **Risk.** Very small.
- **Files.** `services/enforcers.js:280-288`, `:562-597`; `services/retention-params.js:62`, `:118-125`.

### Considered, not proposed
- **Holding lesson feedback by preference** (mechanism 44). The timing evidence is mixed, so no change is justified either way.
- **An evening prompt for the day enforcer.** Sleep favours restudied over retrieved items [bauml2014]. The evidence document should mark this as not built (mechanism 46).
- **Putting confusable maths concepts side by side.** It is supported for maths [brunmair2019; rohrer2015], but needs confusability data the bank does not have.

## Corrections to RETENTION-ENFORCER-EVIDENCE.md found here
- **Section 3.8:** "the app suggests doing the day enforcer in the evening" is not in the code or UI. Mark it "(not built)".
- **Section 5, step 2:** the 0.65 step is listed, but the params file's `difficulty_window` text omits it. P1 removes the step.
- **Section 5:** the "Left out last time" and "Prerequisite" flags are correctly marked not built, and the "within 14 days" limit on last-wrong is also not built. Both are already noted there.
- **Applied 2026-10-25 (implementer A).** Section 3.8 now marks the evening suggestion as not built. Section 5, step 2 states the new window. The params `difficulty_window` text now reads 1.0 up to 0.95, with `difficulty_window_basis` naming eglington2020. The left-out flag is marked built in section 5.

## New sources (15)
  - **kovanovic2016**, https://doi.org/10.18608/jla.2015.23.6: "our findings indicate that time-on-task estimation methods play an important role in shaping the final study results" (two university course log datasets (online and blended); new, verified today)
  - **nguyen2020tot**, https://doi.org/10.1145/3375462.3375538: "what can be considered as outliers in time-on-task depends on the learning pattern of each student" (university course log data (LAK 2020, peer-reviewed proceedings); new, verified today)
  - **rotelli2022**, https://doi.org/10.1145/3506860.3506913: "data pre-processing decisions have an impact on the analysis’ outcomes and can lead to inaccurate predictions" (university LMS data (LAK 2022, peer-reviewed proceedings); new, verified today)
  - **harkin2016**, https://doi.org/10.1037/bul0000025: "promoted goal attainment (d+ = 0.40, 95% CI [0.32, 0.48])" (meta-analysis, 138 studies, N = 19,951, mostly health goals; new, verified today)
  - **eglington2023**, https://doi.org/10.1007/s40593-022-00296-0: "learner models assuming equal learning rates for students will inevitably lead to systematic errors that result in suboptimal pedagogical decisions" (simulation plus six large educational datasets; new, verified today)
  - **finn2010**, https://doi.org/10.1037/a0020605: "An extremely effortful study episode extended by a more moderate interval was preferred to a shorter, unextended interval" (college students, effortful vocabulary study, lab; new, verified today)
  - **finn2016**, https://doi.org/10.1037/xlm0000150: "a challenging test episode extended by a more moderate interval was preferred to an unextended interval" (adults, difficult maths tests, five experiments; new, verified today)
  - **kahneman1993**, https://doi.org/10.1111/j.1467-9280.1993.tb00589.x: "such evaluations are often dominated by the discomfort at the worst and at the final moments of episodes" (adults, cold-pressor task; new, verified today)
  - **fredrickson1993**, https://doi.org/10.1037/0022-3514.65.1.45: "Retrospective evaluations appear to be determined by a weighted average of "snapshots" of the actual affective experience" (adults, film clips (32 and 96 participants); new, verified today)
  - **arnold2013**, https://doi.org/10.1037/a0029199: "unsuccessful retrieval attempts enhance the effectiveness of subsequent restudy, demonstrating that tests do potentiate subsequent learning" (college students, lab; new, verified today)
  - **chan2018**, https://doi.org/10.1037/bul0000166: "testing reliably potentiates the future learning of new materials by increasing correct recall or by reducing erroneous intrusions" (meta-analysis of test-potentiated new learning; new, verified today)
  - **yang2018fwd**, https://doi.org/10.1038/s41539-018-0024-y: "interim testing of studied information facilitates learning and retrieval of new information—the forward testing effect" (review; new, verified today)
  - **pavlik2005**, https://doi.org/10.1207/s15516709cog0000_14: "The relative benefit of spacing increased with increased practice and with longer retention intervals." (college students, Japanese-English vocabulary; new, verified today)
  - **khajah2014**, https://doi.org/10.1111/tops.12077: "review material whose predicted memory strength is closest to a particular threshold" (simulations with two memory models (ACT-R, MCM), semester-long review; new, verified today)
  - **murayama2014**, https://doi.org/10.1037/a0037505: "Retrieving a subset of items can cause the forgetting of other items" (meta-analysis of retrieval-induced forgetting; new, verified today)
