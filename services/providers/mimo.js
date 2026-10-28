/**
 * Xiaomi MiMo, through its OpenAI-compatible chat completions endpoint.
 *
 * Two models, two jobs:
 *   deep  mimo-v2.6-pro    writing lessons, reading a learner's style out of a
 *                          session, building the retention set — the work where
 *                          judgment shows up in the result
 *   fast  mimo-v2.6-flash  the coach, the explainer, grading a short answer —
 *                          the work a learner is sitting there waiting for
 *
 * Documented surface used here (mimo.mi.com/docs/en-US/api/chat/openai-api):
 *   POST {base}/chat/completions with `api-key` auth
 *   `thinking: { type: 'enabled' | 'disabled' }`
 *   `stream: true` for SSE
 *   `tools` + `tool_choice: 'auto'` for function calling
 *
 * Structured output goes through a single function tool rather than
 * `response_format`, because tool calling is documented and a JSON-schema
 * response format is not. Same approach as the Anthropic provider.
 */
const BASE_URL = (process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1').replace(/\/$/, '');

const MODEL_DEEP = process.env.MIMO_MODEL_DEEP || 'mimo-v2.6-pro';
const MODEL_FAST = process.env.MIMO_MODEL_FAST || 'mimo-v2.6-flash';
const MODEL_REGEN = process.env.MIMO_MODEL_REGEN || MODEL_FAST;
// The backup for writing a level for one learner (the `personalize` role): the
// pro model, because a tailored page is judgment work end to end.
const MODEL_PERSONALIZE = process.env.MIMO_MODEL_PERSONALIZE || MODEL_DEEP;
// The whole-subject placement quiz. Pro, and deliberately not the daily fallback
// either: a subject's questions are one document, and half of it written by a
// smaller model would make the difficulty ramp a lie.
const MODEL_PLACEMENT = process.env.MIMO_MODEL_PLACEMENT || MODEL_DEEP;
// The questions for a game level. Pro, pinned like the placement quiz: a level's
// questions are one document played one after another, and a set half-written by
// a smaller model would make its own difficulty a lie.
const MODEL_GAMES = process.env.MIMO_MODEL_GAMES || MODEL_DEEP;
// The backup for block layouts and fill-outs (the `blocks` role), behind GLM 5.3
// Flash on OpenRouter: the pro model.
const MODEL_BLOCKS = process.env.MIMO_MODEL_BLOCKS || MODEL_DEEP;
const DAILY_FALLBACK = process.env.MIMO_MODEL_DAILY_FALLBACK || MODEL_FAST;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const WRONG_MODEL = new Set([400, 403, 404]);

/**
 * 402 means the account is out of credit. Retrying cannot fix it and neither
 * can another model, so the provider stands itself down until someone tops up
 * — otherwise every lesson, every coaching turn, and every analysis pays a
 * round trip to learn the same thing.
 */
let outOfCredit = false;
let outOfCreditAt = 0;
const CREDIT_RECHECK_MS = Number(process.env.MIMO_CREDIT_RECHECK_MS || 10 * 60 * 1000);

function creditBlocked() {
  if (!outOfCredit) return false;
  if (Date.now() - outOfCreditAt > CREDIT_RECHECK_MS) {
    // Long enough that a top-up is plausible: let one call through to find out.
    outOfCredit = false;
    return false;
  }
  return true;
}

function markOutOfCredit(message) {
  if (!outOfCredit) {
    console.warn(`ai: MiMo says "${message}". Standing down until the account is topped up; `
      + 'the app falls back to the next provider, or to the question bank.');
  }
  outOfCredit = true;
  outOfCreditAt = Date.now();
}

/** Background work is spaced out; chat has its own lane so it never queues
 *  behind a lesson being written. */
const GAPS = {
  background: Number(process.env.MIMO_MIN_GAP_MS || 400),
  interactive: Number(process.env.MIMO_CHAT_GAP_MS || 0),
};
const lanes = {
  background: { chain: Promise.resolve(), lastCallAt: 0 },
  interactive: { chain: Promise.resolve(), lastCallAt: 0 },
};

/**
 * Every lane serializes: one call at a time, spaced by its gap. That is right
 * for background authoring, where nothing is waiting, and wrong for remaking a
 * failed quiz, where the learner is. A 15-question quiz goes out as two batches;
 * serialized they take 36 seconds, concurrent they take 18. So the regen role
 * skips the queue rather than waiting behind its own other half.
 */
function queued(task, laneName = 'background') {
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

function isEnabled() {
  return !!process.env.MIMO_API_KEY && !creditBlocked();
}

/** Configured, whether or not it can currently answer. Used for reporting. */
function isConfigured() {
  return !!process.env.MIMO_API_KEY;
}

function status() {
  return {
    configured: isConfigured(),
    available: isEnabled(),
    reason: !isConfigured() ? 'no API key' : creditBlocked() ? 'out of account credit' : null,
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

/** Per-day and per-minute limits both arrive as 429 and need opposite handling:
 *  wait out the minute, stand down for the day. */
function quotaKind(err) {
  const text = JSON.stringify((err.body && err.body.error) || err.body || {});
  if (/per[\s_-]*day|daily|rpd/i.test(text)) return 'day';
  if (/per[\s_-]*minute|rpm|tpm/i.test(text)) return 'minute';
  if (/per day|daily limit/i.test(err.message || '')) return 'day';
  return 'minute';
}

function noteRateLimit(model) {
  const hits = (rateLimitHits.get(model) || 0) + 1;
  rateLimitHits.set(model, hits);
  if (hits >= 3) markExhausted(model, 'repeated rate limits');
}

/**
 * `deep` is the pro model; `fast` and `regen` are flash. The role names used
 * across the app are deep / author (a synonym) / fast / regen — the last being
 * remaking a failed checkpoint's questions, which is bulk authoring against a
 * fixed spec and wants the quick model, not the expensive one.
 */
function modelFor(role) {
  const wanted = role === 'deep' || role === 'author' || role === 'diagnose' ? MODEL_DEEP
    // The level editor is bulk authoring against a fixed spec, exactly like regen,
    // so it takes the same fast model.
    : role === 'regen' || role === 'rewrite' ? MODEL_REGEN
      : role === 'personalize' ? MODEL_PERSONALIZE
        : role === 'placement' ? MODEL_PLACEMENT
          : role === 'games' ? MODEL_GAMES
            : role === 'blocks' ? MODEL_BLOCKS
              : MODEL_FAST;
  // The placement quiz and the game questions are pinned to their model with no
  // substitute, not even the daily fallback: one document, one writer.
  if (role === 'placement' || role === 'games') return wanted;
  if (isExhausted(wanted) && DAILY_FALLBACK && !isExhausted(DAILY_FALLBACK)) return DAILY_FALLBACK;
  return wanted;
}

function fallbacksFor(role) {
  // Nothing behind the placement quiz or the game questions. If the pro model
  // cannot answer, the questions are not written rather than written by
  // something else.
  if (role === 'placement' || role === 'games') return [];
  const light = role === 'fast' || role === 'regen';
  // 'diagnose' is pinned to the pro model, so it shares the deep fallback list.
  const configured = light ? process.env.MIMO_MODEL_FAST_FALLBACK : process.env.MIMO_MODEL_FALLBACK;
  const defaults = light ? MODEL_FAST : `${MODEL_DEEP},${MODEL_FAST}`;
  const list = (configured === undefined ? defaults : configured)
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (DAILY_FALLBACK && !list.includes(DAILY_FALLBACK)) list.push(DAILY_FALLBACK);
  return list.filter((m) => !isExhausted(m));
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'api-key': process.env.MIMO_API_KEY,
    Authorization: `Bearer ${process.env.MIMO_API_KEY}`,
  };
}

async function post(body) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let payload = null;
    let detail = res.statusText;
    try {
      payload = await res.json();
      detail = (payload && payload.error && (payload.error.message || payload.error.type)) || detail;
    } catch { /* keep statusText */ }
    const err = new Error(`mimo ${res.status}: ${String(detail).slice(0, 200)}`);
    err.status = res.status;
    err.body = payload;
    throw err;
  }
  return res.json();
}

async function callWithRetries(model, body, role, opts = {}) {
  // How much patience a call has. A conversation turn wants to fail fast and
  // fall to the next provider; a minutes-long authoring call nobody is waiting
  // on is exactly the call that should sit out a flaky gateway — the errors are
  // transient (502 from the vendor's own proxy, measured in waves) and losing a
  // ten-minute generation to one of them is the expensive way round.
  const attempts = opts.attempts || 2;
  const chain = [model, ...fallbacksFor(role).filter((m) => m !== model)];
  let lastError = null;

  for (let m = 0; m < chain.length; m++) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const payload = await post({ ...body, model: chain[m] });
        if (m > 0) console.warn(`ai: served by fallback model ${chain[m]} (${chain[0]} unavailable)`);
        return payload;
      } catch (err) {
        lastError = err;
        if (err.status === 402) {
          markOutOfCredit((err.body && err.body.error && err.body.error.message) || err.message);
          throw err;
        }
        if (err.status === 429) {
          if (quotaKind(err) === 'day') { markExhausted(chain[m], 'daily quota'); break; }
          noteRateLimit(chain[m]);
          if (isExhausted(chain[m])) break;
        }
        if (WRONG_MODEL.has(err.status)) {
          if (m === 0) console.warn(`ai: ${chain[m]} unusable (${err.message}); trying the next model`);
          break;
        }
        if (!RETRYABLE.has(err.status)) throw err;
        if (attempt < attempts - 1) {
          const wait = err.status === 429 ? 4000 : Math.min(30000, 1200 * (3 ** attempt));
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
  };
}

function messagesFor(system, messages) {
  return [
    { role: 'system', content: system },
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    })),
  ];
}

