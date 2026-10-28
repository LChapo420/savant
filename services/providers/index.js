/**
 * Provider selection.
 *
 * The owner's lineup (2026-10-22): "make everything 100% factual and perfect
 * everywhere for the absolute lowest price possible". So every role walks the free
 * NVIDIA build models first — the tier and the models inside it come from
 * config/model-lineup.json (services/providers/nvidia.js), measured by
 * scripts/model-lineup-eval.js — and Claude on the Anthropic key is the last
 * resort, always last, behind its spend guards (services/ai.js).
 *
 *   every role   nvidia (its tier's models, then their fallbacks)  ->  anthropic
 *   placement    modelflare, unchanged: the whole-subject placement quiz stays where
 *                it was (the owner has not moved it), pinned to one set of weights.
 *
 * Out of the lineup, and so out of every chain by default (their code is kept):
 *   mimo         the owner: GLM 5.3 / DeepSeek V4.1 at max reasoning match it.
 *   openrouter   its GLM / DeepSeek / Qwen routes bill the owner's OpenRouter account,
 *                which must not be spent (at a $0 balance the free models stop too).
 *   gemini       not in the owner's lineup.
 * A legacy provider re-enters a chain only when AI_LEGACY_PROVIDERS names it
 * (comma separated) AND an AI_PROVIDER_* variable puts it in that role. Without the
 * opt-in, an AI_PROVIDER_* value naming one is ignored with a warning — the .env
 * written before this lineup names MiMo and OpenRouter in several roles.
 *
 * Overrides kept: AI_PROVIDER_<GROUP> names the preferred provider and
 * AI_PROVIDER_<GROUP>_FALLBACK the ones behind it (comma separated). Whatever is
 * named, nvidia is in the chain and anthropic is last. AI_ANTHROPIC_FALLBACK=0
 * takes Claude out of every chain (the app then degrades to its deterministic
 * floors instead of spending).
 *
 * The free fallbacks (owner, 2026-10-23), after NVIDIA and before Claude, used only
 * when the NVIDIA tiers fail a call:
 *   ollama           local standard models on this laptop (services/providers/ollama.js
 *                    refuses abliterated / derestricted / uncensored ones). It answers the
 *                    tasks config/local-lineup.json measured as good enough; while NVIDIA
 *                    is DOWN (15 minutes of confirmed failure, nvidia.outage()) it answers
 *                    every task, until NVIDIA's own probe sees it recover.
 *   gemini_free      Google AI Studio free tier, only once it is confirmed free.
 *   openrouter_free  OpenRouter `:free` models, each verified at $0 before use.
 * (services/providers/free-apis.js.) Every role except placement:
 *
 *   nvidia  ->  ollama  ->  gemini_free  ->  openrouter_free  ->  anthropic (key ledger)
 *
 * AI_FREE_FALLBACKS=0 takes the free APIs out; OLLAMA_ENABLED=0 takes local out.
 * "Outside" providers (everything but ollama) send the learner's words off this
 * machine; services/ai.js keeps them away from a learner without that consent.
 *
 * Adding a provider means implementing isEnabled, modelFor, structured, chat
 * (and optionally chatStream), and listing it here. Nothing above
 * services/ai.js knows which one is in use.
 */
const os = require('os');
const nvidia = require('./nvidia');
const ollamaRaw = require('./ollama');
const { openrouterFree, geminiFree } = require('./free-apis');
const { xkiro } = require('./xkiro');
const mimo = require('./mimo');
const openrouter = require('./openrouter');
const gemini = require('./gemini');
const anthropic = require('./anthropic');
const modelflare = require('./modelflare');

// The owner's RAM rule for local AI (2026-10-23): keep system RAM use at or under 95%
// of 31.2 GB, i.e. at least ~1.6 GB free. Loading a model checks it (ollama.js headroom);
// the chain checks it before every local call.
if (!process.env.OLLAMA_RAM_HEADROOM_GB) process.env.OLLAMA_RAM_HEADROOM_GB = '1.6';
const LOCAL_MIN_FREE = () => Number(process.env.LOCAL_MIN_FREE_GB || 1.6) * 1024 ** 3;

let localHealth = { at: 0, ok: false, pending: false };
function localUp() {
  if (!ollamaRaw.isConfigured()) return false;
  if (Date.now() - localHealth.at > 30000 && !localHealth.pending) {
    localHealth.pending = true;
    ollamaRaw.health().then((h) => { localHealth = { at: Date.now(), ok: !!h.ok, pending: false }; })
      .catch(() => { localHealth = { at: Date.now(), ok: false, pending: false }; });
  }
  return localHealth.ok;
}

