/**
 * Write the in-grade placement questions: three for every unit of every grade.
 *
 *   node scripts/generate-unit-placement.js math
 *   node scripts/generate-unit-placement.js reading english --grades=basics,grammar
 *
 * A unit is the stretch of lessons between two checkpoints (services/fact-cascade
 * unitOf). Placing a learner inside a grade to within one unit needs questions
 * that belong to one unit each: answerable by someone who has finished that unit,
 * and not by someone who stopped before it. The same questions are the quick
 * check for a unit a learner skips.
 *
 * The bank is written to content/unit-placement/<track>.json rather than the
 * database: like the English subject bank it is fixed, so every learner is placed
 * by the same questions, and writing it never races the server's copy of the data.
 * Units already in the file are kept; run it again to fill in what failed.
 *
 * MiMo V2.6 Pro on the owner's token plan, streamed.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
const here = path.join(ROOT, '.env');
dotenv.config({ path: fs.existsSync(here) ? here : path.join(ROOT, '..', '.env') });

const curriculum = require('../config/curriculum');
const rules = require('../config/subject-placement');
const { unitsOf } = require('./placement-testers');

const OUT_DIR = path.join(ROOT, 'content', 'unit-placement');
// Three a unit at first; UNIT_TARGET=5 tops every unit up to five, keeping the
// ones it has. Measured on simulated testers with ideal questions: three a unit
// capped Accurate at 909 of 928 within one unit (the walk ran out of questions),
// five reached 926 and seven 928.
const PER_UNIT = Number(process.env.UNIT_TARGET || 3);
const UNITS_PER_CALL = Number(process.env.UNITS_PER_CALL || 6);
const PARALLEL = Number(process.env.WRITE_PARALLEL || 3);

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['units'],
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['unit', 'questions'],
        properties: {
          unit: { type: 'integer' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['prompt', 'answer', 'wrong', 'skill'],
              properties: {
                skill: { type: 'string', description: 'The one skill of this unit the question checks, in a few words.' },
                prompt: { type: 'string' },
                answer: { type: 'string' },
                wrong: { type: 'array', items: { type: 'string' }, description: 'Exactly three wrong options.' },
              },
            },
          },
        },
      },
    },
  },
};

function system(trackName) {
  return [
    `You write placement questions for one grade of a ${trackName} course. They place a learner inside the grade to`,
    'within one unit, and they are also the quick check for a unit the learner skips. Every question must be right:',
    'one correct option, and the facts, numbers and terms in it true. Work each question yourself before you submit it.',
    '',
    `For each unit you are asked for, write ${PER_UNIT} multiple-choice questions (the answer plus exactly three wrong options):`,
    '- Each checks a skill this unit teaches, at the level of someone who has just finished the unit.',
    '- A learner who stopped at the end of the PREVIOUS unit should usually get it wrong: it needs this unit\'s new skill,',
    '  not only earlier ones. Do not test later units.',
    '- The three questions check different lessons or skills of the unit where it has more than one.',
    '- Wrong options are the mistakes a learner who has not learned this unit would actually make. All four options',
    '  are the same kind of thing and about the same length; the answer must not stand out by length, wording or detail.',
    '- No "all/none of the above", no trick wording, no question that needs a picture. Describe what a picture would show',
    '  in words; small counts may use emoji (for example 🍎🍎🍎). Keep the wording at the reading level of the grade.',
    '- Self-contained: the question gives everything needed. For a reading skill, include the short passage in the prompt.',
  ].join('\n');
}

function user(trackId, gradeId, units, wanted, have = {}) {
  const grade = curriculum.getGrade(trackId, gradeId);
  const lines = units.map((u, i) => {
    const mark = wanted.includes(i + 1) ? '>>' : '  ';
    const lessons = u.lessons.map((l) => `${l.title}${l.covers ? ` — ${String(l.covers).slice(0, 220)}` : ''}`).join('\n      ');
    const existing = (have[i + 1] || []).map((q) => `\n      already written (do not repeat or paraphrase): ${q.prompt.slice(0, 200)}`).join('');
    const need = wanted.includes(i + 1) ? ` [write ${PER_UNIT - (have[i + 1] || []).length} new]` : '';
    return `${mark} U${i + 1}${need}:\n      ${lessons}${existing}`;
  }).join('\n');
  return `GRADE: ${grade.name}\n\nUNITS IN ORDER (write for the ones marked >>; the rest are context):\n${lines}\n\n`
    + `Write the number of NEW questions shown for each of units ${wanted.map((n) => `U${n}`).join(', ')}; each must check a different skill or angle from any already written.`;
}

function outPath(trackId) { return path.join(OUT_DIR, `${trackId}.json`); }
function readBank(trackId) {
  try { return JSON.parse(fs.readFileSync(outPath(trackId), 'utf8')); } catch { return { track_id: trackId, grades: {} }; }
}
function saveBank(trackId, bank) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath(trackId), JSON.stringify(bank, null, 1));
}

/** One question as stored, or null when it cannot be asked as written. */
function clean(q) {
  // A model that returns the answer as a list (all four options) must not slip through as one joined string.
  if (Array.isArray(q.answer)) return null;
  const answer = String(q.answer || "").trim();
  const wrong = (Array.isArray(q.wrong) ? q.wrong : []).map((w) => String(w || '').trim()).filter(Boolean);
  const unique = new Set([answer.toLowerCase(), ...wrong.map((w) => w.toLowerCase())]);
  if (!answer || !String(q.prompt || '').trim() || wrong.length !== 3 || unique.size !== 4) return null;
  return { skill: String(q.skill || '').slice(0, 80), prompt: String(q.prompt).trim(), answer, choices: [answer, ...wrong] };
}

