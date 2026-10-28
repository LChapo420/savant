// Start the site locally with the right .env.
//
// The server reads .env from the working directory. In this copy the keys sit
// one folder up (next to the repo), so run from there when the repo has none.
//   node scripts/spanish/serve-local.js     then open http://localhost:6767/spanish/lab
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..', '..');
const parent = path.join(repo, '..');
if (!fs.existsSync(path.join(repo, '.env')) && fs.existsSync(path.join(parent, '.env'))) process.chdir(parent);
else process.chdir(repo);
require(path.join(repo, 'server.js'));
