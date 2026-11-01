#!/usr/bin/env node
/**
 * Round 8 of the scorecard (docs/SCORECARD-MEASURED.md): the measures that had too little or no measurement.
 *   1. the experiment allocator (services/personalize.js): a level's arm is stored and stable; one experiment fills the thinner arm of the
 *      stat it teaches most about, weighted by importance; a stat's second arm before another stat's first; what is switched off is never
 *      tried; the rollback (PERSONALIZE_ALLOCATOR=weighted) is the old pick
 *   2. the new experiment dimensions: plain, safe instructions on both arms, each a real stat with a lesson directive
 *   3. pairwise choices in the scorecard (scorecard/index.js experimentPosterior): direction, shrinkage, calibration at the stated
 *      validity, combined with arm outcomes, a standing without a population, and SCORECARD_CHOICES=off
 *   4. the "which is clearer?" channel (services/boosters.js choice): who may, never outside a lesson, never waiting on a model, at most one
 *      a lesson and three a day, the shown order hidden, a/b mapped to the right side, a skip is not evidence, switched off on the Extras page
 *   5. item tags (scorecard/item-tags.js, signals.js SHIFTS): the key, the table, notation, the residual sides, the direction
 *   6. the tagger (scripts/tag-question-skills.js): only question text is sent, answers parsed strictly, a spread sample
 *   7. the behavioural rules fixed: instruction adherence from page skims, re-entry against expectation, depth from both length taps
 *   8. (round 11) reviews read as reviews: a due review that should still be remembered is not a help-seeking chance; mixed practice is a shift
 *      of reviews against focus items, a review read against the forgetting curve
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-measured-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.env.ITEM_TAGS_FILE = path.join(TMP, 'tags.json');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const db = require('../config/db');
const scorecard = require('../services/scorecard');
const signals = require('../services/scorecard/signals');
const hooks = require('../services/scorecard/hooks');
const translate = require('../services/scorecard/translate');
const itemTags = require('../services/scorecard/item-tags');
const { BY_ID } = require('../services/scorecard/stats');
const personalize = require('../services/personalize');
const boosters = require('../services/boosters');
const learner = require('../services/learner');
const tagger = require('./tag-question-skills');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
async function check(name, fn) { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); } }

const NOW = new Date();
let seq = 0;
const user = (age = 15, extra = {}) => db.insert('users', {
  email: `m${++seq}@t.test`, display_name: `m${seq}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true,
  age_check: { birth_ym: `${NOW.getUTCFullYear() - age}-01`, synthetic: true, ...(age < 13 ? { under_13: true, needs_parent: true } : {}) }, ...extra,
});
const withInterests = (u) => { learner.saveProfile(u.id, { survey: { ...learner.getProfile(u.id).survey, interests: 'basketball' } }); return u; };
const WHERE = { trackId: 'english', gradeId: 'proficient' };
/** Feed one experiment outcome: \`n\` answers at expected p 0.7, \`right\` of them right, on one arm of one stat. */
const outcome = (u, stat, arm, n, right) => scorecard.observe(u.id, signals.experimentOutcome({ stat, arm, label: 'x' }, { r: right - 0.7 * n, v: 0.21 * n, n }, 'test'), { source: 'test' });
const choose = (u, stat, pick, times = 1) => { for (let i = 0; i < times; i++) hooks.onChoice(u.id, stat, pick); };

