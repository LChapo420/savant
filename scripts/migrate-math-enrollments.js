/**
 * Move every enrollment on the four old math grades onto the sheet.
 *
 * ## What this is for
 *
 * The math track used to have four rule-shaped grades — `arithmetic`,
 * `prealgebra`, `algebra1`, `algebra2` — with no spreadsheet behind them. It now
 * has the forty-nine grades the creator's Math sheet names, and the four ids are
 * gone. A grade id is not a label: 1,728 stored enrollments point at one of them,
 * and an enrollment pointing at a grade that no longer exists is a row the app
 * cannot serve.
 *
 * ## What it does
 *
 * Each old grade is matched to the sheet grade that covers the same ground:
 *
 *   arithmetic  -> Sense of Quantity, the preschool grade the sheet opens with
 *   prealgebra  -> Numbers to 20 and Teen Numbers, the last of the two whole-number
 *                  grades before the sheet starts adding and subtracting
 *   algebra1    -> Algebra 1, Part A, the first half of the sheet's Algebra 1
 *   algebra2    -> Algebra 2, Part A, the first half of the sheet's Algebra 2
 *
 * Every enrollment lands on `current_level: 1` with `status: 'placement_pending'`,
 * so the learner takes the placement quiz against the new grade and is measured
 * there rather than having a level number carried across from a course whose
 * levels mean something else. Level 10 of `arithmetic` and level 10 of
 * `Sense of Quantity` are both the first lesson, but that is a coincidence of
 * numbering, not a claim that the two grades agree — and a learner on `algebra2`
 * at level 120 is not at all where `Algebra 2, Part A` level 120 puts them.
 *
 * Progress is kept and the level is not. Mastery, sessions, XP and the skill
 * history stay: those are facts about what the learner knows, and the skill ids
 * are the same in the sheet's grades as they were in the old ones. The *level* is
 * the only thing that is about the course rather than the learner.
 *
 * ## Running it
 *
 *   node scripts/migrate-math-enrollments.js            # report what it would do
 *   node scripts/migrate-math-enrollments.js --apply    # do it
 *
 * It reports before it acts, and refuses to act without `--apply`, because this
 * writes to stored data. It is safe to run twice: an enrollment already on a
 * sheet grade is left alone, so a second run finds nothing to do and says so
 * rather than moving anyone again.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');

const APPLY = process.argv.includes('--apply');

/**
 * The old grade id -> the sheet grade that covers the same ground.
 *
 * Chosen by reading the sheet's own headings, not by matching strings: the old
 * `arithmetic` ran from whole numbers to Algebra 2 in one course, and the sheet
 * splits that span across forty-nine. Each old grade is mapped to the sheet grade
 * a learner at that level was most likely working in, and every one of them goes
 * back to the placement quiz rather than being trusted to be at the right place.
 */
const MAPPING = {
  arithmetic: 'sense_of_quantity',
  prealgebra: 'numbers_to_20_and_teen_numbers',
  algebra1: 'algebra_1_part_a',
  algebra2: 'algebra_2_part_a',
};

const track = curriculum.getTrack('math');
const byId = new Map(track.grades.map((g) => [g.id, g]));

console.log(`the math track has ${track.grades.length} grades from the sheet`);
for (const [old, next] of Object.entries(MAPPING)) {
  const g = byId.get(next);
  if (!g) {
    console.log(`  ${old} -> ${next}: NO SUCH GRADE. Nothing will be moved.`);
    process.exit(1);
  }
  console.log(`  ${old} -> ${next}  "${g.name}" (${g.pathLength} levels)`);
}

const all = db.all('enrollments');
const maths = all.filter((e) => e.track_id === 'math');
const stranded = maths.filter((e) => !byId.has(e.grade_id));
const already = maths.filter((e) => byId.has(e.grade_id));

// Group the stranded rows by the account and grade they would land on, so two
// enrollments that would collapse into one are visible before anything is written.
const landing = new Map();
for (const e of stranded) {
  const next = MAPPING[e.grade_id];
  // Two enrollments for the same account on the same new grade is not a row the
  // app can serve — the dashboard would list the same course twice, and the
  // enrollment route skips a duplicate rather than returning the existing one, so
  // the learner could never rejoin it. Counted and reported here, because keeping
  // both silently is worse than saying so.
  const key = `${e.user_id}|${next}`;
  if (!landing.has(key)) landing.set(key, []);
  landing.get(key).push(e);
}
const duplicated = new Map([...landing].filter(([, rows]) => rows.length > 1));

console.log(`\n${maths.length} enrollment(s) on the math track:`);
console.log(`  ${stranded.length} point at a grade the sheet does not have`);
console.log(`  ${already.length} are already on a sheet grade`);

if (duplicated.size) {
  console.log(`\n${duplicated.size} account(s) hold two enrollments that would land on the same`
    + ' grade, covering');
  console.log(`  ${[...duplicated].reduce((n, [, r]) => n + r.length, 0)} of the ${stranded.length} rows:`);
  for (const [key, rows] of [...duplicated].slice(0, 10)) {
    const levels = rows.map((r) => r.current_level).sort((a, b) => a - b);
    console.log(`  account ${key.split('|')[0]} on ${key.split('|')[1]}: levels ${levels.join(', ')}`);
  }
  console.log('\n  Only the furthest-along one of each group is kept; the others are removed,');
  console.log('  because two rows for one course is a state the app never creates.');
}

if (!stranded.length) {
  console.log('\nnothing to do — every math enrollment is already on a grade from the sheet.');
  process.exit(0);
}

const plan = [];
for (const [, rows] of duplicated) {
  rows.sort((a, b) => (b.current_level || 0) - (a.current_level || 0)
    || (b.levels_completed || 0) - (a.levels_completed || 0));
  plan.push({ keep: rows[0], drop: rows.slice(1) });
}
const unpaired = stranded.filter((e) => !duplicated.has(`${e.user_id}|${MAPPING[e.grade_id]}`));
for (const e of unpaired) plan.push({ keep: e, drop: [] });

console.log(`\n${APPLY ? 'will move' : 'would move'} ${plan.length} enrollment(s),`
  + ` ${plan.reduce((n, p) => n + p.drop.length, 0)} of which replace a duplicate`);

if (!APPLY) {
  console.log('\nthis was a dry run. Add --apply to make the change.');
  process.exit(0);
}

let moved = 0;
let removed = 0;
for (const { keep, drop } of plan) {
  const next = MAPPING[keep.grade_id];
  const grade = byId.get(next);
  db.update('enrollments', keep.id, {
    grade_id: next,
    // Back to the placement quiz, on the new course. Everything else about the
    // row — the user, the target, the XP, the levels completed — is left alone,
    // because those are facts about the learner and not about the grade.
    current_level: 1,
    level_items: 0,
    status: 'placement_pending',
    placed_at: null,
    pending_checkpoint: null,
    target_level: grade.pathLength,
    migrated_from_grade: keep.grade_id,
    migrated_at: new Date().toISOString(),
  });
  moved++;
  for (const d of drop) {
    db.remove('enrollments', (row) => row.id === d.id);
    removed++;
  }
}

console.log(`\nmoved ${moved} enrollment(s) to a grade from the sheet, removed ${removed} duplicate(s).`);
console.log('Every one of them is back in front of the placement quiz on its new course.');

// And say plainly whether the track is now whole, which is the claim that matters.
const after = db.all('enrollments').filter((e) => e.track_id === 'math');
const stillStranded = after.filter((e) => !curriculum.getGrade('math', e.grade_id));
console.log(`${after.length} enrollment(s) on the math track, ${stillStranded.length} of them stranded.`);
