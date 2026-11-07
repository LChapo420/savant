# Onboarding v2

Switch: `ONBOARDING_V2=on`. Off (the default) means today's flow, unchanged: `/start` behaves like any unknown page and `/api/ob2/*` is 404.

## The flow now (owner, 7 Nov)

"Onboarding should just ask the same things it does which is the test that gets a general understanding of their learning style, their interests, and then the subject(s) they want to learn, and the grade they want to learn or they take the placement." And: "the sign up and beta terms and stuff aren't on the onboarding they're on the application, so remove that for the beta so it doesn't confuse them."

**Private beta** (`BETA_SIGNIN_ONLY` on, or `BETA_GATE=invite`): the learner already has an account.
Welcome, tutor hello, age (only if none is on record), short test, interests, subjects, grade (pick it, or take the placement), building, first lesson ready, the lesson, then the dashboard.

**Public launch** (both off): welcome, tutor hello, age, agreement (or the parent's email), short test, interests, subjects, grade, building, first lesson ready, the lesson, saving the account, all set.

Off the path, kept in the data and APIs, so any of it can come back (the screens are in git at 6b3e0f9):

| Removed from the path | What still works |
| --- | --- |
| "What's this for?" | `onboarding_answers.why`, `/api/study-goals`. The default study goal is full depth |
| "How long do you want to remember it?" | `onboarding_answers.horizon`, `/api/retention-goals`, the profile page's goals card. The default is forever (`DEFAULT_HORIZON`): the full review calendar. The first-lesson card says so in one line, and that it can be changed |
| Reminders and the calendar file | `POST /api/prefs` `next_study` |
| "Same idea, your version" | Removed: it would need a subject before it, and it is a stop on the way to the real lesson. The owner asked for the flow to just ask. Its pre-written examples left `start-content.js` |
| The optional baseline and "tell me more" links on the last screen | The test is now in the flow; a learner who skipped it gets the link back. `/survey` still works |

**The private beta under `UI_V2=on` ends at the subjects (owner, 7 Nov):** "after picking the subjects it takes you to the homepage with a take placement button and a pick my grade button, instead of having to do all those in the main onboarding". Welcome, hello, age if needed, the short test, interests, how do you want to learn, subjects, then upload (own material or both), then home. The grade-or-placement step, the placement questions, the grade list, "building your path" and "first lesson ready" are not reached (`public/js/ui2/start.js` maps them to the subjects). `POST /api/ob2/to-home` ends the flow (`home_at` on `onboarding_answers`, which `inFlow` reads, so the redo-once account onboards once as before) and keeps the picked subjects as `waiting`. An enrollment always has a grade, so a subject with none can't be an enrollment, not even a `placement_pending` one: it waits on the answers row instead. Home (`GET /api/ui2/waiting`, `js/ui2/home.js`) shows each waiting subject with **Take the placement** (the strong pill: `/subject-placement?track=X&mode=quick`, the Quick walk with no goal or length step, `settleStart` still applying) and **Pick my grade** (the second pill: `/onboarding?track=X&pick=1`, that subject's grade list open). Either makes the enrollment the usual way and the card goes. Subjects the account already has don't wait. The age, parent and consent steps, and a child's own steps (style quiz, tap-only interests, no "how"), are unchanged; a child account also ends at home after the subjects. Without `UI_V2` the beta flow is the one below, unchanged.

**Not offered in the private beta (owner, 7 Nov):** "for the onboarding you have basketball chess and piano, but we haven't really fully built those so don't have those in the onboarding in the beta". `hiddenSubjects(req)` in `services/onboarding-v2.js`, applied whenever `privateBeta(req)`: `BETA_HIDDEN_SUBJECTS`, default `basketball,chess,piano`, empty for none. It filters `/api/catalog?view=grades`, which every picker reads: `/start`'s subjects, the add-a-subject page and the Everything menu's "Add a subject" (both `/onboarding`). The onboarding answers drop them too. Nothing is deleted: the subjects, their pages, the full catalogue and existing enrollments are untouched, and basketball as an interest stays.

