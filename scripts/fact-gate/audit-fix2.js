#!/usr/bin/env node
/**
 * Second repair round on what the first left unresolved (nothing changed, flagged again, shape changed): a stronger writer (grok-4.3, default), told plainly that the text must change, then Kimi reads the
 * level again with the first round's good parts in place. Merges into docs/fact-gate/audit-fixes.json. Nothing is applied anywhere.
 *   node scripts/fact-gate/audit-fix2.js [writer=grok43] [par=4]
 */
const L = require('./lib');
const J = require('./judges');
const bl = require('../../services/block-levels');
const { placeOf } = require('./scoring');

const [, , WRITER = 'grok43', PAR = '4'] = process.argv;
const LOG1 = L.path.join(L.TMP, 'raw', 'audit-fix.jsonl');
const LOG2 = L.path.join(L.TMP, 'raw', 'audit-fix2.jsonl');
const rows = L.readJsonl(LOG1);
const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const done = new Set(L.readJsonl(LOG2).map((r) => r.level));
const same = (f) => JSON.stringify(f.before) === JSON.stringify(f.after) || (f.word === 'check' && ['prompt', 'answer', 'rationale', 'choices', 'accepts'].every((k) => JSON.stringify(f.before[k]) === JSON.stringify(f.after[k])));
const good = (f) => !same(f) && f.sameShape && f.reread === 'clean';
const shape = (o) => { if (Array.isArray(o)) return `[${o.length}:${o.map(shape).join(',')}]`; if (o && typeof o === 'object') return `{${Object.keys(o).sort().map((k) => `${k}${k === 'id' || /Id$/.test(k) ? `=${o[k]}` : ''}:${shape(o[k])}`).join(',')}}`; return typeof o; };
const BLOCK_SCHEMA = { type: 'object', required: ['blocks'], properties: { blocks: { type: 'array', items: { type: 'object', required: ['index', 'data'], properties: { index: { type: 'integer' }, data: { type: 'object' } } } } } };
const CHECK_SCHEMA = { type: 'object', required: ['checks'], properties: { checks: { type: 'array', items: { type: 'object', required: ['index', 'prompt', 'answer', 'rationale'], properties: { index: { type: 'integer' }, prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'string' }, rationale: { type: 'string' }, accepts: { type: 'array', items: { type: 'string' } } } } } } };
const MUST = '\n\nThe text as written IS wrong for the reasons given: change it. Change only what the reasons name. Keep every key, id and array length as it is; for a check keep the number of choices, and the answer must be one of them, and fix the accepted answers too.';

