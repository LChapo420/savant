/**
 * Checking a block's content against the block's own schema.
 *
 * Every block in the library ships a JSON schema describing the data its
 * renderer reads (public/engine/registry.json). The fill-out call writes that
 * data, and nothing the model writes reaches a page until it has been checked
 * here. A block handed null renders its built-in sample instead, so a payload
 * that fails is never passed through "to see what happens": it is repaired,
 * or the block is dropped from the plan.
 *
 * Only the keywords the library actually uses are implemented — type,
 * properties, required, items, min/maxItems, enum, minimum/maximum, minLength,
 * pattern, additionalProperties and local $ref — which keeps this small enough
 * to read and avoids a dependency for a few hundred lines of schema.
 */

/** The JSON-schema type of a value. Integers are numbers that are also integers. */
function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value, type) {
  if (!type) return true;
  const types = Array.isArray(type) ? type : [type];
  const actual = typeOf(value);
  return types.some((t) => t === actual
    || (t === 'integer' && actual === 'number' && Number.isInteger(value))
    || (t === 'number' && actual === 'number'));
}

/** Follow a local `#/definitions/x` reference; anything else is left alone. */
function resolveRef(schema, root) {
  if (!schema || typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/')) return schema;
  let at = root;
  for (const part of schema.$ref.slice(2).split('/')) {
    at = at && at[part];
  }
  return at || {};
}

/**
 * Problems with `data` against `schema`, as short readable strings.
 *
 * @param {object} schema
 * @param {*} data
 * @param {object} [opts] { max: stop after this many problems }
 * @returns {string[]} empty when the data is good
 */
function validate(schema, data, opts = {}) {
  const max = opts.max || 12;
  const problems = [];
  const root = schema;

  function walk(s, value, where, depth) {
    if (problems.length >= max || depth > 12) return;
    const node = resolveRef(s, root);
    if (!node || typeof node !== 'object') return;

    if (node.type && !matchesType(value, node.type)) {
      problems.push(`${where || 'data'}: expected ${[].concat(node.type).join(' or ')}, got ${typeOf(value)}`);
      return;
    }
    if (Array.isArray(node.enum) && !node.enum.some((e) => e === value)) {
      problems.push(`${where || 'data'}: "${String(value).slice(0, 40)}" is not one of ${node.enum.slice(0, 8).join(', ')}`);
      return;
    }
    if (typeof value === 'string') {
      if (Number.isInteger(node.minLength) && value.length < node.minLength) {
        problems.push(`${where}: shorter than ${node.minLength} characters`);
      }
      if (typeof node.pattern === 'string') {
        try {
          if (!new RegExp(node.pattern).test(value)) problems.push(`${where}: does not match ${node.pattern}`);
        } catch { /* a pattern this engine cannot compile is not the payload's fault */ }
      }
    }
    if (typeof value === 'number') {
      if (typeof node.minimum === 'number' && value < node.minimum) problems.push(`${where}: below ${node.minimum}`);
      if (typeof node.maximum === 'number' && value > node.maximum) problems.push(`${where}: above ${node.maximum}`);
    }
    if (Array.isArray(value)) {
      if (Number.isInteger(node.minItems) && value.length < node.minItems) {
        problems.push(`${where}: ${value.length} items, needs at least ${node.minItems}`);
      }
      if (Number.isInteger(node.maxItems) && value.length > node.maxItems) {
        problems.push(`${where}: ${value.length} items, allows at most ${node.maxItems}`);
      }
      if (node.items) {
        value.forEach((v, i) => {
          const itemSchema = Array.isArray(node.items) ? node.items[i] : node.items;
          if (itemSchema) walk(itemSchema, v, `${where}[${i}]`, depth + 1);
        });
      }
    }
    if (typeOf(value) === 'object') {
      const props = node.properties || {};
      for (const key of node.required || []) {
        // A required key the schema never describes is a slip in the generated
        // schema (Game_EscapeRoom requires `clueRevealed` and defines nothing for
        // it, and its own sample leaves it out). The renderer copes; so does this.
        if (node.properties && !(key in props)) continue;
        const v = value[key];
        // Null where the field's own type allows null is a value, not a gap.
        if (v === null && props[key] && [].concat(resolveRef(props[key], root).type || []).includes('null')) continue;
        // A blank string is real content deep inside a payload (a space token, an
        // empty code line) but never at the top, where it is a heading or prompt
        // the model skipped.
        if (v === undefined || v === null || (depth === 0 && typeof v === 'string' && !v.trim())) {
          problems.push(`${where ? `${where}.` : ''}${key}: missing`);
        }
      }
      for (const [key, sub] of Object.entries(node.properties || {})) {
        if (value[key] !== undefined && value[key] !== null) walk(sub, value[key], where ? `${where}.${key}` : key, depth + 1);
      }
    }
  }

  walk(schema, data, '', 0);
  return problems;
}

/**
 * Drop keys a schema does not allow, in place, wherever it says
 * `additionalProperties: false`. A model adding a field the renderer never
 * reads is harmless on the page but noise in storage, and a strict renderer
 * may iterate keys.
 */
function prune(schema, data, root = schema, depth = 0) {
  const node = resolveRef(schema, root);
  if (!node || depth > 12 || data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    if (node.items && !Array.isArray(node.items)) data.forEach((v) => prune(node.items, v, root, depth + 1));
    return data;
  }
  const props = node.properties || {};
  if (node.additionalProperties === false) {
    for (const key of Object.keys(data)) if (!(key in props)) delete data[key];
  }
  for (const [key, sub] of Object.entries(props)) {
    if (data[key] !== undefined) prune(sub, data[key], root, depth + 1);
  }
  return data;
}

/**
 * The schema written for a prompt: the same constraints, minus what only
 * costs tokens. Titles and $ids repeat the tag the prompt already names, and
 * defaults and examples are things the renderer fills in by itself. The
 * descriptions stay — they are what tells the model what each field is for.
 */
function compact(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 14) return schema;
  if (Array.isArray(schema)) return schema.map((s) => compact(s, depth + 1));
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (['$id', '$schema', 'title', 'default', 'examples'].includes(key)) continue;
    if (key === 'description' && typeof value === 'string') {
      out.description = value.length > 220 ? `${value.slice(0, 217)}...` : value;
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compact(v, depth + 1)]));
      continue;
    }
    out[key] = (value && typeof value === 'object') ? compact(value, depth + 1) : value;
  }
  return out;
}

module.exports = { validate, prune, compact, typeOf };
