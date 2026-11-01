#!/usr/bin/env node
/**
 * Notes and podcast are held to the learner's spec as a lesson is (services/material-notes.js, services/material-podcast.js):
 * every point of the text still carried, the learner's interests used as framed analogies, a draft that breaks it written once more
 * with the problems named, never a third time, and never a revision that loses coverage. A learner we know nothing about is
 * written for exactly as before (one call). Model calls are stubbed.
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|XKIRO|UNOROUTER)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';
process.env.AI_POOL = '0';
process.env.OWNER_EMAIL = `rev-owner-${process.pid}@example.test`;
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = path.join(os.tmpdir(), `material-revision-${process.pid}.json`);
process.env.DB_FILE = tmp;
process.on('exit', () => { for (const f of [tmp, `${tmp}.tmp`]) try { fs.unlinkSync(f); } catch { /* gone */ } });

const db = require('../config/db');
const learner = require('../services/learner');
const scorecard = require('../services/scorecard');
const ls = require('../services/learning-spec');
const materials = require('../services/materials');
const notes = require('../services/material-notes');
const podcast = require('../services/material-podcast');

let failures = 0;
const check = (label, cond, detail) => { if (cond) console.log(`  ok   ${label}`); else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` - ${JSON.stringify(detail).slice(0, 400)}` : ''}`); } };
const now = new Date();
function makeLearner(tag, { age = null, stats = {}, survey = {} } = {}) {
  const user = db.insert('users', { email: `rev-${tag}@example.test`, display_name: tag, password_hash: 'x', xp: 0, streak: 0, onboarded: true, ...(age ? { age_check: { birth_ym: `${now.getUTCFullYear() - age}-01`, synthetic: true } } : {}) });
  learner.saveProfile(user.id, { survey: learner.cleanSurvey(survey), subscription: 'pro' });
  if (Object.keys(stats).length) {
    const card = scorecard.get(user.id);
    for (const [id, score] of Object.entries(stats)) card.stats[id] = { ...card.stats[id], s: score, m: score, w: 8, mw: 8, n: 40, evv: 40, evx: 40, evk: 'value' };
    db.update('scorecards', card.id, { stats: card.stats });
  }
  return user;
}
const kid = makeLearner('kid', { age: 11, stats: { interest_transfer: 92, brevity_preference: 85, vocabulary_ceiling: 10 }, survey: { interests: 'minecraft, drawing', notes: 'I hate spiders.' } });
const fresh = makeLearner('fresh', {});

const SENTS = [
  'Photosynthesis is the process plants use to make their own food from light.',
  'A plant takes in carbon dioxide from the air through tiny openings in its leaves.',
  'Chlorophyll inside the chloroplasts absorbs light energy from the sun.',
  'Oxygen is released as a by-product of photosynthesis through the same openings.',
  'Glucose is a kind of sugar and it is the food the plant uses to grow and store energy.',
];
const TEXT = SENTS.join(' ');
const mk = (u, title) => materials.addPaste(u.id, title, `${TEXT} ${'Plants are living things that need light and water to grow well. '.repeat(10)}`).value;
const bullet = (s, extra = {}) => ({ text: s, passage_id: 'p1', quote: s, ...extra });
const ANALOGY = 'Think of Minecraft: a wheat farm needs sunlight to grow, like a plant making food from light.';

/** An llm stub that answers the n-th call with the n-th draft (the last repeats), recording each call. */
function scripted(drafts) {
  const calls = [];
  const fn = async (args) => { calls.push(args); return { model: 'mock', data: drafts[Math.min(calls.length - 1, drafts.length - 1)](args) }; };
  fn.calls = calls;
  return fn;
}
const notesDraft = (sentences, analogy) => () => ({ sections: [{ heading: 'Plants', bullets: [...sentences.flatMap((s, i) => (analogy && i === 1 ? [bullet(s), bullet(ANALOGY, { quote: s })] : [bullet(s)]))] }] });
const turnsDraft = (sentences, analogy) => () => ({ title: 'Ep', turns: [
  { host: 'A', text: 'Welcome to the show.' },
  ...sentences.flatMap((s, i) => [{ host: 'A', text: s, passage_id: 'p1', quote: s }, ...(analogy && i === 1 ? [{ host: 'A', text: ANALOGY }] : []), { host: 'B', text: 'Tell me more?' }]),
  { host: 'A', text: 'That was the recap.' },
] });

(async () => {
  console.log('sourceFacts and the check');
  check('the source\'s sentences of seven words or more, at most the cap, spread evenly', ls.sourceFacts(TEXT).length === 5 && ls.sourceFacts(SENTS.map((s) => s).join(' ').repeat(1), 3).length === 3);
  const specKid = ls.buildSpec(kid.id, { topic: 'Photosynthesis' });
  check('the kid\'s spec has interests to use', specKid.interests.exampleDomains.includes('minecraft') && specKid.interests.share >= 0.7, specKid.interests);
  const unused = ls.checkFollowed(SENTS.join(' '), specKid, { minShare: 0.3, own: true });
  check('own material: an output that uses none of the interests is a problem worded for analogies, not for worked examples', unused.problems.some((p) => p.id === 'interest_unused' && /analogies/.test(p.detail) && !/worked example/.test(p.detail)), unused.problems);
  check('and one with the analogy and every point passes', ls.checkFollowed(`${SENTS.join(' ')} ${ANALOGY} ${ANALOGY.replace('wheat farm', 'furnace')} ${ANALOGY.replace('wheat farm', 'sword')}`, specKid, { keyFacts: ls.sourceFacts(TEXT), source: TEXT, minShare: 0.3, own: true }).problems.filter((p) => p.id === 'interest_unused' || p.id === 'coverage').length === 0);
  check('a lesson\'s check is unchanged: the interest need still starts at a share of 0.5', ls.checkFollowed(SENTS.join(' '), { ...specKid, interests: { ...specKid.interests, share: 0.4 } }, {}).problems.every((p) => p.id !== 'interest_unused'));

  console.log('notes');
  const mKid = mk(kid, 'Photosynthesis');
  const llmA = scripted([notesDraft(SENTS, false), notesDraft(SENTS, true)]);
  const rA = await notes.build(kid.id, mKid.id, { llm: llmA, force: true });
  check('a draft with no analogy is written once more, and the second draft (with the analogy as its own bullet) is kept', llmA.calls.length === 2 && /broke these requirements/.test(llmA.calls[1].user) && /interests/.test(llmA.calls[1].user) && rA.notes.revised_parts === 1 && rA.notes.sections[0].bullets.some((b) => /^Think of/.test(b.text)), [llmA.calls.length, rA.notes && rA.notes.revised_parts]);
  check('the analogy bullet is grounded (it carries the quote of the point it pictures) and does not count against the point-bullet limit', rA.notes.sections[0].bullets.every((b) => SENTS.join(' ').includes(b.quote)) && rA.notes.sections[0].bullets.length === 6, rA.notes.sections[0].bullets.length);
  const llmB = scripted([notesDraft(SENTS.slice(0, 3), true), notesDraft(SENTS, true)]);
  const rB = await notes.build(kid.id, mKid.id, { llm: llmB, force: true });
  check('a draft that leaves points of the text out is written once more naming them, and the fuller one is kept', llmB.calls.length === 2 && /these key points are missing/.test(llmB.calls[1].user) && rB.notes.sections[0].bullets.some((b) => /Oxygen is released/.test(b.text)), llmB.calls.length);
  const llmC = scripted([notesDraft(SENTS, false), notesDraft(SENTS.slice(0, 2), true)]);
  const rC = await notes.build(kid.id, mKid.id, { llm: llmC, force: true });
  check('a revision that loses coverage is thrown away: the first draft stays, and never a third call', llmC.calls.length === 2 && rC.notes.sections[0].bullets.some((b) => /Oxygen is released/.test(b.text)), [llmC.calls.length, rC.notes.sections[0].bullets.map((b) => b.text.slice(0, 30)), rC.notes.open_problems]);
  const llmD = scripted([notesDraft(SENTS, true)]);
  const rD = await notes.build(kid.id, mKid.id, { llm: llmD, force: true });
  check('a good draft is kept after one call', llmD.calls.length === 1 && rD.notes.revised_parts === 0, [llmD.calls.length, rD.notes && rD.notes.revised_parts, rD.notes && rD.notes.open_problems]);
  const mFresh = mk(fresh, 'Photosynthesis');
  const llmE = scripted([notesDraft(SENTS.slice(0, 2), false)]);
  await notes.build(fresh.id, mFresh.id, { llm: llmE, force: true });
  check('a learner we know nothing about is written for exactly as before: one call, no revision, whatever the draft', llmE.calls.length === 1 && !/analogy bullets/.test(llmE.calls[0].system));
  check('the kid\'s prompt asks for analogy bullets on top of the bullet limit', /analogy bullets, where the block below asks for them, come on top/.test(llmA.calls[0].system) && /own one-sentence bullet that starts "Think of"/.test(llmA.calls[0].system));

  console.log('podcast');
  const llmP = scripted([turnsDraft(SENTS, false), turnsDraft(SENTS, true)]);
  const pA = await podcast.build(kid.id, mKid.id, { kind: 'overview', llm: llmP, force: true });
  check('a script with none of their interests is written once more, and the second is kept', llmP.calls.length === 2 && /broke these requirements/.test(llmP.calls[1].user) && pA.episode.revised === true && pA.episode.turns.some((t) => /Think of Minecraft/.test(t.text)), [llmP.calls.length, pA.episode && pA.episode.revised]);
  const llmQ = scripted([turnsDraft(SENTS.slice(0, 3), true), turnsDraft(SENTS, true)]);
  const pB = await podcast.build(kid.id, mKid.id, { kind: 'overview', llm: llmQ, force: true });
  check('a script that drops points of the material is written once more naming them', llmQ.calls.length === 2 && /these key points are missing/.test(llmQ.calls[1].user) && pB.episode.turns.some((t) => /Oxygen is released/.test(t.text)));
  const llmR = scripted([turnsDraft(SENTS, false), turnsDraft(SENTS.slice(0, 2), true)]);
  const pC = await podcast.build(kid.id, mKid.id, { kind: 'overview', llm: llmR, force: true });
  check('a revision that loses coverage is thrown away; never a third call', llmR.calls.length === 2 && pC.episode.turns.some((t) => /Oxygen is released/.test(t.text)));
  const llmS = scripted([turnsDraft(SENTS.slice(0, 2), false)]);
  await podcast.build(fresh.id, mFresh.id, { kind: 'overview', llm: llmS, force: true });
  check('a learner we know nothing about: one call, as before', llmS.calls.length === 1);
  check('the recap is the block\'s to size (the fixed prompt no longer insists on one line)', /end with a recap \(one line unless the block below says otherwise\)/.test(llmP.calls[0].system));

  if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nmaterial-revision-test: all checks passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
