/**
 * Which free NVIDIA model does each task best? Measured on the repo's own
 * labelled data, then written into config/model-lineup.json so the provider
 * chains read the winners (the lineup is data, not code).
 *
 *   node scripts/model-lineup-eval.js                 run every task (cached answers are reused)
 *   node scripts/model-lineup-eval.js --tasks grading,blind --n 30
 *   node scripts/model-lineup-eval.js --report        recompute the report from the cache only (no calls)
 *   node scripts/model-lineup-eval.js --write         also write the winners into config/model-lineup.json
 *   node scripts/model-lineup-eval.js --jev           allow NEW Jev calls (through the $0.13 ledger, services/jev.js)
 *
 * Needs NVIDIA_API_KEY (in .env or the parent folder's .env); without it the
 * script exits before doing anything. Every paid key (Anthropic, MiMo, Gemini,
 * Modelflare) is blanked first; the OpenRouter key is kept only for Jev, and only
 * with --jev. Calls go through services/providers/nvidia.js, so they are paced
 * under the free tier's ~40 requests a minute (NVIDIA_RPM, default 36) with
 * backoff on 429.
 *
 * Tasks and their labels:
 *   grading   typed-answer grading, the answers the rules reject
 *             (curriculum-build/jev-pilot/grading-cases.json, labels by construction)
 *   blind     blind multiple choice, the fact cascade's step 3
 *             (curriculum-build/jev-pilot/blind-cases.json, from content/bank.js, audited keys)
 *   keys      answer-key judging: is the keyed answer the one right option?
 *             (placement questions where the MiMo and Claude judges AGREED,
 *             curriculum-build/placement-judge/<track>[-units].json vs -claude.json)
 *   units     placement-unit location vs the two-judge mean
 *             (curriculum-build/jev-pilot/units-cases.json, -units-mean.json)
 *   facts     claim checking: Sonnet-confirmed errors vs Sonnet-verified claims from
 *             verified lessons (curriculum-build/model-lineup/fact-cases.json, built
 *             once from a DB_FILE copy with --build-fact-cases)
 * Lesson writing cannot be scored automatically and is not measured here.
 *
 * Jev is compared from the pilot's cached answers (no new spend) and, with --jev,
 * fills any missing case through the persistent ledger. A task enables Jev only if
 * Jev (with the free winner catching its undecided cases) is strictly more accurate
 * than every free model alone: Jev costs money and the free models cost $0.
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i === -1) return null; const v = args[i + 1]; return v && !v.startsWith('--') ? v : true; };

// Paid keys out before anything reads .env (dotenv never overrides a set variable).
const ALLOW_JEV = !!flag('jev');
for (const k of ['ANTHROPIC_API_KEY', 'FACT_CHECK_ANTHROPIC_KEY', 'FACT_CHECK_ANTHROPIC_WORKSPACE', 'MIMO_API_KEY', 'GEMINI_API_KEY', 'MODELFLARE_API_KEY',
  'OPENROUTER_GLM_API_KEY', 'OPENROUTER_DEEPSEEK_API_KEY', 'OPENROUTER_GPT_SOL_API_KEY', 'OPENROUTER_BUNNY_API_KEY']) process.env[k] = '';
if (!ALLOW_JEV) process.env.OPENROUTER_API_KEY = '';
const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
const here = path.join(ROOT, '.env');
dotenv.config({ path: fs.existsSync(here) ? here : path.join(ROOT, '..', '.env') });

const OUT = path.join(ROOT, 'curriculum-build', 'model-lineup');
const CACHE = path.join(OUT, 'cache.json');
const RESULTS = path.join(OUT, 'results.json');
const REPORT = path.join(OUT, 'EVAL-REPORT.md');
const FACT_CASES = path.join(OUT, 'fact-cases.json');
const KEY_CASES = path.join(OUT, 'key-cases.json');
const LINEUP = process.env.MODEL_LINEUP_FILE || path.join(ROOT, 'config', 'model-lineup.json');
const PILOT = path.join(ROOT, 'curriculum-build', 'jev-pilot');
const JUDGE = path.join(ROOT, 'curriculum-build', 'placement-judge');

const REPORT_ONLY = !!flag('report');
if (!REPORT_ONLY && !String(process.env.NVIDIA_API_KEY || '').trim()) {
  console.log('NVIDIA_API_KEY is not set (in .env or ../.env). Nothing was run.');
  process.exit(0);
}

// Slow thinking models are latency-bound, not rate-bound: more in flight, same RPM cap.
if (!process.env.NVIDIA_CONCURRENCY) process.env.NVIDIA_CONCURRENCY = '16';
const nvidia = require('../services/providers/nvidia');
const jev = require('../services/jev');

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1)); };

/** Every candidate: the owner's lineup, each model at the effort its tier uses. */
const CANDIDATES = [
  { id: 'lightning@off', model: 'nvidia/nemotron-3.5-lightning-30b-a3b', effort: 'off', tier: 'instant' },
  { id: 'ultra@medium', model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium', tier: 'light' },
  { id: 'glm-flash@high', model: 'z-ai/glm-5.3-flash', effort: 'high', tier: 'fast_thinking' },
  { id: 'ds-flash@high', model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'high', tier: 'fast_thinking' },
  { id: 'glm-5.3@max', model: 'z-ai/glm-5.3', effort: 'max', tier: 'hard' },
  { id: 'ds-flash@max', model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'max', tier: 'hard' },
];
const wanted = flag('models') && flag('models') !== true ? String(flag('models')).split(',') : null;
const candidates = wanted ? CANDIDATES.filter((c) => wanted.includes(c.id)) : CANDIDATES;

// ── deterministic sampling ──────────────────────────────────────────────────
function rngFor(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (Math.imul(s, 31) + ch.charCodeAt(0)) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function shuffle(list, seed) {
  const r = rngFor(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** n cases spread round-robin across groups. */
function stratified(cases, n, groupOf, seed) {
  const groups = new Map();
  for (const c of shuffle(cases, seed)) {
    const g = groupOf(c);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }
  const lists = [...groups.values()];
  const out = [];
  for (let r = 0; out.length < n; r++) {
    let any = false;
    for (const l of lists) if (l[r] && out.length < n) { out.push(l[r]); any = true; }
    if (!any) break;
  }
  return out;
}
const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── tasks ───────────────────────────────────────────────────────────────────
const ERROR_TAGS = ['sign_error', 'order_of_operations', 'careless_arithmetic', 'conceptual_gap', 'incomplete_reasoning', 'misread_prompt', 'units_or_format', 'vocabulary_gap', 'grammar_rule', 'conjugation_form', 'agreement_error', 'pattern_misread', 'overgeneralization', 'no_attempt'];

const TASKS = {
  grading: {
    config: ['grade_free_response'],
    jevTask: 'grade_free_response',
    n: 48,
    cases() {
      // Only what the app sends to a model: answers the rules reject.
      const all = readJson(path.join(PILOT, 'grading-cases.json'), []).filter((c) => c.rules === false);
      return stratified(all, Number(flag('n')) || this.n, (c) => `${c.group}|${c.truth}`, 'grading');
    },
    // Mirrors services/ai.js gradeFreeResponse exactly.
    request(c) {
      return {
        system: `You grade one short free-response answer in a language and academic tutor.

Judge meaning and correctness, not spelling of accents or capitalization. Accept any answer that a careful teacher would mark right, including a different valid word order or synonym. Mark wrong anything with a real error of grammar, form, or fact, even when it is close.

Feedback is at most two sentences, addressed to the learner, and names the specific thing to fix. Choose the error tag from the enum; use "none" when the answer is correct. Plain text only.`,
        user: `Question: ${c.question}
Reference answer: ${c.reference}${c.accepted && c.accepted.length ? `\nOther accepted answers: ${c.accepted.join(' | ')}` : ''}
Learner answer: ${c.learner}`,
        schema: { type: 'object', properties: { correct: { type: 'boolean' }, error_tag: { type: 'string', enum: [...ERROR_TAGS, 'none'] }, feedback: { type: 'string' } }, required: ['correct', 'error_tag', 'feedback'], additionalProperties: false },
        schemaName: 'submit_grade',
        maxTokens: 1024,
      };
    },
    answerOf: (data) => (data && typeof data.correct === 'boolean' ? data.correct : null),
    right: (c, a) => a === c.truth,
    // A wrong answer marked right is the worst outcome for a learner.
    extra(rows) {
      const fa = rows.filter((r) => r.case.truth === false && r.answer === true).length;
      const fr = rows.filter((r) => r.case.truth === true && r.answer === false).length;
      return { false_accepts: fa, false_rejects: fr, wrong_answers: rows.filter((r) => r.case.truth === false).length, acceptable: rows.filter((r) => r.case.truth === true).length };
    },
    rankKey: (s) => [s.accuracy, -s.false_accepts],
    jevAnswer(c) {
      const hit = readJson(path.join(PILOT, 'grading.json'), {})[c.id];
      const p = hit && hit.answers && hit.answers.acceptable && hit.answers.acceptable.noul;
      if (!Number.isFinite(p)) return undefined;
      return p >= 0.7 ? true : p <= 0.3 ? false : null; // null: undecided, the model decides
    },
    async jevCall(c) {
      const r = await jev.gradeTyped({ question: c.question, reference: c.reference, accepted: c.accepted, learner: c.learner });
      return r ? r.correct : null;
    },
  },

  blind: {
    config: ['blind_mc'],
    jevTask: 'blind_mc',
    n: 48,
    cases() {
      const all = readJson(path.join(PILOT, 'blind-cases.json'), []);
      return stratified(all, Number(flag('n')) || this.n, (c) => c.group, 'blind');
    },
    // The cascade's blind test (services/fact-cascade.js BLIND_SYSTEM), one question per call.
    request(c) {
      const opts = Object.values(c.options);
      return {
        system: 'You are a careful student taking a quiz. Answer each question. For a multiple-choice question, give the exact text of the one option you choose, and say whether more than one option could be right. For a typed question, give a short answer. Work each one out before answering.',
        user: `${c.passage ? `PASSAGE:\n${c.passage}\n\n` : ''}QUESTION 1: ${c.question}\nOPTIONS:\n${opts.map((o) => `- ${o}`).join('\n')}`,
        schema: { type: 'object', required: ['answers'], properties: { answers: { type: 'array', items: { type: 'object', required: ['index', 'answer'], properties: { index: { type: 'integer' }, answer: { type: 'string' }, more_than_one_right: { type: 'boolean' } } } } } },
        schemaName: 'submit_answers',
        maxTokens: 1024,
      };
    },
    answerOf: (data) => {
      const a = data && Array.isArray(data.answers) && data.answers[0];
      return a ? { answer: String(a.answer || ''), multi: !!a.more_than_one_right } : null;
    },
    right(c, a) {
      if (!a) return false;
      const got = norm(a.answer);
      const key = norm(c.answer);
      if (got === key) return true;
      // "D" or "D) She" for the keyed option.
      const letter = /^([a-f])(\s|$)/.exec(got);
      return !!(letter && c.options[letter[1].toUpperCase()] && norm(c.options[letter[1].toUpperCase()]) === key);
    },
    extra(rows) {
      const by = {};
      for (const r of rows) { const g = r.case.group; by[g] = by[g] || [0, 0]; by[g][1]++; if (r.ok) by[g][0]++; }
      return { by_group: Object.fromEntries(Object.entries(by).map(([g, [k, n]]) => [g, `${k}/${n}`])), false_flags: rows.filter((r) => !r.ok).length };
    },
    rankKey: (s) => [s.accuracy],
    jevAnswer(c) {
      if (c.group === 'math') return null; // the pilot: never for math
      const hit = readJson(path.join(PILOT, 'blind.json'), {})[c.id];
      const a = hit && hit.answers && hit.answers.answer;
      if (!a || !a.choice) return undefined;
      return a.confidence >= 0.8 ? { answer: c.options[a.choice] || '', multi: false } : null;
    },
    async jevCall(c) {
      if (c.group === 'math') return null;
      const r = await jev.chooseOption({ question: c.question, passage: c.passage, options: Object.values(c.options) });
      return r && r.confidence >= 0.8 ? { answer: r.answer, multi: false } : null;
    },
  },

  keys: {
    config: ['placement_key_judge'],
    n: 40,
    cases() {
      if (!fs.existsSync(KEY_CASES)) buildKeyCases();
      const all = readJson(KEY_CASES, []);
      const bad = all.filter((c) => c.truth !== 'correct');
      const good = all.filter((c) => c.truth === 'correct');
      const n = Number(flag('n')) || this.n;
      const half = Math.min(bad.length, Math.floor(n / 2));
      return [...stratified(bad, half, (c) => c.track, 'keys-bad'), ...stratified(good, n - half, (c) => c.track, 'keys-good')];
    },
    request(c) {
      return {
        system: 'You check one multiple-choice placement question for an education app. Work the question out yourself, then judge its keyed answer: "correct" if the keyed answer is right and the only right option, "wrong" if the keyed answer is not right, "ambiguous" if another option is also defensible. Never trust the key; solve it.',
        user: `Question: ${c.prompt}\nOptions:\n${c.choices.map((o) => `- ${o}`).join('\n')}\nKeyed answer: ${c.answer}`,
        schema: { type: 'object', required: ['verdict'], properties: { verdict: { type: 'string', enum: ['correct', 'wrong', 'ambiguous'] }, note: { type: 'string' } } },
        schemaName: 'submit_key_check',
        maxTokens: 1024,
      };
    },
    answerOf: (data) => (data && data.verdict ? data.verdict : null),
    // Binary: is the key good, or does it need a person to look?
    right: (c, a) => a !== null && ((c.truth === 'correct') === (a === 'correct')),
    extra(rows) {
      const bad = rows.filter((r) => r.case.truth !== 'correct');
      const good = rows.filter((r) => r.case.truth === 'correct');
      const caught = bad.filter((r) => r.answer && r.answer !== 'correct').length;
      const falseFlags = good.filter((r) => r.answer && r.answer !== 'correct').length;
      return { bad_keys_caught: `${caught}/${bad.length}`, false_flags: `${falseFlags}/${good.length}`, balanced_accuracy: Number((((bad.length ? caught / bad.length : 0) + (good.length ? 1 - falseFlags / good.length : 0)) / 2).toFixed(3)) };
    },
    rankKey: (s) => [s.balanced_accuracy, s.accuracy],
  },

  units: {
    config: ['placement_unit_judge'],
    n: 30,
    cases() {
      const all = readJson(path.join(PILOT, 'units-cases.json'), []);
      return stratified(all, Number(flag('n')) || this.n, (c) => c.track, 'units');
    },
    request(c) {
      const outline = Object.entries(c.criteria).map(([k, v]) => `${k}: ${v}`).join('\n');
      return {
        system: 'You place one placement question in a curriculum. Each grade has units in order from U1; U0 means a learner answers it before the grade starts. Give the FIRST unit U by which a learner who has worked through every unit up to and including U would reliably answer it (about 9 in 10 right). Recognising the right option is easier than producing it. Judge from what the question actually requires; everyday knowledge or an earlier skill means an earlier unit.',
        user: `Grade: ${c.grade} (${c.track})\nUNITS:\n${outline}\n\nQuestion: ${c.question}\nOptions: ${(c.options || []).map((o) => `[${o}]`).join(' ')}\nKeyed answer: ${c.answer}`,
        schema: { type: 'object', required: ['unit'], properties: { unit: { type: 'integer' }, why: { type: 'string' } } },
        schemaName: 'submit_unit',
        maxTokens: 1024,
      };
    },
    answerOf: (data) => (data && Number.isFinite(Number(data.unit)) ? Number(data.unit) : null),
    right: (c, a) => a !== null && Math.abs(a - c.mean) <= 0.5,
    extra(rows) {
      const within1 = rows.filter((r) => r.answer !== null && Math.abs(r.answer - r.case.mean) <= 1).length;
      const errs = rows.filter((r) => r.answer !== null).map((r) => Math.abs(r.answer - r.case.mean));
      return { within_1: Number((within1 / Math.max(1, rows.length)).toFixed(3)), mae: Number((errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length)).toFixed(2)), writer_baseline_exact: Number((rows.filter((r) => Math.abs(r.case.written_for - r.case.mean) <= 0.5).length / Math.max(1, rows.length)).toFixed(3)) };
    },
    rankKey: (s) => [s.accuracy, s.within_1],
    jevAnswer(c) {
      const hit = readJson(path.join(PILOT, 'units.json'), {})[c.id];
      const a = hit && hit.answers && hit.answers.unit;
      if (!a || !a.choice) return undefined;
      return Number(String(a.choice).replace('U', ''));
    },
  },

  facts: {
    config: ['fact_verify', 'fact_read'],
    n: 40,
    cases() {
      const all = readJson(FACT_CASES, []);
      if (!all.length) return [];
      const bad = all.filter((c) => c.truth !== 'verified');
      const good = all.filter((c) => c.truth === 'verified');
      const n = Number(flag('n')) || this.n;
      const half = Math.min(bad.length, Math.floor(n / 2));
      return [...stratified(bad, half, (c) => c.track, 'facts-bad'), ...stratified(good, n - half, (c) => c.track, 'facts-good')];
    },
    request(c) {
      return {
        system: 'You are the fact verifier for an education app. Nothing reaches a learner until you pass it. Verify the one claim below from a lesson, working it out yourself (do the arithmetic, place the pieces, count the keys, read the rule). Verdict: "verified" (true as stated); "false" (wrong; say what is true); "unsupported" (you are not certain it is true); "unlabelled" (an opinion, contested point or theory stated as plain fact). Wrong quiz options are meant to be wrong: judge their feedback, not that they are wrong.',
        user: `Subject: ${c.track}. Lesson topic: ${c.topic || 'unknown'}. Where: ${c.where}.\nClaim: ${c.claim}`,
        schema: { type: 'object', required: ['verdict'], properties: { verdict: { type: 'string', enum: ['verified', 'false', 'unsupported', 'unlabelled'] }, truth: { type: 'string' } } },
        schemaName: 'submit_verdict',
        maxTokens: 1024,
      };
    },
    answerOf: (data) => (data && data.verdict ? data.verdict : null),
    right: (c, a) => a !== null && ((c.truth === 'verified') === (a === 'verified')),
    extra(rows) {
      const bad = rows.filter((r) => r.case.truth !== 'verified');
      const good = rows.filter((r) => r.case.truth === 'verified');
      const caught = bad.filter((r) => r.answer && r.answer !== 'verified').length;
      const falseAlarms = good.filter((r) => r.answer && r.answer !== 'verified').length;
      return { errors_caught: `${caught}/${bad.length}`, false_alarms: `${falseAlarms}/${good.length}`, balanced_accuracy: Number((((bad.length ? caught / bad.length : 0) + (good.length ? 1 - falseAlarms / good.length : 0)) / 2).toFixed(3)) };
    },
    rankKey: (s) => [s.balanced_accuracy, s.accuracy],
  },
};

/** Key-judging cases: placement questions where both judges gave the same verdict. */
function buildKeyCases() {
  // eslint-disable-next-line global-require
  const testers = require('./placement-testers');
  // eslint-disable-next-line global-require
  const rules = require('../config/subject-placement');
  const out = [];
  for (const track of ['math', 'english', 'reading']) {
    const qs = new Map(testers.allQuestions(track).map((q) => [q.key, q]));
    for (const gradeId of rules.gradesFor(track)) for (const q of testers.unitQuestions(track, gradeId)) qs.set(q.key, q);
    for (const [mimoFile, claudeFile] of [[track, `${track}-claude`], [`${track}-units`, `${track}-units-claude`]]) {
      const a = readJson(path.join(JUDGE, `${mimoFile}.json`), {});
      const b = readJson(path.join(JUDGE, `${claudeFile}.json`), {});
      for (const [key, v] of Object.entries(b)) {
        const q = qs.get(key);
        if (!q || !a[key] || a[key].key !== v.key || v.key === 'flawed' || !Array.isArray(q.choices) || q.choices.length < 2) continue;
        out.push({ id: `k:${track}:${key}`, track, truth: v.key, prompt: q.prompt, choices: q.choices, answer: q.answer, note: v.note || '' });
      }
    }
  }
  const seen = new Set();
  const unique = out.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
  // The questions both judges marked wrong were since rewritten (scripts/revise-*),
  // so the current bank has no real bad keys left to test with. A planted one is
  // the next best: a question both judges agree is correctly keyed, keyed to one
  // of its distractors instead. Every planted key is wrong by construction; real
  // wrong keys are subtler, so read this as an upper bound on catching them.
  const planted = [];
  for (const c of shuffle(unique.filter((x) => x.truth === 'correct'), 'plant').slice(0, 400)) {
    const others = c.choices.filter((o) => norm(o) !== norm(c.answer));
    if (!others.length) continue;
    const r = rngFor(c.id);
    planted.push({ ...c, id: `${c.id}:planted`, truth: 'wrong', answer: others[Math.floor(r() * others.length)], planted_from: c.answer });
  }
  const all = [...unique, ...planted];
  writeJson(KEY_CASES, all);
  console.log(`built ${all.length} key cases (${unique.filter((c) => c.truth !== 'correct').length} real bad keys both judges agree on, ${planted.length} planted)`);
}

/** Fact cases: claims from verified lessons in a DB copy (DB_FILE), Sonnet's verdict as the label. */
function buildFactCases() {
  if (!process.env.DB_FILE) { console.log('--build-fact-cases needs DB_FILE pointing at a COPY of data/db.json'); return; }
  // eslint-disable-next-line global-require
  const db = require('../config/db');
  // eslint-disable-next-line global-require
  const curriculum = require('../config/curriculum');
  // eslint-disable-next-line global-require
  const LAYOUT = require('../config/level-layout');
  const cases = [];
  for (const p of db.find('block_plans', (x) => x.verification && Array.isArray(x.verification.claims))) {
    let topic = '';
    try { const g = curriculum.getGrade(p.track_id, p.grade_id); topic = ((LAYOUT.entryFor(g, p.level) || {}).title) || ''; } catch { /* no layout */ }
    for (const c of p.verification.claims) {
      if (!c || !c.claim || (c.round || 0) !== 0) continue;
      if (c.kind === 'instruction') continue;
      const truth = c.verdict === 'verified' ? 'verified' : ['false', 'unsupported', 'unlabelled'].includes(c.verdict) ? c.verdict : null;
      if (!truth) continue;
      cases.push({ id: `f:${p.id}:${cases.length}`, plan: p.id, track: p.track_id, level: p.level, topic, where: c.where, kind: c.kind, claim: c.claim, truth, sonnet_truth: c.truth || '' });
    }
  }
  writeJson(FACT_CASES, cases);
  console.log(`built ${cases.length} fact cases (${cases.filter((c) => c.truth !== 'verified').length} Sonnet-confirmed errors)`);
}

// ── running ─────────────────────────────────────────────────────────────────
const cache = readJson(CACHE, {});
let dirty = 0;
function saveCache(force = false) {
  if (!dirty) return;
  if (force || dirty >= 2) { writeJson(CACHE, cache); dirty = 0; }
}
// A stopped run keeps every answer it already paid for in time.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { saveCache(true); process.exit(130); });

async function ask(taskName, task, c, cand) {
  const key = `${taskName}|${c.id}|${cand.id}`;
  if (cache[key] && cache[key].ok !== undefined && !(cache[key].error && flag('retry-errors'))) return cache[key];
  if (REPORT_ONLY) return null;
  const req = task.request(c);
  const t = Date.now();
  let entry;
  try {
    // Each candidate alone (no fallback model), two tries, each within the gateway's ~5-minute cut-off.
    const r = await nvidia.structured({ ...req, role: 'check', lane: 'background', models: [{ model: cand.model, effort: cand.effort }], attempts: 2, timeoutMs: Number(process.env.EVAL_TIMEOUT_MS || 310000) });
    entry = { ok: true, data: r.data, ms: Date.now() - t, usage: r.usage, repaired: !!r.repaired };
  } catch (err) {
    entry = { ok: false, error: String(err.message || err).slice(0, 200), ms: Date.now() - t };
  }
  cache[key] = entry;
  dirty++;
  saveCache();
  return entry;
}

async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      // eslint-disable-next-line no-await-in-loop
      await fn(items[i], i);
    }
  }));
}

