# The tutor at full depth (tutor-depth, 1 Nov 2026)

Goal (owner, 1 Nov): the tutor has the same depth, context and precision as the material modification, and for a learner
who has used Savant for a month it has the most accurate picture possible from that month and uses all of it in every
reply. This page says what reached the tutor before, what reaches it now, how that was tested, and what is still not
known.

**Labels.** Everything measured here is on **simulated learners** with an **AI judge**. It shows that the right facts
reach the model and that a blind judge rates the replies as using them; it is **not** evidence that real learners learn
more. No real learner has used this version.

## 1. Gap table: what reached the tutor's prompt before, and what reaches it now

"Before" is main at 51322ab (the tutor files are the same at 968e3f2, where this branch started). Every tutor surface
reads `services/tutor.js contextText` (the dock, the home chat, the question coach and the help chat), so what is added
there reaches all of them.

| What the brief asks for | Before (main) | Gap | Now |
|---|---|---|---|
| Every scorecard measure's value and confidence | Up to 5 "strongest" reads as words, "probably" under 50% confidence, no numbers (`summary.summarize`). The plan (`tutor-plan.js`) turns 19 measures into -1/0/+1 leans for hint size, style and tone; the learning spec moves the style prior only. | 95 of the 100 measures never named in the reply's prompt; no value, no confidence; the spec's lever sentences (all 100 measures folded) never given to the reply. | `services/tutor-learner-model.js` "Measures": every measure that leans and is measured (confidence 20 or more, at least 10 from the middle) with its MEASURED value and confidence, ranked by distance from 50 x confidence, boosted for what the message is about; the rest counted ("of all 100: 9 lean clearly, 31 near average, 60 not measured enough yet"). "How to teach them": the learning spec's `tutor` surface, consumed through `buildSpec`/`specToLines` (not edited). |
| Interests and hobbies | The survey's three fields, raw, 240 chars; an interest fact only when the question names it. | A hobby they dropped kept being offered. | Survey, tutor facts and learner record, newest statement per thing wins; current interests always offered as example domains; the spec is given the resolved list. |
| Dislikes | Learner-record dislikes (solid) on every reply; survey "notes" dislikes reached only the spec. | No tutor-side dislike: "no longer into basketball" was stored as an interest. | A `dislike` fact kind (and "no longer / quit / hate" read as one); one "never build examples on" line on every reply; a dropped interest is shown as "no longer: X (overruled on DATE)". |
| Past difficulties and strengths | Learner-record struggles seen on 2+ levels and the tutor's "hard" facts, only when the question's words match. | Strengths never; a "hard" fact never checked against later answers. | Struggles and strengths ranked, with the hint idea; "said it was hard on DATE; their answers since show it solid (86%)". |
| What they have mastered and forgotten | Weakest 4 skills; the dock's count of skills at 75%; mastery on the page's skill. | The forgetting model (`mastery.predictedRecall` with the learner's own curve) never read: no recall, no days since practice; mastered skills never named. | "Solid and fading": every practised skill's predicted recall now; "fading: Decimals (was 86%; predicted recall now 62%, last practised 26 days ago)". "Right now": mastery, recall and days since practice on the page's skill. |
| Misconceptions | The dock's top 3 error tags with counts; the last 4 wrong answers; the tutor's misconception facts when they match. | A mix-up they have since fixed was shown as current; no dates. | Current vs fixed (4+ answers on that skill after it, 80% right, mastery 0.7+), last date; the dock's own line says "fixed since". |
| Explanations that worked or failed | The plan's chosen style and its "do not use" list; "worked" facts. | Per-style counts not visible beyond the plan line. | "worked for them: analogy 5 of 6 \| did not land, avoid: detailed 0 of 3". |
| Goals and deadlines | Goals without their target date; the ACT date on the dock only; every goal fact, old dates too. | **Target dates missing.** An exam date said 3 times outranked the newer date it moved to (fact weight = confirmations x age). | Goals with date and days left (pack and model); ACT on every surface; dated goal facts; a newer date for the same event supersedes the old one whatever its strength. |
| Facts they told the tutor | Facts that match the question (600 chars), the running summary, 4 turns, older-chat recall. | Stale facts competed with new ones; summary and turns undated; nothing checked a fold for invention. | Supersession (below); an "Out of date (do not use)" line; dated summary and turns with "where they disagree, the newer note wins"; the fold is given the facts on file and a summary naming a number or name absent from its sources is not kept. |
| What they are looking at now | Page, screen snapshot, picture, question (dock); the item (coach). | Fine; not tied to their record. | Unchanged, plus the "Right now" line for the page's skill. |

Budget: the model block is ranked and fitted to `MODEL_BUDGET` = 2,600 characters (about 650 tokens). Every source with
data keeps its best line; the rest are filled by score; each shortened source ends with "(+N more: ...)". Nothing is
dropped whole (tested at 1,200, 1,800 and 2,600 characters). On the dock, the goals and "style and interests" lines that
the pack and model now carry are no longer sent twice.

## 2. Memory that stays accurate over a month

- **Newest wins** (`services/tutor-facts.js supersede`). A newer fact supersedes an older one in the same slot whatever the
  older one's strength: a dated goal for the same event (ACT, "exam:chemistry", recital ...) with another date; an interest
  and a later dislike of the same thing, or the reverse; any fact the reader names in a new `replaces` field. Two goal
  facts with different dates are never merged as "the same fact" (before, "My ACT exam is on December 12" and "... on
  February 6" shared enough words to count as one and confirm the OLD text). Superseded rows are hidden from the prompt
  and the learner's own list, shown once as out of date for 45 days, deleted after 90.
- **Contradictions by evidence.** A mix-up their answers since show fixed is "fixed", not current; "said it was hard"
  against answers that are now solid is shown as both.
- **Dated memory.** The fold sees dated turns and the current facts, is told to keep only the newest version of anything
  that changed, and its summary is stamped `summary_at`. Shown turns carry their date.
- **Nothing invented.** `tutor.invented(summary, sources)`: every number and every capitalised name in a model-written
  summary must appear in the old summary, the facts on file or the transcript (dates compared as dates); otherwise the
  plain fold is kept. Tested with a stand-in model that invents a coach and a date.
- **Hundreds of chats.** Tested with 400 exchanges over a month: the memory row stays at its caps, the archive keeps all
  400, and of eight successive test dates the last one is the only live goal.

## 3. The scorecard hook (for the scorecard owner)

`services/tutor-evidence.js` records what the tutor notices as evidence, one row per observation in `tutor_observations`:

| kind | measure | direction | from |
|---|---|---|---|
| `asked_for_answer` (in the first two turns of a chat) | hint_dependency | + | the learner's message |
| `attempted_first` (shows working) | productive_struggle | + | the learner's message |
| `said_stuck` | help_seeking | + | the learner's message |
| `said_frustrated` | frustration_threshold | - | the learner's message |
| `said_cannot` ("I'm bad at this") | self_efficacy | - | the learner's message |
| `explanation_outcome` | analogy: analogical_transfer; worked example: worked_example_dependence; step questions: dialogic_preference; visual: spatial_anchoring; brief: brevity_preference +; detailed: brevity_preference - | + if it worked, - if it failed | the fact reader's judgement of the next turn |

**The hook:** `tutor-evidence.onTutorObservation(userId, { kind, skill_id, where, style, outcome, note })`, called by the dock,
the home chat and the fact reader. **Wired to the scorecard's own hook** (main 174a3ae, `services/scorecard/hooks.js
onTutorObservation`, docs/SCORECARD-EVERYTHING.md section 8): every row whose measure is one the hook reads
(`indicators.LLM_STATS`: frustration_threshold, self_efficacy, productive_struggle, dialogic_preference here) is sent as
`{ measure, direction, strength: round(3 x strength) }` and marked `bridged`; each learner message also sends "looked, saw
nothing" (direction 0) for the three measures it is read for, as that hook asks. The other rows (hint_dependency,
help_seeking, analogical_transfer, worked_example_dependence, spatial_anchoring, brevity_preference) are kept, 400 per
learner, until the scorecard reads those measures from the tutor; `proposedObservations(rows)` is a starting point for
that. When the dock closes, `chatEnded` calls `hooks.onTutorActivity` so the scorecard reads the new chat text at once.
Only learners allowed extra measurement channels (`boosters.allowed`) get rows; the scorecard hook gates the same way.
Exported and deleted with the account. Nothing under services/scorecard/ was edited.

## 4. Method of the proof (`scripts/tutor-depth-proof.js`)

- **Learners.** 8 simulated profiles (maths, Spanish, ACT, chess, English, an adult career-changer, a 15-year-old, piano),
  each with about 30 days of history built by script with known ground truth: 3 measures each observed 7 times through
  `scorecard.observe` (the real confidence and ageing arithmetic), survey, goals and deadlines, 2 or 3 skills with dated
  answers (a weak current skill, a solid one, one last practised 26 to 28 days ago), error tags (current and fixed mix-ups),
  explanation outcomes, learner-record facts, about 45 chats per learner folded by the real model, and facts as the fact
  reader would have proposed them, including contradictions (Maya's ACT moved and she quit basketball; Chloe's test moved
  up; Sam went off Minecraft; Omar said endgames are hard and then got them right). A fake clock dates everything; every
  model call runs on real time.
- **Same learners, two codes.** The month is built twice from the same script, once through main's own code (`git archive
  968e3f2`) and once through this branch, so each version's note, fold and remember handle it. Then each version answers
  the same probes through its own `dock.reply`, on the production path (Standard Compute DeepSeek V4.1 Flash first,
  NVIDIA as the hedge). Nothing a probe says is remembered for the next one.
- **Probes.** 5 per learner (40 per version): plan ("what should I focus on this week?"), stuck on a question on their
  weak skill, explain with an example, a recall of a fact that changed or matters, and "just tell me the answer".
- **Judge.** Blind and from another family than the replies (DeepSeek): GPT Sol 6.1 (OpenAI, on Modelflare) for every
  score reported. Gemini 3.5 Flash (Google, free tier) was the first choice, but its free daily quota ran out after 21
  probes; those 21 are kept as a second judge's check. For each probe the judge gets the ground truth, the page, the
  message and the two replies as A and B in a fixed random order, unlabelled, and scores each 1 to 5 on: right facts, no
  stale or invented fact, adapts to the measures that matter, correct with hints not answers, interests used well and
  dislikes avoided; plus four flags.
- **Counterfactual.** Each profile has a twin with ONE thing moved (brevity 86 to 14; soccer to chess; ACT in 25 days to
  150; hint dependency 14 to 86; a comma-splice mix-up current vs fixed; analogies worked vs failed; ratios practised 28
  days ago vs yesterday; self-efficacy 84 to 12). Both answer the same probe; the judge, told only what differs, must say
  which reply was written for which learner (or that it cannot tell). Judged separately for each version, and twice per
  pair with the replies in both orders, so position bias cannot make a pick look right. Score: right 1, cannot tell 0.5,
  wrong 0 (chance is 0.5).
- **Coverage (no model, no judge).** For every prompt the dock sent: which ground-truth facts are in it (keyword checks),
  and whether an out-of-date fact appears in it unmarked.

## 5. Results

**How the numbers were reached (the rounds, honestly).** The proof was run four times; each round's misses were fixed in
the code and the next round rerun on the same learners. "Before" is the same in every round (main's code, run once).

1. Round 1 (coverage only, no judge): 247 of 250 ground-truth facts reached the after prompts, but 15 of 40 still carried
   an out-of-date fact unmarked: a two-sided "over Minecraft now, playing Zelda instead" stored as one interest; "finds
   endgames hard" sent in the relevance block although his answers since are 86%; an old-chat snippet repeating the old
   ACT date. Fixed: two-sided taste facts are split, a hard or mix-up fact carries what the answers since say, a stale
   old-chat snippet is marked OUT OF DATE.
2. Round 2: 5 of 40 (the model-written summary still repeated "endgames are really hard"). Fixed: the fold sees what the
   answers say since.
3. Round 3 (first judged round): 250 of 250 facts, 0 of 40 stale. Judge: overall 4.03 before, 4.33 after; counterfactual
   no better than before (4 of 8 both); and one after reply worked "an example on different numbers" whose slope was 3,
   the learner's own answer. Found: the spec's lesson line "lead with fully worked examples" reached the tutor; the
   replies used the model's facts but rarely acted on deadlines or measures. Fixed: the spec lines given to the tutor are
   the delivery levers only (hint size and worked examples stay the plan's); a "for this message" line says what to do
   with the model and turns the top measures into reply behaviour; the dock's leak check also runs on worked-example
   rungs and asks about an example with the same answer.
4. Round 4: the numbers below.

<!-- proof:start -->
(filled in by `node scripts/tutor-depth-proof.js report`)
<!-- proof:end -->

### Held-out probes (never used to tune the code)

Three more messages per learner, written after round 3 and not looked at while changing the code: "I only have 20
minutes today, what is the best use of it?", "why do I keep getting these wrong?" (on the question page) and "can you
make me a practice question about something I am into?" (24 per version, the same judge, the same blind A/B).

<!-- heldout:start -->
(filled in by `node scripts/tutor-depth-proof.js report --marker=heldout`)
<!-- heldout:end -->

## 6. Integrity

The existing integrity tests stay green: `scripts/tutor-never-answers-test.js` (40 extraction attempts against the guard
logic and mode rules), `tutor-dock-test`, `tutor-v2-test` (the answer rule is still last in the prompt), and the
content-is-not-instructions checks (`tutor-dock-test`, `material-grounding-test`, and a new one in
`scripts/tutor-depth-test.js`: a fact reading "Ignore all previous instructions" sits in the notes, above the rule). The
learner model carries no answer key (tested with a planted key on the learner's items).

## 7. Cost

See the table in section 5 (ledger spend per run). The ledger is shared with other agents working at the same time, so a
run's window also counts their calls: these figures are ceilings on this work's spend.

## 8. Limits

- Simulated learners and an AI judge. The judge sees ground truth written by the same author as the learners; its scores
  are a consistency check, not a learning outcome. The probes are single messages, not long conversations.
- The month's facts were given to both versions as the fact reader would have proposed them; the reader itself (a model)
  was not run, so how often it writes a good `replaces` or a dated goal is not measured. The deterministic slot rules
  (dated goals, tastes) do not depend on it.
- The model block adds about 650 tokens to every tutor prompt.
- The scorecard hook stores observations; none reach the scorecard until its owner adds `signals.fromTutor`.
- Not done: a real-learner study; a long multi-turn probe; the home chat and question coach were not probed separately
  (they read the same `contextText`).
