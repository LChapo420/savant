# Uploads of any format: what Savant takes in, what it understands, and what it proves

Owner's goal (2 Nov 2026): a learner can upload any kind of their own material; Savant gets everything it is about and everything it
stresses, cheaply (local or free first), and builds personalized material from it that teaches the same things, at least as much, as
fast as possible.

## How to read the numbers

Every number below carries one of three labels. None is a real learner's result.

- **MEASURED**: a real engine (the parsers, tesseract.js, Whisper) ran on a synthetic fixture and a script scored it
  deterministically. Repeatable with `node scripts/uploads-proof.js matrix` and `node scripts/materials-formats-test.js`.
- **AI-JUDGED**: a free model judged a result (NVIDIA's free tier, nemotron-3-ultra and nemotron-3.5-lightning, for the course runs; xKiro's
  $0 models, MiniMax M3.1 Flash and Mistral Large, for the blind handouts). The writer and the judge came from the same pool, so treat it
  as a screen, not as proof.
- **SIMULATED**: a model played the student (answered an exam from the generated material only).

Fixtures are original, general-knowledge text rendered into every format by `scripts/lib/upload-fixtures.js` (jszip, a small PDF
writer, a small OLE writer, sharp for pictures). They were NOT made by Word, LibreOffice or Google, so a format's real-world
quirks are covered only where this document says so. "Held-out" means a second document written in a different voice after the
extractor (`vaccines`); two generic gaps it showed (a cap on points for short documents, and a cue sentence about the sentence
before it) were fixed, so it is no longer pure held-out. The truly blind set is three handouts written by a free model with its own
planted points and levels (section 4).

## 1. Formats: before and after

"Before" is `main` at 3c98256 run on the same fixtures (MEASURED). Text recall = the share of the planted key sentences found whole
inside one sentence of the extracted text.

