
  /* Yahtzee — base engine.
   *
   * The engine holds game logic only; every question, choice, explanation and
   * message arrives through window.GAME_DATA at the injection marker below.
   *
   * The rules (per the game spec): five dice and a 13-category scoresheet.
   * One question gates every user roll. Answer it correctly and the user rolls
   * the dice and scores the best open category; answer it incorrectly and the
   * turn is skipped and the bot rolls into that category instead. The game ends
   * when all 13 categories are filled, and the higher total wins.
   *
   * Events out (dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, questionIndex, correct, chosen, ms}
   *   game:win / game:lose / game:draw
   *               {source, engineId, result, correct, wrong, questionsUsed}
   */
  window.GAME_ID = 'yahtzee';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"yahtzee","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":3,"topic":"Tester 3 of 9: Entry Check, Part 3 of 9","title":"Entry Check: Vocabulary from Literature to Fallacies in Depth","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":2,"end":5,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q12","prompt":"Which best describes third-person limited point of view?","choices":["the narrator knows only one character's thoughts","the narrator addresses the reader as you","the narrator knows everything about everyone","the narrator is a character in the story"],"answerIndex":0,"explanation":"Third-person limited narration follows one character and reveals only that character's inner thoughts.","difficulty":3,"skill":"Identifying narrative point of view","topic":"Vocabulary from Literature"},{"id":"q16","prompt":"What is point of view in a story?","choices":["the perspective from which a story is told","the moral of the story","the author's biography","the number of chapters in a book"],"answerIndex":0,"explanation":"Point of view is the perspective from which a story is narrated.","difficulty":2,"skill":"Identifying narrative point of view","topic":"Vocabulary from Literature"},{"id":"q48","prompt":"Which response to a classmate's argument is a legitimate criticism rather than a fallacy?","choices":["Sofia is honest, so her source must be reliable.","Sofia cited a weak source, so her conclusion is false.","Sofia has an agenda, so her evidence can be dismissed.","Sofia's study used a small sample, so her conclusion may not hold."],"answerIndex":3,"explanation":"Pointing out a genuine weakness in the evidence is legitimate criticism, not a fallacy.","difficulty":4,"skill":"Telling fallacy from fair criticism","topic":"Fallacies in Depth"},{"id":"q13","prompt":"What is the resolution of a story?","choices":["the story's main conflict","the turning point of the plot","the background information at the start","the final unraveling after the climax"],"answerIndex":3,"explanation":"The resolution is the part after the climax where loose ends are settled.","difficulty":3,"skill":"Identifying story elements","topic":"Vocabulary from Literature"},{"id":"q19","prompt":"What is hyperbole?","choices":["deliberate exaggeration for effect","a repeated rhyme scheme","the narrator's point of view","an old-fashioned word"],"answerIndex":0,"explanation":"Hyperbole is obvious exaggeration used for emphasis or effect.","difficulty":2,"skill":"Identifying figurative language","topic":"Vocabulary from Literature"},{"id":"q30","prompt":"What is a catchphrase in literature?","choices":["a character's least favorite food","a phrase always said by the author","a phrase repeatedly used by a character","a sentence describing the setting"],"answerIndex":2,"explanation":"A catchphrase is a phrase a character habitually repeats, helping define them.","difficulty":3,"skill":"Tracing word origins in literature","topic":"Vocabulary from Literature"},{"id":"q46","prompt":"A debater claims her opponent wants to abolish all homework, when he only asked to reduce it. Which fallacy is this?","choices":["a persuasive detail that makes the audience feel pity","an attack on the person making the argument rather than the argument","a comparison between two things that are not alike in the relevant way","an insistence that there are only two possible positions"],"answerIndex":1,"explanation":"The straw man fallacy twists an opponent's claim into a weaker version and then refutes that.","difficulty":4,"skill":"Spotting fallacies in context","topic":"Fallacies in Depth"},{"id":"q27","prompt":"What makes a word archaic?","choices":["a word from the twentieth century","a word poets invented for rhythm","a word with multiple spellings","a word no longer in everyday use"],"answerIndex":3,"explanation":"An archaic word has dropped out of everyday use but survives in older texts.","difficulty":3,"skill":"Tracing word origins in literature","topic":"Vocabulary from Literature"},{"id":"q11","prompt":"What does personification do?","choices":["repeated sounds at the ends of words","a reference to a famous event","human qualities given to nonhuman things","an overstatement for emphasis"],"answerIndex":2,"explanation":"Personification gives human traits or actions to nonhuman things.","difficulty":2,"skill":"Identifying figurative language","topic":"Vocabulary from Literature"},{"id":"q34","prompt":"What is verbal irony?","choices":["a story with a happy ending","a poem without rhyme","a contrast between what is said and what is meant","a story told in one breathless sentence"],"answerIndex":3,"explanation":"Verbal irony means saying one thing while meaning another, often its opposite.","difficulty":4,"skill":"Identifying literary devices","topic":"Vocabulary from Literature"},{"id":"q15","prompt":"What is internal conflict?","choices":["a conflict between a character and a storm","a conflict between two characters","a struggle within a character's own mind","a conflict between a character and society"],"answerIndex":2,"explanation":"Internal conflict is a struggle that takes place inside a character's own mind or heart.","difficulty":3,"skill":"Identifying story elements","topic":"Vocabulary from Literature"},{"id":"q07","prompt":"Which word has the most negative connotation?","choices":["Unhappily","So","When","Slowly"],"answerIndex":3,"explanation":"Unhappy carries a negative connotation while unhappy's synonyms like downcast are milder; but among these, Unhappily is the word most readers would flag... Actually unhappy clearly suggests sadness. Let me restate.","difficulty":2,"skill":"Analyzing word choice","topic":"Vocabulary from Literature"},{"id":"q50","prompt":"My two neighbors are rude, so everyone in this city is rude. Which fallacy is this?","choices":["a hasty generalization","a straw man fallacy","an appeal to false authority","circular reasoning"],"answerIndex":0,"explanation":"Judging a whole group from a couple of cases is a hasty generalization.","difficulty":3,"skill":"Evaluating fallacious reasoning","topic":"Fallacies in Depth"},{"id":"q26","prompt":"What is a coinage in literary vocabulary?","choices":["a formal word of Latin origin","a word coined or used by one author","a word borrowed from another language","an archaic word no longer used"],"answerIndex":1,"explanation":"A coinage is a new word invented or first used by a particular writer.","difficulty":4,"skill":"Tracing word origins in literature","topic":"Vocabulary from Literature"},{"id":"q36","prompt":"What is a hasty generalization?","choices":["a long list of similar items","a broad statement applied to all cases","a comparison of two arguments","a single vivid example"],"answerIndex":1,"explanation":"A generalization claims something is true of an entire group based on limited evidence.","difficulty":3,"skill":"Recognizing logical fallacies","topic":"Fallacies in Depth"},{"id":"q02","prompt":"What does it mean for a character to be static?","choices":["a character who changes significantly by the end","a character who stays basically the same throughout","a character with no role in the plot","a character who exists only in flashback"],"answerIndex":2,"explanation":"A static character does not undergo meaningful change over the course of the story.","difficulty":2,"skill":"Understanding character types","topic":"Vocabulary from Literature"},{"id":"q17","prompt":"What is a round character?","choices":["a character who never speaks","a well-developed character with depth and complexity","a character who only appears once","a character borrowed from another book"],"answerIndex":1,"explanation":"A round character is complex and multi-dimensional, like a real person.","difficulty":3,"skill":"Understanding character types","topic":"Vocabulary from Literature"},{"id":"q44","prompt":"What is cherry-picking evidence?","choices":["assuming the conclusion before the argument","citing only the evidence that supports your view","asking leading questions","arguing from analogy"],"answerIndex":1,"explanation":"Cherry-picking means presenting only the evidence that favors your position and ignoring the rest.","difficulty":4,"skill":"Recognizing logical fallacies","topic":"Fallacies in Depth"},{"id":"q20","prompt":"Which signal shows a story is told in first person?","choices":["the narrator directly addresses the reader","the story is told through letters alone","the narrator is a character using I or we","the story skips back and forth in time"],"answerIndex":2,"explanation":"First-person narration uses I or we because the narrator is a participant in the story.","difficulty":2,"skill":"Identifying narrative point of view","topic":"Vocabulary from Literature"},{"id":"q29","prompt":"What is period diction?","choices":["modern teenage slang","language of an earlier historical period","technical scientific terms","words from a specific region"],"answerIndex":1,"explanation":"Period diction is the vocabulary and phrasing typical of the time when a work was written.","difficulty":3,"skill":"Tracing word origins in literature","topic":"Vocabulary from Literature"},{"id":"q23","prompt":"In The Tell-Tale Heart, what is the narrator's main problem?","choices":["the loss of a family farm","an obsession with wealth and appearance","a mysterious sea voyage","a war between two nations"],"answerIndex":3,"explanation":"Poe's tale is narrated by a man whose mind unravels as obsession and guilt take over.","difficulty":4,"skill":"Analyzing themes in canonical texts","topic":"Vocabulary from Literature"},{"id":"q10","prompt":"What is an allusion?","choices":["a brief story used as an example","a reference to another well-known work","a question asked to get an answer","a contradiction that reveals truth"],"answerIndex":1,"explanation":"An allusion is a brief reference to another work, person, or event the reader is expected to recognize.","difficulty":3,"skill":"Identifying literary devices","topic":"Vocabulary from Literature"},{"id":"q37","prompt":"Which is an ad hominem fallacy?","choices":["citing an expert's research","presenting data from a survey","attacking the person instead of the argument","asking a clarifying question"],"answerIndex":2,"explanation":"An ad hominem fallacy attacks the speaker's character rather than addressing their argument.","difficulty":2,"skill":"Recognizing logical fallacies","topic":"Fallacies in Depth"},{"id":"q05","prompt":"Which is an example of direct characterization?","choices":["showing the character's childhood in a scene","describing how the character looks","telling the reader what the character is like directly","having the character move to a new city"],"answerIndex":1,"explanation":"Direct characterization tells the reader a character's traits outright instead of showing them through actions.","difficulty":3,"skill":"Identifying characterization methods","topic":"Vocabulary from Literature"},{"id":"q03","prompt":"In literature, what is plot?","choices":["the time and place of a story","the series of events in a story","the narrator's personality","the lesson a reader learns from real life"],"answerIndex":3,"explanation":"Plot is the sequence of events that make up a story.","difficulty":2,"skill":"Identifying story elements","topic":"Vocabulary from Literature"},{"id":"q24","prompt":"Where is To Kill a Mockingbird set?","choices":["the quiet town of Maycomb, Alabama","a fishing village in Maine","a ranch in central California","a suburb of Chicago"],"answerIndex":0,"explanation":"To Kill a Mockingbird is set in the small town of Maycomb, Alabama, during the Depression.","difficulty":4,"skill":"Analyzing themes in canonical texts","topic":"Vocabulary from Literature"},{"id":"q40","prompt":"Which is the clearest example of circular reasoning?","choices":["assuming a claim is true because an old book says so","assuming a new claim must be false because it is unusual","using the conclusion as evidence for itself","mocking an opponent instead of answering their reasons"],"answerIndex":2,"explanation":"Circular reasoning offers the conclusion as its own proof, so the argument goes nowhere.","difficulty":3,"skill":"Recognizing fallacies in arguments","topic":"Fallacies in Depth"},{"id":"q01","prompt":"What is an omniscient narrator?","choices":["a character who tells the story through their own eyes","an all-knowing narrator who can see every character's thoughts","a narrator who speaks only in dialogue","the author writing a preface"],"answerIndex":1,"explanation":"Third-person omniscient narration comes from an all-knowing voice outside the story that can reveal any character's thoughts.","difficulty":2,"skill":"Identifying narrative point of view","topic":"Vocabulary from Literature"},{"id":"q33","prompt":"What is mood in a literary work?","choices":["a character's speech habits","the emotional atmosphere a text creates","the narrator's grammar level","the rhyme pattern of a poem"],"answerIndex":1,"explanation":"Mood is the feeling or atmosphere the reader experiences from the text.","difficulty":3,"skill":"Identifying literary devices","topic":"Vocabulary from Literature"},{"id":"q31","prompt":"What is juxtaposition?","choices":["a direct contrast placed side by side","a repeated word at line beginnings","a long, winding sentence","a question left unanswered"],"answerIndex":0,"explanation":"Juxtaposition places two contrasting elements close together for effect.","difficulty":4,"skill":"Identifying literary devices","topic":"Vocabulary from Literature"},{"id":"q35","prompt":"In vocabulary study, what is a word's etymology?","choices":["a word's origin and the history of how its meaning developed","a list of every dictionary definition for a word","the rule that governs how a word is spelled in a sentence","the set of synonyms that can replace a word anywhere"],"answerIndex":0,"explanation":"Etymology traces a word's origin and how its form and meaning changed over time.","difficulty":3,"skill":"Using word origins to build vocabulary","topic":"Vocabulary from Literature"},{"id":"q08","prompt":"What is a metaphor?","choices":["compare two things using like or as","give human qualities to objects","say one thing is another thing","repeat sounds at line ends"],"answerIndex":2,"explanation":"A metaphor directly states that one thing is another, without using like or as.","difficulty":2,"skill":"Identifying figurative language","topic":"Vocabulary from Literature"},{"id":"q49","prompt":"Either we ban all phones in school or learning will collapse. Which fallacy is this?","choices":["a bandwagon appeal","an ad hominem attack","a false dilemma","circular reasoning"],"answerIndex":2,"explanation":"This limits the choice to two extremes when a middle option exists, making it a false dilemma.","difficulty":4,"skill":"Evaluating fallacious reasoning","topic":"Fallacies in Depth"},{"id":"q43","prompt":"What does appeal to emotion mean as a fallacy?","choices":["a chain of supporting reasons","a claim proved by its own restatement","a comparison between two ideas","using emotion to replace evidence"],"answerIndex":3,"explanation":"An appeal to emotion tries to win agreement by stirring feelings instead of giving reasons.","difficulty":3,"skill":"Recognizing logical fallacies","topic":"Fallacies in Depth"},{"id":"q09","prompt":"What is a simile?","choices":["a comparison using like or as","a comparison without like or as","a repeated beginning sound","an exaggeration for effect"],"answerIndex":0,"explanation":"A simile compares two things using the words like or as.","difficulty":2,"skill":"Identifying figurative language","topic":"Vocabulary from Literature"},{"id":"q45","prompt":"What is the appeal to novelty fallacy?","choices":["relying on a dictionary definition","assuming the past was better than the present","assuming older ideas are automatically wrong","claiming an authority proved a point"],"answerIndex":2,"explanation":"An appeal to novelty assumes something is better just because it is new.","difficulty":3,"skill":"Recognizing logical fallacies","topic":"Fallacies in Depth"},{"id":"q21","prompt":"In Narrative of the Life of Frederick Douglass, what is a central theme?","choices":["slavery's history in America","freedom and its personal cost","the dangers of sea travel","friendship between generations"],"answerIndex":1,"explanation":"Douglass's narrative centers on his journey from bondage to freedom and what that freedom means.","difficulty":4,"skill":"Analyzing themes in canonical texts","topic":"Vocabulary from Literature"},{"id":"q06","prompt":"What is the connotation of a word?","choices":["a feeling a word suggests beyond its literal meaning"," a word's exact dictionary definition","the prefix and suffix of a word","a word's opposite meaning"],"answerIndex":0,"explanation":"Connotation is the emotional or suggested meaning a word carries beyond its literal definition.","difficulty":3,"skill":"Analyzing word choice","topic":"Vocabulary from Literature"},{"id":"q18","prompt":"What is a theme in literature?","choices":["the main idea of a paragraph","a character's spoken lines","the order of events in a story","the central message about life in a work"],"answerIndex":3,"explanation":"Theme is the central message or insight about life that a literary work conveys.","difficulty":2,"skill":"Identifying story elements","topic":"Vocabulary from Literature"},{"id":"q42","prompt":"What is a false dilemma?","choices":["dividing choices into only two options","arguing from personal experience alone","attacking a straw version of a claim","relying on circular reasoning"],"answerIndex":0,"explanation":"A false dilemma presents only two options when more possibilities exist.","difficulty":3,"skill":"Recognizing logical fallacies","topic":"Fallacies in Depth"},{"id":"q25","prompt":"What is tone in a piece of writing?","choices":["the reader's guess about how the story will end","the order in which the author reveals the events","the lesson the main character learns by the end","the narrator's attitude toward the subject or audience"],"answerIndex":3,"explanation":"Tone is the narrator's or author's attitude, which word choice and style reveal to the reader.","difficulty":4,"skill":"Distinguishing tone from mood","topic":"Vocabulary from Literature"},{"id":"q22","prompt":"Who is the protagonist of a story?","choices":["a character who never changes during the story","a character who is the main focus of the plot","a character who exists mainly to highlight the protagonist","a character who tells the story to the reader"],"answerIndex":1,"explanation":"The protagonist is the central figure whose goals and choices drive the story.","difficulty":2,"skill":"Identifying story elements","topic":"Vocabulary from Literature"},{"id":"q14","prompt":"What is foreshadowing?","choices":["a character's memory of the past shown as a scene","a hint about what will happen later","a struggle between opposing forces","a comparison of two unlike things"],"answerIndex":1,"explanation":"Foreshadowing gives hints or clues about events that will happen later in the story.","difficulty":3,"skill":"Identifying literary devices","topic":"Vocabulary from Literature"},{"id":"q28","prompt":"Which describes Shakespeare's contribution to English vocabulary?","choices":["words Shakespeare added or popularized in English","words only used in legal documents","words that changed meaning in the 1800s","words borrowed from French novels"],"answerIndex":0,"explanation":"Shakespeare coined or popularized many everyday English words such as lonely and gossip.","difficulty":4,"skill":"Tracing word origins in literature","topic":"Vocabulary from Literature"},{"id":"q04","prompt":"What is a symbol in a literary work?","choices":["a brief story used to prove a point in an argument","a statement the narrator does not actually believe","an object, person, or place that also stands for a larger idea","the author's attitude toward the subject of the work"],"answerIndex":2,"explanation":"A symbol is a concrete element of the story that carries a second, larger meaning beyond itself.","difficulty":3,"skill":"Identifying literary devices","topic":"Vocabulary from Literature"},{"id":"q32","prompt":"What is alliteration?","choices":["giving an object human feelings","contradiction that proves a point","the repetition of initial consonant sounds","an indirect reference to a myth"],"answerIndex":2,"explanation":"Alliteration repeats the same initial consonant sound in nearby words.","difficulty":2,"skill":"Identifying literary devices","topic":"Vocabulary from Literature"},{"id":"q41","prompt":"Which is an appeal to false authority?","choices":["trusting a source because it is old","accepting an expert in any field as proof","citing a celebrity's opinion as expert evidence","quoting a scientist's peer-reviewed study"],"answerIndex":2,"explanation":"An appeal to false authority uses a famous person's opinion where real expertise is needed.","difficulty":3,"skill":"Recognizing logical fallacies","topic":"Fallacies in Depth"},{"id":"q47","prompt":"You must recycle because recycling is the right thing to do. Which fallacy is this?","choices":["appealing to fear","circular reasoning","cherry-picking","a slippery slope"],"answerIndex":1,"explanation":"The argument only restates the claim as its own support, which is circular reasoning.","difficulty":4,"skill":"Evaluating fallacious reasoning","topic":"Fallacies in Depth"},{"id":"q39","prompt":"Which describes the bandwagon fallacy?","choices":["using a famous quote as evidence","asking the audience a direct question","listing statistics to support a claim","arguing something is true because everyone believes it"],"answerIndex":3,"explanation":"The bandwagon fallacy says a claim is true simply because many people accept it.","difficulty":2,"skill":"Recognizing logical fallacies","topic":"Fallacies in Depth"},{"id":"q38","prompt":"What is a slippery slope fallacy?","choices":["claiming an action will start an unstoppable chain of disasters","ignoring the middle ground between extremes","praising a person to win agreement","using vague words to dodge the issue"],"answerIndex":0,"explanation":"A slippery slope argument claims one small step will lead inevitably to disaster.","difficulty":3,"skill":"Recognizing logical fallacies","topic":"Fallacies in Depth"}],"feedback":{"correct":"Nice — that earns your roll.","incorrect":"Missed — the bot takes the roll instead.","win":"You out-rolled the bot and kept your review light. Well played!","lose":"The bot filled its sheet faster. Study the entry-check topics and try again!","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
    var CATS = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
      'Three of a Kind', 'Four of a Kind', 'Full House', 'Small Straight',
      'Large Straight', 'Yahtzee', 'Chance'];
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'), prompt: q('prompt'),
      choices: q('choices'), verdict: q('verdict'), dice: q('dice'), filled: q('filled'),
      usertotal: q('usertotal'), bottotal: q('bottotal'), action: q('action'),
      modal: q('modal'), result: q('result'), endstats: q('endstats'),
      restart: q('restart'), next: q('next'),
    };
    el.diceList = el.dice ? el.dice.querySelectorAll('[data-game-die]') : [];
    el.cells = root.querySelectorAll('[data-game-cell]');
    el.bys = root.querySelectorAll('[data-game-by]');

    var state = null;

    function emit(name, detail) {
      var data = { source: 'yahtzee', engineId: 'yahtzee' };
      for (var k in detail) data[k] = detail[k];
      try {
        window.dispatchEvent(new CustomEvent('game:' + name, { detail: data }));
      } catch (err) { /* an engine must never break the page over telemetry */ }
    }

    function rollDice() {
      var dice = [];
      for (var i = 0; i < 5; i++) dice.push(1 + Math.floor(Math.random() * 6));
      return dice;
    }

    // Standard yahtzee scoring for one category and one roll of five dice.
    function scoreCategory(cat, dice) {
      var counts = [0, 0, 0, 0, 0, 0, 0];
      var sum = 0, i;
      for (i = 0; i < dice.length; i++) { counts[dice[i]] += 1; sum += dice[i]; }
      if (cat <= 5) {
        var face = cat + 1, subtotal = 0;
        for (i = 0; i < dice.length; i++) if (dice[i] === face) subtotal += face;
        return subtotal;
      }
      var maxCount = 0;
      for (i = 1; i <= 6; i++) if (counts[i] > maxCount) maxCount = counts[i];
      if (cat === 6) return maxCount >= 3 ? sum : 0;
      if (cat === 7) return maxCount >= 4 ? sum : 0;
      if (cat === 8) {
        var three = false, two = false;
        for (i = 1; i <= 6; i++) {
          if (counts[i] === 3) three = true;
          if (counts[i] === 2) two = true;
        }
        return three && two ? 25 : 0;
      }
      if (cat === 9) {
        if ((counts[1] && counts[2] && counts[3] && counts[4]) ||
          (counts[2] && counts[3] && counts[4] && counts[5]) ||
          (counts[3] && counts[4] && counts[5] && counts[6])) return 30;
        return 0;
      }
      if (cat === 10) {
        if ((counts[1] && counts[2] && counts[3] && counts[4] && counts[5]) ||
          (counts[2] && counts[3] && counts[4] && counts[5] && counts[6])) return 40;
        return 0;
      }
      if (cat === 11) return maxCount === 5 ? 50 : 0;
      return sum;
    }

    // The open category the roll scores into: the best-scoring one left.
    function bestOpenCategory(dice) {
      var best = -1, bestScore = -1;
      for (var i = 0; i < CATS.length; i++) {
        if (state.sheet[i]) continue;
        var score = scoreCategory(i, dice);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      return best;
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
        btn.className = 'y-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var key = document.createElement('span');
        key.className = 'y-key';
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
      el.verdict.className = 'y-verdict ' + (correct ? 'y-verdict--good' : 'y-verdict--bad');
      el.verdict.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = correct ? (feedback.correct || 'Correct — roll the dice.') : (feedback.incorrect || 'Incorrect — the turn is skipped.');
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

    function renderDice() {
      for (var i = 0; i < el.diceList.length; i++) {
        var die = el.diceList[i];
        die.textContent = state.dice[i] ? String(state.dice[i]) : '-';
        die.classList.toggle('y-die--rolled', !!state.dice[i]);
      }
    }

    function renderSheet() {
      var filled = 0, userTotal = 0, botTotal = 0;
      for (var i = 0; i < CATS.length; i++) {
        var entry = state.sheet[i];
        if (el.cells[i]) el.cells[i].textContent = entry ? String(entry.score) : '-';
        if (el.bys[i]) {
          el.bys[i].textContent = entry ? (entry.by === 'you' ? 'you' : 'bot') : '';
          el.bys[i].className = 'y-by' + (entry ? (entry.by === 'you' ? ' y-by--you' : ' y-by--bot') : '');
        }
        if (entry) {
          filled++;
          if (entry.by === 'you') userTotal += entry.score; else botTotal += entry.score;
        }
      }
      state.userTotal = userTotal;
      state.botTotal = botTotal;
      el.filled.textContent = String(filled);
      el.usertotal.textContent = String(userTotal);
      el.bottotal.textContent = String(botTotal);
    }

    function askNext() {
      // The cursor decides which question this is, and it is the same cursor
      // that decided the last one: a round that restarts after game over
      // continues the set rather than repeating it. When the pool is finally
      // spent it wraps and the payload's own out-of-questions line says so.
      var next = GAME_CURSOR.next(QUESTIONS.length);
      state.item = QUESTIONS[next.index];
      state.qPos = next.index;
      state.qNo = next.index + 1;
      state.phase = 'question';
      state.qStartMs = Date.now();
      renderQuestion();
      el.verdict.hidden = true;
      el.action.disabled = true;
      el.status.textContent = next.wrapped
        ? (feedback.outOfQuestions || 'Out of questions — the set starts again.')
        : 'Answer to roll the dice.';
    }

    function endGame(result) {
      if (state.phase === 'over') return;
      state.phase = 'over';
      var message = result === 'win' ? (feedback.win || 'You win!')
        : result === 'lose' ? (feedback.lose || 'The sheet is full.')
        : (feedback.draw || 'Finished.');
      el.status.textContent = message;
      el.result.textContent = message;
      el.result.className = 'y-result y-result--' + result;
      el.endstats.textContent = 'You answered ' + state.correct + ' correct and ' + state.wrong
        + ' incorrect of ' + state.used + ' questions, scoring ' + state.userTotal
        + " to the bot's " + state.botTotal + '.';
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
      // The spec's end condition: the game ends when all 13 categories are filled.
      for (var i = 0; i < CATS.length; i++) if (!state.sheet[i]) { askNext(); return; }
      endGame(state.userTotal > state.botTotal ? 'win'
        : state.userTotal < state.botTotal ? 'lose' : 'draw');
    }

    function takeTurn(who) {
      var dice = rollDice();
      var cat = bestOpenCategory(dice);
      if (cat < 0) return '';
      state.dice = dice;
      state.sheet[cat] = { score: scoreCategory(cat, dice), by: who };
      renderDice();
      renderSheet();
      return CATS[cat];
    }

    function onAnswer(index) {
      if (state.phase !== 'question') return;
      var item = state.item;
      var opts = (item.choices || []).slice(0, CHOICES);
      var correct = Number(item.answerIndex) === index;
      var buttons = el.choices.querySelectorAll('.y-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 'y-choice--right' : 'y-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('y-choice--right');
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
        // The roll is ready and waiting: one click sends the dice out.
        state.phase = 'ready';
        el.status.textContent = feedback.correct || 'Correct — roll the dice.';
        el.action.disabled = false;
      } else {
        // The turn is skipped and the bot rolls into the category instead.
        var cat = takeTurn('bot');
        el.status.textContent = (feedback.incorrect || 'Incorrect — the turn is skipped.')
          + (cat ? ' The bot rolled and took ' + cat + '.' : '');
        finishTurn();
      }
    }

    function userRoll() {
      if (state.phase !== 'ready') return;
      state.phase = 'playing';
      el.action.disabled = true;
      var cat = takeTurn('you');
      el.status.textContent = cat
        ? 'You rolled and took ' + cat + '. ' + (13 - Number(el.filled.textContent)) + ' categories left.'
        : 'You rolled.';
      finishTurn();
    }

    // ---- wire up a fresh game --------------------------------------------------
    //
    // The sheet resets; the question cursor does not. "Play again" is another
    // game taken up at the next unseen question, never the same one twice.
    state = {
      item: null, qPos: 0, qNo: 0, used: 0, correct: 0, wrong: 0,
      dice: [0, 0, 0, 0, 0], sheet: [], userTotal: 0, botTotal: 0,
      phase: 'question', qStartMs: 0,
    };
    for (var s = 0; s < CATS.length; s++) state.sheet.push(null);
    el.modal.dataset.open = 'false';
    el.verdict.hidden = true;
    el.topic.textContent = meta.topic ? String(meta.topic) : '';
    el.topic.hidden = !meta.topic;
    renderDice();
    renderSheet();
    // Where "Next level" goes is the page's to say, not the engine's: without a
    // door handed in from outside, the button stays out of the way.
    el.next.hidden = true;
    if (window.PolymathGame && window.PolymathGame.nextLevelUrl) {
      el.next.href = window.PolymathGame.nextLevelUrl;
      el.next.hidden = false;
    }

    el.choices.onclick = function (event) {
      var btn = event.target.closest ? event.target.closest('.y-choice') : null;
      if (btn && !btn.disabled) onAnswer(Number(btn.dataset.index));
    };
    el.action.onclick = userRoll;
    el.restart.onclick = function () { window.initGame(payload); };

    askNext();
    emit('start', { engineId: 'yahtzee' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
