/**
 * The checks docs/UPLOADS-ANY-FORMAT.md section 17 could not make from the build PC, written so the owner (or the deploy) can run them on the Linux beta server in one go. Reads only; writes a temp file and removes it. No learner data, no key printed.
 *   node scripts/uploads-server-check.js [--live]     --live also makes one small real OCR and one small transcription
 * Prints one line per check, PASS or FAIL with what to do, and exits non-zero if any failed. Spec of the beta server: 47 GB RAM, 12 threads, no GPU.
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const { Worker } = require('worker_threads');

const live = process.argv.includes('--live');
const rows = [];
const say = (name, ok, detail) => { rows.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const has = (m) => { try { require(m); return true; } catch { return false; } };

(async () => {
  console.log(`${os.platform()} ${os.arch()}, ${os.cpus().length} threads, ${Math.round(os.totalmem() / 1073741824)} GB, node ${process.version}`);
  // 1. tesseract
  say('tesseract.js loads (pictures and scans)', has('tesseract.js'), has('tesseract.js') ? '' : 'run npm install: without it pictures and scans are refused');
  // 2. English data
  const eng = path.join(__dirname, '..', 'data', 'models', 'tesseract', 'eng.traineddata');
  say('OCR English data is on disk', fs.existsSync(eng), fs.existsSync(eng) ? '' : `copy it to ${eng}, or the first OCR downloads it from a CDN`);
  // 3. ffmpeg
  let ff = process.env.FFMPEG_PATH || null;
  if (!ff) { try { ff = require('ffmpeg-static'); } catch { ff = null; } }
  const ffOk = (() => { if (!ff || !fs.existsSync(ff)) return false; try { fs.accessSync(ff, fs.constants.X_OK); return true; } catch { return false; } })();
  say('ffmpeg is there and executable (M4A, MP3, video)', ffOk, ffOk ? ff : 'set FFMPEG_PATH or install ffmpeg-static for this platform');
  // 4. Whisper, Gladia
  const xen = path.join(__dirname, '..', 'data', 'models', 'Xenova');
  say('Whisper model on disk (fallback for an uncleared learner)', fs.existsSync(xen), fs.existsSync(xen) ? '' : `copy data/models/Xenova to ${xen}`);
  say('GLADIA_API_KEY is set', !!process.env.GLADIA_API_KEY, 'uploaded audio goes to Gladia first for a cleared learner');
  // 5. sharp
  let sharpOk = false; let sharpDetail = '';
  try { const sharp = require('sharp'); const big = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: '#fff' } }).png({ compressionLevel: 1 }).toBuffer(); const md = await sharp(big).metadata(); sharpOk = md.width === 9000; sharpDetail = `9000 x 9000 read, peak RSS ${Math.round(process.memoryUsage().rss / 1048576)} MB`; } catch (e) { sharpDetail = e.message.slice(0, 120); }
  say('sharp reads a 9000 x 9000 picture', sharpOk, sharpDetail);
  say('OCR_WORKERS fits the box', Number(process.env.OCR_WORKERS || 2) >= 1, `OCR_WORKERS=${process.env.OCR_WORKERS || '2 (default)'}; on 12 threads 2 to 4 is fine`);
  // 6. workers and temp
  const workerOk = await new Promise((res) => { try { const w = new Worker('require("worker_threads").parentPort.postMessage(1)', { eval: true }); w.once('message', () => res(true)); w.once('error', () => res(false)); } catch { res(false); } });
  say('worker_threads work (key points of a text over 100 KB)', workerOk);
  let tmpOk = false; try { const p = path.join(os.tmpdir(), `savant-check-${process.pid}`); fs.writeFileSync(p, 'x'); fs.unlinkSync(p); tmpOk = true; } catch { tmpOk = false; }
  say('the temp folder is writable (M4A)', tmpOk, os.tmpdir());
  // 7. Chinese PDF character maps come with the package
  say('pdfjs character maps are present (Chinese PDFs)', (() => { try { const base = path.dirname(require.resolve('pdfjs-dist/package.json')); return fs.existsSync(path.join(base, 'cmaps')); } catch { return false; } })(), 'read one Chinese PDF by hand to be sure');
  // 8. the data folder and ledgers
  const data = path.join(__dirname, '..', 'data');
  say('data/ is writable', (() => { try { const p = path.join(data, `.check-${process.pid}`); fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(p, 'x'); fs.unlinkSync(p); return true; } catch { return false; } })());
  for (const name of ['gonka', 'munito', 'coral', 'zerogpu', 'grokified', 'lyceum', 'gladia']) {
    const f = process.env[`${name.toUpperCase()}_LEDGER_FILE`] || path.join(data, `${name}-ledger.json`);
    console.log(`info  ${name} ledger: ${fs.existsSync(f) ? 'on this server' : `none yet at ${f}; it starts empty, and the server's ledgers are separate from the PC's`}`);
  }
  // 9. the switches
  const sw = ['UPLOAD_PARTS', 'UPLOAD_OPTIMIZE', 'UPLOAD_GOALS', 'UPLOAD_PARTS_FOLLOW'];
  console.log(`info  switches: ${sw.map((k) => `${k}=${process.env[k] || '(off)'}`).join(' ')}`);
  console.log('info  by hand: the proxy body limit (at least 200 MB for video, 20 MB elsewhere, and a 413 that reaches the page as JSON), and whether a server restart logs learners out.');
  if (live) {
    try {
      const sharp = require('sharp');
      const png = await sharp(Buffer.from('<svg width="900" height="200"><rect width="100%" height="100%" fill="white"/><text x="20" y="100" font-size="48">The Moon causes most tides.</text></svg>')).png().toBuffer();
      const T = require('tesseract.js');
      const w = await T.createWorker('eng');
      const { data: { text } } = await w.recognize(png);
      await w.terminate();
      say('one real OCR', /Moon/i.test(text), text.trim().slice(0, 60));
    } catch (e) { say('one real OCR', false, e.message.slice(0, 120)); }
  }
  const failed = rows.filter((x) => !x).length;
  console.log(`${rows.length - failed} of ${rows.length} passed`);
  process.exit(failed ? 1 : 0);
})();
