/**
 * Is the fact key pasted in and working?
 *
 *   node scripts/check-fact-key.js
 *
 * Reads FACT_CHECK_ANTHROPIC_KEY (and FACT_CHECK_ANTHROPIC_WORKSPACE) from .env —
 * this folder's, or the one above it, where the server reads it — and makes one
 * tiny call, a fraction of a cent. Never prints the key.
 */
const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');
const here = path.join(__dirname, '..', '.env');
const envFile = fs.existsSync(here) ? here : path.join(__dirname, '..', '..', '.env');
dotenv.config({ path: envFile });

const factReader = require('../services/fact-check-anthropic');

(async () => {
  const key = String(process.env.FACT_CHECK_ANTHROPIC_KEY || '').trim();
  if (!key) {
    console.log(`No key yet. Add this line to ${envFile}:\n  FACT_CHECK_ANTHROPIC_KEY=sk-ant-...`);
    process.exitCode = 1;
    return;
  }
  if (!/^sk-ant-/.test(key)) console.log('Note: the key does not start with "sk-ant-"; Anthropic keys usually do.');
  if (!factReader.isReady()) {
    console.log('The key is there, but the Anthropic SDK is not installed (@anthropic-ai/sdk).');
    process.exitCode = 1;
    return;
  }
  const model = factReader.model();
  try {
    const text = await factReader.ping();
    console.log(`The key works: ${model} answered "${text}"${factReader.workspace() ? ` (workspace ${factReader.workspace()})` : ''}.`);
    console.log(process.env.BLOCK_FACT_GATE === '0'
      ? 'Verification is OFF (BLOCK_FACT_GATE=0): lessons are served without it.'
      : 'Every lesson is now researched and verified before it is served; lessons written before are verified the first time they are opened (or all at once: node scripts/verify-lessons.js --save).');
  } catch (err) {
    const why = String(err.message || err).slice(0, 400);
    console.log(`The key did not work (${err.status || 'no status'}): ${why}`);
    if (/workspace/i.test(why)) {
      console.log(`\nThis key belongs to the whole organization, not one workspace, so it has to say which workspace to use. Add a line to ${envFile}:`);
      console.log('  FACT_CHECK_ANTHROPIC_WORKSPACE=wrkspc_...');
      console.log('The ID is at console.anthropic.com > Settings > Workspaces: open the workspace to use and copy its ID (it starts with "wrkspc_").');
      console.log('Or make a new key inside one workspace (Settings > API keys, choose the workspace), and paste that one instead.');
    } else if (/credit|billing|balance/i.test(why)) {
      console.log('That is about credit: check the balance at console.anthropic.com > Billing.');
    } else if (err.status === 401) {
      console.log('401 means the key itself was refused: copy it again from console.anthropic.com > API keys.');
    } else if (err.status === 404) {
      console.log(`404: the model "${model}" is not available to this key. FACT_CHECK_MODEL in .env picks another.`);
    }
    process.exitCode = 1;
  }
})();
