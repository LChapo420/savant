#!/usr/bin/env node
/**
 * How often is the first lesson already written when placement ends? (brief first-lesson, 4 Nov 2026; SIMULATED learners, no model calls.)
 * Replays the app's in-grade walk (services/unit-placement.js) for random learners (a frontier, planted holes, "extreme" ones at both ends),
 * and applies the same prewrite rule routes/placement.js uses: the likely two start levels (likelyStarts) when the grade starts and again
 * from the mode's `min` answers on, at most 4 distinct levels per enrollment (write-ahead PREWRITE_MAX). Reports the share of learners whose
 * final start level was among the levels written, and among the best two at the end.
 *
 *   node scripts/prewrite-hit-sim.js [--mode quick] [--seed 20261104] [--n 60] [--tracks math,english,iq,spanish]
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prewrite-sim-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
const curriculum = require('../config/curriculum');
const up = require('../services/unit-placement');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const MODE = arg('mode', 'quick'); const SEED = Number(arg('seed', 20261104)); const N = Number(arg('n', 60));
const TRACKS = String(arg('tracks', 'math,english,iq,spanish')).split(',');
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MAXW = Number(arg('max', 4));
const rows = [];
for (const trackId of TRACKS) {
  const grades = curriculum.getTrack(trackId).grades.map((g) => g.id).filter((id) => up.available(trackId, id));
  if (!grades.length) continue;
  const rand = rng(SEED + trackId.length * 7);
  for (let i = 0; i < N; i++) {
    const gradeId = grades[Math.floor(rand() * grades.length)];
    const units = up.unitsFor(trackId, gradeId);
    const kind = i % 10 === 0 ? 'extreme-low' : i % 10 === 1 ? 'extreme-high' : 'random';
    const f = kind === 'extreme-low' ? 0 : kind === 'extreme-high' ? units.length : rand() * units.length;
    const holes = new Set(); if (kind === 'random' && rand() < 0.4) for (let u = 1; u <= Math.floor(f); u++) if (rand() < 0.15) holes.add(u);
    const answered = []; const written = new Set(); let last = []; if (argv.includes('--prior')) { last = up.likelyStarts(trackId, gradeId, [], 2); last.forEach((l) => written.add(l)); }
    let asked = 0; let firstHitAt = null;
    for (let k = 0; k < 60; k++) {
      const next = up.nextQuestion(trackId, gradeId, MODE, answered);
      if (!next) break;
      const q = units[next.unit - 1].questions[next.slot];
      const guess = 1 / q.choices.length;
      const known = 1 / (1 + Math.exp(-(f - up.pointOf(q, next.unit)) / 0.3));
      const correct = holes.has(next.unit) ? rand() < guess : rand() < guess + (1 - 0.03 - guess) * known;
      answered.push({ ...next, correct }); asked++;
      if (answered.length >= up.modeCfg(trackId, MODE).min) {
        last = up.likelyStarts(trackId, gradeId, answered, 2);
        for (const l of last) if (written.size < MAXW) written.add(l);
      }
    }
    const result = up.score(trackId, gradeId, answered);
    rows.push({ trackId, kind, hit: written.has(result.placedLevel), hitFinalTop2: up.likelyStarts(trackId, gradeId, answered, 2).includes(result.placedLevel), written: written.size, asked, ahead: asked - up.modeCfg(trackId, MODE).min });
  }
}
const pct = (a) => `${(100 * a.filter(Boolean).length / (a.length || 1)).toFixed(0)}%`;
const by = {};
for (const r of rows) (by[r.trackId] = by[r.trackId] || []).push(r);
console.log(`mode ${MODE}, seed ${SEED}, ${rows.length} simulated learners`);
console.table([...Object.entries(by), ['all', rows]].map(([t, g]) => ({ track: t, n: g.length, startLevelWritten: pct(g.map((x) => x.hit)), inFinalTop2: pct(g.map((x) => x.hitFinalTop2)), extremesWritten: pct(g.filter((x) => x.kind !== 'random').map((x) => x.hit)), meanWrites: (g.reduce((s, x) => s + x.written, 0) / g.length).toFixed(1) })));
process.exit(0);
