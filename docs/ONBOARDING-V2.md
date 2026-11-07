# Onboarding v2

Switch: `ONBOARDING_V2=on`. Off (the default) means today's flow, unchanged: `/start` behaves like any unknown page and `/api/ob2/*` is 404.

## 1. Inventory: what the current flow does and collects

| What | Where today | Stored in | Depends on it | In v2 |
| --- | --- | --- | --- | --- |
| Sign-up: name, email, password | `register.html`, `POST /api/auth/register` | `users` | everything | Step 9, `POST /api/ob2/claim`, same checks |
| Sign in by email or username | `login.html`, `POST /api/auth/login` | `users`, session | everything | Unchanged page. Linked from Welcome and Save. A guest who signs in brings the level check (section 4) |
| Age screen: month, year, country, no defaults, first answer holds for a day | `age-screen.js`, `POST /api/consent/age` | session `age_screen`, then `users.age_check` | every consent gate, `audience: kids`, beta arm, boosters | Step 3, the same endpoint and the same three neutral fields. The server still picks the route; the page never knows a threshold |
| Child account: nickname, username, password, parent's email, no child email | `registerChild` | `users` (`account_type: child`), `parental_consents` | `gate`, `access`, sweep (deleted after 14 days unanswered) | Split: nickname and parent's email before the level check, username and password at step 9. See section 3 |
| Consent email, resend, correct the address | `requestConsent`, `POST /api/consent/child/request`, `/parent-needed` | `parental_consents` | parent pages | Same functions |
| Parent's answer, opt-ins, revoke, parent account | `parent-*` pages, `routes/consent.js` | `parental_consents` | `access` | Untouched |
| Limits on a child without consent: no camera or mic, no typed words to AI, no uploads | `routes/consent.js` `gate`, `permissionsGate`, `services/ai.js` | n/a | safety | Untouched. Guests get the same limits (section 4) |
| Privacy agreement line | `register.html` | implied by creating the account | everything sent to outside AI | A real choice right after age, recorded in `learner_agreements`. Nothing personal reaches outside AI before it |
| Friend's share link `?ref=` | `register`, `services/referrals.js` | `users.referred_by` | referral counts | Kept through the redirect, attached at claim |
| Landing page subject `?track=` and `?next=` | `auth.js` | none | `/act` landing | `?track=` preselects the subject; `?next=` is honoured after claim |
| ACT check result carries over | `services/act-check.js` `carry` | `subject_placements` | ACT applicants | Called at claim, as at register |
| Baseline (Quick, Balanced, Accurate tasks) | `/baseline`, `routes/onboarding.js` | `onboarding_*`, scorecard | scorecard's first picture | Offered on the last screen, after the first lesson; same page, same `allowed` rule, same fallback to the style quiz |
| Style quiz | `/style-quiz`, `POST /api/profile/style-quiz` | `profiles.style_vector` | scorecard prior | Same fallback from the baseline page, for accounts the baseline is closed to |
| About-you survey (5 free-text boxes) | `/survey`, `POST /api/profile/survey` | `profiles.survey` | lesson writers | `interests` comes from step 6 at claim, when consent allows. The rest is on the last screen |
| Subject and grade picker, several at once | `/onboarding`, `POST /api/enrollments` | `enrollments` | path | Step 4 several subjects. The first goes straight on; the others are links on the last screen. Pick-a-grade-yourself stays at step 7. `/onboarding` still works as "add a subject" |
| Subject placement walk, Quick/Balanced/Accurate | `/subject-placement`, its API | `subject_placements` | recommended grade | Step 7 uses the same API in Quick. Balanced and Accurate stay on the old page, linked from the result |
| "Too easy / too hard", choose another grade | `POST .../adjust`, `.../choose` | `subject_placements` | start grade | Result screen at step 7 |
| Gap scan and catch-up after the walk | `/subject-placement`, `/api/gap-scan` | `gap_scan*`, `remediations` | catch-up plan | Moved to after the first lesson: the old result page stays reachable from the last screen |
| In-grade placement | `/placement`, `routes/placement.js` | `sessions` | start level inside a grade | Moved. See section 2 |
| Reading check offer | `reading-offer.js` on `/onboarding` | `reading_check*` | language level | Link on the last screen, and the dashboard's own offer is unchanged |
| Retention goal | `/api/retention-goals` (set later, per subject) | `enrollments.retention_goal` | review schedule | New: step 5 sets it, applied when the enrollment exists |
| Study goal (full, core, test) | `/api/study-goals` | `enrollments.study_goal` | lesson writers | A test answer at step 5 sets `test`, when that goal is switched on. Others stay full |
| Upload own notes | `/materials` | `materials` | courses | Step 4 option for accounts that may upload. Uploading is after step 9 (section 2) |
| Next study plan | `POST /api/prefs` `next_study` | `users.next_study` | shown in app | Step 10 |

