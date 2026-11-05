#!/usr/bin/env node
/**
 * Per-process run cap (services/run-cap.js) across the paid ledgers. No network, no key, no spend: throwaway ledger files.
 *   node scripts/run-cap-test.js
 * Proves: refusal at the line (RUN_CAP_USD), totals across ledgers, per-provider caps, settlement lowers the count,
 * the refusal is a LEDGER_STOP/402 like the global cap, no effect when unset, scripts' defaultCap (flag / env / default).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-cap-test-'));
const names = { munito: 'MUNITO', coral: 'CORAL', 'standard-compute': 'STANDARD_COMPUTE', anthropic: 'ANTHROPIC', gladia: 'GLADIA', lyceum: 'LYCEUM', gonka: 'GONKA', grokified: 'GROKIFIED' };
for (const [k, v] of Object.entries(names)) process.env[`${v}_LEDGER_FILE`] = path.join(tmp, `${k}.json`);
for (const k of ['RUN_CAP_USD', ...Object.values(names).map((v) => `RUN_CAP_${v}_USD`)]) delete process.env[k];

const runCap = require('../services/run-cap');
const L = {
  munito: require('../services/munito-ledger'), coral: require('../services/coral-ledger'),
  sc: require('../services/standard-compute-ledger'), anthropic: require('../services/anthropic-ledger'),
  gladia: require('../services/gladia-ledger'), lyceum: require('../services/lyceum-ledger'),
};
const refuses = (fn) => { try { fn(); } catch (e) { return e; } return null; };

// 1. Unset: no effect.
for (const l of Object.values(L)) { const id = l.reserve({ usd: 0.5, task: 't', model: 'm' }); l.settle(id, { usd: 0.1 }); }
assert.ok(runCap.summary().total_usd > 0, 'tracked even when unset');
runCap.reset();

// 2. Total cap across ledgers, refusal at the line.
process.env.RUN_CAP_USD = '1';
const a = L.munito.reserve({ usd: 0.4, task: 't', model: 'm' });
const b = L.lyceum.reserve({ usd: 0.4, task: 't', model: 'm' });
let e = refuses(() => L.coral.reserve({ usd: 0.3, task: 't', model: 'm' }));
assert.ok(e && e.code === 'LEDGER_STOP' && e.status === 402 && /RUN_CAP_USD/.test(e.message), 'refused across ledgers');
const ok = L.coral.reserve({ usd: 0.2, task: 't', model: 'm' }); // exactly at the line: 1.0
assert.ok(ok);
e = refuses(() => L.anthropic.reserve({ usd: 0.01, task: 't', model: 'm' }));
assert.ok(e && e.runCap, 'anything past the line is refused');
assert.strictEqual(L.coral.status().refused_calls, 0, 'a run-cap refusal leaves no ledger reservation');

// 3. Settling at a lower real cost frees headroom; settled spend still counts.
L.munito.settle(a, { usd: 0.05 });
assert.ok(Math.abs(runCap.summary().total_usd - (0.05 + 0.4 + 0.2)) < 1e-9);
assert.ok(L.anthropic.reserve({ usd: 0.3, task: 't', model: 'm' }));
assert.ok(refuses(() => L.gladia.reserve({ usd: 0.1, task: 't', model: 'm' })), 'settled + open still counts');
L.lyceum.settle(b, { outcome: 'not_billed' });
assert.ok(L.gladia.reserve({ usd: 0.1, task: 't', model: 'm' }), 'not_billed frees its reservation');

// 4. Per-provider cap.
runCap.reset(); delete process.env.RUN_CAP_USD;
process.env.RUN_CAP_LYCEUM_USD = '0.5';
L.lyceum.reserve({ usd: 0.3, task: 't', model: 'm' });
e = refuses(() => L.lyceum.reserve({ usd: 0.3, task: 't', model: 'm' }));
assert.ok(e && /RUN_CAP_LYCEUM_USD/.test(e.message), 'per-provider cap refuses');
assert.ok(L.munito.reserve({ usd: 5, task: 't', model: 'm' }), 'other providers unaffected');
process.env.RUN_CAP_STANDARD_COMPUTE_USD = '0.1';
assert.ok(refuses(() => L.sc.reserve({ usd: 0.2, task: 't', model: 'm' })), 'underscore provider name');
delete process.env.RUN_CAP_LYCEUM_USD; delete process.env.RUN_CAP_STANDARD_COMPUTE_USD;

// 5. The ledger's own cap still applies on top (the run cap never raises it).
runCap.reset(); process.env.RUN_CAP_USD = '1000';
assert.ok(refuses(() => L.gladia.reserve({ usd: 51, task: 't', model: 'm' })), 'global cap still wins');
delete process.env.RUN_CAP_USD; runCap.reset();

// 6. Script defaults: flag > env > default.
delete process.env.RUN_CAP_USD;
assert.strictEqual(runCap.defaultCap(5, ['node', 's.js']), 5);
assert.strictEqual(runCap.defaultCap(7, ['node', 's.js']), 5, 'existing env wins over the default');
assert.strictEqual(runCap.defaultCap(5, ['node', 's.js', '--run-cap', '2.5']), 2.5, 'flag wins');
delete process.env.RUN_CAP_USD;

console.log('run-cap-test: OK');
