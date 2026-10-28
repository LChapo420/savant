#!/usr/bin/env node
/**
 * Builds the site's geo data from two downloads in site/geo/raw/ (gitignored):
 *
 *   dbip-city-lite-YYYY-MM.csv.gz  DB-IP "IP to City Lite" (CC BY 4.0, https://db-ip.com)
 *   ne_50m_land.geojson           Natural Earth 50m land (public domain)
 *
 * and writes the compact files the server uses (kept in the repo):
 *
 *   geo/ip-city.bin    sorted IPv4 and IPv6 ranges -> country, city, lat/lon (0.1 deg)
 *   geo/land-50m.json simplified land outlines for the admin page's globe
 *
 *   node tools/build-geo.js                      build from the newest files in geo/raw/
 *   node tools/build-geo.js --csv f.csv[.gz] --land f.geojson --out dir [--block 64]
 *   node server.js geo-update                    download this month's DB-IP file, then build
 *
 * ip-city.bin layout (little endian):
 *   "SVGEO\x01\0\0", u32 header length, header JSON (offsets of each section), then
 *   countries  2 ASCII bytes each
 *   cityOff    u32 per city + 1 (offsets into cityData)
 *   cityData   UTF-8 city names, back to back
 *   locs       9 bytes each: u8 country, i16 lat*10, i16 lon*10, u32 city. Loc 0 = unknown.
 *   v4idx      8 bytes per block: u32 first start address, u32 offset into v4data
 *   v4data     per block: varint loc of the first range, then (varint delta, varint loc) pairs
 *   v6idx      12 bytes per block: u32 hi, u32 lo (the top 64 bits of the start), u32 offset
 *   v6data     as v4data, the deltas taken on the top 64 bits
 * Adjacent ranges that land on the same place (after rounding to 0.1 deg) are merged,
 * and locations are numbered by how often they occur, so common ones take one byte.
 * IPv6 is looked up by its top 64 bits (the network part); a range that starts inside
 * a /64 is folded into that /64.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const SITE = path.join(__dirname, '..');
const GEO_DIR = path.join(SITE, 'geo');
const RAW_DIR = path.join(GEO_DIR, 'raw');
const MAGIC = Buffer.from('SVGEO\x01\0\0', 'latin1');

/* ── CSV ─────────────────────────────────────────────────────────────────── */

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

function lines(file) {
  let input = fs.createReadStream(file);
  if (/\.gz$/i.test(file)) input = input.pipe(zlib.createGunzip());
  return readline.createInterface({ input, crlfDelay: Infinity });
}

