/**
 * Print the exact prompt the level editor would send to write one level for one
 * learner — the creator's page plus the learner brief, which carries their
 * survey, feedback and learning scorecard.
 *
 *   npm run scorecard:prompt -- <email> [track/grade/level] [--full]
 *
 * Without a level, the learner's current level on their most recent course. The
 * creator's page itself is abbreviated unless --full is given, because it is
 * tens of thousands of characters and the brief is the part worth reading.
 * Read-only, no model is called, and safe to run while the server is up.
 */
// Before anything else, and before any service is required: the providers read
// their configuration once, when they load, and the holdout and experiment rates
// are read the same way. Loading .env afterwards would leave this printing the
// code's defaults under a heading that promises what the server would send.
require('dotenv').config();

process.env.DB_READONLY = '1';

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const baseLessons = require('../config/base-lessons');
const levelEditor = require('../services/level-editor');
const personalize = require('../services/personalize');

const args = process.argv.slice(2);
const full = args.includes('--full');
const [email, target] = args.filter((a) => !a.startsWith('--'));
if (!email) {
  console.error('usage: npm run scorecard:prompt -- <email> [track/grade/level] [--full]');
  process.exit(1);
}
const user = db.findOne('users', (u) => String(u.email).toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`no user with email ${email}`);
  process.exit(1);
}

let where;
if (target) {
  const [trackId, gradeId, level] = target.split('/');
  where = { trackId, gradeId, level: Number(level) };
} else {
  const e = db.find('enrollments', (x) => x.user_id === user.id).pop();
  if (!e) {
    console.error('that learner has no course; name one as track/grade/level');
    process.exit(1);
  }
  where = { trackId: e.track_id, gradeId: e.grade_id, level: e.current_level };
}
if (!curriculum.getGrade(where.trackId, where.gradeId)) {
  console.error(`no such course: ${where.trackId}/${where.gradeId}`);
  process.exit(1);
}

const base = baseLessons.get(where.trackId, where.gradeId, where.level);
const { arm, experiment } = personalize.armFor(user.id, where);
const html = base ? (full ? base.html : `[the creator's page for this level: ${base.html.length} characters — pass --full to include it]`) : null;
console.log(`--- ${where.trackId}/${where.gradeId} level ${where.level} for ${user.email}: `
  + `${base ? 'edit the creator\'s page' : 'write a page (no creator page exists)'}, arm ${arm}`
  + `${experiment ? `, trying ${experiment.label} (${experiment.arm})` : ''} ---\n`);
if (arm === 'holdout') console.log('(This level is a holdout for this learner: the editor serves the shared page and sends nothing.)\n');
console.log(levelEditor.buildEditorPrompt(user.id, where, base ? 'base' : 'authored', html, experiment));
