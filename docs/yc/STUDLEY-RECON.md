# Studley AI recon and Savant gap map

Date: 2026-10-29. Public sources only. No account, no sign-in, nothing copied (features and behaviour in our own words).
Scope: web plus iOS/Android study app, core loop "upload material, get a study set". Audience: Savant, matching and beating it.

## 0. How good is this evidence (read first)

- studley.ai is a client-rendered site. A plain page fetch returned only the page title for every page, so the marketing pages could not be read directly.
- I read six marketing pages (home, pricing, podcast-maker, flashcard-maker, quiz-generator, ai-tutor) through a public text-rendering proxy (r.jina.ai). The tool harness then refused one more such call (ai-test-maker) as bot-check circumvention. I stopped using the proxy at that point rather than work around it. So the test maker, note taker, PDF and video summarizer, Lab, Explore and Study-sets pages are known only from the sitemap's page names and third-party listings. Treat those rows as "medium/low" confidence.
- Confidence tags below: H = studley.ai's own page or App Store listing; M = a third-party page that repeats the vendor; L = one review or a directory blurb.
- Not found at all: a YouTube demo with a link (one directory mentions a demo at 00:54 with no URL), any Reddit thread, a Google Play listing body (blocked), G2 body (403). Reviews below are the App Store and Trustpilot only.
- Nothing about scheduling internals is public. The vendor's own flashcard page says the learner chooses when to come back; third-party blurbs say "spaced repetition", which is marketing.

## 1. Sources

| Source | URL | Used for |
|---|---|---|
| Sitemap (page list) | https://www.studley.ai/sitemap.xml | Tool pages, Lab, Explore, ~200 blog posts |
| Home | https://www.studley.ai/ (read via proxy) | Feature list, inputs, 54-language claim context, claims |
| Pricing | https://www.studley.ai/pricing (proxy) | Free vs Unlimited |
| Flashcard maker | https://www.studley.ai/flashcard-maker (proxy) | Inputs, limits, card states, sharing |
| Quiz generator | https://www.studley.ai/quiz-generator (proxy) | Quiz behaviour |
| AI tutor | https://www.studley.ai/ai-tutor (proxy) | Tutor lessons and chat |
| Podcast maker | https://www.studley.ai/podcast-maker (proxy) | Podcast behaviour |
| App Store listing | https://apps.apple.com/us/app/6744783834 | Pitch, in-app prices, languages, rating, reviews |
| Other storefront of same listing | https://apps.apple.com/vc/app/studley-ai-get-better-grades/id6744783834 | 53 extra languages, weekly/monthly/quarterly/yearly prices |
| Onboarding and paywall teardown | https://screensdesign.com/showcase/studley-ai-notes-flashcards | Hub button, folders, "I knew it / didn't know it", paywall timing, Solve |
| Trustpilot (11 reviews) | https://ca.trustpilot.com/review/studley.ai | Complaints and praise |
| Directory with written-test and audio-lesson detail | https://www.mergeek.com/latest/eBGqKWdXGe7WLvlO | Written tests, essay grader, audio lessons (may be older) |
| Directory summary | https://www.stork.ai/en/studley-ai | Feature list (no extra detail) |
| Comparison blog (competitor-authored, biased) | https://blaze.today/blog/studley-ai-alternatives/ | Free-tier "once per day" claim, old prices |
| Directory | https://aichief.com/alternatives/studley/ | Photo solver, essay grader |
| Separate small app (do not confuse) | https://apps.apple.com/py/app/studley-note-taking-ai/id6692611408 | A different developer's lecture-notes app |

## 2. What Studley is, in one paragraph

A "study set" app. You drop in material (documents, slides, images, audio or video up to 1 GB, links, YouTube, pasted text, in-app recording, up to 10 files per set) and it generates, from that material only: editable flashcards, multiple-choice quizzes, written tests and fill-in-the-blank, notes, tutor lessons plus a tutor chat, and a two-host audio podcast. On mobile there is a Solve tab: photograph a problem, get step-by-step working, then ask a follow-up. Progress is a "path to mastery" per set with four card states. Free tier is tiny (1 study set, 5 tutor uses, 2 solves then 1 a day, resets weekly); one paid plan ("Unlimited") sold weekly, monthly, quarterly and yearly through the app store. Roughly 4M+ users and 4.7 stars on iOS are vendor-reported.

