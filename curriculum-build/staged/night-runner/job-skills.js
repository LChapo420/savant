/**
 * Job 5: the skill-curricula changes in staged/skills/lesson-changes.json (3 new lessons:
 * bb-sample-B04, bb-cold-B05, pi-interleave-P05; fixes: the aim cue B03/B07, the FIBA
 * semicircle B06, the optional P04 swap).
 *
 *   draft    MiniMax drafts each new lesson's line again from its spec (lesson-specs.json)
 *            and the line format "[Tag] Title | description", and reviews each fix
 *   code     the line format; verify-skill-curricula.js (the subjects' own validate.js on a
 *            scratch copy, the rule facts, the recomputed numbers) is run on the staged set
 *   judges   MiniMax (separate review pass) and another family each judge every final line
 *   sources  offline Wikipedia passages for each line's claim, read by MiniMax, quote verbatim
 * Output: staged/skills/night/lesson-changes.night.json. Nothing live is written.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const core = require('./core');

const { ROOT, log, minimax, judgeB, kinds } = core;
const offline = require(path.join(ROOT, 'services', 'offline-facts.js'));

const SK = path.join(ROOT, 'curriculum-build', 'staged', 'skills');
const OUT = path.join(SK, 'night');
fs.mkdirSync(OUT, { recursive: true });

const DRAFT_SYSTEM = `You write one lesson line for a skill curriculum (basketball or piano) in the exact format:
[Tag] Title In Title Case | One-sentence description of what the learner does and why.
The title is at most 9 words; the description is one sentence of at most 32 words, concrete (what to do, how much), and says why in a clause that is true and supported by the research named. Use only claims the spec's facts support; no numbers that the facts do not give.`;
const DRAFT_SCHEMA = { type: 'object', properties: { line: { type: 'string' }, claims: { type: 'array', items: { type: 'string' } } }, required: ['line', 'claims'] };
const REVIEW_SYSTEM = `You review lesson lines for skill curricula (basketball, piano) in a learning app. Each item gives a line (the final wording), the reason for the change and its evidence.
Decide: verdict "correct" if every claim in the line is true and supported by the stated evidence and it is safe and suitable for its learners, else "wrong"; issue: "" or what is wrong; better: "" or a corrected line in the same format.`;
const REVIEW_SCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, verdict: { type: 'string', enum: ['correct', 'wrong'] }, issue: { type: 'string' }, better: { type: 'string' } }, required: ['index', 'verdict', 'issue', 'better'] } } }, required: ['verdicts'] };
const itemText = (it, i) => `Item ${i} [${it.subject}, ${it.draft}${it.anchor ? `, after "${it.anchor}"` : ''}]\nLINE: ${it.line}\nWHY: ${it.why}`;
kinds['skill-review'] = { system: REVIEW_SYSTEM, schema: REVIEW_SCHEMA, batch: 7, maxTokens: 6000, render: itemText };
const SOURCE_SYSTEM = `You check one claim against encyclopedia passages (offline Wikipedia). Use ONLY the passages. verdict "supports" if a passage states the claim (or its substance), "contradicts" if a passage states the opposite, "not_addressed" otherwise. quote: the exact sentence copied character for character ("" if not_addressed). article: its title.`;
const SOURCE_SCHEMA = { type: 'object', properties: { verdict: { type: 'string', enum: ['supports', 'contradicts', 'not_addressed'] }, quote: { type: 'string' }, article: { type: 'string' } }, required: ['verdict', 'quote', 'article'] };
const LINE_RE = /^\[[A-Za-z][A-Za-z ]+\] [^|]{3,90} \| [^|]{20,260}$/;
const nm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const loose = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, '');

async function sourceOf(job, claim, topic) {
  let ps = [];
  try { ps = await offline.retrieve(claim, { topic, k: 4, embed: false }); } catch { return { verdict: 'retrieval failed' }; }
  if (!ps.length) return { verdict: 'nothing found' };
  const r = await minimax({ job, system: SOURCE_SYSTEM, user: `Claim: ${claim}\n\nPassages:\n${ps.map((p, i) => `[${i}] ${p.title}\n${p.text}`).join('\n\n')}`, schema: SOURCE_SCHEMA, schemaName: 'submit_source_check', maxTokens: 3000 }).catch(() => null);
  const v = r && r.data;
  if (!v) return { verdict: 'no answer' };
  const p = v.quote && loose(v.quote).length >= 20 ? ps.find((x) => loose(x.text).includes(loose(v.quote))) : null;
  return { ...v, verbatim: !!p, url: p ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/\s+/g, '_'))}` : null };
}

async function run() {
  const job = 'skills';
  const outFile = path.join(OUT, 'lesson-changes.night.json');
  if (fs.existsSync(outFile)) { log('skills: already staged'); return; }
  const { changes } = JSON.parse(fs.readFileSync(path.join(SK, 'lesson-changes.json'), 'utf8'));
  const specs = JSON.parse(fs.readFileSync(path.join(SK, 'lesson-specs.json'), 'utf8')).specs;
  const specFor = (c) => specs.find((s) => s.draft === c.draft && s.subject === c.subject && (!c.anchor || s.insert_after === c.anchor));
  const items = [];
  for (const c of changes) {
    const it = { id: c.id, subject: c.subject, draft: c.draft, action: c.action, anchor: c.anchor, why: c.why, evidence: c.evidence, staged_line: c.line || c.to || null, line: c.line || c.to || `${c.a} <-> ${c.b}` };
    if (c.action === 'insert_after') {
      const spec = specFor(c);
      // eslint-disable-next-line no-await-in-loop
      const d = await minimax({ job, system: DRAFT_SYSTEM, user: `Spec:\n${JSON.stringify(spec || c, null, 1)}\n\nThe staged line (for reference; improve it only if needed): ${c.line}\nWrite the line.`, schema: DRAFT_SCHEMA, schemaName: 'submit_line', maxTokens: 6000 }).catch((err) => { if (err.fatal) throw err; return { data: { line: c.line, claims: [] } }; });
      it.minimax_draft = d.data.line;
      it.claims = d.data.claims;
      it.format_ok = { staged: LINE_RE.test(c.line), minimax: LINE_RE.test(d.data.line) };
    }
    items.push(it);
  }
  // both drafts of each new lesson are judged; the fixes' final lines too
  const toJudge = items.flatMap((it) => (it.minimax_draft ? [{ ...it, which: 'staged' }, { ...it, which: 'minimax', line: it.minimax_draft }] : [{ ...it, which: 'staged' }]));
  const [a, bs] = await Promise.all([
    minimax({ job, system: REVIEW_SYSTEM, user: `${toJudge.map(itemText).join('\n\n')}\n\nReturn one verdict per item, with its index.`, schema: REVIEW_SCHEMA, schemaName: 'submit_verdicts', maxTokens: 12000 }).catch((err) => { if (err.fatal) throw err; log(`skills: judge A failed: ${err.message}`); return { data: null, model: null }; }),
    Promise.all(toJudge.map((t) => judgeB(job, 'skill-review', t))),
  ]);
  const byA = new Map(((a.data && a.data.verdicts) || []).map((v) => [v.index, v]));
  const judged = await Promise.all(toJudge.map(async (t, i) => {
    const src = await sourceOf(job, (t.claims && t.claims[0]) || t.why.slice(0, 300), `${t.subject} practice`);
    return { id: t.id, which: t.which, line: t.line, judge_a: byA.get(i) || null, model_a: a.model, judge_b: bs[i] && bs[i].v, model_b: bs[i] && bs[i].model, source: src };
  }));
  let verify = null;
  try {
    const outp = execFileSync(process.execPath, [path.join(SK, 'verify-skill-curricula.js')], { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60000, env: { ...process.env, NODE_PATH: path.join(ROOT, '..', 'node_modules') } });
    verify = { ok: !/^FAIL/m.test(outp), output_tail: outp.split('\n').slice(-12).join('\n') };
  } catch (err) { verify = { ok: false, error: String(err.message).slice(0, 600), output_tail: String(err.stdout || '').split('\n').slice(-15).join('\n') }; }
  const final = items.map((it) => {
    const js = judged.filter((j) => j.id === it.id);
    const good = js.filter((j) => j.judge_a && j.judge_a.verdict === 'correct' && j.judge_b && j.judge_b.verdict === 'correct');
    const pick = good.find((j) => j.which === 'staged') || good[0] || null;
    return { ...it, judged: js, chosen: pick ? { which: pick.which, line: pick.line } : null, status: pick ? `verified: code + MiniMax review + ${pick.model_b}${pick.source && pick.source.verbatim && pick.source.verdict === 'supports' ? ' + offline source' : ' (no offline source settles it; evidence is the cited paper)'}` : 'needs owner: a judge called every version wrong (see judged)' };
  });
  fs.writeFileSync(outFile, JSON.stringify({ generated: new Date().toISOString(), note: 'Staged; nothing applied. verify-skill-curricula.js result is for the staged lesson-changes.json.', verify, changes: final }, null, 1));
  log(`skills: staged ${final.filter((f) => f.chosen).length}/${final.length} verified; verify-skill-curricula ok=${verify && verify.ok}`);
}

module.exports = { run };
