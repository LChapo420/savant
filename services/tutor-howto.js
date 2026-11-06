/**
 * What the tutor knows about the PRODUCT (owner, 6 Nov 2026: "it knows the product, how to use every feature").
 *
 *   features        every feature, its page and the steps, written once here and checked against public/*.html by
 *                   scripts/tutor-full-test.js (each `path` must be a real page)
 *   pages           what each page is for, whether it is a graded sitting, and the usual ways a learner gets stuck there
 *   match(q)        the features a question is about, best first
 *   lines(q, path)  context lines for the prompt: this page, then the matching features
 *   instant(q)      a complete answer when the question is plainly a how-to and one feature matches strongly (no model)
 *   stuckLines(path, stuck)  what to tell the model, and the fallback, when a learner is stuck on this kind of page
 *
 * Nothing here holds learner data or any answer. Wording is plain; steps name buttons the way the pages do.
 */

const FEATURES = [
  { id: 'upload', title: 'Upload your own material', path: '/my-material', words: 'upload|my material|own material|notes|pdf|textbook|slides|paste text|youtube|video|recording|audio|document|study my|add a file|import|class notes',
    steps: 'Open My material. Add a file, paste text, add a web page, a YouTube video, a transcript or a recording. Savant reads it, builds a course from it with lessons, questions, flashcards, notes, a practice test and a podcast, and schedules reviews. Open the course from the same page.' },
  { id: 'material-study', title: 'Study your uploaded course', path: '/my-material-study', words: 'study (my|your) (course|material)|my course|uploaded course|skills? due|material (study|course)',
    steps: 'Open My material, pick the course, then Study. It works through the skills in your material and brings back the ones due for review.' },
  { id: 'flashcards', title: 'Flashcards from your material', path: '/my-material-cards', words: 'flash ?cards?|cards',
    steps: 'Open My material, pick a course and choose Flashcards. They come from your own upload.' },
  { id: 'podcast', title: 'Podcast of your material', path: '/my-material-podcast', words: 'podcast|listen|audio lesson',
    steps: 'Open My material, pick a course and choose Podcast to listen to it explained.' },
  { id: 'practice-test', title: 'Practice test on your material', path: '/my-material-test', words: 'practice test|test (on|of) my|mock test|material test',
    steps: 'Open My material, pick a course and choose Practice test. It is a graded sitting, so the tutor gives hints about method only there.' },
  { id: 'dashboard', title: 'Dashboard', path: '/dashboard', words: 'dashboard|home|where do i start|what should i do|today.?s plan|my subjects|next steps?|overview',
    steps: 'The dashboard shows today\'s plan, your subjects, recent sessions, your preferences and what the tutor has noticed. Start with Today\'s plan.' },
  { id: 'path', title: 'Your path (levels and skills)', path: '/path', words: 'path|levels?|move up|next level|unit|skills at this level|progress through|level up',
    steps: 'Open a subject from the dashboard to see its path: the skills at your level and what moves you to the next one. A Challenge Exam lets you test out of a unit.' },
  { id: 'practice', title: 'Today\'s practice', path: '/skill-practice', words: 'practice|practise|drill|exercises?|today.?s practice',
    steps: 'Today\'s practice is a short set picked for you from what you are weakest at and what is fading. Open it from the dashboard.' },
  { id: 'review', title: 'Review', path: '/review', words: 'review|due|revise|revision|remember|forgetting|spaced',
    steps: 'Review brings back things that are about to fade, timed by how long you want to remember them. It is a retrieval sitting: the tutor gives method hints only, so your result is honest.' },
  { id: 'daily-check', title: 'Daily check', path: '/daily-check', words: 'daily check|daily quiz|check.?in|every day',
    steps: 'The daily check is a short sitting that keeps your picture of what you know current. It is a check, so the tutor gives hints about method only.' },
  { id: 'placement', title: 'Placement quiz', path: '/placement', words: 'placement|find my level|where do i start in|placed|level check',
    steps: 'The placement quiz finds your starting level in a subject so lessons are not too easy or too hard. Answer honestly and skip what you do not know instead of guessing. Hints are about method only.' },
  { id: 'subject-placement', title: 'Find your grade', path: '/subject-placement', words: 'find (my|your) grade|grade level|what grade',
    steps: 'Find your grade is the placement for school subjects like maths and reading. Answer as you would on your own.' },
  { id: 'stage-check', title: 'Stage check', path: '/stage-check', words: 'stage check|end of stage|stage test|move on to',
    steps: 'A stage check confirms you have the whole stage before you move on. It is graded: method hints only. Stage left shows what remains.' },
  { id: 'skip', title: 'Challenge Exam (test out)', path: '/skip', words: 'challenge exam|test out|skip (a )?(unit|level)|skip ahead|already know',
    steps: 'If you already know a unit, the Challenge Exam lets you test out of it. Pass and you move on; it is graded, so method hints only.' },
  { id: 'enforcer', title: 'Retention enforcer', path: '/enforcer', words: 'enforcer|second look|keep remember|retention check',
    steps: 'The enforcer takes a second look at things you got right once, to be sure they stuck. It is a retrieval sitting: method hints only.' },
  { id: 'calendar', title: 'Retention calendar', path: '/calendar', words: 'calendar|when (do i|should i) (study|review)|retention goal|test date|exam date|how long.*remember|remember (it )?for|schedule',
    steps: 'The retention calendar shows what is coming up. Set a test date or how long you want to remember each subject or course, and Savant times reviews to fit it.' },
  { id: 'catchup', title: 'Catch me up', path: '/catchup', words: 'catch me up|catch up|behind|gaps?|missed',
    steps: 'Catch me up finds what you are missing for a level you want to reach and builds the shortest route to it.' },
  { id: 'help-wrong', title: 'Work on what went wrong', path: '/help', words: 'what went wrong|mistakes?|wrong answers?|got (it )?wrong|fix my errors',
    steps: 'After a question you got wrong, Work on what went wrong reads your attempt, shows the idea you missed and gives you a fresh question on it.' },
  { id: 'my-stats', title: 'My stats', path: '/my-stats', words: 'my stats|statistics|how (am i|fast am i)|scorecard|progress|numbers|accuracy|speed',
    steps: 'My stats shows your averages and day by day numbers. Your scorecard is the set of measures about how you learn, and it keeps updating from everything you do.' },
  { id: 'profile', title: 'Your profile and settings', path: '/profile', words: 'settings?|profile|change (my )?(name|password|email|look|theme|subjects?|focus)|delete (my )?account|export (my )?data|download my data|privacy|dark mode|my subjects',
    steps: 'Open your profile for settings: subjects, look, focus and your account. You can export your data or delete your account and everything tied to it there.' },
  { id: 'extras', title: 'Extras (boosters)', path: '/boosters', words: 'extras?|boosters?|study habits|memory check|brain games?|quiet signals|past results',
    steps: 'Extras holds optional measures: a study habits questionnaire, a reading check, a memory check, brain games and quiet signals. All optional; each one helps Savant fit itself to you.' },
  { id: 'style-quiz', title: 'Learning-style quiz', path: '/style-quiz', words: 'style quiz|learning style|how do i learn|quiz about me',
    steps: 'The learning-style quiz asks how you like to learn so lessons can be fitted to you. You can redo it any time.' },
  { id: 'survey', title: 'About you (interests and goals)', path: '/survey', words: 'interests?|hobbies|dislikes?|goals?|about you|tell you about me|survey|what i like',
    steps: 'About you records your interests, hobbies, dislikes and goals. Lessons and questions use them, so update it when they change.' },
  { id: 'baseline', title: 'How you learn', path: '/baseline', words: 'how you learn|baseline',
    steps: 'How you learn is a short set of tasks that gives Savant a first picture of how you learn.' },
  { id: 'reading-check', title: 'Reading check', path: '/reading-check', words: 'reading check|reading level',
    steps: 'The reading check measures your reading from your own answers. The tutor is off during it, because help would change what it measures.' },
  { id: 'act', title: 'ACT prep', path: '/act', words: 'act\\b|act prep|act score|sat',
    steps: 'ACT prep starts at your level. Add a test date and a target so the plan counts the days; ACT scores keeps your results.' },
  { id: 'game-lab', title: 'Game lab', path: '/game-lab', words: 'games?|game lab',
    steps: 'The game lab holds the rebuilt learning games. Open one and the tutor can see its rule and your last result, never the answer.' },
  { id: 'curriculum', title: 'The whole curriculum', path: '/curriculum', words: 'curriculum|all subjects|what can i learn|what subjects',
    steps: 'The curriculum page lists every subject and level so you can see the whole map.' },
  { id: 'tutor', title: 'The tutor', path: '/dashboard', words: 'tutor|what can you do|who are you|how do you work|what do you know|memory|forget|voice',
    steps: 'The tutor is the Ask tutor button on every page. It knows your goals, what you got wrong and what is on screen, and gives hints instead of answers while you are working a question. You can type or talk. "What does my tutor know?" on the dashboard shows what it remembers and lets you delete any of it.' },
  { id: 'parent', title: 'Parent consent', path: '/parent-needed', words: 'parent|guardian|consent|under 13|my mom|my dad|permission',
    steps: 'Under 13, a parent or guardian agrees by email before the camera, microphone and AI chat open. Until then the rest of the app works.' },
  { id: 'graduation', title: 'Graduation', path: '/held', words: 'graduat|held|finished (a )?subject',
    steps: 'Graduation shows when you have finished what a subject offers, and what to do to keep it fresh.' },
];

