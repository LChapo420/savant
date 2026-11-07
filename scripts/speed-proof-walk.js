#!/usr/bin/env node
/**
 * Walks the speed proof as a tester would, on real services and a throwaway database: says yes, works real lessons of a real grade, comes back on later days for the memory checks, and the report is read at the end.
 * Answers are scripted, so the numbers say nothing about learning: this checks that the data the verdict needs really gets stored (docs/SPEED-PROOF.md). Run: node scripts/speed-proof-walk.js [--lessons=8] [--learners=3]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-proof-walk-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.NODE_ENV = 'test';
process.env.SPEED_PROOF = 'on';
process.env.SPEED_PROOF_NORMAL_SHARE = '0.25';
process.env.SPEED_MASTERY_STOP = 'off';
delete process.env.OPENROUTER_API_KEY;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp */ } });
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? Number(m.split('=')[1]) : d; };
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const sessions = require('../services/sessions');
const sp = require('../services/speed-proof');

const DAY = 86400000;
const grade = curriculum.getGrade('math', 'algebra_2_part_a');

async function workLesson(user, enr) {
  const fresh = db.byId('enrollments', enr.id);
  const out = await sessions.createSession({ userId: user.id, enrollment: fresh, grade });
  const s = out.session;
  for (const it of out.items) {
    const row = db.byId('items', it.id);
    if (row.correct !== null && row.correct !== undefined) continue;
    await sessions.answer({ userId: user.id, session: db.byId('sessions', s.id), itemId: it.id, userAnswer: row.answer, ms: 12000 });
  }
  sessions.resolveBlock({ userId: user.id, session: db.byId('sessions', s.id), enrollment: db.byId('enrollments', enr.id), grade, blockIndex: 0 });
  await sessions.finish({ userId: user.id, session: db.byId('sessions', s.id) });
}

(async () => {
  const N = arg('learners', 3); const LESSONS = arg('lessons', 8);
  const users = [];
  for (let i = 0; i < N; i++) {
    const u = db.insert('users', { email: `walker${i}@savant-local-sim.org`, display_name: `walker${i}`, onboarded: true, account_type: 'standard', age_check: { birth_ym: '1990-01', age_at_check: 36, under_13: false, needs_parent: false, asked_on: 'sign_up' } });
    const e = db.insert('enrollments', { user_id: u.id, track_id: 'math', grade_id: grade.id, target_level: grade.pathLength, current_level: 10, level_items: 0, levels_completed: 9, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date().toISOString() });
    const c = sp.setConsent(db.byId('users', u.id), true);
    if (!c.ok) throw new Error(`consent refused: ${c.reason}`);
    users.push({ u, e });
  }
  for (const { u, e } of users) {
    let guard = 0;
    while (guard++ < LESSONS * 3) {
      const before = db.byId('enrollments', e.id).current_level;
      if (before > 10 + LESSONS * 12) break;
      await workLesson(u, e);
      const after = db.byId('enrollments', e.id).current_level; if (process.env.WALK_DEBUG) console.log('level', before, '->', after, 'items', db.byId('enrollments', e.id).level_items, 'kind', db.find('sessions', (x) => x.user_id === u.id).slice(-1)[0].kind, db.find('sessions', (x) => x.user_id === u.id).slice(-1)[0].ended_at ? 'ended' : 'open');
      if (after === before && guard > 3 && db.find('sessions', (x) => x.user_id === u.id).length > LESSONS * 4) break;
    }
  }
  const now = Date.now();
  for (const { u } of users) {
    const rows = sp.measure(u.id, now);
    const look = (r) => `${r.skill_id} ${r.arm === 'normal' ? 'PLAIN' : 'savant'} ${r.understood_at ? 'understood' : 'not yet'} ${r.answers}/${r.answers_total || 0} answers ${r.minutes} min`;
    console.log(`learner ${u.id}: ${rows.length} rows, plain ${rows.filter((r) => r.arm === 'normal').length}, held back ${rows.filter((r) => r.held_back).length}, understood ${rows.filter((r) => r.understood_at).length}`);
    console.log(`  ${rows.slice(0, 5).map(look).join('\n  ')}`);
  }
  // later days: every point due is offered and answered
  let asked = 0; let unanswerable = 0;
  for (const offset of [1.1, 2.2, 7.5, 8.6, 30.5, 31.6, 32.7]) {
    const t = now + offset * DAY;
    for (const { u } of users) {
      for (let round = 0; round < 40; round++) {
        const d = sp.dueChecks(u.id, t);
        if (!d.length) break;
        const v = sp.start(db.byId('users', u.id), t);
        if (v.error) { unanswerable += d.length; break; }
        const answers = {}; for (const q of v.questions) answers[q.n] = 0;
        sp.answer(db.byId('users', u.id), v.check_id, answers, t); asked += v.questions.length;
      }
    }
  }
  sp.dueChecks(users[0].u.id, now + 60 * DAY);
  const rep = sp.report({ now: now + 60 * DAY, minLearners: 2, label: 'WALK_SCRIPTED' });
  console.log(`checks answered ${asked}, due with no question possible ${unanswerable}`);
  console.log(JSON.stringify({ samples: rep.overall.samples, verdict: rep.overall.verdict.status, both_arms: rep.overall.time.learners_with_both_arms, ret_both: rep.overall.retention.learners_with_both_arms, total_speedup: rep.overall.time.speedup_total_geomean }, null, 0));
  console.log(rep.learners.map((l) => `${l.user_id}: savant ${l.savant_skills}, plain ${l.normal_skills}, x${l.speedup}, ret ${l.savant_retention}/${l.normal_retention}`).join('\n'));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
