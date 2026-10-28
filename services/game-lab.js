/** Shared preview content: compact topic-only prompt, no game source in a call. */
const fs = require('fs');
const path = require('path');
const games = require('./game-payloads');
const registry = require('../game_registry.json');
const CACHE = path.join(__dirname, '..', 'content', 'game-lab-questions.json');
const PROMPT = 'Topic: ethos, logos, pathos. Write 50 unique short four-choice rhetoric questions with balanced answer positions and one-sentence explanations. Include identification, evidence, audience and reasoning. Choices must be plausible and similar in length. Return only {questions:[{prompt,choices,answerIndex,explanation}]}. No HTML, game rules or code.';
function content() { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); }
function payload(id) {
  const schema = games.schemaFor(id);
  if (!schema) return null;
  const base = content();
  const questions = base.questions.map((q, i) => ({ ...q, id: `rhetoric-${i + 1}`, difficulty: schema.difficultyScale.start + i % (schema.difficultyScale.end - schema.difficultyScale.start + 1), skill: 'rhetorical_appeals', topic: 'Ethos, logos, pathos' }));
  // Rebalance answer slots in code, without another paid generation call.
  questions.forEach((q, i) => {
    q.choices = q.choices.slice();
    const slot = i % 4, answer = q.choices[q.answerIndex];
    q.choices[q.answerIndex] = q.choices[slot]; q.choices[slot] = answer; q.answerIndex = slot;
  });
  // Hangman needs single-word hidden answers, not a whole sentence.
  if (id === 'hangman') {
    const words = questions.filter((q) => q.choices.every((choice) => /^[A-Za-z]+$/.test(choice)));
    if (!words.length) throw new Error('The cached pool needs one-word options for Hangman.');
    questions.splice(0, questions.length, ...words);
  }
  return { schemaVersion: 1, engineId: id, meta: { subject: 'English', grade: 'Preview', level: 1, topic: 'Ethos, logos, pathos', title: 'Rhetorical appeals', ageRange: 'Teen and adult preview' }, settings: { questionCount: questions.length, choicesPerTurn: 4 }, questions, feedback: { correct: 'Correct.', incorrect: 'Not quite—read the explanation.', win: 'Round complete!', lose: 'Round over. Try again.', draw: 'Round finished.', outOfQuestions: 'The pool is complete; starting it again.' } };
}
function list() {
  let tested = {};
  try { tested = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'games', 'remade-status.json'), 'utf8')); } catch { /* no games certified yet */ }
  return { games: registry.engines.map((game) => ({ id: game.id, name: game.displayName, status: tested[game.id] === 'ready' ? 'ready' : 'testing', mechanic: games.schemaFor(game.id).mechanic })), prompt: PROMPT, contentSource: content().source };
}
module.exports = { list, payload, PROMPT, CACHE };