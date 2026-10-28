/**
 * The split-half reliability of the basketball decision-scene sets, computed
 * from real sittings (evidence article 04, P5; M10). A scene set may gate a
 * stage only once it is shown to measure consistently: the progression asks
 * split-half >= 0.8 after 100 learners (content/skill-piano-bb-sittings.js), the
 * reliability bar a test needs before a high-stakes use (AERA/APA/NCME 2014;
 * Cortina 1993 on test length; Hopkins 2000; Rösch et al. 2021 report 0.92 for
 * a 4v4 video test).
 *
 * Each learner's first scene sitting of a metric whose item marks were kept
 * (skill-checks.finish stores `detail.marks`, 1 right / 0 wrong in the order
 * served) is split odd/even; the two half scores are correlated across
 * learners (Pearson) and stepped up to the full length by Spearman-Brown,
 * r_full = 2r / (1 + r). Odd/even keeps each half's mix of scene types even,
 * and a BB3 scene shown twice lands in both halves only by chance.
 *
 * services/skill-gate.js keeps a stage with scene sets in shadow until every
 * one of its sets is reliable (SCENE_RELIABILITY_GATE, default on; off gives
 * back the hand-kept shadow list). Read-only: it never writes.
 */
'use strict';

const db = require('../config/db');

const MIN_LEARNERS = 100;
const BAR = 0.8;
const CACHE_MS = 10 * 60 * 1000;

function gateOn() {
  return String(process.env.SCENE_RELIABILITY_GATE || 'on').toLowerCase() !== 'off';
}

/** The decision-scene metrics, by stage id: content/skill-piano-bb-sittings.js `bb_scenes` sets. */
function sceneMetrics() {
  let checks = {};
  try {
    // eslint-disable-next-line global-require
    const PB = require('../content/skill-piano-bb-sittings');
    checks = PB.CHECKS || PB.checks || {};
  } catch (err) {
    if (!(err && err.code === 'MODULE_NOT_FOUND')) throw err;
  }
  const out = {};
  for (const [id, def] of Object.entries(checks)) {
    if (def && def.build === 'bb_scenes') (out[id.split(':')[0]] = out[id.split(':')[0]] || []).push(id);
  }
  return out;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (!sxx || !syy) return null; // no spread: reliability cannot be estimated
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman-Brown: the reliability of a test twice the length of the halves that correlate at r. */
const spearmanBrown = (r) => (r === null ? null : (2 * r) / (1 + r));

/**
 * Split-half reliability from per-learner mark vectors (arrays of 0/1).
 * @returns {{learners:number, r_half:number|null, reliability:number|null}}
 */
function splitHalf(markLists) {
  const odd = [];
  const even = [];
  for (const marks of markLists) {
    if (!Array.isArray(marks) || marks.length < 4) continue;
    let o = 0; let e = 0;
    marks.forEach((m, i) => { if (i % 2) o += m ? 1 : 0; else e += m ? 1 : 0; });
    odd.push(o); even.push(e);
  }
  const r = pearson(odd, even);
  const sb = spearmanBrown(r);
  return { learners: odd.length, r_half: r === null ? null : Number(r.toFixed(3)), reliability: sb === null ? null : Number(sb.toFixed(3)) };
}

/** Every learner's first sitting of the metric that kept its marks. */
function marksFor(metricId) {
  const lists = [];
  for (const row of db.find('skill_records', (r) => r.metric_id === metricId && Array.isArray(r.sittings))) {
    const first = row.sittings.find((s) => s && s.detail && Array.isArray(s.detail.marks));
    if (first) lists.push(first.detail.marks);
  }
  return lists;
}

const cache = new Map();
/** One scene metric's reliability, and whether it meets the bar on enough learners. */
function forMetric(metricId, now = Date.now()) {
  const hit = cache.get(metricId);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const s = splitHalf(marksFor(metricId));
  const value = { metric: metricId, ...s, min_learners: MIN_LEARNERS, bar: BAR, reliable: s.learners >= MIN_LEARNERS && s.reliability !== null && s.reliability >= BAR };
  cache.set(metricId, { at: now, value });
  return value;
}

/**
 * Does this stage stay in shadow for its scene sets? null when the stage has
 * none (or the rule is off); otherwise {hold, sets}.
 */
function stageHold(stageId, now = Date.now()) {
  if (!gateOn()) return null;
  const ids = sceneMetrics()[String(stageId || '').toUpperCase()];
  if (!ids || !ids.length) return null;
  const sets = ids.map((id) => forMetric(id, now));
  return { hold: !sets.every((x) => x.reliable), sets };
}

function clearCache() { cache.clear(); }

module.exports = { gateOn, sceneMetrics, splitHalf, spearmanBrown, pearson, forMetric, stageHold, clearCache, MIN_LEARNERS, BAR };

// A report: node services/skill-scene-reliability.js (reads DB_FILE, writes nothing).
if (require.main === module) {
  for (const [stage, ids] of Object.entries(sceneMetrics())) {
    for (const id of ids) {
      const x = forMetric(id);
      console.log(`${stage.padEnd(6)} ${id.padEnd(26)} learners ${String(x.learners).padStart(4)}  split-half ${x.reliability === null ? 'n/a' : x.reliability.toFixed(2)}  ${x.reliable ? 'RELIABLE: may gate' : `held in shadow (needs ${MIN_LEARNERS}+ learners at ${BAR})`}`);
    }
  }
}
