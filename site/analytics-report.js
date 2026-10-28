'use strict';
/**
 * Turns the visit files into the numbers the admin page's Visitors tab shows.
 * Each month is read once into a "partial" (closed, gzipped months are cached
 * until their file changes); partials are merged, then sessions, conversion and
 * percentiles are worked out. Nothing here writes.
 */

const { readMonthFile, SESSION_GAP_S, MILESTONES } = require('./analytics');

const FIELD_ORDER = {
  updates: ['email', 'consent'],
  beta: ['email', 'name', 'role', 'why', 'age_ok', 'consent'],
  investors: ['name', 'email', 'firm', 'message'],
  remove: ['email'],
};
const PERF = ['ttfb', 'dom', 'load', 'lcp', 'cls', 'inp'];

const inc = (o, k, by = 1) => { if (k !== undefined && k !== null && k !== '') o[k] = (o[k] || 0) + by; };
const addAll = (into, from) => { for (const [k, v] of Object.entries(from)) into[k] = (into[k] || 0) + v; };
function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
const median = (a) => pct(a, 50);
const sortNum = (a) => a.slice().sort((x, y) => x - y);
const top = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);

/** Splits one visitor's page views ({t, end, path}) into sessions: a gap of over 30 minutes starts a new one. */
function sessionize(views, gap = SESSION_GAP_S) {
  const sorted = views.slice().sort((a, b) => a.t - b.t);
  const out = [];
  for (const v of sorted) {
    const s = out[out.length - 1];
    if (s && v.t - s.end <= gap) {
      s.end = Math.max(s.end, v.end);
      s.exit = v.path;
      s.pages += 1;
    } else out.push({ start: v.t, end: Math.max(v.t, v.end), entry: v.path, exit: v.path, pages: 1 });
  }
  return out;
}
/** Joins session lists from different months when they touch. */
function joinSessions(list, gap = SESSION_GAP_S) {
  const sorted = list.slice().sort((a, b) => a.start - b.start);
  const out = [];
  for (const s of sorted) {
    const p = out[out.length - 1];
    if (p && s.start - p.end <= gap) { p.end = Math.max(p.end, s.end); p.exit = s.exit; p.pages += s.pages; } else out.push({ ...s });
  }
  return out;
}

/**
 * The form funnel for one form, from per-page-view states:
 * { seen, started, fields: {name: n}, attempted, done, abandon: {name: n}, errors, ttc: [ms] }.
 * Returns the steps in order with the drop-off from the step before.
 */
function funnel(f, form) {
  const order = [...(FIELD_ORDER[form] || [])];
  for (const k of Object.keys(f.fields)) if (!order.includes(k)) order.push(k);
  const steps = [['Seen', f.seen], ['Started', f.started], ...order.map((k) => [`Field: ${k}`, f.fields[k] || 0]), ['Submit pressed', f.attempted], ['Sent', f.done]];
  return steps.map(([label, n], i) => {
    const prev = i ? steps[i - 1][1] : null;
    return { label, n, drop: prev ? Math.max(0, Math.round((1 - n / prev) * 1000) / 10) : null };
  });
}

function newPartial() {
  return {
    pv: 0, tracked: 0, ips: new Map(),
    bySource: {}, byType: {}, byOS: {}, byBrowser: {}, byModel: {}, internal: 0,
    scroll: {}, active: { sum: 0, n: 0 }, total: { sum: 0, n: 0 }, sections: {}, sectionMs: {},
    forms: {}, clicks: {}, outbound: {}, mailto: 0, theme: 0, nav: {}, ev: {}, rage: {}, dead: {},
    perf: Object.fromEntries(PERF.map((k) => [k, []])), errors: {}, nf: {},
  };
}
const formState = () => ({ seen: 0, started: 0, fields: {}, attempted: 0, done: 0, abandon: {}, errors: {}, ttc: [] });

