/**
 * What a learner is shown for each pool item, and how a response becomes readings.
 *
 * Content comes from content/onboarding/items.json (written by free models and blind-checked: scripts/build-onboarding-items.js) and from the two
 * generators below (number series and conditional reasoning: keyed by construction, so they need no checker). An item whose content is missing is
 * simply not available and is never offered. Keys never leave the server.
 *
 * A reading is a standardised score for one measure, oriented "high on the measure = positive". The norms used to standardise (span 5.5 +- 1.3,
 * 28 +- 7 symbol matches a minute, 230 +- 55 words a minute, ...) are ASSUMED adult-and-teen figures, not measured on this app's learners: the
 * scorecard re-standardises against its own cohort as it grows (docs/ONBOARDING-MODES.md, limits).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { byId } = require('./pool');

const FILE = path.join(__dirname, '..', '..', 'content', 'onboarding', 'items.json');
let cache = null;
function content() {
  if (!cache) { try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = { self: {}, reading: [], reason: {}, minilesson: [], taste: [] }; } }
  return cache;
}
// The factor self-ratings (fq:*) are short hand-written statements about whole families of traits (content/onboarding/factor-items.json).
let factorCache = null;
function factorContent() {
  if (!factorCache) { try { factorCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'content', 'onboarding', 'factor-items.json'), 'utf8')); } catch { factorCache = { items: {} }; } }
  return factorCache;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const z = (x, mu, sd) => clamp((x - mu) / sd, -3, 3);
const shuffle = (a, rnd) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
function rngFrom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── generators ───────────────────────────────────────────────────────────────
function series(rnd) {
  const kind = Math.floor(rnd() * 4);
  const a = 2 + Math.floor(rnd() * 7); const d = 2 + Math.floor(rnd() * 5);
  let seq; let ans;
  if (kind === 0) { seq = [0, 1, 2, 3, 4].map((i) => a + d * i); ans = a + d * 5; }
  else if (kind === 1) { seq = [0, 1, 2, 3, 4].map((i) => a * 2 ** i); ans = a * 32; }
  else if (kind === 2) { seq = [a, 30, a + d, 30 - d, a + 2 * d]; ans = 30 - 2 * d; }
  else { seq = [1, 2, 3, 4, 5].map((i) => i * i + a); ans = 36 + a; }
  const opts = new Set([ans]); while (opts.size < 4) opts.add(ans + (Math.floor(rnd() * 9) - 4) * (1 + Math.floor(rnd() * 2)) || ans + 7);
  const options = shuffle([...opts], rnd);
  return { q: `What comes next?  ${seq.join(', ')}, ?`, options: options.map(String), key: options.indexOf(ans) };
}
function deduct(rnd) {
  const things = [['cats', 'animals', 'plants'], ['squares', 'rectangles', 'circles'], ['poets', 'writers', 'athletes'], ['oaks', 'trees', 'rocks']];
  const [A, B, C] = things[Math.floor(rnd() * things.length)];
  const forms = [
    { q: `All ${A} are ${B}. No ${B} are ${C}. Which must be true?`, ok: `No ${A} are ${C}.`, bad: [`Some ${A} are ${C}.`, `All ${C} are ${A}.`, `All ${B} are ${A}.`] },
    { q: `If it rains, the match is cancelled. The match was not cancelled. What follows?`, ok: 'It did not rain.', bad: ['It rained.', 'It might have rained, we cannot say.', 'The match will be cancelled tomorrow.'] },
    { q: `All ${A} are ${B}. Some ${B} are ${C}. Which must be true?`, ok: 'None of the other three must be true.', bad: [`Some ${A} are ${C}.`, `All ${A} are ${C}.`, `No ${A} are ${C}.`] },
    { q: `Only members can enter the hall. Dana entered the hall. What follows?`, ok: 'Dana is a member.', bad: ['Dana is not a member.', 'Everyone who is a member entered.', 'Dana paid to enter.'] },
  ];
  const f = forms[Math.floor(rnd() * forms.length)];
  const options = shuffle([f.ok, ...f.bad], rnd);
  return { q: f.q, options, key: options.indexOf(f.ok) };
}

// ── what the learner sees (no keys) ───────────────────────────────────────────
/**
 * @returns {object|null} the step to render, plus `_server` data the session keeps (keys, shuffles); null when the item has no content.
 */
