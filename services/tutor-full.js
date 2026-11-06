/**
 * The always-there tutor: the switch, the fallback and the deadline (owner, 6 Nov 2026).
 *
 *   on()                    TUTOR_FULL switch. Off: the dock behaves exactly as before this file existed.
 *   fallback({...})         a useful reply with NO model: the product answer, the page's stuck advice, and one thing
 *                           from the learner's own record, with an honest line about why it is short
 *   withDeadline(p, ms)     resolves null at the deadline instead of hanging (the reply path never waits past it)
 *   DEADLINE_MS             how long the dock waits for a model before it answers from here
 *
 * What it adds around services/tutor-context.js reply(): safety first (services/tutor-safety.js), plain how-to
 * questions answered at once (services/tutor-howto.js), the product and stuck notes in the prompt, a hard deadline,
 * and a fallback that is never a dead end. Merge note: tutor-context.js only calls into this file in a few places.
 *
 * Default: ON ONLY WHEN THE GATE PASSES (scripts/tutor-full-proof.js, docs/TUTOR-FULL.md). Until then it is behind
 * TUTOR_FULL=1.
 */
const howto = require('./tutor-howto');

const DEFAULT_ON = '0'; // set to '1' only when the proof's gates pass (docs/TUTOR-FULL.md)
const on = () => String(process.env.TUTOR_FULL === undefined ? DEFAULT_ON : process.env.TUTOR_FULL).trim() === '1';

const DEADLINE_MS = Number(process.env.TUTOR_DEADLINE_MS) || 14000;

function withDeadline(promise, ms = DEADLINE_MS) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([Promise.resolve(promise).catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

const clip = howto.clip;

/** One line from the learner's own record, fitted to what they asked. Never an answer to anything. */
function fitLine(userId, message) {
  let pack = [];
  try { pack = require('./tutor').pack(userId); } catch { pack = []; } // eslint-disable-line global-require
  const find = (p) => pack.find((l) => l.startsWith(p));
  const weak = find('Skills still weak');
  const goals = find('Goals');
  const asksPlan = /\b(what (should|do) i|next|plan|work on|start|today|how am i|doing)\b/i.test(message || '');
  if (asksPlan && weak) return `From my notes, your shakiest: ${clip(weak.replace(/^Skills still weak[^:]*:\s*/, ''), 140)}`;
  if (goals) return `Your goal as I have it: ${clip(goals.replace(/^Goals[^:]*:\s*/, ''), 140)}`;
  if (weak) return `From my notes, your shakiest: ${clip(weak.replace(/^Skills still weak[^:]*:\s*/, ''), 140)}`;
  return '';
}

/**
 * @param {{user: object, page?: object, message?: string, mode?: string, name?: string, why?: string}} o
 * @returns {{reply: string, feature?: string}}
 */
function fallback({ user, page, message, mode = 'full', name = '', why = 'busy' }) {
  const msg = String(message || '');
  const path = page && page.path;
  const m = howto.match(msg);
  const parts = [];
  const status = why === 'off' ? '' : `The live tutor is ${why === 'slow' ? 'slow' : 'busy'} right now, so this is from my notes instead of a full answer.`;
  let feature;
  if (m.length && m[0].score >= 1 && !/\b(answer|solve|what is \d|translate)\b/i.test(msg)) {
    feature = m[0].f.id;
    parts.push(`${m[0].f.title}: ${m[0].f.steps}`);
  } else {
    const pg = howto.pageInfo(path);
    if (pg) parts.push(`You're on ${pg.name}. ${pg.stuck}`);
    else parts.push(howto.stuckAdvice(path));
    if (mode === 'method') parts.push('Here I can give hints about method only, so your result stays honest.');
  }
  const fit = fitLine(user && user.id, msg);
  if (fit) parts.push(fit);
  const out = `${name ? `${name}, ` : ''}${parts.join(' ')} ${status} Ask me again in a moment and you'll get the full thing.`.replace(/\s+/g, ' ').trim();
  return { reply: out, feature };
}

module.exports = { on, DEFAULT_ON, DEADLINE_MS, withDeadline, fallback, fitLine };
