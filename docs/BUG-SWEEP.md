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

## Spend

Free models only. The Anthropic key was reached twice by the fact-check step of the upload flow (about $0.05 in all, through the ledger; the run cap was $1).

## Re-run

```
node scripts/bug-sweep-crawl.js http://localhost:PORT anon,adult,teen,child,admin
node scripts/bug-sweep-api.js   http://localhost:PORT
```
Start the app first on a copy of the database (see the header of `scripts/learner-walk.js`).
