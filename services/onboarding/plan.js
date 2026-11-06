/**
 * Onboarding modes and the planner that walks one learner through one of them.
 *
 * The owner's limits (2026-11-02): Quick under 5 minutes, Balanced about 15 to 20, Accurate under 60. Each mode has a hard time budget in
 * seconds of the LEARNER'S OWN pace: the planner tracks how long their items actually take against the median, and never starts an item that
 * would not fit in what is left at that pace (with a small margin while the pace is still uncertain). So a slow learner gets fewer items, not
 * a longer session: Quick stays under 5 minutes for the median learner and its p90 under 6 (docs/ONBOARDING-MODES.md, simulated).
 *
 * The planner is the same code in the simulator (scripts/onboarding-sim.js) and in the server session (services/onboarding/index.js).
 */
'use strict';

const model = require('./model');
const { pool, byId } = require('./pool');

const INTRO_SEC = 15;   // reading the first screen

const MODES = {
  quick: {
    id: 'quick', label: 'Quick', minutes: 5, budgetSec: 285, minGainPerMin: 0, margin: 1.12,
    required: ['sv:interests'],
    blurb: 'A first picture of how you learn, in under 5 minutes. Fewer things measured, and with less certainty. Good to start; you can go deeper any time.',
  },
  balanced: {
    id: 'balanced', label: 'Balanced', minutes: 19, budgetSec: 1170, minGainPerMin: 0.05, margin: 1.08,
    required: ['sv:interests', 'sv:studying', 'sv:hobbies'],
    blurb: 'About 15 to 20 minutes: short tasks (memory, speed, reading, reasoning), a mini-lesson where you make choices, and a few quick questions. The best accuracy for the time.',
  },
  accurate: {
    id: 'accurate', label: 'Accurate', minutes: 59, budgetSec: 3540, minGainPerMin: 0.05, margin: 1.05,
    required: ['sv:interests', 'sv:studying', 'sv:hobbies', 'sv:sports', 'sv:notes', 'sv:why'],
    blurb: 'Under an hour, with breaks whenever you want: everything above, more of it, and two ways of being taught tried side by side. The most accurate starting picture possible.',
  },
};

const STAT_IDS = require('../scorecard/stats').STATS.map((s) => s.id);

class Planner {
  /**
   * @param {string} modeId
   * @param {{state?:object, used?:string[], importance?:object}} [prior] what is already known (a deeper retake builds on it)
   */
  constructor(modeId, prior = {}) {
    this.mode = MODES[modeId];
    if (!this.mode) throw new Error(`unknown onboarding mode ${modeId}`);
    this.state = prior.state ? JSON.parse(JSON.stringify(prior.state)) : model.emptyState();
    this.used = new Set(prior.used || []);
    this.importance = prior.importance || null;
    this.elapsed = INTRO_SEC;
    this.nominal = 0;      // median seconds of what has been done
    this.actual = 0;       // the learner's seconds for the same
    this.log = [];
    this.queue = this.mode.required.filter((id) => !this.used.has(id));
  }

  /** The learner's pace against the median, shrunk toward 1 until there is about a minute of evidence. */
  get pace() { return Math.min(2, Math.max(0.6, (this.actual + 60) / (this.nominal + 60))); }
  get secondsLeft() { return this.mode.budgetSec - this.elapsed; }

  /** The next item (an object from the pool), or null when the mode is done. Required items come first, in order. */
  next() {
    if (this.queue.length) return byId[this.queue[0]];
    const hit = model.pickNext(this.state, pool, {
      used: this.used,
      secondsLeft: this.secondsLeft,
      pace: this.pace * this.mode.margin,
      importance: this.importance,
      minGainPerMin: this.mode.minGainPerMin,
      only: (it) => !it.free && !(it.dailyOnly && this.mode.id !== 'daily') && (!this.available || this.available(it)),
    });
    return hit ? hit.item : null;
  }

  /**
   * Record an answered item. `readings` is one standardised, SIGN-ADJUSTED reading per measure the item reads ({stat: x}); `seconds` is how long
   * it actually took. Free items (confidence ratings) that this unlocks are the caller's to read: see unlockedFree().
   */
  record(item, readings, seconds) {
    this.used.add(item.id);
    if (this.queue[0] === item.id) this.queue.shift();
    for (const i of item.informs) {
      if (readings[i.stat] !== undefined) model.bump(this.state, i.stat, item.family, model.eff(item.family, i.r), readings[i.stat]);
    }
    if (!item.free) { this.nominal += item.sec; this.actual += seconds; }
    this.elapsed += seconds;
    this.log.push({ id: item.id, seconds });
  }

  /** Free items (no seconds of their own) whose parents are now answered. */
  unlockedFree() {
    return pool.filter((it) => it.free && !it.passive && !this.used.has(it.id) && it.requires.every((id) => this.used.has(id)));
  }

  estimates() { return model.estimates(this.state, STAT_IDS); }

  toJSON() { return { mode: this.mode.id, state: this.state, used: [...this.used], elapsed: this.elapsed, nominal: this.nominal, actual: this.actual, queue: this.queue, log: this.log }; }
  static from(json, prior = {}) {
    const p = new Planner(json.mode, prior);
    Object.assign(p, { state: json.state, used: new Set(json.used), elapsed: json.elapsed, nominal: json.nominal, actual: json.actual, queue: json.queue, log: json.log });
    return p;
  }
}

module.exports = { MODES, INTRO_SEC, Planner, STAT_IDS };
