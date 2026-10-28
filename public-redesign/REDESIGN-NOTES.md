# Redesign notes ("ink and highlighter")

Base: `scratchpad/public-base` (copy of `public/` taken 2026-10-22 08:10). Everything below is a diff
against that base. No API calls, element ids, data flow or function names were changed; JS edits are
markup-only except the two small additions listed (theme/audience hooks + tab bar in app.js,
`scrollIntoView` in player.js).

## Design direction
Warm paper background, near-black ink, and one marigold "highlighter" colour that means *you and your
progress* (progress bars, current level, streak, brand mark). Every other colour carries meaning:
correct (green), incorrect (brick red), review (sea blue), checkpoint (plum), warn (amber-brown),
locked (warm grey). Headings in **Fraunces** (soft serif, the textbook voice); UI and reading text in
**Figtree**. Primary buttons are ink in light mode and marigold in dark mode.

## MERGE MUST-DO: the CSP blocks the fonts
`middleware/security.js` allows only `'self'` for styles and fonts, so on the real server the Google
Fonts stylesheet is blocked and the page falls back to Georgia/Palatino + Segoe UI/system-ui (still
usable, just not the intended type). To get the intended look add:

    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
    font-src  'self' https://fonts.gstatic.com

(or self-host Fraunces + Figtree woff2 under `public/fonts/` and swap the `<link>` for `@font-face`).
The preview front server sends exactly that amended policy.

## Files changed

### css/style.css — rewritten
Whole design system. Every class used by the old file is still defined (the JS of all pages, incl.
admin, editor, rubric, help, scorecard, feedback, coach, curriculum, game-lab, depends on them).
Sections: tokens · base · layout · header + tab bar · buttons · forms · cards/notices/chips ·
progress (meter, `.ring`, stat strip) · onboarding · player · coach · lessons · path · dashboard ·
results · tables · style quiz · landing + auth · toast/modal/empty/loading · essay/editor/rubric ·
help · scorecard · admin · kids variant · motion.
Old token names (`--accent`, `--accent-ink`, `--accent-soft`, `--success*`, `--danger*`, `--warn*`)
are kept as aliases because JS writes them into inline styles.
New classes used by the new markup: `.tabbar`, `.icon-btn`, `.header-actions`, `.btn-label`,
`.stat-pill.is-streak/.is-xp`, `.eyebrow`, `.ring`, `.ring-lg`, `.ring-success`, `.ring-value`,
`.stat-strip`, `.stat-ic`, `.stat-text`, `.enroll-card`, `.is-next`, `.track-name`, `.grade-name`,
`.enroll-progress`, `.enroll-actions`, `.dash-head`, `.ai-status`, `.path-hero`, `.hero-*`,
`.track-heading`, `.player-head`, `.player-close`, `.player-titles`, `.player-chips`, `.chip-review`,
`.chip-checkpoint`, `.empty-state`, `.empty-ic`, `.modal-backdrop`, `.modal`, `.modal-actions` (ready,
not used yet), `.track-body`, landing (`.demo*`, `.landing-section`, `.section-head`, `.steps`,
`.step`, `.pillars`, `.pillar`, `.cta-band`, `.site-footer`, `.hero-cta`, `.hero-note`), auth
(`.auth`, `.auth-card`, `.auth-sub`, `.auth-switch`, `.field-hint`).
Several rules target existing markup by attribute so the JS did not have to change — keep them in
mind if the other agents change these inline styles:
`.card[style*="text-align:center"]` (every result screen: placement, subject placement, checks),
`.card[style*="position:sticky"]` and `#footer-bar` (the floating save/continue bars; they get
`bottom` above the tab bar on phones), `.card > .row-between:first-child:has(> .stat-block)`
(session recap stats), `:has(> .verdict-…) > .answer-row` (answered type-in state).

### Every page *.html (admin, base-lesson, curriculum, dashboard, game-lab, help, index, login,
onboarding, path, placement, profile, register, session, skip, style-quiz, subject-placement, survey)
Head only: added `color-scheme` + two `theme-color` metas, Google Fonts preconnects and stylesheet,
before the existing `/css/style.css` link. Nothing in `<body>` changed except:
- **index.html** — body rewritten: left-aligned hero with a highlighted headline, a live-looking
  question card + mini path as the product visual (aria-hidden), numbered "How it works" steps,
  three pillars, the subjects grid (`#tracks` kept), a CTA band and a footer. Ids `#how`,
  `#subjects`, `#tracks` kept. Copy is the old copy, trimmed.
- **login.html / register.html** — `<main class="auth">` with a single `.auth-card`; ids `#error`,
  `#form`, `#email`, `#password`, `#display_name`, `#submit` unchanged; `role="alert"` on `#error`.

