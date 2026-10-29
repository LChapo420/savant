/**
 * The tutor dock's two modes, voice and text, remembered per learner (owner's spec, 2026-10-28).
 *
 * The default is whichever mode the learner used for their last message: the dock sends `input_mode`
 * with each message and the server stores it; GET /api/tutor/dock returns it so the dock opens in
 * that mode (js/tutor-dock.js also keeps it in localStorage for an instant first paint).
 * Only the mode word is stored, never speech.
 */
const db = require('../config/db');

const MODES = ['voice', 'text'];
const DEFAULT = 'text';

const valid = (m) => (MODES.includes(m) ? m : null);

function get(userId) {
  const row = db.findOne('tutor_modes', (r) => r.user_id === userId);
  return row && valid(row.mode) ? row.mode : DEFAULT;
}

/** Remember the mode of the learner's latest message. Unknown values are ignored. */
function set(userId, mode) {
  const m = valid(mode);
  if (!m) return get(userId);
  db.upsert('tutor_modes', (r) => r.user_id === userId, (row) => ({ user_id: userId, mode: m, switches: (row && row.mode !== m ? (row.switches || 0) + 1 : (row && row.switches) || 0) }));
  return m;
}

module.exports = { MODES, DEFAULT, get, set, valid };
