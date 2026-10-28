'use strict';
/**
 * The private admin page: the owner signs in and reads, searches, exports and
 * deletes form submissions. server.js mounts it with mountAdmin() and runs the
 * `admin-hash` and `admin-totp` commands from here. This file is never served.
 *
 * Configuration comes from a private env file (ADMIN_ENV_FILE, default
 * site/admin.env; KEY=VALUE lines) and real environment variables, which win:
 *   ADMIN_USER           the sign-in name
 *   ADMIN_PASSWORD_HASH  scrypt$N$r$p$saltB64$keyB64 from `node server.js admin-hash`
 *   ADMIN_TOTP_SECRET    base32 secret from `node server.js admin-totp` (required)
 *   ADMIN_ALLOW_IPS      optional comma list of IPs or CIDR ranges
 *   ADMIN_SESSION_HOURS  absolute session length (default 2)
 *   ADMIN_IDLE_MINUTES   idle timeout (default 20)
 * Unless ADMIN_USER, ADMIN_PASSWORD_HASH and ADMIN_TOTP_SECRET are all set and
 * valid, the page does not exist: its path answers like any unknown path, and
 * the server logs one line saying why. Every sign-in needs the password and a
 * current 6-digit authenticator code. The path is also a 404 for an IP outside
 * ADMIN_ALLOW_IPS, and for plain http when NODE_ENV=production.
 *
 * Cookies: over HTTPS the session cookie is `__Host-sv_admin` (Secure,
 * HttpOnly, SameSite=Strict, Path=/, no Domain). In development over plain
 * http (NODE_ENV not production) it is `sv_admin_dev` without Secure, so the
 * page can be tried on localhost. Production never accepts plain http.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');

const ADMIN_PATH = '/donteventry';
const ADMIN_KEYS = ['ADMIN_USER', 'ADMIN_PASSWORD_HASH', 'ADMIN_TOTP_SECRET', 'ADMIN_ALLOW_IPS', 'ADMIN_SESSION_HOURS', 'ADMIN_IDLE_MINUTES'];

const MIN_N = 2 ** 15;
const MAX_N = 2 ** 20;
const DEFAULT_N = 2 ** 17;
const FAIL_WINDOW = 15 * 60 * 1000;
const IP_MAX_FAILS = 5;
const GLOBAL_MAX_FAILS = 20;
const GLOBAL_LOCK = 15 * 60 * 1000;
const MAX_LOCK = 24 * 60 * 60 * 1000;
const PRE_TOKEN_SECS = 60 * 60;
const MAX_SESSIONS = 5;
const MAX_ROWS = 500;
const GENERIC_FAIL = 'That did not work. Check your details and try again.';
const TRY_LATER = 'Too many attempts. Please try again later.';

/* ── configuration ───────────────────────────────────────────────────────── */

/** KEY=VALUE lines; blank lines and # comments skipped; optional quotes and `export `. */
function parseEnvFile(text) {
  const out = Object.create(null);
  for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** True when a file mode lets group or others read or write it. */
const insecureMode = (mode) => (Number(mode) & 0o077) !== 0;

function envFilePath(env, root) { return path.resolve(env.ADMIN_ENV_FILE || path.join(root, 'admin.env')); }

/** The raw values: the file's, then real environment variables over them. */
function readValues(env, root) {
  const file = envFilePath(env, root);
  let st = null;
  let fileVals = Object.create(null);
  let problem = null;
  try { st = fs.statSync(file); } catch (e) { /* no file: environment only */ }
  if (st) {
    if (!st.isFile()) problem = `${file} is not a regular file.`;
    else if (process.platform !== 'win32' && insecureMode(st.mode)) problem = `${file} can be read or written by group or others. Run: chmod 600 ${file}`;
    else {
      try { fileVals = parseEnvFile(fs.readFileSync(file, 'utf8')); } catch (e) { problem = `${file} could not be read.`; }
    }
  }
  const vals = {};
  for (const k of ADMIN_KEYS) {
    const v = env[k] !== undefined && env[k] !== '' ? env[k] : fileVals[k];
    if (v !== undefined && String(v).trim() !== '') vals[k] = String(v).trim();
  }
  return { file, exists: !!st, problem, vals };
}

/** Parses scrypt$N$r$p$saltB64$keyB64, or returns null if it breaks a rule. */
function parseHash(s) {
  const parts = String(s || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, nS, rS, pS, saltS, keyS] = parts;
  if (!/^\d{1,8}$/.test(nS) || !/^\d{1,3}$/.test(rS) || !/^\d{1,3}$/.test(pS)) return null;
  const N = Number(nS);
  const r = Number(rS);
  const p = Number(pS);
  if (N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0 || r !== 8 || p !== 1) return null;
  const b64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
  if (!b64.test(saltS) || !b64.test(keyS)) return null;
  const salt = Buffer.from(saltS, 'base64');
  const key = Buffer.from(keyS, 'base64');
  if (salt.length !== 32 || key.length !== 64) return null;
  return { N, r, p, salt, key };
}

/** Returns a net.BlockList for "1.2.3.4, 10.0.0.0/8, 2001:db8::/32", or throws. */
function parseAllowList(list) {
  const bl = new net.BlockList();
  const entries = String(list).split(',').map((s) => s.trim()).filter(Boolean);
  if (!entries.length) throw new Error('ADMIN_ALLOW_IPS has no entries.');
  for (const entry of entries) {
    const [addr, bits, extra] = entry.split('/');
    const ip = normIp(addr);
    const fam = net.isIP(ip);
    if (!fam || extra !== undefined) throw new Error(`ADMIN_ALLOW_IPS entry "${entry}" is not an IP address or CIDR range.`);
    const type = fam === 4 ? 'ipv4' : 'ipv6';
    if (bits === undefined) { bl.addAddress(ip, type); continue; }
    const prefix = Number(bits);
    if (!/^\d{1,3}$/.test(bits) || prefix > (fam === 4 ? 32 : 128)) throw new Error(`ADMIN_ALLOW_IPS entry "${entry}" has a bad prefix length.`);
    bl.addSubnet(ip, prefix, type);
  }
  return bl;
}

function numberOr(v, def, min, max, name, warnings) {
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) { warnings.push(`${name} is not a positive number; using ${def}.`); return def; }
  return Math.min(Math.max(n, min), max);
}

/**
 * Returns { enabled, warning, ... }. Every problem turns the page off (fail
 * closed) with a warning that never includes a secret value.
 */
