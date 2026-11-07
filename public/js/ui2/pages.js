/* The later pages under UI_V2 (docs/UI-V2.md): the lesson, the subject page, review. Loaded after js/ui2/shell.js by services/ui-v2.js.
 *
 * Each page's own script still draws it, with all its decisions, links and listeners. This only moves what was drawn, puts the giraffe at the head, and folds long notes.
 * A node that moves is the node itself, so nothing is copied and every listener stays. Words in a bubble are read from the page, never written here.
 */
(function () {
  if (!window.App || !App.ui2 || !document.documentElement.hasAttribute('data-ui2')) return;
  const { ic } = App.ui2;
  const Look = App.ui2.look;
  const PAGE = location.pathname.replace(/\.html$/, '');
  const root = document.documentElement;
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  /** The giraffe at the head of a page, with its words in the bubble. Pressing it opens the chat, as the top bar's does. */
  function pageGuide(words) {
    const g = el('div', 'u2-guide u2-page-guide');
    g.innerHTML = '<button type="button" class="u2-gh"></button><div class="u2-tailwrap"><div class="u2-bubble"></div></div>';
    const host = document.createElement('span');
    g.querySelector('.u2-gh').appendChild(host);
    Look.giraffe(host, { crop: window.matchMedia('(min-width: 768px)').matches ? 'full' : 'bust' });
    Look.bind(g.querySelector('.u2-gh'));
    g.querySelector('.u2-bubble').textContent = words;
    return g;
  }
  function setTitle(words, backHref) {
    const t = document.getElementById('u2-tb-t');
    if (t && words) t.textContent = words;
    const b = document.getElementById('u2-back');
    if (b && backHref) b.setAttribute('href', backHref);
  }
  /** A fold for the long notes, shut until asked for. */
  function fold(summary, nodes) {
    const d = el('details', 'u2-fold');
    d.appendChild(el('summary', '', `${App.escapeHtml(summary)}${ic('chev-d')}`));
    const body = el('div', 'u2-fold-body');
    nodes.forEach((n) => { if (n) body.appendChild(n); });
    d.appendChild(body);
    return d;
  }

  // ── the subject page: where you are, the next thing, then the whole grade ──
  function dressPath() {
    const host = document.getElementById('root');
    const top = host && host.querySelector(':scope > .path-top');
    if (!top || top.dataset.u2) return;
    top.dataset.u2 = '1';
    root.classList.add('u2-path');
    const h1 = top.querySelector('.track-heading h1');
    setTitle(h1 && h1.textContent.trim());
    const heading = top.querySelector('.track-heading');
    const hero = top.querySelector('.path-hero');
    const scale = top.querySelector('.scale');
    const banner = top.querySelector('.catch-banner');
    const catchup = top.querySelector('[data-catchup-link]');
    const chess = top.querySelector('nav.row-wrap');
    const heroBody = hero && hero.querySelector('.hero-body');

    // The ruler's caption says three things: where you are (the bubble says it now), what is next, and what the marks mean (in the fold).
    const cap = scale && scale.querySelector('figcaption');
    const said = cap ? cap.textContent.trim() : '';
    const sentences = said.match(/[^.]+\.(\s|$)/g) || [];
    const where = (sentences.find((s) => /^Level\b/.test(s)) || '').trim();
    const legend = sentences.filter((s) => /Diamonds|flag/.test(s)).join(' ').trim();
    if (cap) cap.textContent = sentences.filter((s) => !/^Level\b/.test(s) && !/Diamonds|flag/.test(s)).join(' ').trim();
    if (cap && !cap.textContent) cap.hidden = true;

    const lead = el('div', 'u2-lead');
    lead.appendChild(pageGuide(where || 'Your path.'));
    if (hero) lead.appendChild(hero);
    top.prepend(lead);
    const facts = el('div', 'u2-path-facts');
    if (heroBody && heroBody.textContent.trim()) facts.appendChild(heroBody);
    if (scale) facts.appendChild(scale);
    if (heading) lead.insertBefore(heading, hero);
    if (facts.children.length) lead.after(facts);
    if (banner) facts.before(banner);
    const links = el('div', 'u2-rows u2-path-links');
    if (catchup) {
      const a = catchup.querySelector('a');
      if (a) {
        const row = el('a', 'u2-opt u2-s-row', `${ic('loop')}<span class="u2-o-t"><b>${App.escapeHtml(a.textContent.trim())}</b><small>Learn only what you are missing.</small></span>${ic('chev-r', 'u2-mute')}`);
        row.href = a.getAttribute('href');
        row.setAttribute('data-catchup-link', '');
        catchup.replaceWith(row);
        links.appendChild(row);
      }
    }
    if (chess) {
      chess.querySelectorAll('a').forEach((a) => {
        a.classList.add('u2-opt', 'u2-s-row');
        a.innerHTML = `${ic('pawn')}<span class="u2-o-t"><b>${App.escapeHtml(a.textContent.trim())}</b></span>${ic('chev-r', 'u2-mute')}`;
      });
      chess.classList.add('u2-rows');
      chess.classList.remove('row-wrap', 'tiny');
      chess.removeAttribute('style');
      links.appendChild(chess);
    }
    if (links.children.length) top.appendChild(links);

    // The whole grade, then the skills, then one fold for the notes.
    const titles = [...host.querySelectorAll(':scope > h2.section-title')];
    const pathTitle = titles.find((h) => h.textContent.trim() === 'The path');
    if (pathTitle) { pathTitle.textContent = 'The whole grade'; pathTitle.id = 'u2-grade-h'; }
    const about = [...host.querySelectorAll(':scope > p.tiny.muted')].pop();
    const table = host.querySelector(':scope > .table-scroll');
    if (about && table && about.previousElementSibling === table) {
      const legendP = legend ? el('p', 'u2-s', App.escapeHtml(legend)) : null;
      about.after(fold('About this grade', [about.cloneNode(true), legendP]));
      about.remove();
    } else if (legend && scale) {
      facts.appendChild(fold('What the marks mean', [el('p', 'u2-s', App.escapeHtml(legend))]));
    }
  }

  // ── the lesson: title over the frame, the way back in the top bar, how it was made in a fold under it ──
  function dressLesson() {
    const host = document.getElementById('root');
    const headRow = host && host.querySelector(':scope > .row-between');
    if (!headRow || !document.getElementById('base-lesson-host') || headRow.dataset.u2) return;
    headRow.dataset.u2 = '1';
    root.classList.add('u2-lesson');
    const back = headRow.querySelector(':scope > a.btn');
    setTitle('Lesson', back && back.getAttribute('href'));
    const note = [...host.querySelectorAll(':scope > .card')].find((c) => c.nextElementSibling && c.nextElementSibling.id === 'base-lesson-host');
    if (note) {
      const f = fold('About this lesson', [note]);
      f.classList.add('u2-lesson-note');
      host.appendChild(f);
    }
  }

  let queued = false;
  function tick() {
    queued = false;
    if (PAGE === '/path') dressPath();
    if (PAGE === '/base-lesson') dressLesson();
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(tick); } }
  function start() {
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
    queue();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}());
