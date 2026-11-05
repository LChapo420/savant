/**
 * Hard per-PROCESS spend cap across every paid ledger (owner, 2026-11-04: build agents overran their budgets twice).
 *
 *   RUN_CAP_USD              total across all ledgers in this process (reserved + settled)
 *   RUN_CAP_<PROVIDER>_USD   optional per-provider cap, e.g. RUN_CAP_LYCEUM_USD, RUN_CAP_ANTHROPIC_USD, RUN_CAP_STANDARD_COMPUTE_USD
 *
 * Both unset (the app server's default) = no effect at all. Each ledger calls check() right before it writes a reservation
 * and refuses with the same LEDGER_STOP / 402 error as the global cap; hold() records the reservation, settle() replaces
 * it with the real cost. Settled spend is counted too, so the cap is on money committed by this process, not on one call.
 * The env is read on every call, so a script can set it after requiring the ledgers.
 */
const held = new Map();   // `${provider}:${id}` -> { provider, usd }
const settledBy = {};     // provider -> usd settled in this process

const envName = (provider) => `RUN_CAP_${String(provider).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_USD`;
function readCap(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function committed(provider = null) {
  let sum = 0;
  for (const [p, v] of Object.entries(settledBy)) if (!provider || p === provider) sum += v;
  for (const h of held.values()) if (!provider || h.provider === provider) sum += h.usd;
  return sum;
}

/** Throws LEDGER_STOP (402) if `usd` more from `provider` would cross the process-wide or the provider's run cap. */
function check(provider, usd) {
  const amount = Math.max(0, Number(usd) || 0);
  const total = readCap('RUN_CAP_USD');
  if (total !== null && committed() + amount > total + 1e-9) {
    throw Object.assign(new Error(`${provider} ledger: refused by the run cap (this process has committed $${committed().toFixed(4)} + this call up to $${amount.toFixed(4)} would pass RUN_CAP_USD $${total.toFixed(2)})`), { code: 'LEDGER_STOP', status: 402, runCap: true });
  }
  const per = readCap(envName(provider));
  if (per !== null && committed(provider) + amount > per + 1e-9) {
    throw Object.assign(new Error(`${provider} ledger: refused by the run cap (this process has committed $${committed(provider).toFixed(4)} on ${provider} + this call up to $${amount.toFixed(4)} would pass ${envName(provider)} $${per.toFixed(2)})`), { code: 'LEDGER_STOP', status: 402, runCap: true });
  }
}

function hold(provider, id, usd) { held.set(`${provider}:${id}`, { provider, usd: Math.max(0, Number(usd) || 0) }); }

function settle(provider, id, usd) {
  const key = `${provider}:${id}`;
  if (!held.has(key)) return;
  held.delete(key);
  settledBy[provider] = (settledBy[provider] || 0) + Math.max(0, Number(usd) || 0);
}

/** Spend committed in this process, per provider and total (for script reports). */
function summary() {
  const by = {};
  for (const p of new Set([...Object.keys(settledBy), ...[...held.values()].map((h) => h.provider)])) by[p] = Number(committed(p).toFixed(6));
  return { total_usd: Number(committed().toFixed(6)), by_provider: by };
}

function reset() { held.clear(); for (const k of Object.keys(settledBy)) delete settledBy[k]; }

/** For scripts: set a default RUN_CAP_USD (a --run-cap flag or an existing env wins). Returns the cap in force. */
function defaultCap(usd, argv = process.argv) {
  const i = argv.indexOf('--run-cap');
  if (i >= 0 && argv[i + 1] !== undefined && Number.isFinite(Number(argv[i + 1]))) process.env.RUN_CAP_USD = String(Number(argv[i + 1]));
  else if (process.env.RUN_CAP_USD === undefined || process.env.RUN_CAP_USD === '') process.env.RUN_CAP_USD = String(usd);
  return Number(process.env.RUN_CAP_USD);
}

module.exports = { check, hold, settle, summary, reset, defaultCap, committed };
