/**
 * Does Savant keep what the material stresses? (MEASURED for extraction; generated output is a real model's, checked deterministically by the planted fact's own rare words.)
 *
 *   node scripts/uploads-emphasis-proof.js weights            per format: the weight the extractor gives each planted point. No model.
 *   node scripts/uploads-emphasis-proof.js build [formats]    notes, study pack, practice test and learning path for each format; which stressed points survive where
 *
 * Twelve stressed points, each by one device (heading, bold, repeated, "on the test" before and after, teacher's note, boxed key point, capitals, underline, highlight, summary, "Remember:"), eight plain
 * facts as the control. Each point has a rare name and value that appear nowhere else, so a plain word search shows whether it survived.
 */
const fs = require('fs'); const os = require('os'); const path = require('path');
require('../services/run-cap').defaultCap(Number(process.env.RUN_CAP_USD || 3));
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
process.env.GONKA_PIPELINE = '1';
process.env.GONKA_LEDGER_FILE = process.env.GONKA_LEDGER_FILE || `${LIVE}gonka-ledger.json`;
process.env.NODE_ENV = 'test';
process.env.UPLOAD_AUTOBUILD = 'off';
process.env.UPLOAD_FACTCHECK = process.env.UPLOAD_FACTCHECK || 'on';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-emph-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
const db = require('../config/db');
const materials = require('../services/materials');
const J = require('./lib/invented-judges');
const R = require('./lib/real-files');

// device, fact sentence, rare word, value
const POINTS = [
  { id: 'heading', dev: 'heading', s: 'Tamsin Reef shelters the eastern harbour from winter storms.', key: /tamsin/i, val: /harbou?r|storm/i },
  { id: 'bold', dev: 'bold', s: 'The Korrak lighthouse burns whale oil only on the 19th of each month.', key: /korrak/i, val: /19|whale oil/i },
  { id: 'repeat', dev: 'repeat', s: 'The Lumen ferry carries exactly 44 passengers.', key: /lumen/i, val: /44/ },
  { id: 'test_before', dev: 'test_before', s: 'Salt from Ondra Flats is taxed at 7 percent.', key: /ondra/i, val: /7|seven/i },
  { id: 'test_after', dev: 'test_after', s: 'The Veskin treaty was signed in 1642.', key: /veskin/i, val: /1642/ },
  { id: 'teacher', dev: 'teacher', s: 'Basalt from Mount Hesper is the only stone that sinks in the bay.', key: /hesper/i, val: /basalt|sinks/i },
  { id: 'box', dev: 'box', s: 'Ravel Sound freezes solid every third winter.', key: /ravel/i, val: /freez|third/i },
  { id: 'caps', dev: 'caps', s: 'The Dorrin bell must be rung before any boat leaves.', key: /dorrin/i, val: /bell|boat/i },
  { id: 'underline', dev: 'underline', s: 'Pellan moss grows only above 300 metres.', key: /pellan/i, val: /300/ },
  { id: 'highlight', dev: 'highlight', s: 'The Quill archive holds 2,600 ship logs.', key: /quill/i, val: /2,?600/ },
  { id: 'summary', dev: 'summary', s: 'Fenwick Bay supplies four fifths of the islands\' fresh water.', key: /fenwick/i, val: /four fifths|4\/5|80/i },
  { id: 'remember', dev: 'remember', s: 'Harvest on Sarn Island starts on the first new moon of August.', key: /sarn/i, val: /moon|august/i },
];
const PLAIN = [
  { id: 'p1', s: 'The islands were mapped by Anneke Dahl in 1788.', key: /anneke|dahl/i, val: /1788/ },
  { id: 'p2', s: 'Goats outnumber people on Brack Island by nine to one.', key: /brack/i, val: /nine|9/i },
  { id: 'p3', s: 'The Meren Road links the three northern villages.', key: /meren/i, val: /villages|three/i },
  { id: 'p4', s: 'Tideline Market opens at dawn on Saturdays.', key: /tideline/i, val: /dawn|saturday/i },
  { id: 'p5', s: 'The school at Ivel has 62 pupils.', key: /ivel/i, val: /62/ },
  { id: 'p6', s: 'Copper was found near Cold Tarn in 1901.', key: /cold tarn/i, val: /1901/ },
  { id: 'p7', s: 'Wrens nest on the cliffs of Hallow Head each spring.', key: /hallow/i, val: /wren|spring/i },
  { id: 'p8', s: 'The Osmer bridge is 410 metres long.', key: /osmer/i, val: /410/ },
];
const P = Object.fromEntries(POINTS.map((p) => [p.id, p.s]));
const pl = (i) => PLAIN[i].s;
const FILL = 'People on the islands fish, farm and keep goats, and most families do a little of each through the year.';

