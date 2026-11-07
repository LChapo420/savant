/**
 * Forgot password in a real browser, on a throwaway store and synthetic accounts. Not part of `npm test`: playwright is not a dependency of the app.
 *
 *   node scripts/password-reset-browser.js --pw=<path to playwright> --shots=<dir>
 *
 * The walk: sign-in page, "Forgot password?", the email (read from the dev outbox), the page, a new password, sign-in, onward to ?next=. Then every screen
 * in light and dark, at desktop width and at 375 px, checked for sideways scrolling and for script errors. Then the switch off.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const { chromium } = require(arg('pw', 'playwright')); // eslint-disable-line import/no-dynamic-require

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'password-reset-browser-'));
const shots = arg('shots', path.join(dir, 'shots'));
fs.mkdirSync(shots, { recursive: true });
const outbox = path.join(dir, 'outbox');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OLD = 'old-password-1';
const NEW = 'new-password-2';
let failures = 0;
let passes = 0;
function check(name, ok, detail) {
  if (ok) { passes += 1; console.log(`  ok  ${name}`); } else { failures += 1; console.log(`  FAIL ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`); }
}

let child = null;
let port = 8400 + Math.floor(Math.random() * 400);
const origin = () => `http://127.0.0.1:${port}`;
async function start(extra = {}) {
  port += 1;
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: dir, TMP: dir, NODE_ENV: 'test', PORT: String(port),
    SESSION_SECRET: 'password-reset-browser-secret-0123456789abcd', DB_FILE: path.join(dir, 'db.json'), COST_TRACKER: 'off', BETA_REPORT_DAILY: 'off', OLLAMA_ENABLED: '0',
    CONSENT_SWEEP: 'off', WRITE_AHEAD: 'off', LOG_DIR: path.join(dir, 'logs'), MAIL_OUTBOX_DIR: outbox, MAIL_PROVIDER: '', RESEND_API_KEY: '', BREVO_API_KEY: '', APP_ORIGIN: '',
    BETA_GATE: '', PASSWORD_RESET: 'on', ...extra,
  };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  for (let i = 0; i < 300; i += 1) {
    try { if ((await fetch(`${origin()}/api/auth/me`)).status === 200) return; } catch { /* still starting */ }
    await sleep(200);
  }
  throw new Error('server did not start');
}
async function stop() {
  if (!child) return;
  const gone = new Promise((r) => child.once('exit', r));
  child.kill();
  await gone;
  child = null;
}

async function linkFor(email, count) {
  for (let i = 0; i < 100; i += 1) {
    const list = fs.existsSync(outbox) ? fs.readdirSync(outbox).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), 'utf8'))).filter((m) => m.tag === 'password-reset' && m.to === email) : [];
    if (list.length >= count) return /(http\S+#token=\S+)/.exec(list[list.length - 1].text)[1];
    await sleep(50);
  }
  throw new Error(`no email for ${email}`);
}

const problems = [];
function watch(page) {
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => problems.push(String(e).slice(0, 200)));
}
const visible = (page, selector) => page.locator(selector).isVisible();
const ready = (page) => page.waitForLoadState('networkidle');

async function register(context, email) {
  const page = await context.newPage();
  await page.goto(`${origin()}/login`);
  const status = await page.evaluate(async ([e, p]) => (await fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p, display_name: 'Test Adult', birth_year: 1990, birth_month: 1, country: 'US' }),
  })).status, [email, OLD]);
  if (status !== 201) throw new Error(`register: ${status}`);
  await page.close();
}

