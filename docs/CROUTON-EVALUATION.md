# Crouton Alpha: evaluation and diagnosis (5 Nov 2026)

Provider: `services/providers/crouton.js` (OpenRouter stealth model `stealth/crouton-alpha`, free, 1,000 requests per UTC day, we stop at 950: `services/crouton-ledger.js`). Pipeline only: stealth models log prompts. Everything below is AI-judged on planted or bank items; nothing is a real-learner result.

## Verdict: not working right now, and the cause is not the model
Five direct calls to OpenRouter (plain chat, `json_object`, tool call, a 12,000-token cap, plain chat again; `scripts/crouton-diagnose.js`, raw output in `docs/crouton-diagnosis.json`) all returned **HTTP 401 "API key expired."** in 50 to 170 ms. The OPENROUTER_API_KEY in the shared `.env` has expired, so every OpenRouter call fails, not only Crouton's (this also takes out the free OpenRouter models used elsewhere). The earlier "0 of 60 answered" in `docs/fact-verifier-eval.json` (measured 5 Nov 03:02 UTC) is this same failure: 60 of 60 fact cases and 48 of 48 key cases errored, zero answers, so it says nothing about Crouton's quality. Those failed calls still counted on the daily counter (432 of 950 used on 5 Nov by the time of this run), so the counter over-states real use. Fix: the owner issues a fresh OpenRouter key (nothing else needs changing). I did not try other keys or hosts.

## What we measured before (reused, 4 Nov 2026, `services/providers/crouton.js` header)
35 of 35 correct on the 40 bank items where it answered; 5 of 40 not valid JSON (the pool falls through to the next slot); p50 1.7 s. Sample sizes are small and the run predates the key expiry. No planted-error or false-alarm number exists for Crouton: **not measured**.

## Cost
$0 by design. The counter is the only limit (432 of 950 on 5 Nov before this run; this run's 5 diagnosis calls bypassed it and returned errors).

## What we use it for / would change
Judges and autobuild as an extra free second family. Change: have the pool stop retrying Crouton after repeated 401s (a config error, never transient) and surface it in the status page; do not count 401/402/403 calls against the daily counter.

## Limits
One diagnosis round of 5 calls at one moment; a renewed key may reveal other problems (JSON validity, the 5 of 40 earlier). The earlier quality numbers are from a different day.
