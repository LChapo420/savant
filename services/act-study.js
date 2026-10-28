/**
 * The ACT measurement study (docs/yc/ACT-STUDY-PROTOCOL.md): who joined, which practice-test
 * order they were given, and their before and after scores.
 *
 *   act_study   one per learner   { user_id, arm, group, wait_ok, consent_at, parent_aware, seen_forms, other_prep, joined_at, left_at }
 *
 * Wait-list arm: a learner who says wait_ok is assigned (alternately) to group "now" (Savant
 * during the four weeks between the tests) or "wait" (the same two tests, Savant only after
 * the second). Everyone else is in "now". The app cannot stop a "wait" learner using Savant,
 * so the report shows their minutes in the window and flags any use.
 *
 * The scores themselves are the learner's act_scores rows (services/act-scores.js): the form
 * field says which official practice test ("A" or "B") a score came from. Nothing here
 * estimates a score or calls a model. Test and demo accounts never appear in the results.
 */
const db = require('../config/db');
const scores = require('./act-scores');

const FORMS = ['A', 'B'];
const ARMS = ['AB', 'BA'];     // before then after
const GROUPS = ['now', 'wait'];
const MAX_PREP = 300;

function formOf(row) {
  const f = String(row.form || '').trim().toUpperCase();
  return FORMS.includes(f) ? f : null;
}

/** The next learner's order: whichever of AB or BA has fewer people (ties go to AB), so the halves stay even. */
const groupOf = (r) => (r.group === 'wait' ? 'wait' : 'now');

function nextArm(rows = db.all('act_study'), group = 'now') {
  const inGroup = rows.filter((r) => groupOf(r) === group);
  const ab = inGroup.filter((r) => r.arm === 'AB').length;
  const ba = inGroup.filter((r) => r.arm === 'BA').length;
  return ab <= ba ? 'AB' : 'BA';
}

/** Only learners who agreed to a possible wait are split; they alternate, ties go to "now". Everyone else is "now". */
function nextGroup(waitOk, rows = db.all('act_study')) {
  if (!waitOk) return 'now';
  const agreed = rows.filter((r) => r.wait_ok);
  const waiting = agreed.filter((r) => groupOf(r) === 'wait').length;
  return waiting < agreed.length - waiting ? 'wait' : 'now';
}

function cleanJoin(body) {
  const b = body || {};
  if (b.consent !== true) return { error: 'Tick the box to say you agree to join the study.' };
  if (b.parent_aware !== true) return { error: 'Tick the box to confirm a parent or guardian knows you are joining.' };
  if (typeof b.seen_forms !== 'boolean') return { error: 'Say whether you have seen these two practice tests before.' };
  const other = b.other_prep === undefined || b.other_prep === null ? '' : String(b.other_prep).trim();
  if (other.length > MAX_PREP) return { error: `Other prep can be at most ${MAX_PREP} characters.` };
  if (b.wait_ok !== undefined && typeof b.wait_ok !== 'boolean') return { error: 'Say yes or no to waiting to start Savant.' };
  return { value: { seen_forms: b.seen_forms, other_prep: other, wait_ok: b.wait_ok === true } };
}

function getEntry(userId) {
  return db.findOne('act_study', (r) => r.user_id === userId && !r.left_at) || null;
}

function join(userId, value, now = Date.now()) {
  const existing = getEntry(userId);
  if (existing) return existing;
  const at = new Date(now).toISOString();
  const group = nextGroup(!!value.wait_ok);
  return db.insert('act_study', { user_id: userId, arm: nextArm(db.all('act_study'), group), group, consent_at: at, parent_aware: true, ...value, joined_at: at, left_at: null });
}

function leave(userId, now = Date.now()) {
  const e = getEntry(userId);
  if (!e) return false;
  db.update('act_study', e.id, { left_at: new Date(now).toISOString() });
  return true;
}

/** What a participant sees: their order, and which of the two scores they have entered. */
function mine(userId) {
  const e = getEntry(userId);
  if (!e) return { joined: false };
  const have = new Set(scores.listScores(userId).map(formOf).filter(Boolean));
  return { joined: true, group: groupOf(e), arm: e.arm, before_form: e.arm[0], after_form: e.arm[1], has_before: have.has(e.arm[0]), has_after: have.has(e.arm[1]), seen_forms: !!e.seen_forms };
}

/** Active study minutes between two dates (inclusive), from the app's own study-session clock. */
function doseBetween(userId, from, to) {
  const rows = db.find('study_sessions', (s) => s.user_id === userId && s.started_at
    && (!from || s.started_at.slice(0, 10) >= from) && (!to || s.started_at.slice(0, 10) <= to));
  return { sessions: rows.length, minutes: Math.round(rows.reduce((t, s) => t + (s.active_ms || 0), 0) / 60000) };
}

