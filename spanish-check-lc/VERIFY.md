# How to check the Spanish listening test (for a sceptic)

You need: Node 18 or newer, the npm package `@noble/curves` (1.9.x; `npm i @noble/curves`), `openssl` (3.x or 1.1.1+), the `spanish-check-lc/` folder **and the sibling `spanish-check/` folder** (this test imports its modules and reads its log, read-only), and (for a full rebuild) the four frozen Tatoeba files in `spanish-check/raw/`.
No account, no network access to the app, and none of the app's code beyond these two folders and the three glue files listed in SEAL.txt. Copy both `results/` folders to your own machine first.

## 1. One command

```
node spanish-check-lc/verify.js
```

(`--results DIR` points at a copy of this test's results folder, `--first-results DIR` at a copy of the first test's, `--offline` skips the drand lookups, `--skip-rebuild` skips the 10-second pool rebuild.)
It prints PASS / FAIL / WARN / SKIP per check and ends with `RESULT: PASS` only if nothing failed and nothing was skipped. What each line means:

| Check | What it proves |
|---|---|
| sealed files match SEAL.txt | the protocol, the pool, the scoring, the engine, the draw, the build, the verifier, the page/route glue and the first-test modules this test imports are the ones that were sealed |
| raw Tatoeba files match | the input files are unchanged |
| pool rebuilt from raw is byte-identical | nobody hand-edited `pool.json`: the build is deterministic and has no randomness |
| SEAL.txt timestamp valid | an independent time-stamp authority signed the SHA-256 of SEAL.txt at the stated time (RFC 3161, freetsa.org; also OpenTimestamps if present) |
| sealed before the first sitting | that time is earlier than the first `sitting_start` in the log |
| hash chain intact | no log line was removed, inserted or edited; the first line is bound to SEAL.txt |
| each sitting's drand BLS signature verifies | the round's signature is a valid drand quicknet BLS signature (pairing check against the chain public key, which is pinned and hashes to the chain hash), so the randomness could only have come from the drand network; a tampered signature and a genuine signature for another round are both shown to be rejected |
| each sitting's drand round exists / was fresh | the public randomness in the log is what the drand network published for that round (checked against 3 relays), produced just before the start |
| first-test exclusion lists are what the first test's log implies | the list of already-seen sentences used for each draw is re-derived from the first test's own log (lines 0 to the logged position, whose line hash is also checked) |
| each served item is what the randomness produces | re-runs the draw from (sealed pool, items used earlier, exclusion lists, logged randomness) and compares every item and every answer option |
| nothing repeated | no sentence, wrong option or English option appears twice across sittings, and none was shown by the first test before |
| rules respected | one per day, 12 h gap, one item at a time in order, nothing answered twice, the 40 s limit from the server's own timestamps |
| scores recomputed | every score and count in the log equals the one recomputed by the sealed `scoring.js` from the logged answers |
| anchors | after each sitting ended (or was voided) the log head was time-stamped externally; the stamp is dated after that sitting's end and before the next sitting started |

## 2. The same checks by hand (no trust in verify.js)

```
cd spanish-check-lc
sha256sum SEAL.txt                                   # must equal seal-proof/SEAL.sha256
grep -E '^[0-9a-f]{64}  ' SEAL.txt | sha256sum -c -  # every sealed file, including the first-test modules and the raw files (paths are relative to this folder)
openssl ts -verify -in seal-proof/SEAL.tsr -queryfile seal-proof/SEAL.tsq -CAfile tsa/cacert.pem -untrusted tsa/tsa.crt
openssl ts -reply -in seal-proof/SEAL.tsr -text      # shows "Time stamp: ..." and the digest that was stamped
```

The freetsa.org certificate files are `https://freetsa.org/files/cacert.pem` and `https://freetsa.org/files/tsa.crt`; download your own copies rather than trusting the ones in `tsa/`.
OpenTimestamps (if `seal-proof/SEAL.ots` exists): `pip install opentimestamps-client`, then `ots upgrade seal-proof/SEAL.ots` and `ots verify seal-proof/SEAL.ots`. Until the calendar has been upgraded the file is a calendar commitment, not yet a Bitcoin proof.

