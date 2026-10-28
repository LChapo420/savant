/**
 * The parts a base lesson page is written in, and why.
 *
 * ## Why not one call
 *
 * Asked for the whole page in a single request, `stealth/space-bunny-alpha` returns
 * nothing: zero characters of content, 100,000-odd of reasoning, `finish: length`.
 * At 24,000 tokens, at 12,000, at 8,000 — the same empty answer three times. The
 * obvious explanations are each wrong, and each was measured rather than assumed:
 *
 *   - **not the budget.** Three budgets, three empties.
 *   - **not reasoning.** Reasoning is mandatory on this endpoint — `enabled: false`
 *     is a 400 — and omitting the field answers a short ask perfectly.
 *   - **not markup.** The same lesson as HTML markup came back at 26,268 characters.
 *   - **not the prompt's length.** Trimmed to a third of it, still empty.
 *   - **not one section.** A single section on its own: empty, 55,863 of reasoning.
 *
 * What is left is the *shape*. Every request that came back asked for content and
 * a shape at once — prose, or markup with no palette, or markup with a palette. Every
 * request that came back empty asked for content and a shape at once *and* rules for
 * how the shape behaves. A model reasoning about a page it must invent whole spends
 * its budget designing the page instead of writing it, and it never finishes
 * designing.
 *
 * The two halves are separable, and each lands:
 *
 *   the content, as HTML, with no palette and no page contract   2,184 characters
 *   the shape, as a `<style>` block, with no content            16,167 characters
 *
 * So the page is written the same way. One call decides the palette and writes every
 * style rule, scoped and named. One call per section writes the teaching, given the
 * class names that call chose. One call writes the behaviour, given the ids the
 * sections declared. Three kinds of work, each of which this model will actually do,
 * and the output contract is the shell's rather than the model's.
 *
 * That is not a workaround so much as the better shape: the page's CSS is one
 * decision made once, instead of eight sections each restyling themselves.
 */
const { buildPrompt } = require('./lesson-prompt-template');

/**
 * The sections, in the order they are rendered.
 *
 * Splitting the creator's template by hand would break the moment he edited it, so
 * the sections live here and the whole prompt is still built — it is what the
 * sequence, the output contract and this file's own tests are read from.
 */
const SECTIONS = [
  {
    key: 'foundation',
    n: '01',
    title: 'Textbook Foundation',
    want: `What tone is, the registers a writer moves between (casual, conversational,
professional, formal, academic), what changes between them — vocabulary, sentence
length, contractions, hedging, formality markers — and how to choose one for an
audience and a purpose. Then how to shift deliberately: a worked before-and-after
for each direction, and the tells that show which register a passage is in.`,
  },
  {
    key: 'hazards',
    n: '02',
    title: 'The Four Hazards',
    want: `Four ways tone goes wrong, each in its own card: sounding falsely formal,
sounding falsely casual, being inconsistent, and losing the audience. For each, what
it looks like in a real sentence, why it fails, and the repair. Then four short
passages to diagnose, each with the tone named and the evidence quoted.`,
  },
  {
    key: 'engine',
    n: '03',
    title: 'The Signal Rig',
    want: `An interactive rig for testing tone against a target audience. A signal
console with three controls the learner sets — formality, distance, warmth — and a
meter that responds. A short passage is rewritten live as the learner moves the
controls, so the effect of each is visible rather than described. A target audience
is named and the learner must reach it, with feedback naming what moved and what did
not. Buttons act: nothing on the page is decorative.`,
  },
  {
    key: 'negation',
    n: '04',
    title: 'The Register Negator',
    want: `An argument about tone written in the wrong register for its audience. The
learner is shown it and asked to find the fatal fault. A [NEGATE] control reverses
the target audience, and the rig re-evaluates: with the audience reversed the same
words now fail, which is what proves the fault was the register and not the content.
Feedback names the structural reason in two sentences.`,
  },
  {
    key: 'forensics',
    n: '05',
    title: 'Live Fire Forensics',
    want: `Three dense passages of mixed register, read as though they were written for
three different audiences. Mode selectors switch the page between viewing each one
for what it says and for how it sounds; the second view highlights the exact phrases
that carry the register and opens short inspector notes on them. Then a challenge:
which of three passages was written for the wrong audience, and why.`,
  },
  {
    key: 'protocol',
    n: '06',
    title: 'Quick Reference',
    want: `A reference table: register, its markers, who it is for, and the one mistake
it usually makes. Then the five-step check a writer can run over their own draft —
name the audience, name the purpose, mark the register, list the markers, revise
twice — as a clean ordered list.`,
  },
];

/** The lesson's facts, the same in every call. */
function briefFor(config) {
  return `SUBJECT: ${config.subject}
TOPIC: ${config.topic}
WHAT IT COVERS: ${config.generalization}
AUDIENCE: ${config.gradeBand}, ${config.age.text}
LEVEL: ${config.level} (lesson ${config.sequence} of ${config.lessonCount} in this grade)`;
}

/**
 * The class names the style call commits to, and the sections are told to use.
 *
 * Fixed here rather than left to the style call, because the sections need the
 * names and the style needs to know them: the alternative is a style call that
 * invents names no section was told about, and a page whose CSS and markup agree on
 * nothing. The style call may add to these; it may not rename them.
 */
