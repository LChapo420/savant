/* A podcast from your own material: a two-host script the browser reads aloud with its own voices.
 * No audio is made or stored by Savant and no voice service is called; the script is text from /api/materials/:id/podcast. */
(function (root) {
  const WORDS_PER_SECOND = 2.6; // a spoken pace at speed 1, used only to size "back 15 seconds"

  /** The turn to go back to for `seconds` of listening at `rate`, counted from the start of `index`. */
  function backTarget(turns, index, seconds, rate) {
    let budget = seconds * WORDS_PER_SECOND * (rate || 1);
    let i = Math.max(0, Math.min(index, turns.length - 1));
    while (i > 0 && budget > 0) { i--; budget -= String(turns[i].text).split(/\s+/).length; }
    return i;
  }
  function minutesOf(turns, rate) {
    const words = turns.reduce((n, t) => n + String(t.text).split(/\s+/).length, 0);
    return Math.max(1, Math.round(words / WORDS_PER_SECOND / (rate || 1) / 60));
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { backTarget, minutesOf }; }
  if (typeof window === 'undefined' || typeof App === 'undefined') return;

  App.mount(async () => {
    const user = await App.currentUser({ require: true });
    if (!user) return;
    App.header(user, 'profile');
    const rootEl = document.getElementById('root');
    const esc = App.escapeHtml;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const base = `/api/materials/${encodeURIComponent(id)}/podcast`;
    const synth = window.speechSynthesis || null;
    let kind = params.get('kind') === 'weak' ? 'weak' : 'overview';
    let data = null;
    let pos = 0;           // the turn being (or about to be) spoken
    let playing = false;
    let rate = 1;
    let token = 0;         // bumps on every seek so a late "end" event from an old utterance is ignored
    let voices = null;

    const NAMES = { overview: 'Overview of the whole material', weak: 'Your weak spots' };
    const fail = (err) => { rootEl.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div><p><a href="/my-material">Back to my material</a></p>`; };
    const episode = () => (data ? data[kind] : null);

    async function load() {
      try { data = await App.api.get(base); } catch (err) { return fail(err); }
      const ep = episode();
      if (ep && ep.status === 'building') { render(); setTimeout(load, 4000); return; }
      render();
    }

    async function start() {
      try { await App.api.post(base, { kind }); } catch (err) { App.toast(err.message, 'error'); return; }
      data[kind] = { status: 'building', turns: [], skills: [] };
      render();
      setTimeout(load, 3000);
    }

    // Two different voices when the device has them; otherwise one voice with a different pitch.
    function pickVoices() {
      if (voices) return voices;
      const all = synth ? synth.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
      voices = { A: all[0] || null, B: all.find((v) => v !== all[0] && v.name !== (all[0] && all[0].name)) || all[0] || null, split: all.length > 1 };
      return voices;
    }

    function stop() { token++; if (synth) synth.cancel(); }

    function speak() {
      const ep = episode();
      if (!synth || !ep || pos >= ep.turns.length) { playing = false; if (ep && pos >= ep.turns.length) pos = 0; paint(); return; }
      const t = ep.turns[pos];
      const my = ++token;
      const v = pickVoices();
      const u = new SpeechSynthesisUtterance(t.text);
      u.rate = rate;
      const voice = v[t.host];
      if (voice) u.voice = voice;
      if (!v.split) u.pitch = t.host === 'A' ? 0.9 : 1.2;
      u.onend = () => { if (my !== token || !playing) return; pos++; speak(); };
      u.onerror = () => { if (my === token) { playing = false; paint(); } };
      paint();
      synth.speak(u);
    }

    function play() { if (!synth) return; playing = true; stop(); speak(); }
    function pause() { playing = false; stop(); paint(); }
    function seek(to) {
      const ep = episode();
      pos = Math.max(0, Math.min(ep.turns.length - 1, to));
      if (playing) { stop(); speak(); } else paint();
    }

    function paint() {
      const ep = episode();
      if (!ep || !ep.turns) return;
      const btn = document.getElementById('pp');
      if (btn) { btn.textContent = playing ? 'Pause' : 'Play'; btn.setAttribute('aria-pressed', String(playing)); }
      const info = document.getElementById('pos');
      if (info) info.textContent = `Part ${pos + 1} of ${ep.turns.length}`;
      document.querySelectorAll('[data-turn]').forEach((el) => {
        const on = Number(el.dataset.turn) === pos;
        el.classList.toggle('is-now', on);
        el.style.fontWeight = on ? '600' : '';
        if (on && playing && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      });
    }

    function render() {
      const ep = episode();
      const tabs = ['overview', 'weak'].map((k) => `<button type="button" class="btn btn-sm${k === kind ? ' btn-primary' : ''}" data-kind="${k}" aria-pressed="${k === kind}">${k === 'overview' ? 'Overview' : 'My weak spots'}</button>`).join('');
      let body;
      if (ep && ep.status === 'building') {
        body = '<div class="loading"><span class="spinner"></span>Writing the script. You can leave this page.</div>';
      } else if (ep && ep.status === 'ready') {
        const t = require_(ep);
        body = `${synth ? '' : '<div class="notice notice-error">This browser cannot read aloud. You can still read the script.</div>'}
          <div class="card" id="player">
            <p class="small muted">${esc(NAMES[kind])}${ep.skills && ep.skills.length ? `: ${ep.skills.map((s) => esc(s.title)).join(', ')}` : ''} · about ${t} min</p>
            <div class="row-wrap" style="gap:8px;align-items:center">
              <button type="button" class="btn btn-primary" id="pp" aria-pressed="false"${synth ? '' : ' disabled'}>Play</button>
              <button type="button" class="btn btn-sm" id="back15"${synth ? '' : ' disabled'} aria-label="Back 15 seconds">Back 15s</button>
              <button type="button" class="btn btn-sm" id="skip"${synth ? '' : ' disabled'} aria-label="Skip to the next part">Skip</button>
              <label class="small" style="display:flex;gap:6px;align-items:center">Speed
                <select id="rate" aria-label="Speed">${[0.75, 1, 1.25, 1.5, 2].map((r) => `<option value="${r}"${r === rate ? ' selected' : ''}>${r}x</option>`).join('')}</select></label>
            </div>
            <p class="tiny muted" id="pos" role="status" style="margin:6px 0 0"></p>
          </div>
          <h2 style="margin-top:16px">Script</h2>
          <ol style="list-style:none;padding:0;margin:0">${ep.turns.map((turn, i) => `<li data-turn="${i}" style="padding:6px 0"><strong>${turn.host === 'A' ? 'Alex' : 'Sam'}:</strong> ${esc(turn.text)}${turn.quote ? ` <details style="display:inline"><summary class="tiny muted">From your material</summary><span class="tiny muted">“${esc(turn.quote)}”</span></details>` : ''}</li>`).join('')}</ol>
          <p class="tiny muted">The voices are your browser's own. Nothing is recorded, and no voice service is used.</p>`;
      } else {
        const weakNote = kind === 'weak' ? (data.weak_spots.length
          ? `<p class="small">An episode about ${data.weak_spots.length} skill${data.weak_spots.length > 1 ? 's' : ''} you are about to forget or have missed: ${data.weak_spots.map((s) => esc(s.title)).join(', ')}.</p>`
          : '<p class="small muted">Nothing to talk about yet. Study some of the learning path, then come back and this will be about what you missed or are about to forget.</p>') : '<p class="small">Two hosts talk through the main ideas of your material.</p>';
        body = `<div class="card">${ep && ep.status === 'failed' ? '<div class="notice notice-error">The last try did not work. Try again, or use a longer or clearer text.</div>' : ''}${weakNote}
          <button type="button" class="btn btn-primary" id="make"${kind === 'weak' && !data.weak_spots.length ? ' disabled' : ''}>Make the episode</button></div>`;
      }
      rootEl.innerHTML = `<p class="small"><a href="/my-material">&larr; My material</a></p><h1>Podcast</h1>
        <p class="muted">A short two-host talk made only from your own text. It is read aloud by your browser's voice.</p>
        <div class="row-wrap" style="gap:8px;margin:12px 0">${tabs}</div>${body}`;
      rootEl.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { pause(); kind = b.dataset.kind; pos = 0; render(); }));
      const make = document.getElementById('make');
      if (make) make.addEventListener('click', start);
      const pp = document.getElementById('pp');
      if (pp) {
        pp.addEventListener('click', () => (playing ? pause() : play()));
        document.getElementById('back15').addEventListener('click', () => seek(backTarget(ep.turns, pos, 15, rate)));
        document.getElementById('skip').addEventListener('click', () => seek(pos + 1));
        document.getElementById('rate').addEventListener('change', (e) => { rate = Number(e.target.value) || 1; if (playing) { stop(); speak(); } });
        rootEl.querySelectorAll('[data-turn]').forEach((li) => li.addEventListener('click', (e) => { if (!e.target.closest('details')) seek(Number(li.dataset.turn)); }));
        paint();
      }
    }
    const require_ = (ep) => minutesOf(ep.turns, 1);

    window.addEventListener('pagehide', stop);
    if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', () => { voices = null; });
    load();
  });
}(typeof window !== 'undefined' ? window : globalThis));
