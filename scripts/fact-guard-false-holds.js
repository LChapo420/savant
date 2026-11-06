#!/usr/bin/env node
/**
 * Does the fact guard hold good answers? Real writers, real checkers, the real functions of each path, simulated learners on a DB copy (extreme and random ones
 * from scripts/lib/extreme-learners.js, held-out seed), never a real learner's words. Every decision goes to the tap file (scripts/fact-guard-tap.js) so a person can
 * read each hold. Not part of npm test. Spends prepaid credits through their ledgers; RUN_CAP_USD applies. AI-judged and simulated: not a real-learner result.
 *
 *   FACT_TAP_FILE=out.jsonl DB_FILE=copy.json node -r ./scripts/fact-guard-tap.js scripts/fact-guard-false-holds.js [--seed 8123] [--only dock,coach] [--scale 1]
 */
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
if (!process.env.DB_FILE || /[\\/]data[\\/]db\.json$/.test(process.env.DB_FILE)) { console.error('Needs DB_FILE pointing at a copy.'); process.exit(2); }

const db = require('../config/db');
const ai = require('../services/ai');
const pool = require('../services/pool');
const dock = require('../services/tutor-context');
const assist = require('../services/assist');
const layer = require('../services/lesson-layer');
const ls = require('../services/learning-spec');
const partModify = require('../services/part-modify');
const spanish = require('../services/spanish/ai-activities');
const X = require('./lib/extreme-learners');

const SEED = Number(arg('seed', 8123));
const ONLY = arg('only', '') ? arg('only', '').split(',') : null;
const SCALE = Number(arg('scale', 1));

const sim = db.insert('users', { email: `fact-holds-${SEED}@savant.test`, display_name: 'Sim', onboarded: true, account_type: 'standard', age_check: { birth_ym: '1995-01', needs_parent: false } });
const teen = db.insert('users', { email: `fact-holds-t-${SEED}@savant.test`, display_name: 'Sim', onboarded: true, account_type: 'standard', age_check: { birth_ym: '2010-06', needs_parent: false } });

// Kinds on purpose: the traps a guard that judges style would trip on come first.
const DOCK = [
  // encouragement, feelings
  'I feel stupid, I keep failing this.', 'Thanks, that helped a lot!', 'im so tired of math honestly', 'Am I even getting better at this?', 'Tell me something motivating, I want to quit.',
  'hi', 'lol ok', 'You are a useless bot', 'My parents say I should give up on chess. Should I?',
  // study advice, plans
  'How should I study for a test on Friday?', 'What should I work on next?', 'Give me a plan to learn the quadratic formula in a week.', 'Is it better to study in the morning or at night?', 'How long should I practise piano each day?', 'Should I take notes by hand?',
  // opinion, interpretation, contested
  'Is Hamlet actually a good play?', 'Which is better, Python or Java?', 'Who was the greatest US president?', 'Was Napoleon a hero or a villain?', 'What is the main theme of To Kill a Mockingbird?', 'Is math discovered or invented?', 'Do you think homework is useful?', 'What do you think the green light means in The Great Gatsby?', 'Was dropping the atomic bomb justified?',
  // questions back: Socratic, quiz me
  'Quiz me on fractions.', 'Ask me a question about the French Revolution.', 'Can you test me on cell biology?', 'Don\'t tell me the answer, just give me a hint: what is 3/4 + 1/8?',
  // true simplifications and rounded numbers
  'Explain atoms to a 7 year old.', 'What is pi?', 'How fast is light?', 'Why is the sky blue? Keep it very simple.', 'Why do seasons happen, simple version?', 'How far is the moon, roughly?', 'What is gravity in one sentence?', 'How many bones does a person have?', 'Roughly how old is the universe?', 'What does the mitochondria do?', 'How many people live in India, about?',
  // plain subject
  'How do I add 2/3 and 1/4?', 'What is 18% of 250?', 'Why is a negative times a negative positive?', 'What does the slope of a line tell me?', 'Solve 2x + 5 = 17 and show the steps.', 'What is the derivative of x^3?', 'What is the difference between an atom and a molecule?', 'How do vaccines work?', 'What is Newton\'s third law?', 'What caused World War I?', 'When was the Magna Carta signed and why does it matter?', 'Who was the first emperor of Rome?', 'What is the difference between affect and effect?', 'What is the passive voice?', 'What is a metaphor? Give me an example.', 'When do I use ser and when estar?', 'How do I say I would like a coffee in Spanish?', 'What is castling and when is it not allowed?', 'How much is a rook worth compared to a bishop?', 'What is a pick and roll?', 'What notes are in a C major chord?',
  // odd learners: language, typos, slang, hobbies, the app itself
  'como se resuelve una ecuacion de segundo grado?', 'explique la photosynthèse en français svp', 'yo wats the point of the pythagorean thing fr', 'explain supply and demand using minecraft', 'explain torque with skateboards pls', 'how do i turn off notifications in this app', 'what does my score mean?', 'Tell me a joke about chemistry.', 'Write me a short poem about the water cycle.', 'Can you make up a story to help me remember the planets?',
];

