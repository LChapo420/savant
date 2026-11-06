# Modification audit, section 7: part by part, what changes it, and what is proven

Written 6 Nov 2026 on branch `mod-wiring`. This is the table the owner asked for ("every single little bit can be changed"), meant to be **appended as section 7 of `docs/MODIFICATION-AUDIT.md`** (that file lives on branch `lesson-goals`; it is kept apart here so the two branches merge without a conflict). It continues that audit's section 4 ("measures that reach nothing, and parts no measure reaches").

Everything below is **SIMULATED learners (`scripts/lib/extreme-learners.js`, held-out seed 6106, 24 learners: tails, contradictory mixes, ages 8 to 70, English learners, unusual hobbies and dislikes) judged blind by AI models. It is not a result on real people.** Run: `node scripts/part-modify-proof.js --parts feedback,hint,review,lesson,tutor --n 24 --items 2 --tag pm2`; numbers in `docs/part-modify/pm2-final.json` (first, feedback-only run before two fixes: `pm1-first-run-feedback-only.json`).

## What was wired (new in this branch)

| Part | Was | Now | Switch |
|---|---|---|---|
| Feedback after a check (the stored explanation) | the same text for everyone; `spec.feedback` (length, tone, correction style, low stakes) read by nothing at serve time | rewritten once per learner in the background when the question is shown; the stored text is served until it is ready (never blocks); held to the facts (numbers kept, none added, the answer kept, no profile talk, no avoided domain, at least 55% of the original's own points) | `PART_MODIFY=on` (default off), part `feedback` |
| Review line shown with a recall question (`Recalling it now is what moves it into next week.`) | one fixed sentence | rewritten for the learner, and for a test date or horizon goal | `PART_MODIFY=on`, part `review` |
| Hint (stored item hint, coach fallback) | one text | rewritten for the learner (hint size, tone, language) | part `hint`: **off even with PART_MODIFY=on** (not proven, below) |
| Uploaded-course lesson text, after the profile moved | written once at build; a later profile change never reached it (audit section 3) | the build records the spec's signature; when the profile has drifted (and at most once a day) the lesson paragraphs are rewritten in the background; questions, quotes and key points untouched; old paragraphs kept (`lesson.prev`); never blocks | `PART_MODIFY=on`, part `lesson` |
| Tutor: retention goal | the tutor model knew study goals and the ACT date, not "remember this for a test on D / for a year" | listed with the learner's goals: a test within 21 days says to stress what the test asks and the shortest way to recall it | `TUTOR_GOAL=off` removes it (on) |
| Built-in lesson writer: retention goal | not reached | one line to the fill call (a test within 30 days: after each idea, the one thing to recall; a long horizon: one thing to carry away) | `BLOCK_GOAL=on` (**off**: no lesson-level proof was run) |
| When a stored built-in level is written again (`block-levels.js retailor`, background, 24 h apart, old version served until the new one is servable) | the signature compared numbers only: a new dislike, a swapped interest or ESL support never moved it | the signature also holds which interests are used, which domains are avoided and ESL; a new thing to avoid moves a level on its own, any other change of the set counts as one big move (two re-tailor); signatures from before are never compared on sets (no mass rewrite of stored levels) | `SPEC_SIG_SETS=off` (on) |

`PART_MODIFY_PARTS` (default `feedback,review,lesson`) names the parts that run when `PART_MODIFY=on`. Under-13 accounts follow the usual outside-AI consent rule because the call goes through `services/ai.js`. The rewrite is stored on the learner's own item row (`shaped`) or the course row, so account export and deletion already cover it. Nothing here touches account 6689 or the sealed Spanish files.

## The table: part, what changes it, proven or not

"Own version" = share of blind verdicts that pick the text written for that learner. "vs stored" = against the text everyone saw before; "vs other" = against the same text rewritten for another extreme learner (the harder test). "Swap fooled" = a judge shown the other learner's profile with the same two texts picked the first learner's version anyway (chance 50%, a judge who reads the profile should stay below it). "Control" = a third learner's profile shown: share picking the first learner's version, ideally near the swap figure. Judges: ZeroGPU GLM-5.3 Flash, Coral DeepSeek V4.1 Flash, Gonka DeepSeek V4 Flash, 6000 output tokens each, one retry on an empty reply (1 empty verdict among about 1,400 judge verdicts in the final run, against most pairs lost in the earlier run; the writer's and judges' empty replies are retried, and the retries show up as errors in the JSON).

| Part | What changes it | Arm | Verdicts | Own version | Swap fooled | Control | Worst 10% / 5% / 1% of learners | Proven? |
|---|---|---|---|---|---|---|---|---|
| Feedback after a check | feedback_granularity, praise and warmth, gentleness, evaluation anxiety (low stakes), vocabulary ceiling, ESL, interests, dislikes, retention goal | vs stored | 117 | 85% (p 9e-16) | n/a | n/a | 41 / 37 / 33% | **Yes, simulated** (shape of the claim: the text moves toward the learner) |
| | | vs other | 85 | 66% (p 2e-3) | 34% | 37% | 33 / 33 / 33% | |
| Review line | the same, plus the retention goal | vs stored | 65 | 71% (p 6e-4) | n/a | n/a | 0 / 0 / 0% (1 to 3 verdicts per learner) | **Yes, simulated**; weak at the tail |
| | | vs other | 60 | 67% (p 7e-3) | 27% | 47% | 0 / 0 / 0% | |
| Hint | hint size, scaffolding, tone, language | vs stored | 123 | 51% (p 0.43) | n/a | n/a | 6 / 0 / 0% | **No.** Indistinguishable from chance; switched off |
| | | vs other | 111 | 53% (p 0.28) | 45% | 40% | 8 / 0 / 0% | |
| Uploaded-course lesson (rewrite on drift) | the whole learning spec | vs stored | 30 | 83% (p 2e-4) | n/a | n/a | 33 / 33 / 33% | **Partly.** 10 of 24 learners got a rewrite that passed the gates (the other 14 keep the stored lesson: new numbers, a dropped number, or an avoided domain); vs other has 9 verdicts (78%, p 0.09), too few |
| | | vs other | 9 | 78% (p 0.09) | 33% | 56% | 33 / 33 / 33% | |
| Tutor (coach system prompt: scorecard, spec, interests, dislikes, ESL, goals) | everything in `teachingBrief` and the tutor learner model | vs other | 60 | 75% (p 7e-5) | 18% | 42% | 17 / 0 / 0% | **Yes, simulated** (20 learners, one question) |
| Tutor, retention goal (test in 10 days vs none, same learner) | the new goal item | goal vs none | 90 | 74% (p 2e-6) | n/a | n/a | n/a | **Yes on a study-plan question; not on "I am stuck"** (the first run, stuck probe only: 47% of 32, chance) |
| Built-in lesson: length, blocks, examples, interests, hints, wording | `block-adapt.js` from the spec | | | | | | | wired before this branch; proof method in `scripts/block-sensitivity-proof.js`; **not re-run here** |
| Built-in lesson: opening, story, recap, order, analogy, layout | `approachLines` (branch `lesson-goals`) | | | | | | | wired there; **not re-run here** |
| Built-in lesson: retention goal line | `BLOCK_GOAL=on` | | | | | | | wired, **unproven** |
| Study notes, podcast, pack (uploaded material) | the spec, at build | | | | | | | wired before; **not re-run here**; a profile change later does **not** rewrite them (they carry `spec_hash`, nothing refreshes them) |
| Older lesson writer (`lessons.js`) | the spec, at build | | | | | | | wired before; carries `spec_hash`; **no refresh on drift** |
| Game question sets, checkpoints | the spec (presentation only) | | | | | | | wired before; **not re-run here** |
| Review timing and target recall | retention goal, memory measures | | | | | | | code path, by the owner's 03-M5 rule; not a text change |

## Facts: no worse through the gates

- Every rewrite goes through the part's own gate before it can be served: every number of the original kept (list markers and number words aware), no number added, the answer kept (feedback) or never given (hint), no talk about the learner's profile, no avoided domain, a length per the learner's feedback detail, sentence length, and for a lesson `checkFollowed`'s key-point coverage (0 coverage failures among the 10 that passed). A rewrite that fails is not served and the stored text stays. Declined: feedback 8/48, hint 7/48, review 2/24, lesson 14/24. Reasons are in the JSON (`facts.declined_because`), the largest: an avoided domain that the topic itself touches ("food examples" against photosynthesis, "money problems" against percentages), a number added (a count the writer made up), a number dropped.
- Judge "contradicts the original or the correct answer, or states a false claim" (Coral DeepSeek, a sample of one learner in three): **0 of 9 feedback, 0 of 14 hint, 0 of 8 review, 0 of 3 lesson**.
- Judge "states the same facts" (stricter: an extra comparison, a spelled-out step or a dropped side remark counts as different): feedback 6 of 15, hint 4 of 14, review 4 of 8, lesson 2 of 3. **This is a miss against the strict reading.** Read the examples below: the differences I saw are an analogy from the learner's interest, a step spelled out, or a clause about a wrong choice. The mechanical gate cannot see an added claim that contains no number, so `PART_MODIFY` stays **off by default** until the owner decides whether the strict reading matters.
- The first feedback run (`pm1-first-run-feedback-only.json`, 24 learners) showed the writer inventing "tempting wrong ideas" that were not in the item; the rule now says to use only the listed wrong choices, forbids "next time" tips, and a content-coverage gate was added. Feedback went from 88% / 65% (vs stored / vs other) to 85% / 66%: the stricter writer rules cost nothing measurable.

## Actual text differences (from `pm2-final.json`)

Feedback (x6106-0: age 58, crochet, roller derby; dislikes competitive framing; formal, brief; against x6106-3 and others):

- Stored: *Taking one rocket away from five leaves four, so the next number word is four.*
- For x6106-0: *Here is the idea: taking one rocket away from five leaves four, so the backward count moves from five to four.*
- For another learner: *Counting backward means saying one less each time. Five rockets with one taken away leave four rockets. So the number word after five, going backward, is four.*

Feedback (x6106-3: age 10, English second language, Vietnamese; dislikes repetition drills, food examples):

- Stored: *Counting the beads in the three color groups gives 1 yellow, 2 blue, and 3 red beads.*
- For x6106-3: *Count the beads in each color group. That gives 1 yellow, 2 blue, 3 red. The other choices swap the beads between colors.*
- For another learner (interests anime): *...gives 1 yellow, 2 blue, and 3 red beads. It is like sorting anime character parts into separate piles before drawing...*

Review line (stored for everyone: *Recalling it now is what moves it into next week.*):

- x6106-0 (crochet): *Here is the idea: recalling this volume work now, much as a crocheter repeats a stitch, keeps it available next week.*
- x6106-2 (drone racing): *Recalling it now is what moves it into next week, like a drone racer drilling a gate until it is automatic.*

Lesson (photosynthesis, one stored lesson; x6106-7 is age 8, mushroom hunting): short sentences, one idea per line and a basket analogy, against x6106-4's version that opens with *This lesson explains how plants make their own food...* and a "why it matters" paragraph. Full texts are in the JSON.

Tutor (same question, same message "I am stuck on this one"): one learner gets *Volume just means how many unit cubes fit inside the box, so we build it up one layer at a time...* in two sentences with a question back; the next gets a longer structured walk-through with a takeaway line and a worked "because the floor is 3 long and 2 wide" step. Retention goal twin, study-plan question, same learner: the 10-days version adds *the same reasoning tells you how much a storage bin can hold* and a recall-first plan.

## Not done, not proven, honest limits

- **Hint is not proven** (51% / 53%, chance). The hint texts are one or two sentences and the profile the judges see rarely names a hint preference; it may be real and too small to see with 24 learners, or absent. It stays off.
- **Review and the worst tail:** each learner has one to three verdicts, so "worst 10% / 5% / 1%" are 0% for review and tutor. With 24 learners the worst 1% is one learner. These are not stable tail estimates.
- **Lesson:** a 58% decline rate means most extreme learners would keep the stored lesson until the gate passes on a later try; the claim is "when it is served, it fits", not "every learner's course follows their profile".
- **The retention goal changes the tutor on a plan question, not on an "I am stuck" question, and not (proven) any lesson text** (`BLOCK_GOAL` off).
- **Language:** there is no native-language field. "Language" in the spec is plain-language level and ESL support (`spec.language`), and that is what moved the texts above (the ELL learners in the draw). Translation into a learner's first language does not exist.
- **Not wired:** notes, podcast and pack do not refresh when the profile changes (only the course lessons do); the older lesson writer's pages do not either; which facts a lesson stresses still comes from the material, not the learner (section 4 of the audit); the tutor's lesson length.
- Judges are models. The writer for hint, feedback and review is ZeroGPU GLM-5.3 Flash (the GLM judge shares its family: reported separately, it is the most favourable judge in most rows; the DeepSeek judges are another family and are lower, as the per-judge column shows). The lesson writer is Coral DeepSeek V4.1 Flash because GLM spent its whole output budget on reasoning for the 6000-character spec block (finish_reason length, empty reply).
- Spend: ZeroGPU, Gonka and Coral only, through their ledgers (`RUN_CAP_USD=5` never stopped a call; about 2,900 calls in all). Ledger totals after the last run (all use, not just this run): ZeroGPU $4.15 of $245, Gonka $7.49 of $50, Coral $10.39 of $100.
