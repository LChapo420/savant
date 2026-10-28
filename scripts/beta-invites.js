#!/usr/bin/env node
/**
 * The owner's beta-invite tool (curriculum-build/BETA-LAUNCH-KIT.md section 4).
 *
 *   node scripts/beta-invites.js applicants [--from site/data/beta.jsonl]
 *        every beta application from the landing site, with its invite state
 *   node scripts/beta-invites.js approve <email> [--name N] [--role R] [--days 30] [--send]
 *        make a one-time code for that address; --send emails it (through the
 *        provider in MAIL_PROVIDER, else the dev outbox; production with no
 *        provider refuses, as utils/mailer.js does). Without --send the code is
 *        printed once for you to pass on by hand.
 *   node scripts/beta-invites.js approve-applicants <id,id,...> [--from ...] [--send]
 *        the same, for applications picked by their id from `applicants`
 *   node scripts/beta-invites.js revoke <email>
 *   node scripts/beta-invites.js forget <email>      remove every invite row for it
 *   node scripts/beta-invites.js list
 *
 * Env: BETA_INVITES_FILE (default beside the data file), APP_ORIGIN (the link
 * in the email; required with --send), MAIL_* (utils/mail-transports.js).
 * The applicant file is only read, never written.
 */
require('dotenv').config({ quiet: true });
const path = require('path');
const invites = require('../services/beta-invites');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const fromFile = () => path.resolve(flag('from', path.join(ROOT, 'site', 'data', 'beta.jsonl')));

async function sendInvite(invite, code) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new Error('APP_ORIGIN is not set: the email needs the app\'s public address for its link.');
  require('../utils/mail-transports').installFromEnv();
  // The mailer finds its outbox through config/db, which would load the whole
  // data file into this tool (and, on an unreadable read while the server is
  // mid-write, move it aside). Name the same folder directly instead.
  if (!process.env.MAIL_OUTBOX_DIR) {
    process.env.MAIL_OUTBOX_DIR = path.join(process.env.DB_FILE ? path.dirname(path.resolve(process.env.DB_FILE)) : path.join(ROOT, 'data'), 'outbox');
  }
  const mailer = require('../utils/mailer');
  const out = await mailer.send(invites.inviteEmail({ to: invite.email, name: invite.name, code, origin, days: Number(flag('days', 30)) }));
  invites.markEmailed(invite.id);
  return out.transport === 'dev-outbox' ? `written to the dev outbox (${out.file})` : `sent (${out.result && out.result.provider})`;
}

async function approveOne(email, extra) {
  const { code, invite } = invites.approve(email, { days: Number(flag('days', 30)), by: process.env.USERNAME || process.env.USER || null, ...extra });
  if (has('send')) {
    const where = await sendInvite(invite, code);
    console.log(`${invite.email}: invited, code ${where}.`);
  } else {
    // Printed once; only its hash is stored.
    console.log(`${invite.email}: invited. Code (shown once): ${code}  Link: ${(process.env.APP_ORIGIN || '<APP_ORIGIN>').replace(/\/$/, '')}/join?invite=${code}`);
  }
}

(async () => {
  if (cmd === 'applicants') {
    const rows = invites.applicants(fromFile());
    if (!rows.length) { console.log(`No applications in ${fromFile()}.`); return; }
    for (const r of rows) console.log([r.id, r.at, r.email, r.name || '', r.role || '', r.invite].join('\t'));
    console.log(`${rows.length} application(s); ${rows.filter((r) => r.invite === 'none').length} not invited yet.`);
  } else if (cmd === 'approve' && args[1]) {
    await approveOne(args[1], { name: flag('name'), role: flag('role'), source: 'manual' });
  } else if (cmd === 'approve-applicants' && args[1]) {
    const ids = new Set(args[1].split(',').map((s) => s.trim()).filter(Boolean));
    const rows = invites.applicants(fromFile()).filter((r) => ids.has(r.id));
    const missing = [...ids].filter((id) => !rows.some((r) => r.id === id));
    if (missing.length) console.log(`Not found in ${fromFile()}: ${missing.join(', ')}`);
    for (const r of rows) await approveOne(r.email, { name: r.name, role: r.role, source: `site-beta:${r.id}` });
  } else if (cmd === 'revoke' && args[1]) {
    console.log(`Revoked ${invites.revoke(args[1])} live invite(s) for ${args[1]}.`);
  } else if (cmd === 'forget' && args[1]) {
    console.log(`Removed ${invites.forget(args[1])} invite row(s) for ${args[1]}.`);
  } else if (cmd === 'list') {
    for (const i of invites.list()) console.log([i.id, i.email, i.status, i.invited_at, i.expires_at, i.emailed_at || '-', i.user_id || '-'].join('\t'));
  } else {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(1, 22).join('\n'));
    process.exitCode = cmd ? 1 : 0;
  }
})().catch((err) => { console.error(err.message); process.exit(1); });
