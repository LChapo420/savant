/** The live answer-log feature extractor (services/scorecard/log-features.js): needs enough answers, reads typed vs multiple choice, never touches other users. Temp DB. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'logfeat-')), 'db.json');
const db = require('../config/db');
const LF = require('../services/scorecard/log-features');
const now = Date.now();
for (let i = 0; i < 40; i++) db.insert('items', { user_id: 9001, role: i % 5 === 0 ? 'review' : 'check', level: 1 + Math.floor(i / 10), format: i % 3 ? 'multiple_choice' : 'short_answer', correct: i % 4 !== 0, ms: 4000 + i * 100, confidence: i % 2 ? 'sure' : 'guess', coach_used: false, answer_changes: 0 });
for (let i = 0; i < 5; i++) db.insert('items', { user_id: 9002, role: 'check', level: 1, format: 'multiple_choice', correct: true, ms: 3000 });
for (let d = 0; d < 6; d++) db.insert('sessions', { user_id: 9001, started_at: new Date(now - (6 - d) * 86400000).toISOString(), ended_at: d ? new Date(now - (6 - d) * 86400000 + 600000).toISOString() : null });
const f = LF.forUser(9001, now);
assert(f && LF.FEATURES.every((k) => Number.isFinite(f[k])), 'every feature is a finite number');
assert(Math.abs(f.acc - 0.75) < 1e-9 && f.typedGap !== 0 && f.levelsPerDay > 0, 'accuracy and the typed gap are read from the log');
assert.strictEqual(LF.forUser(9002, now), null, 'five answers are too few to read a behaviour from');
// the extra within-learner contrasts: a learner who is faster and worse on hard items, slow after misses, studying at night in long sittings
{
  const rows = []; const t0 = Date.parse('2026-01-01T23:00:00Z');
  for (let sit = 0; sit < 6; sit++) for (let i = 0; i < 10; i++) {
    const hard = i % 3 === 0; const mid = i % 3 === 1; rows.push({ session_id: sit, index: i, level: sit, skill_id: `s${i % 3}`, role: i < 2 ? 'review' : 'check', difficulty: hard ? 8 : mid ? 5 : 3, correct: hard ? i % 2 === 0 : true, ms: hard ? 9000 : 3000, format: 'multiple_choice', created_at: new Date(t0 + sit * 3 * 86400000 + i * 20000).toISOString() });
  }
  const e = LF.extraFeatures(rows);
  assert(LF.EXTRA.every((k) => Number.isFinite(e[k])), 'every extra feature is a finite number');
  assert(e.hardEff < -0.3, `hard items are answered worse (${e.hardEff})`);
  assert(e.nightRate === 1 && e.sitLen > 2, 'night studying and sitting length read');
  assert.deepStrictEqual(Object.values(LF.extraFeatures([])).filter((v) => v !== 0), [], 'an empty log reads 0 everywhere');
}
console.log('ok  log features: read from items and sessions, none for a thin log');
