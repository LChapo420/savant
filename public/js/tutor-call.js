/* The voice call (owner, 7 Nov 2026: "you don't have to click anything to talk back and forth, it just listens and talks").
 *
 *   const c = TutorCall.create({ info, lang, giraffe, line, ask, onEnded, onRefused }); c.start(); c.unlock(); c.end(why); c.toChat();
 *
 * The loop: listening -> the learner stops -> thinking -> talking -> listening. No buttons. The giraffe shows the state (js/tutor-giraffe.js) and says the word beside it.
 *
 * Two ways to listen and talk, decided by the server (services/tutor-call.js), never by this page:
 *   speech 'gateway'  an account on the gateway list. This file finds the end of speech itself, sends only the speech as 16 kHz WAV to /api/tutor/call/hear, and plays /api/tutor/call/say.
 *   speech 'browser'  everyone else who may call: the browser's recognizer and its own voice, which cost nothing.
 * A refusal or a used-up limit on the paid route drops to the browser's way for the rest of the call when there is one; otherwise the call ends and says why.
 *
 * Replies come only from ask(), which is POST /api/tutor/dock: same safety rules, same fact check, same memory as a typed message, finished before a word is spoken.
 * With the server's TUTOR_VOICE_STREAM (info.stream) a turn asks askStream() instead (POST /api/tutor/dock/stream): the first sentences are spoken as soon as they pass
 * the same checks on their own, the rest once the whole reply has passed; if the whole reply does not pass, what is playing stops and the replacement is said, as the
 * chat shows it. With the paid voice the audio comes in that same response (speakQueue below). TUTOR_VOICE_EOS (info.eos): the end of a turn is read from the words too
 * (looksUnfinished), and words that start again before the tutor talks are joined to the turn. TUTOR_CALL_ACK (info.ack): a soft sound while it thinks (scheduleAck).
 *
 * It must not hear itself:
 *   1. the microphone is asked for with the browser's echo cancellation
 *   2. while the tutor talks nothing is sent anywhere; the microphone is only watched for an interruption, against the echo level measured over the first moments of each reply
 *   3. a browser with no echo cancellation gets no interruptions at all
 *   4. a clip heard right after the tutor talked that is mostly the tutor's own words is dropped
 *
 * Delay, from the learner's last sound to the tutor's first: measured for every turn, kept as numbers only (never words) in tutor_call_log and in TutorCall.last for a test to read.
 * To keep it short: speech is sent speculatively at SPECULATE_MS of quiet, so the words are often back by the time the pause counts as the end; each sentence of a reply gets its own
 * voice request, so the first sentence plays without waiting for the rest; a browser voice starts at once.
 */
