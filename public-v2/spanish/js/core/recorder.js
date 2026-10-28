/* Microphone recording for speaking exercises.
 *
 * Records raw PCM through Web Audio and encodes 16 kHz mono WAV, because the
 * speech recogniser (MiMo ASR) reads wav/mp3/ogg but not the webm that
 * MediaRecorder produces in most browsers. While recording it reports a live
 * level (for the meter) and measures pauses, so fluency can be scored on speech
 * rate and pausing without trusting the transcript for timing.
 *
 *   const rec = await ES.recorder.start({ onLevel, maxMs })
 *   const { wav, durationMs, pauseMs, speechMs } = await rec.stop()
 *   const text = await ES.recorder.transcribe(wav)
 */
(function () {
  const ES = window.ES;
  const TARGET_RATE = 16000;
  const SILENCE = 0.018;       // RMS below this is silence
  const LONG_PAUSE_MS = 600;   // a gap this long counts as a pause

  function downsample(buf, from, to) {
    if (from === to) return buf;
    const ratio = from / to;
    const out = new Float32Array(Math.floor(buf.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const start = Math.floor(i * ratio); const end = Math.min(buf.length, Math.floor((i + 1) * ratio));
      let sum = 0; for (let j = start; j < end; j++) sum += buf[j];
      out[i] = sum / Math.max(1, end - start);
    }
    return out;
  }

  function wavBlob(samples, rate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([v], { type: 'audio/wav' });
  }

  async function start({ onLevel, maxMs = 15000, stream: given } = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('No microphone API in this browser.'), { code: 'unsupported' });
    let stream = given;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      } catch (err) {
        throw Object.assign(new Error('Microphone blocked.'), { code: 'denied', cause: err });
      }
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const source = ac.createMediaStreamSource(stream);
    const proc = ac.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    const t0 = performance.now();
    let heard = false; let silentSince = null; let pauseMs = 0; let speechMs = 0; let lastT = t0;
    proc.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
      let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now(); const dt = now - lastT; lastT = now;
      if (onLevel) onLevel(Math.min(1, rms * 6));
      if (rms >= SILENCE) {
        speechMs += dt;
        if (heard && silentSince && now - silentSince >= LONG_PAUSE_MS) pauseMs += now - silentSince;
        heard = true; silentSince = null;
      } else if (heard && !silentSince) silentSince = now;
    };
    source.connect(proc); proc.connect(ac.destination);
    let stopped = null;
    const stop = () => {
      if (stopped) return stopped;
      stopped = (async () => {
        proc.disconnect(); source.disconnect();
        if (!given) stream.getTracks().forEach((t) => t.stop());
        const rate = ac.sampleRate; await ac.close();
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const all = new Float32Array(total); let o = 0;
        for (const c of chunks) { all.set(c, o); o += c.length; }
        const samples = downsample(all, rate, TARGET_RATE);
        return { wav: wavBlob(samples, TARGET_RATE), durationMs: Math.round(performance.now() - t0), pauseMs: Math.round(pauseMs), speechMs: Math.round(speechMs), heard };
      })();
      return stopped;
    };
    const timer = setTimeout(stop, maxMs);
    return { stop: () => { clearTimeout(timer); return stop(); }, startedAt: t0 };
  }

  async function transcribe(wav) {
    const r = await ES.api.raw('/api/es/asr?kind=wav', wav, 'audio/wav');
    return r.transcript || '';
  }

  ES.recorder = { start, transcribe, wavBlob };
})();
