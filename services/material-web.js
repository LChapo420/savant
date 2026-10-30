/**
 * Web links for "My material": the learner names a public page, the server fetches it and keeps the
 * article text only (the page itself is thrown away). Server-side fetching is an SSRF risk, so:
 *   - http and https only, no credentials in the URL, ports 80 and 443 only;
 *   - the host is resolved here, every address must be public, and the connection is pinned to the
 *     address that was checked (so a second DNS answer cannot point it somewhere private);
 *   - redirects are followed by hand, at most 3, and every hop goes through the same checks;
 *   - at most 2 MB of HTML and 12 seconds, no compression, HTML or plain text only.
 * Nothing here calls a model.
 */
const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const ipaddr = require('ipaddr.js');
const { fail, normalise } = require('./material-parsers');

const MAX_HTML = 2 * 1024 * 1024;
const TIMEOUT_MS = 12 * 1000;
const MAX_REDIRECTS = 3;

/** True only for a globally routable unicast address. Mapped IPv4-in-IPv6 is judged as the IPv4 inside. */
function isPublicIp(ip) {
  if (!net.isIP(ip)) return false;
  let a;
  try { a = ipaddr.parse(ip); } catch { return false; }
  if (a.kind() === 'ipv6' && a.isIPv4MappedAddress()) a = a.toIPv4Address();
  if (a.kind() === 'ipv6') {
    const first = a.parts[0];
    if ((first & 0xe000) !== 0x2000) return false;           // only 2000::/3 is global unicast
    if (first === 0x2001 && a.parts[1] === 0x0db8) return false; // documentation
    if (first === 0x2002) return false;                      // 6to4 can wrap a private IPv4
    if (first === 0x2001 && a.parts[1] === 0) return false;  // Teredo
    return true;
  }
  if (a.range() !== 'unicast') return false;
  const [o1, o2] = a.octets;
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return false;     // carrier-grade NAT
  if (o1 === 198 && (o2 === 18 || o2 === 19)) return false;  // benchmarking
  if (o1 === 192 && o2 === 0 && a.octets[2] === 0) return false;
  return true;
}

/** Parse and vet a link before any network use. Returns { url } or { error, code }. */
function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return fail('That does not look like a web link.', 'bad_url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return fail('Only http and https links work.', 'bad_url');
  if (u.username || u.password) return fail('Links with a username or password are not allowed.', 'bad_url');
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  if (port !== '80' && port !== '443') return fail('Only normal web ports are allowed.', 'bad_url');
  if (!u.hostname || u.hostname.length > 253) return fail('That does not look like a web link.', 'bad_url');
  return { url: u };
}

/** Resolve a host and return one public address, or an error. `lookup` is injectable for tests. */
async function resolvePublic(hostname, lookup) {
  const bare = hostname.replace(/^\[|\]$/g, '');
  let addrs;
  if (net.isIP(bare)) addrs = [{ address: bare, family: net.isIP(bare) }];
  else {
    try { addrs = await lookup(bare, { all: true }); } catch { return fail('That site could not be found.', 'unreachable'); }
  }
  if (!addrs || !addrs.length) return fail('That site could not be found.', 'unreachable');
  if (!addrs.every((a) => isPublicIp(a.address))) return fail('That link points to a private or internal address, so it cannot be opened.', 'blocked');
  return { address: addrs[0].address, family: addrs[0].family };
}

