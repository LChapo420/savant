/**
 * How often does a learner see a question twice?
 *
 *   node scripts/repeat-rate.js            every skill, the realistic path
 *   node scripts/repeat-rate.js --raw      with no history, to show what avoid buys
 *
 * The product target is fewer than 1 repeat in 20 questions, anywhere on the
 * site. This measures it the way a learner meets it: a long run of questions on
 * one skill at the narrow band of difficulties a level sits in, with the learner's
 * own history as the avoid set — which is what services/sessions.js passes.
 *
 * Exits non-zero when any skill is above the target, so it can gate a release.
 */
const bank = require('../content/bank');
const curriculum = require('../config/curriculum');

const TARGET = Number(process.env.REPEAT_TARGET || 0.05);
const RUN = Number(process.env.REPEAT_RUN || 120);
const raw = process.argv.includes('--raw');
const verbose = process.argv.includes('--verbose');

/**
 * One learner's run over a skill.
 *
 * Two shapes, because they answer different questions:
 *
 *   path   what a learner actually meets. Difficulty climbs across the run, the
 *          way it climbs as they work up the levels, with each level's own
 *          support and stretch around it. This is the number the product is
 *          judged on.
 *   band   RUN questions all at one difficulty. Nobody does that — a learner who
 *          answers 120 questions on one skill has moved several levels while
 *          doing it — but it is the strict test of how deep one band goes, and a
 *          band that is shallow will show up as repeats for someone who stalls.
 *
 * It counts two kinds of repeat, because they are different failures:
 *
 *   exact  the same string twice. A bug, and rare — the avoid set exists.
 *   shape  a different string asking the same thing. This is the one learners
 *          actually report, and it is invisible to an exact count: a family that
 *          fills two noun slots produces 784 strings and one question, and the
 *          exact rate for it is zero.
 *
 * `shapeKey` is what makes the second measurable. A family that declares the words
 * it varies in `varies` gets those stripped before the frame is taken, so
 * "the dog" and "the cat" collapse to the same shape and count as a repeat. A
 * family that has not declared it is measured on its raw prompt, which flatters
 * it — so `undeclared` is reported separately, and those are the families whose
 * repeat rate is currently a guess.
 */
function measure(skillId, difficulty, mode = 'band') {
  const seen = new Set();
  const shapes = new Set();
  let repeats = 0;
  let shapeRepeats = 0;
  for (let i = 0; i < RUN; i++) {
    // The band a learner actually sees: a level's own difficulty, its support
    // below and its stretch above.
    const centre = mode === 'path' ? 1 + (9 * i) / RUN : difficulty;
    const d = Math.max(1, Math.min(10, centre + [0, 0, 0, -1, 1.5][i % 5]));
    let item = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      item = bank.generate({
        skillId,
        difficulty: d,
        seed: `${skillId}:${d}:${i}:${attempt}:${Math.random()}`,
        avoid: raw ? new Set() : seen,
        // The same history a real learner carries, and the thing the picker now
        // uses to reach for a different rule rather than a different noun.
        seenShapes: raw ? new Set() : shapes,
      });
      if (raw || !seen.has(bank.itemKey(item))) break;
    }
    if (seen.has(bank.itemKey(item))) repeats++;
    seen.add(bank.itemKey(item));

    // Counted on the shape actually served, which is what the learner is
    // remembering, and with the history the picker was given — so this measures
    // what the product does rather than what the pool could theoretically do.
    const shape = bank.shapeKey(item);
    if (shapes.has(shape)) shapeRepeats++;
    shapes.add(shape);
  }
  return {
    repeats, rate: repeats / RUN, distinct: seen.size,
    shapeRepeats, shapeRate: shapeRepeats / RUN, shapes: shapes.size,
  };
}

const rows = [];
const paths = [];
for (const skillId of Object.keys(bank.GENERATORS)) {
  paths.push({ skillId, ...measure(skillId, 5, 'path') });
  // Three bands per skill, because a thin generator is usually thin at one end.
  for (const difficulty of [2, 5, 8]) {
    const r = measure(skillId, difficulty);
    rows.push({ skillId, difficulty, ...r });
  }
}

const bySkill = {};
for (const row of rows) {
  const s = bySkill[row.skillId] || (bySkill[row.skillId] = {
    repeats: 0, asked: 0, worst: 0, shapeRepeats: 0, worstShape: 0,
  });
  s.repeats += row.repeats;
  s.asked += RUN;
  s.worst = Math.max(s.worst, row.rate);
  s.shapeRepeats += row.shapeRepeats;
  s.worstShape = Math.max(s.worstShape, row.shapeRate);
}

