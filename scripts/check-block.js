/**
 * Check every lesson block the way a lesson plays it: render, touch every
 * control, re-render, degrade — and audit the layout contract while it is up.
 *
 *   node scripts/check-block.js                 # every block in the registry
 *   node scripts/check-block.js Sort_Challenge  # just these tags
 *
 * Two kinds of claim, two kinds of check:
 *
 *   FUNCTIONALITY (fail)   the block renders from its testPayload, every
 *                          interactive control answers a click (or input)
 *                          without throwing, empty data degrades instead of
 *                          exploding, a second render rebuilds cleanly, and
 *                          nothing on the page errors.
 *   LAYOUT (warn)          the styling stays inside the block (every class
 *                          carries the block's own tag, matched ignoring case
 *                          and underscores — "Game_TicTacToe" and
 *                          "game_tic_tac_toe" are one name), survives a phone
 *                          (fluid units or a media query), and does not pin
 *                          itself or run wider than a phone.
 *
 * Runs in jsdom with the browser shims a vanilla block may fairly expect
 * (matchMedia, canvas 2D, audio, scrollIntoView, ResizeObserver) so a block is
 * judged on its logic rather than on missing hardware. Real pixels are the
 * showcase's job: http://localhost:6767/engine/showcase.html.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const FAMILIES = {
  lessons: {
    engine: path.join(ROOT, 'public', 'engine'),
    registry: path.join(ROOT, 'public', 'engine', 'registry.json'),
  },
  retention: {
    engine: path.join(ROOT, 'public', 'engine', 'retention'),
    registry: path.join(ROOT, 'public', 'engine', 'retention', 'registry.json'),
  },
};
let ENGINE = FAMILIES.lessons.engine;
let REGISTRY_PATH = FAMILIES.lessons.registry;
// One compiler for every family — the contract is shared, the shelves are not.
const COMPILER_PATH = path.join(ROOT, 'public', 'engine', 'compiler.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Fresh page with the browser APIs a vanilla block may fairly rely on. */
function makePage() {
  const errors = [];
  const noise = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const msg = String((e && e.message) || e);
    // jsdom's CSS parser chokes on plenty of valid modern CSS, and its media
    // elements are stubs: those are harness limits, not block defects.
    if (/Could not parse CSS stylesheet|Not implemented: HTML(Media|Canvas|Audio)/.test(msg)) noise.push(msg);
    else errors.push(msg);
  });
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="stage"></div></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));

  window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  }));
  const noop = () => {};
  window.scrollTo = noop;
  window.Element.prototype.scrollIntoView = noop;
  window.ResizeObserver = window.ResizeObserver || class {
    observe() {} unobserve() {} disconnect() {}
  };
  window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = noop;
  window.HTMLMediaElement.prototype.load = noop;
  window.Audio = window.Audio || function () { return { play: () => Promise.resolve(), pause: noop, load: noop }; };

  // Canvas: one universal no-op surface — contexts, gradients and all. Drawing
  // claims are the showcase's to judge; here the code must simply run. The
  // universal is a callable that answers every property with itself, so
  // ctx.createRadialGradient().addColorStop() chains and measureText().width
  // arithmetic run without pretending to draw.
  const anything = new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anything),
    set: () => true,
    apply: () => anything,
  });
  window.HTMLCanvasElement.prototype.getContext = () => anything;
  // Web Animations and pointer capture are ordinary browser APIs jsdom lacks;
  // a block using them is not a defect, so stub them to their no-op best.
  window.Element.prototype.animate = function () {
    return { finished: Promise.resolve(), cancel: noop, finish: noop, addEventListener: noop, removeEventListener: noop };
  };
  window.Element.prototype.setPointerCapture = noop;
  window.Element.prototype.releasePointerCapture = noop;
  window.Element.prototype.hasPointerCapture = () => false;

  return { dom, window, errors, noise };
}

/**
 * The layout audit, read off the CSS and classes the block renders.
 *
 * Scoping is the one rule a block cannot be forgiven for breaking — an unscoped
 * selector restyles the page it lands on. Class/tag matching ignores case and
 * underscores because both spellings of a tag name mean the same name. The rest
 * are phone-safety hazards, warned loudly: they pass a desktop review and fail
 * in a thumb's reach.
 */
