import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin connects, rewrites, and integrates two samples without restarting', async () => {
  const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
  const elements = new Map();
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], {
    value: '', options: [], dataset: {}, hidden: false, disabled: false, textContent: '',
    listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
    replaceChildren(...options) { this.options = options; this.value = options[0]?.value || ''; },
    scrollIntoView() {}, focus() {}, removeAttribute() {},
  });
  const el = id => { assert.ok(elements.has(id), `Missing UI element: ${id}`); return elements.get(id); };
  globalThis.document = { getElementById: el, createElement: () => ({}), querySelector: () => ({ value: 'balanced' }) };
  const saved = new Map();
  globalThis.localStorage = {
    getItem: key => saved.get(key),
    setItem: (key, value) => saved.set(key, value),
    removeItem: key => saved.delete(key),
  };
  el('rewriteRuntime').value = 'local';
  el('rewriteEndpoint').value = 'http://127.0.0.1:11434';
  let completionCount = 0;
  let storedProfile = '';
  globalThis.fetch = async (url, options = {}) => {
    if (url.startsWith('http://127.0.0.1:11435')) {
      if (options.method === 'PUT') storedProfile = options.body;
      if (options.method === 'DELETE') storedProfile = '';
      return { ok: true, status: storedProfile ? 200 : 204, text: async () => storedProfile };
    }
    return { ok: true, json: async () => url.endsWith('/models')
      ? { data: [{ id: 'example-3b' }] }
      : { choices: [{ message: { content: ++completionCount === 1 ? 'Revised draft.' : '- Use concrete examples.' }, finish_reason: 'stop' }] } };
  };
  await import('../admin/rewrite.js');
  await el('connectRewrite').listeners.click();
  assert.equal(el('rewriteModel').value, 'example-3b');
  el('rewriteInput').value = 'Original draft.';
  await el('rewriteBtn').listeners.click();
  assert.equal(el('rewriteOutput').value, 'Revised draft.');
  assert.equal(el('copyRewriteBtn').disabled, false);
  for (let count = 1; count <= 2; count++) {
    el('addSampleBtn').listeners.click();
    el('writingSample').value = 'Some natural writing about my computer and the things I learned while setting it up. '.repeat(3);
    await el('testSampleBtn').listeners.click();
    assert.equal(el('sampleConfirm').hidden, false);
    assert.equal(el('integrateSampleBtn').disabled, false);
    await el('integrateSampleBtn').listeners.click();
    assert.match(storedProfile, new RegExp(`Approved samples: ${count}`));
    assert.equal(el('rewriteBtn').disabled, false);
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  globalThis.Worker = class {
    terminate() {}
    postMessage(message) {
      queueMicrotask(() => this.onmessage({ data: { id: message.id, ok: true, text: 'CPU fallback edit.' } }));
    }
  };
  el('rewriteRuntime').value = 'gpu';
  el('rewriteRuntime').listeners.change();
  await el('rewriteBtn').listeners.click();
  assert.equal(el('rewriteRuntime').value, 'cpu');
  assert.equal(el('rewriteOutput').value, 'CPU fallback edit.');
});
