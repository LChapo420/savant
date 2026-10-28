/**
 * Google Gemini, through the Generative Language REST API.
 *
 * Raw HTTP rather than a client library: the two calls this app makes
 * (structured JSON and plain chat) are a few lines each, and it keeps the
 * dependency list honest.
 *
 * Model ids are configuration, not code. Google's free tier through AI Studio
 * renames and rotates models often, so `GEMINI_MODEL` (and optionally
 * `GEMINI_MODEL_FAST`) select them, and `npm run ai:models` prints exactly what
 * the key in use can reach.
 */
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

const MODEL_AUTHOR = process.env.GEMINI_MODEL || 'gemini-flash-latest';

/**
 * The chat lane gets its own model, and it is a small one by default.
 *
 * This is the single biggest lever on how fast the coach feels. Measured on the
 * free tier, one short coaching turn takes roughly 0.8s on flash-lite, 2.3s on
 * a mid model, and 30s on a large one — and the learner is sitting there waiting
 * for all of it. Authoring questions in the background can afford the big model;
 * a conversation cannot.
 */
const MODEL_FAST = process.env.GEMINI_MODEL_FAST || 'gemini-3.5-flash-lite';

/**
 * Where to go when a model has spent its daily quota. This is not the same as
 * the fallback list above: that one is for a model that is busy or missing right
 * now, this one is for a model that will not answer again until tomorrow.
 */
const DAILY_FALLBACK = process.env.GEMINI_MODEL_DAILY_FALLBACK || 'gemini-3.1-flash-lite';

/**
 * Models to try when the chosen one is unavailable. The newest model is also the
 * most contended: on the free tier it answers 503 "high demand" and burns
 * through quota, so a single-model client spends most of its time waiting and
 * then falling back to the bank anyway. The chat lane's list is ordered by
 * measured latency, not by capability.
 */
function fallbacksFor(role) {
  const configured = role === 'fast' ? process.env.GEMINI_MODEL_FAST_FALLBACK : process.env.GEMINI_MODEL_FALLBACK;
  const defaults = role === 'fast'
    ? 'gemini-3.1-flash-lite,gemini-flash-lite-latest'
    : 'gemini-3.1-flash-lite,gemini-flash-lite-latest';
  const list = (configured === undefined ? defaults : configured)
    .split(',').map((s) => s.trim()).filter(Boolean);
  // The daily fallback belongs in every chain, and a model that is out of
  // quota does not belong in any of them.
  if (DAILY_FALLBACK && !list.includes(DAILY_FALLBACK)) list.push(DAILY_FALLBACK);
  return list.filter((m) => !isExhausted(m));
}

/** Statuses worth trying again on the same model: overloaded, rate limited, or
 *  a transient 5xx. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Statuses that mean this model is wrong for this key — retiring it, gating it
 *  behind a tier, or a typo. Move to the next model rather than give up. */
const WRONG_MODEL = new Set([400, 403, 404]);

/**
 * Two lanes, because two kinds of call have opposite priorities.
 *
 * Background work (authoring a batch of questions, analyzing a session) is
 * spaced out to stay inside the free tier's per-minute limit. Chat is someone
 * waiting at a keyboard, so it gets its own lane with a much smaller gap and
 * never queues behind an 8,000-token authoring call. Serializing both through
 * one queue was costing a coach turn seconds before its request was even sent.
 */
const GAPS = {
  background: Number(process.env.GEMINI_MIN_GAP_MS || 1200),
  interactive: Number(process.env.GEMINI_CHAT_GAP_MS || 150),
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
  const gap = GAPS[laneName] || GAPS.background;
  const run = lane.chain.then(async () => {
    const wait = Math.max(0, lane.lastCallAt + gap - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lane.lastCallAt = Date.now();
    return task();
  });
  lane.chain = run.catch(() => {});
  return run;
}

/**
 * Thinking costs latency a conversation cannot afford: measured, a short
 * coaching turn runs about three times faster with it off. Support varies by
 * model and the field is rejected outright on some, so the first rejection is
 * remembered and the call is retried without it.
 */
const noThinkRejected = new Set();

function withThinkingOff(generationConfig, model) {
  if (noThinkRejected.has(model)) return generationConfig;
  return { ...generationConfig, thinkingConfig: { thinkingBudget: 0 } };
}

function isThinkingComplaint(err) {
  return err.status === 400 && /invalid argument|thinking/i.test(err.message || '');
}

function isEnabled() {
  return !!process.env.GEMINI_API_KEY;
}

/** The model to use now: the configured one, or the daily fallback if it has
 *  spent its quota for the day. */
function modelFor(role) {
  const configured = role === 'author' || role === 'deep' ? MODEL_AUTHOR : MODEL_FAST;
  if (isExhausted(configured) && DAILY_FALLBACK && !isExhausted(DAILY_FALLBACK)) return DAILY_FALLBACK;
  return configured;
}

/**
 * Gemini's response schema is the OpenAPI subset: uppercase type names, no
 * `additionalProperties`. Everything else in the app speaks plain JSON Schema,
 * so the translation happens here and nowhere else.
 */
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  if (schema.type) out.type = String(schema.type).toUpperCase();
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum.map(String);
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.properties) {
    out.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      out.properties[key] = toGeminiSchema(value);
    }
    // Ordering is a hint to the model about the order to emit fields in, which
    // measurably improves adherence on nested objects.
    out.propertyOrdering = Object.keys(schema.properties);
  }
  if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required;
  return out;
}

