
  /* Uno (question on draws) — base engine.
   *
   * The engine holds game logic only; every question, choice, explanation and
   * message arrives through window.GAME_DATA at the injection marker below.
   *
   * The rules (per the game spec): the table plays until the user faces a draw
   * — no playable card, a Draw Two, or a Wild Draw Four — and every draw is
   * gated by a question. Answer it correctly and the draw is cleared: one click
   * on the action button plays a card instead and the hand goes on. Answer it
   * incorrectly and the user draws as normal and a new question is asked. The
   * run lasts until 7 questions are answered, or the user finishes early and
   * the run is reported as a draw.
   *
   * Events out (dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, questionIndex, correct, chosen, ms}
   *   game:draw   {source, engineId, result, correct, wrong, questionsUsed}
   */
  window.GAME_ID = 'uno';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"uno","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":2,"topic":"Tester 2 of 9: Entry Check, Part 2 of 9","title":"Entry Check: Punctuation and Power Words","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":2,"end":5,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q39","prompt":"Which sentence correctly uses a semicolon?","choices":["The store was closed we went home.","The store was closed; we went home;","The store was closed, we went home.","The store was closed; we went home."],"answerIndex":3,"explanation":"The semicolon properly joins two closely related independent clauses.","difficulty":3,"skill":"Semicolons","topic":"Punctuation for Effect"},{"id":"q17","prompt":"Which word suggests the strongest emotion?","choices":["said","whispered","mumbled","shouted"],"answerIndex":3,"explanation":"Shouted has the strongest, most intense connotation of the speaking verbs listed.","difficulty":2,"skill":"Connotation and denotation","topic":"Punctuation for Effect"},{"id":"q36","prompt":"Which sentence correctly uses commas with a nonessential clause?","choices":["The book, that I borrowed, was overdue.","My brother, who lives in Denver, is visiting.","My brother who lives in Denver is visiting.","My brother who, lives in Denver, is visiting."],"answerIndex":1,"explanation":"The commas show the clause is extra information about one specific brother.","difficulty":4,"skill":"Commas with clauses","topic":"Punctuation for Effect"},{"id":"q10","prompt":"Which punctuation choice makes an extra detail feel like a quiet aside instead of a dramatic interruption?","choices":["A dash that adds a loud afterthought","A pair of parentheses that quietly tucks in an aside","A colon that announces the thought formally","A semicolon that links two balanced thoughts"],"answerIndex":1,"explanation":"Parentheses downplay an aside by making it quieter and less prominent than dashes or colons would.","difficulty":3,"skill":"Punctuation for effect","topic":"Entry Check 2: Punctuation for Effect through Latin and Greek Vocabulary"},{"id":"q11","prompt":"Which word contains the Greek root geo-, meaning earth?","choices":["geometry","thermal","pedal","hydroplane"],"answerIndex":0,"explanation":"Geo- is the Greek root for earth, so geometry originally means measuring the earth.","difficulty":2,"skill":"Greek roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q24","prompt":"Which sentence uses the most vivid word choice for an enormous, echoing house?","choices":["The house was large.","The house was big.","The house was cavernous.","The house was roomy."],"answerIndex":2,"explanation":"Cavernous suggests a hollow, echoing vastness, giving the strongest image.","difficulty":3,"skill":"Word choice for effect","topic":"Punctuation for Effect"},{"id":"q14","prompt":"Which root and meaning are correctly paired?","choices":["port-: carry","port-: sound","port-: city","port-: write"],"answerIndex":1,"explanation":"Port- is the Latin root meaning carry, as in transport and portable.","difficulty":2,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q30","prompt":"Based on the Greek root pol- (city), a metropolis is:","choices":["a city population","a group of stars","a crowd of people","a cluster of grapes"],"answerIndex":0,"explanation":"Pol- is the Greek root for city, so a metropolis is a major city.","difficulty":3,"skill":"Greek roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q35","prompt":"Which root and meaning are correctly paired?","choices":["hydr-: fire","hydr-: air","hydr-: water","hydr-: stone"],"answerIndex":2,"explanation":"Hydr- is the Greek root meaning water, as in hydrate and hydrant.","difficulty":2,"skill":"Greek roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q4","prompt":"Which sentence uses a dash for dramatic effect?","choices":["A colon before an incomplete fragment","A dash to interrupt with a dramatic extra thought","A comma splice between two clauses","A semicolon in place of a period"],"answerIndex":1,"explanation":"Dashes set off interruptions and afterthoughts to create a dramatic pause.","difficulty":3,"skill":"Dashes","topic":"Punctuation for Effect"},{"id":"q44","prompt":"Which punctuation mark best shows urgency in the sentence: Watch out?","choices":["Watch out!","Watch out.","Watch out?","Watch out:"],"answerIndex":0,"explanation":"An exclamation point conveys urgency and strong emotion in an urgent warning.","difficulty":1,"skill":"Exclamation points","topic":"Punctuation for Effect"},{"id":"q40","prompt":"Which Greek prefix means against?","choices":["amphi-","anti-","auto-","astro-"],"answerIndex":1,"explanation":"Anti- is the Greek prefix meaning against, as in antifreeze and antibody.","difficulty":2,"skill":"Greek roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q43","prompt":"The word manufacture contains the roots manu- and fact-. Based on manu- (hand), manufacture originally involved:","choices":["hands","fear","money","time"],"answerIndex":1,"explanation":"Man- comes from the Latin manus meaning hand, as in manual and manufacture.","difficulty":3,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q34","prompt":"A writer writes: I came to win, I came to prove them wrong. The comma before the repeated I is used:","choices":["to emphasize a contrast or repetition","to shorten the sentence","to fix a grammar error","to show the writer is confused"],"answerIndex":0,"explanation":"Repeating the pronoun after a comma creates a deliberate, emphatic echo.","difficulty":4,"skill":"Commas for effect","topic":"Punctuation for Effect"},{"id":"q5","prompt":"What is the connotation of a word?","choices":["A word that always sounds angry","A word's literal dictionary meaning","The feelings or associations a word carries","A word's grammatical part of speech"],"answerIndex":2,"explanation":"Connotation is the emotional association of a word beyond its literal meaning.","difficulty":2,"skill":"Connotation and denotation","topic":"Punctuation for Effect"},{"id":"q38","prompt":"Using the roots hydro- (water) and phobia (fear), the word hydrophobia means:","choices":["fear of books","love of names","fear of water","study of stars"],"answerIndex":2,"explanation":"Hydro- means water and phobia means fear, so hydrophobia is fear of water.","difficulty":3,"skill":"Greek roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q41","prompt":"Punctuation for effect means:","choices":["a free choice of strong vocabulary words","using the same punctuation mark throughout","punctuation that shapes how a reader hears the sentence","adding punctuation only when grammar requires it"],"answerIndex":0,"explanation":"Punctuation for effect means choosing marks deliberately to control rhythm, pause, and emphasis.","difficulty":3,"skill":"Punctuation for Effect","topic":"Punctuation for Effect"},{"id":"q1","prompt":"Which sentence correctly joins two complete thoughts with a semicolon?","choices":["She ran to the door, she grabbed her coat.","She ran to the door; she grabbed her coat.","She ran to the door, and she grabbed her coat, and she left.","She ran to the door she grabbed her coat."],"answerIndex":1,"explanation":"A semicolon correctly joins two independent clauses without a conjunction.","difficulty":2,"skill":"Joining independent clauses","topic":"Punctuation for Effect"},{"id":"q48","prompt":"Which sentence uses commas correctly in a series with an interrupter?","choices":["The answers were obvious, clear, and, frankly, hard to miss.","The answers were obvious clear and frankly hard to miss.","The answers were obvious, clear and, frankly hard, to miss.","The answers were obvious clear, and frankly, hard to miss."],"answerIndex":0,"explanation":"The commas correctly separate list items and set off the interrupter frankly.","difficulty":5,"skill":"Commas in series","topic":"Punctuation for Effect"},{"id":"q13","prompt":"An apostrophe can be used in informal writing to:","choices":["To show a sudden change in volume","To mark the title of a book","To signal missing letters in informal writing","To end a question politely"],"answerIndex":2,"explanation":"An apostrophe standing alone shows omitted letters, as in gonna for going to.","difficulty":3,"skill":"Apostrophes","topic":"Punctuation for Effect"},{"id":"q49","prompt":"Which root and meaning are correctly paired?","choices":["bene-: bad","bene-: good","bene-: big","bene-: birth"],"answerIndex":1,"explanation":"Bene- is the Latin root meaning good or well, as in benefit and benevolent.","difficulty":2,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q33","prompt":"Which word is closest in connotation to frugal?","choices":["brave","stingy","generous","thrifty"],"answerIndex":3,"explanation":"Thrifty and frugal share a positive meaning about careful spending; stingy is negative.","difficulty":3,"skill":"Connotation and denotation","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q20","prompt":"A writer wants to interrupt a sentence suddenly with a surprising extra detail. Which punctuation choice best creates that effect?","choices":["An exclamation point after every sentence","A question mark after a statement","A dash to interrupt the sentence with an afterthought","A comma where a period belongs"],"answerIndex":2,"explanation":"A well-placed dash creates a deliberate interruption and adds emphasis.","difficulty":4,"skill":"Dashes","topic":"Punctuation for Effect"},{"id":"q26","prompt":"Which word contains the Latin root aud-, meaning to hear?","choices":["audio","visible","manual","oral"],"answerIndex":0,"explanation":"Aud- is the Latin root meaning hear, so audio relates to sound you hear.","difficulty":2,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q29","prompt":"The word frugal comes from the Latin root frug-, meaning to manage economically. A frugal person is:","choices":["fragile","weak","thrifty","scared"],"answerIndex":1,"explanation":"Frug- means manage economically, so frugal describes careful saving.","difficulty":3,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q42","prompt":"Which root and meaning are correctly paired?","choices":["mort-: mind","mort-: mother","mort-: death","mort-: move"],"answerIndex":2,"explanation":"Mort- is the Latin root meaning death, as in mortal and mortuary.","difficulty":2,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q12","prompt":"Which word has a negative connotation compared to the others?","choices":["lively","cheerful","careful","solemn"],"answerIndex":3,"explanation":"Somber carries a gloomy connotation, unlike the more positive other options.","difficulty":3,"skill":"Connotation and denotation","topic":"Punctuation for Effect"},{"id":"q16","prompt":"What does the Greek prefix tele- mean?","choices":["tele-: land","tele-: small","tele-: far","tele-: light"],"answerIndex":2,"explanation":"Tele- is the Greek prefix meaning far or distant, as in telephone and telescope.","difficulty":2,"skill":"Greek roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q50","prompt":"Which word choice gives a description the most negative connotation?","choices":["The story was dull, dull, dull.","The story was dull.","The story was mind-numbingly tedious.","The story was not interesting."],"answerIndex":2,"explanation":"Mind-numbingly tedious carries the strongest negative connotation of the choices.","difficulty":3,"skill":"Connotation and denotation","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q22","prompt":"Which sentence should end with a period, not a question mark?","choices":["Where did you put the keys?","What a great surprise!","He asked if I was coming.","'Did she say,' he paused, 'that we won?'"],"answerIndex":3,"explanation":"An indirect question is a statement, so it ends with a period, not a question mark.","difficulty":4,"skill":"Question marks","topic":"Punctuation for Effect"},{"id":"q37","prompt":"Which root and meaning are correctly paired?","choices":["spect-: look","spect-: under","spect-: carry","spect-: break"],"answerIndex":0,"explanation":"Spect- is the Latin root meaning look or see, as in inspect and spectator.","difficulty":2,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q15","prompt":"Which sentence correctly sets off an interrupting phrase with commas?","choices":["The dog, muddy and proud, trotted inside.","The dog, trotted inside, muddy and proud.","The dog muddy and proud, trotted inside.","The dog muddy, and proud trotted inside."],"answerIndex":0,"explanation":"The commas correctly set off the interrupting phrase from the rest of the sentence.","difficulty":3,"skill":"Commas for interruption","topic":"Punctuation for Effect"},{"id":"q32","prompt":"Which prefix means under or below?","choices":["re-","pre-","sub-","trans-"],"answerIndex":1,"explanation":"Sub- means under or below, as in subway and submarine.","difficulty":2,"skill":"Prefixes","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q3","prompt":"The word contradict contains the Latin root dict-, meaning say. To contradict someone is to:","choices":["smile","greet","scold","praise"],"answerIndex":2,"explanation":"The Latin root dict- means say or speak, and the prefix con- here means against.","difficulty":3,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q25","prompt":"What is the primary job of an apostrophe?","choices":["To join two complete sentences","To show possession or missing letters","To signal a long pause","To end every exclamatory sentence"],"answerIndex":1,"explanation":"Apostrophes mark possession and contractions, where letters are omitted.","difficulty":1,"skill":"Apostrophes","topic":"Punctuation for Effect"},{"id":"q8","prompt":"Which sentence contains a comma splice?","choices":["The report was finished, we submitted it on time.","The report was finished; we submitted it on time.","The report was finished, and, we submitted it on time.","The report was finished, however we submitted it on time."],"answerIndex":2,"explanation":"A comma splice joins two complete thoughts with only a comma, while a semicolon or comma plus a conjunction is correct.","difficulty":3,"skill":"Joining clauses correctly","topic":"Entry Check 2: Punctuation for Effect through Latin and Greek Vocabulary"},{"id":"q31","prompt":"Which sentence has a hesitant tone created by its punctuation?","choices":["firm and certain","loud and excited","hesitant and unfinished","joyful and relaxed"],"answerIndex":2,"explanation":"An ellipsis makes the line trail off, suggesting hesitation or being cut short.","difficulty":2,"skill":"Ellipses","topic":"Punctuation for Effect"},{"id":"q23","prompt":"Which root means good or well?","choices":["bene-","mal-","dict-","vis-"],"answerIndex":0,"explanation":"Ben- comes from bene-, the Latin root meaning good or well.","difficulty":3,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q18","prompt":"Which sentence correctly uses a colon to introduce a list?","choices":["The winner was, announced at noon.","My favorite subjects are these: history, art, and biology.","My favorite subjects: are history, art, and biology.","My favorite subjects are, history, art, and biology."],"answerIndex":1,"explanation":"The colon correctly introduces the list after a complete clause.","difficulty":2,"skill":"Colons","topic":"Punctuation for Effect"},{"id":"q47","prompt":"Which sentence uses the word curious in its most common sense, meaning eager to know?","choices":["The French teacher used curious: a word borrowed from Latin.","The curious student wondered how Latin words travel into English.","We spent a curious afternoon tracing words back to Greek.","English is curious in that it borrowed heavily from Latin and Greek."],"answerIndex":0,"explanation":"The student feels curiosity about a question, so curious fits that sentence and not the others.","difficulty":4,"skill":"Precision with borrowed words","topic":"Entry Check 2: Punctuation for Effect through Latin and Greek Vocabulary"},{"id":"q27","prompt":"In the sentence: The plan, honestly, sounded risky. The commas around honestly create:","choices":["long pauses, like an ellipsis","shouting, like an exclamation point","an interruption from inside the sentence","a list that follows"],"answerIndex":2,"explanation":"Interrupting commas set off extra information, briefly pausing the main thought.","difficulty":3,"skill":"Commas for interruption","topic":"Punctuation for Effect"},{"id":"q28","prompt":"Which root and meaning are correctly paired?","choices":["chron-: order","graph-: time","ped-: foot","graph-: write"],"answerIndex":3,"explanation":"Graph- is the Greek root meaning write, as in autograph and paragraph.","difficulty":2,"skill":"Greek roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q2","prompt":"Based on the Greek root log- (word, speech), a logophile is most likely someone who:","choices":["collected","wrote about","feared","moved away from"],"answerIndex":0,"explanation":"The Greek root log- means word or speech, so a logophile loves words.","difficulty":3,"skill":"Greek roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q6","prompt":"In dialogue, an ellipsis (...) most often signals:","choices":["It builds a pause of uncertainty, like speech trailing off","It ends a sentence more firmly than a period","It replaces a question mark in dialogue","It shows that the writer made an error"],"answerIndex":0,"explanation":"An ellipsis signals trailing speech or an unfinished thought, creating hesitation.","difficulty":2,"skill":"Ellipses","topic":"Punctuation for Effect"},{"id":"q45","prompt":"Which prefix and meaning are correctly paired?","choices":["in-: not","in-: into","ex-: out","ex-: before"],"answerIndex":2,"explanation":"Ex- means out of, as in exit and export.","difficulty":3,"skill":"Prefixes","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q46","prompt":"Which root and meaning are correctly paired?","choices":["ben-: good","chron-: time","dict-: say","anim-: life"],"answerIndex":3,"explanation":"An animated film is full of life, and the root anim- means life or spirit.","difficulty":4,"skill":"Latin and Greek roots","topic":"Entry Check 2: Punctuation for Effect through Latin and Greek Vocabulary"},{"id":"q7","prompt":"Which root and meaning are correctly paired?","choices":["chron-: sleep","chron-: earth","chron-: heart","chron-: time"],"answerIndex":3,"explanation":"Chron- is the Greek root for time, as in chronology and chronic.","difficulty":2,"skill":"Greek roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q9","prompt":"The word fervid comes from the Latin root ferv-, meaning to boil. A fervid speech is:","choices":["immortal","unfamiliar","boiling hot","greatly feared"],"answerIndex":2,"explanation":"The Latin root ferv- means boil or burn, so fervid means intensely hot or passionate.","difficulty":3,"skill":"Latin roots","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q21","prompt":"What does the prefix mis- mean in a word like misspell?","choices":["mis-: many","mis-: wrongly","mis-: before","mis-: again"],"answerIndex":1,"explanation":"The prefix mis- means wrongly or badly, as in misspell and mislead.","difficulty":2,"skill":"Prefixes","topic":"Advanced Vocabulary: Latin and Greek"},{"id":"q19","prompt":"Based on the root arch- (ancient, chief), an antiquarian studies:","choices":["a person who studies the past","an old-fashioned object","a fear of history","a brand-new discovery"],"answerIndex":0,"explanation":"Arch- means ancient or chief; an antiquarian deals with old, historical things.","difficulty":3,"skill":"Latin and Greek roots","topic":"Advanced Vocabulary: Latin and Greek"}],"feedback":{"correct":"Clean draw — you knew that one.","incorrect":"Not quite — the cards come out of the deck.","win":"You cleared the entry check — skip ahead and keep only your spaced review.","lose":"The bot sheds first this time. Another run will sharpen those entry-check skills.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
    var QUESTS_TO_END = 7;
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
    /* The draws the user can face. Which one shows up is decided here, by the
     * turn number only — the cards never touch the question flow. */
    var DRAWS = [
      { text: 'You have no playable card — you must draw 1.', n: 1, color: '#f87171', top: 'Blue 9' },
      { text: 'The bot dropped a Draw Two — you must draw 2.', n: 2, color: '#fbbf24', top: 'Yellow Draw Two' },
      { text: 'The bot played Wild Draw Four — you must draw 4.', n: 4, color: '#a78bfa', top: 'Wild Draw Four' },
    ];

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'), prompt: q('prompt'),
      choices: q('choices'), verdict: q('verdict'), hand: q('hand'), bothand: q('bothand'),
      top: q('top'), reason: q('reason'), answered: q('answered'), cleared: q('cleared'),
      action: q('action'), end: q('end'),
      modal: q('modal'), result: q('result'), endstats: q('endstats'),
      restart: q('restart'), next: q('next'),
    };

    var state = null;

    function emit(name, detail) {
      var data = { source: 'uno', engineId: 'uno' };
      for (var k in detail) data[k] = detail[k];
      try {
        window.dispatchEvent(new CustomEvent('game:' + name, { detail: data }));
      } catch (err) { /* an engine must never break the page over telemetry */ }
    }

    function renderQuestion() {
      var item = state.item;
      el.prompt.textContent = item.prompt || '';
      el.counter.textContent = 'Question ' + state.qNo + ' of ' + TOTAL;
      el.choices.innerHTML = '';
      var opts = (item.choices || []).slice(0, CHOICES);
      for (var i = 0; i < opts.length; i++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'u-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var key = document.createElement('span');
        key.className = 'u-key';
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
      el.verdict.className = 'u-verdict ' + (correct ? 'u-verdict--good' : 'u-verdict--bad');
      el.verdict.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = correct ? (feedback.correct || 'Correct — the draw is cleared.') : (feedback.incorrect || 'Incorrect — you draw as normal.');
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

    function renderTable() {
      el.hand.textContent = String(state.hand);
      el.bothand.textContent = String(state.bot);
      el.answered.textContent = String(state.used);
      el.cleared.textContent = String(state.cleared);
    }

    function askNext() {
      // The cursor decides which question this is, and it is the same cursor
      // that decided the last one: a run that restarts after the round ends
      // continues the set rather than repeating it. When the pool is finally
      // spent it wraps and the payload's own out-of-questions line says so.
      var next = GAME_CURSOR.next(QUESTIONS.length);
      state.item = QUESTIONS[next.index];
      state.qPos = next.index;
      state.qNo = next.index + 1;
      state.phase = 'question';
      state.qStartMs = Date.now();
      var draw = DRAWS[state.used % DRAWS.length];
      state.draw = draw;
      el.top.textContent = draw.top;
      el.top.style.background = draw.color;
      el.reason.textContent = draw.text;
      renderQuestion();
      el.verdict.hidden = true;
      el.action.disabled = true;
      renderTable();
      el.status.textContent = next.wrapped
        ? (feedback.outOfQuestions || 'Out of questions — the set starts again.')
        : 'Answer to clear the draw.';
    }

    function endGame(result) {
      state.phase = 'over';
      var message = result === 'win' ? (feedback.win || 'You win!')
        : result === 'lose' ? (feedback.lose || 'The run is over.')
        : (feedback.draw || 'Finished.');
      el.status.textContent = message;
      el.result.textContent = message;
      el.result.className = 'u-result u-result--' + result;
      el.endstats.textContent = 'You answered ' + state.correct + ' correct and ' + state.wrong
        + ' incorrect of ' + state.used + ' questions, with ' + state.cleared + ' draws cleared.';
      el.modal.dataset.open = 'true';
      emit(result, {
        result: result,
        correct: state.correct,
        wrong: state.wrong,
        questionsUsed: state.used,
      });
      el.restart.focus();
    }

    function finishTurn() {
      // The spec's end condition: the run lasts until 7 questions are answered.
      if (state.used >= QUESTS_TO_END) endGame('draw');
      else askNext();
    }

    function onAnswer(index) {
      if (state.phase !== 'question') return;
      var item = state.item;
      var opts = (item.choices || []).slice(0, CHOICES);
      var correct = Number(item.answerIndex) === index;
      var buttons = el.choices.querySelectorAll('.u-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 'u-choice--right' : 'u-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('u-choice--right');
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
        // The draw is cleared: the play is ready and waiting for one click.
        state.phase = 'ready';
        el.status.textContent = feedback.correct || 'Correct — the draw is cleared.';
        el.action.disabled = false;
        renderTable();
      } else {
        // The user draws as normal and the table plays on to the next draw.
        state.hand += state.draw ? state.draw.n : 1;
        state.bot = Math.max(1, state.bot - 1);
        renderTable();
        el.status.textContent = feedback.incorrect || 'Incorrect — you draw as normal.';
        finishTurn();
      }
    }

    function playCard() {
      if (state.phase !== 'ready') return;
      state.phase = 'playing';
      el.action.disabled = true;
      // The pending draw is cleared and the user plays a card instead.
      state.hand = Math.max(1, state.hand - 1);
      state.bot = Math.max(1, state.bot - 1);
      state.cleared++;
      renderTable();
      el.status.textContent = 'Draw cleared — you played a card. ' + state.hand + ' left in hand.';
      finishTurn();
    }

    function finish() {
      if (state.phase === 'over') return;
      // Optional early finish: the run simply stops, reported as a draw.
      endGame('draw');
    }

    // ---- wire up a fresh run ---------------------------------------------------
    //
    // The table resets; the question cursor does not. "Play again" is another
    // run taken up at the next unseen question, never the same one twice.
    state = {
      item: null, qPos: 0, qNo: 0, used: 0, correct: 0, wrong: 0,
      hand: 7, bot: 7, cleared: 0, draw: null, phase: 'question', qStartMs: 0,
    };
    el.modal.dataset.open = 'false';
    el.verdict.hidden = true;
    el.hand.textContent = '7';
    el.bothand.textContent = '7';
    el.answered.textContent = '0';
    el.cleared.textContent = '0';
    el.topic.textContent = meta.topic ? String(meta.topic) : '';
    el.topic.hidden = !meta.topic;
    // Where "Next level" goes is the page's to say, not the engine's: without a
    // door handed in from outside, the button stays out of the way.
    el.next.hidden = true;
    if (window.PolymathGame && window.PolymathGame.nextLevelUrl) {
      el.next.href = window.PolymathGame.nextLevelUrl;
      el.next.hidden = false;
    }

    el.choices.onclick = function (event) {
      var btn = event.target.closest ? event.target.closest('.u-choice') : null;
      if (btn && !btn.disabled) onAnswer(Number(btn.dataset.index));
    };
    el.action.onclick = playCard;
    el.end.onclick = finish;
    el.restart.onclick = function () { window.initGame(payload); };

    askNext();
    emit('start', { engineId: 'uno' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