/**
 * The local tier: Ollama's provider, answering what the local lineup measured as good
 * enough, or (NVIDIA down) everything, while RAM allows.
 */
const ollama = {
  ...ollamaRaw,
  name: 'ollama',
  local: true,
  isEnabled(role = 'fast', task = null) {
    if (!localUp() || os.freemem() < LOCAL_MIN_FREE()) return false;
    if (nvidia.outage && nvidia.outage().state === 'down') return true;
    return ollamaRaw.isEnabled(role, task) || ollamaRaw.servesTask(task);
  },
  status() { return { ...ollamaRaw.status(), up: localHealth.ok, free_gb: Number((os.freemem() / 1024 ** 3).toFixed(1)) }; },
};

const ALL = { nvidia, mimo, openrouter, gemini, anthropic, modelflare, ollama, gemini_free: geminiFree, openrouter_free: openrouterFree, xkiro };
/** Providers the owner's lineup uses. */
const LINEUP = ['nvidia', 'ollama', 'gemini_free', 'openrouter_free', 'anthropic'];
/** The free tier after NVIDIA, in order. */
const FREE_FALLBACKS = ['ollama', 'gemini_free', 'openrouter_free'];
/** Providers whose calls stay on this machine. */
const LOCAL = new Set(['ollama']);
function isOutside(p) { return !(p && (LOCAL.has(p.name) || p.local === true)); }
/** Kept in code, out of every chain unless AI_LEGACY_PROVIDERS opts one back in. */
const LEGACY = ['mimo', 'openrouter', 'gemini'];

const GROUPS = ['fast', 'deep', 'regen', 'diagnose', 'rewrite', 'personalize', 'placement', 'games', 'blocks'];

/**
 * Every group walks NVIDIA then Claude. The tier inside NVIDIA differs by role
 * (config/model-lineup.json "roles"): fast -> light, deep/diagnose/rewrite/games ->
 * hard, regen/personalize/blocks -> fast_thinking, and a call site may name a task
 * with its own measured winner.
 */
const ROLE_DEFAULTS = {
  fast: ['nvidia', 'anthropic'],
  deep: ['nvidia', 'anthropic'],
  regen: ['nvidia', 'anthropic'],
  diagnose: ['nvidia', 'anthropic'],
  rewrite: ['nvidia', 'anthropic'],
  personalize: ['nvidia', 'anthropic'],
  // Writing the whole-subject placement quiz: GPT Sol through Modelflare and
  // nothing else, exactly as before this lineup (placement-only; left as it was).
  placement: ['modelflare'],
  games: ['nvidia', 'anthropic'],
  blocks: ['nvidia', 'anthropic'],
};

function roleGroup(role) {
  if (role === 'deep' || role === 'author') return 'deep';
  if (GROUPS.includes(role)) return role;
  return 'fast';
}

function legacyAllowed() {
  return String(process.env.AI_LEGACY_PROVIDERS || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => LEGACY.includes(s));
}

const warned = new Set();
function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

function admissible(name, key) {
  if (!ALL[name]) return false;
  if (LEGACY.includes(name) && !legacyAllowed().includes(name)) {
    warnOnce(`${key}:${name}`, `ai: ${key} names "${name}", which is out of the model lineup; ignoring it `
      + '(set AI_LEGACY_PROVIDERS to opt it back in). See curriculum-build/MODEL-LINEUP.md.');
    return false;
  }
  return true;
}

function named(key) {
  const value = (process.env[key] || '').trim().toLowerCase();
  if (!value) return null;
  if (!ALL[value]) {
    warnOnce(`${key}:${value}`, `ai: unknown ${key} "${value}"; ignoring it`);
    return null;
  }
  return admissible(value, key) ? value : null;
}

function namedList(key) {
  return String(process.env[key] || '').split(',').map((s) => s.trim().toLowerCase())
    .filter((s) => s && ALL[s] && admissible(s, key));
}

function anthropicAllowed() {
  return String(process.env.AI_ANTHROPIC_FALLBACK || '1') !== '0';
}

