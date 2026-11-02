/**
 * Re-audit of the English game answer keys (subjects audit gap 10, 2 Nov 2026).
 *
 *   node scripts/english-game-key-audit.js --db COPY.json --out DIR [--limit N]          judge every question blind, twice
 *   node scripts/english-game-key-audit.js --db COPY.json --out DIR --apply              also write the re-keyed copy and count again
 *
 * Reads a COPY of data/db.json (never the live one; nothing is written to it). Every multiple-choice question of every
 * English game (game_payloads, track english) goes through:
 *   1. the code checks: distinct options, services/key-agreement.js (the explanation describes the keyed option);
 *   2. a blind answer from judge A (NVIDIA Nemotron Ultra, services/key-gate.js) and judge B (NVIDIA GLM 5.3), neither shown the
 *      key or the explanation.
 * A question is counted wrong when it has duplicate options, or when BOTH judges pick the same other option, or when the explanation
 * flag is raised and one judge picks another option. Fix: when both judges pick the same other option (and the explanation, if it
 * points anywhere, points there too), the key is moved to it (staged in DIR/rekey.json); a question with duplicate options or no
 * agreed answer is listed for a rewrite. --apply applies the re-keys to the copy and counts again: that is the "after" count.
 * Only question text goes to the judges. Needs NVIDIA_API_KEY (read from the .env by dotenv; never printed).
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
const DB = arg('db'); const OUT = arg('out'); const APPLY = argv.includes('--apply'); const LIMIT = Number(arg('limit', 0));
if (!DB || !OUT) { console.error('--db COPY.json --out DIR'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const ka = require('../services/key-agreement');
const keyGate = require('../services/key-gate');
const nvidia = require('../services/providers/nvidia');

const SYSTEM = 'You answer multiple-choice questions for a school course. For each question, work it out yourself and give the index (0-based) of the one option you believe is correct. If no option or more than one is correct, still give your best pick. You are not told the answer key.';
const SCHEMA = { type: 'object', properties: { picks: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' } }, required: ['index', 'chosen_index'] } } }, required: ['picks'] };
async function judgeB(batch) {
  const user = `${batch.map((q, i) => `Question ${i}: ${q.prompt}\n${q.choices.map((c, j) => `  (${j}) ${c}`).join('\n')}`).join('\n\n')}\n\nReturn one pick per question, with its index.`;
  const r = await nvidia.structured({ role: 'check', system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_picks', maxTokens: 3000, models: [{ model: 'z-ai/glm-5.3', effort: 'medium' }], timeoutMs: 240000, attempts: 2 });
  const by = new Map(((r && r.data && r.data.picks) || []).map((p) => [p.index, p.chosen_index]));
  return batch.map((_, i) => (Number.isInteger(by.get(i)) ? by.get(i) : null));
}
async function retry(fn, batch) {
  for (let a = 0; a < 3; a++) {
    try { const p = await fn(batch); if (p.some((x) => x !== null)) return p; } catch { /* retry */ }
    await new Promise((r) => { setTimeout(r, 4000 * (a + 1)); });
  }
  return batch.map(() => null);
}

async function judgeAll(items, tag) {
  const file = path.join(OUT, `picks-${tag}.json`);
  const done = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const todo = items.filter((it) => !(it.key in done));
  const BATCH = 12; const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  let at = 0; let n = 0;
  const worker = async () => {
    while (at < batches.length) {
      const b = batches[at++];
      const q = b.map((it) => ({ prompt: it.prompt, choices: it.choices }));
      // eslint-disable-next-line no-await-in-loop
      const [a, c] = await Promise.all([retry(keyGate.nemotronJudge, q), retry(judgeB, q)]);
      b.forEach((it, i) => { done[it.key] = [a[i], c[i]]; });
      n += 1;
      if (n % 5 === 0) { fs.writeFileSync(file, JSON.stringify(done)); process.stdout.write(`\r${tag}: ${n}/${batches.length} batches`); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  fs.writeFileSync(file, JSON.stringify(done));
  process.stdout.write('\n');
  return done;
}

function collect(db) {
  const items = [];
  for (const g of db.game_payloads.filter((x) => x.track_id === 'english')) {
    (g.payload.questions || []).forEach((q, i) => {
      if (!Array.isArray(q.choices)) return;
      items.push({ key: `${g.id}:${q.id || i}`, row: g.id, level: g.level, qi: i, prompt: String(q.prompt || ''), choices: q.choices.map(String), q });
    });
  }
  return LIMIT ? items.slice(0, LIMIT) : items;
}

function classify(items, picks) {
  const out = { total: items.length, wrong: [], rekey: [], rewrite: [], unjudged: 0, flagged: 0, dup: 0 };
  for (const it of items) {
    const q = it.q; const key = ka.keyIndexOf(q); const flag = ka.keyAgreement(q);
    const dup = new Set(it.choices.map((c) => c.trim().toLowerCase())).size < it.choices.length;
    const [a, b] = picks[it.key] || [null, null];
    if (flag.flagged) out.flagged += 1;
    if (dup) out.dup += 1;
    if (a === null && b === null) out.unjudged += 1;
    const bothOther = a !== null && a === b && a !== key;
    const oneOther = ((a !== null && a !== key) || (b !== null && b !== key)) && flag.flagged;
    if (!(dup || bothOther || oneOther)) continue;
    const rec = { key: it.key, row: it.row, level: it.level, qi: it.qi, keyIndex: key, judgeA: a, judgeB: b, flagged: flag.flagged, dup, pointsTo: flag.pointsTo };
    out.wrong.push(rec);
    if (!dup && bothOther && (flag.pointsTo === null || flag.pointsTo === a)) out.rekey.push({ ...rec, set: { answerIndex: a } });
    else out.rewrite.push(rec);
  }
  return out;
}

(async () => {
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const items = collect(db);
  console.log(`${items.length} English game questions in ${new Set(items.map((i) => i.row)).size} games`);
  const picks = await judgeAll(items, 'before');
  const before = classify(items, picks);
  fs.writeFileSync(path.join(OUT, 'before.json'), JSON.stringify(before, null, 1));
  fs.writeFileSync(path.join(OUT, 'rekey.json'), JSON.stringify({ note: 'staged, not applied: re-key to the option both blind judges pick; rewrite = duplicate options or no agreed answer', rekey: before.rekey, rewrite: before.rewrite }, null, 1));
  console.log('BEFORE', { total: before.total, wrong: before.wrong.length, rekey: before.rekey.length, rewrite: before.rewrite.length, flagged: before.flagged, dup: before.dup, unjudged: before.unjudged });
  if (!APPLY) return;
  // After: re-key the copy; the judges' blind answers do not depend on the key, so the same picks are scored against the new key.
  const rows = new Map(db.game_payloads.map((g) => [g.id, g]));
  for (const r of before.rekey) { const q = rows.get(r.row).payload.questions[r.qi]; q.answerIndex = r.set.answerIndex; if (q.answer !== undefined) delete q.answer; }
  fs.writeFileSync(path.join(OUT, 'db-rekeyed.json'), JSON.stringify(db));
  const after = classify(collect(db), picks);
  fs.writeFileSync(path.join(OUT, 'after.json'), JSON.stringify(after, null, 1));
  console.log('AFTER', { total: after.total, wrong: after.wrong.length, rekey: after.rekey.length, rewrite: after.rewrite.length, flagged: after.flagged, dup: after.dup });
})();
