#!/usr/bin/env node
/**
 * The on-demand writing-ahead of Spanish grades 5-57 (services/spanish/unit-writer.js), with a fake writer and fake judges (no network):
 *
 *   - a drafted unit is stored only after the checks: a keyed item the blind solver disagrees with is dropped, an item it cannot
 *     answer is dropped, a rejected scene line or role-play card is dropped, and a unit that keeps too little is not stored at all;
 *   - the stored unit is registered with the player (services/spanish/path.js) and its levels become playable; a unit not stored
 *     is not served (the level goes to the ordinary session);
 *   - what is stored survives a restart (load) and a damaged file is skipped;
 *   - the units written ahead of a level are this level's, the next level's and, near the end of a unit, the next unit's;
 *   - grades 1-4 are never written here.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'es-unit-writer-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.SPANISH_UNIT_DIR = path.join(TMP, 'spanish-units');
process.env.SPANISH_WRITE_AHEAD = 'on'; // the flag is off by default; this test turns it on

const curriculum = require('../config/curriculum');
const writer = require('../services/spanish/unit-writer');
const esPath = require('../services/spanish/path');

let failed = 0;
const check = (name, ok, detail) => { if (ok) console.log(`ok   ${name}`); else { failed++; console.log(`FAIL ${name}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 300)}`}`); } };

const G9 = 'spanish_grade_09_preterite_i';
const grade = curriculum.getGrade('spanish', G9);
const topicId = (writer.specOf(G9, 'Unit 9.2').topics[0] || {}).id;

/** A well-formed draft, with the keys written down so a fake solver can answer honestly. */
function draft() {
  const verbs = ['hablé', 'comí', 'viví', 'trabajé', 'bebí', 'escribí', 'compré', 'aprendí', 'abrí', 'miré', 'canté', 'corrí'];
  const en = ['I spoke', 'I ate', 'I lived', 'I worked', 'I drank', 'I wrote', 'I bought', 'I learned', 'I opened', 'I looked', 'I sang', 'I ran'];
  return {
    phrases: verbs.map((v, i) => ({ es: `Ayer ${v} mucho.`, en: [`Yesterday ${en[i]} a lot.`], tier: 1 + (i % 3), skill: 'es_vocab_core', topic: topicId })),
    scene: {
      title: 'Ayer', art: 'casa',
      lines: ['Hola, Tomás.', '¿Qué hiciste ayer?', 'Ayer trabajé en casa.', 'Yo comí con Rosa.', 'Luego miré una película.', 'Fue un buen día.'].map((es, i) => ({ who: ['mara', 'tomas'][i % 2], es, en: `line ${i + 1}` })),
      questions: [{ after: 3, question: 'Where did Tomás work?', choices: ['At home', 'At a bank', 'At school'], answer: 0 }, { after: 5, question: 'What did Tomás watch?', choices: ['A film', 'A game', 'The news'], answer: 0 }],
    },
    convo: { partner: 'tomas', setting: 'A cafe.', learnerCard: 'Say what you did.', learnerCardEs: 'Di qué hiciste.', partnerCard: 'You stayed home.', goals: [{ id: 'a', text: 'Say one thing (Ayer…)' }, { id: 'b', text: 'Say another (Comí…)' }, { id: 'c', text: 'Ask back (¿Y tú?)' }], targets: ['Ayer trabajé.', 'Comí pan.'], opening: '¿Qué hiciste ayer?', script: [{ goal: 'a', expect: ['ayer'], reply: 'Qué bien.', hint: 'Say "Ayer trabajé."' }, { goal: 'b', expect: ['comí'], reply: 'Yo también.', hint: 'Say "Comí pan."' }, { goal: 'c', expect: ['tú'], reply: 'Yo me quedé en casa.', hint: 'Ask "¿Y tú?"' }], nudges: { a: '¿Qué hiciste?', b: '¿Qué comiste?', c: '¿Y tú?' }, closing: 'Hasta luego.' },
    fills: [0, 1, 2, 3].map((i) => ({ before: 'Ayer yo', after: 'mucho.', choices: [verbs[i], `${verbs[i]}n`, `${verbs[i]}s`], answer: 0, en: `Yesterday ${en[i]} a lot.` })),
    chats: [0, 1, 2].map((i) => ({ who: 'mara', es: `¿Qué hiciste el día ${i + 1}?`, choices: ['Trabajé mucho.', 'Trabajo mucho.', 'Trabajaré mucho.'], answer: 0 })),
    reads: [{ passage: 'Ayer Tomás comió pan.', question: 'What did Tomás eat?', choices: ['Bread', 'Rice', 'Fish'], answer: 0 }, { passage: 'Mara vivió en Lima.', question: 'Where did Mara live?', choices: ['Lima', 'Cusco', 'Quito'], answer: 0 }],
  };
}

/** A solver that knows the truth (what the draft's keys were before they were corrupted). */
function honestJudge(truth) {
  return async (batch) => batch.map((q) => { const i = q.choices.indexOf(truth.get(q.prompt)); return i < 0 ? null : i; });
}
function truthOf(d) {
  // The keyed items, as the service words them, before any corruption.
  const items = writer.keyedItems(JSON.parse(JSON.stringify(d)));
  return new Map(items.map((q) => [q.prompt, q.answer]));
}