function order(role) {
  const group = roleGroup(role);
  const suffix = group.toUpperCase();
  const defaults = ROLE_DEFAULTS[group];
  const preferred = named(`AI_PROVIDER_${suffix}`) || defaults[0];
  const declared = process.env[`AI_PROVIDER_${suffix}_FALLBACK`];
  const fallbacks = declared === undefined ? defaults.slice(1) : namedList(`AI_PROVIDER_${suffix}_FALLBACK`);
  let list = [...new Set([preferred, ...fallbacks])];

  // Placement stays pinned to what it names (Modelflare by default), as before.
  if (group === 'placement') {
    if (declared === undefined && !named('AI_PROVIDER_PLACEMENT')) return ['modelflare'];
    return list.filter((n) => n !== 'anthropic' || anthropicAllowed());
  }

  // Every other role: the free models are always in the chain, then the free
  // fallbacks, and Claude is always last — whatever the environment names.
  list = list.filter((n) => n !== 'anthropic' && n !== 'modelflare' && n !== 'xkiro' && !FREE_FALLBACKS.includes(n));
  if (!list.includes('nvidia')) list.push('nvidia');
  // Build scripts only (XKIRO_PIPELINE=1; the app server never sets it): xKiro's $0
  // models and MiniMax grant come straight after NVIDIA, before the local models.
  // No learner's words reach it (services/providers/xkiro.js).
  if (process.env.XKIRO_PIPELINE === '1') list.push('xkiro');
  // NVIDIA down for 15 confirmed minutes: local first until NVIDIA recovers.
  if (nvidia.outage && nvidia.outage().state === 'down') list.unshift('ollama');
  for (const n of FREE_FALLBACKS) if (!list.includes(n)) list.push(n);
  if (anthropicAllowed()) list.push('anthropic');
  return list;
}

const warnedAbout = {};

function current(role = 'fast', task = null) {
  const preference = order(role);
  for (const name of preference) {
    const provider = ALL[name];
    if (!provider) continue;
    if (provider.isEnabled(role, task)) {
      if (warnedAbout[role] && name !== warnedAbout[role]) warnedAbout[role] = null;
      return provider;
    }
    // The free fallbacks answer only some tasks by design; their absence is not news.
    const configured = provider.isConfigured && !FREE_FALLBACKS.includes(name) ? provider.isConfigured() : false;
    if (configured && warnedAbout[role] !== name) {
      const why = provider.status ? provider.status().reason : 'unavailable';
      const next = preference.slice(1).map((n) => ALL[n]).find((p) => p && p.isEnabled(role, task));
      console.warn(`ai: ${name} is configured but cannot answer (${why}); `
        + `${next ? `using ${next.name} instead` : 'falling back to the question bank'}.`);
      warnedAbout[role] = name;
    }
  }
  return null;
}

/**
 * Every provider that can answer this role right now, in preference order.
 * `current` is the first of these; the caller moves down the list when one fails a
 * single request (a 429, a timeout) without marking itself unavailable.
 */
function chain(role = 'fast', task = null) {
  return order(role).map((n) => ALL[n]).filter((p) => p && p.isEnabled(role, task));
}

/** Every provider and whether it can answer, for the health endpoint and the UI. */
function status() {
  const describe = (role) => {
    const p = current(role);
    return p ? { provider: p.name, model: p.modelFor(role) } : null;
  };
  const fast = current('fast');
  return {
    active: fast ? fast.name : null,
    chat: describe('fast'),
    deep: describe('deep'),
    regen: describe('regen'),
    rewrite: describe('rewrite'),
    personalize: describe('personalize'),
    // Pinned: if this is null the placement quiz cannot be written at all.
    placement: describe('placement'),
    games: describe('games'),
    blocks: describe('blocks'),
    routes: Object.fromEntries(GROUPS.map((g) => [g, order(g)])),
    nvidia_outage: nvidia.outage ? nvidia.outage() : null,
    // eslint-disable-next-line global-require
    anthropic_ledger: require('../anthropic-ledger').status(),
    lineup: {
      tiers: nvidia.readLineup().tiers || null,
      source: nvidia.readLineup().source || null,
      roles: Object.fromEntries(GROUPS.map((g) => [g, nvidia.tierForRole(g)])),
      legacy_opt_in: legacyAllowed(),
      anthropic_last_resort: anthropicAllowed(),
    },
    preferred: order('fast')[0],
    providers: Object.entries(ALL).map(([name, p]) => {
      const available = p.isEnabled();
      return {
        name,
        in_lineup: LINEUP.includes(name) || name === 'modelflare',
        ...(p.status ? p.status() : { configured: available, available, reason: null }),
        ...(available && name !== 'modelflare' ? { deep: p.modelFor('deep'), fast: p.modelFor('fast') } : {}),
        ...(name === 'modelflare' && p.isEnabled('placement') ? { placement: p.modelFor('placement') } : {}),
      };
    }),
  };
}

module.exports = { current, chain, status, order, roleGroup, isOutside, ALL, LINEUP, LEGACY, FREE_FALLBACKS, ROLE_DEFAULTS };
