# The next six features

Requested 2026-09-26, in one batch. Each is real work; together they are more
than one sitting. This is the order I would build them, what each one actually
involves, and what has to be decided or paid for before it can start.

Everything here assumes the account has credit — see "Blocked on credit" at the
bottom, which currently applies to all of it.

---

## 1. Checkpoint retry, or learn the gap — **BUILT**

Shipped 2026-09-26. `services/remediation.js`, `routes/remediation.js`,
`public/help.js`, and the retry path in `services/sessions.js`. See the
"Not passing a checkpoint" section of the README for the behaviour.

Three things came out differently from the plan above:

- **The cooldown is gone entirely**, not narrowed to "retry without learning". It
  existed to stop someone grinding the same quiz until the random draw was kind,
  and every attempt after the first is now a different quiz, so it was guarding
  against something that no longer exists. A wait would also have contradicted
  the whole point of offering a choice instead of a penalty.
- **The retry is written before it is asked for.** Regenerating 15 questions takes
  about 18 seconds on flash even split into concurrent batches, so it happens
  while the learner is still on the recap screen — the same trick as writing the
  next lesson a level early. The bank fills in only when a vendor was down.
- **Drills are their own `kind: 'remediate'` session** rather than blocks on the
  failed one, because a session standing on a checkpoint level cannot advance a
  level — `mastery.tryLevelUp` refuses anything but a practice level. That makes
  "working an area back up does not skip the quiz" structural instead of a rule
  someone has to remember.

Still open, deliberately: the Graduation exam keeps its 90% mark and gets the
same two doors.

---

## 2. The skip-ahead exam — **BUILT**

Shipped 2026-09-27. `SKIP_*` in `config/curriculum.js`, the run and the award in
`services/mastery.js`, the session and the scorer in `services/sessions.js`, three
routes in `routes/learn.js`, and `public/skip.html` + `public/js/skip.js`.

Four things came out differently from the plan above:

- **A failed band sends you to itself, not to the one below.** The first band that
  is not perfect is the level you land on — everything under it was proved, and it
  is the level you now get to do properly. The plan's wording ("advance to the top
  of the last band where every one of the seven was right") was off by one band:
  read literally it dropped a learner who proved three bands onto level 120 having
  proved 130.
- **The first band is a gate, not the first step.** Failing it skips nothing, even
  with four perfect bands behind it. It sits one ten-level mark above where the
  learner stood, so it is the question of whether they are ready to leave at all —
  which is a different claim from the ones the bands above it make.
- **A checkpoint counts on its score, not on being passed.** Clearing a Master quiz
  at 76% is a level cleared at 76%, and the run asks for 90%. Crediting checkpoints
  at face value would have let the hardest levels on the path buy the offer the run
  exists to be evidence for.
- **The offer is spent either way.** An exam that skips nothing still ends it, on
  the same reasoning as the checkpoint cooldown coming out: it measures the levels
  above where the learner stood, so re-sitting it to fish for a better draw is the
  same thing. The run itself survives, so another twenty-five clean levels earns the
  next one.

The exam holds feedback for the whole run, more strictly than a checkpoint does: a
checkpoint is fifteen questions scored as one whole, this is five bands that each
have to stand alone, so revealing as it went would hand over the boundaries and let
someone protect a run they had not earned.

Two development hooks sit behind `DEV_TOOLS=1` — seeding a twenty-five level run, and
reading the answer key for a test harness that drives the app over HTTP. The second
exists because the answer key never leaving the server is the product's central
guarantee, so without it this feature could only ever be tested in-process. Gated on
an explicit opt-in rather than on `NODE_ENV`, because this app is already deployed
with `NODE_ENV` unset somewhere real and a level-granting endpoint must not open by
accident.

Still open, deliberately: the Graduation exam keeps its 90% mark and gets the same
two doors.

---

## 3. English: small quiz, then a graded essay — **BUILT**

Shipped 2026-09-27. `isEssayCheckpoint` in `config/curriculum.js`, the `essays`
collection, `generateEssayPrompt` and `gradeEssay` in `services/ai.js`,
`services/essays.js`, `planEssayQuiz` and `resolveEssayCheckpoint` in
`services/sessions.js`, `routes/essays.js`, and the writing surface in
`public/js/session.js`.

Five things came out differently from the plan above:

- **The rubric cannot be drawn only from what the learner has met.** The
  introduction schedule is coarse — a five-skill grade meets its second skill
  around level 100 — so at level 25 there is exactly one skill to draw on and
  "4–6 criteria" was impossible; the validator refused it and the fallback
  produced a one-criterion rubric. Two criterion ids that are about the writing
  rather than any skill, `writing_structure` and `writing_clarity`, are now
  always available. They are marked and shown but never become a practice area,
  because there are no drill questions for "is this paragraph in a sensible
  order", and `areasFromEssay` skips them for the same reason it skips a
  criterion the model could not read.
- **The level itself did not change.** `levelKind` still returns `'master'` at
  level 25; a predicate over grade and level decides the delivery. `levelKind`
  has seventeen call sites and `roundToPlacement` has no grade to ask, so
  threading one through all of them would have touched placement and the
  Challenge Exam for nothing. The path a learner walks is identical in every
  track; only what they do at the checkpoint differs.
- **The mark is recomputed from the criteria, never taken from the model.** It
  decides whether someone passes a checkpoint, and a single number in a response
  body is not worth trusting for that when the twelve numbers it comes from are
  right there. A model reporting 0.8 while scoring 3,3,2,4 is describing a
  different essay, and the criterion breakdown is the one a learner can act on.
- **The rule-based fallback marks nothing.** A grader that cannot read prose
  cannot honestly produce a number on it, so with no model the essay reports that
  it was not marked and names no criterion as a weakness. A learner is never
  told they failed a piece of writing by something that did not read it.
