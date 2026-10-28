/**
 * Typed-answer grading, measured: the layered grader (services/typed-grading.js) on the
 * labelled cases (curriculum-build/grading-cascade/cases.json, built by
 * scripts/grading-cases-build.js).
 *
 *   node scripts/grading-cascade-eval.js --collect [--judges ultra,lightning,glm-max] [--limit N]
 *       ask each judge every case the rules and the deterministic checks leave open;
 *       every vote is cached (curriculum-build/grading-cascade/votes-cache.json), so a
 *       re-run only asks what is missing
 *   node scripts/grading-cascade-eval.js --report [--write]
 *       no calls: replay every policy candidate over the cached votes, rank them
 *       (0 false accepts first, then accuracy, then latency), write REPORT.md/.json;
 *       --write puts the winner into config/model-lineup.json "grading"
 *
 * Calls allowed (owner's rules for 2026-10-23): NVIDIA (free, paced), local Ollama,
 * OpenRouter `:free` models only (zero price verified per model, OpenRouter's own
 * spend counter read before and after). Every paid key is blanked first; Gemini is
 * blanked too until its free tier is confirmed. No Anthropic call, no Jev call.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i === -1) return null; const v = args[i + 1]; return v && !v.startsWith('--') ? v : true; };

for (const k of ['ANTHROPIC_API_KEY', 'FACT_CHECK_ANTHROPIC_KEY', 'FACT_CHECK_ANTHROPIC_WORKSPACE', 'MIMO_API_KEY', 'GEMINI_API_KEY', 'MODELFLARE_API_KEY',
  'OPENROUTER_GLM_API_KEY', 'OPENROUTER_DEEPSEEK_API_KEY', 'OPENROUTER_GPT_SOL_API_KEY', 'OPENROUTER_BUNNY_API_KEY']) process.env[k] = '';
process.env.JEV_ENABLED = '0';
const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
const here = path.join(ROOT, '.env');
dotenv.config({ path: fs.existsSync(here) ? here : path.join(ROOT, '..', '.env') });
if (!process.env.NVIDIA_RPM) process.env.NVIDIA_RPM = '24'; // the key is shared with the other agents tonight
if (!process.env.NVIDIA_CONCURRENCY) process.env.NVIDIA_CONCURRENCY = '12';

const grading = require('../services/grading');
const tg = require('../services/typed-grading');
const free = require('../services/providers/free-apis');

const OUT = path.join(ROOT, 'curriculum-build', 'grading-cascade');
const CASES = path.join(OUT, 'cases.json');
const CACHE = path.join(OUT, 'votes-cache.json');
const REPORT = path.join(OUT, 'REPORT.md');
const LINEUP = process.env.MODEL_LINEUP_FILE || path.join(ROOT, 'config', 'model-lineup.json');

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 1)); fs.renameSync(`${file}.tmp`, file); };

// Votes are cached per prompt: the system prompt, the schema and (since 2026-10-24) the
// layout of the user message, so a change to any of them asks every judge again.
// --hash H replays the votes of an earlier prompt (the report only; no calls).
const PROMPT_HASH = (flag('hash') && flag('hash') !== true) ? String(flag('hash'))
  : crypto.createHash('sha1').update(tg.JUDGE_SYSTEM + JSON.stringify(tg.JUDGE_SCHEMA) + (tg.JUDGE_USER_VERSION || '')).digest('hex').slice(0, 10);
const keyOf = (judge, c) => `${judge}|${c.id}|${PROMPT_HASH}`;

function itemOf(c) { return { format: c.format || 'short_answer', prompt: c.question, answer: c.reference, accepts: c.accepted || [] }; }

/** Layers 0 and 1 for every case. */
function layer(c) {
  const item = itemOf(c);
  const r = grading.grade(item, c.learner);
  if (r.correct) return { by: 'rules', verdict: 'correct' };
  if (!r.needsAi) return { by: 'rules', verdict: 'incorrect' };
  const p = tg.preJudge(item, c.learner);
  if (p) return { by: 'deterministic', verdict: p.verdict, why: p.why };
  return { by: 'judges', verdict: null };
}

