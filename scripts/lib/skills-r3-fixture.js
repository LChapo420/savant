/**
 * Shared set-up for the skills round 3 tests (scripts/skills-r3-*-test.js):
 * a throwaway data file, every model key blanked, a clock the test moves, an
 * app with the given routers mounted (the x-user header signs in), and
 * learners enrolled in a chess, piano or basketball grade.
 *
 * Require this first, before anything that loads config/db.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
const tmp = path.join(os.tmpdir(), `skills-r3-${path.basename(require.main ? require.main.filename : 'x', '.js')}-${process.pid}.json`);
process.env.DB_FILE = tmp;
for (const k of ['SKILL_RECORD', 'SKILL_STAGE_TESTS', 'SKILL_STAGE_GATE', 'SKILL_DOSE', 'COVERAGE_GATE', 'COVERAGE_RULE', 'ADAPTIVE_TEACHING', 'ADMIN_EMAILS', 'OWNER_EMAIL',
  'SKILL_MAINT_SHARE', 'SKILL_OVERLEARN', 'SKILL_CARRY_DAYS', 'SKILL_COLD_HOURS', 'SKILL_PROOF_DAYS', 'SKILL_STAGE_GATE_SHADOW']) delete process.env[k];
// Patch 05 (chess sittings) is on by default in the app; these tests see 02's own checks unless one turns it on.
process.env.SKILL_CHESS_SITTINGS = 'off';
// The later piano and basketball sittings (2026-10-24) are on by default too; off here for the same reason.
process.env.SKILL_PIANO_BB_SITTINGS = 'off';
process.env.SKILL_STAGE_GATE_SHADOW = '';
// The live defaults are on (the coverage gate: enforce; the stage gate: on per fully wired stage) since
// 2026-10-24 (LIVE-CHANGES-2026-10-24.md). These tests start from every switch off, as written, and turn on what they test.
Object.assign(process.env, { SKILL_RECORD: 'off', SKILL_STAGE_TESTS: 'off', SKILL_STAGE_GATE: 'shadow', SKILL_DOSE: 'off', COVERAGE_GATE: 'shadow', ADAPTIVE_TEACHING: 'off', ADAPT_REVIEW_SESSION: 'off', ADAPT_CONSOLIDATE: 'off', ADAPT_EFFORT: 'off', ADAPT_REMEDIATION: 'off' });

const express = require('express');
const db = require('../../config/db');
const curriculum = require('../../config/curriculum');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// The clock: tests move it; everything that calls Date.now() sees it.
const realNow = Date.now.bind(Date);
let clock = Date.UTC(2026, 9, 1, 9, 0, 0);
Date.now = () => clock;
const at = (t) => { clock = t; return clock; };
const later = (ms) => { clock += ms; return clock; };

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 500)}`}`);
}

let n = 0;
/** A learner enrolled in a grade, standing on `level` (default 1; 'final' for the grade's Final). */
function learner(track, gradeId, level = 1, extra = {}) {
  n += 1;
  const grade = curriculum.getGrade(track, gradeId);
  const final = grade.levels.find((l) => l.kind === 'graduation').level;
  const user = db.insert('users', { email: `sk${n}-${process.pid}@example.test`, display_name: `Tester ${n}`, password_hash: 'x', streak: 0, xp: 0, onboarded: true });
  const lvl = level === 'final' ? final : level;
  const enrollment = db.insert('enrollments', {
    user_id: user.id, track_id: track, grade_id: gradeId, target_level: grade.pathLength, current_level: lvl,
    level_items: 0, levels_completed: lvl - 1, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date(clock).toISOString(), ...extra,
  });
  return { user, enrollment, grade, final };
}

/** An app with the routers mounted under /api; the x-user header is the signed-in account. */
function serve(routers) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  for (const r of routers) app.use('/api', r);
  app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint.' }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const call = (method, url, body, uid) => new Promise((done, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } done({ status: res.statusCode, json }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ get: (u, uid) => call('GET', u, null, uid), post: (u, b, uid) => call('POST', u, b || {}, uid), close: () => server.close() });
    });
  });
}

/** Load a module fresh, by its path from the repo root ('routes/skills'). */
function fresh(mod) {
  const p = require.resolve(path.join(__dirname, '..', '..', mod));
  delete require.cache[p];
  return require(p);
}

function done() {
  try { fs.unlinkSync(tmp); } catch { /* not written */ }
  try { fs.unlinkSync(`${tmp}.tmp`); } catch { /* not written */ }
  console.log(failures ? `\n${failures} FAILED` : '\nPASS');
  process.exit(failures ? 1 : 0);
}

module.exports = { db, curriculum, HOUR, DAY, at, later, now: () => clock, realNow, check, learner, serve, fresh, done, failures: () => failures };
