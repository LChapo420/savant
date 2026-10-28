/**
 * Local models (Ollama, on this laptop) against the free NVIDIA lineup, on the SAME
 * labelled cases as scripts/model-lineup-eval.js.
 *
 * Nothing is duplicated: the task definitions (cases, prompts, schemas, scoring)
 * are loaded from model-lineup-eval.js itself (its main() is not run), so the
 * sample of cases is identical (same seeds, same --n), and the NVIDIA answers are
 * read from that eval's cache (curriculum-build/model-lineup/cache.json). This
 * script makes NO NVIDIA calls and no paid calls: only 127.0.0.1 (Ollama, the
 * local fact checkers, kiwix-serve).
 *
 *   node scripts/local-model-eval.js                       every task, every local candidate
 *   node scripts/local-model-eval.js --tasks grading,blind --models qwen3.5-4b@off
 *   node scripts/local-model-eval.js --n 20                fewer cases (must match the NVIDIA run to compare)
 *   node scripts/local-model-eval.js --report              recompute the report from caches only
 *   node scripts/local-model-eval.js --write               also write config/local-lineup.json
 *   node scripts/local-model-eval.js --grounded            add the offline-retrieval fact tasks
 *                                                          (needs kiwix-serve, tools/offline-sources)
 *
 * Extra tasks (local only, with --grounded):
 *   facts_rag   the facts task, with passages retrieved from the offline Wikipedia
 *               (services/offline-facts.js) given to the local model.
 *   facts_nli   no LLM at all: FactCG + MiniCheck (tools/fact-checkers, stage 1) on
 *               the same retrieved passages; "verified" when both say supported.
 *
 * Output: curriculum-build/local-models/LOCAL-EVAL-REPORT.md (+ .json), cache.json.
 * --write: config/local-lineup.json, read by services/providers/ollama.js:
 *   tasks.<task>.models   local ranking for that task
 *   first                 tasks where the best local model is at least as accurate as
 *                         the NVIDIA winner (and no more false accepts): local goes first
 *   fallback              tasks where it reaches LOCAL_FALLBACK_RATIO (0.9) of the
 *                         NVIDIA winner: local answers when NVIDIA cannot, before Claude
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i === -1) return null; const v = args[i + 1]; return v && !v.startsWith('--') ? v : true; };

// Paid keys out before anything reads .env. NVIDIA is not called either.
for (const k of ['ANTHROPIC_API_KEY', 'FACT_CHECK_ANTHROPIC_KEY', 'FACT_CHECK_ANTHROPIC_WORKSPACE', 'MIMO_API_KEY', 'GEMINI_API_KEY', 'MODELFLARE_API_KEY',
  'OPENROUTER_API_KEY', 'OPENROUTER_GLM_API_KEY', 'OPENROUTER_DEEPSEEK_API_KEY', 'OPENROUTER_GPT_SOL_API_KEY', 'OPENROUTER_BUNNY_API_KEY']) process.env[k] = '';

/** The lineup eval's TASKS, without running it. */
function loadLineupEval() {
  const file = path.join(__dirname, 'model-lineup-eval.js');
  let src = fs.readFileSync(file, 'utf8');
  const tail = /\nmain\(\)\.catch\([^\n]*\s*$/;
  if (!tail.test(src)) throw new Error('model-lineup-eval.js no longer ends with main().catch(...): update loadLineupEval()');
  src = src.replace(tail, '\nmodule.exports = { TASKS, CANDIDATES };\n');
  // Its header exits without NVIDIA_API_KEY unless --report; we never call NVIDIA.
  const savedArgv = process.argv;
  process.argv = [process.argv[0], file, '--report', ...(flag('n') ? ['--n', String(flag('n'))] : [])];
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  process.argv = savedArgv;
  // Its stop handlers would save ITS cache and exit before ours run.
  for (const sig of ['SIGINT', 'SIGTERM']) process.removeAllListeners(sig);
  return m.exports;
}
const { TASKS: LINEUP_TASKS, CANDIDATES: NVIDIA_CANDIDATES } = loadLineupEval();
const ollama = require('../services/providers/ollama');
const offline = require('../services/offline-facts');

const OUT = path.join(ROOT, 'curriculum-build', 'local-models');
const CACHE = path.join(OUT, 'cache.json');
const REPORT = path.join(OUT, 'LOCAL-EVAL-REPORT.md');
const NVIDIA_CACHE = path.join(ROOT, 'curriculum-build', 'model-lineup', 'cache.json');
const LOCAL_LINEUP = process.env.LOCAL_LINEUP_FILE || path.join(ROOT, 'config', 'local-lineup.json');
const CHECKERS = `http://127.0.0.1:${process.env.FACT_CHECKERS_PORT || 6790}`;

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1)); };

