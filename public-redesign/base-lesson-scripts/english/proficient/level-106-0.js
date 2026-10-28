
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
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"tic-tac-toe","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":106,"topic":"Activity 1 of 9 (quiz/game): Study a Model and Sort Its Parts - Tone Control in Writing","title":"Tone Control in Writing: Sorting the Parts of a Model","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":7,"end":9,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"TC01","prompt":"A writer wants the closing line of a serious editorial to land with quiet authority rather than heat. Which sentence best holds that tone?","choices":["The evidence, in the end, compels a single conclusion.","Look, the evidence is beyond obvious, so just deal with it.","In conclusion, evidence is a thing that matters a lot.","Wow, the evidence here is just absolutely incredible, right?"],"answerIndex":0,"explanation":"A measured, declarative sentence without slang, intensifiers, or rhetorical questions signals quiet authority.","difficulty":7,"skill":"Matching Tone to Purpose","topic":"Tone Control in Writing"},{"id":"TC02","prompt":"Which element of a paragraph most directly carries its tone?","choices":["The sentence length used for its transitions","The word choice of its main verbs and modifiers","The number of times its topic is repeated","The position of its final clause in the paragraph"],"answerIndex":1,"explanation":"Tone is built first from diction, especially the connotation of verbs and modifiers, not from structural placement.","difficulty":7,"skill":"Identifying Tone-Bearing Elements","topic":"Tone Control in Writing"},{"id":"TC03","prompt":"A sentence in a formal report currently reads, The plan kind of fell apart after the budget got slashed. Which revision raises the formality?","choices":["The plan kind of fell apart after the budget got slashed.","The plan collapsed after the budget was reduced.","The plan fell apart big time after the budget got slashed.","So the plan, which is to say, fell apart after the budget got slashed."],"answerIndex":1,"explanation":"Replacing informal phrasal verbs and hedges with precise Latinate verbs like collapsed and reduced produces formal register.","difficulty":7,"skill":"Adjusting Formality","topic":"Tone Control in Writing"},{"id":"TC04","prompt":"A writer adds the word nevertheless in the middle of an otherwise casual blog post. What tone problem does this create?","choices":["It weakens the main claim of the post","It introduces an unintended note of stiff formality","It makes the sentences all sound the same length","It turns the post into a question for the reader"],"answerIndex":1,"explanation":"Tossing a stiff, bookish connector into casual prose creates a register mismatch, since its formality clashes with the surrounding voice.","difficulty":7,"skill":"Diagnosing Register Mismatch","topic":"Tone Control in Writing"},{"id":"TC05","prompt":"Which revision shifts the following line from mocking to neutral? Obviously nobody read the directions, because who would bother?","choices":["Observe that the directions went unread.","Obviously nobody read the directions, because who would bother?","Apparently some of the directions went unread.","Who on earth would ever bother reading the directions?"],"answerIndex":2,"explanation":"Neutral tone removes sarcasm and sweeping claims, and apparently softens the accusation without mocking the reader.","difficulty":7,"skill":"Neutralizing Tone","topic":"Tone Control in Writing"},{"id":"TC06","prompt":"A model paragraph opens with the line, Consider the humble comma, a mark most of us take for granted. What attitude toward the subject does that line establish?","choices":["Respectful fascination with an ordinary subject","Cold dismissal of an unimportant topic","Bewilderment at a confusing subject","Outrage at a widely mistreated subject"],"answerIndex":0,"explanation":"Calling the comma humble and noting how it is overlooked frames it with quiet respect and interest rather than contempt or anger.","difficulty":7,"skill":"Reading Attitude in a Model","topic":"Tone Control in Writing"},{"id":"TC07","prompt":"Which clause is the strongest signal of an ironic tone in a review of a dull film?","choices":["The film runs a full ninety minutes.","The film was directed by a newcomer.","Viewers will surely treasure every one of those ninety minutes.","The film opened in several cities last week."],"answerIndex":2,"explanation":"Praising a boring experience with cheerful certainty, like surely treasure, is the classic marker of irony.","difficulty":8,"skill":"Spotting Irony","topic":"Tone Control in Writing"},{"id":"TC08","prompt":"A speech is meant to console a grieving audience. Which sentence best matches that purpose?","choices":["Statistics show that grief affects most people at some point.","Let us be clear that this loss was entirely preventable.","We gather because grief asks to be shared, not solved.","Moving on, the schedule for next month is now available."],"answerIndex":2,"explanation":"Consoling language is gentle, inclusive, and validating, which matches we gather and the invitation to share grief.","difficulty":7,"skill":"Matching Tone to Audience","topic":"Tone Control in Writing"},{"id":"TC09","prompt":"In a formal analysis, which phrase most plausibly weakens the writer's tone?","choices":["The data suggest a modest correlation.","This finding warrants further investigation.","I guess the data sort of suggest something.","The results remain consistent with prior studies."],"answerIndex":2,"explanation":"Hedges like I guess and sort of introduce uncertainty and casualness that undercut the authority of formal analysis.","difficulty":7,"skill":"Controlling Authority in Tone","topic":"Tone Control in Writing"},{"id":"TC10","prompt":"A community newsletter must sound welcoming without sounding childish. Which sentence fits best?","choices":["We would be delighted to see you at the meeting.","Come on down, friends, it's gonna be super fun!","Attendance at meetings is mandatory for all residents.","You should really show up sometime, honestly."],"answerIndex":0,"explanation":"Warm, courteous phrasing like delighted to see you welcomes readers while remaining adult and professional.","difficulty":7,"skill":"Balancing Warmth and Dignity","topic":"Tone Control in Writing"},{"id":"TC11","prompt":"A writer wants a paragraph to sound urgent rather than dramatic. Which revision is most effective?","choices":["The deadline is tomorrow at noon, and the work is not finished.","Oh no, the deadline is tomorrow at noon, and everything is a disaster!","Everyone should be aware that a deadline of some kind exists.","The deadline, that cruel master, looms over us all."],"answerIndex":0,"explanation":"Urgency comes from stating the concrete stakes plainly, while drama comes from emotional excess like Oh no and cruel master.","difficulty":7,"skill":"Distinguishing Urgency from Drama","topic":"Tone Control in Writing"},{"id":"TC12","prompt":"Which sentence best preserves the objective tone of a scientific summary?","choices":["The compound was observed to change color within ten seconds.","We were thrilled to watch the compound change color!","The compound changed color in what seemed like ten seconds.","It is obvious that the compound changed color quickly."],"answerIndex":0,"explanation":"Neutral reporting uses passive observation and precise measurement, avoiding emotion words and subjective qualifiers.","difficulty":7,"skill":"Maintaining Objectivity","topic":"Tone Control in Writing"},{"id":"TC13","prompt":"A writer opens a formal essay with Hey folks, let's talk about taxes. What is the clearest fix for the tone of that opening?","choices":["Hey folks, let's talk about taxes for a while.","Hey folks, taxes matter, as we all know.","The subject of taxation deserves careful attention.","Let's talk about taxes, folks, in a serious way."],"answerIndex":2,"explanation":"Replacing the casual greeting and contraction with a formal noun phrase and verb aligns the opening with essay register.","difficulty":7,"skill":"Repairing an Opening Tone","topic":"Tone Control in Writing"},{"id":"TC14","prompt":"In a persuasive letter, what is the most likely effect of ending on a question rather than a statement?","choices":["It makes the letter sound more formally structured.","It invites the reader to respond rather than merely comply.","It removes the need for any supporting evidence.","It automatically makes the argument more factual."],"answerIndex":1,"explanation":"A closing question engages the reader directly and reads as a personal invitation, which suits persuasive correspondence.","difficulty":7,"skill":"Structuring Tone at the Close","topic":"Tone Control in Writing"},{"id":"TC15","prompt":"Which sentence carries a skeptical tone toward the proposal?","choices":["The proposal was submitted on Tuesday.","The proposal outlines three possible routes.","Whether the proposal can survive contact with reality remains to be seen.","The proposal was reviewed by two committees."],"answerIndex":2,"explanation":"Questioning whether the plan can survive contact with reality implies doubt about its practicality, which is skepticism.","difficulty":7,"skill":"Detecting Skepticism","topic":"Tone Control in Writing"},{"id":"TC16","prompt":"A writer uses plain, short sentences and common words throughout a piece. What tone does this most likely produce?","choices":["An urgent and demanding tone","A dignified and ceremonial tone","A candid and direct tone","A distant and ironic tone"],"answerIndex":2,"explanation":"Short sentences and everyday diction strip away ornament, yielding a frank, straightforward voice.","difficulty":7,"skill":"Inferring Tone from Style","topic":"Tone Control in Writing"},{"id":"TC17","prompt":"Which single word most shifts the tone of the sentence The committee reached a decision from neutral to negative?","choices":["reached","decision","finally","committee"],"answerIndex":2,"explanation":"Adding finally injects impatience, implying the decision was overdue, which colors the neutral statement negatively.","difficulty":8,"skill":"Spotting Tone-Bearing Words","topic":"Tone Control in Writing"},{"id":"TC18","prompt":"A product manual needs a tone that reassures a worried user. Which line fits best?","choices":["This error is normal and can be resolved in a few steps.","This error is a serious problem requiring professional help.","This error means the device is likely damaged beyond repair.","This error happens because users rarely follow directions."],"answerIndex":0,"explanation":"Calling the error normal and outlining a short fix reassures the user without blame or alarm.","difficulty":7,"skill":"Calming the Reader","topic":"Tone Control in Writing"},{"id":"TC19","prompt":"Which revision removes the condescending tone from a teacher's comment on an essay?","choices":["Try revising the thesis to make it more specific.","Sweetie, next time maybe think a little harder about the thesis.","Obviously, the thesis needed to be much more specific.","Your thesis, like many before it, simply lacks specificity."],"answerIndex":0,"explanation":"A brief, actionable suggestion addressed directly to the writer avoids the patronizing and sarcastic alternatives.","difficulty":7,"skill":"Removing Condescension","topic":"Tone Control in Writing"},{"id":"TC20","prompt":"A writer alternates between technical terms and casual jokes in a single paragraph. What tone effect does this create?","choices":["A consistently professional tone","An uneven or shifting register","A purely objective tone","A uniformly humorous tone"],"answerIndex":1,"explanation":"Mixing specialist vocabulary with jokes in one paragraph produces jarring shifts in register rather than a unified voice.","difficulty":7,"skill":"Diagnosing Mixed Tone","topic":"Tone Control in Writing"},{"id":"TC21","prompt":"Which sentence uses elevated diction to create a solemn tone?","choices":["We remember those who gave their lives in service.","We remember the folks who passed away in the war.","We should probably remember the people who served.","We remember, and that's basically it."],"answerIndex":0,"explanation":"Phrases like gave their lives in service carry gravitas and formality appropriate to solemn remembrance.","difficulty":7,"skill":"Using Elevated Diction","topic":"Tone Control in Writing"},{"id":"TC22","prompt":"In a model paragraph, the writer says the results are promising but far from conclusive. What tone is being controlled here?","choices":["Careful and measured restraint","Cheerful and upbeat encouragement","Sharp and dismissive criticism","Casual and offhand commentary"],"answerIndex":0,"explanation":"Balancing promising with far from conclusive shows deliberate restraint and caution rather than enthusiasm or dismissal.","difficulty":7,"skill":"Recognizing Deliberate Restraint","topic":"Tone Control in Writing"},{"id":"TC23","prompt":"Which sentence most clearly conveys confidence to a hiring manager?","choices":["I believe I might be able to handle most of these tasks.","I have managed projects of this scale successfully before.","I would probably be fine at most of these tasks, I think.","I am not sure, but maybe I could do some of these tasks."],"answerIndex":1,"explanation":"A direct statement of relevant past success, without hedging verbs like might or maybe, projects confidence.","difficulty":7,"skill":"Projecting Confidence","topic":"Tone Control in Writing"},{"id":"TC24","prompt":"A writer wants a paragraph about a serious accident to sound compassionate rather than clinical. Which revision works best?","choices":["The accident occurred at 4:12 p.m. and involved three vehicles.","Three vehicles collided, and several families were left shaken.","The accident resulted in measurable property damage and injury.","Collision data for the incident have been recorded and filed."],"answerIndex":1,"explanation":"Naming the human impact, such as shaken families, injects compassion that purely statistical detail cannot convey.","difficulty":7,"skill":"Shifting from Clinical to Compassionate","topic":"Tone Control in Writing"},{"id":"TC25","prompt":"Which connector best preserves an objective tone while contrasting two findings?","choices":["However,","Obviously,","Amazingly,","Sadly,"],"answerIndex":0,"explanation":"However simply signals contrast, while the other connectors add judgment or emotion that colors the tone.","difficulty":7,"skill":"Choosing Neutral Connectors","topic":"Tone Control in Writing"},{"id":"TC26","prompt":"A memoir passage reads, The house was quiet in the way houses are quiet when someone has just left. What tone does this phrasing create?","choices":["A nostalgic and slightly melancholy tone","A brisk and businesslike tone","An angry and accusatory tone","A playful and teasing tone"],"answerIndex":0,"explanation":"The reflective repetition and the image of a recent departure evoke memory and gentle sadness.","difficulty":8,"skill":"Interpreting Lyrical Tone","topic":"Tone Control in Writing"},{"id":"TC27","prompt":"Which revision most effectively removes the exaggerated tone from this claim? This is without question the worst policy in the entire history of the world.","choices":["This is without question the worst policy in the entire history of the world.","This is arguably the worst policy in the history of the world.","This policy has serious flaws that warrant reconsideration.","This policy is, I would say, quite possibly the worst ever."],"answerIndex":2,"explanation":"Replacing absolutes and hyperbole with measured claims like serious flaws and warrants reconsideration removes exaggeration.","difficulty":7,"skill":"Taming Hyperbole","topic":"Tone Control in Writing"},{"id":"TC28","prompt":"A writer must address a young audience while still sounding respectful. Which sentence works best?","choices":["Listen up, kids, because this is super important.","This idea matters, and I want to explain it clearly.","Since you are young, I will try to keep this simple.","Pay attention, because grown-ups usually know better."],"answerIndex":1,"explanation":"Addressing readers as capable equals while promising clarity respects a young audience without patronizing them.","difficulty":7,"skill":"Respecting a Young Audience","topic":"Tone Control in Writing"},{"id":"TC29","prompt":"Which sentence carries a detached, academic tone?","choices":["This essay argues that the policy produced measurable effects.","I really believe the policy did some important things.","Anyone can see that the policy had measurable effects.","Honestly, the policy kind of worked, in my opinion."],"answerIndex":0,"explanation":"Framing the claim as an argument about measurable effects, without first person or intensifiers, sounds academic and detached.","difficulty":7,"skill":"Adopting an Academic Voice","topic":"Tone Control in Writing"},{"id":"TC30","prompt":"In a model paragraph, the writer shifts from a formal register to a personal anecdote. What is the most likely purpose of that shift?","choices":["To signal that the writer has made a factual error","To connect with the reader after establishing authority","To remind the reader of the essay's structure","To shorten the paragraph to a required length"],"answerIndex":1,"explanation":"Writers often follow formal framing with a personal story to build rapport while retaining credibility.","difficulty":8,"skill":"Explaining Deliberate Shifts","topic":"Tone Control in Writing"},{"id":"TC31","prompt":"Which sentence uses sarcasm to criticize a tardy report?","choices":["The report arrived well after the stated deadline.","Right on time, as always, the report arrived last month.","The report was late and caused scheduling problems.","We received the report at a later date than expected."],"answerIndex":1,"explanation":"Punctual phrasing like Right on time applied to a late delivery is the signature of sarcastic criticism.","difficulty":7,"skill":"Identifying Sarcasm","topic":"Tone Control in Writing"},{"id":"TC32","prompt":"A writer wants a job application letter to sound enthusiastic but not desperate. Which sentence fits?","choices":["Please, I really need this job more than anything.","I would be glad to bring my skills to this role.","I suppose I could probably manage the job if pressed.","I have wanted this job forever and ever, truly."],"answerIndex":1,"explanation":"Stating a willingness to contribute skills conveys enthusiasm without the pleading or exaggeration of the other choices.","difficulty":7,"skill":"Balancing Enthusiasm and Dignity","topic":"Tone Control in Writing"},{"id":"TC33","prompt":"Which sentence most clearly adopts a reflective tone about a past mistake?","choices":["The mistake was noted and corrected on the same day.","Looking back, I can see where my reasoning went wrong.","The mistake happened, and the file was updated.","A mistake of this type is a fairly common occurrence."],"answerIndex":1,"explanation":"Phrases like Looking back and I can see mark a reflective, inward-looking stance toward past experience.","difficulty":7,"skill":"Recognizing Reflection","topic":"Tone Control in Writing"},{"id":"TC34","prompt":"In a persuasive speech, what is the tone effect of repeating a short phrase such as We can do better at the end of consecutive paragraphs?","choices":["It creates a rallying, motivational tone","It creates a neutral and objective tone","It creates a confused and rambling tone","It creates a detached and clinical tone"],"answerIndex":0,"explanation":"Repetition of a short, forward-looking phrase builds momentum and encouragement, hallmarks of motivational tone.","difficulty":7,"skill":"Using Repetition for Tone","topic":"Tone Control in Writing"},{"id":"TC35","prompt":"Which revision changes the tone of this line from accusatory to neutral? The manager ignored our concerns about safety.","choices":["The manager ignored our concerns about safety.","The manager, as usual, ignored our concerns.","Our concerns about safety were not addressed by the manager.","The manager refused to listen to anything we said."],"answerIndex":2,"explanation":"The passive construction states the outcome without assigning blame, producing a neutral, reportorial tone.","difficulty":7,"skill":"Neutralizing Accusation","topic":"Tone Control in Writing"},{"id":"TC36","prompt":"A writer uses the phrase a modest proposal in the title of an essay. What tone does that diction usually signal?","choices":["Straightforward enthusiasm","Dry understatement or irony","Formal technical analysis","Emotional appeal for sympathy"],"answerIndex":1,"explanation":"Calling a proposal modest often understates its real scale, a classic setup for ironic or satiric tone.","difficulty":8,"skill":"Reading Ironic Framing","topic":"Tone Control in Writing"},{"id":"TC37","prompt":"Which sentence maintains a courteous tone when refusing a request?","choices":["We are unable to approve this request at this time.","Your request makes no sense, so we cannot approve it.","Obviously we cannot approve a request like that one.","We will not approve this request, and that is final."],"answerIndex":0,"explanation":"A clear refusal phrased with we are unable maintains courtesy without blame or harsh finality.","difficulty":7,"skill":"Refusing with Courtesy","topic":"Tone Control in Writing"},{"id":"TC38","prompt":"A writer uses long, flowing sentences with many clauses in a travel essay. What tone does this likely create?","choices":["A dreamy and immersive tone","A blunt and confrontational tone","A sterile and technical tone","A sarcastic and mocking tone"],"answerIndex":0,"explanation":"Expansive sentence structure mimics lingering observation, producing a dreamy, immersive feel.","difficulty":8,"skill":"Linking Syntax to Tone","topic":"Tone Control in Writing"},{"id":"TC39","prompt":"Which sentence conveys respect for a subject the writer disagrees with?","choices":["The proposal has merit, though I believe a different route is stronger.","The proposal is absurd and unworthy of any serious discussion.","The proposal is, to put it mildly, a complete nonstarter.","The proposal, frankly, deserves to be discarded immediately."],"answerIndex":0,"explanation":"Acknowledging merit before disagreeing demonstrates respect while still voicing opposition.","difficulty":7,"skill":"Disagreeing Respectfully","topic":"Tone Control in Writing"},{"id":"TC40","prompt":"In a model paragraph, the writer addresses the reader directly as you throughout. What tone does this choice most likely support?","choices":["An instructional or conversational tone","A distant and formal tone","A strictly objective tone","A solemn and ceremonial tone"],"answerIndex":0,"explanation":"Direct address using you draws the reader in and suits guidance or conversation rather than detached formality.","difficulty":7,"skill":"Analyzing Reader Address","topic":"Tone Control in Writing"},{"id":"TC41","prompt":"Which revision best removes the flippant tone from a review of a serious documentary?","choices":["The film was okay, I guess, if you like that sort of thing.","The film was okay and covered the topic in some detail.","The film grapples seriously with a difficult and urgent subject.","The film was, shall we say, an experience for the viewer."],"answerIndex":2,"explanation":"Language like grapples seriously and difficult and urgent replaces flippancy with appropriate gravity.","difficulty":7,"skill":"Correcting Flippancy","topic":"Tone Control in Writing"},{"id":"TC42","prompt":"A writer ends a persuasive essay with the sentence, The choice, as ever, is ours. What tone does that ending create?","choices":["A tone of quiet resolve and shared responsibility","A tone of comic relief and self-mockery","A tone of pure statistical summary","A tone of dismissive indifference"],"answerIndex":0,"explanation":"The balanced phrasing and inclusive ours convey steady determination and shared duty.","difficulty":8,"skill":"Reading Closing Tone","topic":"Tone Control in Writing"},{"id":"TC43","prompt":"Which sentence is written in an informal register appropriate for a text message to a friend?","choices":["I regret to inform you that I cannot attend the event.","I will not be able to attend the event this evening.","Sorry, can't make it tonight after all!","Regrettably, attendance at the event is impossible."],"answerIndex":2,"explanation":"Contractions, an exclamation, and casual phrasing mark the register of a quick message to a friend.","difficulty":7,"skill":"Selecting Register for Medium","topic":"Tone Control in Writing"},{"id":"TC44","prompt":"A writer wants a paragraph about climate data to sound alarming without sounding alarmist. Which line works best?","choices":["The world is ending and nobody cares at all!","The figures, if they hold, point to serious consequences ahead.","Climate data are numbers that scientists keep collecting.","These findings are, without exaggeration, the worst ever recorded."],"answerIndex":1,"explanation":"Conditional framing like if they hold paired with serious consequences signals real concern without hysteria or absolutes.","difficulty":8,"skill":"Balancing Urgency and Credibility","topic":"Tone Control in Writing"},{"id":"TC45","prompt":"In a piece of writing, what distinguishes tone from mood?","choices":["Tone reflects the writer's attitude; mood reflects the reader's feeling.","Tone reflects the reader's feeling; mood reflects the writer's attitude.","Tone is created by setting; mood is created by word choice.","Tone applies to poetry, while mood applies to prose."],"answerIndex":0,"explanation":"Tone is the writer's stance toward the subject or audience, while mood is the emotional atmosphere produced in the reader.","difficulty":7,"skill":"Distinguishing Tone from Mood","topic":"Tone Control in Writing"},{"id":"TC46","prompt":"Which sentence most clearly reflects a nostalgic tone?","choices":["The old playground was torn down last year.","I still remember the sound of the swings on summer evenings.","Playgrounds in the area have been modernized recently.","The playground equipment met safety standards until 2019."],"answerIndex":1,"explanation":"Recalling a sensory memory like the sound of swings on summer evenings evokes wistful remembrance.","difficulty":7,"skill":"Spotting Nostalgia","topic":"Tone Control in Writing"},{"id":"TC47","prompt":"A writer uses the phrase it is worth noting that in the middle of a lively opinion column. What tone problem does this create?","choices":["It introduces an overly formal and stiff register","It makes the column sound too emotional and heated","It turns the column into a set of instructions","It removes the writer's opinion from the column"],"answerIndex":0,"explanation":"Stock academic phrases like it is worth noting that sound stiff next to lively prose, creating a register clash.","difficulty":7,"skill":"Catching Register Clashes","topic":"Tone Control in Writing"},{"id":"TC48","prompt":"Which sentence sustains a respectful tone while critiquing a colleague's work?","choices":["Your analysis has a strong framework, though some evidence could be added.","Your analysis, as usual, is missing half its evidence.","Your analysis really needs a lot more work on the evidence.","Your analysis is fine, I suppose, if you like weak evidence."],"answerIndex":0,"explanation":"Praising the framework first and suggesting a specific addition keeps the critique respectful and constructive.","difficulty":7,"skill":"Giving Respectful Critique","topic":"Tone Control in Writing"},{"id":"TC49","prompt":"A writer wants a paragraph about a new technology to sound curious rather than promotional. Which line fits best?","choices":["This amazing technology will change everything about your life!","What happens when machines can learn remains an open question.","Buy now, because this technology is the future of everything.","Only the smartest people will understand this new technology."],"answerIndex":1,"explanation":"Framing the topic as an open question invites inquiry instead of selling the reader on a product.","difficulty":7,"skill":"Cultivating Curiosity","topic":"Tone Control in Writing"},{"id":"TC50","prompt":"When revising an entire draft for tone consistency, which check comes first?","choices":["Confirm that each paragraph uses the intended register for its audience","Replace every adjective with a stronger synonym","Cut all sentences longer than ten words","Add at least one rhetorical question to each paragraph"],"answerIndex":0,"explanation":"Verifying that every paragraph matches the intended register for its audience is the foundational step in tonal revision.","difficulty":7,"skill":"Revising for Consistent Tone","topic":"Tone Control in Writing"}],"feedback":{"correct":"Strong choice — that answer keeps the tone exactly where the writer meant it to be.","incorrect":"Not quite — look again at the diction and register being used in the passage.","win":"You sorted every part of the model with precision — your control of tone is sharp and deliberate.","lose":"Good effort — review how word choice and register shape tone, then try the sorting again.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
