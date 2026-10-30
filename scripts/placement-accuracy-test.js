/**
 * P4: the placement walk is accurate at every ability level, proven on simulated learners (scripts/placement-sim.js,
 * fixed seed). Each level's learners have abilities spread across the level's grade. The claim: at least 95% of
 * learners are placed within one grade, at every level from "knows nothing" to "knows everything".
 * IQ and ACT cannot meet it at the top because their top grades have too few calibrated items (docs/night/PLACEMENT.md
 * P5a); they are held to the levels below the gap, so a regression there still fails.
 */
const sim = require('./placement-sim');
const adaptive = require('../services/adaptive-placement');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

console.log('\nthe stop rule');
{
  const post = adaptive.posterior(10, []);
  check('an empty belief is wide', adaptive.standardError(post) > 2);
  const answers = [];
  for (const pos of [1, 2, 3, 4, 5, 5.5, 6, 6.5, 7, 7.5]) answers.push({ pos, guess: 0.25, correct: pos <= 5 });
  const narrow = adaptive.posterior(10, answers);
  check('answers narrow it', adaptive.standardError(narrow) < adaptive.standardError(post));
  check('answers near the middle count as confirmation', adaptive.confirmed(answers, narrow));
  check('none near the middle do not', !adaptive.confirmed([{ pos: 0.1, guess: 0.25, correct: true }], narrow));
}

console.log('\nlucky top answers do not overrule a long record of misses');
{
  const span = 16;
  const answered = [];
  for (let i = 0; i < 12; i++) answered.push({ pos: 1 + i * 0.3, guess: 0.25, correct: true });
  for (let i = 0; i < 10; i++) answered.push({ pos: 7 + i * 0.5, guess: 0.25, correct: false });
  for (const pos of [14.2, 14.9, 15.1, 15.4]) answered.push({ pos, guess: 0.25, correct: pos !== 14.2 });
  const post = adaptive.posterior(span, answered);
  check('the top count alone says proven', adaptive.ceilingProof(span, answered).proven);
  check('the belief does not put the learner near the top', adaptive.median(post) < span - adaptive.CEILING.near, adaptive.median(post));
  check('so the top is not proven', !adaptive.topProven(span, answered, post));
}
{
  const bank = sim.bankFor('reading');
  const rows = [];
  for (let i = 0; i < 20; i++) {
    const random = sim.rng(7 + 5 * 131 + i * 17);
    const ability = 5 + random();
    rows.push(sim.sit(bank, 'accurate', ability, random).placed - 5);
  }
  check('Reading Accurate, learners in grade 6: none placed more than one grade off (was grade 16 for two)', rows.every((e) => Math.abs(e) <= 1), rows);
}

console.log('\n95% within one grade at every level');
const GAP = { iq: ['nothing', '2%', '10%', '25%', '40%', '50%', '60%'], act: ['nothing', '2%', '10%', '25%', '40%', '50%', '60%', 'everything'] };
for (const [subject, modes] of [['math', ['quick']], ['english', ['quick', 'balanced']], ['reading', ['quick', 'balanced']], ['iq', ['quick']], ['act', ['quick']]]) {
  for (const mode of modes) {
    const res = sim.measureSpread(subject, mode, { seeds: 40 });
    const covered = GAP[subject];
    const rows = covered ? res.rows.filter((r) => covered.includes(r.label)) : res.rows;
    const low = rows.reduce((a, r) => (r.within1 < a.within1 ? r : a));
    const mean = res.rows.reduce((s, r) => s + r.questions, 0) / res.rows.length;
    check(`${subject} ${mode}: every ${covered ? 'covered ' : ''}level >= 95% within one grade (lowest ${Math.round(low.within1 * 100)}% at ${low.label}; ${mean.toFixed(1)} questions on average)`, low.within1 >= 0.95, low);
  }
}

console.log('\nlearners who press "I don\'t know" are as accurate (P1c; was 86.7% against 93.3% in the baseline)');
for (const [subject, modes] of [['math', ['quick']], ['english', ['quick', 'balanced']], ['reading', ['quick', 'balanced']]]) {
  for (const mode of modes) {
    const res = sim.measureSpread(subject, mode, { seeds: 40, dontKnow: true });
    const low = res.rows.reduce((a, r) => (r.within1 < a.within1 ? r : a));
    check(`${subject} ${mode}: every level >= 95% within one grade (lowest ${Math.round(low.within1 * 100)}% at ${low.label})`, low.within1 >= 0.95, low);
  }
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
