#!/usr/bin/env node
/**
 * The staged beta-launch wiring for server.js, config/db.js and package.json
 * (curriculum-build/BETA-LAUNCH-KIT.md). STAGED: nothing here has been applied.
 *
 *   node curriculum-build/staged/beta-launch/apply.js --check
 *        say whether every anchor is still found in the current files (they are
 *        edited by other work; this is the check before applying)
 *   node curriculum-build/staged/beta-launch/apply.js --write --backup <dir>
 *        copy the three files to <dir>, then write the patched versions. Owner only,
 *        on launch day (checklist step L-3). Undo: copy the backups back.
 *
 * The same functions build the patched server the tests run
 * (scripts/beta-launch-test.js), so the test always checks the patch against
 * the server.js of the day. server.js.patch and config-db.js.patch beside this
 * file are the same change as plain diffs, for reading.
 *
 * Every change is off by default or only acts in production:
 *   - error log + process hooks (always on once applied; writes logs/errors.jsonl)
 *   - mail provider from MAIL_PROVIDER (unset = today's dev outbox)
 *   - production refuses to start without MAIL_PROVIDER and an https APP_ORIGIN
 *   - SQLite session store (default in production; SESSION_STORE=memory to opt out)
 *   - the beta gate (BETA_GATE=invite to turn on)
 *   - /healthz and /api/ops/* (new paths)
 *   - /api/health shows providers to admins only, in production
 *   - a body the parser refuses is a 400/413, not a 500
 *   - DB_DRIVER=sqlite hands config/db.js to config/db-sqlite.js (unset = JSON)
 */
const fs = require('fs');
const path = require('path');

const NL = '\n';
const toLF = (t) => t.split('\r\n').join(NL);

function replacer(text) {
  let s = text;
  const missing = [];
  const rep = (a, b, label) => { if (!s.includes(a)) { missing.push(label); return; } s = s.replace(a, b); };
  return { rep, get: () => s, missing };
}

function patchServer(original) {
  const crlf = original.includes('\r\n');
  const r = replacer(toLF(original));
  r.rep("require('dotenv').config();\n", `require('dotenv').config();

// Beta launch (curriculum-build/BETA-LAUNCH-KIT.md): errors go to a local,
// rotated log (no third-party tracker), and the real mail provider is plugged
// into utils/mailer.js when MAIL_PROVIDER is set.
const errorLog = require('./services/error-log');
errorLog.install();
const mailProvider = require('./utils/mail-transports').installFromEnv();
`, 'dotenv');

  r.rep("const isProduction = process.env.NODE_ENV === 'production';\n", `const isProduction = process.env.NODE_ENV === 'production';

// Production refuses to start without what a parent or tester would otherwise
// silently miss: a mail provider (consent and invite emails), and the app's own
// public origin for the links in them. Without APP_ORIGIN the consent emails are
// built from the request's Host header, which a client chooses.
if (isProduction) {
  const problems = [];
  if (!mailProvider && process.env.MAIL_ALLOW_OUTBOX !== '1') problems.push('MAIL_PROVIDER is not set (consent and invite emails could not be sent)');
  if (!/^https:\\/\\/[^/]+$/.test(String(process.env.APP_ORIGIN || '').replace(/\\/$/, ''))) problems.push('APP_ORIGIN must be the https:// origin of the app, e.g. https://app.example.com');
  if (problems.length) {
    console.error(\`Refusing to start in production:\\n  - \${problems.join('\\n  - ')}\`);
    process.exit(1);
  }
}
`, 'isProduction');

  r.rep(`app.use(session({
  name: 'polymath.sid',`, `// Sessions survive a restart and do not grow in memory (express-session's
// MemoryStore does both). SESSION_STORE=memory keeps the old behaviour.
const sessionStore = (process.env.SESSION_STORE || (isProduction ? 'sqlite' : 'memory')) === 'sqlite'
  ? new (require('./services/session-store').SqliteSessionStore)()
  : undefined;
app.use(session({
  name: 'polymath.sid',
  store: sessionStore,`, 'session');

  r.rep('app.use(attachUser);\n', `app.use(attachUser);
// The private beta: with BETA_GATE=invite only an approved tester's invite code
// makes an account (middleware/beta-gate.js). Off by default.
app.use(require('./middleware/beta-gate').betaGate({ db: require('./config/db'), isAdmin: require('./middleware/auth').isAdmin }));
`, 'attachUser');

  r.rep(`app.get('/api/health', (req, res) => {
  res.json({`, `// /healthz (public, ok or not) and /api/ops/* (admins): routes/ops.js.
app.use(require('./routes/ops').router);

app.get('/api/health', (req, res) => {
  // In production the provider list (and free memory) is for admins only.
  if (isProduction && !require('./middleware/auth').isAdmin(req.user)) return res.json({ ok: true });
  res.json({`, 'health');

  r.rep(`// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('unhandled:', err);`, `app.use(errorLog.expressHandler);
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // A body the parser refused (broken JSON, over the limit) is a 400 or 413 for
  // the client to fix, not a 500 "something went wrong on our side".
  const status = Number(err && (err.status || err.statusCode));
  if (status >= 400 && status < 500 && !res.headersSent) {
    return res.status(status).json({ error: status === 413 ? 'That request is too large.' : 'That request could not be read.' });
  }
  console.error('unhandled:', err);`, 'error handler');

  r.rep('  console.log(`Polymath listening on http://localhost:${PORT}`);',
    "  console.log(`Polymath listening on http://localhost:${PORT}`);\n  console.log(`  mail: ${mailProvider || 'dev outbox (no MAIL_PROVIDER)'}; sessions: ${sessionStore ? 'sqlite' : 'memory'}; beta gate: ${process.env.BETA_GATE || 'off'}`);",
    'listening line');
  const out = r.get();
  return { text: crlf ? out.split(NL).join('\r\n') : out, missing: r.missing };
}

