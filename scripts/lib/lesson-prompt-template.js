/**
 * The generation prompt, as one string, with the configuration filled in.
 *
 * The template is the creator's own, kept word for word. What is not the
 * creator's is what surrounds it: a short instruction that the output is a single
 * HTML file to be embedded as-is, and a single closing line telling the model the
 * page is a document fragment rather than a whole site — because a model asked for
 * "a single-file web app" will happily emit `<!DOCTYPE html>` and a `<head>`, which
 * is then nested inside another document and breaks the page it is embedded in.
 *
 * Both additions are marked in the output they produce so the seam is visible
 * rather than assumed: the returned HTML says which lesson it was built for and
 * which model wrote it, and the wrapper that serves it can check.
 */
const { lessonConfig } = require('./lesson-prompt');

/**
 * The output contract, as one string.
 *
 * Split out so the per-user level editor can state the same rules without keeping
 * a second copy of them. A tailored page is held to exactly what a generated one
 * is — the same root id, the same scoped CSS, the same single style and script
 * block, no external fetches — and two copies of that list would drift, which is
 * the failure this codebase has already recorded five times over.
 *
 * Every rule here is also enforced mechanically by `inspect()` in
 * scripts/generate-base-lesson.js. This is the version the model is asked to
 * follow; that is the version it is checked against.
 */
const OUTPUT_FORMAT = `==================================================
OUTPUT FORMAT (REQUIRED):
- Return ONLY the complete HTML source. No markdown code fence, no commentary before
  or after, no explanation of what you built.
- This HTML is a FRAGMENT that will be inserted into an existing page, below its
  navigation bar. So do NOT emit <!DOCTYPE html>, <html>, <head>, <body> or
  <title>. Start at the first element of the lesson content.
- Put all CSS in a single <style> block and all JavaScript in a single <script>
  block, both inside the fragment. The page supplies the fonts.
- Scope every CSS rule to this fragment (for example by prefixing selectors with
  a class or id you choose, or by wrapping the whole lesson in a single container
  element with its own class). The page's own styles must not be changed, and
  your styles must not leak onto the page's navigation bar or other pages.
- The very first thing in the fragment must be a <style> block declaring the CSS
  custom properties for your chosen theme (--accent, --accent-dark, --accent-glow,
  and the base and surface colours).
- The lesson must work at any width from a phone to a wide desktop.
- Do not fetch anything external: no CDNs, no web fonts, no external images.
  Every asset must be inline SVG, CSS or emoji, because the page may be served
  with no network access at all.
- Name the root element of the fragment so it can be identified later: the first
  element must carry the id "base-lesson-body".
==================================================`;

/**
 * The prompt body, with every placeholder filled.
 *
 * @param {string} trackId
 * @param {string} gradeId
 * @param {number} level
 * @returns {{prompt: string, config: object}}
 */
