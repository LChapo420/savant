/**
 * A material's test-date retention goal reaches every part made from it as a "prepare for a test" goal (services/learning-spec.js,
 * gather(): context.materialId). Also: warnings from the upload path are stored and shown, and are never silent.
 *   node scripts/uploads-personalize-test.js
 */
const os = require('os'); const path = require('path');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-personalize-${process.pid}.json`);
const db = require('../config/db');
const materials = require('../services/materials');
const ls = require('../services/learning-spec');
const cb = require('../services/course-builder');
const learner = require('../services/learner');
const scorecard = require('../services/scorecard');
function pdf(pages) {
  const objs = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((t, i) => {
    const stream = t ? `BT /F1 5 Tf 10 700 Td (${t}) Tj ET` : '';
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objs[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n'; const offs = [];
  for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offs.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
let failures = 0;
const check = (label, ok, detail) => { if (ok) console.log(`  ok   ${label}`); else { failures++; console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`); } };
(async () => {
  const u = db.insert('users', { email: 'p@example.test', display_name: 'P', password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: `${new Date().getUTCFullYear() - 15}-01` } });
  learner.saveProfile(u.id, { survey: learner.cleanSurvey({ interests: 'minecraft, drawing', notes: 'I do not like long reading.' }), subscription: 'pro' });
  const card = scorecard.get(u.id);
  for (const [id, sc] of Object.entries({ brevity_preference: 92, attention_runway: 8, vocabulary_ceiling: 8 })) card.stats[id] = { ...card.stats[id], s: sc, m: sc, w: 8, mw: 8, n: 40, evv: 40, evx: 40, evk: 'value' };
  db.update('scorecards', card.id, { stats: card.stats });
  const text = 'Tides are caused mainly by the moon\'s gravity pulling on the oceans. '.repeat(8);
  const m1 = materials.addPaste(u.id, 'Tides', text).value;
  const m2 = materials.addPaste(u.id, 'Tides two', text).value;
  const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  db.update('materials', m1.id, { retention_goal: { horizon: 'date', test_date: soon, set_on: new Date().toISOString().slice(0, 10) } });
  const withGoal = ls.buildSpec(u.id, { topic: 'Tides', materialId: m1.id });
  const without = ls.buildSpec(u.id, { topic: 'Tides', materialId: m2.id });
  const a = JSON.stringify(ls.linesFor(u.id, { topic: 'Tides', materialId: m1.id }, 'material'));
  const b = JSON.stringify(ls.linesFor(u.id, { topic: 'Tides', materialId: m2.id }, 'material'));
  check('a test date on the material puts test preparation in the lines every part is written from', a !== b && /exam|test/i.test(a.replace(b, '')), { a: a.length, b: b.length });
  check('the course builder passes the material (id) to the spec', cb.specBlockFor(u.id, { title: 'Tides', id: m1.id }) === ls.linesFor(u.id, { topic: 'Tides', materialId: m1.id }, 'material').join('\n'));
  check('a title alone still works', typeof cb.specBlockFor(u.id, 'Tides') === 'string');
  // decoding and warnings
  const latin = await materials.addFile(u.id, Buffer.from('Caf\xe9 owners read the r\xe9sum\xe9 of the tides carefully every single morning before work. '.repeat(30), 'latin1'), 'old.txt');
  check('8-bit text is read, with a note', latin.value && /Windows-1252/.test((latin.value.warnings || []).join(' ')), latin);
  const u16 = await materials.addFile(u.id, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]), 'u16.txt');
  check('UTF-16 text is read', u16.value && u16.value.words > 40, u16);
  const rtf = await materials.addFile(u.id, Buffer.from(String.raw`{\rtf1\ansi ` + text.split('.').join(String.raw`.\par `)), 'cut.rtf');
  check('a cut-off RTF is read with a warning', rtf.value && /cut off/.test((rtf.value.warnings || []).join(' ')), rtf);
  const trunc = await materials.addFile(u.id, Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(300, 1)]), 'x.docx');
  check('a cut-off ZIP or Office file says it is damaged', trunc.error && /damaged or cut off/.test(trunc.error), trunc);
  const audioLike = await materials.addFile(u.id, Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(400)]), 'a.wav');
  check('a recording sent to the document reader says so', audioLike.error && audioLike.code === 'is_audio', audioLike);
  const exe = await materials.addFile(u.id, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(3000, 1)]), 'a.exe');
  check('program bytes are refused as an unknown type', exe.error && exe.code === 'bad_type', exe);
  check('a long non-English text from speech or OCR is flagged', !materials.looksEnglish('El cambio climático es un problema muy importante para todas las personas del mundo y debemos actuar ahora con decisión. '.repeat(10)) && materials.looksEnglish(text));
  const P = 'Tides are caused mainly by the moon gravity pulling on the oceans and the sun adds a smaller pull as well in every month.';
  const hole = await materials.addFile(u.id, pdf([P, '', P, P]), 'holes.pdf');
  check('a text PDF with a page of pictures says which page had no text', hole.value && /Page 2 of this PDF had no readable text/.test((hole.value.warnings || []).join(' ')), hole);
  console.log(failures ? `${failures} FAILED` : 'All checks passed.');
  process.exit(failures ? 1 : 0);
})();
