#!/usr/bin/env node
/**
 * Clone one learner's Spanish state into a new test account, inside a COPY of the
 * database, so the catch-up migration can be proved on real data without touching
 * the real account or the live file.
 *
 *   DB_FILE=/tmp/copy.json node scripts/spanish-catchup-clone.js <userId> <newEmail> <passwordFile>
 *
 * Copies the learner's Spanish subject placement, enrollments (with their unit
 * plans, the catch-up entries pointing at the copied enrollments), review boxes,
 * Duolingo-style runs and goals. A random password is written to <passwordFile>
 * (never printed). Refuses to run on the default data/db.json.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const live = path.resolve(path.join(__dirname, '..', 'data', 'db.json'));
if (!process.env.DB_FILE || path.resolve(process.env.DB_FILE) === live) {
  console.error('Set DB_FILE to a copy of the database; this never runs on data/db.json.');
  process.exit(2);
}
const [userId, email, pwFile] = process.argv.slice(2);
if (!userId || !email || !pwFile) { console.error('usage: <userId> <newEmail> <passwordFile>'); process.exit(2); }

const db = require('../config/db');
// eslint-disable-next-line import/no-extraneous-dependencies
const bcrypt = require('bcryptjs');

const src = db.byId('users', Number(userId));
if (!src) { console.error('no such user'); process.exit(1); }
if (db.findOne('users', (u) => u.email === email)) { console.error('that email is already in the copy'); process.exit(1); }
const password = crypto.randomBytes(12).toString('base64url');
fs.writeFileSync(pwFile, password);
const strip = ({ id, ...rest }) => rest;
const user = db.insert('users', { ...strip(src), email, display_name: 'Catch-up test copy', password_hash: bcrypt.hashSync(password, 10), referral_code: null, created_at: new Date().toISOString() });

const map = new Map();
for (const e of db.find('enrollments', (x) => x.user_id === src.id && x.track_id === 'spanish')) {
  map.set(e.id, db.insert('enrollments', { ...strip(e), user_id: user.id }).id);
}
for (const id of map.values()) {
  const e = db.byId('enrollments', id);
  if (e.unit_plan && Array.isArray(e.unit_plan.catch_up)) {
    db.update('enrollments', id, { unit_plan: { ...e.unit_plan, catch_up: e.unit_plan.catch_up.map((c) => ({ ...c, enrollment_id: map.get(c.enrollment_id) || c.enrollment_id })) } });
  }
}
for (const p of db.find('subject_placements', (x) => x.user_id === src.id && x.track_id === 'spanish')) db.insert('subject_placements', { ...strip(p), user_id: user.id });
for (const r of db.find('es_review', (x) => x.user_id === src.id)) db.insert('es_review', { ...strip(r), user_id: user.id });
for (const r of db.find('es_path_runs', (x) => x.user_id === src.id)) db.insert('es_path_runs', { ...strip(r), user_id: user.id, enrollment_id: map.get(r.enrollment_id) || r.enrollment_id });
for (const g of db.find('learner_goals', (x) => x.user_id === src.id && x.track_id === 'spanish')) db.insert('learner_goals', { ...strip(g), user_id: user.id });
for (const c of db.find('parental_consents', (x) => x.user_id === src.id)) db.insert('parental_consents', { ...strip(c), user_id: user.id });

console.log(JSON.stringify({ user_id: user.id, email, enrollments: Object.fromEntries(map) }));
process.exit(0);
