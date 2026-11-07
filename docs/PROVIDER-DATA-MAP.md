# Provider data map: which outside company can receive which learner data

Branch `privacy-trace`, from main, 7 Nov 2026. Read-only trace of the code plus the live server's configuration read by variable NAME only (no values, no learner rows). Nothing live was changed. Draft for the owner (decisions due 10 Nov) and for a lawyer; nothing here is a legal conclusion.

## 1. How a learner's words reach a company (the rules in code)

1. A call with a `userId` is **learner-class** (`services/ai.js` `viaPool`, ~L204-215). A call with no user and `dataClass: 'pipeline'` (scripts, shared base lessons) is **pipeline-class** and carries no learner data.
2. Learner-class calls may use only: (a) the app's own chain (`services/providers/index.js`: NVIDIA, then local Ollama, Gemini free tier, OpenRouter `:free`, then Anthropic last), (b) the tutor's Standard Compute slot (`pool.js` `tutorStandardCompute`, L613), and (c) the "extra" paid slots of Munito, Coral, Gonka, Grokified, ZeroGPU and Lyceum, only for tasks that `config/model-lineup.json` "pool.tasks" lists them for (`pool.js` `candidatesFor` L637-650, `refusal` L586, `munitoLearnerAllowed` L565, `coralLearnerAllowed` L573).
3. Everything outside the machine needs the learner's outside-AI consent: `access().ai_free_text` (`routes/consent.js` L319-336): true for 13+/consenting accounts, for a child only after a parent's `third_party_ai` opt-in. Without it the call stays local or does not happen (`services/ai.js` L152, `services/typed-grading.js` L579). The API gate also blocks the named endpoints for such accounts (`routes/consent.js` L532-550) and blocks **every** child account (pending, active, revoked) from uploads/recordings (`CHILD_MEDIA_UPLOAD`, L550, enforced ~L596).
4. The "added providers" clearance (`services/ai.js` `munitoAllowedFor` L159-164): any consenting 13+ account, and under-13 accounts with parent opt-in **until `MUNITO_CHILD_UNTIL`, default 2026-11-14T06:00:00Z**. Gonka, Grokified, ZeroGPU, Lyceum stop for everyone at their own `*_LEARNER_UNTIL`, default the same instant (`services/providers/openai-credit.js` L17, L34-35). **Munito, Coral and Gladia have no end date for 13+ learners**: their `learnerOn()` is only "not switched off" (`munito.js` L42, `coral.js` L38, `gladia.js` L23). Only Coral's live fact check has its own end (`pool.js` `refusal`, L586-595, `CORAL_LEARNER_UNTIL`, same default instant).
5. xKiro: its learner window ended 2026-11-07T05:59Z (`xkiro.js` L43-45) and the pool never gives xKiro slots to learner calls anyway (`pool.js` L404, `candidatesFor` L649 filter). UnoRouter, Crouton, AIHubMix: never learner data (pipeline only; AIHubMix has a key on the server but no app code path found).

## 2. What the live server (root@192.209.63.151, /srv/savant) is configured with

By name only. `/srv/savant/.env` holds keys for: NVIDIA, Anthropic (plus a separate FACT_CHECK_ANTHROPIC key), OpenRouter (plus per-model GLM/DeepSeek/GPT-SOL keys), Gemini, MiMo (Xiaomi), Munito, Coral, Gonka, Grokified, ZeroGPU, Standard Compute, xKiro, UnoRouter, AIHubMix, Gladia, LLM Gateway, Modelflare (four keys). **No** Lyceum key. systemd sets only PORT, TRUST_PROXY, COLD_FIRST_BLOCK, ONBOARDING_V2.

