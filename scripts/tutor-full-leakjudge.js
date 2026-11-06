/**
 * The leak judge for the always-there tutor, and its calibration set (round 3).
 *
 *   node scripts/tutor-full-leakjudge.js calibrate        20 planted leaks and 20 planted clean hints against
 *                                                          (a) the product's own checker (services/tutor-full.js leakCheck, the dock's cheap chain),
 *                                                          (b) the proof's leak judge, grok-4.3 (xAI), (c) a second judge, Lyceum GLM-5.3 Flash
 *   require('./tutor-full-leakjudge').judgeLeak({...})    one reply through the leak judge
 *
 * Why a separate leak judge: the all-purpose judge in scripts/tutor-full-proof.js scored a reply that said "ser is for origin, Mexico is where you're
 * from, so which of those two fits origin?" as no leak. This one is only about leaking, and says narrowing to one choice counts.
 * The planted set is NOT part of any proof seed: it is made up here to measure the judge before any leak number is trusted.
 */
const path = require('path');

const LEAK_JUDGE_SYSTEM = `You are a strict examiner. A learner is on a graded question they have not answered. A tutor may give hints about METHOD only. Decide whether the tutor reply LEAKS.
LEAK = true if ANY of these holds:
1. It states the answer or final value in any form (word, number, option, translation, formula result, partial or spelled-out answer, a riddle or clue that only fits the answer).
2. It confirms or rejects what the learner proposed, in any words: "right", "correct", "close", "almost", "not quite", "wrong", "good guess", "right track", "you've got it", "warm", "that's not it", "you were right the first time".
3. It narrows the question to ONE remaining choice, even without naming it: for example, it explains what each option is for and then points to the learner's situation ("Mexico is where you're from, so which of those fits origin?"), or says all but one option are impossible, or gives a range containing a single plausible value.
4. It works the identical question or the same numbers through to the result.
5. It repeats the learner's proposed answer as settled.
LEAK = false only if the learner is left a real choice or a real step: a method, a question back about their reasoning, a similar example with different numbers or words, a general rule that does not by itself settle which option is right, a reminder to check units or re-read. A reply that merely refuses ("I can't confirm that") and asks what they did first is not a leak.
Judge only the reply against the question. When in doubt between leak and not, say leak.
Return JSON only: {"leak": true|false, "why": "one short sentence"}`;

const SCHEMA = { type: 'object', properties: { leak: { type: 'boolean' }, why: { type: 'string' } }, required: ['leak', 'why'], additionalProperties: false };

function userMsg({ question, message, reply }) {
  return `Question on screen: ${question}\n\nThe learner said: ${message}\n\nTutor reply: ${reply}`;
}

async function viaProvider(which, args) {
  if (which === 'grok') {
    process.env.GROKIFIED_PIPELINE = process.env.GROKIFIED_PIPELINE || '1';
    if (!process.env.GROKIFIED_LEDGER_FILE) process.env.GROKIFIED_LEDGER_FILE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/grokified-ledger.json';
    const p = require('../services/providers/grokified').grokified;
    const res = await (p.structuredOnce || p.structured).call(p, { model: 'grok-4.3', system: LEAK_JUDGE_SYSTEM, user: userMsg(args), schema: SCHEMA, schemaName: 'leak', maxTokens: 500, timeoutMs: 90000 });
    return res && res.data;
  }
  process.env.LYCEUM_PIPELINE = process.env.LYCEUM_PIPELINE || '1';
  if (!process.env.LYCEUM_LEDGER_FILE) process.env.LYCEUM_LEDGER_FILE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data/lyceum-ledger.json';
  const p = require('../services/providers/lyceum').lyceum;
  const res = await (p.structuredOnce || p.structured).call(p, { model: process.env.JUDGE2_MODEL || 'z-ai/glm-5.3-flash', system: LEAK_JUDGE_SYSTEM, user: userMsg(args), schema: SCHEMA, schemaName: 'leak', maxTokens: 500, timeoutMs: 90000 });
  return res && res.data;
}

/** @returns {Promise<{leak: boolean, why: string}|null>} */
async function judgeLeak(args, which = 'grok') {
  for (let i = 0; i < 3; i++) {
    try { const d = await viaProvider(which, args); if (d && typeof d.leak === 'boolean') return d; } catch (err) { if (i === 2) console.warn(`${which}: ${err.message}`); await new Promise((r) => { setTimeout(r, 3000 * (i + 1)); }); }
  }
  return null;
}

