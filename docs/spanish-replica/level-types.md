# Level types: your curriculum vs Duolingo

Every Level Type / Activity in `Spanish_Fluency_Path.csv` is built as a playable
level in the host app (Polymath copy), with sample content written for the test
lab. Try them at **http://localhost:6767/spanish/lab** (start the server with
`node scripts/spanish/serve-local.js` from the repo folder).

Screenshots of each one: `replica/lab-screens/` (regenerate with
`node scripts/spanish/lab-screenshots.mjs <outDir>` while the server runs).

## One level = one level type

Each topic level in the lab holds only its own kind of page:

| level | only these pages |
| --- | --- |
| Lesson | new-word picture cards, select the meaning, match pairs, select the translation, word-block translation |
| Speaking | Speak this sentence |
| Listening | What do you hear? · What does this mean? · Tap the picture you hear (no speaking, no word blocks, no typing) |
| Pronunciation | one sound tip, then Say this word / Speak this sentence |
| Reading | read a sign or short text, answer the question |
| Writing | typing only (Write this in Spanish, Complete the translation) |
| Translating | Write this in English / Spanish (word bank or keyboard) |
| Game / Topic (error correction) | Find and fix the mistake |
| Review Game | Choose the missing word |

The other level types are already single activities, each its own page type: stories, the listening lab, dictation, the conversation lab, the fluency sprint, sound refresh, reading block, the writing labs, project, live conversation, mission and the six games.

A few of them include a second step **because their CSV row says so**:

- **Listening Lab:** "…then repeat-after-me".
- **Story:** "…then say two captions aloud".
- **Unit Intro:** "…repeat them, and guess their meaning".
- **Sound Refresh:** "…then record and compare".
- **Unit Check, Checkpoint, Final, Entry Check:** mixed by definition ("spoken and typed answers, error correction, listening"; "listening, reading, a recorded speaking sample and a short writing sample").

## 1. In your CSV and in Duolingo: built to match Duolingo

| CSV Level Type / Activity | in CSV | Duolingo equivalent | lab level |
| --- | --- | --- | --- |
| Lesson / Topic | 1,503 | Lesson node (star) | Welcome to Spanish |
| Speaking / Topic | 382 | Speaking practice (mic node) | Sí, no, por favor… |
| Listening / Topic | 184 | Listening practice (headphones) | Hola, adiós… |
| Writing / Topic | 159 | Typing challenges | Spelling numbers in words |
| Translating / Topic | 140 | Translation challenges | Relaying simple information |
| Review Game / Topic | 63 | Practice session (no hearts) | Where things are: estar and hay |
| Story Episode / Input Session | 721 | Stories (serialized) | Episode 1: El café de Rosa |
| Story / Story | 635 | Stories | Story: Hola, hotel |
| Listening / Listening Lab | 627 | DuoRadio | Radio Hola |
| Speaking / Conversation Lab | 721 | Roleplay / Video Call (Max) | At the café counter |
| Quiz / Unit Check | 721 | Unit review / personalized practice | Unit Check: Unit 1.1 |
| Placement Test / Entry Check | 57 | Placement test ("Find my level") | Entry Check: Grade 1 |
| Game / Quick Game — Speed Match | (721 games) | Match Madness | Quick Game: Speed Match |

What "built to match" covers, the same as Duolingo's lesson loop:

- **Top bar:** X to quit (with a "Wait, don't go!" confirmation), a progress bar that only grows on correct answers, and hearts.
- **Checking:** CHECK, then a green or red feedback sheet with the solution and Report, then CONTINUE. Enter does both.
- **Hearts:** you lose one the moment an answer is marked wrong. At zero you get the out-of-hearts dialog.
- **Combos:** 5 and 10 in a row turn the bar gold, and the mascot comes out to cheer.
- **Mistakes:** missed items come back under "Previous mistake" after a "Let's review the exercises you missed" screen.
- **Skipping:** SKIP counts as wrong. "Can't speak now" and "Can't listen now" switch those exercises off for an hour.
- **Grading:** accents and typos are accepted with a nudge ("Pay attention to the accents").
- **Shortcuts:** number keys pick answers, and Backspace removes the last word block.
- **Translation input:** a word bank with a "Use keyboard" toggle, plus an accent bar (á é í ó ú ñ ü ¿ ¡).
- **Bubbles:** characters talk with animated mouths, and you can tap any word for its meaning and audio.
- **Ending:** a lesson-complete screen (XP, accuracy, time), then a streak screen.

Challenge types inside lessons:

- Select the image
- Select the correct meaning
- Select the correct translation
- What do you hear?
- What does this mean? (audio)
- Tap the matching pairs
- Write this in English/Spanish (word bank or keyboard)
- Tap what you hear
- Type what you hear
- Speak this sentence
- Choose the missing word
- Complete the translation
- Complete the chat
- Read and respond (signs and passages)
- Which word do you hear? (minimal pairs)
- Find and fix the mistake
- Sound tips
- Record and compare

## 2. In your CSV, close to something Duolingo has: built in its style

