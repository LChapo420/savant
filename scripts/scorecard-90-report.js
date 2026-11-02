/**
 * Phase 1 of docs/SCORECARD-90.md. Reads the study-pace runs (scorecard-recovery-sim.js --minutes-per-day=60 --days=30, one file per seed) and prints
 * the full table: per measure at day 30 the app's mean absolute error (MAE), the share of learners within 10 and within 5 points, the ideal observer's
 * error (a cross-validated read-out of the whole answer log and the indicator means: a floor found, not proved optimal), the prior's error, and the
 * group (a) to (d); then the reliability a source needs and the designed-measurement plan. All numbers are SIMULATED.
 *
 *   node scripts/scorecard-90-report.js --none=a.json,b.json --all=c.json,d.json [--md=docs/SCORECARD-90.md]
 */
const fs = require('fs');
const { STATS } = require('../services/scorecard/stats');

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : ''; };
const POP_SD = 17;
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const f1 = (v) => v.toFixed(1);
const pc = (v) => `${Math.round(v * 100)}%`;

function load(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const g = j.results.off.gate.weeks;
  return { w: g[Object.keys(g).filter((k) => Number(k) > 4).pop()], act: j.results.off.activity };
}
const none = arg('none').split(',').filter(Boolean).map(load);
const all = arg('all').split(',').filter(Boolean).map(load);
const fields = ['mae', 'within10', 'within5', 'ideal', 'ideal_within10', 'prior', 'bias', 'floor_recalibrated', 'floor_log'];
const stat = (runs, id) => {
  const per = runs.map((r) => r.w.perStat[id]);
  const o = {};
  for (const f of fields) o[f] = mean(per.map((p) => p[f]));
  o.reason = per[0].reason; o.truth_model = per[0].truth_model; o.status = per.map((p) => p.status).join('/');
  return o;
};

// Error SD for a mean absolute error of m (normal errors: MAE = 0.7979 SD) and the reliability (share of true variance a source carries) that gives it.
const rel = (sd) => 1 - (sd / POP_SD) ** 2;
const NEED = { mae10: rel(10 / 0.7979), mae5: rel(5 / 0.7979), w10: rel(10 / 1.645), w5: rel(5 / 1.645) };
const maeOf = (rho) => 0.7979 * POP_SD * Math.sqrt(1 - rho);
const prec = (rho) => rho / (1 - rho);
const fromPrec = (p) => p / (1 + p);

// Group (d): the quantity itself unfolds over longer than the 30 days. Everything else is sorted by the data.
const D = ['decay_rate', 'retention_index', 'retrieval_strength'];
// Designed-measurement families for group (c).
const FAM = {
  COG: ['working_memory_span', 'cognitive_flexibility', 'deductive_trajectory', 'inductive_trajectory', 'analogical_transfer', 'causal_chain_depth', 'logical_rigor', 'interference_susceptibility', 'far_transfer'],
  SCALE: ['intrinsic_motivation', 'extrinsic_reward_sensitivity', 'competitive_drive', 'evaluation_anxiety', 'boredom_susceptibility', 'mastery_orientation', 'identity_alignment', 'autonomy_preference', 'strategy_awareness', 'planning_tendency', 'question_generation', 'productive_struggle', 'curiosity_hook', 'relevance_demand', 'emotional_engagement', 'conceptual_bias', 'application_orientation', 'integration_tendency', 'depth_breadth', 'creative_extension', 'gamification_response', 'novelty_hunger', 'structure_need', 'stimulus_envelope'],
  CROSS: ['chunk_granularity', 'abstraction_tolerance', 'example_density_need', 'text_density_tolerance', 'jargon_absorption', 'spatial_anchoring', 'global_framing_need', 'humor_receptivity', 'narrative_pull', 'tone_formality', 'elaboration_benefit', 'mnemonic_receptivity', 'enactive_encoding', 'generation_effect', 'step_explicitness', 'worked_example_dependence', 'feedback_granularity', 'feedback_tone_sensitivity', 'dialogic_preference', 'praise_sensitivity', 'social_framing', 'interest_transfer', 'cycle_architecture'],
  PROBE: ['intake_baseline', 'warmup_latency', 'momentum_dependence', 'interleaving_tolerance', 'session_rhythm', 'reentry_cost'],
};
const famOf = (id) => Object.keys(FAM).find((k) => FAM[k].includes(id));