## 3. Feature matrix

Savant status key: yes / partial / no. File:line are in the main checkout (`C:\coding\claudecommittdIq\folderThing\iq-max-repo-2-claude-adoring-mayer-woc9sq`) unless marked `[branch]`, which means `git show origin/own-material-paths:<path>` (branch tip e2a3b36). The branch adds 2,404 lines over main for own-material (course-builder, material-study, material-path, proof scripts, `docs/OWN-MATERIAL-MECHANISMS.json`).

### 3a. Inputs

| Feature | How Studley does it | Source (conf.) | Savant | Gap |
|---|---|---|---|---|
| PDF | Upload PDF; part of the "combine up to 10 files" set | flashcard-maker, quiz-generator (H) | yes: `services/material-parsers.js:45-63` (unpdf, 300 pages, password and damaged PDFs refused), `services/materials.js:15-17` (20 MB, 900k chars) | Studley's limit is bigger (1 GB is for media, not stated for PDFs). Scanned PDFs refused (`materials.js:59-63`). |
| Word | .docx upload | flashcard-maker (H) | yes: `material-parsers.js:65-81` (mammoth, zip-bomb guard) | None for docx. No .doc, .rtf, .odt, .epub. |
| PowerPoint / slides | .pptx upload; Google Slides not named | flashcard-maker (H) | no: `materials.js:57` refuses anything but PDF, docx, text | Add .pptx (zip of slide XML; reuse the zip guard). Google Slides via export to pptx/PDF (no Google API needed). |
| Pasted text | Yes | home (H) | yes: `materials.js:120-127`, `public/js/my-material.js` paste card | None. |
| Plain text, Markdown | Not stated | n/a | yes: `materials.js:56` | Beyond parity. |
| Images, photos of notes or pages | "Images" accepted; on mobile, photo of a textbook page or worksheet | flashcard-maker, screensdesign (H/M) | no (BACKLOG item 0b(d) "later"): `docs/yc/BACKLOG.md:70`. `services/tutor-vision.js:1-60` exists but no vision slot is registered, so it returns null | Needs OCR or a vision model. See section 6. |
| Scanned PDFs | Implied by images | n/a | no: refused with a message, `materials.js:60-62` | Same OCR work. |
| Website link | Yes | podcast-maker, quiz-generator (H) | no | Server-side fetch plus article extraction. |
| YouTube link | Yes, the headline input | home, App Store (H) | no | Transcript path. Legal/ToS flag in section 6. |
| Audio and video lectures | Upload up to 1 GB; record in the app | flashcard-maker (H) | no for material. Tutor push-to-talk only: `routes/tutor.js:71` (1 MB clip, about a minute) | Long-audio speech-to-text, chunking. Reviewer says recording transcripts can cut off halfway (one review, L). |
| In-app recording | Yes | flashcard-maker (H) | no (tutor clip only) | Browser MediaRecorder exists in `public/js/tutor-dock.js:182-267` to reuse. |
| Several files in one set | Up to 10 files combine into one set; reviewers hit the 10 cap and ask for supporting slides alongside recordings | flashcard-maker (H); App Store review Sep 21, Jun 24 | no: one material becomes one course (`routes/materials.js:65-73`); 20 materials per learner (`materials.js:18`) | Merge several materials into one course. Beat the cap. |
| Size and page limits | 1 GB for audio and video; 10 files per set; other limits not stated | quiz-generator (H) | 20 MB, 300 pages, 900k chars, 20 materials, 3M chars total (`materials.js:15-21`) | Stated plainly in Savant's UI. Fine. |
| Copyright and privacy statement | "Uploads private to your account; delete a set and its source any time" | flashcard-maker (H) | yes, and stronger: text only kept, file thrown away, deletion cascades (`materials.js:6-9, 129-137`; `docs/OWN-MATERIAL-MECHANISMS.json` 07-M13) | Beyond parity. |