/** One month's partial from its visit and event files. */
async function monthPartial(row) {
  const P = newPartial();
  const views = new Map();
  await readMonthFile(row.v.file, 'v', (r) => {
    views.set(r.n, { r, end: r.t, ev: [] });
  });
  if (row.e) {
    await readMonthFile(row.e.file, 'e', (e) => {
      const v = views.get(e.v);
      if (v && v.ev.length < 600) v.ev.push(e);
    });
  }
  for (const { r, ev } of views.values()) {
    P.pv += 1;
    const d = r.dev;
    if (r.source === 'internal') P.internal += 1; else inc(P.bySource, r.source || 'direct');
    inc(P.byType, d.type);
    inc(P.byOS, d.os ? `${d.os}${d.osv ? ` ${d.osv}` : ''}` : 'Other');
    inc(P.byBrowser, d.br ? `${d.br}${d.brv ? ` ${d.brv}` : ''}` : 'Other');
    if (d.model) inc(P.byModel, d.model);
    if (r.nf) inc(P.nf, r.path);
    let maxO = 0;
    let scroll = -1;
    let active = 0;
    let total = 0;
    let hasTime = false;
    let conv = false;
    const secs = new Set();
    const fs = {};
    const F = (name) => fs[name] || (fs[name] = { seen: false, fields: new Set(), attempted: false, done: false, aband: '', errors: new Set(), ttc: null });
    for (const e of ev) {
      maxO = Math.max(maxO, e.o || 0);
      switch (e.k) {
        case 'sc': scroll = Math.max(scroll, e.m); break;
        case 'sd': scroll = Math.max(scroll, e.d); break;
        case 'si': secs.add(e.s); break;
        case 'st': inc(P.sectionMs, e.s, e.ms); break;
        case 'tm': active += e.a || 0; total += e.t || 0; hasTime = true; break;
        case 'cl':
          inc(P.clicks, `${e.i}\t${e.c}\t${e.to || ''}`);
          if (e.c === 'out' || e.c === 'social') inc(P.outbound, e.to || '(unknown)');
          if (e.c === 'mail') P.mailto += 1;
          if (e.c === 'theme') P.theme += 1;
          if (e.c === 'nav') inc(P.nav, e.i);
          if (e.c === 'ev') inc(P.ev, e.i);
          break;
        case 'rc': inc(P.rage, `${r.path}\t${e.s || ''}\t${e.i}`); break;
        case 'dc': inc(P.dead, `${r.path}\t${e.s || ''}\t${e.i}`); break;
        case 'fv': F(e.f).seen = true; break;
        case 'ff': F(e.f).fields.add(e.n); break;
        case 've': F(e.f).errors.add(`${e.n}-${e.e}`); break;
        case 'fs': F(e.f).attempted = true; break;
        case 'fd': { const s = F(e.f); s.done = true; if (e.ms != null) s.ttc = e.ms; if (e.f !== 'remove') conv = true; break; }
        case 'fa': F(e.f).aband = e.n || '(none)'; break;
        case 'pf':
          if (e.b != null) P.perf.ttfb.push(e.b);
          if (e.d != null) P.perf.dom.push(e.d);
          if (e.l != null) P.perf.load.push(e.l);
          break;
        case 'wv':
          if (e.lcp != null) P.perf.lcp.push(e.lcp);
          if (e.cls != null) P.perf.cls.push(e.cls);
          if (e.inp != null) P.perf.inp.push(e.inp);
          break;
        case 'er': {
          const key = `${e.m}\t${e.at}`;
          const x = P.errors[key] || (P.errors[key] = { n: 0, last: 0, pages: {} });
          x.n += 1;
          x.last = Math.max(x.last, r.t + Math.round((e.o || 0) / 10));
          inc(x.pages, r.path);
          break;
        }
        default: break;
      }
    }
    if (ev.length) P.tracked += 1;
    for (const m of MILESTONES) if (scroll >= m) inc(P.scroll, m);
    if (hasTime) { P.active.sum += active; P.active.n += 1; P.total.sum += total; P.total.n += 1; }
    for (const s of secs) inc(P.sections, s);
    for (const [name, s] of Object.entries(fs)) {
      const agg = P.forms[name] || (P.forms[name] = formState());
      if (s.seen) agg.seen += 1;
      if (s.fields.size) agg.started += 1;
      for (const f of s.fields) inc(agg.fields, f);
      if (s.attempted) agg.attempted += 1;
      if (s.done) agg.done += 1;
      if (s.aband && !s.done) inc(agg.abandon, s.aband);
      for (const x of s.errors) inc(agg.errors, x);
      if (s.ttc != null) agg.ttc.push(s.ttc);
    }
    const end = r.t + Math.round(maxO / 10);
    // the visitor
    let a = P.ips.get(r.ip);
    if (!a) {
      a = { ip: r.ip, n: 0, first: r.t, last: r.t, src: {}, pages: {}, types: {}, conv: false, views: [], cc: '', city: '', lat: null, lon: null, dev: null };
      P.ips.set(r.ip, a);
    }
    a.n += 1;
    a.first = Math.min(a.first, r.t);
    if (r.t >= a.last || !a.dev) {
      a.last = Math.max(a.last, r.t);
      a.dev = d;
      if (r.cc) { a.cc = r.cc; a.city = r.city; a.lat = r.lat; a.lon = r.lon; }
    }
    if (r.source !== 'internal') inc(a.src, r.source || 'direct');
    inc(a.pages, r.path);
    inc(a.types, d.type);
    if (conv) a.conv = true;
    a.views.push({ t: r.t, end, path: r.path });
  }
  for (const a of P.ips.values()) { a.sessions = sessionize(a.views); delete a.views; }
  return P;
}

