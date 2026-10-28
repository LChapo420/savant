'use strict';
/**
 * The admin page's Visitors tab: server-rendered HTML from analytics-report.js.
 * Every value is HTML-escaped. Bars are <progress> elements styled by site.css
 * (the admin CSP allows no inline styles); the globe is drawn by
 * /donteventry/assets/visitors.js from the data-points attribute, and the list
 * under it carries the same data for anyone without the canvas.
 */

const regionName = (() => {
  let dn = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { /* no ICU */ }
  return (cc) => { if (!cc) return ''; try { return (dn && dn.of(cc)) || cc; } catch (e) { return cc; } };
})();

const SOURCE_LABEL = {
  direct: 'Direct', internal: 'Within the site', email: 'Email', google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', yahoo: 'Yahoo',
  instagram: 'Instagram', facebook: 'Facebook', x: 'X / Twitter', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', reddit: 'Reddit',
};
const FORM_LABEL = { updates: 'Updates', beta: 'Beta', investors: 'Investors', remove: 'Remove my details' };
const PERF_LABEL = { ttfb: 'Time to first byte', dom: 'DOM ready', load: 'Page load', lcp: 'Largest Contentful Paint (LCP)', cls: 'Cumulative Layout Shift (CLS)', inp: 'Interaction to Next Paint (INP)' };
const EV_LABEL = { sc: 'Scrolled to', sd: 'Deepest scroll', si: 'Saw section', st: 'Time on section', tm: 'Time', cl: 'Click', rc: 'Rage click', dc: 'Dead click', fv: 'Saw form', ff: 'Focused field', ve: 'Error shown', fs: 'Pressed submit', fd: 'Form sent', fa: 'Left the form', pf: 'Load timing', wv: 'Web Vitals', er: 'Script error' };

