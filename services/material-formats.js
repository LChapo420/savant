/**
 * More formats for "My material", and the structure (headings, bold, boxes, pages, slides, time) each one carries.
 *
 * Every parser here, and the ones in material-parsers.js, returns { text, rich, pages } where `text` is what is stored and
 * quoted from, and `rich` is the same words with the markers services/material-keypoints.js reads (see its header).
 * No db, no network, no model: this module is loaded by the worker process too.
 *
 *   fromIpynb      Jupyter notebooks: markdown cells keep their headings and bold, code cells are kept as code
 *   fromSubtitles  SRT and WebVTT: cues merged into [m:ss] lines like a recording's transcript; rolling captions de-duplicated
 *   fromOdp        OpenDocument presentations: slide titles, text and notes
 *   fromOds        OpenDocument spreadsheets: every sheet
 *   fromLatex      LaTeX: sections become headings, \textbf bold, theorem/definition/box environments become callouts
 *   fromDoc        legacy Word .doc (OLE): text recovered through the piece table; styles are not recovered
 *   pdfRich        PDF page text with heading (type size) and bold detection, from pdfjs
 *   pdfImages      the page pictures of a scanned PDF, for OCR in the caller
 *   toPng          WEBP, GIF, BMP, TIFF, AVIF to a clean PNG for OCR (HEIC when the local libheif can read it)
 *   fromZipFiles   a ZIP of mixed files: each readable file in turn (the caller does the reading)
 *   googleExport   a public Google Docs, Slides or Sheets link to its export link
 */
const P = require('./material-parsers');

const { fail, normalise } = P;

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unxml(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] !== '#') return XML_ENT[e.toLowerCase()];
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  });
}

/** Rich text without its markers: what is stored and quoted from. */
function plainOf(rich) {
  return normalise(String(rich)
    .replace(/^\[\[[a-z][^\]]*\]\]\s*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/==([^=]+)==/g, '$1')
    .replace(/^>\s?/gm, '').replace(/^#{1,6}\s+/gm, ''));
}

// ── HTML (also DOCX through mammoth, and EPUB chapters) ──────────────────────────────────────────────
const CALLOUT_CLASS = /class="[^"]*\b(?:callout|key|note|important|warning|tip|box|highlight|definition|theorem|takeaway|alert)\b[^"]*"/i;

/** HTML to rich text: headings, bold, highlight, boxed blocks and list items kept as markers. */
function htmlRich(html) {
  let h = String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|nav|head|footer)\b[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, t, inner) => `\n\n${'#'.repeat(Number(t[1]))} ${inner.replace(/<[^>]+>/g, '')}\n\n`);
  h = h.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, t, inner) => (inner.trim() ? `**${inner.replace(/<[^>]+>/g, '').trim()}**` : ''));
  h = h.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, (m, inner) => `==${inner.replace(/<[^>]+>/g, '').trim()}==`);
  h = h.replace(/<(blockquote|aside)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, t, inner) => `\n\n${inner.replace(/<\/?(?:p|div|br)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `> ${l}`).join('\n')}\n\n`);
  h = h.replace(/<(div|p|section|span)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (m, t, attrs, inner) => (t !== 'span' && CALLOUT_CLASS.test(attrs) && !/<(div|section)\b/i.test(inner) ? `\n\n${inner.replace(/<[^>]+>/g, '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `> ${l}`).join('\n')}\n\n` : m));
  h = h.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/?(p|div|section|article|br|ul|ol|tr|table|pre)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
  const lines = unxml(h.replace(/&nbsp;/g, ' ')).replace(/[ \t ]+/g, ' ').split('\n').map((l) => l.trim());
  return normalise(lines.join('\n')).replace(/\*\*\s*\*\*/g, '').replace(/\*\* \*\*/g, ' ');
}

/** PowerPoint: paragraph text -> the same with bold runs marked, for the paragraphs that have any bold run. */
function slideBold(xml) {
  const map = new Map();
  for (const para of xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) || []) {
    const runs = (para.match(/<a:r>[\s\S]*?<\/a:r>/g) || []).map((r) => ({ bold: /<a:rPr\b[^>]*\bb="1"/.test(r), t: unxml((r.match(/<a:t(?: [^>]*)?>([^<]*)<\/a:t>/) || [])[1] || '') }));
    const plain = runs.map((r) => r.t).join('').trim();
    if (!plain || !runs.some((r) => r.bold)) continue;
    const marked = runs.map((r) => (r.bold && r.t.trim() ? `**${r.t.trim()}** ` : r.t)).join('').replace(/\s+/g, ' ').replace(/\*\* \*\*/g, ' ').trim();
    map.set(plain, marked);
  }
  return map;
}

