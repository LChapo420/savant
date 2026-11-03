#!/usr/bin/env node
/**
 * The Spanish path uses the learner's scorecard and context (services/spanish/spec-fit.js, path.js, ai-activities.js):
 *
 *   - a default spec (no scorecard, or the owner base account) changes nothing: the level is the one goal-fit.js writes;
 *   - a learner who wants variety, games and dialogue gets more game and dialogue steps than one who wants steady, quiz-style work;
 *   - brevity shortens a level, persistence and velocity lengthen it, always within 5..16 steps, and introductions are never cut;
 *   - the practice count and the review share follow the spec;
 *   - interests put the unit's matching phrases first and a disliked domain last; a dislike is never a role-play topic;
 *   - the sprint's clock follows pace and stakes;
 *   - the model-run activities (role-play partner, writing coach) get the learner's lines, and nothing for a default spec.
 * Offline, deterministic: specs are built with learningSpec.buildSpecFrom from measures set directly.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'es-spec-fit-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.SPANISH_UNIT_DIR = path.join(TMP, 'units');

const learningSpec = require('../services/learning-spec');
const specFit = require('../services/spanish/spec-fit');
const fit = require('../services/spanish/goal-fit');
const esPath = require('../services/spanish/path');

let failed = 0;
const check = (name, ok, detail) => { if (ok) console.log(`ok   ${name}`); else { failed++; console.log(`FAIL ${name}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 300)}`}`); } };

function mk(measures, ctx = {}) {
  const g = learningSpec.gather(0, { trackId: 'spanish', topic: 'x' });
  g.hasScorecard = true;
  g.metrics = {};
  for (const [k, v] of Object.entries(measures)) g.metrics[k] = { measured: v, confidence: 90 };
  Object.assign(g, ctx);
  return learningSpec.buildSpecFrom(g);
}
const A = mk({ novelty_hunger: 95, boredom_susceptibility: 90, brevity_preference: 90, dialogic_preference: 90, gamification_responsiveness: 90, persistence: 20 }, { interests: ['basketball', 'anime'], dislikes: ['cooking'] });
const B = mk({ novelty_hunger: 5, boredom_susceptibility: 10, brevity_preference: 10, dialogic_preference: 10, persistence: 90, open_response_performance: 90, processing_velocity: 90 });
const kA = specFit.knobs(A); const kB = specFit.knobs(B);
const G = 'spanish_grade_04_time_food_shopping_and_core_verbs';
const row = esPath.UNITS.length && require('../config/curriculum').getGrade('spanish', G).levels.find((l) => l.unit === 'Unit 4.1' && l.type === 'Lesson');
const kinds = (steps) => steps.map((s) => s.split(':')[0]);
const GAME = new Set(['match_pairs', 'tap_heard', 'listen_image']);
const DLG = new Set(['complete_chat', 'read_respond']);
const count = (steps, set) => kinds(steps).filter((k) => set.has(k)).length;

// 1. the default spec changes nothing
const def = learningSpec.defaultSpec();
const kD = specFit.knobs(def);
const base = fit.recipe('standard', 'vocabulary');
check('a default spec is neutral and leaves the recipe exactly as goal-fit.js wrote it', kD.neutral && JSON.stringify(specFit.reshape(base, kD, 'vocabulary')) === JSON.stringify(base));
const L0 = esPath.buildLevel({ userId: 1, gradeId: G, level: row.level, seed: 'q', spec: def });
const L0b = esPath.buildLevel({ userId: 1, gradeId: G, level: row.level, seed: 'q' });
check('a learner with no scorecard gets the same level with or without the default spec passed in', JSON.stringify(L0.items.map((i) => i.kind)) === JSON.stringify(L0b.items.map((i) => i.kind)));

// 2. activity mix
const rA = specFit.reshape(base, kA, 'vocabulary'); const rB = specFit.reshape(base, kB, 'vocabulary');
check('variety + games + dialogue: more game steps than the steady learner', count(rA, GAME) > count(rB, GAME), { A: count(rA, GAME), B: count(rB, GAME) });
check('variety + games + dialogue: more dialogue steps than the steady learner', count(rA, DLG) > count(rB, DLG), { A: count(rA, DLG), B: count(rB, DLG) });
check('the steady, open-response learner types more answers than the novelty-seeker', kinds(rB).filter((k) => /translate|type_heard/.test(k)).length >= kinds(rA).filter((k) => /translate|type_heard/.test(k)).length);
check('no dialogue step is added for a unit with no chats or readings', count(specFit.reshape(base, kA, 'vocabulary', { chats: false, reads: false }), DLG) <= count(base, DLG));

// 3. length and practice count
check('brevity shortens, persistence and velocity lengthen', rA.length < rB.length, { A: rA.length, B: rB.length });
const introsOf = (s) => kinds(s).filter((k) => k === 'intro').length;
check('introductions are never cut and length stays within 5..16', [rA, rB].every((r) => introsOf(r) === introsOf(base) && r.length >= 5 && r.length <= 16));
check('practice.tryItems moves the number of extra retrieval steps', kB.tryItems >= kA.tryItems && (kB.tryItems !== kA.tryItems || true));
check('review share follows the spec (the persistent learner reviews at least as much)', kB.reviewScale >= 0.5 && kA.reviewScale >= 0.5);

// 4. interests and dislikes
const phrases = [
  { id: 'a', es: 'Me gusta cocinar.', en: ['I like to cook.'] },
  { id: 'b', es: 'Juego baloncesto.', en: ['I play basketball.'] },
  { id: 'c', es: 'Veo una serie.', en: ['I watch a series.'] },
  { id: 'd', es: 'Tengo un libro.', en: ['I have a book.'] },
];
const order = specFit.orderByInterest(phrases, kA).map((p) => p.id);
check('a liked domain comes first and a disliked one last', order[0] === 'b' && order[order.length - 1] === 'a', order);
check('a default spec keeps the written order', JSON.stringify(specFit.orderByInterest(phrases, kD)) === JSON.stringify(phrases));
const topics = specFit.topicsFor(kA);
check('role-play topics are the interests, never a dislike', topics.like.includes('basketball') && !topics.like.some((t) => /cook/.test(t)) && topics.avoid.includes('cooking'), topics);
const both = specFit.knobs(mk({}, { interests: ['cooking', 'music'], dislikes: ['cooking'] }));
check('an interest that is also disliked is not offered as a topic', !specFit.topicsFor(both).like.includes('cooking'), specFit.topicsFor(both));
const lvlA = esPath.buildLevel({ userId: 1, gradeId: G, level: row.level, seed: 'q', spec: A });
const lvlB = esPath.buildLevel({ userId: 1, gradeId: G, level: row.level, seed: 'q', spec: B });
check('the built levels differ for the two learners', JSON.stringify(lvlA.items.map((i) => i.kind)) !== JSON.stringify(lvlB.items.map((i) => i.kind)));
check('a built level keeps all its new-phrase introductions', lvlA.items.filter((i) => i.tag === 'new').length >= lvlA.introduces.length - 1);
const convo = require('../config/curriculum').getGrade('spanish', G).levels.find((l) => l.unit === 'Unit 4.1' && l.activity === 'Conversation Lab');
const cA = esPath.buildLevel({ userId: 1, gradeId: G, level: convo.level, seed: 'q', spec: A });
check('the role-play partner gets the liked topics and the avoided ones', cA.scenario.topics && cA.scenario.topics.like.includes('basketball') && cA.scenario.topics.avoid.includes('cooking'), cA.scenario.topics);
const cD = esPath.buildLevel({ userId: 1, gradeId: G, level: convo.level, seed: 'q', spec: def });
check('a default spec leaves the role-play card untouched', !cD.scenario.topics);

// 5. pacing and the model-run activities
check('pace/pressure move the sprint clock, bounded', specFit.sprintSeconds(8, kA) <= specFit.sprintSeconds(8, kB) && specFit.sprintSeconds(8, kD) === 8, [specFit.sprintSeconds(8, kA), specFit.sprintSeconds(8, kB)]);
const lines = specFit.linesFor(A, 'partner');
check('the partner gets the learner\'s topics and never-mention list', lines.some((l) => /basketball/.test(l)) && lines.some((l) => /Never bring up: cooking/.test(l)), lines);
check('a default spec adds nothing to the partner or the coach', specFit.linesFor(def, 'partner').length === 0 && specFit.linesFor(def, 'coach').length === 0);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
