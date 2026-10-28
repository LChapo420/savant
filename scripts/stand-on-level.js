/**
 * Stand an enrollment on a level, for checking a base lesson's Finish button.
 *
 * The app's own `jumpToLevel` moves forward only — it refuses a target at or
 * behind the current level — so it cannot put an account *back* onto a lesson it
 * has already passed. This does, and it does it by writing the one field that
 * says where a learner is standing.
 *
 * It deliberately does not replay the forward path, which is what makes this
 * different rather than a shortcut around it:
 *
 *   - **No mastery is written.** `jumpToLevel` would record every level from 105
 *     to 274 as cleared at full mastery and stamp each of their events
 *     `skipped: true`. Those are perfect scores for work nobody did, and they
 *     would sit in the event log as something a trained learner model has to be
 *     told to ignore. Nothing is written here instead, so there is nothing to
 *     ignore.
 *   - **No checkpoints are recorded as passed.** The `checkpoints_cleared` map is
 *     left alone, so the levels between 105 and 274 are simply levels this
 *     account has not recorded, and the path will offer the real ones.
 *   - **The Challenge Exam run is untouched.** A run is a record of consecutive
 *     clean levels, and inventing one to move backwards would be a false claim.
 *
 * What it does write is the position, and it says so in the enrollment's own
 * history so the move is not invisible later.
 *
 *   node scripts/stand-on-level.js <userId> <track> <grade> <level>
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const remediation = require('../services/remediation');

const [userIdRaw, trackId, gradeId, levelRaw] = process.argv.slice(2);
const userId = Number(userIdRaw);
const level = Number(levelRaw);

if (!Number.isInteger(userId) || !trackId || !gradeId || !Number.isInteger(level)) {
  console.error('usage: node scripts/stand-on-level.js <userId> <track> <grade> <level>');
  process.exit(1);
}

const grade = curriculum.getGrade(trackId, gradeId);
if (!grade) {
  console.error(`no grade ${trackId}/${gradeId}`);
  process.exit(1);
}
if (level < 1 || level > grade.pathLength) {
  console.error(`level ${level} is outside ${gradeId}, which runs 1 to ${grade.pathLength}`);
  process.exit(1);
}

const enrollment = db.findOne('enrollments', (e) => e.user_id === userId
  && e.track_id === trackId && e.grade_id === gradeId);
if (!enrollment) {
  console.error(`${userId} is not enrolled in ${trackId}/${gradeId}`);
  process.exit(1);
}

const before = enrollment.current_level || 1;

// An unfinished sitting stands on a level that is about to stop being the current
// one, and would keep offering it afterwards — the same reason the app's own jump
// route closes them.
for (const open of db.find('sessions', (s) => s.user_id === userId
  && s.enrollment_id === enrollment.id && !s.ended_at)) {
  db.update('sessions', open.id, { ended_at: new Date().toISOString(), abandoned: true });
}

db.update('enrollments', enrollment.id, {
  current_level: level,
  // The counter is "items answered at this level", and none of those belong to
  // the level being moved onto.
  level_items: 0,
  status: 'active',
  // A pending checkpoint was recorded against the level being left behind, and it
  // would otherwise keep offering to be worked on from a position it no longer
  // describes.
  pending_checkpoint: null,
});
remediation.clearFor(userId, enrollment.id);
db.flush();

const after = db.byId('enrollments', enrollment.id);
console.log(`${trackId}/${gradeId}: enrollment ${enrollment.id} moved ${before} -> ${after.current_level}`);
console.log(`  now standing on: ${curriculum.levelKind(level, grade.pathLength, grade)}`);
console.log('  no mastery, checkpoints or run were written — see the note at the top of this file');