function loadAdminConfig({ env = process.env, root }) {
  const { file, exists, problem, vals } = readValues(env, root);
  const off = (warning) => ({ enabled: false, warning, file });
  if (problem) return off(problem);
  const REQUIRED = ['ADMIN_USER', 'ADMIN_PASSWORD_HASH', 'ADMIN_TOTP_SECRET'];
  const missing = REQUIRED.filter((k) => !vals[k]);
  if (missing.length === REQUIRED.length) {
    return off(`not configured: ADMIN_USER, ADMIN_PASSWORD_HASH and ADMIN_TOTP_SECRET are not set${exists ? ` in ${file}` : ` (no ${file})`}.`);
  }
  if (missing.length) {
    return off(`${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set. ADMIN_USER, ADMIN_PASSWORD_HASH and ADMIN_TOTP_SECRET are all required${missing.includes('ADMIN_TOTP_SECRET') ? '; the authenticator code is mandatory (node server.js admin-totp)' : ''}.`);
  }
  const hash = parseHash(vals.ADMIN_PASSWORD_HASH);
  if (!hash) return off(`ADMIN_PASSWORD_HASH is not a valid scrypt$N$r$p$salt$key value (N a power of two from ${MIN_N}, r=8, p=1, 32-byte salt, 64-byte key). Make one with: node server.js admin-hash`);
  const totpKey = base32Decode(vals.ADMIN_TOTP_SECRET);
  if (!totpKey || totpKey.length < 16) return off('ADMIN_TOTP_SECRET is not a base32 secret of at least 16 bytes. Make one with: node server.js admin-totp');
  let allow = null;
  if (vals.ADMIN_ALLOW_IPS) {
    try { allow = parseAllowList(vals.ADMIN_ALLOW_IPS); } catch (e) { return off(e.message); }
  }
  const warnings = [];
  const sessionHours = numberOr(vals.ADMIN_SESSION_HOURS, 2, 0.25, 24, 'ADMIN_SESSION_HOURS', warnings);
  const idleMinutes = numberOr(vals.ADMIN_IDLE_MINUTES, 20, 1, 240, 'ADMIN_IDLE_MINUTES', warnings);
  return {
    enabled: true,
    warning: warnings.length ? warnings.join(' ') : null,
    file,
    user: vals.ADMIN_USER.normalize('NFC'),
    hash,
    totpKey,
    allow,
    sessionMs: sessionHours * 60 * 60 * 1000,
    idleMs: Math.min(idleMinutes * 60 * 1000, sessionHours * 60 * 60 * 1000),
  };
}

/* ── passwords ───────────────────────────────────────────────────────────── */

const scryptOpts = (h) => ({ N: h.N, r: h.r, p: h.p, maxmem: 256 * h.N * h.r });
const pwBytes = (pw) => Buffer.from(String(pw).normalize('NFC'), 'utf8');

function hashPassword(pw, N = DEFAULT_N) {
  const salt = crypto.randomBytes(32);
  const key = crypto.scryptSync(pwBytes(pw), salt, 64, scryptOpts({ N, r: 8, p: 1 }));
  return `scrypt$${N}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

// scrypt runs on libuv's thread pool; at most two at once, so a burst of
// sign-in attempts cannot take all of the server's memory.
const SCRYPT_SLOTS = 2;
let scryptActive = 0;
const scryptWaiting = [];
async function withScryptSlot(fn) {
  if (scryptActive >= SCRYPT_SLOTS) await new Promise((r) => scryptWaiting.push(r));
  else scryptActive += 1;
  try { return await fn(); } finally {
    const nextUp = scryptWaiting.shift();
    if (nextUp) nextUp(); else scryptActive -= 1;
  }
}

async function verifyPassword(pw, h) {
  const key = await withScryptSlot(() => new Promise((resolve, reject) => {
    crypto.scrypt(pwBytes(pw), h.salt, h.key.length, scryptOpts(h), (e, k) => (e ? reject(e) : resolve(k)));
  }));
  return crypto.timingSafeEqual(key, h.key);
}

/** Reasons a password looks weak (empty list when none). Advice only. */
function weakPasswordReasons(pw) {
  const reasons = [];
  const len = [...pw].length;
  const low = pw.toLowerCase();
  if (len < 12) reasons.push(`it is only ${len} characters long (use 12 or more; a passphrase of four or more random words is better)`);
  if (/^(.)\1+$/u.test(pw)) reasons.push('it is one character repeated');
  if (/^\d+$/.test(pw)) reasons.push('it is only digits');
  const common = ['password', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'savant', 'admin', 'qwerty', 'asdf', 'letmein', 'welcome', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'master', 'sunshine', 'princess', 'abc123', '123456', '654321', '111111', '000000', 'changeme', 'trustno1', 'secret', 'donteventry'];
  if (common.some((w) => low.includes(w))) reasons.push('it contains a very common password or word');
  let run = 1;
  for (let i = 1; i < low.length && run < 4; i += 1) {
    const d = low.charCodeAt(i) - low.charCodeAt(i - 1);
    run = d === 1 || d === -1 ? run + 1 : 1;
  }
  if (run >= 4) reasons.push('it contains a simple run like abcd or 4321');
  if (/^[a-z]+[0-9]{1,4}[!.?#$]?$/i.test(pw) && len < 16) reasons.push('it is a word followed by a few digits');
  return reasons;
}

/* ── TOTP (RFC 6238: SHA-1, 30 s steps, 6 digits) ─────────────────────────── */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/[\s=-]/g, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; value &= (1 << bits) - 1; }
  }
  return Buffer.from(out);
}
function hotp(key, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000;
  return String(n).padStart(6, '0');
}
const totpStep = (ms) => Math.floor(ms / 1000 / 30);

/* ── small helpers ───────────────────────────────────────────────────────── */

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normIp(ip) {
  let s = String(ip || '').trim();
  if (/^::ffff:/i.test(s) && net.isIPv4(s.slice(7))) s = s.slice(7);
  return s;
}
function expandV6(s) {
  let a = s.split('%')[0];
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (v4) {
    const p = v4[1].split('.').map(Number);
    a = `${a.slice(0, -v4[1].length)}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const [head, tail] = a.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail !== undefined ? Array(Math.max(0, 8 - h.length - t.length)).fill('0') : [];
  return [...h, ...fill, ...t].map((x) => parseInt(x || '0', 16).toString(16));
}
/** The brute-force key for an address: IPv4 as is, IPv6 by its /64. */
function ipKey(ip) {
  const s = normIp(ip);
  return net.isIPv6(s) ? `${expandV6(s).slice(0, 4).join(':')}::/64` : s;
}
function parseCookies(req) {
  const out = new Map();
  for (const part of String(req.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!out.has(k)) out.set(k, part.slice(i + 1).trim());
  }
  return out;
}
const cleanUa = (ua) => String(ua || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 200);

