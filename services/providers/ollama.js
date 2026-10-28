/**
 * Local models on this laptop, through the Ollama server (127.0.0.1:11434).
 * Free, private, no rate limit; bounded by the hardware instead:
 *   Ryzen 9 6900HS (8 cores), 31.2 GB RAM, RTX 3050 Laptop with 4 GB VRAM. The
 *   owner's rule (2026-10-23): total system RAM use at most 95%, so at least about
 *   1.6 GB stays free, measured live (other processes use about 20 GB); CPU and GPU
 *   may run at 100%.
 * So a model that fits the GPU (about 3.5 GB of weights) is fast, a bigger one is
 * split between GPU and RAM and slows down sharply, and the local fact checkers
 * (tools/fact-checkers/server.py) share the same RAM and GPU.
 *
 * What this provider is for (curriculum-build/OPTIMAL-FREE-SYSTEM.md): high-volume,
 * low-judgement work measured by scripts/local-model-eval.js (claim listing,
 * classification, embeddings for retrieval), and a last free answer when NVIDIA is
 * rate-limited or down, before anything paid. It is NOT a replacement for the NVIDIA
 * lineup on judgement tasks: the eval shows where it is good enough and where not.
 *
 * Same interface as services/providers/nvidia.js, so services/providers/index.js can
 * list it: isEnabled, isConfigured, status, modelFor, structured, structuredStream,
 * chat, chatStream, costCents, describeError, listModels; plus embed() and health().
 *
 *   - Native Ollama API (/api/chat, /api/embed). Structured output uses Ollama's
 *     `format: <JSON schema>`: the server constrains decoding to the schema, which
 *     makes small models far more reliable than asking for a tool call. The answer
 *     is still validated (structured-json.js) and gets one repair turn.
 *   - Reasoning: effort "off" sends think:false; any other effort sends think:true
 *     (Qwen 3.5 and Nemotron Nano honour it). A model without a thinking mode is
 *     retried without the field.
 *   - One request at a time by default (OLLAMA_CONCURRENCY): one GPU, and parallel
 *     slots multiply the KV cache. Interactive work goes ahead of background work.
 *   - Memory guard: a model is loaded only if its weights fit OLLAMA_MAX_MODEL_GB and
 *     the RAM it would take beyond the GPU is free right now (os.freemem) with
 *     headroom, so a big model never pushes the machine into swap or starves the
 *     fact checkers. Otherwise the call fails fast and the caller moves on.
 *   - Safety: models whose names say abliterated / derestricted / uncensored are
 *     refused (a kids' education app), whatever the configuration says.
 *
 * Which local model answers which task: config/local-lineup.json (written by
 * scripts/local-model-eval.js --write), then env OLLAMA_TASK_<TASK>=model[@effort],
 * then OLLAMA_MODEL, then the built-in default below.
 *
 * Env: OLLAMA_BASE_URL, OLLAMA_ENABLED=0 (off), OLLAMA_CONCURRENCY (1),
 * OLLAMA_TIMEOUT_MS, OLLAMA_NUM_CTX (8192), OLLAMA_KEEP_ALIVE (2m; idle models release RAM), OLLAMA_EMBED_KEEP_ALIVE (5m),
 * OLLAMA_MAX_MODEL_GB (18), OLLAMA_RAM_HEADROOM_GB (1.6: RAM that must stay free
 * after a load, the owner's 95% rule), OLLAMA_MIN_FREE_GB (2: below this a loaded
 * model is recycled to free its prompt cache), OLLAMA_GPU_GB (3.6),
 * OLLAMA_NUM_GPU (force a GPU layer count), OLLAMA_NUM_THREAD,
 * OLLAMA_EMBED_MODEL (qwen3-embedding:0.6b), LOCAL_LINEUP_FILE.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sj = require('./structured-json');

const BASE_URL = () => (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const LINEUP_FILE = () => process.env.LOCAL_LINEUP_FILE || path.join(__dirname, '..', '..', 'config', 'local-lineup.json');
const GB = 1024 ** 3;

const DEFAULT_MODEL = 'qwen3.5:4b';
const DEFAULT_EMBED = 'qwen3-embedding:0.6b';
const EFFORTS = ['off', 'low', 'medium', 'high', 'max'];
const UNSAFE = /abliterat|derestrict|uncensor|jailbreak|nsfw/i;

/** Thinking room on top of the answer budget (small models think long). */
const HEADROOM = { off: 0, low: 2048, medium: 4096, high: 8192, max: 16384 };
/** Local speed is roughly 5 to 60 tokens a second, so timeouts are generous. */
const TIMEOUTS = { off: 120000, low: 240000, medium: 300000, high: 600000, max: 900000 };