| Format | Before | After | Text recall (after) | Time | Cost | Route |
|---|---|---|---|---|---|---|
| PDF with a text layer, maths in the text | supported, plain text | supported, plus headings (type size), bold (font name), pages | 100% | 0.25-0.35 s | $0 | pdfjs (unpdf) in a child process |
| PDF of scans | refused ("upload pictures") | **supported**: the page pictures are pulled out of the PDF and read by OCR | 83% (10 of 12 sentences, 2 pages) | 6.5 s for 2 pages | $0 | unpdf `extractImages`, sharp, tesseract.js |
| DOCX | supported, plain | plus headings, bold, key-point boxes (Quote, Key Point, Callout, Important, Note styles) | 100% | 0.35-0.46 s | $0 | mammoth |
| DOC (legacy Word) | not supported | **supported**: text through the OLE piece table (no styles) | 100% | 0.1 s | $0 | own reader, no dependency |
| PPTX | supported, plain | plus slide titles, bold runs, speaker notes (a "this will be on the exam" in the notes lifts that slide's main point) | 100% | 0.2 s | $0 | jszip |
| ODP | not supported | **supported** (titles, text, bold, notes) | 100% | 0.2 s | $0 | jszip |
| XLSX, ODS, CSV | XLSX and CSV yes; ODS no | all three; every sheet | 100% | 0.0-0.2 s | $0 | jszip, text |
| ODT, EPUB, RTF | supported, plain | ODT and EPUB gain headings and bold; RTF unchanged | 100% | 0.1-0.25 s | $0 | jszip |
| TXT, MD, HTML | supported | HTML gains headings, bold, blockquotes; MD/TXT read as written | 100% | under 0.15 s | $0 | text, regex |
| LaTeX | read as raw source (3.4 KB of commands) | sections, `\textbf`, theorem/definition/box environments; comments and preamble dropped | 100% | 0.1 s | $0 | own converter |
| Jupyter (.ipynb) | read as raw JSON (3.3 KB) | markdown cells as notes, code cells as code with outputs, cell numbers as places | 100% | 0.1 s | $0 | JSON |
| Source code | supported (raw text) | unchanged | 100% | 0 | $0 | text |
| Subtitles SRT / VTT | read as raw cues: 22% text recall (cues split sentences, timestamps in the way) | **cues merged into "[m:ss]" lines**, rolling auto-captions de-duplicated, tags dropped | 100% | 0.07 s | $0 | own parser |
| PNG, JPG (notes, screenshots) | supported only if tesseract.js was installed | same engine, plus preparation (EXIF rotation, greyscale, contrast, enlarge small pictures) | clean render 100%, screenshot 100%, tilted+shaded+blurred photo 100%, whiteboard font 100% (7 sentences each) | 1.9-2.5 s | $0 | tesseract.js |
| Handwriting | no | works for a legible handwriting font: 86% (6 of 7); real hand-writing is not measured | 86% | 2.5 s | $0 | tesseract.js (see "Not supported") |
| WEBP, GIF, TIFF | refused | **supported** (converted to PNG first) | 100% each | 2.1-2.5 s | $0 | sharp, tesseract.js |
| BMP | refused | **supported** (24 and 32 bit, decoded in the app because libvips has no BMP reader) | 100% | 2.4 s | $0 | own decoder, tesseract.js |
| HEIC | refused ("not supported") | detected, refused with a way forward: share as JPG | n/a | 0 | $0 | see "Not supported" |
| Audio WAV / MP3 / WebM | supported if the Whisper model is present | same, **with a fix** (below) | 89% each (95 s of speech) | 12-13 s | $0 | whisper-tiny.en, local CPU |
| M4A | decode failed for phone recordings with the index at the end | **fixed**: decoded through a short-lived temp file | 78% | 12 s | $0 | ffmpeg, whisper-tiny.en |
| Video MP4 | supported if ffmpeg and Whisper present | same | 78% | 13 s | $0 | ffmpeg, whisper-tiny.en |
| YouTube link | captions only | captions only, now keeping each point's time in the video | proven with stub captions, not against YouTube | | $0 | caption track |
| Web page | supported | unchanged | not re-measured | | $0 | SSRF-guarded fetch |
| Google Docs / Slides / Sheets (public link) | not supported | **supported**: the link is rewritten to the file's DOCX / PPTX / XLSX export and read like an upload (the web-link box accepts it). A private file gets a plain "share it with anyone who has the link" message | rewrite and refusal proven; **no live Google fetch was made** | | $0 | export URL, SSRF-guarded fetch |
| ZIP of mixed files | refused | **supported**: up to 40 files, each read by its own reader, junk and unreadable files listed with a reason, no ZIP inside a ZIP | 100% (md + docx + csv + png, program skipped) | 2.1 s | $0 | jszip |

**A bug the audio proof found in the code that was already there.** Whisper was called without segment timestamps. Without them the
model stops after its first segment of each 30-second window and drops the rest: on the read lecture the old call kept 78% of the
planted sentences and, in the first window, only "Welcome back." (the sentence the lecturer said twice and called exam material was
lost). With `return_timestamps: true` the same window keeps everything: 89%. MEASURED, `services/material-audio.js`.

## 2. What the material model now holds

`services/material-keypoints.js` (no model, no network, no cost) reads the structure each parser keeps and stores, per material:

- **key points**: one sentence each, with an **emphasis weight 1 to 5**, the signals behind it, a **source location** (page, slide,
  notebook cell, file in a ZIP, or `m:ss` in a recording), the offset in the stored text, and a repeat count;
- **topics**: the headings, weighted by what is stressed beneath them;
- **assessed items**: the worked examples and exercises (they lift the weight of the statement they use).

Signals: boxed or "KEY POINT:" lines (2.0), "on the exam / you need to know" (2.5), bold sentence (1.6), summary or objectives section
(1.5), "I'll say that again" (1.5), "important / remember / must" (1.0), bold term (0.9), restated elsewhere (0.9 each, to 2.0), used
by an exercise (0.8), definition (0.6), topic sentence (0.6), formula (0.4). weight = min(5, 1 + 0.85 x score). A short cue on its own
("Remember this." "That will be on the exam.") stresses the sentence before it; a cue in speaker notes stresses the slide's strongest
point; a cue about a sentence stresses that sentence.

Evidence status (3 Nov 2026, curriculum-build/evidence-article/09-nov3-builds.md): that signals such as headings, overviews, summaries and pointer words improve recall of text structure and transfer is supported by abstract-checked studies (Mautone & Mayer 2001; Lorch et al. 1993; Rickards et al. 1997), and that the units of a passage judged most important dominate recall is shown by Brown & Smiley 1977. The weights above (2.0, 2.5, 1.6 and so on) and the 3.4 coverage threshold are design values: no study sets them.

## 3. Key points and emphasis, per format (MEASURED, planted points)

Development document `tides` (12 planted points, levels 1 to 5), held-out-ish `vaccines` (10), per format. "Stressed" = planted
level 2 or more. Rank correlation = Spearman between the planted level and the assigned weight over the matched points. Level-1 points
(plain facts nothing stresses) are not expected to be key points; the course still teaches them through the outline.

| Format | Stressed recall tides / vaccines | Rank corr tides / vaccines | Note |
|---|---|---|---|
| Markdown, HTML, DOCX, ODT, EPUB, notebook | 100% / 100% | 0.83-0.88 / 0.85-0.87 | headings, bold and boxes survive |
| PDF | 100% / 100% | 0.93 / 0.77 | headings by type size, bold by font name; a drawn box is only seen when it carries a "KEY POINT:" label |
| PPTX, ODP | 100% / 86% | 0.86 / 0.71 | boxes are "KEY POINT:" bullets; notes cues work |
| LaTeX | 100% / 86% | 0.76 / 0.98 | |
| TXT, RTF, DOC (no formatting) | 100% / 100% | 0.58-0.64 / 0.93 | only wording and repetition show emphasis |
| CSV, XLSX, ODS | 22% / 57% | n/a | statements in cells carry no emphasis; text recall is 100% |
| SRT / VTT (spoken, `lecture`) | 83% | 0.72 | the lecturer's repetition and "this will be on the exam" put the top point at weight 5 |
| Pictures and scanned PDF | n/a | n/a | OCR returns words, not weight: a bold or boxed line in a photo is not seen (see "Not supported") |

## 4. Blind test: documents written by a free model (MEASURED, AI-authored fixtures)

A free model wrote three ~650-word handouts (law-making, compound interest, the heart) in its own mix of emphasis devices and listed
its own key points and levels. The extractor had never seen them. Planted points the model marked "plain clarifying detail" at level 2
or 3 carry no emphasis device in the text and are the main misses.

| Document (planted points) | Format | Text recall | Key-point recall | Stressed recall | Rank corr |
|---|---|---|---|---|---|
| blind1: How a Bill Becomes Law in a Two-Chamber Legi (11) | markdown | 100% | 73% | 67% | 0.64 |
| blind1: How a Bill Becomes Law in a Two-Chamber Legi (11) | docx | 100% | 73% | 67% | 0.64 |
| blind1: How a Bill Becomes Law in a Two-Chamber Legi (11) | pdf | 100% | 73% | 67% | 0.61 |
| blind1: How a Bill Becomes Law in a Two-Chamber Legi (11) | same text with the formatting removed | 100% | 64% | 67% | 0.70 |
| blind2: The Basics of Compound Interest and the Rule (6) | markdown | 100% | 67% | 67% | 0.94 |
| blind2: The Basics of Compound Interest and the Rule (6) | docx | 100% | 67% | 67% | 0.94 |
| blind2: The Basics of Compound Interest and the Rule (6) | pdf | 100% | 67% | 67% | 0.94 |
| blind2: The Basics of Compound Interest and the Rule (6) | same text with the formatting removed | 100% | 50% | 33% | 0.87 |
| blind3: How the Heart Pumps Blood Through the Body (6) | markdown | 100% | 100% | 100% | 0.59 |
| blind3: How the Heart Pumps Blood Through the Body (6) | docx | 100% | 100% | 100% | 0.59 |
| blind3: How the Heart Pumps Blood Through the Body (6) | pdf | 100% | 83% | 80% | -0.20 |
| blind3: How the Heart Pumps Blood Through the Body (6) | same text with the formatting removed | 100% | 67% | 80% | 0.95 |

Mean over the three documents: markdown and DOCX stressed recall 78%, rank correlation 0.72; PDF 71% and 0.45; the same text with its formatting stripped 60% and 0.84 (only wording and repetition left to go on). The extractor does not reach the 95% target on these AI-authored documents: what it misses are points the author called "plain clarifying detail" but weighted 2 or 3, plus one bold sentence in the compound-interest handout, and the PDF rank correlation is low on the heart handout (-0.20).


## 5. Coverage gate in the course builder

`services/course-builder.js` now: (1) tells each skill's writer which key points its passages stress, with weights, and asks for the
heaviest first, said once; (2) attaches a stressed point whose passage the outline skipped to the nearest skill; (3) **gates**: after
the build, every point of weight 3.4 or more (two real signals) must be taught by some skill (its words found in that skill's
lesson, key points or questions); a miss triggers one revision of that skill; a point still missed after that keeps the course
"partial", never "ready", and is listed in `uncovered_keypoints`. `keypoint_coverage` records the share. Proven deterministically in
`scripts/materials-formats-test.js` with a scripted model: lazy model -> partial with the points listed after one revision; model
that teaches on the revision -> ready; model that teaches at once -> ready and no revision.

## 6. Proof: generated course, exam, study time (AI-JUDGED, SIMULATED)

| Run | Document | Builder | Result | Planted points taught (judge) | Of those, level 4-5 | Exam answered from generated material | From source (control) | Exam weighted by emphasis | Source words -> lesson words | Study minutes source -> generated |
|---|---|---|---|---|---|---|---|---|---|---|
| run 1 | tides | as it was before (no key points) | ready, 8 skills | 100% | 100% | 100% | 100% | 100% | 474 -> 1360 | 2.1 -> 5.9 |
| run 1 | tides | stress prompt + gate | ready, 7 skills | 75% | 100% | 88% | 100% | 96% | 474 -> 1371 | 2.1 -> 6.0 |
| run 1 | blind1 | as it was before (no key points) | ready, 7 skills | 91% | 100% | 62% | 88% | 52% | 1057 -> 1172 | 4.6 -> 5.1 |
| run 1 | blind1 | one of the two | build failed: the free models returned no outline (rate limits) | | | | | | | |
| run 2 (final code) | tides | one of the two | build failed: the free models returned no outline (rate limits) | | | | | | | |
| run 2 (final code) | tides | stress prompt + gate + length cap | ready, 6 skills | 75% | 100% | 88% | 100% | 96% | 474 -> 907 | 2.1 -> 3.9 |
| run 2 (final code) | blind1 | one of the two | build failed: the free models returned no outline (rate limits) | | | | | | | |
| run 2 (final code) | blind1 | stress prompt + gate + length cap | ready, 10 skills | 64% | 80% | 75% | 100% | 83% | 1057 -> 1358 | 4.6 -> 5.9 |

`tides` is the 474-word development document (12 planted points, 8 exam questions drawn from them); `blind1` is the free-model handout on
law-making (1,057 words, 11 planted points, 8 exam questions). "Gate" figures from the builder's own check: tides 9 of 9 points of weight
3.4 or more taught, blind1 7 of 7, no revision needed. Study minutes are words at 230 a minute.

What this does and does not show:

- **The gate held where it was checked, and it was never the binding constraint.** The free models taught every gated point on the
  first draw (no revision call was made in any run), so the revision path is proven only with the scripted model in the test.
- **Coverage of what the material stresses is complete; coverage of everything is not.** Every level 4-5 planted point was taught in all
  runs except one (blind1 run 2: 80%, 4 of 5). The judge found 64-75% of ALL planted points (level 1 included) taught in the
  stress-prompt runs against 91-100% in the old builder's runs. That is the likely cost of weighting by emphasis: the writer spends its words
  on the stressed points and drops plain level-1 facts that nothing flagged. One run per arm cannot separate that from judge noise.
- **Not "at least as much", not faster, on these runs.** Answerable from the generated material 75-88% in the new runs (old builder: 100% on
  `tides`, 63% on `blind1`) against 88-100% from the source (AI-judged, SIMULATED, 8 questions each, so one question is 12 points); the generated lessons are longer than the source (1.3x to 1.9x its words)
  even after the length cap (run 1 -> run 2 on `tides`: 1,371 -> 907 words, still 1.9x). The free models only partly obey a word cap.
  What the course adds that the source does not is practice, tiers and remediation, which this proof does not measure.
- **The runs are noisy and small.** Two documents, one run each, builds that sometimes failed on rate limits, a judge from the same
  model family, and different exam questions in each run. Differences of a few points between rows are not findings.


## 7. Not supported, and exactly why

- **HEIC photos**: sharp's prebuilt libvips reads only AVIF-flavoured HEIF (no HEVC decoder, patent-encumbered), so HEIC is detected and
  refused with "share as JPG". Adding it means a HEVC-capable libheif build or a converter binary on the server; not done.
- **Emphasis inside pictures and scans**: tesseract.js returns words and confidence, not font weight, size or boxes. A bold line on a
  whiteboard photo is read as text but not weighted. A vision model could read it; learner pictures may not go to any pipeline-only
  provider, and no learner-class vision route exists in `services/ai.js`, so this was not built. Cue words ("important", "exam")
  still work in OCR text.
- **Real handwriting**: tesseract is a printed-text engine. A handwriting-style font gives 86%; a real hand is expected to be much worse
  and was not measured (no real handwriting fixtures; no real learner data). A small local vision model (the machine has 4 GB of VRAM)
  or a learner-class vision model would be the route; neither is built.
- **Scanned PDF beyond one picture per page, and PDFs with a text layer drawn over a picture of a scan**: the page pictures are pulled
  out of the PDF, which is how almost all scanners write them; a PDF that draws vector text or tiles pictures is not rendered (no
  canvas library is installed). At most 40 pages are read by OCR.
- **Formatting in DOC, RTF, XLSX, ODS and CSV**: DOC and RTF are read as text only; spreadsheets carry cells, not emphasis.
- **Colour, highlighter and shaded boxes** in Word, PDF and slides: only styles named Key Point, Callout, Important, Note, Quote,
  Intense Quote and Block Text, a "KEY POINT:" or "Important:" label, bold, and blockquotes are seen. A yellow highlight or a shaded
  table cell is not.
- **Google links**: public links only, and the live fetch was not exercised here (no Google file to fetch); the export URLs and the
  refusals are tested. Whether Google serves exports to a server user-agent without a sign-in is the one thing to try by hand.
- **YouTube, web pages**: unchanged and not re-measured; YouTube still needs captions.
- **Real files from real software**: every fixture was written by this repository's code. Word, Google Docs and Keynote exports
  have quirks (nested tables, tracked changes, comments) that are untested.
- **Audio quality**: whisper-tiny.en is the only model on the server. It mishears ("neap" as "nip", "bays" as "base"); a larger model
  (base.en, small.en) would be more accurate and slower; not installed.

## 8. Where things are

- `services/material-formats.js` new formats and structure; `services/material-keypoints.js` key points, coverage, Spearman;
  `services/materials.js` routing and storage; `services/course-builder.js` stress prompt and gate.
- Tests: `scripts/materials-formats-test.js` (in `npm test`). Proof: `scripts/uploads-proof.js`; results in
  `docs/uploads-proof-results.json`. Fixtures: `scripts/lib/upload-fixtures.js`.
- Money: $0 on every provider. No Modelflare, no Anthropic key, no Standard Compute. Free judges: NVIDIA free tier, then xKiro $0 models.

## 9. Bigger proof (4 Nov 2026; AI-JUDGED, SIMULATED; builds are noisy and reps are few)

`scripts/uploads-proof-big.js`; rows in `docs/uploads-proof-big-results*.json`, the fixed exam in `docs/uploads-proof-big-exam.json`, the
table in `docs/uploads-proof-big-summary.json`. 10 documents, each cut to at most 1,700 words: 3 planted (tides PPTX, vaccines DOCX, lecture
SRT), 3 written by a free model (law-making PDF, compound interest as a web page, heart as Markdown), 4 REAL files (Strunk's Elements of
Style, Wells' Short History of the World .docx, the US Constitution PDF, MIT OCW 18.01 lecture-notes PDF). Per document an exam of up to 5
questions on the points the extractor weights 2.5+ ("emphasised") and 4 on plain sentences nothing stresses ("plain"), written from the SOURCE by
NVIDIA nemotron. Answered from the source (control) and from the generated course by two judge families (Gonka GLM 5.3 Flash = A, Gemini
free-tier flash-lite = B), graded by the same judge. The builder was Gonka DeepSeek V4 Flash (a third family). One build per document and arm
(a second for the five small documents in two cases, and for OCW and the Constitution): NOT the planned two for every document. Not done: audio
through Gladia (no spoken fixture exists; the spoken case is the SRT lecture), PPTX/DOCX/PDF of the real files other than the ones listed.

Source control: judges answered 100% (A) and 90-95% (B) of both kinds from the source. From the generated course (before = main's rule, after = the fix):

| Documents | Lesson words / source words | Emphasised answerable A / B | Plain answerable A / B |
|---|---|---|---|
| 7 with emphasis, before | 2.27x | 96% / 92% | 66% / 57% |
| 7 with emphasis, after | 2.25x | 91% / 84% | 84% / 84% |
| 3 without emphasis (Strunk, Wells, Constitution), before | 0.95x | n/a | 58% / 58% |
| 3 without emphasis, after | 1.22x | n/a | 42% / 38% |

Findings:

- **The generated course is not shorter than the source** on 8 of 10 documents (1.5x to 3.8x its words; only Wells and the Constitution came out
  shorter). The 0.75 cap is a request the models ignore, and each skill has a 90-word floor. "Faster than the source" is not shown.
- **Plain facts are dropped, and emphasis is not the (only) cause.** Emphasised points are answerable at about the source's rate (91-96%), plain
  facts at 57-66% (source 93-100%). The three documents with nothing emphasised lose plain facts as much (58%), so it is the compression and the
  choice of what a lesson keeps, not the stress prompt. The tides case reproduced: 0% plain in two builds (it was 75% in the old note; one of four plain questions).
- **The fix** (`services/course-builder.js`, the stress rule and the lesson instruction): "emphasis only decides how many words a point gets,
  never whether it is taught; every other specific fact stays in a short clause; cut repetition and filler, never a fact". On the emphasised
  documents plain-fact answerability rose from 66/57% to 84/84%. Not shown to be free: emphasised answerability read 91/84% against 96/92%, and the gap
  is one OCW build (0 of 4, the other 3 of 4) and one vaccines question: 8 questions and one build cannot separate it from noise. The key-point gate is unchanged
  and every gated point was still taught in every build.
- **The fix does not help where nothing is emphasised**: Strunk (2.6x the source) and the Constitution (0.2x, 1 to 3 skills) lost facts in
  both arms; those are outline and compression failures of the builder, not covered here.
- Builds ended "partial" in most runs (a gated or question check missed after one revision); the first attempt with xKiro/MiniMax and Munito failed (their daily
  free quotas were spent), so those numbers are discarded, not reported.
- Spend: Gonka about $1.7 (ledger delta, other users included), NVIDIA and Gemini free tiers $0; no Anthropic key, Modelflare or Standard Compute.

## 10. Shorter lessons that keep the facts (4 Nov 2026; AI-JUDGED, SIMULATED; 2 builds per document, 10 documents, same exam and judges as section 9)

Rows: `docs/uploads-proof-big-results-short-rows.json` (20 builds). Causes found in section 9 and what was changed in `services/course-builder.js`:

- **A 90-word floor per skill and a cap measured on whole passages**: skills share passages, so each got the whole passage's words (and 4 to 9 skills x 90 words
  exceeded a short source). Now the budget is half the source's words, shared out by the skill's own share of each passage, with a 25-word floor; paragraphs
  and key points count together; an over-budget lesson (1.3x) is sent back once to be cut with every fact kept (`material_shorten`).
- **Plain facts dropped**: the writer now sees every key point of its passages (weights 1 to 5; weight only sets how many words, never whether it is kept), and the
  instruction says every name, number, date, term and cause stays as a short clause.
- **Builds ending "partial"**: a skill the model never answered (busy or timed out) is asked up to twice more before the build gives up on it. Most builds
  ended "partial" before; 11 of 20 now end "ready" (the rest: one missed gated point, or a skill that stayed unanswered).
- One skill per 700 characters (was 250): fewer, broader skills, so less repeated framing.

Result (builder Gonka DeepSeek V4 Flash, judges A = Gonka GLM 5.3 Flash and B = Gemini free tier; judge B often returned nothing, so its cells have fewer answers):

| | before (section 9) | after |
|---|---|---|
| Lesson words / source words | 2.27x (7 emphasised docs), 0.95-1.22x (3 plain) | 0.60x all 20 builds (one build 1.54x: Strunk rep 2), max otherwise 0.88x |
| Emphasised answerable A / B (7 docs) | 96% / 92% | 89% / 89% (BELOW before; 8-question exams, 14 builds: one or two answers) |
| Plain answerable A / B, 7 emphasised docs | 66% / 57% | 63% / 40% (NOT improved) |
| Plain answerable A / B, 3 documents without emphasis | 58% / 58% | 88% / 81% |
| Builds "ready" | 3 of 12 (about 1 in 4) | 11 of 20 |

Honest reading: length now falls well under the source and plain facts rose a lot where nothing is stressed, but on the emphasised documents the shorter lesson answers
slightly fewer emphasised and no more plain questions than before, so the goal "emphasised must not drop" is NOT met. A trial with a 0.65 share (not completed, stopped
early) came out near 0.66-0.86x with no better plain-fact answers (tides 0%), so the cap was put back to 0.5. Open: a deterministic sweep that checks every
source sentence with a number, a name or a definition against the lesson, and a measurement with more than 2 builds and more than 4 plain questions per document.
Spend: Gonka about $1.0 (ledger delta), NVIDIA and Gemini free tiers $0; no Anthropic key, Standard Compute or Munito.

## 11. Fact sweep, stronger judge, bigger exam, before re-measured (4 Nov 2026; AI-JUDGED, SIMULATED; NOT PASSED)

Added to `services/course-builder.js`: after the lessons, every source sentence with a number, a name, a definition or a stated cause is checked against its skill's
lesson (words of the lesson, key points and question text, not the question quotes); what is missing is added by one model call per skill in at most 18 words each,
each addition kept only if it stays inside the missing sentences' own words, up to 0.8x the source's words in all (`SWEEP_CAP`); the writer's own budget is 0.55x.
Measurement (`scripts/uploads-proof-big.js`, exam in `docs/uploads-proof-big-exam2.json`: up to 8 emphasised and 8 plain questions per document, 148 questions,
written from the SOURCE by NVIDIA nemotron): builder Gonka DeepSeek V4 Flash; judge A Gonka GLM 5.3 Flash (one answer call plus one grading call per question);
judge B Lyceum GLM 5.3 (`z-ai/glm-5.3`), ONE call per document and material that answers every question and then compares with the reference (the stronger judge
costs about 2 cents a call, so per-question calls would not fit the $3 cap; the single-call form is less strict). BEFORE was re-measured with the same judges and exam
by running main's course builder (commit 07e21f3) in the same script. Rows: `docs/uploads-proof-big-results-sweep-rows.json` (before 20 builds, after 19: one OCW build
failed).

| | before | after |
|---|---|---|
| Lesson words / source words (all builds) | 1.96x (max 3.99x) | 0.69x (max 0.90x) |
| Emphasised answerable A / B (7 docs) | 92% / 95% | 89% / 93% |
| Plain answerable A / B, 7 emphasised docs | 64% / 68% | 67% / 65% |
| Plain answerable A / B, 3 docs without emphasis | 76% / 79% | 85% / 81% |
| Builds "ready" | 11 of 20 | 12 of 19 |

Reading: the length goal is met on every build. Emphasised coverage is 2 to 3 points BELOW the before figure on both judges (13 builds, up to 8 questions each: a handful of
answers, so it may be noise, but the pass rule was "at or above"), and plain facts rose on three of four judge/group cells and fell 3 points on one. The pass rule is
therefore NOT met and the branch stays unmerged. Not tried: spending more words than 0.8x, or a sweep that also re-asks the judge. Spend: Gonka and Lyceum (about 60 judge calls
for B, roughly $1 to $2) from the shared ledgers, NVIDIA free; no Anthropic key, Standard Compute or Munito.

## 12. The whole upload path driven with files (6 Nov 2026; MEASURED, synthetic fixtures; `node scripts/uploads-drive.js`)

77 cases through `materials.addFile`, the recording and video jobs (real ffmpeg, real Whisper tiny.en, real tesseract.js, Windows speech voice for the spoken fixtures): all 16 text and
Office formats, 6 picture types, a scanned PDF, a mixed ZIP, truncated / byte-flipped / header-only copies of 9 formats, empty, one byte, whitespace, 50 characters, random bytes, a
program header, audio and video bytes sent to the document box, a blank picture, 700 KB and 5 MB of text, 21 MB, and for recordings: empty, text, a tone with no speech, a cut-off WAV,
speech as WAV and MP3, a cut-off MP3, and for video: with speech, with no sound track, cut off, junk. Found and fixed (before: what a learner saw):

| Case | Before | Now |
|---|---|---|
| Plain text in Windows-1252 (an old Word "save as text") or UTF-16 | refused as "unknown type" with the long format list | read; a note says it was read as Windows-1252 |
| A program or data file starting with "MZ" and mostly control bytes | "too little text" (it passed as text) | refused as an unknown type |
| A DOCX/PPTX/XLSX/ODT/EPUB cut off (download stopped) | "That ZIP could not be opened, or holds too many files" | "looks damaged or cut off (the end of it is missing). Download or export it again" |
| An RTF cut off | read silently, half the document, no word | read, with a note that it ends without its closing bracket |
| A scanned PDF of more than 40 pages | the first 40 pages read, the rest dropped silently | read, with "Only the first 40 of N pages were read. Upload the rest as a second file" |
| Scanned pages OCR could not read, or pages with no picture | dropped silently | counted and listed in a note ("page 3, 7") |
| A text PDF whose pages 3 and 9 are pictures of text | those pages silently missing | note: pages 3 and 9 had no readable text, with what to do |
| Files of a ZIP that were skipped (programs, over 20 MB, unreadable, past 40) | kept in the row but never shown | listed in a note with the reason for each |
| A recording (WAV, MP3, M4A, WebM, Ogg) or a video put in the document box | "unknown type" | sent to the recording / video route automatically (a job with progress), or a plain refusal that names the transcriber |
| A WAV cut off before its first sound, or 24-bit / 8-bit / "extensible" WAV | "The transcription stopped unexpectedly" (a thrown offset error), or "only 16-bit supported" | a plain "cut off" message; 8, 16, 24 and 32-bit PCM and float WAV are read |
| A 40-page scan: one request open for minutes, no progress | the page sat on "Uploading and reading it..." | after 6 s the request returns a job; the list shows "reading (page 12), 30%"; the result lands in the list; the tab can be closed |
| A body over 20 MB | HTTP 500, "Something went wrong on our side" | a JSON 413 "too big", the limits named |
| Spoken or photographed text that is not English (Whisper tiny.en and tesseract eng read English only) | garbage text, no warning | a note: this does not look like English; paste the text for other languages. The recording box now says English only |
| OCR worker started per page | about 1 s extra per page | one worker is reused and released 8 s after the last page |

Not fixable here and said so: a truncated MP3 or byte flips inside a legacy DOC or RTF body are not detectable (the decoder returns the part it has: the cut MP3 read 40% of the
speech and gave no sign), and tesseract.js is an optional dependency that this folder's `node_modules` lacks (the picture and scan rows ran with it on `NODE_PATH` and its English
data from `data/models/tesseract`): on a server without it, pictures and scans are refused with "This server cannot read text from images yet" (`npm install` installs it).
Results from this run: 77 of 77 cases as intended; timings 0.0 to 0.6 s for text formats, 2.4 to 3.3 s per picture, 7.7 s for a 2-page scan, 12.5 s for 95 s of speech.

