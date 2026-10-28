#!/usr/bin/env node
'use strict';
/**
 * Standalone, read-only check of the drand quicknet BLS signature of every sitting round in a sealed test's log.
 *   node tools/verify-drand-bls.js [log.jsonl ...]        default: spanish-check/results/log.jsonl and spanish-check-lc/results/log.jsonl (those that exist)
 * Needs only Node 18+ and the npm package @noble/curves (1.9.x). It writes nothing and touches no sealed file.
 * Scheme: drand quicknet = "bls-unchained-g1-rfc9380": signature on G1 (48 bytes), chain public key on G2 (96 bytes),
 * message = SHA-256(round as 8-byte big-endian), DST BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_, randomness = SHA-256(signature).
 * The public key is pinned below and bound to the chain hash by hashing (period | genesis | public key | group hash | beacon id).
 */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
let bls; try { bls = require('@noble/curves/bls12-381').bls12_381; } catch (e) { console.error('Install @noble/curves first (npm i @noble/curves).'); process.exit(2); }

const CHAIN = {
  hash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971', period: 3, genesis: 1692803367,
  publicKey: '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
  groupHash: 'f477d5c89f21a17c863a7f937c6a6d15859414d2be09cd448d4279af331c5d3e', beaconId: 'quicknet',
};
const DST = 'BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function chainOk() {
  const per = Buffer.alloc(4); per.writeUInt32BE(CHAIN.period); const gen = Buffer.alloc(8); gen.writeBigUInt64BE(BigInt(CHAIN.genesis));
  return sha(Buffer.concat([per, gen, Buffer.from(CHAIN.publicKey, 'hex'), Buffer.from(CHAIN.groupHash, 'hex'), Buffer.from(CHAIN.beaconId)])) === CHAIN.hash;
}
function check(round, signature, randomness) {
  try {
    if (!/^[0-9a-f]{96}$/.test(signature || '')) return 'signature is not 48 bytes of hex';
    const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(round));
    const H = bls.shortSignatures.hash(crypto.createHash('sha256').update(m).digest(), DST);
    if (!bls.shortSignatures.verify(signature, H, CHAIN.publicKey)) return 'BLS signature does not verify';
    if (sha(Buffer.from(signature, 'hex')) !== randomness) return 'randomness is not SHA-256 of the signature';
    return null;
  } catch (e) { return `invalid signature (${e.message})`; }
}

let fails = 0;
const say = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) fails++; };
say(chainOk(), `pinned public key, period, genesis, group hash and beacon id hash to the chain hash ${CHAIN.hash.slice(0, 16)}...`);

const root = path.join(__dirname, '..');
const logs = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(root, 'spanish-check', 'results', 'log.jsonl'), path.join(root, 'spanish-check-lc', 'results', 'log.jsonl')].filter((p) => fs.existsSync(p));
if (!logs.length) { console.log('no logs found'); process.exit(fails ? 1 : 0); }
let first = null;
for (const f of logs) {
  const evs = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === 'sitting_start');
  console.log(`\n${f}: ${evs.length} sitting start(s)`);
  for (const e of evs) {
    if (!first) first = e;
    const why = check(e.round, e.signature, e.randomness);
    say(!why, `sitting ${e.sitting_id}: round ${e.round} (made ${new Date((CHAIN.genesis + (e.round - 1) * CHAIN.period) * 1000).toISOString()}) signature ${why ? 'REJECTED: ' + why : 'verifies against the chain public key'}`);
  }
}
if (first) {
  const sig = first.signature; const bad = sig.slice(0, -1) + (sig.slice(-1) === '0' ? '1' : '0');
  say(check(first.round, bad, first.randomness) !== null, 'self-test: the same round with one bit of the signature changed is rejected');
  say(check(first.round + 1, sig, first.randomness) !== null, 'self-test: the genuine signature presented for the next round is rejected');
}
console.log(fails ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exitCode = fails ? 1 : 0;
