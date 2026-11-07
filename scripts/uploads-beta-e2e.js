/**
 * The beta path, end to end, over the real routes (uploads-beta). Real file bytes -> POST /api/materials -> notes and pack built by the app -> POST /:id/course -> a finished course -> every part changed over
 * /api/parts/change, read back from the route that serves it, and put back. Learners are synthetic adults (and extreme ones); documents are written handouts. MEASURED; what an independent model thinks of the changed text is AI-JUDGED.
 *
 *   node scripts/uploads-beta-e2e.js real [case ...]        real models through the real pool and ledgers (rows: <OUT_DIR>/e2e-real.json, resumes)
 *   node scripts/uploads-beta-e2e.js scripted               a scripted model, free: the route-level test, run by npm test
 *   node scripts/uploads-beta-e2e.js report
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http');

const MODE = process.argv[2] || 'scripted';
const OUT_DIR = process.env.UPLOADS_BETA_OUT || 'C:/coding/savant-wt/_out/uploads-beta';
const FILE = path.join(OUT_DIR, 'e2e-real.json');
if (MODE === 'real') {
  require('../services/run-cap').defaultCap(Number(process.env.RUN_CAP_USD || 6));
  require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
  const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
  for (const [k, f] of [['GONKA', 'gonka'], ['MUNITO', 'munito'], ['CORAL', 'coral'], ['GROKIFIED', 'grokified'], ['LYCEUM', 'lyceum'], ['ZEROGPU', 'zerogpu'], ['GLADIA', 'gladia']]) process.env[`${k}_LEDGER_FILE`] = process.env[`${k}_LEDGER_FILE`] || `${LIVE}${f}-ledger.json`;
  process.env.ANTHROPIC_API_KEY = ''; // the paid key is not needed here
  for (const k of Object.keys(process.env)) if (/^MODELFLARE/.test(k) || /^STANDARD_COMPUTE.*KEY/.test(k)) process.env[k] = '';
  process.env.NODE_ENV = 'development';
} else if (MODE === 'scripted') {
  process.env.NODE_ENV = 'test';
  for (const name of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(name)) process.env[name] = '';
  process.env.FACT_CHECK_ALL = '0'; process.env.UPLOAD_FACTCHECK = 'on'; process.env.UPLOAD_FACTCHECK_QUOTES = 'off'; process.env.UPLOAD_FACTCHECK_READERS = '1';
}
if (MODE !== 'report') {
  process.env.UPLOAD_PARTS = 'on'; process.env.UPLOAD_PARTS_FOLLOW = 'on'; process.env.UPLOAD_OPTIMIZE = 'on'; process.env.UPLOAD_GOALS = 'on';
  process.env.UPLOAD_PARTS_FOLLOW_BG = 'off'; // the background rewrite is its own test (material-parts-test, learners gate): here each read must show only the change just asked for
  process.env.DB_FILE = path.join(os.tmpdir(), `uploads-beta-e2e-${process.pid}.json`);
  process.env.COST_TRACKER_DIR = path.join(os.tmpdir(), `uploads-beta-e2e-cost-${process.pid}`);
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  fs.mkdirSync(process.env.COST_TRACKER_DIR, { recursive: true });
}

const load = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const words = (t) => (String(t).match(/\S+/g) || []).length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeModel(ai) {
  const passagesIn = (user) => [...String(user).matchAll(/\[(p\d+)\]\n?([^[]*)/g)].map((m) => ({ id: m[1], text: m[2].trim() }));
  const sentences = (t) => (t.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim()).filter((s) => s.split(' ').length > 3);
  const fake = (a) => {
    const ps = passagesIn(a.user); const first = ps[0] || { id: 'p1', text: 'The material says this much at least, and it says it plainly here.' };
    const ss = sentences(ps.map((p) => p.text).join(' '));
    if (a.task === 'material_outline') return { skills: ps.map((p) => ({ id: `s${p.id}`, title: `Part ${p.id}: ${(sentences(p.text)[0] || 'Topic').split(' ').slice(0, 4).join(' ')}`, summary: '', unit: 'Main', prerequisites: [], passage_ids: [p.id], taught: true })) };
    const items = () => ss.slice(0, 6).map((s, i) => ({ type: 'multiple_choice', prompt: `Which line is from the material (${i + 1})?`, choices: [s.slice(0, 150), `Not this one ${i}`, `Nor this one ${i}`], answer_index: 0, tier: (i % 3) + 1, misconceptions: ['', 'a mix-up', 'a mix-up'], explanation: s, passage_id: first.id, quote: first.text.slice(0, 40) }));
    if (a.task === 'material_lesson') return { lesson: { paragraphs: [ss.slice(0, 2).join(' ') || first.text.slice(0, 300), ss.slice(2, 4).join(' ') || first.text.slice(0, 100)], key_points: ss.slice(4, 5) }, questions: items() };
    if (a.task === 'material_verify') return { verdicts: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, supported: true })), supported: true, gives_away: false };
    if (/^material_factcheck/.test(a.task)) return { verdicts: [...String(a.user).split('SENTENCES:')[1].matchAll(/^(\d+)\. (.*)$/gm)].map((m) => ({ n: Number(m[1]), verdict: 'supported', quote: m[2] })) };
    if (a.task === 'material_notes') return { sections: [{ heading: 'Main points', bullets: ss.slice(0, 5).map((s) => ({ text: s, passage_id: first.id, quote: first.text.slice(0, 60) })) }] };
    if (a.task === 'material_pack') return { summary: [ss.slice(0, 2).join(' ')], flashcards: ss.slice(0, 5).map((s, i) => ({ front: `Card ${i + 1}`, back: s, passage_id: first.id, quote: first.text.slice(0, 60) })), quiz: items().slice(0, 2).map((q) => ({ ...q, type: 'multiple_choice' })), test: [] };
    if (a.task === 'material_podcast') return { title: 'Episode', turns: ss.slice(0, 8).map((s, i) => ({ host: i % 2 ? 'B' : 'A', text: s })), checkins: [] };
    if (a.task === 'material_part_change') { const pieces = [...a.user.split('What the learner asked for')[0].matchAll(/^(\d+)\. (.*)$/gm)].map((m) => m[2].replace(/\bthe\b/, 'that')); return { pieces }; }
    if (a.task === 'material_part_example') return { text: 'Say two friends share a job: each does part of it, in the same order the text gives.' };
    if (a.task === 'part_gate_a' || a.task === 'part_gate_b') return /POINTS:/.test(a.user) ? { verdicts: [...a.user.split('REWORDED TEXT:')[0].matchAll(/^(\d+)\. /gm)].map((m) => ({ n: Number(m[1]), stated: true })) } : { wrong: [], other: [] };
    return {};
  };
  ai.isEnabled = () => true;
  ai.canBuild = () => true;
  const down = { value: false };
  ai.structuredDetail = async (a) => { if (down.value) throw new Error('every provider failed'); await sleep(2); return { data: fake(a), model: 'scripted' }; };
  ai.structured = async (a) => { if (down.value) throw new Error('every provider failed'); return fake(a); };
  ai.budgetShareLeft = () => true;
  return down;
}

const mk = {};
async function bootstrap() {
  const express = require('express');
  mk.db = require('../config/db');
  mk.ai = require('../services/ai');
  if (MODE === 'scripted') mk.down = fakeModel(mk.ai);
  const app = express(); app.set('trust proxy', true);
  app.use((req, res, next) => { req.user = mk.db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/materials', require('../routes/materials'));
  app.use('/api', express.json({ limit: '1mb' }), require('../routes/part-change'));
  app.use('/api', require('../routes/study-goals'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  mk.port = server.address().port;
  mk.server = server;
}
let ipN = 0;
const call = (method, url, user, body, raw) => new Promise((ok, fail) => {
  ipN += 1;
  const buf = raw || (body === undefined ? null : Buffer.from(JSON.stringify(body)));
  const headers = { 'x-user': String(user), 'x-forwarded-for': `10.8.${ipN % 250}.${(ipN >> 8) % 250}`, ...(raw ? { 'content-type': 'application/octet-stream' } : body !== undefined ? { 'content-type': 'application/json' } : {}), ...(buf ? { 'content-length': buf.length } : {}) };
  const req = http.request({ host: '127.0.0.1', agent: false, port: mk.port, path: url, method, headers, timeout: 900000 }, (res) => {
    let t = ''; res.setEncoding('utf8'); res.on('data', (c) => { t += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; } ok({ status: res.statusCode, json: j }); });
  });
  req.on('error', fail); if (buf) req.write(buf); req.end();
});

function newLearner(c, i) {
  const db = mk.db; const learner = require('../services/learner'); const scorecard = require('../services/scorecard');
  const u = db.insert('users', { email: `e2e-${c.id}-${i}@example.test`, display_name: 'E2E', password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: `${new Date().getUTCFullYear() - (c.age || 30)}-01` }, subscription: 'pro' });
  learner.saveProfile(u.id, { survey: learner.cleanSurvey({ interests: (c.interests || []).join(', '), notes: c.notes || '' }), subscription: 'pro' });
  if (c.stats) { const card = scorecard.get(u.id); for (const [id, sc] of Object.entries(c.stats)) card.stats[id] = { ...card.stats[id], s: sc, m: sc, w: 8, mw: 8, n: 40, evv: 40, evx: 40, evk: 'value' }; db.update('scorecards', card.id, { stats: card.stats }); }
  return u.id;
}

/** The text of a part as the route that serves it says it. */
async function readPart(uid, mid, ref, ctx) {
  const [kind, a, b] = ref.split(':');
  if (kind === 'lesson') { const r = await call('GET', `/api/materials/${mid}/study/lesson/${a}`, uid); const l = r.json.skill.lesson; return JSON.stringify([l.paragraphs, l.key_points]); }
  if (kind === 'q') { const r = await call('GET', `/api/materials/${mid}/study/lesson/${a}`, uid); const q = r.json.skill.practice.find((x) => x.id === b); ctx.lastQ = q; return JSON.stringify(q ? [q.prompt, q.choices] : null); }
  if (kind === 'card') { const r = await call('GET', `/api/materials/${mid}/cards`, uid); const c = r.json.cards.find((x) => x.id === a); return JSON.stringify(c ? [c.front, c.back] : null); }
  if (kind === 'note') { const r = await call('GET', `/api/materials/${mid}/notes`, uid); const s = r.json.notes.sections.find((x) => x.id === a); return JSON.stringify(s ? [s.heading, s.bullets.map((x) => x.text)] : null); }
  if (kind === 'summary') { const r = await call('GET', `/api/materials/${mid}/pack`, uid); return JSON.stringify(r.json.pack.summary); }
  if (kind === 'packcard') { const r = await call('GET', `/api/materials/${mid}/pack`, uid); const c = r.json.pack.cards.find((x) => x.id === a); return JSON.stringify(c ? [c.front, c.back] : null); }
  if (kind === 'pack') { const r = await call('GET', `/api/materials/${mid}/pack`, uid); const q = (r.json.pack[a] || []).find((x) => x.id === b); return JSON.stringify(q ? [q.prompt, q.choices] : null); }
  if (kind === 'podcast') { const r = await call('GET', `/api/materials/${mid}/podcast`, uid); return JSON.stringify(((r.json[a] || {}).turns || []).map((t) => t.text)); }
  return '';
}

