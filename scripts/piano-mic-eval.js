// Microphone accuracy for the piano: the same code the browser runs (piano-core.js
// createMicTap -> createNoteListener, hearNotes, pitchIsReal, createOnsetDetector)
// fed with audio in 128-sample blocks, as an AudioWorklet receives it.
//
//   node scripts/piano-mic-eval.js                       synthetic tones only
//   node scripts/piano-mic-eval.js --iowa <dir>          + University of Iowa MIS piano notes (Piano.mf.C4.aiff ...)
//   node scripts/piano-mic-eval.js --real <file>[@notes] + a recording, e.g. chords.ogg@"60,64,67|64,67,72"
//   node scripts/piano-mic-eval.js --json <out.json>     also write every number to a file
//
// Needs ffmpeg on the PATH to decode recordings (audio is resampled to 48 kHz mono).
// Nothing here is shipped or uploaded; the recordings stay where they are.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const P = require('../public/engine/piano/piano-core');

const SR = 48000;
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const args = (k) => process.argv.map((a, i) => (a === k ? process.argv[i + 1] : null)).filter(Boolean);
const out = {};

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rand = rng(7);
function gauss() { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); }
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const ms = (samples) => Math.round((samples / SR) * 10000) / 10;

function decode(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice();
}

/** Synthetic piano-like tone (inharmonic partials, decay, a hammer click). */
function synthNote(m, len, velocity = 1) {
  const outb = new Float32Array(len);
  const f0 = P.midiToFreq(m);
  const B = 0.0004 * Math.pow(2, (m - 60) / 24);
  const decay = 0.6 + (108 - m) / 40;
  for (let k = 1; k <= 16; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > SR / 2 - 1000) break;
    const a = (1 / k) * (m < 40 && k === 1 ? 0.3 : 1);
    const ph = rand() * 2 * Math.PI;
    for (let i = 0; i < len; i++) outb[i] += velocity * a * Math.exp(-i / SR / decay) * Math.min(1, i / 48) * Math.sin((2 * Math.PI * fk * i) / SR + ph);
  }
  for (let i = 0; i < 240 && i < len; i++) outb[i] += velocity * 0.3 * gauss() * (1 - i / 240);
  return outb;
}

/** Run a whole buffer through tap + listener in 128-sample quanta, as the worklet does. */
const TAP = { onset: { riseDb: Number(process.env.RISE) || undefined, levelRiseDb: Number(process.env.LRISE) || undefined, freshDb: process.env.FRESH ? Number(process.env.FRESH) : undefined, levelNeedsAttackDb: process.env.LNA ? Number(process.env.LNA) : undefined, ...(process.env.WEAK ? { weakDb: process.env.WEAK === 'off' ? null : Number(process.env.WEAK) } : {}) } };
function listen(buf, opts = {}) {
  const tap = P.createMicTap(SR, opts.tap || TAP);
  const notes = [];
  const onsets = [];
  const onsetMsgs = [];
  const L = P.createNoteListener(SR, { expected: opts.expected, octaveFree: opts.octaveFree, onNote: (n) => notes.push(n), ...(process.env.WG ? { weakGrowth: Number(process.env.WG) } : {}) });
  let cost = 0;
  let frames = 0;
  for (let i = 0; i < buf.length; i += 128) {
    const msgs = tap.process(buf.subarray(i, Math.min(buf.length, i + 128)), i);
    msgs.forEach((m) => {
      if (m.type === 'onset') { onsets.push(m.sample); onsetMsgs.push(m); }
      const t = process.hrtime.bigint();
      L.message(m);
      if (m.type !== 'onset') { cost += Number(process.hrtime.bigint() - t) / 1e6; frames++; }
    });
  }
  return { notes, onsets, onsetMsgs, msPerFrame: frames ? Math.round((cost / frames) * 100) / 100 : 0, stats: L.stats };
}

