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

module.exports = { MAX_PAGES, fail, normalise, zipEntries, fromPdf, fromDocx };
