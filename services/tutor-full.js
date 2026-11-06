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
const safety = require('./tutor-safety');

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
  if (asksPlan && weak) return `From my notes, your shakiest: ${clip(weak.replace(/^Skills still weak[^:]*:\s*/, '').replace(/_/g, ' ').replace(/ \(\d+% over \d+ questions\)/g, ''), 100)}`;
  if (goals) return `Your goal as I have it: ${clip(goals.replace(/^Goals[^:]*:\s*/, ''), 140)}`;
  if (weak) return `From my notes, your shakiest: ${clip(weak.replace(/^Skills still weak[^:]*:\s*/, '').replace(/_/g, ' ').replace(/ \(\d+% over \d+ questions\)/g, ''), 100)}`;
  return '';
}

const DISCOURAGED = /\b(give up|giving up|hate this|everything sucks|too hard|useless|dumb|stupid|i quit|can'?t do this|too old|frustrat\w+|so tired|anxious|nervous|panic\w*|going to fail|gonna fail|i'?m lost|i don'?t get it|dont get it)\b/i;
const WANTS_ANSWER = /\b(just tell|tell me the answer|the answer|what is the answer|give me the answer|is it\b|is the answer|just say it|say it)\b/i;

/**
 * A reply with no model: what a person who knew the app and this learner would still say. Never an answer to a question
 * on screen. Order: a crisis is never here (it is answered before), then health, then their own material when it matches,
 * then the product, then this page's stuck advice, then one thing from their record, then the honest status.
 * @param {{user: object, page?: object, message?: string, mode?: string, name?: string, why?: string}} o
 * @returns {{reply: string, feature?: string}}
 */
/** A looser local search of the learner's own uploaded text: the best sentence sharing one meaningful word (by its first five letters). */
function looseMaterial(userId, msg) {
  try {
    const db = require('../config/db'); // eslint-disable-line global-require
    const stop = new Set('where what does says say about according notes note material mine your with that this from have what which when'.split(' '));
    const stem = (w) => w.slice(0, 5);
    const q = new Set((String(msg).toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !stop.has(w)).map(stem));
    if (!q.size) return [];
    let best = null;
    for (const c of db.find('material_courses', (x) => x.user_id === userId && ['ready', 'partial'].includes(x.status)).slice(0, 3)) {
      const m = db.byId('materials', c.material_id);
      if (!m || !m.text) continue;
      for (const sent of String(m.text).split(/(?<=[.!?])\s+/)) {
        const hit = new Set((sent.toLowerCase().match(/[a-z]{4,}/g) || []).map(stem).filter((w) => q.has(w)));
        if (hit.size && (!best || hit.size > best.n)) best = { n: hit.size, course: c.title, text: sent };
      }
    }
    return best ? [{ course: best.course, title: best.course, text: best.text }] : [];
  } catch { return []; }
}

function fallback({ user, page, message, mode = 'full', name = '', why = 'busy' }) {
  const msg = String(message || '');
  const path = page && page.path;
  const parts = [];
  const status = why === 'off' ? '' : `The live tutor is ${why === 'slow' ? 'slow' : 'busy'} right now, so this is from my notes instead of a full answer.`;
  let feature;
  const tri = safety.triage(msg, { age: null });
  if (tri && tri.reply) return { reply: tri.reply, feature }; // a crisis is the fixed reply on every path, even this one
  if (tri && tri.kind === 'medical') parts.push(safety.FIXED.medical);
  else {
    // Their own uploaded material, found locally (no model): quoted as theirs. Not on a graded page.
    let mat = [];
    if (mode !== 'method' && user) { try { mat = require('./material-grounding').retrieve(user.id, { query: msg, pageText: '', page }); } catch { mat = []; } } // eslint-disable-line global-require
    if (!mat.length && mode !== 'method' && user) mat = looseMaterial(user.id, msg);
    const aboutMine = /\b(my|our) (notes?|material|upload\w*|course|book|pdf|slides)\b|according to my|in my (notes|material)/i.test(msg);
    const hasMaterial = (() => { try { return require('../config/db').find('material_courses', (c) => c.user_id === (user && user.id) && ['ready', 'partial'].includes(c.status)).length > 0; } catch { return false; } })(); // eslint-disable-line global-require
    const m = howto.match(msg);
    const askingAnswer = WANTS_ANSWER.test(msg) && page && (page.question || /\/(session|skill-practice|review|placement|stage-check|skip|daily-check|enforcer|my-material-(test|study))/.test(String(path || '')));
    if (mat.length) {
      parts.push(`From your own material, "${mat[0].title || mat[0].course}": "${clip(mat[0].text, 300)}"`);
    } else if (aboutMine && hasMaterial && mode !== 'method' && !/(how do i|how can i|where (is|do)|how to)/i.test(msg)) {
      parts.push("I looked through your uploaded material and didn't find that in it, so I can't tell you what it says about it. I'd rather not guess.");
    } else if (askingAnswer) {
      parts.push("I won't hand over the answer, because working it out is what makes it stick.");
      const pg = howto.pageInfo(path);
      parts.push(pg ? pg.stuck : howto.stuckAdvice(path));
    } else if (m.length && m[0].score >= 1 && !/\b(answer|solve|what is \d|translate)\b/i.test(msg) && !(m[0].score < 2 && /^(what|why|who|how many|how long|is|will|does)\b/i.test(msg.trim()) && !/\b(page|button|app|where|how (do|can|to))\b/i.test(msg))) {
      feature = m[0].f.id;
      parts.push(`${m[0].f.title}: ${m[0].f.steps}`);
    } else {
      if (DISCOURAGED.test(msg)) parts.push("That sounds really frustrating, and it's okay to feel that way. One small step is enough for now.");
      const pg = howto.pageInfo(path);
      if (!pg || !/^(what|why|who|how many|how long|is|will|does)\b/i.test(msg.trim()) || DISCOURAGED.test(msg)) parts.push(pg ? `You're on ${pg.name}. ${pg.stuck}` : howto.stuckAdvice(path));
      else parts.push("I'm not sure about that one, and I can't check it right now, so I'd rather not guess.");
    }
    if (mode === 'method') parts.push('Here I can give hints about method only, so your result stays honest.');
  }
  const fit = fitLine(user && user.id, msg);
  if (fit) parts.push(fit);
  const body = `${parts.join(' ')} ${status} Ask me again in a moment and you'll get the full thing.`.replace(/\s+/g, ' ').trim();
  return { reply: name ? `${name}: ${body}` : body, feature };
}

module.exports = { on, DEFAULT_ON, DEADLINE_MS, withDeadline, fallback, fitLine };
