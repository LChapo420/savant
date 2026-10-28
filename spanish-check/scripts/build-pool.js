#!/usr/bin/env node
'use strict';
/**
 * Deterministic pool build. Input: raw/ (frozen Tatoeba exports) + overlap-exclusions.json.
 * Output: pool.json. No randomness, no clock: the same inputs give byte-identical output.
 * Usage: node scripts/build-pool.js [--out path]
 */
const fs = require('fs');
const path = require('path');
const { sha256 } = require('../lib/common');
const cand = require('../lib/candidates');

const ROOT = path.join(__dirname, '..');

function build() {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'overlap-exclusions.json'), 'utf8'));
  const excluded = new Set(ex.removed_key_sha256);
  const { candidates, reasons, totalSpanish } = cand.buildCandidates();
  const entries = [];
  const counts = { candidates_before_strata: candidates.length, outside_strata: 0, app_overlap_removed: 0, dropped_unused: 0 };
  for (const c of candidates) {
    const stratum = cand.stratumOf(c.difficulty);
    if (!stratum) { counts.outside_strata++; continue; }
    if (excluded.has(sha256(c.key))) { counts.app_overlap_removed++; continue; }
    const isDist = parseInt(sha256(c.key + '|distractor-partition-v1').slice(0, 8), 16) / 4294967296 < cand.RULES.distractorFraction;
    const L = !!c.audio && !isDist;
    const R = !!c.audio && !!c.en && !isDist;
    const D = !!c.en && isDist;
    if (!L && !R && !D) { counts.dropped_unused++; continue; }
    const e = { id: c.id, key: c.key, text: c.text, words: c.words, difficulty: c.difficulty, stratum };
    e.role = isDist ? 'distractor' : 'item';
    if (!isDist) e.audio = { audio_id: c.audio.audio_id, user: c.audio.user, license: c.audio.license };
    if (c.en) e.en = { id: c.en.id, text: c.en.text };
    e.listen = L; e.read = R;
    entries.push(e);
  }
  entries.sort((a, b) => a.id - b.id);
  const tally = (pred) => { const t = { easy: 0, medium: 0, hard: 0 }; for (const e of entries) if (pred(e)) t[e.stratum]++; return t; };
  const listenN = tally((e) => e.listen); const readN = tally((e) => e.read); const distN = tally((e) => e.role === 'distractor');
  const meta = {
    spec: 'spanish-check pool v1',
    rules: cand.RULES,
    raw_sha256: cand.fileHashes(),
    overlap_exclusions_file_sha256: sha256(fs.readFileSync(path.join(ROOT, 'overlap-exclusions.json'))),
    counts: { ...counts, spanish_sentences_in_corpus: totalSpanish, rejected_by_reason: reasons, entries: entries.length },
    pool_sizes: { listening: listenN, reading: readN, distractor_only: distN },
    strata_weights: {
      listening: Object.fromEntries(Object.keys(listenN).map((s) => [s, listenN[s] / (listenN.easy + listenN.medium + listenN.hard)])),
      reading: Object.fromEntries(Object.keys(readN).map((s) => [s, readN[s] / (readN.easy + readN.medium + readN.hard)])),
    },
  };
  return '{"meta":' + JSON.stringify(meta) + ',\n"entries":[\n' + entries.map((e) => JSON.stringify(e)).join(',\n') + '\n]}\n';
}

if (require.main === module) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? path.resolve(process.argv[i + 1]) : path.join(ROOT, 'pool.json');
  const t0 = Date.now();
  const text = build();
  fs.writeFileSync(out, text);
  const m = JSON.parse(text).meta;
  console.log(`wrote ${out} (${text.length} bytes) in ${Date.now() - t0} ms`);
  console.log('sha256', sha256(text));
  console.log(JSON.stringify(m.pool_sizes), JSON.stringify(m.counts));
}
module.exports = { build };
