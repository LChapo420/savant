# Checks: pre-written Spanish lessons

Every lesson in this folder was written by hand to its slot's objective (the "What Happens" column of the curriculum) and then checked in four independent ways. Nothing here was produced by an on-demand AI lesson writer or any external AI API.

## How every lesson was checked

1. **Second pass by the author.** Every block and check re-read against the slot's objective and against Spanish grammar and usage (Latin-American-neutral: ustedes for plural "you"; regional words named where they differ), with English glosses and sound guides checked word by word. Factual claims were checked against sources (listed per lesson below and in each file's `verification.sources`).
2. **Independent proofread.** Three separate reviewers, given only the lesson text and the objective, each reviewed a third of the lessons as Spanish teachers and editors: Spanish errors, glosses, facts (with web sources), answer keys, sound guides, and whether the lesson meets its objective. They reported 3 errors, 10 likely and 18 minor problems in all; every one was checked and every one was fixed (listed per lesson).
3. **Blind re-solve.** Every multiple-choice question (graded checks, trap blocks and multiple-choice blocks: 164) was given, prompt and options only, to a reviewer that never saw the key or the lesson. Run twice: on the draft and on the final text. Final result: **164 of 164 agree with the key, none flagged.** Per question: `blind-resolve.json`.
4. **The app's own validators**, run on every file by `node scripts/check-spanish-prewritten.js`:
   - the stored row has every field block-levels writes for a finished lesson; the level is still a `lesson` in the layout (`blockLevels.kindFor`) with the same title;
   - every block's data passes its own schema (`services/block-schema.js` validate) and pruning removes nothing; the lesson rules of block-levels hold (4-10 blocks, a tag at most twice, a Foundational block, 2-5 checks, blocks offered to a Spanish lesson);
   - every check passes the app's check pipeline unchanged (`blockLevels.cleanCheck` → `ai.validateItem`), with a skill from the level's own skills and a valid place;
   - the explanation-key agreement check (`services/key-agreement.js`) on every multiple-choice check, trap and multiple-choice block;
   - grading (`services/grading.js`): each key and accepted answer grades right, every other choice grades wrong, no other check's answer is accepted, no typed prompt makes an unintended demand (case, accent, punctuation);
   - servable with the owner's key gate on and off, never queued for a re-check, and the page payload (`publicPlan`) carries no answer;
   - every block renders in jsdom, and the whole lesson is laid out in real Chromium the way the page does it, with Play pressed on each audio block, without a page error or an empty block;
   - spelling lint: balanced ¿ ? and ¡ !, no line breaks, no common misspelling of the accented words these lessons teach; and across all lessons, no answer position holds more than 45% of the keys.

Result: **53 / 53 lessons pass**; corpus check passes. `node scripts/build-spanish-prewritten.js --check` confirms the JSON matches its source.

## Fixes that apply to every lesson

