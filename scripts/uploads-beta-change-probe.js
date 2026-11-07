/**
 * One real change through the real pool, on a real built course in a throwaway database, with the refusal's reasons printed: the quick loop for making changes fast and right. Written documents, synthetic learner.
 *   node scripts/uploads-beta-change-probe.js <doc> <part kind: lesson|q|note|card|summary> <change> [topic]
 */
const fs = require('fs'); const os = require('os'); const path = require('path');

require('../services/run-cap').defaultCap(Number(process.env.RUN_CAP_USD || 1));
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env', quiet: true });
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/';
for (const [k, f] of [['GONKA', 'gonka'], ['MUNITO', 'munito'], ['CORAL', 'coral'], ['GROKIFIED', 'grokified'], ['LYCEUM', 'lyceum'], ['ZEROGPU', 'zerogpu']]) process.env[`${k}_LEDGER_FILE`] = process.env[`${k}_LEDGER_FILE`] || `${LIVE}${f}-ledger.json`;
process.env.ANTHROPIC_API_KEY = '';
for (const k of Object.keys(process.env)) if (/^MODELFLARE/.test(k)) process.env[k] = '';
process.env.NODE_ENV = 'development';
process.env.UPLOAD_PARTS = 'on'; process.env.UPLOAD_PARTS_LOG = '1'; process.env.UPLOAD_OPTIMIZE = process.env.UPLOAD_OPTIMIZE || 'on';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-beta-probe-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
const db = require('../config/db');
const materials = require('../services/materials');
const L = require('./lib/uploads-beta-lib');
const P = require('../services/material-parts');

(async () => {
  const [docId, kind, change, topic] = process.argv.slice(2);
  const c = L.load(path.join(L.OUT_DIR, 'courses', `${docId}.json`));
  const u = db.insert('users', { email: `probe${process.pid}@example.test`, display_name: 'P', password_hash: 'x', xp: 0, streak: 0, onboarded: true, age_check: { birth_ym: '2000-01' }, subscription: 'pro' });
  const m = materials.addPaste(u.id, c.title, c.plain).value;
  db.update('materials', m.id, { key_points: c.key_points });
  db.insert('material_courses', { ...c.course, id: undefined, user_id: u.id, material_id: m.id, status: 'ready' });
  const s = c.course.skills[0];
  db.insert('material_notes', { user_id: u.id, material_id: m.id, status: 'ready', sections: [{ id: 'n1', heading: 'Main points', bullets: s.lesson.paragraphs.slice(0, 3).map((t) => ({ text: t, passage_id: null, quote: t.slice(0, 40) })) }] });
  db.insert('material_packs', { user_id: u.id, material_id: m.id, status: 'ready', summary: s.lesson.paragraphs.slice(0, 2), cards: [{ id: 'c1', front: s.questions[0].prompt, back: s.questions[0].explanation, quote: '' }], quiz: [], test: [] });
  const ref = kind === 'lesson' ? `lesson:${s.id}` : kind === 'q' ? `q:${s.id}:${s.questions[0].id}` : kind === 'note' ? 'note:n1' : kind === 'card' ? 'packcard:c1' : kind;
  const orig = require('../services/ai').structuredDetail;
  const calls = [];
  require('../services/ai').structuredDetail = async (a) => { const t = Date.now(); try { const r = await orig(a); calls.push(`${a.task} ${r && r.model} ${Date.now() - t}ms`); return r; } catch (e) { calls.push(`${a.task} FAILED ${String(e.message).slice(0, 80)} ${Date.now() - t}ms`); throw e; } };
  const t0 = Date.now();
  const r = await require('../services/material-autobuild').runWaiting(() => P.change(u.id, m.id, ref, change, { topic, custom: change === 'custom' ? 'put it as short steps' : undefined, debug: true }));
  console.log('took', Date.now() - t0, 'ms; changed', r.changed, r.message || '', r.error || '');
  console.log(calls.join('\n'));
  if (r.report) console.log('report', JSON.stringify(r.report).slice(0, 800));
  console.log('before:', JSON.stringify(P.baseOf(u.id, m.id, ref).leaves.slice(0, 2)).slice(0, 500));
  if (r.part) console.log('after:', JSON.stringify(r.part).slice(0, 900));
  process.exit(0);
})();
