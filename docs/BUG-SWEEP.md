# Bug sweep, 6 Nov 2026

Owner: "fix any bugs accross the whole site". Branch `bug-sweep`.

## How it was swept

- A local copy of the app (own port, own copy of the database, `OWNER_BASE=off`), never the live data.
- `scripts/bug-sweep-crawl.js`: every `public/*.html` page (plus `/` and `/spanish/`) loaded in a real Chromium over the DevTools protocol. It records console errors and exceptions, content security policy violations, 4xx and 5xx responses, failed requests, inline `<script>` blocks and `on*=` handlers, `javascript:` links, broken images, horizontal overflow, low-contrast text and slow loads. Viewports: desktop, mobile 375 px, mobile 375 px dark mode. Personas: signed-out, adult, teen (15), child (10, parent not yet agreed), admin. 720 page loads in all.
- `scripts/bug-sweep-api.js`: every GET route (read from `routes/` and its mount in `server.js`) as each persona; reports 5xx, non-JSON answers and slow replies. 104 routes x 5 personas.
- `scripts/learner-walk.js` (enroll, game, checkpoint, spanish, uploads, daily, block): sign-up, placement in five subjects, level opening, game levels, uploads (notes, study pack, flashcards, practice test), the daily plan, retention, the tutor dock. Real (free) models.
- Hand-driven in the in-app browser: sign-up with the age screen, the child branch, the quick baseline, the daily check; account export and deletion over the API.
- Static scans: inline scripts and `on*=` handlers, `javascript:` links, `eval` and `new Function`, `style=` on the marketing site (its policy has no `unsafe-inline` styles), links to files that do not exist, syntax check of every `public/js` file.
- Live site, read-only (GET only, no account, no write): `/`, `/privacy`, `/evidence`, `/creators`, `/thanks`, `robots.txt`, `sitemap.xml`, a 404 page, and every same-site asset those pages link to (14). All 200, none dead, no inline script, style or handler (its policy forbids them), all under 700 ms.

## Result

The app was in better shape than expected. The page crawl found no console error, no CSP violation, no inline script or handler and no overflow on any page for any persona. The two real bugs are below. The daily check bug the owner mentioned (a blocked inline script) was already fixed on main before this sweep; nothing else of that kind is left.

| # | Bug | Severity | Fix | Status |
|---|-----|----------|-----|--------|
| 1 | Every page for a signed-out visitor (and the login and register pages) asked `/api/tutor/dock`, got a 401, and logged a red "Failed to load resource" console error. Harmless to the visitor, but it hid real errors and made every page look broken in DevTools. | Low | `public/js/tutor-dock.js` asks `/api/auth/me` (always 200) first and starts the dock only for a signed-in learner. Regression check in `scripts/tutor-dock-test.js`. | Fixed |
| 2 | The dashboard's `/api/progress` took 500-600 ms, blocking the whole server for that time on every dashboard load, for any learner with enrollments. Cause: `services/unit-placement.js` `bankFor` and `calibrationFor` called `fs.statSync` on every lookup, and the write-ahead trigger looks a grade's units up about 120 times per enrollment. Now the stamp is re-read at most once a second (`UNIT_STAT_EVERY_MS`, 0 = every time). The trigger fell from about 600 ms to about 100 ms; what is left is the answers scan in `services/coverage.js`. Regression check in `scripts/coverage-test.js` (it fails with `UNIT_STAT_EVERY_MS=0`). | Medium (speed) | as described | Fixed |

## Checked, not bugs

- 404s for signed-in non-admin personas on `/cost-tracker`, `/my-stats`, `/recruit`, `/api/consent/admin/forms`: by design (admin-only pages answer 404).
- 404 on `/api/spanish-check/status`, `/api/spanish-check-lc/status`, `/api/spanish-study-test/status` for ordinary learners: those tests are for study participants only.
- `/my-material-*.html` opened with no `?id=` shows an error notice ("No such endpoint") rather than a blank page. Handled; not worth a redirect.
- `/study-demo.html` dark mode: the contrast scan flags a gradient-text word ("a study set"); its text colour is transparent by design and it reads fine.
- Signed-out visitors hitting a login-only page get 401s from the page's first API call before it redirects to `/login`; the redirect works. Expected.
- Page loads over 3 s in the crawl (session, review, act-scores, profile) were load artifacts: four pages loading at once beside a model-heavy walk. Single requests for the same pages and their APIs answer in 5-20 ms, apart from bug 2.

## Not fixed, reported (outside this sweep's scope or not a code bug)

