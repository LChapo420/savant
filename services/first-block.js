/**
 * Cold first lesson, part by part (brief cold-write, 7 Nov 2026; COLD_FIRST_BLOCK=on, default off, docs/FIRST-LESSON.md "Cold write").
 *
 * A learner with no shared lesson at their level used to wait for the whole level: layout, fill, a fact read of everything, repairs, a blind check. A lesson is a
 * list of blocks, so here it is written as one streamed fill and checked part by part: the first block goes to its fact read as soon as it has been written, the page
 * opens when that read passes, and later parts arrive below it as they pass, in order. Nothing is shown before its own check has finished.
 *
 * This file holds the pure parts: reading blocks out of a streaming reply, telling a reply that has derailed, the switches, what is published so far and the parked heads
 * of prewrites. The write itself is services/block-levels.js writeInParts; the page is public/js/block-level.js.
 *
 * Env: COLD_FIRST_BLOCK=on, COLD_PART_READS (3, part reads at once for one level), COLD_FALLBACK_MS (30000, how long the page waits before the standard session),
 * COLD_HEAD_TTL_MS (30 minutes, a parked prewrite head is let go), COLD_BLOCK_MAX_CHARS (9000, a single block's text past this is a derail).
 */
const on = () => String(process.env.COLD_FIRST_BLOCK || '').toLowerCase() === 'on';
const partReads = () => Math.max(1, Number(process.env.COLD_PART_READS || 3));
const fallbackMs = () => Math.max(8000, Number(process.env.COLD_FALLBACK_MS || 30000));
const headTtlMs = () => Number(process.env.COLD_HEAD_TTL_MS || 30 * 60 * 1000);
const maxBlockChars = () => Number(process.env.COLD_BLOCK_MAX_CHARS || 9000);
const maxChecksChars = () => Number(process.env.COLD_CHECKS_MAX_CHARS || 9000);

/**
 * Reads the complete top-level entries of the reply's "blocks" array as the text grows. A small state machine over strings, escapes and depth, not a JSON parser:
 * it never looks back, so feeding it a growing reply is linear. `feed(text)` takes the whole text so far and returns the new entries (parsed objects; null for one
 * that does not parse). `current()` is the characters of the entry still open.
 */
