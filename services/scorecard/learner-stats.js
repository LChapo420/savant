/**
 * Learner stats the app can log without asking (docs/SCORE-MONTH.md part 4). Pure functions over normalised rows; `fromDb` adapts the live collections. What ALREADY existed and is reused, not rebuilt:
 *   forgetting curve per learner (forgetting.js), prior knowledge and mastery per skill (irt.js, mastery.js), confidence_calibration / working_memory_span / processing_velocity as scorecard
 *   measures (stats.js), tutor calendar events (tutor-events.js), session_rhythm / attention_runway / fatigue_curve as behaviour traits (stats.js). What is NEW here: reading speed as a direct
 *   number (direct-tasks.js readingSpeed), time-of-day performance, session length / attention drop-off in minutes, slip vs misconception error types, device / input, availability from the
 *   calendar and the study log, and the retention horizon. Each returns { ..., n } and `null` or `confident: false` when there is too little to say anything.
 *
 * Row shape: answers [{ t (ms since epoch), ok (bool), ms (answer time), skill, wrong (the wrong option picked, when wrong), device, kind: 'choice'|'typed' }].
 * Times are read in the learner's own clock: pass tzOffsetMin (minutes east of UTC) so "evening" means their evening.
 */
'use strict';

const PARTS = ['morning', 'afternoon', 'evening', 'night'];
const partOf = (hour) => (hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 22 ? 'evening' : 'night');
const hourOf = (t, tz = 0) => new Date(t + tz * 60000).getUTCHours();
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/**
 * Accuracy by part of day, shrunk to the learner's overall accuracy with k = 20 pseudo-answers per part, so a part with 5 answers cannot claim to be best. `best` is reported only when the top
 * part beats the runner-up by 4+ points after shrinking and holds 30+ answers (confident).
 */
function timeOfDay(answers, { tz = 0, k = 20 } = {}) {
  const a = (answers || []).filter((x) => x && Number.isFinite(x.t)); if (a.length < 30) return null;
  const all = a.reduce((s, x) => s + (x.ok ? 1 : 0), 0) / a.length;
  const parts = {}; for (const p of PARTS) parts[p] = { n: 0, right: 0 };
  for (const x of a) { const p = parts[partOf(hourOf(x.t, tz))]; p.n += 1; if (x.ok) p.right += 1; }
  for (const p of PARTS) { const q = parts[p]; q.acc = q.n ? q.right / q.n : null; q.adj = (q.right + k * all) / (q.n + k); }
  const rank = PARTS.filter((p) => parts[p].n > 0).sort((x, y) => parts[y].adj - parts[x].adj);
  const best = rank[0]; const gap = rank.length > 1 ? 100 * (parts[best].adj - parts[rank[1]].adj) : 0;
  return { n: a.length, overall: all, parts, best, gap, confident: parts[best].n >= 30 && gap >= 4 };
}

/** Split answers into sittings: a gap of 30+ minutes starts a new one. Returns arrays of rows with `min` = minutes since the sitting began. */
function sittings(answers, gapMin = 30) {
  const a = [...(answers || [])].filter((x) => x && Number.isFinite(x.t)).sort((x, y) => x.t - y.t); const out = []; let cur = null;
  for (const x of a) { if (!cur || x.t - cur[cur.length - 1].t > gapMin * 60000) { cur = []; out.push(cur); } cur.push({ ...x, min: (x.t - (cur[0] ? cur[0].t : x.t)) / 60000 }); }
  return out;
}

/**
 * Attention drop-off: pooled accuracy by 5-minute bucket of time-in-sitting against the first 10 minutes of the same learner. The tolerable length is the end of the last bucket before accuracy
 * falls 8+ points below the opening level on two buckets in a row (smoothed over neighbours). Returns minutes (5-90), or null if too little data (60 answers, 4 sittings).
 */
function sessionDropoff(answers) {
  const s = sittings(answers); const flat = s.flat(); if (flat.length < 60 || s.length < 4) return null;
  const B = 5; const nb = 19; const b = Array.from({ length: nb }, () => ({ n: 0, r: 0 }));
  for (const x of flat) { const i = Math.min(nb - 1, Math.floor(x.min / B)); b[i].n += 1; if (x.ok) b[i].r += 1; }
  const open = b.slice(0, 2).reduce((a, c) => ({ n: a.n + c.n, r: a.r + c.r }), { n: 0, r: 0 }); if (open.n < 20) return null;
  const base = open.r / open.n;
  const sm = b.map((_, i) => { let n = 0; let r = 0; for (let j = Math.max(0, i - 1); j <= Math.min(nb - 1, i + 1); j++) { n += b[j].n; r += b[j].r; } return n >= 12 ? r / n : null; });
  let minutes = null;
  for (let i = 2; i < nb - 1; i++) { if (sm[i] != null && sm[i + 1] != null && base - sm[i] >= 0.08 && base - sm[i + 1] >= 0.08) { minutes = i * B; break; } }
  const longest = Math.max(...s.map((x) => x[x.length - 1].min));
  return { n: flat.length, sittings: s.length, openAcc: base, minutes: minutes == null ? null : Math.max(5, minutes), noDropSeenUpTo: minutes == null ? Math.round(longest) : null, longest };
}

/**
 * Slip vs misconception on wrong answers. A wrong answer is a MISCONCEPTION when one wrong option makes up 60%+ of the wrong answers on that skill and was picked 3+ times, this answer included (a stable error, found after the fact; two repeats of a random wrong option are not enough, three options make that common); a SLIP when it came
 * faster than 60% of the learner's median answer time AND the skill was right on the previous or next attempt; otherwise UNCLEAR (not forced into either). Returns shares of wrong answers.
 */