What the absence of switches means (from the code defaults):
- No `MODELFLARE_ENABLED`: Modelflare is dropped from placement and from every chain (`providers/index.js` L190). It never carried learner data. The keys are still on the server.
- No `AI_LEGACY_PROVIDERS`: MiMo, OpenRouter (paid routes) and Gemini are out of the text chains even though `AI_PROVIDER_*` variables name them (values not read). I could not read those values, so I did not confirm which provider each chain is set to.
- No `*_LEARNER=off` anywhere: Munito, Coral, Gladia, Gonka, Grokified, ZeroGPU learner use is **on** by default. Lyceum has no key, so it cannot answer on the server.
- No `STANDARD_COMPUTE_PIPELINE=1`: Standard Compute serves only the tutor slot. `STANDARD_COMPUTE_TUTOR` is unset and defaults to **on** (`tutor-standard-compute.js` L45), key present, so the tutor is live on it. Its ledger file was last written 7 Nov 04:06 (consistent with real use; a copy could look the same).
- No `GEMINI_FREE_TIER_CONFIRMED` and no `data/free-tier-evidence.json` on the server: Gemini free tier is **off** in the chain. OpenRouter `:free` (key present) is **on** in the chain.
- No Ollama installed on the server (no binary, nothing on 11434): the "local" tier does not exist there; learner calls that the lineup would keep local simply go to NVIDIA first.
- Local Whisper model files exist on the server (`data/models/Xenova`), the fallback for uploaded audio.
- No MAIL_* variables: the app server installs no mail transport (`utils/mailer.js`); email goes out only from scripts (`scripts/beta-invites.js`, `scripts/health-watch.js`) via Resend or Brevo (`utils/mail-transports.js`), run wherever those scripts run, which I could not see.
- Spanish gateway list (`data/spanish-gateway-users.json`) holds 1 account id.
- The server's code, including `public/privacy.html`, is the same files as main (all stamped 7 Nov 10:08; server not a git checkout, so equality is by date only).
- Ledger files last written: Coral 7 Nov 04:06, Standard Compute 7 Nov 04:06, Munito/Gladia/Gonka/Grokified 4 Nov, LLM Gateway 29 Oct.

## 3. The map (company, what it gets, whose data, clearance end, evidence)

"Learner-class" = carries a signed-in learner's content when that learner's outside-AI consent allows it. Children: "child with parent opt-in" means under the age of consent with an active parental consent whose `third_party_ai` scope is on.

