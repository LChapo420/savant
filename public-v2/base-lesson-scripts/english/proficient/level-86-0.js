
  /* Moto X3M — base engine.
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
   * Rules (per the game spec): the rider clears a level's obstacles one segment
   * at a time by picking the stunt each obstacle asks for (Jump, Wheelie, Brake);
   * a wrong stunt crashes the bike. A crash gates the restart with one question:
   * answer correctly and the level restarts, answer incorrectly and the bike
   * stays down — either way the next question is a new one from the pool. The
   * run ends when 5 levels are finished or after 6 crashes.
   *
   * The levels are deterministic on purpose: each level's obstacles always ask
   * for the same stunt in the same order, so a run plays out the same way and
   * every end condition is reachable without timing.
   *
   * Events out (dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, correct, ms, questionIndex, chosen}
   *   game:win    {source, engineId, result, correct, wrong, questionsUsed} at 5 levels
   *   game:lose   {source, engineId, result, correct, wrong, questionsUsed} at 6 crashes
   *   game:draw   never — the run always resolves win or lose
   */
  window.GAME_ID = 'moto-x3m';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"moto-x3m","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":86,"topic":"Activity 4 of 9 (quiz/game): Timed Try 1 - Usage Debates and Style Guides","title":"Timed Try 1: Usage Debates and Style Guides","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":4,"end":7,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q41","prompt":"Which of these has largely shifted from disputed convention into accepted modern usage?","choices":["Ending a sentence with a preposition","Writing run for past tense of run","Saying more better instead of better","Using effect as a verb meaning to bring about"],"answerIndex":3,"explanation":"Many guides now accept who or whom naturally, making it a shifting convention rather than an error.","difficulty":5,"skill":"Recognizing how usage changes over time","topic":"Usage Debates and Style Guides"},{"id":"q27","prompt":"How do their, there, and they're differ?","choices":["Their shows location; there shows possession","Their shows possession; there points to a place; they're means they are","There is possessive; their is a verb","They're shows possession; there means they are"],"answerIndex":1,"explanation":"Their is possessive, there points to a place or existence, and they're contracts they are.","difficulty":4,"skill":"Choosing their, there, or they're","topic":"Usage Debates and Style Guides"},{"id":"q44","prompt":"What does it show when two editions of the same guide disagree with each other?","choices":["It proves one side was wrong all along","It shows the dispute is a living convention, not a fixed law","It means English has no rules at all","It means both spellings must be used together"],"answerIndex":1,"explanation":"Guides changing sides demonstrate that disputed usage is settled by convention, which can shift.","difficulty":6,"skill":"Interpreting changing guides","topic":"Usage Debates and Style Guides"},{"id":"q34","prompt":"Which sentence follows the traditional fewer/less rule?","choices":["There were less students in class today.","There were fewer students in class today.","There were fewer water in the bottle.","There were less chairs in the room."],"answerIndex":1,"explanation":"Students can be counted, so fewer is the traditionally correct choice.","difficulty":5,"skill":"Choosing fewer or less","topic":"Usage Debates and Style Guides"},{"id":"q17","prompt":"On the Oxford comma, how do AP and Chicago differ?","choices":["Use the Oxford comma","Omit the Oxford comma","Use a semicolon instead","AP omits it and Chicago recommends it"],"answerIndex":3,"explanation":"The two guides give opposite answers on the serial comma, a classic example of guides disagreeing.","difficulty":5,"skill":"Comparing style guides","topic":"Usage Debates and Style Guides"},{"id":"q16","prompt":"Which style guide is standard for most American journalism?","choices":["AP style","MLA style only","Verse style","Plain style"],"answerIndex":0,"explanation":"The Associated Press Stylebook governs newspapers and much journalistic writing.","difficulty":4,"skill":"Knowing major style guides","topic":"Usage Debates and Style Guides"},{"id":"q13","prompt":"What usage debate involves the word hopefully?","choices":["Using hopefully as a noun for a hopeful person","Placing a comma before hopefully every time it appears","Spelling hopefully with two l's in formal writing","Starting a sentence with hopefully to mean I hope that"],"answerIndex":3,"explanation":"The hopefully debate concerns using it to modify a whole sentence, meaning I hope that.","difficulty":5,"skill":"Recognizing the hopefully debate","topic":"Usage Debates and Style Guides"},{"id":"q48","prompt":"Which sentence handles the pronoun issue in the most widely accepted modern way?","choices":["Every student must bring his pencil, which older guides required.","Every student must bring there pencil before class begins.","Every student must bring their pencil, which many modern guides accept.","Every students must bring their pencil."],"answerIndex":2,"explanation":"Singular they for an unspecified student is accepted by many modern guides, unlike the grammatical errors in the other options.","difficulty":6,"skill":"Applying modern pronoun conventions","topic":"Usage Debates and Style Guides"},{"id":"q5","prompt":"What is the Oxford comma?","choices":["A comma placed after a quotation mark to close dialogue","A comma used in place of a semicolon to join two clauses","The comma placed before and in a series, as in red, white, and blue","A comma required before the year in any full date"],"answerIndex":0,"explanation":"The Oxford comma is the serial comma placed before the coordinating conjunction in a list.","difficulty":4,"skill":"Defining the Oxford comma","topic":"Usage Debates and Style Guides"},{"id":"q38","prompt":"Which statement about disputed rules is true?","choices":["Split infinitives are always outright errors","The Oxford comma is grammatically mandatory in English","A disputed rule is a convention some guides accept and others reject","Ending a sentence with a preposition is illegal"],"answerIndex":2,"explanation":"Disputed rules are conventions that guides disagree on, not outright grammatical errors.","difficulty":5,"skill":"Avoiding misconceptions","topic":"Usage Debates and Style Guides"},{"id":"q23","prompt":"Which sentence uses the verb for influence correctly?","choices":["The new law will effect everyone in the city.","The new law will affect everyone in the city.","The new law will affective everyone in the city.","The new law will affect everyone's effected."],"answerIndex":1,"explanation":"The verb meaning to influence is affect, so the law will affect everyone.","difficulty":5,"skill":"Choosing affect or effect","topic":"Usage Debates and Style Guides"},{"id":"q20","prompt":"What is a commonly confused word pair?","choices":["Editing marks printers use for corrections","Words easily mistaken for each other in meaning or spelling","Words that rhyme with each other","Pairs of words with opposite meanings"],"answerIndex":1,"explanation":"Commonly confused word pairs are words whose meanings or spellings writers frequently mix up.","difficulty":4,"skill":"Defining confused word pairs","topic":"Usage Debates and Style Guides"},{"id":"q18","prompt":"When guides disagree, what should a writer normally do?","choices":["Follow whichever guide your publication, teacher, or field assigns","Mix rules from every guide you like","Wait for linguists to declare a winner","Choose the rule that requires the least typing"],"answerIndex":0,"explanation":"In practice, you follow the guide assigned by your publication, school, or profession.","difficulty":5,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q39","prompt":"Which of these is a disputed convention rather than an outright error?","choices":["Ending a sentence with a preposition","Spelling a word wrong","Writing a sentence with no verb","Forgetting to capitalize the first word of a sentence"],"answerIndex":0,"explanation":"Prepositions at sentence ends are a debated convention; the others are outright errors.","difficulty":6,"skill":"Distinguishing disputes from errors","topic":"Usage Debates and Style Guides"},{"id":"q26","prompt":"Which sentence is correct?","choices":["The dog wagged it's tail happily.","Its going to rain this afternoon.","The team celebrated it's victory.","Its been a long week for the whole class."],"answerIndex":3,"explanation":"Its been means it has been, so the contraction it's is required here.","difficulty":5,"skill":"Choosing its or it's","topic":"Usage Debates and Style Guides"},{"id":"q37","prompt":"What best describes a disputed rule of usage?","choices":["A rule with no exceptions anywhere in English","A rule people argue about, where the answer depends on convention and context","A rule that applies only to poetry and verse","A rule invented by one teacher for a single class"],"answerIndex":1,"explanation":"Disputed rules are argued-over conventions, not absolute rights and wrongs.","difficulty":4,"skill":"Understanding disputed rules","topic":"Usage Debates and Style Guides"},{"id":"q6","prompt":"What do major style guides say about the Oxford comma?","choices":["It is grammatically wrong and must be deleted","It is required by every English style guide","Style guides disagree: Chicago recommends it while AP omits it","It was invented in the 1990s for computers"],"answerIndex":1,"explanation":"Chicago style uses the serial comma; AP style drops it, so guides genuinely disagree.","difficulty":5,"skill":"Comparing style guides","topic":"Usage Debates and Style Guides"},{"id":"q42","prompt":"A student asks whether choosing who over whom is an error or just a style choice. Which assessment is most accurate?","choices":["Using who instead of whom as an object, where guides increasingly permit it","Writing definately for definitely, which is always a misspelling","Saying I seen it instead of I saw it, which is always nonstandard","Using less with countable nouns where almost every guide still objects"],"answerIndex":0,"explanation":"Whom is declining in everyday use, so most guides now treat avoiding it as a convention rather than an error.","difficulty":7,"skill":"Distinguishing disputed conventions from outright errors","topic":"Usage Debates and Style Guides"},{"id":"q21","prompt":"What is the usual difference between affect and effect?","choices":["Affect is always a noun; effect is always a verb, the reverse of the usual rule","Affect is usually a verb meaning to influence; effect is usually a noun meaning a result","The two words are interchangeable, so either may be used in any sentence","Affect is a formal word; effect belongs in casual writing only"],"answerIndex":2,"explanation":"Affect is most often the verb meaning to influence, and effect is most often the noun meaning a result.","difficulty":5,"skill":"Choosing affect or effect","topic":"Usage Debates and Style Guides"},{"id":"q25","prompt":"What is the difference between its and it's?","choices":["Its shows possession; it's means it is or it has","Its means it is; it's shows possession","The two spellings mean the same thing","Its is only used at the start of a sentence"],"answerIndex":0,"explanation":"Its is the possessive form, while it's is the contraction of it is or it has.","difficulty":4,"skill":"Choosing its or it's","topic":"Usage Debates and Style Guides"},{"id":"q35","prompt":"What does the phrase could not care less logically mean?","choices":["It means your caring fell to zero at some earlier point","It means you still care deeply but hide it well","It means you have no remaining care, so you could not care less","It is a phrase proper only to sports commentary"],"answerIndex":2,"explanation":"Could not care less means care has already dropped to zero, so no further drop is possible.","difficulty":6,"skill":"Analyzing idiomatic usage","topic":"Usage Debates and Style Guides"},{"id":"q3","prompt":"A school newspaper tells its writers to follow AP style. A writer is unsure whether to write Principal Rivera or Principal Rivera's office staff with singular they. What is the most reliable way to settle the choice?","choices":["Ending every list of three items with an Oxford comma, since that is the oldest convention","Referring to the principal as it, since singular they has not been accepted in print","Checking the guide the school assigns and following its rule consistently","Using whichever form appears more often on social media that week"],"answerIndex":2,"explanation":"A style guide resolves disputed conventions only for the publication or field that adopts it, so the assigned guide's rule should be applied consistently.","difficulty":5,"skill":"Applying a style guide to a real writing decision","topic":"Usage Debates and Style Guides"},{"id":"q8","prompt":"Which phrase is a split infinitive?","choices":["to run quickly upstairs","to open the door","to easily win the race","to swim every morning"],"answerIndex":3,"explanation":"In to easily win, the adverb easily sits between to and win, splitting the infinitive.","difficulty":5,"skill":"Identifying split infinitives","topic":"Usage Debates and Style Guides"},{"id":"q15","prompt":"Which guide is commonly used for academic and book publishing in the United States?","choices":["AP style","No style at all","Chicago style","Only spoken English"],"answerIndex":2,"explanation":"The Chicago Manual of Style is the guide often recommended for academic and book publishing.","difficulty":4,"skill":"Knowing major style guides","topic":"Usage Debates and Style Guides"},{"id":"q50","prompt":"Which disputed rule was famously criticized as a rule English speakers never actually followed?","choices":["Split infinitives banned from formal writing","Singular they accepted in modern style guides","hopefully used as a sentence adverb","Prepositions banned from sentence endings"],"answerIndex":3,"explanation":"The supposed ban on sentence-ending prepositions is the classic case of a rule that never matched how English is actually written.","difficulty":6,"skill":"Recalling classic usage debates","topic":"Usage Debates and Style Guides"},{"id":"q32","prompt":"Which sentence uses both than and then correctly?","choices":["Mia is taller than her brother, and then they walked to school.","Mia is taller then her brother, and than they walked to school.","Mia is taller than her brother, and than they walked to school.","Mia is taller then her brother, and then they walked to school."],"answerIndex":0,"explanation":"The comparison takes than, and the sequence of events takes then.","difficulty":5,"skill":"Choosing than or then","topic":"Usage Debates and Style Guides"},{"id":"q19","prompt":"How do disputed rules change over time?","choices":["Rules never change once printed","Rules change only through court rulings","Rules shift as common usage shifts over time","Rules change every January by decree"],"answerIndex":2,"explanation":"Style rules are conventions that evolve with the language community, so guides update their advice over time.","difficulty":4,"skill":"Understanding change in usage","topic":"Usage Debates and Style Guides"},{"id":"q45","prompt":"A student writes: We packed tents, lanterns, and snacks. Under which guide is this acceptable?","choices":["Correct because all dictionaries forbid the comma","Incorrect because the comma is banned everywhere","Acceptable under a guide like Chicago, though AP would omit it","Acceptable only in handwritten work"],"answerIndex":2,"explanation":"Chicago endorses the serial comma, so the sentence is fine under that guide even though AP would drop it.","difficulty":5,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q1","prompt":"What is a style guide?","choices":["A published set of rules and recommendations for writing in a certain field or publication","A dictionary of every word in the English language","A law that governs how all English may be written","A list of grammar mistakes that are always forbidden"],"answerIndex":0,"explanation":"A style guide is a published set of conventions a publication or field follows so its writing is consistent.","difficulty":3,"skill":"Defining style guides","topic":"Usage Debates and Style Guides"},{"id":"q9","prompt":"What is true about split infinitives?","choices":["It has been banned by every printed style guide ever issued","It is a mistake that would doom any sentence","It is acceptable in many modern writing styles","It marks careless typing rather than a question of style"],"answerIndex":0,"explanation":"Respected writers have split infinitives for centuries; the ban is a disputed rule, not an absolute error.","difficulty":5,"skill":"Judging disputed rules","topic":"Usage Debates and Style Guides"},{"id":"q4","prompt":"Which of these is a commonly disputed usage rule?","choices":["The Oxford comma","The period","The lowercase letter e","The question mark"],"answerIndex":3,"explanation":"The Oxford (serial) comma before and in a list is a famous ongoing usage debate.","difficulty":4,"skill":"Recognizing disputed rules","topic":"Usage Debates and Style Guides"},{"id":"q47","prompt":"Which item belongs in a section titled Usage Debates rather than outright errors?","choices":["Run-on sentences","Hopefully as a sentence adverb","Spelling library as libary","Writing a fragment with no verb"],"answerIndex":1,"explanation":"Hopefully as a sentence adverb is a debated convention; a misspelling or a fragment is an outright error.","difficulty":5,"skill":"Categorizing usage issues","topic":"Usage Debates and Style Guides"},{"id":"q14","prompt":"Why was hopefully as a sentence adverb once criticized?","choices":["Critics preferred the phrase it is hoped in every formal sentence","It became popular only after 1960, so critics saw it as slangy","Critics say a sentence adverb should describe how the subject acts, not the writer's hope","It clashed with the older adverb hopefully meaning in a hopeful way"],"answerIndex":1,"explanation":"Traditionalists object that hopefully as a sentence adverb does not logically modify the subject's action.","difficulty":6,"skill":"Explaining objections to disputed usage","topic":"Usage Debates and Style Guides"},{"id":"q33","prompt":"What is the traditional rule for fewer and less?","choices":["Fewer counts amounts; less counts numbers","Fewer and less are fully interchangeable","Less is always the formal choice","Fewer is used with countable nouns; less is used with amounts"],"answerIndex":3,"explanation":"Traditional usage pairs fewer with countable nouns and less with uncountable amounts.","difficulty":5,"skill":"Choosing fewer or less","topic":"Usage Debates and Style Guides"},{"id":"q30","prompt":"Which sentence is correct?","choices":["Your going to love this book.","You're going to love this book.","You're cover is covered in stickers.","Your ready when your friends arrive."],"answerIndex":1,"explanation":"You're going contracts you are going, so the apostrophe form is correct.","difficulty":4,"skill":"Choosing your or you're","topic":"Usage Debates and Style Guides"},{"id":"q40","prompt":"A style guide is most useful to a student writer because it...","choices":["It gives plots of famous books for students to summarize","It tells writers which choice to make when usage is disputed","It lists every synonym in the English language","It applies only to personal essays and journals"],"answerIndex":1,"explanation":"A style guide functions as a decision-maker: when usage is disputed, it supplies the recommended choice.","difficulty":5,"skill":"Applying a style guide","topic":"Usage Debates and Style Guides"},{"id":"q36","prompt":"Which version of the idiom is the one critics call illogical?","choices":["could care less","couldn't care lesser","can't care the least","not care least"],"answerIndex":0,"explanation":"Critics argue could care less is illogical, since zero care leaves no room to care less.","difficulty":6,"skill":"Analyzing idiomatic usage","topic":"Usage Debates and Style Guides"},{"id":"q49","prompt":"Which sentence best sums up the lesson on usage debates and style guides?","choices":["Style guides help writers make consistent choices where usage is genuinely disputed","Style guides prove that English has one right answer for everything","Style guides exist to punish writers who break old rules","Style guides only matter for people who write novels"],"answerIndex":0,"explanation":"The central idea is that guides bring consistency to contested usage rather than declaring absolute truth.","difficulty":5,"skill":"Summarizing the lesson","topic":"Usage Debates and Style Guides"},{"id":"q29","prompt":"What is the difference between your and you're?","choices":["Your shows possession; you're means you are","Your means you are; you're shows possession","They are interchangeable in any sentence","Your is only used in questions"],"answerIndex":0,"explanation":"Your is the possessive form, while you're contracts you are.","difficulty":4,"skill":"Choosing your or you're","topic":"Usage Debates and Style Guides"},{"id":"q31","prompt":"What is the difference between than and then?","choices":["Then refers to comparison; than refers to time","Then and than are spelled variants of one word","Than is used for comparisons; then is used for time or sequence","Then is only used after if"],"answerIndex":2,"explanation":"Than introduces comparisons, while then deals with time or sequence.","difficulty":5,"skill":"Choosing than or then","topic":"Usage Debates and Style Guides"},{"id":"q43","prompt":"Why might a style guide that once banned singular they later accept it?","choices":["Because modern usage shifted and the old ban looked outdated","Because printers could not fit the comma on the page","Because a law required the change","Because the comma was never printed in books before"],"answerIndex":0,"explanation":"Usage debates settle as common practice shifts, and guides update to reflect that shift.","difficulty":5,"skill":"Understanding change in usage","topic":"Usage Debates and Style Guides"},{"id":"q28","prompt":"Which sentence is correct?","choices":["The students left there backpacks in the hall.","The students left they're backpacks in the hall.","The students left their backpacks in the hall.","The students left theirs backpacks in the hall."],"answerIndex":2,"explanation":"The backpacks belong to the students, so the possessive their is needed.","difficulty":4,"skill":"Choosing their, there, or they're","topic":"Usage Debates and Style Guides"},{"id":"q7","prompt":"How does the AP Stylebook treat the serial comma when its omission would cause confusion?","choices":["AP is silent on the question, so either choice is equally standard.","Both guides forbid the final comma in a series.","AP adds the comma to prevent ambiguity; Chicago omits it.","The AP Stylebook requires the comma in all series."],"answerIndex":2,"explanation":"AP's core rule drops the serial comma but allows it when leaving it out would create ambiguity, unlike a blanket ban.","difficulty":6,"skill":"Applying a style guide to a real writing decision","topic":"Usage Debates and Style Guides"},{"id":"q24","prompt":"Which sentence uses the noun meaning result correctly?","choices":["His advice had a big affect on me.","His advice had a big affectation on me.","His advice had a big effect on me.","His advice had a big effected on me."],"answerIndex":2,"explanation":"The noun meaning a result is effect: the advice had a big effect.","difficulty":5,"skill":"Choosing affect or effect","topic":"Usage Debates and Style Guides"},{"id":"q10","prompt":"What does singular they mean?","choices":["They refers only to a group of people","They can refer to one person of unknown or unstated gender","They is never correct in formal writing","They always means more than ten people"],"answerIndex":1,"explanation":"Singular they uses they for one person whose gender is unknown or unstated.","difficulty":4,"skill":"Defining singular they","topic":"Usage Debates and Style Guides"},{"id":"q22","prompt":"Which sentence uses affect correctly?","choices":["The rain affected our travel plans.","The rain had a strange affect on the road.","We must effect our jackets before the hike.","The effect of the storm affecteded us."],"answerIndex":0,"explanation":"Here affected is the verb meaning influenced, which is the standard use of affect.","difficulty":5,"skill":"Choosing affect or effect","topic":"Usage Debates and Style Guides"},{"id":"q12","prompt":"How do style guides treat singular they today?","choices":["It is now accepted by many modern guides, though older guides resisted it","It is banned in every context by all guides","It may only be used in speech, never in print","It replaced all plural pronouns in 2010"],"answerIndex":0,"explanation":"Many modern style guides now accept singular they, showing usage debates evolve as practice shifts.","difficulty":5,"skill":"Tracking changing rules","topic":"Usage Debates and Style Guides"},{"id":"q46","prompt":"A sentence reads: We hoped to boldly explore the cave. What is the best assessment?","choices":["To boldly explore is always wrong, so the sentence must be rewritten","Only to explore boldly is allowed in any modern guide","To boldly explore is fine in most modern guides, but to explore boldly satisfies strict readers","Neither form is possible, so English cannot express this idea"],"answerIndex":0,"explanation":"Modern guides accept split infinitives, though the unsplit form still satisfies traditionalist readers.","difficulty":6,"skill":"Judging disputed usage in context","topic":"Usage Debates and Style Guides"},{"id":"q2","prompt":"Why do style guides exist?","choices":["So writers never have to make judgment calls","So writing within one publication is consistent, even where usage is disputed","Because style guides have the force of law","So readers know which country a writer is from"],"answerIndex":1,"explanation":"Style guides exist mainly for consistency: when usage is disputed, the guide picks one answer so the publication is uniform.","difficulty":4,"skill":"Purpose of style guides","topic":"Usage Debates and Style Guides"},{"id":"q11","prompt":"Which sentence uses singular they?","choices":["Somebody left they jacket in the gym.","Every student must submit their essay by Friday.","The dogs wagged their tails.","She finished her homework."],"answerIndex":2,"explanation":"In Every student must submit their essay, their refers to one student of unspecified gender: singular they.","difficulty":5,"skill":"Identifying singular they","topic":"Usage Debates and Style Guides"}],"feedback":{"correct":"Nice line through the gate! That's the right call on this usage debate.","incorrect":"Crashed on that one. Check what the style guide would say and hit the reset question.","win":"Five runs cleared! You can settle usage debates like a copyeditor now.","lose":"Six crashes banked. Review the disputed rules and take another timed try.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
    var CRASH_MAX = 6;
    var LEVELS_TOTAL = 5;
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
    // Every level is a fixed run of obstacles, each asking for one stunt. The
    // same level always asks the same stunts — the bike game is a skill check,
    // not a dice roll.
    var TRACKS = [
      ['jump', 'brake', 'jump', 'wheelie'],
      ['jump', 'brake', 'wheelie', 'jump'],
      ['wheelie', 'jump', 'brake', 'jump'],
      ['brake', 'jump', 'wheelie', 'brake'],
      ['jump', 'brake', 'jump', 'brake'],
    ];
    var OBSTACLES = ['Ramp', 'Gap', 'Spikes', 'Loop'];
    var STUNT_LABEL = { jump: 'Jump', wheelie: 'Wheelie', brake: 'Brake' };

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'),
      prompt: q('prompt'), choices: q('choices'), verdict: q('verdict'),
      board: q('board'), levellabel: q('levellabel'),
      levels: q('levels'), crashes: q('crashes'),
      modal: q('modal'), result: q('result'), endstats: q('endstats'), runs: q('runs'),
      restart: q('restart'), next: q('next'),
    };

    var state = null;

    function emit(name, detail) {
      var data = { source: 'moto-x3m', engineId: 'moto-x3m' };
      for (var k in detail) data[k] = detail[k];
      try {
        window.dispatchEvent(new CustomEvent('game:' + name, { detail: data }));
      } catch (err) { /* an engine must never break the page over telemetry */ }
    }

    function renderTrack() {
      var track = TRACKS[state.level - 1] || TRACKS[0];
      el.levellabel.textContent = 'Level ' + state.level + ' — segment ' + (state.seg + 1) + ' of ' + track.length;
      el.board.textContent = '';
      for (var i = 0; i < track.length; i++) {
        var row = document.createElement('div');
        row.className = 'mx-seg'
          + (i < state.seg ? ' mx-seg--done' : '')
          + (i === state.seg ? ' mx-seg--now' : '');
        row.setAttribute('role', 'listitem');
        var no = document.createElement('span');
        no.className = 'mx-seg-no';
        no.textContent = String(i + 1) + '.';
        var name = document.createElement('span');
        name.className = 'mx-seg-name';
        name.textContent = OBSTACLES[i] || 'Obstacle';
        var need = document.createElement('span');
        need.className = 'mx-seg-need';
        need.textContent = i < state.seg ? 'Cleared' : 'Needs ' + (STUNT_LABEL[track[i]] || track[i]);
        row.appendChild(no);
        row.appendChild(name);
        row.appendChild(need);
        row.setAttribute('aria-label', 'Segment ' + (i + 1) + ', ' + (OBSTACLES[i] || 'obstacle')
          + ', ' + (i < state.seg ? 'cleared' : 'needs ' + (STUNT_LABEL[track[i]] || track[i])));
        el.board.appendChild(row);
      }
      el.levels.textContent = String(state.cleared);
      el.crashes.textContent = String(state.crashes);
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
        btn.className = 'mx-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var key = document.createElement('span');
        key.className = 'mx-key';
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
      el.verdict.className = 'mx-verdict ' + (correct ? 'mx-verdict--good' : 'mx-verdict--bad');
      el.verdict.textContent = '';
      var strong = document.createElement('strong');
      strong.textContent = correct ? (feedback.correct || 'Correct — the level restarts.')
        : (feedback.incorrect || 'Incorrect — no restart yet.');
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
      // that decided the last one: a run that restarts after a crash continues
      // the set rather than repeating it. When the pool is finally spent it
      // wraps and the payload's own out-of-questions line says so.
      var next = GAME_CURSOR.next(QUESTIONS.length);
      state.item = QUESTIONS[next.index];
      state.qPos = next.index;
      state.qNo = next.index + 1;
      state.phase = 'question';
      state.qStartMs = Date.now();
      renderQuestion();
      renderTrack();
      el.status.textContent = next.wrapped
        ? (feedback.outOfQuestions || 'Out of questions — the set starts again.')
        : 'Answer correctly to restart the level and ride.';
    }

    function endGame(result) {
      state.phase = 'over';
      renderTrack();
      var message = result === 'win' ? (feedback.win || 'Five levels cleared — you win!')
        : result === 'lose' ? (feedback.lose || 'Six crashes — the bike is done.')
        : (feedback.draw || 'Run finished.');
      el.status.textContent = message;
      el.result.textContent = message;
      el.result.className = 'mx-result mx-result--' + result;
      el.endstats.textContent = 'You answered ' + state.correct + ' correct and ' + state.wrong
        + ' incorrect of ' + state.used + ' questions.';
      el.runs.textContent = 'You finished ' + state.cleared + ' level' + (state.cleared === 1 ? '' : 's')
        + ' and crashed ' + state.crashes + ' time' + (state.crashes === 1 ? '' : 's') + '.';
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

    function onCrash() {
      state.crashes += 1;
      renderTrack();
      if (state.crashes >= CRASH_MAX) return endGame('lose');
      el.status.textContent = 'Crash! Answer to restart the level.';
      askNext();
    }

    function onAnswer(index) {
      if (state.phase !== 'question') return;
      var item = state.item;
      var opts = (item.choices || []).slice(0, CHOICES);
      var correct = Number(item.answerIndex) === index;
      var buttons = el.choices.querySelectorAll('.mx-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 'mx-choice--right' : 'mx-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('mx-choice--right');
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
        // The restart: the level begins again from its first obstacle and the
        // rider picks stunts until the level is clear or the bike goes down.
        state.seg = 0;
        state.phase = 'ride';
        el.status.textContent = feedback.correct || 'Correct — the level restarts. Ride!';
        renderTrack();
      } else {
        // No restart yet — but the pool only ever moves forward.
        el.status.textContent = feedback.incorrect || 'Incorrect — no restart yet; a new question.';
        askNext();
      }
    }

    function onStunt(stunt) {
      if (state.phase !== 'ride') return;
      var track = TRACKS[state.level - 1] || TRACKS[0];
      var need = track[state.seg];
      if (stunt !== need) return onCrash();
      state.seg += 1;
      if (state.seg >= track.length) {
        state.cleared += 1;
        if (state.cleared >= LEVELS_TOTAL) return endGame('win');
        state.level = state.cleared + 1;
        state.seg = 0;
        el.status.textContent = 'Level ' + state.cleared + ' clear — riding on to level ' + state.level + '!';
      }
      renderTrack();
    }

    // ---- wire up a fresh round -------------------------------------------------
    //
    // The bike resets; the question cursor does not. "Play again" is another
    // run taken up at the next unseen question, never the same one twice.
    state = {
      level: 1, seg: 0, cleared: 0, crashes: 0,
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

    root.querySelectorAll('[data-game-stunt]').forEach(function (btn) {
      btn.onclick = function () { onStunt(btn.getAttribute('data-game-stunt')); };
    });
    el.choices.onclick = function (event) {
      var btn = event.target.closest ? event.target.closest('.mx-choice') : null;
      if (btn && !btn.disabled) onAnswer(Number(btn.dataset.index));
    };
    el.restart.onclick = function () { window.initGame(payload); };

    renderTrack();
    askNext();
    emit('start', { engineId: 'moto-x3m' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
