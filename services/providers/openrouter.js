/**
 * OpenRouter, through its OpenAI-compatible chat completions endpoint.
 *
 * This is the chat lane: the coach, the explainer, grading a short answer —
 * the work a learner is sitting there waiting for. It runs a free Qwen model
 * (`qwen/qwen3.8-27b:free` by default), so the lane that gets used on every
 * turn of a conversation costs nothing.
 *
 * Documented surface used here (openrouter.ai/docs/api-reference):
 *   POST {base}/chat/completions with `Authorization: Bearer`
 *   `reasoning: { enabled: false }` to turn a hybrid model's thinking off
 *   `stream: true` for SSE, with `: OPENROUTER PROCESSING` keep-alive comments
 *   `tools` + `tool_choice: 'auto'` for function calling
 *
 * Structured output goes through a single function tool rather than
 * `response_format`, for the same reason as the MiMo and Anthropic providers:
 * tool calling works on more routes than JSON-schema responses do.
 *
 * Free models are metered per day, not per minute, so a 429 here usually means
 * "come back tomorrow". That is handled the way it is everywhere else: set the
 * model aside, let services/providers/index.js hand the work to the next
 * provider, and never block a learner on it.
 */
const BASE_URL = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');

const MODEL_DEEP = process.env.OPENROUTER_MODEL_DEEP || process.env.OPENROUTER_MODEL || 'qwen/qwen3.8-27b:free';
const MODEL_FAST = process.env.OPENROUTER_MODEL_FAST || process.env.OPENROUTER_MODEL || 'qwen/qwen3.8-27b:free';

/**
 * Writing a level for one learner (the `personalize` role): DeepSeek V4.1 Flash,
 * the same model the base lessons are generated with, so a tailored page is
 * written by the weights that wrote the page it adapts. Its profile below pins
 * the upstream and carries its reasoning.
 */
const MODEL_PERSONALIZE = process.env.OPENROUTER_MODEL_PERSONALIZE
  || process.env.OPENROUTER_LESSON_MODEL || 'deepseek/deepseek-v4.1-flash';

/**
 * Block levels (the `blocks` role): the per-learner layout and fill-out of a
 * lesson, retention check, game level or checkpoint. GLM 5.3 Flash — cheap, and
 * strong enough for work that is checked block by block against a schema.
 */
const MODEL_BLOCKS = process.env.OPENROUTER_MODEL_BLOCKS || 'z-ai/glm-5.3-flash';

/**
 * Remaking a failed checkpoint's questions (the `regen` role): GLM 5.3 Flash,
 * which replaced MiMo V2.6 Flash as this job's main model. MiMo flash stays
 * behind it as the backup (services/providers).
 */
const MODEL_REGEN = process.env.OPENROUTER_MODEL_REGEN || 'z-ai/glm-5.3-flash';

/**
 * Deliberately empty by default. The obvious fallback for an exhausted `:free`
 * model is the same model without the suffix — which is the same request with a
 * bill attached. Nobody asked for that, so when the free quota is gone the work
 * goes to the next provider (or the question bank) instead. Set
 * OPENROUTER_MODEL_DAILY_FALLBACK if you want a paid route to catch it.
 */
const DAILY_FALLBACK = process.env.OPENROUTER_MODEL_DAILY_FALLBACK || '';

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const WRONG_MODEL = new Set([400, 403, 404]);

/**
 * What a particular model needs from us, where another model needs the opposite.
 *
 * OpenRouter serves hundreds of models behind one endpoint and the request shape
 * is not the same for all of them. Three settings differ, and all three are
 * per-model rather than global — a rule written for one of them would be wrong for
 * every other route:
 *
 *   reasoning      whether thinking is on. It is on for a reasoning model and
 *                   explicitly **off** for the Qwen chat route, because a learner
 *                   waiting mid-conversation is not served by a long pause.
 *   provider       which upstream may serve it, and whether another may be
 *                   substituted. Default: sort by throughput, allow fallbacks.
 *   carryReasoning whether `reasoning_details` must be handed back with a later
 *                   turn so the model continues its own thinking rather than
 *                   starting again.
 *
 * A model that is not listed gets the defaults, which is what every route here
 * except space-bunny wants. The profile is keyed on the model id, so naming the
 * model in `OPENROUTER_MODEL_FAST` is all it takes to use it — the behaviour
 * travels with the model rather than having to be configured alongside it.
 */
