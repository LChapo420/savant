/**
 * Bigger uploads proof (AI-JUDGED, SIMULATED): 10 documents across formats (planted and AI-authored handouts, public-domain and open-licence real files),
 * repeated course builds, an exam written from the SOURCE (emphasised points and plain facts separately), answered from the source and from the
 * generated course by two judge families. Reports coverage of emphasised and plain points and how much shorter the lessons are.
 *   node scripts/uploads-proof-big.js <arm> <reps> [docIds...]      arm label is free text ("before", "after")
 * Models: builder = Gonka DeepSeek V4 Flash (family M, paid from the $50 Gonka ledger), judge A = Gonka GLM 5.3 Flash (family Z), judge B and exam writer = NVIDIA free nemotron. No learner data.
 */
const fs = require('fs'); const os = require('os'); const path = require('path');
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
process.env.XKIRO_PIPELINE = '1'; process.env.GONKA_PIPELINE = '1'; process.env.GONKA_LEDGER_FILE = process.env.GONKA_LEDGER_FILE || 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/gonka-ledger.json';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-big-${process.pid}.json`);
process.env.XKIRO_USAGE_FILE = process.env.XKIRO_USAGE_FILE || path.join(os.tmpdir(), 'uploads-big-xkiro-usage.json');
const db = require('../config/db');
const materials = require('../services/materials');
const K = require('../services/material-keypoints');
const cb = require('../services/course-builder');
const fx = require('./lib/upload-fixtures');
const IN = 'C:/coding/savant-wt/_proof-inputs';
const OUT = path.join(__dirname, '..', 'docs', 'uploads-proof-big-results.json');
const CACHE = path.join(__dirname, '..', 'docs', 'uploads-proof-big-exam.json');
const log = (...a) => console.log(...a);
const words = (t) => (String(t).match(/\S+/g) || []).length;
const round = (n) => Math.round(n * 1000) / 1000;
const MAXW = 1700;

// Models: M = Gonka DeepSeek V4 Flash (builder), A = Gonka GLM 5.3 Flash (judge A), B = Gemini free tier (judge B). Synthetic / public text only.
const used = {};
async function call(fam, { system, user, schema, schemaName, maxTokens, timeoutMs }) {
  const mu = require('../services/providers/gonka');
  const r = fam === 'N'
    ? await require('../services/providers/nvidia').structured({ role: 'fast', task: 'uploads_proof', system, user, schema, schemaName, maxTokens: Math.max(maxTokens || 1500, 2500), timeoutMs: timeoutMs || 240000 })
    : fam === 'B'
    ? await require('../services/providers/gemini').structured({ role: 'fast', system, user, schema, schemaName, maxTokens: Math.max(maxTokens || 1500, 2500), timeoutMs: timeoutMs || 240000 })
    : await mu.gonka.structured({ model: fam === 'A' ? 'zai-org/GLM-5.3-Flash' : 'deepseek-ai/DeepSeek-V4-Flash-0731', system, user, schema, schemaName, maxTokens: Math.max(maxTokens || 1500, 1500), timeoutMs: timeoutMs || 240000 });
  if (!r || !r.data) throw new Error('no data');
  used[r.model || fam] = (used[r.model || fam] || 0) + 1;
  return r;
}
async function ask(fam, system, user, schema, name, maxTokens = 1200) {
  for (let i = 0; i < 5; i++) {
    try { return (await call(fam, { system, user, schema, schemaName: name, maxTokens })).data; } catch (e) { if (e.daily) return null; await new Promise((r) => setTimeout(r, 2500 * (i + 1))); }
  }
  return null;
}
function builderLlm() {
  const calls = { n: 0 };
  const fn = async (a) => { calls.n++; const r = await call('M', { system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: a.maxTokens, timeoutMs: 300000 }); return { data: r.data, model: r.model }; };
  fn.calls = calls; return fn;
}
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

