#!/usr/bin/env node
/**
 * Proof for the part modifier (services/part-modify.js): does each wired part change in the direction of the learner it is shown to?
 * SIMULATED extreme learners (scripts/lib/extreme-learners.js, held-out seed), BLIND AI judges. Not real-learner proof.
 *
 *   node scripts/part-modify-proof.js --seed 6106 --n 30 --parts feedback,hint,review,lesson,tutor --tag pm1
 *   node scripts/part-modify-proof.js --render docs/part-modify/pm1.json      (prints the section for docs/MODIFICATION-AUDIT.md)
 *
 * Per learner L (and a partner M, the next learner in the draw) and per stored source text S of a part:
 *   V_L = S rewritten by the part modifier for L's spec, V_M = S rewritten for M's spec, STORED = S as everyone saw it before.
 * A judge sees L's profile (as scorecard directives, interests, dislikes, age, language: NOT the spec's rules) and two texts in random order and
 * says which was written for that learner. Arms: L-vs-stored, L-vs-M. Conditions: real (key V_L), planted swap (M's profile shown to the judge
 * with the same texts; the key is V_M, so a judge that does not read the profile is fooled), control (a third learner's profile; no key; share
 * picking V_L reported: it should sit near half). Judges: ZeroGPU GLM-5.3 Flash, Coral DeepSeek V4.1 Flash, Gonka DeepSeek V4 Flash. The writer is
 * ZeroGPU GLM-5.3 Flash (so the two DeepSeek judges are another family than the writer; the GLM judge shares it and is reported on its own). Judge replies get 6000 output tokens and one retry on an empty reply; an empty reply is counted, never a verdict.
 * Facts: every rewrite goes through the part's own check (numbers kept and none added, answer kept or not given, no profile talk, no avoided
 * domain) and a judge asks whether stored and rewritten state the same facts; lesson text also goes through checkFollowed's key-fact coverage.
 *
 * The tutor part: temp database, one synthetic account per learner, the real teachingBrief + tutor context (ai.coachSystemFor) with the same
 * question and message; the replies for L and M are compared the same way. A retention-goal twin (same learner, test in 10 days or not) too.
 *
 * Money: ZeroGPU, Gonka and Coral through their own ledgers (env *_LEDGER_FILE set to the live ones), RUN_CAP_USD (default 5).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.ZEROGPU_PIPELINE = '1'; process.env.GONKA_PIPELINE = '1'; process.env.CORAL_PIPELINE = '1'; process.env.MUNITO_PIPELINE = '1';
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const eq = argv.find((a) => a.startsWith(`--${n}=`)); if (eq) return eq.slice(n.length + 3); const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : (i >= 0 ? true : d); };
const ROOT = path.join(__dirname, '..');

if (arg('render')) { render(arg('render')); return; } // eslint-disable-line no-useless-return

const ENV = process.env.DOTENV_PATH || 'C:/coding/claudecommittdIq/folderThing/.env';
Object.assign(process.env, Object.fromEntries(Object.entries(require('dotenv').parse(fs.readFileSync(ENV))).filter(([k]) => /^(ZEROGPU|GONKA|CORAL)_/.test(k) && !process.env[k])));
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
process.env.ZEROGPU_LEDGER_FILE = process.env.ZEROGPU_LEDGER_FILE || `${LIVE}/zerogpu-ledger.json`;
process.env.GONKA_LEDGER_FILE = process.env.GONKA_LEDGER_FILE || `${LIVE}/gonka-ledger.json`;
process.env.CORAL_LEDGER_FILE = process.env.CORAL_LEDGER_FILE || `${LIVE}/coral-ledger.json`;
process.env.RUN_CAP_USD = process.env.RUN_CAP_USD || String(arg('run-cap', 5));

const SEED = Number(arg('seed', 6106));
const N = Number(arg('n', 30));
const ITEMS = Number(arg('items', 2));
const PARTS = String(arg('parts', 'feedback,hint,review,lesson,tutor')).split(',').filter(Boolean);
const TAG = String(arg('tag', 'pm1'));
const CONC = Number(arg('concurrency', 6));
const MOCK = !!arg('mock');
const OUT = String(arg('out', path.join(ROOT, 'docs', 'part-modify', `${TAG}.json`)));
const CACHE_FILE = String(arg('cache', path.join(ROOT, 'docs', 'part-modify', `${TAG}-cache.json`)));

const X = require('./lib/extreme-learners');
const ls = require('../services/learning-spec');
const pm = require('../services/part-modify');

// ── models ──────────────────────────────────────────────────────────────────
const gonka = require('../services/providers/gonka').gonka;
const zerogpu = require('../services/providers/zerogpu').zerogpu;
const coral = require('../services/providers/coral').coral;
const WRITER = { prov: zerogpu, model: 'z-ai/glm-5.3-flash', name: 'ZeroGPU GLM-5.3 Flash' };
const JUDGES = [
  { id: 'zerogpu-glm', family: 'glm', prov: zerogpu, model: 'z-ai/glm-5.3-flash' },
  { id: 'coral-deepseek', family: 'deepseek', prov: coral, model: 'deepseek-v4.1-flash' },
  { id: 'gonka-deepseek', family: 'deepseek', prov: gonka, model: 'deepseek-ai/DeepSeek-V4-Flash-0731' },
];

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { cache = {}; }
let dirty = 0;
const saveCache = () => { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); dirty = 0; };
const sha = (s) => require('crypto').createHash('sha1').update(String(s)).digest('hex').slice(0, 14);
const stats = { calls: 0, empty: 0, errors: 0 };

async function chat(who, system, user, maxTokens, key) {
  const k = key ? `${who.model}:${sha(system + user + maxTokens)}` : null;
  if (k && cache[k] !== undefined) return cache[k];
  if (MOCK) return null;
  let last = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    stats.calls += 1;
    if (stats.calls % 100 === 0) console.log(`  ... ${stats.calls} calls, ${stats.empty} empty, ${stats.errors} errors`);
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await who.prov.chat({ task: 'part-modify-proof', system, messages: [{ role: 'user', content: user }], maxTokens, model: who.model, timeoutMs: 120000 });
      if (r && r.text && r.text.trim()) { if (k) { cache[k] = r.text; dirty += 1; if (dirty >= 25) saveCache(); } return r.text; }
      stats.empty += 1;
    } catch (err) { last = err; stats.errors += 1; if (/LEDGER|cap|402/i.test(String(err && err.message))) throw err; }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (last) console.warn(`  call failed (${who.model}): ${String(last.message).slice(0, 90)}`);
  return null;
}

function jsonOf(text) {
  if (!text) return null;
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
const writerLlm = (who = WRITER) => async ({ system, user, maxTokens }) => jsonOf(await chat(who, `${system}\nReply with JSON only.`, user, Math.max(maxTokens || 800, 3000), true));

// ── pool of limited concurrency ─────────────────────────────────────────────
async function pool(tasks, n) {
  const out = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const j = i; i += 1; try { out[j] = await tasks[j](); } catch (e) { out[j] = { error: e.message }; } } }));
  return out;
}

// ── learners, specs, sources ────────────────────────────────────────────────
const learners = X.generate(SEED, N);
const specOf = (L, topic = 'the topic') => ls.buildSpecFrom({ metrics: Object.fromEntries(Object.entries(L.traits).map(([m, v]) => [m, { measured: v, confidence: 90 }])), age: L.age, esl: !!L.ell, interests: L.hobbies, dislikes: L.dislikes, topic, profileFacts: { difficulties: L.difficulties, strengths: L.strengths, worked: [], goals: [], studying: '' } });
const profileText = (L) => {
  const w = X.writerProfile(L, 10);
  return [`Age ${w.age}. Language: ${L.ell ? `English is a second language (first: ${L.language})` : 'English'}.`,
    `Interests: ${w.interests.join(', ') || 'none stated'}. Dislikes (never wanted): ${w.dislikes.join(', ') || 'none stated'}.`,
    w.pastDifficulties.length ? `Past difficulties: ${w.pastDifficulties.join('; ')}.` : '', w.strengths.length ? `Strengths: ${w.strengths.join('; ')}.` : '',
    `What suits them (from their measured scorecard, strongest first):\n${w.directives.map((d) => `- ${d.instruction}`).join('\n')}`].filter(Boolean).join('\n');
};

const itemFiles = fs.readdirSync(path.join(ROOT, 'content', 'objective-items')).filter((f) => /^(math|english)\./.test(f));
const POOL = itemFiles.flatMap((f) => (require(path.join(ROOT, 'content', 'objective-items', f)).items || []).filter((i) => i.kept !== false && i.format === 'multiple_choice' && String(i.rationale || '').length >= 30 && (i.choices || []).length >= 3));
const pick = (L, k) => POOL[X.hash('src', L.id, k) % POOL.length];

const REVIEW_STORED = 'Recalling it now is what moves it into next week.';
const LESSON = {
  title: 'How plants make food',
  paragraphs: [
    'Plants make their own food in a process called photosynthesis. It happens mostly in the leaves, inside tiny parts called chloroplasts that hold a green pigment called chlorophyll.',
    'The plant takes in carbon dioxide from the air through small openings called stomata, and water from the soil through its roots. Sunlight gives the energy that joins them.',
    'The result is glucose, a sugar the plant uses for energy and growth, and oxygen, which is released into the air. About 6 molecules of carbon dioxide and 6 of water make 1 molecule of glucose.',
  ],
  key_points: ['Photosynthesis happens in chloroplasts, using chlorophyll.', 'Plants take in carbon dioxide and water and use light energy.', 'The products are glucose and oxygen.'],
};

// ── judges ──────────────────────────────────────────────────────────────────
const JUDGE_SYSTEM = 'You are a careful blind judge. You are shown the profile of ONE learner and two versions (A and B) of the same learner-facing text. Decide which version was written for THIS learner: the one whose length, wording, tone, level of detail and examples fit the profile, and which avoids what the learner dislikes. Ignore which is better written in general. Think briefly, then give your answer on the LAST line as exactly "ANSWER: A", "ANSWER: B" or "ANSWER: SAME" (SAME only if you truly cannot tell).';
async function judge(j, profile, a, b, what) {
  const user = `What the text is: ${what}\n\nLEARNER PROFILE\n${profile}\n\n=== VERSION A ===\n${a}\n\n=== VERSION B ===\n${b}\n\nWhich version was written for this learner?`;
  const text = await chat(j, JUDGE_SYSTEM, user, 6000, true);
  if (!text) return 'empty';
  const m = String(text).match(/ANSWER:\s*(A|B|SAME)\b/gi);
  if (!m) return 'empty';
  return m[m.length - 1].replace(/ANSWER:\s*/i, '').toUpperCase();
}
const SAMEFACTS_SYSTEM = 'You compare two texts about the same question. Say whether they state the same facts, the same answer and the same numbers (wording, length and tone may differ; extra friendly words are fine). Reply with the last line exactly "SAME FACTS: YES" or "SAME FACTS: NO" (NO if the second adds, drops or changes a fact, number or the answer).';
async function sameFacts(j, a, b) {
  const text = await chat(j, SAMEFACTS_SYSTEM, `TEXT 1:\n${a}\n\nTEXT 2:\n${b}`, 4000, true);
  const m = String(text || '').match(/SAME FACTS:\s*(YES|NO)/gi);
  return m ? m[m.length - 1].toUpperCase().includes('YES') : null;
}

