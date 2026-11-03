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
 *        One event r about .2 (rho1 .04: unsupported, conservative guess), ceiling validity .40 (rhoInf .16). Anchor: in 15 experience-sampling studies a
 *        questionnaire trait score predicted behaviour AVERAGED over many occasions at r .42 to .56 (Fleeson & Gallagher 2009); .40 is just under the bottom
 *        of that range, and the criterion there is self-reported trait standing, not a true value. No checked source gives a single-event value (Epstein
 *        1979 is the usual reference for the effect of aggregation, but only its title could be checked here, so it is not counted).
 *   VOL  a voluntary behaviour the app logs anyway (extra practice, a start without a reminder, a retry after a fail, a goal kept). No extra seconds.
 *        r about .14 per event (rho1 .02: unsupported, conservative guess), ceiling validity .35 (rhoInf .12). Anchor: correlations of .29 (Agreeableness) to
 *        .40 (Extraversion) between traits and traits predicted from social-media digital footprints in a meta-analysis (Azucar, Marengo & Settanni 2018;
 *        the criterion is self-reported traits and the footprints are social-media traces, so the transfer to in-app voluntary behaviour is an assumption).
 *        Free-choice behaviour is the behavioural measure of intrinsic motivation in the 128 experiments of Deci, Koestner & Ryan (1999); that paper gives
 *        effect sizes of rewards on it, not a validity value.
 *   EMB  a variation built into a normal practice item (a rule switch inside a mixed-rule set), 3 seconds more than the plain item.
 *        r about .17 per event (rho1 .03: unsupported, conservative guess), ceiling validity .50 (rhoInf .25: a conservative guess inside the cited
 *        spread). Anchor: response-time switch costs were reliable in one well-controlled paradigm (retest ICC .78 and .82, Eckart et al. 2021) but
 *        costs from error rates were substantially lower; scoring method changes reliability (Hughes et al. 2014); difference-score tasks in general
 *        range from 0 to .82 (Hedge, Powell & Sumner 2018, which tested Flanker, Stroop, stop-signal, go/no-go, Posner cueing, Navon and SNARC, not task
 *        switching).
 *   PRM  a one-tap prompt answered in the flow (how did that feel, link this to something you know). 3 to 8 seconds.
 *        rho1 .04, ceiling validity .35 (rhoInf .12): unsupported, conservative guess (a self-report in context, below the .42 to .56 questionnaire-to-
 *        behaviour range above and below the questionnaire ceiling the sim already gives SCALE items). One-item affect ratings have adequate reliability and
 *        convergent validity for mood (Russell 1989, Affect Grid); that is a state, not a trait.
 * CHECK (3 Nov 2026, curriculum-build/evidence-article/09-nov3-builds.md): every citation in this file was resolved through Crossref and read against its abstract.
 * No number above was contradicted, so none was changed; the per-event values and the ceilings of EMB and PRM are unsupported guesses and are marked so. Three
 * attributions were wrong or too strong and are corrected in the text (Epstein and Hedge, and "about .4" for Fleeson & Gallagher, whose range is .42 to .56).
 * The 'why' of each footprint says what its source shows; where a source does not show the claim the 'why' says it is a design inference. The model uses only
 * the rounded numbers in KINDS.
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
    why: 'a design inference: preferring the reason to the recipe resembles need for cognition (Cacioppo & Petty 1982, a questionnaire trait; title-level only here), but no checked source shows that a why-or-steps choice reads conceptual_bias' },
  { id: 'deeper_or_move_on', kind: 'CP', reads: ['depth_breadth'], cap: 200, sec: 5,
    ui: 'End of a level: "Go deeper on this" or "Next topic" (the next level is the same one either way).',
    file: 'public/js/session.js (level-complete card)',
    why: 'a design inference: depth against breadth resembles how curiosity is measured by questionnaire (epistemic curiosity scale with diversive and specific subscales, Litman & Spielberger 2003; information foraging, Pirolli & Card 1999, title-level only); no checked source shows that a go-deeper choice reads depth_breadth' },
  { id: 'race_or_solo', kind: 'CP', reads: ['competitive_drive', 'social_framing'], cap: 60, sec: 8,
    ui: 'Every few levels: "Race your own best time / a ghost of a peer" or "Practise on your own".',
    file: 'public/js/session.js + routes/learn.js',
    why: 'entering a tournament instead of a piece rate is a revealed choice in the lab, driven partly by overconfidence and by a preference for competing (Niederle & Vesterlund 2007: 73% of men and 35% of women entered); that is a choice in a one-off paid task, not a validity value for an in-lesson race' },
  { id: 'hint_or_try', kind: 'CP', reads: ['productive_struggle', 'hint_dependency'], cap: 150, sec: 5,
    ui: 'On a hard item: "Try first" or "Show a hint". Already a button in the practice screen; the new part is the log of which came first.',
    file: 'public/js/session.js (the hint button, already there) + services/sessions.js (log hint-first against try-first)',
    why: 'a design inference: how a person responds to difficulty follows from the goals they hold (mastery-oriented against helpless patterns, Dweck & Leggett 1988) and struggling before support can be productive (Kapur 2008, productive failure); neither shows that try-first against hint-first is a stable trait read' },
  { id: 'retry_after_fail', kind: 'VOL', reads: ['productive_struggle', 'persistence'], cap: 60, sec: 0,
    ui: 'Nothing new: the log of whether a learner reopened a failed level within the hour, and after how long.',
    file: 'services/scorecard/hooks.js usageSweep (attempts per level are already stored) + a use.* indicator in services/scorecard/indicators.js',
    why: 'unsupported: no checked source shows that reopening a failed level reads persistence; it is the behavioural side of the construct by definition, and its validity is one of the things 11.6 step 6 would measure' },
  { id: 'extra_practice', kind: 'VOL', reads: ['intrinsic_motivation', 'mastery_orientation'], cap: 90, sec: 0,
    ui: 'Nothing new: practice nobody scheduled (a level started with no plan or reminder, a replay after a pass, a session past the day goal).',
    file: 'services/daily-plan.js (the plan knows what was asked) + services/scorecard/hooks.js usageSweep',
    why: 'free-choice behaviour after a reward is the behavioural measure of intrinsic motivation in the 128 experiments that Deci, Koestner & Ryan (1999) pooled; that paper estimates how rewards change it (d about -0.28 to -0.40) and gives no validity of extra practice as a read of the trait' },
  { id: 'plan_set_and_kept', kind: 'VOL', reads: ['planning_tendency', 'strategy_awareness', 'instruction_adherence'], cap: 60, sec: 0,
    ui: 'The daily plan: did the learner set or edit a goal, and did they do it in the order planned. No new screen.',
    file: 'services/daily-plan.js + services/retention-goal.js (goal set, goal kept) read by usageSweep',
    why: 'a design inference: implementation intentions (if-then plans) help people act on goals (Gollwitzer 1999), which shows plans can cause goal attainment, not that setting and keeping a plan reads planning_tendency; metacognitive regulation (Schraw & Dennison 1994) is title-level only here' },
  { id: 'rule_switch', kind: 'EMB', reads: ['cognitive_flexibility', 'interference_susceptibility'], cap: 150, sec: 3,
    ui: 'Mixed-rule items inside normal reasoning practice (the same operation under a rule that changes every few items); the switch cost is the time and error difference from the repeat items.',
    file: 'services/objective-items.js (reasoning items) + public/js/silent-signals.js (item timing, already captured)',
    why: 'task-switching costs are a behavioural index of switching, reliable for response times in a well-controlled paradigm (retest ICC .78 and .82, Eckart et al. 2021) and sensitive to how they are scored (Hughes et al. 2014); error-rate costs and other difference scores are less reliable, so the ceiling is held low' },
  { id: 'link_prompt', kind: 'PRM', reads: ['integration_tendency', 'creative_extension'], cap: 60, sec: 8,
    ui: 'After a level: "Connect this to something you learned elsewhere" with a one-line box or "skip"; length and whether it was used are logged, the text is read by the existing note scorer.',
    file: 'public/js/session.js + services/material-notes.js (the existing note scorer)',
    why: 'unsupported: no checked source shows that a one-line link prompt reads integration_tendency; a produced link is a production read and a skip a choice read by design' },
  { id: 'feel_tap', kind: 'PRM', reads: ['emotional_engagement'], cap: 90, sec: 3,
    ui: 'One tap after a level: how did that feel (five faces). The mini-lesson already has this tap (feel).',
    file: 'public/js/session.js',
    why: 'a single-item rating can capture affect with adequate reliability and convergent validity in college students (Affect Grid, Russell 1989); a state rating, read with the return rate after the same level, is a design inference for emotional_engagement as a trait' },
  { id: 'topic_pick', kind: 'VOL', reads: ['identity_alignment', 'curiosity_hook'], cap: 40, sec: 0,
    ui: 'Nothing new: which subject, topic or example theme a learner picks when several are on offer, against the goals and interests they stated.',
    file: 'services/learner-path.js + services/learning-spec.js (interest match of what was picked)',
    why: 'a design inference: linking possible selves to strategies raised academic initiative in low-income 8th graders (Oyserman, Bybee & Terry 2006, an intervention), which shows identity matters for action, not that a topic pick reads identity_alignment' },
  { id: 'skip_and_exit', kind: 'VOL', reads: ['boredom_susceptibility', 'momentum_dependence'], cap: 200, sec: 0,
    ui: 'Nothing new: skips, early exits and idle gaps inside a level, kept per level.',
    file: 'public/js/silent-signals.js (already captures idle stretches) + routes/learn.js (skips are already stored)',
    why: 'boredom proneness is a self-report trait with retest reliability .83 over 1 week and links to interest and attention in classroom studies (Farmer & Sundberg 1986); no checked source tests quitting and idle gaps in logs as its read' },
  { id: 'reward_panel', kind: 'VOL', reads: ['extrinsic_reward_sensitivity', 'praise_sensitivity'], cap: 100, sec: 0,
    ui: 'Nothing new: whether the learner opens the streak, XP and praise panels and how a pass with praise is followed against one without.',
    file: 'public/js/dashboard.js (panel opens) + services/scorecard/hooks.js usageSweep',
    why: 'a design inference: gamification effects depend greatly on context and users (Hamari, Koivisto & Sarsa 2014 review); no checked source shows that opening a reward panel reads extrinsic orientation' },
  { id: 'ask_a_question', kind: 'VOL', reads: ['question_generation'], cap: 60, sec: 0,
    ui: 'Nothing new: questions typed to the tutor or into level notes that are not answers to a prompt.',
    file: 'routes/tutor.js (count and length of unprompted questions)',
    why: 'teaching students to generate questions improved comprehension (median effect size 0.36 on standardized tests, Rosenshine, Meister & Chapman 1996), which shows question generation helps learning, not that unprompted questions read question_generation as a trait; a design inference' },
];

module.exports = { KINDS, FOOTPRINTS };