- **A draft is markup, and the grader is given prose.** A rich text editor
  produces HTML, which made the word count and the evidence quotes a problem
  rather than a detail: `<strong>` would have counted as a word, so a page of
  formatting with three words under it would have passed the 80-word gate. Every
  path that reads a draft as prose now goes through `grading.toPlainText`, and
  `saveDraft` filters the markup on the way in — a stored draft is the one place
  in the app where a learner's own markup reaches a page, everything else is
  escaped on the way out.

A fourth piece landed with it, because the writing surface needed it: the editor
is a real one — a formatting toolbar, the usual shortcuts, undo — with autosave
that fires on a two-second debounce, on blur, on hiding the tab, on closing it,
and before signing out, and a `localStorage` mirror for when the network is gone.
The rubric became a grid, aspects down and the four grades across, which is the
shape of the thing and turns "what does a 3 look like for this row" into a lookup.

The essay is prefetched and bounded-waited exactly as a lesson is, and its topic
and rubric are generated one level early. The one difference from a lesson is
that the bank's version *is* stored on the timeout path: a lesson's bank
fallback is deliberately not stored, because a lesson is reused forever and a
stored bank version would replace the written one permanently. An essay is not
reused — a rewrite is a new attempt and gets a new topic — so storing it is
what gives the learner somewhere to save a draft while the written one finishes.

---

## 4. Spanish as a language app

**What it is.** The Duolingo surface: the character speaks, you speak back, you
type translations, you drag words into order.

**The API is confirmed and usable.** MiMo does both halves of the voice pipeline
through the same `/v1/chat/completions` endpoint, not separate services:

- **TTS** — the text rides in an assistant message, the voice goes in
  `audio.voice`, and the audio comes back base64 at
  `choices[0].message.audio.data`. Model: `mimo-v2.5-tts`.
- **ASR** — the recording is uploaded as an `input_audio` data-URL part inside a
  user message; wav, mp3, flac, m4a and ogg are accepted. Model:
  `mimo-v2.5-asr`.

**Exercise types to build.** Listen-and-type, read-and-translate, speak-the-
sentence (ASR transcript compared against the target with the same accent-blind
normalization grading already uses), word-bank drag-to-order, and match-the-pair.
The Spanish generators in `content/spanish-items.js` already produce the
underlying material; this is a new player rather than new content.

**Real work beyond the API.** Recording in the browser (MediaRecorder, a
permission prompt, a visible level meter), audio caching so the same sentence is
not re-synthesized for every learner, a drag-and-drop interaction that works on
touch, and pronunciation scoring that is encouraging rather than brutal — ASR
transcripts of a beginner are rough, and a naive string match would fail people
who were understandable.

---

## 5. Art

**What it is.** Tutorials you can interrupt with a question, plus projects graded
against a rubric.

**Two open decisions.**
1. **Where the tutorials come from.** Hosting video is a different business to
   the rest of this app. The cheap first version is illustrated step-by-step
   lessons using the existing lesson format plus reference images; embedded
   third-party video is a licensing question, not an engineering one.
2. **What grades the image.** MiMo V2.6 has native image understanding, so the
   same provider could do it. That needs testing against real student work
   before it is trusted to put a number on someone's painting.

**Shape.** Reuse the essay machinery: project brief + rubric + submission +
rubric-graded feedback, with an uploaded photo or an in-app canvas drawing in
place of the essay text. The canvas is a contained piece of work (pointer
events, a few brushes, save to PNG).

**The honest note.** Grading art by rubric is defensible; grading it by model is
going to be wrong sometimes in ways that sting. The first version should give
feedback and criterion-level notes without a headline score.

---

## 6. Coding

**What it is.** Scratch for the early levels, real code later, hands-on
throughout, with the AI reading your code when it breaks.

**Three pieces, in order.**
1. **The real-code half first**, because it is far less work: a sandboxed
   JavaScript/Python runner in the browser, run-your-code output, and the AI
   explaining an error in terms of what you were trying to do — what went wrong,
   how to fix it, and how to avoid it next time. The coach already does the
   never-hand-it-over teaching; this gives it a stack trace to work with.
2. **Projects instead of Grand Master quizzes**, reusing the rubric machinery
   from the essay: a brief, tests or a rubric, and a graded submission.
3. **The block editor last.** A Scratch-like editor with a live stage is a
   months-long project on its own. The realistic options are embedding an
   existing open-source block editor (Blockly gives the blocks; the stage and
   runtime are still yours) or starting with a simplified block set of our own.
   This should be scoped separately once the rest of the track works.

---

## Where the models stand

Resolved. The token plan works on `https://token-plan-sgp.xiaomimimo.com/v1`, and
all three routes are live:

| Route | Model | Measured |
| --- | --- | --- |
| chat | `qwen/qwen3.8-27b:free` → Gemini flash-lite | 0.7–2.0s a turn |
| deep | `mimo-v2.6-pro` | 76s to read a failed quiz properly, which is why it is background |
| regen | `mimo-v2.6-flash` | 18s for 15 questions, two concurrent batches, all usable |

Two things to know about the free Qwen route: only one upstream provider serves it
(ModelRun), and that provider's shared pool is frequently saturated, so in
practice a fair share of chat turns are answered by Gemini. It is not a failure
path — it is the same turn, handed off mid-request — but if chat should actually
run on Qwen, either add an upstream provider key on OpenRouter or point
`OPENROUTER_MODEL_FAST` at the paid `qwen/qwen3.8-27b`.

`mimo-v2.7-pro` does not exist on this key: `npm run ai:models` lists up to
`mimo-v2.6-pro`. `MIMO_MODEL_DEEP` is the one place to change when it appears.
