# Voice call speed (branch voice-fast, 8 Nov 2026)

Owner, 8 Nov: voice replies take "a decent amount of time"; wants "a perfect response but as fast as possible so it feels like a real conversation".
Rule kept: nothing is spoken before it passes the same safety and fact checks as a chat reply.

## What changed

| Switch (env, all default off) | What it does | Files |
|---|---|---|
| `TUTOR_VOICE_STREAM=1` | The call asks `POST /api/tutor/dock/stream` (NDJSON). The reply is streamed from the model; its first sentences (at least 40 characters) are checked on their own with the same checks as a whole reply (the fact guard's inline check for `dock_help` and the dock's fact check, side by side, then the same scrub) and spoken while the rest is written. The whole reply is then checked exactly as before. If it does not pass (held, replaced, written again), what is playing stops and the replacement is said, as the chat shows it. Not used with a question on screen or on method-only pages: those wait for the whole reply and its leak checks. The route also makes the voice itself: it starts the voice for the draft's first sentences while their checks run and sends that audio only if the words pass (otherwise it is dropped unheard). | `services/tutor-context.js` (onSentence, onChunk), `routes/tutor.js`, `services/tutor-call.js` (prepare, rest), `services/pool.js` + `services/providers/{nvidia,coral}.js` (streamed chat, one owner per hedged call), `services/fact-guard.js` (passesChunk), `public/js/tutor-call.js` (speakQueue), `public/js/tutor-dock.js` (askStream) |
| `TUTOR_VOICE_EOS=1` | The end of a turn is read from the words as well as the quiet: early words are sent at 120 ms of quiet; a finished sentence ends at 420 ms, a trailing word, filler or comma ("and", "um", "of", ",") waits up to 1.3 s; words that start again before the tutor talks are joined to the turn (the dropped turn leaves the chat and is not remembered). | `public/js/tutor-call.js` |
| `TUTOR_VOICE_FAST=1` | A short voice turn is written by Coral Fast first (DeepSeek V4.1 Flash, fast tier), Coral Standard next, the free slots behind. A cheap rule (`hardVoiceTurn`) keeps the usual lineup for maths, "step by step / prove / explain again", turns over 25 words, a worked-example plan, a question on screen, method-only pages and pictures. The voice turn's fact guard reads on Coral Fast first. Coral Fast serves `dock_help` only when a request names it first, so typed turns and their backups are unchanged. | `services/tutor-context.js`, `services/pool.js` (firstPick, first_pick_only), `config/model-lineup.json` |
| `TUTOR_VOICE_WARM=1` | When the learner starts or stops talking, the server opens connections to the services the turn will use (a HEAD request, no key, no words). The first speech-to-text call after a quiet spell was 0.97 s, the next ones 0.35 to 0.46 s. | `services/tutor-call.js` warm, `routes/tutor.js`, `public/js/tutor-call.js` |
| `TUTOR_CALL_ACK=1` | A short soft two-note sound 350 ms into the thinking, made in the browser (no request, no cost). | `public/js/tutor-call.js` |
| `TUTOR_VOICE_PICKER=1` | Learners on the paid voice pick the tutor's voice from the 20 ElevenLabs voices the code already allowed ("Voice in a call" in the chat panel, UI_V2 pill look). Kept on the account (`tutor_modes.voice`), used by the next sentence. Screenshots: `design-refs/voice-fast/`. | `services/tutor-mode.js`, `services/spanish/voice.js`, `routes/tutor.js`, `public/js/tutor-dock.js`, `public/css/tutor-dock.css`, `public/css/ui2/look.css` |

Also: a voice turn's dock fact check starts its backup reader after 0.7 s instead of 2.5 s (same check). `TUTOR_VOICE_TRACE=1` prints per-turn timings (numbers only) in the server log.
Consent is unchanged: a child without a parent's yes gets no call and no microphone, with every switch on (tested).

## Measured delay (real route, real models)

`scripts/tutor-call-real-delay.js`: Chromium with a synthetic 12-question clip (`delay12.wav`, Windows SAPI voice, 16 s gaps) as the microphone, real grok-stt, real tutor models and checks, real ElevenLabs flash voice through the LLM Gateway, synthetic adult account on a temporary database. Same prompts both runs. Before = main's code (measured before any change); after = this branch with STREAM, EOS, FAST and WARM on. n = 12 turns each. Milliseconds; p90 is nearest-rank. **Measured**, but on one PC, a fake microphone, no speaker or room echo.

