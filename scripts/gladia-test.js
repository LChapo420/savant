#!/usr/bin/env node
/**
 * Gladia (services/providers/gladia.js, services/gladia-ledger.js, the first route in services/material-audio.js).
 * No network, no key, no spend: a stand-in `fetch` that plays Gladia's upload / job / poll API, throwaway ledger and DB files.
 *
 *   node scripts/gladia-test.js
 *
 * Proves: price per hour; the $50 hard cap (env may only lower it) and refusal before a job is created; upload, job and poll
 * with the right header and body; language_config; done, error, timeout and HTTP-error outcomes and what each costs;
 * the audio pipeline stores "[m:ss]" lines from Gladia's utterances, records engine=gladia, and falls back to the local
 * route on every Gladia failure; GLADIA_LEARNER=off and the no-consent gate keep learner audio away; cost-tracker rows.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gladia-test-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
process.env.GLADIA_LEDGER_FILE = path.join(tmp, 'gladia-ledger.json');
process.env.GLADIA_API_KEY = 'test-key';
delete process.env.GLADIA_CAP_USD; delete process.env.GLADIA_LEARNER; delete process.env.GLADIA_BASE_URL;

const led = require('../services/gladia-ledger');
const gl = require('../services/providers/gladia');
const audio = require('../services/material-audio');
const db = require('../config/db');

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${String(err.stack).split('\n').slice(0, 4).join('\n     ')}`); }
}
const near = (a, b) => Math.abs(a - b) < 1e-9;
const reset = () => { try { fs.unlinkSync(process.env.GLADIA_LEDGER_FILE); } catch { /* none yet */ } };
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

const LONG = ' Despues de la escuela hacemos la tarea juntos en la mesa de la cocina y mi madre prepara la cena para toda la familia.';
const seen = [];
/** mode: ok | jobError | httpJob | never | slow (queued, processing, then done) | upload500 */
function mock({ mode = 'ok', seconds = 90, utterances } = {}) {
  let polls = 0;
  const us = utterances || [{ start: 0, end: 8, text: 'Hola, me llamo Ana.', language: 'es' }, { start: 8, end: 20, text: 'Vivo en Madrid con mi familia.', language: 'es' }, { start: 41, end: 50, text: 'Me gusta leer.', language: 'es' }];
  gl._setFetch(async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method, key: init.headers && init.headers['x-gladia-key'], body: init.body });
    const u = String(url);
    if (u.endsWith('/v2/upload')) return mode === 'upload500' ? json(500, { message: 'boom' }) : json(200, { audio_url: 'https://x/a', audio_metadata: { audio_duration: seconds } });
    if (u.endsWith('/v2/pre-recorded')) return mode === 'httpJob' ? json(400, { message: 'bad' }) : json(201, { id: 'job1', result_url: 'https://api.gladia.io/v2/pre-recorded/job1' });
    if (u.includes('/v2/pre-recorded/job1')) {
      polls += 1;
      if (mode === 'never') return json(200, { id: 'job1', status: 'processing' });
      if (mode === 'jobError') return json(200, { id: 'job1', status: 'error', error_code: 500 });
      if (mode === 'slow' && polls < 3) return json(200, { id: 'job1', status: polls === 1 ? 'queued' : 'processing' });
      return json(200, { id: 'job1', status: 'done', result: { transcription: { full_transcript: us.map((x) => x.text).join(' '), languages: ['es'], utterances: us } } });
    }
    return json(404, {});
  });
}
// The gladia provider reads its key per call, and its header comes from the environment.
const opts = { pollMs: 1, maxPollMs: 2, timeoutMs: 80 };

