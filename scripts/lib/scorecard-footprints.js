/**
 * Phase 4 of docs/SCORECARD-90.md (section 11): app-native BEHAVIOURAL FOOTPRINTS for the worst scorecard measures, i.e. things a learner does inside
 * normal use (a choice in a lesson, a voluntary extra, a planner goal kept) whose errors are independent of the designed tasks' errors.
 *
 * EVERYTHING HERE IS A DESIGN WITH ASSUMED VALIDITIES. Nothing is in the product, and no number below is a real-learner result. This file is read by
 * scripts/scorecard-90-measure.js (--foot=1, off by default: the default sim and the --gate-check baseline are unchanged) and is the one list the product
 * work in docs/SCORECARD-90.md section 11.6 follows. The names of the in-lesson choices are the ones services/onboarding/tasks.js scoreMiniLesson already
 * reads in the day-0 mini-lesson (first, hint, plan, deeper, mode, bonus, order, connect, feel, mine, unclear, more): the same choice points, offered
 * again inside ordinary lessons, so the two share their wording and scoring code.
 *
 * How a footprint is modelled (the sim's own source model, scripts/scorecard-90-measure.js): an event reads the measure as x = z + u + e, u a PERSISTENT
 * error shared by every event of that footprint on that learner (the learner's own habits: a person who always skips extras skips them whatever their
 * trait), e fresh per event. rho1 = reliability of one event against the true value, rhoInf = the most any number of events could reach (validity
 * squared). Independence of u across footprints, and from the designed tasks' errors, is an ASSUMPTION (it is what makes them add) and is the thing
 * most likely to be wrong: the section 11 sensitivity runs scale validity down, they do not model shared errors.
 *
 * Kinds (all CONSERVATIVE: below the day-0 mini-lesson family in services/onboarding/model.js, ceiling validity 0.55, because in-use choices are made
 * in a messier context: mood, time of day, what the lesson was about):
 *   CP   a choice point inside a lesson, 5 to 8 seconds of the learner's time, charged to the measuring budget.
 *        One event r about .2 (rho1 .04), ceiling validity .40 (rhoInf .16). Anchor: behaviour against trait aggregates to about .4 only over many
 *        occasions (Epstein 1979, principle of aggregation; Fleeson & Gallagher 2009, trait-behaviour correlations of about .4 for averaged behaviour).
 *   VOL  a voluntary behaviour the app logs anyway (extra practice, a start without a reminder, a retry after a fail, a goal kept). No extra seconds.
 *        r about .14 per event (rho1 .02), ceiling validity .35 (rhoInf .12). Anchor: traits from digital-footprint behaviour r .29 to .40 in a
 *        meta-analysis (Azucar, Marengo & Settanni 2018); free-choice persistence is the standard behavioural measure of intrinsic motivation
 *        (Deci, Koestner & Ryan 1999).
 *   EMB  a variation built into a normal practice item (a rule switch inside a mixed-rule set), 3 seconds more than the plain item.
 *        r about .17 per event (rho1 .03), ceiling validity .50 (rhoInf .25). Anchor: switch-cost difference scores are weakly reliable, so the
 *        ceiling is low (Hedge, Powell & Sumner 2018).
 *   PRM  a one-tap prompt answered in the flow (how did that feel, link this to something you know). 3 to 8 seconds.
 *        rho1 .04, ceiling validity .35 (rhoInf .12): a self-report in context, below the questionnaire ceiling the sim already gives SCALE items.
 * The citations are from memory and the exact coefficients were not re-checked in this session; the model uses only the rounded numbers above.
 *
 * Each footprint: { id, kind, reads: [measure ids], cap (events a month the app can see), sec (charged per event, 0 for VOL),
 *                   ui (what the learner sees), file (where it would live), why (the research reason it should read the measure) }.
 * A footprint that reads several measures reads them all from one event (one cost), at the same validity each (a shared trial: its noise is x1.3).
 */
'use strict';

const KINDS = {
  CP:  { rho1: 0.04, rhoInf: 0.16, note: 'a choice point inside a lesson (validity .20 an event, .40 aggregated)' },
  VOL: { rho1: 0.02, rhoInf: 0.12, note: 'a voluntary behaviour logged anyway (validity .14 an event, .35 aggregated)' },
  EMB: { rho1: 0.03, rhoInf: 0.25, note: 'a variation inside a normal practice item (validity .17 an event, .50 aggregated)' },
  PRM: { rho1: 0.04, rhoInf: 0.12, note: 'a one-tap prompt answered in the flow (validity .20 an event, .35 aggregated)' },
};