async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

async function writeTrack(trackId, onlyGrades) {
  // eslint-disable-next-line global-require
  const mimo = require('../services/providers/mimo');
  // UNIT_WRITER=xkiro writes with the xKiro free plan's $0 models instead (pipeline only; MiMo's key
  // returned 401 on 2026-10-29). UNIT_WRITER_MODELS overrides the model list, first that answers wins.
  let writer = mimo;
  if (process.env.UNIT_WRITER === 'xkiro') {
    process.env.XKIRO_PIPELINE = '1';
    // eslint-disable-next-line global-require
    const { xkiro } = require('../services/providers/xkiro');
    const models = String(process.env.UNIT_WRITER_MODELS || 'mistralai/mistral-large-2512,cohere/command-a-reasoning').split(',');
    writer = { structuredStream: async ({ system, user, schema, schemaName, maxTokens }) => {
      let last = null;
      for (const m of models) {
        try { return await xkiro.structured({ system, user, schema, schemaName, maxTokens: Math.min(maxTokens, 16000), models: [m], timeoutMs: 10 * 60 * 1000 }); } catch (e) { last = e; }
      }
      throw last;
    } };
  }
  const bank = readBank(trackId);
  const trackName = (curriculum.getTrack(trackId) || {}).name || trackId;
  const jobs = [];
  for (const gradeId of rules.gradesFor(trackId)) {
    if (onlyGrades && !onlyGrades.includes(gradeId)) continue;
    const units = unitsOf(trackId, gradeId);
    const have = bank.grades[gradeId] || (bank.grades[gradeId] = { units: units.map((u) => ({ key: u.key, start: u.start, end: u.end, titles: u.lessons.map((l) => l.title), questions: [] })) });
    // The unit list is the curriculum's; if it changed since the bank was written, start the grade over.
    if (have.units.length !== units.length || have.units.some((u, i) => u.key !== units[i].key)) {
      bank.grades[gradeId] = { units: units.map((u) => ({ key: u.key, start: u.start, end: u.end, titles: u.lessons.map((l) => l.title), questions: [] })) };
    }
    const missing = bank.grades[gradeId].units.map((u, i) => (u.questions.length >= PER_UNIT ? null : i + 1)).filter(Boolean);
    for (let i = 0; i < missing.length; i += UNITS_PER_CALL) jobs.push({ gradeId, units, wanted: missing.slice(i, i + UNITS_PER_CALL) });
  }
  console.log(`${trackId}: ${jobs.length} calls to make`);
  let failed = 0;
  await pool(jobs, PARALLEL, async (job) => {
    const started = Date.now();
    let reply = null;
    for (let attempt = 1; attempt <= 3 && !reply; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      reply = await writer.structuredStream({
        role: 'placement',
        system: system(trackName),
        user: user(trackId, job.gradeId, job.units, job.wanted, Object.fromEntries(job.wanted.map((n) => [n, bank.grades[job.gradeId].units[n - 1].questions]))),
        schema: SCHEMA,
        schemaName: 'submit_unit_questions',
        maxTokens: 24000,
      }).catch((err) => { console.log(`  ${job.gradeId}: ${err.message}`); return null; });
      if (reply && !(reply.data && Array.isArray(reply.data.units))) reply = null;
    }
    const secs = Math.round((Date.now() - started) / 1000);
    if (!reply) { failed++; console.log(`  ${job.gradeId} U${job.wanted.join(',')}: FAILED after ${secs}s`); return; }
    const grade = bank.grades[job.gradeId];
    let got = 0;
    for (const row of reply.data.units) {
      const n = Number(row.unit);
      if (!job.wanted.includes(n)) continue;
      // Kept questions stay; new ones are added after them, never over them.
      const kept = grade.units[n - 1].questions;
      const seen = new Set(kept.map((q) => q.prompt.trim().toLowerCase()));
      const fresh = (row.questions || []).map(clean).filter((q) => q && !seen.has(q.prompt.trim().toLowerCase()));
      if (fresh.length) { grade.units[n - 1].questions = [...kept, ...fresh].slice(0, PER_UNIT); got++; }
    }
    saveBank(trackId, bank);
    console.log(`  ${job.gradeId} U${job.wanted.join(',')}: ${got}/${job.wanted.length} units in ${secs}s`);
  });
  const units = Object.values(bank.grades).flatMap((g) => g.units);
  const short = units.filter((u) => u.questions.length < PER_UNIT).length;
  console.log(`${trackId}: ${units.length - short}/${units.length} units complete${failed ? `, ${failed} calls failed` : ''}`);
  return !short;
}

if (require.main === module) {
  const tracks = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const g = process.argv.find((a) => a.startsWith('--grades='));
  const onlyGrades = g ? g.split('=')[1].split(',') : null;
  (async () => {
    let ok = true;
    for (const t of tracks) ok = (await writeTrack(t, onlyGrades)) && ok; // eslint-disable-line no-await-in-loop
    process.exitCode = ok ? 0 : 1;
  })().catch((err) => { console.error(err); process.exitCode = 1; });
}

module.exports = { clean, readBank, outPath };
