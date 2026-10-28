/**
 * The free model lineup for the staged skill curricula: drafting new lesson lines
 * (GLM 5.3 Flash on NVIDIA, free) and two independent free judges (Nemotron 3 Ultra
 * and DeepSeek V4.1 Flash on NVIDIA; GLM 5.3 @max stands in for DeepSeek when it is
 * rate limited). No Anthropic, no paid OpenRouter, no Jev: their keys are blanked
 * before .env is read. Every call is cached in free-model-runs.json, so a rerun only
 * asks what is new.
 *
 *   node curriculum-build/staged/skills/free-models.js draft     drafts lesson lines from lesson-specs.json
 *   node curriculum-build/staged/skills/free-models.js judge     both judges over judge-items.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..', '..');
for (const k of ['ANTHROPIC_API_KEY', 'FACT_CHECK_ANTHROPIC_KEY', 'FACT_CHECK_ANTHROPIC_WORKSPACE', 'MIMO_API_KEY', 'GEMINI_API_KEY', 'MODELFLARE_API_KEY',
  'OPENROUTER_API_KEY', 'OPENROUTER_GLM_API_KEY', 'OPENROUTER_DEEPSEEK_API_KEY', 'OPENROUTER_GPT_SOL_API_KEY', 'OPENROUTER_BUNNY_API_KEY', 'JEV_ENABLED']) process.env[k] = '';
const dotenv = require(path.join(APP, 'node_modules', 'dotenv'));
const here = path.join(APP, '.env');
dotenv.config({ path: fs.existsSync(here) ? here : path.join(APP, '..', '.env') });
process.env.NVIDIA_RPM = process.env.NVIDIA_RPM || '12'; // other agents share the key tonight: stay well under 40/min

const nvidia = require(path.join(APP, 'services', 'providers', 'nvidia.js'));

const RUNS = path.join(__dirname, 'free-model-runs.json');
const runs = fs.existsSync(RUNS) ? JSON.parse(fs.readFileSync(RUNS, 'utf8')) : { drafts: {}, judges: {} };
const save = () => fs.writeFileSync(RUNS, JSON.stringify(runs, null, 1));

const DRAFTER = [{ model: 'z-ai/glm-5.3-flash', effort: 'high' }, { model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'high' }];
const JUDGES = {
  A: [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }],
  B: [{ model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'high' }, { model: 'z-ai/glm-5.3', effort: 'max' }],
};

// Local fallback (owner rule: only after NVIDIA has failed for 15 minutes straight): standard,
// non-abliterated Ollama models, one loaded at a time; free RAM is checked before each call.
const LOCAL = process.argv.includes('--local');
const LOCAL_JUDGES = { A: 'qwen3.5:9b', B: 'gemma4:e4b-it-qat' };
async function callLocal(model, system, user) {
  const os = require('os');
  if (os.freemem() < 2.5 * 1024 ** 3) { console.log('  local: less than 2.5 GB free RAM; skipping'); return null; }
  const res = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, format: 'json', stream: false, keep_alive: 0, options: { temperature: 0 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  const j = await res.json();
  try { return { data: JSON.parse(j.message.content), model: `ollama:${model}`, effort: 'local' }; } catch { return null; }
}

// When NVIDIA refuses, xKiro's free models stand in (build use only, XKIRO_PIPELINE=1):
// the drafter goes to MiniMax M3.1 Flash, judge B to Qwen3.8 Max then Mistral Large 3,
// a different family from judge A (Nemotron), so the two verdicts stay independent.
const XKIRO_FALLBACK = new Map([
  [DRAFTER, ['minimax/minimax-m3.1-flash']],
  [JUDGES.B, ['qwen/qwen3.8-max:free', 'mistralai/mistral-large-2512']],
]);
async function callXkiro(models, system, user, schema, maxTokens) {
  const fallback = XKIRO_FALLBACK.get(models);
  if (!fallback || process.env.XKIRO_PIPELINE !== '1') return null;
  // eslint-disable-next-line global-require
  const { xkiro } = require(path.join(APP, 'services', 'providers', 'xkiro.js'));
  try {
    const r = await xkiro.structured({ system, user, schema, maxTokens, models: fallback });
    if (r && r.data) return { data: r.data, model: `xkiro:${r.model}`, effort: 'default' };
  } catch (e) {
    console.log(`  xkiro failed (${String(e.message).slice(0, 120)})`);
  }
  return null;
}

async function call(models, system, user, schema, maxTokens = 6000) {
  if (LOCAL && typeof models === 'string') return callLocal(models, system, user);
  // NVIDIA's models for this step are known to be refusing: go straight to xKiro.
  if (process.env.XKIRO_FIRST === '1') {
    const x = await callXkiro(models, system, user, schema, maxTokens);
    if (x) return x;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await nvidia.structured({ role: 'author', models, system, user, schema, maxTokens, lane: 'background' });
      if (r && r.data) return { data: r.data, model: r.model, effort: r.effort };
    } catch (e) {
      console.log(`  call failed (${String(e.message).slice(0, 120)}); retry ${attempt + 1}`);
      await new Promise((res) => setTimeout(res, 20000 * (attempt + 1)));
    }
  }
  return callXkiro(models, system, user, schema, maxTokens);
}

const DRAFT_SCHEMA = {
  type: 'object',
  properties: { lines: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, line: { type: 'string' } }, required: ['id', 'line'] } } },
  required: ['lines'],
};

async function draft() {
  const specs = JSON.parse(fs.readFileSync(path.join(__dirname, 'lesson-specs.json'), 'utf8')).specs;
  const todo = specs.filter((s) => !runs.drafts[s.id]);
  if (!todo.length) { console.log('all drafted (cached)'); return; }
  const system = 'You write single lesson lines for a curriculum. Follow the format exactly: [Tag] Title | description. '
    + 'Tag: exactly the tag given. Title: 3-12 words, Title Case, no numbering, no colon unless needed. Description: exactly one sentence of 10-25 words '
    + 'saying what the learner DOES, with one concrete example; no "|" and no "&" characters. Use only the facts given in the spec; add no new numbers, names or claims.';
  const user = 'Write one line for each spec. Reply with JSON {"lines":[{"id","line"}]}.\n\n' + todo.map((s) => `id: ${s.id}\ntag: ${s.tag}\nlearner: ${s.learner}\nwhat to teach: ${s.teach}\nfacts you may use: ${s.facts.join(' ')}\nexample to use: ${s.example}\nmust not repeat these existing titles: ${s.avoid.join('; ')}\n`).join('\n');
  const r = await call(DRAFTER, system, user, DRAFT_SCHEMA);
  if (!r) { console.log('drafting failed: no free model answered'); return; }
  for (const l of r.data.lines || []) if (todo.some((s) => s.id === l.id)) runs.drafts[l.id] = { line: l.line, model: r.model, effort: r.effort, at: new Date().toISOString() };
  save();
  console.log(`drafted ${Object.keys(runs.drafts).length} lines with ${r.model}`);
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: { verdicts: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, verdict: { type: 'string', enum: ['correct', 'wrong', 'unsure'] }, issue: { type: 'string' } }, required: ['id', 'verdict'] } } },
  required: ['verdicts'],
};

async function judge() {
  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'judge-items.json'), 'utf8')).items;
  const system = 'You are a strict, independent fact checker for a learning app covering chess, piano and basketball. For each item decide: '
    + '"correct" (every factual claim is accurate and the content fits the stated learner), "wrong" (any claim is false, misattributed, or the content does not fit), '
    + 'or "unsure" (you cannot tell). Never guess "correct": if you are not certain, answer "unsure". Give a one-sentence issue for anything not "correct".';
  for (const [name, nvModels] of Object.entries(JUDGES)) {
    const models = LOCAL ? LOCAL_JUDGES[name] : nvModels;
    const todo = items.filter((it) => !(runs.judges[name] && runs.judges[name][it.id]));
    for (let i = 0; i < todo.length; i += 10) {
      const batch = todo.slice(i, i + 10);
      const user = 'Judge each item. Reply with JSON {"verdicts":[{"id","verdict","issue"}]}.\n\n' + batch.map((it) => `id: ${it.id}\nkind: ${it.kind}\ncontext: ${it.context}\nitem: ${it.text}\n`).join('\n');
      console.log(`judge ${name}: items ${i + 1}-${i + batch.length} of ${todo.length}`);
      const r = await call(models, system, user, JUDGE_SCHEMA, 8000);
      if (!r) { console.log(`  judge ${name} gave no answer for this batch`); continue; }
      runs.judges[name] = runs.judges[name] || {};
      for (const v of r.data.verdicts || []) if (batch.some((b) => b.id === v.id)) runs.judges[name][v.id] = { verdict: v.verdict, issue: v.issue || '', model: r.model, effort: r.effort };
      save();
    }
  }
  console.log('judging done');
}

(async () => {
  if (!nvidia.isConfigured()) { console.log('NVIDIA_API_KEY not set; nothing run.'); return; }
  const cmd = process.argv[2];
  if (cmd === 'draft') await draft();
  else if (cmd === 'judge') await judge();
  else console.log('usage: free-models.js draft|judge');
})();
