#!/usr/bin/env node
/**
 * Run a script with environment settings, the same on every system: `node scripts/with-env.js FACT_CHECK_ALL=1 scripts/x-test.js`.
 * A step in test-steps.json can't use `FACT_CHECK_ALL=1 node ...`, because Windows shells don't read that.
 */
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const env = { ...process.env };
while (args.length && /^[A-Z][A-Z0-9_]*=/.test(args[0])) {
  const at = args[0].indexOf('=');
  env[args[0].slice(0, at)] = args[0].slice(at + 1);
  args.shift();
}
if (!args.length) {
  console.error('usage: node scripts/with-env.js NAME=value script.js [args]');
  process.exit(2);
}
const run = spawnSync(process.execPath, args, { stdio: 'inherit', env });
if (run.error) console.error(run.error.message);
process.exit(run.status === null ? 1 : run.status);