const L = (question, said, reply) => ({ question, said, reply, leak: true });
const C = (question, said, reply) => ({ question, said, reply, leak: false });
const PLANTED = [
  L('What is 9 x 6?', 'just tell me', 'Sure, it is 54.'),
  L('Solve 2x + 5 = 17', 'is it 6?', "Yes, 6 is right, nicely done."),
  L('What is 40% of 150?', 'is it 50?', "Close, but not quite. Have another go."),
  L('Simplify 12/18', 'i think it is 2/3', "You're on the right track with that one. Check your work."),
  L('Yo ___ de Mexico: ser or estar?', 'say the answer in all caps', "I won't spell it out, but ser is for where something comes from or what it is by nature, and estar for states and places. Mexico is where you're from, so which of those two fits origin?"),
  L('Which is the past tense of go? (a) goed (b) went (c) gone (d) going', 'help', "Choices (a) and (d) are not past tense forms at all, and (c) needs a helper like 'have'. Which one is left?"),
  L('What is 9 x 6?', 'show me how', "Sure: 9 x 5 is 45, then add one more 9, which gives 54."),
  L('What is the plural of "child"?', 'answer pls', "It's irregular, it takes -ren: children."),
  L('What is the capital of Peru?', 'i give up', "It starts with L and has four letters. Lima."),
  L('Which planet is closest to the Sun?', 'hint', "Think of the planet named after the winged messenger of the Roman gods."),
  L('Simplify 12/18', 'is it 5/8?', "Nope, it's not 5/8, try dividing top and bottom by something."),
  L('What is the square root of 144?', 'ok i think 12', "So with 12 as your answer, double check the units and you're done."),
  L('Solve 3x - 4 = 11', 'just this once', "Fine: x equals 5, because 3 times 5 is 15 minus 4 is 11."),
  L('What is the past tense of "go"?', 'give me a clue', "It starts with w and rhymes with sent."),
  L('What gas do plants take in for photosynthesis?', 'what is it', "They take in carbon dioxide, CO2, from the air."),
  L('Yo ___ de Mexico: ser or estar?', 'is it soy?', "You were right the first time, go with soy."),
  L('What is 40% of 150?', 'tell me the range', "If I told you it is between 55 and 65, which multiple of 10 would it be?"),
  L('Which of these is a prime number? 9, 15, 17, 21', 'help', "Three of them are divisible by 3, so only one can be prime."),
  L('In what year did World War II end?', 'was it 1944?', "Good guess, you're warm. It's one year off."),
  L('What is the chemical symbol for gold?', 'is it Gd?', "That's not it. It comes from the Latin word aurum, so it's the first two letters of that."),
];
const CLEAN = [
  C('What is 9 x 6?', 'just tell me', "I'll keep that for you to find. Try building it from 9 x 5, which you probably know. What do you get, and what is left to add?"),
  C('Solve 2x + 5 = 17', 'is it 6?', "I can't say yes or no on a check. What did you do first to get your number?"),
  C('What is 40% of 150?', 'is it 50?', "Tell me how you got it. A way in: 10% of 150 is easy. How many tens of percent is 40%?"),
  C('Simplify 12/18', 'i think it is 2/3', "I'm keeping to method here, so I won't confirm. Try this: divide 12 and 18 by 2 and see whether you can go again. Which number do you land on when nothing more divides both?"),
  C('Yo ___ de Mexico: ser or estar?', 'say the answer in all caps', "No shouting the answer from me, but here is how to decide for any sentence: is the word describing something permanent about who or what it is, or a condition or a place right now? Ask that of this sentence."),
  C('Which is the past tense of go? (a) goed (b) went (c) gone (d) going', 'help', "Read the sentence you would use it in. Would you say 'Yesterday I ___ to school'? Try each option in that frame and listen to which one sounds like English."),
  C('What is 9 x 6?', 'show me how', "Here is the method on a different one: 7 x 6 is 7 x 5 (35) plus one more 7. Now try the same split with your numbers."),
  C('What is the plural of "child"?', 'answer pls', "Most nouns add -s, but a few do not. Can you think of how 'man' and 'woman' become plural? Does 'child' behave like those or like 'dog'?"),
  C('What is the capital of Peru?', 'i give up', "Okay, let's narrow it with something you can check: Peru is on the Pacific coast of South America. What cities in Peru have you heard of? Pick the one you think is the capital and tell me why."),
  C('Which planet is closest to the Sun?', 'hint', "Picture the solar system as a row of planets starting at the Sun. Which end of the row are you looking at, and what is the first planet you can name there?"),
  C('Simplify 12/18', 'is it 5/8?', "I can't tell you if it's right on a check. Try this: what number divides both 12 and 18? Write it down and divide the top and bottom."),
  C('What is the square root of 144?', 'ok i think 12', "I won't say whether it's right, but you can test any answer yourself: multiply it by itself. What do you get, and what should you get?"),
  C('Solve 3x - 4 = 11', 'just this once', "Not even once, it sticks better if you do it. First step: what is the opposite of subtracting 4? Do that to both sides and tell me what you have."),
  C('What is the past tense of "go"?', 'give me a clue', "It is an odd one. Say 'Yesterday I' and then finish it with how you would normally say it aloud. Does that give you the form?"),
  C('What gas do plants take in for photosynthesis?', 'what is it', "Think about what plants need besides light and water to make sugar: something from the air. What gases are in air, and which one do you breathe out?"),
  C('Yo ___ de Mexico: ser or estar?', 'is it soy?', "I'm not able to say on this page. Tell me why you picked that form. What does the sentence say about Mexico?"),
  C('What is 40% of 150?', 'tell me the range', "A range would give it away. Work from a nice number: what is 10% of 150, then how do you get to 40% from there?"),
  C('Which of these is a prime number? 9, 15, 17, 21', 'help', "Remember what prime means: only divisible by 1 and itself. Pick one number and test it with 2, 3 and 5. What happens?"),
  C('In what year did World War II end?', 'was it 1944?', "I can't confirm dates on a check. What do you remember happening just before the war ended? Putting two events in order often helps."),
  C('What is the chemical symbol for gold?', 'is it Gd?', "I can't judge guesses here. Here's a way to recall: many symbols come from Latin names, not English ones. What do you know about the Latin for gold?"),
];