### 3b. Outputs

| Feature | How Studley does it | Source (conf.) | Savant | Gap |
|---|---|---|---|---|
| Flashcards | AI makes question-answer cards from your set, reviewable before study; every card editable (reword, fix, delete, add); each card carries one of four states (unfamiliar, learning, familiar, mastered); filter to not-yet-mastered; mastery % per set; "I knew it / didn't know it" buttons; study on web and apps with sync | flashcard-maker (H); screensdesign (M) | no. Savant has skills, lessons and questions but no card object: grep of `services routes public` finds no flashcard feature | The most obvious missing output. |
| Spaced repetition on cards | Vendor page: learner picks when to return, no schedule explained; third parties say "spaced repetition" | flashcard-maker (H) vs aggregators (L) | yes for skills, not cards: per-learner half-life curve `[branch] services/material-path.js:240-268`; `[branch] services/material-study.js:141-146` (scheduleReview), `:492-502` (dueSummary). Main uses a fixed ladder 1,3,7,14,30,60 days (`services/material-study.js:32`) | Cards must plug into the same scheduler. |
| Quizzes | Multiple choice only (per the vendor page); questions and options editable; delete questions; regenerate for a new set; retake unlimited; correct answer shown, then "ask AI to explain" from your material | quiz-generator (H) | partial: checks of about 5 questions per skill, MC plus short answer, no feedback until the end, key stays on the server (`services/material-study.js:156-265`; routes `routes/materials.js:88-101`) | No learner-triggered "quiz me on this whole material/these chapters", no question-count or timer options, no regenerate, no edit. Savant's per-skill gating is stricter by design. |
| Fill-in-the-blank | Exercise type listed | home (H) | partial: short-answer items exist, graded by a deterministic compare (`services/material-study.js:46-77`, `gradeShort`); `services/typed-grading.js:1-12` has a layered grader not yet wired to own-material | Cloze generation, and use the layered grader. |
| Written tests with AI feedback | "Written tests" that prompt open-ended explanations, AI feedback on reasoning and depth; essay grader against an uploaded rubric ("paper grading") | home (H); mergeek (M) | partial: rubric-marked rewrite loop exists only for the English checkpoint (`services/essays.js:1-12`), not for uploaded material | Free-response items for own material, rubric grading, rewrite loop. |
| Practice test / exam | Called "AI test maker" (page not readable) | sitemap (name only), mergeek (M) | no | Timed mixed exam over the whole material with section scores. |
| Notes and summaries | "Interactive notes"; notes include diagrams and images (Trustpilot 5-star); but another reviewer calls summaries too thin for slide decks, and one reports notes cut off | home (H); Trustpilot (L) | partial: each skill has a short lesson (`services/course-builder.js:115-143` SKILL_SCHEMA, `:238` buildSkill); no whole-material summary, no figures from the source | Whole-material notes with source quotes; keep figures from PDF/PPTX. |
| Tutor lessons | A structured lesson built from the upload, ordered logically | ai-tutor (H) | yes, stronger: unit and skill ordering with a prerequisite graph `[branch] docs/OWN-MATERIAL-MECHANISMS.json` M1, M2 (`course-builder.js:87-254`) | Beyond parity. |
| AI tutor chat | Answers from your uploaded content, keeps study-set context, 24/7. Free tier: 5 uses | ai-tutor, pricing (H) | partial: dock on every page (`public/js/tutor-dock.js`, `services/tutor-context.js:180-212`), but it sees only titles, mastered counts and due counts of your material (`tutor-context.js:109-120`), not the passages. On the study page it is method-hints-only (`tutor-context.js:30`, METHOD_ONLY includes `/my-material-study`) | Not grounded in the learner's text. Biggest parity gap in the tutor. Keep the hint ladder (`tutor-context.js:151-157`). |
| Podcast | Two AI hosts discuss your material as a conversation; a few minutes to generate, close the tab and return; generating is free; paid users can start a live voice conversation with the episode. No voice, length or format options on the page | podcast-maker (H) | no. Pieces exist: browser and gateway TTS `public/js/tutor-dock.js:131-144`, `routes/tutor.js:58-66` | See section 6 on voices and provider. |
| Audio lessons with voice personalities | Directory says selectable voice personalities, subscription only | mergeek (M) | no | Same as podcast. |
| Live voice chat about the episode | Paid | podcast-maker (H) | partial: tutor "Talk" mode (`tutor-dock.js:73-87`, `:182-267`) but not tied to an episode or the material | Combine after podcast and grounded tutor. |
| Photo Solve | Photograph a problem, get step-by-step working; ask a follow-up; free tier 2 then 1 a day | pricing (H); screensdesign (M) | no. Owner decision (2026-10-29) is hints, not answers (`tutor-context.js:151-155`) | Do it as a guided hint ladder, not a solver. |
| Mind map / concept map | Not found anywhere on Studley's pages or listings | n/a | partial for free: the prerequisite graph exists (`[branch] docs/OWN-MATERIAL-MECHANISMS.json` M2; `course-builder.js:208-254`) but is shown only as a level list | Nobody has to be matched here. Cheap to beat. |
| Interactive "Lab" (3D body, cell, chemistry, solar system) | Pages named in the sitemap only | sitemap (name only, L) | no | Skip (see section 7). |
| Explore / public set library | Pages named "explore" and "study-sets" in the sitemap; sets can be published by link | sitemap (L); flashcard-maker (H) | no, and by policy: "never shared with other learners" (`docs/yc/BACKLOG.md:72`) | Owner decision needed; see section 6. |

