/**
 * Real files made on the fly for scripts/uploads-every-format.js. Chrome (playwright, NODE_PATH) writes the PDFs and page pictures, so those come from a real producer; Office files are written part by
 * part with the awkward things real ones hold (tracked changes, comments, footnotes, tables, text boxes, group shapes, formulas). Windows speech (System.Speech) makes the speech; ffmpeg the audio and video.
 */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const JSZip = require('jszip');
const sharp = require('sharp');

const PLANTED = [
  'Lake Vostrin was formed about 14,000 years ago when a glacier dammed the Orlen valley.',
  'The lake holds roughly 37 cubic kilometres of water and reaches a depth of 212 metres.',
  'Its only outflow is the Tarmo River, which drains north into the Sellen Sea.',
  'Fishing for the silver korrin was banned in 1987 after the population fell by two thirds.',
  'Dr. Ilse Maron proved in 2004 that the winter ice traps oxygen in the upper layer.',
  'Sediment cores from the northern basin record 11 volcanic ash layers from the Kovar eruptions.',
  'The Vostrin Compact of 2011 limits water taken for farming to 9 percent of the yearly inflow.',
  'Remember that the lake turns over twice a year, in April and in November, and this will be on the test.',
];
const TABLE = [['Station', 'Depth (m)', 'Oxygen (mg/L)'], ['Harbor Point', '18', '9.4'], ['Mid Basin', '212', '3.1'], ['Tarmo Mouth', '6', '11.2']];
const TABLE_FACTS = [/Harbor Point\W+18\W+9\.4/, /Mid Basin\W+212\W+3\.1/, /Tarmo Mouth\W+6\W+11\.2/];

const para = (a, b) => PLANTED.slice(a, b).join(' ');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tableHtml = () => `<table border="1" cellpadding="4">${TABLE.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('')}</table>`;
const articleHtml = (extra = '') => `<h1>Lake Vostrin: a field guide</h1><h2>How the lake formed</h2><p>${esc(para(0, 2))}</p><h2>Rivers and fish</h2><p>${esc(para(2, 4))}</p><h2>Science</h2><p>${esc(para(4, 6))}</p><p><b>${esc(PLANTED[6])}</b></p><p><b>${esc(PLANTED[7])}</b></p>${extra}`;
const pageHtml = (body, css = '') => `<!doctype html><html><head><meta charset="utf-8"><title>Lake Vostrin</title><style>body{font:15px Georgia,serif;margin:30px;line-height:1.45}${css}</style></head><body>${body}</body></html>`;

const SPANISH = 'El lago Vostrin se formó hace unos catorce mil años cuando un glaciar represó el valle de Orlen. Su único desagüe es el río Tarmo, que drena hacia el norte hasta el mar de Sellen. La pesca del korrin plateado se prohibió en 1987 después de que la población cayera en dos tercios. Los núcleos de sedimento de la cuenca norte registran once capas de ceniza volcánica de las erupciones de Kovar. Recuerda que el lago se renueva dos veces al año, en abril y en noviembre.';
const CHINESE = '沃斯特林湖大约形成于一万四千年前,当时冰川堵塞了奥尔伦山谷。该湖唯一的出水口是塔尔莫河,向北流入塞伦海。一九八七年,由于银色科林鱼的数量下降了三分之二,捕捞被禁止。北部盆地的沉积物岩芯记录了十一层来自科瓦尔火山喷发的火山灰。请记住,这个湖每年翻转两次,分别在四月和十一月。冬季的冰层把氧气困在上层水体中。这是考试的重点内容。'.repeat(2);
const ARABIC = 'تشكلت بحيرة فوسترين قبل نحو أربعة عشر ألف عام عندما سد نهر جليدي وادي أورلين. المصب الوحيد للبحيرة هو نهر تارمو الذي يصب شمالا في بحر سيلين. حظر صيد سمك الكورين الفضي في عام 1987 بعد أن انخفض عدده بمقدار الثلثين. تذكر أن مياه البحيرة تنقلب مرتين في السنة في أبريل ونوفمبر.'.repeat(2);

