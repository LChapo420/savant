/**
 * Focus history: minutes studied per day and per subject, for the profile's calendar
 * heat map and subject pie (owner's request, 30 Oct 2026, modelled on Focus Town).
 *
 *   real(userId)    from the learner's sessions: each session counts from started_at to
 *                   ended_at (or its last update), capped at 3 hours, on the day it started.
 *   sample(userId)  generated sample stats for the owner's account, to show what the views
 *                   look like. Never written to the database, and the page labels it
 *                   "Sample data". FOCUS_SAMPLE=off shows the owner's real history instead.
 *
 * Shape: { sample, subjects: [{ id, name, color }], days: { 'YYYY-MM-DD': { [subjectId]: minutes } } }
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const { isOwner } = require('../config/owner');

const SESSION_CAP_MIN = 180;
// One fixed colour per subject, readable on light and dark pages.
const COLORS = {
  english: '#4f7cff', reading: '#a35cf0', math: '#f08a3c', piano: '#1fae9f', spanish: '#e2486a',
  act: '#3aa0e0', iq: '#8a8f99', chess: '#6b7a3a', basketball: '#c96a2e',
};
const SAMPLE_SUBJECTS = ['english', 'reading', 'math', 'piano', 'spanish'];

const dayOf = (iso) => String(iso || '').slice(0, 10);
function trackName(id) {
  const t = curriculum.getTrack(id);
  return t ? t.name : id;
}
const subject = (id) => ({ id, name: trackName(id), color: COLORS[id] || '#7a8a99' });

function real(userId) {
  const days = {};
  for (const s of db.all('sessions')) {
    if (s.user_id !== userId || !s.started_at || !s.track_id) continue;
    const start = Date.parse(s.started_at);
    const end = Date.parse(s.ended_at || s.updated_at || s.started_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const min = Math.min(SESSION_CAP_MIN, (end - start) / 60000);
    const d = dayOf(s.started_at);
    days[d] = days[d] || {};
    days[d][s.track_id] = Math.round(((days[d][s.track_id] || 0) + min) * 10) / 10;
  }
  const ids = [...new Set(Object.values(days).flatMap((x) => Object.keys(x)))];
  return { sample: false, subjects: ids.map(subject), days };
}

/** A small seeded random generator, so the sample is the same on every load. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function sample(userId, today = new Date()) {
  const rand = rng(7919 * (Number(userId) || 1));
  const days = {};
  const weights = { english: 1.0, reading: 0.8, math: 1.3, piano: 0.7, spanish: 1.1 };
  for (let back = 400; back >= 0; back--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back));
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    // Every day at least about an hour; most days 1.5-5 hours; some long days.
    const r = rand();
    const hours = r < 0.12 ? 1 + rand() * 0.9 : r < 0.62 ? 1.5 + rand() * 2.4 : r < 0.9 ? 3.5 + rand() * 2.4 : 6 + rand() * 2.2;
    const total = Math.round(hours * 60 * (weekend ? 1.1 : 1));
    // Two to four subjects a day, weighted.
    const pool = SAMPLE_SUBJECTS.slice().sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 3));
    const raw = pool.map((s) => weights[s] * (0.5 + rand()));
    const sum = raw.reduce((a, b) => a + b, 0);
    const key = d.toISOString().slice(0, 10);
    days[key] = {};
    pool.forEach((s, i) => { days[key][s] = Math.round(total * raw[i] / sum); });
  }
  return { sample: true, subjects: SAMPLE_SUBJECTS.map(subject), days };
}

function forUser(user) {
  if (isOwner(user) && String(process.env.FOCUS_SAMPLE || 'on').toLowerCase() !== 'off') return sample(user.id);
  return real(user.id);
}

module.exports = { forUser, real, sample, SESSION_CAP_MIN, COLORS };
