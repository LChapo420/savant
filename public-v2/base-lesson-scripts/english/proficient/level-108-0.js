
  /* Archery — base engine in the mobile format.
   *
   * The engine holds game logic only; every question, choice, explanation and
   * message arrives through window.GAME_DATA at the injection marker below.
   *
   * How it plays (per the game spec and the mobile format it follows): one
   * question arms each of the 10 arrows. Answer it correctly and the bow is
   * live — hold on the range to draw, move to aim while the crosshair follows
   * your pointer, and release to loose the arrow. The arrow flies on a real
   * arc, bent by the wind shown in the corner, and the ring it lands in pays
   * 10 to 50 points. The rising red line is the shot clock: top it out and the
   * arrow goes on its own. Answer incorrectly and no shot is taken and a new
   * question is asked. The game ends when all 10 arrows have been shot.
   *
   * The scene works in a fixed 760x400 virtual field, so the physics is
   * identical in every browser and needs no layout to run.
   *
   * Events out (dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, questionIndex, correct, chosen, ms}
   *   game:win    {source, engineId, result, correct, wrong, questionsUsed}
   *   game:lose   {source, engineId, result, correct, wrong, questionsUsed}
   *   game:draw   {source, engineId, result, correct, wrong, questionsUsed}
   */
  window.GAME_ID = 'archery';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"archery","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":108,"topic":"Activity 3 of 9 (quiz/game): Plan with an Organizer - Tone Control in Writing","title":"Tone Control: Planning with an Organizer","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":4,"end":7,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q1","prompt":"You are filling in a tone organizer for a letter asking your principal to keep the school library open later. Which entry belongs in the box labeled Audience?","choices":["Students who need a quiet study space","Serious and respectful","Requesting a change to library hours","Use evidence about grades and study time"],"answerIndex":0,"explanation":"The audience entry names who will read the piece, and that is the students who need the space.","difficulty":4,"skill":"Identifying organizer fields for tone planning","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q2","prompt":"A planning box is labeled Purpose. Which entry fits it best for a newspaper editorial about litter around the school?","choices":["Formal but hopeful","Neighborhood residents and school staff","Persuade readers to clean up the campus","Calm and slightly urgent"],"answerIndex":2,"explanation":"Purpose states what the writer wants the writing to accomplish, which is persuading readers to act.","difficulty":4,"skill":"Identifying organizer fields for tone planning","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q3","prompt":"A blog post about a class trip sounds like a chat with a friend: short sentences, slang, and jokes. Which planned tone does this match?","choices":["Formal","Casual","Detached","Solemn"],"answerIndex":1,"explanation":"Slang, jokes, and short conversational sentences signal a casual tone.","difficulty":4,"skill":"Matching tone labels to sample writing","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q4","prompt":"A writer plans the tone for a memorial speech. Which two words best fill the tone box?","choices":["Playful and sarcastic","Cheerful and excited","Solemn and respectful","Snappy and bold"],"answerIndex":2,"explanation":"A memorial speech calls for a solemn, respectful tone because of the serious occasion.","difficulty":4,"skill":"Matching tone to occasion","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q5","prompt":"You are planning a lab report and want to sound objective. Which choice shows that plan most directly?","choices":["The chemicals looked pretty gross to me.","You can tell the reaction worked right away.","The solution changed color at 42 degrees Celsius.","I think the results were honestly amazing."],"answerIndex":2,"explanation":"An objective tone reports measurable facts and avoids personal feelings or direct address.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q6","prompt":"Which organizer entry best describes the tone needed for a humorous piece about cafeteria food?","choices":["Exaggerated and playful","Clinical and detached","Severe and accusing","Formal and distant"],"answerIndex":0,"explanation":"A humor piece plans for exaggeration and playfulness to entertain readers.","difficulty":4,"skill":"Matching tone labels to sample writing","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q7","prompt":"Sentence A says: You people obviously do not care about the park. Sentence B says: Many residents feel the park deserves more care. Which planned tone does Sentence B carry, and why?","choices":["Respectful, because it avoids blaming the reader","Angry, because it uses strong wording","Casual, because it is short","Neutral, because it never uses I"],"answerIndex":0,"explanation":"Respectful tone avoids accusations against the reader, which is why B is respectful.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q8","prompt":"A classmate plans a persuasive speech but fills the tone box with confused and muddled. Why is that a weak planning choice?","choices":["Tone boxes should never hold two words.","Confusion is a topic, not a tone.","Persuasion needs a confident, clear tone to move listeners.","Speeches must always sound cheerful."],"answerIndex":2,"explanation":"A persuasive speech plans for confidence and clarity, since a confused tone cannot guide an audience.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q9","prompt":"In a tone organizer, the box labeled Word Choice should hold which kind of note?","choices":["The due date of the assignment","Strong, exact verbs and no slang","The names of two classmates","A list of paragraphs to write"],"answerIndex":1,"explanation":"The word choice box records the kinds of words that will create the planned tone.","difficulty":4,"skill":"Identifying organizer fields for tone planning","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q10","prompt":"A writer plans a letter of complaint to a phone company. Which tone fits best?","choices":["Silly and joking","Firm and polite","Grieving and quiet","Dreamy and vague"],"answerIndex":1,"explanation":"A complaint letter plans for firmness to state the problem and politeness to keep the reader willing to help.","difficulty":5,"skill":"Matching tone to occasion","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q11","prompt":"Which sentence matches a planned urgent tone?","choices":["The trails will still be there next weekend.","Sign-ups are open until Friday.","Act now, because registration closes in two hours.","Maybe you would like to join us sometime."],"answerIndex":2,"explanation":"Urgent tone uses deadlines and direct calls to act, which only this sentence does.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q12","prompt":"A science newsletter wants an informative tone. Which sentence fits the plan?","choices":["Rainbows are honestly the best thing ever.","Why would anyone care about rainbows?","Rainbows form when light bends through water droplets.","I bet you cannot wait to hear about rainbows."],"answerIndex":2,"explanation":"An informative tone presents facts plainly, and only this sentence states a fact without opinion or chatter.","difficulty":4,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q13","prompt":"An organizer row is labeled Sentence Length and Style. Which note fits a plan for a fast-paced sports recap?","choices":["Long sentences with many clauses","Short, punchy sentences with active verbs","Poetic lines with rhyme and rhythm","Formal footnotes after each sentence"],"answerIndex":1,"explanation":"Short punchy sentences with active verbs create the fast pace a sports recap plans for.","difficulty":5,"skill":"Identifying organizer fields for tone planning","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q14","prompt":"A review of a play is meant to sound balanced. Which pair of sentences shows that planned tone?","choices":["The play was terrible. The director should retire.","I have never seen anything better on any stage.","The acting was strong, though the second act dragged.","Everyone knows the play is a masterpiece."],"answerIndex":2,"explanation":"Balanced tone weighs strengths and weaknesses evenhandedly, as this sentence does.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q15","prompt":"Why does a writer plan tone before drafting instead of fixing it later?","choices":["Tone cannot be changed once a draft is written.","Planning keeps word choice and sentence style consistent from the start.","Organizers are only used for tone, never for other traits.","Readers can tell if the outline was typed."],"answerIndex":1,"explanation":"Planning tone first keeps every later choice consistent, which is the reason writers use an organizer.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q16","prompt":"A charity flyer needs a compassionate tone. Which sentence fits?","choices":["Please consider giving what you can to help families who have lost so much.","These families lost their homes in the flood, and your gift can help them rebuild.","Every dollar you give goes directly to supplies for flood victims in the region.","Floods like this one leave thousands of people without shelter each year."],"answerIndex":1,"explanation":"Compassionate tone shows care for others, and this sentence expresses care while inviting help.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q17","prompt":"Which word choice best supports a formal tone in a job application letter?","choices":["I believe my skills and experience make me a strong candidate for this role.","I would love the chance to work for your company.","I am writing to express my interest in the position.","Please let me know if you need any further information from me."],"answerIndex":1,"explanation":"Formal tone avoids slang and contractions, and this sentence uses standard formal wording.","difficulty":4,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q18","prompt":"A classmate fills the Audience box with the word persuasive. Why is that entry misplaced?","choices":["Audience boxes should hold numbers only.","Persuasive describes purpose or tone, not who reads the writing.","The word persuasive is too long for the box.","Audience is never part of a tone organizer."],"answerIndex":1,"explanation":"The audience field names readers, so a word describing purpose or tone does not belong there.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q19","prompt":"A ghost story is planned to sound suspenseful. Which sentence fits that plan?","choices":["The hallway was empty, and the floorboard above kept creaking.","The hallway measured twelve meters long.","I hope you liked the hallway description.","Hallways connect rooms on the same floor."],"answerIndex":0,"explanation":"Suspense builds through unsettling detail and slow pacing, which this sentence supplies.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q20","prompt":"Which note belongs in a tone organizer's Punctuation and Format box for a friendly text-style announcement?","choices":["Semicolons and formal salutations","Exclamation points and short paragraphs","Footnotes and page numbers","Long dashes and legal disclaimers"],"answerIndex":1,"explanation":"Exclamation points and short paragraphs support a friendly, upbeat tone in informal announcements.","difficulty":5,"skill":"Identifying organizer fields for tone planning","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q21","prompt":"A student writes a serious editorial and includes the line LOL what a disaster. Why does this break the plan?","choices":["Editorials cannot use contractions.","The slang clashes with the planned serious tone.","The sentence is too long for an editorial.","LOL is not a real word in any dictionary."],"answerIndex":1,"explanation":"Internet slang signals a casual tone and therefore breaks a plan for a serious piece.","difficulty":4,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q22","prompt":"Two writers plan the same topic, school lunches. Writer 1 aims for a humorous tone; Writer 2 aims for an urgent tone. Which pair of titles fits their plans in order?","choices":["My Epic Battle with a Tuna Sandwich; Cafeteria Lines Are Long","In Search of the Perfect Tuna Sandwich; Act Now to Shorten Lunch Lines","Notes on Tuna Nutrition; Notes on Line Length","Tuna Sandwich Ingredients; Cafeteria Line Rules"],"answerIndex":1,"explanation":"The first title uses playful exaggeration for humor and the second uses a call to act for urgency.","difficulty":6,"skill":"Matching tone labels to sample writing","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q23","prompt":"Which organizer entry best shows the reason a writer chose a sarcastic tone for a review of a boring movie?","choices":["Sarcasm shows the film felt dull without simply calling it boring.","Sarcasm keeps the review entertaining even when the plot goes nowhere.","Sarcasm lets the writer criticize the film without sounding too harsh.","Sarcasm signals to readers that the writer knows a lot about film."],"answerIndex":0,"explanation":"Sarcasm lets the writer signal boredom through irony, which is the reason for the tone choice.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q24","prompt":"A sports team writes to parents about a canceled trip. Which tone should the plan include?","choices":["Apologetic and honest","Boastful and proud","Curious and questioning","Whimsical and dreamy"],"answerIndex":0,"explanation":"Delivering bad news to parents calls for an apologetic, honest tone.","difficulty":4,"skill":"Matching tone to occasion","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q25","prompt":"Which sentence matches a planned detached tone in a research summary?","choices":["I was fascinated by the results.","The study recorded a drop of 12 percent.","You will not believe these numbers!","Obviously the researchers were careless."],"answerIndex":1,"explanation":"Detached tone reports data without emotion, and only this sentence does that.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q26","prompt":"A writer plans a warm tone for a welcome letter to new students. Which sentence fits best?","choices":["Attendance is taken each morning before class.","We are glad you joined us, and we are here to help you settle in.","Rules are posted in the main office.","The building has three floors."],"answerIndex":1,"explanation":"A warm tone expresses welcome and care, which this sentence does directly.","difficulty":4,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q27","prompt":"A classmate plans an objective tone but writes every sentence in second person, telling the reader what you should do. Why is that a mismatch?","choices":["Second person is only used in poems.","Objective writing reports information and avoids directing the reader.","Objective writing requires the word we in each sentence.","Second person always sounds angry."],"answerIndex":1,"explanation":"Objective tone presents information without addressing or directing the reader, so second person conflicts with it.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q28","prompt":"Which set of details belongs in the Evidence and Details row of a tone organizer for an encouraging letter to a struggling athlete?","choices":["Practice stats showing improvement and a reminder of past comebacks","The athlete's grades in three subjects","Rules of the sport and field measurements","The coach's schedule for the season"],"answerIndex":0,"explanation":"Evidence of improvement and reminders of comebacks support an encouraging tone.","difficulty":5,"skill":"Identifying organizer fields for tone planning","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q29","prompt":"A news report needs a neutral tone. Which sentence fits the plan?","choices":["The council made a terrible decision last night.","Thankfully, the council finally saw reason last night.","The council voted 5 to 4 to approve the new budget.","Everyone agrees the budget vote was a good idea."],"answerIndex":2,"explanation":"Neutral tone reports what happened without judgment, and only this sentence does so.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q30","prompt":"Why should a writer record specific words to avoid in the tone organizer?","choices":["Word lists make the organizer look neat.","Naming words to avoid keeps accidental slang or bias out of the draft.","Avoided words are always misspelled.","The list replaces the need for a purpose statement."],"answerIndex":1,"explanation":"Listing words to avoid prevents them from slipping in and breaking the planned tone.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q31","prompt":"Which planned tone fits a poem mourning a lost pet?","choices":["Cheerful and bright","Sorrowful and tender","Blunt and commanding","Witty and mocking"],"answerIndex":1,"explanation":"A poem about loss plans for sorrow and tenderness to honor the subject.","difficulty":4,"skill":"Matching tone to occasion","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q32","prompt":"A letter to the editor should sound persuasive without insulting opponents. Which sentence follows that plan?","choices":["Only a fool would oppose this plan.","Anyone who disagrees must not care about students.","This plan deserves support because it keeps class sizes small.","The other side is full of liars."],"answerIndex":2,"explanation":"This sentence argues with reasons rather than insults, matching a persuasive yet respectful plan.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q33","prompt":"A writer fills the tone box for a how-to article with which words?","choices":["Clear and encouraging","Bitter and resentful","Mournful and hushed","Mocking and sharp"],"answerIndex":0,"explanation":"How-to articles plan for clarity and encouragement so readers can follow the steps.","difficulty":4,"skill":"Matching tone to occasion","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q34","prompt":"Which sentence shows a confident tone suitable for a debate speech?","choices":["I guess this plan might maybe work.","This plan will reduce waste and save the school money.","Sorry for bothering you with these ideas.","Who can say whether anything helps?"],"answerIndex":1,"explanation":"Confident tone uses direct, decisive statements of benefit, as this sentence does.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q35","prompt":"A writer plans a respectful tone toward an elder but drafts: The old-timers never get anything right. Why does the draft fail the plan?","choices":["The sentence uses a compound verb.","The phrase mocks the group instead of treating them with respect.","The sentence is too short for a formal letter.","The word right should always be spelled write."],"answerIndex":1,"explanation":"Mocking language contradicts a respectful plan, which is why the draft fails.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q36","prompt":"Which detail best belongs in the Closing Note row of an organizer for a grateful thank-you letter?","choices":["A repeated expression of thanks and an offer to help in return","A complaint about the sender's delay","A list of unrelated announcements","A demand for a reply within one day"],"answerIndex":0,"explanation":"A grateful closing repeats thanks and offers something in return, sustaining the planned tone.","difficulty":5,"skill":"Identifying organizer fields for tone planning","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q37","prompt":"A travel blog aims for an enthusiastic tone. Which sentence fits the plan?","choices":["The town has a population of 8,000.","The cliffs took my breath away, and I could not stop smiling.","Some visitors find the cliffs acceptable.","The cliffs are located north of the harbor."],"answerIndex":1,"explanation":"Enthusiasm shows through strong positive reactions, which this sentence expresses.","difficulty":4,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q38","prompt":"Which planned tone suits a safety instruction sheet for laboratory equipment?","choices":["Playful and chatty","Direct and serious","Vague and dreamy","Emotional and dramatic"],"answerIndex":1,"explanation":"Safety instructions plan for direct, serious wording so readers follow steps exactly.","difficulty":4,"skill":"Matching tone to occasion","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q39","prompt":"Two sentences from the same paragraph: The city promised safer crosswalks. So far, nothing has changed. Why does the writer likely include the shift in tone?","choices":["The shift signals disappointment after the promise and pushes readers to demand action.","The shift makes the sentences shorter.","The shift corrects a spelling mistake in the first sentence.","The shift changes the audience from adults to children."],"answerIndex":0,"explanation":"Moving from neutral reporting to a pointed complaint shows disappointment and urges readers to act.","difficulty":6,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q40","prompt":"A classmate plans a nostalgic tone for a piece about an old family recipe. Which sentence fits the plan?","choices":["My grandmother always measured the flour by hand, never trusting a cup.","Every time the kitchen fills with that smell, I am eight years old again.","The recipe has been handed down through three generations of my family.","We still bake these cookies together every winter, just like we used to."],"answerIndex":2,"explanation":"Nostalgic tone recalls warm memories, which this sentence does.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q41","prompt":"Which note best fills the Avoid row of a tone organizer for a sympathetic letter to a friend who failed a test?","choices":["Blame, sarcasm, and cheerful dismissal of the problem","Advice about studying harder for the next exam","The name of the test and the score received","Slang words and casual language to avoid"],"answerIndex":0,"explanation":"A sympathetic plan avoids blame, sarcasm, and dismissiveness because they would hurt the reader.","difficulty":5,"skill":"Identifying organizer fields for tone planning","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q42","prompt":"Why might a writer choose a humble tone in a request letter to a community leader?","choices":["A humble tone shows respect and makes the leader more willing to help.","A humble tone keeps the request letter short and easy to write.","A humble tone proves the writer has strong evidence to support the request.","A humble tone makes the writer sound confident and in control."],"answerIndex":1,"explanation":"Showing respect through humility helps persuade the leader to respond kindly to the request.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q43","prompt":"A student plans a cheerful tone for a birthday invitation. Which sentence fits the plan?","choices":["Attendance at the party is mandatory.","Come celebrate with us on Saturday for cake and games!","The party will be held on Saturday.","Please do not reply to this invitation."],"answerIndex":1,"explanation":"Cheerful tone shows excitement and warmth, which this sentence does.","difficulty":4,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q44","prompt":"Which pair of sentences matches a planned shift from friendly to firm in a note to a noisy roommate?","choices":["I know things get loud sometimes. Still, quiet hours start at ten, and I need them respected.","You are so loud. You always ruin everything, and I cannot stand it.","I appreciate how fun you are. But I need you to stop being so fun.","Quiet hours start at ten. Please observe quiet hours beginning at ten tonight."],"answerIndex":0,"explanation":"The first sentence opens warmly and the second states the rule firmly, matching the planned shift.","difficulty":6,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q45","prompt":"Which planned tone suits a book blurb meant to hook readers into a mystery novel?","choices":["Dry and technical","Tense and intriguing","Celebratory and loud","Apologetic and quiet"],"answerIndex":1,"explanation":"A mystery blurb plans for tension and intrigue to pull readers in.","difficulty":4,"skill":"Matching tone to occasion","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q46","prompt":"A classmate writes a self-reflective essay with the tone box filled in as mocking. Why is that plan mismatched to the task?","choices":["Self-reflection calls for an honest, thoughtful tone, not ridicule.","A mocking tone only works in poetry, never in a reflective essay.","A mocking tone makes the essay sound too formal for a class assignment.","A mocking tone is too cheerful and upbeat for a serious self-reflection."],"answerIndex":0,"explanation":"Reflective writing plans for honesty and thoughtfulness, so a mocking tone does not fit the task.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q47","prompt":"Which sentence fits a planned wry tone in a review of a cheesy action film?","choices":["The hero survives explosions the way most people survive mild rain.","The stunts are so over the top that the whole film becomes a joke.","The plot is unbelievable, but the explosions at least look impressive.","An action hero shrugs off danger as though it were barely worth noticing."],"answerIndex":1,"explanation":"Wry tone uses dry humor and understatement, which this comparison delivers.","difficulty":6,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q48","prompt":"A writer plans a piece about recycling and wants the tone to move from concerned to hopeful. Which pair of sentences fits that plan?","choices":["Our landfill is nearly full. Still, our class doubled its recycling this term.","Our landfill is nearly full. Nothing we do will matter now.","Recycling is a topic. It is discussed here.","Please recycle. Also, please recycle."],"answerIndex":0,"explanation":"The first sentence raises the concern and the second offers hope, matching the planned movement.","difficulty":6,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q49","prompt":"Which sentence shows a gracious tone in response to criticism?","choices":["You have no idea what you are talking about.","Thanks for pointing that out; I will revise the section.","That is the weakest comment I have ever read.","Next time, keep your opinions to yourself."],"answerIndex":1,"explanation":"A gracious tone thanks the critic and responds with willingness to improve.","difficulty":5,"skill":"Applying planned tone to sentence choice","topic":"Plan with an Organizer - Tone Control in Writing"},{"id":"q50","prompt":"Why is the Audience field central to a tone organizer?","choices":["Knowing the readers guides word choice, formality, and the tone that will work on them.","Knowing the readers tells the writer exactly how long the piece must be.","Knowing the readers lets the writer skip the purpose field of the organizer.","Knowing the readers sets the number of paragraphs and headings to use."],"answerIndex":1,"explanation":"Readers determine what tone will work, so the audience entry shapes the writer's other tone decisions.","difficulty":5,"skill":"Explaining tone choice in one sentence","topic":"Plan with an Organizer - Tone Control in Writing"}],"feedback":{"correct":"Right on target! Your arrow flies straight — that tone plan holds up.","incorrect":"Not quite. Think about who the piece is for and what the writer wants to achieve, then try again.","win":"All ten arrows loosed and every one found the mark. Your tone planning is sharp and consistent!","lose":"The quiver is empty, but tone planning takes practice. Review the organizer fields and come back for another round.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
    var SHOTS_TO_END = 10;
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    // The virtual field and its physics.
    var FIELD_W = 760, FIELD_H = 400;
    var NOCK = { x: 122, y: 258 };
    var TARGET = { x: 585, y: 188, r: 92 };
    var GROUND_Y = 330;
    var SPEED = 15.2;        // fixed draw strength: the games aim with angle, not power
    var GRAVITY = 0.33;
    var CLOCK_MS = 6000;     // the rising red line's time to the top

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'), prompt: q('prompt'),
      choices: q('choices'), verdict: q('verdict'), range: q('range'), bow: q('bow'),
      string: q('string'), arrow: q('arrow'), target: q('target'),
      wind: q('wind'), windText: q('wind-text'), timer: q('timer'), score: q('score'),
      shots: q('shots'), hits: q('hits'), action: q('action'),
      modal: q('modal'), result: q('result'), endstats: q('endstats'),
      restart: q('restart'), next: q('next'),
    };

    var state = null;
    var crosshair = null;
    var dots = [];
    var clock = { timer: null, startedAt: 0 };
    var aim = { x: 320, y: 120, targetX: 320, targetY: 120, holding: false, ticker: null };

    function emit(name, detail) {
      var data = { source: 'archery', engineId: 'archery' };
      for (var k in detail) data[k] = detail[k];
      try {
        window.dispatchEvent(new CustomEvent('game:' + name, { detail: data }));
      } catch (err) { /* an engine must never break the page over telemetry */ }
    }

    // ---- scene helpers -------------------------------------------------------
    function place(node, x, y, transform) {
      node.style.left = (x / FIELD_W * 100) + '%';
      node.style.top = (y / FIELD_H * 100) + '%';
      if (transform !== undefined) node.style.transform = transform;
    }

    function buildFence() {
      var fence = root.querySelector('.a-fence');
      if (!fence || fence.childNodes.length) return;
      for (var i = 0; i < 18; i++) {
        var post = document.createElement('span');
        post.style.left = (i * 5.9 + 1.5) + '%';
        fence.appendChild(post);
      }
    }

    function setWind() {
      // A fresh breath of wind per arrow, the way the mobile game rolls it:
      // half the time nearly calm, half the time worth a ring of correction.
      var steps = [0, 0, 0.5, -0.5, 1, -1, 1.5, -1.5];
      state.wind = steps[Math.floor(Math.random() * steps.length)];
      var strength = Math.abs(state.wind);
      var dir = state.wind > 0 ? '→' : state.wind < 0 ? '←' : '·';
      el.wind.textContent = strength ? new Array(Math.round(strength * 2) + 1).join(dir) : '·';
      el.windText.textContent = strength ? (strength <= 0.5 ? 'light' : strength <= 1 ? 'steady' : 'strong') : 'calm';
    }

    function windAccel() {
      return state.wind * 0.021;
    }

    // ---- the flight, solved before it is shown ------------------------------
    function simulate(dx, dy) {
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var vx = (dx / len) * SPEED;
      var vy = (dy / len) * SPEED;
      var x = NOCK.x, y = NOCK.y;
      var path = [{ x: x, y: y }];
      var best = { dist: 1e9, x: x, y: y };
      var stopped = { x: x, y: y, angle: 0 };
      for (var i = 0; i < 600; i++) {
        vx += windAccel();
        x += vx; y += vy; vy += GRAVITY;
        path.push({ x: x, y: y });
        var dist = Math.sqrt((x - TARGET.x) * (x - TARGET.x) + (y - TARGET.y) * (y - TARGET.y));
        if (dist < best.dist) best = { dist: dist, x: x, y: y };
        if (y >= GROUND_Y || x > FIELD_W * 1.1 || x < -40 || y < -120) {
          stopped = { x: Math.min(Math.max(x, -20), FIELD_W * 1.05), y: Math.min(y, GROUND_Y), angle: Math.atan2(vy, vx) };
          break;
        }
        stopped = { x: x, y: y, angle: Math.atan2(vy, vx) };
      }
      // The face catches an arrow whose closest pass is inside the board; that
      // pass is where it sticks. Anything else lands on the ground beyond.
      var onFace = best.dist <= TARGET.r;
      var band = best.dist <= TARGET.r * 0.2 ? { pts: 50, name: 'gold' }
        : best.dist <= TARGET.r * 0.4 ? { pts: 40, name: 'red' }
          : best.dist <= TARGET.r * 0.6 ? { pts: 30, name: 'blue' }
            : best.dist <= TARGET.r * 0.8 ? { pts: 20, name: 'black' }
              : best.dist <= TARGET.r ? { pts: 10, name: 'white' }
                : { pts: 0, name: 'miss' };
      return {
        path: path,
        stick: onFace ? { x: best.x, y: best.y, angle: stopped.angle } : stopped,
        onFace: onFace,
        band: band,
      };
    }

    function drawPreview(dx, dy) {
      var flight = simulate(dx, dy);
      var path = flight.path;
      while (dots.length < 13) {
        var dot = document.createElement('div');
        dot.className = 'a-dot';
        el.range.appendChild(dot);
        dots.push(dot);
      }
      for (var i = 0; i < dots.length; i++) {
        var at = path[Math.min(path.length - 1, (i + 1) * 4)];
        place(dots[i], at.x, at.y);
        dots[i].style.opacity = String(0.9 - i * 0.055);
      }
      return flight;
    }

    function clearPreview() {
      dots.forEach(function (d) { d.remove(); });
      dots = [];
    }

    function showCrosshair(x, y) {
      if (!crosshair) {
        crosshair = document.createElement('div');
        crosshair.className = 'a-crosshair';
        el.range.appendChild(crosshair);
      }
      place(crosshair, x, y);
      crosshair.style.display = '';
    }

    function hideCrosshair() {
      if (crosshair) crosshair.style.display = 'none';
    }

    function pointArrow(x, y, atNock) {
      var deg = Math.atan2(y - NOCK.y, x - NOCK.x) * 180 / Math.PI;
      place(el.arrow, NOCK.x, NOCK.y, 'rotate(' + deg.toFixed(1) + 'deg)');
    }

    function restBow() {
      el.bow.style.transform = 'rotate(-12deg)';
      el.string.setAttribute('d', 'M32 6 Q32 62 32 118');
      place(el.arrow, NOCK.x, NOCK.y, 'rotate(-14deg)');
    }

    // ---- the shot clock: the red line that looses the arrow -----------------
    function startClock() {
      stopClock();
      el.timer.style.height = '0%';
      clock.startedAt = Date.now();
      // The red line rises all the way over the shot clock, and tops out at the
      // same moment the arrow would go on its own.
      el.timer.style.transition = 'height ' + (CLOCK_MS / 1000) + 's linear';
      window.setTimeout(function () { el.timer.style.height = '100%'; }, 30);
      clock.timer = window.setTimeout(function () {
        // Topped out: the arrow goes where it is aimed, ready or not.
        if (state.phase === 'armed' || state.phase === 'aiming') shoot(aim.x, aim.y);
      }, CLOCK_MS);
    }

    function stopClock() {
      if (clock.timer) { window.clearTimeout(clock.timer); clock.timer = null; }
      el.timer.style.transition = 'height .12s linear';
      el.timer.style.height = '0%';
    }

    // ---- firing -------------------------------------------------------------
    function shoot(aimX, aimY) {
      if (state.phase !== 'armed' && state.phase !== 'aiming') return;
      stopClock();
      if (aim.ticker) { window.clearInterval(aim.ticker); aim.ticker = null; }
      aim.holding = false;
      clearPreview();
      hideCrosshair();
      state.phase = 'shooting';

      var flight = simulate(aimX - NOCK.x, aimY - NOCK.y);
      state.shots++;
      state.score += flight.band.pts;
      if (flight.onFace) state.hits++;
      el.shots.textContent = String(state.shots);
      el.score.textContent = String(state.score);
      el.hits.textContent = String(state.hits);
      el.string.setAttribute('d', 'M32 6 Q32 62 32 118');

      // The arrow's flight is the telling; the landing is already decided.
      var deg = Math.atan2(flight.stick.y - NOCK.y, flight.stick.x - NOCK.x) * 180 / Math.PI;
      el.arrow.style.opacity = '1';
      place(el.arrow, flight.stick.x, flight.stick.y, 'rotate(' + deg.toFixed(1) + 'deg)');
      window.setTimeout(function () { el.arrow.style.opacity = '0'; }, 260);

      if (flight.onFace) {
        var stuck = document.createElement('div');
        stuck.className = 'a-stuck';
        place(stuck, flight.stick.x, flight.stick.y,
          'rotate(' + deg.toFixed(1) + 'deg)');
        stuck.innerHTML = '<div class="a-arrow-shaft"></div><div class="a-arrow-feather"></div>';
        el.range.appendChild(stuck);
      }
      if (flight.band.pts > 0) {
        var pop = document.createElement('div');
        pop.className = 'a-pop';
        pop.textContent = '+' + flight.band.pts;
        place(pop, flight.stick.x, flight.stick.y - 26);
        pop.style.color = flight.band.name === 'gold' ? '#f6c445' : flight.band.name === 'red' ? '#ff8a70' : '#ffffff';
        el.range.appendChild(pop);
        window.setTimeout(function () { pop.remove(); }, 950);
      }

      el.status.textContent = (flight.band.name === 'gold' ? 'Bullseye — gold! '
        : flight.band.pts ? 'The ' + flight.band.name + ' ring. '
          : 'Off the board. ')
        + '+' + flight.band.pts + '. ' + state.shots + ' of ' + SHOTS_TO_END + ' arrows shot.';

      if (state.shots >= SHOTS_TO_END) {
        endGame(state.score >= 300 ? 'win' : state.score >= 150 ? 'draw' : 'lose');
        return;
      }
      askNext();
    }

    // ---- aiming: hold to draw, the crosshair follows, release to loose ------
    function fieldPoint(event) {
      var rect = el.range.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      var touch = event.touches && event.touches[0];
      var cx = touch ? touch.clientX : event.clientX;
      var cy = touch ? touch.clientY : event.clientY;
      return {
        x: (cx - rect.left) / rect.width * FIELD_W,
        y: (cy - rect.top) / rect.height * FIELD_H,
      };
    }

    function beginAim(event) {
      if (state.phase !== 'armed' && state.phase !== 'aiming') return;
      var at = fieldPoint(event);
      if (!at) return;
      event.preventDefault();
      state.phase = 'aiming';
      aim.holding = true;
      aim.targetX = at.x;
      aim.targetY = at.y;
      el.status.textContent = 'Hold to draw — the crosshair follows. Release to shoot.';
      // The crosshair settles toward the pointer the way the mobile game's
      // does, so the last small correction is where the shot is won.
      if (aim.ticker) window.clearInterval(aim.ticker);
      aim.ticker = window.setInterval(function () {
        aim.x += (aim.targetX - aim.x) * 0.22;
        aim.y += (aim.targetY - aim.y) * 0.22;
        paintAim();
      }, 16);
      paintAim();
    }

    function paintAim() {
      showCrosshair(aim.x, aim.y);
      pointArrow(aim.x, aim.y);
      var deg = Math.atan2(aim.y - NOCK.y, aim.x - NOCK.x) * 180 / Math.PI;
      el.bow.style.transform = 'rotate(' + (deg * 0.5 - 12).toFixed(1) + 'deg)';
      // The string bends back against the grip while the bow is held — the
      // draw itself — and straightens the moment the arrow goes.
      el.string.setAttribute('d', 'M32 6 Q2 62 32 118');
      drawPreview(aim.x - NOCK.x, aim.y - NOCK.y);
    }

    function moveAim(event) {
      if (!aim.holding) return;
      var at = fieldPoint(event);
      if (!at) return;
      event.preventDefault();
      aim.targetX = Math.min(FIELD_W * 1.02, Math.max(0, at.x));
      aim.targetY = Math.min(FIELD_H * 0.92, Math.max(-40, at.y));
    }

    function releaseAim(event) {
      if (!aim.holding) return;
      if (event && event.preventDefault) event.preventDefault();
      shoot(aim.x, aim.y);
    }

    // The assist path: the same shot, aimed for you — playable without a
    // pointer, and the button the keyboard has.
    function assistedShot() {
      if (state.phase !== 'armed' && state.phase !== 'aiming') return;
      var best = null;
      for (var deg = 8; deg <= 78; deg += 1.5) {
        var rad = deg * Math.PI / 180;
        var flight = simulate(Math.cos(rad), -Math.sin(rad));
        if (!flight.onFace) continue;
        if (!best || flight.band.pts > best.flight.band.pts) best = { flight: flight, rad: rad };
      }
      var rad2 = best ? best.rad : 42 * Math.PI / 180;
      aim.x = NOCK.x + Math.cos(rad2) * 300;
      aim.y = NOCK.y - Math.sin(rad2) * 300;
      paintAim();
      shoot(aim.x, aim.y);
    }

    // ---- the question flow (the shared contract) ---------------------------
    function renderQuestion() {
      var item = state.item;
      el.prompt.textContent = item.prompt || '';
      el.counter.textContent = 'Question ' + state.qNo + ' of ' + TOTAL;
      el.choices.innerHTML = '';
      var opts = (item.choices || []).slice(0, CHOICES);
      for (var i = 0; i < opts.length; i++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'a-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var key = document.createElement('span');
        key.className = 'a-key';
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
      el.verdict.className = 'a-verdict ' + (correct ? 'a-verdict--good' : 'a-verdict--bad');
      el.verdict.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = correct ? (feedback.correct || 'Correct — the bow is yours.') : (feedback.incorrect || 'Incorrect — no shot this time.');
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
      el.action.disabled = true;
      restBow();
      clearPreview();
      hideCrosshair();
      stopClock();
      el.status.textContent = next.wrapped
        ? (feedback.outOfQuestions || 'Out of questions — the set starts again.')
        : 'Answer correctly to arm the bow.';
    }

    function endGame(result) {
      state.phase = 'over';
      stopClock();
      if (aim.ticker) { window.clearInterval(aim.ticker); aim.ticker = null; }
      aim.holding = false;
      var message = result === 'win' ? (feedback.win || 'You win!')
        : result === 'lose' ? (feedback.lose || 'The quiver is empty.')
        : (feedback.draw || 'Finished.');
      el.status.textContent = message;
      el.result.textContent = message;
      el.result.className = 'a-result a-result--' + result;
      el.endstats.textContent = 'You answered ' + state.correct + ' correct and ' + state.wrong
        + ' incorrect of ' + state.used + ' questions, scoring ' + state.score
        + ' of 500 with ' + state.hits + ' of ' + SHOTS_TO_END + ' arrows on the board.';
      el.modal.dataset.open = 'true';
      emit(result, {
        result: result,
        correct: state.correct,
        wrong: state.wrong,
        questionsUsed: state.used,
      });
      el.restart.focus();
    }

    function onAnswer(index) {
      if (state.phase !== 'question') return;
      var item = state.item;
      var opts = (item.choices || []).slice(0, CHOICES);
      var correct = Number(item.answerIndex) === index;
      var buttons = el.choices.querySelectorAll('.a-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 'a-choice--right' : 'a-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('a-choice--right');
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
        // The bow is live: the red line starts its rise and the range is yours.
        state.phase = 'armed';
        setWind();
        aim.x = TARGET.x - 30; aim.y = TARGET.y - 120;
        aim.targetX = aim.x; aim.targetY = aim.y;
        paintAim();
        startClock();
        el.action.disabled = false;
        el.status.textContent = (feedback.correct || 'Correct — the bow is yours.')
          + ' Hold to draw, move to aim, release to shoot.';
      } else {
        el.status.textContent = (feedback.incorrect || 'Incorrect — no shot this time.')
          + ' The red line never started.';
        askNext();
      }
    }

    // ---- wire up a fresh round ----------------------------------------------
    //
    // The range resets; the question cursor does not. "Play again" is another
    // quiver taken up at the next unseen question, never the same one twice.
    state = {
      item: null, qPos: 0, qNo: 0, used: 0, correct: 0, wrong: 0,
      shots: 0, hits: 0, score: 0, wind: 0, phase: 'question', qStartMs: 0,
    };
    aim.holding = false;
    if (aim.ticker) { window.clearInterval(aim.ticker); aim.ticker = null; }
    el.modal.dataset.open = 'false';
    el.verdict.hidden = true;
    el.shots.textContent = '0';
    el.hits.textContent = '0';
    el.score.textContent = '0';
    el.topic.textContent = meta.topic ? String(meta.topic) : '';
    el.topic.hidden = !meta.topic;
    el.next.hidden = true;
    if (window.PolymathGame && window.PolymathGame.nextLevelUrl) {
      el.next.href = window.PolymathGame.nextLevelUrl;
      el.next.hidden = false;
    }
    root.querySelectorAll('.a-stuck, .a-pop').forEach(function (n) { n.remove(); });
    clearPreview();
    hideCrosshair();
    stopClock();
    buildFence();
    setWind();
    restBow();

    el.choices.onclick = function (event) {
      var btn = event.target.closest ? event.target.closest('.a-choice') : null;
      if (btn && !btn.disabled) onAnswer(Number(btn.dataset.index));
    };
    el.range.addEventListener('mousedown', beginAim);
    el.range.addEventListener('touchstart', beginAim, { passive: false });
    window.addEventListener('mousemove', moveAim);
    window.addEventListener('touchmove', moveAim, { passive: false });
    window.addEventListener('mouseup', releaseAim);
    window.addEventListener('touchend', releaseAim);
    el.action.onclick = assistedShot;
    el.restart.onclick = function () { window.initGame(payload); };

    askNext();
    emit('start', { engineId: 'archery' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