// ── minimal PDF with one JPEG per page, the way a scanner writes it ──
function scannedPdf(jpegs) {
  const objs = [];
  const add = (b) => { objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1')); return objs.length; };
  const pagesId = 1;
  objs.push(null); // pages, filled below
  const kids = [];
  for (const j of jpegs) {
    const im = add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.buf.length} >>\nstream\n`, 'latin1'), j.buf, Buffer.from('\nendstream', 'latin1')]));
    const content = `q 612 0 0 792 0 0 cm /I0 Do Q`;
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /I0 ${im} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[0] = Buffer.from(`<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] >>`, 'latin1');
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offs = [];
  let at = parts[0].length;
  objs.forEach((o, i) => { const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')]); offs.push(at); at += b.length; parts.push(b); });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((x) => `${String(x).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${at}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

// ── CFB (old Office container): streams only, enough for readers to see the directory ──
function cfb(streams) {
  const S = 512; const names = Object.keys(streams);
  const dataSecs = []; const chains = [];
  for (const n of names) { let b = streams[n]; const need = Math.max(8, Math.ceil(Math.max(b.length, 4096) / S)); b = Buffer.concat([b, Buffer.alloc(need * S - b.length)]); const first = dataSecs.length; for (let i = 0; i < need; i++) dataSecs.push(b.slice(i * S, (i + 1) * S)); chains.push({ n, first, need, size: Math.max(streams[n].length, 4096) }); }
  const dirSec = dataSecs.length; const dir = Buffer.alloc(S * Math.ceil((names.length + 1) / 4));
  const entry = (i, name, type, start, size, child, left) => { const o = i * 128; const u = Buffer.from(name, 'utf16le'); u.copy(dir, o); dir.writeUInt16LE(u.length + 2, o + 64); dir[o + 66] = type; dir[o + 67] = 1; dir.writeInt32LE(left, o + 68); dir.writeInt32LE(-1, o + 72); dir.writeInt32LE(child, o + 76); dir.writeInt32LE(start, o + 116); dir.writeUInt32LE(size, o + 120); };
  entry(0, 'Root Entry', 5, -2, 0, names.length ? 1 : -1, -1);
  chains.forEach((c, i) => entry(i + 1, c.n, 2, c.first, c.size, -1, i + 2 <= names.length ? i + 2 : -1));
  const dirSecs = dir.length / S; const fatSec = dirSec + dirSecs; const total = fatSec + 1;
  const fat = Buffer.alloc(S, 0xff);
  chains.forEach((c) => { for (let i = 0; i < c.need; i++) fat.writeInt32LE(i === c.need - 1 ? -2 : c.first + i + 1, (c.first + i) * 4); });
  for (let i = 0; i < dirSecs; i++) fat.writeInt32LE(i === dirSecs - 1 ? -2 : dirSec + i + 1, (dirSec + i) * 4);
  fat.writeInt32LE(-3, fatSec * 4);
  const h = Buffer.alloc(S); Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(h); h.writeUInt16LE(0x3e, 24); h.writeUInt16LE(3, 26); h.writeUInt16LE(0xfffe, 28); h.writeUInt16LE(9, 30); h.writeUInt16LE(6, 32); h.writeUInt32LE(1, 44); h.writeInt32LE(dirSec, 48); h.writeUInt32LE(4096, 56); h.writeInt32LE(-2, 60); h.writeInt32LE(-2, 68);
  h.writeInt32LE(fatSec, 76); for (let i = 1; i < 109; i++) h.writeInt32LE(-1, 76 + i * 4);
  void total;
  return Buffer.concat([h, ...dataSecs, dir, fat]);
}

// ── Office ──
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const wp = (t, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
const wb = (t) => `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
async function docx(o = {}) {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>');
  z.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`);
  z.file('word/footnotes.xml', `<?xml version="1.0" encoding="UTF-8"?><w:footnotes ${W}><w:footnote w:id="1"><w:p><w:r><w:t>Footnote: the Compact was renewed in 2019.</w:t></w:r></w:p></w:footnote></w:footnotes>`);
  z.file('word/comments.xml', `<?xml version="1.0" encoding="UTF-8"?><w:comments ${W}><w:comment w:id="1" w:author="T"><w:p><w:r><w:t>TEACHERCOMMENT check the depth figure</w:t></w:r></w:p></w:comment></w:comments>`);
  const table = `<w:tbl>${TABLE.map((r) => `<w:tr>${r.map((c) => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  const body = o.body != null ? o.body : [
    wp('Lake Vostrin: a field guide', 'Heading1'), wp('How the lake formed', 'Heading2'), wp(para(0, 2)), wp('Rivers and fish', 'Heading2'), wp(PLANTED[2]),
    `<w:p><w:r><w:t xml:space="preserve">${esc(PLANTED[3])}</w:t></w:r><w:del w:id="9" w:author="T"><w:r><w:delText>DELETEDWORDS were removed by the editor.</w:delText></w:r></w:del><w:ins w:id="10" w:author="T"><w:r><w:t xml:space="preserve"> Inserted sentence kept by the editor.</w:t></w:r></w:ins><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>`,
    wp('Science', 'Heading2'), wp(PLANTED[4]), wp(PLANTED[5]), wb(PLANTED[6]), wb(PLANTED[7]), table,
  ].join('');
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`);
  return z.generateAsync({ type: 'nodebuffer' });
}
async function pptx() {
  const z = new JSZip();
  const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const sp = (t, title, b) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr>${title ? '<p:ph type="title"/>' : ''}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr ${b ? 'b="1"' : ''}/><a:t>${esc(t)}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const tbl = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>${TABLE.map((r) => `<a:tr>${r.map((c) => `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>${esc(c)}</a:t></a:r></a:p></a:txBody></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  const grp = (inner) => `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${inner}</p:grpSp>`;
  const slides = [[sp('How the lake formed', true), sp(PLANTED[0]), sp(PLANTED[1])], [sp('Rivers and fish', true), sp(PLANTED[2]), grp(sp(PLANTED[3]))], [sp('Science', true), sp(PLANTED[4]), sp(PLANTED[5]), tbl], [sp('Rules', true), sp(PLANTED[6], false, true), sp(PLANTED[7], false, true)]];
  slides.forEach((s, i) => {
    z.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:sld ${P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${s.join('')}</p:spTree></p:cSld></p:sld>`);
    z.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i + 1}.xml"/></Relationships>`);
    z.file(`ppt/notesSlides/notesSlide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:notes ${P}><p:cSld><p:spTree>${sp(i === 3 ? 'SPEAKERNOTE this will be on the exam.' : `Slide ${i + 1} notes here.`)}</p:spTree></p:cSld></p:notes>`);
  });
  z.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${P}/>`);
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  return z.generateAsync({ type: 'nodebuffer' });
}
async function xlsx() {
  const z = new JSZip();
  const shared = ['Station', 'Depth (m)', 'Oxygen (mg/L)', 'Harbor Point', 'Mid Basin', 'Tarmo Mouth', ...PLANTED];
  z.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`);
  const c = (r, v, t) => (t === 's' ? `<c r="${r}" t="s"><v>${v}</v></c>` : `<c r="${r}"><f>SUM(1,1)</f><v>${v}</v></c>`);
  const sheet1 = `<row r="1">${c('A1', 0, 's')}${c('B1', 1, 's')}${c('C1', 2, 's')}</row><row r="2">${c('A2', 3, 's')}${c('B2', 18)}${c('C2', 9.4)}</row><row r="3">${c('A3', 4, 's')}${c('B3', 212)}${c('C3', 3.1)}</row><row r="4">${c('A4', 5, 's')}${c('B4', 6)}${c('C4', 11.2)}</row>`;
  const sheet2 = PLANTED.map((_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="s"><v>${6 + i}</v></c></row>`).join('');
  z.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet1}</sheetData></worksheet>`);
  z.file('xl/worksheets/sheet2.xml', `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet2}</sheetData></worksheet>`);
  z.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Stations" sheetId="1" r:id="rId1"/><sheet name="Facts" sheetId="2" r:id="rId2"/></sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  return z.generateAsync({ type: 'nodebuffer' });
}
async function epub() {
  const z = new JSZip();
  z.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  z.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  z.file('OEBPS/c.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="a" href="b.xhtml" media-type="application/xhtml+xml"/><item id="b" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>');
  z.file('OEBPS/b.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Lake Vostrin</h1><p>${esc(para(0, 4))}</p></body></html>`);
  z.file('OEBPS/a.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Science</h1><p>${esc(para(4, 6))}</p><p><b>${esc(para(6, 8))}</b></p></body></html>`);
  return z.generateAsync({ type: 'nodebuffer' });
}
/** Mark a ZIP as encrypted (general-purpose bit 0 in every header), as a password-protected ZIP has it. */
function markZipEncrypted(buf) {
  const b = Buffer.from(buf);
  for (let i = 0; i + 4 < b.length; i++) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 3 && b[i + 3] === 4) b.writeUInt16LE(b.readUInt16LE(i + 6) | 1, i + 6);
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 1 && b[i + 3] === 2) b.writeUInt16LE(b.readUInt16LE(i + 8) | 1, i + 8);
  }
  return b;
}
const rtf = () => `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times;}}\\f0\\fs24{\\b Lake Vostrin: a field guide}\\par ${para(0, 3)}\\par \\trowd\\cellx2000\\cellx4000\\cellx6000 Harbor Point\\cell 18\\cell 9.4\\cell\\row ${para(3, 6)}\\par {\\b ${PLANTED[6]}}\\par {\\b ${PLANTED[7]}}\\par Caf\\'e9 r\\u233?sum\\u233? note.\\par }`;

