#!/usr/bin/env node
/**
 * Round 4 (docs/speed-real/ROUND4.md): runs scripts/speed-r4-walk.js over many grades and synthetic learners, one process at a time, and adds up where the answers and the words go.
 *   node scripts/speed-r4-ledger.js run OUT [--set=design|heldout] [--grades=N] [--kinds=weak,mid,strong,expert,random] [--lessons=8] [--db=COPY] [--env=A=on,B=on] [--width=2]
 *   node scripts/speed-r4-ledger.js report OUT [--page-wpm=200] [--item-s=15] [--wrong-s=12] [--screen-s=6]
 * Counted from the real routes (MEASURED); right and wrong come from the v2 model (SIMULATED); seconds are ASSUMED and printed with the table.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=').slice(1).join('=') : d; };
const [CMD, OUT] = pos;

function gradesFor(set, nPerTrack) {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'speed-real', 'r4', 'composition.json'), 'utf8'));
  const out = [];
  for (const t of [...new Set(rows.map((r) => r.track))]) {
    if (t === 'spanish') continue; // its own player (services/spanish/path.js): not walked here
    const g = rows.filter((r) => r.track === t && r.held_out === (set === 'heldout'));
    const step = Math.max(1, Math.floor(g.length / nPerTrack));
    for (let i = 0; i < g.length && out.filter((x) => x.startsWith(`${t}/`)).length < nPerTrack; i += step) out.push(`${t}/${g[i].grade}`);
  }
  return out;
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const set = flag('set', 'design'); const grades = gradesFor(set, Number(flag('grades', 2)));
  const kinds = flag('kinds', 'weak,mid,strong,expert,random').split(',');
  const jobs = []; let seed = set === 'heldout' ? 910000 : 410000;
  for (const g of grades) for (const k of kinds) jobs.push({ g, k, seed: ++seed });
  let i = 0; let live = 0; const width = Number(flag('width', 2));
  await new Promise((resolve) => {
    const next = () => {
      if (i >= jobs.length && live === 0) return resolve();
      while (live < width && i < jobs.length) {
        const j = jobs[i++]; live++;
        const file = path.join(OUT, `${j.g.replace('/', '-')}-${j.k}-${j.seed}.json`);
        const a = [path.join(__dirname, 'speed-r4-walk.js'), `--grade=${j.g}`, `--seed=${j.seed}`, `--kind=${j.k}`, `--lessons=${flag('lessons', 8)}`, `--out=${file}`];
        if (flag('db')) a.push(`--db=${flag('db')}`);
        if (flag('env')) a.push(`--env=${flag('env')}`);
        const c = spawn(process.execPath, a, { stdio: 'ignore' });
        const timer = setTimeout(() => c.kill(), 240000);
        c.on('exit', () => { clearTimeout(timer); live--; next(); });
      }
    };
    next();
  });
  console.log(`ran ${jobs.length} walks on ${grades.length} grades into ${OUT}`);
}

function report() {
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.json'));
  const PAGE_WPM = Number(flag('page-wpm', 200)); const ITEM_S = Number(flag('item-s', 15)); const WRONG_S = Number(flag('wrong-s', 12)); const SCREEN_S = Number(flag('screen-s', 6));
  const sinks = { lesson_page: 0, lesson_checks: 0, practice_ordinary: 0, game: 0, retention_ordinary: 0, retention_page: 0, checkpoint: 0, level_screens: 0 };
  const count = { answers: {}, levels: {}, words: 0, lessons: 0, repeats: 0, repeatsAfterRight: 0, answersTotal: 0, stay: 0 };
  const perKind = {}; const stretches = []; const serv = {};
  let walks = 0; let errs = 0;
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); walks++; errs += d.errors.length;
    const pk = (perKind[d.kind] = perKind[d.kind] || { lessons: 0, answers: 0, levels: 0, retAnswers: 0, right: 0, stay: 0, unproven: 0, stretches: 0, provenAt: [] });
    for (const [k, a] of Object.entries(d.server_ms)) (serv[k] = serv[k] || []).push(...a);
    for (const r of d.levels) {
      const secItems = r.answers * ITEM_S + (r.answers - r.right) * WRONG_S;
      const bucket = r.kind === 'lesson' ? 'lesson_checks' : r.retention ? (r.route === 'session' ? 'retention_ordinary' : 'retention_page') : r.kind === 'practice' ? (r.route === 'session' ? 'practice_ordinary' : 'game') : 'checkpoint';
      sinks[bucket] += secItems;
      if (r.page_words) { const s = (r.page_words / PAGE_WPM) * 60; if (r.retention) sinks.retention_page += s; else sinks.lesson_page += s; if (r.kind === 'lesson') count.words += r.page_words; }
      sinks.level_screens += SCREEN_S;
      count.answers[bucket] = (count.answers[bucket] || 0) + r.answers; count.levels[bucket] = (count.levels[bucket] || 0) + 1;
      count.answersTotal += r.answers; count.repeats += r.repeats; count.repeatsAfterRight += r.repeatsAfterRight;
      if (r.kind === 'lesson') { count.lessons++; pk.lessons++; }
      if (r.advanced === false) { count.stay++; pk.stay++; }
      pk.answers += r.answers; pk.right += r.right; pk.levels++; if (r.retention) pk.retAnswers += r.answers;
    }
    for (const s of d.stretches || []) { stretches.push({ kind: d.kind, ...s }); pk.stretches++; if (!s.provenAfterLevels) pk.unproven++; else pk.provenAt.push(s.provenAfterLevels); }
  }
  const tot = Object.values(sinks).reduce((a, b) => a + b, 0);
  const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(p * (b.length - 1))] : null; };
  const lines = [];
  lines.push(`walks ${walks}, lessons ${count.lessons}, answers ${count.answersTotal}, errors ${errs}. Costs ASSUMED: page ${PAGE_WPM} wpm, item ${ITEM_S} s, miss +${WRONG_S} s, level close screen ${SCREEN_S} s.`);
  lines.push('stage | minutes per lesson | share | answers per lesson | levels per lesson');
  for (const [k, v] of Object.entries(sinks).sort((a, b) => b[1] - a[1])) lines.push(`${k} | ${(v / 60 / Math.max(1, count.lessons)).toFixed(1)} | ${(100 * v / tot).toFixed(0)}% | ${((count.answers[k] || 0) / Math.max(1, count.lessons)).toFixed(1)} | ${((count.levels[k] || 0) / Math.max(1, count.lessons)).toFixed(2)}`);
  lines.push(`total minutes per lesson ${(tot / 60 / Math.max(1, count.lessons)).toFixed(1)}; lesson page median words per lesson (mean) ${(count.words / Math.max(1, count.lessons)).toFixed(0)}`);
  lines.push(`near-repeat questions (same stem, numbers aside, earlier in this stretch): ${(100 * count.repeats / Math.max(1, count.answersTotal)).toFixed(0)}% of answers; after that stem was answered right: ${(100 * count.repeatsAfterRight / Math.max(1, count.answersTotal)).toFixed(0)}%. Stay-on-level sittings: ${count.stay}.`);
  lines.push('by learner: kind | stretches | answers per lesson | right | share of answers in retention levels | proven within first N levels of the stretch: median, p90 | stretches never proven on the walk | stay-on-level');
  for (const [k, p] of Object.entries(perKind)) lines.push(`${k} | ${p.stretches} | ${(p.answers / Math.max(1, p.lessons)).toFixed(0)} | ${(100 * p.right / Math.max(1, p.answers)).toFixed(0)}% | ${(100 * p.retAnswers / Math.max(1, p.answers)).toFixed(0)}% | ${q(p.provenAt, 0.5)}, ${q(p.provenAt, 0.9)} | ${p.unproven} | ${p.stay}`);
  lines.push('server, real routes in process on a stripped database (MEASURED, this PC under other load):');
  for (const [k, a] of Object.entries(serv)) lines.push(`  ${k}: n ${a.length}, p50 ${q(a, 0.5)} ms, p95 ${q(a, 0.95)} ms, max ${Math.max(...a)} ms`);
  const text = lines.join('\n'); console.log(text);
  if (flag('txt')) fs.writeFileSync(flag('txt'), `${text}\n`);
}

if (CMD === 'run') run().catch((e) => { console.error(e); process.exit(1); });
else if (CMD === 'report') report();
else console.log('usage: run OUT | report OUT');
