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
 *
 * Understanding (services/material-keypoints.js): every parser also returns `rich` text with the structure it saw (headings,
 * bold, boxes, page / slide / time marks). add() runs the key-point pass over it and keeps, per material, the key points
 * (emphasis weight 1 to 5, source location, offset in the stored text) and the topics. The course builder reads them:
 * services/course-builder.js teaches every key point and gates on it. Formats: see docs/UPLOADS-ANY-FORMAT.md.
 */
const db = require('../config/db');

const MAX_BYTES = 20 * 1024 * 1024;      // an uploaded file
const { MAX_PAGES } = require('./material-parsers'); // a PDF's page count
const MAX_CHARS = 900000;                // about 300 pages of prose; also the cap for docx, text and paste
const MIN_CHARS = 200;                   // less than this is not a course
const MAX_ITEMS = 20;                    // materials per learner
const MAX_TOTAL_CHARS = 3000000;         // stored text per learner
const MAX_TITLE = 120;

const { fail, normalise, zipEntries, ocr, countWords, MIN_OCR_WORDS } = require('./material-parsers');
const { parseInChild } = require('./material-runner');
const formats = require('./material-formats');
const keypoints = require('./material-keypoints');

function cleanTitle(t, fallback) {
  const s = String(t || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return s || fallback;
}

/** The kind of file from its first bytes: 'pdf', 'rtf', a picture type, 'cfb' (old Office), 'zip', 'text' or null. */
function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.slice(0, 5).toString('latin1') === '{\\rtf') return 'rtf';
  const pic = formats.sniffImage(buf);
  if (pic) return pic;
  if (formats.isCfb(buf)) return 'cfb';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';
  // Text: UTF-16 with a byte-order mark, UTF-8, or an old 8-bit code page (Windows-1252) with nothing but readable characters.
  if (buf.length % 2 === 0 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) return 'text';
  const head = buf.slice(0, 8192);
  if (head.includes(0)) return null;
  let ctrl = 0;
  for (const b of head) if (b < 9 || (b > 13 && b < 32) || b === 127) ctrl++;
  if (ctrl > head.length * 0.02) return null; // program or data bytes, not writing
  // stream: true lets a multi-byte character cut at the 8 KB edge pass
  try { new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true }); } catch { let high = 0; for (const b of head) if (b > 127) high++; return high <= head.length * 0.15 ? 'text8' : null; }
  return 'text';
}

/** Text bytes to a string: UTF-16 (byte-order mark), UTF-8, else Windows-1252. Returns { text, note }. */
function decodeText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.slice(2).toString('utf16le') };
  if (buf[0] === 0xfe && buf[1] === 0xff) { const b = Buffer.from(buf.slice(2)); b.swap16(); return { text: b.toString('utf16le') }; }
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf) }; } catch { /* not UTF-8 */ }
  return { text: new TextDecoder('windows-1252').decode(buf), note: 'This text file was not UTF-8, so it was read as Windows-1252. If accented letters look wrong, save it as UTF-8 and upload again.' };
}