| stage | before median | before p90 | after median | after p90 |
|---|---|---|---|---|
| end of speech (last sound to "they stopped") | 680 | 690 | 680 | 690 |
| speech to text, after the end | 158 | 435 | 33 | 147 |
| reply with its checks (to the first checked words) | 2266 | 4247 | 1284 | 1479 |
| first audio | 505 | 583 | 34 | 63 |
| **total, last sound to first sound** | **3812** | **5780** | **2137** | **2558** |

Worst turn: 7.21 s before, 2.70 s after. Best: 3.01 s before, 1.82 s after. Intermediate runs (same clip): stream + EOS + FAST on Coral Standard: median 3.61 s (Coral Standard's first token took 0.2 to 3.8 s that day); with Coral Fast: 2.61 s; plus WARM and the reused head-start voice: 2.14 s.

End-of-speech on mid-thought pauses (`pauses4.wav`: 4 questions, each with a 0.7 to 1.1 s pause inside; measured, n = 4 utterances): EOS off split all 4 into 8 turns and answered the fragments ("Australia." got "not quite the answer I was after"); EOS on kept 4 of 4 whole and answered each correctly. Total delay on those 4: median 1.88 s.

## Quality of the fast writer (AI-judged, not learner-measured)

`scripts/voice-fast-quality.js`: 30 held-out questions written after the rule (25 short, 5 hard on purpose), three synthetic learners (30, 15 and 74 years old) with a child's phrasing, slang, a sad learner and Spanish in the mix. Each question answered through the real dock route in voice mode with the switch off and on, on separate identical learners, order alternated; grok-4.3 (a third model family) compared each pair blind.

- The rule sent all 5 hard questions to the usual writer and 25 of 25 short ones to Coral Fast.
- Fact-check pass rate (replies not held by the checks): fast 24 of 25 (96%), current 25 of 25 (100%).
- False statements the judge found: fast 3, current 2. Preferred: fast 11, current 14, tie 0 (sign test p about 0.7: no clear difference).
- Mean scores (1 to 10): correct 8.88 vs 9.24, helpful 7.40 vs 7.96, spoken 8.36 vs 8.72, friendly 7.88 vs 8.32.
- Note: the "current" writer was itself Coral Standard (the same DeepSeek V4.1 Flash) in 21 of 25 turns, because the free Nemotron writer took over 2 s and the existing 2 s backup took over. So this compares the fast tier against today's real behaviour, not against Nemotron alone.
- Reading: no measured accuracy gain, a small, not significant loss on every score, n = 25. Not proven equal.

## What is still short of ~1 to 1.5 s, and why

About 2.1 s median now. What is left, measured:
1. **End of speech, 0.68 s.** The words come back from grok-stt about 0.35 to 0.6 s after they are sent, so even sending them at 120 ms of quiet they arrive after the 650 ms rule; the word-aware end cannot fire sooner than the words exist. A faster recogniser (streaming speech to text) is the lever; none on the gateway was faster (gpt-4o-mini-transcribe was refused on this route).
2. **The two checks before the first word, about 0.7 to 0.9 s.** The dock's fact check on Nemotron takes 0.6 to 0.9 s; the fact guard on Coral Fast about 0.35 to 0.5 s. They run side by side, so the slower one sets the pace. Speaking before them is not allowed. Letting Coral Fast also take the dock check sooner would save about 0.2 s, but then the writer and both checkers would be the same model family, so it was not done.
3. **The writer's first sentence, about 0.35 to 0.45 s** (Coral Fast first token about 0.2 to 0.3 s).

## What was not verified

Real phones (iOS Safari, Android Chrome), Safari on a Mac, Bluetooth headsets, a real room (echo, noise, a real voice instead of SAPI), slow mobile networks (each extra round trip costs more there), many calls at once (Coral account cap of 5 in flight), and real learners. After 14 Nov the added providers (Coral) drop out of learner use unless the owner renews it: the fast route then falls back to the free slots by itself and the delay goes back toward the before numbers.

## Cost of this build's measurements

About $1.02 LLM Gateway (voice and listening, 7 real calls), about $0.47 Coral, $0.04 Grokified (judge), $0.002 ZeroGPU. Coral and Gateway amounts are ledger differences over the session and may include a little use by the running app.

## To turn on

`TUTOR_VOICE_STREAM=1 TUTOR_VOICE_EOS=1 TUTOR_VOICE_WARM=1 TUTOR_VOICE_PICKER=1`; `TUTOR_VOICE_FAST=1` is the owner's call (quality above; Coral learner data window); `TUTOR_CALL_ACK` stays off unless wanted.

Tests: `scripts/tutor-voice-fast-test.js` (in the npm suite), plus the existing tutor-call, tutor-voice, tutor-full, tutor-dock, ui-v2, signin-gate and consent tests.
