# Product decisions

Answers from the owner, 2026-10-20. Read with `ROADMAP.md`, `SCORECARD.md` and `BLOCK-LEVELS.md`.

## Vision
- Anyone can learn any subject at any level: from not knowing the subject's name to being the most
  educated person in it. Includes frontier/unsolved fields (past what is known, into research) and
  fictional subjects (invented languages, fictional physics).
- Every part of a subject is tailored to the learner, including the order and mix of level types
  (lesson, game, quiz, activity, ...), chosen for the most understanding and retention in the least time,
  using the fewest tokens that get that result.

## Name
- Not "Polymath" (sounds math-only). Leading candidate: **Savant** (savant.com is taken). Not final.

## Subjects
- Now: English, Math, Reading, Spanish, IQ, ACT. All grades of each.
- Built 2026-10-21: **Chess** (19 grades), **Piano** (19), **Basketball** (15), each researched, audited to an
  estimated 94-100% coverage and live in the app. How each was made: `../curriculum-build/<subject>/README.md`.
- Next: coding, art, EQ or confidence, dentistry. (Cooking is close enough to art to skip.)
- Still needed for the three new subjects: an in-app chessboard, microphone/MIDI input for piano, and video capture,
  shot tracking and decision clips for basketball; until then those levels run as practice.
- New subjects: eventually the AI builds a whole subject by itself, the same way the first subjects were
  built but better (see `Curriculum_Build_Guide.md`, coming from the owner).
- High-stakes subjects (medicine, dentistry, law, finance): likely AI + disclaimer. Not settled.

## Words
- **Grade** = a band of knowledge in a subject (math has about 50). Not a school grade.
- **Level** = one step inside a grade.

## Placement
1. Optional subject placement quiz: picks the starting grade; lightly recommends earlier grades where
   the learner missed things.
2. Grade placement quiz: picks the start point inside the grade, or only the topics still needed, so the
   learner skips what they proved.
- Goal: placement is good enough that nobody wants to skip.

## Layout and skips
- Layouts are tailored per learner (one learner may get 1 activity for a topic, another 20).
- **Owner account (the.landon.d@gmail.com): no layout tailoring.** It follows the CSV layouts. Other
  accounts test layout tailoring.
- Free skips: an allowance sized to the learner's layout (was 3 per topic when every topic had 9 games),
  then prove it to skip more. Exact rule not set.

## Judging skills that are not quizzes
Use whichever is most accurate for the skill, and combine: photo/video upload with AI critique,
real-world challenges, scenario role-play, self-report surveys.

## Scorecard
- One global card plus per-subject adjustments.
- Learners see only a plain-language summary, not the 100 numbers.
- Interests come from an onboarding survey, behaviour, and the help chat.
- After every level the learner can say what they liked and did not like.

## Tiers and money
| Tier | Gets |
| --- | --- |
| Free | Base lessons; many features capped. Best model that handles the free features. |
| Paid 1 | All features, high limits, most capable model. |
| Paid 2 | Practically unlimited, most capable model. |
| Org basic | Schools/colleges/learning centres, priced by size, monthly or yearly. All subjects as the app has them. |
| Org top | Org uploads its own curriculum and rubrics and says how lessons should be; still tailored per student. |

## Accounts
- Users: email, phone, Google, Microsoft, Apple.
- School users: school SSO (Clever) only.
- Under 13: parent/guardian-linked or school-managed accounts.

## Data
- Never sell data. Anonymized research may be OK. Maybe never sell minors' data in any form.
- Users can export their data.
- Deletion: off during testing and beta. Turned on before going to investors, for legal reasons.

## Engagement and social
- Habit features (streaks, reminders, review queue): whatever balance keeps learners best served and coming
  back; tune after launch.
- Social (leaderboards, study groups, peer review): later. A simple version now is fine so it is not forgotten.
- Voice tutor: later.

## Look
- Adapts to the user: playful for kids, clean for adults.
- Mobile web should feel as close to an app as possible. Native iOS/Android apps later.
- Landing page (owner, 2026-10-31): the live savantedu.com design stays. The site-v3 restyle was rejected ("a crappy version of what we have live"). Do not restyle the landing page again unless the owner asks; copy or section changes go onto the live design.

