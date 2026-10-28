#!/usr/bin/env node
/**
 * An uptime check you run from somewhere other than the server (this laptop's
 * Task Scheduler, or a second machine): GET <url>/healthz, and email when it
 * goes down and when it comes back. No third-party monitor, no tracker.
 * (curriculum-build/BETA-LAUNCH-KIT.md section 2.6.)
 *
 *   node scripts/health-watch.js --url https://app.example.com [--tries 2] [--timeout 10000]
 *
 * "Down" is two failed tries in a row, 20 s apart (a non-200 answer, a timeout,
 * or no connection), so one dropped packet does not page anyone. The last state
 * is kept in HEALTH_WATCH_STATE (default <os tmp>/savant-health-watch.json), so
 * a state change sends one email, not one per run.
 *
 * Mail: ERROR_ALERT_EMAIL is the recipient; the provider comes from MAIL_PROVIDER
 * and its key (utils/mail-transports.js). Without a provider it prints only.
 * Exit code: 0 up, 1 down (so a scheduler can show it too).
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = String(flag('url', process.env.APP_ORIGIN || '')).replace(/\/$/, '');
const tries = Number(flag('tries', 2));
const timeout = Number(flag('timeout', 10000));
const stateFile = process.env.HEALTH_WATCH_STATE || path.join(os.tmpdir(), 'savant-health-watch.json');

async function probe() {
  try {
    const r = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'savant-health-watch' } });
    return r.status === 200 ? { ok: true } : { ok: false, why: `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, why: err.name === 'TimeoutError' ? `no answer in ${timeout} ms` : err.message };
  }
}

async function notify(subject, text) {
  const to = process.env.ERROR_ALERT_EMAIL;
  console.log(`${subject}\n${text}`);
  if (!to) return;
  const name = require('../utils/mail-transports').installFromEnv();
  if (!name) { console.log('(no MAIL_PROVIDER: not emailed)'); return; }
  await require('../utils/mailer').send({ to, subject, text, tag: 'health-watch' });
}

(async () => {
  if (!/^https?:\/\//.test(base)) { console.error('Usage: node scripts/health-watch.js --url https://app.example.com'); process.exit(2); }
  let last = { ok: false };
  for (let i = 0; i < tries; i++) {
    last = await probe();
    if (last.ok) break;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 20000));
  }
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* first run */ }
  const now = new Date().toISOString();
  if (!prev || prev.ok !== last.ok) {
    fs.writeFileSync(stateFile, JSON.stringify({ ok: last.ok, since: now, why: last.why || null }));
    if (prev) {
      await notify(last.ok ? `Savant is back up (${base})` : `Savant is DOWN (${base})`,
        last.ok ? `Up again at ${now}; it was down since ${prev.since} (${prev.why}).` : `${base}/healthz failed ${tries} times in a row at ${now}: ${last.why}.\nRollback plan: curriculum-build/BETA-LAUNCH-KIT.md section 5.`);
    }
  }
  console.log(`${now} ${last.ok ? 'up' : `down: ${last.why}`}`);
  process.exit(last.ok ? 0 : 1);
})().catch((err) => { console.error(err.message); process.exit(1); });
