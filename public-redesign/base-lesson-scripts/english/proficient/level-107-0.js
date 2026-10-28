
  /* Tic Tac Toe — base engine.
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
   * place an X in any empty cell you choose, answer it incorrectly and the bot
   * places an O. The game runs until someone gets three in a row or the board is
   * full (draw).
   *
   * Events out (window.GAME_EVENTS, dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, correct, ms, questionIndex}
   *   game:win    {source, engineId, result, correct, wrong, questionsUsed}
   *   game:lose   {source, engineId, result, correct, wrong, questionsUsed}
   *   game:draw   {source, engineId, result, correct, wrong, questionsUsed}
   */
  window.GAME_ID = 'tic-tac-toe';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"tic-tac-toe","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":107,"topic":"Activity 2 of 9 (quiz/game): Learn the Strategy - Tone Control in Writing","title":"Tone Control: The T.A.G. Strategy","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":7,"end":9,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"Q01","prompt":"A writer is using the T.A.G. strategy to control tone. What does the G stand for?","choices":["Genre — the type of writing being produced","Grammar — the correctness of the sentences","Goal — the effect the writer wants to have","Greeting — the way the writer opens"],"answerIndex":2,"explanation":"In the T.A.G. memory aid, G stands for Goal, the effect the writer wants the tone to have on the reader.","difficulty":8,"skill":"Applying the T.A.G. strategy","topic":"Tone Control in Writing"},{"id":"Q02","prompt":"What is the T in the T.A.G. strategy for tone control?","choices":["Theme — the message of the piece","Tone — the attitude the writer is aiming for","Tense — the time frame of the verbs","Title — the name given to the piece"],"answerIndex":1,"explanation":"T stands for Tone, the attitude toward the subject and audience that the writer chooses on purpose.","difficulty":8,"skill":"Applying the T.A.G. strategy","topic":"Tone Control in Writing"},{"id":"Q03","prompt":"Which step completes the T.A.G. strategy for tone control?","choices":["Aim — decide the reader's reaction in advance","Audience — decide who will be reading","Attitude — decide what is being felt","Adapt — revise the piece after drafting"],"answerIndex":0,"explanation":"A stands for Aim, deciding what you want the reader to feel or do before choosing words.","difficulty":8,"skill":"Applying the T.A.G. strategy","topic":"Tone Control in Writing"},{"id":"Q04","prompt":"A writer begins a complaint letter with, Dear Sir or Madam, I am writing to request an immediate refund. According to the T.A.G. strategy, which element is being set first?","choices":["The goal, by demanding a refund","The tone, by choosing formal wording","The aim, by stating a request","The genre, by using a letter format"],"answerIndex":1,"explanation":"Formal wording like Dear Sir or Madam establishes an impersonal, formal tone before any other element is built.","difficulty":7,"skill":"Recognizing tone in a sample","topic":"Tone Control in Writing"},{"id":"Q05","prompt":"Which sentence sets a sarcastic tone through word choice?","choices":["The volunteers finished the drive by noon.","Oh, brilliant — another meeting about meetings.","The meeting will begin at two o'clock.","Volunteers are needed for the drive."],"answerIndex":1,"explanation":"Brilliant used about a boring meeting, paired with the dash and exclamation, signals mockery rather than praise.","difficulty":7,"skill":"Identifying tone signals","topic":"Tone Control in Writing"},{"id":"Q06","prompt":"In the T.A.G. strategy, what is the relationship between aim and tone?","choices":["Aim is chosen first, and tone is selected to serve it","Tone is chosen first, and aim is chosen afterward","The two are decided at the same time","Aim applies to fiction, tone to nonfiction"],"answerIndex":0,"explanation":"The writer decides the aim first, then selects a tone that will move the reader toward that aim.","difficulty":8,"skill":"Sequencing the strategy","topic":"Tone Control in Writing"},{"id":"Q07","prompt":"Which diction would a writer most likely choose to keep a tone informal?","choices":["Subsequently, the assembly was convened.","We need to get this sorted out, right?","It is requested that attendees register.","The findings are presented herewith."],"answerIndex":1,"explanation":"Contractions and casual phrasing like get this sorted out keep the tone conversational and informal.","difficulty":7,"skill":"Matching diction to tone","topic":"Tone Control in Writing"},{"id":"Q08","prompt":"A writer wants an urgent tone in a public safety notice. Which sentence best delivers it?","choices":["Residents may wish to consider leaving the area.","It is suggested that residents evacuate the area.","Leave the area now; do not wait for further notice.","Evacuation is recommended for those nearby."],"answerIndex":2,"explanation":"Direct commands and a time marker like now create the urgency that a soft suggestion cannot.","difficulty":7,"skill":"Shaping tone for an aim","topic":"Tone Control in Writing"},{"id":"Q09","prompt":"Which revision keeps the tone of the sentence formal?","choices":["The data don't add up, so we're redoing the study.","Something's off with the data, so the study's being redone.","The results seem inconsistent, so the study will be repeated.","The data are weird, so we're running it again."],"answerIndex":2,"explanation":"Impersonal wording and the absence of contractions preserve a formal register in the revision.","difficulty":7,"skill":"Maintaining a chosen tone","topic":"Tone Control in Writing"},{"id":"Q10","prompt":"A writer aims to sound sympathetic after a reader's loss. Which opening fits that aim?","choices":["Please accept my sincere condolences on your loss.","The details of the estate are attached.","I regret that the deadline cannot be extended.","Records indicate the account has been closed."],"answerIndex":0,"explanation":"Sincere condolences directly acknowledge the reader's feeling, which is exactly what a sympathetic aim requires.","difficulty":7,"skill":"Matching tone to aim","topic":"Tone Control in Writing"},{"id":"Q11","prompt":"Which element most directly signals a shift from a light tone to a serious one?","choices":["A longer paragraph than the one before","A new speaker being introduced","A change from slang to plain, grave diction","A switch from past tense to present tense"],"answerIndex":2,"explanation":"Dropping slang in favor of grave, plain wording is the clearest signal that the writer's attitude has turned serious.","difficulty":8,"skill":"Noticing tonal shifts","topic":"Tone Control in Writing"},{"id":"Q12","prompt":"A writer reviews a first draft and finds the tone wanders from polite to hostile. What does the T.A.G. strategy ask the writer to check first?","choices":["Whether the paragraphs are the same length","Whether the aim still matches the intended reader","Whether every sentence ends with punctuation","Whether the vocabulary is difficult enough"],"answerIndex":1,"explanation":"Tone control starts with aim, so the writer first checks whether the aim still fits the intended reader and purpose.","difficulty":8,"skill":"Revising tone strategically","topic":"Tone Control in Writing"},{"id":"Q13","prompt":"In an email to a teacher, which choice would undercut a respectful tone?","choices":["Thank you for the feedback on my draft.","I appreciate the time you took to comment.","Whatever — the comments don't matter anyway.","I will revise the introduction as you suggested."],"answerIndex":2,"explanation":"Whatever dismisses the reader's effort and signals contempt, breaking the respectful tone.","difficulty":7,"skill":"Matching diction to tone","topic":"Tone Control in Writing"},{"id":"Q14","prompt":"Which sentence carries the most neutral, reportorial tone?","choices":["Thankfully, the storm passed without damage.","Sadly, the storm destroyed two barns.","The storm caused damage to two structures.","Tragically, the storm ruined everything."],"answerIndex":2,"explanation":"The plain statement of fact avoids the emotional adverbs that give the other sentences a leaning.","difficulty":7,"skill":"Identifying tone signals","topic":"Tone Control in Writing"},{"id":"Q15","prompt":"Which sentence shows an admiring tone toward its subject?","choices":["The team completed the project on schedule.","The team's handling of the crisis was masterful.","The team members held several meetings.","The team submitted its report in March."],"answerIndex":1,"explanation":"Masterful is an evaluative word that praises the team's performance, creating admiration.","difficulty":7,"skill":"Identifying tone signals","topic":"Tone Control in Writing"},{"id":"Q16","prompt":"Why does the T.A.G. strategy put the goal before drafting?","choices":["It saves the writer from having to choose words","It makes it possible to check the draft against a purpose","It ensures the piece will be graded highly","It removes the need to consider the audience"],"answerIndex":1,"explanation":"Knowing the goal ahead of time gives the writer a standard to measure the draft against during revision.","difficulty":8,"skill":"Sequencing the strategy","topic":"Tone Control in Writing"},{"id":"Q17","prompt":"Which sentence maintains a confident tone without tipping into arrogance?","choices":["Obviously, only a fool would disagree with me.","Our analysis supports the conclusion that the plan will work.","Anyone who reads this will see I am right.","I am the only person who understands this issue."],"answerIndex":1,"explanation":"Citing the analysis as support expresses confidence through evidence instead of insulting the reader.","difficulty":8,"skill":"Balancing a tone","topic":"Tone Control in Writing"},{"id":"Q18","prompt":"A paragraph about a charity opens warmly but ends with a blunt demand for money. Which part of T.A.G. has the writer failed to hold steady?","choices":["The greeting of the piece","The aim across the whole passage","The punctuation in the last line","The paragraph length of the piece"],"answerIndex":1,"explanation":"The warmth and the bluntness pull toward different aims, so the aim itself is inconsistent across the passage.","difficulty":8,"skill":"Revising tone strategically","topic":"Tone Control in Writing"},{"id":"Q19","prompt":"Which pair of words would most likely appear in a piece with a pessimistic tone?","choices":["hope, renewal","defeat, decline","growth, harmony","triumph, progress"],"answerIndex":1,"explanation":"Defeat and decline both point downward, a cluster of words that sustains a pessimistic attitude.","difficulty":7,"skill":"Matching diction to tone","topic":"Tone Control in Writing"},{"id":"Q20","prompt":"A writer addresses both a supervisor and a classmate in the same memo. How does the T.A.G. strategy suggest handling this?","choices":["Write two separate tones in alternating lines","Pick the audience whose reaction matters most and aim the tone there","Use slang so that both readers feel included","Ignore the audience and write from instinct"],"answerIndex":1,"explanation":"Because tone cannot serve two masters at once, the writer chooses the audience whose response matters most and aims there.","difficulty":8,"skill":"Adapting tone to audience","topic":"Tone Control in Writing"},{"id":"Q21","prompt":"Which sentence uses understatement as a tonal device?","choices":["The floodwaters rose twelve feet in an hour.","It's a little damp in the basement after the flood.","The flood was the worst in the town's history.","Water poured through every doorway."],"answerIndex":1,"explanation":"Calling a flooded basement a little damp deliberately shrinks the truth for ironic effect.","difficulty":7,"skill":"Identifying tone signals","topic":"Tone Control in Writing"},{"id":"Q22","prompt":"A persuasive essay opens with an anecdote about a hungry child. Under the T.A.G. strategy, what is the writer's immediate aim?","choices":["To prove the writer has done research","To stir sympathy before presenting an argument","To summarize the essay's main points","To establish the writer's credentials"],"answerIndex":1,"explanation":"The anecdote is chosen to make the reader feel sympathy first, which prepares the reader for the argument that follows.","difficulty":7,"skill":"Matching tone to aim","topic":"Tone Control in Writing"},{"id":"Q23","prompt":"Which transition softens a correction so that the tone stays collaborative?","choices":["Actually, you got that completely wrong.","That is not even close to the truth.","I see it differently — the data suggest a smaller effect.","You clearly didn't read the source."],"answerIndex":2,"explanation":"I see it differently frames the correction as a shared inquiry rather than an attack on the reader.","difficulty":7,"skill":"Balancing a tone","topic":"Tone Control in Writing"},{"id":"Q24","prompt":"A review calls a film a glorious mess from start to finish. What tone does this phrasing create?","choices":["Unqualified praise","Balanced, mixed judgment","Cold neutrality","Open hostility"],"answerIndex":1,"explanation":"Glorious mess joins a compliment to a criticism, producing a mixed evaluation rather than pure praise or blame.","difficulty":8,"skill":"Identifying tone signals","topic":"Tone Control in Writing"},{"id":"Q25","prompt":"Under the T.A.G. strategy, when should a writer check tone against aim?","choices":["Only after the piece has been published","Only when the teacher asks for a revision","At the start and again while revising","Only before choosing a topic"],"answerIndex":2,"explanation":"Tone is set at the start by the aim and then checked again during revision to catch drift.","difficulty":8,"skill":"Revising tone strategically","topic":"Tone Control in Writing"},{"id":"Q26","prompt":"Which sentence keeps a formal tone in a business report?","choices":["We kind of think profits might go up.","Profits are expected to increase next quarter.","Looks like we'll make more money soon.","We're pretty sure things will pick up."],"answerIndex":1,"explanation":"Impersonal phrasing and the absence of hedges like kind of or pretty sure preserve formal distance.","difficulty":7,"skill":"Maintaining a chosen tone","topic":"Tone Control in Writing"},{"id":"Q27","prompt":"Which revision best shifts a chatty blog paragraph into a solemn reflection?","choices":["Guess what — the old library is closing!","So the library is closing, and honestly that stinks.","The library that shaped our childhoods will close in June.","Check out this news about the library, folks."],"answerIndex":2,"explanation":"Referring to the library's influence on childhoods raises the diction to something measured and grave.","difficulty":8,"skill":"Shifting tone deliberately","topic":"Tone Control in Writing"},{"id":"Q28","prompt":"A writer wants the reader to feel uneasy. Which detail most serves that aim?","choices":["The hallway light flickered once, then held.","The hallway was painted a pale yellow.","The hallway measured thirty feet long.","The hallway had been cleaned that morning."],"answerIndex":0,"explanation":"A light that flickers before holding suggests something unstable, quietly unsettling the reader.","difficulty":7,"skill":"Shaping tone for an aim","topic":"Tone Control in Writing"},{"id":"Q29","prompt":"What does an exclamation mark most often add to the tone of a sentence?","choices":["A sense of emotional emphasis or urgency","A neutral distance between writer and reader","A formal, scholarly restraint","A doubt about the sentence's accuracy"],"answerIndex":0,"explanation":"The exclamation mark signals heightened feeling, excitement, or urgency rather than detachment.","difficulty":7,"skill":"Punctuation and tone","topic":"Tone Control in Writing"},{"id":"Q30","prompt":"Which question carries the most challenging, skeptical tone?","choices":["Could you tell me a little more about the results?","I was wondering how you measured the results.","Do you have any evidence at all for that claim?","When would be a good time to discuss the results?"],"answerIndex":2,"explanation":"Any evidence at all questions the reader's support directly, putting the reader on the spot.","difficulty":7,"skill":"Matching diction to tone","topic":"Tone Control in Writing"},{"id":"Q31","prompt":"Which sentence would be out of place in an objective news report?","choices":["The council voted five to two on the measure.","The hearing lasted nearly three hours.","The council's reckless decision will harm us all.","The measure takes effect in January."],"answerIndex":2,"explanation":"Reckless is an editorial judgment, which violates the neutral stance an objective report requires.","difficulty":7,"skill":"Maintaining a chosen tone","topic":"Tone Control in Writing"},{"id":"Q32","prompt":"A writer wants to sound humble while making a recommendation. Which sentence fits best?","choices":["My plan is the only sensible approach.","Only someone uninformed would reject this plan.","This approach may be worth considering given our budget.","Anyone with sense will adopt my proposal immediately."],"answerIndex":2,"explanation":"May be worth considering leaves room for other views, which is what humility in tone requires.","difficulty":8,"skill":"Balancing a tone","topic":"Tone Control in Writing"},{"id":"Q33","prompt":"Under the T.A.G. strategy, what signals that a goal has been reached in a piece of writing?","choices":["The piece has the required number of paragraphs","The reader's likely response matches the writer's aim","Every sentence uses the same vocabulary","The piece contains at least one quotation"],"answerIndex":1,"explanation":"A goal is met when the response the tone invites lines up with the aim the writer set.","difficulty":8,"skill":"Evaluating tone's effect","topic":"Tone Control in Writing"},{"id":"Q34","prompt":"A letter begins, To whom it may concern. What tone does this opening establish?","choices":["Warm and personal","Formal and impersonal","Playful and teasing","Angry and accusatory"],"answerIndex":1,"explanation":"The formula To whom it may concern addresses no named person, setting a distant and formal tone.","difficulty":7,"skill":"Recognizing tone in a sample","topic":"Tone Control in Writing"},{"id":"Q35","prompt":"Which word choice would most likely make a serious topic feel flippant?","choices":["A solemn ceremony honored the veterans.","The tragedy left the community in mourning.","Well, that whole disaster was a total bummer.","The report documented the extent of the damage."],"answerIndex":2,"explanation":"Casual slang like total bummer shrinks a serious subject, making the writer sound flippant.","difficulty":7,"skill":"Matching diction to tone","topic":"Tone Control in Writing"},{"id":"Q36","prompt":"A student writes a lab report in the first person with contractions throughout. Which part of the T.A.G. plan should be reconsidered?","choices":["The aim of informing the reader of results","The tone expected for scientific writing","The goal of finishing the report on time","The order of the report's sections"],"answerIndex":1,"explanation":"Lab reports call for impersonal, formal tone, so the choice of first person and contractions conflicts with it.","difficulty":8,"skill":"Adapting tone to audience","topic":"Tone Control in Writing"},{"id":"Q37","prompt":"Which sentence shows the clearest ironic tone?","choices":["The parade was held on a Saturday afternoon.","What a lovely day for a parade — said no one in the rain.","The parade included four marching bands.","About two hundred people attended the parade."],"answerIndex":1,"explanation":"Saying lovely about a rained-out parade, then undercutting it, makes the praise mean the opposite.","difficulty":7,"skill":"Identifying tone signals","topic":"Tone Control in Writing"},{"id":"Q38","prompt":"A writer wants to keep a respectful tone while disagreeing with a critic. Which sentence achieves that?","choices":["You couldn't be more mistaken about my work.","I value your reading, though I interpret the ending differently.","Your review completely misses the point.","Perhaps you should read the book again, slowly."],"answerIndex":1,"explanation":"Acknowledging the critic's value before offering a different reading keeps respect intact through the disagreement.","difficulty":8,"skill":"Balancing a tone","topic":"Tone Control in Writing"},{"id":"Q39","prompt":"Under the T.A.G. strategy, what is the risk of setting tone before deciding the goal?","choices":["The piece may be too short to be effective","The tone may not produce the response the writer wants","The vocabulary may be too simple for the reader","The paragraphs may not be evenly balanced"],"answerIndex":1,"explanation":"Without a goal first, the tone can be skillful yet pointed toward the wrong effect.","difficulty":8,"skill":"Sequencing the strategy","topic":"Tone Control in Writing"},{"id":"Q40","prompt":"Which sentence most clearly signals a shift to a cautionary tone?","choices":["The trail continues for another two miles.","The trail offers views of the valley below.","Warning: the next section includes exposed cliffs.","The trail was first mapped in 1924."],"answerIndex":2,"explanation":"The word Warning and the mention of exposed cliffs alert the reader to danger, which is caution in tone.","difficulty":7,"skill":"Noticing tonal shifts","topic":"Tone Control in Writing"},{"id":"Q41","prompt":"A writer aims for a nostalgic tone about a childhood home. Which detail best supports it?","choices":["The house contained four bedrooms and two baths.","The property sold for $240,000 last spring.","I can still smell the lilacs by the porch steps.","The roof was replaced in 2019."],"answerIndex":2,"explanation":"A sensory memory tied to a specific place evokes affectionate recollection, which is nostalgia.","difficulty":7,"skill":"Shaping tone for an aim","topic":"Tone Control in Writing"},{"id":"Q42","prompt":"Which sentence maintains a professional tone during a workplace apology?","choices":["Oops, my bad — things got a little crazy here.","I regret the error and have taken steps to correct it.","Sorry! Everything is such a mess right now.","Honestly, none of this was really my fault."],"answerIndex":1,"explanation":"Owning the error and naming the corrective action keeps the apology professional rather than casual or evasive.","difficulty":7,"skill":"Maintaining a chosen tone","topic":"Tone Control in Writing"},{"id":"Q43","prompt":"Which change in punctuation most clearly softens a demand into a request?","choices":["Adding an exclamation mark to the demand","Replacing a period with a colon","Turning the demand into a question with a question mark","Adding quotation marks around the demand"],"answerIndex":2,"explanation":"Framing the demand as a question invites the reader to agree rather than obeying an order.","difficulty":7,"skill":"Punctuation and tone","topic":"Tone Control in Writing"},{"id":"Q44","prompt":"A memoir paragraph shifts from fond recollection to quiet grief. What most likely caused the shift?","choices":["A change in verb tense alone","A move from specific, warm detail to stark, spare language","An increase in the number of commas","A switch from long sentences to short facts"],"answerIndex":1,"explanation":"Warm detail gives way to stark, spare language, and that diction change is what carries the grief.","difficulty":8,"skill":"Noticing tonal shifts","topic":"Tone Control in Writing"},{"id":"Q45","prompt":"Which sentence is written in an enthusiastic tone?","choices":["The results of the trial were reported today.","Registration for the event closes on Friday.","We are thrilled to announce this year's lineup!","Attendance figures were released in a statement."],"answerIndex":2,"explanation":"Thrilled and the exclamation mark both project excitement toward the reader.","difficulty":7,"skill":"Recognizing tone in a sample","topic":"Tone Control in Writing"},{"id":"Q46","prompt":"A writer reviews a persuasive speech and finds each paragraph serves the same aim. What does the T.A.G. strategy predict about its tone?","choices":["It will shift sharply between every paragraph","It will read as consistent and purposeful","It will be too formal for a live audience","It will need more quotations to be effective"],"answerIndex":1,"explanation":"When every paragraph serves one aim, the tone stays consistent and purposeful throughout.","difficulty":8,"skill":"Evaluating tone's effect","topic":"Tone Control in Writing"},{"id":"Q47","prompt":"Which word choice would make a warning sound more urgent?","choices":["Exercise caution near the cliff edge.","Please be careful near the cliff edge.","Do not approach the cliff edge.","The cliff edge is something to note."],"answerIndex":2,"explanation":"A direct command with do not acts immediately on the reader, adding urgency that a suggestion lacks.","difficulty":7,"skill":"Shaping tone for an aim","topic":"Tone Control in Writing"},{"id":"Q48","prompt":"Under the T.A.G. strategy, how should a writer handle a tone that does not fit the audience?","choices":["Keep the tone and hope the audience adapts","Add more facts to the same tone","Revise the tone to match the audience while keeping the aim","Change the aim to match the existing tone"],"answerIndex":2,"explanation":"The aim stays fixed while the tone is adjusted, since tone is the tool for reaching a particular audience.","difficulty":8,"skill":"Adapting tone to audience","topic":"Tone Control in Writing"},{"id":"Q49","prompt":"A writer aims for an encouraging tone in feedback to a struggling student. Which sentence best delivers it?","choices":["This draft is simply not up to standard.","You clearly did not put in the effort required.","Your argument is sharp here — push it one step further.","Most students handle this better at this stage."],"answerIndex":2,"explanation":"Naming a strength and inviting a next step gives the student something to build on, which is encouragement.","difficulty":7,"skill":"Matching tone to aim","topic":"Tone Control in Writing"},{"id":"Q50","prompt":"Which sentence holds a neutral tone while reporting an unexpected result?","choices":["Shockingly, the new method failed completely.","Amazingly, the new method worked overnight.","The new method produced results different from those predicted.","Sadly, the new method did not live up to expectations."],"answerIndex":2,"explanation":"The plain comparison to the prediction reports the surprise without any emotional coloring.","difficulty":7,"skill":"Identifying tone signals","topic":"Tone Control in Writing"}],"feedback":{"correct":"That's right — place your X in any empty cell.","incorrect":"Not quite — the bot places an O. Watch its line.","win":"Three in a row — you've taken the board and mastered the T.A.G. tone strategy.","lose":"The bot got three in a row. Review the strategy: Tone follows Aim, then Goal.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
    var WIN_LINES = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'),
      prompt: q('prompt'), choices: q('choices'), verdict: q('verdict'),
      board: q('board'), xcount: q('xcount'), ocount: q('ocount'),
      modal: q('modal'), result: q('result'), endstats: q('endstats'),
      restart: q('restart'), next: q('next'),
    };

    var state = null;

    function emit(name, detail) {
      var data = { source: 'tic-tac-toe', engineId: 'tic-tac-toe' };
      for (var k in detail) data[k] = detail[k];
      try {
        window.dispatchEvent(new CustomEvent('game:' + name, { detail: data }));
      } catch (err) { /* an engine must never break the page over telemetry */ }
    }

    function winnerOf(board) {
      for (var i = 0; i < WIN_LINES.length; i++) {
        var line = WIN_LINES[i];
        if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[1]] === board[line[2]]) {
          return { mark: board[line[0]], line: line };
        }
      }
      return null;
    }

    // Deterministic on purpose: win, block, centre, corner, side — in that order,
    // first available slot. The same board always produces the same bot move, so
    // the game is testable and fair to read.
    function botMove(board) {
      var marks = ['O', 'X'];
      for (var m = 0; m < marks.length; m++) {
        for (var i = 0; i < WIN_LINES.length; i++) {
          var line = WIN_LINES[i];
          var vals = [board[line[0]], board[line[1]], board[line[2]]];
          var mine = 0, empty = -1;
          for (var j = 0; j < 3; j++) {
            if (vals[j] === marks[m]) mine++;
            else if (vals[j] === null) empty = line[j];
          }
          if (mine === 2 && empty >= 0) return empty;
        }
      }
      if (board[4] === null) return 4;
      var corners = [0, 2, 6, 8];
      for (var c = 0; c < corners.length; c++) if (board[corners[c]] === null) return corners[c];
      var sides = [1, 3, 5, 7];
      for (var s = 0; s < sides.length; s++) if (board[sides[s]] === null) return sides[s];
      return -1;
    }

    function cellLabel(index, board) {
      var row = Math.floor(index / 3) + 1;
      var col = (index % 3) + 1;
      var who = board[index] === 'X' ? 'your X' : board[index] === 'O' ? 'the bot O' : 'empty';
      return 'Row ' + row + ' column ' + col + ', ' + who;
    }

    function renderBoard() {
      var board = state.board;
      el.board.innerHTML = '';
      for (var i = 0; i < 9; i++) {
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'ttt-cell';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.index = String(i);
        cell.setAttribute('aria-label', cellLabel(i, board));
        if (board[i] === 'X') { cell.textContent = 'X'; cell.classList.add('ttt-cell--x'); }
        else if (board[i] === 'O') { cell.textContent = 'O'; cell.classList.add('ttt-cell--o'); }
        else if (state.phase === 'placing') {
          cell.classList.add('ttt-cell--placeable');
          cell.textContent = '+';
          cell.setAttribute('data-game-action', '');
          cell.setAttribute('aria-label', cellLabel(i, board) + ', choose for your X');
        }
        if (state.winLine && state.winLine.indexOf(i) >= 0) cell.classList.add('ttt-cell--win');
        el.board.appendChild(cell);
      }
      el.xcount.textContent = String(state.board.filter(function (c) { return c === 'X'; }).length);
      el.ocount.textContent = String(state.board.filter(function (c) { return c === 'O'; }).length);
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
        btn.className = 'ttt-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var key = document.createElement('span');
        key.className = 'ttt-key';
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
      el.verdict.className = 'ttt-verdict ' + (correct ? 'ttt-verdict--good' : 'ttt-verdict--bad');
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
      // wraps and the payload's own out-of-questions line says so, because a
      // game with no question left to ask cannot be played at all.
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
        : 'Answer to place your mark.';
    }

    function checkEnd() {
      var win = winnerOf(state.board);
      if (win) {
        state.winLine = win.line;
        renderBoard();
        return endGame(win.mark === 'X' ? 'win' : 'lose');
      }
      if (state.board.every(function (c) { return c !== null; })) {
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
      el.result.className = 'ttt-result ttt-result--' + result;
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
      var buttons = el.choices.querySelectorAll('.ttt-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 'ttt-choice--right' : 'ttt-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('ttt-choice--right');
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
        state.phase = 'placing';
        el.status.textContent = feedback.correct || 'Correct — place your X on the board.';
        renderBoard();
      } else {
        el.status.textContent = feedback.incorrect || 'Incorrect — the bot places an O.';
        var slot = botMove(state.board);
        if (slot >= 0) state.board[slot] = 'O';
        if (!checkEnd()) askNext();
      }
    }

    function onCell(index) {
      if (state.phase !== 'placing' || state.board[index] !== null) return;
      state.board[index] = 'X';
      if (!checkEnd()) askNext();
    }

    // ---- wire up a fresh round -------------------------------------------------
    //
    // The board resets; the question cursor does not. "Play again" is another
    // round taken up at the next unseen question, never the same one twice.
    state = {
      board: [null, null, null, null, null, null, null, null, null],
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
      var btn = event.target.closest ? event.target.closest('.ttt-choice') : null;
      if (btn && !btn.disabled) onAnswer(Number(btn.dataset.index));
    };
    el.board.onclick = function (event) {
      var cell = event.target.closest ? event.target.closest('.ttt-cell') : null;
      if (cell) onCell(Number(cell.dataset.index));
    };
    el.restart.onclick = function () { window.initGame(payload); };

    renderBoard();
    askNext();
    emit('start', { engineId: 'tic-tac-toe' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
