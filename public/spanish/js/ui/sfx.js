/* Sound effects, synthesised in the browser with the Web Audio API.
 *
 * No audio files: every sound is a few oscillator notes written here, so they
 * are ours, weigh nothing, and need no licence. Browsers only allow audio after
 * a user gesture; the first ES.sfx.play() call after a tap unlocks the context.
 * Respects the learner's "Sound effects" setting through ES.sfx.enabled.
 */
(function () {
  let ctx = null;
  const sfx = { enabled: true, volume: 0.35 };

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One note: frequency (Hz), start offset (s), length (s), waveform, gain.
  function note(ac, out, { f, at = 0, len = 0.15, type = 'sine', gain = 1, slideTo = null }) {
    const t0 = ac.currentTime + at;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + len);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + len + 0.02);
  }

  // The sound palette. Pitches are a C-major pentatonic, so any two sounds
  // that overlap still agree with each other.
  const SOUNDS = {
    tap:      [{ f: 880, len: 0.05, type: 'triangle', gain: 0.4 }],
    select:   [{ f: 660, len: 0.06, type: 'triangle', gain: 0.5 }],
    correct:  [{ f: 784, len: 0.12, type: 'triangle' }, { f: 1175, at: 0.09, len: 0.22, type: 'triangle' }],
    wrong:    [{ f: 220, len: 0.18, type: 'square', gain: 0.25, slideTo: 165 }, { f: 207, at: 0.12, len: 0.22, type: 'square', gain: 0.2, slideTo: 150 }],
    pair:     [{ f: 1047, len: 0.08, type: 'triangle', gain: 0.6 }],
    combo:    [{ f: 784, len: 0.08, type: 'triangle' }, { f: 988, at: 0.07, len: 0.08, type: 'triangle' }, { f: 1319, at: 0.14, len: 0.2, type: 'triangle' }],
    complete: [523, 659, 784, 1047, 1319].map((f, i) => ({ f, at: i * 0.09, len: 0.28, type: 'triangle', gain: 0.8 })),
    streak:   [{ f: 392, len: 0.35, type: 'sawtooth', gain: 0.15, slideTo: 1568 }, { f: 1568, at: 0.3, len: 0.3, type: 'triangle', gain: 0.6 }],
    chest:    [{ f: 1319, len: 0.1, type: 'triangle' }, { f: 1568, at: 0.08, len: 0.1, type: 'triangle' }, { f: 2093, at: 0.16, len: 0.3, type: 'triangle' }],
    tick:     [{ f: 1760, len: 0.03, type: 'square', gain: 0.15 }],
  };

  sfx.play = function play(name) {
    if (!sfx.enabled || !SOUNDS[name]) return;
    const ac = audio();
    if (!ac) return;
    const out = ac.createGain();
    out.gain.value = sfx.volume;
    out.connect(ac.destination);
    for (const n of SOUNDS[name]) note(ac, out, n);
  };
  sfx.names = Object.keys(SOUNDS);

  window.ES = window.ES || {};
  window.ES.sfx = sfx;
})();
