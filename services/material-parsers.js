/**
 * Text extraction for uploaded PDF and Word files. No db and no server state in here: this module is
 * loaded by the worker process (material-worker.js), which parses one file under a time and memory limit.
 */
const MAX_PAGES = 300;
const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNPACKED = 200 * 1024 * 1024;

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

async function fromPdf(buf) {
  const { getDocumentProxy, extractText } = await import('unpdf');
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf), { isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  } catch (err) {
    if (/password/i.test(String(err && (err.name + err.message)))) return fail('That PDF is password-protected. Remove the password and upload it again.', 'encrypted');
    return fail('That PDF could not be read. It may be damaged.', 'unreadable');
  }
  try {
    if (pdf.numPages > MAX_PAGES) return fail(`That PDF has ${pdf.numPages} pages. The limit is ${MAX_PAGES}. Upload a part of it.`, 'too_many_pages');
    const { text } = await extractText(pdf, { mergePages: false });
    return { text: normalise(text.join('\n\n')), pages: pdf.numPages };
  } catch {
    return fail('That PDF could not be read. It may be damaged.', 'unreadable');
  } finally {
    try { await pdf.destroy(); } catch { /* nothing to do */ }
  }
}

async function fromDocx(buf) {
  const listing = zipEntries(buf);
  if (!listing) return fail('That file is not a Word document.', 'bad_type');
  if (listing.tooMany) return fail('That file is not a usable Word document.', 'bad_type');
  const unpacked = listing.entries.reduce((s, e) => s + e.size, 0);
  if (unpacked > MAX_ZIP_UNPACKED) return fail('That document unpacks to far more than the size limit.', 'too_big');
  if (!listing.entries.some((e) => e.name === 'word/document.xml')) {
    return fail('Only PDF, Word (.docx), text and Markdown files are supported.', 'bad_type');
  }
  const mammoth = require('mammoth');
  try {
    const out = await mammoth.extractRawText({ buffer: buf });
    return { text: normalise(out.value), pages: null };
  } catch {
    return fail('That Word document could not be read. It may be damaged.', 'unreadable');
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
  for (const s of slides) {
    const n = num(s.name);
    const lines = slideLines(await zip.file(s.name).async('string'));
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    // Notes pages repeat the slide number as a lone digit line; drop it.
    const notes = notesFile ? slideLines(await notesFile.async('string')).filter((l) => !/^\d{1,3}$/.test(l)) : [];
    if (!lines.length && !notes.length) continue;
    const [title, ...rest] = lines;
    parts.push([`Slide ${n}${title ? `: ${title}` : ''}`, ...rest, ...(notes.length ? [`Speaker notes: ${notes.join(' ')}`] : [])].join('\n'));
  }
  return { text: normalise(parts.join('\n\n')), pages: slides.length };
}

module.exports = { MAX_PAGES, fail, normalise, zipEntries, fromPdf, fromDocx, fromPptx };