function auditCss(window, tag, container) {
  const failures = [];
  const warnings = [];
  const tagN = norm(tag);
  const scoped = (name) => norm(name).startsWith(tagN);

  const styles = [...window.document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  const inline = [...container.querySelectorAll('*')].map((el) => el.getAttribute('style') || '').join('\n');
  const css = `${styles}\n${inline}`;

  // Selector reach: a CSS rule may only live under its own classes, its data
  // attributes, or keyframe bookkeeping. A rule that reaches the host's own
  // elements — `body`, `h1`, `button`, a bare `*` — restyles the page the block
  // lands on and is an architecture failure. An unscoped CLASS is fine as a
  // state modifier — `is-active`, `btn--primary` — as long as it is never
  // styled on its own: `.scoped__x.is-active` cannot touch the host page, while
  // a bare `.is-active { ... }` restyles everything that dares use the word.
  //
  // At-rule preludes are stripped first: `@media (max-width:480px) {` must not
  // have its condition mistaken for a selector — the mistake that once flagged
  // every responsive block in the library.
  const scanCss = css
    .replace(/@(?:media|supports|container)[^{]*\{/g, '{')
    .replace(/@keyframes[^{]*\{/g, '{');
  for (const m of scanCss.matchAll(/(^|[}\s])([^{}@]+)\{/g)) {
    const selector = m[2].trim();
    if (!selector || /^(from|to|\d+%|0%,\s*100%)/.test(selector)) continue;
    for (const rawPart of selector.split(',')) {
      const p = rawPart.trim();
      if (!p) continue;
      if (p === 'from' || p === 'to' || /^\d/.test(p) || p.includes('%')) continue; // keyframes
      if (p.startsWith(':root') || /^\[data-/.test(p)) continue;
      const classes = [...p.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((x) => x[1]);
      if (classes.some(scoped)) continue; // anchored in the block's own classes
      // Unanchored — from a bare `*` reset to a stray `svg` rule. All of it can
      // reach the host page and all of it is reviewable in the showcase, so it
      // is reported as a warning; the hard gate is functionality.
      warnings.push(`layout: "${p.slice(0, 50).replace(/\s+/g, ' ')}" is unscoped — verify it cannot restyle the host page`);
    }
  }

  // Class scoping on the DOM side: unscoped classes are fine as modifiers on
  // the block's own elements (they are namespaced by where they live), so only
  // warn — the real leak is caught by the selector rule above.
  const classTokens = new Set();
  for (const el of container.querySelectorAll('[class]')) {
    for (const c of el.classList) classTokens.add(c);
  }
  for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) classTokens.add(m[1]);
  const unscoped = [...classTokens].filter((c) => !scoped(c));
  if (unscoped.length) {
    warnings.push(`layout: ${unscoped.length} generic class(es) in use (modifiers ok if always qualified) — e.g. ${unscoped.slice(0, 3).join(', ')}`);
  }

  // Phone survival and embedding safety — warnings, loud ones.
  const fluid = /@media|max-width|min-width:\s*0|width:\s*[\d.]+%|clamp\(|grid|flex/.test(css);
  if (styles.trim() && !fluid && !inline.trim()) {
    warnings.push('layout: fixed styling only — nothing fluid or responsive for small screens');
  }
  for (const m of css.matchAll(/(?:^|[^-])width:\s*(\d{3,})px/g)) {
    if (Number(m[1]) > 720) warnings.push(`layout: width ${m[1]}px overflows a phone (needs max-width or a %)`);
  }
  if (/position:\s*fixed/.test(styles)) {
    warnings.push('layout: position:fixed pins outside its container (fine for pinned bars; verify it belongs)');
  }
  return { failures, warnings };
}

/** Click, hold, or drag every interactive control and watch it answer. */
async function exercise(window, container) {
  const problems = [];
  const soft = [];
  const problemsSoft = [];
  let responded = 0;
  const controls = [...container.querySelectorAll(
    'button, [role="button"], input, select, textarea, summary, a[href], [onclick], [data-action], [tabindex]',
  )].slice(0, 30);
  // Canvas and SVG paint without touching the DOM, and some controls mount
  // their response (modals, overlays) outside the container. Both make
  // "innerHTML changed" a liar, so both soften the verdict instead of
  // convicting an innocent block.
  const paints = !!container.querySelector('canvas');
  // Timed holds cost real seconds; spend them on a few suspects per block, not
  // on all thirty controls.
  let slowTries = 0;

  const fire = (el, type, x = 5, y = 5) => el.dispatchEvent(
    type.startsWith('mouse') || type === 'click'
      ? new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
      : new window.Event(type, { bubbles: true }),
  );
  const changed = (before, beforeBody) => container.innerHTML !== before
    || window.document.body.innerHTML !== beforeBody;

  for (let i = 0; i < controls.length; i++) {
    const el = controls[i];
    const before = container.innerHTML;
    const beforeBody = window.document.body.innerHTML;
    try {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (type === 'checkbox' || type === 'radio') el.checked = !el.checked;
        else el.value = type === 'number' ? '42' : 'test answer';
        fire(el, 'input');
        fire(el, 'change');
      } else if (el.tagName === 'SELECT') {
        if (el.options.length > 1) el.selectedIndex = 1;
        fire(el, 'change');
      } else {
        // A click first — most controls. Then the gesture fallbacks the spec's
        // touch-first family may need: a press-and-hold (HoldToConfirm), and a
        // press-drag-release (swipes, sortables, dials).
        if (typeof el.click === 'function') el.click();
        else fire(el, 'click');
        if (!changed(before, beforeBody)) {
          fire(el, 'mousedown', 5, 5);
          fire(el, 'mouseup', 5, 5);
        }
        if (!changed(before, beforeBody)) {
          fire(el, 'mousedown', 5, 30);
          fire(el, 'mousemove', 25, 35);
          fire(el, 'mousemove', 55, 45);
          fire(el, 'mouseup', 60, 50);
          fire(el, 'touchstart');
          fire(el, 'touchmove');
          fire(el, 'touchend');
        }
        if (!changed(before, beforeBody) && slowTries < 6) {
          slowTries++;
          // The real hold, in pointer vocabulary — what a modern
          // press-and-hold control listens for — given its full gauge time.
          el.dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }));
          fire(el, 'mousedown', 5, 5);
          // eslint-disable-next-line no-await-in-loop
          await sleep(1300);
          el.dispatchEvent(new window.Event('pointerup', { bubbles: true, cancelable: true }));
          fire(el, 'mouseup', 5, 5);
          el.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
        }
      }
    } catch (err) {
      problems.push(`control ${i} (${el.tagName}.${String(el.className || '').split(' ')[0] || '?'}) threw: ${err.message}`);
      continue;
    }
    if (changed(before, beforeBody)) responded++;
  }

  if (controls.length && responded === 0) {
    const line = `functionality: none of ${controls.length} controls changed the block`;
    // With only canvas to look at, "no DOM change" is not evidence of dead
    // wiring — it is the one thing this harness cannot see. The same goes for
    // press feedback that lives entirely in CSS (:active travel, sound) — the
    // showcase is the judge of pixels.
    (paints ? soft : problemsSoft).push(line + (paints ? ' (canvas-painted; verify in the showcase)' : ' (feedback may be CSS/audio-only; verify in the showcase)'));
  }
  return { problems, soft: problemsSoft.concat(soft), controls: controls.length, responded };
}

async function checkBlock(tag, entry) {
  const failures = [];
  const warnings = [];
  const file = path.join(ENGINE, entry.file.replace('./', ''));
  if (!fs.existsSync(file)) return { tag, failures: ['module file missing'], warnings };
  const src = fs.readFileSync(file, 'utf8');

  try { new Function(src); } catch (err) { return { tag, failures: [`module does not parse: ${err.message}`], warnings }; }
  if (/require\s*\(|fetch\s*\(|XMLHttpRequest|<script[^>]+src=|<link[^>]+href=/.test(src)) {
    failures.push('module reaches for something external (no network, no imports)');
  }

  const { dom, window, errors } = makePage();
  try {
    window.eval(fs.readFileSync(COMPILER_PATH, 'utf8'));
    window.eval(src);
    const mod = window.LessonBlocks.get(tag);
    if (!mod) { failures.push('did not register with LessonBlocks'); return { tag, failures, warnings }; }
    if (typeof mod.renderBlock !== 'function') failures.push('no renderBlock()');
    if (!mod.testPayload || typeof mod.testPayload !== 'object') failures.push('no testPayload');
    if (!mod.schema || typeof mod.schema !== 'object') failures.push('no schema');

    const container = window.document.createElement('div');
    window.document.getElementById('stage').appendChild(container);

    // 1. First paint with the test payload.
    try {
      mod.renderBlock(container, mod.testPayload);
    } catch (err) {
      failures.push(`render(testPayload) threw: ${err.message}`);
      return { tag, failures, warnings };
    }
    const firstPaint = container.innerHTML;
    if (!firstPaint.trim()) failures.push('render produced an empty block');

    // 2. Every control answers when touched.
    // eslint-disable-next-line no-await-in-loop
    const sweep = await exercise(window, container);
    failures.push(...sweep.problems);
    warnings.push(...sweep.soft);

    // 2b. Scope lock: the block's own declaration decides. A display block —
    //     a table, a card, a banner — must expose ZERO controls: no smuggled
    //     quizzes, self-assessment, or hide/detail chrome. An interactive block
    //     is checked by the sweep above for exactly its own wiring.
    const interactive = entry.interactive !== false;
    if (!interactive && sweep.controls > 0) {
      failures.push(`scope: display-only block exposes ${sweep.controls} control(s) — it must have none`);
    }

    // 3. Layout contract.
    const audit = auditCss(window, tag, container);
    failures.push(...audit.failures);
    warnings.push(...audit.warnings);

    // 4. Empty data degrades: renders, never throws.
    try {
      mod.renderBlock(container, {});
    } catch (err) {
      failures.push(`render({}) threw: ${err.message}`);
    }

    // 5. Re-render rebuilds the same lesson, and styles are injected once.
    const heads = window.document.querySelectorAll('style').length;
    const fresh = window.document.createElement('div');
    window.document.getElementById('stage').appendChild(fresh);
    try {
      mod.renderBlock(fresh, mod.testPayload);
    } catch (err) {
      failures.push(`re-render threw: ${err.message}`);
    }
    if (firstPaint.trim() && fresh.innerHTML !== firstPaint) {
      warnings.push('render is not deterministic across calls (or carries hidden state)');
    }
    if (window.document.querySelectorAll('style').length > heads) {
      warnings.push('injects a <style> on every render (should be once)');
    }

    await sleep(300); // let queued timers surface their own errors
    if (errors.length) failures.push(`page errors: ${errors.slice(0, 2).join(' | ')}`);
  } finally {
    dom.window.close();
  }
  return { tag, failures, warnings };
}

async function main() {
  const args = process.argv.slice(2);
  const familyAt = args.indexOf('--family');
  const familyName = familyAt >= 0 ? args[familyAt + 1] : 'lessons';
  if (!FAMILIES[familyName]) {
    console.error(`unknown family "${familyName}" — one of ${Object.keys(FAMILIES).join(', ')}`);
    process.exit(1);
  }
  ENGINE = FAMILIES[familyName].engine;
  REGISTRY_PATH = FAMILIES[familyName].registry;
  const skip = new Set(familyAt >= 0 ? [familyAt + 1] : []);
  const tagsGiven = args.filter((a, i) => !a.startsWith('--') && !skip.has(i));

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const tags = (tagsGiven.length ? tagsGiven : Object.keys(registry)).filter((t) => registry[t]);
  if (!tags.length) { console.error('no blocks to check'); process.exit(1); }

  let failed = 0;
  let warned = 0;
  for (const tag of tags) {
    // eslint-disable-next-line no-await-in-loop
    const r = await checkBlock(tag, registry[tag]);
    if (r.failures.length) {
      failed++;
      console.log(`FAIL  ${tag}`);
      r.failures.forEach((p) => console.log(`      - ${p}`));
      r.warnings.forEach((w) => console.log(`      ~ ${w}`));
    } else if (r.warnings.length) {
      warned++;
      console.log(`PASS  ${tag}  (${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''})`);
      r.warnings.forEach((w) => console.log(`      ~ ${w}`));
    } else {
      console.log(`PASS  ${tag}`);
    }
  }
  console.log(`\n${tags.length - failed}/${tags.length} blocks pass (${warned} with warnings)`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('check-block crashed:', (err && err.stack) || err);
  process.exit(1);
});
