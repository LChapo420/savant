/* What a learner does inside a level, for their record.
 *
 * Most of the site's blocks — and every creator-made lesson page — check the
 * learner's answers in the browser and tell nobody. That work is the most
 * direct evidence there is of how they are doing, so this watches each part of
 * a level and keeps, per part:
 *
 *   ms            how long it was on screen
 *   interactions  how many times they acted on it
 *   log           what they did, in a few words each: what they tapped, what
 *                 they typed (never a password field), in order, capped
 *   right/wrong   how often the part itself marked something right or wrong —
 *                 read off the classes a block puts on an element when it shows
 *                 a verdict (correct / success / wrong / trap / error ...)
 *
 * It is sent with the finish, and again if the learner leaves without
 * finishing, so a level walked away from still reaches the record.
 */
(function () {
  const RIGHT = /(^|[\s_-])(correct|is-right|right|success|solved|win)(\b|_|-)/i;
  const WRONG = /(^|[\s_-])(wrong|incorrect|is-wrong|trap|error|miss|fail|lose)(\b|_|-)/i;
  const LOG_CAP = 25;

  function label(el) {
    const target = el.closest('button,[role="button"],label,a,option,li,td,[data-choice],[data-option],[draggable="true"]') || el;
    const text = (target.getAttribute('aria-label') || target.innerText || target.value || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 60);
  }

  /**
   * Watch these sections. Each is one part of the level; `name(section)` says
   * what to call it in the record. Returns report(), which can be called any
   * number of times.
   */
  function watch(sections, { name = (s) => s.getAttribute('data-block') || 'the page', skip = () => false } = {}) {
    const now = () => Date.now();
    const parts = sections.map((section, index) => ({
      index,
      block: name(section),
      ms: 0,
      interactions: 0,
      log: [],
      right: 0,
      wrong: 0,
      since: null,
      skip: skip(section),
    }));

    const note = (part, text) => {
      if (!text || part.log.length >= LOG_CAP) return;
      if (part.log[part.log.length - 1] === text) return;
      part.log.push(text);
    };

    if ('IntersectionObserver' in window) {
      const seen = new IntersectionObserver((rows) => {
        rows.forEach((row) => {
          const part = parts[sections.indexOf(row.target)];
          if (!part) return;
          if (row.isIntersecting && row.intersectionRatio >= 0.4) {
            if (part.since === null) part.since = now();
          } else if (part.since !== null) {
            part.ms += now() - part.since;
            part.since = null;
          }
        });
      }, { threshold: [0, 0.4, 1] });
      sections.forEach((s) => seen.observe(s));
    }

    sections.forEach((section, i) => {
      const part = parts[i];
      section.addEventListener('click', (e) => {
        part.interactions += 1;
        if (!part.skip) note(part, `tapped "${label(e.target)}"`);
      }, true);
      section.addEventListener('change', (e) => {
        const t = e.target;
        if (!t || t.type === 'password') return;
        part.interactions += 1;
        if (part.skip) return;
        const value = t.type === 'checkbox' || t.type === 'radio' ? (t.checked ? 'on' : 'off') : String(t.value || '');
        note(part, `${t.type === 'range' ? 'set' : 'entered'} "${value.replace(/\s+/g, ' ').trim().slice(0, 60)}"`);
      }, true);
      section.addEventListener('keydown', (e) => { if (e.key === 'Enter') part.interactions += 1; }, true);

      // A verdict shown by the part itself: an element gaining a "right" or
      // "wrong" class after the learner did something. Each element counts once.
      if (!part.skip && 'MutationObserver' in window) {
        const counted = new WeakSet();
        new MutationObserver((changes) => {
          if (!part.interactions) return;
          changes.forEach((c) => {
            const el = c.target;
            if (!(el instanceof Element) || counted.has(el)) return;
            const cls = typeof el.className === 'string' ? el.className : '';
            if (RIGHT.test(cls) && !WRONG.test(cls)) { counted.add(el); part.right += 1; }
            else if (WRONG.test(cls)) { counted.add(el); part.wrong += 1; }
          });
        }).observe(section, { attributes: true, attributeFilter: ['class'], subtree: true });
      }
    });

    return function report() {
      return parts.map((p) => ({
        index: p.index,
        block: p.block,
        ms: p.ms + (p.since !== null ? now() - p.since : 0),
        interactions: p.interactions,
        log: p.log.slice(),
        right: Math.min(p.right, 200),
        wrong: Math.min(p.wrong, 200),
      }));
    };
  }

  /** Send a report even as the page closes. */
  function sendOnLeave(url, build) {
    let sent = false;
    const send = () => {
      if (sent) return;
      const body = build();
      if (!body) return;
      sent = true;
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'same-origin',
          keepalive: true,
        }).catch(() => {});
      } catch (err) { /* the finish route records it anyway when there is one */ }
    };
    // Every send is the whole report so far, and the server keeps the latest, so
    // sending again after the learner comes back to the tab loses nothing.
    let cancelled = false;
    window.addEventListener('pagehide', () => { if (!cancelled) send(); });
    document.addEventListener('visibilitychange', () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') send();
      else sent = false;
    });
    return { cancel() { cancelled = true; sent = true; } };
  }

  window.LevelCapture = { watch, sendOnLeave };
}());
