# public-v2: "Measured and marked" (P0 + P1)

Built from `curriculum-build/DESIGN-RESEARCH-NOT-VIBECODED.md` (direction, type, colour, the scale,
the marks, per-screen changes, the what-not-to-do list). Base: a full copy of `public/` taken
2026-10-22 17:24; everything below is a diff against that copy. Nothing outside `public-v2/` was
edited (no server, routes, services, content or data changes).

## Merge: what the lead needs to know

1. **Copy `public-v2/` over `public/`** (then delete this file from `public/` or keep it as notes).
   No element id, API call or data flow was removed; ids and `/api/...` paths in every changed file
   were checked against the base copy. One dashboard read was **added**: `GET /api/path/<id>` for
   the single "next" enrollment (to name its current level and put its checkpoints on the scale);
   it is wrapped in try/catch and the page draws without it.
2. **Fonts are self-hosted** (owner-approved; files supplied by the lead, copied from
   `scratchpad/fonts-dl/`). `public-v2/fonts/` holds 11 latin-subset woff2 files (Atkinson
   Hyperlegible Next 400/400i/500/600/700, Atkinson Hyperlegible Mono 400/500/700, Andika
   400/400i/700), `fonts.css` with the `@font-face` rules (`/fonts/<file>.woff2`,
   `font-display: swap`), and the three SIL OFL 1.1 licence texts (`OFL-*.txt`), which must ship
   with the fonts. Every page links `<link rel="stylesheet" href="/fonts/fonts.css">` before
   `/css/style.css`; there is **no** `fonts.googleapis.com` / `fonts.gstatic.com` reference left in
   any page, so those hosts can come out of the CSP at merge (`'self'` covers everything). The CSS
   uses only the supplied weights (400, 500, 600, 700; former 800 headings are 700). Note: the
   Next 400–700 files are one variable file served under four names (same checksum), likewise
   Mono; each face is pinned to its weight by the `@font-face` descriptor. (The vendored game
   `games/moto-x3m/motox3m4.min.js` mentions a Google Fonts URL; it was like that in `public/`
   and is not a page link.)
3. **Product name** lives in one place: `App.BRAND` and `App.brandMark()` in `js/app.js` (the header
   wordmark). Still hard-coded elsewhere, to sweep when the name is final: every `<title>`
   ("... | Polymath"), the landing page's `<title>`, meta description and footer line, and
   `css/style.css`'s header comment.
4. No server-side change is needed. The stored title formats (`lesson-(...)`,
   `Activity 3 of 9 (quiz/game): X - Y`) are untouched; they are cleaned only for display
   (`App.cleanTitle`, `App.levelParts`).

## Design system (css/style.css, rewritten)

- **Neutrals:** white `--page`, `--well`, hairlines `--line`/`--line-strong`, `--control` (input and
  choice outlines, 3.4:1 so they pass as UI boundaries), ink `--ink`, `--ink-2`, `--ink-3`.
  Dark: graphite `#121316`.
- **Colour means two things only.** Subject identity: `data-subject="<track id>"` sets `--hue` and
  `--subj`, `--subj-wash`, `--subj-line` (math cobalt, english plum, reading teal, iq violet, act
  slate, spanish saffron, chess graphite, piano ebony-indigo, basketball leather; hues avoid the
  green and red bands). Right/wrong: `--correct`, `--incorrect` (plus `--warn` only for a timer
  under two minutes). The old marigold brand, review blue, checkpoint plum and locked grey are
  retired; their token names remain as aliases to neutrals because inline styles in older JS use
  them (`--accent`, `--brand*`, `--review*`, `--checkpoint*`, `--warn-soft`, `--surface*`,
  `--border*`, `--text`, `--muted`, `--subtle`, `--success*`, `--danger*`).
- **One primary button per screen**, ink in light mode and light-on-graphite in dark. Subject colour
  never goes on a button. New `.btn-text` for secondary actions.
- **Type:** Atkinson Hyperlegible Next for everything, Atkinson Hyperlegible Mono (`--num`, tabular,
  slashed zero) for levels, counts, timers, scale labels; Andika for kids' reading text
  (`--read-font`). No serif, no uppercase labels, no italics for emphasis.
- **Shape:** radius 4/6/8/10, no shadows at rest (one elevation shadow for the fixed Next bar and
  the floating save bars), hairlines instead of boxes, no hover lifts.