## Languages
- English only for launch, then Spanish, then top 5, 10, 25 languages.

## Credentials
- First: accreditation through partner schools (only their students). Later: the app's own widely
  accepted accreditation.

## Plan
- Owner builds alone with AI tools; hires after investment.
- Small beta: friends, family, and applicants (application form, owner approves).
- Within about three months: the product that raises the most money for the least equity.
- Evidence for investors: before/after scores, retention vs. a non-tailored holdout, engagement, testimonials.

## Code
- This folder is the source of truth. How the subject spreadsheets were made: `CURRICULUM-BUILD-GUIDE.md`.
  The Duolingo-style Spanish plan: `spanish/` (its code is already in this folder).

## AI models
- modelflare.dev (a reseller selling Claude, Gemini, OpenAI and others at 1.5-30% of list price) is used
  through development and the friends/family/applicant beta, to keep cost lowest. Beta testers acknowledge
  the risks. Replaced with direct providers before going to investors.
- Existing rule stands: `OPENROUTER_GPT_SOL_API_KEY` is only for the coding assistant, never the app.
- Lessons are written by GLM 5.3 Flash only. Claude Sonnet 5.5, on the owner's own Anthropic key
  (`FACT_CHECK_ANTHROPIC_KEY`, decided 2026-10-21), makes them factual. That key is used for nothing else.
  - **Rule:** everything a learner reads is factual wherever facts exist, and is proven before it is served.
  - **Exceptions:** opinion, contested or mixed research, and theory are allowed only when the text says that is
    what they are ("research is mixed", "many coaches prefer", "one theory is"). This applies to every subject,
    including ones learners add later.
  - **How ("thorough mode", the default since 2026-10-21; owner: "perfect results for the lowest price"):**
    1. Claude researches each unit's facts on the web once, with the exact source sentences, before GLM writes.
    2. Free checks run first: MiniMax (free until 2026-10-22 12:00 UTC, then Haiku 5.5) reads the lesson for
       contradictions and checks each block; a blind test answers every question without its key; local
       checkers on the owner's PC (FactCG, MiniCheck, Granite Guardian, HalluGuard) check sentences against the
       sources, on the first full read only.
    3. Sonnet 5.5 verifies every claim one by one (searching for anything specific), with the free checks'
       flags as hints.
    4. What fails is repaired: twice by GLM at high effort, then by Sonnet. It is removed only if that fails too,
       and a lesson that would lose more than a third of its blocks is written again.
    5. After repairs Sonnet reads the whole lesson again from scratch, up to three full reads, until one finds
       nothing.
  - **Measured on the three original test lessons (chess, piano, basketball):** an independent Opus 5.5 audit
    afterwards found 1, 0 and 0 problems left, at $0.47-1.86 a lesson and 40-55 minutes each.
    Cheaper but weaker options: FACT_PIPELINE=sonnet (one Sonnet read) and =cascade (local and cheap
    checks, Sonnet only on flags: caught about 18 of 50 known errors).
  - **Local checkers:** start them from the app folder with
    `..\fact-venv\Scripts\python.exe -I tools/fact-checkers/server.py` (models in `folderThing\fact-models`).
    Without them the rest still runs.
  - **Gate:** while the key is set, a lesson is served only once verified. If the key or its credit stops working,
    new and old-unverified lessons are held, not served. Lessons written before 2026-10-21 are verified the first
    time they are opened, or all at once with `scripts/verify-lessons.js --save`.
  - **Measured:** on three lessons with 13 known errors, GLM caught 2 as a checker and Sonnet without search
    caught 7 (plus 3 new real ones).

## Open risks
- **Deletion.** Must be on before investors (COPPA, GDPR, California law). A workable shape: delete identity
  on request, keep anonymized learning data.
- **modelflare.dev in the beta.** It can stop without warning, so keep a working fallback provider. Keep
  under-13 testers out of the beta, or get parent consent that names the provider, since their data goes
  through it.
- **Keys in `.env`.** Low risk: the GitHub repo is not publicly visible (checked 2026-10-20) and no person has the file.
  Make new keys before anyone else gets the code or the repo goes public.