function mix(parts, len, noise) {
  const b = new Float32Array(len);
  parts.forEach(({ buf, at, gain }) => { for (let i = 0; i < buf.length && at + i < len; i++) if (at + i >= 0) b[at + i] += buf[i] * (gain || 1); });
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(b[i]));
  const k = peak ? 0.5 / peak : 1;
  for (let i = 0; i < len; i++) b[i] = b[i] * k + (noise || 0) * gauss();
  return b;
}

const TRIADS = [];
for (let root = 48; root <= 72; root++) for (const [q, sh] of [['maj', [0, 4, 7]], ['min', [0, 3, 7]]]) TRIADS.push({ root, q, notes: sh.map((x) => root + x) });
/** A slip: one note of the chord a semitone off (third, fifth or root), or a note left out. */
function slips(ch) {
  const n = ch.notes;
  return [
    { kind: 'third', notes: [n[0], n[1] + (ch.q === 'maj' ? -1 : 1), n[2]] },
    { kind: 'fifth', notes: [n[0], n[1], n[2] + 1] },
    { kind: 'root', notes: [n[0] - 1, n[1], n[2]] },
    { kind: 'missing', notes: [n[0], n[2]] },
  ];
}

/** Chord acceptance through the full pipeline: onset -> attack frame -> hearNotes. */
function chordTrial(noteBuf, played, expected, noise, spreadMs) {
  const len = Math.round(SR * 1.2);
  const parts = played.map((m) => ({ buf: noteBuf(m), at: Math.round(SR * 0.3 + rand() * (spreadMs / 1000) * SR), gain: 0.7 + 0.6 * rand() }));
  const b = mix(parts, len, noise);
  const r = listen(b, { expected: () => expected, own: process.env.OWN });
  const got = new Set(r.notes.filter((x) => x.how === 'onset').map((x) => x.midi));
  const unexpected = r.notes.some((x) => x.unexpected);
  return { all: expected.every((m) => got.has(m)), got: [...got], unexpected, ghost: r.stats.ghosts, ms: r.msPerFrame };
}

function chordSuite(name, noteBuf, noise, spreadMs) {
  let acc = 0;
  let n = 0;
  const rej = { third: [0, 0], fifth: [0, 0], root: [0, 0], missing: [0, 0] };
  const fails = [];
  let cost = 0;
  TRIADS.forEach((ch) => {
    const ok = chordTrial(noteBuf, ch.notes, ch.notes, noise, spreadMs);
    n++;
    cost += ok.ms;
    if (ok.all) acc++; else fails.push(`${P.midiToName(ch.root)}${ch.q} heard ${ok.got.map(P.midiToName).join(' ')}`);
    slips(ch).forEach((s) => {
      const bad = chordTrial(noteBuf, s.notes, ch.notes, noise, spreadMs);
      rej[s.kind][1]++;
      if (!bad.all) rej[s.kind][0]++;
      else fails.push(`slip ${s.kind} on ${P.midiToName(ch.root)}${ch.q} accepted`);
    });
  });
  const rejected = Object.values(rej).reduce((s, x) => s + x[0], 0);
  const slipsN = Object.values(rej).reduce((s, x) => s + x[1], 0);
  const r = { name, noise, spreadMs, rightAccepted: `${acc}/${n}`, slipsRejected: `${rejected}/${slipsN}`, byKind: Object.fromEntries(Object.entries(rej).map(([k, v]) => [k, `${v[0]}/${v[1]}`])), msPerFrame: Math.round((cost / n) * 100) / 100, sampleFails: fails.slice(0, 6) };
  console.log(JSON.stringify(r));
  return r;
}

/** What the microphone path did before this change: YIN on the chord frame, clarity >= 0.7 accepted. */
function oldPathOnChords(noteBuf) {
  let phantom = 0;
  let none = 0;
  let oneRight = 0;
  TRIADS.forEach((ch) => {
    const b = mix(ch.notes.map((m) => ({ buf: noteBuf(m), at: 0 })), 4096 + 2400, 0.003).subarray(2400);
    const p = P.detectPitch(b, SR, { minRms: 0.012 });
    if (!p || p.clarity < 0.7) none++;
    else if (ch.notes.includes(p.midi)) oneRight++;
    else phantom++;
  });
  return { chords: TRIADS.length, phantomNote: phantom, oneOfTheNotes: oneRight, nothing: none };
}