// ── configuration ───────────────────────────────────────────────────────────
let lineupCache = null;
let lineupStamp = null;
function readLineup() {
  const file = LINEUP_FILE();
  let stamp;
  try { stamp = `${file}:${fs.statSync(file).mtimeMs}`; } catch { stamp = `${file}:missing`; }
  if (lineupCache && stamp === lineupStamp) return lineupCache;
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
    if (!/missing$/.test(stamp)) console.warn(`ai: could not read ${file} (${err.message}); local models use their defaults`);
  }
  lineupCache = data;
  lineupStamp = stamp;
  return data;
}

/** "model@effort" or {model, effort} -> {model, effort} */
function entryOf(x, fallbackEffort = 'off') {
  if (!x) return null;
  if (typeof x === 'object') return x.model ? { model: String(x.model), effort: EFFORTS.includes(x.effort) ? x.effort : fallbackEffort } : null;
  const s = String(x).trim();
  if (!s) return null;
  const at = s.lastIndexOf('@');
  if (at > 0 && EFFORTS.includes(s.slice(at + 1))) return { model: s.slice(0, at), effort: s.slice(at + 1) };
  return { model: s, effort: fallbackEffort };
}
const envKey = (name) => String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');

/** The local models for a task, best first (never an unsafe one). */
function plan(role = 'fast', task = null) {
  const lineup = readLineup();
  let entries = [];
  const fromEnv = task && process.env[`OLLAMA_TASK_${envKey(task)}`];
  if (fromEnv) entries = fromEnv.split(',').map((s) => entryOf(s));
  else if (task && lineup.tasks && lineup.tasks[task] && Array.isArray(lineup.tasks[task].models)) entries = lineup.tasks[task].models.map((m) => entryOf(m));
  else if (lineup.roles && lineup.roles[role]) entries = [].concat(lineup.roles[role]).map((m) => entryOf(m));
  if (!entries.length) entries = [entryOf(process.env.OLLAMA_MODEL || (lineup.default && lineup.default.model) || DEFAULT_MODEL)];
  return entries.filter((e) => e && !UNSAFE.test(e.model));
}

/**
 * Whether the local lineup takes a task FIRST (before NVIDIA). Only tasks the eval
 * measured as good enough locally are listed in config/local-lineup.json "first".
 */
function takesFirst(task) {
  const lineup = readLineup();
  return !!(task && Array.isArray(lineup.first) && lineup.first.includes(task));
}

/**
 * Whether a local model may answer a task at all: it is listed "first" or
 * "fallback" in config/local-lineup.json (measured good enough), or
 * OLLAMA_FALLBACK_ALL=1 opts every task in as a last free answer before Claude.
 */
function servesTask(task) {
  if (String(process.env.OLLAMA_FALLBACK_ALL || '') === '1') return true;
  const lineup = readLineup();
  return !!(task && ((Array.isArray(lineup.first) && lineup.first.includes(task)) || (Array.isArray(lineup.fallback) && lineup.fallback.includes(task))));
}