function present(item, seed) {
  const rnd = rngFrom(seed);
  const c = content();
  if (item.kind === 'scale') {
    const it = require('../../content/daily-check').SCALE_ITEMS.find((x) => x.id === item.id);
    if (!it) return null;
    return { id: item.id, kind: 'ipip', scale: require('../../content/ipip-items').SCALE, items: [{ id: item.id, text: it.text }], _server: {} };
  }
  if (item.kind === 'forced' && item.tap) {
    const it = require('../../content/daily-check').TAP_ITEMS.find((x) => x.id === item.id);
    if (!it) return null;
    const opts = [{ k: 'high', text: it.high }, { k: 'low', text: it.low }];
    return { id: item.id, kind: 'forced', prompt: it.prompt, options: rnd() < 0.5 ? opts.reverse() : opts, _server: {} };
  }
  if (item.kind === 'forced') {
    let high; let low;
    if (item.legacy) {
      const q = require('../learner').STYLE_QUESTIONS.find((x) => `sq:${x.id}` === item.id);
      if (!q) return null;
      return { id: item.id, kind: 'forced', prompt: q.prompt, options: [{ k: 'low', text: q.low }, { k: 'high', text: q.high }], _server: {} };
    }
    const [prefix, stat, ab] = item.id.split(':');
    const own = prefix === 'fq' ? ((factorContent().items || {})[stat] || []) : ((c.self && c.self[stat]) || []);
    const pair = own[ab === 'a' ? 0 : 1];
    if (!pair) return null;
    high = pair.high; low = pair.low;
    const flip = rnd() < 0.5;
    const opts = [{ k: 'high', text: high }, { k: 'low', text: low }];
    return { id: item.id, kind: 'forced', prompt: 'Which sounds more like you when you learn?', options: flip ? opts.reverse() : opts, _server: {} };
  }
  if (item.kind === 'reason') {
    const [, kind, n] = item.id.split(':');
    let q;
    if (kind === 'series') q = series(rngFrom(seed + 11));
    else if (kind === 'deduct') q = deduct(rngFrom(seed + 13));
    else q = ((c.reason && c.reason[kind]) || [])[Number(n) - 1];
    if (!q) return null;
    return { id: item.id, kind: 'reason', q: q.q, options: q.options, confidence: true, _server: { key: q.key } };
  }
  if (item.kind === 'read') {
    const p = (c.reading || []).find((x) => x.tag === (item.id === 't:read_1' ? 'mid' : 'hard'));
    if (!p) return null;
    return { id: item.id, kind: 'read', passage: p.passage, words: p.passage.trim().split(/\s+/).length, questions: p.questions.map((q) => ({ q: q.q, options: q.options })), _server: { keys: p.questions.map((q) => q.key) } };
  }
  if (item.kind === 'minilesson') {
    const part = (c.minilesson || [])[Number(item.id.slice(-1)) - 1];
    if (!part) return null;
    const { problem, ...text } = part;
    return { id: item.id, kind: 'minilesson', part: Number(item.id.slice(-1)), text, problem: { q: problem.q, options: problem.options }, _server: { key: problem.key } };
  }
  if (item.kind === 'taste') {
    const t = (c.taste || []).find((x) => `a:${x.id}` === item.id);
    if (!t) return null;
    const flip = rnd() < 0.5;   // flip: version b is shown first
    return { id: item.id, kind: 'taste', first: flip ? t.b : t.a, second: flip ? t.a : t.b, questions: t.questions.map((q) => ({ q: q.q, options: q.options })), _server: { flip, keys: t.questions.map((q) => q.key) } };
  }
  if (item.kind === 'survey') return { id: item.id, kind: 'survey', field: item.survey, _server: {} };
  if (['span', 'speed', 'switch'].includes(item.kind)) return { id: item.id, kind: item.kind, config: item.id, seed, dur: item.dur || null, forwardOnly: !!item.forwardOnly, _server: {} };
  return null;
}

