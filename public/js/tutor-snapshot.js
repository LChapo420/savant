/* What the tutor can see: a structured text snapshot of the learner's own Savant page.
 *
 *   TutorSnapshot.build(root?, opts?) -> { v, scroll, headings, blocks, choices, inputs, feedback, visuals }
 *
 * Reads only this page's DOM (never other tabs or the device screen). Values the learner typed in
 * password or hidden fields are never read. Text is clipped here and again on the server
 * (services/tutor-screen.js). Loaded by js/tutor-dock.js; also usable from node with a DOM (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TutorSnapshot = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const LIMITS = { block: 400, blocks: 8, choices: 8, choice: 120, inputs: 6, feedback: 3, visuals: 4 };
  const SKIP = 'script, style, noscript, template, nav, header, footer, .tdock-panel, .tdock-btn, [aria-hidden="true"], [hidden]';
  const FEEDBACK = '[role="alert"], [role="status"], [aria-live], .feedback, .correct, .wrong, .incorrect, .result, .explain, .explanation';
  const CHOICE = '[role="radio"], [role="option"], [role="checkbox"], .choice, .option, .answer-option, button[data-choice], label:has(input[type=radio]), label:has(input[type=checkbox])';
  const VISUAL = 'canvas, svg, img, [role="img"], .chessboard, .board, .piano, .keyboard';

  const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

  function visible(el) {
    if (!el || el.closest(SKIP)) return false;
    const st = el.ownerDocument.defaultView && el.ownerDocument.defaultView.getComputedStyle ? el.ownerDocument.defaultView.getComputedStyle(el) : null;
    return !(st && (st.display === 'none' || st.visibility === 'hidden'));
  }

  function selected(el) {
    if (el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true') return true;
    if (/\b(selected|chosen|active|checked)\b/.test(el.className || '')) return true;
    const input = el.matches('input') ? el : el.querySelector('input');
    return !!(input && input.checked);
  }

  function labelOf(el) {
    const id = el.id && el.ownerDocument.querySelector(`label[for="${el.id.replace(/"/g, '')}"]`);
    return clip((id && id.textContent) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '', 80);
  }

  function build(rootEl, opts) {
    const o = opts || {};
    const doc = (rootEl && rootEl.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    if (!doc) return { v: 1, blocks: [], choices: [], inputs: [], feedback: [], visuals: [], headings: [] };
    const main = rootEl || doc.querySelector('main') || doc.body;
    const win = doc.defaultView;
    const seen = new Set();
    const take = (nodes) => nodes.filter((n) => visible(n) && !seen.has(n));

    const headings = take([...main.querySelectorAll('h1, h2, h3')]).map((h) => clip(h.textContent, 100)).filter(Boolean).slice(0, 4);

    const choiceEls = take([...main.querySelectorAll(CHOICE)]);
    const choices = [];
    for (const el of choiceEls) {
      const text = clip(el.textContent || el.value, LIMITS.choice);
      if (!text || choices.some((c) => c.text === text)) continue;
      seen.add(el);
      choices.push({ text, selected: selected(el) });
      if (choices.length >= LIMITS.choices) break;
    }

    const feedbackEls = take([...main.querySelectorAll(FEEDBACK)]);
    const feedback = [];
    for (const el of feedbackEls) {
      const text = clip(el.textContent, 200);
      if (text && !feedback.includes(text)) { feedback.push(text); seen.add(el); }
      if (feedback.length >= LIMITS.feedback) break;
    }

    const inputs = [];
    for (const el of take([...main.querySelectorAll('input, textarea, select')])) {
      const type = (el.getAttribute('type') || el.tagName).toLowerCase();
      if (['password', 'hidden', 'radio', 'checkbox', 'submit', 'button', 'file'].includes(type)) continue;
      const value = clip(el.value, 200);
      inputs.push({ label: labelOf(el), value });
      if (inputs.length >= LIMITS.inputs) break;
    }

    // The question and passage text: block elements with text of their own, in reading order, minus what was taken above.
    const inChosen = (n) => [...seen].some((s) => s.contains(n));
    const blocks = [];
    for (const el of main.querySelectorAll('p, li, blockquote, pre, td, .prompt, .question, .passage, .stem, h1, h2, h3')) {
      if (blocks.length >= LIMITS.blocks) break;
      if (!visible(el) || inChosen(el) || el.closest('button, select, textarea')) continue;
      const own = clip(el.textContent, LIMITS.block);
      if (own.length < 3 || blocks.includes(own)) continue;
      blocks.push(own);
    }

    const visuals = [];
    for (const el of take([...main.querySelectorAll(VISUAL)])) {
      const label = clip(el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title') || '', 80);
      const tag = el.tagName.toLowerCase();
      // A decorative icon is not worth a picture; a canvas, a board or a labelled image is.
      if (tag === 'svg' || tag === 'img') { const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 }; if (r.width < 120 && r.height < 120) continue; }
      visuals.push({ kind: tag === 'canvas' ? 'canvas' : (el.className && String(el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(/\s+/)[0]) || tag, label });
      if (visuals.length >= LIMITS.visuals) break;
    }

    let scroll = null;
    if (win && doc.documentElement) {
      const h = Math.max(1, doc.documentElement.scrollHeight - (win.innerHeight || 0));
      scroll = { percent: Math.max(0, Math.min(100, Math.round(((win.scrollY || 0) / h) * 100))) };
    }
    return { v: 1, scroll, headings, blocks, choices, inputs, feedback, visuals, lang: o.lang || (doc.documentElement && doc.documentElement.lang) || '' };
  }

  /** A page area to send to a vision model: the first canvas as a small JPEG (about 30 KB at most; the server refuses bigger), or null. Never the whole device. */
  function capture(rootEl) {
    const doc = (rootEl && rootEl.ownerDocument) || document;
    const c = (rootEl || doc.querySelector('main') || doc.body).querySelector('canvas');
    if (!c || !c.toDataURL) return null;
    try {
      const scale = Math.min(1, 320 / Math.max(c.width, 1));
      const out = doc.createElement('canvas');
      out.width = Math.max(1, Math.round(c.width * scale));
      out.height = Math.max(1, Math.round(c.height * scale));
      out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.5);
    } catch { return null; }
  }

  return { build, capture, LIMITS };
}));
