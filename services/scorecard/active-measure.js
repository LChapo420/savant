/**
 * Active measurement for the daily check (docs/SCORECARD-REAL.md parts 2 and 3). SIMULATED evidence only. Off unless a switch is set; with every switch off nothing here runs.
 *
 * What today's planner does: the item with the largest drop in the planner's own posterior sd per second, weighted by 1 / sqrt(1 + card mass). It does not know what behaviour already told
 * the card about a measure beyond a mass count, and a mass of logged answers says nothing about whether they read that measure. Its answers cannot change what it asks (a Gaussian's
 * posterior variance does not depend on the answers).
 *
 * SCORECARD_ACTIVE=1:
 *   1. What behaviour has told us, per measure and learner: precision v^2 / (1 - v^2) x f, v from how the class can be read by behaviour alone (BEHAVIOUR_V, research-based, ASSUMED until a real
 *      refit replaces it; a fitted file can override it), f the share of a full month of evidence this learner has on it. A pseudo-family in a SELECTION state only, so a pick accounts for it
 *      while what is fed to the card stays exactly as it was.
 *   2. Answers change the next pick: a measure where the check and the card disagree by more than they can both be right gets its behaviour precision cut (it may be misread, or two people may
 *      share the device), and measures reading far from the middle weigh more, because a normal prior pulls a tail learner in hardest.
 *   3. It stops when an item is worth less than SCORECARD_ACTIVE_MINGAIN points of total posterior sd per minute, so a learner the card already knows gets a shorter check.
 *      It never adds time: the day's allowance is unchanged.
 * SCORECARD_SELF_WORTH=1: a self-report item counts only as much as a self-report is worth for that kind of measure (ceilings.SELF_REPORT_WORTH), in the pick and in what is fed.
 * DAILY_SHORT_FORM=K: the check asks only the K items of the short form (content/daily-check/short-form.json), then three short tasks once.
 * SCORECARD_ANCHOR=P: that share of designed items (a fixed draw per learner and item) is scored but NOT fed to the card, and kept as an independent check for the real-tester refit
 *                     (services/scorecard/refit-records.js). Kept in the learner's profiles row (boosters.daily.anchors), so account deletion and the data download already cover it.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const model = require('../onboarding/model');
const { INDEX, SELF_REPORT_WORTH } = require('./ceilings');
const decisions = require('./decisions');

const DEFAULT_MINGAIN = 0.6; // points of total posterior sd per minute; chosen on the calibration seed, not the held-out one (docs/SCORECARD-REAL.md)
const BEHAVIOUR_V = { performance: 0.85, habit: 0.75, memory: 0.6, contrast: 0.5, reasoning: 0.5, scale: 0.2, preference: 0.2, benefit: 0.25, hidden: 0.15 };
const FULL_MASS = 4; // behaviour mass at which a measure has a month's evidence behind it (about the 75th percentile of the simulated card at day 30)
const CONFLICT_Z = 1.5;
const SELF_FAMILIES = new Set(['self', 'scale', 'tap']);

const enabled = () => process.env.SCORECARD_ACTIVE === '1';
const selfWorthOn = () => process.env.SCORECARD_SELF_WORTH === '1';
const minGain = () => (process.env.SCORECARD_ACTIVE_MINGAIN !== undefined ? Number(process.env.SCORECARD_ACTIVE_MINGAIN) : DEFAULT_MINGAIN);
const shortFormK = () => Number(process.env.DAILY_SHORT_FORM || 0);
const anchorShare = () => Number(process.env.SCORECARD_ANCHOR || 0);

/** An optional fitted file, { measure: v }, replaces the class value (written by a real refit). */
let fitted;
function fittedV() {
  if (fitted !== undefined) return fitted;
  try { fitted = JSON.parse(fs.readFileSync(process.env.ACTIVE_FILE || path.join(__dirname, '..', '..', 'data', 'scorecard-active.json'), 'utf8')); } catch { fitted = null; }
  return fitted;
}
const vOf = (id) => { const f = fittedV(); if (f && f[id] !== undefined) return f[id]; return BEHAVIOUR_V[INDEX[id]] === undefined ? 0.3 : BEHAVIOUR_V[INDEX[id]]; };

/** How much one self-report reading on this measure is worth, 0..1. */
const worthOf = (stat, family) => (SELF_FAMILIES.has(family) ? (SELF_REPORT_WORTH[INDEX[stat]] === undefined ? 1 : SELF_REPORT_WORTH[INDEX[stat]]) : 1);

/**
 * The selection state and the weights for one learner: pure, so it can be tested without a database.
 * @param {object} state        the planner's real state
 * @param {object} reads        { measure: { mass, value } } the card's evidence on the measure (behaviour only) and its number (0-100); undefined when the card has nothing
 */
