
  /* Connect Four — base engine.
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
   * Rules (per the game spec): a question is asked; answer it correctly and you
   * drop a token into any column you choose, answer it incorrectly and the bot
   * drops instead. The game runs until someone connects four or the board is
   * full (draw).
   *
   * Events out (dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, correct, ms, questionIndex}
   *   game:win    {source, engineId, result, correct, wrong, questionsUsed}
   *   game:lose   {source, engineId, result, correct, wrong, questionsUsed}
   *   game:draw   {source, engineId, result, correct, wrong, questionsUsed}
   */
  window.GAME_ID = 'connect-four';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"connect-four","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":22,"topic":"Activity 2 of 9 (quiz/game): Guided Fill-In - Advanced Syntax and Sentence Craft","title":"Fill-In: Advanced Syntax and Sentence Craft","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":2,"end":5,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q7","prompt":"Fill in the blank: A reader can recognize a periodic sentence because ______.","choices":["its main clause comes last, so the meaning stays hidden until the final words","its details come first and its opening words carry the full main idea","its halves mirror each other with matching grammatical forms","its extra phrases trail after the main clause like an afterthought"],"answerIndex":0,"explanation":"Saving the main clause for the end keeps the reader waiting, which builds suspense and throws emphasis onto the final words.","difficulty":3,"skill":"Identifying sentence types","topic":"Advanced Syntax and Sentence Craft"},{"id":"q14","prompt":"[Fill in the blank] Why is 'Because she was late' a fragment rather than a complete sentence? The best reason is ______.","choices":["It is a fragment because it is too short.","It is a run-on because it has two clauses.","It is a balanced sentence because it mirrors ideas.","It is a fragment because it lacks a subject and a finite verb."],"answerIndex":3,"explanation":"Shortness is not the problem; a fragment is missing a subject or a verb, so it cannot stand alone.","difficulty":2,"skill":"Identifying fragments","topic":"Advanced Syntax and Sentence Craft"},{"id":"q38","prompt":"Rewrite for suspense: We went quickly to the store. Fill in the blank: The periodic version is ______.","choices":["To the store we went, and the bags were carried by us.","To the store we went quickly.","We went to the store, and we carried the bags quickly.","We went quickly, and we carried the bags to the store."],"answerIndex":3,"explanation":"Placing 'To the store' first holds back 'we went' until later, giving the periodic shape.","difficulty":4,"skill":"Building periodic sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q24","prompt":"[Fill in the blank] A sentence is periodic when ______.","choices":["its clauses are all dependent","its parts mirror each other exactly","it delays its main clause until the very end","it has no modifiers"],"answerIndex":2,"explanation":"Delaying the independent clause to the end is the defining move of the periodic sentence.","difficulty":3,"skill":"Explaining sentence structures","topic":"Advanced Syntax and Sentence Craft"},{"id":"q40","prompt":"If it rains tomorrow, since we cannot reschedule the picnic. Fill in the blank: The problem with this group of words is ______.","choices":["Missing subject and verb","Two clauses joined by no punctuation","Unbalanced parallel halves","Modifiers placed before the main clause"],"answerIndex":1,"explanation":"The whole sentence depends on the unfinished 'if' clause, so it has no independent clause anywhere in it.","difficulty":2,"skill":"Diagnosing fragments","topic":"Advanced Syntax and Sentence Craft"},{"id":"q50","prompt":"[Fill in the blank] A fused run-on is ______.","choices":["two independent clauses joined by a comma alone","two independent clauses joined by a semicolon instead","two independent clauses joined with no punctuation between them","two dependent clauses joined by a subordinating word"],"answerIndex":1,"explanation":"The hardest run-on fuses two independent clauses with nothing at all between them.","difficulty":3,"skill":"Identifying run-ons","topic":"Advanced Syntax and Sentence Craft"},{"id":"q2","prompt":"[Fill in the blank] The chief effect of a periodic sentence is ______.","choices":["suspense with emphasis at the end","suspense with emphasis at the start","immediate clarity with trailing detail","perfect mirroring of two equal ideas"],"answerIndex":1,"explanation":"Periodic sentences build suspense and save their main point, and their strongest emphasis, for the very end.","difficulty":2,"skill":"Explaining sentence effects","topic":"Advanced Syntax and Sentence Craft"},{"id":"q30","prompt":"Is this correct: The bell rang, the students left. [Fill in the blank] The right judgment is ______.","choices":["Yes, the second clause explains the first.","Yes, because it is a long sentence.","No, two independent clauses cannot be joined by a comma alone.","No, because the subject changes."],"answerIndex":2,"explanation":"Two independent clauses joined only by a comma make a comma splice, even when the second explains the first.","difficulty":3,"skill":"Identifying comma splices","topic":"Advanced Syntax and Sentence Craft"},{"id":"q28","prompt":"[Fill in the blank] The best definition of a fragment is ______.","choices":["not my kind of weather","a sentence with two independent clauses and no punctuation","a clause that mirrors another clause","a word group missing a subject or verb"],"answerIndex":3,"explanation":"A fragment is a word group that lacks a subject or a verb and so is not a complete sentence.","difficulty":2,"skill":"Defining fragments","topic":"Advanced Syntax and Sentence Craft"},{"id":"q22","prompt":"Fill in the blank: The advantage of a cumulative sentence over a periodic one is that ______.","choices":["it lets the sentence breathe and pile up details without ever losing the main point","it hides the main idea so the reader feels suspense at the end","it forces every clause to mirror its neighbor in parallel form","it removes the need for any punctuation between clauses"],"answerIndex":0,"explanation":"A cumulative sentence states its point first, so any trailing details simply enrich an idea the reader already holds.","difficulty":4,"skill":"Comparing sentence types","topic":"Advanced Syntax and Sentence Craft"},{"id":"q39","prompt":"After the last exam, after the final bell, summer began. / After the last exam, after the final bell, summer began., what kind of sentence is this? [Fill in the blank] This is ______.","choices":["cumulative, because it opens with detail","periodic, because the main clause comes last","balanced, because it mirrors ideas","a fragment, because it lacks a subject"],"answerIndex":1,"explanation":"The independent clause waits until the end, so this sentence is periodic.","difficulty":3,"skill":"Identifying sentence patterns","topic":"Advanced Syntax and Sentence Craft"},{"id":"q19","prompt":"Fix this comma splice: The movie ended, we went home. [Fill in the blank] Replace the comma with ______.","choices":["insert a comma before the subject","delete one of the verbs","add a coordinating conjunction after the comma","replace the comma with a semicolon"],"answerIndex":3,"explanation":"A semicolon correctly joins two independent clauses, fixing the comma splice.","difficulty":2,"skill":"Revising run-ons","topic":"Advanced Syntax and Sentence Craft"},{"id":"q43","prompt":"Fill in the blank: The quickest fix for a fused run-on like 'The lights dimmed the show began' is ______.","choices":["splitting them with a semicolon","lowercasing the second clause","adding a period between them","adding a comma after the second clause"],"answerIndex":2,"explanation":"Separate the two independent clauses with a period to make two complete sentences.","difficulty":3,"skill":"Fixing run-ons","topic":"Advanced Syntax and Sentence Craft"},{"id":"q41","prompt":"Fix: Whistling a tune on his way to school. [Fill in the blank] To make it complete, ______.","choices":["Attach it to the nearest sentence with a colon.","Add a comma after the opening phrase.","Give it a subject and a verb.","Rewrite it as a question."],"answerIndex":2,"explanation":"Fragments are fixed by supplying a subject and a verb to complete the thought.","difficulty":2,"skill":"Revising fragments","topic":"Advanced Syntax and Sentence Craft"},{"id":"q12","prompt":"[Fill in the blank] To pair matching halves in a balanced sentence, both halves need ______.","choices":["irregular phrasing on both sides","matching grammatical forms in both halves","a question followed by an answer","as many modifiers as possible"],"answerIndex":1,"explanation":"Balance depends on parallel structure: each half uses the same grammatical pattern.","difficulty":3,"skill":"Building balanced sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q47","prompt":"Fill in the blank: A fragment can never be a cumulative sentence because a cumulative sentence must ______.","choices":["begins with an independent clause","ends with a dependent clause first","saves the main idea until the end","fragments are never cumulative"],"answerIndex":3,"explanation":"A cumulative sentence must begin with a complete main clause, so a fragment cannot be cumulative.","difficulty":4,"skill":"Linking fragments and cumulative sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q36","prompt":"Fix: The clock ticked, the kettle whistled, the door opened. [Fill in the blank] One fix is to ______.","choices":["remove the comma and let them touch","add and before the last clause","turn one clause into a fragment","capitalize the last clause"],"answerIndex":1,"explanation":"Adding a coordinating conjunction before the final clause legally connects the series.","difficulty":2,"skill":"Revising run-ons","topic":"Advanced Syntax and Sentence Craft"},{"id":"q31","prompt":"[Fill in the blank] A periodic sentence is best described as ______.","choices":["one that starts with the main clause and ends with details","one that places the main clause in the middle for balance","one that repeats the main clause at the end","one that starts with details and ends with the main clause"],"answerIndex":0,"explanation":"A periodic sentence deliberately postpones the main clause so the sentence ends on its point.","difficulty":3,"skill":"Explaining sentence structures","topic":"Advanced Syntax and Sentence Craft"},{"id":"q48","prompt":"[Fill in the blank] The real test of a complete sentence versus a fragment is ______.","choices":["completeness of thought","length of the sentence","position in the paragraph","number of modifiers"],"answerIndex":0,"explanation":"The fragment test is whether the word group expresses a complete thought, not how long it is.","difficulty":2,"skill":"Defining fragments","topic":"Advanced Syntax and Sentence Craft"},{"id":"q6","prompt":"[Fill in the blank] A balanced sentence is one in which ______.","choices":["its main clause appears first","its modifiers trail after the main clause","its two halves mirror each other in parallel structure","it has no independent clause"],"answerIndex":2,"explanation":"A balanced sentence is defined by parallel structure that mirrors two equal, contrasting, or complementary ideas.","difficulty":3,"skill":"Explaining sentence structures","topic":"Advanced Syntax and Sentence Craft"},{"id":"q13","prompt":"Running through the park at dawn. / Running through the park at dawn., what is this? [Fill in the blank] This is ______.","choices":["a fragment","a run-on","a comma splice","a periodic sentence"],"answerIndex":0,"explanation":"A word group missing a subject or a verb is a fragment, not a complete sentence.","difficulty":2,"skill":"Identifying fragments","topic":"Advanced Syntax and Sentence Craft"},{"id":"q37","prompt":"Fill in the blank: The punctuation mark that most often holds the two halves of a balanced sentence apart is the ______.","choices":["conjunction","comma","semicolon","preposition"],"answerIndex":2,"explanation":"A semicolon sits between the two mirrored halves of a balanced sentence without a conjunction.","difficulty":3,"skill":"Punctuating balanced sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q17","prompt":"Fill in the blank: When turning a sentence periodic, a common mistake is assuming that ______.","choices":["The main clause must always be the shortest part of the sentence.","Nothing except the main clause can come before it.","Every modifier must be removed before the main clause appears.","The sentence must end with a short, punchy clause."],"answerIndex":1,"explanation":"A periodic sentence can open with any number of phrases or dependent clauses, as long as the independent clause waits until the end.","difficulty":4,"skill":"Building periodic sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q45","prompt":"Build a periodic sentence from these parts: he finally apologized / after days of silence / although nobody expected it. [Fill in the blank] The result should be ______.","choices":["a balanced sentence with mirrored halves","a cumulative sentence with trailing detail","a periodic sentence with the main clause at the end","a fragment with no main clause"],"answerIndex":2,"explanation":"Building from dependent material to the main clause at the end yields a periodic sentence.","difficulty":2,"skill":"Building periodic sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q33","prompt":"[Fill in the blank] What does parallel structure contribute to a balanced sentence? It ______.","choices":["It confuses the reader about who acts.","It buries the main clause under dependent clauses.","It uses fragments instead of clauses.","It makes the parallel halves match in grammatical form."],"answerIndex":3,"explanation":"Balance comes from parallel structure: the mirrored halves must match grammatically.","difficulty":3,"skill":"Building balanced sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q23","prompt":"[Fill in the blank] A writer most likely chooses a cumulative sentence in order to ______.","choices":["build suspense for the ending","mirror two equal ideas","state the main idea and add detail","get the main idea across immediately"],"answerIndex":3,"explanation":"Cumulative sentences front-load the main idea so readers grasp it at once, with details following.","difficulty":3,"skill":"Explaining sentence effects","topic":"Advanced Syntax and Sentence Craft"},{"id":"q3","prompt":"She opened the door slowly, her hands trembling, her heart pounding. / She opened the door slowly, her hands trembling, her heart pounding., what kind of sentence is this? [Fill in the blank] This is a ______ sentence.","choices":["periodic","balanced","fragment","cumulative"],"answerIndex":3,"explanation":"A cumulative sentence states its main idea first and then adds modifying details after it.","difficulty":2,"skill":"Identifying sentence patterns","topic":"Advanced Syntax and Sentence Craft"},{"id":"q34","prompt":"The storm passed, leaving calm behind. / The storm passed, leaving calm behind., make it more cumulative. [Fill in the blank] Add ______.","choices":["reversing the two halves and swapping the subject","adding a fragment before the main clause","adding modifiers after the final period-position clause","cutting the sentence to one clause"],"answerIndex":2,"explanation":"In a cumulative sentence you extend it by adding more modifiers after the main clause.","difficulty":4,"skill":"Building cumulative sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q42","prompt":"Which option repairs this fragment: After the meeting ended. Fill in the blank: Choose the complete sentence.","choices":["After the meeting ended, we compared notes.","After the meeting ended, comparing notes.","After the meeting ended, which surprised nobody.","After the meeting ended quietly and calmly."],"answerIndex":0,"explanation":"Only the first option completes the dependent clause with an independent clause.","difficulty":3,"skill":"Fixing fragments","topic":"Advanced Syntax and Sentence Craft"},{"id":"q1","prompt":"Because the storm showed no sign of weakening, we finally left. / Because the storm showed no sign of weakening, we finally left., what kind of sentence is this? [Fill in the blank] This is a ______ sentence.","choices":["cumulative","balanced","periodic","fragment"],"answerIndex":2,"explanation":"A periodic sentence withholds the main clause until the end, creating suspense and landing emphasis on that final clause.","difficulty":2,"skill":"Identifying sentence patterns","topic":"Advanced Syntax and Sentence Craft"},{"id":"q21","prompt":"The team won the championship, scoring twice in the last five minutes, stunning their rivals, delighting their fans. Fill in the blank: This is ______.","choices":["periodic, because the main clause arrives at the very end","balanced, because the phrases mirror each other perfectly","cumulative, because the main idea opens and details trail after it","a fragment, because it lacks a finite verb"],"answerIndex":2,"explanation":"The main clause 'the crowd fell silent' comes first, and descriptive phrases are piled on after it — the classic cumulative shape.","difficulty":3,"skill":"Identifying cumulative sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q26","prompt":"The runner sprinted, arms pumping, breath ragged. / The runner sprinted, arms pumping, breath ragged., the phrases after the comma are each a ______. [Fill in the blank]","choices":["clause","modifier","conjunction","fragment"],"answerIndex":0,"explanation":"Each descriptive phrase added after the main clause is a modifier.","difficulty":2,"skill":"Building cumulative sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q4","prompt":"[Fill in the blank] In a cumulative sentence, the modifiers come ______.","choices":["added detail after the main clause","main clause delayed until the end","two mirrored halves","no complete verb"],"answerIndex":0,"explanation":"A cumulative sentence leads with the independent clause and piles modifiers on afterward.","difficulty":3,"skill":"Explaining sentence structures","topic":"Advanced Syntax and Sentence Craft"},{"id":"q5","prompt":"She wanted adventure; he wanted safety. / She wanted adventure; he wanted safety., what kind of sentence is this? [Fill in the blank] This is a ______ sentence.","choices":["periodic","balanced","run-on","cumulative"],"answerIndex":1,"explanation":"A balanced sentence uses parallel structure to mirror two equal ideas against each other.","difficulty":2,"skill":"Identifying sentence patterns","topic":"Advanced Syntax and Sentence Craft"},{"id":"q10","prompt":"Which version is cumulative? [Fill in the blank] Choose the sentence that states the main idea first, then adds detail.","choices":["The children built a sandcastle, digging with spoons, laughing at the waves, guarding it from gulls.,","Digging with spoons, laughing at the waves, the children built a sandcastle.,","The children dug, laughed, and guarded the sandcastle.,","Guarding it from gulls, the children built a sandcastle, digging with spoons.,"],"answerIndex":0,"explanation":"The cumulative version states the main action first and lets descriptive modifiers trail after it.","difficulty":4,"skill":"Building cumulative sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q16","prompt":"Which one is a complete sentence, not a fragment? [Fill in the blank] Find the group with a subject and a finite verb.","choices":["The team practiced every afternoon.","Although the team practiced every afternoon.","Practicing every afternoon, the team.","The team, practicing every afternoon."],"answerIndex":0,"explanation":"Only this option has both a subject (team) and a finite verb (practiced) and no dangling dependent marker.","difficulty":3,"skill":"Revising fragments","topic":"Advanced Syntax and Sentence Craft"},{"id":"q29","prompt":"[Fill in the blank] The most severe form of run-on joins two independent clauses by ______.","choices":["joining with a comma only","joining with no punctuation at all","joining with a semicolon","joining with a dash"],"answerIndex":1,"explanation":"A fused run-on joins two independent clauses with no punctuation between them at all.","difficulty":2,"skill":"Identifying run-ons","topic":"Advanced Syntax and Sentence Craft"},{"id":"q18","prompt":"[Fill in the blank] A comma splice occurs when a writer joins ______.","choices":["two dependent clauses joined by a comma","two independent clauses joined by only a comma","a clause with no verb","a clause with two subjects"],"answerIndex":1,"explanation":"A comma splice joins two independent clauses with nothing but a comma, which cannot hold them together.","difficulty":3,"skill":"Identifying comma splices","topic":"Advanced Syntax and Sentence Craft"},{"id":"q49","prompt":"We missed the bus, we walked home. / We missed the bus, we walked home., what error is this? [Fill in the blank] This is a ______.","choices":["fragment","periodic","comma splice","balanced"],"answerIndex":2,"explanation":"A comma splice is one kind of run-on error, joining independent clauses with only a comma.","difficulty":2,"skill":"Identifying comma splices","topic":"Advanced Syntax and Sentence Craft"},{"id":"q44","prompt":"[Fill in the blank] The suspense in a periodic sentence comes from ______.","choices":["putting the main clause last","putting the main clause first","making both halves parallel","removing all dependent clauses"],"answerIndex":0,"explanation":"Suspense comes from withholding the independent clause until the end.","difficulty":3,"skill":"Explaining sentence effects","topic":"Advanced Syntax and Sentence Craft"},{"id":"q8","prompt":"Turn this into a periodic sentence: The dog ran out after hesitating at the gate. [Fill in the blank] Start the sentence with ______.","choices":["After, hesitating at the gate, the dog ran out.,","The dog ran out after, hesitating at the gate.,","After the dog ran out, hesitating at the gate.,","After hesitating at the gate, the dog ran out.,"],"answerIndex":3,"explanation":"Placing the dependent clause first and the main clause last makes the sentence periodic, saving the main action for the end.","difficulty":4,"skill":"Building periodic sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q35","prompt":"The clock ticked, the kettle whistled, the door opened. / The clock ticked, the kettle whistled, the door opened., with no conjunctions, what is this? [Fill in the blank] This is a ______.","choices":["run-on","periodic","balanced","fragment"],"answerIndex":0,"explanation":"Three independent clauses run together with only commas: a run-on made of comma splices.","difficulty":2,"skill":"Identifying run-ons","topic":"Advanced Syntax and Sentence Craft"},{"id":"q27","prompt":"The garden bloomed, every rose open, every border trimmed. / The garden bloomed, every rose open, every border trimmed., what is this? [Fill in the blank] This is ______.","choices":["periodic, because it withholds the main clause","balanced, because the halves mirror each other","cumulative, because detail trails the main clause","a fragment, because it lacks a verb"],"answerIndex":2,"explanation":"The main clause comes first and modifiers trail after, which defines a cumulative sentence.","difficulty":3,"skill":"Identifying sentence patterns","topic":"Advanced Syntax and Sentence Craft"},{"id":"q9","prompt":"[Fill in the blank] To build a cumulative sentence, you should ______.","choices":["put the main clause at the very end","add descriptive details after the main clause","cut every modifier from the sentence","split the sentence into two equal halves"],"answerIndex":1,"explanation":"You build a cumulative sentence by adding modifiers after the already-complete main clause.","difficulty":2,"skill":"Building cumulative sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q25","prompt":"Rewrite as periodic: The choir sang softly as the audience leaned forward. [Fill in the blank] Best choice: ______.","choices":["The choir sang softly, gently, sweetly.,","While the choir sang, softly, sweetly.,","The choir sang a soft song.,","Softly singing, the sweet choir."],"answerIndex":1,"explanation":"Starting with the dependent clause and ending with the independent clause creates suspense and final emphasis.","difficulty":3,"skill":"Building periodic sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q15","prompt":"[Fill in the blank] The basic fix for a fragment is to ______.","choices":["add a comma and a conjunction to attach it to the next sentence","add a coordinating conjunction to begin the next sentence","add a subject and a verb to complete the thought","add a transition word to signal the missing idea"],"answerIndex":2,"explanation":"A fragment needs a subject and a verb so it expresses a complete thought.","difficulty":2,"skill":"Revising fragments","topic":"Advanced Syntax and Sentence Craft"},{"id":"q32","prompt":"Fill in the blank: Which sentence is built as a balanced sentence?","choices":["She studied hard and passed the exam with a high score.","She studied hard; he barely tried.","Studying hard, she passed the exam with a high score.","She studied hard, passing the exam with a high score."],"answerIndex":1,"explanation":"Balanced sentences split into two halves that match each other in grammatical form and weight.","difficulty":3,"skill":"Recognizing balanced sentences","topic":"Advanced Syntax and Sentence Craft"},{"id":"q46","prompt":"Fill in the blank: When a writer moves the main clause to the end, the effect on that clause is that its meaning is ______.","choices":["moved to the start of the sentence","strengthened because it arrives after the delay","buried by the trailing details","stated twice for balance"],"answerIndex":1,"explanation":"Because the reader waits for the main clause, the words that finally arrive carry extra weight.","difficulty":4,"skill":"Analyzing periodic effect","topic":"Advanced Syntax and Sentence Craft"},{"id":"q20","prompt":"Fix this run-on: It was cold, we stayed inside. [Fill in the blank] One correct fix is to ______.","choices":["add a coordinating conjunction like 'so' after the comma","add a subordinating conjunction after the comma","add another comma","capitalize the second clause and drop the comma"],"answerIndex":0,"explanation":"Adding a coordinating conjunction such as so after the comma legally joins the two independent clauses.","difficulty":2,"skill":"Revising run-ons","topic":"Advanced Syntax and Sentence Craft"},{"id":"q11","prompt":"Which is the balanced version? [Fill in the blank] Look for the two matching, mirrored halves.","choices":["He was tired but happy, and he went home.,","Tired, he went home, but he was happy.,","He was tired, but he was happy.,","Although tired, he was happy, going home., "],"answerIndex":2,"explanation":"Balanced structure means the two halves match in form, mirroring tired against happy.","difficulty":3,"skill":"Building balanced sentences","topic":"Advanced Syntax and Sentence Craft"}],"feedback":{"correct":"Strong connection — that clause slots in perfectly.","incorrect":"Not this time — that choice breaks the sentence's structure.","win":"Four in a row — you've mastered advanced syntax and sentence craft!","lose":"The bot connected four. Review the sentence patterns and try again.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
    var ROWS = 6, COLS = 7;
    var WIN_LINES = (function () {
      var lines = [];
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (c + 3 < COLS) lines.push([r * COLS + c, r * COLS + c + 1, r * COLS + c + 2, r * COLS + c + 3]);
          if (r + 3 < ROWS) lines.push([r * COLS + c, (r + 1) * COLS + c, (r + 2) * COLS + c, (r + 3) * COLS + c]);
          if (r + 3 < ROWS && c + 3 < COLS) lines.push([r * COLS + c, (r + 1) * COLS + c + 1, (r + 2) * COLS + c + 2, (r + 3) * COLS + c + 3]);
          if (r + 3 < ROWS && c - 3 >= 0) lines.push([r * COLS + c, (r + 1) * COLS + c - 1, (r + 2) * COLS + c - 2, (r + 3) * COLS + c - 3]);
        }
      }
      return lines;
    })();
    var BOT_PREF = [3, 2, 4, 1, 5, 0, 6];
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'),
      prompt: q('prompt'), choices: q('choices'), verdict: q('verdict'),
      droprow: q('droprow'), board: q('board'),
      xcount: q('xcount'), ocount: q('ocount'),
      modal: q('modal'), result: q('result'), endstats: q('endstats'),
      restart: q('restart'), next: q('next'),
    };

    var state = null;

    function emit(name, detail) {
      var data = { source: 'connect-four', engineId: 'connect-four' };
      for (var k in detail) data[k] = detail[k];
      try {
        window.dispatchEvent(new CustomEvent('game:' + name, { detail: data }));
      } catch (err) { /* an engine must never break the page over telemetry */ }
    }

    function slot(r, c) { return r * COLS + c; }

    function dropRow(col, board) {
      for (var r = ROWS - 1; r >= 0; r--) if (board[slot(r, col)] === null) return r;
      return -1;
    }

    function winnerOf(board) {
      for (var i = 0; i < WIN_LINES.length; i++) {
        var line = WIN_LINES[i];
        if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[1]] === board[line[2]] && board[line[2]] === board[line[3]]) {
          return { mark: board[line[0]], line: line };
        }
      }
      return null;
    }

    // Deterministic on purpose: win, block, then centre-out column preference —
    // the same board always produces the same bot drop, so the game is testable
    // and fair to read.
    function botColumn(board) {
      var marks = ['O', 'X'];
      for (var m = 0; m < marks.length; m++) {
        for (var c = 0; c < COLS; c++) {
          var r = dropRow(c, board);
          if (r < 0) continue;
          board[slot(r, c)] = marks[m];
          var wins = winnerOf(board);
          board[slot(r, c)] = null;
          if (wins) return c;
        }
      }
      for (var i = 0; i < BOT_PREF.length; i++) if (dropRow(BOT_PREF[i], board) >= 0) return BOT_PREF[i];
      return -1;
    }

    function cellLabel(r, c, board) {
      var mark = board[slot(r, c)];
      var who = mark === 'X' ? 'your token' : mark === 'O' ? 'the bot token' : 'empty';
      return 'Row ' + (r + 1) + ' column ' + (c + 1) + ', ' + who;
    }

    function renderBoard() {
      var board = state.board;
      el.droprow.innerHTML = '';
      for (var c = 0; c < COLS; c++) {
        var drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'c4-drop';
        drop.dataset.col = String(c);
        var open = state.phase === 'acting' && dropRow(c, board) >= 0;
        if (open) {
          drop.classList.add('c4-drop--open');
          drop.textContent = 'v';
          drop.setAttribute('data-game-action', '');
          drop.setAttribute('aria-label', 'Drop your token in column ' + (c + 1));
        } else {
          drop.textContent = '^';
          if (dropRow(c, board) < 0) drop.classList.add('c4-drop--full');
          drop.setAttribute('aria-label', 'Column ' + (c + 1) + (dropRow(c, board) < 0 ? ', full' : ', waiting for your turn'));
        }
        el.droprow.appendChild(drop);
      }
      el.board.innerHTML = '';
      for (var r = 0; r < ROWS; r++) {
        for (var col = 0; col < COLS; col++) {
          var cell = document.createElement('div');
          cell.className = 'c4-cell';
          cell.setAttribute('role', 'gridcell');
          cell.setAttribute('aria-label', cellLabel(r, col, board));
          var mark = board[slot(r, col)];
          if (mark === 'X') cell.classList.add('c4-cell--x');
          else if (mark === 'O') cell.classList.add('c4-cell--o');
          if (state.winLine && state.winLine.indexOf(slot(r, col)) >= 0) cell.classList.add('c4-cell--win');
          el.board.appendChild(cell);
        }
      }
      el.xcount.textContent = String(board.filter(function (m) { return m === 'X'; }).length);
      el.ocount.textContent = String(board.filter(function (m) { return m === 'O'; }).length);
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
        btn.className = 'c4-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var key = document.createElement('span');
        key.className = 'c4-key';
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
      el.verdict.className = 'c4-verdict ' + (correct ? 'c4-verdict--good' : 'c4-verdict--bad');
      el.verdict.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = correct ? (feedback.correct || 'Correct — your move.') : (feedback.incorrect || 'Incorrect — the bot moves.');
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
      // that decided the last one: a round that restarts after a loss continues
      // the set rather than repeating it. When the pool is finally spent it
      // wraps and the payload's own out-of-questions line says so.
      var next = GAME_CURSOR.next(QUESTIONS.length);
      state.item = QUESTIONS[next.index];
      state.qPos = next.index;
      state.qNo = next.index + 1;
      state.phase = 'question';
      state.qStartMs = Date.now();
      renderQuestion();
      renderBoard();
      el.status.textContent = next.wrapped
        ? (feedback.outOfQuestions || 'Out of questions — the set starts again.')
        : 'Answer to drop your token.';
    }

    function checkEnd() {
      var win = winnerOf(state.board);
      if (win) {
        state.winLine = win.line;
        renderBoard();
        return endGame(win.mark === 'X' ? 'win' : 'lose');
      }
      if (state.board.every(function (m) { return m !== null; })) {
        renderBoard();
        return endGame('draw');
      }
      return false;
    }

    function endGame(result) {
      state.phase = 'over';
      renderBoard();
      var message = result === 'win' ? (feedback.win || 'You win!')
        : result === 'lose' ? (feedback.lose || 'The bot wins this one.')
        : (feedback.draw || 'Draw game.');
      el.status.textContent = message;
      el.result.textContent = message;
      el.result.className = 'c4-result c4-result--' + result;
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
      var buttons = el.choices.querySelectorAll('.c4-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 'c4-choice--right' : 'c4-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('c4-choice--right');
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
        state.phase = 'acting';
        el.status.textContent = feedback.correct || 'Correct — drop your token in a column.';
        renderBoard();
      } else {
        el.status.textContent = feedback.incorrect || 'Incorrect — the bot drops a token.';
        var col = botColumn(state.board);
        var row = col >= 0 ? dropRow(col, state.board) : -1;
        if (row >= 0) state.board[slot(row, col)] = 'O';
        if (!checkEnd()) askNext();
      }
    }

    function onDrop(col) {
      if (state.phase !== 'acting') return;
      var row = dropRow(col, state.board);
      if (row < 0) return;
      state.board[slot(row, col)] = 'X';
      if (!checkEnd()) askNext();
    }

    // ---- wire up a fresh round -------------------------------------------------
    //
    // The board resets; the question cursor does not. "Play again" is another
    // round taken up at the next unseen question, never the same one twice.
    state = {
      board: new Array(ROWS * COLS).fill(null),
      item: null, qPos: 0, qNo: 0, used: 0, correct: 0, wrong: 0,
      phase: 'question', qStartMs: 0, winLine: null,
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
      var btn = event.target.closest ? event.target.closest('.c4-choice') : null;
      if (btn && !btn.disabled) onAnswer(Number(btn.dataset.index));
    };
    el.droprow.onclick = function (event) {
      var drop = event.target.closest ? event.target.closest('.c4-drop') : null;
      if (drop) onDrop(Number(drop.dataset.col));
    };
    el.restart.onclick = function () { window.initGame(payload); };

    renderBoard();
    askNext();
    emit('start', { engineId: 'connect-four' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
