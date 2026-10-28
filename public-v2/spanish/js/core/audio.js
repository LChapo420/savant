/* Spoken audio: each line is rendered once by the server (MiMo voices, cached
 * as files) and played from there. If the server cannot speak, the browser's own
 * Spanish voice takes over so a level never goes silent.
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

  function browserSay(text, slow) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      const v = speechSynthesis.getVoices().find((x) => /^es(-|_)/i.test(x.lang));
      if (v) u.voice = v;
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
  ES.audio = audio;
})();
