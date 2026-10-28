/**
 * Night runner core: the paced model lanes, the answer cache and the token tally.
 *
 *   MiniMax M3.1 Flash (xKiro grant)  writer and blind judge A; adaptive concurrency
 *                                     (measured 2026-10-24 02:50 UTC: 10 tiny calls at once
 *                                     served, the 11th+ answered 429 "Too many event-token
 *                                     requests at once"), backs off on 429, never gives up on
 *                                     a lost connection (retries with backoff up to 5 min).
 *   Judge B (other families)          a pool of lanes, each paced on its own; a question is
 *                                     judged by whichever lane is free first:
 *                                       NVIDIA Nemotron Ultra (rests 10 min on a 429)
 *                                       UnoRouter Gemini 3.6 Flash :free (1 call / 63 s)
 *                                       UnoRouter Nemotron Ultra :free (1 call / 63 s)
 *                                       xKiro Qwen3.8 Max :free (only while the sliding
 *                                       24 h window has room)
 *
 * Every model answer is cached (state/cache.jsonl) under a hash of what was asked, so a
 * restart never asks twice. Build pipeline only: no learner's answers, essays or feedback
 * are ever sent; only content the app wrote (questions, keys, explanations, lesson text).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, loadKeys } = require('./env');

loadKeys(['XKIRO_API_KEY', 'XKIRO_BASE_URL', 'NVIDIA_API_KEY', 'UNOROUTER_API_KEY', 'UNOROUTER_BASE_URL', 'OPENROUTER_API_KEY']);
// Nothing paid is reachable from this process. The OpenRouter key is held privately and
// added only to requests that free-apis.js's openrouterFree sends (a :free id with
// OpenRouter's own $0 max_price cap, and a lock-off on any reported cost); the process
// environment holds a placeholder, so any other module that tried OpenRouter would fail.
const OR_KEY = String(process.env.OPENROUTER_API_KEY || '').trim();
for (const k of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'MIMO_API_KEY', 'MODELFLARE_API_KEY']) process.env[k] = '';
if (OR_KEY && process.env.NIGHT_OR_FREE !== '0') process.env.OPENROUTER_API_KEY = 'placeholder-night-runner';
process.env.OLLAMA_ENABLED = '0';
process.env.XKIRO_PIPELINE = '1';
process.env.UNOROUTER_PIPELINE = '1';
process.env.XKIRO_RETRIES = '0';
process.env.XKIRO_REST_MS = '0';
process.env.UNOROUTER_RETRIES = '0';
// 2026-10-24 14:10: NVIDIA's key allows 40 RPM (shared with the placement agent); the
// runner takes up to 30 and every model lane rests on its own 429.
process.env.NVIDIA_RPM = process.env.NVIDIA_RPM || '30';
process.env.NVIDIA_CONCURRENCY = process.env.NVIDIA_CONCURRENCY || '14';
// UnoRouter's limits are per model (gemini 1/min, nemotron ultra 5/min); each pool lane
// paces its own model, so the module's one-gap-for-all is set short.
process.env.UNOROUTER_GAP_MS = process.env.UNOROUTER_GAP_MS || '1500';

const xk = require(path.join(ROOT, 'services', 'providers', 'xkiro.js'));
const nvidia = require(path.join(ROOT, 'services', 'providers', 'nvidia.js'));
const unoMod = require(path.join(ROOT, 'services', 'providers', 'unorouter.js'));
const { unorouter } = unoMod;
const sj = require(path.join(ROOT, 'services', 'providers', 'structured-json.js'));
const freeApis = require(path.join(ROOT, 'services', 'providers', 'free-apis.js'));
// the real OpenRouter key goes only on openrouterFree's requests to openrouter.ai
freeApis._setFetch((url, opts = {}) => {
  if (OR_KEY && String(url).startsWith('https://openrouter.ai/api/v1/chat/completions')) {
    opts = { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${OR_KEY}` } };
  }
  return fetch(url, opts);
});

// ── rescuing replies the providers call "unusable" ──────────────────────────
// About 30% of MiniMax replies were refused by the strict schema check (measured
// 06:45 UTC: 516 answered calls, 365 usable), mostly for a null where a string or
// list was expected. The raw reply of each chat call is kept briefly so such a reply
// can be cleaned (null -> "" or [], or dropped when optional) and checked again,
// instead of paying for the same call twice.
const rawByKey = new Map();
const rawKey = (model, user) => hash([model, String(user || '')]);
function tapFetch(url, opts) {
  return fetch(url, opts).then(async (r) => {
    if (/chat\/completions$/.test(String(url))) {
      try {
        const b = JSON.parse(opts.body);
        rawByKey.set(rawKey(b.model, b.messages[b.messages.length - 1].content), await r.clone().text());
        while (rawByKey.size > 60) rawByKey.delete(rawByKey.keys().next().value);
      } catch { /* */ }
    }
    return r;
  });
}
xk._setFetch(tapFetch);
unoMod._setFetch(tapFetch);
function denull(v, schema) {
  if (!schema || v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map((x) => denull(x, schema.items));
  if (typeof v === 'object' && schema.properties) {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const ps = schema.properties[k];
      const t = ps && (Array.isArray(ps.type) ? ps.type[0] : ps.type);
      if (val === null && ps) {
        if (t === 'string') out[k] = '';
        else if (t === 'array') out[k] = [];
        else if (!(schema.required || []).includes(k)) continue;
        else out[k] = val;
      } else out[k] = denull(val, ps);
    }
    return out;
  }
  return v;
}
function rescue(model, user, schema, schemaName) {
  const raw = rawByKey.get(rawKey(model, user));
  if (!raw) return { why: 'no raw reply kept' };
  let p;
  try { p = JSON.parse(raw); } catch { return { why: 'raw reply not JSON' }; }
  const ch = p.choices && p.choices[0];
  const fin = ch && ch.finish_reason;
  const parsed = sj.parseStructured(ch && ch.message, schemaName);
  if (parsed.data === undefined) return { fin, why: parsed.error, head: String(parsed.raw || '').slice(0, 160) };
  const c = sj.validate(schema, denull(parsed.data, schema));
  if (c.errors.length) return { fin, why: c.errors.slice(0, 3).join('; ') };
  const u = p.usage || {};
  return { value: c.value, usage: { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 } };
}
const rescued = { ok: 0, failed: 0, reasons: {} };

