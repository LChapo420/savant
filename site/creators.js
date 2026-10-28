'use strict';
/**
 * Creator links for the beta form: /beta?ref=<code> (or ?utm_source=<code> as a
 * fallback). The code is kept with each beta application and is the visit's
 * source in the visit statistics, so the admin Creators tab can show, per code,
 * applications, consented emails and visits. creators.json (code, name, added)
 * is only for display: unknown codes are recorded too.
 */

const fs = require('fs');
const path = require('path');
const { tag } = require('./analytics');

const FILE = path.join(__dirname, 'creators.json');

/** A code as written in a link: the same cleaning the visit statistics apply to ?src=. */
function codeOf(v) { return tag(v); }

/** The code for a form body or a query: ?ref= first, then utm_source. */
function pickCode(o) {
  const src = o && typeof o === 'object' ? o : {};
  return codeOf(src.ref) || codeOf(src.utm_source) || '';
}

/** creators.json -> [{ code, name, added }], bad rows dropped, repeats keep the first. */
function loadCreators(file = FILE) {
  let list;
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const code = c && typeof c === 'object' ? codeOf(c.code) : '';
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: String(c.name || code).slice(0, 80), added: String(c.added || '').slice(0, 10) });
  }
  return out;
}

/**
 * One row per code seen anywhere (listed, applied or visited):
 * { code, name, listed, added, applications, consented, emails, visits }.
 * `visits` is { code: n } from the visit statistics. Emails are those whose
 * owners ticked the beta consent box.
 */
function summarize({ creators, beta, visits = {} }) {
  const rows = new Map();
  const row = (code, c) => {
    if (!rows.has(code)) rows.set(code, { code, name: c ? c.name : '', listed: !!c, added: c ? c.added : '', applications: 0, consented: 0, emails: [], visits: 0 });
    return rows.get(code);
  };
  for (const c of creators) row(c.code, c);
  for (const r of beta) {
    const code = codeOf(r.ref);
    if (!code) continue;
    const x = row(code);
    x.applications += 1;
    if (r.consent === true && typeof r.email === 'string') { x.consented += 1; x.emails.push(r.email); }
  }
  for (const [k, n] of Object.entries(visits)) {
    const code = codeOf(k);
    if (rows.has(code)) rows.get(code).visits += n;
  }
  return [...rows.values()].sort((a, b) => b.applications - a.applications || b.visits - a.visits || a.code.localeCompare(b.code));
}

module.exports = { codeOf, pickCode, loadCreators, summarize, FILE };