// ── scoring: response -> { stat: reading } ──────────────────────────────────
const each = (item, x) => Object.fromEntries(item.informs.map((i) => [i.stat, x]));
const orient = (item, comps) => { // comps: stat -> reading toward the HIGH pole
  const out = {};
  for (const i of item.informs) if (comps[i.stat] !== undefined) out[i.stat] = comps[i.stat];
  return out;
};
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

function score(item, response, server) {
  const r = response || {};
  const out = {};
  if (item.kind === 'scale') {
    const v = Number(r.answers && r.answers[item.id]);
    const x = Math.max(-1.8, Math.min(1.8, ((v >= 1 && v <= 5 ? v : 3) - 3) / 1.1));
    for (const i of item.informs) out[i.stat] = x * i.sign;
    return out;
  }
  if (item.kind === 'forced') {
    const high = r.choice === 'high';
    for (const i of item.informs) out[i.stat] = (high ? 1 : -1) * i.sign;
    return out;
  }
  if (item.kind === 'reason') {
    const correct = Number(r.choice) === server.key;
    const x = correct ? 0.9 : -1.1;
    return each(item, x);
  }
  if (item.kind === 'span') {
    return orient(item, { working_memory_span: z(r.maxSpan, 5.5, 1.3), intake_baseline: z(r.maxSpan, 5.5, 1.3), chunk_granularity: z(r.maxSpan, 5.5, 1.3) });
  }
  if (item.kind === 'speed') {
    const v = z((r.correct - 1.5 * (r.wrong || 0)) * (60 / (item.dur || 60)), 26, 7);   // the norm is per 60 s
    return orient(item, { processing_velocity: v, intake_baseline: v, warmup_latency: -z(r.firstMs, 2200, 700) });
  }
  if (item.kind === 'switch') {
    // Rate residual (Hughes, Linck, Bowles, Koeth and Bunting 2014, Behav Res Methods, 10.3758/s13428-013-0411-5): speed and accuracy in one
    // number per condition (correct answers per second, errors' time included), and the switch rate read against the repeat rate. A plain RT
    // difference drops the errors and is the least reliable switch score there. With no population yet to fit the regression, the slope is
    // fixed at 1 in log rates: cost = log(repeat rate / switch rate). Norm ASSUMED (switch trials about 20% slower in rate, sd .18), to be
    // refitted from the app's own learners. A response without the per-condition counts (an older page) keeps the RT difference.
    const rate = (c) => (c && c.n >= 3 && c.ms > 0 ? Math.max(c.ok, 0.5) / (c.ms / 1000) : null);
    const rep = rate(r.repeat); const sw = rate(r.switch);
    if (rep && sw) {
      const cost = z(Math.log(rep / sw), 0.2, 0.18);
      return orient(item, { cognitive_flexibility: -cost, error_recovery_speed: -cost, reentry_cost: -cost, interleaving_tolerance: -cost });
    }
    const cost = z(r.costMs, 180, 90);
    return orient(item, { cognitive_flexibility: -cost - 0.3 * z(r.errorRate * 100, 8, 8), error_recovery_speed: -cost, reentry_cost: -cost, interleaving_tolerance: -cost });
  }
  if (item.kind === 'read') {
    const right = (r.answers || []).filter((a, i) => Number(a) === server.keys[i]).length;
    const n = server.keys.length || 1;
    const comp = z((right / n) * 4, 2.6, 1.1);
    const wpm = r.readMs > 0 ? (r.words / (r.readMs / 60000)) : 230;
    const rate = z(wpm, 230, 55);
    return orient(item, { vocabulary_ceiling: comp, jargon_absorption: comp, abstraction_tolerance: comp, intake_baseline: comp, processing_velocity: rate, text_density_tolerance: 0.5 * comp + 0.5 * rate });
  }
  if (item.kind === 'taste') {
    const right = (arr) => (arr || []).filter((a, i) => Number(a) === server.keys[i]).length;
    // r.recallFirst / r.recallSecond are the answers after the first and second version; r.prefer is 'first' | 'second' | 'same'
    const gap = (server.flip ? right(r.recallFirst) - right(r.recallSecond) : right(r.recallSecond) - right(r.recallFirst)) / Math.max(1, server.keys.length); // version b over version a
    const bPref = r.prefer === 'same' ? 0 : ((r.prefer === 'first') === server.flip ? 1 : -1);
    const x = clamp(0.8 * bPref + 0.5 * gap, -1.5, 1.5);   // positive = prefers / learned more from version B, the HIGH pole of every taste pair's first stat
    const res = {};
    item.informs.forEach((i, k) => { res[i.stat] = x * i.sign; });
    return res;
  }
  if (item.kind === 'survey') {
    // The interests tiles in the new onboarding (public/js/start.js): a tap picks from a list, so its length says nothing about the learner and it reads nothing. Only words they typed themselves ("Something else") are read.
    const tiles = r.tapped === true && item.survey === 'interests';
    if (tiles && !words(r.typed)) return {};
    const len = words(tiles ? r.typed : r.text);
    return each(item, clamp(len === 0 ? -0.6 : z(len, 12, 14), -1, 1.5) * 0.7);
  }
  if (item.kind === 'minilesson') return scoreMiniLesson(item, r, server);
  return out;
}