const HERE = __dirname;
const STATE = path.join(HERE, 'state');
fs.mkdirSync(STATE, { recursive: true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const now = () => Date.now();
const LOG = path.join(HERE, 'runner.log');
function log(...a) {
  const line = `${new Date().toISOString().slice(0, 19)}Z ${a.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(LOG, `${line}\n`); } catch { /* */ }
}
const hash = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');

// ── the answer cache ─────────────────────────────────────────────────────────
const CACHE_FILE = path.join(STATE, 'cache.jsonl');
const cache = new Map();
if (fs.existsSync(CACHE_FILE)) {
  for (const l of fs.readFileSync(CACHE_FILE, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { const r = JSON.parse(l); cache.set(r.k, r.v); } catch { /* a torn last line */ }
  }
}
function cacheGet(k) { return cache.get(k); }
function cachePut(k, v) { cache.set(k, v); fs.appendFileSync(CACHE_FILE, `${JSON.stringify({ k, v })}\n`); }

// ── the token tally, per job and model (accumulates across restarts) ─────────
const TALLY_FILE = path.join(STATE, 'tokens.json');
let tally = {};
try { tally = JSON.parse(fs.readFileSync(TALLY_FILE, 'utf8')); } catch { tally = {}; }
function addTokens(job, model, usage, extra = {}) {
  const row = ((tally[job] = tally[job] || {})[model] = tally[job][model] || { calls: 0, input: 0, output: 0, cached: 0, failed: 0 });
  if (usage) { row.calls++; row.input += usage.input_tokens || 0; row.output += usage.output_tokens || 0; }
  for (const [k, v] of Object.entries(extra)) row[k] = (row[k] || 0) + v;
}
function saveTally() { try { fs.writeFileSync(TALLY_FILE, JSON.stringify(tally, null, 1)); } catch { /* */ } }
setInterval(saveTally, 30000).unref();

// ── MiniMax lanes ────────────────────────────────────────────────────────────
// Measured under load (03:00-03:10 UTC): xKiro serves about 2 long MiniMax calls at once
// (tiny calls finish too fast to collide, so the 10-at-once probe overstated it). A second
// MiniMax lane is UnoRouter's MiniMax M3.1 Flash :free (about 1 call a minute, $0, build
// pipeline only). Calls are handed out round-robin across jobs, so every job progresses.
const MM = 'minimax/minimax-m3.1-flash';
const MM_UNO = 'minimax-m3.1-flash:free';
const MM_MIN = Number(process.env.MM_MIN || 1);
const mm = { limit: Number(process.env.MM_CONC || 2), max: Number(process.env.MM_MAX || 10), active: 0, queues: new Map(), rr: [], okStreak: 0, pauseUntil: 0, fatal: null, n429: 0, ok: 0 };
// UnoRouter's MiniMax :free is now a lane of the pool below (writer, and judge for others' items).
const uno = { on: process.env.MM_UNO === '1', active: 0, nextAt: 0, restUntil: 0, ok: 0, fail: 0 };
const queued = () => [...mm.queues.values()].reduce((s, q) => s + q.filter((w) => !w.dead).length, 0);
function nextWaiter() {
  // MiniMax judging the priority placement sets goes ahead of the writes
  const jq = mm.queues.get('judging');
  while (jq && jq.length && jq[0].dead) jq.shift();
  if (jq && jq.length) return jq.shift();
  for (let i = 0; i < mm.rr.length; i++) {
    const job = mm.rr.shift();
    mm.rr.push(job);
    const q = mm.queues.get(job);
    while (q && q.length && q[0].dead) q.shift(); // a write the pool took first
    if (q && q.length) return q.shift();
  }
  return null;
}
let mmTimer = null;
function mmPump() {
  if (mmTimer) { clearTimeout(mmTimer); mmTimer = null; }
  const t = now();
  while (queued() && mm.active < mm.limit && t >= mm.pauseUntil) { mm.active++; nextWaiter()('xkiro'); }
  if (uno.on && queued() && uno.active < 1 && t >= uno.nextAt && t >= uno.restUntil) { uno.active++; uno.nextAt = t + 63000; nextWaiter()('uno'); }
  if (queued()) mmTimer = setTimeout(mmPump, Math.max(1000, Math.min(...[mm.pauseUntil, uno.on ? Math.max(uno.nextAt, uno.restUntil) : Infinity].map((x) => x - t).filter((x) => x > 0), 30000)));
}
// race: a pool write request (see write()); whichever of MiniMax and the pool is free first takes it
const mmAcquire = (job, race = null) => new Promise((res) => {
  if (!mm.queues.has(job)) { mm.queues.set(job, []); mm.rr.push(job); }
  const w = (lane) => {
    if (race) {
      if (race.taken) { mmRelease(lane); res(null); return; }
      race.taken = true; race.owner = 'mm';
    }
    res(lane);
  };
  if (race) race.cancelMM = () => { w.dead = true; res(null); };
  mm.queues.get(job).push(w);
  mmPump();
});
function mmRelease(lane) { if (lane === 'uno') uno.active--; else mm.active--; mmPump(); }

/** One MiniMax structured call, cached. Throws only on a grant refusal or a reply that stays unusable. */
async function minimax({ job, key, system, user, schema, schemaName, maxTokens: maxTokens0 = 6000, race = null }) {
  // MiniMax reasons at length (default effort max); a reply cut off by its reasoning is empty
  // (finish "length") and wasted, so every call gets room for it. Unused room costs nothing.
  let maxTokens = Math.max(maxTokens0, Number(process.env.MM_MIN_TOKENS || 12000));
  // Measured 07:00-07:50 UTC: at its default effort (max) MiniMax sometimes reasons without end,
  // and retries with ever more room burned ~1M tokens for 20 answers. So: effort high, a fixed
  // limit, and after a reply cut off by its reasoning one retry at medium.
  let effort = process.env.MM_EFFORT || 'high';
  const k = hash(['mm', key || [system, user, schemaName]]);
  const hit = cacheGet(k);
  if (hit) { addTokens(job, hit.model || MM, null, { cached: 1 }); return hit; }
  let unusable = 0;
  let n429 = 0;
  for (let attempt = 0; ; attempt++) {
    if (mm.fatal && !uno.on) throw Object.assign(new Error(`minimax stopped: ${mm.fatal}`), { fatal: true });
    // eslint-disable-next-line no-await-in-loop
    const lane = await mmAcquire(job, race);
    if (lane === null) return null; // the pool took this write first
    race = null;
    const model = lane === 'uno' ? MM_UNO : MM;
    let wait = 0;
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = lane === 'uno'
        ? await unorouter.structured({ system, user, schema, schemaName, maxTokens, models: [MM_UNO], timeoutMs: 420000 })
        : await xk.xkiro.structured({ system, user, schema, schemaName, maxTokens, models: [MM], timeoutMs: 420000, reasoningEffort: effort });
      addTokens(job, model, r.usage);
      if (lane === 'uno') uno.ok++;
      else {
        mm.ok++;
        if (++mm.okStreak >= 8 && mm.limit < mm.max && now() - (mm.lastDown || 0) > 90000) { mm.limit++; mm.okStreak = 0; log(`minimax: concurrency up to ${mm.limit}`); }
      }
      const v = { data: r.data, model: r.model || model, usage: r.usage, at: new Date().toISOString() };
      cachePut(k, v);
      return v;
    } catch (err) {
      if (err.unusable || err.status === 422) {
        const rs = rescue(model, user, schema, schemaName);
        if (rs.value) {
          rescued.ok++;
          addTokens(job, model, rs.usage, { rescued: 1 });
          const v = { data: rs.value, model, usage: rs.usage, at: new Date().toISOString(), rescued: true };
          cachePut(k, v);
          return v;
        }
        rescued.failed++;
        const why = `${rs.fin || '?'}: ${String(rs.why).slice(0, 60)}`;
        rescued.reasons[why] = (rescued.reasons[why] || 0) + 1;
        if (rescued.failed <= 40) log(`minimax unusable (${model}): finish ${rs.fin}; ${String(rs.why).slice(0, 140)}${rs.head ? ` | ${rs.head.replace(/\s+/g, ' ').slice(0, 120)}` : ''}`);
        // a reply cut off by its reasoning (finish "length") counts its tokens; give the retry more room
        if (rs.fin === 'length') effort = 'medium';
      }
      addTokens(job, model, null, { failed: 1 });
      if (lane === 'uno') {
        uno.fail++;
        log(`minimax (UnoRouter): ${String(err.message).slice(0, 140)}`);
        if (err.status === 402 || err.status === 403) { uno.restUntil = now() + 10 * 60000; } // e.g. its model list failed to load: try again later else if (err.status === 429) uno.restUntil = now() + 5 * 60000;
        else if (err.unusable || err.status === 422) {
          if (++unusable >= 3) throw err;
        } else uno.restUntil = now() + 60000;
      } else if (err.status === 402 || err.status === 403) {
        mm.fatal = err.message; mm.limit = 0; log(`minimax (xKiro): FATAL ${err.message}`);
        if (!uno.on) throw Object.assign(err, { fatal: true });
      } else if (err.status === 429) {
        // Calls in flight meet the same 429 together: step down once per 10 s, not per call.
        mm.n429++; mm.okStreak = 0;
        if (now() - (mm.lastDown || 0) > 10000) {
          const before = mm.limit;
          mm.limit = Math.max(MM_MIN, mm.limit - 1);
          mm.lastDown = now();
          if (before !== mm.limit) log(`minimax: 429 (${String(err.message).slice(0, 60)}); concurrency ${before} -> ${mm.limit}`);
        }
        mm.pauseUntil = Math.max(mm.pauseUntil, now() + 5000);
        // each call backs off on its own too: 5 s, 10 s, 20 s ... up to 2 min (no hammering)
        wait = Math.min(120000, 5000 * 2 ** Math.min(n429++, 5)) * (0.7 + Math.random() * 0.6);
      } else if (err.unusable || err.status === 422) {
        if (++unusable >= 3) throw err;
        wait = 2000;
      } else {
        // network, timeout, 5xx: a lost connection is retried with backoff, never dropped
        wait = Math.min(300000, 10000 * 2 ** Math.min(attempt, 5));
        log(`minimax: ${String(err.message).slice(0, 120)}; retry in ${Math.round(wait / 1000)} s`);
      }
    } finally {
      mmRelease(lane);
    }
    // eslint-disable-next-line no-await-in-loop
    if (wait) await sleep(wait);
  }
}

// ── the free model pool: writer lanes, blind-judge lanes and source readers ────
// 2026-10-24 14:10 UTC (owner: "use multiple free services to move with the same full
// 100% accuracy, but faster"). MiniMax on xKiro allows only 2 calls at once, so every
// free provider with its own separate limit gets lanes, each paced on its own:
//   NVIDIA (one key, 40 RPM, shared with other agents): Nemotron Ultra, Nemotron Lightning,
//     GLM 5.3 Flash, GLM 5.3, DeepSeek V4.1 Flash (each lane rests on its own 429)
//   xKiro $0 models (sliding 24 h window): Qwen3.8 Max
//   UnoRouter :free (about 1 call a minute per model): Gemini 3.6 Flash, Qwen3.6 35B,
//     Nemotron Ultra, MiniMax M3.1 Flash, GLM 5.3, Kimi K3
//   OpenRouter :free ($0 max_price cap; any reported cost locks it off): Nemotron Ultra,
//     Gemma 4 31B, Nemotron Super
// The rules the pool enforces for every item (the jobs record them per item):
//   - the writer's family is never one of its judges' families;
//   - its two blind judges are two DIFFERENT families (judgeTwo), so neither judge is the
//     writer model or the writer's family, and the two are independent of each other;
//   - a source reader is never the writer's family.
// Writers are tried in the owner's order (xKiro MiniMax first, then NVIDIA, xKiro $0,
// UnoRouter, OpenRouter): a write goes to whichever allowed lane is free first, with MiniMax
// racing the pool. A writer whose items keep failing is switched off (writerOn).
const QWEN_STOP = Number(process.env.QWEN_STOP_AT || 440000);
function familyOf(model) {
  const m = String(model || '').toLowerCase();
  if (/claude|haiku|anthropic/.test(m)) return 'anthropic';
  if (/minimax/.test(m)) return 'minimax';
  if (/nemotron/.test(m)) return 'nemotron';
  if (/glm/.test(m)) return 'glm';
  if (/deepseek/.test(m)) return 'deepseek';
  if (/gemini|gemma/.test(m)) return 'google';
  if (/qwen|qwq/.test(m)) return 'qwen';
  if (/kimi/.test(m)) return 'kimi';
  if (/gpt-oss|openai|gpt-d|luna/.test(m)) return 'openai';
  if (/mistral|ministral|codestral/.test(m)) return 'mistral';
  return m;
}
const NV = (model, effort, t = 300000) => (a) => nvidia.structured({ role: 'check', ...a, models: [{ model, effort }], timeoutMs: t, attempts: 1, lane: 'background' });
const UNO = (model) => (a) => unorouter.structured({ ...a, models: [model], timeoutMs: 300000 });
const ORF = (model) => (a) => freeApis.openrouterFree.structured({ ...a, models: [model], timeoutMs: 240000 }).then((r) => { if (!r) throw Object.assign(new Error('openrouter_free not configured'), { status: 403 }); return r; });
const UNO_GAP = 63000;
const haiku = require('./mf-haiku');
const HAIKU_MODEL = `modelflare/${haiku.env().model || 'claude-haiku-5-5'}`;
const LUNA_MODEL = `modelflare/${haiku.luna.env().model || 'gpt-6-luna'}`;
const lanes = [
  // Modelflare Claude Haiku 5.5 (owner, 2026-10-25): placement judge B only (kinds psB-*), its own key,
  // a $1 hard cap kept by mf-haiku.js (ledger in the scratchpad). On only with POOL_HAIKU=1 and the key in .env.
  { off: process.env.POOL_HAIKU !== '1' || !haiku.configured(), name: 'mf-haiku-5.5', model: HAIKU_MODEL, conc: Number(process.env.HAIKU_CONC || 2), gapMs: 1500, rest429: 2 * 60000, roles: ['judge'], kindsOnly: /^psB-/, call: (a) => haiku.structured({ ...a, purpose: 'placement-items', maxTokens: Math.max(a.maxTokens || 0, 16000), tag: 'pool' }) },
  // Modelflare Luna 6 (family openai, its own key): the same rules, on only with POOL_LUNA=1.
  { off: process.env.POOL_LUNA !== '1' || !haiku.luna.configured(), name: 'mf-luna-6', model: LUNA_MODEL, conc: Number(process.env.LUNA_CONC || 2), gapMs: 1500, rest429: 2 * 60000, roles: ['judge'], kindsOnly: /^ps[AB]-/, call: (a) => haiku.luna.structured({ ...a, purpose: 'placement-items', maxTokens: Math.max(a.maxTokens || 0, 16000), tag: 'pool' }) },
  { name: 'nv-nemotron-ultra', model: 'nvidia/nemotron-3-ultra-550b-a55b', conc: 3, gapMs: 2000, rest429: 4 * 60000, roles: ['write', 'judge', 'read'], call: NV('nvidia/nemotron-3-ultra-550b-a55b', 'medium') },
  // GLM 5.3 Flash: ERR on the probes since 13:03 and no answer in 5 min at 14:15, so off unless POOL_GLM_FLASH=1
  { off: process.env.POOL_GLM_FLASH !== '1', name: 'nv-glm-5.3-flash', model: 'z-ai/glm-5.3-flash', conc: 3, gapMs: 2000, rest429: 4 * 60000, roles: ['write', 'judge', 'read'], call: NV('z-ai/glm-5.3-flash', 'high') },
  { name: 'nv-glm-5.3', model: 'z-ai/glm-5.3', conc: 4, gapMs: 2000, rest429: 4 * 60000, roles: ['write', 'judge', 'read'], call: NV('z-ai/glm-5.3', 'high', 420000) },
  // DeepSeek V4.1 Flash: ERR on every probe today (nvidia-probe-log.txt), and a call hangs to its timeout, so it is off unless POOL_DEEPSEEK=1
  // Answered a probe at 00:05 UTC 2026-10-25 in 38 s, so POOL_DEEPSEEK=1 turns it back on. Max
  // reasoning, as the owner asked for DeepSeek on max-model jobs; a strong judge (placement sets).
  { off: process.env.POOL_DEEPSEEK !== '1', name: 'nv-deepseek-v4.1-flash', model: 'deepseek-ai/deepseek-v4.1-flash', conc: 2, gapMs: 2000, rest429: 6 * 60000, roles: ['write', 'judge'], call: NV('deepseek-ai/deepseek-v4.1-flash', 'max', 420000) },
  // gpt-oss 20B (OpenAI family) on NVIDIA: answered a probe at 14:18 in 2 s; judge only
  { name: 'nv-gpt-oss-20b', model: 'openai/gpt-oss-20b', conc: 3, gapMs: 1500, rest429: 4 * 60000, roles: ['judge', 'read'], call: NV('openai/gpt-oss-20b', 'high') },
  { name: 'nv-nemotron-lightning', model: 'nvidia/nemotron-3.5-lightning-30b-a3b', conc: 4, gapMs: 1500, rest429: 4 * 60000, roles: ['judge', 'read'], call: NV('nvidia/nemotron-3.5-lightning-30b-a3b', 'high') },
  // MiniMax (xKiro grant) as a blind judge, only for items another family wrote: it shares the
  // MiniMax slots with the writes (one judge call covers up to 12 questions)
  { name: 'xk-minimax-judge', model: MM, conc: 2, gapMs: 1000, rest429: 60000, roles: ['judge', 'read'], call: (a) => minimax({ job: 'judging', ...a }) },
  { name: 'xk-qwen3.8-max', model: 'qwen/qwen3.8-max:free', conc: 1, gapMs: 5000, rest429: 15 * 60000, roles: ['write', 'judge', 'read'], ready: () => xk.freeTokensToday() + 12000 <= QWEN_STOP, call: (a) => xk.xkiro.structured({ ...a, models: ['qwen/qwen3.8-max:free'], timeoutMs: 240000 }) },
  { name: 'uno-gemini-3.6-flash', model: 'gemini-3.6-flash:free', conc: 1, gapMs: UNO_GAP, rest429: 3 * 60000, roles: ['write', 'judge', 'read'], call: UNO('gemini-3.6-flash:free') },
  { name: 'uno-qwen3.6-35b', model: 'qwen3.6-35b-a3b:free', conc: 1, gapMs: UNO_GAP, rest429: 3 * 60000, roles: ['write', 'judge', 'read'], call: UNO('qwen3.6-35b-a3b:free') },
  { name: 'uno-nemotron-ultra', model: 'nemotron-3-ultra-550b-a55b:free', conc: 1, gapMs: 15000, rest429: 3 * 60000, roles: ['write', 'judge'], call: UNO('nemotron-3-ultra-550b-a55b:free') },
  { name: 'uno-minimax', model: 'minimax-m3.1-flash:free', conc: 1, gapMs: UNO_GAP, rest429: 3 * 60000, roles: ['write', 'judge'], call: UNO('minimax-m3.1-flash:free') },
  { name: 'uno-glm-5.3', model: 'glm-5.3:free', conc: 1, gapMs: UNO_GAP, rest429: 3 * 60000, roles: ['write', 'judge'], call: UNO('glm-5.3:free') },
  { name: 'uno-kimi-k3', model: 'kimi-k3:free', conc: 1, gapMs: UNO_GAP, rest429: 3 * 60000, roles: ['write', 'judge'], call: UNO('kimi-k3:free') },
  { name: 'or-nemotron-ultra', model: 'nvidia/nemotron-3-ultra-550b-a55b:free', conc: 1, gapMs: 4000, rest429: 10 * 60000, roles: ['write', 'judge'], call: ORF('nvidia/nemotron-3-ultra-550b-a55b:free') },
  { name: 'or-gemma-4-31b', model: 'google/gemma-4-31b-it:free', conc: 1, gapMs: 4000, rest429: 10 * 60000, roles: ['judge'], call: ORF('google/gemma-4-31b-it:free') },
  { name: 'or-nemotron-super', model: 'nvidia/nemotron-3-super-120b-a12b:free', conc: 1, gapMs: 4000, rest429: 10 * 60000, roles: ['judge'], call: ORF('nvidia/nemotron-3-super-120b-a12b:free') },
].map((l, i) => ({ ...l, family: familyOf(l.model), active: 0, nextAt: /^uno-/.test(l.name) ? now() + i * 11000 : 0, restUntil: 0, ok: 0, fail: 0, r429: 0, n429: 0, questions: 0, writes: 0, reads: 0, lastErr: null, flip: false }));
for (let i = lanes.length - 1; i >= 0; i--) if (lanes[i].off) lanes.splice(i, 1);
if (process.env.POOL_LANES) { const keep = new Set(process.env.POOL_LANES.split(',')); for (let i = lanes.length - 1; i >= 0; i--) if (!keep.has(lanes[i].name)) lanes.splice(i, 1); }
if (!OR_KEY || process.env.NIGHT_OR_FREE === '0') for (let i = lanes.length - 1; i >= 0; i--) if (/^or-/.test(lanes[i].name)) lanes.splice(i, 1);
// The strongest free judges; a kind with strong: true (the placement sets) is judged only by these.
const STRONG = new Set([MM, 'nvidia/nemotron-3-ultra-550b-a55b', 'z-ai/glm-5.3', 'qwen/qwen3.8-max:free', 'gemini-3.6-flash:free', 'nemotron-3-ultra-550b-a55b:free', 'minimax-m3.1-flash:free', 'glm-5.3:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'deepseek-ai/deepseek-v4.1-flash', HAIKU_MODEL, LUNA_MODEL]);
const ALL_FAMILIES = [...new Set(['minimax', ...lanes.map((l) => l.family)])];
const laneReady = (l, t) => l.active < l.conc && t >= l.nextAt && t >= l.restUntil && (!l.ready || l.ready());

// ── per-writer quality record (accumulates across restarts) ──────────────────
const WRITERS_FILE = path.join(STATE, 'writers.json');
let writers = {};
try { writers = JSON.parse(fs.readFileSync(WRITERS_FILE, 'utf8')); } catch { writers = {}; }
const W_FIELDS = ['written', 'code_pass', 'judged', 'a_key', 'b_key', 'both_key', 'judges_same_pick', 'fact_claims', 'sourced', 'kept'];
function writerStat(model, counts) {
  const r = (writers[model] = writers[model] || Object.fromEntries(W_FIELDS.map((f) => [f, 0])));
  for (const [k, v] of Object.entries(counts)) r[k] = (r[k] || 0) + v;
}
function saveWriters() { try { fs.writeFileSync(WRITERS_FILE, JSON.stringify(writers, null, 1)); } catch { /* */ } }
setInterval(saveWriters, 30000).unref();
const W_MIN_N = Number(process.env.WRITER_MIN_N || 40);
const W_MIN_KEEP = Number(process.env.WRITER_MIN_KEEP || 0.6);
/**
 * A writer stays on until 40+ of its questions have both verdicts and its estimated keep rate
 * (share passing the code checks x share both judges accept) is under 60%.
 */
function writerEstimate(r) { return r && r.written && r.judged ? (r.code_pass / r.written) * (r.both_key / r.judged) : null; }
function writerOn(model) {
  const r = writers[model];
  if (!r || (r.judged || 0) < W_MIN_N) return true;
  return writerEstimate(r) >= W_MIN_KEEP;
}
function writerReport() {
  return Object.fromEntries(Object.entries(writers).map(([m, r]) => [m, { ...r, family: familyOf(m), keep_rate: r.written ? +(r.kept / r.written).toFixed(3) : null, keep_estimate: r.judged ? +writerEstimate(r).toFixed(3) : null, judge_agreement: r.judged ? +(r.both_key / r.judged).toFixed(3) : null, judges_same_pick_rate: r.judged ? +(r.judges_same_pick / r.judged).toFixed(3) : null, on: writerOn(m) }]));
}

/**
 * A judge kind: how its questions are put to a judge and read back.
 *   kinds[name] = { system, schema, schemaName, render(item, i) -> text, batch, maxTokens, keyOf }
 */
const kinds = {};
const pq = []; // pool requests: calls ({ type: 'call', role }) and verdicts ({ type: 'verdict' })
const bQueue = { get length() { return pq.filter((r) => r.type === 'verdict').length; } };
const B_BATCH = Number(process.env.B_BATCH || 12);
const itemKey = (kind, item) => (kinds[kind].keyOf ? kinds[kind].keyOf(item) : kinds[kind].render(item, 0));

function allowed(req, lane) {
  if (req.taken) return false;
  if (!lane.roles.includes(req.type === 'verdict' ? 'judge' : req.role)) return false;
  if (lane.kindsOnly && !(req.type === 'verdict' && lane.kindsOnly.test(req.kind))) return false;
  if (req.excludeFam.has(lane.family)) return false;
  if (req.pair && req.pair.claimed.has(lane.family)) return false;
  if (req.excludeModel && req.excludeModel.has(lane.model)) return false;
  if (req.type === 'verdict' && kinds[req.kind].strong && !STRONG.has(lane.model)) return false;
  if (req.type === 'call' && req.role === 'write' && !writerOn(lane.model)) return false;
  return true;
}

let pTimer = null;
function poolPump() {
  if (pTimer) { clearTimeout(pTimer); pTimer = null; }
  for (let i = pq.length - 1; i >= 0; i--) if (pq[i].taken) pq.splice(i, 1);
  const t = now();
  for (const lane of lanes) {
    while (pq.length && laneReady(lane, t)) {
      // alternate between finishing verdicts and taking new writes on lanes that do both
      lane.flip = !lane.flip;
      // priority work (the placement sets) is judged first
      // (a number: the smaller first, so the smaller sets finish first)
      let firstV = null;
      for (const r of pq) if (r.type === 'verdict' && r.prio && (!firstV || r.prio < firstV.prio) && allowed(r, lane)) firstV = r;
      if (!firstV) firstV = pq.find((r) => r.type === 'verdict' && allowed(r, lane));
      const firstC = pq.find((r) => r.type === 'call' && allowed(r, lane));
      // judging is the narrower stage: while many verdicts wait, a lane that can judge judges
      const backlog = firstV && (firstV.prio || pq.filter((r) => r.type === 'verdict' && !r.taken).length > Number(process.env.POOL_V_BACKLOG || 36));
      const pick = (backlog || lane.flip) ? (firstV || firstC) : (firstC || firstV);
      if (!pick) break;
      lane.active++;
      lane.nextAt = t + lane.gapMs;
      if (pick.type === 'call') {
        pick.taken = true; pick.owner = 'pool';
        if (pick.cancelMM) pick.cancelMM();
        runCall(lane, pick);
      } else {
        const K = kinds[pick.kind];
        const batch = [];
        const pairsInBatch = new Set();
        for (const r of pq) {
          if (batch.length >= (K.batch || B_BATCH)) break;
          if (r.type !== 'verdict' || r.kind !== pick.kind || !allowed(r, lane)) continue;
          if (r.pair && pairsInBatch.has(r.pair)) continue;
          r.taken = true;
          if (r.pair) { r.pair.claimed.add(lane.family); pairsInBatch.add(r.pair); }
          batch.push(r);
        }
        runBatch(lane, pick.kind, batch);
      }
    }
  }
  for (let i = pq.length - 1; i >= 0; i--) if (pq[i].taken) pq.splice(i, 1);
  if (pq.length) {
    const waits = lanes.filter((l) => l.active < l.conc && (!l.ready || l.ready())).map((l) => Math.max(l.nextAt, l.restUntil) - t);
    pTimer = setTimeout(poolPump, waits.length ? Math.max(1000, Math.min(...waits)) : 15000);
  }
}

function laneFailed(lane, err) {
  lane.fail++;
  lane.lastErr = `${new Date().toISOString().slice(11, 19)} ${String(err.message).slice(0, 140)}`;
  if (err.status === 429 || err.daily) {
    lane.r429++; lane.n429++;
    // rest grows with repeated 429s (no hammering): rest429, x2, x4, x8 (max 30 min)
    const rest = Math.min(30 * 60000, lane.rest429 * 2 ** Math.min(lane.n429 - 1, 3));
    lane.restUntil = now() + rest;
    log(`pool ${lane.name}: 429, resting ${Math.round(rest / 60000)} min`);
  } else if (err.budget) {
    lane.restUntil = now() + 24 * 3600000; log(`pool ${lane.name}: ${String(err.message).slice(0, 140)}; off for 24 h`);
  } else if (err.status === 402 || err.status === 403 || err.status === 404) {
    lane.restUntil = now() + 30 * 60000; log(`pool ${lane.name}: ${String(err.message).slice(0, 100)}; off 30 min`);
  } else if (err.unusable || err.status === 422) lane.restUntil = now() + 20000;
  else lane.restUntil = now() + 90000;
}

async function runCall(lane, req) {
  try {
    const r = await lane.call({ ...req.args, maxTokens: Math.min(req.args.maxTokens || 6000, 16000) });
    if (!r || !r.data) throw new Error('no answer');
    lane.ok++; lane.n429 = 0;
    if (req.role === 'write') lane.writes++; else lane.reads++;
    const model = lane.model;
    addTokens(req.job, `${req.role === 'write' ? 'W' : 'R'}:${model}`, r.usage);
    const v = { data: r.data, model, family: lane.family, usage: r.usage, at: new Date().toISOString(), lane: lane.name };
    if (req.cacheKey) cachePut(req.cacheKey(model), v);
    req.resolve(v);
  } catch (err) {
    laneFailed(lane, err);
    addTokens(req.job, `${req.role === 'write' ? 'W' : 'R'}:${lane.model}`, null, { failed: 1 });
    req.tries++;
    if (req.tries >= 2) req.excludeModel.add(lane.model); // try someone else
    if (req.tries >= 10) req.reject(err);
    else { req.taken = false; req.owner = null; pq.push(req); }
  } finally {
    lane.active--;
    poolPump();
  }
}

async function runBatch(lane, kind, batch) {
  const K = kinds[kind];
  const user = `${batch.map((b, i) => K.render(b.item, i)).join('\n\n')}\n\nReturn one verdict per question, with its index (0 to ${batch.length - 1}).`;
  try {
    const r = await lane.call({ system: K.system, user, schema: K.schema, schemaName: K.schemaName || 'submit_verdicts', maxTokens: K.maxTokens || 6000 });
    if (!r || !r.data) throw new Error('no answer');
    lane.ok++; lane.n429 = 0;
    const model = lane.model;
    batch.forEach((b) => addTokens(b.job, `B:${model}`, null));
    addTokens(batch[0].job, `B:${model}`, r.usage);
    const list = (r.data && r.data[K.listField || 'verdicts']) || [];
    const by = new Map(list.map((v) => [v.index, v]));
    batch.forEach((b, i) => {
      const v = by.get(i);
      if (v) { const out = { v, model, family: lane.family }; cachePut(hash(['V', kind, itemKey(kind, b.item), lane.family]), out); lane.questions++; b.resolve(out); } else requeue(b, lane, false);
    });
  } catch (err) {
    laneFailed(lane, err);
    batch.forEach((b) => requeue(b, lane, true));
  } finally {
    lane.active--;
    poolPump();
  }
}
function requeue(b, lane, laneFail) {
  if (b.pair) b.pair.claimed.delete(lane.family);
  b.tries++;
  if (!laneFail) b.excludeModel.add(lane.model); // that judge skipped it: ask another one
  // never strand a request: if no lane at all may take it now, forget the models it skipped
  if (!lanes.some((l) => allowed({ ...b, taken: false }, l))) b.excludeModel.clear();
  if (b.tries >= (laneFail ? 14 : 4)) { b.resolve(null); return; }
  b.taken = false;
  pq.push(b);
}

function cachedVerdict(kind, item, excludeFam, claimed) {
  const key = itemKey(kind, item);
  for (const f of ALL_FAMILIES) {
    if (excludeFam.has(f) || claimed.has(f)) continue;
    const hit = cacheGet(hash(['V', kind, key, f]));
    if (hit && (!kinds[kind].strong || STRONG.has(hit.model))) return hit;
  }
  // Verdicts cached before the pool (hash ['B', kind, key]) are not reused: their prompts did
  // not ask for the fact the key depends on, so the source check could not see it.
  return null;
}
function verdictRequest(job, kind, item, excludeFam, pair, prio = false) {
  return new Promise((resolve) => { const r = { type: 'verdict', kind, item, job, excludeFam, excludeModel: new Set(), pair, resolve, tries: 0, at: now(), prio }; pq.push(r); poolPump(); });
}

/**
 * One blind verdict of a kind, from a family not in excludeFam and not already claimed in pair
 * (a pair shared by two kinds keeps an item's two judges in two families). prio: judged first.
 */
function judgeOne(job, kind, item, excludeFam, pair = null, prio = false) {
  const hit = cachedVerdict(kind, item, excludeFam, pair ? pair.claimed : new Set());
  if (hit) { if (pair) pair.claimed.add(hit.family); return Promise.resolve(hit); }
  return verdictRequest(job, kind, item, excludeFam, pair, prio);
}

/**
 * Two blind verdicts on one question, from two different families, neither of them the
 * writer's family. Resolves to [verdictA, verdictB] ({ v, model, family } or null).
 */
async function judgeTwo(job, kind, item, writerModel) {
  const excludeFam = new Set([familyOf(writerModel)]);
  const pair = { claimed: new Set() };
  const out = [];
  for (let i = 0; i < 2; i++) {
    const hit = cachedVerdict(kind, item, excludeFam, pair.claimed);
    if (!hit) break;
    pair.claimed.add(hit.family); addTokens(job, `B:${hit.model}`, null, { cached: 1 });
    out.push(Promise.resolve(hit));
  }
  while (out.length < 2) out.push(verdictRequest(job, kind, item, excludeFam, pair));
  return Promise.all(out);
}

/** One blind verdict from a family other than those named (default: not MiniMax). Resolves to { v, model } or null. */
function judgeB(job, kind, item, excludeFamilies = ['minimax']) {
  const excludeFam = new Set(excludeFamilies);
  const hit = cachedVerdict(kind, item, excludeFam, new Set());
  if (hit) { addTokens(job, `B:${hit.model}`, null, { cached: 1 }); return Promise.resolve(hit); }
  return verdictRequest(job, kind, item, excludeFam, null);
}

/**
 * One write, by whichever allowed writer is free first: MiniMax on xKiro (racing) or a pool
 * lane. Cached per model. Resolves to { data, model, family, usage }.
 */
async function write({ job, key, system, user, schema, schemaName, maxTokens = 6000, excludeModels = [] }) {
  const base = key || [system, user, schemaName];
  const mmHit = cacheGet(hash(['mm', base]));
  if (mmHit) { addTokens(job, mmHit.model || MM, null, { cached: 1 }); return { ...mmHit, family: familyOf(mmHit.model || MM) }; }
  for (const l of lanes) {
    if (!l.roles.includes('write')) continue;
    const hit = cacheGet(hash(['w', l.model, base]));
    if (hit) { addTokens(job, `W:${l.model}`, null, { cached: 1 }); return hit; }
  }
  return new Promise((resolve, reject) => {
    const req = { type: 'call', role: 'write', job, args: { system, user, schema, schemaName, maxTokens }, excludeFam: new Set(), excludeModel: new Set(excludeModels), tries: 0, at: now(), taken: false, cacheKey: (model) => hash(['w', model, base]), resolve, reject };
    const mmOk = !mm.fatal && writerOn(MM) && !excludeModels.includes(MM) && process.env.MM_WRITE !== '0';
    if (mmOk) {
      minimax({ job, key, system, user, schema, schemaName, maxTokens, race: req })
        .then((v) => { if (v) resolve({ ...v, family: 'minimax' }); })
        .catch((err) => {
          if (req.owner !== 'mm') return;
          if (err.fatal && !lanes.length) { reject(err); return; }
          req.taken = false; req.owner = null; req.excludeModel.add(MM); pq.push(req); poolPump();
        });
    }
    pq.push(req); poolPump();
  });
}

/** A source reader (role 'read') that is not the writer's family. Resolves to { data, model } or null. */
function read({ job, writerModel, system, user, schema, schemaName, maxTokens = 4000, key }) {
  const k = hash(['read', key || [system, user, schemaName], familyOf(writerModel)]);
  const hit = cacheGet(k);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    pq.push({ type: 'call', role: 'read', job, args: { system, user, schema, schemaName, maxTokens }, excludeFam: new Set([familyOf(writerModel)]), excludeModel: new Set(), tries: 0, at: now(), cacheKey: () => k, resolve, reject: () => resolve(null) });
    poolPump();
  });
}

function laneStatus() {
  return {
    minimax: { limit: mm.limit, active: mm.active, queued: queued(), by_job: Object.fromEntries([...mm.queues].map(([j, q]) => [j, q.filter((w) => !w.dead).length])), unorouter_minimax_in_mm: uno.on, ok: mm.ok, r429: mm.n429, fatal: mm.fatal, grant_used: xk.grantTokensUsed(MM) },
    rescued,
    pool_prio_waiting: (() => { const o = {}; for (const r of pq) if (r.prio && !r.taken) { const k = `${r.kind} excl:${[...r.excludeFam].join('+')} claimed:${r.pair ? [...r.pair.claimed].join('+') : ''} skip:${[...r.excludeModel].join('+')} servable:${lanes.some((l) => allowed(r, l))}`; o[k] = (o[k] || 0) + 1; } return o; })(),
    pool_queue: { writes: pq.filter((r) => r.type === 'call' && r.role === 'write' && !r.taken).length, reads: pq.filter((r) => r.type === 'call' && r.role === 'read' && !r.taken).length, verdicts: pq.filter((r) => r.type === 'verdict' && !r.taken).length },
    lanes: lanes.map((l) => ({ name: l.name, family: l.family, roles: l.roles.join(','), active: l.active, ok: l.ok, fail: l.fail, r429: l.r429, writes: l.writes, questions_judged: l.questions, reads: l.reads, resting_s: Math.max(0, Math.round((l.restUntil - now()) / 1000)), ready: l.ready ? l.ready() : true, writer_on: writerOn(l.model), last_error: l.lastErr })),
    writers: writerReport(),
    qwen_window: xk.freeTokensToday(),
  };
}

module.exports = { ROOT, HERE, STATE, log, hash, sleep, minimax, write, read, judgeB, judgeTwo, judgeOne, familyOf, writerStat, writerReport, saveWriters, kinds, laneStatus, tally, saveTally, cacheGet, cachePut, MM, mm, bQueue };
