# Content accuracy guards (2026-10-23)

These guards stop, at the source, the errors the fact audit found in stored content. The audit is in `curriculum-build/CONTENT-FACT-AUDIT.md`.

The audit found three causes:

- **Games.** GLM 5.3 Flash wrote the 70 English Proficient game payloads, and they were imported with no answer check. Their errors:
  - an answer key whose own explanation describes a different option;
  - the same option twice;
  - no right answer, or two right answers.
- **Lessons.** The lesson prompt asked the writer to "name the wrong move and what it produces". The writer then got wrong what the wrong move produces. For example: "adding 7 to both sides of x + 7 = 12 gives x = 19". One check question was also keyed wrong.
- **Block plans.** Some grammar checks were keyed wrong.

Nothing a learner sees has changed. Only the reject-only gate in section 1 is live. Everything else is staged for your approval.

## 1. Live now: a reject-only lesson math gate

**Files:**

- `services/math-claims.js` (new)
- the gate in `services/ai.js`: `validateLesson` calls `checkLessonMath`

**What it does.** It works out again every piece of algebra and arithmetic that a model-written lesson states. It only removes content; it never rewrites anything.

| A false claim in… | What happens |
|---|---|
| a Common Mistakes bullet | That bullet is removed. |
| a check question | That question is removed. |
| a section, the worked example or the summary | The whole lesson is rejected, and the learner gets the bank lesson, as happens today whenever writing fails. |

It also logs one warning line naming each claim.

**What it checks.** Only what computation can settle. Text it cannot parse is left alone.

- **Operation claims, including in wrong work.** "Adding 7 to both sides of x + 7 = 12 … gives x = 19" fails, because that move gives x + 14 = 19.
  - Describing a wrong move is fine. Stating the wrong result of a move is not.
  - It handles moves on one side or the left or right side only, "divide first", term-only slips (these are skipped), two moves at once (skipped) and the "carried across without changing sign" slip.
- **Worked work stated as correct.** Every equation must have the problem's solution, the answer must be that solution, and every arithmetic check must be true.
  - Guess-and-check trials are allowed.
  - So are substitution problems ("2x + 5 when x = 6").
- **Arithmetic stated as true** in the teaching text. A sentence that marks itself wrong ("not", "fails", "instead"…) is skipped.
- **Check questions:**
  - "Solve EQ" must be keyed to the solution.
  - "A student solves EQ and writes x = v. What went wrong?" must be keyed "nothing went wrong" exactly when v is the solution. This is the pattern of audit Q57.

**Measured on stored content (audit DB copy):**

| Set | Size | Flags | Of which false |
|---|---|---|---|
| Stored lessons, every field checked separately (as the gate runs) | 125 | 22 claims in 16 lessons | **0** |
| … of the 95 lessons with no confirmed error | 95 | 1 lesson (lesson 57) | 0. Lesson 57 is a real error of the confirmed kind. |
| Stored items, unique: bank and model-written | 4,101 | 0 | 0 |
| The audit's questions | 4,255 | 1 (audit Q57) | 0 |
| Freshly generated bank math items (24 skills + shapes, 10 difficulties, 25 seeds): prompts, keys and rationales | 11,750 | 0 | 0 |
| Stress test: each whole lesson or plan run as one text | 155 | 21 | 0 |

**What the 22 lesson flags are:**

- 17 of the audit's 31 algebra misstatements.
- Audit Q57.
- 4 errors of the same kind that the audit did not list:
  - lesson 57, bullet 0;
  - lesson 193, bullets 2 and 3;
  - lesson 424, bullet 0.

**Recall:**

- **17 of the 20 audit errors that computation can settle.** It misses:
  - P6: a move with a variable term ("subtracting x");
  - P10: a stray solution with no equation given;
  - P33: "doing the divide", with no number.
- **The other 11 lesson errors are rules stated in words.** Examples: "less than puts the number first", "-graph is a sight root", "the +5 does not get divided". No code check reaches them; they need the staged prompt (section 2) and a judge.

**Replay of the 110 stored model-written lessons through the live `validateLesson`:**

- 94 unchanged.
- 16 lose a false bullet or a mis-keyed check.
- 0 rejected whole.

**Tests:** `scripts/accuracy-guards-test.js`, 53 checks, now in the `npm test` chain. They cover each of the audit's confirmed lesson errors (they must be caught) and correct work of the same shape (it must pass).

## 2. Staged: the lesson-writing prompt

**Patch:** `guards/01-lesson-prompt-labelled-mistakes.patch`. It applies cleanly to the live tree with `git apply -p1`.

**What changes:**

- **Common mistakes have a fixed, labelled form:** "Wrong: <the learner's work, quoted as written>. Why: <which step breaks>. Right: <the correct step, with its result>."
- **The prompt now says:**
  - Quote what the learner writes. Never claim what a move "gives" unless you have worked it out.
  - Doing the same operation to both sides is never a mistake.
  - Every equation after "Right:" is checked by substituting.
  - A "what went wrong" check question must show work that really is wrong.
