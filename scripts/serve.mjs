/**
 * Minimal local server that emulates the Vercel layout:
 *   /            → public/index.html
 *   /api/<name>  → api/<name>.js default export
 *
 * Run: npm run serve  (then open http://localhost:3000)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

/** Adapt Node's req/res to the (req, res) shape Vercel functions expect. */
function makeRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  const type = req.headers['content-type'] ?? '';
  return type.includes('application/json') ? JSON.parse(raw) : raw;
}

const server = createServer(async (req, res) => {
  makeRes(res);
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice('/api/'.length).replace(/[^a-z0-9-]/gi, '');
    try {
      const mod = await import(pathToFileURL(join(ROOT, 'api', `${name}.js`)).href);
      req.body = await readBody(req);
      await mod.default(req, res);
    } catch (err) {
      res.status(500).json({ error: `Function ${name} crashed: ${err.message}` });
    }
    return;
  }

  const rel = url.pathname === '/' ? 'public/index.html' : normalize(join('public', url.pathname));
  const path = join(ROOT, rel);
  if (!path.startsWith(join(ROOT, 'public'))) {
    res.status(403).end('Forbidden');
    return;
  }
  try {
    const file = await readFile(path);
    res.setHeader('Content-Type', MIME[extname(path)] ?? 'application/octet-stream');
    res.end(file);
  } catch {
    res.status(404).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`chainova dev server → http://localhost:${PORT}`);
});