function encryptPdf(buf, dir) {
  const a = path.join(dir, '_plain.pdf'); const b = path.join(dir, '_enc.pdf');
  fs.writeFileSync(a, buf);
  execFileSync('python', ['-I', '-c', `import sys\nfrom pypdf import PdfReader, PdfWriter\nw=PdfWriter()\nfor p in PdfReader(sys.argv[1]).pages: w.add_page(p)\nw.encrypt('hunter2')\nw.write(sys.argv[2])`, a, b]);
  const out = fs.readFileSync(b);
  fs.unlinkSync(a); fs.unlinkSync(b);
  return out;
}

/** Everything that needs Chrome: PDFs and pictures of pages. */
async function chromeFiles(dir) {
  const { chromium } = require('playwright'); // eslint-disable-line global-require
  const br = await chromium.launch();
  const page = await br.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
  const out = {};
  const pdf = async (html, opts = {}) => { await page.setContent(html); return page.pdf({ format: 'Letter', printBackground: true, ...opts }); };
  const shot = async (html, opts = {}) => { await page.setContent(html); return page.screenshot({ fullPage: true, ...opts }); };
  out.textPdf = await pdf(pageHtml(articleHtml()));
  out.tablePdf = await pdf(pageHtml(articleHtml(`<h2>Stations</h2>${tableHtml()}`)));
  const longCol = (`<h1>Lake Vostrin</h1>${PLANTED.map((s) => `<p>${esc(s)} The field notes describe the same basin in the same years and add nothing further to this point at all.</p>`).join('')}`).repeat(2);
  out.twoColPdf = await pdf(pageHtml(longCol, 'body{column-count:2;column-gap:32px;font-size:13px}'));
  out.mixedPdf = await pdf(pageHtml(`<h1>Lake Vostrin</h1><p>${esc(para(0, 4))}</p><h2>Resumen</h2><p>${esc(SPANISH)}</p><p>${esc(para(4, 8))}</p><h2>中文摘要</h2><p>${CHINESE.slice(0, 120)}</p>`));
  out.spanishPdf = await pdf(pageHtml(`<h1>El lago Vostrin</h1><p>${esc(SPANISH)}</p><p>${esc(SPANISH)}</p>`));
  out.chinesePdf = await pdf(pageHtml(`<h1>沃斯特林湖</h1><p>${CHINESE}</p>`));
  out.imageOnlyPagePdf = await pdf(pageHtml(`${articleHtml()}<div style="page-break-before:always"><img style="width:600px" src="data:image/png;base64,${(await shot(pageHtml('<p>A page that is only a picture of words about lake levels and ice cover over the winter season.</p>'))).toString('base64')}"></div>`));
  // big PDF: 330 pages (over the 300 limit) and 120 pages (a real long book chapter)
  const pageOf = (n) => `<div style="page-break-after:always"><h2>Part ${n}</h2><p>${esc(PLANTED[n % 8])} Page ${n} goes on to repeat the same note on the lake and its basin for practice only.</p></div>`;
  out.pdf330 = await pdf(pageHtml(Array.from({ length: 330 }, (_, i) => pageOf(i + 1)).join('')));
  out.pdf120 = await pdf(pageHtml(Array.from({ length: 120 }, (_, i) => pageOf(i + 1)).join('')));
  // page pictures
  await page.setViewportSize({ width: 820, height: 1060 });
  const clean = await shot(pageHtml(articleHtml(tableHtml()), 'body{font-size:18px;background:#fff}'));
  out.png = clean;
  out.jpg = await sharp(clean).jpeg({ quality: 80 }).toBuffer();
  out.webp = await sharp(clean).webp({ quality: 80 }).toBuffer();
  out.tiff = await sharp(clean).tiff().toBuffer();
  out.gif = await sharp(clean).resize({ width: 1400 }).gif().toBuffer();
  out.pngRotated90 = await sharp(clean).rotate(90).png().toBuffer();
  out.jpgExifRotated = await sharp(await sharp(clean).rotate(-90).toBuffer()).withMetadata({ orientation: 6 }).jpeg({ quality: 85 }).toBuffer();
  out.phonePhoto = await sharp(clean).rotate(3, { background: '#c9c4b8' }).modulate({ brightness: 0.8 }).blur(1.1).linear(0.75, 20).jpeg({ quality: 55 }).toBuffer();
  // handwriting: real handwriting fonts on this machine, drawn with wobble
  const hand = (font) => pageHtml(`<div style="font-family:'${font}';font-size:30px;line-height:1.5;color:#123">${PLANTED.slice(0, 6).map((s, i) => `<p style="transform:rotate(${(i % 3 - 1) * 0.5}deg)">${esc(s)}</p>`).join('')}</div>`);
  out.handInk = await shot(hand('Ink Free'));
  out.handScript = await shot(hand('Segoe Script'));
  out.handBrad = await shot(hand('Bradley Hand ITC'));
  out.blackboard = await shot(pageHtml(`<div style="font-family:'Ink Free';font-size:32px;color:#eee;line-height:1.5">${PLANTED.slice(0, 5).map((s) => `<p>${esc(s)}</p>`).join('')}</div>`, 'body{background:#1f3a2c}'));
  out.emptyPicture = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#fff' } }).png().toBuffer();
  out.photoNoText = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#556b2f', noise: { type: 'gaussian', mean: 128, sigma: 60 } } }).jpeg().toBuffer();
  out.hugePicture = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: '#fff' } }).composite([{ input: clean }]).png({ compressionLevel: 9 }).toBuffer();
  out.spanishPhoto = await shot(pageHtml(`<p style="font-size:20px">${esc(SPANISH)}</p>`));
  // scans
  const scanPages = [];
  for (let i = 0; i < 3; i++) {
    const p = await shot(pageHtml(`<h2>Page ${i + 1}</h2><p style="font-size:20px">${esc(para(i * 2, i * 2 + 2))}</p><p style="font-size:20px">${esc(para((i * 2 + 2) % 8, (i * 2 + 2) % 8 + 1))}</p>`));
    const noisy = await sharp(p).resize({ width: 1275 }).rotate(i === 1 ? 1.2 : 0, { background: '#eee' }).linear(0.9, 12).jpeg({ quality: 70 }).toBuffer();
    const meta = await sharp(noisy).metadata();
    scanPages.push({ buf: noisy, w: meta.width, h: meta.height });
  }
  out.scannedPdf = scannedPdf(scanPages);
  out.scanned45 = scannedPdf(Array.from({ length: 45 }, () => scanPages[0]));
  out.encPdf = encryptPdf(out.textPdf, dir);
  await br.close();
  return out;
}

/** Windows speech to a 16-bit WAV. Returns a Buffer. */
function speakWav(text, dir, name) {
  const wav = path.join(dir, `${name}.wav`);
  const script = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 1; $s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}'); $s.Speak(@'\n${text}\n'@); $s.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'pipe' });
  return wav;
}
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'pipe' });

module.exports = { PLANTED, TABLE, TABLE_FACTS, SPANISH, CHINESE, ARABIC, articleHtml, pageHtml, tableHtml, docx, pptx, xlsx, epub, rtf, cfb, markZipEncrypted, wp, wb, chromeFiles, speakWav, ffmpeg, scannedPdf };