function selectionFor(state, reads) {
  const sel = { fam: JSON.parse(JSON.stringify(state.fam || {})) };
  const importance = {}; const behaviour = {}; let cut = 0;
  for (const id of Object.keys(INDEX)) {
    const rd = reads[id] || {};
    const v = vOf(id); const f = Math.min(1, Math.max(0, (rd.mass || 0) / FULL_MASS));
    let Pb = (v * v) / (1 - v * v) * f;
    const here = model.posterior(state, id);
    const zCard = rd.value === undefined ? null : (rd.value - 50) / model.POP_SD;
    if (zCard !== null && here.P > 0.3 && Pb > 0) {
      const gap = Math.abs(zCard - here.dataZ); const room = Math.sqrt(1 / Pb + 1 / here.P);
      if (gap / room > CONFLICT_Z) { Pb *= 0.25; cut += 1; }
    }
    behaviour[id] = Pb;
    if (Pb > 1e-6) { const r = Math.sqrt(Pb / (1 + Pb)); (sel.fam[id] || (sel.fam[id] = {})).__card = { n: 1, S: r, Q: r * r, X: 0 }; }
    const P = here.P + Pb;
    const zHat = P > 0 ? ((zCard === null ? 0 : Pb * zCard) + here.P * here.dataZ) / (1 + P) : 0;
    importance[id] = 1 + 0.5 * Math.max(0, Math.abs(zHat) - 1);
    // SCORECARD_DECISION_VOI=1: also weigh by how likely the content decision made from this number is to be wrong (services/scorecard/decisions.js)
    if (decisions.enabled()) importance[id] *= decisions.decisionImportance(id, 50 + model.POP_SD * zHat, model.POP_SD / Math.sqrt(1 + P));
  }
  return { sel, importance, behaviour, conflicts: cut };
}

/** The pool as the pick sees it: self-report discounted by what it is worth for each measure. */
function selectionPool(pool) {
  if (!selfWorthOn()) return pool;
  return pool.map((it) => (SELF_FAMILIES.has(it.family) ? { ...it, informs: it.informs.map((i) => ({ ...i, r: i.r * worthOf(i.stat, it.family) })) } : it));
}

let shortList = null;
function shortForm() {
  if (shortList) return shortList;
  try { shortList = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'content', 'daily-check', 'short-form.json'), 'utf8')); } catch { shortList = { items: [], tasks: [] }; }
  return shortList;
}
/** The ids the short form may ask, for the current K, or null when it is off. */
function shortFormIds() {
  const k = shortFormK(); if (!k) return null;
  const s = shortForm();
  return new Set([...s.items.slice(0, k).map((i) => i.id), ...(s.tasks || [])]);
}

/** Whether this learner's answer to this item is held back from the card. A fixed draw, so a repeat of an item stays on the same side. */
const isAnchor = (userId, itemId, share = anchorShare()) => {
  if (!share) return false;
  const h = crypto.createHash('sha1').update(`anchor|${userId}|${itemId}`).digest();
  return h.readUInt32BE(0) / 4294967296 < share;
};
const halfOf = (itemId) => crypto.createHash('sha1').update(`half|${itemId}`).digest()[0] % 2;

/** Merge a run's held-back readings into what is kept: { stat: { family: { n, sx, sr, a: [sum, n], b: [sum, n] } } }. */
function mergeAnchors(kept = {}, log = []) {
  const out = JSON.parse(JSON.stringify(kept));
  for (const { stat, family, x, r, item } of log) {
    const byF = out[stat] || (out[stat] = {}); const f = byF[family] || (byF[family] = { n: 0, sx: 0, sr: 0, a: [0, 0], b: [0, 0] });
    f.n += 1; f.sx = Math.round((f.sx + x) * 1000) / 1000; f.sr = Math.round((f.sr + r) * 1000) / 1000;
    const h = halfOf(item) ? f.b : f.a; h[0] = Math.round((h[0] + x) * 1000) / 1000; h[1] += 1;
  }
  return out;
}

/** Set up a planner for this learner's run. `reads` from readsOf; a no-op unless a switch is set. */
function attach(planner, userId, reads, { dayKey = '' } = {}) {
  // a repeatable task is drawn per day, so a learner's span or speed reading is never all on one side
  if (anchorShare() > 0) planner.anchorFor = (item) => !item.free && isAnchor(userId, ['span', 'speed', 'switch'].includes(item.kind) ? `${item.id}|${dayKey}` : item.id);
  if (selfWorthOn()) planner.readValidity = (stat, family, r) => r * worthOf(stat, family);
  if (!enabled()) return planner;
  const { sel, importance, conflicts } = selectionFor(planner.state, reads);
  planner.selectionState = sel;
  planner.importance = importance;
  planner.mode = { ...planner.mode, minGainPerMin: minGain() };
  planner.conflicts = conflicts;
  return planner;
}

module.exports = { enabled, selfWorthOn, minGain, shortFormK, shortFormIds, anchorShare, isAnchor, mergeAnchors, attach, selectionFor, selectionPool, worthOf, vOf, BEHAVIOUR_V, FULL_MASS, DEFAULT_MINGAIN, _reset: () => { shortList = null; fitted = undefined; } };
