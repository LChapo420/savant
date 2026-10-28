# Spanish listening test: protocol

This file is part of the seal (SEAL.txt). Every rule the test uses is here. If code and this file disagree, the code is wrong and verify.js will not
catch it, so read both. How to check the result is in VERIFY.md. This is the **second** sealed test; the first (`spanish-check/`: dictation plus reading) is
frozen and untouched, and this test only imports its modules read-only.

## 1. What this is and why

A short, timed test of **understanding spoken Spanish** for **one learner** (account 6689), taken **up to five times, at most one per local calendar day**
(Day 0, Day 1, Day 2, Day 3, Final), built to measure change between sittings. The learner hears a native recording and picks its English meaning.
**No Spanish text is ever shown.** It is made from a public sentence corpus (Tatoeba), not from the app's lessons, and it is sealed and externally time-stamped
before the first sitting, so nobody (including the owner) can have chosen or changed the questions after the fact.

Why a second test: on Day 0 of the first test the reading section scored 74%, largely because written Spanish is full of English cognates, and dictation can be done
phonetically without understanding. Spoken Spanish has no spelling to lean on and cognates are much harder to catch by ear, so this test measures comprehension more directly.

It says: "n=1, independent public sentence pool (Tatoeba), not an official level." It makes no other claim.

## 2. Source data and the pool (scripts/build-pool.js)

Input: the same four frozen Tatoeba exports as the first test (`../spanish-check/raw/`: `spa_sentences.tsv`, `eng_sentences.tsv`, `spa-eng_links.tsv`,
`spa_sentences_with_audio.tsv`, plus their .bz2 originals); their SHA-256 are in SEAL.txt and in `pool.json` meta. The candidate rules are the first test's
(`../spanish-check/lib/candidates.js`, imported, not copied): only letters and basic punctuation, one sentence, **3 to 14 words**, at most 110 characters,
no capitalised word except the first, no name-like word, every word at least 3 times in the whole Spanish corpus, a vulgar/sexual/self-harm block list on both
languages, de-duplication by normalised text (lower case, accents and punctuation removed). Audio needs a **username and a stated licence** (CC BY, CC BY-NC or CC BY-NC-ND; attribution
is shown with every clip). The English translation is the lowest-id linked English sentence that passes the style rules and has 0.6 to 1.5 times the Spanish word count.

On top of those rules, this build adds:

1. **Overlap with the founder's app.** Every candidate in `../spanish-check/overlap-exclusions.json` (the first test's scan: 910 removed) is excluded, and the app was **re-scanned the same way**
   (`scripts/scan-app.js`, 2,924 text files; match rules: an app string equals the sentence, contains it (4+ words) or is contained in it (4+ words)), giving `overlap-exclusions-lc.json` (again 910 removed; keys are stored only as SHA-256).
   The union of both files is excluded. `node scripts/scan-app.js --check` re-scans the final pool against the app as it is at that moment and reports the remaining overlap (0).
2. **An extra English screen** (bedtime test): any sentence whose English translation contains a word about killing, dying, weapons, violence, drugs and similar (list in `scripts/build-pool.js`, `EXTRA_BLOCK_EN`) is dropped (3,098 candidates), so no such sentence is a question or a wrong option.
3. **Roles.** A fixed SHA-256 partition of the normalised text with salt `lc-distractor-partition-v1` marks about 20% of the candidates *distractor-only*: they supply wrong English options and are never a question,
   so an option can never turn up later as a question. Everything else with audio **and** an English translation is an *item*.

The build has no randomness and no clock: the same raw files plus the two exclusion files give a byte-identical `pool.json` (checked: two rebuilds and the sealed file have the same SHA-256; verify.js repeats the check).

**Item pool** (audio and translation, not distractor-only): easy 15,148, medium 15,995, hard 12,867 (total 44,010). **Distractor-only** English sentences: 7,977 / 10,992 / 11,691 (total 30,660).

## 3. Difficulty and strata (identical method and cutoffs to the first test, so the two are comparable)

Word-frequency ranks come from the Tatoeba Spanish corpus (accent-preserving lower-case words, ties broken alphabetically). A sentence's **difficulty** = the rank of its second-rarest distinct word.
**Easy** at most 250, **medium** 251 to 1000, **hard** 1001 to 25000 (sentences above 25000 are dropped). Stratum weights for scoring are the **item-pool shares**: easy 0.344, medium 0.363, hard 0.292 (`pool.json` meta `strata_weights`).

