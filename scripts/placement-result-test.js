/**
 * P6: the result screen is honest about what it is based on, and "too easy / too hard" moves the learner and is
 * recorded. Runs on a copy of the data file (its own, deleted at the end), under an account named resulttest-*.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');

let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `placement-result-test-${process.pid}.json`);
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
require('../config/db');
process.on('exit', () => { if (ownCopy) try { fs.unlinkSync(ownCopy); } catch { /* gone */ } });

const db = require('../config/db');
const rules = require('../config/subject-placement');
const sp = require('../services/subject-placement');
const router = require('../routes/subject-placement');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const trackId = 'english';
const gradeIds = rules.gradesFor(trackId);
const user = db.insert('users', { email: `resulttest-${process.pid}@example.test`, display_name: 'result test', password_hash: 'x', onboarded: true });
const answered = [];
for (let i = 0; i < 20; i++) answered.push({ pos: 3 + i * 0.1, guess: 0.25, correct: 3 + i * 0.1 < 4.2 });
db.insert('subject_placements', {
  user_id: user.id, track_id: trackId, mode: 'quick', grade_ids: gradeIds, answered, scores: [],
  recommended_grade_id: gradeIds[3], headline: 'Start here.', recommendation: [],
});

console.log('\nwhat the result is based on');
{
  const placement = sp.placementFor(user.id, trackId);
  const result = sp.resultFor(trackId, placement);
  check('the result says how many questions it rests on', result.basis && result.basis.questions === 20, result.basis);
  check('and how sure it is, as a measured share', result.basis && result.basis.sure_percent > 0 && result.basis.sure_percent <= 100, result.basis);
  check('and a plain certainty word', ['clear', 'fair', 'rough'].includes(result.basis.certainty), result.basis);
  check('with no answers nothing is claimed', sp.basisOf(trackId, { grade_ids: gradeIds, answered: [], scores: [] }) === null);
}

console.log('\ntoo easy / too hard');
{
  check('a nonsense answer is refused', !!sp.adjust(user.id, trackId, 'meh').error);
  const hard = sp.adjust(user.id, trackId, 'too_hard');
  check('too hard moves one grade down', hard.placement.recommended_grade_id === gradeIds[2], hard.placement.recommended_grade_id);
  const easy = sp.adjust(user.id, trackId, 'too_easy');
  check('too easy moves one grade up', easy.placement.recommended_grade_id === gradeIds[3]);
  sp.adjust(user.id, trackId, 'too_easy');
  const result = sp.resultFor(trackId, sp.placementFor(user.id, trackId));
  check('the walk\'s own placement is kept', result.walk_grade_id === gradeIds[3], result.walk_grade_id);
  check('every tap is recorded, with where it moved from and to', result.adjustments.length === 3 && result.adjustments[0].said === 'too_hard' && result.adjustments[0].from === gradeIds[3] && result.adjustments[0].to === gradeIds[2], result.adjustments);
  check('the result now recommends the moved grade', result.recommended_grade_id === gradeIds[4]);
  const stored = sp.placementFor(user.id, trackId);
  for (let i = 0; i < gradeIds.length + 2; i++) sp.adjust(user.id, trackId, 'too_easy');
  check('it stops at the top of the subject', sp.placementFor(user.id, trackId).recommended_grade_id === gradeIds[gradeIds.length - 1]);
  for (let i = 0; i < gradeIds.length + 2; i++) sp.adjust(user.id, trackId, 'too_hard');
  check('and at the start', sp.placementFor(user.id, trackId).recommended_grade_id === gradeIds[0]);
  check('the adjustments belong to the placement record, which the export and delete paths already cover', stored.id === sp.placementFor(user.id, trackId).id);
  check('no placement, no move', !!sp.adjust(user.id + 99999, trackId, 'too_hard').error);
}

console.log('\nthe route');
{
  const layer = router.stack.find((l) => l.route && l.route.path === '/:track/adjust' && l.route.methods.post);
  check('POST /:track/adjust exists', !!layer);
}

db.remove('subject_placements', (p) => p.user_id === user.id);
db.remove('users', (u) => u.id === user.id);
db.flush();
if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
