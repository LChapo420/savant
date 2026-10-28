/** Focused tests for Modelflare's isolated placement provider. */
process.env.MODELFLARE_API_KEY = 'test-modelflare-key';
process.env.MODELFLARE_BASE_URL = 'https://modelflare.test/v1';
process.env.MODELFLARE_MODEL_PLACEMENT = 'gpt-6.1-sol';
process.env.AI_PROVIDER_PLACEMENT = 'modelflare';

const providers = require('../services/providers');
const modelflare = providers.ALL.modelflare;

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

async function main() {
  check('Modelflare is the pinned placement provider',
    providers.order('placement').join(',') === 'modelflare', providers.order('placement'));
  check('placement selects the configured GPT Sol model',
    providers.current('placement') === modelflare && modelflare.modelFor('placement') === 'gpt-6.1-sol');
  check('Modelflare cannot answer non-placement work', !modelflare.isEnabled('fast'));
  check('Modelflare is not appended to general provider fallback routes',
    !providers.order('fast').includes('modelflare'));

  const requests = [];
  const realFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/models')) {
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'gpt-6.1-sol', name: 'GPT Sol 6.1' }] }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        model: 'gpt-6.1-sol',
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [{
              function: {
                name: 'submit_placement_questions',
                arguments: '{"grades":[{"grade_id":"g1","questions":[]}]}',
              },
            }],
          },
        }],
        usage: { prompt_tokens: 120, completion_tokens: 25 },
      }),
    };
  };

  try {
    const models = await modelflare.listModels();
    check('model listing returns the exact IDs available to this key',
      models.length === 1 && models[0].id === 'gpt-6.1-sol'
        && models[0].methods.includes('chat.completions'), models);
    check('model listing uses the documented endpoint and bearer authentication',
      requests[0].url === 'https://modelflare.test/v1/models'
        && requests[0].options.headers.Authorization === 'Bearer test-modelflare-key');

    const result = await modelflare.structured({
      role: 'placement',
      system: 'Write the placement questions.',
      user: 'Write grade g1.',
      schemaName: 'submit_placement_questions',
      schema: { type: 'object', properties: { grades: { type: 'array' } }, required: ['grades'] },
      maxTokens: 800,
    });
    const request = requests[1];
    const body = JSON.parse(request.options.body);
    check('structured output uses Modelflare chat completions with its configured model',
      request.url === 'https://modelflare.test/v1/chat/completions'
        && body.model === 'gpt-6.1-sol'
        && body.tools[0].function.name === 'submit_placement_questions');
    check('the request uses bearer auth and includes both prompts',
      request.options.headers.Authorization === 'Bearer test-modelflare-key'
        && body.messages.some((message) => message.role === 'system' && message.content === 'Write the placement questions.')
        && body.messages.some((message) => message.role === 'user' && message.content === 'Write grade g1.'));
    check('tool arguments and normalized token usage are returned',
      result.data.grades[0].grade_id === 'g1'
        && result.model === 'gpt-6.1-sol'
        && result.usage.input_tokens === 120
        && result.usage.output_tokens === 25, result);
  } finally {
    global.fetch = realFetch;
  }

  console.log(failures ? `\n${failures} Modelflare provider check(s) failed` : '\nall Modelflare provider checks passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});