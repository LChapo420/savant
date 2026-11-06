# Modification map: every piece of text or behaviour a learner meets, and what changes it

Written 7 Nov 2026 on branch `modify-all`, by reading the code that serves learners and running two scripts over it (which spec fields have a reader; which measures reach a lever). It replaces no earlier doc; where it disagrees with `docs/MODIFICATION-AUDIT-PARTS.md` or the audit on `lesson-goals`, this one was checked later. Everything measured here is SIMULATED learners judged by models, never real people.

"Spec" is `services/learning-spec.js`, built from the 100 scorecard measures (measured value and confidence), age, ESL, interests, dislikes, the tutor's facts and the learner record. The last column is the state before this branch unless it says otherwise.

## 1. The map

| What the learner meets | Where it is made | What changes it today, from which data | Gap |
|---|---|---|---|
| **Lesson, built-in, written for them** (`block_plans` with user) | `block-levels.js` + `block-adapt.js` | Length, blocks, checks, wording, examples, hints in the plan, interests, per-subject wording: the spec, checked once. Opening, story, recap, order, analogy: `BLOCK_APPROACH` (off; failed its gate on `lesson-goals`) | Which facts are stressed: nothing |
| **Lesson, built-in, shared** (`block_plans` no user) | same | Nothing in the text. A short layer on top (`lesson-layer.js`, `INSTANT_LAYER` on) from the spec: hook, why, analogies | The text itself: learner's own rewording is new (section 5) |
| **Base lesson page** (`level_edits`) | `level-editor.js` | The learner brief (`details.js`): spec lines, level feedback taps. Prefetched by the app; the learner cannot ask for it | No direct control existed |
| **Older lesson writer** | `lessons.js` | Spec lines at build; carries `spec_hash` | Never refreshed when the profile moves |
| **Question wording, built-in items** | banks, `item-theme.js` | Interests (`themed_items`) | Otherwise the same for all, by design for measurement |
| **Game question sets, checkpoints** | `game-payloads.js`, `block-checkpoints.js` | Spec, presentation only (format, explanation size, tone, words). Never difficulty or skill | Not re-proven here |
| **Verdict words ("Right." / "Not quite.")** | `player.js`, `checks-common.js`, fixed | **Nothing, for anyone, on every answer** | Filled: part `voice` |
| **Feedback after a session question** (`item.rationale`) | banks; `part-modify.js` `shaped` | `PART_MODIFY` (off): tone, length, language, interests. The same text after right and after wrong | No text differs by the wrong answer chosen |
| **Feedback after a built-in lesson's check** | `block-levels.js answerCheck` | **Nothing reached it: it served `check.rationale` and never asked `rationaleOf`, and `prepareItems` never ran for these items, so `PART_MODIFY` did not touch the main surface** | Fixed on this branch; a plan written for the learner keeps its own text |
| **AI feedback on a typed answer** (`ai_feedback`) | `typed-grading.js` | Written by a model with the learner's brief | |
| **Hint: the stored `item.hint`** | banks; `part-modify.js` | Reaches a learner only when no AI is connected (`routes/learn.js` no-model fallback). Block checks store `hint: ''`, so the hint the block writer is told to write is thrown away | See section 5 |
| **Hint: what a learner really gets** (coach, `/items/:id/coach`) | `ai.coachReply`, `tutor-plan.js` | Teaching brief, `scaffolding.hintLevel`, tutor learner model | Tutor proof: 75% vs other (`PART-MODIFY` table) |
| **Review line with a recall question** | `routes/learn.js` | One fixed sentence, or the writer's own reason | Filled: templates by retention goal and tone (no model) |
| **Review timing, target recall** | `mastery.js`, `retention-goal.js` | `review.spacingScale`, `targetRecall`, memory measures (only here, by rule 03-M5), retention goal | `review.interleaving`, `firstReviewDays`, `typedRecall` are read by nothing |
| **Retention enforcer explanation** | `enforcers.js` | Nothing: `pick.rationale`, stored | Open: not wired |
| **Base-lesson page's own questions** | `routes/base-lessons.js` | Nothing: `question.explanation` | Open (level editor covers a tailored page) |
| **Uploaded course: lesson** | `course-builder.js`; `part-modify.js` | Spec at build; on drift `PART_MODIFY` part `lesson` | Reworked here (section 4) |
| **Uploaded course: questions and their explanations, tests, cards' backs** | `course-builder.js`, `material-test.js`, `material-cards.js` | Spec at build; test size and start from the spec | Never refreshed on drift |
| **Notes, podcast, pack** | `material-notes.js`, `material-podcast.js`, `material-pack.js` | Spec at build, one revision; pack carries `spec_hash` | Never refreshed on drift; a preference reaches the next build |
| **Tutor** | `tutor*.js`, `ai.js` | The fullest: scorecard directives, spec, facts, goals, retention goal | Preference reaches it through the spec |
| **After-session reading** ("Analyzed by the AI tutor") | `ai.js` | Model with the brief | |
| **Session summary, level-close lines** ("You got 3 of 4 checks right") | `session.js`, `block-level.js`, fixed | Nothing | Open: facts and numbers, low value; not filled |
| **Slow-down note, effort notes** | `sessions.js`, fixed | When it fires depends on behaviour; the words on nothing | Open |
| **Today's plan reasons** (`why`) | `daily-plan.js`, fixed with data | Session length and breaks from `spec.session`; words from nothing | Open: facts, little to gain |
| **Progress: path, dashboard, streak** | fixed | `hide_stats` (own switch), nothing from the spec; `engagement.gamification`, `competition`, `milestones` read by no screen | Open |
| **Placement questions and messages** | fixed | Adaptive on answers; nothing else, by design (it measures) | Leave |
| **Error messages** (about 370 in routes) | fixed | Nothing | **Not worth personalising**: they are short, plain and state what happened; say so honestly |