// ── health and memory ───────────────────────────────────────────────────────
/**
 * Non-streamed requests go over node's http module, not fetch: Node's fetch (undici)
 * gives up after 300 s without response headers, and a non-streamed local call with
 * thinking on a split model takes longer than that (measured: "fetch failed" at 314 s
 * on qwen3.5:9b). Our own AbortController timeout applies instead.
 */
function httpFetch(url, { method = 'GET', signal, headers, body } = {}) {
  // eslint-disable-next-line global-require
  const http = require('http');
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ ok: res.statusCode < 400, status: res.statusCode, text: async () => text });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (signal) {
      if (signal.aborted) req.destroy(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      signal.addEventListener('abort', () => req.destroy(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }
    if (body) req.write(body);
    req.end();
  });
}
let fetchImpl = httpFetch;
let streamFetch = (...args) => fetch(...args);
let up = null;
let upCheckedAt = 0;
let upWhy = 'not checked yet';
let tagsCache = { at: 0, models: new Map() };

async function getJson(url, { method = 'GET', body = null, timeoutMs = 5000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method, signal: ctl.signal, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error(`ollama ${res.status}: ${(data && data.error) || text.slice(0, 200)}`), { status: res.status });
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error(`ollama: timed out after ${timeoutMs} ms`), { status: 0, timeout: true });
    if (err.status === undefined) err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Is the server up? Cached for 30 s; refreshed in the background by isEnabled. */
async function health() {
  try {
    const v = await getJson(`${BASE_URL()}/api/version`, { timeoutMs: 2000 });
    up = true;
    upWhy = `ollama ${v && v.version}`;
  } catch (err) {
    up = false;
    upWhy = `server not reachable (${err.message})`;
  }
  upCheckedAt = Date.now();
  return { ok: up, why: upWhy };
}

/** Installed models with their sizes (cached for a minute). */
async function installed() {
  if (Date.now() - tagsCache.at < 60000 && tagsCache.models.size) return tagsCache.models;
  const data = await getJson(`${BASE_URL()}/api/tags`, { timeoutMs: 20000 });
  const models = new Map();
  for (const m of (data && data.models) || []) models.set(m.name, { size: m.size || 0, details: m.details || {} });
  tagsCache = { at: Date.now(), models };
  return models;
}

/** Models loaded right now: name -> {size, size_vram}. */
async function loaded() {
  const data = await getJson(`${BASE_URL()}/api/ps`, { timeoutMs: 20000 }).catch(() => null);
  const out = new Map();
  for (const m of (data && data.models) || []) out.set(m.name, { size: m.size || 0, size_vram: m.size_vram || 0 });
  return out;
}

function resolveName(models, name) {
  if (models.has(name)) return name;
  if (!name.includes(':') && models.has(`${name}:latest`)) return `${name}:latest`;
  return null;
}

/** Throws (status 507) when loading `model` would break the memory budget. */
async function memoryCheck(model) {
  const models = await installed();
  const name = resolveName(models, model);
  if (!name) throw Object.assign(new Error(`ollama: ${model} is not installed (ollama pull ${model})`), { status: 404 });
  const size = models.get(name).size;
  const maxGb = Number(process.env.OLLAMA_MAX_MODEL_GB || 18);
  if (size > maxGb * GB) throw Object.assign(new Error(`ollama: ${model} is ${(size / GB).toFixed(1)} GB, over OLLAMA_MAX_MODEL_GB=${maxGb}`), { status: 507 });
  const headroom = Number(process.env.OLLAMA_RAM_HEADROOM_GB || 1.6) * GB;
  let now = await loaded();
  if (now.has(name)) {
    // The runner's prompt cache grows in RAM (see unload): recycle the model after
    // OLLAMA_RECYCLE_PROMPTS calls, or sooner when the machine runs short of RAM and
    // the cache has had time to grow. Never on every call: a reload costs 5-40 s.
    const calls = (callsSinceLoad.get(name) || 0) + 1;
    const short = os.freemem() < Math.max(headroom, Number(process.env.OLLAMA_MIN_FREE_GB || 2) * GB);
    if (calls > Number(process.env.OLLAMA_RECYCLE_PROMPTS || 40) || (short && calls > 10)) {
      await unload(name);
      callsSinceLoad.set(name, 1);
    } else callsSinceLoad.set(name, calls);
    return name;
  }
  callsSinceLoad.set(name, 1);
  const gpu = Number(process.env.OLLAMA_GPU_GB || 3.6) * GB;
  // RAM it will take: the weights the GPU cannot hold, plus about 10% for the KV cache
  // and buffers.
  const needRam = Math.max(0, size * 1.1 - gpu);
  if (needRam + headroom > os.freemem() && now.size) {
    for (const other of now.keys()) await unload(other); // eslint-disable-line no-await-in-loop
    now = await loaded();
  }
  if (needRam + headroom > os.freemem()) {
    throw Object.assign(new Error(`ollama: not enough free RAM for ${model} (needs ~${(needRam / GB).toFixed(1)} GB + ${(headroom / GB).toFixed(1)} GB headroom, ${(os.freemem() / GB).toFixed(1)} GB free)`), { status: 507 });
  }
  return name;
}