const FOOTPRINTS = [
  { id: 'why_or_steps', kind: 'CP', reads: ['conceptual_bias'], cap: 200, sec: 5,
    ui: 'Under each worked step: "Why does this work?" (opens the reasoning) beside the steps already shown; the log keeps which the learner opened first and for how long.',
    file: 'public/js/session.js (step renderer) + routes/learn.js (a footprint field on the level-complete POST)',
    why: 'preference for the reason over the recipe is need for cognition shown as a choice (Cacioppo & Petty 1982)' },
  { id: 'deeper_or_move_on', kind: 'CP', reads: ['depth_breadth'], cap: 200, sec: 5,
    ui: 'End of a level: "Go deeper on this" or "Next topic" (the next level is the same one either way).',
    file: 'public/js/session.js (level-complete card)',
    why: 'depth against breadth is how a learner forages through material (Pirolli & Card 1999; interest against deprivation curiosity, Litman & Spielberger 2003)' },
  { id: 'race_or_solo', kind: 'CP', reads: ['competitive_drive', 'social_framing'], cap: 60, sec: 8,
    ui: 'Every few levels: "Race your own best time / a ghost of a peer" or "Practise on your own".',
    file: 'public/js/session.js + routes/learn.js',
    why: 'choosing to enter competition is the standard behavioural measure of competitiveness (Niederle & Vesterlund 2007)' },
  { id: 'hint_or_try', kind: 'CP', reads: ['productive_struggle', 'hint_dependency'], cap: 150, sec: 5,
    ui: 'On a hard item: "Try first" or "Show a hint". Already a button in the practice screen; the new part is the log of which came first.',
    file: 'public/js/session.js (the hint button, already there) + services/sessions.js (log hint-first against try-first)',
    why: 'struggling before help is the mechanism of productive failure (Kapur 2008) and the response to difficulty is a stable style (Dweck & Leggett 1988)' },
  { id: 'retry_after_fail', kind: 'VOL', reads: ['productive_struggle', 'persistence'], cap: 60, sec: 0,
    ui: 'Nothing new: the log of whether a learner reopened a failed level within the hour, and after how long.',
    file: 'services/scorecard/hooks.js usageSweep (attempts per level are already stored) + a use.* indicator in services/scorecard/indicators.js',
    why: 'coming back after failure is the behavioural side of persistence and failure response' },
  { id: 'extra_practice', kind: 'VOL', reads: ['intrinsic_motivation', 'mastery_orientation'], cap: 90, sec: 0,
    ui: 'Nothing new: practice nobody scheduled (a level started with no plan or reminder, a replay after a pass, a session past the day goal).',
    file: 'services/daily-plan.js (the plan knows what was asked) + services/scorecard/hooks.js usageSweep',
    why: 'what a person does with free time and no reward is the free-choice measure of intrinsic motivation (Deci, Koestner & Ryan 1999)' },
  { id: 'plan_set_and_kept', kind: 'VOL', reads: ['planning_tendency', 'strategy_awareness', 'instruction_adherence'], cap: 60, sec: 0,
    ui: 'The daily plan: did the learner set or edit a goal, and did they do it in the order planned. No new screen.',
    file: 'services/daily-plan.js + services/retention-goal.js (goal set, goal kept) read by usageSweep',
    why: 'forming and keeping a plan is planning tendency (implementation intentions, Gollwitzer 1999; metacognitive regulation, Schraw & Dennison 1994)' },
  { id: 'rule_switch', kind: 'EMB', reads: ['cognitive_flexibility', 'interference_susceptibility'], cap: 150, sec: 3,
    ui: 'Mixed-rule items inside normal reasoning practice (the same operation under a rule that changes every few items); the switch cost is the time and error difference from the repeat items.',
    file: 'services/objective-items.js (reasoning items) + public/js/silent-signals.js (item timing, already captured)',
    why: 'task-switching cost is the standard behavioural read of cognitive flexibility, but it is weakly reliable (Hedge, Powell & Sumner 2018)' },
  { id: 'link_prompt', kind: 'PRM', reads: ['integration_tendency', 'creative_extension'], cap: 60, sec: 8,
    ui: 'After a level: "Connect this to something you learned elsewhere" with a one-line box or "skip"; length and whether it was used are logged, the text is read by the existing note scorer.',
    file: 'public/js/session.js + services/material-notes.js (the existing note scorer)',
    why: 'linking across subjects is integration; a one-line answer is a production read, a skip is a choice read' },
  { id: 'feel_tap', kind: 'PRM', reads: ['emotional_engagement'], cap: 90, sec: 3,
    ui: 'One tap after a level: how did that feel (five faces). The mini-lesson already has this tap (feel).',
    file: 'public/js/session.js',
    why: 'a one-item affect rating in context (Russell, Weiss & Mendelsohn 1989) read with the return rate after the same level' },
  { id: 'topic_pick', kind: 'VOL', reads: ['identity_alignment', 'curiosity_hook'], cap: 40, sec: 0,
    ui: 'Nothing new: which subject, topic or example theme a learner picks when several are on offer, against the goals and interests they stated.',
    file: 'services/learner-path.js + services/learning-spec.js (interest match of what was picked)',
    why: 'people act on what fits who they see themselves as (identity-based motivation, Oyserman 2007)' },
  { id: 'skip_and_exit', kind: 'VOL', reads: ['boredom_susceptibility', 'momentum_dependence'], cap: 200, sec: 0,
    ui: 'Nothing new: skips, early exits and idle gaps inside a level, kept per level.',
    file: 'public/js/silent-signals.js (already captures idle stretches) + routes/learn.js (skips are already stored)',
    why: 'boredom proneness shows as quitting and idling on under-stimulating tasks (Farmer & Sundberg 1986)' },
  { id: 'reward_panel', kind: 'VOL', reads: ['extrinsic_reward_sensitivity', 'praise_sensitivity'], cap: 100, sec: 0,
    ui: 'Nothing new: whether the learner opens the streak, XP and praise panels and how a pass with praise is followed against one without.',
    file: 'public/js/dashboard.js (panel opens) + services/scorecard/hooks.js usageSweep',
    why: 'attention to external rewards is what an extrinsic orientation looks like in use (Hamari, Koivisto & Sarsa 2014 on gamified engagement)' },
  { id: 'ask_a_question', kind: 'VOL', reads: ['question_generation'], cap: 60, sec: 0,
    ui: 'Nothing new: questions typed to the tutor or into level notes that are not answers to a prompt.',
    file: 'routes/tutor.js (count and length of unprompted questions)',
    why: 'unprompted question asking is question generation (Rosenshine, Meister & Chapman 1996)' },
];

module.exports = { KINDS, FOOTPRINTS };
