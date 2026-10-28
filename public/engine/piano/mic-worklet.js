/* The microphone tap, on the audio thread (an AudioWorklet).
 *
 * Every 128-sample block of microphone audio goes through piano-core.js's
 * createMicTap: it finds where each note starts to the sample (about 1.3 ms
 * blocks, walked back to where the rise began) and hands the page the frames to
 * judge: the frame 30 ms after each start, and the newest frame every 2048 samples.
 * Sample numbers come from the audio clock (currentFrame), not from when the page
 * gets round to looking, so a note's time is when it was played, not when it was
 * noticed.
 *
 * Audio never leaves this device: the frames go to the page that opened the
 * microphone, which judges them and drops them. Loaded by piano-io.js after
 * piano-core.js (addModule), both from this site.
 */
/* global AudioWorkletProcessor, registerProcessor, sampleRate, currentFrame */
class PolymathMicTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.tap = globalThis.PolymathPiano.createMicTap(sampleRate, o);
    this.mono = null;
    this.on = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.on = false; };
  }

  process(inputs) {
    if (!this.on) return false;
    const input = inputs[0];
    if (!input || !input.length || !input[0]) return true;
    let samples = input[0];
    if (input.length > 1) {
      if (!this.mono || this.mono.length !== samples.length) this.mono = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        let s = 0;
        for (let c = 0; c < input.length; c++) s += input[c][i];
        this.mono[i] = s / input.length;
      }
      samples = this.mono;
    }
    const msgs = this.tap.process(samples, currentFrame);
    for (let k = 0; k < msgs.length; k++) {
      const m = msgs[k];
      if (m.buf) this.port.postMessage(m, m.pre ? [m.buf.buffer, m.pre.buffer] : [m.buf.buffer]); else this.port.postMessage(m);
    }
    return true;
  }
}

registerProcessor('polymath-mic-tap', PolymathMicTap);
