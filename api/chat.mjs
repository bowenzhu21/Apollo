import { createGeminiReply } from '../lib/gemini.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJson(req);
    const reply = await createGeminiReply({
      messages: body.messages,
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL
    });

    sendJson(res, 200, { reply });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || 'Internal server error'
    });
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);

  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
