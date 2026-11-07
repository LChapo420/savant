/**
 * Time to the end of a retention goal, per goal and per learner kind, for each built course. ESTIMATED: words at 230 a minute (docs/UPLOADS-ANY-FORMAT.md section 6), 35 s a question (docs/FASTER-BY-GOAL.md),
 * reviews from the app's own interval code (services/material-path.js intervalDays, services/retention-goal.js) for a learner who gets every review right, the most favourable case for every arm alike. Not a measurement of anyone.
 * It compares the app with itself (today against the optimizer) and with reading the material N times, which is the plainest "normal studying". It says nothing about what anyone remembers.
 *   node scripts/uploads-beta-time.js
 */
const fs = require('fs'); const path = require('path');
const L = require('./lib/uploads-beta-lib');
const O = require('../services/material-optimize');
const P = require('../services/material-path');

const WPM = 230; const Q_S = 35; const REVIEW_QS = 2;
const HORIZONS = [['1 week', 7], ['1 month', 30], ['6 months', 180], ['1 year', 365]];
/** Reviews of one skill until the horizon ends, each interval from the app's curve, all answered right. */
function reviewsUntil(days) {
  let t = 0; let right = 5; let n = 0;
  for (let guard = 0; guard < 60; guard += 1) {
    const step = P.intervalDays(right, 0, 0, null);
    if (t + step > days) break;
    t += step; n += 1; right += REVIEW_QS;
  }
  return n;
}
const dir = path.join(L.OUT_DIR, 'courses');
const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const c = L.load(path.join(dir, f));
  const skills = c.course.skills.length;
  const src = L.words(c.plain);
  const todayWords = L.words(c.course.skills.flatMap((s) => [...s.lesson.paragraphs, ...(s.lesson.key_points || [])]).join(' '));
  const arms = {
    today: { read: todayWords / WPM, checks: skills * 5, practice: skills * 3 },
  };
  for (const [name, goal, lean] of [['full', 'full', false], ['lean', 'full', true], ['core', 'core', false]]) {
    const v = O.optimize({ course: c.course, text: c.plain, keyPoints: c.key_points, goal, lean });
    let practice = 0; let checks = 0;
    for (const s of v.skills.values()) { checks += s.lean ? Math.max(1, Math.min(s.checks, Math.round(s.facts / 3))) : s.checks; practice += s.lean ? 1 : goal === 'core' ? 1 : 2; }
    arms[name] = { read: v.stats.reading_words / WPM, checks, practice, share: v.stats.share };
  }
  const row = { doc: c.doc, src, skills };
  for (const [h, days] of HORIZONS) {
    const rev = reviewsUntil(days);
    row[h] = { reviews_per_skill: rev };
    for (const [name, a] of Object.entries(arms)) row[h][name] = a.read + ((a.checks + a.practice) * Q_S) / 60 + (rev * skills * REVIEW_QS * Q_S) / 60;
    row[h].read_source_5x = (5 * src) / WPM;
  }
  row.first_pass = Object.fromEntries(Object.entries(arms).map(([k, a]) => [k, a.read + ((a.checks + a.practice) * Q_S) / 60]));
  rows.push(row);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`${rows.length} documents, mean source ${Math.round(mean(rows.map((r) => r.src)))} words, mean ${mean(rows.map((r) => r.skills)).toFixed(1)} skills. ESTIMATED minutes.`);
const names = ['today', 'full', 'lean', 'core'];
console.log(`first pass:      ${names.map((n) => `${n} ${mean(rows.map((r) => r.first_pass[n])).toFixed(1)}`).join('  ')}`);
for (const [h] of HORIZONS) console.log(`to ${h.padEnd(9)} (${mean(rows.map((r) => r[h].reviews_per_skill)).toFixed(0)} reviews a skill): ${names.map((n) => `${n} ${mean(rows.map((r) => r[h][n])).toFixed(1)}`).join('  ')}  | reading the material 5 times ${mean(rows.map((r) => r[h].read_source_5x)).toFixed(1)}`);
L.save(path.join(L.OUT_DIR, 'time.json'), rows);
