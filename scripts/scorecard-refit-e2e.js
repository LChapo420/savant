/**
 * The real-tester refit, end to end, on SYNTHETIC data shaped like real logs (docs/SCORECARD-REAL.md part 4). Nothing here is a real learner. Run by hand (it needs simulator exports, about 20 minutes):
 *   node scripts/scorecard-refit-e2e.js --export=a.json,b.json --dir=D [--json=out.json]
 * The exports come from scorecard-recovery-sim.js --export-db with --anchor, a world whose generator differs from the reader, and gaps and shared accounts in the mix. This script:
 *   1. merges them into one database file with the app's own schema, then makes the mess real logs have: a learner with few answers, a tester with no anchors, a null time, an unreadable date, duplicated rows,
 *      a long gap, plus accounts that must never enter (6689, an admin, a non-tester, an under-13 without consent).
 *   2. runs scripts/scorecard-refit-auto.js as a child process on that file, exactly as the server's timer does, first with too few learners, then with all of them.
 *   3. uses the simulated truth (which real life won't have) to ask what the report can't: is the anchor-based estimate honest, and did the candidate really help the held-out learners?
 *   4. promotes, then reads a card through the live read-out switch and checks the read-out path uses the artifact. Promotion of a candidate that failed is checked to be refused.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (n, d = '') => { const x = argv.find((s) => s.startsWith(`--${n}=`)); return x ? x.slice(n.length + 3) : d; };
const DIR = path.resolve(arg('dir'));
fs.mkdirSync(DIR, { recursive: true });
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const OWNER = 6689;

function merge(exports_) {
  const db = { users: [] }; const offs = {}; const truth = {};
  const add = (table, row) => { (db[table] || (db[table] = [])).push(row); };
  let nextUser = 10001;
  for (const L of exports_) {
    const uid = nextUser++; const sessMap = new Map();
    for (const s of (L.rows.sessions || [])) { offs.sessions = (offs.sessions || 0) + 1; const id = offs.sessions; sessMap.set(s.id, id); add('sessions', { ...s, id, user_id: uid }); }
    for (const [t, rows] of Object.entries(L.rows)) {
      if (t === 'sessions' || !Array.isArray(rows) || t === 'content_cache') continue;
      for (const r of rows) { offs[t] = (offs[t] || 0) + 1; const n = { ...r, id: offs[t], user_id: uid }; if (r.session_id !== undefined) n.session_id = sessMap.get(r.session_id); add(t, n); }
    }
    db.users.push({ id: uid, email: `syn${uid}@example.test`, beta_tester: { since: '2026-01-05' }, age_check: { birth_ym: '2000-01', needs_parent: false, under_13: false } });
    truth[uid] = { truth: L.truth, kind: L.stratum && L.stratum.kind, shared: !!L.shared };
  }
  return { db, truth };
}

/** The mess. Each returns the uid it touched so the checks can look for the right outcome. */
function mess(db) {
  const uids = db.users.map((u) => u.id); const items = (u) => db.items.filter((r) => r.user_id === u);
  const log = {};
  // few answers: keep only 15 of this learner's items
  log.few = uids[0]; { const keep = new Set(items(log.few).slice(0, 15).map((r) => r.id)); db.items = db.items.filter((r) => r.user_id !== log.few || keep.has(r.id)); }
  // unreadable rows: nulls, bad dates, duplicates; must be survived and cleaned
  log.dirty = uids[1]; { const it = items(log.dirty); it.slice(0, 20).forEach((r) => { r.ms = null; }); it.slice(20, 30).forEach((r) => { r.created_at = 'not a date'; }); db.items.push(...it.slice(30, 50).map((r) => ({ ...r }))); it.slice(50, 60).forEach((r) => { r.correct = null; }); }
  // a gap of three weeks in the middle
  log.gap = uids[2]; { const it = items(log.gap).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)); const a = Date.parse(it[Math.floor(it.length * 0.3)].created_at); const b = a + 21 * 86400000; db.items = db.items.filter((r) => r.user_id !== log.gap || Date.parse(r.created_at) < a || Date.parse(r.created_at) >= b); }
  // accounts that must never enter, each a full copy of a learner so only the rule can keep it out
  const copyAs = (from, id, user) => { for (const t of ['items', 'sessions', 'profiles', 'scorecards']) { const rows = (db[t] || []).filter((r) => r.user_id === from).map((r, i) => ({ ...r, id: 900000 + id % 1000 * 1000 + i, user_id: id })); db[t].push(...rows); } db.users.push({ id, email: `x${id}@example.test`, ...user }); };
  const adult = { birth_ym: '2000-01', needs_parent: false, under_13: false };
  copyAs(uids[3], OWNER, { beta_tester: { since: '2026-01-05' }, age_check: adult });
  copyAs(uids[4], 20001, { age_check: adult }); // not a tester
  copyAs(uids[5], 20002, { beta_tester: { since: '2026-01-05' }, age_check: { birth_ym: '2016-01', needs_parent: true, under_13: true } }); // under 13, no parent's agreement
  copyAs(uids[6], 20003, { beta_tester: { since: '2026-01-05' }, age_check: adult, email: 'admin@example.test' }); // an admin
  return log;
}

