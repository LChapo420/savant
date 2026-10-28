/**
 * Base levels shipped with the code.
 *
 * Base levels are written once (scripts/generate-base-levels.js) into the data
 * file, and the data file is not in the repository: it holds accounts. So the
 * written levels are exported to content/base-levels/*.json, committed, and
 * loaded into the data file when the server starts — any level the data file
 * does not already have a good version of is added; nothing already there is
 * overwritten.
 *
 *   npm run base:export -- --track english --grade proficient   (writes the file)
 *   (the server imports on start; npm run base:import does it by hand)
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const DIR = path.join(__dirname, '..', 'content', 'base-levels');

/** Strip what belongs to one learner or one database: answers, telemetry, ids. */
function portable(row) {
  const out = { ...row };
  for (const key of ['id', 'answers', 'telemetry', 'claimed_at', 'started_at']) delete out[key];
  return out;
}

function exportGrade(trackId, gradeId) {
  const plans = db.find('block_plans', (p) => p.user_id === null && p.status === 'ready'
    && p.track_id === trackId && p.grade_id === gradeId).map(portable);
  const games = db.find('game_payloads', (g) => !g.user_id && g.track_id === trackId && g.grade_id === gradeId
    && g.payload && !(g.problems || []).length && !g.serving_hold).map(portable); // a held set is not shipped (game-payloads.js holds)
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${trackId}-${gradeId}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ track_id: trackId, grade_id: gradeId, exported_at: new Date().toISOString(), plans, games })}\n`);
  return { file, plans: plans.length, games: games.length };
}

/** Add every shipped base level the data file does not already have. */
function importAll() {
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch { return { plans: 0, games: 0 }; }
  let plans = 0;
  let games = 0;
  for (const f of files) {
    let data = null;
    try { data = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { continue; }
    for (const p of data.plans || []) {
      const have = db.findOne('block_plans', (x) => x.user_id === null && x.status === 'ready' && x.kind === p.kind
        && x.track_id === p.track_id && x.grade_id === p.grade_id && x.level === p.level && (x.attempt || 1) === (p.attempt || 1));
      if (have) continue;
      db.insert('block_plans', { ...p, user_id: null, answers: {}, imported_from: f });
      plans++;
    }
    for (const g of data.games || []) {
      const have = db.findOne('game_payloads', (x) => !x.user_id && x.track_id === g.track_id && x.grade_id === g.grade_id
        && x.level === g.level && x.payload && !(x.problems || []).length);
      if (have) continue;
      const stale = db.findOne('game_payloads', (x) => !x.user_id && x.track_id === g.track_id && x.grade_id === g.grade_id && x.level === g.level);
      if (stale) db.update('game_payloads', stale.id, { ...g, user_id: null, imported_from: f });
      else db.insert('game_payloads', { ...g, user_id: null, imported_from: f });
      games++;
    }
  }
  return { plans, games };
}

module.exports = { exportGrade, importAll, DIR };
