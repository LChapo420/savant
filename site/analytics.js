'use strict';
/**
 * Visit statistics for the public site: no cookies, all on this server.
 *
 * The page's script (assets/site.js with assets/track.js) sends:
 *   POST /api/visit         one per page view: path, referrer, UTM/src tags, consent, GPC
 *   POST /api/visit-events  batches of interaction events, and the device details once
 *   POST /api/visit-choice  the privacy page's "Visit stats" control (allow / don't allow)
 *
 * Who is recorded how (the owner's decisions; see privacy.html "Visit statistics"):
 *   - Outside the UK, EU, EEA and Switzerland: an identified visit (IP address, page,
 *     how they arrived, coarse location, device) and its interaction events.
 *   - Inside them, until the visitor allows it on the notice; with Global Privacy
 *     Control; for an IP that opted out on the privacy page; and when there is no
 *     geo data: only anonymous daily counters (country + source + device type, and
 *     event type + page). No IP address, nothing per visitor.
 *   - Bots, the signed-in admin and ADMIN_ALLOW_IPS: nothing.
 *
 * Storage (all files 0600, written through the site's one-at-a-time queue):
 *   data/visits/YYYY-MM.jsonl          identified page views, one JSON object per line
 *   data/visits/YYYY-MM.events.jsonl   their interaction events
 *   (both gzipped to .jsonl.gz once the month is over)
 *   data/visit-counts.json             the anonymous daily counters
 *   data/visit-links.jsonl             form submission <-> visitor IP links
 *   data/visit-optout.json, visit-salt opted-out IPs, as salted hashes
 *   data/visits/log.jsonl              pruning and storage-cap events
 * Each month file is dictionary encoded: a line {"$":"text"} gives the next string
 * id (1, 2, ...), and records hold those ids under short keys. Times are epoch
 * seconds, IPv4 addresses are numbers. Records older than 24 months are pruned at
 * start and daily; DATA_MAX_MB (default 2000) caps the data folder, oldest months
 * first.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const net = require('net');
const readline = require('readline');
const { pipeline } = require('stream/promises');
const { inConsentRegion } = require('./geo');

const RETENTION_MONTHS = 24;
const SESSION_GAP_S = 30 * 60;
const TOKEN_IDLE_MS = 30 * 60 * 1000;
const MAX_TOKENS = 50000;
const MAX_EVENTS_PER_VIEW = 500;
const MAX_EVENTS_PER_BATCH = 80;
const FORMS = ['updates', 'beta', 'investors', 'remove'];
const MILESTONES = [25, 50, 75, 90, 100];

/* ── small helpers ───────────────────────────────────────────────────────── */

const LINE_SEPS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
const strip = (v) => String(v).replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(LINE_SEPS, '');
function text(v, max) {
  if (typeof v !== 'string') return '';
  const s = strip(v.normalize('NFC')).trim();
  return s.length > max ? s.slice(0, max) : s;
}
const int = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null);
const daySec = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);
const monthOf = (sec) => new Date(sec * 1000).toISOString().slice(0, 7);
const MONTH_RE = /^(\d{4})-(\d\d)$/;
function addMonths(m, k) {
  const [, y, mo] = MONTH_RE.exec(m);
  const d = new Date(Date.UTC(Number(y), Number(mo) - 1 + k, 1));
  return d.toISOString().slice(0, 7);
}
/** The same moment `months` calendar months earlier (day clamped), in epoch seconds. */
function monthsAgo(sec, months) {
  const d = new Date(sec * 1000);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d.getUTCDate(), last));
  return Math.floor(t.getTime() / 1000);
}

/** A canonical address: IPv4 dotted, IPv6 compressed lower case; null if not an IP. */
function canonIp(ip) {
  let s = String(ip || '').trim();
  if (/^::ffff:/i.test(s) && net.isIPv4(s.slice(7))) s = s.slice(7);
  if (net.isIPv4(s)) return s;
  if (net.isIPv6(s)) {
    try { return new URL(`http://[${s.split('%')[0]}]`).hostname.slice(1, -1); } catch (e) { return null; }
  }
  return null;
}
const packIp = (s) => (net.isIPv4(s) ? s.split('.').reduce((n, x) => n * 256 + Number(x), 0) : s);
const unpackIp = (v) => (typeof v === 'number' ? [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.') : String(v));

/* ── where a visit came from ─────────────────────────────────────────────── */

const ALIAS = {
  ig: 'instagram', insta: 'instagram', instagram: 'instagram',
  fb: 'facebook', facebook: 'facebook', meta: 'facebook',
  x: 'x', twitter: 'x', tw: 'x', 'x.com': 'x',
  tiktok: 'tiktok', tt: 'tiktok',
  yt: 'youtube', youtube: 'youtube',
  li: 'linkedin', linkedin: 'linkedin',
  reddit: 'reddit',
  google: 'google', bing: 'bing', duckduckgo: 'duckduckgo', ddg: 'duckduckgo', yahoo: 'yahoo',
  email: 'email', 'e-mail': 'email', mail: 'email', newsletter: 'email',
};
const WEBMAIL = /^(mail\.google\.com|inbox\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|mail\.aol\.com|mail\.proton\.me|mail\.protonmail\.com|app\.fastmail\.com|www\.fastmail\.com|mail\.zoho\.[a-z.]+|mail\.yandex\.[a-z.]+|webmail\.[a-z0-9.-]+|mail\.gmx\.[a-z.]+|navigator-[a-z]+\.gmx\.[a-z.]+|e\.mail\.ru|mail\.qq\.com|www\.icloud\.com|icloud\.com)$/;
const HOSTS = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/^(t\.co|(.+\.)?x\.com|(.+\.)?twitter\.com)$/, 'x'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
  [/(^|\.)(reddit\.com|redd\.it)$/, 'reddit'],
  [/(^|\.)google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)yahoo\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/, 'yahoo'],
];
/** A tag as written in a link (?src=, utm_source=): lower case, a-z 0-9 . _ -, 40 at most. */
function tag(v) {
  const s = text(v, 80).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  return s ? (ALIAS[s] || s) : '';
}
/** The host of a referrer URL (http or https only), lower case, without a query. */
function refHost(v) {
  if (typeof v !== 'string' || !v || v.length > 2048) return '';
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const h = u.hostname.toLowerCase().replace(/\.$/, '');
    return /^[a-z0-9.-]{1,253}$/.test(h) ? h : '';
  } catch (e) { return ''; }
}
/**
 * The visit's source: ?src= first, then utm_medium=email, then utm_source, then the
 * referrer's host. 'internal' for a link from this site, 'direct' with no referrer.
 */
