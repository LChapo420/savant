/**
 * Pre-build the chess_tactics item pool (content/chess-tactics-pool.js), so a
 * request never runs the half-second position search that builds one live.
 *
 *   node scripts/chess-tactics-pool-build.js --d=1,2,3 [--per=300]   build and check these difficulties
 *   node scripts/chess-tactics-pool-build.js --merge                   write the content file from the parts
 *
 * Each item is built by the live generator (content/chess-items.js liveTactics,
 * with its own built-in checks), de-duplicated by prompt and answer, and then
 * checked by Stockfish exactly as scripts/chess-engine-verify.js checks bank
 * items (the key is the engine's best capture or knight move, and no second one
 * comes within 150 cp; a mate in one is mate). Only items with no flag are kept.
 * Parts go to ../offline-sources/chess/tactics-pool/d<N>.json, so several
 * difficulties can be built at once in separate processes and a stopped build
 * keeps what it finished.
 */
const fs = require('fs');
const path = require('path');

process.env.CHESS_TACTICS_POOL = 'off'; // build live, never from an older pool
const bank = require('../content/bank');
const E = require('../services/chess-engine');
const { checkItem } = require('./chess-engine-verify');

const arg = (name, dflt) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : dflt; };
const PER = Number(arg('per', 300));
const PARTS = path.join(__dirname, '..', '..', 'offline-sources', 'chess', 'tactics-pool');
const OUT = path.join(__dirname, '..', 'content', 'chess-tactics-pool.js');
const key = (it) => `${it.prompt.trim()}||${String(it.answer).trim()}`;

async function build(d) {
  const file = path.join(PARTS, `d${d}.json`);
  const part = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { d, kept: [], dropped: [], tried: 0, gen_ms: 0 };
  const seen = new Set([...part.kept, ...part.dropped].map(key));
  let i = part.tried;
  while (part.kept.length < PER && i < PER * 4) {
    const t0 = Date.now();
    const it = bank.generate({ skillId: 'chess_tactics', difficulty: d, seed: `chess-pool:${d}:${i}` });
    part.gen_ms += Date.now() - t0;
    i++;
    part.tried = i;
    if (seen.has(key(it))) continue;
    seen.add(key(it));
    const r = await checkItem(it, `pool d${d} #${i}`);
    const keep = { fen: it.fen, format: it.format, prompt: it.prompt, answer: it.answer, accepts: it.accepts, rationale: it.rationale, source: 'bank' };
    if (r && r.ok) part.kept.push(keep);
    else part.dropped.push({ ...keep, why: r ? `${r.what}: ${r.detail}` : 'not a move question' });
    if (i % 20 === 0) fs.writeFileSync(file, JSON.stringify(part));
  }
  fs.writeFileSync(file, JSON.stringify(part));
  console.log(`d${d}: kept ${part.kept.length}, dropped ${part.dropped.length}, built ${part.tried} (live build ${Math.round(part.gen_ms / Math.max(1, part.tried))} ms each)`);
}

function merge() {
  const pool = {};
  const lines = [];
  for (let d = 1; d <= 10; d++) {
    const file = path.join(PARTS, `d${d}.json`);
    if (!fs.existsSync(file)) throw new Error(`missing part for difficulty ${d}`);
    const part = JSON.parse(fs.readFileSync(file, 'utf8'));
    pool[d] = part.kept;
    lines.push(`d${d} ${part.kept.length} kept / ${part.dropped.length} dropped / ${Math.round(part.gen_ms / Math.max(1, part.tried))} ms live`);
  }
  const body = Object.entries(pool).map(([d, list]) => `  ${d}: [\n${list.map((it) => `    ${JSON.stringify(it)},`).join('\n')}\n  ],`).join('\n');
  fs.writeFileSync(OUT, `/**
 * Pre-built chess_tactics items ("one capture wins material", "find the knight
 * fork"), by difficulty. Written by scripts/chess-tactics-pool-build.js on
 * ${new Date().toISOString().slice(0, 10)}: each built by the live generator in content/chess-items.js
 * and kept only when Stockfish 19 (on the build machine, 1M nodes) agreed with
 * its key and found no second answer as good. Served by chess_tactics so a
 * request does not run the live search. Do not edit by hand; re-run the build.
 *
 * ${lines.join('\n * ')}
 */
module.exports = {
${body}
};
`);
  console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  lines.forEach((l) => console.log(`  ${l}`));
}

async function main() {
  if (process.argv.includes('--merge')) return merge();
  fs.mkdirSync(PARTS, { recursive: true });
  for (const d of String(arg('d', '1,2,3,4,5,6,7,8,9,10')).split(',').map(Number)) await build(d);
  E.closeAll();
  return null;
}

main().catch((e) => { console.error(e); E.closeAll(); process.exit(1); });
