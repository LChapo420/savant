#!/usr/bin/env node
/**
 * Base-lesson coverage of the start levels (first-lesson, 6 Nov 2026). Which levels can a learner land on after placement
 * (the first lesson level of every unit of every placeable grade), how many already have a ready shared (base) plan, and how
 * likely each start level is for SIMULATED learners (same walk and learner mix as scripts/prewrite-hit-sim.js, extremes at both ends).
 * Reads a COPY of the database; writes nothing. With --plan out.json it writes the order to pre-write (most likely first).
 *
 *   node scripts/base-coverage.js [--db path/db.json] [--n 400] [--seed 20261106] [--mode quick] [--plan out.json] [--weights uniform|enrollments]
 */
const fs = require('fs');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const dbPath = arg('db', require('path').join(__dirname, '..', 'data', 'db.json'));
const tmp = require('path').join(require('os').tmpdir(), `basecov-${Date.now()}.json`);
fs.copyFileSync(dbPath, tmp);
process.env.DB_FILE = tmp;
const curriculum = require('../config/curriculum');
const up = require('../services/unit-placement');
const db = require('../config/db');
const N = Number(arg('n', 400)); const SEED = Number(arg('seed', 20261106)); const MODE = arg('mode', 'quick');
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const ready = new Set(db.find('block_plans', (p) => !p.user_id && p.status === 'ready' && p.kind === 'lesson').map((p) => `${p.track_id}/${p.grade_id}/${p.level}`));
const allStarts = [];
const grades = [];
for (const t of curriculum.TRACKS) {
  const track = curriculum.getTrack(t.id || t);
  for (const g of track.grades) {
    if (!up.available(track.id, g.id)) continue;
    grades.push([track.id, g.id]);
    for (const u of up.unitsFor(track.id, g.id)) allStarts.push(`${track.id}/${g.id}/${up.startLevelOf(track.id, g.id, u)}`);
  }
}
const have = allStarts.filter((k) => ready.has(k));
console.log(`placeable grades ${grades.length}, distinct start levels ${new Set(allStarts).size}, with a ready base lesson ${new Set(have).size}`);

// Simulated learners: uniform over placeable grades (a learner picks one), random / extreme-low / extreme-high frontier.
const rand = rng(SEED); const hits = {};
// --weights enrollments: a learner picks a grade in the proportion the database's enrolments do (test accounts included: a caveat), not uniformly.
const enr = {}; if (arg('weights', 'uniform') === 'enrollments') for (const e of db.find('enrollments', () => true)) enr[`${e.track_id}/${e.grade_id}`] = (enr[`${e.track_id}/${e.grade_id}`] || 0) + 1;
const gw = grades.map((g) => enr[g.join('/')] || (Object.keys(enr).length ? 0 : 1)); const gsum = gw.reduce((a, b) => a + b, 0);
const pickGrade = () => { let r = rand() * gsum; for (let i = 0; i < grades.length; i++) { r -= gw[i]; if (r <= 0) return grades[i]; } return grades[grades.length - 1]; };
for (let i = 0; i < N; i++) {
  const [trackId, gradeId] = pickGrade();
  const units = up.unitsFor(trackId, gradeId);
  const kind = i % 10 === 0 ? 'low' : i % 10 === 1 ? 'high' : 'random';
  const f = kind === 'low' ? 0 : kind === 'high' ? units.length : rand() * units.length;
  const holes = new Set(); if (kind === 'random' && rand() < 0.4) for (let u = 1; u <= Math.floor(f); u++) if (rand() < 0.15) holes.add(u);
  const answered = [];
  for (let k = 0; k < 60; k++) {
    const next = up.nextQuestion(trackId, gradeId, MODE, answered); if (!next) break;
    const q = units[next.unit - 1].questions[next.slot];
    const guess = 1 / q.choices.length; const known = 1 / (1 + Math.exp(-(f - up.pointOf(q, next.unit)) / 0.3));
    answered.push({ ...next, correct: holes.has(next.unit) ? rand() < guess : rand() < guess + (1 - 0.03 - guess) * known });
  }
  const key = `${trackId}/${gradeId}/${up.score(trackId, gradeId, answered).placedLevel}`;
  (hits[key] = hits[key] || { n: 0, kind: {} }).n++; hits[key].kind[kind] = (hits[key].kind[kind] || 0) + 1;
}
const total = Object.values(hits).reduce((a, h) => a + h.n, 0);
const covered = Object.entries(hits).filter(([k]) => ready.has(k)).reduce((a, [, h]) => a + h.n, 0);
const hi = Object.entries(hits).filter(([, h]) => h.kind.high);
console.log(`simulated learners ${total}: start level has a ready base lesson for ${covered} (${(100 * covered / total).toFixed(1)}%)`);
const byTrack = {};
for (const [k, h] of Object.entries(hits)) { const t = k.split('/')[0]; (byTrack[t] = byTrack[t] || { n: 0, c: 0 }); byTrack[t].n += h.n; if (ready.has(k)) byTrack[t].c += h.n; }
console.table(Object.entries(byTrack).map(([t, v]) => ({ track: t, learners: v.n, covered: v.c, pct: `${(100 * v.c / v.n).toFixed(0)}%` })));
const missing = new Set(allStarts.filter((k) => !ready.has(k)));
const plan = [...new Set(allStarts)].filter((k) => missing.has(k)).map((k) => ({ key: k, weight: (hits[k] || { n: 0 }).n })).sort((a, b) => b.weight - a.weight);
console.log(`to write for full coverage of start levels: ${plan.length}; for the levels seen in this sample: ${plan.filter((p) => p.weight).length} (covering ${plan.reduce((a, p) => a + p.weight, 0)} of ${total} learners); high-ability learners' start levels missing: ${hi.filter(([k]) => !ready.has(k)).length} of ${hi.length}`);
if (arg('plan', null)) fs.writeFileSync(arg('plan'), JSON.stringify({ placeableGrades: grades.length, readyStarts: new Set(have).size, plan }, null, 1));
process.exit(0);