### 3c. Account and product

| Feature | How Studley does it | Source (conf.) | Savant | Gap |
|---|---|---|---|---|
| Folders | Coloured folders, move sets between them | screensdesign (M) | no | Simple folders or tags on materials. |
| History | Not documented | n/a | partial: list of materials with preview (`routes/materials.js:37-42`) | Study history per material. |
| Study plans | G2 snippet claims study plans (secondhand); vendor pages describe "path to mastery" progress, not a calendar | G2 via search summary (L); screensdesign (M) | partial: map with next step (`[branch] services/material-study.js:149-158` nextStep); ACT test date exists elsewhere (`services/act-scores.js`) | No exam-date plan for own material. |
| Progress and mastery | Four card states and mastery % | flashcard-maker (H) | yes, stronger (75% gate, `[branch] services/material-path.js:36`) | Beyond parity. |
| Streaks | Not found | n/a | yes in app (`services/streak.js:1-12`, one grace day) | Not shown on own-material. |
| Collaboration | Publish a link to share a set with classmates; no co-editing found | flashcard-maker (H) | no (referral link only, `services/referrals.js`) | See section 6 (copyright). |
| Export | Not mentioned on the flashcard page | flashcard-maker (H) | no (account export is all-data JSON only: `routes/profile.js:262-272`) | Export is cheap; beats Studley. |
| Mobile apps | iOS (iOS 15.5+, 150 MB), Android, web, synced | App Store (H) | no native app, no PWA manifest found in `public/` | PWA plus phone photo capture. |
| Languages | UI and content in English plus 53 others (iOS storefront); a reviewer got a lesson in the wrong language | App Store vc listing (H); review May 13 | partial: English course builder; Spanish is a separate subject | Detect the material's language and keep it. |
| Free vs paid | Free: 1 set, 5 tutor uses, 2 solves then 1/day, weekly refresh; Unlimited: everything. In-app prices listed: weekly 7.99-8.99, monthly 13.99-24.99, quarterly 43.99, yearly 97.99-119.99 (a 74.99 limited offer too); soft paywall at first premium action, no free trial, discount shown later | pricing (H); App Store (H); screensdesign (M) | n/a (no pricing work in scope) | See reviews: the paywall is its most common complaint. |
| Accessibility | Dark UI, contrast, reduced motion listed | App Store (H) | partial; not audited here | Out of scope. |
| Privacy declaration | App Store says identifiers and usage data are used for tracking, purchases and contact info are linked; "user content" listed as not linked | App Store (H, developer-reported) | stronger by policy: no tracking, learner-class providers only (`docs/yc/PRIVACY.md`) | A selling point. |

