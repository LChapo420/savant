/**
 * Which game engine plays at which level.
 *
 * The pairing lives in one JSON file — `config/level-assignments.json` — so it is
 * reviewable in a diff and every consumer asks this module instead of reading the
 * file for itself. Three levels of override, most specific first:
 *
 *   levels   `english/proficient/106` — one exact level
 *   grades   `english/proficient`     — every level of that grade
 *   subjects `english`                — every grade of that subject
 *   defaults                          — the cycle over registered engines
 *
 * The cycle is the creator's own rule generalised: with N registered engines,
 * level position i takes engine `((i − 1) mod N) + 1`, so a level keeps the same
 * game forever. It only exists when `game_registry.json` has engines in it — the
 * batch runner writes that file — so until the library is generated, an
 * unassigned level is simply not a game.
 *
 * An engine id is a file name: `[a-z0-9-]+`, checked here rather than trusted
 * from the config, because it is on its way to a path on disk.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSIGNMENTS = path.join(__dirname, 'level-assignments.json');
const REGISTRY = path.join(ROOT, 'game_registry.json');
const curriculum = require('./curriculum');

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

function loadAssignments() {
  try {
    return JSON.parse(fs.readFileSync(ASSIGNMENTS, 'utf8'));
  } catch {
    // A missing or unreadable config means "no games", never "all games": the
    // lesson path must go on working with the pairing file absent.
    return { levels: {}, grades: {}, subjects: {}, defaults: {} };
  }
}

/** The registered engine ids in registry order, or [] before the library exists. */
function registeredEngines() {
  try {
    const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    const list = Array.isArray(registry.engines) ? registry.engines : [];
    return list.filter((e) => e && SAFE_ID.test(String(e.id || '')) && e.status !== 'broken')
      .map((e) => e.id);
  } catch {
    return [];
  }
}

/** Does the config name any exact level of this grade (an authored set, e.g. English Proficient)? */
function authoredGrade(config, trackId, gradeId) {
  const prefix = `${trackId}/${gradeId}/`;
  return Object.keys(config.levels || {}).some((k) => k.startsWith(prefix));
}

/**
 * The engine for one level, with the overrides its rule carries.
 *
 * @returns {{engineId: string, overrides: object, source: string}|null}
 */
function resolve(trackId, gradeId, level) {
  const config = loadAssignments();
  const at = String(trackId), of = String(gradeId), on = Number(level);
  const pick = (entry, source) => {
    if (!entry || !entry.engineId || !SAFE_ID.test(String(entry.engineId))) return null;
    return { engineId: String(entry.engineId), overrides: entry.overrides || {}, source };
  };

  const exact = pick((config.levels || {})[`${at}/${of}/${on}`], 'level');
  if (exact) return exact;

  // The broad rules (a grade, a subject, the default cycle) only reach ordinary
  // practice levels. A Master, Grand Master, Final or essay is a checkpoint with
  // a pass mark, and a retention level is retrieval practice built from blocks;
  // the cycle used to turn every one of them into a game, which served a Master
  // quiz as a game of snake. Naming the exact level above still assigns any of them.
  const gradeRow = curriculum.getGrade(at, of);
  if (gradeRow) {
    const kind = curriculum.levelKind(on, gradeRow.pathLength, gradeRow);
    if (kind !== 'practice') return null;
    // eslint-disable-next-line global-require
    const entry = require('./level-layout').entryFor(gradeRow, on) || {};
    if (/\(retention\)/i.test(String(entry.title || '')) || /^retention\b/i.test(String(entry.covers || ''))) return null;
    // Spanish has authored activity rows. Only rows explicitly named as games
    // should enter the broad engine cycle; previews, stories, speaking and tests
    // remain ordinary practice sessions with their own CSV title and coverage.
    if (at === 'spanish' && !/game/i.test(String(entry.type || ''))) return null;
  }
  const ofGrade = pick((config.grades || {})[`${at}/${of}`], 'grade');
  if (ofGrade) return ofGrade;
  const ofSubject = pick((config.subjects || {})[at], 'subject');
  if (ofSubject) return ofSubject;

  // Bank-fed games (BANK_GAMES, default on; services/game-bank.js, the rules in
  // curriculum-build/GAMES-PLACEMENT.md). On the tracks the bank covers, the
  // evidence placement decides which practice levels are games, their questions
  // are computed from the verified bank, and the engine cycle below is not used.
  // A grade with authored level assignments (English Proficient) keeps those and
  // its old behaviour. BANK_GAMES=off: exactly the rules below, as before.
  // eslint-disable-next-line global-require
  const bankGames = require('../services/game-bank');
  if (bankGames.governs(at) && !authoredGrade(config, at, of)) return bankGames.assignment(at, of, on);

  if (!(config.defaults || {}).cycle) return null;
  // Only ordinary practice levels reach this point (see above): the cycle hands
  // games to activities, and lessons, retention levels and checkpoints keep
  // their own kind of level.
  const engines = registeredEngines();
  if (!engines.length) return null;
  // Position in the grade's path, 1-based, matching the creator's variant rule.
  const index = ((on - 1) % engines.length);
  return { engineId: engines[index], overrides: {}, source: 'cycle' };
}

/** Every pairing that resolves, for the admin table and `show-assignments`. */
function assignments() {
  return loadAssignments();
}

module.exports = { resolve, registeredEngines, assignments };