// ── the rewrites per part ───────────────────────────────────────────────────
const wordsDiff = (a, b) => {
  const wa = String(a).split(/\s+/); const wb = new Set(String(b).split(/\s+/).map((w) => w.toLowerCase()));
  return { stored_words: wa.length, shaped_words: String(b).split(/\s+/).length, new_words: String(b).split(/\s+/).filter((w) => !new Set(wa.map((x) => x.toLowerCase())).has(w.toLowerCase())).length, dropped_words: wa.filter((w) => !wb.has(w.toLowerCase())).length };
};

/** The versions of one source for learner L's spec; the source (item) is owner's: the same text for every learner it is compared with. */
async function versionsFor(part, L, k, owner = L) {
  const spec = specOf(L, part === 'lesson' ? LESSON.title : 'the topic');
  if (part === 'lesson') {
    const paras = await pm.rewriteLesson({ spec, skill: { title: LESSON.title, lesson: { paragraphs: LESSON.paragraphs, key_points: LESSON.key_points } }, llm: writerLlm() });
    return { stored: LESSON.paragraphs.join('\n\n'), shaped: paras ? paras.join('\n\n') : null, source: { prompt: LESSON.title }, spec };
  }
  const it = pick(owner, k);
  const base = { prompt: it.prompt, choices: part === 'review' ? null : it.choices, answer: it.answer };
  let text = part === 'review' ? REVIEW_STORED : it.rationale;
  if (part === 'hint') {
    // The stored hint: one neutral hint per item, written once (no profile), as the item bank would hold it.
    const t = await chat(WRITER, 'You write one neutral hint (at most two sentences) for a check question. Never state the answer. Plain text only.', `Question: ${it.prompt}\nChoices: ${(it.choices || []).join(' | ')}\nCorrect answer: ${it.answer}`, 2000, true);
    text = (t || '').trim();
    if (!text) return { stored: null, shaped: null, source: base, spec };
  }
  const src = { ...base, text };
  const r = await pm.modify({ spec, part, source: src, llm: writerLlm() });
  return { stored: text, shaped: r.source === 'ai' ? r.text : null, problems: r.problems, source: src, spec, item_id: it.id };
}
const WHAT = { feedback: 'the explanation shown right after the learner answers a check question', hint: 'the hint shown when the learner asks for help on a check question', review: 'one line shown with a review question', lesson: 'the lesson text of a course built from their own study material', tutor: 'the tutor reply to the learner' };

