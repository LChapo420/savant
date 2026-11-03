/**
 * The proof behind docs/UPLOADS-ANY-FORMAT.md. NOT part of `npm test` (it uses real OCR, a real speech model and free models);
 * the deterministic parts of it are scripts/materials-formats-test.js.
 *
 *   node scripts/uploads-proof.js matrix            extraction per format with the REAL engines (measured, local, $0)
 *   node scripts/uploads-proof.js blind             a document written by a free model, planted points hidden from the extractor
 *   node scripts/uploads-proof.js course [docs]     course built from each document by a free model: coverage, an exam answered
 *                                                   from the source and from the generated material, reading time (AI-judged)
 *   node scripts/uploads-proof.js all
 *
 * Labels used everywhere: MEASURED (a real engine on a fixture, deterministic scoring), AI-JUDGED (a free model judged), SIMULATED
 * (a model played the learner). No row is a real learner's result.
 *
 * Free judges only: xKiro's $0 MiniMax M3.1 Flash (pipeline use, synthetic text only: nothing here is learner data). Modelflare, the
 * Anthropic key and Standard Compute are never called. Real OCR needs tesseract.js on the module path (NODE_PATH); the real
 * transcriber needs @huggingface/transformers and the Whisper model (WHISPER_MODEL_DIR); a missing engine is reported, not faked.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

require('dotenv').config({ path: process.env.ENV_FILE || 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
process.env.XKIRO_PIPELINE = '1';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-proof-${process.pid}.json`);
if (!process.env.XKIRO_USAGE_FILE) process.env.XKIRO_USAGE_FILE = path.join(os.tmpdir(), 'uploads-proof-xkiro-usage.json');
process.env.WHISPER_MODEL_DIR = process.env.WHISPER_MODEL_DIR || 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/models';

const db = require('../config/db');
const materials = require('../services/materials');
const K = require('../services/material-keypoints');
const cb = require('../services/course-builder');
const audio = require('../services/material-audio');
const video = require('../services/material-video');
const fx = require('./lib/upload-fixtures');
const S = require('./lib/upload-score');

const OUT = path.join(__dirname, '..', 'docs', 'uploads-proof-results.json');
const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => fs.writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
const log = (...a) => console.log(...a);
const WPM = 230;

// ── free model plumbing ───────────────────────────────────────────────────────────────────────────────
// NVIDIA's free tier first, then xKiro's $0 models (MiniMax M3.1 Flash first). Synthetic text only: nothing here is learner data.
const used = {};
async function callModel({ system, user, schema, schemaName, maxTokens, timeoutMs }) {
  const nv = require('../services/providers/nvidia');
  if (process.env.NVIDIA_API_KEY && !process.env.PROOF_NO_NVIDIA) {
    try {
      const r = await nv.structured({ role: 'fast', task: 'uploads_proof', system, user, schema, schemaName, maxTokens: Math.max(maxTokens || 1500, 2500), timeoutMs: timeoutMs || 240000 });
      if (r && r.data) { used[r.model || 'nvidia'] = (used[r.model || 'nvidia'] || 0) + 1; return r; }
    } catch { /* fall through to xKiro */ }
  }
  const r = await require('../services/providers/xkiro').xkiro.structured({ system, user, schema, schemaName, maxTokens, reasoningEffort: 'low', timeoutMs: timeoutMs || 240000 });
  used[r.model || 'xkiro'] = (used[r.model || 'xkiro'] || 0) + 1;
  return r;
}
async function ask(system, user, schema, name, maxTokens = 1500) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return (await callModel({ system, user, schema, schemaName: name, maxTokens })).data; } catch (err) {
      if (err.daily) throw err;
      await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
    }
  }
  return null;
}
/** The course builder's model hook (same shape as ai.structuredDetail), on the free models. */
function courseLlm() {
  const calls = { n: 0 };
  const fn = async (args) => {
    calls.n++;
    const r = await callModel({ system: args.system, user: args.user, schema: args.schema, schemaName: args.schemaName, maxTokens: args.maxTokens, timeoutMs: 300000 });
    return { data: r.data, model: r.model };
  };
  fn.calls = calls;
  return fn;
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

// ── matrix: real engines ──────────────────────────────────────────────────────────────────────────────
function haveTesseract() { try { require.resolve('tesseract.js'); return true; } catch { return false; } }

async function rowFor(label, buf, doc, subset, extra = {}) {
  const t0 = Date.now();
  const out = await materials.extract(buf);
  const ms = Date.now() - t0;
  if (out.error) return { label, supported: false, code: out.code, reason: out.error.slice(0, 140), ms };
  const target = subset || doc.kps;
  const tr = S.textRecall(target, out.text);
  const ex = K.extract(out.rich, { plain: out.text, spoken: extra.spoken });
  const ks = S.keypointScore(target, ex.key_points);
  return { label, supported: true, kind: out.kind, ms, chars: out.text.length, text_recall: round(tr.recall), keypoint_recall: round(ks.recall), stressed_recall: round(ks.recallStressed), rank_corr: ks.rho == null ? null : round(ks.rho), extracted: ks.extracted, cost_usd: 0, ...extra };
}
const round = (n) => Math.round(n * 1000) / 1000;

async function matrix() {
  const rows = [];
  for (const docId of ['tides', 'vaccines']) {
    const doc = fx.DOCS[docId];
    for (const fmt of fx.FORMAT_LIST) { const r = await rowFor(fmt, await fx.build(fmt, doc), doc); r.doc = docId; rows.push(r); }
  }
  const srt = await rowFor('srt', await fx.build('srt', fx.DOCS.tides), { kps: fx.LECTURE_KPS }, null, { spoken: true }); srt.doc = 'lecture';
  const vtt = await rowFor('vtt', await fx.build('vtt', fx.DOCS.tides), { kps: fx.LECTURE_KPS }, null, { spoken: true }); vtt.doc = 'lecture';
  rows.push(srt, vtt);

  if (haveTesseract()) {
    const doc = fx.DOCS.tides;
    const ids = doc.kps.filter((k) => k.level >= 3).map((k) => k.id);
    const sub = doc.kps.filter((k) => ids.includes(k.id));
    const pics = [
      ['png (clean render)', () => fx.picture(doc, 'png', {})],
      ['png (screenshot, small type)', () => fx.picture(doc, 'png', { size: 22, width: 100 })],
      ['jpeg (tilted, shaded, blurred photo of notes)', () => fx.picture(doc, 'jpeg', { photo: { angle: 1.5, blur: 0.8 }, quality: 70 })],
      ['png (whiteboard: marker font, blue ink, tilt)', () => fx.picture(doc, 'png', { font: 'Comic Sans MS', ink: '#1b3fa0', bg: '#f4f4f0', size: 40, photo: { angle: -1, blur: 1.0 } })],
      ['png (handwriting font, tilt)', () => fx.picture(doc, 'png', { font: 'Ink Free', size: 44, photo: { angle: 0.8, blur: 0.6 } })],
      ['webp', () => fx.picture(doc, 'webp', {})], ['gif', () => fx.picture(doc, 'gif', {})], ['bmp', () => fx.picture(doc, 'bmp', {})], ['tiff', () => fx.picture(doc, 'tiff', {})],
    ];
    for (const [label, mk] of pics) { const r = await rowFor(label, await mk(), doc, sub, { engine: 'tesseract.js (local)' }); r.doc = 'tides (7 points on the card)'; rows.push(r); }
    const scan = await rowFor('pdf (scanned, 2 page pictures)', await fx.build('pdf-scan', doc), doc, null, { engine: 'tesseract.js (local)' }); scan.doc = 'tides'; rows.push(scan);
    const zip = await rowFor('zip (md + docx + csv + png + exe)', await fx.zipMixed(doc), doc, null, { engine: 'tesseract.js (local)' }); zip.doc = 'tides'; rows.push(zip);
  } else log('tesseract.js not on the module path: picture rows skipped (set NODE_PATH)');

  if (process.platform === 'win32' && audio.availability().ready) rows.push(...await audioRows());
  else log('no SAPI voice or no Whisper model: audio rows skipped');
  results.matrix = { when: new Date().toISOString().slice(0, 10), label: 'MEASURED (real engines, synthetic fixtures)', rows };
  save();
  for (const r of rows) log(`${(r.doc || '').padEnd(8)} ${r.label.padEnd(46)} ${r.supported ? `text ${S.pct(r.text_recall)} kp ${S.pct(r.keypoint_recall)} stressed ${S.pct(r.stressed_recall)} rho ${S.r2(r.rank_corr)} ${r.ms}ms` : `NOT SUPPORTED ${r.code}`}`);
}

async function audioRows() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-audio-'));
  const txt = path.join(dir, 'lecture.txt'); const wav = path.join(dir, 'lecture.wav');
  fs.writeFileSync(txt, fx.LECTURE.map((l) => l.say).join(' '));
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wav}'); $s.Speak((Get-Content '${txt}' -Raw)); $s.Dispose()`], { stdio: 'ignore' });
  } catch { log('text-to-speech failed: audio rows skipped'); return []; }
  const ff = video.ffmpegPath();
  const enc = (name, args) => { execFileSync(ff, ['-y', '-loglevel', 'error', '-i', wav, ...args, path.join(dir, name)]); return path.join(dir, name); };
  const files = { wav, mp3: enc('l.mp3', ['-c:a', 'libmp3lame', '-b:a', '64k']), m4a: enc('l.m4a', ['-c:a', 'aac', '-b:a', '64k']), webm: enc('l.webm', ['-c:a', 'libopus', '-b:a', '32k']) };
  execFileSync(ff, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=5', '-i', wav, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', path.join(dir, 'l.mp4')]);
  files.mp4 = path.join(dir, 'l.mp4');
  const tf = await import('@huggingface/transformers'); // eslint-disable-line import/no-unresolved
  tf.env.allowRemoteModels = false; tf.env.localModelPath = process.env.WHISPER_MODEL_DIR;
  const asr = await tf.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  const rows = [];
  for (const [name, mode] of [['wav', 'old'], ['wav', 'new'], ['mp3', 'new'], ['m4a', 'new'], ['webm', 'new'], ['mp4', 'new']]) {
    const buf = fs.readFileSync(files[name]); const t0 = Date.now();
    let dec;
    if (name === 'mp4') { const o = path.join(dir, 'v.webm'); const x = await video.extractAudio(files.mp4, o); if (x.error) { rows.push({ label: `${name} (video)`, supported: false, reason: x.error }); continue; } dec = await audio.decode(fs.readFileSync(o), 'webm'); } else dec = await audio.decode(buf, audio.sniffAudio(buf));
    if (dec.error) { rows.push({ label: name, supported: false, reason: dec.error }); continue; }
    const lines = [];
    for (const p of audio.chunk(dec.samples)) {
      const out = await asr(p.samples, mode === 'new' ? { return_timestamps: true } : {});
      const t = String((out && out.text) || '').replace(/\s+/g, ' ').trim();
      if (t) lines.push(`[${audio.stamp(p.start)}] ${t}`);
    }
    const text = lines.join('\n'); const ms = Date.now() - t0;
    const tr = S.textRecall(fx.LECTURE_KPS, text); const ks = S.keypointScore(fx.LECTURE_KPS, K.extract(text, { plain: text, spoken: true }).key_points);
    rows.push({ doc: 'lecture', label: `${name === 'mp4' ? 'mp4 (video)' : name} via whisper-tiny.en${mode === 'old' ? ' (BEFORE: no segment timestamps)' : ''}`, supported: true, seconds_of_speech: Math.round(dec.samples.length / 16000), ms, text_recall: round(tr.recall), keypoint_recall: round(ks.recall), stressed_recall: round(ks.recallStressed), rank_corr: ks.rho == null ? null : round(ks.rho), engine: 'whisper-tiny.en (local CPU)', cost_usd: 0 });
  }
  return rows;
}

