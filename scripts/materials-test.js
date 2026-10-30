/**
 * Learn from your own material, slice (a) (services/materials.js, routes/materials.js, public/my-material):
 *
 *   node scripts/materials-test.js
 *
 * Throwaway db. Builds a real PDF and a real DOCX in memory, so no binary fixtures are committed. No model is called.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');

process.env.NODE_ENV = 'test';
const tmp = path.join(os.tmpdir(), `materials-test-${process.pid}.json`);
process.env.DB_FILE = tmp;

const express = require('express');
const db = require('../config/db');
const materials = require('../services/materials');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const PROSE = 'Photosynthesis converts light energy into chemical energy stored in glucose. '.repeat(6);

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** A zip with deflated entries: [{name, data}]. */
function zip(files) {
  const parts = []; const central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name); const raw = Buffer.from(f.data); const def = zlib.deflateRawSync(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc32(raw), 14); h.writeUInt32LE(def.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(def.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, name, def); central.push(c, name); off += 30 + name.length + def.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
function docx(text) {
  return zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>` },
  ]);
}
function pdf(pages, text) {
  const objs = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((t, i) => {
    const stream = `BT /F1 5 Tf 10 700 Td (${t}) Tj ET`;
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objs[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n'; const offs = [];
  for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offs.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

function serve(router) {
  const app = express();
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/materials', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const call = (method, url, body, uid, type) => new Promise((ok, fail) => {
        const data = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': type || 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': data.length } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

(async () => {
  const a = db.insert('users', { email: 'a@test.invalid', display_name: 'A' });
  const b = db.insert('users', { email: 'b@test.invalid', display_name: 'B' });

  console.log('sniffing and extraction');
  check('PDF magic', materials.sniff(Buffer.from('%PDF-1.7 ...')) === 'pdf');
  check('zip magic', materials.sniff(zip([{ name: 'a', data: 'b' }])) === 'zip');
  check('PNG magic', materials.sniff(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(8, 1)])) === 'png');
  check('JPG magic', materials.sniff(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8, 1)])) === 'jpeg');
  check('binary junk refused', materials.sniff(Buffer.from([1, 2, 0, 3, 4, 5, 6])) === null);
  check('invalid UTF-8 refused', materials.sniff(Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0x41])) === null);
  check('text with a BOM accepted', materials.sniff(Buffer.from('﻿hello there')) === 'text');
  const t = await materials.extract(Buffer.from(PROSE));
  check('plain text extracted', t.kind === 'text' && t.text.startsWith('Photosynthesis'), t);
  const d = await materials.extract(docx(PROSE));
  check('DOCX text extracted', d.kind === 'docx' && d.text.includes('Photosynthesis converts'), d);
  const p = await materials.extract(pdf([PROSE.slice(0, 380)]));
  check('PDF text extracted with page count', p.kind === 'pdf' && p.pages === 1 && p.text.includes('Photosynthesis'), p);
  const p2 = await materials.extract(pdf([PROSE.slice(0, 380), PROSE.slice(0, 380)]));
  check('PDF page count', p2.pages === 2, p2);
  const big = await materials.extract(pdf(Array.from({ length: 301 }, () => 'x')));
  check('PDF over 300 pages refused', big.code === 'too_many_pages', big);
  check('damaged PDF refused', (await materials.extract(Buffer.from('%PDF-1.4 not really'))).code === 'unreadable');
  check('PDF with no text says so', (await materials.extract(pdf(['']))).code === 'too_little');
  check('a zip that is not a DOCX refused', (await materials.extract(zip([{ name: 'a.txt', data: 'hello' }]))).code === 'bad_type');
  check('a zip bomb is refused before unpacking', (await materials.extract(zip([{ name: 'word/document.xml', data: Buffer.alloc(210 * 1024 * 1024, 65) }]))).code === 'too_big');
  check('an executable refused', (await materials.extract(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]))).code === 'bad_type');
  check('empty refused', (await materials.extract(Buffer.alloc(0))).code === 'empty');
  check('over 20 MB refused', (await materials.extract(Buffer.alloc(materials.MAX_BYTES + 1, 65))).code === 'too_big');
  check('too short refused', (await materials.extract(Buffer.from('hello there'))).code === 'too_little');
  check('too long refused', (await materials.extract(Buffer.alloc(materials.MAX_CHARS + 10, 97))).code === 'too_long');
  check('a .pdf name on text bytes is read as text', (await materials.extract(Buffer.from(PROSE))).kind === 'text');

  console.log('storage and routes');
  const srv = await serve(require('../routes/materials'));
  let r = await srv.call('GET', '/api/materials', undefined, 0);
  check('signed-out is refused', r.status === 401 || r.status === 403, r.status);
  r = await srv.call('POST', '/api/materials?name=Bio%20notes.md', Buffer.from(PROSE), a.id, 'application/octet-stream');
  check('upload stores it', r.status === 201 && r.json.material.title === 'Bio notes' && r.json.materials.length === 1, r.json);
  const id = r.json.material.id;
  check('the list never carries the full text', !('text' in r.json.materials[0]) && r.json.materials[0].preview.length <= 400);
  r = await srv.call('POST', '/api/materials', docx(PROSE), a.id, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  check('docx upload', r.status === 201 && r.json.material.kind === 'docx', r.json);
  r = await srv.call('POST', '/api/materials', pdf([PROSE.slice(0, 380)]), a.id, 'text/plain');
  check('type decided by bytes, not the header', r.status === 201 && r.json.material.kind === 'pdf', r.json);
  r = await srv.call('POST', '/api/materials/paste', { title: '<b>Notes</b>', text: PROSE }, a.id);
  check('paste stores it, title cleaned of markup', r.status === 201 && !/[<>]/.test(r.json.material.title) && r.json.material.kind === 'paste', r.json);
  r = await srv.call('POST', '/api/materials/paste', { text: 'short' }, a.id);
  check('short paste refused', r.status === 400, r.json);
  r = await srv.call('POST', '/api/materials', Buffer.from('MZ\u0000\u0000binary'), a.id, 'application/octet-stream');
  check('bad file is a 400 with a reason', r.status === 400 && r.json.code === 'bad_type', r.json);
  r = await srv.call('POST', '/api/materials', pdf(Array.from({ length: 301 }, () => 'x')), a.id, 'application/pdf');
  check('too many pages is a 413', r.status === 413, r.json);

  r = await srv.call('GET', `/api/materials/${id}`, undefined, a.id);
  check('owner reads the full text', r.status === 200 && r.json.material.text.startsWith('Photosynthesis'));
  r = await srv.call('GET', `/api/materials/${id}`, undefined, b.id);
  check('another learner gets a 404', r.status === 404);
  r = await srv.call('GET', '/api/materials', undefined, b.id);
  check('another learner sees none', r.json.materials.length === 0);
  r = await srv.call('DELETE', `/api/materials/${id}`, undefined, b.id);
  check("another learner cannot delete it", r.status === 404 && materials.textOf(a.id, id) !== null);

  r = await srv.call('DELETE', `/api/materials/${id}`, undefined, a.id);
  check('owner deletes it', r.status === 200 && r.json.materials.every((m) => m.id !== id));
  check('gone from the store', db.byId('materials', id) === null);
  const onDisk = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  check('gone from the file on disk, text included', !onDisk.materials.some((m) => m.id === id) && !JSON.stringify(onDisk.materials).includes('Bio notes'));

  console.log('limits');
  for (let i = db.find('materials', (m) => m.user_id === a.id).length; i < materials.MAX_ITEMS; i++) materials.addPaste(a.id, `m${i}`, PROSE);
  r = await srv.call('POST', '/api/materials/paste', { text: PROSE }, a.id);
  check('per-learner count cap', r.status === 409 && r.json.code === 'limit', r.json);
  const c = db.insert('users', { email: 'c@test.invalid' });
  for (let i = 0; i < 4; i++) materials.addPaste(c.id, `big${i}`, 'word '.repeat(150000));
  r = await srv.call('POST', '/api/materials/paste', { text: 'word '.repeat(150000) }, c.id);
  check('per-learner storage cap', r.status === 409, r.json);
  srv.close();

  console.log('wiring');
  const profile = read('routes/profile.js'); const consent = read('routes/consent.js'); const server = read('server.js');
  check('exported with the account', /'spanish_study_tests', 'materials'/.test(profile));
  check('deleted with the account', /'spanish_study_tests', 'materials'/.test(consent));
  check('collection registered', /'materials',/.test(read('config/db.js')));
  check('route mounted', server.includes("'/api/materials', require('./routes/materials')"));
  check('upload route is rate limited', /limit\('materials-upload'/.test(read('routes/materials.js')) && /limit\('materials-paste'/.test(read('routes/materials.js')));
  check('child accounts cannot upload or paste', /materials/.test(consent.match(/const CHILD_MEDIA_UPLOAD = .*/)[0]) && new RegExp(consent.match(/const CHILD_MEDIA_UPLOAD = (\/.*\/);/)[1].slice(1, -1)).test('/materials/paste'));
  check('the child gate blocks POST only, so a child can still delete', /req\.method === 'POST' && CHILD_MEDIA_UPLOAD\.test\(reqPath\)/.test(consent));
  const page = read('public/my-material.html'); const js = read('public/js/my-material.js');
  check('page loads its script, no inline script', page.includes('/js/my-material.js') && !/<script>[^<]/.test(page));
  check('page says where the file goes and how to delete', /only that text/.test(js) && /removed for real/.test(js));
  check('page uses the shared stylesheet, no new CSS', page.includes('/css/style.css') && !/<style/.test(page));
  check('linked from the profile', read('public/js/profile.js').includes('/my-material'));
  check('no model call in this slice', !/require\([^)]*(\/ai|\/pool|providers|anthropic)/.test(read('services/materials.js') + read('routes/materials.js')));

  try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
