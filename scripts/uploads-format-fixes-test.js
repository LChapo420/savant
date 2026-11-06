/**
 * What the every-format and recovery walks found, kept as fast tests (no Chrome, no OCR, no model).
 */
const os = require('os'); const path = require('path'); const fs = require('fs');
process.env.NODE_ENV = 'test';
process.env.UPLOAD_AUTOBUILD = 'off';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-fixes-test-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
const db = require('../config/db');
const materials = require('../services/materials');
const audio = require('../services/material-audio');
const video = require('../services/material-video');
const parsers = require('../services/material-parsers');
const K = require('../services/material-keypoints');
const cb = require('../services/course-builder');
const R = require('./lib/real-files');

let failed = 0;
const check = (name, ok, detail) => { if (!ok) { failed++; console.log(`  FAIL ${name}${detail !== undefined ? ` -- ${JSON.stringify(detail).slice(0, 200)}` : ''}`); } };
const text = `${R.PLANTED.join(' ')}\n\n${R.PLANTED.join(' ')}`;

(async () => {
  // ── sniffing
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  check('UTF-16 text is not taken for an MP3', audio.sniffAudio(utf16) === null);
  check('a real MP3 frame still is', audio.sniffAudio(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) === 'mp3');
  check('ID3 still is', audio.sniffAudio(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)])) === 'mp3');
  const heic = Buffer.concat([Buffer.from('000000186674797068656963', 'hex'), Buffer.alloc(40, 7)]);
  check('a HEIC photo is neither audio nor video', !audio.sniffAudio(heic) && !video.sniffVideo(heic));
  check('an M4A is still audio', audio.sniffAudio(Buffer.concat([Buffer.from('00000018667479704d344120', 'hex'), Buffer.alloc(40)])) === 'm4a');

  // ── refusals say what to do
  const ask = async (buf) => (await materials.extract(buf)).error || '';
  check('password-protected Office', /password/i.test(await ask(R.cfb({ EncryptionInfo: Buffer.alloc(4096, 1), EncryptedPackage: Buffer.alloc(8192, 2) }))));
  check('old Excel', /xls/i.test(await ask(R.cfb({ Workbook: Buffer.alloc(8192, 3) }))));
  check('old PowerPoint', /ppt/i.test(await ask(R.cfb({ 'PowerPoint Document': Buffer.alloc(8192, 3) }))));
  const JSZip = require('jszip');
  const zip = async (files) => { const z = new JSZip(); for (const [n, b] of Object.entries(files)) z.file(n, b); return z.generateAsync({ type: 'nodebuffer' }); };
  check('password-protected ZIP', /password/i.test(await ask(R.markZipEncrypted(await zip({ 'a.txt': text })))));
  check('RAR', /RAR/.test(await ask(Buffer.concat([Buffer.from('Rar!\x1a\x07\x00', 'latin1'), Buffer.alloc(300, 9)]))));
  check('7-Zip', /7-Zip/.test(await ask(Buffer.concat([Buffer.from('377abcaf271c', 'hex'), Buffer.alloc(300, 9)]))));
  check('Apple file', /Apple/.test(await ask(await zip({ 'Index/Document.iwa': Buffer.alloc(800, 4) }))));
  check('a hollow Office file', /main part/.test(await ask(await zip({ 'word/other.xml': '<a/>', '[Content_Types].xml': '<a/>' }))));
  parsers.setOcr(async () => { throw new Error('must not be reached'); });
  const cut = await materials.extract(Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(100, 1)])).catch((e) => ({ error: `threw ${e.message}` }));
  check('a damaged PNG never reaches OCR', /could not be read/.test(cut.error || ''), cut);
  parsers.setOcr(null);

  // ── text kept
  const html = await materials.extract(Buffer.from(`<!doctype html><html><body>${R.articleHtml(R.tableHtml())}</body></html>`));
  check('HTML table cells stay apart', R.TABLE_FACTS.every((re) => re.test(html.text.replace(/\s+/g, ' '))), html.text.slice(-200));
  const rtf = await materials.extract(Buffer.from(R.rtf()));
  check('RTF table cells stay apart', /Harbor Point\W+18\W+9\.4/.test(rtf.text.replace(/\s+/g, ' ')));
  check('words of any script are counted', parsers.countWords('沃斯特林湖大约形成于一万四千年前') > 5 && parsers.countWords('تشكلت بحيرة فوسترين قبل') === 4);
  check('UTF-16 upload is read', (await materials.extract(utf16)).kind === 'text');

  // ── what Word marks
  const run = (t, rpr) => `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;
  const body = [
    R.wp('Heading of the notes', 'Heading1'),
    `<w:p>${run('Pellan moss grows only above 300 metres on the islands.', '<w:u w:val="single"/>')}</w:p>`,
    `<w:p>${run('The Quill archive holds 2,600 ship logs from the old days.', '<w:highlight w:val="yellow"/>')}</w:p>`,
    `<w:p><w:commentRangeStart w:id="1"/><w:r><w:t>Basalt from Mount Hesper is the only stone that sinks.</w:t></w:r><w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r></w:p>`,
    R.wp(R.PLANTED.slice(0, 5).join(' ')),
  ].join('');
  const z = await JSZip.loadAsync(await R.docx({ body }));
  z.file('word/comments.xml', '<?xml version="1.0"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="1" w:author="T"><w:p><w:r><w:t>Students always miss this. Know it for the test.</w:t></w:r></w:p></w:comment></w:comments>');
  const dx = await materials.extract(await z.generateAsync({ type: 'nodebuffer' }));
  const kp = K.extract(dx.rich, { plain: dx.text }).key_points;
  const weight = (re) => (kp.find((k) => re.test(k.text)) || { weight: 0 }).weight;
  check('underline in Word counts as a mark', weight(/Pellan/) >= 2, kp.map((k) => k.text.slice(0, 20)));
  check('highlight in Word counts as a mark', weight(/Quill/) >= 2);
  check('a comment that says "test" stresses the words it marks', weight(/Hesper/) >= 3);
  check('and the comment reaches the learner', /Students always miss this/.test(dx.text));

  // ── what the writer stresses in plain words
  const w = (rich, re) => (K.extract(rich, { plain: rich }).key_points.find((k) => re.test(k.text)) || { weight: 0 }).weight;
  check('teacher\'s note stresses the next sentence', w("Teacher's note: students always miss this one. Basalt from Mount Hesper is the only stone that sinks.", /Hesper/) >= 2.5);
  check('and is not a point itself', !K.extract("Teacher's note: students always miss this one. Basalt from Mount Hesper is the only stone that sinks.", {}).key_points.some((k) => /always miss/.test(k.text)));
  check('a heading that is a statement is a point', w('## Tamsin Reef shelters the eastern harbour from winter storms\n\nSome text here that goes on.', /Tamsin/) >= 2);
  check('a heading that is a label is not', w('## Types of plate boundaries in the world\n\nSome text here that goes on.', /Types/) === 0);
  check('a whole sentence in capitals is a mark', w('THE DORRIN BELL MUST BE RUNG BEFORE ANY BOAT LEAVES.', /DORRIN/i) >= 2);
  check('the same name and number said again in other words count as repeated', w('The Lumen ferry carries exactly 44 passengers. It sails daily. The Lumen ferry has a limit of 44 people. Again, 44 on the Lumen ferry only.', /carries exactly|limit/) >= 2);
  const many = Array.from({ length: 20 }, (_, i) => `**The ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Eps', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lam', 'Mu', 'Nu', 'Xi', 'Omi', 'Pi', 'Rho', 'Sig', 'Tau', 'Ups'][i]} station records ice number ${i + 100} each spring.**`).join('\n\n');
  check('a stressed point is never cut by the cap on points', K.extract(many, { plain: many }).key_points.length === 20, K.extract(many, {}).key_points.length);

  // ── recovery
  const u = db.insert('users', { email: 'fx@example.test', display_name: 'F', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  const m = materials.addPaste(u.id, 'Lake', text).value;
  check('the first useful thing comes back with the upload', m.top_points.length > 0 && m.top_points.some((t) => /turns over twice/.test(t)), m.top_points);
  const dead = db.insert('material_courses', { user_id: u.id, material_id: m.id, title: 'x', version: cb.VERSION, status: 'building', started_at: new Date().toISOString(), skills: [{ id: 'a', title: 'A', prerequisites: [], questions: [{}] }], outline: [{}, {}] });
  const sum = cb.summary(dead);
  check('a build with nothing running says it stopped, at once', sum.status === 'partial' && sum.failure === 'interrupted', sum.status);
  db.remove('material_courses', (c) => c.id === dead.id);
  // Deleting during a build: the build stops and nothing comes back.
  const m2 = materials.addPaste(u.id, 'Lake2', text).value;
  let lessons = 0;
  const llm = async (a) => {
    if (a.task === 'material_outline') return { model: 'm', data: { skills: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id, title: `Skill ${id}`, unit: 'One', prerequisites: [], passage_ids: ['p1'], taught: true })) } };
    if (a.task === 'material_lesson') { lessons++; materials.remove(u.id, m2.id); return { model: 'm', data: { lesson: { paragraphs: ['x'] }, questions: [] } }; }
    return { model: 'm', data: { verdicts: [] } };
  };
  const out = await cb.build(u.id, m2.id, { llm, concurrency: 1 });
  check('a material deleted during its build stops it', lessons <= 2 && out.code === 'not_found', { lessons, out: out.code });
  check('and its course does not come back', !cb.get(u.id, m2.id));

  // ── a model that does not answer is not the file's fault
  const m3 = materials.addPaste(u.id, 'Lake3', text).value;
  const none = await cb.build(u.id, m3.id, { llm: async () => null });
  check('no model answered: the course says busy', cb.summary(cb.get(u.id, m3.id)).failure === 'busy' && none.busy === true, cb.summary(cb.get(u.id, m3.id)).failure);

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
  console.log('All format and recovery fixes hold');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
