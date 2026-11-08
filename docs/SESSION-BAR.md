# The session bar and the instant enforcer (owner, 8 Nov 2026)

UI_V2 only. Files: `public/js/ui2/session-bar.js`, the "study session control" block of `public/css/ui2/app.css`, `services/enforcer-prebuild.js`,
small hooks in `public/js/study.js`, `routes/retention.js`, `services/enforcers.js`. Test: `scripts/session-bar-test.js`.

## The bar

A round clock sits in the top bar (desktop and phone; hidden inside a question player, on the enforcer page, and in Menu/Past). Its icon is an absolutely centred SVG,
so it cannot drift (the old button drew the icon through `::before` inside a grid with `font-size: 0`; the test asserts the icon and the glyph are within 0.5 / 1 px of centre).

Tap it and a pill bar slides out to its left (clip-path, 0.22 s; none with reduced motion):

| State | Bar |
|---|---|
| no session | Start session |
| running | stopwatch H:MM:SS, Pause, End |
| paused | stopwatch (stopped, dimmed), Resume, End |
| End | End session, End day, Cancel (back to the running or paused bar) |

Tap outside, Escape or the clock again closes it; the session keeps running. A running session puts a green dot (`--right`) on the clock's corner that fades
softly over 2.6 s; paused it stays, still and grey (`--line-strong`); with `prefers-reduced-motion` it is static. The clock is a disclosure (`aria-expanded`,
`aria-controls`), its label says none running / running / paused, the stopwatch is `role="timer"` with `aria-live="off"`, so it is never announced per second, and
the closed bar is `inert`.

Nothing here decides anything: every press calls `Study.act(...)` in `study.js`, so the server behaviour is unchanged (heartbeat honesty, idle rule, resume offers
and the 409 "finish the waiting enforcer first" redirect, the break line, the too-short and no-questions toasts). The stopwatch is `Study.activeNow()`, the server's
active time plus the stretch since it was read, capped as the server caps it. `study.js`'s own strip stays only for a waiting enforcer and the break line.

## The instant enforcer

While a session runs, the page's heartbeat (and the state call) asks `services/enforcer-prebuild.js` to draw the enforcer's questions from what the learner has done so
far. It runs the same `draftAll` that End runs (ranking by predicted forgetting, errors, coverage; the same tiers and budgets), on the window so far, and keeps only the
question objects, in memory, per learner. At most one build per `ENFORCER_PREBUILD_MS` (default 3 min) and only when something new was answered. The first two picks of
the widest tier are recorded as the "first questions" (`state.prebuilt`: counts only, never the questions).

- Sources are the objective items and the bank (already checked content). No model is called, so there is nothing unchecked to show.
- At End, everything is worked out as before from the whole window. A kept question is used only for a topic the final plan picks, and only if the learner has not been asked it since; otherwise a fresh one is drawn. So the final set covers the whole window exactly as today.
- Nothing is written to the database; nothing is an answered item, a coverage record or a scorecard input. The cache is dropped when the session ends.
- The tier choice (quick, medium, full, none) is unchanged. After the choice all the planned questions are already on the row, so "the rest" is never generated after the first.
- `ENFORCER_PREBUILD=off` turns it off.
- The session bar warms the enforcer page's scripts (prefetch) when opened during a session.

## Measured (test machine, headless Chromium, local server; synthetic learners, 20 min / 14 answers)

- Server End call (`study.end` including the enforcer draft): median about 36 ms both without and with kept questions (a warm server draws fast either way, so that is no gain). The very first End after a server starts is cold: 220 ms in the benchmark (the grade files are read then). Drawing ahead during the session reads those files first, which is where the cold cost moves to; the benchmark did not measure a cold End with kept questions separately. Drawing ahead costs 18-23 ms in the background.
- End click to the enforcer page showing the tier choice: about 310-330 ms; the page's own load event is about 190 ms, the enforcer GET 11 ms. Page load, not drawing, is the remaining cost.
- Tier choice to the first question on screen: 94-156 ms; every planned question is already on the row (the test asserts it). Zero waits.
- Honest reading: the draft was already fast on a warm server, so the measurable gain is small (the moved cold cost, and a set ready before End); the "first question under 300 ms after End" target is met after the choice (94-156 ms), but End to the choice screen is about 320 ms because of a full page load. A learner with a much larger history may see slower drafts; the kept questions help most there.
