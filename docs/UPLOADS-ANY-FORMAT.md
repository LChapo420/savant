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
