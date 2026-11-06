/**
 * Held-out proof for short mode and for personalisation (AI-JUDGED, SIMULATED; no real learner).
 *
 *   node scripts/uploads-heldout-proof.js docs            write 6 NEW documents (three writer families), cache them
 *   node scripts/uploads-heldout-proof.js exam            exam from each source (emphasised + plain), answered from the source (control)
 *   node scripts/uploads-heldout-proof.js arms <reps> [full] [short]   build each document with each arm, judge both families
 *   node scripts/uploads-heldout-proof.js learners <n> [seed]   n random extreme learners, one course each, judged on every trait
 *   node scripts/uploads-heldout-proof.js report          summary table
 *
 * Families: builder = Gonka DeepSeek V4 Flash (M). Documents written by NVIDIA nemotron (N), Gonka GLM 5.3 Flash (Z), Gemini (G).
 * The exam is written from the SOURCE by NVIDIA nemotron. Judges: Z = Gonka GLM 5.3 Flash (Zhipu), G = Mistral Large via xKiro $0 (Mistral; reported as G). Two families, neither the builder's.
 * The documents were written after the short-mode code was frozen and the builder never saw them.
 */
const fs = require('fs'); const os = require('os'); const path = require('path');
require('../services/run-cap').defaultCap(Number(process.env.RUN_CAP_USD || 4));
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
process.env.GONKA_PIPELINE = '1'; process.env.GONKA_LEDGER_FILE = process.env.GONKA_LEDGER_FILE || `${LIVE}gonka-ledger.json`;
process.env.XKIRO_PIPELINE = '1'; process.env.XKIRO_USAGE_FILE = process.env.XKIRO_USAGE_FILE || path.join(os.tmpdir(), 'uploads-heldout-xkiro-usage.json');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-heldout-${process.pid}.json`);
const db = require('../config/db');
const materials = require('../services/materials');
const K = require('../services/material-keypoints');
const cb = require('../services/course-builder');
const fx = require('./lib/upload-fixtures');
const DOCS_FILE = path.join(__dirname, '..', 'docs', 'uploads-heldout-docs.json');
const OUT_FILE = process.env.HELDOUT_OUT || path.join(__dirname, '..', 'docs', 'uploads-heldout-results.json');
const log = (...a) => console.log(...a);
const words = (t) => (String(t).match(/\S+/g) || []).length;
const round = (n) => (n == null ? null : Math.round(n * 1000) / 1000);
const load = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const save = (f, v) => fs.writeFileSync(f, JSON.stringify(v));
const used = {};

async function call(fam, { system, user, schema, schemaName, maxTokens, timeoutMs }) {
  const mt = Math.max(maxTokens || 1500, 2500);
  let r;
  if (fam === 'N') r = await require('../services/providers/nvidia').structured({ role: 'fast', task: 'uploads_proof', system, user, schema, schemaName, maxTokens: mt, timeoutMs: timeoutMs || 240000 });
  else if (fam === 'G') r = await require('../services/providers/gemini').structured({ role: 'fast', system, user, schema, schemaName, maxTokens: mt, timeoutMs: timeoutMs || 240000 });
  else if (fam === 'X') r = await require('../services/providers/xkiro').xkiro.structured({ models: ['mistralai/mistral-large-2512'], system, user, schema, schemaName, maxTokens: mt, timeoutMs: timeoutMs || 240000 });
  else r = await require('../services/providers/gonka').gonka.structured({ model: fam === 'Z' ? 'zai-org/GLM-5.3-Flash' : 'deepseek-ai/DeepSeek-V4-Flash-0731', system, user, schema, schemaName, maxTokens: mt, timeoutMs: timeoutMs || 240000 });
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
  const fn = async (a) => { const r = await call('M', { system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: a.maxTokens, timeoutMs: 300000 }); return { data: r.data, model: r.model }; };
  return fn;
}
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }
const stripMarks = (t) => t.replace(/^\[\[[^\]]*\]\]\s*$/gm, '').replace(/^#+\s+/gm, '').replace(/\*\*|==/g, '').replace(/^>\s?/gm, '').replace(/\n{3,}/g, '\n\n').trim();

// ── 1. documents ─────────────────────────────────────────────────────────────────────────────────────
const SPECS = [
  { id: 'h1', fam: 'N', fmt: 'docx', topic: 'plate tectonics and why earthquakes cluster at plate boundaries', style: 'lecture handout with headings, some bold terms, and one boxed "Key point" line; two worked numbers (plate speeds in centimetres a year, depths in kilometres)' },
  { id: 'h2', fam: 'Z', fmt: 'pdf', topic: 'the causes of the First World War', style: 'plain narrative prose in a history textbook voice with many dates, names of people and treaties and NO bold, boxes or summary: nothing is emphasised by formatting' },
  { id: 'h3', fam: 'G', fmt: 'md', topic: 'double-entry bookkeeping for a small shop', style: 'practical handout with a numbered procedure, a worked ledger example with amounts, a "Remember:" line and a short summary list' },
  { id: 'h4', fam: 'N', fmt: 'html', topic: 'how beta blockers work and when they are used', style: 'dense revision notes: short bullet lists, drug and receptor names, doses, contraindications; a bold "exam trap" line' },
  { id: 'h5', fam: 'Z', fmt: 'epub', topic: 'how a bill becomes law in a student council (an invented council with its own rules, numbers and officers)', style: 'rule-book prose with invented specifics (counts, quorum numbers, officer titles) that cannot be known from general knowledge; one sentence marked IMPORTANT' },
  { id: 'h6', fam: 'G', fmt: 'odt', topic: 'the water cycle and the carbon cycle compared', style: "a student's rough class notes: fragments, abbreviations, arrows written as words, a few repeated points, one starred point (written as STAR:)" },
];
async function writeDocs() {
  const docs = load(DOCS_FILE, []);
  for (const sp of SPECS) {
    if (docs.some((d) => d.id === sp.id)) continue;
    const schema = { type: 'object', properties: { title: { type: 'string' }, markdown: { type: 'string' } }, required: ['title', 'markdown'] };
    const d = await ask(sp.fam, 'You write ORIGINAL study documents for a test of a note-reading tool. Output Markdown only in the field. Keep it 500 to 700 words. Do not mention that it is a test.', `Topic: ${sp.topic}\nForm and voice: ${sp.style}`, schema, 'doc', 6000);
    if (!d || !d.markdown || words(d.markdown) < 300) { log(`doc ${sp.id}: failed`); continue; }
    docs.push({ id: sp.id, fam: sp.fam, fmt: sp.fmt, topic: sp.topic, title: d.title, md: d.markdown });
    save(DOCS_FILE, docs); log(`doc ${sp.id} (${sp.fam}, ${sp.fmt}): ${words(d.markdown)} words`);
  }
}
async function extracted(d) {
  const buf = await fx.build(d.fmt, { id: d.id, title: d.title, md: d.md, kps: [] });
  const ex = await materials.extract(buf);
  if (ex.error) throw new Error(`${d.id}: ${ex.error}`);
  return { rich: ex.rich || ex.text, plain: stripMarks(ex.rich || ex.text), text: ex.text, kind: ex.kind };
}

// ── 2. exam ──────────────────────────────────────────────────────────────────────────────────────────
const sentences = (plain) => (plain.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim()).filter((s) => words(s) >= 9 && words(s) <= 45);
async function examFor(src) {
  const kps = K.extract(src.rich, { plain: src.plain, spoken: false }).key_points;
  const emph = [...kps].filter((k) => k.weight >= 2.5).sort((a, b) => b.weight - a.weight).slice(0, 8).map((k) => ({ text: k.text, kind: 'emphasised', weight: k.weight }));
  const taken = kps.filter((k) => k.weight >= 1.8).map((k) => K.termSet(k.text));
  const plainPool = sentences(src.plain).filter((s) => !/\?/.test(s) && !taken.some((t) => { const u = K.termSet(s); let n = 0; for (const x of u) if (t.has(x)) n++; return u.size && n / u.size > 0.6; }));
  const step = Math.max(1, Math.floor(plainPool.length / 10));
  const pick = Array.from({ length: 10 }, (_, i) => plainPool[Math.min(plainPool.length - 1, i * step + 1)]).filter((s, i, a) => s && a.indexOf(s) === i);
  const items = [...emph, ...pick.map((t) => ({ text: t, kind: 'plain', weight: 1 }))];
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
const share = (arr) => { const v = arr.filter((x) => x !== null && x !== undefined); return v.length ? v.filter(Boolean).length / v.length : null; };
const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };

// ── 3. arms ──────────────────────────────────────────────────────────────────────────────────────────
const generatedText = (c) => c.skills.map((s) => [`## ${s.title}`, ...(s.lesson.paragraphs || []), ...(s.lesson.key_points || []).map((k) => `Key: ${k}`),
  ...(s.questions || []).map((q) => `Q: ${q.prompt} A: ${q.type === 'short_answer' ? q.answer : (q.choices || [])[q.answer_index]}. ${q.explanation || ''}`)].join('\n')).join('\n\n');
