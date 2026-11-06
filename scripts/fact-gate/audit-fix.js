#!/usr/bin/env node
/**
 * Step 5, fixes for review, and the gate's real price. Each level with confirmed findings: the production repair prompt rewrites each flagged part with its findings as the reasons (GLM-5.3 Flash), the
 * level is read again whole by Kimi K3.1 Pro. A part goes in the file as certain only if its shape is unchanged (same keys, same ids), and the re-read raises nothing on it. Nothing is applied.
 *   node scripts/fact-gate/audit-fix.js [par=3] [limit]
 * Output: docs/fact-gate/audit-fixes.json, raw per-level log with cost and time.
 */
const L = require('./lib');
const J = require('./judges');
const bl = require('../../services/block-levels');
const { placeOf } = require('./scoring');

const [, , PAR = '3', LIMIT = '999'] = process.argv;
const audit = L.readJson(L.path.join(L.DOCS, 'audit-live.json'));
const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const LOG = L.path.join(L.TMP, 'raw', 'audit-fix.jsonl');
const done = new Set(L.readJsonl(LOG).map((r) => r.level));
const byLevel = {};
for (const f of audit.findings.filter((x) => x.status === 'confirmed' && placeOf(x.where))) (byLevel[f.level] = byLevel[f.level] || []).push(f);
const todo = Object.keys(byLevel).filter((id) => !done.has(id)).slice(0, Number(LIMIT));
const BLOCK_SCHEMA = { type: 'object', required: ['blocks'], properties: { blocks: { type: 'array', items: { type: 'object', required: ['index', 'data'], properties: { index: { type: 'integer' }, data: { type: 'object' } } } } } };
const CHECK_SCHEMA = { type: 'object', required: ['checks'], properties: { checks: { type: 'array', items: { type: 'object', required: ['index', 'prompt', 'answer', 'rationale'], properties: { index: { type: 'integer' }, prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'string' }, rationale: { type: 'string' }, accepts: { type: 'array', items: { type: 'string' } } } } } } };
const shape = (o) => { if (Array.isArray(o)) return `[${o.length}:${o.map(shape).join(',')}]`; if (o && typeof o === 'object') return `{${Object.keys(o).sort().map((k) => `${k}${k === 'id' || /Id$/.test(k) ? `=${o[k]}` : ''}:${shape(o[k])}`).join(',')}}`; return typeof o; };

