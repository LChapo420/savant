/**
 * Build the pre-written Spanish lessons into importable block_plans rows.
 *
 *   node scripts/build-spanish-prewritten.js            (writes the files)
 *   node scripts/build-spanish-prewritten.js --check    (fails if the files are not up to date)
 *
 * The lessons are written by hand in content/spanish-prewritten/src/*.js. This
 * turns each one into the row block-levels stores for a written lesson
 * (services/block-levels.js write(): status 'ready', blocks, graded checks, the
 * check records) and writes it to content/spanish-prewritten/<grade>/level-NNN.json,
 * with an index.json listing every lesson. scripts/import-spanish-prewritten.js
 * loads them into a data file.
 *
 * Every block is checked against its schema and every check goes through the
 * app's own item check (services/ai.js validateItem), exactly as block-levels
 * does for a written level; anything that fails stops the build. The full set of
 * checks is scripts/check-spanish-prewritten.js.
 *
 * Output is deterministic (no clocks): building twice gives the same bytes, so
 * the importer can tell an unchanged lesson by its hash.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

process.env.DB_READONLY = '1';
if (!process.env.DB_FILE) process.env.DB_FILE = path.join(require('os').tmpdir(), `spanish-prewritten-build-${process.pid}.json`);

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'content', 'spanish-prewritten');
const SRC = path.join(DIR, 'src');
const TRACK = 'spanish';
/** Bump when a lesson's content changes in a way the importer must replace. */
const VERSION = 1;
const AUTHORED_AT = '2026-10-28T00:00:00.000Z';

const curriculum = require('../config/curriculum');
const blockLevels = require('../services/block-levels');
const schemaCheck = require('../services/block-schema');
const ai = require('../services/ai');

const GRADE_FILES = ['grade-1-entry.js', 'grade-2-intermediate.js', 'grade-3-advanced-a.js', 'grade-3-advanced-b.js'];

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function blindResolve() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'blind-resolve.json'), 'utf8')); } catch { return null; }
}

/** One lesson definition → the stored row, or throws with every problem found. */
function buildRow(def, blind) {
  const problems = [];
  const grade = curriculum.getGrade(TRACK, def.grade);
  if (!grade) throw new Error(`${def.grade}/${def.level}: no such grade`);
  const kind = blockLevels.kindFor(grade, def.level);
  if (kind !== 'lesson') throw new Error(`${def.grade}/${def.level}: the layout says this level is ${kind || 'not a block level'}, not a lesson`);
  const context = blockLevels.levelContext(TRACK, def.grade, def.level);
  const lib = blockLevels.library();
  const where = `${def.grade}/${def.level}`;

  const blocks = def.blocks.map((b, index) => {
    const entry = lib[b.block];
    if (!entry) { problems.push(`block ${index}: unknown block ${b.block}`); return null; }
    const found = schemaCheck.validate(entry.schema, b.data);
    found.forEach((p) => problems.push(`block ${index} ${b.block}: ${p}`));
    const pruned = schemaCheck.prune(entry.schema, b.data);
    if (JSON.stringify(pruned) !== JSON.stringify(b.data)) problems.push(`block ${index} ${b.block}: carries a field its schema does not have`);
    if (!String(b.purpose || '').trim()) problems.push(`block ${index} ${b.block}: no purpose`);
    return { block: b.block, purpose: b.purpose, data: pruned, repaired: false, index };
  });

  const difficulty = Math.round(context.difficulty || 5);
  const checks = def.checks.map((c, i) => {
    if (!context.skills.includes(c.skill)) problems.push(`check ${i + 1}: skill ${c.skill} is not one of this level's skills (${context.skills.join(', ')})`);
    if (!(Number.isInteger(c.after) && c.after >= -1 && c.after < def.blocks.length)) problems.push(`check ${i + 1}: "after" ${c.after} is not a block index`);
    const item = ai.validateItem({ ...c, format: c.format }, c.skill, difficulty);
    if (!item) { problems.push(`check ${i + 1}: refused by the app's item check (${blockLevels.whyRefused(c, { format: c.format })})`); return null; }
    return { ...item, source: 'prewritten', id: `c${i + 1}`, after: c.after, focus: c.focus };
  });

  if (blocks.length < 4 || blocks.length > 10) problems.push(`${blocks.length} blocks; a lesson has 4 to 10`);
  if (checks.length < 2 || checks.length > 5) problems.push(`${checks.length} checks; a lesson has 2 to 5`);
  const counts = {};
  def.blocks.forEach((b) => { counts[b.block] = (counts[b.block] || 0) + 1; });
  Object.entries(counts).filter(([, n]) => n > 2).forEach(([t, n]) => problems.push(`${t} used ${n} times; a layout uses a block at most twice`));
  if (!def.blocks.some((b) => lib[b.block] && lib[b.block].category === 'Foundational')) problems.push('no Foundational block');
  if (!def.coverage || def.coverage.length < 3 || def.coverage.length > 12) problems.push('coverage must list 3 to 12 points');
  if (problems.length) throw new Error(`${where}:\n  - ${problems.join('\n  - ')}`);

  const content = { approach: def.approach, coverage: def.coverage, blocks, checks };
  const hash = sha256(content);
  const mcCount = checks.filter((c) => c.format === 'multiple_choice').length;
  const blindRow = blind && blind.lessons && blind.lessons[`${def.grade}/${def.level}`];
  const entry = curriculum.getGrade(TRACK, def.grade).levels.find((l) => l.level === def.level);
  return {
    user_id: null,
    track_id: TRACK,
    grade_id: def.grade,
    level: def.level,
    attempt: 1,
    kind: 'lesson',
    status: 'ready',
    arm: 'shared',
    experiment: null,
    approach: def.approach,
    coverage: def.coverage,
    layout_fallback: false,
    blocks,
    checks,
    dropped: [],
    dropped_checks: [],
    verification: {
      status: 'verified',
      model: 'Claude Code (pre-written lesson, fact-checked by hand)',
      method: 'Written by hand to the level objective, then a second line-by-line pass against the objective and Spanish grammar and usage, and the app\'s own validators (scripts/check-spanish-prewritten.js). Record: content/spanish-prewritten/CHECKS.md.',
      rounds: 2,
      searches: 0,
      cost: 0,
      checked_at: AUTHORED_AT,
      claims: [],
      sources: (def.sources || []).map((s) => ({ url: s[0], title: s[1] })),
      stages: [],
      blocks_fixed: [],
      blocks_dropped: [],
      checks_fixed: [],
      checks_dropped: [],
    },
    self_check: {
      status: 'passed',
      method: blindRow
        ? 'hand check of every claim + blind re-solve of every multiple-choice check by a separate reviewer never shown the key'
        : 'hand check of every claim',
      claim_read: 'verified',
      mc_checked: mcCount,
      mc_agreed: blindRow ? blindRow.agreed : 0,
      mc_dropped: 0,
      mc_unjudged: blindRow ? mcCount - blindRow.agreed : mcCount,
      checked_at: AUTHORED_AT,
    },
    check_tier: 'prewritten',
    fact_sheet: null,
    model: 'prewritten',
    layout_model: 'prewritten',
    usage: null,
    seconds: 0,
    brief_hash: null,
    finished_at: AUTHORED_AT,
    prewritten: {
      id: `${TRACK}/${def.grade}/${def.level}`,
      version: VERSION,
      sha256: hash,
      title: entry ? entry.title : '',
      file: `content/spanish-prewritten/${def.grade}/level-${String(def.level).padStart(3, '0')}.json`,
    },
  };
}

