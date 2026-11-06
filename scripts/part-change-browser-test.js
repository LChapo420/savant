#!/usr/bin/env node
/**
 * A real Chrome at phone width (375 x 812, touch) through the learner's own change: the lesson of an uploaded course, a built-in lesson's block and check, a session question, and the profile.
 * Drives a local server on a temp database copy, with a test account made for the run. Never the live server, never account 6689. Prints what it saw and leaves screenshots.
 *
 *   node scripts/part-change-browser-test.js <base url> <cred.json: {email,pw}> <out dir> <material id> <enrollment id>
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [BASE, CRED, OUT, MATERIAL, ENROLL] = process.argv.slice(2);
const CHROME = process.env.CHROME || 'C:/Users/admin/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const PORT = 9900 + Math.floor(Math.random() * 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cred = JSON.parse(fs.readFileSync(CRED, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const seen = [];
const say = (ok, what, detail = '') => { seen.push({ ok, what }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${String(detail).slice(0, 260)}` : ''}`); };

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 40 && !target; i += 1) { await sleep(500); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ } }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const wait = new Map(); const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + ((d.params.exceptionDetails.exception || {}).description || '').slice(0, 200));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(String((d.params.args[0] || {}).value || '').slice(0, 200));
  };
  const send = (method, params = {}) => new Promise((r) => { id += 1; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const js = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text + JSON.stringify(r.result.exceptionDetails.exception || {}).slice(0, 200)); return r.result.result.value; };
  const go = async (p) => { await send('Page.navigate', { url: BASE + p }); await sleep(2500); };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64')); };
  const until = async (expr, ms = 90000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(expr)) return true; await sleep(700); } return false; };
  const noOverflow = async (where) => { const w = await js('document.documentElement.scrollWidth'); say(w <= 376, `${where}: no sideways scroll at phone width`, w); };
  const clickChange = (scope, k) => js(`(() => { const b = document.querySelector('${scope} [data-change="${k}"]'); if (!b) return false; b.scrollIntoView({block:'center'}); b.click(); return true; })()`);
  const note = (scope) => js(`(document.querySelector('${scope} [data-note]')||{}).textContent||''`);
  const settled = (scope) => until(`(() => { const n = document.querySelector('${scope} [data-note]'); return n && n.textContent && !/Rewriting/.test(n.textContent); })()`);

  await go('/login');
  const login = await js(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({ email: cred.email, password: cred.pw })})}).then(r=>r.status)`);
  say(login === 200, 'signs in as the test account', login);

  // ── an uploaded course's lesson ───────────────────────────────────────────
  await go(`/my-material-study?id=${MATERIAL}`);
  await js(`(() => { const b = document.querySelector('[data-skill]'); if (b) b.click(); return !!b; })()`);
  const showed = await until(`!!document.querySelector('#lesson-change [data-change]')`, 15000);
  say(showed, 'course lesson shows the row of changes');
  await noOverflow('course lesson');
  await shot('1-course-before');
  if (showed) {
    const before = await js(`document.getElementById('lesson-text').innerText`);
    await clickChange('#lesson-change', 'shorter');
    await settled('#lesson-change');
    const after = await js(`document.getElementById('lesson-text').innerText`);
    say(after !== before && after.length < before.length, 'Shorter gives shorter text', `${before.length} to ${after.length}: ${after}`);
    console.log('     note:', await note('#lesson-change'));
    await shot('2-course-shorter');
    say(/1618/.test(after) && /1648/.test(after) && /109/.test(after), 'the numbers are still there');
    await js(`document.querySelector('#lesson-change [data-revert]').click()`);
    await settled('#lesson-change');
    await sleep(800);
    const back = await js(`document.getElementById('lesson-text').innerText`);
    say(back.trim() === before.trim(), 'Put back returns the stored text');
    // Another topic, through the page's own dialog
    await clickChange('#lesson-change', 'topic');
    await until(`!!document.querySelector('dialog[open] textarea, dialog[open] input')`, 5000);
    await shot('3-topic-dialog');
    await js(`(() => { const t = document.querySelector('dialog[open] textarea, dialog[open] input'); t.value = 'model trains'; t.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('dialog[open] button[type=submit], dialog[open] .btn-primary').click(); })()`);
    await sleep(500);
    await settled('#lesson-change');
    const themed = await js(`document.getElementById('lesson-text').innerText`);
    say(/train/i.test(themed) || /could not be made/.test(await note('#lesson-change')), 'Another topic: named in the text, or refused with a reason', `${await note('#lesson-change')} ${themed}`);
    await shot('4-course-topic');
  }

  // ── a built-in lesson ─────────────────────────────────────────────────────
  await go('/base-lesson?track=english&grade=proficient&level=10');
  const blockRow = await until(`!!document.querySelector('#block-level-host [data-part-change]')`, 20000);
  say(blockRow, 'built-in lesson: a reading block shows the row');
  await noOverflow('built-in lesson');
  if (blockRow) {
    const first = '#block-level-host [data-part-change]';
    const tx = `(() => { const s = document.querySelector('${first}').parentElement.previousElementSibling; return s ? s.innerText : ''; })()`;
    const before = await js(tx);
    await shot('5-block-before');
    await js(`document.querySelector('${first} [data-change="simpler"]').click()`);
    await settled(first);
    const after = await js(`(() => { const s = document.querySelector('${first}').parentElement.previousElementSibling; return s ? s.innerText : ''; })()`);
    const n = await note(first);
    say(after !== before || /could not be made/.test(n), 'Simpler redraws the block, or refuses with a reason', `${n} :: ${after.slice(0, 220)}`);
    await shot('6-block-simpler');
    await go('/base-lesson?track=english&grade=proficient&level=10');
    await until(`!!document.querySelector('${first}')`, 20000);
    const reload = await js(tx);
    say(reload.trim() === after.trim(), 'the changed block is still there after a reload');
    // A check: answer it and look under its verdict.
    const answered = await js(`(() => { const s = document.querySelector('section[data-block="Check_Choice"]'); if (!s) return false; s.scrollIntoView(); const b = s.querySelector('button'); if (!b) return false; b.click(); return true; })()`);
    if (answered) {
      await sleep(600);
      await js(`(() => { const s = document.querySelector('section[data-block="Check_Choice"]'); const go = [...s.querySelectorAll('button')].find((x) => /check|submit|answer/i.test(x.textContent)); if (go) go.click(); })()`);
      const under = await until(`!!document.querySelector('section[data-block="Check_Choice"] [data-part-change]')`, 8000);
      const verdict = await js(`(document.querySelector('section[data-block="Check_Choice"] [class*="verdict"]')||{}).innerText||''`);
      say(under, 'a check\'s explanation shows the row after the answer', verdict);
      await shot('7-block-check');
    } else say(false, 'no multiple-choice check on this lesson to answer');
  }

  // ── a session question ────────────────────────────────────────────────────
  await go(`/session?enrollment=${ENROLL}&ordinary=1`);
  await sleep(3000);
  // A lesson level reads first: press its button whenever it is there, until a question is on screen.
  const hasQ = await until(`(() => { const b = document.getElementById('start-checks'); if (b && !b.disabled) b.click(); return !!document.querySelector('.choices [data-choice], .answer-row input'); })()`, 90000);
  if (hasQ) {
    await js(`(() => { const c = document.querySelector('.choices [data-choice]'); if (c) { c.click(); return; } const i = document.querySelector('.answer-row input'); i.value = 'x'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await sleep(400);
    await js(`(() => { const b = document.querySelector('[data-act="check"]'); if (b && !b.disabled) b.click(); })()`);
    const verdict = await until(`!!document.querySelector('.verdict .rationale')`, 15000);
    const row = await until(`!!document.querySelector('.verdict [data-part-change]')`, 6000);
    say(verdict && row, 'session question: verdict and the row', await js(`(document.querySelector('.verdict')||{}).innerText||''`));
    await noOverflow('session verdict');
    await shot('8-session-verdict');
    if (row) {
      const before = await js(`document.querySelector('.verdict .rationale').textContent`);
      await clickChange('.verdict', 'examples');
      await settled('.verdict');
      const after = await js(`document.querySelector('.verdict .rationale').textContent`);
      say(after !== before || /could not be made/.test(await note('.verdict')), 'More examples adds one, or refuses with a reason', `${await note('.verdict')} :: ${after}`);
      await shot('9-session-examples');
    }
  } else say(false, 'no question appeared in the session', await js('document.body.innerText.slice(0,200)'));

  // ── it stuck, and can be undone ───────────────────────────────────────────
  await go('/profile');
  const listed = await until(`!!document.querySelector('[data-part-prefs]')`, 10000);
  const text = await js(`(document.querySelector('[data-part-prefs]')||{}).innerText||''`);
  say(listed && /Shorter/.test(text) && /model trains/.test(text), 'the profile lists what was asked for', text);
  await js(`(document.querySelector('[data-part-prefs]')||{scrollIntoView(){}}).scrollIntoView()`);
  await shot('10-profile');
  await noOverflow('profile');
  await js(`(document.querySelector('[data-forget="topic"]')||{click(){}}).click()`);
  await sleep(1200);
  const after = await js(`(document.querySelector('[data-part-prefs]')||{}).innerText||''`);
  say(!/model trains/.test(after), 'one choice can be removed there');
  const prefs = await js(`fetch('/api/parts/prefs').then(r=>r.json())`);
  console.log('     prefs now:', JSON.stringify(prefs.prefs));

  const uniq = [...new Set(errors)];
  say(!uniq.length, 'no page errors', uniq.join(' | '));
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* fine */ }
  const bad = seen.filter((s) => !s.ok).length;
  console.log(bad ? `\n${bad} FAILED` : '\nall ok');
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