// ── Jupyter ──────────────────────────────────────────────────────────────────────────────────────
function fromIpynb(buf) {
  let nb;
  try { nb = JSON.parse(buf.toString('utf8')); } catch { return fail('That notebook could not be read. It may be damaged.', 'unreadable'); }
  const cells = nb && Array.isArray(nb.cells) ? nb.cells : (nb && nb.worksheets && nb.worksheets[0] && nb.worksheets[0].cells) || null;
  if (!cells) return fail('That file is not a Jupyter notebook.', 'bad_type');
  const src = (c) => (Array.isArray(c.source) ? c.source.join('') : String(c.source || (c.input && c.input.join ? c.input.join('') : '') || ''));
  const rich = [];
  const plain = [];
  cells.slice(0, 2000).forEach((c, i) => {
    const s = src(c).replace(/\r\n?/g, '\n').trimEnd();
    if (!s.trim()) return;
    rich.push(`[[c${i + 1}]]`);
    if (c.cell_type === 'markdown') { rich.push(s); plain.push(s); return; }
    if (c.cell_type === 'code' || c.cell_type === 'raw') {
      const comments = s.split('\n').filter((l) => /^\s*#\s*\S/.test(l)).map((l) => l.replace(/^\s*#+\s*/, '')).join(' ');
      rich.push('```', s, '```');
      plain.push(`Code:\n${s}`);
      const out = (c.outputs || []).map((o) => (o.text ? [].concat(o.text).join('') : o.data && o.data['text/plain'] ? [].concat(o.data['text/plain']).join('') : '')).join('\n').trim();
      if (out) { rich.push(`Output: ${out.slice(0, 600)}`); plain.push(`Output: ${out.slice(0, 600)}`); }
      void comments;
    }
  });
  return { text: normalise(plain.join('\n\n')), rich: normalise(rich.join('\n')), pages: null };
}

// ── Subtitles ────────────────────────────────────────────────────────────────────────────────────
function stampOf(sec) {
  const s = Math.floor(sec); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
function timeSec(t) {
  const m = String(t).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  return m ? (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]) : null;
}

function isSubtitles(head) {
  return /^﻿?WEBVTT/.test(head) || /^﻿?\s*\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(head);
}

/** SRT and WebVTT. Cues are merged into lines of about 30 seconds, "[m:ss] text", the same shape as a recording's transcript. */
function fromSubtitles(buf) {
  const raw = buf.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues = [];
  for (const block of raw.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    const ti = lines.findIndex((l) => /-->/.test(l));
    if (ti < 0) continue;
    const start = timeSec(lines[ti].split('-->')[0]);
    if (start == null) continue;
    const text = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/&nbsp;/g, ' ').replace(/\[(?:music|applause|laughter)\]/gi, '').replace(/\s+/g, ' ').trim();
    if (text) cues.push({ start, text: unxml(text) });
  }
  if (!cues.length) return fail('That subtitle file has no captions in it.', 'bad_type');
  const text = mergeTimed(cues);
  return { text, rich: text, pages: null };
}

/** Timed cues [{ start (seconds), text }] to "[m:ss] text" lines of about 30 seconds; rolling repeats dropped. */
function mergeTimed(cues) {
  const out = [];
  let prev = '';
  let cur = null;
  for (const c of cues) {
    // Rolling auto-captions repeat the previous line: keep only what is new.
    let t = c.text;
    if (prev && t.startsWith(prev)) t = t.slice(prev.length).trim();
    if (t === prev) { prev = c.text; continue; }
    prev = c.text;
    if (!t) continue;
    if (!cur || c.start - cur.start >= 30) { cur = { start: c.start, parts: [] }; out.push(cur); }
    cur.parts.push(t);
  }
  return normalise(out.map((o) => `[${stampOf(o.start)}] ${o.parts.join(' ')}`).join('\n'));
}

// ── OpenDocument presentations and spreadsheets ──────────────────────────────────────────────────
async function openZip(buf, label) {
  const listing = P.zipEntries(buf);
  if (!listing || listing.tooMany) return fail(`That file is not a usable ${label} file.`, 'bad_type');
  if (listing.entries.reduce((s, e) => s + e.size, 0) > 200 * 1024 * 1024) return fail('That file unpacks to far more than the size limit.', 'too_big');
  try { return { zip: await require('jszip').loadAsync(buf) }; } catch { return fail(`That ${label} file could not be read. It may be damaged.`, 'unreadable'); }
}

