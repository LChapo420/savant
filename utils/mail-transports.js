/**
 * Real email delivery for utils/mailer.js, over the providers' HTTP APIs.
 *
 * STAGED (2026-10-24, curriculum-build/BETA-LAUNCH-KIT.md section 3). Nothing
 * loads this file until server.js calls `installFromEnv()` at start-up (the
 * one-line wiring is in curriculum-build/staged/beta-launch/server.js.patch).
 *
 * Two providers, both free tiers checked on 2026-10-24:
 *   resend  POST https://api.resend.com/emails, `Authorization: Bearer <key>`.
 *           Free: 3,000 a month, 100 a day, 3 domains (resend.com/pricing).
 *   brevo   POST https://api.brevo.com/v3/smtp/email, `api-key: <key>`.
 *           Free: 300 a day per third-party summaries; Brevo's own page did
 *           not render here, so check it when the account is opened.
 * No mail library is added: Node's own fetch does the work.
 *
 * Environment (names only; values live in the host's secret store, never in git):
 *   MAIL_PROVIDER   resend | brevo | resend,brevo (the second is the failover)
 *   RESEND_API_KEY, BREVO_API_KEY
 *   MAIL_FROM       "Savant <no-reply@send.example.com>", a verified sender
 *   MAIL_REPLY_TO   optional, where replies go (a monitored inbox)
 *   MAIL_DAILY_CAP  per provider, per UTC day; default 100 (resend) / 300 (brevo).
 *                   At the cap that provider is skipped until the next day, so a
 *                   burst of sign-ups fails over instead of being refused.
 *   MAIL_TIMEOUT_MS default 10000
 *   RESEND_API_URL, BREVO_API_URL  override the endpoint (tests point these at a
 *                   local fake; leave unset in production)
 *
 * Messages are plain text ({ to, subject, text, tag }), as the consent flow
 * writes them. A key is never logged, and errors carry the provider's status
 * and message only.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CAP = { resend: 100, brevo: 300 };

class MailError extends Error {
  constructor(message, { provider, status, retryable } = {}) {
    super(message);
    this.name = 'MailError';
    this.provider = provider;
    this.status = status;
    this.retryable = !!retryable;
  }
}

/** "Name <a@b.c>" or "a@b.c" into { name, email }. */
function parseAddress(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim() };
  return { email: s };
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function checkMessage(message) {
  if (!EMAIL.test(String(message.to || ''))) throw new MailError('Recipient is not an email address.', { retryable: false });
  if (!message.subject) throw new MailError('Subject is empty.', { retryable: false });
}

/** Tag names allowed by Resend: ASCII letters, numbers, underscores, dashes. */
function safeTag(tag) {
  return String(tag || 'mail').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256) || 'mail';
}

async function post(fetchImpl, url, headers, body, { provider, timeoutMs }) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new MailError(`${provider}: network error (${err.name === 'TimeoutError' ? 'timed out' : err.message})`, { provider, retryable: true });
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or not JSON */ }
  if (!res.ok) {
    const why = data && (data.message || data.error || data.code) ? String(data.message || data.error || data.code).slice(0, 200) : res.statusText;
    throw new MailError(`${provider}: HTTP ${res.status} ${why}`, {
      provider,
      status: res.status,
      // 429 and 5xx may succeed later or elsewhere; 4xx is our mistake or the account's.
      retryable: res.status === 429 || res.status >= 500,
    });
  }
  return data || {};
}

/** Resend transport. */
function resendTransport({ apiKey, from, replyTo, timeoutMs = 10000, fetchImpl = fetch, url = 'https://api.resend.com/emails' } = {}) {
  if (!apiKey) throw new Error('resend: no API key');
  if (!from) throw new Error('resend: MAIL_FROM is not set');
  const fn = async (message) => {
    checkMessage(message);
    const body = { from, to: [message.to], subject: message.subject, text: message.text, tags: [{ name: 'kind', value: safeTag(message.tag) }] };
    if (replyTo) body.reply_to = replyTo;
    // The same message retried (a timeout after Resend accepted it) is not sent twice.
    const idem = crypto.createHash('sha256').update(`${message.to}\n${message.subject}\n${message.text}`).digest('hex').slice(0, 64);
    const data = await post(fetchImpl, url, { Authorization: `Bearer ${apiKey}`, 'Idempotency-Key': idem }, body, { provider: 'resend', timeoutMs });
    return { provider: 'resend', id: data.id || null };
  };
  fn.providerName = 'resend';
  return fn;
}