Log chain: line *k* of `results/log.jsonl` has `"prev"` equal to `sha256` of the exact text of line *k-1* (without the newline); line 0 has the SHA-256 of SEAL.txt.
Anchors: `results/anchors/*.tsr` stamp the SHA-256 of the log line named in the matching `anchor_ok` event (`anchored_head`). Verify them with the same `openssl ts -verify` command.
First-test snapshot: `sitting_start.first_test.head` is the SHA-256 of line `first_test.seq` of `spanish-check/results/log.jsonl`.
drand: `curl https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/<round>` returns the same `randomness` and `signature` as the log. `randomness` is SHA-256 of the signature. The round number maps to a time: `1692803367 + (round - 1) * 3` seconds since 1970; the start time of the sitting must be within 90 s after it.

## 3. Why studying the pool is impractical

`pool.json` is 20 MB and public, which is deliberate. It holds **44,010 items** (15,148 easy, 15,995 medium, 12,867 hard) plus 30,660 distractor-only sentences. A sitting uses 24 of the items, drawn by a public random number nobody can know until the start second. Over five sittings that is 120 of 44,010 (0.27%).
Learning the pool would mean learning most of Tatoeba's Spanish, which is the skill being measured. The draw also excludes every sentence that appears in the founder's app (910 candidates removed after scanning 2,924 files; the final pool is re-scanned with `node scripts/scan-app.js --check`) and everything the first test served.

## 4. What software cannot prove (read this)

* **Who is taking the test.** Nothing here can see who holds the phone, whether a second device or a translator is open beside it, or whether someone helps. Record every sitting (screen plus front camera) and keep the files.
* **Someone with the code and a second device** can run the draw for the current drand round and read the answers while the sitting is open. The 40 s limit makes that costly; the recording is the control.
* **Starting and abandoning.** The owner can choose when to start and can abandon a sitting that looks bad. Both are logged (abandoned sittings are kept, their items count as used, the report lists them), so this shows but is not prevented.
* **Deleting the whole `results/` folder** would remove a sitting from this machine. The time stamps on the anchors prove that a log head existed, only if you hold a copy of those tokens. After each sitting copy `results/` somewhere the owner cannot edit, or at least note the `head` hash printed on the progress page.
* **The drand BLS signature is verified** by verify.js and by `tools/verify-drand-bls.js` using the npm package `@noble/curves`. That package is a dependency, not part of the seal: if you do not trust it, check a round with any drand client (for example `drand-client` on npm) against the chain hash above.
* **Tatoeba sentences are volunteer work.** Some are odd, some translations loose; a wrong option can occasionally be a defensible translation. It adds noise to every sitting equally.
* **n = 1, up to five sittings, 24 items each.** One sitting's score has a wide 95% interval, shown on the chart. Only a large change from day to day is distinguishable from noise.
* **The 3-play limit on each clip is enforced by the page**; the server enforces the 40 s limit, logs the play count the page reports, and flags more than 3.
* **The first test is frozen** and cannot be told what this test serves, so a later first-test sitting could repeat a sentence used here (verify.js warns when that has happened).
* **The code that ran** is shown to be the sealed code by the `engine_start` events and by the seal check, but a determined owner with full control of the PC could run a different program that writes a log of the same shape. The log would still have to match the public drand randomness, the sealed pool, the first test's log and the external time stamps, which is why the recording matters.

The wording the page uses: "n=1, independent public sentence pool (Tatoeba), not an official level."
Attribution: sentences are from Tatoeba (tatoeba.org), CC BY 2.0 FR; each audio clip is credited on screen to its contributor with their licence (CC BY 4.0, CC BY-NC 4.0 or CC BY-NC-ND 3.0), personal non-commercial use.