async function call(model, body) {
  const res = await fetch(`${ENDPOINT}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = '';
    let payload = null;
    try {
      payload = await res.json();
      detail = payload && payload.error ? payload.error.message : '';
    } catch { detail = res.statusText; }
    const error = new Error(`gemini ${res.status}: ${detail}`.slice(0, 300));
    error.status = res.status;
    error.body = payload;
    throw error;
  }
  return res.json();
}

/**
 * Per-minute and per-day quota both come back as 429, and they need opposite
 * responses: wait a few seconds for the first, stop using the model until
 * tomorrow for the second.
 *
 * Google reports which one in `error.details` as a QuotaFailure, but the exact
 * field naming has moved around and cannot be verified without actually
 * exhausting a quota, so several signals are checked and a long retry delay is
 * taken as daily. When nothing is conclusive the call is treated as a
 * per-minute limit — the recoverable reading — and the counter below catches a
 * model that keeps saying 429 anyway.
 */
function quotaKind(err) {
  const details = (err.body && err.body.error && err.body.error.details) || [];
  const text = JSON.stringify(details);
  if (/per[\s_-]*day|perday|daily/i.test(text)) return 'day';
  if (/per[\s_-]*minute|perminute/i.test(text)) return 'minute';

  const retryInfo = details.find((d) => String(d['@type'] || '').includes('RetryInfo'));
  const seconds = retryInfo ? parseFloat(String(retryInfo.retryDelay || '').replace('s', '')) : NaN;
  if (Number.isFinite(seconds) && seconds > 300) return 'day';
  if (Number.isFinite(seconds)) return 'minute';

  if (/per day|daily limit|quota.*exceeded.*day/i.test(err.message || '')) return 'day';
  return 'minute';
}

/** Models that have hit their daily cap, and when that cap resets. */
const exhaustedUntil = new Map();
const rateLimitHits = new Map();

/** Google's free tier resets at midnight Pacific. Without a timezone library,
 *  the next 08:00 UTC is close enough to avoid retrying all day. */
function nextDailyReset() {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0));
  if (reset <= now) reset.setUTCDate(reset.getUTCDate() + 1);
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
  console.warn(`ai: ${model} is out of daily quota (${reason}); using the daily fallback until it resets`);
}

/**
 * A model that answers 429 several times in a row despite the per-minute
 * backoff is, in practice, out of daily quota whatever the error body said.
 */
function noteRateLimit(model) {
  const hits = (rateLimitHits.get(model) || 0) + 1;
  rateLimitHits.set(model, hits);
  if (hits >= 3) markExhausted(model, 'repeated rate limits');
  return hits;
}

/**
 * Try the chosen model, then the fallbacks, retrying the retryable statuses
 * with a short backoff. Returns the first payload that comes back, or throws
 * the last error so the caller can log it and drop to the bank.
 */
async function callWithRetries(model, body, role = 'fast', opts = {}) {
  // As in mimo.js: a conversation turn wants to fail fast and move on, while a
  // long authoring call nobody is waiting on should sit out a flaky gateway.
  const attempts = opts.attempts || 2;
  const chain = [model, ...fallbacksFor(role).filter((m) => m !== model)];
  let lastError = null;

  for (let m = 0; m < chain.length; m++) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const payload = await call(chain[m], body);
        if (m > 0) console.warn(`ai: served by fallback model ${chain[m]} (${chain[0]} unavailable)`);
        return payload;
      } catch (err) {
        lastError = err;
        // A model that rejects the thinking switch is retried once without it,
        // and remembered, so the cost is one request on the first encounter.
        if (isThinkingComplaint(err) && body.generationConfig && body.generationConfig.thinkingConfig) {
          noThinkRejected.add(chain[m]);
          delete body.generationConfig.thinkingConfig;
          continue;
        }
        if (WRONG_MODEL.has(err.status)) {
          // Nothing to retry here: this model will never answer for this key.
          if (m === 0) console.warn(`ai: ${chain[m]} unusable (${err.message}); trying the next model`);
          break;
        }
        if (err.status === 429) {
          // Out of quota for the day means no amount of waiting helps: retire
          // the model until it resets and move straight to the next one.
          const kind = quotaKind(err);
          if (kind === 'day') {
            markExhausted(chain[m], 'daily quota');
            break;
          }
          noteRateLimit(chain[m]);
          if (isExhausted(chain[m])) break;
        }
        if (!RETRYABLE.has(err.status)) throw err;
        // Back off before another attempt on the same model; move on after.
        if (attempt < attempts - 1) {
          const wait = err.status === 429 ? 4000 : Math.min(30000, 1500 * (3 ** attempt));
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
  }
  throw lastError;
}

function textOf(payload) {
  const candidate = payload && payload.candidates && payload.candidates[0];
  if (!candidate) return null;
  // A response cut off by the safety filter or the token cap has no usable text,
  // and treating it as empty is what makes the caller fall back cleanly.
  if (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) return null;
  const parts = (candidate.content && candidate.content.parts) || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  return text || null;
}

function usageOf(payload) {
  const u = (payload && payload.usageMetadata) || {};
  return {
    input_tokens: u.promptTokenCount || 0,
    output_tokens: u.candidatesTokenCount || 0,
    cache_read_input_tokens: u.cachedContentTokenCount || 0,
  };
}

/** One structured call: JSON matching `schema`, or null. */
async function structured({ role, system, user, schema, maxTokens = 4096, lane }) {
  const model = modelFor(role);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: toGeminiSchema(schema),
      maxOutputTokens: maxTokens,
      temperature: 0.8,
    },
  };

  const queue = lane || (role === 'regen' ? 'parallel' : 'background');
  const payload = await queued(
    () => callWithRetries(model, body, role, { attempts: queue === 'background' ? 5 : 2 }),
    queue,
  );

  const text = textOf(payload);
  if (!text) return null;
  try {
    return { data: JSON.parse(text), usage: usageOf(payload), model };
  } catch {
    return null;
  }
}

function chatBody({ system, messages, maxTokens, model }) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }],
    })),
    generationConfig: withThinkingOff({ maxOutputTokens: maxTokens, temperature: 0.7 }, model),
  };
}

/** One plain-text exchange. `messages` is [{ role: 'user'|'assistant', content }]. */
async function chat({ role, system, messages, maxTokens = 1024 }) {
  const model = modelFor(role);
  const body = chatBody({ system, messages, maxTokens, model });
  const payload = await queued(() => callWithRetries(model, body, role), 'interactive');
  const text = textOf(payload);
  return text ? { text, usage: usageOf(payload), model } : null;
}

/**
 * The same exchange, streamed. `onDelta(text)` is called with each fragment as
 * it arrives, which is what makes the coach feel immediate: the first words
 * appear in a few hundred milliseconds instead of the learner watching a
 * spinner for the whole reply.
 *
 * No fallback chain here — a stream that has already started printing cannot be
 * restarted on another model — so the caller falls back to the non-streaming
 * path if this throws before the first fragment.
 */
async function chatStream({ role, system, messages, maxTokens = 1024, onDelta }) {
  const model = modelFor(role);
  const body = chatBody({ system, messages, maxTokens, model });

  async function open(payloadBody) {
    const res = await fetch(`${ENDPOINT}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(payloadBody),
    });
    if (!res.ok || !res.body) {
      let detail = res.statusText;
      try { const e = await res.json(); detail = (e.error && e.error.message) || detail; } catch { /* keep statusText */ }
      const err = new Error(`gemini ${res.status}: ${String(detail).slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  return queued(async () => {
    let res;
    try {
      res = await open(body);
    } catch (err) {
      // Same thinking-switch dance as the non-streaming path. Nothing has been
      // printed yet, so retrying here is free.
      if (!isThinkingComplaint(err) || !body.generationConfig.thinkingConfig) throw err;
      noThinkRejected.add(model);
      delete body.generationConfig.thinkingConfig;
      res = await open(body);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let usage = null;

    for await (const chunk of res.body) {
      // The wire uses CRLF; normalizing first keeps the frame split honest.
      buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
      // SSE frames are separated by a blank line; a frame may arrive in pieces.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const json = line.slice(5).trim();
        if (!json || json === '[DONE]') continue;
        let payload;
        try { payload = JSON.parse(json); } catch { continue; }
        if (payload.usageMetadata) usage = usageOf(payload);
        const parts = (payload.candidates && payload.candidates[0]
          && payload.candidates[0].content && payload.candidates[0].content.parts) || [];
        const text = parts.map((p) => p.text || '').join('');
        if (!text) continue;
        full += text;
        if (onDelta) onDelta(text, full);
      }
    }

    const trimmed = full.trim();
    return trimmed ? { text: trimmed, usage, model } : null;
  }, 'interactive');
}

/** Free tier costs nothing; paid tiers are cheap enough that the call ceiling,
 *  not the cent ceiling, is the limit worth enforcing. */
function costCents() {
  return 0;
}

/** Every model this key can reach. Used by `npm run ai:models`. */
async function listModels() {
  const res = await fetch(`${ENDPOINT}/models`, {
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return (data.models || []).map((m) => ({
    id: String(m.name || '').replace(/^models\//, ''),
    display: m.displayName,
    input_limit: m.inputTokenLimit,
    output_limit: m.outputTokenLimit,
    methods: m.supportedGenerationMethods || [],
  }));
}

function isConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

function status() {
  return { configured: isConfigured(), available: isEnabled(), reason: isConfigured() ? null : 'no API key' };
}

module.exports = {
  name: 'gemini',
  isEnabled,
  isConfigured,
  status,
  modelFor,
  structured,
  chat,
  chatStream,
  quotaKind,
  markExhausted,
  isExhausted,
  costCents,
  listModels,
  toGeminiSchema,
};