/**
 * Thinking is on by default on these models. It earns its latency when the
 * model is writing a lesson or reading a learner; it does not when someone is
 * waiting mid-conversation for the next question.
 */
function thinkingFor(role) {
  const deep = role === 'deep' || role === 'author' || role === 'diagnose' || role === 'personalize' || role === 'blocks';
  return { type: deep ? 'enabled' : 'disabled' };
}

/** One structured call: JSON matching `schema`, or null. */
async function structured({ role, system, user, schema, schemaName = 'submit', maxTokens = 4096, lane, think }) {
  const model = modelFor(role);
  const body = {
    messages: messagesFor(system, [{ role: 'user', content: user }]),
    max_completion_tokens: maxTokens,
    // A caller can turn thinking off on a deep model when latency is the
    // constraint: the pro model answers a tight, well-specified question in about
    // a sixth of the time without it.
    thinking: think === false ? { type: 'disabled' } : thinkingFor(role),
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
    () => callWithRetries(model, body, role, { attempts: queue === 'background' ? 5 : 2 }),
    queue,
  );
  const message = payload && payload.choices && payload.choices[0] && payload.choices[0].message;
  if (!message) return null;

  const finish = (payload.choices[0] || {}).finish_reason;
  const call = (message.tool_calls || []).find((c) => c.function && c.function.name === schemaName)
    || (message.tool_calls || [])[0];
  if (call && call.function && call.function.arguments) {
    try {
      return { data: JSON.parse(call.function.arguments), usage: usageOf(payload), model };
    } catch {
      // Almost always the token cap cutting the arguments mid-string. Silence
      // here reads as "the model had nothing to say", which is the wrong
      // diagnosis and the hardest kind to find.
      console.warn(`ai: ${model} returned unparseable ${schemaName} arguments`
        + `${finish === 'length' ? ' — output hit max_completion_tokens, raise maxTokens for this call' : ''}`
        + ` (${call.function.arguments.length} chars)`);
      return null;
    }
  }
  if (finish === 'length') {
    console.warn(`ai: ${model} hit max_completion_tokens before calling ${schemaName}; raise maxTokens for this call`);
  }

  // Some models answer with the JSON in the message instead of calling the
  // tool. Accept that rather than throwing the work away.
  const text = String(message.content || '').trim();
  const json = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
  if (!json.startsWith('{')) return null;
  try {
    return { data: JSON.parse(json), usage: usageOf(payload), model };
  } catch {
    return null;
  }
}