const PICTURE = new Set(['png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'heic', 'avif']);

/** OCR a picture (any supported type). Returns { text } or { error, code }. Preprocessing is best effort for PNG and JPG. */
async function readPicture(buf, type) {
  let work = buf;
  const prepared = await formats.toPng(buf, type);
  if (prepared.png) work = prepared.png;
  else if (type !== 'png' && type !== 'jpeg') return prepared;
  return ocr(work);
}

const pageMarks = (pages) => pages.map((p) => `[[p${p.page}]]\n${p.text}`).join('\n\n');

/**
 * Turn an uploaded file into text. Returns { text, rich, kind, pages } or { error, code }.
 * The name is used only for the title; the type comes from the bytes. opts.inner is set for a file inside a ZIP.
 */
async function extract(buf, opts = {}) {
  if (!Buffer.isBuffer(buf) || !buf.length) return fail('The file is empty.', 'empty');
  if (buf.length > MAX_BYTES) return fail('That file is over 20 MB.', 'too_big');
  const type = sniff(buf);
  const warnings = [];
  let out;
  let kind;
  if (PICTURE.has(type)) {
    // OCR runs in this process so a test can swap the recognizer; tesseract.js is optional.
    kind = 'image';
    out = await readPicture(buf, type);
    if (!out.error) {
      const text = normalise(out.text);
      out = countWords(text) < MIN_OCR_WORDS
        ? fail('There is too little text in that picture to work with. Try a clearer one, or paste the text.', 'too_little')
        : { text, pages: 1 };
    }
  }
  else if (type === 'pdf') {
    kind = 'pdf'; out = await parseInChild('pdf', buf);
    if (out.blank && out.blank.length) warnings.push(`${out.blank.length === 1 ? 'Page' : 'Pages'} ${out.blank.slice(0, 12).join(', ')}${out.blank.length > 12 ? ` and ${out.blank.length - 12} more` : ''} of this PDF had no readable text (pictures, or scans inside a text document). Those pages are not in the course: paste their text, or upload them as pictures.`);
    if (out.scanned) {
      // No text layer: the page pictures come back from the worker and are read here, one at a time.
      const pages = [];
      const unread = [];
      let failure = null;
      const total = out.images.length;
      for (let i = 0; i < total; i++) {
        const im = out.images[i];
        if (opts.onProgress) opts.onProgress(i, total, `page ${im.page}`);
        // eslint-disable-next-line no-await-in-loop
        const got = await ocr(im.png);
        if (got.error) { failure = got; unread.push(im.page); if (got.code === 'no_ocr') break; continue; }
        const text = normalise(got.text);
        if (countWords(text) >= 3) pages.push({ page: im.page, text }); else unread.push(im.page);
      }
      if (opts.onProgress) opts.onProgress(total, total, '');
      const text = normalise(pages.map((p) => p.text).join('\n\n'));
      if (countWords(text) < MIN_OCR_WORDS) {
        out = failure || fail('That PDF looks scanned and little could be read from its pictures. Try clearer scans, or paste the text.', 'scanned');
      } else {
        const nums = (a) => a.slice(0, 12).join(', ') + (a.length > 12 ? ` and ${a.length - 12} more` : '');
        if (unread.length) warnings.push(`${unread.length} scanned page${unread.length === 1 ? '' : 's'} could not be read (page ${nums(unread)}). Those pages are not in the course; upload clearer pictures of them to add them.`);
        if (out.checked < out.pages) warnings.push(`Only the first ${out.checked} of ${out.pages} pages of this scan were read. Upload the rest as a second file to add it.`);
        else if (out.checked > total) warnings.push(`${out.checked - total} page${out.checked - total === 1 ? '' : 's'} of this scan had no picture to read and ${out.checked - total === 1 ? 'was' : 'were'} left out.`);
        out = { text, rich: pageMarks(pages), pages: out.pages, ocr: true };
      }
    }
  }
  else if (type === 'zip') {
    const listing = zipEntries(buf);
    const has = (re) => !!listing && listing.entries.some((e) => re.test(e.name));
    const mime = listing && listing.entries.length && listing.entries[0].name === 'mimetype' ? buf.slice(38, 38 + 70).toString('latin1') : '';
    kind = has(/^ppt\/slides\/slide\d+\.xml$/) ? 'pptx' : has(/^xl\/workbook\.xml$/) ? 'xlsx' : /opendocument\.text/.test(mime) ? 'odt'
      : /opendocument\.presentation/.test(mime) ? 'odp' : /opendocument\.spreadsheet/.test(mime) ? 'ods'
        : /epub\+zip/.test(mime) || has(/^META-INF\/container\.xml$/) ? 'epub'
          : has(/^word\/document\.xml$/) || has(/^\[Content_Types\]\.xml$/) ? 'docx' : 'zip';
    if (kind === 'zip') {
      if (opts.inner) return fail('A ZIP inside a ZIP is not opened. Unpack it and upload the files.', 'bad_type');
      if (!listing) return fail('That ZIP, or Office file, looks damaged or cut off (the end of it is missing). Download or export it again and upload the new copy.', 'unreadable');
      let n = 0;
      out = await formats.fromZipFiles(buf, async (data, name) => {
        if (opts.onProgress) opts.onProgress(n++, listing.entries.length, name);
        return extract(data, { inner: true });
      });
      if (out.files) {
        const left = out.files.filter((f) => !f.ok);
        if (left.length) warnings.push(`${left.length} file${left.length === 1 ? '' : 's'} in the ZIP ${left.length === 1 ? 'was' : 'were'} not used: ${left.slice(0, 6).map((f) => `${f.name} (${f.reason})`).join('; ')}${left.length > 6 ? ` and ${left.length - 6} more` : ''}.`);
      }
    } else out = await parseInChild(kind, buf);
  }
  else if (type === 'rtf') {
    kind = 'rtf'; out = await parseInChild('rtf', buf);
    const tail = buf.slice(-64).toString('latin1');
    if (!out.error && !/\}\s*$/.test(tail)) warnings.push('This RTF file ends without its closing bracket, so it was probably cut off. What came before is used; download or export it again if the end is missing.');
  }
  else if (type === 'cfb') { kind = 'doc'; out = await parseInChild('doc', buf); }
  else if (type === 'text' || type === 'text8') {
    const dec = decodeText(buf);
    if (dec.note) warnings.push(dec.note);
    buf = Buffer.from(dec.text, 'utf8');
    const head = dec.text.slice(0, 4096);
    if (/^\s*(<!doctype html|<html)/i.test(head.slice(0, 512))) { kind = 'html'; out = await parseInChild('html', buf); }
    else if (/^\s*\{/.test(head) && /"nbformat"|"cell_type"/.test(head)) { kind = 'ipynb'; out = await parseInChild('ipynb', buf); }
    else if (formats.isSubtitles(head)) { kind = 'subtitles'; out = await parseInChild('subtitles', buf); }
    else if (formats.isLatex(head)) { kind = 'latex'; out = await parseInChild('latex', buf); }
    else { kind = 'text'; const t = normalise(buf.toString('utf8')); out = { text: t, rich: t, pages: null }; }
  }
  else if (!opts.inner && require('./material-audio').sniffAudio(buf)) return fail('That is an audio recording. Use the Audio box on this page (or upload it here again: recordings are sent there automatically) and it is turned into text.', 'is_audio');
  else if (!opts.inner && require('./material-video').sniffVideo(buf)) return fail('That is a video file. Upload it in the file box with its .mp4, .mov, .webm or .mkv name and its sound is turned into text.', 'is_video');
  else return fail('Savant could not tell what kind of file that is. Supported: PDF (text or scanned), Word (.docx, .doc), PowerPoint, Excel, OpenDocument (text, slides, sheets), EPUB, RTF, HTML, LaTeX, Jupyter notebooks, subtitles (SRT, VTT), text, Markdown, CSV, source files, pictures (PNG, JPG, WEBP, GIF, BMP, TIFF), ZIPs of these, and audio or video as recordings. If it should be one of these, it may be damaged or renamed: open it on your computer first, or paste the text.', 'bad_type');
  if (out.error) return out;
  // A picture's reader has already applied its own 20-word rule; a file inside a ZIP only has to say something.
  if (kind !== 'image' && out.text.length < (opts.inner ? 40 : MIN_CHARS)) {
    return fail(kind === 'pdf'
      ? 'There is hardly any text in that PDF. If it is scans or photos, text extraction cannot read it yet.'
      : 'There is too little text there to build a course from.', 'too_little');
  }
  if (out.text.length > MAX_CHARS) return fail(`That is about ${Math.round(out.text.length / 3000)} pages of text. The limit is about 300. Upload a part of it.`, 'too_long');
  return { text: out.text, rich: out.rich || out.text, kind, pages: out.pages, ocr: !!out.ocr || kind === 'image', files: out.files, warnings };
}

const EN_STOP = new Set('the of and to in is that it for as with was on are be this by at from or an which have not but they their can more if when what there been has will all one would about'.split(' '));
/** False when a long text is clearly not English (share of the commonest English words under 15%). Short texts pass. */
function looksEnglish(text) {
  const w = String(text).toLowerCase().match(/[a-z']+/g) || [];
  if (w.length < 80) return true;
  let n = 0; for (const x of w) if (EN_STOP.has(x)) n++;
  return n / w.length >= 0.15;
}
const NOT_ENGLISH = 'This does not look like English. The speech and picture readers on this server understand English only, so words may be wrong or missing. Paste the text instead for other languages.';

function words(text) { return (text.match(/\S+/g) || []).length; }

function pub(row, withText) {
  const out = {
    id: row.id, title: row.title, kind: row.kind, source_name: row.source_name || null, pages: row.pages,
    words: row.words, chars: row.chars, added_at: row.created_at,
    preview: row.text.slice(0, 400),
  };
  out.key_point_count = (row.key_points || []).length;
  if (row.warnings && row.warnings.length) out.warnings = row.warnings;
  if (row.files) out.files = row.files;
  if (withText) { out.text = row.text; out.key_points = row.key_points || []; out.topics = row.topics || []; }
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

const SPOKEN = new Set(['audio', 'video', 'transcript', 'subtitles']);

/** The key points, topics and assessed items of a text: a model-free pass that must never stop an upload. */
function understand(text, rich, kind) {
  try {
    const got = keypoints.extract(rich || text, { plain: text, spoken: SPOKEN.has(kind) });
    return { key_points: got.key_points, topics: got.topics, assessed: got.assessed };
  } catch (err) {
    console.warn(`materials: key points skipped: ${err.message}`);
    return { key_points: [], topics: [], assessed: [] };
  }
}

function add(userId, { title, text, rich, kind, pages, sourceName, ocr: viaOcr, files, warnings }) {
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
    ...understand(text, rich, kind),
    ...(viaOcr ? { ocr: true } : {}),
    ...(files ? { files: files.slice(0, 40) } : {}),
    ...(() => { const w = [...(warnings || [])]; if ((viaOcr || kind === 'audio' || kind === 'image') && !looksEnglish(text)) w.push(NOT_ENGLISH); return w.length ? { warnings: w.slice(0, 8) } : {}; })(),
  });
  return { value: pub(row, false) };
}

async function addFile(userId, buf, name, opts = {}) {
  const got = await extract(buf, { onProgress: opts.onProgress });
  if (got.error) return got;
  const base = String(name || '').replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return add(userId, { title: base, text: got.text, rich: got.rich, kind: got.kind, pages: got.pages, sourceName: name, ocr: got.ocr, files: got.files, warnings: got.warnings });
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
  // A Google Docs, Slides or Sheets link goes through that file's export, so its headings, bold and slides survive.
  if (formats.googleExport(link)) return addGoogleLink(userId, link, title);
  const got = await require('./material-web').fetchPage(link); // eslint-disable-line global-require
  if (got.error) return got;
  if (got.text.length < MIN_CHARS) return fail('There is hardly any readable text on that page.', 'too_little');
  if (got.text.length > MAX_CHARS) return fail('That page is too long. Paste the part you want instead.', 'too_long');
  return add(userId, { title: title || got.title, text: got.text, rich: got.rich, kind: 'link', pages: null, sourceName: got.url });
}

/**
 * A public Google Docs, Slides or Sheets link: the server asks Google for the file's export (DOCX, PPTX or XLSX), so headings,
 * bold, slides and sheets come through, and reads it like an upload. Only docs.google.com links that are shared with "anyone
 * with the link" work; a private file comes back as a sign-in page, which is reported plainly.
 */
async function addGoogleLink(userId, link, title, opts = {}) {
  const g = formats.googleExport(link);
  if (!g) return fail('That is not a Google Docs, Slides or Sheets link.', 'bad_url');
  const web = require('./material-web'); // eslint-disable-line global-require
  const got = await web.fetchText(g.url, { ...opts, types: /^(?:application\/(?:vnd\.openxmlformats|octet-stream|zip)|application\/vnd\.ms)/i, hostOk: (h) => /(^|\.)(?:google\.com|googleusercontent\.com)$/i.test(h) });
  if (got.error) return got.code === 'not_page' || got.code === 'bad_type' ? fail('That Google file is not shared with anyone who has the link. Share it that way, or export it as DOCX, PPTX or PDF and upload that.', 'private') : got;
  const file = await extract(got.raw, {});
  if (file.error) return file;
  return add(userId, { title: title || `Google ${g.kind === 'docx' ? 'document' : g.kind === 'pptx' ? 'slides' : 'sheet'}`, text: file.text, rich: file.rich, kind: file.kind, pages: file.pages, sourceName: g.url });
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
  const rich = null;
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
  return add(userId, { title: title || 'Video transcript', text: t, rich, kind: 'transcript', pages: null, sourceName: label });
}

function transcriptRow(userId, title, text, sourceName, rich) {
  if (text.length < MIN_CHARS) return fail('There is too little spoken text there to build a course from.', 'too_little');
  if (text.length > MAX_CHARS) return fail('That transcript is over the limit. Use a shorter part.', 'too_long');
  return add(userId, { title: title || 'Video transcript', text, rich: rich || text, kind: 'transcript', pages: null, sourceName });
}

/** A YouTube link: read its caption track (never the video) and keep the text. */
async function addYoutube(userId, link, title, opts) {
  const got = await require('./material-youtube').fetchCaptions(link, opts); // eslint-disable-line global-require
  if (got.error) return got;
  const text = cleanTranscript(got.text);
  // The stored text has no timestamps; the key-point pass reads the timed version so each point keeps its time in the video.
  const timed = got.segments && got.segments.length ? formats.mergeTimed(got.segments.map((c) => ({ start: c.start, text: c.text }))) : null;
  const out = transcriptRow(userId, title || got.title, text, got.url, timed || undefined);
  if (out.error) return out;
  out.value.captions = { language: got.language, auto: got.auto };
  return out;
}

/** Delete for real: the row leaves the store and the store is written to disk now. */
function remove(userId, id) {
  const n = db.remove('materials', (m) => m.id === Number(id) && m.user_id === userId);
  if (n) {
    require('./course-builder').removeForMaterial(userId, id); // eslint-disable-line global-require
    require('./material-pack').removeForMaterial(userId, id); // eslint-disable-line global-require
    require('./material-cards').removeForMaterial(userId, id); // eslint-disable-line global-require
    require('./material-podcast').removeForMaterial(userId, id); // eslint-disable-line global-require
    require('./material-notes').removeForMaterial(userId, id); // eslint-disable-line global-require
    db.flush();
  }
  return n > 0;
}

module.exports = {
  MAX_BYTES, MAX_PAGES, MAX_CHARS, decodeText, looksEnglish, MIN_CHARS, MAX_ITEMS, MAX_TOTAL_CHARS,
  sniff, extract, add, list, get, textOf, addFile, addPaste, addLink, addGoogleLink, addYoutube, addTranscript, cleanTranscript, remove, zipEntries,
};