- **The live gate also drops any common mistake without the "Wrong:" and "Right:" labels.** Unlabelled wrong work reads as a rule.
- **What the learner sees:** `common_mistakes` stays a list of strings, so the lesson page shows the labelled text as it is.

**Trial.** MiniMax M3.1 Flash wrote the same 4 algebra topics with the live prompt and with the staged prompt. The data is in `scratchpad/accuracy-guards/prompt-trial.json`.

| Prompt | Lessons written | Common mistakes | Labelled "Wrong / Why / Right" | False claims found by the verifier |
|---|---|---|---|---|
| Live | 4 | 14 | 0 | **1**: "subtracting 6 from both sides gives 6x = 36" for 6x = 42. This is the audit's pattern; the live gate drops that bullet. |
| Staged | 3 (one reply was unusable JSON) | 10 | **10** | **0** |

The trial is small. It shows that the labelled format is followed and verifies clean, not that the error rate falls.

**One flaw the verifier cannot see.** A staged bullet wrote "Wrong: … so 2x = 17 … Substituting x = 17 gives 39". The learner's x would be 8.5, not 17. The arithmetic is true, but the wrong work is misdescribed. A judge read of Common Mistakes is still worth having.

## 3. Staged: the explanation-key gate at generation

**Files:**

- `services/key-agreement.js` (new, inert): the audit's check, improved.
- The wiring is staged in `guards/02-key-gate-at-generation.patch`. It is off unless `KEY_GATE=on`. It contains:
  - a new `services/key-gate.js`;
  - the game payload writer, both the shared and the tailored paths;
  - lesson check questions in `generateLesson`;
  - block-plan checks in `block-levels.write`.

**Why it is staged, not live.** The flag is deterministic, but it is not clean on good content:

- 0.3% of bank items;
- 4.5% of the objective-pilot keeps;
- 1.0% of generated bank MC.

So a flag never rejects on its own. A flagged question goes to a **blind re-key**: NVIDIA Nemotron Ultra, named explicitly with no fallback chain, a different family from the GLM and DeepSeek writers. The judge never sees the key or the explanation.

| Blind judge's answer | What happens |
|---|---|
| Picks the key | The question is kept. |
| Picks another option | The question is rejected with the reason, then rewritten. Games use the existing patch-rewrite; lessons and block plans drop it, and the reason is listed in the plan's dropped checks. |
| No answer | The question is rejected. It is never kept on no evidence. |

**Changes from the audit's heuristic:**

- An option counts as "quoted" only as a whole phrase. "x = 15" is no longer quoted by "x = 15 - 8 = 7".
- An explanation that names the keyed option is not flagged. Usually it is contrasting the key with a distractor.

**Measured:**

| Set | n | Flagged |
|---|---|---|
| Confirmed wrong keys (`rekey`) | 120 | **106 (88.3%)** |
| All confirmed question errors | 159 | 111 (69.8%). The 13 duplicate-option errors are caught by the live duplicate check instead, so 124 of 159 (78%) are caught together. |
| The audit's judged flags: precision | 125 flagged | **111 real (88.8%)**. The audit's own version: 112 of 131 (85.5%). |
| Bank MC items (known good) | 747 | 2 (0.27%). One of the two is a real bank defect (see below). |
| Objective-item pilot keeps (two judges agreed) | 111 | 5 (4.5%) |
| Generated bank MC with rationale | 2,266 | 22 (1.0%) |
| Model-written questions a judge read and passed | 216 | 14 (6.5%). Some may be errors the judge missed, e.g. "She has ___ every marathon" keyed "has run". |

**The whole gate**, replayed with the blind answers the audit already cached:

- **Confirmed errors:** 23 flagged ones had a cached blind answer. The blind check rejected 22 (96%) and kept 1.
- **Good content:** a false rejection needs a false flag (0.3–4.5%) AND a wrong blind pick. The audit measured Qwen blind at about 3% wrong on good questions. That makes about 0.01–0.15% of good questions sent for a rewrite.

**Bank defect found by the flag:** "Beatriz cleaned the Beatriz calmly yesterday. Which word describes a noun?" keyed "Beatriz". It comes from an English template that put a name where an adjective belongs. It is not fixed here.

## 4. Staged: the game prompt

**Patch:** `guards/03-game-prompt-key-rules.patch`, for `scripts/lib/game-prompt.js`. It applies cleanly.

**What it adds to the game writer's rules:**

- Decide the correct option first, explain that option, then set answerIndex to it.
- Never repeat an option.
- Rewrite a question when two options are defensible, naming the audit's examples: a comma splice is also a run-on; a dash both adds emphasis and sets off extra information.
- No false premises.

## 5. Staged: verified regeneration of the 70 English Proficient games

**Script:** `regen-games.js`. It writes `games/game-<row>.json` and `games/report-*.json`, and nothing else.

