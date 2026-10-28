/* Spoken audio: each line is rendered once by the server (services/spanish/voice.js:
 * ElevenLabs eleven-v3 through the LLM Gateway for the accounts on its list,
 * Gemini otherwise; cached as files) and played from there. If the server cannot
 * speak, the browser's own Spanish voice takes over so a level never goes silent.
 * A page that already knows the server has no voice for this account calls
 * ES.audio.setServer(false) and every line goes straight to the browser voice.
 *
 * ES.audio.say(text, { voice, slow, char })  -> Promise, resolves when finished
 * ES.audio.warm([{ text, voice }])           -> pre-render a level's lines
 * ES.audio.stop()
 */
(function () {
  const ES = window.ES;
  const urls = new Map();      // key -> Promise<url|null>
  let current = null;          // { el, done, charEl }
  let serverOffUntil = 0;      // after the server says it cannot speak, use the browser voice for a while
  const audio = { rate: 1 };

  const key = (text, voice, slow) => `${voice}|${slow ? 1 : 0}|${text}`;

  function render(text, voice = 'narrator', slow = false) {
    const k = key(text, voice, slow);
    if (!urls.has(k)) {
      if (Date.now() < serverOffUntil) return Promise.resolve(null);  // not cached: try the server again later
      const p = ES.api.post('/api/es/tts', { text, voice })
        .then((r) => r.url)
        .catch((err) => { if (err.status === 503) serverOffUntil = Date.now() + 30000; urls.delete(k); return null; });
      urls.set(k, p);
    }
    return urls.get(k);
  }

  function talk(charEl, on) {
    if (charEl) charEl.dataset.talking = on ? 'true' : 'false';
  }

  // Voices load late in some browsers (Chrome fills the list after a
  // voiceschanged event), so the Spanish voice is looked up when it is needed.
  function spanishVoice() {
    const all = ('speechSynthesis' in window && speechSynthesis.getVoices()) || [];
    const es = all.filter((x) => /^es(-|_|$)/i.test(x.lang));
    return es.find((x) => /es[-_](MX|US|419)/i.test(x.lang)) || es.find((x) => /es[-_]ES/i.test(x.lang)) || es[0] || null;
  }
  function voicesReady() {
    if (!('speechSynthesis' in window) || speechSynthesis.getVoices().length) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { speechSynthesis.removeEventListener && speechSynthesis.removeEventListener('voiceschanged', done); resolve(); };
      if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', done);
      setTimeout(done, 700);
    });
  }
  audio.browserVoice = () => { const v = spanishVoice(); return v ? `${v.name} (${v.lang})` : null; };

  async function browserSay(text, slow) {
    await voicesReady();
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      const v = spanishVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = slow ? 0.65 : 0.95;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
      setTimeout(resolve, 2000 + text.length * 160); // never hang a lesson on a stuck voice
    });
  }

  audio.stop = function stop() {
    if (current) {
      current.el && current.el.pause();
      talk(current.charEl, false);
      current.done && current.done();
      current = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  };

  audio.say = async function say(text, opts = {}) {
    const { voice = 'narrator', slow = false, char = null } = opts;
    if (!text) return;
    audio.stop();
    // One clip per line; slow playback is the same clip played at 0.7x.
    const url = await render(text, voice, false);
    talk(char, true);
    try {
      if (!url) { await browserSay(text, slow); return; }
      await new Promise((resolve) => {
        const el = new Audio(url);
        el.playbackRate = slow ? 0.7 : 1;
        if ('preservesPitch' in el) el.preservesPitch = true;
        current = { el, charEl: char, done: resolve };
        el.onended = el.onerror = () => resolve();
        el.play().catch(() => browserSay(text, slow).then(resolve));
      });
    } finally {
      talk(char, false);
      if (current && current.charEl === char) current = null;
    }
  };

  // Render a level's lines ahead of time, three at a time, so the first play
  // of each line is instant.
  audio.warm = async function warm(lines) {
    const queue = lines.filter((l) => l && l.text);
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const l = queue.shift();
        await render(l.text, l.voice || 'narrator', false);
      }
    });
    await Promise.all(workers);
  };

  audio.serverVoice = () => Date.now() >= serverOffUntil;
  /** The page knows whether the server speaks for this account: false skips it for the visit. */
  audio.setServer = (on) => { serverOffUntil = on ? 0 : Number.MAX_SAFE_INTEGER; };
  /**
   * Call from a tap: phones only let a page speak after a user gesture, and a
   * lesson's first line autoplays a moment after the screen changes.
   */
  audio.unlock = () => {
    try {
      if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
      // An empty WAV from a blob: URL (the page's CSP allows media from 'self' and blob:, not data:).
      const wav = Uint8Array.from(atob('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='), (c) => c.charCodeAt(0));
      const src = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const a = new Audio(src); a.volume = 0;
      a.play().catch(() => {}).finally(() => URL.revokeObjectURL(src));
    } catch (e) { /* nothing to unlock */ }
  };
  ES.audio = audio;
})();
