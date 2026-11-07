/**
 * The new app structure (docs/UI-V2.md): "One next thing", behind UI_V2=on, off by default.
 *
 * Off, this file does nothing: the middleware calls next() before reading anything, so every page comes from express.static exactly as before.
 *
 * On, the signed-in app pages listed below get a few things added to their HTML as it is served, and nothing else changes:
 *   - data-ui2="on" on <html>, which the stylesheets key on
 *   - css/ui2/tokens.css, css/ui2/look.css, css/ui2/app.css, css/ui2/pages.css and js/ui2/boot.js, last in <head>, so they restyle what is there
 *   - the original giraffe (js/start-tutor.js), js/ui2/look.js and js/ui2/shell.js and js/ui2/pages.js right after js/app.js (shell.js rearranges the header, pages.js the later pages), and js/ui2/home.js before js/dashboard.js on Home
 * No page's logic, API, gating, consent rule, scoring, player or fact-check path is edited: the existing scripts still draw the page, and the new ones move and restyle it.
 *
 * The onboarding at /start has its own additions (css/ui2/start.css, js/ui2/start.js). Its script keeps its internals to itself, so with the flag on /js/start.js is served with a few
 * small hooks added (patchStart). They are exact-string replacements, each checked: if public/js/start.js changes under one, scripts/ui-v2-test.js fails. Off, the file is served as it is on disk.
 *
 * Left out on purpose: public pages (landing, sign-in, privacy), the sealed Spanish tests, and admin and owner tools.
 */
const fs = require('fs');
const path = require('path');

const enabled = () => /^(1|on|true)$/i.test(String(process.env.UI_V2 || ''));

const PAGES = new Set([
  'dashboard', 'session', 'base-lesson', 'review', 'path', 'profile', 'calendar', 'catchup', 'enforcer', 'held', 'help', 'boosters', 'baseline', 'daily-check',
  'curriculum', 'onboarding', 'placement', 'reading-check', 'skill-check', 'skill-practice', 'skip', 'stage-check', 'stage-left', 'style-quiz', 'subject-placement', 'survey',
  'my-material', 'my-material-cards', 'my-material-notes', 'my-material-pack', 'my-material-podcast', 'my-material-study', 'my-material-test',
]);

/** First in <head> on /start and every app page: a page that finds itself signed out goes to sign-in rather than show the new-account refusal (js/ui2/signed-out.js). */
const SIGNED_OUT = '<script src="/js/ui2/signed-out.js"></script>';

/** A page's HTML with the three additions. Pure, so the test can check it without a server. */
function inject(html, page) {
  let out = html
    .replace(/<html\b/, '<html data-ui2="on"')
    .replace('</head>', `  <link rel="stylesheet" href="/css/ui2/tokens.css">\n  <link rel="stylesheet" href="/css/ui2/look.css">\n  <link rel="stylesheet" href="/css/ui2/app.css">\n  <link rel="stylesheet" href="/css/ui2/pages.css">\n  ${SIGNED_OUT}\n  <script src="/js/ui2/boot.js"></script>\n</head>`)
    .replace('<script src="/js/app.js"></script>', '<script src="/js/app.js"></script>\n  <script src="/js/start-tutor.js"></script>\n  <script src="/js/ui2/look.js"></script>\n  <script src="/js/ui2/shell.js"></script>\n  <script src="/js/ui2/pages.js"></script>');
  if (page === 'dashboard') out = out.replace('<script src="/js/dashboard.js"></script>', '<script src="/js/ui2/home.js"></script>\n  <script src="/js/dashboard.js"></script>');
  return out;
}

/** /start's HTML with the look's additions. js/ui2/start.js goes first, so it is there when js/start.js runs. */
function injectStart(html) {
  return html
    .replace(/<html\b/, `<html data-ui2="on" data-welcome="${welcome()}"`)
    .replace('</head>', `  <link rel="stylesheet" href="/css/ui2/tokens.css">\n  <link rel="stylesheet" href="/css/ui2/look.css">\n  <link rel="stylesheet" href="/css/ui2/start.css">\n  <link rel="stylesheet" href="/css/ui2/welcome.css">\n  ${SIGNED_OUT}\n  <script src="/js/ui2/look.js"></script>\n  <script src="/js/ui2/welcome.js"></script>\n  <script src="/js/ui2/start.js"></script>\n</head>`);
}

/** /start's first screen: UI_V2_WELCOME picks one of js/ui2/welcome.js's designs, each with its block in css/ui2/welcome.css. "card" (H, the owner's pick) unless set. */
const WELCOMES = ['card', 'giraffe'];
function welcome() {
  const asked = String(process.env.UI_V2_WELCOME || '').trim().toLowerCase();
  return WELCOMES.includes(asked) ? asked : 'card';
}

