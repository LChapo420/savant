/**
 * Question fit (docs/speed-real/ROUND4.md finding 5, docs/UPLOAD-4X.md): a practice level's bank questions are written per coarse skill, so most do not practise the lesson's own topic
 * (AI-judged: 4.9% did). SPEED_TOPIC_FIT=on picks, for a lesson's focus and stretch slots, the bank question that overlaps the lesson's title and "what it teaches" most, out of a wider draw
 * from the same skill and difficulty. It cannot make a question the generators do not write: when no draw overlaps, it takes the nearest and says so (`fit` below 1). Pure functions, no I/O.
 */
'use strict';

const STOP = new Set('a an the of to in on and or is are was were be it its for by with as at from that this which what who how does do did you your if then than so not no can will into out up down over under one two each any all some more most about when where why'.split(' '));
const stem = (w) => w.replace(/(ing|edly|ed|es|s|ly)$/, (m, s, off) => (off >= 3 ? '' : s));
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
const enabled = () => String(process.env.SPEED_TOPIC_FIT || 'off').toLowerCase() === 'on';
const DRAW = 24;

/** The topic as a weighted bag: title words count double. */
function topicOf(title, covers) {
  const bag = new Map();
  for (const t of tokens(title)) bag.set(t, (bag.get(t) || 0) + 2);
  for (const t of tokens(covers)) bag.set(t, (bag.get(t) || 0) + 1);
  return bag;
}

/** Share of the topic's weight that the question's own words (prompt, choices) reach, 0 to 1. The answer key and rationale are left out so a question is not credited for explaining the topic after the fact. */
function fit(item, topic) {
  if (!item || !topic || !topic.size) return 0;
  const words = new Set([...tokens(item.prompt), ...tokens(Array.isArray(item.choices) ? item.choices.map((c) => (typeof c === 'string' ? c : c && c.text)).join(' ') : '')]);
  let hit = 0; let all = 0;
  for (const [t, w] of topic) { all += w; if (words.has(t)) hit += w; }
  return all ? hit / all : 0;
}

/** The best of `draw` candidates, `generate(i)` each, skipping ones `taken(item)` refuses. { item, fit, tried }. The first candidate is kept when nothing beats it by overlap, so the choice is never worse than today's. */
function pick(generate, topic, taken = () => false, draw = DRAW) {
  let best = null; let bestFit = -1; let first = null; const seenKeys = new Set(); let tried = 0;
  for (let i = 0; i < draw; i++) {
    let item; try { item = generate(i); } catch { item = null; }
    if (!item) continue;
    const key = `${item.prompt}|${item.answer}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key); tried++;
    if (taken(item)) continue;
    if (!first) first = item;
    const f = fit(item, topic);
    if (f > bestFit) { bestFit = f; best = item; }
  }
  return best ? { item: best, fit: Math.max(0, bestFit), tried } : { item: first, fit: 0, tried };
}

module.exports = { enabled, tokens, topicOf, fit, pick, DRAW };
