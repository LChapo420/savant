# Interview cards: a short answer, the one thing that backs it, and what only you can fill in

Written 2026-10-29. Companion to `INTERVIEW.md` (read its "Read this first" and section 3 for the longer outlines
and traps). Each card has three parts:

- **Say:** two or three sentences built only from facts in this repo or the ones you gave. Put it in your words.
- **Backs it:** the one number or demo moment to point at. Every file named here exists (`scripts/interview-cards-test.js`).
- **YOU FILL IN:** what only you can supply. Nothing is invented for you; where a number is still unknown the
  card says so and leaves a blank.

Rules from `INTERVIEW.md` hold on every card: say the weak part first; real numbers only; never "raises scores",
never "COPPA compliant", never quote a `MARKET.md` number that isn't verified; your pre-ACT score is never quoted.
Anything about YC, a16z, or outside facts is **UNVERIFIED** until you open the page (`SOURCES-TO-VERIFY.md`).

Repo numbers used below, and how to re-check each (run it before the call, in case it changed):

| Number | Check |
|---|---|
| 16 ACT grades, 9,807 levels | `node -e "const g=require('./content/act-grades.js').GRADES;console.log(g.length,g.reduce((s,x)=>s+x.levels.length,0))"` |
| 112 placement questions (16 grades x 7), 84 calibration points | the 112 live in your `data/db.json` (`placement_question_sets`, see `curriculum-build/LIVE-CHANGES-2026-10-24.md`); the 84 points are `content/placement-calibration/act.json` |
| 187 parental-consent checks | `node scripts/consent-test.js \| grep -c "^  ok"` |
| $24 hard AI stop, $11.20 spent before the ledger | `curriculum-build/MODEL-LINEUP.md`, `services/anthropic-ledger.js` |
| Quiz pass mark 75% | `README.md` |

---

## A. What it is

**1. What are you making?**
- Say: "Savant is an adaptive tutor. It finds what you know, teaches what's missing, and brings old material back before you forget it. We're starting with ACT prep."
- Backs it: demo: ACT placement quiz ("Find my grade"), then a path page. Number: 16 grades, 9,807 levels.
- YOU FILL IN: nothing.

**2. Why ACT prep first?**
- Say: "I'm taking the ACT and SAT myself, so I'm the user. ACT prep has a deadline and a score that goes up or doesn't, so I can tell if the product works."
- Backs it: `docs/yc/ACT-READINESS.md` section 5 (the before/after measurement). The Nebraska "every junior takes the ACT" line is UNVERIFIED: don't say it until checked.
- YOU FILL IN: your own test dates, in your words.

**3. Who exactly is the user?**
- Say: "A junior or senior with a test date weeks away who can't or won't pay for a course or tutor, and their parent, who often pays."
- Backs it: the competitor price table in `MARKET.md` (UNVERIFIED until checked).
- YOU FILL IN: any real tester who matches this, only if one exists.

**4. What's new here? Why now?**
- Say: "AI can write and check a lesson for one student cheaply. And most prep teaches then tests; Savant is built around not forgetting, which is what loses points between practice and test day."
- Backs it: `curriculum-build/MODEL-LINEUP.md` (free model tiers first, $24 hard stop); `curriculum-build/RETENTION-ENFORCERS.md`. The 2025 ACT format change is UNVERIFIED.
- YOU FILL IN: nothing.

**5. Why not ChatGPT study mode or Khan?**
- Say: "Study mode is good and free, but it waits for you to ask. Savant places you, picks what's next and schedules review. I found no official free Khan ACT course (UNVERIFIED)."
- Backs it: demo: dashboard **Due for review**, then the tutor dock. Doc: `MARKET.md` competitor table.
- YOU FILL IN: your own experience using study mode, if you have it.

**6. What do you understand that others don't?**
- Say: "Explanations are free everywhere. The scarce thing is knowing what you've stopped remembering. That's a hypothesis, and I'm measuring it."
- Backs it: `curriculum-build/RETENTION-ENFORCERS.md`; the measurement plan in `ACT-READINESS.md` section 5.
- YOU FILL IN: one moment from your own studying where you forgot something you'd "learned".

