#!/usr/bin/env node
'use strict';
/**
 * App-overlap scan. Reads every text file of the main app (read-only), finds Tatoeba candidates that
 * also appear in the app's own content, and writes overlap-exclusions.json (hashes of removed keys,
 * counts, and a manifest of every file scanned with its SHA-256).
 * It never prints or stores matched text from any file, and nothing from data/spanish-run/items.json
 * beyond an aggregate count.
 *
 * Match rules (token level, after lowercase + accent/punctuation stripping):
 *   1. exact: an app string equals the sentence;
 *   2. app string contains the sentence (sentences of 4+ words);
 *   3. the sentence contains an app string of 4+ words (an app string is a JSON string value, a JS/HTML
 *      string literal, a line, a table/csv cell, or a sentence of a line).
 */
const fs = require('fs');
const path = require('path');
const { sha256, tokensNorm } = require('../lib/common');
const cand = require('../lib/candidates');

const REPO = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', 'overlap-exclusions.json');
const SKIP_DIRS = new Set(['node_modules', '.git', 'spanish-check']);
const EXTS = new Set(['.js', '.mjs', '.cjs', '.json', '.jsonl', '.md', '.csv', '.tsv', '.html', '.htm', '.txt', '.py', '.sh', '.yml', '.yaml', '.patch', '.log', '.bat']);
const MAX_BYTES = 300 * 1024 * 1024;
const HELD_BACK = 'data/spanish-run/items.json';

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name), out); continue; }
    if (!ent.isFile()) continue;
    if (ent.name === '.env' || (ent.name.startsWith('.env.') && ent.name !== '.env.example')) continue; // never read secrets
    if (!EXTS.has(path.extname(ent.name).toLowerCase())) continue;
    out.push(path.join(dir, ent.name));
  }
}

function* jsonStrings(v) {
  if (typeof v === 'string') { yield v; return; }
  if (Array.isArray(v)) { for (const x of v) yield* jsonStrings(x); return; }
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) { yield k; yield* jsonStrings(v[k]); } }
}

const sentenceSplit = (s) => s.split(/(?<=[.?!])\s+/);

