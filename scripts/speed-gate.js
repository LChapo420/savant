#!/usr/bin/env node
/**
 * One gate per speed lever (docs/SPEED-4X.md, round 3; SIMULATED, no model calls). Written before any held-out run; the seeds and margins below are not to be changed after reading a result.
 *
 *   node scripts/speed-gate.js run OUT [--main] [--variants] [--noise]    runs the simulation (a small pool of processes)
 *   node scripts/speed-gate.js report OUT [--json=FILE]                   the tables and the verdicts
 *
 * Levers: T test-out, S short lesson (on top of T), M mastery stop, R review target, F fast item, P placement by skill. SPEED_COMPOSITE has no items in any bank, so nothing can be measured. SPEED_IMPLIED and SPEED_EDGE lost in round 2 and are not re-run.
 *
 * Two frames, because the audited "today" is not the app:
 *   real   what the app does in all 219 grades: a lesson page and three check questions, whole levels of 14 answers until the objective is proven (at most 7), then its two retention levels, never stepped over (services/coverage.js, services/learner-path.js compressProven; seen in the browser).
 *          The primary frame: the lever is switched on in the real app, so it is measured against the real app. Round 1 and 2's "today" is the oracle frame.
 *   oracle the audited simulation: practice stops the moment TRUE understanding reaches 0.85, which no app can see. Shown beside it, as in rounds 1 and 2.
 *
 * Comparison: the same learners, the same seed, lever on against lever off (S against T; everything else against none). Held-out seeds 20261108, 20261109, 20261110 (120 extreme + 40 ordinary each, 480 learners), never used before this file.
 *
 * THE GATE, at every one of the nine goals:
 *   Time        mean hours saved > 0 with its paired 95% interval above 0 on at least 5 of 9 goals, and never slower beyond that interval.
 *   Retention   per learner, recall of the course on the day, lever minus off: worst 1%, 5% and 10% all at or above -5 points (the same margin as services/speed-proof.js NONINFERIORITY). The single worst learner is reported beside the noise control.
 *   Knowledge   per learner, share of skills truly understood, lever minus off: worst 1% at or above -5 points; share of learners reaching the target with everything understood not more than 1 point lower.
 *   Adverse     the same retention and knowledge lines hold on each adverse variant named for that lever (the lever's own risk, compared inside the variant, one seed): T, S, P: checks miss 20% of a page, answers teach half until the page is read, easy checks (guess 0.5). M: tracker believes 1.5x the real learning, easy checks. R: a deep lapse costs half of understanding, half-lives x0.5, memory estimates twice as noisy. F has no learning effect to vary; its time saving is ASSUMED (2 s + 2 s) and is listed as such.
 *   Combination the set of passing levers, together, must pass the same gate against none. Every combination of T, S, M, R, F is run so interactions show.
 * Noise control: lever-off against lever-off on another random stream, same learners. Its worst 1%, 5%, 10% and single worst are printed; a margin the noise itself breaks is called out, and never moved.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SIM = path.join(__dirname, 'faster-by-goal-sim.js');
const SEEDS = [20261108, 20261109, 20261110];
const APP_N = 1;
const R_SPEC = 'review=through:margin=0.15:endMargin=0.05';
const LETTER = { T: 'testout=1', S: 'short=1', M: 'stop=1', R: R_SPEC, F: 'fast=1', P: 'place=1', W: 'worked=1', Q: 'quick=1' };
const armSpec = (key, frame) => { const parts = [...key].map((c) => LETTER[c]); if (!parts.length) parts.push('testout=0'); if (frame === 'real') parts.push(`appN=${APP_N}`); return parts.join(':'); };
const COMBOS = (() => { const out = []; for (const t of ['', 'T', 'TS']) for (const m of ['', 'M']) for (const r of ['', 'R']) for (const f of ['', 'F']) out.push(`${t}${m}${r}${f}`); return out; })();
const SINGLES = [['T', ''], ['TS', 'T'], ['M', ''], ['R', ''], ['F', ''], ['P', '']];
const VARIANTS = {
  T: { skip20: ['--skip-loss=0.2'], cold50: ['--cold-gain=0.5'], guess50: ['--guess=0.5'] },
  TS: { skip20: ['--skip-loss=0.2'], cold50: ['--cold-gain=0.5'], guess50: ['--guess=0.5'] },
  P: { skip20: ['--skip-loss=0.2'], cold50: ['--cold-gain=0.5'], guess50: ['--guess=0.5'] },
  M: { est15: ['--est-gain=1.5'], guess50: ['--guess=0.5'] },
  R: { kloss50: ['--kloss=0.5'], forget05: ['--forget=0.5'], estsd06: ['--est-sd=0.6'] },
  F: {},
};
const COMMON = ['--finish=1', '--jit=1', '--final=1', '--quick=1'];
const MARGIN = -0.05;

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const flagVal = (k) => { const m = process.argv.slice(2).find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=').slice(1).join('=') : null; };
const [CMD, OUT] = pos;

function pool(jobs, width = Number(flagVal('width') || 8)) {
  let i = 0; let live = 0;
  return new Promise((resolve) => {
    const next = () => {
      if (i >= jobs.length && live === 0) return resolve();
      while (live < width && i < jobs.length) {
        const job = jobs[i++]; live++;
        const t = Date.now();
        const p = spawn(process.execPath, [SIM, ...job.args, `--out=${job.out}`], { stdio: 'ignore' });
        p.on('exit', (c) => { live--; console.log(`${c === 0 ? 'done' : 'FAILED'} ${path.basename(job.out)} ${((Date.now() - t) / 1000).toFixed(0)} s`); next(); });
      }
      return null;
    };
    next();
  });
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const jobs = [];
  const all = !flags.has('--main') && !flags.has('--variants') && !flags.has('--noise');
  const FRAMES = flagVal('frames') ? flagVal('frames').split(',') : ['real', 'oracle'];
  const main = (frame, seed, keys, name) => ({ args: [...COMMON, `--seed=${seed}`, `--speed-arms=${keys.map((k) => armSpec(k, frame)).join(',')}`], out: path.join(OUT, `${name}.json`) });
  if (all || flags.has('--main')) {
    const keys = [...new Set([...COMBOS, 'P'])];
    for (const frame of FRAMES) for (const seed of SEEDS) jobs.push(main(frame, seed, keys, `main-${frame}-${seed}`));
  }
  if (all || flags.has('--noise')) for (const frame of FRAMES) for (const seed of SEEDS) jobs.push({ args: [...COMMON, `--seed=${seed}`, '--run-salt=noise', `--speed-arms=${armSpec('', frame)}`], out: path.join(OUT, `noise-${frame}-${seed}.json`) });
  if (all || flags.has('--variants')) {
    const seen = new Set();
    for (const [lever, vs] of Object.entries(VARIANTS)) for (const [name, a] of Object.entries(vs)) {
      const id = name; if (seen.has(id)) continue; seen.add(id);
      jobs.push({ args: [...COMMON, `--seed=${SEEDS[0]}`, ...a, `--speed-arms=${['', 'T', 'TS', 'M', 'R', 'F', 'P'].map((k) => armSpec(k, 'real')).join(',')}`], out: path.join(OUT, `var-${name}-${SEEDS[0]}.json`) });
    }
  }
  console.log(`${jobs.length} jobs`);
  await pool(jobs);
}

// ---------- report ----------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sdOf = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const lowQ = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pts = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}` : 'n/a');
const load = (OUTF) => JSON.parse(fs.readFileSync(OUTF, 'utf8'));
const strict = (a) => !!(a.pass && a.understood === 1);

function compare(rowsSets, onKey, offKey, frame, { arm = armSpec } = {}) {
  const goals = Object.keys(rowsSets[0].rows[0].goals);
  const out = { goals: {} };
  for (const g of goals) {
    const dh = []; const dr = []; const du = []; const dmin = []; let strictOn = 0; let strictOff = 0; let hOn = 0; let hOff = 0; let n = 0; let slowest = -Infinity;
    for (const set of rowsSets) for (const r of set.rows) {
      const c = r.goals[g].speed; const on = c[arm(onKey, frame)]; const off = c[arm(offKey, frame)];
      if (!on || !off) throw new Error(`missing arm ${onKey} or ${offKey}`);
      dh.push(off.hours - on.hours); dr.push(on.recall - off.recall); du.push(on.understood - off.understood); dmin.push((Number.isFinite(on.minRecall) ? on.minRecall : 0) - (Number.isFinite(off.minRecall) ? off.minRecall : 0));
      if (strict(on)) strictOn++; if (strict(off)) strictOff++; hOn += on.hours; hOff += off.hours; n++;
      slowest = Math.max(slowest, on.hours / off.hours);
    }
    const se = sdOf(dh) / Math.sqrt(n); const m = mean(dh);
    out.goals[g] = {
      n, hOn: hOn / n, hOff: hOff / n, saved: m, ci: [m - 1.96 * se, m + 1.96 * se], savedPct: m / (hOff / n),
      ret: { w1: lowQ(dr, 0.01), w5: lowQ(dr, 0.05), w10: lowQ(dr, 0.1), worst: Math.min(...dr), mean: mean(dr) },
      know: { w1: lowQ(du, 0.01), w5: lowQ(du, 0.05), w10: lowQ(du, 0.1), worst: Math.min(...du) },
      minRecall: { w1: lowQ(dmin, 0.01), mean: mean(dmin) },
      strictOn: strictOn / n, strictOff: strictOff / n, slowestRatio: slowest,
    };
  }
  return out;
}
function verdict(cmp) {
  const gs = Object.entries(cmp.goals); const why = [];
  const sigSaved = gs.filter(([, v]) => v.ci[0] > 0).length;
  const sigSlower = gs.filter(([, v]) => v.ci[1] < 0).map(([g]) => g);
  if (sigSaved < 5) why.push(`time: saved beyond noise on only ${sigSaved} of 9 goals`);
  if (sigSlower.length) why.push(`time: slower at ${sigSlower.join(', ')}`);
  for (const [g, v] of gs) {
    const bad = ['w1', 'w5', 'w10'].filter((k) => v.ret[k] < MARGIN);
    if (bad.length) why.push(`retention at ${g}: ${bad.map((k) => `${k} ${pts(v.ret[k])}`).join(', ')} pts`);
    if (v.know.w1 < MARGIN) why.push(`knowledge at ${g}: worst 1% ${pts(v.know.w1)} pts`);
    if (v.strictOn < v.strictOff - 0.01) why.push(`reach with all understood at ${g}: ${pts(v.strictOn)} against ${pts(v.strictOff)}`);
  }
  return why;
}
function adverseVerdict(cmp) { const why = []; for (const [g, v] of Object.entries(cmp.goals)) { const bad = ['w1', 'w5', 'w10'].filter((k) => v.ret[k] < MARGIN); if (bad.length) why.push(`retention at ${g}: ${bad.map((k) => `${k} ${pts(v.ret[k])}`).join(', ')}`); if (v.know.w1 < MARGIN) why.push(`knowledge at ${g}: worst 1% ${pts(v.know.w1)}`); if (v.strictOn < v.strictOff - 0.01) why.push(`reach all understood at ${g}: ${pts(v.strictOn)} vs ${pts(v.strictOff)}`); } return why; }

function report() {
  const lines = ['SIMULATED. Held-out seeds 20261108, 20261109, 20261110. Hours are means per learner. Retention and knowledge in points, lever minus off, per learner.'];
  const res = { simulated: true, frames: {}, adverse: {}, noise: {} };
  for (const frame of ['real', 'oracle']) {
    const sets = SEEDS.map((s) => load(path.join(OUT, `main-${frame}-${s}.json`)));
    const noise = SEEDS.map((s) => load(path.join(OUT, `noise-${frame}-${s}.json`)));
    lines.push(`\n========== frame: ${frame} ==========`);
    // noise: lever-off against lever-off on another stream
    const nz = { goals: {} };
    for (const g of Object.keys(sets[0].rows[0].goals)) {
      const dr = []; const dh = []; const du = [];
      sets.forEach((set, si) => set.rows.forEach((r, ri) => { const a = r.goals[g].speed[armSpec('', frame)]; const b = noise[si].rows[ri].goals[g].speed[armSpec('', frame)]; dr.push(b.recall - a.recall); dh.push(a.hours - b.hours); du.push(b.understood - a.understood); }));
      nz.goals[g] = { ret: { w1: lowQ(dr, 0.01), w5: lowQ(dr, 0.05), w10: lowQ(dr, 0.1), worst: Math.min(...dr) }, know: { w1: lowQ(du, 0.01), worst: Math.min(...du) }, hoursMean: mean(dh), hoursW1: lowQ(dh, 0.01) };
    }
    res.noise[frame] = nz;
    lines.push('noise control (off against off, another random stream): retention worst 1 / 5 / 10% / single worst, knowledge worst 1%, hours');
    for (const [g, v] of Object.entries(nz.goals)) lines.push(`  ${g.padEnd(20)} ${pts(v.ret.w1)} / ${pts(v.ret.w5)} / ${pts(v.ret.w10)} / ${pts(v.ret.worst)}   ${pts(v.know.w1)}   ${f(v.hoursMean)} h`);
    res.frames[frame] = { singles: {}, combos: {} };
    for (const [on, off] of SINGLES) {
      const c = compare(sets, on, off, frame); const v = verdict(c);
      res.frames[frame].singles[on] = { off, cmp: c, why: v };
      lines.push(`\n--- ${on}${off ? ` against ${off}` : ''}: ${v.length ? `FAILS main (${v.length})` : 'passes main'}`);
      lines.push('  goal                  off h   on h    saved (95%)         ret w1/w5/w10/worst        know w1   reach all understood on/off');
      for (const [g, x] of Object.entries(c.goals)) lines.push(`  ${g.padEnd(20)} ${f(x.hOff, 1).padStart(6)} ${f(x.hOn, 1).padStart(6)}  ${f(x.saved)} (${f(x.ci[0])}, ${f(x.ci[1])})`.padEnd(58) + `${pts(x.ret.w1)}/${pts(x.ret.w5)}/${pts(x.ret.w10)}/${pts(x.ret.worst)}`.padEnd(28) + `${pts(x.know.w1)}`.padEnd(9) + `${(100 * x.strictOn).toFixed(0)}/${(100 * x.strictOff).toFixed(0)}%`);
      if (v.length) lines.push(`  why: ${v.slice(0, 8).join('; ')}${v.length > 8 ? ' ...' : ''}`);
    }
    lines.push('\n--- every combination against none (hours at 1 week / 1 month / 1 year / no test day; passes or not)');
    for (const key of COMBOS.filter(Boolean)) {
      const c = compare(sets, key, '', frame); const v = verdict(c);
      res.frames[frame].combos[key] = { cmp: c, why: v };
      const G = c.goals;
      lines.push(`  ${key.padEnd(6)} ${f(G['horizon 1 week'].hOn, 1)} / ${f(G['horizon 1 month'].hOn, 1)} / ${f(G['horizon 1 year'].hOn, 1)} / ${f(G['no test day (3 y)'].hOn, 1)}  ${v.length ? `fails (${v.length}): ${v[0]}` : 'passes'}`);
    }
    const off = compare(sets, 'T', '', frame).goals;
    lines.push(`  (none: ${f(off['horizon 1 week'].hOff, 1)} / ${f(off['horizon 1 month'].hOff, 1)} / ${f(off['horizon 1 year'].hOff, 1)} / ${f(off['no test day (3 y)'].hOff, 1)})`);
  }
  lines.push('\n========== adverse variants (frame real, seed 20261108, lever against off inside the variant) ==========');
  for (const [lever, vs] of Object.entries(VARIANTS)) {
    const base = SINGLES.find((s) => s[0] === lever);
    for (const name of Object.keys(vs)) {
      const set = load(path.join(OUT, `var-${name}-${SEEDS[0]}.json`));
      const c = compare([set], lever, base[1], 'real'); const v = adverseVerdict(c);
      res.adverse[`${lever}:${name}`] = { cmp: c, why: v };
      const G = c.goals; lines.push(`  ${lever.padEnd(3)} ${name.padEnd(9)} ${v.length ? `FAILS (${v.length}): ${v.slice(0, 3).join('; ')}` : 'holds'}  (1 yr: saved ${f(G['horizon 1 year'].saved)} h, ret worst 1% ${pts(G['horizon 1 year'].ret.w1)}, reach ${(100 * G['horizon 1 year'].strictOn).toFixed(0)}/${(100 * G['horizon 1 year'].strictOff).toFixed(0)}%)`);
    }
  }
  lines.push('\n========== verdicts (primary frame: real) ==========');
  for (const [lever] of SINGLES) {
    const main = res.frames.real.singles[lever].why; const adv = Object.keys(VARIANTS[lever] || {}).flatMap((n) => res.adverse[`${lever}:${n}`].why.map((w) => `${n}: ${w}`));
    res.frames.real.singles[lever].passes = !main.length && !adv.length;
    lines.push(`  ${lever.padEnd(3)} ${!main.length && !adv.length ? 'PASS' : 'FAIL'}  main problems ${main.length}, adverse problems ${adv.length}. (oracle frame: ${res.frames.oracle.singles[lever].why.length ? `fails, ${res.frames.oracle.singles[lever].why.length}` : 'passes'})`);
  }
  console.log(lines.join('\n'));
  const jsonOut = flagVal('json'); if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(res));
}

/**
 * The levers built after the first gate (W worked examples, Q one-tap reviews): the same margins, a seed never used before (20261111), and their effect at the low, middle and high end of the published range.
 * W: seconds per example 35 / 26 / 20, teaching 0.5 / 0.75 / 1 of a right answer. Q: seconds per review question 25 / 15 / 10. Low end means the lever hardly works; the gate must hold there too on retention.
 */
