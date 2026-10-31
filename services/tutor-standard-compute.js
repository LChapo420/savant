/**
 * When the tutor may use Standard Compute (https://api.stdcmpt.com), the paid gateway that also carries
 * stronger models than the free NVIDIA lineup. Owner decision, 30 Oct 2026: the tutor "shouldn't just be
 * built on free models, it should be allowed to use Standard Compute since it has stronger models too".
 *
 * Until then Standard Compute was pipeline-only (services/providers/standard-compute.js,
 * STANDARD_COMPUTE_PIPELINE=1, never in a learner chain). This file is the one exception, and it is narrow:
 *
 *   tasks     only the tutor's own: TASKS below (the dock reply, its answer-leak check, the memory fold and the
 *             fact reader). Every other learner task stays on the approved free chain; pipeline use elsewhere
 *             is unchanged.
 *   budget    TUTOR_CAP_USD = $26.00, a CODE constant (owner, 30 Oct: 80% of the $20 Standard Compute cap; raised by $10 on 31 Oct).
 *             The ledger refuses a call whose reservation would take the COMMITTED total (settled + open
 *             reservations + the $0.50 seed) past it, atomically (services/standard-compute-ledger.js
 *             `ceilingUsd`). Above it the dock falls back to the free NVIDIA lineup without an error. The
 *             environment may lower the figure (STANDARD_COMPUTE_TUTOR_CAP_USD), never raise it.
 *   privacy   a learner under 13 without verified parental consent NEVER goes to Standard Compute (their
 *             words stay on NVIDIA or this machine). Verified parental consent means the consent record is
 *             active AND its third-party-AI opt-in is on (routes/consent.js access().ai_free_text). A learner
 *             whose consent does not allow outside AI at all is also refused (services/ai.js already keeps
 *             them on local models). An unknown learner id is refused: the tutor always has one.
 *   money     every call reserves and settles in the ledger (providers/standard-compute.js `post`).
 *   speed     the model answers first; NVIDIA starts as a backup if there is no answer in ~4 s (the dock's
 *             hedgeAfterMs, services/pool.js), so a slow or failing Standard Compute costs the learner nothing.
 *   switch    STANDARD_COMPUTE_TUTOR=0 turns the tutor's use off.
 *
 * Mechanism ids: 06-M1 (the dock), 06-M11 (memory), 06-M12 (learner text is content). See
 * curriculum-build/evidence-article/06-always-on-tutor.md.
 */
const ledger = require('./standard-compute-ledger');

/** 80% of the $20 Standard Compute cap (owner, 30 Oct 2026): above this committed total the tutor uses NVIDIA only. */
const TUTOR_CAP_USD = 26.0; // owner 2026-10-31: the Standard Compute budget raised by $10 (was $16)
/** The tutor's tasks that may use the model (the dock and its memory). */
const TASKS = new Set(['dock_help', 'dock_leak_check', 'tutor_memory_fold', 'tutor_facts']);
/** Strongest priced chat model on the gateway (DeepSeek V4.1). The ledger knows its price; an unpriced model would be under-counted. */
const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash-1017';

/** The ceiling in force: the constant, or a lower figure from the environment. Never higher. */
function ceilingUsd() {
  const env = Number(process.env.STANDARD_COMPUTE_TUTOR_CAP_USD);
  return Number.isFinite(env) && env >= 0 ? Math.min(env, TUTOR_CAP_USD) : TUTOR_CAP_USD;
}

function switchedOn() {
  return String(process.env.STANDARD_COMPUTE_TUTOR || '1').trim() !== '0';
}

function keyPresent() {
  return !!String(process.env.STANDARD_COMPUTE_API_KEY || '').trim();
}

function modelName() {
  return String(process.env.STANDARD_COMPUTE_TUTOR_MODEL || DEFAULT_MODEL).trim();
}

/**
 * Whether this learner's words may go to Standard Compute. Pure policy, no ledger: false for an unknown user,
 * for one whose consent does not allow outside AI, and for an under-13 without verified parental consent.
 */
function learnerAllowed(userId) {
  if (!userId) return false;
  try {
    // eslint-disable-next-line global-require
    const db = require('../config/db');
    const user = db.byId('users', userId);
    if (!user) return false;
    // eslint-disable-next-line global-require
    const access = require('../routes/consent').access(user);
    if (!access || !access.ai_free_text) return false;
    const check = user.age_check;
    if (check && check.under_13 && access.state !== 'active') return false;
    return true;
  } catch {
    return false; // cannot tell: the words stay on the free chain
  }
}

/** Why the tutor may not use Standard Compute for this call right now, or null when it may. */
function refusal({ userId, task, estimateUsd = 0 } = {}) {
  if (!switchedOn()) return 'switched off (STANDARD_COMPUTE_TUTOR=0)';
  if (!keyPresent()) return 'no Standard Compute key';
  if (!TASKS.has(task)) return `not a tutor task (${task})`;
  if (!learnerAllowed(userId)) return 'privacy: this learner is not cleared for Standard Compute';
  if (!ledger.canSpend(Math.max(0.0005, estimateUsd), ceilingUsd())) return `the tutor's $${ceilingUsd().toFixed(2)} ledger ceiling is reached`;
  return null;
}

const allowed = (args) => refusal(args) === null;

module.exports = { TUTOR_CAP_USD, TASKS, DEFAULT_MODEL, ceilingUsd, modelName, learnerAllowed, refusal, allowed, keyPresent, switchedOn };
