/* The measuring kit for chess, piano and basketball checks (staged skills
 * round 3, patch 01): the runners the stage check page (patch 02) and the
 * practice page (patch 04) share.
 *
 *   SkillKit.items(host, { items, subject, feedback, onAnswer, onDone })
 *       one question at a time: choices, typed answers, a move on the board,
 *       a key found on the piano, an echo or a chord heard and answered.
 *   SkillKit.takes(host, { parts, onTake(part, played, origin, extra), onDone, practice })
 *       piano: a count-in, then the learner plays; the notes (key numbers and
 *       times only, and the sustain pedal's moves for pedalling) go to the
 *       server, which scores them with piano-core. A part with a score is drawn
 *       in notation (PianoNotation); a part played from memory shows no notes.
 *   Drawn basketball scenes (items of kind "scene") play on the court
 *       (PolymathCourt) and pause at the decision; the answer time is sent too.
 *   SkillKit.count(host, { fields, hands, choice, cameraOk, onSubmit })
 *       basketball: makes and attempts typed in, or the camera tracker's count
 *       confirmed by the learner.
 *
 * Camera and microphone stay on this device. The microphone is heard only
 * through the piano engine (PolymathPianoIO), which turns sound into note
 * events here; nothing records or sends sound or pictures. The only network
 * calls are the callbacks the page passes in, which post answers, note events
 * and counts to /api/skills.
 */
