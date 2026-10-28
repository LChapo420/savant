
  /* Mancala — base engine.
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
   * Rules (per the game spec): a question is asked every user turn; answer it
   * correctly and you sow one of your pits (last marble in your store is just a
   * good landing, last marble in an empty home pit captures the opposite pit),
   * answer it incorrectly and your turn is skipped and the bot sows instead. The
   * game runs until one side's pits empty: the rest of the marbles are swept
   * into the other store and the bigger store wins.
   *
   * The bot is deterministic on purpose: it prefers a landing in its store, then
   * a capture, then its leftmost non-empty pit — the same board always produces
   * the same move, so the game is testable and fair to read.
   *
   * Events out (dispatched on window):
   *   game:start  {source, engineId}
   *   game:answer {source, engineId, questionId, correct, ms, questionIndex}
   *   game:win    {source, engineId, result, correct, wrong, questionsUsed}
   *   game:lose   {source, engineId, result, correct, wrong, questionsUsed}
   *   game:draw   {source, engineId, result, correct, wrong, questionsUsed}
   */
  window.GAME_ID = 'mancala';
  window.GAME_DATA = [{"schemaVersion":1,"engineId":"mancala","meta":{"subject":"English","grade":"Proficient — 9th to 10th Grade","level":4,"topic":"Tester 4 of 9: Entry Check, Part 4 of 9","title":"Mancala Match: Position and Evidence","ageRange":"Ages 12-16"},"settings":{"questionCount":50,"choicesPerTurn":4,"difficulty":{"start":4,"end":7,"curve":"flat"},"timeLimitSec":null},"questions":[{"id":"q40","prompt":"Which piece of evidence is best for a formal research essay?","choices":["Use a famous quotation without naming the speaker","Use statistics from a popular blog","Use a statistic from a peer-reviewed study","Use a personal anecdote only"],"answerIndex":2,"explanation":"Peer-reviewed studies are checked by experts before publication, making them reliable evidence.","difficulty":5,"skill":"Source credibility","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q26","prompt":"Which type of support is most appropriate as evidence in a formal argument essay?","choices":["Facts and statistics","Dialogue between characters","A poem's rhyme scheme","A novel's plot summary"],"answerIndex":0,"explanation":"Facts and statistics are classic forms of evidence used in argument writing.","difficulty":4,"skill":"Types of evidence","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q18","prompt":"What is the purpose of a rhetorical question in an argument?","choices":["Rhetorical question asked to prompt the audience to think","Hyperbole used to exaggerate a point for effect","Counterclaim presented to acknowledge the other side","Anecdote told to entertain the audience"],"answerIndex":2,"explanation":"A question posed for effect, with no expected answer, engages listeners and highlights a point.","difficulty":6,"skill":"Rhetorical devices","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q5","prompt":"Which revision makes the thesis 'School uniforms are bad' stronger?","choices":["It should be written as a question","It should give specific reasons or evidence, not just repeat the opinion","It should mention every source used in the essay","It should change position between the introduction and conclusion"],"answerIndex":1,"explanation":"Strong thesis statements preview the argument, often giving reasons rather than restating an opinion.","difficulty":5,"skill":"Strengthening thesis statements","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q24","prompt":"Which element is most essential in the introduction of an argument essay?","choices":["A list of every source consulted","A clear, arguable position on the issue","A short story from the writer's life","A summary of the entire topic"],"answerIndex":1,"explanation":"An introduction should present the issue and the writer's arguable stance.","difficulty":5,"skill":"Essay structure","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q2","prompt":"Which feature makes a claim debatable?","choices":["It is arguable and can be supported with evidence","It can be answered with a yes or no","It states a fact everyone already accepts","It only describes a personal preference"],"answerIndex":0,"explanation":"A debatable claim invites disagreement and can be argued with reasons and evidence.","difficulty":4,"skill":"Debatable claims","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q12","prompt":"Which action best shows fair treatment of an opposing argument?","choices":["Choosing sources that agree with your claim","Misquoting an expert to weaken the other side","Leaving out evidence that contradicts your position","Presenting both sides fairly before supporting your own"],"answerIndex":3,"explanation":"Fair treatment means considering opposing views honestly rather than distorting or hiding them.","difficulty":5,"skill":"Fairness in argument","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q19","prompt":"In rhetorical analysis, what does 'style' refer to?","choices":["The number of paragraphs used in the piece","The accuracy of the statistics cited","The historical background of the author","The way word choice and sentence style fit the audience and purpose"],"answerIndex":0,"explanation":"In rhetorical analysis, style refers to choices like diction and syntax that suit audience and purpose.","difficulty":6,"skill":"Rhetorical analysis basics","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q3","prompt":"Which sentence states a position rather than a fact?","choices":["Recycling reduces the amount of waste sent to landfills.","Many cities collect recyclable materials once a week.","The first recycling programs in the United States began in the 1970s.","Recycling requires residents to sort materials into separate bins."],"answerIndex":2,"explanation":"Only this claim takes a stance that could be argued for or against; the others are facts.","difficulty":5,"skill":"Identifying claims","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q6","prompt":"What term names the facts, examples, and expert opinions a writer uses to support a claim?","choices":["Tone","Evidence","Bias","Transition"],"answerIndex":0,"explanation":"Evidence is the supporting material, such as facts, statistics, examples, or expert opinions, used to back a claim.","difficulty":3,"skill":"Defining evidence","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q33","prompt":"Read: 'Teens who spend hours on social media report feeling left out of their friends' lives.' Which appeal does this sentence primarily make, and why?","choices":["An appeal to authority based on a psychologist's credentials","An appeal to emotion that links social media to feeling left out","An appeal to logic built on usage statistics from schools","An appeal to popularity claiming everyone agrees teens misuse phones"],"answerIndex":2,"explanation":"The vivid detail about feeling left out targets the audience's emotions, which is a pathos appeal.","difficulty":4,"skill":"Identifying rhetorical appeals in evidence","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q41","prompt":"When checking if evidence is relevant, what should a writer ask?","choices":["How interesting the evidence is to read","How many words the evidence contains","Whether it directly supports the claim it is attached to","Whether the evidence comes from a print source"],"answerIndex":0,"explanation":"Evidence is only useful if it clearly and directly supports the specific claim it accompanies.","difficulty":5,"skill":"Relevance of evidence","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q28","prompt":"What makes a source credible for an argument essay?","choices":["The source supports the writer's opinion","The source is short and easy to read","The source is recent and comes from an expert or reputable organization","The source contains colorful charts and illustrations"],"answerIndex":2,"explanation":"Reliable sources are current, credible, and produced by experts or respected institutions.","difficulty":6,"skill":"Source credibility","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q30","prompt":"What does it mean to evaluate an argument critically?","choices":["Assume the writer is correct because the text is published","Stop reading once you disagree with the claim","Search only for facts that match your own opinion","Evaluate the reasons, evidence, and assumptions behind the claim"],"answerIndex":3,"explanation":"Critical evaluation means examining the quality of reasons, evidence, and underlying assumptions.","difficulty":5,"skill":"Critical evaluation","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q31","prompt":"What is a logical fallacy?","choices":["A false or misleading argument that may sound convincing","An emotional story used as evidence","A counterargument that has been refuted","The main claim of the essay"],"answerIndex":0,"explanation":"A logical fallacy is flawed reasoning that weakens rather than supports an argument.","difficulty":4,"skill":"Logical fallacies","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q32","prompt":"Which is an example of the ad hominem fallacy?","choices":["Using statistics from a trusted study","Citing a respected expert's opinion","Attacking the person instead of the argument","Refuting the strongest counterclaim"],"answerIndex":2,"explanation":"Ad hominem attacks the opponent personally rather than addressing the reasoning.","difficulty":5,"skill":"Logical fallacies","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q35","prompt":"Why does a writer qualify a claim by changing 'Video games harm teenagers' to 'Video games can harm some teenagers'?","choices":["Because it states a fact no reasonable person could dispute","Because the writer shows it is only sometimes true by limiting the claim","Because it names a qualified expert who supports the position","Because it presents the opposing view in a fair and generous way"],"answerIndex":1,"explanation":"A qualifier limits the claim to what the evidence actually supports, making the position harder to attack.","difficulty":5,"skill":"Qualifying claims for precision","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q37","prompt":"A writer uses short, direct sentences and plain words to make a point about safety. Which appeal is most strengthened by this style choice?","choices":["Ethos, by showing the writer's credentials","Pathos, by stirring emotions","Logos, by presenting statistics","It depends on which appeal the writer wants to emphasize"],"answerIndex":3,"explanation":"A writer's word choice and sentence structure can serve any of the three appeals, depending on intent.","difficulty":6,"skill":"Style and appeal","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q4","prompt":"What is the role of a thesis statement in an argument essay?","choices":["It is a question the essay will answer","It is the evidence that supports each reason","It is the opposing side of the argument","It is the position stated in one clear sentence"],"answerIndex":3,"explanation":"A thesis expresses the writer's overall position, usually in a single sentence.","difficulty":4,"skill":"Thesis statements","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q17","prompt":"Repeating the phrase 'We shall fight' throughout a speech is an example of which device?","choices":["Rhetorical question","Analogy","Statistic","Repetition"],"answerIndex":3,"explanation":"Repetition is the deliberate reuse of a word or phrase to emphasize a point.","difficulty":5,"skill":"Rhetorical devices","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q15","prompt":"A writer mentions her ten years of nursing experience while arguing for a health policy. Which appeal is she building?","choices":["Pathos","Ethos","Logos","Syntax"],"answerIndex":1,"explanation":"Ethos is credibility: the writer shows qualifications, experience, or trustworthiness.","difficulty":5,"skill":"Rhetorical appeals","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q49","prompt":"In analyzing a persuasive essay, a student notices the writer lists three consecutive examples that follow the same sentence pattern. What is the student analyzing, and what does it reveal?","choices":["She uses a formal, academic tone to sound trustworthy","She uses humor to make the audience laugh and relax","She uses parallel examples so the pattern itself proves the point","She uses repetition of her thesis to make it memorable"],"answerIndex":2,"explanation":"A pattern of examples acts as logical support, so the structure of the text itself carries the logos appeal.","difficulty":7,"skill":"Analyzing how style supports an argument","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q13","prompt":"A writer describes a starving animal in vivid detail to persuade readers to donate. Which appeal is this?","choices":["An appeal to emotion (pathos)","An appeal to credibility (ethos)","An appeal to logic (logos)","An appeal to timing (kairos)"],"answerIndex":0,"explanation":"Pathos is the appeal to the audience's emotions, often through vivid stories.","difficulty":6,"skill":"Rhetorical appeals","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q22","prompt":"A writer wants to convince high school students that school should start later. What is the best way to adapt to this audience?","choices":["Use formal legal terminology throughout","Repeat the same evidence for every point","Write a longer essay than anyone else","Choose examples and an appeal that matter to those students"],"answerIndex":3,"explanation":"Effective persuasion matches content and appeals to what the specific audience values and knows.","difficulty":5,"skill":"Audience awareness","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q46","prompt":"How should writers word their claims?","choices":["They should be as vague as possible","They should be specific and concise","They should repeat the evidence word for word","They should always ask a question"],"answerIndex":1,"explanation":"Precise, concise wording makes a claim clear and arguable.","difficulty":4,"skill":"Crafting claims","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q29","prompt":"When reading to analyze an argument, what should a student do while annotating?","choices":["Taking notes on the claim and how each piece of evidence connects","Reading only the introduction before the body","Copying long quotations word for word","Highlighting every sentence on the page"],"answerIndex":1,"explanation":"Active readers track the argument's structure: claim, reasons, and supporting evidence.","difficulty":5,"skill":"Annotating arguments","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q14","prompt":"Citing a study with clear data is an example of which rhetorical appeal?","choices":["Pathos","Ethos","Logos","Tone"],"answerIndex":2,"explanation":"Logos is the appeal to logic, typically using facts, statistics, and reasoning.","difficulty":5,"skill":"Rhetorical appeals","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q1","prompt":"In argument writing, what is a position?","choices":["A step-by-step account of how an experiment was performed","The specific stance a writer takes on an arguable issue","A list of sources consulted during research","The final question a writer asks readers to consider"],"answerIndex":1,"explanation":"A position is the arguable claim or stance a writer takes, not a summary or a list.","difficulty":4,"skill":"Defining position","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q16","prompt":"Why is relying on logos alone a limitation when persuading a general audience?","choices":["Data and reasoning alone are usually more persuasive for policy debates","Emotional appeals are always dishonest","Pathos can never appear in a strong argument","Logos should be reserved for conclusions only"],"answerIndex":0,"explanation":"While pathos adds force, arguments for policy decisions rest mainly on logic and evidence.","difficulty":6,"skill":"Balancing appeals","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q9","prompt":"After presenting a statistic, why does a writer add analysis?","choices":["It connects the evidence back to the claim","It introduces a brand-new position","It lists the counterarguments","It summarizes the whole essay"],"answerIndex":0,"explanation":"Analysis or commentary explains how the evidence supports the claim, closing the reasoning chain.","difficulty":5,"skill":"Analysis and commentary","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q48","prompt":"What is a qualifier in an argumentative claim?","choices":["Qualifiers","Fallacies","Anecdotes","Rebuttals"],"answerIndex":0,"explanation":"Qualifiers such as 'often,' 'may,' or 'in many cases' prevent claims from being too broad.","difficulty":5,"skill":"Qualified claims","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q36","prompt":"In argument writing, what is an analogy?","choices":["A direct quotation from an expert source","A list of numerical data and statistics","A restatement of the thesis statement","A comparison showing how one thing is similar to another"],"answerIndex":0,"explanation":"Analogies compare something unfamiliar to something familiar to clarify or persuade.","difficulty":4,"skill":"Rhetorical devices","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q8","prompt":"How does a reason differ from evidence in an argument?","choices":["A reason is the same thing as evidence","A reason explains why the claim is true; evidence proves that reason","A reason is always stated first, evidence last","A reason comes from sources; evidence comes from the writer"],"answerIndex":1,"explanation":"Reasons support the claim directly, and evidence supports each reason with facts or examples.","difficulty":6,"skill":"Reasons vs. evidence","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q47","prompt":"If research reveals evidence that contradicts your original position, what is the best move?","choices":["Change the topic","Admit the argument is wrong and stop writing","Refine the claim so it matches the evidence found","Add more emotional language"],"answerIndex":2,"explanation":"Honest writers adjust their claims to fit what the evidence actually shows.","difficulty":5,"skill":"Revising positions","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q27","prompt":"Which source would most likely be accepted as strong evidence?","choices":["Expert testimony","An anonymous blog post","A friend's personal opinion","A fictional diary entry"],"answerIndex":1,"explanation":"Testimony from a credentialed expert carries weight because the source is qualified.","difficulty":5,"skill":"Credibility of sources","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q50","prompt":"In argument writing, what is the ultimate goal of the writer's position and evidence?","choices":["The reader should feel sorry for the writer","The essay should be as long as possible","The reader should understand the position and find the reasoning convincing","The reader should agree without needing reasons"],"answerIndex":2,"explanation":"The ultimate goal is a reader who understands the claim and finds the reasoning persuasive.","difficulty":4,"skill":"Argument goals","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q43","prompt":"Which sentence is the strongest claim for an argument essay about school safety?","choices":["Schools near busy roads should install crossing guards, since three local accidents last year involved students","Crossing guards have protected children for over a century in American towns","Parents, teachers, and even some students support adding crossing guards","A city council member who grew up here remembers waiting at that intersection as a child"],"answerIndex":0,"explanation":"It states a debatable position and backs it with relevant local evidence, which is exactly what a strong claim does.","difficulty":5,"skill":"Writing specific, supportable claims","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q44","prompt":"Which approach shows a writer reasoning fairly about a complex issue?","choices":["Argue that students should not have to do homework","Present statistics about homework amounts","Claim that parents who support homework are selfish","State that research on homework's benefits is mixed, then argue for a balanced policy"],"answerIndex":2,"explanation":"Acknowledging the evidence is mixed, then reasoning toward a balanced stance, is fair and well-reasoned.","difficulty":6,"skill":"Fair reasoning","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q23","prompt":"What does 'purpose' mean when analyzing an argumentative text?","choices":["To inform","To persuade","To entertain","To describe"],"answerIndex":0,"explanation":"Purpose means what the writer wants to accomplish, and here the goal is persuasion.","difficulty":3,"skill":"Purpose","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q10","prompt":"What is it called when a writer acknowledges an opposing viewpoint and then refutes it?","choices":["Assertion","Counterclaim","Rebuttal","Concession"],"answerIndex":2,"explanation":"A rebuttal answers and refutes the opposing viewpoint.","difficulty":5,"skill":"Counterarguments","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q45","prompt":"Read: 'School uniforms, despite some drawbacks, benefit students by creating a sense of community.' What does this sentence do?","choices":["It is neutral and does not take a position","It argues that school uniforms should be required","It argues that school uniforms should be banned","It is a question for readers to answer"],"answerIndex":0,"explanation":"The sentence states a side (benefits) and the reason (sense of community), making it an argument for uniforms.","difficulty":4,"skill":"Analyzing claims","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q11","prompt":"Why is addressing a counterargument useful in persuasive writing?","choices":["It makes the essay longer and adds a new paragraph","It forces the audience to change their opinion","The writer shows awareness of the issue and strengthens credibility","It lets the writer avoid using evidence"],"answerIndex":1,"explanation":"Addressing counterarguments makes the argument more thorough and the writer more credible.","difficulty":5,"skill":"Counterarguments","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q42","prompt":"A student argues that later start times help students, cites one study, then adds: 'Some say later starts cut into after-school jobs, but a district that made the change reported no drop in work schedules.' What makes this an effective rebuttal?","choices":["The counterargument was more convincing than the writer's claim","The writer refused to admit the counterargument had any merit at all","The writer used only emotion because the evidence was too weak","The writer showed the opposing claim rests on weaker or less current evidence"],"answerIndex":3,"explanation":"A successful rebuttal fairly presents the counterargument and then undercuts it with better reasoning or evidence.","difficulty":6,"skill":"Evaluating rebuttals to counterarguments","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q39","prompt":"What is the strongest way to handle a strong counterclaim in your essay?","choices":["State the counterclaim fairly, then present evidence that weakens it","Ignore it completely and hope readers do not notice","Repeat the counterclaim without comment","Restate the thesis instead"],"answerIndex":0,"explanation":"Effective rebuttals acknowledge the opposing view, then counter it with evidence or reasoning.","difficulty":5,"skill":"Rebuttal strategy","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q21","prompt":"Who is the 'audience' in rhetorical analysis?","choices":["The writer's personal opinion about the topic","The people the writer is trying to reach and persuade","The length of the text being analyzed","The date the text was first published"],"answerIndex":2,"explanation":"Audience means the specific readers or listeners the text is designed to persuade.","difficulty":4,"skill":"Audience","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q7","prompt":"Which piece of evidence would most strongly support the claim that later school start times improve student health?","choices":["An anecdote about one student's test anxiety","A quotation from a famous motivational speaker","A statistic showing test scores before and after later start times","A general statement that most people value sleep"],"answerIndex":2,"explanation":"Statistics offer measurable, verifiable support that is stronger than anecdotes or general impressions.","difficulty":5,"skill":"Evaluating evidence strength","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q20","prompt":"When analyzing a text rhetorically, what are you primarily studying?","choices":["What the text says","How the text works to persuade its audience","Whether the text is long or short","When the text was published"],"answerIndex":1,"explanation":"Rhetorical analysis examines how techniques create persuasion, not just surface content.","difficulty":5,"skill":"Rhetorical analysis basics","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q38","prompt":"What is the common ground between writer and audience in persuasive writing?","choices":["A question the writer asks the reader at the end","The shared values, experiences, or beliefs a writer and audience have in common","The opening paragraph of the persuasive essay","The writer's personal opinion on the topic"],"answerIndex":1,"explanation":"The rhetorical 'common ground' is the shared starting point between writer and audience.","difficulty":6,"skill":"Common ground","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q25","prompt":"What is the typical job of the conclusion in an argument essay?","choices":["Announcing a brand-new position","Introducing a completely different topic","Apologizing for the writer's opinion","Restating the position and summarizing key reasons"],"answerIndex":3,"explanation":"Conclusions reinforce the argument by restating the claim and main supporting points.","difficulty":4,"skill":"Essay structure","topic":"Rhetorical Analysis: Position and Evidence"},{"id":"q34","prompt":"How should a writer's position and evidence change for different audiences?","choices":["The position should change to match the audience's view","The evidence should be chosen to be most relevant and convincing for that audience","The argument should avoid all appeals to emotion","The thesis should be hidden until the conclusion"],"answerIndex":1,"explanation":"Good writers keep their position but select evidence and appeals suited to their audience.","difficulty":5,"skill":"Audience and evidence","topic":"Rhetorical Analysis: Position and Evidence"}],"feedback":{"correct":"Good sow — your marble lands with purpose, like a claim backed by solid evidence.","incorrect":"That pit slips through your fingers — remember, a strong position needs the right evidence behind it.","win":"Your store overflowed — you argued your position and the evidence captured the board.","lose":"The board got swept before your argument could land. Review position and evidence, then sow again.","draw":"Draw game.","outOfQuestions":"Out of questions."}}][0];

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
    var PITS = 6;
    var START_MARBLES = 4;
    var KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

    var q = function (name) { return root.querySelector('[data-game-' + name + ']'); };
    var el = {
      topic: q('topic'), counter: q('counter'), status: q('status'),
      prompt: q('prompt'), choices: q('choices'), verdict: q('verdict'),
      board: q('board'), ycount: q('ycount'), bcount: q('bcount'),
      modal: q('modal'), result: q('result'), endstats: q('endstats'),
      restart: q('restart'), next: q('next'),
    };

    var state = null;

    function emit(name, detail) {
      var data = { source: 'mancala', engineId: 'mancala' };
      for (var k in detail) data[k] = detail[k];
      try {
        window.dispatchEvent(new CustomEvent('game:' + name, { detail: data }));
      } catch (err) { /* an engine must never break the page over telemetry */ }
    }

    // The sowing ring: your pits toward your store, then the bot's pits toward
    // the bot's store, and round again. Your sow skips the bot's store and the
    // bot's sow skips yours.
    function nextNode(node) {
      if (node[0] === 'U') return node[1] + 1 < PITS ? ['U', node[1] + 1] : ['US'];
      if (node[0] === 'US') return ['B', 0];
      if (node[0] === 'B') return node[1] + 1 < PITS ? ['B', node[1] + 1] : ['BS'];
      return ['U', 0];
    }
    function nodeCount(node) {
      if (node[0] === 'U') return state.U[node[1]];
      if (node[0] === 'B') return state.B[node[1]];
      return node[0] === 'US' ? state.US : state.BS;
    }
    function nodeAdd(node, v) {
      if (node[0] === 'U') state.U[node[1]] += v;
      else if (node[0] === 'B') state.B[node[1]] += v;
      else if (node[0] === 'US') state.US += v;
      else state.BS += v;
    }
    function nodeTake(node) {
      var v = nodeCount(node);
      nodeAdd(node, -v);
      return v;
    }

    // Sow one pit, then capture when the last marble lands in an empty pit on
    // the mover's own side: that marble and everything opposite go to the store.
    function sow(side, pit) {
      var node = [side, pit];
      var hand = nodeTake(node);
      var last = node;
      while (hand > 0) {
        node = nextNode(node);
        if ((side === 'U' && node[0] === 'BS') || (side === 'B' && node[0] === 'US')) continue;
        nodeAdd(node, 1);
        hand--;
        last = node;
      }
      var captured = 0;
      if (last[0] === side && nodeCount(last) === 1) {
        var opposite = [side === 'U' ? 'B' : 'U', PITS - 1 - last[1]];
        captured = nodeTake(last) + nodeTake(opposite);
        nodeAdd(side === 'U' ? ['US'] : ['BS'], captured);
      }
      return { last: last, captured: captured };
    }

    function landingNode(side, pit) {
      var node = [side, pit];
      var hand = nodeCount(node);
      var last = node;
      while (hand > 0) {
        node = nextNode(node);
        if ((side === 'U' && node[0] === 'BS') || (side === 'B' && node[0] === 'US')) continue;
        hand--;
        last = node;
      }
      return last;
    }

    // Deterministic on purpose: store landing, then capture, then leftmost.
    function botPit() {
      for (var i = 0; i < PITS; i++) {
        if (state.B[i] === 0) continue;
        var last = landingNode('B', i);
        if (last[0] === 'BS') return i;
        if (last[0] === 'B' && state.B[last[1]] === 0 && state.U[PITS - 1 - last[1]] > 0) return i;
      }
      for (var j = 0; j < PITS; j++) if (state.B[j] > 0) return j;
      return -1;
    }

    function sideEmpty(side) {
      var pits = side === 'U' ? state.U : state.B;
      for (var i = 0; i < PITS; i++) if (pits[i] > 0) return false;
      return true;
    }

    function sweep() {
      for (var i = 0; i < PITS; i++) {
        state.US += state.U[i];
        state.U[i] = 0;
        state.BS += state.B[i];
        state.B[i] = 0;
      }
    }

    function renderPit(count, side, pit) {
      var pitEl;
      if (side === 'U') {
        pitEl = document.createElement('button');
        pitEl.type = 'button';
        pitEl.className = 'man-pit man-pit--you';
        pitEl.dataset.pit = String(pit);
        if (state.phase === 'acting' && count > 0) {
          pitEl.classList.add('man-pit--open');
          pitEl.setAttribute('data-game-action', '');
        }
        pitEl.setAttribute('aria-label', 'Your pit ' + (pit + 1) + ' with ' + count + ' marbles'
          + (state.phase === 'acting' && count > 0 ? ', choose to sow it' : ''));
      } else {
        pitEl = document.createElement('div');
        pitEl.className = 'man-pit man-pit--bot';
        pitEl.setAttribute('role', 'gridcell');
        pitEl.setAttribute('aria-label', 'Bot pit ' + (pit + 1) + ' with ' + count + ' marbles');
      }
      var num = document.createElement('span');
      num.textContent = String(count);
      pitEl.appendChild(num);
      var dots = document.createElement('span');
      dots.className = 'man-dots';
      for (var d = 0; d < Math.min(count, 8); d++) {
        var dot = document.createElement('span');
        dot.className = 'man-dot';
        dots.appendChild(dot);
      }
      pitEl.appendChild(dots);
      var small = document.createElement('small');
      small.textContent = side === 'U' ? 'you' : 'bot';
      pitEl.appendChild(small);
      return pitEl;
    }

    function renderStore(count, side) {
      var store = document.createElement('div');
      store.className = 'man-store ' + (side === 'U' ? 'man-store--you' : 'man-store--bot');
      store.setAttribute('role', 'gridcell');
      store.setAttribute('aria-label', (side === 'U' ? 'Your store' : 'Bot store') + ' with ' + count + ' marbles');
      var num = document.createElement('span');
      num.textContent = String(count);
      store.appendChild(num);
      var small = document.createElement('small');
      small.textContent = side === 'U' ? 'you' : 'bot';
      store.appendChild(small);
      return store;
    }

    function renderBoard() {
      el.board.innerHTML = '';
      el.board.appendChild(renderStore(state.BS, 'B'));
      // The bot row runs right to left along the top so the sowing ring reads
      // counter-clockwise: your pits, your store, their pits, their store.
      for (var b = PITS - 1; b >= 0; b--) el.board.appendChild(renderPit(state.B[b], 'B', b));
      el.board.appendChild(renderStore(state.US, 'U'));
      for (var u = 0; u < PITS; u++) el.board.appendChild(renderPit(state.U[u], 'U', u));
      el.ycount.textContent = String(state.US);
      el.bcount.textContent = String(state.BS);
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
        btn.className = 'man-choice';
        btn.dataset.index = String(i);
        btn.setAttribute('data-game-choice', String(i));
        var key = document.createElement('span');
        key.className = 'man-key';
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
      el.verdict.className = 'man-verdict ' + (correct ? 'man-verdict--good' : 'man-verdict--bad');
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
        : 'Answer to sow one of your pits.';
    }

    function checkEnd() {
      if (sideEmpty('U') || sideEmpty('B')) {
        sweep();
        renderBoard();
        return endGame(state.US > state.BS ? 'win' : state.US < state.BS ? 'lose' : 'draw');
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
      el.result.className = 'man-result man-result--' + result;
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
      var buttons = el.choices.querySelectorAll('.man-choice');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = true;
        if (Number(buttons[i].dataset.index) === index) {
          buttons[i].classList.add(correct ? 'man-choice--right' : 'man-choice--wrong');
        }
        if (!correct && Number(buttons[i].dataset.index) === Number(item.answerIndex)) {
          buttons[i].classList.add('man-choice--right');
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
        el.status.textContent = feedback.correct || 'Correct — choose a pit to sow.';
        renderBoard();
      } else {
        el.status.textContent = feedback.incorrect || 'Incorrect — the bot sows instead.';
        var pit = botPit();
        if (pit >= 0) {
          var moved = sow('B', pit);
          if (moved.captured > 0) el.status.textContent += ' The bot captured ' + moved.captured + ' marbles.';
        }
        if (!checkEnd()) askNext();
      }
    }

    function onPit(pit) {
      if (state.phase !== 'acting' || pit < 0 || pit >= PITS || state.U[pit] === 0) return;
      var moved = sow('U', pit);
      el.status.textContent = moved.captured > 0
        ? 'You captured ' + moved.captured + ' marbles!'
        : 'You sowed pit ' + (pit + 1) + '.';
      renderBoard();
      if (!checkEnd()) askNext();
    }

    // ---- wire up a fresh round -------------------------------------------------
    //
    // The board resets; the question cursor does not. "Play again" is another
    // round taken up at the next unseen question, never the same one twice.
    state = {
      U: [], B: [], US: 0, BS: 0,
      item: null, qPos: 0, qNo: 0, used: 0, correct: 0, wrong: 0,
      phase: 'question', qStartMs: 0,
    };
    for (var i = 0; i < PITS; i++) {
      state.U.push(START_MARBLES);
      state.B.push(START_MARBLES);
    }
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
      var btn = event.target.closest ? event.target.closest('.man-choice') : null;
      if (btn && !btn.disabled) onAnswer(Number(btn.dataset.index));
    };
    el.board.onclick = function (event) {
      var pitEl = event.target.closest ? event.target.closest('.man-pit--you') : null;
      if (pitEl && pitEl.dataset.pit != null) onPit(Number(pitEl.dataset.pit));
    };
    el.restart.onclick = function () { window.initGame(payload); };

    renderBoard();
    askNext();
    emit('start', { engineId: 'mancala' });
  };

  if (window.GAME_DATA) window.initGame(window.GAME_DATA);