const paras = (xml) => (xml.match(/<text:(?:p|h)\b[^>]*>[\s\S]*?<\/text:(?:p|h)>/g) || []).map((p) => unxml(p.replace(/<text:(?:tab|s)\b[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);

async function fromOdp(buf) {
  const z = await openZip(buf, 'OpenDocument presentation');
  if (z.error) return z;
  const f = z.zip.file('content.xml');
  if (!f) return fail('That file has no slides in it.', 'bad_type');
  const xml = await f.async('string');
  const pages = xml.match(/<draw:page\b[\s\S]*?<\/draw:page>/g) || [];
  if (!pages.length) return fail('That file has no slides in it.', 'bad_type');
  const boldStyles = new Set((xml.match(/<style:style\b[^>]*style:name="[^"]+"[^>]*>(?:(?!<\/style:style>)[\s\S])*?fo:font-weight="bold"[\s\S]*?<\/style:style>/g) || []).map((st) => (st.match(/style:name="([^"]+)"/) || [])[1]));
  const paras = (x) => (x.match(/<text:(?:p|h)\b[^>]*>[\s\S]*?<\/text:(?:p|h)>/g) || []).map((p) => unxml(p.replace(/<text:(?:tab|s)\b[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const marked = (x) => (x.match(/<text:(?:p|h)\b[^>]*>[\s\S]*?<\/text:(?:p|h)>/g) || []).map((p) => unxml(p.replace(/<text:span\b[^>]*text:style-name="([^"]+)"[^>]*>([\s\S]*?)<\/text:span>/g, (m, st, t) => (boldStyles.has(st) && t.trim() ? `**${t.replace(/<[^>]+>/g, '').trim()}** ` : t)).replace(/<text:(?:tab|s)\b[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const rich = []; const plain = [];
  pages.forEach((pg, i) => {
    const notesAt = pg.indexOf('<presentation:notes');
    const body = notesAt >= 0 ? pg.slice(0, notesAt) : pg;
    const notes = notesAt >= 0 ? paras(pg.slice(notesAt)) : [];
    const frames = body.match(/<draw:frame\b[\s\S]*?<\/draw:frame>/g) || [];
    let title = '';
    const rest = []; const restMarked = [];
    for (const fr of frames) {
      const lines = paras(fr);
      if (!lines.length) continue;
      if (!title && /presentation:class="title"/.test(fr)) title = lines.join(' '); else { rest.push(...lines); restMarked.push(...marked(fr)); }
    }
    if (!title && !rest.length && !notes.length) return;
    rich.push(`[[s${i + 1}]]`);
    if (title) rich.push(`# ${title}`);
    restMarked.forEach((l) => rich.push(`- ${l}`));
    if (notes.length) rich.push(`Speaker notes: ${notes.join(' ')}`);
    plain.push([`Slide ${i + 1}${title ? `: ${title}` : ''}`, ...rest, ...(notes.length ? [`Speaker notes: ${notes.join(' ')}`] : [])].join('\n'));
  });
  return { text: normalise(plain.join('\n\n')), rich: normalise(rich.join('\n')), pages: pages.length };
}

async function fromOds(buf) {
  const z = await openZip(buf, 'OpenDocument spreadsheet');
  if (z.error) return z;
  const f = z.zip.file('content.xml');
  if (!f) return fail('That file has no sheets in it.', 'bad_type');
  const xml = await f.async('string');
  const tables = xml.match(/<table:table\b[\s\S]*?<\/table:table>/g) || [];
  if (!tables.length) return fail('That file has no sheets in it.', 'bad_type');
  const out = []; let rows = 0;
  for (const t of tables) {
    const name = unxml((t.match(/table:name="([^"]*)"/) || [])[1] || 'Sheet');
    const lines = [];
    for (const r of t.match(/<table:table-row\b[\s\S]*?<\/table:table-row>/g) || []) {
      const cells = (r.match(/<table:table-cell\b[^>]*?(?:\/>|>[\s\S]*?<\/table:table-cell>)/g) || []).map((c) => paras(c).join(' '));
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length) { lines.push(cells.join('\t')); if (++rows > 100000) return fail('That spreadsheet has too many rows.', 'too_big'); }
    }
    if (lines.length) out.push(`${name}\n${lines.join('\n')}`);
  }
  const text = normalise(out.join('\n\n'));
  return { text, rich: text.replace(/^(.+)\n/gm, (m, l, off) => m), pages: null };
}

// ── LaTeX ─────────────────────────────────────────────────────────────────────────────────────────
const BOX_ENV = /^(?:theorem|lemma|corollary|proposition|definition|keypoint|important|remark|note|tcolorbox|framed|mdframed|boxed|summary|principle|rule|warning|takeaway|axiom|law)$/i;

function isLatex(head) {
  return /\\documentclass|\\begin\{document\}|(?:\\(?:sub)*section\*?\{[^}]+\}[\s\S]*){2}/.test(head);
}

function fromLatex(buf) {
  let s = buf.toString('utf8').replace(/\r\n?/g, '\n');
  const body = s.match(/\\begin\{document\}([\s\S]*?)(?:\\end\{document\}|$)/);
  const title = (s.match(/\\title\{([^}]*)\}/) || [])[1];
  s = body ? body[1] : s;
  s = s.replace(/(^|[^\\])%.*$/gm, '$1').replace(/\\(?:label|index|cite|ref|eqref|vspace|hspace|newpage|clearpage|maketitle|tableofcontents|noindent|centering)\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, '');
  const rich = [];
  const stack = [];
  if (title) rich.push(`# ${title.replace(/\\\\/g, ' ').replace(/\\[a-zA-Z]+\s*/g, '').trim()}`);
  const inline = (t) => t
    .replace(/\\(?:textbf|textit|emph|underline)\{([^{}]*)\}/g, (m, x) => (/textbf|underline/.test(m) ? `**${x}**` : x))
    .replace(/\\(?:hl|highlight|mathbf)\{([^{}]*)\}/g, '==$1==')
    .replace(/\\(?:text|mbox|mathrm|textrm|texttt)\{([^{}]*)\}/g, '$1')
    .replace(/\\\\/g, ' ').replace(/\\([&%$#_{}])/g, '$1').replace(/~/g, ' ').replace(/``|''/g, '"');
  for (const raw of s.split('\n')) {
    let line = raw.trim();
    if (!line) { rich.push(''); continue; }
    const sec = line.match(/^\\(part|chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\{(.*)\}\s*$/);
    if (sec) { rich.push('', `${'#'.repeat({ part: 1, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 4 }[sec[1]])} ${inline(sec[2])}`, ''); continue; }
    const beg = line.match(/^\\begin\{([A-Za-z*]+)\}(?:\[([^\]]*)\])?(?:\{[^}]*\})?\s*(.*)$/);
    if (beg) {
      if (BOX_ENV.test(beg[1].replace('*', ''))) { stack.push('box'); const label = beg[2] ? `${beg[1]} (${beg[2]})` : beg[1]; rich.push('', `> ${label[0].toUpperCase()}${label.slice(1)}: ${inline(beg[3] || '')}`.trimEnd()); continue; }
      stack.push(beg[1]);
      if (/^(?:itemize|enumerate|description)$/.test(beg[1])) continue;
      if (/^(?:equation|align|gather|displaymath|eqnarray)\*?$/.test(beg[1])) { rich.push('Equation:'); continue; }
      if (beg[3]) line = beg[3]; else continue;
    }
    if (/^\\end\{/.test(line)) { stack.pop(); rich.push(''); continue; }
    const inBox = stack[stack.length - 1] === 'box';
    const item = line.match(/^\\item(?:\[([^\]]*)\])?\s*(.*)$/);
    const textLine = inline(item ? `${item[1] ? `${item[1]}: ` : ''}${item[2]}` : line).replace(/\$\$?([^$]+)\$\$?/g, '$1');
    if (!textLine.trim()) continue;
    rich.push(`${inBox ? '> ' : ''}${item ? '- ' : ''}${textLine}`);
  }
  const r = normalise(rich.join('\n'));
  return { text: plainOf(r), rich: r, pages: null };
}

// ── Legacy Word .doc ───────────────────────────────────────────────────────────────────────────────
const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const isCfb = (buf) => buf.length > 512 && buf.slice(0, 8).equals(CFB_MAGIC);

/** The named streams of an OLE compound file: Map name -> Buffer. Bounded: 200 MB of sectors at most. */
function cfbStreams(buf) {
  const shift = buf.readUInt16LE(30); const sector = 1 << shift;
  const miniSector = 1 << buf.readUInt16LE(32);
  if (shift !== 9 && shift !== 12) return null;
  const off = (n) => (n + 1) * sector;
  const sectors = Math.floor((buf.length - sector) / sector);
  const fatSectors = []; const numFat = buf.readUInt32LE(44);
  for (let i = 0; i < Math.min(109, numFat); i++) fatSectors.push(buf.readUInt32LE(76 + i * 4));
  let difat = buf.readUInt32LE(68);
  for (let d = buf.readUInt32LE(72); d > 0 && difat < 0xfffffff0 && fatSectors.length < numFat; d--) {
    const o = off(difat);
    for (let i = 0; i < sector / 4 - 1 && fatSectors.length < numFat; i++) fatSectors.push(buf.readUInt32LE(o + i * 4));
    difat = buf.readUInt32LE(o + sector - 4);
  }
  const fat = [];
  for (const fs of fatSectors) { if (fs >= sectors) continue; const o = off(fs); for (let i = 0; i < sector / 4; i++) fat.push(buf.readUInt32LE(o + i * 4)); }
  const chain = (start, table, size, base) => {
    const parts = []; let n = start; let guard = 0;
    while (n < 0xfffffff0 && guard++ < 1000000) {
      const o = base(n);
      if (o < 0 || o + size > (base === off ? buf.length : Infinity)) break;
      parts.push(o); n = table[n];
      if (n === undefined) break;
    }
    return parts;
  };
  const readChain = (start) => Buffer.concat(chain(start, fat, sector, off).map((o) => buf.slice(o, o + sector)));
  const dir = readChain(buf.readUInt32LE(48));
  const entries = [];
  for (let i = 0; i + 128 <= dir.length; i += 128) {
    const len = dir.readUInt16LE(i + 64);
    const type = dir[i + 66];
    if (!type) continue;
    entries.push({ name: dir.slice(i, i + Math.max(0, len - 2)).toString('utf16le'), type, start: dir.readUInt32LE(i + 116), size: dir.readUInt32LE(i + 120) });
  }
  const root = entries.find((e) => e.type === 5);
  const cutoff = buf.readUInt32LE(56);
  let mini = null; let miniFat = null;
  const small = (e) => {
    if (!mini) {
      mini = root ? readChain(root.start).slice(0, root.size) : Buffer.alloc(0);
      const mf = readChain(buf.readUInt32LE(60));
      miniFat = []; for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mf.readUInt32LE(i));
    }
    const parts = []; let n = e.start; let guard = 0;
    while (n < 0xfffffff0 && guard++ < 1000000 && n * miniSector < mini.length) { parts.push(mini.slice(n * miniSector, (n + 1) * miniSector)); n = miniFat[n]; if (n === undefined) break; }
    return Buffer.concat(parts).slice(0, e.size);
  };
  const out = new Map();
  for (const e of entries) if (e.type === 2) out.set(e.name, e.size < cutoff ? small(e) : readChain(e.start).slice(0, e.size));
  return out;
}

function fromDoc(buf) {
  let streams;
  try { streams = cfbStreams(buf); } catch { streams = null; }
  const wd = streams && streams.get('WordDocument');
  if (!wd || wd.length < 0x1a8 || wd.readUInt16LE(0) !== 0xa5ec) return fail('That file is not a Word document this reader understands. Save it as .docx and upload that.', 'bad_type');
  if (wd.readUInt16LE(11) & 0x01) return fail('That Word document is encrypted. Remove the password and upload it again.', 'encrypted');
  const flags = wd.readUInt16LE(10);
  const table = streams.get(flags & 0x0200 ? '1Table' : '0Table');
  if (!table) return fail('That Word document could not be read. It may be damaged.', 'unreadable');
  const fcClx = wd.readUInt32LE(0x1a2); const lcbClx = wd.readUInt32LE(0x1a6);
  const ccpText = wd.readUInt32LE(76);
  if (!lcbClx || fcClx + lcbClx > table.length) return fail('That Word document could not be read. It may be damaged.', 'unreadable');
  const clx = table.slice(fcClx, fcClx + lcbClx);
  let p = 0;
  while (p < clx.length && clx[p] === 0x01) p += 3 + clx.readUInt16LE(p + 1);
  if (clx[p] !== 0x02) return fail('That Word document could not be read. It may be damaged.', 'unreadable');
  const lcb = clx.readUInt32LE(p + 1);
  const plc = clx.slice(p + 5, p + 5 + lcb);
  const n = Math.floor((lcb - 4) / 12);
  let text = '';
  for (let i = 0; i < n && text.length < ccpText; i++) {
    const cpA = plc.readUInt32LE(i * 4); const cpB = plc.readUInt32LE((i + 1) * 4);
    let fc = plc.readUInt32LE((n + 1) * 4 + i * 8 + 2);
    const compressed = !!(fc & 0x40000000);
    fc &= 0x3fffffff;
    const count = Math.min(cpB - cpA, ccpText - text.length);
    if (compressed) text += wd.slice(fc >> 1, (fc >> 1) + count).toString('latin1').replace(/[\u0091\u0092]/g, "'").replace(/[\u0093\u0094]/g, '"').replace(/\u0096/g, '-').replace(/\u0097/g, '-').replace(/\u0085/g, '...');
    else text += wd.slice(fc, fc + count * 2).toString('utf16le');
  }
  const clean = normalise(text
    .replace(/\u0013[^\u0014\u0015]*\u0014/g, '').replace(/[\u0013\u0014\u0015\u0001\u0008]/g, '')
    .replace(/\u0007/g, '\t').replace(/[\u000b\u000c]/g, '\n').replace(/\r/g, '\n').replace(/\t\n/g, '\n'));
  return { text: clean, rich: clean, pages: null };
}

// ── PDF structure and scans ──────────────────────────────────────────────────────────────────────
const BOLD_FONT = /bold|black|heavy|semibold|demi|[-,]bd\b|-b$/i;

/**
 * Rich text for a pdfjs document: lines from the text layer, headings by type size against the body size, bold by font name.
 * Pages are marked [[pN]]. Returns { rich, text } or null when the document has no text layer.
 */
async function pdfRich(pdf, maxPages) {
  const pages = [];
  const sizes = new Map();
  const upto = Math.min(pdf.numPages, maxPages || pdf.numPages);
  for (let n = 1; n <= upto; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    try { await page.getOperatorList(); } catch { /* fonts stay unnamed: bold is not detected */ }
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.transform) continue;
      const size = Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10 || it.height || 0;
      let name = '';
      try { const f = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null; name = (f && (f.name || f.loadedName)) || ''; } catch { /* unnamed */ }
      const y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < size * 0.4);
      if (!row) { row = { y, runs: [] }; rows.push(row); }
      row.runs.push({ x: it.transform[4], str: it.str, size, bold: BOLD_FONT.test(name), eol: it.hasEOL });
      if (it.str.trim()) sizes.set(size, (sizes.get(size) || 0) + it.str.length);
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push({ n, rows });
    if (typeof page.cleanup === 'function') page.cleanup();
  }
  if (!sizes.size) return null;
  let body = 0; let best = 0;
  for (const [s, c] of sizes) if (c > best) { best = c; body = s; }
  const out = [];
  for (const pg of pages) {
    out.push(`[[p${pg.n}]]`);
    let paraLines = []; let lastY = null; let lastSize = body;
    const flush = () => { if (paraLines.length) out.push(paraLines.join(' ')); paraLines = []; };
    for (const row of pg.rows) {
      row.runs.sort((a, b) => a.x - b.x);
      const str = row.runs.map((r) => r.str).join('').replace(/\s+/g, ' ').trim();
      if (!str) continue;
      const size = Math.max(...row.runs.filter((r) => r.str.trim()).map((r) => r.size));
      const allBold = row.runs.filter((r) => r.str.trim()).every((r) => r.bold);
      const ratio = body ? size / body : 1;
      if (ratio >= 1.25 || (allBold && str.length < 80 && !/[.!?:]$/.test(str) && ratio >= 1.0 && row.runs.length)) {
        flush();
        out.push(`${'#'.repeat(ratio >= 1.8 ? 1 : ratio >= 1.45 ? 2 : ratio >= 1.25 ? 3 : 4)} ${str}`);
        lastY = row.y; lastSize = size;
        continue;
      }
      let line = '';
      let open = false;
      for (const r of row.runs) {
        const t = r.str;
        if (!t.trim()) { line += t; continue; }
        if (r.bold && !allBold) { if (!open) { line += `${/^\s/.test(t) ? t.match(/^\s*/)[0] : ''}**`; open = true; } line += t.trim() ? t.replace(/^\s+/, '') : t; } else { if (open) { line = `${line.replace(/\s+$/, '')}** `; open = false; } line += t; }
      }
      if (open) line = `${line.replace(/\s+$/, '')}**`;
      line = line.replace(/\s+/g, ' ').trim();
      if (allBold) line = `**${line}**`;
      const gap = lastY == null ? 0 : lastY - row.y;
      if (lastY != null && gap > Math.max(size, lastSize) * 1.9) flush();
      if (/^(?:[-•*–]|\d+[.)])\s/.test(line)) { flush(); out.push(line.replace(/^[•*–]\s/, '- ')); lastY = row.y; lastSize = size; continue; }
      paraLines.push(line);
      lastY = row.y; lastSize = size;
    }
    flush();
  }
  const rich = normalise(out.join('\n').replace(/\*\*\s*\*\*/g, ' ').replace(/(\*\*)\s+(\*\*)/g, ' '));
  return { rich, text: plainOf(rich) };
}

/**
 * The page pictures of a PDF with no text layer, as PNG buffers (a scan is usually one picture per page). Capped so a large
 * scan cannot flood memory: at most `maxPages` pages, each page's largest picture, scaled to at most 2200 px wide.
 */
async function pdfImages(pdf, maxPages = 40) {
  const sharp = require('sharp');
  const { extractImages } = await import('unpdf');
  const out = [];
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
    let imgs = [];
    try { imgs = await extractImages(pdf, n); } catch { imgs = []; }
    if (!imgs.length) continue;
    imgs.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const im = imgs[0];
    if (im.width * im.height < 90000) continue;
    try {
      const png = await sharp(Buffer.from(im.data.buffer, im.data.byteOffset, im.data.byteLength), { raw: { width: im.width, height: im.height, channels: im.channels } })
        .resize({ width: 2200, withoutEnlargement: true }).withMetadata({ density: 300 }).png().toBuffer();
      out.push({ page: n, png });
    } catch { /* an unreadable picture is skipped */ }
  }
  return out;
}

// ── Pictures ──────────────────────────────────────────────────────────────────────────────────────
/** What a picture's first bytes say: 'png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'heic', 'avif' or null. */
function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (/^GIF8[79]a/.test(buf.slice(0, 6).toString('latin1'))) return 'gif';
  if (buf[0] === 0x42 && buf[1] === 0x4d && buf.readUInt32LE(10) < buf.length) return 'bmp';
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0) || (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0 && buf[3] === 0x2a)) return 'tiff';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('latin1');
    if (/^(?:heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'heic';
    if (/^avi[fs]$/.test(brand)) return 'avif';
  }
  return null;
}

/**
 * A picture ready for OCR: rotated by its EXIF tag, flattened onto white, greyscale, contrast-normalised, and brought to a
 * working size (small photos are enlarged, huge ones reduced). Returns { png } or { error, code }.
 */
async function toPng(buf, kind) {
  let sharp;
  try { sharp = require('sharp'); } catch { return fail('This server cannot convert pictures yet. Upload a PNG or JPG.', 'no_ocr'); }
  try {
    // libvips has no BMP reader: uncompressed 24 and 32 bit BMPs are decoded here and handed over as raw pixels.
    let src = buf; let opts = { limitInputPixels: 80e6, animated: false };
    if (kind === 'bmp') { const bmp = decodeBmp(buf); if (!bmp) return fail('That BMP picture could not be read. Save it as PNG or JPG and upload that.', 'unreadable'); src = bmp.data; opts = { raw: { width: bmp.width, height: bmp.height, channels: bmp.channels } }; }
    const meta = await sharp(src, opts).metadata();
    const w = meta.width || 0;
    let img = sharp(src, opts).rotate().flatten({ background: '#ffffff' }).greyscale().normalise();
    if (w && w < 1200) img = img.resize({ width: Math.min(2400, w * 2), kernel: 'lanczos3' });
    else if (w > 3200) img = img.resize({ width: 3200 });
    return { png: await img.sharpen().withMetadata({ density: 300 }).png().toBuffer() };
  } catch {
    if (kind === 'heic') return fail('This server cannot open HEIC pictures. On an iPhone, share the photo as JPG (Settings, Camera, Formats, Most Compatible), or export it as JPG, and upload that.', 'bad_type');
    return fail('That picture could not be read. It may be damaged.', 'unreadable');
  }
}

/** Uncompressed 24 or 32 bit BMP to raw RGB(A) pixels, or null. */
function decodeBmp(buf) {
  try {
    const off = buf.readUInt32LE(10); const hdr = buf.readUInt32LE(14);
    if (hdr < 40) return null;
    const w = buf.readInt32LE(18); let h = buf.readInt32LE(22); const bpp = buf.readUInt16LE(28); const comp = buf.readUInt32LE(30);
    if ((bpp !== 24 && bpp !== 32) || (comp !== 0 && comp !== 3) || w <= 0 || w * Math.abs(h) > 80e6) return null;
    const top = h < 0; h = Math.abs(h);
    const ch = bpp / 8; const row = Math.ceil((w * ch) / 4) * 4;
    if (off + row * h > buf.length) return null;
    const out = Buffer.alloc(w * h * ch);
    for (let y = 0; y < h; y++) {
      const sy = top ? y : h - 1 - y;
      for (let x = 0; x < w; x++) {
        const s = off + sy * row + x * ch; const d = (y * w + x) * ch;
        out[d] = buf[s + 2]; out[d + 1] = buf[s + 1]; out[d + 2] = buf[s]; if (ch === 4) out[d + 3] = buf[s + 3];
      }
    }
    return { data: out, width: w, height: h, channels: ch };
  } catch { return null; }
}

// ── ZIP of mixed files ────────────────────────────────────────────────────────────────────────────
const SKIP_NAME = /(^|\/)(?:__MACOSX|\.DS_Store|Thumbs\.db|\.git)(\/|$)|(^|\/)\.[^/]+$/i;
const MAX_ZIP_FILES = 40;

/** Read each file of a mixed ZIP with `readOne(buf, name)`. Returns { text, rich, files: [{name, kind, ok, reason}] }. */
async function fromZipFiles(buf, readOne) {
  const listing = P.zipEntries(buf);
  if (!listing || listing.tooMany) return fail('That ZIP could not be opened, or holds too many files.', 'bad_type');
  if (listing.entries.reduce((s, e) => s + e.size, 0) > 200 * 1024 * 1024) return fail('That ZIP unpacks to far more than the size limit.', 'too_big');
  let zip;
  try { zip = await require('jszip').loadAsync(buf); } catch { return fail('That ZIP could not be read. It may be damaged.', 'unreadable'); }
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !SKIP_NAME.test(n) && !/\.\./.test(n)).sort();
  const files = []; const text = []; const rich = [];
  for (const name of names.slice(0, MAX_ZIP_FILES)) {
    let data;
    try { data = await zip.file(name).async('nodebuffer'); } catch { files.push({ name, ok: false, reason: 'damaged' }); continue; }
    if (data.length > 20 * 1024 * 1024) { files.push({ name, ok: false, reason: 'over 20 MB' }); continue; }
    // eslint-disable-next-line no-await-in-loop
    const got = await readOne(data, name);
    if (got.error) { files.push({ name, ok: false, reason: got.error.slice(0, 120), code: got.code }); continue; }
    files.push({ name, ok: true, kind: got.kind });
    text.push(`${name}\n\n${got.text}`);
    rich.push(`[[f ${name}]]\n# ${name}\n\n${got.rich || got.text}`);
  }
  for (const name of names.slice(MAX_ZIP_FILES)) files.push({ name, ok: false, reason: `only the first ${MAX_ZIP_FILES} files are read` });
  if (!text.length) return fail(`None of the ${names.length} file${names.length === 1 ? '' : 's'} in that ZIP could be read${files.length ? ` (${files.slice(0, 3).map((f) => `${f.name}: ${f.reason}`).join('; ')})` : ''}.`, 'bad_type');
  return { text: normalise(text.join('\n\n\n')), rich: normalise(rich.join('\n\n')), pages: null, files };
}

// ── Google links ──────────────────────────────────────────────────────────────────────────────────
/** A public Google Docs, Slides or Sheets link to the file it exports: { url, kind, id } or null. Only docs.google.com is accepted. */
function googleExport(link) {
  let u;
  try { u = new URL(String(link).trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com' || u.username || u.password) return null;
  const m = u.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/(?:e\/)?([A-Za-z0-9_-]{10,})/);
  if (!m) return null;
  const [, type, id] = m;
  if (type === 'document') return { kind: 'docx', id, url: `https://docs.google.com/document/d/${id}/export?format=docx` };
  if (type === 'presentation') return { kind: 'pptx', id, url: `https://docs.google.com/presentation/d/${id}/export/pptx` };
  return { kind: 'xlsx', id, url: `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx` };
}

module.exports = { plainOf, htmlRich, mergeTimed, slideBold, fromIpynb, isSubtitles, fromSubtitles, fromOdp, fromOds, isLatex, fromLatex, isCfb, fromDoc, cfbStreams, pdfRich, pdfImages, sniffImage, toPng, fromZipFiles, googleExport, unxml };
