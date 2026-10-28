/**
 * Operations endpoints for the hosted beta.
 *
 * STAGED (2026-10-24, curriculum-build/BETA-LAUNCH-KIT.md section 2). Mounted
 * only by the server.js patch in curriculum-build/staged/beta-launch/.
 *
 *   GET /healthz          public, for the host's health check and an uptime
 *                         pinger: 200 { ok: true } or 503 { ok: false }, and
 *                         nothing else (no versions, providers or memory),
 *                         because anyone can call it.
 *   GET /api/ops/status   admins only (ADMIN_EMAILS; 404 for everyone else): the
 *                         checks behind /healthz with their numbers, plus the mail
 *                         transport, the newest backup's age, the error digest,
 *                         memory and the beta-invite counts.
 *   GET /api/ops/errors   admins only: the grouped error digest and the last 100 entries.
 *
 * /healthz is outside /api on purpose: the consent gate and the same-origin check
 * sit on /api, and a health check must answer whoever asks.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const { monitorEventLoopDelay } = require('perf_hooks');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const errorLog = require('../services/error-log');

const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();

const MIN_FREE_DISK_MB = () => Number(process.env.HEALTH_MIN_FREE_DISK_MB || 200);
const MAX_LOOP_P99_MS = () => Number(process.env.HEALTH_MAX_LOOP_MS || 2000);
const MAX_BACKUP_AGE_H = () => Number(process.env.HEALTH_MAX_BACKUP_AGE_H || 26);

function diskFree(dir) {
  try {
    const s = fs.statfsSync(dir);
    return Math.round((Number(s.bavail) * Number(s.bsize)) / (1024 * 1024));
  } catch { return null; }
}

function newestBackup() {
  const dir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(path.dirname(db.path), 'backups');
  try {
    const files = fs.readdirSync(dir).filter((f) => /^db-.*\.manifest\.json$/.test(f));
    let best = null;
    for (const f of files) {
      const m = fs.statSync(path.join(dir, f)).mtimeMs;
      if (!best || m > best.m) best = { f, m };
    }
    return best ? { file: best.f, age_h: Number(((Date.now() - best.m) / 3600000).toFixed(1)) } : null;
  } catch { return null; }
}

function checks() {
  const out = {};
  // The store answers, and its file is on disk (the JSON driver writes it at boot).
  try {
    const users = db.all('users').length;
    const st = fs.statSync(db.path);
    out.db = { ok: true, users, bytes: st.size, written_s_ago: Math.round((Date.now() - st.mtimeMs) / 1000) };
  } catch (err) {
    out.db = { ok: false, error: err.code || err.message };
  }
  const free = diskFree(path.dirname(db.path));
  out.disk = { ok: free === null || free >= MIN_FREE_DISK_MB(), free_mb: free };
  const p99 = Math.round(loop.percentile(99) / 1e6);
  out.event_loop = { ok: p99 < MAX_LOOP_P99_MS(), p99_ms: p99, max_ms: Math.round(loop.max / 1e6) };
  loop.reset();
  return out;
}

const router = express.Router();

router.get('/healthz', (req, res) => {
  const c = checks();
  const ok = c.db.ok && c.disk.ok && c.event_loop.ok;
  res.set('Cache-Control', 'no-store');
  res.status(ok ? 200 : 503).json({ ok });
});

router.get('/api/ops/status', requireAdmin, (req, res) => {
  const c = checks();
  const backup = newestBackup();
  const mem = process.memoryUsage();
  let invites = null;
  try {
    // eslint-disable-next-line global-require
    const all = require('../services/beta-invites').list();
    invites = all.reduce((m, i) => ({ ...m, [i.status]: (m[i.status] || 0) + 1 }), {});
  } catch { /* no invite file */ }
  res.json({
    ok: c.db.ok && c.disk.ok && c.event_loop.ok,
    checks: c,
    backup: backup ? { ...backup, ok: backup.age_h <= MAX_BACKUP_AGE_H() } : { ok: false, file: null },
    // eslint-disable-next-line global-require
    mail: require('../utils/mailer').transportName(),
    node_env: process.env.NODE_ENV || null,
    beta_gate: process.env.BETA_GATE || 'off',
    invites,
    memory_mb: { rss: Math.round(mem.rss / 1048576), heap_used: Math.round(mem.heapUsed / 1048576) },
    uptime_s: Math.round(process.uptime()),
    errors: errorLog.digest(10),
  });
});

router.get('/api/ops/errors', requireAdmin, (req, res) => {
  res.json({ digest: errorLog.digest(50), recent: errorLog.recent(100) });
});

module.exports = { router, checks, newestBackup };
