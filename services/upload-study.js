/**
 * The own-control study behind the 4x claim (docs/UPLOAD-4X.md lever 4). UPLOAD_STUDY=1 (default off).
 *
 * A tester who opts in splits what they still have to learn, after the starting check, into two MATCHED halves (pairs neighbouring in prior knowledge then size, a seeded coin per pair).
 * One half is studied Savant's way. The other is studied their normal way: Savant shows the original passages and a "done" button, nothing else. Both halves get the same short
 * test at the learner's own horizon, from questions held back from the study, the same count per part. Time and score are logged for each half, so each tester gives one paired
 * result: the time ratio and the score difference, normal against Savant. analyse() pools them with an interval. No real timing exists before testers; every number is then MEASURED.
 *
 * Honest limits, said in the doc: the normal half's own revision outside the app is not timed (so its time is under-counted, which is against Savant's ratio); the test is small
 * (at most MAX_PER_HALF parts a half, TEST_Q questions each); a learner can study the normal half more carefully than usual because they know it is watched.
 * Eligibility: the account may take extra measurement (services/boosters.allowed: age screen answered and, under the age of consent, a parent's agreement). Consent is explicit and
 * per material; stopping at any time deletes nothing and simply ends the split.
 * Time = the gaps between a learner's actions on a part, each capped at IDLE_CAP_MS, a part at PART_CAP_MS: the same rule for both halves.
 */
'use strict';
const crypto = require('crypto');

const COLLECTION = 'upload_studies';
const VERSION = '2026-11-08';
const MAX_PER_HALF = 6;
const TEST_Q = 2;
const MIN_PARTS = 4; // two matched pairs
const IDLE_CAP_MS = 10 * 60 * 1000;
const PART_CAP_MS = 45 * 60 * 1000;
const DAY = 86400000;
const enabled = () => process.env.UPLOAD_STUDY === '1';
const db = () => require('../config/db'); // eslint-disable-line global-require

const CONSENT_TEXT = 'Help us find out how much faster Savant really is. We split the parts you still have to learn into two similar halves. You study one half with Savant and the other half your usual way: we show the original text and you tell us when you are done. Later, at the time you said you want to remember it, you answer a short test (at most 24 questions) on both halves. We record how long each half took and your score on it, and nothing else. It does not change your grade or your scorecard. You can stop at any time.';

const h = (...p) => parseInt(crypto.createHash('sha1').update(p.join('|')).digest('hex').slice(0, 8), 16) / 0xffffffff;

/** Matched halves of parts [{ id, p (prior knowledge 0-1), words }]: sorted by p then words, neighbours paired, a seeded coin per pair. { savant, normal, left, gap } (gap: share of total words the halves differ by). */
function splitHalves(parts, seed) {
  const sorted = parts.slice().sort((a, b) => (a.p - b.p) || (a.words - b.words) || String(a.id).localeCompare(String(b.id)));
  const savant = []; const normal = []; let ws = 0; let wn = 0;
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    let coin = h(seed, sorted[i].id, sorted[i + 1].id) < 0.5;
    // Balanced coin: the seeded coin decides unless it would push the halves' words more than 3% apart, then the pair goes the other way (minimisation).
    const toSavantIfCoin = coin ? sorted[i].words : sorted[i + 1].words; const toNormalIfCoin = coin ? sorted[i + 1].words : sorted[i].words;
    const after = Math.abs((ws + toSavantIfCoin) - (wn + toNormalIfCoin)); const now0 = Math.abs(ws - wn);
    if (after > now0 && after > 0.03 * (ws + wn + toSavantIfCoin + toNormalIfCoin)) coin = !coin;
    const [a, b] = coin ? [sorted[i], sorted[i + 1]] : [sorted[i + 1], sorted[i]];
    savant.push(a.id); normal.push(b.id); ws += a.words; wn += b.words;
  }
  const left = sorted.length % 2 ? [sorted[sorted.length - 1].id] : [];
  return { savant, normal, left, gap: ws + wn ? Math.abs(ws - wn) / (ws + wn) : 0 };
}

const passageText = (course, skill) => {
  const by = new Map((course.passages || []).map((p) => [p.id, p.text || '']));
  return (skill.passage_ids || []).map((id) => by.get(id) || '').join('\n\n');
};
const wordsOf = (course, skill) => {
  const t = passageText(course, skill).trim() || String(skill.lesson || '');
  return t.split(/\s+/).filter(Boolean).length;
};

