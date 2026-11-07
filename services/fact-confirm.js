/**
 * A flag is a suspicion, not a verdict (owner, 7 Nov: "it shouldn't be flagging anything that is fine"; docs/FACT-100.md). Behind FACT_CONFIRM=on, default off; nothing live calls this yet.
 * Before anything is dropped or rewritten, a second step must confirm the flag, by one of:
 *   recompute    SymPy works out the assertion from a transcription by a different model family: false confirms it, true clears it
 *   source       a real passage (bank, Wikipedia, Wiktionary, textbook) contradicts it, with the words quoted and found in the passage
 *   independent  another family raised the same thing in its own read, unprompted
 *   rulings      other families, shown the lesson and the flag, rule it real (how many are needed is the POLICY)
 * If nothing confirms it, the block stays and the flag goes to a log for review: logFlag. A recompute that says the assertion holds clears the flag even if readers disagree.
 *
 *   decide(flag, policy)  -> { act: boolean, by: string[] }
 * flag: { raisers: [family...], rulings: { family: boolean }, source: 'contradicted'|'supported'|'silent'|null, recompute: 'false'|'true'|null }
 */
const fs = require('fs');
const path = require('path');

function isOn() { return String(process.env.FACT_CONFIRM || '').toLowerCase() === 'on'; }

const familyOf = (name) => { const m = String(name).toLowerCase(); return m.includes('glm') ? 'glm' : m.includes('ds41') || m.includes('deepseek') ? 'deepseek' : m.includes('grok') ? 'grok' : m.includes('kimi') ? 'kimi' : m.includes('compute') ? 'compute' : m.includes('code') ? 'code' : m; };

/** Rulings by families that did not raise the flag: a raiser ruling on itself proves nothing. */
const outside = (f) => Object.entries(f.rulings || {}).filter(([fam]) => !(f.raisers || []).map(familyOf).includes(familyOf(fam)));
const yes = (f) => outside(f).filter(([, v]) => v === true).length;
const heard = (f) => outside(f).length;
const independent = (f) => new Set((f.raisers || []).map(familyOf).filter((x) => x !== 'compute' && x !== 'code')).size >= 2;

const POLICIES = {
  any: () => ({ act: true, by: ['raised'] }),
  one_ruling: (f) => ({ act: yes(f) >= 1, by: ['ruling'] }),
  all_rulings: (f) => ({ act: heard(f) >= 1 && yes(f) === heard(f), by: ['rulings'] }),
  two_rulings: (f) => ({ act: yes(f) >= 2, by: ['two rulings'] }),
  independent: (f) => ({ act: independent(f), by: ['independent'] }),
  hard_only: (f) => ({ act: f.recompute === 'false' || f.source === 'contradicted', by: [f.recompute === 'false' ? 'recompute' : 'source'] }),
  hard_or_independent: (f) => ({ act: f.recompute === 'false' || f.source === 'contradicted' || independent(f), by: ['hard or independent'] }),
  hard_or_two_rulings: (f) => ({ act: f.recompute === 'false' || f.source === 'contradicted' || yes(f) >= 2, by: ['hard or two rulings'] }),
  independent_and_ruling: (f) => ({ act: f.recompute === 'false' || f.source === 'contradicted' || (independent(f) && yes(f) >= 1), by: ['independent and a ruling'] }),
};

function decide(flag, policy = 'hard_or_two_rulings') {
  if (flag.recompute === 'true' && !(flag.source === 'contradicted')) return { act: false, by: ['recomputed: it holds'] };
  const p = POLICIES[policy];
  if (!p) throw new Error(`no confirm policy ${policy}`);
  return p(flag);
}

/** An unconfirmed flag: the block stays, this line is for a person to read. Holds lesson text only, never learner data. */
function logFlag(entry, file = process.env.FACT_FLAG_LOG || path.join(__dirname, '..', 'data', 'fact-flag-log.jsonl')) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

module.exports = { isOn, decide, logFlag, POLICIES, familyOf };