async function walk(browser) {
  console.log('\nThe walk');
  const email = 'walk@example.test';
  const elsewhere = await browser.newContext();
  await register(elsewhere, email); // signed in here: another device, which must be signed out at the end
  const other = await elsewhere.newPage();

  const context = await browser.newContext();
  const page = await context.newPage();
  watch(page);
  await page.goto(`${origin()}/login?next=${encodeURIComponent('/profile')}`);
  await ready(page);
  check('the link is on the sign-in page', await visible(page, 'a:has-text("Forgot password?")'));
  await page.click('a:has-text("Forgot password?")');
  await ready(page);
  check('it opens the forgot page, keeping next', page.url() === `${origin()}/forgot-password?next=%2Fprofile`, page.url());
  check('back to sign-in keeps next', (await page.getAttribute('#back', 'href')) === '/login?next=%2Fprofile');

  await page.fill('#email', 'kid_username');
  await page.click('#submit');
  check('a username is told plainly what to do', /parent or guardian/.test(await page.textContent('#error')) && await visible(page, '#forgot-form'));

  await page.fill('#email', email);
  await page.click('#submit');
  await page.waitForSelector('#sent:not(.hidden)');
  check('it says a link is on its way, without saying whether the account exists', /If that email has a Savant account/.test(await page.textContent('#sent')));
  check('the form goes away', !(await visible(page, '#forgot-form')));

  const unknown = await context.newPage();
  await unknown.goto(`${origin()}/forgot-password`);
  await ready(unknown);
  await unknown.fill('#email', 'nobody-here@example.test');
  await unknown.click('#submit');
  await unknown.waitForSelector('#sent:not(.hidden)');
  check('an unknown address reads exactly the same', (await unknown.innerText('main')) === (await page.innerText('main')));
  await unknown.close();

  const link = await linkFor(email, 1);
  check('the emailed link carries the token only after #', /\/reset-password#token=[A-Za-z0-9_-]{43}$/.test(link), link.replace(/token=.*/, 'token=...'));
  const seen = [];
  page.on('request', (r) => seen.push(r.url() + (r.postData() ? '' : '')));
  await page.goto(link);
  await ready(page);
  check('the token leaves the address bar', page.url() === `${origin()}/reset-password`, page.url().replace(/token=.*/, 'token=...'));
  const token = link.split('#token=')[1];
  check('no request address carries the token', !seen.some((u) => u.includes(token)));
  check('the form shows', await visible(page, '#reset-form'));

  await page.reload();
  await ready(page);
  check('a reload keeps working', await visible(page, '#reset-form'));

  await page.fill('#password', 'short');
  await page.fill('#again', 'short');
  await page.click('#submit');
  check('too short is refused here', /at least 8/.test(await page.textContent('#error')));
  await page.fill('#password', NEW);
  await page.fill('#again', `${NEW}x`);
  await page.click('#submit');
  check('two different passwords are refused', /don't match/.test(await page.textContent('#error')));
  await page.fill('#again', NEW);
  await page.click('#submit');
  await page.waitForURL(/\/login\?reset=1/);
  await ready(page);
  check('then sign-in, with next', page.url() === `${origin()}/login?reset=1&next=%2Fprofile`, page.url());
  check('and a line saying it worked', /Your password was changed/.test(await page.textContent('main')));
  check('the link on this page keeps next too', (await page.getAttribute('a:has-text("Forgot password?")', 'href')) === '/forgot-password?next=%2Fprofile');
  check('sessionStorage no longer holds the token', (await page.evaluate(() => window.sessionStorage.getItem('password-reset-token'))) === null);

  await page.fill('#email', email);
  await page.fill('#password', OLD);
  await page.click('#submit');
  await page.waitForSelector('#error:not(.hidden)');
  check('the old password is refused', /do not match/.test(await page.textContent('#error')));
  await page.fill('#password', NEW);
  await page.click('#submit');
  await page.waitForURL(/\/profile/);
  check('the new one signs in and goes on to next', page.url() === `${origin()}/profile`, page.url());

  await other.goto(`${origin()}/api/auth/me`);
  check('the other device is signed out', (await other.textContent('body')).includes('"user":null'));
  await elsewhere.close();

  const again = await browser.newContext();
  const dead = await again.newPage();
  watch(dead);
  await dead.goto(link);
  await ready(dead);
  check('the used link says so, and offers a new one', await visible(dead, '#dead') && !(await visible(dead, '#reset-form')));
  await dead.click('#dead a');
  await ready(dead);
  check('which goes to the forgot page', dead.url() === `${origin()}/forgot-password`);
  await again.close();
  await context.close();
}

async function looks(browser) {
  console.log('\nEvery screen: light, dark, desktop, 375 px');
  let n = 0;
  for (const colorScheme of ['light', 'dark']) {
    for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['375', { width: 375, height: 700 }]]) {
      const context = await browser.newContext({ colorScheme, viewport, hasTouch: label === '375' });
      const page = await context.newPage();
      watch(page);
      const email = `look${n += 1}@example.test`;
      await register(await browser.newContext(), email);
      const shoot = async (screen) => {
        await ready(page);
        const m = await page.evaluate(() => ({
          over: document.documentElement.scrollWidth - window.innerWidth,
          bg: getComputedStyle(document.body).backgroundColor,
          fg: getComputedStyle(document.querySelector('h1')).color,
          buttons: [...document.querySelectorAll('main button, main input:not([type=checkbox])')].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height)),
        }));
        check(`${colorScheme} ${label} ${screen}: no sideways scroll`, m.over <= 0, m.over);
        const dark = (s) => { const [r, g, b] = s.match(/\d+/g).map(Number); return (r + g + b) / 3 < 128; };
        check(`${colorScheme} ${label} ${screen}: ${colorScheme} page, readable heading (${m.bg} / ${m.fg})`, dark(m.bg) === (colorScheme === 'dark') && dark(m.fg) !== dark(m.bg), m);
        if (label === '375') check(`${colorScheme} 375 ${screen}: controls at least 44 px tall (${m.buttons.join(', ') || 'none'})`, m.buttons.every((h) => h >= 44), m.buttons);
        await page.screenshot({ path: path.join(shots, `${colorScheme}-${label}-${screen}.png`) });
      };
      await page.goto(`${origin()}/login`);
      await shoot('login');
      await page.goto(`${origin()}/forgot-password`);
      await shoot('forgot');
      await page.fill('#email', 'x');
      await page.click('#submit');
      await shoot('forgot-error');
      await page.fill('#email', email);
      await page.click('#submit');
      await page.waitForSelector('#sent:not(.hidden)');
      await shoot('sent');
      const link = await linkFor(email, 1);
      await page.goto(link);
      await shoot('reset');
      await page.fill('#password', 'short');
      await page.click('#submit');
      await shoot('reset-error');
      await page.fill('#password', NEW);
      await page.fill('#again', NEW);
      await page.click('#submit');
      await page.waitForURL(/reset=1/);
      await shoot('login-after');
      await page.goto(link);
      await shoot('dead');
      await context.close();
    }
  }
}