// ── the trial grid for one part ─────────────────────────────────────────────
async function runPart(part) {
  const nSrc = part === 'lesson' || part === 'review' ? 1 : ITEMS;
  const rows = [];
  const jobs = [];
  for (let i = 0; i < learners.length; i += 1) {
    for (let k = 0; k < nSrc; k += 1) jobs.push(async () => {
      const L = learners[i]; const M = learners[(i + 1) % learners.length]; const Z = learners[(i + 7) % learners.length];
      const vl = await versionsFor(part, L, k);
      const same = await versionsFor(part, M, k, L);
      rows.push({ i, k, L: L.id, M: M.id, Z: Z.id, kind: L.kind, stored: vl.stored, vL: vl.shaped, vM: same.shaped, problemsL: vl.problems || [], profL: profileText(L), profM: profileText(M), profZ: profileText(Z), diff: vl.shaped ? wordsDiff(vl.stored, vl.shaped) : null, source: vl.source });
    });
  }
  await pool(jobs, CONC);
  saveCache();
  return rows;
}

async function judgeRows(part, rows) {
  const trials = [];
  const jobs = [];
  for (const r of rows) {
    if (!r.vL) continue; // the modifier declined (no rule, or the check failed): the stored text stays, nothing to judge
    for (const [arm, other] of [['vs_stored', r.stored], ['vs_other', r.vM]]) {
      if (!other) continue;
      for (const j of JUDGES) {
        for (const cond of ['real', 'swap', 'control']) {
          const flip = X.hash('pos', r.L, r.k, arm, cond, j.id) % 2 === 0; // which side holds V_L
          const A = flip ? r.vL : other; const B = flip ? other : r.vL;
          const prof = cond === 'real' ? r.profL : cond === 'swap' ? r.profM : r.profZ;
          jobs.push(async () => {
            if (arm === 'vs_stored' && cond !== 'real') return; // the planted swap and the control run on the learner-vs-learner arm only
            const v = await judge(j, prof, A, B, WHAT[part]);
            const pickedL = v === 'A' ? flip : v === 'B' ? !flip : null;
            trials.push({ part, i: r.i, k: r.k, L: r.L, kind: r.kind, arm, cond, judge: j.id, family: j.family, verdict: v, picked_vL: pickedL });
          });
        }
      }
    }
  }
  await pool(jobs, CONC);
  saveCache();
  return trials;
}

