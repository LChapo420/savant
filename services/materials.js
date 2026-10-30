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
const db = require('../config/db');

const MAX_BYTES = 20 * 1024 * 1024;      // an uploaded file
const { MAX_PAGES } = require('./material-parsers'); // a PDF's page count
const MAX_CHARS = 900000;                // about 300 pages of prose; also the cap for docx, text and paste
const MIN_CHARS = 200;                   // less than this is not a course
const MAX_ITEMS = 20;                    // materials per learner
const MAX_TOTAL_CHARS = 3000000;         // stored text per learner
const MAX_TITLE = 120;

const { fail, normalise, zipEntries } = require('./material-parsers');
const { parseInChild } = require('./material-runner');

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
  if (type === 'pdf') { kind = 'pdf'; out = await parseInChild('pdf', buf); }
  else if (type === 'zip') {
    const listing = zipEntries(buf);
    const pptx = !!listing && listing.entries.some((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name));
    kind = pptx ? 'pptx' : 'docx';
    out = await parseInChild(kind, buf);
  }
  else if (type === 'text') { kind = 'text'; out = { text: normalise(buf.toString('utf8')), pages: null }; }
  else return fail('Only PDF, Word (.docx), PowerPoint (.pptx), text and Markdown files are supported.', 'bad_type');
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

/** A public web page the learner names: the server fetches it and keeps the article text only. */
async function addLink(userId, link, title) {
  const got = await require('./material-web').fetchPage(link); // eslint-disable-line global-require
  if (got.error) return got;
  if (got.text.length < MIN_CHARS) return fail('There is hardly any readable text on that page.', 'too_little');
  if (got.text.length > MAX_CHARS) return fail('That page is too long. Paste the part you want instead.', 'too_long');
  return add(userId, { title: title || got.title, text: got.text, kind: 'link', pages: null, sourceName: got.url });
}

const YOUTUBE_HOST = /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)$/i;
/** Drop caption timestamps (0:05, 01:02:03, [00:12]) and join caption lines into running text. */
function cleanTranscript(text) {
  return normalise(String(text)
    .replace(/^\s*\[?\(?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\)?\]?\s*$/gm, ' ')
    .replace(/\[?\(?\b\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\b\)?\]?\s*(?=\S)/g, ' ')
    .replace(/\s*\n\s*/g, ' ')).replace(/ {2,}/g, ' ');
}
/**
 * A transcript the learner copied out of a video page and pasted. The server never contacts YouTube: the
 * link is kept as a label only, and must look like a YouTube address.
 */
function addTranscript(userId, title, text, link) {
  let label = null;
  if (link) {
    let u;
    try { u = new URL(String(link).trim()); } catch { return fail('That does not look like a video link.', 'bad_url'); }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || !YOUTUBE_HOST.test(u.hostname)) return fail('The video link should be a youtube.com or youtu.be address (or leave it empty).', 'bad_url');
    label = u.href.slice(0, 200);
  }
  if (typeof text !== 'string') return fail('Paste the transcript first.', 'empty');
  if (text.length > MAX_CHARS * 2) return fail('That transcript is too long. Paste a part of it.', 'too_long');
  const t = cleanTranscript(text);
  if (t.length < MIN_CHARS) return fail('There is too little text there to build a course from.', 'too_little');
  if (t.length > MAX_CHARS) return fail('That transcript is over the limit. Paste a part of it.', 'too_long');
  return add(userId, { title: title || 'Video transcript', text: t, kind: 'transcript', pages: null, sourceName: label });
}

/** Delete for real: the row leaves the store and the store is written to disk now. */
function remove(userId, id) {
  const n = db.remove('materials', (m) => m.id === Number(id) && m.user_id === userId);
  if (n) {
    require('./course-builder').removeForMaterial(userId, id); // eslint-disable-line global-require
    require('./material-pack').removeForMaterial(userId, id); // eslint-disable-line global-require
    require('./material-cards').removeForMaterial(userId, id); // eslint-disable-line global-require
    require('./material-podcast').removeForMaterial(userId, id); // eslint-disable-line global-require
    db.flush();
  }
  return n > 0;
}

module.exports = {
  MAX_BYTES, MAX_PAGES, MAX_CHARS, MIN_CHARS, MAX_ITEMS, MAX_TOTAL_CHARS,
  sniff, extract, add, list, get, textOf, addFile, addPaste, addLink, addTranscript, cleanTranscript, remove, zipEntries,
};
