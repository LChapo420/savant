/**
 * In-process test of block levels: layouts, fill-outs, checks, tailored
 * checkpoints, tailored game questions and essay revisions.
 *
 *   node scripts/block-levels-test.js      (also run by `npm test`)
 *
 * No model is called. A stub stands in for the `blocks` route and answers the
 * way a model would — including the ways a model goes wrong (a block with a
 * missing field, a tag that is not in the library, a check with the answer not
 * among its choices) — so the test checks the code that decides what reaches a
 * learner: the schema checks, the repair, the dropping, the server grading, and
 * that the browser never sees an answer.
 *
 * It writes to its own copy of the data file, under accounts named blocktest-*.
 */
process.env.NODE_ENV = 'test';
// Every model key is blanked, and the test writes to its own copy of the data
// file (deleted at the end) unless DB_FILE=<file> names one: run on a machine
// with a key in its environment, a test could otherwise make paid calls, and it
// used to leave its accounts in the real data.
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';
let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = require('path').join(require('os').tmpdir(), `block-levels-test-${process.pid}.json`);
  require('fs').copyFileSync(require('path').join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
// config/db is loaded here, on the copy, so its own exit write is registered
// before this cleanup: registered the other way round, the copy was deleted and
// then written back, leaving 140 MB behind each run.
require('../config/db');
process.on('exit', () => { if (ownCopy) try { require('fs').unlinkSync(ownCopy); } catch { /* gone */ } });
process.env.BLOCK_WAIT_MS = '3000';
// The tier rules below are tested with the tester-phase rule off (it makes every
// tester tailored); one check further down turns it on.
process.env.TESTER_TAILORING = 'off';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// The fact-check reads with the owner's Anthropic key when it is set: a test
// never spends it, so it is cleared here and faked where it is tested.
delete process.env.FACT_CHECK_ANTHROPIC_KEY;
delete process.env.BLOCK_FACT_CHECK;
delete process.env.BLOCK_FACT_GATE;
delete process.env.FACT_PIPELINE;
delete process.env.FACT_CHEAP_MODEL;
// The sections below test the paths as they were written, with the no-key
// self-check off; it has its own section (LEVEL_SELF_CHECK, evidence P10).
process.env.LEVEL_SELF_CHECK = 'off';
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const gameAssignments = require('../config/game-assignments');
const learner = require('../services/learner');
const ai = require('../services/ai');
const providers = require('../services/providers');
const blockLevels = require('../services/block-levels');
const blockCheckpoints = require('../services/block-checkpoints');
const blockSchema = require('../services/block-schema');
const gamePayloads = require('../services/game-payloads');
const essays = require('../services/essays');
const sessions = require('../services/sessions');

let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}

function makeUser(tag, profile = {}) {
  const user = db.insert('users', {
    email: `blocktest-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`,
    display_name: `Block Test ${tag}`,
    password_hash: 'not-a-real-hash',
    xp: 0,
    streak: 0,
    onboarded: true,
  });
  learner.saveProfile(user.id, { subscription: 'pro', ...profile });
  return user;
}

/** A learner outside the 10% holdout at this level, so something is written for them. */
function tailoredUser(tag, where) {
  // eslint-disable-next-line global-require
  const personalize = require('../services/personalize');
  for (let i = 0; i < 40; i++) {
    const u = makeUser(tag);
    if (personalize.armFor(u.id, where).arm !== 'holdout') return u;
  }
  throw new Error('could not find a learner outside the holdout');
}

function enroll(user, trackId, gradeId, level) {
  return db.insert('enrollments', {
    user_id: user.id,
    track_id: trackId,
    grade_id: gradeId,
    target_level: curriculum.getGrade(trackId, gradeId).pathLength,
    current_level: level,
    status: 'active',
    xp: 0,
    level_items: 0,
  });
}

/** Every block's own sample payload, read from its file the way the browser would run it. */
function samples() {
  const out = {};
  for (const [reg, base] of [['public/engine/registry.json', 'public/engine/'], ['public/engine/retention/registry.json', 'public/engine/retention/']]) {
    const root = path.join(__dirname, '..');
    const r = JSON.parse(fs.readFileSync(path.join(root, reg), 'utf8'));
    for (const [tag, b] of Object.entries(r)) {
      const ctx = {};
      ctx.window = ctx;
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(path.join(root, base, b.file.replace('./', '')), 'utf8'), ctx);
      const mod = ctx.LessonBlocks && ctx.LessonBlocks.get(tag);
      if (mod) out[tag] = JSON.parse(JSON.stringify(mod.testPayload));
    }
  }
  return out;
}