// What each page is. `graded` pages give method hints only (services/tutor-context.js METHOD_ONLY); `stuck` is how learners usually stall there.
const PAGES = [
  { re: /^\/(session|base-lesson)/, name: 'a lesson', graded: false, stuck: 'Re-read the last part in your own words, find the one word you do not know, try a smaller or simpler version of the question, then ask me what the idea is.' },
  { re: /^\/(skill-practice|help|catchup)/, name: 'practice', graded: false, stuck: 'Say what the question is asking in your own words, write what you know, try the first small step, and if two choices look right, ask what would make one of them wrong.' },
  { re: /^\/(placement|subject-placement)/, name: 'a placement quiz', graded: true, stuck: 'It is fine not to know: skip it or give your honest best guess, so your level is accurate. I can help with how to read a question but not with the answer.' },
  { re: /^\/(stage-check|skip|enforcer|review|daily-check)/, name: 'a check', graded: true, stuck: 'Read the question twice, cross out what cannot be right, and answer what you can first. I can give hints about method only here, so your result is honest.' },
  { re: /^\/my-material-test|^\/my-material-study/, name: 'your own material', graded: true, stuck: 'Think back to where it was in your material, then try recalling it before looking. I can point to the right part of your notes after you answer.' },
  { re: /^\/my-material/, name: 'the upload page', graded: false, stuck: 'Pick one way in: upload a file, paste text, or add a link. Short is fine to start.' },
  { re: /^\/dashboard/, name: 'the dashboard', graded: false, stuck: 'Start with Today\'s plan. If you are not sure what to do, it is picked for you.' },
  { re: /^\/(profile|boosters|survey|style-quiz|baseline|calendar|my-stats|path|curriculum)/, name: 'settings and your numbers', graded: false, stuck: 'Tell me what you are trying to change or find and I will say where it is.' },
];