function patchDb(original) {
  const crlf = original.includes('\r\n');
  const r = replacer(toLF(original));
  const anchor = "const fs = require('fs');\nconst path = require('path');\n";
  r.rep(anchor, `// DB_DRIVER=sqlite hands everything to config/db-sqlite.js (same API, SQLite on
// disk; move the data first with scripts/migrate-json-to-sqlite.js). Unset or
// "json" keeps this file's JSON store. See curriculum-build/BETA-LAUNCH-KIT.md.
if (process.env.DB_DRIVER === 'sqlite') {
  module.exports = require('./db-sqlite');
  return;
}

${anchor}`, 'db requires');
  const out = r.get();
  return { text: crlf ? out.split(NL).join('\r\n') : out, missing: r.missing };
}

function patchPackage(original) {
  const pkg = JSON.parse(original);
  const missing = [];
  if (!pkg.scripts || typeof pkg.scripts.test !== 'string') missing.push('scripts.test');
  else if (!pkg.scripts.test.includes('beta-launch-test.js')) pkg.scripts.test += ' && node scripts/beta-launch-test.js';
  Object.assign(pkg.scripts, {
    'test:beta-launch': 'node scripts/beta-launch-test.js',
    backup: 'node scripts/backup-db.js',
    'backup:restore-test': 'node scripts/backup-db.js --restore-test',
    'beta:invites': 'node scripts/beta-invites.js',
    'db:migrate-sqlite': 'node scripts/migrate-json-to-sqlite.js',
  });
  const indent = original.match(/\n( +)"/) ? original.match(/\n( +)"/)[1] : '  ';
  return { text: `${JSON.stringify(pkg, null, indent)}\n`, missing };
}

module.exports = { patchServer, patchDb, patchPackage };

if (require.main === module) {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const files = [
    ['server.js', patchServer],
    [path.join('config', 'db.js'), patchDb],
    ['package.json', patchPackage],
  ];
  const write = process.argv.includes('--write');
  const bi = process.argv.indexOf('--backup');
  const backupDir = bi >= 0 ? process.argv[bi + 1] : null;
  if (write && !backupDir) { console.error('--write needs --backup <dir>'); process.exit(1); }
  let bad = 0;
  const results = files.map(([rel, fn]) => {
    const file = path.join(ROOT, rel);
    const original = fs.readFileSync(file, 'utf8');
    const already = rel === 'server.js' ? original.includes("require('./utils/mail-transports')")
      : rel.endsWith('db.js') ? original.includes("require('./db-sqlite')") : original.includes('beta-launch-test.js');
    const { text, missing } = fn(original);
    if (already) console.log(`${rel}: already patched`);
    else if (missing.length) { bad++; console.log(`${rel}: anchors not found: ${missing.join(', ')}`); }
    else console.log(`${rel}: all anchors found`);
    return { rel, file, original, text, skip: already || missing.length > 0 };
  });
  if (write) {
    if (bad) { console.error('Not writing: fix the anchors first.'); process.exit(1); }
    fs.mkdirSync(backupDir, { recursive: true });
    for (const r of results) {
      if (r.skip) continue;
      fs.writeFileSync(path.join(backupDir, r.rel.replace(/[\\/]/g, '__')), r.original);
      fs.writeFileSync(r.file, r.text);
      console.log(`wrote ${r.rel} (backup in ${backupDir})`);
    }
  }
  process.exit(bad ? 1 : 0);
}
