/**
 * Build the Spanish in-grade placement bank: content/unit-placement/spanish.json.
 *
 *   node scripts/generate-spanish-unit-placement.js write            write missing questions (free NVIDIA models)
 *   node scripts/generate-spanish-unit-placement.js gate             blind re-solve every question (Nemotron Ultra, key withheld); drop disagreements
 *   node scripts/generate-spanish-unit-placement.js check            fail unless the file matches the curriculum's units (used by npm test)
 *   node scripts/generate-spanish-unit-placement.js minutes          print the Quick / Balanced / Accurate minutes
 *
 * The bank had one unit per grade (a grade is about 38 hours, so "placed in grade 9" still meant up to 38 hours
 * of known material). A unit here is the curriculum's own "Unit n.k" of data/Spanish_Fluency_Path.csv
 * (content/spanish-grades.js): 7 to 16 per grade, 835 over the 57 grades, each with an "I can ..." goal. The
 * first unit also owns the grade's Entry level and the last its wrap-up, so the units tile levels 1..pathLength.
 *
 * Questions are written from the unit's own lessons by a free model (NVIDIA; curriculum text only, no learner
 * data), then every one is answered blind by a second model that is never shown the key. A question the blind
 * solver disagrees with is dropped, never kept on a guess. The gate result is stored per question
 * (`gate`: 'agreed' | 'unjudged') so `check` can fail on any question that never passed it.
 *
 * Money: NVIDIA free models only. Standard Compute $0, Anthropic $0.
 */
const fs = require('fs');
const { leaks } = require('./spanish-bank-lint');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'unit-placement', 'spanish.json');
const dotenv = (() => { try { return require(path.join(ROOT, 'node_modules', 'dotenv')); } catch { return null; } })();
const ENV_FILE = process.env.SAVANT_ENV_FILE || 'C:/coding/claudecommittdIq/folderThing/.env';
const PER_UNIT = Number(process.env.UNIT_TARGET || 4);
const KEEP_MIN = 3;
// Writers: DeepSeek flash then GLM flash at low effort (the default plan's high effort took minutes a call); the judge
// (Nemotron Ultra) is a different family, so a question is never marked by the model that wrote it.
const WRITERS = JSON.parse(process.env.WRITER_MODELS || '[{"model":"deepseek-ai/deepseek-v4.1-flash","effort":"low"},{"model":"z-ai/glm-5.3-flash","effort":"low"}]');
const UNITS_PER_CALL = Number(process.env.UNITS_PER_CALL || 5);
const PARALLEL = Number(process.env.WRITE_PARALLEL || 4);

/** The units of one grade as the curriculum lays them out (levels tile 1..pathLength). */
function unitsOfGrade(grade) {
  const order = [];
  const by = new Map();
  for (const l of grade.levels) {
    if (!/^Unit \d+\.\d+$/.test(l.unit)) continue;
    if (!by.has(l.unit)) { by.set(l.unit, []); order.push(l.unit); }
    by.get(l.unit).push(l);
  }
  const units = order.map((label) => {
    const ls = by.get(label);
    const goal = (ls.find((l) => l.type === 'Preview') || ls[0]).title.replace(/^Unit [\d.]+:\s*/, '');
    const lessons = ls.filter((l) => l.type === 'Lesson' || l.type === 'Speaking' || l.type === 'Reading' || l.type === 'Writing');
    return {
      label, start: ls[0].level, end: ls[ls.length - 1].level, goal,
      titles: lessons.map((l) => l.title).slice(0, 8),
      covers: lessons.map((l) => `${l.title}: ${String(l.covers || '').slice(0, 160)}`).slice(0, 6),
    };
  });
  if (units.length) { units[0].start = 1; units[units.length - 1].end = grade.pathLength; }
  return units;
}

function curriculumUnits() {
  const curriculum = require('../config/curriculum');
  const out = [];
  for (const g of curriculum.getTrack('spanish').grades) {
    const grade = curriculum.getGrade('spanish', g.id);
    out.push({ gradeId: g.id, name: grade.name, units: unitsOfGrade(grade) });
  }
  return out;
}

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['units'],
  properties: { units: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['unit', 'questions'],
    properties: { unit: { type: 'number' }, questions: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['skill', 'prompt', 'answer', 'wrong'],
      properties: { skill: { type: 'string' }, prompt: { type: 'string' }, answer: { type: 'string' }, wrong: { type: 'array', items: { type: 'string' } } },
    } } },
  } } },
};

