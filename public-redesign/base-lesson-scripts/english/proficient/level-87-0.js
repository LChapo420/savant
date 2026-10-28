
  /* Crossy Road — base engine.
   *
   * The engine holds game logic only. It never contains curriculum content: the
   * questions, their answers, explanations and every message arrive through
   * window.GAME_DATA. The marker below is replaced at build/serve time with the
   * JSON payload:
   *
   *     engineHtml.replace('/* __DATA_INJECTION__ *' + '/', JSON.stringify(payload))
   *
   * It sits as the only element of an array literal so the file parses before
   * injection too (the slot is simply empty -> undefined), which is what lets
   * initGame be called live with a fresh payload and lets the file load in a
   * validator without a payload.
   *
   * Rules (per the game spec): the chicken crosses six lanes of traffic one hop
   * at a time; a lane with a car in it means a hit. A hit costs a death and one
   * question gates every revive: answer correctly and the chicken lives again,
   * answer incorrectly and it stays down — either way the next question is a new
   * one from the pool. The run ends at 5 deaths, or earlier on the visible
   * "Finish the run" control (an optional early quit).
   *
   * Traffic is deterministic on purpose: a lane holds a car exactly when
   * (hops taken in this crossing + lane number) is a multiple of 3, and both
   * hopping and waiting shift the pattern one step. Every crossing therefore
   * plays out the same way, and a careful player can always find a gap.
   *
   * Events out (dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, correct, ms, questionIndex, chosen}
   *   game:win    never — an endless crossing has no win line
   *   game:lose   {source, engineId, result, correct, wrong, questionsUsed} at 5 deaths
   *   game:draw   {source, engineId, result, correct, wrong, questionsUsed} on early quit
   */
  window.GAME_ID = 'crossy-road';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"crossy-road","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":87,"topic":"Activity 5 of 9 (quiz/game): Timed Try 2 - Usage Debates and Style Guides","title":"Timed Try 2: Usage Debates and Style Guides","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":4,"end":7,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q47","prompt":"Why might a style guide's entry on a word change between editions?","choices":["It means the word is always misspelled","It means writers once used it one way and now use it another","It means the word applies only to old books","It means the word changed its part of speech permanently"],"answerIndex":1,"explanation":"Shifts in a word's disputed status show how accepted usage changes over time.","difficulty":5,"skill":"Tracking changing usage","topic":"Usage Debates and Style Guides"},{"id":"q5","prompt":"A store sign reads 'Less bottles of water on the shelf.' A careful editor following a style guide would most likely change it to which of these?","choices":["Fewer bottles of water on the shelf","Less bottles of water on the shelf","Fewer amount of bottles on the shelf","Less numerous bottles on the shelf"],"answerIndex":0,"explanation":"Guides use 'fewer' for countable items and 'less' for quantities that cannot be counted one by one.","difficulty":4,"skill":"Applying a style-guide rule to a word-pair choice","topic":"Usage Debates and Style Guides"},{"id":"q25","prompt":"A guide's newest edition now permits a construction that its edition from twenty years ago criticized. What most likely explains the change?","choices":["Changed it because a famous editor personally banned the word forever","Changed it as writers' actual usage shifted and a new standard emerged","Changed it because older editions contained printing errors in the entry","Changed it at random, since style rules have no reasons behind them"],"answerIndex":1,"explanation":"Editions change when accepted usage shifts, and guides update to reflect the new standard.","difficulty":5,"skill":"Explaining how usage changes over time","topic":"Usage Debates and Style Guides"},{"id":"q22","prompt":"How do most style guides treat 'farther' and 'further'?","choices":["farther for physical distance, further for degree or extent","farther for degree, further for distance","they are never interchangeable in any guide","further is always a spelling error"],"answerIndex":0,"explanation":"Many guides prefer 'farther' for measurable distance and 'further' for abstract extent, though some treat them as interchangeable.","difficulty":6,"skill":"Confusing word pairs","topic":"Usage Debates and Style Guides"},{"id":"q45","prompt":"Two style guides give opposite answers to the same punctuation question. What does this best demonstrate?","choices":["They show that dictionaries are unreliable","They prove one of the two guides must be abolished","They show that usage conventions, not absolute laws, are being applied","They mean both guides are grammatically incorrect"],"answerIndex":2,"explanation":"Conflicting guide answers show that style is a set of conventions chosen by each authority.","difficulty":5,"skill":"Comparing style guides","topic":"Usage Debates and Style Guides"},{"id":"q3","prompt":"How does a style guide usually settle a disputed usage question?","choices":["It labels one side grammatically correct and the other a mistake","It refuses to say anything at all","It picks one option and requires writers to follow it consistently","It changes its recommendation every time a writer asks"],"answerIndex":2,"explanation":"A style guide settles debates by choosing one convention and applying it consistently, without claiming the other option is always wrong.","difficulty":4,"skill":"Understanding how style guides settle disputes","topic":"Usage Debates and Style Guides"},{"id":"q9","prompt":"A guide that treats 'data' and 'criteria' as plurals would prefer which pair of verb forms?","choices":["data is; criteria is","data are; criteria is","data is; criteria are","data are; criteria are"],"answerIndex":3,"explanation":"Under the plural-rule style guides, 'data' and 'criteria' are both plurals and take plural verbs.","difficulty":5,"skill":"Applying a style-guide rule to a word-pair choice","topic":"Usage Debates and Style Guides"},{"id":"q24","prompt":"What best describes how a publication's style guide is chosen?","choices":["It lists only spellings that dictionaries reject","It is the same in every country and every publisher","It is chosen by each publisher or organization and can differ between them","It is decided by the government"],"answerIndex":2,"explanation":"Style is house-specific: each publisher or organization sets its own guide, so standards differ.","difficulty":4,"skill":"Defining style guides","topic":"Usage Debates and Style Guides"},{"id":"q49","prompt":"What makes the Oxford comma a classic usage debate?","choices":["It is a live example of a punctuation choice that guides handle differently","It is a spelling rule identical in every guide","It has been settled the same way for 200 years","It concerns verb tense, not punctuation"],"answerIndex":0,"explanation":"The Oxford comma remains a signature example of a usage debate split between style guides.","difficulty":5,"skill":"Recognizing disputed rules","topic":"Usage Debates and Style Guides"},{"id":"q46","prompt":"Some editors dislike the word 'impactful' while dictionaries list it as standard. What does this example show about disputed words?","choices":["'Impactful' is banned everywhere because it is not a real English word","'Impactful' is disliked by some authorities but has real dictionary standing","'Impactful' is universally praised as the most precise word available","'Impactful' can only be used in advertising, never in school writing"],"answerIndex":1,"explanation":"'Impactful' is a real word that some authorities discourage for style reasons, which makes it a usage debate rather than an error.","difficulty":6,"skill":"Recognizing disputed usage across guides","topic":"Usage Debates and Style Guides"},{"id":"q31","prompt":"Why do usage debates change over time?","choices":["Because editors dislike changing their own rules","Because the English language randomly shifts every decade","Because writers and speakers gradually adopt new patterns, and guides follow","Because publishers copy each other's mistakes"],"answerIndex":2,"explanation":"Usage debates shift as real language use changes, and style guides update to match.","difficulty":5,"skill":"Tracking changing usage","topic":"Usage Debates and Style Guides"},{"id":"q33","prompt":"A student's paper must follow her school's style guide, which spells out one choice for a disputed punctuation rule. What is the correct way for her to handle that rule?","choices":["She switches to a new guide every time a rule feels inconvenient","She follows the guide for names and dates but ignores it for grammar","She applies the guide's preference consistently across the whole paper","She looks up the rule in several guides and blends all their answers"],"answerIndex":2,"explanation":"Consistency with one chosen guide is exactly what style guides exist to provide.","difficulty":4,"skill":"Applying a style guide to a real writing decision","topic":"Usage Debates and Style Guides"},{"id":"q1","prompt":"What is the main purpose of a style guide?","choices":["A dictionary of every word in the English language","A set of rules and preferences a publisher uses to keep writing consistent","A list of banned words that no writer may ever use","A guide to typing and formatting on a computer"],"answerIndex":1,"explanation":"A style guide is a set of conventions and preferences that a publication or organization follows so its writing is consistent.","difficulty":3,"skill":"Defining style guides","topic":"Usage Debates and Style Guides"},{"id":"q35","prompt":"How do most modern style guides treat the split infinitive in 'to quietly leave'?","choices":["It is acceptable when it clearly and smoothly modifies the verb","It is always forbidden by every modern guide","It is required in formal essays","It is a spelling mistake, not a grammar question"],"answerIndex":0,"explanation":"Most modern guides accept split infinitives when the adverb placement is clear and natural.","difficulty":5,"skill":"Recognizing disputed rules","topic":"Usage Debates and Style Guides"},{"id":"q15","prompt":"Your teacher's class follows one style guide, and you are unsure about a rule. What should you do?","choices":["Ignore it and choose whatever feels right in the moment","Ask a friend with no style training","Use the option the guide labels grammatically wrong","Check what the relevant style guide says and follow it consistently"],"answerIndex":3,"explanation":"When a guide governs your writing, the correct move is to check its rule and apply it consistently.","difficulty":4,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q20","prompt":"Choose the correct word: To ______ should I address this letter?","choices":["who","whom","whose","who's"],"answerIndex":1,"explanation":"'Whom' is the object form, needed after the preposition 'to'.","difficulty":5,"skill":"Confusing word pairs","topic":"Usage Debates and Style Guides"},{"id":"q50","prompt":"Why is it reasonable for different respected style guides to disagree?","choices":["Because style rules are absolute laws with one right answer","Because guides weigh clarity, consistency, and actual usage, which can differ by audience","Because guides cannot read dictionaries","Because every guide copies the first guide ever written"],"answerIndex":1,"explanation":"Guides balance clarity, consistency, and current usage for their specific audiences, so they can differ.","difficulty":6,"skill":"Comparing style guides","topic":"Usage Debates and Style Guides"},{"id":"q14","prompt":"A style guide says to prefer the active voice but allows the passive when the doer is unknown or unimportant. What should a writer do with 'The window was broken overnight' in a report where nobody knows who broke it?","choices":["Revise it to use the active voice when it improves clarity","Delete the sentence entirely, since the passive is forbidden","Keep it, because the passive voice is always the most formal choice","Replace every verb in the piece with the passive voice for consistency"],"answerIndex":0,"explanation":"Guides typically permit the passive when it serves a purpose and push writers toward the active when clarity improves.","difficulty":5,"skill":"Applying a style-guide rule to a real writing decision","topic":"Usage Debates and Style Guides"},{"id":"q32","prompt":"Which question does the study of usage debates most directly help a writer answer?","choices":["Whether a disputed point is an outright error or a choice to make","Whether the writer's spelling is correct throughout the piece","Whether the piece contains enough words to meet the length limit","Whether the writer has quoted any outside sources in the piece"],"answerIndex":0,"explanation":"A central lesson of usage debates is that disputed points are stylistic choices, not absolute errors.","difficulty":4,"skill":"Understanding what usage debates are","topic":"Usage Debates and Style Guides"},{"id":"q43","prompt":"What is the current status of starting a sentence with 'hopefully'?","choices":["All adverbs are errors at the start of a sentence","Beginning a sentence with 'hopefully' is banned by every modern guide","The word may only describe a manner of looking","It was long criticized, but many guides now accept it meaning 'it is hoped'"],"answerIndex":3,"explanation":"Critics once called sentence-initial 'hopefully' wrong, but many modern guides accept it.","difficulty":5,"skill":"Tracking changing usage","topic":"Usage Debates and Style Guides"},{"id":"q40","prompt":"What lesson about usage debates does the changing status of 'hopefully' teach?","choices":["That 'hopefully' has always been standard","That once-disputed usages can become widely accepted over time","That all adverbs at the start of a sentence are errors","That usage debates only involve punctuation"],"answerIndex":1,"explanation":"The acceptance of sentence-initial 'hopefully' shows how usage debates evolve over time.","difficulty":5,"skill":"Tracking changing usage","topic":"Usage Debates and Style Guides"},{"id":"q17","prompt":"Choose the correct word: Cold weather can ______ your concentration.","choices":["effect","affect","effective","affectation"],"answerIndex":1,"explanation":"'Affect' is the verb meaning to influence something.","difficulty":4,"skill":"Confusing word pairs","topic":"Usage Debates and Style Guides"},{"id":"q13","prompt":"Which position would a modern, permissive style guide most likely take on this sentence: 'Someone left their umbrella.'?","choices":["Accepting singular 'they' for a person of unspecified gender","Banning all use of the word 'they'","Requiring 'he or she' in every sentence with any noun","Treating singular 'they' as a spelling error"],"answerIndex":0,"explanation":"Many modern style guides now allow singular 'they' for an unspecified person, though some still prefer rewriting the sentence.","difficulty":6,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q19","prompt":"Choose the correct word: I need to ______ down for a while.","choices":["lie","lay","laid","layed"],"answerIndex":0,"explanation":"'Lie' means to recline and takes no object, so 'I need to lie down' is correct.","difficulty":5,"skill":"Confusing word pairs","topic":"Usage Debates and Style Guides"},{"id":"q39","prompt":"Which sentence would a style guide most likely flag for revision?","choices":["It is a complete sentence by itself","It must never be revised once written","It is the sentence a guide recommends revising for wordiness","It is the model every guide sets as ideal"],"answerIndex":2,"explanation":"Guides flag wordy phrases like 'in order to' and recommend trimming them to 'to'.","difficulty":5,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q26","prompt":"A journalist is unsure whether to use the serial comma. What should guide her decision first?","choices":["The style guide her publication or teacher follows","The oldest dictionary she can find","Her personal taste alone","Whichever rule appears in a novel she enjoyed"],"answerIndex":0,"explanation":"A writer should follow the style guide that governs the piece she is writing.","difficulty":4,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q11","prompt":"How have style guides generally responded to singular 'they' over time?","choices":["Older guides banned it, and some modern guides now accept it","All guides have always accepted it without comment","It was invented as a rule in 2015","Every guide requires it in formal writing"],"answerIndex":1,"explanation":"Singular 'they' was long disputed, and major modern guides have increasingly accepted it.","difficulty":5,"skill":"Tracking changing usage","topic":"Usage Debates and Style Guides"},{"id":"q10","prompt":"Many style guides use 'that' for clauses that identify which specific thing is meant. Which sentence fits that preference?","choices":["The puzzle which I solved yesterday was hard.","The puzzle that I solved yesterday was hard.","The puzzle which one I solved yesterday was hard.","The puzzle that I solved it yesterday was hard."],"answerIndex":1,"explanation":"Guides commonly reserve 'that' for clauses identifying exactly which thing is meant, without a comma.","difficulty":6,"skill":"Applying a style-guide rule to a word-pair choice","topic":"Usage Debates and Style Guides"},{"id":"q38","prompt":"A writer cannot remember whether to write 'toward' or 'towards'. Following a style guide, what should she do?","choices":["By checking which option the guide prefers and using it consistently","By choosing whichever word is longer","By assuming both are always wrong","By picking the word that appears first in the alphabet"],"answerIndex":0,"explanation":"A style guide settles disputed pairs by specifying which option to use consistently.","difficulty":4,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q21","prompt":"One guide permits 'a lot' in formal writing; another requires 'many' or 'much' instead. What is the most reasonable conclusion?","choices":["It contradicts itself, so neither entry can be trusted","It proves that one of the two guides must be wrong","It means the rule was never really disputed in the first place","It shows the guides are weighing clarity and tradition differently"],"answerIndex":3,"explanation":"Different guides weigh clarity, brevity, and tradition differently, so honest disagreement on disputed points is normal.","difficulty":5,"skill":"Understanding why guides disagree","topic":"Usage Debates and Style Guides"},{"id":"q48","prompt":"In which situation would a style guide most directly settle a writer's question?","choices":["A news reporter reporting on a press conference","A poet choosing words for sound","A student writing a research paper in a class with a required guide","A novelist inventing a fantasy language"],"answerIndex":2,"explanation":"Class papers with a required guide are a typical setting where a writer must apply style-guide rules.","difficulty":5,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q2","prompt":"Why do publications adopt a style guide at all?","choices":["It makes writing consistent across many writers and documents","It proves which usage rules are absolutely true forever","It forces all English speakers to write the same way","It replaces the need for grammar knowledge"],"answerIndex":0,"explanation":"Style guides exist to make decisions uniform within one publication, not to declare universal truths about English.","difficulty":4,"skill":"Defining style guides","topic":"Usage Debates and Style Guides"},{"id":"q4","prompt":"Choose the version that follows the standard style-guide rule for 'between' and 'among'.","choices":["Between the five team captains in the league","Among the five team captains in the league","Between all the team captains in the league","In between the five team captains in the league"],"answerIndex":1,"explanation":"Style guides generally use 'between' for two items and 'among' for three or more.","difficulty":5,"skill":"Applying a style-guide rule to a word-pair choice","topic":"Usage Debates and Style Guides"},{"id":"q30","prompt":"Which situation is a genuine usage debate that a style guide would address?","choices":["Whether to use the word 'umbrella' correctly","Whether to use the passive voice in a sentence","Whether to capitalize the word 'summer'","Whether to spell 'definitely' with an a"],"answerIndex":1,"explanation":"Passive voice is a classic style debate: guides advise limiting it, not banning it outright.","difficulty":6,"skill":"Recognizing disputed rules","topic":"Usage Debates and Style Guides"},{"id":"q8","prompt":"Why might a modern style guide accept 'to boldly go'?","choices":["Because the split infinitive is now a spelling error","Because modern guides often allow it when the sentence sounds natural","Because guides now require splitting every infinitive","Because infinitives were removed from standard English"],"answerIndex":1,"explanation":"Older rules banned split infinitives, but most modern guides allow them when the meaning is clear and the phrasing reads smoothly.","difficulty":5,"skill":"Recognizing disputed rules","topic":"Usage Debates and Style Guides"},{"id":"q42","prompt":"What value does following a single style guide add to a piece of writing?","choices":["Consistency within the document","Using as many long words as possible","Never using any disputed construction","Matching the style of the most famous novel available"],"answerIndex":0,"explanation":"Style guides exist chiefly to keep a document internally consistent.","difficulty":4,"skill":"Defining style guides","topic":"Usage Debates and Style Guides"},{"id":"q37","prompt":"How might a style guide treat the sentence 'Each student should bring their own pen'?","choices":["It forbids 'they' for a single person in all cases","It may accept singular 'they' for a person whose gender is not stated","It requires 'they' only in dialogue","It treats 'they' as a plural-only verb"],"answerIndex":1,"explanation":"Modern guides commonly accept singular 'they' for an unspecified individual.","difficulty":5,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q36","prompt":"Which of these is the best definition of a style manual?","choices":["A list of vocabulary words to memorize","A book of poems used as writing models","A manual of rules and preferences for writing and editing","A dictionary of slang expressions"],"answerIndex":2,"explanation":"A style manual is a reference book of writing rules and house preferences.","difficulty":3,"skill":"Defining style guides","topic":"Usage Debates and Style Guides"},{"id":"q23","prompt":"Why might a style guide prefer 'because' over 'due to the fact that'?","choices":["Because 'due to the fact that' is shorter","Because a style guide may prefer 'because' for conciseness","Because 'due to the fact that' is spelled wrong","Because 'because' is banned in formal writing"],"answerIndex":1,"explanation":"Style guides often favor the more concise 'because' over the wordy 'due to the fact that'.","difficulty":4,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q27","prompt":"AP omits the serial comma while Chicago requires it. What does this show?","choices":["That any sentence can be judged with a single universal answer","That the same question can get different answers from different respected guides","That style guides never disagree","That one guide must be wrong whenever two differ"],"answerIndex":1,"explanation":"Different guides can legitimately give different answers to the same usage question.","difficulty":5,"skill":"Comparing style guides","topic":"Usage Debates and Style Guides"},{"id":"q12","prompt":"Following the strict 'comprise/compose' distinction, which sentence would a traditional style guide prefer?","choices":["The committee was comprised of nine members.","The committee is comprised by nine members.","The committee comprises nine members.","The committee was composed of comprising nine members."],"answerIndex":2,"explanation":"Guides that defend the distinction say the whole 'comprises' the parts; 'is comprised of' is the disputed form.","difficulty":6,"skill":"Applying a style-guide rule to a word-pair choice","topic":"Usage Debates and Style Guides"},{"id":"q7","prompt":"Which statement best describes how style guides treat 'The data shows a trend' versus 'The data show a trend'?","choices":["It is incorrect English in every situation","It is only correct when speaking, never in writing","It is treated differently by different respected guides","It is banned because 'data' is a single uncountable mass noun"],"answerIndex":2,"explanation":"Whether 'data' takes a singular or plural verb is a genuine usage debate that guides answer differently.","difficulty":5,"skill":"Recognizing disputed usage across guides","topic":"Usage Debates and Style Guides"},{"id":"q34","prompt":"What is a usage debate?","choices":["A rule enforced identically by every guide","A rule about word origins","A rule about how to print a book's cover","A contested point on which respected authorities differ"],"answerIndex":3,"explanation":"A usage debate is a point where reputable authorities disagree about what is acceptable.","difficulty":4,"skill":"Defining style guides","topic":"Usage Debates and Style Guides"},{"id":"q28","prompt":"The phrase 'according to usage debates over time, a formerly criticized word can become standard' describes which phenomenon?","choices":["As a permanent error that was later invented","As an error that has stayed equally disputed for all words","As a case where accepted usage shifted over time","As proof that dictionaries never change"],"answerIndex":2,"explanation":"Words like 'hopefully' show that what counts as an error can change as usage becomes widespread.","difficulty":5,"skill":"Tracking changing usage","topic":"Usage Debates and Style Guides"},{"id":"q44","prompt":"Your class style guide requires 'email' without a hyphen, but you prefer 'e-mail'. What should you submit?","choices":["Consult an older grammar book from a different tradition","Follow whichever form the guide lists and stay consistent","Use both forms in the same document for variety","Ask a friend who has not read the guide"],"answerIndex":1,"explanation":"When a guide specifies a disputed form, the writer follows it consistently throughout the document.","difficulty":4,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q18","prompt":"Choose the correct word: Please ______ the papers on the desk.","choices":["lie","lay","laid","lain"],"answerIndex":2,"explanation":"'Lay' takes a direct object (lay the book down); 'lie' does not (lie down).","difficulty":5,"skill":"Confusing word pairs","topic":"Usage Debates and Style Guides"},{"id":"q41","prompt":"A guide says to use 'whether' when alternatives are implied. Which sentence follows that rule?","choices":["whether","if","whether","if"],"answerIndex":2,"explanation":"Many guides prefer 'whether' when presenting alternatives, as in 'whether or not'.","difficulty":6,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q29","prompt":"What most often drives changes in a style guide's recommendations?","choices":["Trends in how people actually use the language","The personal preference of one editor","Rules that no dictionary records","Random choices made without any pattern"],"answerIndex":0,"explanation":"Guides often change recommendations to reflect how real writers and speakers use the language.","difficulty":5,"skill":"Tracking changing usage","topic":"Usage Debates and Style Guides"},{"id":"q16","prompt":"Choose the correct word: The medicine had an immediate ______ on her mood.","choices":["effect","affect","affection","effectuate"],"answerIndex":0,"explanation":"'Effect' is the noun meaning a result; 'affect' is the verb meaning to influence.","difficulty":4,"skill":"Confusing word pairs","topic":"Usage Debates and Style Guides"},{"id":"q6","prompt":"Which style guide generally requires the Oxford comma?","choices":["Chicago Manual of Style","AP Stylebook","Neither guide","Both guides reject it"],"answerIndex":0,"explanation":"Chicago is known for requiring the serial comma before the final item in a list.","difficulty":5,"skill":"Comparing style guides","topic":"Usage Debates and Style Guides"}],"feedback":{"correct":"undefined","incorrect":"undefined","win":"undefined","lose":"undefined","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

  /* The question cursor, taken from the page shell so every game on the site
   * moves through its questions the same way: a question is asked once, and
   * losing, answering wrong, or pressing Play again continues at the next
   * unseen one instead of restarting the set. The shell keeps the position
   * across page reloads; the fallback here keeps this file runnable on its own. */
  var GAME_CURSOR = (window.PolymathGame && window.PolymathGame.cursor) || {
    at: 0,
    next: function (total) {
      var size = Math.max(1, Number(total) || 1);
      var index = this.at % size;
      var wrapped = this.at > 0 && index === 0;
      this.at += 1;
      return { index: index, wrapped: wrapped };
    },
  };

  window.initGame = function (payload) {
    var root = document.getElementById('game-root');
    if (!root || !payload || !Array.isArray(payload.questions) || !payload.questions.length) return;

    var meta = payload.meta || {};
    var settings = payload.settings || {};
    var feedback = payload.feedback || {};
    var QUESTIONS = payload.questions;
    var TOTAL = Math.max(1, Number(settings.questionCount) || QUESTIONS.length);
    var CHOICES = Math.max(2, Number(settings.choicesPerTurn) || 4);
    var LANES = 6;
    var DEATHS_MAX = 5;
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'),
      prompt: q('prompt'), choices: q('choices'), verdict: q('verdict'),
      board: q('board'), goal: q('goal'), goalflag: q('goalflag'),
      startrow: q('startrow'), startpos: q('startpos'), wait: q('wait'),
      crossings: q('crossings'), deaths: q('deaths'), finish: q('end'),
      modal: q('modal'), result: q('result'), endstats: q('endstats'), runs: q('runs'),
      restart: q('restart'), next: q('next'),
    };

    var state = null;
    var laneButtons = [];

    function emit(name, detail) {
      var data = { source: 'crossy-road', engineId: 'crossy-road' };
      for (var k in detail) data[k] = detail[k];
      try {
        window.dispatchEvent(new CustomEvent('game:' + name, { detail: data }));
      } catch (err) { /* an engine must never break the page over telemetry */ }
    }

    // Deterministic traffic: a lane holds a car when (tick + lane) % 3 === 0,
    // where tick counts the steps of this crossing (hops + waits). Hopping
    // advances the pattern; so does waiting. Same crossing, same traffic.
    function carIn(lane) {
      return (state.tick + lane) % 3 === 0;
    }

    function renderRoad() {
      for (var i = 1; i <= LANES; i++) {
        var btn = laneButtons[i];
        if (!btn) continue;
        var hasCar = carIn(i);
        var next = state.phase === 'play' && state.hops + 1 === i;
        btn.className = 'cr-lane'
          + (hasCar ? ' cr-lane--car' : '')
          + (state.hops === i ? ' cr-lane--here' : '');
        btn.disabled = !next;
        btn.querySelector('.cr-lane-state').textContent = hasCar ? 'Car passing!' : 'Clear gap';
        btn.querySelector('.cr-lane-pos').textContent = state.hops === i ? 'You' : '';
        btn.setAttribute('aria-label', 'Lane ' + i + ', ' + (hasCar ? 'a car is passing' : 'clear')
          + (state.hops === i ? ', you are here' : '') + (next ? '' : ', not your next hop'));
      }
      el.startpos.textContent = state.hops === 0 ? 'You' : '';
      el.wait.disabled = state.phase !== 'play';
      el.crossings.textContent = String(state.crossings);
      el.deaths.textContent = String(state.deaths);
    }

    function renderQuestion() {
      var item = state.item;
      el.prompt.textContent = item.prompt || '';
      el.counter.textContent = 'Question ' + state.qNo + ' of ' + TOTAL;
      el.choices.textContent = '';
      var opts = (item.choices || []).slice(0, CHOICES);
      for (var i = 0; i < opts.length; i++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cr-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var key = document.createElement('span');
        key.className = 'cr-key';
        key.textContent = KEYS[i] || String(i + 1);
        var text = document.createElement('span');
        text.textContent = opts[i];
        btn.appendChild(key);
        btn.appendChild(text);
        btn.setAttribute('aria-label', 'Choice ' + (KEYS[i] || i + 1) + ': ' + opts[i]);
        el.choices.appendChild(btn);
      }
    }

    function renderVerdict(correct, item) {
      var opts = (item.choices || []).slice(0, CHOICES);
      var answerText = opts[Number(item.answerIndex)] || '';
      el.verdict.hidden = false;
      el.verdict.className = 'cr-verdict ' + (correct ? 'cr-verdict--good' : 'cr-verdict--bad');
      el.verdict.textContent = '';
      var strong = document.createElement('strong');
      strong.textContent = correct ? (feedback.correct || 'Correct — you live again.')
        : (feedback.incorrect || 'Incorrect — no revive yet.');
      el.verdict.appendChild(strong);
      if (!correct && answerText) {
        var ans = document.createElement('span');
        ans.textContent = 'Answer: ' + answerText;
        el.verdict.appendChild(ans);
        if (item.explanation) el.verdict.appendChild(document.createElement('br'));
      }
      if (item.explanation) {
        var why = document.createElement('span');
        why.textContent = item.explanation;
        el.verdict.appendChild(why);
      }
    }

    function askNext() {
      // The cursor decides which question this is, and it is the same cursor
      // that decided the last one: a run that restarts after a death continues
      // the set rather than repeating it. When the pool is finally spent it
      // wraps and the payload's own out-of-questions line says so.
      var next = GAME_CURSOR.next(QUESTIONS.length);
      state.item = QUESTIONS[next.index];
      state.qPos = next.index;
      state.qNo = next.index + 1;
      state.phase = 'question';
      state.qStartMs = Date.now();
      renderQuestion();
      renderRoad();
      el.status.textContent = next.wrapped
        ? (feedback.outOfQuestions || 'Out of questions — the set starts again.')
        : 'Answer correctly to get a life and cross.';
    }

    function endGame(result) {
      state.phase = 'over';
      renderRoad();
      var message = result === 'win' ? (feedback.win || 'You win!')
        : result === 'lose' ? (feedback.lose || 'Five hits — the traffic wins this run.')
        : (feedback.draw || 'Run finished.');
      el.status.textContent = message;
      el.result.textContent = message;
      el.result.className = 'cr-result cr-result--' + result;
      el.endstats.textContent = 'You answered ' + state.correct + ' correct and ' + state.wrong
        + ' incorrect of ' + state.used + ' questions.';
      el.runs.textContent = 'You crossed ' + state.crossings + ' time' + (state.crossings === 1 ? '' : 's')
        + ' and were hit ' + state.deaths + ' time' + (state.deaths === 1 ? '' : 's') + '.';
      el.modal.dataset.open = 'true';
      emit(result, {
        result: result,
        correct: state.correct,
        wrong: state.wrong,
        questionsUsed: state.used,
      });
      el.restart.focus();
      return true;
    }

    function onDeath() {
      state.deaths += 1;
      // A hit sends the chicken back to the near sidewalk: the next life starts
      // a fresh crossing with fresh (still deterministic) traffic.
      state.hops = 0;
      state.tick = 0;
      renderRoad();
      if (state.deaths >= DEATHS_MAX) return endGame('lose');
      el.status.textContent = 'Splat — a car got you. Answer to revive.';
      askNext();
    }

    function onAnswer(index) {
      if (state.phase !== 'question') return;
      var item = state.item;
      var opts = (item.choices || []).slice(0, CHOICES);
      var correct = Number(item.answerIndex) === index;
      var buttons = el.choices.querySelectorAll('.cr-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 'cr-choice--right' : 'cr-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('cr-choice--right');
        }
      }
      state.used++;
      if (correct) state.correct++; else state.wrong++;
      renderVerdict(correct, item);
      emit('answer', {
        questionId: item.id || 'q' + state.used,
        questionIndex: state.qPos,
        correct: correct,
        chosen: opts[index] == null ? '' : String(opts[index]),
        ms: state.qStartMs ? Date.now() - state.qStartMs : null,
      });

      if (correct) {
        // The revive: control goes back to the player, one hop at a time.
        state.phase = 'play';
        el.status.textContent = feedback.correct || 'Correct — you live. Cross the road!';
        renderRoad();
      } else {
        // No revive yet — but the pool only ever moves forward.
        el.status.textContent = feedback.incorrect || 'Incorrect — no revive yet; a new question.';
        askNext();
      }
    }

    function onHop(lane) {
      if (state.phase !== 'play' || lane !== state.hops + 1) return;
      state.hops = lane;
      if (carIn(lane)) {
        renderRoad();
        return onDeath();
      }
      state.tick += 1;
      if (state.hops >= LANES) {
        state.crossings += 1;
        state.hops = 0;
        state.tick = 0;
        el.status.textContent = 'You made it across! Another crossing begins.';
      }
      renderRoad();
    }

    function onWait() {
      if (state.phase !== 'play') return;
      state.tick += 1;
      el.status.textContent = 'You wait — the traffic shifts.';
      renderRoad();
    }

    // ---- wire up a fresh round -------------------------------------------------
    //
    // The road resets; the question cursor does not. "Play again" is another
    // run taken up at the next unseen question, never the same one twice.
    state = {
      hops: 0, tick: 0, crossings: 0, deaths: 0,
      item: null, qPos: 0, qNo: 0, used: 0, correct: 0, wrong: 0,
      phase: 'question', qStartMs: 0,
    };
    el.modal.dataset.open = 'false';
    el.verdict.hidden = true;
    el.topic.textContent = meta.topic ? String(meta.topic) : '';
    el.topic.hidden = !meta.topic;
    // Where "Next level" goes is the page's to say, not the engine's: without a
    // door handed in from outside, the button stays out of the way.
    el.next.hidden = true;
    if (window.PolymathGame && window.PolymathGame.nextLevelUrl) {
      el.next.href = window.PolymathGame.nextLevelUrl;
      el.next.hidden = false;
    }

    // Lane buttons are built in hop order (lane 1 first) so the road reads as a
    // ladder of hops; the CSS flips the column so lane 1 sits at the bottom.
    el.board.textContent = '';
    laneButtons = [];
    for (var lane = 1; lane <= LANES; lane++) {
      (function (n) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cr-lane';
        btn.setAttribute('data-game-action', 'hop');
        btn.dataset.lane = String(n);
        var no = document.createElement('span');
        no.className = 'cr-lane-no';
        no.textContent = 'Lane ' + n;
        var st = document.createElement('span');
        st.className = 'cr-lane-state';
        var pos = document.createElement('span');
        pos.className = 'cr-lane-pos';
        btn.appendChild(no);
        btn.appendChild(st);
        btn.appendChild(pos);
        el.board.appendChild(btn);
        laneButtons[n] = btn;
      })(lane);
    }

    el.board.onclick = function (event) {
      var btn = event.target.closest ? event.target.closest('.cr-lane') : null;
      if (btn) onHop(Number(btn.dataset.lane));
    };
    el.wait.onclick = function () { onWait(); };
    el.choices.onclick = function (event) {
      var btn = event.target.closest ? event.target.closest('.cr-choice') : null;
      if (btn && !btn.disabled) onAnswer(Number(btn.dataset.index));
    };
    el.finish.onclick = function () {
      if (state.phase === 'over') return;
      endGame('draw');
    };
    el.restart.onclick = function () { window.initGame(payload); };

    renderRoad();
    askNext();
    emit('start', { engineId: 'crossy-road' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