/** Brevo transport. */
function brevoTransport({ apiKey, from, replyTo, timeoutMs = 10000, fetchImpl = fetch, url = 'https://api.brevo.com/v3/smtp/email' } = {}) {
  if (!apiKey) throw new Error('brevo: no API key');
  if (!from) throw new Error('brevo: MAIL_FROM is not set');
  const sender = parseAddress(from);
  const fn = async (message) => {
    checkMessage(message);
    const body = { sender, to: [{ email: message.to }], subject: message.subject, textContent: message.text, tags: [safeTag(message.tag)] };
    if (replyTo) body.replyTo = parseAddress(replyTo);
    const data = await post(fetchImpl, url, { 'api-key': apiKey }, body, { provider: 'brevo', timeoutMs });
    return { provider: 'brevo', id: data.messageId || null };
  };
  fn.providerName = 'brevo';
  return fn;
}

/**
 * A per-provider daily cap, counted in a small JSON file so a restart does not
 * reset it. The file holds counts and the UTC day only, never addresses.
 */
function dailyCap(transport, { cap, stateFile, name = transport.providerName || 'mail', now = () => new Date() }) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; }
  };
  const write = (state) => {
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state));
      fs.renameSync(`${stateFile}.tmp`, stateFile);
    } catch { /* a counter that cannot be saved must not stop the mail */ }
  };
  const fn = async (message) => {
    const day = now().toISOString().slice(0, 10);
    const state = read();
    const mine = state[name] && state[name].day === day ? state[name] : { day, sent: 0 };
    if (mine.sent >= cap) throw new MailError(`${name}: daily cap of ${cap} reached`, { provider: name, status: 429, retryable: true });
    const out = await transport(message);
    mine.sent += 1;
    write({ ...read(), [name]: mine });
    return out;
  };
  fn.providerName = name;
  fn.sentToday = () => { const s = read()[name]; return s && s.day === now().toISOString().slice(0, 10) ? s.sent : 0; };
  return fn;
}

/**
 * Try each transport in order; move on only when the error is retryable (a
 * 429, a cap, a 5xx, a network failure). A 4xx such as a bad address goes back
 * to the caller at once, because a second provider would refuse it too.
 */
function failover(transports) {
  const list = transports.filter(Boolean);
  if (!list.length) throw new Error('failover: no transports');
  const fn = async (message) => {
    const errors = [];
    for (const t of list) {
      try {
        return await t(message);
      } catch (err) {
        errors.push(err.message);
        if (!(err instanceof MailError) || !err.retryable) throw err;
      }
    }
    throw new MailError(`every mail provider failed: ${errors.join(' | ')}`, { retryable: true });
  };
  fn.providerName = list.map((t) => t.providerName || 'custom').join('>');
  return fn;
}

/** Build the transport the environment describes, or null when none is set. */
function fromEnv(env = process.env, { fetchImpl = fetch, stateDir } = {}) {
  const names = String(env.MAIL_PROVIDER || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return null;
  const from = env.MAIL_FROM;
  const replyTo = env.MAIL_REPLY_TO || undefined;
  const timeoutMs = Number(env.MAIL_TIMEOUT_MS || 10000);
  const dir = stateDir || env.MAIL_STATE_DIR
    || path.join(env.DB_FILE ? path.dirname(path.resolve(env.DB_FILE)) : path.join(__dirname, '..', 'data'));
  const stateFile = path.join(dir, 'mail-counters.json');
  const built = names.map((name) => {
    let t;
    if (name === 'resend') t = resendTransport({ apiKey: env.RESEND_API_KEY, from, replyTo, timeoutMs, fetchImpl, url: env.RESEND_API_URL || undefined });
    else if (name === 'brevo') t = brevoTransport({ apiKey: env.BREVO_API_KEY, from, replyTo, timeoutMs, fetchImpl, url: env.BREVO_API_URL || undefined });
    else throw new Error(`MAIL_PROVIDER: unknown provider "${name}" (use resend or brevo)`);
    const cap = Number(env[`MAIL_DAILY_CAP_${name.toUpperCase()}`] || env.MAIL_DAILY_CAP || DEFAULT_CAP[name]);
    return dailyCap(t, { cap, stateFile, name });
  });
  return built.length === 1 ? built[0] : failover(built);
}

/**
 * Plug the configured provider into utils/mailer.js. Returns the provider name,
 * or null when MAIL_PROVIDER is unset (the dev outbox stays, and production
 * keeps refusing to "send" into it, as utils/mailer.js already does).
 */
function installFromEnv(env = process.env, opts = {}) {
  const transport = fromEnv(env, opts);
  if (!transport) return null;
  require('./mailer').setTransport(transport);
  return transport.providerName;
}

module.exports = {
  MailError, resendTransport, brevoTransport, dailyCap, failover, fromEnv, installFromEnv, parseAddress, safeTag,
};