| Company | What it can receive | Whose data | Clearance / end | Evidence |
|---|---|---|---|---|
| NVIDIA (build API, free tier) | The default first stop for every learner-class text call that no added provider takes: tutor chat when the paid tutor slot is not used, chat help, question coach, essay marking, typed-answer checking, Spanish writing/speaking marking, scorecard reading of messages, lesson-writing summaries, anything with a `userId`. | All consenting learners, adults and children with parent opt-in. Typed words, answers, interests, tutor notes, uploaded-material passages, first name (tutor only), age band as an instruction. | No end date. Terms for retention/training: unknown (NVIDIA privacy page does not address API inputs). | `providers/index.js` L99-130 (chain); `services/ai.js` L204-215, L248-256; `pool.js` L404-415 |
| OpenRouter (`:free` models: NVIDIA Nemotron, Google Gemma) | Same as NVIDIA when NVIDIA fails a call (chain fallback). The paid/legacy OpenRouter routes are off. | Same as above | No end date. OpenRouter says it does not train on inputs itself but some model providers may; free models are not distinguished. Retention period of inputs: not stated. | `providers/index.js` L101; `free-apis.js` L1-30, L182; server has key |
| Anthropic | Last resort in every learner chain, when everything before it fails or is unavailable, behind a spend ledger. Also a separate key reads lesson claims to fact-check (content; may contain interest-based examples in personalised levels, not verified). | Same as NVIDIA when reached | No end date. Anthropic: API data deleted within 30 days; training use of API data not stated on the page I read (check Commercial Terms). | `providers/index.js` L99, `order()`; `services/fact-check-anthropic.js` L1-20 |
| Standard Compute (stdcmpt.com) | Tutor tasks only: `dock_help` (the chat reply), `dock_leak_check`, `tutor_memory_fold` (summarises chat transcripts), `tutor_facts`. Prompt includes first name, notes, page text/question, recalled past messages, learner-model summary. | Cleared learners; refused for under-13 without active consent+opt-in. A child of 13-17 or a child with parent opt-in can reach it. | No end date in code; tied to the tutor ledger ceiling ($16). Terms: the code header itself says retention and training terms for children's data are unknown. | `tutor-standard-compute.js` L17-35, L45, L58-90; `pool.js` L613-635; `tutor-context.js` L282-300; `tutor.js` L225-250 |
| Coral | Tutor `dock_help` and `dock_leak_check` (named as the only extra slot for them), first lesson writing ("urgent" lane), lesson/level writing, part changes, live fact check of replies (includes the tutor reply and, for typed-answer marking, the learner's answer), materials tasks, level editor. | Consenting learners; under-13 with parent opt-in until 14 Nov 06:00Z; 13+ no end | 13+: no end in code. Fact check: 14 Nov 06:00Z. Terms: unknown (no page found). | `coral.js` L11-16, L38; `ai.js` L159-164, L209-212; `pool.js` L573, L586-595; `model-lineup.json` L821 (dock_help), L1162, L1172 |
| Munito (DeepSeek, GLM) | Lesson/level writing, part changes, session analysis (`analyze_session`), item regeneration after a failed level, personalisation reading (`personalize_read`), essay prompt writing, materials tasks (course, notes, pack, podcast script, verify), level editor. | Same as Coral | 13+: no end in code. Under-13 with opt-in: 14 Nov 06:00Z. Terms: unknown (no page found, munito.ai/privacy returned 404). | `munito.js` L1-19, L42; `model-lineup.json` L802, L925, L1067, L1083 |
| Gonka (broker, GLM and DeepSeek) | Same task list as Munito (session analysis, regen, personalise, parts, materials, lessons). | Same | 14 Nov 06:00Z for everyone (code default). Terms: unknown. | `openai-credit.js` L17, L34-35; `gonka.js` L3 |
| Grokified (Grok 4.3 / 4.7) | Lesson/level writing, part gates, materials tasks. 4.3 also verifies facts. | Same | 14 Nov 06:00Z. Terms: unknown. | `grokified.js` L4; `model-lineup.json` L802, L896 |
| ZeroGPU (GLM 5.3 Flash) | Live fact check (`fact_live`), fact verification. | Same (reply text; typed answer for marking) | 14 Nov 06:00Z. Terms: unknown (zerogpu.ai/privacy 404). | `zerogpu.js` L3; `model-lineup.json` L232, L1172 |
| Lyceum (GLM 5.3) | Materials fact check, fact verification. | Would be materials passages | No key on the server, so it cannot receive anything there now. Ends 14 Nov 06:00Z anyway. Terms: unknown. | `lyceum.js` L4; server `.env` names |
| Gladia (speech-to-text) | **The learner's uploaded audio, and the audio track of an uploaded video**, first route; local Whisper only on failure. | Consenting 13+ learners (children cannot upload at all). Under the gate rules, under-13 with opt-in is blocked by the upload ban. | **No end date in code.** Terms: audio retention not stated; training use of customer audio not stated (I read the notice). | `material-audio.js` L1-12, L41-47, L281-290; `material-video.js` L68-86; `gladia.js` L23 |
| LLM Gateway (ElevenLabs voice, xAI grok-stt, as it routes them) | Spanish speaking practice recordings and speech lines; the tutor's voice (tutor reply text) and push-to-talk listening. | Only accounts on the operator's gateway list (currently 1 account). Adults only by the page's wording; code checks only the list and, for the tutor, nothing about age. | None in code (list-controlled). LLM Gateway says it stores only metadata by default and does not train on customer data; the companies behind it have their own terms (listed on its provider page). | `spanish/voice.js` L24-45, L250-265, L296-350; `routes/tutor.js` L84-107 |
| Xiaomi MiMo (speech) | Spanish speaking recordings sent for transcription (`/api/es/asr`, `/api/es/upload` for audio files). Not in the text chains. | Non-child learners only (child accounts are blocked by the gate). No consent flag is checked beyond that gate. | No end. Terms: unknown. | `spanish/voice.js` L266-284; `routes/spanish/index.js` L111-136; `consent.js` L532-550 |
| Google (Gemini TTS) | Spanish lines to be read aloud (text of the lesson line, up to 600 characters, supplied by the browser). Not the learner's words by design; I did not find a path that reads learner text through it. | Anyone signed in | Google's terms: unpaid use may improve Google products and be read by reviewers; paid use is not used that way. The server's key status (paid or free project) is unknown. | `spanish/voice.js` L208-235; `routes/spanish/index.js` L99 |
| Google / Apple / Microsoft (browser speech recognition) | **Audio from the Speak button in the tutor chat, and Spanish speaking when the server route fails.** Chrome's recognizer sends audio to Google (Safari: Apple, Edge: Microsoft). Savant never sees this route. | Any learner with a microphone permission. A child whose microphone is off by the parent is blocked by the response header `Permissions-Policy: microphone=()` (not tested). | None. Not controllable by Savant. | `public/js/tutor-dock.js` L17, L254-309; `public/spanish/js/ui/widgets.js` L239-247; `routes/consent.js` L635 |
| Modelflare | **Nothing.** Writes placement quizzes only if `MODELFLARE_ENABLED=1`, which is not set; never learner data. Banned by the owner. | n/a | n/a | `providers/index.js` L190; server env names |
| xKiro, UnoRouter, Crouton, AIHubMix | Nothing learner-related. Build pipeline only. xKiro's dated learner window closed 7 Nov 05:59Z and it is not wired to learner calls in the pool. | n/a | n/a | `xkiro.js` L43; `pool.js` L404 |
| Resend or Brevo (email) | Email addresses and message text: beta invites to applicants (script), and, if a transport is installed, parent consent emails. The app server installs none. | Applicants; parents | Unknown which is used, where scripts run. | `utils/mail-transports.js`; `utils/mailer.js` L1-15 |
| Onidel (ONI 6, New York) | Hosts everything, including the database. | All | 3 months from 4 Nov (owner's note). | server |
| YouTube / web pages (read by our server) | Only the address a learner gives; our server fetches the page or captions. No learner content is sent. | n/a | n/a | `material-youtube.js`, `material-web.js` |

## 4. By kind of data

| Data | Where it can go (server config, as of 7 Nov) |
|---|---|
| Typed words in tutor chat | Standard Compute (default on), Coral (`dock_help`), NVIDIA, OpenRouter free, Anthropic; the live fact check also sends the reply to Coral/ZeroGPU until 14 Nov |
| Answers to questions (typed, marked by a model) | NVIDIA, OpenRouter free, Anthropic; live fact check of the feedback sends the typed answer to Coral/ZeroGPU (`ai.js` L909) until 14 Nov |
| Interests, hobbies, dislikes, difficulties, strengths, scorecard measures | In lesson/level-writing prompts to Munito, Coral, Gonka, Grokified, NVIDIA and the rest of the chain (`learning-spec.js` header) |
| Uploaded material text (paste, file text, transcript, link text) | Munito, Coral, Gonka, Grokified, NVIDIA chain for building notes/packs/podcast scripts; a few passages per tutor question to the tutor providers |
| Uploaded audio and video audio | Gladia first (13+ consenting), else local Whisper; children cannot upload |
| Spanish speaking audio | MiMo (default), LLM Gateway (gateway-list account), browser recognizer (Google/Apple/Microsoft) as fallback |
| Tutor memory and notes | Summarised by Standard Compute (default) or the chain; the kept summary and some recalled lines go in later tutor prompts |
| First name | Only in the tutor chat prompt (`tutor-context.js` L282). Not found in other prompts |
| Email | Never in a model prompt (only scrubbed from tutor output, `tutor-context.js` L367). Goes to the email provider |
| Age | As an instruction ("young learners") in lesson prompts and as `age` in the tutor's safety directives; birth month and country never sent to a model |
| Children's data | Yes, for a child with a parent's outside-AI opt-in (and, for the added providers, only until 14 Nov for under-13). Never uploads. Not provably excluded from training anywhere: every vendor's terms are unknown or unread |

## 5. Tutor call work (branch `tutor-giraffe`, NOT live, read only)

- New: `services/tutor-call.js`, `public/js/tutor-call.js`, `routes/tutor.js` (`/api/tutor/call/start|hear|say|end`).
- Learner speech goes either to **LLM Gateway grok-stt** as 16 kHz WAV (only accounts on the gateway list, speech only, silence not uploaded) or to the **browser's own recognizer** (Google in Chrome) for everyone else who may call. The tutor's voice is **LLM Gateway ElevenLabs (`eleven-flash-v2-5`)** for list accounts, otherwise the browser's voice.
- Access: needs the microphone allowed (`camera_mic`) and outside AI allowed (`ai_free_text`), so a child needs both parent choices. Paid speech needs the gateway list as well.
- Kept: seconds, dollars, delays; never audio. The recognised words follow the same route as typed chat (same providers as section 3).
- Evidence: `git show tutor-giraffe:services/tutor-call.js` header and `info()` (L61); `services/spanish/voice.js` diff. Browser recognition on the call path (`tutor-call.js` L38, L127, L487) is undisclosed on the current page.
- When it ships, the page needs a line for browser speech recognition and a line that the call's voice and listening use LLM Gateway and the companies it routes to.

## 6. Not verified

- The values of `AI_PROVIDER_*` (names only allowed), so the exact chain order on the server.
- Whether the server's Gemini key is on a paid or free project, and what Resend/Brevo run where.
- Anything about Coral, Munito, Gonka, Grokified, ZeroGPU, Lyceum, Standard Compute, Onidel terms: no page found or readable. xAI and ElevenLabs terms were not read.
- Whether the browser microphone block for children works for SpeechRecognition on every browser (inferred from the header, not tested).
- Whether the memory note "under-age testers get full access for the test launch" is implemented on any branch: this branch's consent gate does not do it, so the trace follows the code as written.
- That the deployed code equals main (same date stamps only).
