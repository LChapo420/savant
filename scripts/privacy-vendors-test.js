// Every outside provider the code can send learner words or recordings to must be named in the privacy policy.
const fs = require('fs');
const path = require('path');
const policy = fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8').toLowerCase();
const voice = fs.readFileSync(path.join(__dirname, '..', 'services', 'spanish', 'voice.js'), 'utf8').toLowerCase();

let pass = 0, fail = 0;
function check(name, ok) { if (ok) pass++; else { fail++; console.log('FAIL: ' + name); } }

// provider name in the policy -> a marker proving the code still uses it
const vendors = [
  ['modelflare', 'modelflare'], ['openrouter', 'openrouter'], ['anthropic', 'anthropic'],
  ['gemini', 'generativelanguage.googleapis.com'], ['mimo', 'xiaomimimo'], ['nvidia', 'nvidia'],
  ['llm gateway', 'llmgateway.io'],
];
for (const [name] of vendors) check(`policy names ${name}`, policy.includes(name));
check('voice.js still uses the LLM Gateway (so the policy line is needed)', voice.includes('llmgateway.io'));
check('voice.js still uses MiMo', voice.includes('xiaomimimo'));
console.log(`privacy-vendors-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
