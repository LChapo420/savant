/**
 * Send one lesson prompt to the pinned lesson model and save the raw answer.
 *
 * Kept separate from the generator on purpose: this writes whatever came back,
 * whole or truncated, with nothing checked and nothing retried. The point is to
 * look at what the model actually said before anything decides it is usable —
 * `generate-base-lesson.js` is the version that enforces a contract, and a
 * contract enforced on a page nobody has read is a page nobody should ship.
 *
 *   node scripts/send-lesson-prompt.js english/proficient/105
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CREATOR = path.join(ROOT, '..', 'creator_files');
const MODEL = process.env.OPENROUTER_LESSON_MODEL || 'deepseek/deepseek-v4.1-flash';
const MAX_TOKENS = Number(process.env.LESSON_MAX_TOKENS || 90000);

require(path.join(ROOT, 'node_modules', 'dotenv')).config({ path: path.join(ROOT, '.env') });
const openrouter = require(path.join(ROOT, 'services', 'providers', 'openrouter'));
const { buildPrompt } = require(path.join(ROOT, 'scripts', 'lib', 'lesson-prompt-template'));

(async () => {
  const [trackId, gradeId, level] = process.argv[2].split('/');
  const { prompt, config } = buildPrompt(trackId, gradeId, Number(level));

  const promptFile = path.join(CREATOR, `prompt-filled-${level}.txt`);
  fs.writeFileSync(promptFile, prompt, 'utf8');
  console.log(`prompt: ${prompt.length.toLocaleString()} characters -> ${promptFile}`);
  console.log(`lesson: ${config.topic} (lesson ${config.sequence} of ${config.lessonCount},`
    + ` variant ${config.variant}, ${config.age.text})`);
  console.log(`sending to ${MODEL} with a ${MAX_TOKENS.toLocaleString()} token ceiling\n`);

  const started = Date.now();
  let deltas = 0;
  let lastReport = 0;
  const res = await openrouter.chatStream({
    role: 'deep',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: MAX_TOKENS,
    model: MODEL,
    onDelta: (text, full) => {
      deltas += 1;
      // Progress by content, not by frames, so the number means something.
      if (full.length - lastReport >= 5000) {
        lastReport = full.length;
        process.stdout.write(`  ${full.length.toLocaleString()} characters`
          + ` (${Math.round((Date.now() - started) / 1000)}s)\n`);
      }
    },
  });

  if (!res || !res.text || !res.text.trim()) {
    console.log('\nthe model reasoned and answered with nothing. That is a refusal, not a'
      + ' result — running this again is the fix.');
    process.exit(1);
  }

  const outFile = path.join(CREATOR, `base-lesson-${level}-output.html`);
  fs.writeFileSync(outFile, res.text, 'utf8');

  const g = require(path.join(ROOT, 'scripts', 'generate-base-lesson'));
  console.log(`\nserved by:  ${res.model}`);
  console.log(`tokens:     ${res.usage.input_tokens} in, ${res.usage.output_tokens} out`);
  console.log(`characters: ${res.text.length.toLocaleString()} in ${Math.round((Date.now() - started) / 1000)}s`
    + ` across ${deltas} chunks`);
  console.log(`written to: ${outFile}`);
  // Reported rather than enforced. This run's job was to produce the text, and a
  // reader deciding whether it is good enough is a different question from whether
  // it is well formed.
  console.log(`\nfor reading, not for shipping:`);
  console.log(`  cut off partway:  ${g.truncated(res.text) || 'no — it looks whole'}`);
  console.log(`  contract check:   ${g.inspect(res.text) || 'satisfied'}`);
})().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
