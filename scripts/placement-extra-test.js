/**
 * The extra top-end placement items (content/placement-extra/<track>.json, services/subject-placement.js withExtras).
 *
 * What is proven here, with no model call:
 *   - every extra item is well formed: four distinct options holding the answer, no giveaway by length, no repeat of a
 *     prompt, a band, and a calibrated point (content/placement-calibration/<track>.json) that sits in the grade the item is
 *     filed under, so the adaptive walk places by where the item really is;
 *   - the adaptive walk sees them (appended after the grade's seven stored questions, flagged `extra`, calibrated `pos`),
 *     the full climb does not (`questionsFor(..., {core: true})` is still exactly seven), and the stored questions keep
 *     their indexes;
 *   - the top two grades of IQ and the top four of ACT now hold enough calibrated items to prove a ceiling
 *     (adaptive.CEILING.min in each of the top two grades; scripts/placement-ceiling-test.js uses the same bank).
 * The accuracy claim itself (95% within one grade at every level) is scripts/placement-accuracy-test.js.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-extra-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const db = require('../config/db');
const rules = require('../config/subject-placement');
const adaptive = require('../services/adaptive-placement');
const subjectPlacement = require('../services/subject-placement');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const ROOT = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const norm = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();
// Same rule as services/subject-placement.js lengthCue.
function lengthCue(choices, answer) {
  const a = String(answer).trim();
  const options = choices.map((c) => String(c).trim());
  const others = options.filter((c) => c !== a).map((c) => c.length);
  if (options.length < 3 || !a.length || !others.length) return false;
  const mean = others.reduce((x, y) => x + y, 0) / others.length;
  const max = Math.max(...others);
  return (a.length >= 1.8 * mean && a.length - max >= 10) || (max >= 1.8 * a.length && max - a.length >= 10);
}

const TRACKS = fs.readdirSync(path.join(ROOT, 'content', 'placement-extra')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
check('there is at least one extras file', TRACKS.length > 0);

for (const trackId of TRACKS) {
  console.log(`\n${trackId}`);
  const extra = read(path.join(ROOT, 'content', 'placement-extra', `${trackId}.json`));
  const cal = read(path.join(ROOT, 'content', 'placement-calibration', `${trackId}.json`)).points;
  const gradeIds = rules.gradesFor(trackId);
  const seen = new Set();
  const problems = [];
  let n = 0;
  for (const [gradeId, list] of Object.entries(extra.grades)) {
    const gi = gradeIds.indexOf(gradeId);
    if (gi < 0) { problems.push(`${gradeId}: not a grade of ${trackId}`); continue; }
    for (const q of list) {
      n++;
      const where = `${gradeId} "${String(q.prompt).slice(0, 40)}"`;
      const choices = q.choices || [];
      if (!q.prompt || !q.answer) problems.push(`${where}: no prompt or answer`);
      if (choices.length !== 4 || new Set(choices.map(norm)).size !== 4) problems.push(`${where}: options are not four distinct`);
      if (!choices.some((c) => String(c).trim() === String(q.answer).trim())) problems.push(`${where}: the answer is not among the options`);
      if (lengthCue(choices, q.answer)) problems.push(`${where}: the answer stands out by length`);
      if (!['hard', 'capstone'].includes(q.band)) problems.push(`${where}: band ${q.band}`);
      if (seen.has(norm(q.prompt))) problems.push(`${where}: repeated prompt`);
      seen.add(norm(q.prompt));
      const point = cal[adaptive.questionKey(q)];
      if (!Number.isFinite(point)) problems.push(`${where}: no calibrated point`);
      else if (Math.floor(point) !== gi) problems.push(`${where}: point ${point} is not in grade ${gi + 1}`);
    }
  }
  check(`${n} extra items, every one well formed and calibrated`, n > 0 && !problems.length, problems.slice(0, 5));

  // The walk sees them; the full climb does not. A stored set stands in for the owner's (it lives in data/).
  const dummy = gradeIds.map((id, g) => ({
    grade_id: id,
    questions: Array.from({ length: 7 }, (_, i) => ({ band: rules.MIX[i], prompt: `stored ${g}.${i}`, answer: 'a', choices: ['a', 'b', 'c', 'd'] })),
  }));
  db.insert('placement_question_sets', { track_id: trackId, grade_ids: gradeIds, grades: dummy, written_at: new Date().toISOString() });
  const gradeWithExtras = gradeIds.find((id) => (extra.grades[id] || []).length);
  const have = extra.grades[gradeWithExtras].length;
  const all = subjectPlacement.questionsFor(trackId, gradeWithExtras);
  const core = subjectPlacement.questionsFor(trackId, gradeWithExtras, { core: true });
  check('the walk sees the stored seven then the extras', all.length === 7 + have && all.slice(0, 7).every((q, i) => q.prompt === `stored ${gradeIds.indexOf(gradeWithExtras)}.${i}`), all.length);
  check('the full climb still gets exactly seven', core.length === 7 && core.every((q) => !q.extra));
  check('every extra reaches the walk with its calibrated point', all.slice(7).every((q) => q.extra && Number.isFinite(q.pos)));
  check('extras keep their own band (hard or capstone), not a position band', all.slice(7).every((q) => ['hard', 'capstone'].includes(q.band)));
  const ordinary = gradeIds.find((id) => !(extra.grades[id] || []).length);
  check('a grade with no extras is untouched', subjectPlacement.questionsFor(trackId, ordinary).length === 7);

  // Enough at the top to prove a ceiling.
  const points = Object.values(cal);
  const span = gradeIds.length;
  const topTwo = points.filter((p) => p >= span - adaptive.CEILING.region).length;
  check(`${topTwo} calibrated items in the top ${adaptive.CEILING.region} grades (a ceiling needs at least ${adaptive.CEILING.min}, and the sim wants about 2x that)`, topTwo >= 2 * adaptive.CEILING.min, topTwo);
  const perGrade = Array.from({ length: span }, (_, g) => points.filter((p) => Math.floor(p) === g).length);
  const top = trackId === 'iq' ? [8, 9, 10, 11] : [12, 13, 14, 15];
  check(`each of the top four grades holds at least 3 calibrated items (${top.map((g) => perGrade[g]).join(', ')})`, top.every((g) => perGrade[g] >= 3), perGrade);
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
