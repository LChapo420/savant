/**
 * "Learn from your own material", S8: audio recordings as material.
 *
 * A learner uploads (or records in the browser) mp3, m4a, wav, webm or ogg. The audio is decoded to 16 kHz
 * mono, cut into 30-second chunks, and each chunk goes to an open Whisper model that runs on this server
 * through @huggingface/transformers (ONNX, CPU). No outside speech vendor is ever called. The package and
 * the model files are optional: when either is missing the learner is told so plainly and nothing is made up.
 *
 * The transcript keeps its timestamps, one "[m:ss] text" line per chunk, and is stored as a material of kind
 * 'audio'. The audio itself is held in memory while the job runs and thrown away after; it is never written
 * to disk. A job row (progress, errors) belongs to one learner and goes with their account.
 *
 *   material_audio_jobs   { user_id, title, status: queued|running|done|failed, chunks, done, material_id, error }
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../config/db');
const materials = require('./materials');

const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 30;
const MAX_SECONDS = 2 * 60 * 60;       // two hours of speech
const MAX_ACTIVE_PER_USER = 1;
const JOBS = 'material_audio_jobs';
const MODEL = process.env.WHISPER_MODEL || 'Xenova/whisper-tiny.en';
const MODEL_DIR = process.env.WHISPER_MODEL_DIR || path.join(__dirname, '..', 'data', 'models');

function fail(error, code) { return { error, code }; }

/** The audio container from its first bytes: 'wav', 'mp3', 'm4a', 'ogg', 'webm' or null. */
function sniffAudio(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  const s4 = buf.slice(0, 4).toString('latin1');
  if (s4 === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WAVE') return 'wav';
  if (s4 === 'OggS') return 'ogg';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return 'm4a';
  if (s4.slice(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

/** 16-bit PCM or 32-bit float WAV to 16 kHz mono Float32Array (nearest-lower linear resample). */
function decodeWav(buf) {
  let pos = 12; let fmt = null; let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.slice(pos, pos + 4).toString('latin1');
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    if (id === 'data') { data = buf.slice(body, Math.min(buf.length, body + size)); break; }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) return fail('That WAV file could not be read.', 'unreadable');
  const pcm16 = fmt.format === 1 && fmt.bits === 16;
  const f32 = fmt.format === 3 && fmt.bits === 32;
  if (!pcm16 && !f32) return fail('Only 16-bit or 32-bit float WAV files are supported. Export it as mp3 or m4a instead.', 'bad_type');
  if (!fmt.channels || !fmt.rate) return fail('That WAV file could not be read.', 'unreadable');
  const bytes = pcm16 ? 2 : 4;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const o = (i * fmt.channels + c) * bytes;
      sum += pcm16 ? data.readInt16LE(o) / 32768 : data.readFloatLE(o);
    }
    mono[i] = sum / fmt.channels;
  }
  if (fmt.rate === SAMPLE_RATE) return { samples: mono };
  const n = Math.floor(frames * SAMPLE_RATE / fmt.rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * fmt.rate / SAMPLE_RATE; const i0 = Math.floor(t); const i1 = Math.min(frames - 1, i0 + 1);
    out[i] = mono[i0] + (mono[i1] - mono[i0]) * (t - i0);
  }
  return { samples: out };
}

/** The ffmpeg binary, if the optional ffmpeg-static package (or FFMPEG_PATH) is there. */
function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try { return require('ffmpeg-static'); } catch { return null; } // eslint-disable-line global-require
}

/** Any container to 16 kHz mono float samples, through ffmpeg (stdin to stdout, nothing on disk). */
function decodeWithFfmpeg(buf, bin) {
  return new Promise((resolve) => {
    const p = spawn(bin, ['-v', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-t', String(MAX_SECONDS + 1), '-f', 'f32le', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const parts = [];
    p.stdout.on('data', (d) => parts.push(d));
    p.on('error', () => resolve(fail('The audio decoder could not start.', 'no_decoder')));
    p.on('close', (code) => {
      const raw = Buffer.concat(parts);
      if (code !== 0 || raw.length < 4) return resolve(fail('That audio file could not be read. It may be damaged.', 'unreadable'));
      const copy = Buffer.from(raw);
      resolve({ samples: new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.length / 4)) });
    });
    p.stdin.on('error', () => {});
    p.stdin.end(buf);
  });
}

