const DEFAULT_MODEL = 'gemini-2.5-flash';

const systemInstruction = [
  'You are SPATIAL, a futuristic AI assistant embedded in a holographic spatial-control terminal interface.',
  'You are concise, intelligent, and slightly dramatic.',
  'Keep responses under 3 sentences unless asked for more.',
  'Use technical language naturally.'
].join(' ');

export async function createGeminiReply({ messages, apiKey, model = DEFAULT_MODEL }) {
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not configured');
    error.status = 500;
    throw error;
  }

  const contents = normalizeMessages(messages);
  if (contents.length === 0) {
    const error = new Error('No message content provided');
    error.status = 400;
    throw error;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const geminiResp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents,
      generationConfig: {
        maxOutputTokens: 1000
      }
    })
  });

  const data = await geminiResp.json();
  if (!geminiResp.ok) {
    const error = new Error(data.error?.message || 'Gemini request failed');
    error.status = geminiResp.status;
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

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(message => typeof message.content === 'string' && message.content.trim())
    .map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }));
}