/* ── the page ────────────────────────────────────────────────────────────── */

/**
 * deps: express, root, dataDir, forms, readAll, removeRecords, serial,
 * originAllowed, toCsv, now (clock, ms), loginFloorMs, env.
 */
function mountAdmin(app, deps) {
  const {
    express, root, dataDir, forms, readAll, removeRecords, serial, originAllowed, toCsv,
    now = Date.now, loginFloorMs = 500, env = process.env, analytics,
  } = deps;
  const cfg = loadAdminConfig({ env, root });
  app.locals.admin = { enabled: cfg.enabled, totp: !!cfg.totpKey, allowList: !!cfg.allow, warning: cfg.warning };
  // One line, never a secret: why the page is off (its path is then the normal 404).
  if (!cfg.enabled) console.warn(`[admin] private page off (its path is the normal 404): ${cfg.warning || 'not configured.'}`);
  else if (cfg.warning) console.warn(`[admin] ${cfg.warning}`);
  // Visit statistics skip the owner: an address in ADMIN_ALLOW_IPS (even while the
  // page is off), and, below, a request carrying a valid admin session.
  let allowAny = cfg.allow;
  if (!allowAny) {
    try { const v = readValues(env, root).vals.ADMIN_ALLOW_IPS; if (v) allowAny = parseAllowList(v); } catch (e) { /* ignored here */ }
  }
  const inAllowList = (req) => {
    if (!allowAny) return false;
    const ip = normIp(req.ip);
    const fam = net.isIP(ip);
    return !!fam && allowAny.check(ip, fam === 4 ? 'ipv4' : 'ipv6');
  };
  app.locals.isAdminVisit = inAllowList;
  if (!cfg.enabled || !cfg.totpKey || !cfg.hash || !cfg.user) return; // fail closed

  const production = env.NODE_ENV === 'production';
  const SECRET = crypto.randomBytes(32); // HMAC key for CSRF tokens; sessions die with the process anyway
  const mac = (msg) => crypto.createHmac('sha256', SECRET).update(msg).digest('base64url');
  const auditFile = path.join(dataDir, 'admin-audit.jsonl');
  const TABS = ['all', ...forms];
  const LABEL = { all: 'All', updates: 'Updates', beta: 'Beta', investors: 'Investors' };
  try { if (fs.existsSync(auditFile)) fs.chmodSync(auditFile, 0o600); } catch (e) { /* not ours to fix here */ }

  /* audit log: time, event, IP, browser; never a password, code or token */
  function audit(event, req, detail) {
    const rec = { at: new Date(now()).toISOString(), event, ip: normIp(req.ip) || null, ua: cleanUa(req.get('user-agent')) };
    if (detail) rec.detail = detail;
    return serial(() => {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.appendFileSync(auditFile, `${JSON.stringify(rec)}\n`, { mode: 0o600 });
    }).catch((e) => console.error('[admin] could not write the audit log:', e.message));
  }
  function recentAudit(n = 50) {
    let fd;
    try { fd = fs.openSync(auditFile, 'r'); } catch (e) { return []; }
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, 256 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      let lines = buf.toString('utf8').split('\n');
      if (len < size) lines = lines.slice(1);
      return lines.filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } })
        .filter(Boolean).slice(-n).reverse();
    } finally { fs.closeSync(fd); }
  }

  /* brute-force state, in memory only */
  const ipState = new Map(); // ipKey -> { fails: [ms], until, level, inflight }
  let globalFails = [];
  let globalUntil = 0;
  let globalInflight = 0;
  let lastTotpStep = -1;
  const stateFor = (key) => {
    let st = ipState.get(key);
    if (!st) {
      if (ipState.size >= 10000) prune(true);
      st = { fails: [], until: 0, level: 0, inflight: 0 };
      ipState.set(key, st);
    }
    return st;
  };
  function prune(hard) {
    const t = now();
    for (const [k, st] of ipState) {
      st.fails = st.fails.filter((x) => t - x < FAIL_WINDOW);
      if (!st.inflight && !st.fails.length && t >= st.until && t - st.until > MAX_LOCK) ipState.delete(k);
    }
    if (hard) { for (const k of ipState.keys()) { if (ipState.size < 9000) break; ipState.delete(k); } }
  }
  setInterval(() => prune(false), 5 * 60 * 1000).unref();

  const isLocked = (st, t) => t < globalUntil || t < st.until;
  async function recordFail(key, st, req) {
    const t = now();
    st.fails = st.fails.filter((x) => t - x < FAIL_WINDOW);
    st.fails.push(t);
    if (st.fails.length >= IP_MAX_FAILS) {
      if (t - st.until > MAX_LOCK) st.level = 0; // a clean day resets the backoff
      st.level += 1;
      const ms = Math.min(FAIL_WINDOW * 2 ** (st.level - 1), MAX_LOCK);
      st.until = t + ms;
      st.fails = [];
      // One line per lock, with the address, so fail2ban can also block it at the firewall.
      console.warn(`[admin] sign-in locked for ${normIp(req.ip) || 'unknown'} for ${Math.round(ms / 60000)} minutes after ${IP_MAX_FAILS} failures`);
      await audit('lockout', req, { scope: 'ip', minutes: Math.round(ms / 60000) });
    }
    globalFails = globalFails.filter((x) => t - x < FAIL_WINDOW);
    globalFails.push(t);
    if (globalFails.length >= GLOBAL_MAX_FAILS) {
      globalUntil = t + GLOBAL_LOCK;
      globalFails = [];
      console.warn(`[admin] ${GLOBAL_MAX_FAILS} failed sign-ins in 15 minutes from all addresses: sign-in is locked for everyone for 15 minutes.`);
      await audit('lockout', req, { scope: 'global', minutes: GLOBAL_LOCK / 60000 });
    }
  }

  /* sessions: the cookie holds 32 random bytes; the server keeps only their hash */
  const sessions = new Map(); // sha256(token) hex -> { created, seen, secure, ua }
  const names = (req) => (req.secure
    ? { sess: '__Host-sv_admin', pre: '__Host-sv_admin_pre' }
    : { sess: 'sv_admin_dev', pre: 'sv_admin_pre_dev' });
  function setCookie(req, res, name, value, maxAgeSecs) {
    const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${Math.max(0, Math.floor(maxAgeSecs))}`, 'HttpOnly', 'SameSite=Strict'];
    if (req.secure) parts.push('Secure');
    res.append('Set-Cookie', parts.join('; '));
  }
  const uaTag = (req) => sha256(cleanUa(req.get('user-agent'))).toString('hex');
  function getSession(req) {
    const tok = parseCookies(req).get(names(req).sess);
    if (!tok || !/^[A-Za-z0-9_-]{43}$/.test(tok)) return null;
    const id = sha256(tok).toString('hex');
    const s = sessions.get(id);
    if (!s) return null;
    const t = now();
    if (t - s.created >= cfg.sessionMs || t - s.seen >= cfg.idleMs || s.secure !== req.secure || s.ua !== uaTag(req)) {
      sessions.delete(id);
      return null;
    }
    s.seen = t;
    return { id, csrf: mac(`csrf|${id}`) };
  }
  /** True when the request carries a live session; changes nothing (no idle refresh). */
  function hasSession(req) {
    const tok = parseCookies(req).get(names(req).sess);
    if (!tok || !/^[A-Za-z0-9_-]{43}$/.test(tok)) return false;
    const s = sessions.get(sha256(tok).toString('hex'));
    const t = now();
    return !!s && t - s.created < cfg.sessionMs && t - s.seen < cfg.idleMs && s.secure === req.secure && s.ua === uaTag(req);
  }
  app.locals.isAdminVisit = (req) => inAllowList(req) || hasSession(req);
  function createSession(req, res) {
    const old = parseCookies(req).get(names(req).sess);
    if (old) sessions.delete(sha256(old).toString('hex')); // rotate: the old token dies
    while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    const tok = crypto.randomBytes(32).toString('base64url');
    const t = now();
    sessions.set(sha256(tok).toString('hex'), { created: t, seen: t, secure: req.secure, ua: uaTag(req) });
    setCookie(req, res, names(req).sess, tok, cfg.sessionMs / 1000);
  }
  setInterval(() => {
    const t = now();
    for (const [id, s] of sessions) if (t - s.created >= cfg.sessionMs || t - s.seen >= cfg.idleMs) sessions.delete(id);
  }, 60 * 1000).unref();

  /* the sign-in form's CSRF token: an HMAC of a pre-session cookie and a time */
  function preToken(req, res) {
    let pre = parseCookies(req).get(names(req).pre);
    if (!pre || !/^[A-Za-z0-9_-]{43}$/.test(pre)) {
      pre = crypto.randomBytes(32).toString('base64url');
      setCookie(req, res, names(req).pre, pre, PRE_TOKEN_SECS);
    }
    const ts = String(Math.floor(now() / 1000));
    return `${ts}.${mac(`login|${pre}|${ts}`)}`;
  }
  function preTokenOk(req, token) {
    const pre = parseCookies(req).get(names(req).pre);
    const m = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(typeof token === 'string' ? token : '');
    if (!pre || !/^[A-Za-z0-9_-]{43}$/.test(pre) || !m) return false;
    const age = now() / 1000 - Number(m[1]);
    if (age < -60 || age > PRE_TOKEN_SECS) return false;
    return safeEqual(m[2], mac(`login|${pre}|${m[1]}`));
  }

  /* same origin: the site's own check, plus an exact host match and fetch metadata.
     The admin pages send Referrer-Policy: no-referrer, so a browser's form post
     from them carries "Origin: null"; Sec-Fetch-Site then proves it came from here
     (every current browser sends it). With neither, the post is refused. */
  function sameOrigin(req) {
    const site = req.get('sec-fetch-site');
    if (site && site !== 'same-origin') return false;
    const origin = req.get('origin');
    if (origin && origin !== 'null') {
      try { if (new URL(origin).host !== req.get('host')) return false; } catch (e) { return false; }
    }
    return originAllowed(req);
  }

  /* responses */
  function adminHeaders(res) {
    res.set({
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
  }
  function send(res, status, html) {
    adminHeaders(res);
    res.status(status).type('html').send(html);
  }
  function redirect(res, to) {
    adminHeaders(res);
    res.redirect(303, to);
  }
  const brand = '<svg viewBox="0 0 18 20" aria-hidden="true" focusable="false"><rect x="0" y="18.5" width="18" height="1.5"/><rect x="1" y="12" width="2.4" height="7"/><rect x="7.8" y="7" width="2.4" height="12"/><rect x="14.6" y="1" width="2.4" height="18"/></svg>';
  function page({ title, main, session, script }) {
    const out = session
      ? `<form method="post" action="${ADMIN_PATH}/logout" class="admin-logout"><input type="hidden" name="csrf" value="${esc(session.csrf)}"><button class="btn btn-sm" type="submit">Log out</button></form>`
      : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <title>${esc(title)}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/site.css?v=admin-2">
  <script src="/assets/theme.js"></script>
${script ? `  <script src="${ADMIN_PATH}/assets/dashboard.js" defer></script>\n` : ''}${script === 'visitors' ? `  <script src="${ADMIN_PATH}/assets/visitors.js" defer></script>\n` : ''}</head>
<body class="admin"${session ? ` data-idle-seconds="${Math.floor(cfg.idleMs / 1000)}"` : ''}>
  <header class="site-header">
    <div class="wrap">
      <span class="brand">${brand}<span>Savant</span></span>
      <span class="admin-tag">Private</span>
      <div class="header-actions">${out}</div>
    </div>
  </header>
  <main id="main" class="wrap admin-main">
${main}
  </main>
</body>
</html>
`;
  }
  function loginPage(req, res, error) {
    const token = preToken(req, res);
    const code = `
        <div class="field">
          <label for="admin-code">6-digit code <span class="hint">From your authenticator app</span></label>
          <input type="text" id="admin-code" name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" required>
        </div>`;
    return page({
      title: 'Sign in | Savant',
      main: `    <section class="admin-login form-panel" aria-labelledby="admin-login-h">
      <h1 id="admin-login-h">Sign in</h1>
      ${error ? `<p class="admin-alert" role="alert">${esc(error)}</p>` : ''}
      <form method="post" action="${ADMIN_PATH}/login" class="form">
        <input type="hidden" name="csrf" value="${esc(token)}">
        <div class="field">
          <label for="admin-user">User</label>
          <input type="text" id="admin-user" name="user" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="200" required>
        </div>
        <div class="field">
          <label for="admin-password">Password</label>
          <input type="password" id="admin-password" name="password" autocomplete="current-password" maxlength="1024" required>
        </div>${code}
        <div class="form-actions"><button class="btn btn-primary btn-lg" type="submit">Sign in</button></div>
      </form>
    </section>`,
    });
  }

  const when = (at) => {
    const s = typeof at === 'string' ? at : '';
    return /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s)
      ? `<time datetime="${esc(s)}"><span>${esc(s.slice(0, 10))}</span> <span>${esc(s.slice(11, 16))} UTC</span></time>`
      : esc(s);
  };
  const COLS = {
    when: ['When', (r) => when(r.at), 'admin-when'],
    form: ['Form', (r) => esc(LABEL[r.form] || r.form), 'admin-short'],
    email: ['Email', (r) => esc(r.email), 'admin-email'],
    name: ['Name', (r) => esc(r.name), 'admin-name'],
    phone: ['Phone', (r) => esc(r.phone), 'admin-short'],
    role: ['I am', (r) => esc(r.role), 'admin-short'],
    status: ['Status', (r) => esc(r.status === 'started' ? 'Email only' : r.status === 'applied' ? 'Complete' : r.status), 'admin-short'],
    learn: ['Subjects', (r) => esc([...(Array.isArray(r.interests) ? r.interests : []), r.interests_other].filter((x) => typeof x === 'string' && x).join(', ')), 'admin-name'],
    source: ['Form', (r) => esc(r.source), 'admin-short'],
    why: ['Reason', (r) => esc(r.why), 'admin-long'],
    ref: ['Creator code', (r) => esc(r.ref), 'admin-short'],
    firm: ['Firm', (r) => esc(r.firm), 'admin-name'],
    message: ['Message', (r) => esc(r.message), 'admin-long'],
    // The All tab: a beta "why" and an investor's message never share a row.
    text: ['Why / message', (r) => esc(typeof r.why === 'string' && r.why ? r.why : r.message), 'admin-long'],
    consent: ['Consent', (r) => [r.consent_text, r.age_text].filter((x) => typeof x === 'string' && x).map((x) => `<span>${esc(x)}</span>`).join(''), 'admin-consent'],
  };
  const TAB_COLS = {
    all: ['when', 'form', 'email', 'name', 'role', 'firm', 'text', 'consent'],
    updates: ['when', 'email', 'consent'],
    beta: ['when', 'email', 'status', 'name', 'phone', 'role', 'learn', 'why', 'source', 'ref'],
    investors: ['when', 'email', 'name', 'firm', 'message'],
  };
  const link = (tab, q) => `${ADMIN_PATH}?form=${encodeURIComponent(tab)}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const FLASH = { deleted: ['admin-ok', 'Deleted one entry.'], missing: ['admin-alert', 'That entry was already gone.'] };

  /** The tab row: one per form, then Visitors. */
  function tabList(tab, all, total) {
    const formTabs = TABS.map((t) => {
      const n = t === 'all' ? total : all[t].length;
      return `<li><a href="${esc(link(t))}"${t === tab ? ' aria-current="page"' : ''}>${esc(LABEL[t])} <span class="num">${n}</span></a></li>`;
    }).join('');
    const creatorsTab = `<li><a href="${ADMIN_PATH}?form=creators"${tab === 'creators' ? ' aria-current="page"' : ''}>Creators</a></li>`;
    return analytics
      ? `${formTabs}${creatorsTab}<li><a href="${ADMIN_PATH}?form=visitors"${tab === 'visitors' ? ' aria-current="page"' : ''}>Visitors</a></li>`
      : `${formTabs}${creatorsTab}`;
  }

  /* the Visitors tab (visit statistics) */
  const report = analytics ? require('./analytics-report').createReport({ analytics, forms, readAll }) : null;
  const { renderVisitors } = require('./admin-visitors');
  async function visitorsPage(req, session) {
    const q = (str(req.query.q, 200) || '').trim();
    const ipQ = str(req.query.ip, 64);
    const all = {};
    for (const f of forms) all[f] = readAll(f);
    const total = forms.reduce((n, f) => n + all[f].length, 0);
    const stats = await report.stats();
    const ip = ipQ && stats.visitors.some((a) => a.ip === ipQ) ? ipQ : null;
    const detail = ip ? await report.detail(ip) : null;
    return page({
      title: 'Visitors | Savant',
      session,
      script: 'visitors',
      main: renderVisitors({ stats, detail, q, ip, esc, ADMIN_PATH, tabs: tabList('visitors', all, total), idleMinutes: Math.round(cfg.idleMs / 60000) }),
    });
  }

  /* the Creators tab: per creator code, applications, consented emails and visits */
  const creatorsLib = require('./creators');
  async function creatorsPage(req, session) {
    const all = {};
    for (const f of forms) all[f] = readAll(f);
    const total = forms.reduce((n, f) => n + all[f].length, 0);
    const stats = report ? await report.stats() : null;
    const rows = creatorsLib.summarize({ creators: creatorsLib.loadCreators(), beta: all.beta || [], visits: stats ? stats.sourceCounts : {} });
    const num = (n) => Number(n).toLocaleString('en');
    const body = rows.map((r) => `<tr data-row>
        <td data-label="Code" class="admin-name">${esc(r.code)}</td>
        <td data-label="Creator">${r.listed ? esc(r.name) : '<span class="muted">not in creators.json</span>'}</td>
        <td data-label="Visits" class="num">${stats ? num(r.visits) : '<span class="muted">&ndash;</span>'}</td>
        <td data-label="Applications" class="num">${num(r.applications)}</td>
        <td data-label="Emails OK to use" class="num">${num(r.consented)}</td>
        <td data-label="Consented emails" class="admin-email">${r.emails.length ? r.emails.map(esc).join('<br>') : '<span class="muted">&ndash;</span>'}</td>
      </tr>`).join('\n');
    const noCode = (all.beta || []).filter((r) => !creatorsLib.codeOf(r.ref)).length;
    return page({
      title: 'Creators | Savant',
      session,
      main: `    <div class="admin-head">
      <h1>Creators</h1>
      <p class="muted">Applications come from the beta form's creator code (<code>/beta?ref=code</code>). Visits are page views whose source is that code. A visitor outside the UK/EU who has not agreed to visit stats is counted anonymously; both kinds are included. Codes not in <code>creators.json</code> are still counted.</p>
    </div>
    <nav aria-label="Forms"><ul class="admin-tabs">${tabList('creators', all, total)}</ul></nav>
    <p class="admin-count">${rows.length} ${rows.length === 1 ? 'code' : 'codes'}. ${num(noCode)} beta ${noCode === 1 ? 'application has' : 'applications have'} no creator code.</p>
    ${rows.length ? `<div class="admin-table-wrap"><table class="admin-table">
      <thead><tr><th scope="col">Code</th><th scope="col">Creator</th><th scope="col">Visits</th><th scope="col">Applications</th><th scope="col">Emails OK to use</th><th scope="col">Consented emails</th></tr></thead>
      <tbody>
${body}
      </tbody>
    </table></div>` : '<p class="admin-empty">No creator codes yet. Add one to creators.json.</p>'}`,
    });
  }

  function dashboard(req, session) {
    const tab = TABS.includes(req.query.form) ? req.query.form : 'all';
    const q = (str(req.query.q, 200) || '').trim();
    const all = {};
    for (const f of forms) all[f] = readAll(f);
    const total = forms.reduce((n, f) => n + all[f].length, 0);
    let rows = tab === 'all' ? forms.flatMap((f) => all[f]) : all[tab];
    rows = rows.slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) => Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(needle)));
    }
    const matched = rows.length;
    rows = rows.slice(0, MAX_ROWS);
    const cols = TAB_COLS[tab];
    const tabs = tabList(tab, all, total);
    const flash = typeof req.query.done === 'string' && Object.hasOwn(FLASH, req.query.done) ?`<p class="${FLASH[req.query.done][0]}" role="status">${esc(FLASH[req.query.done][1])}</p>` : '';
    const body = rows.map((r) => {
      const cells = cols.map((c) => {
        const [label, fmt, cls] = COLS[c];
        const html = fmt(r);
        return `<td data-label="${esc(label)}" class="${[cls, html ? '' : 'is-empty'].filter(Boolean).join(' ')}">${html || '<span class="muted">&ndash;</span>'}</td>`;
      }).join('');
      const del = forms.includes(r.form) && typeof r.id === 'string' && /^[0-9a-f]{16}$/.test(r.id)
        ? `<details class="admin-delete"><summary class="btn btn-sm">Delete</summary>
          <form method="post" action="${ADMIN_PATH}/delete" class="admin-confirm">
            <input type="hidden" name="csrf" value="${esc(session.csrf)}">
            <input type="hidden" name="form" value="${esc(r.form)}">
            <input type="hidden" name="id" value="${esc(r.id)}">
            <input type="hidden" name="back" value="${esc(tab)}">
            <input type="hidden" name="confirm" value="yes">
            <p>Delete this ${esc(LABEL[r.form])} entry for ${esc(r.email || 'this person')}? This cannot be undone.</p>
            <button class="btn btn-sm btn-danger" type="submit">Confirm delete</button>
          </form></details>`
        : '';
      return `<tr data-row>${cells}<td class="admin-actions">${del}</td></tr>`;
    }).join('\n');
    const head = cols.map((c) => `<th scope="col">${esc(COLS[c][0])}</th>`).join('');
    const exports = (tab === 'all' ? forms : [tab])
      .map((f) => `<a class="btn btn-sm" href="${ADMIN_PATH}/export?form=${encodeURIComponent(f)}">Export ${esc(LABEL[f])} CSV</a>`).join('');
    const events = recentAudit(50).map((e) => {
      const d = e.detail && typeof e.detail === 'object'
        ? Object.entries(e.detail).map(([k, v]) => `${k}: ${v}`).join(', ')
        : '';
      return `<tr><td data-label="When">${when(e.at)}</td><td data-label="Event"><span class="admin-event admin-event-${esc(String(e.event).replace(/[^a-z_]/g, ''))}">${esc(e.event)}</span></td><td data-label="IP" class="admin-email">${esc(e.ip)}</td><td data-label="Browser" class="admin-ua">${esc(e.ua)}</td><td data-label="Detail"${d ? '' : ' class="is-empty"'}>${esc(d)}</td></tr>`;
    }).join('\n');
    const shown = matched > rows.length ? `Showing the newest ${rows.length} of ${matched}. Search or export to see the rest.` : `${matched} ${matched === 1 ? 'entry' : 'entries'}${q ? ` matching "${esc(q)}"` : ''}.`;
    return page({
      title: 'Submissions | Savant',
      session,
      script: true,
      main: `    <div class="admin-head">
      <h1>Submissions</h1>
      <p class="muted">Newest first. You are signed out after ${Math.round(cfg.idleMs / 60000)} minutes without activity.</p>
    </div>
    ${flash}
    <nav aria-label="Forms"><ul class="admin-tabs">${tabs}</ul></nav>
    <div class="admin-tools">
      <form class="admin-search" method="get" action="${ADMIN_PATH}" role="search">
        <input type="hidden" name="form" value="${esc(tab)}">
        <label for="admin-q" class="visually-hidden">Search submissions</label>
        <input type="search" id="admin-q" name="q" value="${esc(q)}" maxlength="200" placeholder="Search email, name, text" data-admin-filter>
        <button class="btn" type="submit">Search</button>
        ${q ? `<a class="btn" href="${esc(link(tab))}">Clear</a>` : ''}
      </form>
      <div class="admin-export">${exports}</div>
    </div>
    <p class="admin-count" data-admin-count>${shown}</p>
    ${rows.length ? `<div class="admin-table-wrap"><table class="admin-table">
      <thead><tr>${head}<th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
      <tbody>
${body}
      </tbody>
    </table></div>` : `<p class="admin-empty">${q ? 'Nothing matches that search.' : 'No submissions yet.'}</p>`}
    <section class="admin-audit" aria-labelledby="admin-audit-h">
      <h2 id="admin-audit-h">Recent activity</h2>
      ${events ? `<div class="admin-table-wrap"><table class="admin-table admin-audit-table">
        <thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">IP</th><th scope="col">Browser</th><th scope="col">Detail</th></tr></thead>
        <tbody>
${events}
        </tbody>
      </table></div>` : '<p class="admin-empty">No activity yet.</p>'}
    </section>`,
    });
  }

  /* routes */
  const router = express.Router();
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // Hidden unless the address is allowed and, in production, the request is HTTPS.
  // Leaving the router here ends at the site's normal 404 page.
  router.use((req, res, next) => {
    if (cfg.allow) {
      const ip = normIp(req.ip);
      const fam = net.isIP(ip);
      if (!fam || !cfg.allow.check(ip, fam === 4 ? 'ipv4' : 'ipv6')) return next('router');
    }
    if (production && !req.secure) return next('router');
    return next();
  });

  const formBody = express.urlencoded({ extended: false, limit: '4kb', parameterLimit: 10 });
  const postOnly = (req, res, next) => {
    if (!req.is('application/x-www-form-urlencoded')) {
      return send(res, 415, page({ title: 'Not accepted | Savant', main: '<p class="admin-alert">That request type is not accepted.</p>' }));
    }
    return next();
  };

  router.get('/', wrap(async (req, res) => {
    const session = getSession(req);
    if (!session) return send(res, 200, loginPage(req, res));
    if (req.query.form === 'creators') return send(res, 200, await creatorsPage(req, session));
    if (report && req.query.form === 'visitors') return send(res, 200, await visitorsPage(req, session));
    return send(res, 200, dashboard(req, session));
  }));

  router.post('/login', postOnly, formBody, wrap(async (req, res) => {
    const started = Date.now();
    const finish = async (fn) => {
      const wait = loginFloorMs - (Date.now() - started);
      if (wait > 0) await sleep(wait);
      fn();
    };
    const body = req.body || {};
    if (!sameOrigin(req)) return finish(() => send(res, 403, loginPage(req, res, 'Sign in from this site’s own page.')));
    if (!preTokenOk(req, body.csrf)) return finish(() => send(res, 403, loginPage(req, res, 'This sign-in form expired. Please try again.')));
    const key = ipKey(req.ip);
    const st = stateFor(key);
    if (isLocked(st, now())
      || st.fails.filter((x) => now() - x < FAIL_WINDOW).length + st.inflight >= IP_MAX_FAILS
      || globalFails.length + globalInflight >= GLOBAL_MAX_FAILS) {
      return finish(() => send(res, 429, loginPage(req, res, TRY_LATER)));
    }
    st.inflight += 1;
    globalInflight += 1;
    let ok = false;
    let step = null;
    try {
      const user = str(body.user, 200);
      const pw = str(body.password, 1024);
      const passOk = await verifyPassword(pw === null ? '' : pw, cfg.hash);
      const userOk = safeEqual(sha256((user || '').normalize('NFC')), sha256(cfg.user));
      // The 6-digit code is always required: there is no password-only path.
      let codeOk = false;
      const code = (str(body.code, 16) || '').replace(/\s+/g, '');
      const okFormat = /^\d{6}$/.test(code);
      const s0 = totpStep(now());
      for (const s of [s0 - 1, s0, s0 + 1]) {
        const match = safeEqual(okFormat ? code : '------', hotp(cfg.totpKey, s));
        if (match && s > lastTotpStep) { codeOk = true; step = s; }
      }
      ok = passOk && userOk && codeOk && okFormat && step !== null && pw !== null && user !== null;
    } finally {
      st.inflight -= 1;
      globalInflight -= 1;
    }
    if (ok && isLocked(st, now())) ok = false;
    if (!ok) {
      const lockedNow = isLocked(st, now());
      if (!lockedNow) await recordFail(key, st, req);
      await audit('login_fail', req);
      return finish(() => send(res, lockedNow ? 429 : 401, loginPage(req, res, lockedNow ? TRY_LATER : GENERIC_FAIL)));
    }
    lastTotpStep = step; // each code works once
    ipState.delete(key);
    createSession(req, res);
    setCookie(req, res, names(req).pre, '', 0);
    await audit('login_ok', req);
    return finish(() => redirect(res, ADMIN_PATH));
  }));

  // Logout and delete: a session, the same origin, and the session's CSRF token.
  function guarded(req, res) {
    if (!sameOrigin(req)) { send(res, 403, page({ title: 'Refused | Savant', main: '<p class="admin-alert">Refused: this must be sent from this site’s own page.</p>' })); return null; }
    const session = getSession(req);
    if (!session) { redirect(res, ADMIN_PATH); return null; }
    if (!safeEqual(typeof req.body.csrf === 'string' ? req.body.csrf : '', session.csrf)) {
      send(res, 403, page({ title: 'Refused | Savant', session, main: `<p class="admin-alert">That form had expired, so nothing was changed. <a href="${ADMIN_PATH}">Reload the page</a> and try again.</p>` }));
      return null;
    }
    return session;
  }

  router.post('/logout', postOnly, formBody, wrap(async (req, res) => {
    const session = guarded(req, res);
    if (!session) return undefined;
    sessions.delete(session.id);
    setCookie(req, res, names(req).sess, '', 0);
    res.set('Clear-Site-Data', '"cache"');
    await audit('logout', req);
    return redirect(res, ADMIN_PATH);
  }));

  router.post('/delete', postOnly, formBody, wrap(async (req, res) => {
    const session = guarded(req, res);
    if (!session) return undefined;
    const form = forms.includes(req.body.form) ? req.body.form : null;
    const id = typeof req.body.id === 'string' && /^[0-9a-f]{16}$/.test(req.body.id) ? req.body.id : null;
    if (!form || !id || req.body.confirm !== 'yes') {
      return send(res, 400, page({ title: 'Not deleted | Savant', session, main: `<p class="admin-alert">Nothing was deleted: that request was incomplete. <a href="${ADMIN_PATH}">Back to submissions</a></p>` }));
    }
    const removed = await removeRecords(form, (r) => r.id === id, 1);
    await audit('delete', req, { form, id, removed });
    const back = TABS.includes(req.body.back) ? req.body.back : form;
    return redirect(res, `${ADMIN_PATH}?form=${back}&done=${removed ? 'deleted' : 'missing'}`);
  }));

  router.get('/export', wrap(async (req, res, next) => {
    const session = getSession(req);
    const form = forms.includes(req.query.form) ? req.query.form : null;
    if (!session || !form) return next('router');
    const rows = readAll(form);
    await audit('export', req, { form, rows: rows.length });
    adminHeaders(res);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="savant-${form}-${new Date(now()).toISOString().slice(0, 10)}.csv"`,
    });
    return res.status(200).send(`\uFEFF${toCsv(rows)}`);
  }));

  router.get('/assets/dashboard.js', (req, res, next) => {
    if (!getSession(req)) return next('router');
    adminHeaders(res);
    res.type('application/javascript');
    return res.sendFile(path.join(root, 'admin-assets', 'dashboard.js'));
  });
  router.get('/assets/visitors.js', (req, res, next) => {
    if (!getSession(req)) return next('router');
    adminHeaders(res);
    res.type('application/javascript');
    return res.sendFile(path.join(root, 'admin-assets', 'visitors.js'));
  });
  // The globe's land outlines (Natural Earth, public domain), built by tools/build-geo.js.
  router.get('/assets/land.json', (req, res, next) => {
    if (!getSession(req)) return next('router');
    adminHeaders(res);
    res.type('application/json');
    return res.sendFile(path.join(root, 'geo', 'land-50m.json'), (err) => { if (err && !res.headersSent) res.status(404).json({ rings: [] }); });
  });
  // Country borders and state/province lines for the globe (Natural Earth, public domain).
  for (const [route, file] of [['/assets/borders.json', 'borders-50m.json'], ['/assets/states.json', 'states-50m.json']]) {
    router.get(route, (req, res, next) => {
      if (!getSession(req)) return next('router');
      adminHeaders(res);
      res.type('application/json');
      return res.sendFile(path.join(root, 'geo', file), (err) => { if (err && !res.headersSent) res.status(404).json({ lines: [] }); });
    });
  }

  // Bodies over the limit, broken encodings: a short page, no stack.
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[admin]', err.message);
    send(res, status >= 400 && status < 600 ? status : 500, page({
      title: 'Error | Savant',
      main: `<p class="admin-alert">${status === 413 ? 'That request was too large.' : status < 500 ? 'That request could not be read.' : 'Something went wrong.'} <a href="${ADMIN_PATH}">Back</a></p>`,
    }));
  });

  app.use(ADMIN_PATH, router);
}

