#!/usr/bin/env node
/**
 * Round 2 tables: node scripts/faster-by-goal-report2.js DESIGN.json HELDOUT.json
 * Fixed pass counts are chosen on DESIGN by one rule set in advance (smallest N in the list whose pass share is at least 95%, else the N with the highest share)
 * and reported on HELDOUT. Backward-plan settings: the (passes, floor) with 100% pass on DESIGN and the fewest mean hours, else the highest pass share.
 * Hours are means over ALL learners (a learner who misses the target still spent the hours); pass = share reaching the 0.70 target with the course covered.
 */
const fs = require('fs');
const D = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const H = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const q = (xs, p) => { const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const share = (xs) => xs.filter((x) => x.pass).length / xs.length;
const cellOf = (xs) => `${mean(xs.map((x) => x.hours)).toFixed(1)}h ${(100 * share(xs)).toFixed(0)}%`;
const goals = Object.keys(H.rows[0].goals);
const pickN = (g, arm) => {
  const steps = D.rows[0].goals[g].tabs[arm].map((e) => e.n);
  const sh = steps.map((n, j) => share(D.rows.map((r) => r.goals[g].tabs[arm][j])));
  const j = sh.findIndex((x) => x >= 0.95);
  return j >= 0 ? j : sh.indexOf(Math.max(...sh));
};
const pickBW = (g) => {
  const keys = Object.keys(D.rows[0].goals[g].bw);
  const sc = keys.map((k) => { const xs = D.rows.map((r) => r.goals[g].bw[k]); return { k, sh: share(xs), h: mean(xs.map((x) => x.hours)) }; });
  const full = sc.filter((x) => x.sh === 1);
  return (full.length ? full.sort((a, b) => a.h - b.h) : sc.sort((a, b) => b.sh - a.sh || a.h - b.h))[0].k;
};
const L = (s = '') => console.log(s);
L(`DESIGN ${process.argv[2]} (seed ${D.seed}, ${D.rows.length} learners), HELD-OUT ${process.argv[3]} (seed ${H.seed}, ${H.rows.length} learners); forget ${H.forget} lesson ${H.lesson} kloss ${H.kloss}`);
L('\ncell = mean hours over all learners, share reaching the target');
L('goal | Savant (app) | Savant stop-at-target BOUND | self-study fixed spaced | normal fixed-N (N) | typical tutor fixed-N (N) | normal ORACLE bound | tutor ORACLE bound | backward Savant (P-floor)');
for (const g of goals) {
  const rows = H.rows.map((r) => r.goals[g]);
  const nN = pickN(g, 'normal'), nT = pickN(g, 'tutor');
  const fixed = (arm, j) => rows.map((r) => r.tabs[arm][j]);
  const bwk = rows[0].bw ? pickBW(g) : null;
  L([g, cellOf(rows.map((r) => r.savant)), cellOf(rows.map((r) => r.savant_stop)), cellOf(rows.map((r) => r.self_sr)),
    `${cellOf(fixed('normal', nN))} (${D.rows[0].goals[g].tabs.normal[nN].n})`, `${cellOf(fixed('tutor', nT))} (${D.rows[0].goals[g].tabs.tutor[nT].n})`,
    cellOf(rows.map((r) => r.normal)), cellOf(rows.map((r) => r.tutor)), bwk ? `${cellOf(rows.map((r) => r.bw[bwk]))} (${bwk})` : '-'].join(' | '));
}
L('\nSavant (app) against each non-oracle baseline, per learner: faster (both reach target, fewer hours) / not faster (both reach) / Savant misses / baseline misses, Savant reaches (NOT counted as faster) / both miss');
const cmp = (g, pick) => { let a = 0, b = 0, c = 0, d = 0, e = 0; for (const r of H.rows) { const s = r.goals[g].savant, x = pick(r.goals[g]); if (s.pass && x.pass) { if (s.hours < x.hours) a++; else b++; } else if (!s.pass && x.pass) c++; else if (s.pass) d++; else e++; } return `${a}/${b}/${c}/${d}/${e}`; };
for (const g of goals) {
  const nN = pickN(g, 'normal'), nT = pickN(g, 'tutor');
  L(`${g.padEnd(20)} self-study SR ${cmp(g, (c) => c.self_sr)} | normal fixed-N ${cmp(g, (c) => c.tabs.normal[nN])} | tutor fixed-N ${cmp(g, (c) => c.tabs.tutor[nT])} | tutor oracle ${cmp(g, (c) => c.tutor)}`);
}
L('\nTutor multiplier sensitivity (guesses: low 1.1x learning / pages 10% shorter; typical 1.3x / 25%; high 1.8x / 50%), fixed-N chosen on design, mean hours and share');
for (const g of goals) L(`${g.padEnd(20)} ` + ['tutor_lo', 'tutor', 'tutor_bloom'].map((a) => { const n = pickN(g, a); return `${a} N${D.rows[0].goals[g].tabs[a][n].n}: ${cellOf(H.rows.map((r) => r.goals[g].tabs[a][n]))}`; }).join(' | '));
L('\nSavant hours spread over all learners: mean / median / worst 10% / worst 1% (app) and self-study SR');
for (const g of goals) { const f = (k) => { const h = H.rows.map((r) => r.goals[g][k].hours); return `${mean(h).toFixed(1)}/${q(h, 0.5).toFixed(1)}/${q(h, 0.9).toFixed(1)}/${q(h, 0.99).toFixed(1)}`; }; L(`${g.padEnd(20)} savant ${f('savant')} | self SR ${f('self_sr')} | stop-bound ${f('savant_stop')}`); }
L('\nBackward plan on design (dated goals): pass share and mean hours per setting');
for (const g of goals.filter((x) => x.startsWith('date'))) L(`${g}: ` + Object.keys(D.rows[0].goals[g].bw).map((k) => { const xs = D.rows.map((r) => r.goals[g].bw[k]); return `${k} ${(100 * share(xs)).toFixed(0)}%/${mean(xs.map((x) => x.hours)).toFixed(1)}h`; }).join('  '));
L('\nHORIZON goals judged per skill at ITS OWN horizon (skill learned + H days): share of learners reaching 0.70 (Savant app / self-study SR)');
for (const g of goals.filter((x) => x.startsWith('horizon'))) L(`${g.padEnd(20)} savant ${(100 * H.rows.filter((r) => r.goals[g].savant.passItem).length / H.rows.length).toFixed(0)}% | self SR ${(100 * H.rows.filter((r) => r.goals[g].self_sr.passItem).length / H.rows.length).toFixed(0)}%`);
L("-- Denser generic spaced schedule (self-study variant 2): mean hours, share reaching target; Savant app faster/not faster/Savant misses/baseline misses/both miss");
for (const g of goals) { const x = H.rows.map((r) => r.goals[g].self_sr2); let a=0,b=0,c=0,d=0,e=0; for (const r of H.rows) { const sv = r.goals[g].savant, y = r.goals[g].self_sr2; if (sv.pass && y.pass) { if (sv.hours < y.hours) a++; else b++; } else if (!sv.pass && y.pass) c++; else if (sv.pass) d++; else e++; } L(g.padEnd(20) + " " + cellOf(x) + " | " + [a,b,c,d,e].join("/")); }