/** IPv4 dotted quad -> unsigned 32-bit number, or null. */
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
/** IPv6 text -> [hi, lo], the top 64 bits as two unsigned 32-bit numbers, or null. */
function v6top(s) {
  let a = String(s).split('%')[0].toLowerCase();
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (v4) {
    const n = v4num(v4[1]);
    if (n === null) return null;
    a = `${a.slice(0, -v4[1].length)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const parts = a.split('::');
  if (parts.length > 2) return null;
  const h = parts[0] ? parts[0].split(':') : [];
  const t = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? 8 - h.length - t.length : 0;
  if (fill < 0 || (parts.length === 1 && h.length !== 8)) return null;
  const g = [...h, ...Array(fill).fill('0'), ...t];
  if (g.length !== 8 || g.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  const n = g.map((x) => parseInt(x, 16));
  return [n[0] * 65536 + n[1], n[2] * 65536 + n[3]];
}

/**
 * Streams the CSV and calls fn(family, start, locKey) once per run of ranges that
 * share a place. start: a number (IPv4) or [hi, lo] (IPv6). locKey '' = unknown.
 */
async function eachRange(csv, fn) {
  const prev = { 4: null, 6: null };
  let rows = 0;
  for await (const line of lines(csv)) {
    if (!line || line[0] === '#') continue;
    const f = parseCsvLine(line);
    if (f.length < 8) continue;
    const [a, , , cc, , city, lat, lon] = f;
    const fam = a.includes(':') ? 6 : 4;
    const start = fam === 4 ? v4num(a) : v6top(a);
    if (start === null) continue;
    rows += 1;
    const la = Math.round(Number(lat) * 10);
    const lo = Math.round(Number(lon) * 10);
    const known = /^[A-Z]{2}$/.test(cc) && cc !== 'ZZ' && Number.isFinite(la) && Number.isFinite(lo);
    const key = known ? `${cc}\t${city.slice(0, 80)}\t${la}\t${lo}` : '';
    if (key === prev[fam]) continue;
    prev[fam] = key;
    fn(fam, start, key);
  }
  return rows;
}

/* ── varints ─────────────────────────────────────────────────────────────── */

class Out {
  constructor() { this.chunks = []; this.buf = Buffer.alloc(1 << 20); this.pos = 0; this.total = 0; }
  byte(b) {
    if (this.pos === this.buf.length) { this.chunks.push(this.buf); this.buf = Buffer.alloc(1 << 20); this.pos = 0; }
    this.buf[this.pos++] = b;
    this.total += 1;
  }
  uvar(n) { // n: a non-negative safe integer
    while (n >= 128) { this.byte((n % 128) | 128); n = Math.floor(n / 128); }
    this.byte(n);
  }
  bigvar(n) { // n: a non-negative BigInt
    while (n >= 128n) { this.byte(Number(n & 127n) | 128); n >>= 7n; }
    this.byte(Number(n));
  }
  done() { return Buffer.concat([...this.chunks, this.buf.subarray(0, this.pos)]); }
}

/* ── the IP file ─────────────────────────────────────────────────────────── */

/**
 * Builds ip-city.bin from a DB-IP city CSV (.csv or .csv.gz). Two passes over the
 * file: the first counts how often each place occurs, the second writes.
 */
async function buildIpFile(csv, outFile, { blockSize = 64, source = path.basename(csv), log = () => {} } = {}) {
  const t0 = Date.now();
  const freq = new Map();
  const rows = await eachRange(csv, (fam, start, key) => { if (key) freq.set(key, (freq.get(key) || 0) + 1); });
  log(`pass 1: ${rows.toLocaleString('en')} rows, ${freq.size.toLocaleString('en')} places (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

  // Places by frequency (id 0 = unknown), then the country and city tables.
  const keys = [...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a) || (a < b ? -1 : 1));
  freq.clear();
  const locId = new Map(keys.map((k, i) => [k, i + 1]));
  const countries = [];
  const countryIdx = new Map();
  const cities = [];
  const cityIdx = new Map();
  const locs = Buffer.alloc((keys.length + 1) * 9);
  keys.forEach((k, i) => {
    const [cc, city, la, lo] = k.split('\t');
    if (!countryIdx.has(cc)) { countryIdx.set(cc, countries.length); countries.push(cc); }
    if (!cityIdx.has(city)) { cityIdx.set(city, cities.length); cities.push(city); }
    const o = (i + 1) * 9;
    locs.writeUInt8(countryIdx.get(cc), o);
    locs.writeInt16LE(Number(la), o + 1);
    locs.writeInt16LE(Number(lo), o + 3);
    locs.writeUInt32LE(cityIdx.get(city), o + 5);
  });
  if (countries.length > 255) throw new Error('more than 255 countries');
  const cityBufs = cities.map((c) => Buffer.from(c, 'utf8'));
  const cityOff = Buffer.alloc((cities.length + 1) * 4);
  let off = 0;
  cityBufs.forEach((b, i) => { cityOff.writeUInt32LE(off, i * 4); off += b.length; });
  cityOff.writeUInt32LE(off, cities.length * 4);

  // Pass 2: the ranges, in blocks.
  const v4 = { idx: new Out(), data: new Out(), n: 0, blocks: 0, prev: 0 };
  const v6 = { idx: new Out(), data: new Out(), n: 0, blocks: 0, prev: 0n, pending: null };
  const u32 = (out, n) => { out.byte(n & 255); out.byte((n >>> 8) & 255); out.byte((n >>> 16) & 255); out.byte((n >>> 24) & 255); };
  function put4(start, id) {
    if (v4.n % blockSize === 0) {
      u32(v4.idx, start); u32(v4.idx, v4.data.total); v4.blocks += 1;
      v4.data.uvar(id);
    } else {
      v4.data.uvar(start - v4.prev); v4.data.uvar(id);
    }
    v4.prev = start;
    v4.n += 1;
  }
  function put6(top, id) {
    const big = (BigInt(top[0]) << 32n) | BigInt(top[1]);
    if (v6.n % blockSize === 0) {
      u32(v6.idx, top[0]); u32(v6.idx, top[1]); u32(v6.idx, v6.data.total); v6.blocks += 1;
      v6.data.uvar(id);
    } else {
      v6.data.bigvar(big - v6.prev); v6.data.uvar(id);
    }
    v6.prev = big;
    v6.n += 1;
  }
  // IPv6: ranges that share a /64 keep the later place; runs that share a place merge.
  let last6 = null;
  const flush6 = () => { if (v6.pending) { put6(v6.pending.top, v6.pending.id); last6 = v6.pending.id; v6.pending = null; } };
  const t1 = Date.now();
  await eachRange(csv, (fam, start, key) => {
    const id = key ? locId.get(key) : 0;
    if (fam === 4) { put4(start, id); return; }
    const p = v6.pending;
    if (p && p.top[0] === start[0] && p.top[1] === start[1]) { p.id = id; return; }
    flush6();
    if (id === last6) return;
    v6.pending = { top: start, id };
  });
  flush6();
  log(`pass 2: ${v4.n.toLocaleString('en')} IPv4 and ${v6.n.toLocaleString('en')} IPv6 ranges (${((Date.now() - t1) / 1000).toFixed(1)} s)`);

  const sections = [
    ['countries', Buffer.from(countries.join(''), 'latin1')],
    ['cityOff', cityOff],
    ['cityData', Buffer.concat(cityBufs)],
    ['locs', locs],
    ['v4idx', v4.idx.done()],
    ['v4data', v4.data.done()],
    ['v6idx', v6.idx.done()],
    ['v6data', v6.data.done()],
  ];
  const header = {
    v: 1,
    source,
    attribution: 'IP geolocation by DB-IP.com (https://db-ip.com), CC BY 4.0',
    built: new Date().toISOString(),
    blockSize,
    counts: { places: keys.length, countries: countries.length, cities: cities.length, v4: v4.n, v6: v6.n, v4blocks: v4.blocks, v6blocks: v6.blocks },
    sections: {},
  };
  // Offsets depend on the header's own length; settle them in two rounds.
  let headerBuf = Buffer.alloc(0);
  for (let round = 0; round < 3; round += 1) {
    let pos = MAGIC.length + 4 + headerBuf.length;
    for (const [name, buf] of sections) { header.sections[name] = [pos, buf.length]; pos += buf.length; }
    const next = Buffer.from(JSON.stringify(header), 'utf8');
    if (next.length === headerBuf.length) { headerBuf = next; break; }
    headerBuf = next;
  }
  const len = Buffer.alloc(4);
  len.writeUInt32LE(headerBuf.length);
  const all = Buffer.concat([MAGIC, len, headerBuf, ...sections.map((s) => s[1])]);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const tmp = `${outFile}.tmp`;
  fs.writeFileSync(tmp, all);
  fs.renameSync(tmp, outFile);
  log(`wrote ${outFile}: ${(all.length / 1048576).toFixed(1)} MB`);
  return { bytes: all.length, ...header.counts };
}

/* ── the land outlines ───────────────────────────────────────────────────── */

/** Douglas-Peucker on [[x, y], ...] (degrees), keeping the ends. A closed ring is
 *  split at its point farthest from the start, and each half simplified. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const [fx, fy] = pts[0];
  const [lx, ly] = pts[pts.length - 1];
  if (fx === lx && fy === ly && pts.length > 3) {
    let far = 1;
    let best = -1;
    pts.forEach(([x, y], i) => { const d = Math.hypot(x - fx, y - fy); if (d > best) { best = d; far = i; } });
    const a = simplify(pts.slice(0, far + 1), tol);
    const b = simplify(pts.slice(far), tol);
    return [...a, ...b.slice(1)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Natural Earth land GeoJSON -> { v, scale, rings: [[x0, y0, x1, y1, ...], ...] }
 * with coordinates as integers of degrees * 10.
 */
function buildLand(geojsonFile, outFile, { tolerance = 0.02, scale = 100 } = {}) {
  const gj = JSON.parse(fs.readFileSync(geojsonFile, 'utf8'));
  const rings = [];
  let inPts = 0;
  for (const f of gj.features || []) {
    const g = f.geometry || {};
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      for (const ring of poly) {
        inPts += ring.length;
        // Close the ring explicitly so the simplifier keeps the join.
        const s = simplify(ring.map(([x, y]) => [x, y]), tolerance);
        const flat = [];
        let px = null;
        let py = null;
        for (const [x, y] of s) {
          const X = Math.round(x * scale);
          const Y = Math.round(y * scale);
          if (X === px && Y === py) continue;
          flat.push(X, Y);
          px = X;
          py = Y;
        }
        if (flat.length >= 8) rings.push(flat);
      }
    }
  }
  const out = {
    v: 1,
    source: `Natural Earth land, ${path.basename(geojsonFile)} (public domain), lightly simplified`,
    scale,
    rings,
  };
  const text = JSON.stringify(out);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(`${outFile}.tmp`, text);
  fs.renameSync(`${outFile}.tmp`, outFile);
  return { bytes: text.length, rings: rings.length, points: rings.reduce((n, r) => n + r.length / 2, 0), inPoints: inPts };
}

