/**
 * From the app's own rows to the records the real-tester refit needs (docs/SCORECARD-REAL.md part 4). In memory only: nothing here is written, and no learner id leaves this file's callers.
 *
 * Who counts: a beta tester (user.beta_tester or services/beta-invites.isTester), not an admin, never account 6689, inside the consent rule (boosters.allowed). A learner counts toward the fit only with
 * MIN_ANSWERS answers over MIN_ACTIVE_DAYS days and MIN_TENURE days since the first; everyone else is counted in the report, with the reason, and left out.
 *
 * The anchor of a measure: the designed items held back from that learner's card (SCORECARD_ANCHOR, services/scorecard/active-measure.js), only from the families that can speak for that kind of measure.
 * Self-report is no anchor for a measure that is really behaviour (self-report vs behaviour correlates about 0 to .2: Dang, King & Inzlicht 2020), so habit, contrast and memory measures have no anchor
 * here and are checked only for stability across the learner's own log (splitHalfLog). Whether a kind of teaching helps can only be read from paired versions, so benefit measures have none either.
 * The scale comes from the data, not from an assumed validity: the composite is standardised on the fit group and divided by the root of its measured split-half reliability, so its true part has the
 * population spread POP_SD and the rest is noise of known size. Split-half overstates a little: a response style is shared by both halves. A measure under MIN_REL is not refitted at all.
 */
'use strict';
const OWNER_ID = 6689;
const POP_SD = 17;
const MIN_ANSWERS = 100; const MIN_ACTIVE_DAYS = 7; const MIN_TENURE = 14;
const MIN_REL = 0.15; const MIN_ANCHOR_N = 30; const MIN_ITEMS = 2;
const ANCHOR_FAMILIES = {
  performance: ['wm', 'speed', 'read', 'reason', 'switch', 'conf'],
  reasoning: ['reason', 'switch'],
  scale: ['scale', 'self', 'goal', 'tap'],
  preference: ['self', 'tap', 'taste', 'goal', 'ml', 'scale'],
  hidden: ['self', 'tap', 'goal', 'ml', 'scale'],
  habit: [], contrast: [], memory: [], benefit: [],
};
const { INDEX } = require('./ceilings');

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const corr = (a, b) => { const ma = mean(a); const mb = mean(b); let ab = 0; let aa = 0; let bb = 0; a.forEach((v, i) => { ab += (v - ma) * (b[i] - mb); aa += (v - ma) ** 2; bb += (b[i] - mb) ** 2; }); return aa && bb ? ab / Math.sqrt(aa * bb) : 0; };
const sb = (r) => (r > 0 ? (2 * r) / (1 + r) : 0);

/** Why this account is not used, or null. `h` supplies isAdmin, isTester and allowed so this can be tested alone. */
function excluded(user, h) {
  if (Number(user.id) === OWNER_ID) return 'owner account';
  if (h.isAdmin(user)) return 'admin';
  if (!(user.beta_tester || h.isTester(user.id))) return 'not a tester';
  if (!h.allowed(user)) return 'consent rule';
  return null;
}

/**
 * How likely the account's sittings come from two people: two clusters of sittings by speed and accuracy, of similar weight, that alternate over time. A steady trend (learning) does not alternate;
 * one person's good and bad days do not separate this far. Returns { score, flagged, sittings }. score is the distance between the clusters in within-cluster sds.
 */