**Signed out while a page is open** (`public/js/ui2/signed-out.js`, on `/start` and every app page under `UI_V2`): once the page has seen an account, a 401 or the beta's sign-up refusal (`beta: 'closed'` or `'not_invited'`) is checked with `/api/auth/me`; if nobody is signed in the page goes to `/login?next=<page>&why=signed_out`, which says "You were signed out. Sign in to carry on.", never "not taking new accounts". A wrong-password 401 is left alone.

**Under `UI_V2=on`** (`public/js/ui2/start.js`, docs/UI-V2.md) the flow has one more step, "How do you want to learn?", after interests and before subjects: Savant's curriculum, My own material, Both. It is stored in `onboarding_answers.how`; `notes` is true for the last two. Curriculum goes on to subjects as before. My own material goes to `/my-material`, then home, with no subject or grade. Both goes through subject and grade, then the first-lesson screen's button goes to upload. On the public flow a guest can't upload, so saving the account comes first and the last screen goes to upload. A child account can't upload (`CHILD_MEDIA_UPLOAD`), so it never sees the step, and the server never stores an answer for it. "My own notes" leaves the subjects under the switch. With the switch off, none of this exists.

**No upload inside onboarding (owner, 7 Nov):** "don't have the upload own material apart of the onboarding either". Under `UI_V2` the "How do you want to learn?" step stays; curriculum and both go to subjects, then home; own material goes straight to home. Home's Your material has "Upload your own" first, and for own or both with nothing uploaded the giraffe says "Add your notes when you're ready." (`/api/ui2/waiting` now also returns `how`). Two or more subjects on home are square raised tiles, two to a row at every width; a waiting subject's tile opens its Take the placement and Pick my grade card under the grid. Spanish joined `BETA_HIDDEN_SUBJECTS` ("that's over"), and the owner-only Spanish progress links (id 6689) left `public/js/dashboard.js`; the Spanish code and data stay. During a voice call the page stays: the giraffe already on screen shows listening, thinking and talking on itself (`html[data-u2-call]`), with a small label.

## 1. Inventory: what the old flow did and collected (step numbers are from the first version)

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
| Baseline (Quick, Balanced, Accurate tasks) | `/baseline`, `routes/onboarding.js` | `onboarding_*`, scorecard | scorecard's first picture | In the flow, Quick (section 3) |
| Style quiz | `/style-quiz`, `POST /api/profile/style-quiz` | `profiles.style_vector` | scorecard prior | In the flow, for accounts the baseline is closed to (section 3) |
| About-you survey (5 free-text boxes) | `/survey`, `POST /api/profile/survey` | `profiles.survey` | lesson writers | `interests` comes from step 6 at claim, when consent allows. The rest is on the last screen |
| Subject and grade picker, several at once | `/onboarding`, `POST /api/enrollments` | `enrollments` | path | Step 4 several subjects. The first goes straight on; the others are links on the last screen. Pick-a-grade-yourself stays at step 7. `/onboarding` still works as "add a subject" |
| Subject placement walk, Quick/Balanced/Accurate | `/subject-placement`, its API | `subject_placements` | recommended grade | Step 7 uses the same API in Quick. Balanced and Accurate stay on the old page, linked from the result |
| "Too easy / too hard", choose another grade | `POST .../adjust`, `.../choose` | `subject_placements` | start grade | Result screen at step 7 |
| Gap scan and catch-up after the walk | `/subject-placement`, `/api/gap-scan` | `gap_scan*`, `remediations` | catch-up plan | Moved to after the first lesson: the old result page stays reachable from the last screen |
| In-grade placement | `/placement`, `routes/placement.js` | `sessions` | start level inside a grade | Moved. See section 2 |
| Reading check offer | `reading-offer.js` on `/onboarding` | `reading_check*` | language level | Link on the last screen, and the dashboard's own offer is unchanged |
| Retention goal | `/api/retention-goals` (set later, per subject) | `enrollments.retention_goal` | review schedule | New: step 5 sets it, applied when the enrollment exists |
| Study goal (full, core, test) | `/api/study-goals` | `enrollments.study_goal` | lesson writers | A test answer at step 5 sets `test`, when that goal is switched on. Others stay full |
| Upload own notes | `/my-material` | `materials` | courses | Step 4 option for accounts that may upload. Uploading is after step 9 (section 2) |
| Next study plan | `POST /api/prefs` `next_study` | `users.next_study` | shown in app | Step 10 |

