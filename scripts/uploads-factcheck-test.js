/**
 * The fact check (services/material-factcheck.js) with a scripted model: no network, no cost.
 */
const os = require('os'); const path = require('path'); const fs = require('fs');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-factcheck-test-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
process.env.UPLOAD_AUTOBUILD = 'off';
const F = require('../services/material-factcheck');
const cb = require('../services/course-builder');
const materials = require('../services/materials');
const db = require('../config/db');

let failed = 0;
const check = (name, ok, detail) => { if (!ok) { failed++; console.log(`  FAIL ${name}${detail !== undefined ? ` -- ${JSON.stringify(detail)}` : ''}`); } };

const SOURCE = `The Assembly consists of thirty-one (31) elected Delegates. A quorum is twenty (20) Delegates present.
The Nazca Plate subducts beneath South America at about 8 cm per year. The Pacific Plate moves at about 5 cm per year.
Atenolol is avoided in pregnancy (IUGR); labetalol is preferred. Severe peripheral arterial disease carries a risk of ischemia.
The Wadati-Benioff zone lies in subducting slabs. Models include MORVEL and NUVEL-1A. A bill spends two-thirds of the Activity Chest. Germany invaded Belgium on 4 August 1914.
Filing closes at 8:15 a.m. on a Tuesday. Hypoglycaemia may be masked. Non-selective drugs are not first-line in asthma.`;
const idx = F.indexSource(SOURCE);

// ── deterministic ──
const ex = (s, o) => F.examine(s, idx, o);
check('a number that is nowhere in the material is hard', ex('The Speaker serves for 14 school weeks in all.').hard.includes('number 14'));
check('a year nowhere in the material is hard', ex('Germany invaded Belgium in 1915.').hard.includes('number 1915'));
check('the same number spelled differently is fine', !ex('The Assembly has 31 Delegates and a quorum is twenty.').hard.length);
check('a fraction spelled two ways is fine', !ex('A bill spends 2/3 of the Activity Chest.').hard.length);
check('a small count goes to the model, not refused', ex('The list has seven parts.').hard.length === 0 && ex('The list has seven parts.').soft.some((x) => /count 7/.test(x)));
check('a name nowhere in the material is hard', ex('The idea came from Alfred Wegener long ago.').hard.includes('name Wegener'));
check('a hyphenated name in the material is fine', !ex('Slabs are in the Wadati-Benioff zone, and models include NUVEL-1A.').hard.length);
check('initials of words in the material are fine', !ex('Severe PAD carries a risk.').hard.length);
check('a form of a name goes to the model', ex('Many cite Belgian neutrality here.').hard.length === 0 && ex('Many cite Belgian neutrality here.').soft.some((x) => /Belgian/.test(x)));
check('American spelling of a British word is the same word', !ex('Hypoglycemia may be masked.').soft.some((x) => /words/.test(x)));
check('a sentence inside one line is direct', ex('The Nazca Plate subducts beneath South America at about 8 cm per year.').direct);
check('a swapped number is not direct', !ex('The Nazca Plate subducts beneath South America at about 5 cm per year.').direct);
check('a new negation is not direct', !ex('Labetalol is not preferred in pregnancy.').direct);
check('a fact swapped between names in one line is not direct', !ex('Labetalol is avoided in pregnancy (IUGR); atenolol is preferred.').direct);
check('two neighbouring lines are not direct', !ex('Delegates elected in South America are present.').direct);
check('a benefit the material never states is hard', ex('Filing closes at 8:15 a.m. which ensures accuracy.').hard.some((x) => /ensures/.test(x)));
check('a new cause is not direct', !ex('Atenolol is avoided in pregnancy because labetalol is preferred.').direct);
check('sentences keep e.g. and a.m. together', F.sentencesOf('Filing closes at 8:15 a.m. on a Tuesday. Models, e.g. MORVEL, help. Done now.').length === 3);