// ── collection ──────────────────────────────────────────────────────────────
let cache = readJson(CACHE, {});
let dirty = 0;
/** Merge with what other runs wrote meanwhile (several judges may be collected at once), then write. */
function save(force = false) {
  if (!dirty || (!force && dirty < 10)) return;
  const disk = readJson(CACHE, {});
  for (const [k, v] of Object.entries(disk)) if (!cache[k] || (cache[k].error && !v.error)) cache[k] = v;
  writeJson(CACHE, cache);
  dirty = 0;
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(true); process.exit(130); });

const freeGb = () => os.freemem() / 1024 ** 3;
async function waitForRam(minGb, maxWaitMs) {
  const until = Date.now() + maxWaitMs;
  while (freeGb() < minGb && Date.now() < until) await new Promise((r) => { setTimeout(r, 5000); });
  return freeGb() >= minGb;
}

async function collect(judges, cases) {
  const byProvider = {};
  for (const j of judges) {
    const p = tg.JUDGES[j] && tg.JUDGES[j].provider;
    if (!p) { console.log(`unknown judge ${j}`); continue; }
    (byProvider[p] = byProvider[p] || []).push(j);
  }
  const conc = { nvidia: Number(process.env.EVAL_NVIDIA_CONC) || 6, openrouter_free: 2, ollama: 1, xkiro: 2, unorouter: 1 };
  const runJudge = async (j) => {
    // --only-unsettled a,b: ask only the cases the cached votes of judges a and b do not
    // settle under the app's policy (an escalation judge is only ever asked on those).
    const pair = flag('only-unsettled') && flag('only-unsettled') !== true ? String(flag('only-unsettled')).split(',') : null;
    if (pair) deriveTwins(cases);
    // A case whose pair votes are not all in yet is left for a later run.
    const unsettled = (c) => !pair || (pair.every((p) => cache[keyOf(p, c)] && cache[keyOf(p, c)].verdict)
      && !tg.decide(pair.map((p) => cache[keyOf(p, c)]), tg.policy()));
    const todo = cases.filter((c) => unsettled(c) && (!cache[keyOf(j, c)] || (flag('retry-errors') && cache[keyOf(j, c)].error)));
    console.log(`${j}: ${todo.length} to ask (${cases.length - todo.length} cached)`);
    let i = 0; let done = 0; let errors = 0; let consecutiveDaily = 0;
    const provider = tg.JUDGES[j].provider;
    const worker = async () => {
      while (i < todo.length) {
        const c = todo[i++];
        if (provider === 'ollama' && !(await waitForRam(Number(process.env.LOCAL_MIN_FREE_GB || 1.6), 10 * 60 * 1000))) {
          console.log(`${j}: RAM stayed under the owner's limit for 10 min; stopping this judge`); i = todo.length; break;
        }
        // eslint-disable-next-line no-await-in-loop
        const v = await tg.askJudge(j, { question: c.question, reference: c.reference, accepted: c.accepted, learner: c.learner }, { interactive: false });
        cache[keyOf(j, c)] = { ...v, at: new Date().toISOString() };
        dirty++; done++;
        if (v.error) { errors++; if (/daily|per day|free-models-per-day/i.test(v.error)) consecutiveDaily++; }
        if (consecutiveDaily >= 3) { console.log(`${j}: daily free allowance reached; stopping`); i = todo.length; }
        if (done % 20 === 0) console.log(`${j}: ${done}/${todo.length} (${errors} errors)`);
        save();
      }
    };
    await Promise.all(Array.from({ length: conc[provider] || 2 }, worker));
    save(true);
    console.log(`${j}: finished, ${done} asked, ${errors} errors`);
  };
  // Providers in parallel; inside a provider, judges in parallel except the local
  // models (one GPU: one judge at a time, so models are not swapped per call).
  await Promise.all(Object.entries(byProvider).map(async ([p, list]) => {
    if (p === 'ollama') { for (const j of list) await runJudge(j); } // eslint-disable-line no-await-in-loop
    else await Promise.all(list.map(runJudge));
  }));
}

// ── replay ──────────────────────────────────────────────────────────────────
function votesFor(c, judges) {
  return judges.map((j) => cache[keyOf(j, c)]).filter(Boolean);
}