function buildPrompt(trackId, gradeId, level) {
  // `lessonConfig` refuses a level that is not a lesson, so by the time this
  // returns, the level is a lesson and has a place in its grade's sequence.
  const c = lessonConfig(trackId, gradeId, level);
  if (c.sequence === null) {
    throw new Error(`level ${level} of ${c.gradeId} is a lesson but has no chronological`
      + ' position among the grade\'s lessons');
  }

  const future = c.future.length ? c.future.join(', ') : '[none — this is the last lesson in the grade]';
  const variant = c.variant;

  const prompt = `Act as an elite educational game designer, cognitive learning scientist, and creative frontend engineer. Generate a complete, self-contained, single-file interactive educational web app (HTML5, embedded CSS, vanilla JS) that balances rigorous, comprehensive instruction with active simulation gameplay.

==================================================
LESSON INPUT CONFIGURATION (FILLED IN FOR THIS LESSON):
- SUBJECT: ${c.subject}
- TOPIC NAME: ${c.topic}
- TOPIC GENERALIZATION: ${c.generalization}
- TARGET GRADE LEVEL: ${c.gradeBand}
- TARGET AVERAGE AGE: ${c.age.text}
- LEVEL NUMBER: ${c.level}
- LESSON SEQUENCE NUMBER: ${c.sequence}
- PREVIOUS LESSONS: ${c.previous}
- FUTURE LESSONS: ${future}
==================================================
(This lesson is lesson ${c.sequence} of ${c.lessonCount} in ${c.gradeBand}, so the
game engine you build is variant ${variant} of the twenty below. Compute it the same
way: Variant Index = ((${c.sequence} - 1) % 20) + 1 = ${variant}.)

CORE ARCHITECTURAL PARADIGM: LESSON-FIRST, SIMULATION-SECOND
- COMPREHENSIVE COVERAGE: The app MUST NOT jump straight into gameplay. It begins with comprehensive, textbook-grade instruction that covers the full analytical breadth of the topic.
- TEACH BEFORE TEST: The student must be thoroughly taught the formal terminology, structural hierarchies, classification rules, failure modes, and heuristics in Sections 1 and 2 so they are fully equipped to diagnose, operate, and solve the interactive simulation mechanics that follow.
- DYNAMIC DEBRIEFS: Inside the simulations, reinforcement is delivered through crisp tactical feedback (2–3 sentences) explaining the structural reasons for success or failure.
- CRITICAL SUBJECT VS. THEME DECOUPLING: 100% of the academic text, definitions, worked examples, hazard breakdowns, and challenge scenarios MUST strictly belong to the specified SUBJECT and TOPIC NAME. The Theme and Game Engine serve purely as visual styling and physical interaction mechanics for analyzing subject content—NEVER let the theme hijack the curriculum.

THE 20 DETERMINISTIC SIGNATURE GAME ENGINES:
Calculate the variant using: Variant Index = ((LESSON SEQUENCE NUMBER - 1) % 20) + 1.
The app MUST implement the exact physical game engine and interface corresponding to that index in SECTION 03:

1. The Cantilever Balance Arm: Dual-arm mechanical scale. Dock foundational inputs on the left arm and conclusions/outcomes on the right; unsupported outputs cause the arm to tilt into an alert-red "Torque Fracture" state until a qualifying damper is added.
2. The Keystone Arch Squeezer: Stone archway spanning an abyss with an empty keystone slot. Squeezing hydraulic clamps with a circular link shatters the arch; inserting a valid structural bridge locks the keystone in place under load.
3. Hydraulic Piston Compression Rig: Vertical 10,000 PSI piston compressing stacked layers [Core Outcome / Connecting Mechanism / Foundation Data]. Compressing on an unstated causal leap ruptures seals and leaks fluid; verified grounds hold rigid under full tonnage.
4. Truss-Bridge Pin Joiner: 4-bay steel truss bridge spanning a canyon with a missing structural cross-member. Rolling a test train across a bridge with an unverified assumption buckles the track; pinning a sound warrant allows safe crossing.
5. The Foundation Piling Core Drill: Deep geological cross-section. Driving pilings into surface sand (anecdotes/shallow data) triggers seismic facade cracking; anchoring into deep granite bedrock (empirical data) secures the tower.
6. The Vault Door Multi-Bolt Interlock: Heavy circular vault door with 3 radial locking bolts [Primary Grounds, Scope Parameter, Connecting Bridge]. Testing bolts with a digital torque wrench snaps ungrounded definitional leaps; all 3 must pass torque thresholds to swing open.
7. Dry-Stack Masonry Retaining Wall: Gravity retaining wall holding back earthen pressure. Sluicing mud runoff against a wall missing a drainage gravel backing (falsification check) blows the masonry outward.
8. The Polarization Prism Filter: Optical glass viewer with 3 rotatable prisms [Empirical Fact, Value Judgment, Causal Claim]. Rotating prisms across dense material illuminates hidden value assumptions in glowing spectra while filtering background noise.
9. The Sub-Surface Ground-Penetrating Radar (GPR): Horizontal passage scanner cart emitting radar pulses. Smooth surface presentations reveal an underground sinkhole (missing mechanism/warrant) directly beneath a sweeping conclusion.
10. The Circuit Board Continuity Multimeter: Printed circuit board with trace lines linking inputs to outputs. Probing fallacious nodes shows 0.00V / Open Circuit; testing sound deductive inferences completes the circuit with a relay click.
11. The Logic Chromatograph: Chemical capillary strip separating arguments into distinct colored bands (Pathos/Noise Blue, Data Amber, Connecting Mechanism Violet). Measure band ratios on a graduated scale to verify empirical sufficiency.
12. Thermal Imaging Heat-Loss Flaw Detector: FLIR infrared camera lens monitoring a scenario under stress. High-friction overgeneralizations flare white-hot with thermal leaks, while sound deductions stay cool blue.
13. The Logic Negation Detonator: Transparent blast chamber with an inverted assumption circuit. Flipping the toggle to [NEGATE] and firing the detonator shatters the claim into debris, verifying that the assumption was load-bearing.
14. The Centrifugal Force Spinner: High-speed centrifuge spinning argument test tubes at 10,000 Gs. Speculative correlation claims separate and blow their seals, while controlled empirical grounds stay bonded.
15. The Wind Tunnel Aerodynamic Drag Rig: Force-pedestal mount inside a wind tunnel. Broad, unqualified claims generate severe turbulent buffeting and drag; qualified, bounded claims maintain smooth laminar airflow.
16. The Corrosive Acid Dip Tank: Motorized crane dipping an argument framework into green falsification acid. Unstated assumptions fizz, dissolve, and strip away, leaving only the verified factual steel skeleton.
17. Cryogenic Freeze & Shatter Chamber: Liquid nitrogen cooling chamber. Rigid absolute assertions ("Always", "Never") freeze brittle and fracture under impact; flexible probabilistic claims retain structural elasticity.
18. The Logic Pipeline Valve Switchboard: Pressurized transparent pipeline network. Routing fluid through a "False Dichotomy" valve blows a pipe joint; switching to a verified inductive bypass spins the flow turbine.
19. Rail Yard Track-Hump Shunter: Elevated gravity freight rail yard. Toggling track-switch levers routes rolling argument cars into classification tracks (Sound Ground, Unstated Warrant, Distraction); misrouted cars derail.
20. The Logic Sorting Pneumatic Tube Bank: Overhead pneumatic dispatch bank with 4 suction chutes. Inspecting argument canisters and loading them into matching diagnostic chutes triggers high-speed suction delivery.

DYNAMIC AI THEME ENGINE (MANDATORY CREATIVE AUTONOMY):
- FORBIDDEN DEFAULT: Do NOT use standard flat gray/slate dark mode or generic corporate dashboard themes.
- CREATIVE MANDATE: Commit fully to ONE distinct visual world matching the tone:
  * Option A: "Bioluminescent Deep Abyss / Submarine Reactor" (#030712 base, #0D9488 abyssal teal, #84CC16 lime, #F97316 amber-orange).
  * Option B: "Cyber-Forensics / Neon Neuromancer" (#050508 base, #F43F5E laser-pink, #A855F7 violet, #06B6D4 synth-cyan).
  * Option C: "High-Orbit Orbital Defense / Solar Array" (#0B0B14 base, #FBBF24 solar gold, #3B82F6 plasma cobalt, #FFFFFF crisp white).
  * Option D: "Analog Synth / CRT Tape Terminal" (#141416 base, #F59E0B CRT amber, #22C55E terminal green, scanline borders and beveled plates).
- THEMATIC COHESION: Every button border, SVG element, card elevation, and telemetry badge must match the selected palette.

TACTILE 3D MECHANICAL CONTROLS:
- Every clickable button, module, and toggle must feel like physical machine hardware.
- Raised 3D profile: distinct 2px borders, rounded corners (8px–12px), and deep offset 3D bottom shadows (\`box-shadow: 0 4px 0 var(--accent-dark);\`).
- Hover: vibrant theme glow (\`box-shadow: 0 4px 14px var(--accent-glow), 0 4px 0 var(--accent-dark);\`).
- Active/Click: physical mechanical depression (\`transform: translateY(2px); box-shadow: 0 2px 0 var(--accent-dark);\`).
- Every control must feature an imperative action verb (e.g., "⚡ ACTIVATE STRESS TEST", "💣 DETONATE NEGATION", "🔬 PROBE SECTOR").

GRID BALANCING & LAYOUT INTEGRITY:
- Symmetrical layout only. Never leave an orphan card on its own row.
- 4-item card sections MUST use a balanced 2x2 grid (\`grid-template-columns: repeat(2, 1fr);\`) or a 4-column row (\`repeat(4, 1fr)\`).

==================================================
EXACT COMPONENT SEQUENCE (RENDER IN STRICT ORDER):
==================================================

1. HUD & THEMATIC TELEMETRY BAR:
   - Sticky top bar with: Level Badge ("Level ${c.level}"), Subject ("${c.subject}: ${c.topic}"), Target Age/Grade badge ("${c.gradeBand} | ${c.age.text}"), Player Callsign, Live XP Counter (+100 XP per test solved), and a dynamic "Structural Integrity Gauge" (starts at 25% Calibration, dynamically animates to 100% as the player progresses).
   - Brief 2-sentence mission setup establishing the scenario.

2. SECTION 01: COMPREHENSIVE TEXTBOOK FOUNDATION (FULL DOMAIN ARCHITECTURE):
   - Exhaustive, deep-dive instructional module teaching the complete theoretical framework of the topic before any gameplay begins:
     * Full structural model: Core Assertion/Outcome, Empirical Grounds/Inputs, Connecting Bridges/Mechanisms, Scope Qualifiers, and Boundary Conditions.
     * The 4 Core Verification Criteria: Relevance, Sufficiency, Accuracy, and Independence.
     * Epistemological Distinction: Structural Validity (formal internal consistency) vs. Soundness (Validity + Verified Factual Truth).
     * Deductive Systems (Truth-Preserving Certainty) vs. Inductive Systems (Probabilistic Strength & Sample Robustness).
     * Key Presumption Traps & Fallacies specific to this subject.
   - Two (2) fully analyzed real-world worked examples with color-coded syntax tags, component decoders, and structural callouts.

3. SECTION 02: THE 4 HAZARD / SUBTYPE PODS (BALANCED 2x2 GRID):
   - In-depth, exhaustive written instruction on the 4 primary unstated assumptions, failure modes, or structural hazard archetypes in this domain, rendered in a strict 2x2 grid:
     * Pod 1: "The Value Trap" (Presupposing unstated priorities, moral hierarchies, or preferences).
     * Pod 2: "The Causal Leap" (Conflating correlation/sequence with direct causation; omitted variable bias).
     * Pod 3: "The Definitional Shift" (Equivocation; sliding between colloquial and technical definitions mid-argument).
     * Pod 4: "The Micro-Sample Mirage" (Generalizing from non-representative samples, voluntary cohorts, or survivor bias).
   - Each card contains complete formal identification rules, catastrophic failure risks, and an illustrative domain text excerpt with an active diagnostic breakdown.

4. SECTION 03: THE SIGNATURE GAME ENGINE (DETERMINISTIC VARIANT MECHANIC):
   - Build out the FULL, working interactive hardware simulator assigned to this lesson's Variant Index — which for this lesson is ${variant}.
   - The user manipulates physical controls (e.g., balancing arms, turning valves, torquing bolts, or routing lines) to test an authentic domain problem.
   - Immediate physical simulation feedback: CSS keyframe shakes/fractures on failure, illuminated neon stabilization on success, and a concise 2-sentence tactical diagnostic readout explaining the structural reason for the outcome.

5. SECTION 04: "THE NEGATION DETONATOR" (ACTIVE HEURISTIC DESTRUCTION):
   - Central Interactive Arena: A realistic scenario argument is under heavy synthetic load.
   - The Target Implicit Warrant/Assumption is displayed on an illuminated detonator plate.
   - Action Button: [💣 DETONATE NEGATION TEST].
   - Interaction Physics: Clicking launches a destruction sequence—the card flashes warning colors, cracks appear across the container, and the claim collapses into fragments.
   - Tactical debrief pop-up: "DETONATION SUCCESSFUL! By proving the opposite of the implicit assumption, the entire premise collapsed. The Negation Test proves this assumption was a fatal structural dependency."

6. SECTION 05: "LIVE FIRE FORENSICS" (INTERACTIVE TEXT X-RAY):
   - Dense, authentic high-stakes passage displayed on the central terminal.
   - 3 Mode Selectors (like thermal vision channels):
     * [🟢 SCAN FOUNDATION / GROUNDS]
     * [🔵 SCAN CORE CLAIMS / OUTCOMES]
     * [🟠 DETECT UNSTATED MECHANISMS / WARRANTS]
   - Activating each mode highlights exact phrases on the console in real time and reveals brief inspector notes in an active sidebar.
   - Interactive Challenge: "Find the Fatal Flaw". 3 clickable analytical hypotheses; clicking the right one triggers full structural clearance.

7. SECTION 06: QUICK-REFERENCE PROCEDURAL PROTOCOL (TRANSFER & ERROR DETECTION TRIAGE):
   - A high-contrast, scannable HUD matrix summarizing: Component, Failure Mode, and The 5-Step Elimination Protocol.
   - The Universal 5-Step Deconstruction Protocol (Clean \`<ol>\` list):
     1. <strong>Step 1: Isolate Core Claims & Scope Limits:</strong> Separate the central assertion from background context and mark certainty limiters.
     2. <strong>Step 2: Audit Empirical Grounds for Sufficiency:</strong> Check for sample representation, bias, and source independence.
     3. <strong>Step 3: Extract the Unstated Bridge / Mechanism:</strong> Formulate the implicit connecting principle linking inputs to outcomes.
     4. <strong>Step 4: Execute the Negation & Counter-Model Test:</strong> Logically negate the bridge; if the outcome collapses, the component is load-bearing.
     5. <strong>Step 5: Probe for Confounding Variables & Causal Reversal:</strong> Check for alternative explanations, bidirectional causality, and definitional shifts.

8. CLEARANCE & TERMINATION:
   - Integrity Gauge reaches 100% "STRUCTURE SECURED & VERIFIED".
   - A prominent, centered 3D push-button labeled: "Finish Lesson".
   - The button must call \`window.polymathFinishLesson && window.polymathFinishLesson()\`. The page below provides that function; call it if it exists, and if it does not, do nothing silently rather than raising an error.
   - Do NOT render any surrounding cards, progress bars, text teasers, or next-activity dispatches. The page must cleanly terminate with this single button.

Wrap all JavaScript execution within document.addEventListener('DOMContentLoaded', () => { ... }) to ensure seamless, zero-defect execution.

${OUTPUT_FORMAT}`;

  return { prompt, config: c };
}

module.exports = { buildPrompt, OUTPUT_FORMAT };
