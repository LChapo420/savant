/**
 * Serving holds on shared game sets (services/game-payloads.js held(); owner,
 * 2026-10-24; curriculum-build/LIVE-CHANGES-2026-10-24.md).
 *   node scripts/game-holds-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
delete process.env.GAME_HOLDS;
const tmp = path.join(os.tmpdir(), `game-holds-test-${process.pid}.json`);
process.env.DB_FILE = tmp;

const db = require('../config/db');
const ai = require('../services/ai');
const games = require('../services/game-payloads');

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`); } };

const holds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'game-holds.json'), 'utf8')).holds;
const listed = holds[0];
const payload = { schemaVersion: 1, engineId: listed.engine_id, meta: { topic: 't', subject: 'english' }, settings: {}, questions: [{ id: 'q1', prompt: 'p', choices: ['a', 'b'], answerIndex: 0, explanation: 'a' }], feedback: {} };

(async () => {
  let calls = 0;
  ai.structured = async () => { calls++; return null; };
  const user = db.insert('users', { email: 'holds-learner@example.test', display_name: 'Learner', birth_year: 1990 });
  check('the hold list names the 70 English Proficient levels', holds.length === 70 && holds.every((h) => h.track_id === 'english' && h.grade_id === 'proficient'), holds.length);
  check('on by default', games.holdsOn() === true);
  check('a listed level with no stored row yet is held (a fresh store)', games.held(listed.track_id, listed.grade_id, listed.level) === true);
  const row = db.insert('game_payloads', { user_id: null, engine_id: listed.engine_id, track_id: listed.track_id, grade_id: listed.grade_id, level: listed.level, payload, problems: [], model: 'glm' });
  check('a listed level with a clean stored set is held', games.held(listed.track_id, listed.grade_id, listed.level) === true);
  check('held: not ready, and no learner may open it (the level opens as an ordinary session)', !games.sharedReady(listed.track_id, listed.grade_id, listed.level) && games.accessFor(user, listed.track_id, listed.grade_id, listed.level) === false);
  check('held: the answer route finds no stored set', games.stored(listed.track_id, listed.grade_id, listed.level, user.id) === null);
  const out = await games.ensure(user.id, listed.track_id, listed.grade_id, listed.level, {});
  check('held: ensure serves nothing and writes nothing (no model call, row unchanged)', out === null && calls === 0 && JSON.stringify(db.byId('game_payloads', row.id).payload) === JSON.stringify(payload), { out, calls });
  process.env.GAME_HOLDS = 'off';
  check('GAME_HOLDS=off: served again', games.held(listed.track_id, listed.grade_id, listed.level) === false && games.sharedReady(listed.track_id, listed.grade_id, listed.level) === true);
  delete process.env.GAME_HOLDS;
  db.update('game_payloads', row.id, { verified_replacement: { source: 'test', at: new Date().toISOString() } });
  check('a verified replacement is served', games.held(listed.track_id, listed.grade_id, listed.level) === false && games.sharedReady(listed.track_id, listed.grade_id, listed.level) === true);
  db.update('game_payloads', row.id, { verified_replacement: null, serving_hold: { reason: 'test' } });
  check('serving_hold on the row holds too', games.held(listed.track_id, listed.grade_id, listed.level) === true);
  const other = db.insert('game_payloads', { user_id: null, engine_id: listed.engine_id, track_id: 'english', grade_id: 'not-listed', level: 3, payload, problems: [] });
  check('an unlisted level with no hold is not held', games.held('english', 'not-listed', 3) === false && !!other);
  console.log(`game-holds-test: ${passed} passed, ${failed} failed`);
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
