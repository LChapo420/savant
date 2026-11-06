/**
 * The real-tester refit, ready for day one (docs/SCORECARD-REAL.md part 4). Runs by itself once enough real data exists, checks itself against held-out real learners, reports the owner's way, and never
 * turns itself on: it writes a candidate and a report; promote() copies a candidate whose check passed to the read-out file; SCORECARD_RECAL=1 stays the owner's switch.
 *
 * Stages: fewer than MIN_LEARNERS usable learners: nothing but a "waiting" report. From there:
 *   split   a stable hash of the learner puts 30% aside for good (held-out). The fit never sees them, and their anchors are scaled with the fit group's numbers.
 *   fit     per measure the spread of the card is corrected: read = cohort mean + beta (card - cohort mean). The beta of a measure is pooled with its class (empirical Bayes, PRIOR_STRENGTH learners' worth),
 *           so with 40 testers it is in effect a class value and with several hundred the measure's own. The level is not moved: an anchor standardised on the cohort has no level of its own.
 *           From FEATURE_N learners the answer-log features may enter a measure's fit too (readout.fitMeasure, kept only when cross-validation says so).
 *   step    the existing guard (readout-refit.js): each measure moves only as far as keeps the 99th percentile change under 4 points and the largest under 8, the old model kept inside the new one.
 *   check   on held-out learners the squared error against the anchor, candidate minus current, paired by learner. The anchor's noise is in both and cancels, so this difference is unbiased for the
 *           difference against the truth. Bootstrap by learner. Passes when the 90% lower bound of the improvement is above 0 and no class is significantly worse.
 *   report  guess baseline, share of error removed, by trait class, next to the research ceiling, with how many learners were left out and why. No learner id appears.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./readout');
const RF = require('./readout-refit');
const RR = require('./refit-records');
const { INDEX, CLASSES, ceilings } = require('./ceilings');
const { STATS } = require('./stats');

const MIN_LEARNERS = 40; const MIN_HELD = 12; const MIN_MEASURES = 5; const PRIOR_STRENGTH = 300; const FEATURE_N = 500; const BOOT = 400;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const dirOf = (o) => o.dir || process.env.REFIT_DIR || path.join(__dirname, '..', '..', 'data');
const files = (o) => ({ candidate: path.join(dirOf(o), 'scorecard-readout.candidate.json'), report: path.join(dirOf(o), 'scorecard-refit-report.md'), state: path.join(dirOf(o), 'scorecard-refit-state.json'), readout: process.env.READOUT_FILE || path.join(dirOf(o), 'scorecard-readout.json') });
const isHeld = (id, salt = 'refit-v1') => require('crypto').createHash('sha1').update(`${salt}|${id}`).digest()[0] < 77; // 30% // eslint-disable-line global-require

/** Fit the betas on the fit group. Returns { models, betas, used }. */
function fitSpread(fitRecs, scales, { featNames = [] } = {}) {
  const perStat = {};
  for (const [stat, sc] of Object.entries(scales)) {
    if (!sc.usable) continue;
    const rows = fitRecs.filter((r) => r.reads[stat] && r.rawAnchor[stat]).map((r) => ({ m: r.reads[stat].m, conf: r.reads[stat].conf, feat: r.feat, y: RR.anchorValue(r.rawAnchor[stat], sc).y }));
    if (rows.length < RR.MIN_ANCHOR_N) continue;
    const mx = mean(rows.map((x) => x.m)); const my = mean(rows.map((x) => x.y));
    let xx = 0; let xy = 0; for (const x of rows) { xx += (x.m - mx) ** 2; xy += (x.m - mx) * (x.y - my); }
    perStat[stat] = { rows, mx, xx, xy, n: rows.length, sdx: Math.sqrt(xx / rows.length) || 1 };
  }
  const byClass = {};
  for (const [stat, p] of Object.entries(perStat)) { const c = INDEX[stat]; const b = byClass[c] || (byClass[c] = { xx: 0, xy: 0 }); b.xx += p.xx; b.xy += p.xy; }
  const models = {}; const betas = {};
  for (const [stat, p] of Object.entries(perStat)) {
    const bc = byClass[INDEX[stat]]; const classBeta = bc.xx ? bc.xy / bc.xx : 1;
    const own = p.xx ? p.xy / p.xx : classBeta;
    const beta = Math.max(0, Math.min(1.6, (p.n * own + PRIOR_STRENGTH * classBeta) / (p.n + PRIOR_STRENGTH)));
    betas[stat] = { beta, own, classBeta, n: p.n };
    models[stat] = { kind: 'simple', mean: p.mx, cvRmse: 0, simple: { mu: [p.mx, 0], sd: [p.sdx, 1], w: [beta * p.sdx, 0], b: p.mx } };
    if (featNames.length && p.n >= FEATURE_N) { const full = R.fitMeasure(p.rows, featNames); if (full.full) models[stat].full = full.full; }
  }
  return { models, betas };
}