/** Onset timing on a melody built from note recordings placed at known samples. */
function timingSuite(name, noteBuf, truthOffset, noise, seeds) {
  const errs = [];
  let notes = 0;
  let found = 0;
  let rightPitch = 0;
  let extra = 0;
  for (let s = 0; s < seeds; s++) {
    const tempo = 60 + Math.floor(rand() * 100);
    const beat = (60 / tempo) * SR;
    const seq = [];
    let at = Math.round(0.4 * SR);
    let m = 55 + Math.floor(rand() * 15);
    for (let k = 0; k < 16; k++) {
      seq.push({ midi: m, at });
      m = Math.max(43, Math.min(84, m + [-2, -1, 1, 2, 3, -3, 0, 4][Math.floor(rand() * 8)]));
      at += Math.round(beat * [0.5, 1, 1, 1, 2][Math.floor(rand() * 5)] * (0.95 + 0.1 * rand()));
    }
    const len = at + SR;
    // Each note is damped when the next starts (a legato player), the way a key is let go.
    const parts = seq.map((x, k) => {
      const b = noteBuf(x.midi).slice();
      const next = seq[k + 1] ? seq[k + 1].at - x.at + Math.round(0.03 * SR) : b.length;
      for (let i = next; i < b.length; i++) b[i] *= Math.exp(-(i - next) / (0.05 * SR));
      return { buf: b, at: x.at - truthOffset(x.midi), gain: 0.6 + 0.7 * rand() };
    });
    const b = mix(parts, len, noise);
    let k = 0;
    const r = listen(b, { expected: (sample) => { while (k < seq.length - 1 && seq[k + 1].at - sample < 0.06 * SR) k++; return [seq[k].midi]; } });
    notes += seq.length;
    const used = new Set();
    seq.forEach((x) => {
      let best = null;
      r.notes.forEach((n, i) => { if (!used.has(i) && Math.abs(n.sample - x.at) < 0.08 * SR && (!best || Math.abs(n.sample - x.at) < Math.abs(best.n.sample - x.at))) best = { n, i }; });
      if (!best) return;
      used.add(best.i);
      found++;
      if (best.n.midi === x.midi) rightPitch++;
      errs.push((best.n.sample - x.at) / SR * 1000);
    });
    extra += r.notes.length - used.size;
    if (process.env.DEBUG2 && s === Number(process.env.DEBUG2)) {
      seq.forEach((x) => console.log('   truth', ms(x.at), P.midiToName(x.midi)));
      r.notes.forEach((n) => console.log('   note ', ms(n.sample), P.midiToName(n.midi), n.how, n.confidence));
      r.onsetMsgs.forEach((o) => console.log('   onset', ms(o.sample), o.strength, o.levelRise));
    }
    if (process.env.DEBUG) r.notes.forEach((n, i) => { if (!used.has(i)) console.log('  extra', ms(n.sample), P.midiToName(n.midi), n.how, '| nearest truth', seq.reduce((b2, x) => (Math.abs(x.at - n.sample) < Math.abs(b2.at - n.sample) ? x : b2)).at / SR * 1000, P.midiToName(seq.reduce((b2, x) => (Math.abs(x.at - n.sample) < Math.abs(b2.at - n.sample) ? x : b2)).midi)); });
    if (process.env.DEBUG) seq.forEach((x) => { if (!r.notes.some((n) => Math.abs(n.sample - x.at) < 0.08 * SR)) console.log('  missed', ms(x.at), P.midiToName(x.midi)); });
  }
  const abs = errs.map(Math.abs);
  const res = { name, noise, notes, found, rightPitch, extra, medianErrMs: Math.round(median(errs) * 10) / 10, medianAbsMs: Math.round(median(abs) * 10) / 10, p90AbsMs: Math.round(pct(abs, 0.9) * 10) / 10, within20ms: `${abs.filter((e) => e <= 20).length}/${abs.length}` };
  console.log(JSON.stringify(res));
  return res;
}

