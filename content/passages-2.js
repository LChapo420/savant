/**
 * The second reading bank, written to the same standard as content/passages.js.
 *
 * The census that prompted this file found the reading skills running on six
 * passages between them. That is the ceiling: a passage stops being reusable once
 * every skill has asked about its main idea, its purpose, a detail and a word in
 * it, which is four questions, and there are five reading skills. Beyond that
 * the sixth question has nowhere to point.
 *
 * So these are long enough to support more than four questions about *different
 * parts of them*, and the questions are written that way on purpose. The main
 * idea question is about the whole text, the detail question is about one
 * sentence in the middle, the inference question is about something the text
 * never says outright, and the vocabulary question is about a word that only
 * means what it means in its own paragraph.
 */
const PASSAGES = [
  {
    id: 'tunnel',
    genre: 'engineering',
    text: `The first survey of the ridge was commissioned in 1874, three years after the miners had already begun digging. The engineer argued for a summit tunnel and was outvoted by a party who preferred a long, gentle grade — a decision that cost, in the end, almost four times as much to operate and would cost a great deal more in the decades after the coal ran out. Work started in 1891. The western portal opened first, in 1904, and by then the company had spent more than it had twice over. The eastern portal met harder ground, flooded twice, and did not open until 1911. When the two ends finally joined, the tunnel was nearly twelve miles long. Traffic was heaviest in the years immediately after, and fell for four decades. The argument now is about what to do with it, and the two positions are not really about engineering at all.`,
    questions: [
      { skill: 'main_idea', d: 5, p: 'Which statement best expresses the main idea of the passage?', c: [
        'A cheaper-looking decision made in 1874 kept determining the project for a century',
        'Ridge tunnels cannot be built safely in hard ground',
        'The eastern portal was the most difficult part of the whole project',
        'Coal traffic through the tunnel fell steadily and never recovered'],
        a: 'A cheaper-looking decision made in 1874 kept determining the project for a century',
        r: 'The passage opens with a 1874 decision and closes on arguments about that decision\'s legacy, so the whole text turns on it.' },
      { skill: 'detail_support', d: 4, p: 'According to the passage, how much more did the gentler grade cost to operate?', c: [
        'Nearly four times as much', 'Twice as much', 'Three times as much', 'Only slightly more'],
        a: 'Nearly four times as much',
        r: 'The text states it "cost, in the end, almost four times as much to operate."' },
      { skill: 'inference', d: 7, p: 'The passage\'s statement that the two positions in the current argument "are not really about engineering at all" suggests that the dispute over the tunnel is best understood as', c: [
        'a disagreement about what the region should become now that the coal is gone',
        'a technical dispute over whether the tunnel can be safely sealed',
        'an argument about which engineering firm should be paid for the work',
        'a disagreement over the accuracy of the 1874 survey'],
        a: 'a disagreement about what the region should become now that the coal is gone',
        r: 'The clause exempts engineering from the dispute, and the only other thing the passage has established is the exhausted coal, so the conflict must be about the region\'s future.' },
      { skill: 'author_purpose', d: 6, p: 'The detail that the company had "spent more than it had twice over" by 1904 primarily serves to', c: [
        'emphasize how costly the chosen route had become before the tunnel was even finished',
        'prove that the summit route would have cost less to build',
        'explain why the eastern portal took seven years longer to open',
        'suggest the miners were financially irresponsible'],
        a: 'emphasize how costly the chosen route had become before the tunnel was even finished',
        r: 'By 1904 only the western portal was open and the eastern end would not open until 1911, so the overspend shows the cost of the long-grade decision piling up while the work was still unfinished. The passage never prices the summit route, so it cannot prove that route would have been cheaper.' },
      { skill: 'vocab_context', d: 5, p: 'As used in the passage, "outvoted" most nearly means', c: [
        'outnumbered in a vote and defeated', 'paid off by a larger contractor', 'rated as less valuable by an inspector', 'left out of the final plan'],
        a: 'outnumbered in a vote and defeated',
        r: 'The engineer "argued for a summit tunnel and was outvoted by a party who preferred a long, gentle grade" — a decision made by those who disagreed with him.' },
    ],
  },
  {
    id: 'orchard',
    genre: 'narrative',
    text: `When Marguerite bought the orchard it was producing nothing at all. Sixty trees, a hundred years old, and the previous owner had stopped thinning them. They had grown up into a thicket so dense that a person could stand at the northern end and not see the barn. A forester told her the sensible thing was to pull half of them out and start again in a decade. Marguerite read the ground instead, and what the ground said was that the trees had been fighting each other for soil their grandparents no longer had. She cut down a third, one in three, choosing them by height rather than by age so that the survivors had room. The first year the yield went down. The second year the grass came back in the spaces she had opened. The third year the light reached the fruit on the lower branches, which had never borne anything in her lifetime, and the harvest was larger than the old owner\'s best year. The forester conceded the point, then pointed out that the trees were now a hundred and three, and a hundred and three is not young.`,
    questions: [
      { skill: 'main_idea', d: 4, p: 'Which statement best expresses the main idea of the passage?', c: [
        'Reading a site on its own terms served the orchard better than replacing it',
        'Old fruit trees should always be removed rather than managed',
        'A forester ultimately overruled a farmer on a matter of technique',
        'The orchard produced its largest harvest in its first year'],
        a: 'Reading a site on its own terms served the orchard better than replacing it',
        r: 'The forester offers the conventional advice, Marguerite does something else based on what the ground showed, and the results vindicate her — the argument is about method.' },
      { skill: 'detail_support', d: 3, p: 'How did Marguerite choose which trees to cut down?', c: [
        'By height rather than by age', 'By age rather than by height', 'At random across the orchard', 'By which ones bore the least fruit'],
        a: 'By height rather than by age',
        r: 'The text says she cut them down "choosing them by height rather than by age so that the survivors had room."' },
      { skill: 'inference', d: 8, p: 'The forester\'s final remark that the trees are "a hundred and three, and a hundred and three is not young" most likely implies that', c: [
        'the orchard is now strong but the approach cannot be repeated indefinitely',
        'the trees are old enough to be cut down in a few years',
        'the forester still believes the orchard should be replaced',
        'the new trees will not survive another winter'],
        a: 'the orchard is now strong but the approach cannot be repeated indefinitely',
        r: 'It follows a concession, and it is a warning rather than a criticism: the method works but it works by removing a third, which is not a manoeuvre you can keep performing forever.' },
      { skill: 'author_purpose', d: 7, p: 'The detail that the yield went down in the first year primarily serves to', c: [
        'show that the delay was a necessary cost rather than evidence of failure',
        'indicate that the thinning had ruined the orchard',
        'explain why the forester changed his mind',
        'suggest that grass harmed the remaining trees'],
        a: 'show that the delay was a necessary cost rather than evidence of failure',
        r: 'It is placed immediately before the recovery, so a reader cannot mistake it for the outcome; the passage is careful to separate the short-term loss from the long-term gain.' },
      { skill: 'vocab_context', d: 5, p: 'As used in the passage, "conceded" most nearly means', c: [
        'admitted a point while disagreeing with the rest',
        'agreed in order to avoid an argument',
        'repeated the forester\'s earlier objection',
        'wrote down the yield figures officially'],
        a: 'admitted a point while disagreeing with the rest',
        r: '"The forester conceded the point, then pointed out that the trees were now a hundred and three" — a concession followed immediately by an objection.' },
    ],
  },
  {
    id: 'mending',
    genre: 'social science',
    text: `For a century after the telegraph reached the district, the standard local explanation was that it killed the letter. The district's statistics looked damning: the recorded totals fell through the 1870s and kept falling. But the postal authorities had been counting letters by weight since 1840, and when the counts were redone by the number of letters rather than by weight, the picture changed. Letters did not vanish. They became shorter. Average weight per letter fell by nearly half across fifty years, and the total number sent rose and then held. What the telegraph took was the long letter — the paragraph of news, the detailed account of a visit — and the short letter survived it. A later study of rural families, where the telegraph arrived last, found the same drop in average weight and none of the drop in volume. The lesson is not that communication has a fixed quantity that one technology takes from another. It is that the amount of writing we do is set by what writing is for, and that changes when the reason changes.`,
    questions: [
      { skill: 'main_idea', d: 6, p: 'The passage is primarily concerned with', c: [
        'how a change in measurement corrected an accepted historical claim',
        'why rural families used the telegraph less than town families',
        'the effect of postal weight charges on letter writing',
        'how letter writing recovered after the telegraph became common'],
        a: 'how a change in measurement corrected an accepted historical claim',
        r: 'The passage sets up a received explanation, shows the counting method behind it, and reports what a different counting produced — the argument is about evidence, not about letters.' },
      { skill: 'detail_support', d: 4, p: 'What did the rural family study find?', c: [
        'The drop in average weight, but no drop in volume',
        'A drop in both weight and volume',
        'No change in weight or volume',
        'A rise in volume and a fall in weight'],
        a: 'The drop in average weight, but no drop in volume',
        r: 'The text says the study "found the same drop in average weight and none of the drop in volume" — volume here meaning the number of letters sent.' },
      { skill: 'inference', d: 8, p: 'The passage\'s closing claim that "the amount of writing we do is set by what writing is for" implies that', c: [
        'technologies change writing habits indirectly, by altering what writing is needed for',
        'letter-writing survives only where the telegraph never arrived',
        'short letters are always a sign of a decline in literacy',
        'the reasons for writing have stayed constant since 1840'],
        a: 'technologies change writing habits indirectly, by altering what writing is needed for',
        r: 'The claim is that the *purpose* sets the quantity, and the telegraph changed the purpose; the mechanism is indirect, which is why the effect looks like a loss at first.' },
      { skill: 'author_purpose', d: 7, p: 'The sentence "But the postal authorities had been counting letters by weight since 1840" primarily serves to', c: [
        'identify the measurement decision that produced the misleading statistic',
        'establish that the postal service was unusually well organised',
        'show that the telegraph was not the only change of the period',
        'suggest that the original researchers were careless'],
        a: 'identify the measurement decision that produced the misleading statistic',
        r: 'It arrives as the pivot of the whole passage — the "but" turns on this fact, and it explains the artifact rather than blaming anyone.' },
      { skill: 'vocab_context', d: 5, p: 'As used in the passage, "damning" most nearly means', c: [
        'convincing as evidence against something',
        'angry and difficult to control',
        'surprising and difficult to explain',
        'carefully measured and neutral'],
        a: 'convincing as evidence against something',
        r: '"The district\'s statistics looked damning" is immediately followed by the correction, so the word means the evidence looked conclusive — which is what made the error go unnoticed.' },
    ],
  },
  {
    id: 'seeds',
    genre: 'natural science',
    text: `For most of the twentieth century the standard storage treatment for seed was cold and dry: low temperature, low humidity, and the assumption that the two together would hold a sample for years. A 1991 survey of one large seed bank found something the standard had not anticipated. Roughly a fifth of the accessions could no longer germinate at all, and the losses were not evenly spread. They clustered in accessions that had been opened again and again — taken out of the cold room, sampled for the breeders who asked for them, and put back — which is how a bank does the work it exists for. Each opening let warm, damp air condense on cold seed, and most containers had been opened perhaps a dozen times. The surprise was not that the losses occurred but that they had gone unrecorded, because the protocol did not require a viability test after a container was opened. The bank was maintaining a collection whose core purpose was to hold viable seed, and the routine handling of it was spending that viability. The standard was not discarded. It was joined by something the survey had revealed as missing: a count.`,
    questions: [
      { skill: 'main_idea', d: 5, p: 'Which statement best expresses the main idea of the passage?', c: [
        'A routine meant to preserve seed was quietly destroying it',
        'Cold, dry storage turned out not to preserve seed at all',
        'Germplasm banks are generally well funded and well run',
        'Genetic diversity in seed banks has declined since 1991'],
        a: 'A routine meant to preserve seed was quietly destroying it',
        r: 'Opening the containers is "how a bank does the work it exists for," yet it is what spent the viability — the passage\'s whole point is the contradiction between the purpose and the effect.' },
      { skill: 'detail_support', d: 4, p: 'Why had the losses gone unrecorded?', c: [
        'The protocol did not require a viability test after a container was opened',
        'The bank refused to publish its results',
        'The survey excluded the most affected collections',
        'The tests were performed but the data was lost'],
        a: 'The protocol did not require a viability test after a container was opened',
        r: 'The text says the losses "had gone unrecorded, because the protocol did not require a viability test after a container was opened."' },
      { skill: 'inference', d: 8, p: 'The passage\'s statement that the bank was "maintaining a collection whose core purpose was to hold viable seed" suggests that', c: [
        'the failure was a design flaw rather than a failure of execution',
        'the staff were negligent in carrying out the protocol',
        'regeneration should have been abandoned entirely',
        'the funding of the bank was insufficient'],
        // The key has to be one of the four choices word for word. It used to be
        // a paraphrase of the first, so the item carried a fifth option that was
        // a second right answer.
        a: 'the failure was a design flaw rather than a failure of execution',
        r: 'It draws the contrast between purpose and outcome, and since the staff were following the protocol as written, the fault has to lie in the protocol itself.' },
      { skill: 'author_purpose', d: 6, p: 'The final phrase "joined by something the survey had revealed as missing: a count" primarily serves to', c: [
        'close by suggesting the standard was kept and only its oversight was repaired',
        'imply that the whole cold-and-dry method should now be abandoned',
        'criticise the survey for focusing on a narrow finding',
        'suggest that future surveys will face the same problem'],
        a: 'close by suggesting the standard was kept and only its oversight was repaired',
        r: '"The standard was not discarded. It was joined by..." states the resolution explicitly, and it is a modest one — a missing measurement rather than a replaced method.' },
      { skill: 'vocab_context', d: 5, p: 'As used in the passage, "accessions" most nearly means', c: [
        'individual samples held by the bank', 'funding received from member countries', 'the number of times a sample was grown out', 'locations where the seeds are stored'],
        a: 'individual samples held by the bank',
        r: 'The losses "clustered in accessions that had been opened again and again" — the word names the stored sample, which is the unit being counted and spent.' },
    ],
  },
  {
    id: 'clock',
    genre: 'social science',
    text: `The village clock was moved forward eleven minutes on the first Sunday in April, and the village was full of complaint. A farmer whose hens rose at four said the sun had not risen yet. A schoolmistress reported that the register no longer agreed with the sky. Until that Sunday the clock had kept the mean solar time for the parish; the uniform time being adopted everywhere was set by a meridian to the east, and at the parish's longitude the difference came to eleven minutes. The sun had never kept perfect step with either: over a year, solar noon drifts as much as a quarter of an hour to either side of noon on the clock. The committee chose the uniform time anyway, on the argument that a clock the whole country agreed on was worth more than one that was individually correct. A hundred and thirty years later the reasoning is unchanged, and the clock still runs eleven minutes ahead of the parish's mean sun. Almost nobody in the parish has an opinion about it. The interesting part is not the error. It is that a device everyone consulted twice a day, and consulted precisely in order to agree with everyone else, retained its authority the entire time.`,
    questions: [
      { skill: 'main_idea', d: 6, p: 'Which statement best expresses the main idea of the passage?', c: [
        'A shared clock kept its authority through a century of being wrong against the sun',
        'Farmers were right to object to eleven minutes being added to the clock',
        'Uniform time was adopted in order to correct the parish against the sun',
        'The parish eventually stopped consulting the clock altogether'],
        a: 'A shared clock kept its authority through a century of being wrong against the sun',
        r: 'The gap between clock and sun is real and is the setup; the closing sentences say the real story is unchanging authority, which only reads that way if the error is held in view.' },
      { skill: 'detail_support', d: 3, p: 'According to the passage, how far ahead of the parish\'s mean solar time does the village clock run today?', c: [
        'About eleven minutes', 'About four minutes', 'About a quarter of an hour', 'It is now exactly correct'],
        a: 'About eleven minutes',
        r: 'The clock was moved forward eleven minutes, and the passage says it "still runs eleven minutes ahead of the parish\'s mean sun."' },
      { skill: 'inference', d: 8, p: 'The fact that "almost nobody in the parish has an opinion about it" most strongly suggests that', c: [
        'the clock is consulted for agreement rather than for accuracy',
        'the parish has forgotten how the clock is set',
        'nobody in the parish notices small differences in time',
        'the clock is used only on special occasions'],
        a: 'the clock is consulted for agreement rather than for accuracy',
        r: 'Absence of opinion about a known error means the thing people want from it is the shared reference, not the solar fact — which is what the committee argued in the first place.' },
      { skill: 'author_purpose', d: 6, p: 'The schoolmistress reporting that the register no longer agreed with the sky primarily serves to', c: [
        'show that the complaints described a real mismatch between the clock and the sun',
        'imply that the school was negligent in its timekeeping',
        'argue that clocks should record solar time only',
        'explain why farmers object to time changes more than teachers do'],
        a: 'show that the complaints described a real mismatch between the clock and the sun',
        r: 'A school register is a written record of a shared time, so its disagreeing with the sky is evidence of a real eleven-minute gap — which sets up the irony that the clock kept its authority anyway, rather than adding a second grievance.' },
      { skill: 'vocab_context', d: 5, p: 'As used in the passage, "drifts" most nearly means', c: [
        'shifts gradually away and back again', 'floats without purpose', 'is moved by the parish', 'changes unpredictably each year'],
        a: 'shifts gradually away and back again',
        r: 'Solar noon moves steadily earlier and later over the year, by up to a quarter of an hour either side of clock noon, and returns — a gradual, regular shift rather than a random one.' },
    ],
  },
  {
    id: 'jazz',
    genre: 'humanities',
    text: `The group's first recording was made in 1917 and it is not a tune. It is three minutes of a group working out, in real time, what a note was going to mean before anyone had decided what it would mean. The horns enter one at a time, each one testing a phrase and each one being answered by a rhythm section that does not commit until it has heard where the phrase is going. What the record contains is not a mistake, corrected. It is the moment a musical language is being agreed on by the people who will use it. The second recording, made four years later, is the same group and the same tune, and it is so assured that the opening four bars function as a statement rather than a question. Anyone who hears only the second recording hears virtuosity. Anyone who hears both hears something rarer: the difference between a convention and the invention the convention was built on. The 1917 disc was reissued in the nineteen-sixties, and reviewers at the time treated it as a historical curiosity — a document of an early phase — which is precisely what it stopped being the moment anyone could hear the later record and know what the earlier one had been working on.`,
    questions: [
      { skill: 'main_idea', d: 6, p: 'Which statement best expresses the main idea of the passage?', c: [
        'The 1917 recording is most interesting when heard against what it became',
        'The 1917 recording is a better performance than the 1921 one',
        'Early jazz musicians lacked the technical ability of later musicians',
        'The 1921 recording was more popular with audiences than the 1917 one'],
        a: 'The 1917 recording is most interesting when heard against what it became',
        r: 'The passage\'s argument is comparative throughout — "anyone who hears both hears something rarer" — and the 1960s reissue supplies the test case.' },
      { skill: 'detail_support', d: 4, p: 'How does the passage describe the rhythm section in the 1917 recording?', c: [
        'It does not commit until it has heard where the phrase is going',
        'It plays a fixed accompaniment throughout',
        'It enters only after the horns finish',
        'It follows the drummer\'s lead throughout'],
        a: 'It does not commit until it has heard where the phrase is going',
        r: 'The text says each horn is "answered by a rhythm section that does not commit until it has heard where the phrase is going."' },
      { skill: 'inference', d: 8, p: 'The passage says reviewers in the nineteen-sixties treated the 1917 disc as "precisely what it stopped being" once the later record was available. This implies that', c: [
        'the early record became historically interesting only after its conventions were established',
        'the 1917 recording was of little interest to contemporary musicians',
        'the reissue was intended to promote the group\'s later work',
        'musicians disagreed about which recording was technically superior'],
        a: 'the early record became historically interesting only after its conventions were established',
        r: 'The sentence says the record stopped being "a document of an early phase" once you can hear what it turned into, so its interest is a consequence of the later record existing.' },
      { skill: 'author_purpose', d: 6, p: 'The contrast between "convention" and "the invention the convention was built on" primarily serves to', c: [
        'argue that the two records are not performing the same kind of music',
        'explain why the later recording sounds more assured',
        'justify the nineteen-sixties decision to reissue the record',
        'suggest that the early style was a mistake later corrected'],
        a: 'argue that the two records are not performing the same kind of music',
        r: 'The phrase separates a settled practice from the act that produced it, which is the passage\'s claim about what hearing both records reveals.' },
      { skill: 'vocab_context', d: 5, p: 'As used in the passage, "assured" most nearly means', c: [
        'confident and settled in its approach', 'loud and forceful in volume', 'skilled in a technically demanding way', 'suited to the audience it was written for'],
        a: 'confident and settled in its approach',
        r: '"So assured that the opening four bars function as a statement rather than a question" — the word is doing the work of the following clause, and the contrast is with the earlier record\'s questioning.' },
    ],
  },
  {
    id: 'library',
    genre: 'social science',
    text: `The reference desk existed to answer the one question a catalogue could not: what the library had that a reader would not have thought to ask for. Its decline is usually described as a fall in demand, and the description is defensible only if the demand is for a person. In 1994 the reference desk at one mid-sized library logged nine thousand questions. Ten years later it logged twelve hundred, and the reading rooms had not emptied. What had changed was the arrival of a body of information that was exhaustive, current, and available without anyone in the building. The reference librarian was not answering a question the catalogue had failed to answer. She was answering a question the catalogue could now answer better, faster, and without knowing which of the two the reader actually wanted. The profession spent the following decade arguing about retrieval, and the argument was beside the point. The desk had not been a search function. It had been a judgement function: a person deciding what was worth asking, and often, having read the question aloud to the room, discovering that the person who had come in with a question did not have it. That cannot be catalogued and has never been available on demand. It is also the only part of the answer that was ever about the reader rather than the book.`,
    questions: [
      { skill: 'main_idea', d: 7, p: 'Which statement best expresses the main idea of the passage?', c: [
        'The reference desk served a judgement function that information retrieval could not replace',
        'Libraries made a serious mistake by investing in catalogues',
        'Readers stopped asking questions once digital information arrived',
        'Reference librarians were replaced because their work was mechanical'],
        a: 'The reference desk served a judgement function that information retrieval could not replace',
        r: 'The passage explicitly separates search from judgement — "The desk had not been a search function. It had been a judgement function" — and that distinction is the argument.' },
      { skill: 'detail_support', d: 4, p: 'According to the passage, what happened to the number of logged questions between 1994 and ten years later?', c: [
        'It fell from nine thousand to twelve hundred', 'It fell from twelve hundred to nine hundred', 'It rose from nine thousand to twelve thousand', 'It stayed at roughly the same level'],
        a: 'It fell from nine thousand to twelve hundred',
        r: 'The text gives both figures directly: "nine thousand questions" in 1994 and "twelve hundred" ten years later.' },
      { skill: 'inference', d: 9, p: 'The detail about the librarian "discovering that the person who had come in with a question did not have it" implies that', c: [
        'the reference desk served readers who had not yet found their question',
        'most readers arrived with an unanswerable question',
        'the catalogue was frequently wrong about holdings',
        'librarians were trained to challenge visitors unnecessarily'],
        a: 'the reference desk served readers who had not yet found their question',
        r: 'It describes a reader arriving without a real question, which is a different service from answering one — and the passage calls it the part that was "about the reader."' },
      { skill: 'author_purpose', d: 6, p: 'The observation that the profession "spent the following decade arguing about retrieval, and the argument was beside the point" primarily serves to', c: [
        'criticise the profession for misreading its own decline',
        'show that retrieval technology was poorly designed',
        'explain why funding for libraries was reduced',
        'justify replacing reference librarians with digital systems'],
        a: 'criticise the profession for misreading its own decline',
        r: 'It reframes the whole decline as a misreading: the loss was not a search function failing, so a search-shaped response could not have addressed it.' },
      { skill: 'vocab_context', d: 5, p: 'As used in the passage, "exhaustive" most nearly means', c: [
        'complete in its coverage', 'exhausting to the reader', 'expensive to compile', 'limited to one subject area'],
        a: 'complete in its coverage',
        r: 'The digital body of information is "exhaustive, current, and available without anyone" — completeness and currency together are what made the desk redundant.' },
    ],
  },
  {
    id: 'dye',
    genre: 'natural science',
    text: `The first synthetic dye to be manufactured in quantity was not the first synthetic dye to exist. Chemists working with coal tar had produced coloured compounds before, and most of them stayed curiosities on a laboratory shelf. In 1856 William Perkin, eighteen years old and trying to make quinine, got a black sludge instead, and found that alcohol drew a strong purple out of it. Plenty of chemists had thrown black sludge away. What Perkin did next mattered more than the accident: he ran the reaction again, on purpose, and found that the same starting materials gave the same purple. Repeatability turned out to be the property that mattered most, and it was a property of the process rather than of the colour. Because the purple came reliably from aniline, which could be made from coal tar bought by the barrel, it could be made in a factory and not only at a bench. The consequence was not only that the colour became available but that the process became teachable. Within a decade, dye manufacture had a standard sequence, a literature, and a set of failures that were worth writing down, because the reason for each was understood. The history is often told as a chemist being lucky, and the luck was real. The useful part was the decision to repeat the accident on purpose.`,
    questions: [
      { skill: 'main_idea', d: 6, p: 'Which statement best expresses the main idea of the passage?', c: [
        'The dye industry grew out of deliberately reproducing an accident and understanding why it worked',
        'The purple dye was found by a deliberate search for a new colour',
        'Synthetic dyes were superior to natural ones in every respect',
        'The key to synthetic colour was having cheap coal tar available'],
        a: 'The dye industry grew out of deliberately reproducing an accident and understanding why it worked',
        r: 'The passage is about a process made repeatable and then taught, with the re-observation as the hinge; the commercial story is what follows from that.' },
      // The old passage had the chemist work "on a mixture she had not kept",
      // while this key said she kept it, and credited the purple to an unnamed
      // woman: the first mass-produced synthetic dye was mauveine, found by
      // William Perkin in 1856. The wrong options are also kept false of Perkin
      // (he did patent the process and test it on silk, so those are not offered).
      { skill: 'detail_support', d: 4, p: 'According to the passage, what did Perkin do that mattered more than the accident itself?', c: [
        'He ran the reaction again on purpose and got the same purple',
        'He improved the colour by adding a second tar fraction',
        'He searched the natural dyes for a purple to copy',
        'He bought a purer grade of coal tar than earlier chemists'],
        a: 'He ran the reaction again on purpose and got the same purple',
        r: 'The passage says "he ran the reaction again, on purpose, and found that the same starting materials gave the same purple" — and that this "mattered more than the accident."' },
      { skill: 'inference', d: 8, p: 'The passage\'s claim that the useful part was "the decision to repeat the accident on purpose" implies that', c: [
        'much of the advance came from systematic study of accidental findings',
        'the original discovery was more important than the process',
        'lucky discoveries are common in every branch of science',
        'careful planning prevents useful accidents from occurring'],
        a: 'much of the advance came from systematic study of accidental findings',
        r: 'It grants the luck ("the luck was real") and then redirects credit to the systematic follow-through, which is the passage\'s whole point about how progress actually happens.' },
      { skill: 'author_purpose', d: 6, p: 'The closing line about the history being "often told as a chemist being lucky" primarily serves to', c: [
        'correct a standard telling of the discovery while granting that it had luck in it',
        'discredit the chemists involved in the discovery',
        'argue that the story has been invented rather than distorted',
        'suggest that popular histories are not worth reading'],
        a: 'correct a standard telling of the discovery while granting that it had luck in it',
        r: 'The "and the luck was real" that immediately follows prevents the correction from reading as a sneer, which is what makes the reframing credible.' },
      { skill: 'vocab_context', d: 5, p: 'As used in the passage, "repeatability" most nearly means', c: [
        'the property of a process that gives the same result each time it is run',
        'the likelihood that a colour will fade over time',
        'the number of times a chemical reaction can be performed',
        'the rate at which a patent can be renewed'],
        a: 'the property of a process that gives the same result each time it is run',
        r: 'It is introduced as a property of "the process rather than of the colour," right after Perkin finds that the same starting materials give the same purple — so the sense is reproducibility.' },
    ],
  },
];

/** Every question in this bank, flattened and tagged with its passage. */
function questionsForSkill(skillId) {
  const out = [];
  for (const p of PASSAGES) {
    for (const q of p.questions) {
      if (q.skill !== skillId) continue;
      out.push({ d: q.d, p: q.p, c: q.c, a: q.a, r: q.r, pass: p.text, passage_id: p.id });
    }
  }
  return out;
}

module.exports = { PASSAGES, questionsForSkill };
