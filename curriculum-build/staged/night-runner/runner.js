/**
 * The night's job runner (2026-10-24). One process runs every queued job at once, all
 * sharing the paced lanes in core.js, so MiniMax stays busy while judge B is rate-limited.
 * Resumable: every model answer is cached and every finished unit is on disk, so a restart
 * (supervise.js restarts it on a crash) carries on where it stopped.
 *
 *   node curriculum-build/staged/night-runner/supervise.js     (what runs overnight)
 *   node curriculum-build/staged/night-runner/runner.js [--jobs=objectives,games,audit,rewrites,skills]
 *
 * Status: state/status.json (every minute), runner.log, and an hourly line in the Log of
 * curriculum-build/NIGHT-2026-10-24.md. Writes only under curriculum-build/staged/ (and
 * the providers' usage records in data/*-usage.json). Never opens data/db.json: jobs read
 * a scratch copy. Build pipeline only.
 */
const fs = require('fs');
const path = require('path');
const core = require('./core');

const { ROOT, STATE, log } = core;
const SP = 'C:/Users/admin/AppData/Local/Temp/claude/C--coding-claudecommittdIq-folderThing/34e6f487-b3f5-4acd-899c-244171ef0427/scratchpad';
const DB_COPY = process.env.NIGHT_DB_COPY || path.join(SP, 'db-copy.json');
const UNITS = process.env.NIGHT_UNITS || path.join(SP, 'units.json');
process.env.DB_FILE = DB_COPY; // anything that opens config/db.js gets the copy, read-only
process.env.DB_READONLY = '1';
if (path.resolve(DB_COPY) === path.join(ROOT, 'data', 'db.json')) { console.error('refusing: the DB must be a copy'); process.exit(2); }
require('./redact').load(DB_COPY);

const argv = process.argv.slice(2);
const opt = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const JOBS = opt('jobs', 'placement,objectives,games,audit,rewrites,skills').split(',');
const LIMIT = Number(opt('limit', 0));

const jobs = {
  placement: require('./job-placement'),
  objectives: require('./job-objectives'),
  games: require('./job-games'),
  audit: require('./job-audit'),
  rewrites: require('./job-rewrites'),
  skills: require('./job-skills'),
};

const started = Date.now();
const finished = {};
function status() {
  const xk = require(path.join(ROOT, 'services', 'providers', 'xkiro.js'));
  const t = core.tally;
  const mmTotal = Object.values(t).reduce((s, j) => s + ((j[core.MM] && (j[core.MM].input + j[core.MM].output)) || 0), 0);
  return {
    at: new Date().toISOString(), up_minutes: Math.round((Date.now() - started) / 60000), pid: process.pid,
    minimax_tokens_by_this_runner: mmTotal, minimax_grant_used_total: xk.grantTokensUsed(core.MM),
    lanes: core.laneStatus(),
    source_checks: require('./source-check').stats,
    totals_all_runs: diskTotals(),
    jobs: { placement: jobs.placement.stats, objectives: jobs.objectives.stats, games: jobs.games.stats, audit: jobs.audit.stats, rewrites: jobs.rewrites.stats },
    finished, tokens: t,
  };
}
function writeStatus() { try { core.saveTally(); core.saveWriters(); fs.writeFileSync(path.join(STATE, 'status.json'), JSON.stringify(status(), null, 1)); } catch (err) { log(`status: ${err.message}`); } }
setInterval(writeStatus, 60000).unref();

// Totals over every run, read from what is on disk (the jobs' own result files), so the hourly
// line's counters survive restarts (before 14:10 UTC they were this run's counters and reset).
const STAGED = path.join(ROOT, 'curriculum-build', 'staged');
function jsonl(file) { const m = new Map(); try { for (const l of fs.readFileSync(file, 'utf8').split('\n')) { if (!l.trim()) continue; try { const r = JSON.parse(l); m.set(r.objective || r.uid, r); } catch { /* torn line */ } } } catch { /* none yet */ } return [...m.values()]; }
function diskTotals() {
  const t = { objectives: { done: 0, written: 0, kept: 0 }, games: { rows_done: 0, written: 0, kept: 0 }, audit: { answered_blind: 0, wrong_both_judges: 0, sourced: 0, lessons: 0 } };
  try {
    for (const r of jsonl(path.join(STAGED, 'adaptation', 'objective-items-night', 'results.jsonl'))) { t.objectives.done++; t.objectives.written += r.written || 0; t.objectives.kept += (r.items || []).length; }
    const gd = path.join(STAGED, 'content-fixes', 'games-night');
    for (const f of fs.readdirSync(gd).filter((x) => /^game-\d+\.json$/.test(x))) { try { const g = JSON.parse(fs.readFileSync(path.join(gd, f), 'utf8')); t.games.rows_done++; t.games.written += g.stats.written || 0; t.games.kept += g.stats.kept || 0; } catch { /* */ } }
    const { corroborate } = require('./corroborate');
    for (const r0 of jsonl(path.join(STAGED, 'content-fixes', 'night-audit', 'results.jsonl'))) {
      if (r0.kind === 'prose') { t.audit.lessons++; continue; }
      const r = corroborate(r0);
      t.audit.answered_blind++;
      if (/^(both judges call it wrong|confirmed wrong)/.test(r.outcome || '')) t.audit.wrong_both_judges++;
      if (/^confirmed wrong/.test(r.outcome || '')) t.audit.sourced++;
    }
  } catch (err) { log(`totals: ${err.message}`); }
  return t;
}