## 2. Measures and fields that reach nothing

Run against the code, not docs (`node scripts/modification-map-readers.js`; the reader test is: the field's name appears in a service or route other than `derive`).

- **Measures:** all 100 have a rule and reach at least one lever with a sentence or a field. Dead measures: none. Three (`retrieval_strength`, `decay_rate`, `retention_index`) act on review timing only, by the owner's 03-M5 rule.
- **Levers with no sentence**, acting only through a field: `reviewSpacing`, `reviewIntensity`, `sessionLen`, `breaks`, `courseSize`. `workedChain` reaches only notes.
- **36 of 111 computed spec fields are read by nothing outside `derive`.** Their levers still reach writers as a sentence, but no code acts on them: `session.hardestFirst`, `review.interleaving`, `review.firstReviewDays`, `review.typedRecall`, `scaffolding.hintsBeforeReveal`, `scaffolding.fade`, `lesson.quickCheckEverySection`, `lesson.restate`, `lesson.recapAtStart`, `lesson.recapAtEnd`, `lesson.storyFrame`, `lesson.whyItMatters`, `lesson.bigPictureFirst`, `learner.readingGrade`, `practice.predictBeforeReveal`, `practice.selfExplain`, `practice.mistakeShown`, `practice.ratePrompt`, `explain.visual`, `explain.conceptFirst`, `explain.patternPointedOut`, `language.defineTerms`, `interests.people`, `interests.identity`, `engagement.competition`, `engagement.milestones`, `engagement.emotionalStakes`, `transfer.variedCases`, `transfer.application`, `transfer.creativeExtension`, `transfer.linkEarlier`, `transfer.connections`, `meta.reflection`, `meta.questionPrompt`, `meta.spotTheInconsistency`, `meta.oneShortAction`.
- **Behaviour no measure moves:** order inside a session (`hardestFirst`), how many hints before the answer, when feedback comes in an ordinary session (the style quiz decides; `feedback.timing` is read only by skill checks and piano), what the screens celebrate.
- **Learner data that reaches little:** the taps after a level (`level_feedback`: too long, too hard) reach the level editor's brief only, never the spec.

## 3. Why strict same-facts came out at 16 of 40

**The judge was right about feedback, wrong to be asked about hints, and over-strict only on the one-line review.**

First the judge was measured, on a hand-written set from real stored explanations (`scripts/fixtures/fact-judge-cal.js`, `docs/part-modify/judge-cal.json`). Pass counts:

| Judge prompt, family | Same text twice (noise) | Clean paraphrase | Planted: changed | Planted: claim added | Planted: point dropped | A comparison added |
|---|---|---|---|---|---|---|
| Strict (the old judge), GLM | 24/24 | 24/24 | 0/24 | 0/24 | 0/10 | 4/7 |
| Strict, DeepSeek | 24/24 | 24/24 | 0/24 | 2/24 | 0/10 | 4/7 |
| Strict, Grok | 24/24 | 24/24 | 0/24 | 0/24 | 0/10 | 4/7 |
| Claim by claim (new), GLM | 24/24 | 24/24 | 0/24 | 0/24 | 0/10 | 7/7 |
| Claim by claim, DeepSeek | 24/24 | 24/24 | 0/24 | 0/24 | 1/10 | 6/7 |
| Claim by claim, Grok | 24/24 | 20/24 | 0/24 | 0/24 | 0/10 | 4/7 |

So the old judge has no noise, no false alarm on a clean paraphrase and catches what is planted. Then I read all 37 pairs myself (`LABELS` in the fixture):

- **Feedback, 6 of 15:** 11 of the 15 rewrites really did add a claim (why a wrong choice fails, a new definition). The strict GLM judge agreed with me on 15 of 15 when re-asked. **The rewrites changed the facts**, and the cause was in the writer's rules: three to six lines demanded of a one-sentence explanation, and a clause required on why a wrong choice fails. Both are gone. The stock phrase "here is the idea" also went: it was the writer quoting its own rule, and its word "idea" tripped the dislike check.
- **Hint, 4 of 14:** the wrong question. A hint is meant to say less than the explanation. It now has its own gate: does it give the answer away, does it state anything false.
- **Review, 4 of 8:** the judge counts a simile as a fact; the real trouble was the text ("Remember the beads now; the beads remember you"). Now from templates, no model.

Fix: a fact gate on every rewrite before it can be served (`factGatePrompt`): the claim-by-claim prompt, read by **two families, both must pass**, and an unreadable reply is a refusal. One family was not enough: DeepSeek passed "Volume = 8 x 5 x 3" for "Volume is length x width x height", and Grok caught it.

Held-out seed 7207, 30 learners, judges that did not guard the rewrite:

| | Before (pm2, sample) | After, every served rewrite |
|---|---|---|
| Feedback, strict judge says same facts | 6/15 | GLM 50/51, DeepSeek 51/51 |
| Feedback, claim by claim | n/a | GLM 51/51, DeepSeek 50/51 (the flag is a comparison from painting miniatures, no fact) |
| Course lesson, strict | 2/3 | 48/48 |
| Course lesson, claim by claim | n/a | 46/48 (I read both: one real slip, "the birth of state sovereignty" for "the starting point of the idea of"; one over-reading) |

**What it cost, honestly: most of the old "fit" was the added material.** Feedback against the stored text fell from 85% to 63% once additions were gone.

## 4. Why 14 of 24 course lessons were declined

Reading the reasons: 6 were the dislike check misfiring (`mentions` matched any word: "told the answer right away" against the word answer, "food examples" against a lesson called How plants make food and the word example). 8 were numbers, and those were true refusals: a formula from the writer's own knowledge (C6H12O6), a dropped molecule count.

Now: a dislike is matched on words the rewrite brought in that say what the dislike is about, and the model gate is given the list, so "like sharing a pizza", which the word check never saw, is now caught. That is a stricter gate on real use, not a looser one. A first redesign (locked sentences, delivery levers only) passed only **5 of 30** once the real fact gate was on: writers kept inventing ("Many towns and farms were damaged", "So the mean is 5"). So the writer no longer writes a lesson. It rewrites **each numbered sentence on its own**; code does the layout from the spec (`lesson.chunkSentences`, numbered steps); a sentence that loses a number goes back to the stored sentence; one comparison is offered apart and dropped first if the gate objects.

Result, three different lessons including one heavy with numbers, 30 learners: **24 of 30 served (was 10 of 24), 0 coverage failures.** The gate was not loosened: it is the stricter one. **But fit does not beat chance** (section 5), so `lesson` is out of the default parts.

## 5. Parts: the gate, blind, two families (SIMULATED learners, AI judges)

Seed 7207, 30 learners with corners (`docs/part-modify/pm3a.json`, `pm3h.json`, `pm3l3.json`; print with `node scripts/part-modify-summary.js`). Writer GLM (lesson: DeepSeek at Gonka). Judges DeepSeek (Gonka) and Grok. p is one-sided against chance. Worst figures are the mean share of the worst learners' verdicts; with 1 to 4 verdicts a learner they are coarse, and with 30 learners the worst 1% is one learner.

| Part | vs stored: DeepSeek / Grok | vs another learner: DeepSeek / Grok | Swap fooled | Noise: two writings, same learner | Worst 10 / 5 / 1% (vs other) | Served | Verdict |
|---|---|---|---|---|---|---|---|
| Review line (template) | 88% (p 4e-5) / 93% (p 4e-7) | 71% (p .02) / 87% (p 3e-5) | 7% | n/a, no model | 0 / 0 / 0% | 30/30 | **Passes. On by default**, `REVIEW_LINE=off` |
| Feedback | 55% (p .42) / 69% (p .03) | 70% (p .03) / 72% (p .01) | 38% | 44% | 0 / 0 / 0%; 6 of 25 learners below half | 51/60 | **Half passes.** Beats chance against another learner by both; against the stored text only Grok. 51 of 102 vs-stored verdicts were SAME. Off by default, on per account |
| Verdict words (template) | 64% (p .21) / 52% (p .50) | 63% (p .18) / 70% (p .06) | 22% | n/a | 0 / 0 / 0% | 29/30 | **Does not pass.** Off (part `voice`) |
| Hint | 44% (p .83) / 51% (p .50) | 67% (p .02) / 58% (p .16) | 35% | 56% | 8 / 0 / 0% | 53/59 | **Does not pass.** Off |
| Course lesson | 53% (p .50) / 41% (p .86) | 63% (p .18) / 65% (p .17) | 41% | 65% | 0 / 0 / 0% | 24/30 | **Does not pass.** Off; facts hold |

The review line's strong result leans on the retention goal being in the profile the judge reads and said in the line. It is a real difference, on one line that carries no subject fact. A same-facts judge flags the goal as new (it is), so those numbers are not applicable to it. It is seen only when a retention question has no reason of its own.

Read as a whole: the per-learner differences that can be made **without adding anything** are small. Reading my sample, feedback rewrites are mostly light rewording. That is the honest size of it.

### Hints: why chance, and the verdict

Three causes. (1) A bug: the rule compared `hintSize` with `'generous'`, a value it never has, so **every learner got the small hint**. Fixed, and it works: judges rate hints written large above small on 11 of 14 items (mean give-away 2.8 against 2.2). (2) The hints were forced through a hobby. (3) Fit still does not beat chance by both families.

**The stored hint is close to nothing in the product:** a learner meets it only when no AI is connected, and a lesson's checks store an empty hint, throwing away what the block writer was told to write. What a learner actually gets as a hint is the coach, which already follows the spec (tutor: 75% against another learner in the 6 Nov run). **Conclusion: this part cannot be personalised usefully as a stored rewrite. Leave it off and treat the coach as the hint.**

## 6. The learner changes a part directly

Before: `level_edits` is a whole page the app prefetches; the learner cannot ask for anything. `level_feedback` taps reach only that page's brief.

Now (`services/part-change.js`, `routes/part-change.js`, `public/js/part-change.js`; `PART_CHANGE=off` removes it): a row **Shorter, Simpler, More examples, Another topic, Put back** under a question's explanation (session, review, a lesson's check), a built-in lesson's reading block and an uploaded course's lesson. Always rewritten from the stored original with everything asked so far, under the same two-family gate. A refusal says so and the text stays. **It sticks:** `profiles.part_prefs` feeds `learning-spec.js` (four new context rules), so later feedback, lessons, notes, tutor and writers follow it; two "too long" taps after levels count as asking for shorter. It is listed on the profile, removable, and covered by export and deletion (`part_changes` registered).

