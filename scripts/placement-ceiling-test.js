/**
 * The ceiling (P3): a learner who knows everything is placed at the top, not left mid-way (06-M3).
 * Unit checks of the proof and the stop gate, then the simulation (fixed seed) for every subject whose top two grades
 * have enough calibrated items to tell. A subject with too few is reported as a content gap, not passed.
 */
const adaptive = require('../services/adaptive-placement');
const sim = require('./placement-sim');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}
const ans = (pos, correct) => ({ pos, guess: 0.25, correct });

console.log('\nthe proof');
{
  const span = 16;
  check('three of three in the top two grades proves the top', adaptive.ceilingProof(span, [ans(14.2, true), ans(15.1, true), ans(15.6, true)]).proven);
  check('two items cannot prove it', !adaptive.ceilingProof(span, [ans(15.1, true), ans(15.6, true)]).proven);
  check('one slip in four is allowed', adaptive.ceilingProof(span, [ans(14.1, true), ans(14.5, false), ans(15.1, true), ans(15.6, true)]).proven);
  check('two misses in four is not a ceiling', !adaptive.ceilingProof(span, [ans(14.1, true), ans(14.5, false), ans(15.1, false), ans(15.6, true)]).proven);
  check('right answers lower down do not count', !adaptive.ceilingProof(span, [ans(10, true), ans(11, true), ans(12, true), ans(13, true)]).proven);
}

console.log('\nthe stop gate');
{
  const span = 16;
  const answered = Array.from({ length: 20 }, (_, i) => ans(10 + i * 0.2, true)).filter((a) => a.pos < 14);
  while (answered.length < 20) answered.push(ans(5, true));
  const post = adaptive.posterior(span, answered);
  check('a candidate with top items left is not stopped by a confident belief', adaptive.done('quick', answered, post, { topLeft: 3 }) === false || adaptive.median(post) < span - 3);
  const proven = [...answered, ans(14.5, true), ans(15.2, true), ans(15.7, true)];
  const post2 = adaptive.posterior(span, proven);
  check('a proven top may stop', adaptive.done('quick', proven, post2, { topLeft: 3 }) === true);
  check('and is recommended the last grade', adaptive.recommend(span, post2, proven).index === span - 1);
  check('the page rule holds: recommended grade has the highest probability', (() => {
    const r = adaptive.recommend(span, post2, proven);
    return r.probabilities[r.index] === Math.max(...r.probabilities);
  })());
}

console.log('\nthe simulation');
const gaps = [];
for (const subject of ['math', 'english', 'reading', 'act', 'iq']) {
  const bank = sim.bankFor(subject);
  const region = bank.sets.slice(-adaptive.CEILING.region).reduce((n, s) => n + s.length, 0);
  if (region < 2 * adaptive.CEILING.min) { gaps.push(`${subject}: ${region} items in the top ${adaptive.CEILING.region} grades`); continue; }
  const res = sim.measure(subject, 'quick', { seeds: 30 });
  const everything = res.rows[res.rows.length - 1];
  const near = res.rows[res.rows.length - 2];
  check(`${subject}: knows everything is placed in the top grade`, everything.exact >= 0.95, everything);
  check(`${subject}: 98% is placed within one grade of the top`, near.within1 >= 0.95, near);
}
console.log(`  content gaps (P5): ${gaps.length ? gaps.join('; ') : 'none'}`);

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
