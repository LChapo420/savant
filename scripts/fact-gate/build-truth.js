#!/usr/bin/env node
// truth.decisions.jsonl: the ruling used to tell a true find from a false alarm on stored text. Sonnet's ruling, overridden by human rulings (hand-truth.json) where a human read the flag.
const L = require('./lib');

const raw = L.path.join(L.TMP, 'raw');
const hand = (() => { try { return L.readJson(L.path.join(__dirname, 'hand-truth.json')); } catch { return {}; } })();
const rows = L.readJsonl(L.path.join(raw, 'sonnet.decisions.jsonl')).filter((r) => r.key.startsWith('clean:'));
const out = rows.map((r) => ({ key: r.key, real: r.key in hand ? hand[r.key] : r.real }));
L.fs.writeFileSync(L.path.join(raw, 'truth.decisions.jsonl'), out.map((r) => JSON.stringify(r)).join('\n'));
console.log('truth rulings', out.length, 'real', out.filter((r) => r.real).length);