const MODEL_PROFILES = {
  'stealth/space-bunny-alpha': {
    // Reasoning is **mandatory** on this route: `enabled: false` comes back 400
    // with "Reasoning is mandatory for this endpoint and cannot be disabled", so
    // the setting is left out entirely and OpenRouter's default applies. Measured,
    // not assumed — and the reason is written down, because the natural reading of
    // "reasoning: true" is that the field must be sent.
    //
    // The default is the right one here anyway. Asking for thinking explicitly made
    // the model reason for the whole budget and never reach an answer: a lesson
    // generation ended `finish: length` with 104,815 characters of reasoning and
    // zero of content, at 24,000 tokens. Leaving the field out is what the rest of
    // this file does for every other model, so this is the one that had to be
    // brought in line rather than the others changed.
    reasoning: null,
    // Pinned to the one upstream that serves these weights, with no substitution.
    // Both halves are needed: `only` says who may answer, and
    // `allow_fallbacks: false` says what happens when that one cannot — which is
    // a refusal rather than some other provider's weights. Verified against the
    // live API: a provider name that does not exist comes back 404 rather than
    // being quietly answered, so the pin is a guarantee and not a preference.
    provider: { only: ['stealth'], allow_fallbacks: false },
    // `reasoning_details` comes back on the assistant message and has to go back
    // with it on the next turn, unmodified, or the model re-thinks from nothing
    // and the second answer is not a continuation of the first. Only models that
    // return the field are asked to carry it.
    carryReasoning: true,
    // This model may be reached with `OPENROUTER_BUNNY_API_KEY` when one is set,
    // which keeps its quota and its spend on its own account rather than the
    // general one. Not required — the general key reaches it too — so this is a way
    // to keep two accounts apart rather than a second thing that must be right.
    scopedKey: 'bunny',
  },

  'deepseek/deepseek-v4.1-flash': {
    // A route asked for by name rather than taken from a lane, so its profile
    // carries the settings that route needs instead of the ones a chat route
    // would. Reached by putting this slug in `OPENROUTER_MODEL_FAST` or
    // `OPENROUTER_MODEL_DEEP`, or by naming it on a single call.
    //
    // Reasoning is left off the profile rather than pinned either way, so the
    // endpoint's own default applies — which for this route is thinking on. That
    // is the right default for the work this model is good at: long authored
    // output, where a model that spends its whole budget reasoning can return a
    // finished plan and no content. It is deliberately *not* the `null` that
    // space-bunny above needs: that one means "send no reasoning field, because
    // this endpoint rejects it when present", which is the opposite request. Set
    // `reasoning: { enabled: false }` here only if this endpoint turns out to
    // need chat-speed, and expect it to cost quality on long writes.
    //
    // Pinned to the one upstream that serves it, with no substitution. Both
    // halves matter: `only` says who may answer, and `allow_fallbacks: false`
    // says what happens when that one cannot — which is a refusal rather than
    // some other set of weights answering a question the caller believes was put
    // to these ones. A provider name that does not exist comes back 404 rather
    // than being quietly answered, so the pin is a guarantee and not a
    // preference. Verified against the live API.
    provider: { only: ['sail-research/fp4'], allow_fallbacks: false },
    // `reasoning_details` comes back on the assistant message and has to go back
    // with it on the next turn, or the model re-thinks from nothing and the second
    // answer is not a continuation of the first. Only models that return the field
    // are asked to carry it.
    carryReasoning: true,
    // May be reached with `OPENROUTER_DEEPSEEK_API_KEY` when one is set, which
    // keeps this route's quota and spend on its own account rather than the
    // general one. Not required — the general key reaches it too — so this keeps
    // two accounts apart rather than adding a second thing that must be right.
    scopedKey: 'deepseek',
  },

  'z-ai/glm-5.3-flash': {
    // GLM 5.3 Flash, on its DeepInfra fp4 upstream. The request that reaches it
    // is the one its own SDK example sends — model, messages, stream, and the
    // provider pin below — and deliberately nothing else: no reasoning field at
    // all, so the endpoint's own default applies. That default is thinking on,
    // and the thinking is paid back in the usage the stream ends with
    // (`completion_tokens_details.reasoning_tokens`, which the SDK surfaces as
    // `usage.completionTokensDetails.reasoningTokens`). Asking for the switch
    // explicitly risks the budget going entirely to reasoning and never to
    // content — the failure already recorded on space-bunny above — so the field
    // is left out exactly as the example leaves it out. `reasoning: null` here
    // means "send no reasoning field", which is not the same as `{enabled: false}`
    // and is not the same as forgetting the distinction.
    reasoning: null,
    // Pinned to the one upstream that serves these weights, with no
    // substitution: `only` says who may answer and `allow_fallbacks: false` says
    // a busy or missing upstream is a refusal rather than a different quantized
    // route answering. Both halves are needed for the pin to be a guarantee.
    provider: { only: ['deepinfra/fp4'], allow_fallbacks: false },
    // A thinking model's `reasoning_details` come back on the assistant message
    // and are handed back unmodified with the next turn so the model continues
    // its own thinking rather than starting again. The field is only ever sent
    // when the model actually produced it, so this is safe on a turn where the
    // route returned none.
    carryReasoning: true,
    // May be reached with `OPENROUTER_GLM_API_KEY` when one is set, so this
    // route's quota and spend can sit on their own account. Not required — the
    // general key reaches it too.
    scopedKey: 'glm',
  },
};

/** What this model needs, or the defaults. */
function profileFor(model) {
  return MODEL_PROFILES[model] || {};
}

/**
 * Does this model's thinking have to be handed back with the next turn?
 *
 * Only true where the profile says so. Every other route would either ignore the
 * field or reject the request, and sending it to a model that did not produce it
 * is at best noise and at worst a 400 on a turn a learner is waiting for.
 */
function carriesReasoning(model) {
  return !!profileFor(model).carryReasoning;
}

/**
 * Failures that no amount of retrying fixes, each one standing the provider down
 * for a while rather than paying a round trip per request — and per coaching turn
 * — to learn the same thing:
 *
 *   402  out of credit (free routes answer without it, paid ones do not)
 *   401  the key is not accepted
 *   429  from the upstream provider's shared pool, repeatedly: the free route is
 *        saturated by other people's traffic. Cheap to discover once, wasteful to
 *        discover on every turn — a 100ms probe before falling back to Gemini is
 *        100ms of a conversation.
 *
 * All three recheck rather than standing down for good: a key gets fixed, an
 * account gets topped up, and a busy pool clears.
 */