// Documents
function cut(rich, from) {
  let lines = rich.split('\n'); if (from) { const i = lines.findIndex((l) => from.test(l)); if (i >= 0) lines = lines.slice(i); }
  const keep = []; let w = 0;
  for (const l of lines) { w += words(l); if (w > MAXW && keep.length) break; keep.push(l); }
  return keep.join('\n');
}
const stripMarks = (t) => t.replace(/^\[\[[^\]]*\]\]\s*$/gm, '').replace(/^#+\s+/gm, '').replace(/\*\*|==/g, '').replace(/^>\s?/gm, '').replace(/\n{3,}/g, '\n\n').trim();
async function loadDocs() {
  const res = fs.existsSync(path.join(__dirname, '..', 'docs', 'uploads-proof-results.json')) ? require('../docs/uploads-proof-results.json') : {};
  const blind = Object.fromEntries((res.blind_docs || []).map((d) => [d.id, d]));
  const strunk = fs.readFileSync(`${IN}/strunk-elements-of-style.txt`, 'utf8');
  const sk = strunk.indexOf('Omit needless words');
  const specs = [
    { id: 'tides', label: 'planted, PPTX', fmt: 'pptx', doc: fx.DOCS.tides },
    { id: 'vaccines', label: 'planted, DOCX', fmt: 'docx', doc: fx.DOCS.vaccines },
    { id: 'blind1', label: 'AI-authored law-making handout, PDF', fmt: 'pdf', doc: blind.blind1 },
    { id: 'blind2', label: 'AI-authored compound interest, web page (HTML)', fmt: 'html', doc: blind.blind2 },
    { id: 'blind3', label: 'AI-authored heart, Markdown', fmt: 'md', doc: blind.blind3 },
    { id: 'strunk', label: 'REAL public domain: Strunk, Elements of Style (excerpt), PDF', fmt: 'pdf', doc: { id: 'strunk', title: 'The Elements of Style (excerpt)', md: strunk.slice(Math.max(0, sk > 0 ? sk - 200 : 30000)).split(/\n{2,}/).filter((p) => p.trim()).join('\n\n').split(/\s+/).slice(0, MAXW).join(' '), kps: [] } },
    { id: 'wells', label: 'REAL public domain: Wells, Short History of the World (ch. 1-6 .docx)', file: `${IN}/wells-short-history-ch1-6.docx` },
    { id: 'constitution', label: 'REAL public domain: US Constitution (real PDF)', file: `${IN}/raw/constitution.pdf`, from: /Article\.? ?I|ARTICLE/ },
    { id: 'ocw', label: 'REAL open licence (CC BY-NC-SA): MIT OCW 18.01 lecture notes (real PDF)', file: `${IN}/raw/lec3.pdf` },
    { id: 'lecture', label: 'spoken lecture fixture, SRT subtitles', fmt: 'srt', doc: { id: 'lecture', title: 'Tides lecture', md: '', kps: fx.LECTURE_KPS }, spoken: true },
  ];
  const out = [];
  for (const s of specs) {
    if (s.doc && !s.doc.md && !s.spoken) { log(`skip ${s.id}: no source`); continue; }
    const buf = s.file ? fs.readFileSync(s.file) : await fx.build(s.fmt, s.doc);
    const ex = await materials.extract(buf);
    if (ex.error) { log(`skip ${s.id}: ${ex.error}`); continue; }
    const rich = cut(ex.rich || ex.text, s.from); const plain = stripMarks(rich);
    out.push({ id: s.id, label: s.label, title: (s.doc && s.doc.title) || s.id, plain, rich, spoken: !!s.spoken, extracted_words: words(ex.text) });
    log(`doc ${s.id}: ${words(plain)} words (${s.label})`);
  }
  return out;
}

// Exam from the SOURCE: up to 5 emphasised sentences (weight >= 2.5) and 4 plain facts, questions written by family B
function sentences(plain) { return (plain.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim()).filter((s) => words(s) >= 9 && words(s) <= 45); }
async function examFor(doc) {
  const kps = K.extract(doc.rich, { plain: doc.plain, spoken: doc.spoken }).key_points;
  const emph = [...kps].filter((k) => k.weight >= 2.5).sort((a, b) => b.weight - a.weight).slice(0, 5).map((k) => ({ text: k.text, kind: 'emphasised', weight: k.weight }));
  const taken = kps.filter((k) => k.weight >= 1.8).map((k) => K.termSet(k.text));
  const plainPool = sentences(doc.plain).filter((s) => !/\?/.test(s) && !taken.some((t) => { const u = K.termSet(s); let n = 0; for (const x of u) if (t.has(x)) n++; return u.size && n / u.size > 0.6; }));
  const step = Math.max(1, Math.floor(plainPool.length / 4));
  const plainPick = [0, 1, 2, 3].map((i) => plainPool[Math.min(plainPool.length - 1, i * step + 1)]).filter((s, i, a) => s && a.indexOf(s) === i);
  const items = [...emph, ...plainPick.map((t) => ({ text: t, kind: 'plain', weight: 1 }))];
  const qs = await pool(items, 3, async (it) => {
    const r = await ask('N', 'Write one exam question that can be answered only from the given sentence (no outside knowledge, no mention of "the text"), and a short model answer.', `Sentence: ${it.text}`, { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } }, required: ['question', 'answer'] }, 'exam_item', 400);
    return r && r.question ? { ...it, question: r.question, reference: r.answer } : null;
  });
  return qs.filter(Boolean);
}
async function answerFrom(fam, material, q) {
  const r = await ask(fam, 'You are a student with ONLY the study material below. Answer the question using nothing else. If the material does not contain what is needed, set found=false and leave the answer empty.', `Material:\n${material.slice(0, 20000)}\n\nQuestion: ${q.question}`, { type: 'object', properties: { found: { type: 'boolean' }, answer: { type: 'string' } }, required: ['found', 'answer'] }, 'answer', 500);
  if (!r) return null; if (!r.found || !r.answer) return false;
  const g = await ask(fam, 'You grade a student answer against a reference answer. correct=true only if it gives the same facts (wording may differ).', `Question: ${q.question}\nReference answer: ${q.reference}\nStudent answer: ${r.answer}`, { type: 'object', properties: { correct: { type: 'boolean' } }, required: ['correct'] }, 'grade', 200);
  return g ? !!g.correct : null;
}
const generatedText = (c) => c.skills.map((s) => [`## ${s.title}`, ...(s.lesson.paragraphs || []), ...(s.lesson.key_points || []).map((k) => `Key: ${k}`),
  ...(s.questions || []).map((q) => `Q: ${q.prompt} A: ${q.type === 'short_answer' ? q.answer : (q.choices || [])[q.answer_index]}. ${q.explanation || ''}`)].join('\n')).join('\n\n');
