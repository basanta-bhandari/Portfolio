import test from 'node:test';
import assert from 'node:assert/strict';
import { InputError, passwordInput, postInput, projectInput, sameOrigin, secureApi } from '../lib/security.js';
import { renderMarkdown } from '../blog/markdown.js';

function response() {
  return { headers: {}, code: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
}
const req = (body, extra = {}) => ({ method: 'POST', headers: { origin: 'https://www.basanta.cc', 'content-type': 'application/json', ...extra }, body });

test('write origins reject cross-site, opaque, sibling subdomain, and absent origins', () => {
  for (const origin of ['null', 'https://evil.example', 'https://media.basanta.cc', 'https://www.basanta.cc.evil.example', undefined]) {
    assert.equal(sameOrigin(req({}, { origin })), false);
  }
  assert.equal(sameOrigin(req({})), true);
  assert.equal(sameOrigin(req({}, { 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(sameOrigin(req({}, { origin: undefined, referer: 'https://www.basanta.cc/admin/' })), true);
});

test('API rejects bad origins before handler and sends private no-store responses', async () => {
  let calls = 0;
  const handler = secureApi(() => { calls++; });
  const res = response();
  await handler(req({}, { origin: 'https://evil.example' }), res);
  assert.equal(res.code, 403); assert.equal(calls, 0);
  assert.match(res.headers['Cache-Control'], /no-store/);
});

test('API rejects non-JSON, arrays, and oversized bodies', async () => {
  for (const [request, expected] of [[req({}, { 'content-type': 'text/plain' }), 415], [req([]), 400], [req({ data: 'x'.repeat(200) }), 413]]) {
    const res = response(); await secureApi(() => assert.fail('must not execute'), { maxBytes: 100 })(request, res);
    assert.equal(res.code, expected);
  }
});

test('public GET remains available and unexpected errors do not expose internals', async () => {
  const ok = response(); await secureApi((_, res) => res.json({ ok: true }))({ method: 'GET', headers: {} }, ok);
  assert.deepEqual(ok.body, { ok: true });
  const res = response(); await secureApi(() => { throw new Error('postgres://secret-password@db'); })({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 500); assert.doesNotMatch(JSON.stringify(res.body), /postgres|password/);
});

test('post fields enforce scalar text, bounded size, and safe slugs', () => {
  assert.equal(postInput({ title: ' A ', slug: 'hello-world', content: 'text' }).title, 'A');
  for (const body of [{ title: {}, slug: 'ok', content: 'text' }, { title: 'ok', slug: '../login', content: 'text' }, { title: 'ok', slug: 'ok', content: 'x'.repeat(1500001) }]) {
    assert.throws(() => postInput(body), InputError);
  }
  assert.deepEqual(postInput({ excerpt: '' }, true), { excerpt: '' });
});

test('passwords reject non-strings, huge input, and excessive UTF-8 bytes', () => {
  for (const value of [[], {}, null, 123, 'x'.repeat(1025), '🔐'.repeat(400)]) assert.throws(() => passwordInput(value), InputError);
});

test('new project category limits allow unchanged legacy categories only', () => {
  const body = { name: 'Project', subtitle: 'Description', additionalLinks: [], categories: ['A', 'B', 'C', 'D'] };
  assert.throws(() => projectInput(body), InputError);
  assert.equal(projectInput(body, { legacyCategories: body.categories }).categories.length, 4);
  assert.throws(() => projectInput({ ...body, categories: ['A', 'B', 'C', 'E'] }, { legacyCategories: body.categories }), InputError);
});

test('project links block script schemes and credential-bearing URLs', () => {
  const body = { name: 'Project', subtitle: 'Description', additionalLinks: [], categories: ['Web'] };
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.com/']) assert.throws(() => projectInput({ ...body, githubUrl: url }), InputError);
  assert.equal(projectInput({ ...body, additionalLinks: ['https://example.com'] }).additionalLinks[0], 'https://example.com/');
});

test('markdown escapes raw HTML, attributes, and entity-based injections', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n![" onerror="alert(1)](https://example.com/x.png)\n\n![x](https://example.com/"onload="alert)');
  assert.doesNotMatch(html, /<script|alt="" onerror=|src="[^\"]*"onload=/i);
  assert.match(html, /&quot; onerror=&quot;/);
  const entities = renderMarkdown('![x](https://example.com/&quot;onerror=&quot;x)');
  assert.match(entities, /&amp;quot;/);
});

test('markdown never interprets unsafe URL schemes or SVG data', () => {
  for (const text of ['[go](javascript:alert)', '[go](data:text/html,hi)', '![image](data:image/svg+xml;base64,PHN2Zz4=)']) {
    const html = renderMarkdown(text); assert.doesNotMatch(html, /<(a|img)\s/);
  }
});

test('formatting does not reprocess generated link and image attributes', () => {
  const html = renderMarkdown('![**x**](https://example.com/a*b.png)\n\n[**link**](https://example.com)');
  assert.match(html, /alt="\*\*x\*\*"/); assert.match(html, /a\*b.png/); assert.match(html, /<strong>link<\/strong>/);
});

test('markdown preserves paragraphs, lists, headings, code, and legacy raster data images', () => {
  const html = renderMarkdown('# Heading\n\n- One\n- Two\n\n```html\n<script>unsafe</script>\n```\n\n![x](data:image/png;base64,aGVsbG8=)');
  assert.match(html, /<h1>Heading<\/h1>/); assert.match(html, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
  assert.match(html, /<pre><code>&lt;script&gt;/); assert.match(html, /src="data:image\/png/);
});
