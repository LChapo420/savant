# 05 Engagement, UX and wellbeing: evidence for every mechanism

Section 05 of the evidence article (2026-10-25). Scope: streaks, XP and rewards; the study-session strip; break and length guidance; feedback wording and rationales; hints and the coach; question formats and `preferTypeIn`; accessibility; mobile layout; dashboard, progress and calendar; reminders; privacy and consent for minors; owner skips; error and empty states.

Method. Code was read at the `file:line` given. Every DOI was resolved through Crossref (title, first author and year matched). Every quote below was machine-checked as a substring of the abstract (OpenAlex or Crossref) or, for standards, of the fetched official page. `[R]` marks a source reused from `scorecard-sources.json` or `retention-sources.json` (already DOI-verified; its quote was re-checked here). `[N]` marks a new source, listed in `05-engagement-ux-wellbeing-sources.json`. "Title-level only" means the DOI is real but no abstract text was reachable, so it is not counted toward the three sources.

Honest limits, up front:
- **No source found tests a streak counter against learning outcomes.** Streak evidence is indirect (habit formation, loss aversion, goal-gradient). It is marked mixed or design choice, never strong.
- **XP and gamification evidence is mixed.** Meta-analyses find small to moderate positive effects (Sailer 2019 g = .49 cognitive; Zeng 2024 g = 0.782) but those effects are unstable on motivation and behaviour and depend on context. The overjustification literature conflicts (Deci 1999 vs Cameron 1994). See M3.
- Evidence on UI-layout choices (touch targets, single call to action, bottom tab bar) is mostly HCI lab work with adults, or standards. Children are under-studied.
- The ICO code and COPPA are law and regulator guidance, not learning evidence. They set what is allowed; they do not show what teaches.

## Source table

Quotes are verbatim, under 25 words. "Pop." is the population or setting the abstract reports.