const failing = Object.entries(bySkill)
  .map(([skillId, s]) => ({ skillId, ...s, rate: s.repeats / s.asked, shapeRate: s.shapeRepeats / s.asked }))
  .filter((s) => s.worst > TARGET)
  .sort((a, b) => b.worst - a.worst);

// The gate is on shapes, not strings. The exact rate has been under target
// throughout and can be, because it only catches identical items — which the
// avoid set was always going to catch. The shape rate is the complaint.
const shapeFailing = Object.entries(bySkill)
  .map(([skillId, s]) => ({ skillId, ...s, shapeRate: s.shapeRepeats / s.asked }))
  .filter((s) => s.worstShape > TARGET)
  .sort((a, b) => b.worstShape - a.worstShape);

const total = rows.reduce((sum, r) => sum + r.repeats, 0);
const totalShapes = rows.reduce((sum, r) => sum + r.shapeRepeats, 0);
const asked = rows.length * RUN;

const pathRepeats = paths.reduce((sum, p) => sum + p.repeats, 0);
const pathShapeRepeats = paths.reduce((sum, p) => sum + p.shapeRepeats, 0);
const pathAsked = paths.length * RUN;
const pathFailing = paths.filter((p) => p.rate > TARGET).sort((a, b) => b.rate - a.rate);
const pathShapeFailing = paths.filter((p) => p.shapeRate > TARGET).sort((a, b) => b.shapeRate - a.shapeRate);

console.log(`${raw ? 'no history (avoid disabled)' : 'learner history as avoid'}\n`);
console.log(`climbing a path (what a learner meets):`);
console.log(`  same string   ${pathRepeats} in ${pathAsked} — ${(100 * pathRepeats / pathAsked).toFixed(2)}%`
  + `   ${pathFailing.length ? `${pathFailing.length} skill(s) over target` : 'every skill inside target'}`);
console.log(`  same question ${pathShapeRepeats} in ${pathAsked} — ${(100 * pathShapeRepeats / pathAsked).toFixed(2)}%`
  + `   ${pathShapeFailing.length ? `${pathShapeFailing.length} skill(s) over target` : 'every skill inside target'}`);
console.log(`stuck at one difficulty (strict):`);
console.log(`  same string   ${total} in ${asked} — ${(100 * total / asked).toFixed(2)}%`);
console.log(`  same question ${totalShapes} in ${asked} — ${(100 * totalShapes / asked).toFixed(2)}%`);
console.log(`\ntarget: under ${(TARGET * 100).toFixed(0)}%, i.e. fewer than 1 repeat in`
  + ` ${Math.round(1 / TARGET)} questions`);
console.log(`\n"same question" is the honest one: a family that swaps a noun for`
  + ` another\nquestion is not a new question, and only that count sees it.\n`);

if (pathShapeFailing.length) {
  console.log('over target while climbing, by question shape:');
  for (const p of pathShapeFailing) {
    // A skill with S shapes in a sitting of N cannot do better than (N − S) / N
    // repeats, because every shape has to be used twice before any is used a
    // third time. Reporting the measured rate alone makes a skill that rotates
    // perfectly look identical to one that is stuck, and the two need opposite
    // fixes: more shapes, or a rotation that works at all.
    const floor = Math.max(0, (RUN - p.shapes) / RUN);
    const gap = floor - p.shapeRate;
    const verdict = p.shapeRate <= floor + 0.005
      ? 'at its shape limit — needs more shapes'
      : `rotating badly — ${(gap * 100).toFixed(1)} points above its limit`;
    console.log(`  ${p.skillId.padEnd(22)} ${(p.shapeRate * 100).toFixed(1)}%`
      + `  (${p.shapes} shapes, floor ${(floor * 100).toFixed(1)}%)  ${verdict}`);
  }
  console.log('');
}

if (verbose) {
  for (const row of rows.filter((r) => r.shapeRate > TARGET).sort((a, b) => b.shapeRate - a.shapeRate)) {
    console.log(`  ${row.skillId} @ d${row.difficulty}: ${row.shapeRepeats}/${RUN}`
      + ` (${(row.shapeRate * 100).toFixed(1)}%), ${row.shapes} shapes, ${row.distinct} strings`);
  }
  console.log('');
}

if (!shapeFailing.length) {
  console.log(`every one of ${Object.keys(bySkill).length} skills is inside the target on both counts`);
  process.exit(0);
}

console.log(`${shapeFailing.length} skill${shapeFailing.length === 1 ? '' : 's'} above the target on question shape:`);
for (const s of shapeFailing) {
  console.log(`  ${s.skillId.padEnd(22)} worst band ${(s.worstShape * 100).toFixed(1)}%`
    + `   (${curriculum.skillName(s.skillId)})`);
}
process.exit(1);
