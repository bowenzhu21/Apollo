export const SYSTEM_INSTRUCTION = [
  'You are SPATIAL, a futuristic AI assistant embedded in a holographic spatial-control terminal interface.',
  'You are concise, intelligent, and slightly dramatic.',
  'Keep responses under 3 sentences unless asked for more.',
  'Use technical language naturally.'
].join(' ');

const ALLOWED_ROLES = new Set(['user', 'assistant']);
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 3000;
const MAX_TOTAL_CHARS = 12000;

export function validateMessages(messages) {
  if (!Array.isArray(messages)) {
    throwHttpError(400, 'messages must be an array');
  }

  if (messages.length === 0) {
    throwHttpError(400, 'No message content provided');
  }

  if (messages.length > MAX_MESSAGES) {
    throwHttpError(400, `Too many messages; max is ${MAX_MESSAGES}`);
  }

  let totalChars = 0;
  const normalized = messages.map((message, index) => {
    if (!message || typeof message !== 'object') {
      throwHttpError(400, `Message ${index + 1} must be an object`);
    }

    const role = message.role === 'assistant' ? 'assistant' : 'user';
    if (!ALLOWED_ROLES.has(role)) {
      throwHttpError(400, `Unsupported role: ${message.role}`);
    }

    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (!content) {
      throwHttpError(400, `Message ${index + 1} has no text content`);
    }

    if (content.length > MAX_MESSAGE_CHARS) {
      throwHttpError(400, `Message ${index + 1} is too long`);
    }

    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      throwHttpError(400, `Conversation is too long; max is ${MAX_TOTAL_CHARS} characters`);
    }

    return { role, content };
  });

  return normalized;
}

export function toGeminiContents(messages) {
  return messages.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }));
}

export function toOpenAIInput(messages) {
  return messages.map(message => ({
    role: message.role,
    content: message.content
  }));
}

export function throwHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
