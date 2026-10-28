/**
 * A second, independent judge for the placement questions: Claude, reading blind.
 *
 *   node scripts/placement-second-judge.js export english <dir>   batches of 40 not yet judged, as .md
 *   node scripts/placement-second-judge.js import english <file>  a batch's JSON verdicts into the cache
 *   node scripts/placement-second-judge.js both english           merge the two judges into <track>-both.json
 *   node scripts/placement-second-judge.js compare english        how far the two agree
 *
 * The first judge (MiMo, scripts/placement-testers.js judge) is also the one the
 * rewrites were aimed at, so a question can end up pitched to its taste rather
 * than to where it belongs. Claude reads the same outline and questions with no
 * hint of the grade they were written for; its verdicts are kept in
 * curriculum-build/placement-judge/<track>-claude.json in the same shape.
 *
 * `both` keeps, for every question, the reading that makes it look EASIER (the
 * earlier point) and the worse key verdict. Testers run on it
 * (`JUDGE_TAG=-both placement-testers.js run ...`) are held to the stricter of
 * the two judges: a question either judge thinks is too easy counts as too easy.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const rules = require('../config/subject-placement');
const testers = require('./placement-testers');

const DIR = path.join(ROOT, 'curriculum-build', 'placement-judge');
const read = (name) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8')); } catch { return {}; } };
const write = (name, data) => fs.writeFileSync(path.join(DIR, `${name}.json`), JSON.stringify(data, null, 1));

const INSTRUCTIONS = 'For each question: the FIRST point in this curriculum (grade G and unit U) by which a learner who has '
  + 'worked through everything up to and including that unit would reliably answer it (about 9 in 10 such learners right). '
  + 'Judge from what it requires; multiple choice is answered by recognising the right option, and everyday knowledge or '
  + 'an earlier skill means an earlier point. Then check the key: correct / wrong / ambiguous (another option also defensible).';

function exportBatches(trackId, dir, size = 40) {
  const done = read(`${trackId}-claude`);
  const todo = testers.allQuestions(trackId).filter((q) => !done[q.key]);
  let s = 0xbeef;
  const order = todo.map((q) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return [s, q]; }).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const titles = rules.gradesFor(trackId).length > 20 ? 1 : 2;
  const files = [];
  for (let i = 0; i < order.length; i += size) {
    const batch = order.slice(i, i + size);
    const file = path.join(dir, `blind-${trackId}-${files.length + 1}.md`);
    fs.writeFileSync(file, [
      `# Blind placement-question check: ${trackId}`, '', INSTRUCTIONS, '', '## Curriculum outline', '', testers.outline(trackId, titles), '', '## Questions', '',
      ...batch.map((q) => `id: ${q.key}\nquestion: ${q.prompt}\noptions: ${(q.choices || []).map((c) => `[${c}]`).join(' ')}\nkeyed answer: ${q.answer}\n`),
    ].join('\n'));
    files.push({ file, count: batch.length });
  }
  return files;
}

function importBatch(trackId, file) {
  const cache = read(`${trackId}-claude`);
  const gradeIds = rules.gradesFor(trackId);
  const byKey = new Map(testers.allQuestions(trackId).map((q) => [q.key, q]));
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).questions || [];
  let got = 0;
  for (const r of rows) {
    const q = byKey.get(String(r.id).trim());
    const gi = Number(r.grade) - 1;
    if (!q || !(gi >= 0 && gi < gradeIds.length)) continue;
    const units = testers.unitsOf(trackId, gradeIds[gi]).length;
    cache[q.key] = {
      written_for: q.grade_id, band: q.band, grade_id: gradeIds[gi], grade_index: gi,
      unit: Math.max(1, Math.min(units, Number(r.unit) || 1)), units,
      key: ['correct', 'wrong', 'ambiguous'].includes(r.key) ? r.key : 'ambiguous',
      note: String(r.note || ''), prompt: String(q.prompt).slice(0, 160), judge: 'claude',
    };
    got++;
  }
  write(`${trackId}-claude`, cache);
  return got;
}

const pointOf = (v) => v.grade_index + (v.unit - 0.5) / v.units;
const WORSE = { correct: 0, ambiguous: 1, wrong: 2 };

function both(trackId) {
  const a = read(trackId);
  const b = read(`${trackId}-claude`);
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key];
    const y = b[key];
    if (!x || !y) { out[key] = x || y; continue; }
    const easier = pointOf(y) < pointOf(x) ? y : x;
    out[key] = {
      ...easier,
      key: WORSE[y.key] > WORSE[x.key] ? y.key : x.key,
      note: [x.key !== 'correct' ? `MiMo: ${x.note}` : '', y.key !== 'correct' ? `Claude: ${y.note}` : ''].filter(Boolean).join(' | '),
      judge: 'both',
    };
  }
  write(`${trackId}-both`, out);
  return Object.keys(out).length;
}

/**
 * The two judges averaged: what the app calibrates on (each question's point is
 * the mean of where the two put it). Testing a walk calibrated on this against
 * each judge on its own is the held-out check.
 */