## Scorecard accuracy (owner, 2026-10-31)

- **Goal.** Every scorecard measure as close to the learner's true value as physically possible within a month of use: best-possible (Bayesian) estimation per measure with an honest uncertainty range, the most informative probe asked next, and a simulation gate that compares each measure's error at 1, 2, 3 and 4 weeks against the best achievable with the same data. Never claim "perfect" or "within 1 point" accuracy.
- **Approved now.** Review timing by predicted recall (review when recall is predicted below 85%); a calibrated reading-level check; short validated questionnaires at sign-up (skippable); delayed memory checks (about 30 seconds at 1 week and 1 month); 2-minute brain games (memory span, speed, attention); silent behaviour signals (rereading, hesitation, answer changes, typing rhythm) with a privacy notice; optional import of past results (ACT/PSAT reports, grades, Anki/Quizlet history); an optional max-accuracy mode (confidence taps, more teaching experiments).
- **How they appear.** Quick, worthwhile ones are built into the normal flow and are always skippable. Longer or less fun ones are offered on the side as optional extras that raise accuracy.
- **Later, with real users.** Starting a new learner from similar learners: build after the beta so it can be tested on real people. "Is this you?" profile check: maybe; decide later.
- **Not now.** Webcam eye tracking and wearables (privacy, especially for children).
- **Own material.** The learner's interests and dislikes shape their own uploaded material too, as clearly framed analogies and examples; the text stays the only source of facts.

## Faster, the daily check, and evaluations (owner, 2026-11-05)

- **What "faster" means.** A learner gets all the information they would normally get from normal studying or a personal tutor, and remembers it for however long they chose as their retention goal. Lower retention goals should be faster overall; higher ones should still be faster, just not as fast. The owner calls the last two "just assumptions": test them, per learner, against normal studying and a tutor.
- **Daily check.** Optional but encouraged.
- **Kimi K3.** Expensive: look deeper before relying on it.
- **Claude add-on on Grokified.** No (no money for it).
- **Learner data after Nov 14.** Ask the owner again on Nov 10.
- **Munito and Coral.** Keep building with them while credit lasts.
- **Evaluations.** Build one for every API we use, as long as covering all of them adds no more than 2% to overall cost.

## Goals shape every part of the material (owner, 2026-11-05)

Every part of lessons and other material should be changeable and follow the learner goal (for example core parts fast) and the deepest understanding of them. Keep building toward at least 95% accuracy at one month.

## Fact checking (owner, 2026-11-06)
Everything Savant makes and puts out is 100% fact checked before it is shown. "100% fact checked" and "100% true" are different things: the first is the standard and may be claimed, the second may not.

## Name, domain and after design (owner, 2026-11-06)
The name is Savant; the domain is savantedu.com. Goal: savant.edu through a partner school, or Savant's own accreditation. After the design work: study groups (chat online or offline, see what members are actively doing) and leaderboards across friends and across study groups. Other languages and credentials are put off. The voice tutor should already exist.

## Onboarding, uploads and the character (owner, 7 Nov 2026)

- Character: the Sunny-coloured giraffe in the flat mascot style, "for now", so work can move on to the rest of the UI. It may become customizable later.
- Onboarding "should just ask the same things it does": the test that gets a general understanding of their learning style, their interests, the subject(s), then the grade they want or the placement. Age and the agreement stay in front, as law and the owner require. It should have "a clean ui look like Duolingo and brilliant".
- Full modification and optimization of uploaded material is to be built alongside everything else, for the beta on Nov 15.

## The tutor, reached through the giraffe (owner, 7 Nov 2026)

- No floating bottom-right button: it covers things. Tap the giraffe and the chat opens.
- On a phone the chat comes from the top or the bottom, the learner's choice, and the original page stays scrollable in the window above or below it.
- Press and hold the giraffe to start a voice call. It just listens and talks, with no buttons. Tap to end the call. Hold to switch the audio to chat, and the window slides in.
- Later, after the design is finished: a tutorial that includes this. Later, once the final character is decided: animate its mouth to the sounds being spoken, not just open and close.