/* ── command line ────────────────────────────────────────────────────────── */

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/** Reads a line from the terminal without echoing it. */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const { stdin } = process;
    process.stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    let buf = '';
    const done = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write('\n');
      resolve(buf);
    };
    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') { done(); return; }
        if (ch === '\u0003') { stdin.setRawMode(false); process.stderr.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') { buf = [...buf].slice(0, -1).join(''); continue; }
        if (ch >= ' ') buf += ch;
      }
    }
    stdin.on('data', onData);
    stdin.resume();
  });
}

/** node server.js admin-hash: prints only ADMIN_PASSWORD_HASH=... on stdout. */
async function cliHash(env = process.env) {
  let pw;
  if (env.ADMIN_PASSWORD_INPUT !== undefined) {
    pw = env.ADMIN_PASSWORD_INPUT;
  } else if (process.stdin.isTTY) {
    pw = await askHidden('Admin password (not shown): ');
    const again = await askHidden('The same again: ');
    if (pw !== again) { console.error('The two entries did not match. Nothing was printed.'); process.exitCode = 1; return; }
  } else {
    pw = (await readStdin()).replace(/\r?\n$/, '');
  }
  if (!pw) { console.error('Refusing an empty password. Nothing was printed.'); process.exitCode = 1; return; }
  const reasons = weakPasswordReasons(pw);
  if (reasons.length) {
    console.error([
      '',
      '  WARNING: this password is weak, because',
      ...reasons.map((r) => `    - ${r}.`),
      '  It guards every submission, together with the authenticator code.',
      '  Use a long passphrase (five or more random words).',
      '  The hash is printed anyway, because the choice is yours.',
      '',
    ].join('\n'));
  }
  process.stdout.write(`ADMIN_PASSWORD_HASH=${hashPassword(pw)}\n`);
}

