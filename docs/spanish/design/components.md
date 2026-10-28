# Components: Polymath Spanish

Built in code once, in isolation: `/spanish/design` in the host app
(`public/spanish/design.html`, `css/components.css`, `js/ui/*`). Every value
comes from `tokens.css`; class names are prefixed `es-` and the Spanish pages
never load the host's `style.css`.

Measured from the reference and kept as the system (roles, not values): 2px
borders everywhere, a 4px "lip" under anything pressable that disappears on
press, 16px radius on cards and buttons, 15px bold uppercase button labels with
0.8px tracking, 17px body, 19px card titles, 32px exercise prompts, 88px rail
(256px from 1160px wide), 368px right rail, 70×65 path nodes with an 8px lip.

What is ours, not theirs: the palette (violet accent placeholder, never their
green), the rounded open font stack (Nunito → ui-rounded → system), every icon,
every illustration, the cast (Axo the axolotl + four story characters), every
sound (synthesised in the browser), and every label.

---

```
Button  .es-btn
  variants  primary (accent), secondary (blue), success (green: CHECK / CONTINUE after correct),
            danger (red: CONTINUE after wrong, quit), gold (claim rewards), ghost (SKIP),
            plain (text-only: REPORT, VIEW ALL)
  sizes     sm 40px, md 50px, lg 56px; --block for full width
  states    default; hover (brightness +6%); active (moves down 4px, lip gone);
            focus-visible (3px focus ring, 3px offset); disabled (locked grey, no press);
            loading (aria-busy="true": label hidden, spinner in ink colour, width kept)
  tokens    face / lip / ink per variant (accent + accent-lip + on-accent …), radius lg,
            text sm 15/18 800 uppercase, border-width 2, border-lip 4, motion press 80ms
  a11y      real <button>; label stays in the DOM while loading; disabled uses the
            attribute, not just a class; never colour alone (labels say CHECK / CONTINUE)
  used on   S03, S05, S08, S12–S19, S29, S30, S44, S49–S58, everywhere
```

```
Icon button  .es-iconbtn   (close X, inline speaker)
  size      44×44 tap target (tap-min), 24px glyph
  states    default muted; hover text colour on surface; focus-visible ring
  a11y      aria-label always (icons are aria-hidden)
  used on   S12 (quit), S50 bubbles, S10 phrase cards
```

```
Audio button  .es-audio  / .es-audio--slow
  sizes     72px (normal speed), 52px (slow, turtle)
  states    idle; pressed (lip gone); playing (data-playing="true": glyph pulses)
  tokens    secondary face + secondary-lip, on-secondary glyph, radius lg
  a11y      aria-label "Play" / "Play slowly"; Space/Enter; slow = playbackRate .6, not a second clip
  used on   S12 (listen items), S51, S52
```

```
Mic button  .es-mic
  states    idle "Tap to speak"; listening (secondary border, 5-bar live level meter from
            Web Audio, auto-stop 6s or tap); processing (aria-busy); denied (mic-off icon,
            "Can't use the mic", the exercise offers "Can't speak now")
  tokens    surface face, border lip, secondary-text ink
  a11y      the state text changes, not just colour; live region announces "Listening"
  needs     Permissions-Policy microphone=(self) — fixed in middleware/security.js
  used on   S12 speak items, S53, S54 fluency sprint, S56, S57
```

```
Card  .es-card
  states    default; header row (.es-card__title) with title + plain link
  tokens    border 2px border, radius lg, padding 18 (space-5), bg
  used on   S07 right rail, S29, S27, S38–S42
```

```
Tag  .es-tag / .es-tag--mistake
  variants  NEW WORD (accent, sparkle), PREVIOUS MISTAKE (gold-text, redo)
  tokens    text xs 13/16 700 uppercase
  used on   S12
```