const rowOf = (userId, materialId) => db().forUser(COLLECTION, userId).find((r) => r.material_id === Number(materialId)) || null;
const active = (r) => !!r && r.status === 'active';
const armOf = (r, skillId) => (!active(r) ? null : r.halves.savant.includes(skillId) ? 'savant' : r.halves.normal.includes(skillId) ? 'normal' : null);

/** Whether this learner may be asked, and the wording. */
function offer(user, deps = {}) {
  if (!enabled()) return { available: false };
  const allowed = (deps.allowed || ((u) => require('./boosters').allowed(u)))(user); // eslint-disable-line global-require
  return allowed ? { available: true, version: VERSION, text: CONSENT_TEXT, max_questions: 2 * MAX_PER_HALF * TEST_Q } : { available: false };
}

/**
 * Start the study. deps: { course, progress (the learner's material_progress row), user, allowed?, now? }.
 * agree must be exactly true. horizonDays: the learner's own retention goal in days (1 to 730).
 */
function start(userId, materialId, { agree, horizonDays }, deps) {
  if (!enabled()) return { error: 'The study is not running.', code: 'off' };
  if (agree !== true) return { error: 'The study needs a clear yes.', code: 'no_consent' };
  if (!offer(deps.user, deps).available) return { error: 'This account cannot take part.', code: 'not_eligible' };
  if (rowOf(userId, materialId)) return { error: 'You are already in the study for this material.', code: 'already' };
  const { course, progress: r } = deps;
  if (!r || !r.placed) return { error: 'Do the starting check first.', code: 'not_placed' };
  const open = course.skills.filter((s) => (r.skills[s.id] || {}).status !== 'mastered' && s.source !== 'general');
  if (open.length < MIN_PARTS) return { error: 'Too few parts left to split.', code: 'too_small' };
  const parts = open.map((s) => ({ id: s.id, p: (r.skills[s.id] || {}).placement_p || 0, words: wordsOf(course, s) }));
  const seed = `${userId}:${materialId}`;
  const halves = splitHalves(parts, seed);
  // The test: the same number of parts from each half, TEST_Q held-back questions each; a part with too few questions is dropped from the test, its pair partner is trimmed to match.
  const rank = (ids) => ids.map((id) => ({ id, o: h(seed, 'test', id) })).sort((a, b) => a.o - b.o).map((x) => x.id);
  const reserved = {};
  const reserve = (id) => {
    const s = course.skills.find((k) => k.id === id);
    const qs = (s.questions || []).slice().sort((a, b) => h(seed, id, a.id) - h(seed, id, b.id));
    if (qs.length < TEST_Q + 2) return false; // leave at least two questions for the study itself
    reserved[id] = qs.slice(0, TEST_Q).map((q) => q.id);
    return true;
  };
  const testS = rank(halves.savant).filter(reserve).slice(0, MAX_PER_HALF);
  const testN = rank(halves.normal).filter(reserve).slice(0, MAX_PER_HALF);
  const n = Math.min(testS.length, testN.length);
  if (n < 1) return { error: 'Too few questions to test fairly.', code: 'too_small' };
  testS.length = n; testN.length = n;
  for (const id of Object.keys(reserved)) if (!testS.includes(id) && !testN.includes(id)) delete reserved[id];
  const now = deps.now || Date.now();
  const row = db().insert(COLLECTION, {
    user_id: userId, material_id: Number(materialId), status: 'active',
    consent: { at: new Date(now).toISOString(), version: VERSION, horizon_days: Math.max(1, Math.min(730, Math.round(Number(horizonDays) || 30))) },
    halves: { savant: halves.savant, normal: halves.normal, left: halves.left, gap: halves.gap }, test_parts: { savant: testS, normal: testN }, reserved,
    words: Object.fromEntries(parts.map((x) => [x.id, x.words])), events: [], done: {}, studied_at: null, test: null, result: null,
  });
  return { ok: true, id: row.id, savant: halves.savant.length, normal: halves.normal.length, gap: halves.gap, test_parts: n };
}

function stop(userId, materialId) {
  const r = rowOf(userId, materialId);
  if (!r || r.status !== 'active') return { ok: true };
  db().update(COLLECTION, r.id, { status: 'stopped', stopped_at: new Date().toISOString() });
  return { ok: true };
}

