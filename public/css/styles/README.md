# Visual styles: tokens, components, shell

The app has several visual styles. A **style is a set of CSS custom properties**
(colours, fonts, radii, borders, the button "press" edge, the focus ring, bar and
tab-bar sizes). Components in `css/style.css` read **only** those tokens, so a new
style is one new file and touches no component.

```
public/js/style-boot.js      picks the style before first paint (head script)
public/css/styles/<id>.css   one token file per style (+ its @font-face)
public/css/style.css         components; :root holds the neutral baseline tokens
public/fonts/                self-hosted Latin woff2 files (CSP: font-src 'self')
```

| id | file | mode | notes |
|---|---|---|---|
| `chunky` | `chunky.css` | light | default for light mode; Nunito; 4px press edge |
| `night` | `night.css` | dark | default for dark mode; Inter + JetBrains Mono; hairlines, mint accent |
| `bento` | `bento.css` | light | Plus Jakarta Sans; pastel subject tints; dark ink pill button |
| `editorial`, `desk`, `notebook` | not written yet | light | registered in `style-boot.js` with `ready: false` |

## How a style is chosen

`<html data-style="chunky|night|bento|..." data-mode="light|dark" [data-theme="light|dark"]>`

* **Auto** (the default) is `chunky` in light mode and `night` in dark mode. Dark mode
  follows `prefers-color-scheme` and the sun/moon button in the header
  (`localStorage polymath.theme`).
* A **picked style** (`localStorage savant.style`, also saved to the account as
  `user.style_pref` through `POST /api/prefs {style}`) overrides Auto, and the style's
  own mode wins. While a style is picked the sun/moon button is hidden; pressing it
  in Auto mode flips chunky <-> night.
* `data-theme` is present only when the mode was forced (button or picked style); the
  older `:root[data-theme="dark"]` hook keeps working. A page that does **not** load
  `style-boot.js` (the sealed Spanish evidence pages) has no `data-style` and gets the
  neutral baseline in `style.css` (the pre-redesign graphite look).
* The CSS file is written into `<head>` with `document.write` by the (synchronous,
  external) boot script, so it blocks first paint: no flash. Only the active style's
  file, and so only its fonts, is requested. The CSP forbids inline script, which is
  why this is a file and not an inline snippet.

Every page needs, **before** the `css/style.css` link:

```html
<script src="/js/style-boot.js"></script>
```

JS API (`window.SavantStyle`, and `App.setStyle(pref)` which also saves to the server):
`state()`, `set('auto' | id)`, `setTheme('light'|'dark'|null)`, `ids()`, `STYLES`.
The Profile style picker should call `App.setStyle(id)` for each id in
`SavantStyle.ids()` plus `'auto'`, and show `SavantStyle.STYLES[id].label`.

## Adding a style

1. Copy `chunky.css` or `night.css` to `<id>.css`, change every token, add the `@font-face`
   for its fonts (woff2 into `public/fonts/`, Latin subset, `font-display: swap`).
   Selector must be `:root[data-style="<id>"]`.
2. In `js/style-boot.js` set `ready: true` on its `STYLES` entry (label, mode, chrome colour).
3. Add the id to `STYLE_IDS` in `routes/prefs.js` (already lists all six).
4. Screenshot `/dashboard` at 390x844 and 1440x900.

Never write a raw hex in a component. If a component needs something no token covers,
add a token with a baseline in `style.css` `:root` and a value in every style file.

## Tokens

Baselines for all of these are in `style.css` section 1; each style file overrides them.

