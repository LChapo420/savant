#!/usr/bin/env node
/**
 * A local stand-in for every OpenAI-compatible model API, for load and failure tests. Nothing leaves this PC.
 *
 *   node scripts/beta-load/stub-models.js --port 7801 --latency 1500 --jitter 2500
 *
 * It reads the JSON schema out of the request (a tool's parameters, or the "matching this JSON schema" text the credit providers
 * put in the system message) and answers with a value that fits it, so the app's parsers run for real. Usage figures are estimated
 * from the real prompt length, so the ledgers settle as they would.
 *
 * Control: POST /__stub { mode: 'ok'|'down'|'slow'|'429', latencyMs, jitterMs, down: ['nvidia', ...] } changes behaviour live;
 * GET /__stub/stats gives calls and tokens per provider key. The provider is told apart by the bearer key, which the harness sets
 * to stub-<name>.
 */
const http = require('http');

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt; };
const PORT = Number(arg('port', 7801));
const state = { mode: arg('mode', 'ok'), latencyMs: Number(arg('latency', 1500)), jitterMs: Number(arg('jitter', 2500)), down: [] };
const stats = { calls: 0, byProvider: {}, inflight: 0, maxInflight: 0 };

function valueOf(schema, depth = 0, name = '') {
  if (!schema || depth > 8) return null;
  if (schema.enum) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  if (type === 'object' || schema.properties) {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties || {})) out[k] = valueOf(v, depth + 1, k);
    return out;
  }
  if (type === 'array') {
    const n = Math.max(schema.minItems || 0, Math.min(schema.maxItems || 3, 3));
    return Array.from({ length: n }, (_, i) => valueOf(schema.items || { type: 'string' }, depth + 1, `${name}${i}`));
  }
  if (type === 'number' || type === 'integer') return schema.minimum !== undefined ? schema.minimum : 1;
  if (type === 'boolean') return true;
  const min = schema.minLength || 0;
  const text = `Stub text for ${name || 'field'}: this sentence stands in for what a model would write here, nothing more.`;
  return text.length >= min ? text : text.repeat(Math.ceil(min / text.length));
}

function schemaFrom(body) {
  const tool = body.tools && body.tools[0] && body.tools[0].function;
  if (tool && tool.parameters) return { schema: tool.parameters, tool: tool.name };
  const sys = (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
  const at = sys.indexOf('matching this JSON schema');
  if (at >= 0) {
    const nl = sys.indexOf('\n', at);
    const start = sys.indexOf('{', nl);
    if (start >= 0) {
      let depth = 0; let inS = false; let esc = false;
      for (let i = start; i < sys.length; i++) {
        const c = sys[i];
        if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; }
        if (c === '"') inS = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (!depth) { try { return { schema: JSON.parse(sys.slice(start, i + 1)) }; } catch { return null; } } }
      }
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/__stub/stats') return reply(200, { ...stats, state });
    if (req.url === '/__stub') { try { Object.assign(state, JSON.parse(raw.toString() || '{}')); } catch { /* keep */ } return reply(200, state); }
    const who = String(req.headers.authorization || '').replace(/^Bearer\s+stub-/, '') || 'unknown';
    const row = stats.byProvider[who] || (stats.byProvider[who] = { calls: 0, in: 0, out: 0, failed: 0, models: {} });
    row.calls++; stats.calls++;
    if (/\/models\b/.test(req.url) && req.method === 'GET') return reply(200, { data: [] });
    let body = {};
    try { body = JSON.parse(raw.toString() || '{}'); } catch { /* empty */ }
    row.models[body.model || '?'] = (row.models[body.model || '?'] || 0) + 1;
    if (state.mode === 'down' || state.down.includes(who)) { row.failed++; return reply(503, { error: { message: 'stub: down' } }); }
    if (state.mode === '429') { row.failed++; return reply(429, { error: { message: 'stub: rate limited' } }); }
    stats.inflight++; stats.maxInflight = Math.max(stats.maxInflight, stats.inflight);
    const wait = state.mode === 'slow' ? 200000 : state.latencyMs + Math.random() * state.jitterMs;
    let done = false;
    const t = setTimeout(() => {
      done = true; stats.inflight--;
      const inChars = (body.messages || []).reduce((n, m) => n + JSON.stringify(m.content || '').length, 0);
      const found = schemaFrom(body);
      const text = found ? JSON.stringify(valueOf(found.schema)) : 'A short stub reply from the local model stand-in. Think about what the question asks, then try the first step yourself.';
      const prompt = Math.ceil(inChars / 4);
      const completion = Math.max(Math.ceil(text.length / 4), Math.min(Math.round((body.max_tokens || 800) * 0.3), 1500));
      row.in += prompt; row.out += completion;
      const message = found && found.tool
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: found.tool, arguments: text } }] }
        : { role: 'assistant', content: text };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: prompt, completion_tokens: completion } })}\n\n`);
        res.end('data: [DONE]\n\n');
        return;
      }
      reply(200, { id: 'stub', model: body.model, choices: [{ index: 0, finish_reason: found && found.tool ? 'tool_calls' : 'stop', message }], usage: { prompt_tokens: prompt, completion_tokens: completion } });
    }, wait);
    res.on('close', () => { if (!done) { done = true; clearTimeout(t); stats.inflight--; } });
  });
});
server.keepAliveTimeout = 60000;
server.listen(PORT, '127.0.0.1', () => console.log(`stub models on ${PORT}`));