const SYSTEM = [
  'You write placement questions for one grade of a Spanish course for English speakers. They place a learner inside the grade to within one unit,',
  'and they are the quick check for a unit the learner skips. Every question must be right: exactly one correct option, correct Spanish (accents and',
  'agreement included), true facts. Work each question yourself before you submit it.',
  '',
  `For each unit asked for, write ${PER_UNIT} multiple-choice questions (the answer plus exactly three wrong options):`,
  '- Each checks something this unit teaches, at the level of someone who has just finished it. A learner who stopped at the end of the PREVIOUS unit',
  '  should usually get it wrong: it needs this unit\'s new form, word or rule. Never test later units.',
  '- The questions check different lessons or angles (meaning, form, usage, choosing between two forms, reading a short Spanish line).',
  '- Wrong options are the real mistakes of a learner who has not learned the unit (wrong ending, wrong tense, false friend, English word order).',
  '  All four options are the same kind of thing and about the same length; the answer must not stand out by length or wording.',
  '- Prompts are in English (with the Spanish quoted) unless the unit itself is about reading Spanish; keep Spanish lines short and natural.',
  '- No "all/none of the above", no trick wording, no audio or pictures needed, no question with two defensible answers.',
  '- Self-contained: the question gives everything needed.',
].join('\n');

function userText(grade, units, wanted, have) {
  const lines = units.map((u, i) => {
    const mark = wanted.includes(i + 1) ? '>>' : '  ';
    const need = wanted.includes(i + 1) ? ` [write ${PER_UNIT - (have[i + 1] || []).length} new]` : '';
    const existing = (have[i + 1] || []).map((q) => `\n      already written (do not repeat): ${q.prompt.slice(0, 160)}`).join('');
    const body = wanted.includes(i + 1) ? `\n      Goal: ${u.goal}\n      ${u.covers.join('\n      ')}` : `\n      ${u.titles.slice(0, 3).join(' / ')}`;
    return `${mark} U${i + 1}${need}: ${u.label}${body}${existing}`;
  }).join('\n');
  return `GRADE: ${grade}\n\nUNITS IN ORDER (write for the ones marked >>; the rest are context):\n${lines}\n\nWrite the new questions for ${wanted.map((n) => `U${n}`).join(', ')}.`;
}