- **Removed tells:** paper + serif + highlighter `<mark>`, tracked uppercase eyebrows (`.eyebrow`
  now a quiet sentence-case line and removed from markup), tinted icon tiles (`.track-icon`,
  `.stat-ic`, `.plan-ic`, `.empty-ic`, `.section-title > svg`, `.card-title > svg` hidden),
  pills (`.chip` is now a small square-cornered tag), soft-shadow cards, the stat strip of zeros,
  donuts (`.ring`), spring easing, pop/nudge/beacon animations, fade-up on page load, the ✦,
  coloured left-border callouts (`.notice::before`, `.held-item`, `.grade-option.selected`,
  `.passage`, `.lesson-example`, `.help-miss`), dot strings and `→` in labels, numbered 01–04
  steps, decorative leading icons in buttons (`.btn > svg:first-child` hidden unless the button
  has `.keep-icon`).
- **Motion:** only two. A mark draws itself (`.is-drawn .mark-path`, 240 ms) and the You marker
  slides in on a result (`.scale.is-arriving`, 420 ms). Both off under
  `prefers-reduced-motion: reduce` (marks appear at full length, markers jump). The spinner stays.
- Every class the old stylesheet defined is still defined (admin, editor, rubric, help,
  scorecard, curriculum, game lab depend on them). The old `.card[style*="text-align:center"]`
  result-screen hook now renders those screens left-aligned, without a card, in the 680px
  reading width.

### New components

- **The scale** (`App.scale({...})` in app.js, `.scale*` in CSS): a ruler with minor ticks,
  checkpoint shapes (diamond = Master, double diamond = Grand Master, flag = Graduation), a done
  line and a "You" marker in the subject colour, with a caption sentence (what a screen reader
  hears; the ruler itself is `aria-hidden`). Variants: compact (dashboard rows), threshold meter
  (`App.tmeter`), unit strip (`App.unitStrip`: circled = already yours, ticked = done, dashed =
  not checked yet, You), segmented progress (`.segments`, the player).
- **The marks** (`window.mark(name)` in icons.js): hand-drawn tick, cross, circle, underline,
  slash and dot as inline SVG paths with `pathLength="1"` so they can draw.
- **Subject symbol** (`App.symbol(track)`): a periodic-table tile ("Ma", "En", "Rd", ...) outlined
  in the subject colour, replacing the glyph-in-tinted-square.
- **Logo**: three ruler ticks of rising height on a baseline + the wordmark, ink only
  (`icons.js` `logo` redrawn the same way for anything still using `icon('logo')`).

## Files changed

### css/style.css
Rewritten (sections 1–27, listed at the top of the file). See above.

### fonts/ (new)
11 woff2 files, `fonts.css`, three OFL licence texts. See merge note 2.

### Every page's `<head>` (18 html files)
The Google Fonts preconnects and Figtree + Fraunces stylesheet replaced by
`/fonts/fonts.css`; `theme-color` metas to `#ffffff` / `#121316`; `<title>` separator `—` → `|`.

### index.html (landing, body rewritten; ids `#header`, `#how`, `#subjects`, `#tracks` kept)
No eyebrow, no highlighted word: H1 "Find your level. Then learn only what you're missing.", one
primary button ("Take the placement quiz") and a text link. The floating demo card + tilted path
sticker became a marked example (a real fractions item with the drawn tick and a Mathematics scale
placing you at level 10). The 01–04 steps and the three icon pillars became "Measured first, then
taught": the review intervals (days 1, 3, 8, 21, 35) drawn on the scale plus a four-item `<dl>`.
The nine identical subject cards became a catalogue table (`tbody#tracks`): symbol, name, blurb, a
grade strip in the subject colour, grade count. The dark CTA band became a plain closing section
with an outline button. Footer has real links (How placement works, Subjects, Sign in). P2 items
not done here: an interactive mini placement, OG image, favicon.

### login.html, register.html
Eyebrow removed; the card frame is gone (a plain left-aligned form, 400px). Ids unchanged.

### js/app.js
- Header: new wordmark (`brandMark()`), streak/XP shown as plain text only when above zero
  (no zero shown as an achievement), visitor CTA "Find your level" as an outline button (hidden
  under 420px; the landing hero has the primary). Ids `#theme-toggle`, `#logout`, `#tabbar` kept.
- New exports: `BRAND`, `brandMark`, `symbol`, `subjectId`, `gradeParts`, `gradeLabel`,
  `cleanTitle`, `levelParts`, `scale`, `checkpointTicks`, `tmeter`, `unitStrip`. Nothing removed.

### js/icons.js
`logo` redrawn as three ticks; new `window.mark(name)` (the marks). Nothing removed.