/** The old way's timing: polled every 45 ms, reported after 2 equal frames, stamped "now - 90 ms". */
function oldTiming(noteBuf, truthOffset) {
  const errs = [];
  for (let s = 0; s < 20; s++) {
    const m = 50 + Math.floor(rand() * 30);
    const start = Math.round((0.3 + rand() * 0.05) * SR);
    const b = mix([{ buf: noteBuf(m), at: start - truthOffset(m) }], start + SR, 0.002);
    const phase = Math.floor(rand() * 45);
    let last = null;
    let held = 0;
    for (let t = phase; t < 1000; t += 45) {
      const end = Math.round((t / 1000) * SR);
      if (end < 4096) continue;
      const p = P.detectPitch(b.subarray(end - 4096, end), SR, { minRms: 0.012 });
      if (!p || p.clarity < 0.7) { held = 0; last = null; continue; }
      if (last === p.midi) held++; else { last = p.midi; held = 1; }
      if (held === 2) { errs.push(t - 90 - (start / SR) * 1000); break; }
    }
  }
  const abs = errs.map(Math.abs);
  return { notes: errs.length, medianErrMs: Math.round(median(errs)), medianAbsMs: Math.round(median(abs)), p90AbsMs: Math.round(pct(abs, 0.9)), within20ms: `${abs.filter((e) => e <= 20).length}/${abs.length}` };
}

// ── 1. synthetic ────────────────────────────────────────────────────────────
const only = (arg('--only') || 'synth,singles,chords,timing,real').split(',');
if (only.includes('synth')) {
console.log('== synthetic piano-like tones ==');
const synthCache = {};
const synth = (m) => (synthCache[m] = synthCache[m] || synthNote(m, Math.round(SR * 1.5)));
out.synthOldPath = oldPathOnChords(synth);
console.log('old mic path on 50 triads:', JSON.stringify(out.synthOldPath));
out.synthChords = [0.002, 0.01].map((nz) => chordSuite('synthetic', synth, nz, 15));
out.synthTiming = timingSuite('synthetic', synth, () => 0, 0.003, 10);
out.synthOldTiming = oldTiming(synth, () => 0);
console.log('old path timing:', JSON.stringify(out.synthOldTiming));
}

