# Spanish check: protocol

This file is part of the seal (SEAL.txt). Every rule the test uses is here. If code and this file disagree, the
code is wrong and verify.js will not catch it, so read both. How to check the result is in VERIFY.md.

## 1. What this is

A short, timed Spanish test for **one learner** (account 6689), taken **up to five times, at most one per calendar day** (Day 0, Day 1, Day 2, Day 3,
Final; the first on Oct 27 or 28 2026, the last by Oct 31, so four sittings if the first is on Oct 28), built to measure **change** between sittings. It is made from a public sentence corpus
(Tatoeba), not from the app's own lessons, and it is sealed and externally time-stamped before the first sitting, so
that nobody (including the owner) can have chosen or changed the questions after the fact.

It says: "n=1 learner, independent public sentence pool (Tatoeba), not an official CEFR level." It makes no other claim.

## 2. Source data and the pool (scripts/build-pool.js, lib/candidates.js)

Input: four Tatoeba exports (downloads.tatoeba.org, weekly, so the copies in raw/ are frozen and hashed in SEAL.txt):
`spa_sentences.tsv`, `eng_sentences.tsv`, `spa-eng_links.tsv`, `spa_sentences_with_audio.tsv` (and their .bz2 originals).
The build has no randomness and no clock, so it needs no seed. The one pseudo-random choice (which 20% of sentences become distractor-only, section 5.1) is a fixed SHA-256 partition with the salt `distractor-partition-v1`. The same raw files plus `overlap-exclusions.json` give a byte-identical `pool.json` (checked: two rebuilds and the sealed file have the same SHA-256; verify.js repeats the check).

A Spanish sentence is a **candidate** only if all of these hold (constants in `RULES` in lib/candidates.js):

1. Characters: only the letters a-z and a, e, i, o, u (acute), u (diaeresis), n (tilde), spaces and the punctuation `. , ; : ? ! ¿ ¡`.
   No digits, quotes, hyphens, apostrophes, brackets, slashes, ellipses or other scripts.
2. Exactly one sentence: it ends in `.`, `?` or `!`, with none of those inside; every `¿` has its `?` and every `¡` its `!`.
3. 3 to 14 words, at most 110 characters.
4. No capitalised word except the first (this drops most names, places, "Dios", etc.), and no "name-like" word
   (a word is name-like when at least 50% of its non-initial occurrences in the whole Spanish corpus are capitalised, with at least 3 such occurrences).
5. Every word occurs at least 3 times in the whole Spanish corpus (443k sentences): a typo and rare-name filter.
6. No word on a short block list of vulgar, sexual, self-harm and slur words (Spanish list for the sentence, English list for its translation; both in lib/candidates.js).
7. De-duplication by the normalised text (lower case, accents and punctuation removed). Per normalised text the lowest-id sentence that has audio is the listening version.

Audio: a sentence has audio if it is in `spa_sentences_with_audio.tsv` with a **username and a stated licence** (rows without
either are ignored; this is why the attribution is always complete). The lowest audio id is used. Licences present:
CC BY-NC-ND 3.0, CC BY-NC 4.0, CC BY 4.0. Personal, non-commercial testing is allowed by all three; the username, licence and a link to
Tatoeba are shown with every clip. Sentences are CC BY 2.0 FR (Tatoeba).

English translation: the lowest-id English sentence linked to the Spanish one that passes the same style rules (letters, apostrophes and
`. , ; : ? !` only, 2 to 20 words, one sentence, no capital except the first word and "I", English block list) **and** whose word count is
0.6 to 1.5 times the Spanish word count (a sanity filter against loose or wrong translations).

**Listening pool**: candidates with audio.
**Reading pool**: candidates with audio **and** an acceptable English translation. *(Deviation from the first brief, which allowed any sentence with a
translation: requiring native audio is a quality screen, because many Tatoeba sentences have never been reviewed by anyone. Nothing else
about a sentence is verified; see section 11.)*

## 3. Difficulty and strata (fixed before any learner data existed)