/** The largest step toward the fitted model that keeps every learner's change small. `prev` is the model in force, or as-is. */
function stepped(fitted, prevArt, fitRecs, featNames) {
  const models = {}; const moves = [];
  for (const [stat, md] of Object.entries(fitted)) {
    const prev = (prevArt && prevArt.models[stat]) || { kind: 'asis', mean: md.mean };
    const rows = fitRecs.filter((r) => r.reads[stat]).map((r) => ({ m: r.reads[stat].m, conf: r.reads[stat].conf, feat: featNames.length ? r.feat : undefined }));
    const base = prev.kind === 'mix' ? prev.b : prev; let chosen = null; let largest = 0;
    for (const alpha of [1, 0.5, 0.25, 0.1, 0]) {
      const cand = alpha === 0 ? prev : { kind: 'mix', a: base, b: md, alpha };
      const shifts = rows.map((r) => Math.abs(R.readS1({ models: { [stat]: cand }, featNames }, stat, r) - R.readS1({ models: { [stat]: prev }, featNames }, stat, r))).sort((x, y) => x - y);
      const p99 = shifts[Math.min(shifts.length - 1, Math.floor(shifts.length * 0.99))] || 0; largest = shifts[shifts.length - 1] || 0;
      if (p99 <= RF.MAX_P99 && largest <= RF.MAX_ANY) { chosen = { cand, alpha }; break; }
    }
    models[stat] = chosen.cand; moves.push({ stat, alpha: chosen.alpha, largest });
  }
  return { models, moves };
}

