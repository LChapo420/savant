/**
 * Helper for job-placement.js (run as a child process; makes no model calls):
 *   PS_DB=<db copy with the staged sets> node placement-dump.js <out.json> <track...>
 * Writes, per track, the questions exactly as the placement testers key them
 * (scripts/placement-testers.js allQuestions), each with its writer from the staged set,
 * plus the judge prompts the placement pipeline uses (pipeline.js judgeSystem, outline).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const [out, ...tracks] = process.argv.slice(2);
const pipeline = require(path.join(ROOT, 'curriculum-build', 'staged', 'placement-sets', 'pipeline.js')); // sets DB_FILE from PS_DB
const testers = require(path.join(ROOT, 'scripts', 'placement-testers'));
const rules = require(path.join(ROOT, 'config', 'subject-placement'));
const curriculum = require(path.join(ROOT, 'config', 'curriculum'));

// pipeline.js keySystem (not exported), word for word
function keySystem(trackId) {
  const name = (curriculum.getTrack(trackId) || {}).name || trackId;
  return [
    'You are an exacting ' + name + ' examiner checking the answer keys of multiple-choice placement questions.',
    'For each question, work it out yourself first, then compare with the keyed answer:',
    '"correct" if the keyed answer is right and the only right option; "wrong" if it is not right (say the right',
    'answer, even if it is not among the options); "ambiguous" if another option is also defensible; "flawed" if the',
    'question is broken (refers to something it does not give, gives the answer away, or cannot be answered as written).',
    'Answer every question by its id.',
  ].join('\n');
}

const res = {};
for (const t of tracks) {
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'staged', 'placement-sets', `${t}-set.json`), 'utf8'));
  const gradeIds = rules.gradesFor(t);
  const titles = gradeIds.length > 20 ? 1 : 2;
  const writerOf = (q) => { const g = set.grades.find((x) => x.grade_id === q.grade_id); const w = g && g.questions[q.index] && g.questions[q.index].writer; return w || String(set.model || ''); };
  res[t] = {
    name: (curriculum.getTrack(t) || {}).name || t,
    gradeIds,
    units: Object.fromEntries(gradeIds.map((g) => [g, testers.unitsOf(t, g).length])),
    judgeSystem: pipeline.judgeSystem(t, gradeIds.length),
    outline: testers.outline(t, titles),
    keySystem: keySystem(t),
    questions: testers.allQuestions(t).map((q) => ({ key: q.key, grade_id: q.grade_id, grade_index: q.grade_index, index: q.index, band: q.band, prompt: q.prompt, choices: q.choices, answer: q.answer, writer: writerOf(q) })),
  };
}
fs.writeFileSync(out, JSON.stringify(res));
console.log(`dumped ${tracks.map((t) => `${t} ${res[t].questions.length}`).join(', ')}`);