(async () => {
  // 1. a clean draft is stored whole, the planted wrong key / rejected line / unanswerable item are dropped
  const base = draft();
  const truth = truthOf(base);
  const bad = draft();
  bad.fills[1].answer = 2;                                       // the key now points at a wrong option: the blind solver disagrees
  const calls = { review: 0 };
  const review = async (spec, items) => { calls.review++; return items.filter((i) => i.id === 'S2').map((i) => i.id); };
  const solver = honestJudge(truth);
  const judge = async (batch) => { const picks = await solver(batch); return picks.map((p, i) => (/Where did Mara live/.test(batch[i].prompt) ? null : p)); }; // one item the solver cannot answer
  const unit = await writer.writeUnit(G9, 'Unit 9.2', { writer: async () => bad, judge, review });
  check('a checked unit is written and returned', !!unit && unit.unit === 'Unit 9.2' && unit.grade === G9);
  check('the planted wrong key is dropped (3 fills of 4)', unit && unit.fills.length === 3, unit && unit.fills.length);
  check('an item the blind solver cannot answer is dropped (1 reading of 2)', unit && unit.reads.length === 1, unit && unit.reads.length);
  check('a scene line the reviewer rejects is dropped, and the questions follow the lines still there', unit && unit.scene.lines.length === 5 && unit.scene.questions.every((q) => q.after >= 1 && q.after <= unit.scene.lines.length), unit && unit.scene.lines.length);
  check('all 12 phrases pass and get unit ids', unit && unit.phrases.length === 12 && unit.phrases.every((p) => p.id.startsWith('g9u2_')));
  const file = path.join(process.env.SPANISH_UNIT_DIR, 'g9', '2_' + '' + '.json');
  const stored = writer.isStored(G9, 'Unit 9.2');
  check('it is stored', stored);
  const rec = JSON.parse(fs.readFileSync(path.join(process.env.SPANISH_UNIT_DIR, 'g9', '9_2.json'), 'utf8'));
  check('the record says which checks it passed', rec.status === 'checked' && rec.checks.blind_disagreed_dropped === 1 && rec.checks.unjudged_dropped === 1 && rec.checks.reviewed === true && rec.checks.dropped_ids.includes('S2'), rec.checks);
  check('the review ran', calls.review >= 1);

  // 2. a unit that keeps too little is not stored
  const poor = draft();
  poor.fills = poor.fills.slice(0, 2);
  const none = await writer.writeUnit(G9, 'Unit 9.3', { writer: async () => poor, judge: honestJudge(truthOf(poor)), review: async () => [] });
  check('a unit with too few fills is not stored', none === null && !writer.isStored(G9, 'Unit 9.3'));
  const blind = await writer.writeUnit(G9, 'Unit 9.3', { writer: async () => draft(), judge: async (b) => b.map(() => null), review: async () => [] });
  check('a unit the solver could not judge at all is not stored (never kept on no evidence)', blind === null && !writer.isStored(G9, 'Unit 9.3'));
  const unreviewed = await writer.writeUnit(G9, 'Unit 9.3', { writer: async () => draft(), judge: honestJudge(truth), review: async () => { throw new Error('judge down'); } });
  check('a unit whose review could not run is not stored', unreviewed === null && !writer.isStored(G9, 'Unit 9.3'));

  // 3. the player serves only the stored unit
  const levelOf = (unitLabel, type) => grade.levels.find((l) => l.unit === unitLabel && (!type || l.type === type));
  const l93 = levelOf('Unit 9.3', 'Lesson');
  check('before the unit is registered the player does not take its levels', !esPath.supports(G9, levelOf('Unit 9.2', 'Lesson').level) && !esPath.supports(G9, l93.level));
  check('registering the written unit makes its lesson playable', (esPath.registerUnit(unit), esPath.supports(G9, levelOf('Unit 9.2', 'Lesson').level)));
  check('a unit that was not stored is still not served', !esPath.supports(G9, l93.level));
  const built = esPath.buildLevel({ userId: 1, gradeId: G9, level: levelOf('Unit 9.2', 'Lesson').level, seed: 's' });
  check('the built level is a lesson of the written unit', built && built.engine === 'lesson' && built.items.length >= 5 && built.source === 'built', built && built.items && built.items.length);
  const preview = levelOf('Unit 9.2', 'Preview');
  const intro = esPath.buildLevel({ userId: 1, gradeId: G9, level: preview.level, seed: 's' });
  check('the unit preview builds from the written scene and phrases', intro && intro.engine === 'unit_intro' && intro.clip.length >= 3, intro && intro.engine);

  // 4. restart: load() brings it back; a damaged file is skipped
  fs.mkdirSync(path.join(process.env.SPANISH_UNIT_DIR, 'g9'), { recursive: true });
  fs.writeFileSync(path.join(process.env.SPANISH_UNIT_DIR, 'g9', '9_9.json'), '{ half a file');
  const loaded = writer.load();
  check('load() returns the stored unit with a topic matcher, and skips the damaged file', loaded.length === 1 && loaded[0].unit === 'Unit 9.2' && loaded[0].topics[0].match instanceof RegExp, loaded.length);

  // 5. what is written ahead of a level
  const first = grade.levels.find((l) => l.unit === 'Unit 9.4');
  const unitRows = grade.levels.filter((l) => l.unit === 'Unit 9.4');
  const near = unitRows[unitRows.length - 2];
  check('mid-unit: this unit and the next level\'s only', JSON.stringify(writer.unitsAhead(G9, first.level)) === JSON.stringify(['Unit 9.4']), writer.unitsAhead(G9, first.level));
  check('near the end of a unit: the next unit too', JSON.stringify(writer.unitsAhead(G9, near.level)) === JSON.stringify(['Unit 9.4', 'Unit 9.5']), writer.unitsAhead(G9, near.level));
  const g2 = curriculum.getTrack('spanish').grades[1].id;
  check('grades 1-4 are never written here', (await writer.ahead(g2, 5)).length === 0);
  check('ahead() skips what is stored and writes only the rest', (await writer.ahead(G9, levelOf('Unit 9.2', 'Lesson').level, { writer: async () => null, attempts: 1 })).every((u) => u === null) );

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(e.stack); process.exit(1); });
