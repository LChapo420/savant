/**
 * What the goal's reading does to each built course: words and facts, no model (MEASURED; the courses are real builds of written handouts, no learner).
 * node scripts/uploads-beta-stats.js
 */
const fs = require('fs'); const path = require('path');
const L = require('./lib/uploads-beta-lib');
const O = require('../services/material-optimize');

const dir = path.join(L.OUT_DIR, 'courses');
const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const c = L.load(path.join(dir, f));
  const raw = c.course.skills.flatMap((s) => [...s.lesson.paragraphs, ...(s.lesson.key_points || [])]).join(' ');
  const qWords = c.course.skills.flatMap((s) => s.questions.map((q) => `${q.prompt} ${(q.choices || []).join(' ')} ${q.explanation || ''}`)).join(' ');
  const row = { doc: c.doc, src: L.words(c.plain), today: L.words(raw), skills: c.course.skills.length, qs: c.course.skills.reduce((n, s) => n + s.questions.length, 0), qwords: L.words(qWords), build_s: c.build_s };
  for (const [name, goal, lean] of [['full', 'full', false], ['lean', 'full', true], ['test', 'test', false], ['core', 'core', false], ['coreLean', 'core', true]]) {
    const t0 = Date.now();
    const v = O.optimize({ course: c.course, text: c.plain, keyPoints: c.key_points, goal, lean });
    const s = v.stats;
    row[name] = { share: Math.round(s.share * 100) / 100, facts: `${s.facts_in_reading}/${s.facts}`, stress: `${s.stressed_in_reading}/${s.stressed}`, added: s.added_from_source, aside: s.aside_words, checks: s.checks, ms: Date.now() - t0 };
  }
  rows.push(row);
}
for (const r of rows) {
  console.log(`${r.doc}: source ${r.src} words, today's lessons ${r.today} (${(r.today / r.src).toFixed(2)}x), ${r.skills} skills, ${r.qs} questions (${r.qwords} words), built in ${r.build_s} s`);
  for (const k of ['full', 'lean', 'test', 'core', 'coreLean']) console.log(`   ${k.padEnd(9)} ${String(r[k].share).padEnd(5)}x  facts ${r[k].facts.padEnd(8)} stressed ${r[k].stress.padEnd(7)} added ${String(r[k].added).padEnd(3)} aside ${String(r[k].aside).padEnd(5)} checks ${String(r[k].checks).padEnd(4)} ${r[k].ms} ms`);
}
L.save(path.join(L.OUT_DIR, 'stats.json'), rows);
