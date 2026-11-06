#!/usr/bin/env node
/**
 * One learner's rows without reading everyone's. Rewrites, on one line only:
 *   db.find('items', (i) => i.user_id === userId && REST)     -> db.forUser('items', userId).filter((i) => REST)
 *   db.find('items', (i) => i.user_id === userId)             -> db.forUser('items', userId).slice()
 *   db.findOne('items', (i) => i.user_id === userId && REST)  -> (db.forUser('items', userId).find((i) => REST) || null)
 *   db.findOne('items', (i) => i.user_id === userId)          -> (db.forUser('items', userId)[0] || null)
 * Same rows, same order. Run once; kept so the change can be read and redone.
 *   node scripts/beta-load/codemod-for-user.js [--write]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const WRITE = process.argv.includes('--write');
const HEAD = /db\.(find|findOne)\('([a-z_]+)', \((\w+)\) => \3\.user_id === ([A-Za-z_][\w.]*)( && |\))/g;

function closeOf(s, open) {
  let depth = 1; let q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (!depth) return i; }
  }
  return -1;
}

let total = 0;
function rewriteLine(line) {
  let out = ''; let at = 0;
  HEAD.lastIndex = 0;
  let m;
  while ((m = HEAD.exec(line))) {
    const [all, fn, col, v, who, tail] = m;
    let end; let rest = null;
    if (tail === ')') { end = m.index + all.length; } else {
      const open = m.index + all.length;
      const close = closeOf(line, open);
      if (close < 0) continue; // the call runs on to another line: left alone
      rest = line.slice(open, close);
      end = close + 1;
    }
    const call = `db.forUser('${col}', ${who})`;
    let to;
    if (fn === 'find') to = rest === null ? `${call}.slice()` : `${call}.filter((${v}) => ${rest})`;
    else to = rest === null ? `(${call}[0] || null)` : `(${call}.find((${v}) => ${rest}) || null)`;
    out += line.slice(at, m.index) + to;
    at = end;
    HEAD.lastIndex = end;
    total++;
  }
  return out + line.slice(at);
}

function walk(dir, list = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, list); else if (e.name.endsWith('.js')) list.push(p);
  }
  return list;
}

const SEALED = /[\\/]spanish-check/;
for (const f of [...walk(path.join(ROOT, 'services')), ...walk(path.join(ROOT, 'routes')), path.join(ROOT, 'middleware', 'auth.js')]) {
  if (SEALED.test(f)) continue;
  const raw = fs.readFileSync(f, 'utf8');
  if (!/require\(['"][./]*config\/db['"]\)/.test(raw) || !raw.includes(".user_id === ")) continue;
  const before = total;
  const text = raw.split('\n').map(rewriteLine).join('\n');
  if (total > before) {
    console.log(`${path.relative(ROOT, f)}: ${total - before}`);
    if (WRITE) fs.writeFileSync(f, text);
  }
}
console.log(`${total} calls`);
