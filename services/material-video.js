/**
 * Video files for "My material" (mp4, mov, webm, mkv): pull the audio track out on this machine with ffmpeg
 * (the `ffmpeg-static` binary, else `ffmpeg` on the PATH) as small mono Opus, and hand it to the S8 audio job
 * (services/material-audio.js), which transcribes it in the background with progress. The video is read from a
 * private temp folder (mp4 needs a seekable file) that is deleted as soon as the audio is out, success or
 * failure; the audio itself lives in memory only, as in S8. No outside vendor is called. If ffmpeg or the
 * speech model is missing the learner is told so plainly, before any work is done.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { fail } = require('./material-parsers');

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_SECONDS = 2 * 60 * 60;         // same two hour cap as audio (S8)
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

/** 'mp4', 'mov', 'webm', 'mkv' or null from the first bytes (the name is never trusted). */
function sniffVideo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('latin1');
    return brand === 'qt  ' ? 'mov' : 'mp4';
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return /matroska/.test(buf.slice(0, 64).toString('latin1')) ? 'mkv' : 'webm';
  }
  return null;
}

function ffmpegPath() {
  try { const p = require('ffmpeg-static'); if (p && fs.existsSync(p)) return p; } catch { /* optional */ } // eslint-disable-line global-require
  return 'ffmpeg';
}

/** Run ffmpeg to write 16 kHz mono Opus in a webm (about 11 MB per hour). Resolves { bytes } or an error. */
function extractAudio(inFile, outFile, opts = {}) {
  return new Promise((resolve) => {
    const bin = opts.ffmpeg || ffmpegPath();
    const args = ['-nostdin', '-v', 'error', '-i', inFile, '-vn', '-t', String(MAX_SECONDS), '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '24k', '-y', outFile];
    let done = false; let err = '';
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    let p;
    try { p = (opts.spawn || spawn)(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] }); } catch { return finish(fail('Video support is not set up on this server (ffmpeg is missing).', 'no_ffmpeg')); }
    const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } finish(fail('That video took too long to process.', 'timeout')); }, opts.timeoutMs || FFMPEG_TIMEOUT_MS);
    p.stderr && p.stderr.on('data', (d) => { if (err.length < 2000) err += d; });
    p.on('error', (e) => finish(e && e.code === 'ENOENT' ? fail('Video support is not set up on this server (ffmpeg is missing).', 'no_ffmpeg') : fail('That video could not be processed.', 'unreadable')));
    p.on('close', (code) => {
      if (code !== 0) return finish(fail(/does not contain any stream|Stream map|no audio/i.test(err) ? 'That video has no sound track, so there is nothing to transcribe.' : 'That video could not be read. It may be damaged.', /sound track/.test(err) || /does not contain|Stream map/.test(err) ? 'no_audio' : 'unreadable'));
      let size = 0; try { size = fs.statSync(outFile).size; } catch { /* missing */ }
      if (size < 400) return finish(fail('That video has no sound track, so there is nothing to transcribe.', 'no_audio'));
      finish({ bytes: size });
    });
  });
}

/**
 * Video bytes to an S8 transcription job. opts: { audio } (the audio service, for tests), { deps } passed on to
 * audio.submit, { ffmpeg, spawn, timeoutMs } for tests. Returns { job, finished } or { error, code }.
 */
async function submitVideo(userId, buf, name, opts = {}) {
  if (!Buffer.isBuffer(buf) || !buf.length) return fail('The file is empty.', 'empty');
  if (buf.length > MAX_VIDEO_BYTES) return fail('That video is over 200 MB. Upload just the audio, or a shorter part.', 'too_big');
  const type = sniffVideo(buf);
  if (!type) return fail('That is not a video file Savant can read (mp4, mov, webm or mkv).', 'bad_type');
  const audio = opts.audio || require('./material-audio'); // eslint-disable-line global-require
  if (!(opts.deps && opts.deps.transcribe)) {
    const a = audio.availability();
    if (!a.ready) return fail(a.reason, 'no_transcriber');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'savant-video-'));
  let sound;
  try {
    const src = path.join(dir, `in.${type}`);
    const out = path.join(dir, 'audio.webm');
    fs.writeFileSync(src, buf, { mode: 0o600 });
    const got = await extractAudio(src, out, opts);
    if (got.error) return got;
    if (got.bytes > 20 * 1024 * 1024) return fail('The sound in that video is too long (over about two hours). Upload a shorter part.', 'too_big');
    sound = fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return audio.submit(userId, sound, name, opts.deps || {});
}

module.exports = { MAX_VIDEO_BYTES, MAX_SECONDS, sniffVideo, ffmpegPath, extractAudio, submitVideo };
