/**
 * Round 2 of the English game rewrite: the questions a blind judge still disagrees with on levels that were close.
 *
 *   node scripts/english-game-round2.js --db data/db.json --dir DIR [--max 5]
 *
 * Reads DIR/release-picks.json and DIR/release-report.json (from english-game-release-check.js), applies the confirmed re-keys in memory,
 * and for every level whose only problem was "judge A or judge B disagrees on at most N questions" lists those questions in DIR/extra.json
 * (same shape as rewrite.json's entries). english-game-rewrite.js and english-game-release-check.js read it with `--extra DIR/extra.json`,
 * so the disagreed question is replaced by a gated rewrite instead of leaving the whole level held. Nothing is released here.
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DB = arg('db'); const DIR = arg('dir'); const MAX = Number(arg('max', 5));
if (!DB || !DIR) { console.error('--db --dir'); process.exit(2); }
const fixes = require('../services/game-fixes');
const STAGED = path.join(__dirname, '..', 'curriculum-build', 'staged', 'content-fixes', 'english-games-reaudit');
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const rekey = JSON.parse(fs.readFileSync(path.join(STAGED, 'rekey-confirmed.json'), 'utf8')).rekey;
const picks = JSON.parse(fs.readFileSync(path.join(DIR, 'release-picks.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(DIR, 'release-report.json'), 'utf8'));
const prev = fs.existsSync(path.join(DIR, 'extra.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'extra.json'), 'utf8')).rewrite : [];
const extra = [...prev];
for (const [level, r] of Object.entries(report)) {
  if (r.released || !/^judge [AB]/.test(r.why)) continue;
  const row = db.game_payloads.find((x) => x.id === r.row);
  const qs = JSON.parse(JSON.stringify(row.payload.questions));
  for (const k of rekey.filter((x) => x.row === row.id)) { const q = qs.find((x) => x.id === k.key.split(':')[1]); if (q) q.answerIndex = k.set.answerIndex; }
  const bad = [];
  qs.forEach((q, qi) => {
    const p = picks[`${row.id}:${q.id}:${fixes.setHash([q])}`] || {};
    if ((p.A !== undefined && p.A !== q.answerIndex) || (p.B !== undefined && p.B !== q.answerIndex)) bad.push({ key: `${row.id}:${q.id}`, row: row.id, level: Number(level), qi, why: 'a blind judge (Nemotron, Gemini or MiniMax) picked a different option, so the question is ambiguous or mis-keyed' });
  });
  if (bad.length && bad.length <= MAX) bad.forEach((b) => { if (!extra.some((e) => e.key === b.key)) extra.push(b); });
}
fs.writeFileSync(path.join(DIR, 'extra.json'), JSON.stringify({ rewrite: extra }, null, 1));
console.log(`extra rewrites: ${extra.length} on ${new Set(extra.map((e) => e.level)).size} levels`);
