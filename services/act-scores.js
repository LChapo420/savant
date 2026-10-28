/**
 * ACT score entry: a learner's test date and target, and the scores they record from
 * each practice test (and later the real ACT).
 *
 *   act_profiles   one per learner   { test_date, target }
 *   act_scores     one per test      { kind, taken_on, form, english, math, reading, science, composite }
 *
 * A learner types these in. Nothing here estimates a score, and nothing is sent to a model.
 * The 1 to 36 scale is the ACT's section scale. The composite shown is the whole-number
 * average of English, Math and Reading when all three are given; whether the enhanced ACT
 * counts Science in the composite is UNVERIFIED (docs/yc/SOURCES-TO-VERIFY.md), so Science
 * is kept and charted on its own but never enters the composite.
 */
const db = require('../config/db');

const KINDS = ['practice', 'official'];
const SECTIONS = ['english', 'math', 'reading', 'science'];
const MAX_SCORES = 60;      // per learner, a cap on rows
const MAX_FORM = 40;

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validScore(v) {
  return Number.isInteger(v) && v >= 1 && v <= 36;
}

/** Whole-number average of English, Math and Reading (halves round up), or null if any is missing. */
function composite(row) {
  const parts = [row.english, row.math, row.reading];
  if (!parts.every(validScore)) return null;
  return Math.floor((parts[0] + parts[1] + parts[2]) / 3 + 0.5);
}

/** Check a test date and target. Returns { value } or { error }. Either may be null to clear it. */
function cleanProfile(body, now = Date.now()) {
  const out = {};
  const b = body || {};
  if (b.test_date !== undefined) {
    if (b.test_date === null || b.test_date === '') out.test_date = null;
    else if (!validDate(b.test_date)) return { error: 'The test date must be a real date, like 2027-02-06.' };
    else {
      const year = new Date(now).getUTCFullYear();
      if (Number(b.test_date.slice(0, 4)) > year + 2) return { error: 'That test date is too far ahead.' };
      out.test_date = b.test_date;
    }
  }
  if (b.target !== undefined) {
    if (b.target === null || b.target === '') out.target = null;
    else if (!validScore(b.target)) return { error: 'The target must be a whole number from 1 to 36.' };
    else out.target = b.target;
  }
  return { value: out };
}

/** Check one test's scores. English, Math and Reading are required; Science is optional. */
function cleanScore(body, now = Date.now()) {
  const b = body || {};
  const kind = b.kind === undefined ? 'practice' : b.kind;
  if (!KINDS.includes(kind)) return { error: 'The kind must be practice or official.' };
  if (!validDate(b.taken_on)) return { error: 'Give the date you took the test, like 2026-10-18.' };
  if (b.taken_on > new Date(now + 36 * 3600 * 1000).toISOString().slice(0, 10)) return { error: 'The test date is in the future.' };
  if (b.taken_on < '2015-01-01') return { error: 'That date is too far back.' };
  const form = b.form === undefined || b.form === null ? '' : String(b.form).trim();
  if (form.length > MAX_FORM) return { error: `The form name can be at most ${MAX_FORM} characters.` };
  const row = { kind, taken_on: b.taken_on, form };
  for (const s of SECTIONS) {
    const v = b[s];
    if (v === undefined || v === null || v === '') {
      if (s !== 'science') return { error: `Enter the ${s} score (1 to 36).` };
      row[s] = null;
    } else if (!validScore(v)) return { error: `The ${s} score must be a whole number from 1 to 36.` };
    else row[s] = v;
  }
  row.composite = composite(row);
  return { value: row };
}

function getProfile(userId) {
  const r = db.findOne('act_profiles', (p) => p.user_id === userId);
  return { test_date: r ? r.test_date || null : null, target: r ? r.target || null : null };
}

function setProfile(userId, patch) {
  db.upsert('act_profiles', (p) => p.user_id === userId, (existing) => ({ user_id: userId, ...(existing || {}), ...patch }));
  return getProfile(userId);
}

/** A learner's scores, oldest first. */
function listScores(userId) {
  return db.find('act_scores', (r) => r.user_id === userId)
    .sort((a, b) => (a.taken_on < b.taken_on ? -1 : a.taken_on > b.taken_on ? 1 : a.id - b.id))
    .map(view);
}

function view(r) {
  const out = { id: r.id, kind: r.kind, taken_on: r.taken_on, form: r.form || '', composite: r.composite };
  for (const s of SECTIONS) out[s] = r[s] === undefined ? null : r[s];
  return out;
}

function addScore(userId, row) {
  if (db.find('act_scores', (r) => r.user_id === userId).length >= MAX_SCORES) return { error: `You can keep up to ${MAX_SCORES} scores. Delete one first.` };
  return { value: view(db.insert('act_scores', { user_id: userId, ...row })) };
}

function removeScore(userId, id) {
  return db.remove('act_scores', (r) => r.user_id === userId && r.id === Number(id));
}

/** Whole days from today (UTC date) to the test date, or null. Negative once it has passed. */
function daysToTest(testDate, now = Date.now()) {
  if (!validDate(testDate)) return null;
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  return Math.round((Date.parse(testDate) - today) / 86400000);
}

function summary(userId, now = Date.now()) {
  const profile = getProfile(userId);
  const scores = listScores(userId);
  const withComposite = scores.filter((s) => s.composite !== null);
  const latest = withComposite.length ? withComposite[withComposite.length - 1] : null;
  return {
    profile,
    days_to_test: daysToTest(profile.test_date, now),
    scores,
    latest_composite: latest ? latest.composite : null,
    points_to_target: latest && profile.target ? profile.target - latest.composite : null,
  };
}

module.exports = { KINDS, SECTIONS, MAX_SCORES, validDate, composite, cleanProfile, cleanScore, getProfile, setProfile, listScores, addScore, removeScore, daysToTest, summary };
