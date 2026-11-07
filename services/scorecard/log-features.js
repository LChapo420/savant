/**
 * The learner's own answer log reduced to the read-out's feature vector (docs/SCORECARD-95.md; scripts/lib/sim-gate.js FEATURES). Reads only what the app already stores
 * (items, sessions): no new data, nothing sent anywhere, nothing to register for deletion beyond those rows. Used by services/scorecard/readout.js when the fitted artifact
 * names features (SCORECARD_RECAL=1 and an artifact). Cached per user for 60 s: the vector changes slowly and a card read asks for it once per measure.
 */
'use strict';
const db = require('../../config/db');
const { featuresOf, FEATURES } = require('../../scripts/lib/sim-gate');

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const acc = (xs) => (xs.length ? xs.filter((r) => r.correct).length / xs.length : null);
const diff = (a, b) => (a !== null && b !== null ? a - b : 0);
const lms = (xs) => xs.filter((r) => r.ms > 0).map((r) => Math.log(r.ms));
const EXTRA = ['warmLat', 'reentryGap', 'streakEff', 'switchEff', 'missMs', 'msSd', 'hardEff', 'hourSd', 'sitLen', 'sitLenSd', 'msTrend', 'reviewGap', 'chgMc', 'rapidMiss', 'coachMiss', 'accTrend', 'rightSlow', 'skillBreadth', 'sureWrong', 'typedMs', 'nightRate'];

/**
 * More behaviour already in the log, each a contrast inside the learner's own record (so a learner's general level cancels): first item of a sitting vs the rest (warm-up),
 * the first answers after a gap of 2+ days vs after under a day (re-entry), after three right in a row, after a switch of skill, time after a miss, spread of times, hard vs easy
 * items, when in the day they study, sitting length, slowing within a sitting, review vs new, changes on multiple choice, rapid answers among misses, coach use after a miss,
 * the trend of accuracy over the record, time on rights vs wrongs, breadth of skills, 'sure' among wrongs, typed vs choice time, night share. 0 where there is too little to read.
 * `rows`: answered items with created_at; `sessions`: the learner's sittings with started_at. SIMULATED fit only so far (docs/SCORECARD-95.md).
 */