/** The cascade over cached votes, exactly as runCascade does it (stage by stage). */
function replay(c, pol) {
  const votes = [];
  let ms = 0;
  let interactiveMs = null;
  const stagesRun = [];
  for (const stage of pol.stages) {
    if (tg.decide(votes, pol)) break;
    const got = stage.judges.map((j) => cache[keyOf(j, c)]).filter(Boolean);
    if (!got.length) continue;
    votes.push(...got);
    stagesRun.push(stage.name);
    ms += Math.max(...got.map((v) => v.ms || 0));
    const d = tg.decide(votes, pol);
    if (d && interactiveMs === null) interactiveMs = ms;
  }
  const verdict = tg.decide(votes, pol) || 'unresolved';
  return { verdict, ms, stagesRun, votes };
}

function pct(list, p) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function score(cases, layers, pol, label) {
  let fa = 0; let fr = 0; let unresolved = 0; let unresolvedTrue = 0; let right = 0; let missing = 0;
  const judgeMs = []; const allMs = []; const faCases = []; const frCases = [];
  let withinBudget = 0; let judged = 0;
  for (const c of cases) {
    const L = layers.get(c.id);
    if (L.by !== 'judges') {
      allMs.push(0);
      const ok = (L.verdict === 'correct') === c.truth;
      if (ok) right++; else if (L.verdict === 'correct') { fa++; faCases.push(c.id); } else { fr++; frCases.push(c.id); }
      continue;
    }
    judged++;
    const r = replay(c, pol);
    if (!r.votes.length) missing++;
    judgeMs.push(r.ms); allMs.push(r.ms);
    if (r.ms <= pol.interactive_budget_ms && r.verdict !== 'unresolved') withinBudget++;
    if (r.verdict === 'unresolved') {
      unresolved++;
      // Closed as NOT accepted: right when the answer was wrong.
      if (c.truth) { unresolvedTrue++; fr++; frCases.push(c.id); } else right++;
      continue;
    }
    const ok = (r.verdict === 'correct') === c.truth;
    if (ok) right++;
    else if (r.verdict === 'correct') { fa++; faCases.push(c.id); } else { fr++; frCases.push(c.id); }
  }
  return {
    policy: label,
    false_accepts: fa,
    false_rejects: fr,
    unresolved,
    unresolved_acceptable: unresolvedTrue,
    accuracy: Number((right / cases.length).toFixed(4)),
    judged,
    missing_votes: missing,
    judged_median_ms: pct(judgeMs, 50),
    judged_p95_ms: pct(judgeMs, 95),
    all_median_ms: pct(allMs, 50),
    all_p95_ms: pct(allMs, 95),
    settled_within_budget: judged ? Number((withinBudget / judged).toFixed(3)) : null,
    fa_cases: faCases,
    fr_cases: frCases,
  };
}

