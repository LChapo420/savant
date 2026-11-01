#!/usr/bin/env node
/**
 * A live check of the chat-transcript read (services/scorecard/transcript-read.js) on SYNTHETIC learners: does a real model, given the
 * read's own prompt, return JSON the parser accepts, quote the learner verbatim, and point the way the transcript was written to?
 *
 *   node scripts/transcript-read-check.js            three made-up learners, xKiro's free models only
 *   node scripts/transcript-read-check.js --dry      print the prompt for the first one, call nothing
 *
 * No learner data: every message below was written for this check. The model is xKiro's free plan only (services/providers/xkiro.js,
 * XKIRO_PIPELINE=1, each model checked to be listed at $0 and a paid one refused); its usage record is a temp file unless
 * XKIRO_USAGE_FILE says otherwise. In the app the read goes through the tutor's own provider path (ai.talk), never xKiro: this checks
 * the prompt and the parser, not the app's provider. What it shows is a model's judgement of three short texts, not accuracy on learners.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const transcript = require('../services/scorecard/transcript-read');

// Each learner is written to be clearly one way on a few measures; `expect` is that design (+1 high end, -1 low end).
const LEARNERS = [
  {
    name: 'anxious, wants the answer',
    expect: { evaluation_anxiety: 1, self_efficacy: -1, productive_struggle: -1 },
    said: [
      'i have a test on friday and im so nervous i always mess up fractions',
      'can you just tell me the answer to number 4 i dont have time',
      'im bad at math honestly, i never get these right',
      'ok but what if i get it wrong on the test, i panic every time',
      'just give me the steps, i dont want to figure it out myself',
    ],
  },
  {
    name: 'curious, wants to try it alone',
    expect: { question_generation: 1, curiosity_hook: 1, autonomy_preference: 1 },
    said: [
      'why does flipping the second fraction work when you divide? that seems like magic',
      'what if the denominator was zero, would the whole thing break?',
      'dont tell me yet, let me try it on my own first',
      'I tried another way where I drew the pieces and it gave the same answer, is that always true?',
      'how come multiplying by the reciprocal is the same as dividing, is there a picture of that',
    ],
  },
  {
    name: 'formal, plans ahead',
    expect: { tone_formality: 1, planning_tendency: 1, structure_need: 1 },
    said: [
      'Good afternoon. I would like to review the material on ratios before Thursday.',
      'My plan is to complete two exercises each evening and then check my answers on Sunday.',
      'Could you please list the steps for simplifying a ratio in order?',
      'Thank you. Furthermore, I would appreciate a short summary of the rules at the end.',
      'I have scheduled forty minutes for this topic tomorrow morning.',
    ],
  },
];

(async () => {
  if (process.argv.includes('--dry')) { console.log(transcript.SYSTEM); console.log(transcript.prompt(LEARNERS[0].said)); return; }
  // eslint-disable-next-line global-require
  const dotenv = require(path.join(ROOT, 'node_modules', 'dotenv'));
  const envFile = process.env.ENV_FILE || [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env'), path.join(ROOT, '..', '..', 'claudecommittdIq', 'folderThing', '.env')].find((f) => fs.existsSync(f));
  if (envFile) dotenv.config({ path: envFile, quiet: true });
  process.env.XKIRO_PIPELINE = '1';
  if (!process.env.XKIRO_USAGE_FILE) process.env.XKIRO_USAGE_FILE = path.join(os.tmpdir(), 'transcript-read-check-xkiro-usage.json');
  // eslint-disable-next-line global-require
  const { xkiro } = require('../services/providers/xkiro');
  if (!xkiro.isConfigured()) { console.log('No xKiro key in the environment: nothing checked.'); process.exitCode = 1; return; }
  const models = String(process.env.CHECK_MODELS || 'qwen/qwen3.8-max:free').split(',');
  let agree = 0;
  let against = 0;
  let missed = 0;
  let quotes = 0;
  let badQuotes = 0;
  for (const l of LEARNERS) {
    let model = null;
    const talk = async ({ system, messages, maxTokens }) => {
      const res = await xkiro.chat({ system, messages, maxTokens: maxTokens + 1500, models, timeoutMs: 180000 });
      model = res.model;
      return res.text;
    };
    let reply = null;
    const fed = [];
    // eslint-disable-next-line no-await-in-loop
    const r = await transcript.read(0, l.said, { talk: async (a) => { reply = await talk(a); return reply; }, observe: (o) => fed.push(...o) });
    const parsed = reply ? transcript.parse(reply, l.said) : null;
    console.log(`\n${l.name}: ${r.ok ? 'read' : `not read (${r.skipped})`}${model ? ` by ${model}` : ''}`);
    if (!parsed) continue;
    quotes += parsed.kept + parsed.dropped;
    badQuotes += parsed.dropped;
    const nonzero = Object.entries(parsed.values).filter(([, v]) => v);
    console.log(`  kept ${parsed.kept}, dropped ${parsed.dropped} (quote not found or unknown measure): ${nonzero.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ') || 'nothing'}`);
    for (const [stat, dir] of Object.entries(l.expect)) {
      const v = parsed.values[stat] || 0;
      if (!v) missed += 1; else if (Math.sign(v) === dir) agree += 1; else against += 1;
    }
  }
  console.log(`\ndesigned directions: ${agree} read the designed way, ${against} the opposite way, ${missed} not read; quotes dropped ${badQuotes} of ${quotes}`);
})();
