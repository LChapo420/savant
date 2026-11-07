# Every scorecard measure: where the error is (SIMULATED; see docs/SCORECARD-REAL.md)

SIMULATED, 80 held-out learners, day 30, daily check on. Guess 81.2, card 84.4 (removed 17%), read-out with log features 86.2 (removed 27%); worst 1/5/10% 81.9 / 82.4 / 82.7. Planner's own posterior before the card's combining rules: 83.9.

Research ceiling for the whole card at a month, this mix of learners: low 84.4 (17% removed), central 86.7 (29%), high 88.9 (41%).

By how a trait can be read:

| class | measures | guess | card | read-out | removed | ceiling (research) | ceiling removed | misread | thin |
|---|---|---|---|---|---|---|---|---|---|
| performance | 10 | 80.7 | 85.5 | 89.3 | 45% | 90.8 | 53% | 6 | 0 |
| benefit | 12 | 82.5 | 83.9 | 84.7 | 13% | 83.8 | 8% | 1 | 1 |
| reasoning | 12 | 81.0 | 83.3 | 84.8 | 20% | 86.1 | 27% | 6 | 0 |
| contrast | 11 | 81.6 | 85.3 | 87.0 | 29% | 85.1 | 19% | 3 | 1 |
| preference | 12 | 80.6 | 82.3 | 82.6 | 11% | 85.8 | 27% | 0 | 1 |
| habit | 15 | 80.9 | 85.4 | 89.5 | 45% | 88.0 | 37% | 9 | 0 |
| scale | 16 | 81.0 | 85.8 | 86.3 | 28% | 88.1 | 37% | 0 | 0 |
| memory | 7 | 79.9 | 83.3 | 85.9 | 30% | 85.7 | 29% | 4 | 0 |
| hidden | 5 | 83.0 | 83.6 | 83.6 | 3% | 84.8 | 11% | 1 | 1 |

By scorecard category:

| category | guess | card | read-out | removed | ceiling | misread | thin |
|---|---|---|---|---|---|---|---|
| intake | 80.6 | 84.8 | 86.8 | 32% | 87.2 | 2 | 1 |
| reasoning | 81.2 | 83.3 | 84.5 | 17% | 86.2 | 4 | 0 |
| pacing | 80.7 | 82.4 | 85.5 | 25% | 85.5 | 3 | 1 |
| engagement | 81.2 | 84.4 | 84.8 | 19% | 86.1 | 1 | 0 |
| memory | 81.3 | 83.6 | 84.9 | 19% | 85.6 | 3 | 0 |
| resilience | 81.3 | 86.8 | 89.1 | 42% | 87.5 | 4 | 0 |
| metacognition | 81.8 | 86.0 | 87.7 | 33% | 88.2 | 1 | 0 |
| representation | 82.4 | 84.5 | 86.9 | 25% | 87.4 | 5 | 0 |
| motivation | 80.7 | 84.5 | 85.2 | 23% | 86.7 | 1 | 2 |
| transfer | 80.7 | 84.1 | 86.5 | 30% | 86.1 | 6 | 0 |

By kind of learner (ceiling = research central):

| kind | n | guess | card | read-out | removed | measures >20 pts off | ceiling | correlation 95 would need |
|---|---|---|---|---|---|---|---|---|
| random | 15 | 76.1 | 80.8 | 83.1 | 30% | 37% | 83.0 | 0.98 |
| tail_both | 6 | 81.3 | 84.4 | 86.3 | 26% | 25% | 86.6 | 0.96 |
| age_old | 8 | 81.8 | 84.6 | 86.3 | 25% | 25% | 87.1 | 0.96 |
| contradict | 15 | 81.4 | 85.0 | 86.6 | 28% | 24% | 86.9 | 0.96 |
| tail_hi | 8 | 82.7 | 84.9 | 86.8 | 24% | 22% | 87.8 | 0.96 |
| tail_lo | 7 | 83.0 | 85.0 | 86.9 | 23% | 21% | 87.9 | 0.96 |
| age_young | 7 | 81.9 | 84.8 | 86.9 | 28% | 23% | 87.2 | 0.96 |
| ell | 7 | 82.7 | 86.0 | 87.1 | 25% | 22% | 87.8 | 0.96 |
| ordinary | 7 | 85.0 | 87.8 | 88.8 | 25% | 16% | 89.3 | 0.94 |