/**
 * Unload a model now. Measured on Ollama 0.40.5: its llama-server runner keeps a
 * prompt cache in host RAM of up to 8 GB ("cache state: 38 prompts, 8028 MiB
 * (limits: 8192 MiB)" in server.log), so a 3.3 GB model that ran 200 prompts held
 * 13.4 GB of private memory. Unloading frees it; nothing else does.
 */
async function unload(name) {
  await getJson(`${BASE_URL()}/api/generate`, { method: 'POST', body: { model: name, keep_alive: 0 }, timeoutMs: 30000 }).catch(() => null);
  for (let i = 0; i < 20; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await loaded()).has(name)) break;
    await new Promise((r) => { setTimeout(r, 250); }); // eslint-disable-line no-await-in-loop
  }
}

/**
 * Ollama's automatic fit keeps a large free-memory margin on a 4 GB card (measured:
 * qwen3.5:4b got 13 of 33 layers, 8 tokens/s). A model whose weights fit the card is
 * sent with every layer on the GPU (36 tokens/s measured); if that load fails (the
 * fact checkers hold some VRAM), the automatic split is used from then on.
 * OLLAMA_NUM_GPU forces a layer count for every model.
 */
const autoSplit = new Set();
const callsSinceLoad = new Map();
async function gpuLayers(name) {
  if (process.env.OLLAMA_NUM_GPU) return { num_gpu: Number(process.env.OLLAMA_NUM_GPU) };
  if (autoSplit.has(name)) return {};
  const models = await installed();
  const m = models.get(name);
  return m && m.size <= Number(process.env.OLLAMA_GPU_GB || 3.6) * GB ? { num_gpu: 999 } : {};
}

// ── a small priority queue: one GPU ─────────────────────────────────────────
const CONCURRENCY = () => Math.max(1, Number(process.env.OLLAMA_CONCURRENCY || 1));
let active = 0;
const waiting = { interactive: [], background: [] };
function pump() {
  while (active < CONCURRENCY()) {
    const next = waiting.interactive.shift() || waiting.background.shift();
    if (!next) return;
    active++;
    next();
  }
}
function acquire(priority) {
  return new Promise((resolve) => { (priority === 'interactive' ? waiting.interactive : waiting.background).push(resolve); pump(); });
}
function release() { active = Math.max(0, active - 1); pump(); }
const isInteractive = (role, lane) => (lane ? lane === 'interactive' : ['fast'].includes(role));

// ── requests ────────────────────────────────────────────────────────────────
const noThink = new Set();

