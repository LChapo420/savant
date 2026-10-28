/**
 * The experience a learner actually has, as opposed to the worst case per skill.
 *
 * `repeat-rate.js` measures one skill at a time across a long run, because that
 * is how a content problem is best isolated: a skill that cannot vary is a
 * content gap, and it is invisible in an average. But nobody sits through 120
 * questions of a single skill. A real sitting is a dozen questions drawn from a
 * level plan, usually spread over one or two skills, at the difficulty that level
 * happens to sit at.
 *
 * So this builds real blocks the way services/sessions.js does and counts the
 * repeats inside each one. It is the number a learner would recognise, and it is
 * the one worth watching as content improves. The per-skill number is the alarm;
 * this is the truth.
 */
// It builds its learners in a copy of the data file (deleted at the end), never
// the real one, unless DB_FILE=<file> names one; and every model key is blanked
// so nothing it loads can make a paid call.
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';
let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = require('path').join(require('os').tmpdir(), `sitting-rate-${process.pid}.json`);
  require('fs').copyFileSync(require('path').join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
const db = require('../config/db');
// Registered after config/db, so its own exit write happens first.
process.on('exit', () => { if (ownCopy) try { require('fs').unlinkSync(ownCopy); } catch { /* gone */ } });
const curriculum = require('../config/curriculum');
const sessions = require('../services/sessions');
const { shapeKey } = require('../content/pool');

const TARGET = Number(process.env.REPEAT_TARGET || 0.05);

// A spread over the tracks and grades that exist, at levels that are practice,
// a lesson, and a checkpoint. A learner meets all of these, so a single one
// would flatter the result.
const CASES = [
  ['math', 'sense_of_quantity', 11], ['math', 'numbers_to_20_and_teen_numbers', 11], ['math', 'algebra_1_part_a', 11],
  ['math', 'algebra_1_part_a', 60], ['math', 'algebra_2_part_a', 41], ['math', 'algebra_2_part_a', 120],
  ['english', 'basics', 11], ['english', 'grammar', 11], ['english', 'reading', 11],
  ['english', 'reading', 45], ['spanish', 'entry', 11], ['spanish', 'intermediate', 41],
  ['spanish', 'advanced', 41], ['iq', 'foundations', 11], ['iq', 'advanced', 41],
  ['act', 'act_english', 11], ['act', 'act_math', 11], ['act', 'act_reading', 11],
  ['act', 'act_science', 11],
];

function makeUser(tag) {
  return db.insert('users', {
    email: `sitting-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.test`,
    display_name: tag, password_hash: 'x', xp: 0, streak: 0, onboarded: true,
  });
}

/** How many questions in this list meet a shape the learner has already had. */
function repeatsWithin(items) {
  const seen = new Map();
  let repeats = 0;
  for (const it of items) {
    const k = shapeKey(it);
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    // The second time is a repeat; the first is the meeting.
    if (n === 2) repeats++;
  }
  return { repeats, shapes: seen.size };
}

/** How many times to rebuild the same blocks and report the distribution.
 *  One run is one sample and the spread is wide, because the level planner mixes
 *  skills by the learner's own history and a fresh account has none. Set
 *  SITING_SAMPLES=1 to see a single run's per-block detail. */
const SAMPLES = Number(process.env.SITING_SAMPLES || 7);

async function main(run, samples) {
  let asked = 0;
  let repeats = 0;
  const worst = [];

  for (const [trackId, gradeId, level] of CASES) {
    const user = makeUser(`${trackId}-${gradeId}-${level}`);
    const enrollment = db.insert('enrollments', {
      user_id: user.id, track_id: trackId, grade_id: gradeId,
      target_level: 250, current_level: level, level_items: 0, levels_completed: 0,
      xp: 0, status: 'active',
    });
    const grade = curriculum.getGrade(trackId, gradeId);
    const started = await sessions.createSession({ userId: user.id, enrollment, grade });
    const items = started.items || [];
    if (!items.length) continue;

    const { repeats: r, shapes } = repeatsWithin(items);
    const rate = r / items.length;
    asked += items.length;
    repeats += r;
    worst.push({ label: `${trackId}/${gradeId} @${level}`, rate, repeats: r, asked: items.length, shapes });
  }

  worst.sort((a, b) => b.rate - a.rate);
  const many = SAMPLES > 1;
  console.log(`a real sitting — questions a learner actually meets in one block`
    + `${many ? ` (sample ${run + 1} of ${SAMPLES})` : ''}\n`);

  if (!many) {
    for (const w of worst) {
      const flag = w.rate > TARGET ? '  over target' : '';
      console.log(`  ${w.label.padEnd(28)} ${String(w.asked).padStart(2)} questions,`
        + ` ${w.shapes} shapes, ${w.repeats} repeat(s) = ${(w.rate * 100).toFixed(1)}%${flag}`);
    }
  }

  const rate = repeats / asked;
  const verdict = (r) => (r <= TARGET ? 'inside target.' : 'over target.');

  if (many) {
    // Per-block detail is printed once, on the last sample. Nineteen blocks of
    // the same nineteen blocks, with the numbers jittering around their true
    // value, is noise; the question is what the distribution does.
    samples.push(rate);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    console.log(`\nsample ${run + 1} of ${SAMPLES}: ${(rate * 100).toFixed(1)}%`
      + `   running mean ${(mean * 100).toFixed(1)}%`);
    if (run + 1 < SAMPLES) {
      // The next sample is a fresh set of accounts, so nothing carries over
      // between runs: the whole point is that each one is an independent draw.
      setImmediate(() => { main(run + 1, samples); });
      return;
    }
    const sorted = samples.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    console.log('\nworst blocks, from the final sample:');
    for (const w of worst.slice(0, 8)) {
      console.log(`  ${w.label.padEnd(28)} ${String(w.asked).padStart(2)} questions,`
        + ` ${w.shapes} shapes, ${w.repeats} repeat(s) = ${(w.rate * 100).toFixed(1)}%`);
    }
    console.log(`\nover ${SAMPLES} samples of ${asked} questions each:`);
    console.log(`  mean ${(mean * 100).toFixed(1)}%, median ${(median * 100).toFixed(1)}%`
      + `, range ${(sorted[0] * 100).toFixed(1)}% to ${(sorted[sorted.length - 1] * 100).toFixed(1)}%`);
    console.log(`  target under ${(TARGET * 100).toFixed(0)}%.   ${verdict(median)}`);
    console.log('\nthis is the experience; `npm run repeats` is the per-skill worst case,');
    console.log('where a skill with too few shapes shows up on its own.\n');
    process.exit(median <= TARGET ? 0 : 1);
  }

  console.log(`\nover ${asked} real questions: ${repeats} repeats = ${(rate * 100).toFixed(1)}%`);
  console.log(`target under ${(TARGET * 100).toFixed(0)}%.   ${verdict(rate)}`);
  console.log('\nthis is the experience; `npm run repeats` is the per-skill worst case,');
  console.log('where a skill with too few shapes shows up on its own.\n');
  process.exit(rate <= TARGET ? 0 : 1);
}

main(0, []);
