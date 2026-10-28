// Apply exact find/replace edits to files, keeping each file's own line endings.
// usage: node edit.js <root> <spec.js>   (spec exports [{file, find, replace}])
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const spec = require(path.resolve(process.argv[3]));
let bad = 0;
for (const e of spec) {
  const f = path.join(root, e.file);
  let t = fs.readFileSync(f, 'utf8');
  const crlf = /\r\n/.test(t);
  const conv = (s) => (crlf ? s.replace(/\r?\n/g, '\r\n') : s);
  const find = conv(e.find);
  const n = t.split(find).length - 1;
  if (n !== 1) { console.log(`FAIL ${e.file}: anchor found ${n} times: ${e.find.slice(0, 80)}`); bad++; continue; }
  t = t.replace(find, () => conv(e.replace));
  fs.writeFileSync(f, t);
  console.log(`ok   ${e.file}`);
}
process.exit(bad ? 1 : 0);