// ── 2. University of Iowa piano notes ───────────────────────────────────────
const iowa = arg('--iowa');
if (iowa) {
  console.log('\n== University of Iowa MIS piano (Steinway B), real notes ==');
  const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const cache = {};
  const truth = {};
  const load = (m, dyn = 'mf') => {
    const key = `${dyn}${m}`;
    if (cache[key]) return cache[key];
    const f = path.join(iowa, `Piano.${dyn}.${NAMES[m % 12]}${Math.floor(m / 12) - 1}.aiff`);
    if (!fs.existsSync(f)) return null;
    const x = decode(f);
    // Ground truth start: the level first above 5% of its peak and 10 times the room
    // noise (a 2.5 ms window), then back while it stays above 1% of the peak and 3
    // times the noise. (The noise test matters for the pp files: their room noise is
    // over 5% of their peak, and a plain 5% rule put five pp starts 0.4-0.5 s early,
    // so the "chord" in the uneven-loudness test had its soft note arriving late.)
    let peak = 0;
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    let noise = 0;
    for (let i = 0; i < Math.min(x.length, 4800); i++) noise += x[i] * x[i];
    noise = Math.sqrt(noise / Math.min(x.length, 4800));
    const W = 120;
    let i0 = 0;
    for (let i = 0; i + W < x.length; i += 24) {
      let e = 0;
      for (let q = i; q < i + W; q++) e += x[q] * x[q];
      if (Math.sqrt(e / W) > Math.max(10 * noise, 0.05 * peak)) { i0 = i; break; }
    }
    while (i0 < x.length && Math.abs(x[i0]) < Math.max(0.05 * peak, 10 * noise)) i0++;
    while (i0 > 0 && Math.abs(x[i0 - 1]) > Math.max(0.01 * peak, 3 * noise)) i0--;
    const pre = Math.round(0.05 * SR);
    const trimmed = x.slice(Math.max(0, i0 - pre), i0 + Math.round(2.5 * SR));
    // Fade the room noise in, so the cut is not heard as a start.
    for (let i = 0; i < Math.min(pre, i0); i++) trimmed[i] *= i / Math.min(pre, i0);
    truth[key] = Math.min(pre, i0);
    cache[key] = trimmed;
    return trimmed;
  };
  const have = [];
  for (let m = 36; m <= 84; m++) if (load(m)) have.push(m);
  console.log(`notes loaded: ${have.length} (${P.midiToName(have[0])}-${P.midiToName(have[have.length - 1])})`);
  // Single notes: YIN after the attack, and the ghost guard must not refuse a real note.
  let right = 0; let refused = 0; let octave = 0; let wrong = 0; let none = 0;
  const wrongs = [];
  have.forEach((m) => {
    const x = cache[`mf${m}`];
    const at = truth[`mf${m}`] + Math.round(0.03 * SR);
    const frame = x.subarray(at, at + 4096);
    const p = P.detectPitch(frame, SR, { minRms: 0.005, decimate: 2 });
    if (!p || p.clarity < 0.7) { none++; return; }
    if (!P.pitchIsReal(P.spectrum(frame, SR), p.hz)) { refused++; wrongs.push(`${P.midiToName(m)} refused`); return; }
    if (p.midi === m) right++;
    else if ((p.midi - m) % 12 === 0) { octave++; wrongs.push(`${P.midiToName(m)}->${P.midiToName(p.midi)}`); }
    else { wrong++; wrongs.push(`${P.midiToName(m)}->${P.midiToName(p.midi)}`); }
  });
  out.iowaSingles = { notes: have.length, right, octave, wrong, none, ghostGuardRefusedRealNote: refused, sample: wrongs.slice(0, 8) };
  console.log('single notes (YIN + ghost guard):', JSON.stringify(out.iowaSingles));
  const iowaNote = (m) => load(m) || synthNote(m, Math.round(SR * 1.5));
  if (only.includes('chords')) {
  out.iowaOldPath = oldPathOnChords((m) => { const x = iowaNote(m); return x.subarray(Math.max(0, truth[`mf${m}`] - 1200)); });
  console.log('old mic path on 50 triads of real notes:', JSON.stringify(out.iowaOldPath));
  const aligned = (m) => { const x = iowaNote(m); return x.subarray(truth[`mf${m}`] || 0); };
  out.iowaChords = [[0.001, 0], [0.003, 15], [0.01, 30]].map(([nz, sp]) => chordSuite('iowa', aligned, nz, sp));
  // Dynamics mixed: one note of the chord pp, the others ff (a voiced chord).
  const voiced = (m) => { const dyn = m % 3 === 0 ? 'pp' : 'ff'; const x = load(m, dyn) || load(m); const key = cache[`${dyn}${m}`] ? `${dyn}${m}` : `mf${m}`; return x.subarray(truth[key] || 0); };
  const voicedSet = TRIADS.filter((ch) => ch.notes.every((m) => [48, 52, 55, 60, 64, 67, 72].includes(m) || load(m)));
  let vAcc = 0;
  const vFails = [];
  voicedSet.forEach((ch) => { const t = chordTrial(voiced, ch.notes, ch.notes, 0.002, 10); if (t.all) vAcc++; else vFails.push(`${P.midiToName(ch.root)}${ch.q} heard ${t.got.map(P.midiToName).join(' ')}`); });
  out.iowaVoiced = { chords: voicedSet.length, accepted: vAcc, fails: vFails };
  console.log('chords with uneven loudness (pp/ff where recorded):', JSON.stringify(out.iowaVoiced));
  }
  if (only.includes('timing')) {
  out.iowaTiming = [0.001, 0.005].map((nz) => timingSuite('iowa melodies', (m) => iowaNote(m), (m) => truth[`mf${m}`] || 0, nz, Number(process.env.SEEDS) || 12));
  out.iowaOldTiming = oldTiming((m) => iowaNote(m), (m) => truth[`mf${m}`] || 0);
  console.log('old path timing (real notes):', JSON.stringify(out.iowaOldTiming));
  }
}