- **Answer positions.** In the draft every right answer was the first option, and no block or check shuffles its options, so the learner would have seen the answer first every time (found by the blind re-solve). The authoring helpers now place each key at a position fixed by a hash of its question, and the checker fails if one position holds too many keys. Final spread of the 279 keys over positions 1 to 4: 69 / 84 / 87 / 39 (fill-in blanks have only three options, so position 4 is rarer).
- **Audio block crash (engine fix, `public/engine/blocks/Concept_AudioWave.js`).** With no recorded clip, the block builds a synthesized stand-in player that has no `addEventListener`; the block then called it and threw in every browser with Web Audio, and because `compiler.js` does not isolate a block's error, every block after it was blank. jsdom has no Web Audio, so the jsdom check passed; the Chromium check reproduces it (0/2 lessons pass without the fix, 53/53 with it). Fixed with one guard; it also fixes AI-written lessons that use this block.
- **Audio scripts.** Each lesson has an AudioWave block whose cues are the exact lines a voice should read, with time estimates per line and a pronunciation note. Block pages have no Spanish voice today: without an `audioSrc` clip the block highlights the transcript in time over a quiet placeholder tone. The scripts are ready to be voiced (for example with the Spanish section's TTS, `services/spanish/voice.js`) and the clip URL set as `audioSrc`.

## Per lesson

### Grade 1: Sounds and Survival Words (`entry`)

#### entry/3: Welcome to Spanish: Where It Is Spoken and How It Sounds

- **Objective (curriculum):** Meet Spanish in about 20 countries and across the US, and hear first words like hola, gracias, and amigo.
- **Lesson:** 9 blocks (Basic_TextBlock, Basic_DataTable, Theory_RuleCard, Concept_AudioWave, Trap_CommonError, Interact_MultipleChoice, Interact_TermConnect, Concept_TakeawayBadge), 4 graded checks (3 multiple choice, 1 typed), audio script of 9 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 5/5 agree; all app validators pass. Facts checked: Count of Spanish-official countries (20 + Puerto Rico, by region); about 500 million native speakers (Instituto Cervantes); about 43 million US home speakers (Census ACS 2023); Brazil speaks Portuguese; Belize (English) is the one Central American exception.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### entry/4: Cognates You Already Know

- **Objective (curriculum):** Recognize hundreds of Spanish words you already understand from English, such as hotel, restaurante, familia, importante, and música, and learn how to spot them.
- **Lesson:** 8 blocks (Theory_RuleCard, Basic_DataTable, Concept_AudioWave, Memory_CheatSheet, Interact_TermConnect, Interact_CategorySort, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 10 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - B: trap block had two near-identical wrong options ("HOH-tel, like English" / "HOH-tel, stress at the start"); now "hoh-TEL, with an English h" and "OH-tel, stress at the start".
  - P: sound guide for restaurante read "rehs-tow-RAHN-teh" (tow = toe); now "rehs-tah-oo-RAHN-teh". Trap reasoning "o-TEL" → "oh-TEL".

#### entry/16: Five Power Verbs as Chunks: Quiero, Tengo, Puedo, Voy, Necesito

- **Objective (curriculum):** Say useful sentences from day one with quiero agua, tengo una pregunta, ¿puedo pasar?, voy al baño, and necesito ayuda.
- **Lesson:** 8 blocks (Basic_TextBlock, Basic_DataTable, Concept_AudioWave, Interact_XRay, Recall_FillTheBlank, Trap_CommonError, Interact_TermConnect, Concept_TakeawayBadge), 4 graded checks (2 multiple choice, 2 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - A: fill-in had line breaks (they collapse on the page) and used "¿hay wifi?" before hay is taught (level 31); removed.
  - P: "All five end in -o" was false for voy (-oy); reworded in the text and the coverage list.

#### entry/26: Numbers 0 to 10

- **Objective (curriculum):** Say, hear, and recognize the numbers cero through diez in counting, phone digits, and simple quantities.
- **Lesson:** 8 blocks (Basic_DataTable, Concept_AudioWave, Theory_RuleCard, Interact_ClickToReveal, Interact_TermConnect, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 4 graded checks (2 multiple choice, 2 typed), audio script of 12 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - A: fill-in line breaks removed; a note said "Agua is feminine, so una botella", the wrong reason; now "Botella is feminine".
  - A: c1 rationale rephrased (the key-agreement check read it as pointing at another option).

#### entry/31: Hay as a Survival Chunk: ¿Hay Baño? and No Hay

- **Objective (curriculum):** Ask whether something exists or is available with ¿Hay baño?, ¿Hay agua?, and understand No hay and Ya no hay.
- **Lesson:** 8 blocks (Theory_RuleCard, Basic_DataTable, Concept_AudioWave, Theory_ContrastSplit, Interact_MultipleChoice, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 4/4 agree; all app validators pass.
- **Fixed:** 
  - A: fill-in line breaks removed.

#### entry/42: Numbers 11 to 20

- **Objective (curriculum):** Recognize and say the numbers once through veinte, including the patterns in catorce, quince, dieciséis, and diecisiete.
- **Lesson:** 8 blocks (Basic_DataTable, Concept_AudioWave, Memory_CheatSheet, Interact_ClickToReveal, Interact_CategorySort, Trap_CommonError, Recall_FillTheBlank, Concept_TakeawayBadge), 3 graded checks (1 multiple choice, 2 typed), audio script of 13 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 2/2 agree; all app validators pass.
- **Fixed:** 
  - A: fill-in line breaks removed; "El taxi son quince dólares" (awkward) → "Son quince dólares, por favor".

#### entry/52: Emergency and Help Words

- **Objective (curriculum):** Recognize and say ayuda, socorro, médico, policía, fuego, and hospital, and get help with a few high-value phrases.
- **Lesson:** 8 blocks (Basic_DataTable, Concept_AudioWave, Theory_RuleCard, Interact_MultipleChoice, Interact_TermConnect, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 9 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 4/4 agree; all app validators pass. Facts checked: Emergency numbers: 911 in the US and in Mexico (single number since 2017), 112 in Spain; policía = force and officer.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### entry/65: Classroom Words and Objects

- **Objective (curriculum):** Point at and name common objects such as libro, mesa, silla, lápiz, puerta, and ventana, and follow simple teacher words.
- **Lesson:** 8 blocks (Basic_DataTable, Concept_AudioWave, Interact_TermConnect, Interact_MultipleChoice, Recall_FillTheBlank, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 19 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - A: fill-in line breaks removed.

#### entry/80: Spanish Names and Titles

- **Objective (curriculum):** Say Spanish first names, use señor and señora, and understand the two-surname system with names like María García López.
- **Lesson:** 8 blocks (Basic_TextBlock, Concept_AudioWave, Basic_DataTable, Theory_RuleCard, Interact_MultipleChoice, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 11 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 4/4 agree; all app validators pass. Facts checked: Two-surname system (father's first surname, then mother's, traditionally; some countries let parents choose); women usually keep their surnames.
- **Fixed:** 
  - A: c2 rationale rephrased (key-agreement flag).
  - P: the child row of the surname table put both surnames in the "First surname" column; made explicit.

#### entry/81: Don, Doña, Señor, and Professional Titles Like Licenciado and Ingeniero

- **Objective (curriculum):** Learn respectful titles and when to use them, as in Buenos días, Licenciada Ruiz, and Don Manuel, con permiso.
- **Lesson:** 8 blocks (Basic_TextBlock, Theory_ContrastSplit, Basic_DataTable, Concept_AudioWave, Trap_CommonError, Interact_MultipleChoice, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 4/4 agree; all app validators pass. Facts checked: Use of don / doña with first names; licenciado in Mexico and Central America; Mtro./Mtra.; con permiso vs disculpe.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### entry/84: Spanish Around You in the US

- **Objective (curriculum):** Notice Spanish on signs, media, products, and neighbors' conversations, and learn who the roughly 60 million US Spanish speakers are.
- **Lesson:** 8 blocks (Basic_TextBlock, Basic_DataTable, Concept_AudioWave, Interact_CategorySort, Trap_CommonError, Interact_MultipleChoice, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 7 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 4/4 agree; all app validators pass. Facts checked: US figures: about 43 million home speakers (ACS 2023), about 65 million Hispanic (Census), close to 60 million counting second-language speakers (Instituto Cervantes); origin groups (Pew); sign words (jale in Mexico and the US); place-name meanings.
- **Fixed:** 
  - P: the objective names media, products and neighbors' conversations, which the draft barely covered; added a "Where to notice it" section (Univision and Telemundo, bilingual labels, phrases between neighbors).
  - B: the 43 million figure will date; the text names its source year (Census, 2023).

### Grade 2: First Phrases and Greetings (`intermediate`)

#### intermediate/27: Kisses, Handshakes, and Hugs

- **Objective (curriculum):** Understand who greets with a kiss, a handshake, or an abrazo in different countries and how to respond comfortably.
- **Lesson:** 8 blocks (Hook_Dilemma, Basic_TextBlock, Basic_DataTable, Concept_AudioWave, Interact_CategorySort, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: Greeting customs: one cheek kiss in most of Latin America, two in Spain, male friends kiss in Argentina and Uruguay, handshake at a first business meeting.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### intermediate/81: Question Words as Chunks

- **Objective (curriculum):** Recognize and use qué, quién, dónde, cuándo, cómo, and cuánto in fixed questions before studying grammar.
- **Lesson:** 8 blocks (Basic_DataTable, Concept_AudioWave, Theory_RuleCard, Interact_XRay, Interact_TermConnect, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 4 graded checks (3 multiple choice, 1 typed), audio script of 8 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 4/4 agree; all app validators pass.
- **Fixed:** 
  - P (error): in "Planning: ¿___ es la reunión?" Dónde is also correct (ser for where an event is); the cue is now "Asking what day or time" and Dónde is replaced by Cómo.
  - S: the rule card said the accent "changes nothing" in speech; it now says the accent marks the question word (interrogatives are stressed).

#### intermediate/85: Wants and Needs as Chunks

- **Objective (curriculum):** Use quiero, necesito, me gustaría, and ¿Tiene...? as ready-made phrases to ask for things politely.
- **Lesson:** 8 blocks (Basic_DataTable, Concept_AudioWave, Interact_XRay, Theory_ContrastSplit, Recall_FillTheBlank, Interact_MultipleChoice, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 4/4 agree; all app validators pass.
- **Fixed:** 
  - A: a heading had "¿Tiene or ¿tienes?" (unbalanced marks) → "¿Tiene? or ¿Tienes?"; c2 was tagged es_questions though it tests a request; now es_greetings.
  - P: "(your phone is dead) Me gustaría un cargador" is defensible; the cue now makes the need urgent and Me gustaría is replaced by Tengo.

#### intermediate/86: Voy a and Vamos a as Chunks: Plans from Day One

- **Objective (curriculum):** Talk about plans before learning the grammar, using voy a comer, voy a trabajar, and ¿vamos a la tienda?
- **Lesson:** 8 blocks (Theory_RuleCard, Basic_DataTable, Concept_AudioWave, Theory_ContrastSplit, Interact_SentenceScramble, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### intermediate/97: What Day Is It Today

- **Objective (curriculum):** Ask and answer ¿Qué día es hoy? using days of the week, and add mañana, hoy, and ayer for basic planning.
- **Lesson:** 8 blocks (Basic_DataTable, Concept_AudioWave, Memory_CheatSheet, Concept_CautionFlag, Interact_TermConnect, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 10 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### intermediate/111: Saying No: Basic Negation

- **Objective (curriculum):** Make short negative sentences by putting no before the verb, as in No entiendo, No quiero, and No tengo.
- **Lesson:** 8 blocks (Theory_RuleCard, Basic_DataTable, Concept_AudioWave, Interact_XRay, Interact_SentenceScramble, Trap_CommonError, Recall_FillTheBlank, Concept_TakeawayBadge), 3 graded checks (1 multiple choice, 2 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 2/2 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### intermediate/112: False Friends: First Warning List

- **Objective (curriculum):** Avoid tempting mistakes with embarazada, éxito, librería, and constipado, by spotting look-alikes that mean something different.
- **Lesson:** 8 blocks (Basic_TextBlock, Basic_DataTable, Concept_AudioWave, Trap_CommonError, Interact_TermConnect, Recall_FillTheBlank, Memory_CheatSheet, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: False-friend meanings, including the regional split of constipado (RAE DHLE).
- **Fixed:** 
  - S: the first draft had "memory hooks" with made-up etymologies; replaced by a plain "Say this, not that" sheet.
  - P: constipado means a cold in Spain but is used for constipated in parts of Latin America (Paraguay, Argentina; RAE DHLE); the lesson now teaches it as a word to avoid, with resfriado for a cold and estreñido for constipated.

#### intermediate/121: Cognate Conversion Rules: -tion to -ción, -ity to -idad, -ly to -mente

- **Objective (curriculum):** Convert English words into Spanish by pattern, as in nation to nación, university to universidad, and finally to finalmente.
- **Lesson:** 8 blocks (Memory_CheatSheet, Concept_AudioWave, Theory_RuleCard, Interact_TermConnect, Concept_CautionFlag, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 4 graded checks (2 multiple choice, 2 typed), audio script of 9 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: Conversion rules and their false friends (actualmente, eventualmente); accent and gender of -ción / -dad nouns.
- **Fixed:** 
  - A: c3 rationale rephrased (key-agreement flag).
  - P: "Finalmente, es viernes" is unnatural (that is ¡Por fin es viernes!); now "Finalmente, vamos a la playa".

#### intermediate/122: Cognate Suffixes: -ic to -ico, -ist to -ista, -ous to -oso

- **Objective (curriculum):** Turn English words into Spanish with suffix patterns, as in fantastic to fantástico, artist to artista, and famous to famoso.
- **Lesson:** 7 blocks (Memory_CheatSheet, Concept_AudioWave, Theory_ContrastSplit, Interact_TermConnect, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 10 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: c1 asked to apply -ous → -oso to "nervous", which gives *nervoso; now "fabulous → fabuloso", and the cheat sheet says some words add an i (nervioso).
  - S: takeaway said -ico always has an accent; now "usually".

### Grade 3: Identity, Numbers, and Family (`advanced`)

#### advanced/3: Subject Pronouns and Dropping Them

- **Objective (curriculum):** Learn yo, tú, él, ella, nosotros, ellos and why Spanish usually omits them, so you say Soy Ana instead of Yo soy Ana.
- **Lesson:** 8 blocks (Basic_DataTable, Concept_AudioWave, Theory_RuleCard, Theory_ContrastSplit, Concept_CautionFlag, Interact_CategorySort, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 12 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: vos is used in Argentina, Uruguay, Paraguay and much of Central America (the draft named only the first two); takeaway "Spanish has no it" → "no subject pronoun for it" (lo / la exist).

#### advanced/4: Ser Present Singular: Soy, Eres, Es

- **Objective (curriculum):** Use the singular forms of ser to say who you are and what things are, as in Soy estudiante and Es un libro.
- **Lesson:** 7 blocks (Basic_DataTable, Theory_RuleCard, Concept_AudioWave, Interact_XRay, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### advanced/7: Ser Plural Forms and Ustedes

- **Objective (curriculum):** Complete the present of ser with somos and son for plural subjects, as in Somos amigos and Ellas son de Chile.
- **Lesson:** 7 blocks (Basic_DataTable, Concept_AudioWave, Theory_RuleCard, Recall_FillTheBlank, Interact_CategorySort, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### advanced/15: Noun Gender with -o and -a

- **Objective (curriculum):** Assign masculine and feminine to most nouns by their endings, as in el libro, la casa, el amigo, and la amiga.
- **Lesson:** 7 blocks (Theory_RuleCard, Basic_DataTable, Concept_AudioWave, Interact_CategorySort, Concept_CautionFlag, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 10 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - A: an audio note told the learner to write "ellibro, lacasa"; reworded.
  - P: table note "a man / a woman" for amigo / amiga → "a male friend / a female friend".

#### advanced/16: Gender Patterns and Common Exceptions

- **Objective (curriculum):** Master -ción, -dad, -ma, and traps like el día, la mano, el mapa, el problema, and el agua so you stop guessing.
- **Lesson:** 7 blocks (Memory_CheatSheet, Basic_DataTable, Concept_AudioWave, Concept_CautionFlag, Interact_CategorySort, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 9 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: Gender rules and exceptions (Greek -ma words; el agua and other stressed-a feminine nouns; la foto, la moto).
- **Fixed:** 
  - P: the cheat sheet said "-e, consonant: no rule" right under consonant endings that do have one (-ción, -dad); now "other -e and consonant endings".

#### advanced/19: Making Nouns Plural

- **Objective (curriculum):** Form plurals with -s and -es, including the z to c change, in libros, lápices, and canciones.
- **Lesson:** 7 blocks (Memory_CheatSheet, Basic_DataTable, Concept_AudioWave, Recall_FillTheBlank, Interact_TermConnect, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (1 multiple choice, 2 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 2/2 agree; all app validators pass.
- **Fixed:** 
  - P: "Spanish spelling does not allow z before e" (zeta, zen exist) → "normally changes z to c before e".

#### advanced/20: Tricky Plurals: Jóvenes, Exámenes, Los García

- **Objective (curriculum):** Form plurals that shift accents or spelling, such as jóvenes and exámenes, and pluralize surnames and compounds like los García and los sacacorchos.
- **Lesson:** 7 blocks (Theory_RuleCard, Basic_DataTable, Concept_AudioWave, Interact_CategorySort, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 7 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: Plural accent shifts and invariable plurals (RAE: surnames, -s compounds).
- **Fixed:** 
  - P: "the stress never moves" has rare exceptions (carácter → caracteres); now "almost always", with the exception named.

#### advanced/27: Definite Articles: El, La, Los, Las

- **Objective (curriculum):** Use the four words for the with nouns and notice where Spanish needs them and English does not.
- **Lesson:** 7 blocks (Basic_DataTable, Theory_RuleCard, Theory_ContrastSplit, Concept_AudioWave, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 7 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: "a + el always contracts", "de + el always fuses": not with a name that includes El (a El Salvador, de El Salvador) nor with él (de él); both added.

#### advanced/28: Indefinite Articles: Un, Una, Unos, Unas

- **Objective (curriculum):** Say a, an, and some in Spanish and choose the correct form in Es un profesor and Tengo unas amigas.
- **Lesson:** 7 blocks (Basic_DataTable, Theory_RuleCard, Concept_AudioWave, Theory_ContrastSplit, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: c3 (some = unas) now also accepts algunas.

#### advanced/31: Numbers 21 to 100

- **Objective (curriculum):** Count by tens and combine numbers such as veintiuno, treinta y cinco, and noventa y nueve in listening and speaking.
- **Lesson:** 7 blocks (Basic_DataTable, Memory_CheatSheet, Concept_AudioWave, Interact_ClickToReveal, Trap_CommonError, Recall_FillTheBlank, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 10 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: "TRAYN-tay-SEEN-koh" gave y the vowel of "day"; now "TRAYN-tie-SEEN-koh". The accent row now includes veintiún.
  - S: c2 used "veinte y dos" as a wrong option; it is an old but once-standard spelling, so it is replaced by "veintedos".

#### advanced/54: Nicknames and Pet Forms of Names: Pepe, Paco, Lupita, Chuy

- **Objective (curriculum):** Recognize hypocoristic names such as Pepe for José, Paco for Francisco, and Lupita for Guadalupe, and know when to use them.
- **Lesson:** 7 blocks (Basic_TextBlock, Basic_DataTable, Concept_AudioWave, Theory_RuleCard, Interact_TermConnect, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 4 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: Traditional hypocoristics and where they are typical.
- **Fixed:** 
  - A: c3 was tagged es_ser_estar; now es_vocab_core.
  - P: "un café → un cafecito" illustrated -ito with a -cito word; now "un momento → un momentito". Tip now gives Dígame Pepe (usted) as well as Dime Pepe.

#### advanced/65: Age with Tener: Tengo Años

- **Objective (curriculum):** Introduce tener in the present and say your age with Tengo treinta años and ¿Cuántos años tienes?
- **Lesson:** 7 blocks (Basic_DataTable, Theory_RuleCard, Concept_AudioWave, Interact_XRay, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (1 multiple choice, 2 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 2/2 agree; all app validators pass.
- **Fixed:** 
  - P: c3 gloss "(We are thirty.)" could mean "there are thirty of us"; now "(We are thirty years old.)".

#### advanced/66: Tener for Everyday Possession: Tengo, Tienes, Tiene in Conversation

- **Objective (curriculum):** Use tener to talk about what you have, as in Tengo dos hermanos, ¿Tienes coche?, and No tiene tiempo.
- **Lesson:** 7 blocks (Basic_DataTable, Concept_AudioWave, Memory_CheatSheet, Trap_CommonError, Recall_FillTheBlank, Interact_CategorySort, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - S: the car footnote said coche for Mexico, where carro is just as common; reworded with regions.

#### advanced/69: Height, Weight, and Measurements: Mide, Pesa, Cuesta

- **Objective (curriculum):** Give size and measurements with mide dos metros, pesa cinco kilos, and tiene tres metros de largo, contrasting with English to be plus number.
- **Lesson:** 7 blocks (Basic_DataTable, Theory_RuleCard, Concept_AudioWave, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### advanced/70: Adjective Agreement in Gender and Number

- **Objective (curriculum):** Match adjectives to noun gender and number in phrases like una casa grande, unos amigos simpáticos, and muchos libros.
- **Lesson:** 7 blocks (Theory_RuleCard, Basic_DataTable, Concept_AudioWave, Interact_XRay, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### advanced/80: Adjectives Ending in -e or a Consonant

- **Objective (curriculum):** Handle adjectives with one singular form such as inteligente, fácil, joven, and azul, and form their plurals.
- **Lesson:** 7 blocks (Theory_RuleCard, Basic_DataTable, Concept_AudioWave, Concept_CautionFlag, Interact_CategorySort, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: the -or exception now excludes mayor, menor, mejor, peor, and the nationality exception is limited to nationalities ending in a consonant (estadounidense does not change).

#### advanced/81: Countries and Nationalities

- **Objective (curriculum):** Say where you and others are from with Soy estadounidense, ella es mexicana, and note nationality words are not capitalized.
- **Lesson:** 7 blocks (Basic_DataTable, Memory_CheatSheet, Concept_AudioWave, Theory_ContrastSplit, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - A: trap reasoning rephrased (key-agreement flag).

#### advanced/84: Languages and Demonyms: Español, Inglés, Madrileño, Porteño, Boricua

- **Objective (curriculum):** Name languages and the people of cities and regions, as in Hablo inglés y español and Ella es porteña de Buenos Aires.
- **Lesson:** 7 blocks (Basic_DataTable, Concept_AudioWave, Trap_CommonError, Interact_TermConnect, Recall_FillTheBlank, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: Demonyms (porteño also used for Valparaíso; chilango informal; boricua from Borikén).
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### advanced/85: Jobs and Professions

- **Objective (curriculum):** Say what people do with Soy médico, Ella es maestra, and Es ingeniero, and see how professions change for gender.
- **Lesson:** 7 blocks (Basic_DataTable, Memory_CheatSheet, Concept_AudioWave, Recall_FillTheBlank, Trap_CommonError, Interact_TermConnect, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### advanced/92: Family Members and Relatives

- **Objective (curriculum):** Name close family with madre, padre, hermano, hijo, abuela, tío, and primo, and talk about your own family tree.
- **Lesson:** 7 blocks (Basic_DataTable, Concept_AudioWave, Theory_RuleCard, Interact_TermConnect, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 7 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### advanced/93: Extended Family, Marital Status, and Pets

- **Objective (curriculum):** Add esposo, novia, suegra, viudo, soltero, and pets to describe complete family situations respectfully.
- **Lesson:** 7 blocks (Basic_DataTable, Concept_AudioWave, Memory_CheatSheet, Interact_TermConnect, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - A: three tables broke the layout rule (a block at most twice); pets became a cheat sheet.

#### advanced/96: Possessive Adjectives: Mi, Tu, Su

- **Objective (curriculum):** Show ownership with mi, tu, su, nuestro, and vuestro, and agree them with the thing owned as in mis padres.
- **Lesson:** 7 blocks (Basic_DataTable, Theory_RuleCard, Concept_AudioWave, Concept_CautionFlag, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: vuestro also changes for gender; added "(and Spain's vuestro)".

#### advanced/97: Possession with De

- **Objective (curriculum):** Say Ana's book with el libro de Ana, and the possessives with ¿De quién es? instead of an English apostrophe s.
- **Lesson:** 7 blocks (Theory_RuleCard, Theory_ContrastSplit, Concept_AudioWave, Interact_SentenceScramble, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### advanced/104: Describing People: Appearance

- **Objective (curriculum):** Describe looks with alto, bajo, delgado, moreno, rubio, and use tener plus pelo and ojos as in Tiene ojos azules.
- **Lesson:** 7 blocks (Basic_DataTable, Concept_AudioWave, Theory_ContrastSplit, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - B (note): "Tiene los ojos azules" is as common as "Tiene ojos azules"; the table now says so.

#### advanced/105: Describing People: Personality

- **Objective (curriculum):** Use simpático, inteligente, trabajador, callado, and divertido with ser to describe character, plus muy and un poco.
- **Lesson:** 7 blocks (Basic_DataTable, Memory_CheatSheet, Concept_AudioWave, Concept_CautionFlag, Interact_CategorySort, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 4 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - A: c2 rationale rephrased (key-agreement flag).

#### advanced/108: Adjective Position and Muy

- **Objective (curriculum):** Place descriptive adjectives after the noun and use muy to intensify, in una mujer muy alta and un coche pequeño.
- **Lesson:** 7 blocks (Theory_RuleCard, Basic_DataTable, Concept_AudioWave, Theory_ContrastSplit, Interact_SentenceScramble, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 7 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: the takeaway said "only numbers, quantity words, buen, mal and gran" come first; now includes otro and possessives.

#### advanced/109: Opposites: Common Adjective Antonym Pairs

- **Objective (curriculum):** Learn paired adjectives such as alto y bajo, caro y barato, nuevo y viejo, and fácil y difícil to describe and contrast quickly.
- **Lesson:** 7 blocks (Basic_DataTable, Concept_AudioWave, Concept_CautionFlag, Interact_TermConnect, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: c2 used "una señora grande" as a wrong option, but in Mexico it is a normal way to say an older lady; replaced by "nueva".

#### advanced/119: Asking Questions: Question Words and Word Order

- **Objective (curriculum):** Form yes/no and information questions with qué, quién, cuál, cuántos, and cómo, including tag questions like ¿verdad?
- **Lesson:** 7 blocks (Memory_CheatSheet, Theory_ContrastSplit, Concept_AudioWave, Interact_XRay, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 9 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** 
  - P: the objective names cómo and quién, which the draft barely used; added ¿Cómo es tu casa? and ¿Quién es él? to the coverage, cheat sheet and audio.

#### advanced/120: Negatives, También, and Tampoco

- **Objective (curriculum):** Say what is not true with no and agree with también or tampoco in Yo también and Yo tampoco.
- **Lesson:** 7 blocks (Memory_CheatSheet, Concept_AudioWave, Theory_RuleCard, Theory_ContrastSplit, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 8 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass.
- **Fixed:** nothing beyond the fixes that apply to every lesson.

#### advanced/131: Hispanic Naming and Official Forms

- **Objective (curriculum):** Fill out a basic form with nombre, apellido, fecha de nacimiento, and dirección, and use both surnames correctly on official documents.
- **Lesson:** 7 blocks (Basic_DataTable, Theory_RuleCard, Concept_AudioWave, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: Form field names used in Mexico and elsewhere; day-first dates; Puebla postal code 72000.
- **Fixed:** 
  - P (error): the fill-in date was 03/03/1995, which cannot test day-first order; now 5 March 1995 (05/03/1995 vs 03/05/1995), and the instructions say which surname is the father's.

#### advanced/134: False Friends Set One

- **Objective (curriculum):** Avoid errors with actual, asistir, sensible, and realizar, and use context rather than English to guess meaning.
- **Lesson:** 7 blocks (Basic_DataTable, Concept_AudioWave, Theory_RuleCard, Interact_TermConnect, Recall_FillTheBlank, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: Meanings of actual, asistir, sensible, realizar, colegio, pariente, recordar.
- **Fixed:** 
  - P: c2 used "sentida" as a wrong option, but sentido/a also means touchy, easily hurt (RAE); replaced, and "sensitiva" too.

#### advanced/162: The Hispanic World: Countries and Capitals

- **Objective (curriculum):** Locate the 20 Spanish-speaking countries and their capitals, and learn which regions call themselves latinos or hispanos.
- **Lesson:** 7 blocks (Basic_DataTable, Concept_AudioWave, Theory_ContrastSplit, Interact_TermConnect, Trap_CommonError, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 5 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: All 20 capitals plus San Juan; Bolivia (Sucre constitutional, La Paz seat of government); Equatorial Guinea (Ciudad de la Paz, decree of 2 Jan 2026, replacing Malabo).
- **Fixed:** 
  - B: c2 (hispano vs latino) depends on definitions that vary; the prompt now says "As this lesson defines the words".

#### advanced/163: Famous Hispanic Figures

- **Objective (curriculum):** Introduce well-known people from music, sport, and science using ser, nationality, and profession, such as Shakira es colombiana.
- **Lesson:** 8 blocks (Basic_TextBlock, Basic_DataTable, Concept_AudioWave, Interact_XRay, Recall_FillTheBlank, Trap_CommonError, Interact_TermConnect, Concept_TakeawayBadge), 3 graded checks (2 multiple choice, 1 typed), audio script of 6 lines.
- **Checked:** author second pass; independent proofread; blind re-solve 3/3 agree; all app validators pass. Facts checked: Each figure's nationality and profession (Shakira, Messi, Bad Bunny, Sonia Sotomayor, Ellen Ochoa: first Hispanic woman in space, 1993; Pedro Pascal).
- **Fixed:** nothing beyond the fixes that apply to every lesson.

Legend for fixes: A = found by the automated checks while writing, B = blind re-solve, P = independent proofread, S = author's second pass.
