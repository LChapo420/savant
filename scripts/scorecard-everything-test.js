#!/usr/bin/env node
/**
 * Round 9 (docs/SCORECARD-EVERYTHING.md): everything the learner does and says, as calibrated scorecard evidence.
 *   1. text features: deterministic, computed locally, and only their per-batch means are kept (never the text)
 *   2. the indicator posterior: the right information for one indicator, less than the sum for two of one family, calibrated 90% intervals
 *      at the assumed validity, and an honest (wider than claimed, not narrower) failure when the true validity is half
 *   3. through the scorecard: no indicators leaves every read exactly as before; with a population, a learner's indicators move the
 *      measure the right way and narrow its interval, and SCORECARD_INDICATORS=off ignores them
 *   4. the sweeps: tutor chat swept once (cursor), typed answers, the usage read once a week, a child without consent gets none of
 *      them (no text features, usage read, model read or tutor observations, no queue kept)
 *   5. the transcript read: invented quotes and unknown measures dropped, unmentioned measures read as 0, too little text not sent
 *   6. the browser capture: the silent-signals batch's new counts reach the scorecard as cap.* indicators, no keys or choices kept
 *   7. factorial pages (opt-in, PERSONALIZE_FACTORIAL=2): two compatible dimensions per page, stored and stable, both credited with the
 *      outcome; the default stays the one-dimension design
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-everything-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.env.PERSONALIZE_HOLDOUT = '0';
process.env.PERSONALIZE_EXPERIMENT_RATE = '1';
process.env.SCORECARD_TRANSCRIPT_READ = 'off'; // the sweep must never reach a provider in a test; the read itself is tested with a stub
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const db = require('../config/db');
const scorecard = require('../services/scorecard');
const hooks = require('../services/scorecard/hooks');
const signals = require('../services/scorecard/signals');
const ind = require('../services/scorecard/indicators');
const tf = require('../services/scorecard/text-features');
const transcript = require('../services/scorecard/transcript-read');
const boosters = require('../services/boosters');
const personalize = require('../services/personalize');

let failed = 0;
async function check(name, fn) { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); } }
const NOW = new Date();
let seq = 0;
const user = (age = 16) => db.insert('users', {
  email: `e${++seq}@t.test`, display_name: `e${seq}`, password_hash: 'x', onboarded: true,
  age_check: { birth_ym: `${NOW.getUTCFullYear() - age}-01`, synthetic: true, ...(age < 13 ? { under_13: true, needs_parent: true } : {}) },
});
let s = 777;
const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

(async () => {
  console.log('1. text features');
  await check('a question, a deep question, a hedge, humour, an answer request and the reading grade are read from the words', () => {
    const f = tf.features('Why does this work? I think maybe it is like when you divide, haha');
    assert.strictEqual(f['txt.question'], 1);
    assert.strictEqual(f['txt.deepq'], 1);
    assert.ok(f['txt.hedge'] > 0);
    assert.strictEqual(f['txt.humour'], 1);
    assert.strictEqual(f['txt.connect'], 1);
    assert.ok(f['txt.grade'] >= 0);
    assert.strictEqual(tf.features('just tell me the answer')['txt.answerseek'], 1);
    assert.strictEqual(tf.features('Ok.')['txt.vocab'], undefined, 'a feature that does not apply is left out');
    const formal = tf.features('However, I would like to understand the derivation, therefore could you please explain it.')['txt.formal'];
    const casual = tf.features('lol ya gonna try it ok')['txt.formal'];
    assert.ok(formal > casual);
  });
  await check('a batch keeps per-feature means and counts only', () => {
    const b = tf.summarize([{ text: 'What is a fraction?' }, { text: 'ok cool, that makes sense now' }]);
    assert.strictEqual(b['txt.question'].n, 2);
    assert.strictEqual(b['txt.question'].mean, 0.5);
    assert.ok(!JSON.stringify(b).includes('fraction'));
  });

  console.log('2. the indicator posterior');
  const pop1 = { 'txt.formal': { mu: 0, tau: 1, within: 0 } };
  await check('one indicator of validity v with no sampling noise carries v^2 / (1 - v^2) of information about the standing', () => {
    const l = ind.likelihood({ 'txt.formal': { w: 100, s: 100, q: 100, ww: 100, b: 10 } }, 'tone_formality', pop1);
    const v = 0.3;
    assert.ok(Math.abs(l.info - (v * v) / (1 - v * v)) < 1e-6, `${l.info}`);
    assert.ok(Math.abs(l.num / l.info - 1 / v) < 1e-6, 'the likelihood mean is x / v');
  });
  await check('two indicators of one family carry less than the sum of what each carries (shared nuisance)', () => {
    const pop = { 'txt.hedge': { mu: 0, tau: 1, within: 0 }, 'txt.certain': { mu: 0, tau: 1, within: 0 } };
    const m = { w: 50, s: 50, q: 50, ww: 50, b: 5 };
    const both = ind.likelihood({ 'txt.hedge': m, 'txt.certain': m }, 'self_efficacy', pop);
    const a = ind.likelihood({ 'txt.hedge': m }, 'self_efficacy', pop);
    const b = ind.likelihood({ 'txt.certain': m }, 'self_efficacy', pop);
    assert.ok(both.info < a.info + b.info && both.info > Math.max(a.info, b.info), `${both.info} vs ${a.info} + ${b.info}`);
  });
  const coverage = (trueScale) => {
    // Learners with a true standing z; their indicators x_k = a_k z + nuisance (shared within the family at RHO) + sampling noise.
    const stat = 'vocabulary_ceiling';
    const maps = ind.BY_STAT[stat];
    const pop = Object.fromEntries(maps.map((m) => [m.key, { mu: 0, tau: 1, within: 4 }]));
    let hit = 0; let n = 0; let se = 0;
    for (let i = 0; i < 3000; i++) {
      const z = normal();
      const g = normal();
      const moms = {};
      for (const m of maps) {
        const v = Math.min(0.95, m.v * trueScale);
        const units = 12;
        const t = m.sign * v * z + Math.sqrt(1 - v * v) * (Math.sqrt(ind.RHO) * g + Math.sqrt(1 - ind.RHO) * normal());
        const x = t + Math.sqrt(4 / units) * normal();
        moms[m.key] = { w: units, s: units * x, q: units * x * x, ww: units, b: 3 };
      }
      const p = ind.posterior(moms, stat, pop);
      n += 1;
      se += (p.z - z) ** 2;
      if (Math.abs(p.z - z) <= 1.645 * p.sd) hit += 1;
    }
    return { cov: hit / n, rmse: Math.sqrt(se / n) };
  };
  await check('at the assumed validity the 90% interval holds the truth about 90% of the time, and the estimate beats the prior', () => {
    const c = coverage(1);
    assert.ok(c.cov > 0.875 && c.cov < 0.925, `coverage ${c.cov}`);
    assert.ok(c.rmse < 0.99, `rmse ${c.rmse}`);
  });
  await check('at half the validity the intervals still hold the truth at least 85% of the time (over-trusting a weak source is bounded)', () => {
    const c = coverage(0.5);
    assert.ok(c.cov > 0.85, `coverage ${c.cov}`);
  });
  await check('combine: the existing posterior is the prior; one wider than the population keeps its centre at the population width', () => {
    const l = { info: 0.5, num: 0.5 };
    const sharp = ind.combine({ z: 1, sd: 0.5 }, l);
    assert.ok(Math.abs(sharp.sd - Math.sqrt(1 / 4.5)) < 1e-9);
    const vague = ind.combine({ z: 0.6, sd: 1.5 }, l);
    assert.ok(Math.abs(vague.sd - Math.sqrt(1 / 1.5)) < 1e-9);
    assert.ok(Math.abs(vague.z - (0.6 + 0.5) / 1.5) < 1e-9, 'its centre is kept');
    assert.deepStrictEqual(ind.combine({ z: 0.2, sd: 0.4 }, null), { z: 0.2, sd: 0.4 });
  });

  console.log('3. through the scorecard');
  const crowd = [];
  for (let i = 0; i < 26; i++) {
    const u = user(20);
    const z = (i - 12.5) / 7;
    for (let b = 0; b < 4; b++) hooks.onIndicators(u.id, { 'txt.formal': { mean: 0.6 * z + 0.8 * normal(), n: 5 }, 'txt.humour': { mean: 0.2 + 0.1 * normal(), n: 5 } });
    crowd.push(u);
  }
  scorecard.refreshPopulation();
  await check('a learner with no indicators reads exactly as before', () => {
    const u = user(20);
    hooks.onAnswer(u.id, { id: 1, user_id: u.id, correct: true, ms: 4000, role: 'focus', format: 'typed', prompt: 'x' });
    const card = scorecard.get(u.id);
    for (const id of ['tone_formality', 'rush_tendency', 'humor_receptivity']) assert.deepStrictEqual(scorecard.read(card, id), scorecard.readOwn(card, id));
  });
  await check('with a population, formal writing moves tone formality up and narrows its interval; off ignores it', () => {
    const hi = crowd[25];
    const card = scorecard.get(hi.id);
    const r = scorecard.read(card, 'tone_formality');
    const own = scorecard.readOwn(card, 'tone_formality');
    assert.ok(r.measured > own.measured, `${r.measured} vs ${own.measured}`);
    assert.ok(r.se < own.se);
    assert.ok(r.indicator_units > 0);
    const lo = scorecard.read(scorecard.get(crowd[0].id), 'tone_formality');
    assert.ok(lo.measured < 50);
    process.env.SCORECARD_INDICATORS = 'off';
    assert.deepStrictEqual(scorecard.read(card, 'tone_formality'), own);
    delete process.env.SCORECARD_INDICATORS;
    const st = scorecard.standing(card, 'tone_formality');
    assert.ok(st && st.z > 0 && st.sd < 1);
  });
  await check('the card keeps moments, never words', () => {
    const u = user(20);
    hooks.onLearnerText(u.id, [{ text: 'My hamster Biscuit loves carrots, so what if fractions were carrots?' }]);
    const card = scorecard.get(u.id);
    assert.ok(card.ind && card.ind['txt.question'] && card.ind['txt.question'].w === 1);
    assert.ok(!JSON.stringify(card).toLowerCase().includes('biscuit'));
  });

  console.log('4. the sweeps');
  const archive = (u, said) => db.insert('tutor_archive', { user_id: u.id, entries: said.map((t, i) => ({ n: i + 1, at: new Date(Date.now() - (said.length - i) * 60000).toISOString(), where: 'home', learner: t, tutor: 'Fractions are parts of a whole: the bottom number says how many parts.' })), next_seq: said.length + 1 });
  await check('tutor chat is swept once: the cursor moves and a second sweep adds nothing', () => {
    const u = user(17);
    archive(u, ['what is a fraction?', 'why is the bottom number the parts?', 'ok I get it now, thanks']);
    assert.strictEqual(hooks.textSweep(u.id), 3);
    const w = scorecard.get(u.id).ind['txt.question'].w;
    assert.strictEqual(hooks.textSweep(u.id), null);
    assert.strictEqual(scorecard.get(u.id).ind['txt.question'].w, w);
  });
  await check('a child without a parent\'s agreement: no text features, no usage read, no tutor observations, nothing queued for a model', () => {
    const kid = user(10);
    archive(kid, ['why do we need fractions', 'this is boring']);
    hooks.textSweep(kid.id);
    const card = scorecard.get(kid.id);
    assert.ok(!card.ind || !Object.keys(card.ind).length, 'no indicators at all');
    assert.strictEqual(hooks.usageSweep(kid.id), null);
    assert.ok(!card.read_words && !card.read_at, 'nothing counted toward a model read');
    assert.strictEqual(hooks.onTutorObservation(kid.id, [{ measure: 'curiosity_hook', direction: 1, strength: 2 }]), null);
    assert.ok(!(scorecard.get(kid.id).ind || {})['llm.curiosity_hook']);
    const teen = user(15);
    hooks.onTutorObservation(teen.id, [{ measure: 'curiosity_hook', direction: 1, strength: 2 }, { measure: 'not_a_measure', direction: 1, strength: 3 }, { measure: 'evaluation_anxiety', direction: 0, strength: 0 }]);
    const t = scorecard.get(teen.id).ind;
    assert.strictEqual(t['llm.curiosity_hook'].s, 2);
    assert.strictEqual(t['llm.evaluation_anxiety'].s, 0);
    assert.strictEqual(Object.keys(t).length, 2);
  });
  await check('typed answers of four words or more are read when a sitting ends; the usage read runs once a week', () => {
    const u = user(19);
    const t0 = Date.now();
    for (let d = 0; d < 4; d++) db.insert('sessions', { user_id: u.id, kind: 'lesson', started_at: new Date(t0 - d * 86400000 - 3600000).toISOString(), ended_at: new Date(t0 - d * 86400000).toISOString() });
    const session = db.find('sessions', (x) => x.user_id === u.id)[0];
    hooks.onSessionFinished(u.id, session, [{ id: 9001, format: 'typed', user_answer: 'because the denominator counts the parts', correct: true }, { id: 9002, format: 'typed', user_answer: '3/4', correct: true }]);
    const card = scorecard.get(u.id);
    assert.strictEqual(card.ind['txt.len'].w, 1, 'only the long typed answer');
    assert.ok(card.ind['use.hour'] && card.ind['use.chat'] && card.use_at);
    assert.ok(hooks.hourSpread([17, 17.5, 16.5]) < 1 && hooks.hourSpread([2, 9, 15, 21]) > 4);
    assert.strictEqual(hooks.usageSweep(u.id), null, 'not again within the week');
  });

  await check('enough new words from an allowed learner start one model read in the background, from the archive, at most once a day', async () => {
    delete process.env.SCORECARD_TRANSCRIPT_READ;
    const ai = require('../services/ai'); // eslint-disable-line global-require
    const real = ai.talk;
    const calls = [];
    ai.talk = async (args) => { calls.push(args); return JSON.stringify({ reads: [{ measure: 'question_generation', direction: 1, strength: 2, evidence: 'why does the bottom number' }] }); };
    try {
      const u = user(17);
      archive(u, ['why does the bottom number say how many parts and not the top one', 'and what if the top number is bigger than the bottom one, is that still a fraction', 'I think I see it now, it is like cutting a pizza into equal slices and taking some']);
      hooks.textSweep(u.id);
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].messages[0].content.includes('cutting a pizza'));
      const card = scorecard.get(u.id);
      assert.ok(card.read_at && card.read_from && !card.read_words);
      assert.strictEqual(card.ind['llm.question_generation'].s, 2);
      assert.ok(!JSON.stringify(card).includes('pizza'), 'the words are not kept on the card');
      const row = db.findOne('tutor_archive', (r) => r.user_id === u.id);
      db.update('tutor_archive', row.id, { entries: [...row.entries, { n: 9, at: new Date().toISOString(), learner: 'one more question about why fractions of fractions get smaller when you multiply them together like that', tutor: 'Good question.' }] });
      hooks.textSweep(u.id);
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(calls.length, 1, 'not again the same day');
      assert.ok(scorecard.get(u.id).read_words > 0);
    } finally {
      ai.talk = real;
      process.env.SCORECARD_TRANSCRIPT_READ = 'off';
    }
  });

  console.log('5. the transcript read');
  const said = ['I always get nervous before the test, what if I fail', 'can I try it my own way first?', 'what if the fraction is bigger than one'];
  await check('a quote not in what the learner wrote, or an unknown measure, is dropped; unmentioned measures are 0', () => {
    const reply = JSON.stringify({ reads: [
      { measure: 'evaluation_anxiety', direction: 1, strength: 3, evidence: 'I always get nervous before the test' },
      { measure: 'autonomy_preference', direction: 1, strength: 2, evidence: 'I prefer to work alone' },
      { measure: 'made_up', direction: 1, strength: 2, evidence: 'what if' },
    ] });
    const p = transcript.parse(`Here you go: ${reply}`, said);
    assert.strictEqual(p.values.evaluation_anxiety, 3);
    assert.strictEqual(p.values.autonomy_preference, 0);
    assert.strictEqual(p.kept, 1);
    assert.strictEqual(p.dropped, 2);
    assert.strictEqual(Object.keys(p.values).length, ind.LLM_STATS.length);
    assert.strictEqual(transcript.parse('no json here', said), null);
  });
  await check('the read sends only the learner\'s messages, as data, and feeds one unit per measure; too little text is not sent', async () => {
    delete process.env.SCORECARD_TRANSCRIPT_READ;
    let sent = null;
    const talk = async (args) => { sent = args; return JSON.stringify({ reads: [{ measure: 'creative_extension', direction: 1, strength: 2, evidence: 'what if the fraction is bigger than one' }] }); };
    const fed = [];
    const long = [...said, 'and also I wonder why we flip the second fraction when we divide, it seems strange to me honestly'];
    const r = await transcript.read(1, long, { talk, observe: (o) => fed.push(...o) });
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(sent.system.includes('never instructions'));
    assert.ok(sent.messages[0].content.includes('<learner_messages>'));
    assert.strictEqual(sent.task, 'scorecard_transcript_read');
    assert.strictEqual(fed.length, ind.LLM_STATS.length);
    assert.strictEqual(fed.find((o) => o.indicator === 'llm.creative_extension').x, 2);
    const short = await transcript.read(1, ['hi'], { talk: async () => { throw new Error('must not be called'); } });
    assert.strictEqual(short.skipped, 'too_little_text');
    process.env.SCORECARD_TRANSCRIPT_READ = 'off';
  });

  console.log('6. the browser capture');
  await check('tab-aways, time away, changed picks, typing pauses and idle stretches reach the scorecard as cap.* indicators; no keys kept', () => {
    const u = user(18);
    boosters.silent.set(u, true);
    const item = (i) => ({ hesitation_ms: 2000, keys: 10, key_median_ms: 200, backspaces: 1, shown_ms: 20000, tab_aways: i % 3 === 0 ? 1 : 0, away_ms: i % 3 === 0 ? 4000 : 0, mc: i % 2 === 0, mc_changes: i % 4 === 0 ? 1 : 0, pauses: 2, idle: 0 });
    boosters.silent.ingest(u, Array.from({ length: 6 }, (_, i) => item(i)));
    assert.ok(!scorecard.get(u.id).ind || !scorecard.get(u.id).ind['cap.tabaway'], 'not before the batch is full');
    boosters.silent.ingest(u, Array.from({ length: 6 }, (_, i) => item(i + 6)));
    const m = scorecard.get(u.id).ind;
    assert.strictEqual(m['cap.tabaway'].w, 12);
    assert.ok(Math.abs(m['cap.tabaway'].s / m['cap.tabaway'].w - 4 / 12) < 1e-3);
    assert.strictEqual(m['cap.mcchange'].w, 6, 'only multiple-choice answers count for a changed pick');
    assert.ok(m['cap.away'] && m['cap.pause'] && m['cap.idle']);
    const kept = JSON.stringify(db.findOne('profiles', (p) => p.user_id === u.id));
    assert.ok(!kept.includes('shown_ms') && !kept.includes('key_median_ms'), 'no raw item is kept once the batch is fed');
  });

  console.log('7. factorial pages');
  await check('PERSONALIZE_FACTORIAL=2: a page crosses two dimensions that do not touch the same part of it, stored, stable, both credited', () => {
    process.env.PERSONALIZE_FACTORIAL = '2';
    const u = user(20);
    const where = { trackId: 'math', gradeId: 'g1', level: 4 };
    const a = personalize.armFor(u.id, where);
    assert.ok(a.experiment && a.experiment.also && a.experiment.also.length === 1, JSON.stringify(a));
    const [b] = a.experiment.also;
    assert.ok(personalize.compatible(a.experiment.stat, b.stat));
    assert.ok(a.experiment.text.includes(b.text));
    assert.deepStrictEqual(personalize.armFor(u.id, where), a);
    const obs = signals.experimentOutcome(a.experiment, { r: 1, v: 2, n: 5 }, 'note');
    assert.deepStrictEqual(obs.filter((o) => o.resid).map((o) => o.resid.split(':')[1]).sort(), [a.experiment.stat, b.stat].sort());
    assert.ok(!personalize.compatible('brevity_preference', 'example_density_need'));
    assert.ok(!personalize.compatible('curiosity_hook', 'global_framing_need'));
    delete process.env.PERSONALIZE_FACTORIAL;
  });
  await check('the default is the one-dimension design (PERSONALIZE_FACTORIAL unset or 1)', () => {
    const u = user(20);
    const a = personalize.armFor(u.id, { trackId: 'math', gradeId: 'g1', level: 7 });
    assert.ok(a.experiment && !a.experiment.also);
  });

  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
