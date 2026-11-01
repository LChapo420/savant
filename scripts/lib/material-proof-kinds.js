/**
 * The material kinds of scripts/scorecard-material-proof.js: the base texts, how each kind is generated through the app's
 * REAL generator (services/material-*.js, services/course-builder.js, services/lessons via ai.generateLesson), how the
 * result is shown to a judge, which spec fields apply to it, and what plain code can measure in it.
 *
 * Nothing here calls a model itself: every generator is given the same transport (the mock, the app's pool or the
 * Standard Compute writer, installed by the harness), exactly as the app calls it.
 */
const ls = require('../../services/learning-spec');

const KINDS = ['lesson', 'notes', 'podcast', 'test', 'pack', 'path'];

const KIND_INFO = {
  lesson: { label: 'Lesson', what: 'one short lesson (intro, sections, a worked example, a summary and check questions) on the topic' },
  notes: { label: 'Notes', what: 'study notes: sections of one-sentence bullets that outline the base text in the order it teaches' },
  podcast: { label: 'Podcast', what: 'a short two-host podcast script (host A explains, host B asks) that talks through the base text; the marks [CHECK-IN QUESTION] show where the app would pause to ask the listener a question' },
  test: { label: 'Practice test', what: 'a practice test on the base text: the questions in the order they are asked, each with its tier (1 recall, 2 use, 3 combine or a new setting), its answer and the explanation shown after a miss' },
  pack: { label: 'Study pack', what: 'a study pack: a short summary, flashcards, a quiz and a practice test, all from the base text' },
  path: { label: 'Learning path', what: 'a learning path: the skills in order, each with its short lesson text and key points, all from the base text' },
};

// ── the base texts: what each synthetic learner "uploaded" ──────────────────
const BASE_TEXTS = {
  photosynthesis: [
    'Photosynthesis is the process plants use to make their own food. A plant takes in carbon dioxide from the air through tiny openings in its leaves and takes in water from the soil through its roots. Using light energy from the sun, the plant turns carbon dioxide and water into glucose, a kind of sugar. The glucose is the plant\'s food, and the plant uses it to grow and to store energy.',
    'Photosynthesis happens mainly in the leaves. Inside the cells of a leaf are small green structures called chloroplasts. They contain a green pigment called chlorophyll. Chlorophyll absorbs light energy from the sun, mostly red and blue light, and reflects green light, which is why leaves look green. Without chlorophyll the plant could not capture the light energy it needs.',
    'Oxygen is released as a by-product of photosynthesis. The oxygen leaves the plant through the same tiny openings in the leaves. Animals and people breathe in this oxygen, which is one reason plants matter so much to life on Earth. The whole process can be written as a word equation: carbon dioxide plus water, using light energy, makes glucose plus oxygen.',
    'A plant that gets too little light, too little water or too little carbon dioxide makes less glucose and grows more slowly. This is why a plant kept in a dark cupboard turns pale and weak.',
  ].join('\n\n'),
  'two-step equations': [
    'A two-step equation needs two steps to solve, such as 2x + 3 = 11. The goal is to get the variable x alone on one side of the equals sign. To do that we undo the operations that have been done to x, using the opposite operation.',
    'Step one is to undo addition or subtraction. In 2x + 3 = 11 the number 3 is added, so we subtract 3 from both sides. That gives 2x = 8. Step two is to undo multiplication or division. Here x is multiplied by 2, so we divide both sides by 2. That gives x = 4.',
    'The most important rule is that whatever you do to one side of the equation you must do to the other side. An equation is like a balanced scale, and doing the same thing to both sides keeps it balanced. If you subtract 3 from only one side, the equation is no longer true.',
    'Always check your answer by putting it back into the original equation. For x = 4, 2 times 4 plus 3 is 8 plus 3, which is 11. The left side equals the right side, so the answer is correct. A second example is 3x - 5 = 10: add 5 to both sides to get 3x = 15, then divide both sides by 3 to get x = 5.',
  ].join('\n\n'),
  'causes of World War I': [
    'Historians often describe four long-term causes of the First World War, plus one event that set it off. The first is militarism. In the years before 1914 the great powers built up large armies and navies, and Germany and Britain raced to build battleships. Generals began to plan for war, and many leaders came to see it as a normal way to settle disputes.',
    'The second cause is alliances. Europe was divided into two blocs. The Triple Entente joined France, Russia and Britain, and the Triple Alliance joined Germany, Austria-Hungary and Italy. Because of these alliances, a local conflict could pull in many countries, so a quarrel between two states could grow into a continental war.',
    'The third cause is imperialism, which means rivalry between empires for colonies, markets and power. The European empires competed for land and resources in Africa and Asia, which increased distrust between them.',
    'The fourth cause is nationalism, strong pride in one\'s nation or a wish for independence. Nationalism was especially powerful in the Balkans, where Serbia wanted to unite the Slavic peoples and Austria-Hungary feared losing its empire.',
    'The spark was the assassination of Archduke Franz Ferdinand, heir to the Austro-Hungarian throne, in Sarajevo on 28 June 1914. Because of the alliances, Austria-Hungary\'s war on Serbia soon drew in Russia, Germany, France and Britain.',
  ].join('\n\n'),
  'Spanish greetings': [
    'Spanish has many everyday greetings. The simplest is hola, which means hello. You can use it at any time of day, with friends or with people you have just met.',
    'To greet people at a certain time of day, Spanish speakers say buenos días for good morning, buenas tardes for good afternoon, and buenas noches for good evening or good night. Notice that días is masculine plural while tardes and noches are feminine plural, so the endings buenos and buenas change.',
    'To say goodbye you can say adiós, which means goodbye, or hasta luego, which means see you later. Hasta luego is friendly and is used when you expect to see the person again soon.',
    'To ask how someone is, Spanish has an informal and a formal way. With friends, family and children use the informal question cómo estás, which means how are you. With older people, strangers or in polite situations use the formal question cómo está usted, which also means how are you. The usual answer is bien, gracias, which means fine, thank you.',
    'When you meet someone for the first time, say mucho gusto, which means nice to meet you.',
  ].join('\n\n'),
};