| CSV Level Type / Activity | in CSV | closest Duolingo thing | what was added |
| --- | --- | --- | --- |
| Pronunciation / Topic | 124 | speak challenges | vowel tips, "which word do you hear?" pairs, scored speaking |
| Reading / Topic | 380 | "read and respond" | a lesson of real-world sign and passage reading |
| Game / Topic (error correction) | 44 | — | find-the-error, then pick the fix |
| Dictation / Dictation | 506 | type-what-you-hear | full dictation run; word-by-word diff tags each error **sound / spelling / accent** for the error log |
| Test / Checkpoint | 242 | old checkpoints / "Jump here" | listening + reading + recorded speaking (speech rate, pauses) + writing sample; **80% gate → targeted repair → free retake** |
| Game / Quick Game — Listen and Tap | | timed challenges | 3-minute clock, combo ×2, speed bonus, misses to review |
| Game / Quick Game — Word Race | | timed challenges | per-word countdown, type or say it |
| Game / Quick Game — Sentence Builder | | tap-what-you-hear | hear it, build it, against the clock |

## 3. In your CSV, not in Duolingo: new level types, built in its style

| CSV Level Type / Activity | in CSV | how it plays |
| --- | --- | --- |
| Preview / Unit Intro | 721 | goal + 5 key phrases → a short clip of two characters talking → repeat each phrase → guess the meanings |
| Speaking Game / Fluency Sprint (Chunk Speed Drill) | 378 | 3 timed speaking rounds (8 s → 6 s → 4 s per chunk), recognised and scored |
| Pronunciation / Sound Refresh | 173 | starts from the error log's weakest contrasts (r/rr, e/i), perception drills in different voices, then record and compare with the model |
| Reading / Reading Block | 219 | pick a text by interest, tap any word for meaning + audio, save new words, react in one Spanish sentence (AI replies and polishes it) |
| Writing / Writing Lab, Essay / Writing Lab | 88 + 229 | plan → draft with a live must-use checklist and word meter → AI feedback on 2–3 priorities → revise → compare with a model → rubric |
| Translating / Mediation Task | 139 | the writing lab with an English source text to explain in Spanish for a named reader |
| Final Test / Final | 57 | five-section grade exam weighted toward weak spots; 80% unlocks the next grade; repair + retake below it |
| Project / Grade Project | 57 | record audio (or video) → transcript → rubric → one revision → ordering exchange with the AI partner → combined score |
| Live Speaking / Live Conversation | 170 | choose tutor / exchange partner / peer (later) / AI stand-in; upload or record an excerpt → transcript → rubric; the AI stand-in is flagged as not real-person practice |
| Real-World Mission / Mission | 8 | brief → do it off-app → upload a recording or write a log → can-do self-assessment → milestone badge |
| Game / Quick Game — Fix the Sentence | | timed find-and-fix streak, with "No mistake" sentences mixed in |
| Game / Quick Game — Memory Pairs | | face-down Spanish/English pairs, new board when cleared |

## 4. In Duolingo, not in your CSV

| Duolingo level type | what it is | how it would fit |
| --- | --- | --- |
| Legendary challenge | replay a node harder (no hints, few mistakes) to turn it gold | lesson engine with hints off and a 3-mistake cap |
| Treasure chest node | reward stop on the path | a path feature, with gems/shop |
| Personalized practice (Practice Hub) | on-demand mistakes, words, speak, listen | Unit Check / Sound Refresh engines on demand |
| Adventures | walk a character around a scene to finish a task | needs a 2D scene engine; Conversation Lab covers the speaking goal |
| Video Call with Lily (Max) | free-flowing live AI voice call | Conversation Lab chat with streaming voice |
| Timed events (XP Ramp Up, Rapid Review) | limited-time bonus rounds | the quick-game shell |
| Duolingo Podcast | long intermediate episodes | the Listening Lab player with longer clips |
| "Jump here" unit test-out | skip ahead any time by passing a test | the exam engine per unit |

## What is real and what is a stand-in

**Real:**
- **Grading:** checked on the server, and the answers are never sent to the browser.
- **AI partner and AI scoring:** the conversation partner, writing feedback and every rubric use your AI providers.
- **Speech recognition:** MiMo ASR, fed WAV audio recorded in the browser.
- **Character voices:** Google Gemini text-to-speech, cached as files, so each line is paid for once.
- **Fallbacks:** every AI step has a built-in checker for when AI is off, and the browser's Spanish voice steps in when Gemini is over quota.

**Stand-ins:**
- **Progress is not saved.** Hearts, XP, streak and the review queue live only in the session or in browser storage. The SQLite learner tables in `replica/schema.sql` are the next milestone.
- **The content is mine**, written for the lab. The generation pipeline will produce your 10,169 levels in the same formats.
- **Characters, art and colours are placeholders**: Axo, Mara, Tomás, Rosa, Diego.

## Voices: what was tested (2026-10-13)

I generated the same Spanish sentence with each voice and transcribed the result:

- **MiMo TTS** (presets Mia, Chloe, Milo, Dean and `mimo_default`, plus the voice-design model): not understandable as Spanish. Example: "Dicen que el museo está cerrado los lunes" came back as "De se que o mochil está cedado do lute".
- **Gemini TTS** (`gemini-2.5-flash-preview-tts`, voices Kore and Puck): transcribed word-perfect.
- **Decision:** Gemini for speaking, MiMo for listening (ASR).
- **Quota:** your Gemini key is on a free quota. When it runs out, the browser voice takes over. Production needs a paid Gemini key, or another native-Spanish TTS.
