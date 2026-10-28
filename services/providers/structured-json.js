/**
 * Reading structured output from an OpenAI-compatible model, and repairing it.
 *
 * Open-weight models hosted behind OpenAI-compatible endpoints (NVIDIA build here)
 * return JSON in more than one way: as a tool call's arguments, as plain content,
 * fenced in ```json, behind a <think> block, or cut off by the token cap. This
 * file turns any of those into a value that matches the caller's JSON schema, or
 * says exactly why it cannot, so the provider can ask the model once more with the
 * reasons (a repair turn) rather than guessing.
 *
 *   parseStructured(message, schemaName)  -> { data, raw } | { error, raw }
 *   validate(schema, value)               -> { value, errors }  (coerces and prunes)
 *
 * No dependencies; the schema subset handled is the one this app writes: type,
 * properties, required, items, enum, additionalProperties.
 */

/** Drop a model's visible thinking: `<think>...</think>`, and an unclosed one at the start. */
function stripThinking(text) {
  let out = String(text == null ? '' : text);
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // A reply that opens a think block and never closes it has no answer after it.
  if (/^\s*<think>/i.test(out)) out = '';
  // Some templates emit only the closing tag (the opening one is in the prompt).
  const close = out.search(/<\/think>/i);
  if (close !== -1) out = out.slice(close + '</think>'.length);
  return out.trim();
}

/** The first balanced JSON object or array in a string, or null. */
function extractJson(text) {
  const s = String(text || '').replace(/^\s*```(?:json|JSON)?\s*/, '').replace(/\s*```\s*$/, '');
  const start = s.search(/[{[]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open || c === (open === '{' ? '[' : '{')) depth++;
    else if (c === close || c === (close === '}' ? ']' : '}')) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  // Unbalanced: most likely cut off by the token cap. Hand back the tail so the
  // repair below can try to close it.
  return s.slice(start);
}

/** Close what a truncated JSON string left open: a string, then arrays and objects. */
function closeTruncated(s) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const c of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if ((c === '}' || c === ']') && stack.length) stack.pop();
  }
  let out = s;
  if (inString) out += '"';
  out = out.replace(/,\s*$/, '').replace(/:\s*$/, ': null');
  while (stack.length) out += stack.pop();
  return out;
}