/**
 * One plain-text exchange.
 *
 * `lane` moves the call off the chat queue. Everything that talks to a learner
 * mid-conversation uses `interactive` — that is the default — and the lane is a
 * promise chain, so a call that takes minutes would hold every coach turn behind
 * it for those minutes. Long authoring that nobody is waiting on passes
 * `'background'` instead, which spaces calls and, more to the point, keeps them
 * out of the conversation's way.
 */
async function chat({ role, system, messages, maxTokens = 1024, lane }) {
  const model = modelFor(role);
  const body = {
    messages: messagesFor(system, messages),
    max_completion_tokens: maxTokens,
    thinking: thinkingFor(role),
  };
  const payload = await queued(
    () => callWithRetries(model, body, role, { attempts: lane === 'background' ? 5 : 2 }),
    lane || 'interactive',
  );
  const message = payload && payload.choices && payload.choices[0] && payload.choices[0].message;
  const text = message ? String(message.content || '').trim() : '';
  return text ? { text, usage: usageOf(payload), model } : null;
}

/** The same exchange, streamed, so the coach starts appearing immediately. */
async function chatStream({ role, system, messages, maxTokens = 1024, onDelta }) {
  const model = modelFor(role);
  const body = {
    model,
    messages: messagesFor(system, messages),
    max_completion_tokens: maxTokens,
    thinking: thinkingFor(role),
    stream: true,
  };

  return queued(async () => {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      let detail = res.statusText;
      try { const e = await res.json(); detail = (e.error && e.error.message) || detail; } catch { /* keep */ }
      const err = new Error(`mimo ${res.status}: ${String(detail).slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let usage = null;

    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const json = line.slice(5).trim();
        if (!json || json === '[DONE]') continue;
        let payload;
        try { payload = JSON.parse(json); } catch { continue; }
        if (payload.usage) usage = usageOf(payload);
        const choice = payload.choices && payload.choices[0];
        const text = choice && choice.delta ? choice.delta.content : '';
        if (!text) continue;
        full += text;
        if (onDelta) onDelta(text, full);
      }
    }

    const trimmed = full.trim();
    return trimmed ? { text: trimmed, usage, model } : null;
  }, 'interactive');
}

/**
 * A structured answer, streamed. For long thinking work (the fact verifier reads
 * a block with thinking on): the token-plan endpoint drops a request that sends
 * nothing for about eight minutes, and a stream keeps sending while it thinks.
 * Same answer shape as `structured`.
 */
async function structuredStream({ role, system, user, schema, schemaName = 'submit', maxTokens = 4096, think }) {
  const model = modelFor(role);
  const body = {
    model,
    messages: messagesFor(system, [{ role: 'user', content: user }]),
    max_completion_tokens: maxTokens,
    thinking: think === false ? { type: 'disabled' } : thinkingFor(role),
    tools: [{ type: 'function', function: { name: schemaName, description: 'Submit the result. Call this exactly once.', parameters: schema } }],
    tool_choice: 'auto',
    stream: true,
  };
  return queued(async () => {
    const res = await fetch(`${BASE_URL}/chat/completions`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok || !res.body) {
      let detail = res.statusText;
      try { const e = await res.json(); detail = (e.error && e.error.message) || detail; } catch { /* keep */ }
      const err = new Error(`mimo ${res.status}: ${String(detail).slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const args = [];
    let usage = null;
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const json = line.slice(5).trim();
        if (!json || json === '[DONE]') continue;
        let payload;
        try { payload = JSON.parse(json); } catch { continue; }
        if (payload.usage) usage = usageOf(payload);
        const delta = payload.choices && payload.choices[0] && payload.choices[0].delta;
        if (!delta) continue;
        if (delta.content) content += delta.content;
        for (const tc of delta.tool_calls || []) {
          const i = tc.index || 0;
          args[i] = (args[i] || '') + ((tc.function && tc.function.arguments) || '');
        }
      }
    }
    const raw = args.find(Boolean) || content.replace(/^```(json)?|```$/g, '').trim();
    if (!raw) return null;
    try {
      return { data: JSON.parse(raw), usage, model };
    } catch {
      // An answer in prose around the JSON: the outermost object, if it reads.
      const from = raw.indexOf('{');
      const to = raw.lastIndexOf('}');
      if (from !== -1 && to > from) {
        try { return { data: JSON.parse(raw.slice(from, to + 1)), usage, model }; } catch { /* fall through */ }
      }
      console.warn(`ai: ${model} streamed unparseable ${schemaName} arguments (${raw.length} chars)`);
      return null;
    }
  }, 'parallel');
}