## 4. The sitting: 24 items, 8 easy / 8 medium / 8 hard

Drawn **at sitting start** (no pre-drawn forms) from the **sealed pool**, **without replacement**, excluding

* every item already drawn in an earlier sitting of this test (finished **or abandoned**; matched on the normalised Spanish text), and every wrong option sentence and English option already shown here;
* **every item already served by the first test**, and every English option it showed (see 5.2).

## 5. The draw (lib/draw.js): public randomness

At sitting start the server fetches the latest round of the **drand quicknet** beacon (chain hash `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`, period 3 s), checks it against two more relays (a relay that answers must agree on round,
randomness and signature), checks that the chain's published parameters hash to that chain hash, and records round, randomness and signature in the log. The server and verify.js check `randomness = SHA-256(signature)` **and the full BLS signature** of the round: drand quicknet is scheme `bls-unchained-g1-rfc9380` (signature a G1 point, chain public key a G2 point, message = SHA-256 of the round number as an 8-byte big-endian integer, DST `BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_`), checked with the npm package `@noble/curves` (lib/bls.js) against the public key pinned in the code and bound to the chain hash. A beacon whose signature does not verify starts no sitting. **If the beacon cannot be reached no sitting starts** (there is no local-randomness fallback). The round must have been produced within 90 s before the start time and no later than 15 s after it (verify.js checks again).
The seed is the round's randomness (64 hex). Every random choice uses `mulberry32` seeded by the first 8 hex digits of SHA-256 of a labelled string, e.g. `spanish-listening-draw-v1|<randomness>|easy`. Given the sealed pool, the used set, the first-test exclusion lists and the randomness, the whole sitting is determined.

* The 8 items per stratum are the first sentences, in a seeded shuffle of the eligible items, for which three wrong options exist (about 6 items are skipped per draw in simulation).
* **Order** of the 24: a seeded shuffle. Each item carries a `half` (0/1), alternating inside each stratum, used for the split-half check.

### 5.1 The four English options

The correct option is the item's English translation. The three wrong options are English translations of *other* **distractor-only** sentences **in the same stratum**. The first test's distractor logic is reused, minus the Spanish-text cognate matching (no Spanish text is shown), and with pairwise matching added so that the correct option is not the "centre" of the four. A wrong option must satisfy:

1. same final punctuation (`.`, `?` or `!`) as the correct option;
2. character length within **+-20% of the correct option's**;
3. **the same number of words** as the correct option (a word-count tolerance was tried first and a guessing strategy that picks the option with most words then scored +0.09 above chance, because the correct option tends to have more words than its neighbours; equal word counts removed the leak);
4. share of function words within 0.1 of the correct option's;
5. at most 50% shared English content words with the correct option (both directions), and at most 50% shared Spanish content words between its Spanish source and the question sentence (so it does not translate nearly the same thing);
6. not the same normalised text as the correct option or as any option already used or shown (here, in the first test, or earlier in this sitting);
7. **among the wrong options too**: lengths within 20% of the longer, equal word count, function-word share within 0.1, at most 50% shared content words, different text;
8. all four options have **different character lengths**, and the correct option's length rank among the four (shortest ... longest) is set from a balanced list over the 24 items (6 each), so a length strategy has no edge;
9. order of options: the wrong options are shuffled and the correct option is placed at a balanced position (each of A to D exactly 6 times per sitting).

Candidates are scanned in a seeded order (first 6,000 scanned, first 600 passing criteria 1 to 6 kept), then wrong options are taken greedily in that order. Option text, order and the correct index exist only in the server's memory and in the replay; the page never receives an answer key or a transcript.

### 5.2 Not repeating the first test

When a sitting starts, the server reads the first test's `results/log.jsonl` **read-only**, replays it with the first test's sealed code (`../spanish-check/lib/replay.js` and its sealed pool) and collects every item **served** to the learner (its sentence id and normalised text) and every English option shown. It records in the `sitting_start` event the
first test's log position `seq`, the SHA-256 `head` of that log line, and the three lists with their hash. The draw excludes every pool item whose id or normalised text is on the list, whose English translation was one of the options shown there, and uses none of those English texts as a wrong option. verify.js re-derives the lists from the first test's log (lines 0 to `seq`) and compares.
(The first test is frozen and does not know about this one, so a sentence this test uses could still be drawn by the first test in a later sitting; verify.js reports that as a WARN, not a failure.)