// ── 3. recordings of chords or pieces ───────────────────────────────────────
args('--real').forEach((spec) => {
  const [file, notesText] = spec.split('@');
  const x = decode(file);
  const steps = notesText ? notesText.split('|').map((s) => s.split(',').map(Number)) : null;
  console.log(`\n== ${path.basename(file)} (${(x.length / SR).toFixed(1)} s) ==`);
  const blind = listen(x, {});
  console.log('onsets heard:', blind.onsets.length, '| notes without expectations (YIN + ghost guard):', blind.notes.map((n) => `${(n.sample / SR).toFixed(2)}s ${P.midiToName(n.midi)}`).join(', '));
  const rec = { file: path.basename(file), seconds: x.length / SR, onsets: blind.onsets.map((s) => Math.round((s / SR) * 1000)), blind: blind.notes.map((n) => ({ t: Math.round((n.sample / SR) * 1000), midi: n.midi })), ghostsRefused: blind.stats.ghosts };
  if (steps) {
    // The chords are where the normal (not weak) starts are: a lesson knows its place in
    // the score by time, so a weak start inside a held chord must not move it on.
    const strong = blind.onsetMsgs.filter((m) => !m.weak).map((m) => m.sample).filter((o, i, a) => i === 0 || o - a[i - 1] > 0.15 * SR);
    const chordAt = (sample) => { let i = -1; while (i + 1 < strong.length && strong[i + 1] <= sample + 0.01 * SR) i++; return steps[Math.min(Math.max(i, 0), steps.length - 1)]; };
    const r = listen(x, { octaveFree: true, expected: chordAt });
    const byOnset = {};
    r.notes.forEach((n) => { (byOnset[n.sample] = byOnset[n.sample] || []).push(n.midi); });
    rec.expected = Object.entries(byOnset).map(([s, ms2]) => ({ t: Math.round((s / SR) * 1000), heard: ms2, want: chordAt(Number(s)) }));
    rec.extraNotes = rec.expected.reduce((a, e) => a + e.heard.filter((m) => !e.want.some((w) => (w - m) % 12 === 0)).length, 0);
    rec.notesOutsideChordStarts = r.notes.filter((n) => !strong.some((o) => Math.abs(o - n.sample) < 0.03 * SR)).length;
    rec.expected.forEach((e) => console.log(`  ${e.t} ms: want ${e.want.map(P.midiToName).join(' ')} -> heard ${e.heard.map(P.midiToName).join(' ')}`));
    // The same chord starts asked about the wrong chord: a semitone off in any one note, or one left out.
    const delay = Math.round(0.03 * SR);
    let acc = 0; let rej = 0; let nS = 0;
    const starts = strong;
    starts.slice(0, steps.length).forEach((o, i) => {
      const want = steps[i];
      const f = x.subarray(o + delay, o + delay + 4096);
      if (P.hearNotes(f, SR, want, { octaveFree: true }).ok) acc++;
      const wrongs = [];
      want.forEach((m, k) => { [-1, 1].forEach((d) => { const w = want.slice(); w[k] = m + d; wrongs.push(w); }); if (want.length > 2) wrongs.push(want.filter((_, j) => j !== k).concat([])); });
      wrongs.forEach((w) => {
        if (w.length < want.length) return; // a chord with a note left out is the learner's slip, not a question to ask of this recording
        nS++;
        if (!P.hearNotes(f, SR, w, { octaveFree: true }).ok) rej++;
      });
    });
    rec.rightAccepted = `${acc}/${Math.min(starts.length, steps.length)}`;
    rec.wrongRejected = `${rej}/${nS}`;
    console.log(`  right chord accepted ${rec.rightAccepted}; a semitone-off chord rejected ${rec.wrongRejected}; notes not at a chord start ${rec.notesOutsideChordStarts}, wrong pitch class ${rec.extraNotes}`);
  }
  (out.real = out.real || []).push(rec);
});