- The walk's uploads flow waited 261 s for notes and 135 s for the study pack on opening, and the "build the learning path" step was still `building` after 421 s. The models in the test run (free NVIDIA tier answering 429, 450 s layout calls) were the cause, not the app; `services/pool.js` and the course builder belong to other agents. Worth a look at pool timeouts when the free tier is saturated.
- `scripts/learner-walk.js` fails its register steps once an hour's 10 registrations are used (the crawl and the walk share one address); restart the server between runs, as its header says.

## Tests

`npm test` run in three parts (it stops at the first failure): steps 0-134 passed; step 135, `tutor-screen-test.js`, failed because its fake `fetch` did not know the new `/api/auth/me` call from bug 1's fix. That stub was stale, not the test's intent, so it now answers `/api/auth/me` as a signed-in learner (the only test edit); steps 135-190 then passed. The last two parts were run through a temporary slice of `scripts/test-steps.json`, restored afterwards (no diff).

## Spend

Free models only. The Anthropic key was reached twice by the fact-check step of the upload flow (about $0.05 in all, through the ledger; the run cap was $1).

## Re-run

```
node scripts/bug-sweep-crawl.js http://localhost:PORT anon,adult,teen,child,admin
node scripts/bug-sweep-api.js   http://localhost:PORT
```
Start the app first on a copy of the database (see the header of `scripts/learner-walk.js`).

# Bug sweep 2, 6 Nov 2026 (pages that load fine and do the wrong thing)

Branch `bug-sweep-2`. Real Chromium over CDP (phone and desktop viewports, real mouse clicks), plain HTTP scripts and a word planted in every field. Local copy of the app and the database, test accounts only, one server hooked to log every outbound host. Regression test for all of it: `scripts/bug-sweep-2-test.js` (no model calls, in `npm test`). The first sweep found almost nothing because it looked for errors; every bug here returned 200.

## Found and fixed

| # | What a learner saw | Fix |
|---|---|---|
| 1 | **The instant lesson graded against the wrong plan.** The shared lesson opens at once while the learner's own plan is written behind it. Once that was ready, the check and finish routes used it instead. Both plans number their checks c1, c2, so an answer was marked against a different question, and the finish asked for checks not on the page. | The level stays on the plan it opened on, reloads included (`blockLevels.openedOnShared`). |
| 2 | **Crisis replies missed most chat routes.** "I want to kill myself" got a hint or an explanation from a model in the streamed coach (what the session page really uses), when asking after answering, under a lesson block, a game question or a lesson page, and in the teaching chat. Only the dock, home chat and the unstreamed coach had the rule. | The fixed reply on all of them, nothing kept, no model. |
| 3 | **A child with no outside-AI consent got a refusal to a crisis message.** The home chat and coach answered "this uses an outside AI service". | The gate answers a crisis message with the fixed child reply (no model involved). Anything else stays refused. |
| 4 | **Crisis wording.** Missed: every phone's curly apostrophe (`don’t`, `I’m`), "I do not want to live", "I want to end it", "life isn't worth living", "kms", "took a bunch of pills", "my brother is not breathing", "cant breath". Wrongly fired: "this test is going to kill me", "my mom will kill me if I fail", "someone online said the answer is 5" (stranger warning), "the teacher is passing out the tests" (911), "I am learning about poison dart frogs" (911), "I am writing an essay about overdose deaths", "why does Juliet commit suicide" (988), and a child's "my school is really hard" (told not to share it). | `services/tutor-safety.js`. When a message is unsure the safety reply still wins: a person simply "going to kill me" stays a crisis. |
| 5 | **Deleting an account left what the learner typed.** Answers and block telemetry sit on the shared plan row under their id. A planted word survived in `block_plans`. | `blockLevels.forgetLearner` on both deletion paths. |
| 6 | **A reply that finished after the deletion brought rows back** under the old id, the learner's words included (`assist_chats`, `tutor_memory`, `tutor_archive`). | The consent sweep removes them for an hour after a deletion. |
| 7 | **The account export missed collections** kept and deleted but not exported: `lesson_layers` (its header said it was), `skill_records`, `study_sessions`, `enforcers`, `material_audio_jobs`, `reading_checks`. | Added; the test fails when a collection is left out. |
| 8 | **A child's YouTube link reached youtube.com.** The rule is no uploads from child accounts, but YouTube, video and audio were not on the list. | Added to the list. This closes a gate; it opens nothing. |
| 9 | **A dead button when no model was free.** "Learning path" or "Study pack" pressed while every NVIDIA model cooled down after a 429: the build ended with no row, the button stayed grey with a stale "Planning your course" for good. | A cooling model no longer stops a build (`ai.canBuild`). A build that truly cannot start says so and the button works. Same on the notes page. |
| 10 | **The layer vanished while NVIDIA cooled down.** The route asked about the writing models; the layer uses other ones. Three learners got a plain lesson while the log said NVIDIA could not answer; others just before and after got the layer. | The route no longer asks. No model at all: the slot is dropped in about a second. |
| 11 | **On a dropped connection a check said "Not quite. The answer is: Failed to fetch"**, in red, as if the learner were wrong. | "Not saved. Try that answer again." Every page now says "No connection" rather than the browser's words. |
| 12 | **A study page opened mid-build said "Every skill mastered, nice work"** with skills still to come, and never mentioned them. | It says the rest is being written, N of M ready. |
| 13 | **A partly built path said "press Learning path again"**, a button that had already become Study. There was no way to build the rest. | A "Build the rest" button. |
| 14 | A double click on Finish in a skill check showed an error over the result. Grading was right. | The button locks. Small. |