/** node server.js admin-totp: a new 20-byte secret and its otpauth:// URI. */
function cliTotp({ root, env = process.env }) {
  let user = 'admin';
  try {
    const { vals, problem } = readValues(env, root);
    if (vals.ADMIN_USER) user = vals.ADMIN_USER;
    if (problem) console.error(`Note: ${problem}`);
  } catch (e) { /* the default label is fine */ }
  const secret = base32Encode(crypto.randomBytes(20));
  const label = `Savant:${encodeURIComponent(user)}`;
  process.stdout.write(`ADMIN_TOTP_SECRET=${secret}\n`);
  process.stdout.write(`otpauth://totp/${label}?secret=${secret}&issuer=Savant&algorithm=SHA1&digits=6&period=30\n`);
  console.error([
    '',
    'Add the ADMIN_TOTP_SECRET line to admin.env (chmod 600), then add the secret to your',
    'authenticator app: paste the otpauth:// line into an app that accepts it, or choose',
    '"enter a setup key" and type the secret (time based, 6 digits, 30 seconds).',
    `The account is labelled "Savant: ${user}". Restart the server afterwards.`,
    'Do not keep this output anywhere else; anyone with the secret can make codes.',
    '',
  ].join('\n'));
}

/**
 * node server.js admin-verify-code: reads one 6-digit code from stdin and checks
 * it against ADMIN_TOTP_SECRET (from ADMIN_ENV_FILE or the environment), one 30 s
 * step either side. Exit 0 if it matches, 1 if not, 2 if there is no valid secret.
 * Prints nothing on stdout and never the secret or the code. setup.sh uses it to
 * confirm that the authenticator app was set up before it finishes.
 */