function median(xs) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
}

function score(taskName, task, cases, candId) {
  const rows = cases.map((c) => {
    const e = cache[`${taskName}|${c.id}|${candId}`];
    const answer = e && e.ok ? task.answerOf(e.data) : null;
    return { case: c, entry: e, answer, ok: answer !== null && task.right(c, answer) };
  });
  const answered = rows.filter((r) => r.entry);
  const s = {
    n: rows.length,
    answered: answered.length,
    failed_calls: answered.filter((r) => !r.entry.ok).length,
    correct: rows.filter((r) => r.ok).length,
    accuracy: Number((rows.filter((r) => r.ok).length / Math.max(1, rows.length)).toFixed(3)),
    // Quality apart from availability: accuracy on the calls that did answer.
    accuracy_when_answered: Number((rows.filter((r) => r.ok).length / Math.max(1, rows.filter((r) => r.entry && r.entry.ok).length)).toFixed(3)),
    median_ms: median(answered.filter((r) => r.entry.ok).map((r) => r.entry.ms)),
    ...task.extra(rows),
  };
  return s;
}

/** Jev on the same cases, with the free winner deciding what Jev leaves undecided. */
async function jevCombined(taskName, task, cases, freeWinnerId) {
  if (!task.jevAnswer) return null;
  let fromPilot = 0;
  let fresh = 0;
  let missing = 0;
  const rows = [];
  for (const c of cases) {
    let a = task.jevAnswer(c);
    if (a === undefined) {
      const key = `${taskName}|${c.id}|jev`;
      if (cache[key]) a = cache[key].answer;
      else if (ALLOW_JEV && task.jevCall && !REPORT_ONLY) {
        // eslint-disable-next-line no-await-in-loop
        a = await task.jevCall(c).catch(() => null);
        cache[key] = { answer: a, ok: true };
        dirty++;
        fresh++;
      } else { missing++; a = undefined; }
    } else fromPilot++;
    if (a === undefined) continue;
    let final = a;
    let by = 'jev';
    if (a === null) {
      const e = cache[`${taskName}|${c.id}|${freeWinnerId}`];
      final = e && e.ok ? task.answerOf(e.data) : null;
      by = 'free';
    }
    rows.push({ case: c, answer: final, ok: final !== null && task.right(c, final), by });
  }
  saveCache(true);
  if (!rows.length) return { covered: 0, missing };
  return {
    covered: rows.length,
    missing,
    from_pilot: fromPilot,
    fresh_calls: fresh,
    decided_by_jev: rows.filter((r) => r.by === 'jev').length,
    correct: rows.filter((r) => r.ok).length,
    accuracy: Number((rows.filter((r) => r.ok).length / rows.length).toFixed(3)),
    ...task.extra(rows),
  };
}