let blockedBecause = null;
let blockedAt = 0;
let blockedFor = 0;
const CREDIT_RECHECK_MS = Number(process.env.OPENROUTER_CREDIT_RECHECK_MS || 10 * 60 * 1000);
const POOL_RECHECK_MS = Number(process.env.OPENROUTER_POOL_RECHECK_MS || 3 * 60 * 1000);

function creditBlocked() {
  if (!blockedBecause) return false;
  if (Date.now() - blockedAt > blockedFor) {
    blockedBecause = null;
    return false;
  }
  return true;
}

function standDown(reason, message, ms = CREDIT_RECHECK_MS) {
  if (!blockedBecause) {
    console.warn(`ai: OpenRouter says "${String(message).slice(0, 120)}". Standing down for `
      + `${Math.round(ms / 60000)} minutes; the app falls back to the next provider, `
      + 'or to the question bank.');
  }
  blockedBecause = reason;
  blockedAt = Date.now();
  blockedFor = ms;
}

/** Background work is spaced out; chat has its own lane so it never queues
 *  behind a lesson being written. */
const GAPS = {
  background: Number(process.env.OPENROUTER_MIN_GAP_MS || 1200),
  interactive: Number(process.env.OPENROUTER_CHAT_GAP_MS || 0),
};
const lanes = {
  background: { chain: Promise.resolve(), lastCallAt: 0 },
  interactive: { chain: Promise.resolve(), lastCallAt: 0 },
};

function queued(task, laneName = 'background') {
  // The regen role skips the queue: its batches are for one waiting learner and
  // must run concurrently rather than behind each other. See mimo.js.
  if (laneName === 'parallel') return task();
  const lane = lanes[laneName] || lanes.background;
  const gap = GAPS[laneName] || 0;
  const run = lane.chain.then(async () => {
    const wait = Math.max(0, lane.lastCallAt + gap - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lane.lastCallAt = Date.now();
    return task();
  });
  lane.chain = run.catch(() => {});
  return run;
}

function isConfigured() {
  return !!process.env.OPENROUTER_API_KEY;
}

function isEnabled(role = 'fast') {
  // A blocked route is not a blocked provider: the free Qwen route being
  // saturated is exactly when the paid route for the same model should answer.
  // Asked per role, because a spent free chat route says nothing about whether
  // the paid route that writes a learner's level can answer.
  return isConfigured() && !creditBlocked() && usableRoutes(role).length > 0;
}

function status() {
  return {
    configured: isConfigured(),
    available: isEnabled(),
    reason: !isConfigured() ? 'no API key'
      : creditBlocked() ? blockedBecause
        : usableRoutes('fast').length ? null : 'every route is rate limited',
  };
}

// ── daily quota ────────────────────────────────────────────────────────────
const exhaustedUntil = new Map();
const rateLimitHits = new Map();

function nextDailyReset() {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return reset.getTime();
}

function isExhausted(model) {
  const until = exhaustedUntil.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    exhaustedUntil.delete(model);
    rateLimitHits.delete(model);
    return false;
  }
  return true;
}

function markExhausted(model, reason) {
  if (isExhausted(model)) return;
  exhaustedUntil.set(model, nextDailyReset());
  console.warn(`ai: ${model} is out of daily quota (${reason}); falling back until it resets`);
}

/**
 * Set one route aside for a while — not until tomorrow, which is what
 * markExhausted does. Used when a free route's shared upstream pool is busy:
 * the model is fine, that one queue is not, and the paid route for the same
 * model is right there.
 */
function blockRoute(model, ms, reason) {
  if (isExhausted(model)) return;
  exhaustedUntil.set(model, Date.now() + ms);
  console.warn(`ai: ${model} set aside for ${Math.round(ms / 60000)} minutes (${reason})`);
}

/**
 * Per-day and per-minute limits both arrive as 429 and need opposite handling:
 * wait out the minute, stand down for the day. OpenRouter's free tier is the
 * unusual one — its cap is a daily request count and it names it in the error
 * ("free-models-per-day"), so that phrasing is matched explicitly.
 */
function quotaKind(err) {
  const text = `${err.message || ''} ${JSON.stringify((err.body && err.body.error) || err.body || {})}`;
  if (/free[\s_-]*models?[\s_-]*per[\s_-]*day|per[\s_-]*day|daily|rpd/i.test(text)) return 'day';
  if (/per[\s_-]*minute|rpm|tpm/i.test(text)) return 'minute';
  return 'minute';
}

/**
 * A 429 from the upstream provider's shared pool is contention, not our quota:
 * the route is busy for a moment and fine the next. Counting those toward the
 * three-strikes standdown would take the model off the board for a day over
 * someone else's traffic.
 */
function isSharedPoolLimit(err) {
  const meta = (err.body && err.body.error && err.body.error.metadata) || {};
  if (meta.limit_source === 'upstream_provider_shared_pool') return true;
  return /rate-limited upstream|retry shortly/i.test(String(meta.raw || ''));
}

/** Consecutive shared-pool 429s. Reset by any answer at all. */
/** Consecutive shared-pool 429s per route. Counted per route, because a paid
 *  route answering says nothing about whether the free one has cleared. */
const poolStrikes = new Map();

function noteRateLimit(model, err) {
  if (err && isSharedPoolLimit(err)) {
    poolStrikes.set(model, (poolStrikes.get(model) || 0) + 1);
    // Three in a row means the pool is busy, not unlucky. Set that route aside
    // for a few minutes so chat stops paying a probe before every turn — but
    // only that route, because the paid route for the same model is unaffected.
    if (poolStrikes.get(model) >= 3) blockRoute(model, POOL_RECHECK_MS, 'upstream pool saturated');
    return;
  }
  const hits = (rateLimitHits.get(model) || 0) + 1;
  rateLimitHits.set(model, hits);
  if (hits >= 3) markExhausted(model, 'repeated rate limits');
}

