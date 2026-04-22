import { createGeminiReply } from './gemini.mjs';
import { createOpenAIReply } from './openai.mjs';
import { validateMessages } from './messages.mjs';

export async function createModelReply({ messages, env = process.env }) {
  const validatedMessages = validateMessages(messages);
  const provider = (env.MODEL_PROVIDER || env.AI_PROVIDER || 'gemini').toLowerCase();
  const timeoutMs = Number(env.MODEL_TIMEOUT_MS || 20000);

  if (provider === 'openai') {
    return createOpenAIReply({
      messages: validatedMessages,
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || 'gpt-5',
      timeoutMs
    });
  }

  if (provider === 'gemini') {
    return createGeminiReply({
      messages: validatedMessages,
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || 'gemini-2.5-flash',
      timeoutMs
    });
  }

  const error = new Error(`Unsupported MODEL_PROVIDER: ${provider}`);
  error.status = 500;
  throw error;
}
