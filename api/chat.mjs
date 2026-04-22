import { createModelReply } from '../lib/model.mjs';
import { checkRateLimit } from '../lib/rate-limit.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const rateLimit = checkRateLimit(getClientKey(req));
    if (!rateLimit.allowed) {
      sendJson(res, 429, { error: 'Rate limit exceeded' });
      return;
    }

    const body = await readJson(req);
    const reply = await createModelReply({
      messages: body.messages,
      env: process.env
    });

    sendJson(res, 200, { reply });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || 'Internal server error'
    });
  }
}

function getClientKey(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'anonymous';
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return parseJson(req.body);

  const raw = await readRawBody(req);
  return raw ? parseJson(raw) : {};
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body');
    error.status = 400;
    throw error;
  }
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