Should be there and was not: why they are learning; a retention goal at the start; a way to try before an account; reminders of any kind. Nothing sends email or push reminders today (`routes/prefs.js`: "It sends nothing to anyone"), so step 10 stores the plan and offers a calendar file.

## 2. Decisions in the order

1. **Under the consent age, the parent's email comes before the test**, in the agreement's place. The law and the code: nothing past the age screen opens for a child until a parent's email is on file (`js/onboarding.js ageStep`), and the test is now the first thing stored about them. Username and password stay at the save step on the public flow. No child email is ever asked for.
2. **Own notes only: no grade or first lesson.** Public: save, then upload. Beta: straight to `/my-material`. Child accounts don't see this option (`CHILD_MEDIA_UPLOAD`).
3. **The in-grade placement comes after the first lesson, as an offer, rather than before it.** The learner starts at the first teaching level of the grade (level 10 in most grades; levels 1 to 9 are practice, and nothing is marked cleared on the way, as with a placement).
4. **Only the Quick walk runs inside the flow.** Balanced and Accurate remain on `/subject-placement`.
5. **Several subjects: the first goes straight on.** The others are links on the first-lesson screen (beta) or the last screen (public). Asking a grade for each in turn would be a longer flow; a decision for the owner.
6. **Several interests are allowed**: "their interests". `onboarding_answers.interests` holds them all, `interest` the first; all of them reach the lesson writers once consent allows.
7. **A level check with too little to go on starts at the learner's age, not at an end of the scale.** The walk opens on the subject's first question and its belief is wide until it has answers, so "Stop here" or "I don't know" after a few questions put a 36-year-old on Preschool math, and one right answer then Stop put them on Senior Scholar. `settleStart` in `services/onboarding-v2.js` runs on the walk's result for learners in this flow; the walk itself is unchanged and its answer stays on the row as `walk_grade_id`.
   - Enough to place someone: 6 real tries (not "I don't know"), or 3 right among 6 answers. Six is the number the walk wants before it calls someone a beginner.
   - Not enough, 13 or older: the first grade of their school year (age minus 5), capped at 9th grade. The tutor says so on the result screen, and "Too easy", "Too hard" and picking a grade all still work.
   - Not enough, under 13: a low result stays; a result above their age comes down to their age.
   - Only subjects with school years in their grade names (math, English, reading). A beginner in Spanish, chess, piano, basketball, IQ or ACT starts at the start at any age.
   - With the switch off, or for an account not in this flow, nothing changes: the old page still gives the walk's own result.

## 3. The short test

The same test as `/baseline`: the same items, the same scoring (`services/onboarding/tasks.js`) and the same stored data (`profiles.onboarding`), through the same `/api/onboarding` routes. `public/js/start-test.js` only draws it in this flow's look, and sends what `public/js/baseline.js` sends. `/baseline` itself is unchanged and still works.