/** Local candidates: Ollama library tags (official), each at the effort it is tried with. */
const LOCAL = [
  { id: 'qwen3.5-4b@off', model: 'qwen3.5:4b', effort: 'off' },
  { id: 'qwen3.5-4b@high', model: 'qwen3.5:4b', effort: 'high' },
  { id: 'qwen3.5-9b@off', model: 'qwen3.5:9b', effort: 'off' },
  { id: 'nemotron-nano-4b@off', model: 'nemotron-3-nano:4b', effort: 'off' },
  { id: 'gemma4-e4b@off', model: 'gemma4:e4b-it-qat', effort: 'off' },
  { id: 'gemma4-26b-a4b@off', model: 'gemma4:26b-a4b-it-qat', effort: 'off' },
  { id: 'qwen3.8-27b@off', model: 'qwen3.8:27b', effort: 'off' },
];
const wantedModels = flag('models') && flag('models') !== true ? String(flag('models')).split(',') : null;
const REPORT_ONLY = !!flag('report');

// ── grounded tasks (offline Wikipedia) ──────────────────────────────────────
const GROUNDED_SYSTEM = 'You are the fact verifier for an education app. Nothing reaches a learner until you pass it. Verify the one claim below from a lesson. Reference passages from an offline encyclopedia are given: use them when they bear on the claim, and work the claim out yourself (do the arithmetic, read the rule). Verdict: "verified" (true as stated); "false" (wrong; say what is true); "unsupported" (you are not certain it is true); "unlabelled" (an opinion, contested point or theory stated as plain fact). Wrong quiz options are meant to be wrong: judge their feedback, not that they are wrong.';
const retrievalCache = readJson(path.join(OUT, 'retrieval-cache.json'), {});
async function passagesFor(c) {
  if (retrievalCache[c.id]) return retrievalCache[c.id];
  const found = await offline.retrieve(c.claim, { topic: `${c.topic || ''} ${c.track || ''}`, k: 4 });
  const slim = found.map((p) => ({ title: p.title, book: p.book, text: p.text.slice(0, 700), score: p.score }));
  if (!slim.length && !(await offline.isUp())) return slim; // kiwix down: do not cache "nothing found"
  retrievalCache[c.id] = slim;
  writeJson(path.join(OUT, 'retrieval-cache.json'), retrievalCache);
  return slim;
}

const GROUNDED_TASKS = {
  facts_rag: {
    base: 'facts',
    config: ['fact_verify_grounded'],
    async request(c) {
      const ps = await passagesFor(c);
      const req = LINEUP_TASKS.facts.request(c);
      return { ...req, system: GROUNDED_SYSTEM, user: `${req.user}\n\nREFERENCE PASSAGES (offline Wikipedia/Wiktionary):\n${ps.length ? ps.map((p, i) => `[${i + 1}] ${p.title}: ${p.text}`).join('\n') : '(none found)'}` };
    },
  },
};

