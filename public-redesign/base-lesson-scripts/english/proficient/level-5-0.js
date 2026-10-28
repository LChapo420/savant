
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
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"archery","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":5,"topic":"Tester 5 of 9: Entry Check, Part 5 of 9","title":"Entry Check: Rebuttal and Style","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":4,"end":7,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q45","prompt":"A master essayist is known for long sentences that accumulate detail. Which observation best analyzes that style?","choices":["He hides his thesis in the middle of each essay","He avoids adjectives so his sentences seem plain","He copies lines directly from older poets without credit","He repeats the same phrases and structures so his sentences build like music"],"answerIndex":3,"explanation":"Dickens's recognizable style comes from rhythmic repetition of phrases and balanced structures.","difficulty":5,"skill":"Analyzing a master's style","topic":"Style Analysis: Imitating the Masters"},{"id":"q7","prompt":"What is a bandwagon appeal?","choices":["Claiming something is true because a famous actor says so","Claiming something is true just because many people believe it","Claiming something is true because it is written in a textbook","Claiming something is true because it repeats your own claim"],"answerIndex":1,"explanation":"The bandwagon fallacy treats popularity itself as proof of truth.","difficulty":4,"skill":"Logical fallacies","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q40","prompt":"Why might a style analyst notice heavy use of passive voice?","choices":["Because passive voice is always grammatically incorrect","Because passive voice hides or softens who acts, which shifts blame or emphasis","Because passive voice is only used in science reports","Because passive voice makes sentences shorter"],"answerIndex":1,"explanation":"Passive constructions obscure the actor, which writers can use deliberately to redirect responsibility.","difficulty":6,"skill":"Voice and agency","topic":"Style Analysis: Imitating the Masters"},{"id":"q26","prompt":"How does a periodic sentence create its effect?","choices":["It delays the main point to the end, building suspense","It states everything first and explains later","It repeats the same clause three times","It asks the reader a question"],"answerIndex":0,"explanation":"A periodic sentence saves the independent clause for last, so the reader waits for the payoff.","difficulty":5,"skill":"Periodic sentences","topic":"Style Analysis: Imitating the Masters"},{"id":"q3","prompt":"Why is parallel structure persuasive in an argument essay?","choices":["Because long sentences are always more impressive","Because parallel structure links equal ideas in a rhythm readers can feel","Because it makes the essay look longer","Because it proves the writer memorized a grammar textbook"],"answerIndex":1,"explanation":"Parallel structure organizes related ideas into balanced, memorable patterns that reinforce the argument.","difficulty":4,"skill":"Parallel structure","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q28","prompt":"Which is a common mistake in student style analysis?","choices":["Assuming the narrator's views are the author's own views","Copying famous writing without giving credit","Ignoring any sentence you do not understand","Focusing on how words and structures create effects instead of just summarizing plot"],"answerIndex":3,"explanation":"Style analysis stays on language and effect; plot summary and biographical guessing miss the point.","difficulty":5,"skill":"Style analysis pitfalls","topic":"Style Analysis: Imitating the Masters"},{"id":"q39","prompt":"What should an analysis of a metaphor do beyond identifying it?","choices":["Identify the letter of the alphabet each word starts with","Count how many words are in the metaphor","Translate the sentence into another language","Explain how the comparison changes the reader's view of the subject"],"answerIndex":3,"explanation":"Analyzing a metaphor means explaining what the comparison adds to the reader's understanding or feeling.","difficulty":4,"skill":"Analyzing metaphor","topic":"Style Analysis: Imitating the Masters"},{"id":"q24","prompt":"When analyzing syntax, what should a reader focus on?","choices":["Whether the sentences are easy to translate","How the sentence structures shape the reader's experience","Whether the sentences are all the same length","The total number of words per paragraph"],"answerIndex":3,"explanation":"Syntax analysis looks at how sentence construction choices affect meaning, rhythm, and emphasis.","difficulty":5,"skill":"Syntax analysis","topic":"Style Analysis: Imitating the Masters"},{"id":"q22","prompt":"In style analysis, what is an intended effect?","choices":["The cost of publishing the piece","A reader's private opinion about the author","The response a writer intends to create in the audience","The number of words in the audience"],"answerIndex":2,"explanation":"Intended effect is the impact the writer aims to produce in readers, such as urgency or sympathy.","difficulty":4,"skill":"Intended effect","topic":"Style Analysis: Imitating the Masters"},{"id":"q27","prompt":"Which step best helps a student analyze a master writer's style?","choices":["Write everything in as few words as possible","Notice the specific technique, name it, and analyze its effect","Copy the writer's entire paragraph word for word","List only the emotions the writing made you feel"],"answerIndex":1,"explanation":"Good style analysis names the concrete device and explains what it does, not just how it feels.","difficulty":5,"skill":"Style analysis method","topic":"Style Analysis: Imitating the Masters"},{"id":"q25","prompt":"What is the main effect of a cumulative sentence that piles on detail after detail?","choices":["It makes the sentence harder to follow on purpose","It guarantees the reader will agree with the writer","It lets the writer add modifying details as they come, building a full picture","It automatically shortens the writing"],"answerIndex":2,"explanation":"A cumulative sentence adds details after the main clause, layering description while keeping the core clear.","difficulty":6,"skill":"Cumulative sentences","topic":"Style Analysis: Imitating the Masters"},{"id":"q5","prompt":"Which of the following is the strongest conclusion for an argument essay?","choices":["A conclusion that merely repeats the thesis word for word","A conclusion that introduces a brand-new argument never mentioned before","A conclusion that apologizes for the essay's weaknesses","A conclusion that echoes the thesis while showing why it matters"],"answerIndex":3,"explanation":"A strong conclusion returns to the thesis with fresh significance rather than copying it exactly.","difficulty":4,"skill":"Conclusions","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q9","prompt":"Which transition phrase best introduces a concession before a rebuttal?","choices":["Since, therefore, clearly","However, but, on the other hand","Admittedly, granted, while it is true that","In summary, finally, overall"],"answerIndex":2,"explanation":"Concession transitions signal that the writer is acknowledging an opposing point before responding.","difficulty":5,"skill":"Concession moves","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q4","prompt":"Why should an argument writer consider the reader's likely objections while drafting?","choices":["To make your own writing more deliberate and varied","To sound exactly like the masters forever","To avoid having a style of your own","To make every essay identical in structure"],"answerIndex":0,"explanation":"Studying masters expands your options so your choices become intentional rather than accidental.","difficulty":4,"skill":"Anticipating objections","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q8","prompt":"Which sentence shows the most nuanced position on a school cafeteria renovation plan?","choices":["I strongly disagree with the cafeteria plan and its supporters","The cafeteria plan is clearly the worst idea in history","While the plan has some supporters, it is obviously doomed to fail","The cafeteria plan does reduce wait times, though its long-term cost may outweigh that benefit"],"answerIndex":3,"explanation":"Nuanced writing admits partial truth on the other side while still weighing the overall balance.","difficulty":5,"skill":"Nuance in argument","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q10","prompt":"Which sentence best serves as a concession-and-rebuttal pair in an essay against homework?","choices":["Homework is necessary because it keeps students busy in the evenings","Critics of homework are wrong because teachers assign it for good reasons","Although some believe homework improves learning, a 2019 district study found no gains in test scores","Since many students dislike homework, it should probably be reduced"],"answerIndex":1,"explanation":"A strong concession names the opposing belief specifically, then pivots with evidence to the writer's own reasoning.","difficulty":4,"skill":"Concession moves","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q37","prompt":"Why is it valuable to analyze a master's technique before imitating it?","choices":["Because reading passages aloud helps you memorize them faster","Because analyzing first is easier than writing anything original","Because famous writers rarely permit direct copying of their work","Because then your imitation shows you understood the technique, not just the words"],"answerIndex":0,"explanation":"Imitation transfers skill only when the student grasps why the original works, not merely what it says.","difficulty":5,"skill":"Analysis before imitation","topic":"Style Analysis: Imitating the Masters"},{"id":"q34","prompt":"What does sentence rhythm refer to in prose?","choices":["The number of adjectives used in each paragraph","How often a writer resorts to metaphor","The pattern of stressed and unstressed beats in prose sentences","The choice between formal and informal vocabulary"],"answerIndex":0,"explanation":"Sentence rhythm is the beat created by clause lengths and punctuation, shaping how prose sounds and feels.","difficulty":6,"skill":"Sentence rhythm","topic":"Style Analysis: Imitating the Masters"},{"id":"q49","prompt":"Which appeal does a writer primarily use by telling the story of a struggling family to move the audience?","choices":["Appeal to authority","Appeal to emotion","Appeal to statistics","Appeal to tradition"],"answerIndex":1,"explanation":"Emotional stories aimed at the reader's sympathy are a classic pathos appeal.","difficulty":5,"skill":"Rhetorical appeals","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q42","prompt":"How should a writer signal a concession to the reader?","choices":["Avoid transitions entirely and let readers infer connections","Use transitions like admittedly and nevertheless to signal the turn","Begin every sentence with However","Put all transitions at the very end of the essay"],"answerIndex":1,"explanation":"Signposting words like admittedly or nevertheless guide readers through the concession and the pivot.","difficulty":4,"skill":"Transitions and signposting","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q6","prompt":"A writer argues that opponents of a new park hate children. What fallacy does this commit?","choices":["Anecdotal evidence","Circular reasoning","Straw man","Bandwagon appeal"],"answerIndex":2,"explanation":"A straw man distorts the opponent's position so it becomes easy to defeat.","difficulty":5,"skill":"Logical fallacies","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q20","prompt":"Why is it useful to include a counterclaim in an argument paragraph?","choices":["It makes the paragraph repetitive","It shows the writer considered opposing views and can answer them","It proves the writer secretly agrees with the other side","It replaces the need for evidence"],"answerIndex":1,"explanation":"Addressing counterclaims builds credibility and makes the writer's own reasoning stronger.","difficulty":4,"skill":"Counterclaim purpose","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q13","prompt":"A writer claims that allowing phones in class will eventually destroy all discipline in schools. What fallacy is this?","choices":["Red herring","Straw man","Circular reasoning","Slippery slope"],"answerIndex":3,"explanation":"Treating one step as inevitably leading to disaster, without proof, is the classic slippery slope fallacy.","difficulty":5,"skill":"Logical fallacies","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q21","prompt":"What is the central task in style analysis?","choices":["Analyzing how a writer's stylistic choices create meaning and effect","Counting how many sentences a text contains","Rating whether the writing is factually true","Guessing the author's personal biography"],"answerIndex":0,"explanation":"Style analysis examines how word choice, syntax, and other devices create meaning and effect.","difficulty":4,"skill":"Style analysis fundamentals","topic":"Style Analysis: Imitating the Masters"},{"id":"q32","prompt":"What is the best way to use textual evidence in style analysis?","choices":["Quote it in every paragraph so it stays fresh","Weave short, well-chosen quotations into your own sentences","Replace the entire paragraph with one long quotation","Skip quotations and rely on memory"],"answerIndex":1,"explanation":"Brief, integrated quotations keep the writer's voice in control while providing concrete proof.","difficulty":5,"skill":"Using textual evidence","topic":"Style Analysis: Imitating the Masters"},{"id":"q17","prompt":"Which sentence commits a false analogy?","choices":["Because the Internet is the future, banning it is foolish","Either we ban phones or students will never focus again","Many people agree with me, so it must be true","If the second proposed rule failed, this similar rule will fail too"],"answerIndex":2,"explanation":"False analogy treats two situations as equivalent when their differences actually matter.","difficulty":6,"skill":"Logical fallacies","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q23","prompt":"What does it mean to imitate the masters as a writing exercise?","choices":["Deliberately adopting a master writer's techniques in your own sentences","Reading a master's books until you can quote passages from memory","Listing a famous writer's favorite vocabulary words in your notebook","Studying grammar rules from older published texts"],"answerIndex":1,"explanation":"Imitation practice means consciously copying an author's techniques to build your own stylistic range.","difficulty":4,"skill":"Imitation practice","topic":"Style Analysis: Imitating the Masters"},{"id":"q16","prompt":"In argument writing, what should a writer do with legitimate objections to their claim?","choices":["They must be handled in the rebuttal with logic and evidence","They must be removed before drafting","They should be ignored since they cannot be proven","They require the writer to switch to the opposing side"],"answerIndex":0,"explanation":"Legitimate objections are exactly what a rebuttal exists to answer with reasoning and evidence.","difficulty":5,"skill":"Handling objections","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q41","prompt":"What best defines an author's style?","choices":["The printing style of the edition you are reading","The speed at which the author produced each draft","Specific choices in words, sentences, and structure that set the author's voice","The number of books the author has published"],"answerIndex":2,"explanation":"Style is the recognizable set of choices in diction, syntax, and structure that create an author's voice.","difficulty":4,"skill":"Defining style","topic":"Style Analysis: Imitating the Masters"},{"id":"q29","prompt":"When imitating a passage, what should a student keep and what should they change?","choices":["Use the same technique but change the subject and ideas","Copy the sentences exactly as written","Choose a completely different technique so nothing matches","Write about why the original author is overrated"],"answerIndex":2,"explanation":"The point of imitation is to practice a technique on new content, not to duplicate the content.","difficulty":5,"skill":"Imitation practice","topic":"Style Analysis: Imitating the Masters"},{"id":"q12","prompt":"How do well-rebutted counterclaims affect a writer's credibility?","choices":["They undercut the writer by exposing serious holes in the claim","They strengthen the writer by showing the claim survives honest opposition","They make the essay longer and therefore more persuasive","They prove the writer is unbiased and should be believed automatically"],"answerIndex":0,"explanation":"When rebutted well, counterclaims show the claim can withstand the strongest opposition, which builds credibility.","difficulty":4,"skill":"Counterclaims and credibility","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q50","prompt":"Which style choice would most likely be criticized in an analysis of an amateur essayist?","choices":["Mixed metaphors that clash and confuse the image","Short sentences that end abruptly","Plain vocabulary with no figures of speech","Consistent sentence lengths throughout"],"answerIndex":0,"explanation":"Clashing metaphors muddy the picture, which style analysts flag as an unintentional flaw.","difficulty":5,"skill":"Evaluating style flaws","topic":"Style Analysis: Imitating the Masters"},{"id":"q30","prompt":"A style analyst notes that a passage describing a storm uses the word 'sky' three times, each time with a different vivid image attached. Which observation best analyzes this choice?","choices":["The author varies sentence length to keep the reader's attention from drifting","The author stacks concrete images, so the plain word 'sky' turns into something alive","The author opens with a question to pull the reader into the essay's central puzzle","The author ends each paragraph with a short sentence to deliver a final punch"],"answerIndex":1,"explanation":"Analyzing diction and imagery means explaining what the word choices make the reader see and feel, not just naming a technique.","difficulty":6,"skill":"Analyzing diction and imagery for effect","topic":"Style Analysis: Imitating the Masters"},{"id":"q35","prompt":"How does personification affect a description?","choices":["It describes an object's actual size","It removes all emotion from the description","It gives an object human qualities to deepen the reader's feeling","It repeats a sound at the start of words"],"answerIndex":2,"explanation":"Personification assigns human traits to nonhuman things, making descriptions more vivid and emotionally charged.","difficulty":5,"skill":"Figurative language","topic":"Style Analysis: Imitating the Masters"},{"id":"q1","prompt":"What is the most effective way for an argument writer to handle a counterclaim?","choices":["Restate the counterclaim louder to show confidence","Attack the person who holds the counterclaim","Address the strongest version of the counterclaim with reasons and evidence","Ignore the counterclaim so it never enters the essay"],"answerIndex":2,"explanation":"A strong rebuttal engages the best, most complete version of the opposing view and answers it with reasons and evidence.","difficulty":4,"skill":"Counterclaims and rebuttals","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q31","prompt":"What should a strong thesis for a style analysis essay do?","choices":["Give a long plot summary of the passage","Announce that the passage is very interesting","Identify a specific stylistic device and analyze its effect on the reader","Copy the first sentence into the introduction"],"answerIndex":2,"explanation":"A strong style analysis thesis names a device and makes a claim about its effect.","difficulty":5,"skill":"Thesis for analysis","topic":"Style Analysis: Imitating the Masters"},{"id":"q2","prompt":"What makes a claim debatable in an argument essay?","choices":["Every single reader already accepts the claim","The claim is stated emotionally rather than logically","The claim can be debated and supported or opposed with reasons","The claim repeats a well-known fact"],"answerIndex":2,"explanation":"A debatable claim is one reasonable people could disagree about and defend with reasons.","difficulty":4,"skill":"Debatable claims","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q36","prompt":"What is one persuasive purpose of deliberate repetition in an argument?","choices":["Repetition forces readers to reread the essay","Repetition hammers an idea into the reader's memory and builds intensity","Repetition proves the writer had no new ideas","Repetition is only legal in political speeches"],"answerIndex":1,"explanation":"Deliberate repetition builds momentum and makes a key idea unforgettable.","difficulty":5,"skill":"Repetition as rhetoric","topic":"Style Analysis: Imitating the Masters"},{"id":"q43","prompt":"In writing, what does voice refer to?","choices":["The author's stated political opinions on current events","The setting the author describes most often in each essay","The chapter titles the author selects for each piece","The character of the writer conveyed through word choice and tone"],"answerIndex":0,"explanation":"Voice is the personality on the page, built from diction, tone, and rhythm.","difficulty":4,"skill":"Voice","topic":"Style Analysis: Imitating the Masters"},{"id":"q15","prompt":"What does it mean to steel man a counterargument?","choices":["Keep your main claim vague so it cannot be attacked","State the strongest possible version of your opponent's view before answering it","Present your opponent's argument using the weakest examples available","List only the arguments your side already agrees with"],"answerIndex":1,"explanation":"The steel man method engages the opponent's best argument, making the rebuttal far more convincing.","difficulty":6,"skill":"Steel man technique","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q11","prompt":"Which sentence adds nuance to an argument rather than weakening it?","choices":["The critics of the plan have not read it carefully, so their complaints can be ignored","The initial cost is large, but budgets always grow anyway so it does not matter","Some argue the plan costs too much, yet they have never proposed a cheaper alternative","It is true the plan requires a larger initial budget, but the savings over five years will pay it back twice over"],"answerIndex":3,"explanation":"Nuance admits what is true in the other side and shows why the overall claim still stands.","difficulty":5,"skill":"Nuance in argument","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q47","prompt":"What is the ultimate purpose of studying and imitating master writers?","choices":["The audience of your own writing grows more thoughtful and skilled","The original author loses readers","It shortens the time needed to finish homework","It guarantees publication in a magazine"],"answerIndex":0,"explanation":"The lasting benefit of imitation study is a stronger, more versatile writer, which is you.","difficulty":4,"skill":"Purpose of imitation","topic":"Style Analysis: Imitating the Masters"},{"id":"q44","prompt":"How should a writer link style devices to their thesis in an analysis essay?","choices":["Name the technique in every sentence of the essay","Skip naming the device and only state your feelings about it","Connect the device directly to the thesis about the passage's meaning","List as many devices as possible without explaining any"],"answerIndex":2,"explanation":"Every identified device must be tied back to the essay's central claim about the text.","difficulty":5,"skill":"Cohesion in analysis","topic":"Style Analysis: Imitating the Masters"},{"id":"q33","prompt":"Why might an essayist deliberately use inverted syntax?","choices":["It is too long and confusing to ever use","It is required for every sentence a writer produces","It only matters in poetry, never in essays","It creates emphasis and rhythm by breaking the expected pattern"],"answerIndex":3,"explanation":"Inverted syntax places words in an unusual order so the reader slows down and certain words gain weight.","difficulty":4,"skill":"Inverted syntax","topic":"Style Analysis: Imitating the Masters"},{"id":"q48","prompt":"How do rhetorical appeals relate to style choices?","choices":["All appeals must be used in every paragraph","Appeals only matter in advertising, not essays","Appeals are chosen deliberately to move the intended audience","Appeals replace the need for any evidence"],"answerIndex":2,"explanation":"Master writers consciously select which appeals to deploy and where, based on audience and purpose.","difficulty":5,"skill":"Rhetorical appeals and style","topic":"Style Analysis: Imitating the Masters"},{"id":"q46","prompt":"What is ethos in rhetorical style?","choices":["Aristotle's term for the writer's credibility with the audience","The appeal to the audience's emotions in an argument","Aristotle's term for logic and evidence in an argument","The formal structure of a classical speech"],"answerIndex":1,"explanation":"Ethos is the classical appeal based on the speaker's trustworthiness and credibility.","difficulty":6,"skill":"Rhetorical appeals","topic":"Style Analysis: Imitating the Masters"},{"id":"q18","prompt":"What is the writer's main job when selecting evidence for an argument?","choices":["Include every argument ever made on either side","Select and order details that most clearly support the writer's line of reasoning","Use only emotional details so readers feel strongly","Hide the writer's opinion so the reader must guess it"],"answerIndex":1,"explanation":"Evidence selection means choosing the details that best and most clearly advance the argument.","difficulty":4,"skill":"Evidence selection","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q19","prompt":"A writer wants to rebut an opposing editorial. Which approach shows the strongest command of rebuttal? ","choices":["Restate the opponent's words exactly, so readers can check the quote for errors themselves","Answer only the weakest objections, so the strong ones never appear in the essay at all","Quote the opponent fairly, sum up their reasoning accurately, and then answer with evidence","Add a brief insult to the summary so readers know which side the writer is on"],"answerIndex":2,"explanation":"Fair, accurate summary followed by evidence-based refutation is the core move of an honest rebuttal.","difficulty":5,"skill":"Rebutting opposing arguments fairly","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q14","prompt":"A writer includes the counterclaim early in a paragraph and rebuts it with two cited studies. Why is this effective?","choices":["He states it twice for emphasis","He quotes it in a small font","He addresses it directly and rebuts it with evidence","He saves it for the very last sentence"],"answerIndex":2,"explanation":"Acknowledging the counterclaim head-on and answering it with evidence is the strongest handling.","difficulty":4,"skill":"Rebuttal placement","topic":"Argument Writing: Rebuttal and Nuance"},{"id":"q38","prompt":"What is the effect of a very short sentence placed after a series of long ones?","choices":["Confuse the reader about which ideas matter most","Signal that the argument has finally ended","Give the reader a chance to rest before skimming on","Pace the reader, forcing them to stop and absorb a short, weighty thought"],"answerIndex":2,"explanation":"A short sentence after long ones acts like a full stop, spotlighting its idea.","difficulty":5,"skill":"Sentence length for effect","topic":"Style Analysis: Imitating the Masters"}],"feedback":{"correct":"Bullseye! Your counterargument instincts are sharp.","incorrect":"Not quite — think about what makes a rebuttal strong before your next draw.","win":"Entry check passed! You may skip these lessons and keep only their summaries.","lose":"The test beat you this round. Reread the explanations and try again — the target isn't going anywhere.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