async function until(fn, ms, gap = 2500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(gap); } } // eslint-disable-line no-await-in-loop

async function runCase(c) {
  const row = { id: c.id, kind: c.kind, words: words(c.text || ''), learner: c.label || 'ordinary', steps: {}, changes: [], goals: {} };
  const uid = newLearner(c, 0);
  const T0 = Date.now();
  const up = await call('POST', `/api/materials?name=${encodeURIComponent(c.name)}`, uid, undefined, c.bytes);
  row.steps.upload_status = up.status; row.steps.upload_ms = Date.now() - T0;
  if (up.status >= 400) { row.outcome = `refused: ${up.json.error || up.status}`; row.expected_refusal = !!c.refuse; return row; }
  const mine = () => mk.db.find('materials', (m) => m.user_id === uid);
  const got = await until(() => mine()[0], 300000, 500);
  if (!got) { row.outcome = 'no material after 5 minutes'; return row; }
  const mid = got.id;
  row.steps.key_points = (got.key_points || []).length; row.steps.notes_text = (got.notes || []).length;
  const noteDone = await until(async () => { const r = await call('GET', `/api/materials/${mid}/notes`, uid); const s = r.json.notes && r.json.notes.status; return s && s !== 'building' ? s : null; }, c.buildMs || 600000);
  row.steps.notes = noteDone || 'timeout'; row.steps.notes_s = Math.round((Date.now() - T0) / 1000);
  const packDone = await until(async () => { const r = await call('GET', `/api/materials/${mid}/pack`, uid); const s = r.json.pack && r.json.pack.status; return s && s !== 'building' ? s : null; }, c.buildMs || 600000);
  row.steps.pack = packDone || 'timeout'; row.steps.pack_s = Math.round((Date.now() - T0) / 1000);
  const t1 = Date.now();
  const start = await call('POST', `/api/materials/${mid}/course`, uid, {});
  row.steps.course_start = start.status;
  let firstSkillS = null;
  const courseDone = await until(async () => {
    const r = await call('GET', `/api/materials/${mid}/course`, uid); const co = r.json.course;
    if (co && (co.skills || co.skills_count || (co.skills_built > 0)) && firstSkillS == null) firstSkillS = Math.round((Date.now() - t1) / 1000);
    return co && co.status !== 'building' ? co.status : null;
  }, c.buildMs || 1500000, 4000);
  row.steps.course = courseDone || 'timeout'; row.steps.course_s = Math.round((Date.now() - t1) / 1000); row.steps.first_skill_s = firstSkillS;
  const state = await call('GET', `/api/materials/${mid}/study`, uid);
  if (state.status !== 200) { row.outcome = `no study state: ${state.json.error}`; return row; }
  row.steps.skills = state.json.total; row.steps.reading = state.json.reading;
  row.steps.source_words = words(mk.db.byId('materials', mid).text || '');
  const firstSkill = state.json.skills.find((s) => s.open) || state.json.skills[0];
  const skillId = firstSkill.id;
  // Goals: the same course read three ways, no build.
  for (const goal of ['core', 'test', 'full']) {
    const t = Date.now();
    const saved = await call('PUT', '/api/study-goals', uid, { kind: 'material', id: mid, goal });
    const st = await call('GET', `/api/materials/${mid}/study`, uid);
    const l = await call('GET', `/api/materials/${mid}/study/lesson/${skillId}`, uid);
    row.goals[goal] = { status: saved.status, words: st.json.reading && st.json.reading.words, checks: st.json.reading && st.json.reading.checks, minutes: st.json.reading && st.json.reading.minutes, aside: st.json.reading && st.json.reading.aside, lesson_words: words((l.json.skill.lesson.paragraphs || []).join(' ')), ms: Date.now() - t };
  }
  // Every part.
  const lessonOut = await call('GET', `/api/materials/${mid}/study/lesson/${skillId}`, uid);
  const practice = lessonOut.json.skill.practice || [];
  const deck = await call('GET', `/api/materials/${mid}/cards`, uid);
  const notesOut = await call('GET', `/api/materials/${mid}/notes`, uid);
  const packOut = await call('GET', `/api/materials/${mid}/pack`, uid);
  const packQ = packOut.json.pack && ((packOut.json.pack.quiz || [])[0]);
  const todo = [
    ['lesson', `lesson:${skillId}`, 'simpler'], ['lesson', `lesson:${skillId}`, 'shorter'], ['lesson', `lesson:${skillId}`, 'examples'], ['lesson', `lesson:${skillId}`, 'fuller'], ['lesson', `lesson:${skillId}`, 'custom'],
    ['question', practice[0] ? `q:${skillId}:${practice[0].id}` : null, 'simpler'],
    ['card', deck.json.cards && deck.json.cards[0] ? `card:${deck.json.cards[0].id}` : null, 'simpler'],
    ['packcard', packOut.json.pack && packOut.json.pack.cards[0] ? `packcard:${packOut.json.pack.cards[0].id}` : null, 'examples'],
    ['notes', notesOut.json.notes && notesOut.json.notes.sections[0] ? `note:${notesOut.json.notes.sections[0].id}` : null, 'simpler'],
    ['summary', packOut.json.pack && packOut.json.pack.summary.length ? 'summary' : null, 'shorter'],
    ['pack question', packQ ? `pack:quiz:${packQ.id}` : null, 'simpler'],
  ];
  const ctx = {};
  for (const [part, ref, change] of todo) {
    if (!ref) { row.changes.push({ part, change, skipped: 'no such part' }); continue; }
    const before = await readPart(uid, mid, ref, ctx);
    const t = Date.now();
    const r = await call('POST', '/api/parts/change', uid, { material_id: mid, part: ref, change, ...(change === 'custom' ? { custom: 'put it as short steps' } : {}) });
    const ms = Date.now() - t;
    const after = await readPart(uid, mid, ref, ctx);
    const reached = r.json.changed ? after !== before : after === before;
    const back = await call('POST', '/api/parts/revert', uid, { material_id: mid, part: ref });
    const restored = await readPart(uid, mid, ref, ctx);
    row.changes.push({ part, ref, change, http: r.status, changed: !!r.json.changed, message: r.json.message || null, ms, reached, restored: restored === before, revert_http: back.status, before: before.slice(0, 4000), after: r.json.changed ? after.slice(0, 4000) : null });
    // Clear the pin so the next change on this part starts clean.
    mk.db.remove('material_part_changes', (x) => x.user_id === uid && x.material_id === mid && x.ref === ref);
  }
  // The test part.
  const len0 = (await call('POST', `/api/materials/${mid}/test`, uid, { skills: [skillId] })).json.questions;
  const tshort = await call('POST', '/api/parts/change', uid, { material_id: mid, part: 'test', change: 'harder' });
  const tback = await call('POST', '/api/parts/revert', uid, { material_id: mid, part: 'test' });
  row.changes.push({ part: 'test', ref: 'test', change: 'harder', http: tshort.status, changed: !!tshort.json.changed, reached: !!tshort.json.part, restored: tback.status === 200, questions: len0 ? len0.length : null });
  // A real pass through the study path: practice, check, review of a miss.
  const lq = (await call('GET', `/api/materials/${mid}/study/lesson/${skillId}`, uid)).json.skill.practice[0];
  if (lq) { const p = await call('POST', `/api/materials/${mid}/study/practice`, uid, { skill: skillId, question: lq.id, answer: 0 }); row.steps.practice_http = p.status; }
  const quiz = await call('POST', `/api/materials/${mid}/study/quiz`, uid, { mode: 'mastery', skill: skillId });
  if (quiz.status === 200) { const sub = await call('POST', `/api/materials/${mid}/study/submit`, uid, { quiz_id: quiz.json.quiz_id, answers: {} }); row.steps.submit_http = sub.status; row.steps.quiz_size = quiz.json.questions.length; row.steps.remediation = (sub.json.remediation || []).length; }
  row.outcome = 'finished';
  row.total_s = Math.round((Date.now() - T0) / 1000);
  // What this upload cost, from the cost tracker's own rows for this learner.
  row.cost = costOf(uid);
  if (c.del) { const del = await call('DELETE', `/api/materials/${mid}`, uid); row.steps.delete_http = del.status; row.steps.rows_left = mk.db.find('material_part_changes', (x) => x.user_id === uid).length; }
  return row;
}
function costOf(uid) {
  try {
    require('../services/cost-tracker').flushSync();
    const dir = process.env.COST_TRACKER_DIR; let usd = 0; let calls = 0; const by = {}; const byProv = {};
    for (const f of fs.readdirSync(dir)) for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line) continue; let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.t !== 'ai' || e.u !== uid) continue;
      usd += e.usd || 0; calls += 1; by[e.task] = (by[e.task] || 0) + 1; byProv[e.prov] = (byProv[e.prov] || 0) + (e.usd || 0);
    }
    return { usd: Math.round(usd * 1e5) / 1e5, calls, by_task: by, by_provider: byProv };
  } catch (e) { return { error: e.message }; }
}

