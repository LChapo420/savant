#!/usr/bin/env node
/**
 * The new planted set for fact-100. Candidates from MiniMax M3 (plant2.js, two rounds) kept after a read, plus hand-written wrong-but-plausible facts and misleading simplifications inserted into real lessons.
 * Split by level, seeded: about a quarter "dev2" (thresholds may look at it), the rest "heldout" (run once, no change after). The author of the design read every plant while keeping them, so the split guards
 * against tuning on results, not against having seen the sentences: no rule in any checker names a plant's words.
 * Output: docs/fact-100/heldout.json. Clean controls: levels the 6 Nov audit found no confirmed error in.
 */
const L = require('../fact-gate/lib');

const rd = (f) => L.readJsonl(L.path.join(L.TMP, f));
const A = rd('fact-100-candidates.jsonl'); const B = rd('fact-100-candidates2.jsonl');
const KEEP_A = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 30, 32, 33, 34, 35, 36, 37, 41, 43, 44, 46, 47, 48, 49, 50, 53, 60, 61, 62, 63, 64, 65, 66, 72, 73, 74, 76, 77, 78, 79, 81, 82, 84, 86, 88, 89, 90, 92, 94, 95, 97, 98, 99];
const KEEP_B = [5, 6, 7, 8, 24, 25, 29, 32, 33, 41, 42, 45, 48, 58];
const SOFT_B = new Set([6, 25]);
const FULL = { alg: 'math/algebra_1_part_a', calc: 'math/calculus_i', eng: 'english/proficient', chess: 'chess/chess_board_explorer', piano: 'piano/piano_keyboard_explorer' };
const lv = (s) => { const [g, n] = s.split('/'); return `${FULL[g]}/${n}`; };
const ins = (level, index, anchor, added, kind, truth) => ({ level, track: level.split('/')[0], kind, truth, src: 'hand', edits: [{ word: 'block', index, original: anchor, wrong: `${anchor} ${added}` }] });
const swap = (level, index, original, wrong, kind, truth) => ({ level, track: level.split('/')[0], kind, truth, src: 'hand', edits: [{ word: 'block', index, original, wrong }] });
const MS = 'misleading_simplification'; const WP = 'wrong_plausible_fact';
const HAND = [
  ins(lv('alg/465'), 0, 'An exponent of 1/2 asks for a square root.', 'So the square root of x^2 is x for any x.', MS, 'The square root of x^2 is |x|; for x = -3 it is 3.'),
  ins(lv('alg/465'), 0, 'An exponent of 1/2 asks for a square root.', 'A negative exponent makes the value negative.', WP, 'A negative exponent gives a reciprocal: 2^-1 = 1/2, which is positive.'),
  ins(lv('calc/29'), 5, 'This describes a tangent line.', 'A tangent line touches the curve at exactly one point and does not cross it.', MS, 'y = x^3 at 0: the tangent crosses the curve; y = sin x: its tangent touches at many points.'),
  ins(lv('calc/20'), 8, 'Zero only means f(2) = f(7).', 'Where the derivative of a function is zero, the function has a maximum or a minimum.', MS, 'x^3 has derivative 0 at 0 and neither a maximum nor a minimum there.'),
  ins(lv('calc/29'), 5, 'Zero only means the net change is zero, so f(6) = f(2).', 'A function that is continuous at a point is also differentiable at that point.', WP, '|x| is continuous at 0 and not differentiable there.'),
  ins(lv('calc/20'), 8, 'Zero only means f(2) = f(7).', 'By the same reasoning, the average rate of change over an interval equals the average of the instantaneous rates at its two endpoints.', WP, 'False in general: x^3 on [0, 2] has average rate 4, endpoint rates 0 and 12 average 6.'),
  ins(lv('alg/254'), 6, 'Parallel means the same slope.', 'Two lines with the same slope never meet.', MS, 'Two lines with the same slope and the same intercept are the same line; they share every point.'),
  ins(lv('alg/254'), 4, 'For parallel, keep the same slope.', 'A vertical line has a slope of zero.', WP, 'A vertical line has an undefined slope; a horizontal line has slope zero.'),
  ins(lv('alg/254'), 6, 'Parallel means the same slope.', 'Perpendicular lines have slopes that are reciprocals of each other.', WP, 'Negative reciprocals: slopes 2 and 1/2 are not perpendicular.'),
  ins(lv('alg/380'), 0, 'Two equations, one solution.', 'A system of two linear equations has exactly one solution.', MS, 'It can have none (parallel lines) or infinitely many (the same line).'),
  ins(lv('alg/380'), 0, 'Two equations, one solution.', 'If elimination leaves 0 = 0, the system has no solution.', WP, '0 = 0 means infinitely many solutions; 0 = 5 means none.'),
  ins(lv('eng/62'), 8, 'A semicolon is the correct tight join.', 'A semicolon can also join a complete sentence to a dependent clause.', WP, 'A semicolon joins independent clauses (or complex list items), not an independent and a dependent clause.'),
  ins(lv('eng/92'), 8, "Passive voice moves the receiver to the subject position: form of 'be' plus a past participle.", "A verb phrase with a form of 'be' in it is passive.", MS, "'She is running' has a form of 'be' and is active."),
  ins(lv('eng/82'), 3, 'Chicago dropped its ban in 2014, and most guides now accept split infinitives when splitting sounds better.', "A split infinitive places a word between 'to' and its noun.", WP, "Between 'to' and its verb: to boldly go."),
  ins(lv('eng/82'), 2, 'Chicago says: use the Oxford comma.', 'The AP Stylebook says the same.', WP, 'AP generally omits the serial comma in simple series.'),
  ins(lv('eng/50'), 1, 'Mood is indicative (facts), imperative (commands), and subjunctive (wishes, ifs, demands).', 'The subjunctive uses the same form as the past tense.', MS, "'I suggest that she study' uses the base form, not the past."),
  ins(lv('eng/39'), 4, "Clean parallelism: three matching verb phrases ('closing', 'moving', 'asking').", 'Parallel items also have to contain the same number of words.', WP, 'Parallelism is about grammatical form, not word count.'),
  ins(lv('eng/38'), 4, "Broken parallel structure: 'practicing' (a gerund) is set against 'to lift' (an infinitive).", 'A gerund is a verb form ending in -ed that works as an adjective.', WP, 'A gerund ends in -ing and works as a noun; the -ed adjective form is a participle.'),
  ins(lv('eng/62'), 5, 'The fix: use a semicolon, a period, or a dash when two complete sentences meet.', 'A comma with no connecting word also works when both sentences are short.', MS, 'That is still a comma splice in standard edited English.'),
  ins(lv('eng/50'), 8, 'Indicative = facts; imperative = commands; subjunctive = wishes, ifs, demands.', 'The imperative needs a stated subject.', WP, 'The imperative normally leaves its subject unstated: Close the door.'),
  ins(lv('eng/91'), 4, 'Chicago would keep the Oxford comma; AP would drop it.', 'AP would drop it in any series, whatever the sentence.', MS, 'AP keeps the comma where a series would otherwise be confusing, or with complex items.'),
  swap('spanish/intermediate/112', 7, 'librería is a bookstore', 'librería is a library', WP, 'Librería is a bookstore; a library is a biblioteca.'),
  swap('spanish/advanced/134', 6, 'sensible is sensitive', 'sensible is reasonable', WP, 'Sensible means sensitive; reasonable is razonable or sensato.'),
  ins('spanish/advanced/65', 6, '¿Cuántos años tienes? and answer Tengo ...', 'Height works the same way: ¿Cuánto mides? and answer Tengo 170.', WP, 'Height uses medir: Mido 1,70.'),
  ins('spanish/intermediate/97', 7, 'Ask ¿Qué día es hoy?', 'Days of the week take a capital letter in Spanish, as in English.', WP, 'Days of the week are lower case in Spanish, except at the start of a sentence.'),
  ins('spanish/entry/81', 3, 'Buenos días is good morning; buenas tardes is good afternoon.', 'Buenas noches is only for going to bed.', MS, 'Buenas noches is also a greeting on arriving in the evening.'),
  ins('spanish/advanced/93', 1, 'Soy casado and Estoy casado both occur.', 'Professions work the same way: Soy profesor and Estoy profesor are both correct.', WP, 'Professions take ser: Soy profesor. Estoy profesor is wrong in this sense.'),
  ins(lv('chess/42'), 0, 'The rook moves in straight lines only.', 'It can jump over a piece in its way.', WP, 'Only the knight jumps; a rook is blocked.'),
  ins(lv('chess/42'), 1, 'The white rook on d4 has four straight lanes: up, down, left and right.', 'Like the pawn, the rook captures in a different way from how it moves.', WP, 'The rook captures the way it moves.'),
  ins(lv('piano/32'), 3, 'Play the two-group first: the two black keys just above the middle, one after the other, left to right.', 'The black keys are the notes C, D, E, F and G.', WP, 'Those are white keys; the black keys are sharps and flats.'),
  ins(lv('piano/32'), 4, 'Play any black keys you like, one finger at a time, and stay with the band.', 'An octave of a piano has twelve white keys.', WP, 'Seven white and five black, twelve in all.'),
];

