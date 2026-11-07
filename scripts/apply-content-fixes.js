#!/usr/bin/env node
/**
 * Apply the reviewed fixes to shared stored content (docs/fact-gate/content-fixes-approved.json; verdicts in docs/fact-gate/fix-review.md).
 *
 *   node scripts/apply-content-fixes.js --db <file>                 dry run: reports, writes nothing (the default)
 *   node scripts/apply-content-fixes.js --db <file> --write         backup, journal, then the change
 *   node scripts/apply-content-fixes.js --db <file> --revert <journal> [--write]   undo a --write, again dry run unless --write
 *
 * <file> is a data file (game_payloads, block_plans) or a shipped export (content/base-levels/*.json: plans, games).
 * Options: --fixes <json>, --backup-dir <dir> (default: beside the file), --allow-running (the file is not the one a running app holds), --only <substring of a record id>, --json <report file>.
 *
 * Stop the app before --write on the live file: it holds the data in memory and would write its own copy over this. The script refuses while the app answers on PORT (6767).
 *
 * The rules:
 *  - Only shared rows: a row with a user_id is never read for a match or written. There is no way to name an account here.
 *  - Every changed value is compared to what it is expected to be. Already the new value: nothing to do. The old value: changed. Anything else: the whole record is left alone and reported.
 *  - A record that would break its question or part (key out of range, key not among the options, repeated options, tokens that no longer spell the paragraph) is left alone and reported.
 *  - A game row released by hash stays pinned to its set: when a fix changes a prompt, an option or a key, the release hash follows, since each changed question has passed two blind families.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function args(argv) {
  const o = { write: false, fixes: path.join(__dirname, '..', 'docs', 'fact-gate', 'content-fixes-approved.json') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') o.db = argv[++i];
    else if (a === '--write') o.write = true;
    else if (a === '--revert') o.revert = argv[++i];
    else if (a === '--fixes') o.fixes = argv[++i];
    else if (a === '--backup-dir') o.backupDir = argv[++i];
    else if (a === '--allow-running') o.allowRunning = true;
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--json') o.json = argv[++i];
    else { console.error(`unknown argument ${a}`); process.exit(2); }
  }
  if (!o.db) { console.error('--db <file> is required'); process.exit(2); }
  return o;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clip = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s === undefined ? 'nothing' : (s.length > 110 ? `${s.slice(0, 110)}...` : s); };
const getAt = (o, p) => p.reduce((x, k) => (x === null || x === undefined ? undefined : x[k]), o);
function setAt(o, p, v) { let x = o; for (const k of p.slice(0, -1)) x = x[k]; x[p[p.length - 1]] = v; }

/** services/game-fixes.js setHash: prompt, options and key of every question, in order. */
function setHash(questions) {
  const h = crypto.createHash('sha256');
  for (const q of questions) h.update(JSON.stringify([q.id, q.prompt, q.choices, q.answerIndex]));
  return h.digest('hex').slice(0, 24);
}

/** A data file and a shipped export hold the same rows under different names. */
function stores(data) {
  return { game_payloads: data.game_payloads || data.games || [], block_plans: data.block_plans || data.plans || [] };
}

/** Find what a record edits: { row, target } or { problem }. Shared rows only. */
function locate(s, rec) {
  if (rec.store === 'game_payloads') {
    const rows = s.game_payloads.filter((r) => !r.user_id && r.track_id === rec.track_id && r.grade_id === rec.grade_id && r.level === rec.level && r.payload);
    if (rows.length !== 1) return { problem: rows.length ? `${rows.length} shared rows at this level` : 'no shared row at this level' };
    const qs = (rows[0].payload.questions || []).filter((q) => q.id === rec.qid);
    if (!qs.length) return { problem: `no question ${rec.qid}` };
    // A set can carry one id twice: take the one holding the expected or the new prompt.
    const prompts = rec.edits.filter((e) => e.path[0] === 'prompt').flatMap((e) => [e.old, e.new]);
    const q = (prompts.length && qs.find((x) => prompts.includes(x.prompt))) || qs.find((x) => rec.edits.some((e) => same(getAt(x, e.path), e.old) || same(getAt(x, e.path), e.new))) || qs[0];
    return { row: rows[0], target: q };
  }
  const rows = s.block_plans.filter((r) => !r.user_id && r.status === 'ready' && r.track_id === rec.track_id && r.grade_id === rec.grade_id && r.level === rec.level);
  if (rows.length !== 1) return { problem: rows.length ? `${rows.length} shared ready plans at this level` : 'no shared ready plan at this level' };
  if (rec.part === 'check') {
    const c = (rows[0].checks || [])[rec.index];
    return c ? { row: rows[0], target: c } : { problem: `no check ${rec.index}` };
  }
  const b = (rows[0].blocks || []).find((x, k) => (x.index ?? k) === rec.index);
  return b && b.data ? { row: rows[0], target: b.data } : { problem: `no block ${rec.index}` };
}