/** Held-out check. Returns the numbers the report and the gate need. */
function check(heldRecs, scales, art, prevArt, { boot = BOOT, seed = 12345 } = {}) {
  const featNames = art.featNames || [];
  const readBy = (a, r, stat) => { const rd = r.reads[stat]; if (!a || !a.models[stat]) return rd.m; return R.readS1(a, stat, { m: rd.m, conf: rd.conf, feat: featNames.length ? r.feat : undefined }); };
  const stats = Object.keys(art.models).filter((s) => scales[s] && scales[s].usable);
  const perLearner = heldRecs.map((r) => {
    const cells = [];
    for (const s of stats) {
      if (!r.reads[s]) continue; const a = RR.anchorValue(r.rawAnchor[s], scales[s]); if (!a) continue;
      cells.push({ s, cls: INDEX[s], g: (a.y - 50) ** 2 - a.noise, c0: (a.y - readBy(prevArt, r, s)) ** 2 - a.noise, c1: (a.y - readBy(art, r, s)) ** 2 - a.noise, y: a.y });
    }
    return cells;
  }).filter((c) => c.length);
  const agg = (ls, f = () => true) => { let n = 0; let g = 0; let c0 = 0; let c1 = 0; for (const cells of ls) for (const x of cells) if (f(x)) { n += 1; g += x.g; c0 += x.c0; c1 += x.c1; } return n ? { n, g: g / n, c0: c0 / n, c1: c1 / n } : null; };
  const whole = agg(perLearner);
  let a = seed >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const classes = [...new Set(stats.map((s) => INDEX[s]))];
  const boots = { all: [] }; classes.forEach((c) => { boots[c] = []; });
  for (let b = 0; b < boot; b++) {
    const samp = perLearner.map(() => perLearner[Math.floor(u() * perLearner.length)]);
    const w = agg(samp); if (w) boots.all.push(w.c0 - w.c1);
    for (const c of classes) { const v = agg(samp, (x) => x.cls === c); if (v) boots[c].push(v.c0 - v.c1); }
  }
  const q = (arr, p) => { const s = arr.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  const toMae = (mse) => 0.8 * Math.sqrt(Math.max(0, mse));
  // a cell whose error, once the anchor's noise is taken out, is not above zero can't be estimated: the anchor is too noisy for it. It is left blank rather than shown as 100.
  const fine = (v) => v.g > 1 && v.c0 > 1 && v.c1 > 1;
  const rowOf = (v) => (v ? (fine(v) ? { n: v.n, guess: 100 - toMae(v.g), current: 100 - toMae(v.c0), candidate: 100 - toMae(v.c1), removedCurrent: 1 - Math.sqrt(v.c0) / Math.sqrt(v.g), removedCandidate: 1 - Math.sqrt(v.c1) / Math.sqrt(v.g) } : { n: v.n, guess: null, current: null, candidate: null, removedCurrent: null, removedCandidate: null }) : null);
  const byClass = Object.fromEntries(classes.map((c) => [c, { ...rowOf(agg(perLearner, (x) => x.cls === c)), gainLo: q(boots[c], 0.05), gainHi: q(boots[c], 0.95) }]));
  const lo = q(boots.all, 0.05); const hi = q(boots.all, 0.95);
  const worse = classes.filter((c) => byClass[c].gainHi < 0);
  const lhs = perLearner.map((cells) => mean(cells.map((x) => x.c1 - x.c0)));
  return { learners: perLearner.length, overall: rowOf(whole), gainLo: lo, gainHi: hi, byClass, worseClasses: worse, pass: perLearner.length >= MIN_HELD && lo > 0 && !worse.length, learnersWorse: lhs.filter((d) => d > 0).length };
}

/** The full step on a set of records. Pure apart from what it returns, so a test can run it. */
function evaluate(records, prevArt, { featNames = [] } = {}) {
  const fitRecs = records.filter((r) => !isHeld(r.userId)); const heldRecs = records.filter((r) => isHeld(r.userId));
  const scales = RR.anchorScale(fitRecs);
  const fittedOut = fitSpread(fitRecs, scales, { featNames: fitRecs.length >= FEATURE_N ? featNames : [] });
  const { models, moves } = stepped(fittedOut.models, prevArt, fitRecs, fitRecs.length >= FEATURE_N ? featNames : []);
  const ids = STATS.map((s) => s.id);
  const art = { version: (prevArt ? prevArt.version || 0 : 0) + 1, fitted_on: `${fitRecs.length} real testers`, n: fitRecs.length, ids, featNames: fitRecs.length >= FEATURE_N ? featNames : [], models };
  const result = Object.keys(models).length ? check(heldRecs, scales, art, prevArt) : null;
  return { art, scales, betas: fittedOut.betas, moves, result, fitN: fitRecs.length, heldN: heldRecs.length };
}

const f1 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(1));
const pc = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : `${Math.round(v * 100)}%`);
/** The owner's way: guess baseline, error removed, by trait class, next to the ceiling, with what was left out. */
function report({ status, counts, usableLearners, ev, stability, label = 'REAL testers, not simulated', when }) {
  const C = ceilings();
  const L = [`# Scorecard refit report (${label})`, '', `Run ${when}. Status: **${status}**.`, '', `Usable learners ${usableLearners} (need ${MIN_LEARNERS}). Left out: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`];
  if (!ev) { L.push('', 'Nothing was fitted. The refit runs again by itself.'); return L.join('\n'); }
  const r = ev.result;
  L.push(`Fit group ${ev.fitN}, held-out group ${ev.heldN} (a fixed 30%, never seen by the fit).`, '');
  if (!r) { L.push('No measure has a usable anchor yet, so nothing was fitted. Check that SCORECARD_ANCHOR is set: without held-back items there is nothing independent to check against.'); return L.join('\n'); }
  const o = r.overall;
  L.push('What these numbers are: error against an independent anchor (designed items held back from the card), with the anchor\'s own noise taken out, on measures that have an anchor. Accuracy = 100 - mean absolute error, taking it as 0.8 x the root mean square, and it assumes the true spread is 17 points: the anchor cannot tell the real spread, so the accuracy columns are only roughly right (in the synthetic test a guess read 5 points too high when the learners were more varied than that). The share removed is the number to read, and the guess column is the baseline for it. These cover only the measures below, and they read a self-view for attitude measures. A blank cell means the anchor is too noisy to estimate it.', '');
  L.push('## Held-out learners', '', '| | guess | card as in force | candidate | error removed, in force | error removed, candidate |', '|---|---|---|---|---|---|');
  L.push(`| all checked measures (${o.n} readings, ${r.learners} learners) | ${f1(o.guess)} | ${f1(o.current)} | ${f1(o.candidate)} | ${pc(o.removedCurrent)} | ${pc(o.removedCandidate)} |`);
  for (const [c, v] of Object.entries(r.byClass)) L.push(`| ${CLASSES[c].label} (${v.n}) | ${f1(v.guess)} | ${f1(v.current)} | ${f1(v.candidate)} | ${pc(v.removedCurrent)} | ${pc(v.removedCandidate)} |`);
  L.push('', `Gain in squared error, candidate against in force, 90% interval ${r.gainLo.toFixed(1)} to ${r.gainHi.toFixed(1)} (above 0 is better). Classes significantly worse: ${r.worseClasses.join(', ') || 'none'}. Learners worse off on their checked measures: ${r.learnersWorse} of ${r.learners} (a single learner's figure is noisy). **Check ${r.pass ? 'PASSED' : 'NOT passed'}.**`, '');
  const none = [...new Set(STATS.map((s) => INDEX[s.id]))].filter((c) => !r.byClass[c]);
  L.push(`Not checkable with anchors: ${none.map((c) => CLASSES[c].label).join('; ') || 'none'}. Measures of those classes are not moved by this refit.`, '');
  L.push('## Research ceilings for comparison (share of error removed; docs/SCORECARD-REAL.md)', '', '| class | ceiling removed |', '|---|---|');
  for (const [c, def] of Object.entries(CLASSES)) L.push(`| ${def.label} | ${pc(1 - Math.sqrt(1 - def.v[1] ** 2))} (${pc(1 - Math.sqrt(1 - def.v[0] ** 2))} to ${pc(1 - Math.sqrt(1 - def.v[2] ** 2))}) |`);
  const moved = ev.moves.filter((m) => m.alpha > 0).length; const held = ev.moves.filter((m) => m.alpha === 0).length;
  L.push('', `Step: ${moved} measures moved, ${held} held back because the change would be abrupt.`);
  const sc = Object.values(ev.scales); L.push(`Anchors: ${sc.filter((x) => x.usable).length} measures usable, ${sc.filter((x) => !x.usable && x.reason === 'anchor too unreliable').length} too unreliable, ${sc.filter((x) => !x.usable && x.reason === 'too few learners').length} with too few learners. Median split-half of the usable: ${f1(sc.filter((x) => x.usable).map((x) => x.rel).sort((a, b) => a - b)[Math.floor(sc.filter((x) => x.usable).length / 2)] * 100)}%.`);
  if (stability) {
    L.push('', '## Is each log contrast real? Odd against even sittings', '', '| feature | learners | split-half |', '|---|---|---|');
    for (const [k, v] of Object.entries(stability)) if (v.rel !== null) L.push(`| ${k} | ${v.n} | ${v.rel} |`);
  }
  L.push('', 'To switch it on, after reading this: `node scripts/scorecard-refit-auto.js --promote`, then set `SCORECARD_RECAL=1`. Nothing here changes a learner\'s card by itself.');
  return L.join('\n');
}

