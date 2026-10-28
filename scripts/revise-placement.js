/**
 * Rewrite the subject placement questions the simulated testers' judge found
 * mispitched or wrongly keyed.
 *
 *   node scripts/revise-placement.js english            rewrite what the judge flagged
 *   node scripts/revise-placement.js english --dry      list what would be rewritten
 *   node scripts/revise-placement.js math --tol=0.6
 *
 * A question is flagged when its key is not cleanly right, or when the point the
 * judge puts it at (scripts/placement-testers.js judge) is more than `tol` grades
 * from the point it was written for: its grade plus how far through the grade its
 * band sits. The rewrite is told the unit it has to need and why the old one
 * missed. Replacements go to content/placement-revisions/<track>.json, which
 * services/subject-placement.js lays over the set; run the judge again afterwards
 * and it judges only the questions that changed.
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

const REV_DIR = path.join(ROOT, 'content', 'placement-revisions');
const PARALLEL = Number(process.env.WRITE_PARALLEL || 3);

function revPath(trackId) { return path.join(REV_DIR, `${trackId}.json`); }
function readRevisions(trackId) {
  try { return JSON.parse(fs.readFileSync(revPath(trackId), 'utf8')); } catch { return {}; }
}

/** Where a question was written for, and where the judge puts it, in grades from the start of the subject. */
function points(q, v) {
  const units = testers.unitsOf(q.track_id, q.grade_id).length;
  const intended = q.grade_index + testers.BAND_AT[q.band];
  const judged = v ? v.grade_index + (v.unit - 0.5) / v.units : null;
  const target = q.band === 'capstone' ? units : Math.max(1, Math.ceil(testers.BAND_AT[q.band] * units));
  return { intended, judged, target, units };
}

function flagged(trackId, tol) {
  const verdicts = testers.readCache(trackId);
  const out = [];
  // REVISE_GRADES=a,b: only those grades (plus any question with a bad key anywhere).
  const only = process.env.REVISE_GRADES ? process.env.REVISE_GRADES.split(",") : null;
  for (const q of testers.allQuestions(trackId).map((x) => ({ ...x, track_id: trackId }))) {
    const v = verdicts[q.key];
    if (!v) continue;
    const p = points(q, v);
    const off = p.judged - p.intended;
    const keyBad = v.key !== 'correct';
    if (only && !only.includes(q.grade_id) && !keyBad) continue;
    // REVISE_SPREAD=1: with the walk calibrated on where questions really sit, a
    // question pitched off its band is fine; what still hurts is one the two judges
    // disagree about (run on JUDGE_TAG=-mean, which carries the spread).
    const spread = Number(process.env.REVISE_SPREAD);
    if (spread) { if (!keyBad && !(v.spread > spread)) continue; } else if (!keyBad && Math.abs(off) <= tol) continue;
    out.push({ q, v, p, off, keyBad });
  }
  return out;
}

function why(item, gradeIds) {
  const { v, p, off, keyBad } = item;
  const parts = [];
  if (keyBad) parts.push(`The key was judged ${v.key}: ${v.note}`);
  if (v.spread > 1) parts.push(`Two careful readers placed this ${v.spread.toFixed(1)} grades apart, so it is not clear what it tests: make it unmistakably need one skill taught at the target unit, nothing a reader could answer from general sense or from a much later grade.`);
  if (Math.abs(off) > 0.01 && !keyBad) {
    const where = `G${v.grade_index + 1} ${curriculum.getGrade(item.q.track_id, gradeIds[v.grade_index]).name}, unit ${v.unit} of ${v.units}`;
    parts.push(off < 0
      ? `Too easy: a learner reliably answers it by ${where}, ${Math.abs(off).toFixed(1)} grades before the point it is meant for.`
      : `Too hard: a learner only reliably answers it by ${where}, ${off.toFixed(1)} grades after the point it is meant for.`);
  }
  return parts.join(' ');
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
        required: ['slot', 'topic', 'prompt', 'answer', 'wrong'],
        properties: {
          slot: { type: 'integer' },
          topic: { type: 'string' },
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
    `You rewrite placement questions for a ${trackName} course whose grades run from the first steps to expert level.`,
    'A placement question is pitched at one point in the course: a learner who has worked through the course up to that',
    'point answers it reliably, and a learner who stopped about half a grade earlier mostly cannot. Each question you are',
    'given missed its point (or had a bad key); write a replacement that hits it.',
    '',
    '- It must need the skill or knowledge taught at the target unit (or just before it), not only earlier skills,',
    '  everyday knowledge or test-taking sense. Being longer or wordier does not make a question harder.',
    '- One correct option and exactly three wrong ones. The answer must be right and the only right option; work it',
    '  yourself. Wrong options are the mistakes a learner below the target would make, the same kind of thing as the',
    '  answer and about the same length. No "all/none of the above", no trick wording, nothing that needs a picture.',
    '- Self-contained, factual, at the reading level of the grade. Questions that are judgement calls (best practice,',
    '  strongest argument) must have one option that experts in the field would clearly agree is best.',
  ].join('\n');
}