## B. Users and evidence

**7. How many users do you have?**
- Say: "One: me. This week I started reaching out to ACT students; as of [date], [N] signed up and [M] used it twice."
- Backs it: the admin metrics page funnel (`/admin`, activation funnel and invites, backlog Done 2026-10-29) and the tracker in `OUTREACH.md` section 5. Read the live numbers; do not use these blanks as numbers.
- YOU FILL IN: date, N, M. If nobody has used it, say "one: me" and stop.

**8. Why haven't you launched?**
- Say: "I spent two months on the engine and content and only now am putting it in front of people. That's my biggest mistake so far."
- Backs it: git history shows when outreach tooling started (`git log --oneline docs/yc/OUTREACH.md`).
- YOU FILL IN: what you've done to fix it, with dates.

**9. How will you get the first 100 users?**
- Say: name the specific channels that replied, not the list.
- Backs it: `OUTREACH.md` section 5 tracker, "Reply" and "Users from it" columns.
- YOU FILL IN: the replies and counts. Blank tracker = say so.

**10. What have users said?**
- Say: their words, including the bad parts. If none: "Nobody but me yet; here's what using it myself taught me."
- Backs it: the tracker's Notes column; nothing is quoted in this repo and none may be invented.
- YOU FILL IN: every quote.

**11. What's your retention?**
- Say: "No number yet; one user isn't a cohort. I'll measure week-one return on the first testers."
- Backs it: the funnel on the admin metrics page measures minutes per active day and who came back; read it live.
- YOU FILL IN: the real week-one return count once testers exist. Never your own streak.

**12. How do you know it works?**
- Say: "I don't, for anyone but me. Each student takes an official timed practice test before and after a few weeks, and I compare with what retesting alone gives."
- Backs it: `ACT-STUDY-PROTOCOL.md` and `ACT-READINESS.md` section 5. The retest-gain figure is UNVERIFIED (`MARKET.md` section 5).
- YOU FILL IN: how many students have a before score, if any.

**13. What did the Spanish experiment show?**
- Say: the result exactly as scored, including "no change". Then: "One learner, me, a few sittings over days, on sentences the app never used, sealed and time-stamped first. It shows I measure honestly, not that it works for others."
- Backs it: `spanish-check/SEAL.txt` (seal 2026-10-28T02:49Z), `spanish-check/VERIFY.md`, `spanish-check/PROTOCOL.md` section 11. Demo moment: verify the timestamp live.
- YOU FILL IN: the result, read from the scorer after your last sitting. This repo does not hold it.

## C. Market and competition

**14. How big is the market?**
- Say: "A few hundred million dollars a year at most for US ACT and SAT prep software. That's the beachhead; the company is the engine for every subject."
- Backs it: `MARKET.md` section 7 arithmetic. Test-taker counts are UNVERIFIED: verify, then quote.
- YOU FILL IN: the verified counts.

**15. Isn't the ACT shrinking? Colleges are test-optional.**
- Say: "Yes, takers fell a lot. Some selective colleges brought requirements back, and in some states every junior still tests." Don't deny the decline.
- Backs it: nothing verified in the repo. Every figure here is UNVERIFIED until checked at the source.
- YOU FILL IN: the verified numbers and one college announcement.

**16. Who are your competitors?**
- Say: courses and tutoring (Princeton Review, Kaplan, PrepScholar, Magoosh), Khan (free, SAT-focused), and free AI study modes.
- Backs it: `MARKET.md` section 6 table.
- YOU FILL IN: any you've actually tried.

**17. What do families pay today?**
- Say: "Course list prices run from about $129 to thousands; tutoring more. I found no credible survey of total spending, so I won't quote one."
- Backs it: `MARKET.md` section 6. Don't quote the old $2.5B figure.
- YOU FILL IN: nothing.