function extraFeatures(rows, sessions = []) {
  const ans = rows.filter((r) => r.correct !== null && r.correct !== undefined).slice().sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0) || (a.index || 0) - (b.index || 0));
  const bySit = new Map(); for (const r of ans) { const k = r.session_id === undefined ? `L${r.level}` : r.session_id; if (!bySit.has(k)) bySit.set(k, []); bySit.get(k).push(r); }
  const sits = [...bySit.values()];
  const startOf = (rs) => Date.parse(rs[0].created_at) || 0;
  const ordered = sits.slice().sort((a, b) => startOf(a) - startOf(b));
  const firsts = []; const rests = []; const afterGap = []; const afterShort = []; const gapsD = [];
  ordered.forEach((rs, i) => {
    firsts.push(rs[0]); rests.push(...rs.slice(1));
    if (i > 0) { const g = (startOf(rs) - (Date.parse(ordered[i - 1][ordered[i - 1].length - 1].created_at) || 0)) / 86400000; gapsD.push(g); (g >= 2 ? afterGap : g < 1 ? afterShort : []).push(...rs.slice(0, 3)); }
  });
  const streak = []; const nostreak = []; const sw = []; const same = []; const afterMiss = []; const afterRight = [];
  for (const rs of sits) rs.forEach((r, i) => {
    if (i >= 3 && rs[i - 1].correct && rs[i - 2].correct && rs[i - 3].correct) streak.push(r); else if (i >= 1) nostreak.push(r);
    if (i >= 1) { (r.skill_id !== undefined && r.skill_id !== rs[i - 1].skill_id ? sw : same).push(r); (rs[i - 1].correct ? afterRight : afterMiss).push(r); }
  });
  const diffs = ans.map((r) => Number(r.difficulty)).filter(Number.isFinite).sort((a, b) => a - b); const med = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 5;
  const hard = ans.filter((r) => Number(r.difficulty) >= med + 1); const easy = ans.filter((r) => Number(r.difficulty) <= med - 1);
  const hours = ordered.map((rs) => new Date(startOf(rs)).getUTCHours());
  const h1 = []; const h2 = []; for (const rs of sits) rs.forEach((r, i) => (i < rs.length / 2 ? h1 : h2).push(r));
  const mc = ans.filter((r) => r.format !== 'typed'); const ty = ans.filter((r) => r.format === 'typed');
  const wrong = ans.filter((r) => !r.correct); const right = ans.filter((r) => r.correct);
  const rapid = (r) => r.ms > 0 && r.ms < 3000;
  const rate = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : 0);
  const th = Math.max(1, Math.floor(ans.length / 3));
  const cm = (xs) => rate(xs, (r) => r.coach_used);
  const f = {
    warmLat: firsts.length >= 3 && rests.length >= 3 ? mean(lms(firsts)) - mean(lms(rests)) : 0,
    reentryGap: diff(acc(afterGap), acc(afterShort)),
    streakEff: diff(acc(streak), acc(nostreak)),
    switchEff: diff(acc(sw), acc(same)),
    missMs: afterMiss.length >= 3 && afterRight.length >= 3 ? mean(lms(afterMiss)) - mean(lms(afterRight)) : 0,
    msSd: sd(lms(ans)),
    hardEff: diff(acc(hard), acc(easy)),
    hourSd: sd(hours),
    sitLen: sits.length ? Math.log(mean(sits.map((r) => r.length))) : 0,
    sitLenSd: sd(sits.map((r) => r.length)),
    msTrend: h1.length >= 3 && h2.length >= 3 ? mean(lms(h2)) - mean(lms(h1)) : 0,
    reviewGap: diff(acc(ans.filter((r) => r.role === 'review')), acc(ans.filter((r) => r.role !== 'review'))),
    chgMc: rate(mc, (r) => (r.answer_changes || 0) > 0),
    rapidMiss: wrong.length >= 3 && right.length >= 3 ? rate(wrong, rapid) - rate(right, rapid) : 0,
    coachMiss: afterMiss.length >= 3 && afterRight.length >= 3 ? cm(afterMiss) - cm(afterRight) : 0,
    accTrend: ans.length >= 9 ? diff(acc(ans.slice(-th)), acc(ans.slice(0, th))) : 0,
    rightSlow: wrong.length >= 3 && right.length >= 3 ? mean(lms(right)) - mean(lms(wrong)) : 0,
    skillBreadth: ans.length ? new Set(ans.map((r) => r.skill_id)).size / ans.length : 0,
    sureWrong: rate(wrong, (r) => r.confidence === 'sure'),
    typedMs: ty.length >= 3 && mc.length >= 3 ? mean(lms(ty)) - mean(lms(mc)) : 0,
    nightRate: ordered.length ? rate(ordered.map((rs) => rs[0]), (r) => { const h = new Date(Date.parse(r.created_at) || 0).getUTCHours(); return h >= 22 || h < 5; }) : 0,
  };
  for (const k of EXTRA) if (!Number.isFinite(f[k])) f[k] = 0;
  return f;
}

const cache = new Map();
const TTL = 60000;

function forUser(userId, now = Date.now()) {
  const hit = cache.get(userId);
  if (hit && now - hit.at < TTL) return hit.feat;
  const mine = db.forUser('items', userId).filter((r) => r.correct !== null && r.correct !== undefined && r.role !== 'retention' && !r.preview);
  if (mine.length < 20) { cache.set(userId, { at: now, feat: null }); return null; } // too little to read a behaviour from
  const rows = mine.map((r) => ({ ...r, format: r.format && r.format !== 'multiple_choice' ? 'typed' : 'multiple_choice' }));
  const sessions = db.forUser('sessions', userId).filter((s) => !s.preview && s.kind !== 'placement' && s.kind !== 'skip');
  const starts = sessions.map((s) => Date.parse(s.started_at)).filter(Number.isFinite).sort((a, b) => a - b);
  const levels = new Set(mine.map((r) => `${r.track_id || ''}:${r.level}`)).size || sessions.length;
  const quits = sessions.filter((s) => !s.ended_at && now - Date.parse(s.started_at) > 12 * 3600000).length;
  const days = starts.length ? Math.max(1, (now - starts[0]) / 86400000) : 1;
  const feat = { ...extraFeatures(rows, sessions), ...featuresOf(rows, { gaps: starts.slice(1).map((t, i) => (t - starts[i]) / 86400000), quits, levels, days }) };
  cache.set(userId, { at: now, feat });
  return feat;
}
const clear = () => cache.clear();
module.exports = { forUser, clear, extraFeatures, FEATURES, EXTRA, ALL_FEATURES: [...FEATURES, ...EXTRA] };