/** What the part must still satisfy after the edits. */
function brokenBy(rec, after) {
  const uniq = (list) => new Set(list.map((c) => String(c).trim().toLowerCase())).size === list.length;
  if (rec.store === 'game_payloads') {
    if (!Array.isArray(after.choices) || !after.choices.every((c) => typeof c === 'string' && c.trim())) return 'an option is empty';
    if (!uniq(after.choices)) return 'repeated options';
    if (!Number.isInteger(after.answerIndex) || !after.choices[after.answerIndex]) return 'the key points at no option';
    return null;
  }
  if (rec.part === 'check') {
    if (after.format === 'multiple_choice' && (!Array.isArray(after.choices) || !after.choices.includes(after.answer) || !uniq(after.choices))) return 'the answer is not exactly one of the options';
    if (!String(after.answer || '').trim()) return 'no answer';
    if (after.accepts !== undefined && !(Array.isArray(after.accepts) && after.accepts.every((x) => typeof x === 'string'))) return 'accepts is not a list of text';
    return null;
  }
  if (Array.isArray(after.choices) && Number.isInteger(after.correctIndex) && !after.choices[after.correctIndex]) return 'correctIndex points at no option';
  if (Array.isArray(after.choices) && !uniq(after.choices)) return 'repeated options';
  if (Array.isArray(after.tokens) && typeof after.paragraph === 'string' && after.tokens.map((t) => t.text).join('') !== after.paragraph) return 'the tokens no longer spell the paragraph';
  return null;
}

function planApply(s, rec) {
  const at = locate(s, rec);
  if (at.problem) return { status: 'missing', why: at.problem };
  const todo = []; const mismatches = [];
  for (const e of rec.edits) {
    const cur = getAt(at.target, e.path);
    if (same(cur, e.new)) continue;
    if (same(cur, e.old) || (cur === undefined && e.old === null)) todo.push(e);
    else mismatches.push(`${e.path.join('.')}: expected ${clip(e.old)} | found ${clip(cur)}`);
  }
  for (const e of rec.row_edits || []) {
    const cur = getAt(at.row, e.path);
    if (same(cur, e.new)) continue;
    if (!same(cur, e.old)) mismatches.push(`row ${e.path.join('.')}: expected ${clip(e.old)} | found ${clip(cur)}`);
  }
  if (mismatches.length) return { status: 'mismatch', mismatches };
  const rowTodo = (rec.row_edits || []).filter((e) => !same(getAt(at.row, e.path), e.new));
  if (!todo.length && !rowTodo.length) return { status: 'already' };
  const after = JSON.parse(JSON.stringify(at.target));
  for (const e of todo) setAt(after, e.path, e.new);
  const broken = brokenBy(rec, after);
  if (broken) return { status: 'invalid', why: broken };
  return { status: 'apply', at, todo, rowTodo };
}

async function appAnswering() {
  const port = Number(process.env.PORT || 6767);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok ? port : null;
  } catch { return null; }
}