const EXTRA_SEED = 20261111;
const RANGE = { low: ['--we-s=35', '--we-gain=0.5', '--quick-s=25'], mid: ['--we-s=26', '--we-gain=0.75', '--quick-s=15'], high: ['--we-s=20', '--we-gain=1', '--quick-s=10'] };
const EXTRA_KEYS = ['', 'F', 'W', 'Q', 'WF', 'QF', 'WQF', 'MWQF', 'TSMRF', 'TSMRWQF'];
async function runExtra() {
  fs.mkdirSync(OUT, { recursive: true });
  const jobs = Object.entries(RANGE).map(([name, a]) => ({ args: [...COMMON, `--seed=${EXTRA_SEED}`, ...a, `--speed-arms=${EXTRA_KEYS.map((k) => armSpec(k, 'real')).join(',')}`], out: path.join(OUT, `extra-${name}.json`) }));
  jobs.push({ args: [...COMMON, `--seed=${EXTRA_SEED}`, '--run-salt=noise', `--speed-arms=${armSpec('', 'real')}`], out: path.join(OUT, 'extra-noise.json') });
  for (const [name, a] of Object.entries({ guess50: ['--guess=0.5'], cold50: ['--cold-gain=0.5'], kloss50: ['--kloss=0.5'] })) jobs.push({ args: [...COMMON, `--seed=${EXTRA_SEED}`, ...RANGE.mid, ...a, `--speed-arms=${['', 'W', 'Q'].map((k) => armSpec(k, 'real')).join(',')}`], out: path.join(OUT, `extra-var-${name}.json`) });
  await pool(jobs);
}
function reportExtra() {
  const lines = ['SIMULATED. Held-out seed 20261111, 160 learners, frame real. Lever against off, per learner.'];
  const res = {};
  for (const name of Object.keys(RANGE)) {
    const set = load(path.join(OUT, `extra-${name}.json`));
    lines.push(`\n--- range: ${name} (${RANGE[name].join(' ')})`);
    for (const [on, off] of [['W', ''], ['Q', ''], ['WF', 'F'], ['QF', 'F'], ['WQF', 'F'], ['MWQF', ''], ['TSMRWQF', '']]) {
      const c = compare([set], on, off, 'real'); const v = verdict(c); res[`${name}:${on}`] = { why: v, cmp: c };
      const G = c.goals; lines.push(`  ${on.padEnd(8)} vs ${(off || 'none').padEnd(5)} ${v.length ? `FAILS (${v.length})` : 'passes'}  1 wk ${f(G['horizon 1 week'].hOff, 1)}>${f(G['horizon 1 week'].hOn, 1)} h ret w1 ${pts(G['horizon 1 week'].ret.w1)}; 1 mo ${f(G['horizon 1 month'].hOn, 1)} h ${pts(G['horizon 1 month'].ret.w1)}; 1 yr ${f(G['horizon 1 year'].hOff, 1)}>${f(G['horizon 1 year'].hOn, 1)} h ${pts(G['horizon 1 year'].ret.w1)}; first problem: ${v[0] || 'none'}`);
    }
  }
  const mid = load(path.join(OUT, 'extra-mid.json')); const noise = load(path.join(OUT, 'extra-noise.json'));
  lines.push('\n--- noise control, off against off: retention worst 1 / 5 / 10%');
  for (const g of Object.keys(mid.rows[0].goals)) { const d = mid.rows.map((r, i) => noise.rows[i].goals[g].speed[armSpec('', 'real')].recall - r.goals[g].speed[armSpec('', 'real')].recall); lines.push(`  ${g.padEnd(20)} ${pts(lowQ(d, 0.01))} / ${pts(lowQ(d, 0.05))} / ${pts(lowQ(d, 0.1))}`); }
  lines.push('\n--- adverse variants, middle of the range, lever against off inside the variant');
  for (const name of ['guess50', 'cold50', 'kloss50']) { const set = load(path.join(OUT, `extra-var-${name}.json`)); for (const [on] of [['W'], ['Q']]) { const c = compare([set], on, '', 'real'); const v = adverseVerdict(c); res[`var:${name}:${on}`] = { why: v }; lines.push(`  ${on} ${name.padEnd(8)} ${v.length ? `FAILS (${v.length}): ${v.slice(0, 2).join('; ')}` : 'holds'}`); } }
  console.log(lines.join('\n'));
}

if (CMD === 'extra') runExtra();
else if (CMD === 'extra-report') reportExtra();
else if (CMD === 'run') run();
else if (CMD === 'report') report();
else console.log('usage: speed-gate.js run|report OUT');