async function cliVerifyCode({ root, env = process.env, input, now = Date.now } = {}) {
  const { vals, problem } = readValues(env, root);
  if (problem) { console.error(problem); process.exitCode = 2; return false; }
  const key = vals.ADMIN_TOTP_SECRET ? base32Decode(vals.ADMIN_TOTP_SECRET) : null;
  if (!key || key.length < 16) { console.error('No valid ADMIN_TOTP_SECRET to check against.'); process.exitCode = 2; return false; }
  const text = input !== undefined ? String(input) : await readStdin();
  const code = (text.split(/\r?\n/)[0] || '').replace(/\s+/g, '');
  let ok = false;
  if (/^\d{6}$/.test(code)) {
    const s0 = totpStep(now());
    for (const s of [s0 - 1, s0, s0 + 1]) if (safeEqual(code, hotp(key, s))) ok = true;
  }
  console.error(ok ? 'Code accepted: the authenticator app is set up.' : 'That code did not match.');
  process.exitCode = ok ? 0 : 1;
  return ok;
}

module.exports = {
  ADMIN_PATH, ADMIN_KEYS, mountAdmin, loadAdminConfig, parseEnvFile, parseHash, insecureMode,
  hashPassword, verifyPassword, weakPasswordReasons, base32Encode, base32Decode, hotp, ipKey,
  cliHash, cliTotp, cliVerifyCode,
};
