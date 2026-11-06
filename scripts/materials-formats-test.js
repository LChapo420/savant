/**
 * Uploads of any format: the extraction matrix, the emphasis (key points), the new formats and the coverage gate.
 * Deterministic and offline: fixtures are built by scripts/lib/upload-fixtures.js, OCR is a stub (the real tesseract.js and
 * Whisper numbers are in scripts/uploads-proof.js), and the course builder gets a scripted model.
 *
 * Thresholds sit a little under what the fixtures measured, so a regression in a parser or in the key-point pass fails here.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_FILE = path.join(os.tmpdir(), `materials-formats-test-${process.pid}.json`);
// Windows reuses process ids: an old run's file under this name would add its rows to this run's.
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none there */ }

const db = require('../config/db');
const materials = require('../services/materials');
const P = require('../services/material-parsers');
const F = require('../services/material-formats');
const K = require('../services/material-keypoints');
const cb = require('../services/course-builder');
const fx = require('./lib/upload-fixtures');
const S = require('./lib/upload-score');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 300)}`}`);
}

// Per format: [min text recall, min stressed key-point recall, min rank correlation (null: not expected to see emphasis)].
const EXPECT = {
  md: [1, 0.9, 0.7], html: [1, 0.9, 0.7], tex: [1, 0.9, 0.5], ipynb: [1, 0.9, 0.7], docx: [1, 0.9, 0.7], odt: [1, 0.9, 0.7],
  pptx: [1, 0.85, 0.7], odp: [1, 0.85, 0.7], epub: [1, 0.9, 0.7], pdf: [1, 0.85, 0.7],
  txt: [1, 0.85, null], rtf: [1, 0.85, null], doc: [1, 0.85, null], csv: [1, null, null], xlsx: [1, null, null], ods: [1, null, null],
};