**Surfaces and lines**: `--page` (app background), `--well` / `--well-2` (quiet fills, bar
tracks), `--card-bg`, `--card-line`, `--field-bg` (inputs), `--nav-bg` (tab bar, sidebar,
player head), `--line`, `--line-strong`, `--control` (outline of inputs, checkboxes; at
least 3:1).
**Ink**: `--ink`, `--ink-2` (secondary), `--ink-3` (captions; all at least 4.5:1 on `--page`).
**Action** (primary button, selected states, focus): `--action`, `--action-hover`,
`--action-edge` (the pressed bottom edge), `--on-action`, `--action-tint`, `--action-mid`,
`--action-ink` (text on the tint).
**Reward** (streak, review prompt, "up next", highlights): `--reward`, `--reward-edge`,
`--reward-tint`, `--reward-line`, `--on-reward`, `--reward-ink`, `--flame`, `--flame-core`.
**Marks**: `--correct`, `--correct-wash`, `--correct-edge`, `--incorrect`,
`--incorrect-wash`, `--incorrect-edge`, `--warn`. **Disabled primary**: `--off-bg`, `--off-ink`, `--off-edge`.
**Focus**: `--focus` (outline colour), `--focus-ring`, `--focus-ring-w`, `--field-focus`
(input border when focused).
**Type**: `--font`, `--display`, `--num` (numerals), `--read-font`; weights `--w-body`,
`--w-strong`, `--w-head`, `--w-btn`, `--w-label`; `--tracking-head`; sizes `--t-meta`, `--t-ui-s`,
`--t-ui`, `--t-read`, `--t-stem`, `--t-h3`, `--t-h2`, `--t-h1`, `--t-disp`; the small caps
label `--eyebrow-*`; icon stroke `--icon-sw`.
**Shape**: `--r-card`, `--r-btn`, `--r-input`, `--r-choice`, `--r-chip`, `--r-bar`, `--r-icon`
(icon tiles, answer-letter boxes), plus legacy `--r-xs..lg`.
**Borders**: `--bw-card`, `--bw-card-edge` (a card's bottom edge: 4px in chunky),
`--bw-control`, `--bw-nav`; buttons `--btn1-bw` / `--btn1-edge-w` (primary: side width,
bottom edge), `--btn2-bw` / `--btn2-edge-w` / `--btn2-bg` / `--btn2-line` / `--btn2-ink`
(secondary), `--press` (how far a pressed button sinks).
**Sizes**: `--btn-h`, `--btn-h-lg`, `--btn-h-sm`, `--btn-px`, `--btn-size(-lg)`, `--input-h`,
`--choice-h`, `--key-size`, `--key-bw`.
**Selected card**: `--sel-bg`, `--sel-line`, `--sel-edge`, `--sel-ink`, `--sel-key-bg`,
`--sel-key-ink`, `--sel-ring`, `--hl-line` (highlighted, not selected), `--choice-line`.
**Chips**: `--chip-bg/-ink/-line` (quiet), `--chip2-*` (loud `.chip-accent`).
**Bars**: `--bar-h`, `--bar-h-sm`, `--bar-bg`, `--bar-fill`, `--bar-fill-2`, `--bar-shine`.
**Shell**: `--side-w`, `--tab-h`, `--tab-pad`, `--tab-item-h/-r/-bw`, `--tab-on-bg/-ink/-line/-edge`,
`--brand-color/-size/-weight`, brand mark `--bm-tile`, `--bm-bars`, `--bm-hi`, `--bm-ring-display`, `--bm-bars-display`.
**Home panel**: `--hero-bg/-ink/-line/-edge`, `--ring-track`, `--ring-fill`, `--hero-pill-bg`, `--hero-diamond`.
**Subject tint** (bento only; optional, falls back to the card colours): `--subj-card-bg`,
`--subj-card-line`, `--subj-bar`, `--subj-bar-bg`, set per `[data-subject]`.
**Subject colour** (`--subj`, `--subj-wash`, `--subj-line`, from `data-subject` and `--hue`) is
independent of the style and is already light/dark aware through `data-mode`.

## Component classes to use

| Need | Class | Notes |
|---|---|---|
| Primary action | `.btn.btn-primary` (+ `.btn-lg`, `.btn-block`) | one per screen. `disabled` shows the "off" look |
| Secondary | `.btn` | outline; `.btn-sm` for compact |
| Reward button | `.btn.btn-reward` | yellow in chunky |
| Quiet buttons | `.btn-ghost`, `.btn-text`, `.btn-danger` | |
| Card | `.card` (+ `.card-hl`, `.card-reward`, `.card-flat`, `.card-tight`) | 4px edge in chunky |
| Selectable option | `.option-card` (+ `.selected`, `.opt-ic`, `.opt-body > .opt-title + .opt-sub`, `.opt-radio`) | onboarding style; works on `button`, `label`, `a` |
| Answer card | `.choice` (+ `.selected`, `.correct`, `.wrong`, `.key`) | player; keeps the hand-drawn marks |
| Inputs | `input`, `select`, `textarea`, `.field > span + input` | checkbox/radio use `accent-color: var(--action)` |
| Progress | `.meter > span` (+ `.meter-lg`, `.meter-success`, `.meter-warn`), `.segments > i` | width via `style="width:62%"` |
| Tags | `.chip`, `.chip-accent`, `.chip-success`, `.chip-danger`, `.chip-btn.selected` | |
| Notices | `.notice`, `.notice-error`, `.notice-success`, `.notice-warn` | |
| Toasts, sheets | `App.toast(msg, 'error')`, `.modal-backdrop > .modal` | sheets are bottom-anchored at 560px and below |
| Section title | `.sec-head > h2 + span` | title with a right-hand note |
| Sticky action bar | `.sticky-foot` | sits above the phone tab bar |
| Type | `h1`..`h4`, `.muted`, `.small`, `.tiny`, `.num`, `.eyebrow` | |

Home-screen classes (`js/dashboard.js`): `.home`, `.home-hello`, `.home-hero`, `.home-plan`,
`.plan-next`, `.plan-later-row`, `.home-review > .review-card`, `.home-subjects > .subject-cards >
.subject-card`, `.home-aside`.

## Shell and breakpoints

`App.header(user, active)` (in `js/app.js`) draws one `header.site-header` and the `#tabbar`.
Signed-in pages get `body.has-tabbar`.

| Width | Layout |
|---|---|
| signed out | top bar at every width |
| <= 640 (phone) | slim top bar (brand, streak, actions) + fixed bottom tab bar: Home, Learn, Review, Profile |
| 641-1024 (tablet) | same tab bar; `.wrap` is centred, max 720px |
| > 1024 (desktop) | header becomes a fixed left sidebar (`--side-w`): the four destinations, a "More" group (Add a subject, Calendar, Curriculum, Game lab, Admin), streak/XP, appearance toggle, Sign out. `body` is padded left by `--side-w`; `.wrap` max 1100px. Home goes two-column |

Inside a question player (`.player .player-head`) the sidebar, top bar and tab bar step away.
Tab targets: Home `/dashboard`; Learn `/path?enrollment=<lead>` (else `/onboarding`); Review
`/review?enrollment=<lead>` (else `/calendar`); Profile `/profile`. `<lead>` is the subject the
dashboard last led with (`App.setLead(id)`, `localStorage savant.lead`). Pages that pass
`'dashboard'` to `App.header` are mapped to the Learn or Review tab by their path.

Other breakpoints already in `style.css`: 560 (compact buttons, bottom sheets), 480/420
(player head, review card), 720 (smaller padding), 760 (header spacing), 900 (landing hero).
No horizontal scroll at 360px; every tab/nav target is at least 44px.

## Notes for the other style authors

* Do not restyle `.btn`, `.card`, `.choice` etc. in a page stylesheet; change tokens.
* A custom property cannot be a `display` keyword list, so a few "on/off" switches are
  tokens holding `inline` / `none` (`--bm-ring-display`). Follow `night.css` for the pattern.
* Fonts are self-hosted, not loaded from Google, because the CSP says `font-src 'self'` and
  the app promises no third-party requests. Download the Latin-subset woff2 from
  fonts.googleapis.com (`css2?family=...&display=swap`, with a modern User-Agent) and keep
  the `unicode-range`.
* Pages in `public/spanish/` have their own CSS and do not load `style-boot.js` yet.
* `public/spanish-check.html` and `public/spanish-listening.html` are sealed: they do not load
  the boot script and render with the neutral baseline.