(function () {
  const END_OF_SPEECH_MS = 650; // this much quiet ends the learner's turn
  const SPECULATE_MS = 260;     // and this much already sends what was said, in case the turn really is over
  const VOICE_START_MS = 90;    // loud for this long is speech, not a click
  const MIN_SPEECH_MS = 240;    // a whole turn shorter than this is a cough
  const PRE_ROLL_MS = 1000;     // kept from before speech is noticed, so the first word is not clipped; long enough to cover an interruption being confirmed
  const INTERRUPT_MS = 300;     // over the echo level for this long is the learner cutting in
  const ECHO_MEASURE_MS = 450;  // the start of each reply: how loud does the tutor sound in the mic?
  const AFTER_TALK_DEAF_MS = 220; // the tail of the tutor's voice in the room
  const QUIET_RESTART_MS = 800; // browser recognizer: no new words for this long and the turn is over
  // The server's TUTOR_VOICE_EOS (info.eos): the end of a turn is read from the words as well as the quiet. Early words are sent at EOS_SPECULATE_MS; when they come back
  // as a finished sentence the turn ends at EOS_MIN_MS of quiet; when they trail off ("and", "um", "of", a comma) it waits until EOS_LONG_MS; with no words back yet, the
  // usual END_OF_SPEECH_MS. Words that start again within MERGE_MS of the end, before the tutor talks, are joined to the turn (the clip is sent again, whole).
  const EOS_SPECULATE_MS = 180;
  const EOS_MIN_MS = 420;
  const EOS_LONG_MS = 1300;
  const MERGE_MS = 2500;
  const ACK_AFTER_MS = 350;     // TUTOR_CALL_ACK: the soft sound plays this long into a turn's thinking, if the tutor has not started talking
  const TARGET_RATE = 16000;
  const WORD = { listening: 'Listening', thinking: 'Thinking', talking: 'Talking' };
  // A turn that trails off: the next words are still coming.
  const TRAILING = /(?:^|\s)(and|or|but|so|because|cause|um+|uh+|er+|erm|hmm+|like|the|a|an|to|of|with|for|in|on|at|from|about|into|is|are|was|were|if|then|that|which|who|whose|my|your|his|her|their|our|its|i|i'm|im|it's|what's|than|as|also|plus|and then|you know|kind of|sort of)\s*$/i;
  function looksUnfinished(text) {
    const s = String(text || '').trim();
    if (!s) return true;
    if (/(,|;|:|-|–|—|\.\.\.|…)\s*$/.test(s)) return true;
    return TRAILING.test(s.replace(/[.!?"')\]]+\s*$/, ''));
  }
  const isAndroid = /Android/i.test(navigator.userAgent || '');

  const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  const AC = window.AudioContext || window.webkitAudioContext;
  const synthOk = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  const words = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean);

  /** A reply as sentences, short enough to start speaking quickly; tiny ones are joined to the next. */
  function sentences(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [];
    const out = [];
    for (const s of raw) {
      const t = s.trim();
      if (!t) continue;
      if (out.length && out[out.length - 1].length < 25) out[out.length - 1] += ` ${t}`; else out.push(t);
    }
    return out;
  }

  function wavBlob(frames, fromRate) {
    let total = 0;
    for (const f of frames) total += f.length;
    const all = new Float32Array(total);
    let at = 0;
    for (const f of frames) { all.set(f, at); at += f.length; }
    const ratio = fromRate / TARGET_RATE;
    const n = Math.floor(all.length / ratio);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const put = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    put(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); put(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, TARGET_RATE, true); v.setUint32(28, TARGET_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); put(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio);
      const b = Math.min(all.length, Math.max(a + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = a; j < b; j++) sum += all[j];
      const s = Math.max(-1, Math.min(1, sum / (b - a)));
      v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  function create({ info, lang, giraffe, line, ask, askStream, onEnded, onRefused }) {
    const shortLang = String(lang || 'en').slice(0, 2);
    const eosOn = !!info.eos;
    const streamOn = () => !!info.stream && typeof askStream === 'function';
    const speculateMs = eosOn ? EOS_SPECULATE_MS : SPECULATE_MS;
    let lastTurn = null; // { frames, detectedAt, token, asked }: the turn just ended, joined to the next words if they come soon enough
    const dropped = new Set(); // turns joined into the next one: never asked, or their streamed ask was dropped
    let asking = null;   // the AbortController of the streamed turn in flight
    let state = 'idle';
    let callId = null;
    let listenWay = null;
    let speakWay = null;
    let ac = null;
    let stream = null;
    let source = null;
    let proc = null;
    let wake = null;
    let aecOk = false;
    let maxTimer = null;
    let watchTimer = null;
    let quietSince = 0;
    let warned = false;
    let hiddenAt = 0;
    const turns = [];
    let notedPaidEnd = false;

    // Voice activity.
    let noise = 0.004;
    let preRoll = [];
    let preMs = 0;
    let inSpeech = false;
    let clip = [];
    let clipMs = 0;
    let voicedRun = 0;
    let voicedMs = 0;
    let lastVoiceAt = 0;
    let fromInterrupt = false;
    let spec = null;
    let deafUntil = 0;

    // Talking.
    let speakToken = 0;
    let playing = null; // { source } or { synth: true }
    let talkStart = 0;
    let echoPeak = 0;
    let interruptRun = 0;
    let lastSpoken = '';
    let talkEndedAt = 0;

    // Turns.
    let turnToken = 0;
    let pendingAsk = Promise.resolve();

    // Browser recognizer.
    let rec = null;
    let recText = '';
    let recLive = '';
    let recQuietTimer = null;
    let recLastAt = 0;

    const stopped = () => state === 'idle' || state === 'ended';
    const setState = (s) => {
      state = s;
      giraffe.setVoice(s);
      giraffe.say(WORD[s] || '');
    };

    // ── Sound has to be switched on inside a user gesture on phones ─────────
    function unlock() {
      try {
        if (!ac && AC) ac = new AC({ latencyHint: 'interactive' });
        if (ac && ac.state !== 'running') ac.resume().catch(() => {});
        if (ac) { const b = ac.createBuffer(1, 1, 22050); const n = ac.createBufferSource(); n.buffer = b; n.connect(ac.destination); n.start(0); }
        if (synthOk() && !unlock.spoke) {
          unlock.spoke = true;
          const u = new SpeechSynthesisUtterance(' ');
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
      } catch { /* the first real sound will say */ }
    }

    // ── The microphone ─────────────────────────────────────────────────────
    async function openMic() {
      if (stream) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const track = stream.getAudioTracks()[0];
      const settings = track && track.getSettings ? track.getSettings() : {};
      aecOk = settings.echoCancellation !== false;
      if (track) track.onended = () => { if (!stopped()) finish('The microphone stopped, so the call ended.', 'mic'); };
      if (!ac) ac = new AC({ latencyHint: 'interactive' });
      if (ac.state !== 'running') ac.resume().catch(() => {});
      ac.onstatechange = () => { if (ac && !stopped() && ac.state !== 'running' && ac.state !== 'closed') ac.resume().catch(() => {}); }; // a phone call or a Siri prompt suspends it
      source = ac.createMediaStreamSource(stream);
      proc = ac.createScriptProcessor(2048, 1, 1);
      const mute = ac.createGain();
      mute.gain.value = 0;
      proc.onaudioprocess = (e) => onFrame(e.inputBuffer.getChannelData(0));
      source.connect(proc);
      proc.connect(mute);
      mute.connect(ac.destination);
    }
    function closeMic() {
      try { if (proc) { proc.onaudioprocess = null; proc.disconnect(); } if (source) source.disconnect(); } catch { /* gone */ }
      proc = null;
      source = null;
      if (stream) { stream.getTracks().forEach((t) => { t.onended = null; t.stop(); }); stream = null; }
    }

    function resetSpeech() {
      inSpeech = false;
      clip = [];
      clipMs = 0;
      voicedRun = 0;
      voicedMs = 0;
      spec = null;
      fromInterrupt = false;
    }

    function onFrame(input) {
      if (stopped() || !ac) return;
      const now = performance.now();
      const dt = (input.length / ac.sampleRate) * 1000;
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      const copy = new Float32Array(input);

      // What was just said, kept for when speech is only noticed a moment after it began.
      preRoll.push(copy);
      preMs += dt;
      while (preMs - dt > PRE_ROLL_MS && preRoll.length > 1) { preRoll.shift(); preMs -= dt; }

      if (state === 'talking') { watchInterrupt(rms, now, dt); return; }
      if (listenWay !== 'gateway' || now < deafUntil) return;
      if (!inSpeech) noise = rms < noise * 2.5 ? Math.max(0.0015, Math.min(0.05, noise * 0.98 + rms * 0.02)) : noise;
      const startAt = Math.max(0.012, noise * 3);
      const keepAt = Math.max(0.008, noise * 2);
      if (state === 'listening') giraffe.setLevel(Math.min(1, rms * 8));

      if (!inSpeech) {
        voicedRun = rms > startAt ? voicedRun + dt : 0;
        if (voicedRun >= (state === 'thinking' ? 200 : VOICE_START_MS)) {
          inSpeech = true;
          clip = preRoll.slice(-Math.ceil(350 / dt));
          clipMs = clip.length * dt;
          voicedMs = voicedRun;
          lastVoiceAt = now;
          quietSince = now;
          warned = false;
          // They kept talking after we took the pause as the end: the reply on its way is not spoken (it stays in the chat), and this joins the conversation next.
          if (state === 'thinking') {
            // TUTOR_VOICE_EOS with a streamed turn: the turn is dropped (it leaves the chat and is not remembered) and what they said before joins these words, so the
            // tutor hears the whole thought once. The quiet in between is kept short in the clip.
            // (A plain turn already sent cannot be taken back, so it is not joined: it stays in the chat, as before.)
            if (eosOn && lastTurn && lastTurn.token === turnToken && now - lastTurn.detectedAt < MERGE_MS && (asking || !lastTurn.asked)) {
              const gap = Math.ceil(300 / dt);
              clip = lastTurn.frames.concat(new Array(gap).fill(new Float32Array(Math.round((dt / 1000) * ac.sampleRate))), clip);
              clipMs += lastTurn.ms + gap * dt;
              voicedMs += lastTurn.voicedMs;
              dropped.add(lastTurn.token);
              if (asking) { try { asking.abort(); } catch { /* finished */ } asking = null; }
            }
            lastTurn = null;
            turnToken += 1;
            stopTalking(); // a streamed reply whose first words are about to play is not said either
            setState('listening');
          }
        }
        return;
      }
      clip.push(copy);
      clipMs += dt;
      if (rms > keepAt) {
        lastVoiceAt = now;
        voicedMs += dt;
        spec = null; // they went on: what was sent early is not the whole thing
      } else {
        const quiet = now - lastVoiceAt;
        if (quiet >= speculateMs && !spec && voicedMs >= MIN_SPEECH_MS) {
          const s = { promise: hear(clip.slice()), at: now, text: null };
          s.promise.then((t) => { s.text = t; }, () => {}); // it may never be needed
          spec = s;
        }
        // With TUTOR_VOICE_EOS the words decide how long the quiet must be: a finished sentence ends sooner, a trailing one waits (see looksUnfinished).
        let need = END_OF_SPEECH_MS;
        if (eosOn && spec && spec.text != null) need = looksUnfinished(spec.text) ? EOS_LONG_MS : EOS_MIN_MS;
        if (quiet >= need) endOfSpeech(now);
      }
      if (clipMs >= (Number(info.clip_s) || 45) * 1000 - 1000) endOfSpeech(now); // the longest clip the server takes
    }

    function endOfSpeech(now) {
      const frames = clip;
      const enough = voicedMs >= MIN_SPEECH_MS;
      const stopAt = lastVoiceAt;
      const early = spec;
      const interrupted = fromInterrupt;
      const turnMs = clipMs;
      const turnVoiced = voicedMs;
      resetSpeech();
      quietSince = now;
      if (!enough) return;
      const p = takeTurn({ stopAt, detectedAt: now, hearing: early ? early.promise : hear(frames), interrupted });
      lastTurn = { frames, ms: turnMs, voicedMs: turnVoiced, detectedAt: now, token: turnToken };
      return p;
    }

    // ── A turn ─────────────────────────────────────────────────────────────
    async function hear(frames) {
      const r = await fetch(`/api/tutor/call/hear?call=${encodeURIComponent(callId)}&lang=${shortLang}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'audio/wav' }, body: wavBlob(frames, ac.sampleRate) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j.error || 'hear'), { status: r.status }); }
      const j = await r.json();
      return String(j.text || '').trim();
    }

    /** Mostly the tutor's own words, right after it spoke: the room, not the learner. */
    function looksLikeEcho(text, interrupted) {
      if (!lastSpoken) return false;
      if (!interrupted && performance.now() - talkEndedAt > 2500) return false;
      const said = words(text);
      if (!said.length) return false;
      const mine = new Set(words(lastSpoken));
      return said.filter((w) => mine.has(w)).length / said.length >= 0.75;
    }

    async function takeTurn({ stopAt, detectedAt, hearing, interrupted }) {
      const me = ++turnToken;
      const t = { detect_ms: detectedAt - stopAt };
      setState('thinking');
      if (info.ack) scheduleAck(me);
      let text = '';
      try {
        text = await hearing;
      } catch (err) {
        if (stopped() || dropped.has(me)) return;
        await hearingFailed(err);
        return;
      }
      if (stopped() || dropped.has(me)) return;
      t.stt_ms = performance.now() - detectedAt;
      if (!text || looksLikeEcho(text, interrupted)) { if (me === turnToken) { setState('listening'); quietSince = performance.now(); } return; }
      // TUTOR_VOICE_EOS: words that trail off wait for more, up to EOS_LONG_MS of quiet in all; if they talk again meanwhile the two are joined (onFrame).
      if (eosOn && looksUnfinished(text)) {
        const wait = stopAt + EOS_LONG_MS - performance.now();
        if (wait > 0) { t.hold_ms = wait; await new Promise((r) => setTimeout(r, wait)); }
        if (stopped() || dropped.has(me) || me !== turnToken) return;
      }
      await reply(text, me, t, stopAt);
    }

    /** TUTOR_CALL_ACK: a short soft two-note sound, made here (no request, no cost), when the tutor has not started talking a moment into its thinking. */
    function scheduleAck(me) {
      setTimeout(() => {
        if (stopped() || me !== turnToken || state !== 'thinking' || !ac) return;
        try {
          const at = ac.currentTime;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.05, at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
          g.connect(ac.destination);
          [523, 784].forEach((f, k) => { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(at + k * 0.08); o.stop(at + 0.25); });
          deafUntil = Math.max(deafUntil, performance.now() + 400); // the sound in the room is not the learner
        } catch { /* no sound this time */ }
      }, ACK_AFTER_MS);
    }

    async function reply(text, me, t, stopAt) {
      if (streamOn()) {
        const how = await replyStream(text, me, t, stopAt);
        if (how !== 'plain') return;
      }
      if (lastTurn && lastTurn.token === me) lastTurn.asked = true;
      const before = pendingAsk;
      const asking = (async () => { await before.catch(() => {}); return ask(text); })();
      pendingAsk = asking;
      const t0 = performance.now();
      let out = null;
      try { out = await asking; } catch { out = null; }
      if (stopped()) return;
      t.reply_ms = performance.now() - t0;
      if (me !== turnToken) return; // they spoke again meanwhile: this reply is in the chat, not said
      const words2 = out || info.notices.no_reply;
      await speak(words2, { onFirst: () => { t.audio_ms = performance.now() - t0 - t.reply_ms; t.total_ms = performance.now() - stopAt; turns.push(cleanTurn(t)); publish(); } });
      if (!stopped() && me === turnToken) backToListening();
    }

    /**
     * A streamed turn (TUTOR_VOICE_STREAM): the first checked sentences are spoken while the rest is written; with the paid voice their audio comes in the same
     * response. Returns 'plain' when the stream route said no before a word (the plain route then answers this turn), else 'done' or 'gone'.
     */
    async function replyStream(text, me, t, stopAt) {
      const before = pendingAsk;
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const t0 = performance.now();
      const serverVoice = speakWay === 'gateway';
      let q = null;
      let firstAt = 0;
      let gotDone = false;
      const noteFirst = () => { if (!firstAt) { firstAt = performance.now(); t.reply_ms = firstAt - t0; } };
      const queue = () => {
        if (!q && me === turnToken && !stopped() && !dropped.has(me)) {
          q = speakQueue({ serverVoice, onFirst: () => { t.audio_ms = performance.now() - firstAt; t.total_ms = performance.now() - stopAt; turns.push(cleanTurn(t)); publish(); } });
        }
        return q;
      };
      const run = (async () => {
        await before.catch(() => {});
        if (me !== turnToken || dropped.has(me) || stopped()) return 'gone';
        asking = ctl;
        await askStream(text, {
          call: serverVoice ? callId : null,
          signal: ctl ? ctl.signal : undefined,
          on: {
            sentence: (i, s) => { noteFirst(); if (queue()) q.push(i, s); },
            audio: (i, b64, err) => { if (q) q.audio(i, b64, err); },
            done: (out) => {
              noteFirst();
              gotDone = true;
              if (!queue()) return;
              const parts = out.speak || [];
              if (out.replace) q.replace(parts.length ? parts[0].i : 1);
              parts.forEach((p) => q.push(p.i, p.text));
              q.end(parts.length ? parts[parts.length - 1].i + 1 : (q.count() ? 1 : 0));
            },
          },
        });
        return 'asked';
      })();
      pendingAsk = run.catch(() => null);
      let how;
      try {
        how = await run;
      } catch (err) {
        if (asking === ctl) asking = null;
        if (stopped() || dropped.has(me) || (err && err.name === 'AbortError')) return 'gone';
        if (err && err.status === 404) info.stream = false; // the switch is off on the server: the plain route from now on
        return q ? 'gone' : 'plain';
      }
      if (asking === ctl) asking = null;
      if (how === 'gone' || stopped()) return 'gone';
      if (!q) {
        if (me !== turnToken) return 'gone'; // they spoke again meanwhile: this reply is in the chat, not said
        t.reply_ms = t.reply_ms || performance.now() - t0;
        await speak(info.notices.no_reply, { onFirst: () => { t.audio_ms = performance.now() - t0 - t.reply_ms; t.total_ms = performance.now() - stopAt; turns.push(cleanTurn(t)); publish(); } });
        if (!stopped() && me === turnToken) backToListening();
        return 'done';
      }
      if (!gotDone) q.end(q.count());
      await q.done;
      if (!stopped() && me === turnToken) backToListening();
      return 'done';
    }

    /**
     * Speaking parts as they arrive, in order: push(i, text) when part i may be said, audio(i, mp3Base64, error) when its voice came in the stream, replace(from) when the
     * whole reply did not pass (what is playing stops; parts before `from` are skipped), end(n) when there are n parts in all. `done` resolves when it has all been said or cut off.
     */
    function speakQueue({ serverVoice, onFirst } = {}) {
      const token = ++speakToken;
      const parts = [];
      let total = null;
      let wake = null;
      let first = true;
      let at = -1;
      const started = (ctx) => {
        if (token !== speakToken) return;
        if (first) {
          first = false;
          talkStart = performance.now();
          echoPeak = 0;
          interruptRun = 0;
          setState('talking');
          if (onFirst) onFirst();
        }
        giraffe.speaking(true, ctx);
      };
      const slot = (i) => {
        if (!parts[i]) {
          let res; let rej;
          const buf = new Promise((a, b) => { res = a; rej = b; });
          buf.catch(() => {});
          parts[i] = { text: null, buf, res, rej, skip: false };
        }
        return parts[i];
      };
      const kick = () => { if (wake) { const w = wake; wake = null; w(); } };
      const q = {
        count: () => parts.filter((p) => p && p.text != null).length,
        push(i, text) {
          const s = slot(i);
          if (s.text != null || !text) return;
          s.text = text;
          lastSpoken = `${lastSpoken} ${text}`.trim();
          // The paid voice without the stream's audio (no call id reached the server): one request per part, as speak() does.
          if (speakWay === 'gateway' && !serverVoice) say(text).then(s.res, s.rej);
          kick();
        },
        audio(i, b64, err) {
          const s = slot(i);
          if (err || !b64 || !ac) { s.rej(Object.assign(new Error('say'), { status: err || 0 })); return; }
          try {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
            ac.decodeAudioData(bytes.buffer).then(s.res, s.rej);
          } catch (e) { s.rej(e); }
        },
        replace(from) {
          for (let j = 0; j < from; j++) slot(j).skip = true;
          if (at >= 0 && at < from && playing) {
            if (playing.source) { try { playing.source.stop(); } catch { /* ended */ } }
            if (playing.synth && synthOk()) { try { window.speechSynthesis.cancel(); } catch { /* none */ } }
          }
          kick();
        },
        end(n) { total = n; kick(); },
      };
      lastSpoken = '';
      q.done = (async () => {
        // Browser ears, then: the mic is only held to catch an interruption, and only when it can't get in the recognizer's way.
        if (listenWay === 'browser' && !isAndroid && !stream) { try { await openMic(); } catch { /* no interruptions this reply */ } if (token !== speakToken) return; }
        for (let i = 0; ; i += 1) {
          while ((!parts[i] || parts[i].text == null) && (total == null || i < total)) {
            if (token !== speakToken || stopped()) return;
            await new Promise((r) => { wake = r; setTimeout(r, 250); });
          }
          if (token !== speakToken || stopped()) return;
          if (total != null && i >= total) return;
          const p = parts[i];
          if (p.skip) continue;
          at = i;
          if (speakWay === 'gateway') {
            let buf;
            try {
              buf = await p.buf;
            } catch (err) {
              if (token !== speakToken) return;
              if (!synthOk()) {
                line('tdock-note', 'I can\'t speak right now, so my answer is in the chat.');
                finish('The tutor\'s voice is not available, so the call ended. You can keep going here.', 'say_failed', true);
                return;
              }
              speakWay = 'browser';
              noteSwitch();
            }
            if (token !== speakToken) return;
            if (p.skip) continue;
            if (buf) await playBuffer(buf, p.text, token, started);
            else await speakBrowser([p.text], token, started);
          } else {
            await speakBrowser([p.text], token, started);
          }
          if (token !== speakToken) return;
          giraffe.speaking(false);
        }
      })();
      return q;
    }

    const cleanTurn = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));
    const publish = () => { window.TutorCall.last = { turns: turns.slice(), listen: listenWay, speak: speakWay, state }; };

    function backToListening() {
      resetSpeech();
      preRoll = [];
      preMs = 0;
      talkEndedAt = performance.now();
      deafUntil = talkEndedAt + AFTER_TALK_DEAF_MS;
      quietSince = talkEndedAt;
      setState('listening');
      publish();
      if (listenWay === 'browser') startRecog();
    }

    /** The paid route said no: carry on with the browser's ears, or end the call and say why. */
    async function hearingFailed(err) {
      if (err.status === 403 || err.status === 409) { finish('The call ended. You can keep going here.', 'server', true); return; } // the server closed it, or consent changed
      if (Recog) {
        listenWay = 'browser';
        noteSwitch();
        closeMic();
        backToListening();
        return;
      }
      finish(err.status === 429 ? 'That is the limit for voice today. You can keep going here.' : 'Voice stopped working, so the call ended. You can keep going here.', 'hear_failed', true);
    }
    function noteSwitch() {
      if (notedPaidEnd) return;
      notedPaidEnd = true;
      line('tdock-note', 'Using your browser\'s voice for the rest of this call.');
    }

    // ── Talking ────────────────────────────────────────────────────────────
    function watchInterrupt(rms, now, dt) {
      if (!aecOk) return; // without echo cancellation an interruption can't be told from the tutor itself
      const since = now - talkStart;
      if (since < ECHO_MEASURE_MS) { echoPeak = Math.max(echoPeak, rms); return; }
      const over = Math.max(0.02, noise * 4, echoPeak * 2.5);
      interruptRun = rms > over ? interruptRun + dt : 0;
      if (interruptRun >= INTERRUPT_MS) {
        interruptRun = 0;
        stopTalking();
        turnToken += 1;
        // The first words, said over the tutor, are already in the pre-roll.
        inSpeech = true;
        clip = preRoll.slice();
        clipMs = preMs;
        voicedMs = INTERRUPT_MS;
        lastVoiceAt = now;
        fromInterrupt = true;
        quietSince = now;
        warned = false;
        talkEndedAt = now;
        if (listenWay === 'browser') { closeMic(); setState('listening'); startRecog(); return; }
        setState('listening');
      }
    }

    function stopTalking() {
      speakToken += 1;
      if (playing && playing.source) { try { playing.source.onended = null; playing.source.stop(); } catch { /* ended */ } }
      if (synthOk()) { try { window.speechSynthesis.cancel(); } catch { /* none */ } }
      playing = null;
      giraffe.speaking(false);
    }

    /** Speak one reply. Resolves when it has finished or was cut off. */
    async function speak(text, { onFirst } = {}) {
      const token = ++speakToken;
      const parts = sentences(text);
      lastSpoken = text;
      let first = true;
      const started = (ctx) => {
        if (token !== speakToken) return;
        if (first) {
          first = false;
          talkStart = performance.now();
          echoPeak = 0;
          interruptRun = 0;
          setState('talking');
          if (onFirst) onFirst();
        }
        giraffe.speaking(true, ctx);
      };
      // Browser ears, then: the mic is only held to catch an interruption, and only when it can't get in the recognizer's way.
      if (listenWay === 'browser' && !isAndroid && !stream) { try { await openMic(); } catch { /* no interruptions this reply */ } if (token !== speakToken) return; }

      if (speakWay === 'gateway') {
        // Each sentence gets its own request, the next one ahead of time, so the first plays as soon as it can.
        const fetches = new Map();
        const get = (i) => {
          if (!fetches.has(i) && i < parts.length) {
            const p = say(parts[i]);
            p.catch(() => {}); // a sentence fetched ahead that is never played must not shout
            fetches.set(i, p);
          }
          return fetches.get(i);
        };
        for (let i = 0; i < parts.length; i++) {
          get(i);
          get(i + 1);
          let buf;
          try {
            buf = await get(i);
          } catch (err) {
            if (token !== speakToken) return;
            if (synthOk()) {
              speakWay = 'browser';
              noteSwitch();
              await speakBrowser(parts.slice(i), token, started);
              return;
            }
            line('tdock-note', 'I can\'t speak right now, so my answer is in the chat.');
            finish('The tutor\'s voice is not available, so the call ended. You can keep going here.', 'say_failed', true);
            return;
          }
          if (token !== speakToken) return;
          await playBuffer(buf, parts[i], token, started);
          if (token !== speakToken) return;
          giraffe.speaking(false);
        }
        return;
      }
      await speakBrowser(parts, token, started);
    }

    async function say(text) {
      const r = await fetch('/api/tutor/call/say', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ call: callId, text, lang: shortLang }) });
      if (!r.ok) throw Object.assign(new Error('say'), { status: r.status });
      const bytes = await r.arrayBuffer();
      return ac.decodeAudioData(bytes);
    }

    function playBuffer(buffer, text, token, started) {
      return new Promise((resolve) => {
        if (token !== speakToken || !ac) { resolve(); return; }
        const node = ac.createBufferSource();
        node.buffer = buffer;
        node.connect(ac.destination);
        playing = { source: node };
        node.onended = () => { playing = null; resolve(); };
        node.start();
        started({ text, audioContext: ac, source: node });
        // If an interruption stops it, onended was cleared: speakToken tells the caller, and this resolves here.
        const check = setInterval(() => { if (token !== speakToken) { clearInterval(check); resolve(); } else if (!playing) clearInterval(check); }, 100);
      });
    }

    function speakBrowser(parts, token, started) {
      return new Promise((resolve) => {
        const synth = window.speechSynthesis;
        let i = 0;
        const voice = (() => {
          try {
            const all = synth.getVoices() || [];
            const same = all.filter((v) => String(v.lang || '').toLowerCase().startsWith(shortLang));
            return same.find((v) => v.localService) || same[0] || null;
          } catch { return null; }
        })();
        const next = () => {
          if (token !== speakToken || i >= parts.length) { giraffe.speaking(false); resolve(); return; }
          const u = new SpeechSynthesisUtterance(parts[i]);
          u.lang = lang;
          if (voice) u.voice = voice;
          i += 1;
          let begun = false;
          const dead = setTimeout(() => { if (!begun && token === speakToken) next(); }, 3000); // a locked or silent voice must not stall the call
          u.onstart = () => { begun = true; clearTimeout(dead); started({ text: u.text, audioContext: null, source: null }); };
          u.onend = () => { clearTimeout(dead); next(); };
          u.onerror = () => { clearTimeout(dead); next(); };
          playing = { synth: true };
          synth.speak(u);
        };
        next();
      });
    }

    // ── The browser's recognizer ───────────────────────────────────────────
    function startRecog() {
      if (stopped() || rec) return;
      if (isAndroid) closeMic(); // Android gives the microphone to one taker
      recText = '';
      recLive = '';
      recLastAt = 0;
      const r = new Recog();
      rec = r;
      r.lang = lang;
      r.interimResults = true;
      r.continuous = !isAndroid; // Android repeats itself in continuous mode
      r.onresult = (ev) => {
        let live = '';
        let fin = '';
        for (let i = 0; i < ev.results.length; i++) { const res = ev.results[i]; if (res.isFinal) fin += `${res[0].transcript} `; else live += res[0].transcript; }
        recText = fin;
        recLive = live;
        recLastAt = performance.now();
        quietSince = recLastAt;
        warned = false;
        clearTimeout(recQuietTimer);
        recQuietTimer = setTimeout(() => { if (rec === r) { try { r.stop(); } catch { /* ended */ } } }, QUIET_RESTART_MS);
      };
      r.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { rec = null; finish('The microphone is blocked. Allow it in your browser to talk, or keep going here.', 'mic', true); } else if (ev.error === 'audio-capture') { rec = null; finish('No microphone could be used, so the call ended. You can keep going here.', 'mic', true); }
      };
      r.onend = () => {
        if (rec !== r) return;
        rec = null;
        clearTimeout(recQuietTimer);
        if (stopped()) return;
        const text = `${recText}${recLive}`.trim();
        if (text && state === 'listening') {
          const stopAt = recLastAt;
          const detectedAt = performance.now();
          takeTurn({ stopAt, detectedAt, hearing: Promise.resolve(text), interrupted: fromInterrupt });
          fromInterrupt = false;
          return;
        }
        if (state === 'listening') setTimeout(startRecog, 120); // it stops by itself after a silence: keep listening
      };
      try { r.start(); } catch { rec = null; setTimeout(() => { if (state === 'listening') startRecog(); }, 300); }
    }
    function stopRecog() {
      clearTimeout(recQuietTimer);
      if (rec) { const r = rec; rec = null; r.onend = null; r.onresult = null; r.onerror = null; try { r.abort ? r.abort() : r.stop(); } catch { /* ended */ } }
    }

    // ── The clock: a quiet call hangs up, a long one stops ──────────────────
    function watch() {
      if (stopped()) return;
      const now = performance.now();
      if (document.hidden) {
        if (!hiddenAt) hiddenAt = now;
        if (now - hiddenAt > 15000) { finish('The page was in the background, so the call ended.', 'hidden'); return; }
      } else hiddenAt = 0;
      if (state !== 'listening' || inSpeech) return;
      const quiet = (now - quietSince) / 1000;
      if (quiet >= (Number(info.silence_end_s) || 35)) { hangUp(info.notices.ending_quiet, 'It went quiet, so the call ended.', 'quiet'); return; }
      if (!warned && quiet >= (Number(info.silence_warn_s) || 20)) {
        warned = true;
        giraffe.say('Still there?', 6000);
        if (listenWay === 'browser') stopRecog();
        const at = quietSince;
        speak(info.notices.still_there).then(() => {
          if (stopped() || inSpeech) return; // they answered it by talking over it
          // The warning does not restart the clock.
          resetSpeech();
          talkEndedAt = performance.now();
          deafUntil = talkEndedAt + AFTER_TALK_DEAF_MS;
          setState('listening');
          if (listenWay === 'browser') startRecog();
          quietSince = at;
        });
      }
    }
    async function hangUp(spoken, visible, reason, toChat) {
      if (stopped() || hangUp.going) return;
      hangUp.going = true;
      stopRecog();
      turnToken += 1;
      giraffe.say(visible);
      try { await Promise.race([speak(spoken), new Promise((r) => setTimeout(r, 7000))]); } catch { /* the words are on screen */ }
      finish(visible, reason, toChat);
    }

    // ── Start and finish ───────────────────────────────────────────────────
    async function start() {
      state = 'starting';
      unlock();
      const fail = (why) => { state = 'ended'; cleanup(); onRefused(why); };
      const canCapture = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && AC);
      listenWay = info.speech === 'gateway' && canCapture ? 'gateway' : (Recog ? 'browser' : null);
      speakWay = info.speech === 'gateway' && AC ? 'gateway' : (synthOk() ? 'browser' : null);
      if (!listenWay || !speakWay) { fail('Voice does not work in this browser. You can type here instead.'); return; }
      let started;
      try {
        const r = await fetch('/api/tutor/call/start', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
        started = await r.json();
        if (!r.ok) { fail(started.error || 'Voice is not available right now. You can type here instead.'); return; }
      } catch { fail('Voice needs a connection. You can type here instead.'); return; }
      callId = started.call_id;
      Object.assign(info, started);
      if (state !== 'starting') { endOnServer('cancelled'); return; }
      if (listenWay === 'gateway' || !isAndroid) {
        try {
          await openMic();
        } catch (err) {
          endOnServer('mic');
          fail(err && err.name === 'NotFoundError' ? 'No microphone was found. You can type here instead.' : 'The microphone is blocked. Allow it in your browser to talk, or type here instead.');
          return;
        }
      }
      if (state !== 'starting') { endOnServer('cancelled'); closeMic(); return; }
      try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch { /* the screen may dim */ }
      maxTimer = setTimeout(() => hangUp(info.notices.ending_limit, 'That is the limit for one call. You can keep going here.', 'limit', true).then(() => {}), (Number(info.max_s) || 600) * 1000);
      watchTimer = setInterval(watch, 500);
      window.addEventListener('pagehide', onLeave);
      giraffe.setLabels('End the voice call', 'Switch the call to chat');
      quietSince = performance.now();
      setState('listening');
      publish();
      if (listenWay === 'browser') startRecog();
      setTimeout(() => {
        if (listenWay === 'gateway' && ac && ac.state !== 'running' && !stopped()) finish('Your browser did not let the call start its sound. You can type here instead.', 'audio', true);
      }, 3000);
    }

    function cleanup() {
      clearTimeout(maxTimer);
      clearInterval(watchTimer);
      window.removeEventListener('pagehide', onLeave);
      stopRecog();
      stopTalking();
      closeMic();
      if (wake) { try { wake.release(); } catch { /* gone */ } wake = null; }
      if (ac) { try { ac.close(); } catch { /* closed */ } ac = null; }
      resetSpeech();
      preRoll = [];
    }

    function endOnServer(reason) {
      if (!callId) return;
      const body = JSON.stringify({ call: callId, reason, listen: listenWay, speak: speakWay, turns });
      const id = callId;
      callId = null;
      try {
        // A page going away still gets its goodbye through.
        fetch('/api/tutor/call/end', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body }).catch(() => {});
      } catch { /* the server closes it by itself */ }
      return id;
    }

    function onLeave() { if (stopped()) return; state = 'ended'; endOnServer('left'); cleanup(); }

    function finish(why, reason, toChat) {
      if (stopped()) return;
      state = 'ended';
      publish();
      cleanup();
      endOnServer(reason || 'ended');
      onEnded(why, { toChat: !!toChat });
    }

    return {
      start,
      unlock,
      end(why) { if (state === 'starting') { state = 'ended'; cleanup(); onEnded(why, { toChat: false }); return; } finish(why, 'tap'); },
      toChat() { if (state === 'starting') { state = 'ended'; cleanup(); onEnded('', { toChat: true }); return; } finish('', 'to_chat', true); },
      state: () => state,
    };
  }

  window.TutorCall = { create, sentences, looksUnfinished, last: null };
}());
