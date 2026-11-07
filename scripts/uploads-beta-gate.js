/**
 * The goal's reading against today's course, on real builds of the held-out handouts, with the same exam as docs/UPLOADS-ANY-FORMAT.md sections 13 and 17 (AI-JUDGED, SIMULATED; never a real learner).
 *
 *   node scripts/uploads-beta-gate.js exam [ids]      each arm answered by each judge, row per document (resumes)
 *   node scripts/uploads-beta-gate.js invented [ids]  the calibrated sentence-by-sentence judge over each arm's reading
 *   node scripts/uploads-beta-gate.js report
 *
 * The arms read ONLY the lesson text (no questions) unless the name says whole: a harder test than the rounds before, where the exam read the questions too.
 * Judges: Z = Gonka GLM 5.3 Flash, G = Grok 4.3 at Grokified; neither is the builder's family. The noise row is the same text answered twice.
 */
const path = require('path');
const L = require('./lib/uploads-beta-lib');

L.setup('gate');
const fs = require('fs');
const O = require('../services/material-optimize');
const J = require('./lib/invented-judges');

const OUT = path.join(L.OUT_DIR, 'gate-exam.json');
const INV = path.join(L.OUT_DIR, 'gate-invented.json');
const JUDGES = (process.env.UB_JUDGES || 'Z,G').split(',');
const callOld = J.call;
const askG = async (a) => {
  const r = await require('../services/providers/grokified').grokified.structured({ model: 'grok-4.3', ...a, maxTokens: a.maxTokens || 4000, timeoutMs: 240000 });
  if (!r || !r.data) throw new Error('no data');
  return r.data;
};
const LJ = {
  ...J,
  askJ: async (fam, a) => {
    if (fam !== 'G') return J.askJ(fam, a);
    for (let i = 0; i < 4; i++) { try { return await askG(a); } catch (e) { await new Promise((res) => setTimeout(res, 2500 * (i + 1))); } }
    return null;
  },
};
void callOld;

const reading = (course, v) => course.skills.map((s) => { const h = v.skills.get(s.id); return [`## ${s.title}`, ...h.paragraphs, ...h.key_points].join('\n'); }).join('\n\n');
const readingToday = (course) => course.skills.map((s) => [`## ${s.title}`, ...s.lesson.paragraphs, ...(s.lesson.key_points || [])].join('\n')).join('\n\n');
const questionsText = (qs) => qs.map((q) => `Q: ${q.prompt} A: ${q.type === 'short_answer' ? q.answer : (q.choices || [])[q.answer_index]}. ${q.explanation || ''}`).join('\n');
const whole = (course, v) => course.skills.map((s) => {
  const h = v ? v.skills.get(s.id) : null;
  const para = h ? [...h.paragraphs, ...h.key_points] : [...s.lesson.paragraphs, ...(s.lesson.key_points || [])];
  const qs = h ? (s.questions || []).filter((q) => h.focus.slice(0, Math.max(2, h.checks)).includes(q.id)) : s.questions;
  return [`## ${s.title}`, ...para, questionsText(qs)].join('\n');
}).join('\n\n');

function arms(c) {
  const mk = (goal, lean) => O.optimize({ course: c.course, text: c.plain, keyPoints: c.key_points, goal, lean });
  const full = mk('full', false); const lean = mk('full', true); const test = mk('test', false); const core = mk('core', false);
  return {
    today_whole: { text: whole(c.course, null) },
    today: { text: readingToday(c.course) },
    full: { text: reading(c.course, full), stats: full.stats },
    lean: { text: reading(c.course, lean), stats: lean.stats, whole: whole(c.course, lean) },
    test: { text: reading(c.course, test), stats: test.stats },
    core: { text: reading(c.course, core), stats: core.stats },
    core_open: { text: `${reading(c.course, core)}\n\n${[...core.skills.values()].flatMap((s) => s.aside).join('\n')}`, stats: core.stats },
  };
}
const docsOf = () => fs.readdirSync(path.join(L.OUT_DIR, 'courses')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));

async function runExam(ids) {
  const store = L.load(OUT, { rows: [] });
  const docs = docsOf().filter((d) => !ids.length || ids.includes(d));
  await J.pool(docs, Number(process.env.UB_CONC || 2), async (id) => {
    const c = L.load(path.join(L.OUT_DIR, 'courses', `${id}.json`));
    if (!c.exam || !c.exam.length) { console.log(id, 'no exam'); return; }
    const a = arms(c);
    for (const name of Object.keys(a)) {
      for (const fam of JUDGES) {
        if (store.rows.some((r) => r.doc === id && r.arm === name && r.fam === fam)) continue;
        // eslint-disable-next-line no-await-in-loop
        const ans = await L.examRun(LJ, fam, a[name].text, c.exam, 4);
        store.rows.push({ doc: id, arm: name, fam, words: L.words(a[name].text), source: L.words(c.plain), emph: L.byKind(c.exam, ans, 'emphasised'), plain: L.byKind(c.exam, ans, 'plain'), n_emph: c.exam.filter((q) => q.kind === 'emphasised').length, n_plain: c.exam.filter((q) => q.kind === 'plain').length, answers: ans, stats: a[name].stats ? { facts: a[name].stats.facts, in: a[name].stats.facts_in_reading, stressed: a[name].stats.stressed, stressed_in: a[name].stats.stressed_in_reading, checks: a[name].stats.checks } : null });
        L.save(OUT, store);
        const r = store.rows[store.rows.length - 1];
        console.log(`${id} ${name} ${fam}: ${r.words}w (${(r.words / r.source).toFixed(2)}x) emph ${r.emph == null ? '-' : Math.round(r.emph * 100)} plain ${r.plain == null ? '-' : Math.round(r.plain * 100)}`);
      }
    }
    // Noise: the same text answered again.
    for (const fam of JUDGES) {
      if (store.rows.some((r) => r.doc === id && r.arm === 'noise_today' && r.fam === fam)) continue;
      // eslint-disable-next-line no-await-in-loop
      const ans = await L.examRun(LJ, fam, a.today.text, c.exam, 4);
      store.rows.push({ doc: id, arm: 'noise_today', fam, words: L.words(a.today.text), source: L.words(c.plain), emph: L.byKind(c.exam, ans, 'emphasised'), plain: L.byKind(c.exam, ans, 'plain'), answers: ans });
      L.save(OUT, store);
    }
  });
}