(async () => {
  console.log('1. the experiment allocator');
  await check('a level\'s experiment is stored the first time and is the same every time it is asked, even after the card moves', () => {
    const u = withInterests(user());
    let level = 1;
    let first = null;
    for (; level < 400 && !first; level++) { const a = personalize.armFor(u.id, { ...WHERE, level }); if (a.experiment) first = { level, a }; }
    assert.ok(first, 'no experiment in 400 levels');
    outcome(u, first.a.experiment.stat, first.a.experiment.arm, 20, 20);
    const again = personalize.armFor(u.id, { ...WHERE, level: first.level });
    assert.deepStrictEqual(again, first.a);
    assert.strictEqual(db.find('experiment_arms', (r) => r.user_id === u.id && r.level === first.level).length, 1);
  });
  await check('the arm is the thinner one, and a stat\'s second arm comes before another stat\'s first', () => {
    const u = withInterests(user());
    const picks = [];
    for (let level = 1; level < 600 && picks.length < 4; level++) {
      const a = personalize.armFor(u.id, { ...WHERE, level });
      if (!a.experiment) continue;
      picks.push(a.experiment);
      outcome(u, a.experiment.stat, a.experiment.arm, 7, 5); // what the next level then credits
    }
    assert.strictEqual(picks[0].stat, picks[1].stat, JSON.stringify(picks));
    assert.notStrictEqual(picks[0].arm, picks[1].arm, 'the second experiment filled the other arm');
  });
  await check('importance: the first experiment goes to a stat that changes a lesson most (impact 3, or the research focus)', () => {
    const u = withInterests(user());
    for (let level = 1; level < 400; level++) {
      const a = personalize.armFor(u.id, { ...WHERE, level });
      if (!a.experiment) continue;
      assert.ok(BY_ID[a.experiment.stat].impact >= 3, a.experiment.stat);
      return;
    }
    assert.fail('no experiment');
  });
  await check('a stat already known (experimentState sd small) is passed over for one still unknown', () => {
    const u = withInterests(user());
    outcome(u, 'brevity_preference', 'high', 60, 50); outcome(u, 'brevity_preference', 'low', 60, 38);
    outcome(u, 'interest_transfer', 'high', 60, 40); outcome(u, 'interest_transfer', 'low', 60, 44);
    const st = scorecard.experimentState(scorecard.get(u.id), 'brevity_preference');
    assert.ok(st.vHigh > 10 && st.vLow > 10 && st.sd < 0.9, JSON.stringify(st));
    const known = new Set(['brevity_preference', 'interest_transfer']);
    for (let level = 1; level < 300; level++) {
      const a = personalize.armFor(u.id, { ...WHERE, level });
      if (a.experiment) { assert.ok(!known.has(a.experiment.stat), a.experiment.stat); return; }
    }
    assert.fail('no experiment');
  });
  await check('nothing is tried that is switched off (PERSONALIZE_SKIP_STATS, the learner\'s own lesson_prefs.off), nor interests without stated interests', () => {
    const u = user();
    learner.saveProfile(u.id, { lesson_prefs: { off: ['humor_receptivity'] } });
    process.env.PERSONALIZE_SKIP_STATS = 'brevity_preference';
    try {
      const seen = new Set();
      for (let level = 1; level < 2000; level++) {
        const a = personalize.armFor(u.id, { ...WHERE, level });
        if (a.experiment) { seen.add(a.experiment.stat); outcome(u, a.experiment.stat, a.experiment.arm, 7, 5); }
      }
      for (const off of ['humor_receptivity', 'brevity_preference', 'interest_transfer']) assert.ok(!seen.has(off), `${off} was tried`);
      assert.ok(seen.size >= 5, `the allocator moved on across stats: ${[...seen]}`);
    } finally { delete process.env.PERSONALIZE_SKIP_STATS; }
  });
  await check('the rollback PERSONALIZE_ALLOCATOR=weighted is the old hash pick: nothing stored, the same answer as the hash alone', () => {
    process.env.PERSONALIZE_ALLOCATOR = 'weighted';
    try {
      const u = withInterests(user());
      let n = 0;
      for (let level = 1; level < 200; level++) if (personalize.armFor(u.id, { ...WHERE, level }).experiment) n++;
      assert.ok(n > 30, n);
      assert.strictEqual(db.find('experiment_arms', (r) => r.user_id === u.id).length, 0);
      assert.ok(/ALLOCATOR\(\) === 'info'/.test(read('services/personalize.js')));
    } finally { delete process.env.PERSONALIZE_ALLOCATOR; }
  });
  await check('the expected-information gain: no difference is known from one arm alone, the second arm is worth far more, and it falls as arms fill', () => {
    const st = { tau: 0.3, sd: 1, vHigh: 0, vLow: 0 };
    const one = personalize.armGain(st, 'high');
    const two = personalize.armGain({ ...st, vHigh: 1.4 }, 'low');
    const three = personalize.armGain({ ...st, vHigh: 1.4, vLow: 1.4 }, 'low');
    assert.ok(two > 4 * one && three < two && three > 0, `${one} ${two} ${three}`);
  });

  console.log('2. the new experiment dimensions');
  await check('eleven more stats are tried, each a real stat with a lesson directive and a plain instruction on both arms', () => {
    assert.strictEqual(personalize.NEW_EXPERIMENTS.length, 11);
    const all = new Set();
    for (const e of personalize.EXPERIMENTS) {
      assert.ok(!all.has(e.stat), `twice: ${e.stat}`); all.add(e.stat);
      assert.ok(BY_ID[e.stat], e.stat);
      assert.ok(personalize.importanceOf(e.stat) > 0, `${e.stat} has no lesson directive`);
      for (const side of ['high', 'low']) assert.ok(typeof e[side] === 'string' && e[side].length > 20 && e[side].length < 200, `${e.stat} ${side}`);
      assert.ok(e.label && e.label.length < 60);
    }
  });
  await check('safe for any subject and age: no competition, points, fear, harshness, or a subject-specific demand', () => {
    for (const e of personalize.NEW_EXPERIMENTS) {
      const text = `${e.high} ${e.low}`.toLowerCase();
      for (const bad of ['beat', 'compete', 'competition', 'leaderboard', 'points', 'score more', 'scary', 'fear', 'harsh ', 'blunt', 'stupid', 'formula', 'equation']) {
        assert.ok(!text.includes(bad) || /never (frightening|harshly)/.test(text), `${e.stat}: "${bad}"`);
      }
    }
    for (const left of ['competitive_drive', 'gamification_response']) assert.ok(!personalize.EXPERIMENTS.some((e) => e.stat === left), `${left} pushes competition`);
  });
  await check('PERSONALIZE_DIMENSIONS=base keeps only the first eleven', () => {
    const out = spawnSync(process.execPath, ['-e', 'console.log(require("./services/personalize").EXPERIMENTS.length)'], { cwd: ROOT, env: { ...process.env, PERSONALIZE_DIMENSIONS: 'base' }, encoding: 'utf8' });
    assert.strictEqual(out.stdout.trim(), '11', out.stderr);
  });

  console.log('3. pairwise choices in the scorecard');
  await check('choices for the high version raise the stat, for the low one lower it; "no difference" keeps it near the middle; each shrinks the SD', () => {
    const hi = user(); const lo = user(); const same = user();
    choose(hi, 'tone_formality', 'high', 6); choose(lo, 'tone_formality', 'low', 6); choose(same, 'tone_formality', 'same', 6);
    const p = (u) => scorecard.experimentPosterior(scorecard.get(u.id).sides, 'tone_formality');
    assert.ok(p(hi).z > 0.3 && p(lo).z < -0.3, `${p(hi).z} ${p(lo).z}`);
    assert.ok(Math.abs(p(same).z) < 0.05, p(same).z);
    assert.ok(p(hi).sd < 0.95 && p(same).sd < 1, `${p(hi).sd} ${p(same).sd}`);
    const r = scorecard.read(scorecard.get(hi.id), 'tone_formality');
    assert.ok(r.measured > 55 && r.confidence > 0, JSON.stringify(r));
    assert.ok(scorecard.standing(scorecard.get(hi.id), 'tone_formality'), 'a standing without a population');
    assert.strictEqual(r.evidence.kind, 'choice');
  });
  await check('calibrated at the stated validity: across simulated learners the posterior mean is unbiased in slope and its 90% interval holds the truth about 90% of the time', () => {
    let rnd = 12345;
    const u01 = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
    const normal = () => Math.sqrt(-2 * Math.log(u01() || 1e-9)) * Math.cos(2 * Math.PI * u01());
    const v = scorecard.CHOICE_VALIDITY; const c = scorecard.CHOICE_CUT;
    let sxy = 0; let sxx = 0; let covered = 0; const N = 400;
    for (let i = 0; i < N; i++) {
      const z = normal();
      const side = { hi: 0, lo: 0, same: 0, n: 0, at: new Date().toISOString() };
      for (let k = 0; k < 8; k++) { const ux = v * z + Math.sqrt(1 - v * v) * normal(); side[ux > c ? 'hi' : ux < -c ? 'lo' : 'same']++; side.n++; }
      const post = scorecard.experimentPosterior({ 'choice:tone_formality': side }, 'tone_formality', null);
      sxy += post.z * z; sxx += post.z * post.z;
      if (Math.abs(post.z - z) <= 1.645 * post.sd) covered++;
    }
    const slope = sxy / sxx; // regression of truth on the estimate: 1 when the estimate is neither over- nor under-shrunk
    assert.ok(slope > 0.75 && slope < 1.3, `slope ${slope}`);
    assert.ok(covered / N > 0.85 && covered / N < 0.96, `coverage ${covered / N}`);
  });
  await check('choices and arm outcomes combine: agreeing evidence is surer than either alone', () => {
    const a = user(); const b = user(); const both = user();
    choose(a, 'social_framing', 'high', 4);
    outcome(b, 'social_framing', 'high', 30, 27); outcome(b, 'social_framing', 'low', 30, 15);
    choose(both, 'social_framing', 'high', 4); outcome(both, 'social_framing', 'high', 30, 27); outcome(both, 'social_framing', 'low', 30, 15);
    const p = (u) => scorecard.experimentPosterior(scorecard.get(u.id).sides, 'social_framing');
    assert.ok(p(both).sd < p(a).sd && p(both).sd < p(b).sd, `${p(a).sd} ${p(b).sd} ${p(both).sd}`);
    assert.ok(p(both).z > 0 && p(b).z > 0);
  });
  await check('with no choices an experiment stat is scored exactly as before (shiftScore), and SCORECARD_CHOICES=off ignores choices', () => {
    const u = user();
    outcome(u, 'narrative_pull', 'high', 20, 18); outcome(u, 'narrative_pull', 'low', 20, 10);
    const r = scorecard.read(scorecard.get(u.id), 'narrative_pull');
    assert.strictEqual(r.evidence.kind, 'experiment');
    const code = 'const h=require("./services/scorecard/hooks"),s=require("./services/scorecard"),db=require("./config/db");const u=db.insert("users",{email:"x@t.test"});for(let i=0;i<6;i++)h.onChoice(u.id,"tone_formality","high");console.log(s.read(s.get(u.id),"tone_formality").measured)';
    const out = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env: { ...process.env, DB_FILE: path.join(TMP, 'off.json'), SCORECARD_CHOICES: 'off' }, encoding: 'utf8' });
    assert.strictEqual(out.stdout.trim(), '50', out.stderr);
  });
  await check('a directive from choices needs four of them (translate.js MIN_EVIDENCE.choice)', () => {
    assert.strictEqual(translate.MIN_EVIDENCE ? translate.MIN_EVIDENCE.choice : 4, 4);
    assert.ok(/choice: 4/.test(read('services/scorecard/translate.js')));
  });

  console.log('4. the "which is clearer?" channel');
  const stub = (calls) => async (userId, where, e) => { calls.push({ userId, where, stat: e.stat }); return { high: `${'high words '.repeat(15)}`, low: `${'low words '.repeat(15)}`, model: 'stub' }; };
  await check('a child without a parent\'s agreement is never asked and nothing is written for them', async () => {
    const c = user(10);
    const calls = [];
    assert.strictEqual(await boosters.choice.prepare(c, { ...WHERE, level: 5 }, { write: stub(calls) }), null);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(boosters.choice.offer(c, { ...WHERE, level: 5 }), null);
    assert.strictEqual(boosters.choice.answer(c, 'x', 'a').code, 'not_allowed');
  });
  await check('only after a lesson: nothing is prepared for a quiz, checkpoint or practice level', async () => {
    const u = withInterests(user());
    const calls = [];
    for (const kind of ['quiz', 'checkpoint', 'practice', 'exam']) assert.strictEqual(await boosters.choice.prepare(u, { ...WHERE, level: 7 }, { kind, write: stub(calls) }), null);
    assert.strictEqual(calls.length, 0);
  });
  await check('never waits on a model: nothing is asked until the two versions are written; the lesson page only starts the writing', async () => {
    const u = withInterests(user());
    const where = { ...WHERE, level: 9 };
    assert.strictEqual(boosters.choice.offer(u, where), null, 'nothing ready, nothing asked');
    const calls = [];
    await boosters.choice.prepare(u, where, { write: stub(calls) });
    assert.strictEqual(calls.length, 1);
    const offer = boosters.choice.offer(u, where);
    assert.ok(offer && offer.versions.length === 2 && offer.offer_id, JSON.stringify(offer));
    const route = read('routes/base-lessons.js');
    assert.ok(/choice\.prepare\(req\.user/.test(route) && !/await [^\n]*choice\.prepare/.test(route), 'the lesson route must start, not await, the writing');
  });
  await check('the order is hidden and a/b map to the right side: picking the high version is evidence for high, whichever letter it had', async () => {
    let sawHighFirst = false; let sawLowFirst = false;
    for (let i = 0; i < 12 && !(sawHighFirst && sawLowFirst); i++) {
      const u = withInterests(user());
      const where = { ...WHERE, level: 11 };
      await boosters.choice.prepare(u, where, { write: stub([]) });
      const offer = boosters.choice.offer(u, where);
      const highKey = offer.versions.find((x) => x.text.startsWith('high')).key;
      if (highKey === 'a') sawHighFirst = true; else sawLowFirst = true;
      const stat = boosters.get(u.id).choice.open.stat;
      assert.ok(boosters.choice.answer(u, offer.offer_id, highKey).counted);
      const side = scorecard.get(u.id).sides[`choice:${stat}`];
      assert.ok(side && side.hi === 1 && side.lo === 0, JSON.stringify(side));
    }
    assert.ok(sawHighFirst && sawLowFirst, 'both orders occur');
  });
  await check('a skip is kept for the limits but is not evidence; "no difference" is', async () => {
    const u = withInterests(user());
    await boosters.choice.prepare(u, { ...WHERE, level: 13 }, { write: stub([]) });
    const o = boosters.choice.offer(u, { ...WHERE, level: 13 });
    const stat = boosters.get(u.id).choice.open.stat;
    const out = boosters.choice.answer(u, o.offer_id, 'skip');
    assert.ok(out.ok && !out.counted);
    assert.ok(!scorecard.get(u.id).sides[`choice:${stat}`]);
    assert.strictEqual(boosters.choice.offer(u, { ...WHERE, level: 13 }), null, 'one a lesson, a skip included');
    await boosters.choice.prepare(u, { ...WHERE, level: 16 }, { write: stub([]) });
    const o2 = boosters.choice.offer(u, { ...WHERE, level: 16 });
    const stat2 = boosters.get(u.id).choice.open.stat;
    assert.ok(boosters.choice.answer(u, o2.offer_id, 'same').counted);
    assert.strictEqual(scorecard.get(u.id).sides[`choice:${stat2}`].same, 1);
    assert.strictEqual(boosters.choice.answer(u, o2.offer_id, 'a').code, 'not_found', 'an answered offer is closed');
    assert.strictEqual(boosters.choice.answer(u, 'x', 'maybe').code, 'bad_pick');
  });
  await check('at most three a day', async () => {
    const u = withInterests(user());
    let asked = 0;
    for (let level = 20; level < 30; level++) {
      const where = { ...WHERE, level };
      await boosters.choice.prepare(u, where, { write: stub([]) });
      const o = boosters.choice.offer(u, where);
      if (o) { asked++; boosters.choice.answer(u, o.offer_id, 'same'); }
    }
    assert.strictEqual(asked, boosters.CHOICE_PER_DAY);
    assert.strictEqual(boosters.CHOICE_PER_DAY, 3);
  });
  await check('switched off on the Extras page: no offer and nothing written; the screens are wired', async () => {
    const u = withInterests(user());
    assert.ok(boosters.choice.set(u, false).ok);
    const calls = [];
    await boosters.choice.prepare(u, { ...WHERE, level: 40 }, { write: stub(calls) });
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(boosters.status(u).choice.on, false);
    assert.ok(/boosters-choice\.js/.test(read('public/base-lesson.html')));
    assert.ok(/ChoiceCard\.mount/.test(read('public/js/base-lesson.js')));
    assert.ok(/choice-on/.test(read('public/js/boosters.js')) && /\/api\/boosters\/choice\/setting/.test(read('public/js/boosters.js')));
    assert.ok(/router\.get\('\/choice'/.test(read('routes/boosters.js')) && /router\.post\('\/choice'/.test(read('routes/boosters.js')));
    assert.ok(/data-pick="skip"/.test(read('public/js/boosters-choice.js')) && /data-pick="same"/.test(read('public/js/boosters-choice.js')));
  });
  await check('the pair writer: no model call for an account whose levels are not written for it; for one that is, a strict JSON reply', async () => {
    const editor = require('../services/level-editor'); // eslint-disable-line global-require
    const ai = require('../services/ai'); // eslint-disable-line global-require
    const real = ai.talkDetail;
    const asked = [];
    ai.talkDetail = async (args) => { asked.push(args); return { text: `{"a": "${'one two three four five '.repeat(6)}", "b": "${'six seven eight nine ten '.repeat(6)}"}`, model: 'stub' }; };
    process.env.TESTER_TAILORING = 'off';
    try {
      const u = user();
      assert.strictEqual(await editor.writeChoicePair(u.id, { trackId: 'english', gradeId: 'proficient', level: 3 }, personalize.EXPERIMENTS[0]), null);
      assert.strictEqual(asked.length, 0, 'no model call');
      delete process.env.TESTER_TAILORING;
      const t = user();
      const out = await editor.writeChoicePair(t.id, { trackId: 'english', gradeId: 'proficient', level: 3 }, personalize.EXPERIMENTS[0]);
      assert.ok(out && out.high.startsWith('one') && out.low.startsWith('six') && out.model === 'stub', JSON.stringify(out));
      assert.ok(asked[0].role === 'personalize' && asked[0].lane === 'background' && asked[0].messages[0].content.includes(personalize.EXPERIMENTS[0].high));
      ai.talkDetail = async () => ({ text: 'not json', model: 'stub' });
      assert.strictEqual(await editor.writeChoicePair(t.id, { trackId: 'english', gradeId: 'proficient', level: 3 }, personalize.EXPERIMENTS[0]), null);
    } finally { ai.talkDetail = real; delete process.env.TESTER_TAILORING; }
  });
  await check('what the channel keeps is covered by account deletion and the data download', () => {
    assert.ok(/'experiment_arms', 'choice_pairs'/.test(read('routes/consent.js')));
    assert.ok(/'experiment_arms', 'choice_pairs'/.test(read('routes/profile.js')));
  });
  await check('the channel is in the recovery sim\'s --channels, with its validity stated', () => {
    const sim = read('scripts/scorecard-recovery-sim.js');
    assert.ok(/CHANNEL_NAMES = \[[^\]]*'choice'/.test(sim));
    assert.ok(/CHOICE_R = Number\(opt\('choice-r', 0\.3\)\)/.test(sim));
  });

  console.log('5. item tags');
  await check('the key ignores numbers (generated variants share it) but not the skill or the words', () => {
    const k = itemTags.tagKey;
    assert.strictEqual(k({ skill_id: 's', prompt: 'What is 3 + 4?' }), k({ skill_id: 's', prompt: 'What is 12 + 9?' }));
    assert.notStrictEqual(k({ skill_id: 's', prompt: 'What is 3 + 4?' }), k({ skill_id: 't', prompt: 'What is 3 + 4?' }));
    assert.notStrictEqual(k({ skill_id: 's', prompt: 'What is 3 + 4?' }), k({ skill_id: 's', prompt: 'Who is 3 + 4?' }));
  });
  await check('tags come from the row, then the table; unknown questions know only notation, read from the text', () => {
    const q = { skill_id: 'patterns', prompt: 'What comes next: 2, 4, 6, ?' };
    itemTags._setTable({ [itemTags.tagKey(q)]: ['pattern_detection'] });
    const t = itemTags.tagsOf(q);
    assert.ok(t.on.has('pattern_detection') && t.known.has('far_transfer') && !t.on.has('far_transfer'));
    const row = itemTags.tagsOf({ skill_id: 'x', prompt: 'y', skill_tags: ['far_transfer', 'not_a_tag'] });
    assert.deepStrictEqual([...row.on], ['far_transfer']);
    const unknown = itemTags.tagsOf({ skill_id: 'x', prompt: 'Solve 3x + 2 = 11' });
    assert.ok(unknown.known.size === 1 && unknown.on.has('notation_comfort'));
    assert.ok(!itemTags.tagsOf({ skill_id: 'x', prompt: 'Which word rhymes with log?' }).on.has('notation_comfort'));
    itemTags._setTable(null);
  });
  await check('a level\'s answers go to each tag\'s sides against expectation, and a learner better on the tagged questions reads higher', () => {
    const mk = (correctTagged) => {
      const items = []; const ctx = {};
      for (let i = 0; i < 10; i++) {
        const tagged = i % 2 === 0;
        items.push({ id: 1000 + i, index: i, skill_id: 's', correct: tagged ? correctTagged : !correctTagged, ms: 9000, format: 'typed', skill_tags: tagged ? ['pattern_detection'] : [] });
        ctx[1000 + i] = { expected_lpo: 0.6, expected: 0.6, delayed: false, rapid: false };
      }
      return { items, ctx };
    };
    const good = mk(true);
    const obs = signals.fromBlock(good.items, { ctx: good.ctx });
    const on = obs.find((o) => o.resid === 'tag_on:pattern_detection'); const off = obs.find((o) => o.resid === 'tag_off:pattern_detection');
    assert.ok(on && off && on.n === 5 && off.n === 5 && on.r > 0 && off.r < 0, JSON.stringify(obs.filter((o) => o.resid && o.resid.startsWith('tag'))));
    assert.ok(obs.some((o) => o.stat === 'pattern_detection' && o.shift));
    const a = user(); const b = user();
    for (let k = 0; k < 6; k++) { scorecard.observe(a.id, obs, { source: 'test' }); scorecard.observe(b.id, signals.fromBlock(mk(false).items, { ctx: mk(false).ctx }), { source: 'test' }); }
    const ra = scorecard.read(scorecard.get(a.id), 'pattern_detection'); const rb = scorecard.read(scorecard.get(b.id), 'pattern_detection');
    assert.ok(ra.measured > 55 && rb.measured < 45, `${ra.measured} ${rb.measured}`);
    assert.strictEqual(ra.confidence, 0, 'not trusted before there is a population (needsPopulation)');
    assert.ok(signals.SHIFTS.pattern_detection.validity === 0.8);
  });
  await check('the tag table in the repo is the tagger\'s output: definitions, models, every entry a list of known tags', () => {
    const j = JSON.parse(read('content/item-skill-tags.json'));
    assert.ok(j.version === 1 && j.models.length && Object.keys(j.tags).length >= 20);
    for (const list of Object.values(j.tags)) assert.ok(Array.isArray(list) && list.every((t) => itemTags.TAGS[t]));
    assert.ok(j.models.every((m) => !/minimax|openrouter|anthropic|claude/i.test(m)), `free models only: ${j.models}`);
  });

  console.log('6. the tagger');
  await check('what is sent is the question\'s own text, choices, subject and skill; answers are parsed strictly', () => {
    const batch = [{ id: 'q1', track: 'math', skill_id: 'add_sub', prompt: 'What is 2 + 2?', choices: ['3', '4'] }, { id: 'q2', track: 'english', skill_id: 'x', prompt: 'Pick the odd one out.', choices: null }];
    const p = tagger.promptFor(batch);
    assert.ok(p.includes('What is 2 + 2?') && p.includes('3 | 4') && !/user|learner_id|email|answer:/i.test(p));
    const got = tagger.parseBatch(batch, { questions: [{ n: 1, tags: ['notation_comfort', 'made_up'] }, { n: 2, tags: [] }, { n: 9, tags: ['far_transfer'] }] });
    assert.deepStrictEqual(Object.values(got), [['notation_comfort'], []]);
    assert.ok(/xKiro's free plan only/.test(read('scripts/tag-question-skills.js')) && !/openrouter/i.test(read('scripts/tag-question-skills.js').replace(/No OpenRouter|no OpenRouter/g, '')));
  });
  await check('the sample spreads over subjects and grades and skips questions already tagged', () => {
    const qs = [];
    for (const g of ['a', 'b', 'c']) for (let i = 0; i < 20; i++) qs.push({ id: `${g}${i}`, track: 't', grade: g, skill_id: 's', prompt: `q ${g} word${i}` });
    const s = tagger.sampleOf(qs, 9);
    assert.deepStrictEqual(['a', 'b', 'c'].map((g) => s.filter((q) => q.grade === g).length), [3, 3, 3]);
    const done = Object.fromEntries(s.map((q) => [itemTags.tagKey(q), []]));
    assert.ok(tagger.sampleOf(qs, 9, done).every((q) => !done[itemTags.tagKey(q)]));
  });

  console.log('7. the behavioural rules');
  await check('instruction adherence: a page finished in under a fifth of its time is a skim (a rate, both ways), held to validity 0.8', () => {
    const skim = signals.fromBaseLesson({ readMs: 20000, words: 2000 });
    const read2 = signals.fromBaseLesson({ readMs: 600000, words: 2000 });
    assert.ok(skim.some((o) => o.stat === 'instruction_adherence' && o.hits === 1 && o.trials === 1));
    assert.ok(read2.some((o) => o.stat === 'instruction_adherence' && o.hits === 0 && o.trials === 1));
    assert.ok(signals.RATES.instruction_adherence.invert && signals.RATES.instruction_adherence.validity === 0.8);
    const u = user();
    for (let i = 0; i < 12; i++) scorecard.observe(u.id, skim, { source: 'test' });
    assert.ok(scorecard.read(scorecard.get(u.id), 'instruction_adherence').measured < 45);
  });
  await check('re-entry: the first level of a sitting, against expectation, goes to the after-a-break side only after three days away', () => {
    const items = [{ id: 1, correct: false, ms: 9000 }, { id: 2, correct: false, ms: 9000 }, { id: 3, correct: true, ms: 9000 }];
    const ctx = { 1: { expected_lpo: 0.7 }, 2: { expected_lpo: 0.7 }, 3: { expected_lpo: 0.7 } };
    const away = signals.fromReturn(4, items, ctx);
    const steady = signals.fromReturn(1, items, ctx);
    assert.strictEqual(away[0].resid, 'res_return_after_break');
    assert.strictEqual(steady[0].resid, 'res_return_steady');
    assert.ok(away[0].r < 0 && away[1].stat === 'reentry_cost' && away[1].shift);
    assert.ok(signals.SHIFTS.reentry_cost.needsPopulation);
  });
  await check('depth/breadth is read from both length taps, not only "too short"', () => {
    assert.ok(signals.fromFeedback({ length: 'short' }).some((o) => o.stat === 'depth_breadth' && o.value > 50));
    assert.ok(signals.fromFeedback({ length: 'long' }).some((o) => o.stat === 'depth_breadth' && o.value < 50));
  });

  console.log('8. reviews read as reviews (round 11, docs/SPEED-RETENTION.md section 7)');
  const memCtx = (days, right) => ({
    expected: 0.8, expected_lpo: 0.8, delayed: true, interval_days: days, prior_attempts: right, prior_correct: right,
    prior_spaced_right: 0, prior_spaced_wrong: 0, prev_wrong: false, rapid: false, guess: 0.1,
  });
  await check('a due review the forgetting curve says should still be remembered is not a chance for help seeking (nor for hint dependency, as before); a faded one is', () => {
    const asked = { prompt: 'x', difficulty: 4, ms: 9000, correct: true, role: 'review', format: 'typed', coach_used: true };
    const near = signals.fromAnswer(asked, memCtx(1.2, 12));
    assert.ok(!near.some((o) => o.stat === 'help_seeking' || o.stat === 'hint_dependency'), JSON.stringify(near));
    const faded = signals.fromAnswer(asked, memCtx(60, 1));
    assert.ok(faded.some((o) => o.stat === 'help_seeking' && o.hits === 1) && !faded.some((o) => o.stat === 'hint_dependency'), JSON.stringify(faded));
    const old = process.env.SCORECARD_STUCK_MEMORY;
    process.env.SCORECARD_STUCK_MEMORY = 'off';
    try {
      assert.ok(signals.fromAnswer(asked, memCtx(1.2, 12)).some((o) => o.stat === 'help_seeking'), 'the rollback reads every memory test as a chance');
    } finally { if (old === undefined) delete process.env.SCORECARD_STUCK_MEMORY; else process.env.SCORECARD_STUCK_MEMORY = old; }
  });
  await check('more reviews in a level add no help-seeking chances when they should be remembered (the stop rule\'s extra reviews do not dilute the rate)', () => {
    const chances = (nReviews) => {
      let n = 0;
      for (let i = 0; i < nReviews; i++) {
        n += signals.fromAnswer({ prompt: 'x', difficulty: 4, ms: 9000, correct: true, role: 'review', format: 'typed', coach_used: false }, memCtx(1.5, 10))
          .filter((o) => o.stat === 'help_seeking').length;
      }
      return n;
    };
    assert.strictEqual(chances(3), chances(9));
  });
  await check('mixed practice is a shift of the level\'s reviews against its focus items; a review is read against the forgetting curve, not as a fresh answer', () => {
    const mk = (reviewsCorrect, focusCorrect, days, nReviews = 5) => {
      const items = []; const ctx = {};
      for (let i = 0; i < nReviews + 4; i++) {
        const review = i < nReviews;
        items.push({ id: 2000 + i, index: i, skill_id: review ? `a${i}` : 'z', role: review ? 'review' : 'focus', correct: review ? reviewsCorrect : focusCorrect, ms: 9000, format: 'typed' });
        ctx[2000 + i] = review ? memCtx(days, 10) : { expected: 0.8, expected_lpo: 0.8, delayed: false, rapid: false };
      }
      return { items, ctx };
    };
    const good = mk(true, true, 1.5);
    const obs = signals.fromBlock(good.items, { ctx: good.ctx });
    const rv = obs.find((o) => o.resid === 'res_review'); const fc = obs.find((o) => o.resid === 'res_focus');
    assert.ok(rv && fc && rv.n === 5 && fc.n === 4, JSON.stringify(obs.filter((o) => o.resid)));
    assert.ok(obs.some((o) => o.stat === 'interleaving_tolerance' && o.shift));
    assert.ok(!obs.some((o) => o.stat === 'interleaving_tolerance' && o.value !== undefined), 'no raw difference when the model read it');
    // The same right answers 60 days on are worth more against a curve that says they should have faded.
    const m60 = mk(true, true, 60);
    const far = signals.fromBlock(m60.items, { ctx: m60.ctx }).find((o) => o.resid === 'res_review');
    assert.ok(far.r > rv.r, `${far.r} ${rv.r}`);
    // A learner who handles reviews better than the model expects reads higher than one who does worse, on the same level shape.
    const a = user(); const b = user();
    const hi = mk(true, false, 1.5); const lo = mk(false, true, 1.5);
    for (let k = 0; k < 8; k++) {
      scorecard.observe(a.id, signals.fromBlock(hi.items, { ctx: hi.ctx }), { source: 'test' });
      scorecard.observe(b.id, signals.fromBlock(lo.items, { ctx: lo.ctx }), { source: 'test' });
    }
    assert.ok(scorecard.read(scorecard.get(a.id), 'interleaving_tolerance').measured > 55 && scorecard.read(scorecard.get(b.id), 'interleaving_tolerance').measured < 45);
    assert.ok(signals.SHIFTS.interleaving_tolerance.needsPopulation);
  });
  await check('without the ability model the raw review-against-focus difference is kept', () => {
    const items = [0, 1, 2, 3, 4, 5].map((i) => ({ id: 3000 + i, index: i, skill_id: `s${i}`, role: i < 2 ? 'review' : 'focus', correct: i % 2 === 0, ms: 9000, format: 'typed' }));
    const obs = signals.fromBlock(items, { ctx: {} });
    assert.ok(obs.some((o) => o.stat === 'interleaving_tolerance' && o.value !== undefined && o.weight === 0.1));
  });
  await check('the decay stat is read with spaced and massed answers told apart (a read curve of its own); the review schedule keeps its curve', () => {
    const forgetting = require('../services/scorecard/forgetting');
    // 25 learners, 24 memory tests each: a skill with more spaced right answers keeps longer, whatever its count of all right answers.
    let seedN = 7;
    const rnd = () => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; };
    const lists = [];
    for (let l = 0; l < 25; l++) {
      const rows = [];
      for (let i = 0; i < 24; i++) {
        const nc = 3 + Math.floor(rnd() * 8); const ns = Math.floor(rnd() * 6); const dt = 1 + rnd() * 20;
        const half = 2 ** (0.5 + 0.1 * nc + 0.45 * ns);
        rows.push(forgetting.row({ dt, nc, nw: 1, pk: 0.9, g: 0.1, y: rnd() < 0.1 + 0.8 * 2 ** (-dt / half), day: i, ns, nsw: 0 }));
      }
      lists.push(rows);
    }
    const pop = forgetting.population(lists, 30);
    assert.ok(pop && pop.read && pop.read.curve, 'a population with a read curve');
    assert.ok(pop.read.curve.d !== undefined && pop.curve.d === undefined, 'the read curve has the spaced terms, the schedule\'s does not');
    assert.ok(pop.read.curve.d > 0.15, `spaced right answers lengthen the half-life: ${pop.read.curve.d}`);
    const mine = lists[0];
    assert.deepStrictEqual(forgetting.estimate(mine, pop, 30), forgetting.estimate(mine, { ...pop.read }, 30), 'the stat is read with the read curve');
    assert.ok(forgetting.recallCurve(pop, mine, 30).curve.d === undefined, 'the schedule keeps the curve it was tuned on');
  });
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exitCode = failed ? 1 : 0;
})();