/**
 * Ranking: a model that failed more than 15% of its calls (429s, gateway
 * timeouts) is ranked after every model that did not — the free tier's
 * availability is part of "the best results" — then accuracy (the task's own key),
 * then latency.
 */
const MAX_FAILURE_RATE = 0.15;
/** Below this (accuracy, or balanced accuracy where the task has one) a winner is not written. */
const MIN_QUALITY = 0.75;
const eligible = (s) => s.failed_calls / Math.max(1, s.n) <= MAX_FAILURE_RATE;
function better(task, a, b) {
  if (eligible(a) !== eligible(b)) return eligible(a);
  const ka = task.rankKey(a);
  const kb = task.rankKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] > kb[i];
  }
  return (a.median_ms || Infinity) < (b.median_ms || Infinity);
}

async function main() {
  if (flag('build-fact-cases')) { buildFactCases(); return; }
  const taskNames = flag('tasks') && flag('tasks') !== true ? String(flag('tasks')).split(',') : Object.keys(TASKS);
  const results = readJson(RESULTS, {});
  results.run_at = new Date().toISOString();
  results.tasks = results.tasks || {};

  // Every task's calls go into one pool, interleaved, so a slow model (DeepSeek
  // at max reasoning takes one to two minutes a call) never holds the rest back.
  const caseSets = {};
  const jobs = [];
  for (const taskName of taskNames) {
    const task = TASKS[taskName];
    if (!task) { console.log(`unknown task ${taskName}`); continue; }
    const cases = task.cases();
    if (!cases.length) { console.log(`${taskName}: no cases (see the header for how to build them); skipped`); continue; }
    caseSets[taskName] = cases;
    console.log(`${taskName}: ${cases.length} cases x ${candidates.length} models`);
    for (const c of cases) for (const cand of candidates) jobs.push({ taskName, task, c, cand });
  }
  const todo = jobs.filter(({ taskName, c, cand }) => {
    const e = cache[`${taskName}|${c.id}|${cand.id}`];
    return !e || (flag('retry-errors') && !e.ok);
  });
  console.log(`${jobs.length} answers needed, ${todo.length} not cached yet`);
  let done = 0;
  const started = Date.now();
  await pool(shuffle(todo, 'jobs'), Number(process.env.EVAL_CONCURRENCY || 16), async ({ taskName, task, c, cand }) => {
    await ask(taskName, task, c, cand);
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${todo.length} (${Math.round((Date.now() - started) / 60000)} min)`);
  });
  saveCache(true);

  for (const taskName of Object.keys(caseSets)) {
    const task = TASKS[taskName];
    const cases = caseSets[taskName];
    console.log(`\n${taskName}`);
    const scores = Object.fromEntries(candidates.map((cand) => [cand.id, score(taskName, task, cases, cand.id)]));
    let winner = null;
    for (const cand of candidates) {
      const s = scores[cand.id];
      if (!s.answered) continue;
      if (!winner || better(task, s, scores[winner])) winner = cand.id;
    }
    const ranking = candidates.map((c) => c.id).filter((id) => scores[id].answered)
      .sort((x, y) => (better(task, scores[x], scores[y]) ? -1 : better(task, scores[y], scores[x]) ? 1 : 0));
    const jevScore = winner ? await jevCombined(taskName, task, cases, winner) : null;
    const jevWins = !!(jevScore && jevScore.covered === cases.length && winner
      && jevScore.accuracy > scores[winner].accuracy
      && (!('false_accepts' in jevScore) || jevScore.false_accepts <= scores[winner].false_accepts));
    results.tasks[taskName] = { cases: cases.length, scores, ranking, winner, jev: jevScore, jev_wins: jevWins, config: task.config };
    for (const id of ranking) {
      const s = scores[id];
      console.log(`  ${id.padEnd(16)} acc ${s.accuracy}  ${JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k]) => !['n', 'correct', 'accuracy'].includes(k))))}`);
    }
    if (jevScore) console.log(`  jev (+${winner} on undecided) acc ${jevScore.accuracy} on ${jevScore.covered} -> ${jevWins ? 'Jev WINS' : 'free model is equal or better'}`);
    writeJson(RESULTS, results);
  }
  writeReport(results);
  if (flag('write')) writeLineup(results);
}

const byId = Object.fromEntries(CANDIDATES.map((c) => [c.id, c]));

function writeReport(results) {
  const lines = ['# Model lineup eval', '', `Run: ${results.run_at}. Produced by \`node scripts/model-lineup-eval.js\`; every answer is cached in \`cache.json\`, so \`--report\` recomputes this file without calls.`, '',
    'Accuracy is on the sampled cases; a failed call (timeout, rate limit after retries, unusable output) counts as wrong. Latency is the median wall time of successful calls, including queueing under the free tier\'s rate limit, so it is comparable between models in this run, not an absolute figure.', '',
    `Ranking: models that failed more than ${MAX_FAILURE_RATE * 100}% of their calls come after the rest (availability on the free tier is part of the result), then the task's accuracy measure, then latency. \`accuracy_when_answered\` shows quality apart from availability. \`--write\` does not hand a task to a model whose quality is under ${MIN_QUALITY}.`, ''];
  for (const [name, t] of Object.entries(results.tasks || {})) {
    lines.push(`## ${name} (${t.cases} cases) -> ${t.config.join(', ')}`, '');
    const cols = [...new Set(Object.values(t.scores).flatMap((s) => Object.keys(s)))].filter((k) => !['n', 'answered', 'correct'].includes(k));
    lines.push(`| Model | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const id of t.ranking) {
      const s = t.scores[id];
      lines.push(`| ${id}${id === t.winner ? ' **(winner)**' : ''} | ${cols.map((k) => (typeof s[k] === 'object' && s[k] !== null ? JSON.stringify(s[k]) : s[k] == null ? '' : s[k])).join(' | ')} |`);
    }
    if (t.jev) lines.push('', `Jev (with ${t.winner} deciding its undecided cases): accuracy ${t.jev.accuracy} on ${t.jev.covered} of ${t.cases} cases (${t.jev.from_pilot || 0} from the pilot's cache, ${t.jev.fresh_calls || 0} new calls). ${t.jev_wins ? '**Jev wins: enabled for this task (JEV_ENABLED=1 still required).**' : 'A free model is equal or better: Jev stays off.'}`);
    lines.push('');
  }
  writeJson(REPORT.replace(/\.md$/, '.json'), results);
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`\nreport: ${path.relative(ROOT, REPORT)}`);
}