(async () => {
  await check('price: solaria-3 is 0.20 USD per hour, unknown models cost more', () => {
    assert(near(led.costOf('solaria-3', 3600), 0.2));
    assert(led.priceOf('mystery') > led.priceOf('solaria-1'));
    assert.strictEqual(led.CAP_USD, 50);
  });
  await check('cap is $50 and the env can only lower it', () => {
    reset(); assert.strictEqual(led.status().cap_usd, 50);
    process.env.GLADIA_CAP_USD = '500'; assert.strictEqual(led.status().cap_usd, 50);
    process.env.GLADIA_CAP_USD = '1'; assert.strictEqual(led.status().cap_usd, 1); delete process.env.GLADIA_CAP_USD;
  });
  await check('upload, job, poll: header, body, language, utterances, cost settled', async () => {
    reset(); seen.length = 0; mock({ mode: 'slow' });
    const r = await gl.transcribe(Buffer.from('RIFFxxxxWAVEdata'), { ...opts, name: 'a b.wav', language: 'ES' });
    assert.strictEqual(r.utterances.length, 3); assert.strictEqual(r.language, 'es'); assert.strictEqual(r.seconds, 90);
    assert(seen.every((s) => s.key === 'test-key'));
    const job = JSON.parse(seen.find((s) => s.url.endsWith('/v2/pre-recorded')).body);
    assert.deepStrictEqual(job, { audio_url: 'https://x/a', model: 'solaria-3', language_config: { languages: ['es'], code_switching: false } });
    assert(near(r.usd, 90 / 3600 * 0.2)); assert(near(led.status().spent_usd, r.usd)); assert.strictEqual(led.status().reserved_usd, 0);
  });
  await check('no language: no language_config (auto-detect)', async () => {
    seen.length = 0; mock(); await gl.transcribe(Buffer.from('x'), opts);
    assert(!('language_config' in JSON.parse(seen.find((s) => s.url.endsWith('/v2/pre-recorded')).body)));
  });
  await check('ledger refuses past the cap before any job is created', async () => {
    reset(); process.env.GLADIA_CAP_USD = '0.01'; seen.length = 0; mock({ seconds: 3600 });
    await assert.rejects(gl.transcribe(Buffer.from('x'), opts), (e) => e.code === 'refused');
    assert(!seen.some((s) => s.url.endsWith('/v2/pre-recorded')), 'no job'); assert.strictEqual(led.status().refused_calls, 1); delete process.env.GLADIA_CAP_USD;
  });
  await check('job error and HTTP job error cost $0; upload error never reserves', async () => {
    reset(); mock({ mode: 'jobError' }); await assert.rejects(gl.transcribe(Buffer.from('x'), opts), (e) => e.code === 'job_failed');
    mock({ mode: 'httpJob' }); await assert.rejects(gl.transcribe(Buffer.from('x'), opts), (e) => e.code === 'http');
    mock({ mode: 'upload500' }); await assert.rejects(gl.transcribe(Buffer.from('x'), opts), (e) => e.code === 'http');
    const s = led.status(); assert.strictEqual(s.spent_usd, 0); assert.strictEqual(s.reserved_usd, 0); assert.strictEqual(s.calls, 2);
  });
  await check('timeout is counted at the reservation (the job may still run and bill)', async () => {
    reset(); mock({ mode: 'never', seconds: 600 }); await assert.rejects(gl.transcribe(Buffer.from('x'), opts), (e) => e.code === 'timeout');
    assert(led.status().spent_usd > 0.03);
  });

  // ── the audio pipeline ──
  function silentWav(seconds) { // 16 kHz mono 16-bit PCM silence
    const data = Buffer.alloc(16000 * 2 * seconds); const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
  }
  const wav = silentWav(3);
  const user = db.insert('users', { email: 'g@test.local', name: 'G' });
  async function run(deps) {
    const out = audio.submit(user.id, wav, 'lesson.wav', { gladiaPollMs: 1, gladiaTimeoutMs: 80, ...deps });
    assert(!out.error, out.error); await out.finished;
    return db.byId('material_audio_jobs', out.job.id);
  }
  const loc = async () => 'local whisper transcript that is long enough to study from. '.repeat(12);
  await check('pipeline: Gladia first, [m:ss] lines, engine=gladia, material stored', async () => {
    reset(); mock({ utterances: [{ start: 0, text: 'Hola, me llamo Ana y vivo en Madrid con mi familia.' }, { start: 12, text: 'Tengo dos hermanos y un perro que se llama Sol.'+LONG+LONG+LONG }, { start: 41, text: 'Los fines de semana me gusta leer libros en el parque.' }] });
    const job = await run({ gladiaAllowed: true, language: 'es' });
    assert.strictEqual(job.status, 'done', job.error); assert.strictEqual(job.engine, 'gladia');
    const row = db.byId('materials', job.material_id) || {};
    const text = String(row.text || JSON.stringify(row));
    assert(/\[0:00\] Hola.*perro que se llama Sol\./.test(text) && /\[0:41\] Los fines/.test(text), text.slice(0, 300));
  });
  for (const mode of ['jobError', 'never', 'upload500']) {
    await check(`pipeline: falls back to the local route when Gladia fails (${mode})`, async () => {
      reset(); mock({ mode });
      const job = await run({ gladia: true, gladiaAllowed: true, transcribe: loc });
      assert.strictEqual(job.status, 'done', job.error); assert.strictEqual(job.engine, 'whisper');
    });
  }
  await check('pipeline: ledger refusal falls back too', async () => {
    reset(); process.env.GLADIA_CAP_USD = '0'; mock();
    const job = await run({ gladia: true, gladiaAllowed: true, transcribe: loc });
    assert.strictEqual(job.engine, 'whisper'); delete process.env.GLADIA_CAP_USD;
  });
  await check('pipeline: not cleared, GLADIA_LEARNER=off, or no key: Gladia is never called', async () => {
    reset(); seen.length = 0; mock();
    await run({ gladia: true, gladiaAllowed: false, transcribe: loc });
    process.env.GLADIA_LEARNER = 'off'; await run({ gladia: true, gladiaAllowed: true, transcribe: loc }); delete process.env.GLADIA_LEARNER;
    const k = process.env.GLADIA_API_KEY; delete process.env.GLADIA_API_KEY; await run({ gladia: true, gladiaAllowed: true, transcribe: loc }); process.env.GLADIA_API_KEY = k;
    assert.strictEqual(seen.length, 0);
  });
  await check('pipeline: a test transcriber alone (no gladia flag) never reaches Gladia', async () => {
    seen.length = 0; mock(); await run({ gladiaAllowed: true, transcribe: loc }); assert.strictEqual(seen.length, 0);
  });
  await check('cost tracker records a metered transcribe row for provider gladia', async () => {
    reset(); mock(); const ct = require('../services/cost-tracker'); const pushed = [];
    const orig = ct.recordAi; ct.recordAi = (a) => { pushed.push(a); return orig(a); };
    await gl.transcribe(Buffer.from('x'), opts); ct.recordAi = orig;
    assert(pushed.length === 1 && pushed[0].provider === 'gladia' && pushed[0].task === 'transcribe' && pushed[0].costUsd > 0);
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\n${failed} FAILED` : '\nall gladia checks passed');
  process.exit(failed ? 1 : 0);
})();