async function factsFor(part, rows) {
  const out = { checked: 0, passed: 0, declined: 0, same_yes: 0, same_asked: 0, coverage_fail: 0 };
  const jobs = [];
  for (const r of rows) {
    out.checked += 1;
    if (!r.vL) { out.declined += 1; continue; }
    out.passed += 1;
    if (part === 'lesson') {
      const c = ls.checkFollowed(r.vL, specOf(learners[r.i], LESSON.title), { keyFacts: LESSON.key_points, minShare: 0.3, own: true, interestNeed: 0 });
      if (c.problems.some((p) => p.id === 'coverage')) out.coverage_fail += 1;
    }
    if (part !== 'tutor' && r.i % 3 === 0) jobs.push(async () => { const v = await sameFacts(JUDGES[0], r.stored, r.vL); if (v !== null) { out.same_asked += 1; if (v) out.same_yes += 1; } });
  }
  await pool(jobs, CONC);
  return out;
}

// ── the tutor (temp database, real prompt pieces) ───────────────────────────
async function runTutor() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-tutor-'));
  process.env.DB_FILE = path.join(tmp, 'db.json');
  const db = require('../config/db');
  const learner = require('../services/learner');
  const scorecard = require('../services/scorecard');
  const ai = require('../services/ai');
  const now = new Date();
  const mk = (L, extra = {}) => {
    const ym = `${now.getUTCFullYear() - L.age}-01`;
    const user = db.insert('users', { email: `pm-${L.id}-${Object.keys(extra).join('')}@example.test`, display_name: L.id, password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: ym } });
    learner.saveProfile(user.id, { survey: learner.cleanSurvey({ interests: L.hobbies.join(', '), notes: `${L.dislikes.map((d) => `I hate ${d}.`).join(' ')}${L.ell ? ' English is not my first language.' : ''}` }), subscription: 'pro' });
    const card = scorecard.get(user.id);
    for (const [id, score] of Object.entries(L.traits)) card.stats[id] = { ...card.stats[id], s: score, m: score, w: 8, mw: 8, n: 40, evv: 40, evx: 40, evk: 'value' };
    db.update('scorecards', card.id, { stats: card.stats });
    return user;
  };
  const ITEM = { skill_id: 'add_sub', skill_name: 'Volume of prisms', level: 20, prompt: 'A rectangular prism is 3 unit cubes long, 2 wide and 4 high. What is its volume?', choices: ['9 cubic units', '10 cubic units', '20 cubic units', '24 cubic units'], answer: '24 cubic units', rationale: '3 x 2 x 4 = 24', format: 'multiple_choice', track_id: 'math', grade_id: 'volume_coordinates_and_expressions' };
  const MESSAGE = 'I am stuck on this one. I do not get how to start.';
  const reply = async (user) => {
    const system = ai.coachSystemFor(user.id, ITEM);
    return chat(WRITER, system, MESSAGE, 2500, true);
  };
  const T = learners.slice(0, Math.min(learners.length, Number(arg('tutor-n', 20))));
  const users = T.map((L) => mk(L));
  const replies = await pool(users.map((u) => () => reply(u)), CONC);
  const rows = T.map((L, i) => {
    const j = (i + 1) % T.length;
    return { i, k: 0, L: L.id, M: T[j].id, Z: T[(i + 7) % T.length].id, kind: L.kind, stored: null, vL: replies[i], vM: replies[j], profL: profileText(L), profM: profileText(T[j]), profZ: profileText(T[(i + 7) % T.length]), diff: null, problemsL: [] };
  });
  // The retention-goal twin: the same learner with a test in 10 days against none.
  const rg = require('../services/retention-goal');
  const goalRows = [];
  for (const L of T.slice(0, Math.min(T.length, 12))) {
    const u = mk(L, { goal: 1 });
    const enr = db.insert('enrollments', { user_id: u.id, track_id: 'math', grade_id: 'volume_coordinates_and_expressions', status: 'active', current_level: 20 });
    const day = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    db.update('enrollments', enr.id, { retention_goal: { horizon: 'date', test_date: day, set_on: new Date().toISOString().slice(0, 10) } });
    void rg;
    goalRows.push({ L: L.id, plain: replies[T.indexOf(L)], goal: await reply(u) });
  }
  return { rows, goalRows };
}