async function realCases() {
  const L = require('./lib/uploads-beta-lib');
  const fx = require('./lib/upload-fixtures');
  const docs = L.allDocs();
  const d = (id) => docs.find((x) => x.id === id);
  const file = async (id, fmt) => fx.build(fmt || d(id).fmt, { id, title: d(id).title, md: d(id).md || d(id).markdown, kps: [] });
  const stripped = (id) => L.stripMarks(d(id).md || d(id).markdown);
  const longText = docs.flatMap((x, i) => [`# Part ${i + 1}: ${x.title}`, x.md || x.markdown, `# Part ${i + 20}: more on ${x.title}`, x.md || x.markdown]).join('\n\n');
  const cases = [
    { id: 'epub-ordinary', kind: 'epub', name: 'rules.epub', bytes: await file('h5'), label: 'ordinary adult', del: true },
    { id: 'docx-brevity-plain-anxious', kind: 'docx', name: 'tect.docx', bytes: await file('h1'), label: 'extreme: wants shortest, plain words, anxious, tiny chunks', stats: { brevity_preference: 95, vocabulary_ceiling: 6, evaluation_anxiety: 94, text_density_tolerance: 6, attention_runway: 8 } },
    { id: 'pdf-young-esl-interests', kind: 'pdf', name: 'war.pdf', bytes: await file('h2'), label: 'extreme: age 12, English second language, odd interests', age: 13, interests: ['falconry', 'tractor repair'], notes: 'English is my second language. I dislike sports.', stats: { interest_transfer: 95, vocabulary_ceiling: 15 } },
    { id: 'html-dense-lover', kind: 'html', name: 'beta.html', bytes: await file('h4'), label: 'extreme: dense text, hard questions, works alone', stats: { text_density_tolerance: 96, challenge_appetite: 95, worked_example_dependence: 4 } },
    { id: 'odt-notes', kind: 'odt', name: 'cycles.odt', bytes: await file('h6'), label: 'ordinary, rough class notes' },
    { id: 'md-three-subjects', kind: 'md', name: 'mixed.md', bytes: Buffer.from([d('h2'), d('h3'), d('h4')].map((x) => x.md || x.markdown).join('\n\n# Next subject\n\n')), label: 'random: contradictory traits', stats: { attention_runway: 95, text_density_tolerance: 5, brevity_preference: 8 } },
    { id: 'txt-very-short', kind: 'txt', name: 'short.txt', bytes: Buffer.from('Water boils at 100 degrees Celsius at sea level. At higher altitude it boils at a lower temperature because the air pressure is lower.'), label: 'ordinary', short: true },
    { id: 'txt-long', kind: 'txt', name: 'long.txt', bytes: Buffer.from(longText), label: 'ordinary, about 15,000 words', buildMs: 1800000 },
    { id: 'pptx-slides', kind: 'pptx', name: 'book.pptx', bytes: await file('h3', 'pptx'), label: 'ordinary' },
    { id: 'png-scan', kind: 'png', name: 'scan.png', bytes: await file('h6', 'png'), label: 'a page photographed, if OCR is installed' },
    { id: 'spanish', kind: 'txt', name: 'es.txt', bytes: Buffer.from(require('./lib/real-files').SPANISH), label: 'not in English' },
    { id: 'junk', kind: 'bin', name: 'x.bin', bytes: Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 37) % 251)), label: 'random bytes', refuse: true },
  ];
  void stripped;
  return cases;
}