**What Quick really is.** Run it and read the steps: a required interests question, two timed tasks (30 seconds of same-or-different on five digits, forward digit span) and forced choices between two statements, about 16 steps at the usual pace, more for someone quick, because the budget is time (285 seconds of the learner's own pace). It has no reasoning, reading or mini-lesson items at this length. So the old page's "How do you learn best?", "it learns how you take things in and what helps you" and "It never grades you" were more than it can say, and the screen now says what it is: remember some numbers, spot which match, tap what sounds more like you, "a rough first picture, not a score or a diagnosis", and that lessons start from it and correct it. Nothing here calls it a learning-styles test, because it isn't one and the style quiz's own page says teaching to a style doesn't raise scores. docs/ONBOARDING-MODES.md has the simulated accuracy of Quick (it removes a small share of the error); no real-learner numbers exist.

**Time:** "About 5 minutes". 4.65 minutes at the median and 4.73 at p90 in the simulation (docs/ONBOARDING-MODES.md), not measured on people. The budget caps it for the median learner; a slow one gets fewer items.

**Who takes it.** `mayTake()`: `boosters.allowed`, plus an agreed guest on the public flow (only this test: boosters, the daily check and the other channels stay closed to guests). An account the baseline is closed to (under the consent age without the parent's `measurement_extras`) takes the style quiz: 20 questions, one a screen, the same scale and `POST /api/profile/style-quiz`, "about 2 minutes".

**Interests moved to the end of the test, without changing it.** Quick's required first question is interests. Asking it there and again on the owner's next screen would be the same question twice, so the flow opens the session with `interests_last`: that question is held to the end, its time stays reserved so the same tasks fit, and only what's typed on the interests screen goes through the same scoring as the box on `/baseline`. Stopping early still brings it up, so the answer counts. `/baseline` doesn't pass the option.

Measured, `scripts/onboarding-v2-test.js` (12 scripted learners, 2 extreme and 10 mixed, on all 100 measures, each taking each item's usual time; simulated, not people): the same items 12 of 12, mean difference on the 0-100 scale 0.000, worst 0.000. Someone who would have typed faster than the 25 seconds reserved can lose an item or two at the end. A tile tap reads nothing (fixed 7 Nov, `scripts/tapped-interests-test.js`): this scoring reads word count on three measures (relevance demand, interest transfer, curiosity hook), and a tap is a choice from a list, not a short answer, so those three stay where the rest of the test left them. Words typed under "Something else" are still read by word count, as on `/baseline`.

**Carry-over.** A guest's test is on the guest row, so saving the account keeps it. A guest signing in to an existing account brings the test across only if that account has none, fed to its scorecard (`moveToAccount`). An open session closes when the first lesson is made or the account is saved. A reload carries on at the same step (`resume`). Skipping is allowed ("Skip for now", as `/baseline` always allowed), and the last screen offers it again.

## 3b. Under-13s and other under-consent-age learners

- Age screen: same endpoint, same neutrality. First answer holds.
- Next, on the public flow: nickname and parent's email create a limited child row, and `requestConsent` emails the parent. A failed email is shown, not hidden, and can be retried. Nothing about the child reaches the server before this.
- Then the style quiz, interests by tap only (no free-text box, because a child's typed words are not collected before consent), subjects without "My own notes", grade or placement.
- The same limited account as today (`pending`): no outside AI, no camera or mic, no uploads. `CONSENT_PENDING_ACCESS=locked` still locks and sends them to `/parent-needed`.
- Public: username and password at the save step. If nobody answers in 14 days the existing sweep deletes the account, unchanged.
- The chosen interests reach `profiles.survey` only once `ai_free_text` is true; until then they stay in `onboarding_answers`, which export and deletion cover.

**In the private beta:**
- An invited under-13 signs up on `/register` as today: age, then the child form (username, password, nickname, the parent's email, which is the address the invite was sent to). `registerChild` emails the parent there. Then `/start`: no age screen, no parent screen, no agreement, the style quiz, tap-only interests, subjects, grade, and a standard first lesson, with the limits above. They never agree for themselves: no `learner_agreements` row; the parent's answer on `/parent-consent` is the record.
- A signed-in account with no age on record that answers under the consent age on `/start` gets one screen for the parent's email (`/api/ob2/begin`, the same `requestConsent`) before the test. Its account keeps whatever email it was made with.
- A parent never comes through `/start`: parents are a separate table with their own sign-in, and their pages are untouched. An adult parent who signs up for themselves is an ordinary adult account.

## 4. Agreement and guest data

**The private beta (owner, 7 Nov): the agreement is not on the onboarding.** Testers are approved applicants. The application form's only required tick is emails, so it covers neither the terms nor outside AI, and the agreement is recorded where the account is made: `POST /api/auth/register`, when `public/register.html` sends the version of the line it showed (`SIGNUP_AGREEMENT` in `services/onboarding-v2.js`; a test checks the page and the server have the same words). One `learner_agreements` row, `via: 'sign_up'`, with the words. `access()` is not changed: it reads the age as before, so an account with no row still counts as full.

The way in is `scripts/beta-invites.js approve --send`, the emailed `/join?invite=CODE`, `/register`. That needs `BETA_SIGNIN_ONLY=off` and `BETA_GATE=invite` (the deploy kit's own note: "Set BETA_SIGNIN_ONLY=off when testers start signing up"), because sign-in only allows no new account at all. So "the beta" here means either switch: with only `BETA_SIGNIN_ONLY` as the test, every tester signing up by invite would have met the guest and agreement flow, and the guest routes would have let anyone past the invite. With `BETA_GATE=invite` or sign-in only: `/agree` and a logged-out `/begin` refuse, so no guest row can be made; `/register` stays the sign-up page; `/start` signed out goes to sign-in; `/dashboard` and `/onboarding` send an account with no subject (not an admin) to `/start`; an account with a subject goes home.

Not covered: accounts that already exist (the owner's, the demo) have no row and never see the line. They keep working, since `access()` doesn't look at rows.

**On the public flow, everyone agrees before they get access (owner, 7 Nov).** Right after age, a learner at or over their country's consent age sees the beta terms, privacy and outside AI services, and chooses `I agree to all three` or `I don't agree`. Neither is picked and Continue is off until one is. Declining stops with "You can't use the beta without this", the privacy link and a way to choose again; it creates nothing on the server. No step past it can be reached without agreeing. An under-consent-age learner never sees it: their parent decides, as today. There is no separate terms page yet, so the terms are the words on the screen (`AGREEMENT` in `public/js/start-content.js`). They need the owner's or a lawyer's reading.

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

## 6. Look

Owner, 7 Nov: "a clean ui look like Duolingo and brilliant". The spirit only, from the reference screens in `design-refs/pixlpin`: one question per screen, generous space, big friendly type, large rounded answer cards with a thicker bottom edge that sinks when pressed, a chunky button, a simple filled bar, the tutor with a speech bubble. Nothing is copied: no art, wording or brand colours. Everything is built from the Sunny giraffe's palette: cream page, the giraffe's amber for action with dark brown text, its spot brown for what is chosen, Atkinson Hyperlegible throughout. On desktop the giraffe has a warm side of its own. The browser test measures the contrast of every piece of text on every screen it visits (AA), in both modes.

The agreement's two answers sit in the footer, so both show without scrolling on any phone. During a timed task the tutor steps aside. **Awaiting the owner's approval of the design: this look is a proposal.**

The tutor is one component, `public/js/start-tutor.js`: the Sunny giraffe (owner, 7 Nov: "for now"), an SVG with moods. Swap this file and the .tutor block in start.css to swap the character. `Tutor.NAME` is null and copy never names it.

## 7. What was checked, and what wasn't

`scripts/onboarding-v2-test.js` (in the suite) covers the API, on the public flow, the invite gate and sign-in only. `scripts/onboarding-v2-browser.js` (needs playwright, not in the suite) walks Chromium on a local copy of the store. It fails on a console error, a CSP violation, sideways scrolling, low contrast, a small target, or a word about signing up on a beta screen. Personas: beta adult and under-13 through the real invite, an account with no age under sign-in only, the public adult and child, returning, reload, a taken email, typed interests, own notes, declining, keyboard only, reduced motion, a guest on the app's pages, and every subject.

Not checked: Safari, Firefox and real phones (Chromium only); a real email reaching a parent (the dev outbox was read); a run with model keys present or outside AI on (these runs have it off, so the first lesson is the standard one; the wait for an own lesson is unchanged and was last measured before this rework); finishing a whole first lesson by hand; real learners, so nothing here says the flow converts or teaches better. Times are estimates and simulations.

## 8. Decisions for the owner

- Reminders: none are sent, and the flow no longer asks for a plan.
- A guest signing in to an existing account keeps the level check but not lesson answers.
- The agreement's wording and the sign-up line need reading; there is no separate terms page, so the line says what the terms are.
- Existing accounts have no agreement row.
- Several subjects: only the first gets a grade in the flow.
- Turn on `COLD_FIRST_BLOCK` and `CORAL_LEARNER` with `ONBOARDING_V2`: "built around you" depends on them.
- Starting level with too little evidence (section 2, item 5): the 9th-grade cap for adults, and six "I don't know" counting as no evidence rather than as a beginner, are judgement calls.
