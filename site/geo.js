'use strict';
/**
 * In-memory IP geolocation from geo/ip-city.bin (built by tools/build-geo.js from
 * DB-IP's free "IP to City Lite" data, CC BY 4.0: "IP geolocation by DB-IP.com").
 * The whole file is held in one Buffer (about 37 MB for the full data) and looked
 * up by binary search over block starts, then a short varint walk. Nothing leaves
 * the server.
 *
 *   const geo = loadGeo(file);   // null when the file is missing or broken
 *   geo.lookup('81.2.69.142')    // { cc: 'GB', city: 'London', lat: 51.5, lon: -0.1 } or null
 */

const fs = require('fs');
const net = require('net');

const MAGIC = 'SVGEO\x01\0\0';

/** The UK, the EU (with its outermost regions and Aland), the EEA, Switzerland and
 *  the Crown Dependencies and Gibraltar: visitors here are asked before identified
 *  visit statistics are kept. */
const CONSENT_REGION = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF',
  'IS', 'LI', 'NO',
  'GB', 'GG', 'JE', 'IM', 'GI',
  'CH',
]);

function v4num(s) {
  const p = s.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) {
    if (!/^\d{1,3}$/.test(x) || Number(x) > 255) return null;
    n = n * 256 + Number(x);
  }
  return n;
}
/** The top 64 bits of an IPv6 address as [hi, lo], or null. */
function v6top(s) {
  if (!net.isIPv6(s)) return null;
  let a = s.split('%')[0].toLowerCase();
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (v4) {
    const n = v4num(v4[1]);
    a = `${a.slice(0, -v4[1].length)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const parts = a.split('::');
  const h = parts[0] ? parts[0].split(':') : [];
  const t = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const g = [...h, ...Array(parts.length === 2 ? 8 - h.length - t.length : 0).fill('0'), ...t].map((x) => parseInt(x, 16));
  return [g[0] * 65536 + g[1], g[2] * 65536 + g[3]];
}

const loaded = new Map(); // file -> { mtimeMs, size, geo }, so several apps in one process share one copy
function loadGeo(file) {
  let st;
  try { st = fs.statSync(file); } catch (e) { return null; }
  const hit = loaded.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.geo;
  const geo = readGeo(file);
  loaded.set(file, { mtimeMs: st.mtimeMs, size: st.size, geo });
  return geo;
}

function readGeo(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { return null; }
  if (buf.length < 12 || buf.toString('latin1', 0, 8) !== MAGIC) return null;
  let header;
  try { header = JSON.parse(buf.toString('utf8', 12, 12 + buf.readUInt32LE(8))); } catch (e) { return null; }
  const S = header.sections;
  const sec = (name) => S[name][0];
  const countries = buf.toString('latin1', sec('countries'), sec('countries') + S.countries[1]);
  const cityOff = sec('cityOff');
  const cityData = sec('cityData');
  const locs = sec('locs');
  const blocks4 = S.v4idx[1] / 8;
  const blocks6 = S.v6idx[1] / 12;
  const end4 = sec('v4data') + S.v4data[1];
  const end6 = sec('v6data') + S.v6data[1];
  const cityCache = new Map();

  function city(i) {
    let c = cityCache.get(i);
    if (c === undefined) {
      const a = buf.readUInt32LE(cityOff + i * 4);
      const b = buf.readUInt32LE(cityOff + i * 4 + 4);
      c = buf.toString('utf8', cityData + a, cityData + b);
      if (cityCache.size > 5000) cityCache.clear();
      cityCache.set(i, c);
    }
    return c;
  }
  function place(id) {
    if (!id) return null;
    const o = locs + id * 9;
    const ci = buf.readUInt8(o);
    return {
      cc: countries.slice(ci * 2, ci * 2 + 2),
      city: city(buf.readUInt32LE(o + 5)),
      lat: buf.readInt16LE(o + 1) / 10,
      lon: buf.readInt16LE(o + 3) / 10,
    };
  }
  // Reads an unsigned varint at pos; returns [value, nextPos]. big: as a BigInt.
  function uvar(pos, big) {
    let n = big ? 0n : 0;
    let mul = big ? 1n : 1;
    for (;;) {
      const b = buf[pos++];
      if (big) { n += BigInt(b & 127) * mul; mul <<= 7n; } else { n += (b & 127) * mul; mul *= 128; }
      if (b < 128) return [n, pos];
    }
  }

  function lookup4(n) {
    const idx = sec('v4idx');
    let lo = 0;
    let hi = blocks4 - 1;
    if (!blocks4 || n < buf.readUInt32LE(idx)) return null;
    while (lo < hi) { // last block whose start <= n
      const mid = (lo + hi + 1) >> 1;
      if (buf.readUInt32LE(idx + mid * 8) <= n) lo = mid; else hi = mid - 1;
    }
    let start = buf.readUInt32LE(idx + lo * 8);
    let pos = sec('v4data') + buf.readUInt32LE(idx + lo * 8 + 4);
    const stop = lo + 1 < blocks4 ? sec('v4data') + buf.readUInt32LE(idx + (lo + 1) * 8 + 4) : end4;
    let id;
    [id, pos] = uvar(pos, false);
    while (pos < stop) {
      const [d, p1] = uvar(pos, false);
      if (start + d > n) break;
      const [id2, p2] = uvar(p1, false);
      start += d;
      id = id2;
      pos = p2;
    }
    return place(id);
  }

  function lookup6(top) {
    const idx = sec('v6idx');
    const key = (i) => [buf.readUInt32LE(idx + i * 12), buf.readUInt32LE(idx + i * 12 + 4)];
    const le = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
    if (!blocks6 || !le(key(0), top)) return null;
    let lo = 0;
    let hi = blocks6 - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (le(key(mid), top)) lo = mid; else hi = mid - 1;
    }
    const k = key(lo);
    const target = (BigInt(top[0]) << 32n) | BigInt(top[1]);
    let start = (BigInt(k[0]) << 32n) | BigInt(k[1]);
    let pos = sec('v6data') + buf.readUInt32LE(idx + lo * 12 + 8);
    const stop = lo + 1 < blocks6 ? sec('v6data') + buf.readUInt32LE(idx + (lo + 1) * 12 + 8) : end6;
    let id;
    [id, pos] = uvar(pos, false);
    while (pos < stop) {
      const [d, p1] = uvar(pos, true);
      if (start + d > target) break;
      const [id2, p2] = uvar(p1, false);
      start += d;
      id = id2;
      pos = p2;
    }
    return place(id);
  }

  function lookup(ip) {
    let s = String(ip || '').trim();
    if (/^::ffff:/i.test(s) && net.isIPv4(s.slice(7))) s = s.slice(7);
    if (net.isIPv4(s)) return lookup4(v4num(s));
    const top = v6top(s);
    return top ? lookup6(top) : null;
  }

  return { lookup, info: { ...header.counts, source: header.source, built: header.built, bytes: buf.length } };
}

const inConsentRegion = (cc) => CONSENT_REGION.has(String(cc || '').toUpperCase());

module.exports = { loadGeo, inConsentRegion, CONSENT_REGION };
