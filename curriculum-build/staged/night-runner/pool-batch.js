/**
 * The night runner's door to the model pool (services/pool.js). BUILD PIPELINE ONLY: every request
 * here is dataClass "pipeline" with no user id, so xKiro, UnoRouter, Standard Compute and the app
 * chain's learner-class slots may all serve it, as config/model-lineup.json "pool.tasks" allows per task.
 *
 *   write(args)   one write with the shape of core.write(): { data, model, family, usage, ... }.
 *                 core.write() calls it when NIGHT_POOL=1 (default off: the runner's own lanes in
 *                 core.js are unchanged). callHedged: best free slot first, a hedge after its p90, a hard timeout.
 *   batch(items, opts)   pool.runBatch for a bulk step: one shared queue, work stealing, tail hedging,
 *                 paid slots only when opts.deadlineMs/targetMinutes cannot be met by the free slots.
 *
 * Writer / judge independence: pass excludeFamilies (e.g. the writer's family) and no slot of that
 * family serves the request. Paid spend: none unless NIGHT_POOL_PAID_USD > 0 (a per-process cap for
 * callHedged hedges); a batch passes its own opts.budgetUsd. Standard Compute is capped at $15 TOTAL by
 * its ledger whatever is passed here.
 *
 *   node curriculum-build/staged/night-runner/pool-batch.js --status     slots and whether each is enabled
 */
const path = require('path');
const { ROOT, loadKeys } = require('./env');

let ready = false;
function setup() {
  if (ready) return;
  ready = true;
  loadKeys(['NVIDIA_API_KEY', 'NVIDIA_BASE_URL', 'XKIRO_API_KEY', 'XKIRO_BASE_URL', 'UNOROUTER_API_KEY', 'UNOROUTER_BASE_URL', 'STANDARD_COMPUTE_API_KEY', 'STANDARD_COMPUTE_BASE_URL', 'OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL']);
  process.env.XKIRO_PIPELINE = '1';
  process.env.UNOROUTER_PIPELINE = '1';
  process.env.STANDARD_COMPUTE_PIPELINE = '1';
}
const pool = () => { setup(); return require(path.join(ROOT, 'services', 'pool.js')); }; // eslint-disable-line global-require
const spentPaid = { usd: 0 };

function request({ system, user, schema, schemaName, maxTokens, task, role, excludeFamilies }) {
  return { kind: 'structured', role: role || 'blocks', task: task || 'night_write', dataClass: 'pipeline', system, user, schema, schemaName: schemaName || 'submit', maxTokens: maxTokens || 6000, excludeFamilies: excludeFamilies || undefined };
}

/** One hedged write. Resolves like core.write(): { data, model, family, usage, slot } or null. */
async function write({ system, user, schema, schemaName, maxTokens, task, role, excludeFamilies, validate }) {
  const p = pool();
  const paidCap = Number(process.env.NIGHT_POOL_PAID_USD || 0);
  const allowPaid = paidCap > 0 && spentPaid.usd < paidCap;
  const res = await p.callHedged(request({ system, user, schema, schemaName, maxTokens, task, role, excludeFamilies }), {
    validate: validate || ((r) => !!(r && r.data)), allowPaid, budgetUsd: allowPaid ? paidCap - spentPaid.usd : 0,
  });
  if (!res) return null;
  if (res.pool && res.pool.costUsd) spentPaid.usd += res.pool.costUsd;
  return { data: res.data, model: res.model, family: p.familyOfModel(res.model) || (res.pool && res.pool.provider) || null, usage: res.usage || null, slot: res.pool && res.pool.slot, at: new Date().toISOString(), lane: 'pool' };
}

/** A bulk step: items [{ id, system, user, schema, schemaName, maxTokens, validate? }]. Returns pool.runBatch's { results, report }. */
function batch(items, opts = {}) {
  const p = pool();
  const list = items.map((it) => ({ id: it.id, req: request({ ...it, task: it.task || opts.task, excludeFamilies: it.excludeFamilies || opts.excludeFamilies }), validate: it.validate || opts.validate || ((r) => !!(r && r.data)) }));
  return p.runBatch(list, { task: opts.task || 'night_write', role: opts.role || 'blocks', dataClass: 'pipeline', ...opts });
}

module.exports = { write, batch, setup, pool };

if (require.main === module) {
  const p = pool();
  const req = request({ system: 's', user: 'u', schema: {} });
  console.log(`${'slot'.padEnd(64)} paid  enabled  conc  rpm`);
  for (const s of p.candidatesFor(req)) console.log(`${s.id.padEnd(64)} ${s.paid ? 'yes ' : 'no  '}  ${String(s.isEnabled()).padEnd(7)}  ${String(s.maxConcurrent).padEnd(4)}  ${s.rpm || '-'}`);
}
