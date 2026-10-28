// Loads only the named keys from the owner's .env (never printed). Values in the .env
// win over the process environment, so a stale shell variable cannot shadow them.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');

function loadKeys(names) {
  const envFile = [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env')].find((f) => fs.existsSync(f));
  if (!envFile) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const name of names) {
    const line = lines.find((l) => l.startsWith(`${name}=`));
    if (line) process.env[name] = line.slice(name.length + 1).replace(/^["']|["']$/g, '').trim();
  }
}

module.exports = { ROOT, loadKeys };
