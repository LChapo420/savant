/**
 * Every format, end to end over the real upload route, with real files made on the fly (scripts/lib/real-files.js). Each case states what a learner should get: the planted sentences read,
 * or a clear message. Prints BAD rows and a summary; everything is in the rows file. Audio and video go through Gladia when GLADIA_DRIVE=1 (short clips; the $50 ledger; a cleared adult only).
 *
 *   NODE_PATH=<dir with playwright and tesseract.js> node scripts/uploads-every-format.js [--only=substring] [--no-slow] [--gladia]
 * MEASURED, synthetic content; not a real learner.
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
process.env.NODE_ENV = 'test';
process.env.UPLOAD_AUTOBUILD = 'off';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-everyformat-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
process.env.GLADIA_LEDGER_FILE = process.env.GLADIA_LEDGER_FILE || `${LIVE}gladia-ledger.json`;
process.env.WHISPER_MODEL_DIR = process.env.WHISPER_MODEL_DIR || `${LIVE}models`;
process.env.RUN_CAP_USD = process.env.RUN_CAP_USD || '1';
const express = require('express');
const db = require('../config/db');
const R = require('./lib/real-files');

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const noSlow = process.argv.includes('--no-slow');
const useGladia = process.argv.includes('--gladia');
const OUT = path.join(__dirname, '..', 'docs', 'uploads-every-format-results.json');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'every-format-'));

const alnum = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
const wordsIn = (s) => String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
/** Share of planted sentences found whole, and share by word overlap (for OCR and speech, where a letter or two is wrong). */
function recall(text, planted = R.PLANTED) {
  const a = alnum(text);
  const whole = planted.filter((s) => a.includes(alnum(s))).length;
  const set = new Set(wordsIn(text));
  const near = planted.filter((s) => { const w = wordsIn(s); return w.filter((x) => set.has(x)).length / w.length >= 0.75; }).length;
  return { whole: whole / planted.length, near: near / planted.length };
}
const GENERIC = /something went wrong|internal|undefined|cannot read prop|offset|stack|econn|null\b/i;