**18. Why won't Khan or OpenAI build this?**
- Say: "They might. A general assistant is unlikely to build a test calendar, per-skill placement for one test and a review schedule. I can go deeper on one test and move faster."
- Backs it: demo: placement plus review queue on one test. Never say "they can't".
- YOU FILL IN: nothing.

**19. Nine subjects: isn't that unfocused?**
- Say: "The engine is general and the subjects tested it. For users I'm focused on the ACT; the rest is expansion once it works."
- Backs it: `docs/PRODUCT-DECISIONS.md`; the ACT landing page `/act`.
- YOU FILL IN: nothing.

## D. Product and tech

**20. Walk me through the first 10 minutes.**
- Say: sign-up (age first), pick ACT, "Find my grade" placement, land in one of 16 grades, first level is a lesson, then practice with a recall question.
- Backs it: demo script `DEMO-SCRIPT.md` (60-second cut) or your backup recording. Clicks there were checked against the code, not yet on screen (backlog 12b).
- YOU FILL IN: confirm the clicks on screen at 375 px before the call.

**21. How does placement work?**
- Say: "Seven stored questions per grade across 16 grades. Positions were set by model judges, and answer keys were checked blind by models from a different family than the writer."
- Backs it: `curriculum-build/LIVE-CHANGES-2026-10-24.md` ACT placement row; `content/placement-calibration/act.json` (84 points). Trap: it was not calibrated on real students.
- YOU FILL IN: nothing.

**22. What is actually adaptive?**
- Say: "Where you start, what you study (it reteaches from your actual wrong answers; a quiz passes at 75%), and when you review."
- Backs it: `README.md` sections on placement and failing a checkpoint. Demo: get a quiz question wrong on purpose.
- YOU FILL IN: nothing.

**23. How do you know the content is right?**
- Say: "Every skill has a code generator, so a correct question exists with no AI. AI lessons go through a fact-check pipeline, and my eval showed no free model could replace a strong one as the last gate."
- Backs it: `curriculum-build/MODEL-LINEUP.md` "Eval results (2026-10-22)"; `curriculum-build/CONTENT-FACT-AUDIT.md`. Never "100% accurate".
- YOU FILL IN: one error the pipeline caught, if you remember one.

**24. What does a user cost you?**
- Say: "Near zero today on free tiers and a capped paid model, but free tiers may not allow minors' data in production, so the real unit cost is a paid no-training provider's price, which I'm working out."
- Backs it: `PRIVACY.md` section 4 gap 1; the $24 stop in `services/anthropic-ledger.js`.
- YOU FILL IN: a paid-provider cost estimate once you have a quote.

**25. You built this with AI. Do you understand the code?**
- Say: "I direct the AI tools, mostly Claude, and read and test what they write. The consent gate has 187 checks."
- Backs it: `node scripts/consent-test.js` (live demo, prints "All consent checks passed").
- YOU FILL IN: a real bug you found or a design decision you made. Do not pretend you hand-wrote it.

**26. Hardest technical problem?**
- Say: pick one: trustworthy AI-written questions (one right answer, right difficulty), or running on rate-limited free models with a pool and a code fallback.
- Backs it: `curriculum-build/MODEL-LINEUP.md` pool section.
- YOU FILL IN: the story of it going wrong first.

**27. How do you handle kids' data?**
- Say: the "what you can say today" paragraph in `PRIVACY.md` section 5, including what isn't done. Never "COPPA compliant".
- Backs it: `node scripts/consent-test.js` (187 checks); account deletion in `services/account-deletion.js`; the written programme in `PRIVACY.md`.
- YOU FILL IN: the open gaps the owner decides (`PRIVACY.md` gaps 1, 2, 6, 7, 9, 10) once decided.

## E. You

**28. Tell us about yourself.**
- Say: "16, Omaha, finished high school online in January with a 4.0. I ran a web design company, Edit Simple: hundreds of hours of cold calls, two paying customers at $300 each. Now Savant, full-time." (Age line is for YC and speedrun only; cut it from anything public.)
- Backs it: only what you gave (`INTERVIEW.md` section 2). Say "two customers, $600" exactly.
- YOU FILL IN: it's all yours; practise it under 30 seconds.

