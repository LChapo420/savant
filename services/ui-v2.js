/**
 * The new app structure (docs/UI-V2.md): "One next thing", behind UI_V2=on, off by default.
 *
 * Off, this file does nothing: the middleware calls next() before reading anything, so every page comes from express.static exactly as before.
 *
 * On, the signed-in app pages listed below get a few things added to their HTML as it is served, and nothing else changes:
 *   - data-ui2="on" on <html>, which the stylesheets key on
 *   - css/ui2/tokens.css, css/ui2/app.css and js/ui2/boot.js, last in <head>, so they restyle what is there
 *   - js/ui2/shell.js right after js/app.js (it rearranges the header), and js/ui2/home.js before js/dashboard.js on Home
 * No page's logic, API, gating, consent rule, scoring, player or fact-check path is edited: the existing scripts still draw the page, and the new ones move and restyle it.
 *
 * Left out on purpose: public pages (landing, sign-in, /start, privacy), the sealed Spanish tests, and admin and owner tools.
 */
const fs = require('fs');
const path = require('path');

const enabled = () => /^(1|on|true)$/i.test(String(process.env.UI_V2 || ''));

const PAGES = new Set([
  'dashboard', 'session', 'base-lesson', 'review', 'path', 'profile', 'calendar', 'catchup', 'enforcer', 'held', 'help', 'boosters', 'baseline', 'daily-check',
  'curriculum', 'onboarding', 'placement', 'reading-check', 'skill-check', 'skill-practice', 'skip', 'stage-check', 'stage-left', 'style-quiz', 'subject-placement', 'survey',
  'my-material', 'my-material-cards', 'my-material-notes', 'my-material-pack', 'my-material-podcast', 'my-material-study', 'my-material-test',
]);

/** A page's HTML with the three additions. Pure, so the test can check it without a server. */
function inject(html, page) {
  let out = html
    .replace(/<html\b/, '<html data-ui2="on"')
    .replace('</head>', '  <link rel="stylesheet" href="/css/ui2/tokens.css">\n  <link rel="stylesheet" href="/css/ui2/app.css">\n  <script src="/js/ui2/boot.js"></script>\n</head>')
    .replace('<script src="/js/app.js"></script>', '<script src="/js/app.js"></script>\n  <script src="/js/ui2/shell.js"></script>');
  if (page === 'dashboard') out = out.replace('<script src="/js/dashboard.js"></script>', '<script src="/js/ui2/home.js"></script>\n  <script src="/js/dashboard.js"></script>');
  return out;
}

function pageOf(urlPath) {
  const m = /^\/([a-z-]+)(?:\.html)?$/.exec(urlPath);
  return m && PAGES.has(m[1]) ? m[1] : null;
}

const PUBLIC = path.join(__dirname, '..', 'public');
function middleware(req, res, next) {
  if (!enabled() || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
  const page = pageOf(req.path);
  if (!page) return next();
  return fs.readFile(path.join(PUBLIC, `${page}.html`), 'utf8', (err, html) => {
    if (err) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.type('html').send(inject(html, page));
  });
}

module.exports = { enabled, inject, pageOf, middleware, PAGES };
