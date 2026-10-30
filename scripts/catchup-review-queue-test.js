#!/usr/bin/env node
/**
 * C2e (1): a catch-up level is played on a real enrollment, so its answers are items in the
 * learner's record and feed adaptation.dailyReview. Shows a caught-up objective is not due
 * right after it is answered and is due after the forgetting-curve gap (01-M13 spacing).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-review-queue-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k)) process.env[k] = '';
for (const k of ['ADAPT_OWNER', 'ADMIN_EMAILS', 'OWNER_EMAIL', 'OWNER_BASE']) delete process.env[k];

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const coverage = require('../services/coverage');
const adaptation = require('../services/adaptation');

const DAY = coverage.DAY;
const TRACK = 'math';
const GRADE = 'numbers_to_10';
const grade = curriculum.getGrade(TRACK, GRADE);
const model = coverage.modelFor(TRACK, GRADE);

const user = db.insert('users', { email: 'cq@t.test', name: 'cq', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
const enrollment = db.insert('enrollments', {
  user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: grade.pathLength, current_level: 1,
  level_items: 0, levels_completed: 0, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date().toISOString(),
});
const T0 = Date.parse('2026-10-01T00:00:00Z');
const session = db.insert('sessions', {
  user_id: user.id, enrollment_id: enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson',
  blocks: [{ index: 0, level: 1, kind: 'practice', resolved: true }], started_at: new Date(T0).toISOString(), ended_at: new Date(T0).toISOString(),
});
const o = model.objectives[0];
for (let n = 0; n < 4; n++) {
  db.insert('items', {
    user_id: user.id, session_id: session.id, skill_id: o.skill, difficulty: 3, format: 'short_answer', prompt: `q${n}`, answer: '1',
    choices: null, role: 'check', level: o.lesson_level, block: 0, index: n, user_answer: '1', correct: true, ms: 9000, coach_used: false,
    answered_at: new Date(T0).toISOString(),
  });
}

const dueIds = (now) => ((adaptation.dailyReview({ userId: user.id, enrollment, now }) || {}).retrieve || []).map((r) => r.objective);
let failed = 0;
function check(name, fn) { try { fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); } }

check('the review plan exists for a played catch-up enrollment', () => {
  assert.ok(adaptation.dailyReview({ userId: user.id, enrollment, now: T0 + 60000 }));
});
check('right after the answers the objective is not due', () => {
  assert.ok(!dueIds(T0 + 60000).includes(o.id));
});
check('after the forgetting-curve gap the same objective is due for review', () => {
  assert.ok(dueIds(T0 + 120 * DAY).includes(o.id), JSON.stringify(dueIds(T0 + 120 * DAY)));
});
process.exit(failed ? 1 : 0);
