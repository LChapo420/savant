# Demo script: 60 seconds and 3 minutes

Written 2026-10-29 for the application video and the interview. Every click below is a page or button that exists
in the code (`scripts/demo-script-test.js` checks the page paths and the quoted labels). Nothing here quotes a
score gain, a user count or a result: Savant has none yet, and the script says so out loud (see "Say it plainly").

> **Age lines ("I'm 16", "a 16-year-old") are for the YC and speedrun application video and the interview only.** Cut them from any public version (site, social posts, creator kits): the owner's rule is no founder age in public.

## Before you record

1. Stop the app. Make the demo learner on the machine that holds `data/`:
   `node scripts/seed-demo-account.js --data data/db.json` (add `--offline` if you have no model keys).
   The login (email and a fresh password) goes only to `.demo-account.local.txt` (gitignored). Never show that
   file on screen. `npm run demo:account` is the same script.
2. Start the app and sign in at `/login` as **Riley (demo account)**. The account has two subjects with a
   placement already taken (Algebra 1 part A and ACT Prep), two sittings in each, and a short tutor chat.
3. Use a phone-width window (375 px) for the 60-second cut; the app is built mobile first.
4. With model keys the tutor replies are the live tutor's. With `--offline` the reply is the tutor's own offline
   reply, which says so: don't use `--offline` for the video if you want a live answer on screen.
5. Keep a 60-second screen recording of the first session as a backup in case the live demo breaks
   (`INTERVIEW.md` says the same).

## The 60-second version

Goal: show that it finds the learner's level, teaches from there, and has a tutor on every page.

| Time | Click or action | Say |
|---|---|---|
| 0:00 | Open `/dashboard`. Point at **Your subjects**. | "I'm 16. Savant is a tutor that finds exactly where you are, then teaches from there. Riley is studying Algebra 1 and ACT prep." |
| 0:10 | Tap **Continue** on the ACT Prep card (it reads "Start level N"). | "It already placed Riley with a short adaptive quiz, so this isn't level 1 for everyone." |
| 0:20 | Answer one question in the session. Get one wrong on purpose if you can. | "Wrong answers aren't just marked wrong: the app works out the misunderstanding behind them and brings that skill back." |
| 0:35 | Tap **Ask tutor** (bottom corner). Type "why is that the answer?" and send. | "The tutor is on every page. It knows the goal, the subject, recent mistakes and what is on the screen. On quizzes and placement it gives method hints only, never the answer." |
| 0:50 | Back on `/dashboard`, point at **Due for review**. | "Then it schedules review so it sticks. I'm looking for ACT students to try it; there are no results to show yet and I won't pretend there are." |
| 1:00 | Stop. | |

## The 3-minute version

| Time | Click or action | Say |
|---|---|---|
| 0:00 | `/` (home page), scroll once. | One sentence: what it is, who it's for (ACT students), who built it (a 16-year-old, solo). |
| 0:20 | `/act`. | "This is what ACT prep does today and, in plain words, what it doesn't do yet: no timing, no real-format questions, no score prediction. No results yet." |
| 0:40 | Sign in as Riley. `/dashboard`: **Your subjects**, **Recent sessions**, **Due for review**. | "Everything here comes from what Riley actually answered." |
| 1:00 | Open the ACT Prep session (**Continue**). Answer two questions, one wrong. | Level, 75% to master a skill, what happens on a miss. |
| 1:40 | Tap **Ask tutor**. Ask something about the question on screen. Optionally switch **Type** to **Talk** and use **Hold to talk**. | "The tutor sees the page and the learner's goal. On timed or graded pages it only gives hints about method." |
| 2:00 | `/my-material`: paste a paragraph of notes, tap **Learning path**, then **Study** once it is ready. | "A learner can turn their own notes into a course taught with the same engine. Their file is private to them and deletable. Needs a live model key to build." |
| 2:30 | `/act-scores`: show the test date, target and chart. | "Real scores go in here, so we can measure gains honestly. That study is designed (`/act-study`) but has no participants yet." |
| 2:50 | Back to `/dashboard`. | Ask: "If you know an ACT student, send them the link." Stop. |

## Say it plainly (do not skip)

- There is no traction number to show. Do not say one. If asked, the honest answer is the state of the beta
  and the measurement plan in `ACT-READINESS.md` section 4.
- Riley is a sample learner made by a script, not a real person. Say "demo account".
- Anything the AI wrote during the demo is generated live (or offline text, if seeded `--offline`): don't claim
  the tutor's wording is fixed.
- Do not show the founder's pre-ACT score.

## If something breaks

- Tutor says it is offline: use the recording, or say what the offline reply is and move on.
- `/my-material` build fails without a model key: show the list and the privacy note instead.
- Never fix it live by editing `data/` on camera.
