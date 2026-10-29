'use strict';
/**
 * The three external services, all HTTPS and all carrying only hashes or public data:
 *   - drand quicknet (public randomness for the draw)
 *   - an RFC 3161 time-stamp authority (freetsa.org) for SEAL.txt and for the log head
 *   - OpenTimestamps calendars (Bitcoin-anchored, best effort)
 */
const crypto = require('crypto');
const { sha256 } = require('./common');
const { DRAND } = require('./replay');

const DRAND_RELAYS = ['https://api.drand.sh', 'https://api2.drand.sh', 'https://drand.cloudflare.com'];
const TSA_URL = 'https://freetsa.org/tsr';
const OTS_CALENDARS = ['https://a.pool.opentimestamps.org', 'https://b.pool.opentimestamps.org', 'https://a.pool.eternitywall.com'];

async function timedFetch(fetchFn, url, opts = {}, ms = 10000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetchFn(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(timer); }
}

/** True when the pinned drand parameters hash to the pinned chain hash (so the public key we expect really is that chain's key). */
function chainParamsOk() {
  const per = Buffer.alloc(4); per.writeUInt32BE(DRAND.period);
  const gen = Buffer.alloc(8); gen.writeBigUInt64BE(BigInt(DRAND.genesis));
  const h = sha256(Buffer.concat([per, gen, Buffer.from(DRAND.public_key, 'hex'), Buffer.from(DRAND.group_hash, 'hex'), Buffer.from(DRAND.beacon_id)]));
  return h === DRAND.chain_hash;
}

/** Latest drand quicknet round, checked against a second relay. Throws if the beacon cannot be reached or does not check out. */
async function fetchBeacon(fetchFn = fetch) {
  const primary = DRAND_RELAYS[0];
  if (!chainParamsOk()) throw new Error('pinned drand chain parameters do not hash to the chain hash');
  try {
    const res = await timedFetch(fetchFn, `${primary}/${DRAND.chain_hash}/info`, { headers: { accept: 'application/json' } }, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    if (info.hash !== DRAND.chain_hash || info.public_key !== DRAND.public_key || info.period !== DRAND.period || info.genesis_time !== DRAND.genesis) throw new Error('relay reports different chain parameters');
  } catch (e) { throw new Error(`drand chain info check failed: ${e.message}`); }
  let r;
  try {
    const res = await timedFetch(fetchFn, `${primary}/${DRAND.chain_hash}/public/latest`, { headers: { accept: 'application/json' } }, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    r = await res.json();
  } catch (e) { throw new Error(`drand beacon unreachable: ${e.message}`); }
  if (!r || !Number.isInteger(r.round) || !/^[0-9a-f]{64}$/.test(r.randomness || '') || !/^[0-9a-f]+$/.test(r.signature || '')) throw new Error('drand beacon returned an unexpected shape');
  if (sha256(Buffer.from(r.signature, 'hex')) !== r.randomness) throw new Error('drand randomness is not the SHA-256 of its signature');
  const relays = [{ url: primary, ok: true }];
  let agree = 0;
  for (const relay of DRAND_RELAYS.slice(1)) {
    let ok = null;
    for (let attempt = 0; attempt < 2 && ok === null; attempt++) {
      try {
        const res = await timedFetch(fetchFn, `${relay}/${DRAND.chain_hash}/public/${r.round}`, {}, 6000);
        if (res.status === 404 && attempt === 0) { await new Promise((z) => setTimeout(z, 1500)); continue; }
        if (!res.ok) { ok = false; break; }
        const j = await res.json();
        ok = j.round === r.round && j.randomness === r.randomness && j.signature === r.signature;
        if (!ok) throw new Error(`relay ${relay} disagrees about round ${r.round}`);
      } catch (e) { if (/disagrees/.test(e.message)) throw e; ok = false; }
    }
    relays.push({ url: relay, ok: !!ok });
    if (ok) agree++;
  }
  return { round: r.round, randomness: r.randomness, signature: r.signature, relays, agreeing_second_relays: agree };
}

// ---- RFC 3161 ------------------------------------------------------------

const der = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  const n = body.length;
  const len = n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
  return Buffer.concat([Buffer.from([tag]), len, body]);
};

/** DER TimeStampReq for a SHA-256 digest (hex): version 1, imprint, nonce, certReq TRUE. Nonce = first 7 bytes of the digest (deterministic). */
function buildTsq(digestHex) {
  const digest = Buffer.from(digestHex, 'hex');
  if (digest.length !== 32) throw new Error('digest must be 32 bytes');
  const sha256Oid = Buffer.from('0609608648016503040201', 'hex');
  const alg = der(0x30, sha256Oid, Buffer.from([0x05, 0x00]));
  const imprint = der(0x30, alg, der(0x04, digest));
  const nonce = Buffer.concat([Buffer.from([0x01]), digest.subarray(0, 7)]); // positive 8-byte integer
  return der(0x30, der(0x02, Buffer.from([0x01])), imprint, der(0x02, nonce), der(0x01, Buffer.from([0xff])));
}

async function timestampTsa(digestHex, fetchFn = fetch) {
  const tsq = buildTsq(digestHex);
  const res = await timedFetch(fetchFn, TSA_URL, { method: 'POST', headers: { 'content-type': 'application/timestamp-query' }, body: tsq }, 20000);
  if (!res.ok) throw new Error(`TSA HTTP ${res.status}`);
  const tsr = Buffer.from(await res.arrayBuffer());
  if (tsr.length < 500 || tsr[0] !== 0x30) throw new Error('TSA reply is not a granted timestamp');
  return { tsq, tsr, url: TSA_URL };
}

// ---- OpenTimestamps -------------------------------------------------------

const OTS_MAGIC = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex'); // "\0OpenTimestamps\0\0Proof\0" + 8 magic bytes
/** POST the digest to the calendars; returns a .ots file (header + file digest + the calendar's pending commitment). */
async function timestampOts(digestHex, fetchFn = fetch) {
  const digest = Buffer.from(digestHex, 'hex');
  let lastErr = null;
  for (const cal of OTS_CALENDARS) {
    try {
      const res = await timedFetch(fetchFn, `${cal}/digest`, { method: 'POST', headers: { accept: 'application/vnd.opentimestamps.v1', 'content-type': 'application/x-www-form-urlencoded' }, body: digest }, 15000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const frag = Buffer.from(await res.arrayBuffer());
      if (!frag.length) throw new Error('empty reply');
      const ots = Buffer.concat([OTS_MAGIC, Buffer.from([0x01]), Buffer.from([0x08]), digest, frag]);
      return { ots, calendar: cal };
    } catch (e) { lastErr = e; }
  }
  throw new Error(`no OpenTimestamps calendar accepted the digest: ${lastErr && lastErr.message}`);
}

module.exports = { chainParamsOk, DRAND_RELAYS, TSA_URL, OTS_CALENDARS, fetchBeacon, buildTsq, timestampTsa, timestampOts, OTS_MAGIC };
