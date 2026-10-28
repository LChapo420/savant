/**
 * Write the subject placement questions, ahead of anybody asking for them.
 *
 *   node scripts/generate-placement.js math
 *   node scripts/generate-placement.js --all
 *   node scripts/generate-placement.js english --force
 *
 * The quiz writes its questions the first time a learner opens the subject, and
 * waits while it does — a whole subject is one call and can take several minutes.
 * Running this first means no learner ever waits for it.
 *
 * Run it while the server is stopped. The data file is held in memory by whichever
 * process is running, so a set written underneath a live server is a set the
 * server overwrites the next time it saves.
 *
 * The model is GPT Sol through Modelflare and nothing else, for the whole
 * subject, so the ladder is written by one set of weights rather than stitched
 * together.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
const here = path.join(ROOT, '.env');
dotenv.config({ path: fs.existsSync(here) ? here : path.join(ROOT, '..', '.env') });

const db = require('../config/db');
const rules = require('../config/subject-placement');
const providers = require('../services/providers');
const subjectPlacement = require('../services/subject-placement');

const args = process.argv.slice(2);
const force = args.includes('--force');
const all = args.includes('--all');
const named = args.filter((a) => !a.startsWith('--'));

const TRACKS = all ? ['math', 'english', 'reading', 'iq', 'act', 'spanish'] : named;

/**
 * Write one subject's questions. Returns false when the subject needs attention.
 *
 * The set that was already here — if there was one — is left exactly where it is
 * until the new one is in hand. Deleting first and writing second left a failed
 * rewrite with nothing at all, and the walk stopped dead at the first grade it
 * could not find.
 */
async function writeTrack(trackId) {
  const gradeIds = rules.gradesFor(trackId);
  if (!gradeIds.length) throw new Error('no such subject');

  const existing = subjectPlacement.questionSet(trackId);
  if (existing && !force) {
    const written = (existing.grades || []).reduce((n, g) => n + (g.questions || []).length, 0);
    console.log(`  ${trackId}: already written — ${gradeIds.length} grades, ${written} questions `
      + `(${(existing.problems || []).length} problems). Pass --force to rewrite.`);
    return true;
  }

  const questions = gradeIds.length * rules.QUESTIONS_PER_GRADE;
  process.stdout.write(`  ${trackId}: writing ${questions} questions across ${gradeIds.length} grades… `);
  const started = Date.now();
  const set = await subjectPlacement.writeQuestionSet(trackId, { userId: null });
  const secs = ((Date.now() - started) / 1000).toFixed(0);

  if (!set) {
    console.log(`FAILED after ${secs}s`);
    return false;
  }
  db.remove('placement_question_sets', (s) => s.track_id === trackId && s.id !== set.id);
  const stored = (set.grades || []).reduce((n, g) => n + (g.questions || []).length, 0);
  console.log(`${stored} questions in ${secs}s, ${(set.problems || []).length} problems`);
  for (const problem of set.problems || []) console.log(`      ${problem}`);
  return !(set.problems || []).length;
}

(async () => {
  if (!TRACKS.length) {
    console.error('usage: node scripts/generate-placement.js <track> [--force]');
    console.error('       node scripts/generate-placement.js --all');
    process.exit(1);
  }

  // PLACEMENT_WRITER=mimo: MiMo V2.6 Pro on the owner's token plan writes them
  // (services/subject-placement.js placementStructured), whatever the role's provider.
  if (String(process.env.PLACEMENT_WRITER || '').toLowerCase() === 'mimo') {
    if (!process.env.MIMO_API_KEY) { console.error('PLACEMENT_WRITER=mimo needs MIMO_API_KEY.'); process.exit(1); }
    console.log('model: mimo / mimo-v2.6-pro (streamed)\n');
  }
  const provider = String(process.env.PLACEMENT_WRITER || '').toLowerCase() === 'mimo' ? { name: 'mimo', modelFor: () => 'mimo-v2.6-pro' } : providers.current('placement');
  if (!provider) {
    console.error('No placement provider is configured — the quiz cannot be written.');
    console.error('It is pinned to Modelflare, so MODELFLARE_API_KEY has to be set.');
    process.exit(1);
  }
  console.log(`model: ${provider.name} / ${provider.modelFor('placement')}\n`);

  let failed = 0;
  for (const trackId of TRACKS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if (!(await writeTrack(trackId))) failed++;
    } catch (err) {
      // One subject failing is one subject failed. This used to let the error
      // out of the loop and take every subject after it with it.
      console.log(`  ${trackId}: FAILED — ${err.message}`);
      failed++;
    }
  }

  db.flush();
  console.log(failed ? `\n${failed} subject(s) need attention.` : '\nAll requested subjects are written.');
  // The exit code is set rather than exit() called: exiting by hand truncates
  // buffered stdout, which is the whole of what this script has to say.
  process.exitCode = failed ? 1 : 0;
})().catch((err) => {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
});