/** The hooks js/ui2/start.js needs in /js/start.js. Every "from" must be in the file exactly once. */
const START_HOOKS = [
  ['    const safe = guard(step);', '    const safe = window.ObLook ? window.ObLook.guard(step, guard) : guard(step);'],
  ["    const h = $('h1', panel);", "    if (window.ObLook) window.ObLook.rendered(step);\n    const h = $('h1', panel);"],
  ['  boot();\n}());', `  if (window.ObLook) {
    window.ObLook.install({
      STEPS, ORDER, FILL, C, I, opt, head, esc, marked, $, $$, api, go, say, ready, keep, forget, isChild, signedIn, hasRow, notesOnly, saveAnswers,
      get S() { return S; }, get server() { return server; }, get view() { return view; }, get current() { return current; },
    });
  }
  boot();
}());`],
];
function patchStart(src) {
  let out = src.replace(/\r\n/g, '\n');
  for (const [from, to] of START_HOOKS) {
    if (out.split(from).length !== 2) throw new Error(`ui-v2: /js/start.js has changed, this hook no longer fits: ${from}`);
    out = out.replace(from, () => to);
  }
  return out;
}

/** /offline.html with the look. It has to work with no network, so everything it needs goes in the service worker's list (patchWorker). */
const OFFLINE_FILES = ['/css/ui2/tokens.css', '/css/styles/chunky.css', '/css/ui2/look.css', '/css/ui2/pages.css', '/js/style-boot.js', '/js/ui2/boot.js', '/js/start-tutor.js', '/js/ui2/look.js', '/js/ui2/offline.js'];
function injectOffline(html) {
  return html
    .replace(/<html\b/, '<html data-ui2="on" data-ui2-page="offline"')
    .replace('</head>', '  <script src="/js/style-boot.js"></script>\n  <link rel="stylesheet" href="/css/ui2/tokens.css">\n  <link rel="stylesheet" href="/css/ui2/look.css">\n  <link rel="stylesheet" href="/css/ui2/pages.css">\n  <script src="/js/ui2/boot.js"></script>\n  <script src="/js/start-tutor.js"></script>\n  <script src="/js/ui2/look.js"></script>\n  <script src="/js/ui2/offline.js"></script>\n</head>');
}
/** /sw.js with the offline page's files in its list. One exact-string hook, checked by scripts/ui-v2-test.js. */
function patchWorker(src) {
  const from = "const SHELL = ['/offline.html',";
  if (src.split(from).length !== 2) throw new Error('ui-v2: /sw.js has changed, its hook no longer fits');
  return src.replace(from, () => `${from} ${OFFLINE_FILES.map((f) => `'${f}'`).join(', ')},`);
}
/** The not-found page, as the 404 at the end of server.js sends it: with the flag off, the file. */
function sendNotFound(res, file) {
  if (!enabled()) return res.status(404).sendFile(file);
  return fs.readFile(file, 'utf8', (err, html) => {
    if (err) return res.status(404).sendFile(file);
    return res.status(404).type('html').send(inject(html, 'not-found').replace('<html data-ui2="on"', '<html data-ui2="on" data-ui2-page="not-found"'));
  });
}

function pageOf(urlPath) {
  const m = /^\/([a-z-]+)(?:\.html)?$/.exec(urlPath);
  return m && PAGES.has(m[1]) ? m[1] : null;
}

const PUBLIC = path.join(__dirname, '..', 'public');
function middleware(req, res, next) {
  if (!enabled() || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
  if (req.path === '/start' || req.path === '/start.html') {
    return fs.readFile(path.join(PUBLIC, 'start.html'), 'utf8', (err, html) => {
      if (err) return next();
      res.setHeader('Cache-Control', 'no-cache');
      return res.type('html').send(injectStart(html));
    });
  }
  if (req.path === '/js/start.js') {
    return fs.readFile(path.join(PUBLIC, 'js', 'start.js'), 'utf8', (err, src) => {
      if (err) return next();
      res.setHeader('Cache-Control', 'no-cache');
      return res.type('application/javascript').send(patchStart(src));
    });
  }
  if (req.path === '/offline.html') {
    return fs.readFile(path.join(PUBLIC, 'offline.html'), 'utf8', (err, html) => {
      if (err) return next();
      res.setHeader('Cache-Control', 'no-cache');
      return res.type('html').send(injectOffline(html));
    });
  }
  if (req.path === '/sw.js') {
    return fs.readFile(path.join(PUBLIC, 'sw.js'), 'utf8', (err, src) => {
      if (err) return next();
      res.setHeader('Cache-Control', 'no-cache');
      return res.type('application/javascript').send(patchWorker(src));
    });
  }
  const page = pageOf(req.path);
  if (!page) return next();
  return fs.readFile(path.join(PUBLIC, `${page}.html`), 'utf8', (err, html) => {
    if (err) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.type('html').send(inject(html, page));
  });
}

module.exports = { enabled, welcome, WELCOMES, inject, injectStart, patchStart, injectOffline, patchWorker, sendNotFound, pageOf, middleware, PAGES };