function readBank() { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return { track_id: 'spanish', grades: {} }; } }
function saveBank(b) {
  // Written whole and renamed into place: two writer processes (and a reader) never see half a file.
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = `${OUT}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(b, null, 1));
  fs.renameSync(tmp, OUT);
}

function clean(q) {
  if (Array.isArray(q.answer)) return null;
  const answer = String(q.answer || '').trim();
  const wrong = (Array.isArray(q.wrong) ? q.wrong : []).map((w) => String(w || '').trim()).filter(Boolean);
  const set = new Set([answer.toLowerCase(), ...wrong.map((w) => w.toLowerCase())]);
  if (!answer || !String(q.prompt || '').trim() || wrong.length !== 3 || set.size !== 4) return null;
  const out = { skill: String(q.skill || '').slice(0, 80), prompt: String(q.prompt).trim(), answer, choices: [answer, ...wrong] };
  return leaks(out) ? null : out;
}

/**
 * Wording a placement question must not have: the answer quoted in the prompt, the options written into the prompt
 * (so the answer is always the first lettered one), or lettered options ("A) ...") inside the options.
 */
/** Make the bank's unit list equal the curriculum's, keeping questions of units whose key and span are unchanged. */
function sync(bank, cur) {
  for (const g of cur) {
    const have = bank.grades[g.gradeId];
    bank.grades[g.gradeId] = {
      units: g.units.map((u, i) => {
        const key = `spanish:${g.gradeId}:${i + 1}`;
        const old = have && have.units.find((x) => x.key === key && x.start === u.start && x.end === u.end);
        return { key, start: u.start, end: u.end, titles: [u.goal, ...u.titles.slice(0, 6)], questions: old ? old.questions : [] };
      }),
    };
  }
  for (const id of Object.keys(bank.grades)) if (!cur.some((g) => g.gradeId === id)) delete bank.grades[id];
  return bank;
}

async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } }));
}

// UNIT_WRITER=xkiro writes with the xKiro free plan's $0 models instead (pipeline only, curriculum text; counted in the live
// xkiro-usage.json through XKIRO_USAGE_FILE, 950K tokens a day cap). Models: UNIT_WRITER_MODELS, first that answers wins.
const XKIRO = process.env.UNIT_WRITER === 'xkiro';
const GEMINI = process.env.UNIT_WRITER === 'gemini';
const OPENROUTER = process.env.UNIT_WRITER === 'openrouter';
// UNIT_WRITER=openrouter: OpenRouter's FREE model only (qwen/qwen3.8-27b:free; the env's model names are overridden to it, never a paid one).
async function openrouterWrite(system, user) {
  process.env.OPENROUTER_MODEL_FAST = 'qwen/qwen3.8-27b:free'; process.env.OPENROUTER_MODEL_DEEP = 'qwen/qwen3.8-27b:free'; process.env.OPENROUTER_MODEL = 'qwen/qwen3.8-27b:free';
  const or = require('../services/providers/openrouter');
  return or.structured({ role: 'fast', system, user, schema: SCHEMA, schemaName: 'submit_unit_questions', maxTokens: 9000 });
}
// UNIT_WRITER=gemini: the Gemini key's free tier (curriculum text only).
async function geminiWrite(system, user) {
  const gemini = require('../services/providers/gemini');
  return gemini.structured({ role: 'fast', system, user, schema: SCHEMA, schemaName: 'submit_unit_questions', maxTokens: 9000 });
}
async function xkiroWrite(system, user) {
  process.env.XKIRO_PIPELINE = '1';
  const { xkiro } = require('../services/providers/xkiro');
  const models = String(process.env.UNIT_WRITER_MODELS || 'mistralai/mistral-large-2512').split(',');
  let last = null;
  for (const m of models) {
    try { return await xkiro.structured({ system, user, schema: SCHEMA, schemaName: 'submit_unit_questions', maxTokens: 9000, models: [m], timeoutMs: 240000, ...(process.env.UNIT_WRITER_EFFORT ? { reasoningEffort: process.env.UNIT_WRITER_EFFORT } : {}) }); } catch (e) { last = e; }
  }
  throw last;
}

async function write() {
  if (dotenv) dotenv.config({ path: ENV_FILE });
  const nvidia = require('../services/providers/nvidia');
  const cur = curriculumUnits();
  const bank = sync(readBank(), cur);
  for (const g of Object.values(bank.grades)) for (const u of g.units) u.questions = u.questions.filter((q) => !leaks(q));
  const only = (process.argv.find((a) => a.startsWith('--grades=')) || '').split('=')[1];
  const wantGrades = only ? only.split(',').map((n) => cur[Number(n) - 1] && cur[Number(n) - 1].gradeId).filter(Boolean) : null;
  const jobs = [];
  for (const g of cur) {
    if (wantGrades && !wantGrades.includes(g.gradeId)) continue;
    const missing = bank.grades[g.gradeId].units.map((u, i) => (u.questions.length >= PER_UNIT ? null : i + 1)).filter(Boolean);
    for (let i = 0; i < missing.length; i += UNITS_PER_CALL) jobs.push({ g, wanted: missing.slice(i, i + UNITS_PER_CALL) });
  }
  console.log(`${jobs.length} calls`);
  let done = 0; let failed = 0;
  await pool(jobs, PARALLEL, async (job) => {
    const t0 = Date.now();
    let reply = null;
    for (let attempt = 1; attempt <= 3 && !reply; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      const user = userText(job.g.name, job.g.units, job.wanted, Object.fromEntries(job.wanted.map((n) => [n, bank.grades[job.g.gradeId].units[n - 1].questions])));
      reply = await (OPENROUTER ? openrouterWrite(SYSTEM, user) : GEMINI ? geminiWrite(SYSTEM, user) : XKIRO ? xkiroWrite(SYSTEM, user) : nvidia.structured({
        role: 'blocks', models: WRITERS, system: SYSTEM, schema: SCHEMA, schemaName: 'submit_unit_questions', maxTokens: 9000, timeoutMs: 200000, attempts: 1, user,
      })).catch((e) => { console.log(`  ${job.g.gradeId}: ${String(e.message).slice(0, 100)}`); return null; });
      if (reply && !(reply.data && Array.isArray(reply.data.units))) reply = null;
    }
    if (!reply) { failed++; console.log(`  ${job.g.gradeId} U${job.wanted.join(',')}: FAILED`); return; }
    // Merge into the file as it is now: another writer process (a different model, other grades) may have saved since this one started.
    if (process.env.UNIT_VERBOSE) console.log(`  ${job.g.gradeId.slice(0, 16)} asked ${job.wanted.join(',')}; reply units ${(reply.data.units || []).map((r) => `${r.unit}(${(r.questions || []).length})`).join(' ') || 'none'}`);
    const disk = sync(readBank(), cur);
    const grade = disk.grades[job.g.gradeId];
    for (const row of reply.data.units) {
      let n = Number(row.unit);
      if (!job.wanted.includes(n)) {
        // Some writers answer with the unit's label ("55.3") instead of its position (3): accept it only when exactly one asked-for unit matches.
        const hit = job.wanted.filter((w) => Number(String(job.g.units[w - 1].label).replace(/^Unit /, '')) === n);
        if (hit.length !== 1) continue;
        n = hit[0];
      }
      const kept = grade.units[n - 1].questions;
      const seen = new Set(kept.map((q) => q.prompt.toLowerCase()));
      const fresh = (row.questions || []).map(clean).filter((q) => q && !seen.has(q.prompt.toLowerCase()));
      if (process.env.UNIT_VERBOSE) console.log(`  ${job.g.gradeId.slice(0, 16)} U${n}: ${(row.questions || []).length} written, ${fresh.length} usable`);
      grade.units[n - 1].questions = [...kept, ...fresh].slice(0, PER_UNIT);
      bank.grades[job.g.gradeId].units[n - 1].questions = grade.units[n - 1].questions;
    }
    saveBank(disk);
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${jobs.length} calls (${Math.round((Date.now() - t0) / 1000)}s last)`);
  });
  const units = Object.values(bank.grades).flatMap((g) => g.units);
  console.log(`written: ${units.filter((u) => u.questions.length >= PER_UNIT).length}/${units.length} units full, ${failed} calls failed`);
}

