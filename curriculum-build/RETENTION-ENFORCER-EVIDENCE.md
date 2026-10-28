# Retention enforcers: the evidence behind them (2026-10-24)

This report covers how and why the retention enforcers keep what a learner has learned, and how they deepen it. The owner's design is fixed:
- Start session, pause, end.
- At the end the learner picks quick, medium, full or none. Full takes less than 10% of the session's time.
- "End session" covers that session. "End day session" covers the whole day.
- Calendar enforcers: semi-weekly, weekly, bi-weekly and monthly.
- Clarified the evening of 2026-10-24: the semi-weekly runs strictly on 3/4/3/4-day gaps from the anchor. When enforcers fall on one day, the widest absorbs the narrower ones, the end-of-day enforcer included: on a weekly's day there is ONE enforcer for the week, the semi-week and that day. That combined enforcer is one plan optimised for retention and understanding, not the sum of each scope's questions (section 5a).
- An unfinished or unchosen enforcer can be resumed or chosen on return.

This report does not change any of that. It sets the parameters inside the design so it works as well as the evidence allows. The parameters are in `retention-enforcer-params.json`, the builder's input. The sources are in `retention-sources.json`, alongside the ids reused from `scorecard-sources.json`.

**Sources.**
- 82 new sources, all verified (0 unverified). Five of them were added for the allocation rule (section 5a).
- 65 verified sources reused from the scorecard set.
- 3 works were not verified and are not used for any claim.
- Of the 82 new sources:
  - 21 have their numbers matched in the abstract;
  - 44 have claims checked against the abstract text;
  - 16 had no retrievable abstract, so they are used only for what their title states, or as background;
  - 1 number comes from a secondary summary and is marked as such.
- **Independent re-check (2026-10-24, late evening; section 1, last part):** all 147 re-verified, 0 removed; 9 claims in this report were corrected or narrowed; 3 sources were added (eglington2020 and kim2019bigdata new; ye2022, already verified in the scorecard set, reused), so 84 new + 66 reused = **150 verified**.

Citations in this report use the source ids, `[id]`.

## Contents
1. How the sources were checked
2. The bottom line
3. Why the enforcers work: the mechanisms
4. Parameters by scope and tier
5. How items are picked under the time budget
5a. Combined enforcers: how many retrievals per topic
6. What the items are: formats that build understanding
7. Feedback
8. What counts as "retained", and how results feed the record
9. Choosing, skipping, resuming
10. What the evidence does NOT support
11. Honest limits: evidence vs assumption
12. Real-learner data that would confirm or refute it
13. Sources

---

## 1. How the sources were checked

The rule is the same as for the scorecard evidence report.
- **Lookup.** Each new source was looked up by DOI on Crossref. The record's title plus subtitle was compared, with Unicode dashes treated as spaces. If that failed, the source was searched by title and first author.
- **Verified.** A source counts as verified only when all three hold:
  - the title tokens overlap by at least 0.75 in both directions;
  - the first author is among the record's authors;
  - the year is within one.
- **Corrections.** Seven sources first failed only because Crossref stores the subtitle separately, or because of a Unicode hyphen. All seven passed on recheck. No DOI needed correcting.
- **Abstracts** came from Semantic Scholar's batch API, Crossref or Europe PMC. OpenAlex's free daily budget was used up, and no key was created.
- **Numbers.** Every number quoted below was matched against the abstract text, except:
  - the scorecard set's own "web" items (Rowland, Adesope), marked there;
  - Latimier et al.'s two effect sizes, confirmed again today by a web search of the abstract;
  - Rawson et al. 2013's "about 10%", which comes from a secondary summary and is marked so.

