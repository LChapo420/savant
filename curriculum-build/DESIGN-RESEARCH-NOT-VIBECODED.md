# Making Polymath look made, not generated

Research and plan, 2026-10-22. Scope: why the "ink and highlighter" redesign (see `REDESIGN-NOTES.md`)
still reads as AI-generated, and a buildable plan (plain HTML/CSS/JS) to fix it. No app code was changed.
Screenshots reviewed: `scratchpad/redesign/shots/*` (landing, dashboard, path, session, kids, result),
`scratchpad/qa4-shots/*` (placement question and result, gap result), `scratchpad/qa2-shots/*`.

---

## 0. The short version

1. **The current look is now the best-known AI house style.** In mid-2026 critics named a specific
   "Claude aesthetic": cream/beige background, near-black ink, one warm accent, a big serif headline
   with a word italicised or *highlighted*, and tracked-out uppercase subheadings (Kyle Chayka, *The
   New Yorker*; Pixel Envy; IBTimes; Generative Labs). Anthropic's own `frontend-design` skill lists
   "warm cream background with a terracotta accent", "accenting one word in a headline", "tracked-out
   eyebrow labels", "middle-dot meta strings", "→ appended to links", "01/02/03 markers", "identical
   rounded cards, one radius, same soft shadow" and "big number + small label stats" as AI defaults.
   Polymath's redesign uses **almost every item on that list**: paper `#f8f5ef` + Fraunces + a
   marigold highlighter under "actually are." + "AN ADAPTIVE TUTOR" eyebrows + `Level 10 · Lesson`
   + `Next question →` + `01 02 03 04` steps + 20px rounded cards everywhere + a 0 / 0 / 1 stat strip.
   Moving from purple to beige moved it from the 2024 tell to the 2026 tell.
2. **The bigger problem is not the palette.** Anthropic's guidance says that banning one default
   ("don't use cream") just makes the model pick another fixed palette. What makes a product look made
   is a **point of view drawn from its own subject**, a **signature device that carries real data**,
   **real content** in place of decoration, and **craft in the small details**. Polymath has a strong
   and unusual subject (it measures you precisely and puts you on a 393-level road), but nothing on
   screen looks like that. Right now it is a template filled in with that data.
3. **Proposed direction, in one sentence:** *Polymath measures exactly where you are and marks your work
   the way a good teacher does: every screen shows a real scale with you on it, hand-drawn marks for
   what you did, and nothing that is not about your learning.* In practice that means a white and
   graphite base (no paper, no serif), the **Atkinson Hyperlegible Next + Mono** superfamily (a
   legibility typeface, which suits a learning app), **colour that belongs to the subject** in place of
   a brand accent, one repeated primitive (**the scale**: a ruler with ticks, thresholds and a "you"
   marker), and one illustration system (**the marks**: a hand-drawn tick, cross, circle and
   underline).

---

## Part 1: Research

### 1.1 The tells of AI-generated / vibe-coded UI (2025–2026)

Grouped. The source for each claim is in brackets (the full list is in §5).

**Typography**
- Inter everywhere, or the "safe" alternates that became defaults themselves: Geist, Space Grotesk,
  Instrument Serif [Blode; DevelopersDigest; Impeccable].
- A single serif-italic or *highlighted* accent word in the hero headline [DevelopersDigest #3;
  Anthropic skill; Chayka/New Yorker].
- An oversized serif display headline. "Italic serif display headline" and "Oversized hero headline"
  are both detector rules in Impeccable's catalogue of 67 slop patterns [Impeccable].
