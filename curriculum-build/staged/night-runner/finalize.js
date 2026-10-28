/**
 * End-of-night summary (no model calls):
 *   1. games-night: a regenerated game whose only set problem is the answer-slot balance
 *      ("the answer sits in one slot N% of the time": MiniMax put most keys first) gets its
 *      options re-ordered so the keys spread over the slots. Only the ORDER of each
 *      question's options changes (the key's text and every option's text stay the same);
 *      both judges answered blind, so their verdicts do not depend on the order. The
 *      game checker (inspectPayload) is run again; the row is complete only if it passes.
 *   2. state/final-summary.json: tokens per model and job, kept/written per job, per grade.
 *   node curriculum-build/staged/night-runner/finalize.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SP = 'C:/Users/admin/AppData/Local/Temp/claude/C--coding-claudecommittdIq-folderThing/34e6f487-b3f5-4acd-899c-244171ef0427/scratchpad';
process.env.DB_FILE = path.join(SP, 'db-copy.json');
process.env.DB_READONLY = '1';
for (const k of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY']) process.env[k] = '';
const games = require(path.join(ROOT, 'services', 'game-payloads.js'));

const G = path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'games-night');
const rebalanced = [];
for (const f of fs.readdirSync(G).filter((x) => /^game-\d+\.json$/.test(x))) {
  const file = path.join(G, f);
  const g = JSON.parse(fs.readFileSync(file, 'utf8'));
  const probs = g.stats.set_problems || [];
  if (g.stats.complete || g.stats.kept < g.payload.questions.length || !probs.length || !probs.every((p) => /one slot/.test(p))) continue;
  const schema = games.schemaFor(g.engine_id);
  const qs = g.payload.questions.map((q, i) => {
    const n = q.choices.length;
    const target = i % n;
    if (q.answerIndex === target) return q;
    const choices = q.choices.slice();
    [choices[q.answerIndex], choices[target]] = [choices[target], choices[q.answerIndex]];
    return { ...q, choices, answerIndex: target };
  });
  // the key's text is unchanged for every question
  const sameKeys = qs.every((q, i) => q.choices[q.answerIndex] === g.payload.questions[i].choices[g.payload.questions[i].answerIndex]);
  const after = games.inspectPayload({ questions: qs }, schema);
  if (sameKeys && !after.length) {
    if (!g.original_order) g.original_order = g.payload.questions.map((q) => ({ id: q.id, choices: q.choices, answerIndex: q.answerIndex }));
    g.payload.questions = qs;
    g.stats.set_problems = [];
    g.stats.complete = true;
    g.stats.rebalanced = 'options re-ordered so the keys spread over the slots (texts unchanged; judges answered blind)';
    fs.writeFileSync(file, JSON.stringify(g, null, 1));
    rebalanced.push(g.row_id);
  } else rebalanced.push(`${g.row_id}: still ${after.join('; ')}`);
}
// games report again
const rows = [];
for (const f of fs.readdirSync(G).filter((x) => /^game-\d+\.json$/.test(x))) {
  const g = JSON.parse(fs.readFileSync(path.join(G, f), 'utf8'));
  rows.push({ row_id: g.row_id, engine_id: g.engine_id, level: g.level, written: g.stats.written, kept: g.stats.kept, complete: g.stats.complete, set_problems: g.stats.set_problems, rebalanced: !!g.stats.rebalanced, models_b: g.stats.judges.models_b });
}
rows.sort((a, b) => a.row_id - b.row_id);
fs.writeFileSync(path.join(G, 'report.json'), JSON.stringify({ generated_at: new Date().toISOString(), applied: false, rows_done: rows.length, complete: rows.filter((r) => r.complete).length, complete_rows: rows.filter((r) => r.complete).map((r) => r.row_id), written: rows.reduce((s, r) => s + r.written, 0), kept: rows.reduce((s, r) => s + r.kept, 0), rows }, null, 1));

// summary
const st = path.join(__dirname, 'state');
const tokens = JSON.parse(fs.readFileSync(path.join(st, 'tokens.json'), 'utf8'));
const perModel = {};
const perJob = {};
for (const [job, ms] of Object.entries(tokens)) {
  for (const [m, r] of Object.entries(ms)) {
    const t = (r.input || 0) + (r.output || 0);
    perModel[m] = (perModel[m] || 0) + t;
    perJob[job] = perJob[job] || {};
    perJob[job][m] = { tokens: t, calls: r.calls, cached: r.cached, failed: r.failed };
  }
}
const xku = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'xkiro-usage.json'), 'utf8'));
const night = xku['2026-10-24'] || {};
const obj = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'staged', 'adaptation', 'objective-items-night', 'report.json'), 'utf8'));
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'night-audit', 'summary.json'), 'utf8'));
const rw = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'staged', 'content-fixes', 'rewrites', 'report.json'), 'utf8'));
const out = {
  at: new Date().toISOString(),
  minimax_grant_used_total: Object.entries(xku).filter(([k]) => !k.startsWith('_')).reduce((s, [, d]) => s + ((d['minimax/minimax-m3.1-flash'] && (d['minimax/minimax-m3.1-flash'].input + d['minimax/minimax-m3.1-flash'].output)) || 0), 0),
  xkiro_today: night,
  tokens_per_model_usable_answers: perModel,
  tokens_per_job: perJob,
  objectives: { total: obj.total, grades: obj.grades },
  games: { rebalanced, rows_done: rows.length, complete_rows: rows.filter((r) => r.complete).map((r) => r.row_id), incomplete: rows.filter((r) => !r.complete).map((r) => ({ row: r.row_id, kept: r.kept, problems: r.set_problems })), written: rows.reduce((s, r) => s + r.written, 0), kept: rows.reduce((s, r) => s + r.kept, 0) },
  audit,
  rewrites: rw,
};
fs.writeFileSync(path.join(st, 'final-summary.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, tokens_per_job: undefined, objectives: { total: obj.total } }, null, 1));