/** JSON.parse, then progressively more forgiving repairs. Returns { value } or { error }. */
function parseLoose(text) {
  const candidates = [];
  const base = String(text || '').trim();
  if (!base) return { error: 'empty output' };
  candidates.push(base);
  const cleaned = base.replace(/,\s*([}\]])/g, '$1');
  candidates.push(cleaned);
  candidates.push(closeTruncated(cleaned));
  // Python literals and curly quotes, only where a value starts (never inside a string).
  const pythonic = cleaned
    .replace(/([:[,]\s*)[“”]/g, '$1"').replace(/[“”](\s*[:,\]}])/g, '"$1')
    .replace(/([:[,]\s*)True\b/g, '$1true').replace(/([:[,]\s*)False\b/g, '$1false').replace(/([:[,]\s*)None\b/g, '$1null');
  candidates.push(pythonic);
  candidates.push(closeTruncated(pythonic));
  for (const c of candidates) {
    try { return { value: JSON.parse(c) }; } catch { /* next */ }
  }
  return { error: 'output is not valid JSON' };
}

/**
 * GLM sometimes leaks its own tool-call markup into an argument: the next
 * argument arrives inside the previous one's string, as
 * `...]<arg_key>checks</arg_key><arg_value>[...]`. Split those back out.
 * (Same repair as services/providers/openrouter.js, kept here so this file has
 * no dependency on a provider the lineup no longer uses.)
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
      if (!k || out[k] !== undefined) continue;
      const parsed = parseLoose(m[2].trim());
      out[k] = parsed.value !== undefined ? parsed.value : m[2].trim();
    }
  }
  return out;
}

/**
 * The structured answer in one chat completion message: the named tool call's
 * arguments, else any tool call, else JSON in the content.
 */
function parseStructured(message, schemaName) {
  if (!message) return { error: 'no message', raw: '' };
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const call = calls.find((c) => c.function && c.function.name === schemaName) || calls[0];
  if (call && call.function && call.function.arguments != null) {
    const args = call.function.arguments;
    if (typeof args === 'object') return { data: splitLeakedArgs(args), raw: JSON.stringify(args) };
    const parsed = parseLoose(stripThinking(args));
    if (parsed.value !== undefined) return { data: splitLeakedArgs(parsed.value), raw: String(args) };
    return { error: `tool arguments: ${parsed.error}`, raw: String(args) };
  }
  const content = stripThinking(message.content);
  const json = extractJson(content);
  if (!json) return { error: content ? 'no JSON object in the reply' : 'empty reply', raw: content };
  const parsed = parseLoose(json);
  if (parsed.value === undefined) return { error: parsed.error, raw: content };
  // A model that wraps its answer in {"name": ..., "arguments": {...}} (a tool call
  // written as text) is unwrapped.
  let value = parsed.value;
  if (value && typeof value === 'object' && !Array.isArray(value) && value.arguments && typeof value.arguments === 'object'
    && (value.name === schemaName || Object.keys(value).length <= 2)) value = value.arguments;
  return { data: splitLeakedArgs(value), raw: content };
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * Check a value against a schema, coercing what is safely coercible ("3" for a
 * number, "true" for a boolean, an array sent as a JSON string, a number for a
 * string) and pruning properties a closed object does not allow. Returns the
 * cleaned value and every remaining error with its path.
 */
function validate(schema, value, at = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return { value, errors };
  let v = value;
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const want = types.filter((t) => t !== 'null');
  if (v === null && types.includes('null')) return { value: v, errors };
  if (v === undefined) return { value: v, errors: [`${at}: missing`] };

  if (want.length === 1) {
    const t = want[0];
    if ((t === 'number' || t === 'integer') && typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) v = Number(v);
    if (t === 'integer' && typeof v === 'number' && !Number.isInteger(v) && Math.abs(v - Math.round(v)) < 1e-9) v = Math.round(v);
    if (t === 'boolean' && typeof v === 'string' && /^(true|false)$/i.test(v.trim())) v = /^true$/i.test(v.trim());
    if (t === 'string' && (typeof v === 'number' || typeof v === 'boolean')) v = String(v);
    if ((t === 'array' || t === 'object') && typeof v === 'string') {
      const parsed = parseLoose(v);
      if (parsed.value !== undefined && typeOf(parsed.value) === t) v = parsed.value;
    }
    if (t === 'array' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
      // An array of one sent as the bare item.
      if (schema.items && (schema.items.type === 'object')) v = [v];
    }
  }

  if (want.length) {
    const actual = typeOf(v);
    const ok = want.some((t) => (t === 'integer' ? actual === 'number' && Number.isInteger(v)
      : t === 'number' ? actual === 'number' && Number.isFinite(v) : actual === t));
    if (!ok) return { value: v, errors: [`${at}: expected ${want.join('|')}, got ${actual}`] };
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(v)) {
    // Case and spacing slips on an enum are corrected when exactly one option matches.
    const match = typeof v === 'string' ? schema.enum.filter((e) => String(e).toLowerCase() === v.trim().toLowerCase()) : [];
    if (match.length === 1) v = match[0];
    else errors.push(`${at}: ${JSON.stringify(v)} is not one of ${JSON.stringify(schema.enum).slice(0, 200)}`);
  }

  if (typeOf(v) === 'object') {
    const props = schema.properties || {};
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (props[k]) {
        const r = validate(props[k], val, `${at}.${k}`);
        out[k] = r.value;
        errors.push(...r.errors);
      } else if (schema.additionalProperties !== false) {
        out[k] = val;
      }
      // additionalProperties: false — an extra key is dropped, not an error.
    }
    for (const k of schema.required || []) {
      if (out[k] === undefined) errors.push(`${at}.${k}: required`);
    }
    v = out;
  } else if (Array.isArray(v) && schema.items) {
    v = v.map((item, i) => {
      const r = validate(schema.items, item, `${at}[${i}]`);
      errors.push(...r.errors);
      return r.value;
    });
  }
  return { value: v, errors };
}

module.exports = { stripThinking, extractJson, parseLoose, closeTruncated, splitLeakedArgs, parseStructured, validate };
