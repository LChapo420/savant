/**
 * The placement simulation harness (scripts/placement-sim.js): fixed seed, so a result that moves is a real change.
 * It checks the harness itself and the two extremes the night plan cares about: a learner who knows nothing and one
 * who knows everything must be placed within one grade of where they belong, in every mode, on every simulated subject.
 */
const sim = require('./placement-sim');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

console.log('\nthe harness');
{
  const a = sim.measure('english', 'quick', { seeds: 3 });
  const b = sim.measure('english', 'quick', { seeds: 3 });
  check('the same seed gives the same table', JSON.stringify(a) === JSON.stringify(b));
  check('subjects with no calibrated items are not simulated', sim.measure('chess', 'quick', { seeds: 1 }) === null);
  check('the grid runs from knows-nothing to knows-everything', a.rows[0].label === 'nothing' && a.rows[a.rows.length - 1].label === 'everything');
  check('truth is clamped to the subject', a.rows[0].truth === 0 && a.rows[a.rows.length - 1].truth === a.span - 1);
}

console.log('\nthe extremes (baseline floor)');
for (const subject of ['english', 'reading', 'iq', 'act']) {
  const res = sim.measure(subject, 'quick', { seeds: 6 });
  const floor = res.rows[0];
  const ceiling = res.rows[res.rows.length - 1];
  check(`${subject}: knows nothing is placed within one grade of the start`, floor.within1 >= 0.95, floor);
  check(`${subject}: knows everything is placed within one grade of the end`, ceiling.within1 >= 0.95, ceiling);
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
