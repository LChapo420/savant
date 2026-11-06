/**
 * Text extraction for uploaded PDF and Word files. No db and no server state in here: this module is
 * loaded by the worker process (material-worker.js), which parses one file under a time and memory limit.
 */
const MAX_PAGES = 300;
const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNPACKED = 200 * 1024 * 1024;

// OCR of pictures (tesseract.js is optional). Its language data is cached under data/models/tesseract.
const TESSERACT_CACHE = require('path').join(__dirname, '..', 'data', 'models', 'tesseract');
const MIN_OCR_WORDS = 20;

function fail(error, code) { return { error, code }; }

/** Read a zip's central directory: entry names and declared sizes, without unpacking anything. */
function zipEntries(buf) {
  const min = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ZIP_ENTRIES) return { tooMany: true, entries: [] };
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entries.push({ name: buf.slice(p + 46, p + 46 + nameLen).toString('utf8'), size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries };
}

function normalise(text) {
  return String(text)
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Words with a letter or digit in them; lone punctuation and page furniture do not count. */
function countWords(text) {
  // Any script. Chinese, Japanese and Thai have no spaces, so a run of those counts one word per two characters (without this a Chinese PDF with a full text layer was called "scanned").
  const t = String(text || '');
  const spaced = (t.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu) || []);
  let n = 0;
  for (const w of spaced) n += /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(w) ? Math.ceil(w.length / 2) : 1;
  return n;
}

async function fromPdf(buf) {
  const { getDocumentProxy, extractText } = await import('unpdf');
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf), { isEvalSupported: false, useSystemFonts: false, verbosity: 0, fontExtraProperties: true });
  } catch (err) {
    if (/password/i.test(String(err && (err.name + err.message)))) return fail('That PDF is password-protected. Remove the password and upload it again.', 'encrypted');
    return fail('That PDF could not be read. It may be damaged or cut off. Download or export it again, or paste the text.', 'unreadable');
  }
  try {
    if (pdf.numPages > MAX_PAGES) return fail(`That PDF has ${pdf.numPages} pages. The limit is ${MAX_PAGES}. Upload a part of it.`, 'too_many_pages');
    const { text } = await extractText(pdf, { mergePages: false });
    const joined = normalise(text.join('\n\n'));
    // A PDF with no text layer is a scan: the page pictures go back to the caller to be read by OCR (material-formats.js pdfImages).
    if (countWords(joined) < MIN_OCR_WORDS) {
      let images = [];
      try { images = await require('./material-formats').pdfImages(pdf); } catch { images = []; }
      if (images.length) return { scanned: true, images, pages: pdf.numPages, checked: Math.min(pdf.numPages, 40) };
      return fail('That PDF looks scanned, and the pictures in it could not be pulled out to read. Upload each page as a PNG or JPG picture, or paste the text.', 'scanned');
    }
    // Headings, bold and page marks for the key-point pass; the stored text stays the plain text above.
    let rich = null;
    try { const r = await require('./material-formats').pdfRich(pdf, MAX_PAGES); rich = r && countWords(r.text) >= MIN_OCR_WORDS ? r.rich : null; } catch { rich = null; }
    const blank = text.map((pg, i) => (countWords(pg) < 3 ? i + 1 : 0)).filter(Boolean);
    return { text: joined, rich: rich || undefined, pages: pdf.numPages, blank: blank.length && blank.length < text.length ? blank : [] };
  } catch {
    return fail('That PDF could not be read. It may be damaged or cut off. Download or export it again, or paste the text.', 'unreadable');
  } finally {
    try { await pdf.destroy(); } catch { /* nothing to do */ }
  }
}

/**
 * What Word marks but the reader does not see: highlight, underline and shaded runs become bold; a bordered or shaded paragraph becomes a key-point box; a comment becomes bold on the words it marks
 * (a box if it says the point is for the test) and is added at the end, so the teacher's words reach the learner. Returns { buf, comments }, or the file as it was if anything is odd.
 */