async function judgeGoal(goalRows) {
  const trials = [];
  const GOAL_SYSTEM = 'You are a careful blind judge. Two tutor replies (A and B) answer the same learner message. One was written for a learner who has a test in 10 days and wants to remember this for it; the other for a learner with no deadline. Say which version was written for the learner with the test in 10 days. Think briefly, then give your answer on the LAST line as exactly "ANSWER: A", "ANSWER: B" or "ANSWER: SAME".';
  const jobs = [];
  for (const g of goalRows) {
    if (!g.plain || !g.goal) continue;
    for (const j of JUDGES) jobs.push(async () => {
      const flip = X.hash('goal', g.L, j.id) % 2 === 0;
      const A = flip ? g.goal : g.plain; const B = flip ? g.plain : g.goal;
      const text = await chat(j, GOAL_SYSTEM, `=== VERSION A ===\n${A}\n\n=== VERSION B ===\n${B}`, 6000, true);
      const m = String(text || '').match(/ANSWER:\s*(A|B|SAME)\b/gi);
      const v = m ? m[m.length - 1].replace(/ANSWER:\s*/i, '').toUpperCase() : 'empty';
      trials.push({ part: 'tutor_goal', L: g.L, judge: j.id, family: j.family, arm: 'goal_vs_none', cond: 'real', verdict: v, picked_vL: v === 'A' ? flip : v === 'B' ? !flip : null });
    });
  }
  await pool(jobs, CONC);
  saveCache();
  return trials;
}

