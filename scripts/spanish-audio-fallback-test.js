/* The browser-voice fallback in public/spanish/js/core/audio.js must never read
 * Spanish in a non-Spanish voice. With no Spanish voice installed it speaks
 * nothing and shows a retry notice instead; with one it speaks in that voice. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'spanish', 'js', 'core', 'audio.js'), 'utf8');
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

function run(voices) {
  const spoken = []; const notices = []; let posts = 0;
  const host = { insertBefore: (n) => notices.push(n), firstChild: null };
  const doc = {
    getElementById: () => host,
    body: host,
    querySelector: (sel) => (sel === '.es-audio-notice' ? notices[0] || null : null),
    createElement: () => {
      const n = { className: '', _l: {}, setAttribute() {}, addEventListener(e, f) { this._l[e] = f; }, remove() { notices.length = 0; } };
      return n;
    },
  };
  const win = {
    ES: { api: { post: async () => { posts++; const e = new Error('off'); e.status = 503; throw e; } } },
    speechSynthesis: { getVoices: () => voices, cancel() {}, speak(u) { spoken.push(u); setTimeout(() => u.onend && u.onend(), 0); } },
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    Audio: function () {},
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, document: doc, Date, Promise, setTimeout, URL: {}, Uint8Array, atob, speechSynthesis: win.speechSynthesis, SpeechSynthesisUtterance: win.SpeechSynthesisUtterance, Audio: win.Audio });
  vm.runInContext(src, ctx);
  return { audio: win.ES.audio, spoken, notices, posts: () => posts };
}

(async () => {
  const none = run([{ name: 'Microsoft David', lang: 'en-US' }]);
  await none.audio.say('hola');
  check('no Spanish voice: nothing is spoken', none.spoken.length === 0);
  check('no Spanish voice: a retry notice is shown', none.notices.length === 1);
  const before = none.posts();
  await none.notices[0]._l.click();
  await new Promise((r) => setTimeout(r, 20));
  check('tapping the notice retries the server audio', none.posts() > before);

  const es = run([{ name: 'Paulina', lang: 'es-MX' }, { name: 'David', lang: 'en-US' }]);
  await es.audio.say('hola');
  check('Spanish voice: spoken once in that voice', es.spoken.length === 1 && es.spoken[0].voice.lang === 'es-MX');
  check('Spanish voice: no notice', es.notices.length === 0);
  if (failed) process.exit(1);
})();