// hourly progress line in the night file's Log
const NIGHT = path.join(ROOT, 'curriculum-build', 'NIGHT-2026-10-24.md');
const HOURLY = path.join(STATE, 'hourly.json');
// every 5 minutes: kept items so far (all runs) for the throughput measurement
const THROUGHPUT = path.join(STATE, 'throughput.jsonl');
setInterval(() => {
  try {
    const d = diskTotals();
    const w = core.writerReport();
    const keptNew = Object.values(w).reduce((x, r) => x + (r.kept || 0), 0);
    const writtenNew = Object.values(w).reduce((x, r) => x + (r.written || 0), 0);
    fs.appendFileSync(THROUGHPUT, `${JSON.stringify({ at: new Date().toISOString(), objectives_kept: d.objectives.kept, objectives_written: d.objectives.written, games_kept: d.games.kept, games_rows: d.games.rows_done, audit_blind: d.audit.answered_blind, pool_kept: keptNew, pool_written: writtenNew })}\n`);
  } catch (err) { log(`throughput: ${err.message}`); }
}, 5 * 60000).unref();
function hourly() {
  try {
    let last = {};
    try { last = JSON.parse(fs.readFileSync(HOURLY, 'utf8')); } catch { /* */ }
    if (last.at && Date.now() - Date.parse(last.at) < 55 * 60000) return;
    const s = status();
    const T = s.totals_all_runs; const o = T.objectives; const g = T.games; const a = T.audit;
    const prev = last.totals || null;
    const keptNow = o.kept + g.kept;
    const hours = last.at ? (Date.now() - Date.parse(last.at)) / 3600000 : 0;
    const rate = prev && hours > 0.5 ? ` Kept since the last line: ${keptNow - (prev.objectives.kept + prev.games.kept)} items (${Math.round((keptNow - (prev.objectives.kept + prev.games.kept)) / hours)} an hour).` : '';
    const wr = Object.entries(s.lanes.writers || {}).filter(([, r]) => r.written).map(([m, r]) => `${m} ${r.kept}/${r.written}${r.on ? '' : ' (off)'}`).join(', ');
    const perModel = {};
    for (const j of Object.values(s.tokens)) for (const [m, r] of Object.entries(j)) { perModel[m] = (perModel[m] || 0) + r.input + r.output; }
    const top = Object.entries(perModel).filter(([, v]) => v).map(([m, v]) => `${m.replace(/^B:/, '')} ${(v / 1e6).toFixed(2)}M`).join(', ');
    const line = `- **${s.at.slice(11, 16)} UTC (night runner, automatic):** MiniMax grant used ${(s.minimax_grant_used_total / 1e6).toFixed(2)}M in all (${(s.minimax_tokens_by_this_runner / 1e6).toFixed(2)}M by the runner). Totals over all runs (from the result files): objectives ${o.done}/${s.jobs.objectives.objectives} done, ${o.kept} questions kept of ${o.written} written; games ${g.rows_done}/${s.jobs.games.rows - 2} rows regenerated (${g.kept} kept of ${g.written} written), samples re-judged ${s.jobs.games.samples_rejudged}/2; audit ${a.answered_blind}/${s.jobs.audit.questions} answered blind, ${a.wrong_both_judges} wrong by both judges (${a.sourced} sourced), lessons ${a.lessons}/5. Rewrites ${s.jobs.rewrites.done}/${s.jobs.rewrites.rows}.${rate} Kept/written by writer since 14:10: ${wr || 'none yet'}. Tokens by model: ${top}. Status: curriculum-build/staged/night-runner/state/status.json.\n`;
    fs.appendFileSync(NIGHT, line);
    fs.writeFileSync(HOURLY, JSON.stringify({ at: new Date().toISOString(), totals: T }));
  } catch (err) { log(`hourly: ${err.message}`); }
}
setInterval(hourly, 5 * 60000).unref();
// the audit's section in CONTENT-FACT-AUDIT.md, kept current (every 30 min)
setInterval(() => { try { jobs.audit.writeOutputs(); require('./audit-section').write(); } catch (err) { log(`audit section: ${err.message}`); } }, 30 * 60000).unref();

process.on('unhandledRejection', (err) => { log(`unhandled: ${err && (err.stack || err.message)}`); });

(async () => {
  log(`runner: start pid ${process.pid}, jobs ${JOBS.join(',')}, MiniMax concurrency ${core.mm.limit}/${core.mm.max}`);
  writeStatus();
  const run = {
    placement: () => jobs.placement.run(),
    // 14:10 UTC: more units in flight, so the free pool's writer lanes stay busy beside MiniMax
    objectives: () => jobs.objectives.run({ workers: Number(process.env.OBJ_WORKERS || 36), limit: LIMIT, maxBPending: Number(process.env.OBJ_MAX_B_PENDING || 400) }),
    games: () => jobs.games.run({ dbCopy: DB_COPY, workers: Number(process.env.GAME_WORKERS || 6) }),
    audit: () => jobs.audit.run({ unitsFile: UNITS, workers: Number(process.env.AUDIT_WORKERS || 4) }),
    rewrites: () => jobs.rewrites.run({ dbCopy: DB_COPY, workers: 2 }),
    skills: () => jobs.skills.run(),
  };
  await Promise.all(JOBS.map((j) => run[j]().then(() => { finished[j] = new Date().toISOString(); }).catch((err) => { finished[j] = `error: ${err.message}`; log(`job ${j} failed: ${err.stack || err.message}`); })));
  writeStatus();
  const fatal = core.mm.fatal;
  log(`runner: all jobs returned${fatal ? ` (MiniMax stopped: ${fatal})` : ''}`);
  // exit 0 = done (the supervisor stops); 3 = some job errored, run again for what is left
  process.exit(Object.values(finished).some((v) => /^error/.test(v)) && !fatal ? 3 : 0);
})();
