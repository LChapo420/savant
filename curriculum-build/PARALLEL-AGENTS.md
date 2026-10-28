# Working side by side: the rules for the three subject agents

Three agents work at once in this one folder (chess, piano, basketball). It is
not a git repository, so there are no branches: the rules below are what keeps
the agents from overwriting each other.

## The app

- App folder: `C:\coding\claudecommittdIq\folderThing\iq-max-repo-2-claude-adoring-mayer-woc9sq`.
  This is a Node/Express app with a JSON database, and it needs `NODE_PATH=../node_modules` on every node command.
- **Your own database, always.** Prefix every node command, tests included, with
  `DB_FILE=data/parallel/<subject>.db.json`. That file is a full copy of
  `data/db.json` made for you. Never write `data/db.json` itself; the lead merges your lesson rows at the end.
- **Your own server port:** chess 6801, piano 6802, basketball 6803. Run it in the background:
  `PORT=<port> DB_FILE=data/parallel/<subject>.db.json NODE_PATH=../node_modules node scripts/spanish/serve-local.js`.
  Stop it when you are done.
- **Lesson generation** (one level):
  `DB_FILE=… NODE_PATH=../node_modules node scripts/generate-base-levels.js --track <t> --grade <g> --from N --to N --only lessons --no-assign --force`.
  - It uses GLM 5.3 Flash only. That is a product decision: never pass `--allow-backup`, and never use another model for generation.
  - A lesson takes 2–5 minutes, so run it in the background.
  - Budget: at most 5 generations per subject.
- **Inspect a written lesson:**
  `DB_FILE=… NODE_PATH=../node_modules node "C:/Users/admin/AppData/Local/Temp/claude/C--coding-claudecommittdIq-folderThing/8304e993-1dc9-4a68-868d-de3164df74a4/scratchpad/inspect-plan.js" <track> <grade> <level>`.
  Set `WIDE=2000` for more of each block, or `RAW=1` for the whole row.
- **Tests:**
  - `scripts/<subject>-items-test.js` is yours.
  - Run `scripts/block-levels-test.js` too, with your DB_FILE.
  - 4 failures in `self-test` and `scorecard-test` were already there before; leave them alone.

## Hard rules

- Never print, log or paste an API key value, and never edit `.env`.
  `OPENROUTER_GPT_SOL_API_KEY` is reserved for the coding assistant and is never wired into the app.
- Read `docs/PRODUCT-DECISIONS.md` first. In particular:
  - repertoire and songs are public-domain only;
  - under-13 users need parent consent;
  - no height, scholarship or IQ claims;
  - deletion stays off in beta.
- **CSP is `script-src 'self'`:**
  - no inline scripts and no CDN scripts;
  - any library is vendored into `public/vendor/<subject>/` with its LICENSE file beside it;
  - licenses must be MIT, Apache-2.0, BSD or CC0;
  - for GPL, AGPL or anything unclear, do not add it: report it.
  - Get a package without touching `package.json`: `npm pack <pkg>` into your scratch folder, extract it, and copy the files you need.
  - If something must be downloaded from anywhere other than the npm registry (for example model weights on another host), do not download it. Report its URL, size and license.
- **Inspired-by, never copied.** The named apps (chess.com, Simply Piano, HomeCourt) are for feature reference only. Never copy their names, logos, art, sounds, wording, lesson content, songs or screens; build our own versions under our own names.
- Players and learners are "they". Never use gendered pronouns for a learner or player.
- No commits and no PRs (this is not a git repo).

## Who owns what

- **Yours alone:**
  - `public/engine/<subject>/*`
  - `public/vendor/<subject>/*`
  - `services/<subject>-checks.js`
  - `content/<subject>-*.js`
  - `scripts/<subject>-*.js`
  - `curriculum-build/<subject>/*`
- **Shared files:** `services/block-levels.js`, `services/grading.js`, `config/curriculum.js`, `routes/*`, `public/js/*` and `config/db.js`.
  - Edit only your own subject's parts: your `*_BLOCKS` object, your `*_LAYOUT_NOTE`/`*_FILL_NOTE`, and your branches in `publicPlan`, `checkFormats` and `cleanCheck`.
  - Re-read the file immediately before every edit, keep each edit small, and never reformat or move code.
  - A change to shared behaviour that affects every subject (the pipeline, grading for all formats, the session player) is not yours to make. Write it up in your report as a recommendation, with the exact diff you would make.
  - New database collections: add yours to `COLLECTIONS` in `config/db.js` with one small edit, re-reading first.
- **The browser pane is shared:**
  - open your own tab with `tabs_create` and use only that tab;
  - never close the other agents' tabs;
  - use your own port.

## What already exists (built today)

- **Block system** (`services/block-levels.js`):
  - The AI writes a layout, then the fill.
  - Blocks come from a library scoped per track: `CHESS_BLOCKS`, `PIANO_BLOCKS`, `BASKETBALL_BLOCKS` and `CHECK_BLOCKS`.
  - Block data is schema-checked, plus each subject's `blockProblems`. A broken block gets one repair call, and anything still broken is dropped.
  - Checks are server-graded, using the formats board, keys and play.
  - A refused check now gets one repair call, with the reason it was refused.
  - Choices written as objects are now read correctly.
- **Pages:**
  - `public/js/block-level.js` loads `/engine/compiler.js` plus `plan.files`.
  - Each block is `LessonBlocks.get(tag).renderBlock(el, data)`.
  - `public/engine/checks/checks-common.js` is the check kit.
- **Chess:**
  - `chess-core.js`: rules, perft-verified.
  - `bot.js`: alpha-beta search, depth 1–4.
  - `board.js`: the board widget.
  - `chess-blocks.js`: `Check_Board`, `Chess_Position`, `Chess_PlayOut`. PlayOut goals are win, mate, capture, draw, promote and survive.
  - `services/chess-checks.js`: FEN legality; the key must match the prompt for mate, capture, check, promote, castle and "as far as"; play-out goal sanity.
- **Piano:**
  - `piano-core.js`: YIN pitch detection, note alignment, `scorePerformance`.
  - `piano-io.js`: Web MIDI, the microphone, a synth, and an on-screen keyboard.
  - Blocks: `Piano_Keys`, `Piano_Staff`, `Piano_PlayAlong`, `Piano_EarEcho`, `Check_Piano`.
  - `services/piano-checks.js`: chords and scales verified with the theory engine; refuses open-ended, echo and count-mismatched keys, and wrong black/white keys.
- **Basketball:**
  - `court.js`: half court in feet, frames, `validate`.
  - Blocks: `Basketball_Play`, `Check_Play`, `Basketball_Film` (camera plus rubric), `Basketball_ShotLog` (tap-to-log stats), `Basketball_Session` (health gate, warm-up, drills).
  - `services/basketball-checks.js`.
- Each engine folder has `demo.html`/`demo.js` testbeds, served at `http://localhost:<port>/engine/<subject>/demo.html`.

## Saving your progress

Write `curriculum-build/<subject>/TOOLS-NOTES.md` as you go: what you did, what you found, and what is left. If you are cut off (for example by a usage limit), the next agent continues from that file.

## Your final report (under 600 words)

- What you built and changed, file by file, with shared-file edits listed separately.
- What you verified, and how (tests, browser, generated lesson).
- What you could not verify. Devices cannot be tested in the pane: say so plainly.
- The real lesson's final state: the blocks, and each check with whether its key is right.
- Open decisions for the owner, such as licenses or downloads needed.