// ── small helpers ───────────────────────────────────────────────────────────
const lean = (spec, l) => (spec && spec.levers && spec.levers[l]) || 0;
const words = (t) => String(t || '').toLowerCase().match(/[a-zà-ÿ][a-zà-ÿ'-]*/g) || [];
const sentences = (t) => String(t || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.split(' ').length >= 2);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const TEST_WORDS = /\b(test|tests|exam|quiz|timed|score|scored|graded)\b/gi;

// ── how each artifact is shown to the judge, as plain text ──────────────────
function renderNotes(notes) {
  return (notes.sections || []).map((s) => `## ${s.heading}\n${s.bullets.map((b) => `- ${b.text}`).join('\n')}`).join('\n\n');
}

function renderPodcast(episode, spec) {
  const turns = episode.turns || [];
  const slots = new Set(require('../../services/material-podcast').checkinSlots(turns, spec).map((s) => s.after));
  const lines = [`TITLE: ${episode.title}`];
  turns.forEach((t, i) => { lines.push(`${t.host}: ${t.text}`); if (slots.has(i)) lines.push('[CHECK-IN QUESTION]'); });
  return lines.join('\n');
}

const showQ = (q, n) => {
  const ans = q.type === 'multiple_choice' ? `choices: ${q.choices.map((c, i) => `(${String.fromCharCode(65 + i)}) ${c}`).join(' | ')}; correct: ${String.fromCharCode(65 + q.answer_index)}` : q.type === 'written' ? `typed or written answer; model answer: ${q.answer}` : `typed answer; correct: ${q.answer}`;
  return `${n}. [tier ${q.tier || 2}] ${q.prompt} (${ans})\n   EXPLANATION: ${q.explanation || ''}`;
};

function renderPack(pack) {
  return [
    `SUMMARY:\n${(pack.summary || []).join('\n\n')}`,
    `FLASHCARDS (${(pack.cards || []).length}):\n${(pack.cards || []).map((c, i) => `${i + 1}. ${c.front} -> ${c.back}`).join('\n')}`,
    `QUIZ (${(pack.quiz || []).length} questions, in this order):\n${(pack.quiz || []).map((q, i) => showQ(q, i + 1)).join('\n')}`,
    `PRACTICE TEST (${(pack.test || []).length} questions, in this order):\n${(pack.test || []).map((q, i) => showQ(q, i + 1)).join('\n')}`,
  ].join('\n\n');
}

function renderPath(course) {
  return (course.skills || []).map((s, i) => `SKILL ${i + 1}: ${s.title} (${(s.questions || []).length} practice questions)\n${(s.lesson.paragraphs || []).join('\n')}${(s.lesson.key_points || []).length ? `\nKEY POINTS: ${s.lesson.key_points.join(' | ')}` : ''}`).join('\n\n');
}

function renderTest(t) {
  return [`QUESTIONS: ${t.questions.length} in the order they are asked. ${t.timed_seconds ? `If the learner picks the timed test: ${t.timed_seconds} seconds a question.` : ''} The untimed test is offered first: ${t.suggest_timed ? 'no' : 'yes'}.`, ...t.questions.map((q, i) => showQ(q, i + 1))].join('\n');
}

// ── the spec fields a judge scores, per kind ────────────────────────────────
const grade = (s) => `Vocabulary at about reading grade ${s.language.vocabularyGrade}; terms defined ${s.language.defineTerms}${s.learner.esl ? '; English is not their first language' : ''}`;
const cap = (s, what = 'Sentences') => `${what} up to about ${s.language.maxSentenceWords} words`;
const tone = (s) => { const t = s.feedback.tone; return `Tone: warmth ${t.warmth}, formality ${t.formality}, humour ${t.humor}, praise ${t.praise}, correction ${t.correction}${s.feedback.lowStakes ? ', low stakes with no test language or timers' : ''}`; };
const lengthLine = (s, what) => (lean(s, 'length') <= -0.15 ? `${what} as short as possible while keeping every definition, formula and step the text gives` : lean(s, 'length') >= 0.15 ? `${what} fuller, keeping the reasoning the text gives` : `${what} of standard length`);
const density = (s) => `Layout: text density ${s.explain.textDensity}, paragraphs of up to ${s.explain.paragraphSentences} sentences${s.explain.visual ? ', structure laid out so it can be scanned (aligned lists, before/after pairs)' : ''}${s.explain.numberedSteps ? ', numbered steps where the text has steps' : ''}`;
const order = (s) => `Order of explanation: ${s.explain.order}; ${s.explain.conceptFirst}${s.lesson.bigPictureFirst ? '; opens with the big picture' : ''}`;
const typedLine = (s) => `Answer format: ${s.practice.typedAnswers >= 0.7 ? 'mostly typed short answers rather than multiple choice' : s.practice.typedAnswers <= 0.3 ? 'mostly multiple choice, few typed answers' : 'a mix of multiple choice and typed answers'}`;
const explainLine = (s) => `Explanation after each question: ${s.feedback.granularity === 'detailed' ? 'two or three sentences, step by step, why the right answer is right and why the tempting wrong one fails' : s.feedback.granularity === 'brief' ? 'one short sentence: the right answer and the single fix' : 'one or two sentences'}${s.feedback.tone.correction === 'gentle' ? '; worded gently, saying what is right first' : ''}`;
const stakesLine = (s) => `Stakes: ${s.feedback.lowStakes ? 'low; no test, exam, quiz, timed, score or graded language, framed as practice' : 'ordinary; test language is fine'}`;
const rampLine = (s) => { const d = s.difficulty; return `Difficulty: the questions start ${d.startOffset <= -0.5 ? 'clearly below' : d.startOffset >= 0.5 ? 'at or above' : 'at'} the level (${d.startOffset <= -0.5 ? 'easy wins first' : d.startOffset >= 0.5 ? 'not bare recall first' : 'recall or use first'}) and ramp ${d.rampLabel} (a ${d.rampLabel} climb in tiers, hardest last)`; };

function fields(kind, spec) {
  const s = spec;
  const f = [];
  const add = (id, text) => f.push([id, text]);
  if (kind === 'notes') {
    const maxB = s.isDefault ? 8 : Math.max(3, Math.min(8, s.lesson.chunkSentences + 2));
    add('bullet_size', `Bullet size and number: 2 to ${maxB} bullets a section, each one plain sentence; ${s.lesson.chunkSentences <= 3 ? 'small chunks: short bullets, one idea each, more and smaller sections' : s.lesson.chunkSentences >= 6 ? 'fuller bullets that keep a whole idea together' : 'medium chunks'}`);
    add('brevity', lengthLine(s, 'Notes are'));
    add('density_layout', density(s));
    add('vocabulary', grade(s));
    add('sentence_length', cap(s, 'Bullet sentences'));
    add('register', `Register: ${s.feedback.tone.formality >= 0.6 ? 'formal' : s.feedback.tone.formality <= 0.3 ? 'casual and plain' : 'neutral'}`);
    if (s.lesson.recapAtEnd) add('recap_end', 'Ends with a short "what to remember" recap');
    if (s.explain.rigor !== 'balanced') add('rigor', s.explain.rigor === 'formal' ? 'Exact statements and precise terms' : 'Intuitive wording first, formal terms after');
  } else if (kind === 'podcast') {
    add('pacing_length', `Pacing and length: ${s.lesson.pace} pace (${s.lesson.pace === 'slow' ? 'each idea given room, not stacked back to back' : s.lesson.pace === 'brisk' ? 'brisk, each thing said once' : 'steady'}); ${lengthLine(s, 'the script is')}`);
    add('vocabulary_spoken', grade(s));
    add('sentence_length', cap(s, 'Spoken sentences'));
    const ev = s.lesson.checkEveryChunks;
    add('check_in_frequency', `Check-in frequency: a quick question for the listener ${ev === 1 ? 'after every small piece (about every 2 minutes of speech)' : ev === 3 ? 'only after a long stretch (about every 4 minutes)' : 'about every 3 minutes of speech'}; the marks [CHECK-IN QUESTION] show where they fall`);
    add('dialogue_style', `Dialogue: ${s.engagement.dialogue ? 'host B asks short questions and host A answers them, question-and-answer exchanges' : 'host A explains directly, with little quizzing mid-explanation'}${s.practice.predictBeforeReveal ? '; the hosts ask the listener to predict before a reveal' : ''}`);
    add('tone', tone(s));
    if (s.explain.order !== 'balanced' || s.explain.conceptFirst !== 'balanced' || s.lesson.bigPictureFirst) add('explanation_order', order(s));
    if (s.lesson.restate || s.lesson.recapAtStart || s.lesson.recapAtEnd) add('repetition_recap', `${s.lesson.restate ? 'restates the key point once in other words; ' : ''}${s.lesson.recapAtStart ? 'opens with a two-line orientation; ' : ''}${s.lesson.recapAtEnd ? 'ends with a short recap' : ''}`.replace(/; $/, ''));
    if (s.explain.misconception) add('misconception', 'Names the common wrong idea, says why it fails, then gives the right one');
  } else if (kind === 'pack') {
    const k = s.isDefault ? 1 : s.lesson.retrievalChecks / 3;
    const n = (b, lo, hi) => Math.max(lo, Math.min(hi, Math.round(b * k)));
    add('summary_style', `Summary: ${s.isDefault ? '2 to 4' : s.lesson.chunkSentences <= 3 ? '3 to 5' : '2 to 3'} short paragraphs in plain words; ${density(s)}`);
    add('aid_amounts', `How much: about ${n(8, 4, 12)} flashcards, ${n(4, 2, 6)} quiz questions and ${n(6, 3, 8)} test questions for this short text (a learner who needs more checks gets more)`);
    add('vocabulary', grade(s));
    add('sentence_length', cap(s));
    add('question_ramp', rampLine(s));
    add('question_format', typedLine(s));
    add('explanations', explainLine(s));
    add('stakes_tone', `${stakesLine(s)}; ${tone(s)}`);
  } else if (kind === 'path') {
    add('lesson_chunking', `Lesson text per skill: paragraphs of at most ${s.explain.paragraphSentences} sentences; ${s.lesson.chunkSentences <= 3 ? 'many short paragraphs, one idea each' : s.lesson.chunkSentences >= 6 ? 'fuller paragraphs that keep a whole idea together' : 'medium paragraphs'}; ${lengthLine(s, 'the lesson text is')}`);
    add('vocabulary', grade(s));
    add('sentence_length', cap(s));
    add('density_layout', density(s));
    add('explanation_order', order(s));
    add('pace_repetition', `Pace: ${s.lesson.pace}${s.lesson.restate ? ', restating the key point once in other words' : ''}`);
    add('tone', tone(s));
    if (s.explain.modes.length) add('explanation_modes', `Explanation modes, ranked: ${s.explain.modes.join(' > ')}`);
  } else if (kind === 'test') {
    add('difficulty_start', `${rampLine(s).split(' and ramp')[0]}`);
    add('difficulty_ramp', `Difficulty ramp: ${s.difficulty.rampLabel}; tiers climb in the order the questions are asked, hardest last`);
    add('question_format', typedLine(s));
    add('feedback_detail', explainLine(s));
    add('stakes_tone', `${stakesLine(s)}; ${tone(s)}`);
    add('wording', `${grade(s)}; question prompts of ${s.language.maxSentenceWords + 4} words or fewer where the idea allows`);
    if (s.lesson.warmupItems >= 2) add('warmup', `Opens with ${s.lesson.warmupItems} easy warm-up questions`);
    if (s.explain.misconception) add('misconception', 'Explanations name the likely wrong idea and why it fails');
  }
  // Own material is shaped by the learner's interests and dislikes too, with the base text as the only source of facts.
  if (kind !== 'lesson') {
    if (s.interests.exampleDomains.length && s.interests.share >= 0.3) add('interest_analogies', `Interests (${s.interests.exampleDomains.slice(0, 4).join(', ')}): ${s.interests.share >= 0.7 ? 'several' : 'a few'} short analogies, examples or practice contexts built on them, each clearly framed and mapped back to a point of the base text; they add no fact, number, name or claim that the base text lacks`);
    if (s.interests.avoidDomains.length) add('avoided_domains', `No examples, analogies or settings from what they dislike (${s.interests.avoidDomains.slice(0, 6).join(', ')})`);
  }
  return f;
}

// ── what plain code measures ────────────────────────────────────────────────
const tierSeq = (qs) => qs.map((q) => q.tier || 2);
const monotone = (seq) => seq.every((t, i) => i === 0 || t >= seq[i - 1]);
const typedShare = (qs) => (qs.length ? qs.filter((q) => q.type !== 'multiple_choice').length / qs.length : 0);

/** Measures of one artifact: the common ones for every kind, plus the kind's own. */
function measureArtifact(kind, art, spec, topic) {
  const text = art.measureText || art.text;
  const sents = sentences(text);
  const lens = sents.map((x) => x.split(' ').length);
  const ws = words(text);
  const own = new Set((topic.exempt || []).map((w) => w.toLowerCase()));
  const doms = (spec && spec.interests.exampleDomains) || [];
  const avoid = (spec && spec.interests.avoidDomains) || [];
  const cov = ls.checkFollowed(text, null, { keyFacts: topic.keyFacts }).stats;
  const m = {
    words: ws.length, sentences: sents.length, meanSentenceWords: Number(mean(lens).toFixed(1)),
    longWordShare: Number((ws.length ? ws.filter((w) => w.length >= 11 && !own.has(w)).length / ws.length : 0).toFixed(3)),
    interestsUsed: doms.filter((d) => ls.mentions(text, d)).length, interestsAvailable: doms.length,
    avoidHits: avoid.filter((d) => ls.mentions(text, d)), analogyProblems: topic.source && spec ? (art.units || [text]).reduce((n, u) => n + ls.analogyProblems(u, spec, topic.source).length, 0) : 0, keyFactsMissing: cov ? cov.keyFactsMissing : null, keyFacts: topic.keyFacts.length,
  };
  const x = art.parts || {};
  if (kind === 'notes') {
    const secs = x.sections || [];
    const bullets = secs.flatMap((s) => s.bullets);
    Object.assign(m, { sections: secs.length, bullets: bullets.length, bulletsPerSection: Number(mean(secs.map((s) => s.bullets.length)).toFixed(1)), maxBulletsInSection: Math.max(0, ...secs.map((s) => s.bullets.length)), meanBulletWords: Number(mean(bullets.map((b) => b.text.split(' ').length)).toFixed(1)) });
  } else if (kind === 'podcast') {
    const turns = x.turns || [];
    const slots = require('../../services/material-podcast').checkinSlots(turns, spec);
    Object.assign(m, { turns: turns.length, wordsPerTurn: Number(mean(turns.map((t) => t.text.split(' ').length)).toFixed(1)), bQuestions: turns.filter((t) => t.host === 'B' && /\?/.test(t.text)).length, checkIns: slots.length, spokenMinutes: Number((ws.length / 150).toFixed(1)) });
  } else if (kind === 'pack') {
    const qs = [...(x.quiz || []), ...(x.test || [])];
    const expl = qs.map((q) => String(q.explanation || '').split(' ').length);
    const seq = tierSeq(x.test || []);
    Object.assign(m, {
      summaryParagraphs: (x.summary || []).length, cards: (x.cards || []).length, quiz: (x.quiz || []).length, testItems: (x.test || []).length,
      tierSeq: seq.join(''), tierMonotone: monotone(seq) && monotone(tierSeq(x.quiz || [])), typedShare: Number(typedShare(qs).toFixed(2)),
      meanExplanationWords: Number(mean(expl).toFixed(1)), testWordHits: qs.reduce((n, q) => n + (`${q.prompt} ${q.explanation}`.match(TEST_WORDS) || []).length, 0),
    });
  } else if (kind === 'path') {
    const sk = x.skills || [];
    const paras = sk.flatMap((s) => s.lesson.paragraphs || []);
    Object.assign(m, { skills: sk.length, paragraphsPerSkill: Number(mean(sk.map((s) => (s.lesson.paragraphs || []).length)).toFixed(1)), wordsPerParagraph: Number(mean(paras.map((p) => p.split(' ').length)).toFixed(1)), sentencesPerParagraph: Number(mean(paras.map((p) => sentences(p).length)).toFixed(1)), questionsPerSkill: Number(mean(sk.map((s) => (s.questions || []).length)).toFixed(1)) });
  } else if (kind === 'test') {
    const qs = x.questions || [];
    const seq = tierSeq(qs);
    Object.assign(m, {
      questions: qs.length, tierSeq: seq.join(''), tierMonotone: monotone(seq), firstTier: seq[0] || null, typedShare: Number(typedShare(qs).toFixed(2)),
      meanExplanationWords: Number(mean(qs.map((q) => String(q.explanation || '').split(' ').length)).toFixed(1)), testWordHits: qs.reduce((n, q) => n + (`${q.prompt} ${q.explanation}`.match(TEST_WORDS) || []).length, 0),
      secondsPerQuestion: x.secondsPer || null, offeredUntimedFirst: x.suggestTimed === false,
    });
  } else if (kind === 'lesson') {
    const l = x.lesson || {};
    Object.assign(m, { sections: (l.sections || []).length, checks: (l.check_questions || []).length, revised: !!(l.spec_check && l.spec_check.revised), openProblems: (l.spec_check && l.spec_check.open) || [] });
  }
  return m;
}

module.exports = { KINDS, KIND_INFO, BASE_TEXTS, fields, measureArtifact, renderNotes, renderPodcast, renderPack, renderPath, renderTest, TEST_WORDS, tierSeq, monotone, typedShare, words, sentences, mean };
