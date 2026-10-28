#!/usr/bin/env node
'use strict';
/**
 * End-to-end test over HTTP against scripts/harness.js: a full fake sitting (real drand, real time-stamp authority),
 * access checks for other users, audio check for every clip, the report, then the anchor.
 *   SPANISH_LC_RESULTS_DIR=<scratch> node scripts/harness.js     (in another shell)
 *   node scripts/e2e-http.js http://127.0.0.1:6898 <scratch results dir>
 * The fake learner answers: clips 0-7 "I don't know", 8-15 option 0, 16-23 option 1 (a mix of right, wrong and don't-know).
 */
const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:6898';
const RES = process.argv[3];
const api = (p, opt = {}) => fetch(`${BASE}/api/spanish-check-lc${p}`, { ...opt, headers: { 'content-type': 'application/json', ...(opt.headers || {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

(async () => {
  let r = await j(await api('/status', { headers: { 'x-fake-user': '0' } })); ok(r.status === 404, 'anonymous -> 404');
  r = await j(await api('/status', { headers: { 'x-fake-user': '1' } })); ok(r.status === 404, 'other account -> 404 on status');
  for (const [m, p] of [['POST', '/start'], ['GET', '/next'], ['POST', '/answer'], ['GET', '/report'], ['GET', '/audio/0'], ['POST', '/abandon'], ['POST', '/visibility']]) {
    const x = await api(p, { method: m, headers: { 'x-fake-user': '1' }, body: m === 'POST' ? {} : undefined });
    ok(x.status === 404, `other account -> 404 on ${m} ${p}`);
    const y = await api(p, { method: m, headers: { 'x-fake-user': '0' }, body: m === 'POST' ? {} : undefined });
    ok(y.status === 404, `anonymous -> 404 on ${m} ${p}`);
  }
  r = await j(await api('/status')); ok(r.status === 200 && ['ready', 'open', 'wait'].includes(r.body.state), `status for 6689: ${JSON.stringify(r.body).slice(0, 140)}`);
  const t0 = Date.now();
  r = await j(await api('/start', { method: 'POST', body: {} })); ok(r.status === 200, `start (${Date.now() - t0} ms): ${JSON.stringify(r.body)}`);
  if (r.status !== 200) process.exit(1);
  let audioOk = 0; let n = 0; const audioSample = [];
  for (;;) {
    const it = await j(await api('/next'));
    if (it.status !== 200) { ok(false, 'next ' + JSON.stringify(it)); break; }
    if (it.body.done) break;
    const b = it.body;
    if (n === 0) {
      const keys = Object.keys(b);
      ok(!('correct' in b) && !('reference' in b) && !('stratum' in b) && !('text' in b) && !('key' in b), `item payload carries no answer key, transcript or stratum (keys: ${keys.join(',')})`);
      ok(b.options.length === 4 && b.limit_s === 40 && b.max_plays === 3, 'four options, 40 s, 3 plays');
    }
    const a = await fetch(`${BASE}/api/spanish-check-lc/${b.audio.url}`);
    const buf = Buffer.from(await a.arrayBuffer());
    const looksMp3 = (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    audioSample.push(`${a.status} ${a.headers.get('content-type')} ${buf.length}B ${looksMp3 ? 'mp3' : 'NOT mp3'}`);
    if (a.status === 200 && /audio/.test(a.headers.get('content-type')) && looksMp3) audioOk++;
    const body = b.n < 8 ? { n: b.n, dk: true, plays: 1, client_ms: 5000 } : { n: b.n, choice: b.n < 16 ? 0 : 1, plays: 2, client_ms: 6000 };
    if (n === 3) { const bad = await j(await api('/answer', { method: 'POST', body: { n: b.n } })); ok(bad.status === 400, 'an answer with neither a choice nor "I don\'t know" is refused'); }
    const x = await j(await api('/answer', { method: 'POST', body }));
    if (x.status !== 200) ok(false, 'answer ' + JSON.stringify(x));
    else if (n === 4) { const again = await j(await api('/answer', { method: 'POST', body })); ok(again.status === 409, 'answering the same clip twice refused'); }
    if (n === 12) { await api('/visibility', { method: 'POST', body: { state: 'hidden', client_t: Date.now() } }); await api('/visibility', { method: 'POST', body: { state: 'visible', client_t: Date.now() } }); }
    n++;
    if (x.body && x.body.done) break;
  }
  ok(n === 24, `24 clips answered (${n})`);
  ok(audioOk === 24, `audio endpoint returned 200 audio/mpeg for ${audioOk} of 24 clips`);
  console.log('   audio:', audioSample.slice(0, 6).join(' | '), '...');
  r = await j(await api('/next')); ok(r.status === 200 && r.body.done, 'next after the last clip -> done');
  r = await j(await api('/report'));
  const s = r.body.sittings[0];
  ok(r.body.sittings.length === 1 && s.name === 'Day 0', 'report has the finished sitting');
  console.log('   scores:', JSON.stringify({ score: s.score, raw: s.raw, counts: s.counts, timing: s.timing, flags: s.flags }));
  ok(s.counts.dont_know === 8 && s.counts.right + s.counts.wrong === 16, "8 \"I don't know\" and 16 answered");
  ok(s.timing.page_leaves === 1, 'one page-leave logged and reported');
  r = await j(await api('/start', { method: 'POST', body: {} })); ok(r.status === 429, `second start the same day refused (${r.status})`);
  r = await j(await api('/audio/0')); ok(r.status === 409, 'audio for a closed sitting refused');
  if (RES) {
    const log = path.join(RES, 'log.jsonl');
    for (let i = 0; i < 40; i++) {
      const txt = fs.readFileSync(log, 'utf8');
      if (/"type":"anchor_ok"/.test(txt)) break;
      await new Promise((z) => setTimeout(z, 1500));
    }
    const txt = fs.readFileSync(log, 'utf8');
    ok(/"type":"anchor_ok"/.test(txt), 'log head was time-stamped after the sitting ended');
    console.log('   anchors dir:', fs.existsSync(path.join(RES, 'anchors')) ? fs.readdirSync(path.join(RES, 'anchors')).join(', ') : 'none');
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
