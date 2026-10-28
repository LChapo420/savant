#!/usr/bin/env node
'use strict';
/**
 * Writes SEAL.txt: SHA-256 of every file that decides the test (pool, protocol, scoring, engine, build and verify code,
 * the page and routes) and of the four frozen raw Tatoeba exports, plus a timestamp.
 * Run once, after everything is final. Anything that changes afterwards makes verify.js fail.
 */
const fs = require('fs');
const path = require('path');
const { sha256 } = require('../lib/common');
const ROOT = path.join(__dirname, '..');

const CORE = [
  'PROTOCOL.md', 'VERIFY.md', 'pool.json', 'overlap-exclusions.json',
  'scoring.js', 'engine.js', 'verify.js',
  'lib/common.js', 'lib/candidates.js', 'lib/draw.js', 'lib/replay.js', 'lib/external.js',
  'scripts/build-pool.js', 'scripts/scan-app.js', 'scripts/seal.js', 'scripts/timestamp-seal.js', 'scripts/simulate.js', 'scripts/test-engine.js',
  'tsa/cacert.pem', 'tsa/tsa.crt',
];
const GLUE = ['../routes/spanish-check.js', '../public/spanish-check.html', '../public/js/spanish-check.js'];
const RAW = ['spa_sentences.tsv', 'eng_sentences.tsv', 'spa-eng_links.tsv', 'spa_sentences_with_audio.tsv', 'spa_sentences.tsv.bz2', 'eng_sentences.tsv.bz2', 'spa-eng_links.tsv.bz2', 'spa_sentences_with_audio.tsv.bz2'].map((f) => `raw/${f}`);

const lines = [];
lines.push('SPANISH-CHECK SEAL v1');
lines.push(`sealed_at: ${new Date().toISOString()}`);
lines.push('format: <sha256>  <path relative to the spanish-check folder>   (sha256sum -c compatible)');
lines.push('');
lines.push('# core: protocol, pool, scoring, engine, build and verification code, trust anchors');
for (const f of CORE) lines.push(`${sha256(fs.readFileSync(path.join(ROOT, f)))}  ${f}`);
lines.push('');
lines.push('# app glue (the routes and the page; the app only mounts them)');
for (const f of GLUE) lines.push(`${sha256(fs.readFileSync(path.join(ROOT, f)))}  ${f}`);
lines.push('');
lines.push('# frozen raw Tatoeba exports (downloads.tatoeba.org); the pool is rebuilt from these');
for (const f of RAW) lines.push(`${sha256(fs.readFileSync(path.join(ROOT, f)))}  ${f}`);
lines.push('');
fs.writeFileSync(path.join(ROOT, 'SEAL.txt'), lines.join('\n'));
console.log(lines.join('\n'));
console.log('SEAL.txt sha256', sha256(fs.readFileSync(path.join(ROOT, 'SEAL.txt'))));