/** deep / author want the strong model; fast and regen want the quick one. */
function roleGroup(role) {
  if (role === 'deep' || role === 'author' || role === 'diagnose') return 'deep';
  if (role === 'regen') return 'regen';
  if (role === 'personalize') return 'personalize';
  if (role === 'blocks') return 'blocks';
  return 'fast';
}

/** Every route configured for a role, preferred first, whether usable or not. */
function routesFor(role) {
  // Personalizing names one model and does not fall through to others on this
  // provider: the backup for it is MiMo pro, chosen in services/providers.
  if (roleGroup(role) === 'personalize') return [MODEL_PERSONALIZE];
  // Block levels name one model too; MiMo pro behind it is chosen in services/providers.
  if (roleGroup(role) === 'blocks') return [MODEL_BLOCKS];
  if (roleGroup(role) === 'regen') return [MODEL_REGEN];
  const wanted = roleGroup(role) === 'deep' ? MODEL_DEEP : MODEL_FAST;
  const configured = roleGroup(role) === 'fast'
    ? process.env.OPENROUTER_MODEL_FAST_FALLBACK
    : process.env.OPENROUTER_MODEL_FALLBACK;
  const list = String(configured === undefined ? DAILY_FALLBACK : configured)
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (DAILY_FALLBACK && !list.includes(DAILY_FALLBACK)) list.push(DAILY_FALLBACK);
  return [...new Set([wanted, ...list])];
}

function usableRoutes(role) {
  return routesFor(role).filter((m) => !isExhausted(m));
}

/**
 * The route to ask first. A saturated free route is skipped rather than probed,
 * which is the difference between a 1.2s coaching turn and a 1.3s one with a
 * pointless 429 in front of it.
 */
function modelFor(role) {
  const usable = usableRoutes(role);
  return usable.length ? usable[0] : routesFor(role)[0];
}

function fallbacksFor(role) {
  return usableRoutes(role).slice(1);
}

function headersFor(model) {
  return {
    'Content-Type': 'application/json',
    // One key per account, and a model on somebody else's key should not be
    // reachable with ours by accident. `OPENROUTER_BUNNY_API_KEY` is a second
    // credential used for space-bunny and nothing else, which is what a key
    // scoped to one model looks like. Without it the general key is used, and the
    // general key does reach the model — so this is a way to keep the accounts
    // apart, not a requirement.
    Authorization: `Bearer ${apiKeyFor(model)}`,
    // Optional on OpenRouter, but they are how a key's usage is attributed to an
    // app rather than to an anonymous script.
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || `http://localhost:${process.env.PORT || 6767}`,
    'X-Title': process.env.OPENROUTER_APP_NAME || 'Polymath',
  };
}

/**
 * The key that may talk to this model.
 *
 * One model per account, so a model on somebody else's key should not be reachable
 * with ours by accident. Each scoped key is a second credential used for one
 * named route and nothing else, which is what a key scoped to one model looks
 * like. Without it the general key is used, and the general key does reach the
 * model — so this keeps the accounts apart, and is not a requirement to run.
 */
function apiKeyFor(model) {
  const profile = profileFor(model);
  const scoped = profile.scopedKey === 'bunny'
    ? process.env.OPENROUTER_BUNNY_API_KEY
    : profile.scopedKey === 'deepseek'
      ? process.env.OPENROUTER_DEEPSEEK_API_KEY
      : profile.scopedKey === 'glm'
        ? process.env.OPENROUTER_GLM_API_KEY
        : undefined;
  if (scoped) return scoped;
  return process.env.OPENROUTER_API_KEY;
}

function headers() {
  return headersFor(null);
}

/**
 * Reasoning is on by default on hybrid models like Qwen3.8. It earns its
 * latency when the model is writing a lesson; it does not when someone is
 * waiting mid-conversation for the next question. A route that rejects the
 * switch is remembered, so finding out costs one request per model rather than
 * one per call.
 *
 * A model with a profile decides for itself: space-bunny is a reasoning model
 * that is only itself with thinking on, so the fast lane does not turn it off
 * the way it turns Qwen's off. The rule is per model rather than per lane because
 * "reasoning models are slow" is not a property of the lane — it is a property of
 * which weights are answering.
 */
const rejectsReasoning = new Set();

function reasoningFor(role, model, effort = null) {
  const profile = profileFor(model);
  // `reasoning: null` means "send no reasoning field at all", which is different
  // from `{ enabled: false }` and from returning undefined for the same reason.
  // The first is what a model whose endpoint requires reasoning wants; the second
  // is a 400. The distinction is a null check rather than a truthiness one,
  // because `null` and `undefined` mean different things here and only one of
  // them is right for any given model.
  // GLM on the blocks route may be given an explicit effort (OPENROUTER_GLM_BLOCKS_EFFORT,
  // e.g. "low"): its default thinking spends ten times the answer's tokens on a layout.
  // A call may ask for its own effort (the fact repairs ask for "high": a repair
  // that brings a new error costs another round of verification).
  if (isGlm(model) && roleGroup(role) === 'blocks' && (effort || process.env.OPENROUTER_GLM_BLOCKS_EFFORT)) {
    return { effort: effort || process.env.OPENROUTER_GLM_BLOCKS_EFFORT };
  }
  if (profile.reasoning === null) return undefined;
  if (profile.reasoning) return profile.reasoning;
  // Long authored output keeps the endpoint's own reasoning default.
  if (roleGroup(role) === 'deep' || roleGroup(role) === 'personalize' || roleGroup(role) === 'blocks') return undefined;
  if (rejectsReasoning.has(model)) return undefined;
  return { enabled: false };
}

