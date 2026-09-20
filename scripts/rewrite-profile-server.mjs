import { createServer } from 'node:http';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const host = '127.0.0.1';
const port = Number(process.env.PORTFOLIO_REWRITE_PROFILE_PORT || 11435);
const profilePath = process.env.PORTFOLIO_REWRITE_PROFILE
  || join(homedir(), '.local', 'share', 'portfolio-rewrite', 'rewrite-voice-profile.md');
const allowedOrigins = new Set([
  'https://basanta.space',
  'https://www.basanta.space',
  ...(process.env.PORTFOLIO_REWRITE_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
]);
const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
const marker = '<!-- portfolio-rewrite-profile:v1 -->';

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.has(origin) || localOrigin.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.url !== '/profile') { res.writeHead(404).end(); return; }
  try {
    if (req.method === 'GET') {
      try {
        const markdown = await readFile(profilePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' }).end(markdown);
      } catch (error) {
        if (error.code === 'ENOENT') res.writeHead(204).end();
        else throw error;
      }
      return;
    }
    if (req.method === 'PUT') {
      const markdown = await readBody(req);
      if (!markdown.startsWith(marker) || !markdown.includes('\n## Presentation instructions\n')) {
        res.writeHead(400).end('Invalid profile format.');
        return;
      }
      await mkdir(dirname(profilePath), { recursive: true, mode: 0o700 });
      const temporary = `${profilePath}.tmp`;
      await writeFile(temporary, markdown, { mode: 0o600 });
      await rename(temporary, profilePath);
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'DELETE') {
      try { await unlink(profilePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      res.writeHead(204).end();
      return;
    }
    res.writeHead(405).end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(error.message === 'too large' ? 413 : 500);
    res.end();
  }
});

server.listen(port, host, () => {
  console.log(`Rewrite profile service listening on http://${host}:${port}`);
  console.log(`Profile file: ${profilePath}`);
});