const VOCABULARY = {
  root: 'base-lesson-body',
  parts: [
    'base-hud', 'base-section', 'base-card', 'base-grid', 'base-meter',
    'base-meter-fill', 'base-rig', 'base-control', 'base-btn', 'base-probe',
    'base-choice', 'base-diagnostic', 'base-ref', 'base-finish',
  ],
  behaviour: {
    parts: 'every control must be an element the script wires, and every control does something when used',
    ids: 'id="base-rig-1" — one per interactive control, which the script finds by name',
    meter: 'id="base-meter" and "base-meter-fill" — the script writes their width',
    diagnostic: 'id="base-diagnostic" — where the script writes its two sentences',
    finish: 'window.polymathFinishLesson — the page\'s own finish, which the script calls',
  },
};

/** The style call: one palette, one set of rules, no content. */
function stylePrompt(config) {
  const parts = VOCABULARY.parts.map((c) => `.${c}`).join(', ');
  return `Write the complete CSS for one interactive lesson page.

${briefFor(config)}

PAGE
A dark, tactile, hardware-console look. A sticky top bar of readouts, a column of
teaching sections, interactive rigs with chunky controls, and a centred button at
the very end. It must read as one machine rather than a set of cards.

COLOURS — use exactly these, as CSS custom properties on #${VOCABULARY.root}:
  --bg: #0F0C08
  --surface: #1A1611
  --accent: #FFB347
  --accent-dark: #713A0A
  --accent-glow: #FFB34755
  --ok: #22C55E
  --text: #F5E9D8
  --muted: #9A8B76

CLASSES — these exact names, because the markup is written against them:
${parts}
plus .base-tag, .base-kv, .base-row, .base-mark, .base-quote.

RULES
- EVERY selector is scoped under #${VOCABULARY.root}. Nothing may style anything
  outside it.
- The tactile button: .base-btn is raised with box-shadow: 0 4px 0 var(--accent-dark);
  :hover adds a glow; :active does transform: translateY(2px) with a 2px shadow.
- A fixed, full-bleed background, a sticky bar, and a max-width column.
- A 360px phone breakpoint at which the grid collapses to one column.
- prefers-reduced-motion: reduce, which switches the animations off.
- Focus visible on every interactive element.

Return ONLY the <style> block, beginning with <style> and ending with </style>.
No HTML, no explanation.`;
}

/** One section's content, told the classes it must use. */
function sectionPrompt(config, section, index) {
  const where = index === 0
    ? 'This is the FIRST section, so it carries the opening <h1> and the mission paragraph.'
    : 'This is a later section, so it opens with its own <section> and a heading.';
  return `Write SECTION ${section.n} — ${section.title} — of a lesson page.

${briefFor(config)}

${where}

Build exactly this:

${section.want}

OUTPUT
- HTML only. No markdown fence, no commentary, no <style>, no <script>.
- Begin with the first tag.
- Use ONLY these class names for structure:
${VOCABULARY.parts.map((c) => `.${c}`).join('\n')}
  plus .base-tag, .base-kv, .base-row, .base-mark, .base-quote.
  No other class names. No inline style attributes.
- Interactive controls, if this section has any, are <button class="base-btn">
  and each needs its own id, named for what it does: "base-<verb>-<n>".
- A few hundred words of real teaching. Not an outline of a lesson — the lesson.`;
}

/** The behaviour call: the script, and the button that ends the page. */
function behaviourPrompt(config) {
  const b = VOCABULARY.behaviour;
  return `Write the JavaScript for an interactive lesson page.

${briefFor(config)}

The page's markup and CSS are already written. Your job is the behaviour and the
final button. Return ONE <script> block, and nothing else.

DO THIS
- Wire ${b.parts}.
- The behaviour hooks the markup declares, and you find them by name:
    ${b.ids}
    ${b.meter}
    ${b.diagnostic}
- The teaching sections are static and need nothing.
- A script block at the end of the document, and the behaviour set up on
  DOMContentLoaded. No inline event attributes.
- No external requests of any kind.

THEN, after the script, a final <div class="base-finish"> containing:
- A line reading STRUCTURE SECURED AND VERIFIED, and the meter reaching 100%.
- One prominent centred <button class="base-btn" id="base-finish-btn">Finish Lesson</button>
  which calls ${b.finish} && ${b.finish}(); and which does nothing silently if that
  function is not there.
- Nothing after that button. No links, no cards around it, no progress bar. The
  page ends there.`;
}

/** Parse the style call's answer down to the <style> block. */
function styleOf(answer) {
  const m = String(answer || '').match(/<style[\s\S]*?<\/style>/i);
  if (m) return m[0];
  // No tags: the model wrote bare CSS, which is the same thing to a browser.
  const css = String(answer || '').replace(/^```(?:css|html)?\s*/i, '').replace(/```\s*$/, '').trim();
  return css ? `<style>\n${css}\n</style>` : '';
}

module.exports = {
  buildPrompt, SECTIONS, VOCABULARY, briefFor, stylePrompt, sectionPrompt,
  behaviourPrompt, styleOf,
};