/**
 * Which upstream provider serves the request.
 *
 * OpenRouter is a router: one model slug is served by many providers, and it
 * picks. For chat that choice is the whole experience, so it is asked to sort by
 * throughput and to fall through to another provider rather than returning a 429
 * — which is exactly what the single-provider `:free` route cannot do, and the
 * reason a paid route for the same model behaves so differently.
 *
 * A model with a profile brings its own: space-bunny is pinned to one upstream
 * with no substitution, so a busy or missing provider is a refusal rather than a
 * different set of weights answering a question the caller believes was asked of
 * these ones.
 */
// ── GLM 5.3 Flash: which host answers ─────────────────────────────────────
/**
 * GLM 5.3 Flash is served from DeepInfra and nothing else, with one exception.
 *
 * If 10 tries fail on DeepInfra within any 3 minutes (every failed try that is
 * then retried counts), DeepInfra is having a bad stretch and the work moves
 * to NovitaAI — including the rest of the request that tipped it over. While on
 * Novita, the next request after every 5 minutes goes to DeepInfra again as a
 * probe; the moment one succeeds, DeepInfra is the host again. Only ever one
 * host per request, with OpenRouter's own substitution switched off, so the
 * host that answered is always the host that was asked.
 *
 * OPENROUTER_GLM_PRIMARY / OPENROUTER_GLM_BACKUP name the two hosts.
 */
const GLM_MODEL = 'z-ai/glm-5.3-flash';
const GLM_PRIMARY = process.env.OPENROUTER_GLM_PRIMARY || 'deepinfra/fp4';
const GLM_BACKUP = process.env.OPENROUTER_GLM_BACKUP || 'novita/fp8';
const GLM_FAIL_LIMIT = Number(process.env.OPENROUTER_GLM_FAIL_LIMIT || 10);
const GLM_FAIL_WINDOW_MS = 3 * 60 * 1000;
const GLM_PROBE_EVERY_MS = 5 * 60 * 1000;
const glmHost = { current: GLM_PRIMARY, failures: [], lastProbe: 0 };

function isGlm(model) {
  return model === GLM_MODEL;
}

/** The host for the next GLM request: the current one, or a due probe of DeepInfra. */
function glmHostForRequest() {
  if (glmHost.current === GLM_BACKUP && Date.now() - glmHost.lastProbe >= GLM_PROBE_EVERY_MS) {
    glmHost.lastProbe = Date.now();
    return GLM_PRIMARY;
  }
  return glmHost.current;
}

function glmSucceeded(host) {
  if (host === GLM_PRIMARY && glmHost.current !== GLM_PRIMARY) {
    console.warn(`ai: ${GLM_PRIMARY} is answering again; GLM 5.3 Flash is back on it`);
    glmHost.current = GLM_PRIMARY;
    glmHost.failures = [];
  }
}

function glmFailed(host) {
  if (host !== GLM_PRIMARY || glmHost.current !== GLM_PRIMARY) return;
  const now = Date.now();
  glmHost.failures = [...glmHost.failures.filter((t) => now - t < GLM_FAIL_WINDOW_MS), now];
  if (glmHost.failures.length >= GLM_FAIL_LIMIT) {
    console.warn(`ai: ${glmHost.failures.length} GLM requests failed on ${GLM_PRIMARY} in 3 minutes;`
      + ` moving to ${GLM_BACKUP}, and trying ${GLM_PRIMARY} again every 5 minutes`);
    glmHost.current = GLM_BACKUP;
    glmHost.lastProbe = now;
    glmHost.failures = [];
  }
}

function routingFor(role, model, host = null) {
  if (isGlm(model)) return { only: [host || glmHost.current], allow_fallbacks: false };
  const profile = profileFor(model);
  if (profile.provider) return profile.provider;
  if (roleGroup(role) !== 'fast') return undefined;
  return { sort: 'throughput', allow_fallbacks: true };
}

function looksLikeReasoningRejection(err) {
  return err.status === 400 && /reasoning/i.test(`${err.message || ''} ${JSON.stringify(err.body || {})}`);
}

async function post(body) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    // The model decides the key, so a model with a scoped credential is reached
    // with it even though the body is built before the model is known.
    headers: headersFor(body && body.model),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let payload = null;
    let detail = res.statusText;
    try {
      payload = await res.json();
      detail = (payload && payload.error && (payload.error.message || payload.error.type)) || detail;
    } catch { /* keep statusText */ }
    const err = new Error(`openrouter ${res.status}: ${String(detail).slice(0, 200)}`);
    err.status = res.status;
    err.body = payload;
    throw err;
  }
  const payload = await res.json();
  // A routing failure can arrive inside a 200 body as well as by status code.
  if (payload && payload.error && !payload.choices) {
    const err = new Error(`openrouter: ${String(payload.error.message || 'upstream error').slice(0, 200)}`);
    err.status = payload.error.code || 502;
    err.body = payload;
    throw err;
  }
  return payload;
}

/**
 * Ask a model, and if that fails, the next route in the lane's chain.
 *
 * `exact` means the caller named this model deliberately — a test reaching a
 * specific route, or a model whose profile says which upstream may answer it. In
 * that case there is no chain: a different model answering would be exactly the
 * thing the caller was avoiding, and for a pinned model it would be a promise
 * about which weights were used, broken silently.
 */
