/**
 * Original reading passages with their question sets. Written for this app, so
 * there is no licensing question and every answer is defensible from the text —
 * the standard a reading item has to meet.
 *
 * Each question is tagged with the skill it measures, which lets the reading
 * tracks, the ACT reading track, and the vocabulary skill all draw from the same
 * passages without duplicating prose.
 */
const PASSAGES = [
  {
    id: 'lighthouse',
    genre: 'narrative',
    text: `For thirty-one years Ada Brill kept the light at Cormorant Point, and for thirty-one years she kept a ledger no one asked her to keep. Every evening she wrote the hour the lamp was lit, the direction of the wind, and, in a narrower column, the names of the vessels that passed. Ships were not required to identify themselves, so most of the names were guesses drawn from a hull shape or a trick of paint. Her nephew, visiting once in September, called the column a waste of good ink. Ada did not argue. She simply turned back forty pages and showed him where the same guessed name appeared eleven times, always in the week before a storm, always heading north with no cargo she could see. The insurance men who came in 1931 read that column for two days and left without saying thank you. The rate for the harbor fell by a third that spring.`,
    questions: [
      { skill: 'main_idea', d: 4, p: 'Which statement best expresses the main idea of the passage?', c: [
        'A keeper’s unrequired record turned out to have value no one anticipated',
        'Lighthouse keepers were required to log every passing vessel',
        'Ada Brill disliked her nephew and ignored his advice',
        'Insurance rates in 1931 fell for reasons nobody understood'],
        a: 'A keeper’s unrequired record turned out to have value no one anticipated',
        r: 'The passage builds from "no one asked her to keep" to the insurance men reading the column and the rate dropping, so the point is the unexpected value of the record.' },
      { skill: 'detail_support', d: 3, p: 'According to the passage, how did Ada usually determine a vessel’s name?', c: [
        'She guessed from the hull shape or the paint',
        'Ships were required to signal their names',
        'Her nephew identified them for her',
        'She read them from insurance records'],
        a: 'She guessed from the hull shape or the paint',
        r: 'The text says names were "guesses drawn from a hull shape or a trick of paint."' },
      { skill: 'inference', d: 6, p: 'The passage most strongly suggests that the repeated name in Ada’s ledger was evidence of', c: [
        'a pattern of deliberate, planned activity',
        'a single ship lost in a storm',
        'an error in Ada’s method of guessing',
        'a change in the harbor’s weather'],
        a: 'a pattern of deliberate, planned activity',
        r: 'Eleven appearances, always before a storm, always northbound and apparently empty, describes a pattern too regular to be coincidence — and one the insurers found worth two days of reading.' },
      { skill: 'author_purpose', d: 7, p: 'The detail that the insurance men "left without saying thank you" primarily serves to', c: [
        'contrast the value of Ada’s work with the recognition she received',
        'show that the insurance men found nothing useful',
        'establish the year in which the passage takes place',
        'suggest that Ada had broken a rule'],
        a: 'contrast the value of Ada’s work with the recognition she received',
        r: 'The sentence immediately after reports that rates fell by a third, so the work mattered; the missing thanks marks the gap between usefulness and credit.' },
      { skill: 'vocab_context', d: 5, p: 'As used in the passage, "narrower" most nearly means', c: [
        'taking up less width on the page', 'less tolerant', 'more difficult to read', 'more recent'],
        a: 'taking up less width on the page',
        r: 'The word describes a column in a ledger, so it is literal width, not attitude.' },
    ],
  },
  {
    id: 'octopus',
    genre: 'natural science',
    text: `An octopus has roughly five hundred million neurons, and about two-thirds of them sit outside its brain, distributed through its arms. This arrangement has consequences. An arm severed from the body will still reach toward food and pass it toward a mouth that is no longer there, which suggests the arm is running a program of its own rather than waiting for instructions. In laboratory tanks, octopuses learn to open jars, and they learn faster when they have watched another octopus do it first. They also appear to make decisions we would call arbitrary: given two equally good routes to the same shelter, individual animals show stable preferences that persist across weeks. Researchers disagree about what to call this. Some argue that a nervous system built on this plan cannot support a unified experience at all, and that the octopus is better described as a federation than as an individual. Others note that the same could be said, with less confidence than we usually manage, of us.`,
    questions: [
      { skill: 'main_idea', d: 5, p: 'The passage is primarily concerned with', c: [
        'how the octopus nervous system complicates ideas about a single mind',
        'the process by which octopuses learn to open jars',
        'why severed octopus arms continue to move',
        'the disagreement between two named research teams'],
        a: 'how the octopus nervous system complicates ideas about a single mind',
        r: 'Each example — the arm, the imitation, the stable preferences — feeds the closing question of whether the animal is one individual or a federation.' },
      { skill: 'detail_support', d: 3, p: 'According to the passage, where are most of an octopus’s neurons located?', c: [
        'In its arms rather than its brain', 'Evenly split between brain and arms', 'In its brain', 'Around its mouth'],
        a: 'In its arms rather than its brain',
        r: 'The first sentence puts about two-thirds of the neurons outside the brain, distributed through the arms.' },
      { skill: 'inference', d: 7, p: 'The detail about the severed arm is included mainly to support the claim that', c: [
        'parts of the animal can act without central direction',
        'octopuses can survive serious injury',
        'the arm’s neurons are more numerous than the brain’s',
        'laboratory conditions distort octopus behavior'],
        a: 'parts of the animal can act without central direction',
        r: 'The passage says the arm behaves as if "running a program of its own rather than waiting for instructions."' },
      { skill: 'vocab_context', d: 6, p: 'As used in the last sentence, "federation" most nearly means', c: [
        'an alliance of semi-independent parts', 'a large government', 'a fixed hierarchy', 'a temporary partnership'],
        a: 'an alliance of semi-independent parts',
        r: 'The word is offered as an alternative to "individual" for a body whose parts act on their own, so it means a union of semi-independent components.' },
      { skill: 'author_purpose', d: 8, p: 'The final sentence functions to', c: [
        'turn the question back on human self-understanding',
        'settle the disagreement in favor of one side',
        'introduce a new experiment for future study',
        'concede that the earlier evidence was weak'],
        a: 'turn the question back on human self-understanding',
        r: 'It applies the federation description to "us," extending the doubt rather than resolving it.' },
    ],
  },
  {
    id: 'bicycle',
    genre: 'social science',
    text: `When the safety bicycle reached mass production in the 1890s, it cost roughly a month of a clerk’s wages and required no stable, no feed, and no groom. Historians of the period tend to treat the machine as a transportation story, but the contemporary record reads differently. Dress reformers, who had argued for two decades that women’s clothing was a health problem, suddenly had an argument that did not depend on principle: a skirt that caught in a chain was simply dangerous. Cycling clubs admitted women years before most civic organizations did, and the clubs kept membership rolls, which gave the first reliable count of how far unaccompanied women were willing to travel in a day. That number, twenty to forty miles, unsettled people who had assumed the limit was a matter of constitution rather than of equipment. The bicycle did not create the demand for independent movement. It removed the excuse that the demand was impractical.`,
    questions: [
      { skill: 'main_idea', d: 6, p: 'The main point of the passage is that the bicycle', c: [
        'undercut practical arguments against women’s independent movement',
        'was the first affordable form of personal transportation',
        'caused the dress reform movement to begin',
        'was cheaper to maintain than a horse'],
        a: 'undercut practical arguments against women’s independent movement',
        r: 'The closing sentences state it directly: the demand already existed, and the machine removed the claim that it was impractical.' },
      { skill: 'detail_support', d: 4, p: 'The passage cites cycling club membership rolls as the source of', c: [
        'the first reliable figures on distances women traveled alone',
        'evidence that bicycles cost a month of wages',
        'the earliest dress reform arguments',
        'proof that civic organizations excluded women'],
        a: 'the first reliable figures on distances women traveled alone',
        r: 'The rolls "gave the first reliable count of how far unaccompanied women were willing to travel in a day."' },
      { skill: 'author_purpose', d: 7, p: 'The author mentions that the bicycle required "no stable, no feed, and no groom" in order to', c: [
        'explain why the machine was accessible to people without means or staff',
        'compare bicycle speeds with horse speeds',
        'criticize the expense of horse ownership',
        'show that cycling was dangerous'],
        a: 'explain why the machine was accessible to people without means or staff',
        r: 'The list of what is not needed establishes low ongoing cost and independence from household infrastructure.' },
      { skill: 'inference', d: 8, p: 'The passage suggests that before the bicycle, limits on how far women traveled alone were widely attributed to', c: [
        'their physical capacity rather than their equipment',
        'legal restrictions in most cities',
        'the cost of transportation',
        'the absence of organized clubs'],
        a: 'their physical capacity rather than their equipment',
        r: '"a matter of constitution rather than of equipment" names exactly that assumption, and the new numbers unsettled it.' },
      { skill: 'vocab_context', d: 6, p: 'As used in the passage, "unsettled" most nearly means', c: [
        'disturbed the assumptions of', 'physically displaced', 'made undecided', 'angered'],
        a: 'disturbed the assumptions of',
        r: 'What is unsettled is people who had assumed something, so the sense is the upsetting of a belief.' },
    ],
  },
  {
    id: 'jazz',
    genre: 'humanities',
    text: `Ask a working improviser what she is doing during a solo and you will rarely hear the word "invent." The vocabulary is closer to construction: she is building on a figure, answering a phrase, quoting, worrying a note. This is not modesty. A musician who genuinely invented from nothing every eight bars would be impossible to accompany, because the rhythm section has to predict her well enough to leave room. What sounds like freedom is a dense negotiation conducted in a shared language of patterns, most of them learned by transcription rather than instruction. The paradox is that audiences hear the negotiation as spontaneity, and the more fluent the players, the more spontaneous it sounds — which means the impression of freedom is the product of constraint, not its absence.`,
    questions: [
      { skill: 'main_idea', d: 7, p: 'The central claim of the passage is that improvisation', c: [
        'depends on shared constraints that make it sound free',
        'is a form of composition written in advance',
        'cannot be taught through formal instruction',
        'is less creative than audiences believe'],
        a: 'depends on shared constraints that make it sound free',
        r: 'The last sentence states the paradox: the impression of freedom is the product of constraint.' },
      { skill: 'inference', d: 8, p: 'The passage implies that a soloist who truly invented from nothing would', c: [
        'be difficult for the other musicians to support',
        'produce more interesting music',
        'be praised as the most original player',
        'have no need for transcription'],
        a: 'be difficult for the other musicians to support',
        r: 'The text says such a player "would be impossible to accompany," because the rhythm section must be able to predict her.' },
      { skill: 'vocab_context', d: 7, p: 'As used in the passage, "worrying a note" most nearly means', c: [
        'working at it repeatedly', 'playing it anxiously', 'avoiding it', 'playing it too loudly'],
        a: 'working at it repeatedly',
        r: 'It appears among construction verbs — building, answering, quoting — so it describes persistent working-over, as a dog worries a bone.' },
      { skill: 'author_purpose', d: 6, p: 'The author lists the improviser’s own vocabulary mainly to', c: [
        'show that practitioners describe the work as construction rather than invention',
        'demonstrate that musicians dislike the word "invent"',
        'prove that improvisation is difficult to learn',
        'establish the author’s familiarity with musicians'],
        a: 'show that practitioners describe the work as construction rather than invention',
        r: 'The list is introduced as the answer to what she is doing, and the next sentence says "the vocabulary is closer to construction."' },
    ],
  },
  {
    id: 'seeds',
    genre: 'natural science',
    text: `A desert annual faces a scheduling problem. Its seeds must germinate in a year with enough rain to finish a life cycle, and a seed that guesses wrong dies without issue. Some species solve this by measuring rainfall directly: a hard coat that only a sustained soaking can breach. Others hedge. In several populations of Sonoran ephemerals, a single parent plant produces seeds with different dormancy depths, so that after any given storm a fraction sprouts and the rest wait. Averaged over decades, the hedging strategy yields fewer offspring in the best years and far more in the long run, because a population that commits everything to one good year can be erased by the drought that follows it. Ecologists call the resulting spread of germination times a bet-hedging strategy, and it appears wherever the variance of the environment is high and its average is uninformative.`,
    questions: [
      { skill: 'main_idea', d: 6, p: 'The passage is mainly about', c: [
        'how variable rainfall favors spreading germination across years',
        'how seed coats resist water',
        'why desert annuals produce many seeds',
        'the difference between annual and perennial plants'],
        a: 'how variable rainfall favors spreading germination across years',
        r: 'The passage moves from the scheduling problem to hedging and ends by generalizing to high-variance environments.' },
      { skill: 'detail_support', d: 4, p: 'According to the passage, hedging populations produce', c: [
        'fewer offspring in the best years but more over the long run',
        'more offspring in every year',
        'seeds with identical dormancy depths',
        'no seeds in drought years'],
        a: 'fewer offspring in the best years but more over the long run',
        r: 'That trade-off is stated directly in the sentence beginning "Averaged over decades."' },
      { skill: 'inference', d: 8, p: 'The passage suggests that a species relying entirely on a hard seed coat is most vulnerable when', c: [
        'a heavy soaking is followed by a drought before the plants can finish their life cycle',
        'rainfall is consistent from year to year',
        'seeds are dispersed over a wide area',
        'the parent plant produces few seeds'],
        a: 'a heavy soaking is followed by a drought before the plants can finish their life cycle',
        r: 'A coat that opens after one sustained soaking commits the seed on that single signal; the passage warns that a population which commits everything to one good year "can be erased by the drought that follows it."' },
      { skill: 'vocab_context', d: 7, p: 'As used in the passage, "uninformative" most nearly means', c: [
        'a poor guide to what will happen', 'difficult to measure', 'unavailable to researchers', 'unchanging'],
        a: 'a poor guide to what will happen',
        r: 'The average of the environment is contrasted with its high variance: knowing the mean does not tell a seed what this year will bring.' },
    ],
  },
  {
    id: 'clock',
    genre: 'social science',
    text: `Standard time was not adopted because people wanted to agree about noon. It was adopted because railways could not publish a timetable otherwise. Before 1883, a traveler moving west through Ohio passed through a series of local noons, each set by the sun over a particular courthouse, and each perfectly correct. Railroads ran on company time, and a junction served by three lines could display three clocks. The resulting collisions were not metaphorical. When the railroads imposed zones on their own authority, cities resisted for reasons that now sound quaint and then sounded like sovereignty: a municipality that let a railway set its clocks had conceded something. Congress did not ratify the arrangement until 1918, thirty-five years after the country had, in practice, already accepted it. The pattern is ordinary. Infrastructure standardizes first, law agrees later, and the public remembers the law.`,
    questions: [
      { skill: 'main_idea', d: 7, p: 'The passage primarily argues that standard time', c: [
        'was imposed by practical necessity before it was authorized by law',
        'was invented by Congress in 1918',
        'was resisted because it was scientifically inaccurate',
        'made railway travel safe for the first time'],
        a: 'was imposed by practical necessity before it was authorized by law',
        r: 'The passage traces railway need, railway imposition, city resistance, and late ratification, closing with "infrastructure standardizes first, law agrees later."' },
      { skill: 'detail_support', d: 5, p: 'The passage states that before 1883, local noon was set by', c: [
        'the sun over a particular local landmark', 'the nearest railway junction', 'company time published by railroads', 'an act of Congress'],
        a: 'the sun over a particular local landmark',
        r: 'Local noons were "each set by the sun over a particular courthouse."' },
      { skill: 'author_purpose', d: 8, p: 'The sentence "The resulting collisions were not metaphorical" serves to', c: [
        'indicate that the confusion caused actual accidents',
        'introduce a figure of speech about disagreement',
        'question the accuracy of railway records',
        'explain why cities objected to zones'],
        a: 'indicate that the confusion caused actual accidents',
        r: 'Denying that the collisions were metaphorical asserts that trains physically collided.' },
      { skill: 'vocab_context', d: 6, p: 'As used in the passage, "quaint" most nearly means', c: [
        'oddly old-fashioned', 'charmingly decorated', 'deliberately stubborn', 'poorly reasoned'],
        a: 'oddly old-fashioned',
        r: 'The reasons "now sound quaint and then sounded like sovereignty," contrasting a modern impression of datedness with a serious contemporary one.' },
      { skill: 'inference', d: 9, p: 'The final two sentences suggest that public memory of such changes tends to', c: [
        'credit the formal law rather than the practice that preceded it',
        'exaggerate how long the transition took',
        'blame infrastructure for social disruption',
        'forget the events entirely within a generation'],
        a: 'credit the formal law rather than the practice that preceded it',
        r: '"the public remembers the law" follows the observation that practice came first, so memory attaches to ratification.' },
    ],
  },
];

/** Every question, flattened, tagged with its passage. */
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
