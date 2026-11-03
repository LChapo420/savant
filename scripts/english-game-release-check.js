/**
 * Which patched English game sets can be released from their serving hold?
 *
 *   node scripts/english-game-release-check.js --db data/db.json --rewritten DIR/rewritten.json --out DIR
 *
 * Takes the worktree copy of the data file (read only), applies the re-keys (rekey-confirmed.json) and the passed rewrites in memory,
 * and for every level that is still held and has no rewrite that failed, judges ALL its questions blind with two judges of different
 * families (NVIDIA Nemotron Ultra, then Gemini free tier, or MiniMax M3.1 Flash through xKiro where Gemini is rate-limited: see scripts/lib/english-game-judges.js). A level is released only when every question: has 4 distinct options, passes
 * the explanation-key check or is picked by both judges, and is picked (the key) by BOTH judges. Anything less stays held.
 * Writes DIR/release.json {level: hash} (the hash services/game-fixes.js pins the release to) and DIR/release-report.json.
 * Resumable: per-question picks are kept in DIR/release-picks.json. Question text only; free models only.
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
const DB = arg('db'); const OUT = arg('out'); const REW = arg('rewritten');
if (!DB || !OUT || !REW) { console.error('--db --rewritten --out'); process.exit(2); }
const ka = require('../services/key-agreement');
const fixes = require('../services/game-fixes');
const judges = require('./lib/english-game-judges');

const STAGED = path.join(__dirname, '..', 'curriculum-build', 'staged', 'content-fixes', 'english-games-reaudit');
const pickFile = path.join(OUT, 'release-picks.json');
const picks = fs.existsSync(pickFile) ? JSON.parse(fs.readFileSync(pickFile, 'utf8')) : {};
const save = () => fs.writeFileSync(pickFile, JSON.stringify(picks));
const idOf = (row, q) => `${row}:${q.id}:${fixes.setHash([q])}`;

async function judgeAll(row, qs, which) {
  const todo = qs.filter((q) => (picks[idOf(row, q)] || {})[which] === undefined);
  const batches = [];
  for (let i = 0; i < todo.length; i += 25) batches.push(todo.slice(i, i + 25));
  let at = 0;
  const worker = async () => {
    while (at < batches.length) {
      const b = batches[at++];
      // eslint-disable-next-line no-await-in-loop
      const p = await judges[which](b);
      b.forEach((q, j) => { const k = idOf(row, q); picks[k] = { ...(picks[k] || {}), [which]: p[j] === null ? -1 : p[j], ...(which === 'B' && p.by ? { Bby: p.by } : {}) }; });
      save();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

(async () => {
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const rekey = JSON.parse(fs.readFileSync(path.join(STAGED, 'rekey-confirmed.json'), 'utf8')).rekey;
  const rewrite = JSON.parse(fs.readFileSync(path.join(STAGED, 'rewrite.json'), 'utf8')).rewrite.concat(arg('extra') ? JSON.parse(fs.readFileSync(arg('extra'), 'utf8')).rewrite : []);
  const done = JSON.parse(fs.readFileSync(REW, 'utf8'));
  const report = {}; const release = {};
  const rows = db.game_payloads.filter((r) => r.track_id === 'english' && !r.user_id && !r.verified_replacement);
  for (const row of rows) {
    const failedRewrite = rewrite.filter((w) => w.row === row.id && !done[w.key]);
    if (failedRewrite.length) { report[row.level] = { row: row.id, released: false, why: `${failedRewrite.length} rewrite(s) did not pass` }; continue; }
    const qs = JSON.parse(JSON.stringify(row.payload.questions));
    for (const k of rekey.filter((x) => x.row === row.id)) { const q = qs.find((x) => x.id === k.key.split(':')[1]); if (q) q.answerIndex = k.set.answerIndex; }
    for (const w of rewrite.filter((x) => x.row === row.id)) { const i = qs.findIndex((x) => x.id === w.key.split(':')[1]); const n = done[w.key].question; qs[i] = { ...qs[i], prompt: n.prompt, choices: n.choices, answerIndex: n.answerIndex, explanation: n.explanation }; }
    const code = qs.filter((q) => new Set(q.choices.map((c) => String(c).trim().toLowerCase())).size !== q.choices.length).length;
    if (code) { report[row.level] = { row: row.id, released: false, why: `${code} questions with repeated options` }; continue; }
    // eslint-disable-next-line no-await-in-loop
    await judgeAll(row.id, qs, 'A');
    const aBad = qs.filter((q) => (picks[idOf(row.id, q)] || {}).A !== q.answerIndex);
    if (aBad.length) { report[row.level] = { row: row.id, released: false, why: `judge A disagrees or gave no answer on ${aBad.length} of ${qs.length}` }; continue; }
    // eslint-disable-next-line no-await-in-loop
    await judgeAll(row.id, qs, 'B');
    const bBad = qs.filter((q) => (picks[idOf(row.id, q)] || {}).B !== q.answerIndex);
    if (bBad.length) { report[row.level] = { row: row.id, released: false, why: `judge B disagrees or gave no answer on ${bBad.length} of ${qs.length}` }; continue; }
    const flagged = qs.filter((q) => ka.keyAgreement(q).flagged).length;
    release[row.level] = fixes.setHash(qs);
    report[row.level] = { row: row.id, released: true, questions: qs.length, explanationFlagsJudgedGood: flagged };
    console.log(`level ${row.level} (row ${row.id}): both judges kept all ${qs.length}`);
    fs.writeFileSync(path.join(OUT, 'release.json'), JSON.stringify(release, null, 1));
  }
  fs.writeFileSync(path.join(OUT, 'release.json'), JSON.stringify(release, null, 1));
  fs.writeFileSync(path.join(OUT, 'release-report.json'), JSON.stringify(report, null, 1));
  const why = {};
  for (const r of Object.values(report)) if (!r.released) why[r.why.replace(/\d+/g, 'N')] = (why[r.why.replace(/\d+/g, 'N')] || 0) + 1;
  console.log(JSON.stringify({ candidates: Object.keys(report).length, released: Object.keys(release).length, notReleased: why }));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