/** One request to a vetted address. Resolves { status, headers, body } or an error object. */
function requestOnce(u, target, requester, okType, extraHeaders) {
  return new Promise((resolve) => {
    const lib = requester || (u.protocol === 'https:' ? https : http);
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const req = lib.request({
      protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined,
      path: `${u.pathname}${u.search}`, method: 'GET', servername: net.isIP(u.hostname) ? undefined : u.hostname,
      // The connection goes to the address that was just checked, whatever DNS says now.
      lookup: (_h, _o, cb) => (_o && _o.all ? cb(null, [{ address: target.address, family: target.family }]) : cb(null, target.address, target.family)),
      headers: { 'user-agent': 'SavantStudyBot/1.0 (+personal study use)', accept: okType ? '*/*' : 'text/html,text/plain;q=0.9', 'accept-encoding': 'identity', ...(extraHeaders || {}) },
    }, (res) => {
      const chunks = []; let size = 0;
      const type = String(res.headers['content-type'] || '').toLowerCase();
      if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); return finish({ status: res.statusCode, headers: res.headers }); }
      if (res.statusCode !== 200) { res.resume(); return finish(fail(`That site answered with an error (${res.statusCode}).`, 'unreachable')); }
      if (!(okType || /^(text\/html|text\/plain|application\/xhtml\+xml)/).test(type)) { res.resume(); return finish(fail('That link is not a web page or plain text. Upload files as files.', 'bad_type')); }
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_HTML) { finish(fail('That page is too large to read.', 'too_big')); req.destroy(); return; }
        chunks.push(c);
      });
      res.on('end', () => finish({ status: 200, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', () => finish(fail('The connection dropped while reading that page.', 'unreachable')));
    });
    const timer = setTimeout(() => { finish(fail('That site took too long to answer.', 'timeout')); req.destroy(); }, TIMEOUT_MS);
    req.on('error', () => finish(fail('That site could not be reached.', 'unreachable')));
    req.end();
  });
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '-', ndash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}

/** HTML to { title, text }: the article if there is one, with navigation, scripts and forms removed. */
function htmlToText(html) {
  let h = String(html).replace(/<!--[\s\S]*?-->/g, ' ');
  const title = decode((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  h = h.replace(/<(script|style|noscript|template|svg|nav|header|footer|aside|form|iframe|button|select|figure)\b[\s\S]*?<\/\1>/gi, ' ');
  const body = (h.match(/<article\b[\s\S]*<\/article>/i) || h.match(/<main\b[\s\S]*<\/main>/i) || h.match(/<body\b[\s\S]*<\/body>/i) || [h])[0];
  const text = decode(body
    .replace(/<\/?(p|div|section|br|li|ul|ol|tr|table|blockquote|pre|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t\u00a0]+/g, ' ');
  return { title, text: normalise(text.split('\n').map((l) => l.trim()).join('\n')) };
}

/**
 * Fetch a public text resource through the guard. opts: { lookup, requester } for tests, `types` (a RegExp
 * on the content type, default HTML or plain text), `hostOk(hostname)` to confine redirects, `headers`.
 * Returns { body, type, url } or { error, code }.
 */
async function fetchText(raw, opts = {}) {
  const lookup = opts.lookup || ((h, o) => dns.promises.lookup(h, o));
  let current = checkUrl(raw);
  if (current.error) return current;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = current.url;
    if (opts.hostOk && !opts.hostOk(u.hostname)) return fail('That link goes somewhere this feature does not read.', 'bad_url');
    const target = await resolvePublic(u.hostname, lookup);
    if (target.error) return target;
    const res = await requestOnce(u, target, opts.requester, opts.types, opts.headers);
    if (res.error) return res;
    if (res.status >= 300) {
      if (hop === MAX_REDIRECTS || !res.headers.location) return fail('That link redirects too many times.', 'unreachable');
      let next;
      try { next = new URL(res.headers.location, u); } catch { return fail('That link redirects somewhere unusable.', 'unreachable'); }
      current = checkUrl(next.href);
      if (current.error) return current;
      continue;
    }
    return { body: res.body.toString('utf8'), type: String(res.headers['content-type'] || '').toLowerCase(), url: u.href };
  }
  return fail('That link redirects too many times.', 'unreachable');
}

/** Fetch a public page. Returns { text, title, url } or { error, code }. */
async function fetchPage(raw, opts = {}) {
  const got = await fetchText(raw, opts);
  if (got.error) return got;
  const out = /^text\/plain/.test(got.type) ? { title: '', text: normalise(got.body) } : htmlToText(got.body);
  return { text: out.text, title: out.title, url: got.url };
}

module.exports = { isPublicIp, checkUrl, resolvePublic, htmlToText, fetchPage, fetchText, MAX_HTML, TIMEOUT_MS };
