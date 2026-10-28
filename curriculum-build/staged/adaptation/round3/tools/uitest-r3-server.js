// The placement-uitest server, pointed at the round-3 scratch copy of the app (all
// five patches applied) and a copy of db.uitest.json: port 6799, every model key
// blanked, the round-3 flags on. The live app and its data are not touched.
const path = require('path');
const scratch = path.join(__dirname, '..');
const app = path.join(scratch, 'r3app');
process.env.DB_FILE = path.join(scratch, 'db.uitest.r3.json');
process.env.PORT = '6799';
process.env.OLLAMA_ENABLED = '0';
for (const k of Object.keys(process.env)) if (/KEY|TOKEN|SECRET_API|WORKSPACE/.test(k)) process.env[k] = '';
Object.assign(process.env, {
  ADAPT_REVIEW_SESSION: 'on',
  ADAPT_CONSOLIDATE: 'on',
  ADAPT_EFFORT: 'on',
  ADAPT_REMEDIATION: 'on',
  COVERAGE_GATE: 'enforce',
});
process.chdir(app);
require(path.join(app, 'server.js'));