const lessonText = (c) => c.skills.flatMap((s) => [...s.lesson.paragraphs, ...(s.lesson.key_points || [])]).join(' ');
const share = (arr) => { const v = arr.filter((x) => x !== null && x !== undefined); return v.length ? v.filter(Boolean).length / v.length : null; };
const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? round(v.reduce((x, y) => x + y, 0) / v.length) : null; };

(async () => {
  const arm = process.argv[2] || 'run'; const reps = +(process.argv[3] || 2); const only = process.argv.slice(4);
  let cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : null;
  if (!cache) {
    cache = { docs: [] };
    for (const d of await loadDocs()) { const e = await examFor(d); cache.docs.push({ ...d, exam: e }); log(`exam ${d.id}: ${e.filter((q) => q.kind === 'emphasised').length} emphasised + ${e.filter((q) => q.kind === 'plain').length} plain`); }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
  }
  const u = db.insert('users', { email: 'proof@test.local', name: 'Proof' });
  const llm = builderLlm(); const rows = [];
  const docs = cache.docs.filter((d) => !only.length || only.includes(d.id));
  const control = cache.control || (cache.control = {});
  for (const d of docs) {
    if (control[d.id] && control[d.id].B2) { log(`control ${d.id}: cached`); continue; }
    control[d.id] = { B2: 1 };
    for (const fam of ['A', 'B']) control[d.id][fam] = await pool(d.exam, 4, (q) => answerFrom(fam, d.plain, q));
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    log(`control ${d.id}: A ${round(share(control[d.id].A))} B ${round(share(control[d.id].B))}`);
  }
  for (let rep = 1; rep <= reps; rep++) {
    for (const d of docs) {
      const m = materials.addPaste(u.id, `${d.title} r${rep}`, d.plain); if (m.error) { log(`add failed ${d.id}`); continue; }
      const kps = K.extract(d.rich, { plain: d.plain, spoken: d.spoken });
      db.update('materials', m.value.id, { key_points: kps.key_points, topics: kps.topics, assessed: kps.assessed });
      const t0 = Date.now(); let built;
      try { built = await cb.build(u.id, m.value.id, { llm, force: true }); } catch (e) { built = { error: e.message }; }
      if (!built.course) { rows.push({ doc: d.id, rep, error: String(built.error || 'no course') }); log(`${d.id} r${rep}: build failed ${built.error}`); continue; }
      const gen = generatedText(built.course); const lw = words(lessonText(built.course));
      const row = { doc: d.id, rep, status: built.course.status, skills: built.course.skills.length, build_s: Math.round((Date.now() - t0) / 1000), source_words: words(d.plain), lesson_words: lw, lesson_share: round(lw / words(d.plain)), gate: built.course.keypoint_coverage, judges: {} };
      for (const fam of ['A', 'B']) {
        const ans = await pool(d.exam, 4, (q) => answerFrom(fam, gen, q));
        const by = (kind, arr) => share(d.exam.map((q, i) => (q.kind === kind ? arr[i] : undefined)).filter((x) => x !== undefined));
        row.judges[fam] = { gen_emph: by('emphasised', ans), gen_plain: by('plain', ans), src_emph: by('emphasised', control[d.id][fam]), src_plain: by('plain', control[d.id][fam]), n_emph: d.exam.filter((q) => q.kind === 'emphasised').length, n_plain: d.exam.filter((q) => q.kind === 'plain').length };
      }
      rows.push(row); fs.writeFileSync(OUT.replace('.json', `-${arm}-rows.json`), JSON.stringify(rows));
      const j = row.judges;
      log(`${d.id} r${rep} ${row.build_s}s ${row.status} sk${row.skills} words ${row.source_words}->${row.lesson_words} (${row.lesson_share}) | A emph ${j.A.gen_emph}/${j.A.src_emph} plain ${j.A.gen_plain}/${j.A.src_plain} | B emph ${j.B.gen_emph}/${j.B.src_emph} plain ${j.B.gen_plain}/${j.B.src_plain}`);
    }
  }
  const ok = rows.filter((r) => !r.error);
  const agg = { rows_ok: ok.length, builds_failed: rows.length - ok.length, lesson_share: mean(ok.map((r) => r.lesson_share)), ready: ok.filter((r) => r.status === 'ready').length };
  for (const fam of ['A', 'B']) for (const k of ['gen_emph', 'gen_plain', 'src_emph', 'src_plain']) agg[`${fam}_${k}`] = mean(ok.map((r) => r.judges[fam][k]));
  const res = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  res[arm] = { when: new Date().toISOString().slice(0, 10), label: 'AI-JUDGED and SIMULATED: builder Gonka DeepSeek V4 Flash, judge A Gonka GLM 5.3 Flash, judge B Gemini free tier (flash-lite), exam writer NVIDIA nemotron; not real learners', reps, models_used: used, builder_calls: llm.calls.n, agg, rows };
  fs.writeFileSync(OUT, `${JSON.stringify(res, null, 1)}\n`);
  log('AGG', JSON.stringify(agg)); log('models', JSON.stringify(used));
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

