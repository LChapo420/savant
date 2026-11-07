#!/usr/bin/env node
/**
 * scripts/apply-content-fixes.js on a throwaway file: dry run by default, exact match or nothing, backup first, idempotent, reversible, shared rows only, refuses while the app answers.
 *   node scripts/apply-content-fixes-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync, spawn } = require('child_process');

const SCRIPT = path.join(__dirname, 'apply-content-fixes.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-content-fixes-test-'));
const dbFile = path.join(dir, 'db.json');
const fixFile = path.join(dir, 'fixes.json');
let passed = 0; let failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL ${name} ${JSON.stringify(detail).slice(0, 400)}`); } };

const q = (id, over = {}) => ({ id, prompt: `Prompt ${id}?`, choices: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'old why', ...over });
const hash = (qs) => { const h = require('crypto').createHash('sha256'); for (const x of qs) h.update(JSON.stringify([x.id, x.prompt, x.choices, x.answerIndex])); return h.digest('hex').slice(0, 24); }; // eslint-disable-line global-require
const sharedQs = [q('q1'), q('q2'), q('q2', { prompt: 'Second q2?' }), q('q3')];
const seed = {
  users: [{ id: 9, email: 'x@example.com' }],
  game_payloads: [
    { id: 1, user_id: null, track_id: 'english', grade_id: 'p', level: 5, payload: { questions: sharedQs }, verified_replacement: { hash: hash(sharedQs), source: 'test' } },
    { id: 2, user_id: 9, track_id: 'english', grade_id: 'p', level: 5, payload: { questions: [q('q1'), q('q3')] } },
  ],
  block_plans: [
    { id: 3, user_id: null, status: 'ready', track_id: 'spanish', grade_id: 'e', level: 7, prewritten: { sha256: 'aaa' }, blocks: [{ index: 0, block: 'X', data: { title: 'old title', tokens: [{ text: 'a' }, { text: ' b' }], paragraph: 'a b' } }], checks: [{ id: 'c1', format: 'multiple_choice', prompt: 'P', choices: ['x', 'y'], answer: 'x', rationale: 'old', extra: 'keep' }] },
    { id: 4, user_id: 9, status: 'ready', track_id: 'spanish', grade_id: 'e', level: 7, blocks: [{ index: 0, block: 'X', data: { title: 'old title' } }], checks: [] },
    { id: 5, user_id: null, status: 'ready', track_id: 'spanish', grade_id: 'e', level: 8, blocks: [], checks: [{ id: 'c1', format: 'type_in', prompt: 'P', answer: 'x', accepts: ['bad'] }] },
  ],
};
const write = () => fs.writeFileSync(dbFile, JSON.stringify(seed));
const run = (...a) => spawnSync(process.execPath, [SCRIPT, '--db', dbFile, '--fixes', fixFile, '--backup-dir', dir, '--json', path.join(dir, 'r.json'), ...a], { encoding: 'utf8', env: { ...process.env, PORT: '1' } });
const report = () => JSON.parse(fs.readFileSync(path.join(dir, 'r.json'), 'utf8'));
const read = () => JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const backups = () => fs.readdirSync(dir).filter((f) => f.includes('backup-content-fixes'));

const R = {
  key: { id: 'game:key', store: 'game_payloads', track_id: 'english', grade_id: 'p', level: 5, qid: 'q1', edits: [{ path: ['answerIndex'], old: 1, new: 2 }, { path: ['explanation'], old: 'old why', new: 'new why' }] },
  dup: { id: 'game:dup', store: 'game_payloads', track_id: 'english', grade_id: 'p', level: 5, qid: 'q2', edits: [{ path: ['prompt'], old: 'Second q2?', new: 'Second q2, fixed?' }] },
  stale: { id: 'game:stale', store: 'game_payloads', track_id: 'english', grade_id: 'p', level: 5, qid: 'q3', edits: [{ path: ['explanation'], old: 'old why', new: 'x' }, { path: ['prompt'], old: 'Not what is stored', new: 'y' }] },
  none: { id: 'game:none', store: 'game_payloads', track_id: 'english', grade_id: 'p', level: 99, qid: 'q1', edits: [{ path: ['explanation'], old: 'a', new: 'b' }] },
  bad: { id: 'game:bad', store: 'game_payloads', track_id: 'english', grade_id: 'p', level: 5, qid: 'q3', edits: [{ path: ['answerIndex'], old: 1, new: 7 }] },
  part: { id: 'plan:part', store: 'block_plans', track_id: 'spanish', grade_id: 'e', level: 7, part: 'block', index: 0, edits: [{ path: ['title'], old: 'old title', new: 'new title' }], row_edits: [{ path: ['prewritten', 'sha256'], old: 'aaa', new: 'bbb' }] },
  tokens: { id: 'plan:tokens', store: 'block_plans', track_id: 'spanish', grade_id: 'e', level: 7, part: 'block', index: 0, edits: [{ path: ['paragraph'], old: 'a b', new: 'a c' }] },
  check: { id: 'plan:check', store: 'block_plans', track_id: 'spanish', grade_id: 'e', level: 7, part: 'check', index: 0, edits: [{ path: ['rationale'], old: 'old', new: 'new' }, { path: ['accepts'], old: null, new: ['x'] }] },
  drop: { id: 'plan:drop', store: 'block_plans', track_id: 'spanish', grade_id: 'e', level: 8, part: 'check', index: 0, edits: [{ path: ['accepts'], old: ['bad'] }] },
  checkBad: { id: 'plan:checkbad', store: 'block_plans', track_id: 'spanish', grade_id: 'e', level: 7, part: 'check', index: 0, edits: [{ path: ['answer'], old: 'x', new: 'z' }] },
};
fs.writeFileSync(fixFile, JSON.stringify({ records: Object.values(R) }));
write();
const before = fs.readFileSync(dbFile, 'utf8');

let r = run();
check('dry run is the default and writes nothing', r.status === 0 && fs.readFileSync(dbFile, 'utf8') === before && !backups().length && /DRY RUN/.test(r.stdout), r.stdout + r.stderr);
let rep = report().counts;
check('dry run counts', rep.apply === 5 && rep.mismatch === 1 && rep.missing === 1 && rep.invalid === 3, rep);

r = run('--write');
check('write reports a backup and a journal', r.status === 0 && backups().length === 1 && /journal/.test(r.stdout), r.stdout + r.stderr);
check('the backup is the file as it was', fs.readFileSync(path.join(dir, backups()[0]), 'utf8') === before);
const a = read();
const g = a.game_payloads[0].payload.questions;
check('all edits of a record applied', g[0].answerIndex === 2 && g[0].explanation === 'new why');
check('a repeated id: the question holding the expected prompt', g[2].prompt === 'Second q2, fixed?' && g[1].prompt === 'Prompt q2?');
check('a record with one stale value changes nothing, including its matching value', g[3].explanation === 'old why');
check('the release hash follows the set', a.game_payloads[0].verified_replacement.hash === hash(g) && a.game_payloads[0].verified_replacement.source === 'test');
check('a learner\'s own rows are untouched', JSON.stringify(a.game_payloads[1]) === JSON.stringify(seed.game_payloads[1]) && JSON.stringify(a.block_plans[1]) === JSON.stringify(seed.block_plans[1]));
check('block, check and row edits applied; the rest of the check kept', a.block_plans[0].blocks[0].data.title === 'new title' && a.block_plans[0].checks[0].rationale === 'new' && a.block_plans[0].checks[0].extra === 'keep' && a.block_plans[0].prewritten.sha256 === 'bbb' && a.block_plans[0].checks[0].accepts[0] === 'x');
check('tokens that no longer spell the paragraph are refused', a.block_plans[0].blocks[0].data.paragraph === 'a b');
check('an answer outside the options is refused', a.block_plans[0].checks[0].answer === 'x');

check('an edit with no new value removes the field', !('accepts' in a.block_plans[2].checks[0]));
const afterFirst = fs.readFileSync(dbFile, 'utf8');
const journal = report().journal;
r = run('--write');
rep = report().counts;
check('second run: already applied, no write, no new backup', fs.readFileSync(dbFile, 'utf8') === afterFirst && backups().length === 1 && rep.already === 5 && !rep.apply, rep);

r = spawnSync(process.execPath, [SCRIPT, '--db', dbFile, '--revert', journal, '--backup-dir', dir], { encoding: 'utf8', env: { ...process.env, PORT: '1' } });
check('revert is a dry run too', fs.readFileSync(dbFile, 'utf8') === afterFirst && /DRY RUN/.test(r.stdout), r.stdout);
// someone edited a fixed value since: that record stays, the others go back
const edited = read(); edited.block_plans[0].checks[0].rationale = 'edited by hand'; fs.writeFileSync(dbFile, JSON.stringify(edited));
r = spawnSync(process.execPath, [SCRIPT, '--db', dbFile, '--revert', journal, '--backup-dir', dir, '--write'], { encoding: 'utf8', env: { ...process.env, PORT: '1' } });
check('revert leaves a value changed since alone and reports it', /MISMATCH plan:check/.test(r.stdout) && read().block_plans[0].checks[0].rationale === 'edited by hand', r.stdout);
// the clean case: back to byte-for-byte equal data
write(); run('--write');
const j2 = report().journal;
r = spawnSync(process.execPath, [SCRIPT, '--db', dbFile, '--revert', j2, '--backup-dir', dir, '--write'], { encoding: 'utf8', env: { ...process.env, PORT: '1' } });
check('revert restores the data exactly', JSON.stringify(read()) === JSON.stringify(seed), r.stdout);

// a shipped export: plans and games, no stamps
const exportFile = path.join(dir, 'export.json');
fs.writeFileSync(exportFile, `${JSON.stringify({ track_id: 'x', plans: seed.block_plans.slice(0, 1), games: seed.game_payloads.slice(0, 1) })}\n`);
r = spawnSync(process.execPath, [SCRIPT, '--db', exportFile, '--fixes', fixFile, '--backup-dir', dir, '--write'], { encoding: 'utf8', env: { ...process.env, PORT: '1' } });
const ex = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
check('an export is fixed the same way, with no stamp and a trailing newline', ex.games[0].payload.questions[0].answerIndex === 2 && !ex.games[0].content_fixed_at && fs.readFileSync(exportFile, 'utf8').endsWith('}\n'), r.stdout);

// the running-app guard
const srv = http.createServer((req, res) => { res.statusCode = 200; res.end('{"ok":true}'); }).listen(0, '127.0.0.1', () => {
  const { port } = srv.address();
  write();
  const held = fs.readFileSync(dbFile, 'utf8');
  const p = spawn(process.execPath, [SCRIPT, '--db', dbFile, '--fixes', fixFile, '--write'], { env: { ...process.env, PORT: String(port) } });
  let out = ''; p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => {
    check('refuses to write while the app answers', code !== 0 && /Stop it first/.test(out) && fs.readFileSync(dbFile, 'utf8') === held, out);
    srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
});
