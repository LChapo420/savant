// Section 08: the citation check for the works first cited on 1 Nov (scorecard round 9, speed levers, beta comparison).
// It runs the same way as sections 06-07:
// - a free picker chooses a verbatim supporting sentence from the abstract, and the code checks it really is verbatim;
// - two free checkers from different model families rate the claim against the abstract, separately;
// - planted errors (a real claim paired with another source's abstract) are mixed in, and a checker that misses them is not trusted.
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', '..', '..');
require(path.join(APP, 'node_modules', 'dotenv')).config({ path: path.join(APP, '..', '.env') });
process.env.XKIRO_PIPELINE = '1';
process.env.XKIRO_USAGE_FILE = process.env.XKIRO_USAGE_FILE || path.join(APP, 'data', 'xkiro-usage.json');
const nvidia = require(path.join(APP, 'services', 'providers', 'nvidia.js'));
const { xkiro } = require(path.join(APP, 'services', 'providers', 'xkiro.js'));
const OUT = path.join(__dirname, 'checks08.json');
const out = fs.existsSync(OUT) ? require(OUT) : {};
const CLAIMS = {
  Koedinger: 'Learning of knowledge components can be measured from student performance data, and the framework links kinds of knowledge to the instructional principles that work for them.',
  Aleven: 'Help-seeking behaviour in an intelligent tutor, including help abuse such as clicking through hints to the answer, can be modelled from the logs and is often unproductive.',
  Baker: 'Off-task behaviour of students in an intelligent tutoring system can be detected from interaction logs, and it is associated with poorer learning.',
  Graesser: 'The questions students ask during one-to-one tutoring can be classified by depth, and the rate of deep questions is related to comprehension or achievement.',
  Epp: 'A user\'s emotional state can be identified above chance from keystroke dynamics such as typing timing.',
  Niederhoffer: 'People in conversation tend to match each other\'s linguistic style.',
  Park: 'Personality traits can be assessed automatically from the language of social media posts, with accuracy that correlates with self-reports.',
  Pennebaker: 'Use of word categories is reliable within a person over time and across settings, and relates to personality.',
  Peters: 'Large language models can infer the Big Five personality traits of social media users from their posts, zero-shot, with modest correlations to self-reports.',
  Crossley: 'Lexical indices computed from learners\' writing predict their language proficiency level.',
  Tausczik: 'Counts of words in psychologically meaningful categories (LIWC) reveal attention, emotion, social relationships, thinking styles and individual differences.',
  Yarkoni: 'Personality traits correlate with the words people use in their blogs, in a large sample.',
  Johari: 'Always-valid p-values and confidence intervals allow A/B test results to be monitored continuously with the error rate controlled, where repeatedly checking a fixed-sample test inflates false positives.',
  Robbins: 'Sequential tests and confidence sequences based on the law of the iterated logarithm allow statistical inference that stays valid under continuous monitoring.',
};
const PICK_SCHEMA = { type: 'object', properties: { quote: { type: 'string' } }, required: ['quote'] };
const RATE_SCHEMA = { type: 'object', properties: { rating: { type: 'string', enum: ['supported', 'partly', 'not_supported'] }, problem: { type: 'string' }, smallest_fix: { type: 'string' } }, required: ['rating', 'problem', 'smallest_fix'] };
const PICK = 'Copy, word for word, the one sentence or clause from the source text that best supports the claim. Copy it exactly, with no changes. If nothing supports it, return an empty string. Reply only through the tool.';
const RATE = `You check one citation. Decide from the source text only whether it shows what the claim uses it for:
the topic, the direction of the effect, the population and setting, every number, and the strength of the wording
("may" must not become "does", one study must not become "studies show", a correlation must not become a cause).
"supported": the source shows it as written. "partly": the source shows something narrower or the wording is too strong.
"not_supported": the source does not show it. Give the problem in one sentence and the smallest fix to the claim. Reply only through the tool.`;
const nv = (model, system, user, schema, name) => nvidia.structured({ role: 'check', system, user, schema, schemaName: name, maxTokens: 2500, models: [{ model, effort: 'medium' }], timeoutMs: 5 * 60 * 1000 });
const CHECKERS = {
  minimax: (u) => nv('minimaxai/minimax-m3.1-flash', RATE, u, RATE_SCHEMA, 'rate'),
  mistral: async (u) => { try { const r = await xkiro.structured({ system: RATE, user: u, schema: RATE_SCHEMA, schemaName: 'rate', maxTokens: 800, models: ['mistralai/mistral-large-2512'], timeoutMs: 5 * 60 * 1000 }); if (r) return r; } catch { /* to NVIDIA */ } return nv('mistralai/mistral-large-4-1t-a52b', RATE, u, RATE_SCHEMA, 'rate'); },
};
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
(async () => {
  const res = require('./resolved.json').filter((o) => !o.already && !o.inArticle && o.title && CLAIMS[o.author]);
  // Semantic Scholar for any source OpenAlex holds no abstract for.
  for (const o of res) if (!o.abstract && o.doi) { try { const j = await (await fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${o.doi}?fields=abstract`)).json(); o.abstract = j.abstract || ''; o.abstract_from = 'semanticscholar'; } catch { /* left empty */ } }
  const items = res.map((o) => ({ key: o.author, claim: CLAIMS[o.author], abstract: o.abstract, src: o, planted: false }));
  for (let i = 0; i < 4; i++) { const a = items[i * 3]; const b = items[(i * 3 + 7) % items.length]; items.push({ key: `PLANT-${i + 1}`, claim: a.claim, abstract: b.abstract, planted: true }); }
  for (const it of items) {
    const o = out[it.key] = out[it.key] || { claim: it.claim, planted: it.planted };
    if (!it.abstract) { o.noAbstract = true; console.log(it.key, 'no abstract'); continue; }
    const user = `Claim: ${it.claim}\n\nSource text:\n${String(it.abstract).slice(0, 4000)}`;
    if (!it.planted && !o.quote) {
      try { const r = await nv('deepseek-ai/deepseek-v4.1-flash', PICK, user, PICK_SCHEMA, 'pick'); o.quote = r ? r.data.quote : ''; } catch (e) { o.quote = ''; o.pickError = e.message; }
      o.verbatim = !!o.quote && norm(it.abstract).includes(norm(o.quote));
    }
    for (const [n, run] of Object.entries(CHECKERS)) {
      if (o[n] && o[n].rating !== 'error') continue;
      try { const r = await run(user); o[n] = r ? r.data : { rating: 'error', problem: 'no answer' }; } catch (e) { o[n] = { rating: 'error', problem: e.message }; }
    }
    if (!it.planted) Object.assign(o, { doi: it.src.doi, title: it.src.title, year: it.src.year, venue: it.src.venue, doc: it.src.doc, abstract_from: it.src.abstract_from || 'openalex' });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log(it.key, it.planted ? 'PLANTED' : '', 'verbatim=' + o.verbatim, o.minimax && o.minimax.rating, o.mistral && o.mistral.rating);
  }
  const real = Object.values(out).filter((x) => !x.planted);
  const pass = real.filter((x) => x.verbatim && x.minimax && x.mistral && x.minimax.rating === 'supported' && x.mistral.rating === 'supported');
  const plant = Object.values(out).filter((x) => x.planted);
  console.log(`real ${real.length}: verbatim quote + both supported ${pass.length}`);
  for (const n of Object.keys(CHECKERS)) console.log(`${n} caught planted ${plant.filter((x) => x[n] && !['supported', 'error'].includes(x[n].rating)).length}/${plant.length}`);
})();
