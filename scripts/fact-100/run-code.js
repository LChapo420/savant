#!/usr/bin/env node
/** The fact gate's code pass as a checker over the new set (certain findings only, free). */
const C = require('./common');
const code = require('../../services/fact-code-checks');
(async () => {
  await C.runChecker('code', 'heldout', async (lv) => ({ flags: code.checkLevel({ trackId: lv.track, gradeId: lv.grade, blocks: lv.blocks, checks: lv.checks }).filter((f) => f.certain).map((f) => ({ ...f, why: f.rule })), cost: 0 }), { par: 8 });
  process.exit(0);
})();