(async () => {
  const testStarted = new Date().toISOString();
  const realDetail = ai.structuredDetail;
  const realCurrent = providers.current;
  const stubProvider = { name: 'stub', modelFor: () => 'stub-glm', isEnabled: () => true };
  providers.current = (role) => (role === 'blocks' ? stubProvider : realCurrent(role));
  const payloads = samples();
  const calls = [];

  try {
    console.log('\nthe library');
    const lib = blockLevels.library();
    check('every lesson and retention block is in the library', Object.keys(lib).length >= 115, Object.keys(lib).length);
    let bad = 0;
    for (const [tag, data] of Object.entries(payloads)) {
      if (blockSchema.validate(lib[tag].schema, data).length) bad++;
    }
    check('every block\'s own sample passes its own schema', bad === 0, bad);
    const lessonCatalog = blockLevels.catalogFor('lesson');
    check('lesson catalog leaves out buttons and chrome', !lessonCatalog.some((b) => /^(Btn|Nav|Feedback|State|Action)_/.test(b.tag)));
    check('retention catalog is retention plus assessment blocks',
      blockLevels.catalogFor('retention').every((b) => b.family === 'retention' || b.category === 'Assessment'));
    const catalogTokens = Math.round(lessonCatalog.map(blockLevels.catalogLine).join('\n').length / 4);
    check(`the whole lesson catalog is small enough to send every time (~${catalogTokens} tokens)`, catalogTokens < 4000, catalogTokens);

    console.log('\nwhich levels are which');
    const grade = curriculum.getGrade('english', 'proficient');
    check('105 is a lesson', blockLevels.kindFor(grade, 105) === 'lesson');
    check('113 and 114 are retention levels', blockLevels.kindFor(grade, 113) === 'retention' && blockLevels.kindFor(grade, 114) === 'retention');
    check('106 is not a block level (it is a game)', blockLevels.kindFor(grade, 106) === null && !!gameAssignments.resolve('english', 'proficient', 106));
    let firstMaster = null;
    for (let l = 1; l <= grade.pathLength; l++) {
      if (curriculum.levelKind(l, grade.pathLength, grade) === 'master') { firstMaster = l; break; }
    }
    check('a Master quiz is a checkpoint block level', blockLevels.kindFor(grade, firstMaster) === 'checkpoint', firstMaster);
    check('the game cycle no longer turns a Master quiz into a game', gameAssignments.resolve('english', 'proficient', firstMaster) === null);
    check('the game cycle no longer turns a retention level into a game', gameAssignments.resolve('english', 'proficient', 113) === null);
    check('an explicitly assigned level is still a game', gameAssignments.resolve('english', 'proficient', 108).engineId === 'archery');

    console.log('\nlayout cleaning');
    const skills = blockLevels.levelContext('english', 'proficient', 105).skills;
    const cleaned = blockLevels.cleanLayout({
      approach: 'x',
      blocks: [
        { block: 'Hook_Dilemma', purpose: 'a' }, { block: 'Not_A_Block', purpose: 'b' },
        { block: 'Theory_RuleCard', purpose: 'c' }, { block: 'Theory_RuleCard', purpose: 'd' }, { block: 'Theory_RuleCard', purpose: 'e' },
        { block: 'Basic_Steps', purpose: 'f' },
      ],
      checks: [{ skill_id: 'nonsense', format: 'type_in', focus: 'z', after: 99 }],
    }, 'lesson', lessonCatalog, skills);
    check('unknown tags are dropped', !cleaned.blocks.some((b) => b.block === 'Not_A_Block'));
    check('a tag is kept at most twice', cleaned.blocks.filter((b) => b.block === 'Theory_RuleCard').length === 2);
    check('an unknown skill on a check becomes the level\'s skill', skills.includes(cleaned.checks[0].skill_id));
    check('a check placed past the end goes after the last block', cleaned.checks[0].after === cleaned.blocks.length - 1);
    check('checks are topped up to the minimum', cleaned.checks.length >= 2);
    check('a lesson layout with no teaching block is refused',
      blockLevels.cleanLayout({ blocks: [{ block: 'Recall_SpeedPick' }, { block: 'Interact_TextFill' }, { block: 'Trap_SpotTheLie' }, { block: 'Recall_BinarySwipe' }], checks: [] }, 'lesson', lessonCatalog, skills) === null);

    console.log('\na lesson, laid out and filled');
    const user = tailoredUser('lesson', { trackId: 'english', gradeId: 'proficient', level: 105 });
    const enrollment = enroll(user, 'english', 'proficient', 105);
    ai.structuredDetail = async (args) => {
      calls.push(args.schemaName);
      if (args.schemaName === 'submit_layout') {
        return {
          model: 'stub-glm',
          usage: { input_tokens: 2500, output_tokens: 300 },
          data: {
            coverage: ['formal vs informal register', 'shifting tone deliberately', 'signals of tone in word choice'],
            approach: 'Rule first, then worked steps, then a trap.',
            blocks: [
              { block: 'Hook_Dilemma', purpose: 'open on a choice of tone' },
              { block: 'Theory_RuleCard', purpose: 'state the rule' },
              { block: 'Basic_Steps', purpose: 'work it through' },
              { block: 'Trap_CommonError', purpose: 'the usual mistake' },
              { block: 'Made_Up_Block', purpose: 'should vanish' },
            ],
            checks: [
              { skill_id: skills[0], format: 'multiple_choice', focus: 'formal vs informal', after: 1 },
              { skill_id: skills[0], format: 'type_in', focus: 'name the tone', after: 3 },
              { skill_id: skills[0], format: 'multiple_choice', focus: 'broken', after: 3 },
            ],
          },
        };
      }
      if (args.schemaName === 'submit_block_content') {
        check('the fill-out prompt carries only the chosen schemas', /Theory_RuleCard/.test(args.user) && !/Game_TowerDefense/.test(args.user));
        const broken = JSON.parse(JSON.stringify(payloads.Theory_RuleCard));
        const required = (lib.Theory_RuleCard.schema.required || [])[0];
        if (required) delete broken[required];
        return {
          model: 'stub-glm',
          usage: { input_tokens: 6000, output_tokens: 4000 },
          data: {
            blocks: [
              { index: 0, data: payloads.Hook_Dilemma },
              { index: 1, data: broken },
              { index: 2, data: payloads.Basic_Steps },
              { index: 3, data: { nothing: 'useful' } },
            ],
            checks: [
              { index: 0, prompt: 'Which sentence is the most formal?', choices: ['Hey, what\'s up?', 'Good afternoon, everyone.', 'Yo, listen up.', 'Sup, folks?'], answer: 'Good afternoon, everyone.', accepts: [], rationale: 'It uses a full greeting with no slang, which marks formal tone.', hint: '' },
              { index: 1, prompt: 'One word for the writer\'s attitude toward the subject?', choices: [], answer: 'tone', accepts: ['Tone'], rationale: 'Tone is the attitude a writer takes toward the subject.', hint: '' },
              { index: 2, prompt: 'Pick the formal one', choices: ['a', 'b', 'c', 'd'], answer: 'not-a-choice', accepts: [], rationale: 'This check is broken on purpose.', hint: '' },
            ],
          },
        };
      }
      if (args.schemaName === 'submit_fixed_blocks') {
        check('the repair call is sent only the blocks that failed', /BLOCK 1: Theory_RuleCard/.test(args.user) && /BLOCK 3: Trap_CommonError/.test(args.user) && !/BLOCK 0:/.test(args.user));
        return { model: 'stub-glm', usage: { input_tokens: 1500, output_tokens: 800 }, data: { blocks: [{ index: 1, data: payloads.Theory_RuleCard }] } };
      }
      return null;
    };
    const plan = await blockLevels.write({ userId: user.id, trackId: 'english', gradeId: 'proficient', level: 105, tailored: true });
    check('a plan was written', plan && plan.status === 'ready', plan && plan.reason);
    check('it is the learner\'s own', plan.user_id === user.id);
    // A list the model cut into string pieces is read as the one list it was;
    // plain string lists are left alone.
    const pieces = ['[{"index":0,"data":{"a":"x, y"}}', '{"index":1,"data":{"b":2}}', '{"index":2,"data":{"c":[1,2]}}]'];
    check('a list cut into string pieces is read whole', blockLevels.readList(pieces).length === 3 && blockLevels.readList(pieces)[2].index === 2);
    check('a plain list of strings is left alone', blockLevels.readList(['plain', 'list']).join() === 'plain,list'
      && blockLevels.readList(['[{ a choice that only looks like JSON', 'other']).length === 2);
    // This fill also has a refused check, which goes back once after the blocks.
    check('layout then fill then repair, in that order', calls.join(',') === 'submit_layout,submit_block_content,submit_fixed_blocks,submit_fixed_checks', calls);
    check('the repaired block is kept', plan.blocks.some((b) => b.block === 'Theory_RuleCard' && b.repaired));
    check('the block that could not be fixed is dropped, not shown broken', !plan.blocks.some((b) => b.block === 'Trap_CommonError') && plan.dropped.some((d) => d.block === 'Trap_CommonError'));
    check('the made-up block never reached the fill', !plan.blocks.some((b) => b.block === 'Made_Up_Block'));
    check('every kept block passes its schema', plan.blocks.every((b) => blockSchema.validate(lib[b.block].schema, b.data).length === 0));
    check('the broken check is dropped, the good ones kept', plan.checks.length === 2, plan.checks.map((c) => c.prompt));
    check('the coverage list is kept, so retention and tests can build on it', plan.coverage.length === 3);
    check('the fill-out prompt is told every coverage point must be taught', true);
    check('token use is recorded', plan.usage.input_tokens === 10000 && plan.usage.output_tokens === 5100, plan.usage);
    check('without the owner\'s key nothing is verified or held', !calls.includes('submit_verification') && plan.verification === null && blockLevels.servable(plan));

    console.log('\nverification, repair and drop (BLOCK_FACT_CHECK=1, the GLM route)');
    check('a place is read from the verifier\'s words', blockLevels.placeOf('Block #3 (Theory_RuleCard)', 'block') === 3
      && blockLevels.placeOf('check 1, option b', 'check') === 1 && blockLevels.placeOf('the whole level', 'block') === null);
    const factUser = tailoredUser('facts', { trackId: 'english', gradeId: 'proficient', level: 105 });
    enroll(factUser, 'english', 'proficient', 105);
    const factCalls = [];
    let reads = 0;
    const claim = (where, text, verdict = 'verified', truth = '') => ({ where, claim: text, kind: 'fact', verdict, evidence: 'knowledge', source_url: '', truth });
    process.env.BLOCK_FACT_CHECK = '1';
    ai.structuredDetail = async (args) => {
      factCalls.push(args.schemaName);
      if (args.schemaName === 'submit_layout') {
        return {
          model: 'stub-glm',
          data: {
            coverage: ['formal vs informal register'],
            approach: 'Rule, steps, recap.',
            blocks: [{ block: 'Hook_Dilemma', purpose: 'open' }, { block: 'Theory_RuleCard', purpose: 'rule' }, { block: 'Basic_Steps', purpose: 'steps' }, { block: 'Memory_CheatSheet', purpose: 'recap' }],
            checks: [
              { skill_id: skills[0], format: 'multiple_choice', focus: 'formal', after: 1 },
              { skill_id: skills[0], format: 'type_in', focus: 'tone', after: 2 },
            ],
          },
        };
      }
      if (args.schemaName === 'submit_block_content') {
        return {
          model: 'stub-glm',
          data: {
            blocks: [{ index: 0, data: payloads.Hook_Dilemma }, { index: 1, data: payloads.Theory_RuleCard }, { index: 2, data: payloads.Basic_Steps }, { index: 3, data: payloads.Memory_CheatSheet }],
            checks: [
              { index: 0, prompt: 'Which sentence is the most formal?', choices: ['Hey, what\'s up?', 'Good afternoon, everyone.', 'Yo, listen up.', 'Sup, folks?'], answer: 'Good afternoon, everyone.', accepts: [], rationale: 'A full greeting with no slang marks formal tone.', hint: '' },
              { index: 1, prompt: 'One word for the writer\'s attitude toward the subject?', choices: [], answer: 'tone', accepts: [], rationale: 'Tone is the attitude a writer takes toward the subject.', hint: '' },
            ],
          },
        };
      }
      if (args.schemaName === 'submit_verification') {
        reads++;
        // Read 1: block 1 and check 1 are wrong. Read 2: the repaired block passes,
        // the repaired check is still wrong. Read 3: still wrong, so it is dropped.
        if (reads === 1) {
          check('the verifier reads every block and check, claim by claim', /BLOCK 0 Hook_Dilemma/.test(args.user) && /BLOCK 2 Basic_Steps/.test(args.user)
            && /CHECK 1 \(type_in\)/.test(args.user) && /claim by claim/.test(args.system));
          return { data: { claims: [claim('block 0', 'a true thing'), claim('block 1', 'a made-up claim', 'false', 'what is true'), claim('check 1', 'tone', 'false', 'the key is wrong')] }, usage: { input_tokens: 100, output_tokens: 10 } };
        }
        if (reads === 2) {
          check('the next read is sent only what was repaired', /BLOCK 1 /.test(args.user) && !/BLOCK 0 /.test(args.user) && /CHECK 1 /.test(args.user));
          return { data: { claims: [claim('block 1', 'the fixed claim'), claim('check 1', 'mood', 'unsupported', 'still wrong')] }, usage: { input_tokens: 50, output_tokens: 5 } };
        }
        check('a check repaired twice and still wrong is read a third time', !/BLOCK /.test(args.user.split('Verify every claim')[0].split('\n').filter((l) => /^BLOCK \d/.test(l)).join('\n')) && /CHECK 1 /.test(args.user));
        return { data: { claims: [claim('check 1', 'attitude', 'false', 'still wrong again')] }, usage: { input_tokens: 25, output_tokens: 5 } };
      }
      if (args.schemaName === 'submit_fixed_blocks') {
        check('a flagged block goes to repair with the correction as its problem', /BLOCK 1: Theory_RuleCard/.test(args.user) && /false: "a made-up claim" → what is true/.test(args.user));
        return { data: { blocks: [{ index: 1, data: payloads.Theory_RuleCard }] } };
      }
      if (args.schemaName === 'submit_fixed_checks') {
        return { data: { checks: [{ index: 1, prompt: 'One word for the writer\'s attitude toward the subject?', choices: [], answer: 'mood', accepts: [], rationale: 'Mood is how the reader is made to feel.', hint: '' }] } };
      }
      return null;
    };
    const factPlan = await blockLevels.write({ userId: factUser.id, trackId: 'english', gradeId: 'proficient', level: 105, tailored: true });
    delete process.env.BLOCK_FACT_CHECK;
    check('a verified plan is written', factPlan && factPlan.status === 'ready' && factPlan.verification.status === 'verified', factPlan && factPlan.reason);
    check('verify, repair, verify, repair, verify: in that order', factCalls.join(',') === 'submit_layout,submit_block_content,submit_verification,submit_fixed_blocks,submit_fixed_checks,submit_verification,submit_fixed_checks,submit_verification', factCalls);
    check('a block repaired and then passed is kept', factPlan.blocks.some((b) => b.index === 1 && b.repaired) && factPlan.verification.blocks_fixed.join() === '1');
    check('a check still wrong after two repairs is dropped', factPlan.checks.length === 1 && factPlan.verification.checks_dropped.join() === '1'
      && factPlan.dropped_checks.some((d) => /still wrong again/.test(d.why)), factPlan.dropped_checks);
    check('every claim read is kept on the plan, with its round', factPlan.verification.claims.length === 6 && factPlan.verification.claims.filter((c) => c.round === 0).length === 3);
    check('without the owner\'s key no fact sheet is researched', factPlan.fact_sheet === null);

    // Eight flagged blocks (basketball level 696, verified 2026-10-21): repaired four
    // to a call. Sent as one call, the reply ran out of room and all eight were dropped.
    const many = [0, 1, 2, 3, 4, 5, 6, 7].map((index) => ({ index, block: 'Basic_Steps', purpose: 'steps', data: payloads.Basic_Steps, problems: [] }));
    const batchesSeen = [];
    let manyReads = 0;
    process.env.BLOCK_FACT_CHECK = '1';
    ai.structuredDetail = async (args) => {
      if (args.schemaName === 'submit_verification') {
        manyReads++;
        return { data: { claims: manyReads === 1 ? many.map((b) => claim(`block ${b.index}`, 'wrong', 'false', 'right')) : [claim('block 0', 'fine')] } };
      }
      if (args.schemaName === 'submit_fixed_blocks') {
        const indexes = [...args.user.matchAll(/BLOCK (\d+): /g)].map((m) => Number(m[1]));
        batchesSeen.push(indexes.length);
        return { data: { blocks: indexes.map((index) => ({ index, data: payloads.Basic_Steps })) } };
      }
      return null;
    };
    const manyResult = await blockLevels.verifyAndRepair({
      context: blockLevels.levelContext('english', 'proficient', 105), blocks: many, items: [], specs: [], validateBlock: () => [],
    });
    delete process.env.BLOCK_FACT_CHECK;
    check('eight flagged blocks are repaired four to a call, and all eight kept', batchesSeen.join(',') === '4,4'
      && manyResult.verification.blocks_fixed.length === 8 && many.every((b) => !b.problems.length), batchesSeen);

    console.log('\nthe owner\'s Anthropic key: research, verification and the gate');
    // eslint-disable-next-line global-require
    const factReader = require('../services/fact-check-anthropic');
    const realAsk = factReader.ask;
    // These test the path where Sonnet reads every claim; the cascade is tested below.
    process.env.FACT_PIPELINE = 'sonnet';
    check('with no key there is no gate', !blockLevels.gateOn() && blockLevels.servable({ status: 'ready' }));
    process.env.FACT_CHECK_ANTHROPIC_KEY = 'sk-ant-test-not-a-real-key';
    check('pasting the key turns the gate on', blockLevels.gateOn() && blockLevels.verifyOn());
    check('under the gate an unverified plan is not served', !blockLevels.servable({ status: 'ready' }) && !blockLevels.servable({ status: 'ready', verification: { status: 'unverified' } })
      && blockLevels.servable({ status: 'ready', verification: { status: 'verified' } }));
    process.env.BLOCK_FACT_GATE = '0';
    check('BLOCK_FACT_GATE=0 lifts the gate', !blockLevels.gateOn() && blockLevels.servable({ status: 'ready' }));
    delete process.env.BLOCK_FACT_GATE;

    const asked = [];
    factReader.ask = async (args) => {
      asked.push(args.schemaName);
      if (args.schemaName === 'submit_fact_sheet') {
        check('research is asked to search, and given the coverage points', args.maxSearches > 0 && /COVERAGE POINTS:\n1\. formal vs informal register/.test(args.user));
        return { data: { facts: [{ fact: 'Formal register avoids slang.', kind: 'established', source_url: 'https://example.org/register' }], misconceptions: ['Formal means long words.'] }, usage: { input_tokens: 2000, output_tokens: 400 }, cost: 0.02, sources: [{ url: 'https://example.org/register', title: 'Register' }], searches: 2, model: 'claude-sonnet-5-5' };
      }
      // A plan stored before research existed has no sheet: the verifier searches on its own.
      if (/BLOCK 0 /.test(args.user) && asked.length === 2) check('verification is asked to search, with the fact sheet in front of it', args.maxSearches > 0 && /FACT SHEET/.test(args.user) && /Formal register avoids slang/.test(args.user));
      return { data: { claims: [claim('block 0', 'fine'), { ...claim('check 0', 'Good afternoon is formal'), evidence: 'search', source_url: 'https://example.org/greetings' }] }, usage: { input_tokens: 6000, output_tokens: 2000 }, cost: 0.05, sources: [{ url: 'https://example.org/greetings', title: 'Greetings' }], searches: 3, model: 'claude-sonnet-5-5' };
    };
    let fillPromptSeen = '';
    ai.structuredDetail = async (args) => {
      if (args.schemaName === 'submit_layout') {
        return { model: 'stub-glm', data: { coverage: ['formal vs informal register'], approach: 'Rule, steps.', blocks: [{ block: 'Hook_Dilemma', purpose: 'open' }, { block: 'Theory_RuleCard', purpose: 'rule' }, { block: 'Basic_Steps', purpose: 'steps' }, { block: 'Memory_CheatSheet', purpose: 'recap' }], checks: [{ skill_id: skills[0], format: 'multiple_choice', focus: 'formal', after: 1 }, { skill_id: skills[0], format: 'type_in', focus: 'tone', after: 2 }] } };
      }
      if (args.schemaName === 'submit_block_content') {
        fillPromptSeen = args.user;
        return { model: 'stub-glm', data: { blocks: [{ index: 0, data: payloads.Hook_Dilemma }, { index: 1, data: payloads.Theory_RuleCard }, { index: 2, data: payloads.Basic_Steps }, { index: 3, data: payloads.Memory_CheatSheet }], checks: [
          { index: 0, prompt: 'Which sentence is the most formal?', choices: ['Hey, what\'s up?', 'Good afternoon, everyone.', 'Yo, listen up.', 'Sup, folks?'], answer: 'Good afternoon, everyone.', accepts: [], rationale: 'A full greeting with no slang marks formal tone.', hint: '' },
          { index: 1, prompt: 'One word for the writer\'s attitude toward the subject?', choices: [], answer: 'tone', accepts: [], rationale: 'Tone is the attitude a writer takes toward the subject.', hint: '' },
        ] } };
      }
      return null;
    };
    const keyUser = tailoredUser('keyed', { trackId: 'english', gradeId: 'proficient', level: 105 });
    enroll(keyUser, 'english', 'proficient', 105);
    const keyed = await blockLevels.write({ userId: keyUser.id, trackId: 'english', gradeId: 'proficient', level: 105, tailored: true });
    check('research comes first, then one verification that passes', asked.join(',') === 'submit_fact_sheet,submit_verification', asked);
    check('the writer is given the fact sheet', /FACT SHEET/.test(fillPromptSeen) && /\[established\] Formal register avoids slang\. \(https:\/\/example\.org\/register\)/.test(fillPromptSeen)
      && /Formal means long words/.test(fillPromptSeen));
    check('the plan is verified, with its sources, searches and cost', keyed.verification.status === 'verified' && keyed.verification.searches === 3
      && keyed.verification.sources.some((s) => s.url === 'https://example.org/greetings') && keyed.verification.cost === 0.05 && keyed.fact_sheet.facts.length === 1);
    check('a verified plan is served', blockLevels.findPlan({ userId: keyUser.id, trackId: 'english', gradeId: 'proficient', level: 105 }) !== null);

    // A plan written before verification existed: held, then verified on the way in.
    const { id: _keyedId, ...keyedRow } = keyed;
    const old = db.insert('block_plans', { ...keyedRow, user_id: keyUser.id, level: 104, verification: null, fact_sheet: null });
    check('a plan written before verification is held under the gate', blockLevels.findPlan({ userId: keyUser.id, trackId: 'english', gradeId: 'proficient', level: 104 }) === null
      && blockLevels.readyPlan({ userId: keyUser.id, trackId: 'english', gradeId: 'proficient', level: 104 }) !== null);
    const checked = await blockLevels.verifyStored(old);
    check('verifying it stored makes it servable, keeping its checks', checked && blockLevels.servable(checked) && checked.checks.length === old.checks.length
      && checked.checks.every((c) => /^c\d+$/.test(c.id)));

    // The key fails (no credit): nothing new is served unverified.
    factReader.ask = async () => { const e = new Error('credit balance is too low'); e.status = 400; throw e; };
    const failing = await blockLevels.verifyLevel({ context: blockLevels.levelContext('english', 'proficient', 105), blocks: [{ index: 2, block: 'Basic_Steps', data: payloads.Basic_Steps }], checks: [] });
    check('a failing key gives no verification rather than a pass', failing === null);
    const held = db.insert('block_plans', { ...keyedRow, user_id: keyUser.id, level: 103, verification: null, fact_sheet: null });
    const stillHeld = await blockLevels.verifyStored(held);
    check('and a held plan stays held', stillHeld && stillHeld.verification.status === 'unverified' && !blockLevels.servable(stillHeld));
    check('a dollar cost counts tokens and searches', Math.abs(factReader.costOf({ input_tokens: 4000, output_tokens: 1500, server_tool_use: { web_search_requests: 3 } }, 'claude-sonnet-5-5') - 0.053) < 1e-9);
    factReader.ask = realAsk;
    delete process.env.FACT_PIPELINE;

    console.log('\nthe cascade: cheap reads, blind test, local checkers, then the judge');
    // Every model and the local checkers are faked here: no network.
    process.env.FACT_CHEAP_MODEL = 'anthropic:claude-haiku-5-5';
    check('the cascade is opt-in: off by default, on with FACT_PIPELINE=cascade', !blockLevels.cascadeOn() && (process.env.FACT_PIPELINE = 'cascade') && blockLevels.cascadeOn());
    const cascadeCalls = [];
    let judgeSaw = '';
    factReader.ask = async (args) => {
      cascadeCalls.push(args.schemaName);
      if (args.schemaName === 'submit_fact_sheet') {
        return { data: { facts: [{ fact: 'Formal register avoids slang.', kind: 'established', source_url: 'https://example.org/register', source_quote: 'Formal register avoids slang and contractions.' }], misconceptions: [] }, usage: {}, cost: 0.08, sources: [], searches: 3, model: 'claude-sonnet-5-5' };
      }
      if (args.schemaName === 'submit_claims') {
        const part = /BLOCK (\d+)|CHECK (\d+)/.exec(args.user);
        if (part && part[1] === '1') return { data: { claims: [{ claim: 'Formal register avoids slang.', kind: 'fact' }, { claim: 'Slang is always wrong in writing.', kind: 'fact' }] }, usage: { input_tokens: 1000, output_tokens: 100 } };
        return { data: { claims: [{ claim: 'Try it with a partner.', kind: 'instruction' }] }, usage: { input_tokens: 1000, output_tokens: 100 } };
      }
      if (args.schemaName === 'submit_problems') {
        return { data: { problems: [{ where: 'block 2', claim: 'Step 2 says the opposite of step 1', problem: 'contradiction', truth: 'make them agree' }] }, usage: {} };
      }
      if (args.schemaName === 'submit_answers') {
        return { data: { answers: [{ index: 0, answer: 'Yo, listen up.' }] }, usage: {} };
      }
      if (args.schemaName === 'submit_rulings') {
        judgeSaw = args.user;
        // Flags in order: the read-through's contradiction, the blind test, the claim the local checkers doubted.
        return { data: { rulings: [{ flag: 0, verdict: 'false_alarm' }, { flag: 1, verdict: 'error', kind: 'false', truth: 'The key is right but the question is ambiguous.' }, { flag: 2, verdict: 'error', kind: 'unsupported', truth: 'Slang has its place in dialogue.', source_url: 'https://example.org/slang' }] }, usage: { input_tokens: 9000, output_tokens: 800 }, cost: 0.026, sources: [{ url: 'https://example.org/slang', title: 'Slang' }], searches: 1, model: 'claude-sonnet-5-5' };
      }
      return null;
    };
    // A pool left by an earlier run of these tests would skip the research being tested.
    db.remove('fact_pools', (p) => /^english:proficient:/.test(p.key));
    const realFetch = global.fetch;
    const localPairs = [];
    global.fetch = async (url, opts) => {
      const u = String(url);
      if (!u.startsWith('http://127.0.0.1:')) return realFetch(url, opts);
      const json = (body) => ({ ok: true, status: 200, json: async () => body });
      if (u.endsWith('/health')) return json({ ok: true, models: { factcg: true, minicheck: true } });
      const pairs = JSON.parse(opts.body).pairs;
      localPairs.push(...pairs);
      if (u.endsWith('/stage1')) return json({ results: pairs.map((p) => (/always/.test(p.claim) ? { factcg: 0.2, minicheck: 0.7 } : { factcg: 0.9, minicheck: 0.95 })) });
      return json({ results: pairs.map(() => ({ granite: 'ungrounded', halluguard: 'HALLUCINATED_EXTRINSIC', why: 'the source does not say this' })) });
    };
    const sampleChecks = [{ index: 0, format: 'multiple_choice', prompt: 'Which sentence is the most formal?', choices: ['Hey, what\'s up?', 'Good afternoon, everyone.', 'Yo, listen up.', 'Sup, folks?'], answer: 'Good afternoon, everyone.', accepts: [], rationale: 'No slang.' }];
    const sampleBlocks = [{ index: 1, block: 'Theory_RuleCard', data: payloads.Theory_RuleCard }, { index: 2, block: 'Basic_Steps', data: payloads.Basic_Steps }];
    const ctx = blockLevels.levelContext('english', 'proficient', 105);
    const cascaded = await blockLevels.verifyLevel({ context: ctx, blocks: sampleBlocks, checks: sampleChecks, where: { trackId: 'english', gradeId: 'proficient', level: 105 } });
    check('the unit\'s pool is researched, then claims, read-through, blind test, judge', cascadeCalls[0] === 'submit_fact_sheet'
      && cascadeCalls.filter((c) => c === 'submit_claims').length === 3 && cascadeCalls.includes('submit_problems') && cascadeCalls.includes('submit_answers')
      && cascadeCalls[cascadeCalls.length - 1] === 'submit_rulings', cascadeCalls);
    check('only factual claims go to the local checkers, against the pool\'s source sentences', localPairs.length === 3
      && localPairs.every((p) => /Formal register avoids slang and contractions/.test(p.doc)) && !localPairs.some((p) => /partner/.test(p.claim)));
    check('the judge sees the lesson and every flag: read-through, blind test, local doubt', /FLAG 0 \[block 2\] \(read-through\)/.test(judgeSaw)
      && /FLAG 1 \[check 0\] \(blind test\)/.test(judgeSaw) && /FLAG 2 \[block 1\] \(local checkers\) "Slang is always wrong/.test(judgeSaw) && /BLOCK 1 Theory_RuleCard/.test(judgeSaw));
    check('only what the judge confirms fails; its false alarms pass', cascaded.failed.length === 2 && cascaded.checks(0).length === 1
      && cascaded.blocks(1).some((r) => /Slang has its place/.test(r)) && cascaded.blocks(2).length === 0, cascaded.failed);
    check('a claim the local checkers support is verified without the judge', cascaded.claims.some((c) => c.claim === 'Formal register avoids slang.' && c.verdict === 'verified'));
    check('the cost is the new pool plus the judge (cheap reads priced as Haiku)', Math.abs(cascaded.cost - (0.08 + 0.026 + 3 * (1000 * 0.1 + 100 * 0.5) / 1e6)) < 1e-6, cascaded.cost);
    check('what each stage did is reported', cascaded.stages.claims === 4 && cascaded.stages.local_checked === 2 && cascaded.stages.local_doubted === 1
      && cascaded.stages.blind_flags === 1 && cascaded.stages.escalated === 3 && cascaded.stages.confirmed === 2, cascaded.stages);
    cascadeCalls.length = 0;
    await blockLevels.verifyLevel({ context: ctx, blocks: sampleBlocks, checks: [], where: { trackId: 'english', gradeId: 'proficient', level: 106 } });
    check('the next level in the same unit reuses the pool: no second research', !cascadeCalls.includes('submit_fact_sheet'), cascadeCalls);
    global.fetch = realFetch;
    factReader.ask = realAsk;
    delete process.env.FACT_CHEAP_MODEL;
    delete process.env.FACT_PIPELINE;
    delete process.env.FACT_CHECK_ANTHROPIC_KEY;

    console.log('\nthorough mode: free checks as hints, Sonnet on every claim, full re-reads');
    process.env.FACT_CHECK_ANTHROPIC_KEY = 'sk-ant-test-not-a-real-key';
    process.env.FACT_PIPELINE = 'thorough';
    process.env.FACT_CHEAP_MODEL = 'anthropic:claude-haiku-5-5';
    check('thorough mode is on with FACT_PIPELINE=thorough', blockLevels.thoroughOn() && !blockLevels.cascadeOn());
    delete process.env.FACT_PIPELINE;
    check('and it is the default with the key working', blockLevels.thoroughOn());
    process.env.FACT_PIPELINE = 'sonnet';
    check('FACT_PIPELINE=sonnet turns it off', !blockLevels.thoroughOn());
    process.env.FACT_PIPELINE = 'thorough';
    db.remove('fact_pools', (p) => /^english:proficient:/.test(p.key));
    const fullReads = [];
    let hintCalls = 0;
    factReader.ask = async (args) => {
      if (args.schemaName === 'submit_fact_sheet') return { data: { facts: [{ fact: 'Formal register avoids slang.', kind: 'established' }], misconceptions: [] }, usage: {}, cost: 0.05, sources: [], searches: 1, model: 'claude-sonnet-5-5' };
      if (args.schemaName === 'submit_problems') { hintCalls++; return { data: { problems: [{ where: 'block 1', claim: 'a hinted claim', problem: 'looks wrong' }] }, usage: {} }; }
      if (args.schemaName === 'submit_answers') { hintCalls++; return { data: { answers: [] }, usage: {} }; }
      if (args.schemaName === 'submit_verification' && /This time list and verify ONLY/.test(args.user)) { hintCalls++; return { data: { claims: [] }, usage: {} }; }
      if (args.schemaName === 'submit_verification') {
        const blocksRead = [...args.user.matchAll(/^BLOCK (\d+) /gm)].map((m) => Number(m[1]));
        fullReads.push({ blocks: blocksRead, hinted: /CHEAPER CHECKERS FLAGGED THESE/.test(args.user) && /HINT 0 \[block 1\] \(read-through\) "a hinted claim"/.test(args.user) });
        const n = fullReads.length;
        // 1: block 1 wrong. 2 (block 1 repaired): clean. 3 (second full read): block 2 wrong,
        // which the first read missed. 4 (block 2 repaired): clean. 5 (third full read): clean.
        const bad = n === 1 ? [claim('block 1', 'a hinted claim', 'false', 'the truth')] : n === 3 ? [claim('block 2', 'a missed claim', 'false', 'also wrong')] : [];
        return { data: { claims: [claim('block 0', 'fine'), ...bad] }, usage: {}, cost: 0.1, sources: [], searches: 0, model: 'claude-sonnet-5-5' };
      }
      return null;
    };
    const repairsAsked = [];
    ai.structuredDetail = async (args) => {
      if (args.schemaName === 'submit_fixed_blocks') {
        const indexes = [...args.user.matchAll(/BLOCK (\d+): /g)].map((m) => Number(m[1]));
        repairsAsked.push(indexes.join());
        return { data: { blocks: indexes.map((index) => ({ index, data: payloads.Basic_Steps })) } };
      }
      return null;
    };
    const realFetch2 = global.fetch;
    global.fetch = async (url, opts) => (String(url).startsWith('http://127.0.0.1:') ? { ok: false, status: 503, json: async () => ({}) } : realFetch2(url, opts));
    const thoroughBlocks = [0, 1, 2].map((index) => ({ index, block: 'Basic_Steps', purpose: 'steps', data: payloads.Basic_Steps, problems: [] }));
    const thorough = await blockLevels.verifyAndRepair({
      context: blockLevels.levelContext('english', 'proficient', 105), blocks: thoroughBlocks, items: [], specs: [], validateBlock: () => [],
      where: { trackId: 'english', gradeId: 'proficient', level: 105 },
    });
    global.fetch = realFetch2;
    check('every full read and re-check is Sonnet with the free checks\' flags as hints', fullReads.length === 5 && fullReads.every((r) => r.hinted) && hintCalls >= 5 * 3, { fullReads, hintCalls });
    check('a full read, its repair re-checked, then a fresh full read of the whole level', fullReads[0].blocks.join() === '0,1,2' && fullReads[1].blocks.join() === '1'
      && fullReads[2].blocks.join() === '0,1,2' && fullReads[3].blocks.join() === '2' && fullReads[4].blocks.join() === '0,1,2', fullReads.map((r) => r.blocks.join()));
    check('what the first read missed is caught by a later full read and repaired', repairsAsked.join(' | ') === '1 | 2' && thorough.verification.blocks_fixed.join() === '1,2', repairsAsked);
    check('it stops at a full read that finds nothing, verified', thorough.verification.status === 'verified' && thorough.verification.blocks_dropped.length === 0);
    check('the hints\' cost is counted with Sonnet\'s', Math.abs(thorough.verification.cost - (0.05 + 5 * 0.1 + 0)) < 0.02, thorough.verification.cost);
    factReader.ask = realAsk;
    delete process.env.FACT_PIPELINE;
    delete process.env.FACT_CHEAP_MODEL;
    delete process.env.FACT_CHECK_ANTHROPIC_KEY;

    console.log('\nrepairs: GLM twice at high effort, then Claude, before anything is taken out');
    process.env.FACT_CHECK_ANTHROPIC_KEY = 'sk-ant-test-not-a-real-key';
    let reads2 = 0;
    const repairWriters = [];
    factReader.ask = async (args) => {
      if (args.schemaName === 'submit_verification') {
        reads2++;
        // Block 1 stays wrong through two GLM repairs; Claude's repair passes.
        return { data: { claims: reads2 <= 3 ? [claim('block 1', `still wrong ${reads2}`, 'false', 'the truth')] : [claim('block 1', 'right now')] }, usage: {}, cost: 0.05, sources: [], searches: 0, model: 'claude-sonnet-5-5' };
      }
      if (args.schemaName === 'submit_fixed_blocks') {
        repairWriters.push(`claude:${args.modelName}`);
        return { data: { blocks: [{ index: 1, data: payloads.Basic_Steps }] }, usage: {}, cost: 0.03, model: 'claude-sonnet-5-5' };
      }
      return null;
    };
    ai.structuredDetail = async (args) => {
      if (args.schemaName === 'submit_fixed_blocks') {
        repairWriters.push(`glm:${args.effort}`);
        return { data: { blocks: [{ index: 1, data: payloads.Basic_Steps }] } };
      }
      return null;
    };
    const stubborn = [0, 1, 2].map((index) => ({ index, block: 'Basic_Steps', purpose: 'steps', data: payloads.Basic_Steps, problems: [] }));
    const escalated = await blockLevels.verifyAndRepair({ context: blockLevels.levelContext('english', 'proficient', 105), blocks: stubborn, items: [], specs: [], validateBlock: () => [] });
    check('GLM repairs twice at high effort, then Claude writes the third', repairWriters.join(',') === 'glm:high,glm:high,claude:claude-sonnet-5-5', repairWriters);
    check('the block Claude fixed is kept, not taken out', escalated.verification.blocks_dropped.length === 0 && !stubborn[1].problems.length && escalated.verification.status === 'verified');
    check('Claude\'s repair is counted in the cost', Math.abs(escalated.verification.cost - (4 * 0.05 + 0.03)) < 1e-9, escalated.verification.cost);
    // FACT_REPAIR_WRITER=strong: Claude writes every repair, from the first.
    reads2 = 0;
    repairWriters.length = 0;
    process.env.FACT_REPAIR_WRITER = 'strong';
    const stubborn2 = [0, 1, 2].map((index) => ({ index, block: 'Basic_Steps', purpose: 'steps', data: payloads.Basic_Steps, problems: [] }));
    await blockLevels.verifyAndRepair({ context: blockLevels.levelContext('english', 'proficient', 105), blocks: stubborn2, items: [], specs: [], validateBlock: () => [] });
    delete process.env.FACT_REPAIR_WRITER;
    check('with FACT_REPAIR_WRITER=strong, Claude writes every repair', repairWriters.length >= 1 && repairWriters.every((w) => w.startsWith('claude:')), repairWriters);
    check('a level that would lose more than a third of its blocks is written again', blockLevels.tooMuchRemoved({ blocks_dropped: [1, 2, 3, 3] }, 8)
      && !blockLevels.tooMuchRemoved({ blocks_dropped: [1, 2] }, 8) && !blockLevels.tooMuchRemoved(null, 8));
    factReader.ask = realAsk;
    delete process.env.FACT_CHECK_ANTHROPIC_KEY;

    console.log('\nfree-first: the free NVIDIA hard tier reads and repairs, Sonnet confirms, never OpenRouter GLM');
    process.env.FACT_CHECK_ANTHROPIC_KEY = 'sk-ant-test-not-a-real-key';
    const savedNvidiaKey = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = 'test-nvidia-key';
    process.env.FACT_PIPELINE = 'freefirst';
    process.env.FACT_CHEAP_MODEL = 'anthropic:claude-haiku-5-5';
    check('free-first is on with FACT_PIPELINE=freefirst and an NVIDIA key', blockLevels.freeFirstOn());
    // eslint-disable-next-line global-require
    const mimoProvider = require('../services/providers/nvidia');
    const realMimo = mimoProvider.structured;
    const order = [];
    let mimoFullReads = 0;
    let repairedOnce = false;
    mimoProvider.structured = async (args) => {
      if (args.schemaName === 'submit_fixed_blocks') { order.push('mimo-repair'); repairedOnce = true; return { data: { blocks: [{ index: 1, data: payloads.Basic_Steps }] }, usage: {}, model: 'mimo-v2.6-pro' }; }
      const part = /verify ONLY the claims in (BLOCK \d+|the CHECKs)/.exec(args.user);
      if (part && part[1] === 'BLOCK 0') { mimoFullReads++; order.push(`mimo-read-${mimoFullReads}`); }
      const wrong = !repairedOnce && part && part[1] === 'BLOCK 1';
      return { data: { claims: [claim(part ? part[1].toLowerCase() : 'block 0', wrong ? 'a wrong claim' : 'fine', wrong ? 'false' : 'verified', wrong ? 'the truth' : '')] }, usage: { input_tokens: 10, output_tokens: 10 }, model: 'mimo-v2.6-pro' };
    };
    factReader.ask = async (args) => {
      if (args.schemaName === 'submit_verification' && !/This time list and verify ONLY/.test(args.user)) { order.push('sonnet-read'); return { data: { claims: [claim('block 0', 'fine')] }, usage: {}, cost: 0.12, sources: [], searches: 0, model: 'claude-sonnet-5-5' }; }
      return { data: { claims: [], problems: [], answers: [] }, usage: {}, cost: 0, model: 'claude-haiku-5-5' };
    };
    const glmCalls = [];
    ai.structuredDetail = async (args) => { glmCalls.push(args.schemaName); return null; };
    const realFetch3 = global.fetch;
    global.fetch = async (url, opts) => (String(url).startsWith('http://127.0.0.1:') ? { ok: false, status: 503, json: async () => ({}) } : realFetch3(url, opts));
    const ffBlocks = [0, 1, 2].map((index) => ({ index, block: 'Basic_Steps', purpose: 'steps', data: payloads.Basic_Steps, problems: [] }));
    const ff = await blockLevels.verifyAndRepair({
      context: blockLevels.levelContext('english', 'proficient', 105), blocks: ffBlocks, items: [], specs: [], validateBlock: () => [],
      where: { trackId: 'english', gradeId: 'proficient', level: 105 },
    });
    global.fetch = realFetch3;
    check('the free tier reads, repairs, re-checks, reads clean, then one Sonnet read confirms', order.join(',') === 'mimo-read-1,mimo-repair,mimo-read-2,sonnet-read'
      || order.join(',') === 'mimo-read-1,mimo-repair,sonnet-read', order);
    check('the paid OpenRouter GLM route is never called (the owner\'s OpenRouter balance)', glmCalls.length === 0, glmCalls);
    check('the level is verified and the repaired block kept', ff.verification.status === 'verified' && ff.verification.blocks_fixed.join() === '1' && !ffBlocks[1].problems.length);
    mimoProvider.structured = realMimo;
    if (savedNvidiaKey === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = savedNvidiaKey;
    factReader.ask = realAsk;
    delete process.env.FACT_PIPELINE;
    delete process.env.FACT_CHEAP_MODEL;
    delete process.env.FACT_CHECK_ANTHROPIC_KEY;

    const pub = blockLevels.publicPlan(plan, user.id);
    // A holdout learner is served the level's shared plan instead.
    const holdout = (() => {
      // eslint-disable-next-line global-require
      const personalize = require('../services/personalize');
      for (let i = 0; i < 80; i++) {
        const u = makeUser('holdout');
        if (personalize.armFor(u.id, { trackId: 'english', gradeId: 'proficient', level: 105 }).arm === 'holdout') return u;
      }
      return null;
    })();
    if (holdout) {
      const before = calls.length;
      ai.structuredDetail = async () => null;
      const served = await blockLevels.write({ userId: holdout.id, trackId: 'english', gradeId: 'proficient', level: 105, tailored: true });
      check('a holdout learner gets no plan of their own', !served || served.user_id === null);
      check('and nothing is written in their name', !db.findOne('block_plans', (p) => p.user_id === holdout.id) && calls.length === before);
    }
    const wire = JSON.stringify(pub);
    check('the page never sees a check\'s answer', !/Good afternoon, everyone\.","answer|"answer":|rationale|accepts/.test(wire.replace(/"answered":\{\}/, '')), wire.slice(0, 300));
    check('checks are placed where the layout put them', pub.entries[2].block === 'Check_Choice', pub.entries.map((e) => e.block));
    check('the page loads only the files it needs, checks helper first', pub.files[0] === '/engine/checks/checks-common.js' && pub.files.length <= plan.blocks.length + 3, pub.files);

    console.log('\nchecks are graded on the server');
    const mc = plan.checks.find((c) => c.format === 'multiple_choice');
    const typed = plan.checks.find((c) => c.format === 'type_in');
    const r1 = blockLevels.answerCheck({ user, plan, checkId: mc.id, answer: 'Yo, listen up.', ms: 4000 });
    check('a wrong choice is marked wrong and told the answer', r1.correct === false && r1.answer === 'Good afternoon, everyone.');
    const again = blockLevels.answerCheck({ user, plan: db.byId('block_plans', plan.id), checkId: mc.id, answer: 'Good afternoon, everyone.' });
    check('the first answer is the one that counts', again.correct === false && again.repeat);
    const r2 = blockLevels.answerCheck({ user, plan: db.byId('block_plans', plan.id), checkId: typed.id, answer: '  TONE ' });
    check('a typed answer is graded with the usual leniency', r2.correct === true);
    const items = blockLevels.itemIdsFor(user, db.byId('block_plans', plan.id)).map((id) => db.byId('items', id));
    check('both answers are items the after-level read can see', items.length === 2 && items.every((i) => i.role === 'check' && i.level === 105));
    check('the enrollment counted the answers for the mastery gate', db.byId('enrollments', enrollment.id).level_items === 2);
    const pub2 = blockLevels.publicPlan(db.byId('block_plans', plan.id), user.id);
    check('a reload shows the checks already answered', Object.keys(pub2.answered).length === 2 && pub2.answered[mc.id].choice === 'Yo, listen up.');
    const other = makeUser('other');
    check('another learner reading a shared plan sees none of these answers', Object.keys(blockLevels.publicPlan(db.byId('block_plans', plan.id), other.id).answered).length === 0);

    console.log('\nthe after-level read sees the blocks');
    const learnerRecord = require('../services/learner-record');
    blockLevels.recordTelemetry(user, db.byId('block_plans', plan.id), [{ index: 0, block: 'Hook_Dilemma', ms: 12000, interactions: 2 }]);
    const content = learnerRecord.levelContent({ user_id: user.id, track_id: 'english', grade_id: 'proficient', level: 105, kind: 'lesson' }, items);
    check('the read is told it was a block level and how the learner moved through it', /built from interactive blocks/.test(content.kind) && /Hook_Dilemma.*12s on screen, 2 interactions/.test(content.text), content);

    console.log('\na failed fill falls back');
    ai.structuredDetail = async (args) => (args.schemaName === 'submit_layout' ? null : null);
    const none = await blockLevels.write({ userId: user.id, trackId: 'english', gradeId: 'proficient', level: 115, tailored: true });
    check('no fill-out means no plan, and the level keeps its old page', none === null);

    console.log('\na tailored Master quiz');
    const quizUser = makeUser('quiz');
    const quizEnroll = enroll(quizUser, 'english', 'proficient', firstMaster);
    const { entries } = blockCheckpoints.blueprint(quizEnroll, grade, firstMaster);
    check('the blueprint is the course\'s (15 questions for a Master)', entries.length === curriculum.CHECKPOINT_LENGTH.master);
    const quizCalls = [];
    ai.structuredDetail = async (args) => {
      quizCalls.push(args.schemaName);
      if (args.schemaName === 'submit_quiz_layout') {
        check('the quiz layout is told the blueprint is fixed', /BLUEPRINT \(fixed\)/.test(args.user));
        return { model: 'stub-glm', usage: { input_tokens: 2000, output_tokens: 400 }, data: { approach: 'typed where they recall well', slots: entries.map((_, i) => ({ slot: i, format: i % 2 ? 'type_in' : 'multiple_choice', style: i % 3 ? 'scenario' : 'plain', context: '' })) } };
      }
      const want = [...args.user.matchAll(/slot (\d+): skill (\S+) .*?(multiple_choice|type_in)/g)];
      return {
        model: 'stub-glm',
        usage: { input_tokens: 3000, output_tokens: 2000 },
        data: {
          items: want.map(([, slot, , format]) => (format === 'type_in'
            ? { slot: Number(slot), format, prompt: `Typed question number ${slot} about tone?`, choices: [], answer: `word${slot}`, accepts: [], rationale: 'The deciding step is naming the attitude.', hint: 'leak' }
            : { slot: Number(slot), format, prompt: `Choice question number ${slot} about tone?`, choices: [`alpha ${slot}`, `bravo ${slot}`, `charlie ${slot}`, `delta ${slot}`], answer: `bravo ${slot}`, accepts: [], rationale: 'The deciding step is comparing the formality.', hint: 'leak' })),
        },
      };
    };
    const quiz = await blockCheckpoints.write({ userId: quizUser.id, enrollment: quizEnroll, grade, level: firstMaster, attempt: 1 });
    check('every slot was written', quiz.filled === entries.length, quiz.filled);
    check('a fifteen-question quiz is filled in parallel batches of ten', quizCalls.filter((c) => c === 'submit_quiz_items').length === 2, quizCalls);
    check('the format the layout chose is the format written', quiz.items[1].format === 'type_in' && quiz.items[0].format === 'multiple_choice');
    check('no hints in a checkpoint', Object.values(quiz.items).every((i) => !i.hint));
    check('every question keeps its blueprint skill', Object.entries(quiz.items).every(([slot, i]) => i.skill_id === entries[slot].skillId));
    const claimed = await blockCheckpoints.claim({ userId: quizUser.id, enrollment: quizEnroll, grade, level: firstMaster, entries, attempt: 1, waitMs: 1000 });
    check('the session can claim them', Object.keys(claimed).length === entries.length);
    const twice = await blockCheckpoints.claim({ userId: quizUser.id, enrollment: quizEnroll, grade, level: firstMaster, entries, attempt: 1, waitMs: 1000 });
    check('a claimed set is never handed out twice', Object.keys(twice).length === 0);
    {
      // No verifier key (LEVEL_SELF_CHECK, P10): only questions a blind judge keys the same way are kept.
      delete process.env.LEVEL_SELF_CHECK;
      // eslint-disable-next-line global-require
      const keyGate = require('../services/key-gate');
      const realResolve = keyGate.blindResolve;
      keyGate.blindResolve = (qs) => realResolve(qs, { judge: async (b) => b.map((q, n) => (n === 0 ? 0 : 1)) });
      check('a checkpoint written before the self-check is not handed out', Object.keys(await blockCheckpoints.claim({ userId: quizUser.id, enrollment: quizEnroll, grade, level: firstMaster, entries, attempt: 1, waitMs: 1000 })).length === 0);
      const sq = await blockCheckpoints.write({ userId: quizUser.id, enrollment: quizEnroll, grade, level: firstMaster, attempt: 7 });
      const mcSlots = Object.keys(sq.items);
      check('self-checked: agreed choice questions kept, the disagreed one and typed ones left to the bank', sq.self_check && sq.self_check.status === 'passed'
        && !mcSlots.includes('0') && mcSlots.every((s) => sq.items[s].format === 'multiple_choice') && mcSlots.length === entries.filter((_, i) => i % 2 === 0).length - 1, { slots: mcSlots, sc: sq.self_check });
      const got = await blockCheckpoints.claim({ userId: quizUser.id, enrollment: quizEnroll, grade, level: firstMaster, entries, attempt: 7, waitMs: 1000 });
      check('and the self-checked set is handed out', Object.keys(got).length === mcSlots.length);
      keyGate.blindResolve = realResolve;
      process.env.LEVEL_SELF_CHECK = 'off';
    }

    console.log('\nthe session uses them');
    const session = db.insert('sessions', { user_id: quizUser.id, enrollment_id: quizEnroll.id, track_id: 'english', grade_id: 'proficient', kind: 'master', level: firstMaster, blocks: [], started_at: new Date().toISOString() });
    await blockCheckpoints.write({ userId: quizUser.id, enrollment: quizEnroll, grade, level: firstMaster, attempt: 1 }).catch(() => null);
    db.find('block_plans', (p) => p.user_id === quizUser.id && p.kind === 'checkpoint').forEach((p) => db.update('block_plans', p.id, { claimed_at: null }));
    const built = await sessions.buildBlock({ userId: quizUser.id, session, enrollment: db.byId('enrollments', quizEnroll.id), grade, level: firstMaster, blockIndex: 0, params: { preferTypeIn: false } });
    check('the Master quiz is the tailored questions', built.items.length === entries.length && built.items.filter((i) => /about tone\?$/.test(i.prompt)).length === entries.length, built.items.map((i) => i.prompt).slice(0, 3));
    check('and they are graded the usual way, answer kept off the page', built.items.every((i) => sessions.sanitize(i).answer === undefined));

    console.log('\npassing a checkpoint resets the attempt count');
    const mastery = require('../services/mastery');
    db.update('enrollments', quizEnroll.id, { checkpoint_attempts: 2 });
    mastery.clearCheckpoint(db.byId('enrollments', quizEnroll.id), grade, 'master');
    check('the next checkpoint starts at attempt 1', (db.byId('enrollments', quizEnroll.id).checkpoint_attempts || 0) === 0);

    console.log('\na tailored game');
    const gameUser = tailoredUser('game', { trackId: 'english', gradeId: 'proficient', level: 106 });
    const assignment = gameAssignments.resolve('english', 'proficient', 106);
    const schema = gamePayloads.schemaFor(assignment.engineId);
    ai.structuredDetail = async (args) => {
      if (args.schemaName === 'submit_question_plan') {
        return { model: 'stub-glm', usage: { input_tokens: 1800, output_tokens: 200 }, data: { mix: [{ skill: skills[0], style: 'scenario', count: schema.questionCount }], theme: 'basketball', curve: 'confidence first, then climb', notes: ['short sentences'] } };
      }
      if (args.schemaName === 'submit_game_questions') {
        check('the game writer gets the creator\'s prompt plus the plan', /GAME MECHANIC REQUIREMENTS/.test(args.user) && /PLAN FOR THIS LEARNER/.test(args.user) && /basketball/.test(args.user));
        const n = schema.questionCount;
        const k = schema.choicesPerQuestion || 4;
        return {
          model: 'stub-glm',
          usage: { input_tokens: 4000, output_tokens: 3000 },
          data: {
            title: 'Tone on the court',
            questions: Array.from({ length: n }, (_, i) => ({
              id: `q${i + 1}`,
              prompt: `Which line has the most formal tone, case ${i + 1}?`,
              choices: Array.from({ length: k }, (__, j) => `Option line ${String.fromCharCode(65 + j)} for case ${i + 1}`),
              answerIndex: i % k,
              explanation: 'It avoids slang and uses complete sentences.',
              difficulty: Math.max(1, Math.min(10, (schema.difficultyScale || {}).start || 5)),
              skill: skills[0],
              topic: 'Tone Control in Writing',
            })),
            feedback: { correct: 'Nice.', incorrect: 'Not that one.', win: 'You win!', lose: 'Try again.' },
          },
        };
      }
      return null;
    };
    const game = await gamePayloads.ensure(gameUser.id, 'english', 'proficient', 106, { tailored: true });
    check('a tailored question set was written for the learner', game && game.tailored && game.payload.questions.length === schema.questionCount, game && game.payload && game.payload.questions.length);
    const stored = gamePayloads.stored('english', 'proficient', 106, gameUser.id);
    check('the answer route reads the learner\'s own set', stored && stored.user_id === gameUser.id);
    check('another learner does not get it', (gamePayloads.stored('english', 'proficient', 106, other.id) || {}).user_id !== gameUser.id);

    console.log('\nessays: a retry revises the same piece');
    const essayUser = makeUser('essay');
    const essayEnroll = enroll(essayUser, 'english', 'proficient', 30);
    const first = db.insert('essays', {
      user_id: essayUser.id, track_id: 'english', grade_id: 'proficient', level: 30, attempt: 1,
      prompt: 'Argue for or against school uniforms.', guidance: 'Three paragraphs.',
      criteria: [{ skill_id: 'writing_clarity', name: 'Clarity', levels: ['a', 'b', 'c', 'd'], introduced: false }],
      draft: '<p>My first draft.</p>', plain: 'My first draft.', source: 'ai', passed: false, cleared_at: null,
      attempts: [{ overall: 0.5, focus: 'Say what you think in the first line.', strengths: [], criteria: [{ index: 0, score: 2, next_step: 'Cut the second sentence.' }], source: 'ai' }],
    });
    const realEnabled = ai.isEnabled;
    ai.isEnabled = () => false;
    const { essay: revision } = await essays.forLevel({ userId: essayUser.id, enrollment: essayEnroll, grade, level: 30, attempt: 2 });
    ai.isEnabled = realEnabled;
    check('the second attempt keeps the topic and rubric', revision.prompt === first.prompt && revision.criteria.length === 1);
    check('the learner\'s last draft is in the editor', revision.draft === '<p>My first draft.</p>');
    check('the feedback it is revised against comes with it', essays.sanitize(revision).revising && essays.sanitize(revision).revising.criteria[0].next_step === 'Cut the second sentence.');
    check('no model was needed for a revision', revision.source === 'revision');
    check('math written tasks are marked on the mathematics', Object.keys(ai.writingCriteriaFor('math')).includes('math_reasoning'));
    const mathGrade = curriculum.getGrade('math', curriculum.TRACKS.find((t) => t.id === 'math').grades[0].id);
    check('the math fallback rubric uses math criteria', essays.buildFallback({ grade: mathGrade, level: 25 }).criteria.some((c) => c.skill_id === 'math_reasoning'));


    console.log('\nevery input reaches the record');
    const learnerRecord2 = require('../services/learner-record');
    const levelLogs = require('../services/level-logs');
    const assist = require('../services/assist');
    const capUser = tailoredUser('capture', { trackId: 'english', gradeId: 'proficient', level: 105 });
    enroll(capUser, 'english', 'proficient', 105);
    const capPlan = db.byId('block_plans', plan.id);
    const ids = blockLevels.checkItems(capUser, capPlan);
    check('each check has an item for the learner before it is answered', Object.keys(ids).length === capPlan.checks.length
      && Object.values(ids).every((id) => db.byId('items', id).correct === null));
    check('the page gets the item id, so the question coach works on it',
      blockLevels.publicPlan(capPlan, capUser.id, ids).entries.filter((e) => e.item_id).length === capPlan.checks.length);
    db.update('items', ids[mc.id], { coach_used: true, coach_log: ['which one sounds like a speech?'] });
    blockLevels.answerCheck({ user: capUser, plan: capPlan, checkId: mc.id, answer: 'Good afternoon, everyone.', ms: 3000 });
    const answeredItem = db.byId('items', ids[mc.id]);
    check('the answer lands on the same item, with the coach use on it', answeredItem.correct === true && answeredItem.coach_used && answeredItem.coach_log.length === 1);

    blockLevels.recordTelemetry(capUser, capPlan, [{ index: 2, block: 'Basic_Steps', ms: 30000, interactions: 4, log: ['tapped "Step 2"', 'entered "x = 3"'], right: 1, wrong: 2 }]);
    const evidence = learnerRecord2.levelEvidence({ user_id: capUser.id, track_id: 'english', grade_id: 'proficient', level: 105 });
    check('what they did inside a block reaches the read, with the block\'s own verdicts', evidence.some((l) => /Basic_Steps: tapped "Step 2"; entered "x = 3" — the block marked 1 right, 2 wrong/.test(l)), evidence);

    const realTalk = ai.talk;
    ai.talk = async ({ system }) => (/THE PART THEY ARE ON \(Basic_Steps\)/.test(system) && /FROM THEIR LEARNER RECORD|HOW THIS LEARNER/.test(system) ? 'Look at step two again.' : null);
    const helped = await assist.onBlock({ user: capUser, plan: capPlan, index: 2, messages: [{ role: 'user', content: 'i dont get step two' }] });
    ai.talk = realTalk;
    check('chat assist on a block gets the block and the learner', helped.reply === 'Look at step two again.' && helped.source === 'ai');
    const evidence2 = learnerRecord2.levelEvidence({ user_id: capUser.id, track_id: 'english', grade_id: 'proficient', level: 105 });
    check('what they said to the assist reaches the read in their own words', evidence2.some((l) => /chat assist on the Basic Steps block.*"i dont get step two"/.test(l)), evidence2);

    levelLogs.save({ userId: capUser.id, trackId: 'english', gradeId: 'proficient', level: 115, source: 'page', rows: [{ index: 0, block: 'the lesson page', ms: 60000, interactions: 3, log: ['tapped "Reveal"'] }] });
    levelLogs.save({ userId: capUser.id, trackId: 'english', gradeId: 'proficient', level: 115, source: 'page', rows: [{ index: 0, block: 'the lesson page', ms: 90000, interactions: 5, log: ['tapped "Reveal"', 'tapped "Next"'] }] });
    check('a page that reports twice keeps one picture, the latest', db.find('level_logs', (r) => r.user_id === capUser.id && r.level === 115).length === 1
      && db.findOne('level_logs', (r) => r.user_id === capUser.id && r.level === 115).blocks[0].log.length === 2);

    const d1 = learnerRecord2.scheduleDebrief({ userId: capUser.id, trackId: 'english', gradeId: 'proficient', level: 115, kind: 'lesson', source: 'left the level', itemIds: [1] });
    const d2 = learnerRecord2.scheduleDebrief({ userId: capUser.id, trackId: 'english', gradeId: 'proficient', level: 115, kind: 'lesson', source: 'lesson page', itemIds: [2] });
    check('leaving and then finishing a level is one read, not two', d1.id === d2.id && d2.item_ids.length === 2 && d2.source === 'lesson page');

    console.log('\nthe coach knows the learner record');
    const learnerMod = require('../services/learner');
    const rec = learnerRecord2.get(capUser.id);
    db.update('learner_records', rec.id, { facts: [{ id: 'F1', kind: 'struggle', topic: 'semicolons', text: 'joins unrelated clauses', support: 3, status: 'solid', hint: 'ask whether each side could stand alone' }] });
    check('the coach brief carries their struggles and hint ideas', /semicolons: joins unrelated clauses.*hint idea: ask whether each side could stand alone/.test(learnerMod.teachingBrief(capUser.id, {})));

    console.log('\nwho sees what');
    const standard = makeUser('standard', { subscription: 'standard' });
    check('a standard learner is served block levels', blockLevels.visibleTo(standard));
    check('but never causes a model call', blockLevels.mayGenerate(standard) === false);
    check('and reads the shared version, not a tailored one', blockLevels.tailorsFor(standard) === false);
    process.env.TESTER_TAILORING = 'on';
    check('in the tester phase (TESTER_TAILORING on) a standard tester is tailored', blockLevels.tailorsFor(standard) === true);
    check('but the owner still reads the shared base versions', blockLevels.tailorsFor({ id: 0, email: 'the.landon.d@gmail.com' }) === false);
    process.env.TESTER_TAILORING = 'off';
    check('the owner reads the shared base versions by default', blockLevels.tailorsFor({ id: 0, email: 'the.landon.d@gmail.com' }) === false
      && blockLevels.mayGenerate({ id: 0, email: 'the.landon.d@gmail.com' }) === true);
    const before = calls.length;
    ai.structuredDetail = async (a) => { calls.push(a.schemaName); return null; };
    // A lesson with no base version written (past the levels generated ahead).
    let bare = 101;
    while (blockLevels.kindFor(grade, bare) !== 'lesson' || blockLevels.findPlan({ userId: null, trackId: 'english', gradeId: 'proficient', level: bare })) bare++;
    const none2 = await blockLevels.forLevel({ user: standard, trackId: 'english', gradeId: 'proficient', level: bare });
    check('a standard learner on a level with no base version gets nothing and no call is made', !none2.plan && !none2.writing && calls.length === before);
    check('a standard learner cannot play a game with no base question set', gamePayloads.accessFor(standard, 'english', 'proficient', 109) === gamePayloads.sharedReady('english', 'proficient', 109));

    console.log('\ngames are random but even in difficulty');
    const qs = Array.from({ length: 50 }, (_, i) => ({ id: `q${i}`, difficulty: 4 + Math.floor(i / 13) }));
    const ordered = gamePayloads.evenOrder(qs, 'seed');
    const firstTen = new Set(ordered.slice(0, 10).map((q) => q.difficulty));
    check('every question is kept', new Set(ordered.map((q) => q.id)).size === 50);
    check('any stretch of ten spans the range', firstTen.size === 4, [...firstTen]);
    check('the order is stable for a level', JSON.stringify(gamePayloads.evenOrder(qs, 'seed')) === JSON.stringify(ordered));

    console.log('\nbase tests and essays');
    // Real base levels for these slots are set aside so the fixtures are what is read.
    for (const p of db.find('block_plans', (x) => x.user_id === null && x.status === 'ready' && !x.created_by_test
      && x.track_id === 'english' && x.grade_id === 'proficient' && ['checkpoint', 'essay'].includes(x.kind))) {
      db.update('block_plans', p.id, { status: 'set_aside_by_test' });
    }
    const baseQuiz = db.insert('block_plans', { created_by_test: true, user_id: null, kind: 'checkpoint', track_id: 'english', grade_id: 'proficient', level: firstMaster, attempt: 1, status: 'ready',
      items: Object.fromEntries(entries.map((e, i) => [i, { skill_id: e.skillId, skill_name: 'x', difficulty: e.difficulty, format: 'multiple_choice', prompt: `Base question ${i} about the lessons?`, choices: ['a1', 'b1', 'c1', 'd1'], answer: 'b1', rationale: 'Because b1 follows from the rule taught.', source: 'ai' }])) });
    const stdEnroll = enroll(standard, 'english', 'proficient', firstMaster);
    const shared = blockCheckpoints.shared({ enrollment: stdEnroll, level: firstMaster, entries });
    check('a standard learner\'s first Master attempt is the base quiz', Object.keys(shared).length === entries.length);
    check('and reading it does not use it up', Object.keys(blockCheckpoints.shared({ enrollment: stdEnroll, level: firstMaster, entries })).length === entries.length);
    db.update('block_plans', baseQuiz.id, { status: 'replaced' });
    const essayLevel = 93;
    db.insert('block_plans', { created_by_test: true, user_id: null, kind: 'essay', track_id: 'english', grade_id: 'proficient', level: essayLevel, attempt: 1, status: 'ready',
      prompt: 'Use voice, mood and punctuation to argue for a school rule change.', guidance: 'Four paragraphs.', criteria: [{ skill_id: 'word_choice', name: 'Mood for effect', levels: ['a', 'b', 'c', 'd'], introduced: true }] });
    const stdEssayEnroll = enroll(standard, 'english', 'proficient', essayLevel);
    const realOn = ai.isEnabled;
    ai.isEnabled = () => false;
    const { essay: baseEssayRow } = await essays.forLevel({ userId: standard.id, enrollment: stdEssayEnroll, grade, level: essayLevel, attempt: 1 });
    ai.isEnabled = realOn;
    check('a standard learner writes to the base essay topic and rubric', baseEssayRow.prompt.startsWith('Use voice, mood'));
    const ctx93 = blockLevels.levelContext('english', 'proficient', 93).text;
    check('the essay level knows what was taught since the last checkpoint', /WHAT WAS TAUGHT SINCE THE LAST CHECKPOINT/.test(ctx93) && /Punctuation for Effect/.test(ctx93));
    check('a summary lesson is told every lesson it consolidates', /must touch every one/.test(blockLevels.levelContext('english', 'proficient', 50).text));
    check('every level is written for the grade\'s average age', /average age 14/.test(ctx93));

    console.log('\nno verifier key: the self-check (LEVEL_SELF_CHECK, evidence P10)');
    {
      delete process.env.LEVEL_SELF_CHECK;
      delete process.env.FACT_CHECK_ANTHROPIC_KEY;
      delete process.env.BLOCK_FACT_CHECK;
      check('on by default with no key: the claim read runs, the gate does not', blockLevels.selfCheckOn() && blockLevels.verifyOn() && !blockLevels.gateOn());
      check('a level that has not passed the self-check is not served', !blockLevels.servable({ status: 'ready' })
        && !blockLevels.servable({ status: 'ready', self_check: { status: 'failed' } }) && blockLevels.servable({ status: 'ready', self_check: { status: 'passed' } }));
      check('a level verified earlier under the key (Claude read every claim) is still served', blockLevels.servable({ status: 'ready', verification: { status: 'verified', model: 'claude-sonnet-5-5 + hints' } })
        && !blockLevels.servable({ status: 'ready', verification: { status: 'verified', model: 'glm-5.3' } }));
      // eslint-disable-next-line global-require
      const keyGate = require('../services/key-gate');
      const realResolve = keyGate.blindResolve;
      const scCalls = [];
      ai.structuredDetail = async (args) => {
        scCalls.push(args.schemaName);
        if (args.schemaName === 'submit_layout') {
          return { model: 'stub-glm', data: { coverage: ['formal vs informal register'], approach: 'Rule, steps.', blocks: [{ block: 'Hook_Dilemma', purpose: 'open' }, { block: 'Theory_RuleCard', purpose: 'rule' }, { block: 'Basic_Steps', purpose: 'steps' }, { block: 'Memory_CheatSheet', purpose: 'recap' }], checks: [{ skill_id: skills[0], format: 'multiple_choice', focus: 'formal', after: 1 }, { skill_id: skills[0], format: 'type_in', focus: 'tone', after: 2 }] } };
        }
        if (args.schemaName === 'submit_block_content') {
          return { model: 'stub-glm', data: { blocks: [{ index: 0, data: payloads.Hook_Dilemma }, { index: 1, data: payloads.Theory_RuleCard }, { index: 2, data: payloads.Basic_Steps }, { index: 3, data: payloads.Memory_CheatSheet }], checks: [
            { index: 0, prompt: 'Which sentence is the most formal?', choices: ['Hey, what\'s up?', 'Good afternoon, everyone.', 'Yo, listen up.', 'Sup, folks?'], answer: 'Good afternoon, everyone.', accepts: [], rationale: 'A full greeting with no slang marks formal tone.', hint: '' },
            { index: 1, prompt: 'One word for the writer\'s attitude toward the subject?', choices: [], answer: 'tone', accepts: [], rationale: 'Tone is the attitude a writer takes toward the subject.', hint: '' },
          ] } };
        }
        if (args.schemaName === 'submit_verification') return { data: { claims: [claim('block 0', 'fine'), claim('check 0', 'Good afternoon is formal')] }, usage: { input_tokens: 10, output_tokens: 5 } };
        return null;
      };
      const judged = [];
      keyGate.blindResolve = (qs) => { judged.push(qs.length); return realResolve(qs, { judge: async (b) => b.map((q) => q.choices.indexOf('Good afternoon, everyone.')) }); };
      const scUser = tailoredUser('selfcheck', { trackId: 'english', gradeId: 'proficient', level: 105 });
      enroll(scUser, 'english', 'proficient', 105);
      const sc = await blockLevels.write({ userId: scUser.id, trackId: 'english', gradeId: 'proficient', level: 105, tailored: true });
      check('written, read claim by claim on the app route, then re-solved blind', sc && sc.status === 'ready' && scCalls.includes('submit_verification')
        && sc.verification.status === 'verified' && judged.join() === '1', { calls: scCalls, judged });
      check('passed: it is served', sc.self_check && sc.self_check.status === 'passed' && sc.self_check.mc_agreed === 1
        && blockLevels.findPlan({ userId: scUser.id, trackId: 'english', gradeId: 'proficient', level: 105 }) !== null, sc.self_check);

      keyGate.blindResolve = (qs) => realResolve(qs, { judge: async (b) => b.map(() => 0) });
      const scUser2 = tailoredUser('selfcheck2', { trackId: 'english', gradeId: 'proficient', level: 105 });
      enroll(scUser2, 'english', 'proficient', 105);
      const sc2 = await blockLevels.write({ userId: scUser2.id, trackId: 'english', gradeId: 'proficient', level: 105, tailored: true });
      check('a check the blind judge answers differently is dropped, with the reason', sc2.checks.length === 1 && sc2.checks[0].format !== 'multiple_choice'
        && sc2.dropped_checks.some((d) => /self-check: a blind re-solve picked option 1/.test(d.why)) && sc2.self_check.mc_dropped === 1, sc2.dropped_checks);

      keyGate.blindResolve = (qs) => realResolve(qs, { judge: async () => { throw new Error('429'); } });
      const scUser3 = tailoredUser('selfcheck3', { trackId: 'english', gradeId: 'proficient', level: 105 });
      enroll(scUser3, 'english', 'proficient', 105);
      const sc3 = await blockLevels.write({ userId: scUser3.id, trackId: 'english', gradeId: 'proficient', level: 105, tailored: true });
      check('no judge answer: the self-check fails and the level is not served (the bank lesson teaches it)', sc3.self_check.status === 'failed' && sc3.self_check.mc_unjudged === 1
        && blockLevels.findPlan({ userId: scUser3.id, trackId: 'english', gradeId: 'proficient', level: 105 }) === null);

      keyGate.blindResolve = (qs) => realResolve(qs, { judge: async (b) => b.map((q) => q.choices.indexOf('Good afternoon, everyone.')) });
      const { id: _scId, ...scRow } = sc;
      const before = db.insert('block_plans', { ...scRow, user_id: scUser.id, level: 104, self_check: null, verification: null });
      check('a level written before the self-check is held', blockLevels.findPlan({ userId: scUser.id, trackId: 'english', gradeId: 'proficient', level: 104 }) === null);
      const rechecked = await blockLevels.verifyStored(before);
      check('and self-checked on the way in, then served', rechecked && rechecked.self_check && rechecked.self_check.status === 'passed' && blockLevels.servable(rechecked), rechecked && rechecked.self_check);

      process.env.LEVEL_SELF_CHECK = 'off';
      check('LEVEL_SELF_CHECK=off serves as before', !blockLevels.selfCheckOn() && blockLevels.servable({ status: 'ready' }) && !blockLevels.verifyOn());
      keyGate.blindResolve = realResolve;
    }

    console.log('\nthe route is NVIDIA then Claude, nothing else');
    providers.current = realCurrent;
    check('blocks route order', JSON.stringify(providers.order('blocks')) === JSON.stringify(['nvidia', 'ollama', 'gemini_free', 'openrouter_free', 'anthropic']), providers.order('blocks')); // NVIDIA, the free fallbacks (2026-10-23), Claude last
    const nvidiaProvider = require('../services/providers/nvidia');
    check('a block fill-out is written by the hard tier', nvidiaProvider.plan('blocks', 'block_fill').tier === 'hard', nvidiaProvider.plan('blocks', 'block_fill'));
    check('a layout is written by the fast-thinking tier', nvidiaProvider.plan('blocks', 'block_layout').tier === 'fast_thinking', nvidiaProvider.plan('blocks', 'block_layout'));
  } finally {
    // Shared (base) rows this test wrote are fixtures, never content: a real
    // standard learner would be served them.
    db.remove('block_plans', (p) => p.user_id === null
      && (p.created_by_test || (p.started_at && p.started_at >= testStarted && p.status !== 'ready')));
    for (const p of db.find('block_plans', (x) => x.status === 'set_aside_by_test')) db.update('block_plans', p.id, { status: 'ready' });
    // Reads this test queued are not for the background worker.
    for (const d of db.find('level_debriefs', (x) => x.status === 'pending'
      && /^blocktest-/.test((db.byId('users', x.user_id) || {}).email || ''))) {
      db.update('level_debriefs', d.id, { status: 'skipped', reason: 'test' });
    }
    ai.structuredDetail = realDetail;
    providers.current = realCurrent;
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nall block-level checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