### js/app.js
- New (before `header`): theme hooks. `data-theme` on `<html>` from localStorage `polymath.theme`;
  `data-audience="kids"` from `user.audience` (not sent by the server yet) or `?audience=kids` /
  `?audience=adult` (remembered in localStorage `polymath.audience`). Helpers `store`, `stored`,
  `applyTheme`, `currentTheme`, `applyAudience`; constants `THEME_KEY`, `AUDIENCE_KEY`, `TAB_ICON`,
  `TAB_LABEL`. All storage access is try/catch.
- `header()`: same nav list and logic. Markup: nav gets `aria-label`/`aria-current` and class
  `has-tabbar` when signed in; stat pills get `is-streak`/`is-xp` and visually-hidden labels; new
  `#theme-toggle` icon button; `#logout` keeps its id (label wrapped in `.btn-label`, hidden on
  phones). New: a `<nav id="tabbar" class="tabbar">` appended to `<body>` for signed-in pages (first
  five nav entries, phone only via CSS) and `body.has-tabbar`; theme-toggle click handler.
- `window.App` export unchanged.

### js/icons.js
Added three glyphs to `PATHS`: `home`, `sun`, `moon`. Nothing else.

### js/dashboard.js
Markup only; data, ordering, links and actions identical.
- Empty state → `.card.empty-state` with an icon.
- `enrollmentCard(e)` → `enrollmentCard(e, i)`; the first card (`i === 0`, i.e. the top of the
  existing priority order) gets `.is-next` and an "Up next" eyebrow. Progress shown as a `.ring` +
  text instead of a bar; checkpoint chip uses `.chip-checkpoint`; "View path" became a ghost button
  with an icon.
- Header: `.dash-head` with today's date eyebrow, the AI status line as `.ai-status` (green dot when
  on). The three stat cards became one `.stat-strip`.
- Map call: `ordered.map((e, i) => enrollmentCard(e, i))`.
- Due-for-review chips use `chip-review` instead of `chip-warn` (danger kept for < 50%).

### js/path.js
Markup only, in the `root.innerHTML` header block:
- Title row → `.track-heading` with `<h1>`; back link label wrapped in `.btn-label`.
- The stats card ("Level N / Mastery / Track XP" + meter) → `.card.path-hero`: mastery `.ring`,
  "You are on Level N · <kind name>" (`App.levelName(delivered)`), a meta line (mastery, track XP,
  levels to graduation = `pathEnd - current_level`, both already computed in the file), then the
  same blockers line, the same `action` and the same `#skip-level` block.
Node rows (`nodeRow`), the skip card, skills table, layout table and both listeners are unchanged.

### js/session.js
`shell()` only: the top row gets class `player-head`; added a close link
`<a class="icon-btn player-close" href="/path?enrollment=${enrollmentId}">` before the titles
(the tab bar is hidden inside players, so this is the way out on a phone); titles wrapped in
`.player-titles`, chips row gets `.player-chips`. Ids `title`, `subtitle`, `covered`, `counter`,
`bar`, `pct`, `item`, `hint-line`, `level-actions-inline` unchanged.

### js/player.js
`reveal()`: after `host.appendChild(box)`, the verdict is scrolled into view
(`scrollIntoView({block:'nearest'})`, instant under prefers-reduced-motion). Nothing else.

### js/landing.js
Track cards show the first 5 grade chips plus a "+N more" chip (math has ~50 grades); "N levels
available" now reads "N grades" (the product's word). Wrapper class `.track-body` instead of an
inline padding style.

### Not changed
All other JS (placement, subject-placement, skip, help, base-lesson, block-level, feedback, editor,
level-capture, assist-chat, curriculum, profile, onboarding, style-quiz, survey, admin, auth) — they
are restyled through CSS only. `spanish/`, `games/`, `engine/`, `base-lesson-scripts/` untouched.

## Bug noticed (not fixed — logic, not design; present in public/ too)
`js/session.js` `renderLevelClose()` uses `checkpointKinds`, which is not defined anywhere, so the
level-close screen throws a ReferenceError after a non-exam block. Probably meant
`App.isCheckpointLevel(nextKind)`.

## Preview
`scratchpad/redesign/front.js` (port 6800, serves this folder, proxies the rest to the backend) +
`backend.js` (port 6801, `db.redesign.json`, model keys blanked). Launch entry `redesign-preview` in
the repo's `.claude/launch.json`. Use `http://127.0.0.1:6800` rather than `localhost`: cookies are
shared across ports on one host name, so another app on `localhost:67xx` signs you out.