const PAGE = { path: '/app.html', title: 'Home' };
const LEVEL = { track: 'Math', grade: 'Algebra 1', level: 3 };
const pick = (arr, n) => { const out = []; const s = Math.max(1, Math.floor(arr.length / Math.max(1, n))); for (let i = (SEED % s); i < arr.length && out.length < n; i += s) out.push(arr[i]); return out; };

async function runAll(jobs, width = 3) {
  let next = 0; let errors = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      // The free slots these paths write on are often busy on a shared key: a job that got no answer waits and asks again, so the check has something to read.
      try { let got = await j(); for (let t = 0; t < 3 && !got; t++) { await new Promise((r) => setTimeout(r, 25000)); got = await j(); } } catch (e) { errors++; console.warn(`job failed: ${String(e.message).slice(0, 160)}`); } // eslint-disable-line no-await-in-loop
    }
  }));
  return errors;
}

const rounds = {
  dock: () => DOCK.map((q) => () => dock.reply({ user: db.byId('users', sim.id), messages: [{ role: 'user', content: q }], page: PAGE, inputMode: 'text' })),
  dock_multi: () => [
    ['What is a noun?', 'A noun names a person, place, thing or idea. Can you give me an example from your day?', 'my dog'],
    ['Quiz me on capitals', 'What is the capital of Australia?', 'sydney'],
    ['Quiz me on capitals', 'What is the capital of Canada?', 'ottawa'],
    ['what is 7 x 8', 'What do you get if you start from 7 x 7 = 49 and add one more 7?', '54'],
    ['what is 7 x 8', 'What do you get if you start from 7 x 7 = 49 and add one more 7?', '56'],
    ['Do plants breathe?', 'Good question. Plants take in carbon dioxide and give out oxygen in daylight. What do you think happens at night?', 'they sleep'],
  ].map(([a, b, c]) => () => dock.reply({ user: db.byId('users', teen.id), messages: [{ role: 'user', content: a }, { role: 'assistant', content: b }, { role: 'user', content: c }], page: PAGE, inputMode: 'text' })),
  coach: () => {
    const items = pick(db.find('items', (i) => i.rationale && i.prompt && i.source !== 'theme'), 14);
    return items.map((item, n) => () => ai.coachReply({ item, messages: [{ role: 'user', content: ['I have no idea where to start', 'Is it the first one?', 'can you give me a hint', 'why does this matter', 'ugh this is hard', 'I think I get it, is it about the second part?', 'what does this word mean'][n % 7] }], userId: sim.id }));
  },
  explain: () => {
    const items = pick(db.find('items', (i) => i.rationale && i.prompt && i.user_answer !== undefined), 14);
    return items.map((item, n) => () => ai.tutorReply({ item, question: ['Why is that the answer?', 'I got it wrong, what did I do?', 'Can you explain it another way?', 'Where would I use this in real life?'][n % 4], userId: sim.id }));
  },
  assist: () => {
    const plans = pick(db.find('block_plans', (p) => !p.user_id && p.status === 'ready' && (p.blocks || []).length >= 3), 14);
    return plans.map((plan, n) => () => assist.onBlock({ user: db.byId('users', sim.id), plan, index: (plan.blocks[n % plan.blocks.length] || plan.blocks[0]).index, messages: [{ role: 'user', content: ['I don\'t get this part', 'Can you give me an example?', 'why does this matter', 'say that simpler please', 'is this on the test?'][n % 5] }] }));
  },
  remediation: () => {
    const items = pick(db.find('items', (i) => i.rationale && i.prompt && i.correct === false), 18);
    const out = [];
    for (let i = 0; i + 2 < items.length; i += 3) {
      const area = { headline: `Trouble with ${items[i].skill_name}`, diagnosis: 'They mixed up the steps.', misconception: '', missed: items.slice(i, i + 3).map((m) => ({ prompt: m.prompt, answer: m.answer, user_answer: m.user_answer })), skill_id: items[i].skill_id };
      out.push(() => ai.remediationTeachReply({ area, level: 3, messages: [{ role: 'user', content: 'Can you walk me through it?' }], userId: sim.id }));
      out.push(() => ai.diagnoseArea({ kindLabel: 'Master quiz', level: 3, accuracy: 0.5, required: 0.8, area, userId: sim.id }));
    }
    return out;
  },
  layer: () => {
    const learners = X.generate(SEED, 8);
    const plans = pick(db.find('block_plans', (p) => !p.user_id && p.status === 'ready' && p.kind === 'lesson' && (p.blocks || []).length >= 3 && (p.checks || []).length >= 1), 12);
    return plans.map((p, n) => async () => {
      const L = learners[n % learners.length]; const topic = p.topic || p.title || '';
      const spec = ls.buildSpecFrom({ metrics: Object.fromEntries(Object.entries(L.traits).map(([m, v]) => [m, { measured: v, confidence: 90 }])), age: L.age, esl: !!L.ell, interests: L.hobbies, dislikes: L.dislikes, topic });
      const source = layer.sourceOf(p, topic);
      const call = (a) => pool.runForeground(() => ai.structuredDetail({ role: 'fast', task: 'part_layer', ...a, userId: sim.id, effort: 'off', factSource: source.text }), { fast: true });
      await layer.compose({ spec, source, plan: p, call, t0: Date.now() });
    });
  },
  modify: () => {
    const learners = X.generate(SEED + 1, 8);
    const items = pick(db.find('items', (i) => i.rationale && i.prompt), 12);
    return items.map((it, n) => () => {
      const L = learners[n % learners.length];
      const spec = ls.buildSpecFrom({ metrics: Object.fromEntries(Object.entries(L.traits).map(([m, v]) => [m, { measured: v, confidence: 90 }])), age: L.age, esl: !!L.ell, interests: L.hobbies, dislikes: L.dislikes, topic: it.skill_name });
      return partModify.modify({ spec, part: 'feedback', source: { prompt: it.prompt, choices: it.choices, answer: it.answer, text: it.rationale }, llm: (a) => ai.structured({ role: 'fast', task: 'part_modify', ...a, userId: sim.id, factSource: `${it.prompt}\nKey: ${it.answer}\n${it.rationale}` }) });
    });
  },
  items: () => {
    const skills = [...new Set(db.find('items', (i) => i.skill_id).map((i) => i.skill_id))];
    return pick(skills, 6).map((skillId) => () => ai.generateItems({ entries: [1, 2, 3].map(() => ({ skillId, difficulty: 2 })), userId: sim.id }));
  },
  regen: () => {
    const skills = [...new Set(db.find('items', (i) => i.skill_id).map((i) => i.skill_id))];
    return pick(skills, 3).map((skillId) => () => ai.regenerateItems({ entries: [1, 2, 3].map(() => ({ skillId, difficulty: 2 })), avoid: [], kindLabel: 'Master quiz', level: 3, userId: sim.id }));
  },
  debrief: () => {
    const byS = {}; for (const i of db.find('items', (x) => x.session_id && x.user_answer !== undefined)) (byS[i.session_id] = byS[i.session_id] || []).push(i);
    return pick(Object.entries(byS).filter(([, v]) => v.length >= 4), 5).map(([sid, its]) => () => ai.analyzeSession({ items: its.slice(0, 20), profile: {}, session: db.byId('sessions', Number(sid)) || { level: 3 }, levels: [3], userId: sim.id }));
  },
  essay: () => {
    const plan = { pathLength: 30, difficulty: 5, introduced: ['linear_eq'], all: ['linear_eq'] };
    const es = [
      ['writing', 'English', 'Grade 9', 'Social media should be banned for children under 13 because it harms their attention. Studies show people check phones many times a day. Also it is bad for sleep. In conclusion it should be banned.'],
      ['history', 'History', 'Grade 10', 'The Treaty of Versailles was too harsh on Germany. It made Germany pay reparations and lose land, which caused anger and helped Hitler rise. However, some historians argue the Depression mattered more.'],
    ];
    return es.flatMap(([trackId, trackName, gradeName, text]) => [
      () => ai.generateEssayPrompt({ level: 5, trackName, gradeName, plan, userId: sim.id, trackId }),
      async () => {
        const prompt = await ai.generateEssayPrompt({ level: 5, trackName, gradeName, plan, userId: sim.id, trackId });
        if (prompt) await ai.gradeEssay({ essay: { ...prompt, track_id: trackId, level: 5, id: 0, user_id: sim.id }, text, userId: sim.id });
      },
    ]);
  },
  games: () => ['fractions, ages 11 to 13', 'the French Revolution, ages 14 to 16', 'cell biology, ages 14 to 16', 'Spanish preterite verbs, beginners', 'chess tactics, beginners'].map((topic) => () => ai.structuredDetail({
    role: 'blocks', task: 'game_questions', userId: sim.id, maxTokens: 2500,
    system: 'You write questions for a learning game. Reply with JSON only: {"questions":[{"prompt":"...","choices":["a","b","c","d"],"answerIndex":0,"explanation":"..."}]}. Exactly one choice is right. Vary which position holds the right answer.',
    user: `Write 8 multiple-choice questions on ${topic}.`,
    schema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answerIndex: { type: 'integer' }, explanation: { type: 'string' } }, required: ['prompt', 'choices', 'answerIndex'] } } }, required: ['questions'] }, schemaName: 'game_questions',
  })),
  spanish: () => {
    const level = { title: 'En el cafe', cefr: 'A2', scenario: { partnerName: 'Lucia', setting: 'a cafe in Madrid', goals: ['order food', 'ask the price'], partnerRole: 'waiter', role: 'waiter' }, writing: { prompt: 'Describe your weekend.', focus: 'preterite' }, reader: { title: 'El fin de semana' }, focus: ['preterite'] };
    const turns = ['Hola, quiero un cafe por favor', 'Ayer yo fui al cine con mi amigos', 'no entiendo', 'cuanto cuesta?', 'Me gusta mucho el futbol, y a ti?'];
    return [
      ...turns.map((t) => () => spanish.conversationTurn(level, [{ who: 'partner', text: 'Hola, ¿qué desea?' }], t, sim.id)),
      ...turns.map((t) => () => spanish.reaction(level, t, sim.id)),
      () => spanish.writingFeedback(level, 'El fin de semana pasado yo fui a la playa con mi familia. Comimos pescado y nadamos mucho. Fue muy divertido pero hacia frio.', sim.id),
      () => spanish.writingFeedback(level, 'Yo tener dos hermano. Ellos es alto. Ayer nosotros va a la escuela.', sim.id),
    ];
  },
};

async function main() {
  const names = Object.keys(rounds).filter((n) => !ONLY || ONLY.includes(n));
  for (const name of names) { // eslint-disable-next-line no-await-in-loop
    const jobs = rounds[name](); const use = SCALE < 1 ? jobs.slice(0, Math.ceil(jobs.length * SCALE)) : jobs;
    const t0 = Date.now(); const errors = await runAll(use, Number(arg('width', 3))); // eslint-disable-line no-await-in-loop
    console.log(`${name}: ${use.length} jobs, ${errors} failed, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  if (typeof db.flush === 'function') db.flush();
  setTimeout(() => process.exit(0), 500);
}
main().catch((e) => { console.error(e); process.exit(1); });
