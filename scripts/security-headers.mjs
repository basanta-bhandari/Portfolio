import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const pages = ['index.html', 'projects/index.html', 'blog/index.html', 'blog/post.html', 'login/index.html', 'admin/index.html', 'stats/index.html', 'tether/index.html'];
const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
const baseline = "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'";
const headers = [{ source: '/(.*)', headers: [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
  { key: 'Content-Security-Policy', value: baseline }
] }];

for (const page of pages) {
  const html = await readFile(new URL(page, root), 'utf8');
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/i.test(match[1]) && match[2].trim())
    .map(match => `'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  const policy = [
    "default-src 'self'", `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'", "img-src 'self' https: data: blob:",
    "font-src 'self'", "connect-src 'self' https://api.github.com https://*.workers.dev http://127.0.0.1:* http://localhost:*",
    "frame-src 'self'", baseline
  ].join('; ');
  const paths = page === 'index.html' ? ['/', '/index.html']
    : page.endsWith('/index.html') ? [`/${page}`, `/${page.slice(0, -11)}`, `/${page.slice(0, -10)}`]
    : [`/${page}`];
  for (const source of paths) headers.push({ source, headers: [{ key: 'Content-Security-Policy', value: policy }] });
}
headers.push({ source: '/api/(.*)', headers: [
  { key: 'Cache-Control', value: 'private, no-store' }, { key: 'CDN-Cache-Control', value: 'no-store' }
] });
for (const source of ['/admin', '/admin/(.*)', '/login', '/login/(.*)']) {
  headers.push({ source, headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] });
}
if (process.argv.includes('--check')) {
  if (JSON.stringify(config.headers) !== JSON.stringify(headers)) {
    console.error('Security headers are stale. Run node scripts/security-headers.mjs after editing page scripts.');
    process.exitCode = 1;
  }
} else {
  config.headers = headers;
  await writeFile(new URL('vercel.json', root), `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Generated security headers for ${pages.length} pages (${fileURLToPath(root)}).`);
}
