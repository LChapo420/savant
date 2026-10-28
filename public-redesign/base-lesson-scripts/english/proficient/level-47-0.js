
  /* Carnival Ring Toss — base engine.
   *
   * The engine holds game logic only; every question, choice, explanation and
   * message arrives through window.GAME_DATA at the injection marker below.
   *
   * The rules (per the game spec): the four bottles carry the four answer
   * choices and the learner throws a ring at the bottle whose answer is right.
   * A ring on the correct bottle counts a correct toss; a ring on a wrong
   * bottle asks a new question. The game ends at 4 correct tosses, with the
   * optional early finish alongside.
   *
   * Events out (dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, questionIndex, correct, chosen, ms}
   *   game:win    {source, engineId, result, correct, wrong, questionsUsed}
   *   game:draw   {source, engineId, result, correct, wrong, questionsUsed}
   */
  window.GAME_ID = 'ring-toss';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"ring-toss","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":47,"topic":"Activity 7 of 9 (quiz/game): Write Your Own (Rubric Check) - Shifts in Voice and Mood","title":"Rubric Check: Shifts in Voice and Mood","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":7,"end":9,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q03","prompt":"Which revision keeps mood consistent in: Submit your application before Friday, and you should then wait for a reply?","choices":["Submit your application before Friday, and you should then wait for a reply.","Submit your application before Friday, and then wait for a reply.","You should submit your application before Friday, and wait for a reply is next.","Wait for a reply, and submit your application before Friday."],"answerIndex":3,"explanation":"Both clauses must stay imperative to remove the shift from a command to a statement of what you should do.","difficulty":7,"skill":"Fixing mood shifts","topic":"Shifts in Voice and Mood"},{"id":"q31","prompt":"What mood is used in the clause that he be present at the meeting?","choices":["regular past tense","conditional future","subjunctive","indicative"],"answerIndex":2,"explanation":"She insisted that he be present uses the subjunctive base form be, not the past tense.","difficulty":8,"skill":"Classifying moods","topic":"Shifts in Voice and Mood"},{"id":"q06","prompt":"Why does an unmarked shift from active to passive voice often confuse readers?","choices":["It makes the writing shorter.","It can make the doer of the action unclear.","It always changes the meaning of the sentence.","It forces the writer to repeat the subject."],"answerIndex":1,"explanation":"An unplanned passive can hide who performs the action, which misleads readers about responsibility.","difficulty":7,"skill":"Explaining why shifts confuse","topic":"Shifts in Voice and Mood"},{"id":"q17","prompt":"Which sentence most clearly contains an inappropriate shift from active to passive voice?","choices":["I was given the award by the principal.","The principal handed me the award, and I was photographed holding it.","The principal handed me the award, and I smiled for the camera.","The award was given to me by the principal, and I was photographed holding it."],"answerIndex":2,"explanation":"It shifts from active (handed) to passive (was photographed) with no marked purpose for the change.","difficulty":8,"skill":"Identifying voice shifts","topic":"Shifts in Voice and Mood"},{"id":"q22","prompt":"Which sentence correctly uses the subjunctive after a demand?","choices":["She asked that the report be finished by noon.","She asked that the report is finished by noon.","She asked that the report was finished by noon.","She asked that the report will be finished by noon."],"answerIndex":0,"explanation":"A formal demand clause takes the subjunctive base form be.","difficulty":9,"skill":"Recognizing mood errors","topic":"Shifts in Voice and Mood"},{"id":"q24","prompt":"Why do rubrics penalize inappropriate shifts even when every clause is grammatical on its own?","choices":["because the writer ran out of ideas","because readers lose track of who acts and what is commanded","because long sentences are always wrong","because shifts add words to the sentence"],"answerIndex":1,"explanation":"Shifts mislead readers about agency and instruction, which is why rubrics penalize unmarked ones.","difficulty":7,"skill":"Explaining why shifts confuse","topic":"Shifts in Voice and Mood"},{"id":"q14","prompt":"Which version keeps the mood consistent in: I wish she was here is wrong; the correct form is I wish — here?","choices":["if she has","if she was","if she were","if she is"],"answerIndex":2,"explanation":"A wish about something unreal uses the subjunctive were.","difficulty":8,"skill":"Fixing mood shifts","topic":"Shifts in Voice and Mood"},{"id":"q34","prompt":"Which mood appears in the sentence: The museum opens at nine every morning?","choices":["Indicative","Imperative","Subjunctive","Conditional"],"answerIndex":0,"explanation":"A factual statement about state lands uses the ordinary indicative mood.","difficulty":7,"skill":"Classifying moods","topic":"Shifts in Voice and Mood"},{"id":"q19","prompt":"Why is the shift acceptable in: The poem was written in 1919, and it still moves readers today?","choices":["Passive keeps focus on the poem, which is the real topic.","Passive is shorter than active in every case.","Passive makes the poet seem more important.","Passive avoids all need for a verb."],"answerIndex":0,"explanation":"Deliberate passive is acceptable when the receiver of the action, not the doer, deserves the emphasis.","difficulty":8,"skill":"Judging acceptable shifts","topic":"Shifts in Voice and Mood"},{"id":"q38","prompt":"Which sentence gives directions without an inappropriate mood shift?","choices":["Turn left at the sign, and the bridge will be crossed.","You will turn left at the sign, and cross the bridge.","Turn left at the sign, and then cross the bridge.","The bridge is crossed, and turn left at the sign."],"answerIndex":2,"explanation":"Both directions stay imperative, so the mood remains consistent.","difficulty":7,"skill":"Choosing consistent revisions","topic":"Shifts in Voice and Mood"},{"id":"q35","prompt":"Which revision removes the inappropriate shift in: The storm knocked out the power, and repairs were delayed by the crew?","choices":["Replace the second clause with a question.","Make both clauses passive.","Make both clauses active.","Add a comma before and."],"answerIndex":2,"explanation":"Consistent active voice in both clauses removes the unmarked voice shift.","difficulty":8,"skill":"Choosing consistent revisions","topic":"Shifts in Voice and Mood"},{"id":"q16","prompt":"What is the most direct rubric-based fix for a sentence with an inappropriate shift?","choices":["Rewrite it as a run-on to save space.","Rewrite both clauses in the same voice and mood.","Delete the second clause entirely.","Add more adjectives to distract from the shift."],"answerIndex":1,"explanation":"Consistency in voice and mood across clauses is the standard fix for an inappropriate shift.","difficulty":7,"skill":"Fixing mood shifts","topic":"Shifts in Voice and Mood"},{"id":"q50","prompt":"A student checks a draft against the rubric before submitting. Which step shows the rubric was applied correctly?","choices":["List every sentence, active and passive, with no commentary.","Declare that all shifts must be removed from the draft.","Praise only sentences written in the imperative mood.","Mark each unmarked shift, explain why it misleads, and allow deliberate shifts for emphasis."],"answerIndex":3,"explanation":"A fair rubric flags confusing shifts, asks for reasons, and permits purposeful ones.","difficulty":9,"skill":"Applying rubric criteria","topic":"Shifts in Voice and Mood"},{"id":"q32","prompt":"Which revision fixes the shift in: Please take your seats, and you should fasten your seatbelts?","choices":["Please take your seats, and you should fasten your seatbelts.","Please take your seats, and fasten your seatbelts.","Your seats should be taken, and fasten your seatbelts.","Fasten your seatbelts, and please take your seats are next."],"answerIndex":1,"explanation":"Both clauses must remain imperative to keep the mood consistent.","difficulty":7,"skill":"Fixing mood shifts","topic":"Shifts in Voice and Mood"},{"id":"q33","prompt":"A rubric criterion reads: Maintain one mood across linked clauses. Why does Press the button, and the machine starts fail it?","choices":["It shifts from active to passive at the second clause.","It shifts from past to present at the second clause.","It shifts from imperative to indicative at the second clause.","It shifts from indicative to imperative at the second clause."],"answerIndex":3,"explanation":"A rubric for consistency flags the unmarked move from command to statement.","difficulty":8,"skill":"Applying rubric criteria","topic":"Shifts in Voice and Mood"},{"id":"q04","prompt":"Which sentence contains a subjunctive mood error rather than an acceptable indicative use?","choices":["If I were captain, I would start the bench players.","If I was captain, I would start the bench players.","If I am captain, I start the bench players.","I am captain, so I start the bench players."],"answerIndex":0,"explanation":"A condition contrary to fact requires the subjunctive were, so was signals a mood error.","difficulty":7,"skill":"Recognizing mood errors","topic":"Shifts in Voice and Mood"},{"id":"q49","prompt":"In: The judge demanded that the witness was silent, which shift does the underlined clause contain?","choices":["conditional mood shift","subjunctive mood shift","passive voice shift","tense shift only"],"answerIndex":1,"explanation":"Demand clauses take the subjunctive, so were signals an inappropriate mood shift.","difficulty":8,"skill":"Naming shift patterns","topic":"Shifts in Voice and Mood"},{"id":"q05","prompt":"Where does the shift occur in: Open the manual, and the diagram will explain each step?","choices":["in the first clause","in the second clause","between the two clauses","nowhere; the sentence is correct"],"answerIndex":2,"explanation":"The change from imperative to indicative happens at the clause boundary, so that is where the revision should focus.","difficulty":7,"skill":"Locating shift points","topic":"Shifts in Voice and Mood"},{"id":"q02","prompt":"Which statement best explains why the shift in She wrote her essay in one night; it was then proofread by her brother can be acceptable?","choices":["an inappropriate voice shift","an acceptable deliberate shift for emphasis","an indicative-to-imperative mood shift","a shift that confuses the reader"],"answerIndex":2,"explanation":"Passive is used to keep attention on the storm itself, so the shift is deliberate and serves a purpose.","difficulty":8,"skill":"Judging acceptable shifts","topic":"Shifts in Voice and Mood"},{"id":"q13","prompt":"Which statement about the subjunctive mood is accurate?","choices":["that it signals statements of fact and ordinary questions","that it marks commands directed at a second person","that it signals wishes, demands, and conditions contrary to fact","that it shows completed actions in the recent past"],"answerIndex":1,"explanation":"Subjunctive forms like were and be mark wishes, formal demands, and unreal conditions.","difficulty":7,"skill":"Classifying moods","topic":"Shifts in Voice and Mood"},{"id":"q37","prompt":"Which sentence keeps a consistent conditional pattern for a past unreal situation?","choices":["If the coach had arrived earlier, the drill would have started on time.","If the coach would arrive earlier, the drill will start on time.","If the coach arrives earlier, the drill would have started.","If the coach was arriving earlier, the drill starts on time."],"answerIndex":0,"explanation":"A past unreal condition pairs the past perfect with would have plus the past participle.","difficulty":9,"skill":"Distinguishing conditional moods","topic":"Shifts in Voice and Mood"},{"id":"q27","prompt":"Which sentence uses subjunctive mood correctly for a hypothetical?","choices":["If I were the editor, I would cut the second paragraph.","If I was the editor, I would cut the second paragraph.","If I am the editor, I cut the second paragraph.","I was the editor, and the second paragraph is cut."],"answerIndex":0,"explanation":"An unreal condition uses subjunctive were plus would in the result clause.","difficulty":8,"skill":"Recognizing mood errors","topic":"Shifts in Voice and Mood"},{"id":"q39","prompt":"In the sentence: The winner was chosen by the judges, which construction is used?","choices":["active voice","passive voice","subjunctive mood","imperative mood"],"answerIndex":1,"explanation":"Was chosen places the receiver in the subject position, marking passive voice.","difficulty":7,"skill":"Identifying voice shifts","topic":"Shifts in Voice and Mood"},{"id":"q07","prompt":"Which sentence keeps voice consistent from clause to clause?","choices":["The beaker was filled with the solution, and then the solution was heated slowly.","Fill the beaker with the solution, and then the solution is heated slowly.","The beaker was filled with the solution, and then heat it slowly.","Fill the beaker with the solution, and it was heated slowly."],"answerIndex":0,"explanation":"Both clauses use passive voice, so no unmarked shift occurs between them.","difficulty":8,"skill":"Choosing consistent revisions","topic":"Shifts in Voice and Mood"},{"id":"q12","prompt":"A rubric asks students to name the pattern of an inappropriate voice shift. Which pattern fits?","choices":["An imperative clause followed by an imperative clause","A passive clause followed by a passive clause","A subjunctive clause followed by a conditional clause","A passive clause followed by an active clause"],"answerIndex":3,"explanation":"Moving from passive to active without signaling a purpose is the classic inappropriate voice shift.","difficulty":7,"skill":"Naming shift patterns","topic":"Shifts in Voice and Mood"},{"id":"q18","prompt":"Which mood is signaled by: If the alarm rang, we would evacuate?","choices":["Indicative","Subjunctive","Imperative","Conditional"],"answerIndex":3,"explanation":"If clause plus would clause marks a conditional sentence.","difficulty":7,"skill":"Classifying moods","topic":"Shifts in Voice and Mood"},{"id":"q09","prompt":"On a rubric for voice consistency, why would the sentence The coach praised the team, and the trophy was lifted high be marked down?","choices":["Because passive voice is incorrect in formal writing.","Because the active sentence is always clearer.","Because the shift is unmarked and changes who performs the action.","Because both clauses should be questions."],"answerIndex":2,"explanation":"The problem is the unmarked mid-sentence change from active to passive, not a rule against passive voice itself.","difficulty":8,"skill":"Applying rubric criteria","topic":"Shifts in Voice and Mood"},{"id":"q20","prompt":"A rubric says: Identify the error type in Lock the door, and the lights will turn off automatically. What should a student write?","choices":["a subject-verb agreement error","a punctuation error","an inappropriate shift in mood","a capitalization error"],"answerIndex":2,"explanation":"The sentence slides from imperative to indicative, an unmarked mood shift that a consistency rubric flags.","difficulty":7,"skill":"Applying rubric criteria","topic":"Shifts in Voice and Mood"},{"id":"q10","prompt":"Which sentence states a real, likely condition rather than an impossible one?","choices":["If you will finish the lab report, the teacher will grade it.","If you finish the lab report, the teacher will grade it.","If you would finish the lab report, the teacher will grade it.","If you finished the lab report, the teacher will grade it."],"answerIndex":1,"explanation":"A likely future condition uses the present indicative in the if-clause and will in the result clause.","difficulty":8,"skill":"Distinguishing conditional moods","topic":"Shifts in Voice and Mood"},{"id":"q47","prompt":"Which sentence pairs its if-clause and result clause in consistent conditional moods for a real possibility?","choices":["If it rains tomorrow, the game is canceled.","If it rained yesterday, the game is canceled.","If it were to have rained, the game will be canceled.","If it rains tomorrow, the game will have been canceled already."],"answerIndex":0,"explanation":"A real future condition pairs present indicative in the if-clause with a plain present result.","difficulty":9,"skill":"Distinguishing conditional moods","topic":"Shifts in Voice and Mood"},{"id":"q01","prompt":"Which pair of voice choices appears in the sentence: While she was startled by the noise, a fox was watching from the fence?","choices":["past tense and present tense","active voice and passive voice","imperative mood and indicative mood","subject and object"],"answerIndex":1,"explanation":"Passive she was startled shifts to active a fox was watching, an unmarked voice change mid-sentence.","difficulty":7,"skill":"Identifying voice shifts","topic":"Shifts in Voice and Mood"},{"id":"q36","prompt":"In: After the jurors settled into their seats, the verdict was read by the clerk, what does the second clause introduce?","choices":["subordinating conjunction","unmarked voice shift","dangling modifier","redundant pronoun"],"answerIndex":1,"explanation":"Active settled then passive was made is an unmarked voice shift mid-sentence.","difficulty":8,"skill":"Identifying voice shifts","topic":"Shifts in Voice and Mood"},{"id":"q11","prompt":"Where is the inappropriate shift in: First, heat the oil; then the onions are added to the pan?","choices":["First, heat the oil; then the onions are added.","First, heat the oil; then add the onions.","First, the oil is heated; then the onions are added.","First, you will heat the oil; then add the onions."],"answerIndex":0,"explanation":"The first command is imperative but the second clause flips to passive, an unmarked mood and voice shift.","difficulty":7,"skill":"Locating shift points","topic":"Shifts in Voice and Mood"},{"id":"q23","prompt":"In: Please sign the form, and then it should be returned to the office, what two changes happen at once?","choices":["tense and person shift together","voice and mood shift together","voice and number shift together","mood and subject shift together"],"answerIndex":3,"explanation":"Voice flips active to passive and mood flips imperative to indicative at the same boundary.","difficulty":8,"skill":"Naming shift patterns","topic":"Shifts in Voice and Mood"},{"id":"q46","prompt":"Which sentence keeps both voice and mood consistent?","choices":["Write the summary in full sentences, and it will be checked by the teacher.","Write the summary in full sentences, and check your spelling before submitting.","The summary is written in full sentences, and check your spelling.","Check your spelling, and the summary is written in full sentences."],"answerIndex":1,"explanation":"Both clauses stay imperative, matching the instructions the writer is giving.","difficulty":7,"skill":"Choosing consistent revisions","topic":"Shifts in Voice and Mood"},{"id":"q40","prompt":"How can a writer make a deliberate shift acceptable rather than confusing?","choices":["Add an exclamation point to the second clause.","Change both verbs to past tense.","Move the second clause to the front.","Mark the change with a word like however or meanwhile."],"answerIndex":3,"explanation":"A signal word shows the change is deliberate, so readers are not misled by an unmarked shift.","difficulty":8,"skill":"Judging acceptable shifts","topic":"Shifts in Voice and Mood"},{"id":"q15","prompt":"Which feature most clearly signals a voice shift rather than a tense problem?","choices":["One clause is in past tense while the other is in present without a reason for the change.","One clause is passive while the other is active without a reason for the change.","One clause uses subjunctive while the other uses indicative in the same sentence.","One clause names the actor while the other omits any actor entirely."],"answerIndex":0,"explanation":"A voice shift is specifically an unmarked move between active and passive constructions.","difficulty":7,"skill":"Identifying voice shifts","topic":"Shifts in Voice and Mood"},{"id":"q45","prompt":"Which purpose justifies a shift under most rubrics?","choices":["It lets the writer use fewer verbs.","It lets the writer avoid all commands.","It lets the writer contrast a command with a prediction for emphasis.","It lets the writer drop the subject of every clause."],"answerIndex":2,"explanation":"Deliberate shifts create contrast or emphasis, which is exactly what the boundary permits.","difficulty":9,"skill":"Judging acceptable shifts","topic":"Shifts in Voice and Mood"},{"id":"q43","prompt":"Which sentence keeps mood consistent while still commanding the reader?","choices":["Paint the fence, and the paint dries overnight.","Paint the fence, and let the paint dry overnight.","The fence is painted, and the paint dries overnight.","The paint dries overnight, and paint the fence."],"answerIndex":1,"explanation":"Command plus imperative let keeps both clauses in the imperative mood.","difficulty":7,"skill":"Fixing mood shifts","topic":"Shifts in Voice and Mood"},{"id":"q21","prompt":"Which revision keeps mood consistent in: Close the window, and the room will stay warmer?","choices":["Close the window, and the room is warmer.","Close the window, and the room will stay warmer.","The window is closed, and the room stays warmer.","The window will be closed, and close the door too."],"answerIndex":1,"explanation":"Both clauses become imperative, matching the command the writer intends.","difficulty":8,"skill":"Fixing mood shifts","topic":"Shifts in Voice and Mood"},{"id":"q28","prompt":"Which pairing describes an inappropriate mood shift within one sentence?","choices":["An imperative clause joined to a passive clause","Two active clauses in different tenses","An imperative clause joined to an indicative clause","Two subjunctive clauses in the same tense"],"answerIndex":2,"explanation":"A mood shift moves between moods, here from command to statement.","difficulty":7,"skill":"Naming shift patterns","topic":"Shifts in Voice and Mood"},{"id":"q42","prompt":"What does the change from if she was to if she were illustrate?","choices":["that to be was added","that the verb should change to was","that the subjunctive were signals an unreal condition","that were and was are interchangeable here"],"answerIndex":2,"explanation":"Subjunctive were is required for conditions contrary to fact, unlike the past tense was.","difficulty":8,"skill":"Recognizing mood errors","topic":"Shifts in Voice and Mood"},{"id":"q25","prompt":"Which sentence maintains consistent mood throughout?","choices":["Wash the car, and waxing it is next.","Wash the car, and then it is waxed.","Wash the car, and then wax it.","The car is washed, and wax it next."],"answerIndex":2,"explanation":"Both commands stay imperative, so no mood shift occurs.","difficulty":7,"skill":"Choosing consistent revisions","topic":"Shifts in Voice and Mood"},{"id":"q44","prompt":"In: The gardener planted the roses, and the beds were mulched with bark, where is the voice shift?","choices":["the second clause, where the voice changes from active to passive","the first clause, where the tense changes","the conjunction, where the comma belongs","nowhere; both clauses are passive"],"answerIndex":0,"explanation":"The active verb planted gives way to the passive was watered, so the shift sits in the second clause.","difficulty":8,"skill":"Locating shift points","topic":"Shifts in Voice and Mood"},{"id":"q41","prompt":"Which rubric line best matches the skill of avoiding inappropriate shifts?","choices":["whether the mood stays consistent unless the change is deliberate","whether the sentence contains at least ten words","whether every verb is in passive voice","whether the subject appears before the verb"],"answerIndex":0,"explanation":"Rubrics for this skill test consistency, allowing only purposeful, marked shifts.","difficulty":7,"skill":"Applying rubric criteria","topic":"Shifts in Voice and Mood"},{"id":"q30","prompt":"Which choice reflects the rubric's allowance for deliberate shifts in: The samples were tested twice, and the results confirmed the hypothesis?","choices":["Keep it; the passive deliberately emphasizes the results over the researcher.","Cut it; passive voice is never acceptable.","Rewrite it; both clauses must be imperative.","Split it; two sentences can never share a voice."],"answerIndex":0,"explanation":"Scientific writing often uses passive deliberately to foreground the findings, so the shift is purposeful.","difficulty":9,"skill":"Judging acceptable shifts","topic":"Shifts in Voice and Mood"},{"id":"q48","prompt":"Which revision makes the voice consistent in: The committee approved the plan, and it was announced by the members?","choices":["The committee approved the plan, and the plan was announced.","The committee approved the plan, and the plan is approved.","The committee approved the plan, and members announced it immediately.","The plan was approved, and members announced it immediately."],"answerIndex":2,"explanation":"Both clauses stay active with the same agent in charge of the actions.","difficulty":8,"skill":"Choosing consistent revisions","topic":"Shifts in Voice and Mood"},{"id":"q08","prompt":"What mood is signaled by the sentence: Read the safety card before takeoff?","choices":["conditional","indicative","subjunctive","imperative"],"answerIndex":3,"explanation":"A direct command addressed to the reader is in the imperative mood.","difficulty":7,"skill":"Classifying moods","topic":"Shifts in Voice and Mood"},{"id":"q29","prompt":"A peer reviewer marks a sentence for an unclear agent. Which shift most likely caused the mark?","choices":["the stronger verb appears in passive voice","readers cannot tell who performs the action","the subject is repeated twice","the sentence becomes a fragment"],"answerIndex":1,"explanation":"The confusion caused by an unmarked passive is about unclear agency, not length or fragments.","difficulty":8,"skill":"Explaining why shifts confuse","topic":"Shifts in Voice and Mood"},{"id":"q26","prompt":"Where should a student focus a rewrite in: Read the recipe carefully, and the cake was baked in an hour?","choices":["second clause","first clause","conjunction","there is no shift"],"answerIndex":1,"explanation":"The shift from imperative to indicative occurs where was delivered begins.","difficulty":7,"skill":"Locating shift points","topic":"Shifts in Voice and Mood"}],"feedback":{"correct":"Good ring — that bottle was the rubric-worthy choice.","incorrect":"Missed the bottle. Watch where the voice or mood changes without a reason.","win":"Four rings, four right bottles — your rubric-check instincts are sharp.","lose":"The ring never landed. Re-read the shift rules and come back to the game.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

  /* The question cursor, taken from the page shell so every game on the site
   * moves through its questions the same way: a question is asked once, and
   * losing, answering wrong, or pressing Play again continues at the next
   * unseen one instead of restarting the set. */
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
    var TOSSES_TO_WIN = 4;
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'), prompt: q('prompt'),
      choices: q('choices'), verdict: q('verdict'), tosses: q('tosses'), thrown: q('thrown'),
      end: q('end'), modal: q('modal'), result: q('result'), endstats: q('endstats'),
      restart: q('restart'), next: q('next'),
    };

    var state = null;

    function emit(name, detail) {
      var data = { source: 'ring-toss', engineId: 'ring-toss' };
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
        btn.className = 't-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var bottle = document.createElement('span');
        bottle.className = 't-bottle';
        bottle.setAttribute('aria-hidden', 'true');
        var key = document.createElement('span');
        key.className = 't-key';
        key.textContent = KEYS[i] || String(i + 1);
        var text = document.createElement('span');
        text.textContent = opts[i];
        btn.appendChild(bottle);
        btn.appendChild(key);
        btn.appendChild(text);
        btn.setAttribute('aria-label', 'Bottle ' + (KEYS[i] || i + 1) + ': ' + opts[i] + ' — throw a ring here');
        el.choices.appendChild(btn);
      }
    }

    function renderVerdict(correct, item) {
      var opts = (item.choices || []).slice(0, CHOICES);
      var answerText = opts[Number(item.answerIndex)] || '';
      el.verdict.hidden = false;
      el.verdict.className = 't-verdict ' + (correct ? 't-verdict--good' : 't-verdict--bad');
      el.verdict.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = correct ? (feedback.correct || 'Correct — the ring lands.') : (feedback.incorrect || 'Incorrect — the ring misses.');
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
      var next = GAME_CURSOR.next(QUESTIONS.length);
      state.item = QUESTIONS[next.index];
      state.qPos = next.index;
      state.qNo = next.index + 1;
      state.phase = 'question';
      state.qStartMs = Date.now();
      renderQuestion();
      el.verdict.hidden = true;
      el.status.textContent = next.wrapped
        ? (feedback.outOfQuestions || 'Out of questions — the set starts again.')
        : 'Throw a ring at the bottle whose answer is right.';
    }

    function endGame(result) {
      state.phase = 'over';
      var message = result === 'win' ? (feedback.win || 'You win!')
        : result === 'lose' ? (feedback.lose || 'Not this time.')
        : (feedback.draw || 'Finished.');
      el.status.textContent = message;
      el.result.textContent = message;
      el.result.className = 't-result t-result--' + result;
      el.endstats.textContent = 'You answered ' + state.correct + ' correct and ' + state.wrong
        + ' incorrect of ' + state.used + ' questions, with ' + state.tosses + ' correct tosses.';
      el.modal.dataset.open = 'true';
      emit(result, {
        result: result,
        correct: state.correct,
        wrong: state.wrong,
        questionsUsed: state.used,
      });
      el.restart.focus();
    }

    function toss(index) {
      if (state.phase !== 'question') return;
      var item = state.item;
      var opts = (item.choices || []).slice(0, CHOICES);
      var correct = Number(item.answerIndex) === index;
      var buttons = el.choices.querySelectorAll('.t-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 't-choice--right' : 't-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('t-choice--right');
        }
      }
      state.used++;
      state.thrown++;
      if (correct) { state.correct++; state.tosses++; } else state.wrong++;
      el.tosses.textContent = String(state.tosses);
      el.thrown.textContent = String(state.thrown);
      renderVerdict(correct, item);
      emit('answer', {
        questionId: item.id || 'q' + state.used,
        questionIndex: state.qPos,
        correct: correct,
        chosen: opts[index] == null ? '' : String(opts[index]),
        ms: state.qStartMs ? Date.now() - state.qStartMs : null,
      });

      if (correct) {
        el.status.textContent = feedback.correct || 'Correct — the ring lands.';
        if (state.tosses >= TOSSES_TO_WIN) {
          endGame('win');
          return;
        }
      } else {
        el.status.textContent = feedback.incorrect || 'Incorrect — the ring misses. A new question is asked.';
      }
      askNext();
    }

    function finish() {
      if (state.phase === 'over') return;
      endGame('draw');
    }

    // ---- wire up a fresh round -------------------------------------------------
    //
    // The counter resets; the question cursor does not. "Play again" is another
    // set of tosses taken up at the next unseen question, never the same one.
    state = {
      item: null, qPos: 0, qNo: 0, used: 0, correct: 0, wrong: 0,
      tosses: 0, thrown: 0, phase: 'question', qStartMs: 0,
    };
    el.modal.dataset.open = 'false';
    el.verdict.hidden = true;
    el.tosses.textContent = '0';
    el.thrown.textContent = '0';
    el.topic.textContent = meta.topic ? String(meta.topic) : '';
    el.topic.hidden = !meta.topic;
    el.next.hidden = true;
    if (window.PolymathGame && window.PolymathGame.nextLevelUrl) {
      el.next.href = window.PolymathGame.nextLevelUrl;
      el.next.hidden = false;
    }

    el.choices.onclick = function (event) {
      var btn = event.target.closest ? event.target.closest('.t-choice') : null;
      if (btn && !btn.disabled) toss(Number(btn.dataset.index));
    };
    el.end.onclick = finish;
    el.restart.onclick = function () { window.initGame(payload); };

    askNext();
    emit('start', { engineId: 'ring-toss' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
