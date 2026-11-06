/**
 * The learner's own answer log reduced to the read-out's feature vector (docs/SCORECARD-95.md; scripts/lib/sim-gate.js FEATURES). Reads only what the app already stores
 * (items, sessions): no new data, nothing sent anywhere, nothing to register for deletion beyond those rows. Used by services/scorecard/readout.js when the fitted artifact
 * names features (SCORECARD_RECAL=1 and an artifact). Cached per user for 60 s: the vector changes slowly and a card read asks for it once per measure.
 */
'use strict';
const db = require('../../config/db');
const { featuresOf, FEATURES } = require('../../scripts/lib/sim-gate');

const cache = new Map();
const TTL = 60000;

function forUser(userId, now = Date.now()) {
  const hit = cache.get(userId);
  if (hit && now - hit.at < TTL) return hit.feat;
  const mine = db.find('items', (r) => r.user_id === userId && r.correct !== null && r.correct !== undefined && r.role !== 'retention' && !r.preview);
  if (mine.length < 20) { cache.set(userId, { at: now, feat: null }); return null; } // too little to read a behaviour from
  const rows = mine.map((r) => ({ ...r, format: r.format && r.format !== 'multiple_choice' ? 'typed' : 'multiple_choice' }));
  const sessions = db.find('sessions', (s) => s.user_id === userId && !s.preview && s.kind !== 'placement' && s.kind !== 'skip');
  const starts = sessions.map((s) => Date.parse(s.started_at)).filter(Number.isFinite).sort((a, b) => a - b);
  const levels = new Set(mine.map((r) => `${r.track_id || ''}:${r.level}`)).size || sessions.length;
  const quits = sessions.filter((s) => !s.ended_at && now - Date.parse(s.started_at) > 12 * 3600000).length;
  const days = starts.length ? Math.max(1, (now - starts[0]) / 86400000) : 1;
  const feat = featuresOf(rows, { gaps: starts.slice(1).map((t, i) => (t - starts[i]) / 86400000), quits, levels, days });
  cache.set(userId, { at: now, feat });
  return feat;
}
const clear = () => cache.clear();
module.exports = { forUser, clear, FEATURES };