/** The course the learner studies: held-back test questions move out of `questions` into `all_questions`, so Savant never practises on them. */
function holdOut(userId, materialId, course) {
  const r = enabled() ? rowOf(userId, materialId) : null;
  if (!active(r) || r.test) return course;
  return {
    ...course,
    skills: course.skills.map((s) => {
      const ids = r.reserved[s.id];
      if (!ids) return s;
      const all = s.all_questions || s.questions;
      return { ...s, all_questions: all, questions: all.filter((q) => !ids.includes(q.id)) };
    }),
  };
}

/** Log an action on a part. kind: open | answer | done. */
function touch(userId, materialId, skillId, kind, now = Date.now()) {
  const r = enabled() ? rowOf(userId, materialId) : null;
  const arm = armOf(r, skillId);
  if (!arm || r.test) return;
  db().update(COLLECTION, r.id, { events: r.events.concat([{ t: now, skill: skillId, arm, kind }]) });
}

/** Active ms per arm: gaps between consecutive events on one part, each capped, a part capped. */
function timeOf(r) {
  const out = { savant: 0, normal: 0 }; const per = {}; const by = {};
  for (const e of r.events) (by[e.skill] || (by[e.skill] = [])).push(e);
  for (const [skill, list] of Object.entries(by)) {
    list.sort((a, b) => a.t - b.t);
    let ms = 0;
    for (let i = 1; i < list.length; i++) ms += Math.min(IDLE_CAP_MS, Math.max(0, list[i].t - list[i - 1].t));
    ms = Math.min(PART_CAP_MS, ms);
    per[skill] = ms; out[list[0].arm] += ms;
  }
  return { ...out, per };
}

/** The original passages of a normal-half part, and the open event. */
function normalPart(userId, materialId, skillId, course, now = Date.now()) {
  const r = rowOf(userId, materialId);
  if (armOf(r, skillId) !== 'normal') return { error: 'This part is studied with Savant.', code: 'not_normal' };
  const skill = course.skills.find((s) => s.id === skillId);
  touch(userId, materialId, skillId, 'open', now);
  return { skill: { id: skill.id, title: skill.title }, text: (passageText(course, skill) || skill.lesson || '').slice(0, 7000) };
}
function normalDone(userId, materialId, skillId, now = Date.now()) {
  const r = rowOf(userId, materialId);
  if (armOf(r, skillId) !== 'normal') return { error: 'This part is studied with Savant.', code: 'not_normal' };
  touch(userId, materialId, skillId, 'done', now);
  const fresh = rowOf(userId, materialId);
  db().update(COLLECTION, fresh.id, { done: { ...fresh.done, [skillId]: now } });
  return { ok: true };
}

/** Once every part of both halves is in (Savant's mastered, the normal ones marked done) the test clock starts. */
function noteStudied(userId, materialId, masteredIds, now = Date.now()) {
  const r = rowOf(userId, materialId);
  if (!active(r) || r.studied_at) return;
  const mastered = new Set(masteredIds);
  if (r.halves.savant.every((id) => mastered.has(id)) && r.halves.normal.every((id) => r.done[id])) {
    db().update(COLLECTION, r.id, { studied_at: now, test_at: now + r.consent.horizon_days * DAY });
  }
}

/** Where the learner is: studying (with the normal parts left), waiting, the test due, or done. */
function status(userId, materialId, now = Date.now()) {
  const r = rowOf(userId, materialId);
  if (!r) return { in_study: false };
  if (r.status !== 'active') return { in_study: false, status: r.status };
  if (r.test) return { in_study: true, phase: 'done' };
  if (!r.studied_at) return { in_study: true, phase: 'studying', normal_left: r.halves.normal.filter((id) => !r.done[id]) };
  return { in_study: true, phase: now >= r.test_at ? 'test_due' : 'waiting', test_at: new Date(r.test_at).toISOString() };
}

const qById = (course, skillId, qid) => { const s = course.skills.find((k) => k.id === skillId); return s && (s.all_questions || s.questions).find((x) => x.id === qid); };

/** The test questions (no keys), both halves mixed in one fixed order so position favours neither. */
function testNext(userId, materialId, course, now = Date.now()) {
  const r = rowOf(userId, materialId);
  if (status(userId, materialId, now).phase !== 'test_due') return { error: 'The test is not due yet.', code: 'not_due' };
  const items = [];
  for (const arm of ['savant', 'normal']) for (const id of r.test_parts[arm]) for (const qid of r.reserved[id]) items.push({ skill: id, qid });
  items.sort((a, b) => h(r.id, a.qid) - h(r.id, b.qid));
  return {
    questions: items.map((it) => {
      const q = qById(course, it.skill, it.qid);
      return { id: q.id, skill: it.skill, prompt: q.prompt, type: q.type, choices: q.type === 'multiple_choice' ? q.choices : undefined };
    }),
  };
}

