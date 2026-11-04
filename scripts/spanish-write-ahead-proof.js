/**
 * Proof that a Spanish level is written ahead in under 60 seconds (services/spanish/unit-writer.js ahead(), on by default).
 *
 *   node scripts/spanish-write-ahead-proof.js --out DIR [--levels g6:1,g28:1,g51:1] [--limit-s 60]
 *
 * For each grade:level it empties a scratch store (SPANISH_UNIT_DIR = DIR/spanish-units, DB_FILE = DIR/scratch-db.json: a copy, never the
 * app's data), calls ahead(gradeId, level) exactly as the path does when a learner opens a level, and times it until every unit it
 * writes is stored. Then it audits each stored unit: status 'checked', the counts kept, and an independent blind judge (Lyceum Qwen 3.8,
 * a third family; the writer is DeepSeek, the runtime solver Gemini first) re-solving every kept keyed item. Writer and checks go through Coral and Gonka
 * (owner credits, ledger-capped; set CORAL_LEDGER_FILE / GONKA_LEDGER_FILE to the live ledgers); curriculum text only, never learner data.
 * Exit 0 when every level finished under the limit with every unit stored.
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
require('dotenv').config({ path: process.env.ENV_FILE || 'C:/coding/claudecommittdIq/folderThing/.env' });
const OUT = arg('out');
const LIMIT = Number(arg('limit-s', 60));
if (!OUT) { console.error('--out DIR'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
process.env.SPANISH_UNIT_DIR = path.join(OUT, 'spanish-units');
process.env.DB_FILE = path.join(OUT, 'scratch-db.json');
delete process.env.SPANISH_WRITE_AHEAD; // the default is what is proven

const curriculum = require('../config/curriculum');
const writer = require('../services/spanish/unit-writer');
process.env.LYCEUM_PIPELINE = '1';
const { lyceum } = require('../services/providers/lyceum');

const grades = curriculum.getTrack('spanish').grades;
const plan = (arg('levels', 'g6:1,g28:1,g51:1')).split(',').map((s) => { const [g, l] = s.split(':'); return { gradeId: grades[Number(g.slice(1)) - 1].id, gradeNo: Number(g.slice(1)), level: Number(l) }; });

/** A third family (Qwen; the writer is DeepSeek, the runtime solver Gemini first) re-solves every kept keyed item blind. */
async function auditPicks(items) {
  const NL = String.fromCharCode(10);
  const user = items.map((q, i) => `Question ${i}: ${q.prompt}${NL}${q.choices.map((c, j) => `  (${j}) ${c}`).join(NL)}`).join(NL + NL) + NL + NL + 'Return one pick per question, with its index.';
  const schema = { type: 'object', properties: { picks: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, chosen_index: { type: 'integer' } }, required: ['index', 'chosen_index'] } } }, required: ['picks'] };
  try {
    const r = await lyceum.structured({ system: 'You answer multiple-choice questions for a school course. Work each out yourself and give the 0-based index of the one option you believe is correct. You are not told the key.', user, schema, schemaName: 'submit_picks', maxTokens: 6000, model: 'qwen/qwen3.8-2.4t-a95b', timeoutMs: 120000 });
    const by = new Map(r.data.picks.map((x) => [x.index, x.chosen_index]));
    return items.map((_, i) => (Number.isInteger(by.get(i)) ? by.get(i) : null));
  } catch { return items.map(() => null); }
}

(async () => {
  const report = { limit_s: LIMIT, levels: [] };
  let allOk = true;
  for (const { gradeId, gradeNo, level } of plan) {
    fs.rmSync(process.env.SPANISH_UNIT_DIR, { recursive: true, force: true });
    const labels = writer.unitsAhead(gradeId, level);
    const t0 = Date.now();
    let err = null;
    try { await writer.ahead(gradeId, level); } catch (e) { err = e.message; }
    const seconds = (Date.now() - t0) / 1000;
    const row = { grade: gradeId, gradeNo, level, units_wanted: labels, units_stored: labels.filter((u) => writer.isStored(gradeId, u)), seconds: Number(seconds.toFixed(1)), error: err, units: [] };
    for (const u of row.units_stored) {
      const file = path.join(process.env.SPANISH_UNIT_DIR, `g${gradeNo}`, `${u.replace(/^Unit\s+/, '').replace('.', '_')}.json`);
      const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
      const items = writer.keyedItems({ fills: rec.unit.fills, chats: rec.unit.chats, reads: rec.unit.reads, scene: rec.unit.scene, phrases: rec.unit.phrases });
      const picks = await auditPicks(items);
      const keyIdx = items.map((q) => q.choices.indexOf(q.answer));
      row.units.push({
        unit: u, status: rec.status, checks: rec.checks,
        kept: { phrases: rec.unit.phrases.length, fills: rec.unit.fills.length, chats: rec.unit.chats.length, reads: rec.unit.reads.length, convo: !!rec.unit.convo, sceneLines: rec.unit.scene.lines.length },
        second_judge: { by: 'lyceum qwen/qwen3.8-2.4t-a95b', items: items.length, agreed: picks.filter((p, i) => p === keyIdx[i]).length, disagreed: picks.filter((p, i) => p !== null && p !== keyIdx[i]).length, unanswered: picks.filter((p) => p === null).length },
      });
    }
    row.ok = !err && labels.length > 0 && row.units_stored.length === labels.length && seconds < LIMIT && row.units.every((u) => u.status === 'checked');
    if (!row.ok) allOk = false;
    report.levels.push(row);
    console.log(JSON.stringify({ grade: gradeId, level, seconds: row.seconds, wanted: labels.length, stored: row.units_stored.length, ok: row.ok }));
    fs.writeFileSync(path.join(OUT, 'write-ahead-proof.json'), JSON.stringify(report, null, 1));
  }
  report.all_ok = allOk;
  fs.writeFileSync(path.join(OUT, 'write-ahead-proof.json'), JSON.stringify(report, null, 1));
  console.log(allOk ? 'PASS: every level written ahead under the limit' : 'FAIL: see write-ahead-proof.json');
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
