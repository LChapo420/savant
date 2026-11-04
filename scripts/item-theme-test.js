/**
 * Interest theming gates (services/item-theme.js), with injected writer, solver and judge: no network.
 *   node scripts/item-theme-test.js
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'theme-')), 'db.json');
fs.writeFileSync(process.env.DB_FILE, '{}');
const assert = require('assert');
const it = require('../services/item-theme');
const bank = require('../content/bank');

const item = { skill_id: 'x', skill_name: 'Ratios', difficulty: 4, format: 'multiple_choice', prompt: 'A recipe uses 3 cups of flour for 12 muffins. How many cups for 36 muffins?', choices: ['6', '9', '12', '18'], answer: '9', source: 'bank' };
const good = 'A baker uses 3 cups of flour for 12 muffins. How many cups for 36 muffins?';
const agree = async () => 'agreed';
const yes = async () => ({ same_skill: true, same_difficulty: true, natural: true });

(async () => {
  // deterministic stem gate
  assert.strictEqual(it.stemProblem(item, good), null);
  assert.match(it.stemProblem(item, 'A baker uses 4 cups of flour for 12 muffins. How many cups for 36 muffins?'), /numbers/);
  assert.match(it.stemProblem(item, item.prompt), /unchanged/);
  assert.match(it.stemProblem(item, ''), /empty/);
  assert.match(it.stemProblem(item, 'Flour 3 12 36 ' + 'x'.repeat(300)), /length|numbers/);

  const run = (deps) => it.theme(item, 'cooking', { dataClass: 'pipeline', deps: { writer: async () => good, solver: agree, solver2: agree, judger: yes, ...deps } });
  let r = await run({});
  assert.ok(r.ok && r.item.prompt === good && r.item.answer === '9' && r.item.choices.join() === item.choices.join() && r.item.themed === 'cooking');
  // a dissenting blind re-solve rejects; an unjudged one rejects too (never kept on no evidence)
  r = await run({ solver: async () => 'disagreed' }); assert.ok(!r.ok && r.stage === 'resolve');
  r = await run({ solver: async () => 'unjudged' }); assert.ok(!r.ok && r.stage === 'resolve');
  r = await run({ solver2: async () => 'disagreed' }); assert.ok(!r.ok && r.stage === 'resolve2');
  r = await run({ solver2: async () => 'unjudged' }); assert.ok(!r.ok && r.stage === 'resolve2');
  // the cross-family judge rejects a theme that changed skill or difficulty, or no answer
  r = await run({ judger: async () => ({ same_skill: true, same_difficulty: false, natural: true }) }); assert.ok(!r.ok && r.stage === 'judge');
  r = await run({ judger: async () => null }); assert.ok(!r.ok && r.stage === 'judge');
  // the writer declining (a bare drill) or changing numbers rejects before any solver is asked
  let asked = false;
  r = await run({ writer: async () => null, solver: async () => { asked = true; return 'agreed'; } }); assert.ok(!r.ok && r.stage === 'write' && !asked);
  r = await run({ writer: async () => 'A baker uses 3 cups of flour for 12 muffins. How many for 40?' }); assert.ok(!r.ok && r.stage === 'stem');
  // not themable: a passage item, a bare non multiple choice format
  assert.ok(!it.themable({ ...item, passage: 'text' }) && !it.themable({ ...item, format: 'ordering' }));

  // pool: written ahead, then taken once each, skipping what the learner has seen
  const base = bank.generate({ skillId: 'add_sub', difficulty: 4, seed: 'theme-test' });
  const themedOf = (n) => ({ ...base, prompt: `${base.prompt} (${n})`, themed: 'cooking' });
  const key = it.poolKey('add_sub', 4, 'Cooking');
  assert.strictEqual(key, 'add_sub|4|cooking');
  assert.strictEqual(it.take({ skillId: 'add_sub', difficulty: 4, domain: 'cooking' }), null); // nothing ready: the base item is served
  const made = await it.topUp({ skillId: 'add_sub', difficulty: 4, domain: 'cooking', count: 2, deps: { writer: async (b) => b.prompt + ' (cooking)', solver: agree, solver2: agree, judger: yes } });
  assert.ok(made >= 0);
  const db = require('../config/db');
  db.insert('themed_items', { key: 'm|5|music', items: [themedOf(1), themedOf(2)], served: 0 });
  const seen = new Set([bank.itemKey(themedOf(1))]);
  const t = it.take({ skillId: 'm', difficulty: 5, domain: 'music', avoid: seen });
  assert.ok(t && t.prompt.endsWith('(2)') && t.difficulty === 5);
  assert.strictEqual(it.take({ skillId: 'm', difficulty: 5, domain: 'music', avoid: seen }), null);
  process.env.THEME_ITEMS = 'off';
  assert.strictEqual(it.domainFor('u1', { track_id: 'math' }), null);
  console.log('item-theme-test: ok');
})().catch((e) => { console.error(e); process.exit(1); });