async function callWithRetries(model, body, role, exact, opts = {}) {
  // How much patience a call has. Someone waiting on a chat turn is better
  // served by the next route; a minutes-long authoring call nobody is waiting on
  // should sit out a flaky gateway — a 502 from the vendor's proxy is transient,
  // and losing a long generation to one is the expensive way round.
  // GLM's DeepInfra host answers 429 "engine overloaded" when its shared pool is
  // busy. A non-chat GLM call retries every 8 seconds, up to twelve tries: a
  // brief busy spell is ridden out, and a host that is down racks up the ten
  // failed tries that move GLM to its backup host in under two minutes.
  const glmPatient = model === GLM_MODEL && roleGroup(role) !== 'fast';
  const attempts = glmPatient ? Math.max(opts.attempts || 2, 12) : (opts.attempts || 2);
  const chain = exact ? [model] : [model, ...fallbacksFor(role).filter((m) => m !== model)];
  const interactive = roleGroup(role) === 'fast';
  let lastError = null;

  // GLM's host is chosen once per request, so its retries stay on that host and
  // the request's outcome is counted against it.
  let glmHostUsed = chain.some(isGlm) ? glmHostForRequest() : null;
  for (let m = 0; m < chain.length; m++) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const reasoning = reasoningFor(role, chain[m], opts.effort || null);
        const provider = routingFor(role, chain[m], isGlm(chain[m]) ? glmHostUsed : null);
        const payload = await post({
          ...body,
          model: chain[m],
          ...(reasoning ? { reasoning } : {}),
          ...(provider ? { provider } : {}),
        });
        poolStrikes.delete(chain[m]);
        if (isGlm(chain[m])) glmSucceeded(glmHostUsed);
        if (m > 0) console.warn(`ai: served by fallback model ${chain[m]} (${chain[0]} unavailable)`);
        return payload;
      } catch (err) {
        lastError = err;
        // Every failed try on DeepInfra counts toward the switch, and once the
        // switch is made the rest of this request's tries go to the new host.
        if (isGlm(chain[m]) && glmHostUsed && (RETRYABLE.has(err.status) || !err.status)) {
          glmFailed(glmHostUsed);
          if (glmHostUsed === GLM_PRIMARY && glmHost.current !== GLM_PRIMARY) glmHostUsed = glmHost.current;
        }
        if (looksLikeReasoningRejection(err) && !rejectsReasoning.has(chain[m])) {
          // Ask again without the switch rather than losing the call over it.
          rejectsReasoning.add(chain[m]);
          continue;
        }
        const detail = (err.body && err.body.error && err.body.error.message) || err.message;
        if (err.status === 402) { standDown('out of account credit', detail); throw err; }
        if (err.status === 401) { standDown('API key rejected', detail); throw err; }
        if (err.status === 429) {
          if (quotaKind(err) === 'day') { markExhausted(chain[m], 'daily quota'); break; }
          // GLM is never set aside for a busy pool: its host rule (glmFailed)
          // decides what happens when DeepInfra keeps failing.
          if (!isGlm(chain[m])) noteRateLimit(chain[m], err);
          if (isExhausted(chain[m])) break;
          // Someone is waiting on a chat turn. Waiting four seconds for a busy
          // free pool is worse than asking the next route now, so the interactive
          // lane moves on instead of retrying the same one.
          if (interactive) break;
        }
        if (WRONG_MODEL.has(err.status)) {
          if (m === 0) console.warn(`ai: ${chain[m]} unusable (${err.message}); trying the next model`);
          break;
        }
        if (!RETRYABLE.has(err.status)) throw err;
        // Same reasoning: for chat, the next route beats a second wait on this one.
        if (interactive) break;
        if (attempt < attempts - 1) {
          const wait = err.status === 429
            ? (glmPatient ? 8000 : 4000)
            : Math.min(30000, 1200 * (3 ** attempt));
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
  }
  throw lastError;
}

function usageOf(payload) {
  const u = (payload && payload.usage) || {};
  const cached = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
  return {
    input_tokens: Math.max(0, (u.prompt_tokens || 0) - cached),
    output_tokens: u.completion_tokens || 0,
    cache_read_input_tokens: cached,
    // The thinking a reasoning model did, counted apart from the answer it
    // finally wrote. It arrives in the usage the stream's final chunk carries —
    // `completion_tokens_details.reasoning_tokens` on the wire, the field the
    // OpenRouter SDK surfaces as `usage.completionTokensDetails.reasoningTokens`.
    // These tokens are already inside `output_tokens` (they are billed there);
    // this is the breakdown, kept so a route's thinking can be seen rather than
    // inferred from a slow answer.
    reasoning_tokens: (u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens) || 0,
  };
}

/**
 * Build the message list, including a system turn only when there is one.
 *
 * A system turn is not always sent. Every call in this app passes a system prompt,
 * so this was not visible until a caller left it out — and the request that
 * resulted carried `content: undefined` into a turn whose content is not
 * optional, which one route answers with a 400 and another might quietly accept.
 * So the turn is omitted rather than sent empty, and a call that wants the
 * instruction and does not pass one is a mistake worth seeing rather than
 * something to paper over.
 */
