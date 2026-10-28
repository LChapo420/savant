
  /* Hangman — base engine.
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
   * Rules (per the game spec): each question's correct choice IS the hidden
   * one-word answer. Answer correctly and the letters of the hidden word fill
   * in (a word solved); answer incorrectly and the word stays hidden while a
   * new question is asked. Solve two words and the game is won.
   *
   * Events out (dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, correct, ms, questionIndex, chosen}
   *   game:win    {source, engineId, result, correct, wrong, questionsUsed}
   *   game:lose   {source, engineId, result, correct, wrong, questionsUsed}
   *   game:draw   {source, engineId, result, correct, wrong, questionsUsed}
   */
  window.GAME_ID = 'hangman';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"hangman","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":17,"topic":"Activity 7 of 9 (quiz/game): Write Your Own (Rubric Check) - Advanced Grammar Review","title":"Rubric Check: Advanced Grammar Review","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":8,"end":10,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q41","prompt":"A semicolon is best between independent clauses that are ___ related in meaning.","choices":["closely","casually","causally","coarsely"],"answerIndex":2,"explanation":"The semicolon is reserved for closely related clauses.","difficulty":9,"skill":"Fixing run-ons with a semicolon","topic":"Advanced Grammar Review"},{"id":"q10","prompt":"In your sentence 'Swimming across the lake exhausted her,' the word group 'Swimming across the lake' acts as a ___, because the -ing verb works as a noun.","choices":["participle","gerund","infinitive","adverb"],"answerIndex":1,"explanation":"A gerund is the -ing form of a verb used as a noun, so it can fill the subject slot and complete the thought.","difficulty":8,"skill":"Identifying -ing forms acting as nouns in student sentences","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q36","prompt":"Which subordinating word best completes '___ she was tired, she finished the race' to signal concession?","choices":["although","because","so","that"],"answerIndex":0,"explanation":"Although signals concession and attaches the dependent clause correctly.","difficulty":10,"skill":"Choosing subordinating words","topic":"Advanced Grammar Review"},{"id":"q12","prompt":"In the sentence 'The book that I borrowed was overdue,' the word ___ correctly introduces the restrictive clause.","choices":["that","which","who","whom"],"answerIndex":1,"explanation":"That introduces a restrictive relative clause, which takes no comma.","difficulty":9,"skill":"Using relative pronouns","topic":"Advanced Grammar Review"},{"id":"q8","prompt":"The clause beginning 'If the rain stops soon' is a ___ clause and must attach to a main clause.","choices":["relevant","subordinate","coordinate","compound"],"answerIndex":1,"explanation":"The subordinating conjunction if makes the clause dependent, so it cannot stand alone.","difficulty":8,"skill":"Recognizing dependent clauses","topic":"Advanced Grammar Review"},{"id":"q22","prompt":"In 'Important that everyone attends' the fragment can be fixed by adding a subject and finite verb, as in '___ important that everyone attends.'","choices":["their","there","theirs","it's"],"answerIndex":3,"explanation":"It's is the contraction of it is and provides the needed subject and finite verb.","difficulty":9,"skill":"Revising fragments","topic":"Advanced Grammar Review"},{"id":"q21","prompt":"A subordinate-clause fragment begins with a subordinating word such as because, when, although, or ___.","choices":["dependent","independent","relative","nominal"],"answerIndex":0,"explanation":"The word that introduces a dependent clause, making the group a fragment.","difficulty":8,"skill":"Recognizing dependent clauses","topic":"Advanced Grammar Review"},{"id":"q13","prompt":"A fragment fails one of three tests: it lacks a subject, a finite verb, or a ___ thought.","choices":["compliment","complement","complete","component"],"answerIndex":2,"explanation":"Complete thought is the standard third requirement of a sentence.","difficulty":9,"skill":"Testing for completeness","topic":"Advanced Grammar Review"},{"id":"q48","prompt":"When you revise your sentence 'Close the door' for the rubric, the finite verb 'close' carries the imperative ___, the form used for commands.","choices":["tensely","mood","voicedly","modally"],"answerIndex":1,"explanation":"Imperative sentences use the base form of the verb, which belongs to the imperative mood.","difficulty":8,"skill":"Matching verb form to sentence purpose","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q34","prompt":"In the review of tricky usage, the past tense of hang meaning to display is ___.","choices":["hanged","hunged","hung","hunging"],"answerIndex":2,"explanation":"Pictures are hung; only executions use hanged.","difficulty":10,"skill":"Tricky verb forms","topic":"Advanced Grammar Review"},{"id":"q16","prompt":"A verb that changes form to agree with its ___ and to show tense is called finite.","choices":["active","subject","predicate","object"],"answerIndex":1,"explanation":"A finite verb agrees with its subject and is marked for tense.","difficulty":9,"skill":"Identifying finite verbs","topic":"Advanced Grammar Review"},{"id":"q18","prompt":"The mnemonic FANBOYS lists the seven ___ conjunctions.","choices":["conjunction","adverb","preposition","pronoun"],"answerIndex":0,"explanation":"FANBOYS stands for the coordinating conjunctions.","difficulty":8,"skill":"Recalling FANBOYS","topic":"Advanced Grammar Review"},{"id":"q43","prompt":"Your rubric flags errors of subject-verb agreement: in 'The list of approved items ___ longer than expected,' the correct finite verb is ___.","choices":["are","is","were","seem"],"answerIndex":1,"explanation":"The subject of the sentence is the singular 'list', not the nearby plural 'items', so the finite verb must be 'is'.","difficulty":9,"skill":"Making the finite verb agree with its subject","topic":"Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q44","prompt":"A fragment is missing a subject, a verb, or a complete thought; 'Running through the park' lacks a ___.","choices":["subject","verb","object","modifier"],"answerIndex":1,"explanation":"Missing the verb is one of the three causes of a fragment.","difficulty":8,"skill":"Diagnosing fragments","topic":"Advanced Grammar Review"},{"id":"q47","prompt":"A sentence with two independent clauses and one dependent clause is classified by the rubric as ___-complex, the most elaborate of the four sentence types.","choices":["compound","complex","simplex","cumulative"],"answerIndex":0,"explanation":"A compound-complex sentence contains at least two independent clauses and at least one dependent clause.","difficulty":9,"skill":"Classifying sentence structures for the rubric","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q49","prompt":"In the tricky-usage review, the verb meaning to influence is ___.","choices":["affect","effect","effected","affecting"],"answerIndex":2,"explanation":"Affect is the verb; effect is the noun.","difficulty":10,"skill":"Tricky word pairs","topic":"Advanced Grammar Review"},{"id":"q29","prompt":"Your rubric checks that items in a list match in grammatical form, so 'she likes running, to swim, and cycling' fails because the list is not ___.","choices":["parallel","balanced","symmetrical","uniform"],"answerIndex":0,"explanation":"The rubric asks that items in a series share the same grammatical form, which is the definition of parallel structure.","difficulty":8,"skill":"Recognizing faulty parallelism in a student sentence","topic":"Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q35","prompt":"The rubric accepts fixing a dangling construction by rewriting it as a full clause; 'Running late, the bus was missed' becomes 'Running late, she missed the bus' once the ___ phrase finally modifies the right person.","choices":["phrase","clausule","predicate","modifier"],"answerIndex":2,"explanation":"A participial phrase begins with a present or past participle and modifies a noun, so it can be moved or rewritten as a full clause to fix errors.","difficulty":9,"skill":"Revising participial constructions","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q1","prompt":"The word group 'Because the bell rang before lunch' is a ____, since it cannot stand alone as a sentence.","choices":["conjunction","fragment","predicate","modifier"],"answerIndex":1,"explanation":"A fragment is a word group missing a subject, a finite verb, or a complete thought.","difficulty":8,"skill":"Identifying sentence fragments","topic":"Advanced Grammar Review"},{"id":"q23","prompt":"Which subordinating word fits '___ I read, my brother watched television' to show two actions happening at once?","choices":["although","while","until","unless"],"answerIndex":1,"explanation":"While signals simultaneous time, matching the meaning.","difficulty":9,"skill":"Choosing subordinating words","topic":"Advanced Grammar Review"},{"id":"q45","prompt":"Your rubric asks whether the finite verb takes a direct object; verbs like 'arrive' and 'sleep' that cannot take one are ___.","choices":["actives","passives","indirects","intransitives"],"answerIndex":3,"explanation":"An intransitive verb takes no direct object, so no passive form can be built from it.","difficulty":8,"skill":"Classifying verbs by object-taking","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q30","prompt":"A fused sentence differs from a comma splice because it has ___ any punctuation between the clauses.","choices":["with","without","under","toward"],"answerIndex":1,"explanation":"Fused means no punctuation between the clauses.","difficulty":9,"skill":"Distinguishing run-on types","topic":"Advanced Grammar Review"},{"id":"q25","prompt":"Which FANBOYS conjunction pairs with a negative clause: 'She neither apologized ___ explained'?","choices":["nor","or","so","for"],"answerIndex":0,"explanation":"Nor is the FANBOYS conjunction that pairs with negative statements.","difficulty":10,"skill":"Using coordinating conjunctions","topic":"Advanced Grammar Review"},{"id":"q11","prompt":"Besides a subject and a verb, a complete sentence must express a complete ___.","choices":["thought","phrase","clause","detail"],"answerIndex":0,"explanation":"A sentence needs a subject, a finite verb, and a complete thought.","difficulty":8,"skill":"Defining a complete sentence","topic":"Advanced Grammar Review"},{"id":"q31","prompt":"A word group with its own subject and finite verb is called a ___, which is what the rubric asks you to count in your sentence.","choices":["phrase","clause","predicate","fragment"],"answerIndex":1,"explanation":"A clause is a word group containing its own subject and verb, unlike a phrase.","difficulty":9,"skill":"Defining clauses for rubric checking","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q14","prompt":"Which subordinating word best completes '___ the game ended, we went home'? Time is the logical relationship.","choices":["when","which","whether","while"],"answerIndex":0,"explanation":"When is a subordinating conjunction; the others do not fit the meaning.","difficulty":9,"skill":"Choosing subordinating words","topic":"Advanced Grammar Review"},{"id":"q37","prompt":"One mark accepted for joining two closely related independent clauses, often with a dramatic pause, is the ___, as in 'He hesitated - then he answered.'","choices":["hyphen","slash","dash","bracket"],"answerIndex":2,"explanation":"A dash can set off the second of two independent clauses and is an accepted run-on repair when the second clause interrupts or adds emphasis.","difficulty":8,"skill":"Choosing punctuation to fix a run-on","topic":"Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q40","prompt":"Which subordinating word fits '___ you practice daily, you will not improve' to state a condition?","choices":["unless","until","although","because"],"answerIndex":1,"explanation":"Unless states a condition, matching the meaning.","difficulty":10,"skill":"Choosing subordinating words","topic":"Advanced Grammar Review"},{"id":"q17","prompt":"The error in 'We left early, the traffic was terrible' is called a comma ___ by most handbooks.","choices":["separated","splitted","spliced","sliced"],"answerIndex":2,"explanation":"Comma splice is the standard name for this error.","difficulty":9,"skill":"Naming the error","topic":"Advanced Grammar Review"},{"id":"q3","prompt":"In 'The storm passed; the skies cleared,' the mark that correctly joins the two independent clauses is the ___.","choices":["semicolon","colon","hyphen","comma"],"answerIndex":0,"explanation":"A semicolon correctly joins two closely related independent clauses with no conjunction.","difficulty":8,"skill":"Fixing run-ons with a semicolon","topic":"Advanced Grammar Review"},{"id":"q27","prompt":"Your rubric flags 'Walking to school, the rain soaked my shoes' as containing a ___ modifier, since nothing in the sentence is actually walking.","choices":["modifier","connector","complement","predicate"],"answerIndex":2,"explanation":"A dangling modifier has no logical word to modify, which is exactly what the rubric flags in such constructions.","difficulty":9,"skill":"Diagnosing modifiers with no logical target","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q2","prompt":"Joining two independent clauses with nothing but a comma creates an error called a comma ___.","choices":["splice","slip","split","slice"],"answerIndex":2,"explanation":"Two independent clauses joined by only a comma form a comma splice.","difficulty":8,"skill":"Identifying comma splices","topic":"Advanced Grammar Review"},{"id":"q38","prompt":"The rubric warns against vague pronoun reference: every pronoun in your sentence should point clearly to its ___, the noun it stands in for.","choices":["antecedent","ancestor","antonym","referent"],"answerIndex":0,"explanation":"An antecedent is the noun a pronoun refers back to, and rubric checks flag pronouns lacking a clear one.","difficulty":9,"skill":"Checking pronoun reference in own sentences","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q32","prompt":"A comma splice is a run-on error that has been ___ only with a comma.","choices":["splice","slip","shift","skip"],"answerIndex":0,"explanation":"The comma splice is a type of run-on error.","difficulty":8,"skill":"Identifying comma splices","topic":"Advanced Grammar Review"},{"id":"q50","prompt":"When revising your own writing, the two marks accepted for fixing a run-on between clauses are a period or ___ between them.","choices":["colons","commas","dashes","semicolons"],"answerIndex":3,"explanation":"Either a period or a semicolon is an accepted fix for a run-on between clauses.","difficulty":10,"skill":"Fixing run-ons","topic":"Advanced Grammar Review"},{"id":"q19","prompt":"Which subordinating word signals cause rather than time or contrast: 'She smiled ___ she won'?","choices":["unless","because","until","since"],"answerIndex":1,"explanation":"Because states a reason, matching cause and effect.","difficulty":9,"skill":"Choosing subordinating words","topic":"Advanced Grammar Review"},{"id":"q20","prompt":"A run-on can always be repaired by splitting it into separate sentences with ___ between the clauses.","choices":["phrases","clauses","periods","colons"],"answerIndex":2,"explanation":"A run-on can be fixed with a period or question mark between independent clauses.","difficulty":8,"skill":"Fixing run-ons with a period","topic":"Advanced Grammar Review"},{"id":"q9","prompt":"Which FANBOYS conjunction best completes 'He was exhausted ___ he kept running'? The contrast demands one specific connector.","choices":["but","so","or","yet"],"answerIndex":3,"explanation":"Yet is one of the FANBOYS conjunctions and fits a contrast about outcomes.","difficulty":9,"skill":"Using coordinating conjunctions","topic":"Advanced Grammar Review"},{"id":"q46","prompt":"Which FANBOYS conjunction completes 'The novel was long ___ it was gripping' to add a contrasted but connected idea? Only addition fits.","choices":["or","so","yet","and"],"answerIndex":3,"explanation":"And adds one idea to another.","difficulty":8,"skill":"Using coordinating conjunctions","topic":"Advanced Grammar Review"},{"id":"q24","prompt":"A run-on written with no punctuation at all is called a ___ sentence.","choices":["splice","comma","fused","mixed"],"answerIndex":2,"explanation":"A fused sentence joins clauses with no punctuation at all.","difficulty":9,"skill":"Identifying fused sentences","topic":"Advanced Grammar Review"},{"id":"q42","prompt":"The relative pronoun ___ correctly introduces 'the author ___ novel won the prize'.","choices":["which","who","whom","whose"],"answerIndex":3,"explanation":"Whose shows possession in a relative clause.","difficulty":10,"skill":"Using relative pronouns","topic":"Advanced Grammar Review"},{"id":"q7","prompt":"A run-on sentence occurs when two ___ clauses are joined with no punctuation between them.","choices":["independent","dependent","relative","infinitive"],"answerIndex":0,"explanation":"A fused run-on joins two independent clauses with no punctuation at all.","difficulty":8,"skill":"Identifying fused sentences","topic":"Advanced Grammar Review"},{"id":"q28","prompt":"In 'My brother, an avid chess player, won the tournament,' the phrase 'an avid chess player' is an ___, a renaming noun phrase set off by commas.","choices":["appositive","absolutive","possessive","subjunctive"],"answerIndex":0,"explanation":"An appositive is a noun phrase set beside another noun to rename it, usually set off by commas.","difficulty":9,"skill":"Labeling renaming noun phrases in own sentences","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q39","prompt":"Two or more independent clauses joined with no punctuation form a sentence error called a ___.","choices":["run-on","runover","runup","runoff"],"answerIndex":0,"explanation":"Run-on is the standard term for improperly joined independent clauses.","difficulty":8,"skill":"Identifying run-ons","topic":"Advanced Grammar Review"},{"id":"q5","prompt":"The word 'although' belongs to the class of ___ conjunctions, which begin dependent clauses.","choices":["coordinating","subordinating","correlative","indefinite"],"answerIndex":1,"explanation":"Subordinating conjunctions like because, although, and when turn clauses into dependent ones.","difficulty":9,"skill":"Classifying conjunctions","topic":"Advanced Grammar Review"},{"id":"q33","prompt":"In 'She hopes to win the debate,' the words 'to win' form an ___, the to-plus-verb construction the rubric asks you to label.","choices":["infinitive","participle","gerund","adjective"],"answerIndex":0,"explanation":"An infinitive is the base form of a verb preceded by to, functioning as a noun, adjective, or adverb.","difficulty":8,"skill":"Identifying to-plus-verb constructions","topic":"Activity 7 of 9: Write Your Own (Rubric Check) - Advanced Grammar Review"},{"id":"q15","prompt":"One accepted fix for a run-on is replacing the missing punctuation with a ___, if the clauses are closely related.","choices":["period","question","exclaim","colon"],"answerIndex":3,"explanation":"A semicolon is correct between closely related independent clauses.","difficulty":9,"skill":"Fixing run-ons","topic":"Advanced Grammar Review"},{"id":"q26","prompt":"In 'Everyone knows ___ the deadline was moved,' the noun clause requires the subordinating word ___.","choices":["which","that","what","who"],"answerIndex":1,"explanation":"The choice of that avoids the ambiguity of which and keeps the clause restrictive.","difficulty":10,"skill":"Using subordinating words","topic":"Advanced Grammar Review"},{"id":"q6","prompt":"Every complete sentence must contain a subject and a ___ verb marked for tense.","choices":["past","present","finite","passive"],"answerIndex":2,"explanation":"A complete sentence requires a finite verb, one marked for tense with a subject.","difficulty":8,"skill":"Defining a complete sentence","topic":"Advanced Grammar Review"},{"id":"q4","prompt":"Which word, placed after a comma, can correctly join two independent clauses in 'She studied hard ___ she passed the exam'?","choices":["although","because","unless","however"],"answerIndex":3,"explanation":"However is a conjunctive adverb, so it needs a semicolon or period, not just a comma, between independent clauses.","difficulty":9,"skill":"Choosing correct clause connectors","topic":"Advanced Grammar Review"}],"feedback":{"correct":"Nice catch — that word fits the rule exactly.","incorrect":"Not quite — check which choice follows the grammar rule being tested.","win":"Two words solved — you clearly know your advanced grammar review.","lose":"Keep reviewing those tricky usage rules and try again.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
    var GOAL = 2;
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'),
      prompt: q('prompt'), choices: q('choices'), verdict: q('verdict'),
      word: q('word'), solved: q('solved'), solvedwords: q('solvedwords'),
      modal: q('modal'), result: q('result'), endstats: q('endstats'),
      restart: q('restart'), next: q('next'),
    };

    var state = null;

    function emit(name, detail) {
      var data = { source: 'hangman', engineId: 'hangman' };
      for (var k in detail) data[k] = detail[k];
      try {
        window.dispatchEvent(new CustomEvent('game:' + name, { detail: data }));
      } catch (err) { /* an engine must never break the page over telemetry */ }
    }

    // The hidden word is the question's own correct answer: a one-word answer
    // that fills in when the learner picks it out of the four options.
    function wordOf(item) {
      var opts = (item.choices || []).slice(0, CHOICES);
      var text = opts[Number(item.answerIndex)];
      return text == null ? '' : String(text).trim();
    }

    function renderWord() {
      el.word.innerHTML = '';
      var word = state.word;
      for (var i = 0; i < word.length; i++) {
        var ch = word.charAt(i);
        var span = document.createElement('span');
        if (ch === ' ' || ch === '-' || ch === "'") {
          span.className = 'hm-gap';
          span.textContent = '\u00a0';
        } else {
          span.className = 'hm-slot' + (state.revealed ? ' hm-slot--open' : '');
          span.textContent = state.revealed ? ch : '_';
        }
        el.word.appendChild(span);
      }
      el.solved.textContent = String(state.solved);
    }

    function renderSolvedWords() {
      el.solvedwords.innerHTML = '';
      for (var i = 0; i < state.words.length; i++) {
        var chip = document.createElement('span');
        chip.className = 'hm-solved-item';
        chip.textContent = state.words[i];
        el.solvedwords.appendChild(chip);
      }
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
        btn.className = 'hm-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var key = document.createElement('span');
        key.className = 'hm-key';
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
      el.verdict.className = 'hm-verdict ' + (correct ? 'hm-verdict--good' : 'hm-verdict--bad');
      el.verdict.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = correct ? (feedback.correct || 'Correct — a word solved.') : (feedback.incorrect || 'Incorrect — the word stays hidden.');
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
      // that decided the last one: a round that restarts after a win continues
      // the set rather than repeating it. When the pool is finally spent it
      // wraps and the payload's own out-of-questions line says so.
      var next = GAME_CURSOR.next(QUESTIONS.length);
      state.item = QUESTIONS[next.index];
      state.qPos = next.index;
      state.qNo = next.index + 1;
      state.word = wordOf(state.item);
      state.revealed = false;
      state.phase = 'question';
      state.qStartMs = Date.now();
      renderQuestion();
      renderWord();
      el.status.textContent = next.wrapped
        ? (feedback.outOfQuestions || 'Out of questions — the set starts again.')
        : 'Answer correctly to fill in the hidden word.';
    }

    function endGame(result) {
      state.phase = 'over';
      var message = result === 'win' ? (feedback.win || 'You win!')
        : result === 'lose' ? (feedback.lose || 'Not this time.')
        : (feedback.draw || 'Draw game.');
      el.status.textContent = message;
      el.result.textContent = message;
      el.result.className = 'hm-result hm-result--' + result;
      el.endstats.textContent = 'You answered ' + state.correct + ' correct and ' + state.wrong
        + ' incorrect of ' + state.used + ' questions.';
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

    function onAnswer(index) {
      if (state.phase !== 'question') return;
      var item = state.item;
      var opts = (item.choices || []).slice(0, CHOICES);
      var correct = Number(item.answerIndex) === index;
      var buttons = el.choices.querySelectorAll('.hm-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 'hm-choice--right' : 'hm-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('hm-choice--right');
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
        // The letters fill in — this hidden word is solved.
        state.revealed = true;
        state.solved++;
        state.words.push(state.word);
        renderWord();
        renderSolvedWords();
        if (state.solved >= GOAL) {
          el.status.textContent = feedback.correct || 'Correct — the word is solved!';
          return endGame('win');
        }
        el.status.textContent = feedback.correct || 'Correct — the word is solved!';
      } else {
        // The word stays hidden; a new question (and a new hidden word) is asked.
        el.status.textContent = feedback.incorrect || 'Incorrect — the word stays hidden.';
      }
      askNext();
    }

    // ---- wire up a fresh round -------------------------------------------------
    //
    // The board resets; the question cursor does not. "Play again" is another
    // round taken up at the next unseen question, never the same one twice.
    state = {
      item: null, qPos: 0, qNo: 0, used: 0, correct: 0, wrong: 0,
      solved: 0, words: [], word: '', revealed: false,
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

    el.choices.onclick = function (event) {
      var btn = event.target.closest ? event.target.closest('.hm-choice') : null;
      if (btn && !btn.disabled) onAnswer(Number(btn.dataset.index));
    };
    el.restart.onclick = function () { window.initGame(payload); };

    renderSolvedWords();
    askNext();
    emit('start', { engineId: 'hangman' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
