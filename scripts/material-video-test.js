/**
 * "Learn from your own material", S9: YouTube captions and video files.
 *
 *   node scripts/material-video-test.js
 *
 * Throwaway db. No network: the YouTube fetch gets a fake DNS lookup and a fake requester with recorded-shape
 * responses. Video files are made in memory by the real ffmpeg (a tone, and a picture with no sound) and the
 * transcriber is a stub, so no speech model is needed.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-video-test-${process.pid}.json`);

const db = require('../config/db');
const materials = require('../services/materials');
const yt = require('../services/material-youtube');
const video = require('../services/material-video');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

const SENT = 'Mitochondria make ATP by oxidative phosphorylation across the inner membrane. ';
const pub = async () => [{ address: '142.250.1.1', family: 4 }];

/** Routes by a function of the request path; records every host and path asked for. */
function fake(route, seen) {
  return {
    request(opts, cb) {
      const req = new EventEmitter();
      req.destroy = () => {};
      req.end = () => {
        seen.push(`${opts.hostname}${opts.path}`);
        const r = route(opts.path) || { status: 404, headers: {}, body: '' };
        const res = new EventEmitter();
        res.statusCode = r.status; res.headers = r.headers; res.resume = () => {};
        cb(res);
        process.nextTick(() => { res.emit('data', Buffer.from(r.body || '')); res.emit('end'); });
      };
      return req;
    },
  };
}
const html = (player) => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: `<html><script>var x = {"a":"}"};var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = {};</script></html>` });
const json3 = (lines) => ({ status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ events: [{ tStartMs: 0 }, ...lines.map((t, i) => ({ tStartMs: i * 4000, segs: [{ utf8: t }] }))] }) });
const tracks = [
  { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=en&kind=asr', languageCode: 'en', kind: 'asr' },
  { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=en', languageCode: 'en' },
  { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&lang=es', languageCode: 'es' },
];
const OKPLAYER = (t) => ({ playabilityStatus: { status: 'OK' }, videoDetails: { title: 'Cell respiration in 10 minutes' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: t } } });

(async () => {
  console.log('YouTube links');
  for (const [u, id] of [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'], ['https://youtu.be/dQw4w9WgXcQ?t=5', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'dQw4w9WgXcQ'], ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'], ['https://www.youtube.com/live/dQw4w9WgXcQ?si=1', 'dQw4w9WgXcQ'],
  ]) check(`id from ${u}`, yt.videoId(u) === id);
  for (const u of ['https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/', 'ftp://youtu.be/dQw4w9WgXcQ', 'https://u:p@youtu.be/dQw4w9WgXcQ', 'nonsense', ''])
    check(`not a video link: ${u}`, yt.videoId(u) === null);

  console.log('track choice and caption parsing');
  check('hand-written beats auto-generated', !yt.pickTrack(tracks).kind && yt.pickTrack(tracks).languageCode === 'en');
  check('auto is used when it is all there is', yt.pickTrack([tracks[0]]).kind === 'asr');
  check('a preferred language wins among hand-written', yt.pickTrack(tracks, 'es').languageCode === 'es');
  check('no tracks gives null', yt.pickTrack([]) === null && yt.pickTrack(undefined) === null);
  const xml = '<?xml version="1.0"?><transcript><text start="1.5" dur="2">Don&amp;#39;t panic &lt;b&gt;now</text><text start="4" dur="2">second line</text></transcript>';
  const px = yt.parseCaptions(xml);
  check('timed-text XML is parsed with unescaping', px.length === 2 && px[0].text === "Don't panic <b>now" && px[0].start === 1.5, px);
  check('json3 is parsed, empty events skipped', yt.parseCaptions(JSON.stringify({ events: [{ tStartMs: 0 }, { tStartMs: 2500, segs: [{ utf8: 'a' }, { utf8: ' b' }] }] })).length === 1);
  check('garbage gives no segments', yt.parseCaptions('{nope').length === 0 && yt.parseCaptions('').length === 0);
  check('braces inside strings do not confuse the extractor', yt.jsonAfter('x ytInitialPlayerResponse = {"a":"}{","b":{"c":1}}; z', 'ytInitialPlayerResponse').b.c === 1);

  console.log('fetching captions (fake network)');
  const lines = Array.from({ length: 6 }, (_, i) => `${SENT}(${i})`);
  let seen = [];
  let route = (p) => (p.startsWith('/watch') ? html(OKPLAYER(tracks)) : p.startsWith('/api/timedtext') ? json3(lines) : null);
  let got = await yt.fetchCaptions('https://youtu.be/dQw4w9WgXcQ', { lookup: pub, requester: fake(route, seen) });
  check('captions fetched with title and hand-written track', !got.error && got.title === 'Cell respiration in 10 minutes' && got.auto === false && got.language === 'en' && got.text.includes('oxidative'), got);
  check('only youtube.com was contacted, and json3 asked for', seen.length === 2 && seen.every((s) => s.startsWith('www.youtube.com/')) && /fmt=json3/.test(seen[1]) && /lang=en$|lang=en&/.test(seen[1]) && !/kind=asr/.test(seen[1]), seen);
  check('segments keep timestamps', got.segments.length === 6 && got.segments[1].start === 4, got.segments);

  seen = [];
  route = (p) => (p.startsWith('/watch') ? html(OKPLAYER([tracks[0]])) : json3(lines));
  got = await yt.fetchCaptions('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { lookup: pub, requester: fake(route, seen) });
  check('auto-generated captions are used and flagged when nothing else exists', !got.error && got.auto === true, got);

  got = await yt.fetchCaptions('https://youtu.be/dQw4w9WgXcQ', { lookup: pub, requester: fake((p) => html(OKPLAYER([])), []) });
  check('a video with no captions says so and offers upload or paste', got.code === 'no_captions' && /upload|paste/i.test(got.error), got);
  got = await yt.fetchCaptions('https://youtu.be/dQw4w9WgXcQ', { lookup: pub, requester: fake((p) => html({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }), []) });
  check('a private or age-gated video is a plain error', got.code === 'unavailable', got);
  got = await yt.fetchCaptions('https://youtu.be/dQw4w9WgXcQ', { lookup: pub, requester: fake((p) => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>consent</html>' }), []) });
  check('a page without player data is a plain error', got.code === 'unreadable', got);
  got = await yt.fetchCaptions('https://youtu.be/dQw4w9WgXcQ', { lookup: pub, requester: fake((p) => (p.startsWith('/watch') ? html(OKPLAYER([{ baseUrl: 'https://169.254.169.254/x', languageCode: 'en' }])) : null), []) });
  check('a caption url pointing off youtube.com is refused', got.code === 'unreadable', got);
  got = await yt.fetchCaptions('https://youtu.be/dQw4w9WgXcQ', { lookup: async () => [{ address: '10.0.0.1', family: 4 }], requester: fake(() => null, []) });
  check('the SSRF guard still applies (private DNS answer)', got.code === 'blocked', got);
  got = await yt.fetchCaptions('https://youtu.be/dQw4w9WgXcQ', { lookup: pub, requester: fake((p) => (p.startsWith('/watch') ? { status: 302, headers: { location: 'https://evil.example/x' } } : null), []) });
  check('a redirect off youtube.com is refused', got.code === 'bad_url', got);
  got = await yt.fetchCaptions('https://example.com/watch?v=dQw4w9WgXcQ', { lookup: pub, requester: fake(() => null, []) });
  check('a non-YouTube link never reaches the network', got.code === 'bad_url', got);

  console.log('saving a YouTube material');
  const user = db.insert('users', { username: 'vid-learner' });
  const web = require('../services/material-web');
  const realFetchText = web.fetchText;
  web.fetchText = (u, o = {}) => realFetchText(u, { ...o, lookup: pub, requester: fake((p) => (p.startsWith('/watch') ? html(OKPLAYER(tracks)) : json3(lines)), []) });
  const saved = await materials.addYoutube(user.id, 'https://youtu.be/dQw4w9WgXcQ');
  web.fetchText = realFetchText;
  check('saved as a transcript material titled from the video', !saved.error && saved.value.kind === 'transcript' && saved.value.title === 'Cell respiration in 10 minutes' && saved.value.source_name.includes('dQw4w9WgXcQ'), saved);
  check('the stored text has no timestamps and is the captions', materials.textOf(user.id, saved.value.id).includes('oxidative phosphorylation') && !/\d:\d\d/.test(materials.textOf(user.id, saved.value.id)));
  web.fetchText = (u, o = {}) => realFetchText(u, { ...o, lookup: pub, requester: fake((p) => (p.startsWith('/watch') ? html(OKPLAYER(tracks)) : json3(['hi'])), []) });
  const tiny = await materials.addYoutube(user.id, 'https://youtu.be/dQw4w9WgXcQ');
  web.fetchText = realFetchText;
  check('captions with too little text are refused plainly', tiny.code === 'too_little', tiny);

  console.log('video files');
  const ffmpeg = video.ffmpegPath();
  const probe = spawnSync(ffmpeg, ['-version']);
  if (probe.error) { check('ffmpeg is available (skipping the file checks)', true); } else {
    const mk = (args, ext) => {
      const f = path.join(os.tmpdir(), `material-video-fixture-${process.pid}.${ext}`);
      const r = spawnSync(ffmpeg, ['-v', 'error', ...args, '-y', f]);
      if (r.status !== 0) throw new Error(`fixture: ${r.stderr}`);
      const b = fs.readFileSync(f); fs.unlinkSync(f); return b;
    };
    const mp4 = mk(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=3:r=5', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'], 'mp4');
    const webm = mk(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-c:a', 'libopus'], 'webm');
    const silent = mk(['-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=2:r=5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'], 'mp4');
    check('mp4 is recognised from its bytes', video.sniffVideo(mp4) === 'mp4');
    check('webm is recognised from its bytes', video.sniffVideo(webm) === 'webm');
    check('a pdf or text is not a video', video.sniffVideo(Buffer.from('%PDF-1.4 and some more bytes')) === null && video.sniffVideo(Buffer.from('hello world this is text')) === null);

    const audio = require('../services/material-audio');
    const tmpLeft = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('savant-video-')).length;
    const before = tmpLeft();
    let heard = null;
    const stub = async (samples) => { heard = { n: samples.length }; return SENT.repeat(4); };
    const r1 = await video.submitVideo(user.id, mp4, 'lecture 1.mp4', { deps: { transcribe: stub } });
    check('a video becomes an S8 job at once', !r1.error && r1.job && r1.job.title === 'lecture 1', r1);
    await r1.finished;
    check('the audio reached the transcriber as 16 kHz samples (about 3 s)', heard && heard.n > 16000 * 2 && heard.n < 16000 * 5, heard);
    const mine = materials.list(user.id).find((m) => m.title === "lecture 1");
    check("the transcript is stored as a material with timestamps", !!mine && materials.textOf(user.id, mine.id).startsWith('[0:00] Mitochondria'), { mine, jobs: audio.listJobs(user.id) });
    check('the temp folder with the video is gone', tmpLeft() === before);
    const r2 = await video.submitVideo(user.id, webm, 'talk.webm', { deps: { transcribe: stub } });
    check('webm video works too', !r2.error, r2); if (r2.finished) await r2.finished;
    const r3 = await video.submitVideo(user.id, silent, 'mute.mp4', { deps: { transcribe: stub } });
    check('a video with no sound track says so, and no job is made', r3.code === 'no_audio' && audio.listJobs(user.id).every((j) => j.title !== 'mute'), r3);
    const r4 = await video.submitVideo(user.id, mp4, 'x.mp4', {});
    check('without the speech model it says so plainly, before any work', audio.availability().ready ? true : (r4.code === 'no_transcriber' && tmpLeft() === before), r4);
    const r5 = await video.submitVideo(user.id, Buffer.concat([mp4.slice(0, 40), Buffer.alloc(2000, 7)]), 'bad.mp4', { deps: { transcribe: stub } });
    check('a damaged video is a plain error', r5.code === 'unreadable' || r5.code === 'no_audio', r5);
    const r6 = await video.submitVideo(user.id, mp4, 'x.mp4', { ffmpeg: '/nonexistent/ffmpeg', deps: { transcribe: stub } });
    check('a missing ffmpeg is reported as such', r6.code === 'no_ffmpeg', r6);
    const r7 = await video.submitVideo(user.id, Buffer.from('not a video at all, just text'), 'x.mp4', { deps: { transcribe: stub } });
    check('a non-video is refused by its bytes', r7.code === 'bad_type', r7);
    check('nothing is left in the temp folder after any of that', tmpLeft() === before);
    const r8 = await video.submitVideo(user.id, mp4, 'quiet.mp4', { deps: { transcribe: async () => 'um' } });
    check('a video with almost no speech fails the job plainly', !r8.error && (await r8.finished, audio.listJobs(user.id).some((j) => j.title === 'quiet' && j.status === 'failed')), r8);
  }

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* not written */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