(async () => {
  // ── model verdicts ──
  const script = (fn) => async (args) => ({ res: { data: { verdicts: fn(args) } } });
  const numbered = (args) => args.user.split('SENTENCES:\n')[1].split('\n').map((l) => { const m = /^(\d+)\. (.*)$/.exec(l); return m ? { n: Number(m[1]), text: m[2] } : null; }).filter(Boolean);
  const lesson = async (paragraphs, keyPoints, asker, extra = {}) => F.checkLesson({ paragraphs, keyPoints, summary: extra.summary || '', explanations: extra.explanations, idx, sourceText: SOURCE, asker, fallback: extra.fallback });

  let r = await lesson(['Labetalol is preferred in pregnancy, which matters since babies grow faster that way. The Nazca Plate subducts beneath South America at about 8 cm per year.'], [],
    script((a) => numbered(a).map((x) => ({ n: x.n, verdict: 'not_in_source', fixed: 'Labetalol is preferred in pregnancy.' }))));
  check('a sentence with an added claim is cut to its supported part', r.paragraphs[0].startsWith('Labetalol is preferred in pregnancy.') && !/babies/.test(r.paragraphs[0]), r.paragraphs);
  check('the supported sentence beside it stays, with no call for it', /Nazca Plate subducts/.test(r.paragraphs[0]) && r.report.direct >= 1);

  r = await lesson(['Volcanoes form above slabs and the sea rises at night.'], [], script((a) => numbered(a).map((x) => ({ n: x.n, verdict: 'not_in_source', fixed: '' }))), { fallback: () => ['The material says this.'] });
  check('nothing supported: dropped, and a lesson left empty gets the material\'s own words', r.paragraphs[0] === 'The material says this.' && r.report.fell_back === true && r.report.dropped.length === 1);

  r = await lesson(['Volcanoes form above slabs.'], [], script((a) => numbered(a).map((x) => ({ n: x.n, verdict: 'not_in_source', fixed: 'Volcanoes form above slabs and also near rivers and lakes everywhere.' }))));
  check('a "fix" that brings its own words is refused', !r.paragraphs.length);

  r = await lesson(['Slabs sink for 900 million years in all.'], [], script((a) => numbered(a).map((x) => ({ n: x.n, verdict: 'supported' }))));
  check('a model cannot pass a number that is not in the material', !r.paragraphs.length && r.report.hard === 1);

  r = await lesson(['The plates sometimes swing wildly about.'], ['Plates swing.'], async () => ({ res: null }));
  check('no answer: an unsupported sentence is not kept and the report says unchecked', !r.paragraphs.length && r.report.unchecked >= 1);
  r = await lesson(['Delegates elected in South America are present.'], [], async () => ({ res: null }));
  check('no answer: a sentence the deterministic pass stands behind is kept', r.paragraphs.length === 1 && r.report.unchecked === 1, r.report);
  r = await lesson(['The plates sometimes swing wildly about.'], [], async () => ({ stopped: true }));
  check('a spent budget is reported, not hidden', r.report.stopped === true);

  r = await F.checkLesson({ paragraphs: ['Labetalol is preferred in pregnancy, which is safest for all mothers and babies everywhere.', 'Delegates vote.'], keyPoints: [], idx, sourceText: SOURCE, asker: script((a) => numbered(a).map((x) => ({ n: x.n, verdict: /safest/.test(x.text) ? 'not_in_source' : 'supported', fixed: '' }))) });
  check('a dropped sentence: the material\'s own line behind it goes back', /Atenolol is avoided in pregnancy \(IUGR\); labetalol is preferred\./.test(r.paragraphs.join(' ')) && !/safest/.test(r.paragraphs.join(' ')) && r.report.restored === 1, r.paragraphs);
  r = await F.checkLesson({ paragraphs: ['Volcanoes erupt sometimes.'], keyPoints: [], idx, sourceText: SOURCE, asker: script((a) => numbered(a).map((x) => ({ n: x.n, verdict: 'not_in_source', fixed: '' }))) });
  check('a dropped sentence about nothing in the material brings nothing back', !r.paragraphs.length, r.paragraphs);
  const two = await F.checkLesson({ paragraphs: ['The plates swing about all day long.'], keyPoints: [], idx, sourceText: SOURCE, asker: script((a) => numbered(a).map((x) => ({ n: x.n, verdict: 'supported' }))), asker2: script((a) => numbered(a).map((x) => ({ n: x.n, verdict: 'not_in_source', fixed: '' }))) });
  check('either of two readers saying "not in the source" is enough', !two.paragraphs.length && two.report.second_caught === 1, two.report);

  r = await lesson(['Think of plates like rafts on a pond.'], [], script((a) => numbered(a).map((x) => ({ n: x.n, verdict: 'no_claim' }))));
  check('a framed analogy with no claim stays', r.paragraphs.length === 1);

  r = await lesson(['The Nazca Plate subducts beneath South America at about 8 cm per year.'], [], script((a) => numbered(a).map((x) => ({ n: x.n, verdict: 'not_in_source', fixed: '' }))), {
    explanations: [{ text: 'A bill of 50 marks is more than 40, so it goes there.', extra: 'A bill spends 50 marks. It must spend more than 40.' }, { text: 'That was decided by Alfred Wegener.', extra: 'Who decided?' }],
  });
  check('an explanation may use its own question\'s numbers; a bad one is flagged for the quote', r.badExplanations.has(1), [...r.badExplanations]);

  // ── wired into a build ──
  const u = db.insert('users', { email: 'fc@example.test', display_name: 'Fc', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
  const text = `${SOURCE}\n\n${SOURCE.replace(/The Assembly/g, 'This Assembly')}`;
  const m = materials.addPaste(u.id, 'Mix', text).value;
  const calls = [];
  const llm = async (a) => {
    calls.push(a.task);
    if (a.task === 'material_outline') return { model: 'mock', data: { skills: [{ id: 'a', title: 'Delegates', summary: 'Who sits in the Assembly, as told by Alfred Wegener.', unit: 'One', prerequisites: [], passage_ids: ['p1'], taught: true }] } };
    if (a.task === 'material_lesson') return { model: 'mock', data: { lesson: { paragraphs: ['The Assembly consists of thirty-one elected Delegates. Alfred Wegener founded the Assembly in 1912.', 'Volcanoes erupt near the sea.'], key_points: ['A quorum is 20 Delegates present.'] },
      questions: [1, 2, 3, 4].map((i) => ({ type: 'short_answer', prompt: `How many Delegates are in the Assembly (${i})?`, answer: '31', tier: 1, explanation: i === 1 ? 'Alfred Wegener said so in 1912.' : 'The Assembly consists of thirty-one Delegates.', passage_id: 'p1', quote: 'The Assembly consists of thirty-one (31) elected Delegates.' })) } };
    if (a.task === 'material_verify') return { model: 'mock', data: { verdicts: [1, 2, 3, 4].map((n) => ({ n, supported: true })) } };
    if (/^material_factcheck/.test(a.task)) return { model: 'mock', data: { verdicts: numbered(a).map((x) => (/Wegener|Volcanoes/.test(x.text) ? { n: x.n, verdict: 'not_in_source', fixed: '' } : { n: x.n, verdict: 'supported' })) } };
    return null;
  };
  const built = await cb.build(u.id, m.id, { llm, factcheck: true });
  const s = built.course.skills[0];
  check('the built lesson keeps what the material says', /thirty-one elected Delegates/.test(s.lesson.paragraphs[0]), s.lesson);
  check('the built lesson has lost what it does not', !/Wegener|Volcanoes|1912/.test(JSON.stringify(s.lesson)), s.lesson);
  check('the outline summary is checked too', !/Wegener/.test(s.summary || ''), s.summary);
  check('a bad explanation becomes the quote', /^Your material says:/.test(s.questions[0].explanation) && !/Wegener/.test(JSON.stringify(s.questions)), s.questions[0]);
  check('the check is one call per skill, learner class', calls.filter((t) => t === 'material_factcheck_deepseek').length === 1 && calls.filter((t) => t === 'material_factcheck_glm').length === 1);
  check('the course says what was checked', built.course.dropped.factcheck.sentences > 0 && built.course.dropped.factcheck.hard >= 1, built.course.dropped.factcheck);

  // A check that never answers leaves the course partial, and asking again checks again.
  const m2 = materials.addPaste(u.id, 'Mix2', text).value;
  let answer = false;
  const llm2 = async (a) => { if (/^material_factcheck/.test(a.task) && !answer) return null; return llm(a); };
  const b1 = await cb.build(u.id, m2.id, { llm: llm2, factcheck: true });
  check('no answer from the checker: partial, never ready', b1.course.status === 'partial', b1.course.status);
  check('and nothing it could not stand behind is shown', !/Wegener|Volcanoes/.test(JSON.stringify(b1.course.skills[0].lesson)));
  answer = true;
  const b2 = await cb.build(u.id, m2.id, { llm: llm2, factcheck: true });
  check('asking again builds and checks it, and the course is ready', b2.course.status === 'ready', b2.course.status);

  // The lesson and the questions as two calls: the first lesson can be read at once, and each part is checked.
  const m5 = materials.addPaste(u.id, 'Mix5', text).value;
  const seen = [];
  let previewAtQuestions = null;
  let releaseQ; const qGate = new Promise((r) => { releaseQ = r; });
  const llm5 = async (a) => {
    seen.push(a.schemaName);
    if (a.schemaName === 'material_questions') { await qGate; const rl = await llm({ ...a, task: 'material_lesson' }); return { model: 'mock', data: { questions: rl.data.questions } }; }
    if (a.schemaName === 'material_lesson_text') { const rl = await llm({ ...a, task: 'material_lesson' }); setTimeout(() => { previewAtQuestions = (cb.get(u.id, m5.id) || {}).preview || null; releaseQ(); }, 60); return { model: 'mock', data: { lesson: rl.data.lesson } }; }
    return llm(a);
  };
  const b5 = await cb.build(u.id, m5.id, { llm: llm5, factcheck: true, split: true, concurrency: 1 });
  check('two calls: lesson and questions', seen.includes('material_lesson_text') && seen.includes('material_questions'));
  check('the checked first lesson is readable before its questions are written', previewAtQuestions && /thirty-one/.test(previewAtQuestions.paragraphs[0]) && !/Wegener|Volcanoes/.test(JSON.stringify(previewAtQuestions)), previewAtQuestions);
  const s5 = b5.course.skills[0];
  check('the finished skill has the checked lesson and the checked explanations', !/Wegener|Volcanoes|1912/.test(JSON.stringify(s5.lesson)) && /^Your material says:/.test(s5.questions[0].explanation) && b5.course.status === 'ready', b5.course.status);
  check('the preview is gone once skills exist', !cb.summary(b5.course).preview);

  // Stressed points on every surface: fill-ins from the material's own sentence.
  const St = require('../services/material-stress');
  check('a fill-in hides the number', St.clozeOf('Salt from Ondra Flats is taxed at 7 percent.').answer === '7');
  check('a fill-in hides the year', St.clozeOf('The Veskin treaty was signed in 1642.').prompt.includes('___'));
  check('a fill-in hides a two-word name', St.clozeOf('Tamsin Reef shelters the eastern harbour from winter storms.').answer === 'Tamsin Reef', St.clozeOf('Tamsin Reef shelters the eastern harbour from winter storms.'));
  check('a fill-in without a number or name hides a long word', !!St.clozeOf('The bell must be rung before any boat leaves the harbour.'));
  const kps = [{ text: 'Salt from Ondra Flats is taxed at 7 percent.', weight: 3 }, { text: 'Plain sentence with nothing stressed in it at all.', weight: 1 }];
  const cards = []; const test = [];
  St.sweepPack({ cards, quiz: [], test, kps, passageFor: () => 'p1' });
  check('a stressed point with no card gets one, and a test item; a plain one does not', cards.length === 1 && test.length === 1 && cards[0].back === '7');
  const cards2 = [{ front: 'What is the tax on salt from Ondra Flats?', back: '7 percent' }];
  St.sweepPack({ cards: cards2, quiz: [], test: [], kps, passageFor: () => 'p1' });
  check('a point that already has a card is not doubled', cards2.length === 1);
  const skills = [{ id: 'a', source: 'material', passage_ids: ['p1'], questions: [], lesson: { paragraphs: ['Nothing here.'], key_points: [] } }];
  check('a course question is added on the skill that owns the passage', St.sweepCourse({ skills, kps, passageFor: () => 'p1' }) === 1 && skills[0].questions[0].type === 'short_answer');
  const n = St.sweepFacts({ skills, passages: [{ id: 'p1', text: 'Goats outnumber people on Brack Island by nine to one in 1788. Plain words that say nothing special go here.' }], sentencesOf: F.sentencesOf, capWords: 100 });
  check('a fact the lesson lost goes back as the material\'s own sentence; a plain sentence does not', n === 1 && /Brack Island/.test(skills[0].lesson.paragraphs[1]) && !/Plain words/.test(skills[0].lesson.paragraphs[1]));

  // The switch.
  process.env.UPLOAD_FACTCHECK = 'off';
  const m3 = materials.addPaste(u.id, 'Mix3', text).value;
  calls.length = 0;
  const b3 = await cb.build(u.id, m3.id, { llm, factcheck: true });
  check('UPLOAD_FACTCHECK=off: no check, the lesson as written', !calls.some((t) => /^material_factcheck/.test(t)) && /Wegener/.test(JSON.stringify(b3.course.skills[0].lesson)));
  delete process.env.UPLOAD_FACTCHECK;
  const m4 = materials.addPaste(u.id, 'Mix4', text).value;
  calls.length = 0;
  await cb.build(u.id, m4.id, { llm });
  check('a scripted model that did not ask for it is not asked', !calls.some((t) => /^material_factcheck/.test(t)));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
  console.log('All fact-check checks passed');
  process.exit(0);
})();