Should be there and was not: why they are learning; a retention goal at the start; a way to try before an account; reminders of any kind. Nothing sends email or push reminders today (`routes/prefs.js`: "It sends nothing to anyone"), so step 10 stores the plan and offers a calendar file.

## 2. The order, and where it differs from the approved one

Approved order kept: Welcome, tutor, age, learn, why and by when, interests and the rewrite, level, first lesson, save, reminders.

Added by the owner, 7 Nov: an agreement step right after age (section 4).

Changes, each forced:

1. **Under-consent-age learners give a nickname and a parent's email just before step 7, not at step 9.** The law and the code: today nothing past the age screen opens for a child until a parent's email is on file (`js/onboarding.js ageStep`), and the level check is the first thing stored against them on the server. Steps 4 to 6 stay on the device only, so nothing about the child reaches the server before the parent has been told. Username and password stay at step 9. No child email is ever asked for.
2. **Own notes only: step 7 and 8 do not happen before the account.** Uploads stay with an account, so those learners go 1 to 6, save, then upload. Child accounts do not see this option (`CHILD_MEDIA_UPLOAD`).
3. **The in-grade placement comes after the first lesson, as an offer, rather than before it.** Step 8 says the lesson opens right away, and the old chain asked a second quiz first. The learner starts at the first teaching level of the grade the walk found (level 10 in most grades; levels 1 to 9 are practice, and nothing is marked cleared on the way, as with a placement). The last screen links to the existing retake ("skip what you know in this grade").
4. **Only the Quick walk runs inside the flow.** Balanced and Accurate remain on `/subject-placement`.
5. **A level check with too little to go on starts at the learner's age, not at an end of the scale.** The walk opens on the subject's first question and its belief is wide until it has answers, so "Stop here" or "I don't know" after a few questions put a 36-year-old on Preschool math, and one right answer then Stop put them on Senior Scholar. `settleStart` in `services/onboarding-v2.js` runs on the walk's result for learners in this flow; the walk itself is unchanged and its answer stays on the row as `walk_grade_id`.
   - Enough to place someone: 6 real tries (not "I don't know"), or 3 right among 6 answers. Six is the number the walk wants before it calls someone a beginner.
   - Not enough, 13 or older: the first grade of their school year (age minus 5), capped at 9th grade. The tutor says so on the result screen, and "Too easy", "Too hard" and picking a grade all still work.
   - Not enough, under 13: a low result stays; a result above their age comes down to their age.
   - Only subjects with school years in their grade names (math, English, reading). A beginner in Spanish, chess, piano, basketball, IQ or ACT starts at the start at any age.
   - With the switch off, or for an account not in this flow, nothing changes: the old page still gives the walk's own result.

## 3. Under-13s and other under-consent-age learners

- Age screen: same endpoint, same neutrality. First answer holds.
- Steps 4 to 6: on the device only. Tap choices only: no free-text interest box, because a child's typed words are not collected before consent.
- Before step 7: nickname and parent's email create a limited child row, and `requestConsent` emails the parent. A failed email is shown, not hidden, and can be retried.
- Steps 7 and 8: same limited account as today (`pending`): no outside AI, no camera or mic, no uploads. `CONSENT_PENDING_ACCESS=locked` still locks and sends them to `/parent-needed`.
- Step 9: username and password. If nobody answers in 14 days the existing sweep deletes the account, unchanged.
- The chosen interest reaches `profiles.survey` only once `ai_free_text` is true; until then it stays in `onboarding_answers`, which export and deletion cover.

## 4. Agreement and guest data

