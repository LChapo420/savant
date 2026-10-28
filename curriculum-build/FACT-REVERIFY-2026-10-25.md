# Fact re-verification of everything that went live on 2026-10-24 (run 2026-10-25)

Independent re-check by the fact re-verification agent. Every quote below is verbatim from the page or PDF at the URL, under 25 words, and was machine-checked against the fetched text (kiwix `wikipedia_en_all_nopic_2026-06` / `wiktionary_en_all_nopic_2026-08` for Wikipedia and Wiktionary, the live page otherwise). Check scripts and saved pages: scratchpad `34e6f487…\fact-reverify\` (`verify-quotes.js`, `verify-123.js`, `verdicts-checked.json`, `quotes-123-checked.json`).

Rules kept: nothing committed, `.env` not touched, `data/db.json` not written (md5 still `9d9105c7c43f765dd9ac20b787766466`), the app on 6767 not stopped. Backups of every edited file: scratchpad `before-fact-reverify\` with `MD5SUMS.before`.

## Summary

| Part | Checked | Confirmed | Corrected | Staged for the DB |
|---|---|---|---|---|
| 1. Owner-review DB fixes (rows) | 20 | 20 | 0 | 0 |
| 1. "Refuted, key is right" verdicts | 8 | 2 | 6 reclassified in this report (all in held games, never served) | 0 |
| 2. Skill-curriculum draft changes (7 lines) and B06's other FIBA claims (4) | 11 | 9 | 2 (B03, B07 aim cue), rebuilt and live in content | 0 |
| 3. Stage-check content | 135 (102 technique items, 13 court and rules numbers, 5 formulas, 9 rules items, 6 decision-scene reads) | 134 | 1 bug, fixed: 59 of 102 technique items showed wrong note names (D harmonic minor's B-flat as A#4), plus a latent double-sharp bug | 0 |
| 4. Web references | 197 links (+2 `<domain>` templates) | 178 verified | 18 changed (15 with a replacement source), 1 dead and replaced | — |
| **Total** | **371** | **343** | **28** (3 in live code/content, 1 dead link replaced, 2 doc lines corrected, the rest documented with replacements) | **0** |

**Needs the coordinator:** restart the app on 6767 to load the spelling fix (server side, `services/skill-checks.js` and `services/skill-piano-bb-sittings.js`) and the B03/B07 text (`content/basketball-grades.js`). No DB remap is needed: no level moved.

---

## 1. The 20 owner-review DB fixes (`staged/content-fixes/owner-review/db-changes.json`)

Each changed field's claim and answer key was read in the live row (read-only) and checked against the source. All 20 rows are right as applied; no row needs a new change.

| Row | Fix refs | What the fix says | Verdict | Source and verbatim quote |
|---|---|---|---|---|
| block_plans 1 | P70 | B becomes "…half a second, and we lost." (one complete option) | Confirmed | Purdue OWL, https://owl.purdue.edu/owl/general_writing/punctuation/punctuation/index.html: "Instead, separate the clauses with a period, with a comma followed by a coordinating conjunction, or with a semicolon." |
| | P71 | "Because the gym was booked." is the fragment; "Because" is the starter | Confirmed | Purdue OWL clauses, https://owl.purdue.edu/owl/general_writing/punctuation/independent_and_dependent_clauses/index.html: "A dependent clause is a group of words that contains a subject and verb but does not express a complete thought." and "Some common dependent markers: after, although, as, as if, because" |
| | P72 | "The alarm didn't go off because the power had gone out overnight." is complete | Confirmed | same page: "An independent clause is a group of words that contains a subject and verb and expresses a complete thought." |
| block_plans 2 | P67, P69 | Seven distinct chips: "Reading builds patience, / and / patience builds attention / — / so / reading / builds attention."; halves mirror on either side of "and" | Confirmed | Wikipedia, https://en.wikipedia.org/wiki/Parallelism_(grammar): "is a balance within one or more sentences of similar phrases or clauses that have the same grammatical structure." |
| block_plans 4 | P74 | "the results were announced" | Confirmed | Wikipedia, https://en.wikipedia.org/wiki/Agreement_(linguistics): "Agreement based on grammatical number can occur between verb and subject" |
| | P75 | Option d is imperative and active throughout | Confirmed | Wikipedia, https://en.wikipedia.org/wiki/Imperative_mood: "The imperative mood is a grammatical mood that forms a command or request."; Towson OWS, https://webapps.towson.edu/ows/shifts.htm: "When a sentence contains two or more verbs, both verbs should maintain the same voice." |
| | Q145 | Accept only "be" ("It is required that you be on time") | Confirmed | Wikipedia (citing CGEL), https://en.wikipedia.org/wiki/English_subjunctive: "We demand that it be done tomorrow." |
| block_plans 10 | P91 | "Ending a sentence with a preposition is acceptable." filed as a settled rule | Confirmed | Wikipedia, https://en.wikipedia.org/wiki/Preposition_stranding: "Today, most sources consider it to be acceptable in standard formal English." (it quotes Fowler: "It is a cherished superstition that prepositions must") |
| block_plans 19 | P101 | "The recipe says to preheat … and then stir …" is consistent (infinitives, no imperative) | Confirmed | Purdue OWL, https://owl.purdue.edu/owl/general_writing/mechanics/gerunds_participles_and_infinitives/infinitives.html: "An infinitive is a verbal consisting of the word to plus a verb" |
| block_plans 23 | P109, P112 | Colon before the list/explanation, after "thing"; a semicolon cannot introduce a list | Confirmed | Purdue OWL punctuation: "Use a colon after an independent clause when it is followed by a list, a quotation, an appositive"; Grammar Monster, https://www.grammar-monster.com/lessons/colons_with_bullet_points.htm: "You can't introduce a list - any list - with a semicolon." |
| | P110, P111 | Rebuild solutions now carry the dash / the dash pair, and "matched" | Confirmed | Purdue OWL punctuation: "Dashes are used to set off or emphasize the content enclosed within dashes or the content that follows a dash." |
| | P113 | Dash row "complete sentence needed before it?" = No | Confirmed | Simon Fraser Univ., https://www.sfu.ca/~gmccarro/Grammar/Dash.html: "Notice that a grammatically complete lead-in sentence does not necessarily precede the dash." |
| | P114 | Nothing goes right after the semicolon; the comma follows "however" | Confirmed | Purdue OWL punctuation: "Use a semicolon to join two independent clauses when the second clause begins with a conjunctive adverb" and "Use a comma after a transitional element (however, therefore, nonetheless" |
| | P115 | "The team held its nickname" in every cell | Confirmed | Cambridge, https://dictionary.cambridge.org/grammar/british-grammar/its-or-it-s: "Its meaning 'of it' or 'belonging to it' does not have an apostrophe." |
| lessons 30 | P3 | Do the same to the other side | Confirmed | OpenStax Elementary Algebra 2e 2.1, https://openstax.org/books/elementary-algebra-2e/pages/2-1-solve-equations-using-the-subtraction-and-addition-properties-of-equality: "When you subtract the same quantity from both sides of an equation, you still have equality." |
| lessons 80 | P15 | x = 21 comes from 15 + 6; the right move gives x = 9 (9 + 6 = 15) | Confirmed (arithmetic re-done) | same page: "When you add the same quantity to both sides of an equation, you still have equality." |
| lessons 233 | P28, Q57 | Dividing 3x + 5 = 20 by 3 divides every term (x + 5/3 = 20/3, x = 5); x = 3 solves 2x + 4 = 10 | Confirmed (arithmetic re-done: 2·3 + 4 = 10) | OpenStax 2.2, https://openstax.org/books/elementary-algebra-2e/pages/2-2-solve-equations-using-the-division-and-multiplication-properties-of-equality: "When you divide both sides of an equation by any non-zero number, you still have equality." |
| lessons 1219 | P38 | x = −2 comes from 5 − 7; adding 7 gives x = 12 | Confirmed (12 − 7 = 5) | OpenStax 2.1 (addition property, above) |
| lessons 1801 | P49 | "5 more than a number" is x + 5 or 5 + x | Confirmed | OpenStax Prealgebra 2e 7.2, https://openstax.org/books/prealgebra-2e/pages/7-2-commutative-and-associative-properties: "Notice, the order in which we add does not matter." |
| lessons 2040 | P54 | "7 less than n" is n − 7 (number on the right) | Confirmed | OpenStax Prealgebra 2e 1.3, Table 1.3, https://openstax.org/books/prealgebra-2e/pages/1-3-subtract-whole-numbers: row "less than / 5 less than 8 / 8 − 5" (page text: "less than 5 5 less than 8 8 8 − 5") |
| block_plans 3 | OR-BP3 | "After the rage came silence." (only the given words; "silence" last) | Confirmed | Smolka 2017, AUC Philologica (citing Quirk et al. 1985), https://karolinum.cz/data/clanek/3824/Phil_1_2017_04_Smolka.pdf: "the tendency to put the most important information at or close to the end of the sentence, the end-focus principle" |
| block_plans 17 | OR-BP17 | The fix is a period after "beach" | Confirmed | Purdue OWL, https://owl.purdue.edu/owl/general_writing/punctuation/independent_and_dependent_clauses/runonsentences.html: "two independent clauses that are joined together with no connecting word or punctuation to separate the clauses." |
| lessons 3069 | OR-L3069 | Only the keyed sentence has Greek-family medical words (chronic, physician); the others are Latin or native | Confirmed | Wiktionary: chronic "from Ancient Greek χρονικός (khronikós, “of time”)"; physician "from Latin physica (“natural science”), from Ancient Greek φυσική ἐπιστήμη"; clinic "from Ancient Greek κλῑνικός (klīnikós, “pertaining to a bed”)"; surgery "from Latin chirurgia, from Ancient Greek χειρουργία (kheirourgía)"; doctor "from Latin doctor (“teacher”)" (all https://en.wiktionary.org/wiki/<word>) |
| items 7178 | OR-I7178 | "Neither the treasurer nor the members question …" | Confirmed | Purdue OWL, https://owl.purdue.edu/owl/general_writing/grammar/subject_verb_agreement.html: "the verb should agree with the part of the subject that is nearer the verb." |
| lessons 2815 | OR-L2815-0…6, N2, N3 | lets + object + bare infinitive is parallel; the dangling example is a subjectless participle | Confirmed | Cambridge, https://dictionary.cambridge.org/grammar/british-grammar/let-let-s: "Let is followed by an object and an infinitive without to"; Purdue OWL, https://owl.purdue.edu/owl/general_writing/mechanics/dangling_modifiers_and_how_to_correct_them.html: "A dangling modifier is a word or phrase that modifies a word not clearly stated in the sentence." |
| block_plans 14 | N15 | Key "B only; A is a fragment" | Confirmed | Purdue clauses: independent clause definition (above) |
| items 61322 | N25 | Key: check that agent and mood stay consistent | Confirmed | MIT Mayfield Handbook 6.15, https://web.mit.edu/course/21/21.guide/shifts.htm: "Be consistent in your choice of tense, mood, person, and voice." |
| block_plans 27 | OR-BP27 | "affect, run-on" | Confirmed | Cambridge, https://dictionary.cambridge.org/grammar/british-grammar/affect-or-effect: "Affect is a verb meaning ‘influence or cause someone or something to change’"; Purdue run-ons (above) |

**One residual, low, not a factual error in the fix:** in block plan 23's sort game the card "Her reasoning was simple ____ no homework, no phone." is now keyed colon (right; the old semicolon was wrong), but the game's dash bucket ("Break or loud pause") would also be defensible, as for the unchanged card "One rule never changes ____ the bell decides". The colon is the textbook answer, so nothing was staged.

### The 8 "refuted: key correct" verdicts (`staged/content-fixes/night-audit/owner-review-verdicts.json`)

| uid | Where | Verdict now | Why |
|---|---|---|---|
| q-04a471bd7afc | game 53 (held) | **Confirmed**, one right answer | The key is the only fully correct option; option 3 puts a comma before a compound predicate. Purdue OWL, https://owl.purdue.edu/owl/general_writing/punctuation/commas/extended_rules_for_commas.html: "Don't put a comma between the two verbs or verb phrases in a compound predicate." |
| q-4be6bbd5d7b6 | block plan 13, item 61319 (served) | **Confirmed** | "Although…" is grammatical but states a concession where the sell-out caused the second show; only ", so" keeps the meaning (Purdue: a comma splice is fixed "with a comma followed by a coordinating conjunction"). |
| q-25415e54c732 | game 53 (held) | **Reclassify: no single answer** | Key right, but the colon option is also acceptable (the verdict's own note says so). |
| q-28b3dcb6da6d | game 47 (held) | **Reclassify: no single answer** | The appositive-comma option is also acceptable. |
| q-33c006c0ca1b | game 47 (held) | **Reclassify: no single answer** | The dash option is also acceptable. |
| q-3ffc63689801 | game 50 (held) | **Reclassify: no single answer** | The semicolon option is also correct. |
| q-5a14c67c6c2a | game 47 (held) | **Reclassify: no single answer** | Dash and semicolon also acceptable. |
| q-4d9a1b3bce04 | game 55 (held) | **Key defensible, explanation wrong** | The explanation says "An ellipsis marks hesitation" while the key is the dash. Both marks can show a pause: Wikipedia Ellipsis, https://en.wikipedia.org/wiki/Ellipsis: "ellipsis can indicate an unfinished thought, a leading statement, a slight pause, an echoing voice, or a nervous or awkward silence."; Wikipedia Dash, https://en.wikipedia.org/wiki/Dash: "dashes are attested that indicate a thinking pause, interruption, mid-speech realization, or change of subject." |

All six problem items are in English Proficient game levels 65, 68, 76 and 77, which `content/game-holds.json` holds from serving (checked: each level key is in the hold list and no row has `verified_replacement`). No learner sees them, and by design nothing is re-keyed in `game_payloads`, so nothing was staged. If a level is ever released, these six need rewriting first.

---

## 2. Skill-curriculum lesson facts changed on 2026-10-24

Drafts in `C:\coding\claudecommittdIq\folderThing\curriculum-build\{basketball,piano}\drafts\`, diffed against scratchpad `before-owner-review\drafts\`.

| Draft line | Claim | Verdict | Source and verbatim quote |
|---|---|---|---|
| B03:32 "One-Hand Form Shots From One Metre" | "dropping them past the front rim **into the middle of the ring**" | **Corrected** → "toward the back of the ring" | NC State news on Tran & Silverberg (2008), the progression's own `tran2008` source, https://news.ncsu.edu/?p=232: "Tran and Silverberg say you should aim for the back of the rim" and "aiming for the center of the basket decreases the probabilities of a successful shot by almost 3 percent." Both free judges had flagged this rewrite as still wrong (`staged/skills/VERIFICATION.md` L-bb-aim-B03), but it went live. |
| B07:94 "External Focus Cues: Aim at the Target" | "such as drop it past the middle" | **Corrected** → "such as the back of the ring, not your elbow" (22 words; still an external cue) | same source |
| B04:32 (new) "Log Fifty Shots Before Judging a Change" | 10-shot ranges overlap; 50 attempts narrow the uncertainty | Confirmed | Wilson 95% intervals computed: 4/10 → 0.17–0.69, 6/10 → 0.31–0.83 (overlap); 20/50 → 0.28–0.54, 30/50 → 0.46–0.72 (half as wide). Method: Wikipedia, https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval: "Unlike the symmetric normal approximation interval (above), the Wilson score interval is asymmetric" |
| B05:99 (new) "Judge Shooting by the Next-Day Cold Set" | same-shot practice can make today's percentage look better than retention | Confirmed | Shamshiri et al. 2025, Eur J Sport Sci, https://doi.org/10.1002/ejsc.70061 (abstract via Europe PMC): "Results indicated that the blocked practice-contextual interference group performed more accurately than other groups during acquisition." and "However, a higher transfer was observed for differential learning groups." |
| B06:66 FIBA no-charge semicircle | 1.25 m to the inner edge, 1.30 m to the outer edge of its 5 cm line | Confirmed against **FIBA Official Basketball Rules 2026 v1.1** (newer than the v1.0 the agent used; same text), https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-v1-1.pdf, Art. 2.5.7: "A semi-circle line with the radius of 1.30 m measured from the point on the court beneath the exact centre of the basket" (to the outer edge); Art. 2.5: "All lines shall be of a solid colour, 5 cm in width" | |
| B06:65 "FIBA rectangular restricted area" | rectangular | Confirmed | FIBA 2026 Art. 2.5.3: "The restricted areas shall be the rectangular areas marked on the court" |
| B06:44 injured player "within about 15 seconds" | | Confirmed | FIBA 2026 Art. 5.3: "If an injured player cannot continue to play immediately (within approximately 15 seconds)" |
| B06:69 "FIBA 24- and 14-second shot-clock reset" | | Confirmed | FIBA 2026 Art. 29: "Frontcourt, the shot clock shall be reset to 14 seconds." |
| B06:99 shot-clock horn with the ball in the air | goal counts; violation if it misses the ring | Confirmed | FIBA 2026 Art. 29.2.3: "If the ball misses the ring, a violation has occurred." |
| P04:31–32 order | "Minor Keys Sharing Major Signatures" (relative minor three semitones below) now precedes "A and D Natural Minor Scales" | Confirmed | Wikipedia, https://en.wikipedia.org/wiki/Relative_key: "The minor key starts three semitones below its relative major; for example, A minor is three semitones below its relative, C major." |
| P05:26 (new) "Shuffle Scales After One Correct Run" | shuffled practice is retained better despite feeling harder | Confirmed (the study measured speed at a 2-day retention test) | Abushanab & Bishara 2013, Memory & Cognition, https://doi.org/10.3758/s13421-013-0311-z: "on a retention test 2 days later, participants were faster with melodies from the random-order condition." and "they erroneously believed that fixed-order practice would result in faster retention performance." |

**Applied (B03, B07):** both drafts edited with the Edit tool; `validate.js` 0 errors (15 basketball and 19 piano drafts); `build.js` rebuilt the outputs to a scratch folder first and the only differences were the two descriptions (CSV lines 351 and 1014); then `outputs/*.csv`, `data/Basketball_Grades_Levels.csv`, `data/Basketball_Lesson_Tags.csv` (unchanged) and `npm run build:basketball` → `content/basketball-grades.js` (md5 `e0ed02183dee7013fa8ff4a8b395cac2`; its diff is the same two text runs). No level number moved, so no DB remap. Rollback: copy back from scratchpad `before-fact-reverify\` (`drafts\basketball\`, `bb-outputs\`, `data\`, `content\basketball-grades.js`).

---

## 3. Piano and basketball stage-check content

### 3.1 Scale and arpeggio spelling: bug fixed, test added

**The bug.** Both technique builders showed the run's note names with `P.midiToName`, which names every key by its sharp. So any flat in a scale was shown as a sharp: D harmonic minor read "A#4" for B-flat, F major "A#4", G minor arpeggio "A#", and so on. **59 of the 102 battery items** showed at least one wrong name, including 9 in PI2–PI4, which now hold learners. The stored data was right: every item's `notes` and `descending` lists were checked by theory (below).

**The fix** (`content/piano-sight-reading.js`, `services/skill-checks.js` line ~441, `services/skill-piano-bb-sittings.js` line ~117):
- new `scaleNames(item, run)`: each key's name comes from the item's own spelled notes going up and its `descending` notes coming down (melodic minor), with the octave following the letter (B#3, Cb4), the theory sources' "one letter per degree";
- chromatic scales: sharps up, flats down, the tonic keeping its own name; whole-tone scales: the two usual collections (C D E F# G# A#, Db Eb F G A B) with the item's tonic. Whole-tone spelling has no single standard, so this is a convention, not a sourced fact;
- **latent bug fixed too:** `PC_OF` read "F##" (G# harmonic/melodic minor) as F#. It was only reachable for items without stored MIDI, so nothing live was wrong yet.

**Sources.** Ableton Learning Music, https://learningmusic.ableton.com/advanced-topics/building-major-scales.html: "Each letter name is used only once."; Milne Open Textbooks (SUNY Geneseo), https://milnepublishing.geneseo.edu/fundamentals-function-form/chapter/6-major-scales-2/: "the only repeated note letter name is the keynote"; Wikipedia, https://en.wikipedia.org/wiki/Harmonic_minor_scale: "with the minor seventh degree raised by one semitone to a major seventh"; Wikipedia, https://en.wikipedia.org/wiki/Chromatic_scale: "the chromatic scale is usually notated with sharp signs when ascending and flat signs when descending."

**Test** (`scripts/skills-r3-piano-bb-test.js`, in the `npm test` chain; 88 → 92 checks, PASS):
1. all 96 scales, five-finger patterns and arpeggios re-derived from theory: a letter per degree (every other letter for arpeggios) and the intervals of their kind (major, natural, harmonic and melodic minor up and down, pentascales, major/minor/dominant-7th/diminished-7th arpeggios); stored MIDI matches the spelling; every shown name sounds as the key played (`noteToMidi`); chromatic runs sharp up and flat down;
2. PI4 D harmonic minor shows Bb4 and C#5, never A#;
3. F melodic minor: "F4 G4 Ab4 Bb4 C5 D5 E5 F5 Eb5 Db5 C5 Bb4 Ab4 G4 F4";
4. G# harmonic minor reads F##5 (MIDI 79), and Cb4/B#3 octaves follow the letter.

All 102 stored spellings passed: there were no data errors, only the display bug.

### 3.2 FIBA and NBA distances

| App text | Verdict | Source and verbatim quote |
|---|---|---|
| Free throws "from the FIBA line (5.80 m from the inside of the end line)" (`content/skill-piano-bb-sittings.js` BB4-5, `skill-progressions/basketball.json`) | Confirmed | FIBA 2026 Art. 2.5.3: "It shall have its furthest edge 5.80 m from the inner edge of the endline and shall be 3.60 m long." |
| "FIBA's line is 6.75 m round the arc" | Confirmed | FIBA 2026 Art. 2.5.4: "An arc of radius 6.75 m measured from the point on the court beneath the exact centre of the opponents' basket" |
| "and 6.60 m in the corners" | Confirmed (derived) | Art. 2.5.4: "outer edge 0.90 m from the inner edge of the sidelines."; Art. 2.4: "dimensions of 28 m in length by 15 m in width": 7.50 − 0.90 = 6.60 m |
| "The free-throw line is about 4.6 m from the backboard face in both NBA and FIBA" | Confirmed | FIBA Equipment 2026 v1.0 §1.1.8, https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-equipment-v1-0.pdf: "point on the floor which lies 1,200 mm from the centre point of the inner edge of each endline" (5.80 − 1.20 = 4.60 m); NBA Rule 1, https://official.nba.com/rule-no-1-court-dimensions-equipment/ (2026-27 page): "shall be 15’ from the plane of the face of the backboard" (4.57 m) |
| Rim "10 feet (3.05 m)" | Confirmed | FIBA Equipment §1.2.4: "The top edge of each ring shall be positioned horizontally, 3,050 mm"; NBA Rule 1: "with its upper edge 10’ above and parallel to the floor" |
| NBA three "23 feet 9 inches", "22 feet in the corners"; court.js 23.75 ft arc, corners 3 ft from the sideline, 14 ft up | Confirmed | NBA Rule 1: "parallel lines 3’ from the sidelines, extending from the baseline and an arc of 23’9” from the middle of the basket" |
| NBA restricted area 4 ft (court.js) | Confirmed | NBA Rule 1: "A Restricted Area shall be marked with a half-circle 4’ from the center of the basket ring" |
| BB8-12 rules items: 3 seconds, 24-second clock, 5 fouls (FIBA), 4 × 10 minutes, legal guarding position may move sideways | Confirmed | FIBA 2026: "A player shall not remain in the opponents' restricted area for more than 3 conse[cutive seconds]"; "that team must attempt a shot for a goal within 24 seconds."; "A player who has committed 5 fouls shall be informed of it by a referee"; "The game shall consist of 4 quarters of 10 minutes each."; "The defensive player may remain stationary, jump vertically, move laterally or [backwards]" |

### 3.3 Box-score formulas (`content/basketball-items.js`, used by BB8-12 applied tasks)

The code was read and each formula re-derived: eFG is computed as (2·FGM + 3PM)/(2·FGA) = (FGM + 0.5·3PM)/FGA, TS as 25·PTS/(2·(25·FGA + 11·FTA)) = PTS/(2·(FGA + 0.44·FTA)), possessions as FGA − ORB + TOV + 0.44·FTA (exact integer arithmetic, rounded half up). All match.

| Formula | Verdict | Source and verbatim quote |
|---|---|---|
| eFG% = (FGM + 0.5 × 3PM) / FGA | Confirmed | Basketball-Reference glossary, https://www.basketball-reference.com/about/glossary.html: "eFG% - Effective Field Goal Percentage; the formula is (FG + 0.5 * 3P) / FGA." |
| TS% = PTS / (2 × (FGA + 0.44 × FTA)) | Confirmed | same: "TS% - True Shooting Percentage; the formula is PTS / (2 * TSA)." and "TSA - True Shooting Attempts; the formula is FGA + 0.44 * FTA."; NBA.com glossary, https://www.nba.com/stats/help/glossary: "Points/ [2*(Field Goals Attempted+0.44*Free Throws Attempted)]" |
| Possessions ≈ FGA − ORB + TOV + 0.44 × FTA (labelled "Estimate") | Confirmed as Oliver's estimator (Basketball-Reference uses a longer team formula) | arXiv 2605.24056, https://arxiv.org/pdf/2605.24056 (citing Oliver 2004 and Kubatko et al. 2007): "Oliver (2004) proposed the foundational estimator: POSS = FGA - OREB + TO + 0.44" |
| FG%, points (2s, 3s, FTs) | Confirmed | arithmetic |
| Four Factors item | Confirmed | https://www.basketball-reference.com/about/factors.html: "Shooting (40%) Turnovers (25%) Rebounding (20%) Free Throws (15%)" |

No PER-style formula is used anywhere in the stage checks.

### 3.4 Decision-scene rules (`content/basketball-scenes.js` `read()`)

These are coaching reads, not rulebook facts, so they were checked for agreement with coaching sources, not against a single authority. All agree; none was changed.

| Read | Source and verbatim quote |
|---|---|
| Zone shapes (2-3: two high, three low; 3-2; 1-3-1) | Wikipedia, https://en.wikipedia.org/wiki/Zone_defense: "in a 2–3 zone two defenders cover areas in the top of the zone" |
| Ball screen: defender goes under → pull-up jumper | Coaching Toolbox, https://coachingtoolbox.net/basketball-drills/basketball-drills-ball-screen-breakdowns.html: "Under x1 goes UNDER screen. The defense gives up: pull up jumpers" |
| Ball screen: two on the ball (trap) → hit the roller | same: "Defense traps the ball screen, big needs to dive automatically to the rim." |
| Ball screen: defender sits on the screen side (top lock) → reject | The Hoops Geek, https://www.thehoopsgeek.com/pick-and-roll-defense: "allowing the ball handler to reject the screen can open easy driving lanes and expose the defense." |
| Transition / 2v1 / 3v2: attack the numbers, pass to the open man | Wikipedia, https://en.wikipedia.org/wiki/Fast_break: "so that the defense is outnumbered and does not have time to set up." |
| Off the ball: denied → back-door cut | Wikipedia (Back-door cut → Princeton offense), https://en.wikipedia.org/wiki/Princeton_offense: "a player without the ball cuts toward the unoccupied area under and around the basket, and receives the ball for a layup." |

The court geometry the scenes use (`public/engine/basketball/court.js`: rim at 5.25 ft, lane 16 × 19 ft, 23.75 ft arc, 22 ft corners to 14 ft, 4 ft restricted arc) is the NBA's, consistent with the NBA Rule 1 quotes above. One observation, not an error: `pedalPassage` builds its V chord from the key signature, so in minor keys it is a minor v rather than the usual major V; that is a style choice for a pedalling drill.

---

## 4. The web references in CONTENT-FACT-AUDIT, SKILL-APPS-MECHANICS and BETA-LAUNCH-KIT

**Count.** The AWAY log says 185 unique; a fresh extraction finds **199 unique URLs**: 115 + 54 + 30. Two of BETA's are `https://app.<domain>`/`https://www.<domain>` templates, not references, so **197 real links** were checked. The difference is CONTENT-FACT-AUDIT (115 now, 101 in the log). Every link was fetched live (curl, browser user agent); Wikipedia and Wiktionary support was read from the kiwix copies, and the live article also resolved.

**Results:** 178 verified, 18 changed, 1 dead (replaced), 0 unresolvable.
- **Dead:** support.shottracker.com/howitworks (404), replaced in SKILL-APPS-MECHANICS.md by https://shottracker.com/faq/.
- **Blocked to scripts but live:** Yousician help (403 Cloudflare; the search index shows the article at the same URL) and npmjs.com/package/stockfish (403; checked through https://registry.npmjs.org/stockfish/latest: GPL-3.0, 19.0.1). GitHub's first answer for chess-openings was a 429 rate limit; the re-fetch was 200.
- **Changed, docs corrected:** Amazon SES pricing, now with plans (Essentials $0.16 per 1,000; à-la-carte still $0.10): the BETA-LAUNCH-KIT line now says so. Cloudflare's /email-routing/ redirects to /email-service/, and Ultralytics' /request-license to /license; both are noted in the docs' headers.
- **Changed, replacement source given (CONTENT-FACT-AUDIT):** 15 links whose page does not support the item they are cited for. Examples: a PPPoE networking article for a passive-voice item, a Basque suffix entry ("-ko") for a mood shift, an 11th-century Arabic treatise for "rhetorical grammar", "Context effect" (psychology) for affect/effect, "Compound point" for a dash pair, Spanish articles for English items, the APA_style article for the reference-list format, and the general "Equation solving" article for 31 specific algebra fixes. The audit's verdicts on the items stand: each was a code- or hand-checked error. Only the cited topic link was weak.
- **Partly mismatched:** 11 more links are fine for their main item but are also cited for items they do not cover (listed per row below).

The three reports now carry a one-line "re-checked 2026-10-25" note pointing here.

### CONTENT-FACT-AUDIT.md (115 links: 100 verified, 15 changed)

| # | URL | Verdict | Quote (verbatim) | Notes / replacement |
|---|---|---|---|---|
| 0 | https://en.wiktionary.org/wiki/affect | verified | "To influence or alter." |  |
| 1 | https://en.wikipedia.org/wiki/Pluperfect | verified | "The pluperfect is needed to make it clear that the first event" | **Also cited for, not supported:** Q113, Q120 (voice shifts): use https://en.wikipedia.org/wiki/Voice_(grammar) |
| 2 | https://en.wikipedia.org/wiki/Antithesis | verified | "An antithesis can be a simple statement contrasting two things, using a parallel structure" |  |
| 3 | https://en.wikipedia.org/wiki/Dependent_clause | verified | "as with all dependent clauses, they cannot stand alone." | **Also cited for, not supported:** Q6 (sentence pattern), Q9 (combine): topic only |
| 4 | https://en.wikipedia.org/wiki/Citation | changed | "citations may also include unique identifiers depending on the type of work being referred to." | The article does not mention URLs or access dates (Q7). **Replacement:** https://owl.purdue.edu/owl/research_and_citation/mla_style/mla_formatting_and_style_guide/mla_works_cited_electronic_sources.html — "MLA uses the phrase, “Accessed” to denote which date you accessed the web page when available or necessary." **Also cited for, not supported:** Q64 (style in rhetorical analysis), Q90 (synthesis), Q150 (checking accuracy): not about citation |
| 5 | https://en.wikipedia.org/wiki/Sentence_fragment | verified | "A set of words with no independent clause may be an incomplete sentence, also called a sentence fragment." | Redirects to "Sentence clause structure". **Also cited for, not supported:** Q86, Q88, Q106 (balanced/cumulative sentences): use https://en.wikipedia.org/wiki/Parallelism_(grammar) |
| 6 | https://en.wikipedia.org/wiki/Comma_splice | verified | "is the use of a comma to join two independent clauses." | **Also cited for, not supported:** Q100 (parallel structure): use https://en.wikipedia.org/wiki/Parallelism_(grammar); Q97, Q101 (deliberate fragments): use https://en.wikipedia.org/wiki/Sentence_clause_structure |
| 7 | https://en.wikipedia.org/wiki/Rhetoric | verified | "rhetoric aims to study the techniques that speakers or writers use to inform, persuade, and motivate their audiences." |  |
| 8 | https://en.wikipedia.org/wiki/Dangling_modifier | verified | "A dangling modifier has no subject and is usually a participle." |  |
| 9 | https://en.wikipedia.org/wiki/Parallelism_(grammar) | verified | "is a balance within one or more sentences of similar phrases or clauses that have the same grammatical structure." |  |
| 10 | https://en.wikipedia.org/wiki/English_passive_voice | verified | "The English passive voice typically involves forms of the verbs to be or to get followed by a passive participle" | **Also cited for, not supported:** Q42, Q128 (ellipsis): use https://en.wikipedia.org/wiki/Ellipsis; Q98 (parallel structure): use https://en.wikipedia.org/wiki/Parallelism_(grammar); Q91 (note-taking): not about voice |
| 11 | https://en.wikipedia.org/wiki/Mood_(grammar) | verified | "Some examples of moods are indicative, interrogative, imperative, subjunctive" |  |
| 12 | https://en.wikipedia.org/wiki/English_subjunctive | verified | "the subjunctive is a grammatical construction recognizable by its use of the bare form of a verb in a finite clause" | **Also cited for, not supported:** Q121 (voice): use https://en.wikipedia.org/wiki/Voice_(grammar) |
| 13 | https://en.wikipedia.org/wiki/Semicolon | verified | "a semicolon is most commonly used to link (in a single sentence) two independent clauses that are closely related in thought" | **Also cited for, not supported:** Q124 (dash): use https://en.wikipedia.org/wiki/Dash; Q127 (colon before a list): use https://en.wikipedia.org/wiki/Colon_(punctuation) |
| 14 | https://en.wikipedia.org/wiki/Dash | verified | "Typical uses of dashes are to mark a break in a sentence, to set off an explanatory remark" |  |
| 15 | https://en.wiktionary.org/wiki/hopefully | verified | "It is hoped that" |  |
| 16 | https://en.wikipedia.org/wiki/Serial_comma | verified | "is a comma placed after the penultimate term in a list (just before the conjunction) when writing out three or more terms." |  |
| 17 | https://en.wikipedia.org/wiki/Ellipsis | verified | "An ellipsis can be used in many ways, such as for intentional omission of text or numbers" |  |
| 18 | https://en.wikipedia.org/wiki/Style_guide | verified | "A style guide establishes standard style requirements to improve communication by ensuring consistency within and across documents." | **Also cited for, not supported:** Q48 (singular they over time): use https://en.wikipedia.org/wiki/Singular_they |
| 19 | https://en.wikipedia.org/wiki/Singular_they | verified | "Singular they has been criticized since the mid-18th century by prescriptive commentators who consider it an error." |  |
| 20 | https://en.wikipedia.org/wiki/Split_infinitive | verified | "This is an example of an adverb being transferred into split infinitive position" |  |
| 21 | https://en.wikipedia.org/wiki/Connotation | verified | "A connotation is a commonly understood cultural or emotional association that any given word or phrase carries" |  |
| 22 | https://en.wikipedia.org/wiki/English_grammar | changed | "run can serve as either a verb or a noun" | The general English grammar article says nothing about "eradicated" vs "deleted" (Q53). **Replacement:** https://en.wiktionary.org/wiki/eradicate — "To destroy completely; to reduce to nothing radically; to put an end to." |
| 23 | https://en.wiktionary.org/wiki/imply | verified | "To suggest by logical inference." |  |
| 24 | https://en.wiktionary.org/wiki/sub- | verified | "From Latin sub- (“under”)." |  |
| 25 | https://en.wiktionary.org/wiki/exactly | verified | "Without approximation; precisely." |  |
| 26 | https://en.wikipedia.org/wiki/Appositive | verified | "two elements, normally noun phrases, are placed side by side so one element identifies the other in a different way." | Redirects to "Apposition". |
| 27 | https://en.wiktionary.org/wiki/its | verified | "Determiner its Belonging to it." |  |
| 28 | https://en.wikipedia.org/wiki/Evidence | verified | "Evidence for a proposition is what supports the proposition." |  |
| 29 | https://en.wikipedia.org/wiki/Primary_source | verified | "a primary source, or the "primary literature", is the original publication of a scientist's new data, results, and theories." | Supports "original" sources in general; the interview example is the audit's own reasoning. |
| 30 | https://en.wikipedia.org/wiki/Hanging_indent | changed | "For hanging indentation all but the first line of a paragraph is indented." | Redirects to "Indentation (typesetting)"; it defines a hanging indent but not its use on a Works Cited/References page. **Replacement:** https://owl.purdue.edu/owl/research_and_citation/apa_style/apa_formatting_and_style_guide/reference_list_basic_rules.html — "This is called hanging indentation." |
| 31 | https://en.wikipedia.org/wiki/APA_style | changed | "APA style is widely used, either entirely or with modifications, by hundreds of other scientific journals" | The article does not state the reference-entry order or the References page format (Q68, Q69). **Replacement:** https://owl.purdue.edu/owl/research_and_citation/apa_style/apa_formatting_and_style_guide/reference_list_basic_rules.html — "Your references should begin on a new page separate from the text of the essay; label this page "References" in bold" **Also cited for, not supported:** Q70 (plagiarism): use https://en.wikipedia.org/wiki/Plagiarism |
| 32 | https://en.wikipedia.org/wiki/Essay | verified | "Essays are commonly used as literary criticism, political manifestos, learned arguments, observations of daily life, recollections, and reflections of the author." |  |
| 33 | https://en.wikipedia.org/wiki/IMRAD | verified | "IMRAD or IMRaD ( / ˈ ɪ m r æ d / ) ( Introduction, Methods, Results, and Discussion )" |  |
| 34 | https://en.wiktionary.org/wiki/unless | verified | "Except on a specified condition; if not." |  |
| 35 | https://en.wikipedia.org/wiki/Multimodality | verified | "Multimodality describes communication practices in terms of the textual, aural, linguistic, spatial, and visual resources used to compose messages." |  |
| 36 | https://en.wikipedia.org/wiki/Double_negative | verified | "applied to the non-standard use of a second negative as an intensifier to a negation." |  |
| 37 | https://en.wiktionary.org/wiki/their | verified | "belonging to them (plural)" |  |
| 38 | https://en.wiktionary.org/wiki/lose | verified | "To cease to have (something) in one's possession or capability." |  |
| 39 | https://en.wiktionary.org/wiki/accept | verified | "To receive something willingly." |  |
| 40 | https://en.wiktionary.org/wiki/desert | verified | "desert (desolate terrain)" | Weak: the English noun sense ("A barren area ... with little rain") is the better line; the noun entry exists. |
| 41 | https://en.wikipedia.org/wiki/Weather_forecasting | verified | "People have attempted to predict the weather informally for thousands of years and formally since the 19th century." |  |
| 42 | https://en.wiktionary.org/wiki/worry | verified | "To be troubled; to give way to mental anxiety or doubt." |  |
| 43 | https://en.wikipedia.org/wiki/Register_(sociolinguistics) | verified | "The term register is often, in language teaching especially, shorthand for formal/informal style" |  |
| 44 | https://en.wikipedia.org/wiki/Brake | verified | "A brake is a mechanical device that inhibits motion by absorbing energy from a moving system." |  |
| 45 | https://en.wiktionary.org/wiki/speak | verified | "Speak to me only with your eyes." | Shows "speak to" in use; the dictionary does not rank "speak to" over "speak at". |
| 46 | https://en.wiktionary.org/wiki/curious | verified | "Tending to ask questions, or to want to explore or investigate; inquisitive" |  |
| 47 | https://en.wikipedia.org/wiki/Adverb | verified | "An adverb is a word or an expression that generally modifies a verb, an adjective, another adverb" |  |
| 48 | https://en.wikipedia.org/wiki/Modes_of_persuasion | verified | "logos, with numbers; pathos, with emotional appeal; ethos, with the authority of an entity" |  |
| 49 | https://en.wikipedia.org/wiki/Imitation | verified | "is a behavior whereby an individual observes and replicates another's behavior." | Topic only: the "understand the technique first" point is pedagogy, not in the article. |
| 50 | https://en.wikipedia.org/wiki/Agreement_(linguistics) | verified | "This is because English grammar requires that the verb and its subject agree in person." |  |
| 51 | https://en.wikipedia.org/wiki/English_conditional_sentences | verified | "In English conditional sentences, the antecedent (protasis) is a dependent clause, most commonly introduced by the complementizer if." |  |
| 52 | https://en.wiktionary.org/wiki/effect | verified | "bring about; to implement." |  |
| 53 | https://en.wikipedia.org/wiki/Preposition_stranding | verified | "Today, most sources consider it to be acceptable in standard formal English." |  |
| 54 | https://en.wikipedia.org/wiki/Colon_(punctuation) | verified | "A colon often precedes an explanation, a list" |  |
| 55 | https://en.wikipedia.org/wiki/Equation_solving | changed | "An equation may be solved either numerically or symbolically." | General article: it does not state the equality properties the lesson fixes rely on (31 uses). **Replacement:** https://openstax.org/books/elementary-algebra-2e/pages/2-1-solve-equations-using-the-subtraction-and-addition-properties-of-equality — "When you subtract the same quantity from both sides of an equation, you still have equality." **Also cited for, not supported:** P43, P44, P49, P54, P55 (translating "less than"): use https://openstax.org/books/prealgebra-2e/pages/1-3-subtract-whole-numbers (Table 1.3: "5 less than 8" is 8 − 5) |
| 56 | https://en.wikipedia.org/wiki/Negative_number | verified | "Thus zero appears in the middle, with the positive numbers to the right and the negative numbers to the left." |  |
| 57 | https://en.wikipedia.org/wiki/Auxiliary_verb | verified | "Here, the auxiliary have helps to express the perfect aspect along with the participle, finished." |  |
| 58 | https://en.wiktionary.org/wiki/chip | verified | "A small piece broken from a larger piece of solid material." | The spelling point ("chip" minus "ch" is "ip") is self-evident. |
| 59 | https://en.wikipedia.org/wiki/Oxymoron | verified | "is a figure of speech that juxtaposes concepts with opposite meanings within a word or in a phrase that is a self-contradiction." |  |
| 60 | https://en.wiktionary.org/wiki/-graphy | verified | "from γραφή (graphḗ, “writing, drawing, description”)" |  |
| 61 | https://en.wiktionary.org/wiki/diagnosis | verified | "From Latin diagnōsis, from Ancient Greek διάγνωσις (diágnōsis)" |  |
| 62 | https://en.wiktionary.org/wiki/geo- | verified | "From Ancient Greek γεω- (geō-), combining form of γῆ (gê, “earth”)." |  |
| 63 | https://en.wikipedia.org/wiki/Collective_noun | verified | "collective nouns take either singular or plural verb forms depending on context" |  |
| 64 | https://en.wikipedia.org/wiki/Uses_of_English_verb_forms | verified | "We let them leave." |  |
| 65 | https://en.wikipedia.org/wiki/Dangling_modifiers | verified | "A dangling modifier has no subject and is usually a participle." | Redirects to "Dangling modifier". |
| 66 | https://en.wiktionary.org/wiki/run-on_sentence | verified | "So called because the sentence runs on beyond the point where it should end." |  |
| 67 | https://en.wiktionary.org/wiki/it's | verified | "Contraction of ‘ it is ’, ‘it has ’ or 'it was '." |  |
| 68 | https://en.wikipedia.org/wiki/Context_effect | changed | "A context effect is an aspect of cognitive psychology that describes the influence of environmental factors on one's perception of a stimulus." | A psychology article; it does not support "affect" as the verb in N9. **Replacement:** https://dictionary.cambridge.org/grammar/british-grammar/affect-or-effect — "Affect is a verb meaning ‘influence or cause someone or something to change’" |
| 69 | https://en.wikipedia.org/wiki/Conjunction_(grammar) | verified | "In English, a given word may have several senses and in some contexts be a preposition but a conjunction in others" | Topic only; for N14/N63 the Purdue clause page is stronger: https://owl.purdue.edu/owl/general_writing/punctuation/independent_and_dependent_clauses/index.html |
| 70 | https://en.wikipedia.org/wiki/Complete_sentence | verified | "A simple sentence consists of a single independent clause with no dependent clauses." | Redirects to "Sentence (linguistics)". |
| 71 | https://en.wikipedia.org/wiki/Dashes | verified | "Typical uses of dashes are to mark a break in a sentence, to set off an explanatory remark" |  |
| 72 | https://en.wikipedia.org/wiki/Style_Guide | verified | "The standards documented in a style guide are applicable for either general use, or prescribed use in an individual publication" |  |
| 73 | https://en.wikipedia.org/wiki/Irregardless | verified | "Irregardless is a word sometimes used in place of regardless or irrespective, which has caused controversy since the early twentieth century" |  |
| 74 | https://en.wiktionary.org/wiki/comma_splice | verified | "Two independent clauses combined into a run-on sentence with only a comma between them." |  |
| 75 | https://en.wiktionary.org/wiki/usage_guide | verified | "A book that explains how to use a standardised language correctly and in keeping with currently accepted style" |  |
| 76 | https://en.wikipedia.org/wiki/Plagiarism | verified | "to denote copying someone else's creative work was pioneered by the Roman poet Martial" |  |
| 77 | https://en.wiktionary.org/wiki/voice | verified | "sound thus uttered considered as possessing some special quality or character." | Weak for the literary sense; acceptable. |
| 78 | https://en.wikipedia.org/wiki/Sentence_clause_structure | verified | "is the classification of sentences based on the number and kind of clauses in their syntactic structure." | Does not state the colon rule (N37); the Purdue punctuation page does: https://owl.purdue.edu/owl/general_writing/punctuation/punctuation/index.html |
| 79 | https://en.wikipedia.org/wiki/Split_Infinitive | verified | "This is an example of an adverb being transferred into split infinitive position" |  |
| 80 | https://en.wikipedia.org/wiki/Disputed_English_usage | verified | "Disputed usage : "Hopefully, I shall be spared the guillotine", the prisoner thought." | Redirects to "List of English words with disputed usage". |
| 81 | https://en.wikipedia.org/wiki/Amount | changed | "Quantity or amount is a property that includes numbers and quantifiable phenomena" | Redirects to "Quantity"; it does not give the amount/number usage rule (N43). **Replacement:** https://dictionary.cambridge.org/grammar/british-grammar/amount-of-number-of-or-quantity-of — "We use amount of with uncountable nouns." |
| 82 | https://en.wikipedia.org/wiki/Subjunctive | verified | "Subjunctive forms of verbs are typically used to express various states of unreality, such as wish" |  |
| 83 | https://en.wikipedia.org/wiki/Passive_voice_in_English | verified | "it may also be included adjunctively while maintaining the passive voice: The enemy was defeated by our troops." |  |
| 84 | https://en.wikipedia.org/wiki/Spanish_verbs | changed | "Imperative mood: The imperative mood expresses direct commands, requests, and prohibitions." | A Spanish-verbs article cited for an English item; true but off-topic. **Replacement:** https://en.wikipedia.org/wiki/Imperative_mood — "The imperative mood is a grammatical mood that forms a command or request." |
| 85 | https://en.wikipedia.org/wiki/The_Chicago_Manual_of_Style | verified | "is a style guide for American English published since 1906 by the University of Chicago Press." |  |
| 86 | https://en.wiktionary.org/wiki/elicit | verified | "Borrowed from Latin elicitus from eliciō (“draw forth”)." |  |
| 87 | https://en.wikipedia.org/wiki/Automatic_summarization | changed | "Automatic summarization has been extended to audio content such as podcasts" | About software summarizers; does not support the summary-versus-analysis point (N62). **Replacement:** https://en.wikipedia.org/wiki/Thesis_statement — "A thesis statement is a statement of one's core argument, the main idea(s), and/or a concise summary of an essay" |
| 88 | https://en.wiktionary.org/wiki/thing | verified | "That which is considered to exist as a separate entity, object, quality or concept." |  |
| 89 | https://en.wikipedia.org/wiki/Disputed_English | verified | "The prescriptivist tradition may affect attitudes toward certain usages and thus the preferences of some speakers." | Redirects to "English usage controversies". |
| 90 | https://en.wiktionary.org/wiki/however | verified | "this is widely accepted if followed immediately by a comma." |  |
| 91 | https://en.wiktionary.org/wiki/periodic_structure | verified | "A sentence whose main clause appears at the end, after other, especially dependent, clauses." |  |
| 92 | https://en.wikipedia.org/wiki/Dala'il_al-I'jaz | changed | "It is widely regarded as a pioneering text in the field of ʿilm al-balāgha (Arabic rhetorical science)" | An 11th-century Arabic rhetoric treatise; it does not support the item (N78). **Replacement:** https://en.wikipedia.org/wiki/Rhetoric — "rhetoric aims to study the techniques that speakers or writers use to inform, persuade, and motivate their audiences." |
| 93 | https://en.wikipedia.org/wiki/Associated_Press_Style_Guide | verified | "The Stylebook offers a basic reference to American English grammar, punctuation, and principles of reporting" | Redirects to "AP Stylebook". |
| 94 | https://en.wikipedia.org/wiki/Thesis_Statement | verified | "A thesis statement is a statement of one's core argument, the main idea(s), and/or a concise summary of an essay" |  |
| 95 | https://en.wikipedia.org/wiki/Porting | verified | "The term "port" is derived from the Latin portāre, meaning "to carry"." | A software article, but its etymology line supports "port-: carry". |
| 96 | https://en.wiktionary.org/wiki/frugal | verified | "from Latin frugalis (“virtuous, thrifty”)." |  |
| 97 | https://en.wikipedia.org/wiki/Subjunctive_mood | verified | "The subjunctive is one of the irrealis moods, which refer to what is not necessarily real." |  |
| 98 | https://en.wikipedia.org/wiki/Subjunctive_mood_in_Spanish | changed | "When the subjunctive appears, the clause may describe necessity, possibility, hopes, concession, condition" | Spanish article cited for English "If the storm were worse". **Replacement:** https://en.wikipedia.org/wiki/Subjunctive_mood — "The subjunctive is one of the irrealis moods, which refer to what is not necessarily real." |
| 99 | https://en.wikipedia.org/wiki/Comma | verified | "a comma is often used to separate a dependent clause from the independent clause if the dependent clause comes first" |  |
| 100 | https://en.wikipedia.org/wiki/Analysis | verified | "The word comes from the Ancient Greek ἀνάλυσις (analysis, "a breaking-up" or "an untying"" | Topic only. |
| 101 | https://en.wikipedia.org/wiki/Persuasive_writing | verified | "persuasive writing often requires a comprehensive understanding of both sides of the argument" |  |
| 102 | https://en.wiktionary.org/wiki/stench | verified | "a strong foul smell; a stink." |  |
| 103 | https://en.wiktionary.org/wiki/-ko | changed | "Proper nouns and verbs ending /n/ or /l/ take the voiced form -go." | A Basque suffix entry; unrelated to the mood-shift item (N126). **Replacement:** https://web.mit.edu/course/21/21.guide/shifts.htm — "Be consistent in your choice of tense, mood, person, and voice." |
| 104 | https://en.wikipedia.org/wiki/EVIDENCE | verified | "Evidence for a proposition is what supports the proposition." |  |
| 105 | https://en.wikipedia.org/wiki/Poetic_device | changed | "A poetic device is a literary device used specifically in poetry or for poetic effect." | About poetry, not punctuation for effect (N129). **Replacement:** https://owl.purdue.edu/owl/general_writing/punctuation/punctuation/index.html — "Dashes place more emphasis on this content than parentheses." |
| 106 | https://en.wikipedia.org/wiki/Oxford_Comma | verified | "is a comma placed after the penultimate term in a list (just before the conjunction)" | Redirects to "Serial comma". |
| 107 | https://en.wikipedia.org/wiki/Balanced_sentence | verified | "A balanced sentence is a sentence that employs parallel structures of approximately the same length and importance." |  |
| 108 | https://en.wikipedia.org/wiki/Rhetorical_stance | verified | "Rhetorical stance refers to the deliberate choices made by a communicator in shaping and presenting their message." |  |
| 109 | https://en.wikipedia.org/wiki/Rhetorical_Question | verified | "The hypophora is a hyponym of a rhetorical question" | Weak; the article's lead sentence (a question asked to make a point) is the better line. |
| 110 | https://en.wiktionary.org/wiki/periodic_sentence | verified | "A complex sentence whose main clause is left unfinished until the end in order to create the effect of anticipation or suspense." |  |
| 111 | https://en.wikipedia.org/wiki/Point-to-Point_Protocol_over_Ethernet | changed | "residential gateways also use PPPoE" | A networking article (PPPoE) cited for a passive-voice item (N140): unrelated. **Replacement:** https://en.wikipedia.org/wiki/Voice_(grammar) — "When the subject is the patient, target or undergoer of the action, the verb is said to be in the passive voice." |
| 112 | https://en.wikipedia.org/wiki/Compound_point | changed | "these paired forms of punctuation seem most often to have been called (generically) compound points" | About comma-dash style marks, not a dash pair around an aside (N142). **Replacement:** https://en.wikipedia.org/wiki/Dash — "to set off an explanatory remark—similar to parentheses" |
| 113 | https://en.wikipedia.org/wiki/Voice_(grammar) | verified | "When the subject is the patient, target or undergoer of the action, the verb is said to be in the passive voice." |  |
| 114 | https://en.wikipedia.org/wiki/Expert_Testimony | verified | "Expert witnesses may also deliver "expert evidence" within the area of their expertise." | Redirects to "Expert witness". |

### SKILL-APPS-MECHANICS.md (54 links: 52 verified, 1 dead, 1 changed)

| # | URL | Verdict | Quote (verbatim) | Notes / replacement |
|---|---|---|---|---|
| 115 | https://apps.apple.com/us/app/homecourt-basketball-training/id1258520424 | verified | "HomeCourt: Basketball Training App - App Store" |  |
| 116 | https://help.homecourt.ai/hc/en-us/articles/9344374524179-How-should-I-set-up-my-device | verified | "How should I set up my device?" |  |
| 117 | https://www.homecourt.ai/in-app/gettingstarted | verified | "iPhone/iPad set up at approximately 5 ft above ground, have clear view of the hoop, player and 3 point line" |  |
| 118 | https://www.homecourt.ai/faq-old | verified | "You can use an iPhone 5s or later to view videos" |  |
| 119 | https://www.sportsbusinessdaily.com/Daily/Issues/2018/10/18/Technology/homecourt-apple-shot-science-steve-nash.aspx | verified | "introduces new metrics such as release time, release angle (or initial arc), leg angle" | sportsbusinessdaily.com now redirects to sportsbusinessjournal.com (same article). |
| 120 | https://patents.google.com/patent/US10489656B2/en | verified | "Methods and systems for ball game analytics with a mobile device" | Prior art date 2017-09-21 matches "priority 2017". |
| 121 | https://support.shottracker.com/howitworks | dead | — | HTTP 404 "Page not found". **Replacement:** https://shottracker.com/faq/ — "ShotTracker is made up of three components: anchors in the rafters, a ShotTracker-enabled ball and player sensors." |
| 122 | https://apps.apple.com/us/app/id1563442235 | verified | "Hoops: AI Basketball Training App - App Store" |  |
| 123 | https://apps.apple.com/app/id6775835405 | verified | "HoopCoach - AI Trainer App - App Store" |  |
| 124 | https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker | verified | "The pose landmarker model tracks 33 body landmark locations" |  |
| 125 | https://blog.tensorflow.org/2021/05/high-fidelity-pose-tracking-with-mediapipe-blazepose-and-tfjs.html | verified | "Lite model 10.6MB 1.91s Full model 14MB 1.91s Heavy model 34.9MB 4.82s" |  |
| 126 | https://cdn.jsdelivr.net/npm/@subhajit-gorai/react-native-mediapipe-llm@1.0.3/mediapipe/docs/solutions/pose.md | verified | "BlazePose GHUM Heavy \| 53 ms \| 38 ms" | Secondary copy (npm mirror of old MediaPipe docs), as the report says. |
| 127 | https://arxiv.org/abs/2206.11678 | verified | "BlazePose GHUM Holistic: Real-time 3D Human Landmarks and Pose Estimation" |  |
| 128 | https://developers.google.cn/static/ml-kit/images/vision/pose-detection/pose_model_card.pdf | verified | "LICENSED UNDER Apache License, Version 2.0" | The card lists TFLite sizes 3/6/26 MB, different from the TF.js sizes the report quotes from item 125; both are correct for their formats. |
| 129 | https://blog.tensorflow.org/2021/05/next-generation-pose-detection-with-movenet-and-tensorflowjs.html | verified | "MoveNet is an ultra fast and accurate model that detects 17 keypoints of a body." |  |
| 130 | https://developers.google.com/edge/mediapipe/solutions/vision/object_detector | verified | "The model was trained with the COCO dataset" |  |
| 131 | https://ultralytics.com/license | verified | "AGPL-3.0 covers a lot of use cases - but there are specific triggers that require an Ultralytics Enterprise license." | ultralytics.com/license redirects to www.ultralytics.com/license. |
| 132 | https://www.ultralytics.com/request-license | changed | "License Ultralytics YOLO for commercial deployment." | /request-license now redirects to /license (same page as item 131). |
| 133 | https://playground.roboflow.com/models/compare/rt-detr-vs-yolox | verified | "released in April 2023 under the Apache 2.0 license." |  |
| 134 | https://arxiv.org/pdf/2410.13842 | verified | "We introduce D-FINE, a powerful real-time object detector" | The PDF itself does not state a licence; the report already marks D-FINE's licence [S] "check the LICENSE files". |
| 135 | https://onnxruntime.ai/blogs/ort-1-17-release | verified | "ONNX Runtime 1.17: CUDA 12 support, Phi-2 optimizations, WebGPU, and more!" |  |
| 136 | https://piano-help.hellosimply.com/en/articles/6210583-ways-to-improve-note-recognition-in-simply-piano-for-ios-acoustic-piano | verified | "Ways to Improve Note Recognition in Simply Piano for iOS - Acoustic Piano" |  |
| 137 | https://www.weizmann.ac.il/WeizmannCompass/node/1756 | verified | "Mastering piano, thanks to algorithms" | node/1756 redirects to the article's new path. |
| 138 | https://patents.google.com/patent/US11893898B2/en | verified | "Original Assignee Joytunes Ltd" |  |
| 139 | https://support.yousician.com/hc/en-us/articles/46277319890449-Piano-sound-recognition-issues | verified | — | HTTP 403 bot wall (Cloudflare) to scripts and to WebFetch; the article is live in the search index under the same URL ("Piano sound recognition issues"). Not quoted verbatim. |
| 140 | https://help.flowkey.com/en/articles/412925-connect-your-instrument-with-your-pc-mac | verified | "Connect your instrument to your laptop or PC/Mac" | The slug changed; the old URL redirects to ".../412925-connect-your-instrument-to-your-laptop-or-pc-mac". |
| 141 | https://apps.apple.com/app/id1020357408 | verified | "flowkey – Learn to Play Piano App - App Store" |  |
| 142 | https://apps.apple.com/us/app/synthesia/id579518445 | verified | "Synthesia App - App Store" |  |
| 143 | https://arxiv.org/html/2203.09893v2 | verified | "A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation" | The paper is CC BY-NC-SA 4.0; the code licence (Apache-2.0) comes from item 144. |
| 144 | https://github.com/spotify/basic-pitch-ts | verified | "Readme Apache-2.0 license" |  |
| 145 | https://arxiv.org/abs/2010.01815 | verified | "High-resolution Piano Transcription with Pedals by Regressing Onset and Offset Times" |  |
| 146 | https://github.com/bytedance/piano_transcription | verified | "LICENSE Apache 2.0" |  |
| 147 | https://magenta.tensorflow.org/oaf-js | verified | "Piano Transcription in the Browser with Onsets and Frames" |  |
| 148 | https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2012/Benetos-Klapuri-Dixon-EUSIPCO2012a.pdf | verified | "SCORE-INFORMED TRANSCRIPTION FOR AUTOMATIC PIANO TUTORING" |  |
| 149 | https://archives.ismir.net/ismir2006/paper/000125.pdf | verified | "Multiple Fundamental Frequency Estimation by Summing Harmonic Amplitudes" |  |
| 150 | https://jefftk.com/p/audioworklet-latency-firefox-vs-chrome | verified | "I decided to take some latency measurements." |  |
| 151 | https://web.dev/articles/audio-output-latency | verified | "The outputLatency property of an AudioContext instance provides an estimate of audio hardware's output latency" |  |
| 152 | https://magenta.tensorflow.org/datasets/maestro | verified | "Creative Commons Attribution Non-Commercial Share-Alike 4.0 (CC BY-NC-SA 4.0) license" |  |
| 153 | https://support.chess.com/en/articles/10319322-how-does-the-spaced-repetition-scheduling-work | verified | "How does the spaced repetition scheduling work?" |  |
| 154 | https://database.lichess.org/ | verified | "Database exports are released under the Creative Commons CC0 license." |  |
| 155 | https://github.com/ornicar/lichess-puzzler | verified | "Readme AGPL-3.0 license" |  |
| 156 | https://lichess.org/forum/general-chess-discussion/puzzle-rating-question | verified | "Puzzle rating question" |  |
| 157 | https://github.com/lichess-org/chess-openings/blob/master/README.md | verified | "Insofar as that qualifies for copyright, the work is released under the CC0 Public Domain Dedication." | First fetch hit a GitHub rate limit (429); the re-fetch was 200. |
| 158 | https://github.com/official-stockfish/Stockfish | verified | "Readme GPL-3.0 license" |  |
| 159 | https://Stockfishchess.org/files/settlement_english.pdf | verified | "ensure compliance with the GPL-3.0 license terms" |  |
| 160 | https://npmjs.com/package/stockfish | verified | — | npmjs.com answers 403 (bot wall) to scripts; checked through the npm registry API instead: https://registry.npmjs.org/stockfish/latest (license "GPL-3.0", version 19.0.1). Registry: "The Stockfish chess engine in Web Assembly (WASM)" |
| 161 | https://github.com/lichess-org/stockfish.wasm | verified | "Readme GPL-3.0 license" |  |
| 162 | https://github.com/lithander/Leorik | verified | "Readme MIT license" |  |
| 163 | https://github.com/cosmobobak/viridithas | verified | "Readme AGPL-3.0 license" |  |
| 164 | https://talkchess.com/viewtopic.php?p=841253 | verified | "That's the only JS engine with permis" | Quote cut by the page; full line names Garbochess-JS (BSD-3-clause). |
| 165 | https://github.com/CSSLab/maia2 | verified | "Official implementation of Maia-2, a unified human-like chess model across skill levels." |  |
| 166 | https://github.com/CSSLab/maia3 | verified | "Readme AGPL-3.0 license" |  |
| 167 | https://lichess.org/@/ashtonanderson/blog/introducing-maia-3-free-and-open-source/vCPPRtX3 | verified | "Introducing Maia-3: free and open source" |  |
| 168 | https://www.gnu.org/licenses/why-affero-gpl.html | verified | "if you run a modified program on a server and let other users communicate with it there" |  |

### BETA-LAUNCH-KIT.md (30 links: 2 placeholder, 26 verified, 2 changed)

| # | URL | Verdict | Quote (verbatim) | Notes / replacement |
|---|---|---|---|---|
| 169 | https://app | placeholder | — | https://app.<domain> is a template, not a reference. |
| 170 | https://www | placeholder | — | https://www.<domain> is a template, not a reference. |
| 171 | https://api.resend.com/emails | verified | — | API endpoint: answers 401 without a key, as expected; documented in item 189 ("curl -X POST 'https://api.resend.com/emails'"). |
| 172 | https://api.brevo.com/v3/smtp/email | verified | — | API endpoint: answers 401 without a key, as expected; documented in item 192. |
| 173 | https://www.hetzner.com/cloud/ | verified | "Cost-Optimized Perfect for test environments Regular Performance Best price-performance ratio" |  |
| 174 | https://www.hetzner.com/cloud/regular-performance/ | verified | "CPX02 New 1 AMD 1 GB 20 GB NVMe from /month € 6.49 per month, excl. VAT" |  |
| 175 | https://www.hetzner.com/cloud/cost-optimized/ | verified | "CX23 not available 2 Intel®/AMD 4 GB 40 GB NVMe from /month € 5.99 per month, excl. VAT" |  |
| 176 | https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm | verified | "For Always Free tenancies, this is equivalent to 2 OCPUs and 12 GB of memory." |  |
| 177 | https://docs.fly.io/about/pricing | verified | "New organizations don’t have a free tier or a monthly free usage allowance." |  |
| 178 | https://render.com/docs/free | verified | "Render spins down a Free web service that goes 15 minutes without receiving any inbound traf" | Quote cut at the page's own line break ("traffic"). |
| 179 | https://docs.cloud.google.com/free/docs/free-cloud-features | verified | "1 non-preemptible e2-micro VM instance per month in one of the following US regions" |  |
| 180 | https://www.digitalocean.com/pricing/droplets | verified | "1 GiB 1 vCPU 1,000 GiB 25 GiB $0.00893 $ 6.00" |  |
| 181 | https://docs.railway.com/reference/pricing/plans | verified | "Free For running small apps with $1 of free credit per month" | reference/pricing/plans now redirects to docs.railway.com/pricing/plans. |
| 182 | https://www.koyeb.com/pricing | verified | "Free 5h $ 0 /hr $ 0 /mo vCPU 0.25 RAM 1 GB Storage 1GB" | The free row is in the Serverless Postgres table, as the report says (no free compute). |
| 183 | https://developers.cloudflare.com/tunnel/ | verified | "Available on all plans" |  |
| 184 | https://developers.cloudflare.com/r2/pricing/ | verified | "Egress (data transfer to Internet) Free" |  |
| 185 | https://www.cloudflare.com/products/registrar/ | verified | "Cloudflare Registrar - Search and Buy Domains at Cost" | /products/registrar/ now redirects to cloudflare.com/domains/. |
| 186 | https://developers.cloudflare.com/registrar/faq/ | verified | "Cloudflare Registrar sells domains at cost: you pay the registry and ICANN list price with no markup." |  |
| 187 | https://developers.cloudflare.com/email-routing/ | changed | "Email Service / Overview Get started Send emails Beta Route emails" | /email-routing/ now redirects to /email-service/ (Email Routing is a section of the new Email Service docs). The report's "Email Sending beta" and "Routing only forwards" still match. |
| 188 | https://resend.com/pricing | verified | "$0 / mo 3,000 emails / mo 100 emails a day 3 domains" |  |
| 189 | https://resend.com/docs/api-reference/emails/send-email | verified | "-H 'Authorization: Bearer re_xxxxxxxxx'" |  |
| 190 | https://resend.com/docs/api-reference/rate-limit | verified | "The default maximum rate limit is 10 requests per second per team." |  |
| 191 | https://resend.com/docs/dashboard/domains/introduction | verified | "Verified Domains - Resend" |  |
| 192 | https://developers.brevo.com/reference/sendtransacemail | verified | "The API key should be passed in the request headers as api-key for authentication." | /reference/sendtransacemail now redirects to /reference/send-transac-email. |
| 193 | https://www.mailgun.com/pricing/ | verified | "100 emails per day Ticket support" |  |
| 194 | https://www.mailersend.com/pricing | verified | "Get started for free — includes: 500 emails /month Email API and SMTP relay" |  |
| 195 | https://www.smtp2go.com/pricing/ | verified | "Get started with our free plan for up to 1,000 emails per month." |  |
| 196 | https://postmarkapp.com/pricing | verified | "everyone starts on our free Developer plan, which includes 100 emails every month." |  |
| 197 | https://aws.amazon.com/ses/pricing/ | changed | "Outbound email $0.10 / 1,000 emails" | Still true for à-la-carte pricing, but SES now also has plans (Essentials $0.16 per 1,000) and inactive account-regions "will start on the Essentials plan beginning July 21, 2026". The "$200 in AWS Free Tier credits" line is unchanged. BETA-LAUNCH-KIT should say "$0.10 per 1,000 on à-la-carte pricing (choose it; the Essentials plan is $0.16)". |
| 198 | https://uptimerobot.com/pricing/ | verified | "Plans & Pricing \| UptimeRobot" | Pricing table is script-rendered; the free plan is offered ("Get started free"). The report cites the page without numbers. |

---

## 5. Files changed, backups and tests

| File | Change | Backup (scratchpad `before-fact-reverify\`) |
|---|---|---|
| `content/piano-sight-reading.js` | `scaleNames`, `spelledName`; `PC_OF` reads ## and bb | `content\piano-sight-reading.js` |
| `services/skill-checks.js` | PI2-PI4 scale parts show spelled names | `services\skill-checks.js` |
| `services/skill-piano-bb-sittings.js` | PI5-PI10 technique parts show spelled names | `services\skill-piano-bb-sittings.js` |
| `scripts/skills-r3-piano-bb-test.js` | 4 new spelling checks (92 in all) | `scripts\skills-r3-piano-bb-test.js` |
| `../curriculum-build/basketball/drafts/B03.txt`, `B07.txt` | aim cue: the back of the ring | `drafts\basketball\` |
| `../curriculum-build/basketball/outputs/*.csv`, `data/Basketball_Grades_Levels.csv`, `content/basketball-grades.js` | rebuilt; only the 2 descriptions differ | `bb-outputs\`, `data\`, `content\` |
| `curriculum-build/SKILL-APPS-MECHANICS.md` | dead ShotTracker link replaced; header note | `curriculum-build\` |
| `curriculum-build/BETA-LAUNCH-KIT.md` | SES pricing line; header note | `curriculum-build\` |
| `curriculum-build/CONTENT-FACT-AUDIT.md` | header note | `curriculum-build\` |

md5s before are in `before-fact-reverify\MD5SUMS.before`. Not written: `data/db.json`, `data/parallel/*`, `.env`. Nothing committed. Nothing staged for the DB, because no live row needs a change.

**Tests (NODE_PATH=..\node_modules, keys blanked by the fixtures, OLLAMA_ENABLED=0):** skills-r3-piano-bb-test PASS (92 checks); piano-items-test, basketball-items-test, piano-songs-check, skills-r3-checks/gate/record/dose, learner-followups and grade-skills tests all pass; `skill-audit.js --checks=<repo>` PASS (guarantee holds, 0 violations); `validate.js` 0 errors for all 15 basketball and 19 piano drafts.