const rows = STATS.map((s) => {
  const n = stat(none, s.id);
  const a = all.length ? stat(all, s.id) : null;
  const group = D.includes(s.id) ? 'd' : n.mae <= 10 ? 'a' : n.ideal <= 10 ? 'b' : 'c';
  return { id: s.id, name: s.name, ...n, all: a, group, fam: group === 'c' ? famOf(s.id) : null };
});
const missing = rows.filter((r) => r.group === 'c' && !r.fam).map((r) => r.id);
const extra = Object.values(FAM).flat().filter((id) => !rows.find((r) => r.id === id && r.group === 'c'));
const G = { a: rows.filter((r) => r.group === 'a'), b: rows.filter((r) => r.group === 'b'), c: rows.filter((r) => r.group === 'c'), d: rows.filter((r) => r.group === 'd') };
const summary = {
  none: { mae: mean(rows.map((r) => r.mae)), prior: mean(rows.map((r) => r.prior)), ideal: mean(rows.map((r) => r.ideal)), w10: mean(rows.map((r) => r.within10)), w5: mean(rows.map((r) => r.within5)) },
  all: all.length ? { mae: mean(rows.map((r) => r.all.mae)), ideal: mean(rows.map((r) => r.all.ideal)), w10: mean(rows.map((r) => r.all.within10)), w5: mean(rows.map((r) => r.all.within5)) } : null,
  act: none.map((r) => r.act), levels: none.map((r) => r.w.mean_levels),
};
const worst = rows.slice().sort((x, y) => y.mae - x.mae).slice(0, 10);

// Plan arithmetic (all estimates, none simulated): the expected reliability of each source and the daily minutes.
const PLAN = [
  { key: 'COG', title: 'Daily 2-minute brain-teaser set (domain-free, rotating)', min: 2.0, rho: 0.70, lo: 0.55, hi: 0.85 },
  { key: 'SCALE', title: 'Validated scale items after a sitting (about 10 items a day, 12 s each)', min: 2.0, rho: 0.30, lo: 0.2, hi: 0.4 },
  { key: 'TAPS', title: '"Which would you do next?" and "which version helped?" taps (about 6 a day, 10 s each)', min: 1.0, rho: 0.45, lo: 0.3, hi: 0.55 },
  { key: 'PROBE', title: 'Fixed calibrated probe items at sitting start and after a gap (normal items, reordered)', min: 0.5, rho: 0.45, lo: 0.3, hi: 0.55 },
  { key: 'DELAYED', title: 'Spaced retests of earlier skills at 1, 3, 7, 14 and 28 days (real review items, but extra time)', min: 1.0, rho: 0.40, lo: 0.25, hi: 0.5 },
];
const planMin = PLAN.reduce((s, p) => s + p.min, 0);
// Expected reliability per family after combining sources (precisions add; correlated error makes this a ceiling).
const comb = {
  COG: fromPrec(prec(0.70)),
  SCALE: fromPrec(prec(0.30) + prec(0.45)),
  CROSS: fromPrec(prec(0.45) + prec(0.45)),
  PROBE: fromPrec(prec(0.45)),
  D: 0.40,
};

const out = {
  NEED, summary: { ...summary, act: undefined }, groups: Object.fromEntries(Object.entries(G).map(([k, v]) => [k, v.length])), worst: worst.map((r) => `${r.id} ${f1(r.mae)}`),
  missing, extra, planMin, comb: Object.fromEntries(Object.entries(comb).map(([k, v]) => [k, [v.toFixed(2), f1(maeOf(v))]])),
};
console.log(JSON.stringify(out, null, 1));