/** Policy candidates: the shapes worth comparing. */
function candidates(available) {
  const has = (j) => available.includes(j);
  const base = tg.DEFAULT_POLICY;
  const out = [];
  const add = (label, stages, extra = {}) => {
    const st = stages.map((s) => ({ ...s, judges: s.judges.filter(has) })).filter((s) => s.judges.length);
    if (!st.length) return;
    out.push({ label, pol: { ...base, ...extra, stages: st } });
  };
  // Single judges (the old way: one model decides).
  for (const j of available) add(`single:${j}`, [{ name: 'one', judges: [j] }], { min_correct: 1, min_incorrect: 1, strong: [j], veto: [j], min_confidence: 0 });
  // Ultra on NVIDIA and Ultra on OpenRouter are the same weights: one vote ('ultra-any'),
  // never two, so no policy pairs them or lets one confirm the other.
  const fastPairs = [['ultra-any', 'lightning'], ['ultra-any', 'or-gemma'], ['ultra-any', 'qwen-local'], ['ultra-any', 'qwen9-local'], ['ultra-any', 'glm-flash'], ['ultra-any', 'glm-max'], ['lightning', 'qwen-local']];
  const escalations = [['glm-max'], ['deepseek-max'], ['glm-flash'], ['xk-qwen-max'], ['xk-mistral-large'], ['xk-command-reasoning'], []];
  const fallbacks = [['or-gemma', 'qwen-local'], ['qwen9-local'], []];
  for (const pair of fastPairs) {
    if (!pair.every(has)) continue;
    for (const esc of escalations) {
      for (const fb of fallbacks) {
        for (const conf of [0, 0.6, 0.8]) {
          for (const vetoAll of [true, false]) {
            for (const rejStrong of [1, 2]) {
              const strong = ['ultra', 'ultra-any', 'glm-max', 'deepseek-max', 'glm-flash', 'or-ultra', 'claude'];
              add(`${pair.join('+')} > ${esc.join('+') || '-'} > ${fb.join('+') || '-'} | conf>=${conf} | veto:${vetoAll ? 'all' : 'strong'} | reject needs ${rejStrong} strong`,
                [{ name: 'fast', judges: pair }, { name: 'escalate', judges: esc }, { name: 'free_fallback', judges: fb }],
                { min_confidence: conf, strong, veto: vetoAll ? [...base.veto] : strong, min_incorrect_strong: rejStrong });
            }
          }
        }
      }
    }
  }
  // Majority variants: a strong judge's "wrong" no longer vetoes on its own; acceptance
  // needs more "right" than "wrong" votes and a minimum of strong ones.
  for (const pair of [['ultra-any', 'lightning'], ['ultra-any', 'qwen9-local']]) {
    if (!pair.every(has)) continue;
    for (const esc of ['glm-max', 'deepseek-max']) {
      for (const tie of [['or-ultra'], []]) {
        for (const minStrong of [1, 2]) {
          for (const margin of [1, 2]) {
            const strong = ['ultra', 'ultra-any', 'glm-max', 'deepseek-max', 'glm-flash', 'or-ultra', 'claude'];
            add(`MAJORITY ${pair.join('+')} > ${esc} > ${tie.join('+') || '-'} | strong correct>=${minStrong} | margin>=${margin}`,
              [{ name: 'fast', judges: pair }, { name: 'escalate', judges: [esc] }, { name: 'tiebreak', judges: tie }],
              { min_confidence: 0.6, strong, veto: [], min_strong_correct: minStrong, accept_margin: margin, min_incorrect_strong: 1 });
          }
        }
      }
    }
  }

  // Local only (a learner without outside-AI consent).
  for (const pair of [['qwen-local', 'gemma-local'], ['qwen-local', 'nano-local'], ['qwen9-local', 'qwen-local'], ['qwen9-local', 'gemma-local'], ['qwen-local', 'gemma-local', 'nano-local']]) {
    if (!pair.every(has)) continue;
    for (const conf of [0, 0.6, 0.8]) {
      add(`LOCAL ${pair.join('+')} | conf>=${conf}`, [{ name: 'local', judges: pair }],
        { min_confidence: conf, min_correct: 2, strong: pair, veto: pair });
    }
  }
  return out;
}

/**
 * 'ultra-any' (NVIDIA's Ultra, then OpenRouter's $0 Ultra when NVIDIA fails) is not
 * asked separately: its vote is derived from the two cached ones, in the order the app
 * asks them, with the latency of both when the first failed.
 */
function deriveTwins(cases) {
  for (const c of cases) {
    const a = cache[keyOf('ultra', c)];
    const b = cache[keyOf('or-ultra', c)];
    if (!a && !b) continue;
    let v;
    if (a && a.verdict) v = { ...a, judge: 'ultra-any', via: 'ultra' };
    else if (b && b.verdict) v = { ...b, judge: 'ultra-any', via: 'or-ultra', ms: ((a && a.ms) || 0) + (b.ms || 0) };
    else v = { judge: 'ultra-any', verdict: null, error: 'both twins failed', ms: ((a && a.ms) || 0) + ((b && b.ms) || 0) };
    cache[keyOf('ultra-any', c)] = v;
  }
}

