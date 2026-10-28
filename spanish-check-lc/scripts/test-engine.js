#!/usr/bin/env node
'use strict';
/**
 * Engine test with a fake clock and a fake beacon (no network, scratch results dir): timing rules (on time, inside the grace period,
 * late, left open past the limit), formula scoring by hand, "I don't know", rules for the day gap, abandon, exclusion of used items.
 *   node scripts/test-engine.js
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const { Engine } = require('../engine');
const { DRAND } = require('../lib/replay');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-engine-test-'));
const emptyFirst = path.join(tmp, 'first'); fs.mkdirSync(emptyFirst);
let clock = Date.UTC(2026, 10, 5, 15, 0, 0);
const beacon = async () => {
  const round = Math.floor((clock / 1000 - DRAND.genesis) / 3) + 1;
  const signature = crypto.createHash('sha256').update(`fake-signature-${round}`).digest('hex');
  return { round, signature, randomness: crypto.createHash('sha256').update(Buffer.from(signature, 'hex')).digest('hex'), relays: [] };
};
const mk = () => new Engine({ resultsDir: path.join(tmp, 'results'), firstResultsDir: emptyFirst, now: () => clock, beaconFn: beacon, allowUnsealed: true, anchorEnabled: false, verifyBls: false }).init();

(async () => {
  const e = mk();
  await e.start({});
  const items = e.state().open.items;
  ok(items.length === 24 && ['easy', 'medium', 'hard'].every((s) => items.filter((i) => i.stratum === s).length === 8), '24 items, 8 per stratum');
  ok(new Set(items.map((i) => i.key)).size === 24, '24 distinct sentences');
  const plan = []; // [n, action]
  for (let n = 0; n < 24; n++) {
    const p = e.next();
    if (n === 0) ok(p.n === 0 && !('correct' in p) && !('reference' in p), 'first item served, no answer key in the payload'); else if (p.n !== n) ok(false, 'item ' + n + ' served out of order');
    const it = items[n];
    if (n === 0) { clock += 5000; e.answer({ n, choice: it.correct, plays: 2, client_ms: 5000 }); plan.push('right'); }
    else if (n === 1) { clock += 5000; e.answer({ n, choice: (it.correct + 1) % 4, plays: 1, client_ms: 5000 }); plan.push('wrong'); }
    else if (n === 2) { clock += 5000; e.answer({ n, dk: true, plays: 1, client_ms: 5000 }); plan.push('dk'); }
    else if (n === 3) { clock += 42000; const r = e.answer({ n, choice: it.correct, plays: 3, client_ms: 42000 }); ok(r.late === false, 'answer at 42 s is inside the 3 s grace'); plan.push('right'); }
    else if (n === 4) { clock += 44000; const r = e.answer({ n, choice: it.correct, plays: 1, client_ms: 44000 }); ok(r.late === true, 'answer at 44 s is late'); plan.push('late'); }
    else if (n === 5) { clock += 100000; const nx = e.next(); ok(nx.n === 6 || nx.done === false, 'item left open past the limit is closed and the next one served'); plan.push('timeout'); n++; const it6 = items[6]; clock += 3000; e.answer({ n: 6, choice: it6.correct, plays: 1, client_ms: 3000 }); plan.push('right'); }
    else { clock += 4000; e.answer({ n, choice: n % 2 ? (it.correct + 2) % 4 : it.correct, plays: 1, client_ms: 4000 }); plan.push(n % 2 ? 'wrong' : 'right'); }
  }
  const st = e.state();
  ok(st.violations.length === 0, `no rule violations in the replay (${st.violations.join('; ')})`);
  ok(st.finished === 1, 'sitting finished');
  const s = st.sittings[0];
  const kinds = s.scored.items.map((p) => p.kind);
  ok(kinds[0] === 'right' && kinds[1] === 'wrong' && kinds[2] === 'dk' && kinds[3] === 'right' && kinds[4] === 'late' && kinds[5] === 'timeout', `item kinds as planned (${kinds.slice(0, 7).join(',')})`);
  // hand computation of the formula score
  const w = e.pool.meta.strata_weights.items;
  const by = { easy: [], medium: [], hard: [] };
  s.scored.items.forEach((p) => { by[p.stratum].push(p.kind === 'right' ? 1 : p.kind === 'wrong' ? -1 / 3 : 0); });
  const hand = ['easy', 'medium', 'hard'].reduce((a, k) => a + w[k] * by[k].reduce((x, y) => x + y, 0) / by[k].length, 0);
  ok(Math.abs(hand - s.scored.score.est) < 1e-12, `formula score equals the hand computation (${hand.toFixed(4)})`);
  const c = s.scored.counts;
  ok(c.right + c.wrong + c.dk + c.timeout + c.late === 24, `counts add up: ${JSON.stringify(c)}`);
  ok(c.dk === 1 && c.late === 1 && c.timeout === 1, 'one "I don\'t know", one late, one timeout');
  const rep = e.report();
  ok(rep.sittings.length === 1 && rep.sittings[0].counts.dont_know === 1, 'report has the sitting');
  // a second start the same day, then a day later (gap and date rules)
  let err = null; try { await e.start({}); } catch (x) { err = x; }
  ok(err && err.status === 429, 'second sitting the same day refused');
  clock += 13 * 3600 * 1000; // 04:00 next day, local date differs in most zones; in UTC-like zones it may still be the same date, so push a full day
  clock += 24 * 3600 * 1000;
  await e.start({});
  const items2 = e.state().open.items;
  const k1 = new Set(items.map((i) => i.key));
  ok(items2.every((i) => !k1.has(i.key)), 'second sitting reuses none of the first sitting\'s sentences');
  const o1 = new Set(items.flatMap((i) => i.options.map((o) => o.toLowerCase())));
  ok(items2.every((i) => i.options.every((o) => !o1.has(o.toLowerCase()))), 'second sitting reuses none of the first sitting\'s English options');
  e.abandon('test');
  ok(e.state().voided === 1 && e.state().open === null, 'abandon voids the sitting');
  // restart from the log
  const e2 = mk();
  ok(e2.state().finished === 1 && e2.state().voided === 1 && e2.state().chain_ok, 'a new engine replays the same state from the log');
  // an unreachable beacon starts nothing
  const e3 = new Engine({ resultsDir: path.join(tmp, 'results'), firstResultsDir: emptyFirst, now: () => clock + 3 * 86400000, beaconFn: async () => { throw new Error('down'); }, allowUnsealed: true, anchorEnabled: false }).init();
  let err3 = null; try { await e3.start({}); } catch (x) { err3 = x; }
  ok(err3 && err3.status === 503 && e3.state().open === null, 'beacon unreachable -> 503, no sitting started, no fallback');
  // a beacon whose signature is not a valid drand BLS signature is refused when the BLS check is on (the fake beacon above is not signed by drand)
  const e4 = new Engine({ resultsDir: path.join(tmp, 'results'), firstResultsDir: emptyFirst, now: () => clock + 4 * 86400000, beaconFn: beacon, allowUnsealed: true, anchorEnabled: false }).init();
  let err4 = null; try { await e4.start({}); } catch (x) { err4 = x; }
  ok(!require('../lib/bls').available() || (err4 && err4.status === 503 && /signature/.test(err4.message) && e4.state().open === null), `a beacon with a forged signature is refused, no sitting started (${err4 && err4.message})`);
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exitCode = fails ? 1 : 0;
})().catch((x) => { console.error(x); process.exit(1); });
