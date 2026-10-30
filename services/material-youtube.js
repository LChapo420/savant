/**
 * YouTube links for "My material": read the caption track the video already has (the ones the uploader
 * wrote first, then the auto-generated ones) and keep the text. The video and its audio are never downloaded.
 * Every request goes through the SSRF-guarded fetch in material-web.js and only to youtube.com hosts.
 * This reads data YouTube shows on the watch page but does not offer as an API; the owner knows of that
 * terms risk (docs/yc/STUDLEY-RECON.md section 6). Nothing here calls a model.
 */
const web = require('./material-web');
const { fail, normalise } = require('./material-parsers');

const HOST = /^(www\.|m\.|music\.)?youtube\.com$/i;
const ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_XML = 3 * 1024 * 1024;

/** The 11-character video id from a watch, youtu.be, shorts, embed or live link, or null. */
function videoId(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  let id = null;
  if (h === 'youtu.be') id = u.pathname.split('/')[1];
  else if (HOST.test(h)) {
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/);
    id = m ? m[1] : (u.pathname === '/watch' ? u.searchParams.get('v') : null);
  }
  return id && ID.test(id) ? id : null;
}

/** Pull the JSON object that follows `marker` out of the page, by matching braces (strings respected). */
function jsonAfter(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  if (start < 0) return null;
  let depth = 0; let inStr = false; let esc = false;
  for (let i = start; i < html.length && i - start < 2 * 1024 * 1024; i++) {
    const c = html[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

/** Choose a track: hand-written before auto-generated, then the learner's language, then English, then first. */
function pickTrack(tracks, prefer) {
  const list = (tracks || []).filter((t) => t && typeof t.baseUrl === 'string');
  if (!list.length) return null;
  const rank = (t) => {
    const lang = String(t.languageCode || '').toLowerCase();
    const l = (prefer ? (lang === prefer ? 0 : lang.startsWith(`${prefer}-`) ? 1 : 3) : 3);
    const en = lang === 'en' || lang.startsWith('en-') ? 2 : 4;
    return (t.kind === 'asr' ? 10 : 0) + Math.min(l, en);
  };
  return list.slice().sort((a, b) => rank(a) - rank(b))[0];
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unesc(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
  });
}

/** Caption body (json3 or timed-text XML) to [{ start, text }] with start in seconds. */
function parseCaptions(body) {
  const b = String(body || '').trim();
  const out = [];
  if (b.startsWith('{')) {
    let j; try { j = JSON.parse(b); } catch { return []; }
    for (const ev of j.events || []) {
      const t = (ev.segs || []).map((s) => s.utf8 || '').join('').replace(/\s*\n\s*/g, ' ').trim();
      if (t) out.push({ start: (ev.tStartMs || 0) / 1000, text: t });
    }
    return out;
  }
  const re = /<(?:text|p)\b([^>]*)>([\s\S]*?)<\/(?:text|p)>/g;
  let m;
  while ((m = re.exec(b))) {
    const st = /\bstart="([\d.]+)"/.exec(m[1]) || null;
    const tm = /\bt="(\d+)"/.exec(m[1]) || null;
    const t = unesc(unesc(m[2].replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim();
    if (t) out.push({ start: st ? Number(st[1]) : tm ? Number(tm[1]) / 1000 : 0, text: t });
  }
  return out;
}

/**
 * Fetch the captions of a YouTube video. opts: { lookup, requester } for tests, { lang } to prefer a language.
 * Returns { title, text, segments, language, auto, url } or { error, code }. code 'no_captions' means the video
 * has none (the caller offers upload or paste).
 */
async function fetchCaptions(raw, opts = {}) {
  const id = videoId(raw);
  if (!id) return fail('That is not a YouTube video link. Use a youtube.com/watch, youtu.be or Shorts link.', 'bad_url');
  const net = { lookup: opts.lookup, requester: opts.requester, hostOk: (h) => HOST.test(h) || /\.youtube\.com$/i.test(h) };
  const page = await web.fetchText(`https://www.youtube.com/watch?v=${id}`, { ...net, headers: { 'accept-language': 'en-US,en;q=0.9' } });
  if (page.error) return page;
  const player = jsonAfter(page.body, 'ytInitialPlayerResponse');
  if (!player) return fail('YouTube did not show that video to the server (it may be private, age-restricted or blocked). Paste the transcript instead.', 'unreadable');
  const status = player.playabilityStatus && player.playabilityStatus.status;
  if (status && status !== 'OK') return fail('That video is not available to read (private, removed, age-restricted or members only). Paste the transcript instead.', 'unavailable');
  const title = String((player.videoDetails && player.videoDetails.title) || '').slice(0, 200);
  const track = pickTrack(player.captions && player.captions.playerCaptionsTracklistRenderer && player.captions.playerCaptionsTracklistRenderer.captionTracks, opts.lang);
  if (!track) return fail('That video has no captions, so there is no text to read. Upload the video or audio file, or paste a transcript.', 'no_captions');
  let capUrl;
  try { capUrl = new URL(track.baseUrl, 'https://www.youtube.com'); } catch { return fail('That caption track could not be read.', 'unreadable'); }
  if (capUrl.protocol !== 'https:' || !HOST.test(capUrl.hostname)) return fail('That caption track could not be read.', 'unreadable');
  capUrl.searchParams.set('fmt', 'json3');
  const cap = await web.fetchText(capUrl.href, { ...net, types: /^(application\/json|text\/|application\/xml)/ });
  if (cap.error) return cap;
  if (cap.body.length > MAX_XML) return fail('That caption track is too large to read.', 'too_big');
  const segments = parseCaptions(cap.body);
  const text = normalise(segments.map((s) => s.text).join(' ').replace(/\s+/g, ' '));
  if (!text) return fail('That video has no captions, so there is no text to read. Upload the video or audio file, or paste a transcript.', 'no_captions');
  return { title, text, segments, language: track.languageCode || null, auto: track.kind === 'asr', url: `https://www.youtube.com/watch?v=${id}` };
}

module.exports = { videoId, jsonAfter, pickTrack, parseCaptions, fetchCaptions };
