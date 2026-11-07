#!/usr/bin/env node
/**
 * Evidence for every flag of the chosen readers, on one split of the new set: rulings by three families, a passage comparison, a recomputation on math levels. Nothing here decides; score-confirm.js applies the policies.
 *   node scripts/fact-100/run-confirm.js <dev2|heldout|real> <reader,reader,...> [par=3]
 * Rulers see only the lesson and the flags, never planted or clean. TMP/raw-100/confirm.<split>.jsonl, resumable.
 */
const C = require('./common');
const { L } = C;
const J = require('../fact-gate/judges');
const G = require('../../services/fact-gate');
const S = require('../../services/fact-source');
const T = require('../../services/fact-textbooks');
const D = require('../../services/fact-dictionary');
const F = require('../../services/fact-compute');

const [, , SPLIT = 'dev2', READERS = 'kimi31,grok43,ds41_coral,compute_ds41_coral,code', PAR = '3'] = process.argv;
const readers = READERS.split(',');
const SET = SPLIT === 'real' ? 'real' : 'heldout';
const OUT = L.path.join(C.RAW, `confirm.${SPLIT}.jsonl`);
const RULERS = ['ds41_coral', 'grok43', 'glm_flash_munito'];
const DECIDE_SCHEMA = { type: 'object', required: ['rulings'], properties: { rulings: { type: 'array', items: { type: 'object', required: ['flag', 'real', 'reason'], properties: { flag: { type: 'integer' }, real: { type: 'boolean' }, reason: { type: 'string' } } } } } };
const SRC_SYSTEM = 'You compare a sentence from a lesson with passages from a reference. Answer ONLY from the passages, never from what you remember. supported: the passages say the same thing. contradicted: the passages clearly say otherwise. silent: the passages do not settle it (the most common answer). If supported or contradicted, quote the deciding words exactly.';
const SRC_SCHEMA = { type: 'object', required: ['verdict', 'quote'], properties: { verdict: { type: 'string', enum: ['supported', 'contradicted', 'silent'] }, quote: { type: 'string' } } };
const RECOMP_SYSTEM = `${F.TRANSCRIBE_SYSTEM}\n\nThis time only transcribe the quoted assertions listed under FLAGS, as the lesson states them, using the lesson for what their letters and functions mean. Give the flag number in "where" as "flag N".`;
const words = (s) => new Set((String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2));
const overlap = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, Math.min(a.size, b.size)); };
const part = (w) => { const m = /(block|check)\s*#?\s*(\d+)/i.exec(w || ''); return m ? `${m[1].toLowerCase()}${m[2]}` : '?'; };

function merged(id, rawBy) {
  const out = [];
  for (const r of readers) {
    const row = rawBy[r].get(id); if (!row) continue;
    for (const f of row.flags || []) {
      const p = part(f.where); const w = words(`${f.claim || ''} ${f.why || ''}`); const q = words(f.claim || '');
      const hit = out.find((x) => x.part === p && (overlap(x.q, q) >= 0.5 || overlap(x.w, w) >= 0.45));
      if (hit) { if (!hit.raisers.includes(r)) hit.raisers.push(r); hit.sources.push({ r, claim: f.claim, why: f.why, truth: f.truth }); } else out.push({ part: p, where: f.where, claim: String(f.claim || ''), why: String(f.why || ''), truth: String(f.truth || ''), raisers: [r], q, w, sources: [{ r, claim: f.claim, why: f.why, truth: f.truth }] });
    }
  }
  return out;
}

async function sourceOf(flag, lv) {
  const claim = flag.claim.slice(0, 400);
  if (claim.length < 8) return { verdict: null };
  const docs = [];
  if (lv.track === 'spanish') docs.push(...await D.passagesFor(claim, 'Spanish', 2));
  if (lv.track === 'math') docs.push(...T.search(claim, { track: 'math', k: 3 }));
  docs.push(...await S.fromOffline(claim, { topic: `${lv.track} ${lv.grade}`.replace(/_/g, ' '), k: 3 }));
  if (!docs.length) return { verdict: 'silent', cost: 0 };
  const r = await J.callModel('ds41_coral', { system: SRC_SYSTEM, user: `LESSON SENTENCE (subject: ${lv.track} ${lv.grade}): ${claim}\n\nPASSAGES\n${docs.map((d, i) => `[${i + 1}] ${d.title}: ${d.text}`).join('\n')}`, schema: SRC_SCHEMA, schemaName: 'submit_verdict', maxTokens: 800 });
  let v = r.data.verdict;
  if (v !== 'silent' && !docs.some((d) => d.text.toLowerCase().includes(String(r.data.quote || '').toLowerCase().slice(0, 40)))) v = 'silent';
  return { verdict: v, quote: String(r.data.quote || '').slice(0, 200), title: v !== 'silent' ? docs[0].title : '', cost: r.cost || 0 };
}

(async () => {
  const set = C.loadSet(SET);
  const inSplit = SPLIT === 'real' ? () => true : (x) => x.split === SPLIT;
  const fixtures = [...set.clean.filter(inSplit).map((c) => ({ id: `clean:${c.level}`, level: c.level, edits: [] })), ...set.plants.filter(inSplit).map((p) => ({ id: p.id, level: p.level, edits: p.edits }))];
  const rawBy = {};
  for (const r of readers) rawBy[r] = new Map(C.readRaw(r, SET).filter((x) => x.read).map((x) => [x.id, x]));
  const levels = C.levelMap();
  const done = new Set(L.readJsonl(OUT).map((r) => r.id));
  let cost = 0;
  await L.runPool(fixtures.filter((f) => !done.has(f.id)), Number(PAR), async (fx) => {
    const lv = fx.edits.length ? L.applyEdits(levels.get(fx.level), fx.edits) : levels.get(fx.level);
    const flags = merged(fx.id, rawBy);
    const clean = flags.map((f) => ({ where: f.where, claim: f.claim.slice(0, 400), why: f.why.slice(0, 400), truth: f.truth.slice(0, 200), raisers: f.raisers, sources: f.sources.map((s) => ({ r: s.r, claim: String(s.claim || '').slice(0, 300), why: String(s.why || '').slice(0, 300), truth: String(s.truth || '').slice(0, 200) })), rulings: {}, source: null, recompute: null }));
    if (!flags.length) { L.appendJsonl(OUT, { id: fx.id, level: fx.level, flags: [], cost: 0 }); return; }
    let fixCost = 0;
    const user = `${J.render(lv)}\n\nFLAGS\n${clean.map((f, i) => `FLAG ${i} at ${f.where}: "${f.claim.slice(0, 300)}": ${f.why.slice(0, 300)} ${f.truth ? `(suggested truth: ${f.truth.slice(0, 200)})` : ''}`).join('\n')}`;
    await Promise.all(RULERS.map(async (ruler) => {
      for (let a = 0; a < 3; a++) {
        try {
          const r = await J.callModel(ruler, { system: G.DECIDE_SYSTEM, user, schema: DECIDE_SCHEMA, schemaName: 'submit_rulings', maxTokens: 6000 }); // eslint-disable-line no-await-in-loop
          fixCost += r.cost || 0;
          (r.data.rulings || []).forEach((x, i) => { const k = Number.isInteger(x.flag) ? x.flag : i; if (clean[k]) clean[k].rulings[ruler] = !!x.real; });
          return;
        } catch (e) { if (a === 2) console.log('ruler fail', ruler, fx.id, String(e.message).slice(0, 80)); await L.sleep(3000 * (a + 1)); } // eslint-disable-line no-await-in-loop
      }
    }));
    for (const f of clean) { // eslint-disable-line no-restricted-syntax
      try { const s = await sourceOf(f, lv); f.source = s.verdict; f.sourceQuote = s.quote; f.sourceTitle = s.title; fixCost += s.cost || 0; } catch (e) { f.source = null; } // eslint-disable-line no-await-in-loop
    }
    if (lv.track === 'math') {
      try {
        const r = await J.callModel('grok43', { system: RECOMP_SYSTEM, user: `${J.render(lv)}\n\nFLAGS\n${clean.map((f, i) => `FLAG ${i}: "${f.claim.slice(0, 300)}"`).join('\n')}`, schema: F.TRANSCRIBE_SCHEMA, schemaName: 'submit_statements', maxTokens: 3000 });
        fixCost += r.cost || 0;
        const st = (r.data.statements || []).map((s, id) => ({ ...s, id }));
        const res = await F.compute(st);
        st.forEach((s, i) => { const m = /flag\s*(\d+)/i.exec(s.where || ''); const f = m && clean[Number(m[1])]; const v = (res[i] || {}).verdict; if (!f || !v || v === 'unknown') return; if (v === 'false') f.recompute = 'false'; else if (f.recompute !== 'false') f.recompute = 'true'; });
      } catch (e) { console.log('recompute fail', fx.id, String(e.message).slice(0, 80)); }
    }
    L.appendJsonl(OUT, { id: fx.id, level: fx.level, flags: clean, cost: fixCost });
    cost += fixCost;
  });
  console.log(`RESULT confirm ${SPLIT}: $${cost.toFixed(3)} ${JSON.stringify(require('../../services/run-cap').summary()).slice(0, 170)}`);
  process.exit(0);
})();
