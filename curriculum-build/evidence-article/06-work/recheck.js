// Section 06 step 6: every claim the final reviewer rewrote is checked again against its source by an independent
// checker (Mistral Large on xKiro, free). A rewrite is used only if the checker rates it "supported"; otherwise the
// pick is dropped. (A test on 29 Oct showed reviewers sometimes rewrite a claim to fit an unrelated source.)
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', '..', '..');
require(path.join(APP, 'node_modules', 'dotenv')).config({ path: path.join(APP, '..', '.env') });
process.env.XKIRO_PIPELINE = '1';
process.env.XKIRO_USAGE_FILE = process.env.XKIRO_USAGE_FILE || path.join(APP, 'data', 'xkiro-usage.json');
const { xkiro } = require(path.join(APP, 'services', 'providers', 'xkiro.js'));
const reviews = require('./reviews.json');
const cands = require('./candidates.json');
const abstractOf = (cid) => { for (const l of Object.values(cands)) { const c = l.find((x) => x.cid === cid); if (c) return c.abstract; } return ''; };
const src = fs.readFileSync(path.join(__dirname, 'check.js'), 'utf8');
const SYSTEM = src.match(/const SYSTEM = `([\s\S]*?)`;/)[1];
const SCHEMA = { type: 'object', properties: { rating: { type: 'string', enum: ['supported', 'partly', 'not_supported'] }, problem: { type: 'string' }, smallest_fix: { type: 'string' } }, required: ['rating', 'problem', 'smallest_fix'] };
(async () => {
  for (const [cid, r] of Object.entries(reviews)) {
    if (r.decision !== 'rewrite' || (r.recheck && r.recheck.rating !== 'error')) continue;
    try {
      const x = await xkiro.structured({ system: SYSTEM, user: `Claim: ${r.claim}\n\nSource text:\n${String(abstractOf(cid)).slice(0, 4000)}`, schema: SCHEMA, schemaName: 'rate', maxTokens: 800, models: ['mistralai/mistral-large-2512'], timeoutMs: 5 * 60 * 1000 });
      r.recheck = x ? x.data : { rating: 'error', problem: 'no answer' };
    } catch (e) { r.recheck = { rating: 'error', problem: e.message.slice(0, 100) }; }
    fs.writeFileSync(path.join(__dirname, 'reviews.json'), JSON.stringify(reviews, null, 1));
    console.log(cid, r.recheck.rating);
  }
  const rw = Object.values(reviews).filter((r) => r.decision === 'rewrite');
  console.log(`rewrites ${rw.length}: supported ${rw.filter((r) => r.recheck && r.recheck.rating === 'supported').length}, partly ${rw.filter((r) => r.recheck && r.recheck.rating === 'partly').length}, not ${rw.filter((r) => r.recheck && r.recheck.rating === 'not_supported').length}, error ${rw.filter((r) => !r.recheck || r.recheck.rating === 'error').length}`);
})();
