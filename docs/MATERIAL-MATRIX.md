# Material matrix: what each kind of material becomes

Owner's order (30 Oct): any material should work, or fail with a precise, honest message. This table is what is
proven today and where. "Proven" means a test with a fixture runs in `npm test`; nothing here was tried with a real
model, a real speech model or a browser (that is S13, on the owner's machine).

| Type | Extracts text? | How | Proven by | Honest failure |
|---|---|---|---|---|
| PDF with a text layer | yes | pdfjs in a child process | `materials-test.js` | "hardly any text in that PDF" |
| PDF of scans | **no (OCR not built)** | none | `materials-test.js` (the error) | says scans are not readable yet |
| DOCX | yes | mammoth | `materials-test.js` | damaged / too little text |
| PPTX | yes | slides plus speaker notes | `material-inputs-test.js` | no slides / damaged |
| XLSX | yes | every sheet, one row per line, tab-joined | `material-matrix-test.js` | no sheets / too many rows |
| CSV, TXT, MD, LaTeX, source code | yes | read as UTF-8 text | `material-matrix-test.js` | not UTF-8 text is refused |
| HTML file | yes | scripts, styles and navigation dropped | `material-matrix-test.js` | too little text |
| EPUB | yes | spine order, XHTML chapters | `material-matrix-test.js` | not a usable EPUB |
| RTF | yes | control words and font tables dropped | `material-matrix-test.js` | too little text |
| ODT | yes | `content.xml` paragraphs | `material-matrix-test.js` | no document text |
| PNG, JPG (photos of notes) | **no (OCR not built)** | none | `material-matrix-test.js` (refused plainly) | "only ... files are supported" |
| Audio (mp3, m4a, wav, webm, ogg) | yes, if the Whisper model is installed | S8 background job | `material-audio-test.js` | says the model is missing |
| Video (mp4, mov, webm, mkv) | yes, same condition | ffmpeg audio, then the S8 job | `material-video-test.js` | no sound track / no model / no ffmpeg |
| YouTube link | yes, if the video has captions | caption track, never the video | `material-video-test.js` | no captions: upload or paste |
| Web link | yes | SSRF-guarded fetch, article text | `material-inputs-test.js` | private address, not a page, too little text |
| Pasted text / transcript | yes | direct | `materials-test.js`, `material-inputs-test.js` | too little / too long |

## Not yet proven (S10 remainder)

- OCR (`tesseract.js`) for scans and photos. Not installed.
- Building a study pack **and** a learning path (mocked models) from every type above; this slice proves extraction only.
  Once text is a material, the pack and path builders treat all kinds alike, but that is not yet shown per type.
- Real files from real software (Word, Google Docs export, Kindle-style EPUBs, Excel with dates and formulas): the fixtures
  here are small hand-built files. Excel dates are shown as their serial numbers; formulas show their cached value only.
