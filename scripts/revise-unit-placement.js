/**
 * Rewrite the in-grade placement questions the unit judge flagged.
 *
 *   node scripts/revise-unit-placement.js math            rewrite what was flagged
 *   node scripts/revise-unit-placement.js math --dry      list it
 *   node scripts/revise-unit-placement.js math --grades=numbers_to_10
 *
 * Flagged: a key that is not cleanly right (wrong, ambiguous, or a broken
 * question), or a question the judge puts more than one unit before or after
 * the unit it was written for. The replacement is written into the bank
 * (content/unit-placement/<track>.json) in place, with the old question and the
 * reason kept beside it; run `placement-testers.js judge-units` again afterwards
 * and only the changed questions are judged.
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
const testers = require('./placement-testers');
const { clean, readBank, outPath } = require('./generate-unit-placement');

const PARALLEL = Number(process.env.WRITE_PARALLEL || 3);
const TOL = Number(process.env.UNIT_TOL || 1);

function flagged(trackId, onlyGrades) {
  const verdicts = testers.readCache(`${trackId}-units`);
  const out = [];
  for (const gradeId of rules.gradesFor(trackId)) {
    if (onlyGrades && !onlyGrades.includes(gradeId)) continue;
    for (const q of testers.unitQuestions(trackId, gradeId)) {
      const v = verdicts[testers.keyOf(q)];
      if (!v) continue;
      const off = v.unit - q.unit;
      const keyBad = v.key !== 'correct';
      if (!keyBad && Math.abs(off) <= TOL) continue;
      out.push({ gradeId, q, v, off, keyBad });
    }
  }
  return out;
}

function why(it) {
  if (it.keyBad) return `The check found it ${it.v.key}: ${it.v.note}`;
  return it.off < 0
    ? `Too easy: a learner reliably answers it ${it.v.unit === 0 ? 'before this grade starts' : `by U${it.v.unit}`}, ${-it.off} units before U${it.q.unit}. It must need what U${it.q.unit} teaches.`
    : `Too hard: a learner only reliably answers it by U${it.v.unit}, ${it.off} units after U${it.q.unit}. It must need only what U${it.q.unit} and earlier teach.`;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'skill', 'prompt', 'answer', 'wrong'],
        properties: {
          id: { type: 'string' },
          skill: { type: 'string' },
          prompt: { type: 'string' },
          answer: { type: 'string' },
          wrong: { type: 'array', items: { type: 'string' }, description: 'Exactly three wrong options.' },
        },
      },
    },
  },
};

function system(trackName) {
  return [
    `You rewrite placement questions for one grade of a ${trackName} course. Each question belongs to one unit: a learner`,
    'who has finished that unit answers it reliably, and one who stopped at the end of the previous unit usually cannot.',
    'Each question you are given missed that (or was broken); write a replacement that hits it.',
    '',
    '- It must need the new skill of its own unit, not only earlier skills or everyday knowledge, and nothing from later units.',
    '- One correct option and exactly three wrong ones. The answer must be right and the only right option: work it yourself.',
    '  Wrong options are the mistakes a learner who has not learned the unit would make, the same kind of thing as the',
    '  answer and about the same length. No "all/none of the above", no trick wording, nothing that needs a picture',
    '  (describe it in words; small counts may use emoji). Self-contained, factual, at the reading level of the grade.',
  ].join('\n');
}

function user(trackId, gradeId, list) {
  const grade = curriculum.getGrade(trackId, gradeId);
  const units = testers.unitsOf(trackId, gradeId).map((u, i) => `U${i + 1}: ${u.lessons.map((l) => `${l.title}${l.covers ? ` — ${String(l.covers).slice(0, 180)}` : ''}`).join(' | ')}`).join('\n');
  const items = list.map((it) => [
    `id: ${it.q.unit}.${it.q.slot} (belongs to U${it.q.unit})`,
    `problem: ${why(it)}`,
    `old question: ${it.q.prompt}`,
    `old options: ${it.q.choices.map((c) => `[${c}]`).join(' ')}  keyed: ${it.q.answer}`,
  ].join('\n')).join('\n\n');
  return `GRADE: ${grade.name}\n\nUNITS\n${units}\n\nQUESTIONS TO REPLACE\n${items}`;
}

async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

async function revise(trackId, { dry = false, onlyGrades = null } = {}) {
  const items = flagged(trackId, onlyGrades);
  const byGrade = new Map();
  for (const it of items) {
    if (!byGrade.has(it.gradeId)) byGrade.set(it.gradeId, []);
    byGrade.get(it.gradeId).push(it);
  }
  const keyBad = items.filter((i) => i.keyBad).length;
  console.log(`${trackId}: ${items.length} unit questions flagged (${keyBad} keys, ${items.length - keyBad} pitch) across ${byGrade.size} grades`);
  if (dry || !items.length) return items.length;

  // eslint-disable-next-line global-require
  const mimo = require('../services/providers/mimo');
  const trackName = (curriculum.getTrack(trackId) || {}).name || trackId;
  let written = 0;
  const jobs = [];
  for (const [gradeId, list] of byGrade) for (let i = 0; i < list.length; i += 12) jobs.push({ gradeId, list: list.slice(i, i + 12) });
  await pool(jobs, PARALLEL, async ({ gradeId, list }) => {
    const started = Date.now();
    let reply = null;
    for (let attempt = 1; attempt <= 3 && !reply; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      reply = await mimo.structuredStream({
        role: 'placement', system: system(trackName), user: user(trackId, gradeId, list),
        schema: SCHEMA, schemaName: 'submit_replacements', maxTokens: 20000,
      }).catch((err) => { console.log(`  ${gradeId}: ${err.message}`); return null; });
      if (reply && !(reply.data && Array.isArray(reply.data.questions))) reply = null;
    }
    if (!reply) { console.log(`  ${gradeId}: FAILED`); return; }
    // Re-read the bank right before writing: other grades are being written beside this one.
    const bank = readBank(trackId);
    let got = 0;
    for (const row of reply.data.questions) {
      const it = list.find((x) => `${x.q.unit}.${x.q.slot}` === String(row.id).trim());
      const fresh = it && clean(row);
      if (!fresh) continue;
      const unit = bank.grades[gradeId].units[it.q.unit - 1];
      const old = unit.questions[it.q.slot];
      if (!old || old.prompt !== it.q.prompt) continue; // changed underneath; leave it for the next round
      unit.questions[it.q.slot] = { ...fresh, revised: (old.revised || 0) + 1, why: why(it).slice(0, 300), replaced: old.prompt.slice(0, 200) };
      got++;
    }
    fs.writeFileSync(outPath(trackId), JSON.stringify(bank, null, 1));
    written += got;
    console.log(`  ${gradeId}: ${got}/${list.length} rewritten in ${Math.round((Date.now() - started) / 1000)}s`);
  });
  console.log(`${trackId}: ${written}/${items.length} replacements written`);
  return items.length;
}

module.exports = { flagged, revise };

if (require.main === module) {
  const trackId = process.argv[2];
  const g = process.argv.find((a) => a.startsWith('--grades='));
  revise(trackId, { dry: process.argv.includes('--dry'), onlyGrades: g ? g.split('=')[1].split(',') : null })
    .catch((err) => { console.error(err); process.exitCode = 1; });
}