function report(write) {
  // Disputed labels (scripts/grading-cases-build.js) are left out of every score.
  const cases = readJson(CASES, []).filter((c) => !c.disputed);
  deriveTwins(cases);
  const layers = new Map(cases.map((c) => [c.id, layer(c)]));
  const judged = cases.filter((c) => layers.get(c.id).by === 'judges');
  const judgesSeen = Object.keys(tg.JUDGES).filter((j) => judged.some((c) => cache[keyOf(j, c)]));
  const available = judgesSeen.filter((j) => {
    const answered = judged.filter((c) => cache[keyOf(j, c)] && cache[keyOf(j, c)].verdict).length;
    // A judge that missed a case (a rate limit) counts as an outage on it, which only
    // costs the policy accuracy, never a false accept; below 60% it is not compared.
    // An escalation judge collected with --only-unsettled is asked only where the fast
    // pair did not settle, which is all the replay ever needs from it.
    const asked = judged.filter((c) => cache[keyOf(j, c)]).length;
    return answered >= judged.length * 0.6 || (flag('escalation') === j && asked >= 10 && answered >= asked * 0.9);
  });

  // Per-judge quality.
  const perJudge = judgesSeen.map((j) => {
    const vs = judged.map((c) => ({ c, v: cache[keyOf(j, c)] })).filter((x) => x.v);
    const answered = vs.filter((x) => x.v.verdict);
    const fa = answered.filter((x) => x.v.verdict === 'correct' && !x.c.truth).length;
    const fr = answered.filter((x) => x.v.verdict === 'incorrect' && x.c.truth).length;
    const unsure = answered.filter((x) => x.v.verdict === 'unsure').length;
    const right = answered.filter((x) => (x.v.verdict === 'correct') === x.c.truth && x.v.verdict !== 'unsure').length;
    const ms = answered.map((x) => x.v.ms);
    return {
      judge: j, model: tg.JUDGES[j].model || j, asked: vs.length, answered: answered.length, errors: vs.length - answered.length,
      accuracy_when_answered: answered.length ? Number((right / answered.length).toFixed(3)) : null,
      false_accepts: fa, false_rejects: fr, unsure, median_ms: pct(ms, 50), p95_ms: pct(ms, 95),
      fa_cases: answered.filter((x) => x.v.verdict === 'correct' && !x.c.truth).map((x) => x.c.id),
    };
  });

  const results = candidates(available).map(({ label, pol }) => ({ ...score(cases, layers, pol, label), pol }));
  const rank = (a, b) => (a.false_accepts - b.false_accepts) || (b.accuracy - a.accuracy) || (a.judged_p95_ms - b.judged_p95_ms) || (a.judged_median_ms - b.judged_median_ms);
  const outside = results.filter((r) => !r.policy.startsWith('LOCAL')).sort(rank);
  const local = results.filter((r) => r.policy.startsWith('LOCAL')).sort(rank);
  const winner = outside.find((r) => r.false_accepts === 0 && !r.policy.startsWith('single:')) || null;
  const localWinner = local.find((r) => r.false_accepts === 0) || null;

  const counts = { total: cases.length, rules: 0, deterministic: 0, judges: judged.length };
  for (const c of cases) { const L = layers.get(c.id); if (L.by !== 'judges') counts[L.by]++; }
  const layerErrors = cases.filter((c) => { const L = layers.get(c.id); return L.by !== 'judges' && (L.verdict === 'correct') !== c.truth; }).map((c) => c.id);

  // The adversarial set (prompt injection, security review 2026-10-24 D3): every case is
  // a wrong answer. Two numbers: what the whole grader does (rules, deterministic checks,
  // then the policy), and what each judge does alone when asked anyway (--raw-group).
  const advCases = cases.filter((c) => c.group === 'adversarial');
  const advLayers = { rules: 0, deterministic: 0, judges: 0 };
  for (const c of advCases) advLayers[layers.get(c.id).by]++;
  const adv = {
    cases: advCases.length,
    settled_by: advLayers,
    winner_false_accepts: winner ? winner.fa_cases.filter((id) => advCases.some((c) => c.id === id)).length : null,
    per_judge: judgesSeen.map((j) => {
      const vs = advCases.map((c) => cache[keyOf(j, c)]).filter((v) => v && v.verdict);
      return { judge: j, answered: vs.length, said_correct: vs.filter((v) => v.verdict === 'correct').length, said_unsure: vs.filter((v) => v.verdict === 'unsure').length, cases_said_correct: advCases.filter((c) => { const v = cache[keyOf(j, c)]; return v && v.verdict === 'correct'; }).map((c) => c.id) };
    }).filter((p) => p.answered),
  };
  const out = { run: new Date().toISOString(), prompt_hash: PROMPT_HASH, counts, adversarial: adv, layer_errors: layerErrors, per_judge: perJudge, winner, local_winner: localWinner, top: outside.slice(0, 25), all: outside.map(({ pol, ...r }) => r), local: local.slice(0, 10) };
  writeJson(path.join(OUT, 'REPORT.json'), out);

  const row = (r) => `| ${r.policy} | ${r.false_accepts} | ${r.false_rejects} | ${r.unresolved} | ${r.accuracy} | ${r.judged_median_ms} | ${r.judged_p95_ms} | ${r.settled_within_budget} |`;
  const md = [
    '# Typed-answer grading: the layered grader, measured',
    '',
    `Run ${out.run}. Produced by \`node scripts/grading-cascade-eval.js --report\` from cached votes (prompt ${PROMPT_HASH}); see curriculum-build/grading-cascade/.`,
    '',
    `Cases: ${counts.total} (rules settle ${counts.rules}, the deterministic checks ${counts.deterministic}, judges ${counts.judges}). Errors in the rules + deterministic layers: ${layerErrors.length ? layerErrors.join(', ') : 'none'}.`,
    '',
    'Accuracy is over all cases. An answer the cascade cannot settle is closed as NOT accepted, so it counts as a false reject when the answer was right. Latency is the judges\' wall time (stages run one after another; judges inside a stage in parallel); rules and deterministic cases take ~0 ms.',
    '',
    '## Each judge alone (cases that reach the judges)',
    '',
    '| Judge | Model | answered | errors | accuracy | false accepts | false rejects | unsure | median ms | p95 ms |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...perJudge.map((p) => `| ${p.judge} | ${p.model} | ${p.answered}/${p.asked} | ${p.errors} | ${p.accuracy_when_answered} | ${p.false_accepts} | ${p.false_rejects} | ${p.unsure} | ${p.median_ms} | ${p.p95_ms} |`),
    '',
    '## Policies (best 25; 0 false accepts first, then accuracy, then latency)',
    '',
    '| Policy | false accepts | false rejects | unresolved | accuracy | median ms | p95 ms | settled within budget |',
    '|---|---|---|---|---|---|---|---|',
    ...outside.slice(0, 25).map(row),
    '',
    '## Local only (learners without outside-AI consent)',
    '',
    '| Policy | false accepts | false rejects | unresolved | accuracy | median ms | p95 ms | settled within budget |',
    '|---|---|---|---|---|---|---|---|',
    ...local.slice(0, 10).map(row),
    '',
    '## Adversarial cases (prompt injection; every one is a wrong answer)',
    '',
    `${adv.cases} cases. Settled by the rules: ${adv.settled_by.rules}, by the deterministic checks: ${adv.settled_by.deterministic}, reach the judges: ${adv.settled_by.judges}. False accepts by the winning policy on them: ${adv.winner_false_accepts === null ? 'n/a' : adv.winner_false_accepts}.`,
    '',
    'Each judge alone on every adversarial case it was asked (including the ones the deterministic checks settle, asked with --raw-group adversarial):',
    '',
    '| Judge | answered | said correct | said unsure | cases said correct |',
    '|---|---|---|---|---|',
    ...adv.per_judge.map((p) => `| ${p.judge} | ${p.answered} | ${p.said_correct} | ${p.said_unsure} | ${p.cases_said_correct.join(', ') || '-'} |`),
    '',
    winner ? `**Winner:** ${winner.policy}: ${winner.false_accepts} false accepts, ${winner.false_rejects} false rejects (${winner.unresolved} unresolved), accuracy ${winner.accuracy}, median ${winner.judged_median_ms} ms, p95 ${winner.judged_p95_ms} ms on judged cases.` : '**No policy reached 0 false accepts.**',
    winner && winner.fr_cases.length ? `False rejects: ${winner.fr_cases.join(', ')}` : '',
    '',
  ].join('\n');
  fs.writeFileSync(REPORT, md);
  console.log(md.split('\n').slice(0, 60).join('\n'));

  if (write && winner) {
    const lineup = readJson(LINEUP, {});
    const strip = (p) => ({ stages: p.stages, strong: p.strong, veto: p.veto, min_correct: p.min_correct, min_incorrect: p.min_incorrect, min_incorrect_strong: p.min_incorrect_strong || 0, min_strong_correct: p.min_strong_correct || 1, accept_margin: p.accept_margin || 0, min_confidence: p.min_confidence, interactive_budget_ms: p.interactive_budget_ms });
    lineup.grading = {
      ...strip(winner.pol),
      stages: [...winner.pol.stages, { name: 'claude', judges: ['claude'], when: 'unresolved' }],
      local_stages: localWinner ? localWinner.pol.stages : tg.DEFAULT_POLICY.local_stages,
      eval: { run: out.run, prompt_hash: PROMPT_HASH, cases: counts.total, false_accepts: winner.false_accepts, false_rejects: winner.false_rejects, accuracy: winner.accuracy, judged_median_ms: winner.judged_median_ms, judged_p95_ms: winner.judged_p95_ms, policy: winner.policy },
    };
    writeJson(LINEUP, lineup);
    console.log(`wrote config/model-lineup.json "grading" (${winner.policy})`);
  }
}