const SHARED_SCORE = 2.7;
function sharedDevice(rows) {
  const bySit = new Map();
  for (const r of rows) { if (r.correct === null || r.correct === undefined || !(r.ms > 0)) continue; const k = r.session_id === undefined ? `L${r.level}` : r.session_id; if (!bySit.has(k)) bySit.set(k, []); bySit.get(k).push(r); }
  const sits = [...bySit.values()].filter((x) => x.length >= 5).map((x) => ({ t: Date.parse(x[0].created_at) || 0, s: mean(x.map((r) => Math.log(r.ms))), a: mean(x.map((r) => (r.correct ? 1 : 0))) })).sort((p, q) => p.t - q.t);
  if (sits.length < 8) return { score: 0, flagged: false, sittings: sits.length };
  const ss = sd(sits.map((x) => x.s)) || 1; const sa = sd(sits.map((x) => x.a)) || 1; const ms = mean(sits.map((x) => x.s)); const ma = mean(sits.map((x) => x.a));
  const pts = sits.map((x) => [(x.s - ms) / ss, (x.a - ma) / sa]);
  let c = [[-1, 0], [1, 0]]; let lab = [];
  for (let it = 0; it < 15; it++) {
    lab = pts.map((p) => (((p[0] - c[0][0]) ** 2 + (p[1] - c[0][1]) ** 2) <= ((p[0] - c[1][0]) ** 2 + (p[1] - c[1][1]) ** 2) ? 0 : 1));
    c = [0, 1].map((k) => { const q = pts.filter((_, i) => lab[i] === k); return q.length ? [mean(q.map((x) => x[0])), mean(q.map((x) => x[1]))] : c[k]; });
  }
  const n1 = lab.filter((x) => x === 1).length; const share = Math.min(n1, lab.length - n1) / lab.length;
  const within = Math.sqrt(mean(pts.map((p, i) => (p[0] - c[lab[i]][0]) ** 2 + (p[1] - c[lab[i]][1]) ** 2))) || 1;
  const dist = Math.hypot(c[0][0] - c[1][0], c[0][1] - c[1][1]);
  let flips = 0; for (let i = 1; i < lab.length; i++) if (lab[i] !== lab[i - 1]) flips += 1;
  const score = share >= 0.25 && flips >= 4 && flips / lab.length >= 0.2 ? dist / within : 0;
  return { score, flagged: score >= SHARED_SCORE, sittings: sits.length };
}

