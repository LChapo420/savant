/**
 * Build today's course (default learner, default path) for every held-out document and keep the whole course, so the optimizer, the parts and the gates can be run on real courses without paying for
 * a build each time. Rows: <OUT_DIR>/courses/<doc>.json. Written documents, no learner data. node scripts/uploads-beta-courses.js [ids]
 */
const path = require('path');
const L = require('./lib/uploads-beta-lib');

L.setup('courses');
const db = require('../config/db');
const materials = require('../services/materials');
const K = require('../services/material-keypoints');
const cb = require('../services/course-builder');
const J = require('./lib/invented-judges');

(async () => {
  const only = process.argv.slice(2);
  const docs = L.allDocs().filter((d) => !only.length || only.includes(d.id));
  const u = db.insert('users', { email: 'ub@example.test', display_name: 'UB', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  await J.pool(docs, Number(process.env.UB_CONC || 3), async (d) => {
    const f = path.join(L.OUT_DIR, 'courses', `${d.id}.json`);
    if (L.load(f, null)) return;
    const src = await L.extracted(d);
    const m = materials.addPaste(u.id, d.title, src.plain);
    if (m.error) { console.log(d.id, 'add failed', m.error); return; }
    const kps = K.extract(src.rich, { plain: src.plain });
    db.update('materials', m.value.id, { key_points: kps.key_points, topics: kps.topics, assessed: kps.assessed });
    const t0 = Date.now();
    let built;
    try { built = await cb.build(u.id, m.value.id, { llm: L.builderLlm(J), force: true, factcheck: true, stress: true, split: true }); } catch (e) { built = { error: e.message }; }
    if (!built.course) { console.log(d.id, 'build failed', built.error); return; }
    L.save(f, { doc: d.id, title: d.title, fmt: d.fmt, plain: src.plain, rich: src.rich, key_points: kps.key_points, course: built.course, build_s: Math.round((Date.now() - t0) / 1000), ...L.examOf(d.id) });
    const lw = built.course.skills.flatMap((s) => [...s.lesson.paragraphs, ...(s.lesson.key_points || [])]).join(' ');
    console.log(`${d.id} ${built.course.status} ${built.course.skills.length} skills, ${L.words(src.plain)} -> ${L.words(lw)} words in ${Math.round((Date.now() - t0) / 1000)} s`);
  });
  console.log('spend', JSON.stringify(J.spend));
  db.flush();
  process.exit(0);
})();