Not reached by the row: notes, podcast, pack, game and interactive blocks, cards, tests. They follow the preference only at their next build.

Gate (`docs/part-modify/pc1.json`, 34 real texts, each change; checked by DeepSeek at Coral and GLM, which did not guard it. DeepSeek is the family of one guard):

| Change | Served | Did what was asked | Independent judges clean |
|---|---|---|---|
| Shorter | 18/34 (6 "already short", 10 refused on facts) | mean 19% fewer words; worst 10 / 5 / 1%: 10 / 9.5 / 9.5% fewer | DeepSeek 18/18, GLM 17/18 |
| Simpler | 33/34 | reading load lower 33/33 | 33/33, 33/33 |
| More examples | 34/34 | longer 34/34 | 34/34, 34/34 |
| Another topic | 22/34 | topic named | 22/22, 22/22 |

Three limits: a third of topic requests are refused; some comparisons are thin ("like a football striker scoring in the third match"); nothing here shows anyone learns better from them. Simulated requests, not real learners.

Clicked through in a real Chrome at 375 x 812 with touch, on a temp copy of the database and a test account made for it (`scripts/part-change-browser-test.js`): course lesson shorter and put back, the topic dialog, a block reworded and kept after reload, a check's explanation, a session question, the profile list and removing a choice; no sideways scroll, no page errors. It found and fixed: Put back always showing (the page's buttons override `hidden`), a double full stop after an answer, a block taking over 90 seconds (now one write), a whole server crash when a session could not be made (`routes/learn.js`).

