# Savant landing page: design brief

Goal: a public page that reads as made by one careful person, says what Savant does in the first screen, and gives a Y Combinator partner a reason to keep reading. Applying for the beta is the single call to action. Everything on it is true today or labelled as a goal or an illustration.

## 1. Research: the tells to avoid

Read: 21st.dev "website not look AI-generated", codemyspec "vibe coded websites look the same", MindStudio, Fountain Institute "7 signs a UI has been vibe coded", Reddit and Substack write-ups, and YC-linked advice (Seibel, Tan: say plainly what you do and for whom; show, do not tell). Many sources are opinion, so only tells shared by three or more were used. Resend, Anthropic and Superhuman were read for how real sites open (one declarative headline, one product visual, restrained palette).

| Tell | What we do instead |
| --- | --- |
| Purple/blue gradient, glow, gradient headline text | None. White and graphite; one accent (a proofreader's red) used only to mark what changed for a learner. |
| Centred hero over three identical icon cards | Left-aligned hero with a rule and an asymmetric two-column lead; the three uses are unequal (ACT large, two small). |
| Cards in cards, heavy rounding, frosted glass | Hairlines and open space; 2 to 4 px corners; the form is the only boxed thing. |
| Emoji or icon-in-circle decoration, pills, status dots | No icons except the logo. |
| Inter everywhere | DM Serif Display for headings and the wordmark; Atkinson Hyperlegible Next for text. No third face except for data. |
| Vague copy ("unlock", "empower") | Each sentence names the thing. Cover-the-logo test: no competitor could use it. |
| Stat tiles, logo walls, fake proof | None. Only true facts (9 subjects, 219 grades) and the goal, labelled as a goal. |
| Stock art or invented dashboards | One typeset figure showing the mechanism (one item, two learners), labelled "Illustration" with invented learners. |
| Same section template repeated | Varied: ruled hero, figure, four-step sequence with return loop, one large + two small, one inverted band, split forms. |
| No author | The founder is named and linked. |

## 2. Design system

- **Type.** DM Serif Display (headings, wordmark, figure titles). Atkinson Hyperlegible Next (text, labels). Mono only for formulae and data counters. All self-hosted (CSP `font-src 'self'`).
- **Scale.** Fluid: h1 44 to 84 px (leading 0.98), h2 34 to 56, lead 19 to 23, body 17, UI 15, label 13. Measure 62 to 66 ch.
- **Palette.** Page `#fff`, well `#f4f5f7`, hairline `#e3e5e9` / `#c8ccd3`, ink `#15171b`, secondary `#4b5059`, tertiary `#5a5f69`. Accent `#b8321a` with wash `#f9dcd3`. Dark: page `#121316`, ink `#eceef1`, accent `#ff8f73`, wash `#35211c`, text on wash `#ffb8a3`. All text pairs at least 5.3:1.
- **Grid.** 1200 px container, 12 columns, 32 px gutters (16 px on phones). Single column under 900 px.
- **Rules.** Hairlines between ideas, a 2 px ink rule heading the lead item of each group. No shadows. No motion beyond focus and hover.

## 3. Page outline and copy (as built)

1. **Header.** Logo mark + "Savant" (DM Serif), nav (How it works, Subjects, Evidence, Beta, Investors), Apply for the beta, theme toggle.
2. **Hero.** H1 *The same material, rebuilt for how you learn.* Lead: **Savant is an adaptive learning app, starting with ACT prep.** It learns how you study, think and remember, and what you like, then rebuilds any lesson, level or test around you, aiming for better understanding and longer memory in much less time. Goal line: *Learning at least 3x as efficient, on average. A goal we are testing, not a result we have.* CTA, beta note, evidence and updates links. **Fig. 1** (illustration): one ACT percent-change item rebuilt for two invented learners from a four-line model of each, with the changed parts highlighted.
3. **How it works.** *Learn the learner first. Then rebuild everything around them.* Four steps: learns the learner, writes a spec, rebuilds and checks, times review to memory; a return arrow (each answer updates the model).
4. **Where it starts.** ACT prep (large); your own material; catch up to grade level.
5. **Where it stands** (inverted band). *Our goal is 3x more efficient learning. We have not measured it yet.* Built / How we will measure it / Not built yet.
6. **Subjects.** Nine built; the list sits in a disclosure so ACT stays the focus.
7. **Beta.** Existing copy and the unchanged form, with the updates form beneath it.
8. **Investors.** One founder, plan, data promise, contact form.

Evidence page: a "How it works" section (learner model, personal spec, material rebuilt and checked, review timed to memory), high level, with the line that it is the idea and not the full method; the research pillars restyled; copy softened so published research is never presented as Savant's results.

## 4. Honesty rules
No invented users, numbers, quotes, logos or results. 3x is always "goal". Fig. 1 is labelled an illustration with invented learners. No founder age. No "first" or "only". The page says "aiming for" better understanding and memory.

## 5. Judging log (two independent vision judges, six rounds)
Scores (not_vibe_coded / clarity / yc_credibility), Sonnet 5.5 then GPT 6.1 Sol: r1 7/6/6 and 7/6/6; r2 7/7/7 and 7/7/6; r3 7.5/7.5/7 and 7/7/6; r4 7/7/6 and 7/7/6; r5 7.5/7/7 and 7/7/6; r6 7/7/6 and 8/8/6. The target (9 / 8.5 / 8.5) was not reached. Both judges kept asking for the same thing the page cannot honestly give yet: a real product screen or recording. The app's own screens (orange gradients, rounded cards, login-gated lessons) would add the tells this page removes, so the app UI would need the same treatment first.