Every measure, weakest first. guess, S0 (card), Sf (read-out with log features), behaviour (Sf with no daily check), harsher world (Sf when the generator differs, research world) are accuracy in points. bias, slope, no signal: shares of the squared error of the card. ceiling: research low to high at a month. * means the simulated read beats even the high ceiling, so the simulation flatters that measure. correlation for 95: what 95 would need; no measure reaches it even at its high ceiling unless marked yes.

| measure | class | guess | S0 | Sf | behaviour | harsher world | r(Sf) | removed Sf | bias | slope | no signal | diagnosis | ceiling | correlation for 95 | 95 possible? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| momentum_dependence | contrast | 81.3 | 81.6 | 80.6 | 82.9 | 80.9 | 0.43 | -4% | 4% | 17% | 79% | read | 82.8-87.0 | 0.96 | no |
| cognitive_flexibility | reasoning | 81.5 | 80.8 | 80.8 | 78.4 | 80.0 | 0.22 | -4% | 10% | 5% | 85% | misread | 84.5-88.9 | 0.96 | no |
| integration_tendency | hidden | 83.5 | 83.0 | 83.0 | 83.1 | 84.5 | 0.24 | -3% | 0% | 6% | 94% | misread | 84.0-86.8 | 0.95 | no |
| strategy_awareness | hidden | 84.0 | 84.4 | 83.6 | 84.3 | 83.7 | 0.35 | -3% | 0% | 0% | 100% | read | 84.5-87.2 | 0.95 | no |
| interference_susceptibility | memory | 80.2 | 79.7 | 80.2 | 80.3 | 79.3 | 0.26 | 0% | 6% | 1% | 93% | misread | 83.4-88.6 | 0.97 | no |
| reentry_cost | contrast | 81.3 | 81.9 | 81.9 | 81.3 | 81.4 | 0.24 | 3% | 0% | 0% | 99% | thin | 82.8-87.0 | 0.96 | no |
| identity_alignment | hidden | 81.7 | 82.4 | 82.5 | 81.9 | 80.4 | 0.35 | 4% | 0% | 2% | 98% | read | 82.3-85.3 | 0.96 | no |
| example_density_need | benefit | 82.8 | 82.8 | 83.6 | 82.9 | 84.3 | 0.27 | 4% | 1% | 6% | 92% | thin | 83.2-85.7 | 0.96 | no |
| mastery_orientation | scale | 81.3 | 82.4 | 82.1 | 81.3 | 81.1 | 0.37 | 4% | 0% | 0% | 100% | read | 85.0-90.2 | 0.96 | no |
| emotional_engagement | hidden | 82.9 | 83.4 | 83.7 | 82.9 | 82.5 | 0.28 | 5% | 2% | 0% | 98% | thin | 83.5-86.3 | 0.96 | no |
| humor_receptivity | preference | 81.5 | 82.3 | 82.6 | 81.5 | 80.7 | 0.35 | 6% | 0% | 2% | 98% | read | 84.0-88.9 | 0.96 | no |
| cycle_architecture | benefit | 79.0 | 80.4 | 80.2 | 79.1 | 79.6 | 0.39 | 6% | 0% | 1% | 99% | read | 79.5-82.5 | 0.97 | no |
| relevance_demand | preference | 82.0 | 83.0 | 83.2 | 82.1 | 81.9 | 0.37 | 7% | 0% | 1% | 99% | read | 84.4-89.2 | 0.96 | no |
| feedback_tone_sensitivity | preference | 80.2 | 81.0 | 81.6 | 80.4 | 80.5 | 0.38 | 7% | 8% | 3% | 89% | read | 82.9-88.1 | 0.97 | no |
| social_framing | preference | 78.7 | 79.8 | 80.2 | 78.8 | 79.4 | 0.29 | 7% | 2% | 1% | 97% | thin | 81.5-87.2 | 0.97 | no |
| interleaving_tolerance | contrast | 80.5 | 81.8 | 81.9 | 78.3 | 80.8 | 0.42 | 7% | 1% | 4% | 95% | read | 82.1-86.5 | 0.97 | no |
| jargon_absorption | performance | 81.2 | 82.7 | 82.7 | 81.2 | 81.2 | 0.34 | 8% | 0% | 1% | 99% | read | 88.7-93.1 | 0.96 | no |
| depth_breadth | preference | 80.4 | 82.0 | 82.0 | 80.8 | 80.4 | 0.37 | 8% | 0% | 0% | 100% | read | 83.0-88.3 | 0.97 | no |
| spatial_anchoring | benefit | 83.2 | 84.1 | 84.5 | 84.5 | 83.3 | 0.41 | 8% | 6% | 2% | 92% | read | 83.5-85.9 | 0.95 | no |
| productive_struggle | scale | 80.9 | 82.8 | 82.5 | 80.9 | 78.4 | 0.42 | 8% | 0% | 0% | 100% | read | 84.7-89.9 | 0.97 | no |
| application_orientation | preference | 81.3 | 82.9 | 82.9 | 82.8 | 81.1 | 0.39 | 8% | 1% | 0% | 99% | read | 83.8-88.8 | 0.96 | no |
| deductive_trajectory | reasoning | 81.7 | 83.2 | 83.3 | 81.6 | 82.1 | 0.40 | 9% | 2% | 1% | 97% | read | 84.7-89.0 | 0.96 | no |
| dialogic_preference | habit | 81.1 | 82.9 | 82.9 | 81.0 | 81.8 | 0.38 | 9% | 0% | 2% | 98% | read | 85.7-91.0 | 0.96 | no |
| worked_example_dependence | benefit | 82.8 | 84.5 | 84.5 | 83.0 | 83.7 | 0.49 | 10% | 9% | 5% | 87% | read | 83.2-85.7 | 0.96 | no |
| tone_formality | preference | 81.6 | 83.0 | 83.4 | 81.6 | 81.4 | 0.50 | 10% | 1% | 6% | 92% | read | 84.1-89.0 | 0.96 | no |
| session_rhythm | habit | 80.6 | 77.2 | 82.6 | 80.5 | 82.2 | 0.43 | 10% | 20% | 2% | 78% | misread | 85.3-90.8 | 0.97 | no |
| warmup_latency | contrast | 83.3 | 83.6 | 85.0 | 84.6 | 83.9 | 0.36 | 10% | 4% | 21% | 75% | read | 84.7-88.4 | 0.95 | no |
| stimulus_envelope | preference | 80.9 | 82.7 | 82.9 | 80.9 | 81.4 | 0.44 | 10% | 0% | 5% | 95% | read | 83.5-88.6 | 0.96 | no |
| interest_transfer | benefit | 81.9 | 83.8 | 83.8 | 61.9 | 82.5 | 0.44 | 10% | 0% | 0% | 100% | read | 82.3-84.9 | 0.96 | no |
| chunk_granularity | benefit | 82.6 | 84.5 | 84.5 | 83.6 | 83.7 | 0.48 | 11% | 2% | 1% | 97% | read | 82.9-85.5 | 0.96 | no |
| mnemonic_receptivity | benefit | 81.3 | 82.9 | 83.4 | 81.3 | 81.9 | 0.38 | 11% | 1% | 2% | 97% | read | 81.7-84.4 | 0.96 | no |
| inductive_trajectory | reasoning | 81.7 | 83.7 | 83.7 | 82.3 | 82.7 | 0.42 | 11% | 0% | 1% | 99% | read | 84.7-89.0 | 0.96 | no |
| notation_comfort | performance | 81.3 | 82.2 | 83.4 | 84.2 | 84.0 | 0.70 | 11% | 0% | 43% | 57% | misread | 88.8-93.1 | 0.96 | no |
| enactive_encoding | benefit | 82.6 | 84.7 | 84.7 | 82.1 | 82.4 | 0.42 | 12% | 3% | 3% | 94% | read | 83.0-85.5 | 0.96 | no |
| conceptual_bias | hidden | 83.0 | 85.0 | 85.0 | 83.1 | 83.2 | 0.42 | 12% | 0% | 1% | 99% | read | 83.5-86.4 | 0.96 | no |
| text_density_tolerance | contrast | 80.3 | 81.6 | 82.7 | 81.0 | 81.9 | 0.42 | 12% | 3% | 1% | 97% | read | 81.9-86.3 | 0.97 | no |
| retention_index | memory | 79.9 | 82.5 | 82.7 | 83.1 | 81.8 | 0.49 | 14% | 1% | 8% | 91% | read | 83.2-88.5 | 0.97 | no |
| retrieval_strength | memory | 79.9 | 82.5 | 82.7 | 83.1 | 81.8 | 0.49 | 14% | 1% | 8% | 90% | read | 83.2-88.5 | 0.97 | no |
| decay_rate | memory | 79.9 | 82.5 | 82.7 | 83.1 | 81.8 | 0.49 | 14% | 1% | 9% | 90% | read | 83.2-88.5 | 0.97 | no |
| narrative_pull | preference | 80.0 | 82.9 | 82.9 | 80.1 | 81.5 | 0.58 | 14% | 1% | 10% | 89% | read | 82.7-88.0 | 0.97 | no |
| global_framing_need | preference | 77.8 | 81.0 | 81.0 | 77.4 | 79.4 | 0.47 | 14% | 0% | 0% | 100% | read | 80.8-86.7 | 0.97 | no |
| analogical_transfer | reasoning | 79.8 | 82.8 | 82.8 | 79.7 | 81.6 | 0.54 | 15% | 0% | 1% | 98% | read | 83.1-87.9 | 0.97 | no |
| logical_rigor | reasoning | 83.7 | 84.0 | 86.3 | 88.7 | 84.1 | 0.62 | 16% | 5% | 27% | 68% | read | 86.4-90.2 | 0.95 | no |
| feedback_granularity | preference | 80.9 | 84.0 | 84.0 | 83.3 | 81.9 | 0.48 | 16% | 2% | 9% | 89% | read | 83.5-88.5 | 0.97 | no |
| step_explicitness | benefit | 84.4 | 83.2 | 87.0* | 83.0 | 85.6 | 0.57 | 17% | 24% | 2% | 73% | misread | 84.7-87.0 | 0.95 | no |
| question_generation | habit | 83.0 | 85.9 | 85.9 | 83.0 | 84.1 | 0.57 | 17% | 2% | 2% | 96% | read | 87.1-91.9 | 0.96 | no |
| pattern_detection | reasoning | 83.1 | 84.4 | 86.0 | 84.5 | 85.0 | 0.74 | 17% | 4% | 42% | 54% | misread | 85.9-89.8 | 0.96 | no |
| curiosity_hook | scale | 79.7 | 83.0 | 83.4 | 79.7 | 80.7 | 0.57 | 18% | 0% | 3% | 97% | read | 83.8-89.3 | 0.97 | no |
| gamification_response | preference | 81.5 | 83.7 | 84.9 | 81.5 | 82.8 | 0.55 | 18% | 2% | 9% | 89% | read | 84.0-88.9 | 0.96 | no |
| elaboration_benefit | benefit | 81.6 | 84.9 | 85.3* | 83.3 | 82.3 | 0.65 | 20% | 1% | 9% | 90% | read | 81.9-84.6 | 0.96 | no |
| praise_sensitivity | scale | 80.3 | 84.1 | 84.3 | 80.9 | 80.6 | 0.63 | 20% | 1% | 16% | 84% | read | 84.2-89.6 | 0.97 | no |
| near_transfer | reasoning | 78.3 | 80.1 | 83.2 | 81.4 | 80.2 | 0.70 | 22% | 0% | 34% | 66% | misread | 81.9-87.0 | 0.97 | no |
| novelty_hunger | scale | 82.6 | 85.9 | 86.5 | 82.3 | 80.7 | 0.63 | 22% | 1% | 6% | 93% | read | 86.1-90.8 | 0.96 | no |
| extrinsic_reward_sensitivity | scale | 82.7 | 86.2 | 86.6 | 82.6 | 83.6 | 0.58 | 23% | 0% | 5% | 95% | read | 86.2-90.9 | 0.96 | no |
| creative_extension | scale | 80.6 | 84.5 | 85.0 | 80.7 | 79.3 | 0.65 | 23% | 4% | 3% | 93% | read | 84.5-89.8 | 0.97 | no |
| evaluation_anxiety | scale | 83.2 | 87.5 | 87.0 | 83.3 | 82.8 | 0.69 | 23% | 0% | 2% | 98% | read | 86.6-91.2 | 0.95 | no |
| far_transfer | reasoning | 80.3 | 82.1 | 84.9 | 82.7 | 81.3 | 0.69 | 23% | 2% | 34% | 64% | misread | 83.6-88.2 | 0.97 | no |
| confidence_calibration | performance | 82.3 | 85.0 | 86.5 | 87.8 | 88.8 | 0.86 | 23% | 23% | 1% | 76% | read | 89.4-93.5 | 0.96 | no |
| self_monitoring | habit | 82.3 | 85.1 | 86.5 | 87.8 | 88.9 | 0.86 | 24% | 23% | 1% | 76% | read | 86.6-91.6 | 0.96 | no |
| repetition_tolerance | benefit | 82.7 | 83.7 | 86.8* | 84.7 | 81.4 | 0.65 | 24% | 6% | 1% | 93% | read | 83.0-85.5 | 0.96 | no |
| generation_effect | benefit | 84.6 | 87.9 | 88.4* | 87.0 | 86.2 | 0.57 | 24% | 0% | 3% | 97% | read | 84.9-87.1 | 0.95 | no |
| fatigue_curve | contrast | 81.5 | 82.3 | 86.1 | 82.9 | 82.9 | 0.61 | 25% | 3% | 28% | 69% | read | 83.0-87.2 | 0.96 | no |
| boredom_susceptibility | scale | 81.0 | 85.5 | 85.8 | 80.6 | 82.1 | 0.62 | 25% | 0% | 5% | 94% | read | 84.8-90.0 | 0.96 | no |
| guessing_propensity | habit | 82.2 | 83.0 | 86.8 | 82.2 | 87.3 | 0.72 | 26% | 6% | 46% | 48% | misread | 86.5-91.6 | 0.96 | no |
| intrinsic_motivation | scale | 78.1 | 82.8 | 84.1 | 80.0 | 81.7 | 0.69 | 27% | 0% | 13% | 87% | read | 82.5-88.5 | 0.97 | no |
| contradiction_sensitivity | reasoning | 82.0 | 84.9 | 87.0 | 87.4 | 83.5 | 0.74 | 28% | 7% | 30% | 63% | misread | 85.0-89.2 | 0.96 | no |
| structure_need | scale | 81.9 | 86.5 | 86.9 | 81.9 | 82.7 | 0.69 | 28% | 0% | 2% | 98% | read | 85.5-90.5 | 0.96 | no |
| competitive_drive | scale | 79.6 | 83.8 | 85.3 | 80.1 | 82.2 | 0.63 | 28% | 2% | 5% | 93% | read | 83.7-89.3 | 0.97 | no |
| systems_thinking | reasoning | 80.4 | 83.9 | 86.1 | 85.7 | 82.1 | 0.74 | 29% | 0% | 31% | 69% | read | 83.6-88.2 | 0.97 | no |
| autonomy_preference | scale | 81.6 | 86.3 | 86.9 | 83.3 | 83.5 | 0.69 | 29% | 0% | 7% | 93% | read | 85.3-90.3 | 0.96 | no |
| intake_baseline | performance | 79.2 | 83.9 | 85.4 | 80.3 | 82.8 | 0.69 | 30% | 3% | 8% | 89% | read | 87.5-92.3 | 0.97 | no |
| abstraction_tolerance | reasoning | 78.8 | 84.7 | 85.5 | 78.6 | 81.8 | 0.73 | 32% | 1% | 10% | 90% | read | 82.3-87.3 | 0.97 | no |
| causal_chain_depth | reasoning | 80.8 | 84.4 | 87.8 | 89.8 | 82.1 | 0.78 | 36% | 1% | 39% | 60% | misread | 84.0-88.5 | 0.97 | no |
| error_recovery_speed | contrast | 81.3 | 88.7 | 88.8* | 85.0 | 83.8 | 0.84 | 40% | 0% | 24% | 76% | read | 82.8-87.0 | 0.96 | no |
| planning_tendency | scale | 80.5 | 87.8 | 88.4 | 80.5 | 83.9 | 0.82 | 40% | 2% | 12% | 87% | read | 84.4-89.7 | 0.97 | no |
| failure_response | contrast | 81.3 | 88.7 | 88.8* | 85.0 | 83.8 | 0.84 | 40% | 0% | 25% | 75% | read | 82.8-87.0 | 0.96 | no |
| working_memory_span | performance | 82.4 | 87.0 | 89.6 | 82.3 | 85.3 | 0.79 | 41% | 2% | 26% | 72% | read | 89.5-93.5 | 0.96 | no |
| consolidation_need | memory | 80.4 | 85.4 | 88.8* | 85.1 | 82.5 | 0.83 | 43% | 1% | 42% | 57% | misread | 83.6-88.8 | 0.97 | no |
| instruction_adherence | habit | 80.6 | 84.9 | 89.1 | 87.8 | 85.6 | 0.78 | 44% | 5% | 18% | 77% | read | 85.2-90.8 | 0.97 | no |
| deliberation_depth | habit | 79.6 | 85.2 | 88.9 | 88.5 | 85.6 | 0.92 | 46% | 4% | 59% | 37% | misread | 84.5-90.3 | 0.97 | no |
| recognition_recall_gap | performance | 82.8 | 83.2 | 90.7 | 89.8 | 89.2 | 0.83 | 46% | 24% | 33% | 43% | misread | 89.7-93.7 | 0.96 | no |
| open_response_performance | performance | 82.8 | 83.3 | 90.8 | 89.7 | 89.4 | 0.83 | 46% | 24% | 31% | 45% | misread | 89.7-93.7 | 0.96 | no |
| hint_dependency | habit | 80.6 | 87.8 | 90.3 | 90.6 | 87.6 | 0.86 | 50% | 2% | 8% | 90% | read | 85.3-90.8 | 0.97 | no |
| help_seeking | habit | 79.9 | 83.3 | 90.4 | 90.6 | 86.2 | 0.87 | 52% | 21% | 32% | 46% | misread | 84.7-90.4 | 0.97 | no |
| error_driven_learning | contrast | 79.9 | 84.4 | 91.2* | 92.0 | 85.0 | 0.93 | 56% | 0% | 70% | 30% | misread | 81.6-86.1 | 0.97 | no |
| misconception_persistence | memory | 79.9 | 84.4 | 91.3* | 92.1 | 85.3 | 0.93 | 57% | 0% | 70% | 30% | misread | 83.2-88.5 | 0.97 | no |
| frustration_threshold | scale | 81.9 | 92.6 | 92.2* | 86.5 | 88.8 | 0.93 | 57% | 27% | 3% | 71% | read | 85.5-90.5 | 0.96 | no |
| brevity_preference | habit | 80.3 | 90.1 | 91.9* | 91.3 | 87.9 | 0.92 | 59% | 1% | 42% | 57% | misread | 85.1-90.7 | 0.97 | no |
| perfectionism | habit | 82.5 | 91.3 | 93.5* | 92.6 | 88.1 | 0.94 | 63% | 5% | 36% | 58% | misread | 86.7-91.7 | 0.96 | no |
| reflection_depth | habit | 81.8 | 85.8 | 93.5* | 93.8 | 90.0 | 0.93 | 64% | 48% | 22% | 31% | misread | 86.2-91.3 | 0.96 | no |
| persistence | habit | 78.7 | 89.3 | 92.4* | 92.2 | 87.1 | 0.93 | 64% | 6% | 36% | 58% | misread | 83.8-89.9 | 0.97 | no |
| mastery_velocity | memory | 79.3 | 85.8 | 92.8* | 92.5 | 85.9 | 0.97 | 65% | 38% | 23% | 39% | misread | 82.7-88.2 | 0.97 | no |
| scaffolding_fade | contrast | 87.4 | 89.8 | 95.8* | 94.0 | 95.0 | 0.95 | 66% | 42% | 30% | 27% | misread | 88.5-91.3 | 0.92 | no |
| self_efficacy | scale | 80.7 | 90.7 | 94.0* | 93.7 | 86.9 | 0.95 | 69% | 0% | 6% | 94% | read | 84.6-89.8 | 0.97 | no |
| attention_runway | habit | 79.9 | 80.4 | 94.1* | 93.4 | 87.4 | 0.95 | 71% | 5% | 0% | 94% | read | 84.7-90.4 | 0.97 | no |
| rush_tendency | habit | 79.8 | 89.6 | 94.2* | 93.5 | 87.9 | 0.95 | 71% | 5% | 50% | 45% | misread | 84.6-90.4 | 0.97 | no |
| vocabulary_ceiling | performance | 77.3 | 91.7 | 93.7* | 93.4 | 90.9 | 0.96 | 72% | 45% | 4% | 50% | misread | 86.4-91.6 | 0.98 | no |
| challenge_appetite | contrast | 80.2 | 93.4 | 94.7* | 94.1 | 86.5 | 0.96 | 73% | 11% | 25% | 64% | misread | 81.9-86.3 | 0.97 | no |
| prior_knowledge | performance | 79.8 | 90.9 | 94.7* | 94.2 | 92.3 | 0.96 | 74% | 0% | 36% | 64% | misread | 87.9-92.6 | 0.97 | no |
| processing_velocity | performance | 77.8 | 85.5 | 95.8* | 94.5 | 91.3 | 0.99 | 81% | 31% | 44% | 25% | misread | 86.7-91.9 | 0.97 | no |