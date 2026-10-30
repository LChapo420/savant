/**
 * The per-learner path for own-material courses (services/material-path.js). Pure: no db, no model.
 *
 *   node scripts/material-path-test.js
 *
 * Placement over a skill graph (skips what is known, finds scattered gaps, survives a slip), tiers, pace,
 * question picking, and review intervals from the forgetting curve with the learner's own multiplier.
 */
const mp = require('../services/material-path');
const ap = require('../services/adaptive-placement');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

const chain = (n) => ({ skills: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, prerequisites: i ? [`s${i - 1}`] : [], questions: [] })) });
const MC = { type: 'multiple_choice', choices: ['a', 'b', 'c', 'd'] };

/** Run placement for a learner who answers by `knows(i)`, slipping on the listed answer numbers. */
function place(course, knows, slips = []) {
  const answers = [];
  for (let k = 0; k < 80; k++) {
    const nx = mp.nextPlacement(course, answers, () => MC);
    if (!nx) break;
    const i = Number(nx.skill.slice(1));
    const right = knows(i) && !slips.includes(answers.length);
    answers.push({ skill: nx.skill, correct: right, guess: 0.25, stage: nx.stage });
  }
  return { answers, result: mp.placementResult(course, answers) };
}
const verdicts = (r) => Object.keys(r).map((k) => r[k].verdict[0]).join('');

console.log('the answer model is the built-in placement model at its ends');
const m4 = mp.answerModel(0.25);
check('known: 1 - slip; not known: guess + luck', Math.abs(m4.known - ap.assumed(100, 0, 0.25)) < 1e-9 && Math.abs(m4.known - 0.9) < 0.01 && Math.abs(m4.unknown - 0.4) < 0.01, m4);

console.log('placement');
const c12 = chain(12);
let p = place(c12, () => false);
check('knows nothing: settled in a handful of questions, everything to learn', p.answers.length <= 4 && verdicts(p.result) === 'u'.repeat(12), [p.answers.length, verdicts(p.result)]);
p = place(c12, (i) => i < 6);
check('knows the first half: the first half known, the rest to learn, well under one question per skill + checks',
  verdicts(p.result).slice(0, 5) === 'kkkkk' && !/k/.test(verdicts(p.result).slice(6)) && p.answers.length <= 14, [p.answers.length, verdicts(p.result)]);
p = place(c12, () => true);
check('knows everything: every skill known, each confirmed by a right answer of its own', verdicts(p.result) === 'k'.repeat(12), verdicts(p.result));
p = place(c12, (i) => ![2, 7].includes(i));
check('scattered gaps: the two gaps are found even though later skills are known', p.result.s2.verdict !== 'known' && p.result.s7.verdict !== 'known' && Object.keys(p.result).filter((k) => !['s2', 's7'].includes(k)).every((k) => p.result[k].verdict === 'known'), verdicts(p.result));
const firstCheck = place(c12, () => true).answers.findIndex((a) => a.stage === 'check');
p = place(c12, () => true, [firstCheck]);
check('a careless slip on a known skill gets a second question and is not marked a gap', verdicts(p.result) === 'k'.repeat(12), [verdicts(p.result), p.answers.filter((a) => !a.correct)]);
const b1 = mp.belief(c12, p.answers, 1).p; const b2 = mp.belief(c12, p.answers, 99).p;
check('the sampler is stable: two different seeds agree to within 0.1 on every skill', Object.keys(b1).every((k) => Math.abs(b1[k] - b2[k]) < 0.1), [b1, b2]);
const fork = { skills: [{ id: 'a', prerequisites: [] }, { id: 'b', prerequisites: ['a'] }, { id: 'c', prerequisites: ['a'] }, { id: 'd', prerequisites: ['b', 'c'] }] };
const bf = mp.belief(fork, [{ skill: 'd', correct: true, guess: 0.25 }, { skill: 'd', correct: true, guess: 0.25 }]);
check('knowing a skill raises its prerequisites', bf.p.a > 0.7 && bf.p.b > 0.7 && bf.p.c > 0.7, bf.p);
const bw = mp.belief(fork, [{ skill: 'a', correct: false, guess: 0.25 }, { skill: 'a', correct: false, guess: 0.25 }]);
check('missing a skill lowers what depends on it', bw.p.b < 0.3 && bw.p.d < 0.3, bw.p);

console.log('tiers and pace');
check('a perfect check moves up a tier, a pass at 75% stays, a fail moves down (floor 1, ceiling 3)',
  mp.tierAfter(1, 1) === 2 && mp.tierAfter(3, 1) === 3 && mp.tierAfter(2, 0.75) === 2 && mp.tierAfter(2, 0.5) === 1 && mp.tierAfter(1, 0) === 1);
check('half-known skills start a tier up; a fast learner starts higher', mp.startTier(0.6, 0) === 2 && mp.startTier(0.1, 0) === 1 && mp.startTier(0.6, 1.2) === 3);
check('a fast learner gets less practice; remediation gets more', mp.practiceCount(2, 1, false) === 1 && mp.practiceCount(1, 0, false) === 3 && mp.practiceCount(3, 2, true) === 3);
let pace = 0;
for (let i = 0; i < 10; i++) pace = mp.updatePace(pace, 3, true);
check('pace rises on right answers at tier 3 and falls on misses at tier 1', pace > 0.8 && mp.updatePace(0, 1, false) < 0);
const skill = { questions: [1, 1, 2, 2, 3, 3].map((t, i) => ({ id: `q${i}`, tier: t })) };
const one = () => 0;
check('a check picks missed questions first, then its tier', mp.pickForTier(skill, 3, 3, ['q0'], [], one).map((q) => q.id).join() === 'q0,q4,q5');
check('questions just practised are used last', !mp.pickForTier(skill, 1, 2, [], ['q0', 'q1'], one).some((q) => ['q0', 'q1'].includes(q.id)));

console.log('review intervals fitted to the learner');
const ladder = [5, 7, 9, 11, 13, 15].map((r) => mp.intervalDays(r, 0, 0));
check('intervals grow with each right answer', ladder.every((d, i) => i === 0 || d >= ladder[i - 1]) && ladder[ladder.length - 1] > ladder[0], ladder);
check('a fast forgetter (lower multiplier) gets shorter intervals; a slow one longer', mp.intervalDays(13, 0, -1.5) < mp.intervalDays(13, 0, 0) && mp.intervalDays(13, 0, 1) > mp.intervalDays(13, 0, 0));
check('at the interval, predicted recall is still at the target', mp.recall(mp.intervalDays(11, 0, 0), 11, 0, 0) >= mp.TARGET_RECALL - 1e-9);
check('forgetting more than predicted lowers the multiplier; remembering raises it', mp.updateForgetting(0, 5, 9, 0, 0) < 0 && mp.updateForgetting(0, 5, 9, 0, 1) > 0);

const careless = mp.updateForgetting(0, 3, 9, 0, 0.5, 0.75);
const accurate = mp.updateForgetting(0, 3, 9, 0, 0.5, 0.95);
check('the same 1-of-2 review lowers an accurate learner\'s half-life more than a careless one\'s (slips are not taken for forgetting)', accurate < careless && accurate < 0, { careless, accurate });
check('fresh accuracy starts near 0.95 and follows the learner\'s checks', Math.abs(mp.freshAccuracy(null) - 0.95) < 1e-9 && mp.freshAccuracy({ right: 60, total: 80 }) < 0.85);

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
