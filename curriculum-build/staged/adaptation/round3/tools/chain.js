// The package.json test chain, one command at a time (one failure never hides the
// rest), on a DB copy with every key blanked and OLLAMA_ENABLED=0 — except
// ollama-provider-test, which mocks HTTP and checks OLLAMA_ENABLED itself, so it
// runs without that variable. Then the extra scripts given on the command line.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const repo = process.argv[2];
const extra = process.argv.slice(3);
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const cmds = [...pkg.scripts.test.split('&&').map((s) => s.trim()).filter(Boolean), ...extra.map((s) => `node ${s}`)];
const dbCopy = path.join(repo, 'data', 'db.chain.json');
fs.copyFileSync(path.join(repo, 'data', 'db.copy.json'), dbCopy);
const base = { ...process.env, DB_FILE: dbCopy, NODE_ENV: 'test' };
for (const k of Object.keys(base)) if (/KEY|TOKEN|SECRET_API|WORKSPACE/.test(k)) base[k] = '';
for (const k of ['ADAPTIVE_TEACHING', 'COVERAGE_GATE', 'ADAPT_REVIEW_SESSION', 'ADAPT_CONSOLIDATE', 'ADAPT_EFFORT', 'ADAPT_REMEDIATION']) delete base[k];
let failed = 0;
for (const cmd of cmds) {
  const t0 = Date.now();
  const env = { ...base };
  if (/ollama-provider-test/.test(cmd)) delete env.OLLAMA_ENABLED; else env.OLLAMA_ENABLED = '0';
  let ok = true; let tail = '';
  try {
    const out = execSync(cmd, { cwd: repo, stdio: 'pipe', timeout: 20 * 60 * 1000, env, maxBuffer: 64 * 1024 * 1024 });
    tail = String(out).trim().split('\n').slice(-1)[0];
  } catch (err) {
    ok = false; failed++;
    const text = `${err.stdout || ''}${err.stderr || ''}`.trim().split('\n');
    tail = (err.signal ? `killed (${err.signal}) ` : '') + (text.filter((l) => /FAIL|Error|failure/i.test(l)).slice(0, 4).join(' | ') || text.slice(-1)[0]);
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${Math.round((Date.now() - t0) / 1000)}s  ${cmd}  :: ${tail.slice(0, 300)}`);
}
console.log(`${cmds.length - failed}/${cmds.length} passed`);
