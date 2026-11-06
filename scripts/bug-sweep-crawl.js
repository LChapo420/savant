/**
 * Bug-sweep crawler: loads every page in a REAL Chromium (CDP, no extra deps) and reports console errors,
 * content security policy violations, 4xx/5xx responses, inline scripts and handlers, horizontal overflow,
 * unreadable text (low contrast) and slow loads. NOT part of `npm test`.
 *
 *   node scripts/bug-sweep-crawl.js http://localhost:7471 [persona,...]  (personas: anon,adult,teen,child,admin)
 *
 * Needs a running server on a COPY of the DB (see scripts/learner-walk.js). Writes JSON to $SWEEP_OUT.
 * Viewports per page: desktop light, mobile 375 light, mobile dark.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = (process.argv[2] || 'http://localhost:7471').replace(/\/$/, '');
const PERSONAS = (process.argv[3] || 'anon,adult,teen,child,admin').split(',');
const CHROME = process.env.CHROME || 'C:/Users/admin/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';
const PORT = 9333 + Math.floor(Math.random() * 500);
const STAMP = Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pages() {
  const root = path.join(__dirname, '..', 'public');
  const out = [];
  for (const f of fs.readdirSync(root)) if (f.endsWith('.html') && !/^(offline)/.test(f)) out.push('/' + f);
  out.push('/', '/spanish/');
  return [...new Set(out)];
}

async function api(method, p, body, cookie) {
  const res = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie');
  let payload = {}; try { payload = await res.json(); } catch { /* none */ }
  return { status: res.status, payload, cookie: sc ? sc.split(';')[0] : cookie };
}

async function persona(name) {
  if (name === 'anon') return { cookie: '' };
  const pw = 'Walk-test-pw-9';
  const year = new Date().getFullYear();
  const base = { password: pw, country: 'US', birth_month: 6 };
  let r;
  if (name === 'adult') r = await api('POST', '/api/auth/register', { ...base, email: `sweep-adult-${STAMP}@example.com`, display_name: 'Sweep Adult', birth_year: 1990 });
  if (name === 'teen') r = await api('POST', '/api/auth/register', { ...base, email: `sweep-teen-${STAMP}@example.com`, display_name: 'Sweep Teen', birth_year: year - 15 });
  if (name === 'child') r = await api('POST', '/api/auth/register', { ...base, username: `sweepkid${STAMP}`, parent_email: `sweep-parent-${STAMP}@example.com`, display_name: 'Sweep Kid', birth_year: year - 10 });
  if (name === 'admin') {
    r = await api('POST', '/api/auth/login', { email: 'walk-admin@example.com', password: pw });
    if (r.status === 401) r = await api('POST', '/api/auth/register', { ...base, email: 'walk-admin@example.com', display_name: 'Walk Admin', birth_year: 1990 });
  }
  if (!r || r.status >= 300) throw new Error(`persona ${name}: ${r && r.status} ${JSON.stringify(r && r.payload)}`);
  return { cookie: r.cookie };
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.cb = new Map(); this.ev = []; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) { const c = this.cb.get(d.id); if (c) { this.cb.delete(d.id); d.error ? c.rej(new Error(d.error.message)) : c.res(d.result); } } else this.ev.forEach((f) => f(d)); }; }
  send(method, params = {}, sessionId) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params, sessionId })); return new Promise((res, rej) => this.cb.set(id, { res, rej })); }
  on(f) { this.ev.push(f); return f; }
  off(f) { this.ev = this.ev.filter((x) => x !== f); }
}

const PROBE = `(() => {
  const o = {};
  o.inlineScripts = [...document.querySelectorAll('script:not([src])')].map(s => (s.type||'js')+':'+s.textContent.slice(0,60));
  o.handlers = [...document.querySelectorAll('*')].filter(e => [...e.attributes].some(a => /^on/i.test(a.name))).map(e => e.tagName+'#'+e.id).slice(0,10);
  o.jsHrefs = [...document.querySelectorAll('a[href^="javascript:"]')].length;
  o.overflowX = document.documentElement.scrollWidth - window.innerWidth;
  o.title = document.title;
  o.textLen = document.body ? document.body.innerText.length : 0;
  o.links = [...new Set([...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => h && !h.startsWith('#') && !/^(mailto|tel|javascript):/.test(h)))].slice(0,80);
  o.imgBroken = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src).map(i => i.src).slice(0,5);
  // contrast
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(parseFloat); return { r:p[0], g:p[1], b:p[2], a: p.length>3?p[3]:1 }; };
  const lum = (c) => { const f = (v) => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const bgOf = (el) => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.9) return c; e = e.parentElement; } return {r:255,g:255,b:255,a:1}; };
  const bad = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length) continue;
    const own = [...el.childNodes].filter(n => n.nodeType===3 && n.textContent.trim().length>1);
    if (!own.length) continue;
    const r = el.getBoundingClientRect(); if (r.width<2||r.height<2) continue;
    const cs = getComputedStyle(el); if (cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)<0.1) continue;
    const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight) >= 700);
    if (ratio < (big?2.5:3.0)) { const k = el.tagName+'.'+el.className+cs.color+cs.backgroundColor; if (!seen.has(k)) { seen.add(k); bad.push({ t: own[0].textContent.trim().slice(0,40), sel: el.tagName.toLowerCase()+(el.className?'.'+String(el.className).split(' ')[0]:''), ratio: +ratio.toFixed(2), fg: cs.color, bg: 'rgb('+bg.r+','+bg.g+','+bg.b+')' }); } }
  }
  o.lowContrast = bad.slice(0,8);
  return JSON.stringify(o);
})()`;

