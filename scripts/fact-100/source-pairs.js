#!/usr/bin/env node
/**
 * Can text comparison tell a true sentence from its planted wrong twin? Dev set only, for go or no-go and thresholds.
 * For every text plant: the sentence as written (true) and as planted (wrong). Passages are found from each sentence's own words (no peeking):
 *   wiki   offline Wikipedia and Wiktionary
 *   bank   the level's own clean claims (the frozen-facts case: a rewrite is compared with facts that passed)
 * Prints: support for true and wrong, how often the wrong twin falls below at each threshold. TMP/raw-100/pairs.<set>.jsonl holds the scores; resumable.
 *   node scripts/fact-100/source-pairs.js <dev|heldout> [wiki|bank]
 */
const C = require('./common');
const { L } = C;
const S = require('../../services/fact-source');

const [, , SET = 'dev', MODE = 'bank'] = process.argv;
const OUT = L.path.join(C.RAW, `pairs.${MODE}.${SET}.jsonl`);
const claims = new Map(L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl')).map((r) => [r.level, r.claims]));
const decode = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };

function sentenceAround(text, phrase, at) {
  const i = at >= 0 ? at : text.indexOf(phrase);
  if (i < 0) return null;
  const left = Math.max(text.lastIndexOf('. ', i), text.lastIndexOf('":"', i), text.lastIndexOf('","', i), text.lastIndexOf('? ', i), text.lastIndexOf('! ', i));
  const ends = ['. ', '"', '? ', '! '].map((e) => text.indexOf(e, i + phrase.length)).filter((x) => x >= 0);
  const right = ends.length ? Math.min(...ends) : text.length;
  return decode(text.slice(left < 0 ? 0 : left + (text[left] === '"' ? 3 : 2), right + 1).replace(/"$/, '')).trim();
}

(async () => {
  const tb = C.loadSet(SET);
  const levels = C.levelMap();
  const done = new Set(L.readJsonl(OUT).map((r) => r.id));
  const items = tb.plants.filter((p) => p.edits[0] && p.edits[0].original && !done.has(p.id));
  let n = 0;
  for (const p of items) {
    const e = p.edits[0]; const lv = levels.get(p.level);
    const raw = L.partText(lv, e.word, Number(e.index)); if (!raw) continue;
    const at = raw.indexOf(e.original); if (at < 0) continue;
    // Locate the first character that differs, so the sentence is the one the plant touches.
    let d = 0; while (d < e.original.length && e.original[d] === e.wrong[d]) d++;
    const clean = sentenceAround(raw, e.original.slice(d, d + 1) || e.original, at + d);
    const changed = raw.slice(0, at) + e.wrong + raw.slice(at + e.original.length);
    const bad = sentenceAround(changed, e.wrong.slice(d, d + 1) || e.wrong, at + d);
    if (!clean || !bad || clean === bad) continue;
    const facts = (claims.get(p.level) || []).filter((c) => !['illustration', 'pedagogy'].includes(c.type));
    const one = async (claim) => {
      const docs = MODE === 'bank' ? (() => { const top = S.fromBank(claim, facts, 5); return top.length ? [{ source: 'bank', title: 'bank', text: top.map((x) => x.text).join(' ') }] : []; })() : await S.fromOffline(claim, { topic: `${lv.track} ${lv.grade}` });
      if (!docs.length) return { factcg: 0, minicheck: 0, docs: 0 };
      const sc = await S.stage1(docs.map((x) => ({ doc: x.text, claim })));
      let best = sc[0]; for (const s of sc) if (S.strength(s) > S.strength(best)) best = s;
      return { ...best, docs: docs.length };
    };
    // eslint-disable-next-line no-await-in-loop
    const [t, w] = [await one(clean), await one(bad)];
    L.appendJsonl(OUT, { id: p.id, kind: p.kind, track: p.track, clean: clean.slice(0, 300), bad: bad.slice(0, 300), t, w });
    if (++n % 25 === 0) console.log(n, 'of', items.length);
  }
  const rows = L.readJsonl(OUT);
  const test = (name, f) => { const fa = rows.filter((r) => !f(r.t)).length; const hit = rows.filter((r) => !f(r.w)).length; console.log(name.padEnd(30), `wrong twin below: ${L.fmtRate(hit, rows.length)}; true twin below: ${L.fmtRate(fa, rows.length)}`); };
  console.log(`${SET} ${MODE}, pairs ${rows.length}`);
  for (const th of [0.3, 0.5, 0.7, 0.9]) { test(`both>=${th}`, (s) => s.factcg >= th && s.minicheck >= th); test(`factcg>=${th}`, (s) => s.factcg >= th); test(`minicheck>=${th}`, (s) => s.minicheck >= th); }
  const drop = rows.filter((r) => S.strength(r.w) < S.strength(r.t) - 0.05).length;
  console.log('wrong twin scores lower than true by .05:', L.fmtRate(drop, rows.length));
  for (const k of [...new Set(rows.map((r) => r.kind))]) { const rs = rows.filter((r) => r.kind === k); console.log(' ', k.padEnd(28), `n=${rs.length} wrong below both>=.5: ${rs.filter((r) => !(r.w.factcg >= 0.5 && r.w.minicheck >= 0.5)).length}, true below: ${rs.filter((r) => !(r.t.factcg >= 0.5 && r.t.minicheck >= 0.5)).length}`); }
  process.exit(0);
})();