function runAuto(dbFile, extraEnv = {}, args = []) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'scorecard-refit-auto.js'), ...args], { env: { ...process.env, DB_FILE: dbFile, REFIT_DIR: DIR, READOUT_FILE: path.join(DIR, 'readout.json'), ADMIN_EMAILS: 'admin@example.test', REFIT_LABEL: 'SYNTHETIC logs from a generator that differs from the reader, not real testers', ...extraEnv }, encoding: 'utf8', timeout: 600000 });
  return `${r.stdout || ''}${r.stderr || ''}`.trim();
}

function main() {
  const exports_ = arg('export').split(',').filter(Boolean).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  assert(exports_.length >= 45, 'the end-to-end test needs at least 45 exported learners');
  const { db, truth } = merge(exports_);
  const log = mess(db);
  const now = Math.max(...db.items.map((r) => Date.parse(r.created_at)).filter(Number.isFinite));
  const dbFile = path.join(DIR, 'db.json'); fs.writeFileSync(dbFile, JSON.stringify(db));
  const out = { learners: exports_.length, log };

  // too few testers: only ten of them: waiting, and nothing written but the report
  const fewFile = path.join(DIR, 'db-few.json');
  const ten = new Set(db.users.slice(0, 10).map((u) => u.id));
  fs.writeFileSync(fewFile, JSON.stringify({ ...db, users: db.users.filter((u) => ten.has(u.id)) }));
  out.few = runAuto(fewFile);
  assert(/waiting/.test(out.few), `expected waiting, got ${out.few}`);
  assert(!fs.existsSync(path.join(DIR, 'scorecard-readout.candidate.json')), 'no candidate with too few testers');

  // no anchors at all: a run must say so instead of fitting
  const noAnchor = JSON.parse(JSON.stringify(db)); for (const p of noAnchor.profiles) if (p.boosters && p.boosters.daily) delete p.boosters.daily.anchors;
  const naFile = path.join(DIR, 'db-noanchor.json'); fs.writeFileSync(naFile, JSON.stringify(noAnchor));
  out.noAnchor = runAuto(naFile);
  assert(/no usable anchors/.test(out.noAnchor), `expected no anchors, got ${out.noAnchor}`);
  assert(!/promoted to/.test(runAuto(naFile, {}, ['--promote'])), 'nothing to promote');

  // the real run
  out.run = runAuto(dbFile);
  const report = fs.readFileSync(path.join(DIR, 'scorecard-refit-report.md'), 'utf8');
  for (const id of [OWNER, 20001, 20002, 20003, ...Object.keys(truth).slice(0, 5)]) assert(!report.includes(String(id)), `a learner id ${id} is in the report`);
  const cand = JSON.parse(fs.readFileSync(path.join(DIR, 'scorecard-readout.candidate.json'), 'utf8'));
  assert(!JSON.stringify(cand).includes('user_id'), 'the artifact holds no learner rows');
  out.status = /Status: \*\*(.*?)\*\*/.exec(report)[1];

  // what real life can't check: compare with the simulated truth, in this process
  process.env.DB_FILE = dbFile; process.env.DB_READONLY = '1'; process.env.ADMIN_EMAILS = 'admin@example.test';
  const A = require('../services/scorecard/refit-auto'); const RR = require('../services/scorecard/refit-records'); const R = require('../services/scorecard/readout');
  const { INDEX, CLASSES } = require('../services/scorecard/ceilings');
  const { records, counts } = RR.build(A.dbSource(), now);
  out.counts = counts; out.used = records.length;
  assert(!records.some((r) => [OWNER, 20001, 20002, 20003].includes(r.userId)), 'an excluded account entered');
  assert(!records.some((r) => r.userId === log.few), 'a learner with few answers entered');
  assert(records.some((r) => r.userId === log.dirty), 'the learner with dirty rows should survive cleaning');
  const ev = A.evaluate(records, null, { featNames: [] });
  const held = records.filter((r) => A.isHeld(r.userId));
  const stats = Object.keys(ev.art.models);
  const e = (f, cls) => mean(held.map((r) => mean(stats.filter((s) => !cls || INDEX[s] === cls).map((s) => Math.abs(f(r, s) - truth[r.userId].truth[s])))));
  const guessOf = Object.fromEntries(stats.map((s) => [s, mean(records.filter((r) => !A.isHeld(r.userId)).map((r) => truth[r.userId].truth[s]))]));
  const asis = (r, s) => r.reads[s].m; const cnd = (r, s) => R.readS1(ev.art, s, { m: r.reads[s].m, conf: r.reads[s].conf }); const gue = (r, s) => guessOf[s];
  const row = (cls) => { const g = e(gue, cls); const a = e(asis, cls); const c = e(cnd, cls); return { guess: 100 - g, asis: 100 - a, candidate: 100 - c, removedAsis: 1 - a / g, removedCandidate: 1 - c / g, reported: cls ? ev.result.byClass[cls] : ev.result.overall }; };
  out.truth = { all: row(null), classes: Object.fromEntries(Object.keys(ev.result.byClass).map((c) => [c, row(c)])) };
  const perL = held.map((r) => mean(stats.map((s) => Math.abs(asis(r, s) - truth[r.userId].truth[s]))) - mean(stats.map((s) => Math.abs(cnd(r, s) - truth[r.userId].truth[s]))));
  out.truth.helped = { held: held.length, better: perL.filter((d) => d > 0).length, worseOver05: perL.filter((d) => d < -0.5).length, worstChange: Math.min(...perL) };
  out.measuresRefit = stats.length; out.classLabel = Object.fromEntries(Object.keys(ev.result.byClass).map((c) => [c, CLASSES[c].label]));

  // power: plant a real fault (the card's spread 1.8 times too wide) and see, at each number of testers, whether the check catches it and whether the fix helps against the truth.
  // No such fault exists in this world, so an unplanted run above is the control.
  const planted = (recs) => recs.map((r) => ({ ...r, reads: Object.fromEntries(Object.entries(r.reads).map(([s, v]) => [s, { ...v, m: Math.max(2, Math.min(98, 50 + 1.8 * (v.m - 50))) }])) }));
  out.power = [];
  for (const n of [40, 60, 80, records.length]) {
    let pass = 0; let tried = 0; const gains = []; const noPass = [];
    for (let t = 0; t < (n === records.length ? 1 : 12); t++) {
      const pick = records.slice().sort((a, b) => ((a.userId * 2654435761 + t * 97) % 1000) - ((b.userId * 2654435761 + t * 97) % 1000)).slice(0, n);
      const pl = planted(pick); const v = A.evaluate(pl, null, { featNames: [] }); tried += 1;
      if (!v.result) { noPass.push('no anchors'); continue; }
      if (v.result.pass) pass += 1;
      const H = pl.filter((r) => A.isHeld(r.userId)); const ss = Object.keys(v.art.models);
      if (H.length && ss.length) { const err = (fn) => mean(H.map((r) => mean(ss.map((s) => Math.abs(fn(r, s) - truth[r.userId].truth[s]))))); gains.push(err((r, s) => r.reads[s].m) - err((r, s) => R.readS1(v.art, s, { m: r.reads[s].m, conf: r.reads[s].conf }))); }
    }
    out.power.push({ testers: n, passes: pass, tried, trueGainPoints: +mean(gains).toFixed(2) });
  }
  // the control: the same draws with no fault planted: how often does the check pass a change that has nothing to fix?
  out.control = []; for (const n of [40, 60, 80]) { let pass = 0; for (let t = 0; t < 12; t++) { const pick = records.slice().sort((a, b) => ((a.userId * 2654435761 + t * 97) % 1000) - ((b.userId * 2654435761 + t * 97) % 1000)).slice(0, n); const v = A.evaluate(pick, null, { featNames: [] }); if (v.result && v.result.pass) pass += 1; } out.control.push({ testers: n, passes: pass, tried: 12 }); }

  // promote: refused if not passed, accepted if passed; the read-out then uses it through the live switch
  const p = runAuto(dbFile, {}, ['--promote']);
  out.promote = p;
  if (out.status.includes('passed its')) {
    assert(/promoted to/.test(p), `should promote: ${p}`);
    const art = JSON.parse(fs.readFileSync(path.join(DIR, 'readout.json'), 'utf8'));
    process.env.READOUT_FILE = path.join(DIR, 'readout.json');
    const sc = require('../services/scorecard'); const id = records[0].userId; const stat = stats[0];
    const card = sc.get(id); const before = sc.read(card, stat, {}).score;
    process.env.SCORECARD_RECAL = '1';
    const after = sc.read(card, stat, {}); delete process.env.SCORECARD_RECAL;
    assert(after.raw_score === before, 'the raw score is kept beside the recalibrated one');
    assert(Number.isFinite(after.score) && art.models[stat], 'read-out path');
    out.readoutCheck = { before, after: after.score };
  } else {
    assert(/not promoted/.test(p), `a failed candidate must be refused: ${p}`);
  }
  out.ok = true;
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
  const f = (v) => (Number.isFinite(v) ? v.toFixed(1) : '');
  console.log(`status: ${out.status}; used ${out.used}; left out ${JSON.stringify(out.counts)}`);
  console.log(`truth all: guess ${f(out.truth.all.guess)} as-is ${f(out.truth.all.asis)} candidate ${f(out.truth.all.candidate)} | reported: guess ${f(out.truth.all.reported.guess)} in-force ${f(out.truth.all.reported.current)} candidate ${f(out.truth.all.reported.candidate)}`);
  for (const [c, v] of Object.entries(out.truth.classes)) console.log(`  ${c}: truth guess ${f(v.guess)} as-is ${f(v.asis)} cand ${f(v.candidate)} | reported ${f(v.reported.guess)} ${f(v.reported.current)} ${f(v.reported.candidate)}`);
  console.log(`truth removed: as-is ${(100 * out.truth.all.removedAsis).toFixed(1)}% candidate ${(100 * out.truth.all.removedCandidate).toFixed(1)}% | reported: in force ${(100 * (out.truth.all.reported.removedCurrent || 0)).toFixed(1)}% candidate ${(100 * (out.truth.all.reported.removedCandidate || 0)).toFixed(1)}%`);
  console.log(`planted fault: ${JSON.stringify(out.power)}`); console.log(`no fault (false passes): ${JSON.stringify(out.control)}`);
  console.log(`held-out: ${out.truth.helped.better} of ${out.truth.helped.held} better against the truth, ${out.truth.helped.worseOver05} lose over 0.5 (worst ${f(out.truth.helped.worstChange)}); promote: ${out.promote.slice(0, 80)}`);
}
main();
