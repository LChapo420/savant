/**
 * Live run of the Spanish write-ahead (services/spanish/unit-writer.js) on real units, free models only, into a scratch store.
 *
 *   node scripts/spanish-write-ahead-live.js --out DIR [--units g6:Unit 6.1,g28:Unit 28.1,...]
 *
 * For each unit: ensure() (writer = NVIDIA DeepSeek flash / GLM flash, checks = blind Nemotron Ultra re-solve of every keyed
 * item + native-speaker review), timed. Then it audits the stored result:
 *   - the stored record says status 'checked' and every keyed item left in it still has its key;
 *   - a SECOND blind judge (Gemini free tier, a different family) re-solves every kept keyed item: agreement rate;
 *   - load() serves nothing that is not 'checked' (a planted draft, a half-written file, and a wrong status are skipped);
 *   - path.supports() is false for a level whose unit is not stored.
 * Curriculum text only; no learner data. SPANISH_UNIT_DIR points at DIR, never at the app's store. SPANISH_WRITE_AHEAD is set
 * on for this process only; the default in the code is untouched.
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
const OUT = arg('out');
if (!OUT) { console.error('--out DIR'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
process.env.SPANISH_UNIT_DIR = path.join(OUT, 'spanish-units');
process.env.SPANISH_WRITE_AHEAD = 'on';
process.env.DB_FILE = path.join(OUT, 'scratch-db.json');

const curriculum = require('../config/curriculum');
const writer = require('../services/spanish/unit-writer');
const esPath = require('../services/spanish/path');
const judges = require('./lib/english-game-judges');

const grades = curriculum.getTrack('spanish').grades;
// Two units per band: low (grades 6, 7), middle (25, 26) and high (50, 51); the first unit of the grade and a later one.
const plan = arg('units')
  ? arg('units').split(',').map((s) => { const [g, u] = s.split(':'); return [grades[Number(g.slice(1)) - 1].id, u]; })
  : [[6, 0], [7, 2], [25, 0], [26, 2], [50, 0], [51, 2]].map(([n, k]) => {
    const g = curriculum.getGrade('spanish', grades[n - 1].id);
    const labels = [...new Set(g.levels.map((l) => l.unit).filter((u) => /^Unit \d+\.\d+$/.test(u)))];
    return [grades[n - 1].id, labels[Math.min(k, labels.length - 1)]];
  });

(async () => {
  const report = { units: [], notes: [] };
  for (const [gradeId, unit] of plan) {
    const grade = curriculum.getGrade('spanish', gradeId);
    const levels = grade.levels.filter((l) => l.unit === unit).length;
    const t0 = Date.now();
    let stored = null; let err = null;
    try { stored = await writer.ensure(gradeId, unit, { force: true, attempts: 2 }); } catch (e) { err = e.message; }
    const secs = (Date.now() - t0) / 1000;
    const row = { grade: gradeId, gradeNo: grades.findIndex((g) => g.id === gradeId) + 1, unit, levels, seconds: Math.round(secs), stored: !!stored, secondsPerLevel: Math.round(secs / Math.max(1, levels)), error: err };
    if (stored) {
      const file = path.join(OUT, 'spanish-units', `g${row.gradeNo}`, `${unit.replace(/^Unit\s+/, '').replace('.', '_')}.json`);
      const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
      row.status = rec.status; row.checks = rec.checks;
      // The kept keyed items, re-solved blind by the second judge.
      const items = writer.keyedItems({ fills: rec.unit.fills, chats: rec.unit.chats, reads: rec.unit.reads, scene: rec.unit.scene, phrases: rec.unit.phrases });
      const picks = await judges.B(items);
      const keyIdx = items.map((q) => q.choices.indexOf(q.answer));
      row.secondJudge = { items: items.length, agreed: picks.filter((p, i) => p === keyIdx[i]).length, disagreed: picks.filter((p, i) => p !== null && p !== keyIdx[i]).length, unanswered: picks.filter((p) => p === null).length };
      row.kept = { phrases: rec.unit.phrases.length, fills: rec.unit.fills.length, chats: rec.unit.chats.length, reads: rec.unit.reads.length, convo: !!rec.unit.convo, sceneLines: rec.unit.scene.lines.length };
    }
    report.units.push(row);
    console.log(JSON.stringify(row));
    fs.writeFileSync(path.join(OUT, 'write-ahead-live.json'), JSON.stringify(report, null, 1));
  }

  // Nothing unchecked is served: plant a draft, a half-written file and a record with another status, and load() must skip them.
  const root = writer.storeDir();
  const plant = path.join(root, 'g99');
  fs.mkdirSync(plant, { recursive: true });
  const good = report.units.find((u) => u.stored);
  const goodRec = good && JSON.parse(fs.readFileSync(path.join(root, `g${good.gradeNo}`, `${good.unit.replace(/^Unit\s+/, '').replace('.', '_')}.json`), 'utf8'));
  if (goodRec) {
    fs.writeFileSync(path.join(plant, '1_1.json'), JSON.stringify({ ...goodRec, status: 'draft' }));
    fs.writeFileSync(path.join(plant, '1_2.json'), JSON.stringify(goodRec).slice(0, 400));
    fs.writeFileSync(path.join(plant, '1_3.json'), JSON.stringify({ unit: goodRec.unit }));
  }
  const loaded = writer.load();
  report.noUncheckedServed = {
    stored_checked_files: report.units.filter((u) => u.stored).length,
    loaded: loaded.length,
    plantedServed: Math.max(0, loaded.length - report.units.filter((u) => u.stored).length),
  };
  // A level in a unit that is not stored (grade 8's first unit) is not supported: it goes to the ordinary session.
  const g8 = grades[7].id;
  const g8lvl = curriculum.getGrade('spanish', g8).levels.find((l) => /^Unit \d+\.\d+$/.test(l.unit) && !report.units.some((u) => u.grade === g8 && u.unit === l.unit));
  report.unwrittenLevelSupported = g8lvl ? esPath.supports(g8, g8lvl.level) : null;
  // Every served stored unit passed: the checked units are the only ones registered beyond the shipped grades 1-4.
  const ok = report.units.filter((u) => u.stored);
  report.summary = {
    attempted: report.units.length, stored: ok.length,
    secondsPerUnitMean: ok.length ? Math.round(ok.reduce((a, u) => a + u.seconds, 0) / ok.length) : null,
    secondsPerLevelMean: ok.length ? Math.round(ok.reduce((a, u) => a + u.secondsPerLevel, 0) / ok.length) : null,
    secondJudgeAgree: ok.reduce((a, u) => a + u.secondJudge.agreed, 0), secondJudgeItems: ok.reduce((a, u) => a + u.secondJudge.items, 0),
    secondJudgeDisagree: ok.reduce((a, u) => a + u.secondJudge.disagreed, 0),
  };
  fs.writeFileSync(path.join(OUT, 'write-ahead-live.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ summary: report.summary, noUncheckedServed: report.noUncheckedServed, unwrittenLevelSupported: report.unwrittenLevelSupported }));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