```
Choice card  .es-choice  (+ --image)
  variants  text option row (key badge + centred text); image card (art + word + key);
            pair tile (match pairs)
  states    default; hover surface; pressed (2px down); selected (aria-pressed / aria-checked:
            secondary border + 14% tint + secondary-text); correct (success border, success-bg);
            wrong (danger border, danger-bg, 300ms shake); done (45% opacity, inert)
  tokens    border 2 + bottom 4 (lip), radius lg, key badge radius sm
  a11y      <button aria-pressed> (or role=radio in a radiogroup for single-answer);
            number keys 1–9/0 select, Enter checks; result announced in the footer, not by colour
  used on   S03 option lists, S12 select-image / select-meaning / match-pairs, S29
```

```
Word tile, answer line, bank  .es-tile / .es-answer / .es-bank
  states    default; hover; pressed; ghost (the slot a tile leaves in the bank, keeps layout);
            dragging (lifted, pop shadow); correct / wrong (after check)
  behaviour tap moves bank → answer and back with a FLIP animation from where it was;
            pointer-drag is optional on top (no HTML5 drag and drop: it fails on touch)
  tokens    border 2 + bottom 4, radius md, 48px high; answer has ruled lines every 60px
  a11y      each tile a <button>; lists have aria-labels "Your answer" / "Word bank";
            ghosts are aria-hidden and untabbable
  used on   S12 word_bank / arrange / tap_heard, S54 Sentence Builder
```

```
Text input  .es-input (+ textarea)
  states    default (border-strong, 3:1 on bg); focus (secondary border); invalid (danger);
            disabled
  extras    accent bar (.es-accents): á é í ó ú ñ ü ¿ ¡, inserts at the caret without
            stealing focus
  a11y      <label for>, lang="es" on Spanish inputs, spellcheck off, autocomplete off
  used on   S12 type items, S52 dictation, S55 writing lab, S05
```

```
Progress bar  .es-progress
  variants  lesson (success fill), combo (data-combo: gold fill + "N IN A ROW" label),
            quest (gold, with count + chest cap), accent (sections)
  tokens    16px tall, pill radius, surface-2 track, highlight stripe, bounce easing 400ms
  a11y      role=progressbar with aria-valuenow
  used on   S12, S29, S09, S18
```

```
Stat chip  .es-stat (--streak / --gems / --hearts)
  states    default; active streak (gold); zero (muted); bump animation on change
  a11y      aria-label states the number and the noun ("12 day streak")
  used on   S07 top bar, S12 hearts
```

```
Unit banner  .es-unit
  content   kicker "GRADE 1 · UNIT 1", title (the unit goal, shortened), guidebook button
  tokens    --unit / --unit-lip per unit colour (default accent), xl title 24/30 800
  used on   S07
```

```
Path node  .es-node
  kinds     lesson (star), story (book), listening (headphones), conversation (chat),
            chest (gift, no disc), unit check / review (trophy), plus engine icons as built
  states    locked (grey); current (unit colour, progress ring, bobbing START label);
            done (unit colour, check); legendary (gold) later
  layout    zig-zag via --x offsets (0, -44, -70, -44, 0, 44, 70, 44…), 24px gap,
            current node gets 48px above it for the START label
  a11y      <button aria-expanded> opening the popover; aria-label names kind + state
  used on   S07
```

```
Popover  .es-pop
  states    open level (unit colour, title, "Lesson n of m", START +XP button);
            locked (surface, "Finish the levels above to unlock this.")
  a11y      role=dialog, closes on outside click and Escape, focus moves to START
  used on   S08
```

```
Speaker + speech bubble  .es-speaker / .es-bubble / .es-word / .es-gloss
  content   character (left), bubble with a speaker button and tappable words
  states    character idle (blinks); talking (data-talking: mouth animates while audio plays);
            word hover/focus (dashed underline → secondary); gloss tooltip on tap
  a11y      words are focusable with Enter/Space; gloss is role=tooltip; the sentence text
            is real text with lang="es"
  used on   S12 select-meaning / translate, S14, S50, S53
```