**29. You're 16. Why not college first?**
- Say: "I've finished high school and can do this full-time, and the best time to build test prep is while I'm a test-taker."
- Backs it: graduation date as you gave it.
- YOU FILL IN: whether you plan on college later.

**30. Can you sign the documents?**
- Say: "My parents support this and will sign anything that needs a guardian's signature."
- Backs it: nothing in the repo answers the legal question; YC's under-18 policy is UNVERIFIED (`INTERVIEW.md` section 1).
- YOU FILL IN: YC's actual policy and a lawyer's answer on officers and directors. Do not guess.

**31. Why solo?**
- Say: "I started alone and could build it alone with AI tools. I know that's a risk. If funded, I plan to bring on a friend."
- Backs it: none; this is a plan.
- YOU FILL IN: who, what they'd do, and whether they've agreed. Name nobody who hasn't.

**32. What did you learn from Edit Simple?**
- Say: "That I can sell and that selling is hard: hundreds of hours of calls for two customers. And I didn't care enough about the product. With Savant I'm the user."
- Backs it: the two sites if still live; anything showing the payments.
- YOU FILL IN: the specific lesson, in your words.

**33. Most impressive thing you've built?**
- Say: one thing with a number: 16 ACT grades and 9,807 levels with a placement quiz, in two to three months, solo. Or the sealed Spanish method.
- Backs it: the grades command in the table above; `spanish-check/SEAL.txt`.
- YOU FILL IN: which one you choose.

**34. Will you move to SF full-time?**
- Say: "Yes. I've graduated, so it's full-time, and I can relocate with a parent."
- Backs it: your statement.
- YOU FILL IN: confirm with your parent.

**35. How do we know you'll stick with it?**
- Say: "I kept calling for hundreds of hours when Edit Simple was hard, and here I'm the user."
- Backs it: the Edit Simple facts; the Savant git history (`git log --oneline | wc -l`).
- YOU FILL IN: a moment you wanted to quit and didn't.

## F. Money and plans

**36. How will you make money?**
- Say: "A free tier and a paid family tier; my planning number is $14.99 a month or $99 a year, not a tested price. Later schools and learning centres."
- Backs it: `docs/ROADMAP.md` line 188; `site/index.html` line 274 ("prices are not set"). Don't present $99 as tested.
- YOU FILL IN: any family who said what they'd pay, in their words.

**37. How much money do you have?**
- Say: "About a dollar. It runs on donated credits and free tiers, so costs are near zero. I can't pay for a lawyer, paid AI for real users, or a co-founder."
- Backs it: the $24 hard stop and $11.20 pre-ledger spend (`curriculum-build/MODEL-LINEUP.md`).
- YOU FILL IN: update the balance on the day.

**38. What would you do with the money?**
- Say: move to SF; pay AI providers whose terms allow minors' data; a children's-privacy lawyer; bring on the friend; run the score study at scale.
- Backs it: `PRIVACY.md` section 5 plan; `ACT-READINESS.md` build plan.
- YOU FILL IN: amounts you'd actually ask for.

**39. What will you have done by Demo Day?**
- Say: one measurable goal: N students with before and after official practice tests and the gain against the retest baseline, plus M weekly active.
- Backs it: `ACT-STUDY-PROTOCOL.md`.
- YOU FILL IN: N and M that you believe.

**40. Biggest risk?**
- Say: "Free AI study modes may be good enough that students don't need structure; the score-gain measurement is how I find out early. Second, I'm one person."
- Backs it: `ACT-STUDY-PROTOCOL.md`.
- YOU FILL IN: nothing.

**Bonus. What if we say no?**
- Say: "Keep going: beta testers, the score measurement, and apply again with results."
- Backs it: the Queue in `BACKLOG.md` shows the work is continuing.
- YOU FILL IN: nothing.
