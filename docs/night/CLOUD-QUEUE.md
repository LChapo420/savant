# Cloud build queue (Claude cloud credits, owner 2026-11-03)

Runs of the cloud routine take the first item that is not claimed or done, claim it (commit + push that one line first), build it with tests,
mark it done with the commit, and push to `cloud-build` only. Never push to or merge into `main`: the local session verifies and merges.

## How a run works
1. `git fetch origin && git checkout cloud-build && git pull --rebase origin cloud-build`, then `npm ci`.
2. Claim the first open item below by changing `[ ]` to `[claimed <date>]`, commit, push.
3. Build it completely, matching the surrounding code style and comment density. Add a test in the style of `scripts/*-test.js` and list it in
   `scripts/test-steps.json`. `npm test` must pass before you push (a test that needs an API key this environment lacks: say so under Blocked, never weaken it).
4. Mark it `[done <commit>]` with one line on how it was checked, push to `cloud-build`, and take the next item if under 35 minutes have passed.

## Rules that never bend
- Never edit `.env`, commit secrets or anything under `data/`; never call paid providers; never touch the sealed Spanish files (`spanish-check*`,
  `spanish-dictation/`, `public/spanish-listening*`, `routes/spanish-check*.js`).
- Never weaken a test, gate or judge. Never invent numbers.
- Under-13 accounts without parent consent: no extra measurement.

## Queue
- [done 58caadb; npm test passes, new scripts/material-retention-goal-test.js 10 checks] **Retention-goal control on the uploaded-material page.** Retention goals exist (`services/retention-goal.js`, `routes/retention-goals.js`,
  `docs/RETENTION-GOALS.md`) per subject AND per uploaded course; the subject side has a control, the material/course page does not. Add a control on the
  material page that reads and sets that course's goal through the existing API (add a route only if none exists), same look and plain copy as the page,
  with one line saying what the choice changes.
- [done cc52eb5; npm test passes, new scripts/scorecard-footprints-rest-test.js 9 checks, live and design tests updated to 14 live; `scorecard-recovery-sim.js --gate-check` did NOT finish within 590 s here so it is unverified (footprints stay out of the sim's INDICATORS/BY_STAT, asserted by the live test); `scorecard-90-measure.js --gate-check` needs dump files absent here] **The remaining 7 of 14 behavioural footprints into the live scorecard.** `scripts/lib/scorecard-footprints.js` and `docs/SCORECARD-90.md`
  section 11 describe 14; 7 are live in `services/scorecard/footprints.js` / `indicators.js` (11.9). Build the other 7 the same way (event capture,
  indicator, 180-day prune, export/deletion coverage), keeping `scripts/scorecard-90-measure.js --gate-check` unchanged or better, and update 11.9.
- [claimed 2026-11-04] **Fix `scripts/learner-path-test.js`** (13 failures on main, not in the suite): find whether the test or the product is wrong, fix the right side,
  and add it to `scripts/test-steps.json`.

- [ ] **Scorecard accuracy for every kind of learner (owner, 3 Nov: "every kind of brain across every age across every demographic").** Today
  `scripts/scorecard-90-measure.js` reports one average over one mixed simulated population, so a group it serves badly can hide in a good average. Add a
  stratified report (a flag such as `--strata=1`, off by default so every existing number and `--gate-check` reproduce): build simulated subgroups as
  trait-profile proxies, clearly labelled as proxies and not diagnoses: age bands (8-12, 13-17, 18-29, 30-59, 60+, through measure means/spreads that
  plausibly differ by age), attention variability (ADHD-like), slow decoding with intact reasoning (dyslexia-like), English-language learners (low
  vocabulary, intact reasoning), and the low and high tails of ability. For each subgroup report accuracy (100 minus MAE), the guess baseline and the
  share of error removed, at day 0 / 30 / 180, plus the worst-group gap. Then test fixes that need no truth (for example norming within the learner's age
  band, or per-subgroup priors) and keep only those that shrink the worst-group gap without lowering the overall number. Cite a source for any assumed
  subgroup difference or mark it ASSUMED. Document it in a new section of `docs/SCORECARD-90.md`. Everything is SIMULATED.

## Blocked
(none)
