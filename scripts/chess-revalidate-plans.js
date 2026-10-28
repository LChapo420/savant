/**
 * Re-run today's chess validators on chess lesson plans already stored, and (with
 * --write) drop the blocks and checks that fail them, the same outcome the pipeline
 * gives a part its repair call could not fix. No model is called.
 *
 *   DB_FILE=... NODE_PATH=../node_modules node scripts/chess-revalidate-plans.js [--grade g] [--level n] [--write]
 *
 * A plan that would be left without a teaching block or a check is reported and
 * left alone, to be written again.
 */
const db = require('../config/db');
const blockLevels = require('../services/block-levels');
const chessChecks = require('../services/chess-checks');
const schemaCheck = require('../services/block-schema');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? null : args[i + 1]; };
const WRITE = args.includes('--write');
const grade = flag('grade');
const level = flag('level') ? Number(flag('level')) : null;
const lib = blockLevels.library();

const plans = db.find('block_plans', (p) => p.track_id === 'chess' && p.status === 'ready'
  && (!grade || p.grade_id === grade) && (level === null || p.level === level));
let changed = 0;
for (const plan of plans) {
  const badBlocks = [];
  const keep = (plan.blocks || []).filter((b) => {
    const schema = lib[b.block] && lib[b.block].schema;
    const problems = (schema ? schemaCheck.validate(schema, b.data) : []).concat(chessChecks.blockProblems(b.block, b.data));
    if (problems.length) badBlocks.push({ block: b.block, index: b.index, problems: problems.slice(0, 4), revalidated: true });
    return !problems.length;
  });
  const badChecks = [];
  const checks = (plan.checks || []).filter((c) => {
    const why = c.format === 'board' ? chessChecks.boardCheckProblem(c) : chessChecks.proseCheckProblem(c);
    if (why) badChecks.push({ index: Number(String(c.id).slice(1)) - 1, why, revalidated: true });
    return !why;
  });
  const label = `${plan.grade_id} ${plan.level}${plan.user_id ? ` (user ${plan.user_id})` : ''}`;
  if (!badBlocks.length && !badChecks.length) { console.log(`ok    ${label}`); continue; }
  for (const b of badBlocks) console.log(`block ${label}: ${b.block} [${b.index}]: ${b.problems.join('; ')}`);
  for (const c of badChecks) console.log(`check ${label}: c${c.index + 1}: ${c.why}`);
  const teaches = keep.some((b) => lib[b.block] && (lib[b.block].category === 'Foundational' || lib[b.block].family === 'retention'));
  if (!teaches || keep.length < 2 || !checks.length) { console.log(`      ${label}: too little would be left; write it again instead`); continue; }
  if (WRITE) {
    db.update('block_plans', plan.id, {
      blocks: keep,
      checks,
      dropped: (plan.dropped || []).concat(badBlocks),
      dropped_checks: (plan.dropped_checks || []).concat(badChecks),
      revalidated_at: new Date().toISOString(),
    });
    changed++;
  }
}
if (WRITE) db.flush();
console.log(`${plans.length} plan(s) read, ${changed} changed${WRITE ? '' : ' (dry run: add --write)'}`);