Word frequency ranks come from the Tatoeba Spanish corpus itself (accent-preserving lower-case words, ties broken alphabetically).
A sentence's **difficulty** = the rank of its **second-rarest distinct word** (its only word if it has one distinct word).

Strata: **easy** difficulty at most 250; **medium** 251 to 1000; **hard** 1001 to 25000. (Sentences above 25000 are dropped.)
The cut-offs were chosen as round numbers close to the terciles of the audio pool's difficulty distribution (terciles were 249 and about 900), so the three strata
hold about a third of the pool each. No learner data of any kind was seen. The cut-offs are the constants `strataCutoffs` and `hardMaxRank`.

Strata weights for scoring are the **pool shares** (stored in `pool.json` meta `strata_weights`; listening about 0.33 / 0.35 / 0.31, reading about 0.34 / 0.36 / 0.29).

## 4. Overlap with the founder's app (scripts/scan-app.js, overlap-exclusions.json)

Every text file in the repository (js, json, jsonl, md, csv, tsv, html, txt, py, sh, yml, patch, log, bat; `node_modules`, `.git`, this folder and `.env*` files excluded;
2909 files; the list with SHA-256 of each is in `overlap-exclusions.json`) was scanned, including the app's Spanish lessons, question families,
placement sets, curriculum build output, the database files, and `data/spanish-run/items.json` (a held-back test whose contents were never printed or stored; only a count is kept).

After normalisation to words, a pool candidate is **removed** if (1) an app string equals it, or (2) an app string contains it (sentences of 4+ words),
or (3) it contains an app string of 4+ words. An "app string" is a JSON string, a JS/HTML string literal, a line, a table cell or a sentence of a line.
Result: **910 candidates removed** (122 exact, 216 app-contains, 572 sentence-contains-app). The removed sentences are stored only as SHA-256 of their normalised text.
After the build, `node scripts/scan-app.js --check` rescans the final `pool.json` against the app and reports the remaining overlap (0).

## 5. The draw (lib/draw.js): done at sitting start, from public randomness

There are **no pre-drawn forms**. When a sitting starts, the server fetches the latest round of the **drand quicknet** beacon
(chain hash `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`, period 3 s), checks it against two more relays (a relay that answers must agree on round, randomness and signature; the number that agreed is logged), checks that the chain's published parameters (period, genesis time, public key, group hash, beacon id) hash to the chain hash above, and records round,
randomness and signature in the log. The check that `randomness = SHA-256(signature)` is done by the server and by verify.js; the BLS pairing check of the signature itself is not (Node has no BLS12-381 library), see section 11. If the beacon cannot be reached **no sitting starts** (there is no local-randomness fallback). The round must have
been produced within 90 s before the start time and no later than 15 s after it (checked again by verify.js).

The seed is the round's randomness (64 hex). Every random choice uses `mulberry32` seeded by the first 8 hex digits of SHA-256 of a labelled string,
for example `spanish-check-draw-v1|<randomness>|listening|easy`. Given the sealed pool, the set of already-used items and the randomness, the whole sitting is determined.

* **Never repeated**: items already used in an earlier sitting (finished **or abandoned**; matched on the normalised sentence) are excluded; distractor
  sentences already used are excluded. A sentence is used at most once across both sections.
* **Listening**: 3 easy, 4 medium, 3 hard sentences, sampled without replacement from the listening pool (items only, never distractor sentences).
* **Reading**: 5 easy, 5 medium, 5 hard, from the reading pool, walking a seeded shuffle and keeping the first sentences for which three distractors exist (section 5.1).
* Item order inside a section: a seeded shuffle. Each item carries a `half` (0/1), alternating inside each stratum, used for the split-half check.
* The pool is `listening 69,311` / `reading 44,896` sentences, `distractor-only 31,032` (all in pool.json meta); the number of possible 25-item sittings is astronomically larger than five.

### 5.1 Reading distractors