/**
 * One run. `src` as in refit-records.build. Writes the candidate, the report and the state in dir; never the read-out in force.
 * @returns {{status:string}}
 */
function run(src, o = {}) {
  const F = files(o); const now = o.now || Date.now(); const when = new Date(now).toISOString().slice(0, 10);
  const { extraFeatures, EXTRA, ALL_FEATURES } = require('./log-features'); // eslint-disable-line global-require
  const { records, counts } = RR.build(src, now);
  let status = 'waiting for enough testers'; let ev = null; let stability = null;
  if (records.length >= MIN_LEARNERS) {
    let prevArt = null; try { prevArt = JSON.parse(fs.readFileSync(F.readout, 'utf8')); if (!/real testers/.test(String(prevArt.fitted_on))) prevArt = null; } catch { /* none in force */ }
    ev = evaluate(records, prevArt, { featNames: ALL_FEATURES });
    stability = RR.splitHalfLog(records, extraFeatures, EXTRA);
    if (!ev.result) status = 'no usable anchors yet';
    else if (ev.heldN < MIN_HELD || Object.keys(ev.art.models).length < MIN_MEASURES) status = 'too few held-out learners or measures to judge';
    else status = ev.result.pass ? 'candidate passed its held-out check' : 'candidate did not pass its held-out check';
    if (ev.result) fs.writeFileSync(F.candidate, JSON.stringify({ ...ev.art, check: { pass: ev.result.pass, learners: ev.result.learners, when } }));
  }
  fs.writeFileSync(F.report, report({ status, counts, usableLearners: records.length, ev, stability, label: o.label, when }));
  let hist = []; try { hist = JSON.parse(fs.readFileSync(F.state, 'utf8')).history || []; } catch { /* first run */ }
  hist.push({ when, status, usable: records.length, candidate: ev && ev.result ? ev.result.overall.candidate : null, removed: ev && ev.result ? ev.result.overall.removedCandidate : null });
  fs.writeFileSync(F.state, JSON.stringify({ last_run: new Date(now).toISOString(), history: hist.slice(-60) }));
  return { status, usable: records.length, counts, ev, files: F };
}

