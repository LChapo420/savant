#!/usr/bin/env node
'use strict';
/**
 * Time-stamps SHA-256(SEAL.txt) with an RFC 3161 authority (freetsa.org) and OpenTimestamps, and stores the tokens in seal-proof/.
 * Only the 32-byte hash leaves this machine. Verifies the RFC 3161 token with openssl straight away.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { sha256 } = require('../lib/common');
const ext = require('../lib/external');
const ROOT = path.join(__dirname, '..');

(async () => {
  const seal = fs.readFileSync(path.join(ROOT, 'SEAL.txt'));
  const digest = sha256(seal);
  const dir = path.join(ROOT, 'seal-proof');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SEAL.sha256'), `${digest}  SEAL.txt\n`);
  console.log('SEAL.txt sha256', digest);
  let tsaOk = false; let otsOk = false;
  try {
    const t = await ext.timestampTsa(digest);
    fs.writeFileSync(path.join(dir, 'SEAL.tsq'), t.tsq); fs.writeFileSync(path.join(dir, 'SEAL.tsr'), t.tsr);
    const v = spawnSync('openssl', ['ts', '-verify', '-in', path.join(dir, 'SEAL.tsr'), '-queryfile', path.join(dir, 'SEAL.tsq'), '-CAfile', path.join(ROOT, 'tsa', 'cacert.pem'), '-untrusted', path.join(ROOT, 'tsa', 'tsa.crt')], { encoding: 'utf8' });
    const txt = spawnSync('openssl', ['ts', '-reply', '-in', path.join(dir, 'SEAL.tsr'), '-text'], { encoding: 'utf8' }).stdout;
    console.log('RFC 3161 (freetsa.org):', /Verification: OK/.test(v.stdout + v.stderr) ? 'granted and verified' : 'stored but NOT verified', '|', (/Time stamp: (.+)/.exec(txt) || [])[1]);
    tsaOk = /Verification: OK/.test(v.stdout + v.stderr);
  } catch (e) { console.log('RFC 3161 failed:', e.message); }
  try {
    const o = await ext.timestampOts(digest);
    fs.writeFileSync(path.join(dir, 'SEAL.ots'), o.ots);
    console.log('OpenTimestamps: calendar commitment stored from', o.calendar, `(${o.ots.length} bytes; becomes Bitcoin-anchored after the calendar's next block, run "ots upgrade")`);
    otsOk = true;
  } catch (e) { console.log('OpenTimestamps failed:', e.message); }
  if (!tsaOk && !otsOk) { console.error('NO timestamp succeeded'); process.exit(1); }
})();