## 13. Held-out test of short mode, a retention-goal fix, and upload build speed (6 Nov 2026; AI-JUDGED, SIMULATED; GATE NOT PASSED, short mode stays OFF)

Short mode (section 10 and 11 code) is merged behind `UPLOAD_SHORT=1`, default off; with it off the builder is the full one as before. This round added: the sweep also checks every point
the material stresses (weight 2 or more), `UPLOAD_SWEEP_CAP` for proofs, and then measured on six NEW documents (`docs/uploads-heldout-docs.json`, written after the code was frozen by
NVIDIA nemotron, Gonka GLM 5.3 Flash and Gemini; formats docx, pdf, md, html, epub, odt; the builder never saw them). Builder Gonka DeepSeek V4 Flash. Exam written from the source by
nemotron (up to 8 emphasised and 10 plain questions per document). Two judge families, neither the builder's: Z = Gonka GLM 5.3 Flash, G = Mistral Large via xKiro. Rows:
`docs/uploads-heldout-results*.json`; `node scripts/uploads-heldout-proof.js report`. Partial run: 19 of 24 planned builds (a second rep on some documents did not finish; the processes were stopped).

| | full (builder as it was) | short |
|---|---|---|
| builds, "ready" | 11, 8 | 8, 8 |
| lesson words / source words | 2.71x (max 4.37x) | 0.81x (max 1.09x) |
| emphasised answerable Z / G | 80% / 78% | 88% / 82% |
| plain answerable Z / G | 91% / 89% | 78% / 76% |
| all questions Z / G | 86% / 84% | 79% / 77% |
| paired per document, short minus full, plain, Z | | mean -18 points, worst document -40 (h2, h5) |
| paired, emphasised, Z | | mean +8, worst document -14 |