- It opens the DB read-only, and refuses unless `DB_FILE` names a copy. It never writes to `data/db.json`.
- It runs with Anthropic's key blanked and Ollama off.

**Pipeline, per question:**

1. **Writer:** MiniMax M3.1 Flash on xKiro's free grant. It uses the level's own game prompt plus the accuracy rules above.
2. **Code checks:**
   - the game checker's per-question checks: shape, a repeated option, the length giveaway;
   - the explanation-key agreement check.
3. **Two blind judges.** Each answers without the key and says whether exactly one option is right. A question is kept only when both pick the key and both say yes.
   - Judge A: NVIDIA Nemotron Ultra.
   - Judge B, a different family: NVIDIA GLM 5.3, else xKiro Qwen3.8 Max or Mistral Large 3 (free), else OpenRouter Gemma 4 31B (`:free`, price verified as $0).
4. **Rewrite.** Questions that fail are written again, up to `--rounds`. Each rejected question is kept in the output with its reason.

- **Resilience.** A judge that fails is asked again after 30, 60 and 120 seconds. The writer retries a "temporarily at capacity" error after 30 and 60 seconds. `--resume` carries on from a row's last staged output.
- **Chunk size.** MiniMax reasons at length before it answers. With 17 questions per call it ran out of tokens and wrote nothing, so the writer now asks for 6 at a time.

**Sample run, 2026-10-23 at about 20:00–20:50 UTC.** Rows 13 (crossy-road, level 15) and 64 (memory-match, level 96). Output: `games/game-13.json`, `games/game-64.json` and `games/report-13-64.json`. Both games are complete, at 50 of 50 questions, with no whole-set problems.

| | Row 13 | Row 64 | Both |
|---|---|---|---|
| Questions written | 60 | 54 | 114 |
| Failed the code checks | 0 | 0 | 0 |
| Kept (both judges picked the key and said exactly one option is right) | 50 | 50 | **100** |
| Keep rate, of all written | 83% | 93% | **88%** |
| Keep rate, leaving out the 5 questions a DNS outage left unjudged | 91% (50 of 55) | 93% | **92% (100 of 109)** |
| Judge A picked the key | 54 of 60 | 54 of 54 | 108 of 114 |
| Judge B picked the key | 50 | 50 | 100 |
| Both judges answered, and picked the same option | 51 of 53 | 50 of 52 | **101 of 105 (96%)** |

**Rejections:**

- 5 rejections were judge picks of another option. One was a real two-defensible-options question that both judges caught.
- 9 rejections had no verdict. 5 of these came from the DNS outage; in the other 4, Lightning skipped an index.

**For comparison, the stored versions:** the audit confirmed 3 errors in stored row 13 and 12 in stored row 64. Those are lower bounds.

**Code checks:**

- No written question failed them. The accuracy rules in the prompt worked: no repeated options, and no explanation describing another option.

**Judge B's independence was weak this time:**

- **Who answered.** Every judge-B verdict came from NVIDIA Nemotron 3.5 Lightning, which is the same family as judge A.
- **Why.**
  - GLM 5.3 was 429 (it was skipped, so it was not hammered).
  - xKiro's free day was used up (444K of 450K).
  - OpenRouter's Gemma `:free` returned 429.
- **Before applying.** Re-judge the 100 kept questions with Qwen3.8 Max after xKiro's 00:00 UTC reset. That costs about 15K tokens.

**Cost:**

- MiniMax: about 130K tokens for the finished sample. The whole run, including the failed 17-question attempts and the prompt trial, used about 680K tokens of the 60M grant.
- Nemotron Ultra: 18K tokens.
- Lightning: 29K tokens.
- Anthropic: $0.
- Time: 18 minutes for the resumed part.

**Scaling to all 70 games:** about 15 to 20 minutes per game at this pace, so about 20 hours of free model time. Run it in nightly batches with Qwen as judge B.

## Backups and tests

- **Backups:** `scratchpad/before-accuracy-guards/` holds `services/ai.js`, `game-payloads.js`, `block-levels.js`, `lessons.js`, `block-checkpoints.js`, `package.json` and the DAYRUN file. It also holds the md5 of `data/db.json`, which is unchanged.
- **Full `npm test` chain:** run one script at a time on a copy of `data/db.json`, with keys blanked and `OLLAMA_ENABLED=0`. `ollama-provider-test` ran without that variable.
  - **Live tree:** 32 of 32 pass, including the new `accuracy-guards-test`.
  - **Scratch copy with patches 01, 02 and 03 applied:** 32 of 32 pass with `KEY_GATE` off, and with `KEY_GATE=on`. The staged `scripts/key-gate-test.js` passes 5 of 5.
  - **Patches:** all three apply cleanly to the live tree with `git apply --check -p1`, and in order (01, then 02, then 03).
- **Bank template defect** found by the key-agreement flag. "Beatriz cleaned the Beatriz calmly yesterday. Which word describes a noun?" is keyed "Beatriz". It comes from an English adjective template. It is not fixed here.