## 7. PART_MODIFY: the case, with numbers

**Against turning it on by default, for trying it on an account.**

- Facts now hold: strict same facts 101/102 on feedback, against 6/15.
- Fit is half proven: 70% and 72% against another learner, but 55% and 69% against what everyone sees now, and half of those verdicts could not tell them apart. Hints, verdict words and lessons do not pass.
- Cost is one write and two gate readings per explanation per learner, about $0.0006 at list price: small, but for light rewording.
- Each rewrite spends at least 3 calls of the learner's daily AI budget of 120, which my test account hit in testing (every later rewrite was then refused). Background rewrites now stop at half the budget, so the tutor keeps its room; on a heavy day the later questions keep the stored text.
- Its gates run on Grokified and Gonka, cleared for learner data only **until 14 Nov**. After that every rewrite is refused and the stored text stays: safe, but the feature would do nothing at the beta unless the owner clears them (the 10 Nov question).
- No real learner has seen it. None of this says anyone learns more.

**The switch:** `users.part_modify` is `on`, `off` or empty. An account's setting beats the default; `PART_MODIFY=off` stops everyone. Set it at `POST /api/admin/users/:id/part-modify` with `{"value":"on"}`, or `node scripts/part-modify-account.js --email ... --value on`. Default parts are now `feedback,review`; `lesson`, `voice` and `hint` must be named in `PART_MODIFY_PARTS`. I did not touch account 6689. The owner sets that.

Also fixed: `PART_MODIFY` never reached a built-in lesson's checks, the main surface. `answerCheck` served `check.rationale` directly and nothing prepared those items. It does now, for shared plans.

## 8. Still open

Enforcer explanations and base-lesson questions serve stored text. Course question explanations, cards, notes, podcast and pack do not refresh on drift. Summary lines, plan reasons and progress screens read nothing from the learner. No text differs by which wrong answer was chosen. The 36 unread spec fields in section 2 remain.