Reading: the length goal is met (0.81x against 2.7x). The gate (coverage of emphasised AND plain at or above the full version, on held-out documents) is NOT met: plain facts fall 18
points on both judges, worst on the history narrative with no emphasis (-40) and the invented rule-book with specifics that cannot be known from general knowledge (-40). Emphasised
coverage rose but on 1 to 7 questions a document, with the full arm's emphasised score pulled down by builds that ended partial with one skill (h6 full r1: 1 skill). So the sweep fixed the
emphasised side and the plain side got worse. Not tried: a sweep that covers every sentence with a stated fact rather than 12 to 16 per skill, or a 1.0x cap (still half the full length).
Emphasised questions per document: h1 5, h2 0, h3 7, h4 1, h5 1, h6 6.

**Personalisation on extreme learners: not proven.** `scripts/uploads-heldout-proof.js learners` builds one course per random extreme learner (traits at the tails, odd interests, ages 9 to
61, ESL, test date) and has both families check each trait and list invented facts. Only 1 learner finished before the free and cheap slots saturated (full builder; 2 traits, age 9: Z found
1 of 4 traits followed, G 2 of 4; invented claims 1 and 3). That is one learner, not a result, and it points at weak following; the run is the tool for the next round.

**What was fixed for personalisation:** a test date set as a material's retention goal now makes every part built from it (lesson, questions, notes, podcast, pack, practice test)
a "prepare for a test" spec (`services/learning-spec.js`, `materialId`); before, the date changed only the review schedule. Language: the product is English only for launch
(PRODUCT-DECISIONS); the reading level and "English is a second language" were already in the spec. `services/study-goal.js` is another agent's and was not touched.