async function runReal(only) {
  const store = load(FILE, { rows: [] });
  const cases = (await realCases()).filter((c) => !only.length || only.includes(c.id));
  let i = 0;
  await Promise.all(Array.from({ length: Number(process.env.UB_CONC || 3) }, async () => {
    while (i < cases.length) {
      const c = cases[i]; i += 1;
      if (store.rows.some((r) => r.id === c.id && r.outcome === 'finished')) continue;
      let row;
      try { row = await runCase(c); } catch (e) { row = { id: c.id, outcome: `crashed: ${e.message}` }; }
      store.rows = store.rows.filter((r) => r.id !== c.id); store.rows.push(row);
      fs.writeFileSync(FILE, JSON.stringify(store));
      console.log(`${c.id}: ${row.outcome} course ${row.steps && row.steps.course} in ${row.steps && row.steps.course_s}s, ${row.cost ? `$${row.cost.usd}, ${row.cost.calls} calls` : ''}; changes ${(row.changes || []).filter((x) => x.changed).length}/${(row.changes || []).length}`);
    }
  }));
}

function report() {
  const store = load(FILE, { rows: [] });
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(p * s.length)] : null; };
  for (const r of store.rows) {
    const s = r.steps || {};
    console.log(`${r.id} [${r.learner || ''}] ${r.outcome}: source ${s.source_words || '-'} words; notes ${s.notes} ${s.notes_s}s, pack ${s.pack} ${s.pack_s}s, course ${s.course} ${s.course_s}s (first skill ${s.first_skill_s}s), ${s.skills} skills; $${r.cost ? r.cost.usd : '-'} over ${r.cost ? r.cost.calls : '-'} calls`);
    if (r.goals && r.goals.full) console.log(`   reading words: full ${r.goals.full.words} / test ${r.goals.test.words} / core ${r.goals.core.words}; set aside at core ${r.goals.core.aside}; est. minutes ${r.goals.full.minutes} / ${r.goals.test.minutes} / ${r.goals.core.minutes}; goal switch ${r.goals.core.ms} ms`);
  }
  const ch = store.rows.flatMap((r) => r.changes || []).filter((c) => !c.skipped);
  console.log(`\nchanges: ${ch.length} asked, ${ch.filter((c) => c.changed).length} made, reached the served text ${ch.filter((c) => c.reached).length}/${ch.length}, restored by put back ${ch.filter((c) => c.restored).length}/${ch.length}`);
  for (const p of [...new Set(ch.map((c) => `${c.part}/${c.change}`))]) {
    const v = ch.filter((c) => `${c.part}/${c.change}` === p);
    const ms = v.filter((c) => c.ms).map((c) => c.ms);
    console.log(`  ${p.padEnd(24)} made ${v.filter((c) => c.changed).length}/${v.length}, reached ${v.filter((c) => c.reached).length}, restored ${v.filter((c) => c.restored).length}, p50 ${q(ms, 0.5) == null ? '-' : (q(ms, 0.5) / 1000).toFixed(1)} s, worst ${ms.length ? (Math.max(...ms) / 1000).toFixed(1) : '-'} s`);
  }
  const usd = store.rows.filter((r) => r.cost && r.cost.usd != null).map((r) => r.cost.usd);
  if (usd.length) console.log(`\ncost per upload (build everything, all goals, every change above), n ${usd.length}: median $${q(usd, 0.5)}, worst $${Math.max(...usd)}`);
}

