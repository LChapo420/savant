#!/usr/bin/env node
/**
 * One live Gladia transcription of a short generated spoken clip (Windows SAPI text-to-speech, written to a temp WAV).
 * Prints duration, wait time, transcript, word error rate against the spoken sentence, and cost, through
 * services/gladia-ledger.js (live ledger by default, so it counts against the $50 cap). Needs GLADIA_API_KEY (the owner's
 * .env, loaded here, never printed). No key or no SAPI (not Windows): says so and exits 0 without calling anything.
 *
 *   node scripts/gladia-probe.js [lang]      (default en)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ENV = 'C:/coding/claudecommittdIq/folderThing/.env';
if (fs.existsSync(ENV)) { try { require('dotenv').config({ path: ENV }); } catch { /* rely on the environment */ } }
if (!process.env.GLADIA_LEDGER_FILE) process.env.GLADIA_LEDGER_FILE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/gladia-ledger.json';

const ledger = require('../services/gladia-ledger');
const gladia = require('../services/providers/gladia');

const SENTENCE = 'The water cycle starts when the sun heats the ocean. The water rises as vapor, cools into clouds, and falls back to the earth as rain.';
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Word error rate by edit distance over words. */
function wer(ref, hyp) {
  const r = words(ref); const h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 0; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
}

async function main() {
  if (!gladia.isConfigured()) { console.log('GLADIA_API_KEY is not set: nothing probed.'); return; }
  const wav = path.join(os.tmpdir(), `gladia-probe-${process.pid}.wav`);
  const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wav}'); $s.Speak('${SENTENCE}'); $s.Dispose()`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (r.error || r.status !== 0 || !fs.existsSync(wav)) { console.log('No text-to-speech available here (needs Windows SAPI): nothing probed.'); return; }
  const buf = fs.readFileSync(wav);
  try { fs.unlinkSync(wav); } catch { /* temp file, the OS cleans it */ }
  const before = ledger.status();
  console.log(`ledger ${before.file}: spent $${before.spent_usd} of $${before.cap_usd}`);
  const t0 = Date.now();
  const res = await gladia.transcribe(buf, { name: 'probe.wav', language: process.argv[2] || 'en', task: 'transcribe' });
  const wait = (Date.now() - t0) / 1000;
  console.log(`audio ${res.seconds.toFixed(1)} s, ${buf.length} bytes; wall ${wait.toFixed(1)} s (${(wait / (res.seconds / 60)).toFixed(0)} s per audio minute at this length); model ${res.model}; language ${res.language}`);
  console.log(`utterances ${res.utterances.length}: ${JSON.stringify(res.utterances.slice(0, 3))}`);
  console.log(`text: ${res.text}`);
  console.log(`word error rate vs the spoken sentence: ${(100 * wer(SENTENCE, res.text)).toFixed(1)}%`);
  const after = ledger.status();
  console.log(`cost $${res.usd.toFixed(6)}; ledger now $${after.spent_usd} of $${after.cap_usd}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
