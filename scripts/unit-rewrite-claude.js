/**
 * Hand the in-grade placement questions whose key a judge doubts to Claude to
 * rewrite, and bring the rewrites back into the bank.
 *
 *   node scripts/unit-rewrite-claude.js export math <dir>     batches of flagged questions, as .md briefs
 *   node scripts/unit-rewrite-claude.js import math <file>    a batch's JSON replacements into the bank
 *
 * MiMo rewrites (scripts/revise-unit-placement.js) are fine for pitch, but on
 * keys they kept introducing new errors (a wrong sign in a matrix product, a
 * fabricated quotation, a misattributed theatre), and the blind Claude judge
 * doubted 8% of math unit keys. A question whose key either judge doubts is
 * rewritten by Claude with a worked check instead; both judges then read the
 * replacement again.
 */
const path = require('path');
const fs = require('fs');

const curriculum = require('../config/curriculum');
const rules = require('../config/subject-placement');
const testers = require('./placement-testers');
const { clean, readBank, outPath } = require('./generate-unit-placement');

const DIR = path.join(__dirname, '..', 'curriculum-build', 'placement-judge');
const read = (name) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8')); } catch { return {}; } };

const BRIEF = [
  'Each section below is one grade: its units (U1 first, with what each lesson covers) and placement questions that',
  'need replacing: either a reviewer doubted the answer key, or the key is fine but two judges place the question well',
  'away from its unit (the problem line says which). For EACH question write ONE replacement for the same',
  'unit: it checks a skill that unit teaches, at the level of someone who has just finished the unit, and a learner who',
  'stopped at the end of the previous unit should usually get it wrong.',
  '',
  'Rules: exactly one correct option, which you work out fully and then verify a second, independent way; three wrong',
  'options that are unambiguously wrong, each a mistake a learner who has not learned the unit would make; all four',
  'options the same kind of thing and similar length; no "all/none of the above"; nothing that needs a picture (describe',
  'it; small counts may use emoji); self-contained; every fact, quotation, name and date must be real and checkable —',
  'never invent a quotation or attribute one you are not certain of; at the reading level of the grade. Prefer a crisp',
  'computation or a precise, standard fact over a judgement call.',
].join('\n');

// How far (in units) the judges' average may put a question from the unit it was
// written for before it is rewritten too. UNIT_TOL=off leaves pitch alone.
const PITCH_TOL = process.env.UNIT_TOL === 'off' ? Infinity : Number(process.env.UNIT_TOL || 1);

function flaggedKeys(trackId) {
  const both = read(`${trackId}-units-both`);
  const mean = read(`${trackId}-units-mean`);
  const out = [];
  for (const gradeId of rules.gradesFor(trackId)) {
    for (const q of testers.unitQuestions(trackId, gradeId)) {
      const v = both[q.key];
      const m = mean[q.key];
      if (v && v.key !== 'correct') out.push({ gradeId, q, v });
      else if (m && Math.abs(m.unit - q.unit) > PITCH_TOL) out.push({ gradeId, q, v: m, pitch: m.unit - q.unit });
    }
  }
  return out;
}

/** What the reviewers said, or for a pitch rewrite, where the judges placed it. */
function problemOf(it, a, b) {
  if (it.pitch === undefined) return [a[it.q.key], b[it.q.key]].filter((x) => x && x.key !== 'correct').map((x) => `${x.key}: ${x.note}`).join(' | ');
  const at = it.v.unit === 0 ? 'before this grade starts' : `by U${Math.round(it.v.unit)}`;
  return it.pitch < 0
    ? `key fine, but too easy: two judges find it answerable ${at}, well before U${it.q.unit}. The replacement must need what U${it.q.unit} newly teaches.`
    : `key fine, but too hard: two judges find it answerable only ${at}, after U${it.q.unit}. The replacement must need only U${it.q.unit} and earlier.`;
}

function exportBatches(trackId, dir, perFile = 30) {
  const items = flaggedKeys(trackId);
  const a = read(`${trackId}-units`);
  const b = read(`${trackId}-units-claude`);
  const files = [];
  for (let i = 0; i < items.length; i += perFile) {
    const batch = items.slice(i, i + perFile);
    const byGrade = new Map();
    for (const it of batch) {
      if (!byGrade.has(it.gradeId)) byGrade.set(it.gradeId, []);
      byGrade.get(it.gradeId).push(it);
    }
    const sections = [];
    for (const [gradeId, list] of byGrade) {
      const units = testers.unitsOf(trackId, gradeId).map((u, k) => `U${k + 1}: ${u.lessons.map((l) => `${l.title}${l.covers ? ` — ${String(l.covers).slice(0, 160)}` : ''}`).join(' | ')}`).join('\n');
      sections.push(`## GRADE ${gradeId}: ${curriculum.getGrade(trackId, gradeId).name}`, '', 'UNITS', units, '', 'QUESTIONS TO REPLACE', '');
      for (const it of list) {
        sections.push(`id: ${it.q.key} (belongs to U${it.q.unit})`, `old question: ${it.q.prompt}`, `old options: ${it.q.choices.map((c) => `[${c}]`).join(' ')}`, `old key: ${it.q.answer}`, `problem: ${problemOf(it, a, b)}`, '');
      }
    }
    const file = path.join(dir, `rewrite-${trackId}-${files.length + 1}.md`);
    fs.writeFileSync(file, [`# Rewrite doubted placement questions: ${trackId}`, '', BRIEF, '', ...sections].join('\n'));
    files.push({ file, count: batch.length });
  }
  return files;
}

function importBatch(trackId, file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).questions || [];
  const bank = readBank(trackId);
  let done = 0;
  for (const row of rows) {
    const fresh = clean(row);
    if (!fresh) continue;
    for (const g of Object.values(bank.grades)) {
      for (const u of g.units) {
        const at = u.questions.findIndex((q) => testers.keyOf(q) === String(row.id).trim());
        if (at < 0) continue;
        const old = u.questions[at];
        u.questions[at] = { ...fresh, revised: (old.revised || 0) + 1, writer: 'claude', why: `Key doubted; rewritten by Claude with a worked check: ${String(row.check || '').slice(0, 300)}`, replaced: old.prompt.slice(0, 200) };
        done++;
      }
    }
  }
  fs.writeFileSync(outPath(trackId), JSON.stringify(bank, null, 1));
  return done;
}

module.exports = { flaggedKeys, exportBatches, importBatch };

if (require.main === module) {
  const [cmd, trackId, arg] = process.argv.slice(2);
  if (cmd === 'export') console.log(JSON.stringify(exportBatches(trackId, arg).map((f) => f.count)));
  else if (cmd === 'import') console.log(`${importBatch(trackId, arg)} replaced`);
  else console.log('usage: export|import <track> <dir|file>');
}
