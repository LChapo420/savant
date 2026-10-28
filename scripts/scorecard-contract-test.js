/**
 * Every consumer of the scorecard gets the same contract.
 *
 *   node scripts/scorecard-contract-test.js      (also run by `npm test`)
 *
 * services/scorecard/contract.js is the one versioned object anything that
 * changes a lesson or a curriculum reads from the scorecard. This checks, for
 * learners with and without confident directives, in a subject and without
 * one, that what each consumer builds today is exactly what the contract
 * says it gets:
 *
 *   adaptation   the sides decide() takes (adaptation.confidentSides of the
 *                gated list) and the structure knobs (DIRECTIVE_KNOBS)
 *   lesson text  personalize.scorecardSection, details.brief (the level
 *                editor's brief), block-levels learnerText, the
 *                /api/scorecard/prompt-block route's text
 *   coach        learner.teachingBrief's scorecard block
 *   path         learner-path.js reads nothing from the scorecard (never a skip)
 *
 * plus the contract's own promises: versioned, well formed, deterministic,
 * never throws (a failure is the new-learner fallback), and no learner numbers
 * in model-facing text.
 *
 * Runs on its own copy of the data file (deleted at the end), with every model
 * key blanked and the local model off. No model is called.
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';

const fs = require('fs');
const os = require('os');
const path = require('path');

let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `scorecard-contract-test-${process.pid}.json`);
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
require('../config/db');
process.on('exit', () => { if (ownCopy) try { fs.unlinkSync(ownCopy); } catch { /* gone */ } });

const assert = require('assert');
const db = require('../config/db');
const learner = require('../services/learner');
const details = require('../services/details');
const personalize = require('../services/personalize');
const adaptation = require('../services/adaptation');
const blockLevels = require('../services/block-levels');
const scorecard = require('../services/scorecard');
const translate = require('../services/scorecard/translate');
const contract = require('../services/scorecard/contract');

let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}
const same = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch { return false; } };

function makeUser(tag, extra = {}) {
  const user = db.insert('users', {
    email: `contracttest-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`,
    display_name: `Contract Test ${tag}`,
    password_hash: 'not-a-real-hash',
    xp: 0,
    streak: 0,
    onboarded: true,
  });
  if (Object.keys(extra).length) learner.saveProfile(user.id, extra);
  return user;
}
function settle(userId, stat, value, times = 12, trackId) {
  for (let i = 0; i < times; i++) scorecard.observe(userId, [{ stat, value, weight: 1 }], { source: 'test', trackId });
}

