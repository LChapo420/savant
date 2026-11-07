#!/usr/bin/env node
/**
 * Round 4 (docs/speed-real/ROUND4.md; SIMULATED, WHAT-IF, never a result): what would have to be true to reach 4x against careful self-study, built up one assumption at a time on the beta set. Also where the beta set's hours go.
 *   node scripts/speed-r4-floor.js OUT
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ARMS, HELD } = require('./speed-r4-run');

const OUT = process.argv[2]; const SIM = path.join(__dirname, 'faster-by-goal-sim.js');
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN; };
const COMMON = ['--finish=1', '--jit=1', '--final=1', '--space-days=1,2,4,7', '--screen-s=6', '--one-s=3', '--ckpt-answers=2', '--quick=1', '--lesson=0.38', '--item-s=15', '--wrong-s=12', '--retry-s=15', `--seed=${HELD[0]}`];
const BETA = ARMS['beta set: + one prompt + tight page'];
const STEPS = [
  ['the beta set as measured', BETA, []],
  ['+ pages take a third of the time and teach as much', BETA.replace('tight=0.85', 'tight=0.33'), []],
  ['+ every review question takes 5 s', BETA.replace('tight=0.85', 'tight=0.33'), ['--review-s=5']],
  ['+ no first level of practice past the check: the mastery stop works, no recall lost', `stop=1:${BETA.replace('tight=0.85', 'tight=0.33')}`, ['--review-s=5']],
  ['+ each answer and page teach 2x', `stop=1:${BETA.replace('tight=0.85', 'tight=0.33')}`, ['--review-s=5', '--speed-gain=2']],
  ['+ spaced memory grows twice as fast (power 2)', `stop=1:${BETA.replace('tight=0.85', 'tight=0.33')}`, ['--review-s=5', '--speed-gain=2', '--mem-gain=2']],
  ['+ the learner already knows more (+1, every arm)', `stop=1:${BETA.replace('tight=0.85', 'tight=0.33')}`, ['--review-s=5', '--speed-gain=2', '--mem-gain=2', '--prior-add=1'], true],
];
const dir = path.join(OUT, 'floor'); fs.mkdirSync(dir, { recursive: true });
const D = load(path.join(OUT, 'words', 'base-design.json')); const B = load(path.join(OUT, 'words', 'base-h1.json'));
const pickR = (goal) => { const rs = Object.keys(D.rows[0].goals[goal].self_r).map(Number).sort((a, b) => b - a); let best = null; for (const r of rs) { const share = mean(D.rows.map((x) => (x.goals[goal].self_r[r].pass ? 1 : 0))); if (share >= 0.95) return r; if (!best || share > best.share) best = { r, share }; } return best.r; };
const GOALS = ['horizon 1 week', 'horizon 1 month', 'horizon 6 months', 'horizon 1 year', 'no test day (3 y)'];
const lines = ['SIMULATED WHAT-IF. Mean x against careful self-study at its hours as they are; arm hours and recall in brackets. 160 learners, seed 20261121. Each row keeps the rows above it.'];
STEPS.forEach(([label, spec, extra, baseToo], i) => {
  const f = path.join(dir, `s${i}.json`);
  if (!fs.existsSync(f)) { const r = spawnSync(process.execPath, [SIM, ...COMMON, ...extra, `--speed-arms=${spec}`, `--out=${f}`], { stdio: 'ignore' }); if (r.status !== 0) throw new Error(`step ${i} failed`); }
  const d = load(f);
  const cells = GOALS.map((g) => { const r = pickR(g); const a = d.rows.map((x) => x.goals[g].speed[spec]); const rat = a.map((x, k) => (x.pass && x.understood === 1 && B.rows[k].goals[g].self_r[r].pass ? B.rows[k].goals[g].self_r[r].hours / x.hours : null)).filter((v) => v !== null); return `${g.replace('horizon ', '').replace('no test day (3 y)', '3 y')}: x${mean(rat).toFixed(2)} (${mean(a.map((x) => x.hours)).toFixed(1)} h, ${mean(a.map((x) => x.recall)).toFixed(2)}, n ${rat.length})`; });
  lines.push(`${label}${baseToo ? ' [baseline left as it was: favours the arm]' : ''}\n   ${cells.join(' | ')}`);
});
// Where the beta set's hours go, and the answers it asks.
const A = load(path.join(OUT, 'words', 'arms', `h1-${HELD[0]}.json`));
lines.push('\nBeta set, main run: hours lesson / practice and friction / review, per goal; careful self-study hours for scale.');
for (const g of GOALS) { const a = A.rows.map((x) => x.goals[g].speed[BETA]); const r = pickR(g); lines.push(`  ${g}: ${mean(a.map((x) => x.by.lesson)).toFixed(1)} / ${mean(a.map((x) => x.by.practice)).toFixed(1)} / ${mean(a.map((x) => x.by.review)).toFixed(1)} = ${mean(a.map((x) => x.hours)).toFixed(1)} h; careful ${mean(B.rows.map((x) => x.goals[g].self_r[r].hours)).toFixed(1)} h, 4x would be ${(mean(B.rows.map((x) => x.goals[g].self_r[r].hours)) / 4).toFixed(1)} h`); }
void q;
const text = lines.join('\n'); console.log(text); fs.writeFileSync(path.join(OUT, 'floor-report.txt'), `${text}\n`);