async function gate() {
  if (dotenv) dotenv.config({ path: ENV_FILE });
  const keyGate = require('../services/key-gate');
  const bank = readBank();
  const rows = [];
  for (const [gid, g] of Object.entries(bank.grades)) g.units.forEach((u, ui) => u.questions.forEach((q) => { if (!q.gate && !leaks(q)) rows.push({ gid, ui, q }); }));
  console.log(`${rows.length} questions to gate`);
  const batch = 20;
  const stats = { agreed: 0, disagreed: 0, unjudged: 0 };
  const batches = [];
  for (let i = 0; i < rows.length; i += batch) batches.push(rows.slice(i, i + batch));
  let n = 0;
  // Verdicts are merged into the file as it is now (a writer may be adding questions at the same time), matched by prompt.
  const apply = (verdicts) => {
    const disk = readBank();
    for (const { gid, ui, prompt, gate: v } of verdicts) {
      const u = disk.grades[gid] && disk.grades[gid].units[ui];
      const q = u && u.questions.find((x) => x.prompt === prompt);
      if (q) q.gate = v;
    }
    saveBank(disk);
  };
  await pool(batches, 3, async (b) => {
    const res = await keyGate.blindResolve(b.map((r) => ({ prompt: r.q.prompt, choices: r.q.choices, answer: r.q.answer })));
    apply(res.map((v, i) => { stats[v.verdict]++; return { gid: b[i].gid, ui: b[i].ui, prompt: b[i].q.prompt, gate: v.verdict === 'agreed' ? 'agreed' : v.verdict === 'disagreed' ? 'disagreed' : 'unjudged' }; }));
    if (++n % 10 === 0) console.log(`  gated ${n}/${batches.length} batches`);
  });
  // Drop the disagreements and the lint failures; unjudged stay unmarked so the next run retries them.
  const disk = readBank();
  let linted = 0;
  for (const g of Object.values(disk.grades)) for (const u of g.units) {
    const before = u.questions.length;
    u.questions = u.questions.filter((q) => q.gate !== 'disagreed' && !leaks(q));
    linted += before - u.questions.length;
    for (const q of u.questions) if (q.gate === 'unjudged') delete q.gate;
  }
  saveBank(disk);
  console.log(`blind re-solve: ${stats.agreed} agreed, ${stats.disagreed} disagreed, ${stats.unjudged} unjudged (retry); ${linted} questions removed in all (disagreed or answer-leaking)`);
}

