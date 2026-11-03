// One-off edit of scripts/lib/scorecard-footprints.js after the citation check (section 09). Text only: no coefficient changes.
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', '..', '..', 'scripts', 'lib', 'scorecard-footprints.js');
let s = fs.readFileSync(f, 'utf8'); const CRLF = s.includes('\r\n'); s = s.split('\r\n').join('\n');
if (s.includes('CHECK (3 Nov 2026')) { console.log('already edited'); process.exit(0); }
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); s = s.replace(a, b); };
rep(` *        One event r about .2 (rho1 .04), ceiling validity .40 (rhoInf .16). Anchor: behaviour against trait aggregates to about .4 only over many
 *        occasions (Epstein 1979, principle of aggregation; Fleeson & Gallagher 2009, trait-behaviour correlations of about .4 for averaged behaviour).`,
` *        One event r about .2 (rho1 .04: unsupported, conservative guess), ceiling validity .40 (rhoInf .16). Anchor: in 15 experience-sampling studies a
 *        questionnaire trait score predicted behaviour AVERAGED over many occasions at r .42 to .56 (Fleeson & Gallagher 2009); .40 is just under the bottom
 *        of that range, and the criterion there is self-reported trait standing, not a true value. No checked source gives a single-event value (Epstein
 *        1979 is the usual reference for the effect of aggregation, but only its title could be checked here, so it is not counted).`);
rep(` *        r about .14 per event (rho1 .02), ceiling validity .35 (rhoInf .12). Anchor: traits from digital-footprint behaviour r .29 to .40 in a
 *        meta-analysis (Azucar, Marengo & Settanni 2018); free-choice persistence is the standard behavioural measure of intrinsic motivation
 *        (Deci, Koestner & Ryan 1999).`,
` *        r about .14 per event (rho1 .02: unsupported, conservative guess), ceiling validity .35 (rhoInf .12). Anchor: correlations of .29 (Agreeableness) to
 *        .40 (Extraversion) between traits and traits predicted from social-media digital footprints in a meta-analysis (Azucar, Marengo & Settanni 2018;
 *        the criterion is self-reported traits and the footprints are social-media traces, so the transfer to in-app voluntary behaviour is an assumption).
 *        Free-choice behaviour is the behavioural measure of intrinsic motivation in the 128 experiments of Deci, Koestner & Ryan (1999); that paper gives
 *        effect sizes of rewards on it, not a validity value.`);
rep(` *        r about .17 per event (rho1 .03), ceiling validity .50 (rhoInf .25). Anchor: switch-cost difference scores are weakly reliable, so the
 *        ceiling is low (Hedge, Powell & Sumner 2018).`,
` *        r about .17 per event (rho1 .03: unsupported, conservative guess), ceiling validity .50 (rhoInf .25: a conservative guess inside the cited
 *        spread). Anchor: response-time switch costs were reliable in one well-controlled paradigm (retest ICC .78 and .82, Eckart et al. 2021) but
 *        costs from error rates were substantially lower; scoring method changes reliability (Hughes et al. 2014); difference-score tasks in general
 *        range from 0 to .82 (Hedge, Powell & Sumner 2018, which tested Flanker, Stroop, stop-signal, go/no-go, Posner cueing, Navon and SNARC, not task
 *        switching).`);
rep(` *        rho1 .04, ceiling validity .35 (rhoInf .12): a self-report in context, below the questionnaire ceiling the sim already gives SCALE items.
 * The citations are from memory and the exact coefficients were not re-checked in this session; the model uses only the rounded numbers above.`,
` *        rho1 .04, ceiling validity .35 (rhoInf .12): unsupported, conservative guess (a self-report in context, below the .42 to .56 questionnaire-to-
 *        behaviour range above and below the questionnaire ceiling the sim already gives SCALE items). One-item affect ratings have adequate reliability and
 *        convergent validity for mood (Russell 1989, Affect Grid); that is a state, not a trait.
 * CHECK (3 Nov 2026, curriculum-build/evidence-article/09-nov3-builds.md): every citation in this file was resolved through Crossref and read against its abstract.
 * No number above was contradicted, so none was changed; the per-event values and the ceilings of EMB and PRM are unsupported guesses and are marked so. Three
 * attributions were wrong or too strong and are corrected in the text (Epstein and Hedge, and "about .4" for Fleeson & Gallagher, whose range is .42 to .56).
 * The 'why' of each footprint says what its source shows; where a source does not show the claim the 'why' says it is a design inference. The model uses only
 * the rounded numbers in KINDS.`);