function classifySource({ src, utm = {}, ref = '', ownHosts = [] }) {
  const s = tag(src);
  if (s) return s;
  if (tag(utm.medium) === 'email') return 'email';
  const us = tag(utm.source);
  if (us) return us;
  const h = refHost(ref) || (/^[a-z0-9.-]+$/.test(ref) ? ref : '');
  if (!h) return 'direct';
  const bare = h.replace(/^www\./, '');
  if (ownHosts.some((o) => o === h || o === bare || o.replace(/^www\./, '') === bare)) return 'internal';
  if (WEBMAIL.test(h)) return 'email';
  for (const [re, name] of HOSTS) if (re.test(h)) return name;
  return bare;
}

/* ── device ──────────────────────────────────────────────────────────────── */

const BOT_RE = /bot\b|bot\/|crawl|spider|slurp|bingpreview|facebookexternalhit|facebookcatalog|meta-externalagent|embedly|quora link|outbrain|pinterest\/|vkshare|w3c_validator|whatsapp|telegrambot|discordbot|slackbot|skypeuripreview|headless|phantomjs|puppeteer|playwright|selenium|webdriver|lighthouse|pagespeed|gtmetrix|chrome-lighthouse|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|httpclient|go-http-client|node-fetch|undici|axios|okhttp|java\/|libwww|scrapy|monitor|uptime|pingdom|statuscake|datadog|newrelic|ahrefs|semrush|mj12|dotbot|petalbot|yandex(bot|images)|baiduspider|applebot|duckduckbot|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|ccbot|bytespider|amazonbot|perplexity|cohere-ai|diffbot|feedfetcher|preview/i;
const isBot = (ua) => !ua || ua.length < 12 || BOT_RE.test(ua);

const cleanModel = (s) => text(String(s || '').replace(/[^\w .+\-()/]/g, ''), 40);
/**
 * Browser and OS (family and major version), device type and model from the
 * User-Agent string and, where the browser gives them, client hints:
 * h = { mobile: '?1', platform: 'Windows', model: 'Pixel 8', pv: '15.0.0', tp: 5 }.
 */
function parseDevice(ua, h = {}) {
  const u = String(ua || '');
  let m;
  let br = 'Other';
  let brv = null;
  const B = [
    [/EdgA?\/(\d+)|EdgiOS\/(\d+)|Edge\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)|OPiOS\/(\d+)|OPT\/(\d+)/, 'Opera'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/YaBrowser\/(\d+)/, 'Yandex'],
    [/Vivaldi\/(\d+)/, 'Vivaldi'],
    [/Instagram (\d+)/, 'Instagram app'],
    [/FBAV\/(\d+)|FBAN\//, 'Facebook app'],
    [/musical_ly_(\d+)|BytedanceWebview|TikTok (\d+)/, 'TikTok app'],
    [/FxiOS\/(\d+)|Firefox\/(\d+)/, 'Firefox'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)[.\d]* (Mobile\/\S+ )?Safari\//, 'Safari'],
    [/AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) Mobile\//, 'iOS app'],
  ];
  for (const [re, name] of B) {
    m = re.exec(u);
    if (m) { br = name; const v = m.slice(1).find(Boolean); brv = v ? Number(v) : null; break; }
  }
  let os = 'Other';
  let osv = '';
  const pvMajor = /^(\d+)/.exec(String(h.pv || ''));
  const mac = /Macintosh|Mac OS X/.test(u) && !/like Mac OS X/.test(u);
  const touchMac = mac && Number(h.tp) > 1;
  if ((m = /Windows NT (\d+\.\d+)/.exec(u))) {
    os = 'Windows';
    osv = { '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' }[m[1]] || m[1];
    if (osv === '10' && pvMajor && Number(pvMajor[1]) >= 13) osv = '11';
  } else if (/iPad/.test(u) || touchMac) {
    os = 'iPadOS';
    m = /OS (\d+)[_.]/.exec(u) || /Version\/(\d+)/.exec(u);
    osv = m ? m[1] : '';
  } else if (/iPhone|iPod/.test(u)) {
    os = 'iOS';
    m = /OS (\d+)[_.]/.exec(u);
    osv = m ? m[1] : '';
  } else if ((m = /Android (\d+)/.exec(u)) || /Android/.test(u)) {
    os = 'Android';
    osv = m ? m[1] : '';
  } else if (/CrOS/.test(u)) {
    os = 'ChromeOS';
  } else if (mac) {
    os = 'macOS';
    m = /Mac OS X (\d+)[._](\d+)/.exec(u);
    if (pvMajor && Number(pvMajor[1]) >= 11) osv = pvMajor[1];
    else if (m) osv = m[1] === '10' ? `10.${m[2]}` : m[1];
  } else if (/Linux|X11/.test(u)) {
    os = 'Linux';
  }
  if (os === 'Android' && pvMajor) osv = pvMajor[1];
  const plat = String(h.platform || '').replace(/"/g, '');
  if (os === 'Other' && plat) os = plat === 'macOS' ? 'macOS' : plat;

  let type = 'desktop';
  if (os === 'iPadOS' || /Tablet|Kindle|Silk\/|PlayBook/.test(u)) type = 'tablet';
  else if (/iPhone|iPod/.test(u) || h.mobile === '?1' || h.mobile === true) type = 'mobile';
  else if (os === 'Android') type = /Mobile/.test(u) ? 'mobile' : 'tablet';
  else if (/Mobi/.test(u)) type = 'mobile';

  let model = '';
  if (/iPhone/.test(u)) model = 'iPhone';
  else if (/iPod/.test(u)) model = 'iPod';
  else if (os === 'iPadOS') model = 'iPad';
  else if (os === 'Android') {
    model = cleanModel(h.model);
    if (!model) {
      m = /Android [\d.]+;(?: [a-z]{2}[-_][a-z]{2};)? ([^;)]+?)(?: Build\/[^;)]*)?[;)]/i.exec(u);
      model = m ? cleanModel(m[1]) : '';
      if (/^(K|wv|Mobile|Linux|U)$/i.test(model)) model = '';
    }
    if (/^SM-/.test(model)) model = `Samsung ${model}`;
  }
  return { type, model, os, osv, br, brv };
}