function messagesFor(system, messages) {
  return [
    // Only when there is something to say. A turn with no content is not an empty
    // instruction, it is a malformed request.
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages.map((m) => {
      const out = {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      };
      // A model's own thinking, handed back with the turn it belongs to.
      //
      // This is what makes a follow-up a continuation rather than a fresh
      // question. When a reasoning model answers it returns `reasoning_details`
      // alongside the text, and passing that field back unmodified on the next
      // request is what lets it pick its reasoning up where it stopped. Strip it
      // and the model is asked the same thing again having forgotten it worked
      // it out — which is why "Are you sure? Think carefully." after a stripped
      // turn produces a different, usually worse, answer rather than a better one.
      //
      // Sent only for a model that asked for it, and only when the field is
      // actually present: an empty array is not the same as a preserved trace,
      // and other routes reject the field outright.
      if (m.reasoning_details !== undefined && m.reasoning_details !== null) {
        out.reasoning_details = m.reasoning_details;
      }
      return out;
    }),
  ];
}

/**
 * GLM sometimes leaks its own tool-call markup into an argument: the next
 * argument arrives inside the previous one's string, as
 * `...]<arg_key>checks</arg_key><arg_value>[...]`. Split those back into the
 * arguments they are, so neither is lost.
 */
function splitLeakedArgs(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const out = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string' || !value.includes('<arg_key>')) continue;
    out[key] = value.slice(0, value.indexOf('<arg_key>')).trim();
    const re = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)(?:<\/arg_value>|(?=<arg_key>)|$)/g;
    let m;
    while ((m = re.exec(value))) {
      const k = m[1].trim();
      if (k && out[k] === undefined) out[k] = m[2].trim();
    }
  }
  return out;
}

/** One structured call: JSON matching `schema`, or null. */
async function structured({ role, system, user, schema, schemaName = 'submit', maxTokens = 4096, lane, effort = null }) {
  const model = modelFor(role);
  const body = {
    messages: messagesFor(system, [{ role: 'user', content: user }]),
    max_tokens: maxTokens,
    tools: [{
      type: 'function',
      function: {
        name: schemaName,
        description: 'Submit the result. Call this exactly once.',
        parameters: schema,
      },
    }],
    tool_choice: 'auto',
  };

  const queue = lane || (role === 'regen' ? 'parallel' : 'background');
  const payload = await queued(
    () => callWithRetries(model, body, role, false, { attempts: queue === 'background' ? 5 : 2, effort }),
    queue,
  );
  const message = payload && payload.choices && payload.choices[0] && payload.choices[0].message;
  if (!message) return null;

  const finish = (payload.choices[0] || {}).finish_reason;
  const call = (message.tool_calls || []).find((c) => c.function && c.function.name === schemaName)
    || (message.tool_calls || [])[0];
  if (call && call.function && call.function.arguments) {
    try {
      return { data: splitLeakedArgs(JSON.parse(call.function.arguments)), usage: usageOf(payload), model: payload.model || model };
    } catch {
      // Almost always the token cap cutting the arguments mid-string. Silence
      // here reads as "the model had nothing to say", which is the wrong
      // diagnosis and the hardest kind to find.
      console.warn(`ai: ${model} returned unparseable ${schemaName} arguments`
        + `${finish === 'length' ? ' — output hit max_tokens, raise maxTokens for this call' : ''}`
        + ` (${call.function.arguments.length} chars)`);
      return null;
    }
  }
  if (finish === 'length') {
    console.warn(`ai: ${model} hit max_tokens before calling ${schemaName}; raise maxTokens for this call`);
  }

  // Some models answer with the JSON in the message instead of calling the
  // tool. Accept that rather than throwing the work away.
  const text = String(message.content || '').trim();
  const json = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
  if (!json.startsWith('{')) return null;
  try {
    return { data: JSON.parse(json), usage: usageOf(payload), model: payload.model || model };
  } catch {
    return null;
  }
}

/**
 * One plain-text exchange.
 *
 * `model` overrides the lane's model for this one call. It exists so a specific
 * route can be exercised on purpose — a test that has to reconfigure a lane to
 * reach one model is testing the configuration rather than the route, and a
 * configuration test cannot tell a profile that works from one that is never
 * used. It does not add the model to the lane's fallback chain: a call that
 * overrides wants *this* model, and quietly answering with another one would be
 * the fault the override exists to prevent.
 */
async function chat({ role, system, messages, maxTokens = 1024, model: wanted, lane }) {
  const model = wanted || modelFor(role);
  const body = {
    messages: messagesFor(system, messages),
    max_tokens: maxTokens,
  };
  // `lane` defaults to the chat queue; long authoring passes 'background' so it
  // cannot hold a conversation's turns behind it. See mimo.js for the reasoning.
  const payload = await queued(() => callWithRetries(model, body, role, !!wanted), lane || 'interactive');
  const message = payload && payload.choices && payload.choices[0] && payload.choices[0].message;
  const text = message ? String(message.content || '').trim() : '';
  if (!text) return null;
  return {
    text,
    usage: usageOf(payload),
    model: payload.model || model,
    // The model's own thinking, handed back so a caller can send it with the next
    // turn and have the model continue rather than start over. Only for a model
    // whose profile asks for it, and only when the field is actually there.
    reasoning_details: carriesReasoning(model) && message ? message.reasoning_details : undefined,
  };
}

/**
 * The same exchange, streamed, so the coach starts appearing immediately.
 *
 * `model` overrides the lane's model for this one call, on the same terms as
 * `chat` above: a caller that names the model wants *that* one, so there is no
 * fallback chain and no substitution. It is here rather than only on `chat`
 * because the base-lesson generator is the one caller that needs a named route
 * *and* a stream — it writes a lesson page in nine streamed calls, and the whole
 * point of naming the route is that a different model's weights must not answer
 * in its place.
 */
