/**
 * The three trait groups the onboarding results are reported by (docs/ONBOARDING-MODES.md), worked out from the pool so they follow it:
 *   a  TASK    measures read by a behavioural task or reasoning item with validity 0.25 or more: working memory, processing speed, reading level,
 *              reasoning, task switching (families wm, speed, read, reason, switch). Established, fast, reliable tests exist for these.
 *   b  CHOICE  the other measures read, besides the self-report pair, by a mini-lesson choice point, an A/B taste, a confidence rating or a survey at 0.2 or more:
 *              a short choice task reads them moderately.
 *   c  SELF    measures whose only direct source is the two self-report items (and what the correlated posterior borrows from related traits and the
 *              factor self-ratings): memory decay, pacing, anxiety, feedback style and the like. The pool has no fast test for these on day 0.
 * The split is structural (it follows what the pool asks), not a result: the simulation says how much error each group actually loses.
 */
'use strict';

const { STATS } = require('../scorecard/stats');
const { pool } = require('./pool');

const TASK = new Set(['wm', 'speed', 'read', 'reason', 'switch']);
const CHOICE = new Set(['ml', 'taste', 'conf', 'goal']);

function build() {
  const best = {};
  for (const it of pool) for (const i of it.informs) {
    if (i.stat.startsWith('F:')) continue;
    const b = best[i.stat] || (best[i.stat] = {});
    b[it.family] = Math.max(b[it.family] || 0, i.r);
  }
  const groups = { a: [], b: [], c: [] };
  for (const s of STATS) {
    const b = best[s.id] || {};
    const task = Math.max(0, ...Object.keys(b).filter((f) => TASK.has(f)).map((f) => b[f]));
    const choice = Math.max(0, ...Object.keys(b).filter((f) => CHOICE.has(f)).map((f) => b[f]));
    groups[task >= 0.25 ? 'a' : choice >= 0.2 ? 'b' : 'c'].push(s.id);
  }
  return groups;
}
const GROUPS = build();
const LABELS = {
  a: 'established fast, reliable tests (working memory, speed, reading, reasoning, switching)',
  b: 'read moderately by a short choice task or survey',
  c: 'no fast test on day 0 (self-report pair and correlated traits only)',
};
module.exports = { GROUPS, LABELS };