async function runInvented(ids) {
  const store = L.load(INV, { rows: [] });
  const docs = docsOf().filter((d) => !ids.length || ids.includes(d));
  await J.pool(docs, 2, async (id) => {
    const c = L.load(path.join(L.OUT_DIR, 'courses', `${id}.json`));
    const a = arms(c);
    for (const name of ['today', 'full', 'lean', 'core']) {
      for (const fam of JUDGES) {
        if (store.rows.some((r) => r.doc === id && r.arm === name && r.fam === fam)) continue;
        // eslint-disable-next-line no-await-in-loop
        const got = await (fam === 'G' ? (async () => {
          const all = J.sentencesOf(a[name].text); const flagged = [];
          for (let at = 0; at < all.length; at += 30) {
            const batch = all.slice(at, at + 30);
            // eslint-disable-next-line no-await-in-loop
            const j = await LJ.askJ('G', { system: J.SENT_SYS, user: `SOURCE:\n${c.plain.slice(0, 8000)}\n\nSENTENCES:\n${batch.map((s, i) => `${i + 1}. ${s}`).join('\n')}`, schema: J.SENT_SCHEMA, schemaName: 'check', maxTokens: 6000 });
            if (!j || !Array.isArray(j.verdicts)) return null;
            for (const v of j.verdicts) if (v && v.supported === false && batch[v.n - 1]) flagged.push(`${batch[v.n - 1]}${v.claim ? ` [${v.claim}]` : ''}`);
          }
          return flagged;
        })() : J.judge(fam, 'sent', c.plain, a[name].text));
        store.rows.push({ doc: id, arm: name, fam, flagged: got });
        L.save(INV, store);
        console.log(`${id} ${name} ${fam}: ${got ? got.length : 'no answer'} flagged`);
      }
    }
  });
}

function report() {
  const store = L.load(OUT, { rows: [] });
  const pct = (x) => (x == null ? '  -' : String(Math.round(x * 100)).padStart(3));
  const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
  const docs = [...new Set(store.rows.map((r) => r.doc))].sort();
  const armNames = ['today_whole', 'today', 'noise_today', 'full', 'lean', 'test', 'core', 'core_open'];
  console.log(`${docs.length} documents; judges ${JUDGES.join(', ')}`);
  for (const fam of JUDGES) {
    console.log(`\njudge ${fam}: mean over documents`);
    for (const arm of armNames) {
      const rows = store.rows.filter((r) => r.fam === fam && r.arm === arm);
      if (!rows.length) continue;
      const share = mean(rows.map((r) => r.words / r.source));
      const sameDocs = rows.map((r) => r.doc);
      const base = store.rows.filter((r) => r.fam === fam && r.arm === 'today_whole' && sameDocs.includes(r.doc));
      const diffs = rows.map((r) => { const b = base.find((x) => x.doc === r.doc); return b ? { d: r.doc, e: r.emph != null && b.emph != null ? r.emph - b.emph : null, p: r.plain != null && b.plain != null ? r.plain - b.plain : null } : null; }).filter(Boolean);
      const worstP = diffs.reduce((w, x) => (x.p != null && (w == null || x.p < w.p) ? x : w), null);
      const worstE = diffs.reduce((w, x) => (x.e != null && (w == null || x.e < w.e) ? x : w), null);
      console.log(`  ${arm.padEnd(12)} ${share.toFixed(2)}x  emph ${pct(mean(rows.map((r) => r.emph)))}  plain ${pct(mean(rows.map((r) => r.plain)))}  n=${rows.length}  vs today whole: emph ${pct(mean(diffs.map((x) => x.e)))} (worst ${worstE ? `${pct(worstE.e)} ${worstE.d}` : '-'})  plain ${pct(mean(diffs.map((x) => x.p)))} (worst ${worstP ? `${pct(worstP.p)} ${worstP.d}` : '-'})`);
    }
  }
  const inv = L.load(INV, { rows: [] });
  if (inv.rows.length) {
    console.log('\ninvented facts per course, sentence-by-sentence judge');
    for (const fam of JUDGES) for (const arm of ['today', 'full', 'lean', 'core']) {
      const rows = inv.rows.filter((r) => r.fam === fam && r.arm === arm && r.flagged);
      if (rows.length) console.log(`  ${fam} ${arm.padEnd(6)} ${(rows.reduce((n, r) => n + r.flagged.length, 0) / rows.length).toFixed(2)} (none in ${rows.filter((r) => !r.flagged.length).length} of ${rows.length})`);
    }
  }
  console.log('\nspend (this process)', JSON.stringify(J.spend));
}

(async () => {
  const cmd = process.argv[2];
  const ids = process.argv.slice(3);
  if (cmd === 'exam') await runExam(ids);
  else if (cmd === 'invented') await runInvented(ids);
  else report();
  console.log('spend', JSON.stringify(J.spend));
  process.exit(0);
})();
