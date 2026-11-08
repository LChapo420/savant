#!/usr/bin/env node
/**
 * The whole interval round of docs/UPLOAD-4X.md, one process at a time (no model calls). Held-out seeds and documents; constants frozen on design seed 777005.
 *   node scripts/upload-4x-run.js [OUT_DIR]
 * Writes OUT_DIR/*.json, and docs/upload-4x/{report,gate,sens}.txt.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, '..', '_out', 'upload-4x', 'heldout');
fs.mkdirSync(OUT, { recursive: true });
const SIM = path.join(__dirname, 'upload-4x-sim.js');
const REPORT = path.join(__dirname, 'upload-4x-report.js');
const f = (n) => path.join(OUT, `${n}.json`);
const run = (name, ...extra) => {
  if (fs.existsSync(f(name))) return;
  const t = Date.now();
  execFileSync(process.execPath, [SIM, '--docs=heldout', `--out=${f(name)}`, ...extra], { stdio: 'ignore' });
  console.log(`${name} ${((Date.now() - t) / 1000).toFixed(0)} s`);
};
const MAIN = ['--reps=6'];
run('main-a', '--seed=20261131', ...MAIN);
run('main-b', '--seed=20261132', ...MAIN);
run('noise-a', '--seed=20261131', '--salt=noise', '--no-base', ...MAIN);

const SMALL = ['--seed=20261133', '--n-extreme=60', '--n-ordinary=20', '--reps=4'];
const ADVERSE = { every3: ['--every=3'], forget05: ['--forget=0.5'], forget2: ['--forget=2'], kloss50: ['--kloss=0.5'], fsrs: ['--memory=fsrs'] };
const SENS = {
  base: [], item15: ['--item-s=15'], item25: ['--item-s=25'], item8: ['--item-s=8'], author0: ['--author-s=0'], author60: ['--author-s=60'], wpm150: ['--wpm=150'],
  careful07: ['--careful-wpm=0.7'], readspace025: ['--read-space=0.25'], words3: ['--words-mult=3'], words3item15: ['--words-mult=3', '--item-s=15'], leangain075: ['--lean-gain=0.75'], fsrsitem15: ['--memory=fsrs', '--item-s=15'],
};
for (const [n, a] of Object.entries(ADVERSE)) run(n, ...SMALL, ...a);
for (const [n, a] of Object.entries(SENS)) run(n, ...SMALL, ...a);

const sh = (...a) => execFileSync(process.execPath, [REPORT, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 });
const docs = path.join(ROOT, 'docs', 'upload-4x');
fs.writeFileSync(path.join(docs, 'report.txt'), sh(f('main-a'), f('main-b')));
fs.writeFileSync(path.join(docs, 'gate.txt'), sh('--gate', f('main-a'), f('main-b'), '--noise', `${f('main-a')}=${f('noise-a')}`, ...Object.keys(ADVERSE).flatMap((n) => ['--variant', `${n}=${f(n)}`])));
fs.writeFileSync(path.join(docs, 'sens.txt'), sh('--sens', ...Object.keys(ADVERSE).concat(Object.keys(SENS)).map((n) => `${n}=${f(n)}`)));
console.log('written');