```
Feedback footer  .es-footer
  states    idle (SKIP + CHECK, CHECK disabled until an answer exists); correct (success-bg,
            badge ✓, "¡Muy bien!" style praise, REPORT, CONTINUE success); wrong (danger-bg,
            badge ✗, "Correct answer:" + solution, REPORT, CONTINUE danger)
  motion    verdict rises 24px over 200ms; correct/wrong sounds
  a11y      aria-live="polite" so the verdict is read; Enter = check, then continue
  used on   S12, S13
```

```
Modal  .es-scrim / .es-modal
  variants  quit lesson (character, "Keep learning" primary + "End lesson" plain danger);
            out of hearts; paywall later
  a11y      role=dialog aria-modal, focus to the safe action, Escape closes, scrim click closes
  used on   S15, S16, S44
```

```
Toggle  .es-toggle / .es-switch
  states    off; on (secondary); focus ring; disabled
  a11y      <input type=checkbox role=switch> with a <label for>
  used on   S39–S42
```

```
Quest row  .es-quest
  content   icon, title, progress bar with "n / of" and chest
  states    in progress; complete (full bar); claimed; expired (muted)
  used on   S07 right rail, S18, S29
```

```
Celebration tiles  .es-tilestat (--xp / --acc / --time)
  content   coloured header label + value with icon
  motion    pop-in with bounce, staggered 120ms; mascot hops
  used on   S17
```

```
Week strip  .es-week / .es-day
  states    done (gold + check), frozen (secondary + snowflake), missed / future (surface-2)
  used on   S18 streak card, S36
```

```
League row  .es-rank / .es-zone
  states    normal; me (surface highlight); promotion zone (success rank number + divider);
            demotion zone (danger)
  used on   S27, S28
```

```
Toast  .es-toast        role=status, 2.2s, above the mobile tab bar
Skeleton  .es-skel      shimmering placeholder rows; respects reduced motion
```

```
App shell  .es-shell / .es-rail / .es-navlink / .es-main / .es-col / .es-side / .es-topbar / .es-tabbar
  ≥1160px   rail 256px with labels, path column (max 600), right rail 368px
  1024–1159 rail 88px icons only, right rail shown
  640–1023  rail 88px, right rail hidden
  <640      top stat bar 56px + bottom tab bar 64px (safe-area aware), no rail
  a11y      nav links use aria-current="page"; every icon link has a text label (visible
            or sr-only at narrow widths)
  used on   S07, S09, S25–S31, S38–S42
```

```
Lesson layout  .es-lesson
  rows      top bar (quit X, progress, hearts) / body (max 640, centred) / sticky footer
  used on   S12–S19, S49–S58
```

```
Characters  ES.character(id)
  cast      axo (mascot, axolotl), mara (teacher), tomas (friend), rosa (grandmother),
            diego (kid) — PLACEHOLDERS, swap for your own with the same contract:
            id, name, role, voice, SVG with .es-mouth-open / .es-mouth-closed
  states    idle (blink every ~4s), talking, happy (hop)
```

```
Picture art  ES.art(key)   agua, gato, perro, pan, casa, libro, cafe, manzana
  our own simple object drawings; the content pipeline will need many more (or an
  image model with one locked style)
```

```
Sounds  ES.sfx.play(name)
  tap, select, correct, wrong, pair, combo, complete, streak, chest, heartLost, tick
  synthesised (Web Audio), C-major pentatonic, 35% volume, off when the learner
  turns Sound effects off, unlocked by the first tap
```

## Contrast

`python contrast.py tokens.json` → **50 pairs, 0 failing AA** (report in
`contrast-report.txt`), light and dark. Two fixes came out of it and live in
the tokens, not in components: light `danger` darkened to `#cf2f3d` (white text
4.06 → 5.09), and light link/blue text uses a new `secondary-text` `#1670b3`
instead of the button lip.