function mean(trackId) {
  const a = read(trackId);
  const b = read(`${trackId}-claude`);
  const gradeIds = rules.gradesFor(trackId);
  const out = {};
  for (const key of Object.keys(a)) {
    const x = a[key];
    const y = b[key];
    if (!y) continue;
    const p = (pointOf(x) + pointOf(y)) / 2;
    if (!Number.isFinite(p)) continue; // an older verdict without a unit
    const gi = Math.max(0, Math.min(gradeIds.length - 1, Math.floor(p)));
    const units = testers.unitsOf(trackId, gradeIds[gi]).length;
    out[key] = {
      ...x,
      grade_index: gi,
      grade_id: gradeIds[gi],
      unit: Math.max(1, Math.min(units, Math.round((p - gi) * units + 0.5))),
      units,
      point: Number(p.toFixed(3)),
      spread: Number(Math.abs(pointOf(x) - pointOf(y)).toFixed(2)),
      key: WORSE[y.key] > WORSE[x.key] ? y.key : x.key,
      judge: 'mean',
    };
  }
  write(`${trackId}-mean`, out);
  return Object.keys(out).length;
}

/**
 * Write the calibration the app reads (content/placement-calibration/<track>.json):
 * each current question's point, the mean of the two judges. Run `mean` first.
 */
function calibrate(trackId) {
  const m = read(`${trackId}-mean`);
  const points = {};
  let missing = 0;
  for (const q of testers.allQuestions(trackId)) {
    if (m[q.key] && Number.isFinite(m[q.key].point)) points[q.key] = m[q.key].point;
    else missing++;
  }
  const dir = path.join(ROOT, 'content', 'placement-calibration');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${trackId}.json`), JSON.stringify({
    track_id: trackId,
    made_at: new Date().toISOString(),
    judges: ['mimo-v2.6-pro (token plan)', 'claude-sonnet (blind, in-app)'],
    note: 'Each question\'s point in grades from the start of the subject: the mean of the two judges. Read by services/subject-placement.js calibrationFor.',
    points,
  }, null, 1));
  return { calibrated: Object.keys(points).length, missing };
}

// ── the unit banks (placement inside a grade) ─────────────────────────────

const curriculum = require('../config/curriculum');

const UNIT_INSTRUCTIONS = 'Each section is one grade: its units in order (U1 first, with what each lesson covers) and '
  + 'placement questions written for that grade. For each question give the FIRST unit U by which a learner who has '
  + 'worked through every unit up to and including U would reliably answer it (about 9 in 10 right); 0 if a learner '
  + 'reliably answers it before the grade starts. Recognising the right option is easier than producing it. Then check '
  + 'it: "correct" if the keyed answer is right and the only right option, "wrong" if not right, "ambiguous" if another '
  + 'option is also defensible, "flawed" if the question itself is broken (refers to something it does not give, needs '
  + 'a picture, gives the answer away). Work each question out yourself.';

function exportUnits(trackId, dir, gradesPerFile = 2) {
  const done = read(`${trackId}-units-claude`);
  const files = [];
  let section = [];
  let count = 0;
  const flush = () => {
    if (!section.length) return;
    const file = path.join(dir, `units-${trackId}-${files.length + 1}.md`);
    fs.writeFileSync(file, [`# Blind unit-question check: ${trackId}`, '', UNIT_INSTRUCTIONS, '', ...section].join('\n'));
    files.push({ file, count });
    section = [];
    count = 0;
  };
  let grades = 0;
  for (const gradeId of rules.gradesFor(trackId)) {
    const todo = testers.unitQuestions(trackId, gradeId).filter((q) => !done[q.key]);
    if (!todo.length) continue;
    const units = testers.unitsOf(trackId, gradeId).map((u, i) => `U${i + 1}: ${u.lessons.map((l) => `${l.title}${l.covers ? ` — ${String(l.covers).slice(0, 160)}` : ''}`).join(' | ')}`).join('\n');
    let s = 0x5eed + gradeId.length;
    const order = todo.map((q) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return [s, q]; }).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    section.push(`## GRADE ${gradeId}: ${curriculum.getGrade(trackId, gradeId).name}`, '', 'UNITS', units, '', 'QUESTIONS', '',
      ...order.map((q) => `id: ${q.key}\nquestion: ${q.prompt}\noptions: ${q.choices.map((c) => `[${c}]`).join(' ')}\nkeyed answer: ${q.answer}\n`), '');
    count += order.length;
    if (++grades % gradesPerFile === 0) flush();
  }
  flush();
  return files;
}

