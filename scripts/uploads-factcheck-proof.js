/**
 * The gate for "nothing invented" (AI-JUDGED, SIMULATED; never a real learner).
 *
 * One build per document and rep with the fact check on and the lesson as first written kept beside it (UPLOAD_FACTCHECK_KEEP_RAW), so before and after are the SAME course: the only
 * difference is what the checker removed. Judged: invented facts on both (the calibrated judge, docs/uploads-judge-calibration.json), and the exam answered from both. A same-versus-same control:
 * the exam is answered twice from the raw text, so the noise of the exam judge is measured on the same day.
 *
 *   node scripts/uploads-factcheck-proof.js docs            write NEW held-out documents (n1 to n4), the checker never saw them
 *   node scripts/uploads-factcheck-proof.js exam            exam from each source and the control from the source
 *   node scripts/uploads-factcheck-proof.js build <reps> [ids]    builds, judges and exams
 *   node scripts/uploads-factcheck-proof.js report
 * Rows: docs/uploads-factcheck-proof.json. Builder and checker: Gonka DeepSeek V4 Flash (the same family writes and checks, the harder case). Judges: see FACT_JUDGES / EXAM_JUDGES below.
 */
const fs = require('fs'); const os = require('os'); const path = require('path');
require('../services/run-cap').defaultCap(Number(process.env.RUN_CAP_USD || 5));
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
process.env.GONKA_PIPELINE = '1'; process.env.CORAL_PIPELINE = '1'; process.env.LYCEUM_PIPELINE = '1'; process.env.ZEROGPU_PIPELINE = '1';
for (const [k, f] of [['GONKA', 'gonka'], ['CORAL', 'coral'], ['LYCEUM', 'lyceum'], ['ZEROGPU', 'zerogpu']]) process.env[`${k}_LEDGER_FILE`] = process.env[`${k}_LEDGER_FILE`] || `${LIVE}${f}-ledger.json`;
process.env.NODE_ENV = 'test';
process.env.UPLOAD_FACTCHECK = process.env.UPLOAD_FACTCHECK || 'on';
process.env.UPLOAD_FACTCHECK_KEEP_RAW = '1';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-factproof-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
const db = require('../config/db');
const materials = require('../services/materials');
const K = require('../services/material-keypoints');
const cb = require('../services/course-builder');
const fx = require('./lib/upload-fixtures');
const J = require('./lib/invented-judges');

