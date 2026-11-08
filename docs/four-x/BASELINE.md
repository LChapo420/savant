# The frozen normal-student baseline

Written 8 Nov 2026 before any result was run. `baseline.json` next to this file is the exact set of numbers, committed before the simulator exists. It is not to be changed after results are seen; any change is a new, labelled baseline.

Everything marked "source" was read in the paper or its abstract on 8 Nov 2026 (`docs/FOUR-X.md` lists every source). ASSUMED means nobody has measured it and the number is a judgement; each has a sensitivity row where it can move the answer.

## What "normal studying" is here

A student working alone from the material, doing what surveys say students do. Class time is left out, which makes normal studying look cheaper than it is and works against Savant. Three profiles:

| | first read | notes and highlighting | rereads | test date known | self-test |
|---|---|---|---|---|---|
| **Lazy** | once, 238 wpm | none | none | half a skim on the eve | none |
| **Typical** | understanding pace | +30% of read time | one, same sitting, at 0.8 of read time | one full reread on the eve | none |
| **Diligent** | understanding pace | +50% | one same sitting, one on day 2 | one full reread on the eve | one self-test per point on day 2, 30 s each |

Reasons, with the source for each:
- Rereading is what students do: 84% list it, 55% say it is their first strategy, 11% report recalling from memory (Karpicke, Butler and Roediger 2009, read in the paper). 40% report flashcards and 43% practice problems (same).
- Students mass work the day or two before an exam and are deadline-driven (Blasiman, Dunlosky and Rawson 2017, abstract; Hartwig and Dunlosky 2012, abstract). So the eve pass exists only when a test date is known, and a "remember it for a month" goal has no eve pass for anyone.
- Reading pace: 238 wpm is the adult non-fiction mean (Brysbaert 2019, abstract). 180 and 127 wpm are the Rice University workload estimator's "understand" rate with some and many new concepts (24 and 17 pages an hour at 450 words; the estimator states its source as reading research plus the authors' assumptions, read on the page). The doc's measured density decides which: over 7 points per 1,000 words counts as "many new concepts".
- Diligent is held at the understanding pace, not the slower "engage" rate. That is the conservative choice: a slower diligent student would flatter Savant's multiple.
- Note overhead (+30%, +50%) and the 0.8 cost of a reread: ASSUMED.

## Cross-check: minutes per 1,000 words (self-study only)

Published study time gives a second, independent estimate. Full-time students report about 14 hours a week of preparation (Babcock and Marks 2010; NSSE first-years 14.3 hours), over about 5 courses, so about 2.9 hours a course a week. A third of students had no course asking more than 40 pages a week (Arum and Roksa 2011, secondary sources). So 20 to 40 pages at about 500 words is about 9 to 17 minutes per 1,000 words.

The profiles give, at textbook density (180 wpm) with a known test date: lazy 6.3, typical 16, diligent about 23 minutes. Typical lies inside the 9 to 17 band; diligent lies above the band and below the 18 to 36 that the "2 hours per credit" guideline implies. These were computed from the profile definitions, not fitted. The bound is loose; the profile definitions are what is frozen.

## What the normal student remembers

One memory law for everyone, Savant included: FSRS-6's forgetting curve (decay 0.1542), fitted by others on real flashcard logs. The per-event strengths are set from the one direct comparison on real educational prose I could read in full.

Roediger and Karpicke 2006 (full paper): after studying a passage, restudying gave 81% at 5 minutes, 54% at 2 days, 42% at a week; taking a test instead gave 75%, 68%, 56%. Experiment 2 (four 5-minute periods): SSSS 83% at 5 minutes and 40% at a week; STTT 71% and 61%.

- Two reads in a sitting: strength 0.12 days, which on that curve gives about 0.66 of the 5-minute level at 2 days and 0.51 at a week, close to 54/81 and 42/81. First read alone 0.08 (ASSUMED, follows from the two-read figure).
- One correct recall: strength 1.8 days (between the 1.2 and 2.2 implied by the 75/68/56 row). Recognition questions (MCQ) give a smaller benefit than recall (Rowland 2014, abstract): 1.2 days, ASSUMED ratio.
- A later correct recall grows strength by FSRS-6's own rule at difficulty 5.
- Reading again after a delay grows strength by the square root of that. Restudy is much weaker than retrieval: in Karpicke and Roediger 2008 dropping items from further testing took week-later recall from about 80% to 35%, while dropping them from further study changed nothing (numbers as reported in Karpicke et al. 2009).
- Repeated reading in one sitting plateaus: 14 reads over four periods gave 83%, 2 reads gave 81% (RK 2006), so gains from a third and fourth read are almost nothing.

The same law means prior knowledge is a real memory trace (median strength 60 days, ASSUMED) that has already decayed for a random 1 to 12 months at the moment of use. Prior knowledge predicts outcomes strongly (Simonsmeier et al. 2022: pretest and posttest r about .53), and very long-term retention of unrehearsed knowledge is real (Custers and Ten Cate 2011).

Understanding (transfer to new situations): reading builds some, rereading adds little, retrieval adds more when the question has an explanation, and most when the question is an application (Pan and Rickard 2018: testing transfers at d 0.40, best to application and inference items, helped by elaboration; Butler 2010: repeated tests beat repeated study on new inference questions a week later). These sources rank the methods; they do not give the individual gains in `baseline.json`, which are ASSUMED and have a sensitivity row.

Transfer at the horizon is understanding x recall^0.7 (ASSUMED). The direction is what matters: both retention and understanding must be at least the normal student's level.
