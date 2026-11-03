# Math game key audit, 3 Nov 2026 (game-key-audit.js, judges: NVIDIA Nemotron Ultra + MiniMax M3.1 Flash)

1133 questions, 3 flagged. Hand-checked; **do not apply rekey.json**.

| row / level | verdict | why |
|---|---|---|
| 105, calculus_i L15 (cart, left sums) | key correct (24 m) | readings at t=0 and t=1 for the two slices: 10 + 14. Both judges summed all three readings (44). Re-keying would introduce an error. |
| 97, calculus_i L14 (runner avg vs instantaneous) | rewrite | key (sped up) is best, but "slowed down on part of the course" is also defensible. |
| 99, calculus_i L17 (accumulating a varying rate) | rewrite | options 0 and 1 are both essentially correct. |

So: 0 wrong keys found, 2 ambiguous questions to rewrite (0.2%). Math games are far cleaner than English (about 4% before the 3 Nov fixes).
Lesson: two agreeing blind judges are not enough on their own to re-key a math item; hand or code check first.
