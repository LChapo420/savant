'use strict';
/**
 * Full drand quicknet signature check (needs the npm package @noble/curves, 1.9.x; nothing else).
 * Scheme "bls-unchained-g1-rfc9380" (the quicknet chain info says so): signatures are 48-byte points on G1, the chain's public key is a
 * 96-byte point on G2, the signed message is SHA-256 of the round number as an 8-byte big-endian integer (unchained: the previous
 * signature is not part of it), hashed to G1 with the domain separation tag below. randomness = SHA-256(signature).
 */
const crypto = require('crypto');

const DST = 'BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_';
let bls = null;
function load() {
  if (bls === null) { try { bls = require('@noble/curves/bls12-381').bls12_381; } catch (e) { bls = false; } }
  return bls || null;
}
const available = () => !!load();

/** @returns {{ok:boolean, reason:string}} ok only if the signature verifies against publicKeyHex for that round AND randomness = SHA-256(signature). */
function verifyRound({ round, signature, randomness }, publicKeyHex) {
  const b = load();
  if (!b) return { ok: false, reason: '@noble/curves is not installed' };
  try {
    if (!/^[0-9a-f]{96}$/.test(signature || '')) return { ok: false, reason: 'signature is not 48 bytes of hex' };
    if (!Number.isSafeInteger(round) || round < 1) return { ok: false, reason: 'bad round' };
    const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(round));
    const msg = crypto.createHash('sha256').update(m).digest();
    const H = b.shortSignatures.hash(msg, DST);
    if (!b.shortSignatures.verify(signature, H, publicKeyHex)) return { ok: false, reason: 'BLS signature does not verify' };
    if (crypto.createHash('sha256').update(Buffer.from(signature, 'hex')).digest('hex') !== randomness) return { ok: false, reason: 'randomness is not SHA-256 of the signature' };
    return { ok: true, reason: '' };
  } catch (e) { return { ok: false, reason: `invalid signature (${e.message})` }; }
}

/** A copy of the signature with one bit flipped (for the negative self-test; may not even be a curve point, which also counts as rejected). */
function tamper(signature) { const last = signature.slice(-1); return signature.slice(0, -1) + (last === '0' ? '1' : '0'); }

module.exports = { DST, available, verifyRound, tamper };
