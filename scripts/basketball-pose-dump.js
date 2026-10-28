// Runs the app's body tracking (MediaPipe Pose Landmarker lite, self-hosted in
// public/vendor/mediapipe) over video clips, in headless Chrome on this machine,
// and writes every frame's landmarks to a JSON file for basketball-video-eval.js.
// Also times each detect call (the same call camera-blocks.js makes).
//
//   node scripts/basketball-pose-dump.js --clips <dir> --labels <labels.json> --out <poses.json> [--chrome <path>] [--delegate CPU|GPU]
//
// Frames are decoded with ffmpeg at 320 pixels wide and 30 per second, exactly what
// the tracker sees. Everything stays on this machine: a server on 127.0.0.1 hands
// the page the frames and takes back the landmarks.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawn } = require('child_process');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const clipsDir = arg('--clips');
const labels = JSON.parse(fs.readFileSync(arg('--labels'), 'utf8'));
const outFile = arg('--out');
const delegate = arg('--delegate', 'CPU');
const chrome = arg('--chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const ROOT = path.join(__dirname, '..', 'public');
const W = 320;

function decode(file) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
  const H = Math.round((W * probe[1]) / probe[0] / 2) * 2;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H},fps=30`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 2 ** 31 });
  return { H, raw, n: raw.length / (W * H * 4) };
}

const clips = labels.clips.map((c) => ({ file: c.file, ...decode(path.join(clipsDir, c.file)) }));
const PAGE = `<!doctype html><meta charset="utf-8"><canvas id="c"></canvas><script type="module">
import * as vision from '/vendor/mediapipe/vision_bundle.mjs';
const meta = await (await fetch('/meta')).json();
const files = await vision.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
const t0 = performance.now();
const pl = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/vendor/mediapipe/pose_landmarker_lite.task', delegate: meta.delegate }, runningMode: 'VIDEO', numPoses: 2 });
const loadMs = performance.now() - t0;
const out = { loadMs, delegate: meta.delegate, clips: {} };
const c = document.getElementById('c'); const ctx = c.getContext('2d');
let ts = 1;
for (const clip of meta.clips) {
  const buf = new Uint8ClampedArray(await (await fetch('/frames/' + clip.i)).arrayBuffer());
  c.width = ${W}; c.height = clip.H;
  const frames = []; const ms = [];
  for (let k = 0; k < clip.n; k++) {
    ctx.putImageData(new ImageData(buf.slice(k * ${W} * clip.H * 4, (k + 1) * ${W} * clip.H * 4), ${W}, clip.H), 0, 0);
    const a = performance.now();
    const r = pl.detectForVideo(c, ts); ts += 33;
    ms.push(performance.now() - a);
    frames.push((r.landmarks || []).map((lm) => lm.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +(p.visibility || 0).toFixed(2)])));
  }
  out.clips[clip.file] = { frames, ms };
}
await fetch('/done', { method: 'POST', body: JSON.stringify(out) });
</script>`;

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE); return; }
  if (u === '/meta') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ delegate, clips: clips.map((c, i) => ({ i, file: c.file, H: c.H, n: c.n })) })); return; }
  if (u.startsWith('/frames/')) { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end(clips[Number(u.slice(8))].raw); return; }
  if (u === '/done') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      fs.writeFileSync(outFile, body);
      res.end('ok');
      const r = JSON.parse(body);
      const all = Object.values(r.clips).flatMap((c) => c.ms.slice(5));
      all.sort((a, b) => a - b);
      console.log(`pose ${r.delegate}: model load ${Math.round(r.loadMs)} ms; detect median ${all[Math.floor(all.length / 2)].toFixed(1)} ms, p90 ${all[Math.floor(all.length * 0.9)].toFixed(1)} ms over ${all.length} frames`);
      browser.kill();
      server.close();
    });
    return;
  }
  if (u.startsWith('/vendor/mediapipe/')) {
    const f = path.join(ROOT, u);
    if (!f.startsWith(path.join(ROOT, 'vendor')) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    const type = f.endsWith('.mjs') || f.endsWith('.js') ? 'text/javascript' : f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(f).pipe(res);
    return;
  }
  res.writeHead(404); res.end();
});
let browser = null;
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-chrome-'));
  browser = spawn(chrome, ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
  setTimeout(() => { console.log('timed out'); browser.kill(); server.close(); process.exit(1); }, 30 * 60 * 1000).unref();
});