const OUT = process.env.FACT_OUT || path.join(__dirname, '..', 'docs', 'uploads-factcheck-proof.json');
const DOCS = path.join(__dirname, '..', 'docs', 'uploads-heldout-docs.json');
const NEW_DOCS = path.join(__dirname, '..', 'docs', 'uploads-factcheck-docs.json');
const FACT_JUDGES = (process.env.FACT_JUDGES || 'Z:sent,Z:free,C:free').split(',');
const EXAM_JUDGES = (process.env.EXAM_JUDGES || 'Z,N').split(',');
const load = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const save = (f, v) => fs.writeFileSync(f, JSON.stringify(v));
const words = (t) => (String(t).match(/\S+/g) || []).length;
const allDocs = () => [...load(DOCS, []), ...load(NEW_DOCS, [])];
const stripMarks = (t) => t.replace(/^\[\[[^\]]*\]\]\s*$/gm, '').replace(/^#+\s+/gm, '').replace(/\*\*|==/g, '').replace(/^>\s?/gm, '').replace(/\n{3,}/g, '\n\n').trim();

async function extracted(d) {
  const buf = await fx.build(d.fmt, { id: d.id, title: d.title, md: d.md, kps: [] });
  const ex = await materials.extract(buf);
  if (ex.error) throw new Error(`${d.id}: ${ex.error}`);
  return { rich: ex.rich || ex.text, plain: stripMarks(ex.rich || ex.text), text: ex.text, kind: ex.kind };
}

const NEW = [
  { id: 'n1', fam: 'N', fmt: 'docx', topic: 'antibiotic classes and how to choose one', style: 'dense revision notes: bullets of drug names, spectra, doses in mg, renal adjustments, contraindications, a bold "exam trap" line' },
  { id: 'n2', fam: 'N', fmt: 'pdf', topic: 'the invented rental law of the fictional Republic of Ostrava (its own article numbers, day counts, percentages and office names)', style: 'statute prose with invented specifics that cannot be known from general knowledge, one sentence marked "this will be on the test"' },
  { id: 'n3', fam: 'Z', fmt: 'md', topic: 'circular motion in physics with worked numbers', style: 'lecture handout with a formula, two worked examples with numbers and units, a "Remember:" line and a short summary' },
  { id: 'n4', fam: 'Z', fmt: 'html', topic: 'the French Revolution 1789 to 1794', style: 'plain narrative prose in a textbook voice with many dates and names and no emphasis at all' },
];
async function writeDocs() {
  const docs = load(NEW_DOCS, []);
  for (const sp of NEW) {
    if (docs.some((d) => d.id === sp.id)) continue;
    const d = await J.askJ(sp.fam, { system: 'You write ORIGINAL study documents for a test of a note-reading tool. Output Markdown only in the field. Keep it 500 to 700 words. Do not mention that it is a test.', user: `Topic: ${sp.topic}\nForm and voice: ${sp.style}`, schema: { type: 'object', properties: { title: { type: 'string' }, markdown: { type: 'string' } }, required: ['title', 'markdown'] }, schemaName: 'doc', maxTokens: 6000 });
    if (!d || !d.markdown || words(d.markdown) < 300) { console.log(`doc ${sp.id}: failed`); continue; }
    docs.push({ id: sp.id, fam: sp.fam, fmt: sp.fmt, topic: sp.topic, title: d.title, md: d.markdown });
    save(NEW_DOCS, docs); console.log(`doc ${sp.id}: ${words(d.markdown)} words`);
  }
}

const sentences = (plain) => (plain.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim()).filter((s) => words(s) >= 9 && words(s) <= 45);
async function examFor(src) {
  const kps = K.extract(src.rich, { plain: src.plain, spoken: false }).key_points;
  const emph = [...kps].filter((k) => k.weight >= 2.5).sort((a, b) => b.weight - a.weight).slice(0, 8).map((k) => ({ text: k.text, kind: 'emphasised', weight: k.weight }));
  const taken = kps.filter((k) => k.weight >= 1.8).map((k) => K.termSet(k.text));
  const plainPool = sentences(src.plain).filter((s) => !/\?/.test(s) && !taken.some((t) => { const u = K.termSet(s); let n = 0; for (const x of u) if (t.has(x)) n++; return u.size && n / u.size > 0.6; }));
  const step = Math.max(1, Math.floor(plainPool.length / 10));
  const pick = Array.from({ length: 10 }, (_, i) => plainPool[Math.min(plainPool.length - 1, i * step + 1)]).filter((s, i, a) => s && a.indexOf(s) === i);
  const items = [...emph, ...pick.map((t) => ({ text: t, kind: 'plain', weight: 1 }))];
  const out = [];
  await J.pool(items, 3, async (it) => {
    const r = await J.askJ('N', { system: 'Write one exam question that can be answered only from the given sentence (no outside knowledge, no mention of "the text"), and a short model answer.', user: `Sentence: ${it.text}`, schema: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } }, required: ['question', 'answer'] }, schemaName: 'exam_q', maxTokens: 2500 });
    if (r && r.question) out.push({ ...it, question: r.question, reference: r.answer });
  });
  return out;
}
async function answerFrom(fam, material, q) {
  const r = await J.askJ(fam, { system: 'You are a student with ONLY the study material below. Answer the question using nothing else. If the material does not contain what is needed, set found=false and leave the answer empty.', user: `Material:\n${material.slice(0, 60000)}\n\nQuestion: ${q.question}`, schema: { type: 'object', properties: { found: { type: 'boolean' }, answer: { type: 'string' } }, required: ['found', 'answer'] }, schemaName: 'exam_a', maxTokens: 2500 });
  if (!r) return null; if (!r.found || !r.answer) return false;
  const g = await J.askJ(fam, { system: 'You grade a student answer against a reference answer. correct=true only if it gives the same facts (wording may differ).', user: `Question: ${q.question}\nReference answer: ${q.reference}\nStudent answer: ${r.answer}`, schema: { type: 'object', properties: { correct: { type: 'boolean' } }, required: ['correct'] }, schemaName: 'exam_g', maxTokens: 2500 });
  return g ? !!g.correct : null;
}
const examRun = async (fam, text, exam) => { const out = new Array(exam.length).fill(null); await J.pool(exam.map((q, i) => ({ q, i })), 4, async ({ q, i }) => { out[i] = await answerFrom(fam, text, q); }); return out; };