/** Copy a candidate whose check passed to the read-out file. A candidate that did not pass is refused: there is no force. */
function promote(o = {}) {
  const F = files(o);
  let c; try { c = JSON.parse(fs.readFileSync(F.candidate, 'utf8')); } catch { return { ok: false, why: 'no candidate' }; }
  if (!c.check || !c.check.pass) return { ok: false, why: 'the candidate did not pass its held-out check' };
  fs.writeFileSync(F.readout, JSON.stringify(c));
  return { ok: true, file: F.readout };
}

/** The app's own tables behind the functions refit-records.build needs. Reads only. */
function dbSource() {
  /* eslint-disable global-require */
  const db = require('../../config/db'); const scorecard = require('./index'); const boosters = require('../boosters'); const invites = require('../beta-invites'); const { isAdmin } = require('../../middleware/auth');
  const LF = require('./log-features'); const { featuresOf } = require('../../scripts/lib/sim-gate');
  /* eslint-enable global-require */
  const ids = STATS.map((s) => s.id);
  const itemsBy = new Map(); for (const r of db.find('items', () => true)) { if (!itemsBy.has(r.user_id)) itemsBy.set(r.user_id, []); itemsBy.get(r.user_id).push(r); }
  return {
    users: db.find('users', () => true),
    itemsOf: (id) => itemsBy.get(id) || [],
    anchorsKept: (id) => (boosters.get(id).daily || {}).anchors || {},
    cardReads: (id) => {
      const card = scorecard.get(id); const out = {};
      for (const s of ids) { const rd = scorecard.readOwn ? scorecard.read(card, s, {}) : null; if (rd) out[s] = { m: rd.measured !== undefined ? rd.measured : rd.score, conf: rd.confidence }; }
      return out;
    },
    featuresOf: (rows, id) => {
      const sessions = db.find('sessions', (s) => s.user_id === id && !s.preview && s.kind !== 'placement' && s.kind !== 'skip');
      const starts = sessions.map((s) => Date.parse(s.started_at)).filter(Number.isFinite).sort((a, b) => a - b);
      const levels = new Set(rows.map((r) => `${r.track_id || ''}:${r.level}`)).size || sessions.length;
      const quits = sessions.filter((s) => !s.ended_at).length;
      return { ...LF.extraFeatures(rows, sessions), ...featuresOf(rows, { gaps: starts.slice(1).map((t, i) => (t - starts[i]) / 86400000), quits, levels, days: starts.length ? Math.max(1, (Date.now() - starts[0]) / 86400000) : 1 }) };
    },
    helpers: { isAdmin, isTester: invites.isTester, allowed: boosters.allowed },
  };
}

/** Once a day in a child process, so the server never waits on it; the child reads the database file only. Off unless SCORECARD_REFIT_AUTO=1. */
function startDaily() {
  if (process.env.SCORECARD_REFIT_AUTO !== '1') return null;
  const go = () => { try { const c = require('child_process').spawn(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'scorecard-refit-auto.js')], { stdio: 'ignore', detached: false, env: process.env }); c.on('error', () => {}); } catch (err) { console.warn(`scorecard refit: ${err.message}`); } }; // eslint-disable-line global-require
  const t = setInterval(go, 24 * 3600000); if (t.unref) t.unref();
  const first = setTimeout(go, 10 * 60000); if (first.unref) first.unref();
  return t;
}

module.exports = { startDaily, run, promote, evaluate, check, fitSpread, stepped, report, dbSource, isHeld, files, MIN_LEARNERS, MIN_HELD, PRIOR_STRENGTH, FEATURE_N };
