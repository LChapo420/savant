/**
 * Load the pre-written Spanish lessons into a data file.
 *
 *   node scripts/import-spanish-prewritten.js --data data/db.json --dry-run
 *   node scripts/import-spanish-prewritten.js --data data/db.json
 *   node scripts/import-spanish-prewritten.js --data data/db.json --for-user 6689
 *
 * Stop the server first: the data file is held in the server's memory, and a
 * running server would write its own copy over the import (the same rule as
 * scripts/seed-demo.js). The script refuses when the app answers on
 * localhost:$PORT (6767) unless --allow-running is given.
 *
 * Where a lesson goes: the block_plans collection, as the row block-levels
 * writes for a finished lesson (services/block-levels.js write(), status
 * 'ready'), keyed by user_id, track_id, grade_id, level and attempt 1. A shared
 * row (user_id null) is the base version every learner who is not tailored is
 * served, the owner included (blockLevels.findPlan / forLevel). The rows carry
 * a passed check record, so they are served as soon as they exist, under the
 * owner's key or without it, and are never queued to be written again.
 *
 * --for-user <id> also stores each lesson as that learner's own plan. A learner
 * whose levels are tailored (blockLevels.tailorsFor: every non-owner account
 * while TESTER_TAILORING is on) is served their own plan first and only falls
 * back to the shared one after their own write fails, so without this they
 * would wait on the AI writer even with the shared lessons in place.
 *
 * Idempotent: a lesson already imported with the same content (its sha256) is
 * left alone; a changed one is updated in place; anything else at that level
 * for that owner (an AI-written plan, or one that failed or is still being
 * written) is retired as status 'replaced', never deleted, unless
 * --keep-existing is given, in which case levels that already have a ready plan
 * are skipped. A level the curriculum no longer calls a lesson, or whose title
 * has changed, is skipped with a warning: the lesson may no longer fit it.
 *
 * Before anything is written, the data file is copied to
 * <file>.backup-prewritten-<time>. --dry-run reads the file and reports what it
 * would do, writing nothing.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'content', 'spanish-prewritten');

function usage(message) {
  if (message) console.error(`import-spanish-prewritten: ${message}`);
  console.error('usage: node scripts/import-spanish-prewritten.js --data <data file> [--dry-run] [--for-user <id>] [--keep-existing] [--only <grade/level> ...] [--allow-running] [--json]');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { dryRun: false, forUser: [], keepExisting: false, only: [], allowRunning: false, json: false, data: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data') out.data = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--for-user') out.forUser.push(Number(argv[++i]));
    else if (a === '--keep-existing') out.keepExisting = true;
    else if (a === '--only') out.only.push(argv[++i]);
    else if (a === '--allow-running') out.allowRunning = true;
    else if (a === '--json') out.json = true;
    else usage(`unknown argument ${a}`);
  }
  if (!out.data) usage('--data is required (the data file to import into)');
  if (out.forUser.some((n) => !Number.isInteger(n) || n < 1)) usage('--for-user takes a numeric account id');
  return out;
}

const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Is the app answering on this machine? A best effort: a refused or slow connection is "no". */
async function serverRunning() {
  const port = Number(process.env.PORT || 6767);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok ? port : null;
  } catch {
    return null;
  }
}

