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
console.log('ok  log features: read from items and sessions, none for a thin log');
