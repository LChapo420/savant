/**
 * The real delay and the real cost of a voice call: real speech recognition and voice through the LLM Gateway, real tutor models, a real clip of speech as the microphone.
 *
 *   node scripts/tutor-call-real-delay.js [--turns=4] [--wav=<16-bit mono wav of several questions with long gaps>]
 *
 * SPENDS A LITTLE: about $0.02 a turn on the gateway, through the LIVE ledger (--live-data, the running app's data folder). Synthetic learner on a temporary database. Modelflare, OpenRouter,
 * Anthropic, Standard Compute and Grokified keys are blanked for the run; RUN_CAP_USD caps it. Chromium has no speaker or room here, so echo and real-microphone quality are not in these numbers.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require
const ROOT = path.join(__dirname, '..');
const arg = (name, d) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const PORT = Number(arg('port', 6815));
const BASE = `http://localhost:${PORT}`;
const TURNS = Number(arg('turns', 4));
const WAV = arg('wav', null);
const LIVE = arg('live-data', 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
require(path.join(ROOT, 'node_modules/dotenv')).config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'giraffe-real-'));
  const ledgers = Object.fromEntries(['ANTHROPIC', 'CORAL', 'GLADIA', 'GONKA', 'GROKIFIED', 'JEV', 'LLMGATEWAY', 'LYCEUM', 'MUNITO', 'STANDARD_COMPUTE', 'ZEROGPU'].map((p) => [`${p}_LEDGER_FILE`, path.join(LIVE, `${p.toLowerCase().replace('_', '-')}-ledger.json`)]));
  const before = JSON.parse(fs.readFileSync(ledgers.LLMGATEWAY_LEDGER_FILE, 'utf8'));
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, ...ledgers, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'm'), SESSION_SECRET: 'browser-test-secret-browser-test-secret', OWNER_EMAIL: 'owner-test@example.com', SIGNIN_ONLY: '0', SPANISH_GATEWAY_USERS: '1', RUN_CAP_USD: '0.5',
    MODELFLARE_API_KEY: '', MODELFLARE_HAIKU_API_KEY: '', MODELFLARE_LUNA_API_KEY: '', OPENROUTER_API_KEY: '', OPENROUTER_DEEPSEEK_API_KEY: '', OPENROUTER_GLM_API_KEY: '', OPENROUTER_GPT_SOL_API_KEY: '', ANTHROPIC_API_KEY: '', FACT_CHECK_ANTHROPIC_KEY: '', STANDARD_COMPUTE_API_KEY: '', GROKIFIED_API_KEY: '', UNOROUTER_API_KEY: '', AIHUBMIX_API_KEY: '', XKIRO_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 200; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* up soon */ } }
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${WAV}%noloop`, '--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: false });
    const call = (m, u, d) => ctx.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
    const reg = await call('POST', '/api/auth/register', { email: 'real@example.com', password: 'test-password-123', display_name: 'Gia', birth_year: 1990, birth_month: 5, country: 'US', agreed: true });
    if (reg.json.user.id !== 1) throw new Error('expected id 1');
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dashboard`);
    await page.waitForSelector('.tdock-g-btn');
    await delay(800);
    await page.hover('.tdock-g-btn'); await page.mouse.down(); await delay(650); await page.mouse.up();
    const t0 = Date.now();
    let turns = [];
    const seen = [];
    while (Date.now() - t0 < 180000) {
      await delay(400);
      const s = await page.evaluate(() => ({ voice: document.querySelector('.tdock-g').dataset.voice, last: window.TutorCall && window.TutorCall.last }));
      if (seen[seen.length - 1] !== s.voice) seen.push(s.voice);
      turns = (s.last && s.last.turns) || [];
      if (turns.length >= TURNS && s.voice === 'listening') break;
      if (!s.voice && Date.now() - t0 > 3000) break;
    }
    const log = await page.evaluate(() => [...document.querySelectorAll('.tdock-log > div')].map((d) => `${d.className}: ${d.textContent}`));
    await page.evaluate(() => { const b = document.querySelector('.tdock-g-btn'); if (document.querySelector('.tdock-g').dataset.voice) b.click(); });
    await delay(800);
    const elapsedMin = (Date.now() - t0) / 60000;
    const after = JSON.parse(fs.readFileSync(ledgers.LLMGATEWAY_LEDGER_FILE, 'utf8'));
    const spent = Number(after.settled_usd) - Number(before.settled_usd);
    const chars = log.filter((l) => l.startsWith('bot')).reduce((n, l) => n + l.length - 5, 0);
    console.log('log:'); log.forEach((l) => console.log(`  ${l.slice(0, 200)}`));
    console.log('states seen:', seen.join(' > '));
    console.log('turns:', JSON.stringify(turns));
    for (const k of ['detect_ms', 'stt_ms', 'reply_ms', 'audio_ms', 'total_ms']) console.log(`  ${k}: median ${median(turns.map((t) => t[k]))}, min ${Math.min(...turns.map((t) => t[k]))}, max ${Math.max(...turns.map((t) => t[k]))}`);
    console.log(`gateway ledger: +$${spent.toFixed(4)} (now $${Number(after.settled_usd).toFixed(4)} of $${after.cap_usd}), tts ${after.by_task.tts.calls - before.by_task.tts.calls} calls, stt ${after.by_task.stt.calls - before.by_task.stt.calls} calls, ${chars} characters shown as replies, ${elapsedMin.toFixed(2)} min of call, $${(spent / elapsedMin).toFixed(4)} per minute of call`);
  } finally {
    await browser.close();
    server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