- **Eyebrows**: a small tracked-out uppercase label above every heading ("HOW IT WORKS"). Also a badge
  or pill above the H1 [Anthropic skill; DevelopersDigest #10, #16; VibeMole; Impeccable "Label above
  a heading"].
- A flat hierarchy where headings, labels and body text all look about the same [VibeMole; The Crit;
  Impeccable].
- Em-dash overuse and middle-dot meta strings ("Level 10 · Lesson") [Impeccable "Em-dash overuse";
  Anthropic skill].

**Colour**
- 2023–25: indigo/violet ("VibeCode Purple"), purple-to-blue gradients, gradient text, neon glows,
  dark mode with grey body text [DEV "AI purple problem"; DevelopersDigest #4–8; Differ].
- 2026: **cream/beige + near-black + one warm accent (rust/terracotta/orange)**, which critics now
  call "Claudian sameness" [Chayka/New Yorker via Pixel Envy; IBTimes; Generative Labs; Kompozy;
  Impeccable "Cream/beige palette"; Anthropic skill]. Deonna's piece puts the move plainly: once people
  could spot purple, the models moved to beige, oversized italic serifs and tiny numbered labels.
- A muted white-and-grey palette with one accent, rounded corners and soft drop shadows. Business
  Insider describes this as the generic vibe-coded look [Business Insider via Smart Company].

**Layout and components**
- Hero, then three icon-topped feature cards, then a grid of identical cards, then a dark CTA band, then
  a footer. Same-weight cards and nothing dominant [VibeMole; DevelopersDigest #12; Impeccable
  "Identical card grids"].
- Numbered step sequences "01 / 02 / 03" used even when the content is not a real sequence
  [DevelopersDigest #13; Anthropic skill; Impeccable "Tiny numbered section labels"].
- Stat banner rows, and the "big number, small label" hero metric [DevelopersDigest #14; Anthropic
  skill; Impeccable "Hero metric layout"].
- A coloured top or left border on cards ("side-tab accent"). DevelopersDigest calls it "the most
  specific tell" [DevelopersDigest #11; VibeMole; Impeccable].
- Cards inside cards, icon tiles stacked above or beside headings, glassmorphism [VibeMole;
  Impeccable "Nested cards", "Icon tile stacked above heading"].
- One border radius and one soft shadow on everything. Uniform padding everywhere. Everything centred
  [Anthropic skill; The Crit; Differ; Impeccable "Monotonous spacing"].
- Pill badges and status chips sprinkled everywhere until nobody reads them [VibeMole; Deonna].

**Icons and imagery**
- Stock Lucide/Heroicons at 16px with 2px round strokes. Blode calls 16px Lucide "too light to carry
  a polished product" [Blode; The Crit].
- Emoji as icons; the ✨ sparkle as the "AI" signifier [DevelopersDigest #15; Kompozy].
- Placeholder or fake evidence: invented dashboards, testimonials, "trusted by" logos, faked product
  cards [VibeMole].

**Motion and copy**
- Hover-lift on every card, fade-up on every section, pulsing dots, bounce/elastic easing [Anthropic
  skill; Differ; Impeccable "Bounce or elastic easing"].
- Generic copy ("Effortless. Seamless. Powerful."), "Get started" CTAs, templated H2 shapes, and copy
  that never shows the actual workflow [VibeMole; Impeccable "Generic marketing claims"].
- Missing last-10% work: generic favicon, no OG image, no real hover/active/focus states, no
  designed empty or error states [Blode; Differ; Vercel guidelines].

**Why it happens.** Models return the statistical centre of their training data. Anthropic calls this
"distributional convergence" and says its design model has "a consistent default house style"
[Techarion; Generative Labs]. Banning one tell swaps in another fixed default [Generative Labs;
Kompozy]. The fix that keeps coming up is to write your taste down as concrete tokens and rules, and to
ground the design in the product's own subject [Anthropic skill; DevelopersDigest; MindStudio].

### 1.2 What makes a product look hand-made

Synthesised from the sources above plus Refactoring UI, Vercel's interface guidelines and the case
studies in §1.3:

1. **A point of view from the subject, not from a trend.** Anthropic's own skill puts it first: start
   from the industry, audience, materials and vernacular, then open with the most characteristic
   element of that world.
2. **Spend boldness in one place.** One signature device, repeated on purpose, with everything else
   quiet [Anthropic skill; DevelopersDigest: "one layout primitive repeated deliberately"].
3. **Structure carries information.** Rules, borders, labels and colour each mean something. A
   coloured border that means nothing is the tell [Anthropic skill; Khan Academy colour system].
4. **Typography craft.** One or two typefaces chosen for a reason, a real scale, 60–80 character
   measures, tabular numerals for anything compared, curly quotes, real ellipses, non-breaking spaces,
   no widows [Vercel; Differ; Anthropic skill].
5. **Rhythm, not uniform spacing.** Tight for related items, medium between groups, generous between
   sections [The Crit; Refactoring UI].
6. **Density that fits the task.** Linear's redesign was explicitly about raising the hierarchy and
   density of navigation [Linear]. A learner looking at 393 levels needs structure and compression,
   not 393 identical rows.
7. **Hierarchy by contrast.** Not everything is important. Make primary text large *or* bold *or*
   dark, not all three, and de-emphasise labels or drop them [Refactoring UI summaries].
8. **Real content and real product, not placeholders.** Show the workflow with real items [VibeMole;
   DEV image layer].
9. **Your own assets.** A custom typeface or illustration grammar (Duolingo's Feather Bold and rounded
   primitives; Brilliant's PIX line style) is what makes a screen recognisable without its logo.
10. **Motion with a purpose.** 150–300ms, ease-out, transform and opacity only, tied to cause and
    effect, reduced-motion respected, no `transition: all` [Blode; Vercel; Differ].
11. **Every state designed:** empty, sparse, dense, error, loading [Vercel; Differ].
12. **Optical details.** ±1px nudges where geometry and perception disagree, icon/text lockups
    balanced, icon-side padding reduced [Vercel; Jakub Krehel; Pixso].

### 1.3 How respected products get their character (described, not to be copied)

- **Duolingo.** Its 2019 rebrand (Johnson Banks with Fontsmith) avoided the generic tech sans and
  built a typeface, **Feather Bold**, from the mascot's feathers. It came with a narrower core palette,
  a tone of voice and illustration rules [Creative Review; Creative Bloq]. The illustration guide
  builds everything from three rounded primitives (rounded rectangle, circle, rounded triangle), uses
  "the fewest shapes possible", flat perspective, and pill-shaped shadows instead of ovals [Duolingo
  design guidelines]. **Lesson:** character comes from a *grammar* of shapes and type that is derived
  from the product's own identity and then applied without exception. The 2022 single-path home was
  argued from learning science: guidance, mixing and spaced review built into the path [Duolingo blog].
- **Brilliant.** Visual-first interactive lessons ("no walls of text"), a line-based illustration
  style (PIX), learning paths **colour-coded by topic**, and motion (built in Rive) on path nodes and
  streak counters that fires *on the learner's action* [Rive case study; ScreensDesign; Koto refresh
  as summarised]. **Lesson:** colour as topic identity, and animation tied to what the learner did.
- **Khan Academy.** In its 2025 colour rebuild, colour is named by *purpose*, not hue. The main action
  colour is called **"Instructive"** (not "brand"), and Success, Warning and Critical are reserved so
  students "read status at a glance". Contrast pairs were tested before the palette was finalised
  [Khan Academy blog]. **Lesson:** fewer meanings, kept strictly.
- **Linear.** Themes are generated from three inputs (base, accent, contrast) in **LCH** so equal
  lightness looks equally bright. Labels, icons and buttons are aligned on both axes, and the 2024
  redesign aimed to "reduce visual noise" while raising density [Linear blog]. **Lesson:** perceptual
  colour maths, alignment discipline, density.
- **Things 3.** Mostly white space, colour "used sparingly and deliberately", bold type for areas and
  lighter type for projects, and motion that explains: a tapped task lifts into a card while the list
  recedes [MacStories]. **Lesson:** restraint, with motion that shows structure.
- **Arc.** Started from the complaint that browsers are "gray, drab rectangles". Its character came
  from atmosphere (a lit frame around the window) and a human voice in weekly release notes [Inverse;
  Behind the Craft]. **Lesson:** one memorable atmospheric decision, plus a voice.
- **Stripe docs.** One typeface family (Söhne) plus one mono for code; prose left, *real runnable*
  code right; ordered in the sequence a developer asks questions [Moesif teardown; Font Alternatives].
  **Lesson:** real artefacts instead of illustrations, and an order that follows the user's questions.
- **Readwise Reader.** The reading surface is almost empty (no sidebars, chrome on demand), and the
  highlight colours are chosen to feel like physical markers [Blake Crosley analysis].
  **Lesson:** the reading view should get out of the way, and any colour should map to a real object.

---

## Part 2: Critique of the current design

### 2.1 Global tells (all screens)

| # | Element (where) | Why it reads as generated |
|---|---|---|
| G1 | Paper `#f8f5ef` background, near-black ink, one warm accent (marigold `#f2b441`) | This is the 2026 "Claude aesthetic", swapping rust for marigold [Chayka; Anthropic skill; Impeccable]. |
| G2 | **Fraunces** soft serif for every heading, Figtree for UI | A big soft serif over a geometric sans is the current editorial default. Figtree is one more friendly geometric sans in the Inter/Geist/DM Sans family. Neither has a reason specific to learning. |
| G3 | The marigold `<mark>` under "actually are." (landing H1) | The textbook "accent one word in the headline" tell, highlighted the way Chayka describes. |
| G4 | Tracked uppercase eyebrows: "AN ADAPTIVE TUTOR", "HOW IT WORKS", "THURSDAY, OCTOBER 22", "UP NEXT", "YOU ARE ON", "CHECK", "FOCUS", table heads | Named three times over [Anthropic skill; DevelopersDigest #16; Impeccable]. There are about six per screen, so they stop meaning anything. |
| G5 | Middle-dot meta and em-dash titles: `Level 10 · Lesson`, `Mathematics · Numbers to 10`, `Level 10 — Lesson: …`, `Numbers to 10 — Kindergarten, first half`, "Before you answer — how sure are you?" | Named tells [Impeccable "Em-dash overuse"; Anthropic skill "middle-dot meta strings"]. Some screens have four em dashes. |
| G6 | `→` on buttons and links ("Next question →") | Named tell [Anthropic skill]. |
| G7 | One radius family (14–20px) and one soft shadow on every card; everything is a white card on paper | "Identical rounded cards, one radius, same soft shadow" [Anthropic skill]; "Extreme border-radius on cards" [Impeccable]. |
| G8 | Lucide-style 24-grid, 2px round-stroke icons in **tinted rounded tiles** (stat icons, section-heading icons, subject Σ tile, landing pillars) | "Icon tile stacked above/beside heading" [Impeccable; DevelopersDigest #12]; stock Lucide look [Blode]. |
| G9 | **The logo is a stock "layers" glyph in a yellow rounded square** (`icons.js` `logo`) | The most generic brand mark possible. It also renders as a bevelled app-icon tile. |
| G10 | Chips and pills everywhere: "Lesson 10 of 393", "1 of 3", "Question 1", "FOCUS · Division with remainders · difficulty 3 · level 10", unit chips, grade chips | "Over-badged" UI; "pill badges until visitors stop reading them" [VibeMole; Deonna]. |
| G11 | Coloured left border on callouts (lesson worked example, placement "Quick check" box) | "Side-tab accent border" is the most specific tell [DevelopersDigest #11; Impeccable]. |
| G12 | Cards inside cards (placement result: a tinted box inside a white card inside the page; dashboard "Up next" card inside a section with an icon tile) | "Nested cards" [VibeMole; Impeccable]. |
| G13 | `--ease-spring: cubic-bezier(0.34, 1.4, …)`, hover-lift `translateY(-1px)` + shadow on `.card-link` | "Bounce or elastic easing" and "hover transitions on every card" [Impeccable; Anthropic skill]. |
| G14 | ✦ sparkle after "Correct" (kids) | The sparkle is *the* AI signifier [Kompozy]. |
| G15 | Seven semantic colours (brand, correct, incorrect, review, checkpoint, warn, locked) plus a tint for each | More colours than meanings a learner can hold. Khan Academy reserves fewer and keeps them strictly. |

### 2.2 Content tells (these hurt more than any styling)

Generated-looking *data* makes the UI look generated, whatever the CSS does.

- **Slug leak:** the lesson H1 reads `lesson-(Counting Collections to 10 with Confidence)`, and so
  does its first H2 (session-d-lesson.png).
- **Redundant generated titles on the path:** "Level 13 — Activity: Activity 3 of 9 (quiz/game): Match
  Objects, Pictures, and Numbers - Counting Collections to 10 with Confidence". The level number,
  kind, index and unit name are all repeated in every row. "Tester: Tester 7 of 9: Entry Check, Part 7
  of 9" is worse.
- **Mismatched metadata:** a Kindergarten "Counting collections to 10" lesson shows a question tagged
  "FOCUS: Division with remainders, difficulty 3" about bakers and bags (session-m-wrong.png).
- **System status shown to a learner:** "Running on the built-in question bank. Everything works; the
  AI coach and AI analysis are off." (dashboard).
- **Zero-state stats presented as achievements:** 0 DAY STREAK / 0 TOTAL XP / 1 SUBJECTS, a 0% donut,
  and "0 of 12 questions answered" all on one card.
- **"Welcome back, UI Tester"** with a date eyebrow: the generic dashboard opener.
- **Run-on rule text:** "To advance: average mastery 0% of 80%; weakest skill at 0%, needs 60%; 0 of
  12 questions answered at this level". This is a checklist written as a sentence.
- Raw values: "math", "placement" in the recent-sessions table; "difficulty\n1" and "5 of\n5"
  wrapping in the placement result table.

### 2.3 Screen by screen

**Landing (landing-d-final.png, landing-d-full.png).** The structure is the template almost exactly:
eyebrow → two-line serif H1 with a highlighted phrase → grey lede → black primary button plus outline
secondary → small reassurance line → **floating product card on the right with a second card tilted
and overlapping it** (the "sticker" trope) → "HOW IT WORKS" eyebrow → 4 numbered steps with heavy top
rules (the full-page capture even shows `1. 01` double numbering) → **three icon pillars in a bordered
row** → a grid of 9 identical subject cards, each with a tinted icon tile and 5 grey pills plus "+44
more" → dark rounded CTA band → one-line footer. Every block is generic. Nothing on the page is
specific to *measuring* a learner except the copy. The demo question ("3/5 or 2/3?") is fine, but it
is a static picture of a quiz, which is what every quiz app shows.

**Dashboard (dash-d-light.png, dash-d-dark.png).** Date eyebrow + "Welcome back" serif H1 + a system
status line + an outline "Add a subject" button floating right (misaligned with the H1 baseline) → a
3-up stat strip of zeros with tinted icon tiles → "Your subjects" with an icon tile → an "UP NEXT" card
with a 1px ink border and shadow, a Σ tile, a serif title, a "Lesson 10 of 393" pill, a 0% donut, three
lines of grey text and two buttons → "Tune how you are taught" (icon tile + card + black button) →
"Recent sessions" (icon tile + card + table). That makes **three black primary buttons on one screen**,
four icon tiles, and five bordered containers. The one thing the learner came for (start level 10)
carries about the same weight as the learning-style quiz.

**Path (path-d-top.png, path-d-nodes.png).** The top is a hero card with a donut + "YOU ARE ON"
eyebrow + "Level 10 · Lesson" + meta line + the run-on rule sentence + a black button. Below it are two
equal cards: a skills table with one row, and "How the path is laid out" as a 4-row table. Then **393
near-identical rows**: a 44px circle badge, a two-line title, a two-line truncated description, and
"Revisit" + "✓ complete" or "🔒 locked" on the right, repeated hundreds of times. The current level
breaks out as a bordered, shadowed card with a serif title. There is no grouping by unit or grade, no
sense of distance, and checkpoints are hard to see. This is the screen where Polymath's real idea
(you are at 10 of 393, the next Master quiz is at 31) should be most visible, and it is the least
designed.

**Lesson / question player (session-m-wrong.png, kids-m.png, session-d-lesson.png).** The global
app header stays on top (logo, streak, theme, sign-out) above a second player header (× + serif title
+ "1 of 3" pill + subtitle), then a 0% bar with a percent label, then a white card with the FOCUS
eyebrow and three metadata pills, then the stem, the confidence pills, and four choice rows with boxed
A/B/C/D keys and a 2px "pressable" bottom shadow. After answering, the chosen and correct rows go
solid red and solid green with "YOUR ANSWER" / "CORRECT" tracked labels, **and** a red- or
green-flooded verdict panel opens with a serif "Not quite", the answer, the explanation, a black
"Next question →" button, and two ghost links, all inside the card. Colour is used three times for one
fact. The kids variant adds a four-colour rainbow of key tiles (decorative colour with no meaning) and
the ✦. The lesson reading view uses a serif slug as H1, orange dash bullets before H2s, and a code
block with an orange left border for "? + 11 = 17".

**Placement (09-place-q-375.jpg, 10-place-result-1280.jpg, result-d.png).** The question screen
is decent. Its problems are the three-line subtitle in the header and a progress bar that cannot mean
anything on an adaptive test. The result screens are **centred**: a pill eyebrow, a large serif H1,
grey centred text, and a centred black button. Two equal cards sit below (bar table plus chip groups).
The English gap result nests a tinted box of coloured chips inside a card, then a side-bordered callout,
then a centred button. The data here is the most interesting in the app (you skip unit 5, learn from
unit 6, and units 1–4 are unchecked), and it is shown as three groups of pills.

---

## Part 3: The plan

### 3.1 Direction

> **Measured and marked.** Polymath measures exactly where you are and marks your work the way a good
> teacher does: every screen shows a real scale with you on it, hand-drawn marks for what you did, and
> nothing that is not about your learning.

Why this direction and not another palette: it comes from what the product actually does (placement,
393 levels, mastery thresholds, checkpoints at 25/100/graduation, review intervals) and from the
learning world's own material (rulers, the margin of a marked exercise book). It is not a mood. It
also gives the app **one signature primitive** (the scale) and **one illustration grammar** (the
marks), and the rest of the UI can be quiet.

Design rules that follow from it:
1. If a number can be shown *on the scale*, show it there rather than in a sentence, a donut or a pill.
2. Colour means **which subject** (identity) or **right/wrong** (marks). Nothing else is coloured.
3. Containers only for things you act on (a subject, a question). Sections are separated by space and
   a hairline, not boxes.
4. One primary button per screen.
5. Real items, real numbers, real names. No placeholders, no system status, no zeros shown as
   achievements.

### 3.2 Type

| Role | Font | Settings | Why |
|---|---|---|---|
| Everything you read and tap, headings included | **Atkinson Hyperlegible Next** (variable, 200–800, OFL, Google Fonts; Braille Institute, Feb 2025) | body 400, UI emphasis 600, headings 700–800 | Designed for *legibility*, with letterforms that keep confusable characters apart (I/l/1, 0/O). That is a real reason for a learning app, it is not on any AI-default list, and its slightly odd details give character without a second display face. |
| Numbers: levels, counts, timers, scores, percents, the scale | **Atkinson Hyperlegible Mono** (same superfamily, OFL) | 500, `font-variant-numeric: tabular-nums slashed-zero` | Every number lines up in columns and on the ruler; ties the "measured" idea to the type itself. |
| Kids reading text only (`data-audience="kids"`) | **Andika** (SIL, OFL, Google Fonts) | 400/700 | Built for beginning readers, with single-storey a and g and distinct I/l/1. |

Self-host all three as woff2 under `public/fonts/`. That also removes the CSP problem in
`REDESIGN-NOTES.md`: no Google Fonts request at all.

```css
@font-face { font-family: "Atkinson Next"; src: url(/fonts/AtkinsonHyperlegibleNext-VF.woff2) format("woff2"); font-weight: 200 800; font-display: swap; }
@font-face { font-family: "Atkinson Mono"; src: url(/fonts/AtkinsonHyperlegibleMono-VF.woff2) format("woff2"); font-weight: 200 800; font-display: swap; }
:root {
  --font: "Atkinson Next", ui-sans-serif, "Segoe UI", system-ui, sans-serif;
  --num:  "Atkinson Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  /* scale 1.25, UI base 16, reading base 18 */
  --t-meta: 0.8125rem;  /* 13 — meta, captions; sentence case, 500, --ink-2. Never uppercase. */
  --t-ui-s: 0.9375rem;  /* 15 */
  --t-ui:   1rem;       /* 16 */
  --t-read: 1.125rem;   /* 18 — lesson text, explanations, lh 1.6, max 66ch */
  --t-stem: 1.375rem;   /* 22 — question stem, 600, lh 1.35, max 34ch */
  --t-h3:   1.5625rem;  /* 25 */
  --t-h2:   1.9375rem;  /* 31, 700, -0.01em */
  --t-h1:   2.4375rem;  /* 39, 800, -0.015em (app pages) */
  --t-disp: clamp(2.5rem, 1.6rem + 3.6vw, 3.5rem); /* 40–56 landing only, 800, -0.02em, lh 1.05 */
}
.num, .scale, table td.n, .counter, .timer { font-family: var(--num); font-variant-numeric: tabular-nums slashed-zero; }
```

Rules: no uppercase labels anywhere (the table heads included: 13px, 600, sentence case). No italic
for emphasis in headings. Use `text-wrap: balance` on h1–h3 and `text-wrap: pretty` on paragraphs.
Curly quotes, `…`, `&nbsp;` between number and unit ("10&nbsp;min", "level&nbsp;10").

### 3.3 Colour

Neutral base (no paper tint), colour from the subject, two mark colours. Define everything in OKLCH so
equal lightness looks equally bright (Linear's reason for LCH). Check every pair with a contrast checker
before shipping (text 4.5:1, UI and lines 3:1).

```css
:root {
  --page: #ffffff;  --well: #f4f5f7;  --line: #e3e5e9;  --line-strong: #c8ccd3;
  --ink: #15171b;   --ink-2: #4b5059;  --ink-3: #6c717b;  /* 17.9 / 8.1 / 4.9 : 1 on white (dark set: 16.0 / 9.7 / 6.0 on #121316) */
  --correct: oklch(0.52 0.13 150);   --correct-wash: oklch(0.97 0.02 150);
  --incorrect: oklch(0.53 0.18 27);  --incorrect-wash: oklch(0.97 0.02 27);
  --warn: oklch(0.55 0.12 70);       /* time running out, unchecked; nothing else */
  /* subject identity: --hue set per subject; strong = text/marker, wash = band */
  --subj: oklch(0.50 0.15 var(--hue));
  --subj-wash: oklch(0.965 0.025 var(--hue));
  --subj-line: oklch(0.85 0.06 var(--hue));
}
[data-subject="math"]       { --hue: 262; }  /* cobalt */
[data-subject="english"]    { --hue: 335; }  /* plum */
[data-subject="reading"]    { --hue: 200; }  /* teal */
[data-subject="iq"]         { --hue: 295; }  /* violet: a subject colour, never the brand */
[data-subject="act"]        { --hue: 235; --subj: oklch(0.45 0.08 235); } /* slate */
[data-subject="spanish"]    { --hue: 75;  --subj: oklch(0.50 0.12 75); }  /* saffron */
[data-subject="chess"]      { --hue: 60;  --subj: oklch(0.38 0.02 60); }  /* board graphite */
[data-subject="piano"]      { --hue: 280; --subj: oklch(0.35 0.06 280); } /* ebony-indigo */
[data-subject="basketball"] { --hue: 50;  --subj: oklch(0.52 0.14 50); }  /* leather */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --page: #121316; --well: #1a1c20; --line: #2a2d33; --line-strong: #3d4149;
  --ink: #eceef1; --ink-2: #b7bcc5; --ink-3: #8d939d;
  --subj: oklch(0.78 0.11 var(--hue)); --subj-wash: oklch(0.24 0.04 var(--hue)); --subj-line: oklch(0.40 0.06 var(--hue));
  --correct: oklch(0.78 0.14 150); --incorrect: oklch(0.74 0.15 27);
} }
```

- Subject hues skip the correct-green band (130–160) and the incorrect-red band (15–35), so a mark is
  never confused with an identity.
- **Primary button = ink** (`--ink` bg, `--page` text) in both themes. It is the single "Instructive"
  colour, to borrow Khan Academy's term. Subject colour never goes on buttons.
- Retire: marigold brand, review blue, checkpoint plum, locked grey as hues. Review, checkpoint and
  locked become **shapes and words on the scale** (see 3.5), not colours.
- The logo is ink only.
- `data-subject` goes on `<body>` or the root element of path/session/placement (JS already knows the
  track key), and on each dashboard row.

### 3.4 Layout, grid, shape

- 12-column grid, `--maxw: 1120px`, 24px gutters, 16px side gutters on phones. Left-aligned
  everywhere. Centre only a single-word state (for example a loading spinner).
- Three widths: **reading** 680px (lesson, question, placement question), **app** 1120px with an 8/4
  split (dashboard, path), **landing** 1120px.
- Spacing scale 4 · 8 · 12 · 16 · 24 · 40 · 64 · 96. Use 8 inside a group, 16–24 between groups, 64
  between sections (96 on landing). Do not use 24px padding on everything.
- Radius: 6px controls, 8px choices and inputs, 10px the few real containers. `999px` only for the
  segmented control. Delete `--r-lg: 20px`.
- Shadows: none at rest. One elevation shadow for popovers, modals and the sticky action bar only.
- Hairlines (`1px var(--line)`) separate sections, not boxes.

### 3.5 The signature primitive: the scale

One component, used on landing, dashboard, path, placement result and the player's progress.

```html
<figure class="scale" data-subject="math" style="--from:1; --to:393; --you:10">
  <ol class="scale-ticks" aria-hidden="true">
    <li style="--at:31"  class="tick is-master">31</li>
    <li style="--at:97"  class="tick is-grand">97</li>
    <li style="--at:392" class="tick is-grad">392</li>
  </ol>
  <span class="scale-you" style="--at:10"><b>You</b> 10</span>
  <figcaption>Level 10 of 393. Next Master quiz at 31.</figcaption>
</figure>
```

```css
.scale { position: relative; height: 56px; margin: 0; font-family: var(--num); }
.scale::before { /* the ruler: minor ticks every N levels via repeating gradient */
  content: ""; position: absolute; inset: 20px 0 auto; height: 10px;
  background: repeating-linear-gradient(90deg, var(--line-strong) 0 1px, transparent 1px calc(100% / 40));
  border-bottom: 1px solid var(--line-strong);
}
.scale .tick, .scale-you { position: absolute; left: calc((var(--at) - var(--from)) / (var(--to) - var(--from)) * 100%); transform: translateX(-50%); }
.tick { top: 34px; font-size: 12px; color: var(--ink-3); }
.tick::before { content: ""; position: absolute; top: -16px; left: 50%; width: 1px; height: 16px; background: var(--ink-2); }
.tick.is-master::after { /* diamond: Master quiz */ }
.tick.is-grand::after  { /* double diamond */ }
.tick.is-grad::after   { /* flag */ }
.scale-you { top: 0; font-size: 12px; color: var(--subj); }
.scale-you::after { content: ""; position: absolute; left: 50%; top: 16px; width: 3px; height: 22px; background: var(--subj); border-radius: 2px; }
```

Variants: **threshold meter** (mastery 0→100 with tick marks at 60 and 80 and the current value),
**unit strip** (20 cells for the English gap result), **segmented progress** (one segment per item in a
session), and **vertical rail** (the path). They all share the same tick and marker vocabulary.

### 3.6 Illustration and icons: the marks

- **Marks** (new SVG set, ~8 glyphs): tick, cross, circle-around, underline, double-underline, arrow,
  question, and a "skip" slash. Drawn once by hand (pen or tablet, then simplified to 1–2 paths with
  slight irregularity and a tapered stroke). They are the only "illustration" in the product UI. Used
  for: feedback in the player, done levels on the path rail, "already yours" units at placement, and
  the landing demo. Correct = `--correct`, wrong = `--incorrect`, otherwise ink.
- **Subject symbols** in place of glyph-in-tinted-tile: a periodic-table-style tile, which fits a
  multi-subject app called Polymath and carries data. It shows a two-letter symbol and the grade count
  in mono: `Ma 49`, `En 16`, `Rd 16`, `Iq 12`, `Ac 16`, `Es 57`, `Ch 19`, `Pi 19`, `Bb 15`. Built as
  a 40px square, 1.5px `--subj` border, symbol in Atkinson 800 `--subj`, count in Mono 11px `--ink-3`.
  No background tint.
- **UI icons:** keep the in-house sprite (no new dependency), but (a) use icons only for actions and
  navigation, never as decoration next to headings or stats; (b) redraw the set at 20px with a 1.75px
  stroke, square caps for straight glyphs and round caps for curves, so it stops matching Lucide;
  (c) delete `brain`, `zap`, `star`, `award`; (d) apply optical fixes: arrow and play glyphs nudged
  +0.5px right, icon-side button padding 2px smaller than the text side.
- **Logo:** retire the layers-in-a-yellow-tile. Use a wordmark in Atkinson Next 800 with three ruler
  ticks of rising height before it, ink only, as one SVG. Keep it swappable: the name is not final per
  `docs/PRODUCT-DECISIONS.md` ("Savant" is the leading candidate).
- **Subject content visuals** on landing and in lessons: real items rendered as real objects (a number
  line, a chess diagram, a short music staff, a Spanish sentence with its gloss), not icons.

### 3.7 Motion

One orchestrated moment and a few functional transitions. Nothing else moves.

- **The mark draws itself** on answer reveal: `stroke-dashoffset` from length to 0, 240ms,
  `cubic-bezier(0.2, 0, 0, 1)`. A cross does the same, with no shake.
- **The "you" marker slides** to its new position on the scale after a session or a placement result
  (420ms, same curve, once).
- Choice press: `transform: translateY(1px)` 80ms. Item change: the new item fades and translates 8px,
  140ms.
- Delete `--ease-spring`, all hover-lift on cards, and any `transition: all`. Under
  `prefers-reduced-motion: reduce`, marks appear at full length and markers jump.

### 3.8 Copy rules

- No em dashes or middle dots in UI strings; use a comma, a colon or a new line. ("Level 10, lesson",
  "Numbers to 10, Kindergarten first half".)
- No `→` in labels. Buttons say the action and the object: "Start lesson 10", "Take the placement
  quiz", "Next question".
- Never show learners system state (model keys, AI on/off). Never present a zero as an achievement.
- Clean generated titles at display time (see Path #2). Fix the `lesson-(…)` slug at its source.
- Sentence case everywhere. Numerals for counts.

### 3.9 Changes per screen (priority order inside each)

#### Landing (`index.html`, `landing.js`, §18 of `style.css`)
1. Delete `<p class="eyebrow">An adaptive tutor</p>` and the `<mark>` in the H1. H1 at `--t-disp`,
   800, ink: *"Start where you actually are."* (or more specific: *"Find your level in ten minutes.
   Then learn only what you're missing."*).
2. Replace `.demo` (floating card plus tilted path card) with a **working mini placement**: three
   real items from the bank. Each answer draws a mark, and a `.scale` for Mathematics (1→393) moves the
   "You" marker as you answer. It uses static JSON in `landing.js` and no backend. This shows the
   workflow instead of a picture of it.
3. Delete `.steps` (01–04) and `.pillars`. Replace them with one section, **"Your first week"**: a
   horizontal timeline drawn with the scale primitive. Day 0: placement (20–50 questions, about 10
   min). Day 0: first lesson at your level. Day 1, 3, 8, 21, 35: when one skill comes back for review.
   The review interval ticks *are* the explanation of spaced repetition.
4. Subjects: replace 9 identical cards and their grey pills with a **catalogue table**
   (`<table class="catalogue">`). Each row shows the subject symbol tile, name, grade count (Mono,
   right-aligned), range in words ("counting blocks to a doctoral exam"), and a thin grade strip (one
   tick per grade). It is one row primitive and fits the screen without "+44 more".
5. Delete the dark `.cta-band`. End with an H2 and one ink button aligned to the left column.
6. Page background `--page` white; sections separated by `border-top: 1px solid var(--line)` and
   96px padding. No alternating panels.
7. Nav: "Get started" → "Take the placement quiz"; "Sign in" stays a text link.
8. New logo (3.6). Dark-mode-aware SVG favicon, and an OG image showing the scale.
9. Footer: Help, How placement works, Privacy, a contact address and the last-updated date, instead of
   "Polymath · a learning preview".
10. Remove `.card-link:hover` lift on landing; hover changes only the row background to `--well`.
11. Phone: H1 40px. The mini placement comes directly after the lede, at full width, and choices are
    56px tall.
12. `text-wrap: balance` on H1/H2, and no widow in the lede.

#### Dashboard (`dashboard.js`, §14)
1. Delete the date eyebrow and "Welcome back, NAME". The page H1 is the next action: "Next: lesson 10,
   counting collections to 10", with the subject symbol and **one** ink button "Start lesson 10". This
   is the only primary button on the page.
2. Remove `.ai-status` from the learner dashboard. Move it to the profile page or show it inline only
   inside the coach UI when a learner tries to use it.
3. Delete `.stat-strip` (streak, XP, subject count). Streak and XP already sit in the header. When a
   streak exists, show a 7-day row of marks (M T W T F S S) in the aside. Show nothing when it is 0.
4. Each enrollment becomes a **row**, not a card: symbol tile, name and grade, a `.scale` with the
   track (1→N, checkpoint ticks, "You" marker), and "Continue" as a text button. `data-subject` on the
   row sets its colour.
5. Delete the `.ring` donut and the "Lesson 10 of 393" pill. Level and total live on the scale.
6. Replace the "To advance: …" sentence with a 3-line threshold checklist on the path page only.
   The dashboard shows just "0 of 12 questions at this level".
7. Section headings (`h2`, 20px, 700): remove the icon tiles. Use a hairline above instead of a box
   around.
8. Layout: `grid-template-columns: 8fr 4fr` from 1024px. Main = subjects. Aside = "Due for review"
   (skills and counts from the existing due data), streak marks, and "Learning-style quiz, 2 min" as a
   text link (it is secondary, so it gets no card and no black button).
9. Recent sessions: Mono numbers right-aligned (`td.n`), human values ("Mathematics", "Placement"),
   score as "14 / 20" rather than "50%" when the counts exist, date as "Today 08:14". Design the empty
   state as one line plus a link.
10. "Add a subject" becomes a text button at the end of the subjects list, not floating top right.
11. Dark: graphite (`#121316`), ink-inverted primary button (light button, dark text), subject colours
    via the dark `--subj`.
12. No hover lift and no shadows on rows. Hover = `--well` background.

#### Path (`path.js`, §13)
1. **Group levels by grade and then unit** with `<details class="unit">`. Only the current unit is
   open. The `<summary>` shows the unit name, its level range in Mono ("10–18"), and a row of tiny marks
   for done, current and remaining. 393 rows become about 40 summaries.
2. **Clean titles in `nodeRow`** (display only): strip `^(Activity|Tester|Lesson) \d+ of \d+( \(.*?\))?:\s*`,
   the trailing ` - <unit title>`, and the `Level N — Kind:` prefix. The level number goes on the rail
   and the kind ("Game", "Check", "Lesson") goes in small `--ink-3` text after the title. Example:
   `13  Match objects, pictures and numbers   Game`.
3. **Vertical rail** in place of circle badges: a 56px left column with the level number in Mono,
   right-aligned, and a 1px rule. Done = drawn tick. Current = `--subj` 3px marker plus "You". Locked =
   number in `--ink-3`, with no icon and no "locked" text (one line in the unit summary says
   "Unlocks after level 10").
4. Checkpoints are the only special shapes on the rail: a diamond for Master, a double diamond for Grand
   Master, a flag for Graduation, each with the pass mark in Mono ("75%").
5. Show the `detail` line only for the current and next level. Others show it when the row is
   expanded. Delete the 2-line ellipsis truncation.
6. **Path head**: delete the `.path-hero` card, the donut and the "YOU ARE ON" eyebrow. Use H1
   "Mathematics" with the subject symbol, a meta line "Numbers to 10, Kindergarten first half", then a
   full-width `.scale` (1→393 with all checkpoints and the "You" marker), then the **threshold
   checklist** as three Mono meters with tick marks at their thresholds: "Average mastery 0 / 80%",
   "Weakest skill 0 / 60%", "Questions at this level 0 / 12". Then the one primary button "Start
   lesson 10".
7. Delete "How the path is laid out" (it is now on the scale). Keep "Skills at this level" as a plain
   table below the units, with Mono numbers and the threshold meter.
8. Delete the bordered "Revisit" buttons on done rows. The whole row is a link, and hover shows
   "Revisit" in `--ink-3`.
9. Current row: no card and no shadow. Use a full-bleed `--subj-wash` band and the action button on
   the right.
10. No serif anywhere. Lesson rows get 600 instead of `.node-lesson .title { font-family: var(--display) }`.
11. A sticky unit header (`position: sticky; top: var(--header-h)`) shows which unit you are in while
    scrolling.
12. Back link on the left above the H1 ("← Dashboard" is the one place an arrow is a real back
    affordance; use the icon, not a text arrow).
13. Phone: 40px rail, 16px titles, row actions under the title, no button wrap.
14. Skipped (proven) units: the summary shows a circled mark and "Already yours", collapsed.

#### Lesson and question player (`session.js` shell, `player.js`, §10, §12, §24)
1. **Focus mode:** inside the player, hide the global header (logo, nav, streak, theme). The top bar
   becomes `[×]  Counting collections to 10   [segments]   1 / 3`, 56px, hairline below.
2. Progress = **segmented bar**, one segment per item. A segment fills when the item is answered, with
   a 2px tick or cross colour on the segment. Delete the 0% label.
3. Title: the cleaned short title only. "Level 10, lesson" as 13px `--ink-3` text under it, and only on
   the lesson's first screen.
4. Remove the FOCUS eyebrow and the metadata chips (skill, difficulty, level) from the learner view.
   Keep them in a `?debug` or admin mode. (Also fix the data so items match the level's skill.)
5. Stem: `--t-stem`, 600, max 34ch, no card around the question on phones (the page *is* the card).
6. Choices: 56px min, 1px `--line`, radius 8, no bottom "pressable" shadow. The letter is plain Mono
   `--ink-3` text at the left with no box, and a keyboard hint "1–4" appears once on desktop. Selected =
   1.5px ink border.
7. **Verdict by marks, not floods:** after answering, draw a cross in the left margin of the chosen
   wrong row and a tick on the correct row. The rows themselves get only a 1.5px border in the mark
   colour, with no solid fills and no "YOUR ANSWER" / "CORRECT" labels. The explanation appears below
   the choices as plain text on `--page`: a heading line "Not quite. It's 5 bags." (600, colour on the
   first two words only), then the rationale at `--t-read`.
8. **Sticky action bar** at the bottom (`position: sticky; bottom: 0`, `--page` background, hairline
   top, elevation shadow). "Check" before answering and "Next question" after, always in the same
   place. "Ask about this" and "Report a problem" go in a `⋯` menu on the bar.
9. Confidence: a 3-option segmented control (`Sure | Think so | Guessing`), 36px, labelled "How sure
   are you? (optional)". No pills.
10. Lesson reading view: 18px / 1.6, 66ch. H2s without the orange dash. Worked examples set as math
    (proper `−`, `=`, aligned Mono numerals in a `--well` block, **no left border**). Code-style blocks
    only for real code.
11. Kids (`data-audience="kids"`): Andika 22px for stems, 64px choices, the same marks (they suit
    children), real countable pictures where the item is about counting. **Delete the four-colour key
    tiles and the ✦.** Don't make it more decorated; make it bigger.
12. Delete the footer note "Finish whenever you like — …". Put "Finish" in the top bar menu.
13. Motion: only the mark draw (240ms) and the item change (140ms). No bounce.

#### Placement (`placement.js`, `subject-placement.js`, §10, §15)
1. Question screen uses the player shell: top bar `[×]  English placement   Question 4   6 min`, with
   the timer in Mono that turns `--warn` under 2 minutes.
2. Move "each question is picked from your answers so far, no feedback until the end" to the intro
   screen as a definition list (`Questions 20–50 · Time about 10 min · Feedback at the end`, built as
   `<dl>`, not dots).
3. No progress bar on an adaptive test (it cannot be accurate). Show the question number and time
   only.
4. "Skip this question" → **"I don't know"**, styled as a fifth, quieter choice row (an honest answer
   the scorer can use).
5. Result: **left-aligned**. H1 "You start at level 10 of 393." A full-width `.scale` whose "You"
   marker slides in from 1 once, with checkpoints marked. Delete the centred pill eyebrow and the
   orange top tab.
6. "How you did by difficulty" becomes a **dot matrix**: one column per difficulty (1–4), five squares
   per column, filled and ticked for right, outlined for wrong, with a dashed 70% line and the caption
   "Your level is the top of the hardest band you held at 70%". This replaces the wrapped bar table.
7. "What to work on first" becomes two short lists with marks: "Learn first: Counting on, Number bonds
   to 10" (underline mark) and "Already solid, moves to review: Counting to 10" (circled). No pills.
8. English gap result: replace the three chip groups with a **20-cell unit strip** (`.scale`
   variant). Cell 5 circled (skipped, yours), cell 6 with the "You" marker (start here), cells 1–4
   dotted (not checked yet), 7–20 plain. Unit names go in a list under the strip.
9. Delete the side-bordered "Quick check" callout and the nested tinted box. Use a plain paragraph and
   two buttons: primary "Take the quick check (about 18 min)" and secondary text button "Start at
   level 161".
10. Remove the outer card on result screens. The content sits on the page in the 680px reading width.
11. `tabular-nums` on every count; "14 of 20 (70%)" in Mono.

### 3.10 What NOT to do

- Do not swap cream for another trend palette (sage, black + neon, lavender, terracotta) without a
  reason from the subject. Anthropic's guidance says that is the failure mode.
- Do not reach for Inter, Geist, Space Grotesk, Instrument Serif, DM Serif, Playfair, Fraunces, Sora,
  Bricolage or Satoshi as the "fix". Each is someone's default now.
- No highlighted or italic accent word in headlines, no eyebrows, no "01 / 02 / 03", no `→` in labels,
  no middle-dot strings, no em-dash titles.
- No glyph-in-tinted-rounded-square tiles; no icons beside section headings; no stat banners; no
  donuts for single numbers.
- No coloured left or top borders on cards or callouts; no cards in cards; no glass, glows, gradients
  or grain.
- No fake product shots, testimonials, "trusted by" rows, user counts or invented stats.
- No sparkles, no emoji in app chrome, no confetti for routine answers (save one quiet celebration for
  a checkpoint pass, and make it the scale marker moving past the checkpoint tick).
- No decorative motion: no fade-up on scroll, hover lift, pulsing dots or spring easing.
- No new colours for new meanings. Express a meaning on the scale or in words.
- No mascot. A mascot is a large brand commitment (Duolingo built a typeface around theirs) and a
  half-made one reads worse than none.

### 3.11 Order of work (each phase removes tells on its own)

- **P0, about a day, CSS and copy only (highest impact per hour):** self-host Atkinson Next and Mono and
  drop Fraunces/Figtree (this also fixes the CSP issue); swap tokens to the white/graphite neutrals;
  radius 6/8/10 and remove rest-state shadows; delete eyebrows (`.eyebrow { display:none }` as a
  stopgap, then delete the markup), `<mark>`, icon tiles beside headings, the stat strip, ring donuts,
  `→`, ✦, spring easing and hover lifts; replace em-dash and middle-dot strings in JS templates; hide
  `.ai-status`; clean path titles in `nodeRow`; fix the `lesson-(…)` slug.
- **P1, 2–3 days:** the `.scale` component and its variants; path grouping by unit with the rail;
  player focus mode, segmented progress, verdict marks and the sticky action bar; placement result
  scale and dot matrix; the marks SVG set; subject symbol tiles with `data-subject` hues.
- **P2:** landing rebuild (mini placement, first-week timeline, catalogue); new logo and favicon/OG;
  kids variant with Andika; redrawn 20px icon set.
- **Check before merge:** go through §2.1 G1–G15 and §3.10 on screenshots at 375 and 1280 in light and
  dark mode. Optionally run a slop detector such as Impeccable's `detect` (third-party npm package; the
  owner decides whether to install it). Run a contrast check on every token pair.

Coordination note: `public/` is being edited by the accessibility agent. All of the above is markup-
and CSS-level apart from the display-title cleanup in `path.js` `nodeRow`, the `data-subject`
attribute, the player focus mode in `session.js` `shell()`, and the landing mini placement in
`landing.js`. Keep ids unchanged (the list in `REDESIGN-NOTES.md` still applies).

---

## 5. Sources

AI-design tells and the 2026 "Claude aesthetic"
- Kyle Chayka, "The A.I.-Design Aesthetic That's Taking Over the Internet", *The New Yorker* (2026): https://www.newyorker.com/culture/infinite-scroll/the-ai-design-aesthetic-thats-taking-over-the-internet (read via the summaries below; not fetched directly)
- Nick Heer, "The Claude Aesthetic", Pixel Envy: https://pxlnv.com/linklog/claude-aesthetic/
- "Why So Many AI-Built Websites Are Starting to Look the Same", IBTimes: https://www.ibtimes.sg/why-so-many-ai-built-websites-are-starting-look-same-91292
- "AI design tools are making every website look the same", Northeast Times: https://northeasttimes.com/2026/07/31/ai-design-tools-are-making-every-website-look-the-same/
- "Why Do Claude Designs All Look the Same?", Generative Labs: https://www.generativelabs.com/insights/why-ai-design-tools-look-the-same
- "Why AI Websites Look the Same and How to Fix It", Techarion: https://techarion.com/blog/why-ai-websites-look-the-same-how-to-make-claude-design-better
- "Your Website Is Giving 'Claude Made This.'", Deonna (Substack): https://deonna.substack.com/p/your-website-is-giving-claude-made
- "The AI aesthetic design language", Kompozy: https://kompozy.io/guides/the-ai-aesthetic-design-language
- Anthropic, `frontend-design` skill (SKILL.md): https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md
- Justin Wetch, "Improving Claude's frontend design skill": https://www.justinwetch.com/blog/improvingclaudefrontend
- Impeccable slop catalogue (67 patterns): https://impeccable.style/slop
- "AI Design Slop: 16 Patterns That Mark a Site as Vibe-Coded", Developers Digest: https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it
- Matthew Blode, "You don't have to make AI slop": https://blode.co/writing/you-dont-have-to-make-ai-slop
- "How to Avoid Building Apps That Look Vibe Coded", VibeMole: https://vibemole.com/resources/avoid-vibecoded-app-design
- "Why Your Vibe-Coded App Looks Like Every Other AI App", The Crit: https://thecrit.co/resources/vibe-coding-design-guide
- "How to Make Your AI-Generated Website Look Professionally Designed", Differ: https://blog.getdiffer.com/design-tips-vibe-coded-project
- "AI purple problem: make your UI unmistakable", DEV Community: https://dev.to/jaainil/ai-purple-problem-make-your-ui-unmistakable-3ono
- "Why every Claude Code-built site looks the same — and the image layer that breaks it", DEV Community: https://dev.to/kkk_dev_1b0a00f5047cb4de6/why-every-claude-code-built-site-looks-the-same-and-the-image-layer-that-breaks-it-37jp
- "How to Avoid AI Slop When Using Claude Design", MindStudio: https://www.mindstudio.ai/blog/claude-design-avoid-ai-slop-design-system
- Business Insider on vibe-coded app tells, via Smart Company: https://www.smartcompany.com.au/technology/canva-vibe-code-sites-tool-update/
- "tiptoptypetrends 2025" (Claude's serif + beige noted as a trend): https://tiptoptypetips.substack.com/p/tiptoptypetrends-2025

Craft and detail
- Vercel, Web Interface Guidelines: https://vercel.com/design/guidelines
- Refactoring UI summary (hierarchy, labels, spacing): https://bootcamp.uxdesign.cc/refactoring-ui-an-essential-guide-72014f1d77a4
- Jakub Krehel, "Optical alignment": https://jakub.kr/components/optical-alignment
- Pixso, icon alignment (play-triangle nudge): https://pixso.net/articles/alignment-icon/

Products
- Duolingo rebrand, Creative Review: https://www.creativereview.co.uk/duolingo-rebrand-johnson-banks/
- Duolingo Feather Bold, Creative Bloq: https://creativebloq.com/news/feather-bold
- Duolingo illustration guidelines: https://design.duolingo.com/illustration and https://design.duolingo.com/illustration/characters
- Duolingo new home screen (path) design: https://blog.duolingo.com/new-duolingo-home-screen-design
- Brilliant x Rive (colour-coded paths, streak animation): https://rive.app/blog/how-brilliant-org-motivates-learners-with-rive-animations
- Brilliant brand refresh (Koto; PIX illustration), summary only: https://pcho.medium.com/a-brilliant-brand-refresh-4af021c11486
- Brilliant UI breakdown: https://screensdesign.com/showcase/brilliant-learn-by-doing
- Brilliant x ustwo "Game Feel": https://ustwo.com/work/brilliant/
- Khan Academy, "How We Rebuilt Khan Academy's Color System from the Ground Up": https://blog.khanacademy.org/how-we-rebuilt-khan-academys-color-system-from-the-ground-up
- Linear, "How we redesigned the Linear UI": https://linear.app/now/how-we-redesigned-the-linear-ui
- MacStories, "Things 3: Beauty and Delight in a Task Manager": https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/
- Arc / The Browser Company design interview, Inverse: https://www.inverse.com/input/design/the-browser-company-arc-design-interview
- Josh Miller interview, Behind the Craft: https://creatoreconomy.so/p/josh-miller-inside-ai-browser-product
- Stripe developer experience teardown, Moesif: https://www.moesif.com/blog/best-practices/api-product-management/the-stripe-developer-experience-and-docs-teardown/
- Stripe and Söhne, Font Alternatives: https://fontalternatives.com/inspiration/stripe-sohne/
- Readwise Reader design analysis, Blake Crosley: https://blakecrosley.com/guides/design/readwise-reader

Typefaces
- Atkinson Hyperlegible Next / Mono launch (Braille Institute, Feb 2025): https://christiantietze.de/posts/2025/02/atkinson-hyperlegible-font-next-mono/ and https://fontsource.org/fonts/atkinson-hyperlegible-next/about and https://fontsource.org/fonts/atkinson-hyperlegible-mono/about
- Andika (SIL, for beginning readers): https://en.wikipedia.org/wiki/Andika_(typeface)

Caveat: most tell catalogues are blogs or vendor posts, not systematic studies. The New Yorker article
was read through secondary coverage (Pixel Envy, IBTimes, Generative Labs). Anthropic's own skill and
Khan Academy's and Linear's posts are first-party. Hex/OKLCH values above are starting points and
must be contrast-checked before shipping.