async function nliAnswer(c) {
  const ps = await passagesFor(c);
  if (!ps.length) return { ok: true, data: { verdict: 'unsupported', why: 'no passages' }, ms: 0 };
  const t = Date.now();
  const doc = ps.map((p) => `${p.title}: ${p.text}`).join('\n');
  const res = await fetch(`${CHECKERS}/stage1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairs: [{ doc, claim: c.claim }] }) });
  if (!res.ok) throw new Error(`fact checkers stage1 ${res.status}`);
  const r = ((await res.json()).results || [])[0] || {};
  const both = r.factcg >= 0.5 && r.minicheck >= 0.5;
  return { ok: true, data: { verdict: both ? 'verified' : 'unsupported', factcg: r.factcg, minicheck: r.minicheck }, ms: Date.now() - t };
}

// ── running ─────────────────────────────────────────────────────────────────
const cache = readJson(CACHE, {});
let dirty = 0;
const saveCache = (force = false) => { if (dirty && (force || dirty >= 5)) { writeJson(CACHE, cache); dirty = 0; } };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { saveCache(true); writeJson(path.join(OUT, 'retrieval-cache.json'), retrievalCache); process.exit(130); });

async function askLocal(taskName, task, c, cand) {
  const key = `${taskName}|${c.id}|${cand.id}`;
  if (cache[key] && !(cache[key].error && flag('retry-errors'))) return cache[key];
  if (REPORT_ONLY) return null;
  const req = await task.request(c);
  const t = Date.now();
  let entry;
  try {
    const r = await ollama.structured({ ...req, role: 'check', lane: 'background', models: [{ model: cand.model, effort: cand.effort }], timeoutMs: Number(process.env.EVAL_TIMEOUT_MS || 600000) });
    entry = { ok: true, data: r.data, ms: Date.now() - t, usage: r.usage, repaired: !!r.repaired };
  } catch (err) {
    entry = { ok: false, error: String(err.message || err).slice(0, 200), ms: Date.now() - t };
  }
  cache[key] = entry;
  dirty++;
  saveCache();
  return entry;
}

function median(xs) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
}

function score(task, cases, lookup) {
  const rows = cases.map((c) => {
    const e = lookup(c);
    const answer = e && e.ok ? task.answerOf(e.data) : null;
    return { case: c, entry: e, answer, ok: answer !== null && task.right(c, answer) };
  });
  const answered = rows.filter((r) => r.entry);
  const tps = answered.filter((r) => r.entry.ok && r.entry.usage && r.entry.usage.tokens_per_second).map((r) => r.entry.usage.tokens_per_second);
  return {
    n: rows.length,
    answered: answered.length,
    failed_calls: answered.filter((r) => !r.entry.ok).length,
    correct: rows.filter((r) => r.ok).length,
    // Over the cases this candidate answered, so a partial NVIDIA cache compares fairly.
    accuracy: Number((rows.filter((r) => r.ok).length / Math.max(1, answered.length)).toFixed(3)),
    median_ms: median(answered.filter((r) => r.entry.ok).map((r) => r.entry.ms)),
    ...(tps.length ? { tok_s: median(tps) } : {}),
    ...task.extra(rows.filter((r) => r.entry)),
  };
}

const headline = (s) => (s.balanced_accuracy != null ? s.balanced_accuracy : s.accuracy);

async function main() {
  const health = await ollama.health();
  if (!health.ok && !REPORT_ONLY) { console.log(`Ollama is not reachable (${health.why}). Start it, then re-run.`); return; }
  const installed = REPORT_ONLY ? new Map() : await ollama.installed();
  const candidates = LOCAL.filter((c) => (!wantedModels || wantedModels.includes(c.id)))
    .filter((c) => REPORT_ONLY || [...installed.keys()].some((n) => n === c.model || n === `${c.model}:latest`) || (console.log(`skip ${c.id}: ${c.model} not installed`), false));

  const nvCache = readJson(NVIDIA_CACHE, {});
  const taskNames = flag('tasks') && flag('tasks') !== true ? String(flag('tasks')).split(',') : [...Object.keys(LINEUP_TASKS), ...(flag('grounded') ? ['facts_rag', 'facts_nli'] : [])];
  const results = { run_at: new Date().toISOString(), host: 'Ryzen 9 6900HS, 31 GB RAM, RTX 3050 Laptop 4 GB', tasks: {} };

  // Jobs grouped by model, so each model loads once (a load is 3 s to a minute).
  const jobs = [];
  const caseSets = {};
  for (const name of taskNames) {
    if (name === 'facts_nli') { caseSets[name] = LINEUP_TASKS.facts.cases(); continue; }
    const g = GROUNDED_TASKS[name];
    const task = g ? { ...LINEUP_TASKS[g.base], ...g } : LINEUP_TASKS[name];
    if (!task) { console.log(`unknown task ${name}`); continue; }
    const cases = task.cases();
    if (!cases.length) { console.log(`${name}: no cases; skipped`); continue; }
    caseSets[name] = cases;
    for (const cand of candidates) for (const c of cases) jobs.push({ name, task, c, cand });
  }
  // Retrieval first, for every grounded case: the embedding model then loads once,
  // instead of swapping with the chat model on the 4 GB card for every case.
  if (!REPORT_ONLY && (caseSets.facts_rag || caseSets.facts_nli)) {
    if (!(await offline.isUp())) console.log('kiwix-serve is not running (tools/offline-sources/start-kiwix.*): grounded tasks will see no passages');
    const all = caseSets.facts_rag || caseSets.facts_nli;
    let n = 0;
    for (const c of all) {
      // eslint-disable-next-line no-await-in-loop
      await passagesFor(c);
      if (++n % 10 === 0) console.log(`  retrieved ${n}/${all.length}`);
    }
  }
  const order = candidates.map((c) => c.id);
  jobs.sort((a, b) => order.indexOf(a.cand.id) - order.indexOf(b.cand.id));
  const todo = REPORT_ONLY ? [] : jobs.filter((j) => { const e = cache[`${j.name}|${j.c.id}|${j.cand.id}`]; return !e || (e.error && flag('retry-errors')); });
  console.log(`${jobs.length} local answers needed, ${todo.length} not cached yet`);
  const started = Date.now();
  let done = 0;
  for (const j of todo) {
    // eslint-disable-next-line no-await-in-loop
    await askLocal(j.name, j.task, j.c, j.cand);
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${todo.length} (${Math.round((Date.now() - started) / 60000)} min, ${j.cand.id})`);
  }
  if (caseSets.facts_nli && !REPORT_ONLY) {
    for (const c of caseSets.facts_nli) {
      const key = `facts_nli|${c.id}|factcg+minicheck`;
      if (cache[key]) continue;
      // eslint-disable-next-line no-await-in-loop
      cache[key] = await nliAnswer(c).catch((err) => ({ ok: false, error: String(err.message).slice(0, 200) }));
      dirty++;
    }
  }
  saveCache(true);

  for (const [name, cases] of Object.entries(caseSets)) {
    const g = GROUNDED_TASKS[name];
    const base = name === 'facts_nli' ? 'facts' : g ? g.base : name;
    const task = LINEUP_TASKS[base];
    const scores = {};
    for (const cand of candidates) {
      const s = score(task, cases, (c) => cache[`${name}|${c.id}|${cand.id}`]);
      if (s.answered) scores[`local:${cand.id}`] = s;
    }
    if (name === 'facts_nli') {
      const s = score(task, cases, (c) => cache[`facts_nli|${c.id}|factcg+minicheck`]);
      if (s.answered) scores['local:factcg+minicheck'] = s;
    }
    for (const cand of NVIDIA_CANDIDATES) {
      const s = score(task, cases, (c) => nvCache[`${base}|${c.id}|${cand.id}`]);
      if (s.answered) scores[`nvidia:${cand.id}`] = s;
    }
    const ranking = Object.keys(scores).sort((a, b) => headline(scores[b]) - headline(scores[a]) || (scores[a].median_ms || 1e12) - (scores[b].median_ms || 1e12));
    results.tasks[name] = { base, cases: cases.length, config: g ? g.config : task.config, scores, ranking };
    console.log(`\n${name} (${cases.length} cases)`);
    for (const id of ranking) {
      const s = scores[id];
      console.log(`  ${id.padEnd(30)} ${headline(s)}  answered ${s.answered}/${s.n}  median ${s.median_ms} ms${s.tok_s ? `  ${s.tok_s} tok/s` : ''}${s.false_accepts != null ? `  false accepts ${s.false_accepts}` : ''}`);
    }
  }
  writeJson(REPORT.replace(/\.md$/, '.json'), results);
  writeReport(results);
  if (flag('write')) writeLocalLineup(results, candidates);
}

