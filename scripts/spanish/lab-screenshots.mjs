// Screenshots of every Spanish level type, via headless Chrome over CDP (no dependencies).
// Run with the server up:  node scripts/spanish/lab-screenshots.mjs <outDir> [scene,scene]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.argv[2];
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const BASE = 'http://localhost:6767';
mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), `es-shots-${Date.now()}`);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, '--window-size=1280,860', '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let ws; let id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9333/json')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r)); break; }
    } catch { /* not up yet */ }
    await wait(200);
  }
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
}
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr, timeout = 60000) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, timeout });
  if (r.result && r.result.exceptionDetails) console.log('  js error:', r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description);
  return r.result && r.result.result && r.result.result.value;
};
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
}
async function go(url, theme = 'light') {
  await send('Page.navigate', { url: `${BASE}${url}` });
  await wait(1400);
  await evalJs(`try { localStorage.setItem('es-theme', '${theme}'); } catch {} document.documentElement.setAttribute('data-theme', '${theme}');`);
}

// Helpers injected into every page.
const H = `
  const w = (ms) => new Promise(r => setTimeout(r, ms));
  const click = () => document.querySelector('.es-footer .es-footer__inner > .es-btn:last-child')?.click();
  const pick = (i) => document.querySelectorAll('#lesson-body .es-choices .es-choice')[i].click();
  const check = () => document.querySelector('.es-footer .es-btn--success:not([disabled])')?.click();
  const skipTo = async (re) => { for (let i = 0; i < 40; i++) { const hd = document.querySelector('.es-challenge-head')?.innerText || ''; if (re.test(hd)) return true; if (document.querySelector('.es-footer')?.dataset.result) { click(); await w(400); continue; } const c = document.querySelector('#lesson-body .es-choices .es-choice'); if (c && hd) { c.click(); await w(100); check(); await w(600); continue; } click(); await w(500); } return false; };
  ES.audio.say = async () => {};
`;