// ── aggregate ───────────────────────────────────────────────────────────────
const rate = (xs) => { const d = xs.filter((t) => t.picked_vL !== null); return { n: xs.length, verdicts: d.length, empty: xs.filter((t) => t.verdict === 'empty').length, same: xs.filter((t) => t.verdict === 'SAME').length, picks_vL: d.filter((t) => t.picked_vL).length, share: d.length ? d.filter((t) => t.picked_vL).length / d.length : null }; };
function binomP(k, n) { // two-sided-ish: P(X >= k) for X ~ Bin(n, .5), one-sided above chance
  if (!n) return null; let p = 0; const lg = (x) => { let s = 0; for (let i = 2; i <= x; i += 1) s += Math.log(i); return s; };
  for (let i = k; i <= n; i += 1) p += Math.exp(lg(n) - lg(i) - lg(n - i) - n * Math.log(2));
  return p;
}
function summarize(part, trials) {
  const out = { part, arms: {} };
  for (const arm of ['vs_stored', 'vs_other', 'goal_vs_none']) {
    const T = trials.filter((t) => t.arm === arm);
    if (!T.length) continue;
    const real = rate(T.filter((t) => t.cond === 'real'));
    const swap = rate(T.filter((t) => t.cond === 'swap'));
    const control = rate(T.filter((t) => t.cond === 'control'));
    real.p_above_chance = binomP(real.picks_vL, real.verdicts);
    // a planted swap is fooled when the judge picks V_L although M's profile was shown
    const per = {};
    for (const j of [...new Set(T.map((t) => t.judge))]) per[j] = { real: rate(T.filter((t) => t.cond === 'real' && t.judge === j)).share, swap_fooled: rate(T.filter((t) => t.cond === 'swap' && t.judge === j)).share, control: rate(T.filter((t) => t.cond === 'control' && t.judge === j)).share };
    // per individual: the share of an individual's real verdicts that picked their own version
    const byL = {};
    for (const t of T.filter((x) => x.cond === 'real' && x.picked_vL !== null)) { (byL[t.L] = byL[t.L] || []).push(t.picked_vL ? 1 : 0); }
    const ind = Object.entries(byL).map(([L, v]) => ({ L, share: v.reduce((a, b) => a + b, 0) / v.length, n: v.length })).sort((a, b) => a.share - b.share);
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b.share, 0) / xs.length : null);
    const worst = (f) => mean(ind.slice(0, Math.max(1, Math.ceil(ind.length * f))));
    // by kind
    const kinds = {};
    for (const t of T.filter((x) => x.cond === 'real' && x.picked_vL !== null)) { const k = t.kind || 'x'; (kinds[k] = kinds[k] || []).push(t.picked_vL ? 1 : 0); }
    out.arms[arm] = {
      real, swap_fooled: swap, control_picks_vL: control, per_judge: per,
      by_family: Object.fromEntries(['glm', 'deepseek'].map((f) => [f, rate(T.filter((t) => t.cond === 'real' && t.family === f)).share])),
      individuals: { n: ind.length, worst_1pct: worst(0.01), worst_5pct: worst(0.05), worst_10pct: worst(0.1), lowest: ind.slice(0, 3), below_half: ind.filter((x) => x.share < 0.5).length },
      by_kind: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { n: v.length, share: v.reduce((a, b) => a + b, 0) / v.length }])),
    };
  }
  return out;
}