(async () => {
  const router = require('../routes/materials');
  const audio = require('../services/material-audio');
  const app = express(); app.set('trust proxy', true);
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/materials', router);
  app.use((err, req, res, next) => { if (res.headersSent) return undefined; if (err && (err.type === 'entity.too.large' || err.status === 413)) return res.status(413).json({ error: `That file is too big. Files can be up to ${require('../services/materials').MAX_BYTES / 1048576} MB.`, code: 'too_big' }); return res.status(500).json({ error: 'Something went wrong', code: 'server' }); });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;
  const newUser = (extra = {}) => db.insert('users', { email: `f${Date.now()}${Math.random()}@example.test`, display_name: 'F', password_hash: 'x', xp: 0, streak: 0, onboarded: true, ...extra });
  let u = newUser(); let used = 0;
  const call = (method, url, body, user) => new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', agent: false, port, path: url, method, headers: { 'content-type': 'application/octet-stream', 'x-user': String(user), 'x-forwarded-for': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(body ? { 'content-length': body.length } : {}) } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json }); });
    });
    req.on('error', fail); if (body) req.write(body); req.end();
  });

  const rows = [];
  async function run(group, label, buf, name, exp) {
    if (only && !`${group} ${label}`.includes(only)) return;
    if (noSlow && exp.slow) return;
    if (used >= 10) { u = newUser(); used = 0; }
    used++;
    const t = Date.now();
    let r; let out = { group, label, name, bytes: buf.length };
    try { r = await call('POST', `/api/materials?name=${encodeURIComponent(name)}`, buf, u.id); } catch (e) { r = { status: 0, json: { error: `THREW ${e.message}` } }; }
    out.status = r.status; out.first_ms = Date.now() - t;
    const j = r.json || {};
    let mat = j.material || null; let jobState = null;
    if (r.status === 202 && j.job) {
      out.job = j.job.kind || 'job';
      const deadline = Date.now() + (exp.timeout || 240000);
      let progressSeen = 0;
      while (Date.now() < deadline) {
        await new Promise((ok) => setTimeout(ok, 1000));
        const s = await call('GET', '/api/materials/audio', null, u.id);
        const row = (s.json.jobs || []).find((x) => x.id === j.job.id);
        if (!row) continue;
        if (row.progress != null || row.done) progressSeen++;
        jobState = row;
        if (['done', 'failed', 'error'].includes(row.status)) break;
      }
      out.job_status = jobState && jobState.status; out.engine = jobState && jobState.engine; out.job_error = jobState && jobState.error; out.progress_polls = progressSeen; out.total_ms = Date.now() - t;
      if (jobState && jobState.material_id) { const m = await call('GET', `/api/materials/${jobState.material_id}`, null, u.id); mat = m.json.material || m.json; }
      else if (jobState && jobState.status === 'done') { const l = await call('GET', '/api/materials', null, u.id); const last = (l.json.materials || []).slice(-1)[0]; if (last) { const m = await call('GET', `/api/materials/${last.id}`, null, u.id); mat = m.json.material || m.json; } }
    } else if (mat) {
      const m = await call('GET', `/api/materials/${mat.id}`, null, u.id); mat = m.json.material || m.json;
    }
    out.message = j.error || (jobState && jobState.error) || null; out.code = j.code || null;
    if (mat && mat.text) {
      const rc = recall(mat.text, exp.planted || R.PLANTED);
      out.kind = mat.kind; out.words = mat.words; out.key_points = mat.key_point_count ?? (mat.key_points || []).length; out.warnings = mat.warnings || []; out.recall = rc;
      out.top_kp = (mat.key_points || []).slice().sort((a, b) => b.weight - a.weight).slice(0, 2).map((k) => `${k.weight}: ${k.text.slice(0, 70)}`);
      out.sample = mat.text.slice(0, 120);
      if (exp.check) out.extra = exp.check(mat.text, mat);
      const del = await call('DELETE', `/api/materials/${mat.id}`, null, u.id); out.deleted = del.status === 200;
    }
    // verdict
    const bad = [];
    if (exp.read) {
      if (!mat || !mat.text) bad.push(`expected to read it, got ${r.status} ${out.message || out.job_status}`);
      else {
        if (exp.min != null && out.recall.whole < exp.min && out.recall.near < exp.min) bad.push(`recall ${out.recall.whole.toFixed(2)}/${out.recall.near.toFixed(2)} < ${exp.min}`);
        if (exp.warn && !(out.warnings || []).some((w) => exp.warn.test(w))) bad.push(`no warning like ${exp.warn}: ${JSON.stringify(out.warnings)}`);
        if (exp.kind && out.kind !== exp.kind) bad.push(`kind ${out.kind}, wanted ${exp.kind}`);
        if (out.extra && out.extra !== true) bad.push(String(out.extra));
      }
    } else if (exp.refuse) {
      if (mat && mat.text) bad.push(`read it as ${mat.kind} (${mat.words} words) instead of refusing: ${String(mat.text).slice(0, 60)}`);
      const msg = out.message || '';
      if (!msg) bad.push(`no message (status ${r.status}, job ${out.job_status})`);
      else if (GENERIC.test(msg)) bad.push(`unclear message: ${msg.slice(0, 100)}`);
      else if (exp.refuse !== true && !exp.refuse.test(msg)) bad.push(`message not about what to do: ${msg.slice(0, 160)}`);
      if (r.status >= 500) bad.push(`HTTP ${r.status}`);
    }
    if (exp.engine && out.engine !== exp.engine) bad.push(`engine ${out.engine}, wanted ${exp.engine}`);
    out.ok = !bad.length; out.bad = bad;
    rows.push(out);
    console.log(`${out.ok ? 'ok ' : 'BAD'} [${group}] ${label.padEnd(32)} ${String(out.status).padEnd(3)} ${String(out.total_ms || out.first_ms).padStart(6)}ms ${out.recall ? `recall ${out.recall.whole.toFixed(2)}/${out.recall.near.toFixed(2)} ${out.kind}` : (out.message || '').slice(0, 90)}${bad.length ? ` <<< ${bad.join('; ').slice(0, 170)}` : ''}${(out.warnings || []).length ? ` WARN ${out.warnings[0].slice(0, 70)}` : ''}`);
    fs.writeFileSync(OUT, JSON.stringify(rows.map(({ sample, ...x }) => x), null, 0));
  }

  const CH = process.env.NO_CHROME ? {} : await R.chromeFiles(dir);
  const tableOk = (text) => (R.TABLE_FACTS.every((re) => re.test(text.replace(/\s+/g, ' '))) ? true : 'table rows split apart');
  const txt = (s) => Buffer.from(s, 'utf8');
  const full = R.PLANTED.join(' ');
  const article = `Lake Vostrin: a field guide\n\n${R.PLANTED.slice(0, 4).join(' ')}\n\n${R.PLANTED.slice(4).join(' ')}`;
  const zip = async (files) => { const J = new (require('jszip'))(); for (const [n, b] of Object.entries(files)) J.file(n, b); return J.generateAsync({ type: 'nodebuffer' }); };
  const docx = await R.docx(); const pptx = await R.pptx(); const xlsx = await R.xlsx(); const epub = await R.epub();

  // ── PDF
  if (CH.textPdf) {
    await run('pdf', 'text from Chrome', CH.textPdf, 'text.pdf', { read: 1, min: 1, kind: 'pdf' });
    await run('pdf', 'with a table', CH.tablePdf, 'table.pdf', { read: 1, min: 1, check: tableOk });
    await run('pdf', 'two columns', CH.twoColPdf, 'two.pdf', { read: 1, min: 1 });
    await run('pdf', 'scanned, 3 pages', CH.scannedPdf, 'scan.pdf', { read: 1, min: 0.75, slow: 1 });
    await run('pdf', 'scanned, 45 pages (over 40)', CH.scanned45, 'scan45.pdf', { read: 1, min: 0.2, warn: /first 40/, slow: 1, timeout: 500000 });
    await run('pdf', 'text plus a picture-only page', CH.imageOnlyPagePdf, 'mix.pdf', { read: 1, min: 1, warn: /no readable text/ });
    await run('pdf', 'password protected', CH.encPdf, 'locked.pdf', { refuse: /password/i });
    await run('pdf', '120 pages', CH.pdf120, 'long.pdf', { read: 1, min: 1 });
    await run('pdf', '330 pages (over the limit)', CH.pdf330, 'book.pdf', { refuse: /300|pages|part/i });
    await run('pdf', 'cut off halfway', CH.textPdf.slice(0, Math.floor(CH.textPdf.length / 2)), 'cut.pdf', { refuse: /damaged|cut off|download|export/i });
    const flip = Buffer.from(CH.textPdf); for (let i = 600; i < flip.length; i += 97) flip[i] ^= 0xff;
    await run('pdf', 'bytes flipped', flip, 'flip.pdf', { refuse: /damaged|cut off|download|export|hardly|paste/i });
    await run('pdf', 'header only', Buffer.from('%PDF-1.7\n'), 'head.pdf', { refuse: /damaged|cut off|download|export/i });
  }
  // ── Word
  const delCheck = (t) => { if (/DELETEDWORDS/.test(t)) return 'deleted tracked text kept'; if (/TEACHERCOMMENT/.test(t) && false) return 'x'; return tableOk(t); };
  await run('word', 'docx with changes, notes, table', docx, 'a.docx', { read: 1, min: 1, kind: 'docx', check: delCheck });
  await run('word', 'docm named', docx, 'a.docm', { read: 1, min: 1 });
  await run('word', 'docx cut off', docx.slice(0, Math.floor(docx.length * 0.6)), 'cut.docx', { refuse: /damaged|cut off/i });
  await run('word', 'zip with no document.xml', await zip({ 'word/other.xml': '<a/>', '[Content_Types].xml': '<a/>' }), 'hollow.docx', { refuse: /read|damaged|open|paste/i });
  await run('word', 'password protected docx', R.cfb({ EncryptionInfo: Buffer.alloc(4096, 1), EncryptedPackage: Buffer.alloc(8192, 2) }), 'locked.docx', { refuse: /password/i });
  await run('word', 'password protected xlsx', R.cfb({ EncryptionInfo: Buffer.alloc(4096, 1), EncryptedPackage: Buffer.alloc(8192, 2) }), 'locked.xlsx', { refuse: /password/i });
  await run('word', 'old .xls', R.cfb({ Workbook: Buffer.alloc(8192, 3) }), 'old.xls', { refuse: /xls|excel|save/i });
  await run('word', 'old .ppt', R.cfb({ 'PowerPoint Document': Buffer.alloc(8192, 3) }), 'old.ppt', { refuse: /ppt|powerpoint|save/i });
  await run('word', 'random CFB', R.cfb({ Stuff: Buffer.alloc(8192, 3) }), 'odd.doc', { refuse: /read|damaged|save|open/i });
  // ── slides
  await run('slides', 'pptx with table, group, notes', pptx, 'a.pptx', { read: 1, min: 1, kind: 'pptx', check: (t) => (/SPEAKERNOTE/.test(t) ? tableOk(t) : 'speaker notes lost') });
  await run('slides', 'pptx cut off', pptx.slice(0, Math.floor(pptx.length * 0.5)), 'cut.pptx', { refuse: /damaged|cut off/i });
  // ── sheets
  await run('sheets', 'xlsx, two sheets, formulas', xlsx, 'a.xlsx', { read: 1, min: 1, kind: 'xlsx', check: tableOk });
  await run('sheets', 'csv quoted', txt(`Station,Depth (m),Oxygen (mg/L)\n"Harbor Point",18,9.4\n"Mid Basin",212,3.1\n"Tarmo Mouth",6,11.2\n"${R.PLANTED[0].replace(/"/g, '""')}",,\n"${R.PLANTED.slice(1).join(' ')}",,\n`), 'a.csv', { read: 1, min: 1, check: tableOk });
  await run('sheets', 'tsv', txt(`Station\tDepth\tOxygen\nHarbor Point\t18\t9.4\nMid Basin\t212\t3.1\nTarmo Mouth\t6\t11.2\n${full}\t\t\n`), 'a.tsv', { read: 1, min: 1, check: tableOk });
  // ── text and rich text
  await run('text', 'plain UTF-8', txt(article), 'a.txt', { read: 1, min: 1 });
  await run('text', 'UTF-16 with mark', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(article, 'utf16le')]), 'a.txt', { read: 1, min: 1 });
  await run('text', 'Windows-1252', Buffer.from(`${article}\n\nCaf\xe9 r\xe9sum\xe9 na\xefve notes for the field trip, as written in an older editor.`, 'latin1'), 'a.txt', { read: 1, min: 1, warn: /Windows-1252/ });
  await run('text', 'Markdown', txt(`# Lake Vostrin\n\n## Formation\n\n${R.PLANTED.slice(0, 4).join(' ')}\n\n> **Key point:** ${R.PLANTED[7]}\n\n${R.PLANTED.slice(4, 7).join(' ')}\n`), 'a.md', { read: 1, min: 1 });
  await run('text', 'rich text with a table', txt(R.rtf()), 'a.rtf', { read: 1, min: 1, kind: 'rtf', check: (t) => (/Harbor Point\W+18/.test(t) ? (/résumé/.test(t) ? true : 'accents lost') : 'table lost') });
  await run('text', 'HTML page with nav and script', txt(`<!doctype html><html><head><title>x</title><style>.a{color:red}</style><script>var SCRIPTWORDS=1;</script></head><body><nav>Home About Contact</nav>${R.articleHtml(R.tableHtml())}<footer>Copyright</footer><div style="display:none">HIDDENWORDS</div></body></html>`), 'a.html', { read: 1, min: 1, kind: 'html', check: (t) => (/SCRIPTWORDS|\.a\{color/.test(t) ? 'script or css in text' : tableOk(t)) });
  await run('text', 'EPUB, spine order differs from names', epub, 'a.epub', { read: 1, min: 1, kind: 'epub', check: (t) => (t.indexOf('Lake Vostrin was formed') < t.indexOf('Dr. Ilse') ? true : 'chapters out of spine order') });
  // ── pictures and handwriting
  if (CH.png) {
    for (const [k, n, min] of [['png', 'a.png', 0.9], ['jpg', 'a.jpg', 0.9], ['webp', 'a.webp', 0.9], ['tiff', 'a.tiff', 0.9], ['gif', 'a.gif', 0.75], ['phonePhoto', 'photo.jpg', 0.6], ['jpgExifRotated', 'exif.jpg', 0.9]]) await run('picture', k, CH[k], n, { read: 1, min, kind: 'image', slow: 1 });
    await run('picture', 'rotated 90 degrees, no EXIF', CH.pngRotated90, 'side.png', { read: 1, min: 0.6, slow: 1 });
    await run('picture', 'handwriting font, Ink Free', CH.handInk, 'hand1.png', { read: 1, min: 0.5, planted: R.PLANTED.slice(0, 6), slow: 1 });
    await run('picture', 'handwriting font, Segoe Script', CH.handScript, 'hand2.png', { read: 1, min: 0.5, planted: R.PLANTED.slice(0, 6), slow: 1 });
    await run('picture', 'handwriting font, Bradley', CH.handBrad, 'hand3.png', { read: 1, min: 0.5, planted: R.PLANTED.slice(0, 6), slow: 1 });
    await run('picture', 'blackboard, light on dark', CH.blackboard, 'board.png', { read: 1, min: 0.5, planted: R.PLANTED.slice(0, 5), slow: 1 });
    await run('picture', 'blank page', CH.emptyPicture, 'blank.png', { refuse: /little text|clearer|paste/i, slow: 1 });
    await run('picture', 'photo with no text', CH.photoNoText, 'dog.jpg', { refuse: /little text|clearer|paste/i, slow: 1 });
    await run('picture', '9000x9000 pixels', CH.hugePicture, 'huge.png', { read: 1, min: 0.5, slow: 1, timeout: 300000 });
    await run('picture', 'Spanish page (OCR is English)', CH.spanishPhoto, 'es.png', { read: 1, warn: /English/, slow: 1 });
    await run('picture', 'HEIC', Buffer.concat([Buffer.from('000000186674797068656963', 'hex'), Buffer.alloc(4000, 7)]), 'x.heic', { refuse: /JPG|JPEG|share/i });
    await run('picture', 'cut-off PNG', CH.png.slice(0, 2000), 'cut.png', { refuse: /damaged|clearer|read|cut off/i });
  }
  // ── mixed language
  if (CH.mixedPdf) {
    await run('language', 'English + Spanish + Chinese PDF', CH.mixedPdf, 'mix.pdf', { read: 1, min: 1 });
    await run('language', 'Spanish PDF', CH.spanishPdf, 'es.pdf', { read: 1 });
    await run('language', 'Chinese PDF', CH.chinesePdf, 'zh.pdf', { read: 1 });
  }
  await run('language', 'Chinese text', txt(R.CHINESE), 'zh.txt', { read: 1 });
  await run('language', 'Arabic text', txt(R.ARABIC), 'ar.txt', { read: 1 });
  await run('language', 'English + Arabic docx', await R.docx({ body: `${R.wp(R.PLANTED.slice(0, 4).join(' '))}${R.wp(R.ARABIC)}${R.wp(R.PLANTED.slice(4).join(' '))}` }), 'mix.docx', { read: 1, min: 1 });
  // ── empty, wrong, broken
  await run('empty', '0 bytes', Buffer.alloc(0), 'a.pdf', { refuse: /choose|empty/i });
  await run('empty', 'one byte', Buffer.from('a'), 'a.txt', { refuse: /little|tell what|empty/i });
  await run('empty', 'whitespace', Buffer.from(' \n\t \n'.repeat(50)), 'a.txt', { refuse: /little/i });
  await run('empty', 'too short', txt('Lake Vostrin is deep.'), 'a.txt', { refuse: /little/i });
  await run('empty', 'empty docx', await R.docx({ body: '' }), 'a.docx', { refuse: /little/i });
  await run('empty', 'empty xlsx-shaped zip', await zip({ 'xl/workbook.xml': '<workbook/>' }), 'a.xlsx', { refuse: /little|read|damaged/i });
  await run('empty', 'empty zip', await zip({}), 'a.zip', { refuse: /nothing|empty|no file|little|damaged|could not/i });
  if (CH.textPdf) await run('wrong', 'PDF named .txt', CH.textPdf, 'a.txt', { read: 1, min: 1, kind: 'pdf' });
  await run('wrong', 'DOCX named .pdf', docx, 'a.pdf', { read: 1, min: 1, kind: 'docx' });
  await run('wrong', 'text named .png', txt(article), 'a.png', { read: 1, min: 1, kind: 'text' });
  await run('wrong', 'HTML named .doc', txt(`<!doctype html><html><body>${R.articleHtml()}</body></html>`), 'a.doc', { read: 1, min: 1, kind: 'html' });
  await run('wrong', 'program named .pdf', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(9000, 0x90)]), 'a.pdf', { refuse: /tell what|kind of file/i });
  await run('wrong', 'RAR', Buffer.concat([Buffer.from('Rar!\x1a\x07\x00', 'latin1'), Buffer.alloc(3000, 9)]), 'a.rar', { refuse: /ZIP|unpack|tell what/i });
  await run('wrong', '7z', Buffer.concat([Buffer.from('377abcaf271c', 'hex'), Buffer.alloc(3000, 9)]), 'a.7z', { refuse: /ZIP|unpack|tell what/i });
  await run('wrong', 'random bytes', require('crypto').randomBytes(30000), 'a.dat', { refuse: /tell what|kind of file/i });
  await run('wrong', 'Apple Pages zip', await zip({ 'Index/Document.iwa': Buffer.alloc(800, 4), 'Metadata/Properties.plist': '<x/>' }), 'a.pages', { refuse: /pages|pdf|export|could not|nothing/i });
  await run('wrong', 'protected ZIP', R.markZipEncrypted(await zip({ 'notes.txt': article })), 'a.zip', { refuse: /password/i });
  await run('wrong', 'ZIP of mixed files', await zip({ 'a.txt': article, 'b.docx': docx, 'c.exe': Buffer.concat([Buffer.from('MZ'), Buffer.alloc(900)]), 'sub/deep.pdf': CH.textPdf || txt(article) }), 'all.zip', { read: 1, min: 1, kind: 'zip', warn: /not used/ });
  // ── large
  const big = (n) => txt(Array.from({ length: Math.ceil(n / full.length) }, () => full).join('\n\n').slice(0, n));
  await run('large', '850 KB text', big(850000), 'big.txt', { read: 1, min: 1 });
  await run('large', '950 KB text (over 300 pages)', big(950000), 'big.txt', { refuse: /about \d+ pages|part/i });
  await run('large', '19 MB of text', big(19000000), 'big.txt', { refuse: /about \d+ pages|part|limit/i });
  await run('large', '21 MB', big(21 * 1048576), 'big.txt', { refuse: /big|20 MB/i });

  // ── audio and video
  const script = 'Welcome back. Lake Vostrin was formed about fourteen thousand years ago when a glacier dammed the Orlen valley. Its only outflow is the Tarmo River, which drains north into the Sellen Sea. I will say that again, because this will be on the exam: the lake turns over twice a year, in April and in November.';
  const spoken = ['Lake Vostrin was formed about fourteen thousand years ago when a glacier dammed the Orlen valley', 'Its only outflow is the Tarmo River', 'the lake turns over twice a year, in April and in November'];
  if (!only || 'audio video'.split(' ').some((x) => only.includes(x))) {
    if (useGladia) {
      const adult = newUser({ age_check: { birth_ym: '1990-01' } });
      require('../services/learner').saveProfile(adult.id, { survey: {}, subscription: 'pro' });
      const allowed = require('../services/ai').munitoAllowedFor(adult.id);
      console.log('adult cleared for Gladia:', allowed);
      u = adult; used = 0;
    }
    const wavP = R.speakWav(script, dir, 'speech');
    const wav = fs.readFileSync(wavP);
    const mp3P = path.join(dir, 'speech.mp3'); R.ffmpeg(['-i', wavP, mp3P]);
    const m4aP = path.join(dir, 'speech.m4a'); R.ffmpeg(['-i', wavP, m4aP]);
    const mp4P = path.join(dir, 'speech.mp4'); R.ffmpeg(['-f', 'lavfi', '-i', 'color=c=navy:s=320x240:r=5', '-i', wavP, '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', mp4P]);
    const silentP = path.join(dir, 'silent.mp4'); R.ffmpeg(['-f', 'lavfi', '-i', 'color=c=navy:s=320x240:r=5', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', silentP]);
    const toneP = path.join(dir, 'tone.mp3'); R.ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', toneP]);
    const eng = useGladia ? 'gladia' : undefined;
    const exp = { read: 1, min: 0.6, planted: spoken, engine: eng, timeout: 200000 };
    await run('audio', 'WAV', wav, 'a.wav', { ...exp });
    await run('audio', 'MP3', fs.readFileSync(mp3P), 'a.mp3', { ...exp });
    await run('audio', 'M4A', fs.readFileSync(m4aP), 'a.m4a', { ...exp });
    await run('audio', 'MP3 named .pdf', fs.readFileSync(mp3P), 'a.pdf', { ...exp });
    await run('video', 'MP4 with speech', fs.readFileSync(mp4P), 'a.mp4', { ...exp });
    await run('video', 'MP4 named .docx', fs.readFileSync(mp4P), 'a.docx', { ...exp });
    await run('video', 'MP4 with no sound track', fs.readFileSync(silentP), 'b.mp4', { refuse: /sound|audio|speech|no /i, timeout: 120000 });
    await run('audio', 'tone, no speech', fs.readFileSync(toneP), 'tone.mp3', { refuse: /speech|spoken|little|sound|hear/i, timeout: 120000 });
    await run('audio', 'WAV cut before the sound', wav.slice(0, 30), 'cut.wav', { refuse: /cut off|damaged|short/i });
    await run('audio', 'junk named .mp3', require('crypto').randomBytes(5000), 'junk.mp3', { refuse: /tell what|kind of file|read/i });
    await run('video', 'cut-off MP4', fs.readFileSync(mp4P).slice(0, 1500), 'cut.mp4', { refuse: /damaged|cut off|read|sound/i, timeout: 120000 });
  }
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - bad.length} of ${rows.length} as intended; ${bad.length} bad. Rows: ${OUT}`);
  server.close();
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* left */ }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