function* segmentsOf(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') {
    let parsed; let ok = false;
    try { parsed = JSON.parse(text); ok = true; } catch (e) { /* fall through to text mode */ }
    if (ok) { for (const s of jsonStrings(parsed)) { yield s; if (s.length > 40) yield* sentenceSplit(s); } return; }
  }
  if (ext === '.jsonl') {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let parsed; let ok = false;
      try { parsed = JSON.parse(line); ok = true; } catch (e) { /* plain line */ }
      if (ok) { for (const s of jsonStrings(parsed)) { yield s; if (s.length > 40) yield* sentenceSplit(s); } } else yield line;
    }
    return;
  }
  const lits = /(["'`])((?:\\.|(?!\1)[^\\\n]){3,})\1/g;
  for (const line of text.split('\n')) {
    yield line;
    if (line.length > 40) yield* sentenceSplit(line);
    if (ext === '.csv' || ext === '.tsv') { for (const cell of line.split(/[,\t;|]/)) yield cell; }
    if (ext === '.md') { for (const cell of line.split('|')) yield cell; }
    let m; lits.lastIndex = 0;
    while ((m = lits.exec(line)) !== null) yield m[2].replace(/\\(.)/g, '$1');
  }
}

function main() {
  const t0 = Date.now();
  const CHECK = process.argv.includes('--check'); // re-scan the FINAL pool.json against the app as it is now; writes nothing
  let pool;
  if (CHECK) pool = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pool.json'), 'utf8')).entries;
  else pool = cand.buildCandidates().candidates.filter((c) => cand.stratumOf(c.difficulty));
  const toks = pool.map((c) => tokensNorm(c.text));
  const exact = new Map();
  const first4 = new Map();   // first 4 words -> [idx]
  const grams = new Map();    // every 4-word window -> [idx, pos, idx, pos...]
  pool.forEach((c, idx) => {
    const t = toks[idx];
    exact.set(t.join(' '), idx);
    if (t.length >= 4) {
      const k = t.slice(0, 4).join(' ');
      if (!first4.has(k)) first4.set(k, []);
      first4.get(k).push(idx);
      for (let p = 0; p + 4 <= t.length; p++) {
        const g = t.slice(p, p + 4).join(' ');
        let a = grams.get(g); if (!a) { a = []; grams.set(g, a); }
        a.push(idx, p);
      }
    }
  });

  const files = []; walk(REPO, files); files.sort();
  const removed = new Map();       // idx -> rule
  const manifest = []; const perFile = {}; let heldBackKeys = 0;
  const same = (a, ai, b, bi, n) => { for (let i = 0; i < n; i++) if (a[ai + i] !== b[bi + i]) return false; return true; };

  for (const file of files) {
    const stat = fs.statSync(file);
    const rel = path.relative(REPO, file).split(path.sep).join('/');
    if (stat.size > MAX_BYTES) { manifest.push({ path: rel, skipped: 'too_large', bytes: stat.size }); continue; }
    const buf = fs.readFileSync(file);
    const text = buf.toString('utf8');
    let segs = 0; let hits = 0;
    const seen = new Set();
    for (const seg of segmentsOf(file, text)) {
      if (!seg || seg.length < 6) continue;
      segs++;
      const t = tokensNorm(seg);
      const n = t.length; if (!n) continue;
      const hit = (idx, rule) => { if (!seen.has(idx)) { seen.add(idx); hits++; } if (!removed.has(idx)) removed.set(idx, rule); };
      if (n <= 14) { const e = exact.get(t.join(' ')); if (e !== undefined) hit(e, 'exact'); }
      if (n >= 4) {
        for (let i = 0; i + 4 <= n; i++) {
          const g = t.slice(i, i + 4).join(' ');
          const f = first4.get(g);
          if (f) for (const idx of f) { const tt = toks[idx]; if (i + tt.length <= n && same(t, i, tt, 0, tt.length)) hit(idx, 'app_contains'); }
          if (i === 0 && n <= 14) {
            const a = grams.get(g);
            if (a) for (let k = 0; k < a.length; k += 2) { const idx = a[k]; const p = a[k + 1]; const tt = toks[idx]; if (p + n <= tt.length && same(tt, p, t, 0, n)) hit(idx, 'sentence_contains_app'); }
          }
        }
      }
    }
    manifest.push({ path: rel, bytes: stat.size, sha256: sha256(buf), strings: segs });
    if (rel === HELD_BACK) heldBackKeys = hits; else if (hits) perFile[rel] = hits;
  }

  if (CHECK) {
    console.log(`CHECK: ${pool.length} pool entries scanned against ${manifest.filter((m) => m.sha256).length} app files; entries that still overlap app content: ${removed.size}; (held-back test file: ${heldBackKeys})`);
    process.exitCode = removed.size === 0 ? 0 : 1;
    return;
  }
  const byRule = {};
  for (const r of removed.values()) byRule[r] = (byRule[r] || 0) + 1;
  const removedHashes = [...removed.keys()].map((i) => sha256(pool[i].key)).sort();
  const out = {
    description: 'Tatoeba candidates removed because their normalised text matches or overlaps text in the main app (rules in PROTOCOL.md section 4). Keys are stored only as SHA-256 of the normalised sentence.',
    repo_files_scanned: manifest.filter((m) => m.sha256).length,
    candidates_checked: pool.length,
    removed_count: removed.size,
    removed_by_rule: byRule,
    matches_in_held_back_test_file_aggregate_only: heldBackKeys,
    top_files_by_matches: Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 15),
    manifest,
    removed_key_sha256: removedHashes,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`scanned ${out.repo_files_scanned} files in ${Date.now() - t0} ms; candidates checked ${pool.length}; removed ${removed.size}`, byRule);
  console.log('top files:', out.top_files_by_matches.slice(0, 8));
  console.log('held-back test file: aggregate matches', heldBackKeys);
}
main();