/* ── the month files ─────────────────────────────────────────────────────── */

const V_STR = { p: 'path', s: 'source', r: 'ref', us: 'utm_source', um: 'utm_medium', uc: 'utm_campaign', y: 'city', m: 'model', b: 'br', os: 'os', ov: 'osv', l: 'lang', z: 'tz' };
const DEV_KEYS = new Set(['model', 'br', 'os', 'osv', 'lang', 'tz']);
const TYPE_CODE = { mobile: 'm', tablet: 't', desktop: 'd' };
const TYPE_NAME = { m: 'mobile', t: 'tablet', d: 'desktop' };

/** Interaction events: kind -> field -> 's' (a string, dictionary encoded) or 'n' (a number). */
const EV = {
  sc: { m: 'n' },                         // scroll milestone (25, 50, 75, 90, 100)
  sd: { d: 'n' },                         // the page view's deepest scroll, %
  si: { s: 's' },                         // a section came into view
  st: { s: 's', ms: 'n' },                // time a section was in view (added up)
  tm: { a: 'n', t: 'n' },                 // active and total time, ms (added up)
  cl: { i: 's', to: 's', s: 's', c: 's' }, // a click: stable id, where it points, section, kind
  rc: { i: 's', s: 's' },                 // rage click
  dc: { i: 's', s: 's' },                 // dead click
  fv: { f: 's' },                         // a form came into view
  ff: { f: 's', n: 's' },                 // a field got focus (first time in this page view)
  ve: { f: 's', n: 's', e: 's' },         // a validation error shown: field and kind, never a value
  fs: { f: 's' },                         // submit pressed
  fd: { f: 's', ms: 'n' },                // sent successfully; ms from first focus
  fa: { f: 's', n: 's' },                 // started, not sent, page left: the last field touched
  pf: { b: 'n', d: 'n', l: 'n' },         // time to first byte, DOM ready, load (ms)
  wv: { lcp: 'n', cls: 'n', inp: 'n' },   // Web Vitals (cls x 1000)
  er: { m: 's', at: 's' },                // a script error: message and file:line
};

function encodeVisit(r, sid) {
  const o = { n: r.n, t: r.t, i: packIp(r.ip) };
  for (const [k, name] of Object.entries(V_STR)) {
    const v = DEV_KEYS.has(name) ? r.dev && r.dev[name] : name.startsWith('utm_') ? r.utm && r.utm[name.slice(4)] : r[name];
    if (v) o[k] = sid(String(v));
  }
  if (r.cc) o.c = r.cc;
  if (r.lat != null && r.lon != null) o.g = [Math.round(r.lat * 10), Math.round(r.lon * 10)];
  if (r.dev) {
    o.d = TYPE_CODE[r.dev.type] || 'd';
    if (r.dev.brv != null) o.bv = r.dev.brv;
    if (r.dev.w) o.w = [r.dev.w, r.dev.h];
    if (r.dev.dpr) o.x = r.dev.dpr;
  }
  if (r.consented) o.e = 1;
  if (r.nf) o.nf = 1;
  return o;
}
function decodeVisit(o, list) {
  const s = (k) => (o[k] ? list[o[k]] || '' : '');
  return {
    n: o.n,
    t: o.t,
    ip: unpackIp(o.i),
    path: s('p'),
    source: s('s'),
    ref: s('r'),
    utm: { source: s('us'), medium: s('um'), campaign: s('uc') },
    cc: o.c || '',
    city: s('y'),
    lat: o.g ? o.g[0] / 10 : null,
    lon: o.g ? o.g[1] / 10 : null,
    dev: {
      type: TYPE_NAME[o.d] || 'desktop', model: s('m'), os: s('os'), osv: s('ov'), br: s('b'), brv: o.bv == null ? null : o.bv,
      w: o.w ? o.w[0] : null, h: o.w ? o.w[1] : null, dpr: o.x || null, lang: s('l'), tz: s('z'),
    },
    consented: !!o.e,
    nf: !!o.nf,
  };
}
function encodeEvent(e, sid) {
  const o = { v: e.v, o: e.o, k: e.k };
  for (const [f, kind] of Object.entries(EV[e.k])) {
    if (e[f] === undefined || e[f] === null || e[f] === '') continue;
    o[f] = kind === 's' ? sid(String(e[f])) : e[f];
  }
  return o;
}
function decodeEvent(o, list) {
  const spec = EV[o.k];
  if (!spec) return null;
  const e = { v: o.v, o: o.o, k: o.k };
  for (const [f, kind] of Object.entries(spec)) if (o[f] !== undefined) e[f] = kind === 's' ? list[o[f]] || '' : o[f];
  return e;
}

/** Lines of a file, plain or .gz, as an async iterator. */
async function* fileLines(file) {
  let input;
  try { input = fs.createReadStream(file); await new Promise((res, rej) => { input.once('open', res); input.once('error', rej); }); } catch (e) { return; }
  const stream = /\.gz$/.test(file) ? input.pipe(zlib.createGunzip()) : input;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) if (line) yield line;
}

/**
 * Reads one month's file of a kind ('v' visits, 'e' events), decoding every record.
 * fn(record) is called for each; string table lines are handled here.
 */
async function readMonthFile(file, kind, fn) {
  const list = [null];
  for await (const line of fileLines(file)) {
    let o;
    try { o = JSON.parse(line); } catch (e) { continue; }
    if (!o || typeof o !== 'object') continue;
    if (typeof o.$ === 'string') { list.push(o.$); continue; }
    const r = kind === 'v' ? decodeVisit(o, list) : decodeEvent(o, list);
    if (r) fn(r);
  }
}

