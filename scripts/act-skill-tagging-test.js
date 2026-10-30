/** The ACT skill tagger: which levels were really tagged and which fell to the fallback. */
const assert = require('assert');
const { matchSkill, skillFor } = require('./build-act-grades');
const { GRADES } = require('../content/act-grades');

function check(message, fn) {
  try { fn(); console.log(`ok   ${message}`); } catch (error) { console.error(`FAIL ${message}: ${error.message}`); process.exitCode = 1; }
}

check('matchSkill returns null for a strategy level that names no content', () => {
  assert.strictEqual(matchSkill('Pacing yourself on test day Stay calm'), null);
  assert.strictEqual(skillFor('Pacing yourself on test day Stay calm'), 'act_rhetoric');
});

check('matchSkill still tags real content', () => {
  assert.strictEqual(matchSkill('Solving quadratic equations'), 'quadratics');
  assert.strictEqual(matchSkill('Using semicolons correctly'), 'comma_use');
});

check('every generated level agrees with the tagger, and the untagged count is known', () => {
  let untagged = 0;
  let total = 0;
  for (const grade of GRADES) {
    for (const level of grade.levels) {
      total++;
      const matched = matchSkill(`${level.title} ${level.covers}`);
      if (matched === null) { untagged++; assert.strictEqual(level.skill, 'act_rhetoric', `${grade.id} level ${level.level}`); }
      else assert.strictEqual(level.skill, matched, `${grade.id} level ${level.level}`);
    }
  }
  assert.strictEqual(total, 9807);
  // 1,643 levels (about 17%) carry act_rhetoric only because nothing matched. Lower this
  // number as the tagger improves; item 9b stops tagging them at all.
  assert.strictEqual(untagged, 1643);
});
