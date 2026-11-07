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
  const row = (db.forUser('tutor_modes', userId)[0] || null);
  return row && valid(row.mode) ? row.mode : DEFAULT;
}

/** Remember the mode of the learner's latest message. Unknown values are ignored. */
function set(userId, mode) {
  const m = valid(mode);
  if (!m) return get(userId);
  db.upsert('tutor_modes', (r) => r.user_id === userId, (row) => ({ user_id: userId, mode: m, switches: (row && row.mode !== m ? (row.switches || 0) + 1 : (row && row.switches) || 0) }));
  return m;
}

// Where the chat sits on a phone, top or bottom (owner, 7 Nov 2026: "users choice"): on the same row, so it follows the learner across devices and leaves with their data.
const SIDES = ['top', 'bottom'];
const validSide = (s) => (SIDES.includes(s) ? s : null);
function getSide(userId) {
  const row = (db.forUser('tutor_modes', userId)[0] || null);
  return row && validSide(row.side) ? row.side : 'bottom';
}
function setSide(userId, side) {
  const s = validSide(side);
  if (!s) return getSide(userId);
  db.upsert('tutor_modes', (r) => r.user_id === userId, (row) => ({ user_id: userId, mode: (row && row.mode) || DEFAULT, switches: (row && row.switches) || 0, side: s }));
  return s;
}

module.exports = { MODES, DEFAULT, get, set, valid, SIDES, getSide, setSide, validSide };