**Independent re-check (2026-10-24, late evening).** A second pass, done separately from the first, went through all 147 sources and every claim this report hangs on them.
- **Identity.** Every DOI resolved at doi.org (147 of 147 redirect). Title, first author and year matched the Crossref record for all 147 (title overlap ≥ 0.75 both ways, year within one; latimier2021 is 2020 online, 2021 in print).
- **Abstracts.** Retrieved for 130 of 147, from Crossref, OpenAlex, Semantic Scholar, Europe PMC, PubMed and the Info4Practice abstract mirror (for Springer pages that block scripts). Newly confirmed in an abstract: latimier2021 (g = 0.74; expanding vs uniform g = 0.034), rawson2018 (ds 1.52-4.19), rawson2020end (431 students, pooled d = 0.28, 95% CI 0.08-0.49), lyle2020, brunmair2019 (maths g = 0.34, words g = -0.39) and barbieri2023 (g = 0.48).
- **Still not in any retrieved abstract** (kept, as marked): rowland2014's g ≈ 0.50 and adesope2017's g ≈ 0.61 (both from the papers' result sections as reported by secondary sources; 0.61 is against all non-testing conditions, not restudy alone); rawson2013power's "about 10%" (secondary summary). 17 sources still have no retrievable abstract and are used only for what their title states, or as background.
- **Claims corrected here** (overstated, not wrong in direction): higham2022's anxiety, mastery and metacognition results are associations with recall during relearning, not a relearning-vs-restudy difference; adesope2017's 0.61 is not "vs restudy"; rawson2013relearn's spacing effects were "significantly attenuated", not "wiped out"; rohrer2005over's overlearning gain shrank sharply by 9 weeks rather than vanishing; hays2013 says delayed feedback lost the benefit, so immediate feedback "should", not "must", follow a failed retrieval; mullet2014 found a clear delayed-feedback transfer gain, so "small" applies only to corral2021; agarwal2014anx is students' self-report. The calendar's fit to the Cepeda ridge was narrowed (section 3.3).
- **Code against this report.** Several selection rules written in section 5 as if built are not in `services/enforcers.js`; they are now marked "(not built)", and the numbers the code uses without a source are listed in section 11.

**Already covered.** Of the 509 scorecard sources, these were already verified and are reused:
- retrieval practice (24);
- spacing and forgetting (44);
- interleaving (7);
- feedback (14);
- generation and self-explanation (12);
- the learning-styles evidence.

**New here.** The new searches filled the gaps:
- successive relearning;
- expanding vs equal schedules;
- sleep;
- feedback timing;
- multiple-choice risks;
- cumulative review;
- higher-order and varied retrieval;
- optional-quiz behaviour and defaults.

## 2. The bottom line

| Design element | What the evidence says | Strength |
|---|---|---|
| End-of-session enforcer = retrieval, not review | Testing beats restudy, about g 0.50 [rowland2014]; practice tests beat all non-testing conditions, about g 0.61 [adesope2017]; classroom g = 0.499 [yang2021]; end-of-lecture retrieval raised exam scores [lyle2011] | Strong |
| Calendar of enforcers (hours → 3-4 d → 7 d → 14 d → 30 d) | Spaced beats massed retrieval, g = 0.74 [latimier2021]; optimal gap grows with retention interval [cepeda2006], about 20-40% of a 1-week and 5-10% of a 1-year interval [cepeda2008]; optimal gap raises recall up to 150% [cepeda2009]; the same gap-by-interval pattern holds in 10,514 learners' workplace-training data [kim2019bigdata] | Strong |
| Several short relearning sessions per item | Successive relearning: exam gains of at least 10%, ds .54-1.10 [janes2020]; relearning vs single session ds 1.52-4.19 [rawson2018]; beats exposure-matched restudy, and higher recall during relearning went with lower anxiety and more sense of mastery [higham2022]; see also [rawson2011; rawson2013power; rawson2022] | Strong (mostly college; few school-age studies) |
| Expanding vs equal gaps | No difference on the final test, g = 0.034 [latimier2021]; equal beat expanding at 2 days [karpicke2007]; expanding gives higher recall during learning [kang2014]; expanding gains relative to uniform as the number of tests per item grows (moderator) [latimier2021] | Strong: the owner's expanding calendar is fine |
| Cumulative larger scopes | Cumulative practice beat single-rule review on application and problem solving [mayfield2002]; cumulative exams improved retention up to 18 months [khanna2013], most for weaker students [lawrence2013]; cumulative reviews are needed [cepeda2009] | Moderate |
| Pick items by predicted forgetting | Personalised review +16.5% over massed and +10.0% over generic spacing [lindsey2014]; model-based scheduling [settles2016; tabibian2019; mettler2016; ye2022: 12.6% over prior methods on 220 million logs]; practising at a predicted recall of about 0.86-0.94 beat 0.40, 0.98 and a fixed schedule, up to 40% more recalled [eglington2020] | Moderate to strong |
| Corrective, explanatory feedback | The answer after an error raised retention 494% [pashler2005]; elaborated 0.49 vs right/wrong 0.05 [vanderkleij2015]; feedback doubles retention of low-confidence correct answers [butler2008] | Strong |
| Varied and higher-order items | Testing transfers, d = 0.40 [pan2018]; varied application questions transfer better [butler2017]; higher-order quizzes help higher-order tests, fact quizzes do not [agarwal2019] | Moderate |
| Day enforcer late in the day | Sleep vs wake g = 0.44 (0.28 after bias correction) [berres2021]; best when sleep comes soon after learning [gais2006; payne2012; talamini2008]; sleep between sessions halves relearning [mazza2016]. But sleep helps restudied more than retrieved items [bauml2014] | Moderate. Timing is a suggestion, not a gate |
| Short, ungraded, completable, default preselected | Ungraded quizzes beat graded ones [khanna2015]; recall during relearning went with lower anxiety [higham2022]; optional quizzes are taken far less than required ones [trumbo2016]; defaults d = 0.68 [jachimowicz2019] | Moderate |
| One try per topic per relearning sitting; a second, varied, spaced try only for fragile topics; never a per-scope quota added up | Relearning to 1 correct recall per session, with 3 widely spaced sessions [rawson2011]; initial criterion and extra same-session tries fade once relearning follows [rawson2011; vaughn2016; rawson2013relearn]; dropout schedules work best for initially wrong items [pyc2007]; hard items stay behind at equal recalls [vaughn2013]; spacing beats amount [lyle2020]; one solve per session x 3 beat three in one only by d = 0.28 for math procedures [rawson2020end]; long spacing between a sitting's repeated tests: about 200% better [karpicke2011spaced] | Moderate for the direction; the cap of 2 and the 0.35 value are assumptions |
| Exact shares (9.5% / 6 / 5 / 4 / 3%), caps, weights | No study sets these | Assumption, tune with data |

**The product, in one sentence.** Every objective gets one effortful retrieval with feedback at the end of the sitting and another that evening. It then gets spaced, cumulative, increasingly varied retrievals at about 3-4, 7, 14 and 30 days, each set of items picked by what the fitted forgetting curve says is fading. All of this costs less than 10% of study time per scope.

## 3. Why the enforcers work: the mechanisms

### 3.1 Retrieval, not review
- **Retrieval beats restudy.** Retrieving an answer strengthens memory more than seeing it again [roediger2006; roediger2006power; karpicke2008; karpicke2011; pyc2010].
  - After an item is learned, repeated testing has a large effect on delayed recall. Repeated studying has none, and learners don't know this [karpicke2008].
  - Recall-type initial tests give larger benefits than recognition [rowland2014].
  - Well-built multiple choice also works [little2012; smith2014], but it needs feedback, because lures can teach errors [roediger2005mc; butler2008mc].
- **Classroom evidence.** Effects hold in classrooms (g = 0.499 across 222 studies [yang2021]; 57% of 49 effect sizes medium or large [agarwal2021]) and for children [fazio2019; carpenter2009hist].
- **Honest note.** Against other active tasks (not restudy), classroom results are less conclusive [moreira2019].

### 3.2 Why at the end of a session, and why not more of it then
- **Value of the session enforcer.**
  - An end-of-lesson retrieval set raised exam scores, and students liked it [lyle2011].
  - Tests inside or after long study protect against interference building up [szpunar2008].
- **Why it stays short.**
  - Immediate extra study beyond mastery is an inefficient use of time [rohrer2007pashler].
  - Overlearning's large 1-week advantage shrinks sharply over the following weeks (tests up to 9 weeks) [rohrer2005over], and extra same-session problems had no effect at 1 or 4 weeks [rohrer2006].
  - When relearning follows, gains from a higher initial criterion do not last [vaughn2016]. The relearning sessions override the initial ones [rawson2018].
- **So the session enforcer:**
  - completes initial learning (one delayed, unaided retrieval per new objective, plus a spaced retry for misses);
  - leaves the rest of the effort to the later scopes.
- **No second set straight after the sitting (2026-10-25).** While a study session is running, a lesson sitting's own end-of-sitting retention set (up to 3 questions right away) is not asked; the session enforcer asks the same topics when the study session ends, later and oldest first, with the set's missed skills flagged. One delayed retrieval replaces two quick ones close together [karpicke2007; rohrer2006; rohrer2005over; vaughn2016; rohrer2007pashler]. The per-level retention question stays. Switch: `ENFORCER_DEFER_SITTING_RETENTION` (evidence-article/02-retention-review.md P3).
- **Item order.** Delaying the first retrieval helps long-term retention [karpicke2007]. The session enforcer therefore asks the oldest-exposed objectives first, and only after at least 5 minutes since last exposure.

### 3.3 Spacing and the calendar
- **Gap and retention interval work together.** Retention depends on both. The best gap grows as the retention interval grows (839 assessments [cepeda2006]).
  - The ridgeline puts the best gap at about 20-40% of a 1-week interval and 5-10% of a 1-year interval [cepeda2008].
  - Gaps that are too short cost far more than gaps that are a little too long, because the curve rises sharply and then declines slowly [cepeda2009].
- **The owner's calendar roughly matches.** Its gaps (hours, 3-4 days, 7, 14, 30 days) sit near that ridge for horizons from a month to a year: a 7-day gap is about 23% of a 1-month horizon and a 30-day gap about 8% of a 1-year one. The 3-4-day semi-weekly gap is 43-57% of a 1-week horizon, a little above the 20-40% band, which is the side the curve penalises least [cepeda2009]. The exact days (3/4/3/4, bi-weekly on 12, 26, ..., the monthly pocket day) are the owner's rules, not derived from these studies.
- **Outside the lab.** The optimal gap between repeated retrievals grew with the retention interval in 10,514 people's naturally occurring workplace training too [kim2019bigdata].
- **Expanding vs equal gaps** is a non-issue for the final test [latimier2021: g = 0.034; karpicke2007]. One moderator favours the owner's expanding calendar: the more often an item is tested, the more expanding beats uniform [latimier2021].
  - Expanding gaps give higher recall along the way [kang2014].
  - They help where interference between retrievals is high [storm2010], as with a learner taking several subjects.
- **Learners don't do this themselves.** They don't choose long lags on their own [wissman2012]. They believe massing works better (72%) even when spacing wins for 90% of them [kornell2009cram]. So the app schedules it.
- **Breadth of the effect.**
  - Spacing helps higher-level learning [kapler2015; kang2016; carpenter2012].
  - It helps children's generalisation [vlach2012], Year-7 maths [emeny2021] and vocabulary [goossens2012].
  - Personalising the gap to the item and the learner helps more [lindsey2014; mettler2016; sense2016].

### 3.4 Successive relearning: the backbone
- **Definition.** Successive relearning means retrieving each item to a criterion (usually one correct answer) in each of several spaced sessions [rawson2022; dunlosky2015].
- **Effects.**
  - Course exams: at least 10% better, ds .54-1.10 [janes2020]. A secondary summary of [rawson2013power] reports about 10% at the exam and a larger gap about a month later.
  - Initial learning and relearning are subadditive: relearning sessions matter most, and each costs few trials [rawson2011].
- **The format the app copies.** Higham et al. used three sessions two days apart. Correct items were dropped, and wrong ones were re-presented up to 2 more times. End-of-semester recall beat exposure-matched restudy. Higher recall during the relearning sessions was associated with better metacognition, more sense of mastery, more attentional control and lower anxiety (associations, not a relearn-vs-restudy comparison), and students found it enjoyable [higham2022].
- **What it sets.** The enforcer calendar is a successive-relearning schedule. Full tiers use exactly that drop-out rule: until 1 correct, at most 3 attempts, retries spaced at least 3 items apart.
- **Criterion per session is 1 correct.** Higher criteria help on their own [vaughn2011], but not once relearning sessions follow [vaughn2016].

### 3.5 Cumulative and interleaved review
- **Cumulative reviews.**
  - Larger scopes are cumulative, which beat single-topic review on application and novel combinations [mayfield2002].
  - Cumulative exams raised retention up to 18 months [khanna2013], especially for low scorers [lawrence2013].
  - Expecting a cumulative test increases what earlier testing does [szpunar2007]. So the app tells learners later enforcers are cumulative.
- **Interleaving across objectives** is always on.
  - Maths: d = 0.42 immediate and 0.79 delayed [rohrer2015]; classroom RCT d = 0.83 [rohrer2020]; similar concepts [rohrer2012]; concept learning [firth2021].
  - The meta-analysis [brunmair2019] gives g = 0.42 overall and 0.34 for maths, but **g = −0.39 for word materials**, where blocking was better.
  - So, for vocabulary-type items, interleaving means spacing between objectives, not deliberately putting look-alike words side by side.
- **Learners prefer blocking** [tauber2013], so the app sets the order.
- **Rotation.** Retrieving some items can impair recall of related items that were not retrieved [anderson1994]. With prose, testing can also help related untested material [chan2006]. The safe rule is rotation: an eligible objective left out once gets priority next time (built 2026-10-25, `ENFORCER_LEFT_OUT_FLAG`). A meta-analysis also finds that retrieving a subset of items can cause forgetting of the others [murayama2014]; since the effect is not universal [chan2006], the weight stays small.

### 3.6 Picking items by predicted forgetting
- **The model.** The app has a fitted forgetting curve: half-life regression with a learner multiplier and a population fit [settles2016 style; scorecard section 6.14], exported as `scorecard.forgettingCurve` (contract `memory`).
- **Why use it.**
  - Scheduling by predicted recall beat massed study by 16.5% and generic spacing by 10.0% [lindsey2014].
  - Model-based schedules do better than fixed ones [tabibian2019; mettler2016; pavlik2008], also at app scale (220 million review logs; 12.6% over prior schedulers) [ye2022].
  - **Which recall level to practise at.** When time costs are counted, scheduling each item at a predicted recall of 0.86 or 0.94 gave significantly better final recall than 0.40, 0.98 or a fixed every-15-trials schedule (about 40% more than the fixed one) [eglington2020]. That backs the direction of d(p_now): likely misses (p < 0.50) and near-certain items (p > 0.95) are down-weighted. It also suggests the 0.90-0.95 step (0.65) and the 0.70-0.85 band may be set a little low. (The step was removed on 2026-10-25; section 5, step 2.) Caveat: one within-session study on vocabulary pairs, not cross-day review.
- **Two adjustments:**
  - **errors and confidence**: corrections matter most after errors [pashler2005]; feedback doubles retention of low-confidence correct answers [butler2008]; high-confidence errors are corrected well [butterfield2001; metcalfe2017];
  - **difficulty**: benefits are largest when retrieval is effortful but successful [fazio2019; karpicke2007]. Failed retrievals still help when the answer follows at once [kornell2009; hays2013]. So very easy items (p > 0.95) are down-weighted, and likely misses are kept but weighted less.

### 3.7 Items that build understanding, not just recall
- **Testing transfers.** d = 0.40, most of all to application and inference questions [pan2018].
- **Variety matters.**
  - Retrieving and applying with different examples beats the same question three times [butler2017].
  - Higher-order and mixed quizzes improve higher-order tests, while fact-only quizzes do not [agarwal2019; jensen2014].
  - Quizzing definitions doesn't reliably reach conceptual questions [pan2019clicker].
- **Explain prompts.** Self-explanation [bisra2018; chi1989], elaborative prompts after recall [endres2017] and generation [bertsch2007: about .40] add understanding.
- **Procedures.**
  - Worked examples and completion problems [renkl2003; barbieri2023; vanmerrienboer1990] and predict-then-see [kang2011func] help.
  - For a new maths procedure, studying beat testing on an immediate test. At 1 week, testing equalled studying with varied problems and beat it with identical ones [yeo2019].
  - Hence completion items and varied problems.
- **Boundary.** The testing effect may shrink for highly complex material [vangog2015; contra karpicke2015aue]. That is one more reason for completion and varied items there.
- **What it sets.** The transfer and explain share of each tier rises with scope, from about 20-30% in session full to 55% in monthly full. By then, recall of the core is established and the job is flexible use.

### 3.8 Sleep: why "end day session" should be the last thing of the day
- **Size.** Sleep vs equal wake: g = 0.44 over 823 effect sizes, and 0.28 after correcting for selective reporting. It is larger when material was studied more than once [berres2021].
- **Timing.** Memory is best when sleep comes soon after learning [gais2006; payne2012; talamini2008]. Sleep between two sessions halves the practice needed to relearn, and keeps more at 6 months [mazza2016]. An overnight 12-hour gap spaces as well as 24 hours [bell2014]. Children's declarative memory benefits like adults' [wilhelm2008].
- **Background.** [diekelmann2010; rasch2013].
- **Nuance.**
  - Sleep helps restudied items more than retrieved ones, so the testing advantage shrinks after sleep [bauml2014]. Retrieval before bed is not a special booster.
  - What sleep does support is the day's learning in general, and making the next morning's relearning cheaper.
- **So:**
  - the app never gates the day enforcer by clock time. (An evening suggestion was planned here; it is **not built**, and is not proposed, because retrieval before bed is not a special booster [bauml2014]; evidence-article/02-retention-review.md, mechanism 46.)
  - the first spaced retrieval (semi-weekly, or tomorrow's daily review) comes after at least one night.

### 3.9 Overload, motivation and optional behaviour
- **Keep it short and completable.**
  - Show a fixed item count with a progress bar (people speed up near a goal [kivetz2006]).
  - Aim first-try accuracy at 70-85% for a sense of mastery with effort ([fazio2019]; [wilson2019] is a model result for about 85%).
  - Fatigue later in the day lowers performance [sievertsen2016], so there is a 20-minute daily cap (the 20 is an assumption; the study sets no number for review).
- **Low stakes.**
  - Ungraded quizzes beat graded ones [khanna2015].
  - Higher recall during relearning went with lower anxiety [higham2022]. In classes using retrieval practice, 72% of 1,408 middle and high school students said it made them less nervous for tests (self-report) [agarwal2014anx]. Retrieval-practised memories hold up under stress [smith2016stress].
  - No grades, no penalties, no ability praise [mueller1998; henderlong2002]. A third of feedback interventions hurt performance [kluger1996].
- **"None" is the main risk.**
  - Optional quizzes are taken far less than required ones [trumbo2016].
  - Learners who choose to use them do better, but they are self-selected, and incentives invite gaming [kibble2007].
  - Learners test themselves to diagnose rather than to learn [kornell2009son].
  - So:
    - the recommended tier is preselected, since defaults work, d = 0.68 [jachimowicz2019; johnson2003];
    - choice is kept, for autonomy [patall2008; ryan2000];
    - quick is genuinely quick;
    - "none" never deletes the need: items stay due and come back.
- **No hand-picking.** Learners can't hand-pick which items to drop, because letting them drop "known" cards hurt learning [kornell2009spacing].

## 4. Parameters by scope and tier

**Budget.**
- B = tier × min(share × covered study time, cap), and never more than 0.095 × covered time. The 0.095 keeps actual time under the owner's 10% when answers run slow.
- Tier multipliers: quick 0.35, medium 0.65, full 1.0.
- An average item costs about 45 s including feedback, matching `ADAPT_ITEM_MINUTES` = 0.75. The learner's own median per format replaces the default after 20 answers.

| Scope | Covers | Full share / cap | Horizon for p_H | Min lag | Counts as memory check | Full mix (recall / varied / explain-complete) |
|---|---|---|---|---|---|---|
| session | this session | 9.5% / 8 min | 1 d | 5 min | no | 70 / 20 / 10 |
| day | today | 9.5% / 10 min | 3.5 d | 30 min | no | 60 / 25 / 15 |
| semi-weekly | since the last semi-weekly (3-4 d), through its own day | 6% / 12 min | 7 d | 1 d | yes | 55 / 25 / 20 |
| weekly | since the last weekly (7 d), through its own day | 5% / 15 min | 14 d | 1 d | yes | 50 / 30 / 20 |
| bi-weekly | the 14 days ending on its day | 4% / 15 min | 30 d | 1 d | yes | 45 / 35 / 20 |
| monthly | since the last monthly (24-36 d) | 3% / 20 min | 60 d | 1 d | yes | 45 / 35 / 20 |

The params file also allows an out-of-window "due" share (25-40%). It is **not built**, on purpose: the owner's rule is that an enforcer's questions come only from its covered window; older work stays with the daily review. The mix column is **not built** either (section 5a). Horizons, lags and mixes are assumptions inside the evidence's direction.

**Tiers.**
- **Quick:** 1 attempt per item, no retry, fast gradable formats.
- **Medium:** one retry for misses, with a different item for that objective when the bank has one, at least 3 items later.
- **Full:** drop-out to 1 correct, at most 3 attempts.

**Worked examples** (at 45 s per item):

| Scope and study time | Full | Medium | Quick |
|---|---|---|---|
| Session, 40 min | 4 items (3.8 min) | 3 | 2 |
| Day, 2 h | 10-min cap, about 12 | about 8 | about 4 |
| Weekly, 7 h | 15-min cap, about 18 | about 12 | about 6 |
| Monthly, 30 h | 20-min cap, about 24 | about 16 | about 8 |

**Total time on retention.** If a learner always picks full, retention takes roughly:
- 9.5% of study time at session level, and up to 9.5% more at day level (the day enforcer down-weights items already retrieved today);
- about 18% across the calendar scopes.

So the worst case is about a third of study time, and usually less, because budgets are ceilings and only fading items fill them. That buys about five spaced relearning sessions per objective in its first month, which is in the range where successive relearning showed its large effects [rawson2011; janes2020; higham2022].

**Shorter sessions.** For a session too short to fit one item at 9.5%, under about 8 minutes, the session enforcer is not offered. Its items roll into the day enforcer, recorded as "rolled", not skipped.

## 5. How items are picked under the time budget

1. **Eligibility.**
   - The objective is in the scope's pool and past the minimum lag.
   - A lapsed objective becomes a "re-teach" lesson outside the budget, at most `ADAPT_RETEACH` (3). This is the existing adaptation path.
   - An objective kept (answered right) in another enforcer in the last 20 hours is not asked again so soon.
   - As built, eligibility is soft: an objective inside its minimum lag, or kept in the last 20 hours, goes after the eligible ones rather than out, so a short window still has questions (`services/enforcers.js` `score`).
2. **Score.** score = (1 − p_H) × d(p_now) + flags.
   - p_now and p_H come from `adaptation.predictedRecall` (the forgetting curve), with p_H read at the scope's horizon. With no record, the code assumes p_now 0.5 and p_H 0.4; a unit with only a skill (no objective model) uses its mastery as p_now and 0.85 × that as p_H (assumptions).
   - d(p_now) = 1 if 0.50 ≤ p_now ≤ 0.95; 0.6 if p_now < 0.50; 0.3 if p_now > 0.95. Since 2026-10-25 there is no 0.65 step for 0.90-0.95: practice aimed at 0.86 and 0.94 predicted recall was equal-best, and 0.98 worse [eglington2020] (evidence-article/02-retention-review.md P1). `ENFORCER_DIFFICULTY_WINDOW_95=off` restores the step (1 to 0.90, 0.65 for 0.90-0.95). The params file's `difficulty_window` text now says the same.
   - Flags:

     | Flag | Weight | Built |
     |---|---|---|
     | Last attempt wrong | +0.30 | yes (the "within 14 days" limit in the params file is not built) |
     | High-confidence error | +0.25 | yes |
     | Correct but slow (over 2× own median) or unsure | +0.20 | yes |
     | No delayed retrieval yet | +0.15 | yes |
     | Left out last time | +0.10 × min(1, times/2) | yes, since 2026-10-25 (`ENFORCER_LEFT_OUT_FLAG`): times = the learner's latest planned enforcers in a row that had the topic eligible but did not ask it; each plan stores its `left_out` keys |
     | Missed in a sitting whose retention set was left to this enforcer | +0.20 | yes, since 2026-10-25 (`ENFORCER_DEFER_SITTING_RETENTION`), only when no answer flag already fired; weight: assumption (that of "right but unsure") |
     | Prerequisite of the next objectives | +0.10 | not built |

3. **Fill.**
   - Greedy by score per second of expected cost, until the tier budget is used (built, as the allocation rule, section 5a).
   - One first-attempt item per objective (built).
   - Not built: format quotas from the tier mix; overdue items from outside the window (left out on purpose, owner rule); steering the set's mean p_now into the 0.70-0.85 band; "at least 2 skills" (a tier needs at least 2 questions when the pool has 2 or more topics, quick at least 1).
4. **Order.**
   - Interleave by skill (built).
   - Not built: putting confusable concepts near each other.
   - Session scope: oldest exposure first (built).
   - Retries at least 3 items later (built).
   - Close on an item the curve expects right, p_now ≥ 0.8 (built; assumption: a completable, positive end).
5. **Instances.** From semi-weekly up, never reuse the exact question instance from the last exposure when another verified item exists (from objective-items, then the bank).

**Basis.** The direction of each term is evidence (section 3.6). The weights, the 0.5-0.9 window and the band edges are assumptions.

**How many per topic** is section 5a: the fill above takes one first try per objective, and a second only under the allocation rule.

**One limit to know.** The app's default forgetting curve ('basic' features) credits a right answer the same whatever day it came, so the model by itself cannot show a spacing benefit. That is why:
- the parameters count only answers given at least 1 day later as spaced (as `adaptation.predictedRecall` already does with checks);
- they never let same-day enforcer answers inflate spaced counts (that made a freshly drilled objective "look good for ten days", ADAPTIVE-COVERAGE.md);
- refitting with the spaced features is listed as a data step.

## 5a. Combined enforcers: how many retrievals per topic

**The question.** On a weekly's day one enforcer covers the week, the semi-week and that day (owner, 2026-10-24). How many retrievals should each topic get in it, and of which kind, so that retention and understanding are highest for the time? The owner ruled out the obvious answer: not "daily 5 per topic + semi-weekly 3 + weekly 2". The same question applies to every enforcer, single or combined, so the rule below is the one rule for all of them.

**What the evidence says.**
- **One correct retrieval per topic per relearning session is the efficient dose.** Rawson & Dunlosky (533 students, more than 100,000 recall responses) practised concepts to 1 to 4 correct recalls in a first session, then to 1 correct recall in each of 1 to 5 later sessions. Initial criterion and relearning were subadditive: the extra initial recalls helped before relearning and faded as relearning increased. Their prescription is 3 correct recalls the first time, then 3 relearning sessions at wide intervals [rawson2011]. The app's lessons are the first time; the enforcers are the relearning sessions.
- **More in one sitting fades once relearning follows.** A higher initial criterion (1 to 7) did not persist across weekly relearning [vaughn2016]. The benefits and costs of initial spacing, substantial before relearning, were significantly attenuated after 2-3 relearning sessions [rawson2013relearn]. Overlearning's advantage shrinks sharply over the weeks after [rohrer2005over].
- **Spacing beats amount.** In a precalculus course, more practice helped at the end of the course, less robustly than spacing; four weeks later only spacing helped [lyle2020].
- **The extra tries belong to the items that missed.** A dropout schedule (stop an item once it reaches criterion) matched a fixed 3-trial schedule in fewer trials, and it worked best for initially incorrect items [pyc2007]. Errors corrected with feedback are learned well [pashler2005; butterfield2001; kornell2009].
- **Hard items stay hard at equal recalls.** Even after the same number of correct recalls (1 to 11), difficult word pairs were recalled worse later [vaughn2013]. So a topic this learner finds hard may earn one more try, but extra same-session tries do not close the gap; the next spaced session does.
- **Space the repeats inside the sitting.** Long intervals between repeated tests gave about 200% better long-term retention than back-to-back tests; expanding vs equal made no difference [karpicke2011spaced]. Efficiency depends critically on the interval between an item's presentations [pyc2007].
- **Understanding: vary the second try.** Different application questions beat the same question three times on transfer [butler2017]; testing transfers, d = 0.40 [pan2018]; higher-order quizzes help higher-order tests [agarwal2019].
- **A boundary.** For math procedures, three sessions of one correct solve beat one session of three only by d = 0.28 (95% CI 0.08 to 0.49), and solving a problem did not raise the chance of solving the next [rawson2020end]. Procedures need varied, worked practice more than repeated recall.

**The rule** (`retention-enforcer-params.json` `allocation`; `services/enforcers.js` `slots` and `plan`):
1. **The pool** is the union of the covered window's topics (objectives, else skills), deduped. No question comes from outside the window (owner rule).
2. **One first try per topic.** Every topic can get one retrieval with feedback; on medium and full a miss gets its drop-out retry (until right, at most 2 or 3 attempts) [pyc2007; higham2022].
3. **A second, varied try only for a fragile topic, and only on medium and full.** Fragile means: the last answer was wrong (a confident error is one), or at least a third of the window's answers on it were wrong (over 2 or more answers), or its recall now is under 0.50. Low recall at the horizon alone is not fragile: a topic that is secure now but will fade needs the next spaced enforcer, not a second try today [rawson2011], so it raises the score instead. Mature topics (3 or more delayed checks, p_now ≥ 0.90, last answer right) never get a second. End-of-session enforcers stay at one try per topic (the lesson was just now; section 3.2).
4. **Value.** A first try is worth the topic's score (section 5). A second try is worth 0.35 of it.
5. **Fill.** Every slot (topic, 1st) and (topic, 2nd) is ranked by value per planned second, eligible topics first; the budget takes them in that order, a second only after its first. So a fragile topic's second try can beat a secure topic's first, and nothing depends on how many scopes were absorbed.
6. **Age.** It enters through the curve (p_now, p_H) and the flags. A new topic with no delayed check gets +0.15. On an absorbed day, today's topics keep the end-of-day lag (30 minutes), not the scheduled scope's 1 day, so they are not pushed to the back.
7. **Formats.** The first try is a recall question written for the objective (else the bank's on the skill, else the learner's own window check, on scheduled scopes only when nothing else exists). The second is a different question on the same objective, a new example; never the learner's own check again. If no such question exists, there is no second.
8. **Order.** All first tries first, interleaved by skill. Then the second tries in the same topic order, so each is about one first-try round from its first. The sitting closes on a question the curve expects right.
9. **Time.** One topic's try costs its format's time plus expected feedback (plus the expected retry on medium and full). A combined enforcer's full budget is the largest part's full budget plus 0.5 × the other parts', capped at the largest part's cap and at 9.5% of the union's covered active time. A part is one absorbed scope on its own window; the end-of-day part is the day itself. Quick and medium take 0.35 and 0.65 of that. So full stays under the owner's 10%, and the combined budget is always less than the enforcers added up. Example (the test case): 2.6 h of study in the week, all in its last 4 days, 1 h of it today. Separately, full would be 7.7 (weekly) + 9.2 (semi-weekly) + 5.8 (end of day) = 22.7 minutes. Combined: 9.2 + 0.5 × 13.5 = 16.0, capped at 9.5% of 2.6 h, so 14.6 minutes.
10. **The owner's base version** is unchanged: one try per topic, in time order, spread evenly, standard times.

**What is evidence and what is assumption.**
- Evidence (direction): one try per relearning session; extra tries for missed and hard topics; spacing over amount; spacing the repeats inside a sitting; a varied second try for transfer.
- Model: p_now and p_H from the fitted forgetting curve.
- Assumption: the cap of 2 first tries; the 0.35 value of a second; the fragile thresholds (1/3 miss rate, p_now 0.50) and the mature thresholds (3 checks, 0.90); "medium and full only"; the combined-budget weight 0.5.
- **An honest limit.** Only multiple-choice objective items exist today, so a "varied" second try is a new question on the objective, not a new format (no explain-why or worked-example item yet).
- **Not built.** The tier mix percentages (recall / varied / explain); swapping items to steer the set's mean p_now into 0.70-0.85.

**What would refute it.** Topics that got a second try should do better on their next spaced memory check than fragile topics that did not (because the budget ran out), at equal p_now. If they don't, drop the second try and spend the time on more topics.

## 6. What the items are: formats that build understanding

- **Recall.** Cloze, short answer, a numeric answer, or multiple choice with plausible lures. Multiple choice always comes with feedback [rowland2014; little2012; smith2014; roediger2005mc; butler2008mc].
- **Varied application.** A new example or context for the same objective [butler2017; pan2018; agarwal2019; kapler2015].
- **Explain or complete.**
  - Concepts: explain-why or choose-the-best-explanation [bisra2018; endres2017].
  - Procedures: worked-example completion (one faded step) or predict-then-see [yeo2019; vanmerrienboer1990; renkl2003; kang2011func].
- **Covert think-then-reveal.** Only in quick, only where no gradable item exists. It helps learning [smith2013covert], but never counts as evidence, because self-scoring is overconfident [dunlosky2012].
- **Ages.**
  - Preschool and Kindergarten keep the taps-plus-saying-it-aloud tasks, and swap explain items for "show me" taps.
  - Retrieval and spacing are supported for children [fazio2019; vlach2012; carpenter2009hist; emeny2021; wilhelm2008 for sleep].
- **Motor skills** (piano, basketball, chess play) keep their skill-dose plans. Their quiz-able objectives are eligible.

## 7. Feedback

- **After every item, immediately.**
  - Wrong: the correct answer plus 1-2 lines on why. For multiple choice, why the chosen lure is wrong.
  - Correct, fast and sure: a tick, with the explanation on tap.
  - Correct but slow or unsure: show the explanation.
- **Evidence.**
  - Pashler: the answer after an error, +494%; after a correct answer, little effect [pashler2005].
  - Butler: low-confidence correct answers double with feedback [butler2008].
  - After a failed retrieval, feedback should be immediate: with delayed feedback the failed test's benefit disappeared (except on reversed tests) [hays2013].
- **End-of-enforcer recap of misses.** Delayed feedback helps through spacing [butler2007; smith2010kimball; metcalfe2009, especially for grade 6]. Applied studies favour immediate feedback [kulik1988]. So the app gives both: immediate correction plus a delayed second look. For concepts the delayed benefit is conditional: none in two of three experiments and an advantage when feedback came 2 days later [corral2021]; better transfer to new exam problems with feedback a week later in an engineering course [mullet2014].
- **Transfer items** get explanation feedback, not answer-only [butler2013; vanderkleij2015: elaborated 0.49 vs right/wrong 0.05].
- **Tone.**
  - No grades or penalties. Process words. Show "kept X of Y" and when each item comes back [khanna2015; kluger1996; mueller1998].
  - An optional sure/unsure tap on full only, off if it costs over 2 s per item.

## 8. What counts as "retained", and how results feed the record

**A kept item:**
- first attempt correct;
- unaided (no hint, coach or peek);
- not rapid (`OBJ_RAPID_MS` = 1200);
- auto-graded or graded by the cascade, never self-scored.

**Session and day scopes.** A kept item is "consolidated" in-sitting evidence (nc/nw). It is not a memory check, and it never moves an objective from proven to retained.

**Semi-weekly and up.** A kept answer at a lag of at least 1 day is a memory test:
- a forgetting row with `review: true` and spaced counts;
- the coverage memory check (proven → retained under `RETAIN_DAYS`).

This matches the scorecard's definition of a memory test (an answer a day or more after the skill was last practised) and the coverage rule.

**Objective level.** An objective is kept if all its first attempts in the enforcer were kept. After a miss:
- it is flagged (+0.30 next time, plus tomorrow's daily review);
- after a second spaced miss in a row, or p_now < 0.35, it becomes lapsed and goes to re-teach (existing path).

**Recorded and shown.**
- `retention_rate` = kept first attempts / first attempts.
- Retries right after feedback and recap views are logged but are not evidence.
- Time per format calibrates future plans.
- The daily review (`services/review-session.js`) and the enforcers share one due list (`adaptation.reviewQueue` / `durability`). The daily review skips objectives answered in an enforcer in the last 20 hours, unless they were missed there.
- The learner multiplier still comes from `adaptation.memoryAdjust`, which the new memory tests feed.

## 9. Choosing, skipping, resuming

- **Preselected default:** medium.
  - Full when at least 2 pool objectives have a recent miss, or mean p_H < 0.75.
  - Quick for sessions under 15 minutes, or when the learner chose quick the last 3 times.
  - Always changeable; "none" is always there [jachimowicz2019; patall2008; trumbo2016].
- **Unchosen.** Shown once at the next visit with the default preselected: one tap starts it, one dismisses it.
- **Unfinished.** The plan and pointer are stored. On resume, unanswered items are re-scored at the current time, and items answered elsewhere are dropped. Answered items are never re-asked.
- **Validity.**
  - Session: until the day enforcer starts, or 24 h.
  - Day: 48 h.
  - Calendar: until the next enforcer of the same or a larger scope is due.
- **Merging and absorbing.** When enforcers are due together, or fall on one day (a weekly with its semi-weekly; any scheduled enforcer with its end-of-day enforcer), they become one:
  - the pool is the deduped union;
  - the budget is the largest pending budget plus 0.5 × the others;
  - the cap is the largest scope's cap and 0.095 × the union's covered time;
  - what goes in it is one plan under the allocation rule (section 5a), never a quota per scope.
- **"None"** marks nothing as reviewed. The items' need rises and they come back. The choice is never penalised.

This is all design inside the owner's rules (assumption), shaped by the optional-behaviour evidence.

## 10. What the evidence does NOT support

| Practice | Why not |
|---|---|
| Massed review or cramming | Spacing beat massing for 90% of learners, though 72% thought otherwise [kornell2009cram; cepeda2006; donovan1999] |
| Overlearning in one sitting / a high criterion in the session enforcer | The gain shrinks sharply after 1 week [rohrer2005over] and extra problems did nothing at 1 or 4 weeks [rohrer2006]; relearning overrides the initial criterion [vaughn2016] |
| Rereading or restudy as "review" | [karpicke2008; callender2009; dunlosky2013; rowland2014] |
| Requiring expanding gaps | g = 0.034 vs uniform [latimier2021; karpicke2007] |
| Letting learners drop items they feel they know | [kornell2009spacing; dunlosky2012] |
| Self-scored covert recall as evidence | Overconfidence [dunlosky2012] |
| Learning-style matching of enforcer formats | [pashler2008; rogowsky2015; rogowsky2020] |
| Right/wrong-only feedback; multiple choice without feedback | [vanderkleij2015; roediger2005mc; butler2008mc] |
| Fact-only quizzing expecting conceptual gains | [agarwal2019; pan2019clicker] |
| Grades, penalties or ability praise | [khanna2015; kluger1996; mueller1998] |
| A bedtime gate | Sleep helps [gais2006; payne2012], but nothing shows a clock gate beats a suggestion, and sleep favours restudied over retrieved items [bauml2014] |

## 11. Honest limits: evidence vs assumption

**Evidence:**
- retrieval with feedback at the end of a sitting;
- spacing on a calendar that grows with the horizon;
- several relearning sessions to criterion 1;
- cumulative larger scopes;
- interleaving across objectives (not forced for words);
- explanation feedback;
- varied and higher-order items;
- low stakes;
- defaults;
- picking by predicted forgetting.

**Model** (the app's own forgetting curve):
- p_now and p_H;
- the 0.90 targets;
- spaced counts at ≥1 day lag.

The curve is fitted to this app's learners but uses the exponential 'basic' shape. FSRS-style power-law memory is under-predicted at long intervals (scorecard section 6.14), so long-horizon p_H is probably pessimistic. That leads to slightly more reviews than needed, which is the safe direction.

**Assumptions:**
- the budget shares (9.5 / 9.5 / 6 / 5 / 4 / 3%) and the caps;
- the tier multipliers (0.35 / 0.65);
- the score weights, the d(p_now) window and the 70-85% band;
- the mix percentages;
- the validity windows, the merge rule and the guard thresholds;
- the allocation numbers: at most 2 first tries per topic, a second worth 0.35 of a first, the fragile and mature thresholds (section 5a);
- the item-time defaults.

None of these numbers comes from a study. Each was chosen inside the evidence's direction and should be tuned.

**Owner rules (design, not evidence):** full under 10% of the covered time (applied as 0.095); End session vs End day session; the 3/4/3/4 semi-weekly from the anchor; weekly every 7 days; the bi-weekly on days 12, 26, 40, ... (two days from a semi-weekly and from a weekly); the monthly on a free "pocket" day within 3 days of day 30m, next to a semi-weekly; the widest enforcer on a day absorbing the narrower ones and the end-of-day one; questions only from the covered window; unchosen or half-done enforcers offered again on return. The evidence supports the general shape (spaced, expanding, cumulative retrieval; section 3.3) but no study picks these exact days.

**Numbers in the code that no source sets** (re-check 2026-10-24; behaviour unchanged, listed so each is labelled):
- d(p_now) below 0.50 (0.6) and above 0.95 (0.3); the 0.65 step for 0.90 < p_now ≤ 0.95 was removed on 2026-10-25 [eglington2020] and is only back with `ENFORCER_DIFFICULTY_WINDOW_95=off`;
- the left-out flag's +0.10 and its saturation at 2 runs; the +0.20 for a skill whose sitting retention set was deferred;
- p_now 0.5 and p_H 0.4 with no record; p_H = 0.85 × mastery for skill-only units;
- the planned cost of a retry question at p = 0.6; the counted time of one answer capped at 180 s (`item_ms_max`), so a learner idling on a question can spend more real time than the clock counts;
- item times (MC 20 s, typed 35 s, problem 60 s), feedback 3 s right and 25 s wrong, the learner's own median after 20 answers, "slow" = over 2× that median over the last 60 days;
- the default tier: full at 2 or more last-wrong topics or mean p_H < 0.75; quick for a session under 15 minutes or after 3 quick choices in a row;
- the 20-hour "recently kept" window, the retry gap of 3 questions, the closing item at p_now ≥ 0.8, a tier needing at least 2 questions when the pool has 2 or more topics;
- offer validity 24 h (session) and 48 h (day); active time: heartbeats every 30 s, idle gaps counted at most 5 minutes, a session ending after 30 idle minutes, a paused one at the day change or 12 hours;
- the 20-minute daily cap.

[eglington2020] is the only new study that bears on one of these directly: practising at about 0.86-0.94 predicted recall was most efficient in one within-session vocabulary study, so the 0.65 step and the 0.70-0.85 band are the first candidates to tune. The step was removed on 2026-10-25 (02-retention-review.md P1); the band is still not built.

**Where the evidence is thin:**
- Successive relearning is mostly college courses and lab vocabulary. School-age and app studies are few.
- Most spacing studies use verbal material. Higher-level and procedural evidence exists [kapler2015; vlach2012; emeny2021; mayfield2002] but is smaller.
- Optional and default behaviour comes from college courses and other domains, not learning apps.
- Sleep timing comes from lab studies with controlled sleep.

**Effect sizes won't add up.** The g values above are each against restudy or massed controls. Combining them does not add them up. Real gains will be smaller than any single headline number.

## 12. Real-learner data that would confirm or refute it

1. **Telemetry.**
   - Per enforcer: scope, tier, planned and answered items, seconds, retention_rate, abandoned or resumed.
   - Tier choice and "none" rate by scope and age band.
   - Actual full share of covered time (must stay under 10%).
2. **Calibration.** Predicted p vs the result of the next spaced memory check, by scope.
3. **Default-tier experiment.** Randomise the preselected tier per learner-week, which needs owner approval. Outcome: next memory-check accuracy, the 30-day durable share, and the "none" rate.
4. **Holdout.** With consent, hold out 5% of eligible objectives from enforcers (they stay in the daily review). If enforcer-reviewed objectives don't beat held-out ones by at least small classroom-sized effects (g ≈ 0.3-0.5), or quick and none dominate choices, revisit budgets and defaults.
5. **Refit the curve** with `SCORECARD_FORGET_FEATURES=spaced` once enforcer memory tests exist, so the model itself can show (or fail to show) the spacing gain. Then re-tune horizons.
6. **Evening day-enforcer vs earlier.** Next-day retention by time of day. This is observational and confounded, so it is treated only as a hint.

## 13. Sources

All entries are verified. The DOI, verification record, the claim and the number check for each are in `retention-sources.json`.

**New, by topic:**
- **Successive relearning:** rawson2013power, rawson2022, higham2022, janes2020, rawson2018, vaughn2016, vaughn2011, rawson2012, dunlosky2015.
- **Schedules and spacing:** karpicke2007, kang2014, storm2010, cepeda2009, rohrer2007pashler, kapler2015, goossens2012, kupper2014, gerbier2015.
- **Not supported:** kornell2009cram, rohrer2005over, wissman2012.
- **Dose and lag:** pyc2009, pyc2010, lyle2020, pyc2007, vaughn2013, karpicke2011spaced (added for section 5a).
- **Relearning, added for section 5a:** rawson2020end, rawson2013relearn.
- **Session end:** lyle2011, smith2013covert, szpunar2008.
- **Testing reviews:** karpicke2017, carpenter2009hist, moreira2019.
- **Cumulative review:** mayfield2002, rohrer2012, khanna2013, lawrence2013, szpunar2007, anderson1994, chan2006; murayama2014 (verified 2026-10-25, recorded in `evidence-article/02-retention-review-sources.json`).
- **Sleep:** diekelmann2010, rasch2013, mazza2016, gais2006, payne2012, berres2021, bell2014, bauml2014, wilhelm2008, talamini2008.
- **Feedback:** pashler2005, butler2008mc, butler2007, butler2013, roediger2005mc, metcalfe2009, smith2010kimball, hays2013, corral2021.
- **Formats:** endres2017, agarwal2019, jensen2014, butler2017, vangog2015, karpicke2015aue, yeo2019, pan2019clicker, vanmerrienboer1990, kang2011func.
- **Motivation and optional behaviour:** agarwal2014anx, khanna2015, smith2016stress, kibble2007, trumbo2016, johnson2003, jachimowicz2019, kornell2009son, tauber2013, ryan2000, kivetz2006.
- **Added in the independent re-check (scheduling at scale and the recall level to practise at):** eglington2020, kim2019bigdata (new); ye2022 (reused, below).

**Reused from scorecard-sources.json (all verified; 66, with ye2022 added in the re-check):**
- roediger2006, roediger2006power, rowland2014, adesope2017, yang2021, agarwal2021, pan2018, karpicke2008, karpicke2011, butler2010, kornell2009, kang2007, smith2014, little2012, carpenter2009, fazio2019, dunlosky2013;
- cepeda2006, cepeda2008, donovan1999, latimier2021, kang2016, carpenter2012, carpenter2022, rawson2011, kornell2009spacing, lindsey2014, settles2016, tabibian2019, pavlik2008, mettler2016, sense2016, vlach2012, emeny2021, hopkins2016, rohrer2006;
- rohrer2015, rohrer2020, brunmair2019, firth2021;
- butler2008, vanderkleij2015, kluger1996, wisniewski2020, kulik1988, mullet2014, shute2008, mueller1998, henderlong2002, butterfield2001, metcalfe2017, dunlosky2012;
- bisra2018, chi1989, bertsch2007, renkl2003, barbieri2023;
- wilson2019, sievertsen2016, patall2008, callender2009, pashler2008, rogowsky2015, rogowsky2020, szpunar2013;
- ye2022.


**Not verified, not used for any claim (3):**
- Landauer & Bjork 1978 (book chapter; the expanding idea is tested by the verified studies);
- Bjork & Bjork 1992 (book chapter);
- the scorecard's unverified `rawson2013`, replaced by the verified rawson2013power.
