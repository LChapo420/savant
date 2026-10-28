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