(async () => {
  console.log('format matrix (tides is the development document, vaccines the held-out one)');
  for (const docId of ['tides', 'vaccines']) {
    const doc = fx.DOCS[docId];
    for (const fmt of fx.FORMAT_LIST) {
      const buf = await fx.build(fmt, doc);
      const out = await materials.extract(buf);
      if (out.error) { check(`${docId} ${fmt}: extracts`, false, out.error); continue; }
      const [minText, minStressed, minRho] = EXPECT[fmt];
      const tr = S.textRecall(doc.kps, out.text);
      check(`${docId} ${fmt}: text recall ${S.pct(tr.recall)} >= ${S.pct(minText * (docId === 'vaccines' ? 0.95 : 1))}`, tr.recall >= minText * (docId === 'vaccines' ? 0.95 : 1), tr.missed);
      if (minStressed != null) {
        const ks = S.keypointScore(doc.kps, K.extract(out.rich, { plain: out.text }).key_points);
        const slack = docId === 'vaccines' ? 0.1 : 0;
        check(`${docId} ${fmt}: stressed key points ${S.pct(ks.recallStressed)} >= ${S.pct(minStressed - slack)}`, ks.recallStressed >= minStressed - slack, ks.missed);
        if (minRho != null) check(`${docId} ${fmt}: emphasis rank correlation ${S.r2(ks.rho)} >= ${minRho - slack}`, ks.rho != null && ks.rho >= minRho - slack, ks.pairs);
      }
    }
  }

  console.log('subtitles');
  for (const fmt of ['srt', 'vtt']) {
    const out = await materials.extract(await fx.build(fmt, fx.DOCS.tides));
    check(`${fmt}: read as subtitles, timed lines, no cue arrows`, !out.error && out.kind === 'subtitles' && /^\[0:00\] /.test(out.text) && !/-->/.test(out.text) && !/<c>/.test(out.text), out.error || out.text.slice(0, 80));
    if (out.error) continue;
    const tr = S.textRecall(fx.LECTURE_KPS, out.text);
    check(`${fmt}: text recall ${S.pct(tr.recall)} >= 90%`, tr.recall >= 0.9, tr.missed);
    const ex = K.extract(out.rich, { plain: out.text, spoken: true });
    check(`${fmt}: key points keep their time`, ex.key_points.length >= 4 && ex.key_points.every((k) => k.loc && k.loc.kind === 'time'), ex.key_points.slice(0, 2));
    const ks = S.keypointScore(fx.LECTURE_KPS, ex.key_points);
    check(`${fmt}: spoken emphasis (said twice, "this will be on the exam") makes the top point the top weight`, ks.pairs.some((p) => /^s1:L5->5$/.test(p)), ks.pairs);
  }
  const rolling = F.fromSubtitles(Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nTides come from the moon\n\n00:00:03.000 --> 00:00:05.000\nTides come from the moon and the sun\n\n00:00:05.000 --> 00:00:07.000\nTides come from the moon and the sun\n'));
  check('rolling auto-captions are not repeated', rolling.text === '[0:01] Tides come from the moon and the sun', rolling.text);

  console.log('pictures');
  const recognised = [];
  P.setOcr(async (buf) => { recognised.push(buf); return { text: fx.DOCS.tides.kps.slice(0, 5).map((k) => k.text).join('\n') }; });
  for (const type of ['png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff']) {
    recognised.length = 0;
    const buf = await fx.picture(fx.DOCS.tides, type, { maxWidth: 900 });
    check(`${type}: recognised as a picture`, F.sniffImage(buf) === type, F.sniffImage(buf));
    const out = await materials.extract(buf);
    check(`${type}: read through OCR as a PNG`, !out.error && out.kind === 'image' && recognised.length === 1 && recognised[0].slice(1, 4).toString('latin1') === 'PNG', out.error || recognised.length);
  }
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40)]);
  const heicOut = await materials.extract(heic);
  check('HEIC: refused with a way forward, not a crash', heicOut.error && /JPG/.test(heicOut.error) && heicOut.code === 'bad_type', heicOut);
  check('a damaged picture says so', (await materials.extract(Buffer.concat([Buffer.from('RIFF....WEBP'), Buffer.alloc(30)]))).code === 'unreadable');

  console.log('scanned PDF (no text layer): the page pictures are read by OCR');
  const pages = [];
  recognised.length = 0;
  P.setOcr(async (buf) => { recognised.push(buf); const i = recognised.length; return { text: fx.DOCS.tides.kps.slice((i - 1) * 4, i * 4).map((k) => k.text).join('\n') }; });
  const scan = await materials.extract(await fx.build('pdf-scan', fx.DOCS.tides));
  check('scan: two page pictures went to OCR as PNGs', !scan.error && recognised.length === 2 && recognised.every((b) => b.slice(1, 4).toString('latin1') === 'PNG'), scan.error || recognised.length);
  check('scan: kind pdf, OCR flagged, page marks in the structure', !scan.error && scan.kind === 'pdf' && scan.ocr === true && /\[\[p1\]\]/.test(scan.rich) && /\[\[p2\]\]/.test(scan.rich), scan.rich && scan.rich.slice(0, 40));
  void pages;
  P.setOcr(async () => ({ missing: true }));
  const noOcr = await materials.extract(await fx.build('pdf-scan', fx.DOCS.tides));
  check('scan without an OCR engine: plain message, nothing invented', noOcr.error && noOcr.code === 'no_ocr', noOcr);

  console.log('ZIP of mixed files');
  P.setOcr(async () => ({ text: fx.DOCS.tides.kps.slice(0, 4).map((k) => k.text).join('\n') }));
  const zip = await materials.extract(await fx.zipMixed(fx.DOCS.tides));
  check('zip: reads md, docx, csv and the picture; skips the program and the mac junk', !zip.error && zip.kind === 'zip' && zip.files.filter((f) => f.ok).length === 4 && zip.files.some((f) => f.name === 'misc/program.exe' && !f.ok) && !zip.files.some((f) => /MACOSX/.test(f.name)), zip.error || zip.files);
  check('zip: each file keeps its own name as a place', !zip.error && /\[\[f notes\/lesson\.docx\]\]/.test(zip.rich), zip.rich && zip.rich.slice(0, 60));
  const JSZip = require('jszip');
  const nested = new JSZip(); nested.file('inner.zip', await fx.zipMixed(fx.DOCS.tides)); nested.file('a.md', fx.DOCS.tides.md);
  const nestedOut = await materials.extract(await nested.generateAsync({ type: 'nodebuffer' }));
  check('zip: a zip inside a zip is not opened (the rest still is)', !nestedOut.error && nestedOut.files.some((f) => f.name === 'inner.zip' && !f.ok) && nestedOut.files.some((f) => f.name === 'a.md' && f.ok), nestedOut.error || nestedOut.files);
  const emptyZip = new JSZip(); emptyZip.file('x.bin', Buffer.from([1, 2, 3, 0, 5]));
  check('zip of nothing readable says so', (await materials.extract(await emptyZip.generateAsync({ type: 'nodebuffer' }))).code === 'bad_type');

  console.log('Google links');
  const g1 = F.googleExport('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing');
  check('a Docs link becomes its DOCX export', g1 && g1.kind === 'docx' && g1.url === 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=docx', g1);
  check('a Slides link becomes its PPTX export', (F.googleExport('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit') || {}).url === 'https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export/pptx');
  check('a Sheets link becomes its XLSX export', (F.googleExport('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0') || {}).kind === 'xlsx');
  check('only https docs.google.com is accepted', !F.googleExport('http://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789') && !F.googleExport('https://evil.example/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789') && !F.googleExport('https://user:pw@docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789') && !F.googleExport('https://docs.google.com.evil.example/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'));
  const u = db.insert('users', { email: 'formats@test.local', name: 'Formats' });
  check('a non-Google link is refused before any fetch', (await materials.addGoogleLink(u.id, 'https://example.com/x')).code === 'bad_url');

  console.log('key points stored with the material');
  P.setOcr(async () => ({ text: '' }));
  const md = (await materials.addFile(u.id, await fx.build('md', fx.DOCS.tides), 'tides.md')).value;
  const full = materials.get(u.id, md.id, true);
  check('the material keeps its key points and topics', full.key_points.length >= 9 && full.topics.length >= 6 && md.key_point_count === full.key_points.length, [full.key_points.length, full.topics.length]);
  check('each key point has a weight 1-5, a signal list, a heading-level place and an offset into the stored text', full.key_points.every((k) => k.weight >= 1 && k.weight <= 5 && k.signals.length && k.at != null && full.text.slice(k.at, k.at + 12).length === 12));
  const top = full.key_points.filter((k) => k.weight >= 4.9);
  check('the boxed, repeated, "exam question" point is at the top weight', top.some((k) => /gravitational pull of the Moon/.test(k.text) && k.repeats >= 2), top.map((k) => k.text));
  const pdfMat = (await materials.addFile(u.id, await fx.build('pdf', fx.DOCS.tides), 'tides.pdf')).value;
  const pdfKp = materials.get(u.id, pdfMat.id, true).key_points;
  check('PDF key points name their page', pdfKp.length >= 9 && pdfKp.every((k) => k.loc && k.loc.kind === 'page' && /^\d+$/.test(k.loc.value)), pdfKp.slice(0, 2));
  const pptxKp = materials.get(u.id, (await materials.addFile(u.id, await fx.build('pptx', fx.DOCS.tides), 'tides.pptx')).value.id, true).key_points;
  check('slide key points name their slide, and the speaker-notes cue lifts the slide\'s main point', pptxKp.every((k) => k.loc && k.loc.kind === 'slide') && pptxKp.some((k) => /gravitational pull/.test(k.text) && k.signals.includes('test_cue')), pptxKp.slice(0, 2));
  const nbKp = materials.get(u.id, (await materials.addFile(u.id, await fx.build('ipynb', fx.DOCS.tides), 'tides.ipynb')).value.id, true);
  check('a notebook keeps its code cell as code and its markdown cells as notes', /Code:\nhigh = 4\.5/.test(nbKp.text) && /Output: 3\.3/.test(nbKp.text) && nbKp.key_points.every((k) => k.loc && k.loc.kind === 'cell'), nbKp.key_points.slice(0, 1));
  const texKp = F.fromLatex(await fx.build('tex', fx.DOCS.tides));
  check('LaTeX: comments and the preamble are gone, sections become headings, a box environment becomes a callout', !/a comment that must not appear|documentclass/.test(texKp.text) && /^## Why the ocean/m.test(texKp.rich) && /^> Keypoint: /m.test(texKp.rich), texKp.rich.slice(0, 300));
  const doc97 = await materials.extract(await fx.build('doc', fx.DOCS.tides));
  check('legacy .doc: the piece table is read (no styles)', !doc97.error && doc97.kind === 'doc' && /Tides are caused mainly/.test(doc97.text), doc97.error);
  check('a .doc that is not Word says so', (await materials.extract(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(1200)]))).code === 'bad_type');

  console.log('coverage gate in the course builder');
  const tides = materials.get(u.id, md.id, true);
  const passages = cb.chunk(tides.text);
  const lazy = scripted('lazy');
  const built = await cb.build(u.id, md.id, { llm: lazy, force: true });
  check('a model that does not teach the stressed points leaves the course partial, with the points listed', built.course && built.course.status === 'partial' && built.course.uncovered_keypoints.length >= 1 && built.course.keypoint_coverage.share < 100, built.course && [built.course.status, built.course.keypoint_coverage]);
  check('one revision was tried, and told which points to teach', built.course && built.course.dropped.keypoint_revisions >= 1 && lazy.calls.some((c) => /already has these questions/.test(c.user) && /Points this material stresses/.test(c.user)), built.course && built.course.dropped);
  check('the first lesson prompt carries the stressed points with their weights and the rule', lazy.calls.filter((c) => c.task === 'material_lesson').some((c) => /- \[5\] Tides are caused mainly/.test(c.user) && /Teach every listed point/.test(c.system)));
  const fixes = scripted('fixes');
  const fixed = await cb.build(u.id, md.id, { llm: fixes, force: true });
  check('a model that misses a point and then teaches it when the revision names it gives a ready course', fixed.course && fixed.course.status === 'ready' && fixed.course.dropped.keypoint_revisions >= 1 && fixed.course.keypoint_coverage.share === 100, fixed.course && [fixed.course.status, fixed.course.keypoint_coverage, fixed.course.dropped]);
  const good = scripted('good');
  const ready = await cb.build(u.id, md.id, { llm: good, force: true });
  check('a model that teaches them gives a ready course with every stressed point covered', ready.course && ready.course.status === 'ready' && ready.course.keypoint_coverage.share === 100 && ready.course.uncovered_keypoints.length === 0, ready.course && [ready.course.status, ready.course.keypoint_coverage, ready.course.uncovered_keypoints.map((k) => k.text)]);
  check('and needs no revision call', ready.course && !(ready.course.dropped.keypoint_revisions) && !good.calls.some((c) => /already has these questions/.test(c.user)));
  const attachedOutline = [{ id: 'a', passage_ids: [passages[0].id] }];
  const kp2 = tides.key_points.filter((k) => k.weight >= 2).map((k) => ({ ...k, at: passages[1].start + 5 }));
  check('a stressed point whose passage was not planned from joins the nearest skill', passages.length >= 2 && cb.attachKeypoints(attachedOutline, passages, kp2) === 1 && attachedOutline[0].passage_ids.includes(passages[1].id), attachedOutline);

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll materials-formats checks passed');
  process.exit(failures ? 1 : 0);

  /** A scripted model: outline = one skill per passage; lessons teach the listed stressed points only in 'good' mode. */
  function scripted(mode) {
    const calls = [];
    let n = 0;
    const fn = async (args) => {
      calls.push(args);
      if (args.task === 'material_outline') {
        const ids = [...args.user.matchAll(/\[(p\d+)\]/g)].map((m) => m[1]);
        return { model: 'mock', data: { skills: [...new Set(ids)].map((id, i) => ({ id: `s${i + 1}`, title: `Part ${i + 1}`, summary: 'A part.', prerequisites: [], passage_ids: [id] })) } };
      }
      if (args.task === 'material_lesson') {
        const pid = /\[(p\d+)\]/.exec(args.user)[1];
        const text = (args.user.split(`[${pid}]\n`)[1] || '').split(/\n\[p\d+\]/)[0];
        const listed = [...args.user.matchAll(/^- \[(\d(?:\.\d)?)\] (.+)$/gm)].map((m) => m[2]);
        const q = () => { n++; const at = 40 + n * 70; return { type: 'multiple_choice', prompt: `Question ${n}?`, choices: ['one', 'two', 'three'], answer_index: 1, explanation: 'Because.', passage_id: pid, quote: text.slice(at, at + 60), tier: 1 }; };
        const paragraphs = mode === 'good' || (mode === 'fixes' && /already has these questions/.test(args.user)) ? ['A short lesson.', ...listed] : ['A short lesson.', 'Something general about the sea.'];
        return { model: 'mock', data: { lesson: { paragraphs, key_points: ['Key.'] }, questions: [q(), q(), q(), q(), q()] } };
      }
      if (args.task === 'material_verify') {
        const count = (args.user.match(/^\d+\./gm) || []).length;
        return { model: 'mock', data: { verdicts: Array.from({ length: count }, (_, i) => ({ n: i + 1, supported: true })) } };
      }
      return null;
    };
    fn.calls = calls;
    return fn;
  }
})().catch((err) => { console.error(err); process.exit(1); });