**Upload build speed (bug sweep: notes 261 s, pack 135 s, path 421 s+ on saturated free slots).** Cause: uploads auto-built notes and the pack as BACKGROUND work, which never uses a paid
slot and leaves one free permit, so on busy free models it waited minutes while the learner was already looking at the page. Fix (`services/material-autobuild.js`): the build runs in the
WAITING lane on the fast lane (`pool.runForeground(..., { fast: true })`): a cleared learner's calls go to the paid fast slots first (existing consent clearance), any other call overflows
to the cheapest paid slot after 8 s, free slots answer when they can. `UPLOAD_BUILD_LANE=background` restores the old behaviour. `services/pool.js` was not edited.
Measured through the real pool with a simulated learner (`scripts/uploads-speed.js`), while six proof processes were loading the same providers: notes 59 s background (nemotron) -> 11 s
waiting (served by Gonka GLM 5.3 Flash, paid, a few tenths of a cent); pack over 170 s (killed) -> 130 s. One run each: indicative, not a distribution. The learning-path build was not
re-timed here. Progress for slow reading of scans and ZIPs is in section 12.

## 14. Round 2 (6 Nov 2026; AI-JUDGED, SIMULATED): why full mode is 2.7x, a better plain-fact sweep, the path build, extreme learners

**Why full mode is 2.7x the source (max 4.4x).** Not one cause: (1) one skill per 250 characters, so 8 to 15 skills for a 400 to 650-word handout; (2) a 90-word floor per skill, so
the floor alone is 700 to 1,350 words; (3) every skill writes 2 to 5 paragraphs plus up to 6 key points that restate them, and each skill re-frames the topic; (4) the 0.75 cap is
measured on whole passages that several skills share. Short mode removed all four and then lost plain facts (section 13).