/** Dollars per million tokens, for the per-user daily ceiling. */
const PRICES = {
  'mimo-v2.6-pro': { input: 0.435, output: 0.87, cacheRead: 0.0435 },
  'mimo-v2.6-pro-ultraspeed': { input: 0.435, output: 0.87, cacheRead: 0.0435 },
  'mimo-v2.6-flash': { input: 0.14, output: 0.28, cacheRead: 0.014 },
};

function costCents(model, usage) {
  if (!usage) return 0;
  const p = PRICES[model] || PRICES['mimo-v2.6-flash'];
  return 100 * (
    ((usage.input_tokens || 0) * p.input
      + (usage.cache_read_input_tokens || 0) * p.cacheRead
      + (usage.output_tokens || 0) * p.output) / 1e6
  );
}

/** The models this key can reach. Used by `npm run ai:models`. */
async function listModels() {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers() });
  if (!res.ok) throw new Error(`mimo ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return (data.data || []).map((m) => ({
    id: m.id,
    display: m.owned_by || '',
    methods: ['generateContent'],
  }));
}

module.exports = {
  name: 'mimo',
  isEnabled,
  isConfigured,
  status,
  modelFor,
  structured,
  chat,
  chatStream,
  structuredStream,
  costCents,
  listModels,
  quotaKind,
  markExhausted,
  isExhausted,
  PRICES,
};