/**
 * Natural Earth boundary-line GeoJSON (LineString / MultiLineString) ->
 * { v, scale, lines: [[x0, y0, x1, y1, ...], ...] }, degrees * 10, simplified.
 * Used for the globe's country borders and state/province lines.
 */
function buildLines(geojsonFile, outFile, { tolerance = 0.02, scale = 100, source = path.basename(geojsonFile) } = {}) {
  const gj = JSON.parse(fs.readFileSync(geojsonFile, 'utf8'));
  const lines = [];
  let inPts = 0;
  for (const f of gj.features || []) {
    const g = f.geometry || {};
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const part of parts) {
      inPts += part.length;
      const s = part.length > 2 ? simplify(part.map(([x, y]) => [x, y]), tolerance) : part;
      const flat = [];
      let px = null;
      let py = null;
      for (const [x, y] of s) {
        const X = Math.round(x * scale);
        const Y = Math.round(y * scale);
        if (X === px && Y === py) continue;
        flat.push(X, Y);
        px = X;
        py = Y;
      }
      if (flat.length >= 4) lines.push(flat);
    }
  }
  const text = JSON.stringify({ v: 1, source: `${source} (Natural Earth, public domain), lightly simplified`, scale, lines });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(`${outFile}.tmp`, text);
  fs.renameSync(`${outFile}.tmp`, outFile);
  return { bytes: text.length, lines: lines.length, points: lines.reduce((n, l) => n + l.length / 2, 0), inPoints: inPts };
}

