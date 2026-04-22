import { fetchJsonWithTimeout } from './fetch-json.mjs';
import { SYSTEM_INSTRUCTION, toGeminiContents } from './messages.mjs';

export async function createGeminiReply({ messages, apiKey, model = 'gemini-2.5-flash', timeoutMs }) {
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not configured');
    error.status = 500;
    throw error;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const { response, data } = await fetchJsonWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents: toGeminiContents(messages),
      generationConfig: {
        maxOutputTokens: 1000
      }
    })
  }, timeoutMs);

  if (!response.ok) {
    const error = new Error(data.error?.message || 'Gemini request failed');
    error.status = response.status;
    throw error;
  }

  const reply = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim();

  if (!reply) {
    const error = new Error('Gemini returned an empty response');
    error.status = 502;
    throw error;
  }

  return reply;
}