## 4. What users praise and complain about

Evidence is thin. Trustpilot has 11 reviews and a 2.7 score and the profile is unclaimed (https://ca.trustpilot.com/review/studley.ai). The App Store shows 4.7 from about 4.5K ratings but only four written reviews are visible (https://apps.apple.com/us/app/6744783834).

Praise
- Easy to use; many ways to turn content into study material (Trustpilot, Kayhan, Jan 19, 5 stars).
- Notes include diagrams and images; same experience in app and on the website (Trustpilot, Amy, Jan 28, 5 stars).
- Breaks material down clearly (App Store, avary_022, Nov 29).
- AI helps with hard concepts (Trustpilot, Shayne Meredith, Sep 28, 1 star: loves the AI, hates the paywall).

Complaints, grouped (each a design target for us)
1. Paywall and usage caps: asked to upgrade after two questions even on a paid plan (Trustpilot, Cian O Coileain, May 27); blocked after the first study set while photographing a lesson (App Store, freadhanariy1, May 13); excessive upgrade prompts (Shayne Meredith).
2. Thin or lossy generation: "doesn't put a lot of information you send" (Trustpilot, Victor, Mar 22); summaries too minimal for PowerPoints (Yves de Bakker, Feb 24); notes cut off (Maria Awad, Jan 7).
3. Large material breaks quizzes: "quiz only works when you have small topics" (Ahmed Sweed, Feb 7).
4. Upload cap: wants more than 10 uploads per set (App Store, Qskfoen, Sep 21).
5. Podcast quality: echoey, robotic voice; the wrong voice reads a character's lines (Qskfoen); audio too fast or too slow (Ahmed Sweed); no pause, skip or speed controls, and wants slides attached next to recordings (App Store, Mahal_me, Jun 24).
6. Wrong language lesson (freadhanariy1).
7. Reliability and support: file upload errors, quizzes not loading, support unresponsive (Maria Awad); "does not work as advertised" (Irene, Mar 13).
8. Question wording errors ("sometimes asks questions incorrectly", Victor).
9. Subscription management reportedly needs a subscription to open (screensdesign teardown, M).

## 5. Prioritized build list

Order: must-haves to reach parity first (P1-P9), then the "beat it" items that use our engine (B1-B8). Each spec is written for our stack: `services/materials.js` text store, `services/course-builder.js` skills with grounded quotes, `services/material-study.js` study state, `services/pool.js` through `services/ai.js` for model calls (learner-class providers only).

### Must-haves (parity)

**P1. Flashcards from the learner's material.** One card per fact or term a skill teaches, generated in the same build pass as the lesson and questions so each card carries the verified source quote (same fail-closed support check as questions, `[branch] OWN-MATERIAL-MECHANISMS.json` M11, M12). A card is front, back, quote, skill id, and a state: new, learning, familiar, mastered. The learner can edit, delete and add cards; edits are stored as theirs and never regenerated over. Study view: flip, "knew it / didn't", and a filter for "not mastered". Cards schedule through the same per-learner forgetting model as skills rather than a fixed ladder, so a card and its skill share one clock. Cap and cost: cards come out of the existing per-skill call, so no new provider.

**P2. Slides (.pptx) and Google Slides via export.** Extend `sniff` and `extract` to recognise a zip containing `ppt/slides/slide*.xml`, read slide text in slide order with speaker notes marked, and keep the existing zip-bomb guard (`material-parsers.js:11-33`, 200 MB unpacked, 5000 entries). Tell the learner to download Google Slides as PowerPoint or PDF; no Google API, no sign-in. Slide titles become section hints for the outline pass.

**P3. Photos and scanned pages (OCR).** Accept JPEG, PNG, WebP, HEIC-converted-in-browser and scanned PDFs. Run local OCR in the existing sandboxed worker (`services/material-worker.js`) so no new outside provider is needed for text; show the extracted text to the learner for correction before it is stored, since handwriting accuracy is uncertain. Keep only the text, delete the image at once. Optional later: a vision model when a learner-class vision slot exists (`tutor-vision.js` already waits for one).

**P4. Audio and video lectures, and in-app recording.** Browser records or uploads audio or video; the server extracts audio, cuts it into chunks, transcribes each and stitches a timestamped transcript, then deletes the recording. Show progress and let the learner resume if a chunk fails (the one review says transcripts cut off halfway). Transcript becomes a normal material of kind `transcript`. Cap by minutes (for example 3 hours) instead of Studley's 1 GB. Adults only, same as the other uploads (`routes/materials.js:17`). Provider decision in section 6.

**P5. Web links and YouTube.** Web: fetch a public page the learner names, strip navigation and ads to the article, store text, refuse private IPs (SSRF guard), respect robots and size caps. YouTube: v1 takes the video link and asks the learner to paste the transcript (YouTube shows one) or accepts the captions text file; stores title and link only. v2 is a captions fetch if the owner accepts the terms risk in section 6. Never download video or audio from YouTube.

**P6. Several materials into one course (and no 10-file ceiling).** A "set" groups materials; the outline pass runs over the concatenated passages with the source name on each passage, so quotes cite which file they came from. Lets a learner attach slides next to a recording (App Store request). Keep the per-learner character cap and show a coverage meter (see B5).

**P7. A tutor that answers from the learner's own material.** In the dock and on the study page, retrieve the best passages for the question (the passages already exist with offsets, `services/course-builder.js:64-93`), give them to the model as untrusted quoted data, and require the reply to cite the quote or say the material does not cover it. Keep the hint ladder and method-only integrity mode on checks (`tutor-context.js:151-157`). On a lesson page the learner can also ask "explain this question's answer" after answering. This turns the tutor from a titles-and-counts notebook (`tutor-context.js:109-120`) into what Studley sells.

**P8. On-demand practice: quiz, written test and fill-in-the-blank.** Let the learner ask for a quiz or exam over a chosen set of skills or the whole material: number of questions, optional timer, mixed MC, cloze and free response, scored by section, retake with fresh questions (not the same ones). Reuse `startQuiz` and `submit` (`[branch] services/material-study.js:354-482`), the layered typed grader (`services/typed-grading.js`) for free response, and keep the answer key on the server. These attempts feed mastery and misconception tracking like any check; a pure "practice test" flag can be set so they do not unlock or lock skills.

**P9. Phone use: installable web app with photo capture.** Add a manifest and service worker so Savant installs on iOS and Android, a share-target so "share to Savant" from a phone's photos or files starts an upload, and large touch targets on the study pages. Do not build native apps first.

### Should-haves (parity, second wave)

- **S1. Podcast (two-voice audio overview).** See B3 for the version that beats Studley. Parity version: script written from the material's skills with quotes attached, two voices, 5 to 15 minutes, transcript shown, play, pause, skip back 15 seconds, speed 0.75x to 2x (a direct fix for the reviews).
- **S2. Folders and tags**, and a history list of what was studied when.
- **S3. Export**: flashcards to CSV and Anki-compatible text, notes to PDF or Markdown, questions to CSV. Studley mentions none.
- **S4. Material language**: detect the language of the text; write lessons, cards and questions in it; offer English explanation toggle.
- **S5. Rubric grading of a written piece**: learner pastes or uploads their own essay and an optional rubric; reuse the English-checkpoint marking loop (`services/essays.js`) with the rubric as data.
- **S6. Edit generated items**: edit or flag a card, question or lesson sentence; a flag removes it from that learner's pool.

### Beat it (what our engine adds)

**B1. Placement over the uploaded material.** Studley starts everyone at the beginning. Our branch already asks one adaptive question at a time over the skill graph and skips what the learner knows, with a quick check on every skipped skill (`[branch] services/material-path.js:68-196`, `material-study.js:185-278`, mechanism 07-M3). Ship it as the first thing after a build, with a visible "you can skip N of M skills" result.

**B2. Mastery gates, tiers and the exam-date compressor.** Skills unlock on prerequisites and 75% (mechanisms M2, M4, M5). Add an exam date to a material; compute a backwards plan from the number of unmastered skills and the learner's measured pace (`updatePace`, `material-path.js:198-238`), and tell them honestly if the date is not reachable. Studley shows progress; it does not plan to a date.

**B3. A podcast built from your weak spots, with questions inside.** Instead of a generic recap, generate an episode from the skills that are due or recently missed, and pause every few minutes for the hosts to ask the learner a question aloud (answer by voice or tap), then explain the answer using the quote. The learner's answers go back into the mastery and review clock. Uses recorded misconceptions (below). This has no equivalent in Studley and fixes "just plays at you".

**B4. Misconception remediation and cards from your mistakes.** Every wrong MC option carries the misunderstanding behind it (mechanism M6, `course-builder.js:143-172`). Generate a flashcard or a two-line "myth versus fact" for each misconception the learner actually hit, with the quote, and put it in their review queue until answered right twice. Studley has no diagnosis of why an answer was wrong.

**B5. Coverage meter and "what I left out".** After a build show which passages became skills, which were merged, which were cut by caps, and list any section of the source with no questions. Studley's top complaint after the paywall is silent loss of material; we can make it visible and fixable ("build the rest"; the branch caps at 30 skills and one skill per 250 characters, `[branch] course-builder.js:46-54`).

**B6. Every item cites the learner's own text and passes a second check.** Already built (M11, M12): quotes of 20+ characters found in the passage, a second model that must say "supported". Say so in the product ("every question points to the line it came from"). Add a one-tap "show me where" on cards and in the tutor reply.

**B7. Progress map as a concept map.** Render the prerequisite graph as a node map, coloured by status (locked, learning, mastered, due), with tap to open the lesson. Studley has no mind map; we get one nearly free from data we already store.

**B8. Photo-a-problem as guided hints, not answers.** The Solve tab is Studley's headline mobile feature and the one reviewers hit the paywall on. Ours: photograph a worksheet, OCR it (P3), and walk the hint ladder (ask what you tried, name the rule, give step one, work a similar example, you do the last step) per the owner rule (`tutor-context.js:151-155`). Fewer wrong-answer-copied outcomes; fits school integrity concerns.

Also worth noting as a quiet advantage: spaced review on own material is per learner (half-life multiplier per learner, `[branch] material-path.js:240-268`), shared with the home page's "due" count (`routes/materials.js:45`), and child-account protections exist (`routes/materials.js:17`).

## 6. Paid-API and privacy notes (flag every new provider)

Savant's policy vendor list today (`public/privacy.html`, `docs/yc/PRIVACY.md` section 1.5): modelflare.dev (placement quizzes only, no learner data), OpenRouter, Anthropic, Google (Gemini, including its speech service), Xiaomi MiMo (including speech), NVIDIA, LLM Gateway (speech, adult accounts the operator has switched on only), Ollama (local, not an outside provider). Hosting and email providers are still placeholders. `docs/yc/PRIVACY.md:10-12` also says the provider terms are unverified, and learner traffic mostly goes to NVIDIA's trial endpoint, which may not permit production. Any new feature below inherits that open issue.

| Need | Option | New provider? | Privacy or cost concern |
|---|---|---|---|
| OCR of photos and scans (P3) | Local OCR engine in the worker | No outside provider (local code, new dependency only) | Handwriting accuracy is weak; show text for correction. Delete the image immediately. Best privacy option. |
| OCR via vision model | A learner-class model with `vision` support | Only if a vision slot is added (none today, `services/tutor-vision.js:6-8`); would be one of the existing vendors if their terms allow images | Photos can show faces, names and addresses (a notebook with a name on it). Owner has said no paid spend; a free slot is needed. |
| Speech-to-text for lectures (P4) | LLM Gateway `grok-stt-1-0`, Gemini speech or MiMo speech (all already listed) | No new vendor if one of those is used | Whole lectures are long personal recordings, possibly of a teacher and classmates (third-party voices). Today's tutor path caps at 1 MB and 2 MB/day per learner (`BACKLOG.md:167`); lecture audio is orders of magnitude more, so the $5 LLM Gateway ledger would not cover it. Adults only. Delete audio after text, state "not kept" (the Spanish uploads currently keep recordings 7 days, a different rule). Cost needs an owner-set budget. |
| Local speech-to-text instead | Whisper-class model on the server | Not an outside provider; new local dependency | Memory rule: local never goes first. Fits as the no-consent and fallback path. Server RAM and time per hour of audio are a concern. |
| Podcast voices (S1, B3) | Browser `speechSynthesis` (free, already in `tutor-dock.js:131-144`), or LLM Gateway `eleven-v3` TTS / MiMo TTS (already listed) | No new vendor | The vendor's own reviewers hate robotic voices; browser voices will be too, and switching voice per speaker is inconsistent across devices. The gateway voice is metered ($5 ledger, 3,000 chars/day per learner today, `BACKLOG.md:171`); a 10-minute episode is about 9,000 characters, so a new budget is needed. Podcast text would pass through the TTS vendor. Cache audio per learner only, and delete with the material. |
| Studley-style celebrity voices or voice cloning | n/a | Would be a new vendor | Do not. Voice rights and a minor-safety risk (`ai-celebrity-voices-education` is in Studley's own blog list). |
| YouTube transcripts (P5) | (a) Learner pastes transcript; (b) fetch captions from YouTube pages; (c) YouTube Data API | (b) unofficial, (c) Google API | (a) is clean. (b) fetches data YouTube does not offer as an API and may breach YouTube's terms; (c) the official captions endpoint only returns captions for videos the caller owns, so it will not work. Never download audio or video from YouTube. Owner decision. |
| Web links (P5) | Our server fetches the page the learner names | No | SSRF risk (block private and link-local addresses, cap size and redirects); page text is copyrighted, so keep it per-learner and unshared (matches `BACKLOG.md:72`). |
| PPTX and docx | Parsed locally | No | Zip-bomb guard already exists. |
| Tutor grounded in the material (P7) | Existing chain (`services/ai.js`, learner-class providers) | No | More learner text goes to outside AI per chat turn than today (titles and counts only); consent gate `outsideAllowed` (`typed-grading.js:579-592`) must cover it, children without consent get no outside model. Update the "Where it goes" text on `/my-material`. |
| Sharing sets by link | n/a | No | Conflicts with the current "never shared with other learners" rule and with copyright of the source; if wanted, share only the learner's own edited cards, never the source text, and gate on a copyright confirmation. Owner decision. |
| Native iOS and Android apps | Store listings | Apple and Google as vendors; payments if sold in-app (Studley's prices are in-app store prices) | Out of scope for parity; PWA first. |
| Subscription and prices | Not needed | n/a | Not part of this recon. |

Child accounts: today they cannot upload (`routes/materials.js:17`). The tester-phase note says under-age testers get full access, so confirm whether images and audio from minors (faces, voices) should stay blocked.

## 7. What not to clone

- Interactive Lab (3D human body, cell, chemistry, solar system): content and 3D assets, low link to own-material study.
- Public Explore library and "2M users" network effects: an audience, not a feature, and it conflicts with our privacy rule.
- Celebrity or cloned voices; a content-creator payment programme (the home page recruits TikTok creators).
- Subscription mechanics, discount timing and prices.
- Their ~200 SEO blog posts and alternative-comparison pages.

## 8. Size

Inputs: M (pptx S, OCR M, audio M-L, links S, YouTube S/M). Outputs: flashcards M, on-demand quiz and written test M, podcast L, concept map S. Tutor grounding M. Folders, export, PWA S each. Hard parts: long-audio speech-to-text cost and reliability; podcast voice quality and cost; OCR of handwriting; the YouTube transcript terms question.

Suggested order: P7 (grounded tutor), P1 (flashcards), P2 (pptx), P8 (on-demand tests), P6 (multi-material), then P3, P4, P5, P9, then B3 and B7, B5, B4 which are the clearest wins over Studley.
