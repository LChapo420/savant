# Built-in levels at the depth of uploaded material: math, English, IQ, Spanish

Written by `scripts/block-depth-doc.js` from `docs/block-depth/*.json` (`scripts/block-sensitivity-proof.js`). **Every proof number is AI-judged on simulated learners (age-14 profiles built from the scorecard), written by MiniMax M3.1 Flash on xKiro (free grant, pipeline use), judged blind by two free models of other families. It is not real-learner proof.** The base level is the same writer with the adapter off (`BLOCK_ADAPT=off`), so before and after share the writer, the judges, the levels and the learners.

## What changed

`services/block-adapt.js` is one adapter from `services/learning-spec.js` to the block lesson/retention writer (`block-levels.js`), the game question writer (`game-payloads.js`) and the checkpoint writer (`block-checkpoints.js`); per-subject wording lives in its `SUBJECT_LINES`. Each call now carries the learner's size (minutes, blocks, graded checks, word budget), examples and worked steps per idea, check formats and difficulty order, hints, explanation detail, interests as the setting (never dislikes) and the subject lines; the fill-out is checked with `checkFollowed` and rewritten once with the problems named (the same machinery as notes and podcasts). Checkpoints get presentation only. Write-ahead writes through the same functions, so it inherits all of it. An empty spec, the shared base level and the owner under the owner-base rule are unchanged: `node scripts/block-diff.js --selfcheck` (in `npm test`) shows identical prompts with the adapter on and off, and `--compare docs/block-diff-base.json` shows 13 of 13 cases byte-identical to the commit before the adapter.

## Proof: share of measures followed (judge verdicts naming the HIGH learner's level)

One level per subject (math 30, English 40, IQ 20, Spanish 8 of their grades), four single measures (brevity_preference, vocabulary_ceiling, interest_transfer, worked_example_dependence), and joint profiles J1-J4 against their mirror. A cell is correct verdicts / all verdicts; "same" and wrong verdicts count against.

| subject | single, adapter off | single, adapter on | joint, adapter off | joint, adapter on |
|---|---|---|---|---|
| math | n/a | n/a | n/a | n/a |
| english | n/a | n/a | n/a | n/a |
| iq | n/a | n/a | n/a | n/a |
| spanish | n/a | n/a | n/a | n/a |
| all | 0/0 (n/a) | 0/0 (n/a) | 0/0 (n/a) | 0/0 (n/a) |

### What the writer did for a learner who needs it short (brevity_preference low against high; plain code, no judge)

| subject | adapter | blocks lo -> hi | graded checks lo -> hi | words lo -> hi | revised |
|---|---|---|---|---|---|
| math | off | not written in this run | | | |
| math | on | not written in this run | | | |
| english | off | not written in this run | | | |
| english | on | not written in this run | | | |
| iq | off | not written in this run | | | |
| iq | on | not written in this run | | | |
| spanish | off | not written in this run | | | |
| spanish | on | not written in this run | | | |

## English game answer keys re-audited (audit gap 10)

Source: a copy of the live database (`copy of data/db.json (16 MB, 2 Nov 13:33)`), all 3500 multiple-choice questions of the 70 English Proficient game levels. Method: `scripts/english-game-key-audit.js` (code check that the explanation describes the keyed option, duplicate options, and a blind answer from NVIDIA Nemotron Ultra blind (judge B GLM 5.3 returned no picks)). A question is counted wrong only on two signals (explanation flag plus the blind judge disagreeing, or duplicate options).

- **Before: 152 wrong or ambiguous keys of 3500 (4%)**, all in the 56 original held games (0 in the 14 regenerated games, which pass the key gate). 17 duplicate-option questions, 223 explanation flags. The blind judge alone disagreed with the key on 502 of 3490 judged questions (about 13% of those are judge false alarms, per the 23 Oct audit).
- **Fix, staged and not applied** (`curriculum-build/staged/content-fixes/english-games-reaudit/rekey.json`): 112 re-keys (the explanation and the blind judge name the same other option) and 40 questions listed for a rewrite (duplicate options or no agreement).
- **After the re-keys, same checks: 40 wrong (1%)**, explanation flags 223 -> 111. The 56 originals stay held (`content/game-holds.json`); the database was only read.
- The second judge (GLM 5.3 on NVIDIA) returned no answers, so the error count rests on one blind judge plus the code check. Not re-solved by a person.

## Not done / honest limits

- The proof is partial wherever a cell says "pairs not written": the free writers and judges (xKiro MiniMax, NVIDIA, Gemini free tier) were rate-limited for hours on 2 Nov, and Modelflare Sol answered 401, so it did not judge. Those cells are not claimed.
- Bank practice items (about 80% of levels) are package E and untouched. Spanish player files (package D) and the sealed Spanish files are untouched.
- Games of math, IQ and Spanish are bank games (computed, no model), so the game lines apply to model-written games only (English); the checkpoint lines apply to every subject.
- No real-learner evidence of learning faster or retaining more exists for any of this.

> **Status when committed (2 Nov 2026, 17:02):** the proof runs had not finished judging, so every proof cell above is n/a: no before/after number is claimed yet. Writing is the slow part (xKiro free-model quota ran out; NVIDIA and Gemini free tiers rate-limited). The finishing chain (scratchpad `blk/final2.sh`) regenerates this page with `node scripts/block-depth-doc.js` once `docs/block-depth/blk-{off,on}-{single,joint}.json` exist; rerun `node scripts/block-sensitivity-proof.js --live --adapter on|off ...` (cached writes are reused) to finish it.