const textOf = (c, raw) => c.skills.map((s) => {
  const l = raw && s.raw_lesson ? { paragraphs: s.raw_lesson.paragraphs, key_points: s.raw_lesson.key_points } : s.lesson;
  return [`## ${s.title}`, ...(l.paragraphs || []), ...(l.key_points || []).map((k) => `Key: ${k}`),
    ...(s.questions || []).map((q) => {
      const exp = raw && s.raw_lesson ? null : q.explanation;
      return `Q: ${q.prompt} A: ${q.type === 'short_answer' ? q.answer : (q.choices || [])[q.answer_index]}. ${exp == null ? (q.raw_explanation || q.explanation || '') : exp}`;
    })].join('\n');
}).join('\n\n');
const lessonOnly = (t) => t.split('\n').filter((l) => !l.startsWith('Q: ')).join('\n').replace(/^Key: /gm, '');
function builderLlm() {
  return async (a) => {
    const fam = a.task === 'material_factcheck_glm' ? 'Z' : a.task === 'material_factcheck_deepseek' ? 'M' : (a.task === 'material_factcheck' && process.env.FACT_CHECKER) || process.env.FACT_BUILDER || 'M';
    for (let i = 0; i < 4; i++) {
      try { const data = await J.call(fam, { system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: Math.max(a.maxTokens || 1500, 2500) }); return { data, model: fam === 'Z' ? 'GLM-5.3-Flash' : fam === 'M' ? 'DeepSeek-V4-Flash' : fam }; } catch (e) { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
    }
    return null;
  };
}

async function runExam() {
  const store = load(OUT, { exam: {}, control: {}, rows: [] });
  // Same exam as the rounds before for h1-h6.
  for (const d of allDocs()) {
    if (store.exam[d.id]) continue;
    const r2File = path.join(__dirname, '..', 'docs', 'uploads-heldout-r2', `uploads-heldout-results-${d.id}.json`);
    if (fs.existsSync(r2File)) { const a = JSON.parse(fs.readFileSync(r2File, 'utf8')); store.exam[d.id] = a.exam[d.id]; store.control[d.id] = a.control[d.id]; continue; }
    const src = await extracted(d);
    const exam = await examFor(src);
    store.exam[d.id] = exam; store.control[d.id] = {};
    for (const f of EXAM_JUDGES) store.control[d.id][f] = await examRun(f, src.plain, exam);
    save(OUT, store);
    console.log(`exam ${d.id}: ${exam.length} questions (${exam.filter((q) => q.kind === 'emphasised').length} emphasised); source control ${EXAM_JUDGES.map((f) => `${f} ${store.control[d.id][f].filter(Boolean).length}`).join(' ')}`);
  }
  save(OUT, store);
}

/** Check again the lessons as first written, from a finished run's rows (same course, new checker): the check is what changes, nothing else. Skills' question parts are left as they were. */
async function recheck(fromTag, toTag, checkerFam) {
  const store = load(OUT, { exam: {}, control: {}, rows: [] });
  const F = require('../services/material-factcheck');
  const froms = store.rows.filter((r) => r.tag === fromTag);
  await J.pool(froms, Number(process.env.FACT_CONC || 3), async (from) => {
    if (store.rows.some((r) => r.tag === toTag && r.doc === from.doc && r.rep === from.rep)) return;
    const d = allDocs().find((x) => x.id === from.doc);
    const src = await extracted(d);
    const idx = F.indexSource(src.plain);
    const askerOf = (fam) => async (a) => { for (let i = 0; i < 4; i++) { try { return { res: { data: await J.call(fam, { system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: Math.max(a.maxTokens, 2500) }) } }; } catch { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); } } return { res: null }; };
    const [fam1, fam2] = checkerFam.split('+');
    const asker = askerOf(fam1); const asker2 = fam2 ? askerOf(fam2) : null;
    const blocks = (process.env.RECHECK_FROM === 'checked' ? from.checked : from.raw).split(/\n\n(?=## )/);
    const stats = { sentences: 0, direct: 0, model_ok: 0, fixed: 0, dropped: 0, hard: 0, unchecked: 0, calls: 0 };
    const dropped = [];
    const out = new Array(blocks.length);
    await J.pool(blocks.map((b, i) => ({ b, i })), 4, async ({ b, i }) => {
      const lines = b.split('\n'); const head = lines[0];
      const paragraphs = lines.filter((l) => l && !/^(## |Key: |Q: )/.test(l));
      const keys = lines.filter((l) => l.startsWith('Key: ')).map((l) => l.slice(5));
      const qs = lines.filter((l) => l.startsWith('Q: '));
      const r = await F.checkLesson({ paragraphs, keyPoints: keys, idx, sourceText: src.plain, asker, asker2 });
      for (const k of Object.keys(stats)) stats[k] += Number(r.report[k]) || 0;
      dropped.push(...r.report.dropped);
      out[i] = [head, ...r.paragraphs, ...r.keyPoints.map((k) => `Key: ${k}`), ...qs].join('\n');
    });
    const row = { tag: toTag, doc: from.doc, fmt: from.fmt, rep: from.rep, status: from.status, skills: from.skills, source_words: from.source_words, stats, dropped, raw: from.raw, checked: out.join('\n\n'), raw_words: from.raw_words };
    row.checked_words = words(lessonOnly(row.checked));
    const exam = store.exam[d.id] || [];
    row.exam = { raw: from.exam.raw, raw2: from.exam.raw2, checked: {} };
    for (const f of EXAM_JUDGES) row.exam.checked[f] = await examRun(f, row.checked, exam);
    row.invented = { raw: from.invented.raw, checked: {} };
    for (const spec of FACT_JUDGES) { const [f, form] = spec.split(':'); row.invented.checked[spec] = await J.judge(f, form, src.plain, form === 'sent' ? lessonOnly(row.checked) : row.checked); }
    store.rows.push(row); save(OUT, store);
    console.log(`${d.id} ${toTag}: words ${from.raw_words}->${row.checked_words} direct ${stats.direct} ok ${stats.model_ok} fixed ${stats.fixed} dropped ${stats.dropped} hard ${stats.hard}; invented checked ${FACT_JUDGES.map((f) => (row.invented.checked[f] || []).length)}`);
  });
}

/** The fact sweep over finished courses' text (same code as the build, no model): the sentences go back in, and the exam and judges read the result. */
async function resweep(fromTag, toTag) {
  const store = load(OUT, { exam: {}, control: {}, rows: [] });
  const S = require('../services/material-stress'); const F = require('../services/material-factcheck');
  await J.pool(store.rows.filter((r) => r.tag === fromTag), 4, async (from) => {
    if (store.rows.some((r) => r.tag === toTag && r.doc === from.doc)) return;
    const d = allDocs().find((x) => x.id === from.doc);
    const src = await extracted(d);
    const passages = cb.chunk(src.text);
    const blocks = from.checked.split(/\n\n(?=## )/);
    const skills = blocks.map((b) => { const lines = b.split('\n'); return { source: 'material', passage_ids: passages.map((p) => p.id), lesson: { paragraphs: lines.filter((l) => l && !/^(## |Key: |Q: )/.test(l)), key_points: lines.filter((l) => l.startsWith('Key: ')).map((l) => l.slice(5)) }, head: lines[0], qs: lines.filter((l) => l.startsWith('Q: ')) }; });
    const srcWords = passages.reduce((n, p) => n + words(p.text), 0);
    const added = S.sweepFacts({ skills, passages, sentencesOf: F.sentencesOf, linesOf: F.logicalLines, capWords: Math.round(srcWords * 0.5) });
    const row = { ...from, tag: toTag, added, checked: skills.map((s) => [s.head, ...s.lesson.paragraphs, ...s.lesson.key_points.map((k) => `Key: ${k}`), ...s.qs].join('\n')).join('\n\n') };
    row.checked_words = words(lessonOnly(row.checked));
    row.exam = { raw: from.exam.raw, raw2: from.exam.raw2, checked: {} };
    const exam = store.exam[d.id] || [];
    for (const f of EXAM_JUDGES) row.exam.checked[f] = await examRun(f, row.checked, exam);
    row.invented = { raw: from.invented.raw, checked: {} };
    for (const spec of FACT_JUDGES) { const [f, form] = spec.split(':'); row.invented.checked[spec] = await J.judge(f, form, src.plain, form === 'sent' ? lessonOnly(row.checked) : row.checked); }
    store.rows.push(row); save(OUT, store);
    console.log(`${d.id} ${toTag}: +${added} sentences, words ${from.checked_words}->${row.checked_words}; invented ${FACT_JUDGES.map((f) => (row.invented.checked[f] || []).length)}`);
  });
}

/** Answer the exam for rows that were built before their exam existed. */
async function reexam() {
  const store = load(OUT, { exam: {}, control: {}, rows: [] });
  const finals = load(path.join(__dirname, '..', 'docs', 'uploads-factcheck-proof-final.json'), { exam: {} });
  for (const k of Object.keys(finals.exam)) if (!store.exam[k] || !store.exam[k].length) store.exam[k] = finals.exam[k];
  await J.pool(store.rows.filter((r) => r.tag === (process.env.FACT_TAG || 'base')), 4, async (r) => {
    const exam = store.exam[r.doc] || [];
    // The exam reads the whole course: an earlier cap of 20,000 characters cut off the end of the longer ones.
    for (const f of EXAM_JUDGES) {
      if (process.env.REEXAM_ARM === 'checked') r.exam.checked[f] = await examRun(f, r.checked, exam);
      else { r.exam.raw[f] = await examRun(f, r.raw, exam); r.exam.raw2[f] = r.exam.raw[f]; if (process.env.FACT_TAG === 'base') r.exam.checked[f] = r.exam.raw[f]; }
    }
    console.log(`${r.doc}: ${EXAM_JUDGES.map((f) => `${f} ${(r.exam[process.env.REEXAM_ARM === 'checked' ? 'checked' : 'raw'][f] || []).filter(Boolean).length}/${exam.length}`).join(' ')}`);
  });
  save(OUT, store);
}

async function runBuilds(reps, ids) {
  const store = load(OUT, { exam: {}, control: {}, rows: [] });
  const u = db.insert('users', { email: 'factproof@example.test', display_name: 'Factproof', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  const docs = allDocs().filter((d) => !ids.length || ids.includes(d.id));
  for (const d of docs) { const r2File = path.join(__dirname, '..', 'docs', 'uploads-heldout-r2', `uploads-heldout-results-${d.id}.json`); if (!store.exam[d.id] && fs.existsSync(r2File)) { const a = JSON.parse(fs.readFileSync(r2File, 'utf8')); store.exam[d.id] = a.exam[d.id]; store.control[d.id] = a.control[d.id]; } }
  const jobs = [];
  for (const d of docs) for (let rep = 1; rep <= reps; rep++) if (!store.rows.some((r) => r.doc === d.id && r.rep === rep && r.tag === (process.env.FACT_TAG || 'v1'))) jobs.push({ d, rep });
  console.log(`${jobs.length} builds`);
  await J.pool(jobs, Number(process.env.FACT_CONC || 3), async ({ d, rep }) => {
    const t0 = Date.now();
    const src = await extracted(d);
    const add = materials.addFile(u.id, await fx.build(d.fmt, { id: d.id, title: d.title, md: d.md, kps: [] }), `${d.id}.${d.fmt}`);
    const got = await add;
    if (got.error) { console.log(`${d.id}: ${got.error}`); return; }
    const built = await cb.build(u.id, got.value.id, { llm: builderLlm(), force: true, factcheck: true, split: process.env.UPLOAD_LESSON_SPLIT !== 'off' });
    if (!built.course) { console.log(`${d.id} r${rep}: build failed ${built.error}`); return; }
    const c = built.course;
    // raw explanations: stored in raw_lesson by index before verification; only used for the raw arm's text
    const row = { tag: process.env.FACT_TAG || 'v1', doc: d.id, fmt: d.fmt, rep, status: c.status, skills: c.skills.length, build_s: Math.round((Date.now() - t0) / 1000), source_words: words(src.plain), stats: c.dropped.factcheck, fact_explanations: c.dropped.fact_explanations || 0, dropped: c.skills.flatMap((s) => (s.factcheck && s.factcheck.dropped) || []), keypoint_coverage: c.keypoint_coverage };
    row.raw = textOf(c, true); row.checked = textOf(c, false);
    row.raw_words = words(lessonOnly(row.raw)); row.checked_words = words(lessonOnly(row.checked));
    const exam = store.exam[d.id] || [];
    row.exam = { raw: {}, raw2: {}, checked: {} };
    for (const f of EXAM_JUDGES) {
      const [a, b, cc] = await Promise.all([examRun(f, row.raw, exam), examRun(f, row.raw, exam), examRun(f, row.checked, exam)]);
      row.exam.raw[f] = a; row.exam.raw2[f] = b; row.exam.checked[f] = cc;
    }
    row.invented = { raw: {}, checked: {} };
    for (const spec of FACT_JUDGES) {
      const [f, form] = spec.split(':');
      // The dearer judge reads only the checked text.
      const [a, b] = await Promise.all([f === 'K' ? null : J.judge(f, form, src.plain, form === 'sent' ? lessonOnly(row.raw) : row.raw), J.judge(f, form, src.plain, form === 'sent' ? lessonOnly(row.checked) : row.checked)]);
      row.invented.raw[spec] = a; row.invented.checked[spec] = b;
    }
    row.spend = JSON.parse(JSON.stringify(J.spend));
    store.rows.push(row); save(OUT, store);
    console.log(`${d.id} r${rep} ${c.status} ${c.skills.length} skills ${row.build_s}s; words ${row.raw_words}->${row.checked_words}; direct ${row.stats && row.stats.direct} model ${row.stats && row.stats.model_ok} fixed ${row.stats && row.stats.fixed} dropped ${row.stats && row.stats.dropped}; invented raw ${FACT_JUDGES.map((f) => (row.invented.raw[f] || []).length)} checked ${FACT_JUDGES.map((f) => (row.invented.checked[f] || []).length)}`);
  });
}

function report() {
  const store = load(OUT, { exam: {}, control: {}, rows: [] });
  const tag = process.env.FACT_TAG || 'v1';
  const rows = store.rows.filter((r) => r.tag === tag);
  const share = (arr) => { const v = arr.filter((x) => x !== null && x !== undefined); return v.length ? v.filter(Boolean).length / v.length : null; };
  const pct = (x) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`);
  const part = (r, arm, f, kind) => { const ex = store.exam[r.doc] || []; const a = (r.exam[arm] || {})[f] || []; return ex.map((q, i) => (kind === 'all' || q.kind === kind ? a[i] : undefined)); };
  for (const d of [...new Set(rows.map((r) => r.doc))]) {
    for (const r of rows.filter((x) => x.doc === d)) {
      const cols = EXAM_JUDGES.flatMap((f) => ['emphasised', 'plain'].map((k) => `${f}/${k[0]} ${pct(share(part(r, 'raw', f, k)))}->${pct(share(part(r, 'checked', f, k)))} (same ${pct(share(part(r, 'raw2', f, k)))})`));
      console.log(`${d} r${r.rep} ${r.status}; words ${r.raw_words}->${r.checked_words}; inv ${FACT_JUDGES.map((f) => `${f} ${(r.invented.raw[f] || []).length}/${(r.invented.checked[f] || []).length}`).join(' ')}; ${cols.join(' | ').replace(/emphasised/g, 'e')}`);
    }
  }
  for (const f of EXAM_JUDGES) for (const k of ['emphasised', 'plain', 'all']) {
    const col = (arm) => rows.flatMap((r) => part(r, arm, f, k));
    console.log(`${f} ${k}: raw ${pct(share(col('raw')))} checked ${pct(share(col('checked')))} same-vs-same ${pct(share(col('raw2')))}`);
  }
  for (const f of FACT_JUDGES) console.log(`invented per course ${f}: raw ${(rows.reduce((n, r) => n + (r.invented.raw[f] || []).length, 0) / rows.length).toFixed(2)} checked ${(rows.reduce((n, r) => n + (r.invented.checked[f] || []).length, 0) / rows.length).toFixed(2)}; courses with none after ${rows.filter((r) => !(r.invented.checked[f] || []).length).length}/${rows.length}`);
}

process.on('exit', () => { if (Object.keys(J.spend).length) console.log('spend', JSON.stringify(J.spend)); });
(async () => {
  const cmd = process.argv[2];
  if (cmd === 'docs') await writeDocs();
  else if (cmd === 'exam') await runExam();
  else if (cmd === 'build') await runBuilds(Number(process.argv[3] || 1), (process.argv[4] || '').split(',').filter(Boolean));
  else if (cmd === 'reexam') await reexam();
  else if (cmd === 'resweep') await resweep(process.argv[3], process.argv[4]);
  else if (cmd === 'recheck') { await recheck(process.argv[3], process.argv[4], process.argv[5] || 'Z'); console.log('spend', JSON.stringify(J.spend)); }
  else { report(); console.log('spend', JSON.stringify(J.spend)); }
})().catch((e) => { console.error(e); process.exit(1); });
