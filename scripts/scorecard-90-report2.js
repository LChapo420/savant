/**
 * Appends Phase 2 (sections 9 onward) to docs/SCORECARD-90.md from the outputs of scripts/scorecard-90-measure.js. SIMULATED.
 *   node scripts/scorecard-90-report2.js DIR   (DIR holds m-main.json, m-half.json, ... as written by the runs in the doc)
 */
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const get = (n) => { const f = path.join(dir, `m-${n}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
const R = { main: get('main'), half: get('half'), blind: get('blind'), indep: get('indep'), menurt: get('menurt'), ceil: get('ceil'), stop: get('stop'), d180: get('d180'), c180: get('c180'), s180: get('s180'), d365: get('d365'), c365: get('c365'), s365: get('s365') };
const f1 = (v) => Number(v).toFixed(1); const pc = (v) => `${(v * 100).toFixed(0)}%`;
const L = []; const P = (s = '') => L.push(s);
const row = (name, r, day) => (r ? `| ${name} | ${day} | ${r.summary.S5.accuracy}% | ${pc(r.summary.S5.learners_w5)} | ${r.summary.S5.measures_w5_99} | ${r.summary.S5.measures_le5} | ${r.summary.S5.measures_le10} | ${(r.minutes_total_per_learner / r.days).toFixed(1)} (${r.minutes_total_per_learner} min) |` : null);
P();
P('## 9. Phase 2: can every measure reach 95% (mean error 5 points) by day 30? (SIMULATED, sim first, no product change)');
P();
P('**Definition (owner, 2 Nov):** accuracy of a measure for a learner = 100 minus the absolute error in points; target: average accuracy across all measures and learners at least 95% at day 30 of 60 min/day (mean error 5 or less); per measure as close to 100% as possible; 98 to 99% after 6 to 12 months. Reported per measure: mean error, the share of learners within 5, the 95th and 99th percentile error. Method and code: `scripts/scorecard-90-measure.js`; the sim now takes `--truth-factors`, `--dump`, `--ramp-cap` (all off by default; the default sim and the gate baseline are unchanged and `npm test` passes).');
P();
P('### 9.1 Headline');
P();
P('| run | day | average accuracy | learner-measure pairs within 5 | measures with 99%+ of learners within 5 | measures with mean error <= 5 | measures <= 10 | measuring time a day (month) |');
P('|---|---|---|---|---|---|---|---|');
for (const [n, k, d] of [['planned measurement, literature validities (the plan)', 'main', 30], ['same, validities halved (robustness)', 'half', 30], ['same, items planned without looking at the app (blind)', 'blind', 30], ['same, truths independent (no covariance to borrow)', 'indep', 30], ['plan + in-flow menu picks + response-time channel', 'menurt', 30], ['plan + both + every source at the top of its range', 'ceil', 30], ['everything + per-measure stopping, up to 3,000 min', 'stop', 30], ['plan (budget 10 then 3 min/day)', 'd180', 180], ['everything at top of range', 'c180', 180], ['everything + stopping, up to 6,000 min', 's180', 180], ['plan', 'd365', 365], ['everything at top of range', 'c365', 365], ['everything + stopping', 's365', 365]]) { const r = row(n, R[k], d); if (r) P(r); }
P();
const m = R.main;
P(`Before any of it, the app alone is at **${(100 - Number(m.summary.S0.mae)).toFixed(1)}%** (mean error ${m.summary.S0.mae}) at day 30. **No run reaches 95% at day 30; the nearest (everything on, measuring up to 100 minutes a day) is ${R.stop.summary.S5.accuracy}%, and no measure has 99% of learners within 5.** Details below.`);
P();
P('### 9.2 What each route buys (plan, day 30, mean of two seeds, 400 learners)');
P();
P('| stage | what was added | average accuracy | pairs within 5 | measures <= 5 | measures <= 10 |');
P('|---|---|---|---|---|---|');
const stg = { S0: 'the app as it is', S1: 'recalibrated read-out of the answer log (cross-fit; fixes the group (b) drift)', S2: 'joint posterior: population covariance (empirical Bayes) from the app\'s own reads', S3: 'embedded item-feature design (explanatory IRT), 4,000 answers, zero learner time', S4: 'planned retests at varied lags (the memory trio), zero extra time', S5: 'adaptive item banks, 10 min/day for 14 days then 3 (188 min)' };
for (const s of Object.keys(stg)) P(`| ${s} | ${stg[s]} | ${m.summary[s].accuracy}% | ${pc(m.summary[s].learners_w5)} | ${m.summary[s].measures_le5} | ${m.summary[s].measures_le10} |`);
P();
P(`- **S1 (recalibration)** cuts the error from ${m.summary.S0.mae} to ${m.summary.S1.mae}; the drift in group (b) is real and fixable, but 4 measures got worse (failure_response, error_recovery_speed, frustration_threshold, persistence): a ridge read-out fitted on one seed does not transfer to the other for them, so a beta must validate any recalibration on held-out learners.`);
P(`- **S2 (joint posterior)** alone does not help (${m.summary.S2.mae}): covariance estimated from noisy app reads is too weak. With designed sources (S3 on) the estimated covariance keeps ${m.cov.designed} factors against ${m.cov.app} from the app reads, and the joint posterior is what turns each cheap source into information about its neighbours. With independent truths (no covariance to borrow) the end result is ${R.indep.summary.S5.accuracy}% instead of ${m.summary.S5.accuracy}%.`);
P(`- **S3 (embedded item-feature design)** is the largest free gain: accuracy ${m.summary.S2.accuracy}% to ${m.summary.S3.accuracy}%. 20 features varied in a balanced +-1 design over 4,000 answers; each learner's slope on a feature gives a reading of one measure with error variance ${f1(m.lltm.var)} in z units (reliability about ${(1 / (1 + m.lltm.var)).toFixed(2)}), at the sim's own effect size (0.068 logits per SD per +-1). The effect size is the weak point: halving the validities makes the end result ${R.half.summary.S5.accuracy}%.`);
P(`- **S4 (planned retests)** brings the memory trio from ${m.summary.S3.groups.d.mae} to ${m.summary.S4.groups.d.mae} points: about ${Math.round(m.retest.events)} retests a learner at lags of hours to 28 days across 100 skills, fitted by the curve (error variance ${f1(m.retest.var)}), against ${f1(m.retest.current)} for the scheduler's current pattern (near-optimal spacing, about ${Math.round(m.retest.eventsCurrent)} reviews). It costs no extra time but spends reviews at lags the scheduler would not choose (a retention cost not simulated here).`);
P(`- **S5 (adaptive banks)** is where most of the remaining gain is: ${m.summary.S4.accuracy}% to ${m.summary.S5.accuracy}%, with ${m.minutes_per_day} min a day on average. The 188 minutes split as ${Object.entries(m.mix_minutes_by_source).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')} minutes (one learner's plan). Responses are linear-Gaussian here, so the posterior covariance does not depend on the answers: "adaptive" means each learner's items are chosen by expected variance reduction given what the app already knows about them. Planning blind to the app reading gives the same accuracy (${R.blind.summary.S5.accuracy}%).`);
P();
P('### 9.3 Why the plan stops near 93% and what 95% to 100% would need');
P();
P(`Every item type has a part of its error that does not average away (a self-report is the learner's own view of themselves; a choice is the learner's choice in that context). With \`rho_inf\` the most any number of items of a source can explain, the posterior precision from a source is capped at \`rho_inf / (1 - rho_inf)\` (z units), and the precisions of independent sources add. The needed precision is 6.35 for a mean error of 5, 33 for 99% of learners within 5 (error SD 1.9: variance 0.0125, precision 79).`);
const nf = m.needs.filter((n) => !n.mae5.capOK).length; const nf2 = m.needs.filter((n) => !n.sd19.capOK).length;
P(`- **Mean error 5 (95%):** ${m.needs.length - nf} of ${m.needs.length} latents (counting the memory trio once) can reach it with the sources assumed, if given unlimited time; ${nf} cannot, whatever the minutes: the sources in their bank add up to less precision than 6.35. Median extra independent reliability they would still need: ${(() => { const e = m.needs.filter((n) => !n.mae5.capOK).map((n) => n.mae5.extraRho).sort((a, b) => a - b); return e.length ? e[Math.floor(e.length / 2)] : 0; })()}.`);
P(`- **99% of learners within 5:** ${m.needs.length - nf2} of ${m.needs.length} are reachable; ${nf2} cannot. It needs a reliability of 0.99, and that is above the best published instrument for almost any trait (full-battery cognitive composites reach 0.97 to 0.98 after an hour; single-construct scales 0.85 to 0.95; behavioural tasks 0.5 to 0.9). **It is not a matter of minutes: it needs a different kind of source (a direct, near-noiseless measure of the same quantity), which the sim\'s "true value" definition does not supply for preferences and attitudes.**`);
P(`- Per-measure stopping (keep measuring a learner until their posterior SD is under 1.9 points) is simulated in the "stop" run: it used ${R.stop.minutes_p50} minutes at the median (${R.stop.minutes_per_day} min a day, the cap), reached mean error ${R.stop.summary.S5.mae} (accuracy ${R.stop.summary.S5.accuracy}%), ${R.stop.summary.S5.measures_le5} measures at mean error 5 or less, and still **no** measure with 99% of learners within 5.`);
P('- **Physical reasons, in the sim\'s own terms:** (1) the persistent error of each source type (above); (2) the memory trio\'s half-life: a skill practised well has a half-life that grows past the horizon, so late retests carry less information (see 9.5); (3) the sim\'s true values are fixed traits with no day-to-day fluctuation, so no measure is limited by fluctuation here; in real learners state fluctuation would add a further floor that no number of items removes.');
P();
P('### 9.4 Long term: 180 and 365 days');
P();
P('The main sim was run to day 180 (and day 365 where the row above appears) with 40 learners per seed (80 in all: a smaller sample than the 400 at day 30, so single numbers move by about 0.3). The sim\'s single course ramp (0.02 logits a level, built for 100 levels) is capped at 300 levels (`--ramp-cap=300`: new material arrives at the same difficulty); the measuring budgets scale (10 min/day for 14 days then 3), the item-feature design scales to 24,000 answers at 180 days, and retest lags reach 180 days. **At 180 days the app alone is not better but worse (' + (R.d180 ? R.d180.summary.S0.accuracy : '-') + '%): its rules were tuned on 100 levels and drift further with 3,000 levels of use, which is the group (b) problem getting larger with practice.**');
P();
P('### 9.5 The memory trio');
P();
P(`The sim\'s half-life is exp(-0.306 z) times a base that grows with every well-spaced success (1.3 to 2.8 times), so after a few good retests it exceeds the horizon. Fitting the multiplier by the curve over planned retests gives a reliability of about ${(1 / (1 + m.retest.var)).toFixed(2)} at 30 days (mean error ${m.summary.S4.groups.d.mae}) against ${(1 / (1 + m.retest.current)).toFixed(2)} for the scheduler's own reviews. At 180 days the multiplier is better identified (group (d) mean error ${R.d180 ? R.d180.summary.S5.groups.d.mae : '-'}). A half-life of many months cannot be identified from the first 30 days at all.`);
P();
P('### 9.6 Assumptions (every one is an assumption; none is measured on learners)');
P();
P('| source | single-item reliability | most any number of items can explain | seconds | anchor |');
P('|---|---|---|---|---|');
for (const [k, v] of [['WM', 'digit/Corsi span trial; Conway et al. 2005'], ['SPEED', 'pattern/symbol comparison items'], ['REAS', 'matrix/series/syllogism; Bilker et al. 2012'], ['SWITCH', 'mixed-block trials; Hedge et al. 2018'], ['KNOW', 'calibrated knowledge/vocabulary item'], ['GEN', 'rubric-scored production'], ['SCALE', 'one validated scale item; Dang et al. 2020'], ['SCALE_C', 'self-estimate of ability; Freund & Kasten 2012'], ['CHOICE', 'forced choice between two versions; Thurstone 1927'], ['CHOICE_M', 'forced choice between activities'], ['MENU', 'a pick in a normal "what next?" menu (about 290 a month)']]) {
  const t = { WM: [0.21, 0.85, 9], SPEED: [0.09, 0.9, 2.5], REAS: [0.18, 0.9, 30], SWITCH: [0.06, 0.6, 4], KNOW: [0.2, 0.95, 12], GEN: [0.08, 0.5, 35], SCALE: [0.25, 0.25, 10], SCALE_C: [0.15, 0.12, 10], CHOICE: [0.26, 0.7, 7], CHOICE_M: [0.2, 0.5, 7], MENU: [0.15, 0.5, 2] }[k];
  P(`| ${k} | ${t[0]} | ${t[1]} | ${t[2]} | ${v} |`);
}
P();
P('"Top of range" raises SCALE to 0.40, SCALE_C 0.30, CHOICE 0.85, CHOICE_M 0.75, MENU 0.70, GEN 0.80, SWITCH 0.80. The item-feature design: 20 features, +-1 coding, effect 0.068 logits per SD of trait, unexplained slope SD 0.035, 4,000 answers a month; response time as a second outcome halves each slope\'s sampling noise. Population covariance: the sim\'s own truths are correlated through a general factor and a factor per category (loadings 0.5/0.3 for the three cognitive categories, 0.25/0.4 for the rest; `--truth-factors=1`), and the app estimates the covariance from a synthetic calibration population of 1,500 measured with the plan, with Marchenko-Pastur eigenvalue clipping (Laloux et al. 2000). Recalibrations are cross-fit between the two seeds with the sim\'s truth as the label, which a beta can only approximate. The claimed spread of a recalibrated read is widened by 1 + 30/n.');
P();
P('### 9.7 Every measure at day 30 (SIMULATED): the plan and the everything-on run');
P();
P('Mean error, share of learners within 5, and 99th percentile error, for the plan (188 min) and for everything on with stopping (up to 3,000 min, not a realistic cost). "cap" says whether the measure\'s sources could reach mean error 5 with unlimited time, and for 99% within 5 (the extra independent reliability still needed).');
P();
P('| measure | grp | app | plan mean | plan within 5 | plan p99 | all-on mean | all-on within 5 | all-on p99 | reach 5 / extra rho | reach 99% / extra rho |');
P('|---|---|---|---|---|---|---|---|---|---|---|');
const need = Object.fromEntries(m.needs.map((n) => [n.id, n]));
const ids = Object.keys(m.perMeasure.S5).sort((a, b) => m.perMeasure.S5[a][0] - m.perMeasure.S5[b][0]);
const Alias = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(dir, 'dump-fa.json'), 'utf8')).aliases.map(([id, base]) => [id, base]));
for (const id of ids) {
  const a = m.perMeasure.S5[id]; const b = R.stop.perMeasure.S5[id]; const z = m.perMeasure.S0[id]; const n = need[id] || need[Alias[id]];
  P(`| ${id} | ${grpOf(id)} | ${f1(z[0])} | ${f1(a[0])} | ${pc(a[1])} | ${f1(a[4])} | ${f1(b[0])} | ${pc(b[1])} | ${f1(b[4])} | ${n ? (n.mae5.capOK ? 'yes' : 'no / ' + n.mae5.extraRho) : '-'} | ${n ? (n.sd19.capOK ? 'yes' : 'no / ' + n.sd19.extraRho) : '-'} |`);
}
function grpOf(id) {
  const A = 'processing_velocity,vocabulary_ceiling,rush_tendency,deliberation_depth,challenge_appetite,failure_response,error_recovery_speed,frustration_threshold,hint_dependency,guessing_propensity,perfectionism,confidence_calibration,self_monitoring,brevity_preference,persistence,prior_knowledge'.split(',');
  const Bg = 'systems_thinking,pattern_detection,contradiction_sensitivity,attention_runway,fatigue_curve,recognition_recall_gap,consolidation_need,help_seeking,error_driven_learning,instruction_adherence,reflection_depth,self_efficacy,scaffolding_fade,notation_comfort,repetition_tolerance,open_response_performance,near_transfer,misconception_persistence,mastery_velocity'.split(',');
  return ['decay_rate', 'retention_index', 'retrieval_strength'].includes(id) ? 'd' : A.includes(id) ? 'a' : Bg.includes(id) ? 'b' : 'c';
}
P();
P('### 9.8 Honest summary');
P();
P('- Day 30 at 60 min/day: the app alone 87.7%; the plan (about 6 min a day of measuring, plus free embedded design and retests) 92.5%; every route at the top of its range with unlimited stopping 94.9%. **95% is not reached in 30 days in this sim, and 99% of learners within 5 points is reached for no measure.** The main limit is the persistent error of every self-report, choice and production source (their validity against the true value), not the number of items.');
P('- What would close the gap: sources with validity 0.9 or better against the true value for the 60 preference, attitude and strategy measures (there are none in the literature for self-report; a direct behavioural criterion or many months of consistent behaviour is what would define the value); a longer horizon (the long-term runs above); and a definition of "true value" that includes how well it can be known.');
P('- Not done / unverified: nothing here has been run on learners; the app code is unchanged; the effect size of embedded feature variation (the second-largest gain) is an assumption; the recalibration uses the sim\'s truth and needs a labelled beta; retests at unusual lags cost retention; the 180/365-day runs use a smaller sample and a capped course ramp.');
fs.appendFileSync(path.join(__dirname, '..', 'docs', 'SCORECARD-90.md'), L.join('\n') + '\n');
console.error('appended', L.length, 'lines');
