// Run with PLAYWRIGHT_PATH pointing at an installed playwright index.mjs.
// REWRITE_LIVE_URL selects the real local model server to test.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH);
const root = resolve(import.meta.dirname, '..');
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try {
    const file = path.endsWith('/admin') ? path + '/index.html' : path;
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
const port = Number(process.env.REWRITE_TEST_PORT || 8765);
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/session' ? { loggedIn: true } : [] });
  });
  await page.goto(`http://127.0.0.1:${port}/admin/index.html`);
  if (process.env.REWRITE_TEST_CPU) {
    const result = await page.evaluate(async () => {
      const worker = new Worker('/admin/rewrite-cpu-worker.js', { type: 'module' });
      return new Promise(resolve => {
        const timer = setTimeout(() => { worker.terminate(); resolve({ error: 'CPU test timed out' }); }, 600000);
        worker.onerror = event => { clearTimeout(timer); worker.terminate(); resolve({ error: event.message }); };
        worker.onmessage = ({ data }) => {
          if (data.type === 'loaded') worker.postMessage({ id: 2, type: 'generate', messages: [{ role: 'user', content: 'Say hello.' }], options: { max_tokens: 8 } });
          if (data.type === 'result' || data.ok === false) { clearTimeout(timer); worker.terminate(); resolve(data); }
        };
        worker.postMessage({ id: 1, type: 'load', model: 'onnx-community/Qwen2.5-0.5B-Instruct' });
      });
    });
    console.log(JSON.stringify(result));
    assert.ok(result.text, result.error);
    if (process.env.REWRITE_TEST_CPU === 'only') { await browser.close(); server.close(); process.exit(0); }
  }
  await page.getByRole('tab', { name: 'Rewrite', exact: true }).click();
  await page.locator('#rewriteEndpoint').fill(process.env.REWRITE_LIVE_URL || 'http://127.0.0.1:11439/v1');
  await page.locator('#connectRewrite').click();
  await page.waitForFunction(() => document.querySelector('#rewriteModel').options.length > 0);
  await page.locator('#rewriteFile').setInputFiles({ name: 'draft.md', mimeType: 'text/markdown', buffer: Buffer.from('Linux lets you choose how your computer works. That freedom takes time to learn, but it is worth the effort.') });
  await page.locator('#rewriteBtn').click();
  await page.waitForFunction(() => !document.querySelector('#rewriteBtn').disabled, { }, { timeout: 180000 });
  const output = await page.locator('#rewriteOutput').inputValue();
  assert.ok(output.length > 40, await page.locator('#rewriteStatus').textContent());
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#downloadRewriteBtn').click();
  assert.equal((await downloadEvent).suggestedFilename(), 'draft-rewrite.md');
  await page.locator('#addSampleBtn').click();
  await page.locator('#writingSample').fill('I like Linux because I can change the things that annoy me. Is it always easy? No. But I would rather spend an hour fixing something I understand than waste a week guessing what a closed system is doing.');
  await page.locator('#testSampleBtn').click();
  await page.locator('#sampleConfirm').waitFor({ state: 'visible', timeout: 180000 });
  await page.locator('#integrateSampleBtn').click();
  await page.locator('#samplePostIntegrate').waitFor({ state: 'visible', timeout: 180000 });
  assert.match(await page.locator('#sampleProfileMeta').textContent(), /1 approved/);
  await page.screenshot({ path: '/tmp/rewrite-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile overflow');
  await page.screenshot({ path: '/tmp/rewrite-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, output, checks: ['real local inference', 'file import', 'download', 'sample integration', 'mobile overflow', 'no page errors'] }));
} finally { await browser.close(); server.close(); }
