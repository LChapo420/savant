/**
 * Adds synthetic shared game sets for english/proficient levels 14 (mario) and 24 (moto-x3m) to
 * scripts/fixtures/test-db.json, so the game-lab course-frame check runs on a clean clone.
 * The questions are placeholders written for the test, not course content. Run again to rebuild.
 */
const fs = require('node:fs');
const path = require('node:path');
const gamePayloads = require('../services/game-payloads');

const FILE = path.join(__dirname, 'fixtures', 'test-db.json');
const LEVELS = [['mario', 14, true], ['moto-x3m', 24, false]];

function questions(count, choices) {
  return Array.from({ length: count }, (_, i) => ({
    id: `q${i + 1}`,
    prompt: `Test question ${i + 1}: which word is a noun?`,
    choices: [],
    answerIndex: i % choices,
    explanation: `Synthetic test explanation ${i + 1}.`,
    difficulty: 1 + (i % 8),
    skill: 'test-skill',
    topic: 'test',
  }));
}

function build() {
  const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  db.game_payloads = (db.game_payloads || []).filter((r) => !(r.track_id === 'english' && r.grade_id === 'proficient' && [14, 24].includes(r.level)));
  for (const [engineId, level, replacement] of LEVELS) {
    const schema = gamePayloads.schemaFor(engineId);
    const choices = schema.choicesPerQuestion || 4;
    const qs = questions(schema.questionCount, choices).map((q, i) => {
      // Vary the wording and the answer slot so the validator's giveaway checks pass.
      const words = ['harbor', 'lantern', 'meadow', 'compass', 'orchard', 'ribbon'];
      const options = Array.from({ length: choices }, (_, k) => `${words[(i + k) % words.length]} ${i + 1}${'abcdefgh'[k]}`);
      return { ...q, choices: options };
    });
    const d = schema.difficultyScale || {};
    const payload = {
      schemaVersion: 1,
      engineId,
      meta: { subject: 'English', grade: 'Proficient', level, topic: 'Test set', title: 'Test set', ageRange: '14 to 18' },
      settings: { questionCount: schema.questionCount, choicesPerTurn: choices, difficulty: { start: d.start || 5, end: d.end || 8, curve: d.curve || 'flat' }, timeLimitSec: null },
      questions: qs,
    };
    const problems = gamePayloads.inspectPayload({ questions: qs }, schema);
    if (problems.length) throw new Error(`level ${level}: ${problems.join('; ')}`);
    db.game_payloads.push({
      id: db.game_payloads.length + 1, user_id: null, engine_id: engineId, track_id: 'english', grade_id: 'proficient', level,
      payload, problems: [], model: 'synthetic test fixture', generated_at: null, ...(replacement ? { verified_replacement: true } : {}),
    });
  }
  db._counters.game_payloads = db.game_payloads.reduce((m, r) => Math.max(m, r.id), 0);
  fs.writeFileSync(FILE, `${JSON.stringify(db)}`);
}

build();
