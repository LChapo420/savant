#!/usr/bin/env node
'use strict';
/**
 * verify.js: checks the whole Spanish check from first principles. Prints PASS / FAIL / WARN / SKIP per check.
 *
 *   node spanish-check/verify.js [--results DIR] [--offline] [--skip-rebuild] [--root DIR]
 *
 * Needs: Node 18+, openssl (for the RFC 3161 checks). Network (drand relays) unless --offline.
 * Exit code 0 only if nothing FAILED and nothing was SKIPPED that matters (see the summary line).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { sha256 } = require('./lib/common');
const { loadPool } = require('./lib/draw');
const { replay, RULES, DRAND, roundTimeMs, limitMs, graceMs } = require('./lib/replay');
const { buildTsq, DRAND_RELAYS, OTS_MAGIC, chainParamsOk } = require('./lib/external');
const scoring = require('./scoring');
const { parseSeal } = require('./engine');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', __dirname));
const RESULTS = path.resolve(opt('--results', path.join(ROOT, 'results')));
const OFFLINE = flag('--offline');

const out = []; const tally = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
function report(status, name, detail) {
  tally[status]++;
  out.push({ status, name, detail });
  console.log(`${status.padEnd(4)}  ${name}${detail ? '  -  ' + detail : ''}`);
}

function findOpenssl() {
  const cands = ['openssl', 'C:/Program Files/Git/mingw64/bin/openssl.exe', 'C:/Program Files/Git/usr/bin/openssl.exe', '/usr/bin/openssl', '/opt/homebrew/bin/openssl'];
  for (const c of cands) { const r = spawnSync(c, ['version'], { encoding: 'utf8' }); if (r.status === 0) return c; }
  return null;
}
const OPENSSL = findOpenssl();

function tsVerify(tsqFile, tsrFile) {
  const ca = path.join(ROOT, 'tsa', 'cacert.pem'); const crt = path.join(ROOT, 'tsa', 'tsa.crt');
  const v = spawnSync(OPENSSL, ['ts', '-verify', '-in', tsrFile, '-queryfile', tsqFile, '-CAfile', ca, '-untrusted', crt], { encoding: 'utf8' });
  const ok = v.status === 0 && /Verification: OK/.test(v.stdout + v.stderr);
  const t = spawnSync(OPENSSL, ['ts', '-reply', '-in', tsrFile, '-text'], { encoding: 'utf8' });
  const m = /Time stamp: (.+)/.exec(t.stdout || '');
  const time = m ? Date.parse(m[1].replace(/ GMT$/, ' GMT')) : NaN;
  return { ok, time };
}

async function main() {
  console.log(`Spanish check verification\n  root: ${ROOT}\n  results: ${RESULTS}\n  openssl: ${OPENSSL || 'NOT FOUND'}  offline: ${OFFLINE}\n`);

  // 1. SEAL file hashes -------------------------------------------------------------------------
  const sealPath = path.join(ROOT, 'SEAL.txt');
  if (!fs.existsSync(sealPath)) { report('FAIL', 'SEAL.txt exists', 'missing'); return finish(); }
  const sealBuf = fs.readFileSync(sealPath);
  const sealHash = sha256(sealBuf);
  const seal = parseSeal(sealBuf.toString('utf8'));
  const bad = []; const rawEntries = [];
  for (const e of seal) {
    const p = path.join(ROOT, e.path);
    if (e.path.startsWith('raw/')) { rawEntries.push(e); continue; }
    if (!fs.existsSync(p)) { bad.push(`${e.path} missing`); continue; }
    if (sha256(fs.readFileSync(p)) !== e.hash) bad.push(`${e.path} differs`);
  }
  report(bad.length ? 'FAIL' : 'PASS', 'sealed code, protocol and pool files match SEAL.txt', bad.length ? bad.join('; ') : `${seal.length - rawEntries.length} files, SEAL.txt sha256 ${sealHash.slice(0, 16)}...`);

  // 2. raw files --------------------------------------------------------------------------------
  const rawBad = []; let rawMissing = 0;
  for (const e of rawEntries) {
    const p = path.join(ROOT, e.path);
    if (!fs.existsSync(p)) { rawMissing++; continue; }
    if (sha256(fs.readFileSync(p)) !== e.hash) rawBad.push(e.path);
  }
  if (rawBad.length) report('FAIL', 'raw Tatoeba files match the sealed hashes', rawBad.join(', '));
  else if (rawMissing) report('SKIP', 'raw Tatoeba files match the sealed hashes', `${rawMissing} raw file(s) not present; download the frozen copies and place them in raw/`);
  else report('PASS', 'raw Tatoeba files match the sealed hashes', `${rawEntries.length} files`);

  // 3. rebuild the pool -------------------------------------------------------------------------
  const poolSealed = seal.find((e) => e.path === 'pool.json');
  if (flag('--skip-rebuild') || rawMissing || rawBad.length) report('SKIP', 'pool rebuilt from the raw files is byte-identical', 'skipped');
  else {
    const tmp = path.join(os.tmpdir(), `spanish-check-pool-${process.pid}.json`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-pool.js'), '--out', tmp], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) report('FAIL', 'pool rebuilt from the raw files is byte-identical', `build failed: ${(r.stderr || '').slice(0, 200)}`);
    else {
      const h = sha256(fs.readFileSync(tmp)); fs.unlinkSync(tmp);
      report(h === poolSealed.hash ? 'PASS' : 'FAIL', 'pool rebuilt from the raw files is byte-identical', `rebuilt ${h.slice(0, 16)}... sealed ${poolSealed.hash.slice(0, 16)}...`);
    }
  }

  // 4. SEAL timestamp ---------------------------------------------------------------------------
  const proofDir = path.join(ROOT, 'seal-proof');
  const tsq = path.join(proofDir, 'SEAL.tsq'); const tsr = path.join(proofDir, 'SEAL.tsr'); const ots = path.join(proofDir, 'SEAL.ots');
  let sealTime = NaN; let anyProof = false;
  if (fs.existsSync(tsq) && fs.existsSync(tsr)) {
    if (!OPENSSL) report('SKIP', 'SEAL.txt RFC 3161 timestamp (freetsa.org)', 'openssl not found');
    else {
      const sameDigest = Buffer.compare(fs.readFileSync(tsq), buildTsq(sealHash)) === 0;
      const v = tsVerify(tsq, tsr);
      sealTime = v.time;
      report(sameDigest && v.ok ? 'PASS' : 'FAIL', 'SEAL.txt RFC 3161 timestamp (freetsa.org) is valid for this SEAL.txt', `${sameDigest ? 'digest matches' : 'digest DOES NOT match'}, signature ${v.ok ? 'verified' : 'NOT verified'}, time ${Number.isNaN(v.time) ? '?' : new Date(v.time).toISOString()}`);
      anyProof = anyProof || (sameDigest && v.ok);
    }
  } else report('WARN', 'SEAL.txt RFC 3161 timestamp (freetsa.org)', 'no token stored');
  if (fs.existsSync(ots)) {
    const b = fs.readFileSync(ots);
    const okHdr = b.subarray(0, OTS_MAGIC.length).equals(OTS_MAGIC) && b[OTS_MAGIC.length] === 1 && b[OTS_MAGIC.length + 1] === 0x08;
    const dg = b.subarray(OTS_MAGIC.length + 2, OTS_MAGIC.length + 34).toString('hex');
    const ok = okHdr && dg === sealHash;
    const bitcoin = b.includes(Buffer.from('0588960d73d71901', 'hex'));
    report(ok ? 'PASS' : 'FAIL', 'SEAL.txt OpenTimestamps file is well-formed and commits to this SEAL.txt', `${bitcoin ? 'contains a Bitcoin attestation' : 'calendar commitment only (not yet Bitcoin-confirmed here; run: ots upgrade SEAL.ots && ots verify SEAL.ots)'}`);
    anyProof = anyProof || ok;
  } else report('WARN', 'SEAL.txt OpenTimestamps file', 'none stored');
  if (!anyProof) report('FAIL', 'at least one external timestamp of SEAL.txt is valid', 'none');

  // 5. log ---------------------------------------------------------------------------------------
  const logPath = path.join(RESULTS, 'log.jsonl');
  const poolPath = path.join(ROOT, 'pool.json');
  if (!fs.existsSync(logPath)) {
    report('PASS', 'log chain', 'no log yet (no sitting has been taken)');
    return finish();
  }
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const pool = loadPool(poolPath);
  const rp = replay(lines, pool, sealHash);
  report(rp.chain_ok ? 'PASS' : 'FAIL', 'hash chain intact, first line bound to SEAL.txt', rp.chain_ok ? `${lines.length} lines, head ${rp.head.slice(0, 16)}...` : rp.chain_errors.slice(0, 3).join('; '));

  // engine start events: the code that ran is the sealed code
  const want = { engine_sha256: 'engine.js', scoring_sha256: 'scoring.js', pool_sha256: 'pool.json' };
  const badStarts = [];
  for (const ev of rp.engine_starts) {
    for (const [k, p] of Object.entries(want)) { const s = seal.find((e) => e.path === p); if (s && ev[k] !== s.hash) badStarts.push(`seq ${ev.seq}: ${k}`); }
    if (ev.seal_sha256 !== sealHash) badStarts.push(`seq ${ev.seq}: seal_sha256`);
  }
  report(badStarts.length ? 'FAIL' : 'PASS', 'every engine start ran the sealed engine, scoring and pool', badStarts.length ? badStarts.join('; ') : `${rp.engine_starts.length} start(s)`);

  const sittings = rp.sittings;
  if (!sittings.length) { report('PASS', 'no sittings in the log yet'); return finish(); }
  const firstStart = sittings[0].start_t;
  if (!Number.isNaN(sealTime)) report(sealTime < firstStart ? 'PASS' : 'FAIL', 'SEAL.txt was externally timestamped before the first sitting', `seal ${new Date(sealTime).toISOString()}, first sitting ${new Date(firstStart).toISOString()}`);
  else report('SKIP', 'SEAL.txt was externally timestamped before the first sitting', 'no verifiable RFC 3161 time');

  // 6. drand rounds -----------------------------------------------------------------------------
  const sigBad = []; const refetch = [];
  for (const s of sittings) {
    const ev = rp.events[s.start_seq];
    if (sha256(Buffer.from(ev.signature, 'hex')) !== ev.randomness) sigBad.push(`sitting ${s.id}`);
  }
  report(sigBad.length ? 'FAIL' : 'PASS', 'each logged drand randomness is the SHA-256 of its logged signature', sigBad.join(', '));
  if (OFFLINE) report('SKIP', 'each sitting\'s drand round exists and its randomness matches the public record', '--offline');
  else {
    for (const s of sittings) {
      const ev = rp.events[s.start_seq]; let agree = 0; const seen = [];
      for (const relay of DRAND_RELAYS) {
        try {
          const r = await fetch(`${relay}/${DRAND.chain_hash}/public/${ev.round}`);
          if (!r.ok) { seen.push(`${relay}: HTTP ${r.status}`); continue; }
          const j = await r.json();
          if (j.randomness === ev.randomness && j.signature === ev.signature && j.round === ev.round) agree++; else seen.push(`${relay}: MISMATCH`);
        } catch (e) { seen.push(`${relay}: ${e.message}`); }
      }
      refetch.push({ id: s.id, agree, seen });
    }
    const failed = refetch.filter((r) => r.agree < 2 || r.seen.some((x) => /MISMATCH/.test(x)));
    report(failed.length ? 'FAIL' : 'PASS', 'each sitting\'s drand round exists and its randomness matches the public record', failed.length ? failed.map((f) => `sitting ${f.id}: ${f.agree}/3 relays agree ${f.seen.join(' ')}`).join('; ') : `${refetch.length} round(s) refetched, all relays agree`);
  }
  const windowBad = rp.violations.filter((v) => /drand round/.test(v));
  report(windowBad.length ? 'FAIL' : 'PASS', 'each drand round was produced just before its sitting started (not an old or chosen round)', windowBad.join('; '));
  report(chainParamsOk() ? 'PASS' : 'FAIL', 'the pinned drand quicknet public key, period and genesis hash to the chain hash named in the protocol', DRAND.chain_hash.slice(0, 16) + '...');
  report('WARN', 'drand BLS signatures are not verified by this script', 'it checks randomness = SHA-256(signature) and agreement of independent relays; for the pairing check use drand-client against the chain hash ' + DRAND.chain_hash);

  // 7. the draw -----------------------------------------------------------------------------------
  const drawBad = rp.violations.filter((v) => /draw|does not match/.test(v));
  report(drawBad.length ? 'FAIL' : 'PASS', 'every served item is the item the logged randomness produces from the sealed pool', drawBad.join('; ') || `${sittings.reduce((a, s) => a + s.served.size, 0)} served items re-derived`);
  const seenKeys = new Set(); let dup = 0; const seenD = new Set(); let dupD = 0;
  for (const s of sittings) { for (const it of s.items) { if (seenKeys.has(it.key)) dup++; seenKeys.add(it.key); if (it.distractor_ids) for (const d of it.distractor_ids) { if (seenD.has(d)) dupD++; seenD.add(d); } } }
  report(dup + dupD ? 'FAIL' : 'PASS', 'no question or answer option is repeated across sittings', `${seenKeys.size} distinct sentences, ${seenD.size} distinct distractors`);

  // 8. rules and timing --------------------------------------------------------------------------
  const other = rp.violations.filter((v) => !/drand round|draw|does not match/.test(v));
  report(other.length ? 'FAIL' : 'PASS', 'sitting rules respected (one per day, 12 h gap, items one at a time in order, nothing answered twice)', other.slice(0, 4).join('; '));
  const forced = sittings.filter((s) => s.force);
  report(forced.length ? 'WARN' : 'PASS', 'no sitting used the override', forced.length ? `sittings ${forced.map((s) => s.id).join(', ')} were forced` : '');
  const timeBad = [];
  for (const s of sittings) {
    let total = 0;
    for (const [i, it] of s.items.entries()) {
      const a = s.answers.get(it.item_id); if (!a) continue;
      total += Math.min(a.server_ms, limitMs(it.section) + graceMs);
      if (a.server_ms < 0) timeBad.push(`sitting ${s.id} item ${i}: negative time`);
    }
    if (total > 25 * 3000 + 17.5 * 60 * 1000) timeBad.push(`sitting ${s.id}: counted time ${(total / 60000).toFixed(1)} min exceeds the cap`);
  }
  const lateN = sittings.reduce((a, s) => a + [...s.answers.values()].filter((x) => x.late).length, 0);
  report(timeBad.length ? 'FAIL' : 'PASS', 'time limits (60 s listening, 30 s reading, 3 s grace) applied from server timestamps; total within 17.5 min plus grace', timeBad.join('; ') || `${lateN} late answer(s), all scored 0`);

  // 9. scores -------------------------------------------------------------------------------------
  const scoreBad = [];
  for (const s of sittings.filter((x) => x.status === 'finished')) {
    const ev = rp.events[s.end_seq];
    const sc = s.scored; const sm = ev.summary || {};
    const pairs = [['listening', sc.listening.est], ['reading_raw', sc.reading.raw], ['reading_cc', sc.reading.cc], ['composite', sc.composite.est]];
    for (const [k, v] of pairs) if (!(Math.abs((sm[k] ?? NaN) - v) < 1e-12)) scoreBad.push(`sitting ${s.id} ${k}: logged ${sm[k]} recomputed ${v}`);
  }
  report(scoreBad.length ? 'FAIL' : 'PASS', 'every score recomputed from the log equals the score the server recorded', scoreBad.join('; ') || `${sittings.filter((x) => x.status === 'finished').length} finished sitting(s) recomputed with the sealed scoring.js`);

  // 10. anchors ------------------------------------------------------------------------------------
  const ended = sittings.filter((s) => s.end_seq !== null);
  const oks = rp.anchors.filter((a) => !a.failed);
  let anchorProblems = 0;
  for (const a of oks) {
    const where = `anchor at seq ${a.seq}`;
    const lineHash = sha256(lines[a.anchored_seq] || '');
    if (lineHash !== a.anchored_head) { report('FAIL', `${where}: anchored head is the hash of log line ${a.anchored_seq}`, 'mismatch'); anchorProblems++; continue; }
    const q = path.join(RESULTS, a.tsa.tsq); const r = path.join(RESULTS, a.tsa.tsr);
    if (!fs.existsSync(q) || !fs.existsSync(r)) { report('FAIL', `${where}: token files present`, 'missing'); anchorProblems++; continue; }
    if (!OPENSSL) { report('SKIP', `${where}: RFC 3161 token`, 'openssl not found'); continue; }
    const same = Buffer.compare(fs.readFileSync(q), buildTsq(a.anchored_head)) === 0;
    const v = tsVerify(q, r);
    a.verified = same && v.ok; a.tsa_time = v.time;
    report(a.verified ? 'PASS' : 'FAIL', `${where}: RFC 3161 token valid for log head ${a.anchored_head.slice(0, 12)}...`, `time ${Number.isNaN(v.time) ? '?' : new Date(v.time).toISOString()}`);
    if (!a.verified) anchorProblems++;
    if (a.ots) {
      const op = path.join(RESULTS, a.ots.file);
      const okOts = fs.existsSync(op) && fs.readFileSync(op).subarray(OTS_MAGIC.length + 2, OTS_MAGIC.length + 34).toString('hex') === a.anchored_head;
      report(okOts ? 'PASS' : 'WARN', `${where}: OpenTimestamps file commits to the same head`, '');
    }
  }
  for (let k = 0; k < ended.length; k++) {
    const s = ended[k];
    const nextStart = sittings[sittings.indexOf(s) + 1] ? sittings[sittings.indexOf(s) + 1].start_t : null;
    const a = oks.find((x) => x.anchored_seq >= s.end_seq && x.verified);
    if (!a) {
      const young = Date.now() - s.end_t < 3600000;
      report(young ? 'WARN' : 'FAIL', `sitting ${s.id} end is covered by a valid external timestamp`, young ? 'not yet anchored (ended under an hour ago)' : 'no valid anchor');
      continue;
    }
    const tt = a.tsa_time;
    const afterEnd = tt >= s.end_t - 120000;
    const beforeNext = nextStart === null || tt <= nextStart;
    const fails = rp.anchors.filter((x) => x.failed && x.anchored_seq >= s.end_seq).length;
    report(afterEnd && beforeNext ? 'PASS' : (afterEnd ? 'WARN' : 'FAIL'), `sitting ${s.id}: anchor time is after the sitting ended${nextStart === null ? '' : ' and before the next one started'}`,
      `ended ${new Date(s.end_t).toISOString()}, anchored ${new Date(tt).toISOString()}${fails ? `, ${fails} failed attempt(s) logged before success` : ''}${!beforeNext ? ', LATE: anchored after the next sitting began' : ''}`);
  }
  return finish();
}

function finish() {
  console.log(`\nSummary: ${tally.PASS} PASS, ${tally.FAIL} FAIL, ${tally.WARN} WARN, ${tally.SKIP} SKIP`);
  if (tally.FAIL) console.log('RESULT: FAIL');
  else if (tally.SKIP) console.log('RESULT: INCOMPLETE (some checks were skipped, see SKIP lines)');
  else console.log('RESULT: PASS');
  process.exitCode = tally.FAIL ? 1 : tally.SKIP ? 2 : 0;
}

main().catch((e) => { console.error('verify.js crashed:', e); process.exit(3); });
