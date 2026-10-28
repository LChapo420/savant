/**
 * The staged explanation-key gate (services/key-gate.js), with a fake blind judge.
 *   node scripts/key-gate-test.js
 */
process.env.NODE_ENV = 'test';
const keyGate = require('../services/key-gate');

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); } };

const wrongKey = { prompt: "Choose the correct word: 'The new practice schedule will ___ the team's score.'", choices: ['affect', 'effected', 'effect', 'affection'], answerIndex: 2,
  explanation: 'Affect is the verb meaning to influence, which fits after will.' };
const rightKey = { ...wrongKey, answerIndex: 0 };

(async () => {
  delete process.env.KEY_GATE;
  check('on by default (live since 2026-10-24)', keyGate.on() === true);
  process.env.KEY_GATE = 'off';
  check('KEY_GATE=off: nothing is rejected', (await keyGate.rejectedByKeyGate([wrongKey], { judge: async () => [0] })).length === 0);
  process.env.KEY_GATE = 'on';
  check('an unflagged question never reaches the judge', (await keyGate.rejectedByKeyGate([rightKey], { judge: async () => { throw new Error('should not be called'); } })).length === 0);
  check('a flagged question the blind judge keys the same way is kept', (await keyGate.rejectedByKeyGate([wrongKey], { judge: async () => [2] })).length === 0);
  const rej = await keyGate.rejectedByKeyGate([rightKey, wrongKey], { judge: async () => [0] });
  check('a flagged question the blind judge keys differently is rejected, by its index', rej.length === 1 && rej[0].index === 1 && /blind check picked option 1/.test(rej[0].reason), JSON.stringify(rej));
  const down = await keyGate.rejectedByKeyGate([wrongKey], { judge: async () => { throw new Error('429'); } });
  check('no judge answer is a rejection, never a keep', down.length === 1 && /no blind check/.test(down[0].reason));
  // The judge: NVIDIA Nemotron Ultra first, then the app's own chain; never xKiro or UnoRouter.
  {
    const nvidia = require('../services/providers/nvidia');
    const providers = require('../services/providers');
    const saved = { isEnabled: nvidia.isEnabled, structured: nvidia.structured, chain: providers.chain };
    const asked = [];
    const pick = (n) => async () => ({ data: { picks: [{ index: 0, chosen_index: n }] } });
    nvidia.isEnabled = () => true;
    nvidia.structured = async (args) => { asked.push(`nvidia:${(args.models || [{}])[0].model || 'tier'}`); return pick(2)(); };
    providers.chain = () => [{ name: 'xkiro', structured: async () => { asked.push('xkiro'); return pick(1)(); } }];
    let picks = await keyGate.nemotronJudge([wrongKey]);
    check('the judge asks Nemotron Ultra on NVIDIA first', picks[0] === 2 && String(asked[0]).startsWith('nvidia:nvidia/nemotron-3-ultra'), asked);
    nvidia.structured = async () => { asked.push('nvidia-fail'); throw new Error('429'); };
    providers.chain = () => [
      { name: 'xkiro', structured: async () => { asked.push('xkiro'); return pick(1)(); } },
      { name: 'unorouter', structured: async () => { asked.push('unorouter'); return pick(1)(); } },
      { name: 'ollama', structured: async () => { asked.push('ollama'); return pick(0)(); } },
    ];
    asked.length = 0;
    picks = await keyGate.nemotronJudge([wrongKey]);
    check('NVIDIA failing: the app chain answers, and xKiro / UnoRouter are never asked', picks[0] === 0 && !asked.includes('xkiro') && !asked.includes('unorouter') && asked.includes('ollama'), asked);
    providers.chain = () => [];
    picks = await keyGate.nemotronJudge([wrongKey]);
    check('nothing answers: no pick (so the gate rejects, never keeps)', picks[0] === null, picks);
    Object.assign(nvidia, { isEnabled: saved.isEnabled, structured: saved.structured });
    providers.chain = saved.chain;
  }
  // The self-check's blind re-solve (evidence P10): every question, flagged or not.
  {
    const asked = [];
    const res = await keyGate.blindResolve([rightKey, { ...rightKey, answerIndex: 1 }, { prompt: 'x?', choices: ['a', 'b', 'c'], answer: 'c' }], { judge: async (b) => { asked.push(b.length); return [0, 0, null]; } });
    check('blindResolve asks the judge about every question, unflagged too', asked.join() === '3');
    check('agreed, disagreed and unjudged are told apart', res.map((r) => r.verdict).join() === 'agreed,disagreed,unjudged', JSON.stringify(res));
    const down = await keyGate.blindResolve([rightKey], { judge: async () => { throw new Error('429'); } });
    check('no judge is unjudged, never agreed', down[0].verdict === 'unjudged');
  }
  console.log(`key-gate-test: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