const SCENES = {
  async lab() { await go('/spanish/lab'); await wait(800); await shot('01-lab-page'); },
  async 'lab-dark'() { await go('/spanish/lab', 'dark'); await wait(800); await shot('02-lab-page-dark'); },
  async lesson() {
    await go('/spanish/play?level=lesson-topic');
    await evalJs(`${H} click(); await w(600); pick(0); await w(200);`); await shot('10-lesson-select-image');
    await evalJs(`${H} check(); await w(700);`); await shot('11-lesson-correct-sheet');
    await evalJs(`${H} click(); await w(600); pick(0); await w(150); check(); await w(700);`); await shot('12-lesson-wrong-sheet');
    await evalJs(`${H} click(); await w(500); await skipTo(/matching pairs/i); await w(300);
      const cells = [...document.querySelectorAll('#lesson-body .es-pairs .es-choice')]; const txt = c => c.querySelector('.es-choice__text').textContent;
      cells.find(c => txt(c) === 'hola').click(); await w(60); cells.find(c => txt(c) === 'hello').click(); await w(500);
      cells.find(c => txt(c) === 'gracias').click(); await w(200);`, 90000); await shot('13-lesson-match-pairs');
    await evalJs(`${H} const cells = [...document.querySelectorAll('#lesson-body .es-pairs .es-choice')]; const txt = c => c.querySelector('.es-choice__text').textContent;
      cells.find(c => txt(c) === 'thank you').click(); await w(400);
      for (const [a,b] of [['amigo','friend'],['el hotel','the hotel'],['la música','the music']]) { cells.find(c => txt(c) === a).click(); await w(50); cells.find(c => txt(c) === b).click(); await w(450); }
      await w(700); click(); await w(600); await skipTo(/Write this in English/);
      for (const t of ['Hello','friend']) { [...document.querySelectorAll('#lesson-body .es-bank .es-tile:not([data-state])')].find(x => x.textContent === t).click(); await w(80); }
      await w(500);`, 90000); await shot('14-lesson-word-bank');
  },
  async typing() {
    await go('/spanish/play?level=writing-topic');
    await evalJs(`${H} click(); await w(600); const i = document.querySelector('#lesson-body textarea'); i.value = 'dieciseis'; i.dispatchEvent(new Event('input', {bubbles:true})); await w(150); check(); await w(800);`); await shot('15-typing-accent-nudge');
  },
  async speak() {
    await go('/spanish/play?level=speaking-topic');
    await evalJs(`${H} await w(900);`); await shot('16-speak-this-sentence');
  },
  async listen() {
    await go('/spanish/play?level=listening-topic');
    await evalJs(`${H} await w(500); pick(0); await w(200);`); await shot('19a-listening-what-do-you-hear');
    await evalJs(`${H} for (let i = 0; i < 30; i++) { if (/picture/i.test(document.querySelector('.es-challenge-head')?.innerText || '')) break; if (document.querySelector('.es-footer')?.dataset.result) { click(); await w(400); continue; } const c = document.querySelector('#lesson-body .es-choices .es-choice'); if (c) { c.click(); await w(80); check(); await w(500); continue; } click(); await w(400); } document.querySelectorAll('#lesson-body .es-choices .es-choice')[1]?.click(); await w(200);`, 90000); await shot('19b-listening-tap-the-picture');
  },
  async chat() {
    await go('/spanish/play?level=lesson-topic');
    await evalJs(`${H} await skipTo(/Complete the chat/); await w(300); pick(0); await w(300);`); await shot('17-complete-the-chat');
  },
  async fix() {
    await go('/spanish/play?level=game-topic');
    await evalJs(`${H} document.querySelectorAll('#lesson-body .es-fixline .es-tile')[1].click(); await w(200); document.querySelector('#lesson-body .es-fixes .es-choice').click(); await w(200);`); await shot('18-find-and-fix');
  },
  async story() {
    await go('/spanish/play?level=input-session');
    await evalJs(`${H} click(); await w(700); for (let i = 0; i < 3; i++) { click(); await w(500); } await w(500);`); await shot('20-story-input-session');
  },
  async radio() {
    await go('/spanish/play?level=listening-lab');
    await evalJs(`${H} click(); await w(1200); document.querySelector('.es-radio__who')?.setAttribute('data-on','true');`); await shot('21-listening-lab');
  },
  async intro() {
    await go('/spanish/play?level=unit-intro');
    await evalJs(`${H} await w(300);`); await shot('22-unit-intro-goal');
    await evalJs(`${H} click(); await w(1500); const b = document.querySelector('.es-stage__actor .es-stage__bubble'); if (b) { b.hidden = false; b.textContent = '¡Hola, Tomás! Buenos días.'; }`); await shot('23-unit-intro-clip');
  },
  async dictation() {
    await go('/spanish/play?level=dictation');
    await evalJs(`${H} await w(400); const i = document.querySelector('#lesson-body textarea'); i.value = 'ola, buenos dias'; i.dispatchEvent(new Event('input', {bubbles:true})); await w(150); check(); await w(900);`); await shot('24-dictation-diff');
  },
  async convo() {
    await go('/spanish/play?level=conversation-lab');
    await evalJs(`${H} click(); await w(1500);
      const say = async (t) => { const input = document.querySelector('.es-convo__bar input'); const before = document.querySelectorAll('.es-convo__log .es-chat__row').length; input.value = t; document.querySelector('.es-convo__bar .es-btn--secondary').click(); for (let i = 0; i < 60 && document.querySelectorAll('.es-convo__log .es-chat__row').length < before + 2; i++) await w(500); };
      await say('¡Hola! Buenos días.'); await say('Quiero agua, por favor.'); await w(500); window.scrollTo(0, 0);`, 90000); await shot('25-conversation-lab');
  },
  async writing() {
    await go('/spanish/play?level=essay');
    await evalJs(`${H} click(); await w(500); const t = document.querySelector('#lesson-body textarea'); t.value = 'Hola Lucía: Te recomiendo que llegas temprano el primer día. Es importante que habla con los profesores. No puedes usar el movil en clase. Un abrazo, Marta'; t.dispatchEvent(new Event('input', {bubbles:true})); await w(200);`); await shot('26-writing-draft-checklist');
    await evalJs(`${H} document.querySelector('.es-footer .es-btn--success').click(); for (let i = 0; i < 80 && !document.querySelector('.es-fbcards'); i++) await w(500); window.scrollTo(0,0);`, 90000); await shot('27-writing-ai-feedback');
  },
  async sprint() {
    await go('/spanish/play?level=fluency-sprint');
    await evalJs(`${H} ES.recorder.start = async () => ({ stop: () => new Promise(() => {}) }); click(); await w(700); click(); await w(900);`); await shot('28-fluency-sprint');
  },
  async reader() {
    await go('/spanish/play?level=reading-block');
    await evalJs(`${H} await w(300);`); await shot('29-reading-block-picker');
    await evalJs(`${H} document.querySelectorAll('.es-pickgrid .es-choice')[1].click(); await w(500); const x = [...document.querySelectorAll('.es-rword')].find(e => e.textContent.startsWith('simpático')); x.click(); await w(300);`); await shot('30-reading-block-reader');
  },
  async check() {
    await go('/spanish/play?level=unit-check');
    await evalJs(`${H} click(); await w(700);`); await shot('31-unit-check-item');
  },
  async place() {
    await go('/spanish/play?level=entry-check');
    await evalJs(`${H} click(); await w(800);`); await shot('32-entry-check');
  },
  async exam() {
    await go('/spanish/play?level=checkpoint');
    await evalJs(`${H} await w(200);`); await shot('33-checkpoint-intro');
  },
  async live() { await go('/spanish/play?level=live-conversation'); await wait(600); await shot('34-live-conversation-choose'); },
  async mission() { await go('/spanish/play?level=mission'); await evalJs(`${H} await w(400); document.querySelectorAll('#lesson-body .es-choice')[0].click();`); await shot('35-mission'); },
  async project() { await go('/spanish/play?level=project'); await evalJs(`${H} await w(200);`); await shot('36-grade-project-intro'); },
  async games() {
    await go('/spanish/play?level=game-speed-match&t=60');
    await evalJs(`${H} click(); await w(2600); const L = document.querySelector('.es-sm-left'); L.click(); await w(200);`); await shot('40-game-speed-match');
    await go('/spanish/play?level=game-memory-pairs&t=60');
    await evalJs(`${H} click(); await w(2600); const c = document.querySelectorAll('.es-mcard'); c[0].click(); await w(80); c[5].click(); await w(150);`); await shot('41-game-memory-pairs');
    await go('/spanish/play?level=game-listen-tap&t=60');
    await evalJs(`${H} click(); await w(2700);`); await shot('42-game-listen-and-tap');
    await go('/spanish/play?level=game-word-race&t=60');
    await evalJs(`${H} click(); await w(2700); const i = document.querySelector('.es-race__input'); i.value = 'por fav'; await w(1200);`); await shot('43-game-word-race');
  },
  async done() {
    await go('/spanish/play?level=review-game');
    await evalJs(`${H} for (let i = 0; i < 40 && !document.querySelector('.es-endscreen .es-tiles'); i++) { if (document.querySelector('.es-footer')?.dataset.result) { click(); await w(350); continue; } const tile = document.querySelector('#lesson-body .es-bank .es-tile:not([data-state])'); const inp = document.querySelector('#lesson-body textarea'); const c = document.querySelector('#lesson-body .es-choices .es-choice'); if (c) { c.click(); await w(80); check(); await w(500); continue; } if (tile) { tile.click(); await w(80); check(); await w(500); continue; } if (inp) { inp.value='Hay un café aquí'; inp.dispatchEvent(new Event('input', {bubbles:true})); await w(80); check(); await w(500); continue; } click(); await w(450); } await w(800);`, 90000);
    await shot('50-lesson-complete');
  },
};

await connect();
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
for (const [name, fn] of Object.entries(SCENES)) {
  if (ONLY && !ONLY.includes(name)) continue;
  try { await fn(); } catch (err) { console.log('scene failed', name, err.message); }
}
// A phone-size view of a lesson.
if (!ONLY || ONLY.includes('mobile')) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await go('/spanish/play?level=lesson-topic');
  await evalJs(`${H} click(); await w(600); pick(1); await w(200);`); await shot('60-mobile-lesson');
}
ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
