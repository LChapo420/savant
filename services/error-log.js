/**
 * Error monitoring with no third-party tracker: errors are written to a local,
 * size-rotated JSON-lines file, grouped by fingerprint, and (optionally) a new
 * kind of error is emailed to the owner through utils/mailer.js, at most once
 * an hour.
 *
 * STAGED (2026-10-24, curriculum-build/BETA-LAUNCH-KIT.md section 2). Nothing
 * loads this until server.js calls `install()` and uses `expressHandler` (see
 * curriculum-build/staged/beta-launch/server.js.patch).
 *
 * What is recorded: time, kind (request / uncaught / unhandled), the error's
 * name, message and first stack frames, and for a request the method, the route
 * path with the query string removed, the status and the user id. Never: request
 * bodies, cookies, headers, IP addresses or query strings, so a learner's answers,
 * a session cookie or a consent token cannot end up in a log. Email addresses in
 * a message are masked.
 *
 * Env: LOG_DIR (default `logs` in the app folder), ERROR_LOG_MAX_MB (5),
 * ERROR_LOG_KEEP (5 rotated files), ERROR_ALERT_EMAIL (unset = no email),
 * ERROR_ALERT_MIN_MS (3600000).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const groups = new Map(); // fingerprint -> { count, first, last, sample }
let lastAlertAt = 0;
let installed = false;

const logDir = () => path.resolve(process.env.LOG_DIR || path.join(__dirname, '..', 'logs'));
const logFile = () => path.join(logDir(), 'errors.jsonl');

function scrub(text) {
  return String(text || '')
    .replace(/[^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/([?&](token|invite|code|key|password|secret)=)[^&\s]+/gi, '$1<redacted>')
    .replace(/\b(sk|re|nvapi|xkiro|sk-ant)[-_][A-Za-z0-9_-]{8,}/g, '<key>')
    .slice(0, 2000);
}

function frames(err) {
  return String((err && err.stack) || '').split('\n').slice(1, 6).map((l) => scrub(l.trim())).filter(Boolean);
}

function fingerprint(entry) {
  // The message with numbers taken out, plus the top frame: "id 41 not found"
  // and "id 42 not found" are one problem.
  const msg = String(entry.message || '').replace(/\d+/g, 'N');
  return crypto.createHash('sha1').update(`${entry.name}|${msg}|${entry.stack[0] || ''}|${entry.route || ''}`).digest('hex').slice(0, 12);
}

function rotate(file) {
  const maxBytes = Number(process.env.ERROR_LOG_MAX_MB || 5) * 1024 * 1024;
  const keep = Number(process.env.ERROR_LOG_KEEP || 5);
  let size = 0;
  try { size = fs.statSync(file).size; } catch { return; }
  if (size < maxBytes) return;
  for (let i = keep - 1; i >= 1; i--) {
    try { fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`); } catch { /* gap */ }
  }
  try { fs.unlinkSync(`${file}.${keep + 1}`); } catch { /* none */ }
  try { fs.renameSync(file, `${file}.1`); } catch { /* raced */ }
}

function maybeAlert(entry, isNew) {
  const to = process.env.ERROR_ALERT_EMAIL;
  if (!to || !isNew || entry.kind === 'client') return;
  const minGap = Number(process.env.ERROR_ALERT_MIN_MS || 3600000);
  if (Date.now() - lastAlertAt < minGap) return;
  lastAlertAt = Date.now();
  // eslint-disable-next-line global-require
  require('../utils/mailer').send({
    to,
    subject: `Savant: new error ${entry.fp} (${entry.name})`,
    tag: 'error-alert',
    text: [`A kind of error not seen since the last restart:`, '', `${entry.name}: ${entry.message}`, ...entry.stack, '',
      `Where: ${entry.kind}${entry.route ? ` ${entry.method} ${entry.route} -> ${entry.status}` : ''}`,
      `When: ${entry.at}`, '', 'Full list: GET /api/ops/errors (admin).'].join('\n'),
  }).catch(() => { /* an alert that cannot be sent must not raise another error */ });
}

/** Record one error. Never throws. Returns the entry. */
function record(err, { kind = 'request', req = null, status = null } = {}) {
  try {
    const entry = {
      at: new Date().toISOString(),
      kind,
      name: (err && err.name) || 'Error',
      message: scrub((err && err.message) || String(err)),
      stack: frames(err),
    };
    if (req) {
      entry.method = req.method;
      entry.route = scrub(String(req.originalUrl || req.url || '').split('?')[0]).slice(0, 200);
      entry.status = status;
      entry.user_id = req.user ? req.user.id : null;
    }
    entry.fp = fingerprint(entry);
    const g = groups.get(entry.fp);
    if (g) { g.count++; g.last = entry.at; } else groups.set(entry.fp, { count: 1, first: entry.at, last: entry.at, sample: entry });
    const file = logFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotate(file);
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    maybeAlert(entry, !g);
    return entry;
  } catch {
    return null;
  }
}

/** Express error middleware: records, then hands on to the app's own handler. */
function expressHandler(err, req, res, next) {
  const status = err && Number(err.status || err.statusCode) >= 400 ? Number(err.status || err.statusCode) : 500;
  // A 4xx (a broken JSON body, a body over the limit) is the client's mistake:
  // kept as kind 'client' for the digest, never emailed.
  record(err, { kind: status < 500 ? 'client' : 'request', req, status });
  next(err);
}

/** Process-level hooks. An uncaught exception is recorded, then the process exits
 * (its state is unknown); the process manager restarts it. */
function install() {
  if (installed) return;
  installed = true;
  process.on('unhandledRejection', (reason) => { record(reason instanceof Error ? reason : new Error(String(reason)), { kind: 'unhandled' }); });
  process.on('uncaughtException', (err) => {
    record(err, { kind: 'uncaught' });
    console.error('uncaught:', err);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 200).unref();
  });
}

/** Grouped summary since this process started, most frequent first. */
function digest(limit = 50) {
  return [...groups.entries()].map(([fp, g]) => ({ fp, count: g.count, first: g.first, last: g.last, name: g.sample.name, message: g.sample.message, where: g.sample.route || g.sample.kind, top: g.sample.stack[0] || null }))
    .sort((a, b) => b.count - a.count).slice(0, limit);
}

/** The last n entries from the file (current file only). */
function recent(n = 100) {
  try {
    const lines = fs.readFileSync(logFile(), 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function _reset() { groups.clear(); lastAlertAt = 0; }

module.exports = { record, expressHandler, install, digest, recent, scrub, logFile, _reset };