/** Winners into config/model-lineup.json: per task, and the order inside each either/or tier. */
function writeLineup(results) {
  const lineup = readJson(LINEUP, null);
  if (!lineup) { console.log(`cannot read ${LINEUP}; not written`); return; }
  lineup.tasks = lineup.tasks || {};
  lineup.jev = lineup.jev || {};
  const tierScore = {};
  for (const [name, t] of Object.entries(results.tasks || {})) {
    if (!t.winner) continue;
    // A task where even the best free model is barely above chance is not handed
    // to it: its tier default stays, and the report says no free model is reliable.
    const best = t.scores[t.winner];
    const quality = best.balanced_accuracy != null ? best.balanced_accuracy : best.accuracy;
    if (quality < MIN_QUALITY) {
      for (const taskKey of t.config) {
        const prev = { ...(lineup.tasks[taskKey] || {}) };
        delete prev.models;
        lineup.tasks[taskKey] = { ...prev, eval: { task: name, winner: null, best: t.winner, quality, cases: t.cases, at: results.run_at, note: `no free model reached ${MIN_QUALITY}; tier default kept` } };
      }
      continue;
    }
    const ranked = t.ranking.map((id) => ({ model: byId[id].model, effort: byId[id].effort }));
    // De-duplicate by model (DeepSeek appears at two efforts): the better effort stays.
    const seen = new Set();
    const models = ranked.filter((e) => (seen.has(e.model) ? false : seen.add(e.model))).slice(0, 3);
    for (const taskKey of t.config) {
      lineup.tasks[taskKey] = {
        ...(lineup.tasks[taskKey] || {}),
        tier: byId[t.winner].tier,
        models,
        eval: { task: name, winner: t.winner, accuracy: t.scores[t.winner].accuracy, cases: t.cases, median_ms: t.scores[t.winner].median_ms, at: results.run_at },
      };
    }
    if (TASKS[name].jevTask) lineup.jev[TASKS[name].jevTask] = !!t.jev_wins;
    // Tier ordering: average accuracy of each candidate across tasks.
    for (const [id, s] of Object.entries(t.scores)) {
      tierScore[id] = tierScore[id] || [];
      tierScore[id].push(s.balanced_accuracy != null ? s.balanced_accuracy : s.accuracy);
    }
  }
  const avg = (id) => (tierScore[id] && tierScore[id].length ? tierScore[id].reduce((a, b) => a + b, 0) / tierScore[id].length : -1);
  for (const [tier, pair] of [['fast_thinking', ['glm-flash@high', 'ds-flash@high']], ['hard', ['glm-5.3@max', 'ds-flash@max']]]) {
    if (pair.some((id) => avg(id) < 0)) continue;
    const ordered = [...pair].sort((a, b) => avg(b) - avg(a));
    lineup.tiers[tier] = ordered.map((id) => ({ model: byId[id].model, effort: byId[id].effort }));
  }
  lineup.source = `scripts/model-lineup-eval.js run ${results.run_at} (curriculum-build/model-lineup/EVAL-REPORT.md)`;
  lineup.updated_at = new Date().toISOString();
  writeJson(LINEUP, lineup);
  console.log(`wrote ${path.relative(ROOT, LINEUP)}`);
}

main().catch((err) => { console.error(err.stack || err); process.exit(1); });