About 20% of candidates (a fixed SHA-256 partition of the normalised text with salt `distractor-partition-v1`) are **distractor-only**: they can supply
wrong English options but are never a question, so an option never turns up later as a question.
For a reading item the three wrong options are English translations of *other* distractor-only sentences **in the same stratum** that satisfy all of:

1. same final punctuation (`.`, `?` or `!`) as the correct English;
2. character length within +-20% of the correct option's;
3. word count within +-20% (at least +-1) of the correct option's;
4. share of function words within 0.2 of the correct option's;
5. at most 50% shared English content words with the correct option (both directions), and at most 50% shared Spanish content words between its Spanish source and the question sentence;
6. not the same normalised text as the correct option;
7. a "look-alike word" score against the Spanish sentence (letter similarity, `cognateScore` in lib/common.js) within 0.1 of the correct option's, so cognates are no clue;
8. all four options have different character lengths, and the correct option's length rank among the four (shortest ... longest) is set from a balanced list over the 15 items, so a length
   strategy has no edge; the distractors within a rank are the ones with the closest look-alike score, ties broken by the seeded shuffle;
9. the order of options: the distractors are shuffled and the correct option is placed at a balanced position (each of A-D 3 or 4 times per sitting).

If three such options cannot be found the sentence is skipped (about 5 skips per draw in simulation). Option text, order and the correct index exist only in the server's memory; the page never receives an answer key.

## 6. Scoring (scoring.js: pure functions, no AI)

* **Listening**: the learner types what they hear. Score = longest-common-subsequence length of words (reference vs typed, lower case, accents and punctuation removed) / reference word count,
  in [0,1]. `exact_sentences` counts items typed exactly.
* **Reading**: 4 options, 1 or 0. Chance = 25%. Reported raw and chance-corrected: (p - 0.25) / 0.75 (can be negative; never clipped).
* A **late** answer (see 7) or a blank scores 0.
* **Section score** = sum over strata of (pool share x mean item score). Because sittings are random stratified samples of one fixed pool, each sitting's score is an unbiased estimate of the same quantity.
* **95% CI** (analytic): SE^2 = sum_s w_s^2 s^2 / n_s with s^2 the pooled within-stratum variance of the item scores plus a pseudo pair (0 and 1) in the sum of squares,
  s^2 = (SS_within + 0.5) / (N - S + 1); interval = estimate +- t(0.975, df = N - S + 1) x SE. The pair keeps an all-correct or all-wrong section from claiming zero uncertainty;
  simulation shows the interval is conservative for listening (it covers about 100% where 95% is nominal) and close to nominal for reading.
* **Composite** = mean of listening and chance-corrected reading (a secondary number).
* **Change from the first sitting** = difference of the two estimates, SE = sqrt(SE1^2 + SE2^2), Welch-Satterthwaite df.
* Quality checks per sitting (a failed check **flags** the sitting, it does not void it): odd/even halves (the `half` field) differ by more than 0.40; easy >= medium >= hard
  does not hold; more than 25% of items answered faster than 2.0 s (listening) or 1.0 s (reading); late answers; page leaves. Across sittings, once there are 4 or more, the Spearman-Brown corrected
  correlation of the odd/even half scores is shown (with one learner it is only a rough guide).

## 7. Timing and conduct (engine.js, lib/replay.js; the server owns the clock)

* One item at a time. The server records `served` when it sends an item and returns only that item. Reloading the page returns the same item with the time that is left; it does not reset the clock.
* Limits: **60 s per listening item** (includes up to 3 replays after the first play, so 4 plays), **30 s per reading item**; total at most 17.5 minutes. The page counts down and auto-submits what is typed (blank = 0).
  The server accepts an answer up to limit + 3 s grace; a later answer is logged, flagged `late` and scores 0. An item left open past the limit (page closed) is closed as a timeout when the learner returns.
