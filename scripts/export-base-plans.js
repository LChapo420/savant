#!/usr/bin/env node
/**
 * Export the ready shared (base) lessons of one grade from a COPY of a database to a portable file, with their fact-check results, in the shape
 * services/base-content.js imports (same `portable` stripping). Writes nowhere else; the file is NOT auto-imported unless it is put in
 * content/base-levels/ (the server imports that folder on start, adding only levels the data file lacks).
 *
 *   node scripts/export-base-plans.js <db copy> <track> <grade> <out file>
 */
const fs = require('fs');
const [, , DB, TRACK, GRADE, OUT] = process.argv;
if (!DB || !OUT) { console.error('usage: export-base-plans.js <db copy> <track> <grade> <out>'); process.exit(2); }
const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
const plans = (d.block_plans || []).filter((p) => p.user_id === null && p.status === 'ready' && p.track_id === TRACK && p.grade_id === GRADE).map((row) => { const o = { ...row }; for (const k of ['id', 'answers', 'telemetry', 'claimed_at', 'started_at']) delete o[k]; return o; });
fs.writeFileSync(OUT, `${JSON.stringify({ track_id: TRACK, grade_id: GRADE, exported_at: new Date().toISOString(), source: 'temp db copy, 6 Nov 2026 first-lesson round 2/3', plans, games: [] })}\n`);
console.log(plans.map((p) => `${p.level}:${p.check_tier || '-'}:${p.verification ? p.verification.status || 'verified' : 'no-verification'}`).join(' '), '->', OUT);