const lessonText = (c) => c.skills.flatMap((s) => [...s.lesson.paragraphs, ...(s.lesson.key_points || [])]).join(' ');

async function runArms(reps, arms) {
  const only = (process.env.HELDOUT_ONLY || '').split(',').filter(Boolean);
  const docs = load(DOCS_FILE, []).filter((d) => !only.length || only.includes(d.id));
  const store = load(OUT_FILE, { exam: {}, control: {}, arms: [], learners: [] });
  const u = db.insert('users', { email: 'heldout@example.test', display_name: 'Heldout', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  const llm = builderLlm();
  for (const d of docs) {
    const src = await extracted(d);
    if (!store.exam[d.id]) { store.exam[d.id] = await examFor(src); save(OUT_FILE, store); }
    const exam = store.exam[d.id];
    if (!store.control[d.id]) {
      store.control[d.id] = { Z: await pool(exam, 6, (q) => answerFrom('Z', src.plain, q)), G: await pool(exam, 6, (q) => answerFrom('X', src.plain, q)) };
      save(OUT_FILE, store);
    }
    log(`${d.id} (${d.fmt}, ${words(src.plain)} words): exam ${exam.filter((q) => q.kind === 'emphasised').length}e+${exam.filter((q) => q.kind === 'plain').length}p; control Z ${round(share(store.control[d.id].Z))} G ${round(share(store.control[d.id].G))}`);
    for (let rep = 1; rep <= reps; rep++) {
      for (const arm of arms) {
        if (store.arms.some((r) => r.doc === d.id && r.arm === arm && r.rep === rep)) continue;
        cb.setShort(arm !== 'full');
        const m = materials.addPaste(u.id, `${d.title} ${arm}${rep}`, src.plain); if (m.error) { log('add failed', m.error); continue; }
        const kps = K.extract(src.rich, { plain: src.plain });
        db.update('materials', m.value.id, { key_points: kps.key_points, topics: kps.topics, assessed: kps.assessed });
        const t0 = Date.now(); let built;
        try { built = await cb.build(u.id, m.value.id, { llm, force: true }); } catch (e) { built = { error: e.message }; }
        if (!built.course) { store.arms.push({ doc: d.id, arm, rep, error: String(built.error || 'no course') }); save(OUT_FILE, store); log(`${d.id} ${arm} r${rep}: build failed`); continue; }
        const gen = generatedText(built.course); const lw = words(lessonText(built.course));
        const row = { doc: d.id, fmt: d.fmt, arm, rep, status: built.course.status, skills: built.course.skills.length, build_s: Math.round((Date.now() - t0) / 1000), source_words: words(src.plain), lesson_words: lw, lesson_share: round(lw / words(src.plain)), sweep: built.course.dropped && built.course.dropped.sweep, judges: {} };
        for (const fam of ['Z', 'G']) {
          const ans = await pool(exam, 6, (q) => answerFrom(fam === 'G' ? 'X' : fam, gen, q));
          const by = (kind, arr) => share(exam.map((q, i) => (q.kind === kind ? arr[i] : undefined)).filter((x) => x !== undefined));
          row.judges[fam] = { emph: by('emphasised', ans), plain: by('plain', ans), n_emph: exam.filter((q) => q.kind === 'emphasised').length, n_plain: exam.filter((q) => q.kind === 'plain').length, answers: ans };
        }
        store.arms.push(row); save(OUT_FILE, store);
        log(`${d.id} ${arm} r${rep} ${row.build_s}s ${row.status} sk${row.skills} ${row.source_words}->${row.lesson_words} (${row.lesson_share}) | Z e ${round(row.judges.Z.emph)} p ${round(row.judges.Z.plain)} | G e ${round(row.judges.G.emph)} p ${round(row.judges.G.plain)}`);
      }
    }
  }
}

// ── 4. extreme learners ──────────────────────────────────────────────────────────────────────────────
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const TRAITS = {
  brevity_preference: ['wants the shortest version', 'wants it long and full'],
  vocabulary_ceiling: ['needs very plain words', 'reads advanced vocabulary easily'],
  attention_runway: ['loses focus fast: tiny chunks', 'holds focus a long time'],
  evaluation_anxiety: ['very anxious when tested: no test language, low stakes', 'not anxious when tested'],
  worked_example_dependence: ['needs a worked example for everything', 'wants to work it out alone'],
  challenge_appetite: ['wants hard stretch questions', 'wants gentle easy questions'],
  interest_transfer: ['learns far better through their interests', 'ignores interests'],
  text_density_tolerance: ['cannot take dense text', 'likes dense text'],
};
const INTERESTS = ['falconry', 'K-pop dance', 'tractor repair', 'speedrunning Zelda', 'ballet', 'competitive baking', 'birdwatching', 'skateboarding', 'chess openings', 'beekeeping', 'drone racing', 'knitting', 'crypto trading', 'marching band', 'pottery'];
const DISLIKES = ['sports', 'spiders', 'maths puzzles', 'cooking', 'war'];
function randomLearner(seed, i) {
  const r = rng(seed * 1000 + i); const pick = (a) => a[Math.floor(r() * a.length)];
  const stats = {}; const spoken = [];
  for (const [id, [hi, lo]] of Object.entries(TRAITS)) {
    if (r() < 0.45) continue; // not every trait is extreme
    const high = r() < 0.5; stats[id] = high ? 90 + Math.floor(r() * 9) : 2 + Math.floor(r() * 9);
    spoken.push(high ? hi : lo);
  }
  const interests = [pick(INTERESTS), pick(INTERESTS)].filter((x, k, a) => a.indexOf(x) === k);
  const dislike = r() < 0.5 ? pick(DISLIKES) : null;
  const testDate = r() < 0.5 ? new Date(Date.now() + (3 + Math.floor(r() * 25)) * 86400000).toISOString().slice(0, 10) : null;
  const age = pick([9, 12, 15, 19, 34, 61]);
  const esl = r() < 0.3;
  return { seed, i, stats, spoken, interests, dislike, testDate, age, esl };
}
async function runLearners(n, seed) {
  const docs = load(DOCS_FILE, []); const store = load(OUT_FILE, { exam: {}, control: {}, arms: [], learners: [] });
  const learner = require('../services/learner'); const scorecard = require('../services/scorecard'); const ls = require('../services/learning-spec');
  const llm = builderLlm(); cb.setShort(false);
  const src = await extracted(docs.find((d) => d.id === 'h1') || docs[0]);
  const ym = (y) => `${new Date().getUTCFullYear() - y}-01`;
  for (let i = 0; i < n; i++) {
    const L = randomLearner(seed, i);
    if (store.learners.some((x) => x.seed === seed && x.i === i)) continue;
    const user = db.insert('users', { email: `ext-${seed}-${i}@example.test`, display_name: `ext${i}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: ym(L.age) } });
    learner.saveProfile(user.id, { survey: learner.cleanSurvey({ interests: L.interests.join(', '), notes: `${L.dislike ? `I dislike ${L.dislike}. ` : ''}${L.esl ? 'English is my second language. ' : ''}` }), subscription: 'pro' });
    const card = scorecard.get(user.id);
    for (const [id, sc] of Object.entries(L.stats)) card.stats[id] = { ...card.stats[id], s: sc, m: sc, w: 8, mw: 8, n: 40, evv: 40, evx: 40, evk: 'value' };
    db.update('scorecards', card.id, { stats: card.stats });
    const m = materials.addPaste(user.id, 'Plate tectonics', src.plain).value;
    const kps = K.extract(src.rich, { plain: src.plain }); db.update('materials', m.id, { key_points: kps.key_points, topics: kps.topics, assessed: kps.assessed });
    if (L.testDate) db.update('materials', m.id, { retention_goal: { horizon: 'date', test_date: L.testDate, set_on: new Date().toISOString().slice(0, 10) } });
    const spec = ls.buildSpec(user.id, { topic: 'Plate tectonics', materialId: m.id });
    let built; try { built = await cb.build(user.id, m.id, { llm, force: true }); } catch (e) { built = { error: e.message }; }
    if (!built.course) { store.learners.push({ seed, i, error: String(built.error) }); save(OUT_FILE, store); log(`learner ${i}: build failed`); continue; }
    const text = generatedText(built.course); const lw = words(lessonText(built.course));
    const wants = [...L.spoken, ...(L.interests.length ? [`likes ${L.interests.join(' and ')} (examples and analogies may use them)`] : []), ...(L.dislike ? [`dislikes ${L.dislike} (must not appear)`] : []), ...(L.esl ? ['English is a second language: plain syntax, no idioms'] : []), ...(L.testDate ? [`has a test in ${Math.round((new Date(L.testDate) - Date.now()) / 86400000)} days: exam-style wording, name the traps`] : []), `is ${L.age} years old`];
    const schema = { type: 'object', properties: { traits: { type: 'array', items: { type: 'object', properties: { trait: { type: 'string' }, followed: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['trait', 'followed'] } }, invented_facts: { type: 'array', items: { type: 'string' } } }, required: ['traits', 'invented_facts'] };
    const row = { seed, i, learner: L, status: built.course.status, skills: built.course.skills.length, source_words: words(src.plain), lesson_words: lw, judges: {} };
    for (const fam of ['Z', 'G']) {
      const j = await ask(fam === 'G' ? 'X' : fam, 'You are a strict reviewer. A learner profile, the SOURCE the learner uploaded and the COURSE built from it are given. For EACH listed trait say whether the COURSE visibly follows it (followed true/false, with a short quote or measurable reason). Also list any specific factual claim in the COURSE that is not in the SOURCE (invented_facts; an analogy that borrows from an interest is fine if it makes no new claim about the subject). Be strict: generic text is not following a trait.', `Learner:\n${wants.map((w) => `- ${w}`).join('\n')}\n\nSOURCE:\n${src.plain.slice(0, 5000)}\n\nCOURSE (lessons, key points, questions):\n${text.slice(0, 14000)}`, schema, 'review', 2500);
      if (j && Array.isArray(j.traits)) row.judges[fam] = { followed: j.traits.filter((t) => t.followed).length, of: j.traits.length, invented: (j.invented_facts || []).length, misses: j.traits.filter((t) => !t.followed).map((t) => t.trait) };
    }
    store.learners.push(row); save(OUT_FILE, store);
    log(`learner ${i} [${L.spoken.length} traits, ${L.testDate ? 'test' : 'no test'}, age ${L.age}${L.esl ? ', ESL' : ''}] ${built.course.status} words ${row.source_words}->${lw} | Z ${row.judges.Z ? `${row.judges.Z.followed}/${row.judges.Z.of} inv ${row.judges.Z.invented}` : '-'} | G ${row.judges.G ? `${row.judges.G.followed}/${row.judges.G.of} inv ${row.judges.G.invented}` : '-'}`);
  }
}

// ── 5. report ────────────────────────────────────────────────────────────────────────────────────────
function report() {
  const dir = path.dirname(OUT_FILE);
  const files = fs.readdirSync(dir).filter((f) => /^uploads-heldout-results.*.json$/.test(f)).map((f) => path.join(dir, f));
  const store = { exam: {}, control: {}, arms: [], learners: [] };
  for (const f of files) { const x = load(f, null); if (!x) continue; Object.assign(store.exam, x.exam); Object.assign(store.control, x.control); store.arms.push(...x.arms); }
  Object.assign(store, { learners: load(path.join(dir, 'uploads-heldout-learners.json'), { learners: [] }).learners });
  if (!store.arms.length && !store.learners.length) return log('no results');
  const ok = store.arms.filter((r) => !r.error);
  const arms = [...new Set(ok.map((r) => r.arm))];
  const pctl = (a, p) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null; };
  log('arm | builds | lesson/source | Z emph | Z plain | G emph | G plain | all-questions Z | all-questions G | ready');
  for (const arm of arms) {
    const rs = ok.filter((r) => r.arm === arm);
    const all = (fam) => { let c = 0; let n = 0; for (const r of rs) { const ex = store.exam[r.doc]; r.judges[fam].answers.forEach((a, i) => { if (a != null && ex[i]) { n++; if (a) c++; } }); } return n ? c / n : null; };
    log(`${arm} | ${rs.length} | ${round(mean(rs.map((r) => r.lesson_share)))} (max ${round(Math.max(...rs.map((r) => r.lesson_share)))}) | ${round(mean(rs.map((r) => r.judges.Z.emph)))} | ${round(mean(rs.map((r) => r.judges.Z.plain)))} | ${round(mean(rs.map((r) => r.judges.G.emph)))} | ${round(mean(rs.map((r) => r.judges.G.plain)))} | ${round(all('Z'))} | ${round(all('G'))} | ${rs.filter((r) => r.status === 'ready').length}`);
  }
  // paired: per document, short minus full, both judges, emphasised and plain
  const docs = [...new Set(ok.map((r) => r.doc))];
  const diffs = { emphZ: [], plainZ: [], emphG: [], plainG: [] };
  for (const d of docs) {
    const f = ok.filter((r) => r.doc === d && r.arm === 'full'); const s = ok.filter((r) => r.doc === d && r.arm === 'short');
    if (!f.length || !s.length) continue;
    const m = (rs, fam, k) => mean(rs.map((r) => r.judges[fam][k]));
    diffs.emphZ.push(m(s, 'Z', 'emph') - m(f, 'Z', 'emph')); diffs.plainZ.push(m(s, 'Z', 'plain') - m(f, 'Z', 'plain')); diffs.emphG.push(m(s, 'G', 'emph') - m(f, 'G', 'emph')); diffs.plainG.push(m(s, 'G', 'plain') - m(f, 'G', 'plain'));
    log(`  ${d}: short-full  Z emph ${round(m(s, 'Z', 'emph') - m(f, 'Z', 'emph'))} plain ${round(m(s, 'Z', 'plain') - m(f, 'Z', 'plain'))} | G emph ${round(m(s, 'G', 'emph') - m(f, 'G', 'emph'))} plain ${round(m(s, 'G', 'plain') - m(f, 'G', 'plain'))}`);
  }
  log(`mean short-full: ${Object.entries(diffs).map(([k, v]) => `${k} ${round(mean(v))} (worst doc ${round(Math.min(...v.filter((x) => x != null)))})`).join(' | ')}`);
  const L = store.learners.filter((r) => !r.error);
  if (L.length) {
    const sh = (fam) => { const v = L.filter((r) => r.judges[fam]); return v.length ? { followed: round(v.reduce((a, r) => a + r.judges[fam].followed, 0) / Math.max(1, v.reduce((a, r) => a + r.judges[fam].of, 0))), invented_per_course: round(mean(v.map((r) => r.judges[fam].invented))), worst: round(Math.min(...v.map((r) => r.judges[fam].followed / Math.max(1, r.judges[fam].of)))), n: v.length } : null; };
    log(`learners ${L.length}: Z ${JSON.stringify(sh('Z'))} | G ${JSON.stringify(sh('G'))}`);
  }
  log('models used', JSON.stringify(used));
}

(async () => {
  const cmd = process.argv[2];
  if (cmd === 'docs') await writeDocs();
  else if (cmd === 'arms') await runArms(+(process.argv[3] || 2), process.argv.slice(4).length ? process.argv.slice(4) : ['full', 'short']);
  else if (cmd === 'learners') await runLearners(+(process.argv[3] || 8), +(process.argv[4] || 7101));
  else if (cmd === 'report') report();
  else log('usage: docs | arms <reps> [full] [short] | learners <n> [seed] | report');
  if (cmd !== 'report') report();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
