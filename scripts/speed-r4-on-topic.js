#!/usr/bin/env node
/**
 * Round 4 (docs/speed-real/ROUND4.md): do a practice level's questions practise what its lesson taught? AI-JUDGED by a free NVIDIA model. The questions are the ones the real session code builds for a new learner on a
 * throwaway database (no learner, no real text); only curriculum text goes to the model. Held-out grades, levels picked by a hash fixed before any run.
 *   node scripts/speed-r4-on-topic.js OUT.json [--n=60] [--width=2] [--follows=on|off]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
const flag = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=').slice(1).join('=') : d; };
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r4-ontopic-')), 'db.json');
process.env.NODE_ENV = 'test';
process.env.PRACTICE_FOLLOWS_LESSON = flag('follows', 'on');
for (const kv of String(flag('env', '')).split(',').filter(Boolean)) { const [k, v] = kv.split('='); process.env[k] = v; }
const keep = process.env.NVIDIA_API_KEY; for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k) && k !== 'NVIDIA_API_KEY') delete process.env[k]; process.env.NVIDIA_API_KEY = keep;
const OUT = process.argv.slice(2).find((a) => !a.startsWith('--'));
const N = Number(flag('n', 60)); const WIDTH = Number(flag('width', 2));
const log = console.log; console.warn = () => {}; console.error = () => {};
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const coverage = require('../services/coverage');
const sessions = require('../services/sessions');
const nvidia = require('../services/providers/nvidia');
const { heldOut } = require('./speed-r4-composition');

const order = (s) => crypto.createHash('sha1').update(`r4topic:${s}`).digest('hex');
const SCHEMA = { type: 'object', properties: { on_topic: { type: 'array', items: { type: 'boolean' } } }, required: ['on_topic'] };

(async () => {
  const user = db.insert('users', { email: 'r4-topic@savant-local-sim.org', display_name: 'r4', onboarded: true, account_type: 'standard', age_check: { age_at_check: 30, under_13: false } });
  const candidates = [];
  for (const tr of Object.values(curriculum.TRACKS)) {
    if (tr.id === 'spanish') continue;
    for (const g of tr.grades) {
      if (flag('only') ? !flag('only').split(',').includes(tr.id + '/' + g.id) : !heldOut(tr.id, g.id)) continue;
      const m = coverage.modelFor(tr.id, g.id); if (!m) continue;
      for (const o of m.objectives) if (o.practice && o.practice.length) candidates.push({ track: tr.id, grade: g.id, o });
    }
  }
  const chosen = candidates.sort((a, b) => (order(`${a.grade}/${a.o.lesson_level}`) < order(`${b.grade}/${b.o.lesson_level}`) ? -1 : 1)).slice(0, N);
  const levels = [];
  for (const c of chosen) {
    const grade = curriculum.getGrade(c.track, c.grade); const level = c.o.practice[0];
    const enr = db.insert('enrollments', { user_id: user.id, track_id: c.track, grade_id: c.grade, target_level: grade.pathLength, current_level: level, level_items: 0, levels_completed: level - 1, xp: 0, status: 'active', placed_at: new Date().toISOString() });
    try {
      const out = await sessions.createSession({ userId: user.id, enrollment: enr, grade });
      const items = out.items.map((i) => db.byId('items', i.id)).filter((i) => i && i.role !== 'review').slice(0, 6);
      levels.push({ id: `${c.track}/${c.grade}/${level}`, title: c.o.title, covers: c.o.covers, entry: (LAYOUT.entryFor(grade, level) || {}).title, skillMatch: curriculum.levelPlan(grade, level).focus === c.o.skill, prompts: items.map((i) => String(i.prompt).slice(0, 220)) });
      db.update('sessions', out.session.id, { ended_at: new Date().toISOString() });
    } catch (e) { /* a level that cannot be built is left out and counted */ }
  }
  log(`levels built ${levels.length} of ${chosen.length}`);
  let i = 0; let live = 0; const rows = [];
  await new Promise((resolve) => {
    const next = () => {
      if (i >= levels.length && live === 0) return resolve();
      while (live < WIDTH && i < levels.length) {
        const l = levels[i++]; live++;
        (async () => {
          const user2 = `LESSON TITLE: ${l.title}\nWHAT THE LESSON TEACHES: ${l.covers}\n\nQUESTIONS:\n${l.prompts.map((p, j) => `${j + 1}. ${p}`).join('\n')}\n\nFor each question, in order: does answering it practise this lesson's own topic? true only if a learner must use what this lesson teaches. A question that belongs to another topic of the same subject is false.`;
          const out = await nvidia.structured({ role: 'check', system: 'You judge whether practice questions match a lesson. Be strict and literal.', user: user2, schema: SCHEMA, schemaName: 'submit_judgement', maxTokens: 3000 });
          const a = (out && out.data && out.data.on_topic) || [];
          rows.push({ id: l.id, skillMatch: l.skillMatch, n: l.prompts.length, yes: a.slice(0, l.prompts.length).filter(Boolean).length, judged: Math.min(a.length, l.prompts.length) });
        })().catch(() => { rows.push({ id: l.id, error: true }); }).finally(() => { live--; next(); });
      }
    };
    next();
  });
  const ok = rows.filter((r) => !r.error && r.judged);
  const yes = ok.reduce((s, r) => s + r.yes, 0); const n = ok.reduce((s, r) => s + r.judged, 0);
  const res = { ai_judged: true, follows: process.env.PRACTICE_FOLLOWS_LESSON, levels: ok.length, errors: rows.length - ok.length, questions: n, on_topic: yes, share: n ? yes / n : null, skill_match_levels: ok.filter((r) => r.skillMatch).length, on_topic_where_skill_matches: (() => { const m = ok.filter((r) => r.skillMatch); const y = m.reduce((s, r) => s + r.yes, 0); const t = m.reduce((s, r) => s + r.judged, 0); return t ? y / t : null; })(), rows };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  log(JSON.stringify({ ...res, rows: undefined }));
  process.exit(0);
})();
