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
| S9 | YouTube links (caption text only) and video files (mp4, mov, webm, mkv: ffmpeg pulls the audio, the S8 transcriber makes the text) | `services/material-youtube.js`, `services/material-video.js`, `services/material-web.js` (`fetchText`), `routes/materials.js` (`/youtube`, `/video`) | `material-video-test.js` |

## S7 details

- The service worker keeps only public static files (`/css`, `/js`, `/fonts`, `/icons`, the favicon, `/offline.html`).
  It never touches `/api`, a non-GET request, another origin, or `/spanish-media`. No learner data is stored by it, so
  `public/privacy.html` needs no change.
- Static files are network-first (a deploy shows at once); the stored copy is used only when the network fails.
  A page opened offline shows `/offline.html`.
- `sw.js` and the manifest are served `no-cache`. Registration is skipped on the sealed Spanish test pages.
- Icons are PNG renders of `public/favicon.svg` (192, 512, maskable 512).

## S9 details

- YouTube: the watch page is fetched through the SSRF-guarded fetch (youtube.com hosts only, redirects included), the caption
  track list is read from the page, a hand-written track is preferred over an auto-generated one, and the text is kept.
  The video and its audio are never downloaded. This reads data the watch page shows but YouTube does not offer as an
  API, which is the terms risk named in `docs/yc/STUDLEY-RECON.md` section 6; the owner accepted it on 30 Oct. If a video has
  no captions the learner is told to upload the file or paste a transcript. YouTube can change its page at any time; the
  parser fails with a plain message, not a wrong text.
- Video files: sniffed by bytes, up to 200 MB. ffmpeg (`ffmpeg-static`, optional dependency, else `ffmpeg` on the PATH)
  writes 16 kHz mono wav into a private temp folder, the transcriber (`services/material-transcribe.js`, built by S8, exports
  `transcribeFile(wavPath, { seconds, onProgress })`) returns the text, and the folder is deleted in a `finally`. Without S8's
  module the upload answers 503 "not installed" and nothing is kept. Cap: 3 hours of sound.

## Deferred, and why

- **Lecture audio speech-to-text and premium voices:** need an owner budget; no new outside vendor was added.
  (The owner's later order, S8 and S9, asks for local Whisper; see the backlog.)
- **Share links:** need an owner decision (the rule is per-learner, never shared).
- **Real-model and real-browser checks:** S3b, S4b, S5b, S6b leftovers in `docs/yc/BACKLOG.md`.
- **S7 on a phone:** install it from Chrome on Android and Safari on iPhone ("Add to Home Screen"), check the icon,
  the standalone window, and that an offline reload shows the offline page. Not done here (no device).

## Optimal for each learner (S12, first slice)

`services/material-adapt.js` reads the learner's progress row and says what each skill needs: known (mastered, not due: skipped), due (the learner's own review clock), fix (missed questions or remediation, first), learning, or new. The practice test's "Pick for me" option (`adapt: true`) uses it: it asks only about skills that are not known, sizes the test by need, puts missed questions first and asks at or above the skill's tier. Mechanisms: 07-M3 (placement skip), 07-M4 (tiers), 07-M6 (wrong answers return), 07-M9 (spacing). Proof: `scripts/material-adapt-test.js` (200 simulated learners: no unknown skill is skipped, no known, not-due skill is asked, a learner who knows half is asked half as much). No new data is stored, so the privacy text is unchanged. Not yet wired into: flashcard picks beyond their own schedule, the study pack's quiz section, the podcast "weak spots" cut (S12b).