async function chatStream({ role, system, messages, maxTokens = 1024, model: wanted, onDelta }) {
  const model = wanted || modelFor(role);
  const reasoning = reasoningFor(role, model);
  const provider = routingFor(role, model);
  const body = {
    model,
    messages: messagesFor(system, messages),
    max_tokens: maxTokens,
    stream: true,
    ...(reasoning ? { reasoning } : {}),
    ...(provider ? { provider } : {}),
  };

  return queued(async () => {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: headersFor(model),
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      let detail = res.statusText;
      try { const e = await res.json(); detail = (e.error && e.error.message) || detail; } catch { /* keep */ }
      const err = new Error(`openrouter ${res.status}: ${String(detail).slice(0, 200)}`);
      err.status = res.status;
      // The streaming path does not go through callWithRetries, so it has to
      // recognise the two unfixable failures itself.
      if (res.status === 402) standDown('out of account credit', detail);
      if (res.status === 401) standDown('API key rejected', detail);
      throw err;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let usage = null;
    // The stream frames name the route that answered; keep it for costing.
    let served = model;
    // And a reasoning model's thinking arrives in its own delta field, arriving
    // across several frames. Collected and handed back with the reply, so a
    // streamed turn can be continued exactly like a non-streamed one — the coach
    // is the streamed path, and a model whose reasoning is dropped there would
    // quietly stop continuing while working everywhere else.
    let reasoningDetails = null;

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        // OpenRouter sends ": OPENROUTER PROCESSING" comment frames as
        // keep-alives while a free route queues. They are not data.
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const json = line.slice(5).trim();
        if (!json || json === '[DONE]') continue;
        let payload;
        try { payload = JSON.parse(json); } catch { continue; }
        if (payload.model) served = payload.model;
        if (payload.usage) usage = usageOf(payload);
        const choice = payload.choices && payload.choices[0];
        const delta = choice && choice.delta;
        if (delta && delta.reasoning_details) {
          reasoningDetails = (reasoningDetails || []).concat(delta.reasoning_details);
        }
        const text = delta ? delta.content : '';
        if (!text) continue;
        full += text;
        if (onDelta) onDelta(text, full);
      }
    }

    const trimmed = full.trim();
    return trimmed
      ? {
        text: trimmed,
        usage,
        model: served,
        reasoning_details: carriesReasoning(model) ? reasoningDetails : undefined,
      }
      : null;
  }, 'interactive');
}

/**
 * Dollars per million tokens, for the per-user daily ceiling. A `:free` route
 * bills nothing, so what bounds it is the call count, not the cents.
 */
const PRICES = {
  'qwen/qwen3.8-27b:free': { input: 0, output: 0, cacheRead: 0 },
  // The paid route for the same model. One coaching turn is roughly 1.5k in and
  // 150 out, so about 0.08 cents — the per-user daily ceiling in AI_DAILY_CENTS
  // bounds it either way.
  'qwen/qwen3.8-27b': { input: 0.42, output: 3.00, cacheRead: 0.042 },
  // Read off the live API rather than guessed: a strawberry-r call came back
  // `cost: 0` with `upstream_inference_cost: 0`, so this route bills nothing today
  // and the per-user ceiling is bounded by AI_DAILY_CALLS rather than by cents.
  // If it ever starts billing, this is the number to update — and the entry being
  // present is what makes the change visible, because a missing price silently
  // costs nothing instead of silently costing something.
  'stealth/space-bunny-alpha': { input: 0, output: 0, cacheRead: 0 },
  // DeepSeek v4.1 flash, pinned to the sail-research fp4 upstream. The entry is
  // here so that a route which starts billing is caught rather than silently
  // costing nothing — which is how a per-user ceiling stops bounding anything
  // without saying so. Read the live figure off the model page and update it here
  // if this is billed differently from what is written here.
  'deepseek/deepseek-v4.1-flash': { input: 0, output: 0, cacheRead: 0 },
  // GLM 5.3 flash on the DeepInfra fp4 upstream. The entry is here so a route
  // that starts billing is caught rather than silently costing nothing; read the
  // live figure off the model page and update it if this route is billed.
  'z-ai/glm-5.3-flash': { input: 0, output: 0, cacheRead: 0 },
};

function costCents(model, usage) {
  if (!usage) return 0;
  if (/:free$/.test(model || '')) return 0;
  const p = PRICES[model];
  if (!p) return 0;
  return 100 * (
    ((usage.input_tokens || 0) * p.input
      + (usage.cache_read_input_tokens || 0) * p.cacheRead
      + (usage.output_tokens || 0) * p.output) / 1e6
  );
}

/** The models this key can reach. Used by `npm run ai:models`. */
async function listModels() {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers() });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return (data.data || []).map((m) => ({
    id: m.id,
    display: m.name || '',
    methods: ['generateContent'],
  }));
}

module.exports = {
  name: 'openrouter',
  isEnabled,
  isConfigured,
  status,
  modelFor,
  structured,
  chat,
  chatStream,
  costCents,
  listModels,
  quotaKind,
  isSharedPoolLimit,
  usableRoutes,
  routesFor,
  markExhausted,
  isExhausted,
  PRICES,
  // What a model needs from us, exposed so it can be read rather than inferred.
  // `npm run ai:models` prints it, and the self test asserts that a model
  // configured for a lane really does get the reasoning, provider and
  // reasoning_details that its profile promises — a profile nothing checks is a
  // comment, and the failure it describes is invisible.
  profileFor,
  carriesReasoning,
  MODEL_PROFILES,
  glmHost,
  splitLeakedArgs,
  glmHostForRequest,
  glmFailed,
  glmSucceeded,
};
