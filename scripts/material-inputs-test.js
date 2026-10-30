/**
 * "Learn from your own material", S5: PowerPoint files, web links (SSRF guard) and pasted transcripts.
 *
 *   node scripts/material-inputs-test.js
 *
 * Throwaway db. Builds a real .pptx in memory. No network: the web fetch is given a fake DNS lookup and a
 * fake requester, and the guard is checked against private, loopback, link-local and mapped addresses.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { EventEmitter } = require('events');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-inputs-test-${process.pid}.json`);

const db = require('../config/db');
const materials = require('../services/materials');
const web = require('../services/material-web');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const parts = []; const central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name); const raw = Buffer.from(f.data); const def = zlib.deflateRawSync(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc32(raw), 14); h.writeUInt32LE(def.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(def.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, name, def); central.push(c, name); off += 30 + name.length + def.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
const sp = (paras) => `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody>${paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

const BODY = 'Mitochondria make most of the cell\'s ATP through oxidative phosphorylation along the inner membrane. ';

(async () => {
  console.log('PowerPoint');
  const entries = [
    { name: '[Content_Types].xml', data: '<Types/>' },
    // Slide 10 is listed before slide 2 on purpose: order must follow the number, not the file order.
    { name: 'ppt/slides/slide10.xml', data: sp(['Last slide', 'Wrap up &amp; review']) },
    { name: 'ppt/slides/slide1.xml', data: sp(['The cell', BODY.repeat(2), 'Fish &amp; chips &#8212; &lt;tag&gt;']) },
    { name: 'ppt/slides/slide2.xml', data: sp(['Energy', BODY]) },
    { name: 'ppt/notesSlides/notesSlide2.xml', data: sp(['Ask about the Krebs cycle', '2']) },
  ];
  const got = await materials.extract(zip(entries));
  check('pptx is read', !got.error && got.kind === 'pptx', got);
  const t = got.text || '';
  check('slides come out in number order', t.indexOf('Slide 1') < t.indexOf('Slide 2') && t.indexOf('Slide 2') < t.indexOf('Slide 10'), t.slice(0, 120));
  check('first line is the slide title', t.includes('Slide 1: The cell'), t.slice(0, 60));
  check('entities decoded', t.includes('Fish & chips') && t.includes('<tag>') && t.includes('Wrap up & review'));
  check('speaker notes kept and marked, slide-number line dropped', t.includes('Speaker notes: Ask about the Krebs cycle') && !/Krebs cycle 2/.test(t));
  check('page count is the slide count', got.pages === 3, got.pages);
  const docxLike = await materials.extract(zip([{ name: 'word/document.xml', data: `<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>${BODY.repeat(3)}</w:t></w:r></w:p></w:body></w:document>` }, { name: '[Content_Types].xml', data: '<Types/>' }]));
  check('a zip without slides is still routed to the Word reader', !docxLike.kind || docxLike.kind === 'docx' || docxLike.error, docxLike);
  const empty = await materials.extract(zip([{ name: 'ppt/slides/slide1.xml', data: sp(['Hi']) }]));
  check('a near-empty deck is refused as too little', empty.code === 'too_little', empty);

  console.log('Address guard');
  const bad = ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '2002:7f00:1::', '2001:db8::1', 'not-an-ip'];
  for (const ip of bad) check(`blocks ${ip}`, !web.isPublicIp(ip));
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8']) check(`allows ${ip}`, web.isPublicIp(ip));

  console.log('Link checks');
  for (const u of ['ftp://x.com/a', 'file:///etc/passwd', 'javascript:alert(1)', 'http://u:p@example.com/', 'http://example.com:8080/', 'http://example.com:22/', '', 'nope'])
    check(`refuses ${JSON.stringify(u)}`, !!web.checkUrl(u).error, web.checkUrl(u));
  check('accepts https', !web.checkUrl('https://example.com/a?b=1').error);

  const pub = async () => [{ address: '93.184.216.34', family: 4 }];
  const mixed = async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }];
  const priv = async () => [{ address: '192.168.0.10', family: 4 }];
  let touched = 0;
  const never = { request() { touched++; throw new Error('should not connect'); } };
  check('a name resolving to a private address is blocked before any connection', (await web.fetchPage('http://intranet.example/', { lookup: priv, requester: never })).code === 'blocked' && touched === 0);
  check('one private address among public ones blocks it', (await web.fetchPage('http://rebind.example/', { lookup: mixed, requester: never })).code === 'blocked' && touched === 0);
  check('an IP literal is checked without DNS', (await web.fetchPage('http://127.0.0.1/', { lookup: pub, requester: never })).code === 'blocked');
  check('a bracketed IPv6 loopback is blocked', (await web.fetchPage('http://[::1]/', { lookup: pub, requester: never })).code === 'blocked');
  check('a metadata address is blocked', (await web.fetchPage('http://169.254.169.254/latest/meta-data/', { lookup: pub, requester: never })).code === 'blocked');
  check('an unresolvable name is a plain error', (await web.fetchPage('http://nope.example/', { lookup: async () => { throw new Error('ENOTFOUND'); }, requester: never })).code === 'unreachable');

  // A fake requester: routes by path. Records what address the connection was pinned to.
  const pins = [];
  function fake(routes) {
    return {
      request(opts, cb) {
        const req = new EventEmitter();
        req.destroy = () => {};
        req.end = () => {
          opts.lookup('x', {}, (err, addr) => pins.push(addr));
          const r = routes[opts.path] || { status: 404, headers: {}, body: '' };
          const res = new EventEmitter();
          res.statusCode = r.status; res.headers = r.headers; res.resume = () => {};
          cb(res);
          process.nextTick(() => { res.emit('data', Buffer.from(r.body || '')); res.emit('end'); });
        };
        return req;
      },
    };
  }
  const article = `<html><head><title>Cell Respiration &amp; ATP</title><style>.x{}</style><script>alert(1)</script></head><body><nav>Home About Login</nav><header>SITE BANNER</header><article><h1>Cell respiration</h1><p>${BODY.repeat(3)}</p><p>Second&nbsp;paragraph &lt;b&gt;.</p></article><aside>Buy things</aside><footer>Copyright</footer></body></html>`;
  const ok = await web.fetchPage('https://news.example/a', { lookup: pub, requester: fake({ '/a': { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: article } }) });
  check('a public page is read', !ok.error && ok.title === 'Cell Respiration & ATP', ok);
  check('article text kept, chrome and scripts dropped', ok.text.includes('Mitochondria') && ok.text.includes('Second paragraph <b>.') && !/Login|SITE BANNER|alert|Buy things|Copyright/.test(ok.text), ok.text);
  check('the connection was pinned to the checked address', pins[0] === '93.184.216.34', pins);
  const red = await web.fetchPage('https://a.example/start', { lookup: async (h) => (h === 'evil.example' ? [{ address: '10.0.0.1', family: 4 }] : pub()), requester: fake({ '/start': { status: 302, headers: { location: 'http://evil.example/x' } } }) });
  check('a redirect to a private host is blocked', red.code === 'blocked', red);
  const bounce = await web.fetchPage('https://a.example/r', { lookup: pub, requester: fake({ '/r': { status: 302, headers: { location: '/r' } } }) });
  check('a redirect loop stops', bounce.code === 'unreachable', bounce);
  const rel = await web.fetchPage('https://a.example/r', { lookup: pub, requester: fake({ '/r': { status: 301, headers: { location: '/t' } }, '/t': { status: 200, headers: { 'content-type': 'text/plain' }, body: BODY.repeat(3) } }) });
  check('a relative redirect and a plain-text page work', !rel.error && rel.text.startsWith('Mitochondria'), rel);
  const pdfy = await web.fetchPage('https://a.example/f', { lookup: pub, requester: fake({ '/f': { status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF' } }) });
  check('a non-page content type is refused', pdfy.code === 'bad_type', pdfy);
  const err500 = await web.fetchPage('https://a.example/f', { lookup: pub, requester: fake({ '/f': { status: 500, headers: {}, body: '' } }) });
  check('an error status is a plain message', err500.code === 'unreachable');
  const big = await web.fetchPage('https://a.example/f', { lookup: pub, requester: fake({ '/f': { status: 200, headers: { 'content-type': 'text/html' }, body: 'x'.repeat(web.MAX_HTML + 1) } }) });
  check('an oversize page is refused', big.code === 'too_big', big);

  console.log('Stored as material');
  const real = require('../services/material-web');
  const orig = real.fetchPage;
  real.fetchPage = async (u) => orig(u, { lookup: pub, requester: fake({ '/a': { status: 200, headers: { 'content-type': 'text/html' }, body: article } }) });
  const added = await materials.addLink(1, 'https://news.example/a', '');
  check('addLink stores kind link with title and address', added.value && added.value.kind === 'link' && added.value.title === 'Cell Respiration & ATP' && added.value.source_name === 'https://news.example/a', added);
  real.fetchPage = async () => ({ text: 'short', title: 't', url: 'https://x.example/' });
  check('a page with hardly any text is refused', (await materials.addLink(1, 'https://x.example/', '')).code === 'too_little');
  real.fetchPage = orig;
  check('a bad link never reaches the network from addLink', (await materials.addLink(1, 'http://127.0.0.1:80/', '')).code === 'blocked');

  console.log('Transcript');
  const raw = `0:00\nso today we talk about cells\n0:04\nand how they get energy ${'from food molecules in the mitochondria '.repeat(6)}\n[01:02:03] the end 12:30 pm is not a stamp mid-sentence?`;
  const clean = materials.cleanTranscript(raw);
  check('timestamp lines and inline stamps are removed, text is joined', !/\b0:00\b|0:04|01:02:03/.test(clean) && clean.startsWith('so today we talk about cells and how'), clean.slice(0, 120));
  const tr = materials.addTranscript(1, '', raw, 'https://www.youtube.com/watch?v=abc123');
  check('transcript stored as kind transcript, link is a label', tr.value && tr.value.kind === 'transcript' && tr.value.source_name.includes('youtube.com') && tr.value.title === 'Video transcript', tr);
  check('a non-YouTube link is refused', materials.addTranscript(1, '', raw, 'http://169.254.169.254/').code === 'bad_url');
  check('a look-alike host is refused', materials.addTranscript(1, '', raw, 'https://youtube.com.evil.example/x').code === 'bad_url');
  check('no link is fine', !!materials.addTranscript(1, 't', raw, '').value);
  check('too little transcript is refused', materials.addTranscript(1, '', '0:01 hi', '').code === 'too_little');

  console.log('Wiring');
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  check('child accounts cannot use link or transcript', /materials\(\\\/\(paste\|link\|transcript\)\)\?/.test(read('routes/consent.js')));
  check('routes are registered before /:id', read('routes/materials.js').indexOf("post('/link'") < read('routes/materials.js').indexOf("post('/:id/course'"));
  check('privacy page names web pages and transcripts', /web page/.test(read('public/privacy.html')) && /transcript/.test(read('public/privacy.html')));
  check('My material page tells the learner where a link goes', /opens that page once/.test(read('public/js/my-material.js')));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
