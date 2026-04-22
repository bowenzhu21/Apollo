import { fetchJsonWithTimeout } from './fetch-json.mjs';
import { SYSTEM_INSTRUCTION, toOpenAIInput } from './messages.mjs';

const DEFAULT_MODEL = 'gpt-5';

export async function createOpenAIReply({ messages, apiKey, model = DEFAULT_MODEL, timeoutMs }) {
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 500;
    throw error;
  }

  const { response, data } = await fetchJsonWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: SYSTEM_INSTRUCTION,
      input: toOpenAIInput(messages),
      max_output_tokens: 1000
    })
  }, timeoutMs);

  if (!response.ok) {
    const error = new Error(data.error?.message || 'OpenAI request failed');
    error.status = response.status;
    throw error;
  }

  const reply = data.output_text || extractOutputText(data);
  if (!reply) {
    const error = new Error('OpenAI returned an empty response');
    error.status = 502;
    throw error;
  }

  return reply.trim();
}

function extractOutputText(data) {
  return data.output
    ?.flatMap(item => item.content || [])
    ?.map(content => content.text || '')
    ?.join('')
    ?.trim();
}