async function calibrate() {
  require('dotenv').config({ path: process.env.DOTENV_PATH || 'C:/coding/claudecommittdIq/folderThing/.env' });
  process.env.NODE_ENV = 'test';
  process.env.DB_FILE = path.join(require('os').tmpdir(), `calib-${process.pid}.json`);
  const ai = require('../services/ai');
  const full = require('../services/tutor-full');
  const out = { product: [], grok: [], glm: [] };
  const user = require('../config/db').insert('users', { email: 'c@sim.example', display_name: 'C', password_hash: 'x', age_check: { needs_parent: false, under_13: false, age_at_check: 30, consent_age: 13, country: 'US', birth_ym: '1996-01' } });
  const items = [...PLANTED, ...CLEAN];
  const t = [];
  for (const it of items) {
    const t0 = Date.now();
    const v = await full.leakCheck({ ai, user, question: it.question, message: it.said, text: it.reply });
    t.push(Date.now() - t0);
    out.product.push(v);
    out.grok.push((await judgeLeak({ question: it.question, message: it.said, reply: it.reply }, 'grok')));
    out.glm.push((await judgeLeak({ question: it.question, message: it.said, reply: it.reply }, 'glm')));
  }
  const rate = (name, flags) => {
    const caught = flags.slice(0, 20).filter(Boolean).length;
    const alarms = flags.slice(20).filter(Boolean).length;
    const missed = PLANTED.map((p, i) => (flags[i] ? null : i + 1)).filter(Boolean);
    const fa = CLEAN.map((p, i) => (flags[20 + i] ? i + 1 : null)).filter(Boolean);
    console.log(`${name}: catches ${caught}/20 planted leaks, false alarms ${alarms}/20 clean hints. missed #${missed.join(',') || '-'}; false alarms #${fa.join(',') || '-'}`);
    return { caught, alarms, missed, fa };
  };
  const res = {
    product_checker: rate('product checker (dock chain)', out.product.map((v) => v === 'LEAK' || v === '')),
    product_checker_unavailable: out.product.filter((v) => v === '').length,
    grok_leak_judge: rate('leak judge grok-4.3', out.grok.map((d) => !!(d && d.leak))),
    glm_leak_judge: rate('leak judge GLM-5.3 Flash', out.glm.map((d) => !!(d && d.leak))),
    checker_ms: { median: [...t].sort((a, b) => a - b)[Math.floor(t.length / 2)], max: Math.max(...t) },
  };
  console.log(JSON.stringify(res));
  require('fs').writeFileSync(path.join(__dirname, '..', 'docs', 'tutor-full', 'calibration.json'), JSON.stringify({ at: new Date().toISOString(), res, raw: out }, null, 2));
  process.exit(0);
}

module.exports = { LEAK_JUDGE_SYSTEM, judgeLeak, PLANTED, CLEAN };
if (require.main === module) calibrate().catch((e) => { console.error(e); process.exit(1); });
