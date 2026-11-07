#!/usr/bin/env node
/** The Wiktionary check over Spanish fixtures: free, no model. node scripts/fact-100/run-dict.js <dev|heldout> */
const C = require('./common');
const { L } = C;
const D = require('../../services/fact-dictionary');
const SET = process.argv[2] || 'dev';
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!/^(id|block|color|colour|icon|timing|format|fen|emoji|type|kind)$/i.test(k)) strings(v, out); return out; };
(async () => {
  await C.runChecker('dict', SET, async (lv) => {
    const flags = [];
    for (const b of lv.blocks) for (const f of await D.checkText(strings(b.data).join(' . '))) flags.push({ ...f, where: `block ${b.index}` }); // eslint-disable-line no-await-in-loop
    for (const c of lv.checks) for (const f of await D.checkText(strings({ p: c.prompt, r: c.rationale, a: c.answer }).join(' . '))) flags.push({ ...f, where: `check ${c.index}` }); // eslint-disable-line no-await-in-loop
    return { flags, cost: 0 };
  }, { par: 2, filter: (x) => x.track === 'spanish' });
  const raw = C.readRaw('dict', SET).filter((r) => r.read);
  const res = C.scorePlants(raw, SET);
  const ps = C.loadSet(SET).plants.filter((p) => p.track === 'spanish' && res.has(p.id));
  console.log('spanish plants caught', L.fmtRate(ps.filter((p) => res.get(p.id)).length, ps.length));
  const cl = raw.filter((r) => r.id.startsWith('clean:'));
  console.log(`clean levels ${cl.length}, flagged ${cl.filter((r) => r.flags.length).length}, flags ${cl.reduce((n, r) => n + r.flags.length, 0)}, s a level ${(raw.reduce((n, r) => n + r.ms, 0) / raw.length / 1000).toFixed(1)}`);
  for (const r of cl.filter((x) => x.flags.length).slice(0, 10)) console.log(' ', r.level.split('/').slice(-2).join('/'), r.flags.slice(0, 2).map((f) => `${f.claim}: ${f.why.slice(0, 80)}`).join(' | '));
  process.exit(0);
})();
