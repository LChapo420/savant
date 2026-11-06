#!/usr/bin/env node
/**
 * Proof for the personal layer (services/lesson-layer.js): does it fit THAT learner above chance, are planted swaps caught, and did it add a fact?
 * SIMULATED extreme learners (scripts/lib/extreme-learners.js, held-out seed), BLIND AI judges of two families other than the writer. Not
 * real-learner proof.
 *
 *   node scripts/lesson-layer-proof.js --seed 6107 --n 24 --lessons 3 --tag ll1 [--db copy.json] [--run-cap 5]
 *
 * Writer: the layer's own path (services/lesson-layer.js compose, pool task part_layer, Coral DeepSeek V4.1 Flash Fast on the fast lane, the
 * deterministic gate and one revision), one layer per (learner, lesson). Lessons: shared ready lesson plans from a COPY of the database.
 * Fit trial: a judge sees ONE learner's profile and three layers for the same lesson (written for that learner and for two others, order
 * shuffled) and says which was written for that learner (chance 1 in 3). Planted swap: the same three layers with ANOTHER learner's profile
 * shown; a judge that reads the profile now picks the other layer, a judge that does not is fooled (picks the first learner's). Added fact: a
 * judge sees the lesson text and one layer and says whether the layer states any number, name or claim about the subject the lesson does not
 * give. Judges: grok-4.3 (Grokified, family grok) and GLM-5.3 Flash (ZeroGPU, family glm); the writer is DeepSeek.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const ROOT = path.join(__dirname, '..');
const ENV = process.env.DOTENV_PATH || 'C:/coding/claudecommittdIq/folderThing/.env';
Object.assign(process.env, Object.fromEntries(Object.entries(require('dotenv').parse(fs.readFileSync(ENV))).filter(([k]) => /^(ZEROGPU|GONKA|CORAL|GROKIFIED|MUNITO)_/.test(k) && !process.env[k])));
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const l of ['zerogpu', 'gonka', 'coral', 'grokified', 'munito']) process.env[`${l.toUpperCase()}_LEDGER_FILE`] = process.env[`${l.toUpperCase()}_LEDGER_FILE`] || `${LIVE}/${l}-ledger.json`;
process.env.CORAL_PIPELINE = '1'; process.env.MUNITO_PIPELINE = '1'; process.env.GONKA_PIPELINE = '1'; process.env.ZEROGPU_PIPELINE = '1'; process.env.GROKIFIED_PIPELINE = '1';
process.env.RUN_CAP_USD = process.env.RUN_CAP_USD || String(arg('run-cap', 5));
const tmpDb = path.join(os.tmpdir(), `ll-proof-${process.pid}.json`);
fs.copyFileSync(arg('db', path.join(ROOT, 'data', 'db.json')), tmpDb);
process.env.DB_FILE = tmpDb;

const SEED = Number(arg('seed', 6107)); const N = Number(arg('n', 24)); const NL = Number(arg('lessons', 3)); const TAG = arg('tag', 'll1');
const CONC = Number(arg('concurrency', 6));
const OUT = arg('out', path.join(ROOT, 'docs', 'instant-layer', `${TAG}.json`));
const X = require('./lib/extreme-learners');
const ls = require('../services/learning-spec');
const layer = require('../services/lesson-layer');
const blockLevels = require('../services/block-levels');
const db = require('../config/db');
const ai = require('../services/ai');
const pool = require('../services/pool');
const grok = require('../services/providers/grokified').grokified;
const zgpu = require('../services/providers/zerogpu').zerogpu;
const JUDGES = [{ id: 'grok-4.3', family: 'grok', prov: grok, model: 'grok-4.3' }, { id: 'zerogpu-glm', family: 'glm', prov: zgpu, model: 'z-ai/glm-5.3-flash' }];
const stats = { calls: 0, empty: 0, errors: 0 };

async function chat(who, system, user, maxTokens) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    stats.calls += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await who.prov.chat({ task: 'layer-proof', system, messages: [{ role: 'user', content: user }], maxTokens, model: who.model, timeoutMs: 120000 });
      if (r && r.text && r.text.trim()) return r.text;
      stats.empty += 1;
    } catch (err) { stats.errors += 1; if (/LEDGER|cap|402/i.test(String(err && err.message))) throw err; }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}
async function par(tasks, n) {
  const out = new Array(tasks.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const j = i; i += 1; try { out[j] = await tasks[j](); } catch (e) { out[j] = { error: e.message }; } } }));
  return out;
}
const learners = X.generate(SEED, N);
const specOf = (L, topic) => ls.buildSpecFrom({ metrics: Object.fromEntries(Object.entries(L.traits).map(([m, v]) => [m, { measured: v, confidence: 90 }])), age: L.age, esl: !!L.ell, interests: L.hobbies, dislikes: L.dislikes, topic, profileFacts: { difficulties: L.difficulties, strengths: L.strengths, worked: [], goals: [], studying: '' } });
const profileText = (L) => {
  const w = X.writerProfile(L, 10);
  return [`Age ${w.age}. Language: ${L.ell ? `English is a second language (first: ${L.language})` : 'English'}.`,
    `Interests: ${w.interests.join(', ') || 'none stated'}. Dislikes (never wanted): ${w.dislikes.join(', ') || 'none stated'}.`,
    w.pastDifficulties.length ? `Past difficulties: ${w.pastDifficulties.join('; ')}.` : '', w.strengths.length ? `Strengths: ${w.strengths.join('; ')}.` : '',
    `What suits them (from their measured scorecard, strongest first):\n${w.directives.map((d) => `- ${d.instruction}`).join('\n')}`].filter(Boolean).join('\n');
};

// Lessons: shared ready lesson plans with text and checks, spread over tracks.
const plans = db.find('block_plans', (p) => !p.user_id && p.status === 'ready' && p.kind === 'lesson' && (p.blocks || []).length >= 3 && (p.checks || []).length >= 1);
const byTrack = {}; for (const p of plans) (byTrack[p.track_id] = byTrack[p.track_id] || []).push(p);
const LESSONS = []; const tracks = Object.keys(byTrack).sort();
for (let k = 0; LESSONS.length < NL && k < 50; k += 1) { const t = tracks[k % tracks.length]; const p = byTrack[t][Math.floor(k / tracks.length) % byTrack[t].length]; if (p && !LESSONS.includes(p)) LESSONS.push(p); }
const topicOf = (p) => { try { return blockLevels.levelContext(p.track_id, p.grade_id, p.level).topic; } catch { return `${p.track_id} ${p.grade_id}`; } };

const call = (a) => pool.runForeground(() => ai.structuredDetail({ role: 'fast', task: 'part_layer', ...a, userId: null, dataClass: 'pipeline', effort: 'off' }), { fast: true });

const FIT_SYSTEM = 'You are a careful blind judge. You see the profile of ONE learner and three short personal layers (A, B, C) written to open the same lesson. Exactly one was written for a learner like this one; the others for different learners. Decide which fits THIS learner best: their interests, what they dislike, their age, how they read (plain words, short sentences) and the tone that suits them. Think briefly, then end with a final line exactly "ANSWER: A", "ANSWER: B" or "ANSWER: C".';
const FACT_SYSTEM = 'You are a strict fact checker. You see the text of a lesson and a short personal layer written to go over it (a hook, a reason it matters, analogies). The layer may NOT add any number, name, definition or claim about the SUBJECT that the lesson text does not give; comparisons to the learner\'s own interests are allowed as long as they do not assert new facts about the subject. Decide whether the layer adds one. Think briefly, then end with a final line exactly "ADDS FACT: YES" or "ADDS FACT: NO", and before it, if YES, quote the words.';
const layerText = (l) => [l.hook, l.why, ...(l.analogies || []).map((a) => `${a.point}: ${a.text}`)].filter(Boolean).join('\n');

(async () => {
  const t0 = Date.now();
  console.log(`learners ${learners.length}, lessons ${LESSONS.map((p) => `${p.track_id}/${p.grade_id}/${p.level}`).join(', ')}`);
  // 1. write every layer through the real path
  const cells = [];
  for (const p of LESSONS) for (const L of learners) cells.push({ p, L });
  await par(cells.map((c) => async () => {
    const topic = topicOf(c.p); const spec = specOf(c.L, topic); const source = layer.sourceOf(c.p, topic);
    const t = Date.now();
    const r = await layer.compose({ spec, source, plan: c.p, call });
    c.ms = Date.now() - t; c.first = r.first; c.problems = r.problems; c.model = r.got && r.got.model; c.layer = r.problems.length ? null : r.got && r.got.layer; c.source = source; c.spec = spec;
    c.state = c.layer ? (r.first.length ? 'revised' : 'first') : 'failed';
  }), CONC);
  const done = cells.filter((c) => c.layer);
  const ms = cells.map((c) => c.ms).sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const write = { cells: cells.length, first_draft_passed: cells.filter((c) => c.state === 'first').length, passed_after_revision: cells.filter((c) => c.state === 'revised').length, failed: cells.filter((c) => c.state === 'failed').length, ms_p50: q(ms, 0.5), ms_p90: q(ms, 0.9), ms_max: ms[ms.length - 1], within_8s: cells.filter((c) => c.layer && c.ms <= 8000).length, models: {}, failed_because: {} };
  for (const c of cells) { if (c.model) write.models[c.model] = (write.models[c.model] || 0) + 1; if (c.state === 'failed') for (const p of (c.problems || []).slice(0, 2)) { const k = String(p).replace(/\d+/g, 'N').slice(0, 60); write.failed_because[k] = (write.failed_because[k] || 0) + 1; } }
  console.log('write', JSON.stringify(write));
  // 2. fit + planted swap
  const trials = [];
  const jobs = [];
  for (const p of LESSONS) {
    const here = cells.filter((c) => c.p === p && c.layer);
    for (let i = 0; i < here.length; i += 1) {
      const a = here[i]; const m = here[(i + 1) % here.length]; const z = here[(i + 2 + Math.floor(here.length / 3)) % here.length];
      if (new Set([a.L.id, m.L.id, z.L.id]).size < 3) continue;
      const order = [a, m, z].map((c, ix) => ({ c, key: X.hash('ord', a.L.id, p.id, ix) })).sort((x, y) => x.key - y.key).map((x) => x.c);
      const letter = (c) => 'ABC'[order.indexOf(c)];
      for (const j of JUDGES) for (const cond of ['real', 'swap']) {
        const shown = cond === 'real' ? a.L : m.L;
        jobs.push(async () => {
          const user = `Lesson: ${topicOf(p)}\n\nLEARNER PROFILE\n${profileText(shown)}\n\n${order.map((c, ix) => `=== LAYER ${'ABC'[ix]} ===\n${layerText(c.layer)}`).join('\n\n')}\n\nWhich layer was written for this learner?`;
          const text = await chat(j, FIT_SYSTEM, user, 6000);
          const mm = String(text || '').match(/ANSWER:\s*([ABC])\b/gi);
          const v = mm ? mm[mm.length - 1].slice(-1).toUpperCase() : 'empty';
          trials.push({ lesson: p.id, kind: a.L.kind, L: a.L.id, cond, judge: j.id, family: j.family, verdict: v, picked_owner: v === 'empty' ? null : order['ABC'.indexOf(v)].L.id, shown: shown.id, owner_of_key: shown.id });
        });
      }
    }
  }
  await par(jobs, CONC);
  // 3. added fact
  const factJobs = []; const facts = [];
  for (const c of done) for (const j of JUDGES) factJobs.push(async () => {
    const text = await chat(j, FACT_SYSTEM, `LESSON TEXT:\n${c.source.text.slice(0, 5000)}\n\nPERSONAL LAYER:\n${layerText(c.layer)}`, 6000);
    const mm = String(text || '').match(/ADDS FACT:\s*(YES|NO)/gi);
    facts.push({ L: c.L.id, kind: c.L.kind, judge: j.id, adds: mm ? mm[mm.length - 1].toUpperCase().includes('YES') : null, why: /YES/i.test(String(mm && mm[mm.length - 1])) ? String(text).slice(-300) : null, layer: layerText(c.layer) });
  });
  await par(factJobs, CONC);
  // 4. summary
  const rate = (a) => (a.length ? Number((a.filter(Boolean).length / a.length).toFixed(3)) : null);
  const summary = { tag: TAG, seed: SEED, learners: N, lessons: LESSONS.length, write, judges: {}, byKind: {}, stats, wallSec: Math.round((Date.now() - t0) / 1000), note: 'SIMULATED learners, AI judges: not real-learner proof' };
  for (const j of JUDGES) {
    const jr = trials.filter((t) => t.judge === j.id && t.verdict !== 'empty');
    const real = jr.filter((t) => t.cond === 'real'); const swap = jr.filter((t) => t.cond === 'swap');
    const fj = facts.filter((f) => f.judge === j.id && f.adds !== null);
    summary.judges[j.id] = { family: j.family, real_n: real.length, real_correct: rate(real.map((t) => t.picked_owner === t.L)), swap_n: swap.length, swap_picks_shown_learners_layer: rate(swap.map((t) => t.picked_owner === t.shown)), swap_fooled_picks_first_learners_layer: rate(swap.map((t) => t.picked_owner === t.L)), chance: 0.333, fact_n: fj.length, layers_judged_to_add_a_fact: rate(fj.map((f) => f.adds)), empty: trials.filter((t) => t.judge === j.id && t.verdict === 'empty').length };
  }
  for (const k of [...new Set(trials.map((t) => t.kind))]) { const r = trials.filter((t) => t.kind === k && t.cond === 'real' && t.verdict !== 'empty'); summary.byKind[k] = { n: r.length, correct: rate(r.map((t) => t.picked_owner === t.L)) }; }
  // per learner worst: share of its real trials the judges got right, over learners (an individual whose layer no judge could pick out)
  const per = {}; for (const t of trials.filter((x) => x.cond === 'real' && x.verdict !== 'empty')) (per[t.L] = per[t.L] || []).push(t.picked_owner === t.L);
  const shares = Object.values(per).map((a) => a.filter(Boolean).length / a.length).sort((a, b) => a - b);
  summary.perLearner = { n: shares.length, worst1pct: shares[0], worst5pct: shares[Math.floor(shares.length * 0.05)], worst10pct: shares[Math.floor(shares.length * 0.1)], never_picked_out: shares.filter((s) => s === 0).length };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ summary, trials, facts: facts.map((f) => ({ ...f })), samples: done.slice(0, 12).map((c) => ({ L: c.L.id, kind: c.L.kind, interests: c.L.hobbies, ell: c.L.ell, layer: c.layer })) }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  try { fs.unlinkSync(tmpDb); } catch { /* temp */ }
  process.exit(0);
})();