function optionsFor(maxTokens, effort, extra = {}) {
  const think = effort !== 'off';
  return {
    temperature: extra.temperature != null ? extra.temperature : (think ? 0.6 : 0),
    num_ctx: Number(process.env.OLLAMA_NUM_CTX || 8192),
    num_predict: Math.max(64, Number(maxTokens) || 1024) + (HEADROOM[effort] || 0),
    ...(process.env.OLLAMA_NUM_THREAD ? { num_thread: Number(process.env.OLLAMA_NUM_THREAD) } : {}),
  };
}

function usageOf(r) {
  return {
    input_tokens: r.prompt_eval_count || 0,
    output_tokens: r.eval_count || 0,
    reasoning_tokens: 0,
    cost_usd: 0,
    tokens_per_second: r.eval_count && r.eval_duration ? Number((r.eval_count / (r.eval_duration / 1e9)).toFixed(1)) : null,
    load_ms: r.load_duration ? Math.round(r.load_duration / 1e6) : 0,
  };
}

/** One /api/chat call, queued, with the memory guard and the think fallback. */
async function send(entry, { messages, format = null, maxTokens, interactive, timeoutMs, temperature }) {
  if (UNSAFE.test(entry.model)) throw Object.assign(new Error(`ollama: ${entry.model} is not allowed in a kids' education app`), { status: 403, moveOn: true });
  await acquire(interactive ? 'interactive' : 'background');
  try {
    const name = await memoryCheck(entry.model);
    const wantThink = entry.effort !== 'off' && !noThink.has(name);
    const body = {
      model: name,
      messages,
      stream: false,
      keep_alive: process.env.OLLAMA_KEEP_ALIVE || '2m',
      options: { ...optionsFor(maxTokens, wantThink ? entry.effort : 'off', { temperature }), ...(await gpuLayers(name)) },
      ...(format ? { format } : {}),
      // think:false matters: Qwen 3.5 otherwise thinks by default.
      ...(noThink.has(name) ? {} : { think: wantThink }),
    };
    const limit = timeoutMs || Number(process.env.OLLAMA_TIMEOUT_MS) || TIMEOUTS[entry.effort] || 300000;
    try {
      return await getJson(`${BASE_URL()}/api/chat`, { method: 'POST', body, timeoutMs: limit });
    } catch (err) {
      if (body.options.num_gpu === 999 && err.status >= 500 && /memory|alloc|cuda|load/i.test(err.message)) {
        autoSplit.add(name);
        delete body.options.num_gpu;
        return await getJson(`${BASE_URL()}/api/chat`, { method: 'POST', body, timeoutMs: limit });
      }
      if (err.status === 400 && /think/i.test(err.message) && !noThink.has(name)) {
        noThink.add(name);
        delete body.think;
        body.options = optionsFor(maxTokens, 'off', { temperature });
        return await getJson(`${BASE_URL()}/api/chat`, { method: 'POST', body, timeoutMs: limit });
      }
      throw err;
    }
  } finally {
    release();
  }
}

function messagesFor(system, messages) {
  return [...(system ? [{ role: 'system', content: system }] : []), ...(messages || []).map((m) => ({ role: m.role, content: String(m.content == null ? '' : m.content) }))];
}

/**
 * One structured call: JSON matching `schema`, constrained by the server, then
 * validated and repaired once. Returns { data, usage, model, effort, tier: 'local' }.
 * Throws when no local model could answer, so a chain moves on.
 */