function importUnits(trackId, file) {
  const cache = read(`${trackId}-units-claude`);
  const byKey = new Map();
  for (const gradeId of rules.gradesFor(trackId)) for (const q of testers.unitQuestions(trackId, gradeId)) byKey.set(q.key, { ...q, grade_id: gradeId });
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')).questions || [];
  let got = 0;
  for (const r of rows) {
    const q = byKey.get(String(r.id).trim());
    if (!q) continue;
    cache[q.key] = {
      grade_id: q.grade_id, written_for: q.unit, units: q.units, slot: q.slot,
      unit: Math.max(0, Math.min(q.units, Number(r.unit) || 0)),
      key: ['correct', 'wrong', 'ambiguous', 'flawed'].includes(r.key) ? r.key : 'ambiguous',
      note: String(r.note || ''), prompt: String(q.prompt).slice(0, 160), judge: 'claude',
    };
    got++;
  }
  write(`${trackId}-units-claude`, cache);
  return got;
}

/**
 * The unit judges merged: `-units-both` (the easier unit and the worse key, the
 * strict test) and `-units-mean`, then the calibration the app reads
 * (content/unit-placement-calibration/<track>.json: each question's point in
 * units from the start of the grade).
 */
function calibrateUnits(trackId) {
  // eslint-disable-next-line global-require
  const unitPlacement = require('../services/unit-placement');
  const a = read(`${trackId}-units`);
  const b = read(`${trackId}-units-claude`);
  const bothOut = {};
  const meanOut = {};
  const points = {};
  for (const key of Object.keys(a)) {
    const x = a[key];
    const y = b[key];
    if (!y) { bothOut[key] = x; continue; }
    const worse = WORSE_UNIT[y.key] > WORSE_UNIT[x.key] ? y.key : x.key;
    bothOut[key] = { ...(y.unit < x.unit ? y : x), key: worse, judge: 'both' };
    const unit = (x.unit + y.unit) / 2;
    meanOut[key] = { ...x, unit, key: worse, spread: Math.abs(x.unit - y.unit), judge: 'mean' };
    points[key] = Number((unit - 1 + unitPlacement.UNIT_AT).toFixed(3));
  }
  write(`${trackId}-units-both`, bothOut);
  write(`${trackId}-units-mean`, meanOut);
  const dir = path.join(ROOT, 'content', 'unit-placement-calibration');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${trackId}.json`), JSON.stringify({
    track_id: trackId,
    made_at: new Date().toISOString(),
    judges: ['mimo-v2.6-pro (token plan)', 'claude-sonnet (blind, in-app)'],
    note: 'Each unit question\'s point in units from the start of its grade: the mean of the two judges. Read by services/unit-placement.js.',
    points,
  }, null, 1));
  return { calibrated: Object.keys(points).length, mimo_only: Object.keys(a).length - Object.keys(points).length };
}
const WORSE_UNIT = { correct: 0, ambiguous: 1, flawed: 2, wrong: 2 };

function compare(trackId) {
  const a = read(trackId);
  const b = read(`${trackId}-claude`);
  const keys = Object.keys(b).filter((k) => a[k]);
  const d = keys.map((k) => pointOf(b[k]) - pointOf(a[k]));
  const n = d.length || 1;
  return {
    questions: keys.length,
    mean_abs: Number((d.reduce((s, x) => s + Math.abs(x), 0) / n).toFixed(2)),
    mean_claude_minus_mimo: Number((d.reduce((s, x) => s + x, 0) / n).toFixed(2)),
    within_one_grade: d.filter((x) => Math.abs(x) <= 1).length,
    keys_agree: keys.filter((k) => (a[k].key === 'correct') === (b[k].key === 'correct')).length,
  };
}

module.exports = { exportBatches, importBatch, both, mean, calibrate, compare, exportUnits, importUnits, calibrateUnits };

if (require.main === module) {
  const [cmd, trackId, arg] = process.argv.slice(2);
  if (cmd === 'export') console.log(JSON.stringify(exportBatches(trackId, arg), null, 1));
  else if (cmd === 'import') console.log(`${importBatch(trackId, arg)} verdicts imported`);
  else if (cmd === 'both') console.log(`${both(trackId)} merged into ${trackId}-both.json`);
  else if (cmd === 'mean') console.log(`${mean(trackId)} averaged into ${trackId}-mean.json`);
  else if (cmd === 'calibrate') console.log(JSON.stringify(calibrate(trackId)));
  else if (cmd === 'export-units') console.log(JSON.stringify(exportUnits(trackId, arg).map((f) => f.count)));
  else if (cmd === 'import-units') console.log(`${importUnits(trackId, arg)} unit verdicts imported`);
  else if (cmd === 'calibrate-units') console.log(JSON.stringify(calibrateUnits(trackId)));
  else if (cmd === 'compare') console.log(JSON.stringify(compare(trackId)));
  else console.log('usage: export|import|both|compare <track> [dir|file]');
}
