import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname);
const requestedPort = Number(process.env.PORT || 8000);
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

loadEnv();

const systemInstruction = [
  'You are GESTURAL, a futuristic AI assistant embedded in a holographic gesture-controlled terminal interface.',
  'You are concise, intelligent, and slightly dramatic.',
  'Keep responses under 3 sentences unless asked for more.',
  'Use technical language naturally.'
].join(' ');

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/chat') {
      await handleChat(req, res);
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

let activePort = requestedPort;
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && !process.env.PORT && activePort < requestedPort + 20) {
    activePort += 1;
    server.listen(activePort);
    return;
  }

  console.error(error);
  process.exit(1);
});

server.on('listening', () => {
  console.log(`Apollo running at http://localhost:${activePort}`);
});

server.listen(activePort);

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

async function handleChat(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, { error: 'GEMINI_API_KEY is missing from .env' });
    return;
  }

  const body = await readJson(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const contents = messages
    .filter(message => typeof message.content === 'string' && message.content.trim())
    .map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }));

  if (contents.length === 0) {
    sendJson(res, 400, { error: 'No message content provided' });
    return;
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
    sendJson(res, geminiResp.status, {
      error: data.error?.message || 'Gemini request failed'
    });
    return;
  }

  const reply = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim();

  if (!reply) {
    sendJson(res, 502, { error: 'Gemini returned an empty response' });
    return;
  }

  sendJson(res, 200, { reply });
}

function readJson(req) {
  return new Promise((resolveRequest, rejectRequest) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        rejectRequest(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolveRequest(raw ? JSON.parse(raw) : {});
      } catch {
        rejectRequest(new Error('Invalid JSON body'));
      }
    });
    req.on('error', rejectRequest);
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = normalize(join(root, requestedPath));
  const relativePath = relative(root, filePath);

  if (relativePath.startsWith('..') || relativePath === '..') {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType(filePath)
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(content);
    }
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}