function mergeInto(T, P) {
  T.pv += P.pv;
  T.tracked += P.tracked;
  T.internal += P.internal;
  for (const k of ['bySource', 'byType', 'byOS', 'byBrowser', 'byModel', 'scroll', 'sections', 'sectionMs', 'clicks', 'outbound', 'nav', 'ev', 'rage', 'dead', 'nf']) addAll(T[k], P[k]);
  T.mailto += P.mailto;
  T.theme += P.theme;
  for (const k of ['active', 'total']) { T[k].sum += P[k].sum; T[k].n += P[k].n; }
  for (const k of PERF) for (const v of P.perf[k]) T.perf[k].push(v);
  for (const [key, x] of Object.entries(P.errors)) {
    const y = T.errors[key] || (T.errors[key] = { n: 0, last: 0, pages: {} });
    y.n += x.n;
    y.last = Math.max(y.last, x.last);
    addAll(y.pages, x.pages);
  }
  for (const [name, f] of Object.entries(P.forms)) {
    const g = T.forms[name] || (T.forms[name] = formState());
    for (const k of ['seen', 'started', 'attempted', 'done']) g[k] += f[k];
    addAll(g.fields, f.fields);
    addAll(g.abandon, f.abandon);
    addAll(g.errors, f.errors);
    g.ttc.push(...f.ttc);
  }
  for (const [ip, a] of P.ips) {
    const b = T.ips.get(ip);
    if (!b) { T.ips.set(ip, { ...a, src: { ...a.src }, pages: { ...a.pages }, types: { ...a.types }, sessions: a.sessions.map((s) => ({ ...s })) }); continue; }
    b.n += a.n;
    b.first = Math.min(b.first, a.first);
    if (a.last >= b.last) { b.last = a.last; b.dev = a.dev; if (a.cc) { b.cc = a.cc; b.city = a.city; b.lat = a.lat; b.lon = a.lon; } }
    addAll(b.src, a.src);
    addAll(b.pages, a.pages);
    addAll(b.types, a.types);
    b.conv = b.conv || a.conv;
    b.sessions.push(...a.sessions.map((s) => ({ ...s })));
  }
}

/**
 * deps: analytics (from analytics.js), forms (names), readAll(form).
 */