async function docxMarks(buf) {
  try {
    const z = await require('jszip').loadAsync(buf);
    const f = z.file('word/document.xml');
    if (!f) return { buf, comments: [] };
    let xml = await f.async('string');
    xml = xml.replace(/<w:highlight\b[^>]*\/>/g, '<w:b/>').replace(/<w:u\s+w:val="(?!none)[^"]*"[^>]*\/>/g, '<w:b/>').replace(/(<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?)<w:shd\b[^>]*w:fill="(?!auto|FFFFFF|ffffff)[^"]*"[^>]*\/>/g, '$1<w:b/>');
    let boxed = false;
    xml = xml.replace(/<w:pPr>((?:(?!<\/w:pPr>)[\s\S])*?<w:(?:pBdr|shd)\b(?:(?!<\/w:pPr>)[\s\S])*?)<\/w:pPr>/g, (m, inner) => { if (/w:pStyle/.test(inner)) return m; boxed = true; return `<w:pPr><w:pStyle w:val="SavantBox"/>${inner}</w:pPr>`; });
    z.file('word/document.xml', xml);
    const st = z.file('word/styles.xml');
    if (boxed && st) z.file('word/styles.xml', (await st.async('string')).replace('</w:styles>', '<w:style w:type="paragraph" w:styleId="SavantBox"><w:name w:val="Key Point"/></w:style></w:styles>'));
    const comments = [];
    const c = z.file('word/comments.xml');
    if (c) {
      const cx = await c.async('string');
      for (const m of cx.matchAll(/<w:comment\b[^>]*w:id="(\d+)"[^>]*>([\s\S]*?)<\/w:comment>/g)) {
        const text = unxml((m[2].match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(' ')).replace(/\s+/g, ' ').trim();
        const range = new RegExp(`<w:commentRangeStart\\b[^>]*w:id="${m[1]}"[^>]*/>([\\s\\S]*?)<w:commentRangeEnd\\b[^>]*w:id="${m[1]}"`).exec(xml);
        const anchor = range ? unxml((range[1].match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')).replace(/\s+/g, ' ').trim() : '';
        if (text) comments.push({ text, anchor });
      }
    }
    return { buf: await z.generateAsync({ type: 'nodebuffer' }), comments };
  } catch { return { buf, comments: [] }; }
}

async function fromDocx(buf) {
  const listing = zipEntries(buf);
  if (!listing) return fail('That file is not a Word document.', 'bad_type');
  if (listing.tooMany) return fail('That file is not a usable Word document.', 'bad_type');
  const unpacked = listing.entries.reduce((s, e) => s + e.size, 0);
  if (unpacked > MAX_ZIP_UNPACKED) return fail('That document unpacks to far more than the size limit.', 'too_big');
  if (!listing.entries.some((e) => e.name === 'word/document.xml')) {
    return fail('That looks like an Office file, but its main part is missing, so it may be damaged. Open it on your computer, save it again and upload the new copy, or save it as PDF.', 'unreadable');
  }
  const mammoth = require('mammoth');
  try {
    const out = await mammoth.extractRawText({ buffer: buf });
    const marks = await docxMarks(buf);
    let rich;
    try { rich = require('./material-formats').htmlRich((await mammoth.convertToHtml({ buffer: marks.buf }, { styleMap: ["p[style-name='Key Point'] => blockquote:fresh", "p[style-name='Callout'] => blockquote:fresh", "p[style-name='Important'] => blockquote:fresh", "p[style-name='Note'] => blockquote:fresh", "p[style-name='Intense Quote'] => blockquote:fresh", "p[style-name='Block Text'] => blockquote:fresh", "p[style-name='Quote'] => blockquote:fresh"] })).value); } catch { rich = undefined; }
    let text = normalise(out.value);
    // A comment in the margin is the teacher's note: its words join the text, and the words it marks are stressed.
    if (marks.comments.length) {
      const lines = marks.comments.slice(0, 200).map((c) => `Comment${c.anchor ? ` on "${c.anchor.slice(0, 120)}"` : ''}: ${c.text}`);
      text = `${text}\n\nComments in the margin\n\n${lines.join('\n')}`;
      if (rich) {
        for (const c of marks.comments) {
          const stress = /\b(test|exam|quiz|final|must know|important|always miss|key)\b/i.test(c.text);
          if (c.anchor && rich.includes(c.anchor)) rich = rich.replace(c.anchor, stress ? `\n\n> **Key point:** ${c.anchor}\n\n` : `**${c.anchor}**`);
        }
        rich = `${rich}\n\n## Comments in the margin\n\n${lines.join('\n')}`;
      }
    }
    return { text, rich, pages: null };
  } catch {
    return fail('That Word document could not be read. It may be damaged or cut off. Open it on your computer and save it again, or save it as PDF.', 'unreadable');
  }
}

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unxml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] !== '#') return XML_ENT[e.toLowerCase()];
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  });
}

