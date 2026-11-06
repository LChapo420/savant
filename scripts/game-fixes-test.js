/**
 * Shipped fixes to stored shared game sets (services/game-fixes.js): re-keys, rewrites, hash-pinned release; idempotent.
 *   node scripts/game-fixes-test.js
 * Also checks the shipped fix file against its staged sources (content/game-fixes/english-proficient.json).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `game-fixes-test-${process.pid}.json`);
// Windows reuses process ids: an old run's file under this name would add its rows to this run's.
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none there */ }
delete process.env.GAME_HOLDS;
const db = require('../config/db');
const fixes = require('../services/game-fixes');
const games = require('../services/game-payloads');

let failed = 0; let passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL ${name}${detail !== '' ? ` -- ${JSON.stringify(detail).slice(0, 300)}` : ''}`); } };

const qs = () => [0, 1, 2].map((i) => ({ id: `q${i + 1}`, prompt: `Prompt ${i + 1}?`, choices: ['a', 'b', 'c', 'd'], answerIndex: i, explanation: 'e' }));
const holds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'game-holds.json'), 'utf8')).holds;
const L = holds[holds.length - 1].level;
const row = db.insert('game_payloads', { user_id: null, engine_id: holds[holds.length - 1].engine_id, track_id: 'english', grade_id: 'proficient', level: L, payload: { schemaVersion: 1, questions: qs() }, problems: [], serving_hold: { reason: 'test' } });

(async () => {
  const neu = { prompt: 'New prompt?', choices: ['w', 'x', 'y', 'z'], answerIndex: 2, explanation: 'y is right' };
  const fix = { source: 'test', track_id: 'english', grade_id: 'proficient', rekeys: [{ level: L, qid: 'q1', from: 0, to: 3 }, { level: L, qid: 'q2', from: 2, to: 3 }], rewrites: [{ level: L, qid: 'q3', old_prompt: 'Prompt 3?', question: neu }], release: [] };
  let r = fixes.applyFile(fix);
  check('re-key applied; a key that is neither from nor to is left alone and reported', r.rekeyed === 1 && r.conflicts.length === 1, r);
  const got = db.byId('game_payloads', row.id).payload.questions;
  check('q1 re-keyed to 3, q2 (conflict) untouched', got[0].answerIndex === 3 && got[1].answerIndex === 1, got.map((q) => q.answerIndex));
  check('q3 rewritten, id kept', got[2].prompt === 'New prompt?' && got[2].id === 'q3' && got[2].answerIndex === 2);
  r = fixes.applyFile(fix);
  check('idempotent: a second run changes nothing', r.rekeyed === 0 && r.rewritten === 0, r);
  // a second rewrite that keeps the prompt and changes only the options and key (eng-r3, 2026-11-03: 10 levels stayed held over this)
  const same = { prompt: 'New prompt?', choices: ['w', 'x2', 'y2', 'z'], answerIndex: 0, explanation: 'w is right' };
  r = fixes.applyFile({ ...fix, rekeys: [], rewrites: [{ level: L, qid: 'q3', old_prompt: 'New prompt?', question: same }] });
  const kept = db.byId('game_payloads', row.id).payload.questions[2];
  check('a same-prompt rewrite still replaces the options and the key', r.rewritten === 1 && kept.answerIndex === 0 && kept.choices[1] === 'x2', [r, kept]);
  r = fixes.applyFile({ ...fix, rekeys: [], rewrites: [{ level: L, qid: 'q3', old_prompt: 'New prompt?', question: same }] });
  check('and is idempotent', r.rewritten === 0 && r.already === 1, r);
  fixes.applyFile({ ...fix, rekeys: [], rewrites: [{ level: L, qid: 'q3', old_prompt: 'New prompt?', question: neu }] }); // back to the first rewrite for the checks below
  // release pinned to a hash
  const bad = fixes.applyFile({ ...fix, release: [{ level: L, hash: 'deadbeef' }] });
  check('a release with the wrong hash stays held', bad.released === 0 && games.held('english', 'proficient', L) === true);
  const hash = fixes.setHash(db.byId('game_payloads', row.id).payload.questions);
  const ok = fixes.applyFile({ ...fix, release: [{ level: L, hash }] });
  check('a release with the right hash is served', ok.released === 1 && games.held('english', 'proficient', L) === false && !!db.byId('game_payloads', row.id).verified_replacement);
  // The shipped file
  const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'game-fixes', 'english-proficient.json'), 'utf8'));
  const staged = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'curriculum-build', 'staged', 'content-fixes', 'english-games-reaudit', 'rekey-confirmed.json'), 'utf8')).rekey;
  check('the shipped file carries all 90 confirmed re-keys', shipped.rekeys.length === staged.length && staged.length === 90, shipped.rekeys.length);
  const heldLevels = new Set(holds.map((h) => h.level));
  check('every fixed level is on the hold list', [...shipped.rekeys, ...shipped.rewrites].every((x) => heldLevels.has(x.level)));
  check('every rewrite is a 4-option question with a valid key and distinct options', shipped.rewrites.every((w) => w.question.choices.length === 4 && new Set(w.question.choices.map((c) => c.toLowerCase())).size === 4 && w.question.answerIndex >= 0 && w.question.answerIndex < 4));
  const lv = (s) => new Set(s.release.map((x) => x.level));
  check('every released level is a level the fix file touched, with a hash', [...lv(shipped)].every((l) => heldLevels.has(l)) && shipped.release.every((x) => /^[0-9a-f]{24}$/.test(x.hash)));
  console.log(`game-fixes-test: ${passed} passed, ${failed} failed`);
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* gone */ }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
