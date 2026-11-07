/**
 * The durability fixes that came out of the first real restore on the server (Nov 2026): a SQLite save that fails is retried in full; a ledger
 * always has a copy no older than itself, and one that has gone comes back; a backup set holds every ledger, and keeps working through a bad
 * manifest, a full disk and a store on SQLite under writes; a restore puts ledgers back and does not replay an old WAL. Everything is on temp copies.
 *   node scripts/beta-durable-test.js
 *
 * BETA_DURABLE_DRIVER=<file> runs the SQLite part against another copy of the driver, which is how the old code was shown to fail this test.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-durable-'));
process.env.LEDGER_BACKUP = 'on';
let failures = 0;
const check = (label, ok, detail) => { if (ok) console.log(`  ok   ${label}`); else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? `: ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)}` : ''}`); } };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const node = (code, env = {}) => spawnSync(process.execPath, ['--no-warnings', '-e', code], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000 });
const backupTool = (args, env = {}) => spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', 'backup-db.js'), ...args], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 180000 });

function readSqlite(file) {
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(file, { readOnly: true });
  try {
    const n = (coll) => d.prepare('SELECT COUNT(*) AS n FROM rows WHERE coll = ?').get(coll).n;
    const counter = (coll) => { const r = d.prepare('SELECT value FROM counters WHERE coll = ?').get(coll); return r ? r.value : null; };
    return { n, counter, doc: (coll, id) => { const r = d.prepare('SELECT doc FROM rows WHERE coll = ? AND id = ?').get(coll, id); return r ? JSON.parse(r.doc) : null; }, close: () => d.close() };
  } catch (err) { d.close(); throw err; }
}

async function main() {
  // ---------------------------------------------------------------------------
  console.log('a SQLite save that fails: a full disk, then room again, then a crash');
  const sqFile = path.join(dir, 'full.sqlite');
  // SQLite's own page limit gives the real "database or disk is full" error, inside the same transaction a real full disk would fail.
  const childCode = `
    const db = require(process.env.DRIVER);
    const sql = db._connection ? db._connection() : null;
    const big = 'x'.repeat(200000);
    db.insert('reports', { user_id: 1, note: 'before' });
    db.flush();
    const pages = Object.values(sql.prepare('PRAGMA page_count').get())[0];
    sql.exec('PRAGMA max_page_count = ' + pages);
    const during = [];
    for (let i = 0; i < 5; i++) during.push(db.insert('reports', { user_id: 2, n: i, note: big }).id);
    const first = db.byId('reports', 1);
    db.update('reports', first.id, { note: 'changed during the failure' });
    db.saveSoon();
    setTimeout(() => {
      const failing = db.saveState();
      sql.exec('PRAGMA max_page_count = 1073741823');
      const wait = () => {
        const s = db.saveState();
        if (s.saving) {
          process.stdout.write(JSON.stringify({ failing, during }) + '\\n');
          setTimeout(() => process.kill(process.pid, 'SIGKILL'), 50); // no exit flush: only what the retry saved
        } else setTimeout(wait, 100);
      };
      wait();
    }, 1500);
  `;
  const child = spawnSync(process.execPath, ['--no-warnings', '-e', childCode], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, NODE_ENV: 'test', DB_DRIVER: 'sqlite', DB_FILE: path.join(dir, 'unused.json'), DB_SQLITE_FILE: sqFile, DB_SQLITE_SWEEP_MS: '0', DRIVER: process.env.BETA_DURABLE_DRIVER || path.join(ROOT, 'config', 'db-sqlite.js') },
  });
  let out = null;
  try { out = JSON.parse(child.stdout.trim().split('\n')[0]); } catch { /* checked next */ }
  check('the store said saving was failing', out && out.failing.failed_attempts > 0, child.stdout + child.stderr);
  if (out) {
    const r = readSqlite(sqFile);
    check('every row made while the disk was full is on disk after the retry', out.during.every((id) => r.doc('reports', id)), out.during.map((id) => !!r.doc('reports', id)));
    check('a row changed while the disk was full has its change on disk', (r.doc('reports', 1) || {}).note === 'changed during the failure', r.doc('reports', 1));
    check('the counter on disk is at the highest id, so no id is reissued after a restart', r.counter('reports') === Math.max(...out.during), { counter: r.counter('reports'), ids: out.during });
    r.close();
  }

  // ---------------------------------------------------------------------------
  console.log('ledger copies');
  process.env.LEDGER_BACKUP_MINUTES = '10';
  const durable = require('../services/durable-file');
  const lDir = path.join(dir, 'ledgers');
  fs.mkdirSync(lDir);
  const ledger = (settled, log = []) => JSON.stringify({ settled_usd: settled, seed_usd: 0, log });
  const lFile = (n) => path.join(lDir, n);
  fs.writeFileSync(lFile('munito-ledger.json'), ledger(5));
  fs.writeFileSync(lFile('gonka-ledger.json'), ledger(1));
  fs.writeFileSync(lFile('not-a-spend-file.json'), '{}');
  const made = durable.sweepLedgers(lDir);
  check('a ledger nobody has written yet still gets a copy', made.length === 2 && made.every((m) => /-ledger\.\d{8}T\d{4}\.json$/.test(m)), made);
  check('a second sweep with nothing new copies nothing', durable.sweepLedgers(lDir).length === 0);
  await sleep(20);
  fs.writeFileSync(lFile('munito-ledger.json'), ledger(6));
  const old = new Date(Date.now() - 60000); // the copy in this interval's slot is older than the write
  for (const f of durable.copiesOf(lDir, 'munito-ledger')) fs.utimesSync(f, old, old);
  durable.sweepLedgers(lDir);
  check('the last write of an interval reaches a copy', durable.goodLedger(fs.readFileSync(durable.copiesOf(lDir, 'munito-ledger')[0], 'utf8')).settled_usd === 6);

  fs.unlinkSync(lFile('munito-ledger.json'));
  const errors = []; const realError = console.error; console.error = (m) => errors.push(m);
  const back = durable.restoreMissingLedgers(lDir);
  console.error = realError;
  check('a ledger that has gone comes back, not at $0', back.length === 1 && back[0].restored && durable.goodLedger(fs.readFileSync(lFile('munito-ledger.json'), 'utf8')).settled_usd === 6, back);
  check('and it says so loudly', errors.some((m) => /LEDGER MISSING/.test(m)));

  const now = Date.now();
  const busy = { settled_usd: 1, log: [{ at: new Date(now - 7200000 - 1800000).toISOString(), usd: 0.5 }, { at: new Date(now - 7200000 - 600000).toISOString(), usd: 0.5 }] };
  check('the estimate is the rate at the copy, per hour since', durable.spendSince(busy, now - 7200000, now).addUsd === 2, durable.spendSince(busy, now - 7200000, now));
  check('a ledger idle when copied adds nothing', durable.spendSince({ settled_usd: 1, log: [{ at: new Date(now - 90 * 3600000).toISOString(), usd: 9 }] }, now - 7200000, now).addUsd === 0);

  const tool = (args) => spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', 'ledger-restore.js'), '--dir', lDir, ...args], { encoding: 'utf8' });
  fs.unlinkSync(lFile('gonka-ledger.json'));
  fs.writeFileSync(lFile('munito-ledger.json'), '');
  const dry = tool([]);
  check('ledger-restore sees a missing ledger as damaged, changes nothing, and exits 1', dry.status === 1 && /gonka-ledger\.json: MISSING/.test(dry.stdout) && /munito-ledger\.json: EMPTY/.test(dry.stdout) && !fs.existsSync(lFile('gonka-ledger.json')), dry.stdout);
  const wrote = tool(['--write']);
  check('ledger-restore --write brings both back', wrote.status === 0 && durable.goodLedger(fs.readFileSync(lFile('gonka-ledger.json'), 'utf8')).settled_usd === 1 && durable.goodLedger(fs.readFileSync(lFile('munito-ledger.json'), 'utf8')).settled_usd === 6, wrote.stdout);
  const after = tool([]);
  check('then all are ok, and it names ledgers it has never seen', after.status === 0 && /all ledgers present are ok/.test(after.stdout) && /No file and no copy/.test(after.stdout), after.stdout);

  // ---------------------------------------------------------------------------
  console.log('backup sets');
  const bData = path.join(dir, 'bdata');
  const bDir = path.join(dir, 'bsets');
  fs.mkdirSync(bData);
  const bEnv = { DB_FILE: path.join(bData, 'db.json'), BACKUP_DIR: bDir, DB_DRIVER: '', BACKUP_MIN_FREE_MB: '1' };
  delete process.env.BACKUP_EXTRA;
  const names = ['munito', 'coral', 'gonka', 'grokified', 'gladia', 'standard-compute', 'anthropic', 'lyceum', 'zerogpu'];
  fs.writeFileSync(bEnv.DB_FILE, JSON.stringify({ users: [{ id: 1, email: 'a@example.test' }], _counters: { users: 1 } }));
  for (const n of names) fs.writeFileSync(path.join(bData, `${n}-ledger.json`), ledger(names.indexOf(n) + 1));
  fs.writeFileSync(path.join(bData, 'beta-invites.json'), '[]');
  const b1 = backupTool([], bEnv);
  const manifests = () => fs.readdirSync(bDir).filter((f) => /^db-\d{8}T\d{6}Z\.manifest\.json$/.test(f)).sort();
  const man = JSON.parse(fs.readFileSync(path.join(bDir, manifests()[0]), 'utf8'));
  check('a set holds every ledger, not five named ones', b1.status === 0 && names.every((n) => man.extras.some((e) => e.file.endsWith(`.extra.${n}-ledger.json.gz`))), man.extras && man.extras.map((e) => e.file));
  check('and the invites, and not the store a second time', man.extras.some((e) => /beta-invites/.test(e.file)) && !man.extras.some((e) => /extra\.db\.json/.test(e.file)));
  check('files in a set are private to their owner', process.platform === 'win32' || (fs.statSync(path.join(bDir, man.file)).mode & 0o077) === 0);

  fs.writeFileSync(path.join(bDir, 'db-20260101T000000Z.manifest.json'), '');
  await sleep(1100);
  const b2 = backupTool([], bEnv);
  check('an empty manifest (a power cut) does not stop later backups', b2.status === 0 && manifests().length === 3, b2.stderr + manifests().join());

  const tight = backupTool([], { ...bEnv, BACKUP_MIN_FREE_MB: String(1024 * 1024 * 1024) });
  check('with too little room it writes nothing and exits 1', tight.status === 1 && /no backup taken/.test(tight.stderr) && manifests().length === 3, tight.stderr);

  // Thinning: of three sets on one old day only the newest stays; older than the limit go; two days old and newer all stay.
  const fake = (stamp, created) => {
    const id = `db-${stamp}`;
    fs.writeFileSync(path.join(bDir, `${id}.json.gz`), zlib.gzipSync('{}'));
    fs.writeFileSync(path.join(bDir, `${id}.manifest.json`), JSON.stringify({ id, kind: 'json', file: `${id}.json.gz`, created_at: created, collections: {}, extras: [], bytes: 2 }));
  };
  const days = (d, h = 0) => new Date(Date.now() - d * 86400000 + h * 3600000);
  const st = (t) => t.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const d10 = days(10); d10.setUTCHours(1, 0, 0, 0);
  const d10b = new Date(d10.getTime() + 6 * 3600000);
  const d10c = new Date(d10.getTime() + 12 * 3600000);
  const d40 = days(40);
  const d1 = days(1);
  for (const t of [d10, d10b, d10c, d40, d1]) fake(st(t), t.toISOString());
  await sleep(1100);
  backupTool([], bEnv);
  const left = manifests().join();
  check('old sets thin to one a day; the newest of that day stays', !left.includes(st(d10)) && !left.includes(st(d10b)) && left.includes(st(d10c)), left);
  check('past the age limit it goes', !left.includes(st(d40)), left);
  check('in the last two days every set stays', left.includes(st(d1)), left);

  // A store that has moved on: a JSON backup would save a frozen file and look healthy.
  fs.writeFileSync(path.join(bData, 'db.sqlite'), 'x');
  const future = new Date(Date.now() + 60000);
  fs.utimesSync(path.join(bData, 'db.sqlite'), future, future);
  const stale = backupTool([], bEnv);
  check('a JSON backup refuses when db.sqlite beside it is newer', stale.status === 1 && /moved to SQLite/.test(stale.stderr), stale.stderr);
  fs.unlinkSync(path.join(bData, 'db.sqlite'));

  // Restore: the ledgers come back with the store.
  const useable = JSON.parse(fs.readFileSync(path.join(bDir, manifests().slice(-1)[0]), 'utf8'));
  const rDir = path.join(dir, 'restored');
  fs.mkdirSync(rDir);
  fs.writeFileSync(path.join(rDir, 'munito-ledger.json'), ledger(99)); // good, and newer than the backup
  fs.writeFileSync(path.join(rDir, 'coral-ledger.json'), ''); // damaged
  const r1 = backupTool(['--restore', path.join(bDir, useable.file), '--to', path.join(rDir, 'db.json'), '--extras-to', rDir], bEnv);
  check('restore with --extras-to works', r1.status === 0, r1.stderr);
  const settled = (n) => JSON.parse(fs.readFileSync(path.join(rDir, `${n}-ledger.json`), 'utf8')).settled_usd;
  check('a ledger missing here comes from the set', settled('gonka') === 3 && settled('zerogpu') === 9, r1.stdout);
  check('a good ledger here is kept: it may be newer', settled('munito') === 99);
  check('a damaged one is replaced, and kept aside', settled('coral') === 2 && fs.readdirSync(rDir).some((f) => f.startsWith('coral-ledger.json.damaged-')));
  check('the restored store is the backed-up one', JSON.parse(fs.readFileSync(path.join(rDir, 'db.json'), 'utf8')).users.length === 1);
  // As root the files would belong to root, and the app couldn't read them. The Node on this machine may not have getuid, so it is given one.
  const asRoot = path.join(dir, 'as-root.js');
  fs.writeFileSync(asRoot, 'process.getuid = () => 0;');
  const r2 = spawnSync(process.execPath, ['--no-warnings', '-r', asRoot, path.join(ROOT, 'scripts', 'backup-db.js'), '--restore', path.join(bDir, useable.file), '--to', path.join(rDir, 'as-root.json')], { cwd: ROOT, env: { ...process.env, ...bEnv }, encoding: 'utf8' });
  check('a restore run as root stops and says why, writing nothing', r2.status === 1 && /runuser -u savant/.test(r2.stderr) && !fs.existsSync(path.join(rDir, 'as-root.json')), r2.stderr);

  // ---------------------------------------------------------------------------
  console.log('SQLite sets, while the app writes');
  const sData = path.join(dir, 'sdata');
  const sDir = path.join(dir, 'ssets');
  fs.mkdirSync(sData);
  const sFile = path.join(sData, 'db.sqlite');
  const sEnv = { NODE_ENV: 'test', DB_DRIVER: 'sqlite', DB_FILE: path.join(sData, 'unused.json'), DB_SQLITE_FILE: sFile, BACKUP_DIR: sDir, BACKUP_MIN_FREE_MB: '1' };
  const seed = node(`const db=require('./config/db');for(let i=0;i<20000;i++)db.insert('reports',{user_id:i%50,note:'x'.repeat(500)});db.flush();process.exit(0)`, sEnv);
  check('a 10 MB store on SQLite', seed.status === 0, seed.stderr);
  const writer = spawn(process.execPath, ['--no-warnings', '-e', `const db=require('./config/db');setInterval(()=>{db.insert('reports',{user_id:1,note:'x'});db.flush();},5);`], { cwd: ROOT, env: { ...process.env, ...sEnv }, stdio: 'ignore' });
  await sleep(500);
  const t0 = Date.now();
  const sb = await new Promise((resolve) => {
    const c = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', 'backup-db.js')], { cwd: ROOT, env: { ...process.env, ...sEnv } });
    let err = ''; c.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { c.kill(); resolve({ status: 'timed out', err }); }, 60000);
    c.on('exit', (code) => { clearTimeout(timer); resolve({ status: code, err }); });
  });
  writer.kill('SIGKILL');
  check(`a backup finishes under a save every 5 ms (${Date.now() - t0} ms)`, sb.status === 0, sb);
  const srt = backupTool(['--restore-test'], sEnv);
  check('its restore test passes', srt.status === 0, srt.stdout + srt.stderr);
  check('no restore-test folder left behind', !fs.readdirSync(sDir).some((f) => f.startsWith('.restore-test-')));

  const sMan = JSON.parse(fs.readFileSync(path.join(sDir, fs.readdirSync(sDir).filter((f) => f.endsWith('.manifest.json'))[0]), 'utf8'));
  const target = path.join(dir, 'restored.sqlite');
  // An old database and a WAL that belongs to it, at the place the restore goes.
  const { DatabaseSync } = require('node:sqlite');
  const oldDb = new DatabaseSync(target);
  oldDb.exec('PRAGMA journal_mode = WAL; CREATE TABLE junk (a); INSERT INTO junk VALUES (1);');
  const walOld = fs.existsSync(`${target}-wal`) ? fs.readFileSync(`${target}-wal`) : Buffer.from('');
  oldDb.close();
  fs.writeFileSync(`${target}-wal`, walOld.length ? walOld : Buffer.alloc(4096, 1));
  const sr = backupTool(['--restore', path.join(sDir, sMan.file), '--to', target, '--force'], sEnv);
  check('restore over an old database moves its WAL aside', sr.status === 0 && !fs.existsSync(`${target}-wal`) && fs.readdirSync(dir).some((f) => f.startsWith('restored.sqlite-wal.before-restore-')), sr.stderr);
  const rs = readSqlite(target);
  check('and the restored file opens, with the snapshot\'s rows', rs.n('reports') === sMan.collections.reports.rows, { got: rs.n('reports'), want: sMan.collections.reports.rows });
  rs.close();

  // ---------------------------------------------------------------------------
  console.log('going back to JSON, and the warning before the limit');
  const revJson = path.join(dir, 'reversed.json');
  const rev = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--reverse', '--from', target, '--to', revJson], { encoding: 'utf8', timeout: 120000 });
  check('reverse verifies against the SQLite file', rev.status === 0, rev.stderr);
  check('it writes one line, as the JSON driver does, so it stays under the limit longer', rev.status === 0 && !fs.readFileSync(revJson, 'utf8').includes('\n'));
  const warn = node(`const db=require('./config/db');db.insert('reports',{user_id:1});db.flush();process.exit(0)`, { NODE_ENV: 'test', DB_DRIVER: '', DB_FILE: path.join(dir, 'warn.json'), DB_WARN_MB: '0' });
  check('a JSON store near the limit says so, with the way out', /docs\/SQLITE-SWITCH\.md/.test(warn.stderr), warn.stderr);

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a temp folder */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
