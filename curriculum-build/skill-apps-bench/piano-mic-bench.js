// Run: R=1.1 F=0.1 node curriculum-build/skill-apps-bench/piano-mic-bench.js public/engine/piano/piano-core.js (absolute path)
// Scratch benchmark (not app code): accuracy and cost of Savant's existing YIN detector
// (piano-core.js detectPitch) on synthetic piano-like tones, plus a prototype
// "expected-notes verifier" (score-informed harmonic template check) for chords.
// Synthetic tones: inharmonic partials (B coefficient), 1/k amplitude roll-off, exp decay,
// a hammer-noise burst, optional white noise. Real pianos and rooms are harder.
const path = process.argv[2];
const P = require(path);
const SR = 48000;
const N = 4096; const RATIO = +(process.env.R||1.3); const RATIO_FLOOR = +(process.env.F||0.25);

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rand = rng(42);
function gauss() { let u = 0, v = 0; while (u === 0) u = rand(); v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function pianoTone(midis, len, t0, noise) {
  const out = new Float32Array(len);
  for (const m of midis) {
    const f0 = 440 * Math.pow(2, (m - 69) / 12);
    const B = 0.0004 * Math.pow(2, (m - 60) / 24); // more inharmonic higher up (rough)
    const decay = 0.6 + (108 - m) / 40; // seconds
    for (let k = 1; k <= 16; k++) {
      const fk = k * f0 * Math.sqrt(1 + B * k * k);
      if (fk > SR / 2 - 1000) break;
      const a = (1 / k) * (m < 40 && k === 1 ? 0.3 : 1); // weak fundamental in the bass
      const ph = rand() * 2 * Math.PI;
      for (let i = 0; i < len; i++) {
        const t = (i + t0) / SR;
        out[i] += a * Math.exp(-t / decay) * Math.sin(2 * Math.PI * fk * t + ph);
      }
    }
  }
  let peak = 0; for (const x of out) peak = Math.max(peak, Math.abs(x));
  for (let i = 0; i < len; i++) out[i] = (out[i] / peak) * 0.3 + noise * gauss();
  return out;
}

// --- 1. YIN single notes across the keyboard ---------------------------------
function yinTest(noise, offsetMs) {
  let right = 0, octave = 0, none = 0, wrong = 0, total = 0, ms = 0;
  const wrongs = [];
  for (let m = 21; m <= 108; m++) {
    const buf = pianoTone([m], N, Math.round(SR * offsetMs / 1000), noise);
    const t = process.hrtime.bigint();
    const p = P.detectPitch(buf, SR, { minRms: 0.005 });
    ms += Number(process.hrtime.bigint() - t) / 1e6;
    total++;
    if (!p) none++;
    else if (p.midi === m) right++;
    else if ((p.midi - m) % 12 === 0) { octave++; wrongs.push(`${P.midiToName(m)}->${P.midiToName(p.midi)}`); }
    else { wrong++; wrongs.push(`${P.midiToName(m)}->${P.midiToName(p.midi)}`); }
  }
  return { noise, offsetMs, total, right, octave, wrong, none, msPerFrame: +(ms / total).toFixed(2), sample: wrongs.slice(0, 12) };
}

// --- 2. Prototype expected-notes verifier ------------------------------------
// FFT magnitude, then for each MIDI note a salience = sum over first 6 partials of the
// peak magnitude near k*f0 (inharmonicity-tolerant, +-35 cents), compared with the
// salience of the neighbouring semitones. A note "present" when its salience beats both
// neighbours by a margin and passes an absolute floor relative to the frame's max.
function fftMag(buf) {
  const n = 8192; const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < buf.length; i++) re[i] = buf[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (buf.length - 1)));
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
      re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai; re[i + k] += ar; im[i + k] += ai;
      const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
  const mag = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return { mag, binHz: SR / n };
}
function salience(spec, m) {
  const f0 = 440 * Math.pow(2, (m - 69) / 12); let s = 0;
  for (let k = 1; k <= 6; k++) {
    const f = k * f0; if (f > 8000) break;
    const lo = Math.floor(f * Math.pow(2, -35 / 1200) / spec.binHz), hi = Math.ceil(f * Math.pow(2, 45 / 1200) / spec.binHz);
    let pk = 0; for (let b = lo; b <= hi; b++) pk = Math.max(pk, spec.mag[b] || 0);
    s += pk / Math.sqrt(k);
  }
  return s;
}
function verify(buf, expected) {
  const spec = fftMag(buf);
  const sal = {}; for (let m = 20; m <= 109; m++) sal[m] = salience(spec, m);
  let max = 0; for (let m = 21; m <= 108; m++) max = Math.max(max, sal[m]);
  const present = (m) => sal[m] > RATIO_FLOOR * max && sal[m] > RATIO * sal[m - 1] && sal[m] > RATIO * sal[m + 1];
  return expected.every(present);
}
function chordTest(noise) {
  // Root-position triads in the middle register; "wrong" = one note a semitone off.
  let tp = 0, fn = 0, tn = 0, fp = 0, ms = 0, n = 0;
  for (let root = 48; root <= 72; root++) {
    for (const shape of [[0, 4, 7], [0, 3, 7]]) {
      const want = shape.map((x) => root + x);
      const okBuf = pianoTone(want, N, 2400, noise);
      const t = process.hrtime.bigint();
      const ok = verify(okBuf, want);
      ms += Number(process.hrtime.bigint() - t) / 1e6; n++;
      ok ? tp++ : fn++;
      const played = want.slice(); played[1] += (shape[1] === 4 ? -1 : 1); // major<->minor slip
      const badBuf = pianoTone(played, N, 2400, noise);
      verify(badBuf, want) ? fp++ : tn++;
    }
  }
  return { noise, rightChordAccepted: `${tp}/${tp + fn}`, slipRejected: `${tn}/${tn + fp}`, msPerFrame: +(ms / n).toFixed(2) };
}

console.log('YIN single notes, window 4096 @48kHz (85 ms), frame taken 50 ms after onset');
for (const nz of [0, 0.01, 0.03]) console.log(JSON.stringify(yinTest(nz, 50)));
console.log('YIN, frame taken at the onset (hammer transient region)');
console.log(JSON.stringify(yinTest(0.01, 0)));
console.log('YIN on a C major triad (what the mic path does today with chords):');
const tri = P.detectPitch(pianoTone([60, 64, 67], N, 2400, 0.01), SR, { minRms: 0.005 });
console.log(JSON.stringify(tri));
console.log('Prototype expected-notes verifier, triads C3..C5 major/minor, slip = third moved a semitone');
for (const nz of [0, 0.01, 0.03]) console.log(JSON.stringify(chordTest(nz)));
