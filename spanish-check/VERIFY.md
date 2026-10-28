# How to check the Spanish check (for a sceptic)

You need: Node 18 or newer, `openssl` (3.x or 1.1.1+), the `spanish-check/` folder, and (for a full rebuild) the four frozen Tatoeba files in `raw/`.
No account, no network access to the app, and none of the app's code beyond this folder. The result files are in `results/` (copy the whole folder to your own machine first).

## 1. One command

```
node spanish-check/verify.js
```

(`--results DIR` points at a copy of the results folder; `--offline` skips the drand lookups; `--skip-rebuild` skips the 10-second pool rebuild.)
It prints PASS / FAIL / WARN / SKIP per check and ends with `RESULT: PASS` only if nothing failed and nothing was skipped. What each line means:

| Check | What it proves |
|---|---|
| sealed files match SEAL.txt | the protocol, the pool, the scoring, the engine, the draw, the build, the verifier and the page/route glue are the ones that were sealed |
| raw Tatoeba files match | the four input files (`spa_sentences.tsv`, `eng_sentences.tsv`, `spa-eng_links.tsv`, `spa_sentences_with_audio.tsv`) are unchanged |
| pool rebuilt from raw is byte-identical | nobody hand-edited `pool.json`: the build is deterministic and has no randomness |
| SEAL.txt timestamp valid | an independent time-stamp authority signed the SHA-256 of SEAL.txt at the stated time (RFC 3161, freetsa.org; also OpenTimestamps if present) |
| sealed before the first sitting | that time is earlier than the first `sitting_start` in the log |
| hash chain intact | no log line was removed, inserted or edited; the first line is bound to SEAL.txt |
| each sitting's drand round exists | the public randomness in the log is what the drand network published for that round (checked against 3 independent relays) |
| round produced just before the start | the round was not an old round picked later |
| each served item is what the randomness produces | re-runs the draw from (sealed pool, items used earlier, logged randomness) and compares every item and every answer option |
| nothing repeated | no sentence and no wrong answer option appears twice across sittings |
| rules respected | one per day, 12 h gap, one item at a time in order, nothing answered twice, time limits from the server's own timestamps |
| scores recomputed | every score in the log equals the one recomputed by the sealed `scoring.js` from the logged answers |
| anchors | after each sitting ended (or was voided) the log head was time-stamped externally; the stamp is dated after that sitting's end and before the next sitting started |

## 2. The same checks by hand (no trust in verify.js)

```
cd spanish-check
sha256sum SEAL.txt                                   # must equal seal-proof/SEAL.sha256
grep -E '^[0-9a-f]{64}  ' SEAL.txt | sha256sum -c -  # every sealed file, including the raw Tatoeba files (paths are relative to this folder)
openssl ts -verify -in seal-proof/SEAL.tsr -queryfile seal-proof/SEAL.tsq -CAfile tsa/cacert.pem -untrusted tsa/tsa.crt
openssl ts -reply -in seal-proof/SEAL.tsr -text      # shows "Time stamp: ..." and the digest that was stamped
openssl ts -query -digest $(sha256sum SEAL.txt | cut -d' ' -f1) -sha256 -cert -out /tmp/q.tsq   # then compare with seal-proof/SEAL.tsq if you like
```

The freetsa.org certificate files are `https://freetsa.org/files/cacert.pem` and `https://freetsa.org/files/tsa.crt`; download your own copies rather than trusting the ones in `tsa/`.
OpenTimestamps: install the `opentimestamps-client` (`pip install opentimestamps-client`), then `ots upgrade seal-proof/SEAL.ots` and `ots verify seal-proof/SEAL.ots`; once the Bitcoin block is known it prints the block time. Until the calendar has been upgraded, the `.ots` file is a calendar commitment, not yet a Bitcoin proof.

Log chain: line *k* of `results/log.jsonl` has `"prev"` equal to `sha256` of the exact text of line *k-1* (without the newline); line 0 has the SHA-256 of SEAL.txt.
Anchors: `results/anchors/*.tsr` stamp the SHA-256 of the log line named in the matching `anchor_ok` event (`anchored_head`). Verify them with the same `openssl ts -verify` command.

drand: `curl https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/<round>` returns the same `randomness` and `signature` that the log has. `randomness` is SHA-256 of the signature (checked by verify.js). The round number maps to a time: `1692803367 + (round - 1) * 3` seconds since 1970; the start time of the sitting must be within 90 s after it.

## 3. Why studying the pool is impractical

`pool.json` is 28 MB and public, which is deliberate. It holds **69,311 listening sentences** (23,159 easy, 24,478 medium, 21,674 hard) and **44,896 reading sentences** (15,288 / 16,373 / 13,235), plus 31,032 distractor-only sentences. A sitting uses 10 + 15 = 25 of them, drawn by a public random number nobody can know until the start second. Over the five sittings that is 125 of about 100,000 sentences (0.12%), and the learner cannot tell which. Learning the pool would mean learning most of Tatoeba's Spanish, which is the skill being measured. The draw also excludes every sentence that appears in the founder's app (910 candidates were removed after scanning 2,909 files; the final pool was re-scanned against 2,916 files and 0 entries overlap).

## 4. What software cannot prove (read this)

* **Who is taking the test.** Nothing here can see who holds the phone, whether a second device or a translator is open beside it, or whether someone helps. Record every sitting (screen plus front camera) and keep the files.
* **Someone with the code and a second device** can run the draw for the current drand round and read the answers while the sitting is open. The per-item time limits make that costly; the recording is the control.
* **Starting and abandoning.** The owner can choose when to start and can abandon a sitting that looks bad. Both are logged (abandoned sittings are kept, their items count as used, and the report lists them), so this shows but is not prevented. More than two voided sittings needs the override, and that is logged.
* **Deleting the whole `results/` folder** (log and anchors) would remove a sitting from this machine. The time stamps on the anchors prove that a log head existed, only if you hold a copy of those tokens. After each sitting, copy `results/` somewhere the owner cannot edit (an email to yourself, a cloud folder, someone else's computer) or at least note the `head` hash printed on the progress page.
* **The drand BLS signature is not verified** by these scripts (Node has no BLS12-381 library and nothing may be installed). verify.js checks `randomness = SHA-256(signature)`, that three independent relays return the same values, that the chain parameters hash to the chain hash, and that the round time is right. To check the pairing yourself use a drand client (for example `drand-client` on npm) against the chain hash above.
* **Tatoeba sentences are volunteer work.** Some are odd, some translations are loose. Filters reduce this; nothing removes it. It adds noise to every sitting equally.
* **n = 1, five sittings, 25 items each.** One sitting's score has a wide 95% interval, shown on the chart. Only a large change from day to day is distinguishable from noise. The interval is deliberately conservative for the listening score.
* **Accents are not tested** (they are stripped before scoring), and the 4-play limit on audio is enforced by the page; the server enforces the 60 s limit.
* **The code that ran** is shown to be the sealed code by the `engine_start` events (hashes of engine, scoring and pool) and by the seal check, but a determined owner with full control of the PC could run a different program that writes a log of the same shape. The log would still have to match the public drand randomness, the sealed pool and the external time stamps, which is why the recording matters.

The wording the page uses: "n=1 learner, independent public sentence pool (Tatoeba), not an official CEFR level."
Attribution: sentences are from Tatoeba (tatoeba.org), CC BY 2.0 FR; each audio clip is credited on screen to its contributor with their licence (CC BY 4.0, CC BY-NC 4.0 or CC BY-NC-ND 3.0), personal non-commercial use.
