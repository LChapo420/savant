#!/usr/bin/env node
/**
 * Round 4 (docs/speed-real/ROUND4.md; SIMULATED): the multiple under each assumption. Reads what scripts/speed-r4-run.js wrote under OUT/sens, one seed (60 extreme + 20 ordinary; design 30 + 10), and the what-if grid.
 *   node scripts/speed-r4-sens-report.js OUT
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ARMS, HELD } = require('./speed-r4-run');

const OUT = process.argv[2];
const beta = ARMS['beta set: + one prompt + tight page']; const before = ARMS['main before round 4'];
const armArg = `before=${before};beta=${beta}`;
const GOALS = ['horizon 1 week', 'horizon 1 month', 'horizon 6 months', 'horizon 1 year', 'no test day (3 y)'];
const BASES = { careful: 'careful: self-study, wide schedule reaching 95%', 'tutor .37': 'tutor d = 0.37 (Nickow et al. 2020)', 'tutor .79': 'tutor d = 0.79 (VanLehn 2011)', rereader: 'rereader: read, reread, cram rereads' };
const fx = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
const lines = ['SIMULATED. Beta set against each baseline, mean x (hours to recall 0.70 with everything understood; a baseline that misses is not counted). One held-out seed, 80 learners a variant, costs "words". goal: careful | tutor .37 | tutor .79 | rereader (worst 5% in brackets for careful), then beta hours and recall.'];
const res = {};
for (const name of ['(main run, 320 learners)', ...fs.readdirSync(path.join(OUT, 'sens'))]) {
  const dir = name.startsWith('(') ? path.join(OUT, 'words') : path.join(OUT, 'sens', name);
  const json = path.join(os.tmpdir(), `r4-sens-${process.pid}.json`);
  const held = name.startsWith('(') ? 'h1,h2' : 'h1';
  execFileSync(process.execPath, [path.join(__dirname, 'speed-real-report.js'), dir, path.join(dir, 'arms'), `--held=${held}`, `--arms=${armArg}`, `--json=${json}`], { stdio: 'ignore' });
  const d = JSON.parse(fs.readFileSync(json, 'utf8')); res[name] = {};
  lines.push(`\n${name}`);
  for (const g of GOALS) {
    const G = d.goals[g]; const cell = (b) => { const r = G.baselines[BASES[b]].arms.beta; return r; };
    const c = cell('careful'); const a = G.arms.beta;
    lines.push(`  ${g.padEnd(18)} ${fx(c.mean)} (w5 ${fx(c.w5)}, n ${c.n}) | ${fx(cell('tutor .37').mean)} (n ${cell('tutor .37').n}) | ${fx(cell('tutor .79').mean)} (n ${cell('tutor .79').n}) | ${fx(cell('rereader').mean)} (n ${cell('rereader').n}) | beta ${a.hours.toFixed(1)} h, recall ${fx(a.recall)}, before ${G.arms.before.hours.toFixed(1)} h`);
    res[name][g] = { careful: c.mean, careful_w5: c.w5, careful_n: c.n, tutor37: cell('tutor .37').mean, tutor79: cell('tutor .79').mean, rereader: cell('rereader').mean, beta_hours: a.hours, beta_recall: a.recall };
  }
}
// What would have to be true: the same arm, learning rate and memory growth raised, against the careful baseline's hours as they are.
const wf = path.join(OUT, 'whatif');
if (fs.existsSync(wf)) {
  const base = JSON.parse(fs.readFileSync(path.join(OUT, 'words', 'base-h1.json'), 'utf8'));
  const D = JSON.parse(fs.readFileSync(path.join(OUT, 'words', 'base-design.json'), 'utf8'));
  const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const pickR = (goal) => { const rs = Object.keys(D.rows[0].goals[goal].self_r).map(Number).sort((a, b) => b - a); let best = null; for (const r of rs) { const share = mean(D.rows.map((x) => (x.goals[goal].self_r[r].pass ? 1 : 0))); if (share >= 0.95) return r; if (!best || share > best.share) best = { r, share }; } return best.r; };
  lines.push('\nWHAT-IF, never a result: the beta set if each answer and page taught G times what the model says and each spaced right answer grew memory to the power M. Mean x against careful self-study; hours in brackets. Rows G, columns M. Learners 160, seed 20261121.');
  for (const g of GOALS) {
    const r = pickR(g); const bH = base.rows.map((x) => x.goals[g].self_r[r]);
    const rows = [];
    for (const G of [1, 1.5, 2, 3, 5]) {
      const cells = [];
      for (const M of [1, 1.5, 2, 3]) {
        const f = path.join(wf, `g${G}-m${M}.json`); if (!fs.existsSync(f)) { cells.push('-'); continue; }
        const d = JSON.parse(fs.readFileSync(f, 'utf8')); const a = d.rows.map((x) => x.goals[g].speed[beta]);
        const rat = a.map((x, i) => (x.pass && x.understood === 1 && bH[i].pass ? bH[i].hours / x.hours : null)).filter((v) => v !== null);
        cells.push(`${fx(mean(rat))} (${mean(a.map((x) => x.hours)).toFixed(1)} h)`);
      }
      rows.push(`    G ${G}: ${cells.join(' | ')}`);
    }
    lines.push(`  ${g}`); lines.push(...rows);
  }
}
const text = lines.join('\n'); console.log(text); fs.writeFileSync(path.join(OUT, 'sens-report.txt'), `${text}\n`); fs.writeFileSync(path.join(OUT, 'sens.json'), JSON.stringify(res, null, 1));
void HELD;
