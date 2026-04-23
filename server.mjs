import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModelReply } from './lib/model.mjs';
import { checkRateLimit } from './lib/rate-limit.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname);
const requestedPort = Number(process.env.PORT || 8000);

loadEnv();

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/chat') {
      const rateLimit = checkRateLimit(req.socket.remoteAddress);
      if (!rateLimit.allowed) {
        sendJson(res, 429, { error: 'Rate limit exceeded' });
        return;
      }
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
    sendJson(res, error.status || 500, {
      error: error.message || 'Internal server error'
    });
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
  console.log(`Spatial running at http://localhost:${activePort}`);
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
  const body = await readJson(req);
  const reply = await createModelReply({
    messages: body.messages,
    env: process.env
  });

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
        const error = new Error('Invalid JSON body');
        error.status = 400;
        rejectRequest(error);
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

  const pathParts = relativePath.split(/[\\/]/);
  if (relativePath.startsWith('..') || relativePath === '..' || pathParts.some(part => part.startsWith('.'))) {
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
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
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