async function structured({ role = 'fast', task = null, system, user, schema, schemaName = 'submit', maxTokens = 2048, effort = null, lane, models = null, timeoutMs = null }) {
  if (!isConfigured()) return null;
  const entries = (models ? models.map((m) => entryOf(m)) : plan(role, task)).filter(Boolean)
    .map((e) => ({ ...e, effort: effort && EFFORTS.includes(effort) ? effort : e.effort }));
  const interactive = isInteractive(role, lane);
  const sys = `${system || ''}\n\nReply with one JSON object only, matching this JSON schema (${schemaName}):\n${JSON.stringify(schema)}`.trim();
  let lastErr = null;
  let unusable = false;
  for (const entry of entries) {
    const base = messagesFor(sys, [{ role: 'user', content: user }]);
    let r;
    try {
      r = await send(entry, { messages: base, format: schema, maxTokens, interactive, timeoutMs });
    } catch (err) { lastErr = err; continue; }
    const usage = usageOf(r);
    let parsed = sj.parseStructured({ content: r.message && r.message.content }, schemaName);
    let checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
    if (checked && !checked.errors.length) return { data: checked.value, usage, model: entry.model, effort: entry.effort, tier: 'local', ms: Math.round((r.total_duration || 0) / 1e6) };
    const problems = checked ? checked.errors.slice(0, 12).join('; ') : parsed.error;
    try {
      r = await send(entry, {
        messages: [...base, { role: 'assistant', content: String(parsed.raw || '').slice(0, 6000) || '(no answer)' },
          { role: 'user', content: `That answer could not be used: ${problems}${r.done_reason === 'length' ? ' (it was cut off: be more concise)' : ''}. Send the complete corrected JSON object now.` }],
        format: schema, maxTokens, interactive, timeoutMs,
      });
      const u2 = usageOf(r);
      usage.input_tokens += u2.input_tokens;
      usage.output_tokens += u2.output_tokens;
      parsed = sj.parseStructured({ content: r.message && r.message.content }, schemaName);
      checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
      if (checked && !checked.errors.length) return { data: checked.value, usage, model: entry.model, effort: entry.effort, tier: 'local', repaired: true };
    } catch (err) { lastErr = err; }
    unusable = true;
    console.warn(`ai: local ${entry.model} gave an unusable ${schemaName} (${String(problems).slice(0, 160)})`);
  }
  if (unusable) throw Object.assign(new Error(`ollama: no local model returned a usable ${schemaName}`), { status: 422, unusable: true });
  throw lastErr || new Error('ollama: no usable answer');
}
const structuredStream = (args) => structured(args);

/** One plain-text exchange. Returns { text, usage, model }; throws when nothing answered. */
async function chat({ role = 'fast', task = null, system, messages, maxTokens = 1024, effort = null, lane, model: wanted = null, timeoutMs = null }) {
  if (!isConfigured()) return null;
  const entries = (wanted ? [entryOf(wanted)] : plan(role, task)).filter(Boolean)
    .map((e) => ({ ...e, effort: effort && EFFORTS.includes(effort) ? effort : e.effort }));
  let lastErr = null;
  for (const entry of entries) {
    try {
      const r = await send(entry, { messages: messagesFor(system, messages), maxTokens, interactive: isInteractive(role, lane), timeoutMs, temperature: 0.7 });
      const text = sj.stripThinking(r.message && r.message.content);
      if (text) return { text, usage: usageOf(r), model: entry.model, effort: entry.effort, tier: 'local' };
    } catch (err) { lastErr = err; }
  }
  throw lastErr || Object.assign(new Error('ollama: no model returned text'), { status: 422, unusable: true });
}

/** Streamed text (the coach's interface). Only answer text reaches onDelta. */
async function chatStream({ role = 'fast', task = null, system, messages, maxTokens = 1024, effort = null, onDelta, timeoutMs = null }) {
  if (!isConfigured()) return null;
  const entry = plan(role, task)[0];
  if (!entry) return null;
  const e = { ...entry, effort: effort && EFFORTS.includes(effort) ? effort : entry.effort };
  await acquire('interactive');
  try {
    const name = await memoryCheck(e.model);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || TIMEOUTS[e.effort] || 300000);
    try {
      const res = await streamFetch(`${BASE_URL()}/api/chat`, {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name, messages: messagesFor(system, messages), stream: true, keep_alive: process.env.OLLAMA_KEEP_ALIVE || '2m', options: optionsFor(maxTokens, e.effort, { temperature: 0.7 }), ...(noThink.has(name) ? {} : { think: e.effort !== 'off' }) }),
      });
      if (!res.ok) throw Object.assign(new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      let last = {};
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let p;
          try { p = JSON.parse(line); } catch { continue; }
          last = p;
          const text = p.message && typeof p.message.content === 'string' ? p.message.content : '';
          if (!text) continue;
          full += text;
          if (onDelta) onDelta(text, full);
        }
      }
      const trimmed = sj.stripThinking(full);
      if (trimmed) return { text: trimmed, usage: usageOf(last), model: e.model, effort: e.effort, tier: 'local' };
      return null;
    } finally {
      clearTimeout(timer);
    }
  } finally {
    release();
  }
}

