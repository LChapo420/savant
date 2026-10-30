/**
 * "Learn from your own material", S10 (first slice): every file type extracts usable text, or fails honestly.
 *
 *   node scripts/material-matrix-test.js
 *
 * Builds one small fixture per type in memory (ODT, EPUB, XLSX, RTF, HTML, CSV, Markdown, LaTeX, source code)
 * and runs it through materials.extract (the real parser child process). PDF, DOCX and PPTX are proven by
 * materials-test.js and material-inputs-test.js; audio, video and YouTube by material-audio-test.js and
 * material-video-test.js. Pictures go through fromImage with a stubbed recognizer (tesseract.js is optional
 * and must not be run here). The result per type is written up in docs/MATERIAL-MATRIX.md.
 */
const os = require('os');
const path = require('path');
const JSZip = require('jszip');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-matrix-test-${process.pid}.json`);
const materials = require('../services/materials');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

const FACT = 'Mitochondria make ATP by oxidative phosphorylation across the inner membrane, and the electron transport chain pumps protons into the intermembrane space. ';

/** A one-page PDF with no text on it at all: what a scan looks like to a text extractor. */
function blankPdf() {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<<>>>>',
    '<</Length 0>>\nstream\n\nendstream',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const P = FACT.repeat(3);

async function zip(files, first) {
  const z = new JSZip();
  if (first) z.file(first[0], first[1], { compression: 'STORE' });
  for (const [n, c] of Object.entries(files)) z.file(n, c);
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

(async () => {
  const fx = {};
  fx.odt = await zip({ 'content.xml': `<office:document-content><office:body><office:text><text:h>Cell energy</text:h><text:p>${P}</text:p><text:p>Second&amp;third<text:s/>part<text:line-break/>next</text:p></office:text></office:body></office:document-content>` }, ['mimetype', 'application/vnd.oasis.opendocument.text']);
  fx.epub = await zip({
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
    'OEBPS/content.opf': '<package><manifest><item id="c1" href="ch1.xhtml"/><item id="c2" href="text/ch2.xhtml"/></manifest><spine><itemref idref="c2"/><itemref idref="c1"/></spine></package>',
    'OEBPS/ch1.xhtml': `<html><head><title>x</title></head><body><h1>Chapter One</h1><p>${P}</p></body></html>`,
    'OEBPS/text/ch2.xhtml': '<html><body><h1>Chapter Zero</h1><p>Reading order follows the spine &amp; not the file names.</p></body></html>',
  }, ['mimetype', 'application/epub+zip']);
  const rows = [['Organelle', 'Job'], ['Mitochondrion', 'makes ATP by oxidative phosphorylation across the inner membrane'], ['Ribosome', 'builds proteins from messenger RNA'], ['Nucleus', 'stores DNA and controls what the cell does'], ['Golgi body', 'packs and ships proteins out of the cell'], ['Lysosome', 'digests worn out parts of the cell']];
  fx.xlsx = await zip({
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml': '<workbook><sheets><sheet name="Cell parts" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/sharedStrings.xml': `<sst>${rows.flat().map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((_, j) => `<c r="A${i}" t="s"><v>${i * 2 + j}</v></c>`).join('')}<c r="C${i + 1}"><v>${i}</v></c></row>`).join('')}</sheetData></worksheet>`,
  });
  fx.rtf = Buffer.from(`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times;}}{\\colortbl;\\red0\\green0\\blue0;}\\pard\\b Cell energy\\b0\\par ${P.replace(/,/g, '\\\'2c')}\\par Caf\\'e9 and \\u8212? dash\\par}`, 'latin1');
  fx.html = Buffer.from(`<!DOCTYPE html><html><head><title>t</title><style>p{}</style><script>alert(1)</script></head><body><nav>Home Login</nav><h1>Cell energy</h1><p>${P}</p><p>A&nbsp;&amp;&nbsp;B</p></body></html>`);
  fx.csv = Buffer.from(`organelle,job\n${rows.slice(1).map((r) => r.join(',')).join('\n')}\n`.repeat(2));
  fx.md = Buffer.from(`# Cell energy\n\n- **ATP**: ${P}\n\n> note\n`);
  fx.latex = Buffer.from(`\\section{Energy}\n$E = mc^2$ and \\begin{equation} \\int_0^1 x^2\\,dx = \\frac{1}{3} \\end{equation}\n${P}`);
  fx.code = Buffer.from(`// ${P}\nfunction atp(n) { return n * 32; }\nmodule.exports = { atp };\n`.repeat(2));
  // 45231 is 2023-11-01 in Excel's day numbers.
  fx.dates = await zip({
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml': '<workbook><sheets><sheet name="Dates" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/styles.xml': '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd hh:mm:ss"/></numFmts><cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="22"/><xf numFmtId="164"/><xf numFmtId="21"/></cellXfs></styleSheet>',
    'xl/sharedStrings.xml': '<sst><si><t>Not a date</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>45231</v></c><c r="B1" s="1"><v>45231</v></c><c r="C1" s="2"><v>45231.5</v></c><c r="D1" s="4"><v>0.75</v></c></row><row r="2"><c r="A2" s="3"><v>45231.25</v></c><c r="B2" s="1" t="s"><v>0</v></c></row></sheetData></worksheet>',
  });

  const want = { odt: ['odt', 'Cell energy', 'Second&third part\nnext'], epub: ['epub', 'Chapter Zero', 'Chapter One'], xlsx: ['xlsx', 'Cell parts', 'Mitochondrion\tmakes ATP'], rtf: ['rtf', 'Cell energy', 'Café and — dash'], html: ['html', 'Cell energy', 'A & B'] };
  for (const [k, [kind, a, b]] of Object.entries(want)) {
    const out = await materials.extract(fx[k]);
    check(`${k.toUpperCase()} is read as ${kind}`, !out.error && out.kind === kind, out);
    check(`${k.toUpperCase()} text has the content`, !out.error && out.text.includes(a) && out.text.includes(b), out.text);
  }
  const ep = await materials.extract(fx.epub);
  check('EPUB follows the spine order', ep.text.indexOf('Chapter Zero') < ep.text.indexOf('Chapter One') && ep.pages === 2, ep.text);
  const xl = await materials.extract(fx.xlsx);
  check('XLSX cells keep numbers beside text, shared strings resolved', /Lysosome\tdigests/.test(xl.text) && /\t4$/m.test(xl.text), xl.text);
  const xd = await materials.extract(fx.dates);
  check('XLSX date-formatted cells are written as ISO dates', !xd.error && xd.text.includes('45231\t2023-11-01\t2023-11-01 12:00'), xd.text);
  check('XLSX date-formatted cells are not left as serial numbers', !xd.text.includes('\t45231'), xd.text);
  check('XLSX time-of-day cells show the time', xd.text.includes('\t18:00:00'), xd.text);
  check('XLSX custom date formats keep their seconds', xd.text.includes('2023-11-01 06:00:00'), xd.text);
  check('XLSX text in a date-formatted cell is left alone', xd.text.includes('Not a date'), xd.text);
  const ht = await materials.extract(fx.html);
  check('HTML drops scripts, styles and navigation', !/alert|Login|p\{\}/.test(ht.text), ht.text);
  const rt = await materials.extract(fx.rtf);
  check('RTF drops font tables and control words', !/fonttbl|Times|colortbl|\\\\/.test(rt.text) && !/\\par/.test(rt.text), rt.text);
  for (const k of ['csv', 'md', 'latex', 'code']) {
    const out = await materials.extract(fx[k]);
    check(`${k} is read as text`, !out.error && out.kind === 'text' && out.text.length > 150, out);
  }
  check('LaTeX keeps the math source', (await materials.extract(fx.latex)).text.includes('\\frac{1}{3}'));

  // OCR (pictures and scans): a stubbed recognizer, so no real OCR runs here.
  const parsers = require('../services/material-parsers');
  const pngBuf = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]);
  parsers.setOcr(async () => ({ text: `${FACT}${FACT}` }));
  const ocr = await parsers.fromImage(pngBuf);
  check('PNG becomes text through OCR', !ocr.error && ocr.text.includes('oxidative phosphorylation') && ocr.pages === 1, ocr);
  parsers.setOcr(async () => ({ text: 'Only a handful of words' }));
  check('a picture with under 20 readable words says there is too little text', (await parsers.fromImage(pngBuf)).code === 'too_little');
  parsers.setOcr(async () => ({ missing: true }));
  const noLibrary = await parsers.fromImage(pngBuf);
  check('without tesseract.js a picture says so plainly', noLibrary.code === 'no_ocr' && /tesseract\.js is not installed/.test(noLibrary.error), noLibrary);
  parsers.setOcr(null);
  const scanned = await materials.extract(blankPdf());
  check('a PDF with no text layer says it looks scanned', scanned.code === 'scanned' && /scanned/.test(scanned.error), scanned);

  // Honest failures
  const empty = await materials.extract(await zip({ 'content.xml': '<office:text><text:p>hi</text:p></office:text>' }, ['mimetype', 'application/vnd.oasis.opendocument.text']));
  check('a nearly empty document says there is too little text', empty.code === 'too_little', empty);
  const badEpub = await materials.extract(await zip({ 'x.txt': 'nothing' }, ['mimetype', 'application/epub+zip']));
  check('a broken EPUB is a plain error', !!badEpub.error && ['bad_type', 'unreadable'].includes(badEpub.code), badEpub);
  parsers.setOcr(async () => ({ text: `${FACT}${FACT}` }));
  const picture = await materials.extract(pngBuf);
  check('a picture with text is stored as an image material', !picture.error && picture.kind === 'image', picture);
  parsers.setOcr(null);
  const rtfBad = await materials.extract(Buffer.from('{\\rtf1 '.concat('\\par ', 'x'.repeat(50), '}')));
  check('a tiny RTF says there is too little text', rtfBad.code === 'too_little', rtfBad);

  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