// ── 4. a pedalled performance against a reference transcription ─────────────
// --pedal <audio>@<reference.json>: the reference is an offline transcription
// ({ seconds, notes: [{ onset, midi }] }, e.g. the ByteDance model's); only its first
// `seconds` are compared. A start is found when an onset is heard within 50 ms of it.
args('--pedal').forEach((spec) => {
  const [file, refFile] = spec.split('@');
  const ref = JSON.parse(fs.readFileSync(refFile, 'utf8'));
  const x = decode(file).subarray(0, Math.round(ref.seconds * SR));
  const truth = ref.notes.map((n) => ({ t: n.onset, midi: n.midi })).sort((a, b) => a.t - b.t);
  const starts = [];
  truth.forEach((n) => { if (!starts.length || n.t - starts[starts.length - 1].t > 0.03) starts.push({ t: n.t, midis: [n.midi] }); else starts[starts.length - 1].midis.push(n.midi); });
  const match = (times) => {
    const used = new Set();
    const errs = [];
    let found = 0;
    starts.forEach((st) => {
      let best = -1;
      times.forEach((t, i) => { if (!used.has(i) && Math.abs(t - st.t) <= 0.05 && (best < 0 || Math.abs(t - st.t) < Math.abs(times[best] - st.t))) best = i; });
      if (best >= 0) { used.add(best); found++; errs.push((times[best] - st.t) * 1000); }
    });
    return { found, extra: times.length - used.size, errs };
  };
  const blind = listen(x, {});
  // Strong starts as before; weak ones (patch: kept only when a note grew) are counted apart.
  const on = match(blind.onsetMsgs.filter((m) => !m.weak).map((m) => m.sample / SR));
  const noteTimes = blind.notes.map((n) => n.sample / SR);
  let pcRight = 0; let reported = 0;
  blind.notes.forEach((n) => {
    const st = starts.find((s) => Math.abs(s.t - n.sample / SR) <= 0.05);
    if (!st) return;
    reported++;
    if (st.midis.some((m) => (m - n.midi) % 12 === 0)) pcRight++;
  });
  // Score-informed, as a lesson listens: each start's own notes are expected around it.
  let k = 0;
  const informed = listen(x, { octaveFree: true, expected: (sample) => { const t = sample / SR; while (k < starts.length - 1 && starts[k + 1].t - t < 0.06) k++; return starts[k].midis; } });
  const inf = match(informed.notes.map((n) => n.sample / SR));
  const res = {
    file: path.basename(file), seconds: ref.seconds, starts: starts.length,
    onsetsFound: `${on.found}/${starts.length}`, extraOnsets: on.extra, medianAbsMs: Math.round(median(on.errs.map(Math.abs)) * 10) / 10,
    blindNotesAtStarts: reported, pitchClassRight: `${pcRight}/${reported}`, blindNotesFound: `${match(noteTimes).found}/${starts.length}`,
    blindNotesExtra: match(noteTimes).extra, weakStarts: blind.onsetMsgs.filter((m) => m.weak).length,
    informedNotesFound: `${inf.found}/${starts.length}`, informedExtra: inf.extra,
  };
  console.log(`
== ${path.basename(file)}, first ${ref.seconds} s, against the reference transcription ==`);
  console.log(JSON.stringify(res));
  (out.pedal = out.pedal || []).push(res);
});

const j = arg('--json');
if (j) fs.writeFileSync(j, JSON.stringify(out, null, 1));