let nIssues = 0;
function report(r) {
  const pr = r.probe || {};
  const issues = [];
  r.console.forEach((c) => issues.push('console ' + c));
  r.csp.forEach((c) => issues.push('CSP ' + c));
  r.http.forEach((c) => issues.push('http ' + c));
  r.failed.forEach((c) => issues.push('netfail ' + c));
  if (pr.inlineScripts && pr.inlineScripts.length) issues.push('inline script ' + pr.inlineScripts.join('|'));
  if (pr.handlers && pr.handlers.length) issues.push('inline handler ' + pr.handlers.join(','));
  if (pr.jsHrefs) issues.push('javascript: href x' + pr.jsHrefs);
  if (pr.overflowX > 2) issues.push('overflowX ' + pr.overflowX);
  if (pr.imgBroken && pr.imgBroken.length) issues.push('broken img ' + pr.imgBroken.join(','));
  if (pr.lowContrast && pr.lowContrast.length) issues.push('contrast ' + pr.lowContrast.map((c) => `${c.sel}"${c.t}" ${c.ratio} ${c.fg} on ${c.bg}`).join(' ; '));
  if (r.loadMs > 3000) issues.push('slow ' + r.loadMs + 'ms');
  if (r.error) issues.push('error ' + r.error);
  if (issues.length) { nIssues++; console.log(`[${r.persona}/${r.viewport}] ${r.url}${r.finalUrl && r.finalUrl.split('?')[0] !== r.url ? ' -> ' + r.finalUrl : ''}`); issues.forEach((x) => console.log('   ' + x)); }
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
  const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 40; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; break; } catch { await sleep(250); } }
  if (!wsUrl) throw new Error('chrome did not start');
  const ws = new WebSocket(wsUrl); await new Promise((r) => { ws.onopen = r; });
  const cdp = new Cdp(ws);
  const results = [];
  const list = pages();
  const host = new URL(BASE).hostname;

  for (const pname of PERSONAS) {
    let p; try { p = await persona(pname); } catch (e) { results.push({ persona: pname, error: String(e.message) }); console.log('PERSONA FAIL ' + pname + ': ' + e.message); continue; }
    const { browserContextId } = await cdp.send('Target.createBrowserContext');
    for (const vp of [{ n: 'desktop', w: 1280, h: 800, dark: false }, { n: 'mobile', w: 375, h: 812, dark: false }, { n: 'mobile-dark', w: 375, h: 812, dark: true }]) {
      if (!['adult', 'anon', 'admin'].includes(pname) && vp.n !== 'desktop') continue; // full viewport matrix for three personas
      const queue = [...list];
      const worker = async () => { for (let url; (url = queue.shift());) {
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        const S = (m, pr) => cdp.send(m, pr, sessionId);
        const rec = { persona: pname, viewport: vp.n, url, console: [], csp: [], http: [], failed: [] };
        const reqs = new Map();
        const handler = cdp.on((d) => {
          if (d.sessionId !== sessionId) return;
          const { method, params } = d;
          if (method === 'Runtime.exceptionThrown') rec.console.push('EXC ' + (params.exceptionDetails.exception && params.exceptionDetails.exception.description || params.exceptionDetails.text).slice(0, 200));
          if (method === 'Runtime.consoleAPICalled' && (params.type === 'error')) rec.console.push('ERR ' + params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200));
          if (method === 'Log.entryAdded') { const e = params.entry; const t = `${e.level}/${e.source}: ${e.text} ${e.url || ''}`.slice(0, 220); if (/Content Security Policy|Refused to/i.test(e.text)) rec.csp.push(t); else if (e.level === 'error' && !/status of (4|5)\d\d/.test(e.text)) rec.console.push('LOG ' + t); }
          if (method === 'Network.requestWillBeSent') reqs.set(params.requestId, params.request.url);
          if (method === 'Network.responseReceived' && params.response.status >= 400) rec.http.push(`${params.response.status} ${params.response.url.replace(BASE, '')}`);
          if (method === 'Network.loadingFailed' && !params.canceled) rec.failed.push(`${params.errorText} ${(reqs.get(params.requestId) || '').replace(BASE, '')}`);
        });
        await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable'); await S('Network.enable');
        await S('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.w < 500 });
        await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: vp.dark ? 'dark' : 'light' }] });
        if (p.cookie) { const [n, ...v] = p.cookie.split('='); await S('Network.setCookie', { name: n, value: v.join('='), domain: host, path: '/' }); }
        const t0 = Date.now();
        try {
          await S('Page.navigate', { url: BASE + url });
          for (let i = 0; i < 60; i++) { const r = await S('Runtime.evaluate', { expression: 'document.readyState' }); if (r.result.value === 'complete') break; await sleep(150); }
          rec.loadMs = Date.now() - t0;
          await sleep(1300);
          // A page that redirects (signed out to /login) can swap documents under the probe: wait and try again.
          for (let attempt = 0; attempt < 4 && !rec.probe; attempt++) {
            try {
              const r = await S('Runtime.evaluate', { expression: PROBE, returnByValue: true });
              rec.probe = JSON.parse(r.result.value);
              rec.finalUrl = (await S('Runtime.evaluate', { expression: 'location.pathname+location.search' })).result.value;
            } catch (e) { if (attempt === 3) throw e; await sleep(1200); }
          }
        } catch (e) { rec.error = String(e.message); }
        cdp.off(handler);
        results.push(rec);
        report(rec);
        await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
      } };
      await Promise.all([worker(), worker(), worker(), worker()]);
    }
  }
  fs.writeFileSync(process.env.SWEEP_OUT || path.join(os.tmpdir(), 'sweep-out.json'), JSON.stringify(results, null, 1));
  ws.close(); chrome.kill();

  console.log(`
${results.length} page loads, ${nIssues} with issues`);
}
main().catch((e) => { console.error(e); process.exit(1); });
