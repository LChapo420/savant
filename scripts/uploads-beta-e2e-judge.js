/**
 * Every change the real end-to-end run made, read by judges that did not guard it (AI-JUDGED) and by rules (MEASURED): did it do what was asked, did it lose a key point, did it invent a fact.
 *   node scripts/uploads-beta-e2e-judge.js      rows: <OUT_DIR>/e2e-judged.json
 * Judges: N = NVIDIA nemotron, G = Grok 4.3. The guards were DeepSeek and GLM. A sentence labelled as a made-up example or comparison is left out of the fact reading: it is read for being labelled.
 */
const path = require('path');
const L = require('./lib/uploads-beta-lib');

L.setup('e2e-judge');
const J = require('./lib/invented-judges');
const K = require('../services/material-keypoints');
const P = require('../services/material-parts');
const R0 = require('./lib/real-files');

const docs = L.allDocs();
const md = (id) => { const d = docs.find((x) => x.id === id); return L.stripMarks(d.md || d.markdown); };
const SOURCES = {
  'epub-ordinary': () => md('h5'), 'docx-brevity-plain-anxious': () => md('h1'), 'pdf-young-esl-interests': () => md('h2'), 'html-dense-lover': () => md('h4'), 'odt-notes': () => md('h6'),
  'md-three-subjects': () => [md('h2'), md('h3'), md('h4')].join('\n\n'), 'txt-very-short': () => 'Water boils at 100 degrees Celsius at sea level. At higher altitude it boils at a lower temperature because the air pressure is lower.',
  'txt-long': () => docs.map((d) => md(d.id)).join('\n\n'), 'pptx-slides': () => md('h3'), 'pdf-scan': () => md('h6'), spanish: () => R0.SPANISH,
};
const askG = async (a) => { for (let i = 0; i < 4; i += 1) { try { const r = await require('../services/providers/grokified').grokified.structured({ model: 'grok-4.3', ...a, maxTokens: 5000, timeoutMs: 180000 }); if (r && r.data) return r.data; } catch (e) { await new Promise((res) => setTimeout(res, 2000 * (i + 1))); } } return null; };
const ask = (fam, a) => (fam === 'G' ? askG(a) : J.askJ(fam, { ...a, maxTokens: 5000 }));
const flat = (json) => { const out = []; const walk = (x) => { if (typeof x === 'string') out.push(x); else if (Array.isArray(x)) x.forEach(walk); }; try { walk(JSON.parse(json)); } catch { out.push(String(json)); } return out; };
const LABELS = /(?:Made-up example, not from your material:|A comparison, not from your material:|Worked example, made up and not from your material:)[\s\S]*$/;
/** What says something as coming from the material: not the wrong choices of a question (wrong on purpose), not a labelled made-up line, not a form line with no claim of its own (a course-structure line, "Try first"). */
function claims(part, json) {
  let v; try { v = JSON.parse(json); } catch { return [String(json)]; }
  const list = (part === 'question' || part === 'pack question') && Array.isArray(v) ? [v[0], v[2]] : flat(json);
  return list.filter((x) => typeof x === 'string').map((x) => x.replace(LABELS, '').trim()).filter((x) => x && !/^(?:Why it matters: "|Try first:|Stretch:)/.test(x));
}

(async () => {
  const store = L.load(path.join(L.OUT_DIR, 'e2e-real.json'), { rows: [] });
  const outFile = path.join(L.OUT_DIR, 'e2e-judged.json');
  const out = L.load(outFile, { rows: [] });
  const items = store.rows.flatMap((r) => (r.changes || []).filter((c) => c.changed && c.after).map((c) => ({ case: r.id, ...c })));
  await J.pool(items, 3, async (c) => {
    if (out.rows.some((x) => x.case === c.case && x.ref === c.ref && x.change === c.change)) return;
    const source = (SOURCES[c.case] || (() => ''))();
    const before = flat(c.before); const after = flat(c.after);
    const text = claims(c.part, c.after).join('\n');
    const row = { case: c.case, part: c.part, ref: c.ref, change: c.change, words_before: L.words(before.join(' ')), words_after: L.words(after.join(' ')), labelled: LABELS.test(after.join(' ')) };
    const hit = K.extract(source, { plain: source }).key_points;
    row.lost_points = P.lostPoints(before.join(' '), after.join(' '), hit, 0.3).map((k) => k.text.slice(0, 120));
    row.lost_stressed = P.lostPoints(before.join(' '), after.join(' '), hit.filter((k) => k.weight >= 2), 0.3).length;
    for (const fam of ['N', 'G']) {
      // eslint-disable-next-line no-await-in-loop
      const j = await ask(fam, { system: J.SENT_SYS, user: `SOURCE:\n${source.slice(0, 9000)}\n\nSENTENCES:\n${J.sentencesOf(text).slice(0, 40).map((s, i) => `${i + 1}. ${s}`).join('\n')}`, schema: J.SENT_SCHEMA, schemaName: 'check' });
      row[`inv_${fam}`] = j && Array.isArray(j.verdicts) ? j.verdicts.filter((v) => v && v.supported === false).map((v) => `${(J.sentencesOf(text)[v.n - 1] || '').slice(0, 160)}${v.claim ? ` [${String(v.claim).slice(0, 80)}]` : ''}`) : null;
      // eslint-disable-next-line no-await-in-loop
      const d = await ask(fam, { system: 'A learner asked for a change to a study text. Say whether the REWRITE did what was asked and still says every point the ORIGINAL makes (other words are fine). JSON: {"did_it": true|false, "lost": ["a point the rewrite no longer makes"]}.', user: `Asked for: ${c.change === 'custom' ? 'put it as short steps' : c.change === 'fuller' ? 'more detail from the material' : c.change}\n\nORIGINAL:\n${before.join('\n').slice(0, 5000)}\n\nREWRITE:\n${after.join('\n').slice(0, 5000)}`, schema: { type: 'object', properties: { did_it: { type: 'boolean' }, lost: { type: 'array', items: { type: 'string' } } }, required: ['did_it', 'lost'] }, schemaName: 'did' });
      row[`did_${fam}`] = d ? d.did_it : null; row[`lost_${fam}`] = d ? (d.lost || []).slice(0, 5) : null;
    }
    out.rows.push(row); L.save(outFile, out);
  });
  const by = new Map();
  for (const r of out.rows) { const k = `${r.part}/${r.change}`; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const share = (v, f) => { const x = v.filter((r) => f(r) !== null && f(r) !== undefined); return `${x.filter((r) => f(r)).length}/${x.length}`; };
  console.log('part/change            n  words after/before  did it N/G        no point lost N/G   no invented N/G   stressed kept (rule)');
  for (const [k, v] of by) {
    const ratio = v.reduce((n, r) => n + r.words_after / Math.max(1, r.words_before), 0) / v.length;
    console.log(`${k.padEnd(22)} ${String(v.length).padEnd(3)}${ratio.toFixed(2).padEnd(20)}${share(v, (r) => r.did_N).padEnd(7)}${share(v, (r) => r.did_G).padEnd(11)}${share(v, (r) => (r.lost_N ? !r.lost_N.length : null)).padEnd(7)}${share(v, (r) => (r.lost_G ? !r.lost_G.length : null)).padEnd(13)}${share(v, (r) => (r.inv_N ? !r.inv_N.length : null)).padEnd(7)}${share(v, (r) => (r.inv_G ? !r.inv_G.length : null)).padEnd(11)}${v.filter((r) => !r.lost_stressed).length}/${v.length}`);
  }
  const flags = out.rows.flatMap((r) => [...(r.inv_N || []), ...(r.inv_G || [])].map((x) => `${r.part}/${r.change}: ${x}`));
  console.log(`\ninvented, as flagged (${flags.length}):`); flags.slice(0, 30).forEach((x) => console.log(`  ${x.slice(0, 240)}`));
  console.log('spend', JSON.stringify(J.spend));
  process.exit(0);
})();