**Everyone agrees before they get access (owner, 7 Nov).** Right after age, a learner at or over their country's consent age sees the beta terms, privacy and outside AI services, and chooses `I agree to all three` or `I don't agree`. Neither is picked and Continue is off until one is. Declining stops with "You can't use the beta without this", the privacy link and a way to choose again; it creates nothing on the server. No step past it can be reached without agreeing. An under-consent-age learner never sees it: their parent decides, as today. There is no separate terms page yet, so the terms are the words on the screen (`AGREEMENT` in `public/js/start-content.js`). They need the owner's or a lawyer's reading.

**Agreeing creates the guest:** a real `users` row with `guest: true`, no email and no password. `POST /api/ob2/agree` records one `learner_agreements` row (version, policy version, what it covers, when), in `KNOWN_COLLECTIONS` and `EXPORT_MORE`, and sets `users.agreed_at`. A change of wording needs a new `AGREEMENT_VERSION`.

- **Consent:** `access()` then treats them as any consenting learner (`full`), so outside AI, their interests and their own first lesson are open. A guest row with no agreement stays limited (`state: 'guest'`). No other gate changed. Boosters, the beta arm and the speed proof still wait for the saved account.
- **Tailoring:** `canEditLevels` needed an email, which alone would have made every guest's lesson generic. An agreed guest now counts.
- **Why a row and not a side table:** the placement, enrollment, session and lesson code all key on a user id. Forking them is how progress gets lost.
- **Carry-over:** `POST /api/ob2/claim` adds credentials to the same row, so nothing moves and nothing can be lost. A failed claim changes nothing.
- **Answers:** `onboarding_answers`, in `KNOWN_COLLECTIONS` and `EXPORT_MORE`. The interest goes into `profiles.survey` as soon as it is given; changing it replaces it.
- **Expiry:** a guest idle for `ONBOARDING_GUEST_DAYS` (30) is deleted by the consent sweep, the whole row set.
- **A guest who signs in to an existing account:** the finished walk and the enrollment go across when the account has none for that subject; lesson answers do not, because merging them would corrupt that account's scorecard. The screen says so first. The guest row is then deleted.
- **An existing account** opening `/start` or `/register` is sent to its dashboard (or `/parent-needed`, or `/onboarding` if it has no subject), never through this flow.

**"Built around you", checked by running it** (7 Nov, 375 px, real models, copy of the store, `COLD_FIRST_BLOCK=on`, `CORAL_LEARNER=on`, math, n = 2 agreed guests, small sample, other agents on the same keys; simulated learners, not proof of learning):

| Learner | Building screen waited | Lesson opened after | What the page said |
| --- | --- | --- | --- |
| soccer | 17 s | under 4 s | "A soccer coach has 3/4 metre of practice ribbon" |
| rock climbing (typed in) | 24 s | under 4 s | "A climber has 3/4 of a chalk block left" (a check; the first block was not themed) |

Four earlier runs were not true: the page gave up at 30 s and opened the generic standard lesson. The causes, all fixed: level 1 is practice, not a lesson; the session route started a background write of the same level, which the learner then waited on; and the page's wait is shorter than a cold write. So the building screen now really waits for the first checked part, up to 150 s, then says it is starting with the standard lesson. Both switches must be on in production, and without them the wait is longer or falls back.

## 5. Step 6 content

Pre-written, in `public/js/start-content.js`: 4 ideas (a fraction, a main idea, a Spanish verb ending, practising the hard part) times 12 interests. No model is called and nothing is sent anywhere. `scripts/onboarding-v2-test.js` checks that every cell exists and that the fraction cells are about 3 of 4. They are not run through the fact pipeline: they are scenarios, not claims about the world, and the Spanish forms are regular verbs checked by hand. The screen says these are written ahead of time. An interest with no example says so and shows another one.

## 6. Look

Atkinson Hyperlegible, near-monochrome tokens from `site/assets/site.css`, plus one accent: a highlighter yellow. It marks what is selected or important, the way a student marks a page, which fits the app's "Measured and marked" system and is none of the reference apps' brand colours. It is only ever a background behind dark text, so it passes contrast in both modes and never competes with right and wrong. The progress bar is the site's ruler with a marker on it.

The tutor is one component, `public/js/start-tutor.js`: the Sunny giraffe (owner, 7 Nov: "for now"), an SVG with moods. Swap this file and the .tutor block in start.css to swap the character. `Tutor.NAME` is null and copy never names it.

## 7. What was checked, and what wasn't

`scripts/onboarding-v2-test.js` (in the suite) covers the API. `scripts/onboarding-v2-browser.js` (needs playwright, not in the suite) walked Chromium on a local copy of the store, at 375 px and 1366 px, light and dark: adult, teen, under-13 with a parent who agrees, under-13 with no consent yet, returning account, reload at each stage, browser and in-page back, skipping by address, double taps, a taken email, an interest with no example, own notes, keyboard only, reduced motion, and a guest on the path, home and lesson pages. It fails on a console error, a CSP violation, sideways scrolling or a small target. All 9 subjects were opened at the first and middle grade, with no model keys, as a guest in production would have no outside AI.

Not checked: Safari, Firefox and real phones (Chromium only); a real email reaching a parent (the dev outbox was read); a run with model keys present; finishing a whole first lesson by hand, so the lesson-done prompt was tested with the finish call simulated; real learners, so nothing here says the flow converts or teaches better.

## 8. Decisions for the owner

- Reminders: none are sent today. Step 10 stores a plan and offers a calendar file. Email for adults would need building.
- A guest signing in to an existing account keeps the level check but not lesson answers.
- The agreement's wording needs reading; there is no separate terms page.
- Turn on `COLD_FIRST_BLOCK` and `CORAL_LEARNER` with `ONBOARDING_V2`: "built around you" depends on them.
- Starting level with too little evidence (section 2, item 5): the 9th-grade cap for adults, and six "I don't know" counting as no evidence rather than as a beginner, are judgement calls.
