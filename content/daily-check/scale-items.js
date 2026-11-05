/**
 * Scale items for the daily check: real items of the International Personality Item Pool (IPIP; ipip.ori.org), which is in the PUBLIC DOMAIN
 * (items may be used, changed and translated free, with no permission and no fee). Every item below was read off the IPIP's own scale-key pages on
 * 2026-11-04 (WebFetch of ipip.ori.org; the page and scale are recorded per group, and the key sign is the IPIP's own: +1 means agreeing is more of the
 * scale, -1 less). Items already among the sixteen sign-up items (content/ipip-items.js) are left out so nothing is asked twice. We show each stem with
 * "I" in front ("Worry about things." becomes "I worry about things."; the IPIP's own stems are the second half of that sentence), same five-point agreement.
 *
 * What is NOT from the IPIP: which scorecard measures a scale informs, and by how much (the `maps`: [measure, direction, validity r]). That is our design
 * choice with published links behind it (e.g. IPIP Achievement-Striving and goal mastery; NEO anxiety and test anxiety), not a validated instrument.
 * The validities r are ASSUMED (an item correlates 0.12 to 0.3 with the measure); they set how much a reading moves the card, and every number that
 * depends on them is labelled simulated (docs/SCORECARD-LIVE.md). Scales whose licence is not free are not here.
 */
'use strict';

