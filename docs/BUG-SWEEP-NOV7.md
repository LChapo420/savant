# Bug sweep, 7 Nov 2026 (before testers arrive on Nov 15)

Branch `bug-sweep-nov7`, from main at 47c76d2. Not merged, pushed or deployed. Ordered by what a tester would hit first.

How it was run: a local copy of the store with every account removed, then synthetic accounts only (account 6689 was not in the copy). `ONBOARDING_V2=on BETA_GATE=invite BETA_SIGNIN_ONLY=off`, outside AI off, no model keys in the environment, so the lessons were the standard ones and the tutor gave its plain reply. Playwright Chromium, one browser at a time, at 375 px and 1366 px, light and dark. Each visit recorded console errors, failed requests, sideways scrolling, text contrast, overlap and clipping, and screenshots were read as contact sheets.

## Fixed

| # | What a tester saw | Fix | Commit |
|---|---|---|---|
| 1 | **Adding a subject on a phone: the goal screen ran 218 px off the side.** A long grade name in a chip widened the page, so the options and Continue were squeezed left and the page scrolled sideways. | Chips can wrap | 5d668ad |
| 2 | **"My own notes" in onboarding opened the landing page.** It linked to `/materials`, which is an API, not a page. The browser test passed because a missing page answered 200 at the address it waited for. | Links to `/my-material`; test and doc corrected | 71513ad |
| 3 | **The start of a question was hidden on a phone.** The next question kept the scroll of the card or verdict just pressed, so the prompt sat under the sticky bar. Worst above chess boards, where focusing the answer box also scrolled down. | Questions start at the top; focus doesn't scroll. Placement, grade finder, session, review, skip | 5d668ad, 693f688 |
| 4 | **A dropped connection during a question got the learner stuck.** Answer box and button stayed grey until a reload, and the error message then sat on top of Check and took its taps. It also stayed up after the retry worked. | `Player.unlock` on every answer path; the message sits above the Check bar and goes when the connection is back or something succeeds | 5d668ad, 4228c4a, 4ff421d |
| 5 | **A failed first load left a spinner forever**, with the error above it: dashboard, path, profile, placements, style quiz, baseline, reading check, daily check, add a subject. | The spinner goes and there is a Try again button. Re-run with a dropped connection on 23 pages: none left spinning | 4f4439c |
| 6 | **The placement quiz offered "Help me work it out"**, then said "The coach is not available during a checkpoint", with a text box below it. | No coach on any placement, as the server already required | 5d668ad |
| 7 | **The path offered "Start level 1" on a grade waiting for its placement**, and that led to an error. | It offers the placement quiz | 5d668ad |
| 8 | **Baseline and daily check: both two-statement options ran 347 px off a phone**, so neither could be read. | They wrap | 693f688, 262e64d |
| 9 | **Home and Profile said "No sessions in the last 7 days"** to someone who answered 40 questions and closed the tab. | The week counts sittings still open | 4228c4a |
| 10 | **A message blocked taps** on buttons under it (Delete my account). | Only its close button takes taps | 5fd361f |
| 11 | **First-lesson screen: dots flew over the heading and the card** (the known item). | They burst only in the empty space. Measured frame by frame at 5 screen sizes: no dot crosses text. With no empty space (375 x 760 with a second subject listed) there is no burst | e579dc3 |
| 12 | **A mistyped address showed a signed-in learner the marketing page**, and a missing script came back as HTML with a 200. | A real 404 page; plain 404 for files | 4f4439c |
| 13 | Small: a child's profile began ", joined"; the catch-up page was white with black buttons and its theme toggle did nothing; an empty email on sign-up said the invite "belongs to a different email address"; a placement read "chunks.. Level 16"; a too-long sign-in talked about 20 MB file uploads. | Each fixed | 5fd361f, 4f4439c |

## Found, not fixed

Owned by other builds, or not mine to change. Most urgent first.

