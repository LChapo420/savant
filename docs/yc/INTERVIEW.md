# YC interview prep: format, the 40 likeliest questions, truthful answers

Written 2026-10-28 for Landon Davidshofer (Savant). Applications: YC W27 and a16z speedrun.

## Read this first

**What is verified and what isn't.** The founder facts in this file are the ones Landon gave. Repo facts were
read from this repository, with paths. **Everything about YC and a16z (dates, format, deal terms, age policy)
is UNVERIFIED:** this session's network blocked ycombinator.com and a16z.com, so no page could be opened, and
web-search summaries are all there is. One search summary even said its YC dates came from an old snapshot.
Open the pages in section 1 before relying on any of it. `SOURCES-TO-VERIFY.md` has the checklist.

**The rule for every answer below:** say only what is true today, in numbers, and say the weak parts first.
YC partners hear exaggeration all day, and one overstated claim costs more than the truth would have. If
something changes before the interview (users, results), update the numbers. Never round them up.

---

## 1. Dates, format and terms (all UNVERIFIED; check first)

**Check these three today. They decide whether and how you apply:**

1. **Does YC fund founders under 18?** No YC FAQ text was found. The only lead is a Fortune article
   (2025-09-08, https://fortune.com/2025/09/08/yc-cofounder-gen-z-warning-high-school-not-time-to-start-startup-reddit-airbnb-dropbox),
   which, per a search summary, reports that YC "typically does not look at anyone younger than 18 who can't
   legally enter into contracts". **If that is YC's policy, it is the most important fact in this whole pack.**
   Look at https://www.ycombinator.com/faq for an age entry, and at
   https://www.ycombinator.com/early-decision (YC's Early Decision for students). Ask YC directly if it's
   unclear. Have the answer to question 30 ready either way.
2. **YC W27 deadline.** A search summary says "Winter 2027 on-time deadline is November 2, 2026 at 8pm PT",
   with decisions by December 11 and the batch January to March in San Francisco. Another search said those
   dates may be from an old snapshot. Page: https://www.ycombinator.com/apply
3. **a16z speedrun deadline and eligibility.** A search summary of an a16z post dated 2026-10-14
   (https://a16z.com/applications-for-a16z-speedrun-sr008-are-now-open/) says SR008 applications are open
   October 12 to November 1, 2026, with the residency February 1 to April 18, 2027. No age rule was found.
   FAQ: https://speedrun.a16z.com/faq

**Interview format** (UNVERIFIED):
- YC's apply page reportedly says "Most interviews will be held by video conference" and that YC "typically
  makes decisions the same day as your interview" and gives everyone who interviews detailed feedback
  (https://www.ycombinator.com/apply).
- YC's interview guide page (https://www.ycombinator.com/interviews) reportedly says you don't need mock
  interviews and should not prepare a presentation.
- The length, about 10 minutes with two to four partners, comes only from third-party guides, for example
  https://pilot.com/blog/tips-y-combinator-interview. No YC page confirming it was found.
- Expect fast, short questions and interruptions. Answer in one or two sentences, then stop. They will ask
  for more if they want it.

**Deal terms** (UNVERIFIED, from search summaries):
- YC: $500,000 total, as $125,000 on a post-money SAFE for 7% plus $375,000 on an uncapped MFN SAFE
  (https://www.ycombinator.com/deal).
- a16z speedrun: up to $1M, with $500K upfront on a SAFE "in exchange for 10% equity" and up to $500K more
  in the next qualifying round (https://speedrun.a16z.com/faq).
- **Solo founders:** YC's FAQ reportedly says it "regularly accept[s] solo founders" while recommending a
  co-founder. speedrun reportedly accepts solo founders but prefers teams.

**Where the question list comes from.** No official YC question list was found. The 40 below are this
company's likeliest questions, drawn from the categories that recur in the most-cited public lists (open them
and compare): https://www.alexanderjarvis.com/resources/collections/yc-interview-question-collection/ ,
https://www.checklyhq.com/blog/just-did-the-ycombinator-interview-here-are-my-notes/ ,
https://ltse.com/software/knowledge-base/y-combinator-interview . Those are third-party lists, also
unverified.

---

## 2. The facts you can use (and nothing else)

**About you** (as given):
- Landon Davidshofer, 16, Omaha, Nebraska.
- Graduated from Penn Foster online high school in January 2026 with a 4.0 GPA.
- Previously ran a web design company, **Edit Simple**: built the sites yourself, and after hundreds of hours
  of cold calling got **two paying customers at $300 each**.
- Started Savant **2 to 3 months ago**, built it largely with AI coding tools, mostly Claude.
- Solo. You plan to add a friend if funded.
- Your parents support you and will sign documents. You can relocate to San Francisco with a parent.
- About **$1 in the bank**; running on donated AI credits.
- Wedge: ACT prep, because you are about to take the ACT and SAT yourself and want perfect scores.
- **One real user today: you.**
- A sealed, externally time-stamped Spanish self-experiment is running (`spanish-check/PROTOCOL.md`). The
  protocol allows up to five sittings, one per day, from October 27 or 28 to October 31. The seal is dated
  2026-10-28T02:49Z (`spanish-check/SEAL.txt`), so if the first sitting was on the 28th there are four.

**About the product** (from the repo; details in `ACT-READINESS.md`):
- The ACT track is 16 grades, each named by a target composite band, from "5 to about 10" up to "36 on every
  sitting", with 9,807 levels in total (`content/act-grades.js`).
- A stored 112-question ACT placement quiz ("Find my grade") picks the starting grade
  (`curriculum-build/LIVE-CHANGES-2026-10-24.md`).
- Every level is a lesson, practice, a Master quiz (every 25th level), a Grand Master quiz (every 100th) or a
  Final. A quiz passes at 75%. Below that, the app reads the actual wrong answers and teaches those areas
  before a retry (README).
- Earlier skills stay in review as the learner moves on (`config/curriculum.js`, around line 1005).
- Questions come from deterministic generators for every ACT skill (the "floor", so there's never a dead
  screen) plus AI-written lessons and items checked by a fact-checking pipeline (`content/bank.js`,
  `curriculum-build/MODEL-LINEUP.md`).
- AI runs on free model tiers first, with Claude as a capped last resort: a hard $24 total stop, of which
  $11.20 was spent before the ledger existed (`curriculum-build/MODEL-LINEUP.md`).
- The same engine also serves math, English, reading, Spanish, IQ, chess, piano and basketball tracks
  (`docs/PRODUCT-DECISIONS.md`).
- Size: about 74,000 lines in `routes/`, `services/`, `config/` and `public/js/` (counted with `wc -l` on
  2026-10-28), largely written with AI tools.
- Prices are not set (`site/index.html` line 274). The roadmap's planning figure is "Pro at $14.99/mo or $99/yr"
  (`docs/ROADMAP.md` line 188).

**Never say:** that Savant raises scores; that it has users other than you (unless it does by then, and then
give the exact number); that it is COPPA or FERPA compliant; that the Spanish result proves anything about
other learners; any market number from `MARKET.md` that hasn't been verified.

---

## 3. The 40 questions

Each has an **answer outline** (not a script: say it in your own words), **evidence** to have open, and, where
it matters, a **trap** to avoid.

### A. What it is

**1. What are you making?**
- Answer: "Savant is an adaptive tutor. It figures out exactly what you know, teaches what's missing, and keeps
  bringing old material back so you don't forget it before test day. We're starting with ACT prep."
- Evidence: the app open on the ACT placement quiz and a path page.
- Trap: listing all nine subjects. Lead with the ACT.

**2. Why ACT prep first?**
- Answer: "I'm taking the ACT and SAT myself and I want perfect scores, so I'm the user. ACT prep has a hard
  deadline (the test date) and a number that goes up or doesn't, so I can tell whether the product works.
  And in Nebraska every public-school junior takes the ACT."
- Evidence: `MARKET.md` Nebraska section, once verified.
- Trap: don't claim the Nebraska fact until it's checked on education.ne.gov.

**3. Who exactly is the user?**
- Answer: "A high-school junior or senior with a test date 6 to 12 weeks out who can't afford, or doesn't want,
  a $500-plus course or a tutor. Second: their parent, who often pays."
- Evidence: the competitor price table in `MARKET.md` (once verified).

**4. What's new here? Why now?**
- Answer: "Two things changed. AI can now write and check a lesson for one student cheaply. I run almost all of
  it on free model tiers. And the ACT itself changed in 2025: shorter, with Science optional, so prep has to be
  rebuilt for the new format anyway." Then the core idea: "Most prep teaches and then tests. Savant is built around not
  forgetting, which is what loses points between practice and test day."
- Evidence: `curriculum-build/MODEL-LINEUP.md` (the free lineup, the $24 cap); the enhanced-ACT facts once
  verified.
- Trap: "AI tutor" alone isn't new. Say what's different.

**5. Why would anyone use this instead of ChatGPT's study mode, or Khan Academy?**
- Answer: "ChatGPT's study mode is good, and free. But it waits for you to ask. You have to know what to study.
  Savant places you, decides what's next, and brings back what you're about to forget. Khan's free official
  prep is for the SAT. I didn't find an official free Khan ACT course."
- Evidence: `MARKET.md` competitor table.
- Trap: never say ChatGPT is bad at this. Partners use it daily.

**6. What do you understand that others don't?**
- Answer, honestly: "That the scarce thing in test prep isn't explanations. Those are free everywhere now.
  It's knowing what you've stopped remembering. I built the product around that." Then add: "It's a
  hypothesis. I'm measuring it."
- Evidence: the retention design (`curriculum-build/RETENTION-ENFORCERS.md`) and the measurement plan
  (`ACT-READINESS.md` section 5).

### B. Users and evidence

**7. How many users do you have?**
- Answer: "One: me." Then the honest next sentence: "This week I started reaching out to ACT students in
  Omaha and online. As of [date], [N] have signed up and [M] have used it twice." **Give only real numbers.**
- Evidence: the tracker in `OUTREACH.md` section 5; the admin metrics page if that's built.
- Trap: rounding up, or counting sign-ups as users.

**8. Why haven't you launched yet?**
- Answer: "I spent two months building the engine and the content, and I'm only now putting it in front of
  people. That's my biggest mistake so far, and I'm fixing it this week." Partners respect owning this.
- Trap: blaming the product not being "ready".

**9. How will you get your first 100 users?**
- Answer: be specific. "Nebraska's state ACT is in the spring, so January to March is the local season.
  Counsellors' ACT resource lists, EducationQuest's free resources list, College Possible's coaches, library
  teen programmes, homeschool groups, and helping in r/ACT and ACT Discords." Name the ones that replied.
- Evidence: `OUTREACH.md`, with the reply column filled in.

**10. What have users said?**
- Answer: what the first testers actually said, word for word, including the bad parts. If nobody has used it
  yet: "Nobody but me yet. Here's what I learned using it myself."
- Trap: inventing a typical-user story.

**11. What's your retention?**
- Answer: "I don't have a retention number yet. One user isn't a cohort. I'll measure week-one return rate
  (did they come back for a second session) on the first beta testers."
- Trap: quoting your own streak as retention.

**12. How do you know it works?**
- Answer: "I don't yet, for anyone but me. Here's how I'll find out: each student takes a free official ACT
  practice test, timed, before and after a few weeks on Savant. I compare that with what retesting alone gives,
  because retesting by itself raises scores about a point on average." (The retest figure is UNVERIFIED: check
  ACT's research brief first, `MARKET.md` section 5.)
- Evidence: `ACT-READINESS.md` section 5, the measurement protocol.

**13. What did the Spanish experiment show?**
- Answer: report the result exactly as `spanish-check` scored it, **whatever it is, including no change**.
  Then say what it is: "One learner, me, four or five short sittings over four days. A public sentence pool
  (Tatoeba) the app's lessons never used, sealed and time-stamped before the first sitting so I couldn't pick
  the questions afterwards." Then its limit: "It shows I measure honestly. It doesn't prove the product works
  for anyone else."
- Evidence: `spanish-check/PROTOCOL.md` (section 11 lists what it does not prove), `SEAL.txt`, `VERIFY.md`, and
  the results.
- Trap: calling it a study, or using it as proof for ACT.

### C. Market and competition

**14. How big is this market?**
- Answer: "About 1.4 million students take the ACT each year and about 2 million the SAT. At a $99-a-year
  software price, US ACT and SAT prep is a few hundred million dollars a year at most. That's a beachhead. The
  company is the engine applied to every subject."
- Evidence: `MARKET.md` section 7, with the arithmetic. **Only quote the counts once they're verified.**
- Trap: a giant top-down "education is a $X trillion market" number.

**15. Isn't the ACT shrinking? Aren't colleges test-optional?**
- Answer: "Yes. ACT takers fell from about 1.8 million (class of 2019) to about 1.4 million. But several
  selective colleges have brought test requirements back, and in states like Nebraska every junior still takes
  the ACT." (All UNVERIFIED: check the counts and each college's own announcement first.)
- Trap: denying the decline.

**16. Who are your competitors?**
- Answer: "Princeton Review, Kaplan and PrepScholar sell courses and tutoring from hundreds to thousands of
  dollars. Magoosh sells a cheaper self-paced course. Khan is free, but its official prep is the SAT. And the
  free AI study modes in ChatGPT, Gemini and Claude."
- Evidence: `MARKET.md` section 6.

**17. What do families pay for prep today?**
- Answer: "Course list prices run from about $129 to the thousands, and tutoring is more. I couldn't find a
  credible survey of total family spending, so I won't quote one."
- Trap: the old $2.5 billion figure. It's from 2009 and secondhand.

**18. Why won't Khan, Duolingo or OpenAI just build this?**
- Answer: "They might. OpenAI already built study mode. My bet is that a general assistant won't build a test
  calendar, a placement for every skill on one test, and a review schedule that brings everything back on time,
  because that's a narrow product. I can go deeper on one test than they will, and move faster."
- Trap: "they can't".

**19. Why does the app have nine subjects? Isn't that unfocused?**
- Answer: "It was. I built the engine to be general, and the subjects tested it. For users I'm focused on one:
  the ACT. The other subjects are the expansion path once the ACT works."
- Trap: defending the breadth as the strategy.

### D. Product and tech

**20. Walk me through a student's first 10 minutes.**
- Answer: the real flow. Sign-up, with the age question first. Pick ACT. "Find my grade", a short placement quiz.
  Land in one of 16 grades. The first level is a lesson, never a quiz on untaught material (README: "Placement
  lands you on a multiple of ten"). Then practice, with a recall question at the end of the level.
- Evidence: do it live, or bring a screen recording.

**21. How does placement work?**
- Answer: "112 stored questions across the 16 ACT grades, seven per grade. Each question's position was set
  by independent model judges, and the answer keys were checked blind by models from a different family than
  the one that wrote them."
- Evidence: `curriculum-build/LIVE-CHANGES-2026-10-24.md` (the ACT placement set row);
  `content/placement-calibration/act.json`.
- Trap: calling it "calibrated on students". It was calibrated by model judges, not by real students' results.

**22. What is actually adaptive?**
- Answer: "Three things: where you start (placement), what you study (it skips what you prove and reteaches
  what you get wrong, from your actual answers), and when you review (earlier skills come back on a schedule)."
- Evidence: README sections on placement and failing a checkpoint; `ACT-READINESS.md`.

**23. AI makes mistakes. How do you know the content is correct?**
- Answer: "Every skill has a deterministic question generator written in code, so there's always a correct
  question even with no AI. AI-written lessons go through a fact-checking pipeline. And my own eval showed no
  free model could replace a strong model as the final fact check, so a stronger model is kept as the last gate."
- Evidence: `content/bank.js` header comment; `curriculum-build/MODEL-LINEUP.md` "Eval results (2026-10-22)";
  `curriculum-build/CONTENT-FACT-AUDIT.md`.
- Trap: "it's 100% accurate".

**24. What does a user cost you?**
- Answer: "Almost nothing today. Most AI calls go to free model tiers, and the one paid model has a hard cap.
  But free tiers aren't something to build a business on: their terms may not allow production use or minors'
  data. So the honest unit cost is what a paid, no-training provider would charge, and I'm working that out."
- Evidence: `PRIVACY.md` section 4, gap 1.
- Trap: "it's free to run". That depends on terms you haven't confirmed.

**25. You built this largely with AI. Do you understand the code? Could you maintain it?**
- Answer: "Yes, I built it by directing AI tools, mostly Claude, and I read and test what they write.
  [Give a real example: a bug you found, a decision you made, like the consent gate or the spend ledger.]
  There are tests for the parts that matter; the parental-consent suite has 187 checks."
- Evidence: `scripts/consent-test.js`; `npm test`.
- Trap: pretending you hand-wrote it, or saying you don't read it.

**26. What's the hardest technical problem?**
- Answer: pick a real one. "Making AI-written questions trustworthy: exactly one right answer, at the right
  difficulty, every time." Or: "Running on free models that rate-limit and fail. I built a pool that runs them
  in parallel and falls back to code."
- Evidence: `curriculum-build/MODEL-LINEUP.md` (the pool section).

**27. How do you handle kids' data?**
- Answer: the "what you can say today" paragraph in `PRIVACY.md` section 5, including what isn't done.
- Trap: "we're COPPA compliant".

### E. You

**28. Tell us about yourself.**
- Answer, in 30 seconds: "I'm 16, from Omaha. I finished high school online in January with a 4.0. Before
  Savant I ran a web design company: I cold-called for hundreds of hours and got two paying customers at $300
  each. Now I'm building Savant full-time, because I'm about to take the ACT and SAT and wanted a better way
  to study."
- Trap: inflating Edit Simple. Two customers, $600 total. Say it exactly.

**29. You're 16. Why not go to college first?**
- Answer: "I've already finished high school. I can do this full-time now, and the best time to build test
  prep is while I'm a test-taker myself." If you plan to go to college later, say so.

**30. You're a minor. Can you sign the documents?**
- Answer: "My parents support this and will sign anything that needs a guardian's signature, and one of them
  can move to San Francisco with me." **Find out first** what YC's actual policy for under-18 founders is
  (section 1), and whether a company you can't legally sign for needs a parent as director or officer. Ask a
  lawyer or YC directly; this file doesn't answer it.
- Trap: guessing at the legal structure.

**31. Why are you a solo founder?**
- Answer: "Because I started alone and could build it alone with AI tools. I know a solo founder is a risk. If
  funded, I plan to bring on [the friend: who they are and what they'd do]." Only say what is actually agreed
  with the friend.
- Trap: naming a co-founder who hasn't agreed.

**32. Tell us about Edit Simple. What did you learn?**
- Answer: "That I can sell, and that selling is hard: hundreds of hours of calls for two customers. And that
  web design for small businesses wasn't something I cared about enough. With Savant I'm the user."
- Evidence: the two sites, if they're still live; anything showing the payments.

**33. What's the most impressive thing you've built or done?**
- Answer: one specific thing about Savant, with a number. For example: 16 ACT grades and a 112-question
  placement quiz built and checked in two to three months. Or the sealed Spanish experiment's method.
- Trap: listing everything.

**34. Will you move to San Francisco and work on this full-time?**
- Answer: "Yes. I've graduated, so it's full-time, and I can relocate with a parent."

**35. How do we know you'll stick with this?**
- Answer: what you did when Edit Simple was hard (kept calling for hundreds of hours), and that you're the user
  of this one.

### F. Money and plans

**36. How will you make money?**
- Answer: "A free tier and a paid tier for families. My planning number is $99 a year, which is well below the
  courses. Later, plans for schools and learning centres. Prices aren't set yet."
- Evidence: `docs/PRODUCT-DECISIONS.md` "Tiers and money"; `docs/ROADMAP.md` line 188; `site/index.html` line 274.
- Trap: presenting $99 as a tested price.

**37. How much money do you have? How long can you last?**
- Answer: "About a dollar. The app runs on donated AI credits and free model tiers, so my costs are near zero.
  I can keep building indefinitely, but I can't pay for a lawyer, paid AI for real users, or a co-founder."

**38. What would you do with the money?**
- Answer, concretely: move to SF; pay for AI providers whose terms allow minors' data; a children's-privacy
  lawyer; bring on the friend; and the ACT score-gain study at a real scale.
- Evidence: `PRIVACY.md` section 5 plan; `ACT-READINESS.md` build plan.

**39. What will you have done by Demo Day?**
- Answer: one measurable goal. For example: "N students who took an official practice test before and after,
  with the average gain against the retest baseline, plus M weekly active students." Pick numbers you believe.
- Trap: a vanity number with no measurement behind it.

**40. What's the biggest risk? What would kill this company?**
- Answer: "That free AI study modes are good enough, and students don't need a structured product. The
  score-gain measurement is how I find out early." Second: "That I'm one person." Name both.

**Bonus, if there's time. What will you do if we say no?**
- Answer: "Keep going: get the beta testers, run the score measurement, and apply again with results."

---

## 4. Evidence to bring (open in tabs before the call)

- [ ] The live app, signed in, on the ACT path page, and a fresh account ready for the placement quiz.
- [ ] A 60-second screen recording of the first session, in case the live demo breaks.
- [ ] The outreach tracker with real numbers (`OUTREACH.md` section 5).
- [ ] The Spanish check results and `spanish-check/PROTOCOL.md` section 11 ("What this does not prove").
- [ ] The ACT measurement protocol (`ACT-READINESS.md` section 5), and any before-scores already collected.
- [ ] `MARKET.md` section 7 arithmetic, with only verified numbers in it.
- [ ] `PRIVACY.md` section 5 statement.
- [ ] Edit Simple: the sites you built, if they're still live.
- [ ] The answers to the three section-1 checks (age policy, deadline, speedrun terms) written down.

## 5. One-line answers to drill until they're automatic

- What: "An adaptive tutor that keeps you from forgetting, starting with ACT prep."
- Users: "One: me. [N] students this week from outreach." (only the real N)
- Why you: "I'm the user, I've sold before, and I ship fast."
- Proof: "None yet for others. Here's the before-and-after test I'm running."
- Money: "About a dollar, near-zero costs."
- Risk: "Free AI study modes. Measuring score gains is how I find out."
