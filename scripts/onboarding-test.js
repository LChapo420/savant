#!/usr/bin/env node
/**
 * The baseline modes (services/onboarding, routes/onboarding.js, scripts/onboarding-sim.js):
 *   1. the pool: every measure is read by at least one item; no validity above its method family's ceiling; every item has seconds
 *   2. the model: more answers shrink uncertainty; repeating one method cannot pass its ceiling (the persistent method error)
 *   3. the planner: the modes' time limits hold at any pace (Quick under 5 minutes at the median, p90 under 6; Balanced about 20; Accurate under 60)
 *   4. consent: an account the measurement channels are closed to is offered nothing and nothing is measured
 *   5. a whole session over the service: scored on the server, keys never sent, the scorecard updated, a retake builds on what is known
 *   6. the simulated proof (small run): each mode beats today's onboarding, and a longer mode is not less accurate than a shorter one
 *   7. the screens and the route exist and are wired; the placement modes carry the owner's new limits
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const db = require('../config/db');
const scorecard = require('../services/scorecard');
const model = require('../services/onboarding/model');
const { pool, byId } = require('../services/onboarding/pool');
const { MODES, Planner, STAT_IDS } = require('../services/onboarding/plan');
const baseline = require('../services/onboarding/baseline');
const onboarding = require('../services/onboarding');
const tasks = require('../services/onboarding/tasks');
const adaptive = require('../services/adaptive-placement');
const unitPlacement = require('../services/unit-placement');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
function check(name, fn) { try { fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 3).join('\n     ')}`); } }

const NOW = new Date();
let seq = 0;
const user = (age = 15) => db.insert('users', {
  email: `o${++seq}@t.test`, display_name: `o${seq}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true,
  age_check: { birth_ym: `${NOW.getUTCFullYear() - age}-01`, synthetic: true, ...(age < 13 ? { under_13: true, needs_parent: true } : {}) },
});

// 1. the pool
check('every one of the 100 measures is read by some item', () => {
  const read1 = new Set(); for (const it of pool) for (const i of it.informs) read1.add(i.stat);
  assert.deepStrictEqual(STAT_IDS.filter((s) => !read1.has(s)), []);
});
check('no validity is above its family ceiling, and every item has seconds and a kind', () => {
  for (const it of pool) {
    assert(it.sec > 0 && it.kind, it.id);
    for (const i of it.informs) assert(i.r > 0 && i.r <= model.RHO[it.family] && Math.abs(i.sign) === 1, `${it.id} ${i.stat}`);
  }
});
check('validities are conservative: no single item reads a measure above 0.65', () => {
  for (const it of pool) for (const i of it.informs) assert(i.r <= 0.65, `${it.id} ${i.stat} ${i.r}`);
});

// 2. the model
check('with no answers a measure is the population: sd 1, mean 0', () => {
  const p = model.posterior(model.emptyState(), 'working_memory_span');
  assert(p.sd === 1 && p.mean === 0 && p.P === 0);
});
check('more answers shrink the uncertainty, and a method cannot be repeated past its ceiling', () => {
  const s = model.emptyState(); let last = 1;
  for (let i = 0; i < 6; i++) { model.bump(s, 'conceptual_bias', 'self', 0.25, 0.5); const sd = model.posterior(s, 'conceptual_bias').sd; assert(sd < last); last = sd; }
  for (let i = 0; i < 600; i++) model.bump(s, 'conceptual_bias', 'self', 0.25, 0.5);
  const P = model.posterior(s, 'conceptual_bias').P;
  assert(Math.sqrt(P / (1 + P)) <= model.RHO.self + 0.01, `validity ${Math.sqrt(P / (1 + P))} passed the ceiling ${model.RHO.self}`);
  const t = model.emptyState(); model.bump(t, 'conceptual_bias', 'self', 0.25, 0.5); model.bump(t, 'conceptual_bias', 'ml', 0.3, 0.5);
  const one = model.emptyState(); model.bump(one, 'conceptual_bias', 'self', 0.25, 0.5); model.bump(one, 'conceptual_bias', 'self', 0.25, 0.5);
  assert(model.posterior(t, 'conceptual_bias').P > model.posterior(one, 'conceptual_bias').P, 'two methods should beat the same method twice');
});
check('the next item is the one with the most uncertainty removed per second', () => {
  const s = model.emptyState();
  const hit = model.pickNext(s, pool, { used: new Set(), secondsLeft: 3000, pace: 1 });
  const best = Math.max(...pool.filter((p) => !p.requires).map((p) => model.gainOf(s, p) / p.sec));
  assert(Math.abs(hit.perMin / 60 - best) < 1e-9);
  assert(!model.pickNext(s, pool, { used: new Set(), secondsLeft: 3, pace: 1 }), 'nothing fits in 3 seconds');
});


// 2b. correlated traits, scenarios, factor items (round 3)
check('the correlated posterior: the incremental update equals a rebuild from the stored state, and one answer moves related traits', () => {
  const st = model.emptyState();
  model.bump(st, 'working_memory_span', 'wm', model.eff('wm', 0.65), 1.4);
  model.bump(st, 'deductive_trajectory', 'reason', model.eff('reason', 0.25), 0.9);
  model.bump(st, 'F:g', 'self', model.eff('self', 0.29), 1);
  const a = model.posterior(st, 'intake_baseline');
  const clone = JSON.parse(JSON.stringify(st));   // a stored session comes back without its cache
  const b = model.posterior(clone, 'intake_baseline');
  assert(Math.abs(a.mean - b.mean) < 1e-9 && Math.abs(a.sd - b.sd) < 1e-9, JSON.stringify([a, b]));
  assert(a.mean > 0.02 && a.sd < 1, 'a measure nobody asked about should move with its correlated neighbours');
  model.setPrior(null);
  const ind = model.posterior(st, 'intake_baseline');
  model.setPrior('cogonly');
  assert(ind.mean === 0 && ind.sd === 1, 'independent traits borrow nothing');
  assert.strictEqual(model.priorLevel(), 'cogonly', 'the shipped selector assumes only the cognitive traits correlate');
});
check('the posterior is calibrated against a brute-force Gaussian update (small case)', () => {
  model.setPrior('central');
  const st = model.emptyState();
  model.bump(st, 'vocabulary_ceiling', 'read', model.eff('read', 0.5), 1.2);
  const p = model.posterior(st, 'vocabulary_ceiling'); const q = model.posterior(st, 'intake_baseline');
  const P = model.familyTerm(st.fam.vocabulary_ceiling.read, 'read').P;   // data precision on vocabulary_ceiling
  const prior = model.priorFor('central'); const names = model.NODE_IDS; const jv = names.indexOf('vocabulary_ceiling'); const ji = names.indexOf('intake_baseline'); const n = names.length;
  // one observation with variance 1/P on one node: posterior mean of node i = R[i][v] / (R[v][v] + 1/P) * d, d = the data-only reading
  const d = model.familyTerm(st.fam.vocabulary_ceiling.read, 'read').num / P;
  assert(Math.abs(p.mean - prior.R[jv * n + jv] / (1 + 1 / P) * d) < 1e-9);
  assert(Math.abs(q.mean - prior.R[ji * n + jv] / (1 + 1 / P) * d) < 1e-9);
  model.setPrior('cogonly');
});
check('validity scenarios: pessimistic is the earlier assumption, central is lower only where the check said so, optimistic is never below central', () => {
  const { SCENARIOS } = model;
  for (const f of Object.keys(SCENARIOS.central)) { assert(SCENARIOS.optimistic[f] >= SCENARIOS.central[f] - 1e-9, f); assert(SCENARIOS.pessimistic[f] === model.TODAY_RHO[f]); }
  assert(SCENARIOS.central.ml < SCENARIOS.pessimistic.ml, 'the mini-lesson ceiling was lowered by the research check');
  assert.strictEqual(model.scenario(), 'central');
  model.setScenario('optimistic'); assert(model.RHO.wm === SCENARIOS.optimistic.wm && model.eff('wm', 0.65) > 0.65); model.setScenario('central');
  for (const it of pool) for (const i of it.informs) assert(model.effIn('optimistic', it.family, i.r) <= SCENARIOS.optimistic[it.family] + 1e-9);
});
check('the factor self-ratings: two for each of the 11 factors, with words, read through the correlated posterior', () => {
  for (const F of model.FACTOR_IDS) for (const k of ['a', 'b']) {
    const it = byId[`fq:${F.slice(2)}:${k}`];
    assert(it && it.factor && it.informs.length === 1 && it.informs[0].stat === F, F);
    const shown = tasks.present(it, 3); assert(shown && shown.options.length === 2 && shown.options[0].text !== shown.options[1].text, `${F} has no words`);
  }
  const st = model.emptyState(); model.bump(st, 'F:g', 'self', model.eff('self', 0.29), 1.5);
  assert(model.posterior(st, 'working_memory_span').mean > 0, 'a self-rating of general learning speed should lift a cognitive measure');
});
check('short task versions exist, exclude their long version, and the score is per 60 seconds', () => {
  assert(byId['t:speed_q'].sec < byId['t:symbol_match'].sec && byId['t:span_fwd'].sec < byId['t:span_verbal'].sec);
  assert(byId['t:speed_q'].excludes.includes('t:symbol_match') && byId['t:span_fwd'].excludes.includes('t:span_verbal'));
  const used = new Set(['t:symbol_match', 't:span_verbal']);
  const hit = model.pickNext(model.emptyState(), pool.filter((p) => p.id === 't:speed_q' || p.id === 't:span_fwd'), { used, secondsLeft: 3000 });
  assert.strictEqual(hit, null, 'the short version is not offered after the long one');
  const half = tasks.score(byId['t:speed_q'], { correct: 13, wrong: 0, firstMs: 2000 }, {});
  const full = tasks.score(byId['t:symbol_match'], { correct: 26, wrong: 0, firstMs: 2000 }, {});
  assert(Math.abs(half.processing_velocity - full.processing_velocity) < 1e-9, 'a 30 second block is scaled to the 60 second norm');
});
check('switching is scored by rate residual (Hughes et al. 2014): speed and accuracy together, the old RT difference only for an older page', () => {
  const it = byId['t:switch_a'];
  const at = (rep, sw) => tasks.score(it, { costMs: 0, errorRate: 0, repeat: rep, switch: sw }, {}).cognitive_flexibility;
  const even = at({ n: 9, ok: 9, ms: 9000 }, { n: 10, ok: 10, ms: 10000 });            // same rate on both: no cost
  const slow = at({ n: 9, ok: 9, ms: 9000 }, { n: 10, ok: 10, ms: 12500 });            // switch trials 25% slower
  const sloppy = at({ n: 9, ok: 9, ms: 9000 }, { n: 10, ok: 8, ms: 10000 });           // as fast, but 2 switch errors
  assert(even > slow, 'slower switching reads as less flexible');
  assert(even > sloppy, 'errors on switch trials count too (the RT difference ignored them)');
  const typical = at({ n: 9, ok: 9, ms: 9000 }, { n: 10, ok: 10, ms: 10000 * Math.exp(0.2) });
  assert(Math.abs(typical) < 1e-9, 'a switch rate about 20% below the repeat rate is the assumed norm');
  const old = tasks.score(it, { costMs: 180, errorRate: 0.08 }, {}).cognitive_flexibility;
  assert(Math.abs(old) < 1e-9, 'a response without per-condition counts keeps the RT-difference score');
  const thin = tasks.score(it, { costMs: 180, errorRate: 0.08, repeat: { n: 2, ok: 2, ms: 2000 }, switch: { n: 2, ok: 2, ms: 9000 } }, {}).cognitive_flexibility;
  assert(Math.abs(thin) < 1e-9, 'fewer than 3 trials in a condition falls back too');
});
check('the trait groups follow the pool: reasoning and working memory are in the task group', () => {
  const { GROUPS } = require('../services/onboarding/groups');
  assert.strictEqual(GROUPS.a.length + GROUPS.b.length + GROUPS.c.length, 100);
  for (const id of ['working_memory_span', 'processing_velocity', 'vocabulary_ceiling', 'deductive_trajectory', 'cognitive_flexibility']) assert(GROUPS.a.includes(id), id);
  assert(GROUPS.c.includes('decay_rate'));
});
check('Quick asks a short cognitive task and a factor rating first, not only self-report pairs', () => {
  const pl = new Planner('quick'); const kinds = new Set();
  for (let g = 0; g < 60; g++) { const it = pl.next(); if (!it) break; kinds.add(it.family + (it.factor ? ':factor' : '')); const rd = {}; for (const i of it.informs) rd[i.stat] = 0.2; pl.record(it, rd, it.sec); }
  assert(kinds.has('speed') || kinds.has('wm') || kinds.has('reason'), [...kinds].join());
  assert(kinds.has('self:factor'), [...kinds].join());
});

// 3. the planner's time limits at any pace
function walk(modeId, pace, rnd) {
  const pl = new Planner(modeId);
  for (let g = 0; g < 500; g++) {
    const item = pl.next(); if (!item) break;
    const readings = {}; for (const i of item.informs) readings[i.stat] = rnd() - 0.5;
    pl.record(item, readings, item.free ? 0 : item.sec * pace * (0.8 + 0.4 * rnd()));
    for (const f of pl.unlockedFree()) pl.record(f, {}, 0);
  }
  return pl.elapsed / 60;
}
check('Quick: median under 5 minutes and p90 under 6, for learners from fast to slow', () => {
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const mins = []; for (let k = 0; k < 120; k++) mins.push(walk('quick', Math.exp(0.28 * (rnd() + rnd() + rnd() - 1.5) * 2), rnd));
  mins.sort((a, b) => a - b);
  assert(mins[60] < 5 && mins[Math.floor(0.9 * 120)] < 6 && mins[119] < 6.2, JSON.stringify([mins[60], mins[108], mins[119]]));
});
check('Balanced stays about 20 minutes and Accurate under 60, at any pace', () => {
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (const pace of [0.7, 1, 1.6]) {
    const b = walk('balanced', pace, rnd); const a = walk('accurate', pace, rnd);
    assert(b <= 20.2 && b >= 12, `balanced ${b}`); assert(a < 60 && a >= 35, `accurate ${a}`);
  }
});
check('the owner limits are in the modes: baseline 5 / 20 / 57 minutes; placement Balanced 20 and Accurate 57, Quick placement kept at 20 (5 minutes held only 90.2% within a grade, docs/ONBOARDING-MODES.md section 4)', () => {
  assert.deepStrictEqual(adaptive.WHOLE_MINUTES, { quick: 20, balanced: 20, accurate: 57 });
  assert(MODES.quick.budgetSec / 60 < 5 && MODES.balanced.budgetSec / 60 <= 20 && MODES.accurate.budgetSec / 60 < 60);
  for (const m of ['quick', 'balanced', 'accurate']) {
    const stages = adaptive.MODES[m].minutes + unitPlacement.MODES[m].minutes;
    assert(stages <= adaptive.WHOLE_MINUTES[m] + 1e-9, `${m}: stages ${stages} exceed the whole budget`);
  }
  assert.strictEqual(adaptive.MODES.quick.sure, 0.94, 'no stop gate was loosened');
});

// 4. consent
check('an account under its consent age without a parent gets nothing, and nothing is measured', () => {
  const kid = user(11);
  const m = onboarding.modes(kid);
  assert.strictEqual(m.allowed, false);
  assert.strictEqual(onboarding.start(kid, 'quick').code, 'not_allowed');
  assert.strictEqual(onboarding.answer(kid, { session: 'x', id: 'sf:a' }).code, 'not_allowed');
  assert(!db.find('profiles', (p) => p.user_id === kid.id && p.onboarding).length);
});
check('an account that has not answered the age screen is not offered it either', () => {
  const u = db.insert('users', { email: 'noage@t.test', display_name: 'n', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  assert.strictEqual(onboarding.modes(u).allowed, false);
});

// 5. a whole session
function respond(out, rnd) {
  const s = out.step;
  switch (s.kind) {
    case 'forced': return { choice: s.options[Math.floor(rnd() * 2)].k };
    case 'survey': return { text: 'I like space and basketball, and I want to get better at algebra.' };
    case 'reason': return { choice: Math.floor(rnd() * s.options.length), confidence: 3 };
    case 'read': return { answers: s.questions.map(() => 1), readMs: 40000, words: s.words };
    case 'span': return { maxSpan: 5 };
    case 'speed': return { correct: 25, wrong: 1, firstMs: 2000 };
    case 'switch': return { costMs: 200, errorRate: 0.05 };
    case 'minilesson': return { answer: 1, choices: { first: 'why', hint: 'try', plan: 'plan', deeper: 'deeper', mode: 'solo', bonus: 'bonus', order: 'own', connect: 'wrote', unclear: 'skip', more: 'more' }, feel: 4, mine: 3, readMs: 80000 };
    case 'taste': return { recallFirst: s.questions.map(() => 0), recallSecond: s.questions.map(() => 0), prefer: 'second' };
    default: throw new Error(`no responder for ${s.kind}`);
  }
}
function session(u, mode, seed) {
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let out = onboarding.start(u, mode); const kinds = []; let steps = 0;
  while (out && !out.done && steps++ < 400) {
    assert(!JSON.stringify(out).includes('"key"') && !JSON.stringify(out).includes('"keys"'), 'a key was sent to the learner');
    kinds.push(out.step.kind);
    out = onboarding.answer(u, { session: out.session, id: out.step.id, response: respond(out, rnd), ms: Math.max(1000, byId[out.step.id].sec * 1000) });
  }
  assert(out && out.done, JSON.stringify(out).slice(0, 200));
  return { out, kinds };
}
check('a Quick session runs to its end, never sends a key, and updates the scorecard', () => {
  const u = user(16);
  const before = JSON.parse(JSON.stringify(scorecard.get(u.id)));   // a snapshot: the scorecard row is updated in place
  const { out, kinds } = session(u, 'quick', 5);
  assert(out.summary.minutes <= 5.2 && out.summary.known > 0, JSON.stringify(out.summary));
  assert(kinds.includes('survey'), 'the interests question is always asked');
  const card = scorecard.get(u.id);
  const moved = STAT_IDS.filter((id) => Math.round(card.stats[id].s) !== Math.round(before.stats[id].s));
  assert(moved.length >= 1, 'the card did not move');
  assert(onboarding.get(u.id).sessions.length === 1 && !onboarding.get(u.id).active);
});
check('a retake builds on what is known: items are not repeated and the history stays', () => {
  const u = db.insert('users', { email: 'retake@t.test', display_name: 'r', password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: `${NOW.getUTCFullYear() - 17}-01`, synthetic: true } });
  const first = session(u, 'quick', 9);
  const usedFirst = new Set(onboarding.get(u.id).known.used);
  const second = session(u, 'balanced', 10);
  const g = onboarding.get(u.id);
  assert.strictEqual(g.sessions.length, 2);
  assert(g.known.used.length > usedFirst.size, 'a deeper retake asked something new');
  assert(second.out.summary.items > 0);
  assert(first.out.summary.measures_fed > 0 && g.sessions[0].id !== g.sessions[1].id);
});
check('a stale or foreign answer is refused', () => {
  const u = user(16);
  const out = onboarding.start(u, 'quick');
  assert.strictEqual(onboarding.answer(u, { session: 'nope', id: out.step.id, response: {} }).code, 'stale');
  assert.strictEqual(onboarding.answer(u, { session: out.session, id: 'sf:other', response: {} }).code, 'stale');
});
check('a measure the session never read is not fed to the scorecard', () => {
  const est = model.estimates(model.emptyState(), STAT_IDS);
  assert.strictEqual(baseline.observations(est).length, 0);
});

// 6. the simulated proof, small
check('simulated: every mode beats today\'s onboarding and a longer mode is not less accurate (40 learners)', () => {
  const out = path.join(TMP, 'sim.json');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'onboarding-sim.js'), '--learners=40', '--heldout', `--json=${out}`], { encoding: 'utf8', timeout: 280000 });
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(fs.readFileSync(out, 'utf8'));
  const q = j.modes.quick; const b = j.modes.balanced; const a = j.modes.accurate;
  assert(j.simulated === true);
  assert(q.accuracy_app_readback >= j.today.accuracy - 0.1, JSON.stringify([q.accuracy_app_readback, j.today.accuracy]));
  assert(b.accuracy_app_readback >= q.accuracy_app_readback - 0.05 && a.accuracy_app_readback >= b.accuracy_app_readback - 0.05, JSON.stringify([q.accuracy_app_readback, b.accuracy_app_readback, a.accuracy_app_readback]));
  assert(q.minutes_median < 5 && q.minutes_p90 < 6 && b.minutes_p90 <= 20.2 && a.minutes_p90 < 60);
});

// 7. wiring
check('the route, the page and the profile link exist', () => {
  assert(/app\.use\('\/api\/onboarding'/.test(read('server.js')));
  assert(fs.existsSync(path.join(ROOT, 'public', 'baseline.html')) && /baseline\.js/.test(read('public/baseline.html')));
  assert(/\/baseline\?next=\/profile/.test(read('public/js/profile.js')), 'a learner can go deeper from the profile');
  assert(/\/baseline\?next=/.test(read('public/js/auth.js')) && /oldChain/.test(read('public/js/auth.js')), 'sign-up goes to the baseline, a child to the old chain');
  assert(/boosters\.allowed/.test(read('services/onboarding/index.js')), 'the consent rule is the boosters\' own');
  assert(fs.existsSync(path.join(ROOT, 'docs', 'ONBOARDING-MODES.md')));
});
check('every item the builder keeps is well formed (only what survived the blind check is shown)', () => {
  const c = tasks.content();
  for (const [stat, items] of Object.entries(c.self || {})) for (const it of items) assert(it.high && it.low && it.high !== it.low && stat, stat);
  for (const p of c.reading || []) for (const q of p.questions) assert(q.options.length === 4 && q.key >= 0 && q.key < 4);
  for (const list of Object.values(c.reason || {})) for (const q of list) assert(q.options.length === 4 && new Set(q.options).size === 4 && q.key >= 0 && q.key < 4);
  for (const t of c.taste || []) for (const q of t.questions) assert(q.options.length === 4 && q.key >= 0 && q.key < 4);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll steps passed');
