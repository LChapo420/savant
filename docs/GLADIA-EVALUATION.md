# Gladia evaluation (2026-11-04)

Owner's $50 Gladia credit. Gladia is the FIRST transcription route for uploaded audio and video (services/material-audio.js;
video goes through material-video.js, which extracts the audio and hands it to the same job). Local Whisper is the fallback
on any Gladia failure. YouTube links are unchanged: the app reads existing captions and never downloads audio, so there is
nothing to transcribe.

## How it is wired
- `services/providers/gladia.js`: upload, job (model solaria-3, `language_config` when the language is known, e.g. `?lang=es`),
  poll with backoff and a timeout. No add-ons are enabled.
- `services/gladia-ledger.js`: hard $50 total cap in `data/gladia-ledger.json` (env `GLADIA_LEDGER_FILE`; `GLADIA_CAP_USD` may only lower it).
  Reserved from the uploaded duration before the job is created, settled on completion, refused past the cap.
- Learner clearance: same as Munito (`munitoAllowedFor`: outside-AI consent). `GLADIA_LEARNER=off` disables it; `scripts/run-tests.js` sets that.
- Cost tracker: metered rows, task `transcribe`, provider `gladia`.
- Job rows record `engine` (`gladia` or `whisper`).

## Price
gladia.io/pricing (read 2026-11-04): async Solaria-3 0.16 EUR/hr, Solaria-1 0.27 EUR/hr, cheaper with volume. The ledger uses
ASSUMED 1.25 USD/EUR rounded up: $0.20/hr (an upper bound), so $50 covers at least 250 hours of audio.

## Re-run
- `node scripts/gladia-test.js` (mock server, no spend; part of `npm test`).
- `node scripts/gladia-probe.js [lang]`: synthesizes a ~10 s spoken clip with Windows SAPI, transcribes it live, prints duration, wait, text, word error rate, cost.

## Measured (one probe, 2026-11-04)
- 9.9 s clip: 4.3 s wall including upload (about 26 s per audio minute at this very short length; a fixed overhead dominates, so do not extrapolate it to long files).
- Transcript exact (word error rate 0.0%) on clean synthetic speech: that says nothing about noisy, accented or Spanish learner audio. Not real-learner proof.
- Cost $0.000548 for the clip. Utterances come with start/end seconds and language per utterance.
- Developer experience: three plain REST calls, one header, JSON everywhere; the job result is a single document. Duration comes back from the upload, which lets the ledger reserve before the job exists.

## Not measured yet
Long files, accented/noisy speech, Spanish accuracy against Whisper tiny.en, real queue latency under load, the true billed rate.