// ── blind document written by a free model ────────────────────────────────────────────────────────────
const BLIND_TOPICS = ['how a bill becomes law in a two-chamber legislature', 'the basics of compound interest and the rule of 72', 'how the heart pumps blood through the body'];

async function blindDoc(topic, idx) {
  const schema = { type: 'object', properties: { title: { type: 'string' }, markdown: { type: 'string' }, key_points: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, level: { type: 'integer' }, device: { type: 'string' } }, required: ['text', 'level', 'device'] } } }, required: ['title', 'markdown', 'key_points'] };
  const d = await ask('You write original study handouts for a test of a note-reading tool. Write about 650 words of Markdown on the topic, as a real instructor would hand out: headings, paragraphs, a few bullet lists, and your own mix of emphasis devices (bold, blockquote boxes, a summary, repeating a point, "remember"-style reminders, an exercises section whose questions use some of the facts). Choose for yourself what to stress and how. Then list 10 to 12 key points: each is ONE sentence copied word for word from your markdown (ignore bold marks), with level 1 to 5 for how strongly YOUR handout stresses it (1 = stated once, plain; 5 = stressed several ways) and device = how. Include at least three level-1 points and at least two level-5 points.', `Topic: ${topic}`, schema, 'handout', 6000);
  if (!d || !d.markdown) return null;
  const plain = d.markdown.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
  const kps = d.key_points.filter((k) => k.text && plain.includes(k.text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim())).map((k, i) => ({ id: `b${idx}_${i + 1}`, level: Math.max(1, Math.min(5, k.level)), text: k.text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(), device: k.device }));
  return { id: `blind${idx}`, title: d.title, md: d.markdown, kps, heldOut: true, blind: true };
}

