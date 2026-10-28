// The placement-uitest server, pointed at the skills round 3 scratch copy of the app
// (all four patches applied) and a copy of db.uitest.json: port 6799, every model
// key blanked, the four skill flags on. The live app and its data are not touched.
const path = require('path');
const sk3 = path.join(__dirname, '..');
const app = path.join(sk3, 'app');
process.env.DB_FILE = path.join(sk3, 'db.uitest.sk3.json');
process.env.PORT = '6799';
process.env.OLLAMA_ENABLED = '0';
for (const k of Object.keys(process.env)) if (/KEY|TOKEN|SECRET_API|WORKSPACE/.test(k)) process.env[k] = '';
Object.assign(process.env, { SKILL_RECORD: 'on', SKILL_STAGE_TESTS: 'on', SKILL_STAGE_GATE: 'on', SKILL_DOSE: 'on' });
process.chdir(app);
require(path.join(app, 'server.js'));
