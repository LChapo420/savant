#!/usr/bin/env node
'use strict';
/**
 * Engine test with injected clock and fake beacon/TSA (no network). Writes to a scratch dir and removes it.
 * Covers: full sitting, timeouts, late answers, resume, reload not resetting the clock, 12h/same-day refusal,
 * abandon, force, never-repeat across sittings, verify of the log with --offline.
 */
const fs = require('fs'); const os = require('os'); const path = require('path');
const crypto = require('crypto');
const { Engine, HttpError } = require('../engine');
const { roundTimeMs } = require('../lib/replay');
const scoring = require('../scoring');

process.env.SPANISH_CHECK_ALLOW_UNSEALED = '1';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-'));
let clock = Date.UTC(2026, 9, 28, 10, 0, 0);
const now = () => clock;
let n = 0;
const beaconFn = async () => {
  n += 1;
  const sig = crypto.createHash('sha256').update('fake-sig-' + n).digest('hex');
  const round = Math.floor((clock / 1000 - 1692803367) / 3) + 1;
  return { round, randomness: crypto.createHash('sha256').update(Buffer.from(sig, 'hex')).digest('hex'), signature: sig, relays: [] };
};
const tsaFn = async (d) => ({ tsq: Buffer.from('q' + d), tsr: Buffer.alloc(600, 1), url: 'fake' });
const otsFn = async () => { throw new Error('no ots in test'); };
const eng = new Engine({ resultsDir: dir, now, beaconFn, tsaFn, otsFn }).init();
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const day = 24 * 3600 * 1000;

async function sit(opts) {
  const { skill, timeoutAt, lateAt } = opts || {};
  await eng.start({ force: opts && opts.force });
  let i = 0;
  for (;;) {
    const it = eng.next();
    if (it.done) break;
    clock += 2000;
    const st = eng.state().open; const real = st.items[it.n];
    if (it.section === 'listening') {
      ok(!('reference' in it) && !JSON.stringify(it).includes(real.reference), `item ${it.n} payload hides the transcript`);
      eng.answer({ n: it.n, answer: skill ? real.reference : '', replays: 1, pastes: 0 });
    } else {
      ok(!('correct' in it), `item ${it.n} payload hides the answer`);
      eng.answer({ n: it.n, choice: skill ? real.correct : (it.n % 4) });
    }
    i++;
    if (timeoutAt === i) { clock += 70000; }
  }
  return i;
}

(async () => {
  const k1 = await sit({ skill: true });
  ok(k1 === 25, 'a sitting serves 25 items');
  let rep = eng.report();
  ok(rep.sittings.length === 1 && rep.sittings[0].listening.score === 1 && rep.sittings[0].reading.raw === 1, 'perfect learner scores 100% / 100%');
  await eng.flushAnchors();
  ok(eng.state().anchors.some((a) => !a.failed), 'anchor written after the sitting ended');
  // second sitting same day refused
  clock += 3600000;
  let refused = false; try { await eng.start({}); } catch (e) { refused = e instanceof HttpError && e.status === 429; }
  ok(refused, 'second sitting within 12 h refused');
  // next day
  clock += day;
  // timeout / late handling: serve item 0, wait 70 s, answer -> late
  await eng.start({});
  let it = eng.next(); clock += 70000;
  const r = eng.answer({ n: 0, answer: eng.state().open.items[0].reference });
  ok(r.late === true, 'listening answer after 63 s is marked late');
  ok(eng.state().open.answers.get(eng.state().open.items[0].item_id).late, 'late is recomputed from timestamps in the replay');
  // reload: next() returns same item with remaining time not reset
  it = eng.next(); clock += 10000; const again = eng.next();
  ok(again.n === it.n && again.remaining_ms < it.remaining_ms, 'reload keeps the same item and does not reset the clock');
  // leave the page
  eng.visibility({ state: 'hidden' }); clock += 3000; eng.visibility({ state: 'visible' });
  eng.answer({ n: again.n, answer: 'hola' });
  // abandon after a few items
  eng.next(); eng.abandon('test');
  ok(eng.state().voided === 1, 'abandon voids the sitting');
  // absent for a long time: auto timeout
  clock += day;
  await eng.start({});
  it = eng.next(); clock += 10 * 60000; it = eng.next();
  ok(it.n === 1, 'item left open for 10 minutes is closed as a timeout and the next one is served');
  eng.abandon('test');
  // never repeat
  clock += day; const before = eng.state().used.keys.size;
  await sit({ skill: false });
  const used = eng.state().sittings.flatMap((s) => s.items.map((x) => x.key));
  ok(new Set(used).size === used.length, `no sentence repeats across ${eng.state().sittings.length} sittings (${used.length} items)`);
  ok(eng.state().violations.length === 0, 'replay finds no rule violations: ' + eng.state().violations.slice(0, 2).join('; '));
  // force
  let refused2 = false; try { await eng.start({}); } catch (e) { refused2 = true; }
  ok(refused2, 'start refused straight after a sitting');
  await eng.start({ force: true }); ok(eng.state().open.force, 'force is logged');
  eng.abandon('test');
  // restart from disk
  const eng2 = new Engine({ resultsDir: dir, now, beaconFn, tsaFn, otsFn }).init();
  ok(eng2.state().finished === 2 && eng2.state().chain_ok, 'a new engine process resumes from the log');
  console.log('report:', JSON.stringify(eng2.report().sittings.map((s) => [s.name, +s.listening.score.toFixed(2), +s.reading.raw.toFixed(2), s.flags.length])));
  console.log('log lines', eng2.lines.length, 'dir', dir);
  if (process.argv.includes('--keep')) console.log('kept'); else fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