/** One slide's text: a line per paragraph (<a:p>), runs (<a:t>) joined. */
function slideLines(xml) {
  const out = [];
  for (const para of xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) || []) {
    const line = unxml((para.match(/<a:t(?: [^>]*)?>[^<]*<\/a:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')).trim();
    if (line) out.push(line);
  }
  return out;
}

async function fromPptx(buf) {
  const listing = zipEntries(buf);
  if (!listing || listing.tooMany) return fail('That file is not a usable PowerPoint file.', 'bad_type');
  if (listing.entries.reduce((s, e) => s + e.size, 0) > MAX_ZIP_UNPACKED) return fail('That presentation unpacks to far more than the size limit.', 'too_big');
  const num = (n) => Number((n.match(/(\d+)\.xml$/) || [])[1]);
  const slides = listing.entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name)).sort((a, b) => num(a.name) - num(b.name));
  if (!slides.length) return fail('That file has no slides in it.', 'bad_type');
  if (slides.length > MAX_PAGES) return fail(`That presentation has ${slides.length} slides. The limit is ${MAX_PAGES}. Upload a part of it.`, 'too_many_pages');
  let zip;
  try { zip = await require('jszip').loadAsync(buf); } catch { return fail('That PowerPoint file could not be read. It may be damaged.', 'unreadable'); }
  const parts = [];
  const rich = [];
  for (const s of slides) {
    const n = num(s.name);
    const slideXml = await zip.file(s.name).async('string');
    const lines = slideLines(slideXml);
    const boldLines = require('./material-formats').slideBold(slideXml);
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    // Notes pages repeat the slide number as a lone digit line; drop it.
    const notes = notesFile ? slideLines(await notesFile.async('string')).filter((l) => !/^\d{1,3}$/.test(l)) : [];
    if (!lines.length && !notes.length) continue;
    const [title, ...rest] = lines;
    parts.push([`Slide ${n}${title ? `: ${title}` : ''}`, ...rest, ...(notes.length ? [`Speaker notes: ${notes.join(' ')}`] : [])].join('\n'));
    rich.push([`[[s${n}]]`, title ? `# ${title}` : '', ...rest.map((l) => `- ${boldLines.get(l) || l}`), ...(notes.length ? [`Speaker notes: ${notes.join(' ')}`] : [])].filter(Boolean).join('\n'));
  }
  return { text: normalise(parts.join('\n\n')), rich: normalise(rich.join('\n\n')), pages: slides.length };
}

async function openZip(buf, label) {
  const listing = zipEntries(buf);
  if (!listing || listing.tooMany) return fail(`That file is not a usable ${label} file.`, 'bad_type');
  if (listing.entries.reduce((s, e) => s + e.size, 0) > MAX_ZIP_UNPACKED) return fail('That file unpacks to far more than the size limit.', 'too_big');
  try { return { zip: await require('jszip').loadAsync(buf), listing }; } catch { return fail(`That ${label} file could not be read. It may be damaged.`, 'unreadable'); }
}