const levels = new Map(L.loadLevels().map((l) => [l.id, l]));
const plants = [];
const add = (c, src, soft) => { try { L.applyEdits(levels.get(c.level), c.edits); plants.push({ src, level: c.level, track: c.track || c.level.split('/')[0], kind: c.kind, edits: c.edits, truth: c.truth, soft: !!soft }); } catch (e) { console.log('skip', src, c.level, String(e.message).slice(0, 80)); } };
KEEP_A.forEach((i) => add(A[i], `A${i}`));
KEEP_B.forEach((i) => add(B[i], `B${i}`, SOFT_B.has(i)));
HAND.forEach((h, i) => add(h, `H${i}`));
const inDev2 = (level) => parseInt(L.hash(`fact-100-split:${level}`), 16) % 4 === 0;
plants.forEach((p, i) => { p.id = `n${String(i).padStart(3, '0')}`; p.split = inDev2(p.level) ? 'dev2' : 'heldout'; });

const audit = L.readJson(L.path.join(L.DOCS, 'audit-live.json'));
const confirmedLevels = new Set((audit.levels || audit.findings || audit.confirmed || []).filter((x) => (x.confirmed ? x.confirmed.length : x.errors ? x.errors.length : true)).map((x) => x.level || x.id));
const clean = [...levels.keys()].filter((id) => !confirmedLevels.has(id)).map((level) => ({ level, split: inDev2(level) ? 'dev2' : 'heldout' }));
L.fs.mkdirSync(L.path.join(L.DOCS, '..', 'fact-100'), { recursive: true });
L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'heldout.json'), { built: '2026-11-07', planted_by: 'MiniMax M3 on Lyceum, kept on reading; hand-written insertions', plants, clean });
const tally = {}; for (const p of plants) { const k = `${p.split}/${p.kind}`; tally[k] = (tally[k] || 0) + 1; }
console.log(plants.length, JSON.stringify(tally));
console.log('tracks', JSON.stringify(plants.reduce((m, p) => { m[p.track] = (m[p.track] || 0) + 1; return m; }, {})));
console.log('clean', clean.length, clean.filter((c) => c.split === 'heldout').length, 'audit keys', Object.keys(audit).slice(0, 6), 'confirmed levels', confirmedLevels.size);
process.exit(0);