function renderVisitors({ stats: S, detail, q, ip, esc, ADMIN_PATH, tabs, idleMinutes }) {
  const num = (n) => (n == null ? '–' : Number(n).toLocaleString('en'));
  const secs = (ms) => (ms == null ? '–' : ms < 10000 ? `${(ms / 1000).toFixed(1)} s` : ms < 3600000 ? `${Math.round(ms / 1000)} s` : `${(ms / 3600000).toFixed(1)} h`);
  const iso = (sec) => new Date(sec * 1000).toISOString();
  const when = (sec) => {
    const s = iso(sec);
    return `<time datetime="${esc(s)}"><span>${esc(s.slice(0, 10))}</span> <span>${esc(s.slice(11, 16))} UTC</span></time>`;
  };
  const src = (k) => esc(SOURCE_LABEL[k] || k);
  const vlink = (v) => `${ADMIN_PATH}?form=visitors&ip=${encodeURIComponent(v)}${q ? `&q=${encodeURIComponent(q)}` : ''}#visitor`;
  const place = (a) => [a.city, regionName(a.cc)].filter(Boolean).join(', ');
  const device = (d) => {
    if (!d) return '';
    const os = d.os ? `${d.os}${d.osv ? ` ${d.osv}` : ''}` : '';
    const br = d.br ? `${d.br}${d.brv ? ` ${d.brv}` : ''}` : '';
    return [d.type, d.model, os, br].filter(Boolean).join(', ');
  };
  const empty = (msg) => `<p class="admin-empty">${esc(msg)}</p>`;

  /** A horizontal bar list: label, bar, value. rows: [[label(html), n, extra(html)?]]. */
  function bars(title, rows, { id, note, unit = '', max } = {}) {
    if (!rows.length) return `<figure class="vis-figure"${id ? ` id="${esc(id)}"` : ''}><figcaption>${esc(title)}</figcaption>${empty('Nothing yet.')}</figure>`;
    const top = max || Math.max(...rows.map((r) => r[1]), 1);
    const items = rows.map(([label, n, extra]) => `<li><span class="vis-bar-label" title="${label.replace(/<[^>]*>/g, '')}">${label}</span><progress class="vis-bar" max="${top}" value="${n}" aria-hidden="true"></progress><span class="vis-bar-n num">${esc(num(n))}${esc(unit)}${extra ? ` <span class="muted">${extra}</span>` : ''}</span></li>`).join('');
    return `<figure class="vis-figure"${id ? ` id="${esc(id)}"` : ''}><figcaption>${esc(title)}</figcaption><ol class="vis-bars">${items}</ol>${note ? `<p class="vis-note">${note}</p>` : ''}</figure>`;
  }
  function table(caption, head, rows, cls = '') {
    if (!rows.length) return `<div class="vis-table"><h3>${esc(caption)}</h3>${empty('Nothing yet.')}</div>`;
    const th = head.map((h) => `<th scope="col">${esc(h)}</th>`).join('');
    const body = rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(head[i])}"${c === '' ? ' class="is-empty"' : ''}>${c}</td>`).join('')}</tr>`).join('\n');
    return `<div class="vis-table"><h3>${esc(caption)}</h3><div class="admin-table-wrap"><table class="admin-table ${cls}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  }
  const convRows = (rows, label) => rows.map((r) => [label(r.key), `<span class="num">${esc(num(r.visitors))}</span>`, `<span class="num">${esc(num(r.converted))}</span>`, `<span class="num">${esc(r.rate.toFixed(1))}%</span>`]);
  const section = (id, title, inner, intro) => `    <section class="vis-section" id="${esc(id)}" aria-labelledby="${esc(id)}-h">
      <h2 id="${esc(id)}-h">${esc(title)}</h2>
      ${intro ? `<p class="muted vis-intro">${intro}</p>` : ''}
${inner}
    </section>`;

  /* summary */
  const s = S.summary;
  const tiles = [
    ['Total visits', num(s.visits), 'page views, identified and anonymous'],
    ['Unique visitors', num(s.unique), 'by IP address'],
    ['Anonymous visits', num(s.anonymous), 'UK/EU without consent, GPC, opted out'],
    ['Countries', num(s.countries), ''],
    ['Sessions', num(s.sessions), `${esc(String(s.pagesPerSession))} pages per session`],
    ['Returning visitors', num(s.returning), `${num(s.new)} new`],
  ].map(([k, v, sub]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd>${sub ? `<dd class="vis-sub">${sub}</dd>` : ''}</div>`).join('');

  /* globe */
  const pts = S.locations.slice(0, 600).map((l) => [l.lat, l.lon, l.n, [l.city, regionName(l.cc)].filter(Boolean).join(', ') || regionName(l.cc)]);
  const maxN = S.locations.length ? S.locations[0].n : 0;
  const legendSizes = maxN > 1 ? [1, Math.max(2, Math.round(maxN / 4)), maxN].filter((v, i, a) => a.indexOf(v) === i) : [1];
  // Same absolute scale as the globe (admin-assets/visitors.js radius()).
  const r = (n) => Math.min(10, 2.3 + 1.2 * Math.sqrt(n)).toFixed(1);
  const legend = legendSizes.map((n) => `<li><svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="${r(n)}"/></svg><span class="num">${esc(num(n))}</span> visitor${n === 1 ? '' : 's'}</li>`).join('');
  const locList = S.locations.slice(0, 15).map((l) => `<li><span>${esc([l.city, regionName(l.cc)].filter(Boolean).join(', ') || 'Unknown')}</span><span class="num">${esc(num(l.n))}</span></li>`).join('');
  const globe = `      <div class="vis-globe-wrap">
        <div class="vis-globe" data-globe data-points="${esc(JSON.stringify(pts))}" data-land="${ADMIN_PATH}/assets/land.json" data-borders="${ADMIN_PATH}/assets/borders.json" data-states="${ADMIN_PATH}/assets/states.json">
          <canvas class="vis-globe-canvas" width="520" height="520" tabindex="0" role="img" aria-label="A globe with a dot for each place visitors came from. Drag or use the arrow keys to turn it; scroll, pinch or press plus and minus to zoom. The list beside it has the same data."></canvas>
          <p class="vis-tip" data-globe-tip role="status" aria-live="polite" hidden></p>
          <p class="vis-globe-nojs muted" data-globe-nojs>The globe needs JavaScript. The list has the same data.</p>
        </div>
        <div class="vis-globe-side">
          <h3>Legend</h3>
          <ul class="vis-legend">${legend}</ul>
          <p class="vis-note">Dots group visitors within about 1&deg;; the area grows with the number of visitors. Hover or tap a dot for its place and count.</p>
          <h3>Top locations</h3>
          ${locList ? `<ol class="vis-loclist">${locList}</ol>` : empty('No located visitors yet.')}
        </div>
      </div>`;

  /* sources and devices */
  const sourceBars = bars('Visits by source', S.bySource.map(([k, n]) => [src(k), n]), {
    note: `Includes anonymous visits. ${S.summary.internal ? `${esc(num(S.summary.internal))} page views came from links within the site and are not counted as a source.` : ''}`,
  });
  const convSrc = table('Conversion by source', ['Source', 'Visitors', 'Submitted a form', 'Conversion'], convRows(S.convSource, src));
  const devBars = `<div class="vis-grid3">${bars('By device type', S.byType.map(([k, n]) => [esc(k), n]), { note: 'Includes anonymous visits.' })}${bars('By operating system', S.byOS.map(([k, n]) => [esc(k), n]))}${bars('By browser', S.byBrowser.map(([k, n]) => [esc(k), n]))}</div>`;
  const convDev = table('Conversion by device type', ['Device', 'Visitors', 'Submitted a form', 'Conversion'], convRows(S.convDevice, (k) => esc(k)));
  const models = table('Device models', ['Model', 'Page views'], S.byModel.map(([k, n]) => [esc(k), `<span class="num">${esc(num(n))}</span>`]));

  /* engagement */
  const E = S.engagement;
  const engagement = `      <dl class="vis-summary vis-summary-sm">
        <div><dt>Average active time</dt><dd class="num">${esc(secs(E.activeAvgMs))}</dd><dd class="vis-sub">visible, focused, not idle 30 s</dd></div>
        <div><dt>Average time on page</dt><dd class="num">${esc(secs(E.totalAvgMs))}</dd></div>
        <div><dt>Pages per session</dt><dd class="num">${esc(String(s.pagesPerSession))}</dd></div>
      </dl>
      <div class="vis-grid2">
        ${bars('Scroll depth: share of page views reaching', E.scroll.map((x) => [`${x.m}%`, x.share, `(${esc(num(x.n))})`]), { unit: '%', max: 100 })}
        ${bars('Most-viewed sections', E.sections.map((x) => [`#${esc(x.id)}`, x.n, x.avgMs != null ? `avg ${esc(secs(x.avgMs))} in view` : '']))}
      </div>
      <div class="vis-grid2">
        ${table('Entry pages', ['Page', 'Sessions'], S.entry.map(([k, n]) => [esc(k), `<span class="num">${esc(num(n))}</span>`]))}
        ${table('Exit pages', ['Page', 'Sessions'], S.exit.map(([k, n]) => [esc(k), `<span class="num">${esc(num(n))}</span>`]))}
      </div>
      ${table('Conversion by entry page', ['Entry page', 'Visitors', 'Submitted a form', 'Conversion'], convRows(S.convEntry, (k) => esc(k)))}`;

  /* forms */
  const formsHtml = S.forms.map((f) => {
    const first = f.steps[0].n || Math.max(...f.steps.map((x) => x.n), 0);
    const steps = f.steps.map((x) => [esc(x.label), x.n, x.drop != null ? `${esc(x.drop.toFixed(1))}% drop` : '']);
    const ab = f.abandon.length ? `<p class="vis-note">Last field before leaving: ${f.abandon.map(([k, n]) => `${esc(k)} <span class="num">(${esc(num(n))})</span>`).join(', ')}</p>` : '';
    const er = f.errors.length ? `<p class="vis-note">Errors shown: ${f.errors.map(([k, n]) => `${esc(k)} <span class="num">(${esc(num(n))})</span>`).join(', ')}</p>` : '';
    const a = f.anon;
    const an = Object.values(a).some(Boolean) ? `<p class="vis-note">Anonymous: seen ${esc(num(a.seen))}, started ${esc(num(a.start))}, submit pressed ${esc(num(a.submit))}, sent ${esc(num(a.done))}, left ${esc(num(a.abandon))}.</p>` : '';
    return `<div class="vis-funnel">${bars(`${FORM_LABEL[f.name] || f.name} form`, steps, { max: first || 1 })}<p class="vis-note">Median time from first focus to sent: ${esc(secs(f.ttcMedian))}.</p>${ab}${er}${an}</div>`;
  }).join('');

  /* clicks */
  const clickRows = S.clicks.map((c) => [esc(c.id || '(no label)'), esc(c.c), esc(c.to || ''), `<span class="num">${esc(num(c.n))}</span>`]);
  const rageRows = (list) => list.map((x) => [esc(x.page), esc(x.s ? `#${x.s}` : ''), esc(x.id || ''), `<span class="num">${esc(num(x.n))}</span>`]);
  const clicks = `      ${table('Top clicked elements', ['Element', 'Kind', 'Goes to', 'Clicks'], clickRows)}
      <div class="vis-grid2">
        ${bars('Outbound clicks by destination', S.outbound.map(([k, n]) => [esc(k), n]))}
        <figure class="vis-figure"><figcaption>Other clicks</figcaption>
          <dl class="vis-kv"><div><dt>Email (mailto) links</dt><dd class="num">${esc(num(S.mailto))}</dd></div><div><dt>Theme toggle</dt><dd class="num">${esc(num(S.theme))}</dd></div>
          ${S.nav.map(([k, n]) => `<div><dt>Nav: ${esc(k)}</dt><dd class="num">${esc(num(n))}</dd></div>`).join('')}
          ${S.ev.map(([k, n]) => `<div><dt>Evidence: ${esc(k)}</dt><dd class="num">${esc(num(n))}</dd></div>`).join('')}
          ${S.anonClicks.map(([k, n]) => `<div><dt>Anonymous ${esc(k)} clicks</dt><dd class="num">${esc(num(n))}</dd></div>`).join('')}</dl>
        </figure>
      </div>
      <div class="vis-grid2">
        ${table('Rage clicks', ['Page', 'Section', 'Element', 'Times'], rageRows(S.rage))}
        ${table('Dead clicks', ['Page', 'Section', 'Element', 'Times'], rageRows(S.dead))}
      </div>`;

  /* performance */
  const perfRows = S.perf.map((p) => {
    const f = (v) => (v == null ? '–' : p.k === 'cls' ? (v / 1000).toFixed(3) : `${num(v)} ms`);
    return [esc(PERF_LABEL[p.k]), `<span class="num">${esc(f(p.median))}</span>`, `<span class="num">${esc(f(p.p75))}</span>`, `<span class="num">${esc(num(p.n))}</span>`];
  });
  const errRows = S.errors.map((e) => [esc(e.m || '(no message)'), `<span class="admin-email">${esc(e.at || '')}</span>`, `<span class="num">${esc(num(e.n))}</span>`, when(e.last), esc(e.pages.join(', '))]);
  const perf = `      ${table('Speed (identified page views)', ['Measure', 'Median', '75th percentile', 'Samples'], perfRows)}
      ${table('Script errors', ['Message', 'File:line', 'Times', 'Last', 'Pages'], errRows)}
      ${table('Pages not found (404)', ['Path', 'Hits'], S.notFound.map(([k, n]) => [esc(k), `<span class="num">${esc(num(n))}</span>`]))}`;

  /* visitors */
  const needle = (q || '').toLowerCase();
  const people = (a) => a.people.map((p) => `${p.name ? `${esc(p.name)}, ` : ''}<span class="admin-email">${esc(p.email)}</span> <span class="muted">(${esc(FORM_LABEL[p.form] || p.form)})</span>`).join('<br>');
  let list = S.visitors;
  if (needle) {
    list = list.filter((a) => [a.ip, place(a), device(a.dev), ...a.people.flatMap((p) => [p.name, p.email]), ...Object.keys(a.src), ...Object.keys(a.pages)]
      .some((x) => String(x || '').toLowerCase().includes(needle)));
  }
  const matched = list.length;
  list = list.slice(0, 300);
  const vrows = list.map((a) => {
    const href = vlink(a.ip);
    const sources = Object.entries(a.src).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${src(k)} <span class="num">${esc(num(n))}</span>`).join(', ');
    const pages = Object.entries(a.pages).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => `${esc(k)} <span class="num">${esc(num(n))}</span>`).join(', ');
    return `<tr data-row data-href="${esc(href)}"${a.ip === ip ? ' aria-current="true"' : ''}>`
      + `<td data-label="IP" class="admin-email"><a href="${esc(href)}">${esc(a.ip)}</a></td>`
      + `<td data-label="Name and email"${a.people.length ? '' : ' class="is-empty"'}>${people(a) || '<span class="muted">&ndash;</span>'}</td>`
      + `<td data-label="Location"${place(a) ? '' : ' class="is-empty"'}>${esc(place(a)) || '<span class="muted">&ndash;</span>'}</td>`
      + `<td data-label="Device" class="admin-ua">${esc(device(a.dev))}</td>`
      + `<td data-label="First seen" class="admin-when">${when(a.first)}</td>`
      + `<td data-label="Last seen" class="admin-when">${when(a.last)}</td>`
      + `<td data-label="Visits" class="num">${esc(num(a.n))}</td>`
      + `<td data-label="Sources">${sources || '<span class="muted">internal</span>'}</td>`
      + `<td data-label="Pages" class="admin-long">${pages}</td></tr>`;
  }).join('\n');
  const vhead = ['IP', 'Name and email', 'Location', 'Device', 'First seen', 'Last seen', 'Visits', 'Sources', 'Pages'].map((h) => `<th scope="col">${esc(h)}</th>`).join('');
  const shown = matched > list.length ? `Showing the ${list.length} with the most visits of ${matched}.` : `${num(matched)} visitor${matched === 1 ? '' : 's'}${q ? ` matching "${esc(q)}"` : ''}.`;
  const visitorsHtml = `      <form class="admin-search" method="get" action="${ADMIN_PATH}" role="search">
        <input type="hidden" name="form" value="visitors">
        <label for="vis-q" class="visually-hidden">Search visitors</label>
        <input type="search" id="vis-q" name="q" value="${esc(q || '')}" maxlength="200" placeholder="Search IP, name, email, place, source, page" data-admin-filter>
        <button class="btn" type="submit">Search</button>
        ${q ? `<a class="btn" href="${ADMIN_PATH}?form=visitors#top-visitors">Clear</a>` : ''}
      </form>
      <p class="admin-count" data-admin-count>${shown} Select a row for that visitor's history.</p>
      ${list.length ? `<div class="admin-table-wrap"><table class="admin-table vis-visitors" data-row-links><thead><tr>${vhead}</tr></thead><tbody>
${vrows}
      </tbody></table></div>` : empty(q ? 'No visitor matches that search.' : 'No identified visitors yet.')}`;

  /* one visitor */
  let detailHtml = '';
  if (detail) {
    const evText = (e) => {
      const at = `<span class="num">${esc(((e.o || 0) / 10).toFixed(1))} s</span>`;
      const l = EV_LABEL[e.k] || e.k;
      let what = '';
      if (e.k === 'sc') what = `${e.m}%`;
      else if (e.k === 'sd') what = `${e.d}%`;
      else if (e.k === 'si' || e.k === 'st') what = `#${e.s}${e.ms != null ? ` for ${secs(e.ms)}` : ''}`;
      else if (e.k === 'tm') what = `active ${secs(e.a)} of ${secs(e.t)}`;
      else if (e.k === 'cl' || e.k === 'rc' || e.k === 'dc') what = `${e.i || '(no label)'}${e.to ? ` → ${e.to}` : ''}${e.s ? ` in #${e.s}` : ''}${e.c ? ` (${e.c})` : ''}`;
      else if (['fv', 'fs', 'fd', 'ff', 've', 'fa'].includes(e.k)) what = `${FORM_LABEL[e.f] || e.f}${e.n ? `: ${e.n}` : ''}${e.e ? ` (${e.e})` : ''}${e.ms != null ? `, ${secs(e.ms)} after first focus` : ''}`;
      else if (e.k === 'pf') what = `first byte ${e.b ?? '–'} ms, DOM ${e.d ?? '–'} ms, load ${e.l ?? '–'} ms`;
      else if (e.k === 'wv') what = `LCP ${e.lcp ?? '–'} ms, CLS ${e.cls != null ? (e.cls / 1000).toFixed(3) : '–'}, INP ${e.inp ?? '–'} ms`;
      else if (e.k === 'er') what = `${e.m} at ${e.at}`;
      return `<li>${at} ${esc(l)} <span class="muted">${esc(what)}</span></li>`;
    };
    const sess = detail.sessions.slice(0, 50).map((ss, i) => {
      const views = ss.views.map((v) => {
        const how = [src(v.source), v.ref ? esc(v.ref) : '', v.utm.source || v.utm.medium || v.utm.campaign ? `utm ${esc([v.utm.source, v.utm.medium, v.utm.campaign].filter(Boolean).join(' / '))}` : ''].filter(Boolean).join(', ');
        const facts = [`scroll ${v.scroll == null ? '–' : `${v.scroll}%`}`, `active ${secs(v.active)}`, `${v.events.filter((e) => e.k === 'cl').length} clicks`].join(', ');
        const devx = [device(v.dev), v.dev.w ? `${v.dev.w}×${v.dev.h} px${v.dev.dpr ? ` @${v.dev.dpr}x` : ''}` : '', v.dev.lang, v.dev.tz].filter(Boolean).join(', ');
        const evs = v.events.filter((e) => e.k !== 'tm' && e.k !== 'st');
        return `<li class="vis-view"><p><strong>${esc(v.path)}</strong> ${when(v.t)}${v.nf ? ' <span class="admin-event admin-event-delete">404</span>' : ''}${v.consented ? ' <span class="admin-event admin-event-login_ok">consented</span>' : ''}</p>
          <p class="vis-note">${how} &middot; ${esc(facts)}</p>
          <p class="vis-note">${esc(devx)}${v.city || v.cc ? ` &middot; ${esc(place(v))}` : ''}</p>
          ${evs.length ? `<details><summary>${esc(num(evs.length))} events</summary><ol class="vis-events">${evs.map(evText).join('')}</ol></details>` : ''}</li>`;
      }).join('');
      return `<li><h4>Session ${esc(num(detail.sessions.length - i))}: ${when(ss.start)}, ${esc(num(ss.views.length))} page${ss.views.length === 1 ? '' : 's'}, ${esc(secs((ss.end - ss.start) * 1000))}</h4><ol class="vis-views">${views}</ol></li>`;
    }).join('');
    detailHtml = `    <section class="vis-section vis-detail" id="visitor" aria-labelledby="visitor-h">
      <h2 id="visitor-h">Visitor <span class="admin-email">${esc(detail.ip)}</span></h2>
      <p><a href="${ADMIN_PATH}?form=visitors${q ? `&q=${encodeURIComponent(q)}` : ''}#top-visitors">Back to all visitors</a></p>
      ${detail.people.length ? `<p>Gave: ${detail.people.map((p) => `${p.name ? `${esc(p.name)}, ` : ''}<span class="admin-email">${esc(p.email)}</span> (${esc(FORM_LABEL[p.form] || p.form)})`).join('; ')}</p>` : '<p class="muted">No form submission linked to this IP.</p>'}
      ${detail.total ? `<ol class="vis-sessions">${sess}</ol>` : empty('No visits from this IP (they may have been removed).')}
    </section>`;
  }

  /* consent and storage */
  const c = S.consent;
  const st = S.storage;
  const mb = (b) => `${(b / 1048576).toFixed(b < 10485760 ? 2 : 0)} MB`;
  const monthRows = st.months.slice().reverse().map((m) => [esc(m.month), `<span class="num">${esc(num(m.visits))}</span>`, `<span class="num">${esc(mb(m.vBytes))}</span>`, `<span class="num">${esc(mb(m.eBytes))}</span>`, m.gz ? 'gzip' : 'open']);
  const logRows = st.log.map((l) => [esc(String(l.at).slice(0, 16).replace('T', ' ')), esc(l.event), esc(Object.entries(l.detail || {}).map(([k, v]) => `${k}: ${v}`).join(', '))]);
  const other = `      <div class="vis-grid2">
        <figure class="vis-figure"><figcaption>Visit-stats notice and GPC (anonymous counts)</figcaption>
          <dl class="vis-kv"><div><dt>Allowed</dt><dd class="num">${esc(num(c.allow || 0))}</dd></div><div><dt>Declined</dt><dd class="num">${esc(num(c.deny || 0))}</dd></div><div><dt>Dismissed</dt><dd class="num">${esc(num(c.dismiss || 0))}</dd></div><div><dt>Page views with GPC</dt><dd class="num">${esc(num(c.gpc || 0))}</dd></div></dl>
        </figure>
        <figure class="vis-figure"><figcaption>Disk</figcaption>
          <dl class="vis-kv"><div><dt>Data folder</dt><dd class="num">${esc(mb(st.usage.total))}</dd></div><div><dt>Visit files</dt><dd class="num">${esc(mb(st.usage.visits))}</dd></div><div><dt>Cap (DATA_MAX_MB)</dt><dd class="num">${esc(mb(st.usage.cap))}</dd></div></dl>
          <progress class="vis-bar vis-disk" max="${st.usage.cap}" value="${Math.min(st.usage.total, st.usage.cap)}" aria-label="Disk used against the cap"></progress>
          ${st.usage.full ? '<p class="admin-alert">Over the cap with only this month left: new visits are counted anonymously only.</p>' : ''}
        </figure>
      </div>
      ${table('Months kept (24 at most)', ['Month', 'Page views', 'Visits file', 'Events file', 'State'], monthRows)}
      ${logRows.length ? table('Storage events', ['When (UTC)', 'Event', 'Detail'], logRows) : ''}`;

  const toc = [['vis-globe', 'Globe'], ['vis-sources', 'Sources'], ['vis-devices', 'Devices'], ['vis-engagement', 'Engagement'], ['vis-forms', 'Forms'], ['vis-clicks', 'Clicks'], ['vis-perf', 'Speed'], ['top-visitors', 'Visitors'], ['vis-storage', 'Storage']]
    .map(([id, l]) => `<a href="#${id}">${esc(l)}</a>`).join('');
  const geoInfo = S.geo ? `Geo data: ${esc(S.geo.source || '')}.` : '<strong>No geo data loaded:</strong> every visit is counted anonymously. Run <code>node server.js geo-update</code>.';

  return `    <div class="admin-head">
      <h1>Visitors</h1>
      <p class="muted">The last 24 months. You are signed out after ${esc(String(idleMinutes))} minutes without activity.</p>
    </div>
    <nav aria-label="Forms"><ul class="admin-tabs">${tabs}</ul></nav>
    <nav class="vis-toc" aria-label="On this page">${toc}</nav>
    <dl class="vis-summary">${tiles}</dl>
${detailHtml}
${section('vis-globe', 'Where visitors are', globe)}
${section('vis-sources', 'Sources', `      ${sourceBars}\n      ${convSrc}`, 'From ?src= or UTM tags first, then the referring site. A visitor counts as converted once they send the updates, beta or investors form.')}
${section('vis-devices', 'Devices', `      ${devBars}\n      <div class="vis-grid2">${convDev}${models}</div>`)}
${section('vis-engagement', 'Engagement', engagement, 'Identified page views; scroll depth and sections also include anonymous counts. A session ends after 30 minutes without activity.')}
${section('vis-forms', 'Form funnels', `      <div class="vis-grid2">${formsHtml}</div>`, 'Each step counts page views. Field steps are the fields people focused, in the form\'s order. Nothing anyone types is ever recorded.')}
${section('vis-clicks', 'Clicks', clicks)}
${section('vis-perf', 'Speed and errors', perf)}
${section('top-visitors', 'Top visitors', visitorsHtml, 'Grouped by IP address, most visits first. Names and emails come from forms sent from that IP within a day of a recorded visit.')}
${section('vis-storage', 'Consent and storage', other)}
    <p class="vis-attrib">IP geolocation by <a href="https://db-ip.com" rel="noopener noreferrer">DB-IP.com</a> (CC BY 4.0). Land outlines from Natural Earth. ${geoInfo}</p>`;
}

module.exports = { renderVisitors, regionName };
