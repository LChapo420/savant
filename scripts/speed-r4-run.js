#!/usr/bin/env node
/**
 * Round 4 (docs/speed-real/ROUND4.md; SIMULATED, no model calls). Everything below was frozen on design seed 777003 and design grades before any held-out seed ran.
 *   node scripts/speed-r4-run.js run OUT [--width=4] [--only=main,gate,sens]
 *   node scripts/speed-r4-run.js gate OUT            the gate, one line per goal, on held-out seeds and each adverse variant
 *   node scripts/speed-r4-run.js sens OUT            the multiple under each assumption, against each baseline
 *
 * Costs: "words"  a page is 538 words at 200 words a minute (MEASURED mean of the AI lesson rows in a database copy; the rate is an assumption): --lesson=0.38; item 15 s, feedback 12 s, retry 15 s (ASSUMED, no real timing exists).
 *        "audited" the model as first audited: a 7 minute page, 35 s an item.
 * Arms carry the rates the walker measured on the design grades (scripts/speed-r4-ledger.js): stuck, the stretches the real proof never closes; stay, sittings repeated on one level per lesson.
 *
 * THE GATE, the same lines and margins as scripts/speed-gate.js: time saved beyond noise on at least 5 of 9 goals and never slower; recall per learner, lever minus off, worst 1, 5 and 10% at or above -5 points; knowledge worst 1% at or above -5;
 * reach with everything understood no more than 1 point lower; the same retention lines on each adverse variant. Off here means main as it now is, with the two plain bug fixes.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SIM = path.join(__dirname, 'faster-by-goal-sim.js');
const DESIGN = 777003; const HELD = [20261121, 20261122];
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=').slice(1).join('=') : d; };
const [CMD, OUT] = pos;

const ARMS = {
  'main before round 4': 'testout=0:appN=1:fast=1:stuck=0.2:stay=0.38',
  'plain bug fixes (default now)': 'testout=0:appN=1:fast=1:stuck=0.06:stay=0.43',
  'space': 'space=1:appN=1:fast=1:stuck=0.06:stay=0.59',
  'space + proof + recheck': 'space=1:appN=1:fast=1:stuck=0:stay=0.09',
  'beta set: + one prompt + tight page': 'space=1:appN=1:fast=1:stuck=0:stay=0.09:onePrompt=1:tight=0.85',
  'beta set + mastery stop': 'stop=1:space=1:appN=1:fast=1:stuck=0:stay=0.09:onePrompt=1:tight=0.85',
  'everything: + test-out, short, worked, one-tap': 'testout=1:short=1:stop=1:worked=1:quick=1:space=1:appN=1:fast=1:stuck=0:stay=0.09:onePrompt=1:tight=0.85',
};
const OFF = ARMS['plain bug fixes (default now)'];
const armList = Object.values(ARMS).join(',');
const COMMON = ['--finish=1', '--jit=1', '--final=1', '--space-days=1,2,4,7', '--screen-s=6', '--one-s=3', '--ckpt-answers=2'];
const SELF = '--self-r=1.1,1.15,1.2,1.25,1.3,1.4,1.5,1.75,2';
const COST = { words: ['--lesson=0.38', '--item-s=15', '--wrong-s=12', '--retry-s=15'], audited: [] };
// Each assumption the multiple rests on, moved both ways, baselines and arms together. Smaller runs: 40 design, 80 held-out.
const SENS = {
  'read half-life 1.6 d': ['--read-h=1.6'], 'read half-life 7 d': ['--read-h=7'],
  'forget twice as fast': ['--forget=0.5'], 'forget half as fast': ['--forget=2'],
  'deep lapse costs half of understanding': ['--kloss=0.5'],
  'massed answers worth 3x': ['--mass2=0.09'],
  'studies every third day': ['--every=3'],
  'learners know more (+1)': ['--prior-add=1'], 'learners know less (-1)': ['--prior-add=-1'],
  'careful self-studier stops 0.1 early': ['--self-over=0.1'],
  'tight page teaches 0.85 as much': ['--tight-gain=0.85'],
  'page 150 wpm': ['--lesson=0.51'], 'page 238 wpm': ['--lesson=0.32'],
  'item 25 s': ['--item-s=25'], 'item 8 s': ['--item-s=8', '--wrong-s=8', '--retry-s=8'],
};

function pool(jobs, width) {
  let i = 0; let live = 0;
  return new Promise((resolve) => {
    const next = () => {
      if (i >= jobs.length && live === 0) return resolve();
      while (live < width && i < jobs.length) {
        const job = jobs[i++];
        if (fs.existsSync(job.out)) { console.log(`have ${path.basename(job.out)}`); continue; } // resumes after a pause
        live++; const t = Date.now();
        const p = spawn(process.execPath, [SIM, ...job.args, `--out=${job.out}`], { stdio: 'ignore' });
        p.on('exit', (c) => { live--; console.log(`${c === 0 ? 'done' : 'FAILED'} ${path.relative(OUT, job.out)} ${((Date.now() - t) / 1000).toFixed(0)} s`); next(); });
      }
      if (i >= jobs.length && live === 0) resolve();
      return null;
    };
    next();
  });
}
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

async function run() {
  fs.mkdirSync(OUT, { recursive: true }); const only = flag('only', 'main,gate,sens').split(',');
  const jobs = [];
  const baseJob = (dir, pre, seed, ne, no, extra) => ({ args: [`--seed=${seed}`, `--n-extreme=${ne}`, `--n-ordinary=${no}`, ...COMMON, '--students=1', SELF, ...extra], out: path.join(dir, `${pre}.json`) });
  const armJob = (dir, name, seed, ne, no, extra) => ({ args: [`--seed=${seed}`, `--n-extreme=${ne}`, `--n-ordinary=${no}`, ...COMMON, '--quick=1', `--speed-arms=${armList}`, ...extra], out: path.join(dir, `${name}.json`) });
  if (only.includes('main')) for (const [c, a] of Object.entries(COST)) {
    const dir = path.join(OUT, c); fs.mkdirSync(path.join(dir, 'arms'), { recursive: true });
    jobs.push(baseJob(dir, 'base-design', DESIGN, 60, 20, a));
    HELD.forEach((s, i) => { jobs.push(baseJob(dir, `base-h${i + 1}`, s, 120, 40, a)); jobs.push(armJob(path.join(dir, 'arms'), `h${i + 1}-${s}`, s, 120, 40, a)); });
  }
  if (only.includes('gate')) {
    const dir = path.join(OUT, 'gate'); fs.mkdirSync(dir, { recursive: true });
    for (const s of HELD) { jobs.push({ args: [`--seed=${s}`, ...COMMON, '--quick=1', '--run-salt=noise', `--speed-arms=${OFF}`, ...COST.words], out: path.join(dir, `noise-${s}.json`) }); }
    for (const [name, a] of Object.entries({ kloss50: ['--kloss=0.5'], forget05: ['--forget=0.5'], estsd06: ['--est-sd=0.6'], every3: ['--every=3'], mass10: ['--mass2=0.1'], tight85: ['--tight-gain=0.85'], guess50: ['--guess=0.5'], est15: ['--est-gain=1.5'] })) {
      jobs.push({ args: [`--seed=${HELD[0]}`, ...COMMON, '--quick=1', `--speed-arms=${armList}`, ...COST.words, ...a], out: path.join(dir, `var-${name}.json`) });
    }
  }
  if (only.includes('sens')) for (const [name, a] of Object.entries(SENS)) {
    const dir = path.join(OUT, 'sens', slug(name)); fs.mkdirSync(path.join(dir, 'arms'), { recursive: true });
    const args = [...COST.words, ...a];
    jobs.push(baseJob(dir, 'base-design', DESIGN, 30, 10, args));
    jobs.push(baseJob(dir, 'base-h1', HELD[0], 60, 20, args));
    jobs.push(armJob(path.join(dir, 'arms'), `h1-${HELD[0]}`, HELD[0], 60, 20, args));
  }
  console.log(`${jobs.length} jobs`);
  await pool(jobs, Number(flag('width', 4)));
}

const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sdOf = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const lowQ = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const strict = (a) => !!(a.pass && a.understood === 1);
const pts = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}` : 'n/a');

function compare(sets, on, off) {
  const goals = Object.keys(sets[0].rows[0].goals); const out = {};
  for (const g of goals) {
    const dh = []; const dr = []; const du = []; let sOn = 0; let sOff = 0; let hOn = 0; let hOff = 0; let n = 0;
    for (const set of sets) for (const r of set.rows) { const c = r.goals[g].speed; const a = c[on]; const b = c[off]; dh.push(b.hours - a.hours); dr.push(a.recall - b.recall); du.push(a.understood - b.understood); if (strict(a)) sOn++; if (strict(b)) sOff++; hOn += a.hours; hOff += b.hours; n++; }
    const se = sdOf(dh) / Math.sqrt(n); const m = mean(dh);
    out[g] = { n, hOn: hOn / n, hOff: hOff / n, ci: [m - 1.96 * se, m + 1.96 * se], w1: lowQ(dr, 0.01), w5: lowQ(dr, 0.05), w10: lowQ(dr, 0.1), worst: Math.min(...dr), mean: mean(dr), k1: lowQ(du, 0.01), sOn: sOn / n, sOff: sOff / n };
  }
  return out;
}
function why(cmp, main) {
  const w = []; const gs = Object.entries(cmp);
  if (main) { const sig = gs.filter(([, v]) => v.ci[0] > 0).length; if (sig < 5) w.push(`time beyond noise on only ${sig} of 9`); for (const [g, v] of gs) if (v.ci[1] < 0) w.push(`slower at ${g}`); }
  for (const [g, v] of gs) { const bad = ['w1', 'w5', 'w10'].filter((k) => v[k] < -0.05); if (bad.length) w.push(`recall at ${g}: ${bad.map((k) => `${k} ${pts(v[k])}`).join(', ')}`); if (v.k1 < -0.05) w.push(`knowledge at ${g}: ${pts(v.k1)}`); if (main && v.sOn < v.sOff - 0.01) w.push(`reach at ${g}: ${pts(v.sOn)} against ${pts(v.sOff)}`); }
  return w;
}
function gate() {
  const lines = ['SIMULATED. Held-out seeds 20261121, 20261122 (120 extreme + 40 ordinary each, 320 learners). Off: main with the two plain bug fixes. Costs: words (538 words at 200 wpm, 15 s item). Margins as scripts/speed-gate.js.'];
  const sets = HELD.map((s, i) => load(path.join(OUT, 'words', 'arms', `h${i + 1}-${s}.json`)));
  for (const s of HELD) { const n = load(path.join(OUT, 'gate', `noise-${s}.json`)); const base = sets[HELD.indexOf(s)]; const dr = {}; for (const g of Object.keys(n.rows[0].goals)) { const d = n.rows.map((r, i) => r.goals[g].speed[OFF].recall - base.rows[i].goals[g].speed[OFF].recall); dr[g] = lowQ(d, 0.01); } lines.push(`noise control seed ${s}, the same arm on another random stream, worst 1%: ${Object.entries(dr).map(([g, v]) => `${g} ${pts(v)}`).join('; ')}`); }
  const levers = ['space', 'space + proof + recheck', 'beta set: + one prompt + tight page', 'beta set + mastery stop', 'everything: + test-out, short, worked, one-tap'];
  const out = {};
  for (const lever of levers) {
    const cmp = compare(sets, ARMS[lever], OFF); const w = why(cmp, true);
    lines.push(`\n== ${lever} against off`);
    for (const [g, v] of Object.entries(cmp)) lines.push(`  ${g.padEnd(18)} ${v.hOff.toFixed(1)} > ${v.hOn.toFixed(1)} h (saved ci ${v.ci[0].toFixed(1)} to ${v.ci[1].toFixed(1)}); recall mean ${pts(v.mean)} worst 1/5/10% ${pts(v.w1)} ${pts(v.w5)} ${pts(v.w10)}, single worst ${pts(v.worst)}; knowledge w1 ${pts(v.k1)}; reach ${pts(v.sOn)} vs ${pts(v.sOff)}`);
    lines.push(`  MAIN: ${w.length ? `FAIL: ${w.join('; ')}` : 'PASS'}`);
    const adverse = {};
    for (const f of fs.readdirSync(path.join(OUT, 'gate')).filter((x) => x.startsWith('var-'))) { const name = f.replace(/^var-|\.json$/g, ''); const c = compare([load(path.join(OUT, 'gate', f))], ARMS[lever], OFF); const a = why(c, false); adverse[name] = a; lines.push(`  adverse ${name}: ${a.length ? `FAIL: ${a.join('; ')}` : 'pass'}`); }
    out[lever] = { main: w, adverse };
  }
  const text = lines.join('\n'); console.log(text); fs.writeFileSync(path.join(OUT, 'gate-report.txt'), `${text}\n`); fs.writeFileSync(path.join(OUT, 'gate.json'), JSON.stringify(out, null, 1));
}
module.exports = { ARMS, SENS, COST, HELD, DESIGN };
if (CMD === 'run') run().catch((e) => { console.error(e); process.exit(1); });
else if (CMD === 'gate') gate();
else if (require.main === module) console.log('usage: run OUT | gate OUT');