const BASE = 'https://ipip.ori.org/';
const GROUPS = [
  { scale: 'Achievement-Striving (NEO)', page: 'newNEOKey.htm', maps: [['mastery_orientation', 1, 0.25], ['competitive_drive', 1, 0.2], ['persistence', 1, 0.2]], items: [
    [1, 'Go straight for the goal.'], [1, 'Work hard.'], [1, 'Turn plans into actions.'], [1, 'Plunge into tasks with all my heart.'], [1, "Do more than what's expected of me."], [1, 'Set high standards for myself and others.'], [1, 'Demand quality.'], [-1, 'Am not highly motivated to succeed.'], [-1, 'Do just enough work to get by.'], [-1, 'Put little time and effort into my work.']] },
  { scale: 'Anxiety (NEO)', page: 'newNEOKey.htm', maps: [['evaluation_anxiety', 1, 0.3], ['frustration_threshold', -1, 0.12]], items: [
    [1, 'Fear for the worst.'], [1, 'Am afraid of many things.'], [1, 'Get caught up in my problems.'], [-1, 'Am not easily bothered by things.'], [-1, 'Am relaxed most of the time.'], [-1, 'Am not easily disturbed by events.'], [-1, "Don't worry about things that have already happened."]] },
  { scale: 'Anger (NEO)', page: 'newNEOKey.htm', maps: [['frustration_threshold', -1, 0.3], ['failure_response', -1, 0.12]], items: [
    [1, 'Get angry easily.'], [1, 'Get irritated easily.'], [1, 'Am often in a bad mood.'], [1, 'Lose my temper.'], [-1, 'Rarely get irritated.'], [-1, 'Seldom get mad.'], [-1, 'Am not easily annoyed.'], [-1, 'Keep my cool.']] },
  { scale: 'Self-Discipline (NEO)', page: 'newNEOKey.htm', maps: [['planning_tendency', 1, 0.25], ['persistence', 1, 0.25], ['session_rhythm', 1, 0.15]], items: [
    [1, 'Start tasks right away.'], [1, 'Get to work at once.'], [1, 'Carry out my plans.'], [-1, 'Find it difficult to get down to work.'], [-1, 'Waste my time.'], [-1, 'Need a push to get started.'], [-1, 'Have difficulty starting tasks.'], [-1, 'Postpone decisions.']] },
  { scale: 'Orderliness (NEO)', page: 'newNEOKey.htm', maps: [['structure_need', 1, 0.3], ['planning_tendency', 1, 0.2]], items: [
    [1, 'Like to tidy up.'], [1, 'Love order and regularity.'], [1, 'Do things according to a plan.'], [-1, 'Often forget to put things back in their proper place.'], [-1, 'Am not bothered by disorder.']] },
  { scale: 'Self-Efficacy (NEO)', page: 'newNEOKey.htm', maps: [['self_efficacy', 1, 0.3]], items: [
    [1, 'Complete tasks successfully.'], [1, 'Excel in what I do.'], [1, 'Handle tasks smoothly.'], [1, 'Come up with good solutions.'], [1, 'Know how to get things done.'], [-1, 'Misjudge situations.'], [-1, "Don't understand things."]] },
  { scale: 'Intellect (NEO)', page: 'newNEOKey.htm', maps: [['abstraction_tolerance', 1, 0.25], ['conceptual_bias', 1, 0.2], ['curiosity_hook', 1, 0.2], ['depth_breadth', 1, 0.15]], items: [
    [1, 'Like to solve complex problems.'], [1, 'Enjoy thinking about things.'], [-1, 'Am not interested in abstract ideas.'], [-1, 'Avoid philosophical discussions.'], [-1, 'Have difficulty understanding abstract ideas.'], [-1, 'Am not interested in theoretical discussions.']] },
  { scale: 'Need for Cognition (IPIP single constructs)', page: 'newSingleConstructsKey.htm', maps: [['productive_struggle', 1, 0.25], ['challenge_appetite', 1, 0.2], ['question_generation', 1, 0.2], ['integration_tendency', 1, 0.15]], items: [
    [1, 'Love to think up new ways of doing things.'], [1, 'Love to read challenging material.'], [-1, 'Avoid difficult reading material.'], [-1, 'Try to avoid complex people.']] },
  { scale: 'Imagination (NEO)', page: 'newNEOKey.htm', maps: [['creative_extension', 1, 0.25], ['narrative_pull', 1, 0.2]], items: [
    [1, 'Have a vivid imagination.'], [1, 'Enjoy wild flights of fantasy.'], [1, 'Love to daydream.'], [1, 'Like to get lost in thought.'], [1, 'Spend time reflecting on things.'], [-1, 'Seldom daydream.'], [-1, 'Do not have a good imagination.']] },
  { scale: 'Adventurousness (NEO)', page: 'newNEOKey.htm', maps: [['novelty_hunger', 1, 0.3], ['stimulus_envelope', 1, 0.15], ['boredom_susceptibility', 1, 0.12]], items: [
    [1, 'Prefer variety to routine.'], [1, 'Like to begin new things.'], [1, 'Interested in many things.'], [-1, 'Prefer to stick with things that I know.'], [-1, 'Dislike changes.'], [-1, 'Am a creature of habit.']] },
  { scale: 'Curiosity (VIA)', page: 'newVIAKey.htm', maps: [['curiosity_hook', 1, 0.25], ['boredom_susceptibility', -1, 0.25], ['intrinsic_motivation', 1, 0.15]], items: [
    [1, 'Find the world a very interesting place.'], [1, 'Am never bored.'], [1, 'Am always busy with something interesting.'], [1, 'Can find something of interest in any situation.'], [-1, 'Am not all that curious about the world.'], [-1, 'Find it difficult to entertain myself.'], [-1, 'Have few interests.']] },
  { scale: 'Love of Learning (VIA)', page: 'newVIAKey.htm', maps: [['intrinsic_motivation', 1, 0.3], ['mastery_orientation', 1, 0.2], ['strategy_awareness', 1, 0.12]], items: [
    [1, 'Am thrilled when I learn something new.'], [1, 'Look forward to the opportunity to learn and grow.'], [1, 'Am a true life-long learner.'], [1, 'Consult the library or the Internet immediately if I want to know something.'], [-1, "Don't like to learn new things."], [-1, "Don't read nonfiction books for fun."]] },
  { scale: 'Curiosity (HPI)', page: 'newHPIKeys.htm', maps: [['question_generation', 1, 0.25], ['curiosity_hook', 1, 0.2]], items: [
    [1, 'Like to know how things work.'], [1, 'Seek explanations of things.']] },
  { scale: 'Cautiousness (NEO)', page: 'newNEOKey.htm', maps: [['deliberation_depth', 1, 0.3], ['rush_tendency', -1, 0.3]], items: [
    [1, 'Avoid mistakes.'], [-1, 'Jump into things without thinking.'], [-1, 'Make rash decisions.'], [-1, 'Rush into things.'], [-1, 'Act without thinking.']] },
  { scale: 'Not Autonomous (HPI)', page: 'newHPIKeys.htm', maps: [['autonomy_preference', -1, 0.3], ['praise_sensitivity', 1, 0.2], ['extrinsic_reward_sensitivity', 1, 0.2]], items: [
    [1, 'Need the approval of others.'], [1, 'Want to be liked.'], [1, 'Seek support.'], [-1, "Don't care what others think."], [-1, "Don't care what people think of me."]] },
  { scale: 'Competitive (HPI)', page: 'newHPIKeys.htm', maps: [['challenge_appetite', 1, 0.25], ['competitive_drive', 1, 0.25]], items: [
    [1, 'Accept challenging tasks.'], [1, 'Feel up to any task.'], [-1, 'Undertake few things on my own.']] },
  { scale: 'Perseverance (6FPQ Industriousness)', page: '6FPQKey.htm', maps: [['persistence', 1, 0.3], ['mastery_orientation', 1, 0.15]], items: [
    [1, "Don't quit a task before it is finished."], [1, 'Finish things despite obstacles in the way.'], [1, "Don't get sidetracked when I work."], [-1, "Don't finish what I start."], [-1, 'Give up easily.']] },
  { scale: 'Mastery (HPI)', page: 'newHPIKeys.htm', maps: [['perfectionism', 1, 0.3]], items: [[1, 'Continue until everything is perfect.']] },
];

const ipip = require('../ipip-items');
const taken = new Set(ipip.ITEMS.map((i) => i.text.toLowerCase().replace(/^i /, '').replace(/\.$/, '')));
const display = (stem) => `I ${stem.charAt(0).toLowerCase()}${stem.slice(1)}`;
const ITEMS = [];
for (const g of GROUPS) {
  for (const [key, stem] of g.items) {
    if (taken.has(stem.toLowerCase().replace(/\.$/, ''))) continue;
    ITEMS.push({
      id: `sc:${ITEMS.length}`, text: display(stem), ipip_stem: stem, key, scale: g.scale, source: `${BASE}${g.page}`,
      family: 'scale', validated: 'public-domain IPIP item; the mapping to scorecard measures is our design, not validated', maps: g.maps.map(([stat, dir, r]) => [stat, dir * key, r]),
    });
  }
}
module.exports = { ITEMS, GROUPS };
