/**
 * Gladia (https://api.gladia.io/v2) speech-to-text for uploaded audio and video: the FIRST transcription route in
 * services/material-audio.js, with the local Whisper model as the fallback. Owner's $50 credit, 2026-11-04.
 *
 *   1. POST /v2/upload (multipart field `audio`)           -> { audio_url, audio_metadata: { audio_duration } }
 *   2. POST /v2/pre-recorded { audio_url, model, language_config } -> { id, result_url }
 *   3. GET  result_url until status is "done" (or "error"), with backoff and a timeout
 *
 * Header `x-gladia-key`. Model solaria-3 (async 0.16 EUR/hr on gladia.io/pricing). No add-ons are enabled.
 * Spend: every job reserves in services/gladia-ledger.js (data/gladia-ledger.json, $50 TOTAL) after the upload tells
 * us the duration and before the job is created; settled when the job ends. A refused reservation throws code 'refused'.
 *
 * Learner audio goes to Gladia only under the same clearance as Munito (outside-AI consent, services/ai.js
 * munitoAllowedFor); the caller checks that (material-audio.js). GLADIA_LEARNER=off turns learner use off.
 * Env: GLADIA_API_KEY, GLADIA_BASE_URL (tests; default https://api.gladia.io), GLADIA_MODEL, GLADIA_LEARNER.
 */
const ledger = require('../gladia-ledger');
const costTracker = require('../cost-tracker');

const KEY = () => String(process.env.GLADIA_API_KEY || '').trim();
const BASE = () => String(process.env.GLADIA_BASE_URL || 'https://api.gladia.io').replace(/\/+$/, '');
const MODEL = () => String(process.env.GLADIA_MODEL || 'solaria-3').trim();
const learnerOn = () => String(process.env.GLADIA_LEARNER || 'on').toLowerCase() !== 'off';
const isConfigured = () => !!KEY();

let fetchImpl = (...args) => fetch(...args);
function _setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const err = (message, code, extra = {}) => Object.assign(new Error(`gladia: ${message}`), { code, ...extra });

async function api(path, init, what) {
  let res;
  try { res = await fetchImpl(path.startsWith('http') ? path : `${BASE()}${path}`, { ...init, headers: { 'x-gladia-key': KEY(), ...(init.headers || {}) } }); } catch (e) {
    throw err(`${what} failed (${e.message})`, 'network', { sent: true });
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw err(`${what} ${res.status}: ${String((body && (body.message || body.error)) || '').slice(0, 160)}`, 'http', { status: res.status });
  return body || {};
}

/** Upload then job then poll. opts: { name, language, userId, task, pollMs, timeoutMs, model }. */
async function transcribe(buf, opts = {}) {
  if (!isConfigured()) throw err('no key', 'no_key');
  const model = opts.model || MODEL();
  const t0 = Date.now();
  const form = new FormData();
  form.append('audio', new Blob([buf]), String(opts.name || 'audio.bin').replace(/[^\w.-]/g, '_'));
  const up = await api('/v2/upload', { method: 'POST', body: form }, 'upload');
  const seconds = Number(up.audio_metadata && up.audio_metadata.audio_duration);
  if (!up.audio_url || !Number.isFinite(seconds) || seconds <= 0) throw err('upload gave no audio_url or duration', 'bad_response');
  let id;
  try { id = ledger.reserve({ usd: ledger.estimate({ model, seconds }), task: opts.task || 'transcribe', model }); } catch (e) {
    throw err(e.message.replace(/^gladia ledger: /, ''), 'refused');
  }
  const started = Date.now();
  let outcome = 'unknown'; let result = null; let failure = null;
  try {
    const body = { audio_url: up.audio_url, model };
    if (opts.language) body.language_config = { languages: [String(opts.language).slice(0, 2).toLowerCase()], code_switching: false };
    let job;
    try { job = await api('/v2/pre-recorded', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 'job'); } catch (e) {
      if (e.code === 'http') outcome = 'not_billed';
      throw e;
    }
    if (!job.id && !job.result_url) throw err('job gave no id', 'bad_response');
    const url = job.result_url || `/v2/pre-recorded/${job.id}`;
    const deadline = Date.now() + (opts.timeoutMs || (10 * 60 * 1000 + seconds * 500));
    let wait = opts.pollMs || 1500;
    for (;;) {
      const r = await api(url, { method: 'GET' }, 'poll');
      if (r.status === 'done') { result = r; outcome = 'ok'; break; }
      if (r.status === 'error') { outcome = 'not_billed'; throw err(`job failed (${String(r.error_code || r.error || 'error').slice(0, 80)})`, 'job_failed'); }
      if (Date.now() + wait > deadline) throw err('timed out waiting for the transcript', 'timeout');
      await sleep(wait);
      wait = Math.min(wait * 1.5, opts.maxPollMs || 10000);
    }
  } catch (e) { failure = e; }
  const settled = ledger.settle(id, { usd: outcome === 'ok' ? ledger.costOf(model, seconds) : null, outcome, usage: { seconds } });
  const usd = settled ? settled.usd : 0;
  const ms = Date.now() - t0;
  costTracker.recordAi({ userId: opts.userId || null, model, provider: 'gladia', task: 'transcribe', costUsd: usd, ms, ok: !failure, usage: {} });
  if (failure) throw failure;
  const tr = (result.result && result.result.transcription) || {};
  const utterances = (tr.utterances || []).map((u) => ({ start: Number(u.start) || 0, end: Number(u.end) || 0, text: String(u.text || '').trim(), language: u.language || null })).filter((u) => u.text);
  const text = String(tr.full_transcript || utterances.map((u) => u.text).join(' ')).trim();
  const language = (tr.languages && tr.languages[0]) || (utterances[0] && utterances[0].language) || null;
  return { text, utterances, language, seconds, usd, id: result.id || null, ms, processing_ms: Date.now() - started, model };
}

module.exports = { gladia: { name: 'gladia', isConfigured, transcribe }, transcribe, isConfigured, learnerOn, _setFetch, BASE };
