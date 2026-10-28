/**
 * The generated base-lesson pages, and who may see them.
 *
 * ## What a base lesson is
 *
 * One page per level, written by the model, and the same for everybody: it is the
 * lesson as the course teaches it, with nothing in it about any one learner.
 * Tailoring it per learner is a later step and a later prompt — this is the
 * baseline that step adapts, which is the only reason it is worth storing at all.
 *
 * ## Who sees it
 *
 * The creator's account, and accounts on the base subscription. That is two things
 * to check, and the second one does not exist in the app yet — there is no
 * subscription table, no billing, and nothing anywhere that says what an account
 * has paid for. So this answers it from what there is: the owner address, plus an
 * allowlist in the environment for accounts on the base plan.
 *
 * Inventing a subscription model here would be worse than reading one, because a
 * check that decides access from a table nobody maintains is a check that will
 * eventually let the wrong thing through. So `BASE_LESSON_ACCOUNTS` is the
 * allowlist, and an account that is not on it and is not the owner sees the
 * ordinary lesson path — which the app already serves and already works. Nothing is
 * taken away from anyone by this file; it only decides whether a generated page is
 * an option.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LESSON_DIR = path.join(ROOT, 'content', 'base-lessons');

/**
 * Where a lesson's own code is written so the browser can load it.
 *
 * Under `public/`, because the app's content security policy is `script-src 'self'`
 * and that permits a script from this origin and nothing else. A lesson's behaviour
 * arrives from the model as a string, and a string cannot be run on this page: not
 * written into the markup, not through `new Function`, not by appending a script
 * whose text is set. All three are refused by the policy, and all three fail
 * quietly, leaving a page that renders beautifully and does nothing.
 *
 * So the code becomes a file on this origin and is requested as an ordinary
 * `<script src>`. That is the only reason this directory exists, and it is
 * separated from `LESSON_DIR` so the generated pages and the code that runs them
 * are not confused with one another.
 */
const PUBLIC_SCRIPT_DIR = path.join(ROOT, 'public', 'base-lesson-scripts');

/** The account that owns the product: config/owner.js (OWNER_EMAIL overrides it). */
const owner = require('./owner');

/**
 * Accounts on the base subscription, as addresses.
 *
 * From `BASE_LESSON_ACCOUNTS` — a comma-separated list, the same shape as every
 * other list in `.env`. Unset means only the owner sees generated pages, which is
 * the safe reading: a feature nobody can reach is a feature nobody is hurt by.
 */
function baseLessonAccounts() {
  return String(process.env.BASE_LESSON_ACCOUNTS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * May this account see generated base lessons?
 *
 * The owner, or an address on the base list. Compared case-insensitively and
 * trimmed, because the address a learner signs in with is not under our control
 * and a check that turns on capitalisation denies the owner their own product.
 *
 * @param {{email: string}|null} user
 * @returns {boolean}
 */
function canSeeBaseLessons(user) {
  if (!user || !user.email) return false;
  const email = String(user.email).trim().toLowerCase();
  return owner.isOwner(user) || baseLessonAccounts().includes(email);
}

/** A lesson is generated once and read often, so it is held in memory. */
const cache = new Map();

/**
 * The path of a level's page, or null when it has not been generated.
 *
 * Checked on disk rather than assumed, because "no page" and "the directory is
 * missing" have to be the same answer: a level that has never been generated is
 * not an error, it is just the ordinary lesson path.
 */
function pathFor(trackId, gradeId, level) {
  // One number, two path segments that came from the curriculum — so neither is
  // trusted to be a plain name.
  if (!/^[a-z0-9_-]+$/i.test(String(trackId)) || !/^[a-z0-9_-]+$/i.test(String(gradeId))) {
    return null;
  }
  if (!Number.isInteger(Number(level)) || Number(level) < 1) return null;
  const file = path.join(LESSON_DIR, String(trackId), String(gradeId), `level-${Number(level)}.html`);
  // The join above is already inside the directory, but a name that survived the
  // test cannot climb out of it — which is the whole point of the test.
  return file;
}

/**
 * Is there a generated page for this level?
 *
 * @returns {boolean}
 */
function exists(trackId, gradeId, level) {
  const file = pathFor(trackId, gradeId, level);
  if (!file) return false;
  const cached = cache.get(file);
  if (cached !== undefined) return true;
  return fs.existsSync(file);
}

/**
 * The generated page for a level, or null.
 *
 * Cached by path, and re-read when the file changes, so a page regenerated while
 * the server is running is picked up without a restart — otherwise a lesson would
 * need the server bounced every time the model is asked for a better one.
 *
 * @returns {{html: string, meta: object}|null}
 */
function get(trackId, gradeId, level) {
  const file = pathFor(trackId, gradeId, level);
  if (!file || !fs.existsSync(file)) return null;
  const mtime = fs.statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit;
  const html = fs.readFileSync(file, 'utf8');
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(`${file}.meta.json`, 'utf8'));
  } catch { /* a page with no note beside it is still a page */ }
  const entry = { html, meta, mtime };
  cache.set(file, entry);
  return entry;
}

/**
 * What the path should offer this account: a generated page, or the ordinary one.
 *
 * The reason this is one question asked in one place is that it is asked in three
 * places — the path page, the session route and the curriculum — and three
 * answers that can disagree is how a level ends up offering a generated page to
 * nobody and an ordinary one to somebody who should have had the other.
 *
 * @returns {{kind: 'base', html: string, meta: object}|{kind: 'ordinary'}}
 */
function lessonFor(user, trackId, gradeId, level) {
  if (!canSeeBaseLessons(user)) return { kind: 'ordinary' };
  const found = get(trackId, gradeId, level);
  return found ? { kind: 'base', html: found.html, meta: found.meta } : { kind: 'ordinary' };
}

/**
 * Every level of a grade that has a generated page.
 *
 * Read from the directory rather than kept in memory, because pages are written by
 * a script that may run while the server does, and a list held in memory would
 * go on offering links to levels that have no page. Sorted numerically, because a
 * directory listing sorts 100 before 20 and a learner would see the levels in an
 * order that has nothing to do with the course.
 *
 * @returns {number[]}
 */
function levelsFor(trackId, gradeId) {
  if (!/^[a-z0-9_-]+$/i.test(String(trackId)) || !/^[a-z0-9_-]+$/i.test(String(gradeId))) {
    return [];
  }
  const dir = path.join(LESSON_DIR, String(trackId), String(gradeId));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((name) => /^level-(\d+)\.html$/.exec(name))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

module.exports = {
  canSeeBaseLessons, baseLessonAccounts, exists, get, lessonFor, pathFor,
  levelsFor, LESSON_DIR, PUBLIC_SCRIPT_DIR,
  get OWNER() { return owner.ownerEmail(); },
};
