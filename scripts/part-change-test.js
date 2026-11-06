/**
 * Offline test of the learner's own change (services/part-change.js): the switch, the facts, that a choice sticks into the spec and reaches what is written later, the block overlay, and the
 * per-account part-modify switch. A stub stands in for the model. Also run by `npm test`.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_FILE = path.join(os.tmpdir(), `part-change-test-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none there */ }
fs.writeFileSync(process.env.DB_FILE, JSON.stringify({}));
for (const name of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(name)) process.env[name] = '';
process.env.PART_CHANGE = 'on';
delete process.env.PART_MODIFY;

const db = require('../config/db');
const ls = require('../services/learning-spec');
const pm = require('../services/part-modify');
const pc = require('../services/part-change');

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log(`  ok   ${label}`);
  else { failures += 1; console.log(`  FAIL ${label}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`); }
};
const say = (text) => async () => ({ text });
const passes = async () => ({ ok: true, problems: [] });
const user = db.insert('users', { email: 'pc@example.test', display_name: 'pc', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
const RAT = 'Count all the unit cubes in the prism, layer by layer, and then multiply: 3 × 2 × 4 = 24 cubic units, which is the volume of the whole prism.';
const mkItem = () => db.insert('items', { user_id: user.id, prompt: 'What is the volume?', answer: '24 cubic units', rationale: RAT, correct: true, skill_name: 'Volume' });

(async () => {
  console.log('facts');
  const orig = RAT;
  check('a shorter text that keeps the numbers passes', !pc.mechanical(orig, 'Count the cubes: 3 × 2 × 4 = 24 cubic units.', ['shorter'], null).length);
  check('a dropped number fails', pc.mechanical(orig, 'Count the cubes to get the volume.', ['shorter'], null).length > 0);
  check('a new number fails without an example', pc.mechanical(orig, 'Count the cubes: 3 × 2 × 4 = 24, or 25 with the lid.', ['shorter'], null).some((p) => /25/.test(p)));
  check('a new number is allowed inside an asked-for example', !pc.mechanical(orig, `${orig} For example, 2 × 2 × 2 = 8 cubic units.`, ['examples'], null).length);
  check('a text that is not shorter fails', pc.mechanical(orig, orig, ['shorter'], null).some((p) => /not shorter/.test(p)));
  check('a text that is not simpler fails', pc.mechanical('Add the two. Then stop.', 'Commence by aggregating both quantities, whereupon you terminate the procedure entirely.', ['simpler'], null).some((p) => /not simpler/.test(p)));
  check('the topic must appear', pc.mechanical(orig, orig, ['topic'], 'trains').some((p) => /trains/.test(p)));

  console.log('a question\'s explanation');
  const item = mkItem();
  const short = 'Count the cubes: 3 × 2 × 4 = 24 cubic units.';
  const r = await pc.changeItem(user.id, item.id, 'shorter', null, { llm: say(short), gate: passes });
  check('the shorter text comes back', r.changed && r.text === short, r);
  check('and is what is served, with PART_MODIFY off', pm.rationaleOf(db.byId('items', item.id)) === short);
  const refused = await pc.changeItem(user.id, item.id, 'simpler', null, { llm: say('Count them.'), gate: passes });
  check('a rewrite that drops the numbers is refused and the last good text stays', !refused.changed && refused.text === short && /could not be made/.test(refused.message), refused);
  const gateNo = await pc.changeItem(user.id, item.id, 'shorter', null, { llm: say(short), gate: async () => ({ ok: false, problems: ['new: x'] }) });
  check('the fact gate refuses', !gateNo.changed, gateNo);
  const unread = await pc.changeItem(user.id, item.id, 'shorter', null, { llm: say(short), gate: async () => null });
  check('a gate that cannot be read is not a pass', !unread.changed, unread);
  pc.revertItem(user.id, item.id);
  check('put back serves the stored text', pm.rationaleOf(db.byId('items', item.id)) === RAT);
  const open = db.insert('items', { user_id: user.id, prompt: 'q', answer: 'a', rationale: RAT, correct: null });
  check('not before it is answered', (await pc.changeItem(user.id, open.id, 'shorter', null, { llm: say(short), gate: passes })).status === 409);
  const other = db.insert('users', { email: 'other@example.test', display_name: 'o', password_hash: 'x' });
  check('not on another learner\'s question', (await pc.changeItem(other.id, item.id, 'shorter', null, { llm: say(short), gate: passes })).status === 404);

  console.log('the choice sticks');
  const before = db.insert('users', { email: 'stick@example.test', display_name: 's', password_hash: 'x' });
  const specBefore = ls.buildSpec(before.id, {});
  pc.record(before.id, 'shorter');
  pc.record(before.id, 'simpler');
  pc.record(before.id, 'examples');
  pc.record(before.id, 'topic', 'model trains');
  const specAfter = ls.buildSpec(before.id, {});
  check('a learner we knew nothing about now has a spec', specBefore.isDefault && !specAfter.isDefault);
  check('shorter moves the lesson\'s word budget', specAfter.lesson.wordBudget < specBefore.lesson.wordBudget, [specBefore.lesson.wordBudget, specAfter.lesson.wordBudget]);
  check('shorter moves feedback detail', specAfter.feedback.granularity === 'brief', specAfter.feedback.granularity);
  check('simpler moves the word level', specAfter.language.vocabularyGrade < specBefore.language.vocabularyGrade, [specBefore.language.vocabularyGrade, specAfter.language.vocabularyGrade]);
  check('examples moves examples per idea', specAfter.practice.examplesPerIdea > specBefore.practice.examplesPerIdea, [specBefore.practice.examplesPerIdea, specAfter.practice.examplesPerIdea]);
  check('the topic leads the interests', specAfter.interests.exampleDomains[0] === 'model trains', specAfter.interests.exampleDomains);
  check('the part modifier hears it', pm.rulesFor(specAfter, 'feedback').some((x) => /model trains/.test(x)));
  check('a writer hears it', ls.specToLines(specAfter, { surface: 'lesson' }).join(' ').length > 0);
  check('stronger each time, up to three', (() => { pc.record(before.id, 'shorter'); pc.record(before.id, 'shorter'); pc.record(before.id, 'shorter'); return pc.prefsOf(before.id).shorter === 3; })());
  pc.clear(before.id, 'topic');
  check('one choice can be forgotten', !pc.prefsOf(before.id).topic && pc.prefsOf(before.id).shorter === 3);
  pc.clear(before.id);
  check('and all of them, back to the plain spec', ls.buildSpec(before.id, {}).isDefault);
  process.env.PART_CHANGE = 'off';
  pc.record(before.id, 'shorter');
  check('with the switch off a stored choice is not read', ls.buildSpec(before.id, {}).isDefault);
  process.env.PART_CHANGE = 'on';
  pc.clear(before.id);

  const tapper = db.insert('users', { email: 'tap@example.test', display_name: 't', password_hash: 'x' });
  db.insert('level_feedback', { user_id: tapper.id, length: 'long' });
  check('one too-long tap moves nothing', ls.buildSpec(tapper.id, {}).isDefault);
  db.insert('level_feedback', { user_id: tapper.id, length: 'long' });
  check('two too-long taps count as asking for shorter', ls.buildSpec(tapper.id, {}).feedback.granularity === 'brief' || ls.buildSpec(tapper.id, {}).lesson.wordBudget < ls.defaultSpec().lesson.wordBudget);

  console.log('a lesson block');
  const plan = { id: 77, topic: 'Volume', blocks: [{ index: 0, block: 'Basic_TextBlock', data: { title: 'Volume', body: RAT } }, { index: 1, block: 'Game_TugOfWar', data: { title: 'A game about something long enough here' } }] };
  const b = await pc.changeBlock(user.id, { plan, ref: 0 }, 'shorter', null, { llm: say(short), gate: passes });
  check('the block\'s text changes and its shape stays', b.changed && b.data.title === 'Volume' && b.data.body === short, b);
  check('the learner is served it', pc.blockData(user.id, plan, plan.blocks[0]).body === short);
  check('another learner is not', pc.blockData(other.id, plan, plan.blocks[0]).body === RAT);
  const moved = { ...plan, blocks: [{ index: 0, block: 'Basic_TextBlock', data: { title: 'Volume', body: `${RAT} More.` } }] };
  check('a block rewritten since is not overlaid', pc.blockData(user.id, moved, moved.blocks[0]).body !== short);
  check('a game block cannot be reworded', (await pc.changeBlock(user.id, { plan, ref: 1 }, 'shorter', null, { llm: say(short), gate: passes })).status === 409);
  pc.revertBlock(user.id, { plan, ref: 0 });
  check('put back removes the overlay', pc.blockData(user.id, plan, plan.blocks[0]).body === RAT);

  console.log('per-account part-modify switch');
  delete process.env.PART_MODIFY;
  check('off by default', pm.enabled() === false && pm.enabled(user.id) === false);
  db.update('users', user.id, { part_modify: 'on' });
  check('one account can be on', pm.enabled(user.id) === true && pm.enabled(other.id) === false);
  const shaped = db.insert('items', { user_id: user.id, rationale: 'stored', shaped: { rationale: 'mine', hash: 'x' } });
  const shapedOther = db.insert('items', { user_id: other.id, rationale: 'stored', shaped: { rationale: 'mine', hash: 'x' } });
  check('that account is served its rewrite, another is not', pm.rationaleOf(shaped) === 'mine' && pm.rationaleOf(shapedOther) === 'stored');
  process.env.PART_MODIFY = 'on';
  db.update('users', other.id, { part_modify: 'off' });
  check('with the default on, an account can stay off', pm.enabled(other.id) === false && pm.enabled() === true);
  process.env.PART_MODIFY = 'off';
  check('PART_MODIFY=off stops every account', pm.enabled(user.id) === false && pm.rationaleOf(shaped) === 'stored');
  delete process.env.PART_MODIFY;

  console.log('checks in a built-in lesson reach the rewrite');
  const blockLevels = require('../services/block-levels');
  db.update('users', user.id, { part_modify: 'on' });
  const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'block-levels.js'), 'utf8');
  check('answerCheck serves through rationaleOf', /partModify\.rationaleOf\(item\) \|\| check\.rationale/.test(src) && !!blockLevels.answerCheck);

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* fine */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall ok');
  process.exit(failures ? 1 : 0);
})();