/** The lessons on disk, each checked against the index and its own hash. */
function loadLessons(only) {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const lessons = [];
  for (const entry of index.lessons) {
    const key = `${entry.grade_id}/${entry.level}`;
    if (only.length && !only.includes(key)) continue;
    const row = JSON.parse(fs.readFileSync(path.join(DIR, entry.file), 'utf8'));
    const hash = sha256({ approach: row.approach, coverage: row.coverage, blocks: row.blocks, checks: row.checks });
    if (!row.prewritten || row.prewritten.sha256 !== hash || entry.sha256 !== hash) {
      throw new Error(`${entry.file}: its content does not match its recorded hash; rebuild with node scripts/build-spanish-prewritten.js`);
    }
    lessons.push({ key, file: `content/spanish-prewritten/${entry.file}`, row });
  }
  if (only.length && lessons.length !== only.length) throw new Error(`--only names a lesson that does not exist: ${only.filter((k) => !lessons.some((l) => l.key === k)).join(', ')}`);
  return lessons;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dataFile = path.resolve(opts.data);
  // The app creates a fresh data file when it finds none; an import never should.
  if (!fs.existsSync(dataFile)) usage(`no data file at ${dataFile}`);
  try { JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch (err) { usage(`${dataFile} is not readable JSON (${err.message})`); }

  if (!opts.dryRun && !opts.allowRunning) {
    const port = await serverRunning();
    if (port) usage(`the app is answering on port ${port}. Stop it first (it holds the data file in memory and would overwrite the import), or pass --allow-running if it uses another data file.`);
  }

  process.env.DB_FILE = dataFile;
  if (opts.dryRun) process.env.DB_READONLY = '1';
  // eslint-disable-next-line global-require
  const db = require('../config/db');
  // eslint-disable-next-line global-require
  const curriculum = require('../config/curriculum');
  // eslint-disable-next-line global-require
  const blockLevels = require('../services/block-levels');

  for (const id of opts.forUser) if (!db.byId('users', id)) usage(`--for-user ${id}: no such account in ${dataFile}`);

  const lessons = loadLessons(opts.only);
  const owners = [null, ...opts.forUser];
  const now = new Date().toISOString();
  const report = [];
  const writes = [];

  for (const lesson of lessons) {
    const { row } = lesson;
    const grade = curriculum.getGrade(row.track_id, row.grade_id);
    const entry = grade && grade.levels.find((l) => l.level === row.level);
    if (!grade || blockLevels.kindFor(grade, row.level) !== 'lesson') {
      report.push({ lesson: lesson.key, owner: null, action: 'skipped', why: 'the curriculum no longer has a lesson at this level' });
      continue;
    }
    if (!entry || entry.title !== row.prewritten.title) {
      report.push({ lesson: lesson.key, owner: null, action: 'skipped', why: `the level is now "${entry ? entry.title : '?'}", not "${row.prewritten.title}"` });
      continue;
    }
    for (const owner of owners) {
      const atLevel = db.find('block_plans', (p) => (p.user_id || null) === owner && p.track_id === row.track_id && p.grade_id === row.grade_id
        && p.level === row.level && (p.attempt || 1) === 1 && p.kind !== 'checkpoint' && p.kind !== 'essay');
      const mine = atLevel.find((p) => p.prewritten && p.prewritten.id === row.prewritten.id);
      const others = atLevel.filter((p) => p !== mine && p.status !== 'replaced');
      const fresh = { ...row, user_id: owner };

      if (opts.keepExisting && others.some((p) => p.status === 'ready')) {
        report.push({ lesson: lesson.key, owner, action: 'skipped', why: `a ready plan already exists (row ${others.find((p) => p.status === 'ready').id}) and --keep-existing was given` });
        continue;
      }
      const retire = others.map((p) => p.id);
      if (mine && mine.status === 'ready' && mine.prewritten.sha256 === row.prewritten.sha256 && !retire.length) {
        report.push({ lesson: lesson.key, owner, action: 'unchanged', row: mine.id });
        continue;
      }
      let action;
      if (!mine) action = 'insert';
      else if (mine.prewritten.sha256 !== row.prewritten.sha256) action = 'update';
      else if (mine.status !== 'ready') action = 'restore';
      else action = 'keep';
      report.push({ lesson: lesson.key, owner, action: action === 'keep' ? 'unchanged' : action === 'insert' ? 'inserted' : action === 'update' ? 'updated' : 'restored', row: mine ? mine.id : null, retired: retire });
      writes.push({ lesson, owner, action, mine, retire, fresh });
    }
  }

  if (!opts.dryRun && writes.length) {
    const backup = `${dataFile}.backup-prewritten-${now.replace(/[:.]/g, '-')}`;
    fs.copyFileSync(dataFile, backup);
    report.backup = backup;
    for (const w of writes) {
      for (const id of w.retire) {
        db.update('block_plans', id, { status: 'replaced', write_token: null, replaced_by: w.lesson.row.prewritten.id, replaced_at: now });
      }
      const stamp = { imported_from: w.lesson.file, imported_at: now };
      if (w.action === 'insert') {
        const inserted = db.insert('block_plans', { ...w.fresh, answers: {}, ...stamp });
        const r = report.find((x) => x.lesson === w.lesson.key && x.owner === w.owner);
        if (r) r.row = inserted.id;
      } else if (w.action === 'update') {
        // New content: earlier answers were to other questions, so they are not carried over.
        db.update('block_plans', w.mine.id, { ...w.fresh, answers: {}, ...stamp, reason: null });
      } else if (w.action === 'restore') {
        db.update('block_plans', w.mine.id, { ...w.fresh, answers: w.mine.answers || {}, ...stamp, reason: null });
      }
    }
    db.flush();
  }

  const counts = {};
  report.forEach((r) => { counts[r.action] = (counts[r.action] || 0) + 1; });
  const retired = report.reduce((n, r) => n + ((r.retired || []).length), 0);
  if (opts.json) {
    console.log(JSON.stringify({ data: dataFile, dry_run: opts.dryRun, backup: report.backup || null, counts, retired, lessons: report }, null, 2));
    return;
  }
  console.log(`${opts.dryRun ? 'DRY RUN (nothing written): ' : ''}${dataFile}`);
  for (const r of report) {
    const who = r.owner === null ? 'shared' : `user ${r.owner}`;
    const extra = r.why ? `: ${r.why}` : `${r.row ? ` (row ${r.row})` : ''}${r.retired && r.retired.length ? `; retires row ${r.retired.join(', ')}` : ''}`;
    console.log(`  ${r.lesson.padEnd(18)} ${who.padEnd(10)} ${r.action}${extra}`);
  }
  console.log(`\n${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}${retired ? `, ${retired} older row(s) retired` : ''}`);
  if (report.backup) console.log(`backup: ${report.backup}`);
}

main().catch((err) => {
  console.error(`import-spanish-prewritten: ${err.message}`);
  process.exit(1);
});