async function main() {
  const t0 = Date.now();
  console.log(`part-modify proof: seed ${SEED}, ${N} learners, parts ${PARTS.join(',')}, writer ${WRITER.name}, judges ${JUDGES.map((j) => j.id).join(' + ')}${MOCK ? ' (MOCK: no model calls)' : ''}`);
  const result = { tag: TAG, seed: SEED, n: N, generated_at: new Date().toISOString(), writer: WRITER.name, judges: JUDGES.map((j) => ({ id: j.id, model: j.model, family: j.family })), simulated: true, parts: {}, samples: {} };
  for (const part of PARTS) {
    console.log(`part ${part}...`);
    let rows; let trials; let goalTrials = [];
    if (part === 'tutor') {
      const t = await runTutor();
      rows = t.rows; trials = await judgeRows('tutor', rows); goalTrials = await judgeGoal(t.goalRows);
      result.samples.tutor_goal = t.goalRows.slice(0, 2);
    } else { rows = await runPart(part); trials = await judgeRows(part, rows); }
    const facts = await factsFor(part, rows);
    result.parts[part] = { ...summarize(part, trials), facts, goal: goalTrials.length ? summarize('tutor_goal', goalTrials) : null, sources: rows.length, declined: rows.filter((r) => !r.vL).length };
    result.samples[part] = rows.filter((r) => r.vL).slice(0, 4).map((r) => ({ learner: r.L, kind: r.kind, profile: r.profL.split('\n').slice(0, 2).join(' '), stored: r.stored, shaped: r.vL, other_learner: r.vM, diff: r.diff }));
    result.parts[part].trials = trials.length;
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
    const a = result.parts[part].arms.vs_other || result.parts[part].arms.vs_stored;
    if (a) console.log(`  ${part}: vs_stored ${((result.parts[part].arms.vs_stored || {}).real || {}).share}, vs_other ${((result.parts[part].arms.vs_other || {}).real || {}).share}, facts ${JSON.stringify(facts)}`);
  }
  result.stats = { ...stats, seconds: Math.round((Date.now() - t0) / 1000), cpu_load: os.loadavg()[0] };
  for (const [name, ledger] of [['zerogpu', '../services/zerogpu-ledger'], ['gonka', '../services/gonka-ledger'], ['coral', '../services/coral-ledger']]) { try { result.stats[`${name}_ledger`] = require(ledger).status(); } catch { /* none */ } }
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  saveCache();
  console.log(`done in ${result.stats.seconds}s; calls ${stats.calls}, empty ${stats.empty}, errors ${stats.errors}; wrote ${OUT}`);
  process.exit(0);
}

function render(file) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pct = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
  const lines = [];
  for (const [part, p] of Object.entries(r.parts)) {
    for (const [arm, a] of Object.entries(p.arms)) {
      lines.push(`| ${part} | ${arm} | ${a.real.verdicts} (${a.real.empty} empty) | ${pct(a.real.share)} (p=${a.real.p_above_chance === null ? 'n/a' : a.real.p_above_chance.toExponential(1)}) | ${pct(a.swap_fooled.share)} | ${pct(a.control_picks_vL.share)} | ${pct(a.individuals.worst_10pct)} / ${pct(a.individuals.worst_5pct)} / ${pct(a.individuals.worst_1pct)} | ${Object.entries(a.per_judge).map(([j, v]) => `${j} ${pct(v.real)}`).join(', ')} |`);
    }
    if (p.goal) for (const [arm, a] of Object.entries(p.goal.arms)) lines.push(`| tutor retention goal | ${arm} | ${a.real.verdicts} (${a.real.empty} empty) | ${pct(a.real.share)} (p=${a.real.p_above_chance === null ? 'n/a' : a.real.p_above_chance.toExponential(1)}) | n/a | n/a | n/a | ${Object.entries(a.per_judge).map(([j, v]) => `${j} ${pct(v.real)}`).join(', ')} |`);
  }
  console.log('| Part | Arm | Verdicts | Picked the learner\'s own version | Planted swap fooled | Control (wrong profile) picks it | Worst 10% / 5% / 1% of learners | Per judge |\n|---|---|---|---|---|---|---|---|');
  console.log(lines.join('\n'));
  console.log('\nFacts through the part\'s own gate:');
  for (const [part, p] of Object.entries(r.parts)) console.log(`- ${part}: ${p.facts.passed}/${p.facts.checked} rewrites passed (${p.facts.declined} declined, stored text kept); judge "same facts" ${p.facts.same_yes}/${p.facts.same_asked}${p.facts.coverage_fail ? `; key-fact coverage failures ${p.facts.coverage_fail}` : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