| id | DOI / URL | Quote | Pop. / setting |
| --- | --- | --- | --- |
| deci1999 [R] | 10.1037/0033-2909.125.6.627 | "engagement-contingent, completion-contingent, and performance-contingent rewards significantly undermined free-choice intrinsic motivation" ; "Positive feedback enhanced both free-choice behavior (d = 0.33) and self-reported interest (d = 0.31)." | Meta-analysis, 128 experiments, children and college students |
| cameron1994 [N] | 10.3102/00346543064003363 | "Results indicate that, overall, reward does not decrease intrinsic motivation." ; "The only negative effect appears when expected tangible rewards are given to individuals simply for doing a task." | Meta-analysis, 96 experiments |
| lepper1973 [N] | 10.1037/h0035519 | "subjects in the expected-award condition would show less subsequent intrinsic interest in the target activity" | Field experiment with children |
| eisenberger1996 [N] | 10.1037/0003-066x.51.11.1153 | "detrimental effects of reward occur under highly restricted, easily avoidable conditions" | Review of 25 years of reward research |
| sailer2020 [R] (Sailer and Homner 2019) | 10.1007/s10648-019-09498-w | "significant small effects of gamification on cognitive ( g = .49, 95% CI [0.30, 0.69], k = 19, N = 1686)" ; "effects on motivational and behavioral outcomes were less stable" | Meta-analysis of gamified vs non-gamified learning |
| zeng2024 [N] | 10.1111/bjet.13471 | "the results revealed a moderately positive effect of gamification on student academic performance (Hedges's g = 0.782, p < 0.05)" | Meta-analysis, 22 experimental studies, 2008-2023 |
| hamari2014 [N] | 10.1109/hicss.2014.377 | "the effects are greatly dependent on the context in which the gamification is being implemented, as well as on the users using it" | Literature review of empirical gamification studies |
| sailer2017 [N] | 10.1016/j.chb.2016.12.033 | "gamification is not effective per se, but that specific game design elements have specific psychological effects" | Randomised online-simulation study |
| shortt2021 [N] | 10.1080/09588221.2021.1933540 | "The focus on app design marks an emphasis on the creation of tools rather than the process and outcomes of language learning" | Systematic review, 35 Duolingo studies |
| anderson2013 [N] | 10.1145/2488388.2488398 | "users will put in non-trivial amounts of work to achieve particular badges" | Online communities, badge systems |
| przybylski2010 [N] | 10.1037/a0019440 | "both the appeal and well-being effects of video games are based in their potential to satisfy basic psychological needs for competence, autonomy, and relatedness" | Theory and review (self-determination theory) |
| ryan2000 [R] | 10.1037/0003-066X.55.1.68 | "three innate psychological needs--competence, autonomy, and relatedness--which when satisfied yield enhanced self-motivation and mental health" | Theory review |
| patall2008 [R] | 10.1037/0033-2909.134.2.270 | "providing choice enhanced intrinsic motivation, effort, task performance, and perceived competence" | Meta-analysis of choice studies |
| karich2014 [N] | 10.3102/0034654314526064 | "The overall effect of including learner control within educational technology was almost zero (g = 0.05)" | Meta-analysis, 18 articles, 29 effects |
| kivetz2006 [R] | 10.1509/jmkr.43.1.39 | "participants in a real café reward program purchase coffee more frequently the closer they are to earning a free coffee" | Café customers, online song raters (adults) |
| nunes2006 [N] | 10.1086/500480 | "people provided with artificial advancement toward a goal exhibit greater persistence toward reaching the goal" | Consumer field experiments (adults) |
| cheema2011 [N] | 10.1509/jm.75.2.109 | "the beneficial effects of visualization exist only when people are close to the goal" | Consumers, swimmers, lab tasks |
| locke2002 [N] | 10.1037/0003-066x.57.9.705 | "The authors summarize 35 years of empirical research on goal-setting theory." | Review (abstract-level support only) |
| lally2009 [N] (published 2010) | 10.1002/ejsp.674 | "Missing one opportunity to perform the behaviour did not materially affect the habit formation process." ; "ranged from 18 to 254 days" | 96 adult volunteers, 12 weeks, daily behaviour |
| kahneman1979 [N] | 10.2307/1914185 | "is generally steeper for losses than for gains" | Lab choice problems |
| albulescu2022 [N] | 10.1371/journal.pone.0272460 | "statistically significant but small effects of micro-breaks in boosting vigor (d = .36, p < .001; k = 9, n = 913)" ; "a non-significant effect on increasing overall performance (d = .16, p = .116; k = 15, n = 1132)" | Meta-analysis, 22 samples, N = 2335, mostly working adults and students |
| biwer2023 [N] | 10.1111/bjep.12593 | "Taking pre-determined, systematic breaks during a study session had mood benefits and appeared to have efficiency benefits" | 87 Dutch university students, one day |
| blasche2018 [N] | 10.1002/smi.2830 | "the unstructured rest break led to an increase in vigor" | 66 students, 4-hour university classes |
| szpunar2013 [R] | 10.1073/pnas.1221764110 | "the simple act of interpolating online lectures with memory tests can help students sustain attention to lecture content" | Two experiments, online lectures |
| sievertsen2016 [R] | 10.1073/pnas.1516947113 | "for every hour later in the day, test performance decreases by 0.9% of an SD" ; "a 20- to 30-minute break improves average test performance by 1.7% of an SD" | All Danish public-school children, 2009-2013 |
| ackerman2009 [R] | 10.1037/a0015719 | "subjective fatigue increased with increasing time-on-task. However, mean performance increased in the longer test length conditions" | 239 first-year university students |
| borgonovi2016 [R] | 10.1016/j.lindif.2016.06.001 | "academic endurance, defined as students' ability to maintain their baseline rates of successful test completion for the duration of a low-stakes cognitive test" (from the claim check; abstract not machine-reachable) | International comparison of students |
| cepeda2006 [R] | 10.1037/0033-2909.132.3.354 | "This review found 839 assessments of distributed practice in 317 experiments located in 184 articles." | Quantitative synthesis |
| milkman2011 [N] | 10.1073/pnas.1103170108 | "had a 4.2 percentage point higher vaccination rate" (date-and-time prompt vs control) | Employees of one large firm, flu vaccination |
| castleman2015 [N] | 10.1016/j.jebo.2014.12.008 | "The interventions substantially increased college enrollment among students who had less academic-year access to quality college counseling or information." (abstract read from a repository copy of the same paper) | College-intending low-income US high-school graduates, text-message reminders |
| kushlev2016 [N] | 10.1145/2858036.2858359 | "Participants reported higher levels of inattention and hyperactivity when alerts were on than when alerts were off." | 221 adults, one week per condition |
| hattie2007 [R] | 10.3102/003465430298487 | "Feedback is one of the most powerful influences on learning and achievement, but this impact can be either positive or negative." | Review |
| kluger1996 [R] | 10.1037/0033-2909.119.2.254 | "FIs improved performance on average (d =.41)" (607 effect sizes; the source abstract also says over a third decreased performance, but its text is garbled so it is not quoted) | Meta-analysis, 23,663 observations |
| shute2008 [R] | 10.3102/0034654307313795 | "formative feedback should be nonevaluative, supportive, timely, and specific" | Review |
| wisniewski2020 [R] | 10.3389/fpsyg.2019.03087 | "medium effect (d = 0.48) of feedback on student learning" | Meta-analysis |
| vanderkleij2015 [R] | 10.3102/0034654314564881 | "than feedback regarding the correctness of the answer (KR; 0.05)" (elaborated feedback produced 0.49) | Meta-analysis of computer-based feedback |
| butler2013 [R] | 10.1037/a0031026 | "explanation feedback produced superior performance on the new inference questions" | College students, prose passages, test two days later |
| pashler2005 [R] | 10.1037/0278-7393.31.1.3 | "Supplying the correct answer after an incorrect response not only improved performance during the initial learning session" ; "feedback after correct responses made little difference either immediately or at a delay" | N = 258 adults, word pairs, one-week test |
| butler2008 [R] | 10.1037/0278-7393.34.4.918 | "when correct responses are made with low confidence, feedback serves to correct this initial metacognitive error, enhancing retention" | Undergraduates, general-knowledge questions |
| butler2007 [R] | 10.1037/1076-898X.13.4.273 | "delayed feedback led to superior final test performance relative to immediate feedback" | Adults, multiple-choice tests on prose |
| mullet2014 [R] | 10.1016/j.jarmac.2014.05.001 | "a growing body of research has challenged this assumption by demonstrating that delaying feedback can facilitate learning" | College students |
| kulik1988 [R] | 10.2307/1170349 | "Applied studies using actual classroom quizzes and real learning materials have usually found immediate feedback to be more effective than delayed." | Review of timing studies |
| mueller1998 [R] | 10.1037/0022-3514.75.1.33 | "praise for intelligence had more negative consequences for students' achievement motivation than praise for effort" | Six studies, fifth graders |
| henderlong2002 [R] | 10.1037/0033-2909.128.5.774 | "Provided that praise is perceived as sincere, it is particularly beneficial to motivation when it encourages performance attributions to controllable causes" | Review of children's praise research |
| metcalfe2017 [R] | 10.1146/annurev-psych-010416-044022 | "errorful learning followed by corrective feedback is beneficial to learning" ; "Errors committed with high confidence are corrected more readily than low-confidence errors." | Review of laboratory and classroom studies |
| dunlosky2012 [R] | 10.1016/j.learninstruc.2011.08.003 | "greater accuracy was associated with higher levels of retention" | College students, key-term definitions, two studies, final test two days later |
| stankov2012 [R] | 10.1016/j.lindif.2012.05.013 | "can be combined with accuracy information to obtain bias scores that may be useful for group comparisons and for identification of misconceptions" | 15-year-olds in Singapore, mathematics (N = 1940) and English (N = 1786) |
| keith2008 [N] | 10.1037/0021-9010.93.1.59 | "the mean effect of EMT across all 24 identified studies (N = 2,183) was positive and significant (Cohen's d = 0.44)" | Adult workplace and lab training |
| vanlehn2011 [R] | 10.1080/00461520.2011.611369 | "the effect size of intelligent tutoring systems was 0.76, so they are nearly as effective as human tutoring" | Review of tutoring experiments |
| kulik2016 [R] | 10.3102/0034654315581420 | "The median effect of intelligent tutoring in the 50 evaluations was to raise test scores 0.66 standard deviations over conventional levels" | 50 controlled evaluations |
| aleven2003 [R] | 10.3102/00346543073003277 | "although effective help-seeking behavior in ILEs is related to better learning outcomes, learners are not using help facilities effectively" | Selective review |
| aleven2016 [R] (id aleven2016help) | 10.1007/s40593-015-0089-1 | "but not to achieve better learning outcomes" (feedback on help seeking changed help use, not outcomes) | Classroom study with an intelligent tutor |
| bastani2025 [R] | 10.1073/pnas.2422633122 | "students actually perform worse than those who never had access (17% reduction in grades for GPT Base)" ; "These negative learning effects are largely mitigated by the safeguards in GPT Tutor." | Nearly 1,000 high-school maths students |
| kestin2025 [R] | 10.1038/s41598-025-97652-6 | "students learn significantly more in less time when using the AI tutor, compared with the in-class active learning" | College students, RCT |
| kapur2008 [N] | 10.1080/07370000802212669 | "engaging students in solving complex, ill-structured problems without the provision of support structures can be a productive exercise in failure" | Eleventh-grade science students |
| kalyuga2003 [R] | 10.1207/s15326985ep3801_4 | "Instructional techniques that are highly effective with inexperienced learners can lose their effectiveness and even have negative consequences when used with more experienced learners" | Review |
| baker2008 [R] | no DOI (existing entry) | "present evidence on which student behaviors, motivations, and emotions are associated with the choice to game the system" | Students in interactive learning environments |
| wise2005 [R] (Wise and Kong) | 10.1207/s15324818ame1802_2 | "unmotivated examinees will answer too quickly (i.e., before they have time to read and fully consider the item)" | Computer-based test examinees |
| wisedemars2005 [N] | 10.1207/s15326977ea1001_1 | "low student motivation is associated with a substantial decrease in test performance" | Low-stakes assessment review |
| roediger2006 [R] | 10.1111/j.1467-9280.2006.01693.x | "Testing is a powerful means of improving learning, not just assessing it." | College students, prose passages |
| rowland2014 [R] | 10.1037/a0037559 | "initial recall tests yielding larger testing benefits than recognition tests" | Meta-analysis of testing vs restudy |
| little2012 [R] | 10.1177/0956797612443370 | "properly constructed multiple-choice tests can indeed trigger productive retrieval processes" | Two experiments, undergraduates |
| mcdermott2014 [R] | 10.1037/xap0000004 | "the format of the quiz (multiple-choice or short-answer) did not need to match the format of the criterial test" | Seventh-grade science, high-school history |
| kang2007 [R] | 10.1080/09541440601056620 | "having had an intervening MC test led to better performance than an intervening SA test" (no feedback) ; "With feedback provided, having had an intervening SA test led to the best performance on the final test" | Undergraduates, journal papers |
| smith2014 [R] (Smith and Karpicke 2013) | 10.1080/09658211.2013.831454 | "little or no advantages of answering short-answer or hybrid format questions over multiple-choice questions" | Undergraduates |
| vangog2015 [R] | 10.1007/s10648-015-9310-x | "the testing effect decreases as the complexity of learning materials increases" | Review |
| pashler2008 [R] | 10.1111/j.1539-6053.2009.01038.x | "the meshing hypothesis, according to which instruction is best provided in a format that matches the preferences of the learner" (the hypothesis the review then finds unsupported) | Review |
| rogowsky2015 [R] | 10.1037/a0037478 | "Results failed to show a statistically significant relationship between learning style preference (auditory, visual word) and learning aptitude" | College-educated adults |
| rogowsky2020 [R] | 10.3389/fpsyg.2020.00164 | "Consistent with earlier findings with adults, results failed to find a significant relationship between auditory or visual learning style preference and comprehension." | Fifth graders |
| willingham2015 [R] | 10.1177/0098628315589505 | "scientific support for these theories is lacking" | Review |
| cuevas2015 [R] | 10.1177/1477878515606621 | "the more methodologically sound studies have tended to refute the hypothesis" | Review of post-2009 studies |
| hembree1988 [R] | 10.2307/1170348 | "Test anxiety (TA) causes poor performance." | Meta-analysis |
| agarwal2014anx [R] | 10.1016/j.jarmac.2014.07.002 | "72% reported that retrieval practice made them less nervous for unit tests and exams" | 1,408 middle and high school students (survey) |
| khanna2015 [R] | 10.1177/0098628315573144 | "Students taking ungraded pop quizzes outperformed students taking graded pop quizzes and students taking no quizzes on the final exam." | Introductory psychology students |
| chi1994 [N] | 10.1207/s15516709cog1803_3 | "Generating explanations to oneself (self-explaining) facilitates that integration process." | 14 eighth graders, one passage |
| cordova1996 [R] | 10.1037/0022-0663.88.4.715 | "contextualization, personalization, and provision of choices" (the three strategies tested) | School-age children learning with a computer task |
| parhi2006 [N] | 10.1145/1152215.1152260 | "target size of 9.2 mm for discrete tasks and targets of 9.6 mm for serial tasks should be sufficiently large for one-handed thumb use" | Adults, small touchscreens (2006 devices) |
| hughes2000 [N] | 10.1111/1467-9817.00126 | "The reading speed of children aged 5 to 7 years decreased as the text size decreased" | 120 children aged 5 to 11, passages at four type sizes |
| hall2004 [N] | 10.1080/01449290410001669932 | "Colours with greater contrast ratio generally lead to greater readability" | 136 participants, web pages |
| sung2016 [N] | 10.1016/j.compedu.2015.11.008 | "moderate mean effect size of 0.523 for the application of mobile devices to education" | Meta-analysis, 110 studies, 1993-2013 |
| matcha2020 [N] | 10.1109/tlt.2019.2916802 | "existing LADs are rarely grounded in learning theory" | Systematic review of dashboard studies |
| bodily2017 [N] | 10.1109/tlt.2017.2740172 | "Out of the 945 articles retrieved from databases and journals, 93 articles were included in the analysis." | Review of student-facing dashboards |
| nah2004 [N] | 10.1080/01449290410001669914 | "the presence of feedback prolongs Web users' tolerable waiting time" | Web users, experiment |
| myers1985 [N] | 10.1145/317456.317459 | "people prefer to have progress indicators" | Formal experiment (adults) |
| ceaparu2004 [N] | 10.1207/s15327590ijhc1703_3 | "The most-cited causes of frustrating experiences were error messages, dropped network connections, long download times, and hard-to-find features." | 111 computer users |
| harp1998 [R] | 10.1037/0022-0663.90.3.414 | "recalled significantly fewer main ideas and generated significantly fewer problem-solving transfer solutions" | Four experiments, students reading with interesting but irrelevant additions |
| noetel2022 [R] | 10.3102/00346543211052329 | "We found 11 design principles that demonstrated significant, positive, meta-analytic effects on learning" | Meta-meta-analysis, multimedia design |
| reyes2018 [N] | 10.1515/popets-2018-0021 | "a majority are potentially in violation of COPPA" | 5,855 popular free children's Android apps |
| zhao2019 [N] | 10.1145/3290605.3300336 | "children could identify and articulate certain privacy risks well, such as information oversharing or revealing real identities online" | 29 UK children aged 6-10, 12 focus groups |
| kumar2017 [N] | 10.1145/3134699 | "children ages 5-7 had gaps in their knowledge" | 18 US families, children 5-11 |
| slade2013 [R] | 10.1177/0002764213479366 | "face a number of ethical challenges, including location and interpretation of data" | Higher-education learning analytics |
| acquisti2015 [N] | 10.1126/science.aaa1465 | "people's uncertainty about the consequences of privacy-related behaviors and their own preferences over those consequences" | Review of privacy behaviour |
| andrejevic2019 [N] | 10.1080/17439884.2020.1686014 | "school-based facial recognition presents a number of other social challenges and concerns that merit specific attention" | Conceptual analysis, schools |
| conijn2022 [N] | 10.1111/jcal.12651 | "students reported higher levels of test anxiety" (under online proctoring) | 1,760 Dutch university students, four survey waves |
| lee2004 [N] | 10.1518/hfes.46.1.50_30392 | "Automation is often problematic because people fail to rely upon it appropriately." | Review |
| glikson2020 [N] | 10.5465/annals.2018.0057 | "The success of integrating AI into organizations critically depends on workers' trust in AI technology." | Review of 20 years of research |
| hoff2015 [N] | 10.1177/0018720814547570 | "willingness of human operators to rely on automation" | Systematic review (2002-2013) |
| pardo2014 [R] | 10.1111/bjet.12152 | "The privacy and ethical issues that emerge in this context are tightly interconnected with other aspects such as trust, accountability and transparency." | Learning analytics principles |
| wcag-2.5.8 [N] | https://www.w3.org/TR/WCAG22/#target-size-minimum | "The size of the target for pointer inputs is at least 24 by 24 CSS pixels" | W3C Level AA |
| wcag-2.5.5 [N] | https://www.w3.org/TR/WCAG22/#target-size-enhanced | "The size of the target for pointer inputs is at least 44 by 44 CSS pixels" | W3C Level AAA |
| wcag-1.4.3 [N] | https://www.w3.org/TR/WCAG22/#contrast-minimum | "contrast ratio of at least 4.5:1" | W3C Level AA |
| wcag-1.4.11 [N] | https://www.w3.org/TR/WCAG22/#non-text-contrast | "contrast ratio of at least 3:1 against adjacent color(s)" | W3C Level AA |
| wcag-1.4.1 [N] | https://www.w3.org/TR/WCAG22/#use-of-color | "Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element." | W3C Level A |
| wcag-2.3.3 [N] | https://www.w3.org/TR/WCAG22/#animation-from-interactions | "Motion animation triggered by interaction can be disabled, unless the animation is essential to the functionality or the information being conveyed." | W3C Level AAA |
| wcag-4.1.3 [N] | https://www.w3.org/TR/WCAG22/#status-messages | "status messages can be programmatically determined through role or properties such that they can be presented to the user by assistive technologies without receiving focus." | W3C Level AA |
| wcag-2.4.7 [N] | https://www.w3.org/TR/WCAG22/#focus-visible | "Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible." | W3C Level AA |
| wcag-2.4.1 [N] | https://www.w3.org/TR/WCAG22/#bypass-blocks | "mechanism is available to bypass blocks of content that are repeated on multiple web pages." | W3C Level A |
| wcag-1.4.10 [N] | https://www.w3.org/TR/WCAG22/#reflow | "Content can be presented without loss of information or functionality, and without requiring scrolling in two dimensions" | W3C Level AA |
| wcag-3.3.1 [N] | https://www.w3.org/TR/WCAG22/#error-identification | "If an input error is automatically detected, the item that is in error is identified and the error is described to the user in text." | W3C Level A |
| wcag-3.3.3 [N] | https://www.w3.org/TR/WCAG22/#error-suggestion | "If an input error is automatically detected and suggestions for correction are known, then the suggestions are provided to the user" | W3C Level AA |
| wcag-2.2.1 [N] | https://www.w3.org/TR/WCAG22/#timing-adjustable | "For each time limit that is set by the content, at least one of the following is true:" | W3C Level A |
| coppa-312.5a1 [N] | https://www.ecfr.gov/current/title-16/part-312/section-312.5 | "An operator is required to obtain verifiable parental consent before any collection , use, or disclosure of personal information from children" | US federal rule, children under 13 |
| coppa-312.5-email [N] | same URL | "Sending a confirmatory email to the parent following receipt of consent" | US federal rule (email plus) |
| coppa-312.2 [N] | https://www.ecfr.gov/current/title-16/part-312/section-312.2 | "A photograph, video, or audio file where such file contains a child 's image or voice" | US federal rule, definition |
| coppa-312.10 [N] | https://www.ecfr.gov/current/title-16/part-312/section-312.10 | "retain personal information collected online from a child for only as long as is reasonably necessary to fulfill the specific purpose(s) for which the information was collected" | US federal rule |
| coppa-312.6 [N] | https://www.ecfr.gov/current/title-16/part-312/section-312.6 | "Right of parent to review personal information provided by a child." | US federal rule |
| gdpr-art8 [N] | https://gdpr-info.eu/art-8-gdpr/ (official text: https://eur-lex.europa.eu/eli/reg/2016/679/oj) | "the processing of the personal data of a child shall be lawful where the child is at least 16 years old" ; "Member States may provide by law for a lower age for those purposes provided that such lower age is not below 13 years." | EU regulation |
| ico-iss-consent [N] | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr/what-are-the-rules-about-an-iss-and-consent/ | "only children aged 13 years and over may lawfully provide their own consent for the processing of their personal data" | UK regulator guidance, UK GDPR Article 8 |
| es-lopdgdd-art7 [N] | https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673 | "El tratamiento de los datos personales de un menor de edad únicamente podrá fundarse en su consentimiento cuando sea mayor de catorce años" | Spanish national law (Ley Orgánica 3/2018, art. 7) |
| gdpr-art5-1c [N] | https://gdpr-info.eu/art-5-gdpr/ | "adequate, relevant and limited to what is necessary in relation to the purposes for which they are processed" | EU regulation |
| gdpr-art7-1 [N] | https://gdpr-info.eu/art-7-gdpr/ | "the controller shall be able to demonstrate that the data subject has consented to processing of his or her personal data" | EU regulation |
| ico-aadc-5 [N] | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/5-detrimental-use-of-data/ | "make it easy for them to disengage without feeling pressurised or disadvantaged if they do so" ; "Do not use children's personal data in ways that have been shown to be detrimental to their wellbeing" | UK statutory code, services likely to be used by children |
| ico-aadc-8 [N] | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/ | "Settings must be “high privacy” by default" | UK statutory code |
| ico-aadc-13 [N] | .../13-nudge-techniques/ (same base) | "Do not use nudge techniques to lead or encourage children to provide unnecessary personal data or turn off privacy protections." | UK statutory code |
| ftc-coppa-faq | https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions | title-level only (page blocked to scripted fetch; found by search; the repo's `KIDS-CAMERA-MIC-PRIVACY.md` reads FAQ D.7, F.5, F.6) | FTC guidance |
| fr-coppa-2025 | https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule | title-level only (URL resolves; amended rule, compliance deadline 22 Apr 2026 per the repo doc) | FTC final rule |
| bipa | http://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004&ChapterID=57 | title-level only (search-verified; statute defines biometric identifier as retina or iris scan, fingerprint, voiceprint, or hand or face geometry per search summary) | Illinois statute 740 ILCS 14 |
| un-crc-gc25 | https://docs.un.org/en/CRC/C/GC/25 | title-level only (General comment No. 25, children's rights in the digital environment; URL resolves) | UN Committee on the Rights of the Child |
| title-level DOI-only | gollwitzer2006 10.1016/s0065-2601(06)38002-1; mekler2017 10.1016/j.chb.2015.08.048; hanus2015 10.1016/j.compedu.2014.08.019; bai2020 10.1016/j.edurev.2020.100322; toda2018 10.1007/978-3-319-97934-2_9; sedrakyan2020 10.1016/j.chb.2018.05.004; katz2007 10.1007/s10648-006-9027-y; vatavu2015 10.1016/j.ijhcs.2014.10.007; berney2016 10.1016/j.compedu.2016.06.005; hoepman2014 10.1007/978-3-642-55415-5_38; nielsen1994 10.1145/191666.191729 | title-level only | supplementary, not counted |

Secondary summaries read for context only (not quoted, not counted): Hanus and Fox 2015 is reported by secondary reviews to have found less intrinsic motivation, satisfaction and lower exam scores in a gamified course of 80 students; Bai 2020 is reported at g = 0.504 with no moderator difference by element type. Treat both as unconfirmed until the abstracts are read.

## Mechanisms

Verdict keys: **strong** (several converging studies or a meta-analysis), **moderate**, **mixed**, **design choice**, **standard** (a regulation or accessibility standard sets the requirement; the code is judged against it).

### A. Streaks, XP and rewards

**M1. Day streak counter.** `services/sessions.js:1604-1613` (finishing a session), `services/review-session.js:256-263` (finishing the daily review), shown at `public/js/app.js:329-343` (header pill) and `public/js/dashboard.js:345-349` (up to 7 tick marks).
- What it does: a day counts when a session or review ends on a new date; yesterday's date extends the run, any gap resets to 1. No freeze, no grace day.
- Evidence: lally2009 (one missed day "did not materially affect" habit formation, and automaticity took 18 to 254 days); kahneman1979 (losses weigh more than gains, which is the pull a streak leans on); kivetz2006 (effort rises near a reward goal); shortt2021 (Duolingo literature studies the app design, not learning outcomes); ico-aadc-5 (reward loops are allowed only if the child can disengage "without feeling pressurised").
- Verdict: **mixed**. Habit evidence favours regular practice and shows one miss is harmless; loss aversion explains why streaks pull; no study found links a streak counter to learning, and the ICO treats reward loops as a wellbeing risk for children.
- Code vs evidence: partial match. Gaps: (1) there is no forgiveness, although lally2009 says one miss does not break a habit; (2) the dates are UTC (`toISOString().slice(0,10)` at `sessions.js:1605` and `review-session.js:257`) while study sessions use the learner's own time zone (`services/study-sessions.js:today`/`zoneFor`), so an evening learner far from UTC can lose or keep a streak wrongly; (3) enforcer-only or lesson-only days do not touch the streak. See proposal P2.

**M2. Zero streak and zero XP are not shown.** `public/js/app.js:329-343`.
- What it does: the header pills render only when the value is above zero; the dashboard streak card likewise (`dashboard.js:345`).
- Evidence for the principle: kluger1996 (feedback that draws attention to the self rather than the task can lower performance); hattie2007 (feedback effects can be positive or negative); henderlong2002 (praise helps when it promotes controllable attributions and attainable standards).
- Verdict: **design choice** (no study of showing versus hiding a zero). Code matches the principle: nothing shames a new learner.

**M3. XP formula.** `services/mastery.js:675-683` (`xpForItems`): a wrong answer earns 2; a right answer earns 10 plus the item difficulty above 5; 60% of that if the coach was used. Awarded at `sessions.js:1603`, `review-session.js:245`, `enforcers.js:922`; shown in outcome cards (`session.js:1214`, `review.js:254`, `skip.js:202`) and the recent-sessions table (`dashboard.js:321-329`).
- What it does: XP is a running total with no spending, ranks or leaderboards. It is informational, not a prize.
- Evidence: sailer2020 (small positive effects overall, "less stable" for motivation and behaviour); zeng2024 (g = 0.782 on academic performance, 22 studies); deci1999 (expected tangible, engagement-, completion- and performance-contingent rewards undermined intrinsic motivation; positive feedback enhanced it); cameron1994 ("overall, reward does not decrease intrinsic motivation"; the only negative effect is expected tangible rewards given for just doing a task); lepper1973 (children given an expected reward later showed less interest); eisenberger1996 (harm occurs only "under highly restricted, easily avoidable conditions"); sailer2017 (effects depend on the specific element); hamari2014 (depends on context and user).
- Verdict: **mixed**, and deliberately so. The overjustification meta-analyses disagree (deci1999 vs cameron1994). Gamification meta-analyses are positive but heterogeneous, and the cognitive-outcome effect is the stable one. XP here is non-tangible and not expected for mere participation in the way a prize would be, which sits on the safer side of both reviews, but no study tests this exact XP design.
- Code vs evidence: partial. Two details lean toward the risk side: "+2 for a wrong answer" is effectively an engagement-contingent reward (deci1999 flags that type); and XP is shown on every page header (M4).

**M4. Always-on header stats.** `public/js/app.js:341-344`.
- What it does: streak and XP appear in the header of every signed-in page.
- Evidence: sailer2017 (elements have specific effects; badges, leaderboards and performance graphs raised competence need satisfaction); przybylski2010 (engagement is sustained by competence, autonomy and relatedness, not by points per se); ryan2000 (controlling contexts undermine motivation); ico-aadc-5 (reward loops under scrutiny for children).
- Verdict: **mixed / design choice**. Competence feedback is supported; permanence on every screen is not tested. No way for the learner to hide it (autonomy: patall2008). See proposal P5.

**M5. Coach discount on XP (60%).** `services/mastery.js:679`.
- What it does: a correct answer after using the coach earns 0.6 of the base XP, "enough to make working it out alone feel worth more, not enough to discourage asking for help" (code comment).
- Evidence: bastani2025 (unguarded help lowered later unaided grades by 17%; guardrails mitigated this); aleven2003 (learners do not use help facilities effectively); baker2008 (gaming-the-system behaviours are tied to motivations and emotions).
- Verdict: **design choice** (the 0.6 has no study). The principle, that help should not be a free substitute for trying, is supported. Gap: nothing shows the learner why the number is lower, which matters for informational (not controlling) feedback.

**M6. Segmented progress bar and counter.** `public/js/session.js:202-225`, markup at `session.js:146-162`.
- What it does: one segment per question, outlined where you are, filled when answered, in the right/wrong colour only when feedback is not being held (`session.js:214-217`); "n / N" counter.
- Evidence: kivetz2006 (effort rises as the goal nears); nunes2006 (a display that starts with progress already shown raises persistence); cheema2011 (goal visualization helps only near the goal); myers1985 (people prefer progress indicators).
- Verdict: **moderate** (consumer and HCI evidence; none from learner questions). Code matches, and the hold on verdict colours during exams and held-feedback sittings protects the assessment (design choice).

**M7. Dashboard single "next step" block.** `public/js/dashboard.js:176-212` (`leadBlock`) and `nextStep` (`dashboard.js:62-90`).
- What it does: one large primary action for the most urgent subject; other subjects in rows beneath.
- Evidence for the principle (proximal, visible goals and choice management): locke2002 (35 years of goal-setting research, abstract-level only); kivetz2006; patall2008 (choice helps, with limits).
- Verdict: **design choice**. No study of a single call to action on a learning dashboard was found.

**M8. Recent sessions table, "Due for review" list, scale per subject.** `dashboard.js:318-333`, `dashboard.js:336-344`, `rowScale` (app.js scale code at `app.js:573-611`).
- What it does: shows score, XP and time for recent sittings; the weakest due items with a mastery percentage.
- Evidence: bodily2017 (93 articles on student-facing dashboards); matcha2020 (dashboards "rarely grounded in learning theory"); sedrakyan2020 (title-level only); kluger1996 and hattie2007 (information about performance can help or harm).
- Verdict: **mixed**. Showing learners their own record is plausible but the dashboard literature itself is weak. Code matches the modest version (no ranks, no comparison with peers, which Hanus and Fox report as a risk, unconfirmed).

**M9. The learning-style quiz sets session length, formats and explanation depth.** `public/js/dashboard.js:354` (copy), `public/js/style-quiz.js:87`, `services/learner.js:276-310`.
- What it does: twenty choices become a profile; `sessionParams` turns it into item count 6-18, `preferTypeIn`, explanation depth and feedback timing.
- Evidence against matching: pashler2008 (the meshing hypothesis is the claim tested); rogowsky2015 (no relationship between preference and comprehension in adults); rogowsky2020 (same in fifth graders); willingham2015 ("scientific support for these theories is lacking"); cuevas2015 (sounder studies refute the hypothesis).
- Verdict: **mixed**. Modality matching is not supported. Using preference to set quantity (how many items) or comfort (explanation depth) is a harmless design choice, but the dashboard copy "sets ... the mix of question formats" invites the learning-styles reading. Gap: reword, and see M20 for what evidence says about formats.

### B. Study sessions, length and breaks

**M10. Start, pause and end strip.** `public/js/study.js` (whole file; `draw` at 78-136, `act` at 138-180), `services/study-sessions.js`.
- What it does: a one-line strip under the header: "Start session"; then a clock in minutes, Pause or Resume, and End; End asks "End session" or "End day session" with "Keep going" and Escape to cancel; focus moves to the first button; every action is announced (`App.announce`).
- Evidence: biwer2023 (87 students: systematic, pre-planned breaks gave mood and efficiency benefits over self-regulated ones); cepeda2006 (distributed practice, 839 assessments); szpunar2013 (structured testing within a session sustains attention); wcag-4.1.3 and wcag-2.4.7 (announcements and visible focus).
- Verdict: **design choice** for the strip itself (self-timing has no direct trial here); the underlying bounded, structured session is supported (**moderate**). Accessibility behaviour matches the standards.

**M11. Active-time accounting.** `public/js/study.js:16-17,45-48,193-206`; `services/study-sessions.js:7-21,33-37,70-76`.
- What it does: heartbeat every 30 s only while the page is visible and the learner has acted in the last 4 minutes; a gap between two signs of activity counts at most 5 minutes; a running session with 30 minutes of nothing ends at its last activity; a paused one ends after 12 hours or at the day change.
- Evidence for treating idle time as non-study: wise2005 (fast, unengaged responding is detectable from timing); wisedemars2005 (low motivation lowers performance and distorts scores); baker2008 (disengaged behaviour in tutoring systems).
- Verdict: **design choice** for the numbers (4 min, 5 min, 30 min, 12 h); principle **moderate**. Gap: the thresholds are untested on children, who may read slowly.

**M12. Session length: 6 to 18 items, stage minutes.** `services/learner.js:283,303` (`length = 6 + density*6 + pacing*6`, clamped 5-18; scorecard may scale it), `services/adaptation.js:546-575` (plan bounds), `services/skill-dose.js:63-67` (stage `session_minutes` midpoint, default 30).
- Evidence: ackerman2009 (fatigue rises with time-on-task, yet performance in longer tests did not fall); sievertsen2016 (performance falls 0.9% of an SD per hour of the school day; a 20-30 minute break recovers 1.7%); borgonovi2016 (endurance on a long low-stakes test differs across students); cepeda2006 (spacing).
- Verdict: **mixed**. Fatigue is real and breaks help at school scale; evidence that a 6-18 item session is optimal does not exist. Code is a reasoned range (**design choice**).

**M13. Break guidance: none in the code.** Searched `public/js`, `routes`, `services` for break prompts: none. The only break-like behaviour is idle auto-pause (M11) and the enforcer after End.
- Evidence that guidance would help: albulescu2022 (micro-breaks raise vigor d = .36 and cut fatigue d = .35, but the performance effect was "non-significant"); biwer2023; blasche2018; sievertsen2016.
- Verdict: **gap, not a mechanism**; evidence is **moderate for wellbeing, weak for performance**. See proposal P1.

**M14. Retention-enforcer prompt in the strip.** `study.js:62-75,108-115`: "Start a session to time your study. At the end, a short retention enforcer locks it in."
- Evidence: roediger2006, rowland2014 (retrieval beats restudy; recall tests larger than recognition), cepeda2006. These support the practice; the enforcer's design is covered in the retention section.
- Verdict: **strong** for the practice. Wording gap: "locks it in" overclaims; the evidence says retrieval improves later retention, not that anything is locked.

### C. Feedback, rationales, hints and the coach

**M15. Verdict wording.** `public/js/player.js:439-455`: "Right." or "Not quite. The answer is X.", then an optional feedback line and the rationale; correct and wrong marks are drawn plus announced (`player.js:466-480,493`).
- Evidence: pashler2005 (supplying the correct answer after an error raised final retention by 494%; feedback after correct answers made little difference); shute2008 (feedback should be "nonevaluative, supportive, timely, and specific"); hattie2007; wisniewski2020 (d = 0.48); metcalfe2017 (errorful learning with corrective feedback is beneficial).
- Verdict: **strong**. Code matches: neutral wording, no trait praise, correct answer shown after an error (M17 covers rationale).

**M16. Praise and tone.** No praise strings in `player.js` verdict; `services/ai.js:1202-1225` coach prompt says "Warm and direct, never patronizing".
- Evidence: mueller1998 (praise for intelligence worsened motivation and persistence after failure versus praise for effort); henderlong2002 (sincere, controllable-cause praise helps); kluger1996.
- Verdict: **strong** that trait praise backfires; code matches (none used).

**M17. A rationale on every item.** `public/js/player.js:445` (rationale div, inside the verdict at 439-455); `routes/learn.js:119,535` (rationale stored on the item and returned with the result); fallback text at `learn.js:966`.
- Evidence: butler2013 (explanation feedback beat correct-answer feedback on new inference questions); vanderkleij2015 (elaborated feedback effect larger than correctness-only, 0.49 against 0.05); little2012 (multiple-choice tests teach more when learners can retrieve why wrong alternatives are wrong); wisniewski2020.
- Verdict: **strong** for explanation feedback on transfer. Code matches for the display. Gap: rationale quality is generated; the evidence applies only if the explanation is correct (covered by the fact-check sections, not here).

**M18. Held versus immediate feedback.** `services/learner.js:308` (`immediateFeedback: timing < 0.55`), `public/js/session.js:80,188-191,214-217,1036-1063` (held answers shown together at the end), `routes/learn.js:92`.
- What it does: most sittings show the verdict at once; learners whose profile prefers delay (and every checkpoint or exam) see everything at the end.
- Evidence: kulik1988 (classroom studies mostly favour immediate feedback); butler2007 (delayed feedback gave better final test performance); mullet2014 (delay can promote transfer, although students prefer immediate).
- Verdict: **mixed**; sources conflict by setting (lab versus classroom, retention versus transfer). Held feedback on scored sittings is an assessment-integrity choice, not a learning claim. Gap: for practice, delay is set by learner preference (the thing mullet2014 says students get wrong), not by evidence.

**M19. Optional "How sure are you?" row.** `public/js/player.js:79-95`, enabled by `session.js:760` (`!isExam() && index % 3 === 1`), sent with the answer at `routes/learn.js:464`.
- What it does: three chips (Sure, Think so, Guessing) on every third non-exam question; optional; a second tap clears it. It feeds the scorecard calibration stat.
- Evidence: butler2008 (feedback corrects low-confidence correct answers, improving retention); metcalfe2017 (high-confidence errors are corrected more readily); stankov2012 (confidence combined with accuracy gives a bias score, the idea behind the calibration stat); dunlosky2012 (more accurate self-judgments went with better retention two days later).
- Verdict: **moderate**. Code matches (optional, spaced, not on exams). The chips are 36 px high (M28).

**M20. Multiple choice versus type-in.** `public/js/player.js:100-170` (both renderers; type-in and short answer differ only by box size), formats chosen by the item generators.
- Evidence: roediger2006 and rowland2014 (testing beats restudy; recall tests beat recognition tests); kang2007 (with feedback, short-answer quizzing gave the best result; without feedback multiple choice did better); smith2014 ("little or no advantages" of short-answer over multiple-choice); mcdermott2014 (both formats helped in grades 7-12 and format need not match the exam); little2012 (well-built multiple choice triggers real retrieval); vangog2015 (the testing effect shrinks as material gets complex).
- Verdict: **strong** that retrieval of either format beats restudy; **mixed** on type-in over multiple choice (small, feedback-dependent). Code matches: both formats exist, every answer gets feedback.

**M21. `preferTypeIn`.** `services/learner.js:286,300` (`retrieval > 0.55`, or the scorecard's `typed` flag), `services/sessions.js:81-110` (up to 10 regenerations seeking a type-in item), `services/adaptation.js:546,573`, `services/ai.js:506`.
- What it does: for learners whose style leans to recall, or who rush, the generator prefers a typed-answer item when the skill has one; otherwise it returns the multiple-choice item.
- Evidence: rowland2014 (recall over recognition); kang2007 (best with feedback); smith2014 (little advantage); mcdermott2014 (equal in classrooms); pashler2008 and rogowsky2015 (preference is not a reason to match).
- Verdict: **mixed**. The format effect is modest and conditional; choosing it from a preference quiz has no support (M9). The rush-driven trigger is a separate, defensible use (typing forces the question to be read: wise2005). Gap: the typed answer must be graded fairly or learners are punished for typos; see grading sections.

**M22. Neutral "Checking your answer..." state.** `public/js/player.js:402-436` (hold at 407, poll at 422-435).
- What it does: while the grader is unsure, shows a status (never "right" or "wrong"), lets the learner continue, and replaces it when the check ends (polls every 3 s up to 4 min).
- Evidence: nah2004 (feedback prolongs tolerable waiting time); myers1985 (progress and status indicators preferred); wcag-4.1.3 (status via role="status"); ceaparu2004 (waits and error messages are top frustrations).
- Verdict: **moderate**. Code matches (role status, announcement).

**M23. The coach: asks, never tells, before the answer.** `public/js/player.js:278-398` (panel, streamed turns), `services/ai.js:1202-1225` (system prompt: never state the answer, one question per turn, stop when the learner reaches it), `routes/learn.js:787-830` (route, `coach_used` flag, 120 per hour), prime logic `learn.js:755-776`.
- Evidence: vanlehn2011 (step-based tutoring d = 0.76, near human tutoring); kulik2016 (median +0.66 SD over 50 evaluations); kestin2025 (a pedagogically designed AI tutor beat in-class active learning); bastani2025 (unguarded GPT lowered later unaided grades by 17%; a guardrailed tutor largely removed the harm); kapur2008 (struggle before support can be productive).
- Verdict: **strong** for step-based tutoring in general; **moderate** for an LLM coach that withholds the answer (two 2025 trials, different settings). Code matches the guardrail finding. Honest limits: the prompt is a rule, not a guarantee (the route comments say so); no trial of this coach exists.

**M24. Help is withheld on scored sittings.** `routes/learn.js:749-790` (`heldItem` returns 409), `session.js:1019,1332` and `help.js:171` (`coach: false` on recall and exams).
- Evidence: aleven2003 and baker2008 (on-demand help is misused and gamed); roediger2006 (retrieval without aids is what produces the test effect); kalyuga2003 (help that suits novices can hurt more experienced learners).
- Verdict: **design choice** with supporting principle. Code matches.

**M25. "Ask about this" after the answer.** `player.js:498-530`, `routes/learn.js:948-985`.
- What it does: a text box ("What part is unclear?") that returns a direct explanation once the answer is already on screen.
- Evidence: chi1994 (self-explanation prompts improve understanding; the box asks the learner to articulate the gap first); butler2013 (explanations aid transfer); metcalfe2017.
- Verdict: **moderate**. Code matches. Gap: when no model is connected the reply is only the stored rationale (`learn.js:966`), which says so honestly.

**M26. "Report a problem."** `player.js:531-540` (uses `window.prompt` at 532), `routes/learn.js:986`.
- What it does: removes the item from service while it is checked.
- Evidence: lee2004 (trust depends on appropriate reliance, which bad items erode); glikson2020 (reliability and transparency shape trust in AI); ceaparu2004 (errors are a leading frustration).
- Verdict: **design choice**. Gap: a native `prompt()` dialog is poor for assistive tech and for small screens; an inline field would match the rest of the player (proposal list, minor).

**M27. "Too fast to count" note and re-served question.** `services/effort-monitor.js:5-31` (1.2 s on scored sittings, max 2 re-serves; slow-down note elsewhere for learners with more than 5% rapid answers), off for the owner account.
- Evidence: wise2005 (unmotivated examinees answer before reading); wisedemars2005 (low effort lowers measured performance); baker2008 (gaming behaviours).
- Verdict: **moderate**. Code matches the cited principle. Wording is non-punitive ("It is never a penalty").

**M28. Optional "Give Input" form that never gates progress.** `public/js/feedback.js:7-12,42-60`.
- Evidence: patall2008 and ryan2000 (choice and autonomy support motivation); cordova1996 (personalization and choice strategies); kluger1996 (task-focused feedback).
- Verdict: **design choice**. Code matches. Tap options and free text lower the cost of answering.

### D. Accessibility, mobile and visual design

**M29. Touch targets.** `public/css/style.css:429` (`.btn` 44 px), `:464` (`.btn-sm` 36 px), `:562-565` and `:973` (`.chip-btn`, confidence chips 36 px), `:2037-2040` (44 px on coarse pointers only inside the study strip), `:1717-1720` (kids variant: buttons 52 px, choices 64 px), tab bar 60 px (`:376`).
- Evidence: wcag-2.5.8 (24 by 24 CSS px, AA); wcag-2.5.5 (44 by 44, AAA); parhi2006 (9.2 mm, about 35 CSS px at the 96 dpi reference, sufficient for one-handed thumb discrete taps on 2006 devices).
- Verdict: **standard**. Code passes AA everywhere and the 44 px AAA target on the main buttons and primary actions. Gap: the 36 px small buttons and chips (Ask, Report, confidence chips, feedback chips) stay 36 px on phones; the CSS comment at `:2035` names WCAG 2.5.5, which is AAA, not required. Children under 7 are less precise (vatavu2015, title-level only). See P4.

**M30. Colour and contrast tokens.** `style.css:30-50` (light), `:159-199` (dark), `:68-72`.
- Measured here from the hex values: ink 17.9:1, ink-2 8.1:1, ink-3 5.35:1 on white and 4.9:1 on the well; control outline 3.4:1; dark ink-3 6.0:1 and dark control outline 3.96:1 on the dark page. The right/wrong colours (5.2 and 5.8) are quoted from the CSS comment (oklch values not recomputed).
- Evidence: wcag-1.4.3 (4.5:1 text); wcag-1.4.11 (3:1 for UI components); hall2004 (higher contrast ratios gave greater readability, 136 participants).
- Verdict: **standard**. Code matches on the measured tokens. Dark and light themes both follow the system preference (`app.js:262-292`) with a manual toggle.

**M31. Right and wrong are never colour-only.** `player.js:19-28,457-480`: tick or cross drawn on the option, a visually hidden "(your answer, correct)" note, and the words "Right." or "Not quite."
- Evidence: wcag-1.4.1 (colour not the only means), wcag-1.4.11, wcag-4.1.3.
- Verdict: **standard**. Code matches.

**M32. Reduced motion.** `style.css:1736-1746` (all animations and transitions near zero, marks drawn instantly, spinner kept), `player.js:486-488` (instant scroll when reduced motion is set), non-moving `rise` and `fade` keyframes at `:1733-1734`.
- Evidence: wcag-2.3.3 (motion from interaction can be disabled); harp1998 (interesting but irrelevant additions reduced main-idea recall); berney2016 (title-level only: animation meta-analysis); noetel2022 (design principles with positive effects include coherence).
- Verdict: **standard** plus **design choice** (no study of reduced-motion CSS on learning). Code matches. The spinner deliberately keeps a slow spin so loading stays visible.

**M33. Announcements, toasts and focus.** `app.js:52-80` (toast host `role="status"`, error toasts `role="alert"`; a single polite live region), `player.js:493-495` (focus to Next, or the verdict heading), `study.js:162` (focus to the first End button).
- Evidence: wcag-4.1.3, wcag-2.4.7, wcag-2.2.1 (time limits).
- Verdict: **standard**. Code matches 4.1.3 and 2.4.7. Possible gap: toasts disappear after 3.2 s (info) or 5.2 s (error) (`app.js:62`); an error that vanishes can be missed by sighted learners, and WCAG 2.2.1 asks that time limits set by content be adjustable. Whether auto-dismissal counts under 2.2.1 is arguable, so this is flagged, not failed.

**M34. Skip link and focus ring.** `style.css:250-253,300-306`.
- Evidence: wcag-2.4.1, wcag-2.4.7, wcag-1.4.11.
- Verdict: **standard**. Code matches (2 px ink ring, offset 2 px).

**M35. Mobile layout: bottom tab bar, fixed Next bar, safe areas.** `style.css:374-420` (tab bar from 760 px, `env(safe-area-inset-bottom)`, scroll padding), `:951-966` (fixed Next bar in the player), `:480-483` (answer row stacks at 480 px), `player.js:486-488` (verdict scrolls into view).
- Evidence: sung2016 (mobile-device learning, moderate effect size 0.523, 110 studies); parhi2006 (thumb reach and target size); wcag-1.4.10 (reflow without two-dimensional scrolling at 320 CSS px).
- Verdict: **moderate** for mobile learning generally; the specific layout is **design choice**. Not verified here: the 320 px reflow behaviour was not tested in a browser in this pass.

**M36. Kids audience variant.** `app.js:263-300`, `style.css:1709-1721` (larger type, Andika font, 52 px buttons, 64 px choices, larger marks), applied from the consent route (`routes/consent.js:340-341`).
- Evidence: parhi2006; wcag-2.5.5; hughes2000 (children aged 5 to 7 read larger type faster; children aged 8 to 11 were neither helped nor slowed); vatavu2015 (title-level only: children aged 3 to 6 and touch). The type-size evidence is from children; the button and choice sizes still rest on adult touch data and the AAA minimum.
- Verdict: **design choice**. Larger type has direct evidence for children aged 5 to 7; the 52 and 64 px targets are not tested on children.

### E. Calendar, reminders, errors and empty states

**M37. Retention calendar.** `public/js/calendar.js` (month grid as a real table, Monday first, one full sentence per day for screen readers, legend, "Coming up" list).
- Evidence: cepeda2006 (spacing intervals matter); lally2009 (consistent context builds automaticity); milkman2011 (planning a specific date and time raised follow-through).
- Verdict: **moderate** for visible scheduled practice; the table semantics follow standard patterns. Gap: it is read-only, it asks the learner to plan nothing. See P3.

**M38. Reminders: none exist.** Search found no push, no learner email or SMS (`utils/mailer` is used only by `routes/consent.js`, `routes/ops.js`, `services/error-log.js`).
- Evidence that reminders help: milkman2011 (date-and-time implementation-intention prompt, +4.2 points); castleman2015 (personalized text reminders raised enrollment for students with less access to guidance); gollwitzer2006 (title-level only, existing meta-analysis). Evidence of harm: kushlev2016 (alerts raised inattention and hyperactivity symptoms, 221 adults); ico-aadc-13 (no nudges toward weaker privacy).
- Verdict: **gap**; evidence **moderate** for benefit, with a real cost. Under-13s cannot be contacted directly (COPPA); a reminder would go to the parent account. See P3.

**M39. Error states.** Toasts (`app.js:52`), inline notices with the server message (`calendar.js:143`, `player.js` ask and report), the honest degrade when the model is down (`learn.js:966`, coach fallback `learn.js:818-830`), session errors (`study.js:177`).
- Evidence: ceaparu2004 (error messages are among the most cited frustrations); wcag-3.3.1 (identify the error in text); wcag-3.3.3 (suggest a fix).
- Verdict: **standard / moderate**. Code matches 3.3.1 where messages are shown; suggestions for a fix are inconsistent (some messages say only "That did not work.", `study.js:177`).

**M40. Empty states.** `dashboard.js:41` (empty-state block with a route to add a subject), `enforcer.js:270` ("Nothing to lock in..." / "Too short for an enforcer..."), `study.js:170-172` (the toast saying why no enforcer follows), `style.css:1468-1471`.
- Evidence: ceaparu2004; wcag-3.3.1; wcag-3.3.3; nielsen1994 (title-level only).
- Verdict: **design choice**. Code matches: each empty state names the reason and the next action.

### F. Owner skips

**M41. Owner-only skips.** `config/capabilities.js:21` (`canSkip` is the owner account only), `services/owner-skips.js:2-12,40` (skip placement, skip a grade, stand on any level; gates not held), `effort-monitor.js:38-43` (owner exempt), `GET can_skip` only decides which buttons are drawn; routes re-check.
- Evidence: karich2014 (learner control in educational technology had "almost zero" overall effect, g = 0.05); patall2008 (choice helps motivation, within limits); kalyuga2003 (support that helps novices can hurt experts, a reason placement and gates exist); katz2007 (title-level only).
- Verdict: **design choice (product only)**. The evidence says unrestricted learner control is not reliably beneficial, which supports keeping it out of the learner build. Skips are for the owner to inspect the product. Not a learning mechanism, so no learner effect is claimed.

### G. Privacy, consent and minors

**M42. Neutral age screen.** `public/js/age-screen.js:1-46`, `routes/consent.js:82-83`, first answer held for the browser session (`consent.js` header lines 12-14).
- What it does: month, year of birth and country, no defaults, no hint of which answer passes; the first answer in a session counts.
- Evidence: coppa-312.5a1 (verifiable parental consent before collection from children); gdpr-art8 (16 by default, lower by member state, not below 13); ico-aadc-8 / UK code (age-appropriate application); reyes2018 (a majority of 5,855 children's apps were potentially non-compliant, mainly through third-party SDKs). The FTC FAQ D.7 neutrality guidance is read through the repo's `KIDS-CAMERA-MIC-PRIVACY.md` (the FAQ URL itself is title-level here).
- Verdict: **standard**. Code matches the design in the repo doc. Not legal advice; the repo doc says a lawyer must confirm.

**M43. Country age-of-consent table.** `consent.js:82-83`: US 13, GB 13, DK 13, SE 13, ES 14, IT 14, FR 15, DE 16, NL 16, default 16.
- Evidence: gdpr-art8 (the 13-16 range is member-state law); coppa-312.5a1; ico-iss-consent (UK: 13 and over may consent); es-lopdgdd-art7 (Spain: "mayor de catorce años", the 14 in the table).
- Verdict: **standard**. GB 13 and ES 14 now match official texts; US 13 is the COPPA under-13 rule, and the 16 default is the GDPR Article 8 age. Gap: DK 13, SE 13, IT 14, FR 15, DE 16 and NL 16 were not re-checked against national law; treat them as a lawyer item.

**M44. Email-plus parental consent with delayed confirmation.** `routes/consent.js:20-26,776`.
- Evidence: coppa-312.5-email (a confirmatory email to the parent after consent is an additional step in this method); coppa-312.5a1; reyes2018; zhao2019 and kumar2017 (young children have gaps in privacy knowledge and rely on parents, which is why the parent is the consenter).
- Verdict: **standard**. Email plus is permitted only when data is not disclosed externally; the code ties the outside-AI opt-ins to a signed form instead (consent.js header). The tester phase currently grants under-age testers full access (known caveat in the owner's notes; privacy fix needed before investors).

**M45. Camera and microphone off for unconsented child accounts.** `middleware/security.js:78` (default `camera=(self), microphone=(self)`), `routes/consent.js:560-567` (`Permissions-Policy: camera=(), microphone=()` unless `camera_mic` is allowed), `public/js/say-aloud.js:116` fallback text.
- Evidence: ico-aadc-8 ("high privacy" by default); coppa-312.2 (an image or voice file is personal information); conijn2022 (camera proctoring raised test anxiety, 1,760 students); andrejevic2019 (camera sensing in schools raises concerns); bipa (title-level only, Illinois biometric statute).
- Verdict: **standard** plus **design choice**. Code matches. Every camera or mic block has a tap fallback.

**M46. On-device only camera and mic.** `public/engine/basketball/camera-blocks.js:96-97,116` (`audio: false`, `stream.getTracks().forEach(tr => tr.stop())`), `public/engine/piano/piano-io.js:92,152-157`, `public/js/say-aloud.js:13`.
- Evidence: gdpr-art5-1c (data minimisation); coppa-312.2 and the repo doc's reading of FTC FAQ F.5 (on-device processing is not collection, an FAQ interpretation not a court holding); hoepman2014 (title-level only: privacy design strategies); acquisti2015 (notice and consent alone are weak because people are uncertain about consequences, so minimising data beats relying on consent).
- Verdict: **standard / design choice**. Code matches the contract: video and audio are not uploaded; the camera captures video only; tracks are stopped. Limit: nothing in this pass proves no frame or clip is sent anywhere (third-party SDK risk is the exact failure reyes2018 found); a network audit is the missing check.

**M47. Retention timers.** `routes/consent.js:66-68` (pending 14 days, revoked 30 days, parent deletion immediate; a consent stub keeps dates, method, notice version and an email hash).
- Evidence: coppa-312.10 (keep only as long as reasonably necessary); gdpr-art5-1c; slade2013 (consent and use of learner data raise ethical issues).
- Verdict: **standard**. Code matches. The day counts are design choices.

**M48. Parent review, download, revoke and delete.** `consent.js:827-937` (`/parent/children/:id/data`, `settings`, `opt-ins`, `revoke`, `delete`), `public/js/parent.js`.
- Evidence: coppa-312.6 (parent's right to review); gdpr-art7-1 (controller must be able to demonstrate consent; withdrawal handled); pardo2014 (trust, accountability and transparency in learner data).
- Verdict: **standard**. Code matches.

**M49. Pinned notice version.** `consent.js:60-64`, `public/js/parent-consent.js:44-47` (an answer to a notice whose text changed is refused).
- Evidence: gdpr-art7-1 (demonstrable consent to the words shown); coppa-312.5a1 (consent to the practices in the notice); drachsler2016 (existing entry: trusted learning-analytics checklist, title-level).
- Verdict: **standard**. Code matches.

**M50. Trust cues: AI disclosure and coach limits.** `session.js:1223,1303` ("Analyzed by the AI tutor (provider)"), `player.js:282` ("The coach asks questions, it will not give you the answer"), `player.js:407-415` (honest "Checking").
- Evidence: lee2004 (trust must match reliability); glikson2020 (transparency and reliability shape trust in AI); hoff2015 (trust drives willingness to rely).
- Verdict: **moderate**. Code matches: states what the AI does and does not do.

## Verdict tally

| Verdict | Mechanisms |
| --- | --- |
| strong | M15, M16, M17, M14 (practice), M20 (retrieval), M23 (general tutoring) = 6 |
| moderate | M6, M19, M22, M25, M27, M35, M37, M50 = 8 |
| mixed | M1, M3, M4, M8, M9, M12, M18, M21 = 8 |
| design choice | M2, M5, M7, M10, M11, M24, M26, M28, M36, M40, M41 = 11 |
| standard (regulation or accessibility standard) | M29, M30, M31, M32, M33, M34, M39, M42, M43, M44, M45, M46, M47, M48, M49 = 15 |
| gap (no mechanism built) | M13 (breaks), M38 (reminders) = 2 |

Each mechanism lists at least three sources, counting standards, regulations and reused entries. Exceptions: M36 (kids variant) had only two quoted sources until hughes2000 was added in the fix-up pass (vatavu2015 stays title-level); M7 and M8 lean on abstract-level support (locke2002) or the weak dashboard literature. These are flagged in-line.

## Code-versus-evidence gaps found

1. Streak uses UTC dates, not the learner's local day, and has no grace day (M1).
2. Dashboard copy implies learning-style tailoring of formats (M9); `preferTypeIn` is set by a preference quiz (M21).
3. Practice feedback timing follows preference, not evidence (M18).
4. No break guidance and no reminders (M13, M38).
5. Small buttons and chips are 36 px on phones; the 44 px coarse-pointer rule covers only the study strip (M29).
6. Error toasts auto-dismiss in 5.2 s (M33); some errors give no recovery hint (M39).
7. The Report button uses `window.prompt` (M26).
8. Tester-phase access for under-age testers sits outside the consent design (M44); the claim "nothing is uploaded" needs a network audit (M46).

## Proposals (status after the implementation phase is in each heading; also built: error toasts that stay until dismissed, flag UX_TOAST_STAY, and the Report dialog in place of window.prompt, flag UX_REPORT_DIALOG)

**P1. Optional break nudge in the study strip. BUILT (flag BREAK_NUDGE, minutes BREAK_NUDGE_MIN; off for the owner; learners can turn it off on the profile page).** After about 25 active minutes without a pause (or 50 for older stages), show a dismissible line: "A short break helps. Pause now?" with Pause as one tap; never block, never touch the streak or XP.
- Sources: albulescu2022 (vigor and fatigue effects d = .36 and .35, performance effect non-significant); biwer2023 (systematic breaks gave mood and efficiency benefits); sievertsen2016 (20-30 minute break recovered 1.7% of an SD); blasche2018 (a break raised vigor).
- Expected effect: small gain in wellbeing; do not promise a score gain (albulescu2022).
- Risk: nudges for children (ico-aadc-13, ico-aadc-5); alerts cost attention (kushlev2016). Keep it inline, silent, once per stretch, off by a profile setting.
- Files: `public/js/study.js` (`draw`, state), `public/css/style.css` (section 30), `services/study-sessions.js` (`view` could add `stretch_ms` since last pause), a profile setting in `routes/profile.js` and `public/js/profile.js`.

**P2. Streak on the learner's local day, with one grace day per week. BUILT (flag STREAK_LOCAL_GRACE; services/streak.js; the owner keeps the old rule). Not built: counting a study session or review that is not a finished sitting (needs services/study-sessions.js).** Use `zoneFor` from `services/study-sessions.js` in the streak code; allow one missed day without reset; count a qualifying study session or review, not only a finished adaptive session.
- Sources: lally2009 (one miss did not materially affect habit formation); kahneman1979 (loss weighs more than gain); ico-aadc-5 (must be easy to disengage without feeling pressured); kivetz2006.
- Expected effect: fewer abandonments after one missed day; streak numbers that match the learner's calendar.
- Risk: less loss-aversion pull, so possibly lower daily-return rate; this is the trade the ICO text favours for children.
- Files: `services/sessions.js:1604-1613`, `services/review-session.js:256-263`, `services/study-sessions.js` (export a day helper), `public/js/app.js:329-343`, `public/js/dashboard.js:345-349`.

**P3. "When will you study next?" planner, with reminders only through the parent account for children. PARTLY BUILT (flag UX_NEXT_STUDY_PLANNER): the in-app planner on the dashboard, which sends nothing at any age. DEFERRED: emailed or texted reminders and the parent digest (mailer, consent opt-ins, COPPA review).** At End session, offer a date-and-time choice written to the calendar; for adult accounts offer an opt-in email reminder; for under-13s send nothing to the child, and offer the parent an opt-in digest.
- Sources: milkman2011 (+4.2 points with a date-and-time prompt); castleman2015 (text reminders raised enrollment for less-supported students); lally2009 (consistent context); gollwitzer2006 (title-level, meta-analysis); coppa-312.5a1 (consent for any collection or contact).
- Expected effect: moderate for return rate; unknown for learning.
- Risk: attention cost of alerts (kushlev2016); COPPA and ICO nudge standards; email deliverability.
- Files: `public/js/enforcer.js` (end screen), `public/js/calendar.js`, `routes/retention.js`, `services/enforcers.js`, `utils/mailer.js`, `routes/consent.js` (parent opt-ins), `public/js/parent.js`.

**P4. 44 px targets on every coarse pointer. BUILT (flag UX_TOUCH44).** Extend the rule at `style.css:2037` to `.btn-sm`, `.chip-btn`, `.confidence-row .chip-btn`, `.verdict-actions .btn-sm`, `.back-link`, `.btn-text`.
- Sources: wcag-2.5.8, wcag-2.5.5, parhi2006 (about 9.2 mm is enough for one thumb; 44 px is margin), vatavu2015 (title-level, children).
- Expected effect: fewer mis-taps on phones; no learning effect claimed.
- Risk: layout reflow in the player action row; check at 320 px (wcag-1.4.10).
- Files: `public/css/style.css` (lines 464, 562, 973, 2037), kids block at 1709.

**P5. Let learners (or parents) hide XP and streak. BUILT (flag UX_HIDE_STATS).** A profile switch "Show my streak and XP".
- Sources: patall2008 (choice raises motivation and effort); ryan2000 (autonomy as a basic need); deci1999 (expected rewards undermined intrinsic motivation); sailer2017 (element-specific effects); ico-aadc-5.
- Expected effect: protects intrinsic motivation for learners harmed by tracking; neutral for others.
- Risk: lower engagement in learners who like the numbers.
- Files: `public/js/app.js:329-344`, `public/js/profile.js`, `routes/profile.js`, user record field, `public/js/dashboard.js:345`, outcome cards (`session.js:1214-1215`, `review.js:254-255`).

**P6. Make the Retention-check and preference copy honest and ground the format default in retrieval, not style. COPY BUILT (flag UX_STYLE_COPY: dashboard, placement page, quiz intro). DEFERRED: making type-in the default independent of the quiz (services/learner.js, services/sessions.js belong to another implementer).** Reword `dashboard.js:354` and `style-quiz.js:87`; make type-in the default where the skill has a reliable grader and feedback follows, independent of the quiz.
- Sources: rowland2014 (recall over recognition); kang2007 (best with feedback); mcdermott2014 (grades 7-12); pashler2008, rogowsky2015, rogowsky2020, willingham2015, cuevas2015 (preference matching unsupported). Counter-evidence: smith2014 found little advantage over multiple choice.
- Expected effect: small; mostly removes an unsupported claim.
- Risk: typing friction on phones, grading false negatives, accessibility for learners who cannot type easily.
- Files: `services/learner.js:286`, `services/sessions.js:81-110`, `public/js/dashboard.js:354`, `public/js/style-quiz.js:87`, `public/js/profile.js:153`.

**P7. A graded hint ladder with a try-first step before the coach opens. DEFERRED: needs routes/learn.js, services/ai.js and services/mastery.js (the XP-with-help line), which implementer D does not own.** One free attempt or 20 seconds, then a nudge, then the coach, with a visible "why XP is lower with help" line.
- Sources: kapur2008 (struggle before support); aleven2003 (help is under- and mis-used); aleven2016 (feedback on help seeking changed behaviour, not outcomes); bastani2025 (guardrails matter); kalyuga2003 (fade help for more expert learners).
- Expected effect: moderate for transfer; honest caveat from aleven2016 that outcomes may not move.
- Risk: frustration for younger or low-prior-knowledge learners (kalyuga2003 cuts both ways).
- Files: `public/js/player.js:278-398`, `routes/learn.js:787-830`, `services/ai.js:1202`, `services/mastery.js:679`.

## What was not done

- No code changed. No browser test of the 320 px reflow, the dark-theme ratios in use, or screen reader output; contrast was computed from hex tokens only.
- Country consent ages, BIPA coverage of pose and pitch data, and the COPPA 2025 amendments were taken from `KIDS-CAMERA-MIC-PRIVACY.md` and not re-derived; they are for a lawyer.
- The FTC COPPA FAQ, the Federal Register notice, BIPA and UN General comment 25 are cited by official URL without a quotable passage.