async function decode(buf, type, deps = {}) {
  if (type === 'wav') return decodeWav(buf);
  const bin = deps.ffmpeg === undefined ? ffmpegPath() : deps.ffmpeg;
  if (!bin) return fail('This server cannot read mp3, m4a, webm or ogg yet: its audio decoder (ffmpeg-static) is not installed. A WAV file works, or paste a transcript.', 'no_decoder');
  return decodeWithFfmpeg(buf, bin);
}

/** Cut samples into windows of `seconds`; a last window shorter than one second joins the one before. */
function chunk(samples, seconds = CHUNK_SECONDS, rate = SAMPLE_RATE) {
  const size = seconds * rate;
  const out = [];
  for (let start = 0; start < samples.length; start += size) {
    out.push({ start: start / rate, samples: samples.subarray(start, Math.min(samples.length, start + size)) });
  }
  if (out.length > 1 && out[out.length - 1].samples.length < rate) {
    const last = out.pop(); const prev = out[out.length - 1];
    prev.samples = samples.subarray(Math.round(prev.start * rate), Math.round(prev.start * rate) + prev.samples.length + last.samples.length);
  }
  return out;
}

function stamp(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Is the local Whisper model usable? { ready, reason } — never throws, never touches the network. */
function availability() {
  try { require.resolve('@huggingface/transformers'); } catch {
    return { ready: false, reason: 'Audio transcription is not installed on this server yet (the @huggingface/transformers package is missing).' };
  }
  if (!fs.existsSync(path.join(MODEL_DIR, ...MODEL.split('/')))) {
    return { ready: false, reason: `Audio transcription needs the Whisper model "${MODEL}" in ${path.relative(path.join(__dirname, '..'), MODEL_DIR)}, and it is not there yet.` };
  }
  return { ready: true, reason: null };
}

let cachedTranscriber = null;
/** The real transcriber: local files only, so it can never download a model or call out. */
async function realTranscriber() {
  if (cachedTranscriber) return cachedTranscriber;
  const tf = await import('@huggingface/transformers'); // eslint-disable-line import/no-unresolved
  tf.env.allowRemoteModels = false;
  tf.env.localModelPath = MODEL_DIR;
  const asr = await tf.pipeline('automatic-speech-recognition', MODEL);
  cachedTranscriber = async (samples) => {
    const out = await asr(samples);
    return String((out && out.text) || '').trim();
  };
  return cachedTranscriber;
}

function sweepStale() {
  for (const j of db.find(JOBS, (x) => x.status === 'queued' || x.status === 'running')) {
    if (!activeIds.has(j.id)) db.update(JOBS, j.id, { status: 'failed', error: 'The server restarted while this was being transcribed. Upload it again.', buffer_free: true });
  }
}
const activeIds = new Set();

function pubJob(j) {
  return { id: j.id, title: j.title, status: j.status, chunks: j.chunks, done: j.done, percent: j.chunks ? Math.round(100 * j.done / j.chunks) : 0, material_id: j.material_id || null, error: j.error || null };
}

function listJobs(userId) {
  sweepStale();
  return db.find(JOBS, (j) => j.user_id === userId).map(pubJob);
}

function removeJob(userId, id) {
  const n = db.remove(JOBS, (j) => j.id === Number(id) && j.user_id === userId && !activeIds.has(j.id));
  if (n) db.flush();
  return n > 0;
}

/**
 * Accept an audio upload: check type and room, then transcribe in the background. Returns
 * { job } at once, or { error, code }. deps (for tests): transcribe(samples) -> text, ffmpeg, onFinish().
 */
function submit(userId, buf, name, deps = {}) {
  if (!Buffer.isBuffer(buf) || !buf.length) return fail('The file is empty.', 'empty');
  if (buf.length > materials.MAX_BYTES) return fail('That file is over 20 MB. Record or export a shorter part.', 'too_big');
  const type = sniffAudio(buf);
  if (!type) return fail('That does not look like an audio file. mp3, m4a, wav, webm and ogg are supported.', 'bad_type');
  if (!deps.transcribe) {
    const a = availability();
    if (!a.ready) return fail(a.reason, 'no_transcriber');
  }
  sweepStale();
  if (db.find(JOBS, (j) => j.user_id === userId && (j.status === 'queued' || j.status === 'running')).length >= MAX_ACTIVE_PER_USER) {
    return fail('One recording is already being transcribed. Wait for it to finish.', 'busy');
  }
  const base = String(name || '').replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'Recording';
  const row = db.insert(JOBS, { user_id: userId, title: base.slice(0, 120), source_name: String(name || '').slice(0, 120), type, status: 'queued', chunks: 0, done: 0, material_id: null, error: null });
  activeIds.add(row.id);
  const finished = run(userId, row.id, buf, type, deps).catch((err) => {
    db.update(JOBS, row.id, { status: 'failed', error: 'The transcription stopped unexpectedly.' });
    console.warn(`material-audio: ${err.message}`);
  }).then(() => { activeIds.delete(row.id); if (deps.onFinish) deps.onFinish(); });
  return { job: pubJob(row), finished };
}

// One transcription at a time on the whole server: the model is CPU-heavy.
let chain = Promise.resolve();
function run(userId, jobId, buf, type, deps) {
  const mine = chain.then(() => work(userId, jobId, buf, type, deps));
  chain = mine.catch(() => {});
  return mine;
}

async function work(userId, jobId, buf, type, deps) {
  const set = (patch) => db.update(JOBS, jobId, patch);
  set({ status: 'running' });
  const dec = await decode(buf, type, deps);
  if (dec.error) return set({ status: 'failed', error: dec.error });
  if (dec.samples.length / SAMPLE_RATE > MAX_SECONDS) return set({ status: 'failed', error: 'That recording is over two hours. Upload a shorter part.' });
  if (dec.samples.length < SAMPLE_RATE) return set({ status: 'failed', error: 'That recording is too short to transcribe.' });
  const parts = chunk(dec.samples);
  set({ chunks: parts.length, done: 0 });
  let transcribe;
  try { transcribe = deps.transcribe || await realTranscriber(); } catch {
    return set({ status: 'failed', error: 'The Whisper model could not be loaded on this server.' });
  }
  const lines = [];
  for (let i = 0; i < parts.length; i++) {
    let text = '';
    try { text = await transcribe(parts[i].samples); } catch { return set({ status: 'failed', error: `Transcription failed at ${stamp(parts[i].start)}.` }); }
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (text) lines.push(`[${stamp(parts[i].start)}] ${text}`);
    set({ done: i + 1 });
  }
  const text = lines.join('\n');
  if (text.length < materials.MIN_CHARS) return set({ status: 'failed', error: 'Hardly any speech could be made out in that recording.' });
  if (text.length > materials.MAX_CHARS) return set({ status: 'failed', error: 'The transcript is longer than the limit. Upload a shorter part.' });
  const job = db.byId(JOBS, jobId);
  if (!job) return undefined; // the learner deleted the job (or the account) meanwhile: keep nothing
  const added = materials.add(userId, { title: job.title, text, kind: 'audio', pages: null, sourceName: job.source_name });
  if (added.error) return set({ status: 'failed', error: added.error });
  return set({ status: 'done', material_id: added.value.id });
}

module.exports = {
  SAMPLE_RATE, CHUNK_SECONDS, MAX_SECONDS,
  sniffAudio, decodeWav, decode, chunk, stamp, availability, submit, listJobs, removeJob,
};
