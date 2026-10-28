/**
 * Read a .zst file line by line with Node's own zstd (Node 22.15+ / 23.8+).
 *
 * The Lichess exports are written by pzstd: each zstd frame follows a small
 * "skippable" frame whose 4 bytes give the next frame's compressed size. Node's
 * decoder stops at a skippable frame, so they are taken out here, using those
 * sizes (never by searching the data for magic bytes).
 *
 *   readLines(file, (line) => { ... return false to stop }) -> Promise<'end'|'stopped'>
 */
const fs = require('fs');
const zlib = require('zlib');
const { Transform } = require('stream');

function stripSkippable() {
  let buf = Buffer.alloc(0);
  let passLeft = 0; // bytes of the current zstd frame still to pass on
  let raw = false; // no pzstd framing seen: pass everything through
  return new Transform({
    transform(chunk, enc, cb) {
      if (raw) { this.push(chunk); cb(); return; }
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      for (;;) {
        if (passLeft > 0) {
          const n = Math.min(passLeft, buf.length);
          if (!n) break;
          this.push(buf.subarray(0, n));
          buf = buf.subarray(n);
          passLeft -= n;
          continue;
        }
        if (buf.length < 8) break;
        const magic = buf.readUInt32LE(0);
        if ((magic & 0xFFFFFFF0) >>> 0 === 0x184D2A50) {
          const size = buf.readUInt32LE(4);
          if (buf.length < 8 + size) break;
          passLeft = size === 4 ? buf.readUInt32LE(8) : 0;
          buf = buf.subarray(8 + size);
          continue;
        }
        // Not pzstd: an ordinary zstd stream.
        raw = true;
        this.push(buf);
        buf = Buffer.alloc(0);
        break;
      }
      cb();
    },
    flush(cb) { if (buf.length) this.push(buf); cb(); },
  });
}

function readLines(file, onLine) {
  return new Promise((resolve, reject) => {
    if (typeof zlib.createZstdDecompress !== 'function') { reject(new Error('This Node has no zstd (needs 22.15+ or 23.8+).')); return; }
    const src = fs.createReadStream(file);
    const d = zlib.createZstdDecompress();
    let rest = '';
    let stopped = false;
    d.setEncoding('utf8');
    d.on('data', (c) => {
      if (stopped) return;
      rest += c;
      let i;
      while ((i = rest.indexOf('\n')) >= 0) {
        const line = rest.slice(0, i).replace(/\r$/, '');
        rest = rest.slice(i + 1);
        if (line && onLine(line) === false) {
          stopped = true;
          src.destroy();
          d.destroy();
          resolve('stopped');
          return;
        }
      }
    });
    d.on('error', (e) => { if (!stopped) { if (/truncat|incomplete|src_size/i.test(String(e.message))) resolve('truncated'); else reject(e); } });
    d.on('end', () => { if (!stopped) { if (rest) onLine(rest); resolve('end'); } });
    src.on('error', reject);
    src.pipe(stripSkippable()).pipe(d);
  });
}

module.exports = { readLines };