(async () => {
  console.log(`${todo.length} levels`);
  await L.runPool(todo, Number(PAR), async (id) => {
    const lv = JSON.parse(JSON.stringify(levels.get(id)));
    const parts = new Map();
    for (const f of byLevel[id]) { const q = placeOf(f.where); const k = `${q.word} ${q.index}`; if (!parts.has(k)) parts.set(k, { ...q, reasons: [] }); parts.get(k).reasons.push(`false: "${String(f.quote).slice(0, 300)}" → ${String(f.truth || f.why).slice(0, 300)}`); }
    const t0 = Date.now(); let cost = 0; const fixes = [];
    for (const p of parts.values()) {
      try {
        if (p.word === 'block') {
          const b = lv.blocks.find((x) => x.index === p.index); if (!b) continue;
          const user = `${L.contextOf(lv)}\n\nBLOCK ${b.index}: ${b.block}\ndata: ${JSON.stringify(b.data).slice(0, 9000)}\nproblems: ${p.reasons.join('; ')}`;
          // eslint-disable-next-line no-await-in-loop
          const r = await J.callModel('glm_flash_zgpu', { system: `${bl.REPAIR_SYSTEM}\n\nChange only what the problems name. Keep every key, id and array length as it is.`, user, schema: BLOCK_SCHEMA, schemaName: 'submit_fixed_blocks', maxTokens: 12000, effort: 'high', task: 'fact_gate_repair' });
          cost += r.cost || 0;
          const fixed = (r.data.blocks || [])[0];
          if (fixed && fixed.data) { fixes.push({ part: `block ${b.index}`, word: 'block', index: b.index, block: b.block, reasons: p.reasons, before: b.data, after: fixed.data, sameShape: shape(b.data) === shape(fixed.data) }); b.data = fixed.data; }
        } else {
          const c = lv.checks.find((x) => x.index === p.index); if (!c) continue;
          const user = `${L.contextOf(lv)}\n\nCHECK ${c.index}: ${c.format}\nwritten: ${JSON.stringify(c).slice(0, 4000)}\nrefused because: ${p.reasons.join('; ')}`;
          // eslint-disable-next-line no-await-in-loop
          const r = await J.callModel('glm_flash_zgpu', { system: `${bl.CHECK_REPAIR_SYSTEM}\n\nChange only what is named. Keep the number of choices.`, user, schema: CHECK_SCHEMA, schemaName: 'submit_fixed_checks', maxTokens: 6000, effort: 'high', task: 'fact_gate_repair' });
          cost += r.cost || 0;
          const fixed = (r.data.checks || [])[0];
          if (fixed) {
            const after = { ...c, prompt: fixed.prompt, answer: fixed.answer, rationale: fixed.rationale, ...(fixed.choices ? { choices: fixed.choices } : {}), ...(fixed.accepts ? { accepts: fixed.accepts } : {}) };
            fixes.push({ part: `check ${c.index}`, word: 'check', index: c.index, reasons: p.reasons, before: c, after, sameShape: !c.choices || (after.choices && after.choices.length === c.choices.length && after.choices.includes(after.answer)) });
            Object.assign(c, after);
          }
        }
      } catch (e) { console.log('repair fail', id, String(e.message).slice(0, 90)); }
    }
    const repairMs = Date.now() - t0;
    let flags = null;
    for (let a = 0; a < 3 && !flags; a++) {
      try { const r = await J.read('kimi31', lv); cost += r.cost || 0; flags = r.flags; } catch (e) { await L.sleep(8000); } // eslint-disable-line no-await-in-loop
    }
    const flagged = new Set((flags || []).map((f) => { const q = placeOf(f.where); return q ? `${q.word} ${q.index}` : '?'; }));
    for (const fx of fixes) { fx.reread = flags ? (flagged.has(fx.part) ? 'flagged' : 'clean') : 'not read'; fx.reread_flags = (flags || []).filter((f) => { const q = placeOf(f.where); return q && `${q.word} ${q.index}` === fx.part; }).map((f) => `${String(f.claim).slice(0, 120)} :: ${String(f.why).slice(0, 180)}`); }
    L.appendJsonl(LOG, { level: id, cost, repairMs, ms: Date.now() - t0, fixes, newFlagsOutside: (flags || []).filter((f) => { const q = placeOf(f.where); return !q || ![...parts.keys()].includes(`${q.word} ${q.index}`); }).length, parts: parts.size });
    console.log(id, `$${cost.toFixed(3)}`, `${(Date.now() - t0) / 1000 | 0}s`, fixes.map((f) => `${f.part}:${f.sameShape ? '' : 'SHAPE '}${f.reread}`).join(' ').slice(0, 120));
  });
  const rows = L.readJsonl(LOG);
  const fx = rows.flatMap((r) => r.fixes.map((f) => ({ level: r.level, ...f })));
  const certain = fx.filter((f) => f.sameShape && f.reread === 'clean');
  L.writeJson(L.path.join(L.DOCS, 'audit-fixes.json'), { built: '2026-11-06', not_applied: true, how: 'Confirmed by two rulers; repaired with the production prompt on GLM-5.3 Flash; read again by Kimi K3.1 Pro. certain: same shape, re-read clean. Keyed by level and part. For review.', certain: certain.map((f) => ({ key: `${f.level}|${f.part}`, reasons: f.reasons, before: f.before, after: f.after })), not_certain: fx.filter((f) => !(f.sameShape && f.reread === 'clean')).map((f) => ({ key: `${f.level}|${f.part}`, why: f.sameShape ? `re-read ${f.reread}` : 'shape changed', reasons: f.reasons, reread_flags: f.reread_flags })) });
  const n = rows.length || 1;
  console.log(`RESULT levels ${rows.length}, parts repaired ${fx.length}, certain ${certain.length}, flagged again ${fx.filter((f) => f.reread === 'flagged').length}, shape changed ${fx.filter((f) => !f.sameShape).length}; $${(rows.reduce((s, r) => s + r.cost, 0) / n).toFixed(3)}/level, ${(rows.reduce((s, r) => s + r.ms, 0) / n / 1000) | 0}s/level; new flags outside the repaired parts ${rows.reduce((s, r) => s + r.newFlagsOutside, 0)}`);
  process.exit(0);
})();
