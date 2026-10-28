/**
 * Outgoing email, behind one function so the delivery can be swapped.
 *
 * The app had no mail mechanism before the parental consent flow needed one
 * (no SMTP settings, no mail library, no provider key). So this is a pluggable
 * sender with one transport built in: the dev outbox, which writes each message
 * as a JSON file and sends nothing. A real provider is plugged in with
 * `setTransport(fn)` at start-up (fn receives { to, subject, text, tag } and
 * returns a promise); until one is, every "sent" email is a file on disk.
 *
 * Where the outbox lives: MAIL_OUTBOX_DIR, or an `outbox` folder beside the data
 * file (so a test or a second copy of the app on its own DB_FILE keeps its own
 * outbox). Messages hold links that act on a child's account, so the folder is
 * as private as the data file and is never served.
 *
 * In production with no transport plugged in, `send` refuses loudly rather than
 * pretending: a parent who never gets the consent email is a child stuck in a
 * limited account, and nobody would know why.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let transport = null;

function outboxDir() {
  if (process.env.MAIL_OUTBOX_DIR) return path.resolve(process.env.MAIL_OUTBOX_DIR);
  // Required lazily so this file can be loaded before the store.
  // eslint-disable-next-line global-require
  const db = require('../config/db');
  return path.join(path.dirname(db.path), 'outbox');
}

async function devOutbox(message) {
  const dir = outboxDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${stamp}-${crypto.randomBytes(3).toString('hex')}-${message.tag || 'mail'}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...message, written_at: new Date().toISOString() }, null, 2), 'utf8');
  return { transport: 'dev-outbox', file };
}

/** Plug in a real sender. `fn({ to, subject, text, tag })` returns a promise. */
function setTransport(fn) {
  transport = typeof fn === 'function' ? fn : null;
}

function transportName() {
  return transport ? 'custom' : 'dev-outbox';
}

/**
 * Send one plain-text email. Resolves with where it went; never throws for a
 * dev outbox write, so a caller's request does not fail on a full disk.
 */
async function send({ to, subject, text, tag }) {
  const message = { to: String(to || ''), subject: String(subject || ''), text: String(text || ''), tag: tag || null };
  if (transport) return { transport: 'custom', result: await transport(message) };
  if (process.env.NODE_ENV === 'production' && process.env.MAIL_ALLOW_OUTBOX !== '1') {
    throw new Error('No mail transport is configured. Plug one in with utils/mailer setTransport().');
  }
  return devOutbox(message);
}

/** The messages in the dev outbox, newest last. For tests and local checks only. */
function readOutbox() {
  const dir = outboxDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: path.join(dir, f), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

module.exports = { send, setTransport, transportName, readOutbox, outboxDir };