/** Embeddings for retrieval: [[float]] in the input's order. Queued behind chat only on the GPU. */
async function embed(texts, { model = process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED, timeoutMs = 120000 } = {}) {
  const input = [].concat(texts).map((t) => String(t == null ? '' : t));
  if (!input.length) return [];
  // Where the embedder runs: OLLAMA_EMBED_GPU=1 GPU, =0 CPU, unset: the GPU unless a
  // chat model is loaded there (on the 4 GB card the two do not fit together, and
  // swapping them costs seconds per call). Measured 2026-10-23, 16 passages: GPU
  // 1.2-1.8 s; CPU 14-21 s while other work had the CPU at 100% (Stockfish runs).
  // A model that is already loaded stays where it is until it is unloaded.
  let onGpu = process.env.OLLAMA_EMBED_GPU === '1';
  if (process.env.OLLAMA_EMBED_GPU === undefined || process.env.OLLAMA_EMBED_GPU === '') {
    const now = await loaded();
    onGpu = ![...now.keys()].some((n) => n !== model && !/embed/i.test(n));
  }
  if (onGpu) await acquire('background');
  try {
    const options = onGpu ? {} : { num_gpu: 0 };
    const data = await getJson(`${BASE_URL()}/api/embed`, { method: 'POST', body: { model, input, options, keep_alive: process.env.OLLAMA_EMBED_KEEP_ALIVE || '5m' }, timeoutMs });
    return (data && data.embeddings) || [];
  } finally {
    if (onGpu) release();
  }
}

// ── the provider interface ──────────────────────────────────────────────────
function isConfigured() { return String(process.env.OLLAMA_ENABLED || '1') !== '0'; }
/**
 * Synchronous, as index.js needs: true when the server answered in the last check
 * and the task is one the local lineup serves (servesTask).
 * A stale check refreshes in the background, so the first call after start-up may
 * see "not checked yet" and pass to the next provider.
 */
function isEnabled(role = 'fast', task = null) {
  if (!isConfigured()) return false;
  if (Date.now() - upCheckedAt > 30000) health().catch(() => {});
  return up === true && servesTask(task);
}
function status() { return { enabled: isEnabled(), reason: isConfigured() ? upWhy : 'OLLAMA_ENABLED=0' }; }
function modelFor(role = 'fast', task = null) { const e = plan(role, task)[0]; return e ? e.model : null; }
function costCents() { return 0; }
function describeError(err) { return err && err.message ? err.message : String(err); }
async function listModels() {
  const models = await installed();
  return [...models.keys()].filter((n) => !UNSAFE.test(n)).map((id) => ({ id, display: id, methods: ['chat', 'embed'] }));
}
function _setFetch(fn) { fetchImpl = fn || httpFetch; streamFetch = fn || ((...args) => fetch(...args)); }
function _reset() { up = null; upCheckedAt = 0; tagsCache = { at: 0, models: new Map() }; noThink.clear(); lineupCache = null; }

module.exports = {
  name: 'ollama',
  isEnabled,
  isConfigured,
  status,
  modelFor,
  plan,
  takesFirst,
  servesTask,
  structured,
  structuredStream,
  chat,
  chatStream,
  embed,
  health,
  installed,
  loaded,
  unload,
  costCents,
  describeError,
  listModels,
  readLineup,
  UNSAFE,
  _setFetch,
  _reset,
};
