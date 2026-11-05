#!/usr/bin/env node
/**
 * Where the free ACT check should open (brief first-lesson, 4 Nov 2026). Today it opens at the lowest ACT grade ("the value of the digit 6 in
 * 4,052,681?"), which is a poor first impression for a high schooler. This compares opening grades on the ACT track with the app's own walk
 * (services/adaptive-placement.js, Quick) on SIMULATED learners: abilities drawn at random across the whole ladder and both ends,
 * answers from an item-response model with a slope and slip the walk does not assume, "don't know" learners, and pure guessers.
 *
 *   node scripts/act-start-sim.js [--seed 20261104] [--n 400] [--starts none,5,7,8] [--json FILE]
 *
 * Reports share placed within 1 grade, mean questions, the worst 10%, 5% and 1% of individual errors (absolute, grades), and the questions
 * a learner who misses the opening question needs to be placed. AI-free and learner-free: simulated, not a real-learner result.
 */
const fs = require('fs');
const sim = require('./placement-sim');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const SEED = Number(arg('seed', 20261104)); // held out: the shipped tables use 20261030
const N = Number(arg('n', 400));
const STARTS = String(arg('starts', 'none,5,7,8')).split(',');

const bank = sim.bankFor('act');
const { span } = bank;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function learners() {
  const r = sim.rng(SEED);
  const out = [];
  for (let i = 0; i < N; i++) {
    const kind = i % 10 === 0 ? 'dontknow' : i % 25 === 3 ? 'extreme-low' : i % 25 === 7 ? 'extreme-high' : 'random';
    const ability = kind === 'extreme-low' ? -1 + r() : kind === 'extreme-high' ? span + r() : -0.5 + r() * (span + 1);
    out.push({ kind, ability, dontKnow: kind === 'dontknow' });
  }
  return out;
}

function runStart(start) {
  const hint = start === 'none' ? NaN : Number(start);
  const rows = [];
  learners().forEach((l, i) => {
    const truth = sim.trueGrade(l.ability, span);
    const r = sim.sit(bank, 'quick', l.ability, sim.rng(SEED * 31 + i * 104729), { dontKnow: l.dontKnow, startHint: hint });
    rows.push({ ...l, truth, err: r.placed - truth, asked: r.asked, firstRight: r.trace[0] ? r.trace[0].correct : null });
  });
  const abs = rows.map((x) => Math.abs(x.err));
  const miss = rows.filter((x) => x.firstRight === false);
  return {
    start, n: rows.length, within1: rows.filter((x) => Math.abs(x.err) <= 1).length / rows.length,
    exact: rows.filter((x) => x.err === 0).length / rows.length,
    questions: rows.reduce((s, x) => s + x.asked, 0) / rows.length,
    worst10: q(abs, 0.9), worst5: q(abs, 0.95), worst1: q(abs, 0.99), maxErr: Math.max(...abs),
    missFirstWithin1: miss.length ? miss.filter((x) => Math.abs(x.err) <= 1).length / miss.length : null, missFirstN: miss.length,
    questionsMiss: miss.length ? miss.reduce((s, x) => s + x.asked, 0) / miss.length : null,
    by_kind: Object.fromEntries(['random', 'dontknow', 'extreme-low', 'extreme-high'].map((k) => { const g = rows.filter((x) => x.kind === k); return [k, { n: g.length, within1: g.filter((x) => Math.abs(x.err) <= 1).length / (g.length || 1) }]; })),
  };
}

const results = STARTS.map(runStart);
console.log(`ACT Quick, ${span} grades, held-out seed ${SEED}, ${N} simulated learners (random abilities, dont-know, extremes)`);
console.table(results.map((r) => ({ start: r.start, within1: `${(r.within1 * 100).toFixed(1)}%`, exact: `${(r.exact * 100).toFixed(0)}%`, questions: r.questions.toFixed(1), worst10: r.worst10, worst5: r.worst5, worst1: r.worst1, max: r.maxErr, missFirstWithin1: r.missFirstWithin1 === null ? '-' : `${(r.missFirstWithin1 * 100).toFixed(0)}% of ${r.missFirstN}`, qIfMiss: r.questionsMiss === null ? '-' : r.questionsMiss.toFixed(1) })));
console.log(JSON.stringify(results.map((r) => ({ start: r.start, by_kind: r.by_kind }))));
if (arg('json', null)) fs.writeFileSync(arg('json'), JSON.stringify({ seed: SEED, n: N, span, results }, null, 1));