function createReport({ analytics, forms, readAll }) {
  const cache = new Map(); // month -> { sig, P }
  const sig = (row) => [row.v && row.v.bytes, row.v && row.v.mtime, row.e && row.e.bytes, row.e && row.e.mtime].join(':');

  async function partials() {
    const out = [];
    const rows = analytics.store.months().filter((r) => r.v);
    for (const row of rows) {
      const s = sig(row);
      const c = cache.get(row.month);
      if (c && c.sig === s) { out.push({ row, P: c.P }); continue; }
      const P = await monthPartial(row);
      cache.set(row.month, { sig: s, P });
      out.push({ row, P });
    }
    for (const k of cache.keys()) if (!rows.some((r) => r.month === k)) cache.delete(k);
    return out;
  }

  /** Who gave which name and email: ip -> [{ form, name, email, at }]. */
  function linkedPeople() {
    const byId = new Map();
    for (const f of forms) for (const r of readAll(f)) if (r && r.id) byId.set(r.id, { form: f, name: r.name || '', email: r.email || '', at: r.at || '' });
    const out = new Map();
    for (const l of analytics.readLinks()) {
      const p = byId.get(l.id);
      if (!p) continue;
      const list = out.get(l.ip) || [];
      if (!list.some((x) => x.email === p.email && x.form === p.form)) list.push(p);
      out.set(l.ip, list);
    }
    return out;
  }

  async function stats() {
    const parts = await partials();
    const T = newPartial();
    for (const { P } of parts) mergeInto(T, P);
    const people = linkedPeople();
    const visitors = [...T.ips.values()];
    for (const a of visitors) {
      a.sessions = joinSessions(a.sessions);
      a.people = people.get(a.ip) || [];
      a.converted = a.conv || a.people.some((p) => p.form !== 'remove');
    }
    // anonymous counters
    const counts = analytics.getCounts();
    const anon = { visits: 0, byCountry: {}, bySource: {}, byType: {}, events: {}, consent: {} };
    for (const d of Object.values(counts.days)) {
      for (const [k, n] of Object.entries(d.v || {})) {
        const [cc, src, t] = k.split('|');
        anon.visits += n;
        if (cc && cc !== '--') inc(anon.byCountry, cc, n);
        if (src === 'internal') T.internal += n; else inc(anon.bySource, src, n);
        inc(anon.byType, { m: 'mobile', t: 'tablet', d: 'desktop' }[t] || 'desktop', n);
      }
      addAll(anon.events, d.e || {});
      addAll(anon.consent, d.c || {});
    }
    const anonEv = (prefix) => {
      const out = {};
      for (const [k, n] of Object.entries(anon.events)) {
        const [type, page] = k.split('|');
        if (type.startsWith(prefix)) inc(out, `${type.slice(prefix.length)}${page !== undefined ? `|${page}` : ''}`, n);
      }
      return out;
    };
    const sumBy = (o, split) => { const r = {}; for (const [k, n] of Object.entries(o)) inc(r, split(k), n); return r; };

    // sources, devices
    const bySource = { ...T.bySource };
    addAll(bySource, anon.bySource);
    const byType = { ...T.byType };
    addAll(byType, anon.byType);
    const countries = new Set([...visitors.map((a) => a.cc).filter(Boolean), ...Object.keys(anon.byCountry)]);

    // conversion
    const conversion = (keysOf) => {
      const rows = {};
      for (const a of visitors) {
        for (const k of keysOf(a)) {
          const r = rows[k] || (rows[k] = { key: k, visitors: 0, converted: 0 });
          r.visitors += 1;
          if (a.converted) r.converted += 1;
        }
      }
      return Object.values(rows).map((r) => ({ ...r, rate: r.visitors ? Math.round((r.converted / r.visitors) * 1000) / 10 : 0 }))
        .sort((x, y) => y.visitors - x.visitors || (x.key < y.key ? -1 : 1));
    };
    const convSource = conversion((a) => { const k = Object.keys(a.src); return k.length ? k : ['direct']; });
    const convDevice = conversion((a) => Object.keys(a.types));
    const convEntry = conversion((a) => (a.sessions[0] ? [a.sessions[0].entry] : []));

    // sessions
    let sessions = 0;
    let sessionPages = 0;
    const entry = {};
    const exit = {};
    let returning = 0;
    for (const a of visitors) {
      sessions += a.sessions.length;
      if (a.sessions.length > 1) returning += 1;
      for (const s of a.sessions) { sessionPages += s.pages; inc(entry, s.entry); inc(exit, s.exit); }
    }

    // globe: visitors clustered to about 1 degree
    const clusters = new Map();
    for (const a of visitors) {
      if (a.lat == null || a.lon == null) continue;
      const key = `${Math.round(a.lat)}|${Math.round(a.lon)}`;
      const c = clusters.get(key) || { n: 0, lat: 0, lon: 0, cities: {}, cc: {} };
      c.n += 1;
      c.lat += a.lat;
      c.lon += a.lon;
      inc(c.cities, a.city || '');
      inc(c.cc, a.cc);
      clusters.set(key, c);
    }
    const locations = [...clusters.values()].map((c) => ({
      n: c.n,
      lat: Math.round((c.lat / c.n) * 10) / 10,
      lon: Math.round((c.lon / c.n) * 10) / 10,
      city: top(c.cities, 1)[0][0],
      cc: top(c.cc, 1)[0][0],
    })).sort((a, b) => b.n - a.n || (a.city < b.city ? -1 : 1));

    // engagement
    const scrollDen = T.tracked + (anon.events['scroll25|'] !== undefined ? 0 : 0);
    const anonScroll = sumBy(anonEv('scroll'), (k) => k.split('|')[0]);
    const anonPv = anon.visits;
    const scroll = MILESTONES.map((m) => {
      const id = T.scroll[m] || 0;
      const an = anonScroll[m] || 0;
      const den = scrollDen + anonPv;
      return { m, n: id + an, share: den ? Math.round(((id + an) / den) * 1000) / 10 : 0 };
    });
    const anonSections = sumBy(anonEv('section:'), (k) => k.split('|')[0]);
    const sectionsAll = { ...T.sections };
    addAll(sectionsAll, anonSections);
    const sections = top(sectionsAll, 12).map(([id, n]) => ({ id, n, avgMs: T.sections[id] ? Math.round((T.sectionMs[id] || 0) / T.sections[id]) : null }));

    // forms
    const formNames = [...new Set([...forms.map((f) => (f === 'forget' ? 'remove' : f)), 'remove', ...Object.keys(T.forms)])];
    const anonForm = (stage) => sumBy(anonEv(`form_${stage}:`), (k) => k.split('|')[0]);
    const anonStages = { seen: anonForm('seen'), start: anonForm('start'), submit: anonForm('submit'), done: anonForm('done'), abandon: anonForm('abandon'), error: anonForm('error') };
    const formsOut = formNames.map((name) => {
      const f = T.forms[name] || formState();
      return {
        name,
        steps: funnel(f, name),
        abandon: top(f.abandon, 5),
        errors: top(f.errors, 8),
        ttcMedian: median(sortNum(f.ttc)),
        anon: Object.fromEntries(Object.entries(anonStages).map(([k, o]) => [k, o[name] || 0])),
      };
    });

    // clicks
    const clicks = top(T.clicks, 15).map(([k, n]) => { const [id, c, to] = k.split('\t'); return { id, c, to, n }; });
    const anonClicks = sumBy(anonEv('click:'), (k) => k.split('|')[0]);
    const split3 = (o) => top(o, 10).map(([k, n]) => { const [page, s, id] = k.split('\t'); return { page, s, id, n }; });

    // performance
    const perf = PERF.map((k) => { const a = sortNum(T.perf[k]); return { k, n: a.length, median: median(a), p75: pct(a, 75) }; });
    const errors = Object.entries(T.errors).map(([k, x]) => { const [m, at] = k.split('\t'); return { m, at, n: x.n, last: x.last, pages: top(x.pages, 3).map((p) => p[0]) }; })
      .sort((a, b) => b.n - a.n).slice(0, 20);
    const nf = { ...T.nf };
    addAll(nf, sumBy(anonEv('not_found'), (k) => k.split('|')[1] || '/'));

    // storage
    const months = analytics.store.months().map((row) => {
      const p = parts.find((x) => x.row.month === row.month);
      return { month: row.month, visits: p ? p.P.pv : 0, vBytes: row.v ? row.v.bytes : 0, eBytes: row.e ? row.e.bytes : 0, gz: !!((row.v && row.v.gz) || (row.e && row.e.gz)) };
    });

    return {
      summary: {
        visits: T.pv + anon.visits, identified: T.pv, unique: visitors.length, anonymous: anon.visits, countries: countries.size,
        sessions, pagesPerSession: sessions ? Math.round((sessionPages / sessions) * 10) / 10 : 0, returning, new: visitors.length - returning, internal: T.internal,
      },
      bySource: top(bySource, 20),
      byType: top(byType, 5),
      byOS: top(T.byOS, 10),
      byBrowser: top(T.byBrowser, 10),
      byModel: top(T.byModel, 10),
      convSource, convDevice, convEntry: convEntry.slice(0, 10),
      entry: top(entry, 8), exit: top(exit, 8),
      visitors: visitors.sort((a, b) => b.n - a.n || b.last - a.last),
      locations,
      engagement: {
        activeAvgMs: T.active.n ? Math.round(T.active.sum / T.active.n) : null,
        totalAvgMs: T.total.n ? Math.round(T.total.sum / T.total.n) : null,
        scroll, sections,
      },
      forms: formsOut,
      clicks, anonClicks: top(anonClicks, 8), outbound: top(T.outbound, 10), mailto: T.mailto, theme: T.theme, nav: top(T.nav, 8), ev: top(T.ev, 8),
      rage: split3(T.rage), dead: split3(T.dead), anonRage: anon.events ? Object.entries(anon.events).filter(([k]) => k.startsWith('rage|')).reduce((n, [, v]) => n + v, 0) : 0,
      perf, errors, notFound: top(nf, 15),
      consent: anon.consent,
      anon,
      storage: { usage: analytics.usage(), months, log: analytics.recentLog(8) },
      geo: analytics.geo ? analytics.geo.info : null,
    };
  }

  /** One visitor's page views, grouped into sessions, each with its events in order. */
  async function detail(ip) {
    const views = [];
    for (const row of analytics.store.months().filter((r) => r.v)) {
      const mine = new Map();
      await readMonthFile(row.v.file, 'v', (r) => { if (r.ip === ip) mine.set(r.n, { ...r, events: [] }); });
      if (!mine.size) continue;
      if (row.e) await readMonthFile(row.e.file, 'e', (e) => { const v = mine.get(e.v); if (v && v.events.length < 300) v.events.push(e); });
      for (const v of mine.values()) {
        v.events.sort((a, b) => a.o - b.o);
        v.end = v.t + Math.round(Math.max(0, ...v.events.map((e) => e.o || 0)) / 10);
        let scroll = -1;
        let active = 0;
        for (const e of v.events) {
          if (e.k === 'sc') scroll = Math.max(scroll, e.m);
          if (e.k === 'sd') scroll = Math.max(scroll, e.d);
          if (e.k === 'tm') active += e.a || 0;
        }
        v.scroll = scroll < 0 ? null : scroll;
        v.active = active;
        views.push(v);
      }
      if (views.length > 2000) break;
    }
    views.sort((a, b) => a.t - b.t);
    const sessions = [];
    for (const v of views) {
      const s = sessions[sessions.length - 1];
      if (s && v.t - s.end <= SESSION_GAP_S) { s.views.push(v); s.end = Math.max(s.end, v.end); } else sessions.push({ start: v.t, end: v.end, views: [v] });
    }
    return { ip, sessions: sessions.reverse(), people: linkedPeople().get(ip) || [], total: views.length };
  }

  return { stats, detail };
}

module.exports = { createReport, sessionize, joinSessions, funnel, monthPartial, pct, FIELD_ORDER };