**Sweep v2/v3 (`UPLOAD_SWEEP_V2=1`, with `UPLOAD_SWEEP_CAP`, `UPLOAD_SWEEP_NEED`, in short mode only).** Every source sentence is checked, not only those with a number or name; what the model's
short additions still leave missing is added as the source's own sentence, stressed ones first, until the cap. Held-out gate, same six documents and exam as section 13, builder Gonka DeepSeek
V4 Flash, judges Z = Gonka GLM 5.3 Flash and N = NVIDIA nemotron (the xKiro Mistral judge hit its daily allowance), 1 build per arm and document, generated text now stored in the rows
(`docs/uploads-heldout-r2/`). Emphasised exam questions per document: h1 5, h2 0, h3 7, h4 1, h5 1, h6 6.

| arm | lesson words / source | emphasised Z / N | plain Z / N | all questions Z / N | ready |
|---|---|---|---|---|---|
| full | 2.70x (max 4.17) | 81% / 77% | 93% / 86% | 88% / 81% | 5 of 6 |
| v2 (need 0.6, cap 1.0) | 0.91x | 93% / 90% | 82% / 82% | 84% / 83% | 5 of 6 |
| v3 (need 0.85, cap 1.15) | 1.13x (max 1.20) | 87% / 90% | 88% / 87% | 87% / 87% | 5 of 6 |

v3 against full, paired per document: plain Z -5 points (worst document h4: -37.5), plain N +1, emphasised +5 / +10. The gate (plain AND emphasised at or above full on held-out documents) is NOT met:
plain on judge Z is 5 points under and one document, h4 (dense pharmacology notes, one partial build), is 25 to 37 under. The length is 2.4x shorter than full. `UPLOAD_SHORT` stays OFF. Not tried: a
cap above 1.15, a second rep to separate h4 from a bad draw.

**Extreme-learner personalisation (23 learners, 4 held-out seeds 7201 to 7204; half have a test-date goal).** Builder ZeroGPU GLM-5.3 Flash; judges Coral DeepSeek V4.1 Flash (C) and NVIDIA nemotron (N),
6,000 output tokens each; each judge checks every stated trait against the course and lists invented facts. Traits at the tails, odd interests, ages 9 to 61, ESL.

| | judge C | judge N |
|---|---|---|
| learners judged | 23 | 22 |
| traits followed, mean | 62% | 66% |
| worst 1% / 5% / 10% of learners | 14% / 29% / 40% | 14% / 40% / 40% |
| test-date learners / others | 58% / 68% | 68% / 63% |
| invented facts per course | 5.2 (none in 0 courses) | 1.1 (none in 13) |

