# Requested game corrections

This checklist is the acceptance contract for the next revision. Shared payload,
question cursor, answer events, pause, cleanup and course integration stay intact.

- Hangman: correct question unlocks one letter; ordinary letter misses/gallows.
- Pinball: larger portrait machine, immediate held flipper input, machine geometry.
- Ring toss: drag/release throw; bottle letter chooses answer; short/long miss retries same question.
- Coin: selectable wager, heads wins wager, tails loses wager, zero resets to five;
  ten correct or 100 points offers Continue/Next.
- Snake/Crossy/Maze: remote-shaped D-pad and keyboard directions; slower traffic.
- Snakes/ladders: connected ladders/slides, animated dice with final face.
- Mancala: wood board, stone dots, store-ending sow gives ungated extra turn.
- Archery: wind direction/speed, black crosshair, brown arrow projectile.
- Pool: cue stick, legal rack, real bot shots; own pot earns ungated extra shot.
- Maze: two original connected mazes, infinite question-gated extra lives.
- Bike: original terrain motorcycle physics, throttle/brake/lean, question revive.
- Blackjack: 100 coins, wagers, ordinary 21, wrong questions only retry;
  five hands offers Continue/Next.
- War: graphical card faces, unchanged game rules.
- Trash: bot follows each completed user turn; duplicate card triggers question.
- Simon: bright glow during sequence.
- Spot-it: actual 4.5-second deadline, question-gated steal after bot timeout.
- Free throw: bounded power bar and visible trajectory preview.
- Air hockey: center-only goals, 2D striker movement confined to own half.
- Duck hunt: lettered moving ducks choose displayed answer; misses retry unchanged;
  wrong changes question, seven hits offers Continue/Next.
- Flag: bot follows every second user move, and every wrong answer.
- Platformer: six original side-view stages, NES-style controls, question revive.
- Bingo: normal column-banded card and called balls, gate only owned numbers;
  wrong question retries same called number.
- Memory: reveal two per turn, gate next turn, match grants free turn;
  incorrect question retries until correct.
- Uno: full two-player numbered/action/wild deck, normal draw penalties;
  questions unlock draws and wrong questions retry, not evade penalty.
- Bowling: position, angle, power and pin-to-pin collisions.
- Breakout: five layouts or ten correct unlock Continue/Next.
- Yahtzee: free three rolls with holds; question after round, held dice unchanged.

Exact proprietary artwork, source and stage maps are not shipped. Bike, maze and
platformer use original assets/layouts, explicitly labeled rather than claimed
to be exact copies of Moto X3M, Pac-Man or Super Mario Bros.

## Verification and boundaries

The correction acceptance tests are in `scripts/remade-games-test.js`. They
exercise actual letter unlocks, wager losses and zero reset, repeat questions,
free mancala/pool turns, pool rack identity, 4.5-second timeout, center-only goals,
infinite maze revives and reachable dots, live duck misses, held pinball input,
three dice rolls/holds, and Continue-playing milestones. The Chrome harness
also executes seven corrected interactions and eight mobile layout checks.

`npm test` includes existing site checks, all 40 gameplay tests and the lesson/lab
integration checks. `npm run test:games:browser` uses a separately started Chrome
debugging instance on port 9227. These tests do not certify every possible full
game or make a universal no-glitches guarantee.

Remaining intentional differences: the platformer/bike/maze are original games,
not exact stage replicas. Blackjack currently supports wager/hit/stand with
standard totals and payouts but not split, double-down or insurance. Bowling
has pin collision physics and tenth-frame bonus balls but reports pin totals,
not full tournament strike/spare bonus scoring. The UNO-style implementation
has standard card types and gated mandatory draws, but not every optional online
house rule, challenge dialog or commercial UI. These differences must not be
represented as exact copies or complete rulebook parity.