const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

function pageInfo(path) {
  const p = String(path || '/').toLowerCase().split('?')[0];
  return PAGES.find((x) => x.re.test(p)) || null;
}

const STOP = new Set('the a an i me my to do how can where what is it of in on for and or with you your this that about just please'.split(' '));

/** The features a question is about, best first: [{ f, score }]. */
function match(q) {
  const text = String(q || '').toLowerCase();
  if (!text.trim()) return [];
  const words = new Set(text.replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)));
  const out = [];
  for (const f of FEATURES) {
    let score = 0;
    for (const alt of f.words.split('|')) {
      let re;
      try { re = new RegExp(alt.includes('\\') || /[()?]/.test(alt) ? alt : `\\b${alt}`, 'i'); } catch { continue; }
      if (re.test(text)) score += alt.length > 6 ? 2 : 1;
    }
    if (words.has(f.id)) score += 1;
    if (score) out.push({ f, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

const HOWTO_ASK = /\b(how (do|can|could|would|should) (i|we|you)|how to|where (is|are|do|can|can't|did)|where's|can i|is there (a|any) way|what('s| is) the (button|page|way)|how does .* work|what does .* do|show me how|take me to|find the|help me (find|use|set)|how come|set up|where to)\b/i;
// A question about the learner's own work is never a how-to, even with a feature word in it.
const OWN_WORK = /\b(answer|solve|equation|fraction|what is \d|the question|this question|\d\s*[-+*/x]\s*\d|translate|essay|paragraph|why is|explain)\b/i;

/** A complete answer for a plain how-to question, with no model (instant and free). Null when it is not one. */
function instant(q, { name } = {}) {
  const text = String(q || '');
  if (!HOWTO_ASK.test(text) || OWN_WORK.test(text) || text.length > 200) return null;
  const m = match(text);
  if (!m.length || m[0].score < 2) return null;
  if (m[1] && m[1].score === m[0].score && m[1].f.path !== m[0].f.path) return null; // two equally good readings: let the model ask
  const f = m[0].f;
  return { feature: f.id, path: f.path, reply: `${name ? `${name}, ` : ''}${f.title}: ${f.steps} It is at ${f.path}.` };
}

/** Prompt lines about the product for this question and page. */
function lines(q, path) {
  const out = [];
  const pg = pageInfo(path);
  if (pg) out.push(`This page is ${pg.name}${pg.graded ? ' (a graded or retrieval sitting)' : ''}.`);
  for (const { f } of match(q).slice(0, 2)) out.push(`${f.title} (${f.path}): ${f.steps}`);
  return out;
}

/** Notes for a learner who looks stuck here: what the model should do, and the plain fallback advice. */
function stuckLines(path, stuck) {
  const pg = pageInfo(path);
  if (!stuck) return [];
  const bits = [];
  if (stuck.idle_s >= 30) bits.push(`quiet for about ${Math.round(stuck.idle_s)} seconds`);
  if (stuck.wrong >= 2) bits.push(`${stuck.wrong} wrong tries in a row`);
  if (stuck.asked) bits.push('has asked for help already');
  if (!bits.length) return [];
  return [`They look stuck: ${bits.join(', ')}.${pg ? ` On ${pg.name}, what usually helps: ${pg.stuck}` : ''} Be gentle, say what you notice, and give the smallest next step.`];
}

/** The plain advice for this page when no model is reachable. */
function stuckAdvice(path) {
  const pg = pageInfo(path);
  return pg ? pg.stuck : 'Tell me what you are trying to do and I will say where it is.';
}

module.exports = { FEATURES, PAGES, match, instant, lines, stuckLines, stuckAdvice, pageInfo, clip };
