/* Small DOM + API helpers for the Spanish pages. */
(function () {
  const ES = (window.ES = window.ES || {});

  ES.$ = (s, root = document) => root.querySelector(s);
  ES.$$ = (s, root = document) => [...root.querySelectorAll(s)];
  ES.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  ES.h = (tag, attrs = {}, html) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    if (html != null) el.innerHTML = html;
    return el;
  };
  ES.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  ES.shuffle = (a) => {
    const arr = [...a];
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  ES.uid = () => Math.random().toString(36).slice(2, 10);
  ES.fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  async function request(method, url, body, raw) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (raw) { opts.body = raw.body; opts.headers['Content-Type'] = raw.type; }
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(url, opts);
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) {
      const err = new Error((json && json.error) || `Request failed (${res.status})`);
      err.status = res.status; err.payload = json;
      throw err;
    }
    return json;
  }
  ES.api = {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    raw: (url, blob, type) => request('POST', url, undefined, { body: blob, type }),
  };

  // Theme: the learner's choice (system / light / dark), shared across pages.
  try {
    const t = localStorage.getItem('es-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch { /* storage blocked */ }
})();
