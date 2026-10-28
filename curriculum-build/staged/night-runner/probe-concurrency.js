// Measures how many MiniMax M3.1 Flash calls xKiro serves at once (tiny calls). Build pipeline only.
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
require('./env').loadKeys(['XKIRO_API_KEY', 'XKIRO_BASE_URL']);
process.env.XKIRO_PIPELINE = '1'; process.env.XKIRO_RETRIES = '0';
const { xkiro } = require(path.join(ROOT, 'services', 'providers', 'xkiro.js'));
const n = Number(process.argv[2] || 1);
(async () => {
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: n }, (_, i) => xkiro.chat({ messages: [{ role: 'user', content: `Reply with the single word OK. (${i})` }], maxTokens: 300, models: ['minimax/minimax-m3.1-flash'], timeoutMs: 120000 })
    .then((r) => ({ ok: true, ms: Date.now() - t0, text: String(r.text).slice(0, 20) })).catch((e) => ({ ok: false, ms: Date.now() - t0, err: String(e.message).slice(0, 120) }))));
  console.log(JSON.stringify({ n, ok: rs.filter((r) => r.ok).length, results: rs }));
})();