/** Choice points of the three mini-lesson parts: the choice (+1 toward the high pole of the measure) per measure. */
function scoreMiniLesson(item, r, server) {
  const pick = (name, hi) => (r.choices && r.choices[name] === hi ? 1 : r.choices && r.choices[name] !== undefined ? -1 : 0);
  const right = Number(r.answer) === server.key;
  const part = item.id.slice(-1);
  const readSec = z(r.readMs / 1000, 70, 30);
  if (part === '1') {
    const tryFirst = pick('hint', 'try');
    return orient(item, {
      conceptual_bias: pick('first', 'why'), productive_struggle: tryFirst, hint_dependency: tryFirst, help_seeking: -tryFirst * 0.6,
      planning_tendency: pick('plan', 'plan'), processing_velocity: -readSec * 0.5, intake_baseline: right ? 0.8 : -0.8,
    });
  }
  if (part === '2') {
    return orient(item, {
      depth_breadth: pick('deeper', 'deeper'), competitive_drive: pick('mode', 'challenge'), intrinsic_motivation: pick('bonus', 'bonus'),
      curiosity_hook: 0.5 * pick('bonus', 'bonus') + 0.5 * pick('deeper', 'deeper'), autonomy_preference: pick('mode', 'solo') * 0.8 + pick('order', 'own') * 0.2,
      structure_need: pick('order', 'own'),
    });
  }
  return orient(item, {
    integration_tendency: pick('connect', 'wrote'), emotional_engagement: clamp(((Number(r.feel) || 3) - 3) / 1.1, -1.5, 1.5), identity_alignment: clamp(((Number(r.mine) || 3) - 3) / 1.1, -1.5, 1.5),
    reflection_depth: pick('unclear', 'wrote'), persistence: pick('more', 'more'), failure_response: right ? 0.4 : (pick('more', 'more') > 0 ? 0.8 : -0.8),
  });
}

/** Free items: a confidence rating's calibration, from the reasoning items it was given on. */
function calibration(item, history) {
  const pair = (item.requires || []).map((id) => history[id]).filter(Boolean);
  if (!pair.length) return {};
  const err = pair.reduce((s, h) => s + (h.confidence - (h.correct ? 1 : 0)) ** 2, 0) / pair.length;
  const x = clamp(-(err - 0.25) / 0.15, -2, 2);
  return each(item, x);
}

module.exports = { present, score, calibration, content, series, deduct, rngFrom };
