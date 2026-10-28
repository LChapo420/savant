# Market: who takes the ACT and SAT, what prep costs, who else sells it

Written 2026-10-28 for the YC W27 and a16z speedrun applications.

## Read this first: verification status

**None of the outside numbers below have been checked against their source page.** This session's network
policy blocked every source site (act.org, collegeboard.org, education.ne.gov, sec.gov, the competitors'
pricing pages, and so on), so no page could be opened. What is here comes from web-search result summaries.
Those are machine-written paraphrases, and they can be stale or wrong.

So every outside figure is marked **UNVERIFIED**, with the exact page that has to be opened before the
number goes into an application. `SOURCES-TO-VERIFY.md` lists them all as a checklist. Until a row there is
ticked, **do not put that number in front of an investor.** Facts taken from this repository are marked
**Repo** with the file path; those were read directly.

Where two search summaries disagreed, both are shown.

---

## 1. Who takes the ACT

### National, by graduating class (UNVERIFIED)

| Class | Claimed number of ACT takers | Claimed share of graduates | Page to open |
|---|---|---|---|
| 2019 | 1,782,820 | 52% | https://www.act.org/content/act/en/research/reports/act-publications/condition-of-college-and-career-readiness-2019.html |
| 2020 | 1,670,497 | about 49% | https://www.act.org/content/act/en/research/services-and-resources/data-and-visualization/grad-class-database.html |
| 2021 | 1,295,349 (seen only in a school district's PDF, weak) | not found | needs an ACT primary source |
| 2022 | "about 1.35 million" | not found | https://www.act.org/content/act/en/research/services-and-resources/data-and-visualization/grad-class-database-2022.html |
| 2023 | not found ("more than 1.3 million" in generic copy) | about 37% | https://www.act.org/content/dam/act/unsecured/documents/Interpreting-Graduating-Class-Data-2023.pdf |
| 2024 | 1,374,791 ("Total Students in Report") | not found | https://act.org/content/dam/act/unsecured/documents/2024-act-national-graduating-class-profile-report.pdf |
| 2025 | "almost 1.4 million" | about 36% | https://www.act.org/content/act/en/newsroom/newsroom-archive/act-releases-2025-grad-class-data-on-college-and-career-readiness-10152025.html |

What can be said once these are confirmed: the ACT had about 1.8 million takers per class before 2020 and
about 1.3 to 1.4 million since. That is a smaller, flat market, not a growing one. Say so plainly if asked.

### Nebraska (UNVERIFIED)

- The Nebraska Department of Education's ACT page reportedly says every third-year high-school student must
  take the ACT, with a spring 2026 paper window that opened March 24, 2026.
  Page: https://www.education.ne.gov/Assessment/ACT
- The same page reportedly says Nebraska still requires the Science section for its state test, although
  Science is optional nationally.
- An NDE document reportedly names ACT as the state's college-admission-test contractor from July 1, 2026 to
  June 30, 2027.
  Page: https://www.education.ne.gov/wp-content/uploads/2025/12/File_-Rationale-Intent-to-Award-college-admission-test-2025.pdf
- NDE's October 15, 2025 release reportedly gives Nebraska's 2025 average composite as 19.2. The summaries
  disagree on whether it called Nebraska the highest or the fourth-highest among states that test nearly
  every student. Page: https://www.education.ne.gov/press_release/nebraska-students-outscore-peer-states-on-act/
- **Not found:** how many Nebraska students take the ACT each year. Look in ACT's Nebraska graduating-class
  profile, or the Nebraska Education Profile (https://nep.education.ne.gov).

Why Nebraska matters for Savant: if every junior is tested, every Nebraska high-school family is a potential
user, and the founder lives there. That is a home-market argument, not a market-size one.

### The enhanced ACT (UNVERIFIED)

The search summaries agree on the shape but not on all the dates:
- shorter (reportedly 131 scored-plus-field-test questions instead of 215, and about 125 minutes instead of
  175 without Science);
- Science optional and out of the composite, which becomes the average of English, Math and Reading;
- online national testing first (reported as spring 2025), paper national testing from September 2025, and
  state school-day testing from spring 2026.

Pages: https://act.org/actenhancements , https://studentblog.act.org/the-new-act-test

**Repo:** the app's ACT curriculum was built for the enhanced format: English 50 questions in 35 minutes,
Math 45 in 50, Reading 36 in 40, optional Science 40 in 40, composite = English + Math + Reading
(`docs/CURRICULUM-BUILD-GUIDE.md` section 9). Those numbers came from an earlier session's research and also
need the act.org check, because one search summary gave a different Math timing.

## 2. Who takes the SAT (UNVERIFIED)

| Class | Claimed number of SAT takers | Page to open |
|---|---|---|
| 2023 | 1.91 million | https://www.k12dive.com/news/act-sat-scores-decline-assessment-college-admissions/730096/ (secondary) |
| 2024 | "more than 1.97 million" (this may count PSAT takers too; check) | same, plus https://reports.collegeboard.org |
| 2025 | "more than 2 million", the first time since 2020; about 1.36 million through School Day | https://newsroom.collegeboard.org/sat-participation-class-2025-surpasses-2-million-test-takers-first-time-2020 |

Classes 2019 to 2022 were not looked up. The source is the College Board's SAT Suite Annual Reports at
https://reports.collegeboard.org.

**Overlap:** many students take both tests. No source for the overlap was found, so the ACT and SAT counts
**cannot be added together**. The market-size section below shows a range for that reason.

## 3. Registration fees (UNVERIFIED)

- SAT: $68 for test dates from August 23, 2025.
  Page: https://satsuite.collegeboard.org/sat/registration/fees-refunds/test-fees
- ACT: the base fee is not confirmed. Third-party pages say $68 to $70 without Writing. An act.org snippet
  reportedly lists a $4 Science add-on and a $25 Writing add-on.
  Page: https://www.act.org/the-act/registration

## 4. What families spend on test prep

**No credible national survey of family spending on ACT or SAT prep was found.** The numbers that turn up
are weak, and should not be used as market data:

- a 2009 Eduventures estimate of about $2.5 billion a year on test prep and tutoring, seen only as quoted by
  The Fiscal Times in 2013 (https://www.thefiscaltimes.com/2013/05/01/SAT-Tests-Another-Drain-Family-Budget).
  It is secondhand, 17 years old, and the original is probably paywalled. UNVERIFIED.
- a September 30, 2025 vendor press release (Wiingy) claiming SAT tutors average $62 an hour across 3,600
  tutors on five platforms
  (https://www.globenewswire.com/news-release/2025/09/30/3158961/0/en/sat-prep-tutoring-costs-63-more-than-language-learning-wiingy-study-finds.html).
  It is a vendor study. UNVERIFIED.
- tutoring companies' own blog price ranges. These are marketing pages, not data.

**Repo:** `docs/ROADMAP.md` line 24 states human tutoring at "$40–$80/hour", without a source. Do not repeat
it without one.

What can honestly be said: families who buy prep pay roughly $100 to $1,000 for courses and much more for
tutoring, judging by the list prices in section 6 (once those are confirmed). How many families buy, and how
much in total they spend, is **not known** from any source found here.

## 5. How much prep actually raises scores (UNVERIFIED, but important for honesty)

- Briggs, *Preparation for College Admission Exams* (NACAC, May 2009), as reported by Education Week and the
  Chronicle of Higher Education: the average coaching effect is "positive, but slight". That is reportedly
  about 10 to 20 points on old-SAT math and 5 to 10 on critical reading, and **under 1 point on the ACT
  composite**. Coverage: https://www.edweek.org/teaching-learning/entrance-exam-coaching-how-much-payoff/2009/05.
  The NACAC PDF itself has to be found and opened.
- ACT research on retesting: one brief reportedly found an average composite gain of 1.14 points between
  first and last test, about 8.3 months apart.
  Page: https://www.act.org/content/dam/act/unsecured/documents/2022/R2274-Six-Things-About-Score-Gains-From-Retesting-10-2022.pdf

Why this matters: a student who just retakes the ACT gains about a point on average (if confirmed), and
coaching adds little on top. Any claim that Savant "raises scores" has to beat **retesting alone**, not zero.
`ACT-READINESS.md` section 5 designs the measurement with that in mind.

## 6. Competitors

All prices are UNVERIFIED (search summaries of the pricing pages). Open each page and record the price and
the date before using it.

| Product | Price (claimed) | Approach | Where Savant differs (from the repo, see note) | Page to open |
|---|---|---|---|---|
| **Khan Academy** | Free | Official SAT practice partner of the College Board. **No official ACT partnership was found.** | Khan's free official prep is for the SAT. For ACT students there is no free official equivalent from Khan. | https://www.khanacademy.org |
| **Khanmigo** | $4/month or $44/year for learners and parents; free for US K-12 teachers | AI tutor on top of Khan content | Khanmigo is a general tutor; Savant is a placed, levelled ACT path with spaced review. | https://www.khanmigo.ai/parents |
| **Magoosh ACT** | From $129/year; live-class tier reportedly $399 or about $600 (summaries conflict); +4-point guarantee | Video lessons and a question bank | Magoosh is self-directed; Savant schedules review per learner. Magoosh has a guarantee and a track record; Savant has neither yet. | https://act.magoosh.com/plans |
| **PrepScholar ACT** | Self-paced about $397; with AI assistant $495; live classes $895; tutoring from $995; 4-point guarantee | Diagnostic test, then a personalised study plan | Closest in concept (diagnose, then a custom plan). PrepScholar is established and has a guarantee. | https://www.prepscholar.com/act-test-prep/act-faq/ |
| **The Princeton Review ACT** | SAT & ACT self-paced "starting at $499"; higher tiers reportedly $2,199 (course) and $7,560 (tutoring); score guarantee | Courses, live classes, tutoring | Price: a software-only product can sit far below these. | https://www.princetonreview.com/college/act-selfguided-course , https://www.princetonreview.com/legal/guarantee |
| **Kaplan ACT** | Not found | Courses and tutoring. ACT announced Kaplan as its official live-prep partner in April 2016, and ACT sells "The Official ACT Self-Paced Course, Powered by Kaplan". Whether that is still exclusive is unknown. | Kaplan has the official relationship; Savant does not. | https://www.act.org/content/act/en/newsroom/act-kaplan-partnership.html , https://www.kaptest.com/act |
| **ACT's own prep** | Free practice tests through MyACT; free practice booklet; fee-waiver students reportedly get a year of the official course free; official prep guide reportedly $39.95 | Official materials | Savant should **use** the free official tests as its before-and-after yardstick (`ACT-READINESS.md` section 5), not compete with them. | https://act.org/freetestprep |
| **ChatGPT study mode** | Included in ChatGPT, free tier included | Reportedly launched July 29, 2025; Socratic hints instead of answers | A chat tool waits to be asked. Savant decides what to study next, places the learner, and brings material back before it is forgotten. The study mode is free and good, and that is the strongest objection to Savant. | https://techcrunch.com/2025/07/29/openai-launches-study-mode-in-chatgpt (OpenAI's own post not found) |
| **Gemini Guided Learning** | Included in Gemini | Reportedly announced August 6, 2025; built on LearnLM | Same as above. | https://techcrunch.com/2025/08/06/google-takes-on-chatgpts-study-mode-with-new-guided-learning-tool-in-gemini/ |
| **Claude learning mode** | Included in Claude | Reportedly announced April 2, 2025 with Claude for Education; Socratic guidance | Same as above. | https://www.anthropic.com/news/introducing-claude-for-education |
| **Duolingo** (the adaptive-learning comparison) | Free with ads; paid subscriptions | Gamified daily practice, streaks. Q2 2026 (quarter ended June 30, 2026), reportedly: 58.7M daily active users, 140.6M monthly active users, 12.7M paid subscribers, $298.5M revenue. | Duolingo proves people will build a daily habit around learning software. It does not do test prep. | https://www.sec.gov/Archives/edgar/data/0001562088/000162828026053299/q2fy26duolingo6-30x26share.htm (Q3 2026 may be out by now; use the latest filing) |
| AI-native SAT prep startups (Acely, LearnQ, others) | Acely reportedly $49 to $149/month; others from aggregator pages only | Mostly SAT-focused | No ACT-specific AI-native competitor with a confirmed price was found. That is a gap in this research, not proof there is none. | https://acely.com |

**Note on the "where Savant differs" column.** It describes what the code does, from `ACT-READINESS.md`. It
does **not** say Savant works better. There is no outcome data yet: one user, who is the founder. The
competitors with guarantees have years of students behind them.

### Where an adaptive, retention-focused product is different

What Savant actually does today (**Repo**; details and file paths in `ACT-READINESS.md`):
- **Places** the learner into one of 16 ACT grades, each named by a target composite band (5 to about 10, up
  to 36 on every sitting), using a 112-question placement set (`curriculum-build/LIVE-CHANGES-2026-10-24.md`).
- **Builds a path** of levels (lessons, practice, Master and Grand Master quizzes at a 75% pass mark, a grade
  Final) and keeps earlier skills in review, "which is what keeps level 200 from forgetting level 3"
  (`config/curriculum.js` around line 1005).
- **Diagnoses failed quizzes** from the actual wrong answers and teaches those areas before a retry (README).
- **Runs on near-zero AI cost** through free model tiers, with deterministic question generators as the
  floor (`curriculum-build/MODEL-LINEUP.md`, `content/bank.js`).

The argument in one line: most prep products teach and then test; the ones that adapt mostly adapt the study
plan. A product built around retention keeps what was learned in week 2 alive on test day in week 8. That is
a **hypothesis** for Savant, backed by learning research the repo cites (`curriculum-build/EVIDENCE-ARTICLE.md`).
It is not yet a measured result.

The honest weak spots:
- The free AI study modes are good, free, and already in students' hands.
- Savant has no official ACT content and no outcome data.
- PrepScholar already sells "diagnose, then a personalised plan".

## 7. Market size, bottom-up

Every input is either an UNVERIFIED figure from above or an **assumption**, and each is labelled. Change the
assumptions and the arithmetic stays the same.

**Inputs**

| Input | Value | Status |
|---|---|---|
| ACT takers per graduating class | 1,374,791 (class of 2024) | UNVERIFIED (section 1) |
| SAT takers per graduating class | 2,000,000 (class of 2025, "more than 2 million", rounded down) | UNVERIFIED (section 2) |
| Overlap between ACT and SAT takers | unknown | not found |
| Savant price | $99 a year | **Assumption.** `docs/ROADMAP.md` line 188 plans "Pro at $14.99/mo or $99/yr". The landing site says "Prices are not set" (`site/index.html` line 274). |
| One paid year per test-taker | 1 | **Assumption:** a student preps for one test season. |

**Ceiling: every ACT taker in one class pays for one year**

1,374,791 students × $99 = **$136,104,309 a year** (about $136M).

**Ceiling with the SAT added.** Because the overlap is unknown, this is a range:
- if every ACT taker also takes the SAT (largest overlap), the market is just the SAT count:
  2,000,000 × $99 = **$198,000,000** (about $198M);
- if no one takes both (no overlap), the counts add:
  (1,374,791 + 2,000,000) × $99 = 3,374,791 × $99 = **$334,104,309** (about $334M).

The real figure is somewhere between about $198M and $334M a year. That is the ceiling for US ACT and SAT
prep at Savant's assumed price, before any other product line.

**What share might pay (ACT only).** The shares are **assumptions**, not data:

| Share of ACT takers who pay | Paying students | Revenue a year (× $99) |
|---|---|---|
| 1% | 13,748 | $1,361,043 |
| 3% | 41,244 | $4,083,129 |
| 5% | 68,740 | $6,805,215 |

**How to read this honestly.** ACT and SAT prep alone is a market of at most a few hundred million dollars a
year at a software price. It is a beachhead, not the whole company. The case for a large company is the
expansion `docs/PRODUCT-DECISIONS.md` describes: the same engine across subjects (the app already has math,
English, reading, Spanish, IQ, chess, piano and basketball tracks), plus school and learning-centre plans.
That expansion is a plan, with no users yet. Say it that way.

**Not included, deliberately:**
- the family-spending figure ($2.5B, 2009), because it is too old and too secondhand to anchor anything;
- international students and other tests (PSAT, AP, state tests);
- school and district licences, which have no price set.
