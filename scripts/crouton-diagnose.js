#!/usr/bin/env node
/**
 * Crouton Alpha diagnosis (5 Nov 2026): a handful of direct calls to see WHY the fact-verifier eval got 0 of 60 answers.
 * Free model, so $0; each call counts on the 950/day counter. No keys printed.
 *   node scripts/crouton-diagnose.js
 */
const fs = require('fs');
try { require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' }); } catch { /* env */ }
const key = process.env.OPENROUTER_API_KEY;
const base = 'https://openrouter.ai/api/v1';
const out = [];
async function call(label, body) {
  const t = Date.now();
  try {
    const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model: 'stealth/crouton-alpha', ...body }), signal: AbortSignal.timeout(90000) });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch { /* not json */ }
    const c = j && j.choices && j.choices[0];
    out.push({ label, status: r.status, ms: Date.now() - t, error: j && j.error ? { code: j.error.code, message: String(j.error.message).slice(0, 200) } : null, finish: c && c.finish_reason, content: c && c.message ? String(c.message.content || '').slice(0, 120) : null, has_tool_calls: !!(c && c.message && c.message.tool_calls), usage: j && j.usage, raw_head: j ? undefined : txt.slice(0, 160), headers: { ratelimit_remaining: r.headers.get('x-ratelimit-remaining'), retry_after: r.headers.get('retry-after') } });
  } catch (e) { out.push({ label, error: String(e.message).slice(0, 160), ms: Date.now() - t }); }
}
(async () => {
  if (!key) { console.log('no OPENROUTER_API_KEY'); return; }
  const ct = require('../services/crouton-ledger');
  const msgs = [{ role: 'user', content: 'Reply with the single word OK.' }];
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
  await call('plain chat', { messages: msgs, max_tokens: 20 });
  await call('json_object', { messages: [{ role: 'user', content: 'Return {"ok":true} as JSON.' }], max_tokens: 40, response_format: { type: 'json_object' } });
  await call('tools (what the eval path sends)', { messages: [{ role: 'user', content: 'Call submit with ok=true.' }], max_tokens: 100, tools: [{ type: 'function', function: { name: 'submit', description: 'Submit.', parameters: schema } }], tool_choice: 'auto' });
  await call('provider path, 12000 max_tokens', { messages: msgs, max_tokens: 12000 });
  await call('plain chat again', { messages: msgs, max_tokens: 20 });
  const rows = out;
  fs.writeFileSync('docs/crouton-diagnosis.json', JSON.stringify({ at: new Date().toISOString(), calls: rows }, null, 1));
  console.log(JSON.stringify(rows.map(({ headers, ...r }) => r), null, 1));
  void ct;
})();