/* ── the store ───────────────────────────────────────────────────────────── */

/**
 * opts: dataDir, serial (the site's write queue), now() in ms, maxBytes, log(event, detail).
 */
function createStore({ dataDir, serial, now, maxBytes, log }) {
  const vdir = path.join(dataDir, 'visits');
  const file = (m, kind, gz) => path.join(vdir, `${m}${kind === 'e' ? '.events' : ''}.jsonl${gz ? '.gz' : ''}`);
  const dicts = new Map(); // `${m}|${kind}` -> { map, next }
  const seqs = new Map();  // month -> last visit number handed out
  const exists = (f) => { try { fs.accessSync(f); return true; } catch (e) { return false; } };
  const mkdir = () => fs.mkdirSync(vdir, { recursive: true, mode: 0o700 });

  const sizeOf = (f) => { try { return fs.statSync(f).size; } catch (e) { return 0; } };
  /**
   * The open dictionary for a month and kind, or null when the month is closed
   * (gzipped). If the file changed under us (another process rewrote it, e.g.
   * `node server.js forget`), it is read again.
   */
  function dict(m, kind) {
    const key = `${m}|${kind}`;
    let d = dicts.get(key);
    if (d && d.size === sizeOf(file(m, kind))) return d;
    if (exists(file(m, kind, true))) return null;
    d = { map: new Map(), next: 1, size: 0 };
    let maxN = 0;
    let textAll = '';
    try { textAll = fs.readFileSync(file(m, kind), 'utf8'); } catch (e) { /* new month */ }
    d.size = Buffer.byteLength(textAll);
    for (const line of textAll.split('\n')) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch (e) { continue; }
      if (o && typeof o.$ === 'string') { d.map.set(o.$, d.next); d.next += 1; } else if (o && kind === 'v' && o.n > maxN) maxN = o.n;
    }
    if (kind === 'v') seqs.set(m, Math.max(seqs.get(m) || 0, maxN));
    if (dicts.size > 8) dicts.delete(dicts.keys().next().value);
    dicts.set(key, d);
    return d;
  }
  function sidFor(d, defs) {
    return (s) => {
      let id = d.map.get(s);
      if (id === undefined) { id = d.next; d.next += 1; d.map.set(s, id); defs.push(JSON.stringify({ $: s })); }
      return id;
    };
  }
  /** A new visit number in month m (null when the month is closed). */
  function nextSeq(m) {
    if (!dict(m, 'v')) return null;
    const n = (seqs.get(m) || 0) + 1;
    seqs.set(m, n);
    return n;
  }
  let full = false; // over DATA_MAX_MB with only the current month left: stop writing
  function appendLines(m, kind, encode, items) {
    return serial(() => {
      if (full) return 0;
      const d = dict(m, kind);
      if (!d) return 0; // that month is closed; late events are dropped
      const defs = [];
      const sid = sidFor(d, defs);
      const lines = items.map((it) => JSON.stringify(encode(it, sid)));
      mkdir();
      const chunk = `${[...defs, ...lines].join('\n')}\n`;
      fs.appendFileSync(file(m, kind), chunk, { mode: 0o600 });
      d.size += Buffer.byteLength(chunk);
      return items.length;
    });
  }
  const appendVisit = (r) => appendLines(monthOf(r.t), 'v', encodeVisit, [r]);
  const appendEvents = (m, evs) => (evs.length ? appendLines(m, 'e', encodeEvent, evs) : Promise.resolve(0));

  /** Months present, oldest first: [{ month, v: {file, gz, bytes}, e: {...} }]. */
  function months() {
    let names = [];
    try { names = fs.readdirSync(vdir); } catch (e) { return []; }
    const out = new Map();
    for (const f of names) {
      const m = /^(\d{4}-\d\d)(\.events)?\.jsonl(\.gz)?$/.exec(f);
      if (!m) continue;
      const row = out.get(m[1]) || { month: m[1] };
      let bytes = 0;
      let mtime = 0;
      try { const st = fs.statSync(path.join(vdir, f)); bytes = st.size; mtime = st.mtimeMs; } catch (e) { continue; }
      row[m[2] ? 'e' : 'v'] = { file: path.join(vdir, f), gz: !!m[3], bytes, mtime };
      out.set(m[1], row);
    }
    return [...out.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  }

  /** Gzips the months before the current one (two hours into a month, so late events still land). */
  function compressClosed() {
    return serial(async () => {
      const t = now();
      const cur = monthOf(t / 1000);
      const startCur = Date.parse(`${cur}-01T00:00:00Z`);
      if (t - startCur < 2 * 3600 * 1000) return 0;
      let n = 0;
      for (const row of months()) {
        if (row.month >= cur) continue;
        for (const kind of ['v', 'e']) {
          const f = row[kind];
          if (!f || f.gz) continue;
          const target = file(row.month, kind, true);
          await pipeline(fs.createReadStream(f.file), zlib.createGzip({ level: 9 }), fs.createWriteStream(`${target}.tmp`, { mode: 0o600 }));
          fs.renameSync(`${target}.tmp`, target);
          fs.unlinkSync(f.file);
          dicts.delete(`${row.month}|${kind}`);
          n += 1;
        }
      }
      return n;
    });
  }

  /**
   * Streams one file of a month into a fresh copy (new string table, same gzip
   * state), keeping the records for which keep(record) is true. Returns
   * { kept, dropped }; the file is only replaced when something was dropped.
   */
  async function rewriteFile(src, gz, kind, keep, onDrop) {
    const tmp = `${src}.tmp`;
    const out = fs.createWriteStream(tmp, { mode: 0o600 });
    const z = gz ? zlib.createGzip({ level: 9 }) : null;
    if (z) z.pipe(out);
    const sink = z || out;
    const finished = new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); });
    const d = { map: new Map(), next: 1 };
    const defs = [];
    const sid = sidFor(d, defs);
    const enc = kind === 'v' ? encodeVisit : encodeEvent;
    const list = [null];
    let kept = 0;
    let dropped = 0;
    for await (const line of fileLines(src)) {
      let o;
      try { o = JSON.parse(line); } catch (e) { continue; }
      if (!o || typeof o !== 'object') continue;
      if (typeof o.$ === 'string') { list.push(o.$); continue; }
      const r = kind === 'v' ? decodeVisit(o, list) : decodeEvent(o, list);
      if (!r) continue;
      if (!keep(r)) { dropped += 1; if (onDrop) onDrop(r); continue; }
      defs.length = 0;
      const lineOut = JSON.stringify(enc(r, sid));
      const chunk = `${[...defs, lineOut].join('\n')}\n`;
      kept += 1;
      if (!sink.write(chunk)) await new Promise((res) => sink.once('drain', res));
    }
    sink.end();
    await finished;
    if (!dropped) { fs.unlinkSync(tmp); return { kept, dropped }; }
    if (!kept) { fs.unlinkSync(tmp); fs.unlinkSync(src); return { kept, dropped }; }
    try { fs.chmodSync(tmp, 0o600); } catch (e) { /* Windows */ }
    fs.renameSync(tmp, src);
    return { kept, dropped };
  }

  /**
   * Rewrites one month, keeping the visits for which keep(visit) is true and the
   * events of the visits kept. Streams; keeps the month's gzip state. Returns the
   * number of visits removed. Call inside serial().
   */
  async function rewriteMonth(m, keep) {
    const row = months().find((r) => r.month === m);
    if (!row || !row.v) return 0;
    const gone = new Set();
    const { dropped } = await rewriteFile(row.v.file, row.v.gz, 'v', keep, (r) => gone.add(r.n));
    if (dropped && row.e) await rewriteFile(row.e.file, row.e.gz, 'e', (e) => !gone.has(e.v));
    if (dropped) { dicts.delete(`${m}|v`); dicts.delete(`${m}|e`); }
    return dropped;
  }

  /** Deletes a whole month (both files). Call inside serial(). */
  function dropMonth(m) {
    let bytes = 0;
    for (const kind of ['v', 'e']) {
      for (const gz of [false, true]) {
        const f = file(m, kind, gz);
        try { bytes += fs.statSync(f).size; fs.unlinkSync(f); } catch (e) { /* not there */ }
      }
      dicts.delete(`${m}|${kind}`);
    }
    return bytes;
  }

  /** Bytes used by everything in the data folder (one level of subfolders). */
  function usage() {
    let total = 0;
    let visits = 0;
    const walk = (dir, depth) => {
      let names = [];
      try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const d of names) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) { if (depth < 2) walk(p, depth + 1); continue; }
        try { const s = fs.statSync(p).size; total += s; if (dir === vdir) visits += s; } catch (e) { /* raced */ }
      }
    };
    walk(dataDir, 0);
    return { total, visits, cap: maxBytes, full };
  }

  /** Prunes the oldest months while the data folder is over maxBytes. */
  function enforceCap() {
    return serial(() => {
      let u = usage();
      if (u.total <= maxBytes) { full = false; return 0; }
      const cur = monthOf(now() / 1000);
      let n = 0;
      for (const row of months()) {
        if (u.total <= maxBytes) break;
        if (row.month >= cur) continue;
        const bytes = dropMonth(row.month);
        n += 1;
        log('cap_prune', { month: row.month, bytes, cap_mb: Math.round(maxBytes / 1048576) });
        u = usage();
      }
      if (u.total > maxBytes) {
        if (!full) log('cap_full', { used_mb: Math.round(u.total / 1048576), cap_mb: Math.round(maxBytes / 1048576) });
        full = true;
      } else full = false;
      return n;
    });
  }

  return { dict, nextSeq, appendVisit, appendEvents, months, compressClosed, rewriteMonth, dropMonth, usage, enforceCap, file, vdir, isFull: () => full };
}