const LINE_SETS = [
  { raw: 'ne_50m_admin_0_boundary_lines_land.geojson', out: 'borders-50m.json', tolerance: 0.02, label: 'country borders' },
  { raw: 'ne_50m_admin_1_states_provinces_lines.geojson', out: 'states-50m.json', tolerance: 0.02, label: 'state and province lines' },
];

/* ── download (node server.js geo-update) ────────────────────────────────── */

function download(url, dest, redirects = 0) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'savant-site geo-update' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        const next = new URL(res.headers.location, url);
        if (next.protocol !== 'https:') { reject(new Error(`refusing a redirect to ${next.protocol}`)); return; }
        resolve(download(next.href, dest, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(Object.assign(new Error(`${url}: HTTP ${res.statusCode}`), { status: res.statusCode })); return; }
      const tmp = `${dest}.part`;
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => file.close(() => { fs.renameSync(tmp, dest); resolve(dest); }));
      file.on('error', reject);
      res.on('error', reject);
    });
    req.setTimeout(120000, () => req.destroy(new Error('download timed out')));
    req.on('error', reject);
  });
}

/** Checks a downloaded .csv.gz is whole and looks like DB-IP's city CSV. */
async function checkCsv(file) {
  let n = 0;
  for await (const line of lines(file)) {
    const f = parseCsvLine(line);
    if (f.length !== 8 || (!v4num(f[0]) && v4num(f[0]) !== 0 && !v6top(f[0]))) throw new Error(`${file} does not look like the DB-IP city CSV (line ${n + 1})`);
    n += 1;
    if (n >= 1000) break;
  }
  if (n < 1000) throw new Error(`${file} has only ${n} lines`);
  await new Promise((resolve, reject) => {
    fs.createReadStream(file).pipe(zlib.createGunzip()).on('data', () => {}).on('end', resolve).on('error', reject);
  });
}