(async () => {
  const todo = rows.filter((r) => !done.has(r.level) && r.fixes.some((f) => !good(f)));
  console.log(`${todo.length} levels, ${todo.reduce((n, r) => n + r.fixes.filter((f) => !good(f)).length, 0)} parts`);
  await L.runPool(todo, Number(PAR), async (row) => {
    const lv = JSON.parse(JSON.stringify(levels.get(row.level)));
    const setPart = (f, value) => { if (f.word === 'block') lv.blocks.find((b) => b.index === f.index).data = value; else Object.assign(lv.checks.find((c) => c.index === f.index), value); };
    for (const f of row.fixes.filter(good)) setPart(f, f.after);
    let cost = 0; const t0 = Date.now(); const fixes = [];
    for (const f of row.fixes.filter((x) => !good(x))) {
      const reasons = [...f.reasons, ...(f.reread_flags || []).map((x) => `also: ${x}`)].join('; ');
      try {
        if (f.word === 'block') {
          const user = `${L.contextOf(lv)}\n\nBLOCK ${f.index}: ${f.block}\ndata: ${JSON.stringify(f.before).slice(0, 9000)}\nproblems: ${reasons}`;
          const r = await J.callModel(WRITER, { system: bl.REPAIR_SYSTEM + MUST, user, schema: BLOCK_SCHEMA, schemaName: 'submit_fixed_blocks', maxTokens: 12000, effort: 'high', task: 'fact_gate_repair' }); // eslint-disable-line no-await-in-loop
          cost += r.cost || 0;
          const fixed = (r.data.blocks || [])[0];
          if (fixed && fixed.data) { fixes.push({ ...f, after: fixed.data, sameShape: shape(f.before) === shape(fixed.data), round: 2 }); setPart(f, fixed.data); }
        } else {
          const user = `${L.contextOf(lv)}\n\nCHECK ${f.index}: ${f.before.format}\nwritten: ${JSON.stringify(f.before).slice(0, 4000)}\nrefused because: ${reasons}`;
          const r = await J.callModel(WRITER, { system: bl.CHECK_REPAIR_SYSTEM + MUST, user, schema: CHECK_SCHEMA, schemaName: 'submit_fixed_checks', maxTokens: 6000, effort: 'high', task: 'fact_gate_repair' }); // eslint-disable-line no-await-in-loop
          cost += r.cost || 0;
          const x = (r.data.checks || [])[0];
          if (x) {
            const after = { ...f.before, prompt: x.prompt, answer: x.answer, rationale: x.rationale, ...(x.choices ? { choices: x.choices } : {}), ...(x.accepts ? { accepts: x.accepts } : {}) };
            fixes.push({ ...f, after, sameShape: !f.before.choices || (after.choices && after.choices.length === f.before.choices.length && after.choices.includes(after.answer)), round: 2 });
            setPart(f, after);
          }
        }
      } catch (e) { console.log('fail', row.level, f.part, String(e.message).slice(0, 80)); }
    }
    let flags = null;
    for (let a = 0; a < 4 && !flags; a++) { try { const r = await J.read('kimi31', lv); cost += r.cost || 0; flags = r.flags; } catch (e) { await L.sleep(10000); } } // eslint-disable-line no-await-in-loop
    for (const fx of fixes) { fx.reread = flags ? (flags.some((x) => { const q = placeOf(x.where); return q && `${q.word} ${q.index}` === fx.part; }) ? 'flagged' : 'clean') : 'not read'; fx.reread_flags = (flags || []).filter((x) => { const q = placeOf(x.where); return q && `${q.word} ${q.index}` === fx.part; }).map((x) => `${String(x.claim).slice(0, 120)} :: ${String(x.why).slice(0, 180)}`); }
    L.appendJsonl(LOG2, { level: row.level, cost, ms: Date.now() - t0, fixes });
  });
  const r2 = new Map(L.readJsonl(LOG2).map((r) => [r.level, r]));
  const all = rows.flatMap((r) => r.fixes.map((f) => { const two = r2.has(r.level) ? r2.get(r.level).fixes.find((x) => x.part === f.part) : null; return { level: r.level, ...(two || f) }; }));
  const certain = all.filter(good);
  L.writeJson(L.path.join(L.DOCS, 'audit-fixes.json'), { built: '2026-11-06', not_applied: true, how: 'Confirmed by two rulers; repaired with the production prompt (GLM-5.3 Flash, then grok-4.3 for what was left); level read again by Kimi K3.1 Pro. certain: changed, same shape, re-read clean. A corrected fact is a model\'s: read before applying. Keyed by level and part.', certain: certain.map((f) => ({ key: `${f.level}|${f.part}`, round: f.round || 1, reasons: f.reasons, before: f.before, after: f.after })), not_certain: all.filter((f) => !good(f)).map((f) => ({ key: `${f.level}|${f.part}`, why: same(f) ? 'the repair changed nothing' : f.sameShape ? `re-read ${f.reread}` : 'shape changed', reasons: f.reasons, reread_flags: f.reread_flags })) });
  const rows2 = [...r2.values()];
  console.log(`RESULT parts ${all.length}, certain ${certain.length}; left: unchanged ${all.filter(same).length}, flagged ${all.filter((f) => !same(f) && f.reread === 'flagged').length}, shape ${all.filter((f) => !same(f) && !f.sameShape).length}; round 2 $${rows2.reduce((s, r) => s + r.cost, 0).toFixed(2)} on ${rows2.length} levels, ${(rows2.reduce((s, r) => s + r.ms, 0) / Math.max(1, rows2.length) / 1000) | 0}s/level`);
  process.exit(0);
})();