function blockReader() {
  const st = { i: 0, started: false, done: false, depth: 0, inStr: false, esc: false, start: -1 };
  return {
    feed(text) {
      if (!st.started) {
        const m = /"blocks"\s*:\s*\[/.exec(text);
        if (!m) return [];
        st.started = true;
        st.i = m.index + m[0].length;
      }
      const out = [];
      if (st.done) return out;
      for (; st.i < text.length; st.i++) {
        const c = text[st.i];
        if (st.inStr) {
          if (st.esc) st.esc = false;
          else if (c === '\\') st.esc = true;
          else if (c === '"') st.inStr = false;
        } else if (c === '"') st.inStr = true;
        else if (c === '{') {
          if (st.depth === 0) st.start = st.i;
          st.depth += 1;
        } else if (c === '}') {
          st.depth -= 1;
          if (st.depth === 0 && st.start >= 0) {
            let entry = null;
            try { entry = JSON.parse(text.slice(st.start, st.i + 1)); } catch { entry = null; }
            out.push(entry);
            st.start = -1;
          }
        } else if (c === ']' && st.depth === 0) {
          st.done = true;
          break;
        }
      }
      return out;
    },
    current(text) { return st.started && !st.done && st.start >= 0 ? text.length - st.start : 0; },
    finished() { return st.done; },
    /** Characters past the end of the blocks: the checks, which are short. */
    after(text) { return st.done ? text.length - st.i : 0; },
  };
}

/**
 * Has this streamed reply derailed? A loop (the tail repeats itself: the same run of 8 to 80 characters at least 6 times over), or one block far longer than any real block,
 * or checks far longer than any real checks. Measured 6 to 7 Nov on Coral Fast's fills of a formula block: a loop to the output cap costs 20 to 96 s when nobody watches it.
 * A long array of distinct tokens is not a loop; a table of the same short cell can be, so the run must be 8 characters or more.
 */
function derailed(text, openChars = 0, afterChars = 0) {
  if (openChars > maxBlockChars()) return 'one block is far too long';
  if (afterChars > maxChecksChars()) return 'the checks are far too long';
  const n = text.length;
  if (n < 200) return null;
  const tail = text.slice(-600);
  for (let len = 8; len <= 80; len++) {
    const unit = tail.slice(-len);
    let repeats = 1;
    while (repeats < 6 && tail.slice(-(len * (repeats + 1)), -(len * repeats)) === unit) repeats += 1;
    if (repeats >= 6) return `the reply repeats itself: ${JSON.stringify(unit.slice(0, 40))}`;
  }
  return null;
}

// ── what the write is doing, for the page's honest wait ────────────────────
const progress = new Map(); // plan key -> { stage, parts, at, published: Promise-free event list }
const listeners = new Map(); // plan key -> resolvers waiting for the first published part
const trace = (key, what) => { if (process.env.COLD_TRACE) console.log(`cold ${new Date().toISOString().slice(14, 23)} ${key} ${what}`); };
function setStage(key, stage, extra = {}) {
  trace(key, `stage ${stage}`);
  const was = progress.get(key) || {};
  progress.set(key, { ...was, ...extra, stage, at: Date.now() });
  if (progress.size > 2000) progress.delete(progress.keys().next().value);
}
const stageOf = (key) => (progress.get(key) || {}).stage || null;
const clearStage = (key) => progress.delete(key);
/** Resolves when this level's first part is published, or at `ms`, whichever is sooner (to true or false). */
function firstPublished(key, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { done(false); }, ms);
    let settled = false;
    function done(v) { if (settled) return; settled = true; clearTimeout(timer); resolve(v); }
    const list = listeners.get(key) || [];
    list.push(done);
    listeners.set(key, list);
  });
}
function notifyPublished(key) {
  const list = listeners.get(key) || [];
  listeners.delete(key);
  list.forEach((done) => done(true));
}

// ── parked heads ───────────────────────────────────────────────────────────
// A prewrite stops after the first part (layout, one block, its check) and waits here for the learner to land on that level. It costs one small fill and one small read,
// so more guesses can be afforded than whole-level prewrites could. In memory: after a restart the row is an ordinary row left at 'writing', written again on the next visit.
const parked = new Map(); // plan key -> { state, at, onExpire }
function park(key, state, onExpire = null) {
  parked.set(key, { state, at: Date.now(), onExpire });
  for (const [k, p] of parked) {
    if (Date.now() - p.at > headTtlMs()) {
      parked.delete(k);
      if (p.onExpire) { try { p.onExpire(); } catch { /* a stale row is written again on the next visit */ } }
    }
  }
}
function takeParked(key) {
  const p = parked.get(key);
  if (!p) return null;
  parked.delete(key);
  return p.state;
}
const isParked = (key) => parked.has(key);
function _reset() { parked.clear(); progress.clear(); listeners.clear(); }

/** The problems a block must not go out with before the rest of the level is written: the spec checks that can be judged on one block. */
const BLOCKING_NOW = new Set(['profile_leak', 'avoid_domain']);

/** What a level's learner can be shown while its first part is written: from the curriculum, nothing written by a model, so true before any check. */
function previewOf({ topic, covers, skillNames }) {
  return { topic: String(topic || ''), covers: String(covers || ''), skills: (skillNames || []).filter(Boolean).slice(0, 4) };
}

module.exports = { trace, on, partReads, fallbackMs, blockReader, derailed, setStage, stageOf, clearStage, firstPublished, notifyPublished, park, takeParked, isParked, previewOf, BLOCKING_NOW, _reset };
