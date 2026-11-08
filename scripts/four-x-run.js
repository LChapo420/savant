#!/usr/bin/env node
/** The whole four-x held-out round. SIMULATED. Seeds 20261151 and 20261152 were not used while designing or fixing. Writes docs/four-x/report-*.txt and sens.txt. */
'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(__dirname, '..', 'docs', 'four-x');
const TMP = process.env.FOUR_X_TMP || path.join(os.tmpdir(), 'four-x-held');
fs.mkdirSync(TMP, { recursive: true });
const SEEDS = ['20261151', '20261152']; // 20261141/2 were looked at once, which exposed the dated-test eve flaw; these are fresh
const sim = path.join(__dirname, 'four-x-sim.js');
const report = path.join(__dirname, 'four-x-report.js');
const run = (args) => new Promise((res, rej) => execFile(process.execPath, args, { maxBuffer: 1e9 }, (e, out) => (e ? rej(e) : res(out))));
const CONC = Number(process.env.FOUR_X_CONC || 4);

async function pool(jobs) { const out = []; let i = 0; async function worker() { while (i < jobs.length) { const j = i++; out[j] = await jobs[j](); } } await Promise.all(Array.from({ length: CONC }, worker)); return out; }

function merged(files, into) {
  const all = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const o = { ...all[0], seed: SEEDS.join('+'), learners: all.flatMap((a) => a.learners) };
  fs.writeFileSync(into, JSON.stringify(o));
  return into;
}

(async () => {
  const variants = [['measured', '', 'report-measured.txt'], ['textbook', '', 'report-textbook.txt'], ['measured', 'full', 'report-measured-fulldesign.txt'], ['textbook', 'full', 'report-textbook-fulldesign.txt']];
  const jobs = [];
  for (const [density, design] of variants) for (const seed of SEEDS) {
    jobs.push(() => run([sim, `--seed=${seed}`, '--docs=heldout', `--density=${density}`, `--out=${path.join(TMP, `${density}${design}-${seed}.json`)}`, ...(design ? [`--design=${design}`] : [])]));
  }
  await pool(jobs);
  for (const [density, design, name] of variants) {
    const f = merged(SEEDS.map((s) => path.join(TMP, `${density}${design}-${s}.json`)), path.join(TMP, `${density}${design}.json`));
    const out = await run([report, f, '--compact']);
    fs.writeFileSync(path.join(DIR, name), `SIMULATED (held-out seeds ${SEEDS.join(', ')}, documents h1 to h6)\n${out}`);
  }
  // sensitivity: textbook density, 80 learners, seed 20261141
  const rows = [['base', []], ['decay 0.5 (faster forgetting curve)', ['--decay=0.5']], ['MCQ strength x0.7', ['--mcq-mult=0.7']], ['questions 45 s', ['--q-s=45', '--q-review-s=45']], ['key-point page teaches 0.7', ['--core-gain=0.7', '--core-u=0.6']], ['retrieval builds half the understanding', ['--u-mult=0.5']], ['one-line why not faster (25 s)', ['--short-wrong-s=25']], ['key-point page 60 words', ['--core-words=60']], ['WHAT-IF questions 15 s, feedback 8 s (not built, no source)', ['--q-s=15', '--q-review-s=15', '--short-wrong-s=8']], ['WHAT-IF material 5x words per point', ['--words-mult=5']], ['WHAT-IF material 8x words per point', ['--words-mult=8']]];
  const sensJobs = rows.map(([label, a]) => async () => {
    const f = path.join(TMP, `sens-${label.replace(/[^a-z0-9]/gi, '')}.json`);
    await run([sim, '--seed=20261151', '--docs=heldout', '--density=textbook', '--n-extreme=50', '--n-ordinary=30', '--n-sparse=10', '--n-child=10', `--out=${f}`, ...a]);
    return [label, await run([report, f, '--compact', '--goals=1 month,1 year'])];
  });
  const sens = await pool(sensJobs);
  const lines = ['SIMULATED sensitivity, textbook density, held-out seed 20261151, 100 learners.', ''];
  for (const [label, text] of sens) {
    lines.push(`=== ${label}`);
    lines.push(...text.split('\n').filter((l) => /^##|^fastest|vs typical/.test(l)));
    lines.push('');
  }
  fs.writeFileSync(path.join(DIR, 'sens.txt'), lines.join('\n'));
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