/** OpenDocument text (.odt): paragraphs and headings of content.xml, one per line. */
async function fromOdt(buf) {
  const z = await openZip(buf, 'OpenDocument');
  if (z.error) return z;
  const f = z.zip.file('content.xml');
  if (!f) return fail('That file has no document text in it.', 'bad_type');
  const xml = (await f.async('string')).replace(/<text:(?:tab|s)\b[^>]*\/>/g, ' ').replace(/<text:line-break\s*\/>/g, '\n');
  const blocks = xml.match(/<text:(?:p|h)\b[^>]*>[\s\S]*?<\/text:(?:p|h)>/g) || [];
  const lines = blocks.map((p) => unxml(p.replace(/<[^>]+>/g, '')).trim()).filter(Boolean);
  // Headings (text:h outline level) and bold spans (an automatic style with a bold weight) for the key-point pass.
  const boldStyles = new Set((xml.match(/<style:style\b[^>]*style:name="[^"]+"[^>]*>(?:(?!<\/style:style>)[\s\S])*?fo:font-weight="bold"[\s\S]*?<\/style:style>/g) || []).map((st) => (st.match(/style:name="([^"]+)"/) || [])[1]));
  const rich = blocks.map((p) => {
    const lvl = (p.match(/^<text:h\b[^>]*text:outline-level="(\d)"/) || [])[1];
    const inner = p.replace(/<text:span\b[^>]*text:style-name="([^"]+)"[^>]*>([\s\S]*?)<\/text:span>/g, (m, st, t) => (boldStyles.has(st) && t.trim() ? `**${t.replace(/<[^>]+>/g, '').trim()}** ` : t));
    const t = unxml(inner.replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
    if (t && !lvl && /^<text:p\b[^>]*text:style-name="(?:Quotations?|Key|Callout|Important|Note|Block_20_Quotation)/.test(p)) return `> ${t}`;
    return t ? `${lvl ? `${'#'.repeat(Number(lvl))} ` : /^<text:p\b[^>]*text:style-name="(?:Title|Heading)/.test(p) ? '# ' : ''}${t}` : '';
  }).filter(Boolean);
  return { text: normalise(lines.join('\n\n')), rich: normalise(rich.join('\n\n')), pages: null };
}

/** HTML to plain text: scripts, styles and navigation removed, block tags become line breaks. */
function htmlText(html) {
  const h = String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|nav|head)\b[\s\S]*?<\/\1>/gi, ' ');
  // Table cells stay apart ("Mid Basin | 212 | 3.1"), as they do for the other formats.
  const text = h.replace(/<\/t[dh]>\s*<t[dh]\b[^>]*>/gi, ' | ').replace(/<\/?(p|div|section|article|br|li|ul|ol|tr|table|blockquote|pre|h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
  return normalise(unxml(text.replace(/&nbsp;/g, ' ')).replace(/[ \t ]+/g, ' ').split('\n').map((l) => l.trim()).join('\n'));
}

/** EPUB: the spine's XHTML chapters in reading order. */
async function fromEpub(buf) {
  const z = await openZip(buf, 'EPUB');
  if (z.error) return z;
  const opfPath = ((await (z.zip.file('META-INF/container.xml') || { async: async () => '' }).async('string')).match(/full-path="([^"]+)"/) || [])[1];
  const opf = opfPath && z.zip.file(opfPath);
  if (!opf) return fail('That file is not a usable EPUB book.', 'bad_type');
  const xml = await opf.async('string');
  const base = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';
  const manifest = {};
  for (const m of xml.match(/<item\b[^>]*>/g) || []) {
    const id = (m.match(/\bid="([^"]+)"/) || [])[1]; const href = (m.match(/\bhref="([^"]+)"/) || [])[1];
    if (id && href) manifest[id] = href;
  }
  const order = (xml.match(/<itemref\b[^>]*>/g) || []).map((m) => manifest[(m.match(/\bidref="([^"]+)"/) || [])[1]]).filter(Boolean);
  if (order.length > MAX_PAGES * 2) return fail('That book has too many sections. Upload a part of it.', 'too_many_pages');
  const parts = [];
  const rich = [];
  for (const href of order) {
    const f = z.zip.file(decodeURIComponent(base + href.split('#')[0]));
    if (f) {
      const html = await f.async('string');
      const t = htmlText(html);
      if (t) { parts.push(t); rich.push(`[[n ${parts.length}]]\n${require('./material-formats').htmlRich(html)}`); }
    }
  }
  if (!parts.length) return fail('That book has no readable text in it.', 'bad_type');
  return { text: normalise(parts.join('\n\n')), rich: normalise(rich.join('\n\n')), pages: order.length };
}

/** What a number format shows, so date-formatted cells can be written as dates: { kind, seconds } or null. */
const BUILTIN_DATE_FORMATS = {
  14: { kind: 'date' }, 15: { kind: 'date' }, 16: { kind: 'date' }, 17: { kind: 'date' },
  18: { kind: 'time' }, 19: { kind: 'time', seconds: true }, 20: { kind: 'time' }, 21: { kind: 'time', seconds: true },
  22: { kind: 'datetime' },
  45: { kind: 'time', seconds: true }, 46: { kind: 'time', seconds: true }, 47: { kind: 'time', seconds: true },
};

function formatKind(code) {
  const plain = String(code)
    .replace(/"[^"]*"/g, ' ')
    .replace(/\[[^\]]*\]/g, (m) => (/^\[(?:h+|m+|s+)\]$/i.test(m) ? m.slice(1, -1) : ' '))
    .replace(/\\./g, ' ')
    .replace(/am\/pm|a\/p/gi, ' ')
    .toLowerCase();
  const hasDate = /[yd]/.test(plain) || (/m/.test(plain) && !/[hs]/.test(plain));
  const hasTime = /[hs]/.test(plain);
  if (!hasDate && !hasTime) return null;
  return { kind: hasDate && hasTime ? 'datetime' : hasDate ? 'date' : 'time', seconds: /s/.test(plain) };
}

/** The date format of each cellXfs style, by cell "s" index; null for ordinary cells. */
async function xlsxDateStyles(zip) {
  const f = zip.file('xl/styles.xml');
  if (!f) return [];
  const xml = await f.async('string');
  const custom = {};
  for (const m of xml.match(/<numFmt\b[^>]*>/g) || []) {
    const id = Number((m.match(/\bnumFmtId="(\d+)"/) || [])[1]);
    const code = (m.match(/\bformatCode="([^"]*)"/) || [])[1];
    if (id && code !== undefined) custom[id] = formatKind(unxml(code));
  }
  const xfs = ((xml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [''])[0].match(/<xf\b[^>]*>/g) || []);
  return xfs.map((xf) => {
    const id = Number((xf.match(/\bnumFmtId="(\d+)"/) || [])[1] || 0);
    return custom[id] !== undefined ? custom[id] : BUILTIN_DATE_FORMATS[id] || null;
  });
}

const DAY_MS = 86400000;

/** Excel's day number to a real date; 1900 had no leap day, so serials past 59 are one day out. */
function serialDate(serial, date1904) {
  let days = Math.floor(serial);
  let secs = Math.round((serial - days) * 86400);
  if (secs >= 86400) { secs -= 86400; days += 1; }
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  return new Date(epoch + days * DAY_MS + secs * 1000);
}

/** A date-formatted cell as text: YYYY-MM-DD, and HH:MM[:SS] when the format shows a time. */
function dateCell(value, format, date1904) {
  const d = serialDate(Number(value), date1904);
  if (Number.isNaN(d.getTime())) return String(value);
  const p = (n) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${format.seconds ? `:${p(d.getUTCSeconds())}` : ''}`;
  if (format.kind === 'date') return date;
  if (format.kind === 'time') return time;
  return `${date} ${time}`;
}

/** XLSX: every sheet as "Sheet name" then one tab-joined row per line (shared strings resolved, dates as ISO). */
async function fromXlsx(buf) {
  const z = await openZip(buf, 'spreadsheet');
  if (z.error) return z;
  const shared = [];
  const ss = z.zip.file('xl/sharedStrings.xml');
  if (ss) for (const si of (await ss.async('string')).match(/<si\b[\s\S]*?<\/si>/g) || []) shared.push(unxml((si.match(/<t\b[^>]*>[^<]*<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
  const wb = z.zip.file('xl/workbook.xml');
  if (!wb) return fail('That file is not a usable spreadsheet.', 'bad_type');
  const book = await wb.async('string');
  const names = book.match(/<sheet\b[^>]*>/g) || [];
  const date1904 = /\bdate1904="(?:1|true)"/.test(book);
  const dateStyles = await xlsxDateStyles(z.zip);
  const sheets = z.listing.entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)).sort((a, b) => Number(a.name.match(/(\d+)\.xml/)[1]) - Number(b.name.match(/(\d+)\.xml/)[1]));
  const parts = [];
  let rows = 0;
  for (let i = 0; i < sheets.length; i++) {
    const xml = await z.zip.file(sheets[i].name).async('string');
    const lines = [];
    for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) || []) {
      const cells = [];
      for (const c of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        const t = (c.match(/\bt="([^"]+)"/) || [])[1];
        const v = (c.match(/<v>([^<]*)<\/v>/) || [])[1];
        const inl = (c.match(/<is>[\s\S]*?<\/is>/) || [])[0];
        const format = dateStyles[Number((c.match(/\bs="(\d+)"/) || [])[1])];
        let val = inl ? unxml(inl.replace(/<[^>]+>/g, '')) : v === undefined ? '' : t === 's' ? (shared[Number(v)] || '') : unxml(v);
        if (format && t !== 's' && v !== undefined && val !== '' && Number.isFinite(Number(val))) val = dateCell(val, format, date1904);
        if (val !== '') cells.push(val);
      }
      if (cells.length) lines.push(cells.join('\t'));
      if (++rows > 200000) return fail('That spreadsheet has too many rows. Upload a part of it.', 'too_big');
    }
    if (lines.length) parts.push(`${unxml((names[i] || '').match(/\bname="([^"]*)"/) ? names[i].match(/\bname="([^"]*)"/)[1] : `Sheet ${i + 1}`)}\n${lines.join('\n')}`);
  }
  return { text: normalise(parts.join('\n\n')), pages: sheets.length || null };
}

/** RTF to plain text: control words dropped, \par and \line become line breaks, \'hh and \uN decoded. */
function fromRtf(buf) {
  let s = buf.toString('latin1');
  if (!s.startsWith('{\\rtf')) return fail('That file is not a usable RTF document.', 'bad_type');
  // Drop destinations that are not body text (fonts, colours, styles, pictures, headers) with their groups.
  for (let i = 0; i < 6; i++) s = s.replace(/\{(?:\\\*)?\\(?:fonttbl|colortbl|stylesheet|info|pict|header|footer|themedata|colorschememapping|latentstyles|datastore)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');
  s = s.replace(/\\par[d]?(?![a-z])/g, '\n').replace(/\\cell(?![a-z])\s*(?=\\row)/g, '').replace(/\\cell(?![a-z])/g, ' | ').replace(/\\(?:line|row)(?![a-z])/g, '\n').replace(/\\tab(?![a-z])/g, '\t')
    .replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u(-?\d+)\??/g, (m, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
    .replace(/\\\*?[a-z]+-?\d* ?/gi, '').replace(/\\([\\{}])/g, '$1').replace(/[{}]/g, '');
  return { text: normalise(s.split('\n').map((l) => l.trim()).join('\n')), pages: null };
}

async function fromHtmlFile(buf) {
  const html = buf.toString('utf8');
  return { text: htmlText(html), rich: require('./material-formats').htmlRich(html), pages: null };
}

/** The real recognizer. tesseract.js is an optional dependency: without it the learner is told so. */
async function tesseractOcr(buf) {
  let Tesseract;
  try { Tesseract = require('tesseract.js'); } catch { return { missing: true }; }
  // One worker is kept for a few seconds and reused, so a scan of many pages does not pay the start-up cost on every page.
  try {
    if (!sharedWorker) {
      require('fs').mkdirSync(TESSERACT_CACHE, { recursive: true });
      // errorHandler: without one tesseract.js THROWS a worker error in a message handler, outside any promise, and that ends the whole server process (a cut-off PNG did exactly that).
      sharedWorker = Tesseract.createWorker('eng', 1, { cachePath: TESSERACT_CACHE, errorHandler: (e) => { console.warn(`ocr: ${String(e && e.message ? e.message : e).slice(0, 120)}`); } });
    }
    const worker = await sharedWorker;
    if (idleTimer) clearTimeout(idleTimer);
    const out = await worker.recognize(buf);
    idleTimer = setTimeout(releaseWorker, 8000); idleTimer.unref();
    return { text: (out && out.data && out.data.text) || '', confidence: out && out.data ? out.data.confidence : null };
  } catch {
    releaseWorker();
    return { failed: true };
  }
}
let sharedWorker = null; let idleTimer = null;
function releaseWorker() {
  const w = sharedWorker; sharedWorker = null;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (w) Promise.resolve(w).then((x) => x.terminate()).catch(() => {});
}

// Tests swap the recognizer so no real OCR runs; null means the real one.
let recognizer = null;
function setOcr(fn) { recognizer = typeof fn === 'function' ? fn : null; }

/** The words in a picture, read in English, with no minimum: { text } or { error, code }. */
async function ocr(buf) {
  const out = await (recognizer || tesseractOcr)(buf);
  if (out && out.missing) return fail('This server cannot read text from pictures right now. Paste the text instead, or upload a PDF or Word file with the words in it.', 'no_ocr');
  if (!out || out.failed) return fail('That picture could not be read. Try a clearer or larger one.', 'unreadable');
  return { text: out.text || '', confidence: out.confidence };
}

/** A PNG or JPG: the words in the picture, read in English. */
async function fromImage(buf) {
  const got = await ocr(buf);
  if (got.error) return got;
  const text = normalise(got.text);
  if (countWords(text) < MIN_OCR_WORDS) return fail('There is too little text in that picture to work with. Try a clearer one, or paste the text.', 'too_little');
  return { text, pages: 1 };
}

module.exports = { MAX_PAGES, MIN_OCR_WORDS, fail, normalise, countWords, zipEntries, fromPdf, fromDocx, fromPptx, fromOdt, fromEpub, fromXlsx, fromRtf, fromHtmlFile, fromImage, ocr, setOcr, htmlText };