/** The Quick / Balanced / Accurate minutes for a grade-sized walk (services/unit-placement MODES). */
function minutes() {
  const up = require('../services/unit-placement');
  return Object.fromEntries(Object.entries(up.MODES).map(([k, m]) => [k, { minutes: m.minutes, maxQuestions: m.max }]));
}

/** Remove every question that has not passed the blind re-solve; a grade stays in use only when each unit keeps 3 or more. */
function prune() {
  const bank = readBank();
  let dropped = 0;
  for (const g of Object.values(bank.grades)) for (const u of g.units) { const n = u.questions.length; u.questions = u.questions.filter((q) => q.gate === 'agreed' && !leaks(q)); dropped += n - u.questions.length; }
  // A unit left with 1 or 2 questions would put its grade in use (services/unit-placement only asks for one), below the 3 a unit needs:
  // empty it, so the grade stays on the old ladder until the unit is written in full.
  let thin = 0;
  for (const g of Object.values(bank.grades)) for (const u of g.units) if (u.questions.length && u.questions.length < KEEP_MIN) { dropped += u.questions.length; thin++; u.questions = []; }
  saveBank(bank);
  console.log(`pruned ${dropped} questions that never passed the blind re-solve or sat in a unit under ${KEEP_MIN}${thin ? ` (${thin} unit(s) emptied)` : ''}`);
}

function coverage() {
  const bank = readBank();
  const complete = [];
  Object.entries(bank.grades).forEach(([id, g], i) => { if (g.units.every((u) => u.questions.length >= KEEP_MIN)) complete.push(i + 1); });
  return complete;
}

function check() {
  const cur = curriculumUnits();
  const bank = readBank();
  const bad = [];
  for (const g of cur) {
    const b = bank.grades[g.gradeId];
    if (!b || b.units.length !== g.units.length) { bad.push(`${g.gradeId}: unit count`); continue; }
    g.units.forEach((u, i) => {
      const bu = b.units[i];
      if (bu.start !== u.start || bu.end !== u.end) bad.push(`${g.gradeId} U${i + 1}: span`);
      const qs = bu.questions || [];
      for (const q of qs) {
        if (q.gate !== 'agreed') bad.push(`${g.gradeId} U${i + 1}: question without a blind-agreed gate`);
        if (!q.choices || q.choices.length !== 4 || q.choices[0] !== q.answer) bad.push(`${g.gradeId} U${i + 1}: malformed question`);
      }
    });
  }
  const complete = coverage();
  console.log(`grades with every unit at ${KEEP_MIN}+ blind-agreed questions (placed inside the grade by unit): ${complete.length} of ${cur.length} (${complete.join(',')})`);
  const units = Object.values(bank.grades).reduce((a, g) => a + g.units.length, 0);
  const qs = Object.values(bank.grades).reduce((a, g) => a + g.units.reduce((b, u) => b + u.questions.length, 0), 0);
  if (bad.length) { console.error(`spanish unit bank: ${bad.length} problems, e.g. ${bad.slice(0, 5).join('; ')}`); process.exitCode = 1; return; }
  console.log(`spanish unit bank ok: ${Object.keys(bank.grades).length} grades, ${units} units, ${qs} blind-agreed questions`);
}

if (require.main === module) {
  const cmd = process.argv[2];
  const run = { write, gate, check, prune, coverage: () => console.log(coverage().join(',')), minutes: () => console.log(JSON.stringify(minutes())) }[cmd];
  if (!run) { console.error('usage: write | gate | check | minutes'); process.exit(2); }
  Promise.resolve(run()).catch((e) => { console.error(e); process.exitCode = 1; });
}

module.exports = { unitsOfGrade, curriculumUnits };