(async () => {
  console.log('\nthe contract itself');
  check('versioned (semver) with a major the consumers pin', /^\d+\.\d+\.\d+$/.test(contract.VERSION) && contract.MAJOR === Number(contract.VERSION.split('.')[0]));
  check('structure knobs are the ones adaptation applies (DIRECTIVE_KNOBS)', same(contract.KNOBS, adaptation.DIRECTIVE_KNOBS),
    { contract: Object.keys(contract.KNOBS), adaptation: Object.keys(adaptation.DIRECTIVE_KNOBS) });
  const pathSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'learner-path.js'), 'utf8');
  check('path planning (learner-path.js) reads nothing from the scorecard: no reading can skip a unit', !/scorecard/.test(pathSource));

  // Learners: nothing known; lesson directives (one combined); structure-moving
  // directives in a subject; an interest directive with and without interests.
  const blank = makeUser('blank');
  const writer = makeUser('writer');
  settle(writer.id, 'inductive_trajectory', 92);
  settle(writer.id, 'step_explicitness', 90);
  settle(writer.id, 'brevity_preference', 90);
  const shaper = makeUser('shaper');
  settle(shaper.id, 'challenge_appetite', 95, 20);
  settle(shaper.id, 'frustration_threshold', 8, 20);
  settle(shaper.id, 'rush_tendency', 92, 20);
  settle(shaper.id, 'consolidation_need', 90, 20);
  settle(shaper.id, 'prior_knowledge', 92, 20, 'english');
  const curious = makeUser('curious', { survey: { interests: 'football and baking' } });
  settle(curious.id, 'interest_transfer', 92, 20);
  settle(curious.id, 'narrative_pull', 90, 20);
  const incurious = makeUser('incurious');
  settle(incurious.id, 'interest_transfer', 92, 20);
  const people = { blank, writer, shaper, curious, incurious };
  const places = [{ trackId: 'english', gradeId: 'proficient', level: 105 }, { trackId: null, gradeId: null }];

  console.log('\nevery consumer, every learner');
  for (const [tag, u] of Object.entries(people)) {
    for (const where of places) {
      const at = `${tag}${where.trackId ? ` in ${where.trackId}` : ''}`;
      const c = contract.read(u.id, where);
      const problems = contract.validate(c);
      check(`${at}: well formed`, problems.length === 0, problems);
      check(`${at}: compatible with major ${contract.MAJOR}`, contract.assertCompatible(c, contract.MAJOR));
      let threw = false;
      try { contract.assertCompatible(c, contract.MAJOR + 1); } catch { threw = true; }
      check(`${at}: a consumer pinned to another major is refused`, threw);

      const card = scorecard.get(u.id);
      const interests = learner.hasStatedInterests(u.id);
      // Lesson text: the writer's lines, as personalize builds them for the brief.
      const lines = personalize.scorecardSection(u.id, where, { recent: false });
      check(`${at}: lesson lines = personalize.scorecardSection`, same(contract.forPrompt(c), lines), { contract: contract.forPrompt(c), personalize: lines });
      const brief = details.brief(u.id, where);
      check(`${at}: the level editor's brief (details.brief) carries exactly them`,
        c.lesson.promptText ? brief.includes(c.lesson.promptText) : !brief.includes(contract.LESSON_HEADING));
      const tailoredBlock = blockLevels.learnerText(u.id, where, { tailored: true, experiment: null });
      const sharedBlock = blockLevels.learnerText(u.id, where, { tailored: false, experiment: null });
      check(`${at}: block levels' tailored learner text carries them, the shared one does not`,
        (c.lesson.promptText ? tailoredBlock.includes(c.lesson.promptText) : !tailoredBlock.includes(contract.LESSON_HEADING))
        && !sharedBlock.includes(contract.LESSON_HEADING));
      const route = personalize.scorecardSection(u.id, where).join('\n');
      check(`${at}: the prompt-block route's text starts with them`, route.startsWith(c.lesson.promptText));
      // The ranked list behind the text.
      const top = translate.directives(card, { use: 'L', trackId: where.trackId, hasInterests: interests });
      check(`${at}: the top of lesson.directives is translate's ranked list`,
        same(c.lesson.directives.slice(0, translate.MAX_DIRECTIVES).map((d) => [d.stat, d.side, d.text]), top.map((d) => [d.stat, d.side, d.text])));
      // Adaptation: the sides decide() takes.
      const adaptSides = adaptation.confidentSides(translate.directives(card, { use: 'L', trackId: where.trackId, max: 20, hasInterests: interests }));
      check(`${at}: adaptation's sides = contract sides`, same(contract.forAdaptation(c).sides, adaptSides), { contract: c.lesson.sides, adaptation: adaptSides });
      // planForLevel reads its sides from the contract (adaptation.sidesFor), so an
      // interest directive cannot steer a learner who stated no interests.
      const planned = adaptation.sidesFor(u.id, where.trackId ? { track_id: where.trackId, grade_id: where.gradeId } : null);
      check(`${at}: planForLevel's sides (adaptation.sidesFor) = contract sides`, same(planned, contract.forAdaptation(c).sides), { planned, contract: c.lesson.sides });
      if (!interests) check(`${at}: no interest side for a learner who stated no interests`, !('interest_transfer' in planned), planned);
      // Session size and mix: learner.sessionParams moves only by the contract's forSession.
      const prof = learner.getProfile(u.id);
      const base = learner.sessionParams(prof, { scorecard: false });
      const scored = learner.sessionParams(prof);
      const fs2 = contract.forSession(contract.read(u.id, { memory: false }));
      const expectCount = Math.max(5, Math.min(18, Math.round(Math.round(6 + learner.effective(prof, 'practice_density') * 6 + learner.effective(prof, 'session_pacing') * 6) * (1 + fs2.items))));
      check(`${at}: sessionParams moves only by contract.forSession`,
        scored.itemCount === expectCount
        && Math.abs(scored.supportShare - Math.max(0, Math.min(0.35, base.supportShare + fs2.support))) < 1e-9
        && Math.abs(scored.stretchShare - Math.max(0.05, Math.min(contract.stretchMax(), base.stretchShare + fs2.stretch))) < 1e-9
        && scored.preferTypeIn === (base.preferTypeIn || fs2.typed),
        { base, scored, forSession: fs2 });
      // Coach.
      const coachBrief = learner.teachingBrief(u.id, {});
      check(`${at}: the coach's brief carries the contract's coach block`,
        c.coach.promptLines.length ? c.coach.promptLines.every((l) => coachBrief.includes(l)) : !coachBrief.includes(contract.COACH_HEADING));
      // Determinism and privacy.
      const again = contract.read(u.id, where);
      check(`${at}: deterministic (same text, sides, structure on a second read)`,
        again.lesson.promptText === c.lesson.promptText && same(again.lesson.sides, c.lesson.sides) && same(again.structure, c.structure));
      const keys = JSON.stringify(c);
      check(`${at}: no scores, logs or addresses anywhere in it`, !/"(score|measured|log|email|display_name|survey)"\s*:/.test(keys) && !keys.includes('@example.test'));
      check(`${at}: memory never steers a lesson`, c.memory.steers === false && Number.isFinite(c.memory.curve.a));
    }
  }

  console.log('\nwhat the learners got');
  const w = contract.read(writer.id, places[0]);
  check('a learner with confident directives gets lesson lines', w.status === 'ok' && w.lesson.promptLines[0] === contract.LESSON_HEADING, w.lesson.promptLines);
  check('a combined instruction is split back into both sides', w.lesson.sides.step_explicitness === 'high' && w.lesson.sides.brevity_preference === 'high', w.lesson.sides);
  check('each directive says which gate passed it and its probability', w.lesson.directives.every((d) => d.gate && (d.p === null || d.p >= 0.5)), w.lesson.directives.map((d) => [d.stat, d.gate, d.p]));
  const s = contract.read(shaper.id, places[0]);
  check('structure-moving directives move structure', s.structure.changes.length > 0, s.structure);
  check('structure sums what each side changes', same(contract.structureFrom(s.lesson.sides), s.structure));
  check('a structure change is exactly decide()\'s knob for that side',
    s.structure.changes.every((ch) => same(ch.change, contract.knobsNow()[ch.stat][ch.side])));
  check('with the evidence-article switches on, the knobs in force are the default table', same(contract.knobsNow(), adaptation.DIRECTIVE_KNOBS));
  check('a rusher gets no typed-answer switch (P1, SCORECARD_DROP_RUSH_TYPED)', s.lesson.sides.rush_tendency !== 'high' || s.structure.typed === false, s.structure);
  const ci = contract.read(curious.id, places[1]);
  const ni = contract.read(incurious.id, places[1]);
  check('an interest directive needs stated interests (prompt and structure alike)',
    !ni.lesson.directives.some((d) => d.stat === 'interest_transfer') && ni.structure.context === null
    && (ci.lesson.directives.some((d) => d.stat.includes('interest_transfer')) ? ci.structure.context === 'interests' : true),
    { curious: ci.lesson.sides, incurious: ni.lesson.sides });
  // A raw reading the gate does not pass moves nothing: sessionParams used to read
  // attention runway and frustration from the raw score at 40% confidence.
  const wobbly = makeUser('wobbly');
  settle(wobbly.id, 'attention_runway', 5, 4);
  settle(wobbly.id, 'frustration_threshold', 5, 4);
  const wc = contract.read(wobbly.id, { memory: false });
  const wp = learner.getProfile(wobbly.id);
  const raw = learner.stat(wobbly.id, 'attention_runway');
  check('an ungated raw reading (attention runway, frustration) does not move a session',
    !('attention_runway' in wc.lesson.sides) && !('frustration_threshold' in wc.lesson.sides)
    && same(learner.sessionParams(wp), learner.sessionParams(wp, { scorecard: false })),
    { sides: wc.lesson.sides, raw, scored: learner.sessionParams(wp), base: learner.sessionParams(wp, { scorecard: false }) });
  const sp = learner.getProfile(shaper.id);
  const shaped = learner.sessionParams(sp);
  const shapedBase = learner.sessionParams(sp, { scorecard: false });
  check('a confident structure side does move it (shaper: more support)', shaped.supportShare > shapedBase.supportShare, { shaped, shapedBase, sides: s.lesson.sides });
  const b = contract.read(blank.id, places[0]);
  check('a new learner: empty, nothing changes, the default curve', b.status === 'empty' && b.lesson.promptLines.length === 0
    && b.structure.changes.length === 0 && b.memory.curve && b.memory.steers === false);

  console.log('\nfallbacks');
  check('no learner: empty, well formed', contract.read(null).status === 'empty' && contract.validate(contract.read(null)).length === 0);
  const realGet = scorecard.get;
  scorecard.get = () => { throw new Error('storage down'); };
  let f;
  try { f = contract.read(writer.id, places[0]); } finally { scorecard.get = realGet; }
  check('a failure never throws: status fallback, no directives, default curve', f && f.status === 'fallback'
    && f.lesson.directives.length === 0 && f.lesson.promptLines.length === 0 && f.memory.fitted === false && contract.validate(f).length === 0, f && f.status);
  check('the adapters work on a fallback', same(contract.forAdaptation(f).sides, {}) && contract.forPrompt(f).length === 0
    && contract.forCoach(f).length === 0 && contract.forPath(f).skip === false && contract.forSession(f).items === 0);

  db.flush();
  console.log(`\n${failures ? `${failures} failure(s)` : 'all scorecard contract checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('scorecard contract test crashed:', err);
  process.exit(1);
});