/** answers: { qid: given }. isCorrect(q, given) is the study module's own marker. Stores per-arm score and time. */
function testSubmit(userId, materialId, course, answers, isCorrect, now = Date.now()) {
  const r = rowOf(userId, materialId);
  if (status(userId, materialId, now).phase !== 'test_due') return { error: 'The test is not due yet.', code: 'not_due' };
  const score = { savant: { right: 0, n: 0 }, normal: { right: 0, n: 0 } };
  for (const arm of ['savant', 'normal']) {
    for (const id of r.test_parts[arm]) {
      for (const qid of r.reserved[id]) {
        const q = qById(course, id, qid);
        score[arm].n++; if (q && isCorrect(q, (answers || {})[qid])) score[arm].right++;
      }
    }
  }
  const t = timeOf(r);
  const words = (arm) => r.halves[arm].reduce((a, id) => a + (r.words[id] || 0), 0);
  const result = {
    horizon_days: r.consent.horizon_days, score_savant: score.savant.right / score.savant.n, score_normal: score.normal.right / score.normal.n,
    ms_savant: t.savant, ms_normal: t.normal, words_savant: words('savant'), words_normal: words('normal'), n_test: score.savant.n, gap: r.halves.gap,
  };
  db().update(COLLECTION, r.id, { test: { at: now, score }, result });
  return { ok: true, result };
}

/**
 * Pool the learners' paired results. Per learner: time ratio = normal minutes per 1,000 words over Savant minutes per 1,000 words; score difference in points = Savant - normal.
 * "Equal or more" = the pooled score difference's lower 95% bootstrap bound is at or above -margin. "4x" per learner = ratio >= 4 and score difference >= -margin.
 * Under minN learners nothing is claimed.
 */
function analyse(rows, { margin = 5, minN = 30, seed = 1, boots = 2000 } = {}) {
  const ok = rows.filter((x) => x && x.ms_savant > 0 && x.ms_normal > 0 && x.words_savant > 0 && x.words_normal > 0);
  const ratio = ok.map((x) => (x.ms_normal / x.words_normal) / (x.ms_savant / x.words_savant));
  const diff = ok.map((x) => 100 * (x.score_savant - x.score_normal));
  const n = ok.length;
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
  let lo = null; let hi = null; let rlo = null; let rhi = null;
  if (n >= 2) {
    const md = []; const mr = [];
    for (let b = 0; b < boots; b++) {
      let sd = 0; let sr = 0;
      for (let k = 0; k < n; k++) { const j = Math.floor(h(seed, b, k) * n); sd += diff[j]; sr += Math.log(ratio[j]); }
      md.push(sd / n); mr.push(Math.exp(sr / n));
    }
    lo = q(md, 0.025); hi = q(md, 0.975); rlo = q(mr, 0.025); rhi = q(mr, 0.975);
  }
  const at4 = ok.filter((_, i) => ratio[i] >= 4 && diff[i] >= -margin).length;
  let claim;
  if (n < minN) claim = `too few learners (${n} of ${minN}): no claim`;
  else if (lo < -margin) claim = 'recall is not shown to be equal';
  else claim = rlo >= 4 ? 'at least 4x with equal or better recall' : `equal or better recall; time ratio ${rlo.toFixed(2)} to ${rhi.toFixed(2)}`;
  return {
    n, excluded: rows.length - n, ratio_geo: n ? Math.exp(mean(ratio.map(Math.log))) : null, ratio_ci: [rlo, rhi], diff_mean: mean(diff), diff_ci: [lo, hi],
    at_4x_equal_or_better: at4, worst_ratio: n ? Math.min(...ratio) : null, worst_diff: n ? Math.min(...diff) : null, margin, claim,
  };
}

const allResults = () => db().find(COLLECTION, (r) => r.result).map((r) => r.result);

module.exports = {
  COLLECTION, VERSION, CONSENT_TEXT, MAX_PER_HALF, TEST_Q, IDLE_CAP_MS, PART_CAP_MS, enabled, splitHalves, wordsOf, offer, start, stop, rowOf, armOf, holdOut, touch, timeOf,
  normalPart, normalDone, noteStudied, status, testNext, testSubmit, analyse, allResults,
};
