# Built-in levels at the depth of uploaded material: math, English, IQ, Spanish

Written by `scripts/block-depth-doc.js` from `docs/block-depth/*.json` (`scripts/block-sensitivity-proof.js`). **Every proof number is AI-judged on simulated learners (age-14 profiles built from the scorecard), written by MiniMax M3.1 Flash on xKiro (free grant, pipeline use). Judges: Nemotron Ultra and MiniMax M3.1 Flash on NVIDIA (free; the second is the family of the writer, so treat it as weaker). Gemini and xKiro judges hit their free quotas and Modelflare Sol had no quota left. The numbers are PARTIAL: only the pairs whose levels were written and judged before the deadline are counted (the cells give the counts), and not every verdict has both judges. It is not real-learner proof.** The base level is the same writer with the adapter off (`BLOCK_ADAPT=off`), so before and after share the writer, the judges, the levels and the learners.

## What changed

`services/block-adapt.js` is one adapter from `services/learning-spec.js` to the block lesson/retention writer (`block-levels.js`), the game question writer (`game-payloads.js`) and the checkpoint writer (`block-checkpoints.js`); per-subject wording lives in its `SUBJECT_LINES`. Each call now carries the learner's size (minutes, blocks, graded checks, word budget), examples and worked steps per idea, check formats and difficulty order, hints, explanation detail, interests as the setting (never dislikes) and the subject lines; the fill-out is checked with `checkFollowed` and rewritten once with the problems named (the same machinery as notes and podcasts). Checkpoints get presentation only. Write-ahead writes through the same functions, so it inherits all of it. An empty spec, the shared base level and the owner under the owner-base rule are unchanged: `node scripts/block-diff.js --selfcheck` (in `npm test`) shows identical prompts with the adapter on and off, and `--compare docs/block-diff-base.json` shows 13 of 13 cases byte-identical to the commit before the adapter.

## Proof: share of measures followed (judge verdicts naming the HIGH learner's level)

One level per subject (math 30, English 40, IQ 20, Spanish 8 of their grades), four single measures (brevity_preference, vocabulary_ceiling, interest_transfer, worked_example_dependence), and joint profiles J1-J4 against their mirror. A cell is correct verdicts / all verdicts; "same" and wrong verdicts count against.

| subject | single, adapter off | single, adapter on | joint, adapter off | joint, adapter on |
|---|---|---|---|---|
| math | 6/6 (100%) | 6/6 (100%) | 11/12 (92%) | 11/12 (92%) |
| english | 4/4 (100%) | 3/4 (75%) | 7/8 (88%) | 10/12 (83%) |
| iq | 3/3 (100%) | 2/2 (100%) | n/a (3 of 4 pairs not written) | 7/8 (88%) |
| spanish | 2/2 (100%) | 3/3 (100%) | 8/8 (100%) | n/a (1 of 4 pairs not written) |
| all | 15/15 (100%) | 14/15 (93%) | 26/28 (93%) | 28/32 (88%) |

**Reading (partial, AI-judged, simulated):** the direction-correct share with the adapter on is not higher than with it off in these counts; both are high because the base learner brief already carries the level lines. These numbers do NOT show a gain from the adapter. What is shown elsewhere is structural: the size, formats and wording lines change with the spec (`scripts/block-adapt-test.js`), a short-attention learner got 4 blocks/541 words against 9 blocks/1053 words in the English smoke run, and base prompts are unchanged for an empty spec.

Planted swap: NOT RUN (the judges were rate-limited and the deadline came first).

### What the writer did for a learner who needs it short (brevity_preference low against high; plain code, no judge)

| subject | adapter | blocks lo -> hi | graded checks lo -> hi | words lo -> hi | revised |
|---|---|---|---|---|---|
| math | off | 9 -> 5 | 3 -> 3 | 859 -> 501 | no |
| math | on | 8 -> 5 | 3 -> 2 | 598 -> 384 | no |
| english | off | 10 -> 7 | 3 -> 2 | 1181 -> 988 | no |
| english | on | 5 -> 5 | 3 -> 2 | 785 -> 671 | no |
| iq | off | 9 -> 8 | 3 -> 2 | 993 -> 677 | no |
| iq | on | 8 -> 5 | 3 -> 2 | 970 -> 631 | no |
| spanish | off | 10 -> 9 | 3 -> 2 | 1142 -> 535 | no |
| spanish | on | 8 -> 4 | 3 -> 2 | 693 -> 418 | no |

## English game answer keys re-audited (audit gap 10)

Source: a copy of the live database (`copy of data/db.json (16 MB, 2 Nov 13:33)`), all 3500 multiple-choice questions of the 70 English Proficient game levels. Method: `scripts/english-game-key-audit.js` (code check that the explanation describes the keyed option, duplicate options, and a blind answer from NVIDIA Nemotron Ultra blind (judge B GLM 5.3 returned no picks)). A question is counted wrong only on two signals (explanation flag plus the blind judge disagreeing, or duplicate options).

- **Before: 152 wrong or ambiguous keys of 3500 (4%)**, all in the 56 original held games (0 in the 14 regenerated games, which pass the key gate). 17 duplicate-option questions, 223 explanation flags. The blind judge alone disagreed with the key on 502 of 3490 judged questions (about 13% of those are judge false alarms, per the 23 Oct audit).
- **Fix, staged and not applied** (`curriculum-build/staged/content-fixes/english-games-reaudit/rekey.json`): 112 re-keys (the explanation and the blind judge name the same other option) and 40 questions listed for a rewrite (duplicate options or no agreement).
- **After the re-keys, same checks: 40 wrong (1%)**, explanation flags 223 -> 111. The 56 originals stay held (`content/game-holds.json`); the database was only read.
- Second blind judge (MiniMax M3.1 Flash on NVIDIA) answered 128 of the 152 flagged questions. **90 re-keys are confirmed** by both blind judges and the code check (staged in rekey-confirmed.json); **62 go to rewrite** (rewrite.json). Sol, the intended second judge, had no quota left (Modelflare 403), so per the build rule nothing was applied: the live database was only read and the 56 originals stay held. Not re-solved by a person.

## Not done / honest limits

- The proof is partial wherever a cell says "pairs not written": the free writers and judges (xKiro MiniMax, NVIDIA, Gemini free tier) were rate-limited for hours on 2 Nov, and Modelflare Sol answered 401, so it did not judge. Those cells are not claimed.
- Bank practice items (about 80% of levels) are package E and untouched. Spanish player files (package D) and the sealed Spanish files are untouched.
- Games of math, IQ and Spanish are bank games (computed, no model), so the game lines apply to model-written games only (English); the checkpoint lines apply to every subject.
- No real-learner evidence of learning faster or retaining more exists for any of this.
