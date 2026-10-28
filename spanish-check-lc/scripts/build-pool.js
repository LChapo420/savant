#!/usr/bin/env node
'use strict';
/**
 * Deterministic pool build for the listening-comprehension test.
 * Input: ../spanish-check/raw/ (the same frozen Tatoeba exports as the first test), the first test's
 * overlap-exclusions.json and this test's overlap-exclusions-lc.json. Output: pool.json.
 * No randomness, no clock: the same inputs give byte-identical output.
 * Usage: node scripts/build-pool.js [--out path]
 *
 * Entry roles:
 *   item        has native audio (username + licence) AND an acceptable English translation; can be a question.
 *   distractor  has an acceptable English translation; supplies wrong English options only (never a question, audio not needed).
 */
const fs = require('fs');
const path = require('path');
const { sha256 } = require('../../spanish-check/lib/common');
const cand = require('../../spanish-check/lib/candidates');

const ROOT = path.join(__dirname, '..');
const FIRST = path.join(ROOT, '..', 'spanish-check');
const SALT = 'lc-distractor-partition-v1';
const DISTRACTOR_FRACTION = 0.2;
// extra screen for a test taken at bedtime: no sentence or English option about killing, dying, weapons or violence (on top of the first test's block lists)
const EXTRA_BLOCK_EN = new Set(['kill','kills','killed','killing','killer','murder','murdered','murderer','dead','die','dies','died','dying','death','deaths','suicide','suicidal','hang','hanged','hanging','shot','shoot','shoots','shooting','gun','guns','bomb','bombs','terrorist','terrorists','terrorism','cancer','rapist','weapon','weapons','corpse','blood','war','wars','abuse','abused','abusing','drug','drugs','drunk','heroin','cocaine','torture','tortured','stab','stabbed','victim','victims','attack','attacked','hell','devil']);
const blockedEn = (t) => (t.toLowerCase().match(/[a-z']+/g) || []).some((w) => EXTRA_BLOCK_EN.has(w.replace(/'.*$/, '')));

function build() {
  const ex1 = JSON.parse(fs.readFileSync(path.join(FIRST, 'overlap-exclusions.json'), 'utf8'));
  const ex2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'overlap-exclusions-lc.json'), 'utf8'));
  const excluded = new Set([...ex1.removed_key_sha256, ...ex2.removed_key_sha256]);
  const { candidates, reasons, totalSpanish } = cand.buildCandidates();
  const entries = [];
  const counts = { candidates_before_strata: candidates.length, outside_strata: 0, app_overlap_removed: 0, no_translation: 0, extra_english_screen_removed: 0, no_audio_item_dropped: 0 };
  for (const c of candidates) {
    const stratum = cand.stratumOf(c.difficulty);
    if (!stratum) { counts.outside_strata++; continue; }
    if (excluded.has(sha256(c.key))) { counts.app_overlap_removed++; continue; }
    if (!c.en) { counts.no_translation++; continue; }
    if (blockedEn(c.en.text)) { counts.extra_english_screen_removed++; continue; }
    const isDist = parseInt(sha256(c.key + '|' + SALT).slice(0, 8), 16) / 4294967296 < DISTRACTOR_FRACTION;
    if (!isDist && !c.audio) { counts.no_audio_item_dropped++; continue; }
    const e = { id: c.id, key: c.key, text: c.text, words: c.words, difficulty: c.difficulty, stratum, role: isDist ? 'distractor' : 'item' };
    if (!isDist) e.audio = { audio_id: c.audio.audio_id, user: c.audio.user, license: c.audio.license };
    e.en = { id: c.en.id, text: c.en.text };
    entries.push(e);
  }
  entries.sort((a, b) => a.id - b.id);
  const tally = (role) => { const t = { easy: 0, medium: 0, hard: 0 }; for (const e of entries) if (e.role === role) t[e.stratum]++; return t; };
  const itemsN = tally('item'); const distN = tally('distractor');
  const tot = itemsN.easy + itemsN.medium + itemsN.hard;
  const meta = {
    spec: 'spanish-check-lc pool v1',
    rules: { ...cand.RULES, distractor_partition_salt: SALT, distractor_fraction: DISTRACTOR_FRACTION },
    raw_sha256: cand.fileHashes(),
    overlap_exclusions_first_test_sha256: sha256(fs.readFileSync(path.join(FIRST, 'overlap-exclusions.json'))),
    overlap_exclusions_lc_sha256: sha256(fs.readFileSync(path.join(ROOT, 'overlap-exclusions-lc.json'))),
    counts: { ...counts, spanish_sentences_in_corpus: totalSpanish, rejected_by_reason: reasons, entries: entries.length },
    pool_sizes: { items: itemsN, distractor_only: distN },
    strata_weights: { items: Object.fromEntries(Object.keys(itemsN).map((s) => [s, itemsN[s] / tot])) },
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