1. **Privacy page placeholders.** `/privacy` shows "Draft for legal review" and blanks: "operator's legal name and postal address", "privacy contact email", "response time". Wording is the owner's call.
2. **Known item, tutor (`services/tutor-howto.js`, changed on `tutor-giraffe`).** "simple way to remember how to add fractions" gets the instant answer about Review. `HOWTO_ASK` matches "how to", `remember` is a Review word, and `OWN_WORK` only has `\bfraction\b`, so the plural slips through. Checked directly: "simple way to remember how to multiply" and "how to remember the quadratic formula" also return an instant answer. So the plural alone is not the fix: "how to" plus a study verb should go to the tutor. I did not see this in the dock itself, because with AI off it gave its plain fallback reply.
3. **Tutor button covers controls on a phone (`tutor-dock.css`, `tutor-giraffe`).** "Ask tutor" sits on Save on `/survey`, Save profile on `/style-quiz`, Continue on `/onboarding`, Check in Spanish, Start lesson on the path, and "Another topic". The giraffe moves it to the top, so re-check after that merge.
4. **Tutor "Talk" tab shows for a child waiting on a parent**, while the banner says the microphone is off. Check on `tutor-giraffe`.
5. **My material pages (`uploads-beta`).** They don't load the style, so they are white with black buttons, unlike every other page. A child sees the whole upload form and only learns it is closed after submitting (403).
6. **A child's `/survey` shows free-text boxes, but saving is refused (403)** with a message about outside AI. Nothing is stored, which is right. The form shouldn't be offered to them. It is a consent-related screen, so I left it.
7. **Spanish: "Spanish audio isn't available right now. Tap to try again"** sits on every exercise with outside services off. Check on the beta server that voices work. If they don't, the banner repeats on every question.
8. **XP, streak and "sessions analyzed" only arrive when a session is finished.** Close the tab and those stay 0, though level progress is kept. Fix 9 only corrects the week counts. Close the sitting on the next visit, or leave it? Owner's call, as it touches rewards.
9. **Pages a tester can reach by typing the address:** `/game-lab` (names the model that wrote its questions), `/spanish/lab.html`, `/spanish/design.html`, `/parent-admin` (the page shell, no data), `/study-demo`. Hiding them would be a gate change.
10. **The plan picker on Profile lets anyone set themselves to `pro` or `school`.** It stuck after a reload. I didn't check what it unlocks. Is that intended for the beta?
11. **Lesson content (pipeline, `speed-nov7`).** Basketball placement questions use terms from lessons not yet taken ("In Bunny Jumps...", "your Ball Explorer rule"), and an early lesson says "11+-style neuromuscular warm-up".
12. **An expired sign-in during a question** shows "Sign in to continue." with no link, and nothing moves. Rare, since sign-ins last and survive restarts.
13. **A bad invite link says nothing until the last step**, after the learner has filled in the whole form. The invited email isn't filled in for them either.
14. **The parent page header says "Sign in"** while signed in as a parent.
15. **Two labels are just under contrast:** "levels 10–11" and "Practice" at 4.48:1 against 4.5.

## Suggestions for the owner (no change made)

- **Level-done screen:** recall question, go deeper or move on, how did it feel, does it connect, race your time, then two buttons. That is a lot after every level. One a time would be cleaner.
- **Profile is about 11,000 px on a phone.** Collapsing most of it behind a few headings would help.
- **Finding your grade means two quizzes for a new subject:** the grade finder, then 20 to 28 more questions in `/placement`. Testers may read that as repetition.

## Covered

**Both widths, light and dark, screenshots read:** dashboard, path, review, profile, calendar, catch-up, my material, help, extras, daily check, grade finder, add a subject, privacy, survey, style quiz, baseline, reading check, parent sign-in, parent-needed, ACT, ACT scores, session, skill practice, unknown addresses.

**Phone, walked by clicks (light only unless noted):**
- Sign-in and invite sign-up, with wrong, empty and huge input, a bad invite and double clicks.
- Onboarding with reloads at each step on a slow network.
- A first lesson and its checks; a practice level answered right through to level up.
- A review sitting with something due, reached by moving a synthetic account's dates back about 70 days and seeding its answers as slow and right.
- Grade finder and placement in all nine subjects; first sessions in math, Spanish and IQ. Chess, piano and basketball sessions were on desktop dark.
- Retake (the dialog, then Cancel), set a goal, add a second subject, retention goals including a past test date, plan minutes, the study timer's pause and end, the Look picker, the theme toggle, ACT scores, calendar months.
- Data export, and delete with wrong input then for real, then login refused.
- Under-13 sign-up, the child limits, the parent's email link, agree, the parent page, a setting change, withdraw, the child locked.
- Sign-out and the back button, reload, back and double clicks in a session, offline answers and a retry.
- Addresses with bad ids and other people's rows.
- A name made of HTML (shown as text, it did not run).

## Not covered

- A whole Spanish level to the end: the walk stopped at "tap the matching pairs", so its finish and the speech exercises weren't driven.
- Chess and piano interactive drills beyond typed and tapped answers; brain games on `/boosters` and the game levels.
- The tutor with a model, real lesson writing and fact checks (all off).
- Uploads themselves (`uploads-beta` owns them).
- A checkpoint, Master or Final sitting, and a graduation.
- Real phones, Safari and Firefox; a real email reaching a parent (the dev outbox was read); real slow-network timing beyond one emulated run; a child with a signed form.
- Parent deleting a child (only the refusal was tried), and resending a consent email.
- Dark mode on the walked flows. Dark was read on page loads, and desktop dark on the chess, piano and basketball sessions.

## Tests

`scripts/bug-sweep-3-test.js` is new and in `scripts/test-steps.json`. It also fails on any internal link that leads nowhere, which is what would have caught the `/materials` link. The page fixes were watched in the browser; in that test they are only text checks of the files.

The whole suite was not run, as asked. Run one at a time, all exit 0:

bug-sweep-2, bug-sweep-3, signin-gate, onboarding-v2, onboarding, pwa, act-landing, account-deletion, boosters, daily-check, goal-path, catchup-units, placement-extra, gap-scan, learner-path, tutor-screen.

`scripts/onboarding-v2-browser.js` was edited (`/materials` to `/my-material`) but not re-run. The same step was checked by a separate browser walk: the own-notes choice lands on the My material page.

No test was weakened. No outside AI was used.