async function blind() {
  const rows = [];
  const docs = [];
  for (let i = 0; i < BLIND_TOPICS.length; i++) {
    const d = await blindDoc(BLIND_TOPICS[i], i + 1);
    if (!d || d.kps.length < 6) { log(`blind ${i + 1}: the model gave too few verbatim points; skipped`); continue; }
    docs.push(d);
    const plainOnly = Buffer.from(fx.stripMd(d.md).replace(/^#+\s+/gm, ''), 'utf8');
    for (const [label, buf] of [['markdown', Buffer.from(d.md, 'utf8')], ['docx', await fx.build('docx', d)], ['pdf', await fx.build('pdf', d)], ['same text with the formatting removed', plainOnly]]) {
      const r = await rowFor(label, buf, d); r.doc = d.id; r.planted = d.kps.length; rows.push(r);
      log(`${d.id} ${label.padEnd(40)} planted ${d.kps.length} text ${S.pct(r.text_recall)} kp ${S.pct(r.keypoint_recall)} stressed ${S.pct(r.stressed_recall)} rho ${S.r2(r.rank_corr)}`);
    }
  }
  results.blind = { when: new Date().toISOString().slice(0, 10), label: 'MEASURED on documents written by a free model (AI-authored, planted points and levels are the model\'s)', rows };
  results.blind_docs = docs.map((d) => ({ id: d.id, title: d.title, md: d.md, kps: d.kps }));
  save();
  return docs;
}

// ── course: coverage, exam, reading time ──────────────────────────────────────────────────────────────
function generatedText(course) {
  return course.skills.map((s) => [`## ${s.title}`, ...(s.lesson.paragraphs || []), ...(s.lesson.key_points || []).map((k) => `Key: ${k}`),
    ...(s.questions || []).map((q) => `Q: ${q.prompt} A: ${q.type === 'short_answer' ? q.answer : (q.choices || [])[q.answer_index]}. ${q.explanation || ''}`)].join('\n')).join('\n\n');
}
const words = (t) => (String(t).match(/\S+/g) || []).length;

async function judgeStated(material, kp) {
  const r = await ask('You check whether study material states a given point. Say stated=true only if the material says it (or clearly the same thing) in its own words, with the facts intact.', `Point: ${kp.text}\n\nMaterial:\n${material.slice(0, 14000)}`, { type: 'object', properties: { stated: { type: 'boolean' } }, required: ['stated'] }, 'stated', 300);
  return !!(r && r.stated);
}
async function examQ(kp) {
  const r = await ask('Write one exam question that can be answered only from the given sentence (no outside knowledge), and a short model answer.', `Sentence: ${kp.text}`, { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } }, required: ['question', 'answer'] }, 'exam_item', 400);
  return r && r.question ? { ...kp, question: r.question, reference: r.answer } : null;
}
async function answerFrom(material, q) {
  const r = await ask('You are a student with ONLY the study material below. Answer the question using nothing else. If the material does not contain what is needed, set found=false and leave the answer empty.', `Material:\n${material.slice(0, 16000)}\n\nQuestion: ${q.question}`, { type: 'object', properties: { found: { type: 'boolean' }, answer: { type: 'string' } }, required: ['found', 'answer'] }, 'answer', 400);
  if (!r || !r.found || !r.answer) return false;
  const g = await ask('You grade a student answer against a reference answer. correct=true only if it gives the same facts (wording may differ).', `Question: ${q.question}\nReference answer: ${q.reference}\nStudent answer: ${r.answer}`, { type: 'object', properties: { correct: { type: 'boolean' } }, required: ['correct'] }, 'grade', 200);
  return !!(g && g.correct);
}

