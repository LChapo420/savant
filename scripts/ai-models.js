/**
 * Print the models the configured key can actually reach.
 *
 *   npm run ai:models
 *
 * Model ids move: providers rename, retire, and gate them per account and per
 * tier. Rather than guessing a string and getting a 404 mid-session, ask.
 */
const fs = require('fs');
const path = require('path');
const here = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: fs.existsSync(here) ? here : path.join(__dirname, '..', '..', '.env') });

const providers = require('../services/providers');
const role = process.argv.includes('--placement') ? 'placement' : 'fast';

(async () => {
  const provider = providers.current(role);
  if (!provider) {
    const selected = providers.ALL[providers.order(role)[0]];
    if (selected && selected.isConfigured && !selected.isConfigured()) {
      console.log(`Provider "${selected.name}" selected for ${role}, but its API key is not set.`);
      process.exit(1);
    }
    console.log('No AI provider configured. Set OPENROUTER_API_KEY (or MIMO_API_KEY) in .env.');
    console.log('The site runs without one — only the coach and AI analysis need a model.');
    process.exit(0);
  }
  if (!provider.isEnabled()) {
    console.log(`Provider "${provider.name}" selected but its API key is not set.`);
    process.exit(1);
  }
  if (typeof provider.listModels !== 'function') {
    console.log(`Provider "${provider.name}" does not expose a model list.`);
    console.log(`Currently configured: ${role}=${provider.modelFor(role)}`);
    process.exit(0);
  }

  console.log(`provider: ${provider.name}`);
  console.log(`configured: ${role}=${provider.modelFor(role)}\n`);

  let models;
  try {
    models = await provider.listModels();
  } catch (err) {
    console.error(`Could not list models: ${err.message}`);
    process.exit(1);
  }

  const usable = models.filter((m) => !m.methods.length
    || m.methods.includes('generateContent')
    || m.methods.includes('chat.completions'));
  console.log(`${usable.length} model${usable.length === 1 ? '' : 's'} available for ${role === 'placement' ? 'chat completion' : 'generation'}:\n`);
  for (const m of usable) {
    const configured = provider.modelFor(role) === m.id;
    console.log(`  ${configured ? '*' : ' '} ${m.id.padEnd(38)} ${m.display || ''}`);
  }
  console.log(`\n* = currently configured for ${role}. Change it with that provider's model variable in .env.`);
})();
