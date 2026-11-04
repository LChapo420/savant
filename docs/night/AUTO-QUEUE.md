# Auto queue

Only the owner or the orchestrating Claude session edits this file. scripts/autobuild.js may change ONLY each task's `Status:` line
(open | claimed <date> | done <commit> | blocked <reason>); it checks that no other byte changes. See docs/AUTOBUILD.md.

## TASK strata-report
Status: blocked 3 attempts failed; last: TASK TEST failed (node scripts/scorecard-strata-test.js): ❌ Test failed: require.ALIASES is not iterable 
Goal: "Every scorecard measure is as close as physically possible to the learner's true value within one month of use." (owner, 1 Nov; and 3 Nov: "every kind of brain across every age across every demographic")
Files: scripts/scorecard-90-measure.js, docs/SCORECARD-90.md, scripts/test-steps.json, scripts/scorecard-strata-test.js
Test: node scripts/scorecard-strata-test.js
Acceptance: Copied unchanged from docs/night/CLOUD-QUEUE.md on origin/cloud-build (the first open item there). Add a test scripts/scorecard-strata-test.js that
runs the stratified report on a tiny seeded population and asserts the subgroup table, labels and that default output is unchanged, and list it in scripts/test-steps.json.
**Scorecard accuracy for every kind of learner (owner, 3 Nov: "every kind of brain across every age across every demographic").** Today
  `scripts/scorecard-90-measure.js` reports one average over one mixed simulated population, so a group it serves badly can hide in a good average. Add a
  stratified report (a flag such as `--strata=1`, off by default so every existing number and `--gate-check` reproduce): build simulated subgroups as
  trait-profile proxies, clearly labelled as proxies and not diagnoses: age bands (8-12, 13-17, 18-29, 30-59, 60+, through measure means/spreads that
  plausibly differ by age), attention variability (ADHD-like), slow decoding with intact reasoning (dyslexia-like), English-language learners (low
  vocabulary, intact reasoning), and the low and high tails of ability. For each subgroup report accuracy (100 minus MAE), the guess baseline and the
  share of error removed, at day 0 / 30 / 180, plus the worst-group gap. Then test fixes that need no truth (for example norming within the learner's age
  band, or per-subgroup priors) and keep only those that shrink the worst-group gap without lowering the overall number. Cite a source for any assumed
  subgroup difference or mark it ASSUMED. Document it in a new section of `docs/SCORECARD-90.md`. Everything is SIMULATED.