const md = arg('md');
if (md) {
  const L = [];
  const P = (s = '') => L.push(s);
  const act = summary.act[0];
  const lv = summary.levels.map((v) => Math.round(v)).join(' and ');
  P('# Scorecard 90: how close can every measure get in a month at an hour a day? (Phase 1)');
  P();
  P('**Everything below is SIMULATED.** The sim\'s learners, truth models and source validities are assumptions (see `docs/SCORECARD-MEASURED.md`, "Limits", and section 7 here). Nothing here is a real-learner result. Source: `scripts/scorecard-recovery-sim.js --minutes-per-day=60 --days=30`, summarised by `scripts/scorecard-90-report.js`.');
  P();
  P('## 1. What was run');
  P();
  P(`- **Study pace** (new, off by default so the stored gate baseline is unchanged): one study day per calendar day for 30 days, each day filled with levels until 60 minutes of the sim's own level time are spent (the item and reading times it already generates plus 30 s between levels). A sitting keeps its default length (the learner's attention_runway sets the levels in it); the next sitting opens about 1.5 hours later the same day. Start times jitter with the learner's session rhythm. The sim's level takes **${act.minutes_per_level} min** on average, so a learner does **${lv} levels** in the month (the default sim: about 45 in 30 days), at ${act.minutes_per_day} min a day.`);
  P('- 200 learners, 2 seeds (20261022 and 7), model-read off, the app as it is (indicators on, one experiment dimension per page, no optional channels): "defaults". Two more runs with every optional channel on (`--channels=all`) give the "every extra" column. The snapshot is taken on day 30.');
  P('- "Ideal observer" is the gate\'s: the better of a cross-validated ridge read-out of the learner\'s whole answer log (16 features, plus the indicator means for that measure), a recalibration of the app\'s own number, and the population mean. It is a floor found, not proved optimal: a better read-out, or one that knew the sim\'s truth model, could do better.');
  P(`- Error is the **mean absolute error (MAE) in points** on the 0 to 100 scale. Guessing the population mean costs ${f1(summary.none.prior)}. For normal errors, an MAE of 10 means only about 58% of learners are within 10 points; 90% within 10 needs an MAE of about 4.9. See section 4.`);
  P();
  P('## 2. Headline');
  P();
  P('| | MAE, all 100 measures | learners within 10 | learners within 5 |');
  P('|---|---|---|---|');
  P(`| **app, defaults, 60 min a day, day 30** | **${f1(summary.none.mae)}** | ${pc(summary.none.w10)} | ${pc(summary.none.w5)} |`);
  if (summary.all) P(`| app, every optional channel on | ${f1(summary.all.mae)} | ${pc(summary.all.w10)} | ${pc(summary.all.w5)} |`);
  P(`| ideal observer, same data (defaults) | ${f1(summary.none.ideal)} | ${pc(mean(rows.map((r) => r.ideal_within10)))} | |`);
  P(`| guess the population mean | ${f1(summary.none.prior)} | | |`);
  P();
  P(`About six times more practice than the sim's default pace (${lv} levels instead of about 45) moves the error from about 12.5 to ${f1(summary.none.mae)}: **more of the same data barely helps, and the best read-out of that data is ${f1(summary.none.ideal)}, still above 10.** The target needs new information, not more time.`);
  P();
  P('## 3. The four groups (day 30, defaults, mean of two seeds)');
  P();
  P('Rule: **(a)** the app\'s MAE is already at most 10. **(b)** the app is above 10 but the ideal observer is at most 10 on the same data: an app fix. **(c)** even the ideal observer is above 10: no source in the sim carries enough signal, a designed measurement is needed. **(d)** the quantity itself needs more than 30 days whatever the source (assigned by what the measure is, not by the data).');
  P();
  P('| group | measures | mean app MAE | mean ideal | what it means |');
  P('|---|---|---|---|---|');
  const gm = (a, k) => (a.length ? f1(mean(a.map((r) => r[k]))) : '-');
  P(`| (a) already within 10 | ${G.a.length} | ${gm(G.a, 'mae')} | ${gm(G.a, 'ideal')} | nothing to do; none reaches 90% of learners within 10 |`);
  P(`| (b) data allows it, app does not get there | ${G.b.length} | ${gm(G.b, 'mae')} | ${gm(G.b, 'ideal')} | an app fix (section 5) |`);
  P(`| (c) no source carries enough signal | ${G.c.length} | ${gm(G.c, 'mae')} | ${gm(G.c, 'ideal')} | a designed measurement (section 6) |`);
  P(`| (d) needs more than 30 days | ${G.d.length} | ${gm(G.d, 'mae')} | ${gm(G.d, 'ideal')} | time, or a retest schedule that only partly helps |`);
  P();
  P('**Worst 10 by app MAE:** ' + worst.map((r) => `${r.id} ${f1(r.mae)} (ideal ${f1(r.ideal)}, group ${r.group})`).join('; ') + '.');
  P();
  P(`- **(a), ${G.a.length}:** ${G.a.map((r) => r.id).join(', ')}. Share within 10 ranges ${pc(Math.min(...G.a.map((r) => r.within10)))} to ${pc(Math.max(...G.a.map((r) => r.within10)))}; within 5 ${pc(Math.min(...G.a.map((r) => r.within5)))} to ${pc(Math.max(...G.a.map((r) => r.within5)))}.`);
  P(`- **(b), ${G.b.length}:** ${G.b.map((r) => r.id).join(', ')}.`);
  P(`- **(d), ${G.d.length}:** ${G.d.map((r) => r.id).join(', ')}. These three are one model in the app (the memory trio): a half-life of weeks to months cannot be read from 30 days of use, and even the best read-out is ${gm(G.d, 'ideal')}.`);
  const gen = G.c.filter((r) => r.truth_model === 'generative' || r.truth_model === 'alias');
  P(`- **(c), ${G.c.length}:** in the sim, ${G.c.filter((r) => r.truth_model === 'none').length} have no behavioural or text expression at all (only the questionnaire at r 0.4 and an idealised model read can see them), ${G.c.filter((r) => r.truth_model === 'experiment').length} are carried only by experiment arms, ${G.c.filter((r) => /self/.test(r.truth_model)).length} only by the one-off questionnaire, and ${gen.length} by behaviour that is too weak (${gen.map((r) => r.id).join(', ')}). **Caveat:** "no expression in the sim" is an assumption of the sim, not proof that real behaviour carries nothing; the beta may show some of these in real chat, timing and choices.`);
  P();
  P('## 4. The reliability a source needs');
  P();
  P(`Error SD = population SD x sqrt(1 - reliability), with population SD ${POP_SD}. "Reliability" here is the share of the true value's variance the combined source carries (a validity squared, not just retest consistency: a very consistent scale that measures the wrong thing scores low). For normal errors MAE = 0.80 x SD. Independent sources add their precision (reliability / (1 - reliability)).`);
  P();
  P('| target | error SD | reliability needed |');
  P('|---|---|---|');
  P(`| **MAE 10** (the brief's "within 10") | ${f1(10 / 0.7979)} | **${NEED.mae10.toFixed(2)}** |`);
  P(`| **MAE 5** (the brief's "within 5") | ${f1(5 / 0.7979)} | **${NEED.mae5.toFixed(2)}** |`);
  P(`| 90% of learners within 10 | ${f1(10 / 1.645)} | ${NEED.w10.toFixed(2)} |`);
  P(`| 90% of learners within 5 | ${f1(5 / 1.645)} | ${NEED.w5.toFixed(2)} |`);
  P();
  P('The current sources give group (c) a reliability of about 0.03 to 0.05 (an MAE of 13.3 corresponds to 0.03). **If the owner means "within 10 points" for nine learners in ten, the real bar is 0.87, the same as the MAE-5 row**; the MAE-10 row is the weaker reading and is what the plan below is sized for.');
  P();
  P('## 5. Group (b): app fixes (no new measurement)');
  P();
  P('The gate marks nearly all of them "biased or miscalibrated": a fixed linear recalibration of the app\'s own number would already cut the error, and at about 290 levels the bias is large (shown). This looks like calibration drift: the rules were tuned on 100 levels of use and these learners have three times as many. A few also show a log read-out that beats the recalibrated number (the rule discards log information).');
  P();
  P('| measure | app MAE | bias (truth - app) | recalibrated app | log read-out | gate reason |');
  P('|---|---|---|---|---|---|');
  for (const r of G.b) {
    const why = !r.reason ? 'passes the gate (ratio under 1.1) but MAE above 10' : /log holds/.test(r.reason) ? 'rule discards log information' : /biased/.test(r.reason) ? 'biased or miscalibrated' : r.reason;
    P(`| ${r.id} | ${f1(r.mae)} | ${r.bias.toFixed(1)} | ${f1(r.floor_recalibrated)} | ${f1(r.floor_log)} | ${why} |`);
  }
  P();
  P('Check before building: scaffolding_fade\'s truth in the sim is the learner against a course that gets harder by 0.02 logits a level, a ramp set for 100 levels (6 logits at 290), so its large bias may partly be the sim\'s extrapolation. session_rhythm (group c) and attention_runway are partly hidden by the forced daily schedule, so they are not fair tests of the pace run.');
  P();
  P('## 6. Groups (c) and (d): designed measurements');
  P();
  P('Principles: (1) preference and tolerance traits are measured as **choices and paired within-lesson comparisons**, not asked about; (2) cognitive capacities by **short, domain-free task items**; (3) attitudes by **a few validated scale items**, never one long form; (4) everything is rotated through the month so no day costs more than 8 minutes. Expected reliabilities come from the literature and the Spearman-Brown formula. **None is simulated and none is measured on learners**; they are estimates to check on the beta.');
  P();
  P('| source | min a day | measures | expected reliability (range) | design and evidence |');
  P('|---|---|---|---|---|');
  P(`| **COG** ${PLAN[0].title} | ${PLAN[0].min} | ${FAM.COG.length} | ${PLAN[0].rho} (${PLAN[0].lo} to ${PLAN[0].hi}) | About 5 calibrated items a day (about 150 over the month, 15 to 20 per measure after rotating): digit or Corsi span for working memory (span tasks, Conway et al. 2005: reliability 0.7 to 0.9), short matrix and number-series items for inductive and analogical reasoning (abbreviated Raven forms, Bilker et al. 2012: about 0.7 to 0.8), syllogisms for deductive, an if-then chain item for causal depth, a switch block for flexibility. **Switch costs are a difference score and unreliable (Hughes et al. 2014; Hedge, Powell & Sumner 2018); score mixed-block accuracy instead, expected 0.5 to 0.6.** Enkavi et al. 2019 found many behavioural task measures retest at only 0.3 to 0.5, so the top of the range is for span and series items only. |`);
  P(`| **SCALE** ${PLAN[1].title} | ${PLAN[1].min} | ${FAM.SCALE.length} | ${PLAN[1].rho} (${PLAN[1].lo} to ${PLAN[1].hi}) alone | 8 to 10 items per measure over the month, from published short scales: MSLQ subscales (Pintrich et al. 1993) for strategy awareness, planning, task value, test anxiety; Achievement Goal Questionnaire (Elliot & McGregor 2001) for mastery orientation; Academic Motivation Scale (Vallerand et al. 1992) and the Learning Self-Regulation Questionnaire (Black & Deci 2000) for intrinsic motivation and autonomy; Epistemic Curiosity (Litman & Spielberger 2003) for curiosity; a short Boredom Proneness scale (Struk et al. 2017) and the Achievement Emotions Questionnaire (Pekrun et al. 2011) for boredom and emotional engagement; a hypercompetitive-attitude scale (Ryckman et al. 1990) for competitive drive; K-DOCS (Kaufman 2012) for creative extension. Internal consistency of 8 to 10 items is typically 0.8 to 0.88, but **self-report and behaviour correlate only 0.1 to 0.4 (Dang, King & Inzlicht 2020)**, so validity against true behaviour limits it; the 0.30 is that limit, not the alpha. |`);
  P(`| **TAPS** ${PLAN[2].title} | ${PLAN[2].min} | CROSS ${FAM.CROSS.length} and SCALE ${FAM.SCALE.length} (second source) | ${PLAN[2].rho} (${PLAN[2].lo} to ${PLAN[2].hi}) | Revealed preference by forced choice (Thurstone 1927; Bradley-Terry scoring): "which of these two would you do next" (game-like versus plain task, harder versus easier set, solo versus shared, short versus long explanation), and "which version helped?" after paired versions. About 180 taps in the month give a stable preference estimate (a choice rate over 30 trials has a standard error near 0.09). It measures **preference**; whether the preferred version teaches better is a separate and much weaker claim (Pashler et al. 2008). |`);
  P(`| **CROSS** paired crossover inside lessons | 0 | ${FAM.CROSS.length} | 0.45 (0.3 to 0.55) alone | Each lesson page and review set is shown in two versions that differ on one dimension (example density, text density, tone, humour, step size, feedback grain), both to the same learner on matched content, order counterbalanced (a micro-randomised trial, Klasnja et al. 2015), scored on accuracy, time and next-day recall. At the sim's own effect (0.4 logits per SD) about 60 paired items per arm per dimension give about 0.45 (hand calculation: signal 0.096 per SD of trait against noise 0.09). **If the real effect is smaller, as aptitude-treatment effects usually are, this falls toward 0 and the TAPS taps carry the estimate.** |`);
  P(`| **PROBE** ${PLAN[3].title} | ${PLAN[3].min} | ${FAM.PROBE.length} | ${PLAN[3].rho} (${PLAN[3].lo} to ${PLAN[3].hi}) | Three fixed, calibrated items at the start of every sitting and the same three after a gap of a day or more, scored against the learner's later accuracy in the same sitting: warm-up, re-entry and momentum are differences between these; a pre-lesson three-item probe gives intake. About 90 probe items over the month. |`);
  P(`| **DELAYED** ${PLAN[4].title} (group d) | ${PLAN[4].min} | ${G.d.length} | ${PLAN[4].rho} (${PLAN[4].lo} to ${PLAN[4].hi}) | Retests at 1, 3, 7, 14 and 28 days (Cepeda et al. 2006; half-life regression, Settles & Meeder 2016): about 40 retests a learner. They give a short-horizon decay rate. A half-life longer than 28 days is not identified from data that stop at 28 days. |`);
  P();
  P(`**Total: ${planMin} minutes a day on average** (${(planMin * 30).toFixed(0)} minutes a month), inside the 5 to 8 minute budget, with room for a one-off 10-minute first-day setup. CROSS adds no minutes.`);
  P();
  P('Expected result per family after combining sources (precisions add; correlated errors make these ceilings):');
  P();
  P(`| family | measures | combined reliability | expected MAE | meets 10 (needs ${NEED.mae10.toFixed(2)}) | meets 5 (needs ${NEED.mae5.toFixed(2)}) |`);
  P('|---|---|---|---|---|---|');
  const famRow = (k, n, c) => P(`| ${k} | ${n} | ${c.toFixed(2)} | ${f1(maeOf(c))} | ${c >= NEED.mae10 ? 'yes' : 'no'} | ${c >= NEED.mae5 ? 'yes' : 'no'} |`);
  famRow('COG', FAM.COG.length, comb.COG);
  famRow('SCALE (scale + taps)', FAM.SCALE.length, comb.SCALE);
  famRow('CROSS (crossover + taps)', FAM.CROSS.length, comb.CROSS);
  famRow('PROBE', FAM.PROBE.length, comb.PROBE);
  famRow('memory trio (retests)', G.d.length, comb.D);
  P();
  P('**What the plan can and cannot do.** On these estimates it brings every group (c) family to an MAE of about 8 to 9, and the memory trio to about 10.5 (just short). **"Within 5" is out of reach for all of them in a month**: it needs a reliability of 0.86, which for the cognitive tasks means about 2.7 times the daily trials (5.4 minutes a day for COG alone), and which a self-report or preference source cannot give at any length. The memory trio cannot reach 10 in a month if the half-life is weeks.');
  P();
  P('Which measures take which source:');
  P();
  for (const k of Object.keys(FAM)) P(`- **${k}:** ${FAM[k].join(', ')}.`);
  P(`- **DELAYED (group d):** ${D.join(', ')}.`);
  P();
  P('## 7. Honesty and limits');
  P();
  P('- All errors above are from a simulation whose truth models are assumptions. In particular, many group (c) measures have "no expression" because the sim gives them none, not because real behaviour carries none.');
  P('- The ideal observer is a ridge read-out of 16 log features; it can be beaten, so the (b)/(c) boundary may move.');
  P('- The pace run is idealised: a learner who really studies 60 minutes every day for a month is rarer than the sim\'s learners; quitting, resuming and leaving early are kept from the default sim.');
  P('- The plan\'s reliabilities are literature and arithmetic, not data. The most fragile are the SCALE validity (self-report against behaviour) and the CROSS effect size (the sim\'s 0.4 logits per SD is optimistic against the aptitude-treatment literature). Citations are given from memory of the literature and need checking before they go in any outward-facing text.');
  P('- Memory trio: with every optional channel on, its error went up (14.0 to 15.1 in these runs; the same kind of flip noted in `docs/SCORECARD-EVERYTHING.md` 5.4); not explained here.');
  P('- No learner data, model or paid API was used. Anthropic $0, Standard Compute $0.');
  P();
  P('## 8. Every measure, day 30 (simulated)');
  P();
  P('App MAE with defaults, share of learners within 10 and within 5, ideal observer\'s MAE, prior\'s MAE, app MAE with every optional channel, group, and the proposed source for (c) and (d).');
  P();
  P('| measure | sim truth | app MAE | within 10 | within 5 | ideal | prior | every-extra MAE | group | source |');
  P('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.slice().sort((x, y) => x.mae - y.mae)) P(`| ${r.id} | ${r.truth_model} | ${f1(r.mae)} | ${pc(r.within10)} | ${pc(r.within5)} | ${f1(r.ideal)} | ${f1(r.prior)} | ${r.all ? f1(r.all.mae) : '-'} | ${r.group} | ${r.fam || (r.group === 'd' ? 'DELAYED' : '')} |`);
  fs.writeFileSync(md, L.join('\n') + '\n');
  console.error(`wrote ${md}`);
}
