#!/usr/bin/env node
/**
 * Round 4 (docs/speed-real/ROUND4.md; SIMULATED): worst individual learners, and by kind. Each arm against careful self-study and a tutor at d 0.79, per learner, held-out seeds, cost set "words".
 *   node scripts/speed-r4-worst.js OUT [--arm=NAME]
 */
const fs = require('fs');
const path = require('path');
const { ARMS, HELD } = require('./speed-r4-run');

const OUT = process.argv[2]; const flag = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=').slice(1).join('=') : d; };
const ARM = ARMS[flag('arm', 'space + proof + recheck')];
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const D = load(path.join(OUT, 'words', 'base-design.json'));
const Bs = HELD.map((_, i) => load(path.join(OUT, 'words', `base-h${i + 1}.json`)));
const As = HELD.map((s, i) => load(path.join(OUT, 'words', 'arms', `h${i + 1}-${s}.json`)));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN; };
const fx = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pickR = (goal) => { const rs = Object.keys(D.rows[0].goals[goal].self_r).map(Number).sort((a, b) => b - a); let best = null; for (const r of rs) { const share = mean(D.rows.map((x) => (x.goals[goal].self_r[r].pass ? 1 : 0))); if (share >= 0.95) return r; if (!best || share > best.share) best = { r, share }; } return best.r; };
const pickTab = (goal, get) => { const t = get(D.rows[0].goals[goal]); let best = null; for (let i = 0; i < t.length; i++) { const share = mean(D.rows.map((r) => (get(r.goals[goal])[i].pass ? 1 : 0))); if (share >= 0.95) return i; if (!best || share > best.share) best = { i, share }; } return best.i; };
const strict = (a) => !!(a.pass && a.understood === 1);
const lines = ['SIMULATED. Per learner: hours, recall, x against careful self-study (both reach 0.70 with all understood). 320 held-out learners, 3 in 4 extreme.'];
for (const g of Object.keys(D.rows[0].goals)) {
  const r = pickR(g); const ti = pickTab(g, (c) => c.tutorD.d079);
  const rows = [];
  As.forEach((A, s) => A.rows.forEach((row, i) => { const a = row.goals[g].speed[ARM]; const b = Bs[s].rows[i].goals[g]; rows.push({ id: row.id, kind: row.kind, age: row.age, a, off: row.goals[g].speed[ARMS['plain bug fixes (default now)']], before: row.goals[g].speed[ARMS['main before round 4']], self: b.self_r[r], tut: b.tutorD.d079[ti] }); }));
  const both = rows.filter((x) => strict(x.a) && x.self.pass); const rat = both.map((x) => ({ ...x, x: x.self.hours / x.a.hours }));
  const hours = rows.map((x) => x.a.hours); const recall = rows.map((x) => x.a.recall);
  const worst = [...rat].sort((p, n) => p.x - n.x).slice(0, 3);
  const vsBefore = rows.map((x) => x.before.hours / x.a.hours);
  lines.push(`\n== ${g}: arm hours mean ${fx(mean(hours), 1)}, worst 10/5/1% ${fx(q(hours, 0.9), 1)} ${fx(q(hours, 0.95), 1)} ${fx(q(hours, 0.99), 1)}, single slowest ${fx(Math.max(...hours), 1)}; recall mean ${fx(mean(recall))}, worst 10/5/1% ${fx(q(recall, 0.1))} ${fx(q(recall, 0.05))} ${fx(q(recall, 0.01))}, lowest ${fx(Math.min(...recall))}; reach 0.70 with all understood ${rows.filter((x) => strict(x.a)).length} of ${rows.length}`);
  lines.push(`   x careful: mean ${fx(mean(rat.map((x) => x.x)))}, worst 10/5/1% ${fx(q(rat.map((x) => x.x), 0.1))} ${fx(q(rat.map((x) => x.x), 0.05))} ${fx(q(rat.map((x) => x.x), 0.01))}, under x1 ${rat.filter((x) => x.x < 1).length} of ${rat.length}, at x4 ${rat.filter((x) => x.x >= 4).length}. Against main before this round: mean x${fx(mean(vsBefore))}, slowest x${fx(Math.min(...vsBefore))}, every learner faster ${vsBefore.every((v) => v > 1)}`);
  lines.push(`   worst three: ${worst.map((x) => `${x.kind} age ${x.age}: x${fx(x.x)} (${fx(x.a.hours, 1)} h against ${fx(x.self.hours, 1)} h, recall ${fx(x.a.recall)} against ${fx(x.self.recall)})`).join('; ')}`);
  const kinds = [...new Set(rows.map((x) => x.kind))];
  lines.push(`   by kind, x careful mean / worst, hours, recall: ${kinds.map((k) => { const m = rat.filter((x) => x.kind === k); const all = rows.filter((x) => x.kind === k); return `${k} ${fx(mean(m.map((x) => x.x)))}/${fx(Math.min(...m.map((x) => x.x)))} ${fx(mean(all.map((x) => x.a.hours)), 1)} h ${fx(mean(all.map((x) => x.a.recall)))}`; }).join('; ')}`);
}
const text = lines.join('\n'); console.log(text);
