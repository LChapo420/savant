/**
 * "Learn from your own material", slice (a): upload, extract, store, list, delete.
 *
 *   materials   one per upload or paste   { user_id, title, kind, text, chars, pages, words, ... }
 *
 * What is kept is the extracted text only; the uploaded file itself is thrown away as soon as the text
 * is out. A row belongs to one learner and is never read for anyone else. Deleting removes the row from
 * the store and flushes it to disk. Nothing here calls a model: the course builder is a later slice, and
 * it will go through services/pool.js with learner-class providers only.
 *
 * File type is decided by the first bytes, never by the name or the browser's content type.
 */
const zlib = require('zlib');
const db = require('../config/db');

const MAX_BYTES = 20 * 1024 * 1024;      // an uploaded file
const MAX_PAGES = 300;                   // a PDF's page count
const MAX_CHARS = 900000;                // about 300 pages of prose; also the cap for docx, text and paste
const MIN_CHARS = 200;                   // less than this is not a course
const MAX_ITEMS = 20;                    // materials per learner
const MAX_TOTAL_CHARS = 3000000;         // stored text per learner
const MAX_TITLE = 120;
const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNPACKED = 200 * 1024 * 1024;

function fail(error, code) { return { error, code }; }

function cleanTitle(t, fallback) {
  const s = String(t || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return s || fallback;
}

/** The kind of file from its first bytes: 'pdf', 'docx', 'text' or null. */
function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';
  // Text: no NUL bytes in the first 8 KB and valid UTF-8 (a BOM is fine).
  const head = buf.slice(0, 8192);
  if (head.includes(0)) return null;
  // stream: true lets a multi-byte character cut at the 8 KB edge pass
  try { new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true }); } catch { return null; }
  return 'text';
}

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

/**
 * Turn an uploaded file into text. Returns { text, kind, pages } or { error, code }.
 * The name is used only for the title; the type comes from the bytes.
 */
async function extract(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) return fail('The file is empty.', 'empty');
  if (buf.length > MAX_BYTES) return fail('That file is over 20 MB.', 'too_big');
  const type = sniff(buf);
  let out;
  let kind;
  if (type === 'pdf') { kind = 'pdf'; out = await fromPdf(buf); }
  else if (type === 'zip') { kind = 'docx'; out = await fromDocx(buf); }
  else if (type === 'text') { kind = 'text'; out = { text: normalise(buf.toString('utf8')), pages: null }; }
  else return fail('Only PDF, Word (.docx), text and Markdown files are supported.', 'bad_type');
  if (out.error) return out;
  if (out.text.length < MIN_CHARS) {
    return fail(kind === 'pdf'
      ? 'There is hardly any text in that PDF. If it is scans or photos, text extraction cannot read it yet.'
      : 'There is too little text there to build a course from.', 'too_little');
  }
  if (out.text.length > MAX_CHARS) return fail(`That is about ${Math.round(out.text.length / 3000)} pages of text. The limit is about 300. Upload a part of it.`, 'too_long');
  return { text: out.text, kind, pages: out.pages };
}

function words(text) { return (text.match(/\S+/g) || []).length; }

function pub(row, withText) {
  const out = {
    id: row.id, title: row.title, kind: row.kind, source_name: row.source_name || null, pages: row.pages,
    words: row.words, chars: row.chars, added_at: row.created_at,
    preview: row.text.slice(0, 400),
  };
  if (withText) out.text = row.text;
  return out;
}

function list(userId) {
  return db.find('materials', (m) => m.user_id === userId).map((m) => pub(m, false));
}

function get(userId, id, withText) {
  const row = db.byId('materials', id);
  if (!row || row.user_id !== userId) return null;
  return pub(row, withText);
}

/** The full text, for the course builder (a later slice). Owner only. */
function textOf(userId, id) {
  const row = db.byId('materials', id);
  return row && row.user_id === userId ? row.text : null;
}

function add(userId, { title, text, kind, pages, sourceName }) {
  const mine = db.find('materials', (m) => m.user_id === userId);
  if (mine.length >= MAX_ITEMS) return fail(`You can keep ${MAX_ITEMS} materials. Delete one first.`, 'limit');
  if (mine.reduce((s, m) => s + m.chars, 0) + text.length > MAX_TOTAL_CHARS) return fail('That would take you over your storage limit. Delete a material first.', 'limit');
  const row = db.insert('materials', {
    user_id: userId,
    title: cleanTitle(title, 'Untitled material'),
    kind,
    source_name: sourceName ? cleanTitle(sourceName, '') || null : null,
    pages: pages || null,
    words: words(text),
    chars: text.length,
    text,
  });
  return { value: pub(row, false) };
}

async function addFile(userId, buf, name) {
  const got = await extract(buf);
  if (got.error) return got;
  const base = String(name || '').replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return add(userId, { title: base, text: got.text, kind: got.kind, pages: got.pages, sourceName: name });
}

function addPaste(userId, title, text) {
  if (typeof text !== 'string') return fail('Paste some text first.', 'empty');
  if (text.length > MAX_CHARS * 2) return fail('That is too long to paste. Upload it as a file or paste a part.', 'too_long');
  const t = normalise(text);
  if (t.length < MIN_CHARS) return fail('There is too little text there to build a course from.', 'too_little');
  if (t.length > MAX_CHARS) return fail('That is over the limit of about 300 pages. Paste a part of it.', 'too_long');
  return add(userId, { title, text: t, kind: 'paste', pages: null });
}

/** Delete for real: the row leaves the store and the store is written to disk now. */
function remove(userId, id) {
  const n = db.remove('materials', (m) => m.id === Number(id) && m.user_id === userId);
  if (n) {
    require('./course-builder').removeForMaterial(userId, id); // eslint-disable-line global-require
    db.flush();
  }
  return n > 0;
}

module.exports = {
  MAX_BYTES, MAX_PAGES, MAX_CHARS, MIN_CHARS, MAX_ITEMS, MAX_TOTAL_CHARS,
  sniff, extract, list, get, textOf, addFile, addPaste, remove, zipEntries,
};