Reverting the plan pin makes the test fail on the marked-against-another-question check. The two page fixes (9, 13) were watched in a real browser against a server with no model keys; their test is only a text check of the page script.

## Checked and fine

- Phone: instant lesson opened in under 1 s, layer in 5 to 12 s, a reader past the slot moved 0 px (-0.16), reload keeps answers and layer.
- Adult by clicks: sign-up form, subject picker, placement with a reload and back/forward mid-way (resumes on the same question), first lesson, finish, level up. 15-year-old, 10-year-old pending and 10-year-old with parent consent but no AI opt-in over HTTP, plus a 10-year-old's first session page in the browser.
- Grading: answers checked against the stored key on ordinary sessions, the upload path's practice, skill check and practice test: no misgrade. Lesson checks: the verdict shown and the finish count agree. Blank answers score wrong. A repeat answer keeps the first verdict. Double click on finish closes once. A finished level reopened counts as review.
- Under-13: outbound host log on a fresh server: **zero** outside calls for pending and active-no-AI children through placement, sessions, dock, chat, lesson (YouTube was the one exception, fixed). Children get no layer and no tailored plan. Dock falls back to local notes.
- Uploads: paste, text PDF, damaged PDF, unknown type, empty file, too-short text: right messages. Path, notes, pack, cards, practice test, study mid-build. Delete while a build is queued and after it is built: no row left (a row removed mid-write cannot come back: `db.update` on it does nothing).
- The spaced review sitting itself was not driven: nothing is due on day one (the page and the 'nothing to review' answer are right). `scripts/` tests cover the sitting.
- Account: export covers every planted word that had reached the store; wrong password and missing DELETE refused; session gone afterwards; sign out; login page after. A second tab (simulated over HTTP with the same session): first answer stands, counts stay right. Offline finish recovers.

## Could not check

- **Images and scanned PDFs:** `tesseract.js` is an optional dependency and is not in `node_modules` here, so every picture gets "This server cannot read text from images yet". Check that the beta server has it. The same goes for the Whisper model on audio.
- Under-13 with AI consent verified (needs the signed form), real speech, real Safari. Timing under load: NVIDIA's free tier was saturated by other agents, so the 919 s path build here says nothing about the app.
- Latent: `services/tutor-vision.js` sends `outside: true` for everyone. No vision slot exists today, so no call is made. It needs the consent check on the day one is added.

## For the owner

1. **There is no password reset.** No route, no link, no email. A learner who forgets their password is locked out. A new feature, so left alone, but worth deciding before Nov 15.
2. **The personal plan for a level opened instantly is still written and never served for that level**, since the level stays on the shared lesson. That costs model calls. Keep it (the design doc says it is for later levels), or skip it for that level?
3. **A typed answer on the upload path is checked by exact words or key words, no model.** A right paraphrase can be marked wrong.
4. **Other emergencies** (choking, snake bite, a fire) go to the model, not the fixed reply. Add them?
5. A learner who has never answered anything starts at "Level 10 of 578, the start of the grade". Is the number meant to show?

## Spend

Gonka through its ledger, about $0.30 by the shared ledger's change, some of which may be other agents'. Nothing else paid: Anthropic, Modelflare, OpenRouter, Standard Compute, Munito, Coral, Grokified, Lyceum, ZeroGPU and xKiro keys were blank on the test servers. CPU was shared with other agents throughout.

## Tests

`scripts/bug-sweep-2-test.js` is new (step added to `scripts/test-steps.json`). Full run, 203 steps, CPU at 97% from other agents: 3 failed. `material-inputs-test.js` pinned the exact text of the child upload list, which now has three more uploads: its pattern was widened, the only edit to an existing test, and it still requires link and transcript. `instant-test.js` found a real slip here (its stub has no `canBuild`), fixed in the code; what is left there is a timing check on `claim()` (about 450 ms at 97% CPU) that passed on one of three solo runs and touches nothing changed here. `onboarding-test.js` hit its 28 s simulation limit under load and passes alone.
