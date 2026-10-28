#!/usr/bin/env node
/**
 * content/holdout.js: held-back questions are never served to the learner they are
 * held from, and nothing changes for anyone else.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holdout-'));
process.env.HOLDOUT_DIR = dir;
fs.mkdirSync(path.join(dir, 'spanish-run'));

const bank = require('../content/bank');
const holdout = require('../content/holdout');

// The question to hold back: whatever es_vocab_core d3 seed 0 gives, plus a conjugation.
const targets = [
  bank.generate({ skillId: 'es_vocab_core', difficulty: 3, seed: 'holdout-test:0' }),
  bank.generate({ skillId: 'es_present_ar', difficulty: 3, seed: 'holdout-test:1' }),
  bank.generate({ skillId: 'es_greetings', difficulty: 1, seed: 'holdout-test:2' }),
];
const items = {};
targets.forEach((t, i) => { items[`hb-${i}`] = { id: `hb-${i}`, skill_id: t.skill_id, prompt: t.prompt, answer: t.answer }; });
fs.writeFileSync(path.join(dir, 'spanish-run', 'items.json'), JSON.stringify({ items }));
fs.writeFileSync(path.join(dir, 'holdout.json'), JSON.stringify({ 77: Object.keys(items) }));
holdout.reset();

const hit = (it) => targets.some((t) => (
  holdout.exactKey(t.prompt, t.answer) === holdout.exactKey(it.prompt, it.answer)
  || (holdout.targetable(t.skill_id, t.answer) && t.skill_id === it.skill_id && holdout.norm(t.answer) === holdout.norm(it.answer))));

const draw = (n) => {
  const out = [];
  for (const t of targets) {
    for (let i = 0; i < n; i++) out.push(bank.generate({ skillId: t.skill_id, difficulty: t.difficulty, seed: `holdout-test:${t.skill_id}:${i}` }));
  }
  return out;
};

// Another learner (and no learner at all) is unaffected: the same draws do reach the held-back questions.
assert(draw(400).some(hit), 'sanity: the held-back questions are reachable without the hold');
let leaked = 0;
holdout.runAs(5, () => { leaked = draw(400).filter(hit).length; });
assert(leaked > 0, 'a learner with no holdout still sees them');

// The held learner never does, through generate() or generateMany().
holdout.runAs(77, () => {
  assert.strictEqual(draw(400).filter(hit).length, 0, 'generate() served a held-back question');
  const many = bank.generateMany(targets.flatMap((t) => Array(60).fill({ skillId: t.skill_id, difficulty: t.difficulty })));
  assert.strictEqual(many.filter(hit).length, 0, 'generateMany() served a held-back question');
});

// The hold ends with the request: outside runAs it is off again.
assert(draw(400).some(hit), 'the hold leaked outside runAs');

// Short answers are never targets (they would empty a skill).
assert(!holdout.targetable('es_present_ar', 'an') && !holdout.targetable('es_present_ar', 'a'));

// Through Express: attachUser's wrapper keeps the hold across an await in a handler.
const express = require('express');
const http = require('http');
const app = express();
app.use((req, res, next) => { const id = Number(req.get('x-user')); holdout.runAs(id, next); });
app.get('/draw', async (req, res) => {
  await new Promise((r) => setTimeout(r, 20));
  res.json({ leaked: draw(300).filter(hit).length });
});
const server = app.listen(0, async () => {
  const get = (user) => new Promise((resolve) => http.get({ port: server.address().port, path: '/draw', headers: { 'x-user': user } }, (r) => {
    let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(JSON.parse(b)));
  }));
  const held = await get(77); const other = await get(5);
  server.close();
  assert.strictEqual(held.leaked, 0, 'held learner was served a held-back question through Express');
  assert(other.leaked > 0, 'another learner should be unaffected through Express');
  console.log('holdout-test: ok');
  fs.rmSync(dir, { recursive: true, force: true });
});