function errorTypes(answers) {
  const a = [...(answers || [])].filter((x) => x && Number.isFinite(x.t)).sort((x, y) => x.t - y.t); if (a.length < 30) return null;
  const med = median(a.map((x) => x.ms).filter(Number.isFinite)); const count = {}; const wrongBySkill = {}; const bySkill = {};
  for (const x of a) if (!x.ok && x.wrong != null) { const key = `${x.skill}|${x.wrong}`; count[key] = (count[key] || 0) + 1; wrongBySkill[x.skill] = (wrongBySkill[x.skill] || 0) + 1; }
  a.forEach((x, i) => { (bySkill[x.skill] = bySkill[x.skill] || []).push(i); });
  const pos = {}; Object.values(bySkill).forEach((l) => l.forEach((i, j) => { pos[i] = [l, j]; }));
  const out = { misconception: 0, slip: 0, unclear: 0, perType: [] };
  a.forEach((x, i) => {
    if (x.ok) return;
    const c = x.wrong != null ? count[`${x.skill}|${x.wrong}`] : 0; const repeat = c >= 3 && c / wrongBySkill[x.skill] >= 0.6;
    const [l, j] = pos[i]; const nbr = [l[j - 1], l[j + 1]].filter((q) => q != null).map((q) => a[q]);
    const fast = med && Number.isFinite(x.ms) && x.ms < 0.6 * med; const around = nbr.some((q) => q.ok);
    const type = repeat ? 'misconception' : (fast && around ? 'slip' : 'unclear'); out[type] += 1; out.perType.push({ i, skill: x.skill, type });
  });
  const wrong = out.misconception + out.slip + out.unclear; if (wrong < 8) return { wrong, confident: false };
  return { wrong, misconceptionShare: out.misconception / wrong, slipShare: out.slip / wrong, unclearShare: out.unclear / wrong, confident: true, perType: out.perType };
}

/** Device and input: shares by device, median answer time per device, typed share, and the main one. Used to size tap targets and decide typed vs choice items. */
function deviceStats(answers) {
  const a = (answers || []).filter((x) => x && x.device); if (a.length < 20) return null;
  const by = {}; for (const x of a) { const d = (by[x.device] = by[x.device] || { n: 0, right: 0, ms: [] }); d.n += 1; if (x.ok) d.right += 1; if (Number.isFinite(x.ms)) d.ms.push(x.ms); }
  const out = {}; for (const [k, d] of Object.entries(by)) out[k] = { share: d.n / a.length, acc: d.right / d.n, medianMs: median(d.ms), n: d.n };
  const main = Object.keys(out).sort((x, y) => out[y].share - out[x].share)[0];
  return { n: a.length, devices: out, main, typedShare: a.filter((x) => x.kind === 'typed').length / a.length, mobileMain: main === 'phone' || main === 'tablet' };
}

/**
 * Availability and schedule. events: tutor-events list rows [{ title, date: 'YYYY-MM-DD', kind }] (services/tutor-events.js list()); today: 'YYYY-MM-DD'; studyDays: dates the learner studied (from the log).
 * nextEvent = the soonest test/quiz/exam/due; mode: 'cram' (3 days or fewer), 'build' (4-14), 'steady' (more, or none). daysPerWeek and the usual part of day come from the log of the last 28 days.
 */
function schedule({ events = [], today, studyDays = [], answers = [], tz = 0 } = {}) {
  const day = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const up = events.filter((e) => e && e.date && ['test', 'quiz', 'exam', 'due'].includes(e.kind) && today && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const nextEvent = up[0] || null; const daysUntil = nextEvent ? Math.round((day(nextEvent.date) - day(today)) / 86400000) : null;
  const mode = daysUntil == null ? 'steady' : daysUntil <= 3 ? 'cram' : daysUntil <= 14 ? 'build' : 'steady';
  const recent = new Set((studyDays || []).filter((d) => today && day(today) - day(d) <= 28 * 86400000 && d <= today));
  const usual = timeOfDayUsual(answers, tz);
  return { nextEvent, daysUntil, mode, daysPerWeek: recent.size ? Math.round((recent.size / 4) * 10) / 10 : null, usualPart: usual, upcoming: up.length };
}
function timeOfDayUsual(answers, tz) {
  const c = {}; for (const x of answers || []) if (Number.isFinite(x.t)) { const p = partOf(hourOf(x.t, tz)); c[p] = (c[p] || 0) + 1; }
  const k = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; return k || null;
}

/** Retention horizon in days: the learner's stated need (confirm-card personal.retention_days), else days to the next exam, else null (the default policy applies). */
function horizon({ personal = {}, sched = null } = {}) {
  const stated = personal.retention_days && personal.retention_days.value;
  if (Number.isFinite(stated)) return { days: stated, source: 'stated' };
  if (sched && sched.daysUntil != null) return { days: Math.max(1, sched.daysUntil + 1), source: 'calendar' };
  return { days: null, source: 'default' };
}

/** Adapter for the live DB: items answered by a user. Field names follow the items collection as used in scorecard/irt.js; missing fields stay undefined. Never called by tests. */
function fromDb(userId, db) {
  const rows = db.find('items', (r) => r && r.user_id === userId && r.answered_at);
  return rows.map((r) => ({ t: Date.parse(r.answered_at), ok: !!r.correct, ms: Number(r.time_ms || r.ms) || undefined, skill: r.skill_id || r.objective_id || r.topic, wrong: r.chosen_option != null && !r.correct ? String(r.chosen_option) : undefined, device: r.device, kind: r.typed ? 'typed' : 'choice' }));
}

module.exports = { PARTS, partOf, sittings, timeOfDay, sessionDropoff, errorTypes, deviceStats, schedule, horizon, fromDb };