* Page visibility: `visibilitychange` and window blur/focus are logged with timestamps. A "leave" is a hidden/blur event while the page was in view; the item open at the time is flagged. Nothing else is observed.
* One sitting per calendar day (server local date) and at least 12 hours between sitting starts, unless the owner forces it (`?force=1` on the page); a forced start is logged and shown in the report. Starting counts even when abandoned.
* Abandoning voids that sitting. Its items stay used (never reused); the next sitting is a fresh draw. More than 2 voided sittings need force.
* No feedback during the test; the correct answers are never shown. After the last item the page shows that sitting's scores, timing and the progress chart.
* Replays are counted by the page and logged; the 4-play limit is enforced by the page, the 60 s limit by the server.
* The audio is played through the app (the app's content security policy only allows its own origin for media): the server fetches **one** clip at a time on demand from `tatoeba.org/en/audio/download/<audio_id>` (fallback `audio.tatoeba.org/sentences/spa/<sentence_id>.mp3`), keeps it in `spanish-check/cache/audio/` and streams it. There is no bulk download.

### 7.1 Access

Every endpoint of `routes/spanish-check.js` (mounted at `/api/spanish-check`) answers **404** unless the signed-in account id equals the constant `SPANISH_CHECK_USER_ID` (6689); anonymous callers also get 404. The page `/spanish-check` is a static file with no data in it. The dashboard shows a "Spanish progress" link only to that account.

## 8. The log (results/log.jsonl)

Append-only JSON lines: `seq`, `t` (server epoch ms), `iso`, `type`, fields, `prev`. `prev` is the SHA-256 of the previous line's exact text; the first line's `prev` is the SHA-256 of **SEAL.txt**.
Event types: `engine_start` (hashes of the running engine, scoring and pool), `sitting_start` (drand round, randomness, signature, relay agreement, slot, force), `item_served`, `item_answer`
(answer or choice, client ms, replays, pastes), `visibility`, `sitting_finish` (summary scores), `sitting_abandon`, `anchor_ok`, `anchor_failed`.
Times that matter (late, timeouts, leaves) are recomputed by verify.js from the server timestamps; the log carries no derived "late" flag it would have to trust.

## 9. Anchoring

* **SEAL.txt** is hashed and time-stamped with an RFC 3161 authority (freetsa.org) and OpenTimestamps (Bitcoin) before day 0; tokens in `seal-proof/`.
* When a sitting ends or is voided, the server time-stamps the current log head (RFC 3161, plus OpenTimestamps best effort) and writes the tokens to `results/anchors/`. If the authority cannot be reached the
  server logs `anchor_failed`, retries every 5 minutes and on later requests, and the delay is visible in the log and in verify.js.

## 10. Validation that was run (scripts/simulate.js, scripts/test-engine.js, verify.js)

The output of the simulation is kept in `validation/simulate-output.txt` (not part of the seal; reproduce it with `node scripts/simulate.js`, about a minute). Simulation (200 random draws of the real pool, fixed seeds): simulated learners who know nothing / the 250 / the 1000 / all commonest words, equivalence of draws, CI coverage,
false-alarm rate between draws, ten guessing strategies on reading options.

## 11. What this does not prove

* It does not prove who is at the keyboard, or that no second device or translator was used. Software cannot see that. Record each sitting (screen plus front camera).
* A person with the code could run the draw for the open round in another window during a sitting and read the answers. The time limits make that costly but not impossible; the recording is the control.
* Individual Tatoeba sentences and translations are volunteer-written. Some sentences are odd, some translations loose. The filters reduce this; nothing removes it. It adds noise to every sitting alike; it does not bias a comparison between days.
* With 10 listening and 15 reading items, one sitting's score has a wide interval (see the report). Only a large change is distinguishable from noise.
* The scoring treats an accent or n-tilde error as correct (letters are stripped of marks), so spelling of accents is not tested.
* drand BLS signatures are not verified by the shipped scripts (see VERIFY.md).
* A cheater with full control of the machine could withhold or delay starting a sitting, or abandon one that looks bad; both are visible in the log (abandoned sittings are kept and reported), neither can be hidden.