/**
 * Downloads this month's DB-IP city lite file (or last month's, early in the month),
 * builds geo/ip-city.bin, and removes older raw downloads.
 */
async function update({ log = console.log, now = new Date() } = {}) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const months = [0, 1].map((back) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  let got = null;
  for (const m of months) {
    const name = `dbip-city-lite-${m}.csv.gz`;
    const dest = path.join(RAW_DIR, name);
    if (fs.existsSync(dest)) { got = dest; log(`already have ${name}`); break; }
    const url = `https://download.db-ip.com/free/${name}`;
    try {
      log(`downloading ${url}`);
      await download(url, dest);
      got = dest;
      break;
    } catch (e) {
      if (e.status === 404) { log(`${name} is not published yet`); continue; }
      throw e;
    }
  }
  if (!got) throw new Error('no DB-IP file found for this month or last month');
  await checkCsv(got);
  const r = await buildIpFile(got, path.join(GEO_DIR, 'ip-city.bin'), { source: path.basename(got), log });
  for (const f of fs.readdirSync(RAW_DIR)) {
    if (/^dbip-city-lite-\d{4}-\d\d\.csv\.gz$/.test(f) && f !== path.basename(got)) fs.unlinkSync(path.join(RAW_DIR, f));
  }
  const land = path.join(RAW_DIR, 'ne_50m_land.geojson');
  if (fs.existsSync(land) && !fs.existsSync(path.join(GEO_DIR, 'land-50m.json'))) buildLand(land, path.join(GEO_DIR, 'land-50m.json'));
  log('Done. Restart the site to load it: sudo systemctl restart savant-site');
  return r;
}

/* ── command line ────────────────────────────────────────────────────────── */

function newest(dir, re) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => re.test(f)).sort(); } catch (e) { /* none */ }
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  (async () => {
    const out = path.resolve(opt('out') || GEO_DIR);
    const csv = opt('csv') || newest(RAW_DIR, /^dbip-city-lite-\d{4}-\d\d\.csv(\.gz)?$/);
    const land = opt('land') || path.join(RAW_DIR, 'ne_50m_land.geojson');
    if (csv) {
      const r = await buildIpFile(path.resolve(csv), path.join(out, 'ip-city.bin'), { blockSize: Number(opt('block')) || 64, log: console.log });
      console.log(JSON.stringify(r));
    } else console.log('No DB-IP CSV found in geo/raw/ (run: node server.js geo-update).');
    if (fs.existsSync(land)) {
      const r = buildLand(land, path.join(out, 'land-50m.json'));
      console.log(`wrote ${path.join(out, 'land-50m.json')}: ${(r.bytes / 1024).toFixed(1)} KB, ${r.rings} rings, ${r.points} points (from ${r.inPoints})`);
    } else console.log(`No ${land}; the land outlines were not rebuilt.`);
    for (const set of LINE_SETS) {
      const src = path.join(RAW_DIR, set.raw);
      if (!fs.existsSync(src)) { console.log(`No ${src}; the ${set.label} were not rebuilt.`); continue; }
      const r = buildLines(src, path.join(out, set.out), { tolerance: set.tolerance, source: set.raw });
      console.log(`wrote ${path.join(out, set.out)}: ${(r.bytes / 1024).toFixed(1)} KB, ${r.lines} lines, ${r.points} points (from ${r.inPoints})`);
    }
  })().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { buildIpFile, buildLand, buildLines, LINE_SETS, update, parseCsvLine, v4num, v6top, simplify };
