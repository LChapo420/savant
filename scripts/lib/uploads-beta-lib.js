/**
 * Shared by the uploads-beta proofs (AI-JUDGED or MEASURED, simulated learners and written documents only; never a real learner's data).
 * The documents are the held-out handouts of docs/UPLOADS-ANY-FORMAT.md sections 13 and 17; the exams are the same exams, so numbers compare with those rounds.
 */
const fs = require('fs'); const os = require('os'); const path = require('path');

const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
const OUT_DIR = process.env.UPLOADS_BETA_OUT || 'C:/coding/savant-wt/_out/uploads-beta';

function setup(tag) {
  require('../../services/run-cap').defaultCap(Number(process.env.RUN_CAP_USD || 5));
  require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
  for (const [k, f] of [['GONKA', 'gonka'], ['CORAL', 'coral'], ['LYCEUM', 'lyceum'], ['ZEROGPU', 'zerogpu'], ['MUNITO', 'munito'], ['GROKIFIED', 'grokified']]) {
    process.env[`${k}_PIPELINE`] = '1'; process.env[`${k}_LEDGER_FILE`] = process.env[`${k}_LEDGER_FILE`] || `${LIVE}${f}-ledger.json`;
  }
  process.env.NODE_ENV = 'test';
  process.env.DB_FILE = process.env.DB_FILE || path.join(os.tmpdir(), `uploads-beta-${tag}-${process.pid}.json`);
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  fs.mkdirSync(path.join(OUT_DIR, 'courses'), { recursive: true });
}
const load = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const save = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); };
const words = (t) => (String(t).match(/\S+/g) || []).length;
const stripMarks = (t) => t.replace(/^\[\[[^\]]*\]\]\s*$/gm, '').replace(/^#+\s+/gm, '').replace(/\*\*|==/g, '').replace(/^>\s?/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const DOCS_DIR = path.join(__dirname, '..', '..', 'docs');
const allDocs = () => [...load(path.join(DOCS_DIR, 'uploads-heldout-docs.json'), []), ...load(path.join(DOCS_DIR, 'uploads-factcheck-docs.json'), [])];
function examOf(id) {
  for (const f of ['uploads-factcheck-proof-v1.json', 'uploads-factcheck-proof-b.json', 'uploads-factcheck-proof-q.json']) {
    const s = load(path.join(DOCS_DIR, f), null);
    if (s && s.exam && s.exam[id] && s.exam[id].length) return { exam: s.exam[id], control: (s.control || {})[id] || {} };
  }
  return { exam: [], control: {} };
}
async function extracted(d) {
  const fx = require('./upload-fixtures'); const materials = require('../../services/materials');
  const buf = await fx.build(d.fmt, { id: d.id, title: d.title, md: d.md || d.markdown, kps: [] });
  const ex = await materials.extract(buf);
  if (ex.error) throw new Error(`${d.id}: ${ex.error}`);
  return { rich: ex.rich || ex.text, plain: stripMarks(ex.rich || ex.text), text: ex.text, kind: ex.kind };
}
/** Same shape as ai.structuredDetail: writer and first reader Gonka DeepSeek, second reader Gonka GLM. No learner data: these are written handouts. */
function builderLlm(J) {
  return async (a) => {
    const fam = a.task === 'material_factcheck_glm' ? 'Z' : (process.env.UB_BUILDER || 'M');
    for (let i = 0; i < 4; i++) {
      try {
        const data = await J.call(fam, { system: a.system, user: a.user, schema: a.schema, schemaName: a.schemaName, maxTokens: Math.max(a.maxTokens || 1500, 2500) });
        return { data, model: fam === 'Z' ? 'GLM-5.3-Flash' : 'DeepSeek-V4-Flash' };
      } catch (e) { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
    }
    return null;
  };
}
async function answerFrom(J, fam, material, q) {
  const r = await J.askJ(fam, { system: 'You are a student with ONLY the study material below. Answer the question using nothing else. If the material does not contain what is needed, set found=false and leave the answer empty.', user: `Material:\n${material.slice(0, 30000)}\n\nQuestion: ${q.question}`, schema: { type: 'object', properties: { found: { type: 'boolean' }, answer: { type: 'string' } }, required: ['found', 'answer'] }, schemaName: 'answer', maxTokens: 2500 });
  if (!r) return null; if (!r.found || !r.answer) return false;
  const g = await J.askJ(fam, { system: 'You grade a student answer against a reference answer. correct=true only if it gives the same facts (wording may differ).', user: `Question: ${q.question}\nReference answer: ${q.reference}\nStudent answer: ${r.answer}`, schema: { type: 'object', properties: { correct: { type: 'boolean' } }, required: ['correct'] }, schemaName: 'grade', maxTokens: 2500 });
  return g ? !!g.correct : null;
}
async function examRun(J, fam, text, exam, conc = 4) { const out = new Array(exam.length).fill(null); await J.pool(exam.map((q, i) => ({ q, i })), conc, async ({ q, i }) => { out[i] = await answerFrom(J, fam, text, q); }); return out; }
const share = (arr) => { const v = arr.filter((x) => x !== null && x !== undefined); return v.length ? v.filter(Boolean).length / v.length : null; };
const byKind = (exam, ans, kind) => share(exam.map((q, i) => (q.kind === kind ? ans[i] : undefined)).filter((x) => x !== undefined));
module.exports = { LIVE, OUT_DIR, setup, load, save, words, stripMarks, allDocs, examOf, extracted, builderLlm, answerFrom, examRun, share, byKind };