function user(trackId, gradeIndex, items, gradeIds) {
  const gradeId = gradeIds[gradeIndex];
  const grade = curriculum.getGrade(trackId, gradeId);
  const units = testers.unitsOf(trackId, gradeId).map((u, i) => `U${i + 1}: ${u.lessons.map((l) => `${l.title}${l.covers ? ` — ${String(l.covers).slice(0, 160)}` : ''}`).join(' | ')}`).join('\n');
  const neighbours = [gradeIndex - 1, gradeIndex + 1].filter((i) => i >= 0 && i < gradeIds.length)
    .map((i) => `G${i + 1} ${curriculum.getGrade(trackId, gradeIds[i]).name}`).join('; ');
  const list = items.map((it) => [
    `slot ${it.q.index} (${it.q.band}) — target: G${gradeIndex + 1} U${it.p.target} of ${it.p.units}`,
    `problem: ${why(it, gradeIds)}${it.q.revised ? ' This slot has already been rewritten and still missed: anchor the new question on something only this unit teaches (a term, distinction or technique a learner half a grade earlier would not know), not on a longer or more careful reading.' : ''}`,
    `old question: ${it.q.prompt}`,
    `old options: ${(it.q.choices || []).map((c) => `[${c}]`).join(' ')}  keyed: ${it.q.answer}`,
  ].join('\n')).join('\n\n');
  return `GRADE G${gradeIndex + 1} of ${gradeIds.length}: ${grade.name}\nNeighbouring grades: ${neighbours}\n\nUNITS OF THIS GRADE\n${units}\n\nQUESTIONS TO REPLACE\n${list}`;
}

async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

async function revise(trackId, { tol = 0.6, dry = false } = {}) {
  const gradeIds = rules.gradesFor(trackId);
  const items = flagged(trackId, tol);
  const byGrade = new Map();
  for (const it of items) {
    if (!byGrade.has(it.q.grade_index)) byGrade.set(it.q.grade_index, []);
    byGrade.get(it.q.grade_index).push(it);
  }
  console.log(`${trackId}: ${items.length} questions flagged (tolerance ${tol} grades) across ${byGrade.size} grades`);
  for (const it of items) console.log(`  G${it.q.grade_index + 1} slot ${it.q.index} ${it.q.band.padEnd(8)} ${it.keyBad ? `KEY ${it.v.key}` : `off ${it.off.toFixed(1)}`}  ${it.q.prompt.slice(0, 90)}`);
  if (dry || !items.length) return items.length;

  // eslint-disable-next-line global-require
  const mimo = require('../services/providers/mimo');
  const revisions = readRevisions(trackId);
  const round = 1 + Math.max(0, ...Object.values(revisions).flatMap((g) => Object.values(g).map((r) => r.round || 0)));
  const trackName = (curriculum.getTrack(trackId) || {}).name || trackId;
  let written = 0;
  await pool([...byGrade.entries()], PARALLEL, async ([gi, list]) => {
    const started = Date.now();
    let reply = null;
    for (let attempt = 1; attempt <= 3 && !reply; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      reply = await mimo.structuredStream({
        role: 'placement', system: system(trackName), user: user(trackId, gi, list, gradeIds),
        schema: SCHEMA, schemaName: 'submit_replacements', maxTokens: 20000,
      }).catch((err) => { console.log(`  G${gi + 1}: ${err.message}`); return null; });
      if (reply && !(reply.data && Array.isArray(reply.data.questions))) reply = null;
    }
    if (!reply) { console.log(`  G${gi + 1}: FAILED`); return; }
    const gradeId = gradeIds[gi];
    for (const row of reply.data.questions) {
      const it = list.find((x) => x.q.index === Number(row.slot));
      const answer = String(row.answer || '').trim();
      const wrong = (row.wrong || []).map((w) => String(w || '').trim()).filter(Boolean);
      if (!it || !answer || wrong.length !== 3 || new Set([answer, ...wrong].map((x) => x.toLowerCase())).size !== 4) continue;
      const mine = revisions[gradeId] || (revisions[gradeId] = {});
      mine[String(it.q.index)] = {
        round, topic: String(row.topic || '').slice(0, 80), prompt: String(row.prompt).trim(), answer, choices: [answer, ...wrong],
        why: why(it, gradeIds).slice(0, 400), replaced: it.q.prompt.slice(0, 300),
      };
      written++;
    }
    fs.mkdirSync(REV_DIR, { recursive: true });
    fs.writeFileSync(revPath(trackId), JSON.stringify(revisions, null, 1));
    console.log(`  G${gi + 1}: ${list.length} rewritten in ${Math.round((Date.now() - started) / 1000)}s`);
  });
  console.log(`${trackId}: round ${round}, ${written}/${items.length} replacements written to ${path.relative(ROOT, revPath(trackId))}`);
  return items.length;
}

module.exports = { flagged, points, revise };

if (require.main === module) {
  const trackId = process.argv[2];
  const t = process.argv.find((a) => a.startsWith('--tol='));
  revise(trackId, { tol: t ? Number(t.split('=')[1]) : 0.6, dry: process.argv.includes('--dry') })
    .catch((err) => { console.error(err); process.exitCode = 1; });
}