async function signinOnly(browser) {
  console.log('\nSign-in only, as testers will see it');
  await start({ BETA_SIGNIN_ONLY: 'on' });
  const context = await browser.newContext({ viewport: { width: 375, height: 700 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(`${origin()}/login`);
  await ready(page);
  check('the link shows; sign-up does not', await visible(page, 'a:has-text("Forgot password?")') && !(await page.locator('a:has-text("Create an account")').count()));
  await page.screenshot({ path: path.join(shots, 'signin-only-login.png') });
  await page.click('a:has-text("Forgot password?")');
  await ready(page);
  check('the forgot page opens logged out', page.url().endsWith('/forgot-password') && await visible(page, '#forgot-form'));
  check('its header offers no sign-up', !(await page.locator('header a[href="/register"]').count()));
  await context.close();
  await stop();
}

async function off(browser) {
  console.log('\nThe switch off');
  await start({ PASSWORD_RESET: undefined });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin()}/login`);
  await ready(page);
  check('no link on the sign-in page', !(await page.locator('text=Forgot').count()));
  await page.screenshot({ path: path.join(shots, 'off-login.png') });
  const res = await page.goto(`${origin()}/forgot-password`);
  check('the forgot page is 404', res.status() === 404);
  const reset = await page.goto(`${origin()}/reset-password`);
  check('the reset page is 404', reset.status() === 404);
  await context.close();
  await stop();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await start();
    await walk(browser);
    await looks(browser);
    await stop();
    await signinOnly(browser);
    await off(browser);
    check('no script errors or blocked scripts on any page', !problems.length, problems.slice(0, 5));
  } finally {
    await browser.close();
    await stop();
  }
  console.log(`\n${passes} passed, ${failures} failed. Screens: ${shots}`);
  if (failures) process.exitCode = 1;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows may hold a file a moment */ }
  process.exit(process.exitCode || 0);
});
