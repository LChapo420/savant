#!/usr/bin/env node
'use strict';
/**
 * Writes spanish-study-tests/SEAL.txt: SHA-256 of the copied engine, scoring, draw/replay code, the protocol
 * and the shared pool (../spanish-check/pool.json, which is read, never changed). Run once, on the owner's machine
 * where pool.json exists, after the OWNER lines in docs/yc/DUOLINGO-STUDY-PROTOCOL.md are filled in. Then time-stamp
 * SEAL.txt with spanish-check/scripts/timestamp-seal.js before anyone joins. Until SEAL.txt exists the engine
 * refuses to start any sitting.
 */
const fs = require('fs');
const path = require('path');
const { sha256 } = require('../lib/common');
const ROOT = path.join(__dirname, '..');

const FILES = [
  'scoring.js', 'engine.js', 'lib/common.js', 'lib/draw.js', 'lib/replay.js', 'lib/external.js',
  'scripts/seal.js', '../spanish-check/pool.json', '../docs/yc/DUOLINGO-STUDY-PROTOCOL.md',
  '../services/spanish-study-tests.js', '../routes/spanish-study-tests.js',
];
const lines = ['SPANISH-STUDY-TESTS SEAL v1', `sealed_at: ${new Date().toISOString()}`, 'format: <sha256>  <path relative to the spanish-study-tests folder>   (sha256sum -c compatible)', ''];
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.error(`missing ${f}: cannot seal (is spanish-check/pool.json on this machine?)`); process.exit(1); }
  lines.push(`${sha256(fs.readFileSync(p))}  ${f}`);
}
lines.push('');
fs.writeFileSync(path.join(ROOT, 'SEAL.txt'), lines.join('\n'));
console.log(lines.join('\n'));
console.log('SEAL.txt sha256', sha256(fs.readFileSync(path.join(ROOT, 'SEAL.txt'))));