/** A learner's answers cleaned of what a real log holds: duplicates, unanswered rows, previews, unreadable dates or times. */
function cleanItems(items) {
  const seen = new Set(); const out = [];
  for (const r of items) {
    if (!r || r.preview || r.role === 'retention' || r.correct === null || r.correct === undefined) continue;
    if (r.id !== undefined && seen.has(r.id)) continue; seen.add(r.id);
    if (!Number.isFinite(Date.parse(r.created_at))) continue;
    out.push({ ...r, ms: Number.isFinite(Number(r.ms)) && Number(r.ms) > 0 ? Number(r.ms) : 0, format: r.format && r.format !== 'multiple_choice' ? 'typed' : 'multiple_choice' });
  }
  return out.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/** One learner's composite anchor per measure from what the daily check kept. */
function anchorsOf(kept) {
  const out = {};
  for (const [stat, byF] of Object.entries(kept || {})) {
    const fams = ANCHOR_FAMILIES[INDEX[stat]] || [];
    let n = 0; let sx = 0; let a = 0; let an = 0; let b = 0; let bn = 0;
    for (const [fam, f] of Object.entries(byF)) { if (!fams.includes(fam)) continue; n += f.n; sx += f.sx; a += f.a[0]; an += f.a[1]; b += f.b[0]; bn += f.b[1]; }
    if (n >= MIN_ITEMS && an && bn) out[stat] = { c: sx / n, a: a / an, b: b / bn, n };
  }
  return out;
}

/**
 * Standardise the anchors on one group: per measure { mean, sd, rel, usable, n, reason }.
 * @returns {Object<string,object>}
 */
function anchorScale(records) {
  const out = {};
  const stats = new Set(); records.forEach((r) => Object.keys(r.rawAnchor || {}).forEach((s) => stats.add(s)));
  for (const s of stats) {
    const rows = records.filter((r) => r.rawAnchor && r.rawAnchor[s]).map((r) => r.rawAnchor[s]);
    if (rows.length < MIN_ANCHOR_N) { out[s] = { usable: false, n: rows.length, reason: 'too few learners' }; continue; }
    const r = corr(rows.map((x) => x.a), rows.map((x) => x.b));
    const rel = sb(r);
    // Sampling noise alone clears MIN_REL often (about 1 anchor in 5 at n=150), so the halves must also agree beyond chance: one-sided 95% on Fisher's z.
    const beyondChance = Math.abs(r) < 1 && Math.atanh(r) - 1.645 / Math.sqrt(rows.length - 3) > 0;
    if (rel < MIN_REL || !beyondChance) { out[s] = { usable: false, n: rows.length, rel, reason: 'anchor too unreliable' }; continue; }
    out[s] = { usable: true, n: rows.length, rel: Math.min(0.98, rel), mean: mean(rows.map((x) => x.c)), sd: sd(rows.map((x) => x.c)) };
  }
  return out;
}
/** The anchor on the 0-100 scale and its noise variance, or null. */
function anchorValue(rawAnchor, scale) {
  if (!rawAnchor || !scale || !scale.usable || !scale.sd) return null;
  const y = 50 + (POP_SD * (rawAnchor.c - scale.mean)) / (scale.sd * Math.sqrt(scale.rel));
  return { y, noise: (POP_SD * POP_SD * (1 - scale.rel)) / scale.rel };
}

/** Split-half reliability of each log feature across learners: odd against even sittings. Real evidence of which contrasts exist at all. */
function splitHalfLog(records, extraFeatures, names) {
  const A = []; const B = [];
  for (const r of records) {
    const sits = [...new Set(r.rows.map((x) => x.session_id))]; const odd = new Set(sits.filter((_, i) => i % 2 === 0));
    const ra = r.rows.filter((x) => odd.has(x.session_id)); const rb = r.rows.filter((x) => !odd.has(x.session_id));
    if (ra.length < 20 || rb.length < 20) continue;
    A.push(extraFeatures(ra)); B.push(extraFeatures(rb));
  }
  return Object.fromEntries(names.map((k) => [k, { n: A.length, rel: A.length >= MIN_ANCHOR_N ? +sb(corr(A.map((f) => f[k]), B.map((f) => f[k]))).toFixed(3) : null }]));
}

/**
 * Build the records. `src` is { users, itemsOf(id), anchorsKept(id), cardReads(id), featuresOf(rows, id), helpers }: the database behind functions, so the same code runs on the live copy and in a test.
 * @returns {{records:object[], counts:Object<string,number>}}
 */
function build(src, now = Date.now()) {
  const records = []; const counts = {};
  const out = (why) => { counts[why] = (counts[why] || 0) + 1; };
  for (const user of src.users) {
    const why = excluded(user, src.helpers);
    if (why) { out(why); continue; }
    const rows = cleanItems(src.itemsOf(user.id));
    const days = new Set(rows.map((r) => String(r.created_at).slice(0, 10))).size;
    const tenure = rows.length ? (now - Date.parse(rows[0].created_at)) / 86400000 : 0;
    if (rows.length < MIN_ANSWERS) { out('too few answers'); continue; }
    if (days < MIN_ACTIVE_DAYS) { out('too few days of use'); continue; }
    if (tenure < MIN_TENURE) { out('used for too short a time'); continue; }
    const shared = sharedDevice(rows);
    if (shared.flagged) { out('looks shared between two people'); continue; }
    records.push({ userId: user.id, age: src.helpers.ageBand ? src.helpers.ageBand(user) : undefined, answers: rows.length, days, reads: src.cardReads(user.id), feat: src.featuresOf(rows, user.id), rawAnchor: anchorsOf(src.anchorsKept(user.id)), rows });
  }
  return { records, counts };
}

module.exports = { build, excluded, sharedDevice, cleanItems, anchorsOf, anchorScale, anchorValue, splitHalfLog, ANCHOR_FAMILIES, OWNER_ID, POP_SD, MIN_ANSWERS, MIN_ACTIVE_DAYS, MIN_TENURE, MIN_REL, MIN_ANCHOR_N, SHARED_SCORE };
