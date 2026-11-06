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
| **Hint: the stored `item.hint`** | banks; `part-modify.js` | Reaches a learner only when no AI is connected (`routes/learn.js` no-model fallback). Block checks store `hint: ''`, so the hint the block writer is told to write is thrown away | See section 4 |
| **Hint: what a learner really gets** (coach, `/items/:id/coach`) | `ai.coachReply`, `tutor-plan.js` | Teaching brief, `scaffolding.hintLevel`, tutor learner model | Tutor proof: 75% vs other (`PART-MODIFY` table) |
| **Review line with a recall question** | `routes/learn.js` | One fixed sentence, or the writer's own reason | Filled: templates by retention goal and tone (no model) |
| **Review timing, target recall** | `mastery.js`, `retention-goal.js` | `review.spacingScale`, `targetRecall`, memory measures (only here, by rule 03-M5), retention goal | `review.interleaving`, `firstReviewDays`, `typedRecall` are read by nothing |
| **Retention enforcer explanation** | `enforcers.js` | Nothing: `pick.rationale`, stored | Open: not wired |
| **Base-lesson page's own questions** | `routes/base-lessons.js` | Nothing: `question.explanation` | Open (level editor covers a tailored page) |
| **Uploaded course: lesson** | `course-builder.js`; `part-modify.js` | Spec at build; on drift `PART_MODIFY` part `lesson` | Reworked here (section 3) |
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
