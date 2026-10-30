# Studley parity: what was built (branch `studley-parity`)

Built from `docs/yc/STUDLEY-RECON.md` (on `yc-next`). All of it sits on top of `own-material-paths`.
Nothing here was run with a live model or a real browser: the tests use the existing mocks. The owner's
local agent verifies with real models and a browser (backlog S3b, S4b, S5b, S6b, S7 below).

| Item | What it does | Code | Test (in `scripts/test-steps.json`) |
|---|---|---|---|
| S1 | Study pack (summary, flashcards, quiz, practice test) beside the learning path | `services/material-pack.js`, `routes/materials.js` (`/:id/pack`), `public/my-material-pack.html` | `material-pack-test.js` |
| S1b | Extend a path: more practice on the same skills, or add another material's skills | `services/course-extend.js`, `routes/materials.js` (`/:id/course/more`, `/course/add`) | `course-extend-test.js` |
| S2, S2b | Flashcards on the path's spaced-review curve; edit cards; cards from missed questions; due count on home and daily review | `services/material-cards.js`, `public/my-material-cards.html` | `material-cards-test.js` |
| S2c | Record, retry and report parts of an upload that could not be read | `services/course-builder.js`, `routes/materials.js` (`/:id/course/retry`) | `course-missed-test.js` |
| S3 | Practice test on demand: pick skills and length, timed or untimed; short answers through `services/typed-grading.js` | `services/material-test.js`, `public/my-material-test.html` | `material-practice-test.js` |
| S4 | Tutor grounded in the learner's own passages | `services/material-grounding.js`, `services/tutor-context.js` | `material-grounding-test.js` |
| S5 | PPTX, web links (SSRF guard) and pasted transcripts as inputs | `services/material-web.js`, `services/material-parsers.js` | `material-inputs-test.js` |
| S6 | Podcast: two-host script, overview and weak-spots episodes, browser voices only | `services/material-podcast.js`, `public/my-material-podcast.html` | `material-podcast-test.js` |
| S7 | Installable app and offline shell | `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`, `public/icons/`, `public/js/app.js` (registration), `server.js` (headers for `sw.js` and the manifest) | `pwa-test.js` |

## S7 details

- The service worker keeps only public static files (`/css`, `/js`, `/fonts`, `/icons`, the favicon, `/offline.html`).
  It never touches `/api`, a non-GET request, another origin, or `/spanish-media`. No learner data is stored by it, so
  `public/privacy.html` needs no change.
- Static files are network-first (a deploy shows at once); the stored copy is used only when the network fails.
  A page opened offline shows `/offline.html`.
- `sw.js` and the manifest are served `no-cache`. Registration is skipped on the sealed Spanish test pages.
- Icons are PNG renders of `public/favicon.svg` (192, 512, maskable 512).

## Deferred, and why

- **Lecture audio speech-to-text and premium voices:** need an owner budget; no new outside vendor was added.
  (The owner's later order, S8 and S9, asks for local Whisper; see the backlog.)
- **Share links:** need an owner decision (the rule is per-learner, never shared).
- **Real-model and real-browser checks:** S3b, S4b, S5b, S6b leftovers in `docs/yc/BACKLOG.md`.
- **S7 on a phone:** install it from Chrome on Android and Safari on iPhone ("Add to Home Screen"), check the icon,
  the standalone window, and that an offline reload shows the offline page. Not done here (no device).
