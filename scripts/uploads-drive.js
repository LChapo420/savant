/**
 * Drives the whole upload path with files of every supported type (small, large, broken, wrong type, empty, scanned,
 * audio, video) and prints what a learner would see for each. Throwaway DB. Only the local Whisper model runs.
 *   WHISPER_MODEL_DIR=<dir with Xenova/whisper-tiny.en> node scripts/uploads-drive.js [--quick]
 */
const os = require('os'); const path = require('path'); const fs = require('fs'); const { execFileSync } = require('child_process');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `uploads-drive-${process.pid}.json`);
const materials = require('../services/materials');
const audio = require('../services/material-audio');
const video = require('../services/material-video');
const fx = require('./lib/upload-fixtures');
const quick = process.argv.includes('--quick');
const rows = []; const uid = 1;
const doc = fx.DOCS.tides;
function show(group, label, out, ms, expect) {
  const ok = out.error ? 'refused' : 'read';
  const w = out.value && out.value.warnings ? ` WARNING: ${out.value.warnings.join(' | ')}` : '';
  const detail = out.error ? `${out.code}: ${out.error}` : `${out.value ? out.value.words : 'done'} words, ${out.value ? out.value.key_point_count : '?'} key points${w}`;
  if (expect === 'warn') { expect = w ? 'read' : 'nowarn'; }
  const good = expect === ok;
  rows.push({ group, label, ok, good, ms, detail });
  console.log(`${good ? 'ok  ' : 'BAD '} [${group}] ${label.padEnd(40)} ${ok.padEnd(8)} ${String(ms).padStart(6)}ms  ${detail.slice(0, 220)}`);
}
async function file(group, label, buf, expect, name) {
  const t = Date.now(); let out;
  try { out = await materials.addFile(uid, buf, name || label); } catch (e) { out = { error: `THREW ${e.message}`, code: 'threw' }; }
  show(group, label, out, Date.now() - t, expect);
  if (out.value) materials.remove(uid, out.value.id);
  return out;
}
const cut = (b, n) => b.slice(0, Math.floor(b.length * n));
const rnd = (n) => require('crypto').randomBytes(n);
(async () => {
  const built = {};
  for (const f of fx.FORMAT_LIST) { try { built[f] = await fx.build(f, doc); } catch (e) { console.log('fixture failed', f, e.message); } }
  for (const f of Object.keys(built)) await file('format', f, built[f], 'read', `notes.${f}`);
  for (const t of ['png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff']) { try { await file('picture', t, await fx.picture(doc, t, {}), 'read', `p.${t}`); } catch (e) { console.log('pic fixture', t, e.message); } }
  await file('scan', 'pdf scanned', await fx.build('pdf-scan', doc), 'read');
  await file('zip', 'zip mixed', await fx.zipMixed(doc), 'read');
  for (const f of ['pdf', 'docx', 'pptx', 'xlsx', 'odt', 'epub', 'doc', 'rtf', 'ipynb']) {
    if (!built[f]) continue;
    await file('broken', `${f} truncated 50%`, cut(built[f], 0.5), f === 'rtf' ? 'warn' : 'refused');
    const b = Buffer.from(built[f]); for (let i = 60; i < Math.min(b.length, 400); i += 7) b[i] ^= 0xff;
    await file('broken', `${f} bytes flipped`, b, f === 'doc' || f === 'rtf' ? 'read' : 'refused'); // flips inside plain text cannot be told from text
    await file('broken', `${f} header only`, built[f].slice(0, 8), 'refused');
  }
  await file('wrong', 'empty buffer', Buffer.alloc(0), 'refused');
  await file('wrong', 'one byte', Buffer.from('a'), 'refused');
  await file('wrong', 'whitespace only', Buffer.from(' \n\t '.repeat(300)), 'refused');
  await file('wrong', 'short text (50 chars)', Buffer.from('This is far too short to be a course at all really.'), 'refused');
  await file('wrong', 'random bytes', rnd(5000), 'refused');
  await file('wrong', 'Windows exe header', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(3000, 1)]), 'refused');
  await file('wrong', 'mp3-like bytes to document box', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(3000, 7)]), 'refused');
  await file('wrong', 'RIFF wav to document box', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(8), Buffer.from('WAVE'), Buffer.alloc(3000)]), 'refused');
  await file('wrong', 'mp4 to document box', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(3000)]), 'refused');
  await file('wrong', 'latin-1 text (not utf-8)', Buffer.from('Caf\xe9 r\xe9sum\xe9 na\xefve fa\xe7ade tides move water. '.repeat(30), 'latin1'), 'read');
  await file('wrong', 'utf-16 text with BOM', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Photosynthesis converts light energy into chemical energy stored in glucose. '.repeat(6), 'utf16le')]), 'read');
  await file('wrong', 'blank picture', await require('sharp')({ create: { width: 400, height: 300, channels: 3, background: '#fff' } }).png().toBuffer(), 'refused');
  const para = 'Tides are caused by the gravitational pull of the moon and the sun on the oceans, which makes the water bulge. ';
  const big = (chars) => Buffer.from(Array.from({ length: Math.ceil(chars / (para.length + 14)) }, (_, i) => `${para}Item ${i}.`).join('\n\n'));
  await file('large', 'text 5 MB', big(5e6), 'refused');
  await file('large', 'text 700 KB (near the cap)', big(7e5), 'read');
  await file('large', 'over 20 MB', Buffer.alloc(21 * 1024 * 1024, 65), 'refused');
  if (!quick) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-av-'));
    const ff = video.ffmpegPath();
    execFileSync(ff, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', path.join(dir, 'tone.wav')]);
    const toneWav = fs.readFileSync(path.join(dir, 'tone.wav'));
    const av = audio.availability(); console.log('audio availability', av);
    const asj = async (label, buf, expect) => {
      const t = Date.now(); const r = audio.submit(uid, buf, `${label}.bin`);
      let res;
      if (r.error) res = { error: r.error, code: r.code }; else { await r.finished; const j = audio.listJobs(uid).find((x) => x.id === r.job.id); res = j.status === 'done' ? { text: 'done' } : { error: j.error, code: 'job_failed' }; }
      show('audio', label, res, Date.now() - t, expect);
    };
    await asj('empty', Buffer.alloc(0), 'refused');
    await asj('text file', Buffer.from('hello world '.repeat(50)), 'refused');
    await asj('tone only (no speech)', toneWav, 'refused');
    await asj('wav truncated header', toneWav.slice(0, 30), 'refused');
    const txt = path.join(dir, 's.txt'); const wav = path.join(dir, 's.wav');
    fs.writeFileSync(txt, fx.LECTURE.map((l) => l.say).join(' '));
    let haveSpeech = false;
    try { execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wav}'); $s.Speak((Get-Content '${txt}' -Raw)); $s.Dispose()`], { stdio: 'ignore' }); haveSpeech = true; } catch { /* no voice */ }
    if (haveSpeech && av.ready) {
      const mp3 = path.join(dir, 's.mp3'); execFileSync(ff, ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '64k', mp3]);
      const mp4 = path.join(dir, 's.mp4'); execFileSync(ff, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=5', '-i', wav, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mp4]);
      const silent = path.join(dir, 'silent.mp4'); execFileSync(ff, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=5:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silent]);
      await asj('speech wav', fs.readFileSync(wav), 'read');
      await asj('speech mp3', fs.readFileSync(mp3), 'read');
      await asj('speech mp3 truncated 40%', cut(fs.readFileSync(mp3), 0.4), 'read');
      const vid = async (label, buf, expect) => {
        const t = Date.now(); const r = await video.submitVideo(uid, buf, `${label}.mp4`);
        let res; if (r.error) res = { error: r.error, code: r.code }; else { await r.finished; const j = audio.listJobs(uid).find((x) => x.id === r.job.id); res = j.status === 'done' ? { text: 'done' } : { error: j.error, code: 'job_failed' }; }
        show('video', label, res, Date.now() - t, expect);
      };
      await vid('mp4 with speech', fs.readFileSync(mp4), 'read');
      await vid('mp4 without sound track', fs.readFileSync(silent), 'refused');
      await vid('mp4 truncated 30%', cut(fs.readFileSync(mp4), 0.3), 'refused');
      await vid('junk bytes', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), rnd(4000)]), 'refused');
    } else console.log('speech rows skipped: no SAPI voice or no Whisper model');
  }
  const bad = rows.filter((r) => !r.good);
  console.log(`\n${rows.length} cases, ${bad.length} not as expected`);
  for (const r of bad) console.log(`  BAD [${r.group}] ${r.label}: ${r.ok} ${r.detail.slice(0, 160)}`);
  process.exit(0);
})();
