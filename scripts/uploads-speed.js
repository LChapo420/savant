/**
 * Time to notes and study pack for a fresh upload, background lane (before) against the waiting lane (after), through the real pool with a
 * SIMULATED learner and synthetic text. Prints seconds and the model that answered.
 *   node scripts/uploads-speed.js <background|waiting> [notes|pack]
 */
const os = require('os'); const path = require('path');
require('../services/run-cap').defaultCap(Number(process.env.RUN_CAP_USD || 1));
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
process.env.NODE_ENV = 'development';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-speed-${process.pid}.json`);
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
for (const [k, f] of [['GONKA', 'gonka'], ['MUNITO', 'munito'], ['CORAL', 'coral'], ['GROKIFIED', 'grokified'], ['LYCEUM', 'lyceum']]) process.env[`${k}_LEDGER_FILE`] = process.env[`${k}_LEDGER_FILE`] || `${LIVE}${f}-ledger.json`;
process.env.ANTHROPIC_LEDGER_FILE = `${LIVE}anthropic-ledger.json`;
const lane = process.argv[2] || 'waiting'; const what = process.argv[3] || 'notes';
const db = require('../config/db');
const pool = require('../services/pool');
const materials = require('../services/materials');
const text = 'Tides are caused mainly by the gravitational pull of the moon on the oceans, and the sun adds a smaller pull. Spring tides, with the largest range, happen at new and full moon when the sun, moon and earth line up. Neap tides, with the smallest range, happen at the quarter moons. A tidal cycle repeats about every 12 hours and 25 minutes. The Bay of Fundy has the highest tides in the world, up to 16 metres. Coastal shape and the depth of the sea floor change the local tidal range. Tidal energy can be captured by barrages and turbines, and it is predictable unlike wind. '.repeat(3);
(async () => {
  const u = db.insert('users', { email: 'speed@example.test', display_name: 'Speed', password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: '2000-01' } });
  const m = materials.addPaste(u.id, 'Tides', text).value;
  const run = lane === 'background' ? pool.runBackground : (fn) => pool.runForeground(fn, { fast: true });
  const t0 = Date.now();
  let out;
  try {
    out = await run(() => (what === 'pack' ? require('../services/material-pack').buildWithRetry(u.id, m.id, {}) : require('../services/material-notes').build(u.id, m.id, {})));
  } catch (e) { out = { error: e.message }; }
  console.log(JSON.stringify({ lane, what, seconds: Math.round((Date.now() - t0) / 1000), status: out && (out.status || out.error || 'done') }));
  process.exit(0);
})();
