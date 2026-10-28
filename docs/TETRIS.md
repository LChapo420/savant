# Tetris base engine

The reusable fragment is `public/games/engines/tetris.html`. Questions still
come exclusively from `window.GAME_DATA`, injected at `/* __DATA_INJECTION__ */`
by `services/game-payloads.js`. The matching question schema supplies the game
mechanic requirements to `scripts/lib/game-prompt.js`; no model generates the
game's logic, controls, physics or scoring.

## Gameplay

- A 10×20 board, seven tetrominoes drawn from a shuffled seven-piece bag,
  gravity, collision detection, clockwise/counterclockwise rotation with simple
  wall/floor kicks, a ghost landing outline and next-piece preview.
- Arrow keys move/soft-drop; Up or X rotates clockwise, Z counterclockwise,
  Space hard-drops, P or Escape pauses. Focus the board for keyboard play.
  On-screen buttons support touch. Grounded pieces have a 500ms lock delay,
  with at most 15 grounded movement/rotation resets per piece.
- A full horizontal row disappears immediately. Gravity and controls pause for
  **one question per cleared row**, including double, triple and four-row clears.
  A correct answer banks 100 points; a wrong answer leaves the row cleared but
  banks nothing. Continue keeps feedback readable before the next question or
  piece. All questions earned by a multi-clear are asked, even beyond the goal.
- Five or more clears complete the round. A blocked spawn/above-board lock loses;
  Finish ends early as a draw. Completing a round is not a claim that every
  question was correct: the surrounding site's server-side mastery rules still
  decide whether the learner advances.
- Play again resets the board, points and round counters, **not** the shared
  question cursor. The shell persists that cursor across reloads, and wraps the
  pool only after exhausting it. With no shell, an in-memory cursor is used.
- Switching tabs or losing window focus pauses. Reinitialization and page exit
  remove timers/listeners so replay cannot accelerate gravity or double-score.

## Integration and verification

The engine keeps `window.initGame(payload)`, `window.GAME_ID`, the injection
marker, shared cursor, shell-provided Next level link, and `game:start`,
`game:answer`, `game:win`, `game:lose`, `game:draw` events. Answer events carry the
original question id/index, chosen choice, correctness and answer time. Points
and line counts are gameplay telemetry, not authoritative learning grades.

`window.PolymathTetris.createModel()` exposes the curriculum-independent model
for tests. Its board/active piece are not a server-side authority. Rendering
uses DOM elements rather than canvas and inserts question content as text.

Run `npm run test:tetris` or `node scripts/check-game-engine.js tetris`.
Tetris uses its own physics-aware harness because the generic game validator
expects a question before any gameplay. The standard `npm test` includes it.

This is an educational Tetris-style engine, not a full official competitive
Tetris ruleset: no hold, T-spin/combo scoring or full SRS rotation tables.