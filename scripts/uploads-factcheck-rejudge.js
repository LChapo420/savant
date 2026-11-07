/**
 * The same judge over the texts from several checkers, so they can be compared like with like.
 *   node scripts/uploads-factcheck-rejudge.js <judge fam:form> <file:tag> [file:tag...]
 */
const fs = require('fs'); const os = require('os'); const path = require('path');
require('../services/run-cap').defaultCap(Number(process.env.RUN_CAP_USD || 2));
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
process.env.GONKA_PIPELINE = '1'; process.env.CORAL_PIPELINE = '1'; process.env.LYCEUM_PIPELINE = '1'; process.env.ZEROGPU_PIPELINE = '1';
for (const [k, f] of [['GONKA', 'gonka'], ['CORAL', 'coral'], ['LYCEUM', 'lyceum'], ['ZEROGPU', 'zerogpu']]) process.env[`${k}_LEDGER_FILE`] = process.env[`${k}_LEDGER_FILE`] || `${LIVE}${f}-ledger.json`;
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-rejudge-${process.pid}.json`);
const J = require('./lib/invented-judges');
const materials = require('../services/materials');
const fx = require('./lib/upload-fixtures');
const docs = [...JSON.parse(fs.readFileSync('docs/uploads-heldout-docs.json', 'utf8')), ...JSON.parse(fs.readFileSync('docs/uploads-factcheck-docs.json', 'utf8'))];
const stripMarks = (t) => t.replace(/^\[\[[^\]]*\]\]\s*$/gm, '').replace(/^#+\s+/gm, '').replace(/\*\*|==/g, '').replace(/^>\s?/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const lessonOnly = (t) => t.split('\n').filter((l) => !l.startsWith('Q: ')).join('\n').replace(/^Key: /gm, '');
(async () => {
  const [fam, form] = process.argv[2].split(':');
  const src = {};
  const results = {};
  for (const spec of process.argv.slice(3)) {
    const [file, tag] = spec.split(':');
    const rows = JSON.parse(fs.readFileSync(file, 'utf8')).rows.filter((r) => r.tag === tag && (!process.env.DOCS || process.env.DOCS.split(',').includes(r.doc)));
    results[tag] = {};
    await J.pool(rows, 4, async (r) => {
      const d = docs.find((x) => x.id === r.doc);
      if (!src[r.doc]) { const ex = await materials.extract(await fx.build(d.fmt, { id: d.id, title: d.title, md: d.md, kps: [] })); src[r.doc] = stripMarks(ex.rich || ex.text); }
      const f = await J.judge(fam, form, src[r.doc], form === 'sent' ? lessonOnly(r.checked) : r.checked);
      results[tag][r.doc] = f;
    });
    const v = Object.values(results[tag]).filter(Boolean);
    console.log(`${tag}: ${Object.keys(results[tag]).sort().map((k) => `${k} ${(results[tag][k] || []).length}`).join(' ')} | mean ${(v.reduce((n, x) => n + x.length, 0) / Math.max(1, v.length)).toFixed(2)}`);
  }
  fs.writeFileSync(path.join(os.tmpdir(), `rejudge-${fam}.json`), JSON.stringify(results));
  console.log('spend', JSON.stringify(J.spend));
  process.exit(0);
})();