### js/landing.js
Renders the example's tick, the two scales, and the catalogue rows. Same `/api/catalog` call.

### js/dashboard.js
Led by the next action: the subject symbol and name, an H1 that says what is next ("Next: level
11, Play with Real Objects", "Next: find your level in English", "Next: the Master quiz at level
25"), the scale for that subject with its checkpoints, and the **only** primary button. Then every
subject as a row (`enrollmentCard`, kept name): symbol, name and grade (dash removed), its own
compact scale, and a text-button action; the unit plan line (`[data-plan]`, same fetch) and a
checkpoint note under it. Aside (8/4 grid from 1024px): due-for-review list, a row of drawn ticks
for the streak (only when there is one), the learning-style quiz as a text link, the tutor's
traits. Recent sessions: human values ("Mathematics", "Placement", "Today 09:44", "8 / 15",
right-aligned mono numbers). **The AI status line is gone for learners**; admins (`user.is_admin`)
see a one-line note in the aside. Removed: date eyebrow, "Welcome back", stat strip, donut,
"Lesson 10 of 393" pill, the run-on "To advance: ..." sentence, "Add a subject" floating top right
(now a text button under the list). Same ordering and the same action decisions as before.

### js/path.js
- Head: back link, subject symbol + H1 + grade line, a full-width scale (all checkpoints in the
  window, done ones filled, the Graduation flag), the current level named cleanly with its
  description, the primary action, and the advance rule as three threshold meters (average mastery
  vs 80%, weakest skill vs 60%, questions vs 12) instead of a sentence. "How the path is laid out"
  table removed (it is on the scale); its sentence and the grade blurb are a footnote.
- The unit plan card shows the **unit strip** (circled known units, dashed "not checked yet",
  You). Catch-up offer/accepted/done cards kept (icon tiles removed).
- **The path is grouped**: by plan unit where the grade has one, otherwise by lesson (a lesson
  and its practice; levels between units join the group before them). Each group is one heading
  line (level range in mono, title, a status line, a row of tiny ticks) with a toggle button
  (`.unit-toggle`, `aria-expanded`/`aria-controls`, same pattern as the folded-unit toggle); only
  the group holding the current level is open. Known/placed/skipped units stay folded with the
  existing `.unit-skip` toggle and "Review anyway" link, now with a circled mark and "Already
  yours" / "Skipped". Units not checked yet say "Not checked yet. Test out?" in their heading
  with the `data-testout` button (repeated under the heading on phones).
- Rows (`nodeRow`): the rail shows the level number (drawn tick when done; "You" and a 3px
  subject bar on the current row, which sits in a subject-wash band; a diamond for checkpoints).
  Titles are cleaned: `Activity 3 of 9 (quiz/game): Match Objects - Counting...` → "Match Objects,
  Pictures, and Numbers" + "Practice"; `Tester 7 of 9: ...` → "Entry check, part 7 of 9" +
  "Check"; `Summary: A + B` → "A, B" + "Summary". The description shows only on the current, next
  and checkpoint rows. "complete" and "locked" chips removed; the current row's button is no longer
  primary. All row actions keep their hrefs and `data-jump` behaviour.
- Test-out-one-unit player uses the focus-mode top bar (`#testout-stop` is now its close button).

### js/session.js
- `shell()`: focus-mode top bar (the site header and tab bar hide while it is on screen) with the
  close link, the cleaned title (`lesson-(...)` slug removed; "Level N" for practice; the
  checkpoint's name for exams), a one-line subtitle, the counter "4 / 13", and a **segmented
  progress bar** (`#segments`, green/red per answered question, outlined for now). `#bar` and
  `#pct` kept (`#bar` hidden, `#pct` visually hidden as "3 of 13 answered"). `data-subject` set on
  `#player`.
- Learner view drops the role label and metadata chips (`label` passed only with `?debug=1`).
  The "Finish whenever you like — ..." footer line is gone (exam and held-feedback notes stay).
- Lesson reading view: meta line instead of chips, cleaned H2, first section heading that repeated
  the slug becomes "The idea", no icons in headings, worked example in a well with no side border.
- Level close: a drawn tick when advanced. Held-feedback review: marks instead of icons.
- Recap: a small `<dl class="facts">` (right %, XP and days only when above zero, levels) instead
  of the four big-number stat blocks. The "Analyzed by the built-in rules (the AI tutor is off)"
  line no longer shows (system state); the AI note still shows when the AI did analyse.
- Copy: em dashes and middle dots in learner-facing strings replaced.

### js/player.js
- Label line: plain text; skill/difficulty/level chips only with `?debug=1`.
- Confidence: "How sure are you? (optional)" as a three-part segmented control (Sure / Think so /
  Guessing). Same `data-confidence`, `aria-pressed`.
- **Verdict by marks:** a drawn tick on the right answer, a cross on a wrong pick (in the key's
  place), rows get only a mark-coloured border; no filled panels, no "YOUR ANSWER"/"CORRECT"
  labels (the visually hidden `.choice-sr` notes still say it). Typed answers get the mark inside
  the box. The verdict is plain text: "Not quite. The answer is **5 bags**." (colour on the first
  words only), then the explanation at reading size.
- In the main player the Next button sits in a **fixed bottom bar** (CSS only: `#item > .verdict
  .verdict-actions:has([data-act="next"])`), with "Ask about this" and "Report a problem" as quiet
  text buttons. Focus still moves to Next; `App.announce` unchanged.

### js/placement.js
Question screen: focus-mode top bar (close, "English placement", grade, "Question 4", minutes left
in mono turning `--warn` under two), **no progress bar on the adaptive test** (`#bar` kept, hidden),
"Skip this question" → **"I don't know"** drawn as a quieter fifth answer row (same `#skip`,
same `submit('')`). Classic result: left-aligned "You start at level 10 of 393." with an arriving
scale, the primary button, "How you did by difficulty" as a dot matrix (ticked squares), "What to
work on first" as underlined items and "Already solid" as circled items, the style quiz as text
links. Unit result: left-aligned, an arriving scale at the start level, the plan as the unit strip
plus circled / underlined / plain lists, the quick-check and test-out offers as plain paragraphs
(no side-striped callout, no nested tinted box). Quick check and test-out players use the top bar.

### js/subject-placement.js
Question screens use the focus-mode top bar ("I don't know" row first, then the quiet controls;
"Quit and see recommendation" → "Stop and see my grade", same `#quitq`). Result: left-aligned,
a grade scale (one tick per grade, You at the recommended grade), grade names without dashes,
the fit list as a plain section. Gap-scan screen uses the top bar.

### js/onboarding.js, js/curriculum.js
Subject icon tile → `App.symbol(track)`. Onboarding copy: dot/dash joins replaced.

### js/help.js
Four learner-facing strings: em dashes and a middle dot replaced.

## Accessibility kept
Skip link, `App.announce` live region, focus recovery after redraws, labelled controls, the
folded-unit toggle button (unchanged markup and listener), choice `aria` notes. New toggles use
the same button + `aria-expanded` + `aria-controls` pattern. Scales and strips are `aria-hidden`
with a caption or visually hidden sentence carrying the same information. Hidden progress keeps
`#pct` as readable text. Focus rings are 2px ink. Touch targets ≥ 36px (choices 56px, 64px kids).

## Contrast (WCAG AA), computed from the OKLCH tokens
Light text on white: ink 17.9, ink-2 8.1, ink-3 5.4 (4.9 on the well). Dark: 16.0 / 9.7 / 6.0.
Correct 5.2 (4.8 on well), incorrect 5.8 (5.3), warn 5.0; dark 9.8 / 7.6 / 9.8. Every subject
colour ≥ 4.6:1 on white, the well and its own wash (lowest: reading teal 4.64 on its wash) and
≥ 7.9:1 in dark. Input/choice outline 3.4:1 (dark 4.0). Full table:
`scratchpad/v2/contrast-report.md`. Browsers gamut-map OKLCH slightly differently from the
checker's clip, so values can move by a few hundredths.

## Not done (P2 or out of scope)
- Landing: interactive mini placement, OG image, dark-aware favicon.
- Redrawn 20px icon set (the sprite is unchanged apart from `logo`; icons are hidden where they
  were decoration).
- Sticky unit header on the path; per-row expansion of a level's description.
- Keyboard "1–4" shortcuts for choices; the `⋯` menu on the Next bar (Ask/Report are text buttons
  on the bar instead); "Finish" in the top bar menu.
- Profile, onboarding, style quiz, survey, help, skip, curriculum, admin, base lesson, game lab
  are restyled through the CSS only (their markup still has some chips, cards and dash copy).
- Content data still contains dashes and the mismatched-metadata issue the report mentions
  (a Kindergarten level serving a "Division with remainders" item) — a content/server issue.
- The theme toggle and sign-out are not reachable while a player's focus mode is on (the close
  link leaves the player first).