function loadDefs() {
  const defs = [];
  for (const f of GRADE_FILES) {
    const file = path.join(SRC, f);
    if (!fs.existsSync(file)) continue;
    // eslint-disable-next-line global-require, import/no-dynamic-require
    defs.push(...require(file));
  }
  return defs;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const blind = blindResolve();
  const defs = loadDefs();
  const seen = new Set();
  const failures = [];
  const rows = [];
  for (const def of defs) {
    const key = `${def.grade}/${def.level}`;
    if (seen.has(key)) { failures.push(`${key}: written twice`); continue; }
    seen.add(key);
    try { rows.push(buildRow(def, blind)); } catch (err) { failures.push(err.message); }
  }
  if (failures.length) {
    console.error(`build-spanish-prewritten: ${failures.length} lesson(s) failed\n${failures.join('\n')}`);
    process.exit(1);
  }
  const index = {
    track_id: TRACK,
    version: VERSION,
    authored_at: AUTHORED_AT,
    lessons: rows.map((r) => ({
      grade_id: r.grade_id, level: r.level, title: r.prewritten.title, file: r.prewritten.file.replace('content/spanish-prewritten/', ''),
      sha256: r.prewritten.sha256, blocks: r.blocks.length, checks: r.checks.length,
    })),
  };
  const outputs = rows.map((r) => [path.join(ROOT, r.prewritten.file), `${JSON.stringify(r, null, 2)}\n`]);
  outputs.push([path.join(DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`]);
  let stale = 0;
  for (const [file, body] of outputs) {
    const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (now === body) continue;
    stale++;
    if (!checkOnly) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
    }
  }
  if (checkOnly && stale) {
    console.error(`build-spanish-prewritten: ${stale} file(s) out of date; run node scripts/build-spanish-prewritten.js`);
    process.exit(1);
  }
  console.log(`build-spanish-prewritten: ${rows.length} lessons (${checkOnly ? 'up to date' : `${stale} file(s) written`})`);
}

if (require.main === module) main();

module.exports = { buildRow, loadDefs, VERSION, DIR };
