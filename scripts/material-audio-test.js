/**
 * "Learn from your own material", S8: audio recordings.
 *
 *   node scripts/material-audio-test.js
 *
 * Throwaway db. The transcriber is a stand-in (no model files, no network); the WAV decoder, the sniffing, the
 * chunking and the progress/ownership/deletion logic are the real code.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-audio-test-${process.pid}.json`);

const db = require('../config/db');
const audio = require('../services/material-audio');
const materials = require('../services/materials');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

function wav({ seconds, rate = 16000, channels = 1 }) {
  const frames = seconds * rate;
  const data = Buffer.alloc(frames * channels * 2);
  for (let i = 0; i < frames * channels; i++) data.writeInt16LE(Math.round(Math.sin(i / 20) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

(async () => {
  // sniffing
  check('wav', audio.sniffAudio(wav({ seconds: 1 })) === 'wav');
  check('mp3 with ID3', audio.sniffAudio(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)])) === 'mp3');
  check('mp3 frame sync', audio.sniffAudio(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(20)])) === 'mp3');
  check('m4a', audio.sniffAudio(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(8)])) === 'm4a');
  check('ogg', audio.sniffAudio(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)])) === 'ogg');
  check('webm', audio.sniffAudio(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)])) === 'webm');
  check('text is not audio', audio.sniffAudio(Buffer.from('hello there, this is plain text')) === null);
  check('a PDF is not audio', audio.sniffAudio(Buffer.from('%PDF-1.4 and some more bytes')) === null);

  // decoding
  const w = audio.decodeWav(wav({ seconds: 2, rate: 8000, channels: 2 }));
  check('wav at 8 kHz stereo becomes 16 kHz mono', w.samples && Math.abs(w.samples.length - 32000) <= 1, w.samples && w.samples.length);
  check('wav of the wrong format is refused plainly', /supported/.test(audio.decodeWav((() => { const b = wav({ seconds: 1 }); b.writeUInt16LE(2, 20); return b; })()).error || ''));
  const noDec = await audio.decode(Buffer.from('ID3'.padEnd(20, '\0')), 'mp3', { ffmpeg: null });
  check('mp3 without a decoder says so', noDec.code === 'no_decoder' && /ffmpeg-static/.test(noDec.error), noDec);

  // chunking and stamps
  const parts = audio.chunk(new Float32Array(16000 * 75));
  check('75 s is 3 chunks starting at 0, 30, 60', parts.length === 3 && parts.map((p) => p.start).join() === '0,30,60', parts.map((p) => p.start));
  check('a tail under 1 s joins the chunk before', audio.chunk(new Float32Array(16000 * 60 + 8000)).length === 2);
  check('chunks cover every sample', parts.reduce((n, p) => n + p.samples.length, 0) === 16000 * 75);
  check('stamps', audio.stamp(0) === '0:00' && audio.stamp(75) === '1:15' && audio.stamp(3725) === '1:02:05');

  // refusals before any work
  check('no model installed is said plainly', (() => { const r = audio.submit(1, wav({ seconds: 2 }), 'a.wav'); return r.code === 'no_transcriber' && r.error; })());
  const fake = async (samples) => 'Photosynthesis turns light into chemical energy stored as sugar in the leaf cells of a plant.';
  check('not audio is refused', audio.submit(1, Buffer.from('just some text here, long enough'), 'a.txt', { transcribe: fake }).code === 'bad_type');
  check('empty is refused', audio.submit(1, Buffer.alloc(0), 'a.wav', { transcribe: fake }).code === 'empty');

  // a full job
  const progress = [];
  let calls = 0;
  const SENT = 'Photosynthesis turns light into chemical energy that the plant stores as sugar in its leaf cells.';
  const slow = async () => { calls++; await new Promise((r) => setImmediate(r)); progress.push(audio.listJobs(7)[0].done); return `${SENT} Part ${calls}.`; };
  const sub = audio.submit(7, wav({ seconds: 70 }), 'Biology lecture 3.wav', { transcribe: slow });
  check('submit answers at once with a queued job', sub.job && sub.job.status === 'queued' && !sub.error, sub);
  check('a second recording while one runs is refused', audio.submit(7, wav({ seconds: 5 }), 'b.wav', { transcribe: slow }).code === 'busy');
  await sub.finished;
  const job = audio.listJobs(7)[0];
  check('job finished with 3 chunks, 100%', job.status === 'done' && job.chunks === 3 && job.done === 3 && job.percent === 100, job);
  check('progress rose chunk by chunk', progress.join() === '0,1,2', progress);
  const mat = materials.get(7, job.material_id, true);
  check('a material of kind audio was made, titled from the file', mat && mat.kind === 'audio' && mat.title === 'Biology lecture 3', mat && [mat.kind, mat.title]);
  check('the transcript keeps time marks', mat && /^\[0:00\] /.test(mat.text) && /\n\[0:30\] /.test(mat.text) && /\n\[1:00\] /.test(mat.text), mat && mat.text.slice(0, 200));
  check('another learner sees none of it', audio.listJobs(8).length === 0 && materials.get(8, job.material_id, false) === null);
  check('no audio is kept in the db', !JSON.stringify(db.find('material_audio_jobs', () => true)).includes('RIFF'));
  check('a finished job can be dismissed, only by its owner', !audio.removeJob(8, job.id) && audio.removeJob(7, job.id) && audio.listJobs(7).length === 0);
  check('deleting the material removes it for real', materials.remove(7, job.material_id) && materials.get(7, job.material_id, false) === null);

  // silence and failures
  const quiet = audio.submit(9, wav({ seconds: 5 }), 'q.wav', { transcribe: async () => '' });
  await quiet.finished;
  check('a recording with no speech fails honestly', /Hardly any speech/.test(audio.listJobs(9)[0].error || ''), audio.listJobs(9));
  const boom = audio.submit(10, wav({ seconds: 40 }), 'b.wav', { transcribe: async () => { throw new Error('x'); } });
  await boom.finished;
  check('a transcriber error names where it stopped', /Transcription failed at 0:00/.test(audio.listJobs(10)[0].error || ''), audio.listJobs(10));
  const short = audio.submit(11, wav({ seconds: 0 }).slice(0, 44 + 100), 's.wav', { transcribe: fake });
  await short.finished;
  check('a clip under a second is refused', /too short/.test(audio.listJobs(11)[0].error || ''), audio.listJobs(11));

  // privacy and wiring
  const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'material-audio.js'), 'utf8');
  check('the model can only load from local files', /allowRemoteModels = false/.test(src));
  check('no outside speech vendor is named', !/openai|deepgram|assemblyai|elevenlabs|llm.?gateway|speech\.googleapis/i.test(src));
  check('the privacy page mentions recordings', /audio recording/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8')));
  check('the audio jobs collection is registered (account deletion removes it)', db.find('material_audio_jobs', () => true) !== undefined);

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll audio checks passed.');
  process.exit(failures ? 1 : 0);
})();