function md() {
  return `# The Kess Archipelago\n\n## Tamsin Reef shelters the eastern harbour from winter storms\n\n${pl(0)} ${pl(1)} ${FILL}\n\n## Trade and travel\n\n**${P.bold}** ${pl(2)} ${pl(3)}\n\n${P.repeat} Remember the number on the ferry, it comes up a lot. The ferry takes 44 people, no more: the Lumen ferry has a limit of 44 passengers. So again, 44 on the Lumen ferry.\n\nThis will be on the test: ${P.test_before} ${pl(4)}\n\n${P.test_after} That will be on the exam.\n\n## Land and sea\n\nTeacher's note: students always miss this one. ${P.teacher}\n\n${pl(5)}\n\n> **Key point:** ${P.box}\n\n${P.caps.toUpperCase()} ${pl(6)}\n\n<u>${P.underline}</u> ${pl(7)}\n\n==${P.highlight}==\n\nRemember: ${P.remember}\n\n## Summary\n\n- ${P.summary}\n- The islands depend on the sea.\n`;
}
function htmlDoc() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Kess</title></head><body><h1>The Kess Archipelago</h1><h2>Tamsin Reef shelters the eastern harbour from winter storms</h2><p>${pl(0)} ${pl(1)} ${FILL}</p><h2>Trade and travel</h2><p><strong>${P.bold}</strong> ${pl(2)} ${pl(3)}</p><p>${P.repeat} Remember the number on the ferry, it comes up a lot. The ferry takes 44 people, no more: the Lumen ferry has a limit of 44 passengers. So again, 44 on the Lumen ferry.</p><p>This will be on the test: ${P.test_before} ${pl(4)}</p><p>${P.test_after} That will be on the exam.</p><h2>Land and sea</h2><p><em>Teacher's note: students always miss this one.</em> ${P.teacher}</p><p>${pl(5)}</p><div class="callout"><b>Key point:</b> ${P.box}</div><p>${P.caps.toUpperCase()} ${pl(6)}</p><p><u>${P.underline}</u> ${pl(7)}</p><p><mark>${P.highlight}</mark></p><p>Remember: ${P.remember}</p><h2>Summary</h2><ul><li>${P.summary}</li><li>The islands depend on the sea.</li></ul></body></html>`;
}
async function docx() {
  const run = (t, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t.replace(/&/g, '&amp;')}</w:t></w:r>`;
  const p = (...runs) => `<w:p>${runs.join('')}</w:p>`;
  const body = [
    R.wp('The Kess Archipelago', 'Heading1'), R.wp('Tamsin Reef shelters the eastern harbour from winter storms', 'Heading2'), R.wp(`${pl(0)} ${pl(1)} ${FILL}`), R.wp('Trade and travel', 'Heading2'),
    p(run(P.bold, '<w:b/>'), run(` ${pl(2)} ${pl(3)}`)),
    R.wp(`${P.repeat} Remember the number on the ferry, it comes up a lot. The ferry takes 44 people, no more: the Lumen ferry has a limit of 44 passengers. So again, 44 on the Lumen ferry.`),
    R.wp(`This will be on the test: ${P.test_before} ${pl(4)}`), R.wp(`${P.test_after} That will be on the exam.`), R.wp('Land and sea', 'Heading2'),
    // the teacher's note as a real Word comment on the sentence
    `<w:p><w:commentRangeStart w:id="1"/>${run(P.teacher)}<w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r></w:p>`,
    R.wp(pl(5)), R.wp(`Key point: ${P.box}`), R.wp(`${P.caps.toUpperCase()} ${pl(6)}`),
    p(run(P.underline, '<w:u w:val="single"/>'), run(` ${pl(7)}`)), p(run(P.highlight, '<w:highlight w:val="yellow"/>')), R.wp(`Remember: ${P.remember}`),
    R.wp('Summary', 'Heading2'), R.wp(P.summary), R.wp('The islands depend on the sea.'),
  ].join('');
  const JSZip = require('jszip'); // eslint-disable-line global-require
  const z = await JSZip.loadAsync(await R.docx({ body }));
  z.file('word/comments.xml', '<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="1" w:author="Teacher"><w:p><w:r><w:t>Students always miss this one. Know it for the test.</w:t></w:r></w:p></w:comment></w:comments>');
  return z.generateAsync({ type: 'nodebuffer' });
}
async function pdf() {
  const { chromium } = require('playwright'); // eslint-disable-line global-require
  const br = await chromium.launch();
  const page = await br.newPage();
  await page.setContent(htmlDoc().replace('<head>', '<head><style>body{font:14px Georgia;margin:40px} mark{background:#ff0} .callout{border:2px solid #333;padding:8px}</style>'));
  const b = await page.pdf({ format: 'Letter', printBackground: true });
  await br.close();
  return b;
}
async function pptx() {
  const fx = require('jszip'); // eslint-disable-line global-require
  const z = new fx();
  const X = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const sp = (t, title, attrs = '') => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr>${title ? '<p:ph type="title"/>' : ''}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr ${attrs}/><a:t>${t.replace(/&/g, '&amp;')}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const slides = [
    [[sp('Tamsin Reef shelters the eastern harbour from winter storms', true), sp(`${pl(0)}`), sp(pl(1)), sp(FILL)], ''],
    [[sp('Trade and travel', true), sp(P.bold, false, 'b="1"'), sp(pl(2)), sp(pl(3)), sp(`${P.repeat} The ferry takes 44 people, no more: the Lumen ferry has a limit of 44 passengers.`)], 'Remember the number on the ferry: 44 on the Lumen ferry.'],
    [[sp('Taxes and treaties', true), sp(P.test_before), sp(pl(4)), sp(P.test_after)], 'This will be on the test: the salt tax and the treaty date.'],
    [[sp('Land and sea', true), sp(P.teacher), sp(pl(5)), sp(`Key point: ${P.box}`), sp(`${P.caps.toUpperCase()}`), sp(pl(6))], "Teacher's note: students always miss the basalt. Key point for the exam."],
    [[sp('Details', true), sp(P.underline, false, 'u="sng"'), sp(pl(7)), sp(P.highlight), sp(`Remember: ${P.remember}`)], ''],
    [[sp('Summary', true), sp(P.summary), sp('The islands depend on the sea.')], ''],
  ];
  slides.forEach(([s, notes], i) => {
    z.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:sld ${X}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${s.join('')}</p:spTree></p:cSld></p:sld>`);
    z.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i + 1}.xml"/></Relationships>`);
    z.file(`ppt/notesSlides/notesSlide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:notes ${X}><p:cSld><p:spTree>${notes ? sp(notes) : ''}</p:spTree></p:cSld></p:notes>`);
  });
  z.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${X}/>`);
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  return z.generateAsync({ type: 'nodebuffer' });
}
const FORMATS = { md: async () => Buffer.from(md()), html: async () => Buffer.from(htmlDoc()), docx, pdf, pptx };
const find = (p, kps) => kps.filter((k) => p.key.test(k.text)).sort((a, b) => b.weight - a.weight)[0];

async function weights() {
  const u = db.insert('users', { email: 'emph@example.test', display_name: 'E', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  const table = {};
  for (const [f, make] of Object.entries(FORMATS)) {
    const got = await materials.addFile(u.id, await make(), `kess.${f}`);
    if (got.error) { console.log(f, got.error); continue; }
    const m = materials.get(u.id, got.value.id, true);
    table[f] = { points: POINTS.map((p) => { const k = find(p, m.key_points); return k ? Math.round(k.weight * 10) / 10 : 0; }), plain: PLAIN.map((p) => { const k = find(p, m.key_points); return k ? Math.round(k.weight * 10) / 10 : 0; }) };
    materials.remove(u.id, got.value.id);
  }
  console.log(`${'device'.padEnd(12)}${Object.keys(table).map((f) => f.padEnd(6)).join('')}`);
  POINTS.forEach((p, i) => console.log(`${p.id.padEnd(12)}${Object.keys(table).map((f) => String(table[f].points[i]).padEnd(6)).join('')}`));
  console.log(`${'plain mean'.padEnd(12)}${Object.keys(table).map((f) => String((table[f].plain.reduce((a, b) => a + b, 0) / 8).toFixed(1)).padEnd(6)).join('')}`);
  return table;
}

function survive(p, text) { return p.key.test(text) && p.val.test(text.split(/(?<=[.!?\n])\s+/).filter((l) => p.key.test(l)).join(' ') || text); }
async function build(formats) {
  const cb = require('../services/course-builder'); const notes = require('../services/material-notes'); const pack = require('../services/material-pack'); const tests = require('../services/material-test');
  const llm = async (a) => { for (let i = 0; i < 4; i++) { try { const data = await J.call('M', { system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: Math.max(a.maxTokens || 1500, 2500) }); return { data, model: 'M' }; } catch (e) { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); } } return null; };
  const outFile = process.env.EMPH_OUT || path.join(__dirname, '..', 'docs', 'uploads-emphasis-results.json');
  const rows = [];
  await J.pool(formats, 3, async (f) => {
    const u = db.insert('users', { email: `emph-${f}@example.test`, display_name: 'E', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
    const got = await materials.addFile(u.id, await FORMATS[f](), `kess.${f}`);
    if (got.error) { console.log(f, got.error); return; }
    const id = got.value.id;
    const [n, k, c] = await Promise.all([notes.build(u.id, id, { llm, factcheck: true }), pack.build(u.id, id, { llm, factcheck: true }), cb.build(u.id, id, { llm, factcheck: true })]);
    const nText = n.notes ? n.notes.sections.flatMap((s) => [s.heading, ...s.bullets.map((b) => b.text)]).join('\n') : '';
    const kk = k.pack || {};
    const cards = (kk.cards || []).map((x) => `${x.front} ${x.back}`).join('\n');
    const testT = [...(kk.test || []), ...(kk.quiz || [])].map((q) => `${q.prompt} ${q.answer || (q.choices || [])[q.answer_index] || ''}`).join('\n');
    const courseT = c.course ? c.course.skills.flatMap((s) => [...s.lesson.paragraphs, ...(s.lesson.key_points || [])]).join('\n') : '';
    const courseQ = c.course ? c.course.skills.flatMap((s) => s.questions.map((q) => `${q.prompt} ${q.answer || (q.choices || [])[q.answer_index] || ''}`)).join('\n') : '';
    const row = { format: f, status: { notes: n.notes && n.notes.status, pack: kk.status, course: c.course && c.course.status, skills: c.course && c.course.skills.length }, surfaces: {} };
    for (const [name, text] of [['notes', nText], ['cards', cards], ['test', testT], ['path_lesson', courseT], ['path_questions', courseQ]]) {
      row.surfaces[name] = { stressed: POINTS.filter((p) => survive(p, text)).map((p) => p.id), plain: PLAIN.filter((p) => survive(p, text)).map((p) => p.id), total_words: (text.match(/\S+/g) || []).length };
    }
    row.m = materials.get(u.id, id, true).key_points.filter((x) => x.weight >= 2).length;
    rows.push(row);
    fs.writeFileSync(outFile, JSON.stringify(rows));
    console.log(`${f}: ${JSON.stringify(row.status)}`);
    for (const [s, v] of Object.entries(row.surfaces)) console.log(`  ${s.padEnd(15)} stressed ${String(v.stressed.length).padStart(2)}/12 plain ${v.plain.length}/8  missing ${POINTS.filter((p) => !v.stressed.includes(p.id)).map((p) => p.id).join(',').slice(0, 90)}`);
  });
  void tests;
}

(async () => {
  const cmd = process.argv[2] || 'weights';
  if (cmd === 'weights') await weights();
  else await build((process.argv[3] || 'md,docx,pdf,pptx,html').split(','));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
