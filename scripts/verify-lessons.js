/**
 * Verify lessons already written: every claim checked by Claude with web search,
 * what fails repaired by GLM and checked again, what still fails dropped.
 *
 *   node scripts/verify-lessons.js --dry                    how many are waiting, and a cost estimate
 *   node scripts/verify-lessons.js --save                   verify every lesson not yet verified
 *   node scripts/verify-lessons.js --save --track chess --grade chess_board_explorer --level 42
 *   node scripts/verify-lessons.js --track chess --grade chess_board_explorer --level 42
 *                                                           read-only: list every claim and its verdict, change nothing
 *
 * Needs FACT_CHECK_ANTHROPIC_KEY (node scripts/check-fact-key.js). Stop the server
 * first when saving: both write data/db.json, and whichever writes last wins.
 */
const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');
const here = path.join(__dirname, '..', '.env');
dotenv.config({ path: fs.existsSync(here) ? here : path.join(__dirname, '..', '..', '.env') });
// GLM 5.3 Flash only for the repairs, as for writing levels.
process.env.AI_PROVIDER_BLOCKS_FALLBACK = '';
process.env.OPENROUTER_GLM_BLOCKS_EFFORT = process.env.OPENROUTER_GLM_BLOCKS_EFFORT || 'low';

const db = require('../config/db');
const blockLevels = require('../services/block-levels');
const factReader = require('../services/fact-check-anthropic');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i === -1) return null; const v = args[i + 1]; return v && !v.startsWith('--') ? v : true; };
const SAVE = !!flag('save');
const DRY = !!flag('dry');
const TRACK = flag('track');
const GRADE = flag('grade');
const LEVEL = flag('level') ? Number(flag('level')) : null;
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;
// Measured on 2026-10-21, thorough mode (the default): chess $0.74, piano $0.47, basketball $1.86 a lesson.
const ESTIMATE = { low: 0.5, high: 1.9 };

(async () => {
  if (!factReader.isReady()) {
    console.log('No working FACT_CHECK_ANTHROPIC_KEY: run node scripts/check-fact-key.js first.');
    process.exitCode = 1;
    return;
  }
  const plans = db.find('block_plans', (p) => p.status === 'ready' && (p.kind === 'lesson' || p.kind === 'retention')
    && (!TRACK || p.track_id === TRACK) && (!GRADE || p.grade_id === GRADE) && (LEVEL === null || p.level === LEVEL));
  const waiting = plans.filter((p) => !(p.verification && p.verification.status === 'verified'));

  if (DRY) {
    console.log(`${plans.length} written lesson(s), ${waiting.length} not yet verified.`);
    console.log(`Estimated cost to verify them: $${(waiting.length * ESTIMATE.low).toFixed(2)}-$${(waiting.length * ESTIMATE.high).toFixed(2)}.`);
    return;
  }

  if (!SAVE) {
    // Read-only: one verification read of each, printed in full.
    for (const plan of plans.slice(0, Math.min(LIMIT, 5))) {
      const context = blockLevels.levelContext(plan.track_id, plan.grade_id, plan.level);
      const blocks = plan.blocks.map((b) => ({ index: b.index, block: b.block, data: b.data }));
      const checks = plan.checks.map((c) => ({ ...c, index: Number(String(c.id).slice(1)) - 1 }));
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const v = await blockLevels.verifyLevel({ context, blocks, checks, factSheet: plan.fact_sheet || null });
      const seconds = Math.round((Date.now() - started) / 1000);
      if (!v) { console.log(`${plan.track_id}/${plan.grade_id}/${plan.level}: the verification call failed (${seconds}s)`); continue; }
      console.log(`\n${plan.track_id}/${plan.grade_id}/${plan.level}: ${v.claims.length} claims, ${v.failed.length} not verified, ${v.searches} searches, $${(v.cost || 0).toFixed(3)}, ${seconds}s`);
      for (const c of v.claims) {
        const mark = c.verdict === 'verified' ? 'ok ' : c.verdict.toUpperCase();
        console.log(`  ${mark} [${c.where}] (${c.kind}${c.evidence ? `, ${c.evidence}` : ''}) ${c.claim}`);
        if (c.verdict !== 'verified') console.log(`        → ${c.truth}${c.source_url ? ` (${c.source_url})` : ''}`);
        else if (c.source_url) console.log(`        source: ${c.source_url}`);
      }
    }
    return;
  }

  let spent = 0;
  let passed = 0;
  for (const plan of waiting.slice(0, LIMIT)) {
    const where = `${plan.user_id ? `user ${plan.user_id} ` : ''}${plan.track_id}/${plan.grade_id}/${plan.level}`;
    const started = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const checked = await blockLevels.verifyStored(plan);
    const seconds = Math.round((Date.now() - started) / 1000);
    if (!checked) {
      const row = db.findOne('block_plans', (p) => p.id === plan.id);
      const cost = (row && row.verification && row.verification.cost) || 0;
      spent += cost;
      console.log(`  FAIL ${where}: too little survived verification ($${cost.toFixed(3)}); it will be written again when next opened`);
      continue;
    }
    const v = checked.verification;
    spent += v.cost || 0;
    if (v.status !== 'verified') { console.log(`  HELD ${where}: the verifier could not run (check the key)`); continue; }
    passed++;
    const first = v.claims.filter((c) => c.round === 0);
    console.log(`  ok   ${where}: ${first.length} claims, ${first.filter((c) => c.verdict !== 'verified').length} wrong at first, `
      + `${v.blocks_fixed.length + v.checks_fixed.length} fixed, ${v.blocks_dropped.length + v.checks_dropped.length} dropped, ${v.searches} searches, $${(v.cost || 0).toFixed(3)} (${seconds}s)`);
  }
  db.flush();
  console.log(`\n${passed} verified; $${spent.toFixed(2)} spent.`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