function writeReport(results) {
  const lines = ['# Local models vs the free NVIDIA lineup', '',
    `Run: ${results.run_at}, on ${results.host}. Produced by \`node scripts/local-model-eval.js\`; local answers are cached in \`cache.json\` here, NVIDIA answers are read from \`curriculum-build/model-lineup/cache.json\` (no NVIDIA calls are made by this script).`, '',
    'Same cases, prompts, schemas and scoring as `scripts/model-lineup-eval.js`. Accuracy is over the cases each model answered (the NVIDIA run may still be filling its cache; `answered` says how many). The headline is balanced accuracy where the task has one (facts, keys), else accuracy. Local latency is wall time on this laptop with one request at a time; NVIDIA latency includes queueing under its 40 RPM free tier.', ''];
  for (const [name, t] of Object.entries(results.tasks)) {
    lines.push(`## ${name} (${t.cases} cases) -> ${t.config.join(', ')}`, '');
    const cols = [...new Set(Object.values(t.scores).flatMap((s) => Object.keys(s)))].filter((k) => !['n', 'correct'].includes(k));
    lines.push(`| Model | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const id of t.ranking) {
      const s = t.scores[id];
      lines.push(`| ${id} | ${cols.map((k) => (typeof s[k] === 'object' && s[k] !== null ? JSON.stringify(s[k]) : s[k] == null ? '' : s[k])).join(' | ')} |`);
    }
    lines.push('');
  }
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`\nreport: ${path.relative(ROOT, REPORT)}`);
}

function writeLocalLineup(results, candidates) {
  const byId = Object.fromEntries(candidates.map((c) => [`local:${c.id}`, c]));
  const ratio = Number(process.env.LOCAL_FALLBACK_RATIO || 0.9);
  const lineup = readJson(LOCAL_LINEUP, {});
  lineup._doc = 'Which local (Ollama) model answers which task, measured by scripts/local-model-eval.js against the NVIDIA lineup on the same cases. Read by services/providers/ollama.js. "first": local before NVIDIA (as accurate as the NVIDIA winner); "fallback": local after NVIDIA, before Claude (at least LOCAL_FALLBACK_RATIO of the winner). See curriculum-build/OPTIMAL-FREE-SYSTEM.md.';
  lineup.tasks = lineup.tasks || {};
  const first = new Set(lineup.first || []);
  const fallback = new Set(lineup.fallback || []);
  for (const [, t] of Object.entries(results.tasks)) {
    // Only candidates that answered every case (a model run on a subset, or too slow
    // to finish, is reported but never written into the lineup).
    const locals = t.ranking.filter((id) => byId[id] && t.scores[id].answered === t.cases && !t.scores[id].failed_calls);
    // A wrong answer marked right is the worst grading outcome: fewest false accepts first.
    if (locals.length && t.scores[locals[0]].false_accepts != null) locals.sort((a, b) => t.scores[a].false_accepts - t.scores[b].false_accepts || headline(t.scores[b]) - headline(t.scores[a]));
    const nv = t.ranking.filter((id) => id.startsWith('nvidia:'));
    if (!locals.length) continue;
    const best = t.scores[locals[0]];
    const nvBest = nv.length ? t.scores[nv[0]] : null;
    // A model with more false accepts than the NVIDIA winner never answers that task.
    const safe = nvBest && nvBest.false_accepts != null ? locals.filter((id) => t.scores[id].false_accepts <= nvBest.false_accepts) : locals;
    if (!safe.length) continue;
    const models = safe.slice(0, 3).map((id) => ({ model: byId[id].model, effort: byId[id].effort }));
    for (const key of t.config) {
      lineup.tasks[key] = { models, eval: { task: t.base, best: locals[0], score: headline(best), nvidia_best: nv[0] || null, nvidia_score: nvBest ? headline(nvBest) : null, cases: t.cases, at: results.run_at } };
      first.delete(key); fallback.delete(key);
      if (nvBest && headline(best) >= headline(nvBest) && (best.false_accepts == null || best.false_accepts <= nvBest.false_accepts)) first.add(key);
      else if (nvBest && headline(best) >= ratio * headline(nvBest) && (best.false_accepts == null || best.false_accepts <= nvBest.false_accepts + 1)) fallback.add(key);
    }
  }
  lineup.first = [...first];
  lineup.fallback = [...fallback];
  lineup.default = lineup.default || { model: 'qwen3.5:4b', effort: 'off' };
  lineup.embed = lineup.embed || { model: 'qwen3-embedding:0.6b' };
  lineup.updated_at = new Date().toISOString();
  writeJson(LOCAL_LINEUP, lineup);
  console.log(`wrote ${path.relative(ROOT, LOCAL_LINEUP)}`);
}

main().catch((err) => { console.error(err.stack || err); saveCache(true); process.exit(1); });