/* ── the collector ───────────────────────────────────────────────────────── */

/**
 * opts: dataDir, serial, geo (from geo.js, or null), now() in ms, env,
 * pendingMs (how long a page view waits for its device details, default 3000).
 */
function createAnalytics(opts) {
  const { dataDir, serial, geo, env = process.env } = opts;
  const now = opts.now || Date.now;
  const pendingMs = opts.pendingMs ?? 3000;
  const capMb = Number(env.DATA_MAX_MB || 2000);
  const maxBytes = Math.round((Number.isFinite(capMb) && capMb > 0 ? capMb : 2000) * 1048576);
  const logFile = path.join(dataDir, 'visits', 'log.jsonl');
  const countsFile = path.join(dataDir, 'visit-counts.json');
  const linksFile = path.join(dataDir, 'visit-links.jsonl');
  const optFile = path.join(dataDir, 'visit-optout.json');
  const saltFile = path.join(dataDir, 'visit-salt');
  const nowS = () => Math.floor(now() / 1000);

  function log(event, detail) {
    const rec = { at: new Date(now()).toISOString(), event, detail };
    console.warn(`[visits] ${event} ${JSON.stringify(detail)}`);
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true, mode: 0o700 });
      fs.appendFileSync(logFile, `${JSON.stringify(rec)}\n`, { mode: 0o600 });
    } catch (e) { /* the console line is enough */ }
  }
  function recentLog(n = 10) {
    try {
      return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-n).reverse()
        .map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    } catch (e) { return []; }
  }

  const store = createStore({ dataDir, serial, now, maxBytes, log });

  /* anonymous daily counters */
  let counts = { v: 2, days: {} };
  let countsMtime = 0;
  const mtimeOf = (f) => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
  function loadCounts() {
    try {
      const c = JSON.parse(fs.readFileSync(countsFile, 'utf8'));
      if (c && typeof c.days === 'object') counts = { v: 2, days: c.days };
      countsMtime = mtimeOf(countsFile);
    } catch (e) { /* none yet */ }
  }
  loadCounts();
  let countsTimer = null;
  let countsDirty = false;
  /** The counters; read again when another process (or app) wrote the file and we have nothing unsaved. */
  function getCounts() {
    if (!countsDirty && !countsTimer && mtimeOf(countsFile) !== countsMtime) loadCounts();
    return counts;
  }
  function saveCounts() {
    countsTimer = null;
    if (!countsDirty) return Promise.resolve();
    countsDirty = false;
    const body = JSON.stringify(counts);
    return serial(() => {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      const tmp = `${countsFile}.tmp`;
      fs.writeFileSync(tmp, body, { mode: 0o600 });
      try { fs.chmodSync(tmp, 0o600); } catch (e) { /* Windows */ }
      fs.renameSync(tmp, countsFile);
      countsMtime = mtimeOf(countsFile);
    });
  }
  function bump(bucket, key, by = 1) {
    getCounts();
    const day = daySec(nowS());
    const d = counts.days[day] || (counts.days[day] = { v: {}, e: {}, c: {} });
    const b = d[bucket] || (d[bucket] = {});
    if (b[key] === undefined && Object.keys(b).length >= 3000) return; // a day's keys are capped
    b[key] = (b[key] || 0) + by;
    countsDirty = true;
    if (!countsTimer) { countsTimer = setTimeout(saveCounts, 2000); countsTimer.unref(); }
  }

  /* opt-out list: salted hashes of IPs */
  let salt;
  try { salt = fs.readFileSync(saltFile, 'utf8').trim(); } catch (e) { salt = ''; }
  const ensureSalt = () => {
    if (/^[0-9a-f]{64}$/.test(salt)) return salt;
    salt = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(saltFile, `${salt}\n`, { mode: 0o600 });
    return salt;
  };
  const ipHash = (ip) => crypto.createHash('sha256').update(`${ensureSalt()}|${ip}`).digest('hex').slice(0, 32);
  let optOut = new Set();
  try { optOut = new Set(JSON.parse(fs.readFileSync(optFile, 'utf8')).h || []); } catch (e) { /* none */ }
  const saveOptOut = () => serial(() => {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${optFile}.tmp`, JSON.stringify({ v: 1, h: [...optOut] }), { mode: 0o600 });
    fs.renameSync(`${optFile}.tmp`, optFile);
  });
  const isOptedOut = (ip) => optOut.size > 0 && optOut.has(ipHash(ip));

  /* links: a form submission and the visitor's IP */
  function readLinks() {
    let t = '';
    try { t = fs.readFileSync(linksFile, 'utf8'); } catch (e) { return []; }
    return t.split('\n').filter(Boolean).map((l) => { try { const o = JSON.parse(l); return { t: o.t, ip: unpackIp(o.i), form: o.f, id: o.id }; } catch (e) { return null; } }).filter(Boolean);
  }
  function rewriteLinks(keep) {
    const all = readLinks();
    const kept = all.filter(keep);
    if (kept.length === all.length) return 0;
    const body = kept.map((l) => JSON.stringify({ t: l.t, i: packIp(l.ip), f: l.form, id: l.id })).join('\n');
    fs.writeFileSync(`${linksFile}.tmp`, body ? `${body}\n` : '', { mode: 0o600 });
    fs.renameSync(`${linksFile}.tmp`, linksFile);
    return all.length - kept.length;
  }

  /* identified visits seen lately, for linking forms: ip -> last time (s) */
  const recent = new Map();
  (async () => {
    const t = nowS();
    for (const m of [monthOf(t - 86400), monthOf(t)]) {
      for (const row of store.months().filter((r) => r.month === m && r.v)) {
        await readMonthFile(row.v.file, 'v', (r) => { if (t - r.t < 86400) recent.set(r.ip, Math.max(recent.get(r.ip) || 0, r.t)); });
      }
    }
  })().catch(() => {});

  /* page views waiting for their device details, and their event tokens */
  const tokens = new Map(); // token -> { m, n, ip, t, path, rec, timer, last, count }
  function writePending(tok) {
    if (!tok.rec) return Promise.resolve();
    const r = tok.rec;
    tok.rec = null;
    if (tok.timer) { clearTimeout(tok.timer); tok.timer = null; }
    recent.set(r.ip, r.t);
    return store.appendVisit(r).catch((e) => console.error('[visits] could not save a visit:', e.message));
  }
  const sweep = setInterval(() => {
    const t = now();
    for (const [k, tok] of tokens) if (t - tok.last > TOKEN_IDLE_MS) { writePending(tok); tokens.delete(k); }
    for (const [ip, s] of recent) if (nowS() - s > 86400) recent.delete(ip);
  }, 60 * 1000);
  sweep.unref();

  /* what a request says about the device, before the page's script adds detail */
  const hintsOf = (headers) => ({
    mobile: headers['sec-ch-ua-mobile'],
    platform: text(headers['sec-ch-ua-platform'] || '', 30),
  });

  function ownHosts(host) {
    const out = [];
    const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
    if (h) out.push(h);
    for (const o of String(env.SITE_ORIGINS || '').split(',')) { try { out.push(new URL(o.trim()).hostname.toLowerCase()); } catch (e) { /* skip */ } }
    return out;
  }
  function cleanPath(v) {
    const s = text(v, 400).split(/[?#]/)[0];
    if (!s.startsWith('/') || s.startsWith('//')) return '/';
    return s.slice(0, 200);
  }

  /**
   * One page view. req: { ip, ua, headers, host, body, skip }.
   * Returns the JSON for the page: { ok, notice, v (token) | a (anonymous) | off }.
   */
  function visit(req) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (req.skip || isBot(req.ua) || body.wd === true) return { ok: true, off: 1 };
    const ip = canonIp(req.ip);
    if (!ip) return { ok: true, off: 1 };
    const t = nowS();
    const pagePath = cleanPath(body.p);
    const utm = body.u && typeof body.u === 'object' ? { source: text(body.u.s, 100), medium: text(body.u.m, 100), campaign: text(body.u.c, 100) } : {};
    const ref = refHost(body.r);
    const source = classifySource({ src: body.src, utm, ref, ownHosts: ownHosts(req.host) });
    const g = geo ? geo.lookup(ip) : null;
    const region = !!(g && inConsentRegion(g.cc));
    const consent = body.c === 'allow' || body.c === 'deny' ? body.c : '';
    const gpc = req.headers['sec-gpc'] === '1' || body.gpc === true;
    const dev = parseDevice(req.ua, hintsOf(req.headers));
    const nf = body.nf === 1 || body.nf === true;
    if (gpc) bump('c', 'gpc');
    const anon = !geo || gpc || (region && consent !== 'allow') || isOptedOut(ip) || store.isFull();
    const notice = !!geo && region && !consent && !gpc;
    if (anon) {
      bump('v', `${g ? g.cc : '--'}|${source}|${TYPE_CODE[dev.type]}`);
      if (nf) bump('e', `not_found|${pagePath}`);
      return { ok: true, a: 1, notice, r: region ? 1 : 0, x: isOptedOut(ip) ? 1 : 0 };
    }
    const m = monthOf(t);
    const n = store.nextSeq(m);
    if (n === null) return { ok: true, off: 1 };
    const rec = {
      n, t, ip, path: pagePath, source, ref, utm,
      cc: g ? g.cc : '', city: g ? g.city : '', lat: g ? g.lat : null, lon: g ? g.lon : null,
      dev, consented: region && consent === 'allow', nf,
    };
    const token = crypto.randomBytes(12).toString('base64url');
    const tok = { m, n, ip, t, path: pagePath, rec, timer: null, last: now(), count: 0, ua: req.ua, headers: hintsOf(req.headers) };
    tok.timer = setTimeout(() => writePending(tok), pendingMs);
    tok.timer.unref();
    if (tokens.size >= MAX_TOKENS) { const [k, old] = tokens.entries().next().value; writePending(old); tokens.delete(k); }
    tokens.set(token, tok);
    recent.set(ip, t);
    return { ok: true, v: token, notice: false, r: region ? 1 : 0, x: 0 };
  }

  /** Validates one event from the page; returns it ready to store, or null. */
  function cleanEvent(e, anon) {
    if (!e || typeof e !== 'object' || !Object.hasOwn(EV, e.k)) return null;
    const out = { k: e.k, o: int(e.o, 0, 86400000) };
    out.o = out.o === null ? 0 : Math.round(out.o / 100); // deciseconds since the page loaded
    const id = (v, max = 60) => text(v, max);
    const word = (v) => (typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v) ? v.toLowerCase() : '');
    switch (e.k) {
      case 'sc': out.m = MILESTONES.includes(e.m) ? e.m : null; if (out.m === null) return null; break;
      case 'sd': out.d = int(e.d, 0, 100); if (out.d === null) return null; break;
      case 'si': out.s = word(e.s); if (!out.s) return null; break;
      case 'st': out.s = word(e.s); out.ms = int(e.ms, 0, 86400000); if (!out.s || out.ms === null) return null; break;
      case 'tm': out.a = int(e.a, 0, 86400000) || 0; out.t = int(e.t, 0, 86400000) || 0; break;
      case 'cl': case 'rc': case 'dc':
        out.i = anon ? '' : id(e.i);
        out.s = word(e.s);
        if (e.k === 'cl') {
          out.c = ['nav', 'out', 'social', 'mail', 'theme', 'ev', 'link', 'btn'].includes(e.c) ? e.c : 'link';
          const to = typeof e.to === 'string' ? e.to : '';
          out.to = anon ? '' : (/^\/[^\s?]{0,119}$/.test(to) || /^[a-z0-9.-]{1,120}$/.test(to) ? to : '');
        }
        break;
      case 'fv': case 'fs': case 'fd': case 'ff': case 've': case 'fa':
        out.f = FORMS.includes(e.f) ? e.f : '';
        if (!out.f) return null;
        if (e.k === 'fd') out.ms = int(e.ms, 0, 86400000);
        if (e.k === 'ff' || e.k === 've' || e.k === 'fa') out.n = anon ? '' : word(e.n);
        if (e.k === 've') out.e = /^[a-z-]{1,30}$/.test(e.e || '') ? e.e : 'other';
        if (e.k === 'ff' && anon && e.first !== true) return null; // anonymous: only "form started"
        break;
      case 'pf': out.b = int(e.b, 0, 120000); out.d = int(e.d, 0, 120000); out.l = int(e.l, 0, 120000); break;
      case 'wv': out.lcp = int(e.lcp, 0, 120000); out.cls = int(e.cls, 0, 100000); out.inp = int(e.inp, 0, 60000); break;
      case 'er':
        out.m = anon ? '' : id(e.m, 120);
        out.at = anon ? '' : (typeof e.at === 'string' && /^[\w./-]{1,100}:\d{1,7}$/.test(e.at) ? e.at : '');
        break;
      default: return null;
    }
    return out;
  }
  /** The anonymous counter for an event: "type|page", or null when it is not counted. */
  function anonKey(e, page) {
    const k = {
      sc: () => `scroll${e.m}`, si: () => `section:${e.s}`, cl: () => `click:${e.c}`, rc: () => 'rage', dc: () => 'dead',
      fv: () => `form_seen:${e.f}`, ff: () => `form_start:${e.f}`, ve: () => `form_error:${e.f}`, fs: () => `form_submit:${e.f}`,
      fd: () => `form_done:${e.f}`, fa: () => `form_abandon:${e.f}`, er: () => 'error',
    }[e.k];
    return k ? `${k()}|${page}` : null;
  }

  /**
   * A batch of events. req: { ip, ua, body: { v?: token, p?: path, e: [...], dev?: {...}, cs? }, skip }.
   * With a valid token (same IP), they are stored with the page view; without one,
   * only anonymous counters move.
   */
  function events(req) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (req.skip || isBot(req.ua)) return { ok: true };
    const ip = canonIp(req.ip);
    const list = Array.isArray(body.e) ? body.e.slice(0, MAX_EVENTS_PER_BATCH) : [];
    if (['allow', 'deny', 'dismiss'].includes(body.cs)) bump('c', body.cs);
    const tok = typeof body.v === 'string' ? tokens.get(body.v) : null;
    if (!tok || tok.ip !== ip) {
      const page = cleanPath(body.p);
      for (const raw of list) {
        const e = cleanEvent(raw, true);
        const key = e && anonKey(e, page);
        if (key) bump('e', key);
      }
      return { ok: true };
    }
    tok.last = now();
    if (body.dev && typeof body.dev === 'object' && tok.rec) {
      const d = body.dev;
      const hints = { ...tok.headers, model: text(d.model, 40), pv: text(d.pv, 20), tp: int(d.tp, 0, 20) };
      if (d.mobile === true) hints.mobile = '?1';
      const dev = parseDevice(tok.ua, hints);
      const bucket = (v) => { const n = int(v, 1, 20000); return n === null ? null : Math.round(n / 10) * 10; };
      dev.w = bucket(d.w);
      dev.h = bucket(d.h);
      dev.dpr = typeof d.dpr === 'number' && d.dpr >= 0.5 && d.dpr <= 6 ? Math.round(d.dpr * 100) / 100 : null;
      dev.lang = typeof d.lang === 'string' && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,2}$/.test(d.lang) ? d.lang : '';
      dev.tz = typeof d.tz === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(d.tz) && d.tz.length <= 40 ? d.tz : '';
      tok.rec.dev = dev;
      writePending(tok);
    }
    const keep = [];
    for (const raw of list) {
      if (tok.count >= MAX_EVENTS_PER_VIEW) break;
      const e = cleanEvent(raw, false);
      if (!e) continue;
      e.v = tok.n;
      keep.push(e);
      tok.count += 1;
    }
    if (body.end === true) writePending(tok);
    return store.appendEvents(tok.m, keep)
      .then(() => ({ ok: true }), (e) => { console.error('[visits] could not save events:', e.message); return { ok: true }; });
  }

  /** The privacy page's control: 'deny' opts this IP out (and deletes its visits), 'allow' undoes it. */
  async function choice(req) {
    const ip = canonIp(req.ip);
    const c = req.body && req.body.choice;
    if (!ip || (c !== 'allow' && c !== 'deny')) return { ok: false };
    const h = ipHash(ip);
    if (c === 'deny') {
      optOut.add(h);
      await saveOptOut();
      await removeIps(new Set([ip]));
    } else if (optOut.delete(h)) await saveOptOut();
    return { ok: true, x: c === 'deny' ? 1 : 0 };
  }

  /** Links a stored form submission to the visitor, when that IP was recorded in the last 24 hours. */
  function linkSubmission(rawIp, form, id) {
    const ip = canonIp(rawIp);
    if (!ip || !id) return Promise.resolve(false);
    const last = recent.get(ip);
    if (!last || nowS() - last > 86400 || isOptedOut(ip)) return Promise.resolve(false);
    const rec = { t: nowS(), i: packIp(ip), f: form, id };
    return serial(() => {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.appendFileSync(linksFile, `${JSON.stringify(rec)}\n`, { mode: 0o600 });
      return true;
    });
  }

  /** Deletes every visit (and its events and links) from these IPs, in every month. */
  function removeIps(ips) {
    if (!ips.size) return Promise.resolve(0);
    for (const [k, tok] of tokens) if (ips.has(tok.ip)) { if (tok.timer) clearTimeout(tok.timer); tokens.delete(k); }
    for (const ip of ips) recent.delete(ip);
    return serial(async () => {
      let n = 0;
      for (const row of store.months()) n += await store.rewriteMonth(row.month, (r) => !ips.has(r.ip));
      rewriteLinks((l) => !ips.has(l.ip));
      return n;
    });
  }

  /**
   * "Remove my details": the submission ids just deleted for an email. Their links
   * give the visitor's IPs; every visit from those IPs goes too.
   */
  async function forgetSubmissions(ids) {
    const set = new Set(ids);
    if (!set.size) return 0;
    const ips = new Set(readLinks().filter((l) => set.has(l.id)).map((l) => l.ip));
    const n = await removeIps(ips);
    await serial(() => rewriteLinks((l) => !set.has(l.id)));
    return n;
  }

  /** Drops everything older than 24 months: visit months, counters and links. */
  function pruneRetention() {
    const cutoff = monthsAgo(nowS(), RETENTION_MONTHS);
    const cutMonth = monthOf(cutoff);
    const cutDay = daySec(cutoff);
    return serial(async () => {
      let visits = 0;
      for (const row of store.months()) {
        if (row.month < cutMonth) {
          let k = 0;
          await readMonthFile(row.v ? row.v.file : '', 'v', () => { k += 1; });
          store.dropMonth(row.month);
          visits += k;
        } else if (row.month === cutMonth) visits += await store.rewriteMonth(row.month, (r) => r.t >= cutoff);
      }
      let days = 0;
      const days0 = getCounts().days;
      for (const d of Object.keys(days0)) if (d < cutDay) { delete days0[d]; days += 1; }
      if (days) { countsDirty = true; }
      const links = rewriteLinks((l) => l.t >= cutoff);
      if (visits || days || links) log('retention_prune', { before: new Date(cutoff * 1000).toISOString(), visits, counter_days: days, links });
      return { visits, days, links };
    }).then(async (r) => { await saveCounts(); return r; });
  }

  async function maintenance() {
    await pruneRetention();
    await store.compressClosed();
    await store.enforceCap();
  }
  if (opts.maintenance !== false) {
    setImmediate(() => maintenance().catch((e) => console.error('[visits] maintenance:', e.message)));
    const daily = setInterval(() => maintenance().catch((e) => console.error('[visits] maintenance:', e.message)), 24 * 3600 * 1000);
    daily.unref();
    const hourly = setInterval(() => Promise.all([store.compressClosed(), store.enforceCap()]).catch(() => {}), 3600 * 1000);
    hourly.unref();
  }

  /** Writes every waiting page view and the counters (for tests and shutdown). */
  async function flush() {
    await Promise.all([...tokens.values()].map(writePending));
    await saveCounts();
    await serial(() => {});
  }

  return {
    visit, events, choice, linkSubmission, forgetSubmissions, removeIps, pruneRetention, maintenance, flush,
    store, readLinks, getCounts, recentLog, usage: () => store.usage(), geo, ipHash, isOptedOut,
  };
}

module.exports = {
  createAnalytics, createStore, classifySource, parseDevice, isBot, canonIp, packIp, unpackIp, refHost, tag,
  encodeVisit, decodeVisit, encodeEvent, decodeEvent, readMonthFile, fileLines, monthOf, daySec, addMonths, monthsAgo,
  EV, FORMS, MILESTONES, SESSION_GAP_S, RETENTION_MONTHS, TYPE_NAME,
};