const diff = (a, b) => (Number.isInteger(a) && Number.isInteger(b) ? b - a : null);

function rowFor(e) {
  const user = db.byId('users', e.user_id) || {};
  const all = scores.listScores(e.user_id).filter((s) => s.kind === 'practice' && formOf(s));
  const first = (letter) => all.find((s) => formOf(s) === letter) || null;
  const before = first(e.arm[0]);
  const after = first(e.arm[1]);
  let status = 'not_started';
  if (before && after) status = 'complete';
  else if (before) status = 'before_only';
  if (e.seen_forms) status = `excluded_seen_${status}`;
  const out = {
    user_id: e.user_id, name: user.display_name || '', email: user.email || '', arm: e.arm, group: groupOf(e), joined_on: e.joined_at.slice(0, 10),
    status, seen_forms: !!e.seen_forms, other_prep: e.other_prep || '',
    before_form: e.arm[0], before_on: before ? before.taken_on : null, after_form: e.arm[1], after_on: after ? after.taken_on : null,
    before: before, after: after,
    gap_days: before && after ? Math.round((Date.parse(after.taken_on) - Date.parse(before.taken_on)) / 86400000) : null,
    change: {},
  };
  for (const k of ['composite', ...scores.SECTIONS]) out.change[k] = before && after ? diff(before[k], after[k]) : null;
  Object.assign(out, doseBetween(e.user_id, before ? before.taken_on : null, after ? after.taken_on : null));
  out.used_savant_while_waiting = out.group === 'wait' && out.minutes > 0;
  return out;
}

const isReal = (e) => { const u = db.byId('users', e.user_id) || {}; return !(u.is_demo === true || u.is_test === true || u.account_kind === 'demo' || u.account_kind === 'test'); };

const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/** Every participant, and the counts the protocol says to report: started, finished, left, mean change by order. */
function report() {
  const entries = db.all('act_study').filter(isReal);
  const rows = entries.filter((e) => !e.left_at).map(rowFor);
  const complete = rows.filter((r) => r.status === 'complete');
  const byArm = {};
  for (const arm of ARMS) {
    const c = complete.filter((r) => r.arm === arm).map((r) => r.change.composite).filter((v) => v !== null);
    byArm[arm] = { joined: rows.filter((r) => r.arm === arm).length, complete: c.length, mean_composite_change: mean(c) };
  }
  const byGroup = {};
  for (const g of GROUPS) {
    const c = complete.filter((r) => r.group === g && !r.seen_forms).map((r) => r.change.composite).filter((v) => v !== null);
    byGroup[g] = { joined: rows.filter((r) => r.group === g).length, complete: c.length, mean_composite_change: mean(c),
      used_savant_while_waiting: g === 'wait' ? rows.filter((r) => r.used_savant_while_waiting).length : undefined };
  }
  const all = complete.map((r) => r.change.composite).filter((v) => v !== null);
  return {
    totals: {
      joined: entries.length, left: entries.filter((e) => e.left_at).length, active: rows.length,
      complete: complete.length, excluded_seen_forms: rows.filter((r) => r.seen_forms).length,
      mean_composite_change: mean(all), min_composite_change: all.length ? Math.min(...all) : null, max_composite_change: all.length ? Math.max(...all) : null,
    },
    by_arm: byArm,
    by_group: byGroup,
    note: 'Descriptive only: with a handful of students these averages cannot show that Savant raises scores. Report every participant, including those who left or whose change is zero or negative.',
    participants: rows,
  };
}

const CSV_COLUMNS = ['user_id', 'name', 'arm', 'group', 'status', 'joined_on', 'before_form', 'before_on', 'before_composite', 'after_form', 'after_on', 'after_composite', 'change_composite', 'change_english', 'change_math', 'change_reading', 'change_science', 'gap_days', 'sessions', 'minutes', 'used_savant_while_waiting', 'seen_forms', 'other_prep'];

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;   // keep a spreadsheet from running a typed value as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rep = report()) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rep.participants) {
    const flat = { ...r, before_composite: r.before ? r.before.composite : null, after_composite: r.after ? r.after.composite : null };
    for (const k of Object.keys(r.change)) flat[`change_${k}`] = r.change[k];
    lines.push(CSV_COLUMNS.map((c) => csvCell(flat[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

module.exports = { FORMS, ARMS, GROUPS, formOf, nextArm, nextGroup, cleanJoin, getEntry, join, leave, mine, report, toCsv, csvCell };
