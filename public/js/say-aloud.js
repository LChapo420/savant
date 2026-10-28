/* Say it aloud: the on-device part of a spoken checkpoint (preschool and
 * Kindergarten "Explain Aloud" and "Oral Retell"; services/essays.js oralSubmit).
 *
 * Two things, both on the learner's own device:
 *   - "Read it to me": the browser's speech synthesis, with an on-device voice
 *     only (a voice whose localService is true). A voice that speaks through
 *     a server is never picked, and without an on-device voice the button is
 *     not shown.
 *   - An optional recording the learner can play back to check themselves.
 *     It is held in this page's memory as a blob, played from a blob: URL, and
 *     dropped when they delete it or leave the page. Nothing is uploaded: this
 *     file has no network call of any kind, and scripts/consent-test.js scans it
 *     for one (the no-upload build test). The microphone is released as soon
 *     as a recording stops.
 *
 * Where the microphone is switched off (a child account without a parent's
 * camera-and-mic permission gets Permissions-Policy microphone=()), or the
 * browser cannot record, the recorder says so and saying it to a grown-up is
 * enough: the recording was only ever for the learner.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** An on-device voice, or null. Voices load late in some browsers. */
  function localVoice() {
    if (!('speechSynthesis' in window)) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    var lang = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
    var local = voices.filter(function (v) { return v.localService; });
    return local.filter(function (v) { return String(v.lang || '').toLowerCase().indexOf(lang) === 0; })[0] || null;
  }

  /** Adds a "Read it to me" button for `text` to `host`; none without an on-device voice. */
  function readButton(host, text) {
    if (!('speechSynthesis' in window)) return;
    var draw = function () {
      if (host.querySelector('[data-read-aloud]')) return;
      var voice = localVoice();
      if (!voice) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.setAttribute('data-read-aloud', '');
      b.textContent = 'Read it to me';
      b.addEventListener('click', function () {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      });
      host.appendChild(b);
    };
    draw();
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', draw);
    }
  }

  /** The recorder, drawn into `host`. Returns { stop } so the page can release it. */
  function recorder(host) {
    var canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    var stream = null;
    var rec = null;
    var chunks = [];
    var url = null;
    var closed = false;

    host.innerHTML = '<div class="say-aloud">'
      + '<p class="small muted say-note">You can record yourself and listen back. The recording stays on this device: it is not sent anywhere, and it is gone when you leave this page.</p>'
      + '<div class="row-wrap say-controls"></div>'
      + '<div class="say-player"></div>'
      + '<p class="small say-status" role="status" aria-live="polite"></p>'
      + '</div>';
    var controls = host.querySelector('.say-controls');
    var player = host.querySelector('.say-player');
    var status = host.querySelector('.say-status');

    function release() {
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    }
    function dropRecording() {
      if (url) { URL.revokeObjectURL(url); url = null; }
      chunks = [];
      player.innerHTML = '';
    }
    function draw(state) {
      if (!canRecord) {
        controls.innerHTML = '';
        status.textContent = 'Recording is not available here. Saying it to a grown-up is enough.';
        return;
      }
      if (state === 'recording') {
        controls.innerHTML = '<button type="button" class="btn btn-lg" data-say="stop">Stop</button>';
      } else if (state === 'recorded') {
        controls.innerHTML = '<button type="button" class="btn btn-lg" data-say="again">Record again</button>'
          + '<button type="button" class="btn btn-ghost" data-say="delete">Delete it</button>';
      } else {
        controls.innerHTML = '<button type="button" class="btn btn-lg" data-say="record">Record myself</button>';
      }
    }

    async function start() {
      dropRecording();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        canRecord = false;
        draw();
        status.textContent = 'The microphone is off here. Saying it to a grown-up is enough.';
        return;
      }
      chunks = [];
      rec = new MediaRecorder(stream);
      rec.addEventListener('dataavailable', function (e) { if (e.data && e.data.size) chunks.push(e.data); });
      rec.addEventListener('stop', function () {
        release();
        if (closed) { chunks = []; return; }
        if (!chunks.length) { draw(); return; }
        url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        player.innerHTML = '<audio controls preload="metadata" src="' + esc(url) + '"></audio>';
        draw('recorded');
        status.textContent = 'Recorded. Press play to listen to yourself.';
      });
      rec.start();
      draw('recording');
      status.textContent = 'Recording. Say it now, then press Stop.';
    }

    controls.addEventListener('click', function (e) {
      var b = e.target.closest('[data-say]');
      if (!b) return;
      var what = b.getAttribute('data-say');
      if (what === 'record' || what === 'again') start();
      else if (what === 'stop' && rec && rec.state === 'recording') rec.stop();
      else if (what === 'delete') { dropRecording(); draw(); status.textContent = 'Deleted.'; }
    });

    function stop() {
      closed = true;
      if (rec && rec.state === 'recording') { try { rec.stop(); } catch (err) { /* already stopped */ } }
      release();
      dropRecording();
    }
    window.addEventListener('pagehide', stop);
    draw();
    return { stop: stop };
  }

  window.SayAloud = { readButton: readButton, recorder: recorder };
}());