(function (global) {
  const esc = (s) => (global.App ? global.App.escapeHtml(s) : String(s == null ? '' : s));
  const IO = () => global.PolymathPianoIO || null;
  const now = () => (global.performance && performance.now ? performance.now() : Date.now());

  // ── one input for the piano: MIDI when there is a keyboard, else the on-screen keys; the microphone on request ──
  function pianoInput(host, { onNote, onPedal = null, from = 48, to = 84, allowMic = true }) {
    const io = IO();
    const wrap = document.createElement('div');
    wrap.className = 'skill-input';
    wrap.innerHTML = `
      <div class="skill-input-row">
        <span class="tiny muted" data-src>On-screen keys</span>
        ${io && io.midi.supported() ? '<button class="btn btn-sm" type="button" data-midi>Use a MIDI keyboard</button>' : ''}
        ${allowMic && io && io.mic.supported() ? '<button class="btn btn-sm" type="button" data-mic>Use the microphone</button>' : ''}
      </div>
      <div class="skill-keys"></div>`;
    host.appendChild(wrap);
    let stopMidi = null;
    let stopMic = null;
    const label = wrap.querySelector('[data-src]');
    const kb = io ? io.keyboard(wrap.querySelector('.skill-keys'), { from, to, onPress: (e) => onNote({ ...e, source: 'screen' }) }) : null;
    const midiBtn = wrap.querySelector('[data-midi]');
    if (midiBtn) midiBtn.addEventListener('click', async () => {
      try {
        const c = await io.midi.connect((e) => onNote(e), onPedal ? { onPedal } : {});
        stopMidi = c.stop;
        label.textContent = c.devices && c.devices.length ? `MIDI: ${c.devices.join(', ')}` : 'MIDI: waiting for a keyboard';
        midiBtn.disabled = true;
      } catch (err) { global.App.toast(err.message, 'error'); }
    });
    const micBtn = wrap.querySelector('[data-mic]');
    if (micBtn) micBtn.addEventListener('click', async () => {
      try {
        const m = await io.mic.start((e) => onNote({ ...e, source: 'mic' }), {});
        stopMic = m.stop;
        label.textContent = 'Microphone: heard on this device only (an estimate; a second take confirms it)';
        micBtn.disabled = true;
      } catch (err) { global.App.toast(err.message, 'error'); }
    });
    return {
      keyboard: kb,
      stop() { try { if (stopMidi) stopMidi(); } catch (e) { /* gone */ } try { if (stopMic) stopMic(); } catch (e) { /* gone */ } if (kb) kb.destroy(); },
    };
  }

  // ── items ─────────────────────────────────────────────────────────────────
  function items(host, o) {
    const list = o.items;
    let index = (o.answered || []).findIndex((x) => !x);
    if (index < 0) index = o.answered && o.answered.length ? list.length : 0;
    let input = null;
    let board = null;

    function cleanup() {
      if (input) { input.stop(); input = null; }
      board = null;
    }

    let shownAt = 0; // when the choices of a scene appeared: the answer time runs from here
    async function submit(answer, source) {
      host.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
      let res;
      const ms = shownAt ? Math.round(now() - shownAt) : undefined;
      shownAt = 0;
      try { res = await o.onAnswer(index, answer, source, ms); } catch (err) {
        global.App.toast(err.message, 'error');
        host.querySelectorAll('button, input').forEach((b) => { b.disabled = false; });
        return;
      }
      cleanup();
      if (o.feedback && res) {
        const v = host.querySelector('[data-verdict]');
        v.innerHTML = `<p class="skill-verdict ${res.correct ? 'is-right' : 'is-wrong'}">${global.mark(res.correct ? 'tick' : 'cross')}<span>${res.correct ? 'Right.' : 'Not this time.'}${!res.correct && res.answer ? ` The answer: <b>${esc(res.answer)}</b>.` : ''}</span></p>
          <button class="btn btn-primary" type="button" data-next>${index + 1 < list.length ? 'Next' : 'Finish the set'}</button>`;
        v.querySelector('[data-next]').addEventListener('click', () => { index += 1; show(); });
        v.querySelector('[data-next]').focus();
      } else { index += 1; show(); }
    }

    function show() {
      if (index >= list.length) { host.innerHTML = ''; o.onDone(); return; }
      const it = list[index];
      host.innerHTML = `
        <div class="skill-q">
          <p class="skill-q-count"><span class="num">${index + 1}</span> / <span class="num">${list.length}</span></p>
          <p class="skill-stem">${esc(it.prompt).replace(/\n/g, '<br>')}</p>
          <div data-body></div>
          <div data-verdict aria-live="polite"></div>
        </div>`;
      const body = host.querySelector('[data-body]');
      if (it.kind === 'scene') {
        // A drawn play: the first moment, then the court moves to the decision and pauses.
        const court = document.createElement('div');
        court.className = 'skill-court';
        body.appendChild(court);
        const row = document.createElement('div');
        row.className = 'skill-choices';
        row.hidden = true;
        row.innerHTML = it.choices.map((c) => `<button class="btn choice" type="button" data-c="${esc(c)}">${esc(c)}</button>`).join('');
        body.appendChild(row);
        row.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => submit(b.getAttribute('data-c'), 'screen')));
        const reveal = () => { row.hidden = false; shownAt = now(); const first = row.querySelector('button'); if (first) first.focus(); };
        const C = global.PolymathCourt;
        if (!C) { reveal(); return; }
        const view = C.create(court, { frames: it.frames, label: it.prompt });
        view.show(0);
        const run = () => view.play(0, 1, 1200).then(reveal, reveal);
        setTimeout(run, 500);
        body.insertAdjacentHTML('beforeend', '<p><button class="btn btn-sm btn-ghost" type="button" data-replay>Play it again</button></p>');
        body.querySelector('[data-replay]').addEventListener('click', () => { view.show(0); view.play(0, 1, 1200); });
        return;
      }
      if (it.kind === 'choice' || it.kind === 'chord_ear') {
        if (it.kind === 'chord_ear') {
          body.insertAdjacentHTML('beforeend', '<p><button class="btn" type="button" data-play>Play the chord</button></p>');
          body.querySelector('[data-play]').addEventListener('click', () => { const io = IO(); if (io) it.notes.forEach((m) => io.synth.play(m, 1200)); });
        }
        if (it.fen && global.PolymathBoard) { const b = document.createElement('div'); b.className = 'skill-board'; body.appendChild(b); global.PolymathBoard.create(b, { fen: it.fen, interactive: false }); }
        const row = document.createElement('div');
        row.className = 'skill-choices';
        row.innerHTML = it.choices.map((c) => `<button class="btn choice" type="button" data-c="${esc(c)}">${esc(c)}</button>`).join('');
        body.appendChild(row);
        row.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => submit(b.getAttribute('data-c'), it.kind === 'chord_ear' ? 'tap' : null)));
      } else if (it.kind === 'move' || it.kind === 'squares' || it.kind === 'text') {
        if (it.fen && global.PolymathBoard) {
          const b = document.createElement('div');
          b.className = 'skill-board';
          body.appendChild(b);
          board = global.PolymathBoard.create(b, { fen: it.fen, interactive: it.kind === 'move', onMove: (m, san) => { field.value = san; } });
        }
        const form = document.createElement('form');
        form.className = 'skill-answer';
        form.innerHTML = `<label class="visually-hidden" for="skill-a">Your answer</label>
          <input id="skill-a" class="input" autocomplete="off" spellcheck="false" placeholder="${it.kind === 'squares' ? 'e.g. c4 d5 e6' : it.kind === 'move' ? 'Move, e.g. Qh7#' : 'Your answer'}">
          <button class="btn btn-primary" type="submit">Answer</button>
          ${it.allow_no_mate ? '<button class="btn" type="button" data-nomate>No mate</button>' : ''}
          ${it.allow_none ? '<button class="btn" type="button" data-none>Nothing wins</button>' : ''}`;
        body.appendChild(form);
        const field = form.querySelector('input');
        form.addEventListener('submit', (e) => { e.preventDefault(); if (field.value.trim()) submit(field.value.trim(), 'board'); });
        const nm = form.querySelector('[data-nomate]');
        if (nm) nm.addEventListener('click', () => submit('no mate', 'board'));
        const nn = form.querySelector('[data-none]');
        if (nn) nn.addEventListener('click', () => submit('nothing wins', 'board'));
        if (!board) field.focus();
      } else if (it.kind === 'key') {
        input = pianoInput(body, { onNote: (e) => { if (!host.dataset.busy) { host.dataset.busy = '1'; submit({ midi: e.midi }, e.source).finally(() => { delete host.dataset.busy; }); } } });
      } else if (it.kind === 'echo') {
        const tries = [];
        let current = [];
        body.insertAdjacentHTML('beforeend', `<p class="row-wrap"><button class="btn" type="button" data-play>Play it</button>
          <span class="tiny muted" data-heard>Play back <span class="num">${it.notes.length}</span> notes${it.tries > 1 ? `; <span class="num">${it.tries}</span> tries` : ''}.</span></p>`);
        body.querySelector('[data-play]').addEventListener('click', () => { const io = IO(); if (io) io.synth.sequence(it.notes.map((m, i) => ({ midi: m, beat: i })), 90); });
        const heard = body.querySelector('[data-heard]');
        let source = 'screen';
        input = pianoInput(body, { onNote: (e) => {
          source = e.source === 'mic' ? 'mic' : source === 'mic' ? 'mic' : e.source;
          current.push(e.midi);
          heard.textContent = `Heard ${current.length} of ${it.notes.length}.`;
          if (current.length === it.notes.length) {
            tries.push(current);
            current = [];
            if (tries.length >= (it.tries || 1)) submit({ tries }, source);
            else heard.textContent = `Try ${tries.length + 1} of ${it.tries}: play it again if it was not right, or finish.`;
          }
        } });
        if ((it.tries || 1) > 1) {
          body.insertAdjacentHTML('beforeend', '<p><button class="btn btn-sm" type="button" data-done>That one was right: answer</button></p>');
          body.querySelector('[data-done]').addEventListener('click', () => { if (tries.length) submit({ tries }, source); });
        }
      }
    }
    show();
    return { stop: cleanup };
  }

  // ── piano takes ───────────────────────────────────────────────────────────
  function takes(host, o) {
    let part = 0;
    let input = null;
    function show() {
      if (input) { input.stop(); input = null; }
      if (part >= o.parts.length) { host.innerHTML = ''; o.onDone(); return; }
      const p = o.parts[part];
      const names = p.memory ? 'From memory: no notes are shown.' : p.score ? '' : p.chords ? p.chords.join('  ') : p.any_key ? 'Any key, on the click' : (p.names || []).join(' ');
      host.innerHTML = `
        <div class="skill-q">
          <p class="skill-q-count">Part <span class="num">${part + 1}</span> / <span class="num">${o.parts.length}</span></p>
          <p class="skill-stem">${esc(p.label)}</p>
          ${names ? `<p class="skill-notes num">${esc(names)}</p>` : ''}
          ${p.score ? '<div class="skill-score" data-score></div>' : ''}
          ${p.pedal ? '<p class="tiny muted">This one needs a MIDI keyboard with a sustain pedal: the pedal\'s moves are measured, the microphone cannot hear them.</p>' : ''}
          ${p.dynamics ? '<p class="tiny muted">Loudness is measured from a MIDI keyboard only.</p>' : ''}
          <p class="tiny muted">At <span class="num">${p.tempo}</span> beats a minute. Press Start: <span class="num">${p.count_in || 4}</span> clicks count you in, then play. Press Done when you finish.</p>
          <div data-input></div>
          <div class="path-actions"><button class="btn btn-primary" type="button" data-go>Start</button><span class="tiny muted" data-heard></span></div>
          <div data-verdict aria-live="polite"></div>
        </div>`;
      if (p.score && global.PianoNotation) global.PianoNotation.render(host.querySelector('[data-score]'), p.score);
      let played = [];
      let pedal = [];
      let origin = null;
      let recording = false;
      const span = (p.target || []).map((t) => t.midi);
      const from = Math.min(48, ...span.map((m) => Math.floor(m / 12) * 12));
      const to = Math.max(84, ...span.map((m) => Math.ceil((m + 1) / 12) * 12));
      input = pianoInput(host.querySelector('[data-input]'), {
        from, to,
        allowMic: !p.pedal,
        onPedal: p.pedal ? (e) => { if (recording) pedal.push({ time: e.time, down: !!e.down }); } : null,
        onNote: (e) => { if (!recording) return; played.push({ midi: e.midi, time: e.time, velocity: e.velocity || null, source: e.source === 'screen' && p.any_key ? 'tap' : e.source, confidence: e.confidence || 1 }); heard.textContent = `${played.length} note${played.length === 1 ? '' : 's'}`; },
      });
      const go = host.querySelector('[data-go]');
      const heard = host.querySelector('[data-heard]');
      go.addEventListener('click', async () => {
        if (!recording) {
          go.disabled = true;
          const io = IO();
          const beat = 60000 / p.tempo;
          for (let i = 0; i < (p.count_in || 4); i++) { if (io) io.synth.click(i === 0); heard.textContent = `${(p.count_in || 4) - i}`; await new Promise((r) => setTimeout(r, beat)); }
          if (p.any_key && io) {
            // The click carries on under the taps, one per beat, for as long as the target lasts.
            const n = (p.target || []).length;
            for (let i = 0; i < n; i++) setTimeout(() => io.synth.click(false), i * beat);
          }
          played = [];
          pedal = [];
          origin = now();
          recording = true;
          heard.textContent = 'Playing';
          go.textContent = 'Done';
          go.disabled = false;
          return;
        }
        recording = false;
        go.disabled = true;
        if (!played.length) { heard.textContent = 'No notes heard. Start again.'; go.textContent = 'Start'; go.disabled = false; return; }
        let res;
        try { res = await o.onTake(part, played, origin, p.pedal ? { pedal } : undefined); } catch (err) { global.App.toast(err.message, 'error'); go.textContent = 'Start'; go.disabled = false; return; }
        const v = host.querySelector('[data-verdict]');
        const factList = [
          ['notes', res.notes != null ? `notes <b class="num">${Math.round(res.notes * 100)}%</b>` : ''],
          ['on_beat', res.on_beat != null ? `on the beat <b class="num">${Math.round(res.on_beat * 100)}%</b>` : ''],
          ['cv', res.cv != null ? `evenness CV <b class="num">${res.cv}</b>` : ''],
          ['stops', res.stops ? `<b class="num">${res.stops}</b> stop${res.stops === 1 ? '' : 's'}` : ''],
          ['chords', res.chords != null ? `chords <b class="num">${res.chords_right}/${res.chords}</b>` : ''],
          ['pedal', res.pedal != null ? `clean pedal changes <b class="num">${res.pedal_clean}/${res.pedal_changes}</b>` : ''],
          ['dynamics', res.dynamics != null ? `f louder than p by <b class="num">${res.dynamics}</b>` : ''],
        ].filter((f) => f[1]);
        const facts = factList.map((f) => f[1]).join(', ');
        // Bandwidth feedback (warm practice, after 2 clean takes): only what is outside the bar; the rest on request.
        const banded = o.practice && res.feedback === 'bandwidth';
        const offFacts = banded ? factList.filter((f) => (res.off || []).includes(f[0]) || ['pedal', 'dynamics'].includes(f[0])).map((f) => f[1]).join(', ') : facts;
        const shown = banded ? (offFacts ? `Outside the bar: ${offFacts}.` : 'Nothing outside the bar.') : `${facts}.`;
        const needSecond = res.source === 'mic' && !o.practice && (res.takes || 1) < 2;
        // The server's verdict says a clean take below the target tempo as "Clean at 68 bpm (target 104)", the way the set summary will.
        const verdict = res.verdict ? esc(res.verdict).replace(/(\d+)/g, '<span class="num">$1</span>') : (res.pass ? 'At the bar.' : 'Below the bar.');
        v.innerHTML = `<p class="skill-verdict ${res.pass ? 'is-right' : 'is-wrong'}">${global.mark(res.pass ? 'tick' : 'cross')}<span>${verdict} ${shown}</span></p>
          ${banded ? `<p class="tiny muted" data-more-note>Two clean takes in a row, so only what needs work is shown. <button class="btn btn-sm btn-ghost" type="button" data-more>Show all the numbers</button></p><p class="small" data-all hidden>${facts}.</p>` : ''}
          ${res.tempo && res.tempo.pct < 1 ? `<p class="tiny muted">A practice tempo: <span class="num">${res.tempo.at}</span> of <span class="num">${res.tempo.target}</span> beats a minute. Clean sets step it up, and only a clean set at <span class="num">${res.tempo.target}</span> counts as at the target. The stage check is always at full speed.</p>` : ''}
          ${res.next_loop ? `<p class="tiny muted">Next set: bar${res.next_loop.bars[0] === res.next_loop.bars[1] ? ` <span class="num">${res.next_loop.bars[0]}</span>` : `s <span class="num">${res.next_loop.bars[0]}-${res.next_loop.bars[1]}</span>`} looped slowly, then back to the whole piece.</p>` : ''}
          ${res.note ? `<p class="tiny muted">${esc(res.note)}.</p>` : ''}
          ${res.source === 'mic' ? `<p class="tiny muted">Heard by the microphone: an estimate.${needSecond ? ' Play it once more to confirm it.' : ''}</p>` : ''}
          <div class="row-wrap">${needSecond ? '<button class="btn" type="button" data-again>Play it again to confirm</button>' : ''}<button class="btn btn-primary" type="button" data-next>${part + 1 < o.parts.length ? 'Next part' : o.practice ? 'Finish the set' : 'Finish the check'}</button></div>`;
        const again = v.querySelector('[data-again]');
        if (again) again.addEventListener('click', () => show());
        const more = v.querySelector('[data-more]');
        if (more) more.addEventListener('click', () => { v.querySelector('[data-all]').hidden = false; v.querySelector('[data-more-note]').remove(); });
        v.querySelector('[data-next]').addEventListener('click', () => { part += 1; show(); });
      });
    }
    show();
    return { stop() { if (input) input.stop(); } };
  }

  // ── basketball counts ─────────────────────────────────────────────────────
  function count(host, o) {
    const fieldsHtml = (prefix, title) => `
      <fieldset class="skill-count-set">
        ${title ? `<legend>${esc(title)}</legend>` : ''}
        ${o.fields.map((f) => `<label class="skill-count"><span>${esc(f.label)}</span><input class="input num" type="number" inputmode="numeric" min="${f.min}" max="${f.max}" name="${prefix}${f.name}" required></label>`).join('')}
      </fieldset>`;
    host.innerHTML = `
      <form class="skill-count-form">
        ${o.choice ? `<label class="skill-count"><span>${esc(o.choice.label)}</span><select class="input" name="${esc(o.choice.name)}">${o.choice.options.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('')}</select></label>` : ''}
        ${o.hands ? fieldsHtml('left.', 'Left hand') + fieldsHtml('right.', 'Right hand') : fieldsHtml('', '')}
        ${o.cameraOk ? `
          <fieldset class="skill-count-set">
            <legend>Who counted</legend>
            <label class="skill-radio"><input type="radio" name="source" value="count" checked> I (or a grown-up) counted</label>
            <label class="skill-radio"><input type="radio" name="source" value="camera"> The camera tracker counted (it stays on this device)</label>
            <label class="skill-radio" data-confirm hidden><input type="checkbox" name="confirmed"> I watched and the camera's count is right</label>
          </fieldset>` : ''}
        <div class="path-actions"><button class="btn btn-primary" type="submit">${esc(o.submitLabel || 'Record it')}</button></div>
      </form>`;
    const form = host.querySelector('form');
    const confirmRow = form.querySelector('[data-confirm]');
    form.querySelectorAll('input[name=source]').forEach((r) => r.addEventListener('change', () => { if (confirmRow) confirmRow.hidden = form.source.value !== 'camera'; }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const body = {};
      form.querySelectorAll('input[type=number]').forEach((inp) => {
        const [a, b] = inp.name.split('.');
        if (b) { body[a] = body[a] || {}; body[a][b] = Number(inp.value); } else body[a] = Number(inp.value);
      });
      if (o.choice) body[o.choice.name] = form.querySelector(`select[name="${o.choice.name}"]`).value;
      if (o.cameraOk) { body.source = form.source.value; body.confirmed = !!(form.confirmed && form.confirmed.checked); }
      o.onSubmit(body, form);
    });
  }

  global.SkillKit = { items, takes, count, pianoInput };
})(typeof window !== 'undefined' ? window : globalThis);
