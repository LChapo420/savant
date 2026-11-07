/* The browser-voice fallback in public/spanish/js/core/audio.js must never read
 * Spanish in a non-Spanish voice. With no Spanish voice installed it speaks
 * nothing and shows a retry notice instead; with one it speaks in that voice. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'spanish', 'js', 'core', 'audio.js'), 'utf8');
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

function run(voices, storage, clock) {
  const spoken = []; const notices = []; let posts = 0; let made = 0;
  const host = { insertBefore: (n) => notices.push(n), firstChild: null };
  const doc = {
    getElementById: () => host,
    body: host,
    querySelector: (sel) => (sel === '.es-audio-notice' ? notices[0] || null : null),
    createElement: () => {
      made += 1;
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
  const ctx = vm.createContext({ ...(storage ? { sessionStorage: storage } : {}), window: win, document: doc, Date: clock ? { now: () => clock.t } : Date, Promise, setTimeout, URL: {}, Uint8Array, atob, speechSynthesis: win.speechSynthesis, SpeechSynthesisUtterance: win.SpeechSynthesisUtterance, Audio: win.Audio });
  vm.runInContext(src, ctx);
  return { audio: win.ES.audio, spoken, notices, posts: () => posts, made: () => made };
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

  // With no audio every exercise tries to speak, and each new exercise replaces the lesson body, the notice with it.
  const repeat = run([{ name: 'Microsoft David', lang: 'en-US' }]);
  await repeat.audio.say('hola');
  check('one exercise: the notice shows', repeat.made() === 1);
  repeat.notices.length = 0;
  await repeat.audio.say('adios');
  repeat.notices.length = 0;
  await repeat.audio.say('gracias');
  check('the next exercises: it does not come back', repeat.made() === 1 && repeat.notices.length === 0);
  // The usual case on a real page: the lesson body stays, the notice stays in it, and the next exercise speaks its own line.
  const clock = { t: 1000 };
  const stays = run([{ name: 'Microsoft David', lang: 'en-US' }], undefined, clock);
  await stays.audio.say('hola');
  await stays.audio.say('hola');
  check('a replay of the same line: it stays', stays.notices.length === 1);
  clock.t += 1000;
  await stays.audio.say('adios');
  check('a second line on the same screen, at once: it stays long enough to read', stays.notices.length === 1);
  clock.t += 4000;
  await stays.audio.say('gracias');
  check('the next exercise: it is gone', stays.notices.length === 0 && stays.made() === 1);
  clock.t += 4000;
  await stays.audio.say('por favor');
  check('and it stays gone', stays.notices.length === 0 && stays.made() === 1);
  const storage = {};
  const tab = { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = v; } };
  const first = run([{ name: 'Microsoft David', lang: 'en-US' }], tab);
  await first.audio.say('hola');
  const nextPage = run([{ name: 'Microsoft David', lang: 'en-US' }], tab);
  await nextPage.audio.say('hola');
  check('the next page in the same tab: it does not come back', first.made() === 1 && nextPage.made() === 0);
  const noStore = run([{ name: 'Microsoft David', lang: 'en-US' }], { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  await noStore.audio.say('hola');
  noStore.notices.length = 0;
  await noStore.audio.say('adios');
  check('browser storage blocked: still once on this page, and no error', noStore.made() === 1 && noStore.notices.length === 0);
  const silent = run([{ name: 'Microsoft David', lang: 'en-US' }]);
  await silent.audio.say('hola');
  await silent.notices[0]._l.click();
  await new Promise((r) => setTimeout(r, 20));
  check('a retry that also fails stays quiet', silent.made() === 1 && silent.notices.length === 0);
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'screens', 'activities.css'), 'utf8');
  const rule = css.slice(css.indexOf('.es-audio-notice {'), css.indexOf('}', css.indexOf('.es-audio-notice {')));
  check('it looks like a quiet note, not an alert: muted, thin border, no gold or bold', /--es-text-muted/.test(rule) && /border: 1px/.test(rule) && !/gold/.test(rule) && /--es-weight-base/.test(rule));

  const es = run([{ name: 'Paulina', lang: 'es-MX' }, { name: 'David', lang: 'en-US' }]);
  await es.audio.say('hola');
  check('Spanish voice: spoken once in that voice', es.spoken.length === 1 && es.spoken[0].voice.lang === 'es-MX');
  check('Spanish voice: no notice', es.notices.length === 0);
  if (failed) process.exit(1);
})();
