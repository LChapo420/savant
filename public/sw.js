/* Savant service worker: an offline shell, nothing more.
 *
 * It keeps only public static files (the stylesheet, scripts, typefaces, icons and /offline.html), so it
 * holds no learner data. It never touches /api, never a non-GET request, never another origin, and
 * never stores an HTML page other than /offline.html. Static files are fetched from the network first
 * (a deploy is seen at once) and the stored copy is used only when the network fails. A page opened with
 * no network shows /offline.html.
 */
const VERSION = 'savant-shell-v1';
const SHELL = ['/offline.html', '/css/style.css', '/fonts/fonts.css', '/js/app.js', '/js/offline.js', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return /^\/(css|js|fonts|icons)\//.test(url.pathname) || url.pathname === '/favicon.svg';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/spanish-media/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error())),
    );
  }
});
