#!/usr/bin/env node
/**
 * services/spanish/voice.js through LLM Gateway, against a mock server: what is
 * sent, that a clip is paid for once, that only listed accounts use it, and that
 * a refused key is not retried in a loop. No network, no key.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicegw-'));
process.env.SPANISH_MEDIA_DIR = path.join(dir, 'media');
process.env.HOLDOUT_DIR = dir; // where spanish-gateway-users.json is read from
fs.writeFileSync(path.join(dir, 'spanish-gateway-users.json'), '[6689]');
delete process.env.GEMINI_API_KEY; delete process.env.MIMO_API_KEY; delete process.env.SPANISH_GATEWAY_USERS;

const calls = [];
let mode = 'ok';
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    calls.push({ url: req.url, auth: req.headers.authorization, type: req.headers['content-type'] || '', body });
    if (mode === '401') { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":{"message":"Invalid token"}}'); }
    if (req.url === '/v1/audio/speech') { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(Buffer.from('ID3fakemp3')); }
    if (req.url === '/v1/audio/transcriptions') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"text":"hola, buenos días"}'); }
    res.writeHead(404); return res.end();
  });
});

server.listen(0, async () => {
  process.env.LLMGATEWAY_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.LLMGATEWAY_API_KEY = 'test-key';
  const voice = require('../services/spanish/voice');
  try {
    // 1. A listed account: eleven-v3, a named voice, language es, bearer key; mp3 cached on disk.
    const a = await voice.tts('Hola, ¿cómo estás?', 'mara', { userId: 6689 });
    assert.strictEqual(a.cached, false); assert(a.url.endsWith('.mp3'));
    const sent = JSON.parse(calls[0].body.toString());
    assert.strictEqual(calls[0].url, '/v1/audio/speech'); assert.strictEqual(calls[0].auth, 'Bearer test-key');
    assert.strictEqual(sent.model, 'eleven-v3'); assert.strictEqual(sent.language, 'es'); assert.strictEqual(sent.voice, 'Sarah');
    assert.strictEqual(sent.input, 'Hola, ¿cómo estás?');
    assert(fs.existsSync(path.join(dir, 'media', path.basename(a.url))));
    // 2. The same line again is the cached file: no second call.
    const b = await voice.tts('Hola, ¿cómo estás?', 'mara', { userId: 6689 });
    assert.strictEqual(b.cached, true); assert.strictEqual(calls.length, 1);
    // 3. Another voice is another clip; an unknown character gets the narrator's Spanish voice, never an English default.
    await voice.tts('Hola, ¿cómo estás?', 'nobody', { userId: 6689 });
    assert.strictEqual(JSON.parse(calls[1].body.toString()).voice, 'Aria'); assert.strictEqual(JSON.parse(calls[1].body.toString()).language, 'es');
    // 4. An account not on the list never reaches the gateway (and, with no Gemini key here, gets the old error).
    const before = calls.length;
    await assert.rejects(voice.tts('Adiós', 'mara', { userId: 5 }), /not configured/);
    await assert.rejects(voice.tts('Adiós', 'mara'), /not configured/);
    assert.strictEqual(calls.length, before);
    // 5. Speech to text: multipart with model, language es, the file.
    const t = await voice.asr(Buffer.from('RIFFfakewav'), 'wav', { userId: 6689 });
    assert.strictEqual(t, 'hola, buenos días');
    const m = calls[calls.length - 1];
    assert(/multipart\/form-data/.test(m.type)); const text = m.body.toString('latin1');
    assert(/name="model"\r\n\r\ngrok-stt-1-0/.test(text)); assert(/name="language"\r\n\r\nes/.test(text)); assert(/name="file"/.test(text));
    // 6. A refused key: one call, then the gateway is left alone (no loop), and the caller gets an error to fall back on.
    mode = '401';
    const n0 = calls.length;
    await assert.rejects(voice.tts('Una línea nueva', 'mara', { userId: 6689 }), /401/);
    await assert.rejects(voice.tts('Otra línea nueva', 'mara', { userId: 6689 }), /cooling/);
    assert.strictEqual(calls.length - n0, 1);
    // ...but a clip already paid for still plays.
    mode = 'ok';
    assert.strictEqual((await voice.tts('Hola, ¿cómo estás?', 'mara', { userId: 6689 })).cached, true);
    console.log('spanish-voice-gateway-test: ok');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