function writeOut(file, raw, data, o, journal) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = o.backupDir || path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(file);
  const backup = path.join(dir, `${base}.backup-content-fixes-${stamp}`);
  fs.writeFileSync(backup, raw); // first: nothing changes without a copy of what was there
  if (!same(JSON.parse(fs.readFileSync(backup, 'utf8')), JSON.parse(raw))) throw new Error('backup does not read back the same');
  const jfile = path.join(dir, `${base}.content-fixes-journal-${stamp}.json`);
  fs.writeFileSync(jfile, `${JSON.stringify(journal, null, 1)}\n`);
  const pretty = /^\{\s*\n/.test(raw);
  const tail = raw.endsWith('\n') ? '\n' : '';
  const tmp = `${file}.content-fixes-tmp`;
  fs.writeFileSync(tmp, (pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + tail);
  JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.renameSync(tmp, file);
  return { backup, journal: jfile };
}

async function main() {
  const o = args(process.argv.slice(2));
  const file = path.resolve(o.db);
  if (!fs.existsSync(file)) { console.error(`no file at ${file}`); process.exit(2); }
  if (o.write && !o.allowRunning) {
    const port = await appAnswering();
    if (port) { console.error(`the app is answering on port ${port}. Stop it first (it holds the data in memory and would overwrite this), or pass --allow-running if it uses another file.`); process.exit(2); }
  }
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  const s = stores(data);
  const now = new Date().toISOString();
  const report = { file, mode: o.revert ? 'revert' : 'apply', dry_run: !o.write, counts: {}, records: [] };
  const say = (id, status, detail) => { report.counts[status] = (report.counts[status] || 0) + 1; report.records.push({ id, status, detail }); };
  const journal = { file, at: now, entries: [] };

  if (o.revert) {
    if (!data.game_payloads && !data.block_plans) { console.error('a shipped export is in git: reverse it with git, not here.'); process.exit(2); }
    const j = JSON.parse(fs.readFileSync(o.revert, 'utf8'));
    for (const en of j.entries.slice().reverse()) {
      const row = s[en.store].find((r) => r.id === en.row_id && !r.user_id);
      const at = row ? locate(s, en.rec) : { problem: 'the row is gone' };
      if (at.problem || at.row !== row) { say(en.rec.id, 'missing', at.problem || 'the row moved'); continue; }
      const off = en.done.filter((e) => !same(getAt(at.target, e.path), e.new)).map((e) => `${e.path.join('.')}: expected ${clip(e.new)} | found ${clip(getAt(at.target, e.path))}`);
      const offRow = (en.row_done || []).filter((e) => !same(getAt(row, e.path), e.new)).map((e) => `row ${e.path.join('.')}: expected ${clip(e.new)} | found ${clip(getAt(row, e.path))}`);
      if (off.length || offRow.length) { say(en.rec.id, 'mismatch', [...off, ...offRow]); continue; }
      for (const e of en.done) { if (e.old === null) { const p = e.path.slice(0, -1); const parent = p.length ? getAt(at.target, p) : at.target; delete parent[e.path[e.path.length - 1]]; } else setAt(at.target, e.path, e.old); }
      for (const e of en.row_done || []) { if (e.old === undefined) delete row[e.path[0]]; else setAt(row, e.path, e.old); }
      say(en.rec.id, 'reverted');
    }
    for (const en of j.rows_meta || []) {
      const row = s[en.store].find((r) => r.id === en.row_id && !r.user_id);
      if (!row) continue;
      for (const k of ['content_fixed_at', 'updated_at', 'verified_replacement']) { if (en.old[k] === undefined) delete row[k]; else row[k] = en.old[k]; }
    }
  } else {
    const { records } = JSON.parse(fs.readFileSync(o.fixes, 'utf8'));
    const touched = new Map();
    for (const rec of records) {
      if (o.only && !rec.id.includes(o.only)) continue;
      const p = planApply(s, rec);
      if (p.status !== 'apply') { say(rec.id, p.status, p.mismatches || p.why); continue; }
      const { at, todo, rowTodo } = p;
      const { row } = at;
      if (!touched.has(row)) touched.set(row, { store: rec.store, row_id: row.id, level: row.level, hashBefore: rec.store === 'game_payloads' ? setHash(row.payload.questions || []) : null, hashField: false, old: { content_fixed_at: row.content_fixed_at, updated_at: row.updated_at, verified_replacement: row.verified_replacement ? JSON.parse(JSON.stringify(row.verified_replacement)) : undefined } });
      const done = todo.map((e) => ({ path: e.path, old: e.old, new: e.new }));
      for (const e of todo) { setAt(at.target, e.path, e.new); if (['prompt', 'choices', 'answerIndex'].includes(e.path[0])) touched.get(row).hashField = true; }
      const rowDone = rowTodo.map((e) => ({ path: e.path, old: getAt(row, e.path), new: e.new }));
      for (const e of rowTodo) setAt(row, e.path, e.new);
      journal.entries.push({ store: rec.store, row_id: row.id, rec: { id: rec.id, store: rec.store, track_id: rec.track_id, grade_id: rec.grade_id, level: rec.level, qid: rec.qid, part: rec.part, index: rec.index, edits: rec.edits }, done, row_done: rowDone });
      say(rec.id, 'apply');
    }
    journal.rows_meta = [...touched.values()];
    for (const [row, t] of touched) {
      if (t.hashField && row.verified_replacement && row.verified_replacement.hash === t.hashBefore) {
        row.verified_replacement = { ...row.verified_replacement, hash: setHash(row.payload.questions), repinned_by: 'content-fixes', repinned_at: now };
        report.counts.release_hash_repinned = (report.counts.release_hash_repinned || 0) + 1;
      }
      if (data.game_payloads || data.block_plans) { row.content_fixed_at = now; row.updated_at = now; }
    }
    report.rows_touched = touched.size;
  }

  const changed = report.records.some((r) => r.status === 'apply' || r.status === 'reverted');
  if (o.write && changed) { const out = writeOut(file, raw, data, o, journal); report.backup = out.backup; report.journal = out.journal; }

  console.log(`${o.write ? 'WRITTEN' : 'DRY RUN, nothing written'}: ${file}`);
  console.log(`  ${report.mode}: ${JSON.stringify(report.counts)}${report.rows_touched !== undefined ? `, rows touched ${report.rows_touched}` : ''}`);
  for (const r of report.records) {
    if (['apply', 'already', 'reverted'].includes(r.status)) continue;
    console.log(`  ${r.status.toUpperCase()} ${r.id}`);
    for (const d of [].concat(r.detail || [])) console.log(`    ${d}`);
  }
  if (report.backup) console.log(`  backup  ${report.backup}\n  journal ${report.journal}\n  reverse node scripts/apply-content-fixes.js --db ${o.db} --revert ${report.journal} --write`);
  if (o.json) fs.writeFileSync(o.json, `${JSON.stringify(report, null, 1)}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