// ── scripted: the route test ─────────────────────────────────────────────────
async function scripted() {
  let failures = 0; let passes = 0;
  const check = (label, cond, detail) => { if (cond) { passes += 1; console.log(`  ok   ${label}`); } else { failures += 1; console.log(`  FAIL ${label}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`); } };
  const TEXT = `# Tides\n\nTides are the regular rise and fall of the sea. The Moon causes most of the tide because its gravity pulls harder on the near side of the Earth. A spring tide happens when the Sun and the Moon line up, and it comes about every 14 days.\n\n**A neap tide is the weakest tide and it happens when the Sun and the Moon pull at right angles.**\n\nThe tidal range at the Bay of Fundy can reach 16 metres. Most coasts see two high tides in about 25 hours. Remember: never confuse a spring tide with the season of spring. Tidal power stations turn the moving water into electricity. The first large one opened at La Rance in 1966. Salt marshes flood at each high tide and many birds feed there when the water falls. The sea level rises slowly as the ice melts, and that changes tides over many years.`;
  const c = { id: 'scripted', kind: 'md', name: 'tides.md', bytes: Buffer.from(TEXT), label: 'scripted', del: true };
  process.env.UPLOAD_AUTOBUILD = 'on';
  const row = await runCase(c);
  check('a real file through the real route ends in a finished course', row.outcome === 'finished' && ['ready', 'partial'].includes(row.steps.course), row.steps);
  check('notes and pack were built by the app', ['ready', 'partial'].includes(row.steps.notes) && ['ready', 'partial'].includes(row.steps.pack), row.steps);
  check('three goals, each reading is served', row.goals.core.status === 200 && row.goals.test.status === 200 && row.goals.full.status === 200, row.goals);
  check('core reads no more than full', row.goals.core.words <= row.goals.full.words, row.goals);
  const ch = (row.changes || []).filter((x) => !x.skipped);
  check('every part present was offered a change', ch.length >= 8, row.changes.map((x) => [x.part, x.skipped || x.http]));
  check('each change answered over the route', ch.every((x) => x.http === 200), ch.map((x) => [x.part, x.change, x.http]));
  const made = ch.filter((x) => x.changed);
  check('most changes were made', made.length >= ch.length - 3, ch.map((x) => [x.part, x.change, x.changed, x.message]));
  check('a change made is what the route serves after it', ch.every((x) => x.reached), ch.filter((x) => !x.reached).map((x) => [x.part, x.change, x.before, x.after]));
  check('put back restores what the route served, exactly', ch.every((x) => x.restored), ch.filter((x) => !x.restored).map((x) => [x.part, x.change]));
  check('the study path runs on top of it', row.steps.practice_http === 200 && row.steps.submit_http === 200, row.steps);
  check('deleting the material takes its changes', row.steps.delete_http === 200 && row.steps.rows_left === 0, row.steps);

  console.log('failures on the path');
  // Every model down, while building.
  const uid = newLearner({ id: 'down' }, 1);
  mk.down.value = true;
  const up = await call('POST', '/api/materials?name=a.md', uid, undefined, Buffer.from(TEXT));
  check('an upload still works with every model down', up.status < 400, up);
  const mid = (await until(() => mk.db.find('materials', (m) => m.user_id === uid)[0], 20000, 200)).id;
  const st = await call('POST', `/api/materials/${mid}/course`, uid, {});
  check('asking for a course does not crash', st.status < 500, st);
  await sleep(300);
  mk.down.value = false;
  // A built course, then a change when no model answers.
  await until(async () => { const r = await call('GET', `/api/materials/${mid}/course`, uid); return !r.json.course || r.json.course.status !== 'building'; }, 30000, 300);
  await call('POST', `/api/materials/${mid}/course`, uid, {});
  await until(async () => { const r = await call('GET', `/api/materials/${mid}/course`, uid); return r.json.course && r.json.course.status !== 'building'; }, 60000, 300);
  const s2 = await call('GET', `/api/materials/${mid}/study`, uid);
  const sk = s2.json.skills && s2.json.skills[0] && s2.json.skills[0].id;
  check('it builds once a model is back', !!sk, s2);
  if (sk) {
    const before = await readPart(uid, mid, `lesson:${sk}`, {});
    mk.down.value = true;
    const r = await call('POST', '/api/parts/change', uid, { material_id: mid, part: `lesson:${sk}`, change: 'simpler' });
    mk.down.value = false;
    check('a change with no model is refused in plain words and the text stays', r.status === 200 && !r.json.changed && !!r.json.message && before === (await readPart(uid, mid, `lesson:${sk}`, {})), r);
    const bad = await call('POST', '/api/parts/change', uid, { material_id: mid, part: `lesson:${sk}`, change: 'explode' });
    check('an unknown change is a 400', bad.status === 400, bad);
    const nope = await call('POST', '/api/parts/change', uid, { material_id: mid, part: 'lesson:nope', change: 'simpler' });
    check('an unknown part is a 404', nope.status === 404, nope);
    const other = newLearner({ id: 'other' }, 2);
    const stranger = await call('POST', '/api/parts/change', other, { material_id: mid, part: `lesson:${sk}`, change: 'simpler' });
    check('another account\'s material is a 404', stranger.status === 404, stranger);
    const anon = await call('POST', '/api/parts/change', 0, { material_id: mid, part: `lesson:${sk}`, change: 'simpler' });
    check('no account is refused', anon.status === 401 || anon.status === 403, anon);
    const coreLeft = await call('PUT', '/api/study-goals', other, { kind: 'material', id: mid, goal: 'core' });
    check('another account cannot set a goal on it', coreLeft.status === 404, coreLeft);
  }
  console.log('a child without consent');
  const ConsentAge = new Date().getUTCFullYear() - 10;
  const child = mk.db.insert('users', { email: 'kid@example.test', display_name: 'Kid', password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: `${ConsentAge}-01` } });
  const consent = require('../routes/consent');
  check('the no-upload rule for children is still in the route', /CHILD_MEDIA_UPLOAD/.test(fs.readFileSync(path.join(__dirname, '..', 'routes', 'materials.js'), 'utf8')) && !!consent, child.id);
  mk.db.flush();
  mk.server.close();
  console.log(failures ? `FAILED: ${failures} of ${failures + passes}` : `All ${passes} checks passed.`);
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* gone */ }
  process.exit(failures ? 1 : 0);
}

(async () => {
  if (MODE === 'report') { report(); process.exit(0); }
  await bootstrap();
  if (MODE === 'scripted') { await scripted(); return; }
  await runReal(process.argv.slice(3));
  console.log('done');
  require('../config/db').flush();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
