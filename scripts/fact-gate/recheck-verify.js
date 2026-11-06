#!/usr/bin/env node
// Do the proposed corrections read right? Kimi K3.1 Pro hunts over them in batches (a pseudo-level per batch), the code pass over all. Output: flags only.
const L = require('./lib');
const J = require('./judges');
const code = require('../../services/fact-code-checks');

const fx = L.readJson(L.path.join(L.DOCS, 'recheck-fixes.json'));
const rows = Object.entries(fx.game_fixes);
const batches = [];
for (let i = 0; i < rows.length; i += 12) batches.push(rows.slice(i, i + 12));
(async () => {
  let cost = 0; const out = [];
  await L.runPool(batches, 4, async (b, n) => {
    const lv = { track: 'english', grade: 'proficient', level: n, blocks: [], checks: b.map(([k, r], i) => ({ index: i, format: 'multiple_choice', prompt: r.after.prompt, choices: r.after.choices, answer: r.after.choices[r.after.answerIndex], rationale: r.after.explanation, rowKey: k })) };
    for (const f of code.checkLevel({ trackId: 'english', blocks: [], checks: lv.checks }).filter((x) => x.certain)) out.push(`CODE ${f.where} ${f.claim.slice(0, 80)}`);
    try {
      const r = await J.read('kimi31', lv);
      cost += r.cost || 0;
      for (const f of r.flags) { const m = /check\s*(\d+)/i.exec(f.where); const k = m && b[Number(m[1])] ? b[Number(m[1])][0].replace('game_payloads:', '') : '?'; out.push(`${k} "${String(f.claim).slice(0, 70)}" :: ${String(f.why).slice(0, 190)}`); }
    } catch (e) { out.push(`fail batch ${n} ${String(e.message).slice(0, 80)}`); }
  });
  console.log(`read ${rows.length} fixes, $${cost.toFixed(3)}, ${out.length} flags`);
  console.log(out.join('\n'));
  process.exit(0);
})();