const WHY = {
  why_or_steps: 'a design inference: preferring the reason to the recipe resembles need for cognition (Cacioppo & Petty 1982, a questionnaire trait; title-level only here), but no checked source shows that a why-or-steps choice reads conceptual_bias',
  deeper_or_move_on: 'a design inference: depth against breadth resembles how curiosity is measured by questionnaire (epistemic curiosity scale with diversive and specific subscales, Litman & Spielberger 2003; information foraging, Pirolli & Card 1999, title-level only); no checked source shows that a go-deeper choice reads depth_breadth',
  race_or_solo: 'entering a tournament instead of a piece rate is a revealed choice in the lab, driven partly by overconfidence and by a preference for competing (Niederle & Vesterlund 2007: 73% of men and 35% of women entered); that is a choice in a one-off paid task, not a validity value for an in-lesson race',
  hint_or_try: 'a design inference: how a person responds to difficulty follows from the goals they hold (mastery-oriented against helpless patterns, Dweck & Leggett 1988) and struggling before support can be productive (Kapur 2008, productive failure); neither shows that try-first against hint-first is a stable trait read',
  retry_after_fail: 'unsupported: no checked source shows that reopening a failed level reads persistence; it is the behavioural side of the construct by definition, and its validity is one of the things 11.6 step 6 would measure',
  extra_practice: 'free-choice behaviour after a reward is the behavioural measure of intrinsic motivation in the 128 experiments that Deci, Koestner & Ryan (1999) pooled; that paper estimates how rewards change it (d about -0.28 to -0.40) and gives no validity of extra practice as a read of the trait',
  plan_set_and_kept: 'a design inference: implementation intentions (if-then plans) help people act on goals (Gollwitzer 1999), which shows plans can cause goal attainment, not that setting and keeping a plan reads planning_tendency; metacognitive regulation (Schraw & Dennison 1994) is title-level only here',
  rule_switch: 'task-switching costs are a behavioural index of switching, reliable for response times in a well-controlled paradigm (retest ICC .78 and .82, Eckart et al. 2021) and sensitive to how they are scored (Hughes et al. 2014); error-rate costs and other difference scores are less reliable, so the ceiling is held low',
  link_prompt: 'unsupported: no checked source shows that a one-line link prompt reads integration_tendency; a produced link is a production read and a skip a choice read by design',
  feel_tap: 'a single-item rating can capture affect with adequate reliability and convergent validity in college students (Affect Grid, Russell 1989); a state rating, read with the return rate after the same level, is a design inference for emotional_engagement as a trait',
  topic_pick: 'a design inference: linking possible selves to strategies raised academic initiative in low-income 8th graders (Oyserman, Bybee & Terry 2006, an intervention), which shows identity matters for action, not that a topic pick reads identity_alignment',
  skip_and_exit: 'boredom proneness is a self-report trait with retest reliability .83 over 1 week and links to interest and attention in classroom studies (Farmer & Sundberg 1986); no checked source tests quitting and idle gaps in logs as its read',
  reward_panel: 'a design inference: gamification effects depend greatly on context and users (Hamari, Koivisto & Sarsa 2014 review); no checked source shows that opening a reward panel reads extrinsic orientation',
  ask_a_question: 'teaching students to generate questions improved comprehension (median effect size 0.36 on standardized tests, Rosenshine, Meister & Chapman 1996), which shows question generation helps learning, not that unprompted questions read question_generation as a trait; a design inference',
};
for (const [id, w] of Object.entries(WHY)) {
  const re = new RegExp("(\\{ id: '" + id + "'[\\s\\S]*?why: )'[^\\n]*'( \\},)");
  if (!re.test(s)) throw new Error('why not found ' + id);
  s = s.replace(re, (m, a, b) => a + "'" + w.replace(/'/g, "\\'") + "'" + b);
}
fs.writeFileSync(f, CRLF ? s.split('\n').join('\r\n') : s);
console.log('edited');
