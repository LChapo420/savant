/**
 * What a learner did inside a level, kept for their record.
 *
 * The page reports, per part of the level, time on screen, how many times they
 * acted on it, a short log of what they did, and how often the part itself
 * marked them right or wrong (public/js/level-capture.js). Kept as the latest
 * report per learner, level and source, so a page that reports when the learner
 * steps away and again when they finish stores one picture, not two.
 *
 * The after-level read quotes it (services/learner-record.js levelEvidence).
 */
const db = require('../config/db');

const SOURCES = new Set(['blocks', 'page', 'game']);

/** The report, cleaned: numbers bounded, text short, nothing the page should not set. */
function clean(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 40).map((t) => ({
    index: Math.max(0, Math.min(100, Number(t && t.index) || 0)),
    block: String((t && t.block) || '').replace(/[^\w .()-]/g, '').slice(0, 64),
    ms: Math.max(0, Math.min(3600000, Number(t && t.ms) || 0)),
    interactions: Math.max(0, Math.min(1000, Number(t && t.interactions) || 0)),
    log: (Array.isArray(t && t.log) ? t.log : []).slice(0, 25).map((x) => String(x).replace(/\s+/g, ' ').slice(0, 90)),
    right: Math.max(0, Math.min(200, Number(t && t.right) || 0)),
    wrong: Math.max(0, Math.min(200, Number(t && t.wrong) || 0)),
  }));
}

/** Keep the latest report for this learner, level and source. */
function save({ userId, trackId, gradeId, level, source, rows, finished = false, planId = null }) {
  const kind = SOURCES.has(source) ? source : 'page';
  const blocks = clean(rows);
  const existing = db.findOne('level_logs', (r) => r.user_id === userId && r.track_id === trackId
    && r.grade_id === gradeId && r.level === level && r.source === kind);
  const patch = {
    blocks,
    plan_id: planId,
    finished: !!finished || !!(existing && existing.finished),
    at: new Date().toISOString(),
  };
  if (existing) return db.update('level_logs', existing.id, patch);
  return db.insert('level_logs', {
    user_id: userId, track_id: trackId, grade_id: gradeId, level, source: kind, ...patch,
  });
}

/** Whether a report says the learner did anything at all. */
function anything(rows) {
  return clean(rows).some((r) => r.interactions > 0 || r.log.length || r.ms > 5000);
}

module.exports = { save, clean, anything };
