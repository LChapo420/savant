# Staged: chess practice links on the chess path page

Not applied: learner-visible, so it needs the owner's approval.

- **What:** on `/path` for the chess track only, a row of three links under the banner: Rated puzzles (`/engine/chess/puzzles.html`), Move trainer (`drills.html`) and Play a human-like opponent (`spar.html`). Other subjects are unchanged.
- **Apply:** from the app folder, `git apply curriculum-build/staged/chess-links/path-js.patch`, or paste the 6 added lines after `${bannerHtml}` in `public/js/path.js`. The patched file passes `node --check`.
- **Already live without this patch:** the three chess pages link to each other and to `NOTICES.txt` (credits).
