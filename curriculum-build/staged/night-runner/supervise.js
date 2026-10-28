// Keeps runner.js going: restarts it 30 s after any exit that is not "all done" (0).
// Stop it by creating state/STOP (the runner is then left to finish nothing new).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const STOP = path.join(HERE, 'state', 'STOP');
const LOG = path.join(HERE, 'runner.log');
const say = (m) => fs.appendFileSync(LOG, `${new Date().toISOString().slice(0, 19)}Z supervisor: ${m}\n`);
fs.writeFileSync(path.join(HERE, 'state', 'supervisor.pid'), String(process.pid));
let child = null;
function start() {
  if (fs.existsSync(STOP)) { say('STOP file present; not starting'); process.exit(0); }
  const out = fs.openSync(path.join(HERE, 'runner.out'), 'a');
  child = spawn(process.execPath, ['--max-old-space-size=3072', path.join(HERE, 'runner.js'), ...process.argv.slice(2)], { cwd: path.join(HERE, '..', '..', '..'), stdio: ['ignore', out, out], env: process.env });
  fs.writeFileSync(path.join(HERE, 'state', 'runner.pid'), String(child.pid));
  say(`runner started pid ${child.pid}`);
  child.on('exit', (code, sig) => {
    say(`runner exited code ${code} ${sig || ''}`);
    if (code === 0) { say('all done'); process.exit(0); }
    setTimeout(start, 30000);
  });
}
// a STOP file stops the runner too
setInterval(() => { if (fs.existsSync(STOP) && child) { say('STOP: stopping runner'); child.kill(); process.exit(0); } }, 15000);
start();