## 6. Scoring (scoring.js: pure functions, no AI)

* **Item score (formula scoring)**: right = +1, wrong = -1/3, "I don't know" = 0, timeout = 0, late = 0 (see 7). With four options a blind guess has expected score (1/4)(1) + (3/4)(-1/3) = 0, so a pure guesser averages 0, and a learner who always says "I don't know" scores exactly 0.
* **Sitting score** = sum over strata of (pool share x mean item score) = (right - wrong/3) / n when all strata are equally represented (they are: 8 each, weights differ slightly). Range -1/3 to 1. Reported as a percentage next to 0% = guessing.
* **Also reported**: the stratum-weighted **raw share right** (with its own 95% CI), and the counts: right, wrong, **"I don't know"** (explicit taps), timeouts, late.
* **95% CI** (analytic): SE^2 = sum_s w_s^2 s^2 / n_s with s^2 the pooled within-stratum variance of the item scores plus a pseudo pair at the two extremes of the score range in the sum of squares,
  s^2 = (SS_within + R^2/2) / (N - S + 1), R = 4/3 for the formula score and R = 1 for the raw share; interval = estimate +- t(0.975, df = N - S + 1) x SE, clipped to the possible range. The pseudo pair keeps an all-same-answer sitting from claiming zero uncertainty.
  In simulation the interval covered the true value in 92% to 100% of 100 draws per simulated learner (nominal 95%).
* **Change from the first sitting** = difference of the two estimates, SE = sqrt(SE1^2 + SE2^2), Welch-Satterthwaite df.
* **Per-sitting quality checks** (a failed check *flags* the sitting, it does not void it): odd/even half scores differ by more than 0.5 (formula scale); easy >= medium >= hard (formula score by stratum) does not hold; more than 25% of items answered faster than 3.0 s
  (a clip lasts a few seconds, so an answer faster than that cannot follow it); late answers; a clip played more than 3 times; page leaves. The **median seconds per item** and the number of timeouts are reported. Across sittings, once there are 4 or more, the Spearman-Brown corrected odd/even correlation is shown (with one learner, only a rough guide).

## 7. Timing and conduct (engine.js, lib/replay.js; the server owns the clock)

* One item at a time. The server records `served` when it sends an item and returns only that item. Reloading the page returns the same item with the time that is left; it does not reset the clock.
* **40 s per item**, replays included; **3 plays in total** per clip (enforced by the page, which counts plays and reports the count; the server logs it and flags more than 3). The page shows a countdown and auto-submits the selected option (or nothing) at zero. Maximum 24 x 40 s = **16 minutes**.
  The server accepts an answer up to 40 s + 3 s grace; a later answer is logged, flagged `late`, and scores 0. An item left open past the limit (page closed) is closed as a timeout, which counts as "I don't know", when the learner returns.
