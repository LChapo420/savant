#!/usr/bin/env node
'use strict';
/**
 * Writes SEAL.txt: SHA-256 of every file that decides the test (pool, protocol, scoring, engine, build and verify code,
 * the page and routes, the first-test modules this test imports read-only) and of the frozen raw Tatoeba exports.
 * Run once, after everything is final. Anything that changes afterwards makes verify.js fail.
 */
const fs = require('fs');
const path = require('path');
const { sha256 } = require('../../spanish-check/lib/common');
const ROOT = path.join(__dirname, '..');

const CORE = [
  'PROTOCOL.md', 'VERIFY.md', 'pool.json', 'overlap-exclusions-lc.json',
  'scoring.js', 'engine.js', 'verify.js',
  'lib/draw.js', 'lib/replay.js', 'lib/firsttest.js', 'lib/bls.js',
  'scripts/build-pool.js', 'scripts/scan-app.js', 'scripts/seal.js', 'scripts/timestamp-seal.js', 'scripts/simulate.js', 'scripts/harness.js', 'scripts/e2e-http.js', 'scripts/test-engine.js',
  'tsa/cacert.pem', 'tsa/tsa.crt',
];
// modules and data of the first test that this test imports READ-ONLY (they are sealed by the first test's own SEAL.txt as well)
const FIRST = [
  '../spanish-check/SEAL.txt', '../spanish-check/pool.json', '../spanish-check/overlap-exclusions.json', '../spanish-check/scoring.js',
  '../spanish-check/lib/common.js', '../spanish-check/lib/candidates.js', '../spanish-check/lib/draw.js', '../spanish-check/lib/replay.js', '../spanish-check/lib/external.js',
];
const GLUE = ['../routes/spanish-check-lc.js', '../public/spanish-listening.html', '../public/js/spanish-listening.js'];
const RAW = ['spa_sentences.tsv', 'eng_sentences.tsv', 'spa-eng_links.tsv', 'spa_sentences_with_audio.tsv', 'spa_sentences.tsv.bz2', 'eng_sentences.tsv.bz2', 'spa-eng_links.tsv.bz2', 'spa_sentences_with_audio.tsv.bz2'].map((f) => `../spanish-check/raw/${f}`);

const lines = [];
lines.push('SPANISH-LISTENING SEAL v1');
lines.push(`sealed_at: ${new Date().toISOString()}`);
lines.push('format: <sha256>  <path relative to the spanish-check-lc folder>   (sha256sum -c compatible)');
lines.push('');
lines.push('# core: protocol, pool, scoring, engine, build and verification code, trust anchors');
for (const f of CORE) lines.push(`${sha256(fs.readFileSync(path.join(ROOT, f)))}  ${f}`);
lines.push('');
lines.push('# first-test modules and data imported read-only (the first test itself is frozen)');
for (const f of FIRST) lines.push(`${sha256(fs.readFileSync(path.join(ROOT, f)))}  ${f}`);
lines.push('');
lines.push('# app glue (the routes and the page; the app only mounts them)');
for (const f of GLUE) lines.push(`${sha256(fs.readFileSync(path.join(ROOT, f)))}  ${f}`);
lines.push('');
lines.push('# frozen raw Tatoeba exports (downloads.tatoeba.org, shared with the first test); the pool is rebuilt from these');
for (const f of RAW) lines.push(`${sha256(fs.readFileSync(path.join(ROOT, f)))}  ${f}`);
lines.push('');
fs.writeFileSync(path.join(ROOT, 'SEAL.txt'), lines.join('\n'));
console.log(lines.join('\n'));
console.log('SEAL.txt sha256', sha256(fs.readFileSync(path.join(ROOT, 'SEAL.txt'))));