/**
 * --live N: the grader as the app runs it (services/typed-grading.js gradeTyped, the
 * policy in config/model-lineup.json), one answer at a time, on N judged cases spread
 * across the groups. Measures real wall time with nothing else of ours queued, and
 * whether the interactive budget held. Real free calls (NVIDIA, OpenRouter :free, local).
 */
async function live(n) {
  const cases = readJson(CASES, []).filter((c) => layer(c).by === 'judges');
  const groups = new Map();
  for (const c of cases) { if (!groups.has(c.group)) groups.set(c.group, []); groups.get(c.group).push(c); }
  const pick = [];
  for (let r = 0; pick.length < n; r++) {
    let any = false;
    for (const list of groups.values()) if (list[r * 7 % list.length] && pick.length < n && !pick.includes(list[r * 7 % list.length])) { pick.push(list[r * 7 % list.length]); any = true; }
    if (!any) break;
  }
  const rows = [];
  for (const c of pick) {
    const t0 = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const first = await tg.gradeTyped({ item: itemOf(c), userAnswer: c.learner, allowOutside: true });
    const shownMs = Date.now() - t0;
    // eslint-disable-next-line no-await-in-loop
    const final = first.status === 'checking' ? await first.settle : first;
    const row = { id: c.id, truth: c.truth, shown: first.status, shown_ms: shownMs, final: final.status, final_ms: Date.now() - t0, stages: final.stages, by: final.by };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  const fa = rows.filter((r) => r.final === 'accepted' && !r.truth).length;
  const fr = rows.filter((r) => r.final !== 'accepted' && r.truth).length;
  const out = { run: new Date().toISOString(), n: rows.length, false_accepts: fa, false_rejects: fr, shown_median_ms: pct(rows.map((r) => r.shown_ms), 50), shown_p95_ms: pct(rows.map((r) => r.shown_ms), 95), final_median_ms: pct(rows.map((r) => r.final_ms), 50), final_p95_ms: pct(rows.map((r) => r.final_ms), 95), held_as_checking: rows.filter((r) => r.shown === 'checking').length, rows };
  writeJson(path.join(OUT, 'LIVE-TIMING.json'), out);
  console.log(JSON.stringify({ ...out, rows: undefined }));
}

async function main() {
  if (flag('live')) { await live(Number(flag('live')) || 30); return; }
  if (flag('collect')) {
    const cases = readJson(CASES, []);
    const rawGroup = flag('raw-group') && flag('raw-group') !== true ? String(flag('raw-group')) : null;
    // --raw-group G: that group's cases are asked even when the rules or the deterministic
    // checks settle them, to measure the judges alone (the adversarial set).
    const judged = cases.filter((c) => layer(c).by === 'judges' || (rawGroup && c.group === rawGroup));
    const limit = Number(flag('limit')) || judged.length;
    const judges = String(flag('judges') && flag('judges') !== true ? flag('judges') : 'ultra,lightning,glm-max').split(',').map((s) => s.trim());
    const usesOr = judges.some((j) => tg.JUDGES[j] && tg.JUDGES[j].provider === 'openrouter_free');
    const before = usesOr ? await free.openrouterUsage().catch(() => null) : null;
    if (usesOr) console.log(`OpenRouter spend counter before: ${before ? before.total_usage : 'unreadable'}`);
    await collect(judges, judged.slice(0, limit));
    if (usesOr) {
      const after = await free.openrouterUsage().catch(() => null);
      console.log(`OpenRouter spend counter after: ${after ? after.total_usage : 'unreadable'} (before ${before ? before.total_usage : '?'})`);
      const log = readJson(path.join(OUT, 'openrouter-spend-check.json'), []);
      log.push({ at: new Date().toISOString(), judges, before, after });
      writeJson(path.join(OUT, 'openrouter-spend-check.json'), log);
    }
  }
  if (flag('report') || flag('collect')) report(!!flag('write'));
}

main().catch((err) => { save(true); console.error(err); process.exit(1); });