* Page visibility: `visibilitychange` and window blur/focus are logged with timestamps. A "leave" is a hidden/blur event while the page was in view; the item open at the time is flagged. Nothing else is observed.
* **One sitting per local calendar day** (server local date) and at least **12 hours** between sitting starts, unless the owner forces it (`?force=1` on the page); a forced start is logged and shown in the report. Starting counts even when abandoned.
* **Abandoning voids** that sitting and it is logged. Its items stay used (never reused); the next sitting is a fresh draw. More than 2 voided sittings need force.
* No feedback during the test; the correct answers are never shown. After the last item the page shows that sitting's scores, timing and the progress chart.
* The audio is played through the app (the app's content security policy only allows its own origin for media): the server fetches **one** clip at a time on demand from `tatoeba.org/en/audio/download/<audio_id>` (fallback `audio.tatoeba.org/sentences/spa/<sentence_id>.mp3`), keeps it in `spanish-check-lc/cache/audio/` and streams it. There is no bulk download.

### 7.1 Access

Every endpoint of `routes/spanish-check-lc.js` (mounted at `/api/spanish-check-lc`) answers **404** unless the signed-in account id equals the constant `SPANISH_LC_USER_ID` (6689); anonymous callers also get 404. The page `/spanish-listening` is a static file with no data in it. The dashboard shows a "Spanish listening test" link only to that account.

## 8. The log (results/log.jsonl)

Append-only JSON lines: `seq`, `t` (server epoch ms), `iso`, `type`, fields, `prev`. `prev` is the SHA-256 of the previous line's exact text; the first line's `prev` is the SHA-256 of **SEAL.txt**.
Event types: `engine_start` (hashes of the running engine, scoring, draw, replay and pool), `sitting_start` (drand round, randomness, signature, relay agreement, slot, force, and the `first_test` snapshot: log position, line hash, exclusion lists and their hash), `item_served`, `item_answer`
(choice or `dk`, client ms, plays), `visibility`, `sitting_finish` (summary scores and counts), `sitting_abandon`, `anchor_ok`, `anchor_failed`.
Times that matter (late, timeouts, leaves) are recomputed by verify.js from the server timestamps; the log carries no derived "late" flag it would have to trust.

## 9. Anchoring

* **SEAL.txt** is hashed and time-stamped with an RFC 3161 authority (freetsa.org), and with OpenTimestamps (Bitcoin) when its calendars answer, before the first sitting; tokens in `seal-proof/`. Only the 32-byte hash leaves the machine.
* When a sitting ends or is voided, the server time-stamps the current log head (RFC 3161, plus OpenTimestamps best effort) and writes the tokens to `results/anchors/`. If the authority cannot be reached the server logs `anchor_failed`, retries every 5 minutes and on later requests, and the delay is visible in the log and in verify.js.

## 10. Validation that was run (scripts/simulate.js, scripts/e2e-http.js, verify.js)

The output is kept in `validation/` (not part of the seal; reproduce the simulation with `node scripts/simulate.js --draws 100`, about 25 seconds). 100 random draws of the real pool (fixed seeds), the first test's exclusions applied:

* simulated learners who know nothing (guess everything), know nothing and always say "I don't know", know the 250 / the 1000 / all commonest words (the unknown rest guessed): mean formula scores 0.00, 0.00, 0.32, 0.61, 0.95 against true values 0.00, 0.00, 0.34, 0.59, 0.95; strictly increasing;
* draws of the same learner disagree "significantly" in about the nominal 5% of pairs; draws have the same mean difficulty as the pool;
* 23 guessing strategies that see only the four English options (longest, shortest, medians, odd-one-out, word counts, function words, consensus overlap among options, word frequency, first word, position A to D, ...) score between 22% and 26% right, i.e. a formula score within +-0.04 of 0 (the SE is 0.023; the largest, -0.039 for "pick the least natural-sounding option", is a 1.8 SE deviation among 23 tries);
* structure: every wrong option within +-20% of the correct length, four distinct lengths in every item, no duplicate English options, correct position 600/600/600/600 and length rank 600/600/600/600 over 2,400 items.

## 11. What this does not prove

* It does not prove who is at the keyboard, or that no second device or translator was used. Software cannot see that. Record each sitting (screen plus front camera).
* A person with the code could run the draw for the open round in another window during a sitting and read the answers. The time limit makes that costly but not impossible; the recording is the control.
* Individual Tatoeba sentences and translations are volunteer-written. Some sentences are odd, some translations loose, and a wrong option can occasionally be a defensible translation too. The filters reduce this; nothing removes it. It adds noise to every sitting alike; it does not bias a comparison between days.
* With 24 items, one sitting's score has a wide interval (about +-0.25 for a mid-level learner, see the report). Only a large change is distinguishable from noise.
* The 3-play limit is enforced by the page, not the server; the server only sees the count the page reports (and the 40 s limit, which it enforces).
* Audio quality, speed and accent vary by contributor; this adds noise, equally on every day.
* The "knows the 250/1000 words" simulations assume a simple word-knowledge model; they show that the scoring behaves sensibly, not how a real learner behaves.
* The BLS check relies on the npm package `@noble/curves` (1.9.x), which is not part of the seal; if it is missing, verify.js reports SKIP for that check rather than PASS. `tools/verify-drand-bls.js` repeats the check for any log.
* A cheater with full control of the machine could withhold or delay starting a sitting, or abandon one that looks bad; both are visible in the log (abandoned sittings are kept and reported), neither can be hidden.
* The first test is frozen and cannot be told what this test serves; later first-test sittings may repeat a sentence used here (verify.js warns).
