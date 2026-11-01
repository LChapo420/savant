/**
 * Item skill tags: which questions need one particular reasoning skill, so an ability-like stat can be read from the answers themselves.
 *
 * A stat such as pattern detection or far transfer is about doing well on the questions that need it. With the questions tagged, the app
 * reads it the way it reads language level from wordy questions (signals.js SHIFTS, vocabulary_ceiling): within each level, the learner's
 * answers on the tagged questions against what the ability model expected of them, minus the same on the untagged ones. A learner strong
 * at spotting patterns does better than their own level predicts on the pattern questions; one who struggles with it does worse. Their
 * overall level, the item's difficulty label and the skill are out of it, because each answer is read against the ability model.
 *
 * Where the tags come from: scripts/tag-question-skills.js labels curriculum questions (question text only, never a learner's data) with a
 * free pipeline model and writes content/item-skill-tags.json, keyed by tagKey below. An item row may also carry its own `skill_tags`
 * (a generator or the sim can set them). Symbolic notation is also detected from the text itself (notationOf). A question with no known
 * tags counts toward neither side of any tag: unknown is not "untagged".
 *
 * The tags are a model's labels and are noisy, so these readings are held to validity 0.8 (scorecard/index.js validityOf), like other
 * readings through a second model. SCORECARD_ITEM_TAGS=off turns them all off.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** The tag stats, and what a question needs to carry each tag (the tagger's definitions, also shown to it). */
const TAGS = {
  pattern_detection: 'the answer comes from noticing a pattern or regularity (a sequence, a repeated structure, a rule behind examples)',
  logical_rigor: 'the answer needs exact reasoning with conditions, cases or exceptions; an intuitive reading gets it wrong',
  causal_chain_depth: 'the answer needs following a chain of two or more cause-and-effect or if-then steps',
  systems_thinking: 'the answer needs seeing how several parts or ideas interact or depend on each other',
  contradiction_sensitivity: 'the answer needs noticing that something does not fit: an inconsistency, an exception, or a near-miss distractor',
  near_transfer: 'the question applies a taught method to a problem that looks a little different from the taught examples',
  far_transfer: 'the question applies the idea in an unfamiliar context or another field than the one it was taught in',
  notation_comfort: 'the question is written in symbolic notation (formulas, operators, variables) rather than words',
};
const TAG_STATS = Object.keys(TAGS);
const TABLE_FILE = process.env.ITEM_TAGS_FILE || path.join(__dirname, '..', '..', 'content', 'item-skill-tags.json');

/** A question's identity for the tag table: its skill and its prompt with numbers masked (generated variants of one question share it). */
function tagKey(item) {
  const prompt = String((item && (item.prompt || item.question)) || '').toLowerCase().replace(/[0-9]+(\.[0-9]+)?/g, '#').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha1').update(`${(item && item.skill_id) || ''}|${prompt}`).digest('hex').slice(0, 16);
}

let table = null;
function load() {
  if (table) return table;
  try {
    const j = JSON.parse(fs.readFileSync(TABLE_FILE, 'utf8'));
    table = j && j.tags && typeof j.tags === 'object' ? j.tags : {};
  } catch {
    table = {};
  }
  return table;
}
function _setTable(t) { table = t; }

/** Symbolic notation in the text: an operator between terms, a power, a root, a variable next to a number, or an equation. */
function notationOf(item) {
  const t = String((item && (item.prompt || item.question)) || '');
  return /[=<>≤≥√π∑∫^±×÷]|\d\s*[a-z]\b|\b[a-z]\s*[+\-*/=]\s*[a-z0-9]|\d+\s*\/\s*\d+/i.test(t);
}

/**
 * What is known about a question's tags: { on, known }, two Sets of tag stats (on: it carries the tag; known: whether it does is known).
 * A tagged question (its own skill_tags, or a table entry) has every tag known: the list is the full list for it. Any other question has
 * only notation known, read from its text. Null when tags are off or the item is missing.
 */
function tagsOf(item) {
  if (!item || process.env.SCORECARD_ITEM_TAGS === 'off') return null;
  let list = null;
  if (Array.isArray(item.skill_tags)) list = item.skill_tags;
  else {
    const hit = load()[tagKey(item)];
    if (Array.isArray(hit)) list = hit;
  }
  const on = new Set((list || []).filter((t) => TAGS[t]));
  if (!Array.isArray(item.skill_tags) && notationOf(item)) on.add('notation_comfort');
  const known = list ? new Set(TAG_STATS) : new Set(['notation_comfort']);
  return { on, known };
}

module.exports = { TAGS, TAG_STATS, tagKey, tagsOf, notationOf, load, _setTable, TABLE_FILE };