Most missed: "needs a worked example for everything" (19 misses), "anxious when tested: no test language" (11), age (9 and 9), "needs very plain words" (8), "cannot take dense text" (6), "wants the shortest version" (6).
Courses for these learners are 5.0x the source's words on average, so the length traits are not met. This is a failing result, not a proof: the course follows its learner about two times in three, and the
brevity learner gets a longer course. The next lever is the lesson prompt block (it is present and being ignored) and the brevity cap (the learner's `skillShare` only changes how many skills, not the words).

**The learning-path build.** Cause of the 421 s+ wait: `material_lesson`, `material_shorten`, `material_sweep` and `material_podcast` had no `allow` list in `config/model-lineup.json` (only notes, pack,
outline and verify did), so a learner waiting on a lesson could not overflow to a paid slot and queued behind saturated free models. They now carry the same cheap list as notes. The course route also
runs in the waiting lane, and the page shows "Start studying the first N now" as soon as one skill exists (the study map already accepted a building course). Timed once through the real pool
(`scripts/uploads-speed.js waiting course`, simulated learner, 440-word source, six proof processes finishing alongside): before, outline at 46 s and no skill after 12 minutes (stopped);
after, outline 43 s, first skill 139 s, all 7 skills ready at 304 s. One run each, indicative.

## 15. Round 3: a course that follows its learner (6 Nov 2026; AI-JUDGED, SIMULATED; GATE NOT PASSED, `UPLOAD_FOLLOW` stays OFF)

Behind `UPLOAD_FOLLOW=1` (`services/course-follow.js`, hook in `services/course-builder.js`): after each skill's lesson is written it is checked against the learner's spec and rewritten up to twice with the problems named
(task `material_follow`, same cheap paid overflow list as the other material tasks), keeping the better draft and at least 75% of the passage's terms (50% under a word cap). Checks: the spec's own (sentence length, long words, interests,
avoided domains) and added ones: worked example, no test language (anxious learner; question prompts also lose "test/quiz/exam"), tiny chunks or full paragraphs (done by splitting or merging, no model call), stretch line, "Try first" line,
adult and young registers, a "Watch out" line for a test date (all restating only the passage). A learner with a brevity preference gets a real word budget per skill (a share of its passages' words, `skillShare` x 1.4, 0.3 to 0.9) enforced by the
shorten pass. Which of the two moves matters (switchable with `UPLOAD_FOLLOW_PARTS=cap,checks`), seed 7301, 6 learners each:

| condition | traits followed, judge C / N | shortest-version learner lesson words / source |
|---|---|---|
| base (today) | 62% / 57% (24 learners) | 2.0 to 3.6x (9 learners) |
| cap only | 55% / 48% | 0.91x (1 learner) |
| checks only | 73% / 60% | 7.4x (1 learner) |
| both | 73% / 77% (24 learners) | 0.55 to 1.16x (9 learners; 6 of 9 at or under 1.0) |

So the word budget moves length and nothing else, the checked rewrite moves the traits and nothing about length; neither alone is enough. Builder ZeroGPU GLM-5.3 Flash, judges Coral DeepSeek V4.1 Flash (C) and NVIDIA nemotron (N), 6,000 output tokens,
new held-out seeds 7301 to 7304, 6 learners each (24; N returned nothing for some courses so n is 21 and 19 there), half with a test date. The judge list no longer holds the contradictory pair "ignores interests" and "likes X": the earlier proof (section 14)
asked both of one course; this changes the harness, so base was re-measured under it.

| gate | required | base | both | met |
|---|---|---|---|---|
| traits followed, mean | 90% | 62% / 57% | 73% / 77% | NO |
| worst 10% of learners | 70% | 33% / 33% | 38% / 50% | NO |
| shortest-version learner at or under the source's length (lesson and key points) | all | 0 of 9 | 6 of 9 (max 1.16x) | NO |
| same, whole course with practice questions | all | 4.0 to 6.2x | 2.7 to 4.5x | NO |
| invented facts per course, C / N | no higher than base | 4.9 / 0.38 | 4.1 / 0.42 | C yes, N +0.04 (no) |
| emphasised and plain exam score vs today's full mode, held-out documents, brevity persona | not lower | | emphasised -34 / -29 points, plain -14 / -23 (11 of 12 builds) | NO |

The exam gate is unchanged by the switch for a learner with the default spec (the pass does nothing for them); for a learner who wants the shortest version it costs coverage by construction, which is the real tension between "shortest" and "no
lower than full" and is not resolved here. Most missed traits with the switch on: age (34 and 61: the "Why it matters" line was added but judges often did not credit a register), "likes dense text", "wants the shortest version" (courses are still 2.7x+ with
the practice questions), anxiety (test words survive in question choices and quotes), "holds focus a long time". Rewrites made: 305, accepted: 172. Not tried: shrinking the question set and their explanations for a brevity learner, a rewrite of the questions
themselves, a per-trait second pass on the courses that still miss. Rows with the full course text: `docs/uploads-heldout-r3/`; first version of the checks: `docs/uploads-heldout-r3-v1/`; persona exam rows: `docs/uploads-heldout-r3x/`.

## 16. Round 4: select instead of cut, questions, registers, invented facts (6 Nov 2026; AI-JUDGED, SIMULATED; GATES NOT ALL PASSED, `UPLOAD_FOLLOW` stays OFF)

**What was built (behind `UPLOAD_FOLLOW=1`; select mode is on with it, `UPLOAD_FOLLOW_SELECT=off` turns it off).** For a learner who wants it short, the course is no longer written long and cut: it is written short (all stressed points shown to the
writer, a reading budget of 0.25 to 0.45 of the source), then the round-2 sweep adds the source's OWN stressed sentences first and then other sentences with numbers or names, until the budget is spent; the practice set keeps one question per stressed
point (at least 3, at most 5) with a one-sentence explanation. Anxious learners: test words are also removed from question choices and from the quote shown. A third rewrite attempt plus a form-only fallback line ("Why it matters: the next ideas build on this.",
"Try first", "Stretch", "Watch out") when a trait is still missing. Any rewrite that adds a number or a name not in the passages, the old lesson or the learner's interests is refused (deterministic, `newClaims`). Dense-text lovers get merged prose (key points folded in).

**Reading the courses (item 3).** I read the courses of three 34 and 61-year-olds. They do contain "Why it matters" lines (8 to 10 per course), so the judge's "is 61 years old" miss is partly a judge that has no test for age. But the courses also deserved some of
it: the line was the same sentence in every skill, and a learner who "needs very plain words" got "kinematic framework" and "ductile asthenosphere". The judge was not changed. Two things in the harness make some misses unwinnable and were counted, not hidden: 6 of 24
learners carry contradictory traits (tiny chunks AND likes dense text; holds focus a long time AND cannot take dense text). Leaving them out moves the mean by under 1 point (base 63.9 / 64.1 on 20 learners; both 74.0 / 75.3 on 18), so contradictions do not explain the gap.
"Likes dense text": the threshold for merged prose was 5 sentences per chunk and the spec gave 4; chunks and the fixed Takeaway / Quick check lines were fragmenting the text (mean paragraph 12 to 23 words for learners who like dense text). Fixed (threshold 4, key points folded in); the effect on that trait was not isolated.

| gate (new seeds 7501 to 7504, 24 base, 22 with the switch; N failed to answer on some) | required | base C / N | switch on C / N | met |
|---|---|---|---|---|
| traits followed, mean | 90% | 63% / 62% | 74% / 75% | NO |
| worst 1% / 5% / 10% of learners | 10%: 70% | 25 / 25 / 29% and 25 / 30 / 43% | 30 / 33 / 38% and 40 / 43 / 43% | NO |
| shortest-version learner, whole course incl. questions, at or under the source | all | 1.8 to 2.8x (3 learners) | 0.69 to 0.84x (3 learners; lessons 0.76 to 0.91x) | YES on 3 learners (small n) |
| invented facts per course, C / N | no higher than base | 5.6 / 0.42 | 5.1 / 2.18 | C yes, N NO (+1.8) |
| emphasised and plain exam vs full mode, brevity persona, 6 held-out documents | not lower | | see below | NO |

Persona exam (brevity 95, plain words, anxious, worked examples, small chunks; builder Gonka DeepSeek V4 Flash; judges GLM Z and nemotron N; `docs/uploads-heldout-r4x/`): full mode emphasised 89 / 88, plain 96 / 94. Round 3 (cut after writing): emphasised 55 / 61, plain 80 / 69.
Select mode: emphasised 89 / 74 (GLM equal to full; nemotron -13, from h1 where one judge answered 1 of 3), plain 68 / 60, lesson 0.85x (max 1.79 on h4), whole course 1.2 to 2.4x. So selecting recovered the emphasised points on one judge (from -34 to 0) and halved the plain loss
only partly (-28 / -35 points). h4 (dense pharmacology notes with doses and drug names): plain 50% against 100% and 88%: its facts are a list of small specifics, each needing a sentence of its own, and at 0.45 of the source's words they do not fit.

**Which gates cannot be reached together, and the price in numbers.** (a) Shortest-version at or under the source WHOLE (0.7 to 0.84x) is reached; with it, plain facts fall 28 to 35 points under full mode and emphasised stays level on one judge and falls 13 on the other. (b) Plain at or above full needs
about the sweep-v3 length: 1.13x of the source for the lessons alone on default learners (plain -5 / +1, emphasised +5 / +10, section 14), which is over the source; the whole course would be 1.8x or more. So for the same learner "at or under the source" and "no plain loss" cannot both hold with this machinery; to hold plain the
owner would give up "shortest is shorter than the source" (take about 1.1x lessons, 1.8x whole), to hold the length the owner would give up about 30 plain-fact points on a brevity learner (about 1 plain fact in 3 not taught). (c) Traits mean 90% and worst 10% 70% were not reached by any variant (62 to 75%); the misses left are age,
"cannot take dense text", test-anxiety wording and plain words. (d) Invented facts on judge N rose with the rewrites even with the deterministic number and name refusal (0.42 to 2.18; judge C fell 5.6 to 5.1): the additions are not numbers or names, they look like analogies and "why it matters" claims; the judge's lists were not stored to confirm which.
Rewrites: 474 asked, 167 accepted. Spend: ZeroGPU, Coral and Gonka cents per run, all well under the $5 run cap; ledgers are cumulative and shared.

## 17. Uploads made whole (6 Nov 2026; MEASURED where a script scored it, AI-JUDGED and SIMULATED where a model read it; no real learner)

**Which invented-facts judge to believe.** `scripts/uploads-judge-calibrate.js` (rows `docs/uploads-judge-calibration.json`), four documents, three to two reads each: the source's own sentences (nothing can be invented), a real course with what I flagged by hand repaired ("clean"), the same plus six planted claims (a number, a name, plain general knowledge, a why-it-matters claim, a swapped fact, an analogy with a claim), and the real course with its questions.

| Judge, form | source sentences | clean | planted recall | real course (with questions) |
|---|---|---|---|---|
| C (Coral DeepSeek), free-form list | 0 | 0 | 88% | 6.75 |
| N (NVIDIA nemotron), free-form list | 0 | 0 | 92% | 0.45 |
| Z (Gonka GLM 5.3 Flash), free-form list | 0 | 0 | 100% | 3.42 |
| K (Lyceum Kimi K3.1 Pro), free-form list | 0 | 0.25 | 100% | 3.75 |
| C, sentence by sentence | 0 | 0.75 | 100% | |
| N, sentence by sentence | 0 | 0 | 100% | |
| Z, sentence by sentence | 0 | 0 | 100% | |
| K, sentence by sentence | 0 | 0.75 | 100% | |

My own read of the four real courses' lessons found 4, 7, 6 and 3 over-reaching claims: about 5 a course. So N's 0.42 misses real ones, though it finds planted ones: what is planted is easy, and what a writer really adds ("this ensures...", "selectivity is dose-dependent") is quiet. C's 5.1 was near the truth in number but counted the made-up cases of practice questions (a judge reading the questions flags "a company pays rent of $1,000"), and the rise to 2.18 on N was real rewrites. K's flags on my clean texts were real misses of mine ("only at high doses" where the source says "at high doses"), so its 0.25 to 0.75 are not false alarms. The gate judge is therefore the sentence-by-sentence form: Z and K. Kimi's real cost: $0.028 a call, 92 calls $2.55, about $0.15 per course judged; a judge, see below for why not in the build.

**The fix, on by default (`services/material-factcheck.js`, `UPLOAD_FACTCHECK=off`).** Every lesson sentence, key point, skill summary and question explanation, and every note bullet, card back, pack summary, model answer and podcast turn:
- no model first: a number, year or date nowhere in the material, or a capitalised name nowhere in it, or a purpose word ("ensures", "helps", "crucial") no matching line uses, is refused whatever a model says; a sentence whose words and numbers sit in one line of the material in the same order, with the same negation and no new cause, passes with no call;
- the rest go to two readers at once, DeepSeek and GLM by task (`material_factcheck_deepseek`, `_glm`), with any reader as the fallback; either one saying "not in the source" is enough, and it gives the sentence with only that part cut;
- a cut is checked again (no new words of its own); a sentence with no good cut goes, and the material's own line behind it comes back if the lesson no longer says it; a lesson with nothing left becomes the material's own sentences; a bad explanation becomes the quote; a card back or note bullet becomes its verified quote;
- no answer at all: only what the deterministic pass can stand behind stays, and the course stays "partial" so that asking again checks it again.

Other languages: a material not written in English gets an English course, as before, but the spelling rules step aside (the readers judge a translation) and the learner gets a note saying so. Before this the check cut a Spanish lesson from 321 words to 67.

Which readers, measured with one judge over the same texts (C, sentence form, h1 h3 h4 h5 h6): DeepSeek alone 1.4 a course, GLM alone 1.2, Kimi alone 0.6, DeepSeek and GLM together 0.6, those two and then Kimi as a third 0.4. Kimi as the only reader cost $0.24 a course against about $0.003 for the two cheap ones and cut more (h1 1,278 to 895 words) for the same score, so it stays a judge. `UPLOAD_FACTCHECK_READERS=1` keeps one reader.