async function courseFor(doc, userId, withKeypoints, llm) {
  const m = materials.addPaste(userId, `${doc.title}${withKeypoints ? '' : ' (control)'}`, doc.md);
  if (m.error) throw new Error(m.error);
  const row = db.byId('materials', m.value.id);
  if (!withKeypoints) db.update('materials', row.id, { key_points: [] });
  const t0 = Date.now();
  const built = await cb.build(userId, m.value.id, { llm, force: true });
  if (!built.course) return { error: built.error, ms: Date.now() - t0 };
  return { course: built.course, ms: Date.now() - t0, material: db.byId('materials', row.id) };
}

async function courseProof(docs) {
  const u = db.insert('users', { email: 'proof@test.local', name: 'Proof' });
  const llm = courseLlm();
  const rows = [];
  for (const doc of docs) {
    log(`course: ${doc.id} (${doc.kps.length} planted points)`);
    const examPoints = doc.kps.length > 8 ? [...doc.kps].sort((a, b) => b.level - a.level).filter((_, i, a) => i < 5 || i % 2 === 0).slice(0, 8) : doc.kps;
    const exam = (await pool(examPoints, 3, examQ)).filter(Boolean);
    const control = await pool(exam, 3, (q) => answerFrom(doc.md, q));
    const sourceShare = control.filter(Boolean).length / exam.length;
    for (const withKp of [false, true]) {
      const r = await courseFor(doc, u.id, withKp, llm);
      if (r.error) { rows.push({ doc: doc.id, keypoints: withKp, error: r.error }); log(`  ${withKp ? 'gate on ' : 'gate off'} build failed: ${r.error}`); continue; }
      const gen = generatedText(r.course);
      const lex = doc.kps.map((k) => K.coverage([{ ...k, weight: 5 }], r.course.skills.map((s) => cb.skillBundle(s)), { need: 0.65 }).uncovered.length === 0);
      const judged = await pool(doc.kps, 3, (k) => judgeStated(gen, k));
      const answered = await pool(exam, 3, (q) => answerFrom(gen, q));
      const weightSum = (xs) => xs.reduce((a, k, i) => a + (xs[i] ? 0 : 0), 0);
      void weightSum;
      const wTotal = exam.reduce((a, q) => a + q.level, 0);
      const wGen = exam.reduce((a, q, i) => a + (answered[i] ? q.level : 0), 0);
      const wSrc = exam.reduce((a, q, i) => a + (control[i] ? q.level : 0), 0);
      const hi = exam.map((q, i) => [q, i]).filter(([q]) => q.level >= 4);
      const row = {
        doc: doc.id, gate_and_stress_prompt: withKp, status: r.course.status, skills: r.course.skills.length, build_seconds: Math.round(r.ms / 1000),
        key_points_found_in_source: r.material.key_points.length,
        keypoint_gate: r.course.keypoint_coverage, revisions: r.course.dropped.keypoint_revisions || 0,
        planted_points_taught_lexical: round(lex.filter(Boolean).length / lex.length),
        planted_points_taught_judged: round(judged.filter(Boolean).length / judged.length),
        planted_points_taught_judged_level4plus: round(doc.kps.map((k, i) => [k, i]).filter(([k]) => k.level >= 4).filter(([, i]) => judged[i]).length / Math.max(1, doc.kps.filter((k) => k.level >= 4).length)),
        exam_questions: exam.length,
        exam_answerable_from_source: round(sourceShare), exam_answerable_from_generated: round(answered.filter(Boolean).length / exam.length),
        exam_weighted_by_emphasis_source: round(wSrc / wTotal), exam_weighted_by_emphasis_generated: round(wGen / wTotal),
        exam_level4plus_generated: round(hi.filter(([, i]) => answered[i]).length / Math.max(1, hi.length)),
        source_words: words(doc.md), generated_words: words(gen), generated_lesson_words: words(r.course.skills.flatMap((s) => [...s.lesson.paragraphs, ...(s.lesson.key_points || [])]).join(' ')),
        study_minutes_source: round(words(doc.md) / WPM), study_minutes_generated: round(words(r.course.skills.flatMap((s) => [...s.lesson.paragraphs, ...(s.lesson.key_points || [])]).join(' ')) / WPM),
      };
      rows.push(row);
      log(`  ${withKp ? 'gate on ' : 'gate off'} ${row.status} skills ${row.skills} taught(judged) ${S.pct(row.planted_points_taught_judged)} L4+ ${S.pct(row.planted_points_taught_judged_level4plus)} exam gen ${S.pct(row.exam_answerable_from_generated)} src ${S.pct(row.exam_answerable_from_source)} weighted gen ${S.pct(row.exam_weighted_by_emphasis_generated)} words ${row.source_words}->${row.generated_lesson_words}`);
    }
  }
  const arm = process.env.PROOF_ARM || 'default';
  results.course_runs = results.course_runs || {};
  results.course_runs[arm] = { when: new Date().toISOString().slice(0, 10), label: 'AI-JUDGED and SIMULATED (a free model wrote the course, wrote the exam, answered it from the material and graded it; not real learners)', models_used: used, rows, model_calls_for_builds: llm.calls.n };
  delete results.course;
  save();
}

(async () => {
  const mode = process.argv[2] || 'all';
  const which = process.argv.slice(3);
  if (mode === 'matrix' || mode === 'all') await matrix();
  let docs = [];
  if (mode === 'blind' || mode === 'all') docs = await blind();
  if (mode === 'course' || mode === 'all') {
    const base = [fx.DOCS.tides, fx.DOCS.vaccines];
    const pick = which.length ? base.filter((d) => which.includes(d.id)) : base;
    const blindDocs = docs.length ? docs : (results.blind_docs || []);
    await courseProof([...pick, ...(which.length ? blindDocs.filter((d) => which.includes(d.id)) : blindDocs.slice(0, 1))]);
  }
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
